#!/usr/bin/env php
<?php
/**
 * EmlakRadar Pro — Cron: Eşleştirme Kontrol
 * Her 2 saatte bir çalıştır:
 * 0 */2 * * * php /path/to/cron/eslestirme-kontrol.php >> /path/to/logs/cron.log 2>&1
 *
 * Yapılanlar:
 * - Son 24 saatteki yeni ilanlar için eşleştirme çalıştırır
 * - Yüksek skorlu eşleştirmeler için bildirim oluşturur
 * - Eşleştirme skoru güncellemesi (fiyat değişiklikleri nedeniyle)
 */

define('CRON_MODE', true);
require_once dirname(__DIR__) . '/app/config/app.php';

$basla = microtime(true);
echo '[' . date('Y-m-d H:i:s') . '] Eşleştirme kontrolü başlatıldı.' . PHP_EOL;

$db = db();

/* ── Son 24 Saatteki İlanlar ────────────────────────────────────────── */
$yeniIlanlar = $db->query("
    SELECT id, baslik, ofis_id
    FROM ilanlar
    WHERE durum = 'aktif'
      AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ORDER BY created_at DESC
    LIMIT 50
")->fetchAll();

echo "[INFO] {$yeniIlanlar->count()} yeni ilan bulundu... " . PHP_EOL;

$eslestirmeController = new EslestirmeController();
$eslestirme = new Eslestirme();
$toplam = 0;

foreach ($yeniIlanlar as $ilan) {
    $sayi = $eslestirmeController->otomatikEslestir($ilan['id']);
    $toplam += $sayi;
    echo "  - İlan #{$ilan['id']} ({$ilan['baslik']}): {$sayi} eşleştirme" . PHP_EOL;
}

echo "[OK] Toplam {$toplam} eşleştirme oluşturuldu." . PHP_EOL;

/* ── Bekleyen Yüksek Skorlu Eşleştirme Bildirimleri ────────────────── */
$yuksekSkor = $db->query("
    SELECT e.*, i.baslik AS ilan_baslik, m.ad_soyad, m.danisman_id, m.ofis_id
    FROM eslestirmeler e
    JOIN ilanlar i ON e.ilan_id = i.id
    JOIN musteriler m ON e.musteri_id = m.id
    WHERE e.durum = 'bekliyor'
      AND e.skor >= 85
      AND e.bildirim_gonderildi = 0
      AND e.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    LIMIT 100
")->fetchAll();

$bildirim = new Bildirim();
$bildirimCount = 0;

foreach ($yuksekSkor as $e) {
    if (!$e['danisman_id']) continue;

    $bildirim->create([
        'kullanici_id' => $e['danisman_id'],
        'tip'          => 'yeni_eslestirme',
        'baslik'       => '🎯 Yüksek Uyum Eşleştirme!',
        'icerik'       => "%{$e['skor']} uyum: {$e['ilan_baslik']} ↔ {$e['ad_soyad']}",
        'link'         => "/eslestirmeler.php?id={$e['id']}",
    ]);

    // Bildirim gönderildi flag'i güncelle
    $db->prepare("UPDATE eslestirmeler SET bildirim_gonderildi = 1 WHERE id = ?")
       ->execute([$e['id']]);

    $bildirimCount++;
}

echo "[OK] {$bildirimCount} yüksek skor bildirimi gönderildi." . PHP_EOL;

/* ── Eski Eşleştirmeleri Temizle (90 gün) ──────────────────────────── */
$temizlenen = $db->exec("
    DELETE FROM eslestirmeler
    WHERE durum = 'ilgilenmiyor'
      AND updated_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
");

echo "[OK] {$temizlenen} eski eşleştirme temizlendi." . PHP_EOL;

$sure = round((microtime(true) - $basla) * 1000, 1);
echo '[' . date('Y-m-d H:i:s') . "] Eşleştirme kontrolü tamamlandı. ({$sure}ms)" . PHP_EOL . PHP_EOL;
