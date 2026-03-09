/**
 * EmlakRadar Clipper — Options Page JS
 */

function showAlert(elId, msg, type = 'info') {
    const el = document.getElementById(elId);
    el.className = 'alert ' + type;
    el.textContent = msg;
    el.style.display = 'block';
    if (type !== 'error') setTimeout(() => { el.style.display = 'none'; }, 4000);
}

async function init() {
    const stored = await chrome.storage.local.get([
        'panelUrl', 'authToken', 'otoParse', 'sahteUyari', 'bildirimler',
        'statEklenen', 'statSahte', 'statKaydedilen',
    ]);

    // URL
    if (stored.panelUrl) document.getElementById('panel-url').value = stored.panelUrl;

    // Tercihler
    document.getElementById('oto-parse').checked   = stored.otoParse   !== false;
    document.getElementById('sahte-uyari').checked = stored.sahteUyari !== false;
    document.getElementById('bildirimler').checked  = stored.bildirimler !== false;

    // İstatistikler
    document.getElementById('stat-eklenen').textContent   = stored.statEklenen  || 0;
    document.getElementById('stat-sahte').textContent     = stored.statSahte    || 0;
    document.getElementById('stat-kaydedilen').textContent = stored.statKaydedilen || 0;

    // Giriş durumu
    if (stored.authToken) {
        const r = await chrome.runtime.sendMessage({ type: 'BAGLANTI_TESTI' });
        const alert = document.getElementById('giris-durum');
        if (r?.success) {
            alert.className = 'alert success';
            alert.textContent = '✅ Panel bağlantısı aktif. Giriş yapıldı.';
            document.getElementById('giris-form').style.display = 'none';
        } else {
            alert.className = 'alert error';
            alert.textContent = '❌ Token geçersiz. Yeniden giriş yapın.';
        }
    } else {
        document.getElementById('giris-durum').style.display = 'none';
    }
}

// Panel URL kaydet
document.getElementById('panel-url').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ panelUrl: e.target.value.trim() });
});

// Bağlantı testi
document.getElementById('test-btn').addEventListener('click', async () => {
    const url = document.getElementById('panel-url').value.trim();
    if (!url) { showAlert('baglanti-alert', 'Panel URL girin.', 'error'); return; }

    await chrome.storage.local.set({ panelUrl: url });
    const r = await chrome.runtime.sendMessage({ type: 'BAGLANTI_TESTI' });
    showAlert('baglanti-alert', r?.success ? '✅ Bağlantı başarılı!' : '❌ ' + (r?.message || 'Bağlantı kurulamadı.'), r?.success ? 'success' : 'error');
});

// Giriş
document.getElementById('giris-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const sifre = document.getElementById('sifre').value;
    const url   = document.getElementById('panel-url').value.trim();

    if (!url)  { showAlert('giris-alert', 'Önce Panel URL girin.', 'error'); return; }
    if (!email || !sifre) { showAlert('giris-alert', 'E-posta ve şifre girin.', 'error'); return; }

    await chrome.storage.local.set({ panelUrl: url });
    const r = await chrome.runtime.sendMessage({ type: 'GIRIS_YAP', email, sifre });

    if (r?.success) {
        showAlert('giris-alert', '✅ Giriş başarılı!', 'success');
        document.getElementById('giris-form').style.display = 'none';
        const d = document.getElementById('giris-durum');
        d.className = 'alert success';
        d.textContent = '✅ Panel bağlantısı aktif.';
        d.style.display = 'block';
    } else {
        showAlert('giris-alert', '❌ ' + (r?.message || 'Giriş başarısız.'), 'error');
    }
});

// Tercihler kaydet
document.getElementById('tercih-kaydet-btn').addEventListener('click', async () => {
    await chrome.storage.local.set({
        otoParse:    document.getElementById('oto-parse').checked,
        sahteUyari:  document.getElementById('sahte-uyari').checked,
        bildirimler: document.getElementById('bildirimler').checked,
    });
    showAlert('tercih-alert', '✅ Tercihler kaydedildi.', 'success');
});

// İstatistik sıfırla
document.getElementById('istatistik-sifirla').addEventListener('click', async () => {
    await chrome.storage.local.set({ statEklenen: 0, statSahte: 0, statKaydedilen: 0 });
    document.getElementById('stat-eklenen').textContent    = 0;
    document.getElementById('stat-sahte').textContent      = 0;
    document.getElementById('stat-kaydedilen').textContent = 0;
});

init();
