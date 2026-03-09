<?php
/**
 * EmlakRadar Pro - JWT Yardımcısı
 * Firebase PHP-JWT'nin basit tek-dosya implementasyonu
 * Composer gerekmez.
 */

class JWT {
    private static string $algo = 'HS256';

    /**
     * JWT token oluştur
     */
    public static function encode(array $payload, string $secret): string {
        $header = self::base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => self::$algo]));
        $payload['iat'] = time();
        $payloadEncoded = self::base64UrlEncode(json_encode($payload));
        $signature = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payloadEncoded", $secret, true)
        );
        return "$header.$payloadEncoded.$signature";
    }

    /**
     * JWT token doğrula ve payload döndür
     * @throws RuntimeException geçersiz/süresi dolmuş token
     */
    public static function decode(string $token, string $secret): array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new RuntimeException('Geçersiz token formatı.');
        }
        [$header, $payload, $signature] = $parts;

        $expectedSig = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payload", $secret, true)
        );
        if (!hash_equals($expectedSig, $signature)) {
            throw new RuntimeException('Token imzası geçersiz.');
        }

        $data = json_decode(self::base64UrlDecode($payload), true);
        if (!$data) {
            throw new RuntimeException('Token payload okunamadı.');
        }
        if (isset($data['exp']) && $data['exp'] < time()) {
            throw new RuntimeException('Token süresi dolmuş.');
        }
        return $data;
    }

    /**
     * İstek başlığından Bearer token çek
     */
    public static function getBearerToken(): ?string {
        $headers = getallheaders();
        $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
            return trim($m[1]);
        }
        return null;
    }

    private static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', 4 - strlen($data) % 4));
    }
}
