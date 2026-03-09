<?php
/**
 * EmlakRadar Pro - Arama Kaydı Modeli
 */

class Arama {
    private PDO $db;

    public function __construct() {
        $this->db = db();
    }

    public function create(array $data): int {
        $stmt = $this->db->prepare("
            INSERT INTO aramalar (danisman_id, musteri_id, ofis_id, telefon, sure, sonuc, sonuc_tipi, sesli_not_dosya, sesli_not_metin)
            VALUES (:danisman_id, :musteri_id, :ofis_id, :telefon, :sure, :sonuc, :sonuc_tipi, :sesli_not_dosya, :sesli_not_metin)
        ");
        $stmt->execute([
            ':danisman_id'     => $data['danisman_id'],
            ':musteri_id'      => $data['musteri_id'] ?? null,
            ':ofis_id'         => $data['ofis_id'],
            ':telefon'         => $data['telefon'],
            ':sure'            => $data['sure'] ?? null,
            ':sonuc'           => $data['sonuc'] ?? null,
            ':sonuc_tipi'      => $data['sonuc_tipi'] ?? null,
            ':sesli_not_dosya' => $data['sesli_not_dosya'] ?? null,
            ':sesli_not_metin' => $data['sesli_not_metin'] ?? null,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function getBugunSayisi(int $danismanId): int {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM aramalar WHERE danisman_id = ? AND DATE(created_at) = CURDATE()");
        $stmt->execute([$danismanId]);
        return (int)$stmt->fetchColumn();
    }

    public function getList(int $ofisId, ?int $danismanId = null, int $limit = 50): array {
        $andD = $danismanId ? 'AND a.danisman_id = ?' : '';
        $params = [$ofisId];
        if ($danismanId) $params[] = $danismanId;
        $stmt = $this->db->prepare("
            SELECT a.*, k.ad_soyad as danisman_ad, m.ad_soyad as musteri_ad
            FROM aramalar a
            LEFT JOIN kullanicilar k ON k.id = a.danisman_id
            LEFT JOIN musteriler m ON m.id = a.musteri_id
            WHERE a.ofis_id = ? $andD
            ORDER BY a.created_at DESC
            LIMIT ?
        ");
        $params[] = $limit;
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
