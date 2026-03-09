<?php
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user   = Auth::requireLogin();
$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(false, null, 'POST gerekli.', 405);

$data = json_decode(file_get_contents('php://input'), true) ?? [];

$ofisModel = new Ofis();
$ayarlar   = $ofisModel->getAyarlar($user['ofis_id']);
$wa        = new WhatsApp(
    $ayarlar['whatsapp_token'] ?? WHATSAPP_TOKEN,
    $ayarlar['whatsapp_phone_id'] ?? WHATSAPP_PHONE_ID,
);

switch ($action) {
    case 'gonder':
        $to      = $data['telefon'] ?? '';
        $mesaj   = $data['mesaj'] ?? '';
        if (!$to || !$mesaj) jsonResponse(false, null, 'Telefon ve mesaj zorunlu.', 400);
        $result = $wa->sendText($to, $mesaj);
        jsonResponse($result['success'], null, $result['message'] ?? '');
        break;

    case 'ilan_gonder':
        $ilanId  = (int)($data['ilan_id'] ?? 0);
        $telefon = $data['telefon'] ?? '';
        if (!$ilanId || !$telefon) jsonResponse(false, null, 'İlan ID ve telefon zorunlu.', 400);
        $ilanModel = new Ilan();
        $ilan = $ilanModel->findById($ilanId);
        if (!$ilan) jsonResponse(false, null, 'İlan bulunamadı.', 404);
        $mesaj = sprintf(
            "🏠 *%s*\n\n📍 %s\n💰 %s\n📐 %s m² · %s\n\nDetaylar için iletişime geçin.",
            $ilan['baslik'],
            implode(' / ', array_filter([$ilan['ilce'], $ilan['mahalle']])),
            formatFiyat((float)$ilan['fiyat']),
            $ilan['metrekare'] ?? '-',
            $ilan['oda_sayisi'] ?? '-'
        );
        $result = $wa->sendText($telefon, $mesaj);
        jsonResponse($result['success'], null, $result['message'] ?? '');
        break;

    default:
        jsonResponse(false, null, 'Geçersiz eylem.', 400);
}
