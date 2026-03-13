<?php
/**
 * Kırık fotoğraf kayıtlarını onar — tek seferlik çalıştır, sonra sil
 * Erişim: https://siten.com/foto-onar.php?token=GÜVENLI_TOKEN
 */
require_once dirname(__DIR__) . '/app/config/app.php';

// Basit token koruması
$token = $_GET['token'] ?? '';
if (!$token || !defined('VPS_WEBHOOK_SECRET') || $token !== substr(hash('sha256', VPS_WEBHOOK_SECRET), 0, 16)) {
    http_response_code(403);
    die('Yetkisiz erişim.');
}

$pdo       = db();
$uploadDir = __DIR__ . '/uploads/fotograflar/';

if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

// Tüm ilanları çek
$stmt  = $pdo->query("SELECT id, fotograflar, kaynak_url FROM ilanlar WHERE fotograflar IS NOT NULL AND fotograflar != '[]' AND fotograflar != 'null' ORDER BY id DESC LIMIT 500");
$ilanlar = $stmt->fetchAll(PDO::FETCH_ASSOC);

$toplam = $onarilan = $atilan = 0;

foreach ($ilanlar as $ilan) {
    $fotos = json_decode($ilan['fotograflar'], true);
    if (!is_array($fotos) || empty($fotos)) continue;

    $toplam++;
    $ilkFoto = $fotos[0] ?? '';

    // HTTP URL ise sorun yok (img-proxy kullanır)
    if (strpos($ilkFoto, 'http') === 0) { $atilan++; continue; }

    // Filename → dosya var mı?
    $dosyaYolu = $uploadDir . basename($ilkFoto);
    if (file_exists($dosyaYolu) && filesize($dosyaYolu) > 2000) { $atilan++; continue; }

    // Dosya yok → fotograflar NULL yap (scraper bir sonraki çalışmada düzeltir)
    $pdo->prepare("UPDATE ilanlar SET fotograflar = NULL WHERE id = ?")
        ->execute([$ilan['id']]);
    $onarilan++;
}

echo "<pre>Toplam kontrol: $toplam\nSorunsuz: $atilan\nSıfırlandı (eksik dosya): $onarilan\n\nSonraki scraper çalışmasında fotoğraflar yeniden indirilecek.\nBu dosyayı sunucudan silin!</pre>";
