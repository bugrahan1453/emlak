/**
 * EmlakRadar Scraper — cPanel Webhook İstemcisi
 * Batch: 10 ilan/istek, Retry: 3 deneme (1s, 3s, 9s)
 */
import axios, { AxiosError } from 'axios';
import { IlanVeri, WebhookPayload } from '../types';
import { buildWebhookHeaders } from './WebhookSigner';
import { chunkArray, retry } from '../utils/Helpers';
import { createLogger } from '../utils/Logger';
import { config } from '../config';

const logger = createLogger('CpanelClient');

const BATCH_SIZE   = 10;
const RETRY_DELAYS = [1000, 3000, 9000]; // ms

/**
 * Yeni ilanları cPanel'e gönderir (batch halinde)
 */
export async function sendYeniIlanlar(ilanlar: IlanVeri[]): Promise<void> {
  if (ilanlar.length === 0) return;

  const batchler = chunkArray(ilanlar, BATCH_SIZE);
  logger.info(`${ilanlar.length} yeni ilan, ${batchler.length} batch halinde gönderiliyor`);

  for (let idx = 0; idx < batchler.length; idx++) {
    const batch = batchler[idx];
    const payload: WebhookPayload = {
      tip: 'yeni_ilan',
      ilanlar: batch,
      zaman: new Date().toISOString(),
      kaynak: batch[0]?.kaynak_site ?? 'unknown',
    };

    await sendWebhook(payload);
    logger.debug(`Batch ${idx + 1}/${batchler.length} gönderildi (${batch.length} ilan)`);
  }
}

/**
 * Güncellenen ilanı cPanel'e gönderir
 */
export async function sendGuncelleme(ilan: IlanVeri): Promise<void> {
  const payload: WebhookPayload = {
    tip: 'guncelleme',
    ilan,
    zaman: new Date().toISOString(),
    kaynak: ilan.kaynak_site,
  };
  await sendWebhook(payload);
}

/**
 * Silinen ilanı cPanel'e bildirir
 */
export async function sendSilindi(kaynak_id: string, kaynak_url: string, kaynak_site: string): Promise<void> {
  const payload: WebhookPayload = {
    tip: 'silindi',
    ilan: { kaynak_id, kaynak_url, kaynak_site } as IlanVeri,
    zaman: new Date().toISOString(),
    kaynak: kaynak_site,
  };
  await sendWebhook(payload);
}

/**
 * Fiyat değişikliğini cPanel'e gönderir
 */
export async function sendFiyatDegisiklik(
  ilan: IlanVeri,
  eskiFiyat: number,
  yeniFiyat: number,
  degisimYuzdesi: number
): Promise<void> {
  const payload: WebhookPayload = {
    tip: 'fiyat_degisiklik',
    ilan: { ...ilan, meta: { ...ilan.meta, eski_fiyat: eskiFiyat, fiyat_degisim_yuzdesi: degisimYuzdesi } },
    zaman: new Date().toISOString(),
    kaynak: ilan.kaynak_site,
  };
  await sendWebhook(payload);
  logger.info(`Fiyat değişikliği bildirildi: ${ilan.kaynak_id} — ${eskiFiyat} → ${yeniFiyat} (${degisimYuzdesi > 0 ? '+' : ''}${degisimYuzdesi}%)`);
}

/**
 * Sahte ilan uyarısı gönderir
 */
export async function sendSahteIlan(ilan: IlanVeri, skor: number, sebepler: string[]): Promise<void> {
  const payload: WebhookPayload = {
    tip: 'sahte_ilan',
    ilan: { ...ilan, meta: { ...ilan.meta, sahte_skor: skor, sahte_sebepler: sebepler } },
    zaman: new Date().toISOString(),
    kaynak: ilan.kaynak_site,
  };
  await sendWebhook(payload);
}

/**
 * Webhook endpoint'e HTTP POST gönderir (retry ile)
 */
async function sendWebhook(payload: WebhookPayload): Promise<void> {
  const body = JSON.stringify(payload);
  const headers = buildWebhookHeaders(body);
  const url = config.cpanel.apiUrl;

  await retry(
    async () => {
      try {
        const response = await axios.post(url, body, {
          headers,
          timeout: 30000,
          validateStatus: (status) => status >= 200 && status < 300,
        });

        logger.debug(`Webhook yanıtı: ${response.status}`, {
          tip: payload.tip,
          kaynak: payload.kaynak,
        });
      } catch (err) {
        const axiosErr = err as AxiosError;
        const status = axiosErr.response?.status;
        const detail = axiosErr.response?.data || axiosErr.message;

        logger.warn(`Webhook hatası (${status ?? 'network'}): ${payload.tip}`, { detail });
        throw err; // retry için fırlat
      }
    },
    3,
    RETRY_DELAYS
  );
}
