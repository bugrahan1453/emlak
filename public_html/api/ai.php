<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user   = Auth::requireLogin();
$action = $_GET['action'] ?? '';
$ctrl   = new AIController();

switch ($action) {
    case 'ilan_degerle':
        $ilanId = (int)($_GET['ilan_id'] ?? 0);
        if (!$ilanId) jsonResponse(false, null, 'İlan ID gerekli.', 400);
        $ctrl->ilanDegerle($ilanId);
        break;

    case 'gorev_senaryo':
        $gorevId = (int)($_GET['gorev_id'] ?? 0);
        if (!$gorevId) jsonResponse(false, null, 'Görev ID gerekli.', 400);
        $ctrl->gorevSenaryo($gorevId);
        break;

    default:
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
