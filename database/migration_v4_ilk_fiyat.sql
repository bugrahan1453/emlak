-- ilk_fiyat kolonu: JSON parse etmeden fiyat düşüşü filtrelemek için
ALTER TABLE ilanlar ADD COLUMN ilk_fiyat DECIMAL(15,2) DEFAULT NULL AFTER fiyat;

-- Mevcut verileri doldur: fiyat_gecmisi varsa ilk kaydın fiyatını al
UPDATE ilanlar
SET ilk_fiyat = CAST(JSON_UNQUOTE(JSON_EXTRACT(fiyat_gecmisi, '$[0].fiyat')) AS DECIMAL(15,2))
WHERE fiyat_gecmisi IS NOT NULL AND fiyat_gecmisi != '[]' AND fiyat_gecmisi != 'null';

-- fiyat_gecmisi olmayanlar için mevcut fiyatı koy
UPDATE ilanlar SET ilk_fiyat = fiyat WHERE ilk_fiyat IS NULL AND fiyat > 0;
