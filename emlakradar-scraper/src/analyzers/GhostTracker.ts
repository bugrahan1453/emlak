/**
 * EmlakRadar Scraper — Hayalet İlan Takipçisi
 * Her 6 saatte bir HEAD isteği → 404/redirect = silindi
 */
import axios from 'axios';
import { IlanVeri, GhostCheckResult } from '../types';
import { createLogger } from '../utils/Logger';
import { config } from '../config';

const logger = createLogger('GhostTracker');

interface TrackedIlan {
  kaynak_id: string;
  kaynak_url: string;
  kaynak_site: string;
  son_kontrol: number;
  silindi: boolean;
}

const izlenen: Map<string, TrackedIlan> = new Map();
let intervalHandle: NodeJS.Timeout | null = null;

/**
 * İlanı izleme listesine ekle
 */
export function trackIlan(ilan: IlanVeri): void {
  if (!ilan.kaynak_url || izlenen.has(ilan.kaynak_id)) return;

  izlenen.set(ilan.kaynak_id, {
    kaynak_id: ilan.kaynak_id,
    kaynak_url: ilan.kaynak_url,
    kaynak_site: ilan.kaynak_site,
    son_kontrol: 0,
    silindi: false,
  });
}

/**
 * İlanı izleme listesinden kaldır
 */
export function untrackIlan(kaynak_id: string): void {
  izlenen.delete(kaynak_id);
}

/**
 * Tek bir ilan için HEAD isteği kontrol
 */
export async function checkIlan(tracked: TrackedIlan): Promise<GhostCheckResult> {
  const baslangic = Date.now();

  try {
    const response = await axios.head(tracked.kaynak_url, {
      timeout: 10000,
      maxRedirects: 0,
      validateStatus: () => true, // tüm status kodlarını kabul et
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EmlakRadarBot/1.0)',
        'Accept': '*/*',
      },
    });

    tracked.son_kontrol = Date.now();

    // 404 veya 410 = kesinlikle silindi
    if (response.status === 404 || response.status === 410) {
      tracked.silindi = true;
      logger.info(`İlan silindi (${response.status}): ${tracked.kaynak_id}`);
      return { kaynak_url: tracked.kaynak_url, kaynak_id: tracked.kaynak_id, silindi: true, http_kodu: response.status, kontrol_zamani: new Date().toISOString() };
    }

    // 3xx başka bir URL'e yönlendirme → muhtemelen silindi veya değişti
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers['location'] || '';
      // Anasayfaya veya arama sayfasına yönlenirse silindi
      if (isRedirectToHome(location, tracked.kaynak_site)) {
        tracked.silindi = true;
        logger.info(`İlan silindi (redirect → anasayfa): ${tracked.kaynak_id}`);
        return { kaynak_url: tracked.kaynak_url, kaynak_id: tracked.kaynak_id, silindi: true, http_kodu: response.status, kontrol_zamani: new Date().toISOString() };
      }
    }

    // 200 = aktif
    return { kaynak_url: tracked.kaynak_url, kaynak_id: tracked.kaynak_id, silindi: false, http_kodu: response.status, kontrol_zamani: new Date().toISOString() };

  } catch (err: unknown) {
    tracked.son_kontrol = Date.now();
    const errMsg = err instanceof Error ? err.message : String(err);
    // Bağlantı hatası → silindiğinden emin değiliz
    logger.debug(`HEAD isteği hatası: ${tracked.kaynak_id} — ${errMsg}`);
    return { kaynak_url: tracked.kaynak_url, kaynak_id: tracked.kaynak_id, silindi: false, http_kodu: 0, kontrol_zamani: new Date().toISOString() };
  }
}

/**
 * Redirect URL anasayfaya mı işaret ediyor?
 */
function isRedirectToHome(location: string, kaynak_site: string): boolean {
  if (!location) return false;
  // Kısa URL = anasayfa gibi
  try {
    const u = new URL(location);
    const isAnasayfa = u.pathname === '/' || u.pathname === '' || u.pathname === '/index.php';
    const isArama = u.pathname.includes('search') || u.pathname.includes('ara') || u.pathname.includes('listing');
    return isAnasayfa || isArama;
  } catch {
    return false;
  }
}

/**
 * Tüm izlenen ilanları kontrol eder (toplu)
 */
export async function checkAll(
  onSilindi: (kaynak_id: string, kaynak_url: string) => Promise<void>
): Promise<void> {
  const simdi = Date.now();
  const bekleyenler = Array.from(izlenen.values()).filter(
    t => !t.silindi && (simdi - t.son_kontrol) >= config.ghost.intervalHours * 60 * 60 * 1000
  );

  if (bekleyenler.length === 0) {
    logger.debug('GhostTracker: kontrol edilecek ilan yok');
    return;
  }

  logger.info(`GhostTracker: ${bekleyenler.length} ilan kontrol ediliyor...`);

  // 5'erli batch halinde kontrol et (rate limit)
  const BATCH = 5;
  for (let i = 0; i < bekleyenler.length; i += BATCH) {
    const batch = bekleyenler.slice(i, i + BATCH);
    const sonuclar = await Promise.all(batch.map(t => checkIlan(t)));

    for (const sonuc of sonuclar) {
      if (sonuc.silindi) {
        const tracked = izlenen.get(sonuc.kaynak_id);
        if (tracked) {
          await onSilindi(tracked.kaynak_id, tracked.kaynak_url);
          izlenen.delete(tracked.kaynak_id); // artık izleme
        }
      }
    }

    // Batch arası bekleme
    if (i + BATCH < bekleyenler.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  logger.info('GhostTracker: kontrol tamamlandı');
}

/**
 * Periyodik kontrol başlat
 */
export function startGhostTracker(
  onSilindi: (kaynak_id: string, kaynak_url: string) => Promise<void>
): void {
  if (intervalHandle) return;

  const intervalMs = config.ghost.intervalHours * 60 * 60 * 1000;
  logger.info(`GhostTracker başlatıldı (her ${config.ghost.intervalHours} saatte bir)`);

  intervalHandle = setInterval(async () => {
    try {
      await checkAll(onSilindi);
    } catch (err) {
      logger.error('GhostTracker periyodik kontrol hatası', { err });
    }
  }, intervalMs);
}

/**
 * Periyodik kontrolü durdur
 */
export function stopGhostTracker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('GhostTracker durduruldu');
  }
}

/**
 * İzleme istatistikleri
 */
export function getTrackerStats(): { toplam: number; aktif: number; silindi: number } {
  const tum = Array.from(izlenen.values());
  return {
    toplam: tum.length,
    aktif: tum.filter(t => !t.silindi).length,
    silindi: tum.filter(t => t.silindi).length,
  };
}
