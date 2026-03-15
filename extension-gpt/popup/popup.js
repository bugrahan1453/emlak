'use strict';

const els = {
  badge:       document.getElementById('durum-badge'),
  bekleyen:    document.getElementById('stat-bekleyen'),
  tamamlanan:  document.getElementById('stat-tamamlanan'),
  toplam:      document.getElementById('stat-toplam'),
  uyariAlan:   document.getElementById('uyari-alan'),
  uyariMetin:  document.getElementById('uyari-metin'),
  logListe:    document.getElementById('log-liste'),
  btnBaslat:   document.getElementById('btn-baslat'),
  btnDurdur:   document.getElementById('btn-durdur'),
  btnTemizle:  document.getElementById('btn-temizle'),
  ayarlarLink: document.getElementById('ayarlar-link'),
  urlInput:    document.getElementById('url-input'),
  btnUrlEkle:  document.getElementById('btn-url-ekle'),
  urlMesaj:    document.getElementById('url-mesaj'),
};

// ─── Durum Güncelle ──────────────────────────────────────────────────────────
async function durumGuncelle() {
  const r = await chrome.runtime.sendMessage({ tip: 'DURUM_GETIR' });
  if (!r) return;

  // Stats
  els.bekleyen.textContent   = r.bekleyen;
  els.tamamlanan.textContent = r.tamamlanan;
  els.toplam.textContent     = r.toplamIslenen;

  // Badge
  if (r.calisiyorMu) {
    els.badge.textContent  = 'Çalışıyor';
    els.badge.className    = 'badge calisiyor';
    els.btnBaslat.disabled = true;
    els.btnDurdur.disabled = false;
  } else {
    els.badge.textContent  = r.bekleyen > 0 ? `${r.bekleyen} bekliyor` : 'Hazır';
    els.badge.className    = r.bekleyen > 0 ? 'badge aktif' : 'badge';
    els.btnBaslat.disabled = r.bekleyen === 0;
    els.btnDurdur.disabled = true;
  }

  // Ayar uyarısı
  const cfg = await chrome.storage.local.get(['openaiApiKey', 'webhookUrl']);
  if (!cfg.openaiApiKey || !cfg.webhookUrl) {
    els.uyariAlan.style.display = 'block';
    els.uyariMetin.textContent = !cfg.openaiApiKey
      ? '⚠ OpenAI API anahtarı girilmemiş — Ayarlara gidin'
      : '⚠ Webhook URL girilmemiş — Ayarlara gidin';
  } else {
    els.uyariAlan.style.display = 'none';
  }

  // Log
  renderLog(r.loglar || []);
}

// ─── Log Render ──────────────────────────────────────────────────────────────
function renderLog(loglar) {
  if (loglar.length === 0) {
    els.logListe.innerHTML = '<div class="bos-log">Henüz işlem yok</div>';
    return;
  }
  els.logListe.innerHTML = loglar.map(l => {
    const zaman = new Date(l.zaman).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const ikon  = l.tip === 'ok' ? '✅' : l.tip === 'hata' ? '❌' : 'ℹ';
    return `
      <div class="log-satir">
        <span class="log-zaman">${zaman}</span>
        <span class="log-ikon">${ikon}</span>
        <span class="log-mesaj ${l.tip}">${escHtml(l.mesaj)}</span>
      </div>`;
  }).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Buton Olayları ──────────────────────────────────────────────────────────
els.btnBaslat.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ tip: 'KUYRUK_BASLAT' });
  await durumGuncelle();
});

els.btnDurdur.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ tip: 'KUYRUK_DURDUR' });
  els.badge.textContent = 'Durduruluyor...';
  setTimeout(durumGuncelle, 1500);
});

els.btnTemizle.addEventListener('click', async () => {
  if (!confirm('Kuyruktaki tüm bekleyen ilanlar silinecek. Devam?')) return;
  await chrome.runtime.sendMessage({ tip: 'KUYRUK_TEMIZLE' });
  await durumGuncelle();
});

els.ayarlarLink.addEventListener('click', e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ─── URL Ekle ────────────────────────────────────────────────────────────────
els.btnUrlEkle.addEventListener('click', async () => {
  const url = els.urlInput.value.trim();
  if (!url || !url.includes('sahibinden.com')) {
    urlMesajGoster('⚠ Geçerli bir sahibinden.com URL\'si girin', '#fc8181');
    return;
  }

  // Background'a gönder — liste sayfasını fetch edip URL'leri toplar
  const r = await chrome.runtime.sendMessage({ tip: 'LISTE_URL_EKLE', url });
  if (r?.tamam) {
    urlMesajGoster('✅ Sayfa açılıyor, ilanlar kuyruğa ekleniyor...', '#68d391');
  } else {
    urlMesajGoster('⚠ ' + (r?.mesaj || 'Hata'), '#fc8181');
  }
  els.urlInput.value = '';
  setTimeout(durumGuncelle, 3000);
});

function urlMesajGoster(metin, renk) {
  els.urlMesaj.textContent = metin;
  els.urlMesaj.style.color = renk;
  els.urlMesaj.style.display = 'block';
  setTimeout(() => { els.urlMesaj.style.display = 'none'; }, 5000);
}

// ─── İlk Yükleme + Otomatik Yenileme ────────────────────────────────────────
durumGuncelle();
setInterval(durumGuncelle, 3000);
