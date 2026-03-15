'use strict';
/**
 * EmlakRadar GPT — Sahibinden.com Content Script
 *
 * Liste sayfası → ilan URL'lerini topla → kuyruğa ekle
 * (Detay sayfası service worker tarafından fetch edilir, tam veri çekilir)
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
    const ilanUrls = ilanUrlleriniTopla();
    if (ilanUrls.length === 0) return;

    // Ilan URL'lerini ve arama URL'sini service worker'a gönder
    // Service worker 5 sayfayı fetch edip kuyruğa ekler
    chrome.runtime.sendMessage({
      tip:      'COKLU_SAYFA_KUYRUK',
      ilanUrls, // Mevcut sayfadan toplanan URL'ler
      sayfaUrl: url,
    });
  }

  if (document.readyState === 'complete') {
    calistir();
  } else {
    window.addEventListener('load', calistir);
  }

  // Mevcut sayfadaki ilan URL'lerini DOM'dan çıkar
  function ilanUrlleriniTopla() {
    const urls = new Set();
    document.querySelectorAll('a[href*="/ilan/"]').forEach(a => {
      const href = a.href.split('?')[0];
      if (href && href.includes('/ilan/')) urls.add(href);
    });
    return [...urls];
  }
})();
