-- ============================================================
-- Mükerrer ilan temizleme + UNIQUE KEY ekleme
-- cPanel > phpMyAdmin > hetagayrimenkul_db > SQL sekmesinde çalıştır
-- ============================================================

-- 1. Mükerrer ilanları sil (aynı kaynak_site + kaynak_id olan çiftlerden en yüksek id'yi sil)
DELETE i1
FROM ilanlar i1
INNER JOIN ilanlar i2
  ON i1.kaynak_site = i2.kaynak_site
 AND i1.kaynak_id   = i2.kaynak_id
 AND i1.id > i2.id
WHERE i1.kaynak_id IS NOT NULL AND i1.kaynak_id != '';

-- 2. kaynak_url mükerrerlerini de temizle (aynı url'den birden fazla kayıt varsa)
DELETE i1
FROM ilanlar i1
INNER JOIN ilanlar i2
  ON i1.kaynak_url = i2.kaynak_url
 AND i1.id > i2.id
WHERE i1.kaynak_url IS NOT NULL AND i1.kaynak_url != '';

-- 3. Artık UNIQUE KEY ekleyebiliriz
ALTER TABLE ilanlar
  ADD UNIQUE KEY uk_kaynak_id (kaynak_site, kaynak_id);

-- 4. Kontrol: kaç ilan kaldı?
SELECT COUNT(*) AS toplam_ilan FROM ilanlar;
