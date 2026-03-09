<?php
/**
 * EmlakRadar Pro - Emsal Veri Modeli
 */

class EmsalVeri {
    private PDO $db;

    public function __construct() {
        $this->db = db();
    }

    public function getEmsaller(string $sehir, string $ilce, string $mahalle, int $limit = 10): array {
        $stmt = $this->db->prepare("
            SELECT * FROM emsal_veriler
            WHERE sehir = ? AND ilce = ? AND mahalle = ?
              AND tarih >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
            ORDER BY tarih DESC
            LIMIT ?
        ");
        $stmt->execute([$sehir, $ilce, $mahalle, $limit]);
        return $stmt->fetchAll();
    }

    public function getOrtalamaFiyat(string $sehir, string $ilce, string $mahalle): ?float {
        $stmt = $this->db->prepare("
            SELECT AVG(fiyat / metrekare) as m2_fiyat
            FROM emsal_veriler
            WHERE sehir = ? AND ilce = ? AND mahalle = ?
              AND tarih >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
              AND metrekare > 0
        ");
        $stmt->execute([$sehir, $ilce, $mahalle]);
        $result = $stmt->fetchColumn();
        return $result ? (float)$result : null;
    }

    public function create(array $data): int {
        $stmt = $this->db->prepare("
            INSERT INTO emsal_veriler (sehir, ilce, mahalle, metrekare, fiyat, oda_sayisi, tarih, kaynak)
            VALUES (:sehir, :ilce, :mahalle, :metrekare, :fiyat, :oda_sayisi, :tarih, :kaynak)
        ");
        $stmt->execute([
            ':sehir'     => $data['sehir'],
            ':ilce'      => $data['ilce'],
            ':mahalle'   => $data['mahalle'],
            ':metrekare' => $data['metrekare'],
            ':fiyat'     => $data['fiyat'],
            ':oda_sayisi'=> $data['oda_sayisi'] ?? null,
            ':tarih'     => $data['tarih'] ?? date('Y-m-d'),
            ':kaynak'    => $data['kaynak'] ?? null,
        ]);
        return (int)$this->db->lastInsertId();
    }
}
