<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user   = Auth::requireLogin();
$action = $_GET['action'] ?? '';
$model  = new Performans();

switch ($action) {
    case 'artir':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);
        $data  = json_decode(file_get_contents('php://input'), true) ?? [];
        $alan  = $data['alan'] ?? '';
        $miktar= (int)($data['miktar'] ?? 1);
        $model->artir($user['user_id'], $user['ofis_id'], $alan, $miktar);
        jsonResponse(true, null, 'Performans güncellendi.');
        break;

    case 'bugun':
        $veri = $model->getBugunVerisi($user['user_id']);
        jsonResponse(true, $veri);
        break;

    case 'skor_tablosu':
        Auth::requireRole(['admin', 'broker']);
        $donem = getVal('donem') ?: 'ay';
        $data  = $model->getSkorTablosu($user['ofis_id'], $donem);
        jsonResponse(true, $data);
        break;

    default:
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
