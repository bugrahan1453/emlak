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

  // Satılık daire + kiralık daire kategorileri
  private readonly KATEGORILER = [
    { url: '/satilik-daire', tip: 'satilik' as const },
    { url: '/kiralik-daire', tip: 'kiralik' as const },
  ];

  async scrape(): Promise<void> {
    for (const kategori of this.KATEGORILER) {
      await this.scrapeKategori(kategori.url, kategori.tip);
      // Kategoriler arası bekleme
      await new Promise(r => setTimeout(r, config.scraper.delayMax));
    }
  }

  private async scrapeKategori(yol: string, tip: 'satilik' | 'kiralik'): Promise<void> {
    const page = await this.newPage();

    try {
      const ilkUrl = `${this.baseUrl}${yol}`;
      await this.navigateTo(page, ilkUrl);

      // Toplam sayfa sayısını bul
      const toplamSayfa = await this.getTotalPages(page);
      const taranacakSayfa = Math.min(toplamSayfa, config.scraper.maxPages);

      this.logger.info(`${tip} — ${taranacakSayfa} sayfa taranacak`);

      for (let sayfa = 1; sayfa <= taranacakSayfa; sayfa++) {
        const sayfaUrl = sayfa === 1 ? ilkUrl : `${ilkUrl}?pagingOffset=${(sayfa - 1) * ITEMS_PER_PAGE}`;

        if (sayfa > 1) {
          await this.navigateTo(page, sayfaUrl);
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

          const baslikEl = satir.querySelector('.classifiedTitle');
          const baslik = baslikEl?.textContent?.trim() || '';
          const href = baslikEl?.getAttribute('href') || '';
          const kaynak_url = href.startsWith('http') ? href : baseUrl + href;

          const fiyatEl = satir.querySelector('.searchResultsPriceValue');
          const fiyatText = fiyatEl?.textContent?.trim() || '';
          const fiyat = parseFloat(fiyatText.replace(/[^\d,]/g, '').replace(',', '.')) || null;

          const lokasyonEl = satir.querySelector('.searchResultsLocationValue');
          const lokasyonParcalar = lokasyonEl?.textContent?.trim().split('/').map((s: string) => s.trim()) || [];

          const m2El = satir.querySelector('[title*="m²"], [title*="m2"]');
          const m2Text = m2El?.textContent?.trim() || '';
          const metrekare = parseFloat(m2Text.replace(/[^\d,]/g, '').replace(',', '.')) || null;

          const odaEl = satir.querySelector('.searchResultsAttributeValue:nth-child(1)');
          const odaText = odaEl?.textContent?.trim() || '';

          const fotografEl = satir.querySelector('.searchResultsImage img') as HTMLImageElement | null;
          const fotografUrl = fotografEl?.src || fotografEl?.getAttribute('data-src') || '';

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
