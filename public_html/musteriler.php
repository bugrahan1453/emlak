<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$ctrl = new MusteriController();
$data = $ctrl->index();

$pageTitle = 'Müşteri CRM';
$extraJs   = 'musteriler.js';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 space-y-4"
      x-data="{ modalAcik: false, gorunu: 'kart' }">

    <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
            <h1 class="text-xl font-bold" style="color: #e8ecf4;">📇 Müşteri CRM</h1>
            <p class="text-xs mt-0.5" style="color: #7a8599;">Toplam <?= number_format($data['musteriler']['toplam'], 0, ',', '.') ?> müşteri</p>
        </div>
        <div class="flex items-center gap-2">
            <div class="flex rounded-xl overflow-hidden border" style="border-color: rgba(255,255,255,0.08);">
                <button @click="gorunu='kart'" :style="gorunu==='kart' ? 'background:rgba(0,212,255,0.15);color:#00d4ff;' : 'background:rgba(255,255,255,0.03);color:#7a8599;'" class="px-3 py-2 text-xs">⊞ Kart</button>
                <button @click="gorunu='liste'" :style="gorunu==='liste' ? 'background:rgba(0,212,255,0.15);color:#00d4ff;' : 'background:rgba(255,255,255,0.03);color:#7a8599;'" class="px-3 py-2 text-xs">☰ Liste</button>
            </div>
            <button @click="modalAcik = true"
                    class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
                    style="background: rgba(0,212,255,0.15); color: #00d4ff; border: 1px solid rgba(0,212,255,0.3);">
                + Yeni Müşteri
            </button>
        </div>
    </div>

    <!-- Filtreler -->
    <?php
    $filtreler = [
        ['type' => 'select', 'name' => 'tip', 'label' => 'Müşteri Tipi', 'options' => ['alici'=>'Alıcı','satici'=>'Satıcı','yatirmci'=>'Yatırımcı','kiralayan'=>'Kiralayan']],
        ['type' => 'select', 'name' => 'durum', 'label' => 'Durum', 'options' => ['aktif'=>'Aktif','pasif'=>'Pasif','anlasildi'=>'Anlaşıldı','vazgecti'=>'Vazgeçti']],
        ['type' => 'number', 'name' => 'butce_min', 'label' => 'Min Bütçe (₺)'],
        ['type' => 'number', 'name' => 'butce_max', 'label' => 'Max Bütçe (₺)'],
        ['type' => 'text', 'name' => 'q', 'label' => 'Ara...'],
    ];
    include APP_DIR . '/views/components/filtre-bar.php';
    ?>

    <!-- Kart Görünümü -->
    <div x-show="gorunu==='kart'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <?php foreach ($data['musteriler']['data'] as $musteri):
            include APP_DIR . '/views/components/musteri-card.php';
        endforeach; ?>
        <?php if (empty($data['musteriler']['data'])): ?>
        <div class="col-span-full py-12 text-center text-sm" style="color: #7a8599;">Müşteri bulunamadı.</div>
        <?php endif; ?>
    </div>

    <!-- Liste Görünümü -->
    <div x-show="gorunu==='liste'">
        <?php
        $tabloHeaders = ['Ad Soyad', 'Tip', 'Telefon', 'Bütçe', 'Durum', 'Son İletişim', 'İşlem'];
        $tabloRows = [];
        foreach ($data['musteriler']['data'] as $m) {
            $tabloRows[] = [
                '<a href="' . APP_URL . '/musteri-detay.php?id=' . (int)$m['id'] . '" class="hover:text-cyan-400 font-medium" style="color:#e8ecf4;">' . e($m['ad_soyad']) . '</a>',
                musteriTipBadge($m['tip']),
                e($m['telefon']),
                $m['butce_max'] ? '<span class="font-mono text-xs" style="color:#00d4ff;">Max ' . number_format($m['butce_max'], 0, ',', '.') . ' ₺</span>' : '-',
                badge(match($m['durum']) { 'aktif'=>'Aktif','pasif'=>'Pasif','anlasildi'=>'Anlaşıldı','vazgecti'=>'Vazgeçti', default=>$m['durum'] }, match($m['durum']) { 'aktif'=>'green','pasif'=>'gray','anlasildi'=>'purple','vazgecti'=>'red', default=>'gray' }),
                $m['son_iletisim'] ? zamanFarki($m['son_iletisim']) : '<span style="color:#7a8599;">-</span>',
                '<div class="flex gap-1"><a href="' . APP_URL . '/musteri-detay.php?id=' . (int)$m['id'] . '" class="px-2 py-1 text-xs rounded-lg" style="background:rgba(0,212,255,0.1);color:#00d4ff;">Detay</a><a href="' . APP_URL . '/musteri-ekle.php?id=' . (int)$m['id'] . '" class="px-2 py-1 text-xs rounded-lg" style="background:rgba(255,255,255,0.04);color:#7a8599;">Düzenle</a></div>',
            ];
        }
        $tabloToplam = $data['musteriler']['toplam'];
        $tabloSayfa  = max(1, (int)(getVal('sayfa') ?: 1));
        include APP_DIR . '/views/components/tablo.php';
        ?>
    </div>

    <!-- Hızlı Müşteri Ekle Modal -->
    <div x-show="modalAcik" x-transition @click.away="modalAcik=false"
         class="fixed inset-0 z-50 flex items-center justify-center p-4"
         style="background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);">
        <div class="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
             style="background: #0c1129; border: 1px solid rgba(255,255,255,0.08);">
            <div class="flex items-center justify-between px-6 py-4 border-b" style="border-color: rgba(255,255,255,0.06);">
                <span class="font-semibold text-sm" style="color: #e8ecf4;">➕ Hızlı Müşteri Ekle</span>
                <button @click="modalAcik=false" style="color:#7a8599;">✕</button>
            </div>
            <form method="POST" action="<?= APP_URL ?>/musteri-ekle.php" class="p-6 space-y-4">
                <?= csrfField() ?>
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="block text-xs mb-1" style="color: #7a8599;">Ad Soyad *</label>
                        <input type="text" name="ad_soyad" required class="w-full px-3 py-2 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1" style="color: #7a8599;">Telefon *</label>
                        <input type="text" name="telefon" required class="w-full px-3 py-2 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1" style="color: #7a8599;">Tip</label>
                        <select name="tip" class="w-full px-3 py-2 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                            <option value="alici">Alıcı</option><option value="satici">Satıcı</option><option value="yatirmci">Yatırımcı</option><option value="kiralayan">Kiralayan</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs mb-1" style="color: #7a8599;">Max Bütçe (₺)</label>
                        <input type="number" name="butce_max" class="w-full px-3 py-2 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1" style="color: #7a8599;">Tercih İlçe</label>
                        <input type="text" name="tercih_ilce" class="w-full px-3 py-2 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                </div>
                <button type="submit" class="w-full py-2.5 rounded-xl text-sm font-medium" style="background:rgba(0,212,255,0.15);color:#00d4ff;border:1px solid rgba(0,212,255,0.3);">
                    Müşteri Ekle
                </button>
            </form>
        </div>
    </div>

</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
