<?php
/**
 * EmlakRadar Pro — VPS Webhook Alıcısı v2
 * HMAC-SHA256 imza doğrulama + IP whitelist + 4 olay tipi
 */
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

// ── IP Whitelist ──────────────────────────────────────────────────────────
$allowedIps = defined('VPS_ALLOWED_IPS') && VPS_ALLOWED_IPS
    ? array_map('trim', explode(',', VPS_ALLOWED_IPS))
    : [];

if (!empty($allowedIps)) {
    $clientIp = $_SERVER['HTTP_X_FORWARDED_FOR']
        ? trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0])
        : ($_SERVER['REMOTE_ADDR'] ?? '');

    if (!in_array($clientIp, $allowedIps, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'IP yetkisiz.']);
        exit;
    }
}

// ── Sadece POST ───────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST gerekli.']);
    exit;
}

// ── Ham payload ───────────────────────────────────────────────────────────
$rawBody = file_get_contents('php://input');
if (!$rawBody) {
    http_response_code(400);
    echo json_encode(['error' => 'Boş payload.']);
    exit;
}

// ── HMAC-SHA256 İmza Doğrulama ────────────────────────────────────────────
$receivedSig = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';
$secret      = defined('VPS_WEBHOOK_SECRET') ? VPS_WEBHOOK_SECRET : '';

if ($secret) {
    $expectedSig = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
    if (!hash_equals($expectedSig, $receivedSig)) {
        http_response_code(403);
        echo json_encode(['error' => 'Geçersiz imza.']);
        exit;
    }
}

// ── Payload ayrıştır ──────────────────────────────────────────────────────
$payload = json_decode($rawBody, true);
if (!$payload || !isset($payload['tip'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Geçersiz JSON payload.']);
    exit;
}

$tip    = $payload['tip'];    // yeni_ilan | guncelleme | silindi | fiyat_degisiklik | sahte_ilan
$kaynak = $payload['kaynak'] ?? 'unknown';
$zaman  = $payload['zaman']  ?? date('c');

// ── Modeller ──────────────────────────────────────────────────────────────
$ilanModel    = new Ilan();
$bildirimModel = new Bildirim();
$pdo          = db();

// ── Olay Tipi İşleyicileri ────────────────────────────────────────────────
switch ($tip) {

    // ── YENİ İLAN: toplu liste ─────────────────────────────────────────
    case 'yeni_ilan':
        $ilanlar = $payload['ilanlar'] ?? [];
        if (empty($ilanlar)) {
            jsonResponse(true, ['eklenen' => 0], 'Veri yok.');
        }

        $eklenen  = 0;
        $atilan   = 0;
        $errors   = [];

        foreach ($ilanlar as $i) {
            try {
                // Mükerrer kontrol
                $mevcut_id = null;
                if (!empty($i['kaynak_url'])) {
                    $stmt = $pdo->prepare("SELECT id, fotograflar FROM ilanlar WHERE kaynak_url = ? LIMIT 1");
                    $stmt->execute([$i['kaynak_url']]);
                    $mevcut_row = $stmt->fetch(PDO::FETCH_ASSOC);
                    if ($mevcut_row) $mevcut_id = $mevcut_row['id'];
                }
                if (!$mevcut_id && !empty($i['kaynak_id'])) {
                    $stmt = $pdo->prepare("SELECT id, fotograflar FROM ilanlar WHERE kaynak_id = ? AND kaynak_site = ? LIMIT 1");
                    $stmt->execute([$i['kaynak_id'], $i['kaynak_site'] ?? '']);
                    $mevcut_row = $stmt->fetch(PDO::FETCH_ASSOC);
                    if ($mevcut_row) $mevcut_id = $mevcut_row['id'];
                }
                if ($mevcut_id) {
                    // Mevcut ilanın fotoğrafları kırık mı kontrol et
                    $mevcutFotos = json_decode($mevcut_row['fotograflar'] ?? '[]', true) ?: [];
                    $uploadDir   = dirname(__DIR__) . '/uploads/fotograflar/';
                    $fotoBozuk   = empty($mevcutFotos) || (
                        isset($mevcutFotos[0]) &&
                        strpos($mevcutFotos[0], 'http') !== 0 &&
                        (!file_exists($uploadDir . basename($mevcutFotos[0])) || filesize($uploadDir . basename($mevcutFotos[0])) < 2000)
                    );
                    if ($fotoBozuk && !empty($i['fotograflar'])) {
                        $yeniFotos = fotografIndir($i['fotograflar']);
                        $pdo->prepare("UPDATE ilanlar SET fotograflar = ? WHERE id = ?")
                            ->execute([json_encode($yeniFotos), $mevcut_id]);
                    }
                    // son_gorunme güncelle — ilan hâlâ aktif
                    $pdo->prepare("UPDATE ilanlar SET son_gorunme = NOW() WHERE id = ?")->execute([$mevcut_id]);
                    $atilan++; continue;
                }

                $ilanData = mapIlanData($i);
                if (!$ilanData['baslik']) { $atilan++; continue; }
                // Fiyat 0 ise logla ama kaydetmeye devam et (fiyat çekilememiş olabilir)

                try {
                    $yeniId = $ilanModel->create($ilanData);
                } catch (PDOException $dupEx) {
                    // Duplicate key (SQLSTATE 23000) — iki paralel run aynı ilanı eklemeye çalıştı
                    if (str_starts_with($dupEx->getCode(), '23')) {
                        $atilan++; continue;
                    }
                    throw $dupEx;
                }
                $eklenen++;

                // Bildirim
                $bildirimModel->createForOfis(
                    $ilanData['ofis_id'],
                    'yeni_ilan',
                    'Yeni İlan: ' . mb_substr($ilanData['baslik'], 0, 60),
                    formatFiyat($ilanData['fiyat']) . ' · ' . ($ilanData['ilce'] ?? $ilanData['sehir']),
                    APP_URL . '/ilan-detay.php?id=' . $yeniId
                );

                // Otomatik eşleştirme
                $eslestirmeCtrl = new EslestirmeController();
                $eslestirmeCtrl->otomatikEslestir($yeniId);

                // Kırmızı alarm: sahte ilan tespit
                $sahteSkor = (int)($i['analiz']['sahte_skor'] ?? 0);
                if ($sahteSkor >= 50) {
                    $bildirimModel->createForOfis(
                        $ilanData['ofis_id'],
                        'kirmizi_alarm',
                        '🚨 Sahte İlan Şüphesi: ' . mb_substr($ilanData['baslik'], 0, 50),
                        "Sahte skor: {$sahteSkor}/100 · " . implode(', ', array_slice($i['analiz']['sahte_sebepler'] ?? [], 0, 2)),
                        APP_URL . '/ilan-detay.php?id=' . $yeniId
                    );
                }

            } catch (Exception $e) {
                $errors[] = $e->getMessage();
                error_log('Webhook yeni_ilan hatası: ' . $e->getMessage());
            }
        }

        logSystem('webhook', "yeni_ilan: eklenen={$eklenen}, atilan={$atilan}", null, 1);
        jsonResponse(true, ['eklenen' => $eklenen, 'atilan' => $atilan, 'hatalar' => $errors]);
        break;

    // ── GÜNCELLEME: tek ilan ───────────────────────────────────────────
    case 'guncelleme':
        $i = $payload['ilan'] ?? null;
        if (!$i || empty($i['kaynak_url'])) {
            jsonResponse(false, null, 'Eksik ilan verisi.', 400);
        }

        $stmt = $pdo->prepare("SELECT id, fiyat, durum FROM ilanlar WHERE kaynak_url = ? OR (kaynak_id = ? AND kaynak_site = ?) LIMIT 1");
        $stmt->execute([$i['kaynak_url'] ?? '', $i['kaynak_id'] ?? '', $i['kaynak_site'] ?? '']);
        $existing = $stmt->fetch();

        if (!$existing) {
            // Mevcut değilse ekle
            $ilanData = mapIlanData($i);
            if ($ilanData['baslik'] && $ilanData['fiyat']) {
                $ilanModel->create($ilanData);
            }
            jsonResponse(true, ['durum' => 'eklendi']);
        }

        // Alanları güncelle
        $updateData = mapIlanData($i);
        unset($updateData['ofis_id']); // ofis_id değiştirme
        $ilanModel->update($existing['id'], $updateData);

        logSystem('webhook', "guncelleme: id={$existing['id']}", null, 1);
        jsonResponse(true, ['durum' => 'guncellendi', 'id' => $existing['id']]);
        break;

    // ── SİLİNDİ: ilan kaldırıldı ──────────────────────────────────────
    case 'silindi':
        $i = $payload['ilan'] ?? null;
        if (!$i) {
            jsonResponse(false, null, 'Eksik ilan verisi.', 400);
        }

        $stmt = $pdo->prepare("SELECT id, baslik, ofis_id FROM ilanlar WHERE kaynak_url = ? OR (kaynak_id = ? AND kaynak_site = ?) LIMIT 1");
        $stmt->execute([$i['kaynak_url'] ?? '', $i['kaynak_id'] ?? '', $i['kaynak_site'] ?? '']);
        $existing = $stmt->fetch();

        if ($existing) {
            $ilanModel->update($existing['id'], [
                'durum'           => 'silindi',
                'silinme_tarihi'  => date('Y-m-d H:i:s'),
            ]);

            $bildirimModel->createForOfis(
                $existing['ofis_id'],
                'sistem',
                'İlan Kaldırıldı: ' . mb_substr($existing['baslik'], 0, 60),
                'Bu ilan kaynak platformdan kaldırılmıştır.',
                APP_URL . '/ilan-detay.php?id=' . $existing['id']
            );

            logSystem('webhook', "silindi: id={$existing['id']}", null, $existing['ofis_id']);
        }

        jsonResponse(true, ['durum' => 'islendi']);
        break;

    // ── FİYAT DEĞİŞİKLİĞİ ─────────────────────────────────────────────
    case 'fiyat_degisiklik':
        $i = $payload['ilan'] ?? null;
        if (!$i) {
            jsonResponse(false, null, 'Eksik ilan verisi.', 400);
        }

        $eskiFiyat  = (float)($i['meta']['eski_fiyat'] ?? 0);
        $yeniFiyat  = (float)($i['fiyat'] ?? 0);
        $degisimPct = (float)($i['meta']['fiyat_degisim_yuzdesi'] ?? 0);

        $stmt = $pdo->prepare("SELECT id, ofis_id, baslik, fiyat FROM ilanlar WHERE kaynak_url = ? OR (kaynak_id = ? AND kaynak_site = ?) LIMIT 1");
        $stmt->execute([$i['kaynak_url'] ?? '', $i['kaynak_id'] ?? '', $i['kaynak_site'] ?? '']);
        $existing = $stmt->fetch();

        if ($existing) {
            // Fiyat geçmişine ekle
            $ilanModel->addFiyatGecmisi($existing['id'], $yeniFiyat);

            // Fiyatı güncelle
            $ilanModel->update($existing['id'], ['fiyat' => $yeniFiyat]);

            // Bildirim (fiyat düşüşü için özel ikon)
            $ikon    = $degisimPct < 0 ? 'fiyat_dusus' : 'sistem';
            $etiket  = $degisimPct < 0 ? '🔻 Fiyat Düştü' : '📈 Fiyat Arttı';
            $bildirimModel->createForOfis(
                $existing['ofis_id'],
                $ikon,
                $etiket . ': ' . mb_substr($existing['baslik'], 0, 50),
                sprintf('%s → %s (%+.1f%%)', formatFiyat($eskiFiyat), formatFiyat($yeniFiyat), $degisimPct),
                APP_URL . '/ilan-detay.php?id=' . $existing['id']
            );

            logSystem('webhook', "fiyat_degisiklik: id={$existing['id']}, {$eskiFiyat}→{$yeniFiyat}", null, $existing['ofis_id']);
        }

        jsonResponse(true, ['durum' => 'islendi']);
        break;

    // ── SAHTE İLAN UYARISI ────────────────────────────────────────────
    case 'sahte_ilan':
        $i = $payload['ilan'] ?? null;
        if (!$i) {
            jsonResponse(false, null, 'Eksik ilan verisi.', 400);
        }

        $sahteSkor  = (int)($i['meta']['sahte_skor'] ?? 0);
        $sebepler   = $i['meta']['sahte_sebepler'] ?? [];

        $stmt = $pdo->prepare("SELECT id, ofis_id, baslik FROM ilanlar WHERE kaynak_url = ? OR (kaynak_id = ? AND kaynak_site = ?) LIMIT 1");
        $stmt->execute([$i['kaynak_url'] ?? '', $i['kaynak_id'] ?? '', $i['kaynak_site'] ?? '']);
        $existing = $stmt->fetch();

        if ($existing) {
            // sahte_skor kaydet
            $ilanModel->update($existing['id'], ['sahte_skor' => $sahteSkor, 'sahte_sonuc' => 'muhtemelen_sahte']);

            $bildirimModel->createForOfis(
                $existing['ofis_id'],
                'kirmizi_alarm',
                '🚨 Sahte İlan Tespiti: ' . mb_substr($existing['baslik'], 0, 50),
                "Skor: {$sahteSkor}/100 · " . implode(', ', array_slice($sebepler, 0, 3)),
                APP_URL . '/ilan-detay.php?id=' . $existing['id']
            );

            logSystem('webhook', "sahte_ilan: id={$existing['id']}, skor={$sahteSkor}", null, $existing['ofis_id']);
        }

        jsonResponse(true, ['durum' => 'islendi']);
        break;

    // ── KAYNAK ID KONTROL: hangileri DB'de var? (v2: fiyat bilgisi de döner) ──
    case 'check_ids':
        $ids    = $payload['ids']    ?? [];
        $site   = $payload['site']   ?? '';
        if (empty($ids) || !$site) {
            jsonResponse(true, ['mevcut' => [], 'fiyatlar' => []]);
        }

        // Güvenli parametre binding — max 200 ID
        $ids = array_slice(array_map('strval', $ids), 0, 200);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare(
            "SELECT kaynak_id, fiyat FROM ilanlar WHERE kaynak_site = ? AND kaynak_id IN ($placeholders)"
        );
        $stmt->execute([$site, ...$ids]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $mevcut  = [];
        $fiyatlar = [];
        foreach ($rows as $row) {
            $mevcut[]                       = $row['kaynak_id'];
            $fiyatlar[$row['kaynak_id']]    = (float)$row['fiyat'];
        }

        jsonResponse(true, ['mevcut' => $mevcut, 'fiyatlar' => $fiyatlar]);
        break;

    // ── TOPLU GÖRÜLDÜ: son_gorunme güncelle + fiyat değişiklik tespiti ──
    case 'goruldu':
        $ilanlar = $payload['ilanlar'] ?? [];
        $site    = $payload['site']    ?? '';
        if (empty($ilanlar) || !$site) {
            jsonResponse(true, ['guncellenen' => 0]);
        }

        $guncellenen     = 0;
        $fiyatDegisen    = 0;
        $now             = date('Y-m-d H:i:s');

        // son_gorunme toplu güncelle
        $kaynak_ids = array_map(fn($i) => (string)$i['kaynak_id'], $ilanlar);
        $placeholders = implode(',', array_fill(0, count($kaynak_ids), '?'));
        $stmt = $pdo->prepare(
            "UPDATE ilanlar SET son_gorunme = ? WHERE kaynak_site = ? AND kaynak_id IN ($placeholders)"
        );
        $stmt->execute([$now, $site, ...$kaynak_ids]);
        $guncellenen = $stmt->rowCount();

        // Fiyat değişiklik tespiti
        foreach ($ilanlar as $i) {
            $yeniFiyat = (float)($i['fiyat'] ?? 0);
            if ($yeniFiyat <= 0) continue;

            $stmt2 = $pdo->prepare(
                "SELECT id, fiyat, ofis_id, baslik FROM ilanlar WHERE kaynak_site = ? AND kaynak_id = ? LIMIT 1"
            );
            $stmt2->execute([$site, $i['kaynak_id']]);
            $existing = $stmt2->fetch(PDO::FETCH_ASSOC);
            if (!$existing) continue;

            $eskiFiyat = (float)$existing['fiyat'];
            // Fiyat farkı %1'den fazlaysa değişiklik say (kuruş farkları hariç)
            if ($eskiFiyat > 0 && abs($yeniFiyat - $eskiFiyat) / $eskiFiyat > 0.01) {
                // Fiyat geçmişine ekle
                $ilanModel->addFiyatGecmisi($existing['id'], $yeniFiyat);

                // m2_fiyat güncelle
                $m2Update = '';
                $m2Params = [$yeniFiyat, $existing['id']];
                $stmtM2 = $pdo->prepare("SELECT metrekare FROM ilanlar WHERE id = ?");
                $stmtM2->execute([$existing['id']]);
                $m2Row = $stmtM2->fetch();
                $m2Fiyat = ($m2Row && $m2Row['metrekare'] > 0) ? round($yeniFiyat / $m2Row['metrekare'], 2) : null;

                $pdo->prepare(
                    "UPDATE ilanlar SET fiyat = ?, m2_fiyat = ?, fiyat_degisim_sayisi = fiyat_degisim_sayisi + 1 WHERE id = ?"
                )->execute([$yeniFiyat, $m2Fiyat, $existing['id']]);

                // Bildirim
                $degisimPct = (($yeniFiyat - $eskiFiyat) / $eskiFiyat) * 100;
                $ikon    = $degisimPct < 0 ? 'fiyat_dusus' : 'sistem';
                $etiket  = $degisimPct < 0 ? '🔻 Fiyat Düştü' : '📈 Fiyat Arttı';
                $bildirimModel->createForOfis(
                    $existing['ofis_id'],
                    $ikon,
                    $etiket . ': ' . mb_substr($existing['baslik'], 0, 50),
                    sprintf('%s → %s (%+.1f%%)', formatFiyat($eskiFiyat), formatFiyat($yeniFiyat), $degisimPct),
                    APP_URL . '/ilan-detay.php?id=' . $existing['id']
                );

                $fiyatDegisen++;
            }
        }

        logSystem('webhook', "goruldu: site={$site}, guncellenen={$guncellenen}, fiyat_degisen={$fiyatDegisen}", null, 1);
        jsonResponse(true, ['guncellenen' => $guncellenen, 'fiyat_degisen' => $fiyatDegisen]);
        break;

    // ── KALDIRILMIŞ KONTROL: sitede artık olmayan ilanları işaretle ───────
    case 'kaldirilmis_kontrol':
        $site     = $payload['site'] ?? '';
        $aktifIds = $payload['aktif_ids'] ?? [];
        if (!$site || count($aktifIds) < 10) {
            jsonResponse(true, ['kaldirilmis' => 0, 'neden' => 'yetersiz_veri']);
        }

        // Bu sitedeki aktif ilanların ID'lerini al
        $stmt = $pdo->prepare(
            "SELECT id, kaynak_id, baslik, ofis_id FROM ilanlar WHERE kaynak_site = ? AND durum = 'aktif'"
        );
        $stmt->execute([$site]);
        $sunucudakiler = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $aktifSet = array_flip($aktifIds); // hızlı lookup için
        $kaldirilmis = 0;
        $now = date('Y-m-d H:i:s');

        foreach ($sunucudakiler as $ilan) {
            if (!isset($aktifSet[$ilan['kaynak_id']])) {
                // Sitede yok → kaldırılmış olarak işaretle
                $pdo->prepare(
                    "UPDATE ilanlar SET durum = 'kaldırılmış', silinme_tarihi = ? WHERE id = ?"
                )->execute([$now, $ilan['id']]);
                $kaldirilmis++;
            }
        }

        logSystem('webhook', "kaldirilmis_kontrol: site={$site}, aktif_ids=" . count($aktifIds) . ", kaldirilmis={$kaldirilmis}", null, 1);
        jsonResponse(true, ['kaldirilmis' => $kaldirilmis, 'kontrol_edilen' => count($sunucudakiler)]);
        break;


}

// ── Yardımcı: Dış fotoğraf URL'lerini sunucuya indir ──────────────────────
function fotografIndir(array $urls): array {
    $uploadDir = dirname(__DIR__) . '/uploads/fotograflar/';

    // Dizin yoksa oluştur
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0755, true);
    }

    $lokal = [];

    foreach (array_slice($urls, 0, 10) as $url) { // max 10 foto
        if (strpos($url, 'http') !== 0) {
            $lokal[] = $url; // zaten lokal
            continue;
        }

        $ext = strtolower(pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) $ext = 'jpg';

        $filename = 'scraper_' . md5($url) . '.' . $ext;
        $hedef    = $uploadDir . $filename;

        // Zaten indirilmişse ve geçerliyse tekrar indirme
        if (file_exists($hedef) && filesize($hedef) > 2000) {
            $lokal[] = $filename;
            continue;
        }

        $host     = parse_url($url, PHP_URL_HOST) ?: '';
        $referer  = parse_url($url, PHP_URL_SCHEME) . '://' . $host . '/';
        $isSahibinden = strpos($host, 'sahibinden') !== false
                     || strpos($host, 'hizliresim') !== false
                     || strpos($host, 'dsmcdn') !== false;

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            CURLOPT_REFERER        => $isSahibinden ? 'https://www.sahibinden.com/' : $referer,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTPHEADER     => [
                'Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language: tr-TR,tr;q=0.9',
                'Sec-Fetch-Dest: image',
                'Sec-Fetch-Mode: no-cors',
                'Sec-Fetch-Site: cross-site',
            ],
        ]);
        $data     = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $ctype    = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        curl_close($ch);

        // Geçerli resim mi kontrol et
        $isImage = $ctype && strpos($ctype, 'image/') === 0;
        if ($data && $httpCode === 200 && strlen($data) > 2000 && $isImage) {
            // Dosya yazımını kontrol et — başarısız olursa URL'yi sakla
            if (@file_put_contents($hedef, $data) !== false) {
                $lokal[] = $filename;
            } else {
                error_log("fotografIndir: Yazma hatası ($hedef) — URL yedek olarak saklandı");
                $lokal[] = $url; // img-proxy ile gösterilecek
            }
        } else {
            // İndirme başarısız → URL'yi sakla (img-proxy ile gösterilecek)
            $lokal[] = $url;
        }
    }

    return $lokal;
}

// ── Yardımcı: Scraper verisini DB formatına çevir ─────────────────────────
function mapIlanData(array $i): array {
    // Flat (scraper) veya nested (eski format) her ikisini de destekle
    $sehir   = $i['konum']['il']      ?? $i['sehir']    ?? '';
    $ilce    = $i['konum']['ilce']    ?? $i['ilce']     ?? null;
    $mahalle = $i['konum']['mahalle'] ?? $i['mahalle']  ?? null;
    $adres   = $i['konum']['adres']   ?? $i['adres']    ?? null;

    $metrekare  = (int)($i['ozellikler']['metrekare']  ?? $i['metrekare']  ?? 0) ?: null;
    // m² validasyonu: daire/villa/müstakil için 10.000 m²'den büyük olamaz, arsa için 1.000.000 m²
    $emlakTipi = $i['kategori'] ?? $i['emlak_tipi'] ?? 'daire';
    $maxM2 = in_array($emlakTipi, ['arsa', 'tarla']) ? 1000000 : 10000;
    if ($metrekare && $metrekare > $maxM2) $metrekare = null;
    $oda_sayisi = $i['ozellikler']['oda_sayisi'] ?? $i['oda_sayisi'] ?? null;
    $kat        = $i['ozellikler']['kat']        ?? $i['kat']        ?? null;
    $bina_yasi  = (int)($i['ozellikler']['bina_yasi']  ?? $i['bina_yasi']  ?? 0) ?: null;
    $isitma     = $i['ozellikler']['isitma_tipi'] ?? $i['ozellikler']['isitma'] ?? $i['isitma_tipi'] ?? $i['isitma'] ?? null;
    $banyo      = $i['ozellikler']['banyo_sayisi'] ?? $i['banyo_sayisi'] ?? null;

    $satici_tel = $i['satici']['telefon'] ?? $i['satici_tel'] ?? null;
    $satici_ad  = $i['satici']['ad']      ?? $i['satici_ad']  ?? null;

    $fotograflar = fotografIndir($i['fotograflar'] ?? []);

    return [
        'ofis_id'        => 1,
        'baslik'         => mb_substr($i['baslik'] ?? '', 0, 255),
        'aciklama'       => $i['aciklama'] ?? null,
        'fiyat'          => min((float)($i['fiyat'] ?? 0), 500000000),
        'sehir'          => $sehir,
        'ilce'           => $ilce,
        'mahalle'        => $mahalle,
        'adres'          => $adres,
        'lat'            => isset($i['konum']['lat']) ? (float)$i['konum']['lat'] : null,
        'lng'            => isset($i['konum']['lng']) ? (float)$i['konum']['lng'] : null,
        'metrekare'      => $metrekare,
        'oda_sayisi'     => $oda_sayisi,
        'kat'            => $kat,
        'bina_yasi'      => $bina_yasi,
        'isitma_tipi'    => $isitma,
        'banyo_sayisi'   => $banyo !== null ? (int)$banyo : null,
        'ilan_sahibi_tel'=> $satici_tel,
        'ilan_sahibi_ad' => $satici_ad,
        'sahibinden_mi'  => ($i['kaynak_site'] ?? '') === 'sahibinden' ? 1 : 0,
        'kaynak_site'    => $i['kaynak_site'] ?? 'scraper',
        'kaynak_url'     => $i['kaynak_url'] ?? null,
        'kaynak_id'      => $i['kaynak_id'] ?? null,
        'ilan_tipi'      => $i['tip'] ?? 'satilik',
        'emlak_tipi'     => $i['kategori'] ?? 'daire',
        'fotograflar'    => $fotograflar,
        'sahte_skor'     => (int)($i['analiz']['sahte_skor'] ?? $i['sahtelik_skoru'] ?? 0),
        'sahte_sonuc'    => $i['analiz']['sahte_sonuc'] ?? ($i['muhtemelen_sahte'] ? 'muhtemelen_sahte' : 'gercek'),
        'mukerrer_grup_id' => $i['analiz']['mukerrer_grup_id'] ?? $i['mukerrer_grup_id'] ?? null,
        'durum'          => 'aktif',
        'son_gorunme'    => date('Y-m-d H:i:s'),
        'm2_fiyat'       => ($metrekare && $metrekare > 0 && (float)($i['fiyat'] ?? 0) > 0)
                            ? round((float)$i['fiyat'] / $metrekare, 2)
                            : null,
    ];
}
