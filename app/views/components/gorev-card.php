<?php
/**
 * Görev Kartı Bileşeni
 * Değişkenler: $gorev (array)
 */
$oncelikRenk = match($gorev['oncelik'] ?? 'orta') {
    'yuksek' => '#ff3366',
    'dusuk'  => '#00ff88',
    default  => '#ffaa00',
};
$tipIkon = match($gorev['tip'] ?? 'diger') {
    'arama'   => '📞',
    'gosterim'=> '🏠',
    'takip'   => '🔄',
    'portfoy' => '📋',
    default   => '✅',
};
?>
<div class="rounded-xl p-4 transition-all duration-200 <?= ($gorev['tamamlandi'] ?? 0) ? 'opacity-60' : '' ?>"
     style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06); border-left: 3px solid <?= $oncelikRenk ?>;">

    <div class="flex items-start gap-3">
        <!-- Checkbox -->
        <button onclick="toggleGorev(<?= (int)($gorev['id'] ?? 0) ?>, this)"
                class="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                style="background: <?= ($gorev['tamamlandi'] ?? 0) ? $oncelikRenk . '33' : 'rgba(255,255,255,0.05)' ?>; border: 2px solid <?= ($gorev['tamamlandi'] ?? 0) ? $oncelikRenk : 'rgba(255,255,255,0.15)' ?>;">
            <?php if ($gorev['tamamlandi'] ?? 0): ?>
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" style="color: <?= $oncelikRenk ?>">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            <?php endif; ?>
        </button>

        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
                <span class="text-sm"><?= $tipIkon ?></span>
                <span class="text-sm font-medium <?= ($gorev['tamamlandi'] ?? 0) ? 'line-through' : '' ?>"
                      style="color: <?= ($gorev['tamamlandi'] ?? 0) ? '#7a8599' : '#e8ecf4' ?>;">
                    <?= e($gorev['baslik'] ?? '') ?>
                </span>
            </div>

            <div class="flex flex-wrap gap-3 text-xs" style="color: #7a8599;">
                <?php if ($gorev['musteri_ad'] ?? null): ?>
                <span>👤 <?= e($gorev['musteri_ad']) ?></span>
                <?php endif; ?>
                <?php if ($gorev['saat'] ?? null): ?>
                <span>🕒 <?= e(substr($gorev['saat'] ?? '', 0, 5)) ?></span>
                <?php endif; ?>
                <?php if ($gorev['danisman_ad'] ?? null): ?>
                <span>💼 <?= e($gorev['danisman_ad']) ?></span>
                <?php endif; ?>
            </div>
        </div>

        <!-- AI Senaryo Butonu -->
        <?php if ($gorev['ai_senaryo'] ?? null): ?>
        <button onclick="showAiSenaryo(<?= (int)($gorev['id'] ?? 0) ?>)"
                class="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                style="background: rgba(139,92,246,0.15); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.3);">
            🤖 Senaryo
        </button>
        <?php endif; ?>
    </div>

    <!-- Hızlı Tamamlama -->
    <?php if (!($gorev['tamamlandi'] ?? 0)): ?>
    <div class="flex gap-2 mt-3 pt-3 border-t" style="border-color: rgba(255,255,255,0.04);" id="gorev-actions-<?= (int)($gorev['id'] ?? 0) ?>">
        <button onclick="sonucKaydet(<?= (int)($gorev['id'] ?? 0) ?>, 'basarili')"
                class="flex-1 text-xs py-1 rounded-lg transition-colors"
                style="background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid rgba(0,255,136,0.2);">
            ✅ Başarılı
        </button>
        <button onclick="sonucKaydet(<?= (int)($gorev['id'] ?? 0) ?>, 'basarisiz')"
                class="flex-1 text-xs py-1 rounded-lg transition-colors"
                style="background: rgba(255,51,102,0.1); color: #ff3366; border: 1px solid rgba(255,51,102,0.2);">
            ✗ Başarısız
        </button>
        <button onclick="sonucKaydet(<?= (int)($gorev['id'] ?? 0) ?>, 'ertelendi')"
                class="flex-1 text-xs py-1 rounded-lg transition-colors"
                style="background: rgba(255,170,0,0.1); color: #ffaa00; border: 1px solid rgba(255,170,0,0.2);">
            ↻ Ertele
        </button>
        <button onclick="sonucKaydet(<?= (int)($gorev['id'] ?? 0) ?>, 'ulasılamadı')"
                class="text-xs py-1 px-2 rounded-lg transition-colors"
                style="background: rgba(255,255,255,0.04); color: #7a8599; border: 1px solid rgba(255,255,255,0.06);">
            📵
        </button>
    </div>
    <?php endif; ?>
</div>
