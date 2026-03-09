#!/usr/bin/env php
<?php
/**
 * EmlakRadar Pro — Cron: Performans Hesapla
 * Her gece 23:55 çalıştır:
 * 55 23 * * * php /path/to/cron/performans-hesapla.php >> /path/to/logs/cron.log 2>&1
 *
 * Yapılanlar:
 * - Günlük efor skorlarını performanslar tablosuna yazar
 * - Eksik günler için 0 kayıt oluşturur (grafik sürekliliği için)
 * - Haftalık/aylık özet istatistikleri loglar
 */

define('CRON_MODE', true);
require_once dirname(__DIR__) . '/app/config/app.php';

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

    // Efor skoru: arama×1 + randevu×3 + gösterim×2 + portföy×5
    $eforSkoru = ($aramaCount * 1) + ($randevuCount * 3) + ($gosterimCount * 2) + ($portfoyCount * 5);

    // Upsert (ON DUPLICATE KEY UPDATE)
    $upsert = $db->prepare("
        INSERT INTO performanslar
            (danisman_id, ofis_id, tarih, arama_sayisi, randevu_sayisi,
             gosterim_sayisi, portfoy_sayisi, efor_skoru)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            arama_sayisi    = VALUES(arama_sayisi),
            randevu_sayisi  = VALUES(randevu_sayisi),
            gosterim_sayisi = VALUES(gosterim_sayisi),
            portfoy_sayisi  = VALUES(portfoy_sayisi),
            efor_skoru      = VALUES(efor_skoru)
    ");
    $upsert->execute([
        $d['id'], $d['ofis_id'], $bugun,
        $aramaCount, $randevuCount, $gosterimCount, $portfoyCount, $eforSkoru,
    ]);

    echo "  - {$d['ad_soyad']}: arama={$aramaCount}, randevu={$randevuCount}, gösterim={$gosterimCount}, portföy={$portfoyCount}, efor={$eforSkoru}" . PHP_EOL;
}

/* ── Haftalık Özet (Pazartesi çalışırsa) ───────────────────────────── */
if (date('N') == 1) {
    $haftaBaslangic = date('Y-m-d', strtotime('last monday -7 days'));
    $haftaBitis     = date('Y-m-d', strtotime('last sunday'));

    $ozet = $db->prepare("
        SELECT k.ad_soyad,
               SUM(p.arama_sayisi)    AS toplam_arama,
               SUM(p.randevu_sayisi)  AS toplam_randevu,
               SUM(p.efor_skoru)      AS toplam_efor
        FROM performanslar p
        JOIN kullanicilar k ON p.danisman_id = k.id
        WHERE p.tarih BETWEEN ? AND ?
        GROUP BY p.danisman_id
        ORDER BY toplam_efor DESC
        LIMIT 5
    ");
    $ozet->execute([$haftaBaslangic, $haftaBitis]);

    echo PHP_EOL . "=== HAFTALIK ÖZET ({$haftaBaslangic} - {$haftaBitis}) ===" . PHP_EOL;
    foreach ($ozet->fetchAll() as $row) {
        echo "  {$row['ad_soyad']}: {$row['toplam_efor']} efor, {$row['toplam_arama']} arama, {$row['toplam_randevu']} randevu" . PHP_EOL;
    }
}

/* ── Eski Log Kayıtlarını Temizle (1 yıldan eski) ───────────────────── */
$db->exec("DELETE FROM sistem_loglari WHERE created_at < DATE_SUB(NOW(), INTERVAL 365 DAY)");

$sure = round((microtime(true) - $basla) * 1000, 1);
echo PHP_EOL . '[' . date('Y-m-d H:i:s') . "] Performans hesaplama tamamlandı. ({$sure}ms)" . PHP_EOL . PHP_EOL;
