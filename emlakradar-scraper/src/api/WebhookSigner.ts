/**
 * EmlakRadar Scraper — HMAC-SHA256 Webhook İmzalayıcı
 */
import crypto from 'crypto';
import { config } from '../config';

/**
 * Payload'u HMAC-SHA256 ile imzalar
 * Döndürür: "sha256=<hex_hash>"
 */
export function signPayload(payload: string): string {
  const hmac = crypto.createHmac('sha256', config.cpanel.webhookSecret);
  hmac.update(payload, 'utf8');
  return 'sha256=' + hmac.digest('hex');
}

/**
 * Gelen imzayı doğrular (constant-time compare)
 */
export function verifySignature(payload: string, signature: string): boolean {
  const expected = signPayload(payload);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * Webhook isteği için headers oluşturur
 */
export function buildWebhookHeaders(payload: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': signPayload(payload),
    'X-Webhook-Source': 'emlakradar-scraper',
    'X-Webhook-Timestamp': new Date().toISOString(),
    'User-Agent': 'EmlakRadarScraper/1.0',
  };
}
