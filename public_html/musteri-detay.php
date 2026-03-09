<?php
require_once dirname(__DIR__) . '/app/config/app.php';

$user = Auth::requireLogin();
$id   = (int)(getVal('id') ?: 0);
if (!$id) { redirect(APP_URL . '/musteriler.php'); }

$ctrl = new MusteriController();
$data = $ctrl->show($id);
if (!$data) { flashMessage('error', 'Müşteri bulunamadı.'); redirect(APP_URL . '/musteriler.php'); }

$musteri = $data['musteri'];
$eslestirmeler = $data['eslestirmeler'];
$aramalar = $data['aramalar'];

$pageTitle = $musteri['ad_soyad'];
$extraJs   = 'sesli-not.js';
require_once APP_DIR . '/views/layout/header.php';
?>
<div class="flex" id="app-wrapper">
<?php require_once APP_DIR . '/views/layout/sidebar.php'; ?>
<div class="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main-content">
<?php require_once APP_DIR . '/views/layout/topbar.php'; ?>
<?php require_once APP_DIR . '/views/components/bildirim-popup.php'; ?>

<main class="flex-1 p-4 lg:p-6 pb-20 lg:pb-6" x-data="{ sesliNotAcik: false }">
    <div class="flex items-center gap-2 text-xs mb-4" style="color: #7a8599;">
        <a href="<?= APP_URL ?>/musteriler.php" class="hover:text-cyan-400">Müşteriler</a>
        <span>›</span>
        <span style="color: #e8ecf4;"><?= e($musteri['ad_soyad']) ?></span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Sol: Profil -->
        <div class="space-y-4">
            <!-- Profil Kartı -->
            <div class="rounded-2xl p-5 text-center" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <?php
                $initials = '';
                $parts = explode(' ', trim($musteri['ad_soyad']));
                foreach (array_slice($parts, 0, 2) as $p) $initials .= mb_strtoupper(mb_substr($p, 0, 1));
                ?>
                <div class="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3"
                     style="background: linear-gradient(135deg, rgba(0,212,255,0.3), rgba(139,92,246,0.3)); color: #00d4ff;">
                    <?= e($initials) ?>
                </div>
                <h2 class="font-semibold" style="color: #e8ecf4;"><?= e($musteri['ad_soyad']) ?></h2>
                <div class="mt-1"><?= musteriTipBadge($musteri['tip']) ?></div>
                <?php if ($musteri['puan']): ?>
                <div class="text-sm mt-2" style="color: #ffaa00;">⭐ <?= e($musteri['puan']) ?> puan</div>
                <?php endif; ?>

                <div class="mt-4 space-y-2 text-sm text-left">
                    <div class="flex items-center gap-2 px-3 py-2 rounded-xl" style="background: rgba(255,255,255,0.03);">
                        <span>📞</span><span style="color: #00d4ff;" class="font-mono"><?= e($musteri['telefon']) ?></span>
                    </div>
                    <?php if ($musteri['email']): ?>
                    <div class="flex items-center gap-2 px-3 py-2 rounded-xl" style="background: rgba(255,255,255,0.03);">
                        <span>✉️</span><span style="color: #7a8599;"><?= e($musteri['email']) ?></span>
                    </div>
                    <?php endif; ?>
                </div>

                <div class="flex gap-2 mt-4">
                    <a href="<?= APP_URL ?>/musteri-ekle.php?id=<?= $id ?>" class="flex-1 py-2 text-xs rounded-xl text-center" style="background:rgba(0,212,255,0.1);color:#00d4ff;border:1px solid rgba(0,212,255,0.2);">Düzenle</a>
                    <a href="tel:<?= e($musteri['telefon']) ?>" class="flex-1 py-2 text-xs rounded-xl text-center" style="background:rgba(0,255,136,0.1);color:#00ff88;border:1px solid rgba(0,255,136,0.2);">Ara</a>
                </div>
                <!-- Sesli Not Butonu -->
                <button @click="sesliNotAcik = !sesliNotAcik"
                        class="w-full py-2 text-xs rounded-xl mt-2 transition-colors"
                        style="background:rgba(255,51,102,0.1);color:#ff3366;border:1px solid rgba(255,51,102,0.2);">
                    🎤 Sesli Not
                </button>
            </div>

            <!-- Sesli Not Paneli -->
            <div x-show="sesliNotAcik" x-transition class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,51,102,0.2);">
                <h3 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">🎤 Sesli Not</h3>
                <input type="hidden" id="hedef_tip" value="musteri">
                <input type="hidden" id="hedef_id" value="<?= $id ?>">
                <input type="hidden" id="musteri_id" value="<?= $id ?>">
                <input type="hidden" id="telefon" value="<?= e($musteri['telefon']) ?>">
                <div class="flex flex-col items-center gap-3">
                    <button id="record-btn" class="record-btn">
                        <span id="record-icon">🎙</span>
                    </button>
                    <span id="record-text" class="text-xs" style="color:#7a8599;">Kayıt başlat</span>
                    <span id="record-timer" class="font-mono text-lg" style="color:#ff3366;">00:00</span>
                    <div id="waveform" class="waveform hidden">
                        <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
                        <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
                    </div>
                    <div id="transcript-box" class="hidden w-full">
                        <textarea id="transcript-text" class="glass-input w-full text-xs rounded-lg p-2" rows="3" readonly></textarea>
                        <div class="flex gap-2 mt-2">
                            <button id="copy-transcript" class="btn btn-ghost text-xs flex-1">📋 Kopyala</button>
                            <button id="gorev-olustur" class="btn btn-accent text-xs flex-1">📌 Görev Oluştur</button>
                        </div>
                    </div>
                    <span id="kayit-status" class="text-xs" style="color:#7a8599;"></span>
                </div>
            </div>

            <!-- Tercihler -->
            <?php $tercihler = is_string($musteri['tercihler']) ? json_decode($musteri['tercihler'], true) : ($musteri['tercihler'] ?? []); ?>
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h3 class="text-sm font-semibold mb-3" style="color: #e8ecf4;">🎯 Tercihler</h3>
                <?php if (!empty($tercihler)): ?>
                <div class="space-y-2 text-sm">
                    <?php if ($musteri['butce_min'] || $musteri['butce_max']): ?>
                    <div class="flex justify-between">
                        <span style="color:#7a8599;">💰 Bütçe</span>
                        <span class="font-mono" style="color:#00d4ff;">
                            <?php if ($musteri['butce_min']): ?><?= number_format($musteri['butce_min'],0,',','.') ?> -<?php endif; ?>
                            <?= number_format($musteri['butce_max'],0,',','.') ?> ₺
                        </span>
                    </div>
                    <?php endif; ?>
                    <?php foreach ($tercihler as $k => $v): if (!$v) continue; ?>
                    <div class="flex justify-between">
                        <span style="color:#7a8599;"><?= e($k) ?></span>
                        <span style="color:#e8ecf4;"><?= e(is_array($v) ? implode(', ', $v) : $v) ?></span>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php else: ?>
                <p class="text-xs" style="color:#7a8599;">Tercih girilmemiş.</p>
                <?php endif; ?>
            </div>

            <?php if ($musteri['notlar']): ?>
            <div class="rounded-2xl p-5" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <h3 class="text-sm font-semibold mb-2" style="color: #e8ecf4;">📝 Notlar</h3>
                <p class="text-sm whitespace-pre-line" style="color:#7a8599;"><?= e($musteri['notlar']) ?></p>
            </div>
            <?php endif; ?>
        </div>

        <!-- Sağ: Geçmiş -->
        <div class="lg:col-span-2 space-y-4">

            <!-- Eşleştirme Geçmişi -->
            <div class="rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <div class="px-4 py-3 border-b" style="border-color: rgba(255,255,255,0.06);">
                    <span class="text-sm font-semibold" style="color: #e8ecf4;">🔗 Eşleştirme Geçmişi (<?= count($eslestirmeler) ?>)</span>
                </div>
                <div class="divide-y" style="--tw-divide-opacity: 0.04;">
                    <?php foreach ($eslestirmeler as $es):
                        $foto = null;
                        if (!empty($es['fotograflar'])) { $f = is_string($es['fotograflar']) ? json_decode($es['fotograflar'], true) : $es['fotograflar']; $foto = $f[0] ?? null; }
                        $skorRenk = $es['skor'] >= 80 ? '#00ff88' : ($es['skor'] >= 60 ? '#ffaa00' : '#ff3366');
                    ?>
                    <div class="flex items-center gap-3 px-4 py-3 hover:bg-white/2 transition-colors border-b" style="border-color:rgba(255,255,255,0.04);">
                        <div class="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style="background:rgba(255,255,255,0.05);">
                            <?php if ($foto): ?>
                            <img src="<?= APP_URL ?>/uploads/fotograflar/<?= e(basename($foto)) ?>" class="w-full h-full object-cover">
                            <?php else: ?>
                            <div class="w-full h-full flex items-center justify-center">🏠</div>
                            <?php endif; ?>
                        </div>
                        <div class="flex-1 min-w-0">
                            <a href="<?= APP_URL ?>/ilan-detay.php?id=<?= (int)$es['ilan_id'] ?>" class="text-sm font-medium hover:text-cyan-400 truncate block" style="color:#e8ecf4;"><?= e(truncate($es['baslik'] ?? '',50)) ?></a>
                            <div class="text-xs mt-0.5" style="color:#7a8599;"><?= formatFiyat((float)($es['fiyat'] ?? 0)) ?> · <?= zamanFarki($es['created_at']) ?></div>
                        </div>
                        <div class="font-bold text-xs px-2 py-0.5 rounded-full" style="background:<?= $skorRenk ?>22;color:<?= $skorRenk ?>;border:1px solid <?= $skorRenk ?>44;">%<?= (int)$es['skor'] ?></div>
                        <div><?= badge(ucfirst($es['durum'] ?? ''), 'gray') ?></div>
                    </div>
                    <?php endforeach; ?>
                    <?php if (empty($eslestirmeler)): ?>
                    <div class="px-4 py-8 text-center text-sm" style="color:#7a8599;">Eşleştirme yok.</div>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Arama Geçmişi -->
            <div class="rounded-2xl overflow-hidden" style="background: rgba(15,23,62,0.6); border: 1px solid rgba(255,255,255,0.06);">
                <div class="px-4 py-3 border-b" style="border-color: rgba(255,255,255,0.06);">
                    <span class="text-sm font-semibold" style="color: #e8ecf4;">📞 Arama Geçmişi (<?= count($aramalar) ?>)</span>
                </div>
                <div>
                    <?php foreach ($aramalar as $a): ?>
                    <div class="flex items-start gap-3 px-4 py-3 border-b hover:bg-white/2 transition-colors" style="border-color:rgba(255,255,255,0.04);">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                             style="background: rgba(0,212,255,0.1);">📞</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 text-xs">
                                <span style="color:#e8ecf4;"><?= e($a['danisman_ad'] ?? '') ?></span>
                                <?php if ($a['sonuc_tipi'] ?? null): ?>
                                <span class="px-1.5 py-0.5 rounded-full" style="background:rgba(255,255,255,0.06);color:#7a8599;"><?= e($a['sonuc_tipi']) ?></span>
                                <?php endif; ?>
                                <span class="ml-auto" style="color:#7a8599;"><?= zamanFarki($a['created_at']) ?></span>
                            </div>
                            <?php if ($a['sonuc'] ?? null): ?>
                            <p class="text-xs mt-1 line-clamp-2" style="color:#7a8599;"><?= e($a['sonuc']) ?></p>
                            <?php endif; ?>
                            <?php if ($a['sesli_not_metin'] ?? null): ?>
                            <p class="text-xs mt-1 italic" style="color:#7a8599;">🎤 <?= e(truncate($a['sesli_not_metin'], 80)) ?></p>
                            <?php endif; ?>
                        </div>
                    </div>
                    <?php endforeach; ?>
                    <?php if (empty($aramalar)): ?>
                    <div class="px-4 py-8 text-center text-sm" style="color:#7a8599;">Arama geçmişi yok.</div>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>
</main>

<?php require_once APP_DIR . '/views/layout/footer.php'; ?>
