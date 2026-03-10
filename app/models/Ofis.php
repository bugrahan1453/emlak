<?php
/**
 * EmlakRadar Pro - Ofis Modeli
 */

class Ofis {
    private PDO $db;

    public function __construct() {
        $this->db = db();
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare("SELECT * FROM ofisler WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function getAll(): array {
        return $this->db->query("SELECT * FROM ofisler WHERE durum = 'aktif' ORDER BY ad")->fetchAll();
    }

    public function update(int $id, array $data): bool {
        $fields = [];
        $params = [];
        foreach (['ad','sehir','ilce','adres','telefon','logo'] as $f) {
            if (array_key_exists($f, $data)) {
                $fields[] = "$f = :$f";
                $params[":$f"] = $data[$f];
            }
        }
        if (isset($data['ayarlar'])) {
            $fields[] = "ayarlar = :ayarlar";
            $params[':ayarlar'] = is_array($data['ayarlar']) ? json_encode($data['ayarlar'], JSON_UNESCAPED_UNICODE) : $data['ayarlar'];
        }
        if (!$fields) return false;
        $params[':id'] = $id;
        $stmt = $this->db->prepare("UPDATE ofisler SET " . implode(', ', $fields) . " WHERE id = :id");
        return $stmt->execute($params);
    }

    public function getAyarlar(int $ofisId): array {
        $stmt = $this->db->prepare("SELECT ayarlar FROM ofisler WHERE id = ?");
        $stmt->execute([$ofisId]);
        $row = $stmt->fetch();
        if (!$row || !$row['ayarlar']) return [];
        return json_decode($row['ayarlar'], true) ?? [];
    }

    public function setAyar(int $ofisId, string $key, $value): bool {
        $ayarlar = $this->getAyarlar($ofisId);
        $ayarlar[$key] = $value;
        return $this->update($ofisId, ['ayarlar' => $ayarlar]);
    }
}
