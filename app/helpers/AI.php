<?php
/**
 * EmlakRadar Pro - OpenAI API Wrapper (Gelişmiş)
 * Rate limiting, cache, 6 AI metodu + mevcut uyumluluk
 */

class AI {
    private string $apiKey;
    private string $baseUrl = 'https://api.openai.com/v1';
    private static int $dakikalikSayac = 0;
    private static float $sonSayacZamani = 0;

    public function __construct(string $apiKey = '') {
        $this->apiKey = $apiKey ?: OPENAI_API_KEY;
    }

    /* ── Rate Limit Kontrolü (dakikada max 10) ─────────────────────── */
    private function rateLimitKontrol(): bool {
        $simdi = microtime(true);
        if ($simdi - self::$sonSayacZamani > 60) {
            self::$dakikalikSayac = 0;
            self::$sonSayacZamani = $simdi;
        }
        if (self::$dakikalikSayac >= 10) return false;
        self::$dakikalikSayac++;
        return true;
    }

    /* ── API Çağrısını Logla ───────────────────────────────────────── */
    private function logApiCall(string $islem, bool $basarili, string $detay = ''): void {
        try {
            logSystem('ai_api', $islem, ($basarili ? 'Başarılı' : 'Başarısız') . ($detay ? ': ' . $detay : ''));
        } catch (\Exception $e) {}
    }

    /* ── 24 Saat Cache Kontrolü ────────────────────────────────────── */
    public function cacheKontrol(int $ilanId, string $alan): bool {
        try {
            $db = db();
            $st = $db->prepare("SELECT $alan, updated_at FROM ilanlar WHERE id = ?");
            $st->execute([$ilanId]);
            $row = $st->fetch();
            if (!$row || empty($row[$alan])) return false;
            $data = is_string($row[$alan]) ? json_decode($row[$alan], true) : $row[$alan];
            if (empty($data)) return false;
            $ts = isset($data['_timestamp']) ? strtotime($data['_timestamp']) : strtotime($row['updated_at']);
            return (time() - $ts) < 86400;
        } catch (\Exception $e) { return false; }
    }

    /* ═══════════════════════════════════════════════════════════════
     * 1. FOTOĞRAF ANALİZİ (Vision API)
     * ═══════════════════════════════════════════════════════════════ */
    public function fotografAnaliz(array $fotografUrlleri): array {
        if (empty($this->apiKey) || empty($fotografUrlleri)) return $this->fotografVarsayilan();
        if (!$this->rateLimitKontrol()) { $this->logApiCall('fotograf_analiz', false, 'Rate limit'); return $this->fotografVarsayilan(); }

        $content = [['type' => 'text', 'text' => 'Bu emlak fotoğraflarını analiz et.']];
        foreach (array_slice($fotografUrlleri, 0, 4) as $url) {
            if (file_exists($url)) {
                $mime = mime_content_type($url) ?: 'image/jpeg';
                $b64  = base64_encode(file_get_contents($url));
                $content[] = ['type' => 'image_url', 'image_url' => ['url' => "data:$mime;base64,$b64", 'detail' => 'low']];
            } else {
                $content[] = ['type' => 'image_url', 'image_url' => ['url' => $url, 'detail' => 'low']];
            }
        }

        $response = $this->post('/chat/completions', [
            'model'      => 'gpt-4o',
            'messages'   => [
                ['role' => 'system', 'content' => 'Sen bir emlak değerleme uzmanısın. Bu fotoğrafları analiz et ve JSON formatında döndür: {"tadilat_durumu": (1-10), "mutfak_yasi_tahmini": (yıl), "banyo_yasi_tahmini": (yıl), "genel_kalite": (1-10), "arti_yonler": ["..."], "eksi_yonler": ["..."], "tahmini_tadilat_maliyeti_tl": (sayı), "ozet": "metin"}. Sadece JSON döndür, başka metin ekleme.'],
                ['role' => 'user',   'content' => $content],
            ],
            'temperature' => 0.3,
            'max_tokens'  => 800,
        ]);

        $text = $response['choices'][0]['message']['content'] ?? null;
        if (!$text) { $this->logApiCall('fotograf_analiz', false, 'Boş yanıt'); return $this->fotografVarsayilan(); }

        $result = $this->jsonParsele($text);
        $result['_timestamp'] = date('Y-m-d H:i:s');
        $this->logApiCall('fotograf_analiz', !empty($result));
        return !empty($result) ? $result : $this->fotografVarsayilan();
    }

    private function fotografVarsayilan(): array {
        return [
            'tadilat_durumu' => 5, 'mutfak_yasi_tahmini' => 10, 'banyo_yasi_tahmini' => 10,
            'genel_kalite' => 5, 'arti_yonler' => ['Analiz yapılamadı'], 'eksi_yonler' => ['Analiz yapılamadı'],
            'tahmini_tadilat_maliyeti_tl' => 0, 'ozet' => 'AI fotoğraf analizi yapılamadı.',
        ];
    }

    /* ═══════════════════════════════════════════════════════════════
     * 2. SATICI PSİKOLOJİ ANALİZİ
     * ═══════════════════════════════════════════════════════════════ */
    public function saticiPsikoloji(string $ilanAciklama): array {
        if (empty($this->apiKey) || empty($ilanAciklama)) return $this->psikolojiVarsayilan();
        if (!$this->rateLimitKontrol()) { $this->logApiCall('satici_psikoloji', false, 'Rate limit'); return $this->psikolojiVarsayilan(); }

        $content = $this->chat([
            ['role' => 'system', 'content' => 'Bu emlak ilan metnini analiz et. Satıcının psikolojik durumunu, aciliyet seviyesini ve pazarlık potansiyelini değerlendir. Sadece JSON döndür: {"aciliyet_seviyesi": (1-10), "pazarlik_motivasyonu": (0-100), "tespit_edilen_ipuclari": ["acil", "ihtiyaçtan", "tayin" gibi], "tahmini_pazarlik_payi_yuzde": (sayı), "genel_degerlendirme": "metin", "onerilen_yaklasim": "metin"}'],
            ['role' => 'user', 'content' => "İlan metni:\n\n" . $ilanAciklama],
        ], '', 0.3, 600);

        if (!$content) { $this->logApiCall('satici_psikoloji', false, 'Boş yanıt'); return $this->psikolojiVarsayilan(); }

        $result = $this->jsonParsele($content);
        $result['_timestamp'] = date('Y-m-d H:i:s');
        $this->logApiCall('satici_psikoloji', !empty($result));
        return !empty($result) ? $result : $this->psikolojiVarsayilan();
    }

    private function psikolojiVarsayilan(): array {
        return [
            'aciliyet_seviyesi' => 5, 'pazarlik_motivasyonu' => 50,
            'tespit_edilen_ipuclari' => ['Analiz yapılamadı'], 'tahmini_pazarlik_payi_yuzde' => 10,
            'genel_degerlendirme' => 'AI analizi yapılamadı.', 'onerilen_yaklasim' => 'Standart yaklaşım ile devam edin.',
        ];
    }

    /* ═══════════════════════════════════════════════════════════════
     * 3. EMSAL DEĞER TAHMİNİ
     * ═══════════════════════════════════════════════════════════════ */
    public function emsalDeger(string $mahalle, string $ilce, string $sehir, $metrekare, $odaSayisi, array $emsalVerileri = []): array {
        if (empty($this->apiKey)) return $this->emsalVarsayilan();
        if (!$this->rateLimitKontrol()) { $this->logApiCall('emsal_deger', false, 'Rate limit'); return $this->emsalVarsayilan(); }

        $emsalMetni = '';
        foreach ($emsalVerileri as $e) {
            $emsalMetni .= sprintf("- %s, %s m², %s oda, %s ₺ (%s)\n",
                $e['mahalle'] ?? '-', $e['metrekare'] ?? '-', $e['oda_sayisi'] ?? '-',
                number_format($e['fiyat'] ?? 0, 0, ',', '.'), $e['tarih'] ?? '-');
        }

        $prompt = "Konum: $mahalle, $ilce, $sehir\nMetrekare: $metrekare m²\nOda: $odaSayisi\n\n"
            . ($emsalMetni ? "Bölge Emsal Satışları:\n$emsalMetni" : "Emsal veri yok, genel bilginle tahmin et.");

        $content = $this->chat([
            ['role' => 'system', 'content' => 'Emlak değerleme uzmanısın. Verilen emsal satış verileriyle bu evin gerçek piyasa değerini hesapla. Sadece JSON döndür: {"tahmini_deger_tl": (sayı), "guven_araligi_alt": (sayı), "guven_araligi_ust": (sayı), "metrekare_birim_fiyat": (sayı), "bolge_ortalamasi": (sayı), "degerlendirme": "metin"}'],
            ['role' => 'user', 'content' => $prompt],
        ], '', 0.3, 600);

        if (!$content) { $this->logApiCall('emsal_deger', false, 'Boş yanıt'); return $this->emsalVarsayilan(); }

        $result = $this->jsonParsele($content);
        $result['_timestamp'] = date('Y-m-d H:i:s');
        $this->logApiCall('emsal_deger', !empty($result));
        return !empty($result) ? $result : $this->emsalVarsayilan();
    }

    private function emsalVarsayilan(): array {
        return [
            'tahmini_deger_tl' => 0, 'guven_araligi_alt' => 0, 'guven_araligi_ust' => 0,
            'metrekare_birim_fiyat' => 0, 'bolge_ortalamasi' => 0, 'degerlendirme' => 'AI emsal analizi yapılamadı.',
        ];
    }

    /* ═══════════════════════════════════════════════════════════════
     * 4. KONUŞMA SENARYOSU (JSON yapılandırılmış çıktı)
     * ═══════════════════════════════════════════════════════════════ */
    public function konusmaSenaryosu(array $musteriData, array $ilanData, string $gorevTipi = 'arama'): array {
        if (empty($this->apiKey)) return $this->senaryoVarsayilan($gorevTipi);
        if (!$this->rateLimitKontrol()) { $this->logApiCall('konusma_senaryosu', false, 'Rate limit'); return $this->senaryoVarsayilan($gorevTipi); }

        $tipAciklama = match($gorevTipi) {
            'arama'    => 'İlk kez aranacak müşteri/satıcı',
            'gosterim' => 'Ev gösterimi sonrası takip',
            'takip'    => 'Daha önce görüşülmüş, takip araması',
            default    => 'Genel emlak danışmanlığı araması',
        };

        $prompt = "Görev tipi: $gorevTipi ($tipAciklama)\n"
            . "Müşteri: " . ($musteriData['ad_soyad'] ?? 'Bilinmiyor') . " (Tip: " . ($musteriData['tip'] ?? '-') . ")\n"
            . "Bütçe: " . (isset($musteriData['butce_max']) ? number_format((float)$musteriData['butce_max'], 0, ',', '.') . ' ₺' : 'Belirtilmemiş') . "\n"
            . "İlan: " . ($ilanData['baslik'] ?? 'Belirtilmemiş') . "\n"
            . "Fiyat: " . (isset($ilanData['fiyat']) ? number_format((float)$ilanData['fiyat'], 0, ',', '.') . ' ₺' : '-') . "\n"
            . "Konum: " . implode(', ', array_filter([$ilanData['ilce'] ?? '', $ilanData['sehir'] ?? '']));

        $content = $this->chat([
            ['role' => 'system', 'content' => 'Emlak danışmanı için telefon konuşma senaryosu yaz. Türkçe, doğal, ikna edici, profesyonel ama samimi. Sadece JSON döndür: {"acilis_cumlesi": "...", "ana_mesaj": "...", "olasi_itirazlar_ve_yanitlar": [{"itiraz": "...", "yanit": "..."}], "kapanis_cumlesi": "...", "dikkat_edilecekler": ["..."]}. Tam 3 itiraz-yanıt çifti olsun.'],
            ['role' => 'user', 'content' => $prompt],
        ], '', 0.7, 1200);

        if (!$content) { $this->logApiCall('konusma_senaryosu', false, 'Boş yanıt'); return $this->senaryoVarsayilan($gorevTipi); }

        $result = $this->jsonParsele($content);
        $this->logApiCall('konusma_senaryosu', !empty($result));
        return !empty($result) ? $result : $this->senaryoVarsayilan($gorevTipi);
    }

    private function senaryoVarsayilan(string $tip): array {
        return [
            'acilis_cumlesi' => 'Merhaba, EmlakRadar\'dan arıyorum. Uygun bir zamanınız var mı?',
            'ana_mesaj' => 'Size uygun bir fırsatımız var, detayları paylaşmak istiyorum.',
            'olasi_itirazlar_ve_yanitlar' => [
                ['itiraz' => 'Şu an ilgilenmiyorum', 'yanit' => 'Anlıyorum, not alıyorum. İleride ihtiyacınız olursa bize ulaşabilirsiniz.'],
                ['itiraz' => 'Fiyat yüksek', 'yanit' => 'Bölge değerleri üzerine bir karşılaştırma hazırlayabilirim.'],
                ['itiraz' => 'Başka yerlerle görüşüyorum', 'yanit' => 'Tabii ki, karşılaştırmanız için detaylı bilgi gönderebilirim.'],
            ],
            'kapanis_cumlesi' => 'İlginiz için teşekkürler, güzel günler dilerim.',
            'dikkat_edilecekler' => ['Samimi ve profesyonel ol', 'Baskı yapma', 'Not al'],
        ];
    }

    /* ═══════════════════════════════════════════════════════════════
     * 5. EŞLEŞTİRME SKORU (PHP hesaplama + AI yorum)
     * ═══════════════════════════════════════════════════════════════ */
    public function eslestirmeSkoru(array $musteriTercihleri, array $ilanOzellikleri): array {
        // 1. PHP ile matematiksel skor hesapla
        $bolge = $this->bolgeSkoruHesapla($musteriTercihleri, $ilanOzellikleri);
        $fiyat = $this->fiyatSkoruHesapla($musteriTercihleri, $ilanOzellikleri);
        $oda   = $this->odaSkoruHesapla($musteriTercihleri, $ilanOzellikleri);
        $mkare = $this->metrekareSkoruHesapla($musteriTercihleri, $ilanOzellikleri);

        // Ağırlıklı toplam: bölge %30, fiyat %30, oda %20, m² %20
        $toplam = (int)round(($bolge * 0.30) + ($fiyat * 0.30) + ($oda * 0.20) + ($mkare * 0.20));

        $sonuc = [
            'toplam_skor'     => $toplam,
            'bolge_skoru'     => $bolge,
            'fiyat_skoru'     => $fiyat,
            'oda_skoru'       => $oda,
            'metrekare_skoru' => $mkare,
            'ai_yorum'        => '',
        ];

        // 2. AI'dan kısa yorum al (opsiyonel)
        if (!empty($this->apiKey) && $this->rateLimitKontrol()) {
            $aciklama = sprintf(
                "Müşteri: %s, Bütçe: %s-%s ₺, Tercih: %s, %s oda\nİlan: %s, Fiyat: %s ₺, %s m², %s oda, Konum: %s %s\nUyum: %%%d",
                $musteriTercihleri['ad_soyad'] ?? '-',
                number_format((float)($musteriTercihleri['butce_min'] ?? 0), 0, ',', '.'),
                number_format((float)($musteriTercihleri['butce_max'] ?? 0), 0, ',', '.'),
                $musteriTercihleri['tercih_bolge'] ?? ($musteriTercihleri['tercihler']['bolge'] ?? '-'),
                $musteriTercihleri['tercih_oda'] ?? ($musteriTercihleri['tercihler']['oda_sayisi'] ?? '-'),
                $ilanOzellikleri['baslik'] ?? '-',
                number_format((float)($ilanOzellikleri['fiyat'] ?? 0), 0, ',', '.'),
                $ilanOzellikleri['metrekare'] ?? '-',
                $ilanOzellikleri['oda_sayisi'] ?? '-',
                $ilanOzellikleri['ilce'] ?? '-',
                $ilanOzellikleri['sehir'] ?? '-',
                $toplam
            );

            $yorum = $this->chat([
                ['role' => 'system', 'content' => '2-3 cümlelik Türkçe eşleştirme yorumu yaz. Kısa, öz ve pratik.'],
                ['role' => 'user', 'content' => $aciklama],
            ], '', 0.5, 200);

            $sonuc['ai_yorum'] = $yorum ?? '';
            $this->logApiCall('eslestirme_skoru', true);
        }

        return $sonuc;
    }

    private function bolgeSkoruHesapla(array $m, array $i): int {
        $tercihBolge = $m['tercih_bolge'] ?? ($m['tercihler']['bolge'] ?? '');
        if (empty($tercihBolge)) return 50;

        $ilanBolge = implode(' ', array_filter([$i['ilce'] ?? '', $i['mahalle'] ?? '', $i['sehir'] ?? '']));
        if (empty($ilanBolge)) return 50;

        // Tam eşleşme (ilçe veya mahalle)
        if (mb_stripos($ilanBolge, $tercihBolge) !== false) return 100;
        // Aynı şehir farklı ilçe
        $tercihSehir = $m['tercih_sehir'] ?? ($m['tercihler']['sehir'] ?? '');
        if ($tercihSehir && mb_stripos($i['sehir'] ?? '', $tercihSehir) !== false) return 50;
        return 0;
    }

    private function fiyatSkoruHesapla(array $m, array $i): int {
        $fiyat = (float)($i['fiyat'] ?? 0);
        $min   = (float)($m['butce_min'] ?? 0);
        $max   = (float)($m['butce_max'] ?? 0);
        if ($fiyat <= 0 || $max <= 0) return 50;

        if ($fiyat >= $min && $fiyat <= $max) return 100;
        if ($fiyat < $min) return 70;
        $asim = (($fiyat - $max) / $max) * 100;
        if ($asim <= 10) return 66;
        if ($asim <= 20) return 33;
        return 0;
    }

    private function odaSkoruHesapla(array $m, array $i): int {
        $tercih = $m['tercih_oda'] ?? ($m['tercihler']['oda_sayisi'] ?? '');
        $ilan   = $i['oda_sayisi'] ?? '';
        if (empty($tercih) || empty($ilan)) return 50;
        if ($tercih == $ilan) return 100;
        $t = (float)$tercih; $il = (float)$ilan;
        if (abs($t - $il) <= 1) return 50;
        return 0;
    }

    private function metrekareSkoruHesapla(array $m, array $i): int {
        $tercih = (float)($m['tercih_metrekare'] ?? ($m['tercihler']['metrekare'] ?? 0));
        $ilan   = (float)($i['metrekare'] ?? 0);
        if ($tercih <= 0 || $ilan <= 0) return 50;
        $fark = abs($tercih - $ilan) / $tercih * 100;
        if ($fark <= 10) return 100;
        if ($fark <= 20) return 50;
        return 0;
    }

    /* ═══════════════════════════════════════════════════════════════
     * 6. SESLİ NOT PARSE
     * ═══════════════════════════════════════════════════════════════ */
    public function sesliNotParsele(string $metin): array {
        if (empty($this->apiKey) || empty($metin)) return $this->sesliNotVarsayilan($metin);
        if (!$this->rateLimitKontrol()) { $this->logApiCall('sesli_not_parse', false, 'Rate limit'); return $this->sesliNotVarsayilan($metin); }

        $content = $this->chat([
            ['role' => 'system', 'content' => 'Bu sesli nottan yapılandırılmış bilgi çıkar. Sadece JSON döndür: {"musteri_adi": "varsa", "telefon": "varsa", "tercihler": {"bolge": "", "oda": "", "butce": ""}, "gorev_notu": "özet", "sonraki_adim": "önerilen aksiyon", "duygu_analizi": "olumlu/olumsuz/nötr"}. Bulunamayan alanları boş string bırak.'],
            ['role' => 'user', 'content' => "Sesli not transkripsiyonu:\n\n" . $metin],
        ], '', 0.3, 600);

        if (!$content) { $this->logApiCall('sesli_not_parse', false, 'Boş yanıt'); return $this->sesliNotVarsayilan($metin); }

        $result = $this->jsonParsele($content);
        $this->logApiCall('sesli_not_parse', !empty($result));
        return !empty($result) ? $result : $this->sesliNotVarsayilan($metin);
    }

    private function sesliNotVarsayilan(string $metin): array {
        return [
            'musteri_adi' => '', 'telefon' => '',
            'tercihler' => ['bolge' => '', 'oda' => '', 'butce' => ''],
            'gorev_notu' => mb_substr($metin, 0, 200),
            'sonraki_adim' => 'Not incelensin', 'duygu_analizi' => 'nötr',
        ];
    }

    /* ═══════════════════════════════════════════════════════════════
     * MEVCUT METODLAR (geriye uyumluluk)
     * ═══════════════════════════════════════════════════════════════ */

    /** Chat completion isteği */
    public function chat(array $messages, string $model = '', float $temperature = 0.7, int $maxTokens = 1500): ?string {
        if (empty($this->apiKey)) return null;

        $data = [
            'model'       => $model ?: OPENAI_MODEL,
            'messages'    => $messages,
            'temperature' => $temperature,
            'max_tokens'  => $maxTokens,
        ];
        $response = $this->post('/chat/completions', $data);
        return $response['choices'][0]['message']['content'] ?? null;
    }

    /** İlan AI değerleme */
    public function ilanDegerle(array $ilan, array $emsaller = []): array {
        if (empty($this->apiKey)) return [];
        if (!$this->rateLimitKontrol()) { $this->logApiCall('ilan_degerle', false, 'Rate limit'); return []; }

        $emsalMetni = '';
        foreach ($emsaller as $e) {
            $emsalMetni .= sprintf("- %s m², %s: %s ₺\n", $e['metrekare'] ?? '-', $e['mahalle'] ?? '-', number_format($e['fiyat'] ?? 0, 0, ',', '.'));
        }

        $prompt = sprintf(
            "İlan: %s\nKonum: %s, %s, %s\nFiyat: %s ₺\nM²: %s\nOda: %s\nKat: %s\nBina Yaşı: %s\n\n%s\n\n"
            . "JSON döndür: {\"pazar_degeri\": sayı, \"alt_sinir\": sayı, \"ust_sinir\": sayı, \"pazarlik_skoru\": 0-100, "
            . "\"degerleme_notu\": \"metin\", \"firsat_seviyesi\": \"yuksek|orta|dusuk\", \"tavsiye\": \"metin\"}",
            $ilan['baslik'] ?? '', $ilan['sehir'] ?? '', $ilan['ilce'] ?? '', $ilan['mahalle'] ?? '',
            number_format($ilan['fiyat'] ?? 0, 0, ',', '.'), $ilan['metrekare'] ?? '-',
            $ilan['oda_sayisi'] ?? '-', $ilan['kat'] ?? '-', $ilan['bina_yasi'] ?? '-',
            $emsalMetni ? "Bölge Emsalleri:\n$emsalMetni" : "Bölge emsali yok."
        );

        $content = $this->chat([
            ['role' => 'system', 'content' => 'Deneyimli Türk gayrimenkul değerleme uzmanısın. Sadece JSON döndür.'],
            ['role' => 'user',   'content' => $prompt],
        ], '', 0.3, 800);

        if (!$content) { $this->logApiCall('ilan_degerle', false, 'Boş yanıt'); return []; }
        $result = $this->jsonParsele($content);
        if (!empty($result)) $result['_timestamp'] = date('Y-m-d H:i:s');
        $this->logApiCall('ilan_degerle', !empty($result));
        return $result;
    }

    /** Görev AI senaryosu oluştur (metin formatında — uyumluluk) */
    public function gorevSenaryo(array $gorev, ?array $musteri = null, ?array $ilan = null): string {
        $result = $this->konusmaSenaryosu($musteri ?? [], $ilan ?? [], $gorev['tip'] ?? 'arama');
        $metin = "AÇILIŞ:\n" . ($result['acilis_cumlesi'] ?? '') . "\n\n";
        $metin .= "ANA MESAJ:\n" . ($result['ana_mesaj'] ?? '') . "\n\n";
        $metin .= "OLASI İTİRAZLAR VE YANITLAR:\n";
        foreach ($result['olasi_itirazlar_ve_yanitlar'] ?? [] as $i => $iy) {
            $metin .= ($i + 1) . ". İtiraz: " . ($iy['itiraz'] ?? '') . "\n";
            $metin .= "   Yanıt: " . ($iy['yanit'] ?? '') . "\n\n";
        }
        $metin .= "KAPANIŞ:\n" . ($result['kapanis_cumlesi'] ?? '') . "\n\n";
        $metin .= "DİKKAT EDİLECEKLER:\n";
        foreach ($result['dikkat_edilecekler'] ?? [] as $d) {
            $metin .= "- $d\n";
        }
        return $metin;
    }

    /** Sesli not Whisper ile metne çevir */
    public function sesliNotCevir(string $dosyaYolu): ?string {
        if (empty($this->apiKey) || !file_exists($dosyaYolu)) return null;

        $ch = curl_init($this->baseUrl . '/audio/transcriptions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $this->apiKey],
            CURLOPT_POSTFIELDS     => [
                'file'     => new CURLFile($dosyaYolu),
                'model'    => WHISPER_MODEL,
                'language' => 'tr',
            ],
            CURLOPT_TIMEOUT => 60,
        ]);
        $response = curl_exec($ch);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) { $this->logApiCall('whisper', false, $error); return null; }
        $data = json_decode($response, true);
        $this->logApiCall('whisper', !empty($data['text']));
        return $data['text'] ?? null;
    }

    /** Eşleştirme açıklaması (uyumluluk) */
    public function eslestirmeAcikla(array $ilan, array $musteri, int $skor): string {
        $sonuc = $this->eslestirmeSkoru($musteri, $ilan);
        return $sonuc['ai_yorum'] ?: 'Açıklama üretilemedi.';
    }

    /* ── Yardımcılar ──────────────────────────────────────────────── */

    /** JSON yanıtını parse et */
    private function jsonParsele(string $text): array {
        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $text, $m)) {
            $text = $m[1];
        }
        preg_match('/\{[\s\S]*\}/s', $text, $matches);
        if (!$matches) return [];
        $decoded = json_decode($matches[0], true);
        return is_array($decoded) ? $decoded : [];
    }

    /** HTTP POST isteği */
    private function post(string $endpoint, array $data): ?array {
        $ch = curl_init($this->baseUrl . $endpoint);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $this->apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS     => json_encode($data),
            CURLOPT_TIMEOUT        => 45,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $response = curl_exec($ch);
        $error    = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($error) { error_log("OpenAI cURL hatası: $error"); return null; }
        if ($httpCode >= 400) { error_log("OpenAI HTTP $httpCode: $response"); return null; }
        return json_decode($response, true) ?? null;
    }
}
