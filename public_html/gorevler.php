<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$ctrl = new GorevController();
$data = $ctrl->index();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = postVal('action');
    if ($action === 'ekle') $ctrl->store();
    elseif ($action === 'tamamla') {
        $gorevId = (int)postVal('gorev_id');
        if ($gorevId) $ctrl->complete($gorevId);
    }
}

$pageTitle = 'Görev Merkezi';
$extraJs   = 'gorevler.js';
require_once APP_DIR . '/views/layout/header.php';

// Danışmanlar listesi (admin/broker için)
$danismanlar = [];
if (Auth::isBrokerOrAdmin()) {
    $userModel = new User();
    $danismanlar = $userModel->getByOfis($user['ofis_id'], 'danisman');
}

$musteriler = [];
try {
    $musteriModel = new Musteri();
    $musterilerData = $musteriModel->getList(['ofis_id' => $user['ofis_id'], 'durum' => 'aktif'], 1, 100);
    $musteriler = $musterilerData['data'];
} catch (Exception $e) {}
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 space-y-4"
      x-data="{ modalAcik: false, aiModal: false, aiSenaryo: '', swipeMode: false }">

    <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
            <h1 class="text-xl font-bold" style="color: #e8ecf4;">✅ Görev Merkezi</h1>
            <p class="text-xs mt-0.5" style="color: #7a8599;">
                <?= $data['gorevler']['toplam'] ?> görev · <?= date('d F Y') ?>
            </p>
        </div>
        <div class="flex items-center gap-2">
            <!-- Swipe Mode Toggle (mobil) -->
            <button @click="swipeMode = !swipeMode"
                    class="lg:hidden text-xs px-3 py-2 rounded-xl transition-colors"
                    :style="swipeMode ? 'background:rgba(0,212,255,0.15);color:#00d4ff;border:1px solid rgba(0,212,255,0.3);' : 'background:rgba(255,255,255,0.04);color:#7a8599;border:1px solid rgba(255,255,255,0.06);'">
                👆 Swipe
            </button>
            <button @click="modalAcik = true"
                    class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
                    style="background: rgba(0,212,255,0.15); color: #00d4ff; border: 1px solid rgba(0,212,255,0.3);">
                + Yeni Görev
            </button>
        </div>
    </div>

    <!-- Filtreler -->
    <form method="GET" class="flex flex-wrap gap-3">
        <input type="date" name="tarih" value="<?= e(getVal('tarih') ?: date('Y-m-d')) ?>"
               onchange="this.form.submit()"
               class="px-3 py-2 rounded-xl text-sm border outline-none"
               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
        <select name="tip" onchange="this.form.submit()"
                class="px-3 py-2 rounded-xl text-sm border outline-none"
                style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
            <option value="">Tüm Tipler</option>
            <?php foreach (['arama'=>'📞 Arama','gosterim'=>'🏠 Gösterim','takip'=>'🔄 Takip','portfoy'=>'📋 Portföy','diger'=>'📌 Diğer'] as $v=>$l): ?>
            <option value="<?= $v ?>" <?= getVal('tip') === $v ? 'selected' : '' ?>><?= $l ?></option>
            <?php endforeach; ?>
        </select>
        <select name="oncelik" onchange="this.form.submit()"
                class="px-3 py-2 rounded-xl text-sm border outline-none"
                style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
            <option value="">Tüm Öncelikler</option>
            <option value="yuksek" <?= getVal('oncelik') === 'yuksek' ? 'selected' : '' ?>>🔴 Yüksek</option>
            <option value="orta" <?= getVal('oncelik') === 'orta' ? 'selected' : '' ?>>🟡 Orta</option>
            <option value="dusuk" <?= getVal('oncelik') === 'dusuk' ? 'selected' : '' ?>>🟢 Düşük</option>
        </select>
        <?php if (Auth::isBrokerOrAdmin() && !empty($danismanlar)): ?>
        <select name="danisman_id" onchange="this.form.submit()"
                class="px-3 py-2 rounded-xl text-sm border outline-none"
                style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
            <option value="">Tüm Danışmanlar</option>
            <?php foreach ($danismanlar as $d): ?>
            <option value="<?= $d['id'] ?>" <?= getVal('danisman_id') == $d['id'] ? 'selected' : '' ?>><?= e($d['ad_soyad']) ?></option>
            <?php endforeach; ?>
        </select>
        <?php endif; ?>
        <a href="?" class="px-3 py-2 rounded-xl text-xs" style="background:rgba(255,255,255,0.04);color:#7a8599;border:1px solid rgba(255,255,255,0.06);">Temizle</a>
    </form>

    <!-- Görev Listesi -->
    <div class="space-y-3" id="gorev-listesi">
        <?php foreach ($data['gorevler']['data'] as $gorev):
            include APP_DIR . '/views/components/gorev-card.php';
        endforeach; ?>
        <?php if (empty($data['gorevler']['data'])): ?>
        <div class="py-12 text-center text-sm rounded-2xl" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06); color: #7a8599;">
            🎉 Bu tarihe ait görev yok!
        </div>
        <?php endif; ?>
    </div>

    <!-- Sayfalama -->
    <?= pagination($data['gorevler']['toplam'], max(1,(int)(getVal('sayfa')?: 1)), PER_PAGE, '?'. http_build_query(array_filter(array_diff_key($_GET,['sayfa'=>''])))) ?>

    <!-- Yeni Görev Modal -->
    <div x-show="modalAcik" x-transition @click.away="modalAcik=false"
         class="fixed inset-0 z-50 flex items-center justify-center p-4"
         style="background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);">
        <div class="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl max-h-screen overflow-y-auto"
             style="background: #0c1129; border: 1px solid rgba(255,255,255,0.08);">
            <div class="flex items-center justify-between px-6 py-4 border-b" style="border-color: rgba(255,255,255,0.06);">
                <span class="font-semibold text-sm" style="color: #e8ecf4;">➕ Yeni Görev</span>
                <button @click="modalAcik=false" style="color:#7a8599;">✕</button>
            </div>
            <form method="POST" class="p-6 space-y-4">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="ekle">

                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="block text-xs mb-1" style="color:#7a8599;">Başlık *</label>
                        <input type="text" name="baslik" required class="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1" style="color:#7a8599;">Tip</label>
                        <select name="tip" class="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                                style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                            <option value="arama">📞 Arama</option><option value="gosterim">🏠 Gösterim</option>
                            <option value="takip">🔄 Takip</option><option value="portfoy">📋 Portföy</option><option value="diger">📌 Diğer</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs mb-1" style="color:#7a8599;">Öncelik</label>
                        <select name="oncelik" class="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                                style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                            <option value="yuksek">🔴 Yüksek</option><option value="orta" selected>🟡 Orta</option><option value="dusuk">🟢 Düşük</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs mb-1" style="color:#7a8599;">Tarih *</label>
                        <input type="date" name="tarih" required value="<?= date('Y-m-d') ?>"
                               class="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <div>
                        <label class="block text-xs mb-1" style="color:#7a8599;">Saat</label>
                        <input type="time" name="saat"
                               class="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                    </div>
                    <?php if (!empty($musteriler)): ?>
                    <div class="col-span-2">
                        <label class="block text-xs mb-1" style="color:#7a8599;">Müşteri</label>
                        <select name="hedef_musteri_id" class="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                                style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
                            <option value="">Seç</option>
                            <?php foreach ($musteriler as $m): ?>
                            <option value="<?= $m['id'] ?>"><?= e($m['ad_soyad']) ?> — <?= e($m['telefon']) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <?php endif; ?>
                    <div class="col-span-2">
                        <label class="block text-xs mb-1" style="color:#7a8599;">Açıklama</label>
                        <textarea name="aciklama" rows="2" class="w-full px-3 py-2 rounded-xl text-sm border outline-none resize-none"
                                  style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;"></textarea>
                    </div>
                    <div class="col-span-2 flex items-center gap-2">
                        <input type="checkbox" name="ai_senaryo_olustur" id="ai_cb" value="1" class="rounded">
                        <label for="ai_cb" class="text-xs" style="color:#8b5cf6;">🤖 AI konuşma senaryosu oluştur</label>
                    </div>
                </div>

                <button type="submit" class="w-full py-2.5 rounded-xl text-sm font-medium"
                        style="background:rgba(0,212,255,0.15);color:#00d4ff;border:1px solid rgba(0,212,255,0.3);">
                    Görev Oluştur
                </button>
            </form>
        </div>
    </div>

    <!-- AI Senaryo Modal -->
    <div x-show="aiModal" x-transition @click.away="aiModal=false"
         class="fixed inset-0 z-50 flex items-center justify-center p-4"
         style="background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);">
        <div class="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
             style="background: #0c1129; border: 1px solid rgba(255,255,255,0.08);">
            <div class="flex items-center justify-between px-6 py-4 border-b" style="border-color: rgba(255,255,255,0.06);">
                <span class="font-semibold text-sm" style="color: #8b5cf6;">🤖 AI Konuşma Senaryosu</span>
                <button @click="aiModal=false" style="color:#7a8599;">✕</button>
            </div>
            <div class="p-6">
                <pre class="text-sm whitespace-pre-wrap leading-relaxed" style="color:#e8ecf4;font-family:'Outfit',sans-serif;" x-text="aiSenaryo"></pre>
            </div>
        </div>
    </div>

</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
