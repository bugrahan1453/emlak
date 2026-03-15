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

// ─── Alarm Kurulumu ───────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[EmlakRadar] Extension yüklendi');

  // İlk kurulumda ayarları kaydet ve hemen başlat
  if (details.reason === 'install') {
    await chrome.storage.sync.set({ cities: DEFAULT_CITIES, intervalMinutes: 10, enabled: true });
    chrome.alarms.create('scrape', { delayInMinutes: 2, periodInMinutes: 10 });
    // İlk kurulumda bot algısını tetiklememek için 2 dakika bekle
    setTimeout(() => runAllScrapers(true), 2 * 60 * 1000);
  } else {
    const cfg = await getConfig();
    chrome.alarms.create('scrape', { delayInMinutes: 1, periodInMinutes: cfg.intervalMinutes || 10 });
  }
});

chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.intervalMinutes) {
    const minutes = changes.intervalMinutes.newValue || 10;
    await chrome.alarms.clearAll();
    chrome.alarms.create('scrape', { delayInMinutes: 1, periodInMinutes: minutes });
    ensureAlarms();
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
      sendProgress('Challenge sayfası — çözüm deneniyor...', 'info');
      const cfg = await getConfig();
      if (cfg.captchaSolver && cfg.captchaApiKey) {
        const solved = await trySolveCaptcha(tabId, cfg);
        if (solved) { sendProgress('✓ CAPTCHA çözüldü, devam ediliyor', 'ok'); return false; }
      }
      const debugSolved = await trySolveChallenge(tabId);
      if (debugSolved) { sendProgress('✓ Challenge geçildi', 'ok'); return false; }

      sendProgress('⚠️ Challenge geçilemedi — ban olarak işleniyor', 'error');
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

// ─── CAPTCHA Tespiti ──────────────────────────────────────────────────────────
async function detectCaptcha(tabId) {
  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const out = { hasCaptcha: false, type: null, sitekey: null, pageUrl: location.href };
        const turnstile = document.querySelector(
          'iframe[src*="challenges.cloudflare.com"], [class*="cf-turnstile"], #cf-turnstile-response, [data-turnstile-sitekey]'
        );
        if (turnstile) {
          out.hasCaptcha = true; out.type = 'turnstile';
          const w = document.querySelector('[data-sitekey], [data-turnstile-sitekey]');
          if (w) out.sitekey = w.getAttribute('data-sitekey') || w.getAttribute('data-turnstile-sitekey');
          if (!out.sitekey) {
            const m = document.documentElement.innerHTML.match(/sitekey['":\s]+['"]([0-9a-zA-Z_\-\.]{10,})['"]/);
            if (m) out.sitekey = m[1];
          }
          return out;
        }
        const txt = (document.body?.innerText || '').toLowerCase();
        if (txt.includes('tarayıcınızı kontrol') || txt.includes('checking your browser') || txt.includes('just a moment')) {
          out.hasCaptcha = true; out.type = 'cf_challenge'; return out;
        }
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

// ─── CAPTCHA Çözme API ────────────────────────────────────────────────────────
async function solveCaptchaViaAPI(captchaInfo, cfg) {
  const { type, sitekey, pageUrl } = captchaInfo;
  const api = CAPTCHA_APIS[cfg.captchaSolver];
  if (!api) return null;

  let taskData;
  if (type === 'turnstile')    taskData = { type: 'TurnstileTaskProxyless',   websiteURL: pageUrl, websiteKey: sitekey };
  else if (type === 'recaptcha_v2') taskData = { type: 'RecaptchaV2TaskProxyless', websiteURL: pageUrl, websiteKey: sitekey };
  else if (type === 'cf_challenge') taskData = { type: 'AntiCloudflareTask', websiteURL: pageUrl, metadata: { type: 'challenge' } };
  else return null;

  try {
    const createRes = await fetch(api.create, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: cfg.captchaApiKey, task: taskData }),
    });
    const created = await createRes.json();
    if (created.errorId) { console.warn('[EmlakRadar] CAPTCHA task hatası:', created.errorDescription); return null; }
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
      if (data.errorId) { console.warn('[EmlakRadar] CAPTCHA çözüm hatası:', data.errorDescription); return null; }
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
  const captchaCount = ((await chrome.storage.local.get(['captchaCount'])).captchaCount || 0) + 1;
  await chrome.storage.local.set({ captchaCount });
  return !await checkBotBlockSimple(tabId);
}

// ─── Challenge Sayfası Geçme (API yoksa — dispatchEvent yöntemi) ───────────────
async function trySolveChallenge(tabId) {
  try {
    await sleep(3000 + Math.random() * 2000);
    const r = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: async () => {
        for (let i = 0; i < 15; i++) {
          window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: 100 + Math.random() * 800 + i * 20,
            clientY: 150 + Math.random() * 400 + i * 8,
            movementX: Math.random() * 10 - 5, movementY: Math.random() * 8 - 4,
            bubbles: true,
          }));
          await new Promise(rr => setTimeout(rr, 100 + Math.random() * 300));
        }
        const btns = [...document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')];
        const btn = btns.find(b => /devam|continue|verify|doğrula|ileri/i.test(b.textContent + b.value + (b.getAttribute('aria-label') || '')));
        if (!btn) return false;
        btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await new Promise(rr => setTimeout(rr, 300 + Math.random() * 400));
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        await new Promise(rr => setTimeout(rr, 80 + Math.random() * 120));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        btn.click();
        return true;
      },
    }).catch(() => [{ result: false }]);
    if (!r?.[0]?.result) return false;
    await sleep(5000 + Math.random() * 3000);
    return !await checkBotBlockSimple(tabId);
  } catch (_) { return false; }
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

// ─── Hata Kaydı ───────────────────────────────────────────────────────────────
async function logError(site, tip, mesaj) {
  const { errorLog = [] } = await chrome.storage.local.get(['errorLog']);
  errorLog.unshift({ zaman: new Date().toISOString(), site, tip, mesaj });
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
  const jobs       = buildJobs(cities, MAX_PAGES);
  const gunAraligi = cfg.gunAraligi ?? 0;

  console.log(`[EmlakRadar] Başladı — ${cities.join(', ')}`);
  sendProgress(`Başlıyor... ${cities.join(', ')}`);

  const tab   = await createTab(jobs[0].url);
  const tabId = tab.id;
  await setRandomViewport(tabId);
  let toplamYeni = 0;

  try {
    for (const site of SITE_ORDER) {
      if (shouldStop) break;
      const siteJobs = jobs.filter(j => j.site === site);
      if (!siteJobs.length) continue;
      const detailFn = getDetailFn(site);

      // Sahibinden için oturum kontrolü
    if (site === 'sahibinden') {
      let ok = false;
      try { ok = await checkSessionBeforeScrape(); } catch (e) { ok = true; } // crash = devam et
      if (!ok) { sendProgress(`⚠️ Sahibinden atlandı — oturum yok`, 'error'); continue; }
    }

    try {
        for (const job of siteJobs) {
          if (shouldStop) break;
          let nextUrl = job.url;
          let page    = 0;

          // ── Kategori: sayfa sayfa ilerle ─────────────────────────────────
          while (nextUrl && page < (job.maxPages || MAX_PAGES) && !shouldStop) {
            page++;
            sendProgress(`${site} · ${job.kategori} · sayfa ${page} — liste tarıyor...`);

            await navigateTab(tabId, nextUrl);

            if (await checkBotBlock(tabId)) {
              const botMsg = `Bot bloğu/Cloudflare — sayfa atlandı: ${nextUrl}`;
              sendProgress(`⚠️ ${site} bot bloğu — site atlanıyor`, 'error');
              await logError(site, 'bot_block_liste', botMsg);
              nextUrl = null; break;
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
            let botBan = false;
            let detailCount = 0; // bu turda kaç detay açıldı

            for (let i = 0; i < yeniler.length; i++) {
              if (shouldStop || botBan) break;
              const ilan = yeniler[i];
              sendProgress(`${site} · ilan ${i + 1}/${yeniler.length}: ${ilan.baslik?.slice(0, 35)}...`);

              try {
                await navigateTab(tabId, ilan.kaynak_url);

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
                  sendProgress(`⚠️ ${site} bot bloğu — 15dk bekleniyor...`, 'error');
                  await logError(site, 'bot_block', `Detay sayfasında bot bloğu: ${ilan.kaynak_url}`);
                  botBan = true;
                  await sleep(15 * 60 * 1000);
                  botBan = false;
                  sendProgress(`${site}: bekleme bitti, devam ediliyor`);
                  // Bu ilanı tekrar dene
                  i--;
                  continue;
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
                await markGoruldu([full]);
                detailCount++;
                if (wh.eklenen > 0) {
                  toplamYeni++;
                  sendProgress(`✓ ${site} · "${ilan.baslik?.slice(0, 30)}" → siteye eklendi`, 'ok');
                  await notifyNewListings(site, 1, ilan.sehir || job.city);
                } else if (wh.atilan > 0) {
                  sendProgress(`↩ ${site} · "${ilan.baslik?.slice(0, 30)}" → zaten mevcut`);
                } else {
                  sendProgress(`⚠ ${site} · kaydedilemedi`, 'error');
                }

              } catch (err) {
                console.warn('[EmlakRadar] Detay hatası:', err.message);
              }

              if (shouldStop || botBan) break;

              // ── Her 8 ilandan sonra büyük mola (sahibinden pattern kırmak için) ──
              if (detailCount > 0 && detailCount % 8 === 0) {
                const molaSure = 240000 + Math.random() * 120000; // 4-6 dakika
                sendProgress(`${site}: ${detailCount} ilan çekildi — ${Math.round(molaSure/60000)}dk mola (bot önleme)...`);
                await navigateTab(tabId, site === 'sahibinden' ? 'https://www.sahibinden.com' : listSayfasi);
                await sleep(molaSure);
              }

              // ── Detaylar arası: liste sayfasına dön, bekle ──
              if (!shouldStop && !botBan && i < yeniler.length - 1) {
                const bekle = 90000 + Math.random() * 60000; // 1.5-2.5 dakika
                sendProgress(`${site}: liste sayfasına dönüyor, ${Math.round(bekle/1000)}sn sonra devam...`);
                await navigateTab(tabId, listSayfasi);
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
      lastScrapeTime:  new Date().toISOString(),
      lastScrapeCount: toplamYeni,
    });
    const msg = shouldStop ? `Durduruldu — ${toplamYeni} ilan eklendi` : `Tamamlandı — ${toplamYeni} ilan eklendi`;
    sendProgress(msg, 'done');
    console.log(`[EmlakRadar] ${msg}`);
  }
}

// ─── Job Listesi ──────────────────────────────────────────────────────────────
function buildJobs(cities, maxPages) {
  const jobs = [];
  for (const city of cities) {
    // Sahibinden
    for (const k of [
      { slug: 'satilik-daire',       tip: 'satilik', kategori: 'daire' },
      { slug: 'kiralik-daire',       tip: 'kiralik', kategori: 'daire' },
      { slug: 'satilik-arsa',        tip: 'satilik', kategori: 'arsa' },
      { slug: 'satilik-mustakil-ev', tip: 'satilik', kategori: 'mustakil' },
      { slug: 'satilik-villa',       tip: 'satilik', kategori: 'villa' },
    ]) {
      const yol = city === 'istanbul' ? `/${k.slug}` : `/${k.slug}/${city}`;
      jobs.push({ site: 'sahibinden', url: `https://www.sahibinden.com${yol}`, ...k, city, maxPages });
    }
    // Hepsiemlak
    for (const k of [
      { slug: `${city}-satilik/daire`, tip: 'satilik', kategori: 'daire' },
      { slug: `${city}-kiralik/daire`, tip: 'kiralik', kategori: 'daire' },
      { slug: `${city}-satilik/arsa`,  tip: 'satilik', kategori: 'arsa' },
    ]) {
      jobs.push({ site: 'hepsiemlak', url: `https://www.hepsiemlak.com/${k.slug}`, ...k, city, maxPages });
    }
    // Emlakjet
    for (const k of [
      { slug: 'satilik-daire', tip: 'satilik', kategori: 'daire' },
      { slug: 'kiralik-daire', tip: 'kiralik', kategori: 'daire' },
      { slug: 'satilik-arsa',  tip: 'satilik', kategori: 'arsa' },
    ]) {
      jobs.push({ site: 'emlakjet', url: `https://www.emlakjet.com/${k.slug}/${city}/`, ...k, city, maxPages });
    }
  }
  return jobs;
}

// ─── Sekme Yardımcıları ───────────────────────────────────────────────────────
async function setRandomViewport(tabId) {
  const sizes = [
    { w: 1280, h: 720 }, { w: 1366, h: 768 }, { w: 1440, h: 900 },
    { w: 1536, h: 864 }, { w: 1600, h: 900 }, { w: 1920, h: 1080 },
  ];
  const { w, h } = sizes[Math.floor(Math.random() * sizes.length)];
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { width: w, height: h });
  } catch (_) {}
}

function createTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, tab => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      function onUpdated(tabId, info) {
        if (tabId !== tab.id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve(tab);
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

function navigateTab(tabId, url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url }, () => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      function onUpdated(updatedId, info) {
        if (updatedId !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
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
      throw new Error(`HTTP ${res.status}: ${txt.substring(0, 200)}`);
    }
    const json = await res.json().catch(() => ({}));
    console.log('[EmlakRadar] Webhook yanıtı:', json);
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

// Tüm content script'lerin kullandığı gerçekçi scroll fonksiyonu
async function humanScroll() {
  const total  = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  const step   = () => 100 + Math.random() * 120;   // 100–220px her adım
  const pause  = () => 60  + Math.random() * 100;   // 60–160ms normal bekleme
  const longP  = () => 700 + Math.random() * 1200;  // 0.7–1.9s okuma molası
  let pos = 0;

  while (pos < total - 200) {
    pos += step();
    window.scrollTo(0, Math.min(pos, total));
    if (Math.random() < 0.12) await new Promise(r => setTimeout(r, longP())); // okuma molası
    else                       await new Promise(r => setTimeout(r, pause()));
    // Zaman zaman biraz geri çekil (insan davranışı)
    if (Math.random() < 0.08) {
      pos -= 150 + Math.random() * 250;
      window.scrollTo(0, Math.max(0, pos));
      await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    }
  }

  // En alta bak, sonra yukarı dön
  await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 300));
}

async function sahibindenScript(tip, kategori, city) {
  const BASE = 'https://www.sahibinden.com';

  async function simulateMousePresence() {
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));
    const moves = 6 + Math.floor(Math.random() * 8);
    for (let i = 0; i < moves; i++) {
      window.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 100 + Math.random() * (window.innerWidth - 200),
        clientY: 100 + Math.random() * (window.innerHeight - 200),
        movementX: Math.random() * 12 - 6, movementY: Math.random() * 10 - 5, bubbles: true,
      }));
      await new Promise(r => setTimeout(r, 150 + Math.random() * 600));
    }
  }

  async function occasionalKeyPress() {
    if (Math.random() > 0.05) return;
    const k = [{ key: 'Tab', code: 'Tab' }, { key: 'ArrowDown', code: 'ArrowDown' }, { key: 'Escape', code: 'Escape' }];
    const chosen = k[Math.floor(Math.random() * k.length)];
    document.dispatchEvent(new KeyboardEvent('keydown', { key: chosen.key, code: chosen.code, bubbles: true }));
    await new Promise(r => setTimeout(r, 60 + Math.random() * 100));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: chosen.key, code: chosen.code, bubbles: true }));
  }

  async function waitFor(selector, ms = 30000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelectorAll(selector).length > 0) return true;
      await new Promise(r => setTimeout(r, 1500));
    }
    return false;
  }

  async function quickScroll() {
    const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += 300) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 300));
  }

  const found = await waitFor('tr.searchResultsItem');
  if (!found) {
    chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar: [], nextUrl: null });
    return;
  }

  await simulateMousePresence();
  await occasionalKeyPress();
  await quickScroll();

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
    const step  = () => 100 + Math.random() * 120;
    const pause = () => 60  + Math.random() * 100;
    const longP = () => 700 + Math.random() * 1200;
    let pos = 0;
    while (pos < total - 200) {
      pos += step(); window.scrollTo(0, Math.min(pos, total));
      if (Math.random() < 0.12) await new Promise(r => setTimeout(r, longP()));
      else                       await new Promise(r => setTimeout(r, pause()));
      if (Math.random() < 0.08) { pos -= 150 + Math.random() * 250; window.scrollTo(0, Math.max(0, pos)); await new Promise(r => setTimeout(r, 350)); }
    }
    await new Promise(r => setTimeout(r, 500)); window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 300));
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
  // Mouse varlığı
  (async () => {
    for (let i = 0; i < 6; i++) {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + Math.random() * 800, clientY: 100 + Math.random() * 500, bubbles: true }));
      await new Promise(r => setTimeout(r, 200 + Math.random() * 500));
    }
  })();
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
    const step  = () => 100 + Math.random() * 120;
    const pause = () => 60  + Math.random() * 100;
    const longP = () => 700 + Math.random() * 1200;
    let pos = 0;
    while (pos < total - 200) {
      pos += step(); window.scrollTo(0, Math.min(pos, total));
      if (Math.random() < 0.12) await new Promise(r => setTimeout(r, longP()));
      else                       await new Promise(r => setTimeout(r, pause()));
      if (Math.random() < 0.08) { pos -= 150 + Math.random() * 250; window.scrollTo(0, Math.max(0, pos)); await new Promise(r => setTimeout(r, 350)); }
    }
    await new Promise(r => setTimeout(r, 500)); window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 300));
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
  // Mouse varlığı
  (async () => {
    for (let i = 0; i < 6; i++) {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + Math.random() * 800, clientY: 100 + Math.random() * 500, bubbles: true }));
      await new Promise(r => setTimeout(r, 200 + Math.random() * 500));
    }
  })();
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
  // ─── Yardımcılar ────────────────────────────────────────────────────────────
  async function simulateMousePresence() {
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    const moves = 8 + Math.floor(Math.random() * 10);
    for (let i = 0; i < moves; i++) {
      window.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 80 + Math.random() * (window.innerWidth - 160),
        clientY: 80 + Math.random() * (window.innerHeight - 160),
        movementX: Math.random() * 14 - 7, movementY: Math.random() * 12 - 6, bubbles: true,
      }));
      await new Promise(r => setTimeout(r, 100 + Math.random() * 500));
    }
  }

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
    const step  = () => 110 + Math.random() * 110;
    const pause = () => 70  + Math.random() * 100;
    const longP = () => 600 + Math.random() * 1000;
    let pos = 0;
    while (pos < total - 200) {
      pos += step(); window.scrollTo(0, Math.min(pos, total));
      if (Math.random() < 0.1) await new Promise(r => setTimeout(r, longP()));
      else                      await new Promise(r => setTimeout(r, pause()));
      if (Math.random() < 0.07) { pos -= 150 + Math.random() * 200; window.scrollTo(0, Math.max(0, pos)); await new Promise(r => setTimeout(r, 300)); }
    }
    await new Promise(r => setTimeout(r, 400)); window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));
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
  await simulateMousePresence(); // Mouse varlığı oluştur
  await new Promise(r => setTimeout(r, 1500)); // JS render tamamlansın

  // Lazy load tetiklemek için hızlı scroll (bot algısı için değil, sadece görüntü yükleme)
  const pageH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  for (let y = 0; y < pageH; y += 300) {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 80));
  }
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 800)); // Lazy load tamamlansın

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
    let pos = 0;
    while (pos < total - 200) {
      pos += 110 + Math.random() * 110; window.scrollTo(0, Math.min(pos, total));
      if (Math.random() < 0.1) await new Promise(r => setTimeout(r, 700 + Math.random() * 900));
      else                      await new Promise(r => setTimeout(r, 70 + Math.random() * 100));
    }
    await new Promise(r => setTimeout(r, 400)); window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));
  }

  await waitFor();
  await new Promise(r => setTimeout(r, 1500));

  const pageH2 = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  for (let y = 0; y < pageH2; y += 300) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); }
  window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 800));

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
    let pos = 0;
    while (pos < total - 200) {
      pos += 110 + Math.random() * 110; window.scrollTo(0, Math.min(pos, total));
      if (Math.random() < 0.1) await new Promise(r => setTimeout(r, 700 + Math.random() * 900));
      else                      await new Promise(r => setTimeout(r, 70 + Math.random() * 100));
    }
    await new Promise(r => setTimeout(r, 400)); window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));
  }

  await waitFor();
  await new Promise(r => setTimeout(r, 1500));

  const pageH3 = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  for (let y = 0; y < pageH3; y += 300) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); }
  window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 800));

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
