<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$ctrl = new PerformansController();
$data = $ctrl->index();

$pageTitle = 'Performans';
$extraJs   = 'performans.js';
require_once APP_DIR . '/views/layout/header.php';

$trendLabels = array_column($data['trend'], 'tarih');
$trendData   = array_column($data['trend'], 'efor_skoru');
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 space-y-6">

    <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
            <h1 class="text-xl font-bold" style="color: #e8ecf4;">📈 Performans</h1>
            <p class="text-xs mt-0.5" style="color: #7a8599;">Efor Skoru = Arama×1 + Randevu×3 + Gösterim×2 + Portföy×5</p>
        </div>
        <!-- Dönem seçici -->
        <div class="flex rounded-xl overflow-hidden border" style="border-color: rgba(255,255,255,0.08);">
            <?php foreach (['gun'=>'Bugün','hafta'=>'Hafta','ay'=>'Ay'] as $k=>$l): ?>
            <a href="?donem=<?= $k ?>" class="px-4 py-2 text-xs transition-colors"
               style="<?= $data['donem'] === $k ? 'background:rgba(0,212,255,0.15);color:#00d4ff;' : 'background:rgba(255,255,255,0.03);color:#7a8599;' ?>">
                <?= $l ?>
            </a>
            <?php endforeach; ?>
        </div>
    </div>

    <!-- Skor Tablosu -->
    <div class="rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06); border-top: 2px solid #00d4ff;">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style="color:#7a8599;">#</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style="color:#7a8599;">Danışman</th>
                        <th class="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider" style="color:#7a8599;">📞 Arama</th>
                        <th class="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider" style="color:#7a8599;">📅 Randevu</th>
                        <th class="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider" style="color:#7a8599;">🏠 Gösterim</th>
                        <th class="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider" style="color:#7a8599;">📋 Portföy</th>
                        <th class="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider" style="color:#7a8599;">🔗 Eşleştirme</th>
                        <th class="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider" style="color:#7a8599;">⚡ Efor</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($data['danismanlar'] as $i => $d):
                        $madalya = ['🥇','🥈','🥉'][$i] ?? ($i + 1);
                        $initials = '';
                        $parts = explode(' ', trim($d['ad_soyad'] ?? ''));
                        foreach (array_slice($parts, 0, 2) as $p) $initials .= mb_strtoupper(mb_substr($p, 0, 1));
                    ?>
                    <tr class="border-b hover:bg-white/2 transition-colors" style="border-color: rgba(255,255,255,0.04);">
                        <td class="px-4 py-3 text-lg"><?= $madalya ?></td>
                        <td class="px-4 py-3">
                            <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                     style="background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(139,92,246,0.2)); color: #00d4ff;">
                                    <?= e($initials) ?>
                                </div>
                                <span style="color:#e8ecf4;"><?= e($d['ad_soyad']) ?></span>
                            </div>
                        </td>
                        <td class="px-4 py-3 text-center font-mono" style="color:#e8ecf4;"><?= (int)$d['arama_sayisi'] ?></td>
                        <td class="px-4 py-3 text-center font-mono" style="color:#e8ecf4;"><?= (int)$d['randevu_sayisi'] ?></td>
                        <td class="px-4 py-3 text-center font-mono" style="color:#e8ecf4;"><?= (int)$d['gosterim_sayisi'] ?></td>
                        <td class="px-4 py-3 text-center font-mono" style="color:#e8ecf4;"><?= (int)$d['portfoy_ekleme'] ?></td>
                        <td class="px-4 py-3 text-center font-mono" style="color:#e8ecf4;"><?= (int)$d['eslestirme_sayisi'] ?></td>
                        <td class="px-4 py-3 text-center">
                            <span class="text-lg font-bold font-mono" style="color:#00d4ff;"><?= number_format((float)$d['efor_skoru'], 0) ?></span>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    <?php if (empty($data['danismanlar'])): ?>
                    <tr><td colspan="8" class="px-4 py-12 text-center text-sm" style="color:#7a8599;">Veri yok.</td></tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Trend Grafiği -->
    <?php if (!empty($trendData)): ?>
    <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
        <h2 class="text-sm font-semibold mb-4" style="color: #e8ecf4;">📊 Efor Skoru Trendi (Son 30 Gün)</h2>
        <canvas id="trend-grafigi" height="60"></canvas>
        <script>
        document.addEventListener('DOMContentLoaded', function() {
            new Chart(document.getElementById('trend-grafigi'), {
                type: 'line',
                data: {
                    labels: <?= json_encode($trendLabels) ?>,
                    datasets: [{
                        label: 'Efor Skoru',
                        data: <?= json_encode($trendData) ?>,
                        borderColor: '#00d4ff',
                        backgroundColor: 'rgba(0,212,255,0.05)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                    }]
                },
                options: {
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: '#7a8599' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                        y: { ticks: { color: '#7a8599' }, grid: { color: 'rgba(255,255,255,0.04)' } }
                    }
                }
            });
        });
        </script>
    </div>
    <?php endif; ?>

    <!-- Rapor Butonları -->
    <?php if (Auth::isBrokerOrAdmin()): ?>
    <div class="flex gap-3">
        <a href="<?= APP_URL ?>/api/raporlar.php?action=performans_raporu&donem=<?= e($data['donem']) ?>" target="_blank"
           class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
           style="background: rgba(139,92,246,0.15); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.3);">
            📄 Performans Raporu İndir
        </a>
    </div>
    <?php endif; ?>

</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
