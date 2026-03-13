/**
 * EmlakRadar Pro — İlan Detay JS
 * AI değerleme, harita, fiyat geçmişi grafiği, WhatsApp
 */

/* ── Leaflet Harita ─────────────────────────────────────────────────── */
(function () {
    const mapEl = document.getElementById('ilan-map');
    if (!mapEl || typeof L === 'undefined') return;

    const lat = parseFloat(mapEl.dataset.lat || '0');
    const lng = parseFloat(mapEl.dataset.lng || '0');

    if (!lat || !lng) {
        mapEl.innerHTML = '<div class="flex items-center justify-center h-full text-slate-500 text-sm">Konum bilgisi yok.</div>';
        return;
    }

    const map = L.map(mapEl, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
    }).addTo(map);

    // Özel marker
    const icon = L.divIcon({
        html: '<div style="background:#00d4ff;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>',
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    });

    L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(mapEl.dataset.baslik || 'İlan Konumu')
        .openPopup();
})();

/* ── Fiyat Geçmişi Grafiği ──────────────────────────────────────────── */
(function () {
    const canvas = document.getElementById('fiyat-gecmisi-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const raw = canvas.dataset.gecmis || '[]';
    let gecmis = [];
    try { gecmis = JSON.parse(raw); } catch (e) { return; }

    if (!gecmis.length) return;

    const labels = gecmis.map(g => new Date(g.tarih).toLocaleDateString('tr-TR', { day:'2-digit', month:'short' }));
    const values = gecmis.map(g => g.fiyat);

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(0,212,255,0.2)');
    gradient.addColorStop(1, 'rgba(0,212,255,0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Fiyat (₺)',
                data: values,
                borderColor: '#00d4ff',
                backgroundColor: gradient,
                fill: true,
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: '#00d4ff',
                pointHoverRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0d1535',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    titleColor: '#e2e8f0',
                    bodyColor: '#94a3b8',
                    callbacks: {
                        label: ctx => formatFiyat(ctx.raw),
                    },
                },
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569' } },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: {
                        color: '#475569',
                        callback: v => (v/1000000).toFixed(1) + 'M ₺',
                    },
                },
            },
        },
    });
})();

/* ── Fotoğraf Galerisi ──────────────────────────────────────────────── */
(function () {
    const thumbs = document.querySelectorAll('.fotograf-thumb');
    const mainImg = document.getElementById('main-fotograf');
    if (!thumbs.length || !mainImg) return;

    thumbs.forEach(thumb => {
        thumb.addEventListener('click', function () {
            thumbs.forEach(t => t.classList.remove('ring-2', 'ring-[#00d4ff]'));
            this.classList.add('ring-2', 'ring-[#00d4ff]');
            mainImg.src = this.dataset.src;
            mainImg.classList.add('fade-in');
            setTimeout(() => mainImg.classList.remove('fade-in'), 400);
        });
    });

    // Klavye navigasyonu
    let currentIdx = 0;
    document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' && currentIdx < thumbs.length - 1) {
            thumbs[++currentIdx].click();
        } else if (e.key === 'ArrowLeft' && currentIdx > 0) {
            thumbs[--currentIdx].click();
        }
    });
})();

/* ── Eşleştirme Otomatik Çalıştır ──────────────────────────────────── */
window.otomatikEslestir = function (ilanId) {
    const btn = document.getElementById('eslestir-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="loader mr-2"></span>Eşleştiriliyor...';
    }

    fetch('/api/eslestirmeler.php?action=otomatik_eslestir', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ ilan_id: ilanId }),
    })
    .then(r => r.json())
    .then(data => {
        if (btn) { btn.disabled = false; btn.innerHTML = '🔗 Eşleştir'; }
        if (data.success) {
            showFlash(`${data.data?.sayi || 0} eşleştirme bulundu.`, 'success');
            // Eşleştirmeler listesini yenile
            const eslestirmeList = document.getElementById('eslestirme-list');
            if (eslestirmeList && data.html) eslestirmeList.innerHTML = data.html;
        } else {
            showFlash(data.message || 'Eşleştirme başarısız.', 'error');
        }
    })
    .catch(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = '🔗 Eşleştir'; }
        showFlash('Sunucu hatası.', 'error');
    });
};

/* ── WhatsApp (İlan Detay) ──────────────────────────────────────────── */
window.detayWhatsapp = function (ilanId) {
    const phone = prompt('Müşteri WhatsApp numarası (05XXXXXXXXX):');
    if (!phone) return;

    fetch('/api/whatsapp.php?action=ilan_gonder', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ ilan_id: ilanId, telefon: phone }),
    })
    .then(r => r.json())
    .then(data => {
        showFlash(data.success ? 'WhatsApp mesajı gönderildi.' : (data.message || 'Gönderilemedi.'),
                  data.success ? 'success' : 'error');
    })
    .catch(() => showFlash('Sunucu hatası.', 'error'));
};

/* ── Gerçeklik Tokadı PDF ───────────────────────────────────────────── */
window.gerceklikTokadi = function (ilanId) {
    window.open('/api/raporlar.php?action=gerceklik_tokadi&ilan_id=' + ilanId, '_blank');
};

/* ── İlan Durum Güncelle ────────────────────────────────────────────── */
window.ilanDurumGuncelle = function (ilanId, durum) {
    fetch('/api/ilanlar.php?action=durum_guncelle', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ id: ilanId, durum }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showFlash('Durum güncellendi.', 'success');
            setTimeout(() => window.location.reload(), 800);
        } else {
            showFlash(data.message || 'Güncellenemedi.', 'error');
        }
    })
    .catch(() => showFlash('Sunucu hatası.', 'error'));
};
