<?php
/**
 * EmlakRadar Pro - VPS Webhook Alıcısı
 * VPS üzerindeki scraper'dan veri alır ve ilanları kaydeder
 */
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

// Token doğrulama
$receivedToken = $_SERVER['HTTP_X_WEBHOOK_TOKEN'] ?? $_GET['token'] ?? '';
if (!hash_equals(VPS_WEBHOOK_TOKEN, $receivedToken)) {
    http_response_code(403);
    echo json_encode(['error' => 'Yetkisiz istek.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, null, 'POST gerekli.', 405);
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!$payload) {
    jsonResponse(false, null, 'Geçersiz payload.', 400);
}

$tip     = $payload['tip'] ?? 'ilan'; // 'ilan' | 'emsal' | 'fiyat_guncelle'
$ofisId  = (int)($payload['ofis_id'] ?? 1);
$ilanlar = $payload['ilanlar'] ?? [];

if (empty($ilanlar)) {
    jsonResponse(true, null, 'Veri yok.');
}

$ilanModel = new Ilan();
$eklenen   = 0;
$guncellenen = 0;
$errors    = [];

foreach ($ilanlar as $i) {
    try {
        // Mevcut ilan kontrolü (kaynak URL'ye göre)
        if (!empty($i['kaynak_url'])) {
            $pdo = db();
            $stmt = $pdo->prepare("SELECT id, fiyat, durum FROM ilanlar WHERE kaynak_url = ? LIMIT 1");
            $stmt->execute([$i['kaynak_url']]);
            $existing = $stmt->fetch();

            if ($existing) {
                // Fiyat değişikliği kontrolü
                if (isset($i['fiyat']) && abs((float)$i['fiyat'] - (float)$existing['fiyat']) > 0.01) {
                    $ilanModel->addFiyatGecmisi($existing['id'], (float)$i['fiyat']);

                    // Fiyat düşüşü bildirimi
                    if ((float)$i['fiyat'] < (float)$existing['fiyat']) {
                        $bildirimModel = new Bildirim();
                        $bildirimModel->createForOfis($ofisId, 'fiyat_dusus',
                            'Fiyat Düştü: ' . ($i['baslik'] ?? ''),
                            'Yeni: ' . formatFiyat((float)$i['fiyat']) . ' (Eski: ' . formatFiyat((float)$existing['fiyat']) . ')',
                            APP_URL . '/ilan-detay.php?id=' . $existing['id']
                        );
                    }
                }

                // Silinmiş ilan kontrolü
                if (($i['durum'] ?? '') === 'silindi' && $existing['durum'] !== 'silindi') {
                    $ilanModel->update($existing['id'], ['durum' => 'silindi', 'silinme_tarihi' => date('Y-m-d H:i:s')]);
                    $bildirimModel = new Bildirim();
                    $bildirimModel->createForOfis($ofisId, 'sistem',
                        'İlan Silindi: ' . ($i['baslik'] ?? ''),
                        'Bu ilan kaynaktan kaldırıldı.',
                        APP_URL . '/ilan-detay.php?id=' . $existing['id']
                    );
                }

                $guncellenen++;
                continue;
            }
        }

        // Yeni ilan ekle
        $ilanData = [
            'ofis_id'         => $ofisId,
            'baslik'          => $i['baslik'] ?? '',
            'aciklama'        => $i['aciklama'] ?? null,
            'fiyat'           => (float)($i['fiyat'] ?? 0),
            'sehir'           => $i['sehir'] ?? '',
            'ilce'            => $i['ilce'] ?? null,
            'mahalle'         => $i['mahalle'] ?? null,
            'adres'           => $i['adres'] ?? null,
            'lat'             => $i['lat'] ?? null,
            'lng'             => $i['lng'] ?? null,
            'metrekare'       => (int)($i['metrekare'] ?? 0) ?: null,
            'oda_sayisi'      => $i['oda_sayisi'] ?? null,
            'kat'             => $i['kat'] ?? null,
            'bina_yasi'       => (int)($i['bina_yasi'] ?? 0) ?: null,
            'ilan_sahibi_tel' => $i['ilan_sahibi_tel'] ?? null,
            'ilan_sahibi_ad'  => $i['ilan_sahibi_ad'] ?? null,
            'sahibinden_mi'   => (int)($i['sahibinden_mi'] ?? 0),
            'kaynak_site'     => $i['kaynak_site'] ?? 'manuel',
            'kaynak_url'      => $i['kaynak_url'] ?? null,
            'kaynak_id'       => $i['kaynak_id'] ?? null,
            'ilan_tipi'       => $i['ilan_tipi'] ?? 'satilik',
            'emlak_tipi'      => $i['emlak_tipi'] ?? 'daire',
            'fotograflar'     => $i['fotograflar'] ?? [],
            'durum'           => 'aktif',
        ];

        if (!$ilanData['baslik'] || !$ilanData['fiyat']) continue;

        $yeniId = $ilanModel->create($ilanData);
        $eklenen++;

        // Yeni ilan bildirimi
        $bildirimModel = new Bildirim();
        $bildirimModel->createForOfis($ofisId, 'yeni_ilan',
            'Yeni İlan: ' . $ilanData['baslik'],
            formatFiyat($ilanData['fiyat']) . ' · ' . ($ilanData['ilce'] ?? $ilanData['sehir']),
            APP_URL . '/ilan-detay.php?id=' . $yeniId
        );

        // Otomatik eşleştirme (arka planda)
        $eslestirmeCtrl = new EslestirmeController();
        $eslestirmeCtrl->otomatikEslestir($yeniId);

    } catch (Exception $e) {
        $errors[] = $e->getMessage();
        error_log('Webhook ilan hatası: ' . $e->getMessage());
    }
}

logSystem('webhook', "Eklenen: $eklenen, Güncellenen: $guncellenen", null, $ofisId);

jsonResponse(true, [
    'eklenen'     => $eklenen,
    'guncellenen' => $guncellenen,
    'hatalar'     => $errors,
]);
