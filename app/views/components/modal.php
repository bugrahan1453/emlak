<!-- Yeniden kullanılabilir Modal Bileşeni (Alpine.js) -->
<!-- Kullanım: $modalId, $modalTitle, slot içeriği belirle -->
<?php
$modalId    = $modalId    ?? 'modal';
$modalTitle = $modalTitle ?? 'Modal';
$modalSize  = $modalSize  ?? 'max-w-lg'; // max-w-sm, max-w-lg, max-w-2xl, max-w-4xl
?>
<div id="<?= e($modalId) ?>"
     x-show="modalAcik"
     x-transition:enter="transition ease-out duration-200"
     x-transition:enter-start="opacity-0"
     x-transition:enter-end="opacity-100"
     x-transition:leave="transition ease-in duration-150"
     x-transition:leave-start="opacity-100"
     x-transition:leave-end="opacity-0"
     class="fixed inset-0 z-50 flex items-center justify-center p-4"
     style="background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);">

    <div x-show="modalAcik"
         x-transition:enter="transition ease-out duration-200"
         x-transition:enter-start="opacity-0 scale-95"
         x-transition:enter-end="opacity-100 scale-100"
         x-transition:leave="transition ease-in duration-150"
         x-transition:leave-start="opacity-100 scale-100"
         x-transition:leave-end="opacity-0 scale-95"
         @click.away="modalAcik = false"
         class="w-full <?= e($modalSize) ?> rounded-2xl overflow-hidden shadow-2xl"
         style="background: #0c1129; border: 1px solid rgba(255,255,255,0.08);">

        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b" style="border-color: rgba(255,255,255,0.06);">
            <h3 class="font-semibold text-sm" style="color: #e8ecf4;"><?= e($modalTitle) ?></h3>
            <button @click="modalAcik = false" class="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style="color: #7a8599;">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>

        <!-- Content Slot -->
        <div class="p-6">
            <?= $modalContent ?? '' ?>
        </div>
    </div>
</div>
