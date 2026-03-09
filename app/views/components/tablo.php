<!-- Yeniden kullanılabilir Tablo Bileşeni -->
<?php
/**
 * $tabloHeaders: ['Başlık', 'Fiyat', ...] veya [['label' => 'Başlık', 'sortable' => true, 'key' => 'baslik'], ...]
 * $tabloRows: array of arrays
 * $tabloToplam: int (sayfalama için)
 * $tabloSayfa: int
 */
?>
<div class="rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <?php foreach ($tabloHeaders ?? [] as $h): ?>
                    <?php $label = is_array($h) ? $h['label'] : $h; $sortKey = is_array($h) ? ($h['key'] ?? null) : null; $sortable = is_array($h) && !empty($h['sortable']); ?>
                    <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider <?= $sortable ? 'cursor-pointer hover:text-cyan-400 select-none' : '' ?>"
                        style="color: #7a8599; white-space: nowrap;"
                        <?= $sortable ? "onclick=\"sortTable('$sortKey')\"" : '' ?>>
                        <?= e($label) ?>
                        <?php if ($sortable): ?>
                        <span class="ml-1 opacity-50">↕</span>
                        <?php endif; ?>
                    </th>
                    <?php endforeach; ?>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($tabloRows)): ?>
                <tr>
                    <td colspan="<?= count($tabloHeaders ?? []) ?>"
                        class="px-4 py-12 text-center text-sm"
                        style="color: #7a8599;">
                        Kayıt bulunamadı.
                    </td>
                </tr>
                <?php else: ?>
                <?php foreach ($tabloRows as $row): ?>
                <tr class="border-b hover:bg-white/2 transition-colors" style="border-color: rgba(255,255,255,0.04);">
                    <?php foreach ($row as $cell): ?>
                    <td class="px-4 py-3" style="color: #e8ecf4; white-space: nowrap;"><?= $cell ?></td>
                    <?php endforeach; ?>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>

    <?php if (isset($tabloToplam)): ?>
    <div class="px-4 py-3 border-t" style="border-color: rgba(255,255,255,0.06);">
        <?= pagination($tabloToplam, $tabloSayfa ?? 1, PER_PAGE, '?' . http_build_query(array_diff_key($_GET, ['sayfa' => '']))) ?>
    </div>
    <?php endif; ?>
</div>
