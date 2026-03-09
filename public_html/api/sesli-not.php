<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user   = Auth::requireLogin();
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'kaydet':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);
        if (empty($_FILES['ses']['tmp_name'])) jsonResponse(false, null, 'Ses dosyası yüklenmedi.', 400);

        $tmpName  = $_FILES['ses']['tmp_name'];
        $dir      = UPLOAD_AUDIO;
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        $filename = uniqid('ses_', true) . '.webm';
        $dest     = $dir . '/' . $filename;
        move_uploaded_file($tmpName, $dest);

        // Whisper transkripsiyon
        $ai    = new AI();
        $metin = $ai->sesliNotCevir($dest);

        // Arama kaydı oluştur
        $aramaModel = new Arama();
        $musteriId  = (int)(($_POST['musteri_id'] ?? 0)) ?: null;
        $aramaId    = $aramaModel->create([
            'danisman_id'      => $user['user_id'],
            'musteri_id'       => $musteriId,
            'ofis_id'          => $user['ofis_id'],
            'telefon'          => $_POST['telefon'] ?? '',
            'sesli_not_dosya'  => $filename,
            'sesli_not_metin'  => $metin,
        ]);

        // Performans güncelle
        $perf = new Performans();
        $perf->artir($user['user_id'], $user['ofis_id'], 'arama_sayisi');

        jsonResponse(true, [
            'arama_id' => $aramaId,
            'dosya'    => $filename,
            'metin'    => $metin,
        ]);
        break;

    default:
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
