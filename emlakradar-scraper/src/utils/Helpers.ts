/**
 * EmlakRadar Scraper — Genel Yardımcı Fonksiyonlar
 */

/**
 * Belirtilen min-max arasında rastgele ms bekler
 */
export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Fiyat string'ini sayıya çevirir: "1.250.000 TL" → 1250000
 */
export function parseFiyat(fiyatStr: string): number | null {
  if (!fiyatStr) return null;
  const temiz = fiyatStr
    .replace(/[^\d,\.]/g, '')   // TL, boşluk vs. kaldır
    .replace(/\./g, '')          // binlik nokta kaldır
    .replace(',', '.');          // virgülü noktaya çevir
  const sayi = parseFloat(temiz);
  return isNaN(sayi) ? null : sayi;
}

/**
 * Metrekare string'ini sayıya çevirir: "120 m²" → 120
 */
export function parseMetrekare(m2Str: string): number | null {
  if (!m2Str) return null;
  const temiz = m2Str.replace(/[^\d,\.]/g, '').replace(',', '.');
  const sayi = parseFloat(temiz);
  return isNaN(sayi) ? null : sayi;
}

/**
 * URL normalleştir: fragment, tracking param'ları kaldır
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Tracking parametrelerini kaldır
    const silinecekler = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'referrer'];
    silinecekler.forEach(p => u.searchParams.delete(p));
    u.hash = '';
    return u.toString().replace(/\/$/, ''); // trailing slash kaldır
  } catch {
    return url.trim();
  }
}

/**
 * String'den kaynak_id çıkar (URL'den son segment)
 */
export function extractIdFromUrl(url: string, pattern?: RegExp): string {
  if (pattern) {
    const m = url.match(pattern);
    if (m && m[1]) return m[1];
  }
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || url;
  } catch {
    return url;
  }
}

/**
 * Telefon numarasını normalleştir: +90 (532) 123 45 67 → 05321234567
 */
export function normalizeTelefon(tel: string): string {
  if (!tel) return '';
  let temiz = tel.replace(/[^\d+]/g, '');
  if (temiz.startsWith('+90')) temiz = '0' + temiz.slice(3);
  if (temiz.startsWith('90') && temiz.length === 12) temiz = '0' + temiz.slice(2);
  if (!temiz.startsWith('0') && temiz.length === 10) temiz = '0' + temiz;
  return temiz;
}

/**
 * İki fiyat arasındaki değişim yüzdesini hesaplar
 */
export function fiyatDegisimYuzdesi(eskiFiyat: number, yeniFiyat: number): number {
  if (eskiFiyat === 0) return 0;
  return Math.round(((yeniFiyat - eskiFiyat) / eskiFiyat) * 100 * 100) / 100;
}

/**
 * Metni kısalt
 */
export function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
}

/**
 * Batch dizisini verilen boyuta böler
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Yeniden deneme ile async fonksiyon çalıştırır
 */
export async function retry<T>(
  fn: () => Promise<T>,
  attempts: number,
  delays: number[]
): Promise<T> {
  let lastError: Error;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (i < attempts - 1) {
        const delay = delays[i] ?? delays[delays.length - 1];
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError!;
}

/**
 * String'i Türkçe küçük harfe çevirir (karşılaştırma için)
 */
export function turkishLower(str: string): string {
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ğ/g, 'ğ')
    .replace(/Ş/g, 'ş')
    .replace(/Ü/g, 'ü')
    .replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç')
    .toLowerCase();
}

/**
 * Jaccard benzerliği (set-based)
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

/**
 * Metin benzerliği (bigram-based)
 */
export function textSimilarity(text1: string, text2: string): number {
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    const clean = turkishLower(s).replace(/\s+/g, ' ').trim();
    for (let i = 0; i < clean.length - 1; i++) {
      set.add(clean.slice(i, i + 2));
    }
    return set;
  };
  return jaccardSimilarity(bigrams(text1), bigrams(text2));
}
