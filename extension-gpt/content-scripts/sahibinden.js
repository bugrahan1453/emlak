'use strict';
/**
 * EmlakRadar GPT — Sahibinden.com Content Script
 *
 * Liste sayfası → ilan verilerini DOM'dan çek → LISTE_DIREKT_ISLE
 * Hiç sekme açılmaz, bot riski sıfır.
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

  function calistir() {
    const ilanlar = ilanlariniCikar();
    if (ilanlar.length === 0) return;

    // DOM verisini direkt işle — sekme açılmaz
    chrome.runtime.sendMessage({
      tip:      'LISTE_DIREKT_ISLE',
      ilanlar,
      sayfaUrl: url,
    });
  }

  if (document.readyState === 'complete') {
    calistir();
  } else {
    window.addEventListener('load', calistir);
  }

  // Liste sayfasındaki her ilan kartından veri çıkar
  function ilanlariniCikar() {
    const ilanlar = [];

    // Sahibinden liste satırları
    const satirlar = document.querySelectorAll(
      'tr.searchResultsItem, .search-result-item, [data-id]'
    );

    satirlar.forEach(satir => {
      try {
        const linkEl = satir.querySelector('a[href*="/ilan/"]');
        if (!linkEl) return;

        const ilanUrl = linkEl.href.split('?')[0];
        const ilanIdMatch = ilanUrl.match(/\/ilan\/[^/]+-(\d{7,})/);
        if (!ilanIdMatch) return;

        const ilanId = ilanIdMatch[1];

        // Başlık
        const baslikEl = satir.querySelector('.classifiedTitle, [class*="title"], h3, h2');
        const baslik = baslikEl?.innerText?.trim() || '';

        // Fiyat
        const fiyatEl = satir.querySelector('.price, [class*="price"], .classified-price');
        const fiyatMetin = fiyatEl?.innerText?.trim() || '';
        const fiyat = parseSayi(fiyatMetin);

        // m² ve oda
        const ozellikEl = satir.querySelector('.searchResultsAttributeValue, [class*="attribute"]');
        const ozellikMetin = ozellikEl?.innerText?.trim() || '';
        const m2Match  = ozellikMetin.match(/(\d+)\s*m²/i);
        const odaMatch = ozellikMetin.match(/(\d+\+\d+|\d+)/);
        const metrekare  = m2Match  ? parseInt(m2Match[1],  10) : null;
        const odaSayisi  = odaMatch ? odaMatch[1] : null;

        // Konum
        const konumEl = satir.querySelector('.searchResultsLocationValue, [class*="location"]');
        const konum = konumEl?.innerText?.trim() || '';

        // Fotoğraf
        const imgEl = satir.querySelector('img[src], img[data-src]');
        const foto  = imgEl?.dataset?.src || imgEl?.src || '';

        if (!baslik && !fiyat) return; // veri yoksa atla

        ilanlar.push({ ilanUrl, ilanId, baslik, fiyat, metrekare, odaSayisi, konum, foto });
      } catch (_) {}
    });

    return ilanlar;
  }

  function parseSayi(metin) {
    if (!metin) return null;
    const temiz = metin.replace(/[^\d]/g, '');
    return temiz ? parseInt(temiz, 10) : null;
  }
})();
