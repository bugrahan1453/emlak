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
Sana sahibinden.com'dan bir emlak ilanının düz metin içeriği verilecek.
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
- fiyat: sadece rakam (TL, nokta, virgül yok)
- ilan_tipi: "satilik" veya "kiralik"
- emlak_tipi: "daire", "villa", "mustakil", "arsa", "dukkan", "ofis" veya "diger"
- Emin olmadığın alanlar için null döndür
`.trim();

  const kullanici = `Sayfa URL: ${sayfaUrl}\n\n${sayfaMetni.slice(0, 6000)}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
  });

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

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
  });

  if (!res.ok) {
    const hata = await res.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${res.status}: ${hata.slice(0, 200)}`);
  }

  const json  = await res.json();
  const icerik = json.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(icerik);
  // GPT bazen { ilanlar: [...] } veya direkt [...] döner
  return Array.isArray(parsed) ? parsed : (parsed.ilanlar || parsed.data || []);
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

  // GPT-4o ile veri çıkar
  const ilanVerisi = await gptIlanParse(sayfaMetni, sayfaUrl, cfg);

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

async function kuyruğuIsle() {
  if (kuyrukCalisiyor) return;
  kuyrukCalisiyor = true;
  kuyruguDurdur   = false;
  await chrome.storage.local.set({ kuyrukCalisiyor: true });
  await log('Kuyruk işleme başladı', 'info');

  try {
    const cfg = await getConfig();
    if (!cfg.openaiApiKey) {
      await log('OpenAI API anahtarı eksik — ayarlara girin', 'hata');
      return;
    }
    if (!cfg.webhookUrl) {
      await log('Webhook URL eksik — ayarlara girin', 'hata');
      return;
    }

    // Tek scraper sekmesi aç
    const tab = await chrome.tabs.create({ url: 'https://www.sahibinden.com', active: false });
    const tabId = tab.id;
    await chrome.storage.local.set({ scrapeTabId: tabId });

    try {
      while (!kuyruguDurdur) {
        const { kuyruk = [] } = await chrome.storage.local.get('kuyruk');
        const bekleyen = kuyruk.filter(k => !k.islendi);
        if (bekleyen.length === 0) {
          await log('Kuyruk bitti', 'ok');
          break;
        }

        const ilk = bekleyen[0];
        await log(`İşleniyor (${bekleyen.length} kaldı): ${ilk.url}`, 'info');

        // Sayfaya git
        await yenileSekmeyiVeBekle(tabId, ilk.url);

        // Sayfadan veri çek
        const sonuc = await sekmeyiCalistir(tabId);
        if (sonuc) {
          await ilanIsle(sonuc.metin, ilk.url, sonuc.fotograflar, cfg);
        } else {
          await log(`Veri çekilemedi: ${ilk.url}`, 'hata');
        }

        // Kuyruktaki ilanı işlendi olarak işaretle
        const { kuyruk: k2 = [] } = await chrome.storage.local.get('kuyruk');
        const guncellendi = k2.map(item =>
          item.url === ilk.url ? { ...item, islendi: true } : item
        );
        await chrome.storage.local.set({ kuyruk: guncellendi });

        if (!kuyruguDurdur && bekleyen.length > 1) {
          const bekle = (cfg.delaySaniye * 1000) + (Math.random() * 60000);
          await log(`${Math.round(bekle / 1000)}sn bekleniyor...`, 'info');
          await sleep(bekle);
        }
      }
    } finally {
      chrome.tabs.remove(tabId).catch(() => {});
      await chrome.storage.local.set({ scrapeTabId: null });
    }

  } finally {
    kuyrukCalisiyor = false;
    await chrome.storage.local.set({ kuyrukCalisiyor: false });
    await log(kuyruguDurdur ? 'Kuyruk durduruldu' : 'Kuyruk tamamlandı', 'info');
  }
}

// Sekmeye git ve yüklenmeyi bekle
function yenileSekmeyiVeBekle(tabId, url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url }, () => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      const baslangic = Date.now();
      function kontrol(updatedId, info) {
        if (updatedId !== tabId || info.status !== 'complete') return;
        if (Date.now() - baslangic > timeout) {
          chrome.tabs.onUpdated.removeListener(kontrol);
          resolve(); return;
        }
        chrome.tabs.onUpdated.removeListener(kontrol);
        resolve();
      }
      chrome.tabs.onUpdated.addListener(kontrol);
      setTimeout(() => { chrome.tabs.onUpdated.removeListener(kontrol); resolve(); }, timeout);
    });
  });
}

// Sekmedeki sahibinden sayfasından veri çek
async function sekmeyiCalistir(tabId) {
  try {
    await sleep(3000 + Math.random() * 2000); // Sayfa tamamen yüklenmesini bekle
    const sonuc = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (!location.href.includes('/ilan/')) return null;

        // Sayfadan metin çıkar
        const gorunenMetin = [];
        const baslikEl = document.querySelector('h1');
        if (baslikEl) gorunenMetin.push(baslikEl.innerText.trim());

        const icerikEl = document.querySelector(
          '#classifiedDetail, .classified-detail-main, .classifiedDetail, main, article'
        ) || document.body;
        gorunenMetin.push(icerikEl.innerText.slice(0, 8000));

        // Fotoğrafları çek (GPT bu işi yapamaz)
        const fotograflar = [];
        document.querySelectorAll(
          '.classified-detail-gallery img, .gallery-container img, .swiper-slide img, [class*="gallery"] img'
        ).forEach(img => {
          const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src || '';
          if (src && src.startsWith('http') && !src.includes('placeholder') && !src.includes('no-image')) {
            fotograflar.push(src);
          }
        });

        return {
          metin:      gorunenMetin.join('\n\n'),
          fotograflar: [...new Set(fotograflar)].slice(0, 15),
        };
      },
    });
    return sonuc?.[0]?.result || null;
  } catch (e) {
    console.warn('[EmlakRadar GPT] Sekme çalıştırma hatası:', e.message);
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
              if (eklendi > 0) toplamEklenen++;
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

    // Kullanıcı liste sayfasındaydı, URL'leri kuyruğa ekle (eski mod, artık kullanılmıyor)
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
