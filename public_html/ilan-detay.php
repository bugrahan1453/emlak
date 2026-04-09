<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$id   = (int)(getVal('id') ?: 0);
if (!$id) { flashMessage('error', 'İlan bulunamadı.'); redirect(APP_URL . '/ilanlar.php'); }

$ctrl = new IlanController();
$data = $ctrl->show($id);
if (!$data) { flashMessage('error', 'İlan bulunamadı.'); redirect(APP_URL . '/ilanlar.php'); }

$ilan = $data['ilan'];

// Silme işlemi
if ($_SERVER['REQUEST_METHOD'] === 'POST' && postVal('action') === 'sil') {
    if (verifyCsrf(postVal('csrf_token'))) {
        $ctrl->destroy($id);
    }
}

// AI değerleme verilerini hazırla
$aiDeg = is_string($ilan['ai_degerleme']) ? json_decode($ilan['ai_degerleme'], true) : ($ilan['ai_degerleme'] ?? []);
$fotoAnaliz    = $aiDeg['fotograf_analiz']   ?? null;
$psikoloji     = $aiDeg['satici_psikoloji']  ?? null;
$emsalDeger    = $aiDeg['emsal_deger']       ?? null;

$pageTitle = $ilan['baslik'];
$extraJs   = 'ilan-detay.js';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<?php
$fotograflar = is_string($ilan['fotograflar']) ? json_decode($ilan['fotograflar'], true) : ($ilan['fotograflar'] ?? []);
$fotograflar = is_array($fotograflar) ? $fotograflar : [];
$fotoUrl = function(string $f): string {
    return (strpos($f, 'http') === 0)
        ? APP_URL . '/api/img-proxy.php?url=' . urlencode($f)
        : APP_URL . '/uploads/fotograflar/' . basename($f);
};
?>
<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6"
      x-data="{
          aktifFoto: 0, modalAcik: false, silOnay: false,
          aiYukleniyor: {}, aiSonuc: {},
          sesliNotAcik: false,
          fotoUrls: <?= json_encode(array_values(array_map($fotoUrl, $fotograflar)), JSON_UNESCAPED_UNICODE) ?>
      }">

    <!-- Breadcrumb + Kaynak Link -->
    <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div class="flex items-center gap-2 text-xs" style="color: #7a8599;">
            <a href="<?= APP_URL ?>/ilanlar.php" class="hover:text-cyan-400">İlanlar</a>
            <span>›</span>
            <span style="color: #e8ecf4;"><?= e(truncate($ilan['baslik'], 50)) ?></span>
        </div>
        <?php if (!empty($ilan['kaynak_url'])): ?>
        <?php
        $kaynakSiteMap = [
            'sahibinden' => ['label' => 'Sahibinden', 'renk' => '#ff8800', 'bg' => 'rgba(255,136,0,0.12)'],
            'hepsiemlak' => ['label' => 'Hepsiemlak', 'renk' => '#e5202e', 'bg' => 'rgba(229,32,46,0.12)'],
            'emlakjet'   => ['label' => 'Emlakjet',   'renk' => '#00b4d8', 'bg' => 'rgba(0,180,216,0.12)'],
            'manuel'     => ['label' => 'Manuel',     'renk' => '#7a8599', 'bg' => 'rgba(122,133,153,0.12)'],
        ];
        $ks = $kaynakSiteMap[$ilan['kaynak_site'] ?? ''] ?? ['label' => ucfirst($ilan['kaynak_site'] ?? 'Kaynak'), 'renk' => '#7a8599', 'bg' => 'rgba(122,133,153,0.12)'];
        ?>
        <a href="<?= e($ilan['kaynak_url']) ?>" target="_blank" rel="noopener noreferrer"
           class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all hover:scale-105"
           style="background: <?= $ks['bg'] ?>; color: <?= $ks['renk'] ?>; border: 1px solid <?= $ks['renk'] ?>33;">
            🔗 <?= $ks['label'] ?>'de Aç
        </a>
        <?php endif; ?>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Sol: Fotoğraflar + Harita + Açıklama -->
        <div class="lg:col-span-2 space-y-4">

            <!-- Fotoğraf Galerisi -->
            <?php if (!empty($fotograflar)): ?>
            <div class="rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <!-- Ana foto: doğal boyut, sıfır kırpma -->
                <div class="relative cursor-pointer" style="background:#000;" @click="modalAcik = true">
                    <img :src="fotoUrls[aktifFoto]"
                         class="w-full block"
                         style="max-height:80vh; object-fit:contain;"
                         loading="lazy">
                    <div class="absolute bottom-3 right-3 text-xs px-2 py-1 rounded-full"
                         style="background: rgba(0,0,0,0.6); color: white;">
                        <span x-text="aktifFoto + 1"></span>/<?= count($fotograflar) ?>
                    </div>
                    <div class="absolute inset-0 flex items-center justify-between px-3 opacity-0 hover:opacity-100 transition-opacity">
                        <button @click.stop="aktifFoto = aktifFoto > 0 ? aktifFoto-1 : <?= count($fotograflar)-1 ?>"
                                class="w-8 h-8 rounded-full flex items-center justify-center text-white"
                                style="background: rgba(0,0,0,0.5);">‹</button>
                        <button @click.stop="aktifFoto = aktifFoto < <?= count($fotograflar)-1 ?> ? aktifFoto+1 : 0"
                                class="w-8 h-8 rounded-full flex items-center justify-center text-white"
                                style="background: rgba(0,0,0,0.5);">›</button>
                    </div>
                </div>
                <div class="flex gap-2 p-3 overflow-x-auto">
                    <?php foreach ($fotograflar as $fi => $foto): ?>
                    <img src="<?= $fotoUrl($foto) ?>"
                         @click="aktifFoto = <?= $fi ?>"
                         :class="aktifFoto === <?= $fi ?> ? 'ring-2 ring-cyan-400 opacity-100' : 'opacity-50 hover:opacity-80'"
                         class="w-16 h-12 rounded-lg object-cover cursor-pointer flex-shrink-0 transition-all"
                         loading="lazy">
                    <?php endforeach; ?>
                </div>
            </div>
            <?php else: ?>
            <div class="h-48 rounded-2xl flex items-center justify-center text-6xl"
                 style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">🏠</div>
            <?php endif; ?>

            <!-- Harita -->
            <?php if ($ilan['lat'] && $ilan['lng']): ?>
            <div class="rounded-2xl overflow-hidden" style="border: 1px solid rgba(255,255,255,0.06);">
                <div id="harita" style="height: 250px;"></div>
            </div>
            <script>
            document.addEventListener('DOMContentLoaded', function() {
                var map = L.map('harita').setView([<?= (float)$ilan['lat'] ?>, <?= (float)$ilan['lng'] ?>], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
                L.marker([<?= (float)$ilan['lat'] ?>, <?= (float)$ilan['lng'] ?>])
                 .addTo(map)
                 .bindPopup('<?= e($ilan['baslik']) ?>');
            });
            </script>
            <?php endif; ?>

            <!-- Açıklama -->
            <?php if ($ilan['aciklama']): ?>
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h3 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">Açıklama</h3>
                <p class="text-sm leading-relaxed whitespace-pre-line" style="color: #7a8599;"><?= e($ilan['aciklama']) ?></p>
            </div>
            <?php endif; ?>

            <!-- Fiyat Geçmişi -->
            <?php $fiyatGecmisi = is_string($ilan['fiyat_gecmisi']) ? json_decode($ilan['fiyat_gecmisi'], true) : ($ilan['fiyat_gecmisi'] ?? []); ?>
            <?php if (!empty($fiyatGecmisi)): ?>
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h3 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">📉 Fiyat Geçmişi</h3>
                <canvas id="fiyat-grafigi" height="80"></canvas>
                <script>
                document.addEventListener('DOMContentLoaded', function() {
                    var ctx = document.getElementById('fiyat-grafigi');
                    var gecmis = <?= json_encode($fiyatGecmisi, JSON_UNESCAPED_UNICODE) ?>;
                    gecmis.push({ fiyat: <?= (float)$ilan['fiyat'] ?>, tarih: '<?= date('Y-m-d H:i:s') ?>' });
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: gecmis.map(g => g.tarih.substring(0,10)),
                            datasets: [{ data: gecmis.map(g => g.fiyat), borderColor: '#00d4ff', fill: true, backgroundColor: 'rgba(0,212,255,0.05)', tension: 0.4, pointRadius: 3 }]
                        },
                        options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#7a8599' }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#7a8599', callback: v => (v/1000000).toFixed(1)+'M ₺' }, grid: { color: 'rgba(255,255,255,0.04)' } } } }
                    });
                });
                </script>
            </div>
            <?php endif; ?>

            <!-- ═══ AI FOToğRAF ANALİZ PANELİ ═══ -->
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(139,92,246,0.15);">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-sm font-semibold" style="color: #e8ecf4;">📷 AI Fotoğraf Analizi</h3>
                    <button @click="aiCagir('fotograf_analiz', <?= $id ?>)"
                            :disabled="aiYukleniyor.fotograf"
                            class="text-xs px-3 py-1.5 rounded-lg transition-all"
                            style="background: rgba(139,92,246,0.15); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.3);">
                        <span x-show="!aiYukleniyor.fotograf">🔍 Analiz Et</span>
                        <span x-show="aiYukleniyor.fotograf"><span class="loader inline-block mr-1" style="width:12px;height:12px;border-width:2px;"></span>Analiz...</span>
                    </button>
                </div>

                <?php if ($fotoAnaliz): ?>
                <div class="space-y-3">
                    <!-- Progress bar'lar -->
                    <div>
                        <div class="flex justify-between text-xs mb-1">
                            <span style="color:#7a8599;">Tadilat Durumu</span>
                            <span class="font-mono" style="color:#00d4ff;"><?= (int)$fotoAnaliz['tadilat_durumu'] ?>/10</span>
                        </div>
                        <div class="progress-bar"><div class="progress-fill" style="width:<?= ((int)$fotoAnaliz['tadilat_durumu'])*10 ?>%;background:#00d4ff;"></div></div>
                    </div>
                    <div>
                        <div class="flex justify-between text-xs mb-1">
                            <span style="color:#7a8599;">Genel Kalite</span>
                            <span class="font-mono" style="color:#00ff88;"><?= (int)$fotoAnaliz['genel_kalite'] ?>/10</span>
                        </div>
                        <div class="progress-bar"><div class="progress-fill" style="width:<?= ((int)$fotoAnaliz['genel_kalite'])*10 ?>%;background:#00ff88;"></div></div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 text-xs">
                        <div class="p-2 rounded-lg" style="background:rgba(255,255,255,0.03);">
                            <span style="color:#7a8599;">Mutfak Yaşı</span>
                            <div class="font-mono mt-0.5" style="color:#e8ecf4;">~<?= (int)$fotoAnaliz['mutfak_yasi_tahmini'] ?> yıl</div>
                        </div>
                        <div class="p-2 rounded-lg" style="background:rgba(255,255,255,0.03);">
                            <span style="color:#7a8599;">Banyo Yaşı</span>
                            <div class="font-mono mt-0.5" style="color:#e8ecf4;">~<?= (int)$fotoAnaliz['banyo_yasi_tahmini'] ?> yıl</div>
                        </div>
                    </div>
                    <?php if (!empty($fotoAnaliz['arti_yonler'])): ?>
                    <div class="text-xs">
                        <span style="color:#00ff88;">Artılar:</span>
                        <span style="color:#7a8599;"><?= e(implode(', ', $fotoAnaliz['arti_yonler'])) ?></span>
                    </div>
                    <?php endif; ?>
                    <?php if (!empty($fotoAnaliz['eksi_yonler'])): ?>
                    <div class="text-xs">
                        <span style="color:#ff3366;">Eksiler:</span>
                        <span style="color:#7a8599;"><?= e(implode(', ', $fotoAnaliz['eksi_yonler'])) ?></span>
                    </div>
                    <?php endif; ?>
                    <?php if (($fotoAnaliz['tahmini_tadilat_maliyeti_tl'] ?? 0) > 0): ?>
                    <div class="text-xs pt-2 border-t" style="border-color:rgba(255,255,255,0.06);">
                        <span style="color:#7a8599;">Tahmini Tadilat: </span>
                        <span class="font-mono font-semibold" style="color:#ffaa00;"><?= number_format($fotoAnaliz['tahmini_tadilat_maliyeti_tl'], 0, ',', '.') ?> ₺</span>
                    </div>
                    <?php endif; ?>
                </div>
                <?php else: ?>
                <p class="text-xs" style="color:#7a8599;">Fotoğraf analizi için "Analiz Et" butonuna tıklayın.</p>
                <?php endif; ?>
                <div x-show="aiSonuc.fotograf" x-html="aiSonuc.fotograf" class="mt-3"></div>
            </div>
        </div>

        <!-- Sağ: Bilgiler + AI Paneller + İşlemler -->
        <div class="space-y-4">

            <!-- Temel Bilgiler -->
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <?= ilanDurumBadge($ilan['durum']) ?>
                        <div class="mt-1 text-xs" style="color: #7a8599;">
                            <?= ($ilan['ilan_tipi'] === 'satilik') ? '🔵 Satılık' : '🟡 Kiralık' ?> · <?= e(ucfirst($ilan['emlak_tipi'])) ?>
                        </div>
                    </div>
                    <div class="text-xl font-bold font-mono text-right" style="color: #00d4ff;">
                        <?= formatFiyat((float)$ilan['fiyat']) ?>
                    </div>
                </div>

                <h2 class="text-base font-semibold mb-4" style="color: #e8ecf4;"><?= e($ilan['baslik']) ?></h2>

                <div class="space-y-2 text-sm">
                    <?php
                    // m² fiyat hesapla
                    $m2Fiyat = ($ilan['m2_fiyat'] > 0) ? $ilan['m2_fiyat'] : (($ilan['metrekare'] > 0 && $ilan['fiyat'] > 0) ? round($ilan['fiyat'] / $ilan['metrekare'], 2) : null);

                    // İlan ömrü hesapla
                    $ilanOmru = null;
                    if ($ilan['created_at']) {
                        $fark = (new DateTime())->diff(new DateTime($ilan['created_at']));
                        if ($fark->days == 0) $ilanOmru = 'Bugün';
                        elseif ($fark->days == 1) $ilanOmru = '1 gün';
                        elseif ($fark->days < 30) $ilanOmru = $fark->days . ' gün';
                        elseif ($fark->days < 365) $ilanOmru = floor($fark->days / 30) . ' ay ' . ($fark->days % 30) . ' gün';
                        else $ilanOmru = floor($fark->days / 365) . ' yıl ' . floor(($fark->days % 365) / 30) . ' ay';
                    }

                    // Son görünme durumu
                    $sonGorunme = null;
                    if ($ilan['son_gorunme']) {
                        $sgFark = (new DateTime())->diff(new DateTime($ilan['son_gorunme']));
                        if ($sgFark->days == 0) $sonGorunme = 'Bugün';
                        elseif ($sgFark->days == 1) $sonGorunme = 'Dün';
                        elseif ($sgFark->days < 7) $sonGorunme = $sgFark->days . ' gün önce';
                        else $sonGorunme = formatTarih($ilan['son_gorunme'], 'd.m.Y');
                    }

                    $bilgiler = [
                        ['📍', 'Konum', implode(' / ', array_filter([$ilan['sehir'], $ilan['ilce'], $ilan['mahalle']]))],
                        ['📐', 'Metrekare', ($ilan['metrekare'] ? $ilan['metrekare'] . ' m²' : null)],
                        ['💰', 'm² Fiyat', ($m2Fiyat ? number_format($m2Fiyat, 0, ',', '.') . ' ₺/m²' : null)],
                        ['🚪', 'Oda Sayısı', $ilan['oda_sayisi']],
                        ['🏢', 'Kat', $ilan['kat']],
                        ['🏗️', 'Bina Yaşı', ($ilan['bina_yasi'] ? $ilan['bina_yasi'] . ' yıl' : null)],
                        ['🔥', 'Isıtma', $ilan['isitma_tipi']],
                        ['🪑', 'Eşya Durumu', $ilan['esya_durumu']],
                        ['📅', 'Eklenme', formatTarih($ilan['created_at'], 'd.m.Y')],
                        ['⏱️', 'İlan Ömrü', $ilanOmru],
                        ['👁️', 'Son Görülme', $sonGorunme],
                        ['📊', 'Fiyat Değişimi', ($ilan['fiyat_degisim_sayisi'] > 0 ? $ilan['fiyat_degisim_sayisi'] . ' kez' : null)],
                        ['👁️', 'Görüntülenme', $ilan['goruntulenme']],
                    ]; ?>
                    <?php foreach ($bilgiler as [$ikon, $etiket, $deger]): if (!$deger) continue; ?>
                    <div class="flex items-center justify-between py-1.5 border-b" style="border-color: rgba(255,255,255,0.04);">
                        <span style="color: #7a8599;"><?= $ikon ?> <?= $etiket ?></span>
                        <span style="color: #e8ecf4;"><?= e($deger) ?></span>
                    </div>
                    <?php endforeach; ?>
                </div>

                <!-- İlan Sahibi -->
                <?php if ($ilan['ilan_sahibi_ad'] || $ilan['ilan_sahibi_tel']): ?>
                <div class="mt-4 p-3 rounded-xl" style="background: rgba(255,255,255,0.03);">
                    <p class="text-xs font-semibold mb-1" style="color: #7a8599;">İlan Sahibi</p>
                    <?php if ($ilan['ilan_sahibi_ad']): ?><p class="text-sm" style="color: #e8ecf4;"><?= e($ilan['ilan_sahibi_ad']) ?></p><?php endif; ?>
                    <?php if ($ilan['ilan_sahibi_tel']): ?><p class="text-sm font-mono" style="color: #00d4ff;"><?= e($ilan['ilan_sahibi_tel']) ?></p><?php endif; ?>
                </div>
                <?php endif; ?>
            </div>

            <!-- ═══ AI DEĞERLEME KARTI ═══ -->
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(0,212,255,0.15);">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-semibold" style="color: #e8ecf4;">🤖 AI Değerleme</h3>
                    <button @click="aiCagir('ilan_degerle', <?= $id ?>)"
                            :disabled="aiYukleniyor.degerle"
                            class="text-xs px-3 py-1 rounded-lg transition-colors"
                            style="background: rgba(0,212,255,0.15); color: #00d4ff; border: 1px solid rgba(0,212,255,0.3);">
                        <span x-show="!aiYukleniyor.degerle">Değerle</span>
                        <span x-show="aiYukleniyor.degerle">⏳ Hesaplanıyor...</span>
                    </button>
                </div>
                <?php if (!empty($aiDeg) && isset($aiDeg['pazar_degeri'])): ?>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span style="color: #7a8599;">Pazar Değeri</span>
                        <span class="font-mono font-semibold" style="color: #00ff88;"><?= formatFiyat((float)($aiDeg['pazar_degeri'] ?? 0)) ?></span>
                    </div>
                    <?php
                        $fark = ($ilan['fiyat'] > 0 && ($aiDeg['pazar_degeri'] ?? 0) > 0)
                            ? round((($ilan['fiyat'] - $aiDeg['pazar_degeri']) / $aiDeg['pazar_degeri']) * 100)
                            : 0;
                        $farkRenk = $fark > 0 ? '#ff3366' : '#00ff88';
                        $farkLabel = $fark > 0 ? "+%{$fark} pahalı" : "%". abs($fark) . " uygun";
                    ?>
                    <div class="flex justify-between">
                        <span style="color: #7a8599;">Fark</span>
                        <span class="font-mono font-semibold" style="color: <?= $farkRenk ?>;"><?= $farkLabel ?></span>
                    </div>
                    <div class="flex justify-between">
                        <span style="color: #7a8599;">Pazarlık Skoru</span>
                        <span class="font-mono"><?= e($aiDeg['pazarlik_skoru'] ?? '-') ?>/100</span>
                    </div>
                    <div class="flex justify-between">
                        <span style="color: #7a8599;">Fırsat Seviyesi</span>
                        <?php
                            $fRenkMap = ['yuksek' => '#00ff88', 'orta' => '#ffaa00'];
                            $fRenk = $fRenkMap[$aiDeg['firsat_seviyesi'] ?? ''] ?? '#ff3366';
                        ?>
                        <span class="font-semibold" style="color:<?= $fRenk ?>;"><?= e(strtoupper($aiDeg['firsat_seviyesi'] ?? '-')) ?></span>
                    </div>
                    <?php if (!empty($aiDeg['degerleme_notu'])): ?>
                    <p class="text-xs mt-2 pt-2 border-t" style="border-color: rgba(255,255,255,0.04); color: #7a8599;"><?= e($aiDeg['degerleme_notu']) ?></p>
                    <?php endif; ?>
                    <?php if (!empty($aiDeg['tavsiye'])): ?>
                    <p class="text-xs italic" style="color: #00d4ff;"><?= e($aiDeg['tavsiye']) ?></p>
                    <?php endif; ?>
                </div>
                <?php else: ?>
                <p class="text-xs" style="color: #7a8599;">AI değerleme için "Değerle" butonuna tıklayın.</p>
                <?php endif; ?>
                <div x-show="aiSonuc.degerle" x-html="aiSonuc.degerle" class="mt-3"></div>
            </div>

            <!-- ═══ PAZARLIK SKORU (Satıcı Psikoloji) KARTI ═══ -->
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,170,0,0.15);">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-semibold" style="color: #e8ecf4;">🧠 Pazarlık Analizi</h3>
                    <button @click="aiCagir('satici_psikoloji', <?= $id ?>)"
                            :disabled="aiYukleniyor.psikoloji"
                            class="text-xs px-3 py-1 rounded-lg transition-colors"
                            style="background: rgba(255,170,0,0.15); color: #ffaa00; border: 1px solid rgba(255,170,0,0.3);">
                        <span x-show="!aiYukleniyor.psikoloji">Analiz Et</span>
                        <span x-show="aiYukleniyor.psikoloji">⏳ Analiz...</span>
                    </button>
                </div>
                <?php if ($psikoloji): ?>
                <div class="space-y-3">
                    <!-- Dairesel progress -->
                    <div class="flex items-center gap-4">
                        <div class="relative w-16 h-16 flex-shrink-0">
                            <svg class="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                                <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
                                <circle cx="32" cy="32" r="28" fill="none" stroke="#ffaa00" stroke-width="4"
                                        stroke-dasharray="<?= round(175.93 * ($psikoloji['pazarlik_motivasyonu'] ?? 0) / 100) ?> 175.93"
                                        stroke-linecap="round"/>
                            </svg>
                            <div class="absolute inset-0 flex items-center justify-center text-sm font-bold font-mono" style="color:#ffaa00;">
                                <?= (int)($psikoloji['pazarlik_motivasyonu'] ?? 0) ?>
                            </div>
                        </div>
                        <div>
                            <div class="text-xs" style="color:#7a8599;">Pazarlık Motivasyonu</div>
                            <div class="text-xs mt-1" style="color:#7a8599;">Aciliyet: <span class="font-mono" style="color:#e8ecf4;"><?= (int)($psikoloji['aciliyet_seviyesi'] ?? 5) ?>/10</span></div>
                            <div class="text-xs mt-0.5" style="color:#7a8599;">Tahmini Payı: <span class="font-mono" style="color:#00ff88;">%<?= (int)($psikoloji['tahmini_pazarlik_payi_yuzde'] ?? 0) ?></span></div>
                        </div>
                    </div>
                    <!-- İpuçları etiketleri -->
                    <?php if (!empty($psikoloji['tespit_edilen_ipuclari'])): ?>
                    <div class="flex flex-wrap gap-1.5">
                        <?php foreach ($psikoloji['tespit_edilen_ipuclari'] as $ipucu): ?>
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background:rgba(255,170,0,0.1);color:#ffaa00;border:1px solid rgba(255,170,0,0.2);">
                            <?= e($ipucu) ?>
                        </span>
                        <?php endforeach; ?>
                    </div>
                    <?php endif; ?>
                    <?php if (!empty($psikoloji['onerilen_yaklasim'])): ?>
                    <p class="text-xs pt-2 border-t" style="border-color:rgba(255,255,255,0.04);color:#7a8599;">
                        <strong style="color:#ffaa00;">Önerilen:</strong> <?= e($psikoloji['onerilen_yaklasim']) ?>
                    </p>
                    <?php endif; ?>
                </div>
                <?php else: ?>
                <p class="text-xs" style="color: #7a8599;">Satıcı psikolojisi analizi için "Analiz Et" tıklayın.</p>
                <?php endif; ?>
                <div x-show="aiSonuc.psikoloji" x-html="aiSonuc.psikoloji" class="mt-3"></div>
            </div>

            <!-- ═══ EMSAL DEĞER KARTI ═══ -->
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(0,255,136,0.15);">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-semibold" style="color: #e8ecf4;">📊 Emsal Değer</h3>
                    <button @click="aiCagir('emsal_deger', <?= $id ?>)"
                            :disabled="aiYukleniyor.emsal"
                            class="text-xs px-3 py-1 rounded-lg transition-colors"
                            style="background: rgba(0,255,136,0.15); color: #00ff88; border: 1px solid rgba(0,255,136,0.3);">
                        <span x-show="!aiYukleniyor.emsal">Hesapla</span>
                        <span x-show="aiYukleniyor.emsal">⏳ Hesap...</span>
                    </button>
                </div>
                <?php if ($emsalDeger && ($emsalDeger['tahmini_deger_tl'] ?? 0) > 0): ?>
                <div class="space-y-2 text-sm">
                    <?php
                        $emsalFark = ($ilan['fiyat'] > 0 && $emsalDeger['tahmini_deger_tl'] > 0)
                            ? (float)$ilan['fiyat'] - (float)$emsalDeger['tahmini_deger_tl']
                            : 0;
                        $emsalRenk = $emsalFark > 0 ? '#ff3366' : '#00ff88';
                    ?>
                    <div class="text-center p-3 rounded-xl" style="background:rgba(255,255,255,0.03);">
                        <div class="text-xs" style="color:#7a8599;">Tahmini Değer</div>
                        <div class="text-2xl font-bold font-mono mt-1" style="color:<?= $emsalRenk ?>;">
                            <?= number_format($emsalDeger['tahmini_deger_tl'], 0, ',', '.') ?> ₺
                        </div>
                        <div class="text-xs mt-1" style="color:#7a8599;">
                            <?= number_format($emsalDeger['guven_araligi_alt'] ?? 0, 0, ',', '.') ?> -
                            <?= number_format($emsalDeger['guven_araligi_ust'] ?? 0, 0, ',', '.') ?> ₺
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div class="p-2 rounded-lg text-center" style="background:rgba(255,255,255,0.03);">
                            <div style="color:#7a8599;">m² Birim Fiyat</div>
                            <div class="font-mono mt-0.5" style="color:#e8ecf4;"><?= number_format($emsalDeger['metrekare_birim_fiyat'] ?? 0, 0, ',', '.') ?> ₺</div>
                        </div>
                        <div class="p-2 rounded-lg text-center" style="background:rgba(255,255,255,0.03);">
                            <div style="color:#7a8599;">Bölge Ort.</div>
                            <div class="font-mono mt-0.5" style="color:#e8ecf4;"><?= number_format($emsalDeger['bolge_ortalamasi'] ?? 0, 0, ',', '.') ?> ₺</div>
                        </div>
                    </div>
                    <?php if (!empty($emsalDeger['degerlendirme'])): ?>
                    <p class="text-xs pt-2 border-t" style="border-color:rgba(255,255,255,0.04);color:#7a8599;"><?= e($emsalDeger['degerlendirme']) ?></p>
                    <?php endif; ?>
                </div>
                <?php else: ?>
                <p class="text-xs" style="color: #7a8599;">Emsal değer tahmini için "Hesapla" tıklayın.</p>
                <?php endif; ?>
                <div x-show="aiSonuc.emsal" x-html="aiSonuc.emsal" class="mt-3"></div>
            </div>

            <!-- İşlem Butonları -->
            <div class="grid grid-cols-2 gap-2">
                <a href="<?= APP_URL ?>/ilan-ekle.php?id=<?= $id ?>"
                   class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors"
                   style="background: rgba(0,212,255,0.08); color: #00d4ff; border: 1px solid rgba(0,212,255,0.2);">
                    ✏️ Düzenle
                </a>
                <button onclick="detayWhatsapp(<?= $id ?>)"
                        class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors"
                        style="background: rgba(0,255,136,0.08); color: #00ff88; border: 1px solid rgba(0,255,136,0.2);">
                    💬 WhatsApp
                </button>
                <a href="<?= APP_URL ?>/api/raporlar.php?action=gerceklik_tokadi&id=<?= $id ?>" target="_blank"
                   class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors"
                   style="background: rgba(139,92,246,0.08); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.2);">
                    📄 Rapor
                </a>
                <button @click="sesliNotAcik = !sesliNotAcik"
                        class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors"
                        style="background: rgba(255,51,102,0.08); color: #ff3366; border: 1px solid rgba(255,51,102,0.2);">
                    🎤 Sesli Not
                </button>
                <button id="eslestir-btn" onclick="otomatikEslestir(<?= $id ?>)"
                        class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors"
                        style="background: rgba(168,85,247,0.08); color: #a855f7; border: 1px solid rgba(168,85,247,0.2);">
                    🔗 Eşleştir
                </button>
                <button @click="silOnay = true"
                        class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors"
                        style="background: rgba(255,51,102,0.08); color: #ff3366; border: 1px solid rgba(255,51,102,0.2);">
                    🗑️ Sil
                </button>
            </div>

            <!-- Sesli Not Paneli -->
            <div x-show="sesliNotAcik" x-transition class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,51,102,0.2);">
                <h3 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">🎤 Sesli Not</h3>
                <input type="hidden" id="hedef_tip" value="ilan">
                <input type="hidden" id="hedef_id" value="<?= $id ?>">
                <div class="flex flex-col items-center gap-3">
                    <button id="record-btn" class="record-btn">
                        <span id="record-icon">🎙</span>
                    </button>
                    <span id="record-text" class="text-xs" style="color:#7a8599;">Kayıt başlatmak için tıkla</span>
                    <span id="record-timer" class="font-mono text-lg" style="color:#ff3366;">00:00</span>
                    <div id="waveform" class="waveform hidden">
                        <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
                        <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
                    </div>
                    <div id="transcript-box" class="hidden w-full">
                        <textarea id="transcript-text" class="glass-input w-full text-xs rounded-lg p-2" rows="3" readonly></textarea>
                        <div class="flex gap-2 mt-2">
                            <button id="copy-transcript" class="btn btn-ghost text-xs flex-1">📋 Kopyala</button>
                        </div>
                    </div>
                    <span id="kayit-status" class="text-xs" style="color:#7a8599;"></span>
                </div>
            </div>

            <!-- Silme Onayı -->
            <div x-show="silOnay" class="rounded-xl p-4 text-sm" style="background: rgba(255,51,102,0.08); border: 1px solid rgba(255,51,102,0.2);">
                <p class="mb-3" style="color: #ff3366;">Bu ilanı silmek istediğinizden emin misiniz?</p>
                <form method="POST">
                    <?= csrfField() ?>
                    <input type="hidden" name="action" value="sil">
                    <div class="flex gap-2">
                        <button type="submit" class="flex-1 py-2 rounded-lg text-xs font-medium"
                                style="background: rgba(255,51,102,0.2); color: #ff3366;">Evet, Sil</button>
                        <button type="button" @click="silOnay = false" class="flex-1 py-2 rounded-lg text-xs"
                                style="background: rgba(255,255,255,0.04); color: #7a8599;">İptal</button>
                    </div>
                </form>
            </div>

            <!-- Notlar -->
            <?php if ($ilan['notlar']): ?>
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h3 class="text-sm font-semibold mb-2" style="color: #e8ecf4;">📝 Notlar</h3>
                <p class="text-sm whitespace-pre-line" style="color: #7a8599;"><?= e($ilan['notlar']) ?></p>
            </div>
            <?php endif; ?>
        </div>
    </div>
    <!-- Fotoğraf Tam Ekran Modal -->
    <template x-if="modalAcik">
        <div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.92);"
             @click.self="modalAcik = false" @keydown.escape.window="modalAcik = false" @keydown.left.window="aktifFoto = (aktifFoto - 1 + fotoUrls.length) % fotoUrls.length" @keydown.right.window="aktifFoto = (aktifFoto + 1) % fotoUrls.length">

            <!-- Kapat butonu -->
            <button @click="modalAcik = false"
                    class="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white text-xl z-50 hover:bg-white/10 transition-colors"
                    style="background: rgba(0,0,0,0.5);">✕</button>

            <!-- Sayaç -->
            <div class="absolute top-4 left-4 px-3 py-1.5 rounded-full text-sm text-white z-50"
                 style="background: rgba(0,0,0,0.5);"
                 x-text="(aktifFoto + 1) + ' / ' + fotoUrls.length"></div>

            <!-- Önceki -->
            <button @click.stop="aktifFoto = (aktifFoto - 1 + fotoUrls.length) % fotoUrls.length"
                    class="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl z-50 hover:bg-white/10 transition-colors"
                    style="background: rgba(0,0,0,0.5);">‹</button>

            <!-- Sonraki -->
            <button @click.stop="aktifFoto = (aktifFoto + 1) % fotoUrls.length"
                    class="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl z-50 hover:bg-white/10 transition-colors"
                    style="background: rgba(0,0,0,0.5);">›</button>

            <!-- Tam ekran fotoğraf -->
            <img :src="fotoUrls[aktifFoto]"
                 class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
                 @click.stop="">
        </div>
    </template>

</main>

<!-- AI Çağrı JS -->
<script>
function aiCagir(islem, ilanId) {
    const anaVeri = Alpine.$data(document.querySelector('[x-data]'));
    const key = {fotograf_analiz: 'fotograf', ilan_degerle: 'degerle', satici_psikoloji: 'psikoloji', emsal_deger: 'emsal'}[islem] || islem;

    anaVeri.aiYukleniyor[key] = true;

    fetch('/api/ai.php?islem=' + islem, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ ilan_id: ilanId }),
    })
    .then(r => r.json())
    .then(data => {
        anaVeri.aiYukleniyor[key] = false;
        if (data.success) {
            showFlash('AI analiz tamamlandı.', 'success');
            // Sayfayı yenile (sonuçlar PHP'de render edilir)
            setTimeout(() => window.location.reload(), 1200);
        } else {
            showFlash(data.message || 'AI analiz başarısız.', 'error');
        }
    })
    .catch(() => {
        anaVeri.aiYukleniyor[key] = false;
        showFlash('Sunucu hatası.', 'error');
    });
}
</script>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
