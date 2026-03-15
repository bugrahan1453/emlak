'use strict';
/**
 * EmlakRadar Chrome Extension — Background Service Worker
 * Tek sekme mimarisi + detay sayfası scraper + canlı log
 */

// ─── Sabit Yapılandırma (hardcoded) ──────────────────────────────────────────
const API_URL        = 'https://hetagayrimenkul.com/api/webhook.php';
const WEBHOOK_SECRET = 'HetagScraper2024!xK9mPqR7wZn';
const DEFAULT_CITIES = 'canakkale';
const MAX_PAGES      = 5;

const CAPTCHA_APIS = {
  capmonster: { create: 'https://api.capmonster.cloud/createTask', result: 'https://api.capmonster.cloud/getTaskResult' },
  capsolver:  { create: 'https://api.capsolver.com/createTask',    result: 'https://api.capsolver.com/getTaskResult'    },
  '2captcha': { create: 'https://api.2captcha.com/createTask',     result: 'https://api.2captcha.com/getTaskResult'     },
};

// ─── HMAC-SHA256 ──────────────────────────────────────────────────────────────
async function signPayload(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return 'sha256=' + Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Kullanıcı Ayarları ───────────────────────────────────────────────────────
function getConfig() {
  return new Promise(resolve => {
    chrome.storage.sync.get({
      cities:          DEFAULT_CITIES,
      intervalMinutes: 10,
      enabled:         true,
      gunAraligi:      1,
      captchaSolver:   'capmonster',
      captchaApiKey:   'e74a9d8cc30974c3f226b86abaebc3d0',
    }, resolve);
  });
}

// ─── Canlı Log → Popup'a gönder ───────────────────────────────────────────────
function sendProgress(msg, type = 'info') {
  chrome.storage.local.set({ progress: { msg, type, ts: Date.now() } });
}

// ─── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Gaussian dağılım — insan davranışına daha yakın (uniform yerine)
function gaussianDelay(min, max) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  let n = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  n = Math.max(0, Math.min(1, n / 6 + 0.5));
  return Math.floor(min + n * (max - min));
}

// ─── Fare Simülasyonu (executeScript / MAIN world) ───────────────────────────
// Not: chrome.debugger kullanmıyoruz — debugger attach banner'ı sahibinden
// tarafından yan etkilerle tespit edilir (debugger; statement tetikleme,
// timer precision değişimi). Bunun yerine executeScript ile synthetic event.
async function simulateMouse(tabId, durationMs = 3000) {
  const endTs = Date.now() + durationMs;
  let cx = 300 + Math.floor(Math.random() * 700);
  let cy = 200 + Math.floor(Math.random() * 350);

  while (Date.now() < endTs) {
    const tx = 80  + Math.floor(Math.random() * 1100);
    const ty = 60  + Math.floor(Math.random() * 560);

    // Kübik Bezier ile adım adım ilerleme
    const steps = 10 + Math.floor(Math.random() * 10);
    for (let i = 1; i <= steps && Date.now() < endTs; i++) {
      const t = i / steps;
      const mt = 1 - t;
      // Basit quadratic (control point ortası)
      const mx = mt*mt*cx + 2*mt*t*((cx+tx)/2 + (Math.random()-0.5)*60) + t*t*tx;
      const my = mt*mt*cy + 2*mt*t*((cy+ty)/2 + (Math.random()-0.5)*40) + t*t*ty;

      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (x, y) => {
          document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true, cancelable: true,
            clientX: x, clientY: y, screenX: x + 96, screenY: y + 140,
            movementX: x - (window.__emlakPrevX || x), movementY: y - (window.__emlakPrevY || y),
          }));
          window.__emlakPrevX = x; window.__emlakPrevY = y;
        },
        args: [Math.round(mx), Math.round(my)],
      }).catch(() => {});

      const ease = 0.4 + Math.sin(t * Math.PI) * 0.7;
      await sleep(Math.round((8 + Math.random() * 20) / ease));
    }

    // Duraklama: %30 ihtimalle uzun (okuma simülasyonu)
    if (Math.random() < 0.3) await sleep(600 + Math.random() * 1600);
    else                      await sleep(40  + Math.random() * 160);

    cx = tx; cy = ty;
  }
}

// Service worker uyanık tut — 25sn'de bir ping (Chrome resmi yöntemi)
function waitUntil(promise) {
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 25000);
  return promise.finally(() => clearInterval(keepAlive));
}

// ─── Alarm Yeniden Oluşturma (Tarayıcı Restart Sonrası) ───────────────────────
async function ensureAlarms() {
  const scrape = await chrome.alarms.get('scrape');
  if (!scrape) {
    const delay = 10 + Math.floor(Math.random() * 15);
    chrome.alarms.create('scrape', { delayInMinutes: delay });
  }
}
ensureAlarms();

// ─── Stealth Content Script Kaydı (document_start + MAIN world) ───────────────
async function registerStealthScript() {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: ['emlakradar-stealth'] });
    if (existing.length === 0) {
      await chrome.scripting.registerContentScripts([{
        id:      'emlakradar-stealth',
        matches: [
          'https://www.sahibinden.com/*',
          'https://secure.sahibinden.com/*',
          'https://*.sahibinden.com/*',
          'https://www.hepsiemlak.com/*',
          'https://www.emlakjet.com/*',
        ],
        js:      ['stealth.js'],
        runAt:   'document_start',
        world:   'MAIN',
      }]);
      console.log('[EmlakRadar] Stealth script kayıt edildi (document_start + MAIN)');
    }
  } catch (e) {
    console.warn('[EmlakRadar] Stealth script kayıt hatası:', e.message);
  }
}
registerStealthScript();

// ─── Rastgele Gecikmeli Tek Seferlik Alarm Planlama ───────────────────────────
async function scheduleNextScrape() {
  const cfg = await getConfig();
  const base   = cfg.intervalMinutes || 10;
  const jitter = Math.floor(Math.random() * 6) - 2; // -2 ile +3 arası
  const delay  = Math.max(1, base + jitter);
  await chrome.alarms.clearAll();
  chrome.alarms.create('scrape', { delayInMinutes: delay });
  // Oturum kontrol alarmı (2 dakikada bir cf_clearance kontrolü)
  const sessionAlarm = await chrome.alarms.get('session_check');
  if (!sessionAlarm) chrome.alarms.create('session_check', { periodInMinutes: 2 });
}

// ─── Alarm Kurulumu ───────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[EmlakRadar] Extension yüklendi');

  if (details.reason === 'install') {
    await chrome.storage.sync.set({ cities: DEFAULT_CITIES, intervalMinutes: 10, enabled: true });
    chrome.alarms.create('scrape', { delayInMinutes: 2 });
    chrome.alarms.create('session_check', { periodInMinutes: 2 });
    setTimeout(() => runAllScrapers(true), 2 * 60 * 1000);
  } else {
    await scheduleNextScrape();
  }
});

chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.intervalMinutes) {
    await scheduleNextScrape();
  }
});

// ─── Sahibinden cf_clearance Cookie İzleme ─────────────────────────────────────
chrome.cookies.onChanged.addListener((changeInfo) => {
  const { cookie, removed } = changeInfo;
  if (!cookie.domain.includes('sahibinden.com')) return;

  if (cookie.name === 'cf_clearance') {
    if (removed) {
      chrome.storage.local.set({
        sessionActive_sahibinden: false,
        lastError: 'Sahibinden oturumu sona erdi — tarayıcıda siteye giriş yapın',
      });
      chrome.notifications.create('session_sahibinden', {
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: 'EmlakRadar — Sahibinden Oturumu Bitti',
        message: 'cf_clearance sona erdi. Taramaya devam için sahibinden.com\'u ziyaret edin.',
        priority: 2,
      });
      sendProgress('⚠️ Sahibinden cf_clearance sona erdi — siteyi ziyaret edin', 'error');
    } else {
      const expiry = cookie.expirationDate ? cookie.expirationDate * 1000 : null;
      chrome.storage.local.set({
        sessionActive_sahibinden: true,
        sessionExpiry_sahibinden: expiry,
        lastError: '',
      });
      sendProgress('✓ Sahibinden oturumu aktif (cf_clearance alındı)', 'ok');
    }
  }

  if (!removed && (cookie.name === 'vid' || cookie.name === 'st' || cookie.name === 'MS1')) {
    chrome.storage.local.set({ loginActive_sahibinden: true, sessionActive_sahibinden: true, lastError: '' });
  }
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'scrape') await runAllScrapers();
  if (alarm.name === 'session_check') {
    // cf_clearance kalan süresi < 5 dakika ise bildirim gönder
    const cfCookie = await chrome.cookies.get({ url: 'https://www.sahibinden.com', name: 'cf_clearance' }).catch(() => null);
    if (cfCookie?.expirationDate) {
      const kalanMs = cfCookie.expirationDate * 1000 - Date.now();
      if (kalanMs > 0 && kalanMs < 5 * 60 * 1000) {
        chrome.notifications.create('session_warn_' + Date.now(), {
          type: 'basic', iconUrl: 'icons/icon48.png',
          title: 'EmlakRadar — Oturum Bitmek Üzere',
          message: `Sahibinden oturumu ${Math.ceil(kalanMs/60000)} dakika içinde sona erer. Siteyi ziyaret edin.`,
          priority: 1,
        });
        sendProgress(`⚠️ Sahibinden oturumu ${Math.ceil(kalanMs/60000)}dk içinde bitiyor — siteyi ziyaret edin`, 'error');
      }
    }
  }
});

// ─── Popup Mesajları ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'manual_scrape') {
    runAllScrapers(true)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.type === 'stop_scrape') {
    shouldStop = true;
    sendProgress('Durdurma isteği alındı...', 'error');
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'get_status') {
    chrome.storage.local.get([
      'lastScrapeTime', 'lastScrapeCount', 'lastError', 'progress', 'isRunning', 'seenIds',
      'sessionActive_sahibinden', 'sessionExpiry_sahibinden', 'captchaCount', 'errorLog',
    ], data => {
      sendResponse({
        ...data,
        seenCount: (data.seenIds || []).length,
        errorLogCount: (data.errorLog || []).length,
        captchaCount: data.captchaCount || 0,
      });
    });
    return true;
  }
  if (msg.type === 'save_config') {
    chrome.storage.sync.set(msg.cfg).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'get_error_log') {
    chrome.storage.local.get(['errorLog'], data => sendResponse({ log: data.errorLog || [] }));
    return true;
  }
  if (msg.type === 'test_captcha_key') {
    const { solver, key } = msg;
    const balanceUrls = {
      capmonster: 'https://api.capmonster.cloud/getBalance',
      capsolver:  'https://api.capsolver.com/getBalance',
      '2captcha': 'https://api.2captcha.com/getBalance',
    };
    const url = balanceUrls[solver];
    if (!url) { sendResponse({ ok: false, error: 'Bilinmeyen servis' }); return true; }
    fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: key }),
    }).then(r => r.json()).then(d => {
      const ok = d.errorId === 0 && d.balance != null;
      sendResponse({ ok, balance: d.balance, error: d.errorDescription || null });
    }).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'refresh_session') {
    chrome.tabs.create({ url: 'https://www.sahibinden.com', active: true });
    sendResponse({ ok: true });
    return true;
  }
});

// ─── Sahibinden Oturum Kontrolü ───────────────────────────────────────────────
async function checkSessionBeforeScrape() {
  const cfCookie = await chrome.cookies.get({ url: 'https://www.sahibinden.com', name: 'cf_clearance' }).catch(() => null);
  if (!cfCookie) {
    // cf_clearance yoksa giriş çerezlerini kontrol et (Cloudflare challenge göstermeden geçince olur)
    const loginCookies = await Promise.all([
      chrome.cookies.get({ url: 'https://www.sahibinden.com', name: 'vid' }).catch(() => null),
      chrome.cookies.get({ url: 'https://www.sahibinden.com', name: 'st' }).catch(() => null),
      chrome.cookies.get({ url: 'https://www.sahibinden.com', name: 'MS1' }).catch(() => null),
    ]);
    const hasLogin = loginCookies.some(Boolean);
    if (!hasLogin) {
      sendProgress('⚠️ Sahibinden oturumu yok — siteye giriş yapın', 'error');
      await chrome.storage.local.set({ sessionActive_sahibinden: false });
      return false;
    }
    await chrome.storage.local.set({ sessionActive_sahibinden: true, lastError: '' });
    return true; // cf_clearance yoksa ama login cookie'ler varsa oturum geçerli
  }
  if (cfCookie.expirationDate && (cfCookie.expirationDate * 1000 - Date.now()) < 5 * 60 * 1000) {
    sendProgress('⚠️ Sahibinden oturumu bitmek üzere — siteyi tekrar ziyaret edin', 'error');
    return false;
  }
  return true;
}

// ─── Bot Bloğu Kontrol (basit — recursive olmayan) ────────────────────────────
async function checkBotBlockSimple(tabId) {
  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const txt = (document.body?.innerText || '').toLowerCase();
        const url = location.href;
        return txt.includes('olağan dışı') || url.includes('olagan-disi') ||
               txt.includes('tarayıcınızı kontrol') || txt.includes('checking your browser') ||
               txt.includes('just a moment') || txt.includes('access denied') ||
               document.title.toLowerCase().includes('erişim engellendi');
      },
    });
    return r?.[0]?.result === true;
  } catch (_) { return false; }
}

// ─── Bot Bloğu Kontrol (tam — CAPTCHA çözme dener) ────────────────────────────
async function checkBotBlock(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const txt   = (document.body?.innerText || '').toLowerCase();
        const title = (document.title || '').toLowerCase();
        const url   = location.href.toLowerCase();
        return {
          blocked:   txt.includes('olağan dışı erişim') || txt.includes('olağan dışı') ||
                     url.includes('olagan-disi') || title.includes('erişim engellendi') ||
                     title.includes('access denied'),
          challenge: txt.includes('tarayıcınızı kontrol ediyoruz') ||
                     txt.includes('checking your browser') || txt.includes('just a moment') ||
                     txt.includes('devam et butonuna') || txt.includes('verify you are human') ||
                     document.querySelector('iframe[src*="challenges.cloudflare.com"]') !== null ||
                     document.querySelector('[class*="cf-turnstile"]') !== null,
          login:     url.includes('/login') || url.includes('/giris') || url.includes('signin') ||
                     (txt.includes('giriş yap') && txt.includes('şifre') &&
                      document.querySelector('input[type="password"]') !== null),
        };
      },
    });
    const st = results?.[0]?.result;
    if (!st) return false;

    if (st.login) {
      sendProgress('⚠️ Giriş sayfası — tarayıcıda sahibinden.com\'a giriş yapın', 'error');
      await chrome.storage.local.set({ lastError: 'Sahibinden giriş gerekli — tarayıcıda oturum açın' });
      return true;
    }

    if (st.challenge) {
      sendProgress('Challenge sayfası tespit edildi — CAPTCHA çözücü deneniyor...', 'info');
      const cfg = await getConfig();
      if (cfg.captchaSolver && cfg.captchaApiKey) {
        const solved = await trySolveCaptcha(tabId, cfg);
        if (solved) { sendProgress('✓ CAPTCHA çözüldü, devam ediliyor', 'ok'); return false; }
      }
      // Cloudflare JS challenge otomatik geçer — 3 deneme, artan bekleme süresiyle
      const retryWaits = [8000, 12000, 15000];
      for (let i = 0; i < retryWaits.length; i++) {
        sendProgress(`Challenge bekleniyor (${i + 1}/3)...`, 'info');
        await sleep(retryWaits[i] + Math.random() * 3000);
        const halaVarMi = await checkBotBlockSimple(tabId);
        if (!halaVarMi) { sendProgress('✓ Challenge otomatik geçildi', 'ok'); return false; }
      }

      sendProgress('⚠️ Challenge geçilemedi — kullanıcı müdahalesi gerekli', 'error');
      chrome.notifications.create('challenge_failed_' + Date.now(), {
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: 'EmlakRadar — Challenge Geçilemedi',
        message: 'Sahibinden challenge sayfasını geçemedik. Tarayıcıda siteyi ziyaret edin.',
        priority: 2,
      });
      return true;
    }

    return st.blocked === true;
  } catch (_) { return false; }
}

// ─── CAPTCHA Tespiti (6 yöntem) ───────────────────────────────────────────────
async function detectCaptcha(tabId) {
  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const out = { hasCaptcha: false, type: null, sitekey: null, pageUrl: location.href };

        // ── Turnstile tespiti ─────────────────────────────────────────────────
        const turnstile = document.querySelector(
          'iframe[src*="challenges.cloudflare.com"], [class*="cf-turnstile"], #cf-turnstile-response, [data-turnstile-sitekey]'
        );
        if (turnstile) {
          out.hasCaptcha = true; out.type = 'turnstile';

          // Yöntem 1: data-sitekey attribute
          const w = document.querySelector('[data-sitekey], [data-turnstile-sitekey]');
          if (w) out.sitekey = w.getAttribute('data-sitekey') || w.getAttribute('data-turnstile-sitekey');

          // Yöntem 2: Sayfa HTML'inde regex
          if (!out.sitekey) {
            const m = document.documentElement.innerHTML.match(/sitekey['":\s]+['"]([0-9a-zA-Z_\-\.]{10,})['"]/);
            if (m) out.sitekey = m[1];
          }

          // Yöntem 3: Script tag içerikleri
          if (!out.sitekey) {
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const s of scripts) {
              const m = (s.textContent || '').match(/sitekey['":\s]+['"]([0-9a-zA-Z_\-\.]{10,})['"]/);
              if (m) { out.sitekey = m[1]; break; }
            }
          }

          // Yöntem 4: Cloudflare iframe src parametresi
          if (!out.sitekey) {
            const iframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
            if (iframe?.src) {
              try {
                const u = new URL(iframe.src);
                out.sitekey = u.searchParams.get('k') || u.searchParams.get('sitekey') || null;
              } catch (_) {}
            }
          }

          // Yöntem 5: turnstile.render() çağrısı
          if (!out.sitekey) {
            const allText = Array.from(document.querySelectorAll('script')).map(s => s.textContent).join('');
            const m = allText.match(/turnstile\.render\s*\(\s*\{[^}]*sitekey['":\s]+['"]([^'"]+)['"]/);
            if (m) out.sitekey = m[1];
          }

          return out;
        }

        // ── CF Challenge (Turnstile değil) ────────────────────────────────────
        const txt = (document.body?.innerText || '').toLowerCase();
        if (txt.includes('tarayıcınızı kontrol') || txt.includes('checking your browser') || txt.includes('just a moment')) {
          out.hasCaptcha = true; out.type = 'cf_challenge';
          // Yöntem 6: Sitekey olmadan gönderilecek — AntiCloudflareTask
          return out;
        }

        // ── reCAPTCHA v2 ──────────────────────────────────────────────────────
        const re = document.querySelector('iframe[src*="google.com/recaptcha"], .g-recaptcha, #g-recaptcha-response');
        if (re) {
          out.hasCaptcha = true; out.type = 'recaptcha_v2';
          const w2 = document.querySelector('.g-recaptcha[data-sitekey]');
          if (w2) out.sitekey = w2.getAttribute('data-sitekey');
          return out;
        }

        return out;
      },
    });
    return r?.[0]?.result || { hasCaptcha: false };
  } catch (_) { return { hasCaptcha: false }; }
}

// ─── CAPTCHA Çözme API (gelişmiş hata yönetimi) ───────────────────────────────
async function solveCaptchaViaAPI(captchaInfo, cfg) {
  const { type, sitekey, pageUrl } = captchaInfo;
  const api = CAPTCHA_APIS[cfg.captchaSolver];
  if (!api) return null;

  // Görev tipini CAPTCHA türüne göre seç
  let taskData;
  if (type === 'turnstile' && sitekey) {
    taskData = { type: 'TurnstileTaskProxyless', websiteURL: pageUrl, websiteKey: sitekey };
  } else if (type === 'turnstile') {
    // Sitekey bulunamadı — AntiCloudflare ile dene
    if (cfg.captchaSolver === 'capmonster') {
      taskData = { type: 'AntiCloudflareTask', websiteURL: pageUrl, metadata: { type: 'turnstile' } };
    } else {
      taskData = { type: 'AntiCloudflareTask', websiteURL: pageUrl, cloudflareTaskType: 'turnstile' };
    }
  } else if (type === 'recaptcha_v2') {
    taskData = { type: 'RecaptchaV2TaskProxyless', websiteURL: pageUrl, websiteKey: sitekey };
  } else if (type === 'cf_challenge') {
    taskData = { type: 'AntiCloudflareTask', websiteURL: pageUrl, metadata: { type: 'challenge' } };
  } else return null;

  try {
    let createRes, created;
    for (let attempt = 0; attempt < 3; attempt++) {
      createRes = await fetch(api.create, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: cfg.captchaApiKey, task: taskData }),
      });
      created = await createRes.json();
      if (created.errorDescription?.includes('SLOT')) {
        await sleep(10000); continue; // Slot yok — bekle tekrar dene
      }
      break;
    }
    if (!created) return null;
    if (created.errorId) {
      const desc = created.errorDescription || '';
      if (desc.includes('BALANCE') || desc.includes('balance')) {
        sendProgress('⚠️ CAPTCHA bakiyesi bitti! API hesabını kontrol edin.', 'error');
        chrome.notifications.create('captcha_balance_' + Date.now(), {
          type: 'basic', iconUrl: 'icons/icon48.png',
          title: 'EmlakRadar — CAPTCHA Bakiyesi Bitti',
          message: `${cfg.captchaSolver} hesabınızdaki bakiye tükendi. Bakiye yükleyin.`,
          priority: 2,
        });
      }
      console.warn('[EmlakRadar] CAPTCHA task hatası:', desc);
      return null;
    }
    const taskId = created.taskId;
    if (!taskId) return null;

    for (let i = 0; i < 24; i++) {
      await sleep(5000);
      sendProgress(`CAPTCHA çözülüyor... (${(i + 1) * 5}sn)`, 'info');
      const res = await fetch(api.result, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: cfg.captchaApiKey, taskId }),
      });
      const data = await res.json();
      if (data.status === 'ready') return data.solution;
      if (data.errorId) {
        const errDesc = data.errorDescription || '';
        if (errDesc.includes('UNSOLVABLE') || errDesc.includes('WRONG_KEY')) {
          console.warn('[EmlakRadar] CAPTCHA çözülemedi:', errDesc);
          return null;
        }
      }
    }
    return null;
  } catch (e) { console.error('[EmlakRadar] CAPTCHA API hatası:', e.message); return null; }
}

// ─── CAPTCHA Token Enjeksiyonu ────────────────────────────────────────────────
async function injectCaptchaSolution(tabId, type, solution) {
  return chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN',
    func: (t, sol) => {
      if (t === 'turnstile') {
        const f = document.querySelector('[name="cf-turnstile-response"], #cf-turnstile-response, input[name*="turnstile"]');
        if (f) f.value = sol.token;
        const w = document.querySelector('[data-callback]');
        if (w) { const cb = w.getAttribute('data-callback'); if (window[cb]) { window[cb](sol.token); return; } }
        const form = f?.closest('form');
        if (form) form.submit();
      } else if (t === 'recaptcha_v2') {
        const f = document.querySelector('#g-recaptcha-response');
        if (f) { f.value = sol.gRecaptchaResponse; f.style.display = 'block'; }
      } else if (t === 'cf_challenge') {
        location.reload();
      }
    },
    args: [type, solution],
  }).catch(() => {});
}

// ─── Tam CAPTCHA Çözme Akışı ──────────────────────────────────────────────────
async function trySolveCaptcha(tabId, cfg) {
  const info = await detectCaptcha(tabId);
  if (!info.hasCaptcha) return false;
  const sol = await solveCaptchaViaAPI(info, cfg);
  if (!sol) return false;
  await injectCaptchaSolution(tabId, info.type, sol);
  await sleep(5000 + Math.random() * 3000);

  // cf_clearance cookie kontrolü
  const cfCookie = await chrome.cookies.get({ url: info.pageUrl, name: 'cf_clearance' }).catch(() => null);
  if (cfCookie) {
    const captchaCount = ((await chrome.storage.local.get(['captchaCount'])).captchaCount || 0) + 1;
    await chrome.storage.local.set({ captchaCount });
    return true;
  }
  const captchaCount = ((await chrome.storage.local.get(['captchaCount'])).captchaCount || 0) + 1;
  await chrome.storage.local.set({ captchaCount });
  return !await checkBotBlockSimple(tabId);
}

// ─── Bildirimler ──────────────────────────────────────────────────────────────
async function notifyNewListings(site, count, city) {
  if (count <= 0) return;
  chrome.notifications.create('new_' + Date.now(), {
    type: 'basic', iconUrl: 'icons/icon48.png',
    title: `${count} Yeni İlan Bulundu!`,
    message: `${city} — ${site} üzerinde ${count} yeni ilan eklendi.`,
    priority: 1,
  });
}

// ─── Hata Kaydı (opsiyonel detay objesi ile) ──────────────────────────────────
async function logError(site, tip, mesaj, detay = null) {
  const { errorLog = [] } = await chrome.storage.local.get(['errorLog']);
  errorLog.unshift({ zaman: new Date().toISOString(), site, tip, mesaj, ...(detay ? { detay } : {}) });
  if (errorLog.length > 50) errorLog.length = 50;
  await chrome.storage.local.set({ errorLog });
}

// ─── Veri Kalite Kontrolü ─────────────────────────────────────────────────────
function validateListing(ilan) {
  if (!ilan.kaynak_id || !ilan.kaynak_url?.startsWith('http')) return null;
  if (!ilan.baslik || ilan.baslik.trim().length < 3) return null;
  if (isNaN(ilan.fiyat) || ilan.fiyat < 0) ilan.fiyat = null;
  return ilan;
}

// ─── Selector Sağlık Kontrolü ─────────────────────────────────────────────────
async function checkSelectorHealth(site, count) {
  const key = `selectorFail_${site}`;
  const { [key]: fails = 0 } = await chrome.storage.local.get([key]);
  if (count === 0) {
    const n = fails + 1;
    await chrome.storage.local.set({ [key]: n });
    if (n >= 3) {
      sendProgress(`⚠️ ${site} — ${n} ardışık boş tarama! Selector kırılmış olabilir.`, 'error');
      await logError(site, 'selector_fail', `${n} ardışık boş tarama`);
    }
  } else if (fails > 0) {
    await chrome.storage.local.set({ [key]: 0 });
  }
}

// ─── Ana Koordinatör ──────────────────────────────────────────────────────────
let isRunning  = false;
let shouldStop = false;

const SITE_ORDER = ['sahibinden', 'hepsiemlak', 'emlakjet'];

// SW restart sonrası yarım kalan run'ı temizle
(async function initScrapeState() {
  const { isRunning: storedRunning, scrapeTabId } = await chrome.storage.local.get(['isRunning', 'scrapeTabId']);
  if (storedRunning) {
    console.log('[EmlakRadar] SW yeniden başladı, yarım kalan run temizleniyor...');
    // Eski sekmeyi kapat
    if (scrapeTabId) {
      chrome.tabs.remove(scrapeTabId).catch(() => {});
    }
    await chrome.storage.local.set({ isRunning: false, scrapeTabId: null });
    sendProgress('SW yeniden başladı — önceki tarama durduruldu, alarm ile devam edilecek', 'error');
  }
})();

async function runAllScrapers(force = false) {
  if (isRunning && !force) { console.log('[EmlakRadar] Zaten çalışıyor, atlandı'); return; }
  if (isRunning && force)  { console.log('[EmlakRadar] Force, önceki tur sıfırlandı'); isRunning = false; }
  shouldStop = false;
  return waitUntil(_runAllScrapersInner(force));
}

async function _runAllScrapersInner(force = false) {
  const cfg = await getConfig();
  if (!force && !cfg.enabled) return;

  isRunning = true;
  await chrome.storage.local.set({ isRunning: true, lastError: '' });

  const cities     = cfg.cities.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
  const jobs       = await buildJobs(cities, MAX_PAGES);
  const gunAraligi = cfg.gunAraligi ?? 0;

  console.log(`[EmlakRadar] Başladı — ${cities.join(', ')}`);
  sendProgress(`Başlıyor... ${cities.join(', ')}`);

  const homeUrls = { sahibinden: 'https://www.sahibinden.com', hepsiemlak: 'https://www.hepsiemlak.com', emlakjet: 'https://www.emlakjet.com' };
  const firstSite = SITE_ORDER.find(s => jobs.some(j => j.site === s)) || SITE_ORDER[0];
  const tab   = await createTab(homeUrls[firstSite]);
  const tabId = tab.id;
  await chrome.storage.local.set({ scrapeTabId: tabId });
  await setRandomViewport(tabId);
  let toplamYeni = 0;

  try {
    let isFirstSiteTab = true;
    for (const site of SITE_ORDER) {
      if (shouldStop) break;
      const siteJobs = jobs.filter(j => j.site === site);
      if (!siteJobs.length) continue;
      const detailFn = getDetailFn(site);

      // Sahibinden için oturum kontrolü
      if (site === 'sahibinden') {
        let ok = false;
        try { ok = await checkSessionBeforeScrape(); } catch (e) { ok = true; }
        if (!ok) { sendProgress(`⚠️ Sahibinden atlandı — oturum yok`, 'error'); isFirstSiteTab = false; continue; }
      }

      // ── Referer zinciri: önce ana sayfa aç ────────────────────────────────
      sendProgress(`${site}: ana sayfa açılıyor (referer zinciri)...`);
      if (!isFirstSiteTab || site !== firstSite) {
        await navigateTab(tabId, homeUrls[site]);
      }
      isFirstSiteTab = false;
      await hideWebdriver(tabId);
      // Ana sayfada fare hareketi — gerçek kullanıcı gibi geziniyor
      await simulateMouse(tabId, gaussianDelay(2500, 4500));
      await sleep(gaussianDelay(1500, 3000));
      if (await checkBotBlock(tabId)) {
        sendProgress(`⚠️ ${site} ana sayfa bot bloğu — site atlanıyor`, 'error');
        await logError(site, 'bot_block_home', `Ana sayfa bot bloğu`, { url: homeUrls[site] });
        continue;
      }

    try {
        let siteBanned = false;
        for (const job of siteJobs) {
          if (shouldStop || siteBanned) break;
          let nextUrl = job.url;
          let page    = 0;

          // ── Kategori: sayfa sayfa ilerle ─────────────────────────────────
          while (nextUrl && page < (job.maxPages || MAX_PAGES) && !shouldStop && !siteBanned) {
            page++;
            sendProgress(`${site} · ${job.kategori} · sayfa ${page} — liste tarıyor...`);

            await navigateTab(tabId, nextUrl);
            await hideWebdriver(tabId);
            // Liste sayfasında fare hareketi + bekleme (Cloudflare challenge geçişi)
            await simulateMouse(tabId, gaussianDelay(3000, 5500));
            await sleep(gaussianDelay(1000, 2500));

            if (await checkBotBlock(tabId)) {
              const botMsg = `Bot bloğu/Cloudflare — sayfa atlandı: ${nextUrl}`;
              sendProgress(`⚠️ ${site} bot bloğu — site atlanıyor, diğer siteye geçiliyor`, 'error');
              await logError(site, 'bot_block_liste', botMsg, { url: nextUrl, sayfa: page });
              siteBanned = true; nextUrl = null; break;
            }

            // Liste sayfasındaki ilanlar
            const pageResult = await injectOnce(tabId, job);
            const rawIlanlar = (pageResult.ilanlar || []).map(validateListing).filter(Boolean);
            const ilanlar    = rawIlanlar;
            nextUrl          = pageResult.nextUrl || null;

            sendProgress(`${site} · ${job.kategori} · sayfa ${page}: ${ilanlar.length} ilan bulundu`);
            if (ilanlar.length === 0) {
              await logError(site, 'selector_0', `${job.kategori} sayfa ${page} — 0 ilan (selector eşleşmedi veya sayfa yüklenemedi)`);
            }

            await checkSelectorHealth(site, ilanlar.length);

            // Yeni + tarih filtresi
            let yeniler = await filterYeni(ilanlar);
            if (gunAraligi > 0) {
              yeniler = yeniler.filter(i => !i.ilan_tarihi || ilanGunFarki(i.ilan_tarihi) <= gunAraligi);
            }

            sendProgress(`${site} · sayfa ${page}: ${ilanlar.length} ilan, ${yeniler.length} yeni`);

            // ── Sunucuya sor: hangisi zaten var? Yokları için detaya gir ──
            if (yeniler.length > 0) {
              const mevcutIds = await checkServerIds(yeniler);
              if (mevcutIds.size > 0) {
                // Sunucuda zaten olanları seenIds'e ekle, listeden çıkar
                const serverMevcut = yeniler.filter(i => mevcutIds.has(i.kaynak_id));
                await markGoruldu(serverMevcut);
                yeniler = yeniler.filter(i => !mevcutIds.has(i.kaynak_id));
                if (serverMevcut.length > 0)
                  sendProgress(`${site}: ${serverMevcut.length} ilan sunucuda zaten mevcut, atlandı`);
              }
            }

            sendProgress(`${site} · sayfa ${page}: ${yeniler.length} gerçekten yeni ilan detaya girilecek`);

            // ── Her ilan için: detay sayfasına gir → siteye kaydet ─────────
            const listSayfasi = nextUrl || job.url; // detaylar arası dönülecek sayfa
            let detailCount = 0; // bu turda kaç detay açıldı

            for (let i = 0; i < yeniler.length; i++) {
              if (shouldStop || siteBanned) break;
              const ilan = yeniler[i];
              sendProgress(`${site} · ilan ${i + 1}/${yeniler.length}: ${ilan.baslik?.slice(0, 35)}...`);

              try {
                await navigateTab(tabId, ilan.kaynak_url);
                await hideWebdriver(tabId);
                // Detay sayfasında fare hareketi — gerçek okuma davranışı
                await simulateMouse(tabId, gaussianDelay(2500, 4500));
                await sleep(gaussianDelay(800, 2000));

                // 404 / süresi dolmuş ilan kontrolü — ban tetiklemez, atla
                const pageState = await chrome.scripting.executeScript({
                  target: { tabId },
                  func: () => {
                    const txt = document.body?.textContent || '';
                    const url = location.href;
                    if (txt.includes('bulunamıyor') || txt.includes('Bulunamıyor') ||
                        url.includes('404') || document.title.includes('404'))
                      return 'not_found';
                    if (txt.includes('Olağan dışı') || txt.includes('olagan-disi') ||
                        url.includes('olagan-disi'))
                      return 'bot_ban';
                    return 'ok';
                  },
                }).catch(() => [{ result: 'ok' }]);
                const durum = pageState?.[0]?.result || 'ok';

                if (durum === 'not_found') {
                  sendProgress(`${site}: ilan bulunamadı (silinmiş?), atlanıyor`);
                  await markGoruldu([ilan]); // tekrar deneme
                  continue;
                }
                if (durum === 'bot_ban') {
                  sendProgress(`⚠️ ${site} bot bloğu — site atlanıyor, diğer siteye geçiliyor`, 'error');
                  await logError(site, 'bot_block', `Detay sayfasında bot bloğu: ${ilan.kaynak_url}`);
                  siteBanned = true;
                  break;
                }

                const detail = await injectDetail(tabId, detailFn);
                const full   = {
                  ...ilan,
                  aciklama:    detail.aciklama    || '',
                  fotograflar: detail.fotograflar?.length ? detail.fotograflar : ilan.fotograflar,
                  oda_sayisi:  detail.oda_sayisi   || ilan.oda_sayisi,
                  metrekare:   detail.metrekare    || ilan.metrekare,
                  kat:         detail.kat          || ilan.kat,
                  bina_yasi:   detail.bina_yasi    || ilan.bina_yasi,
                  isitma:      detail.isitma       || ilan.isitma,
                  banyo:       detail.banyo        || ilan.banyo,
                  satici_ad:   detail.satici_ad    || ilan.satici_ad,
                  satici_tel:  detail.satici_tel   || ilan.satici_tel,
                  konum:       detail.konum        || ilan.konum,
                };

                const wh = await sendWebhook([full], cfg);
                detailCount++;
                if (wh.eklenen > 0) {
                  await markGoruldu([full]);
                  toplamYeni++;
                  sendProgress(`✓ ${site} · "${ilan.baslik?.slice(0, 30)}" → siteye eklendi`, 'ok');
                  await notifyNewListings(site, 1, ilan.sehir || job.city);
                } else if (wh.atilan > 0) {
                  await markGoruldu([full]); // sunucuda zaten var, bir daha denemeye gerek yok
                  sendProgress(`↩ ${site} · "${ilan.baslik?.slice(0, 30)}" → zaten mevcut`);
                } else {
                  // Webhook eklemed=0 ve atilan=0 → belirsiz — seenIds'e EKLEME, tekrar denensin
                  sendProgress(`⚠ ${site} · "${ilan.baslik?.slice(0, 30)}" → webhook yanıt belirsiz (tekrar denenecek)`, 'error');
                  await logError(site, 'webhook_no_confirm', `eklenen=0 atilan=0 — ${ilan.kaynak_url}`);
                }

              } catch (err) {
                console.warn('[EmlakRadar] Detay hatası:', err.message);
                sendProgress(`⚠ ${site} · webhook hatası: ${err.message.slice(0, 80)}`, 'error');
                await logError(site, 'webhook_error', `${ilan.kaynak_url} — ${err.message}`);
              }

              if (shouldStop || siteBanned) break;

              // ── Her 8 ilandan sonra mola — daha doğal davranış ──
              if (detailCount > 0 && detailCount % 8 === 0) {
                const molaSure = 120000 + Math.random() * 120000; // 2-4 dakika
                sendProgress(`${site}: ${detailCount} ilan çekildi — ${Math.round(molaSure/60000)}dk mola...`);
                const r = Math.random();
                if (r < 0.5) {
                  // %50: goBack ile mevcut sayfada kal, scroll yap
                  await goBackOrNavigate(tabId, listSayfasi);
                  await sleep(molaSure);
                } else if (r < 0.75) {
                  // %25: Kategori sayfasına git
                  await navigateTab(tabId, listSayfasi);
                  await sleep(molaSure);
                } else {
                  // %25: Kısa mola (arka planda bekle)
                  await sleep(molaSure / 2);
                }
              }

              // ── Detaylar arası: goBack ile listeye dön ──
              if (!shouldStop && !siteBanned && i < yeniler.length - 1) {
                const bekle = 90000 + Math.random() * 60000; // 1.5-2.5 dakika
                sendProgress(`${site}: listeye geri dönüyor (${Math.round(bekle/1000)}sn sonra devam)...`);
                await goBackOrNavigate(tabId, listSayfasi);
                await sleep(bekle);
              }
            }

            // Sayfalar arası bekleme
            if (nextUrl && !shouldStop) await sleep(20000 + Math.random() * 20000); // 20-40sn
          }

          // Kategoriler arası bekleme
          if (!shouldStop) await sleep(45000 + Math.random() * 45000); // 45-90sn
        }

      } catch (err) {
        console.error(`[EmlakRadar] Site hatası (${site}):`, err.message);
        await chrome.storage.local.set({ lastError: `${site}: ${err.message}` });
        sendProgress(`Hata: ${site} — ${err.message}`, 'error');
      }

      // Siteler arası bekleme
      if (!shouldStop) await sleep(180000 + Math.random() * 120000); // 3-5 dakika
    }

  } finally {
    chrome.tabs.remove(tabId).catch(() => {});
    isRunning = false;
    await chrome.storage.local.set({
      isRunning:       false,
      scrapeTabId:     null,
      lastScrapeTime:  new Date().toISOString(),
      lastScrapeCount: toplamYeni,
    });
    const msg = shouldStop ? `Durduruldu — ${toplamYeni} ilan eklendi` : `Tamamlandı — ${toplamYeni} ilan eklendi`;
    sendProgress(msg, 'done');
    console.log(`[EmlakRadar] ${msg}`);
    // Rastgele gecikmeli bir sonraki alarma planla
    await scheduleNextScrape();
  }
}

// ─── Job Listesi — Kategori Rotasyonu ────────────────────────────────────────
// Her çalıştırmada 1 kategori/site seçilir, tüm kategoriler sırayla döner.
// Session başına 3 kategori = daha doğal davranış (önceki 11 yerine).
const ALL_CATS = {
  sahibinden: [
    { slug: 'satilik-daire',       tip: 'satilik', kategori: 'daire'    },
    { slug: 'kiralik-daire',       tip: 'kiralik', kategori: 'daire'    },
    { slug: 'satilik-arsa',        tip: 'satilik', kategori: 'arsa'     },
    { slug: 'satilik-mustakil-ev', tip: 'satilik', kategori: 'mustakil' },
    { slug: 'satilik-villa',       tip: 'satilik', kategori: 'villa'    },
  ],
  hepsiemlak: [
    { slug: '{city}-satilik/daire', tip: 'satilik', kategori: 'daire' },
    { slug: '{city}-kiralik/daire', tip: 'kiralik', kategori: 'daire' },
    { slug: '{city}-satilik/arsa',  tip: 'satilik', kategori: 'arsa'  },
  ],
  emlakjet: [
    { slug: 'satilik-daire', tip: 'satilik', kategori: 'daire' },
    { slug: 'kiralik-daire', tip: 'kiralik', kategori: 'daire' },
    { slug: 'satilik-arsa',  tip: 'satilik', kategori: 'arsa'  },
  ],
};

async function buildJobs(cities, maxPages) {
  const { catRotIdx = {} } = await chrome.storage.local.get(['catRotIdx']);
  const newIdx = { ...catRotIdx };
  const jobs   = [];

  for (const site of ['sahibinden', 'hepsiemlak', 'emlakjet']) {
    const cats    = ALL_CATS[site];
    const prevIdx = catRotIdx[site] ?? (cats.length - 1);
    const idx     = (prevIdx + 1) % cats.length;
    newIdx[site]  = idx;
    const k = cats[idx];

    for (const city of cities) {
      let url;
      if (site === 'sahibinden') {
        const yol = city === 'istanbul' ? `/${k.slug}` : `/${k.slug}/${city}`;
        url = `https://www.sahibinden.com${yol}`;
      } else if (site === 'hepsiemlak') {
        url = `https://www.hepsiemlak.com/${k.slug.replace('{city}', city)}`;
      } else {
        url = `https://www.emlakjet.com/${k.slug}/${city}/`;
      }
      jobs.push({ site, url, ...k, city, maxPages });
    }
  }

  await chrome.storage.local.set({ catRotIdx: newIdx });
  return jobs;
}

// ─── Sekme Yardımcıları ───────────────────────────────────────────────────────
async function setRandomViewport(tabId) {
  const sizes = [
    { w: 1280, h: 720  }, { w: 1280, h: 800  }, { w: 1280, h: 1024 },
    { w: 1366, h: 768  }, { w: 1440, h: 900  }, { w: 1536, h: 864  },
    { w: 1600, h: 900  }, { w: 1600, h: 1024 }, { w: 1920, h: 1080 },
    { w: 1024, h: 768  }, { w: 1152, h: 864  }, { w: 1360, h: 768  },
  ];
  const { w, h } = sizes[Math.floor(Math.random() * sizes.length)];
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { width: w, height: h });
  } catch (_) {}
}

function createTab(url, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: true }, tab => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve(tab); // Timeout = devam et
      }, timeoutMs);
      function onUpdated(tabId, info) {
        if (tabId !== tab.id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timer);
        resolve(tab);
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

function navigateTab(tabId, url, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url }, () => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve(); // Timeout = devam et
      }, timeoutMs);
      function onUpdated(updatedId, info) {
        if (updatedId !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timer);
        resolve();
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

// ─── navigator.webdriver Gizle (MAIN world) ───────────────────────────────────
async function hideWebdriver(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN',
    func: () => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
      } catch (_) {}
    },
  }).catch(() => {});
}

// ─── Geri Git veya Navigasyon (goBack başarısızsa fallback) ──────────────────
async function goBackOrNavigate(tabId, fallbackUrl) {
  let resolved = false;
  await Promise.race([
    new Promise(resolve => {
      chrome.tabs.goBack(tabId, () => {
        if (chrome.runtime.lastError) { resolve(); return; }
        // onUpdated veya 5 sn timeout bekle
        const timer = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUp);
          resolve();
        }, 5000);
        function onUp(id, info) {
          if (id !== tabId || info.status !== 'complete') return;
          chrome.tabs.onUpdated.removeListener(onUp);
          clearTimeout(timer);
          resolved = true;
          resolve();
        }
        chrome.tabs.onUpdated.addListener(onUp);
      });
    }),
    sleep(8000),
  ]);
  // goBack başarısız olduysa (resolved=false ve hata) fallback
  if (!resolved) {
    try { await navigateTab(tabId, fallbackUrl); } catch (_) {}
  }
}

function injectOnce(tabId, job) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return; done = true;
      chrome.runtime.onMessage.removeListener(onMsg);
      resolve({ ilanlar: [], nextUrl: null });
    }, 60000);

    function onMsg(msg) {
      if (msg.type !== 'emlakradar_page') return;
      if (done) return; done = true;
      clearTimeout(timer); chrome.runtime.onMessage.removeListener(onMsg);
      resolve({ ilanlar: msg.ilanlar || [], nextUrl: msg.nextUrl || null });
    }
    chrome.runtime.onMessage.addListener(onMsg);

    chrome.scripting.executeScript({
      target: { tabId },
      func:   getContentFn(job.site),
      args:   [job.tip, job.kategori, job.city],
    }).catch(err => {
      if (done) return; done = true;
      clearTimeout(timer); chrome.runtime.onMessage.removeListener(onMsg);
      console.error('[EmlakRadar] executeScript hata:', err.message);
      resolve({ ilanlar: [], nextUrl: null });
    });
  });
}

// ─── Türkçe tarih → gün farkı (Sahibinden formatı) ───────────────────────────
function ilanGunFarki(tarihStr) {
  if (!tarihStr) return 999;
  const s = tarihStr.trim().toLowerCase();
  if (s.includes('bugün') || s.includes('saat önce') || s.includes('dakika önce')) return 0;
  if (s.includes('dün')) return 1;
  const aylar = { ocak:0,şubat:1,mart:2,nisan:3,mayıs:4,haziran:5,temmuz:6,ağustos:7,eylül:8,ekim:9,kasım:10,aralık:11 };
  const m = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (m) {
    const ay = aylar[m[2]];
    if (ay !== undefined) {
      const d = new Date(parseInt(m[3]), ay, parseInt(m[1]));
      const fark = (Date.now() - d.getTime()) / 86400000;
      return Math.floor(fark);
    }
  }
  return 999;
}

function injectDetail(tabId, fn) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return; done = true;
      chrome.runtime.onMessage.removeListener(onMsg);
      resolve({});
    }, 90000);

    function onMsg(msg) {
      if (msg.type !== 'emlakradar_detail') return;
      if (done) return; done = true;
      clearTimeout(timer); chrome.runtime.onMessage.removeListener(onMsg);
      resolve(msg.data || {});
    }
    chrome.runtime.onMessage.addListener(onMsg);

    chrome.scripting.executeScript({ target: { tabId }, func: fn }).catch(err => {
      if (done) return; done = true;
      clearTimeout(timer); chrome.runtime.onMessage.removeListener(onMsg);
      resolve({});
    });
  });
}

function getContentFn(site) {
  switch (site) {
    case 'sahibinden': return sahibindenScript;
    case 'hepsiemlak': return hepsiemlakScript;
    case 'emlakjet':   return emlakjetScript;
    default: return () => chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar: [], nextUrl: null });
  }
}

function getDetailFn(site) {
  switch (site) {
    case 'sahibinden': return sahibindenDetailScript;
    case 'hepsiemlak': return hepsiemlakDetailScript;
    case 'emlakjet':   return emlakjetDetailScript;
    default: return null;
  }
}

// ─── Webhook Gönder ───────────────────────────────────────────────────────────
// Döndürür: { eklenen, atilan, errors }
async function sendWebhook(ilanlar, _cfg) {
  let totalEklenen = 0, totalAtilan = 0;
  const BATCH = 10;
  for (let i = 0; i < ilanlar.length; i += BATCH) {
    const batch = ilanlar.slice(i, i + BATCH);
    const body  = JSON.stringify({
      tip:    'yeni_ilan',
      ilanlar: batch,
      zaman:  new Date().toISOString(),
      kaynak: batch[0]?.kaynak_site ?? 'unknown',
    });
    const sig = await signPayload(body, WEBHOOK_SECRET);
    const res = await fetch(API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':        'application/json',
        'X-Webhook-Signature': sig,
        'X-Webhook-Source':    'emlakradar-extension',
        'X-Webhook-Timestamp': new Date().toISOString(),
      },
      body,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Webhook HTTP ${res.status} (${API_URL}): ${txt.substring(0, 150)}`);
    }
    const json = await res.json().catch(() => ({}));
    console.log('[EmlakRadar] Webhook yanıtı:', json);
    if (!json.success && json.message) {
      throw new Error(`Webhook red: ${json.message}`);
    }
    totalEklenen += json.data?.eklenen ?? json.eklenen ?? 0;
    totalAtilan  += json.data?.atilan  ?? json.atilan  ?? 0;
  }
  return { eklenen: totalEklenen, atilan: totalAtilan };
}

// ─── Deduplication ────────────────────────────────────────────────────────────
function filterYeni(ilanlar) {
  return new Promise(resolve => {
    chrome.storage.local.get(['seenIds'], ({ seenIds = [] }) => {
      const seen = new Set(seenIds);
      resolve(ilanlar.filter(i => !seen.has(i.kaynak_id)));
    });
  });
}

function markGoruldu(ilanlar) {
  return new Promise(resolve => {
    chrome.storage.local.get(['seenIds'], ({ seenIds = [] }) => {
      const updated = [...new Set([...seenIds, ...ilanlar.map(i => i.kaynak_id)])];
      chrome.storage.local.set({ seenIds: updated.slice(-15000) }, resolve);
    });
  });
}

// ─── Sunucu DB'de hangi kaynak_id'ler zaten var? ──────────────────────────────
// Detay sayfasına girmeden önce toplu kontrol — bot riskini dramatik azaltır
async function checkServerIds(ilanlar) {
  if (!ilanlar.length) return new Set();

  // Site bazında grupla
  const bySite = {};
  for (const ilan of ilanlar) {
    const site = ilan.kaynak_site;
    if (!bySite[site]) bySite[site] = [];
    bySite[site].push(ilan.kaynak_id);
  }

  const mevcutIds = new Set();
  for (const [site, ids] of Object.entries(bySite)) {
    try {
      const body = JSON.stringify({ tip: 'check_ids', site, ids });
      const sig  = await signPayload(body, WEBHOOK_SECRET);
      const res  = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': sig },
        body,
      });
      if (!res.ok) continue;
      const json = await res.json().catch(() => ({}));
      (json.data?.mevcut || []).forEach(id => mevcutIds.add(id));
    } catch (e) {
      console.warn('[EmlakRadar] checkServerIds hata:', e.message);
    }
  }
  return mevcutIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// LİSTE CONTENT SCRIPTS — sadece mevcut sayfayı parse eder, nextUrl döner
// ─────────────────────────────────────────────────────────────────────────────

// Tüm content script'lerin kullandığı gerçekçi scroll fonksiyonu (smooth + değişken adım)
async function humanScroll() {
  const total  = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  // Değişken adım boyutu: küçük/orta/büyük Gaussian dağılımı
  const step   = () => {
    const r = Math.random();
    if (r < 0.2) return 50  + Math.random() * 50;   // %20: yavaş okuma
    if (r < 0.8) return 100 + Math.random() * 150;  // %60: normal
    return 250 + Math.random() * 150;                // %20: hızlı geçme
  };
  const pause  = () => 60  + Math.random() * 100;
  const longP  = () => 700 + Math.random() * 1200;
  let pos = 0;

  while (pos < total - 200) {
    pos += step();
    window.scrollTo({ top: Math.min(pos, total), behavior: 'smooth' });
    if (Math.random() < 0.12) await new Promise(r => setTimeout(r, longP()));
    else                       await new Promise(r => setTimeout(r, pause()));
    if (Math.random() < 0.08) {
      pos -= 150 + Math.random() * 250;
      window.scrollTo({ top: Math.max(0, pos), behavior: 'smooth' });
      await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    }
  }

  await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await new Promise(r => setTimeout(r, 300));
}

async function sahibindenScript(tip, kategori, city) {
  const BASE = 'https://www.sahibinden.com';

  async function waitFor(selector, ms = 30000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelectorAll(selector).length > 0) return true;
      await new Promise(r => setTimeout(r, 1500));
    }
    return false;
  }

  async function humanScroll() {
    const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step  = () => { const r = Math.random(); return r < 0.2 ? 50 + r * 250 : r < 0.8 ? 100 + Math.random() * 150 : 250 + Math.random() * 150; };
    const pause = () => 60 + Math.random() * 100;
    const longP = () => 700 + Math.random() * 1200;
    let pos = 0;
    while (pos < total - 200) {
      pos += step();
      window.scrollTo({ top: Math.min(pos, total), behavior: 'smooth' });
      if (Math.random() < 0.12) await new Promise(r => setTimeout(r, longP()));
      else                       await new Promise(r => setTimeout(r, pause()));
      if (Math.random() < 0.08) { pos -= 150 + Math.random() * 250; window.scrollTo({ top: Math.max(0, pos), behavior: 'smooth' }); await new Promise(r => setTimeout(r, 350)); }
    }
    await new Promise(r => setTimeout(r, 500));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 300));
  }

  const found = await waitFor('tr.searchResultsItem');
  if (!found) {
    chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar: [], nextUrl: null });
    return;
  }

  // Okuma duraklaması: gerçek kullanıcı gibi sayfaya bakar, hemen scroll yapmaz
  await new Promise(r => setTimeout(r, 1200 + Math.random() * 2500));
  await humanScroll();

  const ilanlar = [];
  document.querySelectorAll('tr.searchResultsItem').forEach(satir => {
    try {
      const id = satir.getAttribute('data-id') || '';
      if (!id) return;

      const baslikEl   = satir.querySelector('.classifiedTitle');
      const baslik     = baslikEl?.textContent?.trim() || '';
      const href       = baslikEl?.getAttribute('href') || '';
      const kaynak_url = href.startsWith('http') ? href : BASE + href;
      if (!kaynak_url || !baslik) return;

      const fiyatEl = satir.querySelector('td.searchResultsPriceValue span');
      const fiyat   = parseFloat(
        (fiyatEl?.textContent?.trim() || '').replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'')
      ) || 0;

      const lokEl  = satir.querySelector('td.searchResultsLocationValue');
      const lokHtml = lokEl?.innerHTML || '';
      const lokPar  = lokHtml.split(/<br\s*\/?>/i)
        .map(s => s.replace(/<[^>]+>/g,'').trim()).filter(Boolean);

      const attrs    = Array.from(satir.querySelectorAll('td.searchResultsAttributeValue'));
      const attrTxt  = attrs.map(a => a.textContent?.trim() || '');
      const metrekare = parseFloat(
        (attrTxt[0] || '').replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'')
      ) || null;
      const odaText = attrTxt[1] || '';

      const imgs = [];
      satir.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
        if (src && src.startsWith('http') && !src.includes('blank') && !src.includes('/assets/') && !src.includes('spacer'))
          imgs.push(src);
      });

      const tarihEl = satir.querySelector('.searchResultsDateValue');
      ilanlar.push({
        kaynak_site: 'sahibinden', kaynak_url, kaynak_id: id,
        baslik, aciklama: '', fiyat, fiyat_birimi: 'TL', tip, kategori,
        sehir: lokPar[0] || city, ilce: lokPar[1] || '', mahalle: lokPar[2] || '',
        adres: lokPar.join(', '), metrekare: metrekare || undefined,
        oda_sayisi: odaText || undefined, fotograflar: imgs,
        ilan_tarihi: tarihEl?.textContent?.trim() || undefined,
        taranan_at: new Date().toISOString(),
      });
    } catch (_) {}
  });

  let nextUrl = null;
  const nextEl = document.querySelector('a.prevNextBut[title*="Sonraki"], a[title*="Sonraki sayfa"], a[aria-label*="Sonraki"]');
  if (nextEl) {
    const href = nextEl.getAttribute('href') || '';
    nextUrl = href.startsWith('http') ? href : BASE + href;
  }

  chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar, nextUrl });
}

async function hepsiemlakScript(tip, kategori, city) {
  const BASE = 'https://www.hepsiemlak.com';
  const SEL  = '.listing-item, .listing-item-v2, li[data-id], [data-listing-id]';

  async function humanScroll() {
    const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step  = () => { const r = Math.random(); return r < 0.2 ? 50 + r * 250 : r < 0.8 ? 100 + Math.random() * 150 : 250 + Math.random() * 150; };
    const pause = () => 60  + Math.random() * 100;
    const longP = () => 700 + Math.random() * 1200;
    let pos = 0;
    while (pos < total - 200) {
      pos += step();
      window.scrollTo({ top: Math.min(pos, total), behavior: 'smooth' });
      if (Math.random() < 0.12) await new Promise(r => setTimeout(r, longP()));
      else                       await new Promise(r => setTimeout(r, pause()));
      if (Math.random() < 0.08) { pos -= 150 + Math.random() * 250; window.scrollTo({ top: Math.max(0, pos), behavior: 'smooth' }); await new Promise(r => setTimeout(r, 350)); }
    }
    await new Promise(r => setTimeout(r, 500));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 300));
  }

  async function waitFor(selector, ms = 25000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelectorAll(selector).length > 0) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  await waitFor(SEL);
  // Okuma duraklaması
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
  await humanScroll();

  const ilanlar = [];
  document.querySelectorAll(SEL).forEach(kart => {
    try {
      let id = kart.getAttribute('data-id') || kart.getAttribute('data-listing-id') || '';
      const baslikEl  = kart.querySelector('h2 a, h3 a, .listing-card-title a, a[title], a[class*="title"]');
      const anyA      = baslikEl || kart.querySelector('a');
      const href      = anyA?.getAttribute('href') || '';
      if (!id && href) { const m = href.match(/[/-](\d{6,})(?:\/|$|\?)/); id = m ? m[1] : ''; }
      if (!id) return;

      const baslik     = baslikEl?.textContent?.trim() || anyA?.getAttribute('title') || '';
      const kaynak_url = href.startsWith('http') ? href : BASE + href;
      if (!kaynak_url || !baslik) return;

      const fiyatEl = kart.querySelector('[class*="price"], [class*="fiyat"]');
      const fiyat   = parseFloat(
        (fiyatEl?.textContent?.trim() || '').replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'')
      ) || 0;

      const lokEl  = kart.querySelector('[class*="location"], [class*="adres"], [class*="konum"]');
      const lokTxt = lokEl?.textContent?.trim() || '';
      const lokPar = lokTxt.split(/[\/,]/).map(s => s.trim()).filter(Boolean);

      const m2El     = kart.querySelector('[class*="m2"], [class*="meter"], [class*="area"], [class*="brut"]');
      const metrekare = parseFloat((m2El?.textContent?.trim() || '').replace(/[^\d,]/g,'').replace(',','.')) || null;
      const odaEl    = kart.querySelector('[class*="room"], [class*="oda"]');

      const imgs = [];
      kart.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
        if (src && src.startsWith('http') && !src.includes('no-image') && src.length > 15) imgs.push(src);
      });

      ilanlar.push({
        kaynak_site: 'hepsiemlak', kaynak_url, kaynak_id: `he_${id}`,
        baslik, aciklama: '', fiyat, fiyat_birimi: 'TL', tip, kategori,
        sehir: lokPar[0] || city, ilce: lokPar[1] || '', mahalle: lokPar[2] || '',
        adres: lokTxt, metrekare: metrekare || undefined,
        oda_sayisi: odaEl?.textContent?.trim() || undefined, fotograflar: imgs,
        taranan_at: new Date().toISOString(),
      });
    } catch (_) {}
  });

  let nextUrl = null;
  const nextEl = document.querySelector('a[rel="next"], .he-pagination__navigate--next a, a[title*="Sonraki"], [class*="pagination"] [class*="next"] a');
  if (nextEl) {
    const href = nextEl.getAttribute('href') || '';
    nextUrl = href.startsWith('http') ? href : BASE + href;
  }
  chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar, nextUrl });
}

async function emlakjetScript(tip, kategori, city) {
  const BASE = 'https://www.emlakjet.com';
  const SEL  = '[class*="listing-card"], [class*="ListingCard"], [class*="property-card"], article[data-id]';

  async function humanScroll() {
    const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step  = () => { const r = Math.random(); return r < 0.2 ? 50 + r * 250 : r < 0.8 ? 100 + Math.random() * 150 : 250 + Math.random() * 150; };
    const pause = () => 60  + Math.random() * 100;
    const longP = () => 700 + Math.random() * 1200;
    let pos = 0;
    while (pos < total - 200) {
      pos += step();
      window.scrollTo({ top: Math.min(pos, total), behavior: 'smooth' });
      if (Math.random() < 0.12) await new Promise(r => setTimeout(r, longP()));
      else                       await new Promise(r => setTimeout(r, pause()));
      if (Math.random() < 0.08) { pos -= 150 + Math.random() * 250; window.scrollTo({ top: Math.max(0, pos), behavior: 'smooth' }); await new Promise(r => setTimeout(r, 350)); }
    }
    await new Promise(r => setTimeout(r, 500));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 300));
  }

  async function waitFor(ms = 20000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelectorAll(SEL).length > 0) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  await waitFor();
  // Okuma duraklaması
  await new Promise(r => setTimeout(r, 900 + Math.random() * 2200));
  await humanScroll();

  const ilanlar = [];
  document.querySelectorAll(SEL).forEach(kart => {
    try {
      let id = kart.getAttribute('data-id') || kart.getAttribute('data-listing-id') || '';
      const aEl  = kart.tagName === 'A' ? kart : kart.querySelector('a');
      const href = aEl?.getAttribute('href') || aEl?.href || '';
      if (!id && href) { const m = href.match(/\/ilan\/(\d+)/) || href.match(/[/-](\d{6,})(?:\/|$|\?)/); id = m ? m[1] : ''; }
      if (!id) return;

      const kaynak_url = href.startsWith('http') ? href : BASE + href;
      const baslikEl   = kart.querySelector('[class*="title"], [class*="Title"], h2, h3');
      const baslik     = baslikEl?.textContent?.trim() || '';
      if (!kaynak_url || !baslik) return;

      const fiyatEl = kart.querySelector('[class*="price"], [class*="Price"], [class*="fiyat"]');
      const fiyat   = parseFloat((fiyatEl?.textContent?.trim() || '').replace(/[^\d]/g,'')) || 0;

      const lokEl  = kart.querySelector('[class*="location"], [class*="Location"], [class*="adres"]');
      const lokTxt = lokEl?.textContent?.trim() || '';
      const lokPar = lokTxt.split(/[,\/]/).map(s => s.trim()).filter(Boolean);

      const m2El     = kart.querySelector('[class*="m2"], [class*="area"], [class*="Area"]');
      const metrekare = parseFloat((m2El?.textContent?.trim() || '').replace(/[^\d,]/g,'').replace(',','.')) || null;
      const odaEl    = kart.querySelector('[class*="room"], [class*="Room"], [class*="oda"]');

      const imgs = [];
      kart.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
        if (src && src.startsWith('http') && !src.includes('no-image')) imgs.push(src);
      });

      ilanlar.push({
        kaynak_site: 'emlakjet', kaynak_url, kaynak_id: `ej_${id}`,
        baslik, aciklama: '', fiyat, fiyat_birimi: 'TL', tip, kategori,
        sehir: lokPar[0] || city, ilce: lokPar[1] || '', mahalle: lokPar[2] || '',
        adres: lokTxt, metrekare: metrekare || undefined,
        oda_sayisi: odaEl?.textContent?.trim() || undefined, fotograflar: imgs,
        taranan_at: new Date().toISOString(),
      });
    } catch (_) {}
  });

  let nextUrl = null;
  const nextEl = document.querySelector('a[rel="next"], [class*="pagination"] a[class*="next"], [class*="Pagination"] a[class*="Next"]');
  if (nextEl) {
    const href = nextEl.getAttribute('href') || '';
    nextUrl = href.startsWith('http') ? href : BASE + href;
  }
  chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar, nextUrl });
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAY CONTENT SCRIPTS — ilan sayfasından tam veri çeker
// ─────────────────────────────────────────────────────────────────────────────

async function sahibindenDetailScript() {
  async function waitFor(selector, ms = 25000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelector(selector)) return true;
      await new Promise(r => setTimeout(r, 800));
    }
    return false;
  }

  async function humanScroll() {
    const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step  = () => { const r = Math.random(); return r < 0.2 ? 50 + r * 250 : r < 0.8 ? 100 + Math.random() * 150 : 250 + Math.random() * 150; };
    const pause = () => 70  + Math.random() * 100;
    const longP = () => 600 + Math.random() * 1000;
    let pos = 0;
    while (pos < total - 200) {
      pos += step();
      window.scrollTo({ top: Math.min(pos, total), behavior: 'smooth' });
      if (Math.random() < 0.1) await new Promise(r => setTimeout(r, longP()));
      else                      await new Promise(r => setTimeout(r, pause()));
      if (Math.random() < 0.07) { pos -= 150 + Math.random() * 200; window.scrollTo({ top: Math.max(0, pos), behavior: 'smooth' }); await new Promise(r => setTimeout(r, 300)); }
    }
    await new Promise(r => setTimeout(r, 400));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 200));
  }

  // Thumbnail URL'ini tam boya çevir
  function toFullSize(url) {
    if (!url) return url;
    // sahibinden CDN: /thumb/ → / veya ?width=X kaldır
    return url
      .replace(/\/thumb\//g, '/')
      .replace(/[?&]width=\d+(&height=\d+)?/g, '')
      .replace(/[?&]height=\d+/g, '')
      .replace(/_kucuk(\.\w+)$/i, '$1')
      .replace(/_small(\.\w+)$/i, '$1')
      .replace(/[?&]$/, '');
  }

  // ─── Sayfa yüklensin ────────────────────────────────────────────────────────
  await waitFor('h1.classifiedDetailTitle, h1[class*="title"], .classifiedDetailMainPhoto', 25000);
  await new Promise(r => setTimeout(r, 1500)); // JS render tamamlansın

  // Lazy load + gerçekçi scroll
  await humanScroll();
  await new Promise(r => setTimeout(r, 500)); // Lazy load tamamlansın

  // ─── 1. FOTOĞRAFLAR ──────────────────────────────────────────────────────────
  const seen = new Set();
  const imgs = [];
  function addImg(url) {
    if (!url) return;
    // Tam URL değilse atla
    if (!url.startsWith('http') && !url.startsWith('//')) return;
    const u = toFullSize(url.startsWith('//') ? 'https:' + url : url);
    if (seen.has(u)) return;
    if (/blank|placeholder|no.image|spacer|\/assets\/|favicon|icon|logo/i.test(u)) return;
    if (u.length < 20) return;
    seen.add(u); imgs.push(u);
  }

  // Yöntem 1: Script tag'larından JSON veri — Sahibinden tüm fotoları buraya gömer
  const allScriptText = Array.from(document.querySelectorAll('script')).map(s => s.textContent).join('\n');

  // Sahibinden'in bilinen veri yapıları
  const jsonPatterns = [
    /classifiedDetailPhotos\s*=\s*(\[[\s\S]*?\]);/,
    /"photos"\s*:\s*(\[[\s\S]*?\])/,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]{0,50000}\})/,
  ];
  for (const pat of jsonPatterns) {
    const m = allScriptText.match(pat);
    if (m) {
      try {
        const parsed = JSON.parse(m[1]);
        const arr = Array.isArray(parsed) ? parsed : (parsed.photos || parsed.classifiedPhotos || []);
        arr.forEach(p => {
          if (typeof p === 'string') addImg(p);
          else addImg(p.url || p.src || p.photoUrl || p.photo_url || p.originalUrl || '');
        });
      } catch (_) {}
    }
  }

  // Yöntem 2: Tüm CDN URL'lerini script taglardan regex ile çek
  const cdnMatches = allScriptText.matchAll(/(https?:\/\/[^"'\s,]+\.(?:jpg|jpeg|png|webp)(?:[^"'\s,]*)?)/gi);
  for (const m of cdnMatches) addImg(m[1]);

  // Yöntem 3: Thumbnail şeridi <a href> linkleri → tam boy URL
  document.querySelectorAll(
    '.classifiedDetailMainPhotosSmall a, ' +
    '#classifiedDetailMainPhotosSmall a, ' +
    '.classified-detail-thumbnails a, ' +
    '[class*="thumbnails"] a'
  ).forEach(a => addImg(a.getAttribute('href')));

  // Yöntem 4: Tüm img data-src / data-lazy / src — DOM'daki yüklü resimler
  document.querySelectorAll('img').forEach(img => {
    addImg(img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('src'));
  });

  // Yöntem 5: Tüm <a href> içinde resim URL'leri
  document.querySelectorAll('a[href]').forEach(a => {
    const h = a.getAttribute('href') || '';
    if (/\.(jpg|jpeg|png|webp)/i.test(h)) addImg(h);
  });

  // ─── 2. AÇIKLAMA ────────────────────────────────────────────────────────────
  const aciklama = (
    document.querySelector('#classifiedDescription')?.textContent?.trim() ||
    document.querySelector('.classifiedDescription')?.textContent?.trim() ||
    document.querySelector('[id*="description"], [class*="description"]')?.textContent?.trim() ||
    ''
  ).substring(0, 5000);

  // ─── 3. ÖZELLİK TABLOSU ─────────────────────────────────────────────────────
  const attrs = {};

  // Format A: <li><span class="title">X</span><span class="value">Y</span></li>
  document.querySelectorAll('.classifiedInfoList li, .classified-info-list li').forEach(li => {
    const spans = li.querySelectorAll('span');
    if (spans.length >= 2) {
      attrs[spans[0].textContent.trim().toLowerCase()] = spans[spans.length - 1].textContent.trim();
    } else {
      const parts = li.textContent.split(':').map(s => s.trim());
      if (parts.length >= 2) attrs[parts[0].toLowerCase()] = parts.slice(1).join(':').trim();
    }
  });

  // Format B: <dl> <dt>etiket</dt><dd>değer</dd>
  document.querySelectorAll('dl dt').forEach(dt => {
    const dd = dt.nextElementSibling;
    if (dd?.tagName === 'DD') attrs[dt.textContent.trim().toLowerCase()] = dd.textContent.trim();
  });

  // Format C: <table> satırları
  document.querySelectorAll('table.classifiedInfo tr, table[class*="property"] tr, table[class*="detail"] tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length >= 2) attrs[cells[0].textContent.trim().toLowerCase()] = cells[1].textContent.trim();
  });

  // Format D: satır bazlı key/value div'ler
  document.querySelectorAll('[class*="property-row"], [class*="detail-row"], [class*="info-row"]').forEach(row => {
    const label = row.querySelector('[class*="label"], [class*="title"], [class*="key"]')?.textContent?.trim();
    const value = row.querySelector('[class*="value"], [class*="data"]')?.textContent?.trim();
    if (label && value) attrs[label.toLowerCase()] = value;
  });

  function findAttr(...keys) {
    for (const k of keys) {
      for (const attrKey of Object.keys(attrs)) {
        if (attrKey.includes(k)) return attrs[attrKey];
      }
    }
    return null;
  }

  // ─── 4. SATICI ──────────────────────────────────────────────────────────────
  const satici_ad = (
    document.querySelector('.username')?.textContent?.trim() ||
    document.querySelector('[id*="username"], [class*="username"]')?.textContent?.trim() ||
    document.querySelector('[class*="advertiser-name"], [class*="owner-name"], [class*="seller-name"]')?.textContent?.trim() ||
    ''
  ).replace(/\s+/g, ' ');

  // Telefon: önce href="tel:" bağlantısı, yoksa gizlenmiş numara
  const telEl = document.querySelector('a[href^="tel:"]');
  const satici_tel = (
    (telEl?.getAttribute('href') || '').replace('tel:', '').trim() ||
    telEl?.textContent?.trim() ||
    document.querySelector('[class*="phone"], [class*="tel"]')?.textContent?.trim() ||
    ''
  ).replace(/\s+/g, '');

  // ─── 5. KOORDİNAT ───────────────────────────────────────────────────────────
  const lat = parseFloat(
    document.querySelector('[data-lat]')?.getAttribute('data-lat') ||
    document.querySelector('input[name="lat"]')?.value || ''
  ) || null;
  const lng = parseFloat(
    document.querySelector('[data-lng]')?.getAttribute('data-lng') ||
    document.querySelector('input[name="lng"]')?.value || ''
  ) || null;

  chrome.runtime.sendMessage({ type: 'emlakradar_detail', data: {
    aciklama,
    fotograflar: imgs,
    oda_sayisi:  findAttr('oda sayısı', 'oda sayisi', 'oda'),
    metrekare:   parseFloat((findAttr('m²', 'brüt', 'net m²', 'alan') || '').replace(/[^\d,]/g, '').replace(',', '.')) || null,
    kat:         findAttr('bulunduğu kat', 'kat bilgisi', 'kat'),
    bina_yasi:   findAttr('bina yaşı', 'bina yasi', 'yapı yaşı'),
    isitma:      findAttr('ısıtma', 'isitma', 'ısıtma tipi'),
    banyo:       findAttr('banyo sayısı', 'banyo'),
    satici_ad,
    satici_tel,
    konum: (lat && lng) ? { lat, lng } : null,
  }});
}

async function hepsiemlakDetailScript() {
  async function waitFor(ms = 20000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelector('h1, [class*="detail"]')) return true;
      await new Promise(r => setTimeout(r, 800));
    }
    return false;
  }
  async function humanScroll() {
    const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step  = () => { const r = Math.random(); return r < 0.2 ? 50 + r * 250 : r < 0.8 ? 100 + Math.random() * 150 : 250 + Math.random() * 150; };
    let pos = 0;
    while (pos < total - 200) {
      pos += step();
      window.scrollTo({ top: Math.min(pos, total), behavior: 'smooth' });
      if (Math.random() < 0.1) await new Promise(r => setTimeout(r, 700 + Math.random() * 900));
      else                      await new Promise(r => setTimeout(r, 70 + Math.random() * 100));
      if (Math.random() < 0.07) { pos -= 150 + Math.random() * 200; window.scrollTo({ top: Math.max(0, pos), behavior: 'smooth' }); await new Promise(r => setTimeout(r, 300)); }
    }
    await new Promise(r => setTimeout(r, 400));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 200));
  }

  await waitFor();
  await new Promise(r => setTimeout(r, 1500));
  await humanScroll();
  await new Promise(r => setTimeout(r, 500));

  // Açıklama
  const aciklama = (
    document.querySelector('#description, [id*="description"], [class*="description"]')?.textContent?.trim() || ''
  ).substring(0, 5000);

  // Fotoğraflar — önce <a href>, sonra img data-src
  const seen = new Set(); const imgs = [];
  function addImg(url) {
    if (!url || !url.startsWith('http') || seen.has(url)) return;
    if (/no.image|placeholder|blank|favicon/i.test(url) || url.length < 30) return;
    seen.add(url); imgs.push(url);
  }
  document.querySelectorAll('[class*="gallery"] a, [class*="photo"] a, [class*="slider"] a').forEach(a => addImg(a.getAttribute('href')));
  document.querySelectorAll('img[data-src], img[data-lazy], [class*="gallery"] img, [class*="photo"] img, [class*="slider"] img').forEach(img => {
    addImg(img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src);
  });
  if (imgs.length < 2) {
    document.querySelectorAll('script').forEach(s => {
      const matches = (s.textContent || '').matchAll(/"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi);
      for (const m of matches) addImg(m[1]);
    });
  }

  // Özellikler
  const attrs = {};
  document.querySelectorAll('li, [class*="spec"], [class*="feature"], [class*="detail-item"]').forEach(el => {
    const label = el.querySelector('[class*="label"], [class*="title"], [class*="key"], span:first-child')?.textContent?.trim();
    const value = el.querySelector('[class*="value"], span:last-child')?.textContent?.trim();
    if (label && value && label !== value) attrs[label.toLowerCase()] = value;
    else {
      const parts = el.textContent.trim().split(/[:·]/).map(s => s.trim());
      if (parts.length >= 2 && parts[0].length < 40) attrs[parts[0].toLowerCase()] = parts.slice(1).join(' ');
    }
  });

  function findAttr(...keys) {
    for (const k of keys) for (const ak of Object.keys(attrs)) if (ak.includes(k)) return attrs[ak];
    return null;
  }

  const satici_ad  = document.querySelector('[class*="advertiser"], [class*="owner"], [class*="agent"]')?.textContent?.trim()?.replace(/\s+/g,' ') || '';
  const telEl = document.querySelector('a[href^="tel:"]');
  const satici_tel = (telEl?.getAttribute('href') || '').replace('tel:','').trim() || telEl?.textContent?.trim() || '';
  const lat = parseFloat(document.querySelector('[data-lat]')?.getAttribute('data-lat') || '') || null;
  const lng = parseFloat(document.querySelector('[data-lng]')?.getAttribute('data-lng') || '') || null;

  chrome.runtime.sendMessage({ type: 'emlakradar_detail', data: {
    aciklama, fotograflar: imgs,
    oda_sayisi: findAttr('oda sayısı', 'oda'),
    metrekare:  parseFloat((findAttr('m²', 'brüt', 'net', 'alan') || '').replace(/[^\d,]/g,'').replace(',','.')) || null,
    kat:        findAttr('kat', 'bulunduğu kat'),
    bina_yasi:  findAttr('bina yaşı', 'yapı yaşı'),
    isitma:     findAttr('ısıtma'),
    banyo:      findAttr('banyo'),
    satici_ad, satici_tel,
    konum: (lat && lng) ? { lat, lng } : null,
  }});
}

async function emlakjetDetailScript() {
  async function waitFor(ms = 20000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelector('h1, [class*="detail"]')) return true;
      await new Promise(r => setTimeout(r, 800));
    }
    return false;
  }
  async function humanScroll() {
    const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step  = () => { const r = Math.random(); return r < 0.2 ? 50 + r * 250 : r < 0.8 ? 100 + Math.random() * 150 : 250 + Math.random() * 150; };
    let pos = 0;
    while (pos < total - 200) {
      pos += step();
      window.scrollTo({ top: Math.min(pos, total), behavior: 'smooth' });
      if (Math.random() < 0.1) await new Promise(r => setTimeout(r, 700 + Math.random() * 900));
      else                      await new Promise(r => setTimeout(r, 70 + Math.random() * 100));
      if (Math.random() < 0.07) { pos -= 150 + Math.random() * 200; window.scrollTo({ top: Math.max(0, pos), behavior: 'smooth' }); await new Promise(r => setTimeout(r, 300)); }
    }
    await new Promise(r => setTimeout(r, 400));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 200));
  }

  await waitFor();
  await new Promise(r => setTimeout(r, 1500));
  await humanScroll();
  await new Promise(r => setTimeout(r, 500));

  const aciklama = (
    document.querySelector('#description, [id*="description"], [class*="description"]')?.textContent?.trim() || ''
  ).substring(0, 5000);

  const seen = new Set(); const imgs = [];
  function addImg(url) {
    if (!url || !url.startsWith('http') || seen.has(url)) return;
    if (/no.image|placeholder|blank|favicon/i.test(url) || url.length < 30) return;
    seen.add(url); imgs.push(url);
  }
  document.querySelectorAll('[class*="gallery"] a, [class*="photo"] a, [class*="slider"] a').forEach(a => addImg(a.getAttribute('href')));
  document.querySelectorAll('img[data-src], img[data-lazy], [class*="gallery"] img, [class*="slider"] img, [class*="photo"] img').forEach(img => {
    addImg(img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src);
  });
  if (imgs.length < 2) {
    document.querySelectorAll('script').forEach(s => {
      const matches = (s.textContent || '').matchAll(/"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi);
      for (const m of matches) addImg(m[1]);
    });
  }

  const attrs = {};
  document.querySelectorAll('li, [class*="spec"], [class*="feature"], [class*="attribute"], [class*="detail-row"]').forEach(el => {
    const label = el.querySelector('[class*="label"], [class*="title"], span:first-child')?.textContent?.trim();
    const value = el.querySelector('[class*="value"], span:last-child')?.textContent?.trim();
    if (label && value && label !== value) attrs[label.toLowerCase()] = value;
    else {
      const parts = el.textContent.trim().split(/[:·]/).map(s => s.trim());
      if (parts.length >= 2 && parts[0].length < 40) attrs[parts[0].toLowerCase()] = parts.slice(1).join(' ');
    }
  });

  function findAttr(...keys) {
    for (const k of keys) for (const ak of Object.keys(attrs)) if (ak.includes(k)) return attrs[ak];
    return null;
  }

  const satici_ad  = document.querySelector('[class*="agent"], [class*="owner"], [class*="advertiser"]')?.textContent?.trim()?.replace(/\s+/g,' ') || '';
  const telEl = document.querySelector('a[href^="tel:"]');
  const satici_tel = (telEl?.getAttribute('href') || '').replace('tel:','').trim() || telEl?.textContent?.trim() || '';
  const lat = parseFloat(document.querySelector('[data-lat]')?.getAttribute('data-lat') || '') || null;
  const lng = parseFloat(document.querySelector('[data-lng]')?.getAttribute('data-lng') || '') || null;

  chrome.runtime.sendMessage({ type: 'emlakradar_detail', data: {
    aciklama, fotograflar: imgs,
    oda_sayisi: findAttr('oda sayısı', 'oda'),
    metrekare:  parseFloat((findAttr('m²', 'alan', 'brüt') || '').replace(/[^\d,]/g,'').replace(',','.')) || null,
    kat:        findAttr('kat', 'bulunduğu kat'),
    bina_yasi:  findAttr('bina yaşı', 'yapı yaşı'),
    isitma:     findAttr('ısıtma'),
    banyo:      findAttr('banyo'),
    satici_ad, satici_tel,
    konum: (lat && lng) ? { lat, lng } : null,
  }});
}
