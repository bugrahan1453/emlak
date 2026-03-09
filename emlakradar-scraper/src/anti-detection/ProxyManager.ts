/**
 * EmlakRadar Scraper — Proxy Havuzu & Rotasyon Yöneticisi
 */
import { createLogger } from '../utils/Logger';
import { config } from '../config';

const logger = createLogger('ProxyManager');

export interface ProxyEntry {
  url: string;         // http://user:pass@host:port
  host: string;
  port: number;
  username?: string;
  password?: string;
  failures: number;
  lastUsed: number;
  lastChecked: number;
  healthy: boolean;
}

const MAX_FAILURES = 3;
const COOLDOWN_MS  = 5 * 60 * 1000; // 5 dakika

class ProxyManager {
  private proxies: ProxyEntry[] = [];
  private currentIndex = 0;

  constructor() {
    this.loadProxies();
  }

  private loadProxies(): void {
    const list = config.proxy.list;
    if (!list.length) {
      logger.info('Proxy listesi boş — direkt bağlantı kullanılacak');
      return;
    }

    this.proxies = list.map(raw => this.parseProxy(raw)).filter(Boolean) as ProxyEntry[];
    logger.info(`${this.proxies.length} proxy yüklendi`);
  }

  private parseProxy(raw: string): ProxyEntry | null {
    try {
      // Format: host:port veya user:pass@host:port veya http://user:pass@host:port
      let url = raw.trim();
      if (!url.startsWith('http')) url = 'http://' + url;

      const u = new URL(url);
      return {
        url,
        host: u.hostname,
        port: parseInt(u.port) || 8080,
        username: u.username || undefined,
        password: u.password || undefined,
        failures: 0,
        lastUsed: 0,
        lastChecked: 0,
        healthy: true,
      };
    } catch (e) {
      logger.warn(`Geçersiz proxy formatı: ${raw}`);
      return null;
    }
  }

  /**
   * Sağlıklı bir sonraki proxy döndürür (round-robin)
   */
  getNext(): ProxyEntry | null {
    if (this.proxies.length === 0) return null;

    const now = Date.now();
    const healthy = this.proxies.filter(p =>
      p.healthy || (now - p.lastChecked > COOLDOWN_MS) // cooldown bittiyse tekrar dene
    );

    if (healthy.length === 0) {
      logger.warn('Tüm proxy\'ler devre dışı, direkt bağlantıya geçiliyor');
      return null;
    }

    // En az kullanılan ve en eski kullanılanı seç
    healthy.sort((a, b) => a.lastUsed - b.lastUsed);
    const proxy = healthy[this.currentIndex % healthy.length];
    this.currentIndex = (this.currentIndex + 1) % healthy.length;
    proxy.lastUsed = now;
    return proxy;
  }

  /**
   * Proxy başarısız → hata sayısını artır, gerekirse devre dışı bırak
   */
  reportFailure(proxyUrl: string): void {
    const proxy = this.proxies.find(p => p.url === proxyUrl);
    if (!proxy) return;

    proxy.failures++;
    proxy.lastChecked = Date.now();

    if (proxy.failures >= MAX_FAILURES) {
      proxy.healthy = false;
      logger.warn(`Proxy devre dışı bırakıldı: ${proxy.host}:${proxy.port} (${proxy.failures} hata)`);
    }
  }

  /**
   * Proxy başarılı → hata sayısını sıfırla
   */
  reportSuccess(proxyUrl: string): void {
    const proxy = this.proxies.find(p => p.url === proxyUrl);
    if (!proxy) return;
    proxy.failures = 0;
    proxy.healthy = true;
    proxy.lastChecked = Date.now();
  }

  /**
   * Tüm proxy istatistikleri
   */
  getStats(): { total: number; healthy: number; failed: number } {
    return {
      total: this.proxies.length,
      healthy: this.proxies.filter(p => p.healthy).length,
      failed: this.proxies.filter(p => !p.healthy).length,
    };
  }

  /**
   * Puppeteer launch args için proxy argümanı üret
   */
  getLaunchArg(proxy: ProxyEntry): string {
    return `--proxy-server=${proxy.host}:${proxy.port}`;
  }

  /**
   * Puppeteer page için kimlik doğrulama ayarla
   */
  async setPageAuthentication(page: import('puppeteer').Page, proxy: ProxyEntry): Promise<void> {
    if (proxy.username && proxy.password) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }
  }

  get hasProxies(): boolean {
    return this.proxies.length > 0;
  }
}

// Singleton
export const proxyManager = new ProxyManager();
