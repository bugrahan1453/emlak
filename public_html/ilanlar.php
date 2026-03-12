<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user  = Auth::requireLogin();
$ctrl  = new IlanController();
$data  = $ctrl->index();

$gorunu = getVal('gorunum') ?: 'liste';
$sayfa  = max(1, (int)(getVal('sayfa') ?: 1));

$ilanModel = new Ilan();
$sehirler  = $ilanModel->getDistinctSehirler($user['ofis_id']);

$pageTitle = 'İlan Yönetimi';
$extraJs   = 'ilanlar.js';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 space-y-4" x-data="{ gorunu: '<?= e($gorunu) ?>', secili: [], tumSeciYon: false }">

    <!-- Başlık + Butonlar -->
    <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
            <h1 class="text-xl font-bold" style="color: #e8ecf4;">🏠 İlan Yönetimi</h1>
            <p class="text-xs mt-0.5" style="color: #7a8599;">
                Toplam <?= number_format($data['ilanlar']['toplam'], 0, ',', '.') ?> ilan
            </p>
        </div>
        <div class="flex items-center gap-2">
            <!-- Görünüm toggle -->
            <div class="flex rounded-xl overflow-hidden border" style="border-color: rgba(255,255,255,0.08);">
                <button @click="gorunu='liste'; window.location.href='?'+new URLSearchParams({...Object.fromEntries(new URLSearchParams(window.location.search)), gorunum:'liste'})"
                        :style="gorunu==='liste' ? 'background:rgba(0,212,255,0.15);color:#00d4ff;' : 'background:rgba(255,255,255,0.03);color:#7a8599;'"
                        class="px-3 py-2 text-xs transition-colors">☰ Liste</button>
                <button @click="gorunu='kart'; window.location.href='?'+new URLSearchParams({...Object.fromEntries(new URLSearchParams(window.location.search)), gorunum:'kart'})"
                        :style="gorunu==='kart' ? 'background:rgba(0,212,255,0.15);color:#00d4ff;' : 'background:rgba(255,255,255,0.03);color:#7a8599;'"
                        class="px-3 py-2 text-xs transition-colors">⊞ Kart</button>
            </div>
            <a href="<?= APP_URL ?>/ilan-ekle.php"
               class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
               style="background: rgba(0,212,255,0.15); color: #00d4ff; border: 1px solid rgba(0,212,255,0.3);">
                + Yeni İlan
            </a>
        </div>
    </div>

    <!-- Filtre Barı -->
    <?php
    $filtreler = [
        ['type' => 'select', 'name' => 'ilan_tipi', 'label' => 'İlan Tipi', 'options' => ['satilik' => 'Satılık', 'kiralik' => 'Kiralık']],
        ['type' => 'select', 'name' => 'emlak_tipi', 'label' => 'Emlak Tipi', 'options' => ['daire'=>'Daire','villa'=>'Villa','mustakil'=>'Müstakil','arsa'=>'Arsa','dukkan'=>'Dükkan','ofis'=>'Ofis']],
        ['type' => 'select', 'name' => 'sehir', 'label' => 'Şehir', 'options' => array_combine($sehirler, $sehirler)],
        ['type' => 'text', 'name' => 'ilce', 'label' => 'İlçe'],
        ['type' => 'select', 'name' => 'oda_sayisi', 'label' => 'Oda Sayısı', 'options' => ['1+1'=>'1+1','2+1'=>'2+1','3+1'=>'3+1','4+1'=>'4+1','5+1'=>'5+1']],
        ['type' => 'number', 'name' => 'fiyat_min', 'label' => 'Min Fiyat (₺)'],
        ['type' => 'number', 'name' => 'fiyat_max', 'label' => 'Max Fiyat (₺)'],
        ['type' => 'select', 'name' => 'durum', 'label' => 'Durum', 'options' => ['aktif'=>'Aktif','pasif'=>'Pasif','satildi'=>'Satıldı','kiralandi'=>'Kiralandı']],
        ['type' => 'select', 'name' => 'kaynak_site', 'label' => 'Kaynak', 'options' => ['sahibinden'=>'Sahibinden','hepsiemlak'=>'Hepsiemlak','emlakjet'=>'Emlakjet','manuel'=>'Manuel']],
        ['type' => 'text', 'name' => 'q', 'label' => 'Arama...'],
    ];
    include APP_DIR . '/views/components/filtre-bar.php';
    ?>

    <!-- Toplu İşlem Barı -->
    <div x-show="secili.length > 0" class="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
         style="background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.2);">
        <span style="color: #00d4ff;" x-text="secili.length + ' ilan seçildi'"></span>
        <button @click="topluDurumDegistir('aktif')" class="px-3 py-1 rounded-lg text-xs"
                style="background: rgba(0,255,136,0.15); color: #00ff88;">Aktif Yap</button>
        <button @click="topluDurumDegistir('pasif')" class="px-3 py-1 rounded-lg text-xs"
                style="background: rgba(255,170,0,0.15); color: #ffaa00;">Pasif Yap</button>
        <button @click="topluSil()" class="px-3 py-1 rounded-lg text-xs"
                style="background: rgba(255,51,102,0.15); color: #ff3366;">Sil</button>
        <button @click="secili=[]; tumSeciYon=false" class="ml-auto text-xs" style="color: #7a8599;">Temizle</button>
    </div>

    <!-- Liste Görünümü -->
    <div x-show="gorunu==='liste'">
        <?php
        $tabloHeaders = [
            ['label' => '', 'sortable' => false],
            ['label' => 'İlan', 'sortable' => true, 'key' => 'baslik'],
            ['label' => 'Fiyat', 'sortable' => true, 'key' => 'fiyat'],
            ['label' => 'Konum', 'sortable' => false],
            ['label' => 'm²', 'sortable' => true, 'key' => 'metrekare'],
            ['label' => 'Oda', 'sortable' => false],
            ['label' => 'Durum', 'sortable' => false],
            ['label' => 'Kaynak', 'sortable' => false],
            ['label' => 'Tarih', 'sortable' => true, 'key' => 'created_at'],
            ['label' => 'İşlem', 'sortable' => false],
        ];

        $tabloRows = [];
        foreach ($data['ilanlar']['data'] as $ilan) {
            $foto = is_array($ilan['fotograflar'] ?? null) && !empty($ilan['fotograflar'][0]) ? $ilan['fotograflar'][0] : null;
            $fotoUrl = $foto ? (strpos($foto, 'http') === 0 ? APP_URL . '/api/img-proxy.php?url=' . urlencode($foto) : APP_URL . '/uploads/fotograflar/' . basename($foto)) : null;
            $tabloRows[] = [
                // Checkbox
                '<input type="checkbox" x-model="secili" value="' . (int)$ilan['id'] . '" class="rounded">',
                // İlan
                '<div class="flex items-center gap-2">' .
                    '<div class="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style="background:rgba(255,255,255,0.05);">' .
                    ($fotoUrl ? '<img src="' . e($fotoUrl) . '" class="w-full h-full object-cover">' : '<div class="w-full h-full flex items-center justify-center">🏠</div>') .
                    '</div>' .
                    '<div><a href="' . APP_URL . '/ilan-detay.php?id=' . (int)$ilan['id'] . '" class="text-sm hover:text-cyan-400 transition-colors" style="color:#e8ecf4;">' . e(truncate($ilan['baslik'], 50)) . '</a>' .
                    '<p class="text-xs" style="color:#7a8599;">' . e($ilan['danisman_ad'] ?? 'Atanmamış') . '</p></div></div>',
                // Fiyat
                '<span class="font-mono font-semibold" style="color:#00d4ff;">' . formatFiyat((float)$ilan['fiyat']) . '</span>',
                // Konum
                '<span style="color:#7a8599;">📍 ' . e(($ilan['ilce'] ?? '') . ($ilan['mahalle'] ? '/' . $ilan['mahalle'] : '')) . '</span>',
                // m²
                e($ilan['metrekare'] ?? '-'),
                // Oda
                e($ilan['oda_sayisi'] ?? '-'),
                // Durum
                ilanDurumBadge($ilan['durum']),
                // Kaynak
                e(ucfirst($ilan['kaynak_site'] ?? '')),
                // Tarih
                '<span style="color:#7a8599;">' . zamanFarki($ilan['created_at']) . '</span>',
                // İşlem
                '<div class="flex gap-1">' .
                    '<a href="' . APP_URL . '/ilan-detay.php?id=' . (int)$ilan['id'] . '" class="px-2 py-1 text-xs rounded-lg" style="background:rgba(0,212,255,0.1);color:#00d4ff;">Detay</a>' .
                    '<a href="' . APP_URL . '/ilan-ekle.php?id=' . (int)$ilan['id'] . '" class="px-2 py-1 text-xs rounded-lg" style="background:rgba(255,255,255,0.04);color:#7a8599;">Düzenle</a>' .
                    '</div>',
            ];
        }
        $tabloToplam = $data['ilanlar']['toplam'];
        $tabloSayfa  = $sayfa;
        include APP_DIR . '/views/components/tablo.php';
        ?>
    </div>

    <!-- Kart Görünümü -->
    <div x-show="gorunu==='kart'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <?php foreach ($data['ilanlar']['data'] as $ilan):
            include APP_DIR . '/views/components/ilan-card.php';
        endforeach; ?>
    </div>

    <!-- Sayfalama -->
    <?= pagination($data['ilanlar']['toplam'], $sayfa, PER_PAGE, '?' . http_build_query(array_filter(array_diff_key($_GET, ['sayfa'=>''])))) ?>

</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
