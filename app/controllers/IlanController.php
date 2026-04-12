<?php
/**
 * EmlakRadar Pro - İlan Controller
 */

class IlanController {
    private Ilan $model;

    public function __construct() {
        $this->model = new Ilan();
    }

    public function index(): array {
        $user    = Auth::requireLogin();
        $filter  = Auth::ofisFilter();

        $filters = [
            'ofis_id'    => $filter['ofis_id'],
            'danisman_id'=> $filter['danisman_id'],
            'sehir'      => getVal('sehir'),
            'ilce'       => getVal('ilce'),
            'mahalle'    => getVal('mahalle'),
            'ilan_tipi'  => getVal('ilan_tipi'),
            'emlak_tipi' => getVal('emlak_tipi'),
            'durum'      => getVal('durum'),
            'kaynak_site'=> getVal('kaynak_site'),
            'oda_sayisi' => getVal('oda_sayisi'),
            'fiyat_min'  => getVal('fiyat_min'),
            'fiyat_max'  => getVal('fiyat_max'),
            'q'          => getVal('q'),
            'fiyat_dusen'   => getVal('fiyat_dusen'),
            'fiyat_artan'   => getVal('fiyat_artan'),
            'uzun_suredir'  => getVal('uzun_suredir'),
            'son_gorulmeyen'=> getVal('son_gorulmeyen'),
        ];
        $filters = array_filter($filters, fn($v) => $v !== '' && $v !== null);

        $sayfa  = max(1, (int)(getVal('sayfa') ?: 1));
        $result = $this->model->getList($filters, $sayfa);

        return ['user' => $user, 'ilanlar' => $result, 'filters' => $filters];
    }

    public function show(int $id): ?array {
        $user = Auth::requireLogin();
        $ilan = $this->model->findById($id);
        if (!$ilan) return null;
        $this->model->incrementGoruntulenme($id);
        return ['user' => $user, 'ilan' => $ilan];
    }

    public function store(): void {
        $user = Auth::requireLogin();
        $token = postVal('csrf_token');
        if (!verifyCsrf($token)) jsonResponse(false, null, 'CSRF hatası.', 403);

        $data = [
            'ofis_id'     => $user['ofis_id'],
            'danisman_id' => $user['user_id'],
            'baslik'      => postVal('baslik'),
            'aciklama'    => postVal('aciklama'),
            'fiyat'       => (float)str_replace(['.', ','], ['', '.'], postVal('fiyat')),
            'sehir'       => postVal('sehir'),
            'ilce'        => postVal('ilce'),
            'mahalle'     => postVal('mahalle'),
            'adres'       => postVal('adres'),
            'lat'         => postVal('lat') ?: null,
            'lng'         => postVal('lng') ?: null,
            'metrekare'   => (int)postVal('metrekare') ?: null,
            'oda_sayisi'  => postVal('oda_sayisi'),
            'kat'         => postVal('kat'),
            'bina_yasi'   => (int)postVal('bina_yasi') ?: null,
            'isitma_tipi' => postVal('isitma_tipi'),
            'esya_durumu' => postVal('esya_durumu') ?: null,
            'ilan_tipi'   => postVal('ilan_tipi') ?: 'satilik',
            'emlak_tipi'  => postVal('emlak_tipi') ?: 'daire',
            'notlar'      => postVal('notlar'),
            'kaynak_site' => 'manuel',
        ];

        if (!$data['baslik'] || !$data['fiyat'] || !$data['sehir']) {
            flashMessage('error', 'Başlık, fiyat ve şehir zorunludur.');
            redirect(APP_URL . '/ilan-ekle.php');
        }

        $id = $this->model->create($data);
        $this->handlePhotoUpload($id);

        $perf = new Performans();
        $perf->artir($user['user_id'], $user['ofis_id'], 'portfoy_ekleme');

        logSystem('ilan_ekle', "İlan #$id eklendi", $user['user_id'], $user['ofis_id']);
        flashMessage('success', 'İlan başarıyla eklendi.');
        redirect(APP_URL . '/ilan-detay.php?id=' . $id);
    }

    public function update(int $id): void {
        $user = Auth::requireLogin();
        $token = postVal('csrf_token');
        if (!verifyCsrf($token)) jsonResponse(false, null, 'CSRF hatası.', 403);

        $ilan = $this->model->findById($id);
        if (!$ilan) {
            flashMessage('error', 'İlan bulunamadı.');
            redirect(APP_URL . '/ilanlar.php');
        }

        $eskiFiyat = (float)$ilan['fiyat'];
        $yeniFiyat = (float)str_replace(['.', ','], ['', '.'], postVal('fiyat'));

        if ($eskiFiyat !== $yeniFiyat && $yeniFiyat > 0) {
            $this->model->addFiyatGecmisi($id, $yeniFiyat);
        }

        $data = [
            'baslik'     => postVal('baslik'),
            'aciklama'   => postVal('aciklama'),
            'fiyat'      => $yeniFiyat,
            'sehir'      => postVal('sehir'),
            'ilce'       => postVal('ilce'),
            'mahalle'    => postVal('mahalle'),
            'adres'      => postVal('adres'),
            'metrekare'  => (int)postVal('metrekare') ?: null,
            'oda_sayisi' => postVal('oda_sayisi'),
            'kat'        => postVal('kat'),
            'bina_yasi'  => (int)postVal('bina_yasi') ?: null,
            'isitma_tipi'=> postVal('isitma_tipi'),
            'esya_durumu'=> postVal('esya_durumu') ?: null,
            'ilan_tipi'  => postVal('ilan_tipi'),
            'emlak_tipi' => postVal('emlak_tipi'),
            'durum'      => postVal('durum') ?: 'aktif',
            'notlar'     => postVal('notlar'),
        ];

        $this->model->update($id, $data);
        $this->handlePhotoUpload($id);

        logSystem('ilan_guncelle', "İlan #$id güncellendi", $user['user_id'], $user['ofis_id']);
        flashMessage('success', 'İlan güncellendi.');
        redirect(APP_URL . '/ilan-detay.php?id=' . $id);
    }

    public function destroy(int $id): void {
        $user = Auth::requireLogin();
        $this->model->delete($id);
        logSystem('ilan_sil', "İlan #$id silindi", $user['user_id'], $user['ofis_id']);
        flashMessage('success', 'İlan silindi.');
        redirect(APP_URL . '/ilanlar.php');
    }

    private function handlePhotoUpload(int $ilanId): void {
        if (empty($_FILES['fotograflar']['name'][0])) return;
        $dir = UPLOAD_PHOTOS;
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        $ilan = $this->model->findById($ilanId);
        $mevcutFotolar = is_array($ilan['fotograflar']) ? $ilan['fotograflar'] : [];

        foreach ($_FILES['fotograflar']['tmp_name'] as $i => $tmpName) {
            if (!is_uploaded_file($tmpName)) continue;
            $mime = mime_content_type($tmpName);
            if (!in_array($mime, ALLOWED_IMG_TYPES)) continue;
            if ($_FILES['fotograflar']['size'][$i] > MAX_UPLOAD_SIZE) continue;

            $filename = safeFileName($_FILES['fotograflar']['name'][$i]);
            $dest = $dir . '/' . $filename;
            if (move_uploaded_file($tmpName, $dest)) {
                $mevcutFotolar[] = $filename;
            }
        }

        $this->model->update($ilanId, ['fotograflar' => $mevcutFotolar]);
    }
}
