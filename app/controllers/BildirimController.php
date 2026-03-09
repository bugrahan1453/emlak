<?php
/**
 * EmlakRadar Pro - Bildirim Controller
 */

class BildirimController {
    private Bildirim $model;

    public function __construct() {
        $this->model = new Bildirim();
    }

    public function list(): void {
        $user = Auth::requireLogin();
        $bildirimler = $this->model->getList($user['user_id'], 30);

        $formatted = array_map(function ($b) {
            return [
                'id'     => $b['id'],
                'tip'    => $b['tip'],
                'baslik' => $b['baslik'],
                'icerik' => $b['icerik'],
                'link'   => $b['link'],
                'okundu' => (bool)$b['okundu'],
                'ikon'   => $this->model->tipIkon($b['tip']),
                'zaman'  => zamanFarki($b['created_at']),
            ];
        }, $bildirimler);

        jsonResponse(true, $formatted);
    }

    public function okunduIsaretle(int $id): void {
        $user = Auth::requireLogin();
        $this->model->okunduIsaretle($id, $user['user_id']);
        jsonResponse(true);
    }

    public function tumunuOku(): void {
        $user = Auth::requireLogin();
        $this->model->tumunuOku($user['user_id']);
        jsonResponse(true);
    }

    public function getSayac(): void {
        $user  = Auth::requireLogin();
        $sayac = $this->model->getOkunmamisSayisi($user['user_id']);
        jsonResponse(true, ['sayac' => $sayac]);
    }
}
