<?php
require_once dirname(__DIR__) . '/app/config/app.php';
$user = Auth::requireLogin();

$pageTitle = 'Rapor Üretici';
$extraJs   = 'raporlar.js';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 space-y-6" x-data="raporlarApp()">

  <!-- Başlık -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-bold" style="color:#e8ecf4;">📄 Rapor Üretici</h1>
      <p class="text-sm mt-0.5" style="color:#7a8599;">Gerçeklik Tokadı, ROI Analizi ve Portföy raporları üretin</p>
    </div>
  </div>

  <!-- Tab Menüsü -->
  <div class="flex gap-1 p-1 rounded-xl" style="background:rgba(15,23,62,0.6);border:1px solid rgba(255,255,255,0.06);width:fit-content;">
    <button @click="aktifTab='gerceklik_tokadi'"
            :class="aktifTab==='gerceklik_tokadi' ? 'active-tab' : 'inactive-tab'"
            class="px-4 py-2 rounded-lg text-sm font-medium transition-all">
      📊 Gerçeklik Tokadı
    </button>
    <button @click="aktifTab='roi'"
            :class="aktifTab==='roi' ? 'active-tab' : 'inactive-tab'"
            class="px-4 py-2 rounded-lg text-sm font-medium transition-all">
      💹 ROI Analizi
    </button>
    <button @click="aktifTab='portfoy'"
            :class="aktifTab==='portfoy' ? 'active-tab' : 'inactive-tab'"
            class="px-4 py-2 rounded-lg text-sm font-medium transition-all">
      🏠 Portföy
    </button>
  </div>

  <!-- ── TAB 1: GERÇEKLİK TOKADI ─────────────────────────────────── -->
  <div x-show="aktifTab==='gerceklik_tokadi'" x-transition>
    <div class="rounded-2xl p-6" style="background:rgba(15,23,62,0.6);border:1px solid rgba(255,255,255,0.06);">
      <h2 class="font-semibold text-sm mb-1" style="color:#e8ecf4;">📊 Gerçeklik Tokadı Raporu</h2>
      <p class="text-xs mb-6" style="color:#7a8599;">Mal sahibine emsal bazlı piyasa gerçeğini gösteren ikna belgesi</p>

      <!-- İlan Seçici -->
      <div class="space-y-4 max-w-lg">
        <div>
          <label class="block text-xs font-medium mb-1.5" style="color:#7a8599;">İlan Ara</label>
          <div class="relative">
            <input type="text" x-model="gt.aramaMetni" @input.debounce.400ms="ilanAra('gt')"
                   @focus="gt.aramaAcik=true" @click.away="gt.aramaAcik=false"
                   placeholder="İlan başlığı, ilçe veya mahalle ara..."
                   class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                   style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
            <div x-show="gt.aramaAcik && gt.sonuclar.length>0"
                 class="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-2xl z-20"
                 style="background:#0c1129;border:1px solid rgba(255,255,255,0.08);">
              <template x-for="il in gt.sonuclar" :key="il.id">
                <div @click="ilanSec('gt', il)"
                     class="px-4 py-3 cursor-pointer hover:bg-white/5 border-b"
                     style="border-color:rgba(255,255,255,0.04);">
                  <div class="text-sm font-medium" style="color:#e8ecf4;" x-text="il.baslik"></div>
                  <div class="text-xs mt-0.5" style="color:#7a8599;" x-text="il.ilce+' / '+il.mahalle+' — '+new Intl.NumberFormat('tr-TR').format(il.fiyat)+' ₺'"></div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Seçilen İlan Önizleme -->
        <div x-show="gt.seciliIlan" class="rounded-xl p-4" style="background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.2);">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-sm font-semibold" style="color:#e8ecf4;" x-text="gt.seciliIlan?.baslik"></div>
              <div class="text-xs mt-1" style="color:#7a8599;" x-text="gt.seciliIlan?.ilce+' / '+gt.seciliIlan?.mahalle"></div>
              <div class="text-xs mt-0.5" style="color:#00d4ff;" x-text="gt.seciliIlan ? new Intl.NumberFormat('tr-TR').format(gt.seciliIlan.fiyat)+' ₺ | '+gt.seciliIlan.metrekare+' m² | '+gt.seciliIlan.oda_sayisi : ''"></div>
            </div>
            <button @click="gt.seciliIlan=null;gt.aramaMetni=''" class="text-xs" style="color:#7a8599;">✕</button>
          </div>
        </div>

        <button @click="raporUret('gerceklik_tokadi')"
                :disabled="!gt.seciliIlan || yukleniyor"
                class="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40"
                style="background:linear-gradient(135deg,rgba(0,212,255,0.2),rgba(139,92,246,0.2));border:1px solid rgba(0,212,255,0.3);color:#00d4ff;">
          <span x-show="!yukleniyor">📊 Rapor Üret</span>
          <span x-show="yukleniyor" class="flex items-center gap-2"><span class="loader-spin">⏳</span> Üretiliyor...</span>
        </button>
      </div>
    </div>
  </div>

  <!-- ── TAB 2: ROI ──────────────────────────────────────────────── -->
  <div x-show="aktifTab==='roi'" x-transition>
    <div class="rounded-2xl p-6" style="background:rgba(15,23,62,0.6);border:1px solid rgba(255,255,255,0.06);">
      <h2 class="font-semibold text-sm mb-1" style="color:#e8ecf4;">💹 ROI / Yatırım Getiri Analizi</h2>
      <p class="text-xs mb-6" style="color:#7a8599;">Yatırımcı müşteriler için kira verimi, amortisman ve 5 yıllık projeksiyon</p>

      <div class="space-y-4 max-w-lg">
        <div>
          <label class="block text-xs font-medium mb-1.5" style="color:#7a8599;">İlan Ara</label>
          <div class="relative">
            <input type="text" x-model="roi.aramaMetni" @input.debounce.400ms="ilanAra('roi')"
                   @focus="roi.aramaAcik=true" @click.away="roi.aramaAcik=false"
                   placeholder="İlan ara..."
                   class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                   style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
            <div x-show="roi.aramaAcik && roi.sonuclar.length>0"
                 class="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-2xl z-20"
                 style="background:#0c1129;border:1px solid rgba(255,255,255,0.08);">
              <template x-for="il in roi.sonuclar" :key="il.id">
                <div @click="ilanSec('roi', il)" class="px-4 py-3 cursor-pointer hover:bg-white/5 border-b" style="border-color:rgba(255,255,255,0.04);">
                  <div class="text-sm font-medium" style="color:#e8ecf4;" x-text="il.baslik"></div>
                  <div class="text-xs mt-0.5" style="color:#7a8599;" x-text="il.ilce+' / '+il.mahalle+' — '+new Intl.NumberFormat('tr-TR').format(il.fiyat)+' ₺'"></div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div x-show="roi.seciliIlan" class="rounded-xl p-3" style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.2);">
          <div class="text-sm font-semibold" style="color:#e8ecf4;" x-text="roi.seciliIlan?.baslik"></div>
          <div class="text-xs mt-0.5" style="color:#00ff88;" x-text="roi.seciliIlan ? new Intl.NumberFormat('tr-TR').format(roi.seciliIlan.fiyat)+' ₺' : ''"></div>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1.5" style="color:#7a8599;">Tahmini Kira Fiyatı (aylık ₺)</label>
          <input type="number" x-model="roi.kiraFiyati" placeholder="Ör: 15000"
                 class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                 style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
        </div>

        <!-- Anlık hesaplama önizlemesi -->
        <div x-show="roi.seciliIlan && roi.kiraFiyati>0" class="grid grid-cols-3 gap-3">
          <div class="rounded-xl p-3 text-center" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);">
            <div class="text-xs" style="color:#7a8599;">Brüt Verim</div>
            <div class="text-sm font-bold mt-1" style="color:#00d4ff;" x-text="roi.seciliIlan && roi.kiraFiyati ? '%'+((roi.kiraFiyati*12/roi.seciliIlan.fiyat)*100).toFixed(2) : '-'"></div>
          </div>
          <div class="rounded-xl p-3 text-center" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);">
            <div class="text-xs" style="color:#7a8599;">Amortisman</div>
            <div class="text-sm font-bold mt-1" style="color:#00d4ff;" x-text="roi.seciliIlan && roi.kiraFiyati ? Math.ceil(roi.seciliIlan.fiyat/(roi.kiraFiyati*12*0.75))+' yıl' : '-'"></div>
          </div>
          <div class="rounded-xl p-3 text-center" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);">
            <div class="text-xs" style="color:#7a8599;">Yıllık Kira</div>
            <div class="text-sm font-bold mt-1" style="color:#00d4ff;" x-text="roi.kiraFiyati ? new Intl.NumberFormat('tr-TR').format(roi.kiraFiyati*12)+' ₺' : '-'"></div>
          </div>
        </div>

        <button @click="raporUret('roi')"
                :disabled="!roi.seciliIlan || !roi.kiraFiyati || yukleniyor"
                class="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40"
                style="background:linear-gradient(135deg,rgba(0,255,136,0.2),rgba(0,212,255,0.2));border:1px solid rgba(0,255,136,0.3);color:#00ff88;">
          <span x-show="!yukleniyor">💹 ROI Raporu Üret</span>
          <span x-show="yukleniyor">⏳ Üretiliyor...</span>
        </button>
      </div>
    </div>
  </div>

  <!-- ── TAB 3: PORTFÖY ──────────────────────────────────────────── -->
  <div x-show="aktifTab==='portfoy'" x-transition>
    <div class="rounded-2xl p-6" style="background:rgba(15,23,62,0.6);border:1px solid rgba(255,255,255,0.06);">
      <h2 class="font-semibold text-sm mb-1" style="color:#e8ecf4;">🏠 Portföy Özet Raporu</h2>
      <p class="text-xs mb-6" style="color:#7a8599;">Belirlediğiniz dönem ve bölge için tüm portföy analizi</p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mb-6">
        <div>
          <label class="block text-xs font-medium mb-1.5" style="color:#7a8599;">Başlangıç Tarihi</label>
          <input type="date" x-model="portfoy.tarihBas" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
        </div>
        <div>
          <label class="block text-xs font-medium mb-1.5" style="color:#7a8599;">Bitiş Tarihi</label>
          <input type="date" x-model="portfoy.tarihBit" class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
        </div>
        <div>
          <label class="block text-xs font-medium mb-1.5" style="color:#7a8599;">Bölge Filtresi (opsiyonel)</label>
          <input type="text" x-model="portfoy.bolge" placeholder="İlçe adı..."
                 class="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                 style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
        </div>
      </div>

      <button @click="raporUret('portfoy')" :disabled="yukleniyor"
              class="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40"
              style="background:linear-gradient(135deg,rgba(139,92,246,0.2),rgba(0,212,255,0.2));border:1px solid rgba(139,92,246,0.3);color:#8b5cf6;">
        <span x-show="!yukleniyor">🏠 Portföy Raporu Üret</span>
        <span x-show="yukleniyor">⏳ Üretiliyor...</span>
      </button>
    </div>
  </div>

  <!-- ── Üretilen Rapor Sonucu ──────────────────────────────────── -->
  <div x-show="sonucRapor" x-transition class="rounded-2xl p-5" style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.2);">
    <div class="flex items-center gap-3 mb-4">
      <span class="text-2xl">✅</span>
      <div>
        <div class="font-semibold text-sm" style="color:#e8ecf4;">Rapor başarıyla oluşturuldu!</div>
        <div class="text-xs mt-0.5" style="color:#7a8599;">Raporu yeni sekmede açın veya WhatsApp ile paylaşın</div>
      </div>
    </div>
    <div class="flex flex-wrap gap-3">
      <a :href="sonucRapor?.url" target="_blank"
         class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
         style="background:rgba(0,255,136,0.15);border:1px solid rgba(0,255,136,0.3);color:#00ff88;">
        🔗 Raporu Aç / Yazdır
      </a>
      <button @click="whatsappModal=true"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
              style="background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.3);color:#25d366;">
        💬 WhatsApp ile Paylaş
      </button>
      <button @click="sonucRapor=null"
              class="px-4 py-2 rounded-xl text-sm"
              style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#7a8599;">
        ✕ Kapat
      </button>
    </div>
  </div>

  <!-- ── Geçmiş Raporlar ──────────────────────────────────────── -->
  <div class="rounded-2xl overflow-hidden" style="background:rgba(15,23,62,0.6);border:1px solid rgba(255,255,255,0.06);">
    <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color:rgba(255,255,255,0.06);">
      <span class="text-sm font-semibold" style="color:#e8ecf4;">📋 Geçmiş Raporlar</span>
      <button @click="listeyiYukle()" class="text-xs" style="color:#00d4ff;">🔄 Yenile</button>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
            <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style="color:#7a8599;">Tip</th>
            <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">İlan</th>
            <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">Tarih</th>
            <th class="px-4 py-3 text-left text-xs" style="color:#7a8599;">İşlemler</th>
          </tr>
        </thead>
        <tbody>
          <template x-if="liste.length===0">
            <tr><td colspan="4" class="px-4 py-12 text-center text-sm" style="color:#7a8599;">Rapor oluşturulmamış.</td></tr>
          </template>
          <template x-for="r in liste" :key="r.id">
            <tr class="border-b hover:bg-white/2 transition-colors" style="border-color:rgba(255,255,255,0.04);">
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs"
                      :style="r.tip==='gerceklik_tokadi' ? 'background:rgba(0,212,255,0.1);color:#00d4ff' : r.tip==='roi' ? 'background:rgba(0,255,136,0.1);color:#00ff88' : 'background:rgba(139,92,246,0.1);color:#8b5cf6'"
                      x-text="r.tip==='gerceklik_tokadi'?'Gerçeklik Tokadı':r.tip==='roi'?'ROI':'Portföy'"></span>
              </td>
              <td class="px-4 py-3 text-xs" style="color:#7a8599;" x-text="r.ilan_baslik||'—'"></td>
              <td class="px-4 py-3 text-xs" style="color:#7a8599;" x-text="r.created_at ? new Date(r.created_at).toLocaleString('tr-TR') : ''"></td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <a :href="'<?= APP_URL ?>/uploads/raporlar/' + r.dosya_yolu" target="_blank"
                     class="text-xs px-2 py-1 rounded-lg"
                     style="background:rgba(0,212,255,0.1);color:#00d4ff;">İndir</a>
                  <button @click="raporWhatsapp(r)"
                          class="text-xs px-2 py-1 rounded-lg"
                          style="background:rgba(37,211,102,0.1);color:#25d366;">💬</button>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>

</main>

<!-- WhatsApp Modal -->
<div x-show="whatsappModal" x-transition class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/60" @click="whatsappModal=false"></div>
  <div class="relative rounded-2xl p-6 w-full max-w-md" style="background:#0c1129;border:1px solid rgba(255,255,255,0.08);">
    <h3 class="font-bold text-sm mb-4" style="color:#e8ecf4;">💬 WhatsApp ile Paylaş</h3>

    <div class="space-y-3">
      <div>
        <label class="text-xs" style="color:#7a8599;">Müşteri Telefonu</label>
        <input type="tel" x-model="wa.telefon" placeholder="05xx xxx xx xx"
               class="w-full px-3 py-2.5 mt-1 rounded-xl text-sm border outline-none"
               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
      </div>
      <div>
        <label class="text-xs" style="color:#7a8599;">Müşteri Adı</label>
        <input type="text" x-model="wa.musteriAdi" placeholder="Müşteri adı..."
               class="w-full px-3 py-2.5 mt-1 rounded-xl text-sm border outline-none"
               style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.08);color:#e8ecf4;">
      </div>
    </div>

    <div class="flex gap-3 mt-5">
      <a :href="waWebLink()" target="_blank"
         class="flex-1 text-center py-2.5 rounded-xl text-sm font-medium"
         style="background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.3);color:#25d366;">
        🔗 Web Link ile Aç
      </a>
      <button @click="waApiGonder()"
              class="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style="background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.3);color:#00d4ff;">
        📤 API ile Gönder
      </button>
    </div>
    <button @click="whatsappModal=false" class="w-full mt-3 py-2 text-sm rounded-xl" style="background:rgba(255,255,255,0.04);color:#7a8599;">İptal</button>
  </div>
</div>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>

<style>
.active-tab { background: rgba(0,212,255,0.15); color: #00d4ff; border: 1px solid rgba(0,212,255,0.25); }
.inactive-tab { color: #7a8599; }
.inactive-tab:hover { color: #e8ecf4; background: rgba(255,255,255,0.04); }
</style>
