/**
 * EmlakRadar Pro — Raporlar Sayfası JS
 */
function raporlarApp() {
    return {
        aktifTab: 'gerceklik_tokadi',
        yukleniyor: false,
        sonucRapor: null,
        liste: [],
        whatsappModal: false,

        // Gerçeklik Tokadı state
        gt: { aramaMetni: '', sonuclar: [], aramaAcik: false, seciliIlan: null },

        // ROI state
        roi: { aramaMetni: '', sonuclar: [], aramaAcik: false, seciliIlan: null, kiraFiyati: '' },

        // Portföy state
        portfoy: {
            tarihBas: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10),
            tarihBit: new Date().toISOString().slice(0,10),
            bolge: '',
        },

        // WhatsApp state
        wa: { telefon: '', musteriAdi: '' },

        init() {
            this.listeyiYukle();
        },

        async ilanAra(hedef) {
            const q = this[hedef].aramaMetni;
            if (q.length < 2) { this[hedef].sonuclar = []; return; }
            const r = await fetch(`/api/raporlar.php?tip=ilan_ara&q=${encodeURIComponent(q)}`);
            const d = await r.json();
            this[hedef].sonuclar = d.data || [];
            this[hedef].aramaAcik = true;
        },

        ilanSec(hedef, ilan) {
            this[hedef].seciliIlan   = ilan;
            this[hedef].aramaMetni   = ilan.baslik;
            this[hedef].aramaAcik    = false;
            this[hedef].sonuclar     = [];
        },

        async raporUret(tip) {
            this.yukleniyor = true;
            this.sonucRapor = null;

            let body = {};
            if (tip === 'gerceklik_tokadi') {
                if (!this.gt.seciliIlan) { this.yukleniyor = false; return; }
                body = { ilan_id: this.gt.seciliIlan.id };
            } else if (tip === 'roi') {
                if (!this.roi.seciliIlan || !this.roi.kiraFiyati) { this.yukleniyor = false; return; }
                body = { ilan_id: this.roi.seciliIlan.id, kira_fiyati: parseFloat(this.roi.kiraFiyati) };
            } else if (tip === 'portfoy') {
                body = { filtreler: { tarih_bas: this.portfoy.tarihBas, tarih_bit: this.portfoy.tarihBit, bolge: this.portfoy.bolge } };
            }

            try {
                const r = await fetch(`/api/raporlar.php?tip=${tip}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const d = await r.json();
                if (d.success) {
                    this.sonucRapor = d.data;
                    this.listeyiYukle();
                    window.open(d.data.url, '_blank');
                } else {
                    alert('Hata: ' + (d.message || 'Bilinmeyen hata'));
                }
            } catch (e) {
                alert('Bağlantı hatası: ' + e.message);
            } finally {
                this.yukleniyor = false;
            }
        },

        async listeyiYukle() {
            const r = await fetch('/api/raporlar.php?tip=liste');
            const d = await r.json();
            this.liste = d.data || [];
        },

        raporWhatsapp(rapor) {
            this.sonucRapor = { url: `/uploads/raporlar/${rapor.dosya_yolu}`, tipi: rapor.tip };
            this.whatsappModal = true;
        },

        waWebLink() {
            if (!this.wa.telefon || !this.sonucRapor) return '#';
            const musteriAdi = this.wa.musteriAdi || 'Değerli Müşterimiz';
            const url = window.location.origin + this.sonucRapor.url;
            const mesaj = `Merhaba ${musteriAdi} 📊\n\nSizin için hazırladığımız raporu inceleyebilirsiniz:\n${url}\n\n_EmlakRadar Pro_`;
            let tel = this.wa.telefon.replace(/\D/g,'');
            if (tel.startsWith('0')) tel = '90' + tel.slice(1);
            else if (tel.length === 10) tel = '90' + tel;
            return `https://wa.me/${tel}?text=${encodeURIComponent(mesaj)}`;
        },

        async waApiGonder() {
            if (!this.wa.telefon || !this.sonucRapor) return;
            const r = await fetch('/api/raporlar.php?tip=whatsapp_gonder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telefon: this.wa.telefon,
                    rapor_url: window.location.origin + this.sonucRapor.url,
                    musteri: { ad_soyad: this.wa.musteriAdi || 'Değerli Müşterimiz' },
                    rapor_tipi: this.sonucRapor.tipi,
                }),
            });
            const d = await r.json();
            if (d.success) {
                alert('Mesaj gönderildi!');
                this.whatsappModal = false;
            } else if (d.web_link) {
                window.open(d.web_link, '_blank');
            } else {
                alert('Hata: ' + d.message);
            }
        },
    };
}
