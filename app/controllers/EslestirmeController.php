<?php
/**
 * EmlakRadar Pro - Eşleştirme Controller
 */

class EslestirmeController {
    private Eslestirme $model;

    public function __construct() {
        $this->model = new Eslestirme();
    }

    public function index(): array {
        $user    = Auth::requireLogin();
        $sayfa   = max(1, (int)(getVal('sayfa') ?: 1));
        $filters = [
            'durum'     => getVal('durum'),
            'musteri_id'=> getVal('musteri_id') ? (int)getVal('musteri_id') : null,
            'ilan_id'   => getVal('ilan_id') ? (int)getVal('ilan_id') : null,
        ];
        $filters = array_filter($filters, fn($v) => $v !== '' && $v !== null);

        $result = $this->model->getList($user['ofis_id'], $filters, $sayfa);
        return ['user' => $user, 'eslestirmeler' => $result];
    }

    /**
     * İlan için otomatik eşleştirme yap
     */
    public function otomatikEslestir(int $ilanId): array {
        $user      = Auth::requireLogin();
        $ilanModel = new Ilan();
        $ilan      = $ilanModel->findById($ilanId);
        if (!$ilan) return ['eslestirilen' => 0];

        $musteriModel = new Musteri();
        $musteriler   = $musteriModel->getList([
            'ofis_id' => $user['ofis_id'],
            'durum'   => 'aktif',
        ], 1, 200)['data'];

        $eslestirilen = 0;
        foreach ($musteriler as $musteri) {
            $skor = $this->model->hesaplaSkor($ilan, $musteri);
            if ($skor >= 50) {
                $this->model->create([
                    'ofis_id'   => $user['ofis_id'],
                    'ilan_id'   => $ilanId,
                    'musteri_id'=> $musteri['id'],
                    'skor'      => $skor,
                ]);
                $eslestirilen++;

                // Bildirim oluştur
                $bildirimModel = new Bildirim();
                $bildirimModel->create(
                    $musteri['danisman_id'] ?? $user['user_id'],
                    $user['ofis_id'],
                    'eslestirme',
                    'Yeni Eşleştirme: ' . $ilan['baslik'],
                    "Müşteri {$musteri['ad_soyad']} için %$skor uyum skoru",
                    APP_URL . '/eslestirmeler.php'
                );
            }
        }

        return ['eslestirilen' => $eslestirilen];
    }

    public function updateDurum(int $id, string $durum): void {
        $user = Auth::requireLogin();
        $this->model->update($id, ['durum' => $durum]);

        if ($durum === 'bildirildi') {
            $this->model->update($id, ['bildirim_tarihi' => date('Y-m-d H:i:s')]);
            $perf = new Performans();
            $perf->artir($user['user_id'], $user['ofis_id'], 'eslestirme_sayisi');
        }

        jsonResponse(true, null, 'Eşleştirme durumu güncellendi.');
    }

    public function whatsappGonder(int $id): void {
        $user        = Auth::requireLogin();
        $eslestirme  = $this->model->findById($id);
        if (!$eslestirme) jsonResponse(false, null, 'Eşleştirme bulunamadı.', 404);

        $wa     = new WhatsApp();
        $result = $wa->sendEslestirme(
            $eslestirme['musteri_tel'],
            $eslestirme,
            $eslestirme,
            $eslestirme['skor']
        );

        if ($result['success']) {
            $this->model->update($id, ['durum' => 'bildirildi', 'bildirim_tarihi' => date('Y-m-d H:i:s')]);
        }

        jsonResponse($result['success'], null, $result['message'] ?? '');
    }
}
