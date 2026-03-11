/**
 * EmlakRadar Scraper — node-cron Zamanlayıcı
 */
import cron from 'node-cron';
import { addBulkScrapeJobs } from '../queue/QueueManager';
import { createLogger } from '../utils/Logger';
import { config } from '../config';

const logger = createLogger('Scheduler');

let cronTask: cron.ScheduledTask | null = null;

/**
 * Scrape interval'den cron ifadesi üretir
 * Örn: 30 dakika → "* /30 * * * *"
 */
function intervalToCron(dakika: number): string {
  if (dakika < 60) return `*/${dakika} * * * *`;
  const saat = Math.floor(dakika / 60);
  return `0 */${saat} * * *`;
}

/**
 * Zamanlayıcıyı başlatır
 */
export function startScheduler(): void {
  if (cronTask) {
    logger.warn('Zamanlayıcı zaten çalışıyor');
    return;
  }

  const interval = config.scraper.intervalMinutes;
  const cronExpr = intervalToCron(interval);

  logger.info(`Zamanlayıcı başlatıldı: her ${interval} dakikada bir (${cronExpr})`);

  cronTask = cron.schedule(cronExpr, async () => {
    logger.info('Zamanlayıcı tetiklendi — scrape işleri ekleniyor');
    try {
      await addBulkScrapeJobs(['sahibinden', 'hepsiemlak', 'emlakjet']);
    } catch (err) {
      logger.error('Zamanlayıcı iş ekleme hatası', { err });
    }
  });

  // İlk çalışmayı hemen başlat
  addBulkScrapeJobs(['sahibinden', 'hepsiemlak', 'emlakjet'])
    .then(() => logger.info('İlk scrape işleri eklendi'))
    .catch(err => logger.error('İlk scrape iş ekleme hatası', { err }));
}

/**
 * Zamanlayıcıyı durdurur
 */
export function stopScheduler(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info('Zamanlayıcı durduruldu');
  }
}
