<!-- Flash Mesaj Popup -->
<?php $flash = getFlashMessage(); ?>
<?php if ($flash): ?>
<div x-data="{ show: true }"
     x-show="show"
     x-init="setTimeout(() => show = false, 4000)"
     x-transition:enter="transition ease-out duration-300"
     x-transition:enter-start="opacity-0 translate-y-2"
     x-transition:enter-end="opacity-100 translate-y-0"
     x-transition:leave="transition ease-in duration-200"
     x-transition:leave-start="opacity-100"
     x-transition:leave-end="opacity-0"
     class="fixed bottom-20 right-4 lg:bottom-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm"
     style="<?= match($flash['type'] ?? 'info') {
         'success' => 'background: rgba(0,255,136,0.15); color: #00ff88; border: 1px solid rgba(0,255,136,0.3);',
         'error'   => 'background: rgba(255,51,102,0.15); color: #ff3366; border: 1px solid rgba(255,51,102,0.3);',
         'warning' => 'background: rgba(255,170,0,0.15); color: #ffaa00; border: 1px solid rgba(255,170,0,0.3);',
         default   => 'background: rgba(0,212,255,0.15); color: #00d4ff; border: 1px solid rgba(0,212,255,0.3);',
     } ?>">
    <span><?= match($flash['type'] ?? 'info') { 'success' => '✅', 'error' => '❌', 'warning' => '⚠️', default => 'ℹ️' } ?></span>
    <span><?= e($flash['message']) ?></span>
    <button @click="show = false" class="ml-2 opacity-60 hover:opacity-100">✕</button>
</div>
<?php endif; ?>
