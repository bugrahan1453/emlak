/**
 * EmlakRadar Clipper — Hepsiemlak.com + Emlakjet.com Content Script
 * Farklı DOM selektörleri ile aynı veriyi parse eder.
 */

(function() {
    'use strict';

    const SITE = window.location.hostname.includes('hepsiemlak') ? 'hepsiemlak' : 'emlakjet';

    function parseHepsiemlak() {
        try {
            const data = {
                kaynak_site: SITE,
                kaynak_url:  window.location.href,
                kaynak_id:   (() => {
                    const m = window.location.href.match(/\/(\d{5,})(-|\/|$)/);
                    return m ? m[1] : '';
                })(),
            };

            // ── Başlık ────────────────────────────────────────────────
            const baslikSelectors = [
                'h1.detail-title', 'h1.listing-title', 'h1[class*="title"]',
                '.listing-detail h1', '.advert-title', 'h1',
            ];
            for (const sel of baslikSelectors) {
                const el = document.querySelector(sel);
                if (el && getText(el).length > 10) { data.baslik = getText(el); break; }
            }

            // ── Fiyat ─────────────────────────────────────────────────
            const fiyatSelectors = [
                '.price-container .price', '.listing-price', '.advert-price',
                '[class*="price"] strong', '[class*="fiyat"]', '.price',
            ];
            for (const sel of fiyatSelectors) {
                const el = document.querySelector(sel);
                const txt = getText(el);
                if (txt && parseSayi(txt) > 0) { data.fiyat = parseSayi(txt); break; }
            }

            // ── Açıklama ──────────────────────────────────────────────
            const aciklamaSelectors = [
                '.listing-description', '.advert-description', '[class*="description"]',
                '.detail-description', '#description',
            ];
            for (const sel of aciklamaSelectors) {
                const el = document.querySelector(sel);
                if (el) { data.aciklama = getText(el); break; }
            }

            // ── Özellikler ────────────────────────────────────────────
            const ozellikMap = {};
            const ozellikSelectors = [
                '.listing-features li', '.advert-features li', '[class*="feature"] li',
                '.detail-features tr', 'table.features tr',
            ];
            for (const sel of ozellikSelectors) {
                document.querySelectorAll(sel).forEach(item => {
                    const spans = item.querySelectorAll('span, td');
                    if (spans.length >= 2) {
                        ozellikMap[getText(spans[0]).toLowerCase()] = getText(spans[1]);
                    }
                });
                if (Object.keys(ozellikMap).length > 0) break;
            }

            data.metrekare  = parseSayi(ozellikMap['brüt m²'] || ozellikMap['net m²'] || ozellikMap['alan'] || ozellikMap['m²'] || '');
            data.oda_sayisi = ozellikMap['oda sayısı'] || ozellikMap['oda + salon'] || ozellikMap['oda'] || '';
            data.bina_yasi  = parseSayi(ozellikMap['bina yaşı'] || ozellikMap['yapı yaşı'] || '');
            data.kat        = ozellikMap['kat'] || ozellikMap['bulunduğu kat'] || '';
            data.isitma     = ozellikMap['ısıtma'] || '';
            data.tip        = 'satilik';

            // ── Konum ─────────────────────────────────────────────────
            // Breadcrumb'dan konum
            const breadcrumbs = document.querySelectorAll('.breadcrumb a, .detail-breadcrumb a, nav[aria-label="breadcrumb"] a');
            if (breadcrumbs.length >= 3) {
                const parcalar = [...breadcrumbs].map(a => getText(a).trim()).filter(Boolean);
                // Genellikle: Ana Sayfa > İstanbul > Kadıköy > Moda
                data.sehir   = parcalar[1] || '';
                data.ilce    = parcalar[2] || '';
                data.mahalle = parcalar[3] || '';
            }

            // JSON-LD'den konum/koordinat dene
            document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
                try {
                    const json = JSON.parse(script.textContent);
                    const geo = json['geo'] || json['address'] || {};
                    if (geo.latitude) data.enlem  = parseFloat(geo.latitude);
                    if (geo.longitude) data.boylam = parseFloat(geo.longitude);
                    if (json['address']?.addressLocality) {
                        data.mahalle = json['address'].addressLocality;
                        data.ilce    = json['address'].addressRegion || data.ilce;
                    }
                } catch {}
            });

            // ── Fotoğraflar ───────────────────────────────────────────
            const fotograflar = [];
            const imgSelectors = [
                '.slider-image img', '.gallery img', '[class*="gallery"] img',
                '.swiper-slide img', '.photo-gallery img', '.listing-photo img',
            ];
            for (const sel of imgSelectors) {
                document.querySelectorAll(sel).forEach(img => {
                    const src = getAttr(img, 'data-src') || getAttr(img, 'data-lazy') || img.src || '';
                    if (src && !src.includes('placeholder') && !src.includes('no-photo')) {
                        fotograflar.push(normalizeImageUrl(src));
                    }
                });
                if (fotograflar.length > 0) break;
            }
            data.fotograflar = [...new Set(fotograflar)].slice(0, 20);

            // ── Telefon ───────────────────────────────────────────────
            const telefonlar = telefonlariTopla();
            data.telefon = telefonlar[0] || '';

            setParseData(data);

            if (data.telefon) {
                chrome.runtime.sendMessage({ type: 'TELEFON_KONTROL', telefon: data.telefon, tabUrl: window.location.href });
            }

            chrome.runtime.sendMessage({ type: 'SAYFA_PARSE_EDILDI', url: data.kaynak_url });

        } catch (e) {
            console.warn('[EmlakRadar Clipper] Parse hatası (' + SITE + '):', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', parseHepsiemlak);
    } else {
        parseHepsiemlak();
    }

})();
