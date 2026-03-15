'use strict';

const els = {
  apiKey:       document.getElementById('openai-api-key'),
  gptModel:     document.getElementById('gpt-model'),
  webhookUrl:   document.getElementById('webhook-url'),
  webhookSecret:document.getElementById('webhook-secret'),
  otoMod:       document.getElementById('oto-mod'),
  delaySaniye:  document.getElementById('delay-saniye'),
  btnKaydet:    document.getElementById('btn-kaydet'),
  btnTestApi:   document.getElementById('btn-test-api'),
  mesajApi:     document.getElementById('mesaj-api'),
  mesajKayit:   document.getElementById('mesaj-kayit'),
};

// ─── Ayarları Yükle ──────────────────────────────────────────────────────────
async function yukle() {
  const cfg = await chrome.storage.local.get({
    openaiApiKey:  '',
    gptModel:      'gpt-4o-mini',
    webhookUrl:    '',
    webhookSecret: '',
    otoMod:        true,
    delaySaniye:   300,
  });
  els.apiKey.value        = cfg.openaiApiKey;
  els.gptModel.value      = cfg.gptModel;
  els.webhookUrl.value    = cfg.webhookUrl;
  els.webhookSecret.value = cfg.webhookSecret;
  els.otoMod.checked      = cfg.otoMod;
  els.delaySaniye.value   = cfg.delaySaniye;
}

// ─── Kaydet ──────────────────────────────────────────────────────────────────
els.btnKaydet.addEventListener('click', async () => {
  await chrome.storage.local.set({
    openaiApiKey:  els.apiKey.value.trim(),
    gptModel:      els.gptModel.value,
    webhookUrl:    els.webhookUrl.value.trim(),
    webhookSecret: els.webhookSecret.value.trim(),
    otoMod:        els.otoMod.checked,
    delaySaniye:   Math.max(60, parseInt(els.delaySaniye.value) || 300),
  });
  mesajGoster(els.mesajKayit, 'ok', '✅ Ayarlar kaydedildi');
});

// ─── API Testi ────────────────────────────────────────────────────────────────
els.btnTestApi.addEventListener('click', async () => {
  mesajGoster(els.mesajApi, 'ok', '🔄 Test ediliyor...');
  await chrome.storage.local.set({ openaiApiKey: els.apiKey.value.trim() });
  const r = await chrome.runtime.sendMessage({ tip: 'TEST_API' });
  mesajGoster(els.mesajApi, r?.tamam ? 'ok' : 'hata', r?.mesaj || 'Bilinmeyen hata');
});

// ─── Yardımcı ────────────────────────────────────────────────────────────────
function mesajGoster(el, tip, metin) {
  el.className    = `mesaj ${tip}`;
  el.textContent  = metin;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

yukle();
