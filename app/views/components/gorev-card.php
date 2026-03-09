<?php
/**
 * Görev Kartı Bileşeni (Gelişmiş)
 * Değişkenler: $gorev (array)
 * AI senaryo modal + sesli not butonu dahil
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
    'randevu' => '📅',
    default   => '✅',
};
$gorevId = (int)($gorev['id'] ?? 0);
$tamamlandi = $gorev['tamamlandi'] ?? ($gorev['durum'] === 'tamamlandi' ? 1 : 0);
?>
<div id="gorev-<?= $gorevId ?>"
     class="gorev-card rounded-xl p-4 transition-all duration-200 <?= $tamamlandi ? 'tamamlandi' : '' ?>"
     data-id="<?= $gorevId ?>"
     data-tip="<?= e($gorev['tip'] ?? '') ?>"
     style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06); border-left: 3px solid <?= $oncelikRenk ?>;">

    <div class="flex items-start gap-3">
        <!-- Checkbox -->
        <button onclick="toggleGorev(<?= $gorevId ?>, this)"
                class="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                style="background: <?= $tamamlandi ? $oncelikRenk . '33' : 'rgba(255,255,255,0.05)' ?>; border: 2px solid <?= $tamamlandi ? $oncelikRenk : 'rgba(255,255,255,0.15)' ?>;">
            <?php if ($tamamlandi): ?>
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" style="color: <?= $oncelikRenk ?>">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            <?php endif; ?>
        </button>

        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
                <span class="text-sm"><?= $tipIkon ?></span>
                <span class="text-sm font-medium gorev-baslik <?= $tamamlandi ? 'line-through' : '' ?>"
                      style="color: <?= $tamamlandi ? '#7a8599' : '#e8ecf4' ?>;">
                    <?= e($gorev['baslik'] ?? '') ?>
                </span>
                <?php if (($gorev['sicaklik_skoru'] ?? 0) > 0): ?>
                <span class="text-xs px-1.5 py-0.5 rounded-full font-mono"
                      style="background:rgba(<?= $gorev['sicaklik_skoru'] >= 90 ? '255,51,102' : ($gorev['sicaklik_skoru'] >= 80 ? '255,170,0' : '0,212,255') ?>,0.15);
                             color:<?= $gorev['sicaklik_skoru'] >= 90 ? '#ff3366' : ($gorev['sicaklik_skoru'] >= 80 ? '#ffaa00' : '#00d4ff') ?>;">
                    🔥<?= (int)$gorev['sicaklik_skoru'] ?>
                </span>
                <?php endif; ?>
            </div>

            <div class="flex flex-wrap gap-3 text-xs" style="color: #7a8599;">
                <?php if ($gorev['musteri_ad'] ?? null): ?>
                <span>👤 <?= e($gorev['musteri_ad']) ?></span>
                <?php endif; ?>
                <?php if ($gorev['saat'] ?? ($gorev['tarih_saat'] ?? null)): ?>
                <span>🕒 <?= e(substr($gorev['saat'] ?? substr($gorev['tarih_saat'] ?? '', 11, 5), 0, 5)) ?></span>
                <?php endif; ?>
                <?php if ($gorev['danisman_ad'] ?? null): ?>
                <span>💼 <?= e($gorev['danisman_ad']) ?></span>
                <?php endif; ?>
            </div>

            <?php if ($gorev['aciklama'] ?? null): ?>
            <p class="gorev-not text-xs mt-1" style="color:#64748b;"><?= e(truncate($gorev['aciklama'], 80)) ?></p>
            <?php endif; ?>
        </div>

        <!-- Sağ taraf butonları -->
        <div class="flex flex-col gap-1 flex-shrink-0">
            <!-- AI Senaryo -->
            <button onclick="showAiSenaryo(<?= $gorevId ?>)"
                    class="text-xs px-2 py-1 rounded-lg transition-colors"
                    style="background: rgba(139,92,246,0.15); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.3);"
                    title="<?= ($gorev['ai_senaryo'] ?? null) ? 'Senaryoyu göster' : 'AI senaryo üret' ?>">
                🤖<?= ($gorev['ai_senaryo'] ?? null) ? '' : '+' ?>
            </button>
            <!-- Sesli Not -->
            <button onclick="gorevSesliNot(<?= $gorevId ?>)"
                    class="text-xs px-2 py-1 rounded-lg transition-colors"
                    style="background: rgba(255,51,102,0.1); color: #ff3366; border: 1px solid rgba(255,51,102,0.2);"
                    title="Sesli not al">
                🎤
            </button>
        </div>
    </div>

    <!-- Hızlı Tamamlama Butonları -->
    <?php if (!$tamamlandi): ?>
    <div class="flex gap-2 mt-3 pt-3 border-t" style="border-color: rgba(255,255,255,0.04);" id="gorev-actions-<?= $gorevId ?>">
        <button onclick="sonucKaydet(<?= $gorevId ?>, 'basarili')"
                class="flex-1 text-xs py-1.5 rounded-lg transition-colors"
                style="background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid rgba(0,255,136,0.2);">
            ✅ Başarılı
        </button>
        <button onclick="sonucKaydet(<?= $gorevId ?>, 'basarisiz')"
                class="flex-1 text-xs py-1.5 rounded-lg transition-colors"
                style="background: rgba(255,51,102,0.1); color: #ff3366; border: 1px solid rgba(255,51,102,0.2);">
            ✗ Başarısız
        </button>
        <button onclick="sonucKaydet(<?= $gorevId ?>, 'ertelendi')"
                class="flex-1 text-xs py-1.5 rounded-lg transition-colors"
                style="background: rgba(255,170,0,0.1); color: #ffaa00; border: 1px solid rgba(255,170,0,0.2);">
            ↻ Ertele
        </button>
        <button onclick="sonucKaydet(<?= $gorevId ?>, 'ulasilamadi')"
                class="text-xs py-1.5 px-2 rounded-lg transition-colors"
                style="background: rgba(255,255,255,0.04); color: #7a8599; border: 1px solid rgba(255,255,255,0.06);">
            📵
        </button>
    </div>
    <?php endif; ?>
</div>
