<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$ofisId = Auth::ofisId();

$ilanModel = new Ilan();
$stats = $ilanModel->getRadarStats($ofisId);
$firsatlar = $ilanModel->getFirsatListesi($ofisId, 30);
$fiyatDusenler = $ilanModel->getSonFiyatDusenler($ofisId, 10);

$fotoUrl = function(?string $f): string {
    if (!$f) return '';
    return (strpos($f, 'http') === 0)
        ? APP_URL . '/api/img-proxy.php?url=' . urlencode($f)
        : APP_URL . '/uploads/fotograflar/' . basename($f);
};

$pageTitle = 'Piyasa Radarı';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 space-y-6">

    <div>
        <h1 class="text-xl font-bold" style="color: #e8ecf4;">Piyasa Radarı</h1>
        <p class="text-xs mt-0.5" style="color: #7a8599;">Fırsat analizi ve arama listesi</p>
    </div>

    <!-- Özet Kartlar -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <?php
        $kartlar = [
            ['label' => 'Toplam Aktif', 'deger' => number_format($stats['toplam_aktif'] ?? 0), 'renk' => '#00d4ff', 'bg' => 'rgba(0,212,255,0.08)', 'ikon' => '🏠'],
            ['label' => 'Bugün Eklenen', 'deger' => $stats['bugun_eklenen'] ?? 0, 'renk' => '#00ff88', 'bg' => 'rgba(0,255,136,0.08)', 'ikon' => '🆕'],
            ['label' => 'Fiyat Düşen', 'deger' => $stats['fiyat_dusen'] ?? 0, 'renk' => '#ff3366', 'bg' => 'rgba(255,51,102,0.08)', 'ikon' => '🔻', 'href' => 'ilanlar.php?fiyat_dusen=1'],
            ['label' => '30+ Gün Yayında', 'deger' => $stats['uzun_suredir'] ?? 0, 'renk' => '#ffaa00', 'bg' => 'rgba(255,170,0,0.08)', 'ikon' => '⏱️', 'href' => 'ilanlar.php?uzun_suredir=1'],
            ['label' => 'Kaldırılmış', 'deger' => $stats['kaldirilmis'] ?? 0, 'renk' => '#7a8599', 'bg' => 'rgba(122,133,153,0.08)', 'ikon' => '🪦', 'href' => 'ilanlar.php?son_gorulmeyen=1'],
        ];
        foreach ($kartlar as $k): ?>
        <a href="<?= APP_URL ?>/<?= $k['href'] ?? '#' ?>" class="rounded-2xl p-4 transition-all hover:scale-[1.02]"
           style="background: <?= $k['bg'] ?>; border: 1px solid <?= $k['renk'] ?>22;">
            <div class="text-2xl mb-1"><?= $k['ikon'] ?></div>
            <div class="text-2xl font-bold font-mono" style="color: <?= $k['renk'] ?>;"><?= $k['deger'] ?></div>
            <div class="text-xs mt-0.5" style="color: #7a8599;"><?= $k['label'] ?></div>
        </a>
        <?php endforeach; ?>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Sol: Fırsat Listesi (Arama Listesi) -->
        <div class="lg:col-span-2 space-y-4">
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-sm font-semibold" style="color: #e8ecf4;">🎯 Arama Listesi — Fırsat Skoruna Göre</h2>
                    <span class="text-xs px-2 py-1 rounded-full" style="background: rgba(0,255,136,0.1); color: #00ff88;">
                        <?= count($firsatlar) ?> ilan
                    </span>
                </div>

                <div class="space-y-2">
                    <?php foreach ($firsatlar as $idx => $f):
                        $foto = $fotoUrl($f['ana_foto'] ?? null);
                        $firsatRenk = $f['firsat_skor'] >= 60 ? '#00ff88' : ($f['firsat_skor'] >= 30 ? '#ffaa00' : '#7a8599');
                        $yorgunRenk = $f['yorgun_skor'] >= 60 ? '#ff3366' : ($f['yorgun_skor'] >= 30 ? '#ffaa00' : '#7a8599');
                    ?>
                    <a href="<?= APP_URL ?>/ilan-detay.php?id=<?= $f['id'] ?>"
                       class="flex items-center gap-3 p-3 rounded-xl transition-all hover:scale-[1.01]"
                       style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);">

                        <!-- Sıra -->
                        <div class="w-6 text-center text-xs font-bold" style="color: #7a8599;"><?= $idx + 1 ?></div>

                        <!-- Foto -->
                        <div class="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style="background: rgba(255,255,255,0.05);">
                            <?php if ($foto): ?>
                            <img src="<?= $foto ?>" class="w-full h-full object-cover" loading="lazy">
                            <?php else: ?>
                            <div class="w-full h-full flex items-center justify-center text-lg">🏠</div>
                            <?php endif; ?>
                        </div>

                        <!-- Bilgiler -->
                        <div class="flex-1 min-w-0">
                            <div class="text-sm truncate" style="color: #e8ecf4;"><?= e(mb_substr($f['baslik'], 0, 50)) ?></div>
                            <div class="text-xs mt-0.5" style="color: #7a8599;">
                                📍 <?= e(($f['ilce'] ?? '') . ($f['mahalle'] ? '/' . $f['mahalle'] : '')) ?>
                                <?php if ($f['oda_sayisi']): ?> · <?= e($f['oda_sayisi']) ?><?php endif; ?>
                                <?php if ($f['metrekare']): ?> · <?= $f['metrekare'] ?>m²<?php endif; ?>
                                · <?= $f['ilan_gun'] ?> gün
                            </div>
                        </div>

                        <!-- Fiyat -->
                        <div class="text-right flex-shrink-0">
                            <div class="text-sm font-mono font-semibold" style="color: #00d4ff;"><?= formatFiyat($f['fiyat']) ?></div>
                            <?php if ($f['toplam_dusus_pct'] > 0): ?>
                            <div class="text-xs" style="color: #ff3366;">🔻 %<?= $f['toplam_dusus_pct'] ?></div>
                            <?php elseif ($f['m2_ucuzluk_pct'] > 5 && $f['m2_ucuzluk_pct'] <= 30): ?>
                            <div class="text-xs" style="color: #00ff88;">m² %<?= round($f['m2_ucuzluk_pct'], 1) ?> ucuz</div>
                            <?php endif; ?>
                        </div>

                        <!-- Skorlar -->
                        <div class="flex flex-col gap-1 flex-shrink-0 w-16">
                            <div class="text-xs text-center px-1.5 py-0.5 rounded" style="background: <?= $firsatRenk ?>15; color: <?= $firsatRenk ?>;">
                                🎯 <?= $f['firsat_skor'] ?>
                            </div>
                            <div class="text-xs text-center px-1.5 py-0.5 rounded" style="background: <?= $yorgunRenk ?>15; color: <?= $yorgunRenk ?>;">
                                😩 <?= $f['yorgun_skor'] ?>
                            </div>
                        </div>

                        <!-- Telefon -->
                        <?php if ($f['ilan_sahibi_tel']): ?>
                        <div class="flex-shrink-0">
                            <span class="text-xs px-2 py-1 rounded-lg" style="background: rgba(0,212,255,0.1); color: #00d4ff;">
                                📞 <?= e($f['ilan_sahibi_tel']) ?>
                            </span>
                        </div>
                        <?php endif; ?>
                    </a>
                    <?php endforeach; ?>

                    <?php if (empty($firsatlar)): ?>
                    <div class="text-center py-8 text-sm" style="color: #7a8599;">
                        Henüz yeterli veri yok. Scraper çalıştıkça fırsat analizi otomatik güncellenecek.
                    </div>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- Sağ: Son Fiyat Düşenler + Skor Açıklama -->
        <div class="space-y-4">

            <!-- Skor Açıklama -->
            <div class="rounded-2xl p-4" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h3 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">📊 Skor Nasıl Hesaplanır?</h3>
                <div class="space-y-2 text-xs" style="color: #7a8599;">
                    <div class="flex items-start gap-2">
                        <span>🎯</span>
                        <div><strong style="color:#00ff88;">Fırsat Skoru:</strong> m² fiyat mahalle ortalamasının ne kadar altında + satıcı ne kadar yorgun + kaç kez fiyat düşürmüş</div>
                    </div>
                    <div class="flex items-start gap-2">
                        <span>😩</span>
                        <div><strong style="color:#ff3366;">Yorgun Satıcı:</strong> İlan ne kadar süredir yayında + kaç kez fiyat indirmiş = satıcı pazarlığa açık</div>
                    </div>
                    <div class="mt-2 pt-2 border-t" style="border-color: rgba(255,255,255,0.06);">
                        <strong style="color:#e8ecf4;">60+</strong> = Güçlü fırsat · <strong style="color:#e8ecf4;">30-59</strong> = Orta · <strong style="color:#e8ecf4;">0-29</strong> = Düşük
                    </div>
                </div>
            </div>

            <!-- Son Fiyat Düşenler -->
            <div class="rounded-2xl p-4" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,51,102,0.1);">
                <h3 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">🔻 Son Fiyat Düşenler</h3>
                <div class="space-y-2">
                    <?php foreach ($fiyatDusenler as $fd): ?>
                    <a href="<?= APP_URL ?>/ilan-detay.php?id=<?= $fd['id'] ?>"
                       class="flex items-center justify-between p-2 rounded-lg transition-all hover:bg-white/5"
                       style="border: 1px solid rgba(255,255,255,0.03);">
                        <div class="flex-1 min-w-0">
                            <div class="text-xs truncate" style="color: #e8ecf4;"><?= e(mb_substr($fd['baslik'], 0, 35)) ?></div>
                            <div class="text-xs" style="color: #7a8599;"><?= e($fd['ilce'] ?? '') ?></div>
                        </div>
                        <div class="text-right flex-shrink-0 ml-2">
                            <div class="text-xs font-mono" style="color: #00d4ff;"><?= formatFiyat($fd['fiyat']) ?></div>
                            <?php if ($fd['dusus_pct'] > 0): ?>
                            <div class="text-xs font-semibold" style="color: #ff3366;">🔻 %<?= $fd['dusus_pct'] ?></div>
                            <?php endif; ?>
                        </div>
                    </a>
                    <?php endforeach; ?>

                    <?php if (empty($fiyatDusenler)): ?>
                    <p class="text-xs text-center py-4" style="color: #7a8599;">Henüz fiyat düşüşü tespit edilmedi.</p>
                    <?php endif; ?>
                </div>
            </div>

        </div>
    </div>

</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
