<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user   = Auth::requireLogin();
$action = $_GET['action'] ?? '';
$model  = new Gorev();

switch ($action) {
    case 'bugun':
        $filter  = Auth::ofisFilter();
        $gorevler = $model->getBugunGorevler($filter['ofis_id'], $filter['danisman_id']);
        jsonResponse(true, $gorevler);
        break;

    case 'tamamla':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);
        $id        = (int)($_GET['id'] ?? 0);
        $data      = json_decode(file_get_contents('php://input'), true) ?? [];
        $sonucTipi = $data['sonuc_tipi'] ?? 'basarili';
        $sonuc     = $data['sonuc'] ?? '';
        $model->tamamla($id, $sonucTipi, $sonuc);

        $perf = new Performans();
        $perf->artir($user['user_id'], $user['ofis_id'], 'arama_sayisi');

        jsonResponse(true, null, 'Görev tamamlandı.');
        break;

    case 'ai_senaryo':
        $id = (int)($_GET['id'] ?? 0);
        $ctrl = new AIController();
        $ctrl->gorevSenaryo($id);
        break;

    case 'create':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $data['ofis_id']   = $user['ofis_id'];
        $data['danisman_id'] = $user['user_id'];
        $id = $model->create($data);
        jsonResponse(true, ['id' => $id], 'Görev oluşturuldu.');
        break;

    case 'delete':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);
        $id = (int)($_GET['id'] ?? 0);
        $model->delete($id);
        jsonResponse(true, null, 'Görev silindi.');
        break;

    case 'sayac':
        $filter = Auth::ofisFilter();
        $sayac  = $model->getBugunSayisi($filter['ofis_id'], $filter['danisman_id']);
        jsonResponse(true, ['sayac' => $sayac]);
        break;

    default:
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
