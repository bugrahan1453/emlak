    </div><!-- /main-content -->
</div><!-- /app-wrapper -->

<!-- Mobil Alt Tab Bar -->
<nav class="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex border-t"
     style="background: rgba(10,16,42,0.97); border-color: rgba(255,255,255,0.06); backdrop-filter: blur(20px);">
    <?php
    $tabItems = [
        ['href' => 'gorevler.php',   'icon' => '✅', 'label' => 'Görevler'],
        ['href' => 'ilanlar.php',    'icon' => '🏠', 'label' => 'İlanlar'],
        ['href' => 'dashboard.php',  'icon' => '📊', 'label' => 'Ana Sayfa'],
        ['href' => 'musteriler.php', 'icon' => '📇', 'label' => 'Müşteriler'],
        ['href' => 'ayarlar.php',    'icon' => '⚙️',  'label' => 'Profil'],
    ];
    $cp = basename($_SERVER['PHP_SELF'], '.php');
    foreach ($tabItems as $t):
        $isActive = $cp === basename($t['href'], '.php');
    ?>
    <a href="<?= APP_URL ?>/<?= $t['href'] ?>"
       class="flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors <?= $isActive ? 'tab-active' : '' ?>"
       style="color: <?= $isActive ? '#00d4ff' : '#7a8599' ?>;">
        <span class="text-lg leading-none"><?= $t['icon'] ?></span>
        <span><?= $t['label'] ?></span>
    </a>
    <?php endforeach; ?>
</nav>

<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<!-- Leaflet JS (harita) -->
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<!-- Flatpickr JS + Türkçe -->
<script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
<script src="https://npmcdn.com/flatpickr/dist/l10n/tr.js"></script>
<!-- SortableJS -->
<script src="https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js"></script>

<!-- Uygulama JS -->
<script src="<?= APP_URL ?>/assets/js/app.js"></script>
<?php if (!empty($extraJs)):
    $jsFiles = is_array($extraJs) ? $extraJs : [$extraJs];
    foreach ($jsFiles as $jsFile): ?>
<script src="<?= APP_URL ?>/assets/js/<?= e($jsFile) ?>"></script>
<?php endforeach; endif; ?>
<!-- PWA Service Worker -->
<script src="<?= APP_URL ?>/assets/js/pwa.js"></script>

<!-- Uygulama başlatma -->
<script>
flatpickr.localize(flatpickr.l10ns.tr);
flatpickr('.datepicker', { dateFormat: 'Y-m-d', locale: 'tr' });
flatpickr('.datetimepicker', { enableTime: true, dateFormat: 'Y-m-d H:i', locale: 'tr' });
</script>
</body>
</html>
