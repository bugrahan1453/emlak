/**
 * EmlakRadar Scraper — BullMQ İş İşleyicileri
 */
import { Worker, Job, ConnectionOptions } from 'bullmq';
import { ScrapeJobData } from '../types';
import { createLogger } from '../utils/Logger';
import { config } from '../config';

const logger = createLogger('Jobs');

let worker: Worker<ScrapeJobData> | null = null;

type ScraperRegistry = {
  sahibinden: () => Promise<void>;
  hepsiemlak: () => Promise<void>;
  emlakjet: () => Promise<void>;
};

/**
 * Worker'ı başlatır
 */
export function startWorker(scrapers: ScraperRegistry): Worker<ScrapeJobData> {
  if (worker) return worker;

  const connection: ConnectionOptions = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    maxRetriesPerRequest: null as unknown as undefined,
    enableReadyCheck: false,
  };

  worker = new Worker<ScrapeJobData>(
    'emlak-scrape',
    async (job: Job<ScrapeJobData>) => {
      const { site, sayfa } = job.data;

      logger.info(`İş başladı: ${job.id} — ${site} sayfa:${sayfa ?? 1}`);
      await job.updateProgress(0);

      try {
        if (!scrapers[site]) {
          throw new Error(`Bilinmeyen kaynak: ${site}`);
        }

        await scrapers[site]();
        await job.updateProgress(100);
        logger.info(`İş tamamlandı: ${job.id} — ${site}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`İş hatası: ${job.id} — ${msg}`);
        throw err; // retry için fırlat
      }
    },
    {
      connection,
      concurrency: 1, // Aynı anda sadece 1 scraping işlemi
      limiter: {
        max: 1,
        duration: config.scraper.delayMin * 2,
      },
    }
  );

  worker.on('error', (err: Error) => {
    logger.error('Worker hatası', { err: err.message });
  });

  worker.on('stalled', (jobId: string) => {
    logger.warn(`Worker takıldı: ${jobId}`);
  });

  logger.info('Worker başlatıldı (concurrency: 1)');
  return worker;
}

/**
 * Worker'ı durdurur
 */
export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Worker durduruldu');
  }
}
