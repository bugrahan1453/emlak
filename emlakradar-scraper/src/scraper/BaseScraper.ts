/**
 * EmlakRadar Scraper — Temel Scraper Sınıfı
 */
import type { Browser, Page } from 'puppeteer';
import { IlanVeri, ScraperStats } from '../types';
import { launchBrowser, applyStealthToPage } from '../anti-detection/StealthConfig';
import { simulateHumanBehavior, waitForPageLoad, randomMouseMove } from '../anti-detection/HumanSimulator';
import { proxyManager } from '../anti-detection/ProxyManager';
import { analyzeFake } from '../analyzers/FakeDetector';
import { findDuplicate } from '../analyzers/DuplicateFinder';
import { trackIlan } from '../analyzers/GhostTracker';
import { sendYeniIlanlar, sendGuncelleme, sendFiyatDegisiklik, sendSahteIlan } from '../api/CpanelClient';
import { emitYeniIlan, emitKirmiziAlarm, emitFiyatDegisiklik } from '../websocket/SocketServer';
import { randomDelay, fiyatDegisimYuzdesi } from '../utils/Helpers';
import { createLogger } from '../utils/Logger';
import { solveCloudflare, isCloudflarePage, FlareCookie } from '../utils/FlareSolverr';
import { config } from '../config';

export abstract class BaseScraper {
  protected readonly logger = createLogger(this.constructor.name);
  protected browser: Browser | null = null;
  protected stats: ScraperStats = {
    baslangic: new Date(),
    taranan_sayfa: 0,
    bulunan_ilan: 0,
    yeni_ilan: 0,
    guncellenen: 0,
    hata_sayisi: 0,
    sahte_tespit: 0,
    mukerrer_tespit: 0,
  };

  // Daha önce görülmüş ilanları takip etmek için bellek içi depo
  // Gerçek uygulamada bu veritabanından/Redis'ten gelecek
  protected seenIlanlar: Map<string, IlanVeri> = new Map();

  abstract get kaynakAdi(): string;
  abstract get baseUrl(): string;

  /**
   * Browser başlat
   */
  async init(): Promise<void> {
    this.logger.info(`${this.kaynakAdi} scraper başlatılıyor...`);

    const proxy = proxyManager.getNext();
    const launchArgs = proxy ? [proxyManager.getLaunchArg(proxy)] : [];

    this.browser = await launchBrowser();
    this.logger.info(`Browser başlatıldı${proxy ? ` (proxy: ${proxy.host}:${proxy.port})` : ''}`);
  }

  /**
   * Browser kapat
   */
  async destroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.logger.info('Browser kapatıldı');
    }
  }

  /**
   * Yeni sayfa oluştur ve stealth uygula
   */
  protected async newPage(): Promise<Page> {
    if (!this.browser) throw new Error('Browser başlatılmamış');
    const page = await this.browser.newPage();
    await applyStealthToPage(page);

    // Proxy kimlik doğrulama
    const proxy = proxyManager.getNext();
    if (proxy) {
      await proxyManager.setPageAuthentication(page, proxy);
    }

    // Gereksiz kaynakları engelle
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(type) && !req.url().includes('captcha')) {
        req.abort();
      } else {
        req.continue();
      }
    });

    return page;
  }

  /**
   * URL'e git (insan gibi) — Cloudflare tespit edilirse FlareSolverr ile çözer
   */
  protected async navigateTo(page: Page, url: string, waitMs?: [number, number]): Promise<void> {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // CF koruması var mı kontrol et
    const title = await page.title().catch(() => '');
    const bodySnippet = await page.evaluate(() => document.body?.innerHTML?.substring(0, 500) ?? '').catch(() => '');

    if (isCloudflarePage(title, bodySnippet)) {
      this.logger.warn(`Cloudflare tespit edildi: ${url} — FlareSolverr devreye giriyor`);
      await this.bypassCloudflare(page, url);
    }

    const [min, max] = waitMs ?? [config.scraper.delayMin, config.scraper.delayMax];
    await randomDelay(min, max);
    await randomMouseMove(page);
  }

  /**
   * FlareSolverr ile CF cookie alır ve sayfaya inject eder
   */
  private async bypassCloudflare(page: Page, url: string): Promise<void> {
    const result = await solveCloudflare(url);
    if (!result) {
      this.logger.error('FlareSolverr CF çözümü başarısız');
      return;
    }

    // Cookie'leri Puppeteer formatına çevir ve set et
    const puppeteerCookies = result.cookies.map((c: FlareCookie) => ({
      name: c.name,
      value: c.value,
      domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
      path: c.path || '/',
      expires: c.expires > 0 ? c.expires : undefined,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: (c.sameSite as 'Strict' | 'Lax' | 'None') || 'Lax',
    }));

    await page.setCookie(...puppeteerCookies);
    await page.setUserAgent(result.userAgent);

    // Cookie'leri set ettikten sonra tekrar git
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    this.logger.info(`CF bypass tamamlandı: ${url}`);
  }

  /**
   * İlanları işle: analiz et, kaydet, gönder
   */
  protected async processIlanlar(ilanlar: IlanVeri[]): Promise<void> {
    const yeniIlanlar: IlanVeri[] = [];
    const tumMevcut = Array.from(this.seenIlanlar.values());

    for (const ilan of ilanlar) {
      this.stats.bulunan_ilan++;

      // Sahte ilan analizi
      const fakeResult = analyzeFake(ilan, tumMevcut);
      ilan.sahtelik_skoru = fakeResult.skor;
      ilan.muhtemelen_sahte = fakeResult.muhtemelen_sahte;

      if (fakeResult.muhtemelen_sahte) {
        this.stats.sahte_tespit++;
        await sendSahteIlan(ilan, fakeResult.skor, fakeResult.nedenler).catch(() => {});
        emitKirmiziAlarm(ilan, fakeResult.skor, fakeResult.nedenler);
      }

      // Mükerrer ilan analizi
      const dupResult = findDuplicate(ilan, tumMevcut);
      if (dupResult.mukerrer) {
        this.stats.mukerrer_tespit++;
        ilan.mukerrer_grup_id = dupResult.grup_id ?? undefined;
      }

      // Daha önce görüldü mü?
      const mevcut = this.seenIlanlar.get(ilan.kaynak_id);
      if (mevcut) {
        // Fiyat değişikliği kontrolü
        if (mevcut.fiyat && ilan.fiyat && mevcut.fiyat !== ilan.fiyat) {
          const degisim = fiyatDegisimYuzdesi(mevcut.fiyat, ilan.fiyat);
          this.stats.guncellenen++;
          await sendFiyatDegisiklik(ilan, mevcut.fiyat, ilan.fiyat, degisim).catch(() => {});
          emitFiyatDegisiklik(ilan, mevcut.fiyat, ilan.fiyat, degisim);
        }
      } else {
        this.stats.yeni_ilan++;
        yeniIlanlar.push(ilan);
        trackIlan(ilan);
        emitYeniIlan(ilan);
      }

      // Güncelle
      this.seenIlanlar.set(ilan.kaynak_id, ilan);
    }

    // Yeni ilanları toplu gönder
    if (yeniIlanlar.length > 0) {
      await sendYeniIlanlar(yeniIlanlar).catch((err) => {
        this.logger.error('Webhook gönderme hatası', { err: err.message });
        this.stats.hata_sayisi++;
      });
    }
  }

  /**
   * Ana scraping işlemi (alt sınıfta implement edilmeli)
   */
  abstract scrape(): Promise<void>;

  /**
   * Tüm sayfaları tara
   */
  async scrapeAll(): Promise<ScraperStats> {
    this.stats.baslangic = new Date();

    try {
      await this.init();
      await this.scrape();
    } catch (err) {
      this.logger.error(`${this.kaynakAdi} scraping hatası`, { err });
      this.stats.hata_sayisi++;
    } finally {
      this.stats.bitis = new Date();
      await this.destroy();
    }

    this.logger.info(`${this.kaynakAdi} tamamlandı`, this.stats);
    return this.stats;
  }

  /**
   * Human simulation ile sayfa scroll
   */
  protected async scrollPage(page: Page): Promise<void> {
    await simulateHumanBehavior(page);
  }

  getStats(): ScraperStats {
    return { ...this.stats };
  }
}
