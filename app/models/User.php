<?php
/**
 * EmlakRadar Pro - Kullanıcı Modeli
 */

class User {
    private PDO $db;

    public function __construct() {
        $this->db = db();
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare("SELECT k.*, o.ad as ofis_ad FROM kullanicilar k JOIN ofisler o ON o.id = k.ofis_id WHERE k.id = ?");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function findByEmail(string $email): ?array {
        $stmt = $this->db->prepare("SELECT * FROM kullanicilar WHERE email = ? LIMIT 1");
        $stmt->execute([strtolower(trim($email))]);
        return $stmt->fetch() ?: null;
    }

    public function getByOfis(int $ofisId, string $rol = ''): array {
        $sql = "SELECT id, ad_soyad, email, telefon, rol, avatar, durum, son_giris, created_at FROM kullanicilar WHERE ofis_id = ?";
        $params = [$ofisId];
        if ($rol) { $sql .= " AND rol = ?"; $params[] = $rol; }
        $sql .= " ORDER BY ad_soyad";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function create(array $data): int {
        $stmt = $this->db->prepare("
            INSERT INTO kullanicilar (ofis_id, ad_soyad, email, sifre, telefon, rol, durum)
            VALUES (:ofis_id, :ad_soyad, :email, :sifre, :telefon, :rol, 'aktif')
        ");
        $stmt->execute([
            ':ofis_id'  => $data['ofis_id'],
            ':ad_soyad' => trim($data['ad_soyad']),
            ':email'    => strtolower(trim($data['email'])),
            ':sifre'    => password_hash($data['sifre'], PASSWORD_BCRYPT),
            ':telefon'  => $data['telefon'] ?? null,
            ':rol'      => $data['rol'] ?? 'danisman',
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function update(int $id, array $data): bool {
        $fields = [];
        $params = [];
        foreach (['ad_soyad','email','telefon','rol','durum','avatar'] as $f) {
            if (array_key_exists($f, $data)) {
                $fields[] = "$f = :$f";
                $params[":$f"] = $data[$f];
            }
        }
        if (isset($data['sifre']) && $data['sifre']) {
            $fields[] = "sifre = :sifre";
            $params[':sifre'] = password_hash($data['sifre'], PASSWORD_BCRYPT);
        }
        if (!$fields) return false;
        $params[':id'] = $id;
        $stmt = $this->db->prepare("UPDATE kullanicilar SET " . implode(', ', $fields) . " WHERE id = :id");
        return $stmt->execute($params);
    }

    public function delete(int $id): bool {
        $stmt = $this->db->prepare("UPDATE kullanicilar SET durum = 'pasif' WHERE id = ?");
        return $stmt->execute([$id]);
    }

    public function updateAvatar(int $id, string $avatarPath): bool {
        $stmt = $this->db->prepare("UPDATE kullanicilar SET avatar = ? WHERE id = ?");
        return $stmt->execute([$avatarPath, $id]);
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
