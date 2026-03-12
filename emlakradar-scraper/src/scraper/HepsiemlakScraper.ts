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
    { yol: '/satilik-daireler', tip: 'satilik' as const },
    { yol: '/kiralik-daireler', tip: 'kiralik' as const },
  ];

  async scrape(): Promise<void> {
    for (const kat of this.KATEGORILER) {
      await this.scrapeKategori(kat.yol, kat.tip);
      await new Promise(r => setTimeout(r, config.scraper.delayMax));
    }
  }

  private async scrapeKategori(yol: string, tip: 'satilik' | 'kiralik'): Promise<void> {
    const page = await this.newPage();

    try {
      const ilkUrl = `${this.baseUrl}${yol}`;
      await this.navigateTo(page, ilkUrl);

      const toplamSayfa = await this.getTotalPages(page);
      const taranacak = Math.min(toplamSayfa, config.scraper.maxPages);

      this.logger.info(`Hepsiemlak ${tip} — ${taranacak} sayfa`);

      for (let sayfa = 1; sayfa <= taranacak; sayfa++) {
        const sayfaUrl = sayfa === 1 ? ilkUrl : `${ilkUrl}?page=${sayfa}`;
        if (sayfa > 1) await this.navigateTo(page, sayfaUrl);

        await this.scrollPage(page);
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
      const kartlar = document.querySelectorAll('[data-id], .listing-item, .he-item');

      kartlar.forEach((kart: Element) => {
        try {
          const id = kart.getAttribute('data-id') || kart.getAttribute('data-listing-id') || '';
          if (!id) return;

          const baslikEl = kart.querySelector('h2 a, .listing-card-title a, .he-title');
          const baslik = baslikEl?.textContent?.trim() || '';
          const href = baslikEl?.getAttribute('href') || '';
          const kaynak_url = href.startsWith('http') ? href : baseUrl + href;

          const fiyatEl = kart.querySelector('.listing-price, .he-price, [class*="price"]');
          const fiyatText = fiyatEl?.textContent?.trim() || '';
          const fiyat = parseFloat(fiyatText.replace(/[^\d,]/g, '').replace(',', '.')) || null;

          const lokasyonEl = kart.querySelector('.listing-location, .he-location');
          const lokasyonParcalar = (lokasyonEl?.textContent?.trim() || '').split('/').map((s: string) => s.trim());

          const m2El = kart.querySelector('[class*="m2"], [class*="area"], [class*="size"]');
          const m2Text = m2El?.textContent?.trim() || '';
          const metrekare = parseFloat(m2Text.replace(/[^\d,]/g, '').replace(',', '.')) || null;

          const odaEl = kart.querySelector('[class*="room"], [class*="oda"]');
          const odaText = odaEl?.textContent?.trim() || null;

          const fotografEl = kart.querySelector('img[src*="hepsiemlak"], img[data-src]') as HTMLImageElement | null;
          const fotografUrl = fotografEl?.getAttribute('data-src') || fotografEl?.src || '';

          const tarihEl = kart.querySelector('[class*="date"], [class*="tarih"]');
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
            adres: lokasyonParcalar.join(', '),
            metrekare: metrekare ?? undefined,
            oda_sayisi: odaText ?? undefined,
            fotograflar: fotografUrl ? [fotografUrl] : [],
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
