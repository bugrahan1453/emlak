<?php
/**
 * EmlakRadar Pro - İlan Modeli
 */

class Ilan {
    private PDO $db;

    public function __construct() {
        $this->db = db();
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare("
            SELECT i.*, k.ad_soyad as danisman_ad, k.telefon as danisman_tel
            FROM ilanlar i
            LEFT JOIN kullanicilar k ON k.id = i.danisman_id
            WHERE i.id = ?
        ");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) return null;
        if ($row['fotograflar']) $row['fotograflar'] = json_decode($row['fotograflar'], true) ?? [];
        if ($row['fiyat_gecmisi']) $row['fiyat_gecmisi'] = json_decode($row['fiyat_gecmisi'], true) ?? [];
        if ($row['ai_degerleme']) $row['ai_degerleme'] = json_decode($row['ai_degerleme'], true) ?? [];
        return $row;
    }

    public function getList(array $filters = [], int $sayfa = 1, int $limit = PER_PAGE): array {
        // Kaldırılmış filtresi aktifse kaldırılmışları göster, değilse gizle
        $durumFiltre = !empty($filters['son_gorulmeyen'])
            ? 'i.durum != "silindi"'
            : 'i.durum NOT IN ("silindi", "kaldırılmış")';
        $where  = [$durumFiltre];
        $params = [];

        if (!empty($filters['ofis_id']))    { $where[] = 'i.ofis_id = ?';      $params[] = $filters['ofis_id']; }
        if (!empty($filters['danisman_id'])){ $where[] = 'i.danisman_id = ?';  $params[] = $filters['danisman_id']; }
        if (!empty($filters['sehir']))      { $where[] = 'i.sehir = ?';        $params[] = $filters['sehir']; }
        if (!empty($filters['ilce']))       { $where[] = 'i.ilce = ?';         $params[] = $filters['ilce']; }
        if (!empty($filters['mahalle']))    { $where[] = 'i.mahalle = ?';      $params[] = $filters['mahalle']; }
        if (!empty($filters['ilan_tipi']))  { $where[] = 'i.ilan_tipi = ?';    $params[] = $filters['ilan_tipi']; }
        if (!empty($filters['emlak_tipi'])) { $where[] = 'i.emlak_tipi = ?';   $params[] = $filters['emlak_tipi']; }
        if (!empty($filters['durum']))      { $where[] = 'i.durum = ?';        $params[] = $filters['durum']; }
        if (!empty($filters['kaynak_site'])){ $where[] = 'i.kaynak_site = ?';  $params[] = $filters['kaynak_site']; }
        if (!empty($filters['oda_sayisi'])) { $where[] = 'i.oda_sayisi = ?';   $params[] = $filters['oda_sayisi']; }
        if (isset($filters['fiyat_min']) && $filters['fiyat_min'] !== '') {
            $where[] = 'i.fiyat >= ?'; $params[] = (float)$filters['fiyat_min'];
        }
        if (isset($filters['fiyat_max']) && $filters['fiyat_max'] !== '') {
            $where[] = 'i.fiyat <= ?'; $params[] = (float)$filters['fiyat_max'];
        }
        if (!empty($filters['q'])) {
            $where[] = 'MATCH(i.baslik, i.aciklama, i.adres) AGAINST(? IN BOOLEAN MODE)';
            $params[] = $filters['q'] . '*';
        }

        // Özel filtreler
        if (!empty($filters['fiyat_dusen'])) {
            $where[] = 'i.fiyat_degisim_sayisi > 0';
            $where[] = 'i.fiyat > 0';
            $where[] = 'i.ilk_fiyat IS NOT NULL';
            $where[] = 'i.ilk_fiyat > 0';
            $where[] = 'i.fiyat < i.ilk_fiyat';
        }
        if (!empty($filters['fiyat_artan'])) {
            $where[] = 'i.fiyat_degisim_sayisi > 0';
            $where[] = 'i.fiyat > 0';
            $where[] = 'i.ilk_fiyat IS NOT NULL';
            $where[] = 'i.ilk_fiyat > 0';
            $where[] = 'i.fiyat > i.ilk_fiyat';
        }
        if (!empty($filters['uzun_suredir'])) {
            $where[] = 'i.created_at <= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        }
        if (!empty($filters['son_gorulmeyen'])) {
            $where[] = "i.durum = 'kaldırılmış'";
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($sayfa - 1) * $limit;

        // Özel sıralama
        $orderBy = 'i.created_at DESC';
        if (!empty($filters['fiyat_dusen']) || !empty($filters['fiyat_artan'])) {
            $orderBy = 'i.fiyat_degisim_sayisi DESC';
        }

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM ilanlar i WHERE $whereStr");
        $countStmt->execute($params);
        $toplam = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare("
            SELECT i.*, k.ad_soyad as danisman_ad
            FROM ilanlar i
            LEFT JOIN kullanicilar k ON k.id = i.danisman_id
            WHERE $whereStr
            ORDER BY $orderBy
            LIMIT $limit OFFSET $offset
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$row) {
            if ($row['fotograflar']) $row['fotograflar'] = json_decode($row['fotograflar'], true) ?? [];
        }

        return ['data' => $rows, 'toplam' => $toplam, 'sayfa' => $sayfa, 'limit' => $limit];
    }

    public function create(array $data): int {
        $stmt = $this->db->prepare("
            INSERT INTO ilanlar (ofis_id, danisman_id, baslik, aciklama, fiyat, sehir, ilce, mahalle, adres,
                lat, lng, metrekare, oda_sayisi, kat, bina_yasi, isitma_tipi, esya_durumu, fotograflar,
                kaynak_site, kaynak_url, kaynak_id, ilan_sahibi_tel, ilan_sahibi_ad, sahibinden_mi,
                ilan_tipi, emlak_tipi, durum, notlar, son_gorunme, m2_fiyat)
            VALUES (:ofis_id, :danisman_id, :baslik, :aciklama, :fiyat, :sehir, :ilce, :mahalle, :adres,
                :lat, :lng, :metrekare, :oda_sayisi, :kat, :bina_yasi, :isitma_tipi, :esya_durumu, :fotograflar,
                :kaynak_site, :kaynak_url, :kaynak_id, :ilan_sahibi_tel, :ilan_sahibi_ad, :sahibinden_mi,
                :ilan_tipi, :emlak_tipi, :durum, :notlar, :son_gorunme, :m2_fiyat)
        ");
        $stmt->execute([
            ':ofis_id'        => $data['ofis_id'] ?? null,
            ':danisman_id'    => $data['danisman_id'] ?? null,
            ':baslik'         => $data['baslik'],
            ':aciklama'       => $data['aciklama'] ?? null,
            ':fiyat'          => $data['fiyat'],
            ':sehir'          => $data['sehir'],
            ':ilce'           => $data['ilce'] ?? null,
            ':mahalle'        => $data['mahalle'] ?? null,
            ':adres'          => $data['adres'] ?? null,
            ':lat'            => $data['lat'] ?? null,
            ':lng'            => $data['lng'] ?? null,
            ':metrekare'      => $data['metrekare'] ?? null,
            ':oda_sayisi'     => $data['oda_sayisi'] ?? null,
            ':kat'            => $data['kat'] ?? null,
            ':bina_yasi'      => $data['bina_yasi'] ?? null,
            ':isitma_tipi'    => $data['isitma_tipi'] ?? null,
            ':esya_durumu'    => $data['esya_durumu'] ?? null,
            ':fotograflar'    => isset($data['fotograflar']) ? json_encode($data['fotograflar'], JSON_UNESCAPED_UNICODE) : null,
            ':kaynak_site'    => $data['kaynak_site'] ?? 'manuel',
            ':kaynak_url'     => $data['kaynak_url'] ?? null,
            ':kaynak_id'      => $data['kaynak_id'] ?? null,
            ':ilan_sahibi_tel'=> $data['ilan_sahibi_tel'] ?? null,
            ':ilan_sahibi_ad' => $data['ilan_sahibi_ad'] ?? null,
            ':sahibinden_mi'  => $data['sahibinden_mi'] ?? 0,
            ':ilan_tipi'      => $data['ilan_tipi'] ?? 'satilik',
            ':emlak_tipi'     => $data['emlak_tipi'] ?? 'daire',
            ':durum'          => $data['durum'] ?? 'aktif',
            ':notlar'         => $data['notlar'] ?? null,
            ':son_gorunme'    => $data['son_gorunme'] ?? date('Y-m-d H:i:s'),
            ':m2_fiyat'       => $data['m2_fiyat'] ?? null,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function update(int $id, array $data): bool {
        $allowed = ['baslik','aciklama','fiyat','sehir','ilce','mahalle','adres','lat','lng',
                    'metrekare','oda_sayisi','kat','bina_yasi','isitma_tipi','esya_durumu',
                    'ilan_tipi','emlak_tipi','durum','notlar','danisman_id','sahte_skoru',
                    'pazarlik_skoru','emsal_deger','ai_degerleme',
                    'son_gorunme','m2_fiyat','fiyat_degisim_sayisi','silinme_tarihi'];
        $fields = [];
        $params = [];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $data)) {
                $fields[] = "$f = :$f";
                $v = $data[$f];
                if (in_array($f, ['ai_degerleme']) && is_array($v)) {
                    $v = json_encode($v, JSON_UNESCAPED_UNICODE);
                }
                $params[":$f"] = $v;
            }
        }
        if (isset($data['fotograflar'])) {
            $fields[] = "fotograflar = :fotograflar";
            $params[':fotograflar'] = is_array($data['fotograflar']) ? json_encode($data['fotograflar'], JSON_UNESCAPED_UNICODE) : $data['fotograflar'];
        }
        if ($data['durum'] ?? '' === 'silindi') {
            $fields[] = "silinme_tarihi = NOW()";
        }
        if (!$fields) return false;
        $params[':id'] = $id;
        $stmt = $this->db->prepare("UPDATE ilanlar SET " . implode(', ', $fields) . " WHERE id = :id");
        return $stmt->execute($params);
    }

    public function delete(int $id): bool {
        return $this->update($id, ['durum' => 'silindi']);
    }

    public function getDashboardStats(int $ofisId): array {
        $stmt = $this->db->prepare("
            SELECT
                COUNT(*) as toplam_aktif,
                SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as bugun_eklenen,
                SUM(CASE WHEN durum = 'silindi' AND DATE(silinme_tarihi) = CURDATE() THEN 1 ELSE 0 END) as bugun_silinen,
                SUM(CASE WHEN pazarlik_skoru >= 70 THEN 1 ELSE 0 END) as firsat_sayisi
            FROM ilanlar
            WHERE ofis_id = ? AND durum = 'aktif'
        ");
        $stmt->execute([$ofisId]);
        return $stmt->fetch() ?: [];
    }

    public function getSonIlanlar(int $ofisId, int $limit = 20): array {
        $stmt = $this->db->prepare("
            SELECT i.id, i.baslik, i.fiyat, i.sehir, i.ilce, i.mahalle, i.metrekare, i.oda_sayisi,
                   i.ilan_tipi, i.emlak_tipi, i.durum, i.kaynak_site, i.fotograflar,
                   i.pazarlik_skoru, i.sahte_skoru, i.created_at, i.updated_at,
                   k.ad_soyad as danisman_ad
            FROM ilanlar i
            LEFT JOIN kullanicilar k ON k.id = i.danisman_id
            WHERE i.ofis_id = ?
            ORDER BY i.created_at DESC
            LIMIT ?
        ");
        $stmt->execute([$ofisId, $limit]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            if ($row['fotograflar']) {
                $f = json_decode($row['fotograflar'], true);
                $row['ana_foto'] = is_array($f) && !empty($f[0]) ? $f[0] : null;
            }
        }
        return $rows;
    }

    public function getKirmiziAlarmlari(int $ofisId): array {
        $stmt = $this->db->prepare("
            SELECT i.*, e.fiyat as emsal_fiyat,
                   ((e.fiyat - i.fiyat) / e.fiyat * 100) as indirim_yuzdesi
            FROM ilanlar i
            JOIN emsal_veriler e ON e.sehir = i.sehir AND e.ilce = i.ilce AND e.mahalle = i.mahalle
            WHERE i.ofis_id = ? AND i.durum = 'aktif'
              AND i.fiyat < e.fiyat * 0.90
            ORDER BY indirim_yuzdesi DESC
            LIMIT 20
        ");
        $stmt->execute([$ofisId]);
        return $stmt->fetchAll();
    }

    public function addFiyatGecmisi(int $id, float $yeniFiyat): void {
        $stmt = $this->db->prepare("SELECT fiyat, ilk_fiyat, fiyat_gecmisi FROM ilanlar WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) return;

        $gecmis = $row['fiyat_gecmisi'] ? json_decode($row['fiyat_gecmisi'], true) : [];
        $gecmis[] = ['fiyat' => $row['fiyat'], 'tarih' => date('Y-m-d H:i:s')];
        if (count($gecmis) > 20) $gecmis = array_slice($gecmis, -20);

        // İlk fiyat henüz set edilmediyse, eski fiyatı ilk fiyat olarak kaydet
        $ilkFiyat = $row['ilk_fiyat'] ?: $row['fiyat'];

        $upd = $this->db->prepare("UPDATE ilanlar SET fiyat = ?, ilk_fiyat = COALESCE(ilk_fiyat, ?), fiyat_gecmisi = ? WHERE id = ?");
        $upd->execute([$yeniFiyat, $ilkFiyat, json_encode($gecmis, JSON_UNESCAPED_UNICODE), $id]);
    }

    public function incrementGoruntulenme(int $id): void {
        $this->db->prepare("UPDATE ilanlar SET goruntulenme = goruntulenme + 1 WHERE id = ?")->execute([$id]);
    }

    public function getDistinctSehirler(int $ofisId): array {
        $stmt = $this->db->prepare("SELECT DISTINCT sehir FROM ilanlar WHERE ofis_id = ? AND durum = 'aktif' ORDER BY sehir");
        $stmt->execute([$ofisId]);
        return array_column($stmt->fetchAll(), 'sehir');
    }

    public function getDistinctIlceler(int $ofisId, string $sehir): array {
        $stmt = $this->db->prepare("SELECT DISTINCT ilce FROM ilanlar WHERE ofis_id = ? AND sehir = ? AND durum = 'aktif' ORDER BY ilce");
        $stmt->execute([$ofisId, $sehir]);
        return array_column($stmt->fetchAll(), 'ilce');
    }

    // ─── Piyasa Radarı Sorguları ──────────────────────────────────────────

    /**
     * Piyasa radarı özet istatistikleri
     */
    public function getRadarStats(int $ofisId): array {
        $stmt = $this->db->prepare("
            SELECT
                (SELECT COUNT(*) FROM ilanlar WHERE ofis_id = ? AND durum = 'aktif') as toplam_aktif,
                (SELECT COUNT(*) FROM ilanlar WHERE ofis_id = ? AND durum = 'aktif' AND fiyat_degisim_sayisi > 0 AND fiyat > 0 AND ilk_fiyat > 0 AND fiyat < ilk_fiyat) as fiyat_dusen,
                (SELECT COUNT(*) FROM ilanlar WHERE ofis_id = ? AND durum = 'aktif' AND DATEDIFF(NOW(), created_at) >= 30) as uzun_suredir,
                (SELECT COUNT(*) FROM ilanlar WHERE ofis_id = ? AND durum = 'kaldırılmış') as kaldirilmis,
                (SELECT COUNT(*) FROM ilanlar WHERE ofis_id = ? AND durum = 'aktif' AND DATE(created_at) = CURDATE()) as bugun_eklenen
        ");
        $stmt->execute([$ofisId, $ofisId, $ofisId, $ofisId, $ofisId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * Mahalle bazında ortalama m² fiyat
     */
    public function getMahalleOrtM2(int $ofisId, string $sehir = '', string $ilce = ''): array {
        $where = ['ofis_id = ?', 'durum = "aktif"', 'm2_fiyat > 0', 'fiyat > 0'];
        $params = [$ofisId];
        if ($sehir) { $where[] = 'sehir = ?'; $params[] = $sehir; }
        if ($ilce) { $where[] = 'ilce = ?'; $params[] = $ilce; }
        $w = implode(' AND ', $where);

        $stmt = $this->db->prepare("
            SELECT ilce, mahalle, ilan_tipi, emlak_tipi,
                   ROUND(AVG(m2_fiyat), 0) as ort_m2,
                   COUNT(*) as ilan_sayisi,
                   ROUND(MIN(m2_fiyat), 0) as min_m2,
                   ROUND(MAX(m2_fiyat), 0) as max_m2
            FROM ilanlar
            WHERE $w
            GROUP BY ilce, mahalle, ilan_tipi, emlak_tipi
            HAVING ilan_sayisi >= 2
            ORDER BY ort_m2 ASC
        ");
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Fırsat skoru hesapla — en iyi fırsatları döndür
     * Skor = (m² ucuzluk) + (ilan ömrü) + (fiyat düşüş) + (satıcı yorgunluğu)
     */
    public function getFirsatListesi(int $ofisId, int $limit = 30): array {
        $stmt = $this->db->prepare("
            SELECT i.id, i.baslik, i.fiyat, i.m2_fiyat, i.metrekare, i.oda_sayisi,
                   i.sehir, i.ilce, i.mahalle, i.ilan_sahibi_ad, i.ilan_sahibi_tel,
                   i.kaynak_site, i.kaynak_url, i.created_at, i.son_gorunme,
                   i.fiyat_degisim_sayisi, i.fiyat_gecmisi, i.fotograflar,
                   DATEDIFF(NOW(), i.created_at) as ilan_gun,
                   avg_tbl.ort_m2, avg_tbl.ilan_adet,
                   CASE
                       WHEN avg_tbl.ilan_adet >= 5 AND avg_tbl.ort_m2 > 0 AND i.m2_fiyat > 0
                       THEN LEAST(30, ROUND(((avg_tbl.ort_m2 - i.m2_fiyat) / avg_tbl.ort_m2) * 100, 1))
                       ELSE 0
                   END as m2_ucuzluk_pct
            FROM ilanlar i
            LEFT JOIN (
                SELECT ilce, mahalle, ilan_tipi, emlak_tipi, AVG(m2_fiyat) as ort_m2, COUNT(*) as ilan_adet
                FROM ilanlar
                WHERE ofis_id = ? AND durum = 'aktif' AND m2_fiyat > 0 AND fiyat > 0
                GROUP BY ilce, mahalle, ilan_tipi, emlak_tipi
            ) avg_tbl ON avg_tbl.ilce = i.ilce AND avg_tbl.mahalle = i.mahalle
                      AND avg_tbl.ilan_tipi = i.ilan_tipi AND avg_tbl.emlak_tipi = i.emlak_tipi
            WHERE i.ofis_id = ? AND i.durum = 'aktif' AND i.fiyat > 0
            ORDER BY
                (COALESCE(i.fiyat_degisim_sayisi, 0) * 15) +
                (LEAST(DATEDIFF(NOW(), i.created_at), 90) / 3) +
                (CASE WHEN avg_tbl.ilan_adet >= 5 AND avg_tbl.ort_m2 > 0 AND i.m2_fiyat > 0 AND i.m2_fiyat < avg_tbl.ort_m2
                      THEN LEAST(((avg_tbl.ort_m2 - i.m2_fiyat) / avg_tbl.ort_m2) * 100, 30)
                      ELSE 0 END)
                DESC
            LIMIT ?
        ");
        $stmt->execute([$ofisId, $ofisId, $limit]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fırsat skoru ve yorgun satıcı skoru hesapla
        foreach ($rows as &$row) {
            $gun = (int)$row['ilan_gun'];
            $degisim = (int)$row['fiyat_degisim_sayisi'];
            $m2Ucuz = (float)$row['m2_ucuzluk_pct'];

            // m² ucuzluk max %30 ile sınırla (gerçekçi olmayan değerleri kes)
            $m2Ucuz = min(30, max(0, $m2Ucuz));

            // Yorgun satıcı skoru (0-100)
            $yorgunSkor = min(100,
                min($gun, 120) * 0.4 +           // max 48 puan: uzun süre yayında
                $degisim * 20 +                   // her fiyat düşüşü 20 puan
                ($gun > 60 ? 10 : 0)              // 60+ gün bonus
            );

            // Fırsat skoru (0-100)
            $firsatSkor = min(100,
                $m2Ucuz * 1.2 +                   // max 60 puan: m² ucuzluk (en önemli)
                $yorgunSkor * 0.25 +              // max 25 puan: yorgun satıcı
                $degisim * 8                      // her fiyat düşüşü 8 puan
            );

            // İlk fiyat ve toplam düşüş hesapla
            $gecmis = is_string($row['fiyat_gecmisi']) ? json_decode($row['fiyat_gecmisi'], true) : [];
            $ilkFiyat = !empty($gecmis) ? (float)$gecmis[0]['fiyat'] : (float)$row['fiyat'];
            $toplamDususPct = ($ilkFiyat > 0 && (float)$row['fiyat'] < $ilkFiyat)
                ? round((($ilkFiyat - (float)$row['fiyat']) / $ilkFiyat) * 100, 1)
                : 0;

            $row['yorgun_skor'] = round($yorgunSkor);
            $row['firsat_skor'] = round($firsatSkor);
            $row['ilk_fiyat'] = $ilkFiyat;
            $row['toplam_dusus_pct'] = $toplamDususPct;

            if ($row['fotograflar']) {
                $f = json_decode($row['fotograflar'], true);
                $row['ana_foto'] = is_array($f) && !empty($f[0]) ? $f[0] : null;
            }
            unset($row['fotograflar'], $row['fiyat_gecmisi']);
        }

        return $rows;
    }

    /**
     * Son fiyat düşen ilanlar
     */
    public function getSonFiyatDusenler(int $ofisId, int $limit = 10): array {
        $stmt = $this->db->prepare("
            SELECT id, baslik, fiyat, m2_fiyat, ilce, mahalle, oda_sayisi,
                   fiyat_degisim_sayisi, fiyat_gecmisi, kaynak_site,
                   ilan_sahibi_ad, ilan_sahibi_tel, fotograflar
            FROM ilanlar
            WHERE ofis_id = ? AND durum = 'aktif' AND fiyat > 0
              AND fiyat_degisim_sayisi > 0 AND fiyat_gecmisi IS NOT NULL AND fiyat_gecmisi != '[]'
            ORDER BY updated_at DESC
            LIMIT ?
        ");
        $stmt->execute([$ofisId, $limit]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as &$row) {
            $gecmis = json_decode($row['fiyat_gecmisi'], true) ?: [];
            $ilkFiyat = !empty($gecmis) ? (float)$gecmis[0]['fiyat'] : (float)$row['fiyat'];
            $row['ilk_fiyat'] = $ilkFiyat;
            $row['dusus_pct'] = ($ilkFiyat > 0 && (float)$row['fiyat'] < $ilkFiyat)
                ? round((($ilkFiyat - (float)$row['fiyat']) / $ilkFiyat) * 100, 1)
                : 0;
            if ($row['fotograflar']) {
                $f = json_decode($row['fotograflar'], true);
                $row['ana_foto'] = is_array($f) && !empty($f[0]) ? $f[0] : null;
            }
            unset($row['fotograflar'], $row['fiyat_gecmisi']);
        }
        return $rows;
    }
}
