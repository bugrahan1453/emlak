<?php
/**
 * EmlakRadar Pro - WhatsApp Business API Helper
 */

class WhatsApp {
    private string $token;
    private string $phoneId;
    private string $apiUrl;

    public function __construct(string $token = '', string $phoneId = '', string $apiUrl = '') {
        $this->token   = $token   ?: WHATSAPP_TOKEN;
        $this->phoneId = $phoneId ?: WHATSAPP_PHONE_ID;
        $this->apiUrl  = $apiUrl  ?: WHATSAPP_API_URL ?: 'https://graph.facebook.com/v19.0';
    }

    /**
     * Metin mesajı gönder
     */
    public function sendText(string $to, string $message): array {
        $to = $this->formatPhone($to);
        $payload = [
            'messaging_product' => 'whatsapp',
            'to'                => $to,
            'type'              => 'text',
            'text'              => ['body' => $message],
        ];
        return $this->send($payload);
    }

    /**
     * Eşleştirme mesajı gönder
     */
    public function sendEslestirme(string $to, array $ilan, array $musteri, int $skor): array {
        $mesaj = sprintf(
            "🏠 *Yeni Eşleştirme — EmlakRadar Pro*\n\n" .
            "Sayın %s,\n\n" .
            "Size uygun bir ilan bulduk!\n\n" .
            "📍 *%s*\n" .
            "💰 Fiyat: *%s ₺*\n" .
            "📐 %s m² | %s\n" .
            "📍 %s / %s\n\n" .
            "✅ Uyum Skoru: *%%%d*\n\n" .
            "Detaylar için danışmanınızla iletişime geçin.",
            $musteri['ad_soyad'] ?? '',
            $ilan['baslik'] ?? '',
            number_format($ilan['fiyat'] ?? 0, 0, ',', '.'),
            $ilan['metrekare'] ?? '-',
            $ilan['oda_sayisi'] ?? '-',
            $ilan['ilce'] ?? '',
            $ilan['mahalle'] ?? '',
            $skor
        );
        return $this->sendText($to, $mesaj);
    }

    /**
     * Görev hatırlatması gönder
     */
    public function sendGorevHatirlatma(string $to, array $gorev): array {
        $mesaj = sprintf(
            "⏰ *Görev Hatırlatması — EmlakRadar Pro*\n\n" .
            "Görev: *%s*\n" .
            "Tarih: %s %s\n" .
            "Öncelik: %s\n\n" .
            "EmlakRadar Panel üzerinden göreve ulaşabilirsiniz.",
            $gorev['baslik'] ?? '',
            $gorev['tarih'] ?? '',
            $gorev['saat'] ?? '',
            strtoupper($gorev['oncelik'] ?? '')
        );
        return $this->sendText($to, $mesaj);
    }

    /**
     * Numara formatlama (+90 ülke kodu)
     */
    private function formatPhone(string $phone): string {
        $phone = preg_replace('/\D/', '', $phone);
        if (strlen($phone) === 10 && $phone[0] === '0') {
            $phone = '90' . substr($phone, 1);
        } elseif (strlen($phone) === 10) {
            $phone = '90' . $phone;
        }
        return $phone;
    }

    /**
     * WhatsApp API'ye istek gönder
     */
    private function send(array $payload): array {
        if (empty($this->token) || empty($this->phoneId)) {
            return ['success' => false, 'message' => 'WhatsApp API yapılandırılmamış.'];
        }

        $url = sprintf('%s/%s/messages', $this->apiUrl, $this->phoneId);
        $ch  = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $this->token,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return ['success' => false, 'message' => 'cURL hatası: ' . $error];
        }

        $data = json_decode($response, true) ?? [];
        if ($httpCode >= 200 && $httpCode < 300) {
            return ['success' => true, 'data' => $data];
        }
        return [
            'success' => false,
            'message' => $data['error']['message'] ?? 'WhatsApp API hatası (HTTP ' . $httpCode . ')',
        ];
    }
}
