<?php
require_once dirname(__DIR__) . '/app/config/app.php';
require_once APP_DIR . '/helpers/JWT.php';
require_once APP_DIR . '/helpers/Functions.php';
require_once APP_DIR . '/middleware/Auth.php';

// Sadece admin erişebilir
$user = Auth::requireRole(['admin']);

// POST işlemi
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $ctrl = new AuthController();
    $ctrl->register();
    // Controller redirect eder
}

$pageTitle = 'Yeni Kullanıcı';
require_once APP_DIR . '/views/layout/header.php';

$ofisModel = new Ofis();
$ofisler   = $ofisModel->getAll();
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6">
    <div class="max-w-lg mx-auto">
        <h1 class="text-xl font-bold mb-6" style="color: #e8ecf4;">Yeni Kullanıcı Ekle</h1>

        <div class="rounded-2xl p-6" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
            <form method="POST">
                <?= csrfField() ?>

                <div class="grid grid-cols-1 gap-4">
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Ad Soyad *</label>
                        <input type="text" name="ad_soyad" required class="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">E-posta *</label>
                        <input type="email" name="email" required class="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Telefon</label>
                        <input type="text" name="telefon" class="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Şifre *</label>
                        <input type="password" name="sifre" required minlength="8" class="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Rol *</label>
                        <select name="rol" class="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                                style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                            <option value="danisman">Danışman</option>
                            <option value="broker">Broker</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                </div>

                <div class="flex gap-3 mt-6">
                    <button type="submit" class="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                            style="background: rgba(0,212,255,0.15); color: #00d4ff; border: 1px solid rgba(0,212,255,0.3);">
                        Kullanıcı Oluştur
                    </button>
                    <a href="<?= APP_URL ?>/ayarlar.php" class="px-4 py-2.5 rounded-xl text-sm transition-colors"
                       style="background: rgba(255,255,255,0.04); color: #7a8599; border: 1px solid rgba(255,255,255,0.06);">
                        İptal
                    </a>
                </div>
            </form>
        </div>
    </div>
</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
