# EmlakRadar Pro — Kurulum Kılavuzu

## İçindekiler

1. [Ön Gereksinimler](#ön-gereksinimler)
2. [cPanel Kurulumu](#cpanel-kurulumu)
3. [VPS Scraper Kurulumu](#vps-scraper-kurulumu)
4. [Chrome Extension Kurulumu](#chrome-extension-kurulumu)
5. [PWA Kurulumu](#pwa-kurulumu)
6. [Sorun Giderme](#sorun-giderme)

---

## Ön Gereksinimler

| Bileşen | Minimum | Önerilen |
|---------|---------|----------|
| cPanel sunucu | PHP 7.4 | PHP 8.1+ |
| MySQL/MariaDB | 5.7 | 8.0+ |
| VPS RAM | 2 GB | 4 GB |
| VPS CPU | 1 vCPU | 2 vCPU |
| VPS Disk | 20 GB | 40 GB |
| Docker | 24.x | 25.x+ |
| Docker Compose | 2.x | 2.24+ |

---

## cPanel Kurulumu

### Proje Klasör Yapısı

Sunucudaki dizin yapısı şu şekilde olmalıdır:

```
/home/kullanici/
├── public_html/          ← Web root (domain buraya işaret eder)
│   ├── index.php
│   ├── dashboard.php
│   ├── ilanlar.php
│   ├── ... (diğer PHP sayfaları)
│   ├── api/              ← API endpoint'leri
│   ├── assets/           ← CSS/JS/resim (symlink veya kopya)
│   ├── uploads/          ← Yüklenen dosyalar
│   │   ├── fotograflar/
│   │   ├── raporlar/
│   │   └── sesli-notlar/
│   ├── manifest.json
│   ├── sw.js
│   ├── offline.html
│   └── .htaccess
├── app/                  ← PHP uygulama çekirdeği (web'den erişilemez)
│   ├── config/
│   │   ├── app.php       ← Ana konfigürasyon
│   │   └── database.php  ← Veritabanı bağlantısı
│   ├── models/
│   ├── controllers/
│   ├── helpers/
│   ├── middleware/
│   └── views/
├── assets/               ← Kaynak CSS/JS/resimler
├── cron/                 ← Cron job PHP dosyaları (web'den erişilemez)
├── database/
│   └── migration.sql     ← Veritabanı şeması
└── logs/                 ← PHP hata logları (oluşturulmalı)
```

> **Önemli:** `public_html/` dışındaki klasörler (app/, cron/, database/, logs/)
> web tarayıcısından erişilemez. `.htaccess` bu korumayı otomatik sağlar.

---

### 1. Veritabanı Oluşturma

cPanel → **MySQL Databases** bölümüne gidin:

```
Veritabanı adı : hetagayrimenkul_db
Kullanıcı adı  : hetagayrimenkul_user
Parola         : [güçlü rastgele parola]
Ayrıcalıklar   : ALL PRIVILEGES
```

---

### 2. Şema Yükleme

cPanel → **phpMyAdmin** → veritabanını seçin → **İçe Aktar** sekmesi:

`database/migration.sql` dosyasını yükleyin.

---

### 3. Dosyaları Yükleme

Tüm proje dosyalarını cPanel → **File Manager** veya FTP/SFTP ile yükleyin.
Hedef dizin: `/home/kullanici/` (public_html'in üstü)

---

### 4. Konfigürasyon

**`app/config/database.php`** dosyasını düzenleyin:

```php
private static string $host     = 'localhost';
private static string $dbname   = 'hetagayrimenkul_db';
private static string $username = 'hetagayrimenkul_user';
private static string $password = 'guclu-parolaniz';
private static string $charset  = 'utf8mb4';
```

**`app/config/app.php`** dosyasında ortam değişkenlerini ayarlayın.
cPanel → **Softaculous** veya **MultiPHP INI Editor** üzerinden ya da `.htaccess` / `php.ini` ile:

```
APP_URL     = https://hetagayrimenkul.com
APP_ENV     = production
JWT_SECRET  = en-az-32-karakter-guclu-bir-anahtar
```

Alternatif olarak doğrudan `app/config/app.php` içinde varsayılan değerleri değiştirin:

```php
define('APP_URL', 'https://hetagayrimenkul.com');
define('APP_ENV', 'production');
define('JWT_SECRET', 'en-az-32-karakter-guclu-bir-anahtar');
```

---

### 5. İzinleri Ayarlama

cPanel → **File Manager** ile sağ tıklayarak veya SSH üzerinden:

```bash
# Klasör izinleri
chmod 755 public_html/
chmod 755 app/
chmod 755 assets/
chmod 755 cron/

# Konfigürasyon dosyası (sadece okunabilir)
chmod 644 app/config/app.php
chmod 644 app/config/database.php

# Upload klasörleri (PHP yazabilmeli)
chmod 755 public_html/uploads/
chmod 755 public_html/uploads/fotograflar/
chmod 755 public_html/uploads/raporlar/
chmod 755 public_html/uploads/sesli-notlar/

# Log klasörü — oluşturup yazılabilir yap
mkdir -p logs
chmod 755 logs
touch logs/error.log
chmod 666 logs/error.log
```

---

### 6. SSL Sertifikası

cPanel → **SSL/TLS** → **Let's Encrypt SSL** → Domain seçin → **Install**

> HTTPS zorunludur. Service Worker ve Push bildirimleri yalnızca HTTPS üzerinde çalışır.

---

### 7. CRON Görevleri

cPanel → **Cron Jobs** bölümüne gidin ve şu görevleri ekleyin:

```
# Her saat başı performans istatistikleri
0 * * * * /usr/bin/php /home/kullanici/cron/performans-hesapla.php >> /dev/null 2>&1

# Her gece yarısı ghost ilan kontrolü
0 0 * * * /usr/bin/php /home/kullanici/cron/ghost-fallback.php >> /dev/null 2>&1

# Her gece saat 01:00'de eşleştirme kontrolü
0 1 * * * /usr/bin/php /home/kullanici/cron/eslestirme-kontrol.php >> /dev/null 2>&1

# Her gece saat 02:00'de otomatik görev oluşturma
0 2 * * * /usr/bin/php /home/kullanici/cron/gorev-olustur.php >> /dev/null 2>&1
```

> `kullanici` yerine cPanel kullanıcı adınızı yazın.
> PHP yolu için önce `which php` komutuyla doğru yolu öğrenin.

---

## VPS Scraper Kurulumu

### 1. Sunucuya Bağlanma

```bash
ssh root@vps-ip-adresiniz
```

---

### 2. Docker Kurulumu

```bash
# Ubuntu/Debian için
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# Docker Compose eklentisi
apt-get install -y docker-compose-plugin

# Doğrulama
docker --version
docker compose version
```

---

### 3. Proje Dosyalarını Yükleme

```bash
# Proje dizini oluştur
mkdir -p /opt/emlakradar-scraper
cd /opt/emlakradar-scraper

# Yerel makineden dosyaları kopyala
scp -r ./emlakradar-scraper/* root@vps-ip:/opt/emlakradar-scraper/
```

---

### 4. Ortam Değişkenlerini Ayarlama

```bash
cd /opt/emlakradar-scraper
cp .env.example .env
nano .env
```

`.env` dosyasını doldurun:

```env
# cPanel Panel API bağlantısı
CPANEL_API_URL=https://hetagayrimenkul.com/api/webhook.php
CPANEL_WEBHOOK_SECRET=guclu-bir-secret-key-buraya-min-32-karakter   # app.php ile AYNI olmalı

# Redis (Docker içinde otomatik, değiştirme)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# WebSocket
WEBSOCKET_PORT=3001
WEBSOCKET_CORS_ORIGIN=https://hetagayrimenkul.com

# Scraper ayarları
SCRAPE_INTERVAL_MINUTES=10
SCRAPE_CITIES=kocaeli,istanbul,ankara,izmir
SCRAPE_MAX_PAGES=5
SCRAPE_DELAY_MIN=3000
SCRAPE_DELAY_MAX=10000

# Proxy listesi (opsiyonel)
PROXY_LIST=

# Log seviyesi: error | warn | info | debug
LOG_LEVEL=info

# Ghost tracker
GHOST_CHECK_INTERVAL_HOURS=6
GHOST_BATCH_SIZE=50
```

---

### 5. Firewall Ayarı

```bash
# UFW (Ubuntu)
ufw allow 22/tcp      # SSH
ufw allow 3001/tcp    # Socket.io WebSocket
ufw enable
ufw status
```

---

### 6. Docker ile Başlatma

```bash
cd /opt/emlakradar-scraper

# İlk build
docker compose build

# Arka planda başlat
docker compose up -d

# Logları izle
docker compose logs -f scraper
```

---

### 7. Servis Durumu Kontrolü

```bash
# Container'lar çalışıyor mu?
docker compose ps

# Beklenen çıktı:
# NAME                   STATUS     PORTS
# emlakradar-redis       Up         6379/tcp
# emlakradar-scraper     Up         0.0.0.0:3001->3001/tcp

# Son loglar
docker compose logs --tail=50 scraper

# Redis bağlantısı testi
docker exec emlakradar-redis redis-cli ping
# PONG
```

---

### 8. Sistem Servisi (Otomatik Başlatma)

```bash
cat > /etc/systemd/system/emlakradar.service << 'EOF'
[Unit]
Description=EmlakRadar Scraper
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/emlakradar-scraper
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable emlakradar
systemctl start emlakradar
```

---

### 9. SSL ile WebSocket — Nginx Reverse Proxy (Opsiyonel)

Eğer domain'inizin SSL sertifikasıyla WebSocket sunmak istiyorsanız:

```bash
apt-get install -y nginx certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/emlakradar << 'EOF'
server {
    listen 80;
    server_name vps.hetagayrimenkul.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
    }
}
EOF

ln -s /etc/nginx/sites-available/emlakradar /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL sertifikası
certbot --nginx -d vps.hetagayrimenkul.com
```

`.env` dosyasında güncelleyin:
```env
WEBSOCKET_CORS_ORIGIN=https://hetagayrimenkul.com
```

---

## Chrome Extension Kurulumu

### 1. Dosyaları Hazırlama

Proje klasöründeki `extension/` dizinini yerel makinenize indirin.

---

### 2. Chrome'a Yükleme

1. Chrome'u açın: `chrome://extensions/`
2. Sağ üstte **"Geliştirici modu"** anahtarını açın
3. **"Paketlenmemiş öğe yükle"** → `extension/` klasörünü seçin
4. EmlakRadar Pro ikonunun araç çubuğunda göründüğünü doğrulayın

---

### 3. Extension Ayarları

Extension ikonuna sağ tıklayın → **Seçenekler**:

```
Panel URL : https://hetagayrimenkul.com
Otomatik  : Etkin
```

---

### 4. İzinler Doğrulama

`chrome://extensions/` → EmlakRadar Pro → **Ayrıntılar** → **Site erişimi**:
- `sahibinden.com` ✅
- `hepsiemlak.com` ✅
- `emlakjet.com` ✅

---

## PWA Kurulumu

### 1. Manifest Doğrulama

Chrome DevTools → **Application** → **Manifest**:
- ✅ `name` ve `short_name` gösteriyor
- ✅ İkon 192x192 ve 512x512 yüklü
- ✅ `start_url` erişilebilir
- ✅ `display: standalone`

### 2. Service Worker Doğrulama

Chrome DevTools → **Application** → **Service Workers**:
- ✅ `sw.js` aktif ve çalışıyor
- ✅ Status: **activated and is running**

### 3. Ana Ekrana Ekleme

**Android (Chrome):** Sağ üst menü → **"Ana ekrana ekle"**

**iOS (Safari):** Alt menü paylaşım simgesi → **"Ana Ekrana Ekle"**

**Masaüstü Chrome:** Adres çubuğunda install ikonu → **"Yükle"**

---

## Sorun Giderme

### Dashboard Fatal Error

**Belirti:** Dashboard'da beyaz sayfa, tab'da `Fatal error` yazıyor.

**Kontrol:**
```bash
tail -f ~/logs/error.log
```

**Olası neden — APP_ENV production ama hata gizlenmiş:**
`app/config/app.php` dosyasında geçici olarak:
```php
define('APP_ENV', 'development');
```
yazıp hatayı görün, sonra tekrar `production` yapın.

---

### Webhook Çalışmıyor

**Belirti:** Scraper çalışıyor ama cPanel'e veri gelmiyor.

```bash
# VPS tarafında test
curl -X POST https://hetagayrimenkul.com/api/webhook.php \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: guclu-bir-secret-key-buraya-min-32-karakter" \
  -d '{"tip":"test","ilanlar":[]}'
```

**Beklenen yanıt:** `{"success":true}`

**Sorun — 403:**
- `CPANEL_WEBHOOK_SECRET` değerinin `.env` ve `app/config/app.php`'de **tamamen aynı** olduğunu doğrulayın

---

### WebSocket Bağlanmıyor

**Belirti:** Panelde gerçek zamanlı veri gelmiyor.

```bash
# Port açık mı?
nc -zv vps-ip 3001

# Container çalışıyor mu?
docker compose ps

# Loglar
docker compose logs scraper | grep -i "websocket\|error"
```

---

### Redis Bağlantı Hatası

```bash
docker compose exec redis redis-cli ping
# PONG çıktısı beklenir

docker compose logs redis
docker compose restart redis
```

---

### Scraper 0 İlan Buluyor

**Olası nedenler:**
1. Bot tespiti — `SCRAPE_DELAY_MIN/MAX` değerlerini artırın
2. `SCRAPE_CITIES` boş veya yanlış yazılmış

```env
# .env içinde
SCRAPE_DELAY_MIN=5000
SCRAPE_DELAY_MAX=15000
SCRAPE_MAX_PAGES=2
SCRAPE_CITIES=kocaeli
```

---

### Docker Build Hatası

```bash
docker compose down
docker system prune -f
docker compose build --no-cache
docker compose up -d
```

---

### Logları Kontrol Etme

```bash
# PHP hata logları (cPanel)
tail -f ~/logs/error.log

# Scraper logları
docker compose logs --tail=100 scraper

# Scraper hata logları
docker compose exec scraper cat /app/logs/error.log

# Webhook erişim logları
tail -f ~/access_log | grep webhook
```

---

## Güvenlik Notları

- `CPANEL_WEBHOOK_SECRET` en az 32 karakter olmalı
- `JWT_SECRET` en az 32 karakter olmalı
- `app/`, `cron/`, `database/` klasörlerine `.htaccess` ile web erişimi engellenmeli (mevcut `.htaccess` bunu zaten yapıyor)
- `logs/` klasörü `public_html/` dışında tutulmalı
- SSL sertifikası zorunlu (HTTPS)
- Düzenli yedekleme: veritabanı + `public_html/uploads/` klasörü

---

## Güncelleme

### cPanel Güncelleme

```bash
# FTP/SFTP ile dosyaları yükle
# Varsa migration çalıştır
mysql -u hetagayrimenkul_user -p hetagayrimenkul_db < database/migration.sql
```

### VPS Scraper Güncelleme

```bash
cd /opt/emlakradar-scraper
docker compose down
# Dosyaları güncelle (scp veya git pull)
docker compose build
docker compose up -d
```

### Chrome Extension Güncelleme

1. `chrome://extensions/` açın
2. EmlakRadar Pro → **Güncelle** düğmesi
3. Veya yeni `extension/` klasörünü sürükleyip bırakın

---

*EmlakRadar Pro v1.0 — Kurulum Kılavuzu*
