#!/usr/bin/env php
<?php
/**
 * EmlakRadar Pro — Cron: Otomatik Görev Oluştur
 * Her sabah 08:00 çalıştır:
 * * 8 * * * php /path/to/cron/gorev-olustur.php >> /path/to/logs/cron.log 2>&1
 *
 * Yapılanlar:
 * - Bugün randevusu olan ilanlar için "Randevu hatırlatma" görevi oluşturur
 * - 3 gündür hareketsiz kalan müşteriler için "Takip araması" görevi oluşturur
 * - Süresi geçen görevleri "ertelendi" olarak işaretler
 */

define('CRON_MODE', true);
require_once dirname(__DIR__) . '/app/config/app.php';

$basla = microtime(true);
echo '[' . date('Y-m-d H:i:s') . '] Görev oluşturma başlatıldı.' . PHP_EOL;

$db = db();

/* ── 1. Randevu Hatırlatma ──────────────────────────────────────────── */
$randevular = $db->prepare("
    SELECT g.*, u.ad_soyad, u.telefon
    FROM gorevler g
    JOIN musteriler u ON g.musteri_id = u.id
    WHERE g.tip = 'randevu'
      AND DATE(g.tarih_saat) = CURDATE()
      AND g.durum = 'bekliyor'
      AND g.danisman_id IS NOT NULL
");
$randevular->execute();
$rList = $randevular->fetchAll();

$gorevModel = new Gorev();
$hatirlatmaCount = 0;

foreach ($rList as $r) {
    // Hatırlatma görevi zaten var mı?
    $kontrol = $db->prepare("
        SELECT id FROM gorevler
        WHERE danisman_id = ?
          AND baslik LIKE ?
          AND DATE(created_at) = CURDATE()
    ");
    $kontrol->execute([$r['danisman_id'], '%Randevu hatırlatma%' . $r['id'] . '%']);
    if ($kontrol->fetchColumn()) continue;

    $gorevModel->create([
        'danisman_id' => $r['danisman_id'],
        'ofis_id'     => $r['ofis_id'],
        'musteri_id'  => $r['musteri_id'],
        'ilan_id'     => $r['ilan_id'],
        'tip'         => 'arama',
        'baslik'      => "Randevu hatırlatma (Görev #{$r['id']}): {$r['baslik']}",
        'aciklama'    => "Bugün randevu var: " . date('H:i', strtotime($r['tarih_saat'])),
        'tarih_saat'  => date('Y-m-d') . ' 08:00:00',
        'oncelik'     => 'yuksek',
    ]);
    $hatirlatmaCount++;
}

echo "[OK] {$hatirlatmaCount} randevu hatırlatma görevi oluşturuldu." . PHP_EOL;

/* ── 2. Hareketsiz Müşteri Takip ────────────────────────────────────── */
$hareketsiz = $db->prepare("
    SELECT m.id, m.ad_soyad, m.danisman_id, m.ofis_id,
           MAX(g.created_at) AS son_gorev
    FROM musteriler m
    LEFT JOIN gorevler g ON g.musteri_id = m.id
    WHERE m.durum = 'aktif'
      AND m.danisman_id IS NOT NULL
    GROUP BY m.id
    HAVING son_gorev IS NULL OR son_gorev < DATE_SUB(NOW(), INTERVAL 3 DAY)
");
$hareketsiz->execute();
$hList = $hareketsiz->fetchAll();

$takipCount = 0;
foreach ($hList as $h) {
    // Bugün zaten takip görevi var mı?
    $kontrol = $db->prepare("
        SELECT id FROM gorevler
        WHERE danisman_id = ?
          AND musteri_id = ?
          AND DATE(created_at) = CURDATE()
          AND tip = 'takip'
    ");
    $kontrol->execute([$h['danisman_id'], $h['id']]);
    if ($kontrol->fetchColumn()) continue;

    $gorevModel->create([
        'danisman_id' => $h['danisman_id'],
        'ofis_id'     => $h['ofis_id'],
        'musteri_id'  => $h['id'],
        'tip'         => 'arama',
        'baslik'      => "Takip araması: {$h['ad_soyad']}",
        'aciklama'    => '3 gündür iletişim yok.',
        'tarih_saat'  => date('Y-m-d') . ' 10:00:00',
        'oncelik'     => 'orta',
    ]);
    $takipCount++;
}

echo "[OK] {$takipCount} takip görevi oluşturuldu." . PHP_EOL;

/* ── 3. Süresi Geçen Görevleri Güncelle ────────────────────────────── */
$guncelleme = $db->exec("
    UPDATE gorevler
    SET durum = 'ertelendi'
    WHERE durum = 'bekliyor'
      AND tarih_saat < DATE_SUB(NOW(), INTERVAL 1 DAY)
      AND tarih_saat IS NOT NULL
");

echo "[OK] {$guncelleme} süresi geçen görev 'ertelendi' olarak işaretlendi." . PHP_EOL;

$sure = round((microtime(true) - $basla) * 1000, 1);
echo '[' . date('Y-m-d H:i:s') . "] Görev oluşturma tamamlandı. ({$sure}ms)" . PHP_EOL . PHP_EOL;
