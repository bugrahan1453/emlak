<?php
/**
 * EmlakRadar Pro - AI Controller (Gelişmiş)
 */

class AIController {
    private AI $ai;

    public function __construct() {
        try {
            $user = Auth::user();
            if ($user) {
                $ofisModel = new Ofis();
                $ayarlar   = $ofisModel->getAyarlar($user['ofis_id']);
                $apiKey    = $ayarlar['openai_key'] ?? OPENAI_API_KEY;
            } else {
                $apiKey = OPENAI_API_KEY;
            }
        } catch (Exception $e) {
            $apiKey = OPENAI_API_KEY;
        }
        $this->ai = new AI($apiKey);
    }

    /** İlan değerleme */
    public function ilanDegerle(int $ilanId): void {
        $ilanModel  = new Ilan();
        $emsalModel = new EmsalVeri();
        $ilan       = $ilanModel->findById($ilanId);

        if (!$ilan) jsonResponse(false, null, 'İlan bulunamadı.', 404);

        // 24 saat cache kontrolü
        if ($this->ai->cacheKontrol($ilanId, 'ai_degerleme')) {
            $mevcut = is_string($ilan['ai_degerleme']) ? json_decode($ilan['ai_degerleme'], true) : ($ilan['ai_degerleme'] ?? []);
            jsonResponse(true, $mevcut, 'Mevcut AI değerleme (24 saat cache).');
            return;
        }

        $emsaller  = $emsalModel->getEmsaller($ilan['sehir'], $ilan['ilce'] ?? '', $ilan['mahalle'] ?? '');
        $degerleme = $this->ai->ilanDegerle($ilan, $emsaller);

        if (!empty($degerleme)) {
            $ilanModel->update($ilanId, ['ai_degerleme' => $degerleme]);
        }

        jsonResponse(true, $degerleme);
    }

    /** Fotoğraf analizi (Vision API) */
    public function fotografAnaliz(int $ilanId): void {
        $ilanModel = new Ilan();
        $ilan      = $ilanModel->findById($ilanId);

        if (!$ilan) jsonResponse(false, null, 'İlan bulunamadı.', 404);

        // Fotoğraf URL'lerini hazırla
        $fotograflar = is_string($ilan['fotograflar']) ? json_decode($ilan['fotograflar'], true) : ($ilan['fotograflar'] ?? []);
        if (empty($fotograflar)) jsonResponse(false, null, 'Bu ilanda fotoğraf yok.', 400);

        // Dosya yollarına çevir
        $urlList = [];
        foreach ($fotograflar as $foto) {
            $dosya = UPLOAD_PHOTO . '/' . basename($foto);
            if (file_exists($dosya)) $urlList[] = $dosya;
        }

        if (empty($urlList)) jsonResponse(false, null, 'Fotoğraf dosyaları bulunamadı.', 400);

        $result = $this->ai->fotografAnaliz($urlList);

        // Sonucu ai_degerleme'ye ekle (mevcut değerlemeyle birleştir)
        $mevcut = is_string($ilan['ai_degerleme']) ? json_decode($ilan['ai_degerleme'], true) : ($ilan['ai_degerleme'] ?? []);
        $mevcut['fotograf_analiz'] = $result;
        $ilanModel->update($ilanId, ['ai_degerleme' => $mevcut]);

        jsonResponse(true, $result);
    }

    /** Satıcı psikoloji analizi */
    public function saticiPsikoloji(int $ilanId): void {
        $ilanModel = new Ilan();
        $ilan      = $ilanModel->findById($ilanId);

        if (!$ilan) jsonResponse(false, null, 'İlan bulunamadı.', 404);

        $aciklama = $ilan['aciklama'] ?? $ilan['baslik'] ?? '';
        if (empty($aciklama)) jsonResponse(false, null, 'İlan açıklaması yok.', 400);

        $result = $this->ai->saticiPsikoloji($aciklama);

        // Sonucu ai_degerleme'ye ekle
        $mevcut = is_string($ilan['ai_degerleme']) ? json_decode($ilan['ai_degerleme'], true) : ($ilan['ai_degerleme'] ?? []);
        $mevcut['satici_psikoloji'] = $result;

        // pazarlik_skoru alanını da güncelle
        $updateData = ['ai_degerleme' => $mevcut];
        if (isset($result['pazarlik_motivasyonu'])) {
            $updateData['pazarlik_skoru'] = (int)$result['pazarlik_motivasyonu'];
        }
        $ilanModel->update($ilanId, $updateData);

        jsonResponse(true, $result);
    }

    /** Emsal değer tahmini */
    public function emsalDeger(int $ilanId): void {
        $ilanModel  = new Ilan();
        $emsalModel = new EmsalVeri();
        $ilan       = $ilanModel->findById($ilanId);

        if (!$ilan) jsonResponse(false, null, 'İlan bulunamadı.', 404);

        $emsaller = $emsalModel->getEmsaller($ilan['sehir'], $ilan['ilce'] ?? '', $ilan['mahalle'] ?? '');
        $result   = $this->ai->emsalDeger(
            $ilan['mahalle'] ?? '', $ilan['ilce'] ?? '', $ilan['sehir'] ?? '',
            $ilan['metrekare'] ?? 0, $ilan['oda_sayisi'] ?? '', $emsaller
        );

        // Sonucu ai_degerleme'ye ekle
        $mevcut = is_string($ilan['ai_degerleme']) ? json_decode($ilan['ai_degerleme'], true) : ($ilan['ai_degerleme'] ?? []);
        $mevcut['emsal_deger'] = $result;
        $ilanModel->update($ilanId, ['ai_degerleme' => $mevcut]);

        jsonResponse(true, $result);
    }

    /** Görev senaryosu */
    public function gorevSenaryo(int $gorevId): void {
        $gorevModel = new Gorev();
        $gorev      = $gorevModel->findById($gorevId);

        if (!$gorev) jsonResponse(false, null, 'Görev bulunamadı.', 404);

        $musteri = null;
        $musteriId = $gorev['musteri_id'] ?? $gorev['hedef_musteri_id'] ?? null;
        if ($musteriId) {
            $musteriModel = new Musteri();
            $musteri = $musteriModel->findById($musteriId);
        }

        $ilan = null;
        $ilanId = $gorev['ilan_id'] ?? $gorev['hedef_ilan_id'] ?? null;
        if ($ilanId) {
            $ilanModel = new Ilan();
            $ilan = $ilanModel->findById($ilanId);
        }

        // JSON yapılandırılmış senaryo
        $senaryoJson = $this->ai->konusmaSenaryosu($musteri ?? [], $ilan ?? [], $gorev['tip'] ?? 'arama');
        // Metin formatında da oluştur
        $senaryoMetin = $this->ai->gorevSenaryo($gorev, $musteri, $ilan);

        $gorevModel->update($gorevId, ['ai_senaryo' => $senaryoMetin]);

        jsonResponse(true, [
            'senaryo'      => $senaryoMetin,
            'senaryo_json' => $senaryoJson,
        ]);
    }

    /** Eşleştirme skoru hesapla */
    public function eslestirmeSkoruHesapla(int $musteriId, int $ilanId): void {
        $musteriModel = new Musteri();
        $ilanModel    = new Ilan();

        $musteri = $musteriModel->findById($musteriId);
        $ilan    = $ilanModel->findById($ilanId);

        if (!$musteri) jsonResponse(false, null, 'Müşteri bulunamadı.', 404);
        if (!$ilan)    jsonResponse(false, null, 'İlan bulunamadı.', 404);

        $result = $this->ai->eslestirmeSkoru($musteri, $ilan);
        jsonResponse(true, $result);
    }

    /** Sesli not parse */
    public function sesliNotParse(string $metin): void {
        $result = $this->ai->sesliNotParsele($metin);
        jsonResponse(true, $result);
    }
}
