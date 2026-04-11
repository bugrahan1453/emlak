<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user   = Auth::requireLogin();
$action = $_GET['action'] ?? '';
$model  = new Ilan();

switch ($action) {
    case 'list':
        $filter = Auth::ofisFilter();
        $result = $model->getList(['ofis_id' => $filter['ofis_id']], 1, 50);
        jsonResponse(true, $result['data']);
        break;

    case 'search':
        $q = trim(getVal('q'));
        if (strlen($q) < 2) jsonResponse(true, []);
        $filter = Auth::ofisFilter();
        $result = $model->getList([
            'ofis_id' => $filter['ofis_id'],
            'q'       => $q,
        ], 1, 10);
        $data = array_map(fn($r) => [
            'id'     => $r['id'],
            'tip'    => 'ilan',
            'ikon'   => '🏠',
            'baslik' => $r['baslik'],
            'alt'    => formatFiyat((float)$r['fiyat']) . ' · ' . ($r['ilce'] ?? $r['sehir']),
            'url'    => APP_URL . '/ilan-detay.php?id=' . $r['id'],
        ], $result['data']);
        jsonResponse(true, $data);
        break;

    case 'get':
        $id   = (int)($_GET['id'] ?? 0);
        $ilan = $model->findById($id);
        if (!$ilan) jsonResponse(false, null, 'İlan bulunamadı.', 404);
        jsonResponse(true, $ilan);
        break;

    case 'create':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $data['ofis_id']  = $user['ofis_id'];
        $data['danisman_id'] = $user['user_id'];
        $id = $model->create($data);
        jsonResponse(true, ['id' => $id], 'İlan oluşturuldu.');
        break;

    case 'update':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);
        $id   = (int)($_GET['id'] ?? 0);
        // ofis_id yetki kontrolü
        $ilan = $model->findById($id);
        if (!$ilan) jsonResponse(false, null, 'İlan bulunamadı.', 404);
        if ($ilan['ofis_id'] && $ilan['ofis_id'] != $user['ofis_id']) {
            jsonResponse(false, null, 'Bu ilana erişim yetkiniz yok.', 403);
        }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $model->update($id, $data);
        jsonResponse(true, null, 'İlan güncellendi.');
        break;

    case 'delete':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);
        $id = (int)($_GET['id'] ?? 0);
        // ofis_id yetki kontrolü
        $ilan = $model->findById($id);
        if (!$ilan) jsonResponse(false, null, 'İlan bulunamadı.', 404);
        if ($ilan['ofis_id'] && $ilan['ofis_id'] != $user['ofis_id']) {
            jsonResponse(false, null, 'Bu ilana erişim yetkiniz yok.', 403);
        }
        $model->delete($id);
        jsonResponse(true, null, 'İlan silindi.');
        break;

    case 'stats':
        $filter = Auth::ofisFilter();
        $stats  = $model->getDashboardStats($filter['ofis_id']);
        jsonResponse(true, $stats);
        break;

    case 'son_ilanlar':
        $filter = Auth::ofisFilter();
        $ilanlar = $model->getSonIlanlar($filter['ofis_id'], 20);
        // AJAX ile dashboard güncellemesi için format
        ob_start();
        foreach ($ilanlar as $ilan) {
            $foto = is_array($ilan['fotograflar'] ?? null) && !empty($ilan['fotograflar'][0]) ? $ilan['fotograflar'][0] : null;
            echo '<div class="flex items-center gap-3 px-4 py-3 border-b hover:bg-white/2 transition-colors" style="border-color: rgba(255,255,255,0.04);">';
            echo '<div class="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style="background: rgba(255,255,255,0.05);">';
            echo $foto ? '<img src="' . APP_URL . '/uploads/fotograflar/' . htmlspecialchars(basename($foto)) . '" class="w-full h-full object-cover" loading="lazy">' : '<div class="w-full h-full flex items-center justify-center text-xl">🏠</div>';
            echo '</div>';
            echo '<div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-0.5">';
            echo '<a href="' . APP_URL . '/ilan-detay.php?id=' . (int)$ilan['id'] . '" class="text-sm font-medium truncate hover:text-cyan-400" style="color:#e8ecf4;">' . htmlspecialchars($ilan['baslik']) . '</a>';
            echo '</div><div class="flex items-center gap-3 text-xs" style="color:#7a8599;">';
            echo '<span class="font-mono font-semibold" style="color:#00d4ff;">' . formatFiyat((float)$ilan['fiyat']) . '</span>';
            echo '<span>📍 ' . htmlspecialchars($ilan['ilce'] ?? $ilan['sehir']) . '</span>';
            echo '<span class="ml-auto">' . zamanFarki($ilan['created_at']) . '</span>';
            echo '</div></div></div>';
        }
        $html = ob_get_clean();
        jsonResponse(true, ['html' => $html]);
        break;

    default:
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
