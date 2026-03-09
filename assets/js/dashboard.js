/**
 * EmlakRadar Pro — Dashboard JS
 * AJAX yenileme, Chart.js KPI grafikleri
 */

/* ── Canlı İlan Feed (30s AJAX) ─────────────────────────────────────── */
(function () {
    const container = document.getElementById('canli-ilan-feed');
    if (!container) return;

    function ilanlarYenile() {
        fetch('/api/ilanlar.php?action=son_ilanlar')
            .then(r => r.json())
            .then(data => {
                if (data.success && data.html) {
                    container.innerHTML = data.html;
                    // Yeni kayıtlar için animasyon
                    container.querySelectorAll('[data-new]').forEach(el => {
                        el.classList.add('fade-in-up');
                    });
                }
            })
            .catch(() => {}); // Sessiz hata
    }

    // Her 30 saniyede bir yenile
    setInterval(ilanlarYenile, 30000);
})();

/* ── KPI Chart.js Trendleri ─────────────────────────────────────────── */
(function () {
    if (typeof Chart === 'undefined') return;

    Chart.defaults.color = '#64748b';
    Chart.defaults.font.family = "'Outfit', sans-serif";
    Chart.defaults.font.size = 11;

    // Ortak gradient oluşturucu
    function makeGradient(ctx, color) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, color + '40');
        gradient.addColorStop(1, color + '00');
        return gradient;
    }

    // Her KPI canvas'ını bul ve çiz
    document.querySelectorAll('.kpi-trend-chart').forEach(canvas => {
        const ctx    = canvas.getContext('2d');
        const labels = JSON.parse(canvas.dataset.labels || '[]');
        const values = JSON.parse(canvas.dataset.values || '[]');
        const color  = canvas.dataset.color || '#00d4ff';

        new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data: values,
                    borderColor: color,
                    borderWidth: 2,
                    backgroundColor: makeGradient(ctx, color),
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: color,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#0d1535',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    titleColor: '#e2e8f0',
                    bodyColor: '#94a3b8',
                }},
                scales: {
                    x: { display: false },
                    y: { display: false },
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false },
            },
        });
    });
})();

/* ── Performans Chart (Ana Grafik) ──────────────────────────────────── */
(function () {
    const canvas = document.getElementById('performans-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = JSON.parse(canvas.dataset.labels || '[]');
    const efor   = JSON.parse(canvas.dataset.efor   || '[]');
    const arama  = JSON.parse(canvas.dataset.arama  || '[]');

    const ctx = canvas.getContext('2d');

    const eforGrad = ctx.createLinearGradient(0, 0, 0, 300);
    eforGrad.addColorStop(0, 'rgba(0,212,255,0.3)');
    eforGrad.addColorStop(1, 'rgba(0,212,255,0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Efor Skoru',
                    data: efor,
                    borderColor: '#00d4ff',
                    backgroundColor: eforGrad,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#00d4ff',
                },
                {
                    label: 'Arama Sayısı',
                    data: arama,
                    borderColor: '#00ff88',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#00ff88',
                    borderDash: [4, 2],
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', usePointStyle: true, pointStyleWidth: 8 },
                },
                tooltip: {
                    backgroundColor: '#0d1535',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    titleColor: '#e2e8f0',
                    bodyColor: '#94a3b8',
                },
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#475569' },
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#475569' },
                    beginAtZero: true,
                },
            },
            interaction: { mode: 'index', intersect: false },
        },
    });
})();

/* ── Akıllı Alarm Sayacı ────────────────────────────────────────────── */
(function () {
    const alarmBadge = document.getElementById('alarm-badge');
    const alarmCount = document.getElementById('alarm-count');
    if (!alarmBadge || !alarmCount) return;

    const n = parseInt(alarmCount.textContent || '0', 10);
    if (n > 0) {
        alarmBadge.classList.add('animate-pulse');
    }
})();

/* ── Liderboard Animasyon ───────────────────────────────────────────── */
(function () {
    const rows = document.querySelectorAll('#leaderboard-table tr');
    rows.forEach((row, i) => {
        row.style.animationDelay = (i * 0.08) + 's';
        row.classList.add('fade-in-up');
    });
})();

/* ── Son Eşleştirmeler Animasyon ────────────────────────────────────── */
(function () {
    const items = document.querySelectorAll('.eslestirme-item');
    items.forEach((item, i) => {
        item.style.animationDelay = (i * 0.06) + 's';
        item.classList.add('fade-in-up');
    });
})();

/* ── Dashboard Görev Hızlı Tamamla ─────────────────────────────────── */
function dashboardGorevToggle(id, checkbox) {
    const tamamlandi = checkbox.checked;
    fetch('/api/gorevler.php?action=tamamla', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ id, sonuc: tamamlandi ? 'basarili' : null }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            const card = document.getElementById('gorev-' + id);
            if (card) {
                if (tamamlandi) {
                    card.classList.add('tamamlandi');
                } else {
                    card.classList.remove('tamamlandi');
                }
            }
        }
    })
    .catch(() => {
        checkbox.checked = !tamamlandi; // Geri al
        showFlash('İşlem başarısız oldu.', 'error');
    });
}

/* ── Sayfa Yüklenme Animasyonu ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
    // KPI kartları stagger animasyonu
    document.querySelectorAll('.kpi-card').forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(16px)';
        setTimeout(() => {
            card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, i * 80);
    });
});
