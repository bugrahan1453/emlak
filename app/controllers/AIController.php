<?php
/**
 * EmlakRadar Pro - AI Controller
 */

class AIController {
    private AI $ai;

    public function __construct() {
        // Ofis ayarlarından API key al
        try {
            $user = Auth::user();
            if ($user) {
                $ofisModel = new Ofis();
                $ayarlar   = $ofisModel->getAyarlar($user['ofis_id']);
                $apiKey    = $ayarlar['openai_key'] ?? OPENAI_API_KEY;
            } else {
                $apiKey = OPENAI_API_KEY;
            }
        } catch (Exception $e) {
            $apiKey = OPENAI_API_KEY;
        }
        $this->ai = new AI($apiKey);
    }

    /**
     * İlan değerleme — JSON API endpoint
     */
    public function ilanDegerle(int $ilanId): void {
        $user = Auth::requireLogin();

        $ilanModel   = new Ilan();
        $emsalModel  = new EmsalVeri();
        $ilan        = $ilanModel->findById($ilanId);

        if (!$ilan) {
            jsonResponse(false, null, 'İlan bulunamadı.', 404);
        }

        $emsaller  = $emsalModel->getEmsaller($ilan['sehir'], $ilan['ilce'] ?? '', $ilan['mahalle'] ?? '');
        $degerleme = $this->ai->ilanDegerle($ilan, $emsaller);

        if (!empty($degerleme)) {
            $ilanModel->update($ilanId, ['ai_degerleme' => $degerleme]);
        }

        jsonResponse(true, $degerleme);
    }

    /**
     * Görev senaryosu üret
     */
    public function gorevSenaryo(int $gorevId): void {
        Auth::requireLogin();

        $gorevModel  = new Gorev();
        $gorev       = $gorevModel->findById($gorevId);

        if (!$gorev) {
            jsonResponse(false, null, 'Görev bulunamadı.', 404);
        }

        $musteri = null;
        if ($gorev['hedef_musteri_id']) {
            $musteriModel = new Musteri();
            $musteri = $musteriModel->findById($gorev['hedef_musteri_id']);
        }

        $ilan = null;
        if ($gorev['hedef_ilan_id']) {
            $ilanModel = new Ilan();
            $ilan = $ilanModel->findById($gorev['hedef_ilan_id']);
        }

        $senaryo = $this->ai->gorevSenaryo($gorev, $musteri, $ilan);
        $gorevModel->update($gorevId, ['ai_senaryo' => $senaryo]);

        jsonResponse(true, ['senaryo' => $senaryo]);
    }
}
