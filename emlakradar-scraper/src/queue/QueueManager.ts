/**
 * EmlakRadar Scraper — BullMQ Kuyruk Yöneticisi
 */
import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ScrapeJobData, ScraperStats } from '../types';
import { createLogger } from '../utils/Logger';
import { config } from '../config';

const logger = createLogger('QueueManager');

const QUEUE_NAME = 'emlak-scrape';

let connection: Redis | null = null;
let scrapeQueue: Queue<ScrapeJobData> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Redis bağlantısı oluştur
 */
function getRedisConnection(): Redis {
  if (connection) return connection;

  connection = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    maxRetriesPerRequest: null, // BullMQ için gerekli
    enableReadyCheck: false,
    lazyConnect: true,
  });

  connection.on('connect', () => logger.info('Redis bağlantısı kuruldu'));
  connection.on('error', (err) => logger.error('Redis bağlantı hatası', { err: err.message }));
  connection.on('reconnecting', () => logger.warn('Redis yeniden bağlanıyor...'));

  return connection;
}

/**
 * Kuyruk örneğini döndürür (singleton)
 */
export function getQueue(): Queue<ScrapeJobData> {
  if (scrapeQueue) return scrapeQueue;

  scrapeQueue = new Queue<ScrapeJobData>(QUEUE_NAME, {
    connection: getRedisConnection(),
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
  const jobId = `${data.kaynak}_${data.sayfa ?? 1}_${Date.now()}`;

  const job = await queue.add(`scrape:${data.kaynak}`, data, {
    jobId,
    priority: opts?.priority ?? 10,
    delay: opts?.delay ?? 0,
  });

  logger.debug(`İş eklendi: ${jobId}`, { kaynak: data.kaynak, sayfa: data.sayfa });
  return job;
}

/**
 * Tüm kaynaklar için toplu iş ekler
 */
export async function addBulkScrapeJobs(kaynaklar: Array<'sahibinden' | 'hepsiemlak' | 'emlakjet'>): Promise<void> {
  const queue = getQueue();
  const jobs = kaynaklar.map(kaynak => ({
    name: `scrape:${kaynak}`,
    data: { kaynak, sayfa: 1 } as ScrapeJobData,
    opts: { priority: 10 },
  }));

  await queue.addBulk(jobs);
  logger.info(`${jobs.length} toplu iş eklendi: ${kaynaklar.join(', ')}`);
}

/**
 * Kuyruk istatistiklerini döndürür
 */
export async function getQueueStats(): Promise<ScraperStats['queue']> {
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
    connection: getRedisConnection(),
  });

  queueEvents.on('completed', ({ jobId }) => {
    logger.debug(`İş tamamlandı: ${jobId}`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error(`İş başarısız: ${jobId} — ${failedReason}`);
  });

  queueEvents.on('stalled', ({ jobId }) => {
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
  await connection?.quit();
  queueEvents = null;
  scrapeQueue = null;
  connection = null;
  logger.info('Kuyruk kapatıldı');
}
