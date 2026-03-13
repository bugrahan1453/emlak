/**
 * EmlakRadar Scraper — Hepsiemlak.com Scraper
 */
import type { Page } from 'puppeteer';
import { BaseScraper } from './BaseScraper';
import { IlanVeri } from '../types';
import { config } from '../config';

const ITEMS_PER_PAGE = 25;

export class HepsiemlakScraper extends BaseScraper {
  get kaynakAdi(): string { return 'Hepsiemlak'; }
  get baseUrl(): string { return 'https://www.hepsiemlak.com'; }

  private readonly KATEGORILER = [
    { suf: 'satilik-daireler', tip: 'satilik' as const },
    { suf: 'kiralik-daireler', tip: 'kiralik' as const },
  ];

  async scrape(): Promise<void> {
    const cities = config.scraper.cities;
    for (const kat of this.KATEGORILER) {
      for (const city of cities) {
        const yol = `/${city}-${kat.suf}`;
        await this.scrapeKategori(yol, kat.tip);
        await new Promise(r => setTimeout(r, config.scraper.delayMax));
      }
    }
  }

  private async scrapeKategori(yol: string, tip: 'satilik' | 'kiralik'): Promise<void> {
    const page = await this.newPage();

    try {
      const ilkUrl = `${this.baseUrl}${yol}`;
      this.logger.info(`Hepsiemlak URL: ${ilkUrl}`);
      await this.navigateWithFlareSolverr(page, ilkUrl);

      const toplamSayfa = await this.getTotalPages(page);
      const taranacak = Math.min(toplamSayfa, config.scraper.maxPages);

      this.logger.info(`Hepsiemlak ${tip} — ${taranacak} sayfa`);

      for (let sayfa = 1; sayfa <= taranacak; sayfa++) {
        const sayfaUrl = sayfa === 1 ? ilkUrl : `${ilkUrl}?page=${sayfa}`;
        if (sayfa > 1) await this.navigateWithFlareSolverr(page, sayfaUrl);

        await this.scrollPage(page);

        // Debug: sayfada hangi elementler var?
        const debugInfo = await page.evaluate(() => {
          const counts: Record<string, number> = {};
          const selectors = [
            '.listing-item', '.listing-item-v2', '[data-id]', '[data-listing-id]',
            '[data-cid]', 'a[href*="/ilan/"]', 'a[href*="/emlak/"]',
            '[class*="listing"]', '[class*="card"]', '[class*="result"]',
          ];
          for (const sel of selectors) {
            counts[sel] = document.querySelectorAll(sel).length;
          }
          counts['body_length'] = document.body?.innerHTML?.length ?? 0;
          const title = document.title;
          return { counts, title };
        });
        this.logger.info(`Debug Hepsiemlak sayfa yapısı: ${JSON.stringify(debugInfo)}`);

        const ilanlar = await this.parseSayfa(page, tip);

        // Her ilan için detay sayfasından tüm fotoları çek
        const detayPage = await this.newPage();
        try {
          for (const ilan of ilanlar) {
            if (ilan.kaynak_url) {
              const detay = await this.fetchHepsiemlakDetay(detayPage, ilan.kaynak_url);
              if (detay.fotograflar && detay.fotograflar.length > 0) {
                ilan.fotograflar = detay.fotograflar;
              }
            }
          }
        } finally {
          await detayPage.close();
        }

        await this.processIlanlar(ilanlar);

        this.logger.info(`Hepsiemlak sayfa ${sayfa}/${taranacak}: ${ilanlar.length} ilan`);
      }
    } finally {
      await page.close();
    }
  }

  private async getTotalPages(page: Page): Promise<number> {
    try {
      const text = await page.$eval('.total-count, [data-ga-category="listing-count"]', el => el.textContent?.trim() ?? '0');
      const sayi = parseInt(text.replace(/[^\d]/g, '')) || 0;
      return Math.ceil(sayi / ITEMS_PER_PAGE);
    } catch {
      return 1;
    }
  }

  private async fetchHepsiemlakDetay(page: Page, url: string): Promise<{ fotograflar: string[] }> {
    try {
      await this.navigateTo(page, url, [1500, 3000]);
      await this.scrollPage(page);

      return await page.evaluate(() => {
        const fotograflar: string[] = [];
        const selectors = [
          '.he-photos img',
          '.listing-gallery img',
          '.swiper-slide img',
          '[class*="photo"] img',
          '[class*="gallery"] img',
          '[class*="slider"] img',
        ];

        for (const sel of selectors) {
          document.querySelectorAll<HTMLImageElement>(sel).forEach((img) => {
            const url = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src;
            if (url && url.startsWith('http') && !url.includes('no-image') && !url.includes('placeholder')) {
              // Thumbnail URL'ini full-size'a çevir (hepsiemlak CDN pattern)
              const fullUrl = url
                .replace(/\/unsafe\/\d+x\d+\//, '/unsafe/1024x768/')
                .replace(/[?&](width|w)=\d+/, '')
                .replace(/[?&](height|h)=\d+/, '');
              if (!fotograflar.includes(fullUrl)) fotograflar.push(fullUrl);
            }
          });
          if (fotograflar.length > 0) break;
        }

        return { fotograflar };
      }) as { fotograflar: string[] };
    } catch {
      return { fotograflar: [] };
    }
  }

  private async parseSayfa(page: Page, tip: 'satilik' | 'kiralik'): Promise<IlanVeri[]> {
    return page.evaluate((baseUrl: string, tip: string) => {
      const ilanlar: IlanVeri[] = [];

      // Hepsiemlak çeşitli sürümlerde farklı sınıf isimleri kullanır
      const selGruplar = [
        '.listing-item',
        '.listing-item-v2',
        'li[data-id]',
        'article[data-id]',
        '[data-listing-id]',
        '[data-cid]',
        '.he-listing',
        '.search-results-item',
      ];

      let kartlar: NodeListOf<Element> | null = null;
      for (const sel of selGruplar) {
        const found = document.querySelectorAll(sel);
        if (found.length > 2) { kartlar = found; break; }
      }

      // Hiç bulunamazsa sayfadaki tüm ilan linklerini dene
      if (!kartlar || kartlar.length === 0) {
        kartlar = document.querySelectorAll('a[href*="/ilan/"]');
      }

      kartlar.forEach((kart: Element) => {
        try {
          // ID: data-id, data-listing-id, data-cid veya URL'den
          let id = kart.getAttribute('data-id')
            || kart.getAttribute('data-listing-id')
            || kart.getAttribute('data-cid')
            || '';

          // Başlık bağlantısını bul
          const baslikEl = kart.querySelector(
            'h2 a, h3 a, .listing-card-title a, .listing-title a, .he-title a, a[title]'
          ) || (kart.tagName === 'A' ? kart : null);
          const baslik = baslikEl?.textContent?.trim() || (baslikEl as HTMLAnchorElement | null)?.title || '';

          const href = (baslikEl as HTMLAnchorElement | null)?.getAttribute('href')
            || (kart.tagName === 'A' ? (kart as HTMLAnchorElement).getAttribute('href') : '')
            || '';

          // ID yoksa URL'den çıkar
          if (!id && href) {
            const m = href.match(/\/([a-zA-Z0-9-]+-(\d+))(?:\/|\?|$)/);
            id = m ? m[2] : '';
          }
          if (!id || !baslik) return;

          const kaynak_url = href.startsWith('http') ? href : baseUrl + href;

          const fiyatEl = kart.querySelector(
            '.listing-price, .he-price, [class*="price"], [class*="fiyat"]'
          );
          const fiyatText = fiyatEl?.textContent?.trim() || '';
          // Türkçe format: 2.500.000 TL
          const fiyat = parseFloat(fiyatText.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '')) || null;

          const lokasyonEl = kart.querySelector(
            '.listing-location, .he-location, [class*="location"], [class*="adres"], [class*="konum"]'
          );
          const lokasyonMetin = lokasyonEl?.textContent?.trim() || '';
          const lokasyonParcalar = lokasyonMetin.split(/[\/,]/).map((s: string) => s.trim()).filter(Boolean);

          const m2El = kart.querySelector('[class*="m2"], [class*="meter"], [class*="area"], [class*="size"]');
          const m2Text = m2El?.textContent?.trim() || '';
          const metrekare = parseFloat(m2Text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '')) || null;

          const odaEl = kart.querySelector('[class*="room"], [class*="oda"], [class*="bedroom"]');
          const odaText = odaEl?.textContent?.trim() || null;

          const fotografEl = kart.querySelector('img') as HTMLImageElement | null;
          const fotografUrl = fotografEl?.getAttribute('data-src')
            || fotografEl?.getAttribute('data-lazy')
            || fotografEl?.getAttribute('data-original')
            || fotografEl?.src
            || '';

          const tarihEl = kart.querySelector('[class*="date"], [class*="tarih"], time');
          const tarih = tarihEl?.textContent?.trim() || '';

          ilanlar.push({
            kaynak_site: 'hepsiemlak',
            kaynak_url,
            kaynak_id: `he_${id}`,
            baslik,
            aciklama: '',
            fiyat: fiyat ?? 0,
            fiyat_birimi: 'TL',
            tip: tip as 'satilik' | 'kiralik',
            kategori: 'daire',
            sehir: lokasyonParcalar[0] || '',
            ilce: lokasyonParcalar[1] || '',
            mahalle: lokasyonParcalar[2] || '',
            adres: lokasyonMetin,
            metrekare: metrekare ?? undefined,
            oda_sayisi: odaText ?? undefined,
            fotograflar: fotografUrl && fotografUrl.startsWith('http') ? [fotografUrl] : [],
            ilan_tarihi: tarih || undefined,
            taranan_at: new Date().toISOString(),
          });
        } catch {
          // atla
        }
      });

      return ilanlar;
    }, this.baseUrl, tip) as Promise<IlanVeri[]>;
  }
}
