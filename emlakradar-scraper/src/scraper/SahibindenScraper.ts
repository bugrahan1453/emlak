/**
 * EmlakRadar Scraper — Sahibinden.com Scraper
 */
import type { Page } from 'puppeteer';
import { BaseScraper } from './BaseScraper';
import { IlanVeri } from '../types';
import { normalizeUrl, extractIdFromUrl, parseFiyat, parseMetrekare, normalizeTelefon } from '../utils/Helpers';
import { config } from '../config';

// Sayfa başına ilan sayısı (sahibinden tipik: 28)
const ITEMS_PER_PAGE = 28;

export class SahibindenScraper extends BaseScraper {
  get kaynakAdi(): string { return 'Sahibinden'; }
  get baseUrl(): string { return 'https://www.sahibinden.com'; }

  async scrape(): Promise<void> {
    const cities = config.scraper.cities; // ['istanbul', 'canakkale', ...]
    const kategoriler = [
      { yol: 'satilik-daire', tip: 'satilik' as const },
      { yol: 'kiralik-daire', tip: 'kiralik' as const },
    ];

    for (const kat of kategoriler) {
      for (const city of cities) {
        // istanbul için /satilik-daire, diğerleri için /satilik-daire/canakkale
        const cityYol = city === 'istanbul'
          ? `/${kat.yol}`
          : `/${kat.yol}/${city}`;
        await this.scrapeKategori(cityYol, kat.tip);
        await new Promise(r => setTimeout(r, config.scraper.delayMax));
      }
    }
  }

  private async scrapeKategori(yol: string, tip: 'satilik' | 'kiralik'): Promise<void> {
    const page = await this.newPage();

    try {
      const ilkUrl = `${this.baseUrl}${yol}`;
      await this.navigateWithFlareSolverr(page, ilkUrl);

      // Toplam sayfa sayısını bul
      const toplamSayfa = await this.getTotalPages(page);
      const taranacakSayfa = Math.min(toplamSayfa, config.scraper.maxPages);

      this.logger.info(`${tip} — ${taranacakSayfa} sayfa taranacak`);

      for (let sayfa = 1; sayfa <= taranacakSayfa; sayfa++) {
        const sayfaUrl = sayfa === 1
          ? ilkUrl
          : `${ilkUrl}?pagingOffset=${(sayfa - 1) * ITEMS_PER_PAGE}`;

        if (sayfa > 1) {
          await this.navigateWithFlareSolverr(page, sayfaUrl);
        }

        await this.scrollPage(page);

        // Debug: sayfada hangi elementler var?
        const debugInfo = await page.evaluate(() => {
          const counts: Record<string, number> = {};
          const selectors = [
            'tr.searchResultsItem', '.classifiedTitle', 'tr[data-id]',
            '[class*="classified"]', '[class*="listing"]', '[class*="result"]',
            'tr[id]', 'table', 'tbody tr', '[data-id]',
          ];
          for (const sel of selectors) {
            counts[sel] = document.querySelectorAll(sel).length;
          }
          counts['body_length'] = document.body?.innerHTML?.length ?? 0;
          const title = document.title;
          const firstClasses = Array.from(document.querySelectorAll('*'))
            .slice(0, 100)
            .map(el => el.className)
            .filter(c => typeof c === 'string' && c.includes('search'))
            .slice(0, 5);
          return { counts, title, firstClasses };
        });
        this.logger.info(`Debug sayfa yapısı: ${JSON.stringify(debugInfo)}`);

        const ilanlar = await this.parseSayfaIlanlar(page, tip);

        // Her ilan için detay sayfasından tüm foto + ek bilgileri çek
        const detayPage = await this.newPage();
        try {
          for (const ilan of ilanlar) {
            if (ilan.kaynak_url) {
              const detay = await this.fetchIlanDetay(detayPage, ilan);
              if (detay.fotograflar && detay.fotograflar.length > 0) ilan.fotograflar = detay.fotograflar;
              if (detay.aciklama) ilan.aciklama = detay.aciklama;
              if (detay.metrekare) ilan.metrekare = detay.metrekare;
              if (detay.oda_sayisi) ilan.oda_sayisi = detay.oda_sayisi;
              if (detay.bina_yasi) ilan.bina_yasi = detay.bina_yasi;
              if (detay.kat) ilan.kat = detay.kat;
              if (detay.isitma) ilan.isitma = detay.isitma;
              if (detay.satici_ad) ilan.satici_ad = detay.satici_ad;
            }
          }
        } finally {
          await detayPage.close();
        }

        await this.processIlanlar(ilanlar);

        this.logger.info(`Sayfa ${sayfa}/${taranacakSayfa}: ${ilanlar.length} ilan işlendi`);
      }
    } finally {
      await page.close();
    }
  }

  private async getTotalPages(page: Page): Promise<number> {
    try {
      const text = await page.$eval('.searchResultsTagArea .resultCount', el => el.textContent?.trim() ?? '0');
      const sayi = parseInt(text.replace(/[^\d]/g, '')) || 0;
      return Math.ceil(sayi / ITEMS_PER_PAGE);
    } catch {
      return 1;
    }
  }

  private async parseSayfaIlanlar(page: Page, tip: 'satilik' | 'kiralik'): Promise<IlanVeri[]> {
    return page.evaluate((baseUrl: string, tip: string) => {
      const TURK_AYLAR: Record<string, number> = {
        'ocak': 0, 'şubat': 1, 'mart': 2, 'nisan': 3, 'mayıs': 4, 'haziran': 5,
        'temmuz': 6, 'ağustos': 7, 'eylül': 8, 'ekim': 9, 'kasım': 10, 'aralık': 11,
      };
      const otuzGunOnce = new Date();
      otuzGunOnce.setDate(otuzGunOnce.getDate() - 30);

      const ilanlar: IlanVeri[] = [];
      const satirlar = document.querySelectorAll('tr.searchResultsItem');

      satirlar.forEach((satir: Element) => {
        try {
          const id = satir.getAttribute('data-id') || '';
          if (!id) return;

          const baslikEl = satir.querySelector('.classifiedTitle');
          const baslik = baslikEl?.textContent?.trim() || '';
          const href = baslikEl?.getAttribute('href') || '';
          const kaynak_url = href.startsWith('http') ? href : baseUrl + href;

          const fiyatEl = satir.querySelector('td.searchResultsPriceValue span');
          const fiyatText = fiyatEl?.textContent?.trim() || '';
          // Türkçe format: 5.599.999 TL → noktaları kaldır, virgülü nokta yap
          const fiyat = parseFloat(fiyatText.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '')) || null;

          const lokasyonEl = satir.querySelector('td.searchResultsLocationValue');
          const lokasyonHtml = lokasyonEl?.innerHTML || '';
          const lokasyonParcalar = lokasyonHtml.split(/<br\s*\/?>/i).map((s: string) => s.trim()).filter(Boolean);

          const attrCells = satir.querySelectorAll('td.searchResultsAttributeValue');
          const m2Text = attrCells[0]?.textContent?.trim() || '';
          // m² Türkçe format: nokta=binlik, virgül=ondalık
          const metrekare = parseFloat(m2Text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '')) || null;

          const odaText = attrCells[1]?.textContent?.trim() || '';

          // data-src önce gelsin — lazy-load blank placeholder'ı almamak için
          const fotografEl = satir.querySelector('td.searchResultsLargeThumbnail img');
          const fotografUrl = fotografEl?.getAttribute('data-src') || fotografEl?.getAttribute('data-lazy') || fotografEl?.getAttribute('src') || '';

          const tarihEl = satir.querySelector('.searchResultsDateValue');
          const tarihSpanlar = tarihEl?.querySelectorAll('span') || [];
          const gun = tarihSpanlar[0]?.textContent?.trim() || '';
          const yil = tarihSpanlar[1]?.textContent?.trim() || '';
          const tarih = gun && yil ? `${gun} ${yil}` : (tarihEl?.textContent?.trim() || '');

          // 30 günlük filtre: "12 Mart 2026" → Date
          if (gun && yil) {
            const parcalar = gun.split(' ');
            const ayAdi = (parcalar[1] || '').toLowerCase();
            const ayNo = TURK_AYLAR[ayAdi];
            if (ayNo !== undefined) {
              const ilanTarihi = new Date(parseInt(yil), ayNo, parseInt(parcalar[0]));
              if (ilanTarihi < otuzGunOnce) return; // 30 günden eski → atla
            }
          }

          const ilan: IlanVeri = {
            kaynak_site: 'sahibinden',
            kaynak_url,
            kaynak_id: id,
            baslik,
            aciklama: '',
            fiyat: fiyat ?? 0,
            fiyat_birimi: 'TL',
            tip: tip as 'satilik' | 'kiralik',
            kategori: 'daire',
            sehir: lokasyonParcalar[0] || '',
            ilce: lokasyonParcalar[1] || '',
            mahalle: lokasyonParcalar[2] || '',
            adres: lokasyonParcalar.join(', '),
            metrekare: metrekare ?? undefined,
            oda_sayisi: odaText || undefined,
            fotograflar: (fotografUrl && fotografUrl.startsWith('http') && !fotografUrl.includes('blank') && !fotografUrl.includes('/assets/images/')) ? [fotografUrl] : [],
            ilan_tarihi: tarih || undefined,
            taranan_at: new Date().toISOString(),
          };

          ilanlar.push(ilan);
        } catch {
          // Ayrıştırma hatası → atla
        }
      });

      return ilanlar;
    }, this.baseUrl, tip) as Promise<IlanVeri[]>;
  }

  /**
   * İlan detay sayfasından ek bilgileri çeker (aciklama, satici, tüm fotograflar)
   */
  async fetchIlanDetay(page: Page, ilan: IlanVeri): Promise<Partial<IlanVeri>> {
    try {
      await this.navigateWithFlareSolverr(page, ilan.kaynak_url, [1500, 3000]);
    } catch {
      return {};
    }
    await this.scrollPage(page);

    return page.evaluate(() => {
      const aciklamaEl = document.querySelector('.classifiedDescription');
      const aciklama = aciklamaEl?.textContent?.trim() || '';

      const saticiAdEl = document.querySelector('.username, .classifiedUserName');
      const saticiAd = saticiAdEl?.textContent?.trim() || '';

      const fotograflar: string[] = [];
      const seen = new Set<string>();

      // Sahibinden URL'sini büyük boyuta çevirir, mümkün değilse orijinali döner
      const toFullSize = (url: string): string => url.replace(/\/\d+x\d+\//, '/800x600/');

      // 1) img tag'lerinden dene
      const fotografEls = document.querySelectorAll(
        '.classifiedDetailMainPhotos img, .swiper-slide img, [class*="photo"] img, [class*="gallery"] img'
      ) as NodeListOf<HTMLImageElement>;
      fotografEls.forEach((img) => {
        const url = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('src') || '';
        if (url && url.startsWith('http') && !url.includes('no-image') && !url.includes('placeholder') && !url.includes('blank') && !url.includes('/assets/images/') && url.length > 20) {
          const fullUrl = toFullSize(url);
          if (!seen.has(fullUrl)) { seen.add(fullUrl); fotograflar.push(fullUrl); }
        }
      });

      // 2) Script tag'lerindeki JSON'dan çek (FlareSolverr statik HTML için)
      if (fotograflar.length === 0) {
        document.querySelectorAll('script').forEach((script) => {
          const text = script.textContent || '';
          // Sahibinden foto URL pattern: bilinen CDN'ler
          const cdnPattern = /cdn\.dsmcdn\.com|i\.emlakkulisi\.com|static\.sahibinden\.com|img\.sahibinden\.com|photos\.sahibinden\.com|cdn\.sahibinden\.com|uploads\.sahibinden\.com|s\.sahibinden\.com|i\d*\.hizliresim\.com|sahibinden-prod\.s3[^"]*\.amazonaws\.com/;
          const matches = text.matchAll(new RegExp('"(https?:\\/\\/(?:' + cdnPattern.source + ')[^"]+\\.(?:jpg|jpeg|png|webp)[^"]*)"', 'gi'));
          for (const m of matches) {
            const url = toFullSize(m[1]);
            if (!seen.has(url)) { seen.add(url); fotograflar.push(url); }
          }
          // Genel CDN URL pattern backup: "url", "src", "image" key'leri
          if (fotograflar.length === 0) {
            const generic = text.matchAll(/"(?:url|src|image|photo|thumbnail)"\s*:\s*"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi);
            for (const m of generic) {
              const url = toFullSize(m[1]);
              if (!seen.has(url) && !url.includes('logo') && !url.includes('icon') && !url.includes('avatar')) {
                seen.add(url); fotograflar.push(url);
              }
            }
          }
          // Son çare: sahibinden.com veya hizliresim içeren tüm .jpg/.png URL'leri
          if (fotograflar.length === 0) {
            const anyMatch = text.matchAll(/"(https?:\/\/[^"]*(?:sahibinden|hizliresim)[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi);
            for (const m of anyMatch) {
              const url = toFullSize(m[1]);
              if (!seen.has(url) && !url.includes('logo') && !url.includes('icon')) {
                seen.add(url); fotograflar.push(url);
              }
            }
          }
        });
      }

      const ozellikMap: Record<string, string> = {};
      document.querySelectorAll('.classified-properties li').forEach(li => {
        const parts = li.textContent?.split(':') || [];
        if (parts.length >= 2) {
          ozellikMap[parts[0].trim()] = parts.slice(1).join(':').trim();
        }
      });

      return {
        aciklama,
        satici_ad: saticiAd,
        satici_tip: 'bireysel' as const,
        fotograflar: fotograflar.length > 0 ? fotograflar : undefined,
        metrekare: parseFloat(ozellikMap['Metrekare (Brüt)'] || ozellikMap['m²'] || '0') || undefined,
        oda_sayisi: ozellikMap['Oda Sayısı'] || undefined,
        bina_yasi: parseInt(ozellikMap['Bina Yaşı'] || '0') || undefined,
        kat: ozellikMap['Bulunduğu Kat'] || undefined,
        isitma: ozellikMap['Isıtma'] || undefined,
        balkon: ozellikMap['Balkon'] ? ozellikMap['Balkon'].includes('Var') : undefined,
        asansor: ozellikMap['Asansör'] ? ozellikMap['Asansör'].includes('Var') : undefined,
        otopark: ozellikMap['Otopark'] ? ozellikMap['Otopark'].includes('Var') : undefined,
        esya: ozellikMap['Eşyalı'] ? ozellikMap['Eşyalı'].includes('Evet') : undefined,
      };
    }) as Promise<Partial<IlanVeri>>;
  }
}

// Test için doğrudan çalıştırma
if (require.main === module) {
  (async () => {
    const scraper = new SahibindenScraper();
    await scraper.scrapeAll();
  })();
}
