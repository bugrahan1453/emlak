-- ============================================================
-- EmlakRadar Pro Veritabanı Şeması
-- Version: 1.0.0
-- Database: hetagayrimenkul_db
--
-- KURULUM:
-- cPanel > phpMyAdmin > hetagayrimenkul_db seçin > SQL sekmesi > yapıştırın > Git
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'NO_ENGINE_SUBSTITUTION';

-- Ofisler
CREATE TABLE IF NOT EXISTS ofisler (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ad VARCHAR(100) NOT NULL,
    sehir VARCHAR(50) NOT NULL,
    ilce VARCHAR(50) NOT NULL,
    adres VARCHAR(255),
    telefon VARCHAR(20),
    logo VARCHAR(255),
    ayarlar JSON,
    durum ENUM('aktif','pasif') DEFAULT 'aktif',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kullanıcılar
CREATE TABLE IF NOT EXISTS kullanicilar (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ofis_id INT NOT NULL,
    ad_soyad VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    sifre VARCHAR(255) NOT NULL,
    telefon VARCHAR(20),
    rol ENUM('admin','broker','danisman') NOT NULL DEFAULT 'danisman',
    avatar VARCHAR(255),
    durum ENUM('aktif','pasif') DEFAULT 'aktif',
    son_giris DATETIME,
    ayarlar JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (ofis_id) REFERENCES ofisler(id) ON DELETE CASCADE,
    UNIQUE KEY uk_email (email),
    INDEX idx_email (email),
    INDEX idx_rol (rol),
    INDEX idx_ofis (ofis_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- İlanlar
CREATE TABLE IF NOT EXISTS ilanlar (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ofis_id INT,
    danisman_id INT,
    baslik VARCHAR(255) NOT NULL,
    aciklama TEXT,
    fiyat DECIMAL(15,2) NOT NULL DEFAULT 0,
    fiyat_gecmisi JSON,
    sehir VARCHAR(50) NOT NULL,
    ilce VARCHAR(50),
    mahalle VARCHAR(100),
    adres VARCHAR(255),
    lat DECIMAL(10,7),
    lng DECIMAL(10,7),
    metrekare INT,
    oda_sayisi VARCHAR(10),
    kat VARCHAR(20),
    bina_yasi INT,
    isitma_tipi VARCHAR(50),
    esya_durumu ENUM('bos','esyali','yari_esyali') DEFAULT 'bos',
    fotograflar JSON,
    kaynak_site ENUM('sahibinden','hepsiemlak','emlakjet','manuel') DEFAULT 'manuel',
    kaynak_url VARCHAR(500),
    kaynak_id VARCHAR(100),
    ilan_sahibi_tel VARCHAR(20),
    ilan_sahibi_ad VARCHAR(100),
    sahibinden_mi TINYINT(1) DEFAULT 0,
    sahte_skoru TINYINT DEFAULT 0,
    sahte_sonuc VARCHAR(30) DEFAULT 'gercek',
    durum ENUM('aktif','pasif','silindi','satildi','kiralandi') DEFAULT 'aktif',
    ilan_tipi ENUM('satilik','kiralik') DEFAULT 'satilik',
    emlak_tipi ENUM('daire','villa','mustakil','arsa','dukkan','ofis','diger') DEFAULT 'daire',
    silinme_tarihi DATETIME,
    ai_degerleme JSON,
    pazarlik_skoru TINYINT,
    emsal_deger DECIMAL(15,2),
    mukerrer_grup_id VARCHAR(50),
    goruntulenme INT DEFAULT 0,
    notlar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (ofis_id) REFERENCES ofisler(id) ON DELETE SET NULL,
    FOREIGN KEY (danisman_id) REFERENCES kullanicilar(id) ON DELETE SET NULL,
    INDEX idx_konum (sehir, ilce),
    INDEX idx_fiyat (fiyat),
    INDEX idx_durum (durum),
    INDEX idx_kaynak (kaynak_url(191)),
    INDEX idx_tip (ilan_tipi, emlak_tipi),
    FULLTEXT idx_arama (baslik, adres)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Müşteriler
CREATE TABLE IF NOT EXISTS musteriler (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ofis_id INT NOT NULL,
    danisman_id INT,
    ad_soyad VARCHAR(100) NOT NULL,
    telefon VARCHAR(20) NOT NULL,
    email VARCHAR(150),
    tip ENUM('alici','satici','yatirmci','kiralayan') NOT NULL DEFAULT 'alici',
    butce_min DECIMAL(15,2),
    butce_max DECIMAL(15,2),
    tercihler JSON,
    notlar TEXT,
    son_iletisim DATETIME,
    sonraki_iletisim DATETIME,
    durum ENUM('aktif','pasif','anlasildi','vazgecti') DEFAULT 'aktif',
    kaynak VARCHAR(50) DEFAULT 'manuel',
    puan INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (ofis_id) REFERENCES ofisler(id) ON DELETE CASCADE,
    FOREIGN KEY (danisman_id) REFERENCES kullanicilar(id) ON DELETE SET NULL,
    INDEX idx_tip (tip),
    INDEX idx_durum (durum),
    INDEX idx_danisman (danisman_id),
    INDEX idx_sonraki (sonraki_iletisim)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Görevler
CREATE TABLE IF NOT EXISTS gorevler (
    id INT AUTO_INCREMENT PRIMARY KEY,
    danisman_id INT NOT NULL,
    ofis_id INT NOT NULL,
    tip ENUM('arama','gosterim','takip','portfoy','diger') NOT NULL,
    oncelik ENUM('yuksek','orta','dusuk') DEFAULT 'orta',
    baslik VARCHAR(255) NOT NULL,
    aciklama TEXT,
    hedef_telefon VARCHAR(20),
    hedef_musteri_id INT,
    hedef_ilan_id INT,
    ai_senaryo TEXT,
    tarih DATE NOT NULL,
    saat TIME,
    tamamlandi TINYINT(1) DEFAULT 0,
    sonuc TEXT,
    sonuc_tipi ENUM('basarili','basarisiz','ertelendi','ulasilamadi'),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (danisman_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
    FOREIGN KEY (ofis_id) REFERENCES ofisler(id) ON DELETE CASCADE,
    FOREIGN KEY (hedef_musteri_id) REFERENCES musteriler(id) ON DELETE SET NULL,
    FOREIGN KEY (hedef_ilan_id) REFERENCES ilanlar(id) ON DELETE SET NULL,
    INDEX idx_danisman_tarih (danisman_id, tarih),
    INDEX idx_tamamlandi (tamamlandi),
    INDEX idx_tarih (tarih)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Eşleştirmeler
CREATE TABLE IF NOT EXISTS eslestirmeler (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ofis_id INT NOT NULL,
    ilan_id INT NOT NULL,
    musteri_id INT NOT NULL,
    skor INT NOT NULL DEFAULT 0,
    durum ENUM('bekliyor','bildirildi','ilgilendi','reddetti','gorustu') DEFAULT 'bekliyor',
    notlar TEXT,
    bildirim_tarihi DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (ofis_id) REFERENCES ofisler(id) ON DELETE CASCADE,
    FOREIGN KEY (ilan_id) REFERENCES ilanlar(id) ON DELETE CASCADE,
    FOREIGN KEY (musteri_id) REFERENCES musteriler(id) ON DELETE CASCADE,
    INDEX idx_skor (skor),
    INDEX idx_durum (durum),
    UNIQUE KEY uk_ilan_musteri (ilan_id, musteri_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Arama Kayıtları
CREATE TABLE IF NOT EXISTS aramalar (
    id INT AUTO_INCREMENT PRIMARY KEY,
    danisman_id INT NOT NULL,
    musteri_id INT,
    ofis_id INT NOT NULL,
    telefon VARCHAR(20) NOT NULL,
    sure INT,
    sonuc TEXT,
    sonuc_tipi ENUM('ilgilendi','ilgilenmedi','mesgul','tekrar_ara','ulasilamadi'),
    sesli_not_dosya VARCHAR(255),
    sesli_not_metin TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (danisman_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
    FOREIGN KEY (musteri_id) REFERENCES musteriler(id) ON DELETE SET NULL,
    FOREIGN KEY (ofis_id) REFERENCES ofisler(id) ON DELETE CASCADE,
    INDEX idx_danisman (danisman_id),
    INDEX idx_tarih (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Performans
CREATE TABLE IF NOT EXISTS performanslar (
    id INT AUTO_INCREMENT PRIMARY KEY,
    danisman_id INT NOT NULL,
    ofis_id INT NOT NULL,
    tarih DATE NOT NULL,
    arama_sayisi INT DEFAULT 0,
    randevu_sayisi INT DEFAULT 0,
    gosterim_sayisi INT DEFAULT 0,
    portfoy_ekleme INT DEFAULT 0,
    eslestirme_sayisi INT DEFAULT 0,
    efor_skoru DECIMAL(8,2) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (danisman_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
    FOREIGN KEY (ofis_id) REFERENCES ofisler(id) ON DELETE CASCADE,
    UNIQUE KEY uk_danisman_tarih (danisman_id, tarih),
    INDEX idx_tarih (tarih)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Emsal Veriler
CREATE TABLE IF NOT EXISTS emsal_veriler (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sehir VARCHAR(50) NOT NULL,
    ilce VARCHAR(50) NOT NULL,
    mahalle VARCHAR(100) NOT NULL,
    metrekare INT NOT NULL,
    fiyat DECIMAL(15,2) NOT NULL,
    oda_sayisi VARCHAR(10),
    tarih DATE NOT NULL,
    kaynak VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_konum (sehir, ilce, mahalle),
    INDEX idx_tarih (tarih)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bildirimler
CREATE TABLE IF NOT EXISTS bildirimler (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kullanici_id INT NOT NULL,
    ofis_id INT NOT NULL,
    tip ENUM('kirmizi_alarm','eslestirme','gorev','sistem','fiyat_dusus','yeni_ilan') NOT NULL,
    baslik VARCHAR(255) NOT NULL,
    icerik TEXT,
    link VARCHAR(255),
    okundu TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
    FOREIGN KEY (ofis_id) REFERENCES ofisler(id) ON DELETE CASCADE,
    INDEX idx_kullanici_okundu (kullanici_id, okundu),
    INDEX idx_tarih (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Raporlar
CREATE TABLE IF NOT EXISTS raporlar (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ofis_id INT NOT NULL,
    olusturan_id INT NOT NULL,
    tip ENUM('gerceklik_tokadi','roi','portfoy','performans') NOT NULL,
    ilan_id INT,
    musteri_id INT,
    dosya_yolu VARCHAR(255),
    ayarlar JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ofis_id) REFERENCES ofisler(id) ON DELETE CASCADE,
    FOREIGN KEY (olusturan_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
    FOREIGN KEY (ilan_id) REFERENCES ilanlar(id) ON DELETE SET NULL,
    FOREIGN KEY (musteri_id) REFERENCES musteriler(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sistem Logları
CREATE TABLE IF NOT EXISTS sistem_loglari (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kullanici_id INT,
    ofis_id INT,
    islem VARCHAR(100) NOT NULL,
    detay TEXT,
    ip VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tarih (created_at),
    INDEX idx_kullanici (kullanici_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- BAŞLANGIÇ VERİLERİ
-- ============================================================

-- Varsayılan ofis
INSERT INTO ofisler (ad, sehir, ilce, adres, telefon) VALUES
('HETA Gayrimenkul', 'Kocaeli', 'İzmit', 'İzmit Merkez', '0532 000 0000');

-- Varsayılan admin kullanıcı
-- Giriş: admin@hetagayrimenkul.com / Admin123!
INSERT INTO kullanicilar (ofis_id, ad_soyad, email, sifre, telefon, rol) VALUES
(1, 'Admin', 'admin@hetagayrimenkul.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '0532 000 0000', 'admin');

-- Örnek ilanlar
INSERT INTO ilanlar (ofis_id, danisman_id, baslik, aciklama, fiyat, sehir, ilce, mahalle, metrekare, oda_sayisi, kat, bina_yasi, ilan_tipi, emlak_tipi, durum, kaynak_site) VALUES
(1, 1, 'İzmit Merkez 3+1 Satılık Daire', 'Geniş balkonlu, ferah, merkezi konumda 3+1 daire', 2850000.00, 'Kocaeli', 'İzmit', 'Orhan', 120, '3+1', '4/8', 10, 'satilik', 'daire', 'aktif', 'manuel'),
(1, 1, 'Gebze Sanayi Yakını Kiralık Dükkan', 'Ana cadde üzeri, dükkana uygun zemin kat', 18000.00, 'Kocaeli', 'Gebze', 'Cumhuriyet', 85, NULL, '0/5', 15, 'kiralik', 'dukkan', 'aktif', 'manuel'),
(1, 1, 'Çayırova Köşe Parsel Arsa Fırsatı', 'İmarlı, köşe parsel, geniş arsa', 4200000.00, 'Kocaeli', 'Çayırova', 'Akse', NULL, NULL, NULL, NULL, 'satilik', 'arsa', 'aktif', 'manuel');

-- Örnek müşteriler
INSERT INTO musteriler (ofis_id, danisman_id, ad_soyad, telefon, email, tip, butce_min, butce_max, durum) VALUES
(1, 1, 'Ahmet Yılmaz', '0532 111 1111', 'ahmet@example.com', 'alici', 2000000, 3500000, 'aktif'),
(1, 1, 'Fatma Kaya', '0533 222 2222', 'fatma@example.com', 'kiralayan', 15000, 25000, 'aktif'),
(1, 1, 'Mehmet Demir', '0535 333 3333', NULL, 'yatirmci', 5000000, 10000000, 'aktif');

-- Örnek görevler
INSERT INTO gorevler (danisman_id, ofis_id, tip, oncelik, baslik, hedef_musteri_id, tarih, saat) VALUES
(1, 1, 'arama', 'yuksek', 'Ahmet Yılmaz ile takip araması', 1, CURDATE(), '10:00:00'),
(1, 1, 'gosterim', 'orta', 'Fatma Kaya - Dükkan gösterimi', 2, CURDATE(), '14:00:00'),
(1, 1, 'takip', 'dusuk', 'Mehmet Demir - Arsa bilgi güncelle', 3, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:00:00');

-- Örnek performans
INSERT INTO performanslar (danisman_id, ofis_id, tarih, arama_sayisi, randevu_sayisi, gosterim_sayisi, portfoy_ekleme, eslestirme_sayisi, efor_skoru) VALUES
(1, 1, CURDATE(), 8, 2, 3, 1, 2, 25.00);
