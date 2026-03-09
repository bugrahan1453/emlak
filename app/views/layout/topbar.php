<?php
$user = Auth::user();
$bildirimModel = new Bildirim();
$bildirimSayisi = 0;
try {
    $bildirimSayisi = $bildirimModel->getOkunmamisSayisi(Auth::id());
} catch (Exception $e) {}
?>
<!-- Topbar -->
<header class="sticky top-0 z-20 flex items-center gap-4 px-4 py-3 lg:px-6"
        style="background: rgba(6,10,26,0.95); border-bottom: 1px solid rgba(255,255,255,0.06); backdrop-filter: blur(20px);">

    <!-- Hamburger (mobil) -->
    <button onclick="toggleSidebar()" class="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors" style="color: #7a8599;">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
    </button>

    <!-- Arama çubuğu -->
    <div class="flex-1 max-w-xl relative" x-data="{ open: false, results: [], query: '' }">
        <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style="color: #7a8599;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input type="text"
                   x-model="query"
                   @input.debounce.400ms="searchGlobal($event.target.value)"
                   @focus="open = query.length > 2"
                   @click.away="open = false"
                   placeholder="İlan, müşteri, mahalle ara..."
                   class="w-full pl-10 pr-4 py-2 text-sm rounded-xl border outline-none transition-all"
                   style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4; font-family: 'Outfit', sans-serif;"
                   onfocus="this.style.borderColor='rgba(0,212,255,0.4)'"
                   onblur="this.style.borderColor='rgba(255,255,255,0.08)'">
        </div>
        <!-- Arama sonuçları -->
        <div x-show="open && results.length > 0"
             class="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden shadow-2xl z-50"
             style="background: #0c1129; border: 1px solid rgba(255,255,255,0.08);">
            <template x-for="r in results" :key="r.id + r.tip">
                <a :href="r.url" class="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b" style="border-color: rgba(255,255,255,0.04);">
                    <span x-text="r.ikon" class="text-sm"></span>
                    <div>
                        <div class="text-sm font-medium" style="color: #e8ecf4;" x-text="r.baslik"></div>
                        <div class="text-xs" style="color: #7a8599;" x-text="r.alt"></div>
                    </div>
                </a>
            </template>
        </div>
    </div>

    <div class="flex items-center gap-3 ml-auto">
        <!-- RADAR AKTİF göstergesi -->
        <div class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
             style="background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid rgba(0,255,136,0.2);">
            <span class="w-2 h-2 rounded-full animate-pulse" style="background: #00ff88;"></span>
            RADAR AKTİF
        </div>

        <!-- Bildirim Zili -->
        <div class="relative" x-data="bildirimPanel()">
            <button @click="togglePanel()" class="relative p-2 rounded-xl hover:bg-white/5 transition-colors" style="color: #7a8599;">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
                <?php if ($bildirimSayisi > 0): ?>
                <span class="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold"
                      style="background: #ff3366; color: white;"><?= $bildirimSayisi > 9 ? '9+' : $bildirimSayisi ?></span>
                <?php endif; ?>
            </button>

            <!-- Bildirim Paneli -->
            <div x-show="panelAcik" x-transition @click.away="panelAcik = false"
                 class="absolute right-0 top-full mt-2 w-80 rounded-2xl shadow-2xl overflow-hidden z-50"
                 style="background: #0c1129; border: 1px solid rgba(255,255,255,0.08);">
                <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color: rgba(255,255,255,0.06);">
                    <span class="font-semibold text-sm" style="color: #e8ecf4;">Bildirimler</span>
                    <button @click="tumunuOku()" class="text-xs hover:underline" style="color: #00d4ff;">Tümünü okundu işaretle</button>
                </div>
                <div class="max-h-80 overflow-y-auto">
                    <template x-if="bildirimler.length === 0">
                        <div class="px-4 py-8 text-center text-sm" style="color: #7a8599;">Bildirim yok</div>
                    </template>
                    <template x-for="b in bildirimler" :key="b.id">
                        <a :href="b.link || '#'" @click="okunduIsaretle(b.id)"
                           class="flex gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b"
                           style="border-color: rgba(255,255,255,0.04);">
                            <span x-text="b.ikon" class="text-base flex-shrink-0"></span>
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-medium truncate" :style="b.okundu ? 'color:#7a8599' : 'color:#e8ecf4'" x-text="b.baslik"></div>
                                <div class="text-xs mt-0.5" style="color:#7a8599" x-text="b.zaman"></div>
                            </div>
                            <div x-show="!b.okundu" class="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style="background: #00d4ff;"></div>
                        </a>
                    </template>
                </div>
            </div>
        </div>

        <!-- Kullanıcı Avatar -->
        <a href="<?= APP_URL ?>/ayarlar.php" class="flex items-center gap-2 group">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                 style="background: linear-gradient(135deg, #00d4ff33, #8b5cf633); color: #00d4ff;">
                <?php
                $initials = '';
                $parts = explode(' ', trim($user['ad_soyad'] ?? ''));
                foreach (array_slice($parts, 0, 2) as $p) $initials .= mb_strtoupper(mb_substr($p, 0, 1));
                echo e($initials);
                ?>
            </div>
            <span class="hidden md:block text-sm font-medium" style="color: #e8ecf4;"><?= e(explode(' ', $user['ad_soyad'] ?? '')[0]) ?></span>
        </a>
    </div>
</header>

<script>
function searchGlobal(q) {
    if (q.length < 2) { this.results = []; this.open = false; return; }
    fetch('<?= APP_URL ?>/api/ilanlar.php?action=search&q=' + encodeURIComponent(q))
        .then(r => r.json())
        .then(data => {
            this.results = data.data || [];
            this.open = this.results.length > 0;
        });
}

function bildirimPanel() {
    return {
        panelAcik: false,
        bildirimler: [],
        async togglePanel() {
            this.panelAcik = !this.panelAcik;
            if (this.panelAcik) await this.yukle();
        },
        async yukle() {
            const r = await fetch('<?= APP_URL ?>/api/bildirimler.php?action=list');
            const d = await r.json();
            this.bildirimler = d.data || [];
        },
        async okunduIsaretle(id) {
            await fetch('<?= APP_URL ?>/api/bildirimler.php?action=oku&id=' + id, {method:'POST'});
        },
        async tumunuOku() {
            await fetch('<?= APP_URL ?>/api/bildirimler.php?action=tumunu_oku', {method:'POST'});
            this.bildirimler = this.bildirimler.map(b => ({...b, okundu: 1}));
        }
    }
}
</script>
