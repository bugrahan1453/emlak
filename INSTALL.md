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
| cPanel sunucu | PHP 8.1 | PHP 8.2+ |
| MySQL/MariaDB | 5.7 | 8.0+ |
| VPS RAM | 2 GB | 4 GB |
| VPS CPU | 1 vCPU | 2 vCPU |
| VPS Disk | 20 GB | 40 GB |
| Docker | 24.x | 25.x+ |
| Docker Compose | 2.x | 2.24+ |
| Node.js (lokal build için) | 18.x | 20.x |

---

## cPanel Kurulumu

### 1. Veritabanı Oluşturma

cPanel → **MySQL Databases** bölümüne gidin:

```
Veritabanı adı : emlakradar_db
Kullanıcı adı  : emlakradar_user
Parola         : [güçlü rastgele parola]
Ayrıcalıklar   : ALL PRIVILEGES
```

### 2. Şema Yükleme

cPanel → **phpMyAdmin** → `emlakradar_db` → **SQL** sekmesi:

```sql
SOURCE /home/kullanici/emlakradar_db.sql;
```

> Alternatif: cPanel → **MySQL Databases** → **Import** ile `database/schema.sql` dosyasını yükleyin.

### 3. Dosyaları Yükleme

cPanel → **File Manager** → `public_html` dizinine gidin ve tüm proje dosyalarını yükleyin:

```
public_html/
├── index.php
├── manifest.json
├── sw.js
├── offline.html
├── api/
│   ├── ilanlar.php
│   ├── webhook.php
│   ├── bildirimler.php
│   └── ...
app/
├── config/
│   └── app.php
├── models/
├── controllers/
└── helpers/
assets/
├── css/
├── js/
└── img/
```

### 4. Konfigürasyon

`app/config/app.php` dosyasını düzenleyin:

```php
// Veritabanı
define('DB_HOST', 'localhost');
define('DB_NAME', 'emlakradar_db');
define('DB_USER', 'emlakradar_user');
define('DB_PASS', 'your_secure_password');

// Uygulama URL
define('APP_URL', 'https://yourdomain.com');

// VPS Webhook güvenlik
define('VPS_WEBHOOK_SECRET', 'cok_gizli_anahtar_min_32_karakter');
define('VPS_ALLOWED_IPS', '1.2.3.4,5.6.7.8');  // VPS IP adresleri (virgülle)

// Socket.io (VPS)
define('VPS_SOCKET_URL', 'https://vps.yourdomain.com:3001');

// VAPID anahtarları (Push bildirimleri için)
define('VAPID_PUBLIC_KEY', 'your_vapid_public_key');
define('VAPID_PRIVATE_KEY', 'your_vapid_private_key');

// Email (isteğe bağlı)
define('SMTP_HOST', 'mail.yourdomain.com');
define('SMTP_USER', 'noreply@yourdomain.com');
define('SMTP_PASS', 'email_password');
```

### 5. İzinleri Ayarlama

cPanel → **File Manager** veya SSH ile:

```bash
# Yazılabilir dizinler
chmod 755 public_html/
chmod 755 app/
chmod 644 app/config/app.php
chmod 755 storage/
chmod 755 storage/logs/
chmod 755 storage/cache/
chmod 755 storage/pdf/

# Log dosyaları
touch storage/logs/app.log
chmod 666 storage/logs/app.log
```

### 6. SSL Sertifikası

cPanel → **SSL/TLS** → **Let's Encrypt SSL** → Domain seçin → **Install**

> HTTPS zorunludur. Service Worker ve Push bildirimleri yalnızca HTTPS üzerinde çalışır.

### 7. Meta Etiketleri (Socket.io)

Ana layout dosyanıza (`app/views/layout.php` veya benzeri) ekleyin:

```html
<head>
    <!-- VPS Socket.io URL -->
    <meta name="vps-socket-url" content="<?= VPS_SOCKET_URL ?>">
    <!-- VAPID Public Key -->
    <meta name="vapid-public-key" content="<?= VAPID_PUBLIC_KEY ?>">
</head>
```

### 8. CRON Görevleri

cPanel → **Cron Jobs** → aşağıdaki görevleri ekleyin:

```
# Her saat başı performans istatistikleri
0 * * * * php /home/kullanici/cron/performans-hesapla.php >> /dev/null 2>&1

# Her gece yarısı ghost fallback kontrol
0 0 * * * php /home/kullanici/cron/ghost-fallback.php >> /dev/null 2>&1

# Her 5 dakikada bildirim temizleme (isteğe bağlı)
*/5 * * * * php /home/kullanici/cron/temizlik.php >> /dev/null 2>&1
```

---

## VPS Scraper Kurulumu

### 1. Sunucuya Bağlanma

```bash
ssh root@vps.yourdomain.com
```

### 2. Docker Kurulumu

```bash
# Ubuntu/Debian için
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# Docker Compose eklentisi
apt-get install -y docker-compose-plugin

# Doğrulama
docker --version       # Docker 25.x.x
docker compose version # Docker Compose v2.x.x
```

### 3. Proje Dosyalarını Yükleme

```bash
# Proje dizini oluştur
mkdir -p /opt/emlakradar-scraper
cd /opt/emlakradar-scraper

# Dosyaları yükle (scp veya git clone)
scp -r ./emlakradar-scraper/* root@vps.yourdomain.com:/opt/emlakradar-scraper/

# veya git clone
git clone https://github.com/yourrepo/emlakradar.git .
cp -r emlakradar-scraper/* /opt/emlakradar-scraper/
```

### 4. Ortam Değişkenlerini Ayarlama

```bash
cp .env.example .env
nano .env
```

`.env` dosyasını düzenleyin:

```env
# cPanel bağlantısı
CPANEL_API_URL=https://yourdomain.com/api/webhook.php
CPANEL_WEBHOOK_SECRET=cok_gizli_anahtar_min_32_karakter   # app.php ile AYNI

# Redis (Docker içinde otomatik)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=                   # Boş bırakabilirsiniz
REDIS_DB=0

# WebSocket
WEBSOCKET_PORT=3001
CPANEL_CORS_ORIGIN=https://yourdomain.com

# Scraper ayarları
SCRAPE_INTERVAL_MINUTES=30        # Her 30 dakikada scrape
SCRAPE_DELAY_MIN=2000             # 2 saniye min bekleme
SCRAPE_DELAY_MAX=6000             # 6 saniye max bekleme
SCRAPE_MAX_PAGES=5                # Kaynak başına max sayfa

# Proxy listesi (isteğe bağlı, boş bırakılabilir)
PROXY_LIST=

# Log seviyesi
LOG_LEVEL=info

# Ghost tracker
GHOST_CHECK_INTERVAL_HOURS=6
```

### 5. Firewall Ayarı

```bash
# UFW (Ubuntu)
ufw allow 3001/tcp    # Socket.io WebSocket
ufw allow 22/tcp      # SSH
ufw enable

# veya iptables
iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
```

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

### 7. Servis Durumu Kontrolü

```bash
# Container'lar çalışıyor mu?
docker compose ps

# Çıktı:
# NAME                   STATUS     PORTS
# emlakradar-redis       Up         6379/tcp
# emlakradar-scraper     Up         0.0.0.0:3001->3001/tcp

# Son loglar
docker compose logs --tail=50 scraper

# Redis bağlantısı testi
docker exec emlakradar-redis redis-cli ping
# PONG
```

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

### 9. SSL ile WebSocket (Nginx Reverse Proxy)

Eğer domain'inizin SSL sertifikasıyla WebSocket sunmak istiyorsanız:

```bash
apt-get install -y nginx certbot python3-certbot-nginx

# Nginx config
cat > /etc/nginx/sites-available/emlakradar << 'EOF'
server {
    listen 80;
    server_name vps.yourdomain.com;

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
certbot --nginx -d vps.yourdomain.com
```

`.env` dosyasında güncelleyin:
```env
WEBSOCKET_PORT=3001
CPANEL_CORS_ORIGIN=https://yourdomain.com
```

`meta` etiketinde:
```html
<meta name="vps-socket-url" content="https://vps.yourdomain.com">
```

---

## Chrome Extension Kurulumu

### 1. Dosyaları İndirme

```bash
# Yerel makinede
scp -r root@yourdomain.com:/home/kullanici/extension ./emlakradar-extension
# veya proje klasöründen kopyalayın
```

### 2. Chrome'a Yükleme

1. Chrome'u açın, adres çubuğuna yazın: `chrome://extensions/`
2. Sağ üstte **"Geliştirici modu"** anahtarını açın
3. **"Paketlenmemiş öğe yükle"** butonuna tıklayın
4. `extension/` klasörünü seçin
5. EmlakRadar Pro ikonunun araç çubuğunda göründüğünü doğrulayın

### 3. Extension Ayarları

Extension ikonuna sağ tıklayın → **Seçenekler**:

```
Panel URL  : https://yourdomain.com
API Key    : [cPanel'den alınan API anahtarı]
Otomatik   : ✅ Etkin
```

### 4. İzinler Doğrulama

`chrome://extensions/` → EmlakRadar Pro → **Ayrıntılar** → **Site erişimi**:
- `sahibinden.com` ✅
- `hepsiemlak.com` ✅
- `emlakjet.com` ✅

---

## PWA Kurulumu

### 1. Manifest Doğrulama

Chrome DevTools → **Application** → **Manifest** bölümüne gidin.

Şunları doğrulayın:
- ✅ `name` ve `short_name` gösteriyor
- ✅ İkon 192x192 ve 512x512 yüklü
- ✅ `start_url` erişilebilir
- ✅ `display: standalone`

### 2. Service Worker Doğrulama

Chrome DevTools → **Application** → **Service Workers**:
- ✅ `sw.js` aktif ve çalışıyor
- ✅ Status: **activated and is running**

### 3. Ana Ekrana Ekleme

**Android (Chrome):**
1. Chrome'da siteyi açın
2. Sağ üst menü → **"Ana ekrana ekle"**
3. Uygulama adını onaylayın → **Ekle**

**iOS (Safari):**
1. Safari'de siteyi açın
2. Alt menüde paylaşım simgesi
3. **"Ana Ekrana Ekle"**
4. Adı onaylayın → **Ekle**

**Masaüstü Chrome:**
1. Adres çubuğunda install ikonu
2. **"Yükle"** butonuna tıklayın

### 4. Push Bildirimleri

- Site ilk açıldıktan 30 saniye sonra bildirim izni istenir
- **İzin ver** → Push bildirimleri aktif olur
- VAPID anahtarları `app.php`'de doğru tanımlanmış olmalı

---

## Sorun Giderme

### Webhook Çalışmıyor

**Belirti:** Scraper çalışıyor ama cPanel'e veri gelmiyor.

```bash
# VPS tarafında test
curl -X POST https://yourdomain.com/api/webhook.php \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=$(echo -n '{"tip":"test"}' | openssl dgst -sha256 -hmac 'cok_gizli_anahtar_min_32_karakter' | cut -d' ' -f2)" \
  -d '{"tip":"yeni_ilan","ilanlar":[],"zaman":"2024-01-01T00:00:00Z","kaynak":"test"}'
```

**Beklenen yanıt:** `{"success":true,"data":{"eklenen":0,"atilan":0}}`

**Sorun — 403 Geçersiz imza:**
- `VPS_WEBHOOK_SECRET` değerinin `.env` ve `app.php`'de **tamamen aynı** olduğunu doğrulayın
- Fazladan boşluk veya satır sonu olmadığını kontrol edin

**Sorun — 403 IP yetkisiz:**
- `VPS_ALLOWED_IPS` ayarını kontrol edin
- VPS'in genel IP'sini `curl ifconfig.me` ile doğrulayın
- Test için `VPS_ALLOWED_IPS` boş bırakın (tüm IP'lere izin verir)

### WebSocket Bağlanmıyor

**Belirti:** Panelde gerçek zamanlı veri gelmiyor, `[Socket] Bağlantı hatası` konsol hatası.

```bash
# Port açık mı?
nc -zv vps.yourdomain.com 3001

# Container çalışıyor mu?
docker compose ps

# Socket sunucusu log
docker compose logs scraper | grep "WebSocket"
```

**Sorun — Firewall:**
```bash
# Ubuntu UFW
ufw status | grep 3001
ufw allow 3001/tcp
```

**Sorun — CORS hatası:**
`.env` dosyasında `CPANEL_CORS_ORIGIN` değerini `https://yourdomain.com` olarak ayarlayın.

### Redis Bağlantı Hatası

```bash
# Redis container kontrol
docker compose exec redis redis-cli ping

# Loglar
docker compose logs redis

# Redis'i yeniden başlat
docker compose restart redis
```

### Scraper 0 İlan Buluyor

**Olası nedenler:**
1. Site yapısı değişmiş (CSS seçiciler güncel değil)
2. Bot tespiti — Proxy kullanmayı deneyin
3. Cloudflare engeli — Daha uzun bekleme süreleri ayarlayın

```bash
# .env dosyasında
SCRAPE_DELAY_MIN=5000    # 5 saniye
SCRAPE_DELAY_MAX=15000   # 15 saniye
SCRAPE_MAX_PAGES=2       # Test için sadece 2 sayfa
```

### Docker Build Hatası

```bash
# Cache temizle ve yeniden build et
docker compose down
docker system prune -f
docker compose build --no-cache
docker compose up -d
```

### Chromium Crash Ediyor

```bash
# Paylaşılan bellek sorunu — shm_size'ı artır
# docker-compose.yml içinde:
# shm_size: '2gb'

# Veya /dev/shm mount
# volumes:
#   - /dev/shm:/dev/shm
```

### Logları Kontrol Etme

```bash
# Scraper logları (son 100 satır)
docker compose logs --tail=100 scraper

# Hata logları
docker compose exec scraper cat /app/logs/error.log

# cPanel logları (PHP error_log)
tail -f ~/logs/error_log

# Webhook istek logları
tail -f ~/access_log | grep webhook
```

### Veritabanı Bağlantı Hatası

```bash
# cPanel phpMyAdmin ile test edin
# veya SSH ile:
mysql -u emlakradar_user -p emlakradar_db -e "SELECT 1;"

# app.php credentials doğrulama
php -r "
define('DB_HOST', 'localhost');
define('DB_NAME', 'emlakradar_db');
define('DB_USER', 'emlakradar_user');
define('DB_PASS', 'your_password');
try {
    \$pdo = new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME, DB_USER, DB_PASS);
    echo 'Bağlantı başarılı';
} catch(Exception \$e) {
    echo 'Hata: '.\$e->getMessage();
}
"
```

---

## Güvenlik Notları

- `VPS_WEBHOOK_SECRET` en az 32 karakter olmalı
- `VPS_ALLOWED_IPS` mutlaka ayarlanmalı (production'da)
- SSL sertifikası zorunlu (HTTPS)
- `app/config/app.php` web'den erişilemez olmalı (`/.htaccess` ile)
- Düzenli yedekleme: veritabanı + `storage/` klasörü

---

## Güncelleme

### cPanel Güncelleme

```bash
# Dosyaları yükle (FTP/SFTP)
# Veritabanı migration varsa çalıştır
mysql -u emlakradar_user -p emlakradar_db < database/migration_vX.X.sql
```

### VPS Scraper Güncelleme

```bash
cd /opt/emlakradar-scraper
docker compose down
git pull  # veya scp ile dosyaları güncelle
docker compose build
docker compose up -d
```

### Chrome Extension Güncelleme

1. `chrome://extensions/` açın
2. EmlakRadar Pro → **Güncelle** düğmesi
3. Veya yeni sürümü sürükleyip bırakın

---

*EmlakRadar Pro v1.0 — Kurulum Kılavuzu*
