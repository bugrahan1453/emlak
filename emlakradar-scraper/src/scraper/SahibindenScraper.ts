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
        const sayfaUrl = sayfa === 1 ? ilkUrl : `${ilkUrl}?pagingOffset=${(sayfa - 1) * ITEMS_PER_PAGE}`;

        if (sayfa > 1) {
          await this.navigateWithFlareSolverr(page, sayfaUrl);
        }

        await this.scrollPage(page);
        const ilanlar = await this.parseSayfaIlanlar(page, tip);
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
      const ilanlar: IlanVeri[] = [];
      const satirlar = document.querySelectorAll('tr.searchResultsItem');

      satirlar.forEach((satir: Element) => {
        try {
          const id = satir.getAttribute('data-id') || '';
          if (!id) return;

          // Emlakçı (mağaza) ilanlarını atla — sadece bireysel ilanlar
          if (satir.querySelector('.store-icon, .titleIcon.store-icon')) return;

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

          // getAttribute kullan — setContent bağlamında img.src about:blank'e göre resolve olabilir
          const fotografEl = satir.querySelector('td.searchResultsLargeThumbnail img');
          const fotografUrl = fotografEl?.getAttribute('src') || fotografEl?.getAttribute('data-src') || '';

          const tarihEl = satir.querySelector('.searchResultsDateValue');
          const tarih = tarihEl?.textContent?.trim() || '';

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
            fotograflar: fotografUrl ? [fotografUrl] : [],
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
    await this.navigateTo(page, ilan.kaynak_url, [2000, 4000]);
    await this.scrollPage(page);

    return page.evaluate(() => {
      const aciklamaEl = document.querySelector('.classifiedDescription');
      const aciklama = aciklamaEl?.textContent?.trim() || '';

      const saticiAdEl = document.querySelector('.username, .classifiedUserName');
      const saticiAd = saticiAdEl?.textContent?.trim() || '';

      const fotograflar: string[] = [];
      const fotografEls = document.querySelectorAll('.classifiedDetailMainPhotos img, .swiper-slide img') as NodeListOf<HTMLImageElement>;
      fotografEls.forEach((img) => {
        const url = img.getAttribute('data-src') || img.src;
        if (url && !url.includes('no-image')) {
          fotograflar.push(url);
        }
      });

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
