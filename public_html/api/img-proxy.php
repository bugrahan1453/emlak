<?php
/**
 * Dış emlak sitelerinin hotlink korumasını aşmak için resim proxy
 */
$url = $_GET['url'] ?? '';

if (!$url || filter_var($url, FILTER_VALIDATE_URL) === false) {
    http_response_code(400);
    exit;
}

// Sadece http/https izin ver
$scheme = parse_url($url, PHP_URL_SCHEME);
if (!in_array($scheme, ['http', 'https'])) {
    http_response_code(400);
    exit;
}

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 3,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    CURLOPT_REFERER        => parse_url($url, PHP_URL_SCHEME) . '://' . parse_url($url, PHP_URL_HOST) . '/',
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_HEADER         => false,
]);

$body = curl_exec($ch);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$httpCode    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if (!$body || $httpCode !== 200) {
    http_response_code(404);
    exit;
}

// Sadece resim içerikleri (PHP 7 uyumlu)
if (strpos($contentType, 'image/') !== 0) {
    http_response_code(403);
    exit;
}

header('Content-Type: ' . explode(';', $contentType)[0]);
header('Cache-Control: public, max-age=86400');
echo $body;
