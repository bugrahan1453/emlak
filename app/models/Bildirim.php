<?php
/**
 * EmlakRadar Pro - Bildirim Modeli
 */

class Bildirim {
    private PDO $db;

    public function __construct() {
        $this->db = db();
    }

    public function getList(int $kullaniciId, int $limit = 20, bool $sadeceokunmamis = false): array {
        $andOkunmamis = $sadeceokunmamis ? 'AND okundu = 0' : '';
        $stmt = $this->db->prepare("
            SELECT * FROM bildirimler
            WHERE kullanici_id = ? $andOkunmamis
            ORDER BY created_at DESC
            LIMIT ?
        ");
        $stmt->execute([$kullaniciId, $limit]);
        return $stmt->fetchAll();
    }

    public function getOkunmamisSayisi(int $kullaniciId): int {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM bildirimler WHERE kullanici_id = ? AND okundu = 0");
        $stmt->execute([$kullaniciId]);
        return (int)$stmt->fetchColumn();
    }

    public function okunduIsaretle(int $id, int $kullaniciId): bool {
        $stmt = $this->db->prepare("UPDATE bildirimler SET okundu = 1 WHERE id = ? AND kullanici_id = ?");
        return $stmt->execute([$id, $kullaniciId]);
    }

    public function tumunuOku(int $kullaniciId): bool {
        $stmt = $this->db->prepare("UPDATE bildirimler SET okundu = 1 WHERE kullanici_id = ?");
        return $stmt->execute([$kullaniciId]);
    }

    public function create(int $kullaniciId, int $ofisId, string $tip, string $baslik, string $icerik = '', string $link = ''): int {
        $stmt = $this->db->prepare("
            INSERT INTO bildirimler (kullanici_id, ofis_id, tip, baslik, icerik, link)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$kullaniciId, $ofisId, $tip, $baslik, $icerik, $link]);
        return (int)$this->db->lastInsertId();
    }

    public function createForOfis(int $ofisId, string $tip, string $baslik, string $icerik = '', string $link = ''): void {
        $stmt = $this->db->prepare("SELECT id FROM kullanicilar WHERE ofis_id = ? AND durum = 'aktif'");
        $stmt->execute([$ofisId]);
        $kullanicilar = $stmt->fetchAll();
        foreach ($kullanicilar as $k) {
            $this->create($k['id'], $ofisId, $tip, $baslik, $icerik, $link);
        }
    }

    public function delete(int $id): bool {
        $stmt = $this->db->prepare("DELETE FROM bildirimler WHERE id = ?");
        return $stmt->execute([$id]);
    }

    public function tipIkon(string $tip): string {
        return match($tip) {
            'kirmizi_alarm' => '🚨',
            'eslestirme'    => '🔗',
            'gorev'         => '✅',
            'sistem'        => '⚙️',
            'fiyat_dusus'   => '📉',
            'yeni_ilan'     => '🏠',
            default         => '🔔',
        };
    }

    public function tipRenk(string $tip): string {
        return match($tip) {
            'kirmizi_alarm' => 'red',
            'eslestirme'    => 'purple',
            'gorev'         => 'green',
            'sistem'        => 'gray',
            'fiyat_dusus'   => 'amber',
            'yeni_ilan'     => 'cyan',
            default         => 'blue',
        };
    }
}
