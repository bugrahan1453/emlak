/**
 * EmlakRadar Scraper — Ana Giriş Noktası
 */
import 'dotenv/config';
import { createLogger } from './utils/Logger';
import { startSocketServer, stopSocketServer, emitScraperDurum } from './websocket/SocketServer';
import { getQueue, closeQueue, startQueueEvents } from './queue/QueueManager';
import { startWorker, stopWorker } from './queue/Jobs';
import { startScheduler, stopScheduler } from './cron/Scheduler';
import { startGhostTracker, stopGhostTracker } from './analyzers/GhostTracker';
import { sendSilindi } from './api/CpanelClient';
import { emitIlanSilindi } from './websocket/SocketServer';
import { SahibindenScraper } from './scraper/SahibindenScraper';
import { HepsiemlakScraper } from './scraper/HepsiemlakScraper';
import { EmlakjetScraper } from './scraper/EmlakjetScraper';
import { config } from './config';

const logger = createLogger('Main');

// Scraper örnekleri (singleton)
const scrapers = {
  sahibinden: new SahibindenScraper(),
  hepsiemlak: new HepsiemlakScraper(),
  emlakjet: new EmlakjetScraper(),
};

async function bootstrap(): Promise<void> {
  logger.info('EmlakRadar Scraper başlatılıyor...', {
    version: '1.0.0',
    node: process.version,
    pid: process.pid,
  });

  // 1. WebSocket sunucusu
  startSocketServer();

  // 2. BullMQ kuyruk olayları
  startQueueEvents();

  // 3. Worker — scraping işlerini işler
  startWorker({
    sahibinden: async () => { await scrapers.sahibinden.scrapeAll(); },
    hepsiemlak: async () => { await scrapers.hepsiemlak.scrapeAll(); },
    emlakjet:   async () => { await scrapers.emlakjet.scrapeAll(); },
  });

  // 4. GhostTracker — silinmiş ilan tespiti
  startGhostTracker(async (kaynak_id, kaynak_url) => {
    logger.info(`Ghost: ilan silindi — ${kaynak_id}`);
    const kaynak_site = kaynak_url.includes('sahibinden') ? 'sahibinden'
                       : kaynak_url.includes('hepsiemlak') ? 'hepsiemlak' : 'emlakjet';

    await sendSilindi(kaynak_id, kaynak_url, kaynak_site).catch(err => {
      logger.error('Ghost silindi webhook hatası', { err: err.message });
    });
    emitIlanSilindi(kaynak_id, kaynak_url);
  });

  // 5. Zamanlayıcı — periyodik scraping
  startScheduler();

  // 6. Durum yayınla
  emitScraperDurum({
    durum: 'calisıyor',
    aktif_gorev: 'sahibinden,hepsiemlak,emlakjet',
    son_guncelleme: new Date().toISOString(),
  });

  logger.info('EmlakRadar Scraper başarıyla başlatıldı', {
    websocket_port: config.websocket.port,
    scrape_interval: `${config.scraper.intervalMinutes} dakika`,
    max_pages: config.scraper.maxPages,
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`Kapatma sinyali alındı: ${signal}`);

  emitScraperDurum({
    durum: 'durdu',
    son_guncelleme: new Date().toISOString(),
  });

  stopScheduler();
  stopGhostTracker();
  await stopWorker();
  await closeQueue();
  await stopSocketServer();

  logger.info('EmlakRadar Scraper kapatıldı');
  process.exit(0);
}

// Signal handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('İşlenmemiş exception', { err: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error('İşlenmemiş promise rejection', { reason: String(reason) });
});

// Başlat
bootstrap().catch((err) => {
  logger.error('Bootstrap hatası', { err: err.message });
  process.exit(1);
});
