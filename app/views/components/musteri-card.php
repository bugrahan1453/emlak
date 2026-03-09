<?php
/**
 * Müşteri Kartı Bileşeni
 * Değişkenler: $musteri (array)
 */
$tipRenkler = [
    'alici'    => ['bg' => 'rgba(0,212,255,0.15)', 'text' => '#00d4ff', 'label' => 'Alıcı'],
    'satici'   => ['bg' => 'rgba(0,255,136,0.15)', 'text' => '#00ff88', 'label' => 'Satıcı'],
    'yatirmci' => ['bg' => 'rgba(139,92,246,0.15)','text' => '#8b5cf6', 'label' => 'Yatırımcı'],
    'kiralayan'=> ['bg' => 'rgba(255,170,0,0.15)', 'text' => '#ffaa00', 'label' => 'Kiralayan'],
];
$tc = $tipRenkler[$musteri['tip'] ?? 'alici'] ?? $tipRenkler['alici'];

$initials = '';
$parts = explode(' ', trim($musteri['ad_soyad'] ?? ''));
foreach (array_slice($parts, 0, 2) as $p) $initials .= mb_strtoupper(mb_substr($p, 0, 1));
?>
<div class="rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5"
     style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06); backdrop-filter: blur(20px);">

    <div class="flex items-center gap-3 mb-3">
        <!-- Avatar -->
        <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
             style="background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(139,92,246,0.2)); color: #00d4ff;">
            <?= e($initials) ?>
        </div>

        <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold truncate" style="color: #e8ecf4;"><?= e($musteri['ad_soyad'] ?? '') ?></h3>
            <span class="text-xs px-2 py-0.5 rounded-full"
                  style="background: <?= $tc['bg'] ?>; color: <?= $tc['text'] ?>;">
                <?= $tc['label'] ?>
            </span>
        </div>

        <?php if (($musteri['puan'] ?? 0) > 0): ?>
        <div class="text-xs font-bold" style="color: #ffaa00;">⭐ <?= e($musteri['puan']) ?></div>
        <?php endif; ?>
    </div>

    <!-- Bilgiler -->
    <div class="space-y-1.5 text-xs" style="color: #7a8599;">
        <div class="flex items-center gap-2">
            <span>📞</span>
            <span><?= e($musteri['telefon'] ?? '') ?></span>
        </div>
        <?php if ($musteri['butce_max'] ?? 0): ?>
        <div class="flex items-center gap-2">
            <span>💰</span>
            <span class="font-mono" style="color: #00d4ff;">
                <?php if ($musteri['butce_min'] ?? 0): ?>
                <?= number_format($musteri['butce_min'], 0, ',', '.') ?> - <?= number_format($musteri['butce_max'], 0, ',', '.') ?> ₺
                <?php else: ?>
                Max <?= number_format($musteri['butce_max'], 0, ',', '.') ?> ₺
                <?php endif; ?>
            </span>
        </div>
        <?php endif; ?>
        <?php if ($musteri['son_iletisim'] ?? null): ?>
        <div class="flex items-center gap-2">
            <span>🕒</span>
            <span>Son iletişim: <?= zamanFarki($musteri['son_iletisim']) ?></span>
        </div>
        <?php endif; ?>
    </div>

    <!-- İşlem butonları -->
    <div class="flex gap-2 mt-3 pt-3 border-t" style="border-color: rgba(255,255,255,0.06);">
        <a href="<?= APP_URL ?>/musteri-detay.php?id=<?= (int)($musteri['id'] ?? 0) ?>"
           class="flex-1 text-center text-xs py-1.5 rounded-lg transition-colors"
           style="background: rgba(0,212,255,0.08); color: #00d4ff; border: 1px solid rgba(0,212,255,0.2);">
            Detay
        </a>
        <a href="<?= APP_URL ?>/musteri-ekle.php?id=<?= (int)($musteri['id'] ?? 0) ?>"
           class="flex-1 text-center text-xs py-1.5 rounded-lg transition-colors"
           style="background: rgba(255,255,255,0.04); color: #7a8599; border: 1px solid rgba(255,255,255,0.06);">
            Düzenle
        </a>
    </div>
</div>
