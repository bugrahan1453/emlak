/**
 * EmlakRadar Scraper — Socket.io WebSocket Sunucusu
 * Events: yeni_ilan, kirmizi_alarm, fiyat_degisiklik, ilan_silindi, scraper_durum
 */
import { createServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { IlanVeri, SocketEvents, ScraperDurumEvent } from '../types';
import { createLogger } from '../utils/Logger';
import { config } from '../config';

const logger = createLogger('SocketServer');

let io: SocketServer | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;

/**
 * WebSocket sunucusunu başlatır
 */
export function startSocketServer(): SocketServer {
  if (io) return io;

  httpServer = createServer();

  io = new SocketServer(httpServer, {
    cors: {
      origin: config.websocket.corsOrigin || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket: Socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    logger.info(`İstemci bağlandı: ${socket.id} (${clientIp})`);

    socket.on('disconnect', (reason) => {
      logger.info(`İstemci ayrıldı: ${socket.id} — ${reason}`);
    });

    socket.on('ping_scraper', () => {
      socket.emit('pong_scraper', { zaman: new Date().toISOString() });
    });
  });

  const port = config.websocket.port;
  httpServer.listen(port, () => {
    logger.info(`WebSocket sunucusu başlatıldı: port ${port}`);
  });

  return io;
}

/**
 * Sunucuyu kapatır
 */
export function stopSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!io) { resolve(); return; }
    io.close(() => {
      httpServer?.close(() => {
        io = null;
        httpServer = null;
        logger.info('WebSocket sunucusu kapatıldı');
        resolve();
      });
    });
  });
}

// ── Event Emitter Yardımcıları ──────────────────────────────────────────────

/**
 * Yeni ilan eventı yayınlar
 */
export function emitYeniIlan(ilan: IlanVeri): void {
  if (!io) return;
  const event: SocketEvents['yeni_ilan'] = {
    ilan,
    zaman: new Date().toISOString(),
  };
  io.emit('yeni_ilan', event);
  logger.debug(`[WS] yeni_ilan: ${ilan.kaynak_id}`);
}

/**
 * Kırmızı alarm (sahte ilan) eventı yayınlar
 */
export function emitKirmiziAlarm(ilan: IlanVeri, skor: number, sebepler: string[]): void {
  if (!io) return;
  const event: SocketEvents['kirmizi_alarm'] = {
    ilan,
    skor,
    sebepler,
    zaman: new Date().toISOString(),
  };
  io.emit('kirmizi_alarm', event);
  logger.warn(`[WS] kirmizi_alarm: ${ilan.kaynak_id} (skor: ${skor})`);
}

/**
 * Fiyat değişikliği eventı yayınlar
 */
export function emitFiyatDegisiklik(
  ilan: IlanVeri,
  eskiFiyat: number,
  yeniFiyat: number,
  degisimYuzdesi: number
): void {
  if (!io) return;
  const event: SocketEvents['fiyat_degisiklik'] = {
    ilan,
    eski_fiyat: eskiFiyat,
    yeni_fiyat: yeniFiyat,
    degisim_yuzdesi: degisimYuzdesi,
    zaman: new Date().toISOString(),
  };
  io.emit('fiyat_degisiklik', event);
  logger.info(`[WS] fiyat_degisiklik: ${ilan.kaynak_id} — %${degisimYuzdesi}`);
}

/**
 * İlan silindi eventı yayınlar
 */
export function emitIlanSilindi(kaynak_id: string, kaynak_url: string): void {
  if (!io) return;
  const event: SocketEvents['ilan_silindi'] = {
    kaynak_id,
    kaynak_url,
    zaman: new Date().toISOString(),
  };
  io.emit('ilan_silindi', event);
  logger.info(`[WS] ilan_silindi: ${kaynak_id}`);
}

/**
 * Scraper durum güncellemesi yayınlar
 */
export function emitScraperDurum(durum: ScraperDurumEvent): void {
  if (!io) return;
  io.emit('scraper_durum', durum);
}

/**
 * Bağlı istemci sayısı
 */
export function getConnectedClientCount(): number {
  return io?.engine.clientsCount ?? 0;
}
