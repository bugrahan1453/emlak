/**
 * EmlakRadar Clipper — Popup JS
 * 1. Aktif tab'dan parse edilmiş veriyi al
 * 2. Popup'ta önizleme göster
 * 3. "Portföye Ekle" → background service worker'a gönder
 */

let parseData = null;

// DOM elementleri
const els = {
    baglanti:   document.getElementById('baglanti-durum'),
    yukleniyor: document.getElementById('yukleniyor'),
    veriYok:    document.getElementById('veri-yok'),
    mevcutIlan: document.getElementById('mevcut-ilan'),
    ilanBilgi:  document.getElementById('ilan-bilgi'),
    fotoGrid:   document.getElementById('foto-grid'),
    baslik:     document.getElementById('ilan-baslik'),
    fiyat:      document.getElementById('ilan-fiyat'),
    m2:         document.getElementById('ilan-m2'),
    oda:        document.getElementById('ilan-oda'),
    konum:      document.getElementById('ilan-konum'),
    notAlan:    document.getElementById('ilan-not'),
    ekleBtn:    document.getElementById('ekle-btn'),
    ekleBtnText: document.getElementById('ekle-btn-text'),
    ekleBtnLoad: document.getElementById('ekle-btn-loading'),
    basari:     document.getElementById('basari'),
    ayarlarLink: document.getElementById('ayarlar-link'),
    panelUrlKisa: document.getElementById('panel-url-kisa'),
};

// Para formatlayıcı
const fmt = new Intl.NumberFormat('tr-TR');

async function init() {
    // Ayarlar yükle
    const stored = await chrome.storage.local.get(['panelUrl', 'authToken']);
    const panelUrl = stored.panelUrl || '';
    const token    = stored.authToken || '';

    // Panel URL göster
    if (panelUrl) {
        try { els.panelUrlKisa.textContent = new URL(panelUrl).hostname; } catch { els.panelUrlKisa.textContent = panelUrl; }
    } else {
        els.panelUrlKisa.textContent = 'Panel ayarlanmamış';
    }

    // Bağlantı durumu
    if (!panelUrl || !token) {
        setBaglanti(false, 'Ayarlanmamış');
    } else {
        const r = await chrome.runtime.sendMessage({ type: 'BAGLANTI_TESTI' });
        setBaglanti(r?.success, r?.success ? 'Bağlı' : 'Bağlantı Yok');
    }

    // Aktif tab'ı al
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { showState('veri-yok'); return; }

    // Parse edilmiş veriyi content script'ten al
    try {
        const r = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PARSE_DATA' });
        if (r?.data) {
            parseData = r.data;
            showIlanBilgi(parseData);
        } else {
            showState('veri-yok');
        }
    } catch {
        showState('veri-yok');
    }
}

function setBaglanti(ok, text) {
    els.baglanti.className = 'status-badge ' + (ok ? 'status-ok' : 'status-error');
    els.baglanti.querySelector('.status-text').textContent = ok ? '✅ ' + text : '❌ ' + text;
}

function showState(state) {
    els.yukleniyor.style.display = 'none';
    els.veriYok.style.display    = state === 'veri-yok' ? 'flex' : 'none';
    els.mevcutIlan.style.display = state === 'mevcut-ilan' ? 'flex' : 'none';
    els.ilanBilgi.style.display  = state === 'ilan-bilgi' ? 'block' : 'none';
}

function showIlanBilgi(data) {
    showState('ilan-bilgi');

    // Fotoğraflar
    els.fotoGrid.innerHTML = '';
    (data.fotograflar || []).slice(0, 4).forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.onerror = () => img.style.display = 'none';
        els.fotoGrid.appendChild(img);
    });

    // Metin alanları
    els.baslik.textContent = data.baslik || '—';
    els.fiyat.textContent  = data.fiyat ? fmt.format(data.fiyat) + ' ₺' : '—';
    els.m2.textContent     = data.metrekare ? data.metrekare + ' m²' : '—';
    els.oda.textContent    = data.oda_sayisi || '—';

    const parcalar = [data.mahalle, data.ilce, data.sehir].filter(Boolean);
    els.konum.textContent = parcalar.join(', ') || '—';
}

// Portföye Ekle
els.ekleBtn.addEventListener('click', async () => {
    if (!parseData) return;

    els.ekleBtnText.style.display = 'none';
    els.ekleBtnLoad.style.display = 'flex';
    els.ekleBtn.disabled = true;

    const ilanData = {
        ...parseData,
        aciklama: parseData.aciklama,
        not: els.notAlan.value.trim(),
    };

    const r = await chrome.runtime.sendMessage({ type: 'ILAN_EKLE', data: ilanData });

    els.ekleBtnText.style.display = 'flex';
    els.ekleBtnLoad.style.display = 'none';
    els.ekleBtn.disabled = false;

    if (r?.mevcut) {
        showState('mevcut-ilan');
        document.getElementById('mevcut-ilan-baslik').textContent = r.ilan?.baslik || parseData.baslik || '';
        return;
    }

    if (r?.success) {
        els.ekleBtn.style.display = 'none';
        els.basari.style.display  = 'flex';
        // 2.5 saniye sonra popup'ı kapat
        setTimeout(() => window.close(), 2500);
    } else {
        alert('Hata: ' + (r?.message || 'Bilinmeyen hata.'));
    }
});

// Ayarlar sayfasını aç
els.ayarlarLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
});

// Başlat
init();
