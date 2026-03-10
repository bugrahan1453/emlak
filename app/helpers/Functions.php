<?php
/**
 * EmlakRadar Pro - Genel Yardımcı Fonksiyonlar
 */

/**
 * XSS temizliği ile değer çıkar
 */
function e($value): string {
    return htmlspecialchars((string)($value ?? ''), ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

/**
 * Fiyatı Türk formatında biçimlendir
 */
function formatFiyat(float $fiyat, string $para = '₺'): string {
    return number_format($fiyat, 0, ',', '.') . ' ' . $para;
}

/**
 * Tarihi Türkçe biçimlendir
 */
function formatTarih(string $tarih, string $format = 'd.m.Y'): string {
    if (!$tarih) return '-';
    return date($format, strtotime($tarih));
}

/**
 * Tarihi göreli biçimde göster (3 saat önce, 2 gün önce, vb.)
 */
function zamanFarki(string $tarih): string {
    $now  = time();
    $then = strtotime($tarih);
    $diff = $now - $then;

    if ($diff < 60)          return 'az önce';
    if ($diff < 3600)        return floor($diff / 60) . ' dakika önce';
    if ($diff < 86400)       return floor($diff / 3600) . ' saat önce';
    if ($diff < 604800)      return floor($diff / 86400) . ' gün önce';
    if ($diff < 2592000)     return floor($diff / 604800) . ' hafta önce';
    return date('d.m.Y', $then);
}

/**
 * CSRF token oluştur veya al
 */
function csrfToken(): string {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(CSRF_TOKEN_LENGTH));
    }
    return $_SESSION['csrf_token'];
}

/**
 * CSRF token doğrula
 */
function verifyCsrf(string $token): bool {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $stored = $_SESSION['csrf_token'] ?? '';
    return hash_equals($stored, $token);
}

/**
 * CSRF hidden input alanı
 */
function csrfField(): string {
    return '<input type="hidden" name="csrf_token" value="' . e(csrfToken()) . '">';
}

/**
 * JSON API yanıtı gönder
 */
function jsonResponse(bool $success, $data = null, string $message = '', int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data'    => $data,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Redirect
 */
function redirect(string $url): void {
    header('Location: ' . $url);
    exit;
}

/**
 * Flash mesaj ayarla
 */
function flashMessage(string $type, string $message): void {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $_SESSION['flash'] = ['type' => $type, 'message' => $message];
}

/**
 * Flash mesajı al ve temizle
 */
function getFlashMessage(): ?array {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    if (!isset($_SESSION['flash'])) return null;
    $flash = $_SESSION['flash'];
    unset($_SESSION['flash']);
    return $flash;
}

/**
 * Güvenli dosya adı oluştur
 */
function safeFileName(string $original): string {
    $ext  = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    return uniqid('', true) . '_' . time() . '.' . $ext;
}

/**
 * IP adresi al
 */
function getClientIp(): string {
    foreach (['HTTP_X_FORWARDED_FOR', 'HTTP_CLIENT_IP', 'REMOTE_ADDR'] as $key) {
        if (!empty($_SERVER[$key])) {
            $ip = explode(',', $_SERVER[$key])[0];
            return filter_var(trim($ip), FILTER_VALIDATE_IP) ?: '0.0.0.0';
        }
    }
    return '0.0.0.0';
}

/**
 * Sistem logu kaydet
 */
function logSystem(string $islem, string $detay = '', ?int $kullaniciId = null, ?int $ofisId = null): void {
    try {
        $pdo = db();
        $stmt = $pdo->prepare("
            INSERT INTO sistem_loglari (kullanici_id, ofis_id, islem, detay, ip)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([$kullaniciId, $ofisId, $islem, $detay, getClientIp()]);
    } catch (Exception $e) {
        error_log('Log kaydedilemedi: ' . $e->getMessage());
    }
}

/**
 * POST verisini temizle
 */
function postVal(string $key, $default = ''): string {
    return trim($_POST[$key] ?? $default);
}

/**
 * GET verisini temizle
 */
function getVal(string $key, $default = ''): string {
    return trim($_GET[$key] ?? $default);
}

/**
 * Sayı aralığı kontrolü
 */
function clamp(int $value, int $min, int $max): int {
    return max($min, min($max, $value));
}

/**
 * Slug oluştur (Türkçe karakter desteği)
 */
function slugify(string $text): string {
    $tr = ['ş'=>'s','ı'=>'i','ğ'=>'g','ü'=>'u','ö'=>'o','ç'=>'c','Ş'=>'S','İ'=>'I','Ğ'=>'G','Ü'=>'U','Ö'=>'O','Ç'=>'C'];
    $text = strtr($text, $tr);
    $text = preg_replace('/[^a-zA-Z0-9\s\-]/', '', $text);
    $text = preg_replace('/\s+/', '-', strtolower(trim($text)));
    return $text;
}

/**
 * Metni belirli uzunlukta kırp
 */
function truncate(string $text, int $length = 100, string $suffix = '...'): string {
    if (mb_strlen($text) <= $length) return $text;
    return mb_substr($text, 0, $length) . $suffix;
}

/**
 * Badge HTML oluştur
 */
function badge(string $text, string $color = 'blue'): string {
    $colors = [
        'green'  => 'bg-green-900/40 text-green-400 border-green-500/30',
        'red'    => 'bg-red-900/40 text-red-400 border-red-500/30',
        'amber'  => 'bg-amber-900/40 text-amber-400 border-amber-500/30',
        'blue'   => 'bg-blue-900/40 text-blue-400 border-blue-500/30',
        'purple' => 'bg-purple-900/40 text-purple-400 border-purple-500/30',
        'cyan'   => 'bg-cyan-900/40 text-cyan-400 border-cyan-500/30',
        'gray'   => 'bg-gray-800/40 text-gray-400 border-gray-500/30',
    ];
    $cls = $colors[$color] ?? $colors['gray'];
    return sprintf('<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border %s">%s</span>', $cls, e($text));
}

/**
 * İlan durum badgei
 */
function ilanDurumBadge(string $durum): string {
    $map = [
        'aktif'     => badge('Aktif', 'green'),
        'pasif'     => badge('Pasif', 'gray'),
        'silindi'   => badge('Silindi', 'red'),
        'satildi'   => badge('Satıldı', 'purple'),
        'kiralandi' => badge('Kiralandı', 'blue'),
    ];
    return $map[$durum] ?? badge($durum, 'gray');
}

/**
 * Müşteri tip badgei
 */
function musteriTipBadge(string $tip): string {
    $map = [
        'alici'     => badge('Alıcı', 'cyan'),
        'satici'    => badge('Satıcı', 'green'),
        'yatirmci'  => badge('Yatırımcı', 'purple'),
        'kiralayan' => badge('Kiralayan', 'amber'),
    ];
    return $map[$tip] ?? badge($tip, 'gray');
}

/**
 * Öncelik rengi
 */
function oncelikRengi(string $oncelik): string {
    $map = [
        'yuksek' => 'text-red-400',
        'orta'   => 'text-amber-400',
        'dusuk'  => 'text-green-400',
    ];
    return $map[$oncelik] ?? 'text-gray-400';
}

/**
 * Pagination HTML oluştur
 */
function pagination(int $toplam, int $sayfa, int $sayfaBasi = PER_PAGE, string $baseUrl = ''): string {
    $toplamSayfa = (int)ceil($toplam / $sayfaBasi);
    if ($toplamSayfa <= 1) return '';

    $html = '<div class="flex items-center justify-between mt-4"><div class="text-sm text-gray-400">';
    $html .= sprintf('Toplam %s kayıt, sayfa %d/%d', number_format($toplam, 0, ',', '.'), $sayfa, $toplamSayfa);
    $html .= '</div><div class="flex gap-1">';

    $start = max(1, $sayfa - 2);
    $end   = min($toplamSayfa, $sayfa + 2);

    if ($sayfa > 1) {
        $html .= sprintf('<a href="%s&sayfa=%d" class="px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-sm text-gray-300">‹</a>', $baseUrl, $sayfa - 1);
    }
    for ($i = $start; $i <= $end; $i++) {
        $active = $i === $sayfa ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 hover:bg-white/10 text-gray-300';
        $html .= sprintf('<a href="%s&sayfa=%d" class="px-3 py-1 rounded %s text-sm">%d</a>', $baseUrl, $i, $active, $i);
    }
    if ($sayfa < $toplamSayfa) {
        $html .= sprintf('<a href="%s&sayfa=%d" class="px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-sm text-gray-300">›</a>', $baseUrl, $sayfa + 1);
    }
    $html .= '</div></div>';
    return $html;
}
