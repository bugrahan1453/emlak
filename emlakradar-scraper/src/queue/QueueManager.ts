/**
 * EmlakRadar Scraper — BullMQ Kuyruk Yöneticisi
 */
import { Queue, Worker, QueueEvents, Job, ConnectionOptions } from 'bullmq';
import { ScrapeJobData } from '../types';
import { createLogger } from '../utils/Logger';
import { config } from '../config';

const logger = createLogger('QueueManager');

const QUEUE_NAME = 'emlak-scrape';

let scrapeQueue: Queue<ScrapeJobData> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Redis bağlantı seçenekleri
 */
function getConnectionOptions(): ConnectionOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    maxRetriesPerRequest: null as unknown as undefined, // BullMQ için gerekli
    enableReadyCheck: false,
    lazyConnect: true,
  };
}

/**
 * Kuyruk örneğini döndürür (singleton)
 */
export function getQueue(): Queue<ScrapeJobData> {
  if (scrapeQueue) return scrapeQueue;

  scrapeQueue = new Queue<ScrapeJobData>(QUEUE_NAME, {
    connection: getConnectionOptions(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  logger.info(`Kuyruk oluşturuldu: ${QUEUE_NAME}`);
  return scrapeQueue;
}

/**
 * Scrape görevi ekler
 */
export async function addScrapeJob(data: ScrapeJobData, opts?: { priority?: number; delay?: number }): Promise<Job<ScrapeJobData>> {
  const queue = getQueue();
  const jobId = `${data.site}_${data.sayfa ?? 1}_${Date.now()}`;

  const job = await queue.add(`scrape:${data.site}`, data, {
    jobId,
    priority: opts?.priority ?? 10,
    delay: opts?.delay ?? 0,
  });

  logger.debug(`İş eklendi: ${jobId}`, { site: data.site, sayfa: data.sayfa });
  return job;
}

/**
 * Tüm kaynaklar için toplu iş ekler
 */
export async function addBulkScrapeJobs(kaynaklar: Array<'sahibinden' | 'hepsiemlak' | 'emlakjet'>): Promise<void> {
  const queue = getQueue();
  const jobs = kaynaklar.map(site => ({
    name: `scrape:${site}`,
    data: { site, sehir: 'istanbul', tip: 'satilik' as const, sayfa: 1 } as ScrapeJobData,
    opts: { priority: 10 },
  }));

  await queue.addBulk(jobs);
  logger.info(`${jobs.length} toplu iş eklendi: ${kaynaklar.join(', ')}`);
}

/**
 * Kuyruk istatistiklerini döndürür
 */
export async function getQueueStats(): Promise<{ waiting: number; active: number; completed: number; failed: number }> {
  const queue = getQueue();
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

/**
 * QueueEvents dinleyicisini başlatır
 */
export function startQueueEvents(): QueueEvents {
  if (queueEvents) return queueEvents;

  queueEvents = new QueueEvents(QUEUE_NAME, {
    connection: getConnectionOptions(),
  });

  queueEvents.on('completed', ({ jobId }: { jobId: string }) => {
    logger.debug(`İş tamamlandı: ${jobId}`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
    logger.error(`İş başarısız: ${jobId} — ${failedReason}`);
  });

  queueEvents.on('stalled', ({ jobId }: { jobId: string }) => {
    logger.warn(`İş takıldı: ${jobId}`);
  });

  return queueEvents;
}

/**
 * Kaynakları temizle
 */
export async function closeQueue(): Promise<void> {
  await queueEvents?.close();
  await scrapeQueue?.close();
  queueEvents = null;
  scrapeQueue = null;
  logger.info('Kuyruk kapatıldı');
}
