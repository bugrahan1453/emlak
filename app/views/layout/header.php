<!DOCTYPE html>
<html lang="tr" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#060a1a">
    <meta name="description" content="EmlakRadar Pro — Akıllı Emlak Otomasyon Paneli">
    <link rel="manifest" href="<?= APP_URL ?>/manifest.json">
    <link rel="apple-touch-icon" href="<?= APP_URL ?>/assets/img/logo.svg">
    <title><?= e($pageTitle ?? 'Dashboard') ?> — EmlakRadar Pro</title>

    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
    tailwind.config = {
        darkMode: 'class',
        theme: {
            extend: {
                fontFamily: {
                    sans: ['Outfit', 'sans-serif'],
                    mono: ['JetBrains Mono', 'monospace'],
                },
                colors: {
                    radar: {
                        bg:      '#060a1a',
                        surface: '#0c1129',
                        card:    'rgba(15,23,62,0.6)',
                        sidebar: 'rgba(10,16,42,0.95)',
                        accent:  '#00d4ff',
                        green:   '#00ff88',
                        red:     '#ff3366',
                        amber:   '#ffaa00',
                        purple:  '#8b5cf6',
                        border:  'rgba(255,255,255,0.06)',
                        text:    '#e8ecf4',
                        muted:   '#7a8599',
                    }
                }
            }
        }
    }
    </script>

    <!-- Flatpickr (tarih seçici) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css">

    <!-- Leaflet CSS (harita) -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">

    <!-- Uygulama CSS -->
    <link rel="stylesheet" href="<?= APP_URL ?>/assets/css/app.css">

    <!-- Alpine.js -->
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body class="font-sans antialiased" style="background-color: #060a1a; color: #e8ecf4; min-height: 100vh;">
