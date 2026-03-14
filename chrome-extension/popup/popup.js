'use strict';

const $ = id => document.getElementById(id);

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function setStatus(isRunning, lastError) {
  const badge = $('status-badge');
  if (isRunning) {
    badge.textContent = 'Tarıyor';
    badge.className   = 'badge running';
  } else if (lastError) {
    badge.textContent = 'Hata';
    badge.className   = 'badge error';
  } else {
    badge.textContent = 'Bekliyor';
    badge.className   = 'badge idle';
  }
}

function setLog(msg, type = '') {
  const el = $('log-text');
  el.textContent = msg || '—';
  el.className   = `log-text ${type}`;
}

function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'get_status' }, data => {
    if (chrome.runtime.lastError || !data) return;

    $('last-time').textContent  = formatTime(data.lastScrapeTime);
    $('last-count').textContent = data.lastScrapeCount != null ? String(data.lastScrapeCount) : '—';
    $('seen-count').textContent = data.seenCount != null ? String(data.seenCount) + ' ilan' : '—';
    $('err-short').textContent  = data.lastError ? data.lastError.slice(0, 40) : '—';

    setStatus(data.isRunning, data.lastError);

    // Progress log
    if (data.progress?.msg) {
      setLog(data.progress.msg, data.progress.type === 'done' ? 'done' : data.progress.type === 'error' ? 'error' : data.progress.type === 'ok' ? 'ok' : '');
    }

    // Hata banner
    const errArea = $('error-area');
    errArea.innerHTML = '';
    if (data.lastError) {
      const div = document.createElement('div');
      div.className   = 'error-banner';
      div.textContent = `Son hata: ${data.lastError}`;
      errArea.appendChild(div);
    }

    // Buton durumu
    const btn  = $('scrape-btn');
    const stop = $('stop-btn');
    if (data.isRunning) {
      btn.textContent  = '⏳ Tarıyor...';
      btn.className    = 'running';
      stop.style.display = 'block';
    } else {
      btn.textContent  = '▶ Şimdi Tara';
      btn.className    = '';
      stop.style.display = 'none';
    }
  });
}

// ─── Yüklenince ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Ayarları yükle
  chrome.storage.sync.get({ cities: 'canakkale', intervalMinutes: 10, gunAraligi: 0 }, cfg => {
    $('cities').value          = cfg.cities;
    $('intervalMinutes').value = cfg.intervalMinutes;
    $('gunAraligi').value      = cfg.gunAraligi;
  });

  refreshStatus();

  // Canlı progress için 1sn polling (popup açıkken)
  const poll = setInterval(refreshStatus, 1500);
  window.addEventListener('unload', () => clearInterval(poll));
});

// ─── Kaydet ───────────────────────────────────────────────────────────────────
$('save-btn').addEventListener('click', () => {
  const cfg = {
    cities:          $('cities').value.trim() || 'canakkale',
    intervalMinutes: parseInt($('intervalMinutes').value) || 10,
    gunAraligi:      parseInt($('gunAraligi').value) || 0,
    enabled:         true,
  };
  chrome.storage.sync.set(cfg, () => {
    setLog('Ayarlar kaydedildi', 'ok');
    setTimeout(() => setLog('Hazır'), 2000);
  });
});

// ─── Durdur ───────────────────────────────────────────────────────────────────
$('stop-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'stop_scrape' }, () => {
    setLog('Durdurma isteği gönderildi...', 'error');
  });
});

// ─── Önbelleği Temizle ────────────────────────────────────────────────────────
$('clear-btn').addEventListener('click', () => {
  if (!confirm('Tüm "görüldü" kayıtları silinecek. Bir sonraki taramada tüm ilanlar yeniden çekilir. Devam?')) return;
  chrome.storage.local.remove('seenIds', () => {
    setLog('Önbellek temizlendi — şimdi tara butonuna basın', 'ok');
  });
});

// ─── Şimdi Tara ───────────────────────────────────────────────────────────────
$('scrape-btn').addEventListener('click', () => {
  const btn = $('scrape-btn');
  btn.disabled    = true;
  btn.textContent = '⏳ Başlatılıyor...';
  btn.className   = 'running';

  // Ayarları önce kaydet
  const cfg = {
    cities:          $('cities').value.trim() || 'canakkale',
    intervalMinutes: parseInt($('intervalMinutes').value) || 10,
    enabled:         true,
  };

  chrome.storage.sync.set(cfg, () => {
    setLog('Tarama başlatıldı...', '');

    chrome.runtime.sendMessage({ type: 'manual_scrape' }, res => {
      if (chrome.runtime.lastError || !res?.ok) {
        const errMsg = res?.error || chrome.runtime.lastError?.message || 'bilinmiyor';
        setLog(`Hata: ${errMsg}`, 'error');
      }
      refreshStatus();
    });
  });
});
