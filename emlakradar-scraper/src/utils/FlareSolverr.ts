/**
 * FlareSolverr istemcisi — Cloudflare korumalı sitelerde CF cookie alır
 * FlareSolverr API: http://flaresolverr:8191/v1
 */
import axios from 'axios';
import { createLogger } from './Logger';

const logger = createLogger('FlareSolverr');

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://flaresolverr:8191/v1';

export interface FlareCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
}

export interface FlareResult {
  cookies: FlareCookie[];
  userAgent: string;
  status: number;
  html: string;
}

/**
 * Verilen URL için Cloudflare challenge'ı çözer ve cookies + UA döner.
 * sessionId verilirse mevcut FlareSolverr oturumunu kullanır.
 */
export async function solveCloudflare(url: string, sessionId?: string): Promise<FlareResult | null> {
  try {
    logger.info(`CF challenge çözülüyor: ${url}`);
    const body: Record<string, unknown> = {
      cmd: 'request.get',
      url,
      maxTimeout: 90000,
    };
    if (sessionId) body.session = sessionId;

    const res = await axios.post(FLARESOLVERR_URL, body, { timeout: 100000 });

    if (res.data?.status === 'ok' && res.data?.solution) {
      const sol = res.data.solution;
      logger.info(`CF çözüldü (${sol.cookies?.length ?? 0} cookie, status: ${sol.status})`);
      return {
        cookies: sol.cookies ?? [],
        userAgent: sol.userAgent ?? '',
        status: sol.status,
        html: sol.response ?? '',
      };
    }

    logger.warn('FlareSolverr yanıtı beklenmedik format', { data: res.data });
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`FlareSolverr hatası: ${msg}`);
    return null;
  }
}

/**
 * FlareSolverr'da kalıcı tarayıcı oturumu oluşturur.
 * Oturumlar cookie'leri istekler arasında paylaşır.
 */
export async function createFlareSolverrSession(sessionId: string): Promise<boolean> {
  try {
    const res = await axios.post(FLARESOLVERR_URL, { cmd: 'sessions.create', session: sessionId }, { timeout: 15000 });
    return res.data?.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * FlareSolverr oturumunu sonlandırır.
 */
export async function destroyFlareSolverrSession(sessionId: string): Promise<void> {
  try {
    await axios.post(FLARESOLVERR_URL, { cmd: 'sessions.destroy', session: sessionId }, { timeout: 10000 });
  } catch {
    // sessizce geç
  }
}

/**
 * Sayfa başlığından Cloudflare sayfası olup olmadığını kontrol eder
 */
export function isCloudflarePage(title: string, html: string): boolean {
  const cfTitles = ['just a moment', 'attention required', 'cloudflare', 'ddos-guard'];
  const lowerTitle = title.toLowerCase();
  return cfTitles.some(t => lowerTitle.includes(t)) ||
    html.includes('cf-browser-verification') ||
    html.includes('challenge-form') ||
    html.includes('__cf_chl');
}
