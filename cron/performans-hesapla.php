#!/usr/bin/env php
<?php
/**
 * EmlakRadar Pro — Cron: Performans Hesapla
 * Her gece 23:55 çalıştır:
 * 55 23 * * * php /path/to/cron/performans-hesapla.php >> /path/to/logs/cron.log 2>&1
 *
 * Efor Skoru = (arama×1) + (randevu×3) + (gösterim×2) + (portföy×5) + (eşleştirme×2)
 *
 * Yapılanlar:
 * - Günlük efor skorlarını performanslar tablosuna yazar
 * - Eşleştirme sayısını efor formülüne dahil eder
 * - Eksik günler için 0 kayıt oluşturur (grafik sürekliliği için)
 * - Haftalık/aylık özet istatistikleri loglar
 * - Ofis bazlı performans sıralaması hesaplar
 */

define('CRON_MODE', true);
require_once dirname(__DIR__) . '/app/config/app.php';

// ── Çalışma Kilidi ───────────────────────────────────────────────────
$lockFile = sys_get_temp_dir() . '/emlakradar_performans.lock';
$lock = fopen($lockFile, 'w');
if (!flock($lock, LOCK_EX | LOCK_NB)) {
    echo '[' . date('Y-m-d H:i:s') . '] Başka instance çalışıyor.' . PHP_EOL;
    exit(0);
}

$basla  = microtime(true);
$bugun  = date('Y-m-d');
echo '[' . date('Y-m-d H:i:s') . '] Performans hesaplama başlatıldı.' . PHP_EOL;

$db = db();

/* ── Aktif Danışmanlar ──────────────────────────────────────────────── */
$danismanlar = $db->query("
    SELECT id, ad_soyad, ofis_id
    FROM kullanicilar
    WHERE rol IN ('danisman', 'broker')
      AND aktif = 1
")->fetchAll();

echo "[INFO] " . count($danismanlar) . " danışman işlenecek." . PHP_EOL;

/* ── Her Danışman İçin Günlük Aktiviteleri Hesapla ─────────────────── */
foreach ($danismanlar as $d) {
    // Bugünkü aramalar
    $arama = $db->prepare("
        SELECT COUNT(*) FROM aramalar
        WHERE danisman_id = ? AND DATE(created_at) = ?
    ");
    $arama->execute([$d['id'], $bugun]);
    $aramaCount = (int)$arama->fetchColumn();

    // Bugünkü randevular (tamamlanan)
    $randevu = $db->prepare("
        SELECT COUNT(*) FROM gorevler
        WHERE danisman_id = ? AND tip = 'randevu'
          AND durum = 'tamamlandi' AND DATE(updated_at) = ?
    ");
    $randevu->execute([$d['id'], $bugun]);
    $randevuCount = (int)$randevu->fetchColumn();

    // Bugünkü gösterimler
    $gosterim = $db->prepare("
        SELECT COUNT(*) FROM gorevler
        WHERE danisman_id = ? AND tip = 'gosterim'
          AND durum = 'tamamlandi' AND DATE(updated_at) = ?
    ");
    $gosterim->execute([$d['id'], $bugun]);
    $gosterimCount = (int)$gosterim->fetchColumn();

    // Bugün eklenen portföy ilanları
    $portfoy = $db->prepare("
        SELECT COUNT(*) FROM ilanlar
        WHERE danisman_id = ? AND DATE(created_at) = ?
    ");
    $portfoy->execute([$d['id'], $bugun]);
    $portfoyCount = (int)$portfoy->fetchColumn();

    // Bugünkü eşleştirmeler (yeni eklenen)
    $eslestirme = $db->prepare("
        SELECT COUNT(*) FROM eslestirmeler e
        JOIN musteriler m ON e.musteri_id = m.id
        WHERE m.danisman_id = ? AND DATE(e.created_at) = ?
    ");
    $eslestirme->execute([$d['id'], $bugun]);
    $eslestirmeCount = (int)$eslestirme->fetchColumn();

    // Efor skoru: arama×1 + randevu×3 + gösterim×2 + portföy×5 + eşleştirme×2
    $eforSkoru = ($aramaCount * 1)
               + ($randevuCount * 3)
               + ($gosterimCount * 2)
               + ($portfoyCount * 5)
               + ($eslestirmeCount * 2);

    // Upsert (ON DUPLICATE KEY UPDATE)
    $upsert = $db->prepare("
        INSERT INTO performanslar
            (danisman_id, ofis_id, tarih, arama_sayisi, randevu_sayisi,
             gosterim_sayisi, portfoy_sayisi, eslestirme_sayisi, efor_skoru)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            arama_sayisi      = VALUES(arama_sayisi),
            randevu_sayisi    = VALUES(randevu_sayisi),
            gosterim_sayisi   = VALUES(gosterim_sayisi),
            portfoy_sayisi    = VALUES(portfoy_sayisi),
            eslestirme_sayisi = VALUES(eslestirme_sayisi),
            efor_skoru        = VALUES(efor_skoru)
    ");
    $upsert->execute([
        $d['id'], $d['ofis_id'], $bugun,
        $aramaCount, $randevuCount, $gosterimCount, $portfoyCount, $eslestirmeCount, $eforSkoru,
    ]);

    echo "  - {$d['ad_soyad']}: arama={$aramaCount}, randevu={$randevuCount}, gösterim={$gosterimCount}, portföy={$portfoyCount}, eşleştirme={$eslestirmeCount}, efor={$eforSkoru}" . PHP_EOL;
}

/* ── Ofis Bazlı Günlük Sıralama ──────────────────────────────────────── */
$ofisler = $db->query("SELECT DISTINCT ofis_id FROM kullanicilar WHERE aktif = 1 AND ofis_id IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);

foreach ($ofisler as $ofisId) {
    $siralama = $db->prepare("
        SELECT danisman_id, efor_skoru
        FROM performanslar
        WHERE ofis_id = ? AND tarih = ?
        ORDER BY efor_skoru DESC
    ");
    $siralama->execute([$ofisId, $bugun]);
    $sira = 1;
    foreach ($siralama->fetchAll() as $row) {
        $db->prepare("
            UPDATE performanslar SET ofis_siralama = ?
            WHERE danisman_id = ? AND tarih = ?
        ")->execute([$sira, $row['danisman_id'], $bugun]);
        $sira++;
    }
}

/* ── Eksik Günleri Doldur (son 7 gün) ──────────────────────────────── */
for ($i = 1; $i <= 7; $i++) {
    $gun = date('Y-m-d', strtotime("-{$i} days"));
    foreach ($danismanlar as $d) {
        $var = $db->prepare("SELECT id FROM performanslar WHERE danisman_id = ? AND tarih = ?");
        $var->execute([$d['id'], $gun]);
        if (!$var->fetchColumn()) {
            $db->prepare("
                INSERT IGNORE INTO performanslar
                    (danisman_id, ofis_id, tarih, arama_sayisi, randevu_sayisi,
                     gosterim_sayisi, portfoy_sayisi, eslestirme_sayisi, efor_skoru)
                VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0)
            ")->execute([$d['id'], $d['ofis_id'], $gun]);
        }
    }
}

/* ── Haftalık Özet (Pazartesi çalışırsa) ───────────────────────────── */
if (date('N') == 1) {
    $haftaBaslangic = date('Y-m-d', strtotime('last monday -7 days'));
    $haftaBitis     = date('Y-m-d', strtotime('last sunday'));

    $ozet = $db->prepare("
        SELECT k.ad_soyad,
               SUM(p.arama_sayisi)      AS toplam_arama,
               SUM(p.randevu_sayisi)    AS toplam_randevu,
               SUM(p.eslestirme_sayisi) AS toplam_eslestirme,
               SUM(p.efor_skoru)        AS toplam_efor
        FROM performanslar p
        JOIN kullanicilar k ON p.danisman_id = k.id
        WHERE p.tarih BETWEEN ? AND ?
        GROUP BY p.danisman_id
        ORDER BY toplam_efor DESC
        LIMIT 10
    ");
    $ozet->execute([$haftaBaslangic, $haftaBitis]);

    echo PHP_EOL . "=== HAFTALIK ÖZET ({$haftaBaslangic} - {$haftaBitis}) ===" . PHP_EOL;
    foreach ($ozet->fetchAll() as $row) {
        echo "  {$row['ad_soyad']}: {$row['toplam_efor']} efor, {$row['toplam_arama']} arama, {$row['toplam_randevu']} randevu, {$row['toplam_eslestirme']} eşleştirme" . PHP_EOL;
    }

    // Haftalık en iyi danışmana bildirim
    $bildirim = new Bildirim();
    $enIyi = $db->prepare("
        SELECT p.danisman_id, k.ad_soyad, SUM(p.efor_skoru) AS toplam
        FROM performanslar p
        JOIN kullanicilar k ON p.danisman_id = k.id
        WHERE p.tarih BETWEEN ? AND ?
        GROUP BY p.danisman_id
        ORDER BY toplam DESC
        LIMIT 1
    ");
    $enIyi->execute([$haftaBaslangic, $haftaBitis]);
    $birinci = $enIyi->fetch();
    if ($birinci) {
        $bildirim->create([
            'kullanici_id' => $birinci['danisman_id'],
            'tip'          => 'sistem',
            'baslik'       => '🏆 Haftanın Yıldızı!',
            'icerik'       => "Bu hafta en yüksek efor skoruna ulaştınız: {$birinci['toplam']} puan. Tebrikler!",
            'link'         => '/performans.php',
        ]);
    }
}

/* ── Aylık Özet (Ayın 1'i çalışırsa) ──────────────────────────────── */
if (date('j') == 1) {
    $gecenAy = date('Y-m', strtotime('-1 month'));
    $ayBaslangic = $gecenAy . '-01';
    $ayBitis     = date('Y-m-t', strtotime($ayBaslangic));

    $aylikOzet = $db->prepare("
        SELECT k.ad_soyad, k.id,
               SUM(p.efor_skoru) AS toplam_efor,
               SUM(p.arama_sayisi) AS toplam_arama,
               AVG(p.efor_skoru) AS ort_efor
        FROM performanslar p
        JOIN kullanicilar k ON p.danisman_id = k.id
        WHERE p.tarih BETWEEN ? AND ?
        GROUP BY p.danisman_id
        ORDER BY toplam_efor DESC
    ");
    $aylikOzet->execute([$ayBaslangic, $ayBitis]);

    echo PHP_EOL . "=== AYLIK ÖZET ({$gecenAy}) ===" . PHP_EOL;
    foreach ($aylikOzet->fetchAll() as $row) {
        echo "  {$row['ad_soyad']}: {$row['toplam_efor']} efor (ort: " . round($row['ort_efor'], 1) . "/gün)" . PHP_EOL;
    }

    logSystem('performans_cron', 'aylik_ozet', json_encode([
        'ay' => $gecenAy,
        'danismanlar' => count($danismanlar),
    ]));
}

/* ── Eski Log Kayıtlarını Temizle (1 yıldan eski) ───────────────────── */
$db->exec("DELETE FROM sistem_loglari WHERE created_at < DATE_SUB(NOW(), INTERVAL 365 DAY)");

// Kilidi bırak
flock($lock, LOCK_UN);
fclose($lock);
unlink($lockFile);

$sure = round((microtime(true) - $basla) * 1000, 1);
echo PHP_EOL . '[' . date('Y-m-d H:i:s') . "] Performans hesaplama tamamlandı. ({$sure}ms)" . PHP_EOL . PHP_EOL;
