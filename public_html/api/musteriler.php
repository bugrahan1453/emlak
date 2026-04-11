<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user   = Auth::requireLogin();
$action = $_GET['action'] ?? '';
$model  = new Musteri();

switch ($action) {
    case 'list':
        $filter = Auth::ofisFilter();
        $result = $model->getList(['ofis_id' => $filter['ofis_id']], 1, 100);
        jsonResponse(true, $result['data']);
        break;

    case 'get':
        $id = (int)($_GET['id'] ?? 0);
        $m  = $model->findById($id);
        if (!$m) jsonResponse(false, null, 'Müşteri bulunamadı.', 404);
        jsonResponse(true, $m);
        break;

    case 'create':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $data['ofis_id']   = $user['ofis_id'];
        $data['danisman_id'] = $user['user_id'];
        $id = $model->create($data);
        jsonResponse(true, ['id' => $id], 'Müşteri oluşturuldu.');
        break;

    case 'update':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);
        $id   = (int)($_GET['id'] ?? 0);
        // ofis_id yetki kontrolü
        $musteri = $model->findById($id);
        if (!$musteri) jsonResponse(false, null, 'Müşteri bulunamadı.', 404);
        if ($musteri['ofis_id'] != $user['ofis_id']) {
            jsonResponse(false, null, 'Bu müşteriye erişim yetkiniz yok.', 403);
        }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $model->update($id, $data);
        jsonResponse(true, null, 'Müşteri güncellendi.');
        break;

    case 'son_iletisim_guncelle':
        $id = (int)($_GET['id'] ?? 0);
        // ofis_id yetki kontrolü
        $musteri = $model->findById($id);
        if (!$musteri) jsonResponse(false, null, 'Müşteri bulunamadı.', 404);
        if ($musteri['ofis_id'] != $user['ofis_id']) {
            jsonResponse(false, null, 'Bu müşteriye erişim yetkiniz yok.', 403);
        }
        $model->update($id, ['son_iletisim' => date('Y-m-d H:i:s')]);
        jsonResponse(true, null, 'Son iletişim güncellendi.');
        break;

    default:
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
