'use strict';
/**
 * EmlakRadar GPT — Sahibinden.com Content Script
 *
 * Liste sayfası → satırlardaki görünen veriyi çek, direkt GPT'ye gönder
 *                 (detay sayfasına girme, bot riski sıfır)
 */

(function () {
  const url = location.href;

  const listeSayfasi = [
    '/satilik-daire', '/kiralik-daire',
    '/satilik-arsa',  '/satilik-villa',
    '/satilik-mustakil-ev', '/kiralik-mustakil-ev',
    '/satilik-bina',  '/kiralik-ofis', '/satilik-ofis',
  ].some(p => url.includes(p));

  if (!listeSayfasi) return;

  // Sayfa tam yüklenince çalış
  function calistir() {
    const ilanlar = listeSatirlariniCikar();
    if (ilanlar.length === 0) return;

    chrome.runtime.sendMessage({
      tip:    'LISTE_DIREKT_ISLE',
      ilanlar,
      sayfaUrl: url,
    });
  }

  // DOM hazırsa hemen, değilse bekle
  if (document.readyState === 'complete') {
    calistir();
  } else {
    window.addEventListener('load', calistir);
  }

  // ── Liste satırlarından veri çıkar ──────────────────────────────────────────
  function listeSatirlariniCikar() {
    const sonuc = [];

    // Sahibinden liste satırları: tr veya div tabanlı olabilir
    const satirlar = document.querySelectorAll(
      'table.classifiedList tbody tr[data-id], ' +
      'table.searchResultsTable tbody tr[data-id], ' +
      'tr[data-id]'
    );

    satirlar.forEach(satir => {
      try {
        const ilanId = satir.getAttribute('data-id') || '';
        const linkEl = satir.querySelector('a[href*="/ilan/"]');
        if (!linkEl) return;

        const ilanUrl = linkEl.href.split('?')[0];
        const baslik  = linkEl.textContent.trim() || linkEl.getAttribute('title') || '';

        // Fiyat
        const fiyatEl = satir.querySelector('.price, [class*="price"], td.searchResultsPriceValue');
        const fiyatHam = fiyatEl?.textContent?.trim() || '';
        const fiyat   = parseInt(fiyatHam.replace(/[^\d]/g, '')) || 0;

        // m²
        const tdler = satir.querySelectorAll('td');
        let metrekare = null, odaSayisi = null;
        tdler.forEach(td => {
          const txt = td.textContent.trim();
          if (/^\d+(\.\d+)?$/.test(txt) && !metrekare && parseInt(txt) > 10) metrekare = parseInt(txt);
          if (/^\d\+\d$/.test(txt) || /^\d\+\d+$/.test(txt)) odaSayisi = txt; // "3+1" formatı
        });

        // Konum (son sütunlar genellikle şehir/ilçe)
        const konumEl = satir.querySelector('.searchResultsLocationValue, [class*="location"], td:last-child');
        const konum   = konumEl?.textContent?.trim() || '';

        // Küçük resim
        const imgEl  = satir.querySelector('img');
        const foto   = imgEl?.getAttribute('data-src') || imgEl?.src || '';

        // Tarih
        const tarihEl = satir.querySelector('.searchResultsDateValue, [class*="date"]');
        const tarih   = tarihEl?.textContent?.trim() || '';

        if (!baslik || !ilanUrl) return;

        sonuc.push({ ilanId, ilanUrl, baslik, fiyat, metrekare, odaSayisi, konum, foto, tarih });
      } catch (_) { /* bu satırı atla */ }
    });

    return sonuc;
  }
})();
