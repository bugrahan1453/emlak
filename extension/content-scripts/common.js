/**
 * EmlakRadar Clipper — Ortak Content Script Yardımcıları
 * Tüm site content script'leri bu dosyayı kullanır.
 */

// Sayfadan telefon numaralarını topla
function telefonlariTopla() {
    const metinler = document.body.innerText || '';
    const regex = /(\+?90[\s\-]?)?(\(0?\d{3}\)[\s\-]?|\d{3,4}[\s\-]?)(\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\d{7})/g;
    const eslesler = metinler.match(regex) || [];
    return [...new Set(eslesler.map(t => t.replace(/\D/g, '')))].filter(t => t.length >= 10 && t.length <= 12);
}

// Sayı parse et (1.250.000 → 1250000)
function parseSayi(str = '') {
    return parseFloat(str.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.]/g, '')) || 0;
}

// Güvenli text alma
function getText(el) {
    return el ? el.textContent.trim() : '';
}

// Güvenli attr alma
function getAttr(el, attr) {
    return el ? (el.getAttribute(attr) || '') : '';
}

// Galeri resimlerini büyük boyutlu URL'ye dönüştür
function normalizeImageUrl(url) {
    if (!url) return '';
    // Thumbnail → original
    url = url.replace(/_big\.jpg/, '.jpg');
    url = url.replace(/\/medium\//, '/large/');
    url = url.replace(/\/small\//, '/large/');
    return url;
}

// Popup'a parse edilmiş veriyi gönder
window.emlakRadarParsedData = null;
function setParseData(data) {
    window.emlakRadarParsedData = data;
    // Extension popup'ına mesaj gönder
    window.dispatchEvent(new CustomEvent('emlakradar_parsed', { detail: data }));
}

// Sahte ilan uyarı banner'ı
function sahteFlanUyarisiGoster(ilanSayisi, telefon) {
    const mevcut = document.getElementById('emlakradar-uyari');
    if (mevcut) mevcut.remove();

    const banner = document.createElement('div');
    banner.id = 'emlakradar-uyari';
    banner.style.cssText = `
        position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
        z-index: 999999; background: #1a0000; border: 2px solid #ff3366;
        border-radius: 12px; padding: 12px 20px; display: flex; align-items: center;
        gap: 12px; box-shadow: 0 8px 40px rgba(255,51,102,0.4); max-width: 480px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    `;
    banner.innerHTML = `
        <span style="font-size:24px">⚠️</span>
        <div>
            <div style="color:#ff3366;font-weight:bold;font-size:14px">Şüpheli İlan Uyarısı — EmlakRadar</div>
            <div style="color:#ff6b8a;font-size:12px;margin-top:2px">Bu telefon numarasından sistemde <strong>${ilanSayisi}</strong> farklı ilan bulunmaktadır. Dikkatli olun!</div>
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#7a8599;cursor:pointer;font-size:18px;margin-left:auto;">✕</button>
    `;
    document.body.appendChild(banner);

    // 15 saniye sonra otomatik kaldır
    setTimeout(() => banner.remove(), 15000);
}

// Extension popup'tan gelen mesajları dinle
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_PARSE_DATA') {
        sendResponse({ data: window.emlakRadarParsedData });
    }
    if (msg.type === 'TELEFON_UYARI') {
        sahteFlanUyarisiGoster(msg.sayac, msg.telefon);
    }
    return true;
});
