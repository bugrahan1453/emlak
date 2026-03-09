<?php
/**
 * EmlakRadar Pro - Görev Controller
 */

class GorevController {
    private Gorev $model;

    public function __construct() {
        $this->model = new Gorev();
    }

    public function index(): array {
        $user   = Auth::requireLogin();
        $filter = Auth::ofisFilter();

        $filters = [
            'ofis_id'    => $filter['ofis_id'],
            'danisman_id'=> $filter['danisman_id'],
            'tarih'      => getVal('tarih') ?: date('Y-m-d'),
            'tip'        => getVal('tip'),
            'oncelik'    => getVal('oncelik'),
            'tamamlandi' => getVal('tamamlandi') !== '' ? getVal('tamamlandi') : null,
        ];
        if (isset($filters['tamamlandi']) && $filters['tamamlandi'] === null) {
            unset($filters['tamamlandi']);
        }

        $sayfa    = max(1, (int)(getVal('sayfa') ?: 1));
        $gorevler = $this->model->getList($filters, $sayfa);

        return ['user' => $user, 'gorevler' => $gorevler, 'filters' => $filters];
    }

    public function store(): void {
        $user  = Auth::requireLogin();
        $token = postVal('csrf_token');
        if (!verifyCsrf($token)) jsonResponse(false, null, 'CSRF hatası.', 403);

        $hedefMusteriId = (int)postVal('hedef_musteri_id') ?: null;
        $hedefIlanId    = (int)postVal('hedef_ilan_id') ?: null;
        $aiSenaryo      = null;

        // AI senaryo oluştur
        if (postVal('ai_senaryo_olustur') === '1') {
            $aiHelper = new AI();
            $gorevData = [
                'tip'    => postVal('tip'),
                'baslik' => postVal('baslik'),
            ];
            $musteriData = null;
            if ($hedefMusteriId) {
                $musteriModel = new Musteri();
                $musteriData  = $musteriModel->findById($hedefMusteriId);
            }
            $ilanData = null;
            if ($hedefIlanId) {
                $ilanModel = new Ilan();
                $ilanData  = $ilanModel->findById($hedefIlanId);
            }
            $aiSenaryo = $aiHelper->gorevSenaryo($gorevData, $musteriData, $ilanData);
        }

        $data = [
            'danisman_id'      => Auth::isBrokerOrAdmin() && postVal('danisman_id') ? (int)postVal('danisman_id') : $user['user_id'],
            'ofis_id'          => $user['ofis_id'],
            'tip'              => postVal('tip') ?: 'diger',
            'oncelik'          => postVal('oncelik') ?: 'orta',
            'baslik'           => postVal('baslik'),
            'aciklama'         => postVal('aciklama'),
            'hedef_telefon'    => postVal('hedef_telefon'),
            'hedef_musteri_id' => $hedefMusteriId,
            'hedef_ilan_id'    => $hedefIlanId,
            'ai_senaryo'       => $aiSenaryo,
            'tarih'            => postVal('tarih') ?: date('Y-m-d'),
            'saat'             => postVal('saat') ?: null,
        ];

        if (!$data['baslik']) {
            flashMessage('error', 'Görev başlığı zorunludur.');
            redirect(APP_URL . '/gorevler.php');
        }

        $id = $this->model->create($data);
        logSystem('gorev_ekle', "Görev #$id eklendi", $user['user_id'], $user['ofis_id']);
        flashMessage('success', 'Görev eklendi.');
        redirect(APP_URL . '/gorevler.php');
    }

    public function complete(int $id): void {
        $user     = Auth::requireLogin();
        $sonucTipi= postVal('sonuc_tipi') ?: 'basarili';
        $sonuc    = postVal('sonuc');
        $this->model->tamamla($id, $sonucTipi, $sonuc);

        $perf = new Performans();
        $perf->artir($user['user_id'], $user['ofis_id'], 'arama_sayisi');

        jsonResponse(true, null, 'Görev tamamlandı.');
    }

    public function destroy(int $id): void {
        $user = Auth::requireLogin();
        $this->model->delete($id);
        logSystem('gorev_sil', "Görev #$id silindi", $user['user_id'], $user['ofis_id']);
        flashMessage('success', 'Görev silindi.');
        redirect(APP_URL . '/gorevler.php');
    }
}
