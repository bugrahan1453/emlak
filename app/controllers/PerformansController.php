<?php
/**
 * EmlakRadar Pro - Performans Controller
 */

class PerformansController {
    private Performans $model;

    public function __construct() {
        $this->model = new Performans();
    }

    public function index(): array {
        $user  = Auth::requireLogin();
        $donem = getVal('donem') ?: 'ay';

        if (!Auth::isBrokerOrAdmin()) {
            // Danışman sadece kendi verisini görür
            $danismanlar = [];
            $kisisel = $this->model->getBugunVerisi($user['user_id']);
            $trend   = $this->model->getTrendData($user['user_id']);
            return [
                'user'      => $user,
                'danismanlar' => [$kisisel],
                'trend'     => $trend,
                'donem'     => $donem,
                'sadece_kisisel' => true,
            ];
        }

        $danismanlar = $this->model->getSkorTablosu($user['ofis_id'], $donem);
        $trend       = [];
        if (!empty($danismanlar[0])) {
            $trend = $this->model->getTrendData($danismanlar[0]['id']);
        }

        return [
            'user'        => $user,
            'danismanlar' => $danismanlar,
            'trend'       => $trend,
            'donem'       => $donem,
            'sadece_kisisel' => false,
        ];
    }
}
