/**
 * EmlakRadar Clipper — Panel API İletişim Kütüphanesi
 * Background service worker'da kullanılır.
 */

class EmlakRadarAPI {
    constructor() {
        this.baseUrl  = '';
        this.token    = '';
        this.hazir    = false;
    }

    async init() {
        const stored = await chrome.storage.local.get(['panelUrl', 'authToken']);
        this.baseUrl = stored.panelUrl || '';
        this.token   = stored.authToken || '';
        this.hazir   = !!(this.baseUrl && this.token);
        return this.hazir;
    }

    // Giriş yap — JWT token al
    async girisYap(email, sifre) {
        const url = this.baseUrl.replace(/\/$/, '') + '/api/auth.php?action=login';
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

    // İlan portföye ekle
    async ilanEkle(ilanData) {
        return this.post('/api/ilanlar.php?action=clipper_ekle', ilanData);
    }

    // İlan portföyde var mı kontrol et
    async ilanVarMi(kaynakUrl) {
        if (!this.hazir) return null;
        const url = this.baseUrl.replace(/\/$/, '') + '/api/ilanlar.php?action=kaynak_kontrol&url=' + encodeURIComponent(kaynakUrl);
        const r = await fetch(url, { headers: this.headers() });
        const data = await r.json();
        return data.data || null;
    }

    // Telefon numarasıyla müsait ilan kontrolü (sahte ilan uyarısı)
    async telefonKontrol(telefon) {
        if (!this.hazir) return { sayac: 0 };
        const url = this.baseUrl.replace(/\/$/, '') + '/api/ilanlar.php?action=telefon_kontrol&telefon=' + encodeURIComponent(telefon);
        const r = await fetch(url, { headers: this.headers() });
        const data = await r.json();
        return data.data || { sayac: 0 };
    }

    // Bağlantı testi
    async baglatiTesti() {
        try {
            const r = await fetch(this.baseUrl.replace(/\/$/, '') + '/api/auth.php?action=me', {
                headers: this.headers(),
            });
            return r.ok;
        } catch {
            return false;
        }
    }

    async post(endpoint, body) {
        if (!this.hazir) return { success: false, message: 'API bağlantısı yapılandırılmamış.' };
        const r = await fetch(this.baseUrl.replace(/\/$/, '') + endpoint, {
            method: 'POST',
            headers: { ...this.headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return r.json();
    }

    headers() {
        return { 'Authorization': 'Bearer ' + this.token };
    }
}

export default EmlakRadarAPI;
