<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user   = Auth::requireLogin();
$islem  = $_GET['islem'] ?? ($_GET['action'] ?? '');
$ctrl   = new AIController();

// POST body JSON parse
$input = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true) ?: $_POST;
}

switch ($islem) {
    case 'ilan_degerle':
        $ilanId = (int)($input['ilan_id'] ?? $_GET['ilan_id'] ?? 0);
        if (!$ilanId) jsonResponse(false, null, 'İlan ID gerekli.', 400);
        $ctrl->ilanDegerle($ilanId);
        break;

    case 'fotograf_analiz':
        $ilanId = (int)($input['ilan_id'] ?? 0);
        if (!$ilanId) jsonResponse(false, null, 'İlan ID gerekli.', 400);
        $ctrl->fotografAnaliz($ilanId);
        break;

    case 'satici_psikoloji':
        $ilanId = (int)($input['ilan_id'] ?? 0);
        if (!$ilanId) jsonResponse(false, null, 'İlan ID gerekli.', 400);
        $ctrl->saticiPsikoloji($ilanId);
        break;

    case 'emsal_deger':
        $ilanId = (int)($input['ilan_id'] ?? 0);
        if (!$ilanId) jsonResponse(false, null, 'İlan ID gerekli.', 400);
        $ctrl->emsalDeger($ilanId);
        break;

    case 'konusma_senaryosu':
    case 'gorev_senaryo':
        $gorevId = (int)($input['gorev_id'] ?? $_GET['gorev_id'] ?? 0);
        if (!$gorevId) jsonResponse(false, null, 'Görev ID gerekli.', 400);
        $ctrl->gorevSenaryo($gorevId);
        break;

    case 'eslestirme_skoru':
        $musteriId = (int)($input['musteri_id'] ?? 0);
        $ilanId    = (int)($input['ilan_id'] ?? 0);
        if (!$musteriId || !$ilanId) jsonResponse(false, null, 'Müşteri ID ve İlan ID gerekli.', 400);
        $ctrl->eslestirmeSkoruHesapla($musteriId, $ilanId);
        break;

    case 'sesli_not_parse':
        $metin = $input['metin'] ?? '';
        if (empty($metin)) jsonResponse(false, null, 'Metin gerekli.', 400);
        $ctrl->sesliNotParse($metin);
        break;

    default:
        jsonResponse(false, null, 'Geçersiz işlem.', 400);
}
