<?php
/**
 * EmlakRadar Pro - Uygulama Yapılandırması
 */

// Uygulama temel URL'si (trailing slash olmadan)
define('APP_URL',     rtrim(getenv('APP_URL') ?: 'http://localhost/emlakradar/public_html', '/'));
define('APP_NAME',    'EmlakRadar Pro');
define('APP_VERSION', '1.0.0');
define('APP_LOCALE',  'tr_TR');

// Ortam: 'production' veya 'development'
define('APP_ENV', getenv('APP_ENV') ?: 'development');

// Hata raporlama
if (APP_ENV === 'development') {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    ini_set('error_log', dirname(__DIR__, 2) . '/logs/error.log');
}

// Timezone
date_default_timezone_set('Europe/Istanbul');
setlocale(LC_TIME, 'tr_TR.UTF-8');

// Session ayarları
ini_set('session.cookie_httponly', '1');
ini_set('session.use_strict_mode', '1');
if (APP_ENV === 'production') {
    ini_set('session.cookie_secure', '1');
}
define('SESSION_LIFETIME', 7200); // 2 saat

// JWT
define('JWT_SECRET',     getenv('JWT_SECRET')     ?: 'emlakradar_super_secret_jwt_key_2024_change_in_production');
define('JWT_EXPIRE',     getenv('JWT_EXPIRE')     ?: 3600 * 24); // 24 saat

// Dosya yükleme
define('UPLOAD_BASE',       dirname(__DIR__, 2) . '/public_html/uploads');
define('UPLOAD_PHOTOS',     UPLOAD_BASE . '/fotograflar');
define('UPLOAD_AUDIO',      UPLOAD_BASE . '/sesli-notlar');
define('UPLOAD_REPORTS',    UPLOAD_BASE . '/raporlar');
define('MAX_UPLOAD_SIZE',   10 * 1024 * 1024); // 10 MB
define('ALLOWED_IMG_TYPES', ['image/jpeg', 'image/png', 'image/webp']);
define('ALLOWED_AUD_TYPES', ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav']);

// Sayfalama
define('PER_PAGE', 25);

// OpenAI (ayarlar sayfasından da güncellenebilir, burada varsayılan)
define('OPENAI_API_KEY',    getenv('OPENAI_API_KEY')    ?: '');
define('OPENAI_MODEL',      getenv('OPENAI_MODEL')      ?: 'gpt-4o');
define('WHISPER_MODEL',     'whisper-1');

// WhatsApp
define('WHATSAPP_API_URL',  getenv('WHATSAPP_API_URL')  ?: '');
define('WHATSAPP_TOKEN',    getenv('WHATSAPP_TOKEN')    ?: '');
define('WHATSAPP_PHONE_ID', getenv('WHATSAPP_PHONE_ID') ?: '');

// VPS Webhook
define('VPS_WEBHOOK_TOKEN', getenv('VPS_WEBHOOK_TOKEN') ?: 'emlakradar_webhook_secret_2024');
define('VPS_BASE_URL',      getenv('VPS_BASE_URL')      ?: '');

// CSRF token uzunluğu
define('CSRF_TOKEN_LENGTH', 32);

// Proje kökleri
define('APP_ROOT',     dirname(__DIR__, 2));
define('APP_DIR',      dirname(__DIR__));
define('PUBLIC_ROOT',  APP_ROOT . '/public_html');

// Dosya otomatik dahil yükleme
spl_autoload_register(function (string $class): void {
    $paths = [
        APP_DIR . '/models/'      . $class . '.php',
        APP_DIR . '/controllers/' . $class . '.php',
        APP_DIR . '/helpers/'     . $class . '.php',
        APP_DIR . '/middleware/'  . $class . '.php',
    ];
    foreach ($paths as $path) {
        if (file_exists($path)) {
            require_once $path;
            return;
        }
    }
});

// Config dosyaları yükle
require_once APP_DIR . '/config/database.php';
