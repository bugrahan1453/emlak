/**
 * EmlakRadar Scraper — Emlakjet.com Scraper
 */
import type { Page } from 'puppeteer';
import { BaseScraper } from './BaseScraper';
import { IlanVeri } from '../types';
import { config } from '../config';

const ITEMS_PER_PAGE = 20;

export class EmlakjetScraper extends BaseScraper {
  get kaynakAdi(): string { return 'Emlakjet'; }
  get baseUrl(): string { return 'https://www.emlakjet.com'; }

  private readonly KATEGORILER = [
    { yol: '/satilik-daire', tip: 'satilik' as const },
    { yol: '/kiralik-daire', tip: 'kiralik' as const },
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
      const ilkUrl = `${this.baseUrl}${yol}/`;
      await this.navigateTo(page, ilkUrl);

      const toplamSayfa = await this.getTotalPages(page);
      const taranacak = Math.min(toplamSayfa, config.scraper.maxPages);

      this.logger.info(`Emlakjet ${tip} — ${taranacak} sayfa`);

      for (let sayfa = 1; sayfa <= taranacak; sayfa++) {
        const sayfaUrl = sayfa === 1 ? ilkUrl : `${ilkUrl}?page=${sayfa}`;
        if (sayfa > 1) await this.navigateTo(page, sayfaUrl);

        // Emlakjet infinite scroll veya lazy load için bekle
        await page.waitForSelector('[class*="listing"], [class*="card"], article', { timeout: 10000 }).catch(() => {});

        await this.scrollPage(page);
        const ilanlar = await this.parseSayfa(page, tip);
        await this.processIlanlar(ilanlar);

        this.logger.info(`Emlakjet sayfa ${sayfa}/${taranacak}: ${ilanlar.length} ilan`);
      }
    } finally {
      await page.close();
    }
  }

  private async getTotalPages(page: Page): Promise<number> {
    try {
      // Emlakjet React tabanlı — veri genellikle JSON olarak gömülü
      const countText = await page.$eval(
        '[class*="result-count"], [class*="listing-count"], [class*="count"]',
        el => el.textContent?.trim() ?? '0'
      );
      const sayi = parseInt(countText.replace(/[^\d]/g, '')) || 0;
      return Math.ceil(sayi / ITEMS_PER_PAGE);
    } catch {
      return 1;
    }
  }

  private async parseSayfa(page: Page, tip: 'satilik' | 'kiralik'): Promise<IlanVeri[]> {
    return page.evaluate((baseUrl: string, tip: string) => {
      const ilanlar: IlanVeri[] = [];

      // Emlakjet ilanları — çeşitli sınıf formatlarını dene
      const selektorler = [
        '[class*="listing-card"]',
        '[class*="ListingCard"]',
        '[class*="property-card"]',
        'article[data-id]',
        'a[href*="/ilan/"]',
      ];

      let kartlar: NodeListOf<Element> | null = null;
      for (const sel of selektorler) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) { kartlar = found; break; }
      }

      if (!kartlar) return ilanlar;

      kartlar.forEach((kart: Element) => {
        try {
          // ID'yi data attribute'tan veya href'ten çıkar
          let id = kart.getAttribute('data-id') || kart.getAttribute('data-listing-id') || '';
          const href = (kart as HTMLAnchorElement).href || kart.querySelector('a')?.getAttribute('href') || '';
          if (!id && href) {
            const m = href.match(/\/ilan\/(\d+)/);
            id = m ? m[1] : '';
          }
          if (!id) return;

          const kaynak_url = href.startsWith('http') ? href : baseUrl + href;

          const baslikEl = kart.querySelector('[class*="title"], h2, h3');
          const baslik = baslikEl?.textContent?.trim() || '';

          const fiyatEl = kart.querySelector('[class*="price"], [class*="fiyat"]');
          const fiyatText = fiyatEl?.textContent?.trim() || '';
          const fiyat = parseFloat(fiyatText.replace(/[^\d]/g, '')) || null;

          const lokasyonEl = kart.querySelector('[class*="location"], [class*="location"]');
          const lokasyonMetin = lokasyonEl?.textContent?.trim() || '';
          const lokasyonParcalar = lokasyonMetin.split(/[,\/]/).map((s: string) => s.trim());

          const m2El = kart.querySelector('[class*="m2"], [class*="area"]');
          const metrekare = parseFloat((m2El?.textContent?.trim() || '').replace(/[^\d,]/g, '').replace(',', '.')) || null;

          const odaEl = kart.querySelector('[class*="room"], [class*="oda"]');
          const odaText = odaEl?.textContent?.trim() || null;

          const fotografEl = kart.querySelector('img') as HTMLImageElement | null;
          const fotografUrl = fotografEl?.getAttribute('data-src') || fotografEl?.src || fotografEl?.getAttribute('data-lazy') || '';

          ilanlar.push({
            kaynak_site: 'emlakjet',
            kaynak_url,
            kaynak_id: `ej_${id}`,
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
            fotograflar: fotografUrl ? [fotografUrl] : [],
            taranan_at: new Date().toISOString(),
          });
        } catch {
          // atla
        }
      });

      // Aynı sayfada aynı ID'li birden fazla element olabilir — tekilleştir
      const seenIds = new Set<string>();
      return ilanlar.filter(i => {
        if (seenIds.has(i.kaynak_id)) return false;
        seenIds.add(i.kaynak_id);
        return true;
      });
    }, this.baseUrl, tip) as Promise<IlanVeri[]>;
  }
}
