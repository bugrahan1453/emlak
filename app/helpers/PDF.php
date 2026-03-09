<?php
/**
 * EmlakRadar Pro — PDF Rapor Motoru
 * Composer/mPDF gerektirmeden profesyonel HTML+print CSS rapor üretir.
 * Sunucu tarafında .html dosyası kaydedilir; tarayıcıda Ctrl+P → PDF olarak kaydedilebilir.
 */

class PDF {

    private string $accentColor = '#0066CC';
    private string $ofisAd      = '';
    private string $ofisEmail   = '';
    private string $ofisTelefon = '';

    public function __construct() {
        $this->ofisAd      = defined('OFIS_AD')    ? OFIS_AD    : 'EmlakRadar Pro';
        $this->ofisEmail   = defined('OFIS_EMAIL') ? OFIS_EMAIL : '';
        $this->ofisTelefon = defined('OFIS_TEL')   ? OFIS_TEL   : '';
    }

    /* ═══════════════════════════════════════════════════════════════════
     * METOD 1: GERÇEKLİK TOKADI
     * Mal sahibine piyasa gerçeğini gösteren ikna belgesi
     * ═══════════════════════════════════════════════════════════════════ */
    public function gerceklikTokadi(int $ilanId): string {
        $db = db();

        $ilan = $db->prepare("
            SELECT i.*, k.ad_soyad AS danisman_adi, k.telefon AS danisman_tel, k.email AS danisman_email
            FROM ilanlar i LEFT JOIN kullanicilar k ON i.danisman_id = k.id
            WHERE i.id = ?
        ");
        $ilan->execute([$ilanId]);
        $ilan = $ilan->fetch();
        if (!$ilan) throw new RuntimeException("İlan bulunamadı: #{$ilanId}");

        // Bölge emsalleri — son 90 gün, aynı ilçe
        $emsalSt = $db->prepare("
            SELECT baslik, fiyat, metrekare, oda_sayisi, mahalle, updated_at
            FROM ilanlar
            WHERE ilce = ? AND durum IN ('satildi','aktif') AND id != ?
              AND created_at > DATE_SUB(NOW(), INTERVAL 90 DAY)
            ORDER BY updated_at DESC LIMIT 8
        ");
        $emsalSt->execute([$ilan['ilce'], $ilanId]);
        $emsaller = $emsalSt->fetchAll();

        // Rakip aktif ilanlar (±%30 m²)
        $m2 = (float)($ilan['metrekare'] ?? 100);
        $rakipSt = $db->prepare("
            SELECT baslik, fiyat, metrekare, oda_sayisi, mahalle
            FROM ilanlar WHERE ilce = ? AND durum = 'aktif' AND id != ?
              AND metrekare BETWEEN ? AND ?
            ORDER BY fiyat ASC LIMIT 6
        ");
        $rakipSt->execute([$ilan['ilce'], $ilanId, $m2 * 0.7, $m2 * 1.3]);
        $rakipler = $rakipSt->fetchAll();

        // AI değerleme
        $aiData = !empty($ilan['ai_degerleme'])
            ? (json_decode($ilan['ai_degerleme'], true) ?? [])
            : [];

        // Emsal istatistikler
        $fiyatlar    = array_column($emsaller, 'fiyat');
        $ortFiyat    = count($fiyatlar) > 0 ? array_sum($fiyatlar) / count($fiyatlar) : 0;
        $m2Listesi   = array_filter(array_map(fn($e) => ($e['metrekare'] ?? 0) > 0 ? ($e['fiyat'] / $e['metrekare']) : 0, $emsaller));
        $ortM2Fiyat  = count($m2Listesi) > 0 ? array_sum($m2Listesi) / count($m2Listesi) : 0;
        $onerilFiyat = $ortM2Fiyat > 0 ? round($ortM2Fiyat * $m2, -3) : 0;
        $fark        = ($ilan['fiyat'] ?? 0) - $onerilFiyat;
        $farkPct     = $onerilFiyat > 0 ? round(($fark / $onerilFiyat) * 100, 1) : 0;

        ob_start();
        echo $this->htmlBaslik('Gerçeklik Tokadı — ' . ($ilan['baslik'] ?? ''));
        ?>
<body onload="setTimeout(()=>window.print(),800)">
<div class="page">

  <!-- KAPAK -->
  <div class="cover">
    <div class="cover-logo"><div class="logo-icon">📡</div><div class="logo-text">EmlakRadar Pro</div></div>
    <h1 class="cover-title">Piyasa Gerçeklik Raporu</h1>
    <p class="cover-subtitle">«Gerçeklik Tokadı» — Emsal Bazlı Değerleme Belgesi</p>
    <div class="cover-meta">
      <div>📍 <?= h(($ilan['mahalle']??'').', '.($ilan['ilce']??'').' / '.($ilan['sehir']??'')) ?></div>
      <div>📅 İlan tarihi: <?= date('d F Y', strtotime($ilan['created_at']??'now')) ?></div>
      <div>🖨️ Rapor tarihi: <?= date('d.m.Y H:i') ?></div>
    </div>
  </div>

  <!-- KPI -->
  <div class="section">
    <h2 class="section-title">📊 Bölüm 1 — Fiyat Karşılaştırması</h2>
    <div class="kpi-grid">
      <div class="kpi <?= $fark>0?'red':'green' ?>"><div class="kpi-label">İstenen Fiyat</div><div class="kpi-value"><?= n($ilan['fiyat']??0) ?> ₺</div></div>
      <div class="kpi blue"><div class="kpi-label">Piyasa Ortalaması</div><div class="kpi-value"><?= n($ortFiyat) ?> ₺</div></div>
      <div class="kpi green"><div class="kpi-label">Önerilen Fiyat</div><div class="kpi-value"><?= $onerilFiyat>0 ? n($onerilFiyat).' ₺' : 'Veri yok' ?></div></div>
      <div class="kpi <?= $fark>0?'red':'green' ?>"><div class="kpi-label">Fark</div><div class="kpi-value"><?= ($fark>0?'+':'').n($fark) ?> ₺</div><div class="kpi-sub">%<?= abs($farkPct) ?> <?= $fark>0?'pahalı':'uygun' ?></div></div>
    </div>
  </div>

  <!-- İLAN BİLGİLERİ -->
  <div class="section">
    <h2 class="section-title">🏠 Bölüm 2 — İlan Bilgileri</h2>
    <table class="info-table">
      <tr><th>Başlık</th><td colspan="3"><?= h($ilan['baslik']??'') ?></td></tr>
      <tr><th>Metrekare</th><td><?= h($ilan['metrekare']??'-') ?> m²</td><th>Oda Sayısı</th><td><?= h($ilan['oda_sayisi']??'-') ?></td></tr>
      <tr><th>Kat</th><td><?= h($ilan['kat']??'-') ?></td><th>Bina Yaşı</th><td><?= h($ilan['bina_yasi']??'-') ?> yıl</td></tr>
      <tr><th>Isıtma</th><td><?= h($ilan['isitma']??'-') ?></td><th>Balkon</th><td><?= !empty($ilan['balkon'])?'Var':'Yok' ?></td></tr>
      <tr><th>İlçe / Mahalle</th><td><?= h(($ilan['ilce']??'').' / '.($ilan['mahalle']??'')) ?></td><th>m² Birim Fiyatı</th><td><?= $m2>0 ? n(($ilan['fiyat']??0)/$m2).' ₺/m²' : '-' ?></td></tr>
      <tr><th>Açıklama</th><td colspan="3" class="text-small"><?= nl2br(h(mb_substr($ilan['aciklama']??'',0,500))) ?></td></tr>
    </table>
  </div>

  <!-- EMSAL -->
  <div class="section">
    <h2 class="section-title">📋 Bölüm 3 — Bölge Emsal Verileri (Son 90 Gün)</h2>
    <?php if (!empty($emsaller)): ?>
    <table class="data-table">
      <thead><tr><th>Başlık</th><th>m²</th><th>Oda</th><th>Fiyat</th><th>m² Fiyatı</th><th>Mahalle</th></tr></thead>
      <tbody><?php foreach($emsaller as $i=>$e): ?><tr class="<?= $i%2?'zebra':'' ?>">
        <td><?= h(mb_substr($e['baslik']??'',0,40)) ?></td><td><?= h($e['metrekare']??'-') ?></td>
        <td><?= h($e['oda_sayisi']??'-') ?></td><td class="price"><?= n($e['fiyat']??0) ?> ₺</td>
        <td><?= ($e['metrekare']??0)>0 ? n(($e['fiyat']??0)/$e['metrekare']).' ₺' : '-' ?></td>
        <td><?= h($e['mahalle']??'-') ?></td>
      </tr><?php endforeach; ?></tbody>
      <tfoot><tr><th colspan="3">Bölge Ortalaması</th><th class="price"><?= n($ortFiyat) ?> ₺</th><th><?= n($ortM2Fiyat) ?> ₺/m²</th><th></th></tr></tfoot>
    </table>
    <?php else: ?><p class="empty">Bu bölgede son 90 günde emsal veri bulunamadı.</p><?php endif; ?>
  </div>

  <!-- RAKİP İLANLAR -->
  <div class="section">
    <h2 class="section-title">🔍 Bölüm 4 — Şu An Satıştaki Rakip İlanlar</h2>
    <?php if (!empty($rakipler)): ?>
    <table class="data-table">
      <thead><tr><th>Başlık</th><th>m²</th><th>Oda</th><th>Fiyat</th><th>m² Fiyatı</th></tr></thead>
      <tbody><?php foreach($rakipler as $i=>$r): ?><tr class="<?= $i%2?'zebra':'' ?>">
        <td><?= h(mb_substr($r['baslik']??'',0,45)) ?></td><td><?= h($r['metrekare']??'-') ?></td>
        <td><?= h($r['oda_sayisi']??'-') ?></td><td class="price"><?= n($r['fiyat']??0) ?> ₺</td>
        <td><?= ($r['metrekare']??0)>0 ? n(($r['fiyat']??0)/$r['metrekare']).' ₺' : '-' ?></td>
      </tr><?php endforeach; ?></tbody>
    </table>
    <?php else: ?><p class="empty">Benzer kriterlerde rakip ilan bulunamadı.</p><?php endif; ?>
  </div>

  <!-- FİYAT TREND -->
  <div class="section">
    <h2 class="section-title">📈 Bölüm 5 — Fiyat Trend Analizi</h2>
    <div class="trend-box">
      <p><strong><?= h($ilan['ilce']??'') ?></strong> ilçesinde <?= count($emsaller) ?> emsal işlem incelendiğinde bölge ortalama m² birim fiyatı <strong><?= n($ortM2Fiyat) ?> ₺/m²</strong> olarak hesaplanmıştır.</p>
      <p style="margin-top:10px">
        <?php if ($fark>10000): ?>Söz konusu mülk <?= n($fark) ?> ₺ (%<?= abs($farkPct) ?>) piyasa değerinin <strong style="color:#dc2626">üzerinde</strong> fiyatlandırılmıştır. Alıcı ilgisi azalmakta ve ortalama satış süresi uzamaktadır.
        <?php elseif ($fark<-10000): ?>Söz konusu mülk <?= n(abs($fark)) ?> ₺ (%<?= abs($farkPct) ?>) piyasa değerinin <strong style="color:#16a34a">altında</strong> fiyatlandırılmıştır. Rekabetçi fiyatlama hızlı satış imkânı sunmaktadır.
        <?php else: ?>Söz konusu mülk bölge piyasa değerleriyle <strong>uyumlu</strong> fiyatlandırılmıştır.<?php endif; ?>
      </p>
    </div>
  </div>

  <!-- AI -->
  <?php if (!empty($aiData)): ?>
  <div class="section">
    <h2 class="section-title">🤖 Bölüm 6 — AI Değerleme Sonucu</h2>
    <div class="ai-grid">
      <?php if (!empty($aiData['emsal_deger'])): $ed=$aiData['emsal_deger']; ?>
      <div class="ai-card"><div class="ai-card-title">AI Emsal Değer</div><div class="ai-card-value"><?= n($ed['tahmini_deger']??0) ?> ₺</div><div class="ai-card-sub">Güven: <?= n($ed['guven_alt']??0) ?> – <?= n($ed['guven_ust']??0) ?> ₺</div></div>
      <?php endif; ?>
      <?php if (!empty($aiData['fotograf_analiz'])): $fa=$aiData['fotograf_analiz']; ?>
      <div class="ai-card"><div class="ai-card-title">Fotoğraf Kalitesi</div><div class="ai-card-value"><?= $fa['genel_kalite']??0 ?>/10</div><div class="ai-card-sub">Tadilat: <?= h($fa['tadilat_durumu']??'-') ?></div></div>
      <?php endif; ?>
      <?php if (!empty($aiData['satici_psikoloji'])): $sp=$aiData['satici_psikoloji']; ?>
      <div class="ai-card"><div class="ai-card-title">Satıcı Motivasyonu</div><div class="ai-card-value"><?= $sp['pazarlik_motivasyonu']??0 ?>/10</div><div class="ai-card-sub">Aciliyet: <?= h($sp['aciliyet_seviyesi']??'-') ?></div></div>
      <?php endif; ?>
      <div class="ai-card"><div class="ai-card-title">Bölge m² Ort.</div><div class="ai-card-value"><?= n($ortM2Fiyat) ?> ₺</div><div class="ai-card-sub">Emsal bazlı</div></div>
    </div>
    <?php if (!empty($aiData['satici_psikoloji']['ipuclari'])): ?>
    <div class="ai-tips"><strong>Pazarlık İpuçları:</strong><ul><?php foreach($aiData['satici_psikoloji']['ipuclari'] as $ip): ?><li><?= h($ip) ?></li><?php endforeach; ?></ul></div>
    <?php endif; ?>
  </div>
  <?php endif; ?>

  <!-- SONUÇ -->
  <div class="section conclusion">
    <h2 class="section-title">✅ Sonuç ve Önerilen Fiyat</h2>
    <div class="conclusion-price"><?= $onerilFiyat>0 ? n($onerilFiyat).' ₺' : 'Emsal verisi yetersiz' ?></div>
    <p class="conclusion-text">
      <?php if ($onerilFiyat>0 && $fark>5000): ?>Bu ilan bölge emsallerinin <strong>%<?= abs($farkPct) ?> üzerinde</strong> fiyatlandırılmıştır. <strong><?= n($onerilFiyat) ?> ₺</strong> seviyesine çekilmesi önerilmektedir. Bölgede m² başına <?= n($ortM2Fiyat) ?> ₺ civarında işlem gerçekleşmektedir.
      <?php elseif ($onerilFiyat>0 && $fark<-5000): ?>Bu ilan bölge emsallerinin <strong>%<?= abs($farkPct) ?> altında</strong> fiyatlandırılmıştır. Rekabetçi fiyatlama hızlı satış imkânı sunmaktadır.
      <?php else: ?>Bu ilan bölge piyasasıyla uyumlu fiyatlandırılmıştır.<?php endif; ?>
    </p>
  </div>

  <div class="pdf-footer">
    <div><strong><?= h($this->ofisAd) ?></strong></div>
    <div>Danışman: <?= h($ilan['danisman_adi']??'-') ?> | Tel: <?= h($ilan['danisman_tel']??'') ?></div>
    <div><?= h($this->ofisEmail) ?> | Rapor tarihi: <?= date('d.m.Y H:i') ?></div>
    <div class="footer-disclaimer">Bu rapor bilgilendirme amaçlıdır; hukuki bağlayıcılığı yoktur.</div>
  </div>
</div></body></html>
<?php
        return ob_get_clean();
    }

    /* ═══════════════════════════════════════════════════════════════════
     * METOD 2: ROI RAPORU
     * ═══════════════════════════════════════════════════════════════════ */
    public function roiRaporu(int $ilanId, float $kiraFiyati): string {
        $db = db();
        $ilan = $db->prepare("SELECT i.*, k.ad_soyad AS danisman_adi FROM ilanlar i LEFT JOIN kullanicilar k ON i.danisman_id=k.id WHERE i.id=?");
        $ilan->execute([$ilanId]);
        $ilan = $ilan->fetch();
        if (!$ilan) throw new RuntimeException("İlan bulunamadı: #{$ilanId}");

        $satisFiyati = (float)($ilan['fiyat'] ?? 0);
        $aylikKira   = $kiraFiyati;
        $yillikKira  = $aylikKira * 12;

        $aidat          = min($aylikKira * 0.05, 1500);
        $bosLukOrani    = 0.08;
        $vergiOrani     = 0.15;
        $bakim          = $satisFiyati * 0.005;

        $brutKiraVerimi = $satisFiyati > 0 ? ($yillikKira / $satisFiyati) * 100 : 0;
        $netYillikKira  = ($yillikKira * (1 - $bosLukOrani)) - ($aidat * 12) - ($yillikKira * $vergiOrani) - $bakim;
        $netKiraVerimi  = $satisFiyati > 0 ? ($netYillikKira / $satisFiyati) * 100 : 0;
        $amortisman     = $netYillikKira > 0 ? ceil($satisFiyati / $netYillikKira) : 0;

        $yatirimSkoru = 5;
        if ($brutKiraVerimi >= 8) $yatirimSkoru += 3;
        elseif ($brutKiraVerimi >= 5) $yatirimSkoru += 1;
        if ($amortisman <= 15) $yatirimSkoru += 1;
        if ($netKiraVerimi >= 4) $yatirimSkoru += 1;
        $yatirimSkoru = min(10, max(1, $yatirimSkoru));

        $projeksiyon = [];
        $k = $aylikKira;
        for ($y = 1; $y <= 5; $y++) {
            $k *= 1.15;
            $bg = $k * 12;
            $ng = ($bg * (1 - $bosLukOrani)) - ($aidat * 12) - ($bg * $vergiOrani) - $bakim;
            $projeksiyon[] = ['yil'=>$y,'aylik'=>round($k),'brut'=>round($bg),'net'=>round($ng),'verim'=>$satisFiyati>0?round(($ng/$satisFiyati)*100,2):0];
        }

        ob_start();
        echo $this->htmlBaslik('ROI Raporu — ' . ($ilan['baslik'] ?? ''));
        ?>
<body onload="setTimeout(()=>window.print(),800)">
<div class="page">
  <div class="cover">
    <div class="cover-logo"><div class="logo-icon">💹</div><div class="logo-text">EmlakRadar Pro</div></div>
    <h1 class="cover-title">Yatırım Getiri Analizi (ROI)</h1>
    <p class="cover-subtitle">Kira Verimi · Amortisman Hesabı · 5 Yıllık Projeksiyon</p>
    <div class="cover-meta">
      <div>🏠 <?= h($ilan['baslik']??'') ?></div>
      <div>📍 <?= h(($ilan['mahalle']??'').', '.($ilan['ilce']??'')) ?></div>
      <div>🖨️ Rapor tarihi: <?= date('d.m.Y H:i') ?></div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">📊 Temel Göstergeler</h2>
    <div class="kpi-grid">
      <div class="kpi blue"><div class="kpi-label">Satış Fiyatı</div><div class="kpi-value"><?= n($satisFiyati) ?> ₺</div></div>
      <div class="kpi green"><div class="kpi-label">Aylık Kira</div><div class="kpi-value"><?= n($aylikKira) ?> ₺</div></div>
      <div class="kpi <?= $brutKiraVerimi>=5?'green':'red' ?>"><div class="kpi-label">Brüt Kira Verimi</div><div class="kpi-value">%<?= number_format($brutKiraVerimi,2) ?></div></div>
      <div class="kpi <?= $netKiraVerimi>=3?'green':'red' ?>"><div class="kpi-label">Net Kira Verimi</div><div class="kpi-value">%<?= number_format($netKiraVerimi,2) ?></div></div>
      <div class="kpi <?= $amortisman<=20?'green':'red' ?>"><div class="kpi-label">Amortisman Süresi</div><div class="kpi-value"><?= $amortisman ?> yıl</div></div>
      <div class="kpi <?= $yatirimSkoru>=7?'green':($yatirimSkoru>=5?'blue':'red') ?>"><div class="kpi-label">Yatırım Skoru</div><div class="kpi-value"><?= $yatirimSkoru ?>/10</div></div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">🧮 Net Kira Hesabı (Yıllık)</h2>
    <table class="info-table">
      <tr><th>Brüt Yıllık Kira</th><td class="price"><?= n($yillikKira) ?> ₺</td></tr>
      <tr><th>Boşluk Oranı (%<?= $bosLukOrani*100 ?>)</th><td class="red-text">− <?= n($yillikKira*$bosLukOrani) ?> ₺</td></tr>
      <tr><th>Aidat &amp; Giderler (yıllık)</th><td class="red-text">− <?= n($aidat*12) ?> ₺</td></tr>
      <tr><th>Gelir Vergisi (%<?= $vergiOrani*100 ?>)</th><td class="red-text">− <?= n($yillikKira*$vergiOrani) ?> ₺</td></tr>
      <tr><th>Bakım / Onarım</th><td class="red-text">− <?= n($bakim) ?> ₺</td></tr>
      <tr class="total-row"><th>Net Yıllık Kira Geliri</th><td class="price"><?= n($netYillikKira) ?> ₺</td></tr>
    </table>
  </div>

  <div class="section">
    <h2 class="section-title">📈 5 Yıllık Kira Projeksiyonu (%15 yıllık artış varsayımı)</h2>
    <table class="data-table">
      <thead><tr><th>Yıl</th><th>Aylık Kira</th><th>Brüt Yıllık</th><th>Net Yıllık</th><th>Net Verim</th></tr></thead>
      <tbody><?php foreach($projeksiyon as $i=>$p): ?><tr class="<?= $i%2?'zebra':'' ?>">
        <td><strong><?= $p['yil'] ?>. Yıl</strong></td>
        <td class="price"><?= n($p['aylik']) ?> ₺</td>
        <td class="price"><?= n($p['brut']) ?> ₺</td>
        <td class="price"><?= n($p['net']) ?> ₺</td>
        <td class="<?= $p['verim']>=4?'green-text':'' ?>">%<?= $p['verim'] ?></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </div>

  <div class="section conclusion">
    <h2 class="section-title">✅ Yatırım Değerlendirmesi</h2>
    <div class="conclusion-price"><?= $yatirimSkoru ?>/10 — <?= $yatirimSkoru>=8?'Çok İyi Yatırım':($yatirimSkoru>=6?'İyi Yatırım':($yatirimSkoru>=4?'Orta Düzey':'Dikkatli Değerlendirin')) ?></div>
    <p class="conclusion-text">
      Brüt kira verimi %<?= number_format($brutKiraVerimi,1) ?>, net kira verimi %<?= number_format($netKiraVerimi,1) ?> olarak hesaplanmıştır.
      Yatırım <?= $amortisman ?> yılda amorti olacaktır.
      <?php if($yatirimSkoru>=7): ?>Bölge değer artış potansiyeli göz önüne alındığında bu mülk cazip bir yatırım fırsatı sunmaktadır.
      <?php elseif($yatirimSkoru>=5): ?>Orta vadeli değer artışı beklentisiyle değerlendirilebilir bir fırsattır.
      <?php else: ?>Kira getirisi görece düşük olmakla birlikte uzun vadeli değer artışı potansiyeli incelenmelidir.<?php endif; ?>
    </p>
  </div>

  <div class="pdf-footer">
    <div><?= h($this->ofisAd) ?> | Danışman: <?= h($ilan['danisman_adi']??'-') ?></div>
    <div>Rapor tarihi: <?= date('d.m.Y H:i') ?> | Tüm hesaplamalar tahmini değerlerdir.</div>
  </div>
</div></body></html>
<?php
        return ob_get_clean();
    }

    /* ═══════════════════════════════════════════════════════════════════
     * METOD 3: PORTFÖY RAPORU
     * ═══════════════════════════════════════════════════════════════════ */
    public function portfoyRaporu(int $ofisId, array $filtreler = []): string {
        $db = db();
        $tarihBas = $filtreler['tarih_bas'] ?? date('Y-m-01');
        $tarihBit = $filtreler['tarih_bit'] ?? date('Y-m-d');
        $bolge    = $filtreler['bolge'] ?? '';
        $whereX   = $bolge ? 'AND ilce = ?' : '';
        $p1       = array_merge([$ofisId, $tarihBas, $tarihBit.' 23:59:59'], $bolge ? [$bolge] : []);

        $istSt = $db->prepare("SELECT COUNT(*) toplam,SUM(durum='aktif') aktif,SUM(durum='satildi') satildi,SUM(durum='kiralik') kiralik,AVG(fiyat) ort_fiyat,SUM(fiyat) toplam_deger FROM ilanlar WHERE ofis_id=? AND created_at BETWEEN ? AND ? $whereX");
        $istSt->execute($p1);
        $ist = $istSt->fetch();

        $bgSt = $db->prepare("SELECT ilce,COUNT(*) sayi,AVG(fiyat) ort_fiyat FROM ilanlar WHERE ofis_id=? AND created_at BETWEEN ? AND ? $whereX GROUP BY ilce ORDER BY sayi DESC LIMIT 10");
        $bgSt->execute($p1);
        $bolgeler = $bgSt->fetchAll();

        $dSt = $db->prepare("SELECT k.ad_soyad,COUNT(i.id) ilan_sayisi,SUM(i.durum='satildi') satis,AVG(i.fiyat) ort_fiyat FROM kullanicilar k LEFT JOIN ilanlar i ON i.danisman_id=k.id AND i.created_at BETWEEN ? AND ? WHERE k.ofis_id=? AND k.aktif=1 AND k.rol IN('danisman','broker') GROUP BY k.id ORDER BY ilan_sayisi DESC");
        $dSt->execute([$tarihBas,$tarihBit.' 23:59:59',$ofisId]);
        $danismanlar = $dSt->fetchAll();

        $sonSt = $db->prepare("SELECT i.baslik,i.fiyat,i.metrekare,i.ilce,i.durum,i.created_at,k.ad_soyad FROM ilanlar i LEFT JOIN kullanicilar k ON i.danisman_id=k.id WHERE i.ofis_id=? AND i.created_at BETWEEN ? AND ? ORDER BY i.created_at DESC LIMIT 15");
        $sonSt->execute([$ofisId,$tarihBas,$tarihBit.' 23:59:59']);
        $sonIlanlar = $sonSt->fetchAll();

        ob_start();
        echo $this->htmlBaslik('Portföy Raporu');
        ?>
<body onload="setTimeout(()=>window.print(),800)">
<div class="page">
  <div class="cover">
    <div class="cover-logo"><div class="logo-icon">🏠</div><div class="logo-text">EmlakRadar Pro</div></div>
    <h1 class="cover-title">Portföy Özet Raporu</h1>
    <p class="cover-subtitle"><?= date('d.m.Y',strtotime($tarihBas)) ?> – <?= date('d.m.Y',strtotime($tarihBit)) ?></p>
    <div class="cover-meta">
      <div>Toplam İlan: <?= number_format($ist['toplam']??0) ?></div>
      <div>Toplam Portföy Değeri: <?= n($ist['toplam_deger']??0) ?> ₺</div>
      <div>Rapor tarihi: <?= date('d.m.Y H:i') ?></div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">📊 Durum Dağılımı</h2>
    <div class="kpi-grid">
      <div class="kpi blue"><div class="kpi-label">Toplam</div><div class="kpi-value"><?= $ist['toplam']??0 ?></div></div>
      <div class="kpi green"><div class="kpi-label">Aktif</div><div class="kpi-value"><?= $ist['aktif']??0 ?></div></div>
      <div class="kpi gray"><div class="kpi-label">Satıldı</div><div class="kpi-value"><?= $ist['satildi']??0 ?></div></div>
      <div class="kpi gray"><div class="kpi-label">Kiralandı</div><div class="kpi-value"><?= $ist['kiralik']??0 ?></div></div>
      <div class="kpi blue"><div class="kpi-label">Ort. Fiyat</div><div class="kpi-value"><?= n($ist['ort_fiyat']??0) ?> ₺</div></div>
      <div class="kpi green"><div class="kpi-label">Toplam Değer</div><div class="kpi-value"><?= number_format(($ist['toplam_deger']??0)/1000000,1) ?> M ₺</div></div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">📍 Bölge Dağılımı</h2>
    <table class="data-table">
      <thead><tr><th>İlçe</th><th>İlan</th><th>Ort. Fiyat</th><th>Pay</th></tr></thead>
      <tbody><?php foreach($bolgeler as $i=>$b): ?><tr class="<?= $i%2?'zebra':'' ?>">
        <td><?= h($b['ilce']??'') ?></td><td><?= $b['sayi'] ?></td>
        <td class="price"><?= n($b['ort_fiyat']??0) ?> ₺</td>
        <td>%<?= ($ist['toplam']??0)>0 ? round($b['sayi']/($ist['toplam']??1)*100,1):0 ?></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </div>

  <div class="section">
    <h2 class="section-title">👥 Danışman Aktivitesi</h2>
    <table class="data-table">
      <thead><tr><th>Danışman</th><th>İlan</th><th>Satış</th><th>Ort. Fiyat</th></tr></thead>
      <tbody><?php foreach($danismanlar as $i=>$d): ?><tr class="<?= $i%2?'zebra':'' ?>">
        <td><?= h($d['ad_soyad']??'') ?></td><td><?= $d['ilan_sayisi'] ?></td>
        <td><?= $d['satis']??0 ?></td><td class="price"><?= n($d['ort_fiyat']??0) ?> ₺</td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </div>

  <div class="section">
    <h2 class="section-title">📋 Son Eklenen İlanlar</h2>
    <table class="data-table">
      <thead><tr><th>Başlık</th><th>Fiyat</th><th>m²</th><th>İlçe</th><th>Danışman</th><th>Durum</th></tr></thead>
      <tbody><?php foreach($sonIlanlar as $i=>$il): ?><tr class="<?= $i%2?'zebra':'' ?>">
        <td><?= h(mb_substr($il['baslik']??'',0,35)) ?></td>
        <td class="price"><?= n($il['fiyat']??0) ?> ₺</td>
        <td><?= $il['metrekare']??'-' ?></td>
        <td><?= h($il['ilce']??'') ?></td>
        <td><?= h($il['ad_soyad']??'-') ?></td>
        <td><?= h(ucfirst($il['durum']??'')) ?></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </div>

  <div class="pdf-footer">
    <div><?= h($this->ofisAd) ?> | Portföy Raporu | <?= date('d.m.Y H:i') ?></div>
  </div>
</div></body></html>
<?php
        return ob_get_clean();
    }

    /* ─────────────────────────────────────────────────────────────────
     * Ortak HTML başlığı + CSS
     * ───────────────────────────────────────────────────────────────── */
    private function htmlBaslik(string $title): string {
        $ac = $this->accentColor;
        return '<!DOCTYPE html><html lang="tr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>' . htmlspecialchars($title) . '</title>
<style>
@import url(\'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap\');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,Arial,sans-serif;color:#1a202c;background:#fff;font-size:13px;line-height:1.5}
.page{max-width:900px;margin:0 auto;padding:30px}
.cover{background:linear-gradient(135deg,#0f1c3f 0%,#1a2d5a 100%);color:white;border-radius:12px;padding:40px;margin-bottom:24px;text-align:center}
.cover-logo{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:20px}
.logo-icon{font-size:32px}.logo-text{font-size:22px;font-weight:700;color:' . $ac . '}
.cover-title{font-size:26px;font-weight:700;color:white;margin-bottom:8px}
.cover-subtitle{font-size:14px;color:#94a3b8;margin-bottom:20px}
.cover-meta{font-size:12px;color:#cbd5e1;display:flex;flex-direction:column;gap:6px}
.section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:18px;page-break-inside:avoid}
.section-title{font-size:14px;font-weight:700;color:#1e293b;padding-bottom:10px;margin-bottom:14px;border-bottom:2px solid ' . $ac . '}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.kpi{background:white;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center}
.kpi.blue{border-top:3px solid ' . $ac . '}.kpi.green{border-top:3px solid #16a34a}
.kpi.red{border-top:3px solid #dc2626}.kpi.gray{border-top:3px solid #94a3b8}
.kpi-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.kpi-value{font-size:20px;font-weight:700;color:#1e293b}
.kpi-sub{font-size:11px;color:#64748b;margin-top:2px}
.kpi.red .kpi-value{color:#dc2626}.kpi.green .kpi-value{color:#16a34a}.kpi.blue .kpi-value{color:' . $ac . '}
.info-table{width:100%;border-collapse:collapse}
.info-table th{background:#f1f5f9;padding:8px 12px;text-align:left;font-weight:600;color:#475569;width:22%;font-size:12px}
.info-table td{padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b}
.data-table{width:100%;border-collapse:collapse;font-size:12px}
.data-table thead th{background:#1e293b;color:white;padding:8px 10px;text-align:left}
.data-table tbody td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
.data-table tfoot th{background:#e2e8f0;padding:8px 10px}
.zebra{background:#f8fafc}
.price{font-weight:600;color:' . $ac . '}.red-text{color:#dc2626}.green-text{color:#16a34a}
.total-row th,.total-row td{background:#e2e8f0!important;font-weight:700}
.text-small{font-size:12px;color:#475569}.empty{color:#94a3b8;font-style:italic;text-align:center;padding:16px 0}
.trend-box{background:white;border-left:4px solid ' . $ac . ';padding:14px 16px;border-radius:4px;font-size:13px;color:#475569;line-height:1.7}
.ai-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px}
.ai-card{background:white;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center}
.ai-card-title{font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px}
.ai-card-value{font-size:18px;font-weight:700;color:' . $ac . '}.ai-card-sub{font-size:10px;color:#94a3b8;margin-top:2px}
.ai-tips{background:white;border-left:3px solid ' . $ac . ';padding:10px 14px;border-radius:4px;margin-top:10px}
.ai-tips ul{margin:6px 0 0 16px}.ai-tips li{font-size:12px;color:#475569;margin-bottom:3px}
.conclusion{border-left:4px solid ' . $ac . ';text-align:center}
.conclusion-price{font-size:36px;font-weight:700;color:' . $ac . ';margin:14px 0}
.conclusion-text{font-size:13px;color:#475569;max-width:680px;margin:0 auto;line-height:1.6}
.pdf-footer{border-top:2px solid #e2e8f0;padding-top:14px;text-align:center;font-size:11px;color:#94a3b8}
.pdf-footer div{margin-bottom:3px}.footer-disclaimer{font-style:italic;margin-top:6px}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.section{page-break-inside:avoid}.page{padding:10px}@page{margin:15mm;size:A4}}
</style></head>';
    }

    /* ─────────────────────────────────────────────────────────────────
     * Yardımcılar
     * ───────────────────────────────────────────────────────────────── */
    public function kaydet(string $html, string $prefix): string {
        $dir = APP_ROOT . '/public_html/uploads/raporlar';
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        $dosyaAdi = $prefix . '_' . date('Ymd_His') . '_' . substr(md5(mt_rand()), 0, 6) . '.html';
        file_put_contents($dir . '/' . $dosyaAdi, $html);
        return $dosyaAdi;
    }
}

// Kısa yardımcı fonksiyonlar (global scope — sadece PDF context'inde kullanılır)
if (!function_exists('h')) {
    function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
}
if (!function_exists('n')) {
    function n(float $v): string { return number_format($v, 0, ',', '.'); }
}
