<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$ctrl = new MusteriController();
$id   = (int)(getVal('id') ?: 0);
$musteri = null;

if ($id) {
    $data    = $ctrl->show($id);
    $musteri = $data['musteri'] ?? null;
    if (!$musteri) { flashMessage('error', 'Müşteri bulunamadı.'); redirect(APP_URL . '/musteriler.php'); }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($id) $ctrl->update($id);
    else     $ctrl->store();
}

$tercihler = is_array($musteri['tercihler'] ?? null) ? $musteri['tercihler'] : [];
$pageTitle = $id ? 'Müşteri Düzenle' : 'Yeni Müşteri';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6">
    <div class="max-w-2xl mx-auto">
        <div class="flex items-center justify-between mb-6">
            <h1 class="text-xl font-bold" style="color: #e8ecf4;"><?= $id ? '✏️ Müşteri Düzenle' : '➕ Yeni Müşteri' ?></h1>
            <a href="<?= $id ? APP_URL . '/musteri-detay.php?id=' . $id : APP_URL . '/musteriler.php' ?>"
               class="text-xs px-3 py-1.5 rounded-lg"
               style="background: rgba(255,255,255,0.04); color: #7a8599; border: 1px solid rgba(255,255,255,0.06);">← Geri</a>
        </div>

        <form method="POST" class="space-y-4">
            <?= csrfField() ?>

            <div class="rounded-2xl p-5 space-y-4" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h2 class="text-sm font-semibold" style="color: #e8ecf4;">👤 Kişisel Bilgiler</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2">
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Ad Soyad *</label>
                        <input type="text" name="ad_soyad" required value="<?= e($musteri['ad_soyad'] ?? '') ?>"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Telefon *</label>
                        <input type="text" name="telefon" required value="<?= e($musteri['telefon'] ?? '') ?>"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">E-posta</label>
                        <input type="email" name="email" value="<?= e($musteri['email'] ?? '') ?>"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Müşteri Tipi</label>
                        <select name="tip" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                            <?php foreach (['alici'=>'Alıcı','satici'=>'Satıcı','yatirmci'=>'Yatırımcı','kiralayan'=>'Kiralayan'] as $v=>$l): ?>
                            <option value="<?= $v ?>" <?= ($musteri['tip'] ?? 'alici') === $v ? 'selected' : '' ?>><?= $l ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <?php if ($id): ?>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Durum</label>
                        <select name="durum" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                            <?php foreach (['aktif'=>'Aktif','pasif'=>'Pasif','anlasildi'=>'Anlaşıldı','vazgecti'=>'Vazgeçti'] as $v=>$l): ?>
                            <option value="<?= $v ?>" <?= ($musteri['durum'] ?? 'aktif') === $v ? 'selected' : '' ?>><?= $l ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <?php endif; ?>
                </div>
            </div>

            <div class="rounded-2xl p-5 space-y-4" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h2 class="text-sm font-semibold" style="color: #e8ecf4;">💰 Bütçe ve Tercihler</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="md:col-span-2">
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Min Bütçe (₺)</label>
                        <input type="number" name="butce_min" value="<?= e($musteri['butce_min'] ?? '') ?>" placeholder="0"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none font-mono" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Max Bütçe (₺)</label>
                        <input type="number" name="butce_max" value="<?= e($musteri['butce_max'] ?? '') ?>" placeholder="5000000"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none font-mono" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Tercih Şehir</label>
                        <input type="text" name="tercih_sehir" value="<?= e($tercihler['sehir'] ?? '') ?>" placeholder="Kocaeli"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Tercih İlçe</label>
                        <input type="text" name="tercih_ilce" value="<?= e($tercihler['ilce'] ?? '') ?>" placeholder="İzmit"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Tercih Oda</label>
                        <select name="tercih_oda" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                            <option value="">Fark Etmez</option>
                            <?php foreach (['1+1','2+1','3+1','4+1','5+1'] as $o): ?>
                            <option value="<?= $o ?>" <?= ($tercihler['oda_sayisi'] ?? '') === $o ? 'selected' : '' ?>><?= $o ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Tercih Emlak</label>
                        <select name="tercih_emlak_tipi" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                            <option value="">Fark Etmez</option>
                            <?php foreach (['daire'=>'Daire','villa'=>'Villa','arsa'=>'Arsa','dukkan'=>'Dükkan'] as $v=>$l): ?>
                            <option value="<?= $v ?>" <?= ($tercihler['emlak_tipi'] ?? '') === $v ? 'selected' : '' ?>><?= $l ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Min m²</label>
                        <input type="number" name="tercih_m2_min" value="<?= e($tercihler['metrekare_min'] ?? '') ?>"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1.5" style="color:#7a8599;">Max m²</label>
                        <input type="number" name="tercih_m2_max" value="<?= e($tercihler['metrekare_max'] ?? '') ?>"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                </div>
            </div>

            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h2 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">📝 Notlar</h2>
                <textarea name="notlar" rows="3" placeholder="Müşteri hakkında notlar..."
                          class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none resize-none"
                          style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;"><?= e($musteri['notlar'] ?? '') ?></textarea>
            </div>

            <div class="flex gap-3">
                <button type="submit" class="flex-1 py-3 rounded-xl text-sm font-semibold"
                        style="background:rgba(0,212,255,0.15);color:#00d4ff;border:1px solid rgba(0,212,255,0.3);">
                    <?= $id ? '💾 Güncelle' : '➕ Müşteri Ekle' ?>
                </button>
                <a href="<?= $id ? APP_URL . '/musteri-detay.php?id=' . $id : APP_URL . '/musteriler.php' ?>"
                   class="px-6 py-3 rounded-xl text-sm" style="background:rgba(255,255,255,0.04);color:#7a8599;border:1px solid rgba(255,255,255,0.06);">İptal</a>
            </div>
        </form>
    </div>
</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
