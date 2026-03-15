'use strict';
/**
 * EmlakRadar GPT — Sahibinden.com Content Script
 *
 * İlan detay sayfası   → metni ve fotoğrafları background'a gönder (otomatik mod)
 * Arama listesi sayfası → ilan URL'lerini kuyruğa gönder
 */

(function () {
  const url = location.href;

  // ── İlan Detay Sayfası ────────────────────────────────────────────────────
  if (url.includes('/ilan/')) {
    const metin      = sayfaMetniCikar();
    const fotograflar = fotograflariCikar();

    chrome.runtime.sendMessage({
      tip:        'ILAN_OTOMATIK',
      url,
      metin,
      fotograflar,
    });
    return;
  }

  // ── Arama / Liste Sayfası ─────────────────────────────────────────────────
  const ilanUrlPatterns = [
    '/satilik-daire', '/kiralik-daire',
    '/satilik-arsa',  '/satilik-villa',
    '/satilik-mustakil-ev',
  ];
  const listeSayfasi = ilanUrlPatterns.some(p => url.includes(p));

  if (listeSayfasi) {
    // Tüm ilan linklerini topla
    const urlListesi = [];
    document.querySelectorAll('a[href*="/ilan/"]').forEach(a => {
      const href = a.href || '';
      if (href && href.includes('/ilan/') && !urlListesi.includes(href)) {
        urlListesi.push(href.split('?')[0]); // query string temizle
      }
    });

    if (urlListesi.length > 0) {
      chrome.runtime.sendMessage({
        tip:      'LISTE_KUYRUGA_EKLE',
        urlListesi,
      });
    }
  }

  // ── Yardımcılar ──────────────────────────────────────────────────────────
  function sayfaMetniCikar() {
    // Önce ana içerik alanını bul
    const anaEl = document.querySelector(
      '#classifiedDetail, .classified-detail-main, [class*="classifiedDetail"], main'
    ) || document.body;

    // Gereksiz elementleri geç: nav, footer, reklam
    const kopya = anaEl.cloneNode(true);
    kopya.querySelectorAll('nav, footer, header, script, style, [class*="banner"], [class*="ad-"], [id*="ad-"]')
         .forEach(el => el.remove());

    return kopya.innerText.replace(/\s{3,}/g, '\n\n').trim().slice(0, 8000);
  }

  function fotograflariCikar() {
    const fotograflar = [];
    document.querySelectorAll(
      '.classified-detail-gallery img, .gallery-container img, ' +
      '.swiper-slide img, [class*="gallery"] img, [class*="photo"] img'
    ).forEach(img => {
      const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
      if (src && src.startsWith('http') && !src.includes('placeholder') && !src.includes('no-image')) {
        fotograflar.push(src);
      }
    });
    return [...new Set(fotograflar)].slice(0, 15);
  }
})();
