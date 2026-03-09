<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$action = $_GET['action'] ?? $_POST['action'] ?? '';

$ctrl = new AuthController();

switch ($action) {
    case 'login':
        $ctrl->apiLogin();
        break;
    case 'logout':
        Auth::logout();
        jsonResponse(true, null, 'Çıkış yapıldı.');
        break;
    case 'me':
        $user = Auth::apiAuth();
        jsonResponse(true, $user);
        break;
    default:
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
