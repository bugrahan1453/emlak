/**
 * EmlakRadar Scraper — İnsan Davranışı Simülatörü
 */
import type { Page } from 'puppeteer';
import { randomDelay } from '../utils/Helpers';

/**
 * Sayfa boyunca yavaş scroll yapar
 */
export async function humanScroll(page: Page, steps = 5): Promise<void> {
  const scrollHeight: number = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight: number = await page.evaluate(() => window.innerHeight);
  const maxScroll = Math.max(0, scrollHeight - viewportHeight);

  if (maxScroll <= 0) return;

  const stepSize = maxScroll / steps;

  for (let i = 1; i <= steps; i++) {
    const targetY = Math.min(stepSize * i + (Math.random() - 0.5) * 100, maxScroll);
    await page.evaluate((y: number) => {
      window.scrollTo({ top: y, behavior: 'smooth' });
    }, targetY);
    await randomDelay(300, 800);
  }

  // Biraz yukarı kaydır (gerçek kullanıcı gibi)
  if (Math.random() > 0.4) {
    const backY = maxScroll * (0.6 + Math.random() * 0.3);
    await page.evaluate((y: number) => window.scrollTo({ top: y, behavior: 'smooth' }), backY);
    await randomDelay(200, 500);
  }
}

/**
 * Sayfanın üst kısmına geri döner
 */
export async function scrollToTop(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await randomDelay(300, 600);
}

/**
 * Rastgele bir eleman üzerine mouse hareket ettirir
 */
export async function randomMouseMove(page: Page): Promise<void> {
  const viewport = page.viewport();
  if (!viewport) return;

  const points = Math.floor(Math.random() * 3) + 2;
  for (let i = 0; i < points; i++) {
    const x = Math.floor(Math.random() * viewport.width);
    const y = Math.floor(Math.random() * viewport.height);
    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
    await randomDelay(50, 200);
  }
}

/**
 * Belirtilen selector'a hover yapar
 */
export async function hoverElement(page: Page, selector: string): Promise<boolean> {
  try {
    const el = await page.$(selector);
    if (!el) return false;
    await el.hover();
    await randomDelay(100, 400);
    return true;
  } catch {
    return false;
  }
}

/**
 * İnsan gibi yazı yazar (her karakter arası rastgele bekleme)
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 80) + 30 });
  }
}

/**
 * Sayfa yüklenmesi + ek bekleme (insan gibi okuma süresi)
 */
export async function waitForPageLoad(page: Page, minMs = 1500, maxMs = 3500): Promise<void> {
  try {
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch {
    // Navigation event gelmese de devam et
  }
  await randomDelay(minMs, maxMs);
}

/**
 * Rastgele bir linke tıklayıp geri gelir (gerçek gezinti simulasyonu)
 */
export async function randomNavigation(page: Page): Promise<void> {
  if (Math.random() > 0.3) return; // %70 ihtimalle atla

  try {
    const links: string[] = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      return anchors
        .map(a => a.href)
        .filter(h => h.startsWith(window.location.origin) && !h.includes('#') && !h.includes('login') && !h.includes('giris'));
    });

    if (links.length === 0) return;

    const link = links[Math.floor(Math.random() * Math.min(links.length, 5))];
    const currentUrl = page.url();

    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await randomDelay(800, 2000);
    await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await randomDelay(500, 1500);
  } catch {
    // Hata olursa sessizce devam et
  }
}

/**
 * Tam insan simülasyon paketi: scroll + mouse + bekleme
 */
export async function simulateHumanBehavior(page: Page): Promise<void> {
  await randomMouseMove(page);
  await randomDelay(200, 500);
  await humanScroll(page, Math.floor(Math.random() * 4) + 3);
  await randomDelay(500, 1200);
  await randomMouseMove(page);
}
