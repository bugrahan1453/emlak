/**
 * EmlakRadar Pro — İlanlar JS
 * Görünüm toggle, toplu işlemler, filtreler
 */

/* ── Görünüm Toggle (Tablo / Kart) ─────────────────────────────────── */
(function () {
    const tableView = document.getElementById('view-table');
    const cardView  = document.getElementById('view-card');
    const btnTable  = document.getElementById('btn-table-view');
    const btnCard   = document.getElementById('btn-card-view');

    if (!btnTable || !btnCard) return;

    const PREF_KEY = 'ilan_view';
    let current = localStorage.getItem(PREF_KEY) || 'table';

    function setView(v) {
        current = v;
        localStorage.setItem(PREF_KEY, v);
        if (tableView) tableView.style.display = v === 'table' ? '' : 'none';
        if (cardView)  cardView.style.display  = v === 'card'  ? '' : 'none';

        btnTable.classList.toggle('active-view', v === 'table');
        btnCard.classList.toggle('active-view',  v === 'card');
    }

    btnTable.addEventListener('click', () => setView('table'));
    btnCard.addEventListener('click',  () => setView('card'));

    setView(current);
})();

/* ── Toplu İşlem Seçimi ─────────────────────────────────────────────── */
(function () {
    const selectAll = document.getElementById('select-all');
    const bulkBar   = document.getElementById('bulk-bar');
    const bulkCount = document.getElementById('bulk-count');
    let   secilenler = new Set();

    function getCheckboxes() {
        return document.querySelectorAll('.ilan-checkbox');
    }

    function guncelleBulkBar() {
        const n = secilenler.size;
        if (bulkCount) bulkCount.textContent = n;
        if (bulkBar)   bulkBar.classList.toggle('visible', n > 0);
    }

    if (selectAll) {
        selectAll.addEventListener('change', function () {
            getCheckboxes().forEach(cb => {
                cb.checked = this.checked;
                if (this.checked) secilenler.add(cb.value);
                else secilenler.delete(cb.value);
            });
            guncelleBulkBar();
        });
    }

    document.addEventListener('change', function (e) {
        if (!e.target.classList.contains('ilan-checkbox')) return;
        if (e.target.checked) secilenler.add(e.target.value);
        else {
            secilenler.delete(e.target.value);
            if (selectAll) selectAll.checked = false;
        }
        guncelleBulkBar();
    });

    // Toplu sil
    window.bulkSil = async function () {
        if (!secilenler.size) return;
        const ok = await confirmDialog(`${secilenler.size} ilan silinecek. Bu işlem geri alınamaz.`);
        if (!ok) return;

        fetch('/api/ilanlar.php?action=bulk_sil', {
            method: 'POST',
            headers: csrfHeaders(),
            body: JSON.stringify({ ids: Array.from(secilenler) }),
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                secilenler.forEach(id => {
                    document.querySelector(`tr[data-id="${id}"]`)?.remove();
                    document.querySelector(`.ilan-card[data-id="${id}"]`)?.remove();
                });
                secilenler.clear();
                guncelleBulkBar();
                showFlash('Seçilen ilanlar silindi.', 'success');
            } else {
                showFlash(data.message || 'Silme başarısız.', 'error');
            }
        })
        .catch(() => showFlash('Sunucu hatası.', 'error'));
    };

    // Toplu durum değiştir
    window.bulkDurumDegistir = function (durum) {
        if (!secilenler.size) return;

        fetch('/api/ilanlar.php?action=bulk_durum', {
            method: 'POST',
            headers: csrfHeaders(),
            body: JSON.stringify({ ids: Array.from(secilenler), durum }),
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                showFlash('Durum güncellendi.', 'success');
                setTimeout(() => window.location.reload(), 800);
            } else {
                showFlash(data.message || 'İşlem başarısız.', 'error');
            }
        })
        .catch(() => showFlash('Sunucu hatası.', 'error'));
    };

    // Seçimi temizle
    window.secimTemizle = function () {
        secilenler.clear();
        getCheckboxes().forEach(cb => cb.checked = false);
        if (selectAll) selectAll.checked = false;
        guncelleBulkBar();
    };
})();

/* ── Fiyat Formatı Input ────────────────────────────────────────────── */
document.querySelectorAll('input[data-fiyat]').forEach(input => {
    input.addEventListener('input', function () {
        let raw = this.value.replace(/\D/g, '');
        this.value = raw ? Number(raw).toLocaleString('tr-TR') : '';
    });
    input.addEventListener('blur', function () {
        // Form gönderiminde ham sayı kullan
        const hidden = document.getElementById(this.id + '_raw');
        if (hidden) hidden.value = this.value.replace(/\D/g, '');
    });
});

/* ── Fotoğraf Önizleme ──────────────────────────────────────────────── */
(function () {
    const fileInput = document.getElementById('fotograflar');
    const preview   = document.getElementById('fotograf-preview');
    if (!fileInput || !preview) return;

    fileInput.addEventListener('change', function () {
        preview.innerHTML = '';
        Array.from(this.files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'w-24 h-24 object-cover rounded-lg border border-white/10';
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    });
})();

/* ── AI Değerleme ───────────────────────────────────────────────────── */
window.aiDegerle = function (ilanId) {
    const btn = document.getElementById('ai-degerle-btn');
    const result = document.getElementById('ai-degerle-result');
    if (!btn || !result) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="loader mr-2"></span>Analiz yapılıyor...';

    fetch('/api/ai.php?action=ilan_degerle', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ ilan_id: ilanId }),
    })
    .then(r => r.json())
    .then(data => {
        btn.disabled = false;
        btn.innerHTML = '🤖 AI Değerle';

        if (data.success && data.data) {
            const d = data.data;
            result.innerHTML = `
                <div class="grid grid-cols-2 gap-3 mt-3">
                    <div class="glass-sm p-3 text-center">
                        <div class="text-xs text-slate-500 mb-1">Pazar Değeri</div>
                        <div class="text-lg font-bold text-[#00d4ff]">${formatFiyat(d.pazar_degeri)}</div>
                    </div>
                    <div class="glass-sm p-3 text-center">
                        <div class="text-xs text-slate-500 mb-1">Pazarlık Skoru</div>
                        <div class="text-lg font-bold text-[#00ff88]">%${d.pazarlik_skoru}</div>
                    </div>
                    <div class="glass-sm p-3 col-span-2">
                        <div class="text-xs text-slate-500 mb-1">Değerleme Notu</div>
                        <div class="text-sm text-slate-200">${escHtml(d.degerleme_notu)}</div>
                    </div>
                    <div class="glass-sm p-3 col-span-2">
                        <div class="text-xs text-slate-500 mb-1">Tavsiye</div>
                        <div class="text-sm text-slate-200">${escHtml(d.tavsiye)}</div>
                    </div>
                </div>
            `;
            result.classList.remove('hidden');
        } else {
            showFlash(data.message || 'AI değerleme başarısız.', 'error');
        }
    })
    .catch(() => {
        btn.disabled = false;
        btn.innerHTML = '🤖 AI Değerle';
        showFlash('Sunucu hatası.', 'error');
    });
};

/* ── WhatsApp Gönder ────────────────────────────────────────────────── */
window.ilanWhatsapp = function (ilanId) {
    const phone = prompt('WhatsApp numarası (0532...):');
    if (!phone) return;

    fetch('/api/whatsapp.php?action=ilan_gonder', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ ilan_id: ilanId, telefon: phone }),
    })
    .then(r => r.json())
    .then(data => {
        showFlash(data.success ? 'WhatsApp mesajı gönderildi.' : (data.message || 'Gönderilemedi.'),
                  data.success ? 'success' : 'error');
    })
    .catch(() => showFlash('Sunucu hatası.', 'error'));
};

/* ── İlan Sil ───────────────────────────────────────────────────────── */
window.ilanSil = async function (id) {
    const ok = await confirmDialog('Bu ilan silinecek. Emin misiniz?');
    if (!ok) return;

    fetch('/api/ilanlar.php?action=sil', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ id }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            document.querySelector(`tr[data-id="${id}"]`)?.remove();
            document.querySelector(`.ilan-card[data-id="${id}"]`)?.remove();
            showFlash('İlan silindi.', 'success');
        } else {
            showFlash(data.message || 'Silinemedi.', 'error');
        }
    })
    .catch(() => showFlash('Sunucu hatası.', 'error'));
};
