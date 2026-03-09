<?php
/**
 * EmlakRadar Pro - Müşteri Modeli
 */

class Musteri {
    private PDO $db;

    public function __construct() {
        $this->db = db();
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare("
            SELECT m.*, k.ad_soyad as danisman_ad
            FROM musteriler m
            LEFT JOIN kullanicilar k ON k.id = m.danisman_id
            WHERE m.id = ?
        ");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) return null;
        if ($row['tercihler']) $row['tercihler'] = json_decode($row['tercihler'], true) ?? [];
        return $row;
    }

    public function getList(array $filters = [], int $sayfa = 1, int $limit = PER_PAGE): array {
        $where  = ['1=1'];
        $params = [];

        if (!empty($filters['ofis_id']))     { $where[] = 'm.ofis_id = ?';     $params[] = $filters['ofis_id']; }
        if (!empty($filters['danisman_id'])) { $where[] = 'm.danisman_id = ?'; $params[] = $filters['danisman_id']; }
        if (!empty($filters['tip']))         { $where[] = 'm.tip = ?';         $params[] = $filters['tip']; }
        if (!empty($filters['durum']))       { $where[] = 'm.durum = ?';       $params[] = $filters['durum']; }
        if (isset($filters['butce_min']) && $filters['butce_min'] !== '') {
            $where[] = 'm.butce_max >= ?'; $params[] = (float)$filters['butce_min'];
        }
        if (isset($filters['butce_max']) && $filters['butce_max'] !== '') {
            $where[] = 'm.butce_min <= ?'; $params[] = (float)$filters['butce_max'];
        }
        if (!empty($filters['q'])) {
            $where[] = '(m.ad_soyad LIKE ? OR m.telefon LIKE ? OR m.email LIKE ?)';
            $q = '%' . $filters['q'] . '%';
            $params[] = $q; $params[] = $q; $params[] = $q;
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($sayfa - 1) * $limit;

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM musteriler m WHERE $whereStr");
        $countStmt->execute($params);
        $toplam = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare("
            SELECT m.*, k.ad_soyad as danisman_ad
            FROM musteriler m
            LEFT JOIN kullanicilar k ON k.id = m.danisman_id
            WHERE $whereStr
            ORDER BY m.created_at DESC
            LIMIT $limit OFFSET $offset
        ");
        $stmt->execute($params);
        return ['data' => $stmt->fetchAll(), 'toplam' => $toplam, 'sayfa' => $sayfa, 'limit' => $limit];
    }

    public function create(array $data): int {
        $stmt = $this->db->prepare("
            INSERT INTO musteriler (ofis_id, danisman_id, ad_soyad, telefon, email, tip,
                butce_min, butce_max, tercihler, notlar, durum, kaynak)
            VALUES (:ofis_id, :danisman_id, :ad_soyad, :telefon, :email, :tip,
                :butce_min, :butce_max, :tercihler, :notlar, 'aktif', :kaynak)
        ");
        $stmt->execute([
            ':ofis_id'    => $data['ofis_id'],
            ':danisman_id'=> $data['danisman_id'] ?? null,
            ':ad_soyad'   => trim($data['ad_soyad']),
            ':telefon'    => $data['telefon'],
            ':email'      => $data['email'] ?? null,
            ':tip'        => $data['tip'] ?? 'alici',
            ':butce_min'  => $data['butce_min'] ?? null,
            ':butce_max'  => $data['butce_max'] ?? null,
            ':tercihler'  => isset($data['tercihler']) ? json_encode($data['tercihler'], JSON_UNESCAPED_UNICODE) : null,
            ':notlar'     => $data['notlar'] ?? null,
            ':kaynak'     => $data['kaynak'] ?? 'manuel',
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function update(int $id, array $data): bool {
        $allowed = ['ad_soyad','telefon','email','tip','butce_min','butce_max','notlar','durum','danisman_id','puan','son_iletisim','sonraki_iletisim'];
        $fields  = [];
        $params  = [];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $data)) {
                $fields[] = "$f = :$f";
                $params[":$f"] = $data[$f];
            }
        }
        if (isset($data['tercihler'])) {
            $fields[] = "tercihler = :tercihler";
            $params[':tercihler'] = is_array($data['tercihler']) ? json_encode($data['tercihler'], JSON_UNESCAPED_UNICODE) : $data['tercihler'];
        }
        if (!$fields) return false;
        $params[':id'] = $id;
        $stmt = $this->db->prepare("UPDATE musteriler SET " . implode(', ', $fields) . " WHERE id = :id");
        return $stmt->execute($params);
    }

    public function delete(int $id): bool {
        return $this->update($id, ['durum' => 'pasif']);
    }

    public function getEslestirmeGecmisi(int $musteriId): array {
        $stmt = $this->db->prepare("
            SELECT e.*, i.baslik, i.fiyat, i.sehir, i.ilce, i.mahalle, i.fotograflar
            FROM eslestirmeler e
            JOIN ilanlar i ON i.id = e.ilan_id
            WHERE e.musteri_id = ?
            ORDER BY e.created_at DESC
            LIMIT 20
        ");
        $stmt->execute([$musteriId]);
        return $stmt->fetchAll();
    }

    public function getAramaGecmisi(int $musteriId): array {
        $stmt = $this->db->prepare("
            SELECT a.*, k.ad_soyad as danisman_ad
            FROM aramalar a
            LEFT JOIN kullanicilar k ON k.id = a.danisman_id
            WHERE a.musteri_id = ?
            ORDER BY a.created_at DESC
            LIMIT 20
        ");
        $stmt->execute([$musteriId]);
        return $stmt->fetchAll();
    }

    public function getInitials(string $adSoyad): string {
        $parts = explode(' ', trim($adSoyad));
        $initials = '';
        foreach (array_slice($parts, 0, 2) as $p) {
            $initials .= mb_strtoupper(mb_substr($p, 0, 1));
        }
        return $initials;
    }
}
