<?php
$currentPage = basename($_SERVER['PHP_SELF'], '.php');
$user = Auth::user();
$gorevSayisi = 0;
$bildirimSayisi = 0;
$eslestirmeBekleyen = 0;
$bugunIlan = 0;

try {
    $gorevModel = new Gorev();
    $gorevSayisi = $gorevModel->getBugunSayisi(Auth::ofisId(), Auth::isBrokerOrAdmin() ? null : Auth::id());
    $bildirimModel = new Bildirim();
    $bildirimSayisi = $bildirimModel->getOkunmamisSayisi(Auth::id());
    $eslestirmeModel = new Eslestirme();
    $eslestirmeBekleyen = $eslestirmeModel->getBekleyenSayisi(Auth::ofisId());
    $ilanModel = new Ilan();
    $ilanStats = $ilanModel->getDashboardStats(Auth::ofisId());
    $bugunIlan = $ilanStats['bugun_eklenen'] ?? 0;
} catch (Exception $e) {}

$menuItems = [
    ['href' => 'dashboard.php',      'icon' => '📊', 'label' => 'Dashboard',        'id' => 'dashboard'],
    ['href' => 'ilanlar.php',        'icon' => '📡', 'label' => 'Piyasa Radarı',    'id' => 'ilanlar',  'badge' => $bugunIlan > 0 ? $bugunIlan : null, 'badge_color' => 'cyan'],
    ['href' => 'ilan-ekle.php',      'icon' => '🏠', 'label' => 'İlan Yönetimi',    'id' => 'ilan-ekle'],
    ['href' => 'eslestirmeler.php',  'icon' => '🔗', 'label' => 'Eşleştirmeler',    'id' => 'eslestirmeler', 'badge' => $eslestirmeBekleyen > 0 ? $eslestirmeBekleyen : null, 'badge_color' => 'purple'],
    ['href' => 'gorevler.php',       'icon' => '✅', 'label' => 'Görev Merkezi',    'id' => 'gorevler',  'badge' => $gorevSayisi > 0 ? $gorevSayisi : null, 'badge_color' => 'amber'],
    ['href' => 'musteriler.php',     'icon' => '📇', 'label' => 'Müşteri CRM',      'id' => 'musteriler'],
    ['href' => 'performans.php',     'icon' => '📈', 'label' => 'Performans',        'id' => 'performans'],
    ['href' => 'raporlar.php',       'icon' => '📄', 'label' => 'Rapor Üretici',    'id' => 'raporlar'],
    ['href' => 'ayarlar.php',        'icon' => '⚙️', 'label' => 'Ayarlar',           'id' => 'ayarlar'],
];
?>
<!-- Sidebar Overlay (mobil) -->
<div id="sidebarOverlay" class="fixed inset-0 bg-black/60 z-30 lg:hidden hidden" onclick="toggleSidebar()"></div>

<!-- Sidebar -->
<aside id="sidebar" class="fixed top-0 left-0 h-full w-64 z-40 flex flex-col transition-transform duration-300 -translate-x-full lg:translate-x-0"
       style="background: rgba(10,16,42,0.97); border-right: 1px solid rgba(255,255,255,0.06); backdrop-filter: blur(20px);">

    <!-- Logo -->
    <div class="flex items-center gap-3 px-6 py-5 border-b" style="border-color: rgba(255,255,255,0.06);">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style="background: linear-gradient(135deg, #00d4ff22, #8b5cf622);">
            📡
        </div>
        <div>
            <div class="font-bold text-sm" style="color: #e8ecf4;">EmlakRadar Pro</div>
            <div class="text-xs" style="color: #7a8599;"><?= e($user['ofis_ad'] ?? '') ?></div>
        </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto py-4 px-3">
        <?php foreach ($menuItems as $item):
            $isActive = $currentPage === $item['id'];
        ?>
        <a href="<?= APP_URL ?>/<?= $item['href'] ?>"
           class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm transition-all duration-200 <?= $isActive ? 'sidebar-item-active' : '' ?>"
           style="<?= $isActive ? 'background: rgba(0,212,255,0.08); color: #00d4ff; border-left: 3px solid #00d4ff;' : 'color: #7a8599; border-left: 3px solid transparent;' ?>">
            <span class="text-base w-5 text-center"><?= $item['icon'] ?></span>
            <span class="flex-1 font-medium"><?= e($item['label']) ?></span>
            <?php if (!empty($item['badge'])): ?>
            <span class="text-xs px-1.5 py-0.5 rounded-full font-bold"
                  style="<?= match($item['badge_color'] ?? 'gray') {
                      'cyan'   => 'background: rgba(0,212,255,0.15); color: #00d4ff;',
                      'amber'  => 'background: rgba(255,170,0,0.15); color: #ffaa00;',
                      'purple' => 'background: rgba(139,92,246,0.15); color: #8b5cf6;',
                      'red'    => 'background: rgba(255,51,102,0.15); color: #ff3366;',
                      default  => 'background: rgba(255,255,255,0.1); color: #e8ecf4;',
                  } ?>">
                <?= e($item['badge']) ?>
            </span>
            <?php endif; ?>
        </a>
        <?php endforeach; ?>
    </nav>

    <!-- User Info -->
    <div class="px-4 py-4 border-t" style="border-color: rgba(255,255,255,0.06);">
        <a href="<?= APP_URL ?>/ayarlar.php" class="flex items-center gap-3 group">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                 style="background: linear-gradient(135deg, #00d4ff33, #8b5cf633); color: #00d4ff;">
                <?php
                $initials = '';
                $parts = explode(' ', trim($user['ad_soyad'] ?? ''));
                foreach (array_slice($parts, 0, 2) as $p) $initials .= mb_strtoupper(mb_substr($p, 0, 1));
                echo e($initials);
                ?>
            </div>
            <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate" style="color: #e8ecf4;"><?= e($user['ad_soyad'] ?? '') ?></div>
                <div class="text-xs truncate" style="color: #7a8599;"><?= e(ucfirst($user['rol'] ?? '')) ?></div>
            </div>
            <a href="<?= APP_URL ?>/logout.php" class="text-xs hover:text-red-400 transition-colors" style="color: #7a8599;" title="Çıkış">⎋</a>
        </a>
    </div>
</aside>
