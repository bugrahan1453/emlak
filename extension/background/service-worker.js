/**
 * EmlakRadar Clipper — Background Service Worker (Manifest V3)
 * Panel API'sine proxy görevi görür; CORS engelini aşar.
 */

// API kütüphanesini import et (ES Module)
importScripts('../lib/api-bundle.js');

const api = new EmlakRadarAPI();

/* ─────────────────────────────────────────────────────────────────────
 * Mesaj Dinleyici — popup ve content script mesajları
 * ───────────────────────────────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg, sender).then(sendResponse).catch(err => {
        sendResponse({ success: false, message: err.message });
    });
    return true; // async sendResponse için gerekli
});

async function handleMessage(msg, sender) {
    switch (msg.type) {
        // ── İlan portföye ekle ──────────────────────────────────────
        case 'ILAN_EKLE':
            await api.init();
            if (!api.hazir) return { success: false, message: 'Panel bağlantısı yapılandırılmamış. Ayarları kontrol edin.' };

            // Zaten var mı kontrol et
            const mevcut = await api.ilanVarMi(msg.data.kaynak_url);
            if (mevcut) return { success: false, message: 'Bu ilan zaten portföyünüzde!', mevcut: true, ilan: mevcut };

            const sonuc = await api.ilanEkle(msg.data);
            if (sonuc.success) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: '../assets/icon-48.svg',
                    title: '✅ İlan Eklendi — EmlakRadar',
                    message: (msg.data.baslik || 'İlan') + ' portföyünüze eklendi.',
                });
            }
            return sonuc;

        // ── Telefon sahte ilan kontrolü ─────────────────────────────
        case 'TELEFON_KONTROL':
            await api.init();
            if (!api.hazir) return { sayac: 0 };

            const kontrolSonuc = await api.telefonKontrol(msg.telefon);
            if (kontrolSonuc.sayac >= 3) {
                // Content script'e uyarı gönder
                const tabs = await chrome.tabs.query({ url: msg.tabUrl });
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'TELEFON_UYARI',
                        sayac: kontrolSonuc.sayac,
                        telefon: msg.telefon,
                    });
                }
                // Extension badge'i güncelle
                chrome.action.setBadgeText({ text: String(kontrolSonuc.sayac), tabId: sender.tab?.id });
                chrome.action.setBadgeBackgroundColor({ color: '#FF3366', tabId: sender.tab?.id });
            }
            return kontrolSonuc;

        // ── Sayfa parse edildi — badge temizle ─────────────────────
        case 'SAYFA_PARSE_EDILDI':
            chrome.action.setBadgeText({ text: '', tabId: sender.tab?.id });
            return { success: true };

        // ── Giriş yap ──────────────────────────────────────────────
        case 'GIRIS_YAP':
            await api.init();
            return api.girisYap(msg.email, msg.sifre);

        // ── Bağlantı testi ─────────────────────────────────────────
        case 'BAGLANTI_TESTI':
            await api.init();
            const bagli = await api.baglatiTesti();
            return { success: bagli, message: bagli ? 'Bağlantı başarılı!' : 'Bağlantı kurulamadı.' };

        // ── Parse edilmiş veriyi al ────────────────────────────────
        case 'GET_PARSE_DATA_TAB':
            if (!sender.tab?.id) return null;
            try {
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: msg.tabId || sender.tab.id },
                    func: () => window.emlakRadarParsedData,
                });
                return result?.result || null;
            } catch {
                return null;
            }

        default:
            return { success: false, message: 'Bilinmeyen mesaj tipi: ' + msg.type };
    }
}

/* ─────────────────────────────────────────────────────────────────────
 * Inline API Bundle (import olmadan — Manifest V3 uyumu)
 * ───────────────────────────────────────────────────────────────────── */
// api-bundle.js dosyasını oluşturmak yerine sınıfı inline tanımla
class EmlakRadarAPI {
    constructor() {
        this.baseUrl = '';
        this.token   = '';
        this.hazir   = false;
    }

    async init() {
        const s = await chrome.storage.local.get(['panelUrl', 'authToken']);
        this.baseUrl = s.panelUrl || '';
        this.token   = s.authToken || '';
        this.hazir   = !!(this.baseUrl && this.token);
        return this.hazir;
    }

    async girisYap(email, sifre) {
        const url = this._url('/api/auth.php?action=login');
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, sifre }),
        });
        const data = await r.json();
        if (data.success && data.data?.token) {
            await chrome.storage.local.set({ authToken: data.data.token });
            this.token = data.data.token;
            this.hazir = true;
        }
        return data;
    }

    async ilanEkle(ilanData) {
        return this._post('/api/ilanlar.php?action=clipper_ekle', ilanData);
    }

    async ilanVarMi(kaynakUrl) {
        if (!this.hazir) return null;
        const r = await fetch(this._url('/api/ilanlar.php?action=kaynak_kontrol&url=' + encodeURIComponent(kaynakUrl)), {
            headers: this._headers(),
        });
        const d = await r.json();
        return d.data || null;
    }

    async telefonKontrol(telefon) {
        if (!this.hazir) return { sayac: 0 };
        const r = await fetch(this._url('/api/ilanlar.php?action=telefon_kontrol&telefon=' + encodeURIComponent(telefon)), {
            headers: this._headers(),
        });
        const d = await r.json();
        return d.data || { sayac: 0 };
    }

    async baglatiTesti() {
        try {
            const r = await fetch(this._url('/api/auth.php?action=me'), { headers: this._headers() });
            return r.ok;
        } catch { return false; }
    }

    async _post(endpoint, body) {
        if (!this.hazir) return { success: false, message: 'API bağlantısı yapılandırılmamış.' };
        const r = await fetch(this._url(endpoint), {
            method: 'POST',
            headers: { ...this._headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return r.json();
    }

    _url(path) { return this.baseUrl.replace(/\/$/, '') + path; }
    _headers()  { return { 'Authorization': 'Bearer ' + this.token }; }
}
