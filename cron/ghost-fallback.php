#!/usr/bin/env php
<?php
/**
 * EmlakRadar Pro — Cron: Ghost Fallback (Hayalet Müşteri Kontrolü)
 * Haftada bir çalıştır (Pazar 09:00):
 * 0 9 * * 0 php /path/to/cron/ghost-fallback.php >> /path/to/logs/cron.log 2>&1
 *
 * Yapılanlar:
 * - 30+ gündür hiç aktivite olmayan müşterileri tespit eder
 * - Süresi dolan ve tamamlanmayan görevleri temizler
 * - Danışmana haftalık özet bildirimi gönderir
 * - Hareketsiz ilanları tespit eder (60+ gün, fiyat değişimi yok)
 */

define('CRON_MODE', true);
require_once dirname(__DIR__) . '/app/config/app.php';

$basla = microtime(true);
echo '[' . date('Y-m-d H:i:s') . '] Ghost fallback başlatıldı.' . PHP_EOL;

$db = db();

/* ── 1. Hayalet Müşteriler (30+ gün hareketsiz) ─────────────────────── */
$hayaletler = $db->query("
    SELECT m.id, m.ad_soyad, m.danisman_id, m.ofis_id,
           MAX(g.updated_at) AS son_aktivite
    FROM musteriler m
    LEFT JOIN gorevler g ON g.musteri_id = m.id
    WHERE m.durum = 'aktif'
    GROUP BY m.id
    HAVING son_aktivite IS NULL OR son_aktivite < DATE_SUB(NOW(), INTERVAL 30 DAY)
")->fetchAll();

echo "[INFO] " . count($hayaletler) . " hayalet müşteri tespit edildi." . PHP_EOL;

$bildirim = new Bildirim();
$gorevModel = new Gorev();

foreach ($hayaletler as $h) {
    if (!$h['danisman_id']) continue;

    // Danışmana bildirim gönder
    $bildirim->create([
        'kullanici_id' => $h['danisman_id'],
        'tip'          => 'sistem',
        'baslik'       => '👻 Hareketsiz Müşteri',
        'icerik'       => "{$h['ad_soyad']} ile 30+ gün iletişim yok. Takip araması yapın.",
        'link'         => "/musteriler.php?id={$h['id']}",
    ]);

    // Takip görevi oluştur (haftada 1 kez)
    $mevcutGorev = $db->prepare("
        SELECT id FROM gorevler
        WHERE danisman_id = ? AND musteri_id = ?
          AND tip = 'takip' AND durum = 'bekliyor'
          AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    ");
    $mevcutGorev->execute([$h['danisman_id'], $h['id']]);

    if (!$mevcutGorev->fetchColumn()) {
        $gorevModel->create([
            'danisman_id' => $h['danisman_id'],
            'ofis_id'     => $h['ofis_id'],
            'musteri_id'  => $h['id'],
            'tip'         => 'arama',
            'baslik'      => "Yeniden aktivasyon: {$h['ad_soyad']}",
            'aciklama'    => '30+ gündür iletişim yok. Müşteriyi yeniden aktive edin.',
            'tarih_saat'  => date('Y-m-d') . ' 10:00:00',
            'oncelik'     => 'orta',
        ]);
    }
}

/* ── 2. Hareketsiz İlanlar (60+ gün, fiyat değişimi yok) ────────────── */
$hareketsizIlanlar = $db->query("
    SELECT i.id, i.baslik, i.danisman_id, i.ofis_id,
           i.fiyat, i.created_at
    FROM ilanlar i
    WHERE i.durum = 'aktif'
      AND i.created_at < DATE_SUB(NOW(), INTERVAL 60 DAY)
      AND (
          JSON_LENGTH(i.fiyat_gecmisi) IS NULL
          OR JSON_LENGTH(i.fiyat_gecmisi) = 0
          OR JSON_UNQUOTE(JSON_EXTRACT(i.fiyat_gecmisi, '$[last].tarih'))
             < DATE_SUB(NOW(), INTERVAL 30 DAY)
      )
    LIMIT 100
")->fetchAll();

echo "[INFO] " . count($hareketsizIlanlar) . " hareketsiz ilan tespit edildi." . PHP_EOL;

foreach ($hareketsizIlanlar as $ilan) {
    if (!$ilan['danisman_id']) continue;

    $gunler = (int)((time() - strtotime($ilan['created_at'])) / 86400);

    $bildirim->create([
        'kullanici_id' => $ilan['danisman_id'],
        'tip'          => 'sistem',
        'baslik'       => '🏠 Hareketsiz İlan',
        'icerik'       => "{$ilan['baslik']} ilanı {$gunler} gündür hareketsiz. Fiyat revizyonu yapın.",
        'link'         => "/ilan-detay.php?id={$ilan['id']}",
    ]);
}

/* ── 3. Tamamlanmamış Eski Görevleri Arşivle (30+ gün) ─────────────── */
$arsivlenen = $db->exec("
    UPDATE gorevler
    SET durum = 'iptal'
    WHERE durum = 'bekliyor'
      AND tarih_saat < DATE_SUB(NOW(), INTERVAL 30 DAY)
      AND tarih_saat IS NOT NULL
");
echo "[OK] {$arsivlenen} eski bekleyen görev iptal edildi." . PHP_EOL;

/* ── 4. Haftalık Performans Bildirimi ───────────────────────────────── */
$danismanlar = $db->query("
    SELECT k.id, k.ad_soyad, k.ofis_id,
           COALESCE(SUM(p.efor_skoru), 0) AS haftalik_efor,
           COALESCE(SUM(p.arama_sayisi), 0) AS haftalik_arama
    FROM kullanicilar k
    LEFT JOIN performanslar p ON p.danisman_id = k.id
        AND p.tarih >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    WHERE k.rol IN ('danisman', 'broker') AND k.aktif = 1
    GROUP BY k.id
")->fetchAll();

foreach ($danismanlar as $d) {
    $bildirim->create([
        'kullanici_id' => $d['id'],
        'tip'          => 'sistem',
        'baslik'       => '📊 Haftalık Performans Özeti',
        'icerik'       => "Bu hafta: {$d['haftalik_efor']} efor skoru, {$d['haftalik_arama']} arama yaptınız.",
        'link'         => '/performans.php',
    ]);
}

echo "[OK] " . count($danismanlar) . " danışmana haftalık özet bildirimi gönderildi." . PHP_EOL;

$sure = round((microtime(true) - $basla) * 1000, 1);
echo '[' . date('Y-m-d H:i:s') . "] Ghost fallback tamamlandı. ({$sure}ms)" . PHP_EOL . PHP_EOL;
