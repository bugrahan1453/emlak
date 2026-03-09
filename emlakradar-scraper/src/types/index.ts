/**
 * EmlakRadar Scraper — TypeScript Tip Tanımları
 */

export interface IlanVeri {
  // Kimlik
  kaynak_site: 'sahibinden' | 'hepsiemlak' | 'emlakjet';
  kaynak_url: string;
  kaynak_id: string;

  // Temel bilgiler
  baslik: string;
  aciklama: string;
  fiyat: number;
  fiyat_birimi: 'TL' | 'USD' | 'EUR';
  tip: 'satilik' | 'kiralik';
  kategori: 'daire' | 'villa' | 'mustakil' | 'arsa' | 'dukkan' | 'diger';

  // Konum
  sehir: string;
  ilce: string;
  mahalle: string;
  adres?: string;
  enlem?: number;
  boylam?: number;

  // Özellikler
  metrekare?: number;
  oda_sayisi?: string;
  kat?: string;
  bina_yasi?: number;
  isitma?: string;
  esya?: boolean;
  balkon?: boolean;
  asansor?: boolean;
  otopark?: boolean;
  site_ici?: boolean;

  // İlan sahibi
  satici_ad?: string;
  satici_tip?: 'bireysel' | 'kurumsal';
  telefon?: string;

  // Fotoğraflar
  fotograflar: string[];
  thumbnail?: string;

  // Analiz sonuçları
  sahtelik_skoru?: number;
  muhtemelen_sahte?: boolean;
  mukerrer_grup_id?: string;

  // Meta
  ilan_tarihi?: string;
  taranan_at: string;
}

export interface WebhookPayload {
  tip: 'yeni_ilan' | 'guncelleme' | 'silindi' | 'fiyat_degisiklik' | 'sahte_ilan';
  ilanlar?: IlanVeri[];
  ilan?: Partial<IlanVeri> & { kaynak_url: string; kaynak_id: string };
  zaman: string;
  kaynak: string;
}

export interface ScraperStats {
  baslangic: Date;
  bitis?: Date;
  taranan_sayfa: number;
  bulunan_ilan: number;
  yeni_ilan: number;
  guncellenen: number;
  hata_sayisi: number;
  sahte_tespit: number;
  mukerrer_tespit: number;
}

export interface ProxyConfig {
  url: string;
  protokol: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  kullanici?: string;
  sifre?: string;
  aktif: boolean;
  basari_sayisi: number;
  hata_sayisi: number;
  son_kullanim?: Date;
}

export interface ScrapeJobData {
  sehir: string;
  ilce?: string;
  tip: 'satilik' | 'kiralik';
  sayfa: number;
  site: 'sahibinden' | 'hepsiemlak' | 'emlakjet';
}

export interface FakeDetectionResult {
  skor: number;
  muhtemelen_sahte: boolean;
  nedenler: string[];
}

export interface DuplicateResult {
  mukerrer: boolean;
  grup_id?: string;
  benzerlik_skoru: number;
  eslesen_ilan?: string;
}

export interface GhostCheckResult {
  kaynak_url: string;
  kaynak_id: string;
  http_kodu: number;
  silindi: boolean;
  kontrol_zamani: string;
}

export interface SocketEvents {
  yeni_ilan: IlanVeri;
  kirmizi_alarm: {
    ilan: IlanVeri;
    neden: string;
    tasarruf?: number;
  };
  fiyat_degisiklik: {
    kaynak_url: string;
    eski_fiyat: number;
    yeni_fiyat: number;
    degisim_pct: number;
    ilan: Partial<IlanVeri>;
  };
  ilan_silindi: {
    kaynak_url: string;
    kaynak_id: string;
    kaynak_site: string;
  };
  scraper_durum: ScraperDurumEvent;
  sahte_ilan: {
    ilan: IlanVeri;
    skor: number;
    nedenler: string[];
  };
}

export interface ScraperDurumEvent {
  durum: 'calisıyor' | 'bekliyor' | 'hata' | 'durdu';
  aktif_gorev?: string;
  stats?: Partial<ScraperStats>;
  son_guncelleme: string;
}
