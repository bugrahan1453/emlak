<?php
/**
 * EmlakRadar Pro — Rapor API Endpoint
 * POST /api/raporlar.php?tip=gerceklik_tokadi  body: {ilan_id: 5}
 * POST /api/raporlar.php?tip=roi               body: {ilan_id: 5, kira_fiyati: 15000}
 * POST /api/raporlar.php?tip=portfoy           body: {filtreler: {...}}
 * GET  /api/raporlar.php?tip=liste
 */
require_once dirname(__DIR__, 2) . '/app/config/app.php';
header('Content-Type: application/json; charset=utf-8');

$user = Auth::requireLogin();
$tip  = $_GET['tip'] ?? ($_GET['action'] ?? '');
$db   = db();

$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true) ?? $_POST;
}

try {
    $pdfHelper = new PDF();

    switch ($tip) {
        /* ── Gerçeklik Tokadı ──────────────────────────────────────── */
        case 'gerceklik_tokadi':
            $ilanId = (int)($body['ilan_id'] ?? $_GET['ilan_id'] ?? 0);
            if (!$ilanId) jsonResponse(false, null, 'ilan_id gerekli.', 400);

            $html  = $pdfHelper->gerceklikTokadi($ilanId);
            $dosya = $pdfHelper->kaydet($html, 'gerceklik_tokadi_' . $ilanId);

            $db->prepare("INSERT INTO raporlar (tip, ilan_id, danisman_id, ofis_id, dosya_yolu, created_at) VALUES ('gerceklik_tokadi',?,?,?,?,NOW())")
               ->execute([$ilanId, Auth::id(), $user['ofis_id'], $dosya]);

            jsonResponse(true, [
                'url'   => APP_URL . '/uploads/raporlar/' . $dosya,
                'dosya' => $dosya,
            ], 'Rapor oluşturuldu.');
            break;

        /* ── ROI Raporu ────────────────────────────────────────────── */
        case 'roi':
            $ilanId     = (int)($body['ilan_id'] ?? 0);
            $kiraFiyati = (float)($body['kira_fiyati'] ?? 0);
            if (!$ilanId || $kiraFiyati <= 0) jsonResponse(false, null, 'ilan_id ve kira_fiyati gerekli.', 400);

            $html  = $pdfHelper->roiRaporu($ilanId, $kiraFiyati);
            $dosya = $pdfHelper->kaydet($html, 'roi_' . $ilanId);

            $db->prepare("INSERT INTO raporlar (tip, ilan_id, danisman_id, ofis_id, dosya_yolu, parametreler, created_at) VALUES ('roi',?,?,?,?,?,NOW())")
               ->execute([$ilanId, Auth::id(), $user['ofis_id'], $dosya, json_encode(['kira_fiyati' => $kiraFiyati])]);

            jsonResponse(true, [
                'url'   => APP_URL . '/uploads/raporlar/' . $dosya,
                'dosya' => $dosya,
            ], 'ROI raporu oluşturuldu.');
            break;

        /* ── Portföy Raporu ────────────────────────────────────────── */
        case 'portfoy':
            $filtreler = $body['filtreler'] ?? [];
            $ofisId    = (int)($filtreler['ofis_id'] ?? $user['ofis_id'] ?? 0);
            if (!$ofisId) jsonResponse(false, null, 'ofis_id gerekli.', 400);

            $html  = $pdfHelper->portfoyRaporu($ofisId, $filtreler);
            $dosya = $pdfHelper->kaydet($html, 'portfoy_' . $ofisId);

            $db->prepare("INSERT INTO raporlar (tip, danisman_id, ofis_id, dosya_yolu, parametreler, created_at) VALUES ('portfoy',?,?,?,?,NOW())")
               ->execute([Auth::id(), $ofisId, $dosya, json_encode($filtreler)]);

            jsonResponse(true, [
                'url'   => APP_URL . '/uploads/raporlar/' . $dosya,
                'dosya' => $dosya,
            ], 'Portföy raporu oluşturuldu.');
            break;

        /* ── Son raporlar listesi ──────────────────────────────────── */
        case 'liste':
            $limit    = min((int)($_GET['limit'] ?? 20), 50);
            $st = $db->prepare("
                SELECT r.*, k.ad_soyad AS danisman_adi, i.baslik AS ilan_baslik
                FROM raporlar r
                LEFT JOIN kullanicilar k ON r.danisman_id = k.id
                LEFT JOIN ilanlar i ON r.ilan_id = i.id
                WHERE r.danisman_id = ? OR r.ofis_id = ?
                ORDER BY r.created_at DESC LIMIT ?
            ");
            $st->execute([Auth::id(), $user['ofis_id'], $limit]);
            jsonResponse(true, $st->fetchAll());
            break;

        /* ── İlan arama (autocomplete) ─────────────────────────────── */
        case 'ilan_ara':
            $q = trim($_GET['q'] ?? '');
            if (strlen($q) < 2) { jsonResponse(true, []); break; }
            $st = $db->prepare("
                SELECT id, baslik, fiyat, ilce, mahalle, metrekare, oda_sayisi
                FROM ilanlar WHERE (baslik LIKE ? OR ilce LIKE ? OR mahalle LIKE ?)
                  AND danisman_id = ? AND durum = 'aktif'
                ORDER BY created_at DESC LIMIT 10
            ");
            $like = '%' . $q . '%';
            $st->execute([$like, $like, $like, Auth::id()]);
            jsonResponse(true, $st->fetchAll());
            break;

        /* ── WhatsApp rapor gönder ─────────────────────────────────── */
        case 'whatsapp_gonder':
            $telefon  = $body['telefon'] ?? '';
            $raporUrl = $body['rapor_url'] ?? '';
            $musteri  = $body['musteri'] ?? ['ad_soyad' => 'Değerli Müşterimiz'];
            $raporTip = $body['rapor_tipi'] ?? 'rapor';

            if (!$telefon || !$raporUrl) jsonResponse(false, null, 'telefon ve rapor_url gerekli.', 400);

            $wa    = new WhatsApp();
            $mesaj = $wa->raporMesaji($musteri, $raporTip, $raporUrl);
            $link  = $wa->webLink($telefon, $mesaj);
            $sonuc = $wa->gondеr($telefon, $mesaj);
            jsonResponse(true, array_merge($sonuc, ['web_link' => $link]));
            break;

        default:
            jsonResponse(false, null, 'Geçersiz tip: ' . htmlspecialchars($tip), 400);
    }

} catch (Exception $e) {
    error_log('[RaporAPI] ' . $e->getMessage());
    jsonResponse(false, null, $e->getMessage(), 500);
}
