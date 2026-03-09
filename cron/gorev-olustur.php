#!/usr/bin/env php
<?php
/**
 * EmlakRadar Pro — Cron: Akıllı Görev Motoru
 * Her gece 00:05 çalıştır:
 * 5 0 * * * php /path/to/cron/gorev-olustur.php >> /path/to/logs/gorev-cron.log 2>&1
 *
 * Sıcaklık skoru tabanlı görev üretimi:
 * 1. Yeni İlan Araması (85-95)
 * 2. Müşteri Takip Zamanı (95)
 * 3. Silinen İlan Fırsatı (80)
 * 4. Fiyat Düşüren Satıcı (88)
 * 5. Yüksek Eşleştirme (92)
 * 6. Eski Müşteri Reaktivasyon (70)
 */

define('CRON_MODE', true);
require_once dirname(__DIR__) . '/app/config/app.php';

// ── Çalışma Kilidi ───────────────────────────────────────────────────
$lockFile = sys_get_temp_dir() . '/emlakradar_gorev_olustur.lock';
$lock = fopen($lockFile, 'w');
if (!flock($lock, LOCK_EX | LOCK_NB)) {
    echo '[' . date('Y-m-d H:i:s') . '] Başka bir instance çalışıyor, çıkılıyor.' . PHP_EOL;
    exit(0);
}

$basla = microtime(true);
echo '[' . date('Y-m-d H:i:s') . '] Akıllı görev motoru başlatıldı.' . PHP_EOL;

$db = db();
$gorevModel  = new Gorev();
$ilanModel   = new Ilan();
$bildirim    = new Bildirim();

// ── Aktif Danışmanları Çek ──────────────────────────────────────────
$danismanlar = $db->query("
    SELECT id, ad_soyad, ofis_id
    FROM kullanicilar
    WHERE rol IN ('danisman', 'broker') AND aktif = 1
")->fetchAll();

echo '[INFO] ' . count($danismanlar) . ' danışman işlenecek.' . PHP_EOL;

$toplamGorev = 0;

foreach ($danismanlar as $d) {
    $potansiyelGorevler = [];

    /* ── 1. YENİ İLAN ARAMASI (skor: 85-95) ─────────────────────── */
    $yeniIlanlar = $db->prepare("
        SELECT i.*,
               CASE WHEN i.ilan_sahibi_ad IS NOT NULL AND i.ilan_sahibi_ad != '' THEN 1 ELSE 0 END AS sahibinden
        FROM ilanlar i
        WHERE i.ofis_id = ? AND i.durum = 'aktif'
          AND i.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ");
    $yeniIlanlar->execute([$d['ofis_id']]);
    foreach ($yeniIlanlar->fetchAll() as $ilan) {
        $skor = 85;
        if ($ilan['sahibinden']) $skor += 5; // Sahibinden bonus
        // Fiyat bölge ortalamasının altındaysa
        $ortFiyat = $db->prepare("SELECT AVG(fiyat) FROM ilanlar WHERE ilce = ? AND durum = 'aktif' AND fiyat > 0");
        $ortFiyat->execute([$ilan['ilce']]);
        $bolgeOrt = (float)$ortFiyat->fetchColumn();
        if ($bolgeOrt > 0 && $ilan['fiyat'] < $bolgeOrt * 0.9) $skor += 10;

        $potansiyelGorevler[] = [
            'tip'        => 'arama',
            'baslik'     => 'Yeni ilan araştır: ' . mb_substr($ilan['baslik'], 0, 60),
            'aciklama'   => 'Son 24 saatte eklenen ilan. Fiyat: ' . number_format($ilan['fiyat'], 0, ',', '.') . ' ₺',
            'ilan_id'    => $ilan['id'],
            'sicaklik'   => min($skor, 95),
            'oncelik'    => 'yuksek',
        ];
    }

    /* ── 2. MÜŞTERİ TAKİP ZAMANI (skor: 95) ────────────────────── */
    $takipler = $db->prepare("
        SELECT id, ad_soyad, telefon, sonraki_iletisim
        FROM musteriler
        WHERE danisman_id = ? AND durum = 'aktif'
          AND sonraki_iletisim IS NOT NULL
          AND DATE(sonraki_iletisim) <= CURDATE()
    ");
    $takipler->execute([$d['id']]);
    foreach ($takipler->fetchAll() as $m) {
        $potansiyelGorevler[] = [
            'tip'        => 'takip',
            'baslik'     => 'Söz verilen takip: ' . $m['ad_soyad'],
            'aciklama'   => 'Takip tarihi: ' . date('d.m.Y', strtotime($m['sonraki_iletisim'])),
            'musteri_id' => $m['id'],
            'sicaklik'   => 95,
            'oncelik'    => 'yuksek',
        ];
    }

    /* ── 3. SİLİNEN İLAN FIRSATI (skor: 80) ─────────────────────── */
    $silinenler = $db->prepare("
        SELECT id, baslik, ilan_sahibi_tel, ilan_sahibi_ad
        FROM ilanlar
        WHERE ofis_id = ? AND durum = 'silindi'
          AND updated_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
          AND ilan_sahibi_tel IS NOT NULL AND ilan_sahibi_tel != ''
    ");
    $silinenler->execute([$d['ofis_id']]);
    foreach ($silinenler->fetchAll() as $s) {
        // Bu ilan için görev zaten var mı?
        $var = $db->prepare("SELECT id FROM gorevler WHERE ilan_id = ? AND baslik LIKE '%silinen%' AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)");
        $var->execute([$s['id']]);
        if ($var->fetchColumn()) continue;

        $potansiyelGorevler[] = [
            'tip'        => 'arama',
            'baslik'     => 'Silinen ilan fırsatı: ' . mb_substr($s['baslik'], 0, 50),
            'aciklama'   => 'Neden sildiniz? Hala satılık mı? Tel: ' . $s['ilan_sahibi_tel'],
            'ilan_id'    => $s['id'],
            'sicaklik'   => 80,
            'oncelik'    => 'orta',
        ];
    }

    /* ── 4. FİYAT DÜŞÜREN SATICI (skor: 88) ─────────────────────── */
    $fiyatDusen = $db->prepare("
        SELECT id, baslik, fiyat, fiyat_gecmisi
        FROM ilanlar
        WHERE ofis_id = ? AND durum = 'aktif'
          AND fiyat_gecmisi IS NOT NULL
          AND JSON_LENGTH(fiyat_gecmisi) >= 2
          AND updated_at > DATE_SUB(NOW(), INTERVAL 48 HOUR)
    ");
    $fiyatDusen->execute([$d['ofis_id']]);
    foreach ($fiyatDusen->fetchAll() as $fd) {
        $gecmis = is_string($fd['fiyat_gecmisi']) ? json_decode($fd['fiyat_gecmisi'], true) : ($fd['fiyat_gecmisi'] ?? []);
        if (count($gecmis) < 2) continue;
        $oncekiFiyat = end($gecmis)['fiyat'] ?? 0;
        $simdikiFiyat = (float)$fd['fiyat'];
        if ($oncekiFiyat > 0 && $simdikiFiyat < $oncekiFiyat * 0.95) {
            $dusus = round(100 - ($simdikiFiyat / $oncekiFiyat * 100), 1);
            $potansiyelGorevler[] = [
                'tip'      => 'arama',
                'baslik'   => "Fiyat düşüş (%{$dusus}): " . mb_substr($fd['baslik'], 0, 50),
                'aciklama' => "Fiyat " . number_format($oncekiFiyat, 0, ',', '.') . " → " . number_format($simdikiFiyat, 0, ',', '.') . " ₺ düştü. Pazarlık motivasyonu yüksek.",
                'ilan_id'  => $fd['id'],
                'sicaklik' => 88,
                'oncelik'  => 'yuksek',
            ];
        }
    }

    /* ── 5. YÜKSEK EŞLEŞTİRME (skor: 92) ───────────────────────── */
    $yuksekEslestirme = $db->prepare("
        SELECT e.id, e.skor, i.baslik AS ilan_baslik, m.ad_soyad, e.musteri_id, e.ilan_id
        FROM eslestirmeler e
        JOIN ilanlar i ON e.ilan_id = i.id
        JOIN musteriler m ON e.musteri_id = m.id
        WHERE m.danisman_id = ? AND e.durum = 'bekliyor' AND e.skor >= 80
          AND e.created_at > DATE_SUB(NOW(), INTERVAL 48 HOUR)
    ");
    $yuksekEslestirme->execute([$d['id']]);
    foreach ($yuksekEslestirme->fetchAll() as $e) {
        $potansiyelGorevler[] = [
            'tip'        => 'arama',
            'baslik'     => "Eşleştirme %{$e['skor']}: {$e['ad_soyad']} → " . mb_substr($e['ilan_baslik'], 0, 40),
            'aciklama'   => "Yüksek uyum eşleştirme. Müşteriye bilgi verin.",
            'musteri_id' => $e['musteri_id'],
            'ilan_id'    => $e['ilan_id'],
            'sicaklik'   => 92,
            'oncelik'    => 'yuksek',
        ];
    }

    /* ── 6. ESKİ MÜŞTERİ REAKTİVASYON (skor: 70) ───────────────── */
    $eskiMusteriler = $db->prepare("
        SELECT m.id, m.ad_soyad,
               MAX(g.created_at) AS son_aktivite
        FROM musteriler m
        LEFT JOIN gorevler g ON g.musteri_id = m.id
        WHERE m.danisman_id = ? AND m.durum = 'aktif'
        GROUP BY m.id
        HAVING son_aktivite IS NULL OR son_aktivite < DATE_SUB(NOW(), INTERVAL 30 DAY)
        LIMIT 5
    ");
    $eskiMusteriler->execute([$d['id']]);
    foreach ($eskiMusteriler->fetchAll() as $em) {
        $potansiyelGorevler[] = [
            'tip'        => 'takip',
            'baslik'     => 'Reaktivasyon: ' . $em['ad_soyad'],
            'aciklama'   => '30+ gündür iletişim yok. Yeniden aktive edin.',
            'musteri_id' => $em['id'],
            'sicaklik'   => 70,
            'oncelik'    => 'dusuk',
        ];
    }

    /* ── Sıcaklık Skoruna Göre Sırala & İlk 10'u Al ─────────────── */
    usort($potansiyelGorevler, function ($a, $b) {
        return ($b['sicaklik'] ?? 0) - ($a['sicaklik'] ?? 0);
    });
    $secilmisGorevler = array_slice($potansiyelGorevler, 0, 10);

    /* ── Görevleri Oluştur ───────────────────────────────────────── */
    $ai = null;
    try { $ai = new AI(); } catch (\Exception $e) {}

    foreach ($secilmisGorevler as $sg) {
        // Aynı gün aynı başlıkta görev var mı kontrol et
        $kontrol = $db->prepare("
            SELECT id FROM gorevler
            WHERE danisman_id = ? AND baslik = ? AND DATE(created_at) = CURDATE()
        ");
        $kontrol->execute([$d['id'], $sg['baslik']]);
        if ($kontrol->fetchColumn()) continue;

        // AI konuşma senaryosu (varsa)
        $aiSenaryo = null;
        if ($ai && in_array($sg['tip'], ['arama', 'takip'])) {
            try {
                $musteriData = [];
                $ilanData    = [];
                if (!empty($sg['musteri_id'])) {
                    $musteriData = $db->prepare("SELECT * FROM musteriler WHERE id = ?")->execute([$sg['musteri_id']]);
                    $musteriData = $db->prepare("SELECT * FROM musteriler WHERE id = ?");
                    $musteriData->execute([$sg['musteri_id']]);
                    $musteriData = $musteriData->fetch() ?: [];
                }
                if (!empty($sg['ilan_id'])) {
                    $ilanData = $db->prepare("SELECT * FROM ilanlar WHERE id = ?");
                    $ilanData->execute([$sg['ilan_id']]);
                    $ilanData = $ilanData->fetch() ?: [];
                }
                $aiSenaryo = $ai->gorevSenaryo(
                    ['tip' => $sg['tip'], 'baslik' => $sg['baslik']],
                    !empty($musteriData) ? $musteriData : null,
                    !empty($ilanData) ? $ilanData : null
                );
            } catch (\Exception $e) {}
        }

        $gorevModel->create([
            'danisman_id'  => $d['id'],
            'ofis_id'      => $d['ofis_id'],
            'musteri_id'   => $sg['musteri_id'] ?? null,
            'ilan_id'      => $sg['ilan_id'] ?? null,
            'tip'          => $sg['tip'],
            'baslik'       => $sg['baslik'],
            'aciklama'     => $sg['aciklama'] ?? '',
            'tarih_saat'   => date('Y-m-d') . ' 09:00:00',
            'oncelik'      => $sg['oncelik'] ?? 'orta',
            'sicaklik_skoru' => $sg['sicaklik'] ?? 0,
            'ai_senaryo'   => $aiSenaryo,
        ]);
        $toplamGorev++;
    }

    echo "  [{$d['ad_soyad']}] " . count($secilmisGorevler) . " görev (toplam potansiyel: " . count($potansiyelGorevler) . ")" . PHP_EOL;
}

/* ── Kırmızı Alarm → Broker Bildirimi ────────────────────────────── */
$kirmiziAlarmlar = $db->query("
    SELECT i.id, i.baslik, i.fiyat, i.ofis_id,
           ev.fiyat AS emsal_fiyat
    FROM ilanlar i
    JOIN emsal_veriler ev ON ev.ilce = i.ilce AND ev.sehir = i.sehir
    WHERE i.durum = 'aktif' AND i.fiyat < ev.fiyat * 0.9
    GROUP BY i.id
    LIMIT 20
")->fetchAll();

foreach ($kirmiziAlarmlar as $alarm) {
    $brokerlar = $db->prepare("SELECT id FROM kullanicilar WHERE ofis_id = ? AND rol = 'broker' AND aktif = 1");
    $brokerlar->execute([$alarm['ofis_id']]);
    foreach ($brokerlar->fetchAll() as $b) {
        $bildirim->create([
            'kullanici_id' => $b['id'],
            'tip'          => 'kirmizi_alarm',
            'baslik'       => '🔴 Kırmızı Alarm: ' . mb_substr($alarm['baslik'], 0, 50),
            'icerik'       => 'Fiyat emsal altında: ' . number_format($alarm['fiyat'], 0, ',', '.') . ' ₺',
            'link'         => '/ilan-detay.php?id=' . $alarm['id'],
        ]);
    }
}

/* ── Süresi Geçen Görevleri Güncelle ─────────────────────────────── */
$ertelenen = $db->exec("
    UPDATE gorevler SET durum = 'ertelendi'
    WHERE durum = 'bekliyor' AND tarih_saat < DATE_SUB(NOW(), INTERVAL 1 DAY) AND tarih_saat IS NOT NULL
");
echo "[OK] {$ertelenen} süresi geçen görev ertelendi." . PHP_EOL;

// Kilidi bırak
flock($lock, LOCK_UN);
fclose($lock);
unlink($lockFile);

$sure = round((microtime(true) - $basla) * 1000, 1);
echo "[OK] Toplam {$toplamGorev} görev oluşturuldu. ({$sure}ms)" . PHP_EOL . PHP_EOL;
