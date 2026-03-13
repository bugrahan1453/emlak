/**
 * EmlakRadar Pro — Müşteriler JS
 */

/* ── Müşteri Sil ────────────────────────────────────────────────────── */
window.musteriSil = async function (id) {
    const ok = await confirmDialog('Bu müşteri ve ilgili tüm kayıtlar silinecek. Emin misiniz?');
    if (!ok) return;

    fetch('/api/musteriler.php?action=sil', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ id }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            document.querySelector(`tr[data-id="${id}"]`)?.remove();
            document.querySelector(`.musteri-card[data-id="${id}"]`)?.remove();
            showFlash('Müşteri silindi.', 'success');
        } else {
            showFlash(data.message || 'Silinemedi.', 'error');
        }
    })
    .catch(() => showFlash('Sunucu hatası.', 'error'));
};

/* ── WhatsApp Gönder ────────────────────────────────────────────────── */
window.musteriWhatsapp = function (musteriId, telefon) {
    const msg = prompt('Göndermek istediğiniz mesajı yazın:', 'Merhaba, size uygun ilanlarımız hakkında bilgi vermek istiyorum.');
    if (msg === null) return;

    fetch('/api/whatsapp.php?action=mesaj_gonder', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ musteri_id: musteriId, telefon, mesaj: msg }),
    })
    .then(r => r.json())
    .then(data => {
        showFlash(data.success ? 'Mesaj gönderildi.' : (data.message || 'Gönderilemedi.'),
                  data.success ? 'success' : 'error');
    })
    .catch(() => showFlash('Sunucu hatası.', 'error'));
};

/* ── Görev Oluştur ──────────────────────────────────────────────────── */
window.musteriGorevOlustur = function (musteriId, musteriAd) {
    const baslik = prompt(`"${musteriAd}" için görev başlığı:`, 'Takip araması');
    if (!baslik) return;

    fetch('/api/gorevler.php?action=kaydet', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ baslik, musteri_id: musteriId, tip: 'arama' }),
    })
    .then(r => r.json())
    .then(data => {
        showFlash(data.success ? 'Görev oluşturuldu.' : (data.message || 'Hata.'),
                  data.success ? 'success' : 'error');
    })
    .catch(() => showFlash('Sunucu hatası.', 'error'));
};

/* ── Eşleştirme Çalıştır ────────────────────────────────────────────── */
window.musteriEslestir = function (musteriId) {
    const btn = event.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span>';

    fetch('/api/eslestirmeler.php?action=musteri_eslestir', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ musteri_id: musteriId }),
    })
    .then(r => r.json())
    .then(data => {
        btn.disabled = false;
        btn.innerHTML = '🔗';
        if (data.success) {
            showFlash(`${data.data?.sayi || 0} eşleştirme bulundu.`, 'success');
        } else {
            showFlash(data.message || 'Eşleştirme başarısız.', 'error');
        }
    })
    .catch(() => {
        btn.disabled = false;
        btn.innerHTML = '🔗';
        showFlash('Sunucu hatası.', 'error');
    });
};

/* ── Filtre Formu ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
    // Bütçe slider
    const butceMax = document.getElementById('butce_max');
    const butceLabel = document.getElementById('butce-label');
    if (butceMax && butceLabel) {
        butceMax.addEventListener('input', function () {
            butceLabel.textContent = Number(this.value).toLocaleString('tr-TR') + ' ₺';
        });
    }
});
