/**
 * EmlakRadar Pro — Performans JS
 * Chart.js trend grafiği, leaderboard animasyonları
 */

/* ── Trend Grafiği ──────────────────────────────────────────────────── */
(function () {
    const canvas = document.getElementById('trend-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels  = JSON.parse(canvas.dataset.labels  || '[]');
    const efor    = JSON.parse(canvas.dataset.efor    || '[]');
    const arama   = JSON.parse(canvas.dataset.arama   || '[]');
    const randevu = JSON.parse(canvas.dataset.randevu || '[]');

    const ctx = canvas.getContext('2d');

    const eforGrad = ctx.createLinearGradient(0, 0, 0, 400);
    eforGrad.addColorStop(0, 'rgba(0,212,255,0.25)');
    eforGrad.addColorStop(1, 'rgba(0,212,255,0)');

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Efor Skoru',
                    data: efor,
                    backgroundColor: 'rgba(0,212,255,0.7)',
                    borderRadius: 4,
                    borderSkipped: false,
                    order: 1,
                },
                {
                    label: 'Arama',
                    data: arama,
                    type: 'line',
                    borderColor: '#00ff88',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#00ff88',
                    order: 0,
                },
                {
                    label: 'Randevu',
                    data: randevu,
                    type: 'line',
                    borderColor: '#ffaa00',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#ffaa00',
                    borderDash: [4, 2],
                    order: 0,
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
                x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569' } },
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

/* ── Dağılım Pasta Grafiği ──────────────────────────────────────────── */
(function () {
    const canvas = document.getElementById('dagilim-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const arama   = parseInt(canvas.dataset.arama   || '0', 10);
    const randevu = parseInt(canvas.dataset.randevu || '0', 10);
    const gosterim= parseInt(canvas.dataset.gosterim|| '0', 10);
    const portfoy = parseInt(canvas.dataset.portfoy || '0', 10);

    new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['Arama', 'Randevu', 'Gösterim', 'Portföy'],
            datasets: [{
                data: [arama, randevu, gosterim, portfoy],
                backgroundColor: [
                    'rgba(0,212,255,0.8)',
                    'rgba(0,255,136,0.8)',
                    'rgba(255,170,0,0.8)',
                    'rgba(168,85,247,0.8)',
                ],
                borderColor: '#0d1535',
                borderWidth: 2,
                hoverOffset: 8,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', usePointStyle: true, padding: 16 },
                },
                tooltip: {
                    backgroundColor: '#0d1535',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    titleColor: '#e2e8f0',
                    bodyColor: '#94a3b8',
                },
            },
        },
    });
})();

/* ── Progress Bar Animasyonu ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.progress-fill[data-target]').forEach(el => {
        const target = parseFloat(el.dataset.target || '0');
        el.style.width = '0%';
        setTimeout(() => {
            el.style.width = Math.min(target, 100) + '%';
        }, 200);
    });
});

/* ── PDF Rapor ──────────────────────────────────────────────────────── */
window.performansRapor = function (donem) {
    window.open('/api/raporlar.php?action=performans_raporu&donem=' + encodeURIComponent(donem), '_blank');
};
