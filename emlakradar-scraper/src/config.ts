/**
 * EmlakRadar Scraper — Ortam Değişkenleri ve Yapılandırma
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Zorunlu ortam değişkeni eksik: ${key}`);
  return val;
}

function optional(key: string, defaultVal: string = ''): string {
  return process.env[key] || defaultVal;
}

function optionalInt(key: string, defaultVal: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : defaultVal;
}

export const config = {
  // cPanel API
  cpanel: {
    apiUrl:        required('CPANEL_API_URL'),
    webhookSecret: required('CPANEL_WEBHOOK_SECRET'),
    apiToken:      optional('CPANEL_API_TOKEN'),
  },

  // Redis
  redis: {
    host:     optional('REDIS_HOST', '127.0.0.1'),
    port:     optionalInt('REDIS_PORT', 6379),
    password: optional('REDIS_PASSWORD'),
  },

  // WebSocket
  websocket: {
    port:       optionalInt('WEBSOCKET_PORT', 3001),
    corsOrigin: optional('WEBSOCKET_CORS_ORIGIN', '*'),
  },

  // Scraper
  scraper: {
    intervalMinutes: optionalInt('SCRAPE_INTERVAL_MINUTES', 10),
    cities:          optional('SCRAPE_CITIES', 'istanbul').split(',').map(c => c.trim()),
    maxPages:        optionalInt('SCRAPE_MAX_PAGES', 5),
    delayMin:        optionalInt('SCRAPE_DELAY_MIN', 3000),
    delayMax:        optionalInt('SCRAPE_DELAY_MAX', 10000),
  },

  // Proxy
  proxy: {
    list: optional('PROXY_LIST')
      .split(',')
      .map(p => p.trim())
      .filter(Boolean),
  },

  // Ghost tracker
  ghost: {
    intervalHours: optionalInt('GHOST_CHECK_INTERVAL_HOURS', 6),
    batchSize:     optionalInt('GHOST_BATCH_SIZE', 50),
  },

  // Log
  logLevel: optional('LOG_LEVEL', 'info'),
} as const;
