/**
 * EmlakRadar Scraper — Puppeteer Stealth Konfigürasyonu
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, LaunchOptions, Page } from 'puppeteer';
import { randomDesktopUserAgent } from './UserAgents';
import { config } from '../config';

// Stealth plugin'i kaydet
puppeteer.use(StealthPlugin());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const LAUNCH_OPTIONS: LaunchOptions & Record<string, any> = {
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--window-size=1920,1080',
    '--start-maximized',
    '--disable-extensions-except=',
    '--disable-plugins-discovery',
    '--disable-default-apps',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    '--hide-scrollbars',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--safebrowsing-disable-auto-update',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--lang=tr-TR,tr;q=0.9',
  ],
  ignoreDefaultArgs: ['--enable-automation'],
};

/**
 * Yeni browser başlatır
 */
export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch(LAUNCH_OPTIONS) as unknown as Browser;
}

/**
 * Sayfa için gizlilik ayarlarını uygular
 */
export async function applyStealthToPage(page: Page): Promise<void> {
  const ua = randomDesktopUserAgent();

  await page.setUserAgent(ua);
  await page.setViewport({
    width: 1366 + Math.floor(Math.random() * 554),  // 1366–1920
    height: 768 + Math.floor(Math.random() * 312),  // 768–1080
    deviceScaleFactor: 1,
    hasTouch: false,
    isLandscape: true,
    isMobile: false,
  });

  // Extra headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
  });

  // navigator.webdriver'ı gizle
  await page.evaluateOnNewDocument(() => {
    // webdriver flag kaldır
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Chrome object ekle
    (window as unknown as Record<string, unknown>).chrome = {
      app: { isInstalled: false, InstallState: {}, RunningState: {} },
      csi: () => {},
      loadTimes: () => {},
      runtime: {},
    };

    // Permissions API mock
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery(parameters);
    }

    // Plugin listesi sahte doldur
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];
        return Object.assign(plugins, { item: (i: number) => plugins[i], namedItem: (n: string) => plugins.find(p => p.name === n) ?? null });
      },
    });

    // Dil ayarları
    Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US', 'en'] });
    Object.defineProperty(navigator, 'language',  { get: () => 'tr-TR' });
  });

  // İstemci ipucu başlıkları
  await page.setExtraHTTPHeaders({
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  });
}

export { puppeteer };
