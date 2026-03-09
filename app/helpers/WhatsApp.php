<?php
/**
 * EmlakRadar Pro — WhatsApp Entegrasyon Yardımcısı
 * Mod 1: WhatsApp Web Link (her zaman çalışır)
 * Mod 2: WhatsApp Business API (WHATSAPP_TOKEN ve WHATSAPP_PHONE_ID tanımlıysa)
 */

class WhatsApp {

    private string $token;
    private string $phoneId;
    private string $apiUrl;
    private bool   $apiModu;

    public function __construct() {
        $this->token   = defined('WHATSAPP_TOKEN')    ? WHATSAPP_TOKEN    : '';
        $this->phoneId = defined('WHATSAPP_PHONE_ID') ? WHATSAPP_PHONE_ID : '';
        $this->apiUrl  = defined('WHATSAPP_API_URL')  ? WHATSAPP_API_URL  : 'https://graph.facebook.com/v19.0';
        $this->apiModu = !empty($this->token) && !empty($this->phoneId);
    }

    /* ─────────────────────────────────────────────────────────────────
     * MOD 1: WhatsApp Web Link
     * ───────────────────────────────────────────────────────────────── */
    public function webLink(string $telefon, string $mesaj): string {
        $tel = $this->formatTelefon($telefon);
        return 'https://wa.me/' . $tel . '?text=' . urlencode($mesaj);
    }

    /* ─────────────────────────────────────────────────────────────────
     * MOD 2: WhatsApp Business API — metin mesajı gönder
     * ───────────────────────────────────────────────────────────────── */
    public function gondер(string $telefon, string $mesaj): array {
        if (!$this->apiModu) {
            return [
                'success' => false,
                'link'    => $this->webLink($telefon, $mesaj),
                'message' => 'API yapılandırılmamış. Web link kullanın.',
            ];
        }
        return $this->apiGonder([
            'messaging_product' => 'whatsapp',
            'to'                => $this->formatTelefon($telefon),
            'type'              => 'text',
            'text'              => ['body' => $mesaj],
        ]);
    }

    /* ─────────────────────────────────────────────────────────────────
     * ŞABLON: Yeni İlan Bildirimi
     * ───────────────────────────────────────────────────────────────── */
    public function yeniIlanMesaji(array $musteri, array $ilan, string $ofisAd = ''): string {
        return sprintf(
            "Merhaba %s 👋\n\n" .
            "Aradığınız kriterlere uygun yeni bir ilan bulduk! 🏠\n\n" .
            "📍 *%s*\n" .
            "💰 %s ₺\n" .
            "📐 %s m² | %s\n" .
            "📌 %s, %s\n\n" .
            "Detaylı bilgi ve görüntüleme randevusu için danışmanınızla iletişime geçin.\n\n" .
            "_%s_",
            $musteri['ad_soyad'] ?? 'Değerli Müşterimiz',
            $ilan['baslik'] ?? '',
            number_format($ilan['fiyat'] ?? 0, 0, ',', '.'),
            $ilan['metrekare'] ?? '-',
            $ilan['oda_sayisi'] ?? '-',
            $ilan['mahalle'] ?? '',
            $ilan['ilce'] ?? '',
            $ofisAd ?: 'EmlakRadar Pro'
        );
    }

    /* ─────────────────────────────────────────────────────────────────
     * ŞABLON: Fiyat Düşüşü Bildirimi
     * ───────────────────────────────────────────────────────────────── */
    public function fiyatDususMesaji(array $musteri, array $ilan, float $eskiFiyat): string {
        $dusus = $eskiFiyat - ($ilan['fiyat'] ?? 0);
        $dususPct = $eskiFiyat > 0 ? round($dusus / $eskiFiyat * 100, 1) : 0;
        return sprintf(
            "Merhaba %s 📢\n\n" .
            "İlgilendiğiniz ilanda *fiyat düşüşü* gerçekleşti! 🎉\n\n" .
            "🏠 *%s*\n" .
            "💰 Eski fiyat: ~%s ₺~\n" .
            "✅ Yeni fiyat: *%s ₺*\n" .
            "📉 İndirim: %s ₺ (%%%s)\n\n" .
            "Fırsatı kaçırmadan hemen iletişime geçin!",
            $musteri['ad_soyad'] ?? 'Değerli Müşterimiz',
            $ilan['baslik'] ?? '',
            number_format($eskiFiyat, 0, ',', '.'),
            number_format($ilan['fiyat'] ?? 0, 0, ',', '.'),
            number_format($dusus, 0, ',', '.'),
            $dususPct
        );
    }

    /* ─────────────────────────────────────────────────────────────────
     * ŞABLON: Eşleştirme Bildirimi
     * ───────────────────────────────────────────────────────────────── */
    public function eslestirmeMesaji(array $musteri, array $ilan, int $skor): string {
        return sprintf(
            "Merhaba %s 🎯\n\n" .
            "Kriterlerinize *%%%d uyumlu* yeni bir ilan bulduk!\n\n" .
            "🏠 *%s*\n" .
            "💰 %s ₺\n" .
            "📐 %s m² | %s\n" .
            "📍 %s / %s\n\n" .
            "Detaylar için danışmanınızla iletişime geçin. 📞",
            $musteri['ad_soyad'] ?? 'Değerli Müşterimiz',
            $skor,
            $ilan['baslik'] ?? '',
            number_format($ilan['fiyat'] ?? 0, 0, ',', '.'),
            $ilan['metrekare'] ?? '-',
            $ilan['oda_sayisi'] ?? '-',
            $ilan['ilce'] ?? '',
            $ilan['mahalle'] ?? ''
        );
    }

    /* ─────────────────────────────────────────────────────────────────
     * ŞABLON: Rapor Gönderimi
     * ───────────────────────────────────────────────────────────────── */
    public function raporMesaji(array $musteri, string $raporTipi, string $raporUrl): string {
        $tipAd = match($raporTipi) {
            'gerceklik_tokadi' => 'Gerçeklik Tokadı',
            'roi'              => 'ROI / Yatırım Getiri Analizi',
            'portfoy'          => 'Portföy Özet',
            default            => ucfirst($raporTipi),
        };
        return sprintf(
            "Merhaba %s 📊\n\n" .
            "Sizin için *%s Raporu* hazırlandı.\n\n" .
            "🔗 Raporu görüntülemek için:\n%s\n\n" .
            "_EmlakRadar Pro_",
            $musteri['ad_soyad'] ?? 'Değerli Müşterimiz',
            $tipAd,
            $raporUrl
        );
    }

    /* ─────────────────────────────────────────────────────────────────
     * ŞABLON: Görev / Randevu Hatırlatması
     * ───────────────────────────────────────────────────────────────── */
    public function gorevHatirlatmaMesaji(string $musteriAdi, array $gorev): string {
        return sprintf(
            "Merhaba %s ⏰\n\n" .
            "Randevunuzu hatırlatmak istedik:\n\n" .
            "📋 %s\n" .
            "📅 %s\n" .
            "📍 %s\n\n" .
            "Görüşmek üzere! 🤝\n_EmlakRadar Pro_",
            $musteriAdi,
            $gorev['baslik'] ?? '',
            isset($gorev['tarih_saat']) ? date('d.m.Y H:i', strtotime($gorev['tarih_saat'])) : '-',
            $gorev['lokasyon'] ?? 'Ofisimiz'
        );
    }

    /* ─────────────────────────────────────────────────────────────────
     * Hem web link hem API durumunu döndür
     * ───────────────────────────────────────────────────────────────── */
    public function durum(): array {
        return [
            'api_modu'  => $this->apiModu,
            'web_link'  => true,
        ];
    }

    /* ─────────────────────────────────────────────────────────────────
     * ÖZEL: WhatsApp Business API isteği
     * ───────────────────────────────────────────────────────────────── */
    private function apiGonder(array $payload): array {
        $url = sprintf('%s/%s/messages', rtrim($this->apiUrl, '/'), $this->phoneId);
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
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpKod  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $hata     = curl_error($ch);
        curl_close($ch);

        if ($hata) return ['success' => false, 'message' => 'cURL hatası: ' . $hata];

        $data = json_decode($response, true) ?? [];
        if ($httpKod >= 200 && $httpKod < 300) {
            return ['success' => true, 'data' => $data];
        }
        return [
            'success' => false,
            'message' => $data['error']['message'] ?? 'WhatsApp API hatası (HTTP ' . $httpKod . ')',
            'http'    => $httpKod,
        ];
    }

    /* ─────────────────────────────────────────────────────────────────
     * Telefon numarası formatlama (Türkiye: +90)
     * ───────────────────────────────────────────────────────────────── */
    private function formatTelefon(string $tel): string {
        $tel = preg_replace('/\D/', '', $tel);
        // 0532... → 90532...
        if (strlen($tel) === 10 && $tel[0] === '0') {
            return '90' . substr($tel, 1);
        }
        // 532... → 90532...
        if (strlen($tel) === 10) {
            return '90' . $tel;
        }
        // Zaten 90 ile başlıyorsa
        if (strlen($tel) === 12 && substr($tel, 0, 2) === '90') {
            return $tel;
        }
        return $tel;
    }
}
