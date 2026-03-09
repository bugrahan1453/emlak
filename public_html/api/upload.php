<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user = Auth::requireLogin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);

$tip = $_GET['tip'] ?? 'foto'; // 'foto' | 'sesli'

if ($tip === 'foto') {
    if (empty($_FILES['dosya']['tmp_name'])) jsonResponse(false, null, 'Dosya yüklenmedi.', 400);

    $tmpName = $_FILES['dosya']['tmp_name'];
    $mime    = mime_content_type($tmpName);

    if (!in_array($mime, ALLOWED_IMG_TYPES)) {
        jsonResponse(false, null, 'Geçersiz dosya tipi.', 400);
    }
    if ($_FILES['dosya']['size'] > MAX_UPLOAD_SIZE) {
        jsonResponse(false, null, 'Dosya boyutu çok büyük (max 10 MB).', 400);
    }

    $dir = UPLOAD_PHOTOS;
    if (!is_dir($dir)) mkdir($dir, 0755, true);

    $filename = safeFileName($_FILES['dosya']['name']);
    $dest     = $dir . '/' . $filename;

    if (!move_uploaded_file($tmpName, $dest)) {
        jsonResponse(false, null, 'Dosya kaydedilemedi.', 500);
    }

    jsonResponse(true, ['dosya' => $filename, 'url' => APP_URL . '/uploads/fotograflar/' . $filename]);

} elseif ($tip === 'sesli') {
    if (empty($_FILES['dosya']['tmp_name'])) jsonResponse(false, null, 'Ses dosyası yüklenmedi.', 400);

    $tmpName = $_FILES['dosya']['tmp_name'];
    $mime    = mime_content_type($tmpName);

    if (!in_array($mime, ALLOWED_AUD_TYPES)) {
        jsonResponse(false, null, 'Geçersiz ses dosyası tipi.', 400);
    }

    $dir = UPLOAD_AUDIO;
    if (!is_dir($dir)) mkdir($dir, 0755, true);

    $filename = safeFileName($_FILES['dosya']['name'] ?: 'ses.webm');
    $dest     = $dir . '/' . $filename;

    if (!move_uploaded_file($tmpName, $dest)) {
        jsonResponse(false, null, 'Ses dosyası kaydedilemedi.', 500);
    }

    // Whisper ile transkripsiyon
    $metin = null;
    $ai = new AI();
    $metin = $ai->sesliNotCevir($dest);

    jsonResponse(true, [
        'dosya' => $filename,
        'metin' => $metin,
    ]);

} else {
    jsonResponse(false, null, 'Geçersiz tip.', 400);
}
