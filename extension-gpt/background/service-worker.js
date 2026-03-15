'use strict';
/**
 * EmlakRadar GPT — Background Service Worker
 *
 * İki mod:
 *   1. OTOMATİK: Kullanıcı sahibinden.com/ilan/* sayfasını ziyaret edince
 *      içerik scripti veriyi gönderir → GPT-4o ile parse → webhook'a yükle
 *
 *   2. KUYRUK: Popup'tan arama URL'si ekle → arka planda tek tek
 *      sayfaları aç (çok yavaş, bot riski sıfır)
 */

// ─── Ayarları Yükle ──────────────────────────────────────────────────────────
async function getConfig() {
  return chrome.storage.local.get({
    openaiApiKey:    '',
    webhookUrl:      '',
    webhookSecret:   '',
    delaySaniye:     300,   // kuyruk modu: ilanlar arası bekleme (sn)
    otoMod:          true,  // kullanıcı ziyaret edince otomatik kaydet
    gptModel:        'gpt-4o-mini',
  });
}

// ─── Log Sistemi ─────────────────────────────────────────────────────────────
async function log(mesaj, tip = 'info') {
  const { loglar = [] } = await chrome.storage.local.get('loglar');
  loglar.unshift({ mesaj, tip, zaman: Date.now() });
  await chrome.storage.local.set({ loglar: loglar.slice(0, 100) });
  console.log(`[EmlakRadar GPT][${tip}]`, mesaj);
}

// ─── HMAC İmza ───────────────────────────────────────────────────────────────
async function imzala(body, secret) {
  if (!secret) return '';
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return 'sha256=' + Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── GPT-4o ile Veri Çıkar (detay sayfası metni) ─────────────────────────────
async function gptIlanParse(sayfaMetni, sayfaUrl, cfg) {
  if (!cfg.openaiApiKey) throw new Error('OpenAI API anahtarı ayarlanmamış');

  const sistem = `
Sen bir Türk emlak ilan veri çıkarma asistanısın.
Sana sahibinden.com ilan sayfasının içeriği verilecek. İçerik şu bölümleri içerebilir:
- "YAPISAL VERİ (Next.js SSR)": JSON formatında sayfa verisi — en güvenilir kaynak, öncelikli kullan
- "Başlık / Fiyat / Özellikler / Açıklama": HTML'den çıkarılmış bölümler
- "SAYFA METNİ": Genel sayfa metni

Aşağıdaki JSON formatında yapılandırılmış veri döndür (başka hiçbir şey yazma):
{
  "baslik": "ilan başlığı",
  "fiyat": 0,
  "metrekare": null,
  "oda_sayisi": null,
  "kat": null,
  "bina_yasi": null,
  "isitma": null,
  "sehir": "",
  "ilce": null,
  "mahalle": null,
  "adres": null,
  "aciklama": "",
  "satici_ad": null,
  "satici_tel": null,
  "ilan_tipi": "satilik",
  "emlak_tipi": "daire"
}
Kurallar:
- fiyat: sadece rakam (TL, nokta, virgül yok). Örnek: "2.500.000 TL" → 2500000
- metrekare: sadece sayı. Örnek: "120 m²" → 120
- oda_sayisi: "3+1" gibi string olabilir
- ilan_tipi: "satilik" veya "kiralik"
- emlak_tipi: "daire", "villa", "mustakil", "arsa", "dukkan", "ofis" veya "diger"
- Emin olmadığın alanlar için null döndür
`.trim();

  const kullanici = `Sayfa URL: ${sayfaUrl}\n\n${sayfaMetni.slice(0, 6000)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000); // 45sn timeout
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${cfg.openaiApiKey}`,
      },
      body: JSON.stringify({
        model:           cfg.gptModel || 'gpt-4o-mini',
        messages:        [{ role: 'system', content: sistem }, { role: 'user', content: kullanici }],
        response_format: { type: 'json_object' },
        max_tokens:      800,
        temperature:     0,
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const hata = await res.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${res.status}: ${hata.slice(0, 200)}`);
  }

  const json = await res.json();
  const icerik = json.choices?.[0]?.message?.content || '{}';
  return JSON.parse(icerik);
}

// ─── GPT-4o ile Liste Satırlarını Yapılandır (toplu, detay sayfası yok) ───────
async function gptListeIsleBatch(ilanlar, sayfaUrl, cfg) {
  if (!cfg.openaiApiKey) throw new Error('OpenAI API anahtarı ayarlanmamış');

  const sistem = `
Sen bir Türk emlak ilan veri çıkarma asistanısın.
Sana sahibinden.com arama sonuçlarından çekilmiş ham ilan listesi verilecek.
Her ilan için aşağıdaki JSON dizisini döndür (başka hiçbir şey yazma):
[{
  "baslik": "",
  "fiyat": 0,
  "metrekare": null,
  "oda_sayisi": null,
  "sehir": "",
  "ilce": null,
  "mahalle": null,
  "ilan_tipi": "satilik",
  "emlak_tipi": "daire",
  "kaynak_url": "",
  "kaynak_id": "",
  "fotograflar": []
}]
Kurallar:
- fiyat: sadece rakam
- ilan_tipi: başlık/URL'den çıkar: "satilik" veya "kiralik"
- emlak_tipi: "daire", "villa", "mustakil", "arsa", "dukkan", "ofis" veya "diger"
- konum: "Çanakkale / Biga" gibi formatı şehir+ilçe olarak ayır
- kaynak_url ve kaynak_id değerlerini olduğu gibi koru
`.trim();

  const kullanici = `Sayfa: ${sayfaUrl}\n\nİlanlar:\n${JSON.stringify(ilanlar, null, 1).slice(0, 7000)}`;

  const ctrl2 = new AbortController();
  const timer2 = setTimeout(() => ctrl2.abort(), 60000); // 60sn timeout (batch daha büyük)
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${cfg.openaiApiKey}`,
      },
      body: JSON.stringify({
        model:           cfg.gptModel || 'gpt-4o-mini',
        messages:        [{ role: 'system', content: sistem }, { role: 'user', content: kullanici }],
        response_format: { type: 'json_object' },
        max_tokens:      3000,
        temperature:     0,
      }),
      signal: ctrl2.signal,
    });
  } finally {
    clearTimeout(timer2);
  }

  if (!res.ok) {
    const hata = await res.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${res.status}: ${hata.slice(0, 200)}`);
  }

  const json  = await res.json();
  const icerik = json.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(icerik);
  // GPT bazen { ilanlar: [...] } veya direkt [...] döner
  if (Array.isArray(parsed)) return parsed;
  // json_object formatında key farklı olabilir — tüm değerler arasında ilk array'i bul
  const ilkArray = Object.values(parsed).find(v => Array.isArray(v));
  return ilkArray || [];
}

// ─── Webhook'a Gönder ────────────────────────────────────────────────────────
async function webhookGonder(ilanData, cfg) {
  if (!cfg.webhookUrl) throw new Error('Webhook URL ayarlanmamış');

  const body = JSON.stringify({
    tip:     'yeni_ilan',
    ilanlar: [ilanData],
    zaman:   new Date().toISOString(),
    kaynak:  'sahibinden',
  });
  const imza = await imzala(body, cfg.webhookSecret);

  const res = await fetch(cfg.webhookUrl, {
    method:  'POST',
    headers: {
      'Content-Type':        'application/json',
      'X-Webhook-Signature': imza,
      'X-Webhook-Source':    'emlakradar-gpt',
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Webhook HTTP ${res.status}: ${txt.slice(0, 150)}`);
  }
  return res.json().catch(() => ({}));
}

// ─── Tekrar Kontrolü ─────────────────────────────────────────────────────────
async function ilanIslendiMi(kaynakUrl) {
  const { islenenler = [] } = await chrome.storage.local.get('islenenler');
  return islenenler.includes(kaynakUrl);
}

async function islendiIsaretle(kaynakUrl) {
  const { islenenler = [] } = await chrome.storage.local.get('islenenler');
  const yeni = [...new Set([...islenenler, kaynakUrl])];
  await chrome.storage.local.set({ islenenler: yeni.slice(-5000) });
}

// ─── İlanı İşle (GPT + Webhook) ──────────────────────────────────────────────
async function ilanIsle(sayfaMetni, sayfaUrl, fotograflar, cfg) {
  // Daha önce işlendi mi?
  if (await ilanIslendiMi(sayfaUrl)) {
    await log(`Zaten işlendi, atlandı: ${sayfaUrl}`, 'info');
    return { durum: 'mevcut' };
  }

  await log(`GPT ile işleniyor: ${sayfaUrl}`, 'info');
  await chrome.storage.local.set({ sonIslem: { url: sayfaUrl, zaman: Date.now() } });

  // Önce gpt-4o-mini dene, başlık çıkaramazsa gpt-4o ile tekrar dene
  let ilanVerisi = await gptIlanParse(sayfaMetni, sayfaUrl, cfg);

  if (!ilanVerisi.baslik && (cfg.gptModel || 'gpt-4o-mini') !== 'gpt-4o') {
    await log(`gpt-4o-mini başarısız, gpt-4o ile tekrar deneniyor: ${sayfaUrl.split('/').slice(-2).join('/')}`, 'info');
    ilanVerisi = await gptIlanParse(sayfaMetni, sayfaUrl, { ...cfg, gptModel: 'gpt-4o' });
  }

  if (!ilanVerisi.baslik) {
    await log(`GPT veri çıkaramadı: ${sayfaUrl}`, 'hata');
    return { durum: 'hata', mesaj: 'GPT veri çıkaramadı' };
  }

  // Kaynak bilgisi ekle
  const tamVeri = {
    ...ilanVerisi,
    kaynak_site: 'sahibinden',
    kaynak_url:  sayfaUrl,
    kaynak_id:   sayfaUrl.match(/\/ilan\/(\d+)/)?.[1] || '',
    fotograflar: fotograflar || [],
    tip:         ilanVerisi.ilan_tipi || 'satilik',
    kategori:    ilanVerisi.emlak_tipi || 'daire',
  };

  // Webhook'a gönder
  const sonuc = await webhookGonder(tamVeri, cfg);
  await islendiIsaretle(sayfaUrl);

  const eklendi = sonuc?.data?.eklenen ?? sonuc?.eklenen ?? 0;
  const msg = eklendi > 0 ? `✅ Eklendi: ${ilanVerisi.baslik?.slice(0, 40)}` : `↩ Zaten mevcut: ${ilanVerisi.baslik?.slice(0, 40)}`;
  await log(msg, eklendi > 0 ? 'ok' : 'info');

  if (eklendi > 0) {
    chrome.notifications.create({
      type: 'basic', iconUrl: 'assets/icon.png',
      title: '✅ İlan Eklendi — EmlakRadar GPT',
      message: ilanVerisi.baslik || 'Yeni ilan eklendi',
    });
  }

  return { durum: 'tamam', eklendi };
}

// ─── Kuyruk Yönetimi ─────────────────────────────────────────────────────────
let kuyrukCalisiyor = false;
let kuyruguDurdur   = false;

async function kuyruğaEkle(urlListesi) {
  const { kuyruk = [] } = await chrome.storage.local.get('kuyruk');
  const yeniler = urlListesi.filter(u => !kuyruk.some(k => k.url === u));
  const guncellendi = [...kuyruk, ...yeniler.map(url => ({ url, eklendi: Date.now() }))];
  await chrome.storage.local.set({ kuyruk: guncellendi });
  await log(`${yeniler.length} URL kuyruğa eklendi (toplam: ${guncellendi.length})`, 'info');
  return yeniler.length;
}

// ─── İlan İçeriğini Tab Açarak Çek (CORS bypass) ─────────────────────────────
// fetch() sahibinden'in login-redirect'inde CORS hatası veriyor.
// Bunun yerine: gizli tab aç → executeScript ile içerik çek → tab kapat
function fetchIlanIcerik(url) {
  return new Promise((resolve, reject) => {
    let tabId = null;

    const failTimeout = setTimeout(() => {
      if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {});
      reject(new Error('Sayfa yükleme zaman aşımı (30sn)'));
    }, 30000);

    chrome.tabs.create({ url, active: false }, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(failTimeout);
        return reject(new Error(chrome.runtime.lastError.message));
      }
      tabId = tab.id;

      function onUpdated(id, info) {
        if (id !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(failTimeout);

        chrome.scripting.executeScript({
          target: { tabId },
          world:  'MAIN',
          func: () => {
            // Giriş/challenge sayfasına redirect oldu mu?
            const u = location.href;
            if (u.includes('/giris') || u.includes('dogrulama') || u.includes('challenge')) {
              return { hata: 'redirect:' + u };
            }

            // __NEXT_DATA__ (Next.js SSR) — yapısal veri
            let nextDataStr = null;
            const nd = document.getElementById('__NEXT_DATA__');
            if (nd) {
              try {
                const parsed = JSON.parse(nd.textContent);
                const props  = parsed?.props?.pageProps ?? parsed?.props ?? parsed;
                nextDataStr  = JSON.stringify(props, null, 1).slice(0, 6000);
              } catch (_) {}
            }

            // Kritik bölümler
            const baslik   = document.querySelector('h1')?.innerText?.trim() ?? '';
            const fiyatEl  = document.querySelector('[class*="classified-price"], [class*="price-wrapper"], [class*="fiyat"]');
            const fiyat    = fiyatEl?.innerText?.trim() ?? '';
            const specsEl  = document.querySelector('[class*="classified-info"], [class*="ozellik"], [class*="specs"]');
            const specs    = specsEl?.innerText?.replace(/\s{2,}/g, ' ').trim() ?? '';
            const descEl   = document.querySelector('[id*="description"], [class*="classified-description"]');
            const aciklama = descEl?.innerText?.trim()?.slice(0, 1500) ?? '';
            const bodyText = document.body.innerText.slice(0, 4000);

            // Fotoğraflar
            const fotos = new Set();
            document.querySelectorAll('img[src], img[data-src], img[data-lazy]').forEach(img => {
              const src = img.src || img.dataset.src || img.dataset.lazy || '';
              if (src && /shbdn|dsmcdn|sahibinden/.test(src) &&
                  !/logo|icon|avatar|placeholder|no.image|sprite/i.test(src)) {
                fotos.add(src);
              }
            });

            return {
              nextDataStr, baslik, fiyat, specs, aciklama, bodyText,
              fotos: [...fotos].slice(0, 20),
            };
          },
        }, (results) => {
          chrome.tabs.remove(tabId).catch(() => {});

          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }

          const d = results?.[0]?.result;
          if (!d) return reject(new Error('executeScript sonuç döndürmedi'));
          if (d.hata) {
            if (d.hata.startsWith('redirect:')) {
              return reject(new Error('Sahibinden giriş/challenge sayfasına yönlendirdi'));
            }
            return reject(new Error(d.hata));
          }

          const bolumler = [];
          if (d.nextDataStr) {
            bolumler.push('=== YAPISAL VERİ (Next.js SSR) ===');
            bolumler.push(d.nextDataStr);
          }
          if (d.baslik)   bolumler.push('Başlık: '     + d.baslik);
          if (d.fiyat)    bolumler.push('Fiyat: '      + d.fiyat);
          if (d.specs)    bolumler.push('Özellikler: ' + d.specs);
          if (d.aciklama) bolumler.push('Açıklama: '   + d.aciklama);
          bolumler.push('=== SAYFA METNİ ===');
          bolumler.push(d.bodyText);

          resolve({
            metin:      bolumler.join('\n').slice(0, 10000),
            fotograflar: d.fotos,
          });
        });
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

// ─── Sahibinden Liste Sayfasından İlan URL'lerini Çıkar ──────────────────────
function sahibindenIlanUrlleriniCikar(html) {
  const regex = /href="(\/ilan\/[^"?#]+)"/g;
  const urls = new Set();
  let m;
  while ((m = regex.exec(html)) !== null) {
    const path = m[1];
    if (path.startsWith('/ilan/')) {
      urls.add('https://www.sahibinden.com' + path);
    }
  }
  return [...urls];
}

// ─── Çoklu Sayfa Fetch: pagingOffset ile sayfaları çek ───────────────────────
async function sahibindenCokluSayfaFetch(sayfaUrl, sayfaSayisi) {
  const tumUrller = [];

  for (let i = 0; i < sayfaSayisi; i++) {
    try {
      const u = new URL(sayfaUrl);
      u.searchParams.set('pagingOffset', i * 20);
      const res = await fetch(u.toString(), {
        headers: {
          'Accept':          'text/html,application/xhtml+xml',
          'Accept-Language': 'tr-TR,tr;q=0.9',
          'Referer':         'https://www.sahibinden.com/',
        },
        credentials: 'include',
      });
      if (!res.ok) break;
      const html = await res.text();
      const urls = sahibindenIlanUrlleriniCikar(html);
      if (urls.length === 0) break; // Son sayfa
      tumUrller.push(...urls);
      await log(`Sayfa ${i + 1}: ${urls.length} ilan bulundu`, 'info');
    } catch (e) {
      await log(`Sayfa ${i + 1} fetch hatası: ${e.message}`, 'hata');
      break;
    }
  }

  return [...new Set(tumUrller)];
}

// ─── Kuyruk İşleme (fetch tabanlı, sekme açmaz) ───────────────────────────────
async function kuyruğuIsle() {
  if (kuyrukCalisiyor) return;
  kuyrukCalisiyor = true;
  kuyruguDurdur   = false;
  await chrome.storage.local.set({ kuyrukCalisiyor: true });
  await log('Kuyruk işleme başladı', 'info');

  // MV3 service worker 30sn'de kill edilebilir — keepalive ile önle
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  // Watchdog alarm: SW yeniden başlarsa kuyruğu devam ettir
  chrome.alarms.create('kuyruk-watchdog', { periodInMinutes: 1 });

  try {
    const cfg = await getConfig();
    if (!cfg.openaiApiKey) { await log('OpenAI API anahtarı eksik', 'hata'); return; }
    if (!cfg.webhookUrl)   { await log('Webhook URL eksik', 'hata'); return; }

    while (!kuyruguDurdur) {
      const { kuyruk = [] } = await chrome.storage.local.get('kuyruk');
      const bekleyen = kuyruk.filter(k => !k.islendi);
      if (bekleyen.length === 0) { await log('Kuyruk bitti', 'ok'); break; }

      const ilk = bekleyen[0];
      await log(`Çekiliyor (${bekleyen.length} kaldı): ${ilk.url.split('/').slice(-2).join('/')}`, 'info');

      let atla = false; // true = daha önce işlendi, bekleme yapma
      try {
        const { metin, fotograflar } = await fetchIlanIcerik(ilk.url);
        const sonuc = await ilanIsle(metin, ilk.url, fotograflar, cfg);
        atla = sonuc?.durum === 'mevcut'; // zaten DB'de → hızlıca geç
      } catch (e) {
        const msg = e.message.slice(0, 80);
        if (e.message.includes('429') || e.message.includes('Too Many')) {
          const bekle = 60000 + Math.random() * 60000;
          await log(`429 Rate limit — ${Math.round(bekle/1000)}sn bekleniyor...`, 'hata');
          await sleep(bekle);
        } else if (e.message.includes('404')) {
          await log(`İlan kaldırılmış, atlanıyor: ${ilk.url.split('/').slice(-1)[0]}`, 'info');
          atla = true; // 404 → bekleme olmadan geç
        } else {
          await log(`Hata: ${msg}`, 'hata');
        }
      }

      // Kuyruktaki ilanı işlendi işaretle
      const { kuyruk: k2 = [] } = await chrome.storage.local.get('kuyruk');
      await chrome.storage.local.set({
        kuyruk: k2.map(item => item.url === ilk.url ? { ...item, islendi: true } : item),
      });

      // Aktif (zaten işlenmiş/404) → bekleme YOK, hemen sonrakine geç
      // Gerçekten çekilen yeni ilan → 15-35sn bekle (429 önleme)
      if (!atla && !kuyruguDurdur && bekleyen.length > 1) {
        const bekle = 15000 + Math.random() * 20000;
        await log(`Sonraki ilan için ${Math.round(bekle/1000)}sn bekleniyor...`, 'info');
        await sleep(bekle);
      }
    }

  } finally {
    clearInterval(keepAlive);
    chrome.alarms.clear('kuyruk-watchdog').catch(() => {});
    kuyrukCalisiyor = false;
    await chrome.storage.local.set({ kuyrukCalisiyor: false });
    await log(kuyruguDurdur ? 'Kuyruk durduruldu' : 'Kuyruk tamamlandı', 'info');
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Alarm Handler (Watchdog + Service Worker Restart Koruması) ──────────────
// MV3 service worker kill edilince kuyruk-watchdog alarmı SW'yi uyandırır
// ve kuyruğu devam ettirir
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'kuyruk-watchdog') return;
  const { kuyrukCalisiyor: depoCal } = await chrome.storage.local.get('kuyrukCalisiyor');
  // Depo "çalışıyor" ama bellek değişkeni false = SW yeniden başladı
  if (depoCal && !kuyrukCalisiyor) {
    await log('Watchdog: SW yeniden başladı, kuyruk devam ettiriliyor...', 'info');
    kuyruğuIsle().catch(async e => {
      await log(`Watchdog restart hatası: ${e.message}`, 'hata');
      kuyrukCalisiyor = false;
      await chrome.storage.local.set({ kuyrukCalisiyor: false });
    });
  }
});

// ─── Mesaj Dinleyici ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMesaj(msg, sender).then(sendResponse).catch(e => sendResponse({ hata: e.message }));
  return true;
});

async function handleMesaj(msg, sender) {
  const cfg = await getConfig();

  switch (msg.tip) {

    // Kullanıcı ilan sayfasını ziyaret etti (otomatik mod)
    case 'ILAN_OTOMATIK': {
      if (!cfg.otoMod) return { atildi: true, sebep: 'oto_mod_kapali' };
      if (!cfg.openaiApiKey) return { atildi: true, sebep: 'api_key_yok' };
      if (!cfg.webhookUrl)   return { atildi: true, sebep: 'webhook_yok' };

      ilanIsle(msg.metin, msg.url, msg.fotograflar, cfg).catch(async e => {
        await log(`Otomatik işleme hatası: ${e.message}`, 'hata');
      });

      return { tamam: true };
    }

    // Liste sayfasından direkt veri işle — detay sayfası açma
    case 'LISTE_DIREKT_ISLE': {
      const ilanlar = msg.ilanlar || [];
      if (ilanlar.length === 0) return { tamam: true, eklenen: 0 };
      if (!cfg.openaiApiKey) {
        await log('OpenAI API anahtarı eksik — ayarlara girin', 'hata');
        return { tamam: false };
      }
      if (!cfg.webhookUrl) {
        await log('Webhook URL eksik — ayarlara girin', 'hata');
        return { tamam: false };
      }

      // Daha önce işlenmişleri çıkar
      const { islenenler = [] } = await chrome.storage.local.get('islenenler');
      const yeniIlanlar = ilanlar.filter(i => i.ilanUrl && !islenenler.includes(i.ilanUrl));
      if (yeniIlanlar.length === 0) {
        await log(`Bu sayfadaki tüm ilanlar zaten işlendi (${ilanlar.length} ilan)`, 'info');
        return { tamam: true, eklenen: 0 };
      }

      await log(`${yeniIlanlar.length} yeni ilan GPT'ye gönderiliyor...`, 'info');

      // 10'arlı batch'ler halinde gönder (token limiti)
      const BATCH = 10;
      let toplamEklenen = 0;
      for (let i = 0; i < yeniIlanlar.length; i += BATCH) {
        const batch = yeniIlanlar.slice(i, i + BATCH).map(il => ({
          baslik:     il.baslik,
          fiyat:      il.fiyat,
          metrekare:  il.metrekare,
          oda_sayisi: il.odaSayisi,
          konum:      il.konum,
          kaynak_url: il.ilanUrl,
          kaynak_id:  il.ilanId,
          fotograflar: il.foto ? [il.foto] : [],
        }));

        try {
          const islenmis = await gptListeIsleBatch(batch, msg.sayfaUrl, cfg);
          await log(`GPT batch ${Math.floor(i/BATCH)+1}: ${islenmis.length} ilan döndü`, 'info');
          for (const ilan of islenmis) {
            if (!ilan.baslik || !ilan.kaynak_url) continue;
            const tamVeri = {
              ...ilan,
              kaynak_site: 'sahibinden',
              tip:         ilan.ilan_tipi  || 'satilik',
              kategori:    ilan.emlak_tipi || 'daire',
            };
            try {
              const sonuc   = await webhookGonder(tamVeri, cfg);
              const eklendi = sonuc?.data?.eklenen ?? sonuc?.eklenen ?? 0;
              const atilan  = sonuc?.data?.atilan  ?? sonuc?.atilan  ?? 0;
              if (eklendi > 0) toplamEklenen++;
              else await log(`Mükerrer (atilan=${atilan}): ${ilan.baslik?.slice(0, 40)}`, 'info');
              await islendiIsaretle(ilan.kaynak_url);
            } catch (wErr) {
              await log(`Webhook hatası: ${wErr.message}`, 'hata');
            }
          }
        } catch (gErr) {
          await log(`GPT batch hatası: ${gErr.message}`, 'hata');
        }
      }

      await log(`✅ Liste işlendi: ${toplamEklenen} yeni ilan eklendi`, toplamEklenen > 0 ? 'ok' : 'info');
      if (toplamEklenen > 0) {
        chrome.notifications.create({
          type: 'basic', iconUrl: 'assets/icon.png',
          title: '✅ İlanlar Eklendi — EmlakRadar GPT',
          message: `${toplamEklenen} yeni ilan veritabanına kaydedildi`,
        });
      }
      return { tamam: true, eklenen: toplamEklenen };
    }

    // Content script: liste sayfasından URL'leri topla + 5 sayfa tara → kuyruğa ekle
    case 'COKLU_SAYFA_KUYRUK': {
      const mevcutUrller = msg.ilanUrls || [];
      const sayfaUrl     = msg.sayfaUrl || '';
      if (!sayfaUrl) return { tamam: false };

      await log(`Çoklu sayfa taranıyor: ${sayfaUrl.split('?')[0]}`, 'info');

      // 5 sayfa fetch et (pagingOffset 0,20,40,60,80)
      const tumUrller = await sahibindenCokluSayfaFetch(sayfaUrl, 5);

      // Mevcut sayfadan gelen URL'leri de ekle (union)
      const hepsi = [...new Set([...mevcutUrller, ...tumUrller])];

      const eklenen = await kuyruğaEkle(hepsi);
      await log(`✅ Toplam ${hepsi.length} URL kuyruğa eklendi (${eklenen} yeni)`, 'ok');
      return { tamam: true, eklenen };
    }

    // Popup: URL gir → o sayfayı tab'da aç → content script linkleri toplar → tab kapanır
    case 'LISTE_URL_EKLE': {
      const hedefUrl = msg.url;
      if (!hedefUrl?.includes('sahibinden.com')) return { tamam: false, mesaj: 'Geçersiz URL' };
      return new Promise(resolve => {
        chrome.tabs.create({ url: hedefUrl, active: false }, tab => {
          const tid = tab.id;
          chrome.tabs.onUpdated.addListener(function dinle(tabId, info) {
            if (tabId !== tid || info.status !== 'complete') return;
            chrome.tabs.onUpdated.removeListener(dinle);
            // Content script LISTE_KUYRUGA_EKLE mesajını gönderecek, sonra tab'ı kapat
            setTimeout(() => chrome.tabs.remove(tid).catch(() => {}), 2500);
            resolve({ tamam: true, eklenen: '?' });
          });
          setTimeout(() => { chrome.tabs.remove(tid).catch(() => {}); resolve({ tamam: true, eklenen: '?' }); }, 15000);
        });
      });
    }

    // Content script: liste sayfasındaki URL'leri kuyruğa ekle
    case 'LISTE_KUYRUGA_EKLE': {
      const eklenen = await kuyruğaEkle(msg.urlListesi || []);
      return { tamam: true, eklenen };
    }

    // Popup: Kuyruğu başlat
    case 'KUYRUK_BASLAT': {
      if (!kuyrukCalisiyor) {
        kuyruğuIsle().catch(async e => {
          await log(`Kuyruk hatası: ${e.message}`, 'hata');
          kuyrukCalisiyor = false;
          await chrome.storage.local.set({ kuyrukCalisiyor: false });
        });
      }
      return { tamam: true };
    }

    // Popup: Kuyruğu durdur
    case 'KUYRUK_DURDUR': {
      kuyruguDurdur = true;
      return { tamam: true };
    }

    // Popup: Kuyruğu temizle
    case 'KUYRUK_TEMIZLE': {
      await chrome.storage.local.set({ kuyruk: [] });
      return { tamam: true };
    }

    // Popup: Durum getir
    case 'DURUM_GETIR': {
      const veri = await chrome.storage.local.get([
        'kuyruk', 'loglar', 'kuyrukCalisiyor', 'sonIslem', 'islenenler',
      ]);
      const kuyruk    = veri.kuyruk || [];
      const bekleyen  = kuyruk.filter(k => !k.islendi).length;
      const tamamlanan = kuyruk.filter(k => k.islendi).length;
      return {
        calisiyorMu:  veri.kuyrukCalisiyor || false,
        bekleyen,
        tamamlanan,
        loglar:       (veri.loglar || []).slice(0, 20),
        sonIslem:     veri.sonIslem || null,
        toplamIslenen: (veri.islenenler || []).length,
      };
    }

    // Bağlantı testi
    case 'TEST_API': {
      if (!cfg.openaiApiKey) return { tamam: false, mesaj: 'API anahtarı eksik' };
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${cfg.openaiApiKey}` },
        });
        return res.ok ? { tamam: true, mesaj: 'OpenAI bağlantısı başarılı' } : { tamam: false, mesaj: `HTTP ${res.status}` };
      } catch (e) {
        return { tamam: false, mesaj: e.message };
      }
    }

    default:
      return { hata: 'Bilinmeyen mesaj: ' + msg.tip };
  }
}
