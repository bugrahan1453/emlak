<?php
/**
 * EmlakRadar Pro - Görev Modeli
 */

class Gorev {
    private PDO $db;

    public function __construct() {
        $this->db = db();
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare("
            SELECT g.*, k.ad_soyad as danisman_ad,
                   m.ad_soyad as musteri_ad, m.telefon as musteri_tel,
                   i.baslik as ilan_baslik, i.fiyat as ilan_fiyat
            FROM gorevler g
            LEFT JOIN kullanicilar k ON k.id = g.danisman_id
            LEFT JOIN musteriler m ON m.id = g.hedef_musteri_id
            LEFT JOIN ilanlar i ON i.id = g.hedef_ilan_id
            WHERE g.id = ?
        ");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function getList(array $filters = [], int $sayfa = 1, int $limit = PER_PAGE): array {
        $where  = ['1=1'];
        $params = [];

        if (!empty($filters['ofis_id']))     { $where[] = 'g.ofis_id = ?';     $params[] = $filters['ofis_id']; }
        if (!empty($filters['danisman_id'])) { $where[] = 'g.danisman_id = ?'; $params[] = $filters['danisman_id']; }
        if (!empty($filters['tarih']))       { $where[] = 'g.tarih = ?';       $params[] = $filters['tarih']; }
        if (!empty($filters['tip']))         { $where[] = 'g.tip = ?';         $params[] = $filters['tip']; }
        if (!empty($filters['oncelik']))     { $where[] = 'g.oncelik = ?';     $params[] = $filters['oncelik']; }
        if (isset($filters['tamamlandi']) && $filters['tamamlandi'] !== '') {
            $where[] = 'g.tamamlandi = ?'; $params[] = (int)$filters['tamamlandi'];
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($sayfa - 1) * $limit;

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM gorevler g WHERE $whereStr");
        $countStmt->execute($params);
        $toplam = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare("
            SELECT g.*, k.ad_soyad as danisman_ad,
                   m.ad_soyad as musteri_ad, m.telefon as musteri_tel,
                   i.baslik as ilan_baslik
            FROM gorevler g
            LEFT JOIN kullanicilar k ON k.id = g.danisman_id
            LEFT JOIN musteriler m ON m.id = g.hedef_musteri_id
            LEFT JOIN ilanlar i ON i.id = g.hedef_ilan_id
            WHERE $whereStr
            ORDER BY g.oncelik = 'yuksek' DESC, g.saat ASC, g.id ASC
            LIMIT $limit OFFSET $offset
        ");
        $stmt->execute($params);
        return ['data' => $stmt->fetchAll(), 'toplam' => $toplam, 'sayfa' => $sayfa, 'limit' => $limit];
    }

    public function getBugunGorevler(int $ofisId, ?int $danismanId = null): array {
        $params = [$ofisId, date('Y-m-d')];
        $andDanisman = '';
        if ($danismanId) {
            $andDanisman = 'AND g.danisman_id = ?';
            $params[] = $danismanId;
        }
        $stmt = $this->db->prepare("
            SELECT g.*, k.ad_soyad as danisman_ad,
                   m.ad_soyad as musteri_ad, m.telefon as musteri_tel
            FROM gorevler g
            LEFT JOIN kullanicilar k ON k.id = g.danisman_id
            LEFT JOIN musteriler m ON m.id = g.hedef_musteri_id
            WHERE g.ofis_id = ? AND g.tarih = ? $andDanisman
            ORDER BY g.oncelik = 'yuksek' DESC, g.tamamlandi ASC, g.saat ASC
        ");
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function create(array $data): int {
        $stmt = $this->db->prepare("
            INSERT INTO gorevler (danisman_id, ofis_id, tip, oncelik, baslik, aciklama,
                hedef_telefon, hedef_musteri_id, hedef_ilan_id, ai_senaryo, tarih, saat)
            VALUES (:danisman_id, :ofis_id, :tip, :oncelik, :baslik, :aciklama,
                :hedef_telefon, :hedef_musteri_id, :hedef_ilan_id, :ai_senaryo, :tarih, :saat)
        ");
        $stmt->execute([
            ':danisman_id'     => $data['danisman_id'],
            ':ofis_id'         => $data['ofis_id'],
            ':tip'             => $data['tip'] ?? 'diger',
            ':oncelik'         => $data['oncelik'] ?? 'orta',
            ':baslik'          => $data['baslik'],
            ':aciklama'        => $data['aciklama'] ?? null,
            ':hedef_telefon'   => $data['hedef_telefon'] ?? null,
            ':hedef_musteri_id'=> $data['hedef_musteri_id'] ?? null,
            ':hedef_ilan_id'   => $data['hedef_ilan_id'] ?? null,
            ':ai_senaryo'      => $data['ai_senaryo'] ?? null,
            ':tarih'           => $data['tarih'] ?? date('Y-m-d'),
            ':saat'            => $data['saat'] ?? null,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function tamamla(int $id, string $sonucTipi, string $sonuc = ''): bool {
        $stmt = $this->db->prepare("
            UPDATE gorevler SET tamamlandi = 1, sonuc_tipi = ?, sonuc = ?
            WHERE id = ?
        ");
        return $stmt->execute([$sonucTipi, $sonuc, $id]);
    }

    public function update(int $id, array $data): bool {
        $allowed = ['tip','oncelik','baslik','aciklama','hedef_telefon','hedef_musteri_id',
                    'hedef_ilan_id','ai_senaryo','tarih','saat','tamamlandi','sonuc','sonuc_tipi'];
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
        $stmt = $this->db->prepare("UPDATE gorevler SET " . implode(', ', $fields) . " WHERE id = :id");
        return $stmt->execute($params);
    }

    public function delete(int $id): bool {
        $stmt = $this->db->prepare("DELETE FROM gorevler WHERE id = ?");
        return $stmt->execute([$id]);
    }

    public function getBugunSayisi(int $ofisId, ?int $danismanId = null): int {
        $params = [$ofisId, date('Y-m-d')];
        $andD = '';
        if ($danismanId) { $andD = 'AND danisman_id = ?'; $params[] = $danismanId; }
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM gorevler WHERE ofis_id = ? AND tarih = ? AND tamamlandi = 0 $andD");
        $stmt->execute($params);
        return (int)$stmt->fetchColumn();
    }
}
