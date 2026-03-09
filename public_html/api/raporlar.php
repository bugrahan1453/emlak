<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';

$user   = Auth::requireLogin();
$action = $_GET['action'] ?? '';
$ctrl   = new RaporController();

switch ($action) {
    case 'gerceklik_tokadi':
        $ilanId = (int)($_GET['id'] ?? 0);
        if (!$ilanId) {
            header('Content-Type: application/json');
            jsonResponse(false, null, 'İlan ID gerekli.', 400);
        }
        $ctrl->gerceklikTokadi($ilanId);
        break;

    case 'performans_raporu':
        $ctrl->performansRaporu();
        break;

    default:
        header('Content-Type: application/json; charset=utf-8');
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
