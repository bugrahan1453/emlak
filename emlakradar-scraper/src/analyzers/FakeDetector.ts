/**
 * EmlakRadar Scraper — Sahte İlan Tespit Motoru
 * Skor 0-100: ≥50 = muhtemelen_sahte
 */
import { IlanVeri, FakeDetectionResult } from '../types';
import { turkishLower } from '../utils/Helpers';
import { createLogger } from '../utils/Logger';

const logger = createLogger('FakeDetector');

// Emlak ofisi anahtar kelimeleri
const AJANS_ANAHTAR_KELIMELERI = [
  'emlak', 'gayrimenkul', 'ofis', 'realty', 'property', 'invest', 'yatırım',
  'homes', 'konut', 'residence', 'real estate', 'danışmanlık', 'consulting',
  'grup', 'group', 'holding', 'insaat', 'inşaat', 'yapı',
];

// Profesyonel ilan metin kalıpları
const AJANS_METIN_KALIPLARI = [
  /portföy\s*no/i,
  /referans\s*kodu/i,
  /ofisimizden\s*arayabilirsiniz/i,
  /detaylı\s*bilgi\s*için\s*arayın/i,
  /24\s*saat\s*hizmet/i,
  /profesyonel\s*ekip/i,
  /deneyimli\s*danışman/i,
  /geniş\s*portföy/i,
  /şubelerimizden/i,
  /müşteri\s*temsilciniz/i,
];

// Kurumsal isim kalıpları (A.Ş., Ltd. vs.)
const KURUMSAL_ISIM_KALIPLARI = [
  /a\.ş\./i,
  /a\.s\./i,
  /ltd\./i,
  /llc/i,
  /limited/i,
  /anonim/i,
  /şirketi/i,
  /firması/i,
  /kurumu/i,
];

// Belirli bir zaman aralığında ilanları tutan önbellek (bellek içi)
interface PhoneCache {
  [tel: string]: { ilanIds: Set<string> };
}

interface SaticiCache {
  [satici: string]: { ilanIds: Set<string> };
}

const phoneCache: PhoneCache = {};
const saticiCache: SaticiCache = {};

/**
 * İlanı sahte ilan skoru için analiz eder
 */
export function analyzeFake(ilan: IlanVeri, tumIlanlar: IlanVeri[]): FakeDetectionResult {
  let skor = 0;
  const sebepler: string[] = [];

  // ── 1. Aynı telefon 3+ ilan (+30) ──────────────────────────────
  if (ilan.satici?.telefon) {
    const tel = ilan.satici.telefon;
    if (!phoneCache[tel]) {
      phoneCache[tel] = { ilanIds: new Set() };
    }
    phoneCache[tel].ilanIds.add(ilan.kaynak_id);

    // Tüm ilanlardan aynı telefona sahip olanları say
    const ayniTelSayisi = tumIlanlar.filter(
      i => i.satici?.telefon === tel && i.kaynak_id !== ilan.kaynak_id
    ).length + phoneCache[tel].ilanIds.size;

    if (ayniTelSayisi >= 3) {
      skor += 30;
      sebepler.push(`Aynı telefon numarası ${ayniTelSayisi} ilanda kullanılıyor`);
    }
  }

  // ── 2. Emlak ajanı anahtar kelimeleri (+20) ─────────────────────
  const saticiAd = turkishLower(ilan.satici?.ad || '');
  const ajansHit = AJANS_ANAHTAR_KELIMELERI.filter(k => saticiAd.includes(turkishLower(k)));
  if (ajansHit.length >= 2) {
    skor += 20;
    sebepler.push(`Satıcı adında ajans anahtar kelimeleri: ${ajansHit.slice(0, 3).join(', ')}`);
  } else if (ajansHit.length === 1) {
    skor += 10;
    sebepler.push(`Satıcı adında ajans anahtar kelimesi: ${ajansHit[0]}`);
  }

  // ── 3. Profesyonel fotoğraf kalitesi/sayısı (+15) ────────────────
  const fotografSayisi = ilan.fotograflar?.length ?? 0;
  if (fotografSayisi >= 15) {
    skor += 15;
    sebepler.push(`${fotografSayisi} fotoğraf — profesyonel çekim ihtimali yüksek`);
  } else if (fotografSayisi >= 10) {
    skor += 8;
    sebepler.push(`${fotografSayisi} fotoğraf — profesyonel ilan olabilir`);
  }

  // ── 4. Ajans metin kalıpları (+15) ──────────────────────────────
  const aciklama = ilan.aciklama || '';
  const metinHitler = AJANS_METIN_KALIPLARI.filter(p => p.test(aciklama));
  if (metinHitler.length >= 2) {
    skor += 15;
    sebepler.push(`Açıklamada ${metinHitler.length} profesyonel ajans ifadesi bulundu`);
  } else if (metinHitler.length === 1) {
    skor += 7;
    sebepler.push('Açıklamada profesyonel ajans ifadesi bulundu');
  }

  // ── 5. Kurumsal isim (+10) ──────────────────────────────────────
  const kurumsalHit = KURUMSAL_ISIM_KALIPLARI.find(p => p.test(saticiAd) || p.test(ilan.satici?.eposta || ''));
  if (kurumsalHit) {
    skor += 10;
    sebepler.push('Satıcı adında kurumsal yapı belirteci bulundu');
  }

  // ── 6. Aynı kişi 2+ ilan (+10) ──────────────────────────────────
  const saticiKimlik = ilan.satici?.ad?.trim();
  if (saticiKimlik) {
    const key = turkishLower(saticiKimlik);
    if (!saticiCache[key]) {
      saticiCache[key] = { ilanIds: new Set() };
    }
    saticiCache[key].ilanIds.add(ilan.kaynak_id);

    const ayniSaticiSayisi = tumIlanlar.filter(
      i => turkishLower(i.satici?.ad?.trim() || '') === key && i.kaynak_id !== ilan.kaynak_id
    ).length + saticiCache[key].ilanIds.size - 1;

    if (ayniSaticiSayisi >= 2) {
      skor += 10;
      sebepler.push(`Aynı satıcı ${ayniSaticiSayisi + 1} ilanda görünüyor`);
    }
  }

  // ── 7. Fiyat çok düşük (tuzak ilan) (+10) ───────────────────────
  if (ilan.fiyat && ilan.ozellikler.metrekare) {
    const m2Fiyat = ilan.fiyat / ilan.ozellikler.metrekare;
    // 10.000 TL/m² altı İstanbul/Ankara merkezde şüpheli
    if (m2Fiyat < 10000 && ilan.konum.il && ['istanbul', 'ankara', 'izmir'].includes(turkishLower(ilan.konum.il))) {
      skor += 10;
      sebepler.push(`m² başına fiyat çok düşük: ${Math.round(m2Fiyat).toLocaleString('tr-TR')} TL`);
    }
  }

  const skorSinirli = Math.min(skor, 100);
  const sahte = skorSinirli >= 50;

  if (sahte) {
    logger.info(`Sahte ilan tespit edildi: ${ilan.kaynak_id} (skor: ${skorSinirli})`);
  }

  return {
    skor: skorSinirli,
    sahte,
    sebepler,
    sonuc: sahte ? 'muhtemelen_sahte' : 'gercek',
  };
}

/**
 * Önbelleği temizler (uzun çalışmada bellek sızıntısını önler)
 */
export function clearFakeDetectorCache(): void {
  Object.keys(phoneCache).forEach(k => delete phoneCache[k]);
  Object.keys(saticiCache).forEach(k => delete saticiCache[k]);
}
