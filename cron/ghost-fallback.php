#!/usr/bin/env php
<?php
/**
 * EmlakRadar Pro — Cron: Ghost Fallback (VPS Kontrol + Hayalet Müşteri)
 * Haftada bir çalıştır (Pazar 09:00):
 * 0 9 * * 0 php /path/to/cron/ghost-fallback.php >> /path/to/logs/cron.log 2>&1
 *
 * Yapılanlar:
 * 1. Son 24 saatte VPS'ten webhook gelip gelmediğini kontrol et
 * 2. Gelmemişse:
 *    a. Veritabanındaki aktif ilanların kaynak_url'lerini PHP cURL ile kontrol et
 *    b. 404 dönen veya ulaşılamayan ilanları 'silindi' olarak işaretle
 *    c. Silinen ilanlar için görev oluştur
 *    d. Broker'a 'VPS çalışmıyor' bildirimi gönder
 * 3. Hayalet müşteriler (30+ gün hareketsiz) → bildirim + görev
 * 4. Hareketsiz ilanlar (60+ gün, fiyat değişimi yok)
 * 5. Tamamlanmamış eski görevleri arşivle
 * 6. Haftalık performans bildirimi
 */

define('CRON_MODE', true);
require_once dirname(__DIR__) . '/app/config/app.php';

// ── Çalışma Kilidi ───────────────────────────────────────────────────
$lockFile = sys_get_temp_dir() . '/emlakradar_ghost.lock';
$lock = fopen($lockFile, 'w');
if (!flock($lock, LOCK_EX | LOCK_NB)) {
    echo '[' . date('Y-m-d H:i:s') . '] Başka instance çalışıyor.' . PHP_EOL;
    exit(0);
}

$basla = microtime(true);
echo '[' . date('Y-m-d H:i:s') . '] Ghost fallback başlatıldı.' . PHP_EOL;

$db = db();
$bildirim = new Bildirim();
$gorevModel = new Gorev();

/* ═══════════════════════════════════════════════════════════════════════
 * 1. VPS WEBHOOK KONTROLÜ
 * ═══════════════════════════════════════════════════════════════════════ */
echo PHP_EOL . '── VPS Webhook Kontrolü ──' . PHP_EOL;

$sonWebhook = $db->query("
    SELECT MAX(created_at) AS son
    FROM sistem_loglari
    WHERE islem = 'vps_webhook'
")->fetchColumn();

$vpsCalisiyor = true;
if (!$sonWebhook || strtotime($sonWebhook) < strtotime('-24 hours')) {
    $vpsCalisiyor = false;
    echo '[UYARI] Son 24 saatte VPS webhook gelmedi!' . PHP_EOL;

    // Broker'lara bildirim gönder
    $brokerlar = $db->query("
        SELECT id, ofis_id FROM kullanicilar
        WHERE rol = 'broker' AND aktif = 1
    ")->fetchAll();

    foreach ($brokerlar as $b) {
        $bildirim->create([
            'kullanici_id' => $b['id'],
            'tip'          => 'kirmizi_alarm',
            'baslik'       => '🔴 VPS Çalışmıyor!',
            'icerik'       => 'Son 24 saatte VPS\'ten webhook gelmedi. İlan takip sistemi durmuş olabilir. Kontrol edin.',
            'link'         => '/ayarlar.php',
        ]);
    }

    // Aktif ilanların kaynak URL'lerini kontrol et
    $kontrolEdilecek = $db->query("
        SELECT id, baslik, kaynak_url, danisman_id, ofis_id
        FROM ilanlar
        WHERE durum = 'aktif'
          AND kaynak_url IS NOT NULL AND kaynak_url != ''
        ORDER BY updated_at ASC
        LIMIT 50
    ")->fetchAll();

    echo "[INFO] " . count($kontrolEdilecek) . " ilan URL kontrol edilecek." . PHP_EOL;

    $silinenSayisi = 0;
    foreach ($kontrolEdilecek as $ilan) {
        $httpKod = urlKontrol($ilan['kaynak_url']);

        if ($httpKod === 404 || $httpKod === 410 || $httpKod === 0) {
            // İlanı silindi olarak işaretle
            $db->prepare("
                UPDATE ilanlar SET durum = 'silindi', updated_at = NOW()
                WHERE id = ?
            ")->execute([$ilan['id']]);
            $silinenSayisi++;

            // Danışmana görev oluştur
            if ($ilan['danisman_id']) {
                $gorevModel->create([
                    'danisman_id' => $ilan['danisman_id'],
                    'ofis_id'     => $ilan['ofis_id'],
                    'ilan_id'     => $ilan['id'],
                    'tip'         => 'arama',
                    'baslik'      => 'Silinen ilan: ' . mb_substr($ilan['baslik'], 0, 60),
                    'aciklama'    => "Kaynak siteden kaldırılmış (HTTP {$httpKod}). Sahibiyle iletişime geçin.",
                    'tarih_saat'  => date('Y-m-d') . ' 10:00:00',
                    'oncelik'     => 'yuksek',
                ]);
            }

            echo "  [SİLİNDİ] #{$ilan['id']} — HTTP {$httpKod}: " . mb_substr($ilan['baslik'], 0, 50) . PHP_EOL;
        }
    }

    echo "[OK] {$silinenSayisi} ilan silindi olarak işaretlendi." . PHP_EOL;
} else {
    echo '[OK] VPS webhook aktif. Son: ' . $sonWebhook . PHP_EOL;
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2. HAYALET MÜŞTERİLER (30+ gün hareketsiz)
 * ═══════════════════════════════════════════════════════════════════════ */
echo PHP_EOL . '── Hayalet Müşteriler ──' . PHP_EOL;

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

/* ═══════════════════════════════════════════════════════════════════════
 * 3. HAREKETSİZ İLANLAR (60+ gün, fiyat değişimi yok)
 * ═══════════════════════════════════════════════════════════════════════ */
echo PHP_EOL . '── Hareketsiz İlanlar ──' . PHP_EOL;

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

/* ═══════════════════════════════════════════════════════════════════════
 * 4. TAMAMLANMAMIŞ ESKİ GÖREVLERİ ARŞİVLE (30+ gün)
 * ═══════════════════════════════════════════════════════════════════════ */
echo PHP_EOL . '── Eski Görev Temizliği ──' . PHP_EOL;

$arsivlenen = $db->exec("
    UPDATE gorevler
    SET durum = 'iptal'
    WHERE durum = 'bekliyor'
      AND tarih_saat < DATE_SUB(NOW(), INTERVAL 30 DAY)
      AND tarih_saat IS NOT NULL
");
echo "[OK] {$arsivlenen} eski bekleyen görev iptal edildi." . PHP_EOL;

/* ═══════════════════════════════════════════════════════════════════════
 * 5. HAFTALIK PERFORMANS BİLDİRİMİ
 * ═══════════════════════════════════════════════════════════════════════ */
echo PHP_EOL . '── Haftalık Performans Bildirimi ──' . PHP_EOL;

$danismanlar = $db->query("
    SELECT k.id, k.ad_soyad, k.ofis_id,
           COALESCE(SUM(p.efor_skoru), 0) AS haftalik_efor,
           COALESCE(SUM(p.arama_sayisi), 0) AS haftalik_arama,
           COALESCE(SUM(p.eslestirme_sayisi), 0) AS haftalik_eslestirme
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
        'icerik'       => "Bu hafta: {$d['haftalik_efor']} efor skoru, {$d['haftalik_arama']} arama, {$d['haftalik_eslestirme']} eşleştirme.",
        'link'         => '/performans.php',
    ]);
}

echo "[OK] " . count($danismanlar) . " danışmana haftalık özet bildirimi gönderildi." . PHP_EOL;

/* ═══════════════════════════════════════════════════════════════════════
 * 6. ESKİ BİLDİRİMLERİ TEMİZLE (90+ gün)
 * ═══════════════════════════════════════════════════════════════════════ */
$temizlenen = $db->exec("
    DELETE FROM bildirimler
    WHERE okundu = 1 AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
");
echo "[OK] {$temizlenen} eski okunmuş bildirim temizlendi." . PHP_EOL;

// Kilidi bırak
flock($lock, LOCK_UN);
fclose($lock);
unlink($lockFile);

$sure = round((microtime(true) - $basla) * 1000, 1);
echo '[' . date('Y-m-d H:i:s') . "] Ghost fallback tamamlandı. ({$sure}ms)" . PHP_EOL . PHP_EOL;

/* ═══════════════════════════════════════════════════════════════════════
 * URL KONTROL FONKSİYONU (cURL)
 * ═══════════════════════════════════════════════════════════════════════ */
function urlKontrol(string $url): int {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_NOBODY         => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_USERAGENT      => 'EmlakRadar Bot/1.0',
        CURLOPT_SSL_VERIFYPEER => false,
    ]);

    curl_exec($ch);
    $httpKod = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $hata    = curl_error($ch);
    curl_close($ch);

    if ($hata) return 0; // Bağlantı hatası
    return $httpKod;
}
