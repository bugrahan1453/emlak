/**
 * EmlakRadar Pro — Eşleştirmeler JS
 */

/* ── Durum Güncelle ─────────────────────────────────────────────────── */
window.eslestirmeDurumGuncelle = function (id, durum) {
    fetch('/api/eslestirmeler.php?action=durum_guncelle', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ id, durum }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            const row = document.querySelector(`tr[data-id="${id}"]`);
            if (row) {
                const durumEl = row.querySelector('.durum-badge');
                if (durumEl) {
                    const labels = {
                        bekliyor:  { text: 'Bekliyor',  cls: 'badge-yellow' },
                        bildirildi: { text: 'Bildirildi', cls: 'badge-accent' },
                        ilgileniyor: { text: 'İlgileniyor', cls: 'badge-green' },
                        ilgilenmiyor: { text: 'İlgilenmiyor', cls: 'badge-gray' },
                        teklif:    { text: 'Teklif',    cls: 'badge-purple' },
                    };
                    const d = labels[durum] || labels.bekliyor;
                    durumEl.className = 'durum-badge badge-pill ' + d.cls;
                    durumEl.textContent = d.text;
                }
            }
            showFlash('Durum güncellendi.', 'success');
        } else {
            showFlash(data.message || 'Güncellenemedi.', 'error');
        }
    })
    .catch(() => showFlash('Sunucu hatası.', 'error'));
};

/* ── WhatsApp Gönder ────────────────────────────────────────────────── */
window.eslestirmeWhatsapp = function (id) {
    const btn = event.currentTarget;
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="loader"></span>';

    fetch('/api/eslestirmeler.php?action=whatsapp_gonder', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ id }),
    })
    .then(r => r.json())
    .then(data => {
        btn.disabled = false;
        btn.innerHTML = orig;
        showFlash(data.success ? '📲 WhatsApp gönderildi.' : (data.message || 'Gönderilemedi.'),
                  data.success ? 'success' : 'error');
        if (data.success) eslestirmeDurumGuncelle(id, 'bildirildi');
    })
    .catch(() => {
        btn.disabled = false;
        btn.innerHTML = orig;
        showFlash('Sunucu hatası.', 'error');
    });
};

/* ── Skor Rengi ─────────────────────────────────────────────────────── */
function skorRengi(skor) {
    if (skor >= 75) return 'score-high';
    if (skor >= 50) return 'score-medium';
    return 'score-low';
}

/* ── Filtre ─────────────────────────────────────────────────────────── */
(function () {
    const durumFilter = document.getElementById('filtre-durum');
    if (!durumFilter) return;

    durumFilter.addEventListener('change', function () {
        this.closest('form')?.submit();
    });
})();
