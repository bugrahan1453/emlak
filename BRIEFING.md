# EmlakRadar Pro — Yeni Sohbet Özet Dosyası

Bu dosyayı yeni bir Claude sohbetine kopyala-yapıştır. Claude projeyi sıfırdan anlayacak.

---

## PROJE NE?

**EmlakRadar Pro** — Türk emlak danışmanları için tam kapsamlı CRM + otomatik ilan toplama sistemi.

**Müşteri**: Heta Gayrimenkul (hetagayrimenkul.com)
**Repo**: Private GitHub (bugrahan1453/emlak)
**Aktif Branch**: `claude/setup-core-infrastructure-dbl6f`
**VPS**: AlmaLinux, SSH ile bağlanılıyor, Docker kullanıyor
**cPanel**: hetagayrimenkul.com (PHP + MySQL)

---

## SİSTEM MİMARİSİ

3 ana bileşen:

```
[VPS: Docker]                    [cPanel: PHP]
 ┌─────────────────┐   webhook    ┌──────────────────┐
 │ emlakradar-     │ ──────────► │ PHP Web Paneli   │
 │ scraper         │             │ (dashboard, CRM) │
 │ (Node.js/TS)    │  Socket.io  └──────────────────┘
 │                 │ ──────────► [Tarayıcı: Real-time]
 │ Redis (BullMQ)  │
 └─────────────────┘

Scraper → Sahibinden / Hepsiemlak / Emlakjet sitelerini tarar
        → İlanları analiz eder (sahte tespiti, mükerrer)
        → cPanel webhook'una gönderir
        → Socket.io ile dashboard'u anında günceller
```

---

## SUNUCU BİLGİLERİ

### VPS
- Scraper klasörü: `/opt/emlakradar-scraper/emlakradar-scraper/`
- Docker container'lar: `emlakradar-scraper`, `emlakradar-redis`
- WebSocket port: **3001**
- Docker compose komutları:
  ```bash
  cd /opt/emlakradar-scraper/emlakradar-scraper
  docker compose up -d        # başlat
  docker compose logs -f scraper  # logları izle
  docker compose down         # durdur
  docker compose build        # rebuild
  ```

### cPanel (hetagayrimenkul.com)
- DB adı: `hetagayrimenkul_db`
- DB kullanıcı: `hetagayrimenkul_user`
- DB şifre: `Hetaemrecan99@`
- DB host: `localhost`
- Web root: `public_html/`
- PHP dosyaları: `app/` klasörü (web'den erişilemiyor)

### .env Dosyası (VPS'te `/opt/emlakradar-scraper/emlakradar-scraper/.env`)
```env
CPANEL_API_URL=https://hetagayrimenkul.com/api/webhook.php
CPANEL_WEBHOOK_SECRET=Hetaemrecangayrimenkul99@
CPANEL_API_TOKEN=0ZTK3TDOTQPCORQRRO1E8J75RUJNXKBB
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
WEBSOCKET_PORT=3001
WEBSOCKET_CORS_ORIGIN=https://hetagayrimenkul.com
SCRAPE_INTERVAL_MINUTES=10
SCRAPE_CITIES=kocaeli,istanbul,ankara,izmir
SCRAPE_MAX_PAGES=5
SCRAPE_DELAY_MIN=3000
SCRAPE_DELAY_MAX=10000
PROXY_LIST=
LOG_LEVEL=info
GHOST_CHECK_INTERVAL_HOURS=6
GHOST_BATCH_SIZE=50
```

---

## KLASÖR YAPISI

```
/home/user/emlak/                   ← GIT REPO KÖKÜ
├── app/                            ← PHP backend (web'den erişilemiyor)
│   ├── config/
│   │   ├── app.php                 ← Uygulama ayarları, JWT secret
│   │   └── database.php            ← PDO MySQL bağlantısı (hardcoded credentials)
│   ├── controllers/                ← MVC Controller'lar
│   │   ├── AuthController.php
│   │   ├── IlanController.php
│   │   ├── MusteriController.php
│   │   ├── GorevController.php
│   │   ├── EslestirmeController.php
│   │   ├── PerformansController.php
│   │   ├── BildirimController.php
│   │   ├── AIController.php
│   │   └── RaporController.php
│   ├── models/                     ← Veritabanı modelleri
│   │   ├── User.php, Ilan.php, Musteri.php, Gorev.php
│   │   ├── Eslestirme.php, Arama.php, EmsalVeri.php
│   │   ├── Rapor.php, Bildirim.php, Performans.php, Ofis.php
│   ├── helpers/
│   │   ├── Functions.php           ← CSRF, sanitize, redirect
│   │   ├── JWT.php                 ← JWT encode/decode (HS256)
│   │   ├── AI.php                  ← OpenAI GPT-4o, Whisper
│   │   ├── WhatsApp.php            ← WhatsApp Business API
│   │   └── PDF.php                 ← DOMPDF rapor üretimi
│   ├── middleware/
│   │   └── Auth.php                ← JWT doğrulama middleware
│   └── views/
│       ├── layout/                 ← header, footer, topbar, sidebar
│       └── components/             ← kpi-card, ilan-card, filtre-bar, modal
│
├── public_html/                    ← Web root (domain buraya bakıyor)
│   ├── index.php                   ← Login sayfası
│   ├── dashboard.php               ← Ana panel
│   ├── ilanlar.php / ilan-detay.php / ilan-ekle.php
│   ├── musteriler.php / musteri-detay.php / musteri-ekle.php
│   ├── gorevler.php                ← Görev takvimi
│   ├── eslestirmeler.php           ← Akıllı eşleştirme
│   ├── performans.php              ← Ekip KPI
│   ├── raporlar.php                ← PDF raporlar
│   ├── ayarlar.php                 ← OpenAI, WhatsApp ayarları
│   ├── setup.php                   ← İlk kurulum sihirbazı
│   ├── manifest.json + sw.js       ← PWA desteği
│   └── api/                        ← REST API endpoint'leri
│       ├── auth.php, ilanlar.php, musteriler.php
│       ├── gorevler.php, eslestirmeler.php, performans.php
│       ├── bildirimler.php, raporlar.php
│       ├── webhook.php             ← VPS'ten gelen webhook'ları alır
│       ├── ai.php, whatsapp.php, upload.php, sesli-not.php
│
├── database/
│   └── migration.sql               ← Tam DB şeması (318 satır)
│
├── cron/                           ← cPanel cron job'ları (CLI only)
│   ├── gorev-olustur.php           ← Her gece 02:00
│   ├── eslestirme-kontrol.php      ← Her gece 01:00
│   ├── performans-hesapla.php      ← Her saat
│   └── ghost-fallback.php          ← Her gece 00:00
│
├── assets/                         ← CSS (Tailwind), JS, resimler
├── extension/                      ← Chrome extension
│
└── emlakradar-scraper/             ← VPS SCRAPER (Node.js/TypeScript)
    ├── package.json
    ├── tsconfig.json
    ├── docker-compose.yml          ← redis + scraper servisleri
    ├── .env / .env.example
    └── src/
        ├── index.ts                ← Bootstrap (WebSocket + Queue + Scheduler)
        ├── config.ts               ← .env yükleyici
        ├── types/index.ts          ← Tüm TypeScript arayüzleri
        ├── scraper/
        │   ├── BaseScraper.ts      ← Abstract: anti-detection + analiz pipeline
        │   ├── SahibindenScraper.ts  ← 28 ilan/sayfa, pagingOffset pagination
        │   ├── HepsiemlakScraper.ts  ← 25 ilan/sayfa, ?page= pagination
        │   └── EmlakjetScraper.ts    ← 20 ilan/sayfa, React SPA
        ├── analyzers/
        │   ├── FakeDetector.ts     ← Sahtelik skoru (0-100, ≥50 = sahte)
        │   ├── DuplicateFinder.ts  ← Metin benzerliği ≥%80 = mükerrer
        │   └── GhostTracker.ts     ← Silinen ilan takibi (HEAD request)
        ├── queue/
        │   ├── QueueManager.ts     ← BullMQ, Redis, "emlak-scrape" kuyruğu
        │   └── Jobs.ts             ← Worker (concurrency: 1)
        ├── cron/
        │   └── Scheduler.ts        ← node-cron, her 10 dakikada scrape
        ├── websocket/
        │   └── SocketServer.ts     ← Socket.io port 3001
        │                             Events: yeni_ilan, kirmizi_alarm,
        │                             fiyat_degisiklik, ilan_silindi, scraper_durum
        ├── api/
        │   ├── CpanelClient.ts     ← Webhook gönderici (10'lu batch, 3 retry)
        │   └── WebhookSigner.ts    ← HMAC-SHA256 imzalama
        ├── anti-detection/
        │   ├── StealthConfig.ts    ← puppeteer-extra + stealth plugin
        │   ├── HumanSimulator.ts   ← Scroll, mouse hareketi, yazma simülasyonu
        │   ├── UserAgents.ts       ← Rastgele User-Agent havuzu
        │   └── ProxyManager.ts     ← Proxy rotasyonu
        └── utils/
            ├── Logger.ts           ← Winston (console + dosya, 10MB rotation)
            └── Helpers.ts          ← parseFiyat, parseMetrekare, similarity vs.
```

---

## VERİTABANI TABLOLARI (Özet)

| Tablo | Amaç |
|-------|------|
| `ofisler` | Şirket/şube bilgisi |
| `kullanicilar` | Kullanıcı hesapları (admin/broker/danışman rolleri) |
| `ilanlar` | Emlak ilanları (scraper + manuel), sahtelik skoru, mükerrer grup |
| `musteriler` | Müşteri/aday kaydı, bütçe, tercihler |
| `gorevler` | Görev/hatırlatma (arama, gösterim, takip) |
| `eslestirmeler` | İlan-müşteri akıllı eşleştirme (skor bazlı) |
| `aramalar` | Arama kayıtları, sesli not transkripsiyonu |
| `performanslar` | Günlük KPI metrikleri (arama, randevu, efor skoru) |
| `emsal_veriler` | Emsal fiyat verileri (AI değerleme için) |
| `bildirimler` | Push bildirimler (kırmızı alarm, eşleştirme, görev) |
| `raporlar` | Üretilen PDF rapor meta verileri |
| `sistem_loglari` | Audit log |

---

## TEKNOLOJİ STACK'İ

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Tailwind CSS, Alpine.js |
| Backend (Web) | PHP 8.1+, MySQL 8.0, PDO |
| Backend (Scraper) | Node.js 20, TypeScript |
| Kuyruk | BullMQ + Redis 7 |
| Real-time | Socket.io 4.7 |
| Tarayıcı otomasyon | Puppeteer 22 + puppeteer-extra-plugin-stealth |
| AI | OpenAI GPT-4o, Whisper API |
| Mesajlaşma | WhatsApp Business API |
| Loglama | Winston 3.11 |
| Containerization | Docker Compose |
| Rapor | DOMPDF |
| Auth | JWT HS256, 24 saat expiry |
| Extension | Chrome Extension (Manifest V3) |

---

## MEVCUT DURUM (Mart 2026)

### Tamamlananlar ✅
- PHP web paneli (tüm sayfalar ve API'ler)
- Veritabanı şeması (`migration.sql`)
- TypeScript scraper altyapısı (derleme hataları sıfırlandı)
- Docker containerları ayağa kalktı (`docker compose up -d`)
- Redis bağlantısı çalışıyor
- Scheduler, QueueManager, Worker, GhostTracker çalışıyor
- `.env` dosyası VPS'te yapılandırıldı

### Devam Eden Sorunlar 🔧
1. **Sahibinden.com** — Cloudflare koruması engeli ("Just a moment..." sayfası)
   - Stealth plugin yeterli değil, VPS IP'si bot olarak işaretlenmiş
   - Çözüm: Residential proxy gerekiyor (Bright Data, Oxylabs vs.)

2. **Hepsiemlak.com** — URL yanlış, 404 alıyor
   - Mevcut URL: `/satilik-daireler` → çalışmıyor
   - Doğru URL bulunmalı ve selector'lar güncellenmeli

3. **Emlakjet.com** — Sayfa açılıyor ✅ ama selector'lar test edilmedi
   - `node /app/test3.js` testi yarıda kaldı (bağlantı kesildi)

### Sıradaki Adımlar 📋
1. Emlakjet selector testini tamamla (test3.js çalıştır)
2. Hepsiemlak doğru URL'ini bul
3. Çalışan scraper'lar için selector'ları düzelt
4. Sahibinden için proxy çözümü değerlendir
5. PHP panel cPanel'e deploy et
6. Webhook bağlantısını test et (VPS → cPanel)
7. SSL ve firewall ayarları

---

## TEST KOMUTLARI

```bash
# Scraper loglarını izle
cd /opt/emlakradar-scraper/emlakradar-scraper
docker compose logs -f scraper

# Container durumu
docker compose ps

# Scraper içinde test dosyası çalıştır
docker cp /tmp/test.js emlakradar-scraper:/app/test.js
docker exec -it emlakradar-scraper node /app/test.js

# Redis'e bağlan ve kontrol et
docker exec -it emlakradar-redis redis-cli ping

# Webhook testi (VPS'ten cPanel'e)
curl -X POST https://hetagayrimenkul.com/api/webhook.php \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: Hetaemrecangayrimenkul99@" \
  -d '{"tip":"test","ilanlar":[]}'
```

---

## GIT İŞ AKIŞI

```bash
# Her zaman bu branch'te çalış
git checkout claude/setup-core-infrastructure-dbl6f

# Commit ve push
git add <dosya>
git commit -m "mesaj"
git push -u origin claude/setup-core-infrastructure-dbl6f
```

**Branch adı**: `claude/setup-core-infrastructure-dbl6f`
**ASLA** main/master'a push yapma.

---

## ÖNEMLİ NOTLAR

1. **Hardcoded credentials** — `app/config/database.php` dosyasında şifre düz yazılı, production'da `.env`'ye taşınmalı
2. **REDIS_HOST** — `.env`'de `redis` olmalı (127.0.0.1 değil), Docker network'ü içinde servis adıyla çözülüyor
3. **Scraper 0 ilan** — Cloudflare/bot engeli, selector sorunu değil
4. **Port 3001** — VPS firewall'da açık olmalı (WebSocket için)
5. **cPanel cron** — 4 adet cron job kurulmalı (hourly, 00:00, 01:00, 02:00)
6. **`version` uyarısı** — `docker-compose.yml`'de `version: '3.8'` obsolete uyarısı veriyor ama zararsız
