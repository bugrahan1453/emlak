/**
 * EmlakRadar Clipper — Sahibinden.com Content Script
 * sahibinden.com/ilan/* sayfalarından ilan bilgilerini parse eder.
 */

(function() {
    'use strict';

    function parseSahibinden() {
        try {
            const data = {
                kaynak_site: 'sahibinden',
                kaynak_url:  window.location.href,
                kaynak_id:   window.location.href.match(/\/ilan\/(\d+)/)?.[1] || '',
            };

            // Başlık
            const baslikEl = document.querySelector('h1.classifiedDetailTitle, h1[itemprop="name"], .classified-detail-main h1');
            data.baslik = getText(baslikEl);

            // Fiyat
            const fiyatEl = document.querySelector('.classified-price-container strong, .price-container strong, [itemprop="price"], .fiyat strong');
            const fiyatMetin = getText(fiyatEl) || getText(document.querySelector('.classified-info .price-container'));
            data.fiyat = parseSayi(fiyatMetin);

            // Açıklama
            const aciklamaEl = document.querySelector('#classifiedDescription, .classified-description, [itemprop="description"]');
            data.aciklama = getText(aciklamaEl);

            // Özellikler tablosu
            const ozellikMap = {};
            document.querySelectorAll('.classified-properties li, .classifiedProperties li, .classified-info-table tr').forEach(item => {
                const label = getText(item.querySelector('.caption, th, strong, label'));
                const value = getText(item.querySelector('.value, td:last-child, span:last-child'));
                if (label && value) ozellikMap[label.toLowerCase()] = value;
            });

            // m² ve diğer özellikler
            data.metrekare  = parseSayi(ozellikMap['brüt m²'] || ozellikMap['net m²'] || ozellikMap['m²'] || ozellikMap['kullanım alanı'] || '');
            data.oda_sayisi = ozellikMap['oda sayısı'] || ozellikMap['oda + salon'] || '';
            data.bina_yasi  = parseSayi(ozellikMap['bina yaşı'] || ozellikMap['yapı yaşı'] || '');
            data.kat        = ozellikMap['bulunduğu kat'] || ozellikMap['kat'] || '';
            data.isitma     = ozellikMap['ısıtma'] || '';
            data.esya       = ozellikMap['eşyalı'] === 'evet' ? 1 : 0;
            data.balkon     = ozellikMap['balkon'] === 'var' ? 1 : 0;
            data.tip        = ozellikMap['konut tipi'] || ozellikMap['ilan tipi'] || 'satilik';

            // Konum
            const konumBreadcrumb = document.querySelectorAll('.classified-address, .classified-location, .location-address');
            if (konumBreadcrumb.length > 0) {
                const adresEl = konumBreadcrumb[konumBreadcrumb.length - 1];
                const adresParcalar = getText(adresEl).split('/').map(s => s.trim());
                data.sehir    = adresParcalar[0] || '';
                data.ilce     = adresParcalar[1] || '';
                data.mahalle  = adresParcalar[2] || '';
            }

            // Konum koordinatları
            const haritaEl = document.querySelector('#map, .classifiedDetailMap, [data-lat]');
            if (haritaEl) {
                data.enlem  = parseFloat(getAttr(haritaEl, 'data-lat') || '0');
                data.boylam = parseFloat(getAttr(haritaEl, 'data-lng') || '0');
            }

            // Fotoğraflar — büyük boyutlu URL'ler
            const fotograflar = [];
            document.querySelectorAll('.classified-detail-gallery img, .gallery-container img, .swiper-slide img').forEach(img => {
                const src = getAttr(img, 'data-src') || getAttr(img, 'data-lazy') || img.src || '';
                if (src && !src.includes('placeholder') && !src.includes('no-image')) {
                    fotograflar.push(normalizeImageUrl(src));
                }
            });
            data.fotograflar = [...new Set(fotograflar)].slice(0, 20);

            // İlan sahibi bilgisi
            const saticiEl = document.querySelector('.seller-info-name, .advertiser-name, #classified-info-seller-name');
            data.satici_ad = getText(saticiEl);

            const telefonlar = telefonlariTopla();
            data.telefon = telefonlar[0] || '';

            // Parse edildi — background'a gönder
            setParseData(data);

            // Telefon kontrolü (background service worker üzerinden)
            if (data.telefon) {
                chrome.runtime.sendMessage({ type: 'TELEFON_KONTROL', telefon: data.telefon, tabUrl: window.location.href });
            }

            // Extension badge güncelle
            chrome.runtime.sendMessage({ type: 'SAYFA_PARSE_EDILDI', url: data.kaynak_url });

        } catch (e) {
            console.warn('[EmlakRadar Clipper] Parse hatası (sahibinden):', e);
        }
    }

    // DOM hazır olduğunda parse et
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', parseSahibinden);
    } else {
        parseSahibinden();
    }

})();
