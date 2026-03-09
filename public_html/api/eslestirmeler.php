<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user   = Auth::requireLogin();
$action = $_GET['action'] ?? '';
$ctrl   = new EslestirmeController();

switch ($action) {
    case 'otomatik':
        $ilanId = (int)($_GET['ilan_id'] ?? 0);
        if (!$ilanId) jsonResponse(false, null, 'İlan ID gerekli.', 400);
        $result = $ctrl->otomatikEslestir($ilanId);
        jsonResponse(true, $result, $result['eslestirilen'] . ' eşleştirme oluşturuldu.');
        break;

    case 'durum':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);
        $id    = (int)($_GET['id'] ?? 0);
        $data  = json_decode(file_get_contents('php://input'), true) ?? [];
        $durum = $data['durum'] ?? '';
        $ctrl->updateDurum($id, $durum);
        break;

    case 'whatsapp':
        $id = (int)($_GET['id'] ?? 0);
        $ctrl->whatsappGonder($id);
        break;

    default:
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
