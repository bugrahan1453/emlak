'use strict';
/**
 * EmlakRadar Chrome Extension — Background Service Worker
 * Tek sekme mimarisi: background pagination kontrolü
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
      maxPages:        5,
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
    runAllScrapers(true)
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

  // Tek sekme aç, tüm işleri sırayla o sekmede yap
  const tab = await createTab(jobs[0].url);
  const tabId = tab.id;
  let toplamYeni = 0;

  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      try {
        if (i > 0) await navigateTab(tabId, job.url);

        const ilanlar = await injectAndCollect(tabId, job);
        const yeniler = await filterYeni(ilanlar);

        if (yeniler.length > 0) {
          await sendWebhook(yeniler, cfg);
          await markGoruldu(yeniler);
          toplamYeni += yeniler.length;
        }

        console.log(`[EmlakRadar] ${job.site} | ${job.kategori} | ${job.tip} | ${job.city} → ${ilanlar.length} ilan, ${yeniler.length} yeni`);
      } catch (err) {
        console.error(`[EmlakRadar] Hata (${job.site} ${job.kategori}):`, err.message);
        await chrome.storage.local.set({ lastError: `${job.site}: ${err.message}` });
      }

      await sleep(1200 + Math.random() * 1000);
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
    // Sahibinden — daire + arsa + müstakil
    const sbKats = [
      { slug: 'satilik-daire',      tip: 'satilik', kategori: 'daire' },
      { slug: 'kiralik-daire',      tip: 'kiralik', kategori: 'daire' },
      { slug: 'satilik-arsa',       tip: 'satilik', kategori: 'arsa' },
      { slug: 'satilik-mustakil-ev',tip: 'satilik', kategori: 'mustakil' },
      { slug: 'satilik-villa',      tip: 'satilik', kategori: 'villa' },
    ];
    for (const k of sbKats) {
      const yol = city === 'istanbul' ? `/${k.slug}` : `/${k.slug}/${city}`;
      jobs.push({ site: 'sahibinden', url: `https://www.sahibinden.com${yol}`, tip: k.tip, kategori: k.kategori, city, maxPages });
    }

    // Hepsiemlak — daire + arsa
    const heKats = [
      { slug: `${city}-satilik/daire`,   tip: 'satilik', kategori: 'daire' },
      { slug: `${city}-kiralik/daire`,   tip: 'kiralik', kategori: 'daire' },
      { slug: `${city}-satilik/arsa`,    tip: 'satilik', kategori: 'arsa' },
    ];
    for (const k of heKats) {
      jobs.push({ site: 'hepsiemlak', url: `https://www.hepsiemlak.com/${k.slug}`, tip: k.tip, kategori: k.kategori, city, maxPages });
    }

    // Emlakjet — daire + arsa
    const ejKats = [
      { slug: 'satilik-daire',   tip: 'satilik', kategori: 'daire' },
      { slug: 'kiralik-daire',   tip: 'kiralik', kategori: 'daire' },
      { slug: 'satilik-arsa',    tip: 'satilik', kategori: 'arsa' },
    ];
    for (const k of ejKats) {
      jobs.push({ site: 'emlakjet', url: `https://www.emlakjet.com/${k.slug}/${city}/`, tip: k.tip, kategori: k.kategori, city, maxPages });
    }
  }

  return jobs;
}

// ─── Tek Sekme Yardımcıları ───────────────────────────────────────────────────

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

// Background pagination kontrolü — content script sadece mevcut sayfayı parse eder
async function injectAndCollect(tabId, job) {
  const allIlanlar = [];
  let page = 1;

  while (page <= (job.maxPages || 5)) {
    const result = await injectOnce(tabId, job);
    allIlanlar.push(...(result.ilanlar || []));

    if (!result.nextUrl || page >= (job.maxPages || 5)) break;

    await navigateTab(tabId, result.nextUrl);
    await sleep(1200 + Math.random() * 800);
    page++;
  }

  // Dedup
  const seen = new Set();
  return allIlanlar.filter(i => {
    if (seen.has(i.kaynak_id)) return false;
    seen.add(i.kaynak_id);
    return true;
  });
}

function injectOnce(tabId, job) {
  return new Promise(resolve => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      chrome.runtime.onMessage.removeListener(onMsg);
      console.warn('[EmlakRadar] Sayfa timeout:', job.url);
      resolve({ ilanlar: [], nextUrl: null });
    }, 60000);

    function onMsg(msg, sender) {
      if (sender.tab?.id !== tabId || msg.type !== 'emlakradar_page') return;
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMsg);
      resolve({ ilanlar: msg.ilanlar || [], nextUrl: msg.nextUrl || null });
    }

    chrome.runtime.onMessage.addListener(onMsg);

    chrome.scripting.executeScript({
      target: { tabId },
      func:   getContentFn(job.site),
      args:   [job.tip, job.kategori, job.city],
    }).catch(err => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMsg);
      console.error('[EmlakRadar] executeScript hata:', err.message);
      resolve({ ilanlar: [], nextUrl: null });
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

// ─── cPanel Webhook ───────────────────────────────────────────────────────────
async function sendWebhook(ilanlar, cfg) {
  const BATCH = 10;
  for (let i = 0; i < ilanlar.length; i += BATCH) {
    const batch = ilanlar.slice(i, i + BATCH);
    const body  = JSON.stringify({
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

    const json = await res.json().catch(() => ({}));
    console.log(`[EmlakRadar] Webhook yanıtı:`, json);
  }
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
      chrome.storage.local.set({ seenIds: updated.slice(-10000) }, resolve);
    });
  });
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT SCRIPTS
// Her site için: mevcut sayfayı parse et + nextUrl bul
// Background pagination kontrolü yapar (window.location.href kullanılmaz)
// ─────────────────────────────────────────────────────────────────────────────

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

  const found = await waitFor('tr.searchResultsItem');
  if (!found) {
    chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar: [], nextUrl: null });
    return;
  }

  // Lazy image yükle
  window.scrollTo(0, document.body.scrollHeight / 2);
  await new Promise(r => setTimeout(r, 600));
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise(r => setTimeout(r, 600));
  window.scrollTo(0, 0);

  const ilanlar = [];
  document.querySelectorAll('tr.searchResultsItem').forEach(satir => {
    try {
      const id = satir.getAttribute('data-id') || '';
      if (!id) return;

      const baslikEl  = satir.querySelector('.classifiedTitle');
      const baslik    = baslikEl?.textContent?.trim() || '';
      const href      = baslikEl?.getAttribute('href') || '';
      const kaynak_url = href.startsWith('http') ? href : BASE + href;
      if (!kaynak_url || !baslik) return;

      const fiyatEl = satir.querySelector('td.searchResultsPriceValue span');
      const fiyat   = parseFloat(
        (fiyatEl?.textContent?.trim() || '').replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'')
      ) || 0;

      // Konum
      const lokEl   = satir.querySelector('td.searchResultsLocationValue');
      const lokHtml = lokEl?.innerHTML || '';
      const lokPar  = lokHtml.split(/<br\s*\/?>/i)
        .map(s => s.replace(/<[^>]+>/g,'').trim()).filter(Boolean);

      // Özellikler (m², oda, kat, bina yaşı vb.)
      const attrs    = Array.from(satir.querySelectorAll('td.searchResultsAttributeValue'));
      const attrTxt  = attrs.map(a => a.textContent?.trim() || '');

      const metrekare = parseFloat(
        (attrTxt[0] || '').replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'')
      ) || null;
      const odaText = attrTxt[1] || '';

      // Fotoğraflar — thumbnail + data-src varyantları
      const imgs = [];
      satir.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
        if (src && src.startsWith('http') && !src.includes('blank') && !src.includes('/assets/') && !src.includes('spacer'))
          imgs.push(src);
      });

      const tarihEl = satir.querySelector('.searchResultsDateValue');
      const tarih   = tarihEl?.textContent?.trim() || '';

      ilanlar.push({
        kaynak_site: 'sahibinden',
        kaynak_url,
        kaynak_id:   id,
        baslik,
        aciklama:    '',
        fiyat,
        fiyat_birimi:'TL',
        tip,
        kategori,
        sehir:       lokPar[0] || city,
        ilce:        lokPar[1] || '',
        mahalle:     lokPar[2] || '',
        adres:       lokPar.join(', '),
        metrekare:   metrekare || undefined,
        oda_sayisi:  odaText || undefined,
        fotograflar: imgs,
        ilan_tarihi: tarih || undefined,
        taranan_at:  new Date().toISOString(),
      });
    } catch (_) {}
  });

  // Sonraki sayfa
  let nextUrl = null;
  const nextEl = document.querySelector('a.prevNextBut[title*="Sonraki"], a[title*="Sonraki sayfa"], a[aria-label*="Sonraki"]');
  if (nextEl) {
    const href = nextEl.getAttribute('href') || '';
    nextUrl = href.startsWith('http') ? href : BASE + href;
  }

  chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar, nextUrl });
}

// ─── Hepsiemlak ───────────────────────────────────────────────────────────────
async function hepsiemlakScript(tip, kategori, city) {
  const BASE = 'https://www.hepsiemlak.com';

  async function waitFor(selector, ms = 25000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelectorAll(selector).length > 0) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  const SEL = '.listing-item, .listing-item-v2, li[data-id], [data-listing-id]';
  await waitFor(SEL);

  window.scrollTo(0, document.body.scrollHeight / 2);
  await new Promise(r => setTimeout(r, 800));
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise(r => setTimeout(r, 800));

  const ilanlar = [];
  document.querySelectorAll(SEL).forEach(kart => {
    try {
      let id = kart.getAttribute('data-id') || kart.getAttribute('data-listing-id') || '';

      const baslikEl  = kart.querySelector('h2 a, h3 a, .listing-card-title a, a[title], a[class*="title"]');
      const anyA      = baslikEl || kart.querySelector('a');
      const href      = anyA?.getAttribute('href') || '';

      if (!id && href) {
        const m = href.match(/[/-](\d{6,})(?:\/|$|\?)/);
        id = m ? m[1] : '';
      }
      if (!id) return;

      const baslik    = baslikEl?.textContent?.trim() || anyA?.getAttribute('title') || '';
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
      const metrekare = parseFloat(
        (m2El?.textContent?.trim() || '').replace(/[^\d,]/g,'').replace(',','.')
      ) || null;

      const odaEl = kart.querySelector('[class*="room"], [class*="oda"]');

      const imgs = [];
      kart.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
        if (src && src.startsWith('http') && !src.includes('no-image') && src.length > 15)
          imgs.push(src);
      });

      ilanlar.push({
        kaynak_site: 'hepsiemlak',
        kaynak_url,
        kaynak_id:   `he_${id}`,
        baslik,
        aciklama:    '',
        fiyat,
        fiyat_birimi:'TL',
        tip,
        kategori,
        sehir:       lokPar[0] || city,
        ilce:        lokPar[1] || '',
        mahalle:     lokPar[2] || '',
        adres:       lokTxt,
        metrekare:   metrekare || undefined,
        oda_sayisi:  odaEl?.textContent?.trim() || undefined,
        fotograflar: imgs,
        taranan_at:  new Date().toISOString(),
      });
    } catch (_) {}
  });

  // Sonraki sayfa
  let nextUrl = null;
  const nextEl = document.querySelector(
    'a[rel="next"], .he-pagination__navigate--next a, a[title*="Sonraki"], [class*="pagination"] [class*="next"] a'
  );
  if (nextEl) {
    const href = nextEl.getAttribute('href') || '';
    nextUrl = href.startsWith('http') ? href : BASE + href;
  }

  chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar, nextUrl });
}

// ─── Emlakjet ─────────────────────────────────────────────────────────────────
async function emlakjetScript(tip, kategori, city) {
  const BASE = 'https://www.emlakjet.com';

  async function waitFor(ms = 20000) {
    const start = Date.now();
    const SEL = '[class*="listing-card"], [class*="ListingCard"], [class*="property-card"], article[data-id]';
    while (Date.now() - start < ms) {
      if (document.querySelectorAll(SEL).length > 0) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  await waitFor();

  window.scrollTo(0, document.body.scrollHeight / 2);
  await new Promise(r => setTimeout(r, 800));
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise(r => setTimeout(r, 800));

  const SEL = '[class*="listing-card"], [class*="ListingCard"], [class*="property-card"], article[data-id]';
  const ilanlar = [];

  document.querySelectorAll(SEL).forEach(kart => {
    try {
      let id = kart.getAttribute('data-id') || kart.getAttribute('data-listing-id') || '';
      const aEl  = kart.tagName === 'A' ? kart : kart.querySelector('a');
      const href = aEl?.getAttribute('href') || aEl?.href || '';

      if (!id && href) {
        const m = href.match(/\/ilan\/(\d+)/) || href.match(/[/-](\d{6,})(?:\/|$|\?)/);
        id = m ? m[1] : '';
      }
      if (!id) return;

      const kaynak_url = href.startsWith('http') ? href : BASE + href;

      const baslikEl = kart.querySelector('[class*="title"], [class*="Title"], h2, h3');
      const baslik   = baslikEl?.textContent?.trim() || '';
      if (!kaynak_url || !baslik) return;

      const fiyatEl = kart.querySelector('[class*="price"], [class*="Price"], [class*="fiyat"]');
      const fiyat   = parseFloat(
        (fiyatEl?.textContent?.trim() || '').replace(/[^\d]/g,'')
      ) || 0;

      const lokEl  = kart.querySelector('[class*="location"], [class*="Location"], [class*="adres"]');
      const lokTxt = lokEl?.textContent?.trim() || '';
      const lokPar = lokTxt.split(/[,\/]/).map(s => s.trim()).filter(Boolean);

      const m2El     = kart.querySelector('[class*="m2"], [class*="area"], [class*="Area"]');
      const metrekare = parseFloat(
        (m2El?.textContent?.trim() || '').replace(/[^\d,]/g,'').replace(',','.')
      ) || null;

      const odaEl = kart.querySelector('[class*="room"], [class*="Room"], [class*="oda"]');

      const imgs = [];
      kart.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
        if (src && src.startsWith('http') && !src.includes('no-image'))
          imgs.push(src);
      });

      ilanlar.push({
        kaynak_site: 'emlakjet',
        kaynak_url,
        kaynak_id:   `ej_${id}`,
        baslik,
        aciklama:    '',
        fiyat,
        fiyat_birimi:'TL',
        tip,
        kategori,
        sehir:       lokPar[0] || city,
        ilce:        lokPar[1] || '',
        mahalle:     lokPar[2] || '',
        adres:       lokTxt,
        metrekare:   metrekare || undefined,
        oda_sayisi:  odaEl?.textContent?.trim() || undefined,
        fotograflar: imgs,
        taranan_at:  new Date().toISOString(),
      });
    } catch (_) {}
  });

  // Sonraki sayfa
  let nextUrl = null;
  const nextEl = document.querySelector(
    'a[rel="next"], [class*="pagination"] a[class*="next"], [class*="Pagination"] a[class*="Next"]'
  );
  if (nextEl) {
    const href = nextEl.getAttribute('href') || '';
    nextUrl = href.startsWith('http') ? href : BASE + href;
  }

  chrome.runtime.sendMessage({ type: 'emlakradar_page', ilanlar, nextUrl });
}
