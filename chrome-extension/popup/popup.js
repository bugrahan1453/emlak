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

function updateSiteStatus(data) {
  const area = $('site-status');
  if (!area) return;
  const sites = [
    { key: 'sahibinden', label: 'Sahibinden', sessionKey: 'sessionActive_sahibinden' },
    { key: 'hepsiemlak', label: 'Hepsiemlak' },
    { key: 'emlakjet',   label: 'Emlakjet' },
  ];
  area.innerHTML = sites.map(s => {
    let color = '#68d391'; let icon = '✅'; let suffix = '';
    if (s.sessionKey) {
      const active = data[s.sessionKey];
      if (active === false) { color = '#fc8181'; icon = '⚠️'; }
      else if (active === true) {
        color = '#68d391'; icon = '✅';
        // cf_clearance kalan süre
        if (data.sessionExpiry_sahibinden) {
          const kalanMs = data.sessionExpiry_sahibinden - Date.now();
          const kalanDk = Math.max(0, Math.floor(kalanMs / 60000));
          if (kalanMs > 0) {
            suffix = ` (${kalanDk}dk)`;
            if (kalanDk < 10) color = '#f6ad55'; // Sarı uyarı
          }
        }
      }
      else { color = '#718096'; icon = '❓'; }
    }
    return `<span style="font-size:10px;color:${color};background:#1e2535;padding:2px 8px;border-radius:10px;">${icon} ${s.label}${suffix}</span>`;
  }).join('');

  // Session banner
  const banner = $('session-banner');
  if (data.sessionActive_sahibinden === false && banner) {
    banner.style.display = 'block';
    banner.innerHTML = '⚠️ Sahibinden oturumu yok — <a href="#" id="refresh-session-link" style="color:#f6ad55;">Siteyi Aç</a>';
    document.getElementById('refresh-session-link')?.addEventListener('click', e => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'refresh_session' });
    });
  } else if (banner) {
    banner.style.display = 'none';
  }
}

function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'get_status' }, data => {
    if (chrome.runtime.lastError || !data) return;

    $('last-time').textContent  = formatTime(data.lastScrapeTime);
    $('last-count').textContent = data.lastScrapeCount != null ? String(data.lastScrapeCount) : '—';
    $('seen-count').textContent = data.seenCount != null ? String(data.seenCount) + ' ilan' : '—';
    $('captcha-stat').textContent = data.captchaCount > 0 ? String(data.captchaCount) : '—';
    // Hata alanı
    const errArea2 = $('err-short-area');
    if (errArea2) {
      if (data.lastError) { errArea2.textContent = data.lastError.slice(0, 80); errArea2.style.display = 'block'; }
      else errArea2.style.display = 'none';
    }

    setStatus(data.isRunning, data.lastError);
    updateSiteStatus(data);

    // Progress log
    if (data.progress?.msg) {
      setLog(data.progress.msg, data.progress.type === 'done' ? 'done' : data.progress.type === 'error' ? 'error' : data.progress.type === 'ok' ? 'ok' : '');
    }

    // Hata banner
    const errArea = $('error-area');
    errArea.innerHTML = '';
    if (data.lastError && !data.lastError.includes('oturum')) {
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
  chrome.storage.sync.get({
    cities: 'canakkale', intervalMinutes: 10, gunAraligi: 0,
    captchaSolver: 'capmonster', captchaApiKey: 'e74a9d8cc30974c3f226b86abaebc3d0',
  }, cfg => {
    $('cities').value          = cfg.cities;
    $('intervalMinutes').value = cfg.intervalMinutes;
    $('gunAraligi').value      = cfg.gunAraligi;
    $('captchaSolver').value   = cfg.captchaSolver || '';
    $('captchaApiKey').value   = cfg.captchaApiKey || '';
    toggleCaptchaTestRow();
  });

  refreshStatus();
  const poll = setInterval(refreshStatus, 1500);
  window.addEventListener('unload', () => clearInterval(poll));
});

function toggleCaptchaTestRow() {
  const row = $('captcha-test-row');
  if (row) row.style.display = $('captchaSolver').value ? 'flex' : 'none';
}
$('captchaSolver')?.addEventListener('change', toggleCaptchaTestRow);

// ─── CAPTCHA Key Test ─────────────────────────────────────────────────────────
$('captcha-test-btn')?.addEventListener('click', () => {
  const solver = $('captchaSolver').value;
  const key    = $('captchaApiKey').value.trim();
  const result = $('captcha-test-result');
  if (!key) { result.textContent = 'Key gerekli'; result.style.color = '#fc8181'; return; }
  result.textContent = 'Test ediliyor...'; result.style.color = '#a0aec0';
  chrome.runtime.sendMessage({ type: 'test_captcha_key', solver, key }, res => {
    if (res?.ok) {
      const bal = res.balance != null ? ` — $${parseFloat(res.balance).toFixed(3)}` : '';
      result.textContent = `✓ Geçerli${bal}`;
      result.style.color = '#68d391';
    } else {
      result.textContent = `✗ ${res?.error || 'Geçersiz key'}`;
      result.style.color = '#fc8181';
    }
  });
});

// ─── Kaydet ───────────────────────────────────────────────────────────────────
$('save-btn').addEventListener('click', () => {
  const cfg = {
    cities:          $('cities').value.trim() || 'canakkale',
    intervalMinutes: parseInt($('intervalMinutes').value) || 10,
    gunAraligi:      parseInt($('gunAraligi').value) || 0,
    enabled:         true,
    captchaSolver:   $('captchaSolver').value || '',
    captchaApiKey:   $('captchaApiKey').value.trim() || '',
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

// ─── Hata Kaydı ───────────────────────────────────────────────────────────────
$('errorlog-btn').addEventListener('click', () => {
  const area = $('errorlog-area');
  const list = $('errorlog-list');
  if (area.style.display !== 'none') { area.style.display = 'none'; return; }
  chrome.runtime.sendMessage({ type: 'get_error_log' }, res => {
    const log = res?.log || [];
    if (!log.length) { list.innerHTML = '<div style="color:#4a5568">Kayıt yok</div>'; }
    else {
      list.innerHTML = log.slice(0, 15).map(e =>
        `<div style="color:#a0aec0;margin-bottom:3px;border-bottom:1px solid #1e2535;padding-bottom:2px;">
          <span style="color:#4a5568">${new Date(e.zaman).toLocaleString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span>
          <span style="color:#fc8181;margin:0 4px">[${e.site}/${e.tip}]</span>
          <span>${e.mesaj}</span>
        </div>`
      ).join('');
    }
    area.style.display = 'block';
  });
});
