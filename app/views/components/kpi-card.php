<?php
/**
 * KPI Kartı Bileşeni
 * Kullanım: require ve değişkenleri set et:
 * $kpiTitle, $kpiValue, $kpiSub, $kpiIcon, $kpiColor ('cyan'|'green'|'red'|'amber'|'purple')
 * $kpiSparkline (opsiyonel, array of numbers for bar chart)
 */
$kpiColors = [
    'cyan'   => ['top' => '#00d4ff', 'bg' => 'rgba(0,212,255,0.08)',   'text' => '#00d4ff'],
    'green'  => ['top' => '#00ff88', 'bg' => 'rgba(0,255,136,0.08)',   'text' => '#00ff88'],
    'red'    => ['top' => '#ff3366', 'bg' => 'rgba(255,51,102,0.08)',  'text' => '#ff3366'],
    'amber'  => ['top' => '#ffaa00', 'bg' => 'rgba(255,170,0,0.08)',   'text' => '#ffaa00'],
    'purple' => ['top' => '#8b5cf6', 'bg' => 'rgba(139,92,246,0.08)', 'text' => '#8b5cf6'],
];
$c = $kpiColors[$kpiColor ?? 'cyan'];
$sparkData = $kpiSparkline ?? [];
$maxSpark  = count($sparkData) ? max(array_filter($sparkData, 'is_numeric')) ?: 1 : 1;
?>
<div class="rounded-2xl p-5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
     style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06); border-top: 2px solid <?= $c['top'] ?>; backdrop-filter: blur(20px);">

    <div class="flex items-start justify-between mb-3">
        <div class="flex-1">
            <p class="text-xs font-medium uppercase tracking-wider mb-1" style="color: #7a8599;"><?= e($kpiTitle ?? '') ?></p>
            <p class="text-2xl font-bold font-mono" style="color: #e8ecf4;"><?= e($kpiValue ?? '0') ?></p>
            <?php if (!empty($kpiSub)): ?>
            <p class="text-xs mt-1" style="color: #7a8599;"><?= e($kpiSub) ?></p>
            <?php endif; ?>
        </div>
        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
             style="background: <?= $c['bg'] ?>;">
            <?= $kpiIcon ?? '📊' ?>
        </div>
    </div>

    <?php if (!empty($sparkData)): ?>
    <!-- Sparkline mini bar chart -->
    <div class="flex items-end gap-0.5 h-8 mt-2">
        <?php foreach ($sparkData as $v): ?>
        <?php $h = $maxSpark > 0 ? max(4, round(($v / $maxSpark) * 100)) : 4; ?>
        <div class="flex-1 rounded-sm transition-all"
             style="height: <?= $h ?>%; background: <?= $c['top'] ?>; opacity: 0.6;"></div>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>
</div>
