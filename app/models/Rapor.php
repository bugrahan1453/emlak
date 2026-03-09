<?php
/**
 * EmlakRadar Pro - Rapor Modeli
 */

class Rapor {
    private PDO $db;

    public function __construct() {
        $this->db = db();
    }

    public function create(array $data): int {
        $stmt = $this->db->prepare("
            INSERT INTO raporlar (ofis_id, olusturan_id, tip, ilan_id, musteri_id, dosya_yolu, ayarlar)
            VALUES (:ofis_id, :olusturan_id, :tip, :ilan_id, :musteri_id, :dosya_yolu, :ayarlar)
        ");
        $stmt->execute([
            ':ofis_id'      => $data['ofis_id'],
            ':olusturan_id' => $data['olusturan_id'],
            ':tip'          => $data['tip'],
            ':ilan_id'      => $data['ilan_id'] ?? null,
            ':musteri_id'   => $data['musteri_id'] ?? null,
            ':dosya_yolu'   => $data['dosya_yolu'] ?? null,
            ':ayarlar'      => isset($data['ayarlar']) ? json_encode($data['ayarlar'], JSON_UNESCAPED_UNICODE) : null,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function getList(int $ofisId, int $limit = 20): array {
        $stmt = $this->db->prepare("
            SELECT r.*, k.ad_soyad as olusturan_ad,
                   i.baslik as ilan_baslik, m.ad_soyad as musteri_ad
            FROM raporlar r
            JOIN kullanicilar k ON k.id = r.olusturan_id
            LEFT JOIN ilanlar i ON i.id = r.ilan_id
            LEFT JOIN musteriler m ON m.id = r.musteri_id
            WHERE r.ofis_id = ?
            ORDER BY r.created_at DESC
            LIMIT ?
        ");
        $stmt->execute([$ofisId, $limit]);
        return $stmt->fetchAll();
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare("SELECT * FROM raporlar WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function delete(int $id): bool {
        $stmt = $this->db->prepare("DELETE FROM raporlar WHERE id = ?");
        return $stmt->execute([$id]);
    }
}
