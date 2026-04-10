'use strict';
/**
 * EmlakRadar Chrome Extension — Background Service Worker
 * Tek sekme mimarisi + detay sayfası scraper + canlı log
 */

// ─── Sabit Yapılandırma (hardcoded) ──────────────────────────────────────────
const API_URL        = 'https://hetagayrimenkul.com/api/webhook.php';
const WEBHOOK_SECRET = 'HetagScraper2024!xK9mPqR7wZn';
const DEFAULT_CITIES = 'canakkale';
const MAX_PAGES      = 999; // Tüm sayfaları tara

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
function sendProgress(msg, type = 'info', site = null) {
  const ts = Date.now();
  // Genel progress (eski uyumluluk)
  chrome.storage.local.set({ progress: { msg, type, ts } });
  // Site bazlı progress
  if (site) {
    chrome.storage.local.get(['siteProgress'], data => {
      const sp = data.siteProgress || {};
      sp[site] = { msg, type, ts };
      chrome.storage.local.set({ siteProgress: sp });
    });
  }
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

// ─── CDP Mouse Simulasyonu (isTrusted=true) ─────────────────────────────────
// chrome.debugger + CDP Input.dispatchMouseEvent → gerçek mouse event'leri üretir
// Minimized pencerede debug bar görünmez

// Bézier eğrisi ile doğal mouse yolu üret
function bezierMousePath(x0, y0, x1, y1) {
  const points = [];
  // 1-2 kontrol noktası ile eğri
  const cx1 = x0 + (x1 - x0) * (0.2 + Math.random() * 0.3);
  const cy1 = y0 + (Math.random() - 0.5) * 200;
  const cx2 = x0 + (x1 - x0) * (0.5 + Math.random() * 0.3);
  const cy2 = y1 + (Math.random() - 0.5) * 150;
  const steps = 8 + Math.floor(Math.random() * 12); // 8-19 adım
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    // Kübik bézier: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
    const x = Math.round(u*u*u*x0 + 3*u*u*t*cx1 + 3*u*t*t*cx2 + t*t*t*x1);
    const y = Math.round(u*u*u*y0 + 3*u*u*t*cy1 + 3*u*t*t*cy2 + t*t*t*y1);
    // Hız: başta ve sonda yavaş, ortada hızlı (ease-in-out)
    const speed = Math.sin(t * Math.PI); // 0→1→0 eğrisi
    const delay = Math.max(8, Math.round((1 - speed * 0.7) * (30 + Math.random() * 40)));
    points.push({ x, y, delay });
  }
  return points;
}

// Rastgele doğal mouse hareketi dizisi üret
function generateMouseSession(viewportW = 1280, viewportH = 800) {
  const movements = [];
  // 2-4 hareket segmenti
  const segments = 2 + Math.floor(Math.random() * 3);
  let curX = 100 + Math.floor(Math.random() * (viewportW - 200));
  let curY = 100 + Math.floor(Math.random() * (viewportH - 200));

  for (let s = 0; s < segments; s++) {
    // Hedef: sayfanın farklı bölgeleri (liste, sidebar, header)
    const targetX = 50 + Math.floor(Math.random() * (viewportW - 100));
    const targetY = 50 + Math.floor(Math.random() * (viewportH - 100));
    const path = bezierMousePath(curX, curY, targetX, targetY);
    movements.push(...path);
    // Segment arası duraklama (okuyor gibi)
    movements.push({ x: targetX, y: targetY, delay: 300 + Math.floor(Math.random() * 1500) });
    curX = targetX;
    curY = targetY;
  }
  return movements;
}

// CDP ile ilan kartına gerçek click → isTrusted=true click + doğal Referer
async function navigateViaClickCDP(tabId, targetUrl, timeoutMs = 45000) {
  // 1. Linkin pozisyonunu bul
  const posResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: (url) => {
      const pathname = new URL(url).pathname;
      const allLinks = document.querySelectorAll('a[href]');
      for (const a of allLinks) {
        const h = a.getAttribute('href') || '';
        if (h === url || h.endsWith(pathname) || url.endsWith(h)) {
          const rect = a.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return {
              x: Math.round(rect.left + rect.width * (0.2 + Math.random() * 0.6)),
              y: Math.round(rect.top + rect.height * (0.2 + Math.random() * 0.6)),
              found: true,
            };
          }
        }
      }
      return { found: false };
    },
    args: [targetUrl],
  }).catch(() => [{ result: { found: false } }]);

  const pos = posResult?.[0]?.result;
  if (!pos?.found) {
    // Link bulunamadı → fallback eski yönteme
    return navigateViaClick(tabId, targetUrl, timeoutMs);
  }

  // 2. Page load bekle promise
  const loadPromise = new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, timeoutMs);
    function onUpdated(updatedId, info) {
      if (updatedId !== tabId || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });

  // 3. CDP: Bézier ile mouse'u elemente götür + click
  let attached = false;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached = true;

    // Rastgele bir başlangıç noktasından hedefe Bézier yol
    const startX = 100 + Math.floor(Math.random() * 300);
    const startY = 50 + Math.floor(Math.random() * 200);
    const path = bezierMousePath(startX, startY, pos.x, pos.y);

    for (const m of path) {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: m.x, y: m.y, button: 'none', modifiers: 0,
      });
      await sleep(m.delay);
    }

    // Hover duraklama (insan gibi)
    await sleep(80 + Math.floor(Math.random() * 250));

    // mousePressed + mouseReleased = click
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x: pos.x, y: pos.y, button: 'left',
      clickCount: 1, modifiers: 0,
    });
    await sleep(40 + Math.floor(Math.random() * 80));
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left',
      clickCount: 1, modifiers: 0,
    });
  } catch (e) {
    // CDP hata → fallback
    if (attached) try { await chrome.debugger.detach({ tabId }); } catch (_) {}
    return navigateViaClick(tabId, targetUrl, timeoutMs);
  } finally {
    if (attached) try { await chrome.debugger.detach({ tabId }); } catch (_) {}
  }

  // 4. Sayfa yüklenmesini bekle
  await loadPromise;
}

// CDP ile rastgele klavye eventleri (isTrusted=true)
// debugger zaten attach edilmiş olmalı — { tabId } ve attached flag dışarıdan gelir
async function simulateKeyboardCDP(target, isAttached) {
  if (!isAttached) return;
  try {
    // Rastgele 1-3 klavye aksiyonu
    const actions = 1 + Math.floor(Math.random() * 3);
    const keys = [
      { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
      { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
      { key: ' ', code: 'Space', keyCode: 32 },         // space scroll
      { key: 'Tab', code: 'Tab', keyCode: 9 },
      { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
      { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
      { key: 'End', code: 'End', keyCode: 35 },
      { key: 'Home', code: 'Home', keyCode: 36 },
    ];
    for (let i = 0; i < actions; i++) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyDown', key: k.key, code: k.code,
        windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode,
      });
      await sleep(30 + Math.floor(Math.random() * 80));
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyUp', key: k.key, code: k.code,
        windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode,
      });
      await sleep(200 + Math.floor(Math.random() * 600));
    }
  } catch (_) {}
}

// CDP üzerinden mouse hareketi gönder (isTrusted=true)
async function simulateMouseCDP(tabId) {
  let attached = false;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached = true;
    const movements = generateMouseSession();
    for (const m of movements) {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: m.x,
        y: m.y,
        button: 'none',
        modifiers: 0,
      });
      await sleep(m.delay);
    }
    // Bazen rastgele bir yere hafif hover
    if (Math.random() < 0.3) {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: 400 + Math.floor(Math.random() * 400),
        y: 300 + Math.floor(Math.random() * 300), button: 'none',
      });
    }
    // Rastgele klavye eventleri (liste sayfasında da)
    if (Math.random() < 0.5) await simulateKeyboardCDP({ tabId }, attached);
  } catch (e) {
    // Sessiz hata — debugger zaten bağlı veya tab kapalı olabilir
  } finally {
    if (attached) {
      try { await chrome.debugger.detach({ tabId }); } catch (_) {}
    }
  }
}

// CDP ile detay sayfasında insan davranışı simülasyonu: scroll + mouse + hover
async function simulateDetailBrowseCDP(tabId) {
  let attached = false;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached = true;

    // 1. Fotoğraf alanına mouse götür (sayfanın üst kısmı)
    const photoX = 300 + Math.floor(Math.random() * 400);
    const photoY = 200 + Math.floor(Math.random() * 200);
    const pathToPhoto = bezierMousePath(
      100 + Math.floor(Math.random() * 200), 50 + Math.floor(Math.random() * 100),
      photoX, photoY
    );
    for (const m of pathToPhoto) {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: m.x, y: m.y, button: 'none', modifiers: 0,
      });
      await sleep(m.delay);
    }
    // Fotoğrafa bakıyor gibi duraklama
    await sleep(500 + Math.floor(Math.random() * 1500));

    // 1b. Fotoğrafa tıkla (%60 ihtimal — galeri açma)
    if (Math.random() < 0.6) {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mousePressed', x: photoX, y: photoY, button: 'left', clickCount: 1, modifiers: 0,
      });
      await sleep(30 + Math.floor(Math.random() * 60));
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: photoX, y: photoY, button: 'left', clickCount: 1, modifiers: 0,
      });
      await sleep(800 + Math.floor(Math.random() * 2000));
      // Galeri açıldıysa sağ ok ile 1-3 fotoğraf gezdir
      const photoClicks = 1 + Math.floor(Math.random() * 3);
      for (let p = 0; p < photoClicks; p++) {
        const nextX = 700 + Math.floor(Math.random() * 200);
        const nextY = 350 + Math.floor(Math.random() * 100);
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: nextX, y: nextY, button: 'left', clickCount: 1, modifiers: 0,
        });
        await sleep(30 + Math.floor(Math.random() * 50));
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: nextX, y: nextY, button: 'left', clickCount: 1, modifiers: 0,
        });
        await sleep(600 + Math.floor(Math.random() * 1500));
      }
      // Escape veya dışarı tıkla ile galeriyi kapat
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
      });
      await sleep(30);
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
      });
      await sleep(300 + Math.floor(Math.random() * 500));
    }

    // 2. Aşağı scroll — açıklamayı okuyor gibi (2-4 scroll adımı)
    const scrollSteps = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < scrollSteps; i++) {
      const scrollY = 150 + Math.floor(Math.random() * 250);
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: photoX, y: 400, deltaX: 0, deltaY: scrollY,
        button: 'none', modifiers: 0,
      });
      // Okuma duraklama
      await sleep(400 + Math.floor(Math.random() * 1200));

      // Bazen mouse hareket ettir (satır takibi)
      if (Math.random() < 0.5) {
        const readX = 200 + Math.floor(Math.random() * 500);
        const readY = 300 + Math.floor(Math.random() * 200);
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: readX, y: readY, button: 'none', modifiers: 0,
        });
        await sleep(200 + Math.floor(Math.random() * 400));
      }
    }

    // 3. Telefon numarası butonuna tıkla (%40 ihtimal)
    if (Math.random() < 0.4) {
      // Sahibinden'de "Telefonu Göster" butonu genelde sağ sidebar'da
      const telX = 900 + Math.floor(Math.random() * 150);
      const telY = 350 + Math.floor(Math.random() * 100);
      const pathToTel = bezierMousePath(photoX, 400, telX, telY);
      for (const m of pathToTel) {
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: m.x, y: m.y, button: 'none', modifiers: 0,
        });
        await sleep(m.delay);
      }
      await sleep(100 + Math.floor(Math.random() * 300));
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mousePressed', x: telX, y: telY, button: 'left', clickCount: 1, modifiers: 0,
      });
      await sleep(30 + Math.floor(Math.random() * 60));
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: telX, y: telY, button: 'left', clickCount: 1, modifiers: 0,
      });
      await sleep(500 + Math.floor(Math.random() * 1000));
    }

    // 4. Bazen tekrar yukarı scroll (fotoğrafa geri dönüyor)
    if (Math.random() < 0.3) {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: photoX, y: 400, deltaX: 0, deltaY: -(200 + Math.floor(Math.random() * 300)),
        button: 'none', modifiers: 0,
      });
      await sleep(300 + Math.floor(Math.random() * 700));
    }

    // 5. Rastgele klavye eventleri (gerçek kullanıcı davranışı)
    await simulateKeyboardCDP({ tabId }, attached);
  } catch (e) {
    // Sessiz hata
  } finally {
    if (attached) try { await chrome.debugger.detach({ tabId }); } catch (_) {}
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

// registerStealthScript kaldırıldı: manifest.json content_scripts kaydı yeterli.
// Duplicate kayıt SW restart sonrası race condition yaratıyordu.

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
  }
  await scheduleNextScrape();
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
      'lastScrapeTime', 'lastScrapeCount', 'lastError', 'progress', 'siteProgress', 'isRunning', 'seenIds',
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
               txt.includes('bağlantınız kontrol') || txt.includes('basılı tutun') ||
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
                     txt.includes('bağlantınız kontrol') || txt.includes('basılı tutun') ||
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
        if (txt.includes('tarayıcınızı kontrol') || txt.includes('checking your browser') || txt.includes('just a moment') || txt.includes('bağlantınız kontrol') || txt.includes('basılı tutun')) {
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

// Sahibinden en sona — bot koruması en sıkı olan site, banlıysa diğerlerini etkilemesin
const SITE_ORDER = ['hepsiemlak', 'emlakjet', 'sahibinden'];

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

let currentRunId = 0; // Her run'a benzersiz ID — eski run otomatik geçersiz olur

async function runAllScrapers(force = false) {
  if (isRunning && !force) { console.log('[EmlakRadar] Zaten çalışıyor, atlandı'); return; }
  if (isRunning && force)  {
    console.log('[EmlakRadar] Force, önceki tur durduruluyor...');
    shouldStop = true;
    currentRunId++; // Eski run'ı geçersiz kıl
    // Önceki run'ın durmasını bekle
    await new Promise(r => setTimeout(r, 3000));
    isRunning = false;
  }
  shouldStop = false;
  return waitUntil(_runAllScrapersInner(force));
}

async function _runAllScrapersInner(force = false) {
  const cfg = await getConfig();
  if (!force && !cfg.enabled) return;

  const myRunId = currentRunId; // Bu run'ın ID'si
  const isStale = () => shouldStop || currentRunId !== myRunId; // Eski run mu kontrol

  isRunning = true;
  await chrome.storage.local.set({ isRunning: true, lastError: '', siteProgress: {} });

  const MAX_DETAILS_PER_SITE = {
    sahibinden: 12,
    hepsiemlak: 150,
    emlakjet:   150,
  };
  const siteDetailCount = { sahibinden: 0, hepsiemlak: 0, emlakjet: 0 };
  const seenThisRun = new Set(); // Tur içi mükerrer engeli
  const crossSiteMap = new Map(); // fp → { site, fiyat, baslik } — cross-site dedup + fiyat karşılaştırma

  // Cross-site dedup: başlık + konum + m² + oda sayısı (fiyat HARİÇ — fiyat farkını yakalamak için)
  function ilanFingerprint(ilan) {
    const baslik = (ilan.baslik || '').toLowerCase().replace(/[^a-zçğıöşü0-9]/g, '');
    const konum = (ilan.adres || ilan.konum_text || ilan.lokasyon || '').toLowerCase().replace(/[^a-zçğıöşü0-9]/g, '');
    const m2 = String(ilan.metrekare || '').replace(/[^\d]/g, '');
    const oda = (ilan.oda_sayisi || '').replace(/\s/g, '');
    if (!baslik || baslik.length < 10) return null;
    return `${baslik}_${konum}_${m2}_${oda}`;
  }

  const cities     = cfg.cities.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
  const jobs       = await buildJobs(cities, MAX_PAGES);
  const gunAraligi = cfg.gunAraligi ?? 0;

  console.log(`[EmlakRadar] Başladı — ${cities.join(', ')}`);
  sendProgress(`Başlıyor... ${cities.join(', ')}`);

  const homeUrls = { sahibinden: 'https://www.sahibinden.com', hepsiemlak: 'https://www.hepsiemlak.com', emlakjet: 'https://www.emlakjet.com' };
  let toplamYeni = 0;
  const allTabIds = [];
  // Adaptif hız: response süresi artarsa delay çarpanı artar
  let sahibindenDelayMultiplier = 1.0;

  // ── Tek site tarama fonksiyonu (kendi sekmesinde çalışır) ─────────────
  async function scrapeSite(site, sTabId, siteJobs) {
    const detailFn = getDetailFn(site);
    const isFast = site !== 'sahibinden';
    let siteBanned = false;
    const allSeenIds = new Set(); // Sitede görülen TÜM ilan ID'leri (kaldırılmış tespiti için)
    let totalPagesCompleted = 0;
    let totalPagesExpected = 0;
    let completedAllPages = true; // Tüm sayfalar başarıyla tarandı mı?
    let totalFiyatDegisen = 0;

    for (const job of siteJobs) {
      if (isStale() || siteBanned) { completedAllPages = false; break; }
      let nextUrl = job.url;
      let page = 0;

      while (nextUrl && page < (job.maxPages || MAX_PAGES) && !isStale() && !siteBanned) {
        page++;
        totalPagesExpected++;
        sendProgress(`${job.kategori} · sayfa ${page} — liste tarıyor...`, 'info', site);
        console.log(`[EmlakRadar] ${site} · ${job.kategori} · sayfa ${page} — URL: ${nextUrl}`);
        const navStart = Date.now();
        await navigateTab(sTabId, nextUrl);
        const navTime = Date.now() - navStart;
        // Adaptif hız: sahibinden response süresi 10s'den uzunsa → yavaşla
        if (!isFast && navTime > 10000) {
          sahibindenDelayMultiplier = Math.min(3.0, sahibindenDelayMultiplier + 0.3);
          console.log(`[EmlakRadar] Sahibinden yavaş yanıt (${Math.round(navTime/1000)}s) → delay x${sahibindenDelayMultiplier.toFixed(1)}`);
        } else if (!isFast && navTime < 5000 && sahibindenDelayMultiplier > 1.0) {
          sahibindenDelayMultiplier = Math.max(1.0, sahibindenDelayMultiplier - 0.1);
        }
        const baseDelay = isFast ? gaussianDelay(2000, 4000) : gaussianDelay(3500, 7000);
        await sleep(isFast ? baseDelay : Math.round(baseDelay * sahibindenDelayMultiplier));
        // Sahibinden: CDP mouse simulasyonu (isTrusted=true)
        if (!isFast) await simulateMouseCDP(sTabId);

        if (await checkBotBlock(sTabId)) {
          sendProgress(`bot bloğu — site atlanıyor`, 'error', site);
          await logError(site, 'bot_block_liste', `Bot bloğu: ${nextUrl}`);
          // Ban yediyse uzun bekleme yap, hemen çıkma
          if (!isFast) {
            sahibindenDelayMultiplier = 3.0;
            const banWait = gaussianDelay(300000, 600000); // 5-10 dakika
            sendProgress(`ban — ${Math.round(banWait/60000)}dk bekleniyor...`, 'error', site);
            await sleep(banWait);
          }
          siteBanned = true; completedAllPages = false; break;
        }

        const pageResult = await injectOnce(sTabId, job);
        // Aynı sayfada duplikasyon olabilir (öne çıkan + normal liste) — kaynak_id ile dedup
        const rawIlanlar = (pageResult.ilanlar || []).map(validateListing).filter(Boolean);
        const pageSeenIds = new Set();
        const ilanlar = rawIlanlar.filter(i => {
          if (pageSeenIds.has(i.kaynak_id)) return false;
          pageSeenIds.add(i.kaynak_id);
          return true;
        });
        nextUrl = pageResult.nextUrl || null;
        totalPagesCompleted++;

        // Tüm ilanları takip et (kaldırılmış ilan tespiti için)
        for (const i of ilanlar) allSeenIds.add(i.kaynak_id);

        console.log(`[EmlakRadar] ${site} · sayfa ${page}: ${ilanlar.length} ilan, nextUrl: ${nextUrl ? nextUrl.substring(0, 80) : 'YOK'}`);
        sendProgress(`${job.kategori} · sayfa ${page}: ${ilanlar.length} ilan bulundu`, 'info', site);
        if (ilanlar.length === 0 && !isStale()) await logError(site, 'selector_0', `${job.kategori} sayfa ${page} — 0 ilan`);
        await checkSelectorHealth(site, ilanlar.length);

        // ── TÜM ilanlar için sunucu kontrolü + fiyat heartbeat (tek çağrı) ──
        let serverMevcutIds = new Set();
        if (ilanlar.length > 0) {
          const { mevcutIds, fiyatlar } = await checkServerIds(ilanlar);
          serverMevcutIds = mevcutIds;
          if (mevcutIds.size > 0) {
            const serverMevcut = ilanlar.filter(i => mevcutIds.has(i.kaynak_id));
            await markGoruldu(serverMevcut);

            // Fiyat değişiklik tespiti: liste sayfasındaki fiyat vs sunucudaki fiyat
            const fiyatDegisenler = serverMevcut.filter(i => {
              const sunucuFiyat = fiyatlar[i.kaynak_id];
              const scrapeFiyat = parseFloat(i.fiyat) || 0;
              if (!sunucuFiyat || sunucuFiyat <= 0 || scrapeFiyat <= 0) return false;
              return Math.abs(scrapeFiyat - sunucuFiyat) / sunucuFiyat > 0.01;
            });
            if (fiyatDegisenler.length > 0) {
              totalFiyatDegisen += fiyatDegisenler.length;
              console.log(`[EmlakRadar] ${site} · ${fiyatDegisenler.length} fiyat değişikliği tespit edildi`);
              sendProgress(`${fiyatDegisenler.length} fiyat değişikliği tespit edildi`, 'info', site);
            }

            // Toplu görüldü heartbeat — son_gorunme + fiyat değişiklik gönder
            await sendGoruldu(serverMevcut, site);
          }
        }

        // ── Yeni ilan filtresi (detay sayfasına girilecekler) ──────────
        let yeniler = await filterYeni(ilanlar);
        console.log(`[EmlakRadar] ${site} · sayfa ${page}: filterYeni=${yeniler.length}, seenThisRun filtre öncesi`);
        yeniler = yeniler.filter(i => !seenThisRun.has(i.kaynak_id));
        console.log(`[EmlakRadar] ${site} · sayfa ${page}: seenThisRun sonrası=${yeniler.length}`);
        // Cross-site dedup
        const crossBefore = yeniler.length;
        yeniler = yeniler.filter(i => {
          const fp = ilanFingerprint(i);
          if (!fp) return true;
          const existing = crossSiteMap.get(fp);
          if (!existing) return true;
          if (i.fiyat && existing.fiyat && i.fiyat !== existing.fiyat) {
            const fark = i.fiyat - existing.fiyat;
            const yuzde = ((fark / existing.fiyat) * 100).toFixed(1);
            console.log(`[EmlakRadar] Fiyat farkı: "${i.baslik?.slice(0, 40)}" — ${existing.site}: ${existing.fiyat.toLocaleString('tr')} TL, ${site}: ${i.fiyat.toLocaleString('tr')} TL (${fark > 0 ? '+' : ''}${yuzde}%)`);
            sendProgress(`💰 Fiyat farkı: ${existing.site} ${existing.fiyat.toLocaleString('tr')}₺ vs ${i.fiyat.toLocaleString('tr')}₺ (${fark > 0 ? '+' : ''}${yuzde}%)`, 'info', site);
          }
          return false;
        });
        if (crossBefore - yeniler.length > 0) sendProgress(`${crossBefore - yeniler.length} ilan diğer sitede mevcut, atlandı`, 'info', site);
        if (gunAraligi > 0) yeniler = yeniler.filter(i => !i.ilan_tarihi || ilanGunFarki(i.ilan_tarihi) <= gunAraligi);

        // Sunucuda zaten mevcut olanları çıkar (yukarıdaki checkServerIds sonucunu kullan — tekrar çağırma)
        if (serverMevcutIds.size > 0) {
          const serverMevcutYeni = yeniler.filter(i => serverMevcutIds.has(i.kaynak_id));
          if (serverMevcutYeni.length > 0) {
            await markGoruldu(serverMevcutYeni);
            yeniler = yeniler.filter(i => !serverMevcutIds.has(i.kaynak_id));
            sendProgress(`${serverMevcutYeni.length} ilan sunucuda mevcut, atlandı`, 'info', site);
          }
        }

        sendProgress(`sayfa ${page}: ${ilanlar.length} ilan, ${yeniler.length} yeni`, 'info', site);

        console.log(`[EmlakRadar] ${site} · sayfa ${page}: checkServerIds sonrası=${yeniler.length} detaya girilecek`);
        sendProgress(`sayfa ${page}: ${yeniler.length} yeni ilan detaya girilecek`, 'info', site);
        const listSayfasi = nextUrl || job.url;
        let detailCount = 0;

        for (let i = 0; i < yeniler.length; i++) {
          if (isStale() || siteBanned) break;
          const siteMax = MAX_DETAILS_PER_SITE[site] || 25;
          if (siteDetailCount[site] >= siteMax) { sendProgress(`session limiti doldu`, 'info', site); break; }

          const ilan = yeniler[i];
          sendProgress(`ilan ${i + 1}/${yeniler.length}: ${ilan.baslik?.slice(0, 35)}...`, 'info', site);

          if (isStale()) break; // Detay navigasyonu öncesi son kontrol
          try {
            // Hepsiemlak: tam page reload gerekli (SPA __NUXT__ eski veriyi tutar)
            if (site === 'hepsiemlak') {
              await navigateTab(sTabId, ilan.kaynak_url);
            } else if (site === 'sahibinden' && !isFast) {
              // CDP ile gerçek click → isTrusted=true + doğal Referer
              await navigateViaClickCDP(sTabId, ilan.kaynak_url);
            } else {
              await navigateViaClick(sTabId, ilan.kaynak_url);
            }
            await sleep(isFast ? gaussianDelay(1500, 3000) : gaussianDelay(2000, 4000));

            const pageState = await chrome.scripting.executeScript({
              target: { tabId: sTabId },
              func: () => {
                const txt = document.body?.textContent || '';
                const url = location.href;
                if (txt.includes('bulunamıyor') || url.includes('404') || document.title.includes('404')) return { status: 'not_found' };
                if (txt.includes('Olağan dışı') || url.includes('olagan-disi')) return { status: 'bot_ban' };
                // İçerik uzunluğunu ölç — kalma süresini belirler
                const desc = document.querySelector('.classifiedDescription, .description, [class*="description"], .classified-desc')?.textContent || '';
                const imgCount = document.querySelectorAll('.classifiedDetailPhoto img, .gallery img, [class*="gallery"] img, [class*="slider"] img').length;
                return { status: 'ok', contentLen: desc.length, imgCount };
              },
            }).catch(() => [{ result: { status: 'ok', contentLen: 200, imgCount: 3 } }]);
            const pageInfo = pageState?.[0]?.result || { status: 'ok', contentLen: 200, imgCount: 3 };

            if (pageInfo.status === 'not_found') { await markGoruldu([ilan]); continue; }
            if (pageInfo.status === 'bot_ban') { siteBanned = true; break; }

            // Sahibinden detay: insan gibi scroll + click + hover (bot algılama savunması)
            if (site === 'sahibinden' && !isFast) await simulateDetailBrowseCDP(sTabId);

            // İçeriğe göre dinamik kalma süresi: uzun açıklama/çok fotoğraf = daha uzun bekleme
            if (!isFast && site === 'sahibinden') {
              const cLen = pageInfo.contentLen || 200;
              const imgs = pageInfo.imgCount || 3;
              // Baz: 1.5s + her 200 karakter için +0.5s + her fotoğraf için +0.3s (max 8s ekstra)
              const readTime = Math.min(8000, (cLen / 200) * 500 + imgs * 300);
              await sleep(1500 + Math.floor(readTime + Math.random() * 2000));
            }

            const detail = await injectDetail(sTabId, detailFn, site);
            if (isStale()) break; // Eski run ise webhook gönderme
            const full = {
              ...ilan,
              aciklama: detail.aciklama || '', fotograflar: detail.fotograflar?.length ? detail.fotograflar : ilan.fotograflar,
              oda_sayisi: detail.oda_sayisi || ilan.oda_sayisi, metrekare: detail.metrekare || ilan.metrekare,
              kat: detail.kat || ilan.kat, bina_yasi: detail.bina_yasi || ilan.bina_yasi,
              isitma: detail.isitma || ilan.isitma, banyo: detail.banyo || ilan.banyo,
              satici_ad: detail.satici_ad || ilan.satici_ad, satici_tel: detail.satici_tel || ilan.satici_tel,
              konum: detail.konum || ilan.konum,
            };

            const wh = await sendWebhook([full], cfg);
            detailCount++; siteDetailCount[site]++;
            await markGoruldu([full]); seenThisRun.add(ilan.kaynak_id);
            const fp = ilanFingerprint(full); if (fp) crossSiteMap.set(fp, { site, fiyat: full.fiyat, baslik: full.baslik });
            if (wh.eklenen > 0) { toplamYeni++; sendProgress(`✓ "${ilan.baslik?.slice(0, 30)}" → eklendi`, 'ok', site); await notifyNewListings(site, 1, ilan.sehir || job.city); }
            else if (wh.atilan > 0) { sendProgress(`↩ "${ilan.baslik?.slice(0, 30)}" → zaten mevcut`, 'info', site); }
            else { toplamYeni++; sendProgress(`✓ "${ilan.baslik?.slice(0, 30)}" → gönderildi`, 'ok', site); }
          } catch (err) {
            if (!isStale()) {
              sendProgress(`hata: ${err.message.slice(0, 80)}`, 'error', site);
              await logError(site, 'webhook_error', `${ilan.kaynak_url} — ${err.message}`);
            }
          }

          if (isStale() || siteBanned) break;

          // Mola
          const molaAraligi = isFast ? 15 : (5 + Math.floor(Math.random() * 6));
          if (detailCount > 0 && detailCount % molaAraligi === 0) {
            const molaSure = isFast ? (10000 + Math.random() * 10000) : (120000 + Math.random() * 120000);
            sendProgress(`${detailCount} ilan — ${Math.round(molaSure/1000)}sn mola...`, 'info', site);
            await sleep(molaSure);
          }

          // Detaylar arası bekleme
          if (!isStale() && !siteBanned && i < yeniler.length - 1) {
            if (isFast) { await sleep(3000 + Math.random() * 5000); }
            else {
              const bekle = Math.round(gaussianDelay(60000, 150000) * sahibindenDelayMultiplier);
              sendProgress(`${site}: listeye geri dönüyor (${Math.round(bekle/1000)}sn)...`);
              await goBackOrNavigate(sTabId, listSayfasi);
              await sleep(bekle);
            }
          }
        }

        if (nextUrl && !isStale()) {
          const pageWait = isFast ? gaussianDelay(3000, 6000) : Math.round(gaussianDelay(30000, 60000) * sahibindenDelayMultiplier);
          await sleep(pageWait);
        }
      }
      if (!isStale()) {
        const jobWait = isFast ? gaussianDelay(5000, 10000) : Math.round(gaussianDelay(60000, 120000) * sahibindenDelayMultiplier);
        await sleep(jobWait);
      }
    }
    // ── Site taraması bitti — kaldırılmış ilan tespiti ──────────────────
    if (totalFiyatDegisen > 0) {
      sendProgress(`${totalFiyatDegisen} fiyat değişikliği tespit edildi`, 'ok', site);
    }

    // Kaldırılmış ilan tespiti: SADECE tüm sayfalar başarıyla tarandıysa
    // ve yeterli veri toplandıysa (yanlış pozitif önleme)
    if (completedAllPages && !siteBanned && !isStale() && allSeenIds.size >= 20 && totalPagesCompleted >= 5) {
      sendProgress(`${allSeenIds.size} aktif ilan, kaldırılmış kontrol ediliyor...`, 'info', site);
      try {
        const payload = {
          tip: 'kaldirilmis_kontrol',
          site,
          aktif_ids: Array.from(allSeenIds),
        };
        const body = JSON.stringify(payload);
        const sig = await signPayload(body, WEBHOOK_SECRET);
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': sig },
          body,
        });
        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          const kaldirilmis = json.data?.kaldirilmis || 0;
          if (kaldirilmis > 0) {
            sendProgress(`${kaldirilmis} ilan kaldırılmış olarak işaretlendi`, 'ok', site);
          }
        }
      } catch (e) {
        console.warn('[EmlakRadar] kaldirilmis_kontrol hata:', e.message);
      }
    } else if (!completedAllPages && !isStale()) {
      console.log(`[EmlakRadar] ${site}: kaldırılmış kontrol atlandı (tamamlanma=${completedAllPages}, ban=${siteBanned}, sayfalar=${totalPagesCompleted}, ilanlar=${allSeenIds.size})`);
    }

    sendProgress(`tamamlandı — ${siteDetailCount[site]} ilan işlendi, ${totalFiyatDegisen} fiyat değişikliği`, 'done', site);
  }

  try {
    // ── Hepsiemlak + Emlakjet: paralel (ayrı sekmelerde) ──────────────────
    const parallelTasks = [];
    for (const fSite of ['hepsiemlak', 'emlakjet']) {
      const fJobs = jobs.filter(j => j.site === fSite);
      if (!fJobs.length) continue;
      const fTab = await createTab(homeUrls[fSite]);
      allTabIds.push(fTab.id);
      await setRandomViewport(fTab.id);
      await sleep(gaussianDelay(2000, 3000));
      if (await checkBotBlock(fTab.id)) { sendProgress(`⚠️ ${fSite} bot bloğu — atlanıyor`, 'error'); continue; }
      parallelTasks.push(scrapeSite(fSite, fTab.id, fJobs).catch(err => {
        sendProgress(`Hata: ${fSite} — ${err.message}`, 'error');
      }));
    }
    const parallelPromise = parallelTasks.length > 0 ? Promise.all(parallelTasks) : Promise.resolve();

    // ── Sahibinden: sıralı + session warmup ──
    const sahibindenJobs = jobs.filter(j => j.site === 'sahibinden');
    if (sahibindenJobs.length > 0 && !isStale()) {
      let ok = false;
      try { ok = await checkSessionBeforeScrape(); } catch (e) { ok = true; }
      if (ok) {
        const sTab = await createTab(homeUrls.sahibinden);
        allTabIds.push(sTab.id);
        await setRandomViewport(sTab.id);
        await sleep(gaussianDelay(3000, 6000));
        if (await checkBotBlock(sTab.id)) { sendProgress(`⚠️ Sahibinden bot bloğu — atlanıyor`, 'error'); }
        else {
          // ── Session Warmup: gerçek kullanıcı gibi siteye gir ──
          sendProgress('sahibinden · warmup — doğal giriş simulasyonu...');
          console.log('[EmlakRadar] Sahibinden warmup başlıyor');
          // Anasayfada biraz gezin
          await chrome.scripting.executeScript({ target: { tabId: sTab.id }, func: () => {
            window.scrollTo({ top: 300 + Math.random() * 500, behavior: 'smooth' });
          }}).catch(() => {});
          await sleep(gaussianDelay(2000, 5000));
          // Rastgele bir warmup sayfası ziyaret et (emlak kategorisi veya popüler aramalar)
          const warmupUrls = [
            'https://www.sahibinden.com/emlak',
            'https://www.sahibinden.com/satilik',
            'https://www.sahibinden.com/kiralik',
          ];
          const warmupUrl = warmupUrls[Math.floor(Math.random() * warmupUrls.length)];
          await navigateTab(sTab.id, warmupUrl);
          await sleep(gaussianDelay(3000, 7000));
          await chrome.scripting.executeScript({ target: { tabId: sTab.id }, func: () => {
            window.scrollTo({ top: 200 + Math.random() * 800, behavior: 'smooth' });
          }}).catch(() => {});
          await sleep(gaussianDelay(2000, 4000));
          console.log('[EmlakRadar] Sahibinden warmup tamamlandı');

          await scrapeSite('sahibinden', sTab.id, sahibindenJobs).catch(err => { sendProgress(`Hata: sahibinden — ${err.message}`, 'error'); });
        }
      } else { sendProgress(`⚠️ Sahibinden atlandı — oturum yok`, 'error'); }
    }

    // Paralel sitelerin bitmesini bekle
    await parallelPromise;

  } finally {
    // Eski run'ın tablarını kapat
    for (const tid of allTabIds) chrome.tabs.remove(tid).catch(() => {});
    for (const wid of scrapeWindowIds) chrome.windows.remove(wid).catch(() => {});
    scrapeWindowIds.clear();

    // Eski run ise (Force ile durduruldu): state'i yeni run'a bırak
    if (currentRunId !== myRunId) {
      console.log(`[EmlakRadar] Eski run (#${myRunId}) temizlendi, yeni run (#${currentRunId}) devam ediyor`);
      return;
    }

    isRunning = false;
    await chrome.storage.local.set({
      isRunning:       false,
      scrapeTabId:     null,
      lastScrapeTime:  new Date().toISOString(),
      lastScrapeCount: toplamYeni,
    });
    // Tarama başarıyla bittiyse (durdurulmadıysa) tip rotasyonunu ilerlet
    if (!shouldStop) {
      const { tipRotIdx = 0 } = await chrome.storage.local.get(['tipRotIdx']);
      await chrome.storage.local.set({ tipRotIdx: (tipRotIdx + 1) % TIP_ORDER.length });
    }
    const msg = shouldStop ? `Durduruldu — ${toplamYeni} ilan eklendi` : `Tamamlandı — ${toplamYeni} ilan eklendi`;
    sendProgress(msg, 'done');
    console.log(`[EmlakRadar] ${msg}`);
    await scheduleNextScrape();
  }
}

// ─── Job Listesi — Kategori Rotasyonu ────────────────────────────────────────
// Tip bazlı rotation: bir session boyunca hep aynı tip taranır.
// 0 → satılık (daire, arsa, mustakil, villa), 1 → kiralık (daire)
const CATS_BY_TIP = {
  sahibinden: {
    satilik: [
      { slug: 'satilik-daire',       kategori: 'daire'    },
      { slug: 'satilik-arsa',        kategori: 'arsa'     },
      { slug: 'satilik-mustakil-ev', kategori: 'mustakil' },
      { slug: 'satilik-villa',       kategori: 'villa'    },
    ],
    kiralik: [
      { slug: 'kiralik-daire', kategori: 'daire' },
    ],
  },
  hepsiemlak: {
    satilik: [
      { slug: '{city}-satilik/daire', kategori: 'daire' },
      { slug: '{city}-satilik/arsa',  kategori: 'arsa'  },
    ],
    kiralik: [
      { slug: '{city}-kiralik/daire', kategori: 'daire' },
    ],
  },
  emlakjet: {
    satilik: [
      { slug: 'satilik-daire', kategori: 'daire' },
      { slug: 'satilik-arsa',  kategori: 'arsa'  },
    ],
    kiralik: [
      { slug: 'kiralik-daire', kategori: 'daire' },
    ],
  },
};
const TIP_ORDER = ['satilik', 'kiralik'];

async function buildJobs(cities, maxPages) {
  const { tipRotIdx = 0 } = await chrome.storage.local.get(['tipRotIdx']);
  const currentTip = TIP_ORDER[tipRotIdx % TIP_ORDER.length];
  // tipRotIdx tarama bittiğinde artırılır (rotateTip), burada değil

  const jobs = [];
  for (const site of ['sahibinden', 'hepsiemlak', 'emlakjet']) {
    const cats = CATS_BY_TIP[site][currentTip] || [];
    for (const k of cats) {
      for (const city of cities) {
        let url;
        if (site === 'sahibinden') {
          const yol = city === 'istanbul' ? `/${k.slug}` : `/${k.slug}/${city}`;
          // Sahibinden: yeni ilanlar önce (varsayılan sıralama)
          const randomStart = Math.floor(Math.random() * 3) * 20; // 0, 20 veya 40
          url = randomStart > 0
            ? `https://www.sahibinden.com${yol}?pagingOffset=${randomStart}`
            : `https://www.sahibinden.com${yol}`;
        } else if (site === 'hepsiemlak') {
          // En eski ilan önce
          url = `https://www.hepsiemlak.com/${k.slug.replace('{city}', city)}?sortField=UPDATED_DATE&sortDirection=ASC`;
        } else {
          // Tarihe göre sırala
          url = `https://www.emlakjet.com/${k.slug}/${city}/?siralama=4`;
        }
        jobs.push({ site, url, tip: currentTip, ...k, city, maxPages });
      }
    }
  }

  console.log(`[EmlakRadar] Bu tur: ${currentTip} — ${jobs.length} iş`);
  return jobs;
}

// ─── Sekme Yardımcıları ───────────────────────────────────────────────────────
async function setRandomViewport(tabId) {
  const sizes = [
    { w: 1280, h: 720  }, { w: 1280, h: 800  },
    { w: 1366, h: 768  }, { w: 1440, h: 900  }, { w: 1536, h: 864  },
    { w: 1920, h: 1080 },
  ];

  // Günlük bir kez viewport değiştir, gün içinde sabit tut
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const { viewportDate, viewportIdx } = await chrome.storage.local.get(['viewportDate', 'viewportIdx']);

  let idx;
  if (viewportDate === today && viewportIdx != null) {
    idx = viewportIdx;
  } else {
    idx = Math.floor(Math.random() * sizes.length);
    await chrome.storage.local.set({ viewportDate: today, viewportIdx: idx });
  }

  const { w, h } = sizes[idx];
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { width: w, height: h });
  } catch (_) {}
}

const scrapeWindowIds = new Set();

function createTab(url, timeoutMs = 45000) {
  return new Promise(async (resolve, reject) => {
    try {
      // Minimized pencere: DOM'a bağımlı olmayan scriptler için yeterli
      const win = await chrome.windows.create({ url, state: 'minimized' });
      scrapeWindowIds.add(win.id);
      const tab = win.tabs[0];
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve(tab);
      }, timeoutMs);
      function onUpdated(tabId, info) {
        if (tabId !== tab.id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timer);
        resolve(tab);
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    } catch (err) { reject(err); }
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

// hideWebdriver kaldırıldı: stealth.js document_start + MAIN world'de
// navigator.webdriver'ı override ediyor, runtime'da tekrar gerekmez.

// ─── Referrer-korumalı Navigasyon ────────────────────────────────────────────
// Sayfadaki link'e tıklama simülasyonu — doğal Referer header üretir
async function navigateViaClick(tabId, targetUrl, timeoutMs = 45000) {
  return new Promise((resolve) => {
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

    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (url) => {
        // Sayfadaki tüm <a> etiketlerini tara, href'i eşleşeni bul
        const allLinks = document.querySelectorAll('a[href]');
        let found = null;
        const pathname = new URL(url).pathname;
        for (const a of allLinks) {
          const h = a.getAttribute('href') || '';
          if (h === url || h.endsWith(pathname)) {
            found = a;
            break;
          }
        }
        if (found) {
          found.click(); // Doğal click → doğal Referer
        } else {
          // Link bulunamadıysa location.href ile git — bu da Referer üretir
          window.location.href = url;
        }
      },
      args: [targetUrl],
    }).catch(() => {
      // executeScript başarısızsa fallback: eski yöntem
      chrome.tabs.update(tabId, { url: targetUrl });
    });
  });
}

// ─── Geri Git veya Navigasyon (goBack başarısızsa fallback) ──────────────────
async function goBackOrNavigate(tabId, fallbackUrl) {
  let resolved = false;
  await Promise.race([
    new Promise(resolve => {
      chrome.tabs.goBack(tabId, () => {
        if (chrome.runtime.lastError) { resolve(); return; }
        // onUpdated veya 8 sn timeout bekle
        const timer = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUp);
          resolve();
        }, 8000);
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
    sleep(12000),
  ]);
  // goBack başarısız olduysa (resolved=false ve hata) fallback
  if (!resolved) {
    try { await navigateTab(tabId, fallbackUrl); } catch (_) {}
  }
}

// Hepsiemlak MAIN world pre-script: __NUXT__ verisini DOM'a yazar (CSP-safe)
// MAIN world'de çalışır → window.__NUXT__'a doğrudan erişir
async function hepsiemlakNuxtBridge() {
  // __NUXT__ verisi Nuxt hydration sonrası yüklenir, bekle
  for (let i = 0; i < 20; i++) {
    const list = window.__NUXT__?.data?.['0']?.list;
    if (Array.isArray(list) && list.length > 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  try {
    const d = window.__NUXT__?.data?.['0'] || {};
    const el = document.createElement('div');
    el.id = '__emlakradar_nuxt__';
    el.style.display = 'none';
    el.textContent = JSON.stringify({
      list: d.list || [],
      totalPage: d.totalPage || 1,
      totalAd: d.totalAdvertisement || 0,
    });
    document.documentElement.appendChild(el);
  } catch (_) {}
}

function injectOnce(tabId, job) {
  return new Promise(async (resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return; done = true;
      chrome.runtime.onMessage.removeListener(onMsg);
      console.warn(`[EmlakRadar] injectOnce TIMEOUT (90s) — ${job.site} ${job.kategori}`);
      resolve({ ilanlar: [], nextUrl: null });
    }, 90000);

    function onMsg(msg, sender) {
      if (msg.type !== 'emlakradar_page') return;
      if (sender?.tab?.id !== tabId) return;
      if (done) return; done = true;
      clearTimeout(timer); chrome.runtime.onMessage.removeListener(onMsg);
      if (msg._debug) console.log(`[EmlakRadar] CS debug (${job.site}):`, JSON.stringify(msg._debug));
      resolve({ ilanlar: msg.ilanlar || [], nextUrl: msg.nextUrl || null, totalPage: msg.totalPage || 1 });
    }
    chrome.runtime.onMessage.addListener(onMsg);

    try {
      // Hepsiemlak: önce MAIN world'de __NUXT__ verisini DOM'a yaz
      if (job.site === 'hepsiemlak') {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: hepsiemlakNuxtBridge,
          world: 'MAIN',
        });
      }
      // Sonra ISOLATED world'de content script çalıştır
      await chrome.scripting.executeScript({
        target: { tabId },
        func: getContentFn(job.site),
        args: [job.tip, job.kategori, job.city],
      });
    } catch (err) {
      if (done) return; done = true;
      clearTimeout(timer); chrome.runtime.onMessage.removeListener(onMsg);
      console.error('[EmlakRadar] executeScript hata:', err.message);
      resolve({ ilanlar: [], nextUrl: null });
    }
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

// Hepsiemlak MAIN world detail bridge: detay __NUXT__ verisini DOM'a yazar
async function hepsiemlakNuxtDetailBridge() {
  // URL'deki listing ID'yi al — doğru detay verisini beklememiz lazım
  const urlMatch = location.pathname.match(/(\d+-\d+)\/?$/);
  const expectedId = urlMatch ? urlMatch[1] : null;

  // detailData yüklenene kadar bekle, URL ile eşleşmesini kontrol et (max 25s)
  for (let i = 0; i < 25; i++) {
    const dd = window.__NUXT__?.data?.['0']?.detailData;
    // listingId URL ile eşleşmeli (eski sayfanın verisini okumamak için)
    if (dd && (!expectedId || dd.listingId === expectedId) && (dd.firm || dd.owner || dd.contact)) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  try {
    const d = window.__NUXT__?.data?.['0'] || {};
    const el = document.createElement('div');
    el.id = '__emlakradar_nuxt_detail__';
    el.style.display = 'none';
    el.textContent = JSON.stringify({
      detailData: d.detailData || {},
      description: d.description || {},
      image: d.image || [],
      imageUrl: d.imageUrl || '',
      specs: d.specs || [],
      coordsLat: d.coordsLat,
      coordsLng: d.coordsLng,
    });
    document.documentElement.appendChild(el);
  } catch (_) {}
}

function injectDetail(tabId, fn, site) {
  return new Promise(async (resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return; done = true;
      chrome.runtime.onMessage.removeListener(onMsg);
      resolve({});
    }, 90000);

    function onMsg(msg, sender) {
      if (msg.type !== 'emlakradar_detail') return;
      if (sender?.tab?.id !== tabId) return;
      if (done) return; done = true;
      clearTimeout(timer); chrome.runtime.onMessage.removeListener(onMsg);
      if (site === 'hepsiemlak') console.log(`[EmlakRadar] hepsiemlak detail result: satici_ad=${msg.data?.satici_ad}, satici_tel=${msg.data?.satici_tel}, imgs=${msg.data?.fotograflar?.length}`);
      resolve(msg.data || {});
    }
    chrome.runtime.onMessage.addListener(onMsg);

    try {
      if (site === 'hepsiemlak') {
        await chrome.scripting.executeScript({ target: { tabId }, func: hepsiemlakNuxtDetailBridge, world: 'MAIN' });
      }
      await chrome.scripting.executeScript({ target: { tabId }, func: fn });
    } catch (err) {
      if (done) return; done = true;
      clearTimeout(timer); chrome.runtime.onMessage.removeListener(onMsg);
      resolve({});
    }
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

// ─── Fiyat Validation — bozuk fiyatları temizle ──────────────────────────────
function validateFiyat(fiyat) {
  const f = parseFloat(fiyat) || 0;
  // 500 milyon TL üstü gerçekçi değil (arsa hariç en pahalı daire bile bu kadar değil)
  if (f > 500000000) return 0;
  // Negatif fiyat olamaz
  if (f < 0) return 0;
  return f;
}

// ─── Webhook Gönder ───────────────────────────────────────────────────────────
// Döndürür: { eklenen, atilan, errors }
async function sendWebhook(ilanlar, _cfg) {
  let totalEklenen = 0, totalAtilan = 0;
  // Fiyat validation — bozuk fiyatları temizle
  ilanlar = ilanlar.map(i => ({ ...i, fiyat: validateFiyat(i.fiyat) }));
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

// ─── Sunucu DB'de hangi kaynak_id'ler zaten var? (v2: fiyat bilgisi de döner) ─
// Detay sayfasına girmeden önce toplu kontrol — bot riskini dramatik azaltır
async function checkServerIds(ilanlar) {
  if (!ilanlar.length) return { mevcutIds: new Set(), fiyatlar: {} };

  // Site bazında grupla
  const bySite = {};
  for (const ilan of ilanlar) {
    const site = ilan.kaynak_site;
    if (!bySite[site]) bySite[site] = [];
    bySite[site].push(ilan.kaynak_id);
  }

  const mevcutIds = new Set();
  const fiyatlar  = {}; // { kaynak_id: sunucudaki_fiyat }
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
      // v2: fiyat bilgisi
      const serverFiyatlar = json.data?.fiyatlar || {};
      Object.assign(fiyatlar, serverFiyatlar);
    } catch (e) {
      console.warn('[EmlakRadar] checkServerIds hata:', e.message);
    }
  }
  return { mevcutIds, fiyatlar };
}

// ─── Toplu "görüldü" heartbeat — son_gorunme + fiyat değişiklik tespiti ──────
async function sendGoruldu(ilanlar, site) {
  if (!ilanlar.length) return;

  // Max 50'şer gönder
  const chunks = [];
  for (let i = 0; i < ilanlar.length; i += 50) {
    chunks.push(ilanlar.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    try {
      const payload = {
        tip: 'goruldu',
        site,
        ilanlar: chunk.map(i => ({
          kaynak_id: i.kaynak_id,
          fiyat: i.fiyat || 0,
        })),
      };
      const body = JSON.stringify(payload);
      const sig  = await signPayload(body, WEBHOOK_SECRET);
      const res  = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': sig },
        body,
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        const fd = json.data?.fiyat_degisen || 0;
        if (fd > 0) console.log(`[EmlakRadar] ${site}: ${fd} fiyat değişikliği tespit edildi`);
      }
    } catch (e) {
      console.warn('[EmlakRadar] sendGoruldu hata:', e.message);
    }
  }
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

  try {
  console.log('[EmlakRadar-CS] sahibinden script başladı, URL:', location.href, 'title:', document.title);

  async function waitFor(selector, ms = 30000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelectorAll(selector).length > 0) return true;
      await new Promise(r => setTimeout(r, 1500));
    }
    return false;
  }

  async function humanScroll() {
    const scrollStart = Date.now();
    const MAX_SCROLL_TIME = 45000; // max 45 saniye scroll
    const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step  = () => { const r = Math.random(); return r < 0.2 ? 50 + r * 250 : r < 0.8 ? 100 + Math.random() * 150 : 250 + Math.random() * 150; };
    const pause = () => 60 + Math.random() * 100;
    const longP = () => 700 + Math.random() * 1200;
    let pos = 0;
    while (pos < total - 200 && (Date.now() - scrollStart) < MAX_SCROLL_TIME) {
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

  // Bot/captcha kontrolü
  const pageText = document.body?.innerText || '';
  if (pageText.includes('robot') || pageText.includes('captcha') || pageText.includes('güvenlik')) {
    console.warn('[EmlakRadar-CS] sahibinden bot/captcha sayfası algılandı');
    chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar: [], nextUrl: null, _debug: { botBlock: true, title: document.title } });
    return;
  }

  const found = await waitFor('tr.searchResultsItem');
  console.log('[EmlakRadar-CS] sahibinden waitFor sonuç:', found, 'eleman sayısı:', document.querySelectorAll('tr.searchResultsItem').length);
  if (!found) {
    console.warn('[EmlakRadar-CS] sahibinden: searchResultsItem bulunamadı. Body preview:', document.body?.innerText?.substring(0, 500));
    chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar: [], nextUrl: null, _debug: { noResults: true, title: document.title, bodyPreview: document.body?.innerText?.substring(0, 200) } });
    return;
  }

  // Okuma duraklaması: gerçek kullanıcı gibi sayfaya bakar, hemen scroll yapmaz
  await new Promise(r => setTimeout(r, 2000 + Math.random() * 4000));
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

  console.log(`[EmlakRadar-CS] sahibinden sonuç: ${ilanlar.length} ilan, nextUrl: ${nextUrl ? 'VAR' : 'YOK'}`);
  chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar, nextUrl });

  } catch (err) {
    console.error('[EmlakRadar-CS] sahibinden script HATA:', err.message, err.stack);
    chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar: [], nextUrl: null, _debug: { error: err.message } });
  }
}

async function hepsiemlakScript(tip, kategori, city) {
  const BASE = 'https://www.hepsiemlak.com';
  const IMG_BASE = 'https://hecdn01.hemlak.com/';

  // MAIN world pre-script __NUXT__ verisini DOM'a yazdı, burada okuyoruz
  const bridgeEl = document.getElementById('__emlakradar_nuxt__');
  let nuxtData = { list: [], totalPage: 1 };
  if (bridgeEl) {
    try { nuxtData = JSON.parse(bridgeEl.textContent || '{}'); } catch(_) {}
    bridgeEl.remove();
  }
  const list = nuxtData.list || [];
  console.log(`[EmlakRadar-CS] hepsiemlak __NUXT__ list=${list.length}, totalPage=${nuxtData.totalPage}, URL=${location.href}`);

  const ilanlar = [];
  for (const item of list) {
    try {
      const id = item.listingId || String(item.id || '');
      if (!id) continue;
      const baslik = item.title || '';
      const detailUrl = item.detailUrl || '';
      const kaynak_url = detailUrl ? `${BASE}/${detailUrl}` : '';
      if (!kaynak_url || !baslik) continue;

      const fiyat = item.price || 0;
      const sehir = item.city?.name || city;
      const ilce = item.county?.name || '';
      const mahalle = item.district?.name || '';
      const adres = [sehir, ilce, mahalle].filter(Boolean).join(' / ');
      // netSqm öncelikli — grossSqm bazen parsel/bina brüt alanını veriyor (552 vs 270)
      const metrekare = item.sqm?.netSqm || item.sqm?.grossSqm?.[0] || item.landArea || item.plotArea || item.parcelArea || null;
      const oda_sayisi = item.roomAndLivingRoom?.[0] || '';

      const imgs = (item.images || []).map(img => {
        if (img.startsWith('http')) return img;
        return IMG_BASE + img;
      });

      ilanlar.push({
        kaynak_site: 'hepsiemlak', kaynak_url, kaynak_id: `he_${id}`,
        baslik, aciklama: '', fiyat, fiyat_birimi: item.currency || 'TL', tip, kategori,
        sehir, ilce, mahalle, adres,
        metrekare: metrekare || undefined,
        oda_sayisi: oda_sayisi || undefined,
        fotograflar: imgs,
        taranan_at: new Date().toISOString(),
      });
    } catch (_) {}
  }

  // Pagination: __NUXT__ totalPage ile mevcut sayfa karşılaştır
  let nextUrl = null;
  const totalPage = nuxtData?.totalPage || 1;
  const currentPage = parseInt(new URLSearchParams(location.search).get('page') || '1');
  if (currentPage < totalPage) {
    const url = new URL(location.href);
    url.searchParams.set('page', currentPage + 1);
    nextUrl = url.toString();
  }

  chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar, nextUrl, totalPage });
}

async function emlakjetScript(tip, kategori, city) {
  const BASE = 'https://www.emlakjet.com';
  // Güncel yapı: div[data-id] > a > div.styles_contentWrapper
  const SEL  = 'div[data-id]';

  async function humanScroll(maxMs = 15000) {
    const deadline = Date.now() + maxMs;
    const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    if (total < 500) return; // Minimized pencerede scroll gereksiz
    const step  = () => { const r = Math.random(); return r < 0.2 ? 50 + r * 250 : r < 0.8 ? 100 + Math.random() * 150 : 250 + Math.random() * 150; };
    const pause = () => 60  + Math.random() * 100;
    const longP = () => 700 + Math.random() * 1200;
    let pos = 0;
    while (pos < total - 200 && Date.now() < deadline) {
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

  async function waitFor(ms = 15000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelectorAll(SEL).length > 0) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  const waitResult = await waitFor();
  console.log(`[EmlakRadar-CS] emlakjet waitFor=${waitResult}, URL=${location.href}, SEL count=${document.querySelectorAll(SEL).length}`);
  await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
  await humanScroll();

  const ilanlar = [];
  console.log(`[EmlakRadar-CS] emlakjet scroll sonrası SEL count=${document.querySelectorAll(SEL).length}`);
  // İlk kartın HTML'ini logla — debug için
  const ilkKart = document.querySelector(SEL);
  if (ilkKart) {
    console.log('[EmlakRadar-CS] emlakjet ilk kart HTML (500 char):', ilkKart.innerHTML.substring(0, 500));
    console.log('[EmlakRadar-CS] emlakjet ilk kart tüm class\'lar:', Array.from(ilkKart.querySelectorAll('*')).map(e => e.className).filter(Boolean).join(' | '));
  }
  document.querySelectorAll(SEL).forEach(kart => {
    try {
      const id = kart.getAttribute('data-id') || '';
      if (!id) return;

      const aEl  = kart.querySelector('a');
      const href = aEl?.getAttribute('href') || '';
      if (!href) return;

      const kaynak_url = href.startsWith('http') ? href : BASE + href;
      // Başlık: title attribute veya title class'lı element
      const baslik = aEl?.getAttribute('title')?.replace(/^(YENİ|FIRSAT)\s*/i, '')?.trim() ||
                     kart.querySelector('[class*="title"]')?.textContent?.trim() || '';
      if (!kaynak_url || !baslik) return;

      let fiyat = 0;
      // Yöntem 1: class'ta price/Price geçen element
      const fiyatEl = kart.querySelector('[class*="price"], [class*="Price"], [class*="cost"], [class*="Cost"]');
      if (fiyatEl) {
        fiyat = parseFloat((fiyatEl.textContent?.trim() || '').replace(/[^\d]/g,'')) || 0;
      }
      // Yöntem 2: "TL" içeren elementi bul (Emlakjet hash'li class kullanıyor olabilir)
      if (!fiyat) {
        const allEls = kart.querySelectorAll('span, div, p');
        for (const el of allEls) {
          const txt = el.textContent?.trim() || '';
          // "1.500.000 TL" veya "3.750.000 ₺" gibi fiyat formatını bul
          if (/[\d.]+\s*(TL|₺)/i.test(txt) && !/m²|TL\/m/i.test(txt)) {
            const clean = txt.replace(/[^\d]/g, '');
            const val = parseFloat(clean) || 0;
            if (val > 1000) { fiyat = val; break; } // 1000'den küçük fiyatlar m²/TL olabilir
          }
        }
      }
      // Yöntem 3: data attribute'lardan
      if (!fiyat) {
        const dataPrice = kart.getAttribute('data-price') || kart.querySelector('[data-price]')?.getAttribute('data-price') || '';
        if (dataPrice) fiyat = parseFloat(dataPrice.replace(/[^\d]/g, '')) || 0;
      }

      const lokEl  = kart.querySelector('[class*="location"], [class*="Location"]');
      const lokTxt = lokEl?.textContent?.trim() || '';
      const lokPar = lokTxt.split(/[-,\/]/).map(s => s.trim()).filter(Boolean);

      const m2El     = kart.querySelector('[class*="area"], [class*="Area"], [class*="squareMeter"], [class*="square"], [class*="size"], [class*="Size"]');
      let metrekare = parseFloat((m2El?.textContent?.trim() || '').replace(/\s*m[²2]/gi,'').replace(/[^\d,]/g,'').replace(',','.')) || null;
      // Arsa ilanlarında m² bilgisi farklı elementlerde olabilir — tüm spec/detail elementlerini tara
      if (!metrekare) {
        kart.querySelectorAll('[class*="spec"], [class*="feature"], [class*="detail"], [class*="info"], span, div').forEach(el => {
          const txt = el.textContent?.trim() || '';
          if (!metrekare && /\d+\s*m[²2]/i.test(txt)) {
            const m = txt.match(/([\d.,]+)\s*m[²2]/i);
            if (m) metrekare = parseFloat(m[1].replace(/\./g,'').replace(',','.')) || null;
          }
        });
      }
      const odaEl    = kart.querySelector('[class*="room"], [class*="Room"]');

      const imgs = [];
      kart.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
        if (src && src.startsWith('http') && !src.includes('no-image')) imgs.push(src);
      });

      if (!fiyat) {
        console.warn(`[EmlakRadar-CS] emlakjet fiyat=0: "${baslik}" — kart HTML (300 char):`, kart.innerHTML.substring(0, 300));
      }

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

  // Sonraki sayfa + toplam sayfa
  let nextUrl = null;
  let totalPage = 1;
  const pagWrapper = document.querySelector('[class*="paginationWrapper"], [class*="pagination"]');
  if (pagWrapper) {
    const pagLinks = pagWrapper.querySelectorAll('a[href*="sayfa="]');
    const currentPage = parseInt(new URLSearchParams(location.search).get('sayfa') || '1');
    // Max sayfa numarasını bul
    for (const a of pagLinks) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/sayfa=(\d+)/);
      if (m) totalPage = Math.max(totalPage, parseInt(m[1]));
    }
    // Sonraki sayfa linkini bul
    for (const a of pagLinks) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/sayfa=(\d+)/);
      if (m && parseInt(m[1]) === currentPage + 1) {
        nextUrl = href.startsWith('http') ? href : BASE + href;
        break;
      }
    }
  }
  chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar, nextUrl, totalPage });
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
  await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000)); // JS render tamamlansın

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
  // Kişi adı: .user-info-agent h3 (ör: "Ercan D.")
  const kisi_ad = (
    document.querySelector('.user-info-agent h3')?.textContent?.trim() ||
    document.querySelector('.username')?.textContent?.trim() ||
    ''
  ).replace(/\s+/g, ' ');

  // Mağaza/ofis adı: .user-info-store-name veya sticky header
  const magaza_ad = (
    document.querySelector('.user-info-store-name')?.textContent?.trim() ||
    document.querySelector('.sticky-header-store-name')?.textContent?.trim() ||
    ''
  ).replace(/\s+/g, ' ');

  const satici_ad = (kisi_ad && magaza_ad ? `${kisi_ad} — ${magaza_ad}` : kisi_ad || magaza_ad || '');

  // Telefon: .user-info-phones dd veya data-opened attribute (açık numara)
  const satici_tel = (
    document.querySelector('.user-info-phones dd')?.textContent?.trim() ||
    document.querySelector('[data-opened]')?.getAttribute('data-opened') ||
    document.querySelector('a[href^="tel:"]')?.getAttribute('href')?.replace('tel:', '')?.trim() ||
    ''
  ).replace(/\s+/g, ' ');

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
    metrekare: (() => {
      // "270 m2 / 210 m2" formatı — net m² (son değer) al
      const raw = (findAttr('net m²', 'net m2', 'net', 'm²', 'brüt', 'alan', 'arsa', 'parsel', 'arazi', 'yüzölçüm') || '').toString();
      const parts = raw.split('/').map(s => s.trim());
      const netPart = parts.length > 1 ? parts[parts.length - 1] : parts[0];
      return parseFloat((netPart || '').replace(/\s*m[²2]/gi, '').replace(/[^\d,]/g, '').replace(',', '.')) || null;
    })(),
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
  const IMG_BASE = 'https://hecdn01.hemlak.com/';

  // MAIN world bridge detay verisini DOM'a yazdı, okuyoruz
  const bridgeEl = document.getElementById('__emlakradar_nuxt_detail__');
  let nuxt = {};
  if (bridgeEl) {
    try { nuxt = JSON.parse(bridgeEl.textContent || '{}'); } catch(_) {}
    bridgeEl.remove();
  }

  const dd = nuxt.detailData || {};
  const specs = nuxt.specs || [];

  // Açıklama — HTML tag'larını temizle
  let aciklama = '';
  if (nuxt.description) {
    const content = typeof nuxt.description === 'object' ? (nuxt.description.content || '') : String(nuxt.description);
    aciklama = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 5000);
  }

  // Fotoğraflar — full-size URL
  const imgs = (nuxt.image || []).map(img => {
    if (img.startsWith('http')) return img;
    return IMG_BASE + img;
  });

  // Specs'ten özellik çıkar
  function findSpec(...keys) {
    for (const spec of specs) {
      const t = (spec.title || '').toLowerCase();
      for (const k of keys) if (t.includes(k)) return spec.value || spec.truncateValue || null;
    }
    return null;
  }

  // Satıcı bilgisi — firmUser, firm.firmUser içinde olabilir
  const firm = dd.firm || {};
  const firmUser = dd.firmUser || firm.firmUser || {};
  const owner = dd.owner || {};
  const kisi_ad = [firmUser.firstName, firmUser.lastName].filter(Boolean).join(' ') || owner.name || '';
  const magaza_ad = firm.name || firm.shortName || '';
  const satici_ad = (kisi_ad && magaza_ad ? `${kisi_ad} — ${magaza_ad}` : kisi_ad || magaza_ad || '');

  // Telefon — phones array: {countryCode, areaCode, phoneNumber}
  const contact = dd.contact || {};
  const phones = firmUser.phones || owner.phones || contact.phones || [];
  let satici_tel = '';
  if (phones.length > 0) {
    const p = phones[0];
    satici_tel = `0${p.areaCode || ''}${p.phoneNumber || ''}`.replace(/\s/g, '');
  }

  const lat = parseFloat(nuxt.coordsLat) || null;
  const lng = parseFloat(nuxt.coordsLng) || null;

  console.log(`[EmlakRadar-CS] hepsiemlak detail: bridgeEl=${!!bridgeEl}, dd_keys=${Object.keys(dd)}, satici_ad=${satici_ad}, satici_tel=${satici_tel}, imgs=${imgs.length}`);

  chrome.runtime.sendMessage({ type: 'emlakradar_detail', data: {
    aciklama, fotograflar: imgs,
    oda_sayisi: findSpec('oda sayısı', 'oda'),
    metrekare: (() => {
      // "270 m2 / 210 m2" formatı — net m² (ikinci değer) veya tek değer al
      const raw = (findSpec('net m²', 'net m2', 'net', 'm²', 'brüt', 'alan', 'arsa', 'parsel', 'arazi', 'yüzölçüm') || '').toString();
      // "270 m2 / 210 m2" → 210 (net), "270 m2" → 270
      const parts = raw.split('/').map(s => s.trim());
      // Son kısmı al (genellikle net m²)
      const netPart = parts.length > 1 ? parts[parts.length - 1] : parts[0];
      return parseFloat((netPart || '').replace(/\s*m[²2]/gi, '').replace(/[^\d,]/g, '').replace(',', '.')) || null;
    })(),
    kat:        findSpec('kat', 'bulunduğu kat'),
    bina_yasi:  findSpec('bina yaşı', 'yapı yaşı'),
    isitma:     findSpec('ısıtma'),
    banyo:      findSpec('banyo'),
    satici_ad, satici_tel,
    konum: (lat && lng) ? { lat, lng } : null,
  }});
}

async function emlakjetDetailScript() {
  async function waitFor(ms = 15000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelector('h1, [class*="detail"]')) return true;
      await new Promise(r => setTimeout(r, 800));
    }
    return false;
  }
  async function humanScroll(maxMs = 12000) {
    const deadline = Date.now() + maxMs;
    const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    if (total < 500) return;
    const step  = () => { const r = Math.random(); return r < 0.2 ? 50 + r * 250 : r < 0.8 ? 100 + Math.random() * 150 : 250 + Math.random() * 150; };
    let pos = 0;
    while (pos < total - 200 && Date.now() < deadline) {
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
  await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
  await humanScroll();
  await new Promise(r => setTimeout(r, 500));

  // Açıklama — emlakjet CSS modules hash'li class kullanıyor, h2 başlığından bul
  let aciklama = '';
  const descH2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('İlan Açıklaması') || h.textContent.includes('Açıklama'));
  if (descH2 && descH2.nextElementSibling) {
    aciklama = descH2.nextElementSibling.textContent?.trim()?.substring(0, 5000) || '';
  }
  if (!aciklama) {
    aciklama = (document.querySelector('[class*="description-content"], div.description')?.textContent?.trim() || '').substring(0, 5000);
  }

  // Fotoğraflar — script tag'larından full-size URL al, resize'lı thumbnail'leri kullanma
  const seen = new Set(); const imgs = [];
  function addImg(url) {
    if (!url || !url.startsWith('http') || seen.has(url)) return;
    url = url.replace(/\\+$/, ''); // trailing backslash temizle
    if (/no.image|placeholder|blank|favicon|logo/i.test(url) || url.length < 30) return;
    seen.add(url); imgs.push(url);
  }
  // Önce script tag'larından full-size URL'leri çek (resize olmayan)
  const listingId = location.pathname.match(/(\d+)$/)?.[1];
  document.querySelectorAll('script').forEach(s => {
    const txt = s.textContent || '';
    const matches = txt.matchAll(/(https?:\/\/imaj\.emlakjet\.com\/listing\/[^"\\]+\.(?:jpg|jpeg|png|webp))/gi);
    for (const m of matches) addImg(m[1]);
  });
  // Fallback: img src'lerden resize kısmını kaldırarak full-size yap
  if (imgs.length < 2) {
    document.querySelectorAll('img[src*="imaj.emlakjet.com"]').forEach(img => {
      const full = img.src.replace(/\/resize\/\d+\/\d+\//, '/');
      addImg(full);
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

  // Satıcı bilgileri — "Firma Künyesi" bölümünden
  const firmaH2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('Firma'));
  const firmaInner = firmaH2?.nextElementSibling;
  const kisiAd = firmaInner?.querySelector('[class*="userName"], h4')?.textContent?.trim() || '';
  const firmaAd = firmaInner?.querySelector('[class*="companyName"]')?.textContent?.trim() || '';
  const satici_ad = (kisiAd && firmaAd ? `${kisiAd} — ${firmaAd}` : kisiAd || firmaAd || '');

  // Telefon — script tag'larından ilan sahibine özel numara (a[href^="tel:"] emlakjet çağrı merkezi)
  let satici_tel = '';
  document.querySelectorAll('script').forEach(s => {
    const m = (s.textContent || '').match(/phone(?:Number)?\\*"\\*:\s*\\*"(\+?\d[\d\s]+)\\*"/);
    if (m && !satici_tel) satici_tel = m[1].trim();
  });

  const lat = parseFloat(document.querySelector('[data-lat]')?.getAttribute('data-lat') || '') || null;
  const lng = parseFloat(document.querySelector('[data-lng]')?.getAttribute('data-lng') || '') || null;

  chrome.runtime.sendMessage({ type: 'emlakradar_detail', data: {
    aciklama, fotograflar: imgs,
    oda_sayisi: findAttr('oda sayısı', 'oda'),
    metrekare: (() => {
      const raw = (findAttr('net m²', 'net m2', 'net', 'm²', 'brüt', 'alan', 'arsa', 'parsel', 'arazi', 'yüzölçüm') || '').toString();
      const parts = raw.split('/').map(s => s.trim());
      const netPart = parts.length > 1 ? parts[parts.length - 1] : parts[0];
      return parseFloat((netPart || '').replace(/\s*m[²2]/gi, '').replace(/[^\d,]/g, '').replace(',', '.')) || null;
    })(),
    kat:        findAttr('kat', 'bulunduğu kat'),
    bina_yasi:  findAttr('bina yaşı', 'yapı yaşı'),
    isitma:     findAttr('ısıtma'),
    banyo:      findAttr('banyo'),
    satici_ad, satici_tel,
    konum: (lat && lng) ? { lat, lng } : null,
  }});
}
