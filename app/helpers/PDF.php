<?php
/**
 * EmlakRadar Pro - PDF Rapor Üretici
 * mPDF kütüphanesi olmadan basit HTML→PDF
 * cPanel'de Composer yoksa bu helper HTML raporu buffer'lar,
 * mPDF kuruluysa onu kullanır; değilse tarayıcı print diyalogunu tetikler.
 */

class PDF {
    private string $title;
    private string $content;
    private bool   $mPDFAvailable = false;

    public function __construct(string $title = 'EmlakRadar Raporu') {
        $this->title = $title;
        // mPDF var mı kontrol et
        $this->mPDFAvailable = class_exists('Mpdf\Mpdf') || file_exists(APP_ROOT . '/vendor/mpdf/mpdf/src/Mpdf.php');
    }

    /**
     * Gerçeklik Tokadı PDF raporu üret
     */
    public function gerceklikTokadi(array $ilan, array $emsaller, array $degerleme): string {
        $fiyat = number_format($ilan['fiyat'] ?? 0, 0, ',', '.');
        $piyasaDegeri = number_format($degerleme['pazar_degeri'] ?? 0, 0, ',', '.');
        $fark = ($ilan['fiyat'] ?? 0) - ($degerleme['pazar_degeri'] ?? 0);
        $farkYuzde = ($degerleme['pazar_degeri'] ?? 0) > 0
            ? round($fark / $degerleme['pazar_degeri'] * 100, 1)
            : 0;

        ob_start(); ?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title><?= e($this->title) ?></title>
<style>
  body { font-family: Arial, sans-serif; color: #1a202c; margin: 0; padding: 20px; }
  .header { background: #0f172a; color: white; padding: 24px; border-radius: 8px; margin-bottom: 20px; }
  .header h1 { margin: 0; font-size: 22px; color: #00d4ff; }
  .header p { margin: 4px 0 0; color: #94a3b8; font-size: 13px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 20px; }
  .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
  .kpi-card .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .kpi-card .value { font-size: 22px; font-weight: 700; color: #1e293b; margin-top: 4px; }
  .kpi-card.red .value { color: #dc2626; }
  .kpi-card.green .value { color: #16a34a; }
  .section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .section h2 { margin: 0 0 12px; font-size: 14px; color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #e2e8f0; padding: 6px 10px; text-align: left; }
  td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
  .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 20px; }
  .badge-red { background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 20px; font-size: 11px; }
  .badge-green { background: #dcfce7; color: #16a34a; padding: 2px 8px; border-radius: 20px; font-size: 11px; }
</style>
</head>
<body>
<div class="header">
  <h1>📊 Gerçeklik Tokadı Raporu</h1>
  <p><?= e($ilan['baslik'] ?? '') ?> | <?= date('d.m.Y H:i') ?></p>
</div>

<div class="kpi-grid">
  <div class="kpi-card <?= $fark > 0 ? 'red' : 'green' ?>">
    <div class="label">İlan Fiyatı</div>
    <div class="value"><?= $fiyat ?> ₺</div>
  </div>
  <div class="kpi-card">
    <div class="label">Piyasa Değeri</div>
    <div class="value"><?= $piyasaDegeri ?> ₺</div>
  </div>
  <div class="kpi-card <?= $fark > 0 ? 'red' : 'green' ?>">
    <div class="label">Fark</div>
    <div class="value"><?= ($fark > 0 ? '+' : '') . number_format($fark, 0, ',', '.') ?> ₺ (%<?= abs($farkYuzde) ?>)</div>
  </div>
</div>

<div class="section">
  <h2>İlan Bilgileri</h2>
  <table>
    <tr><th>Başlık</th><td><?= e($ilan['baslik'] ?? '') ?></td><th>Fiyat</th><td><?= $fiyat ?> ₺</td></tr>
    <tr><th>Konum</th><td><?= e(($ilan['ilce'] ?? '') . ' / ' . ($ilan['mahalle'] ?? '')) ?></td><th>m²</th><td><?= e($ilan['metrekare'] ?? '-') ?></td></tr>
    <tr><th>Oda</th><td><?= e($ilan['oda_sayisi'] ?? '-') ?></td><th>Kat</th><td><?= e($ilan['kat'] ?? '-') ?></td></tr>
    <tr><th>Bina Yaşı</th><td><?= e($ilan['bina_yasi'] ?? '-') ?></td><th>Kaynak</th><td><?= e($ilan['kaynak_site'] ?? 'Manuel') ?></td></tr>
  </table>
</div>

<?php if (!empty($emsaller)): ?>
<div class="section">
  <h2>Bölge Emsalleri (Son 90 Gün)</h2>
  <table>
    <thead><tr><th>Mahalle</th><th>m²</th><th>Oda</th><th>Fiyat</th><th>m² Fiyatı</th></tr></thead>
    <tbody>
    <?php foreach ($emsaller as $e): ?>
    <tr>
      <td><?= e($e['mahalle'] ?? '') ?></td>
      <td><?= e($e['metrekare'] ?? '') ?></td>
      <td><?= e($e['oda_sayisi'] ?? '') ?></td>
      <td><?= number_format($e['fiyat'] ?? 0, 0, ',', '.') ?> ₺</td>
      <td><?= ($e['metrekare'] ?? 0) > 0 ? number_format(($e['fiyat'] ?? 0) / $e['metrekare'], 0, ',', '.') . ' ₺' : '-' ?></td>
    </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
</div>
<?php endif; ?>

<?php if (!empty($degerleme)): ?>
<div class="section">
  <h2>AI Değerleme Sonucu</h2>
  <p><strong>Pazarlık Skoru:</strong> <?= e($degerleme['pazarlik_skoru'] ?? '-') ?>/100</p>
  <p><strong>Değerleme Notu:</strong> <?= e($degerleme['degerleme_notu'] ?? '') ?></p>
  <p><strong>Tavsiye:</strong> <?= e($degerleme['tavsiye'] ?? '') ?></p>
  <p><strong>Fırsat Seviyesi:</strong>
    <span class="badge-<?= ($degerleme['firsat_seviyesi'] ?? '') === 'yuksek' ? 'green' : 'red' ?>">
      <?= strtoupper($degerleme['firsat_seviyesi'] ?? '') ?>
    </span>
  </p>
</div>
<?php endif; ?>

<div class="footer">
  EmlakRadar Pro — <?= date('d.m.Y H:i') ?> tarihinde üretilmiştir. Bu rapor bilgilendirme amaçlıdır.
</div>
</body>
</html>
<?php
        return ob_get_clean();
    }

    /**
     * Performans raporu HTML üret
     */
    public function performansRaporu(array $danismanlar, string $donem = 'Bu Ay'): string {
        ob_start(); ?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Performans Raporu</title>
<style>
  body { font-family: Arial, sans-serif; color: #1a202c; margin: 0; padding: 20px; }
  .header { background: #0f172a; color: white; padding: 24px; border-radius: 8px; margin-bottom: 20px; }
  .header h1 { margin: 0; font-size: 22px; color: #00d4ff; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 16px; }
  th { background: #1e293b; color: white; padding: 10px 12px; text-align: left; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
  tr:hover td { background: #f8fafc; }
  .rank-1 { color: #f59e0b; font-weight: bold; }
  .rank-2 { color: #94a3b8; font-weight: bold; }
  .rank-3 { color: #b45309; font-weight: bold; }
  .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 20px; }
</style>
</head>
<body>
<div class="header">
  <h1>📈 Performans Raporu — <?= e($donem) ?></h1>
  <p><?= date('d.m.Y H:i') ?> tarihinde üretilmiştir</p>
</div>

<table>
  <thead>
    <tr><th>#</th><th>Danışman</th><th>Arama</th><th>Randevu</th><th>Gösterim</th><th>Portföy</th><th>Eşleştirme</th><th>Efor Skoru</th></tr>
  </thead>
  <tbody>
  <?php foreach ($danismanlar as $i => $d): ?>
    <tr>
      <td class="rank-<?= $i+1 ?>"><?= $i+1 ?></td>
      <td><?= e($d['ad_soyad'] ?? '') ?></td>
      <td><?= e($d['arama_sayisi'] ?? 0) ?></td>
      <td><?= e($d['randevu_sayisi'] ?? 0) ?></td>
      <td><?= e($d['gosterim_sayisi'] ?? 0) ?></td>
      <td><?= e($d['portfoy_ekleme'] ?? 0) ?></td>
      <td><?= e($d['eslestirme_sayisi'] ?? 0) ?></td>
      <td><strong><?= number_format($d['efor_skoru'] ?? 0, 1) ?></strong></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>

<div class="footer">
  EmlakRadar Pro — <?= date('d.m.Y H:i') ?>
</div>
</body>
</html>
<?php
        return ob_get_clean();
    }

    /**
     * HTML içeriği dosyaya kaydet
     */
    public function saveHtml(string $html, string $filename): string {
        $dir  = UPLOAD_REPORTS;
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        $path = $dir . '/' . $filename . '_' . date('Ymd_His') . '.html';
        file_put_contents($path, $html);
        return $path;
    }
}
