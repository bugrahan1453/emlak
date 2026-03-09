<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$id   = (int)(getVal('id') ?: 0);
if (!$id) { flashMessage('error', 'İlan bulunamadı.'); redirect(APP_URL . '/ilanlar.php'); }

$ctrl = new IlanController();
$data = $ctrl->show($id);
if (!$data) { flashMessage('error', 'İlan bulunamadı.'); redirect(APP_URL . '/ilanlar.php'); }

$ilan = $data['ilan'];

// Silme işlemi
if ($_SERVER['REQUEST_METHOD'] === 'POST' && postVal('action') === 'sil') {
    if (verifyCsrf(postVal('csrf_token'))) {
        $ctrl->destroy($id);
    }
}

$pageTitle = $ilan['baslik'];
$extraJs   = 'ilan-detay.js';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6" x-data="{ aktifFoto: 0, modalAcik: false, silOnay: false, aiYukleniyor: false, aiSonuc: null }">

    <!-- Breadcrumb -->
    <div class="flex items-center gap-2 text-xs mb-4" style="color: #7a8599;">
        <a href="<?= APP_URL ?>/ilanlar.php" class="hover:text-cyan-400">İlanlar</a>
        <span>›</span>
        <span style="color: #e8ecf4;"><?= e(truncate($ilan['baslik'], 50)) ?></span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Sol: Fotoğraflar + Harita -->
        <div class="lg:col-span-2 space-y-4">

            <!-- Fotoğraf Galerisi -->
            <?php $fotograflar = is_array($ilan['fotograflar']) ? $ilan['fotograflar'] : []; ?>
            <?php if (!empty($fotograflar)): ?>
            <div class="rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <!-- Ana fotoğraf -->
                <div class="relative h-72 overflow-hidden cursor-pointer" @click="modalAcik = true">
                    <?php foreach ($fotograflar as $fi => $foto): ?>
                    <img src="<?= APP_URL ?>/uploads/fotograflar/<?= e(basename($foto)) ?>"
                         class="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                         :class="aktifFoto === <?= $fi ?> ? 'opacity-100' : 'opacity-0'"
                         loading="lazy">
                    <?php endforeach; ?>
                    <div class="absolute bottom-3 right-3 text-xs px-2 py-1 rounded-full"
                         style="background: rgba(0,0,0,0.6); color: white;">
                        <span x-text="aktifFoto + 1"></span>/<?= count($fotograflar) ?>
                    </div>
                    <div class="absolute inset-0 flex items-center justify-between px-3 opacity-0 hover:opacity-100 transition-opacity">
                        <button @click.stop="aktifFoto = aktifFoto > 0 ? aktifFoto-1 : <?= count($fotograflar)-1 ?>"
                                class="w-8 h-8 rounded-full flex items-center justify-center text-white"
                                style="background: rgba(0,0,0,0.5);">‹</button>
                        <button @click.stop="aktifFoto = aktifFoto < <?= count($fotograflar)-1 ?> ? aktifFoto+1 : 0"
                                class="w-8 h-8 rounded-full flex items-center justify-center text-white"
                                style="background: rgba(0,0,0,0.5);">›</button>
                    </div>
                </div>
                <!-- Thumbnail şeridi -->
                <div class="flex gap-2 p-3 overflow-x-auto">
                    <?php foreach ($fotograflar as $fi => $foto): ?>
                    <img src="<?= APP_URL ?>/uploads/fotograflar/<?= e(basename($foto)) ?>"
                         @click="aktifFoto = <?= $fi ?>"
                         :class="aktifFoto === <?= $fi ?> ? 'ring-2 ring-cyan-400 opacity-100' : 'opacity-50 hover:opacity-80'"
                         class="w-16 h-12 rounded-lg object-cover cursor-pointer flex-shrink-0 transition-all"
                         loading="lazy">
                    <?php endforeach; ?>
                </div>
            </div>
            <?php else: ?>
            <div class="h-48 rounded-2xl flex items-center justify-center text-6xl"
                 style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">🏠</div>
            <?php endif; ?>

            <!-- Harita -->
            <?php if ($ilan['lat'] && $ilan['lng']): ?>
            <div class="rounded-2xl overflow-hidden" style="border: 1px solid rgba(255,255,255,0.06);">
                <div id="harita" style="height: 250px;"></div>
            </div>
            <script>
            document.addEventListener('DOMContentLoaded', function() {
                var map = L.map('harita').setView([<?= (float)$ilan['lat'] ?>, <?= (float)$ilan['lng'] ?>], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
                L.marker([<?= (float)$ilan['lat'] ?>, <?= (float)$ilan['lng'] ?>])
                 .addTo(map)
                 .bindPopup('<?= e($ilan['baslik']) ?>');
            });
            </script>
            <?php endif; ?>

            <!-- Açıklama -->
            <?php if ($ilan['aciklama']): ?>
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h3 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">Açıklama</h3>
                <p class="text-sm leading-relaxed whitespace-pre-line" style="color: #7a8599;"><?= e($ilan['aciklama']) ?></p>
            </div>
            <?php endif; ?>

            <!-- Fiyat Geçmişi -->
            <?php $fiyatGecmisi = is_array($ilan['fiyat_gecmisi']) ? $ilan['fiyat_gecmisi'] : []; ?>
            <?php if (!empty($fiyatGecmisi)): ?>
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h3 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">📉 Fiyat Geçmişi</h3>
                <canvas id="fiyat-grafigi" height="80"></canvas>
                <script>
                document.addEventListener('DOMContentLoaded', function() {
                    var ctx = document.getElementById('fiyat-grafigi');
                    var gecmis = <?= json_encode($fiyatGecmisi, JSON_UNESCAPED_UNICODE) ?>;
                    gecmis.push({ fiyat: <?= (float)$ilan['fiyat'] ?>, tarih: '<?= date('Y-m-d H:i:s') ?>' });
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: gecmis.map(g => g.tarih.substring(0,10)),
                            datasets: [{ data: gecmis.map(g => g.fiyat), borderColor: '#00d4ff', fill: true, backgroundColor: 'rgba(0,212,255,0.05)', tension: 0.4, pointRadius: 3 }]
                        },
                        options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#7a8599' }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#7a8599', callback: v => (v/1000000).toFixed(1)+'M ₺' }, grid: { color: 'rgba(255,255,255,0.04)' } } } }
                    });
                });
                </script>
            </div>
            <?php endif; ?>
        </div>

        <!-- Sağ: Bilgiler + İşlemler -->
        <div class="space-y-4">
            <!-- Temel Bilgiler -->
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <?= ilanDurumBadge($ilan['durum']) ?>
                        <div class="mt-1 text-xs" style="color: #7a8599;">
                            <?= ($ilan['ilan_tipi'] === 'satilik') ? '🔵 Satılık' : '🟡 Kiralık' ?> · <?= e(ucfirst($ilan['emlak_tipi'])) ?>
                        </div>
                    </div>
                    <div class="text-xl font-bold font-mono text-right" style="color: #00d4ff;">
                        <?= formatFiyat((float)$ilan['fiyat']) ?>
                    </div>
                </div>

                <h2 class="text-base font-semibold mb-4" style="color: #e8ecf4;"><?= e($ilan['baslik']) ?></h2>

                <div class="space-y-2 text-sm">
                    <?php $bilgiler = [
                        ['📍', 'Konum', implode(' / ', array_filter([$ilan['sehir'], $ilan['ilce'], $ilan['mahalle']]))],
                        ['📐', 'Metrekare', ($ilan['metrekare'] ? $ilan['metrekare'] . ' m²' : null)],
                        ['🚪', 'Oda Sayısı', $ilan['oda_sayisi']],
                        ['🏢', 'Kat', $ilan['kat']],
                        ['🏗️', 'Bina Yaşı', ($ilan['bina_yasi'] ? $ilan['bina_yasi'] . ' yıl' : null)],
                        ['🔥', 'Isıtma', $ilan['isitma_tipi']],
                        ['🪑', 'Eşya Durumu', $ilan['esya_durumu']],
                        ['📅', 'Eklenme', formatTarih($ilan['created_at'], 'd.m.Y')],
                        ['👁️', 'Görüntülenme', $ilan['goruntulenme']],
                    ]; ?>
                    <?php foreach ($bilgiler as [$ikon, $etiket, $deger]): if (!$deger) continue; ?>
                    <div class="flex items-center justify-between py-1.5 border-b" style="border-color: rgba(255,255,255,0.04);">
                        <span style="color: #7a8599;"><?= $ikon ?> <?= $etiket ?></span>
                        <span style="color: #e8ecf4;"><?= e($deger) ?></span>
                    </div>
                    <?php endforeach; ?>
                </div>

                <!-- İlan Sahibi -->
                <?php if ($ilan['ilan_sahibi_ad'] || $ilan['ilan_sahibi_tel']): ?>
                <div class="mt-4 p-3 rounded-xl" style="background: rgba(255,255,255,0.03);">
                    <p class="text-xs font-semibold mb-1" style="color: #7a8599;">İlan Sahibi</p>
                    <?php if ($ilan['ilan_sahibi_ad']): ?><p class="text-sm" style="color: #e8ecf4;"><?= e($ilan['ilan_sahibi_ad']) ?></p><?php endif; ?>
                    <?php if ($ilan['ilan_sahibi_tel']): ?><p class="text-sm font-mono" style="color: #00d4ff;"><?= e($ilan['ilan_sahibi_tel']) ?></p><?php endif; ?>
                </div>
                <?php endif; ?>
            </div>

            <!-- AI Değerleme -->
            <?php $aiDeg = is_array($ilan['ai_degerleme']) ? $ilan['ai_degerleme'] : []; ?>
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-semibold" style="color: #e8ecf4;">🤖 AI Değerleme</h3>
                    <button @click="aiDegerle(<?= $id ?>)" :disabled="aiYukleniyor"
                            class="text-xs px-3 py-1 rounded-lg transition-colors"
                            style="background: rgba(139,92,246,0.15); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.3);">
                        <span x-show="!aiYukleniyor">Değerle</span>
                        <span x-show="aiYukleniyor">⏳ Hesaplanıyor...</span>
                    </button>
                </div>
                <div x-show="aiSonuc || <?= empty($aiDeg) ? 'false' : 'true' ?>">
                    <?php if (!empty($aiDeg)): ?>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span style="color: #7a8599;">Pazar Değeri</span>
                            <span class="font-mono font-semibold" style="color: #00ff88;"><?= formatFiyat((float)($aiDeg['pazar_degeri'] ?? 0)) ?></span>
                        </div>
                        <div class="flex justify-between">
                            <span style="color: #7a8599;">Pazarlık Skoru</span>
                            <span class="font-mono"><?= e($aiDeg['pazarlik_skoru'] ?? '-') ?>/100</span>
                        </div>
                        <div class="flex justify-between">
                            <span style="color: #7a8599;">Fırsat Seviyesi</span>
                            <span class="font-semibold"><?= e(strtoupper($aiDeg['firsat_seviyesi'] ?? '-')) ?></span>
                        </div>
                        <?php if (!empty($aiDeg['degerleme_notu'])): ?>
                        <p class="text-xs mt-2 pt-2 border-t" style="border-color: rgba(255,255,255,0.04); color: #7a8599;"><?= e($aiDeg['degerleme_notu']) ?></p>
                        <?php endif; ?>
                    </div>
                    <?php endif; ?>
                    <div x-html="aiSonuc"></div>
                </div>
                <p x-show="!aiSonuc && <?= empty($aiDeg) ? 'true' : 'false' ?>" class="text-xs" style="color: #7a8599;">
                    AI değerleme için "Değerle" butonuna tıklayın.
                </p>
            </div>

            <!-- İşlem Butonları -->
            <div class="grid grid-cols-2 gap-2">
                <a href="<?= APP_URL ?>/ilan-ekle.php?id=<?= $id ?>"
                   class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors"
                   style="background: rgba(0,212,255,0.08); color: #00d4ff; border: 1px solid rgba(0,212,255,0.2);">
                    ✏️ Düzenle
                </a>
                <button onclick="whatsappGonder(<?= $id ?>)"
                        class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors"
                        style="background: rgba(0,255,136,0.08); color: #00ff88; border: 1px solid rgba(0,255,136,0.2);">
                    💬 WhatsApp
                </button>
                <a href="<?= APP_URL ?>/api/raporlar.php?action=gerceklik_tokadi&id=<?= $id ?>" target="_blank"
                   class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors"
                   style="background: rgba(139,92,246,0.08); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.2);">
                    📄 Rapor
                </a>
                <button @click="silOnay = true"
                        class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors"
                        style="background: rgba(255,51,102,0.08); color: #ff3366; border: 1px solid rgba(255,51,102,0.2);">
                    🗑️ Sil
                </button>
            </div>

            <!-- Silme Onayı -->
            <div x-show="silOnay" class="rounded-xl p-4 text-sm" style="background: rgba(255,51,102,0.08); border: 1px solid rgba(255,51,102,0.2);">
                <p class="mb-3" style="color: #ff3366;">Bu ilanı silmek istediğinizden emin misiniz?</p>
                <form method="POST">
                    <?= csrfField() ?>
                    <input type="hidden" name="action" value="sil">
                    <div class="flex gap-2">
                        <button type="submit" class="flex-1 py-2 rounded-lg text-xs font-medium"
                                style="background: rgba(255,51,102,0.2); color: #ff3366;">Evet, Sil</button>
                        <button type="button" @click="silOnay = false" class="flex-1 py-2 rounded-lg text-xs"
                                style="background: rgba(255,255,255,0.04); color: #7a8599;">İptal</button>
                    </div>
                </form>
            </div>

            <!-- Notlar -->
            <?php if ($ilan['notlar']): ?>
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h3 class="text-sm font-semibold mb-2" style="color: #e8ecf4;">📝 Notlar</h3>
                <p class="text-sm whitespace-pre-line" style="color: #7a8599;"><?= e($ilan['notlar']) ?></p>
            </div>
            <?php endif; ?>
        </div>
    </div>
</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
