<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user   = Auth::requireLogin();
$action = $_GET['action'] ?? '';
$ctrl   = new BildirimController();

switch ($action) {
    case 'list':
        $ctrl->list();
        break;
    case 'oku':
        $id = (int)($_GET['id'] ?? 0);
        $ctrl->okunduIsaretle($id);
        break;
    case 'tumunu_oku':
        $ctrl->tumunuOku();
        break;
    case 'sayac':
        $ctrl->getSayac();
        break;
    default:
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
