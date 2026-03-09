<?php
/**
 * İlan Kartı Bileşeni
 * Değişkenler: $ilan (array), $compact (bool, opsiyonel)
 */
$foto   = null;
if (!empty($ilan['fotograflar'])) {
    $f = is_array($ilan['fotograflar']) ? $ilan['fotograflar'] : json_decode($ilan['fotograflar'], true);
    $foto = $f[0] ?? null;
}
$foto = $foto ?: null;

$durum = $ilan['durum'] ?? 'aktif';
$durumColors = [
    'aktif'    => ['bg' => 'rgba(0,255,136,0.15)', 'text' => '#00ff88', 'label' => 'Aktif'],
    'pasif'    => ['bg' => 'rgba(122,133,153,0.15)', 'text' => '#7a8599', 'label' => 'Pasif'],
    'silindi'  => ['bg' => 'rgba(255,51,102,0.15)', 'text' => '#ff3366', 'label' => 'Silindi'],
    'satildi'  => ['bg' => 'rgba(139,92,246,0.15)', 'text' => '#8b5cf6', 'label' => 'Satıldı'],
    'kiralandi'=> ['bg' => 'rgba(0,212,255,0.15)', 'text' => '#00d4ff', 'label' => 'Kiralandı'],
];
$dc = $durumColors[$durum] ?? $durumColors['aktif'];

$etiketler = [];
if (strtotime($ilan['created_at'] ?? '') > strtotime('-24 hours')) $etiketler[] = ['label' => 'YENİ', 'color' => '#00d4ff'];
if (($ilan['pazarlik_skoru'] ?? 0) >= 70) $etiketler[] = ['label' => 'FIRSAT', 'color' => '#00ff88'];
if (!empty($ilan['fiyat_dusus'])) $etiketler[] = ['label' => 'DÜŞÜŞ', 'color' => '#ffaa00'];
if ($durum === 'silindi') $etiketler[] = ['label' => 'SİLİNDİ', 'color' => '#ff3366'];
if (($ilan['sahte_skoru'] ?? 0) >= 70) $etiketler[] = ['label' => 'SAHTE?', 'color' => '#ff3366'];
?>
<div class="rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 group"
     style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06); backdrop-filter: blur(20px);">

    <!-- Fotoğraf -->
    <div class="relative h-40 overflow-hidden" style="background: rgba(255,255,255,0.03);">
        <?php if ($foto): ?>
        <img src="<?= APP_URL ?>/uploads/fotograflar/<?= e(basename($foto)) ?>"
             alt="<?= e($ilan['baslik'] ?? '') ?>"
             class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
             loading="lazy">
        <?php else: ?>
        <div class="w-full h-full flex items-center justify-center text-4xl opacity-20">🏠</div>
        <?php endif; ?>

        <!-- Etiketler -->
        <div class="absolute top-2 left-2 flex flex-wrap gap-1">
            <?php foreach ($etiketler as $et): ?>
            <span class="text-xs font-bold px-2 py-0.5 rounded-full"
                  style="background: <?= $et['color'] ?>22; color: <?= $et['color'] ?>; border: 1px solid <?= $et['color'] ?>44;">
                <?= $et['label'] ?>
            </span>
            <?php endforeach; ?>
        </div>

        <!-- Durum -->
        <div class="absolute top-2 right-2">
            <span class="text-xs px-2 py-0.5 rounded-full"
                  style="background: <?= $dc['bg'] ?>; color: <?= $dc['text'] ?>;">
                <?= $dc['label'] ?>
            </span>
        </div>

        <!-- İlan tipi -->
        <div class="absolute bottom-2 left-2">
            <span class="text-xs font-medium px-2 py-0.5 rounded-full"
                  style="background: rgba(0,0,0,0.6); color: #e8ecf4;">
                <?= ($ilan['ilan_tipi'] ?? '') === 'satilik' ? '🔵 Satılık' : '🟡 Kiralık' ?>
            </span>
        </div>
    </div>

    <!-- Bilgiler -->
    <div class="p-4">
        <h3 class="text-sm font-semibold mb-1 line-clamp-2" style="color: #e8ecf4;">
            <a href="<?= APP_URL ?>/ilan-detay.php?id=<?= (int)($ilan['id'] ?? 0) ?>" class="hover:text-cyan-400 transition-colors">
                <?= e($ilan['baslik'] ?? '') ?>
            </a>
        </h3>

        <p class="text-xs mb-3 flex items-center gap-1" style="color: #7a8599;">
            <span>📍</span>
            <span><?= e(($ilan['ilce'] ?? '') . ($ilan['mahalle'] ? ' / ' . $ilan['mahalle'] : '')) ?></span>
        </p>

        <!-- Fiyat -->
        <div class="text-lg font-bold font-mono mb-3" style="color: #00d4ff;">
            <?= formatFiyat((float)($ilan['fiyat'] ?? 0)) ?>
        </div>

        <!-- Özellikler -->
        <div class="flex flex-wrap gap-2 text-xs mb-3" style="color: #7a8599;">
            <?php if (!empty($ilan['metrekare'])): ?>
            <span class="flex items-center gap-1">📐 <?= e($ilan['metrekare']) ?> m²</span>
            <?php endif; ?>
            <?php if (!empty($ilan['oda_sayisi'])): ?>
            <span class="flex items-center gap-1">🚪 <?= e($ilan['oda_sayisi']) ?></span>
            <?php endif; ?>
            <?php if (!empty($ilan['kat'])): ?>
            <span class="flex items-center gap-1">🏢 <?= e($ilan['kat']) ?></span>
            <?php endif; ?>
        </div>

        <!-- Alt bilgi -->
        <div class="flex items-center justify-between text-xs" style="color: #7a8599;">
            <span><?= e(ucfirst($ilan['kaynak_site'] ?? 'Manuel')) ?></span>
            <span><?= zamanFarki($ilan['created_at'] ?? '') ?></span>
        </div>

        <!-- İşlem butonları -->
        <div class="flex gap-2 mt-3 pt-3 border-t" style="border-color: rgba(255,255,255,0.06);">
            <a href="<?= APP_URL ?>/ilan-detay.php?id=<?= (int)($ilan['id'] ?? 0) ?>"
               class="flex-1 text-center text-xs py-1.5 rounded-lg transition-colors"
               style="background: rgba(0,212,255,0.08); color: #00d4ff; border: 1px solid rgba(0,212,255,0.2);">
                Detay
            </a>
            <a href="<?= APP_URL ?>/ilan-ekle.php?id=<?= (int)($ilan['id'] ?? 0) ?>"
               class="flex-1 text-center text-xs py-1.5 rounded-lg transition-colors"
               style="background: rgba(255,255,255,0.04); color: #7a8599; border: 1px solid rgba(255,255,255,0.06);">
                Düzenle
            </a>
        </div>
    </div>
</div>
