<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$ctrl = new IlanController();
$id   = (int)(getVal('id') ?: 0);
$ilan = null;

if ($id) {
    $data = $ctrl->show($id);
    $ilan = $data['ilan'] ?? null;
    if (!$ilan) { flashMessage('error', 'İlan bulunamadı.'); redirect(APP_URL . '/ilanlar.php'); }
}

// POST işlemi
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($id) $ctrl->update($id);
    else     $ctrl->store();
}

$pageTitle = $id ? 'İlan Düzenle' : 'Yeni İlan Ekle';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6">
    <div class="max-w-3xl mx-auto">
        <div class="flex items-center justify-between mb-6">
            <h1 class="text-xl font-bold" style="color: #e8ecf4;"><?= $id ? '✏️ İlan Düzenle' : '➕ Yeni İlan Ekle' ?></h1>
            <a href="<?= APP_URL ?>/ilanlar.php" class="text-xs px-3 py-1.5 rounded-lg"
               style="background: rgba(255,255,255,0.04); color: #7a8599; border: 1px solid rgba(255,255,255,0.06);">
                ← Geri
            </a>
        </div>

        <form method="POST" enctype="multipart/form-data" class="space-y-4">
            <?= csrfField() ?>

            <!-- Temel Bilgiler -->
            <div class="rounded-2xl p-5 space-y-4" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h2 class="text-sm font-semibold" style="color: #e8ecf4;">📋 Temel Bilgiler</h2>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2">
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Başlık *</label>
                        <input type="text" name="baslik" required
                               value="<?= e($ilan['baslik'] ?? '') ?>"
                               placeholder="Örn: İzmit Merkez 3+1 Satılık Daire"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>

                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Fiyat (₺) *</label>
                        <input type="text" name="fiyat" required
                               value="<?= e($ilan['fiyat'] ?? '') ?>"
                               placeholder="2.500.000"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none font-mono"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #00d4ff;">
                    </div>

                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">İlan Tipi</label>
                        <select name="ilan_tipi" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                                style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                            <option value="satilik" <?= ($ilan['ilan_tipi'] ?? '') === 'satilik' ? 'selected' : '' ?>>Satılık</option>
                            <option value="kiralik" <?= ($ilan['ilan_tipi'] ?? '') === 'kiralik' ? 'selected' : '' ?>>Kiralık</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Emlak Tipi</label>
                        <select name="emlak_tipi" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                                style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                            <?php foreach (['daire'=>'Daire','villa'=>'Villa','mustakil'=>'Müstakil','arsa'=>'Arsa','dukkan'=>'Dükkan','ofis'=>'Ofis','diger'=>'Diğer'] as $v => $l): ?>
                            <option value="<?= $v ?>" <?= ($ilan['emlak_tipi'] ?? 'daire') === $v ? 'selected' : '' ?>><?= $l ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <?php if (Auth::isBrokerOrAdmin()): ?>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Durum</label>
                        <select name="durum" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                                style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                            <?php foreach (['aktif'=>'Aktif','pasif'=>'Pasif','satildi'=>'Satıldı','kiralandi'=>'Kiralandı'] as $v => $l): ?>
                            <option value="<?= $v ?>" <?= ($ilan['durum'] ?? 'aktif') === $v ? 'selected' : '' ?>><?= $l ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <?php endif; ?>
                </div>

                <div>
                    <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Açıklama</label>
                    <textarea name="aciklama" rows="4" placeholder="İlan hakkında detaylı bilgi..."
                              class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none resize-none"
                              style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;"><?= e($ilan['aciklama'] ?? '') ?></textarea>
                </div>
            </div>

            <!-- Konum Bilgileri -->
            <div class="rounded-2xl p-5 space-y-4" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h2 class="text-sm font-semibold" style="color: #e8ecf4;">📍 Konum Bilgileri</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Şehir *</label>
                        <input type="text" name="sehir" required value="<?= e($ilan['sehir'] ?? '') ?>" placeholder="Kocaeli"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">İlçe</label>
                        <input type="text" name="ilce" value="<?= e($ilan['ilce'] ?? '') ?>" placeholder="İzmit"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Mahalle</label>
                        <input type="text" name="mahalle" value="<?= e($ilan['mahalle'] ?? '') ?>" placeholder="Orhan Mah."
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div class="md:col-span-3">
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Adres</label>
                        <input type="text" name="adres" value="<?= e($ilan['adres'] ?? '') ?>" placeholder="Tam adres..."
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Enlem</label>
                        <input type="text" name="lat" value="<?= e($ilan['lat'] ?? '') ?>" placeholder="40.7656..."
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none font-mono"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Boylam</label>
                        <input type="text" name="lng" value="<?= e($ilan['lng'] ?? '') ?>" placeholder="29.9187..."
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none font-mono"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                </div>
            </div>

            <!-- Özellikler -->
            <div class="rounded-2xl p-5 space-y-4" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h2 class="text-sm font-semibold" style="color: #e8ecf4;">🏠 Özellikler</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Metrekare</label>
                        <input type="number" name="metrekare" value="<?= e($ilan['metrekare'] ?? '') ?>" placeholder="120"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Oda Sayısı</label>
                        <select name="oda_sayisi" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                                style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                            <option value="">Seç</option>
                            <?php foreach (['1+0','1+1','2+1','3+1','4+1','5+1','6+'] as $o): ?>
                            <option value="<?= $o ?>" <?= ($ilan['oda_sayisi'] ?? '') === $o ? 'selected' : '' ?>><?= $o ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Kat</label>
                        <input type="text" name="kat" value="<?= e($ilan['kat'] ?? '') ?>" placeholder="3/8"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Bina Yaşı</label>
                        <input type="number" name="bina_yasi" value="<?= e($ilan['bina_yasi'] ?? '') ?>" placeholder="10"
                               class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                               style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Isıtma</label>
                        <select name="isitma_tipi" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                                style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                            <option value="">Seç</option>
                            <?php foreach (['Doğalgaz','Kombi','Merkezi','Soba','Klima','Yok'] as $h): ?>
                            <option value="<?= $h ?>" <?= ($ilan['isitma_tipi'] ?? '') === $h ? 'selected' : '' ?>><?= $h ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5" style="color: #7a8599;">Eşya</label>
                        <select name="esya_durumu" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                                style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                            <option value="">Seç</option>
                            <option value="bosalt" <?= ($ilan['esya_durumu'] ?? '') === 'bosalt' ? 'selected' : '' ?>>Boş</option>
                            <option value="esyali" <?= ($ilan['esya_durumu'] ?? '') === 'esyali' ? 'selected' : '' ?>>Eşyalı</option>
                            <option value="yarı esyali" <?= ($ilan['esya_durumu'] ?? '') === 'yarı esyali' ? 'selected' : '' ?>>Yarı Eşyalı</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Fotoğraflar -->
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h2 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">📸 Fotoğraflar</h2>
                <input type="file" name="fotograflar[]" multiple accept="image/*"
                       class="w-full text-sm" style="color: #7a8599;">
                <p class="text-xs mt-2" style="color: #7a8599;">JPEG, PNG, WebP — Max 10 MB her biri. <?= $id ? 'Mevcut fotoğraflara eklenecek.' : '' ?></p>
            </div>

            <!-- Notlar -->
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h2 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">📝 İç Notlar</h2>
                <textarea name="notlar" rows="3" placeholder="Dahili notlar (müşteriye gösterilmez)..."
                          class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none resize-none"
                          style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;"><?= e($ilan['notlar'] ?? '') ?></textarea>
            </div>

            <!-- Butonlar -->
            <div class="flex gap-3">
                <button type="submit" class="flex-1 py-3 rounded-xl text-sm font-semibold transition-colors"
                        style="background: rgba(0,212,255,0.15); color: #00d4ff; border: 1px solid rgba(0,212,255,0.3);">
                    <?= $id ? '💾 Güncelle' : '➕ İlan Ekle' ?>
                </button>
                <a href="<?= $id ? APP_URL . '/ilan-detay.php?id=' . $id : APP_URL . '/ilanlar.php' ?>"
                   class="px-6 py-3 rounded-xl text-sm transition-colors"
                   style="background: rgba(255,255,255,0.04); color: #7a8599; border: 1px solid rgba(255,255,255,0.06);">
                    İptal
                </a>
            </div>
        </form>
    </div>
</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
