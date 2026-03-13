'use strict';

const $ = id => document.getElementById(id);

function showMsg(text, type = 'ok') {
  const el = $('message');
  el.textContent = text;
  el.className   = `message ${type}`;
  if (type === 'ok') setTimeout(() => { el.textContent = ''; el.className = 'message'; }, 3000);
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

// ─── Yüklenince: ayarları ve durumu oku ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Kayıtlı ayarları doldur
  chrome.storage.sync.get({
    apiUrl: '', webhookSecret: '', cities: 'canakkale',
    intervalMinutes: 10, maxPages: 3, enabled: false,
  }, cfg => {
    $('apiUrl').value          = cfg.apiUrl;
    $('webhookSecret').value   = cfg.webhookSecret;
    $('cities').value          = cfg.cities;
    $('intervalMinutes').value = cfg.intervalMinutes;
    $('maxPages').value        = cfg.maxPages;
    $('enabled').checked       = cfg.enabled;
    updateBadge(cfg.enabled);
  });

  // Son tarama durumu
  chrome.runtime.sendMessage({ type: 'get_status' }, data => {
    if (chrome.runtime.lastError) return;
    $('last-time').textContent  = formatTime(data.lastScrapeTime);
    $('last-count').textContent = data.lastScrapeCount != null ? `${data.lastScrapeCount}` : '—';

    if (data.lastError) {
      const errEl = document.createElement('div');
      errEl.className   = 'error-box';
      errEl.textContent = `Son hata: ${data.lastError}`;
      document.querySelector('.message').before(errEl);
    }
  });
});

// ─── Badge güncelle ───────────────────────────────────────────────────────────
function updateBadge(enabled) {
  const badge = $('status-badge');
  badge.textContent = enabled ? 'Aktif' : 'Kapalı';
  badge.className   = `badge ${enabled ? 'active' : 'inactive'}`;
}

$('enabled').addEventListener('change', () => updateBadge($('enabled').checked));

// ─── Kaydet ───────────────────────────────────────────────────────────────────
$('save-btn').addEventListener('click', () => {
  const cfg = {
    apiUrl:          $('apiUrl').value.trim(),
    webhookSecret:   $('webhookSecret').value.trim(),
    cities:          $('cities').value.trim() || 'canakkale',
    intervalMinutes: parseInt($('intervalMinutes').value) || 10,
    maxPages:        parseInt($('maxPages').value) || 3,
    enabled:         $('enabled').checked,
  };

  if (cfg.enabled && !cfg.apiUrl)        { showMsg('API URL gerekli!', 'error'); return; }
  if (cfg.enabled && !cfg.webhookSecret) { showMsg('Webhook Secret gerekli!', 'error'); return; }

  chrome.storage.sync.set(cfg, () => {
    if (chrome.runtime.lastError) {
      showMsg(`Kayıt hatası: ${chrome.runtime.lastError.message}`, 'error');
    } else {
      showMsg('✓ Ayarlar kaydedildi', 'ok');
      updateBadge(cfg.enabled);
    }
  });
});

// ─── Manuel Tara ──────────────────────────────────────────────────────────────
$('scrape-btn').addEventListener('click', () => {
  const apiUrl        = $('apiUrl').value.trim();
  const webhookSecret = $('webhookSecret').value.trim();

  if (!apiUrl)        { showMsg('Önce API URL gir ve Kaydet!', 'error'); return; }
  if (!webhookSecret) { showMsg('Önce Webhook Secret gir ve Kaydet!', 'error'); return; }

  // Önce ayarları kaydet, sonra tara
  const cfg = {
    apiUrl,
    webhookSecret,
    cities:          $('cities').value.trim() || 'canakkale',
    intervalMinutes: parseInt($('intervalMinutes').value) || 10,
    maxPages:        parseInt($('maxPages').value) || 3,
    enabled:         $('enabled').checked,
  };

  const btn = $('scrape-btn');
  btn.disabled    = true;
  btn.textContent = '⏳ Tarıyor...';

  chrome.storage.sync.set(cfg, () => {
    showMsg('Tarama başlatıldı — arka planda sekmeler açılacak', 'info');

    chrome.runtime.sendMessage({ type: 'manual_scrape' }, res => {
      btn.disabled    = false;
      btn.textContent = '▶ Şimdi Tara';

      if (chrome.runtime.lastError || !res?.ok) {
        showMsg(`Hata: ${res?.error || chrome.runtime.lastError?.message || 'bilinmiyor'}`, 'error');
      } else {
        chrome.runtime.sendMessage({ type: 'get_status' }, data => {
          if (chrome.runtime.lastError) return;
          $('last-time').textContent  = formatTime(data.lastScrapeTime);
          $('last-count').textContent = data.lastScrapeCount != null ? `${data.lastScrapeCount}` : '—';
        });
        showMsg('✓ Tarama tamamlandı', 'ok');
      }
    });
  });
});
