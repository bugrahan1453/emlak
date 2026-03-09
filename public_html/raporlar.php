<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$ctrl = new RaporController();
$data = $ctrl->index();

$pageTitle = 'Rapor Üretici';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 space-y-6">

    <h1 class="text-xl font-bold" style="color: #e8ecf4;">📄 Rapor Üretici</h1>

    <!-- Rapor Türleri -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <?php foreach ([
            ['tip'=>'gerceklik_tokadi','ikon'=>'📊','baslik'=>'Gerçeklik Tokadı','aciklama'=>'İlan fiyatını emsal verileriyle karşılaştır','renk'=>'cyan'],
            ['tip'=>'roi','ikon'=>'💹','baslik'=>'ROI Analizi','aciklama'=>'Yatırım getiri analizi raporu','renk'=>'green'],
            ['tip'=>'portfoy','ikon'=>'🏠','baslik'=>'Portföy Raporu','aciklama'=>'Tüm aktif ilanların özeti','renk'=>'purple'],
            ['tip'=>'performans','ikon'=>'📈','baslik'=>'Performans Raporu','aciklama'=>'Danışman performans analizi','renk'=>'amber'],
        ] as $rapor):
            $renkler = ['cyan'=>'rgba(0,212,255', 'green'=>'rgba(0,255,136', 'purple'=>'rgba(139,92,246', 'amber'=>'rgba(255,170,0'];
            $r = $renkler[$rapor['renk']] ?? 'rgba(0,212,255';
        ?>
        <div class="rounded-2xl p-5 cursor-pointer transition-all hover:-translate-y-0.5"
             style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06); border-top: 2px solid <?= $r ?>, 0.8);">
            <div class="text-3xl mb-3"><?= $rapor['ikon'] ?></div>
            <h3 class="font-semibold text-sm mb-1" style="color: #e8ecf4;"><?= $rapor['baslik'] ?></h3>
            <p class="text-xs mb-4" style="color: #7a8599;"><?= $rapor['aciklama'] ?></p>
            <?php if ($rapor['tip'] === 'performans'): ?>
            <a href="<?= APP_URL ?>/api/raporlar.php?action=performans_raporu" target="_blank"
               class="block text-center text-xs py-2 rounded-xl transition-colors"
               style="background: <?= $r ?>, 0.15); color: <?= $r ?>, 1); border: 1px solid <?= $r ?>, 0.3);">
                Rapor Oluştur
            </a>
            <?php elseif ($rapor['tip'] === 'gerceklik_tokadi'): ?>
            <div x-data="{ ilanId: '' }">
                <input type="number" x-model="ilanId" placeholder="İlan ID girin..."
                       class="w-full px-3 py-2 rounded-xl text-xs border outline-none mb-2"
                       style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4;">
                <button @click="ilanId && window.open('<?= APP_URL ?>/api/raporlar.php?action=gerceklik_tokadi&id=' + ilanId, '_blank')"
                        class="w-full text-xs py-2 rounded-xl transition-colors"
                        style="background: <?= $r ?>, 0.15); color: <?= $r ?>, 1); border: 1px solid <?= $r ?>, 0.3);">
                    Rapor Oluştur
                </button>
            </div>
            <?php else: ?>
            <button class="w-full text-xs py-2 rounded-xl transition-colors"
                    style="background: <?= $r ?>, 0.08); color: #7a8599; border: 1px solid rgba(255,255,255,0.06);">
                Yakında
            </button>
            <?php endif; ?>
        </div>
        <?php endforeach; ?>
    </div>

    <!-- Geçmiş Raporlar -->
    <div class="rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
        <div class="px-4 py-3 border-b" style="border-color: rgba(255,255,255,0.06);">
            <span class="text-sm font-semibold" style="color: #e8ecf4;">📋 Geçmiş Raporlar</span>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style="color:#7a8599;">Tip</th>
                        <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">Oluşturan</th>
                        <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">İlan/Müşteri</th>
                        <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">Tarih</th>
                        <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">İşlem</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($data['raporlar'] as $r): ?>
                    <tr class="border-b hover:bg-white/2 transition-colors" style="border-color: rgba(255,255,255,0.04);">
                        <td class="px-4 py-3" style="color:#e8ecf4;"><?= e(str_replace('_', ' ', ucfirst($r['tip']))) ?></td>
                        <td class="px-4 py-3" style="color:#7a8599;"><?= e($r['olusturan_ad']) ?></td>
                        <td class="px-4 py-3 text-xs" style="color:#7a8599;"><?= e($r['ilan_baslik'] ?? $r['musteri_ad'] ?? '-') ?></td>
                        <td class="px-4 py-3" style="color:#7a8599;"><?= zamanFarki($r['created_at']) ?></td>
                        <td class="px-4 py-3">
                            <?php if ($r['dosya_yolu']): ?>
                            <a href="<?= APP_URL ?>/uploads/raporlar/<?= e($r['dosya_yolu']) ?>" target="_blank"
                               class="text-xs px-2 py-1 rounded-lg"
                               style="background: rgba(0,212,255,0.1); color: #00d4ff;">İndir</a>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    <?php if (empty($data['raporlar'])): ?>
                    <tr><td colspan="5" class="px-4 py-12 text-center text-sm" style="color:#7a8599;">Rapor oluşturulmamış.</td></tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
