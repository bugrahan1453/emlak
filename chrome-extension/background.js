'use strict';
/**
 * EmlakRadar Chrome Extension — Background Service Worker
 * Zamanlayıcı, tab yönetimi, cPanel webhook gönderimi
 */

// ─── HMAC-SHA256 İmzalayıcı (Web Crypto API) ─────────────────────────────────
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

// ─── Yapılandırma Okuyucu ─────────────────────────────────────────────────────
function getConfig() {
  return new Promise(resolve => {
    chrome.storage.sync.get({
      apiUrl:          '',
      webhookSecret:   '',
      cities:          'canakkale',
      intervalMinutes: 10,
      maxPages:        3,
      enabled:         false,
    }, resolve);
  });
}

// ─── Alarm Kurulumu ───────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[EmlakRadar] Extension yüklendi');
  const cfg = await getConfig();
  await chrome.alarms.clearAll();
  chrome.alarms.create('scrape', {
    delayInMinutes: 1,
    periodInMinutes: cfg.intervalMinutes || 10,
  });
});

// Interval değişince alarm'ı güncelle
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.intervalMinutes) {
    const minutes = changes.intervalMinutes.newValue || 10;
    await chrome.alarms.clearAll();
    chrome.alarms.create('scrape', { delayInMinutes: 1, periodInMinutes: minutes });
    console.log(`[EmlakRadar] Zamanlayıcı: ${minutes} dakika`);
  }
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'scrape') await runAllScrapers();
});

// ─── Popup Mesajları ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'manual_scrape') {
    runAllScrapers(true) // force=true → toggle'ı atla
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.type === 'get_status') {
    chrome.storage.local.get(['lastScrapeTime', 'lastScrapeCount', 'lastError'], data => {
      sendResponse(data);
    });
    return true;
  }
});

// ─── Ana Koordinatör ──────────────────────────────────────────────────────────
async function runAllScrapers(force = false) {
  const cfg = await getConfig();

  if (!force && !cfg.enabled) {
    console.log('[EmlakRadar] Devre dışı — atlandı');
    return;
  }
  if (!cfg.apiUrl || !cfg.webhookSecret) {
    console.warn('[EmlakRadar] API URL veya Webhook Secret eksik');
    await chrome.storage.local.set({ lastError: 'API URL veya Webhook Secret girilmemiş' });
    return;
  }

  await chrome.storage.local.set({ lastError: '' });
  const cities = cfg.cities.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
  const jobs   = buildJobs(cities, cfg.maxPages);

  console.log(`[EmlakRadar] Scrape başladı — ${jobs.length} iş, şehirler: ${cities.join(', ')}`);

  // ── Tek sekme aç, tüm işleri sırayla o sekmede yap ──────────────────────
  const tab = await createTab(jobs[0].url);
  const tabId = tab.id;
  let toplamYeni = 0;

  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      try {
        // İlk iş zaten yüklü, diğerleri için navigate et
        if (i > 0) await navigateTab(tabId, job.url);

        const ilanlar = await injectAndCollect(tabId, job);
        const yeniler = await filterYeni(ilanlar);

        if (yeniler.length > 0) {
          await sendWebhook(yeniler, cfg);
          await markGoruldu(yeniler);
          toplamYeni += yeniler.length;
        }

        console.log(`[EmlakRadar] ${job.site} | ${job.tip} | ${job.city} → ${ilanlar.length} ilan, ${yeniler.length} yeni`);
      } catch (err) {
        console.error(`[EmlakRadar] Hata (${job.site}):`, err.message);
        await chrome.storage.local.set({ lastError: `${job.site}: ${err.message}` });
      }

      await sleep(1500 + Math.random() * 1500);
    }
  } finally {
    chrome.tabs.remove(tabId).catch(() => {});
  }

  await chrome.storage.local.set({
    lastScrapeTime:  new Date().toISOString(),
    lastScrapeCount: toplamYeni,
  });

  console.log(`[EmlakRadar] Tamamlandı — ${toplamYeni} yeni ilan`);
}

// ─── Job Listesi ──────────────────────────────────────────────────────────────
function buildJobs(cities, maxPages) {
  const jobs = [];

  for (const city of cities) {
    // Sahibinden
    for (const tip of ['satilik', 'kiralik']) {
      const kategori = tip === 'satilik' ? 'satilik-daire' : 'kiralik-daire';
      const yol = city === 'istanbul' ? `/${kategori}` : `/${kategori}/${city}`;
      jobs.push({ site: 'sahibinden', url: `https://www.sahibinden.com${yol}`, tip, city, maxPages });
    }

    // Hepsiemlak
    for (const tip of ['satilik', 'kiralik']) {
      jobs.push({
        site: 'hepsiemlak',
        url:  `https://www.hepsiemlak.com/${city}-${tip}/daire`,
        tip, city, maxPages,
      });
    }

    // Emlakjet
    for (const tip of ['satilik', 'kiralik']) {
      const kategori = tip === 'satilik' ? 'satilik-daire' : 'kiralik-daire';
      jobs.push({
        site: 'emlakjet',
        url:  `https://www.emlakjet.com/${kategori}/${city}/`,
        tip, city, maxPages,
      });
    }
  }

  return jobs;
}

// ─── Tek Sekme Yardımcıları ───────────────────────────────────────────────────

// Yeni sekme aç ve yüklenmesini bekle
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

// Mevcut sekmeyi yeni URL'ye yönlendir ve yüklenmesini bekle
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

// Sekmeye content script inject et ve sonucu bekle
function injectAndCollect(tabId, job) {
  return new Promise(resolve => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      chrome.runtime.onMessage.removeListener(onMsg);
      console.warn(`[EmlakRadar] Timeout: ${job.url}`);
      resolve([]);
    }, 90000);

    function onMsg(msg, sender) {
      if (sender.tab?.id !== tabId || msg.type !== 'emlakradar_result') return;
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMsg);
      resolve(msg.ilanlar || []);
    }

    chrome.runtime.onMessage.addListener(onMsg);

    chrome.scripting.executeScript({
      target: { tabId },
      func:   getContentFn(job.site),
      args:   [job.tip, job.city, job.maxPages],
    }).catch(err => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMsg);
      console.error('[EmlakRadar] executeScript hata:', err.message);
      resolve([]);
    });
  });
}

function getContentFn(site) {
  switch (site) {
    case 'sahibinden': return sahibindenScript;
    case 'hepsiemlak': return hepsiemlakScript;
    case 'emlakjet':   return emlakjetScript;
    default: return () => chrome.runtime.sendMessage({ type: 'emlakradar_result', ilanlar: [] });
  }
}

// ─── cPanel Webhook ───────────────────────────────────────────────────────────
async function sendWebhook(ilanlar, cfg) {
  const BATCH = 10;
  for (let i = 0; i < ilanlar.length; i += BATCH) {
    const batch   = ilanlar.slice(i, i + BATCH);
    const body    = JSON.stringify({
      tip:    'yeni_ilan',
      ilanlar: batch,
      zaman:  new Date().toISOString(),
      kaynak: batch[0]?.kaynak_site ?? 'unknown',
    });
    const sig = await signPayload(body, cfg.webhookSecret);

    const res = await fetch(cfg.apiUrl, {
      method:  'POST',
      headers: {
        'Content-Type':        'application/json',
        'X-Webhook-Signature': sig,
        'X-Webhook-Source':    'emlakradar-extension',
        'X-Webhook-Timestamp': new Date().toISOString(),
        'User-Agent':          'EmlakRadarExtension/1.0',
      },
      body,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${txt.substring(0, 200)}`);
    }
  }
}

// ─── Deduplication (chrome.storage.local) ─────────────────────────────────────
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
      chrome.storage.local.set({ seenIds: updated.slice(-10000) }, resolve);
    });
  });
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// =============================================================================
// CONTENT SCRIPTS (executeScript ile inject edilir — her biri bağımsız fonksiyon)
// =============================================================================

// ─── Sahibinden ───────────────────────────────────────────────────────────────
async function sahibindenScript(tip, city, maxPages) {
  const BASE = 'https://www.sahibinden.com';
  const ITEMS_PER_PAGE = 28;

  async function waitFor(selector, ms = 30000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelectorAll(selector).length > 0) return true;
      await new Promise(r => setTimeout(r, 1500));
    }
    return false;
  }

  function parseSayfa() {
    const ilanlar = [];
    document.querySelectorAll('tr.searchResultsItem').forEach(satir => {
      try {
        const id = satir.getAttribute('data-id') || '';
        if (!id) return;

        const baslikEl  = satir.querySelector('.classifiedTitle');
        const baslik    = baslikEl?.textContent?.trim() || '';
        const href      = baslikEl?.getAttribute('href') || '';
        const kaynak_url = href.startsWith('http') ? href : BASE + href;

        const fiyatEl  = satir.querySelector('td.searchResultsPriceValue span');
        const fiyat    = parseFloat(
          (fiyatEl?.textContent?.trim() || '').replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'')
        ) || 0;

        const lokEl   = satir.querySelector('td.searchResultsLocationValue');
        const lokHtml = lokEl?.innerHTML || '';
        const lokPar  = lokHtml.split(/<br\s*\/?>/i)
          .map(s => s.replace(/<[^>]+>/g,'').trim()).filter(Boolean);

        const attrs     = satir.querySelectorAll('td.searchResultsAttributeValue');
        const metrekare = parseFloat(
          (attrs[0]?.textContent?.trim()||'').replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'')
        ) || null;
        const odaText = attrs[1]?.textContent?.trim() || '';

        const imgEl    = satir.querySelector('td.searchResultsLargeThumbnail img');
        const foto     = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('data-lazy') || imgEl?.src || '';
        const tarihEl  = satir.querySelector('.searchResultsDateValue');
        const tarih    = tarihEl?.textContent?.trim() || '';

        ilanlar.push({
          kaynak_site: 'sahibinden', kaynak_url, kaynak_id: id,
          baslik, aciklama: '', fiyat, fiyat_birimi: 'TL', tip, kategori: 'daire',
          sehir: lokPar[0] || city, ilce: lokPar[1] || '', mahalle: lokPar[2] || '',
          adres: lokPar.join(', '),
          metrekare: metrekare || undefined, oda_sayisi: odaText || undefined,
          fotograflar: (foto && foto.startsWith('http') && !foto.includes('blank') && !foto.includes('/assets/')) ? [foto] : [],
          ilan_tarihi: tarih || undefined, taranan_at: new Date().toISOString(),
        });
      } catch (_) {}
    });
    return ilanlar;
  }

  function getTotalPages() {
    try {
      const txt = document.querySelector('.searchResultsTagArea .resultCount')?.textContent?.trim() || '0';
      return Math.ceil((parseInt(txt.replace(/[^\d]/g,'')) || 0) / ITEMS_PER_PAGE);
    } catch { return 1; }
  }

  async function navigateTo(url) {
    return new Promise(resolve => {
      window.location.href = url;
      const timer = setInterval(() => {
        if (document.readyState === 'complete') { clearInterval(timer); resolve(); }
      }, 500);
    });
  }

  // İlk sayfa zaten yüklü
  const found = await waitFor('tr.searchResultsItem');
  if (!found) {
    chrome.runtime.sendMessage({ type: 'emlakradar_result', ilanlar: [] });
    return;
  }

  const toplamSayfa = Math.min(getTotalPages(), maxPages || 3);
  const tumIlanlar  = [];

  for (let sayfa = 1; sayfa <= toplamSayfa; sayfa++) {
    if (sayfa > 1) {
      const url = window.location.href.split('?')[0] + `?pagingOffset=${(sayfa - 1) * ITEMS_PER_PAGE}`;
      await navigateTo(url);
      await waitFor('tr.searchResultsItem');
    }
    tumIlanlar.push(...parseSayfa());
    await new Promise(r => setTimeout(r, 1500));
  }

  chrome.runtime.sendMessage({ type: 'emlakradar_result', ilanlar: tumIlanlar });
}

// ─── Hepsiemlak ───────────────────────────────────────────────────────────────
async function hepsiemlakScript(tip, city, maxPages) {
  const BASE = 'https://www.hepsiemlak.com';
  const ITEMS_PER_PAGE = 25;

  async function waitFor(selector, ms = 20000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelectorAll(selector).length > 2) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  function parseSayfa() {
    const ilanlar = [];
    const sellar  = ['.listing-item', '.listing-item-v2', 'li[data-id]', '[data-listing-id]'];

    let kartlar = null;
    for (const sel of sellar) {
      const f = document.querySelectorAll(sel);
      if (f.length > 2) { kartlar = f; break; }
    }
    if (!kartlar) return ilanlar;

    kartlar.forEach(kart => {
      try {
        let id = kart.getAttribute('data-id') || kart.getAttribute('data-listing-id') || '';
        const baslikEl = kart.querySelector('h2 a, h3 a, .listing-card-title a, .listing-title a, a[title], a[class*="title"]');
        const href     = (baslikEl || kart.querySelector('a'))?.getAttribute('href') || '';

        if (!id && href) {
          const m = href.match(/[/-](\d{6,})(?:\/|$|\?)/);
          id = m ? m[1] : '';
        }
        if (!id) return;

        const baslik     = baslikEl?.textContent?.trim() || (baslikEl || kart.querySelector('a'))?.getAttribute('title') || '';
        const kaynak_url = href.startsWith('http') ? href : BASE + href;

        const fiyatEl = kart.querySelector('[class*="price"], [class*="fiyat"]');
        const fiyat   = parseFloat(
          (fiyatEl?.textContent?.trim()||'').replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'')
        ) || 0;

        const lokEl  = kart.querySelector('[class*="location"], [class*="adres"], [class*="konum"]');
        const lokTxt = lokEl?.textContent?.trim() || '';
        const lokPar = lokTxt.split(/[\/,]/).map(s => s.trim()).filter(Boolean);

        const m2El     = kart.querySelector('[class*="m2"], [class*="meter"], [class*="area"]');
        const metrekare = parseFloat(
          (m2El?.textContent?.trim()||'').replace(/[^\d,]/g,'').replace(',','.')
        ) || null;

        const odaEl  = kart.querySelector('[class*="room"], [class*="oda"]');
        const imgEl  = kart.querySelector('img');
        const foto   = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('data-lazy') || imgEl?.src || '';

        ilanlar.push({
          kaynak_site: 'hepsiemlak', kaynak_url, kaynak_id: `he_${id}`,
          baslik, aciklama: '', fiyat, fiyat_birimi: 'TL', tip, kategori: 'daire',
          sehir: lokPar[0] || city, ilce: lokPar[1] || '', mahalle: lokPar[2] || '',
          adres: lokTxt, metrekare: metrekare || undefined,
          oda_sayisi: odaEl?.textContent?.trim() || undefined,
          fotograflar: (foto && foto.startsWith('http') && !foto.includes('no-image')) ? [foto] : [],
          taranan_at: new Date().toISOString(),
        });
      } catch (_) {}
    });
    return ilanlar;
  }

  function getTotalPages() {
    try {
      const sel = '.total-count, [class*="result-count"], [class*="listing-count"], [class*="total-result"]';
      const txt = document.querySelector(sel)?.textContent?.trim() || '0';
      return Math.ceil((parseInt(txt.replace(/[^\d]/g,'')) || 0) / ITEMS_PER_PAGE);
    } catch { return 1; }
  }

  await waitFor('.listing-item, .listing-item-v2, [data-listing-id]');

  const toplamSayfa = Math.min(getTotalPages(), maxPages || 3);
  const tumIlanlar  = [];

  for (let sayfa = 1; sayfa <= toplamSayfa; sayfa++) {
    if (sayfa > 1) {
      const baseUrl = window.location.href.split('?')[0];
      window.location.href = `${baseUrl}?page=${sayfa}`;
      await new Promise(r => setTimeout(r, 3000));
      await waitFor('.listing-item, .listing-item-v2, [data-listing-id]');
    }
    tumIlanlar.push(...parseSayfa());
    await new Promise(r => setTimeout(r, 1000));
  }

  // Dedup
  const seenIds = new Set();
  const uniq    = tumIlanlar.filter(i => { if (seenIds.has(i.kaynak_id)) return false; seenIds.add(i.kaynak_id); return true; });
  chrome.runtime.sendMessage({ type: 'emlakradar_result', ilanlar: uniq });
}

// ─── Emlakjet ─────────────────────────────────────────────────────────────────
async function emlakjetScript(tip, city, maxPages) {
  const BASE = 'https://www.emlakjet.com';
  const ITEMS_PER_PAGE = 20;

  async function waitFor(ms = 15000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const sel = '[class*="listing-card"], [class*="ListingCard"], [class*="property-card"], article[data-id], a[href*="/ilan/"]';
      if (document.querySelectorAll(sel).length > 0) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  function parseSayfa() {
    const ilanlar = [];
    const sellar  = [
      '[class*="listing-card"]', '[class*="ListingCard"]',
      '[class*="property-card"]', 'article[data-id]', 'a[href*="/ilan/"]',
    ];

    let kartlar = null;
    for (const sel of sellar) {
      const f = document.querySelectorAll(sel);
      if (f.length > 0) { kartlar = f; break; }
    }
    if (!kartlar) return ilanlar;

    kartlar.forEach(kart => {
      try {
        let id   = kart.getAttribute('data-id') || kart.getAttribute('data-listing-id') || '';
        const aEl = kart.tagName === 'A' ? kart : kart.querySelector('a');
        const href = aEl?.getAttribute('href') || aEl?.href || '';

        if (!id && href) {
          const m = href.match(/\/ilan\/(\d+)/) || href.match(/[/-](\d{6,})(?:\/|$|\?)/);
          id = m ? m[1] : '';
        }
        if (!id) return;

        const kaynak_url = href.startsWith('http') ? href : BASE + href;

        const baslikEl = kart.querySelector('[class*="title"], [class*="Title"], h2, h3');
        const baslik   = baslikEl?.textContent?.trim() || '';

        const fiyatEl = kart.querySelector('[class*="price"], [class*="Price"], [class*="fiyat"]');
        const fiyat   = parseFloat(
          (fiyatEl?.textContent?.trim()||'').replace(/[^\d]/g,'')
        ) || 0;

        const lokEl  = kart.querySelector('[class*="location"], [class*="Location"], [class*="adres"]');
        const lokTxt = lokEl?.textContent?.trim() || '';
        const lokPar = lokTxt.split(/[,\/]/).map(s => s.trim()).filter(Boolean);

        const m2El     = kart.querySelector('[class*="m2"], [class*="area"], [class*="Area"]');
        const metrekare = parseFloat(
          (m2El?.textContent?.trim()||'').replace(/[^\d,]/g,'').replace(',','.')
        ) || null;

        const odaEl = kart.querySelector('[class*="room"], [class*="Room"], [class*="oda"]');
        const imgEl = kart.querySelector('img');
        const foto  = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('data-lazy') || imgEl?.src || '';

        ilanlar.push({
          kaynak_site: 'emlakjet', kaynak_url, kaynak_id: `ej_${id}`,
          baslik, aciklama: '', fiyat, fiyat_birimi: 'TL', tip, kategori: 'daire',
          sehir: lokPar[0] || city, ilce: lokPar[1] || '', mahalle: lokPar[2] || '',
          adres: lokTxt, metrekare: metrekare || undefined,
          oda_sayisi: odaEl?.textContent?.trim() || undefined,
          fotograflar: (foto && foto.startsWith('http') && !foto.includes('no-image')) ? [foto] : [],
          taranan_at: new Date().toISOString(),
        });
      } catch (_) {}
    });

    const seen = new Set();
    return ilanlar.filter(i => { if (seen.has(i.kaynak_id)) return false; seen.add(i.kaynak_id); return true; });
  }

  function getTotalPages() {
    try {
      const sel = '[class*="result-count"], [class*="listing-count"], [class*="count"]';
      const txt = document.querySelector(sel)?.textContent?.trim() || '0';
      return Math.ceil((parseInt(txt.replace(/[^\d]/g,'')) || 0) / ITEMS_PER_PAGE);
    } catch { return 1; }
  }

  await waitFor();

  // Scroll ile lazy-load tetikle
  window.scrollTo(0, document.body.scrollHeight / 2);
  await new Promise(r => setTimeout(r, 1000));
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise(r => setTimeout(r, 1000));

  const toplamSayfa = Math.min(getTotalPages(), maxPages || 3);
  const tumIlanlar  = [];

  for (let sayfa = 1; sayfa <= toplamSayfa; sayfa++) {
    if (sayfa > 1) {
      const base = window.location.href.split('?')[0];
      window.location.href = `${base}?page=${sayfa}`;
      await new Promise(r => setTimeout(r, 3000));
      await waitFor();
    }
    tumIlanlar.push(...parseSayfa());
    await new Promise(r => setTimeout(r, 1000));
  }

  chrome.runtime.sendMessage({ type: 'emlakradar_result', ilanlar: tumIlanlar });
}
