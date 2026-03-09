<?php
/**
 * EmlakRadar Pro - Auth Controller
 */

class AuthController {
    public function login(): void {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;

        $token = postVal('csrf_token');
        if (!verifyCsrf($token)) {
            jsonResponse(false, null, 'Güvenlik doğrulaması başarısız.', 403);
        }

        $email  = postVal('email');
        $sifre  = postVal('sifre');

        if (!$email || !$sifre) {
            flashMessage('error', 'E-posta ve şifre zorunludur.');
            redirect(APP_URL . '/index.php');
        }

        $result = Auth::login($email, $sifre);
        if (!$result['success']) {
            flashMessage('error', $result['message']);
            redirect(APP_URL . '/index.php');
        }

        logSystem('login', 'Başarılı giriş', $result['user']['id'], $result['user']['ofis_id']);
        $redirect = getVal('redirect') ?: APP_URL . '/dashboard.php';
        redirect($redirect);
    }

    public function apiLogin(): void {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $email = trim($data['email'] ?? '');
        $sifre = $data['sifre'] ?? '';

        if (!$email || !$sifre) {
            jsonResponse(false, null, 'E-posta ve şifre zorunludur.', 400);
        }

        $result = Auth::login($email, $sifre);
        if (!$result['success']) {
            jsonResponse(false, null, $result['message'], 401);
        }

        jsonResponse(true, $result);
    }

    public function logout(): void {
        Auth::logout();
        redirect(APP_URL . '/index.php');
    }

    public function register(): void {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;

        $token = postVal('csrf_token');
        if (!verifyCsrf($token)) {
            flashMessage('error', 'Güvenlik doğrulaması başarısız.');
            redirect(APP_URL . '/register.php');
        }

        // Yalnızca admin kaydedebilir
        $user = Auth::user();
        if (!$user || !Auth::isAdmin()) {
            flashMessage('error', 'Yalnızca admin yeni kullanıcı ekleyebilir.');
            redirect(APP_URL . '/ayarlar.php');
        }

        $result = Auth::register([
            'ofis_id'  => $user['ofis_id'],
            'ad_soyad' => postVal('ad_soyad'),
            'email'    => postVal('email'),
            'sifre'    => postVal('sifre'),
            'telefon'  => postVal('telefon'),
            'rol'      => postVal('rol') ?: 'danisman',
        ]);

        if (!$result['success']) {
            flashMessage('error', $result['message']);
            redirect(APP_URL . '/ayarlar.php');
        }

        logSystem('register', 'Yeni kullanıcı: ' . postVal('email'), $user['user_id'], $user['ofis_id']);
        flashMessage('success', 'Kullanıcı başarıyla oluşturuldu.');
        redirect(APP_URL . '/ayarlar.php');
    }
}
