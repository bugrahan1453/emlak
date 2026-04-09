-- ============================================================
-- EmlakRadar Pro — v2 Migration: Fiyat Geçmişi & İlan Ömrü
-- Bu dosyayı phpMyAdmin'de çalıştırın
-- ============================================================

-- 1. son_gorunme: ilanın en son hangi tarihte scraper tarafından görüldüğü
ALTER TABLE ilanlar ADD COLUMN son_gorunme DATETIME DEFAULT NULL AFTER goruntulenme;

-- 2. m2_fiyat: otomatik hesaplanan metrekare başına fiyat
ALTER TABLE ilanlar ADD COLUMN m2_fiyat DECIMAL(12,2) DEFAULT NULL AFTER goruntulenme;

-- 3. fiyat_degisim_sayisi: kaç kez fiyat değişikliği tespit edildi
ALTER TABLE ilanlar ADD COLUMN fiyat_degisim_sayisi INT DEFAULT 0 AFTER m2_fiyat;

-- 4. Mevcut ilanlar için son_gorunme'yi created_at ile doldur
UPDATE ilanlar SET son_gorunme = created_at WHERE son_gorunme IS NULL;

-- 5. Mevcut ilanlar için m2_fiyat hesapla
UPDATE ilanlar SET m2_fiyat = ROUND(fiyat / metrekare, 2)
WHERE metrekare > 0 AND fiyat > 0 AND m2_fiyat IS NULL;

-- 6. fiyat_gecmisi JSON'dan fiyat_degisim_sayisi hesapla
UPDATE ilanlar SET fiyat_degisim_sayisi = JSON_LENGTH(fiyat_gecmisi)
WHERE fiyat_gecmisi IS NOT NULL AND fiyat_gecmisi != '[]' AND fiyat_gecmisi != 'null';

-- 7. Index: son_gorunme ile "ölü ilan" sorguları hızlansın
CREATE INDEX idx_son_gorunme ON ilanlar(son_gorunme);

-- 8. Index: m2_fiyat ile fiyat karşılaştırma sorguları
CREATE INDEX idx_m2_fiyat ON ilanlar(m2_fiyat);
