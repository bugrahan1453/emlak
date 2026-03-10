<?php
/**
 * EmlakRadar Pro - Performans Modeli
 */

class Performans {
    private PDO $db;

    public function __construct() {
        $this->db = db();
    }

    public function getSkorTablosu(int $ofisId, string $donem = 'ay'): array {
        $dateFilterMap = [
            'gun'   => 'AND p.tarih = CURDATE()',
            'hafta' => 'AND p.tarih >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)',
        ];
        $dateFilter = $dateFilterMap[$donem] ?? 'AND p.tarih >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';

        $stmt = $this->db->prepare("
            SELECT k.id, k.ad_soyad, k.avatar,
                   COALESCE(SUM(p.arama_sayisi), 0) as arama_sayisi,
                   COALESCE(SUM(p.randevu_sayisi), 0) as randevu_sayisi,
                   COALESCE(SUM(p.gosterim_sayisi), 0) as gosterim_sayisi,
                   COALESCE(SUM(p.portfoy_ekleme), 0) as portfoy_ekleme,
                   COALESCE(SUM(p.eslestirme_sayisi), 0) as eslestirme_sayisi,
                   COALESCE(SUM(p.arama_sayisi * 1 + p.randevu_sayisi * 3 + p.gosterim_sayisi * 2 + p.portfoy_ekleme * 5), 0) as efor_skoru
            FROM kullanicilar k
            LEFT JOIN performanslar p ON p.danisman_id = k.id $dateFilter
            WHERE k.ofis_id = ? AND k.durum = 'aktif' AND k.rol = 'danisman'
            GROUP BY k.id
            ORDER BY efor_skoru DESC
        ");
        $stmt->execute([$ofisId]);
        return $stmt->fetchAll();
    }

    public function getTrendData(int $danismanId, int $gunSayisi = 30): array {
        $stmt = $this->db->prepare("
            SELECT tarih,
                   arama_sayisi * 1 + randevu_sayisi * 3 + gosterim_sayisi * 2 + portfoy_ekleme * 5 as efor_skoru
            FROM performanslar
            WHERE danisman_id = ?
              AND tarih >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            ORDER BY tarih ASC
        ");
        $stmt->execute([$danismanId, $gunSayisi]);
        return $stmt->fetchAll();
    }

    public function artir(int $danismanId, int $ofisId, string $alan, int $miktar = 1): void {
        $allowed = ['arama_sayisi','randevu_sayisi','gosterim_sayisi','portfoy_ekleme','eslestirme_sayisi'];
        if (!in_array($alan, $allowed)) return;

        $stmt = $this->db->prepare("
            INSERT INTO performanslar (danisman_id, ofis_id, tarih, $alan)
            VALUES (?, ?, CURDATE(), ?)
            ON DUPLICATE KEY UPDATE $alan = $alan + ?
        ");
        $stmt->execute([$danismanId, $ofisId, $miktar, $miktar]);
        $this->guncelleEforSkoru($danismanId);
    }

    private function guncelleEforSkoru(int $danismanId): void {
        $this->db->prepare("
            UPDATE performanslar
            SET efor_skoru = arama_sayisi * 1 + randevu_sayisi * 3 + gosterim_sayisi * 2 + portfoy_ekleme * 5
            WHERE danisman_id = ? AND tarih = CURDATE()
        ")->execute([$danismanId]);
    }

    public function getBugunVerisi(int $danismanId): array {
        $stmt = $this->db->prepare("SELECT * FROM performanslar WHERE danisman_id = ? AND tarih = CURDATE()");
        $stmt->execute([$danismanId]);
        return $stmt->fetch() ?: [
            'arama_sayisi' => 0, 'randevu_sayisi' => 0,
            'gosterim_sayisi' => 0, 'portfoy_ekleme' => 0,
            'eslestirme_sayisi' => 0, 'efor_skoru' => 0,
        ];
    }
}
