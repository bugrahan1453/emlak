<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$ofisModel = new Ofis();
$ofis = $ofisModel->findById($user['ofis_id']);
$ayarlar = $ofisModel->getAyarlar($user['ofis_id']);

// POST işlemleri
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = postVal('action');
    $token  = postVal('csrf_token');

    if (!verifyCsrf($token)) {
        flashMessage('error', 'Güvenlik doğrulaması başarısız.');
        redirect(APP_URL . '/ayarlar.php');
    }

    if ($action === 'ofis_guncelle') {
        $ofisModel->update($user['ofis_id'], [
            'ad'     => postVal('ad'),
            'sehir'  => postVal('sehir'),
            'ilce'   => postVal('ilce'),
            'adres'  => postVal('adres'),
            'telefon'=> postVal('telefon'),
        ]);
        flashMessage('success', 'Ofis bilgileri güncellendi.');

    } elseif ($action === 'api_ayarlar') {
        $ofisModel->setAyar($user['ofis_id'], 'openai_key', postVal('openai_key'));
        $ofisModel->setAyar($user['ofis_id'], 'whatsapp_token', postVal('whatsapp_token'));
        $ofisModel->setAyar($user['ofis_id'], 'whatsapp_phone_id', postVal('whatsapp_phone_id'));
        $ofisModel->setAyar($user['ofis_id'], 'vps_url', postVal('vps_url'));
        flashMessage('success', 'API ayarları kaydedildi.');

    } elseif ($action === 'sifre_degistir') {
        $result = Auth::changePassword($user['user_id'], postVal('eski_sifre'), postVal('yeni_sifre'));
        flashMessage($result['success'] ? 'success' : 'error', $result['message'] ?? 'Şifre değiştirildi.');

    } elseif ($action === 'kullanici_ekle' && Auth::isAdmin()) {
        $result = Auth::register([
            'ofis_id'  => $user['ofis_id'],
            'ad_soyad' => postVal('ad_soyad'),
            'email'    => postVal('email'),
            'sifre'    => postVal('sifre'),
            'telefon'  => postVal('telefon'),
            'rol'      => postVal('rol') ?: 'danisman',
        ]);
        flashMessage($result['success'] ? 'success' : 'error', $result['success'] ? 'Kullanıcı oluşturuldu.' : $result['message']);

    } elseif ($action === 'kullanici_sil' && Auth::isAdmin()) {
        $silId = (int)postVal('kullanici_id');
        if ($silId && $silId !== $user['user_id']) {
            $userModel = new User();
            $userModel->delete($silId);
            flashMessage('success', 'Kullanıcı silindi.');
        }
    }

    redirect(APP_URL . '/ayarlar.php');
}

$kullanicilar = [];
if (Auth::isBrokerOrAdmin()) {
    $userModel = new User();
    $kullanicilar = $userModel->getByOfis($user['ofis_id']);
}

$pageTitle = 'Ayarlar';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 space-y-6" x-data="{ tab: 'ofis' }">

    <h1 class="text-xl font-bold" style="color: #e8ecf4;">⚙️ Ayarlar</h1>

    <!-- Tab Navigasyon -->
    <div class="flex gap-1 p-1 rounded-xl" style="background: rgba(255,255,255,0.03); width: fit-content;">
        <?php foreach ([
            ['id'=>'ofis','label'=>'🏢 Ofis'],
            ['id'=>'api','label'=>'🔑 API'],
            ['id'=>'sifre','label'=>'🔒 Şifre'],
            ['id'=>'kullanicilar','label'=>'👥 Kullanıcılar'],
        ] as $tab): ?>
        <button @click="tab='<?= $tab['id'] ?>'"
                :style="tab==='<?= $tab['id'] ?>' ? 'background:rgba(0,212,255,0.15);color:#00d4ff;' : 'color:#7a8599;'"
                class="px-4 py-2 rounded-lg text-xs font-medium transition-all">
            <?= $tab['label'] ?>
        </button>
        <?php endforeach; ?>
    </div>

    <!-- Ofis Ayarları -->
    <div x-show="tab==='ofis'">
        <div class="max-w-2xl">
            <form method="POST" class="rounded-2xl p-6 space-y-4" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="ofis_guncelle">
                <h2 class="text-sm font-semibold mb-4" style="color: #e8ecf4;">🏢 Ofis Bilgileri</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <?php foreach ([
                        ['name'=>'ad','label'=>'Ofis Adı','value'=>$ofis['ad']??'','req'=>true],
                        ['name'=>'sehir','label'=>'Şehir','value'=>$ofis['sehir']??''],
                        ['name'=>'ilce','label'=>'İlçe','value'=>$ofis['ilce']??''],
                        ['name'=>'telefon','label'=>'Telefon','value'=>$ofis['telefon']??''],
                    ] as $f): ?>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;"><?= $f['label'] ?></label>
                        <input type="text" name="<?= $f['name'] ?>" value="<?= e($f['value']) ?>"
                               <?= ($f['req'] ?? false) ? 'required' : '' ?>
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <?php endforeach; ?>
                    <div class="md:col-span-2">
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Adres</label>
                        <input type="text" name="adres" value="<?= e($ofis['adres']??'') ?>"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                </div>
                <button type="submit" class="px-6 py-2.5 rounded-xl text-sm font-medium"
                        style="background:rgba(0,212,255,0.15);color:#00d4ff;border:1px solid rgba(0,212,255,0.3);">
                    💾 Kaydet
                </button>
            </form>
        </div>
    </div>

    <!-- API Ayarları -->
    <div x-show="tab==='api'">
        <div class="max-w-2xl">
            <form method="POST" class="rounded-2xl p-6 space-y-4" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="api_ayarlar">
                <h2 class="text-sm font-semibold mb-4" style="color: #e8ecf4;">🔑 API Yapılandırması</h2>
                <?php foreach ([
                    ['name'=>'openai_key','label'=>'OpenAI API Key','placeholder'=>'sk-...','key'=>'openai_key'],
                    ['name'=>'whatsapp_token','label'=>'WhatsApp Bearer Token','placeholder'=>'EAAx...','key'=>'whatsapp_token'],
                    ['name'=>'whatsapp_phone_id','label'=>'WhatsApp Phone ID','placeholder'=>'1234567890','key'=>'whatsapp_phone_id'],
                    ['name'=>'vps_url','label'=>'VPS Webhook URL','placeholder'=>'https://vps.example.com','key'=>'vps_url'],
                ] as $f): ?>
                <div>
                    <label class="block text-xs mb-1.5" style="color:#7a8599;"><?= $f['label'] ?></label>
                    <input type="text" name="<?= $f['name'] ?>"
                           value="<?= e($ayarlar[$f['key']] ?? '') ?>"
                           placeholder="<?= $f['placeholder'] ?>"
                           class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none font-mono"
                           style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                </div>
                <?php endforeach; ?>
                <button type="submit" class="px-6 py-2.5 rounded-xl text-sm font-medium"
                        style="background:rgba(0,212,255,0.15);color:#00d4ff;border:1px solid rgba(0,212,255,0.3);">
                    💾 Kaydet
                </button>
            </form>
        </div>
    </div>

    <!-- Şifre Değiştir -->
    <div x-show="tab==='sifre'">
        <div class="max-w-md">
            <form method="POST" class="rounded-2xl p-6 space-y-4" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="sifre_degistir">
                <h2 class="text-sm font-semibold mb-4" style="color: #e8ecf4;">🔒 Şifre Değiştir</h2>
                <?php foreach ([['eski_sifre','Mevcut Şifre'],['yeni_sifre','Yeni Şifre']] as [$n,$l]): ?>
                <div>
                    <label class="block text-xs mb-1.5" style="color:#7a8599;"><?= $l ?></label>
                    <input type="password" name="<?= $n ?>" required minlength="8"
                           class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                           style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                </div>
                <?php endforeach; ?>
                <button type="submit" class="px-6 py-2.5 rounded-xl text-sm font-medium"
                        style="background:rgba(0,212,255,0.15);color:#00d4ff;border:1px solid rgba(0,212,255,0.3);">
                    🔑 Şifreyi Güncelle
                </button>
            </form>
        </div>
    </div>

    <!-- Kullanıcı Yönetimi -->
    <?php if (Auth::isAdmin()): ?>
    <div x-show="tab==='kullanicilar'">
        <!-- Kullanıcı Listesi -->
        <div class="rounded-2xl overflow-hidden mb-6" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
            <div class="px-4 py-3 border-b" style="border-color: rgba(255,255,255,0.06);">
                <span class="text-sm font-semibold" style="color:#e8ecf4;">👥 Kullanıcılar (<?= count($kullanicilar) ?>)</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                            <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">Ad</th>
                            <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">E-posta</th>
                            <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">Rol</th>
                            <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">Durum</th>
                            <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">Son Giriş</th>
                            <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($kullanicilar as $k): ?>
                        <tr class="border-b hover:bg-white/2" style="border-color: rgba(255,255,255,0.04);">
                            <td class="px-4 py-3" style="color:#e8ecf4;"><?= e($k['ad_soyad']) ?></td>
                            <td class="px-4 py-3 text-xs" style="color:#7a8599;"><?= e($k['email']) ?></td>
                            <td class="px-4 py-3"><?= badge(ucfirst($k['rol']), ['admin'=>'red','broker'=>'amber'][$k['rol']] ?? 'cyan') ?></td>
                            <td class="px-4 py-3"><?= badge($k['durum']==='aktif'?'Aktif':'Pasif',$k['durum']==='aktif'?'green':'gray') ?></td>
                            <td class="px-4 py-3 text-xs" style="color:#7a8599;"><?= $k['son_giris'] ? zamanFarki($k['son_giris']) : '-' ?></td>
                            <td class="px-4 py-3">
                                <?php if ($k['id'] !== $user['user_id']): ?>
                                <form method="POST" onsubmit="return confirm('Kullanıcıyı silmek istediğinizden emin misiniz?');">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="action" value="kullanici_sil">
                                    <input type="hidden" name="kullanici_id" value="<?= $k['id'] ?>">
                                    <button type="submit" class="text-xs px-2 py-1 rounded-lg"
                                            style="background:rgba(255,51,102,0.1);color:#ff3366;">Sil</button>
                                </form>
                                <?php else: ?>
                                <span class="text-xs" style="color:#7a8599;">Mevcut Kullanıcı</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Yeni Kullanıcı Ekle -->
        <div class="max-w-2xl">
            <form method="POST" class="rounded-2xl p-6 space-y-4" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="kullanici_ekle">
                <h2 class="text-sm font-semibold mb-4" style="color: #e8ecf4;">➕ Yeni Kullanıcı</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2">
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Ad Soyad *</label>
                        <input type="text" name="ad_soyad" required class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">E-posta *</label>
                        <input type="email" name="email" required class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Telefon</label>
                        <input type="text" name="telefon" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Şifre *</label>
                        <input type="password" name="sifre" required minlength="8" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Rol</label>
                        <select name="rol" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                                style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                            <option value="danisman">Danışman</option>
                            <option value="broker">Broker</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                </div>
                <button type="submit" class="px-6 py-2.5 rounded-xl text-sm font-medium"
                        style="background:rgba(0,212,255,0.15);color:#00d4ff;border:1px solid rgba(0,212,255,0.3);">
                    ➕ Kullanıcı Ekle
                </button>
            </form>
        </div>
    </div>
    <?php endif; ?>

</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
