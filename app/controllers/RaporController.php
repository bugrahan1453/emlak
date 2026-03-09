<?php
/**
 * EmlakRadar Pro - Rapor Controller
 */

class RaporController {
    private Rapor $model;
    private PDF   $pdf;

    public function __construct() {
        $this->model = new Rapor();
        $this->pdf   = new PDF();
    }

    public function index(): array {
        $user    = Auth::requireLogin();
        $raporlar = $this->model->getList($user['ofis_id']);
        return ['user' => $user, 'raporlar' => $raporlar];
    }

    public function gerceklikTokadi(int $ilanId): void {
        $user      = Auth::requireLogin();
        $ilanModel = new Ilan();
        $emsalModel= new EmsalVeri();
        $aiCtrl    = new AIController();

        $ilan     = $ilanModel->findById($ilanId);
        if (!$ilan) jsonResponse(false, null, 'İlan bulunamadı.', 404);

        $emsaller  = $emsalModel->getEmsaller($ilan['sehir'], $ilan['ilce'] ?? '', $ilan['mahalle'] ?? '');
        $degerleme = is_array($ilan['ai_degerleme']) ? $ilan['ai_degerleme'] : [];

        // AI değerleme yoksa üret
        if (empty($degerleme)) {
            $ai        = new AI();
            $degerleme = $ai->ilanDegerle($ilan, $emsaller);
            if (!empty($degerleme)) {
                $ilanModel->update($ilanId, ['ai_degerleme' => $degerleme]);
            }
        }

        $html     = $this->pdf->gerceklikTokadi($ilan, $emsaller, $degerleme);
        $filename = 'gerceklik_tokadi_ilan_' . $ilanId;
        $path     = $this->pdf->saveHtml($html, $filename);

        $raporId  = $this->model->create([
            'ofis_id'    => $user['ofis_id'],
            'olusturan_id'=> $user['user_id'],
            'tip'        => 'gerceklik_tokadi',
            'ilan_id'    => $ilanId,
            'dosya_yolu' => basename($path),
        ]);

        logSystem('rapor_olustur', "Gerçeklik Tokadı Raporu #$raporId", $user['user_id'], $user['ofis_id']);

        // HTML olarak gönder
        header('Content-Type: text/html; charset=utf-8');
        echo $html;
        exit;
    }

    public function performansRaporu(): void {
        $user = Auth::requireRole(['admin','broker']);

        $perfModel   = new Performans();
        $donem       = getVal('donem') ?: 'ay';
        $danismanlar = $perfModel->getSkorTablosu($user['ofis_id'], $donem);

        $donemLabel  = match($donem) {
            'gun'   => 'Bugün',
            'hafta' => 'Bu Hafta',
            default => 'Bu Ay',
        };

        $html = $this->pdf->performansRaporu($danismanlar, $donemLabel);

        header('Content-Type: text/html; charset=utf-8');
        echo $html;
        exit;
    }
}
