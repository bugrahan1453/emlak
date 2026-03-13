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

// ─── Kullanıcı Ayarları (sadece şehir + interval) ─────────────────────────────
function getConfig() {
  return new Promise(resolve => {
    chrome.storage.sync.get({
      cities:          DEFAULT_CITIES,
      intervalMinutes: 10,
      enabled:         true,
    }, resolve);
  });
}

// ─── Canlı Log → Popup'a gönder ───────────────────────────────────────────────
function sendProgress(msg, type = 'info') {
  chrome.storage.local.set({ progress: { msg, type, ts: Date.now() } });
}

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
    chrome.storage.local.get(['lastScrapeTime', 'lastScrapeCount', 'lastError', 'progress', 'isRunning'], data => {
      sendResponse(data);
    });
    return true;
  }
  if (msg.type === 'save_config') {
    chrome.storage.sync.set(msg.cfg).then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ─── Bot Bloğu Kontrolü ───────────────────────────────────────────────────────
async function checkBotBlock(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const txt = document.body?.innerText || '';
        return txt.includes('Olağan dışı erişim') ||
               txt.includes('olağan dışı') ||
               txt.includes('robot') ||
               document.title.toLowerCase().includes('erişim engellendi');
      },
    });
    return results?.[0]?.result === true;
  } catch (_) { return false; }
}

// ─── Ana Koordinatör ──────────────────────────────────────────────────────────
let isRunning = false;

async function runAllScrapers(force = false) {
  if (isRunning) { console.log('[EmlakRadar] Zaten çalışıyor, atlandı'); return; }
  const cfg = await getConfig();
  if (!force && !cfg.enabled) { console.log('[EmlakRadar] Devre dışı'); return; }

  isRunning = true;
  await chrome.storage.local.set({ isRunning: true, lastError: '' });

  const cities = cfg.cities.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
  const jobs   = buildJobs(cities, MAX_PAGES);

  console.log(`[EmlakRadar] Başladı — ${jobs.length} iş`);
  sendProgress(`Başlıyor... ${cities.join(', ')} için ${jobs.length} kategori`);

  const tab = await createTab(jobs[0].url);
  const tabId = tab.id;
  let toplamYeni = 0;

  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      try {
        sendProgress(`${job.site} · ${job.kategori} · ${job.city} — liste tarıyor...`);

        if (i > 0) await navigateTab(tabId, job.url);

        // Bot bloğu kontrolü
        if (await checkBotBlock(tabId)) {
          sendProgress(`⚠️ Bot bloğu — ${job.site} 5 dk beklenecek`, 'error');
          await sleep(5 * 60 * 1000);
          continue;
        }

        // 1. Liste sayfalarını tara
        const ilanlar = await injectAndCollect(tabId, job);

        // 2. Sadece yeni olanları filtrele
        const yeniler = await filterYeni(ilanlar);

        if (yeniler.length > 0) {
          // 3. Her yeni ilan için detay sayfasına gir
          sendProgress(`${job.site} · ${job.kategori} · ${job.city} — ${yeniler.length} yeni ilan detayları çekiliyor...`);
          const zenginIlanlar = await scrapeDetails(tabId, yeniler, job.site);

          // 4. Webhook'a gönder
          await sendWebhook(zenginIlanlar, cfg);
          await markGoruldu(zenginIlanlar);
          toplamYeni += zenginIlanlar.length;

          sendProgress(`✓ ${job.site} · ${job.kategori} · ${job.city} — ${zenginIlanlar.length} ilan eklendi`, 'ok');
        } else {
          sendProgress(`${job.site} · ${job.kategori} · ${job.city} — ${ilanlar.length} ilan (hepsi zaten kayıtlı)`);
        }

        console.log(`[EmlakRadar] ${job.site}|${job.kategori}|${job.city} → ${ilanlar.length} tarındı, ${yeniler.length} yeni`);
      } catch (err) {
        console.error(`[EmlakRadar] Hata (${job.site} ${job.kategori}):`, err.message);
        await chrome.storage.local.set({ lastError: `${job.site}: ${err.message}` });
        sendProgress(`Hata: ${job.site} - ${err.message}`, 'error');
      }

      // Siteler arası insan gibi bekleme: 8–18 saniye
      await sleep(8000 + Math.random() * 10000);
    }
  } finally {
    chrome.tabs.remove(tabId).catch(() => {});
    isRunning = false;
    await chrome.storage.local.set({
      isRunning:       false,
      lastScrapeTime:  new Date().toISOString(),
      lastScrapeCount: toplamYeni,
    });
    sendProgress(`Tamamlandı — toplam ${toplamYeni} yeni ilan eklendi`, 'done');
    console.log(`[EmlakRadar] Tamamlandı — ${toplamYeni} yeni ilan`);
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

// ─── Liste Scraper (background pagination kontrolü) ───────────────────────────
async function injectAndCollect(tabId, job) {
  const allIlanlar = [];
  let page = 1;

  while (page <= (job.maxPages || 5)) {
    sendProgress(`${job.site} · ${job.kategori} · ${job.city} — sayfa ${page}/${job.maxPages} tarıyor...`);
    const result = await injectOnce(tabId, job);
    allIlanlar.push(...(result.ilanlar || []));
    if (!result.nextUrl || page >= (job.maxPages || 5)) break;
    // Sayfalar arası: 5–12 saniye (bot algısını önlemek için)
    await sleep(5000 + Math.random() * 7000);
    await navigateTab(tabId, result.nextUrl);
    page++;
  }

  const seen = new Set();
  return allIlanlar.filter(i => {
    if (seen.has(i.kaynak_id)) return false;
    seen.add(i.kaynak_id); return true;
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

    function onMsg(msg, sender) {
      if (sender.tab?.id !== tabId || msg.type !== 'emlakradar_page') return;
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

// ─── Detay Sayfası Scraper ────────────────────────────────────────────────────
async function scrapeDetails(tabId, ilanlar, site) {
  const detailFn = getDetailFn(site);
  if (!detailFn) return ilanlar; // Detay scripti yoksa olduğu gibi döndür

  const zengin = [];
  for (const ilan of ilanlar) {
    if (!ilan.kaynak_url) { zengin.push(ilan); continue; }
    try {
      await navigateTab(tabId, ilan.kaynak_url);
      // Bot bloğu kontrolü
      if (await checkBotBlock(tabId)) {
        sendProgress('⚠️ Bot bloğu (detay) — 5 dk bekleniyor', 'error');
        await sleep(5 * 60 * 1000);
        zengin.push(ilan); continue;
      }
      const detail = await injectDetail(tabId, detailFn);

      // Temel veriyi detay verisi ile zenginleştir
      zengin.push({
        ...ilan,
        aciklama:    detail.aciklama   || ilan.aciklama || '',
        fotograflar: detail.fotograflar?.length ? detail.fotograflar : ilan.fotograflar,
        oda_sayisi:  detail.oda_sayisi  || ilan.oda_sayisi,
        metrekare:   detail.metrekare   || ilan.metrekare,
        kat:         detail.kat         || ilan.kat,
        bina_yasi:   detail.bina_yasi   || ilan.bina_yasi,
        isitma:      detail.isitma      || ilan.isitma,
        banyo:       detail.banyo       || ilan.banyo,
        satici_ad:   detail.satici_ad   || ilan.satici_ad,
        satici_tel:  detail.satici_tel  || ilan.satici_tel,
        konum:       detail.konum       || ilan.konum,
      });
    } catch (err) {
      console.warn('[EmlakRadar] Detay hatası:', ilan.kaynak_url, err.message);
      zengin.push(ilan);
    }
    // Detay sayfaları arası: 5–10 saniye
    await sleep(5000 + Math.random() * 5000);
  }
  return zengin;
}

function injectDetail(tabId, fn) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return; done = true;
      chrome.runtime.onMessage.removeListener(onMsg);
      resolve({});
    }, 30000);

    function onMsg(msg, sender) {
      if (sender.tab?.id !== tabId || msg.type !== 'emlakradar_detail') return;
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
async function sendWebhook(ilanlar, _cfg) {
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
      chrome.storage.local.set({ seenIds: updated.slice(-15000) }, resolve);
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────────────────────
// LİSTE CONTENT SCRIPTS — sadece mevcut sayfayı parse eder, nextUrl döner
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

  window.scrollTo(0, document.body.scrollHeight / 2);
  await new Promise(r => setTimeout(r, 500));
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise(r => setTimeout(r, 500));
  window.scrollTo(0, 0);

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

  async function waitFor(selector, ms = 25000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelectorAll(selector).length > 0) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

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

  async function waitFor(ms = 20000) {
    const start = Date.now();
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
  async function waitFor(selector, ms = 20000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelector(selector)) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  await waitFor('.classifiedDetailMainPhoto, .classified-detail, h1.classifiedDetailTitle', 20000);

  // Açıklama
  const aciklama = (
    document.querySelector('.classifiedDescription')?.textContent?.trim() ||
    document.querySelector('[class*="description"]')?.textContent?.trim() || ''
  ).substring(0, 3000);

  // Tüm fotoğraflar (carousel)
  const imgs = [];
  const fotoSels = [
    'img.lazy[data-src]', 'img[data-lazy]',
    '.classifiedDetailMainPhotos img',
    '.lightBoxImage', 'img[src*="cdn.dsmcdn"]',
    'img[src*="hizliresim"]',
  ];
  fotoSels.forEach(sel => {
    document.querySelectorAll(sel).forEach(img => {
      const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
      if (src && src.startsWith('http') && !src.includes('blank') && !src.includes('/assets/') && !imgs.includes(src))
        imgs.push(src);
    });
  });

  // Özellik tablosu
  const attrs = {};
  document.querySelectorAll('.classified-info-list li, .classifiedInfoList li').forEach(li => {
    const label = li.querySelector('.classified-info-list-item-title, strong')?.textContent?.trim();
    const value = li.querySelector('.classified-info-list-item-value, span:last-child')?.textContent?.trim();
    if (label && value) attrs[label.toLowerCase()] = value;
  });

  // Alternatif tablo formatı
  document.querySelectorAll('table tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length >= 2) attrs[cells[0].textContent.trim().toLowerCase()] = cells[1].textContent.trim();
  });

  // Satıcı bilgisi
  const satici_ad  = document.querySelector('.username, .user-info-name, [class*="user-name"]')?.textContent?.trim() || '';
  const satici_tel = document.querySelector('a[href^="tel:"]')?.textContent?.trim() ||
                     document.querySelector('[class*="phone"]')?.textContent?.trim() || '';

  // Konum
  const lat = parseFloat(document.querySelector('[data-lat]')?.getAttribute('data-lat') ||
              document.querySelector('input[name="lat"]')?.value || '') || null;
  const lng = parseFloat(document.querySelector('[data-lng]')?.getAttribute('data-lng') ||
              document.querySelector('input[name="lng"]')?.value || '') || null;

  function findAttr(...keys) {
    for (const k of keys) {
      const v = attrs[k] || attrs[k + ':'] || '';
      if (v) return v;
    }
    return null;
  }

  chrome.runtime.sendMessage({
    type: 'emlakradar_detail',
    data: {
      aciklama,
      fotograflar: imgs,
      oda_sayisi:  findAttr('oda sayısı', 'oda', 'oda sayisi'),
      metrekare:   parseFloat((findAttr('m²', 'brüt', 'net m²', 'net') || '').replace(/[^\d,]/g,'').replace(',','.')) || null,
      kat:         findAttr('bulunduğu kat', 'kat'),
      bina_yasi:   findAttr('bina yaşı', 'bina yasi', 'bina yaşı'),
      isitma:      findAttr('ısıtma', 'isitma'),
      banyo:       findAttr('banyo sayısı', 'banyo'),
      satici_ad,
      satici_tel,
      konum:       (lat && lng) ? { lat, lng } : null,
    },
  });
}

async function hepsiemlakDetailScript() {
  async function waitFor(ms = 20000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelector('[class*="detail"], [class*="Detail"], h1')) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  await waitFor();

  const aciklama = (
    document.querySelector('[class*="description"], [class*="Description"], [class*="aciklama"]')?.textContent?.trim() || ''
  ).substring(0, 3000);

  const imgs = [];
  document.querySelectorAll('img[data-src], img[data-lazy], [class*="photo"] img, [class*="Photo"] img, [class*="gallery"] img').forEach(img => {
    const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
    if (src && src.startsWith('http') && !src.includes('no-image') && !imgs.includes(src)) imgs.push(src);
  });

  const attrs = {};
  document.querySelectorAll('[class*="spec"] li, [class*="feature"] li, [class*="detail-item"], [class*="property-item"]').forEach(el => {
    const txt = el.textContent.trim();
    const parts = txt.split(/[:·]/).map(s => s.trim());
    if (parts.length >= 2) attrs[parts[0].toLowerCase()] = parts.slice(1).join(' ');
  });

  const satici_ad  = document.querySelector('[class*="advertiser"], [class*="owner"], [class*="agent-name"]')?.textContent?.trim() || '';
  const satici_tel = document.querySelector('a[href^="tel:"]')?.textContent?.trim() || '';

  const lat = parseFloat(document.querySelector('[data-lat]')?.getAttribute('data-lat') || '') || null;
  const lng = parseFloat(document.querySelector('[data-lng]')?.getAttribute('data-lng') || '') || null;

  function findAttr(...keys) {
    for (const k of keys) { const v = attrs[k]; if (v) return v; }
    return null;
  }

  chrome.runtime.sendMessage({
    type: 'emlakradar_detail',
    data: {
      aciklama, fotograflar: imgs,
      oda_sayisi: findAttr('oda sayısı', 'oda'),
      metrekare:  parseFloat((findAttr('m²', 'brüt', 'net') || '').replace(/[^\d,]/g,'').replace(',','.')) || null,
      kat:        findAttr('kat', 'bulunduğu kat'),
      bina_yasi:  findAttr('bina yaşı', 'yapı yaşı'),
      isitma:     findAttr('ısıtma', 'isıtma tipi'),
      banyo:      findAttr('banyo'),
      satici_ad, satici_tel,
      konum: (lat && lng) ? { lat, lng } : null,
    },
  });
}

async function emlakjetDetailScript() {
  async function waitFor(ms = 20000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (document.querySelector('h1, [class*="detail"]')) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  await waitFor();

  const aciklama = (
    document.querySelector('[class*="description"], [class*="Description"]')?.textContent?.trim() || ''
  ).substring(0, 3000);

  const imgs = [];
  document.querySelectorAll('img[data-src], img[data-lazy], [class*="gallery"] img, [class*="slider"] img, [class*="photo"] img').forEach(img => {
    const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
    if (src && src.startsWith('http') && !src.includes('no-image') && !imgs.includes(src)) imgs.push(src);
  });

  const attrs = {};
  document.querySelectorAll('[class*="spec"] li, [class*="feature"] li, [class*="attribute"] li, [class*="detail-row"]').forEach(el => {
    const txt = el.textContent.trim();
    const parts = txt.split(/[:·]/).map(s => s.trim());
    if (parts.length >= 2) attrs[parts[0].toLowerCase()] = parts.slice(1).join(' ');
  });

  const satici_ad  = document.querySelector('[class*="agent"], [class*="owner"], [class*="advertiser"]')?.textContent?.trim() || '';
  const satici_tel = document.querySelector('a[href^="tel:"]')?.textContent?.trim() || '';
  const lat = parseFloat(document.querySelector('[data-lat]')?.getAttribute('data-lat') || '') || null;
  const lng = parseFloat(document.querySelector('[data-lng]')?.getAttribute('data-lng') || '') || null;

  function findAttr(...keys) {
    for (const k of keys) { const v = attrs[k]; if (v) return v; }
    return null;
  }

  chrome.runtime.sendMessage({
    type: 'emlakradar_detail',
    data: {
      aciklama, fotograflar: imgs,
      oda_sayisi: findAttr('oda sayısı', 'oda'),
      metrekare:  parseFloat((findAttr('m²', 'alan', 'brüt') || '').replace(/[^\d,]/g,'').replace(',','.')) || null,
      kat:        findAttr('kat', 'bulunduğu kat'),
      bina_yasi:  findAttr('bina yaşı', 'yapı yaşı'),
      isitma:     findAttr('ısıtma', 'isıtma'),
      banyo:      findAttr('banyo'),
      satici_ad, satici_tel,
      konum: (lat && lng) ? { lat, lng } : null,
    },
  });
}
