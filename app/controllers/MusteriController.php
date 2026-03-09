<?php
/**
 * EmlakRadar Pro - Müşteri Controller
 */

class MusteriController {
    private Musteri $model;

    public function __construct() {
        $this->model = new Musteri();
    }

    public function index(): array {
        $user   = Auth::requireLogin();
        $filter = Auth::ofisFilter();

        $filters = [
            'ofis_id'    => $filter['ofis_id'],
            'danisman_id'=> $filter['danisman_id'],
            'tip'        => getVal('tip'),
            'durum'      => getVal('durum'),
            'butce_min'  => getVal('butce_min'),
            'butce_max'  => getVal('butce_max'),
            'q'          => getVal('q'),
        ];
        $filters = array_filter($filters, fn($v) => $v !== '' && $v !== null);

        $sayfa  = max(1, (int)(getVal('sayfa') ?: 1));
        $result = $this->model->getList($filters, $sayfa);

        return ['user' => $user, 'musteriler' => $result, 'filters' => $filters];
    }

    public function show(int $id): ?array {
        $user    = Auth::requireLogin();
        $musteri = $this->model->findById($id);
        if (!$musteri) return null;

        $eslestirmeler = $this->model->getEslestirmeGecmisi($id);
        $aramalar      = $this->model->getAramaGecmisi($id);

        return [
            'user'         => $user,
            'musteri'      => $musteri,
            'eslestirmeler'=> $eslestirmeler,
            'aramalar'     => $aramalar,
        ];
    }

    public function store(): void {
        $user  = Auth::requireLogin();
        $token = postVal('csrf_token');
        if (!verifyCsrf($token)) {
            flashMessage('error', 'Güvenlik doğrulaması başarısız.');
            redirect(APP_URL . '/musteri-ekle.php');
        }

        $tercihler = [
            'sehir'        => postVal('tercih_sehir'),
            'ilce'         => postVal('tercih_ilce'),
            'emlak_tipi'   => postVal('tercih_emlak_tipi'),
            'oda_sayisi'   => postVal('tercih_oda'),
            'metrekare_min'=> (int)postVal('tercih_m2_min') ?: null,
            'metrekare_max'=> (int)postVal('tercih_m2_max') ?: null,
        ];
        $tercihler = array_filter($tercihler);

        $data = [
            'ofis_id'    => $user['ofis_id'],
            'danisman_id'=> $user['user_id'],
            'ad_soyad'   => postVal('ad_soyad'),
            'telefon'    => postVal('telefon'),
            'email'      => postVal('email') ?: null,
            'tip'        => postVal('tip') ?: 'alici',
            'butce_min'  => postVal('butce_min') ? (float)str_replace(['.', ','], ['', '.'], postVal('butce_min')) : null,
            'butce_max'  => postVal('butce_max') ? (float)str_replace(['.', ','], ['', '.'], postVal('butce_max')) : null,
            'tercihler'  => $tercihler,
            'notlar'     => postVal('notlar'),
        ];

        if (!$data['ad_soyad'] || !$data['telefon']) {
            flashMessage('error', 'Ad soyad ve telefon zorunludur.');
            redirect(APP_URL . '/musteri-ekle.php');
        }

        $id = $this->model->create($data);
        logSystem('musteri_ekle', "Müşteri #$id eklendi", $user['user_id'], $user['ofis_id']);
        flashMessage('success', 'Müşteri başarıyla eklendi.');
        redirect(APP_URL . '/musteri-detay.php?id=' . $id);
    }

    public function update(int $id): void {
        $user  = Auth::requireLogin();
        $token = postVal('csrf_token');
        if (!verifyCsrf($token)) {
            flashMessage('error', 'Güvenlik doğrulaması başarısız.');
            redirect(APP_URL . '/musteri-ekle.php?id=' . $id);
        }

        $tercihler = [
            'sehir'        => postVal('tercih_sehir'),
            'ilce'         => postVal('tercih_ilce'),
            'emlak_tipi'   => postVal('tercih_emlak_tipi'),
            'oda_sayisi'   => postVal('tercih_oda'),
            'metrekare_min'=> (int)postVal('tercih_m2_min') ?: null,
            'metrekare_max'=> (int)postVal('tercih_m2_max') ?: null,
        ];

        $data = [
            'ad_soyad'   => postVal('ad_soyad'),
            'telefon'    => postVal('telefon'),
            'email'      => postVal('email') ?: null,
            'tip'        => postVal('tip') ?: 'alici',
            'butce_min'  => postVal('butce_min') ? (float)str_replace(['.', ','], ['', '.'], postVal('butce_min')) : null,
            'butce_max'  => postVal('butce_max') ? (float)str_replace(['.', ','], ['', '.'], postVal('butce_max')) : null,
            'tercihler'  => array_filter($tercihler),
            'notlar'     => postVal('notlar'),
            'durum'      => postVal('durum') ?: 'aktif',
        ];

        $this->model->update($id, $data);
        logSystem('musteri_guncelle', "Müşteri #$id güncellendi", $user['user_id'], $user['ofis_id']);
        flashMessage('success', 'Müşteri güncellendi.');
        redirect(APP_URL . '/musteri-detay.php?id=' . $id);
    }

    public function destroy(int $id): void {
        $user = Auth::requireLogin();
        $this->model->delete($id);
        logSystem('musteri_sil', "Müşteri #$id silindi", $user['user_id'], $user['ofis_id']);
        flashMessage('success', 'Müşteri silindi.');
        redirect(APP_URL . '/musteriler.php');
    }
}
