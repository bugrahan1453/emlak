<?php
/**
 * EmlakRadar Pro - Eşleştirme Modeli
 */

class Eslestirme {
    private PDO $db;

    public function __construct() {
        $this->db = db();
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare("
            SELECT e.*, i.baslik as ilan_baslik, i.fiyat as ilan_fiyat, i.sehir, i.ilce, i.mahalle,
                   i.metrekare, i.oda_sayisi, i.fotograflar,
                   m.ad_soyad as musteri_ad, m.telefon as musteri_tel, m.tip as musteri_tip,
                   m.butce_min, m.butce_max
            FROM eslestirmeler e
            JOIN ilanlar i ON i.id = e.ilan_id
            JOIN musteriler m ON m.id = e.musteri_id
            WHERE e.id = ?
        ");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function getList(int $ofisId, array $filters = [], int $sayfa = 1, int $limit = PER_PAGE): array {
        $where  = ['e.ofis_id = ?'];
        $params = [$ofisId];

        if (!empty($filters['durum']))       { $where[] = 'e.durum = ?';     $params[] = $filters['durum']; }
        if (!empty($filters['musteri_id']))  { $where[] = 'e.musteri_id = ?';$params[] = $filters['musteri_id']; }
        if (!empty($filters['ilan_id']))     { $where[] = 'e.ilan_id = ?';   $params[] = $filters['ilan_id']; }

        $whereStr = implode(' AND ', $where);
        $offset   = ($sayfa - 1) * $limit;

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM eslestirmeler e WHERE $whereStr");
        $countStmt->execute($params);
        $toplam = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare("
            SELECT e.*, i.baslik as ilan_baslik, i.fiyat as ilan_fiyat, i.sehir, i.ilce, i.fotograflar,
                   m.ad_soyad as musteri_ad, m.telefon as musteri_tel, m.tip as musteri_tip
            FROM eslestirmeler e
            JOIN ilanlar i ON i.id = e.ilan_id
            JOIN musteriler m ON m.id = e.musteri_id
            WHERE $whereStr
            ORDER BY e.skor DESC, e.created_at DESC
            LIMIT $limit OFFSET $offset
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            if ($row['fotograflar']) {
                $f = json_decode($row['fotograflar'], true);
                $row['ana_foto'] = is_array($f) && !empty($f[0]) ? $f[0] : null;
            }
        }
        return ['data' => $rows, 'toplam' => $toplam, 'sayfa' => $sayfa, 'limit' => $limit];
    }

    public function create(array $data): int {
        // Önce mevcut var mı kontrol
        $stmt = $this->db->prepare("SELECT id FROM eslestirmeler WHERE ilan_id = ? AND musteri_id = ?");
        $stmt->execute([$data['ilan_id'], $data['musteri_id']]);
        if ($existing = $stmt->fetch()) {
            // Güncelleyelim
            $this->update($existing['id'], ['skor' => $data['skor']]);
            return $existing['id'];
        }

        $stmt = $this->db->prepare("
            INSERT INTO eslestirmeler (ofis_id, ilan_id, musteri_id, skor, notlar)
            VALUES (:ofis_id, :ilan_id, :musteri_id, :skor, :notlar)
        ");
        $stmt->execute([
            ':ofis_id'   => $data['ofis_id'],
            ':ilan_id'   => $data['ilan_id'],
            ':musteri_id'=> $data['musteri_id'],
            ':skor'      => $data['skor'] ?? 0,
            ':notlar'    => $data['notlar'] ?? null,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function update(int $id, array $data): bool {
        $allowed = ['skor','durum','notlar','bildirim_tarihi'];
        $fields  = [];
        $params  = [];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $data)) {
                $fields[] = "$f = :$f";
                $params[":$f"] = $data[$f];
            }
        }
        if (!$fields) return false;
        $params[':id'] = $id;
        $stmt = $this->db->prepare("UPDATE eslestirmeler SET " . implode(', ', $fields) . " WHERE id = :id");
        return $stmt->execute($params);
    }

    /**
     * Müşteri tercihlerine göre eşleştirme skoru hesapla
     */
    public function hesaplaSkor(array $ilan, array $musteri): int {
        $skor = 0;
        $tercihler = is_string($musteri['tercihler'] ?? null) ? json_decode($musteri['tercihler'], true) : ($musteri['tercihler'] ?? []);

        // Bütçe uyumu (%40)
        $butceMin = (float)($musteri['butce_min'] ?? 0);
        $butceMax = (float)($musteri['butce_max'] ?? PHP_INT_MAX);
        $fiyat    = (float)($ilan['fiyat'] ?? 0);
        if ($fiyat >= $butceMin && $fiyat <= $butceMax) {
            $skor += 40;
        } elseif ($fiyat <= $butceMax * 1.1) {
            $skor += 20; // %10 tolerans
        }

        // Bölge uyumu (%30)
        $tercihIlce = $tercihler['ilce'] ?? $tercihler['tercih_ilce'] ?? null;
        $tercihSehir = $tercihler['sehir'] ?? $tercihler['tercih_sehir'] ?? null;
        if ($tercihIlce && strtolower($ilan['ilce'] ?? '') === strtolower($tercihIlce)) {
            $skor += 30;
        } elseif ($tercihSehir && strtolower($ilan['sehir'] ?? '') === strtolower($tercihSehir)) {
            $skor += 15;
        }

        // Oda sayısı (%15)
        $tercihOda = $tercihler['oda_sayisi'] ?? null;
        if ($tercihOda && $ilan['oda_sayisi'] === $tercihOda) {
            $skor += 15;
        }

        // Metrekare (%10)
        $tercihM2Min = (float)($tercihler['metrekare_min'] ?? 0);
        $tercihM2Max = (float)($tercihler['metrekare_max'] ?? PHP_INT_MAX);
        $m2 = (int)($ilan['metrekare'] ?? 0);
        if ($m2 && $m2 >= $tercihM2Min && ($tercihM2Max === (float)PHP_INT_MAX || $m2 <= $tercihM2Max)) {
            $skor += 10;
        }

        // Emlak tipi (%5)
        $tercihTip = $tercihler['emlak_tipi'] ?? null;
        if ($tercihTip && $ilan['emlak_tipi'] === $tercihTip) {
            $skor += 5;
        }

        return min(100, $skor);
    }

    public function getBekleyenSayisi(int $ofisId): int {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM eslestirmeler WHERE ofis_id = ? AND durum = 'bekliyor'");
        $stmt->execute([$ofisId]);
        return (int)$stmt->fetchColumn();
    }

    public function getSonEslestirmeler(int $ofisId, int $limit = 5): array {
        $stmt = $this->db->prepare("
            SELECT e.skor, e.durum, e.created_at,
                   m.ad_soyad as musteri_ad, i.baslik as ilan_baslik, i.fiyat
            FROM eslestirmeler e
            JOIN musteriler m ON m.id = e.musteri_id
            JOIN ilanlar i ON i.id = e.ilan_id
            WHERE e.ofis_id = ?
            ORDER BY e.created_at DESC
            LIMIT ?
        ");
        $stmt->execute([$ofisId, $limit]);
        return $stmt->fetchAll();
    }
}
