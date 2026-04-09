-- Bozuk m² verilerini düzelt
-- Hepsiemlak'tan gelen "125 m2 / 120 m2" formatı yanlış parse edilmiş
-- Daire/villa/müstakil için 10.000 m²'den büyük değerler sıfırlanacak

-- 1. Daire/villa/müstakil/dükkan/ofis — 10.000 m²'den büyükler sıfırla
UPDATE ilanlar
SET metrekare = NULL, m2_fiyat = NULL
WHERE emlak_tipi NOT IN ('arsa', 'tarla')
  AND metrekare > 10000;

-- 2. Hepsiemlak kaynaklı tüm ilanların m² değerlerini sıfırla (yeniden çekilecek)
-- Bu agresif ama en güvenli yol — fiyat devriyesinde tekrar doğru değer gelecek
UPDATE ilanlar
SET metrekare = NULL, m2_fiyat = NULL
WHERE kaynak_site = 'hepsiemlak'
  AND metrekare > 500
  AND emlak_tipi IN ('daire', 'villa', 'mustakil', 'dukkan', 'ofis');

-- 3. Sonuçları kontrol et
SELECT id, baslik, kaynak_site, metrekare, m2_fiyat, fiyat
FROM ilanlar
WHERE metrekare > 1000 AND emlak_tipi NOT IN ('arsa', 'tarla')
LIMIT 20;
