<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$ctrl = new EslestirmeController();
$data = $ctrl->index();

$pageTitle = 'Eşleştirmeler';
$extraJs   = 'eslestirmeler.js';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 space-y-4">

    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-xl font-bold" style="color: #e8ecf4;">🔗 Eşleştirmeler</h1>
            <p class="text-xs mt-0.5" style="color: #7a8599;">Toplam <?= $data['eslestirmeler']['toplam'] ?> eşleştirme</p>
        </div>
    </div>

    <!-- Filtreler -->
    <?php
    $filtreler = [
        ['type' => 'select', 'name' => 'durum', 'label' => 'Durum', 'options' => ['bekliyor'=>'Bekliyor','bildirildi'=>'Bildirildi','ilgilendi'=>'İlgilendi','reddetti'=>'Reddetti','gorustu'=>'Görüştü']],
    ];
    include APP_DIR . '/views/components/filtre-bar.php';
    ?>

    <!-- Eşleştirme Kartları -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <?php foreach ($data['eslestirmeler']['data'] as $es):
            $skorRenk = $es['skor'] >= 80 ? '#00ff88' : ($es['skor'] >= 60 ? '#ffaa00' : '#ff3366');
            $foto = null;
            if (!empty($es['fotograflar'])) { $f = json_decode($es['fotograflar'],true); $foto = $f[0] ?? null; }
            $durumRenk = match($es['durum']) {
                'bekliyor'  => 'rgba(255,170,0,0.15)|#ffaa00',
                'bildirildi'=> 'rgba(0,212,255,0.15)|#00d4ff',
                'ilgilendi' => 'rgba(0,255,136,0.15)|#00ff88',
                'reddetti'  => 'rgba(255,51,102,0.15)|#ff3366',
                'gorustu'   => 'rgba(139,92,246,0.15)|#8b5cf6',
                default     => 'rgba(255,255,255,0.05)|#7a8599',
            };
            [$drBg, $drText] = explode('|', $durumRenk);
        ?>
        <div class="rounded-2xl overflow-hidden"
             style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">

            <!-- İlan Thumbnail -->
            <div class="relative h-32 overflow-hidden" style="background: rgba(255,255,255,0.03);">
                <?php if ($foto): ?>
                <img src="<?= APP_URL ?>/uploads/fotograflar/<?= e(basename($foto)) ?>" class="w-full h-full object-cover" loading="lazy">
                <?php else: ?>
                <div class="w-full h-full flex items-center justify-center text-4xl opacity-20">🏠</div>
                <?php endif; ?>
                <!-- Skor badge -->
                <div class="absolute top-2 right-2 text-sm font-bold px-3 py-1 rounded-full"
                     style="background: <?= $skorRenk ?>22; color: <?= $skorRenk ?>; border: 1px solid <?= $skorRenk ?>44;">
                    %<?= (int)$es['skor'] ?> Uyum
                </div>
            </div>

            <div class="p-4">
                <!-- İlan -->
                <a href="<?= APP_URL ?>/ilan-detay.php?id=<?= (int)$es['ilan_id'] ?>"
                   class="text-sm font-medium hover:text-cyan-400 line-clamp-2 mb-2 block" style="color:#e8ecf4;">
                    <?= e($es['ilan_baslik']) ?>
                </a>
                <div class="text-sm font-mono font-semibold mb-3" style="color:#00d4ff;"><?= formatFiyat((float)$es['ilan_fiyat']) ?></div>

                <!-- Müşteri -->
                <div class="flex items-center gap-2 mb-3 p-2 rounded-xl" style="background: rgba(255,255,255,0.03);">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                         style="background: rgba(0,212,255,0.15); color: #00d4ff;">
                        <?= mb_strtoupper(mb_substr($es['musteri_ad'], 0, 2)) ?>
                    </div>
                    <div>
                        <p class="text-xs font-medium" style="color:#e8ecf4;"><?= e($es['musteri_ad']) ?></p>
                        <p class="text-xs" style="color:#7a8599;"><?= e($es['musteri_tel']) ?></p>
                    </div>
                </div>

                <!-- Durum -->
                <div class="flex items-center justify-between mb-3">
                    <span class="text-xs px-2 py-1 rounded-full" style="background: <?= $drBg ?>; color: <?= $drText ?>;">
                        <?= ucfirst($es['durum']) ?>
                    </span>
                    <span class="text-xs" style="color:#7a8599;"><?= zamanFarki($es['created_at']) ?></span>
                </div>

                <!-- İşlem Butonları -->
                <div class="grid grid-cols-3 gap-1.5">
                    <button onclick="eslestirmeDurumGuncelle(<?= $es['id'] ?>, 'ilgilendi')"
                            class="py-1.5 text-xs rounded-lg transition-colors"
                            style="background:rgba(0,255,136,0.08);color:#00ff88;border:1px solid rgba(0,255,136,0.2);">
                        ✓ İlgilendi
                    </button>
                    <button onclick="eslestirmeWhatsapp(<?= $es['id'] ?>)"
                            class="py-1.5 text-xs rounded-lg transition-colors"
                            style="background:rgba(0,212,255,0.08);color:#00d4ff;border:1px solid rgba(0,212,255,0.2);">
                        💬 WA
                    </button>
                    <button onclick="eslestirmeDurumGuncelle(<?= $es['id'] ?>, 'reddetti')"
                            class="py-1.5 text-xs rounded-lg transition-colors"
                            style="background:rgba(255,51,102,0.08);color:#ff3366;border:1px solid rgba(255,51,102,0.2);">
                        ✗ Reddetti
                    </button>
                </div>
            </div>
        </div>
        <?php endforeach; ?>
        <?php if (empty($data['eslestirmeler']['data'])): ?>
        <div class="col-span-full py-12 text-center text-sm rounded-2xl"
             style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06); color: #7a8599;">
            Eşleştirme bulunamadı.
        </div>
        <?php endif; ?>
    </div>

    <!-- Sayfalama -->
    <?= pagination($data['eslestirmeler']['toplam'], max(1,(int)(getVal('sayfa')?: 1))) ?>

</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
