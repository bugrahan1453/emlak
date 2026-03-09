<?php
/**
 * EmlakRadar Pro - Auth Middleware
 * Session + JWT doğrulama
 */

class Auth {
    /**
     * Session oturumunu başlat ve oturum açmış kullanıcıyı döndür.
     * Oturum yoksa login sayfasına yönlendir.
     */
    public static function requireLogin(): array {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }

        // Session kontrolü
        if (!empty($_SESSION['user_id'])) {
            return self::getSessionUser();
        }

        // JWT Bearer token kontrolü (API istekleri için)
        $token = JWT::getBearerToken();
        if ($token) {
            try {
                $payload = JWT::decode($token, JWT_SECRET);
                return $payload;
            } catch (RuntimeException $e) {
                // geçersiz token
            }
        }

        // Yönlendir
        $redirect = urlencode($_SERVER['REQUEST_URI'] ?? '');
        header('Location: ' . APP_URL . '/index.php?redirect=' . $redirect);
        exit;
    }

    /**
     * Yalnızca admin/broker erişimi gerektiren sayfalarda kullan
     */
    public static function requireRole(array $roles): array {
        $user = self::requireLogin();
        if (!in_array($user['rol'] ?? '', $roles, true)) {
            http_response_code(403);
            die('Bu sayfaya erişim yetkiniz yok.');
        }
        return $user;
    }

    /**
     * API endpoint'leri için — sadece JWT ile doğrula, session yok
     */
    public static function apiAuth(): array {
        $token = JWT::getBearerToken();
        if (!$token) {
            jsonResponse(false, null, 'Kimlik doğrulama gerekli.', 401);
        }
        try {
            return JWT::decode($token, JWT_SECRET);
        } catch (RuntimeException $e) {
            jsonResponse(false, null, $e->getMessage(), 401);
        }
        exit; // Buraya ulaşılmaz
    }

    /**
     * Kullanıcı giriş işlemi — session + JWT token oluştur
     */
    public static function login(string $email, string $sifre): array {
        $pdo  = db();
        $stmt = $pdo->prepare("
            SELECT k.*, o.ad as ofis_ad
            FROM kullanicilar k
            JOIN ofisler o ON o.id = k.ofis_id
            WHERE k.email = ? AND k.durum = 'aktif'
            LIMIT 1
        ");
        $stmt->execute([strtolower(trim($email))]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($sifre, $user['sifre'])) {
            return ['success' => false, 'message' => 'E-posta veya şifre hatalı.'];
        }

        // Son giriş güncelle
        $pdo->prepare("UPDATE kullanicilar SET son_giris = NOW() WHERE id = ?")->execute([$user['id']]);

        // Session başlat
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        session_regenerate_id(true);
        $_SESSION['user_id']   = $user['id'];
        $_SESSION['ofis_id']   = $user['ofis_id'];
        $_SESSION['rol']       = $user['rol'];
        $_SESSION['ad_soyad']  = $user['ad_soyad'];
        $_SESSION['email']     = $user['email'];
        $_SESSION['avatar']    = $user['avatar'];
        $_SESSION['ofis_ad']   = $user['ofis_ad'];

        // JWT token
        $token = JWT::encode([
            'user_id' => $user['id'],
            'ofis_id' => $user['ofis_id'],
            'rol'     => $user['rol'],
            'email'   => $user['email'],
            'exp'     => time() + JWT_EXPIRE,
        ], JWT_SECRET);

        return [
            'success' => true,
            'token'   => $token,
            'user'    => [
                'id'       => $user['id'],
                'ad_soyad' => $user['ad_soyad'],
                'email'    => $user['email'],
                'rol'      => $user['rol'],
                'ofis_id'  => $user['ofis_id'],
                'ofis_ad'  => $user['ofis_ad'],
                'avatar'   => $user['avatar'],
            ],
        ];
    }

    /**
     * Çıkış yap
     */
    public static function logout(): void {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params['path'], $params['domain'],
                $params['secure'], $params['httponly']
            );
        }
        session_destroy();
    }

    /**
     * Session'dan kullanıcı verisi al
     */
    private static function getSessionUser(): array {
        return [
            'user_id'  => $_SESSION['user_id'],
            'ofis_id'  => $_SESSION['ofis_id'],
            'rol'      => $_SESSION['rol'],
            'ad_soyad' => $_SESSION['ad_soyad'],
            'email'    => $_SESSION['email'],
            'avatar'   => $_SESSION['avatar'] ?? null,
            'ofis_ad'  => $_SESSION['ofis_ad'] ?? '',
        ];
    }

    /**
     * Aktif kullanıcı bilgisini al (giriş yoksa null)
     */
    public static function user(): ?array {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        if (empty($_SESSION['user_id'])) return null;
        return self::getSessionUser();
    }

    /**
     * Aktif kullanıcı ID
     */
    public static function id(): ?int {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
    }

    /**
     * Aktif ofis ID
     */
    public static function ofisId(): ?int {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        return isset($_SESSION['ofis_id']) ? (int)$_SESSION['ofis_id'] : null;
    }

    /**
     * Aktif rol
     */
    public static function rol(): string {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        return $_SESSION['rol'] ?? '';
    }

    /**
     * Admin mi?
     */
    public static function isAdmin(): bool {
        return self::rol() === 'admin';
    }

    /**
     * Admin veya broker mi?
     */
    public static function isBrokerOrAdmin(): bool {
        return in_array(self::rol(), ['admin', 'broker'], true);
    }

    /**
     * Veri filtresi: Danışman sadece kendi verilerini görür
     */
    public static function ofisFilter(): array {
        $user = self::user();
        if (!$user) return ['ofis_id' => 0, 'danisman_id' => 0];
        return [
            'ofis_id'     => (int)$user['ofis_id'],
            'danisman_id' => self::isBrokerOrAdmin() ? null : (int)$user['user_id'],
        ];
    }

    /**
     * Yeni kullanıcı kaydı (sadece admin yapabilir)
     */
    public static function register(array $data): array {
        $pdo = db();

        // Email benzersizlik kontrolü
        $stmt = $pdo->prepare("SELECT id FROM kullanicilar WHERE email = ?");
        $stmt->execute([strtolower(trim($data['email'] ?? ''))]);
        if ($stmt->fetch()) {
            return ['success' => false, 'message' => 'Bu e-posta adresi zaten kullanılıyor.'];
        }

        $hash = password_hash($data['sifre'] ?? '', PASSWORD_BCRYPT);
        $stmt = $pdo->prepare("
            INSERT INTO kullanicilar (ofis_id, ad_soyad, email, sifre, telefon, rol)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $data['ofis_id'] ?? 1,
            trim($data['ad_soyad'] ?? ''),
            strtolower(trim($data['email'] ?? '')),
            $hash,
            trim($data['telefon'] ?? ''),
            $data['rol'] ?? 'danisman',
        ]);

        return ['success' => true, 'id' => (int)$pdo->lastInsertId()];
    }

    /**
     * Şifre değiştir
     */
    public static function changePassword(int $userId, string $eskiSifre, string $yeniSifre): array {
        $pdo  = db();
        $stmt = $pdo->prepare("SELECT sifre FROM kullanicilar WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($eskiSifre, $user['sifre'])) {
            return ['success' => false, 'message' => 'Mevcut şifre hatalı.'];
        }

        $hash = password_hash($yeniSifre, PASSWORD_BCRYPT);
        $pdo->prepare("UPDATE kullanicilar SET sifre = ? WHERE id = ?")->execute([$hash, $userId]);
        return ['success' => true];
    }
}
