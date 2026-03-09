#!/usr/bin/env php
<?php
/**
 * EmlakRadar Pro — Cron: Eşleştirme Motoru
 * Her saat başında veya yeni ilan eklendiğinde çalışır:
 * 0 * * * * php /path/to/cron/eslestirme-kontrol.php >> /path/to/logs/eslestirme-cron.log 2>&1
 *
 * Algoritma: Bölge %30, Fiyat %30, Oda %20, m² %20
 * Skor >= 60: eşleştirme oluştur, >= 80: bildirim gönder
 */

define('CRON_MODE', true);
require_once dirname(__DIR__) . '/app/config/app.php';

// ── Çalışma Kilidi ───────────────────────────────────────────────────
$lockFile = sys_get_temp_dir() . '/emlakradar_eslestirme.lock';
$lock = fopen($lockFile, 'w');
if (!flock($lock, LOCK_EX | LOCK_NB)) {
    echo '[' . date('Y-m-d H:i:s') . '] Başka instance çalışıyor.' . PHP_EOL;
    exit(0);
}

$basla = microtime(true);
echo '[' . date('Y-m-d H:i:s') . '] Eşleştirme motoru başlatıldı.' . PHP_EOL;

$db       = db();
$bildirim = new Bildirim();
$ai       = null;
try { $ai = new AI(); } catch (\Exception $e) {}

// ── Son kontrol zamanını oku ─────────────────────────────────────────
$sonKontrolSt = $db->query("SELECT deger FROM sistem_loglari WHERE islem = 'eslestirme_son_kontrol' ORDER BY id DESC LIMIT 1");
$sonKontrol   = $sonKontrolSt ? $sonKontrolSt->fetchColumn() : null;
if (!$sonKontrol) $sonKontrol = date('Y-m-d H:i:s', strtotime('-2 hours'));

// ── Yeni İlanları Çek ────────────────────────────────────────────────
$yeniIlanlar = $db->prepare("
    SELECT * FROM ilanlar
    WHERE durum = 'aktif' AND created_at > ?
    ORDER BY created_at DESC
    LIMIT 100
");
$yeniIlanlar->execute([$sonKontrol]);
$ilanlar = $yeniIlanlar->fetchAll();

echo '[INFO] ' . count($ilanlar) . ' yeni ilan bulundu.' . PHP_EOL;

// ── Tüm Aktif ALICI Müşterileri Çek ─────────────────────────────────
$musteriler = $db->query("
    SELECT m.*, m.tercihler
    FROM musteriler m
    WHERE m.durum = 'aktif' AND m.tip IN ('alici', 'kiralayan')
    ORDER BY m.id
")->fetchAll();

echo '[INFO] ' . count($musteriler) . ' aktif alıcı müşteri.' . PHP_EOL;

$toplamEslestirme = 0;
$toplamBildirim   = 0;

foreach ($ilanlar as $ilan) {
    foreach ($musteriler as $musteri) {
        // Tercihler JSON parse
        $tercihler = is_string($musteri['tercihler']) ? json_decode($musteri['tercihler'], true) : ($musteri['tercihler'] ?? []);
        $musteri = array_merge($musteri, [
            'tercih_bolge'     => $tercihler['bolge'] ?? '',
            'tercih_sehir'     => $tercihler['sehir'] ?? '',
            'tercih_oda'       => $tercihler['oda_sayisi'] ?? '',
            'tercih_metrekare' => $tercihler['metrekare'] ?? 0,
        ]);

        // ── Skor Hesaplama ───────────────────────────────────────────
        $skor = eslestirmeHesapla($musteri, $ilan);

        if ($skor < 60) continue;

        // Zaten var mı kontrol et
        $varMi = $db->prepare("SELECT id FROM eslestirmeler WHERE ilan_id = ? AND musteri_id = ?");
        $varMi->execute([$ilan['id'], $musteri['id']]);
        if ($varMi->fetchColumn()) continue;

        // AI yorum al (opsiyonel)
        $aiYorum = '';
        if ($ai && $skor >= 75) {
            try {
                $sonuc = $ai->eslestirmeSkoru($musteri, $ilan);
                $aiYorum = $sonuc['ai_yorum'] ?? '';
            } catch (\Exception $e) {}
        }

        // Eşleştirme kaydet
        $eslestirmeId = null;
        try {
            $st = $db->prepare("
                INSERT INTO eslestirmeler (ilan_id, musteri_id, skor, aciklama, durum, created_at)
                VALUES (?, ?, ?, ?, 'bekliyor', NOW())
            ");
            $st->execute([$ilan['id'], $musteri['id'], $skor, $aiYorum]);
            $eslestirmeId = $db->lastInsertId();
            $toplamEslestirme++;
        } catch (\PDOException $e) {
            // Duplicate key — atla
            continue;
        }

        // Skor >= 80: bildirim gönder
        if ($skor >= 80 && $musteri['danisman_id']) {
            $bildirim->create([
                'kullanici_id' => $musteri['danisman_id'],
                'tip'          => 'yeni_eslestirme',
                'baslik'       => '🎯 Yüksek Uyum: %' . $skor,
                'icerik'       => $ilan['baslik'] . ' → ' . $musteri['ad_soyad'],
                'link'         => '/eslestirmeler.php?id=' . $eslestirmeId,
            ]);
            $toplamBildirim++;
        }

        echo "  [EŞLEŞTIRME] İlan #{$ilan['id']} ↔ Müşteri #{$musteri['id']} → %{$skor}" . PHP_EOL;
    }
}

// ── Son kontrol zamanını güncelle ────────────────────────────────────
logSystem('eslestirme_cron', 'eslestirme_son_kontrol', date('Y-m-d H:i:s'));

// ── Eski Eşleştirmeleri Temizle (90 gün, ilgilenmiyor) ──────────────
$temizlenen = $db->exec("
    DELETE FROM eslestirmeler
    WHERE durum = 'ilgilenmiyor' AND updated_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
");

echo "[OK] Toplam: {$toplamEslestirme} eşleştirme, {$toplamBildirim} bildirim, {$temizlenen} temizlendi." . PHP_EOL;

flock($lock, LOCK_UN);
fclose($lock);
unlink($lockFile);

$sure = round((microtime(true) - $basla) * 1000, 1);
echo '[' . date('Y-m-d H:i:s') . "] Eşleştirme motoru tamamlandı. ({$sure}ms)" . PHP_EOL . PHP_EOL;

/* ═══════════════════════════════════════════════════════════════════
 * EŞLEŞTİRME SKOR HESAPLAMA FONKSİYONU
 * Bölge %30, Fiyat %30, Oda %20, m² %20
 * ═══════════════════════════════════════════════════════════════════ */
function eslestirmeHesapla(array $musteri, array $ilan): int {
    $bolge = 0;
    $fiyat = 0;
    $oda   = 0;
    $mkare = 0;

    // Bölge (%30)
    $tercihBolge = $musteri['tercih_bolge'] ?? '';
    if ($tercihBolge) {
        $ilanBolge = implode(' ', array_filter([$ilan['ilce'] ?? '', $ilan['mahalle'] ?? '']));
        if (mb_stripos($ilanBolge, $tercihBolge) !== false) {
            $bolge = 30;
        } else {
            $tercihSehir = $musteri['tercih_sehir'] ?? '';
            if ($tercihSehir && mb_stripos($ilan['sehir'] ?? '', $tercihSehir) !== false) {
                $bolge = 15;
            }
        }
    } else {
        $bolge = 15; // Tercih belirtilmemişse orta skor
    }

    // Fiyat (%30)
    $ilanFiyat = (float)($ilan['fiyat'] ?? 0);
    $butceMin  = (float)($musteri['butce_min'] ?? 0);
    $butceMax  = (float)($musteri['butce_max'] ?? 0);
    if ($ilanFiyat > 0 && $butceMax > 0) {
        if ($ilanFiyat >= $butceMin && $ilanFiyat <= $butceMax) {
            $fiyat = 30;
        } elseif ($ilanFiyat < $butceMin) {
            $fiyat = 20; // Bütçenin altı iyi
        } else {
            $asim = (($ilanFiyat - $butceMax) / $butceMax) * 100;
            if ($asim <= 10) $fiyat = 20;
            elseif ($asim <= 20) $fiyat = 10;
            // %30+ üstünde: 0 puan
        }
    } else {
        $fiyat = 15;
    }

    // Oda Sayısı (%20)
    $tercihOda = $musteri['tercih_oda'] ?? '';
    $ilanOda   = $ilan['oda_sayisi'] ?? '';
    if ($tercihOda && $ilanOda) {
        if ($tercihOda == $ilanOda) $oda = 20;
        elseif (abs((float)$tercihOda - (float)$ilanOda) <= 1) $oda = 10;
    } else {
        $oda = 10;
    }

    // Metrekare (%20)
    $tercihM2 = (float)($musteri['tercih_metrekare'] ?? 0);
    $ilanM2   = (float)($ilan['metrekare'] ?? 0);
    if ($tercihM2 > 0 && $ilanM2 > 0) {
        $fark = abs($tercihM2 - $ilanM2) / $tercihM2 * 100;
        if ($fark <= 10) $mkare = 20;
        elseif ($fark <= 20) $mkare = 10;
    } else {
        $mkare = 10;
    }

    return $bolge + $fiyat + $oda + $mkare;
}
