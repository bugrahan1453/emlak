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

        // Sesli not AI parse
        $parseSonuc = null;
        if ($metin) {
            $parseSonuc = $ai->sesliNotParsele($metin);
        }

        // Hedef tip ve ID
        $hedefTip = $_POST['hedef_tip'] ?? null;   // musteri, ilan, gorev
        $hedefId  = (int)($_POST['hedef_id'] ?? 0);
        $musteriId = (int)($_POST['musteri_id'] ?? 0) ?: null;
        $ilanId    = (int)($_POST['ilan_id'] ?? 0) ?: null;

        // Hedef tip'e göre müşteri/ilan ID belirle
        if ($hedefTip === 'musteri' && $hedefId) $musteriId = $hedefId;
        if ($hedefTip === 'ilan' && $hedefId)    $ilanId = $hedefId;

        // Arama kaydı oluştur
        $aramaModel = new Arama();
        $aramaId    = $aramaModel->create([
            'danisman_id'      => $user['user_id'],
            'musteri_id'       => $musteriId,
            'ofis_id'          => $user['ofis_id'],
            'telefon'          => $_POST['telefon'] ?? '',
            'sesli_not_dosya'  => $filename,
            'sesli_not_metin'  => $metin,
            'sonuc'            => $parseSonuc ? ($parseSonuc['gorev_notu'] ?? '') : '',
        ]);

        // Performans güncelle
        $perf = new Performans();
        $perf->artir($user['user_id'], $user['ofis_id'], 'arama_sayisi');

        // Müşteri kartına not ekle (varsa)
        if ($musteriId && $metin) {
            try {
                $musteriModel = new Musteri();
                $musteri = $musteriModel->findById($musteriId);
                if ($musteri) {
                    $mevcutNot = $musteri['notlar'] ?? '';
                    $yeniNot   = trim($mevcutNot . "\n\n[Sesli Not - " . date('d.m.Y H:i') . "]\n" . $metin);
                    $musteriModel->update($musteriId, ['notlar' => $yeniNot]);
                }
            } catch (\Exception $e) {}
        }

        // İlan kartına not ekle (varsa)
        if ($ilanId && $metin) {
            try {
                $ilanModel = new Ilan();
                $ilan = $ilanModel->findById($ilanId);
                if ($ilan) {
                    $mevcutNot = $ilan['notlar'] ?? '';
                    $yeniNot   = trim($mevcutNot . "\n\n[Sesli Not - " . date('d.m.Y H:i') . "]\n" . $metin);
                    $ilanModel->update($ilanId, ['notlar' => $yeniNot]);
                }
            } catch (\Exception $e) {}
        }

        // Görev kartına bağla (varsa)
        if ($hedefTip === 'gorev' && $hedefId) {
            try {
                $gorevModel = new Gorev();
                $gorev = $gorevModel->findById($hedefId);
                if ($gorev) {
                    $mevcutNot = $gorev['notlar'] ?? '';
                    $yeniNot   = trim($mevcutNot . "\n\n[Sesli Not - " . date('d.m.Y H:i') . "]\n" . ($metin ?? ''));
                    $gorevModel->update($hedefId, ['notlar' => $yeniNot]);
                }
            } catch (\Exception $e) {}
        }

        jsonResponse(true, [
            'arama_id'     => $aramaId,
            'dosya'        => $filename,
            'metin'        => $metin,
            'parse_sonucu' => $parseSonuc,
        ]);
        break;

    default:
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
