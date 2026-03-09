<?php
/**
 * EmlakRadar Pro - OpenAI API Wrapper
 */

class AI {
    private string $apiKey;
    private string $baseUrl = 'https://api.openai.com/v1';

    public function __construct(string $apiKey = '') {
        $this->apiKey = $apiKey ?: OPENAI_API_KEY;
    }

    /**
     * Chat completion isteği gönder
     */
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

    /**
     * İlan AI değerleme yap
     */
    public function ilanDegerle(array $ilan, array $emsaller = []): array {
        $emsalMetni = '';
        foreach ($emsaller as $e) {
            $emsalMetni .= sprintf("- %s m², %s: %s ₺\n", $e['metrekare'] ?? '-', $e['mahalle'] ?? '-', number_format($e['fiyat'] ?? 0, 0, ',', '.'));
        }

        $prompt = sprintf(
            "Aşağıdaki emlak ilanını analiz et ve pazar değerini değerlendir:\n\n" .
            "İlan: %s\nKonum: %s, %s, %s\nFiyat: %s ₺\nM²: %s\nOda: %s\nKat: %s\nBina Yaşı: %s\n\n" .
            "%s\n\n" .
            "JSON formatında şu alanları döndür:\n" .
            "{\n  \"pazar_degeri\": <tahmin edilen gerçek pazar değeri (sayı)>,\n" .
            "  \"alt_sinir\": <minimum pazar değeri>,\n  \"ust_sinir\": <maksimum pazar değeri>,\n" .
            "  \"pazarlik_skoru\": <0-100 arası pazarlık potansiyeli>,\n" .
            "  \"degerleme_notu\": \"<kısa değerleme yorumu (Türkçe)>\",\n" .
            "  \"firsat_seviyesi\": \"<yuksek|orta|dusuk>\",\n" .
            "  \"tavsiye\": \"<alım/satım tavsiyesi (Türkçe)>\"\n}",
            $ilan['baslik'] ?? '',
            $ilan['sehir'] ?? '',
            $ilan['ilce'] ?? '',
            $ilan['mahalle'] ?? '',
            number_format($ilan['fiyat'] ?? 0, 0, ',', '.'),
            $ilan['metrekare'] ?? '-',
            $ilan['oda_sayisi'] ?? '-',
            $ilan['kat'] ?? '-',
            $ilan['bina_yasi'] ?? '-',
            $emsalMetni ? "Bölge Emsalleri:\n$emsalMetni" : "Bölge emsali mevcut değil."
        );

        $content = $this->chat([
            ['role' => 'system', 'content' => 'Sen bir deneyimli Türk gayrimenkul değerleme uzmanısın. Sadece JSON formatında yanıt ver.'],
            ['role' => 'user',   'content' => $prompt],
        ], '', 0.3, 800);

        if (!$content) return [];

        // JSON çıkar
        preg_match('/\{.*\}/s', $content, $matches);
        if (!$matches) return [];
        $decoded = json_decode($matches[0], true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * Görev AI senaryosu oluştur
     */
    public function gorevSenaryo(array $gorev, ?array $musteri = null, ?array $ilan = null): string {
        $prompt = "Bir emlak danışmanı için aşağıdaki göreve uygun telefon konuşma senaryosu yaz:\n\n";
        $prompt .= "Görev Tipi: {$gorev['tip']}\n";
        $prompt .= "Görev: {$gorev['baslik']}\n";

        if ($musteri) {
            $prompt .= "Müşteri: {$musteri['ad_soyad']} - Tip: {$musteri['tip']}\n";
            if ($musteri['butce_max']) {
                $prompt .= "Bütçe: " . number_format($musteri['butce_max'], 0, ',', '.') . " ₺\n";
            }
        }
        if ($ilan) {
            $prompt .= "İlan: {$ilan['baslik']} - " . number_format($ilan['fiyat'], 0, ',', '.') . " ₺\n";
        }

        $prompt .= "\nKısa, pratik, doğal bir Türkçe konuşma senaryosu yaz. Selamlama, konuya giriş, değer önerisi ve kapanış içersin. Maksimum 200 kelime.";

        return $this->chat([
            ['role' => 'system', 'content' => 'Sen deneyimli bir emlak danışmanı koçusun. Pratik ve etkili iletişim senaryoları yazıyorsun.'],
            ['role' => 'user',   'content' => $prompt],
        ]) ?? 'Senaryo üretilemedi. OpenAI API anahtarını kontrol edin.';
    }

    /**
     * Sesli not Whisper ile metne çevir
     */
    public function sesliNotCevir(string $dosyaYolu): ?string {
        if (empty($this->apiKey) || !file_exists($dosyaYolu)) return null;

        $ch = curl_init($this->baseUrl . '/audio/transcriptions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $this->apiKey],
            CURLOPT_POSTFIELDS     => [
                'file'  => new CURLFile($dosyaYolu),
                'model' => WHISPER_MODEL,
                'language' => 'tr',
            ],
            CURLOPT_TIMEOUT        => 60,
        ]);
        $response = curl_exec($ch);
        curl_close($ch);

        $data = json_decode($response, true);
        return $data['text'] ?? null;
    }

    /**
     * Eşleştirme açıklaması üret
     */
    public function eslestirmeAcikla(array $ilan, array $musteri, int $skor): string {
        $prompt = sprintf(
            "Bir emlak eşleştirmesi için kısa açıklama yaz:\n\n" .
            "Müşteri: %s (Tip: %s, Bütçe: %s - %s ₺)\n" .
            "İlan: %s (%s, %s ₺)\n" .
            "Uyum Skoru: %%%d\n\n" .
            "Neden uyumlu olduğunu 2-3 cümleyle Türkçe açıkla.",
            $musteri['ad_soyad'] ?? '',
            $musteri['tip'] ?? '',
            number_format($musteri['butce_min'] ?? 0, 0, ',', '.'),
            number_format($musteri['butce_max'] ?? 0, 0, ',', '.'),
            $ilan['baslik'] ?? '',
            ($ilan['ilce'] ?? '') . ' ' . ($ilan['mahalle'] ?? ''),
            number_format($ilan['fiyat'] ?? 0, 0, ',', '.'),
            $skor
        );

        return $this->chat([
            ['role' => 'user', 'content' => $prompt],
        ]) ?? 'Açıklama üretilemedi.';
    }

    /**
     * HTTP POST isteği
     */
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
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $response = curl_exec($ch);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) {
            error_log('OpenAI cURL hatası: ' . $error);
            return null;
        }
        return json_decode($response, true) ?? null;
    }
}
