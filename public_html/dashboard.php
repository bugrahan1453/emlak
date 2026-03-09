<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();

// Verileri çek
$ilanModel    = new Ilan();
$gorevModel   = new Gorev();
$eslestirme   = new Eslestirme();
$perfModel    = new Performans();
$bildirimModel= new Bildirim();
$aramaModel   = new Arama();

$ilanStats     = $ilanModel->getDashboardStats($user['ofis_id']);
$sonIlanlar    = $ilanModel->getSonIlanlar($user['ofis_id'], 20);
$bugunGorevler = $gorevModel->getBugunGorevler($user['ofis_id'], Auth::isBrokerOrAdmin() ? null : $user['user_id']);
$danismanlar   = $perfModel->getSkorTablosu($user['ofis_id'], 'ay');
$sonEslestirmeler = $eslestirme->getSonEslestirmeler($user['ofis_id'], 5);
$kirmiziAlarmlari = $ilanModel->getKirmiziAlarmlari($user['ofis_id']);
$aramaCount    = $aramaModel->getBugunSayisi($user['user_id']);

// KPI sparkline verileri (son 7 gün)
$sparkIlanlar  = [];
$sparkAramalar = [];
try {
    $pdo = db();
    for ($i = 6; $i >= 0; $i--) {
        $d = date('Y-m-d', strtotime("-$i days"));
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM ilanlar WHERE ofis_id = ? AND DATE(created_at) = ?");
        $stmt->execute([$user['ofis_id'], $d]);
        $sparkIlanlar[] = (int)$stmt->fetchColumn();

        $stmt2 = $pdo->prepare("SELECT COUNT(*) FROM aramalar WHERE ofis_id = ? AND DATE(created_at) = ?");
        $stmt2->execute([$user['ofis_id'], $d]);
        $sparkAramalar[] = (int)$stmt2->fetchColumn();
    }
} catch (Exception $e) {}

$pageTitle = 'Dashboard';
$extraJs   = 'dashboard.js';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 space-y-6">

    <!-- Sayfa başlığı -->
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-xl font-bold" style="color: #e8ecf4;">Dashboard</h1>
            <p class="text-sm mt-0.5" style="color: #7a8599;"><?= date('d F Y, l', time()) ?></p>
        </div>
        <div class="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
             style="background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid rgba(0,255,136,0.2);">
            <span class="w-2 h-2 rounded-full animate-pulse" style="background: #00ff88;"></span>
            Canlı Takip
        </div>
    </div>

    <!-- KPI Kartları -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <?php
        $kpiTitle = 'Takipteki İlan'; $kpiValue = number_format($ilanStats['toplam_aktif'] ?? 0, 0, ',', '.'); $kpiSub = '+' . ($ilanStats['bugun_eklenen'] ?? 0) . ' bugün eklendi'; $kpiIcon = '📡'; $kpiColor = 'cyan'; $kpiSparkline = $sparkIlanlar;
        include APP_DIR . '/views/components/kpi-card.php';
        $kpiTitle = 'Bugün Gelen Fırsatlar'; $kpiValue = (string)($ilanStats['bugun_eklenen'] ?? 0); $kpiSub = 'yeni ilan tespit edildi'; $kpiIcon = '🔥'; $kpiColor = 'green'; $kpiSparkline = array_slice($sparkIlanlar, -4);
        include APP_DIR . '/views/components/kpi-card.php';
        $kpiTitle = 'Bugünkü Aramalar'; $kpiValue = (string)$aramaCount; $kpiSub = 'toplam arama yapıldı'; $kpiIcon = '📞'; $kpiColor = 'amber'; $kpiSparkline = $sparkAramalar;
        include APP_DIR . '/views/components/kpi-card.php';
        $kpiTitle = 'Kırmızı Alarm'; $kpiValue = (string)count($kirmiziAlarmlari); $kpiSub = 'emsal altı fırsat'; $kpiIcon = '🚨'; $kpiColor = 'red'; $kpiSparkline = [];
        include APP_DIR . '/views/components/kpi-card.php';
        ?>
    </div>

    <!-- Ana Grid: Canlı İlan Akışı + Akıllı Uyarılar -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Canlı İlan Akışı (geniş) -->
        <div class="lg:col-span-2 rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
            <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color: rgba(255,255,255,0.06);">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold" style="color: #e8ecf4;">📡 Canlı İlan Akışı</span>
                    <span class="w-2 h-2 rounded-full animate-pulse" style="background: #00d4ff;"></span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs" style="color: #7a8599;" id="son-guncelleme">Az önce güncellendi</span>
                    <a href="<?= APP_URL ?>/ilanlar.php" class="text-xs" style="color: #00d4ff;">Tümü →</a>
                </div>
            </div>

            <div class="overflow-y-auto max-h-96" id="ilan-akis">
                <?php foreach ($sonIlanlar as $ilan):
                    $foto = is_array($ilan['fotograflar'] ?? null) && !empty($ilan['fotograflar'][0]) ? $ilan['fotograflar'][0] : null;
                    $etiket = '';
                    if (strtotime($ilan['created_at']) > strtotime('-24 hours')) $etiket = '<span class="text-xs px-1.5 py-0.5 rounded font-bold" style="background:rgba(0,212,255,0.15);color:#00d4ff;">YENİ</span>';
                    elseif (($ilan['pazarlik_skoru'] ?? 0) >= 70) $etiket = '<span class="text-xs px-1.5 py-0.5 rounded font-bold" style="background:rgba(0,255,136,0.15);color:#00ff88;">FIRSAT</span>';
                    elseif ($ilan['durum'] === 'silindi') $etiket = '<span class="text-xs px-1.5 py-0.5 rounded font-bold" style="background:rgba(255,51,102,0.15);color:#ff3366;">SİLİNDİ</span>';
                ?>
                <div class="flex items-center gap-3 px-4 py-3 border-b hover:bg-white/2 transition-colors" style="border-color: rgba(255,255,255,0.04);">
                    <!-- Thumbnail -->
                    <div class="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style="background: rgba(255,255,255,0.05);">
                        <?php if ($foto): ?>
                        <img src="<?= APP_URL ?>/uploads/fotograflar/<?= e(basename($foto)) ?>" class="w-full h-full object-cover" loading="lazy">
                        <?php else: ?>
                        <div class="w-full h-full flex items-center justify-center text-xl">🏠</div>
                        <?php endif; ?>
                    </div>

                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-0.5">
                            <a href="<?= APP_URL ?>/ilan-detay.php?id=<?= (int)$ilan['id'] ?>"
                               class="text-sm font-medium truncate hover:text-cyan-400 transition-colors" style="color: #e8ecf4;">
                                <?= e($ilan['baslik']) ?>
                            </a>
                            <?= $etiket ?>
                        </div>
                        <div class="flex items-center gap-3 text-xs" style="color: #7a8599;">
                            <span class="font-mono font-semibold" style="color: #00d4ff;"><?= formatFiyat((float)$ilan['fiyat']) ?></span>
                            <span>📍 <?= e($ilan['ilce'] ?? $ilan['sehir']) ?></span>
                            <?php if ($ilan['metrekare']): ?><span>📐 <?= e($ilan['metrekare']) ?> m²</span><?php endif; ?>
                            <span class="ml-auto"><?= zamanFarki($ilan['created_at']) ?></span>
                        </div>
                    </div>

                    <div class="text-xs" style="color: #7a8599;"><?= e(ucfirst($ilan['kaynak_site'] ?? '')) ?></div>
                </div>
                <?php endforeach; ?>
                <?php if (empty($sonIlanlar)): ?>
                <div class="px-4 py-12 text-center text-sm" style="color: #7a8599;">Henüz ilan yok.</div>
                <?php endif; ?>
            </div>
        </div>

        <!-- Akıllı Uyarılar -->
        <div class="rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
            <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color: rgba(255,255,255,0.06);">
                <span class="text-sm font-semibold" style="color: #e8ecf4;">⚡ Akıllı Uyarılar</span>
            </div>

            <div class="overflow-y-auto max-h-96 p-3 space-y-2">
                <?php foreach ($kirmiziAlarmlari as $alarm): ?>
                <div class="flex gap-3 p-3 rounded-xl" style="background: rgba(255,51,102,0.06); border: 1px solid rgba(255,51,102,0.15);">
                    <span class="text-base flex-shrink-0">🚨</span>
                    <div class="min-w-0">
                        <p class="text-xs font-semibold truncate" style="color: #ff3366;">Kırmızı Alarm</p>
                        <p class="text-xs truncate mt-0.5" style="color: #7a8599;"><?= e(truncate($alarm['baslik'] ?? '', 60)) ?></p>
                        <p class="text-xs mt-1 font-mono" style="color: #e8ecf4;">
                            <?= formatFiyat((float)($alarm['fiyat'] ?? 0)) ?>
                            <span style="color: #00ff88;">↓ emsal altı</span>
                        </p>
                    </div>
                </div>
                <?php endforeach; ?>

                <?php foreach (array_slice($sonEslestirmeler, 0, 3) as $e): ?>
                <div class="flex gap-3 p-3 rounded-xl" style="background: rgba(139,92,246,0.06); border: 1px solid rgba(139,92,246,0.15);">
                    <span class="text-base flex-shrink-0">🔗</span>
                    <div class="min-w-0">
                        <p class="text-xs font-semibold" style="color: #8b5cf6;">Eşleştirme</p>
                        <p class="text-xs truncate mt-0.5" style="color: #7a8599;">
                            <?= e($e['musteri_ad']) ?> ↔ <?= e(truncate($e['ilan_baslik'], 40)) ?>
                        </p>
                        <p class="text-xs mt-1" style="color: #e8ecf4;">%<?= (int)$e['skor'] ?> uyum</p>
                    </div>
                </div>
                <?php endforeach; ?>

                <?php if (empty($kirmiziAlarmlari) && empty($sonEslestirmeler)): ?>
                <div class="px-4 py-12 text-center text-sm" style="color: #7a8599;">Yeni uyarı yok.</div>
                <?php endif; ?>
            </div>
        </div>
    </div>

    <!-- Alt Grid: Görevler + Danışmanlar + Eşleştirmeler -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Bugünün Görevleri -->
        <div class="rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
            <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color: rgba(255,255,255,0.06);">
                <span class="text-sm font-semibold" style="color: #e8ecf4;">✅ Bugünün Görevleri</span>
                <a href="<?= APP_URL ?>/gorevler.php" class="text-xs" style="color: #00d4ff;">Tümü →</a>
            </div>
            <div class="p-3 space-y-2 max-h-80 overflow-y-auto">
                <?php foreach ($bugunGorevler as $gorev):
                    include APP_DIR . '/views/components/gorev-card.php';
                endforeach; ?>
                <?php if (empty($bugunGorevler)): ?>
                <div class="py-8 text-center text-sm" style="color: #7a8599;">Bugün görev yok 🎉</div>
                <?php endif; ?>
            </div>
        </div>

        <!-- Danışman Skor Tablosu -->
        <div class="rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
            <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color: rgba(255,255,255,0.06);">
                <span class="text-sm font-semibold" style="color: #e8ecf4;">🏆 Skor Tablosu</span>
                <a href="<?= APP_URL ?>/performans.php" class="text-xs" style="color: #00d4ff;">Detay →</a>
            </div>
            <div class="p-3 space-y-2">
                <?php foreach (array_slice($danismanlar, 0, 5) as $i => $d):
                    $madalya = ['🥇','🥈','🥉'][$i] ?? ($i + 1 . '.');
                    $initials = '';
                    $parts = explode(' ', trim($d['ad_soyad']));
                    foreach (array_slice($parts, 0, 2) as $p) $initials .= mb_strtoupper(mb_substr($p, 0, 1));
                ?>
                <div class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/2 transition-colors">
                    <span class="text-lg w-8 text-center"><?= $madalya ?></span>
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                         style="background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(139,92,246,0.2)); color: #00d4ff;">
                        <?= e($initials) ?>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-medium truncate" style="color: #e8ecf4;"><?= e($d['ad_soyad']) ?></p>
                        <p class="text-xs" style="color: #7a8599;"><?= (int)$d['arama_sayisi'] ?> arama · <?= (int)$d['gosterim_sayisi'] ?> gösterim</p>
                    </div>
                    <div class="text-sm font-bold font-mono" style="color: #00d4ff;"><?= number_format((float)$d['efor_skoru'], 0) ?></div>
                </div>
                <?php endforeach; ?>
                <?php if (empty($danismanlar)): ?>
                <div class="py-8 text-center text-sm" style="color: #7a8599;">Performans verisi yok.</div>
                <?php endif; ?>
            </div>
        </div>

        <!-- Son Eşleştirmeler -->
        <div class="rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
            <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color: rgba(255,255,255,0.06);">
                <span class="text-sm font-semibold" style="color: #e8ecf4;">🔗 Son Eşleştirmeler</span>
                <a href="<?= APP_URL ?>/eslestirmeler.php" class="text-xs" style="color: #00d4ff;">Tümü →</a>
            </div>
            <div class="p-3 space-y-2">
                <?php foreach ($sonEslestirmeler as $es):
                    $skorRenk = $es['skor'] >= 80 ? '#00ff88' : ($es['skor'] >= 60 ? '#ffaa00' : '#ff3366');
                ?>
                <div class="p-3 rounded-xl" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);">
                    <div class="flex items-start justify-between gap-2 mb-2">
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-medium truncate" style="color: #e8ecf4;"><?= e($es['musteri_ad']) ?></p>
                            <p class="text-xs truncate" style="color: #7a8599;"><?= e(truncate($es['ilan_baslik'], 40)) ?></p>
                        </div>
                        <div class="text-xs font-bold font-mono px-2 py-0.5 rounded-full"
                             style="background: <?= $skorRenk ?>22; color: <?= $skorRenk ?>; border: 1px solid <?= $skorRenk ?>44; white-space: nowrap;">
                            %<?= (int)$es['skor'] ?>
                        </div>
                    </div>
                    <div class="flex items-center justify-between text-xs" style="color: #7a8599;">
                        <span><?= formatFiyat((float)$es['fiyat']) ?></span>
                        <span><?= zamanFarki($es['created_at']) ?></span>
                    </div>
                </div>
                <?php endforeach; ?>
                <?php if (empty($sonEslestirmeler)): ?>
                <div class="py-8 text-center text-sm" style="color: #7a8599;">Eşleştirme yok.</div>
                <?php endif; ?>
            </div>
        </div>
    </div>

</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
