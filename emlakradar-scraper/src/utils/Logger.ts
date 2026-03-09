/**
 * EmlakRadar Scraper — Winston Logger
 */
import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

const logsDir = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const { combine, timestamp, colorize, printf, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `${ts} [${level}] ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json()
  ),
  transports: [
    // Console — renkli
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      ),
    }),
    // Dosya — genel
    new winston.transports.File({
      filename: path.join(logsDir, 'scraper.log'),
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
      tailable: true,
    }),
    // Dosya — sadece hatalar
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

export function createLogger(context: string): winston.Logger {
  return logger.child({ context });
}
