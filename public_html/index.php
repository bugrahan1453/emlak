<?php
require_once dirname(__DIR__) . '/app/config/app.php';

// Zaten giriş yapmışsa dashboard'a yönlendir
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
if (!empty($_SESSION['user_id'])) {
    header('Location: ' . APP_URL . '/dashboard.php');
    exit;
}

// Login işlemi
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_once APP_DIR . '/helpers/JWT.php';
    require_once APP_DIR . '/helpers/Functions.php';
    require_once APP_DIR . '/middleware/Auth.php';

    $token = $_POST['csrf_token'] ?? '';
    if (!verifyCsrf($token)) {
        $error = 'Güvenlik doğrulaması başarısız. Sayfayı yenileyin.';
    } else {
        $result = Auth::login($_POST['email'] ?? '', $_POST['sifre'] ?? '');
        if ($result['success']) {
            $redirect = isset($_GET['redirect']) ? urldecode($_GET['redirect']) : APP_URL . '/dashboard.php';
            header('Location: ' . $redirect);
            exit;
        } else {
            $error = $result['message'];
        }
    }
}
?>
<!DOCTYPE html>
<html lang="tr" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#060a1a">
    <title>Giriş — EmlakRadar Pro</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <style>
        body { font-family: 'Outfit', sans-serif; background: #060a1a; color: #e8ecf4; min-height: 100vh; }
        .glass { background: rgba(15,23,62,0.7); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.06); }
        .btn-primary { background: linear-gradient(135deg, #00d4ff22, #8b5cf622); border: 1px solid rgba(0,212,255,0.3); color: #00d4ff; transition: all .2s; }
        .btn-primary:hover { background: rgba(0,212,255,0.2); box-shadow: 0 0 20px rgba(0,212,255,0.2); }
        .input-field { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: #e8ecf4; transition: border-color .2s; }
        .input-field:focus { outline: none; border-color: rgba(0,212,255,0.4); box-shadow: 0 0 0 3px rgba(0,212,255,0.08); }
        .grid-bg { background-image: linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px); background-size: 40px 40px; }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .float { animation: float 6s ease-in-out infinite; }
        @keyframes pulse-glow { 0%,100% { opacity: .4; } 50% { opacity: 1; } }
        .radar-pulse { animation: pulse-glow 2s ease-in-out infinite; }
    </style>
</head>
<body class="grid-bg" x-data="{ showSifre: false }">

<!-- Arka plan efektleri -->
<div class="fixed inset-0 pointer-events-none overflow-hidden">
    <div class="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-5 blur-3xl" style="background: #00d4ff;"></div>
    <div class="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-5 blur-3xl" style="background: #8b5cf6;"></div>
</div>

<div class="min-h-screen flex">
    <!-- Sol Panel (masaüstü) -->
    <div class="hidden lg:flex flex-col justify-center items-center w-1/2 p-12 relative">
        <div class="text-center max-w-md">
            <div class="text-7xl mb-6 float">📡</div>
            <h1 class="text-4xl font-bold mb-4" style="background: linear-gradient(135deg, #00d4ff, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                EmlakRadar Pro
            </h1>
            <p class="text-lg mb-8" style="color: #7a8599;">
                Akıllı Emlak Otomasyon Paneli.<br>
                Piyasayı takip et, fırsatları yakala.
            </p>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <?php foreach ([
                    ['📊','Dashboard KPI'],['🔗','Akıllı Eşleştirme'],
                    ['🤖','AI Değerleme'],['✅','Görev Takibi'],
                ] as [$icon, $label]): ?>
                <div class="flex items-center gap-2 px-4 py-3 rounded-xl" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);">
                    <span><?= $icon ?></span>
                    <span style="color: #7a8599;"><?= $label ?></span>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
    </div>

    <!-- Sağ Panel - Login Formu -->
    <div class="flex-1 flex flex-col justify-center items-center p-6 lg:p-12">
        <div class="w-full max-w-md">
            <!-- Logo (mobil) -->
            <div class="lg:hidden text-center mb-8">
                <div class="text-5xl mb-3">📡</div>
                <h1 class="text-2xl font-bold" style="color: #00d4ff;">EmlakRadar Pro</h1>
            </div>

            <div class="glass rounded-2xl p-8">
                <h2 class="text-xl font-semibold mb-1" style="color: #e8ecf4;">Hoş Geldiniz</h2>
                <p class="text-sm mb-6" style="color: #7a8599;">Hesabınıza giriş yapın</p>

                <?php if (!empty($error)): ?>
                <div class="mb-4 px-4 py-3 rounded-xl text-sm" style="background: rgba(255,51,102,0.1); color: #ff3366; border: 1px solid rgba(255,51,102,0.2);">
                    ❌ <?= htmlspecialchars($error, ENT_QUOTES) ?>
                </div>
                <?php endif; ?>

                <form method="POST" action="<?= APP_URL ?>/index.php<?= isset($_GET['redirect']) ? '?redirect=' . urlencode($_GET['redirect']) : '' ?>">
                    <?php
                    require_once APP_DIR . '/helpers/JWT.php';
                    require_once APP_DIR . '/helpers/Functions.php';
                    echo csrfField();
                    ?>

                    <div class="mb-4">
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">E-posta Adresi</label>
                        <input type="email" name="email" required
                               value="<?= htmlspecialchars($_POST['email'] ?? '', ENT_QUOTES) ?>"
                               placeholder="admin@emlakradar.com"
                               class="input-field w-full px-4 py-3 rounded-xl text-sm">
                    </div>

                    <div class="mb-6 relative">
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Şifre</label>
                        <input :type="showSifre ? 'text' : 'password'"
                               name="sifre" required
                               placeholder="••••••••"
                               class="input-field w-full px-4 py-3 pr-12 rounded-xl text-sm">
                        <button type="button" @click="showSifre = !showSifre"
                                class="absolute right-3 top-8 text-sm" style="color: #7a8599;">
                            <span x-text="showSifre ? '🙈' : '👁️'"></span>
                        </button>
                    </div>

                    <button type="submit"
                            class="btn-primary w-full py-3 rounded-xl text-sm font-semibold">
                        Giriş Yap →
                    </button>
                </form>

                <div class="mt-6 pt-4 border-t text-center" style="border-color: rgba(255,255,255,0.06);">
                    <p class="text-xs" style="color: #7a8599;">
                        Demo: <span style="color: #00d4ff;">admin@emlakradar.com</span> / <span style="color: #00d4ff;">password</span>
                    </p>
                </div>
            </div>

            <!-- Radar aktif göstergesi -->
            <div class="flex items-center justify-center gap-2 mt-6 text-xs" style="color: #7a8599;">
                <span class="w-2 h-2 rounded-full radar-pulse" style="background: #00ff88;"></span>
                <span>Sistem aktif</span>
            </div>
        </div>
    </div>
</div>

</body>
</html>
