/**
 * EmlakRadar Scraper — Mükerrer İlan Tespit Motoru
 * Benzerlik ≥ %80 = aynı ilan farklı kaynaklarda
 */
import { IlanVeri, DuplicateResult } from '../types';
import { textSimilarity, turkishLower } from '../utils/Helpers';
import { createLogger } from '../utils/Logger';
import crypto from 'crypto';

const logger = createLogger('DuplicateFinder');

const SIMILARITY_THRESHOLD = 0.80; // %80

interface DuplicateGroup {
  grup_id: string;
  ilanlar: IlanVeri[];
}

// Aktif mükerrer grupları
const gruplar: Map<string, DuplicateGroup> = new Map();

/**
 * İlanı mevcut ilanlarla karşılaştırır, mükerrer grubu döndürür
 */
export function findDuplicate(ilan: IlanVeri, mevcutIlanlar: IlanVeri[]): DuplicateResult {
  const adaylar = bulaAday(ilan, mevcutIlanlar);

  if (adaylar.length === 0) {
    return { mukerrer: false, benzerlik_skoru: 0 };
  }

  let enYuksekBenzerlik = 0;
  let enYuksekAday: IlanVeri | null = null;

  for (const aday of adaylar) {
    const benzerlik = hesaplaBenzerlik(ilan, aday);
    if (benzerlik > enYuksekBenzerlik) {
      enYuksekBenzerlik = benzerlik;
      enYuksekAday = aday;
    }
  }

  if (enYuksekBenzerlik < SIMILARITY_THRESHOLD || !enYuksekAday) {
    return { mukerrer: false, benzerlik_skoru: enYuksekBenzerlik };
  }

  // Gruba ekle veya yeni grup oluştur
  const grup_id = getOrCreateGroup(ilan, enYuksekAday);

  logger.info(`Mükerrer ilan: ${ilan.kaynak_id} ↔ ${enYuksekAday.kaynak_id} (benzerlik: ${Math.round(enYuksekBenzerlik * 100)}%)`);

  return {
    mukerrer: true,
    benzerlik_skoru: enYuksekBenzerlik,
    eslesen_ilan: enYuksekAday.kaynak_id,
    grup_id,
  };
}

/**
 * Ön filtre: mahalle + m² ±%5 + oda sayısı uyuşan adayları döndürür
 */
function bulaAday(ilan: IlanVeri, mevcutIlanlar: IlanVeri[]): IlanVeri[] {
  const m2 = ilan.metrekare;
  const oda = ilan.oda_sayisi;
  const mahalle = turkishLower(ilan.mahalle || ilan.ilce || '');

  return mevcutIlanlar.filter(i => {
    if (i.kaynak_id === ilan.kaynak_id) return false;
    if (i.tip !== ilan.tip) return false; // satilik/kiralik eşleşmeli

    // Mahalle kontrolü
    const iMahalle = turkishLower(i.mahalle || i.ilce || '');
    if (mahalle && iMahalle && mahalle !== iMahalle) return false;

    // m² ±%5
    if (m2 && i.metrekare) {
      const fark = Math.abs(m2 - i.metrekare) / m2;
      if (fark > 0.05) return false;
    }

    // Oda sayısı
    if (oda && i.oda_sayisi && oda !== i.oda_sayisi) return false;

    return true;
  });
}

/**
 * İki ilan arasındaki benzerliği hesaplar (0-1)
 */
function hesaplaBenzerlik(a: IlanVeri, b: IlanVeri): number {
  let skor = 0;
  let agirlik = 0;

  // Açıklama benzerliği (ağırlık: 40)
  if (a.aciklama && b.aciklama) {
    skor += textSimilarity(a.aciklama, b.aciklama) * 40;
    agirlik += 40;
  }

  // Başlık benzerliği (ağırlık: 20)
  if (a.baslik && b.baslik) {
    skor += textSimilarity(a.baslik, b.baslik) * 20;
    agirlik += 20;
  }

  // Fiyat benzerliği ±%3 (ağırlık: 20)
  if (a.fiyat && b.fiyat) {
    const fiyatFark = Math.abs(a.fiyat - b.fiyat) / Math.max(a.fiyat, b.fiyat);
    skor += (fiyatFark <= 0.03 ? 1 : Math.max(0, 1 - fiyatFark * 10)) * 20;
    agirlik += 20;
  }

  // Fotoğraf sayısı benzerliği (ağırlık: 10)
  if (a.fotograflar && b.fotograflar) {
    const fotoFark = Math.abs(a.fotograflar.length - b.fotograflar.length);
    skor += (fotoFark <= 2 ? 1 : Math.max(0, 1 - fotoFark * 0.1)) * 10;
    agirlik += 10;
  }

  // Konum eşleşmesi (ağırlık: 10)
  if (a.ilce && b.ilce) {
    skor += (turkishLower(a.ilce) === turkishLower(b.ilce) ? 1 : 0) * 10;
    agirlik += 10;
  }

  if (agirlik === 0) return 0;
  return skor / agirlik;
}

/**
 * Mükerrer grubu bul veya oluştur
 */
function getOrCreateGroup(a: IlanVeri, b: IlanVeri): string {
  // Var olan bir gruba dahil mi?
  for (const [grupId, grup] of gruplar.entries()) {
    const ids = grup.ilanlar.map(i => i.kaynak_id);
    if (ids.includes(a.kaynak_id) || ids.includes(b.kaynak_id)) {
      if (!ids.includes(a.kaynak_id)) grup.ilanlar.push(a);
      if (!ids.includes(b.kaynak_id)) grup.ilanlar.push(b);
      return grupId;
    }
  }

  // Yeni grup oluştur
  const grupId = 'dup_' + crypto.randomBytes(6).toString('hex');
  gruplar.set(grupId, { grup_id: grupId, ilanlar: [a, b] });
  return grupId;
}

/**
 * Tüm aktif mükerrer gruplarını döndürür
 */
export function getDuplicateGroups(): DuplicateGroup[] {
  return Array.from(gruplar.values());
}

/**
 * Önbelleği temizle
 */
export function clearDuplicateCache(): void {
  gruplar.clear();
}
