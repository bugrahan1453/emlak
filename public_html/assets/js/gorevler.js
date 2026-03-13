/**
 * EmlakRadar Pro — Görevler JS
 * Görev toggle, sonuç kaydet, AI senaryo, mobil swipe
 */

/* ── Görev Tamamla / Geri Al ────────────────────────────────────────── */
window.toggleGorev = function (id, checkbox) {
    const tamamlandi = checkbox.checked;
    const card = document.getElementById('gorev-' + id);

    fetch('/api/gorevler.php?action=tamamla', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ id, sonuc: tamamlandi ? 'basarili' : null }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            if (card) card.classList.toggle('tamamlandi', tamamlandi);
        } else {
            checkbox.checked = !tamamlandi;
            showFlash('İşlem başarısız.', 'error');
        }
    })
    .catch(() => {
        checkbox.checked = !tamamlandi;
        showFlash('Sunucu hatası.', 'error');
    });
};

/* ── Görev Sonucu Kaydet ────────────────────────────────────────────── */
window.sonucKaydet = function (id, sonuc) {
    const card = document.getElementById('gorev-' + id);

    fetch('/api/gorevler.php?action=sonuc_kaydet', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ id, sonuc }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            if (card) {
                card.classList.add('tamamlandi');
                const checkbox = card.querySelector('input[type="checkbox"]');
                if (checkbox) checkbox.checked = true;
            }
            const labels = {
                basarili:     '✅ Görüşme başarılı kaydedildi.',
                basarisiz:    '❌ Görüşme başarısız kaydedildi.',
                ertelendi:    '🔄 Görev ertelendi.',
                ulasilamadi:  '📵 Ulaşılamadı kaydedildi.',
            };
            showFlash(labels[sonuc] || 'Kaydedildi.', sonuc === 'basarili' ? 'success' : 'info');
        } else {
            showFlash(data.message || 'Kayıt başarısız.', 'error');
        }
    })
    .catch(() => showFlash('Sunucu hatası.', 'error'));
};

/* ── AI Senaryo Modal ───────────────────────────────────────────────── */
window.showAiSenaryo = function (gorevId) {
    const modal   = document.getElementById('ai-senaryo-modal');
    const content = document.getElementById('ai-senaryo-content');
    const loader  = document.getElementById('ai-senaryo-loader');
    if (!modal) return;

    modal.classList.remove('hidden');
    if (content) { content.innerHTML = ''; content.classList.add('hidden'); }
    if (loader)  loader.classList.remove('hidden');

    fetch('/api/ai.php?action=gorev_senaryo', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ gorev_id: gorevId }),
    })
    .then(r => r.json())
    .then(data => {
        if (loader) loader.classList.add('hidden');
        if (data.success && content) {
            content.innerHTML = `<pre class="whitespace-pre-wrap text-sm text-slate-200 font-sans leading-relaxed">${escHtml(data.data.senaryo)}</pre>`;
            content.classList.remove('hidden');
        } else {
            if (content) {
                content.innerHTML = `<p class="text-red-400 text-sm">${escHtml(data.message || 'Senaryo üretilemedi.')}</p>`;
                content.classList.remove('hidden');
            }
        }
    })
    .catch(() => {
        if (loader) loader.classList.add('hidden');
        if (content) {
            content.innerHTML = '<p class="text-red-400 text-sm">Sunucu hatası.</p>';
            content.classList.remove('hidden');
        }
    });
};

window.closeAiModal = function () {
    const modal = document.getElementById('ai-senaryo-modal');
    if (modal) modal.classList.add('hidden');
};

window.copySenaryo = function () {
    const content = document.getElementById('ai-senaryo-content');
    if (content) copyToClipboard(content.textContent, 'Senaryo kopyalandı!');
};

/* ── Yeni Görev Modalı ──────────────────────────────────────────────── */
window.openGorevModal = function () {
    const modal = document.getElementById('yeni-gorev-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeGorevModal = function () {
    const modal = document.getElementById('yeni-gorev-modal');
    if (modal) modal.classList.add('hidden');
};

/* ── Görev Tipi İkonu ───────────────────────────────────────────────── */
function gorevTipIkon(tip) {
    const iconlar = {
        arama:      '📞',
        randevu:    '📅',
        gosterim:   '🏠',
        takip:      '🔄',
        sozlesme:   '📝',
        diger:      '📌',
    };
    return iconlar[tip] || '📌';
}

/* ── Görev Filtresi ─────────────────────────────────────────────────── */
(function () {
    const filterBtns = document.querySelectorAll('[data-filter-tip]');
    const cards = document.querySelectorAll('.gorev-card-wrap');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const tip = this.dataset.filterTip;

            filterBtns.forEach(b => b.classList.remove('active', 'bg-[#00d4ff]/10', 'text-[#00d4ff]', 'border-[#00d4ff]/30'));
            this.classList.add('active', 'bg-[#00d4ff]/10', 'text-[#00d4ff]', 'border-[#00d4ff]/30');

            cards.forEach(card => {
                if (tip === 'tumu' || card.dataset.tip === tip) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
})();

/* ── Mobil Swipe (SortableJS) ───────────────────────────────────────── */
(function () {
    const container = document.getElementById('gorev-sortable');
    if (!container || typeof Sortable === 'undefined') return;

    Sortable.create(container, {
        animation: 150,
        ghostClass: 'opacity-30',
        chosenClass: 'scale-105',
        handle: '.drag-handle',
        onEnd: function (evt) {
            const order = Array.from(container.querySelectorAll('[data-id]'))
                .map(el => el.dataset.id);

            fetch('/api/gorevler.php?action=siralama_guncelle', {
                method: 'POST',
                headers: csrfHeaders(),
                body: JSON.stringify({ order }),
            }).catch(() => {});
        },
    });
})();

/* ── Görev Sil ──────────────────────────────────────────────────────── */
window.gorevSil = async function (id) {
    const ok = await confirmDialog('Bu görev silinecek. Emin misiniz?');
    if (!ok) return;

    fetch('/api/gorevler.php?action=sil', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ id }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            document.getElementById('gorev-' + id)?.remove();
            showFlash('Görev silindi.', 'success');
        } else {
            showFlash(data.message || 'Silinemedi.', 'error');
        }
    })
    .catch(() => showFlash('Sunucu hatası.', 'error'));
};

/* ── Görev Düzenle (Inline) ─────────────────────────────────────────── */
window.gorevDuzenle = function (id) {
    const card = document.getElementById('gorev-' + id);
    if (!card) return;

    const notEl = card.querySelector('.gorev-not');
    if (!notEl) return;

    const mevcut = notEl.textContent.trim();
    const textarea = document.createElement('textarea');
    textarea.value = mevcut;
    textarea.className = 'glass-input w-full text-sm mt-2 rounded-lg p-2';
    textarea.rows = 3;
    notEl.replaceWith(textarea);
    textarea.focus();

    textarea.addEventListener('blur', function () {
        const yeniNot = this.value.trim();
        const newEl = document.createElement('p');
        newEl.className = 'gorev-not text-xs text-slate-400 mt-1';
        newEl.textContent = yeniNot;
        this.replaceWith(newEl);

        if (yeniNot !== mevcut) {
            fetch('/api/gorevler.php?action=not_guncelle', {
                method: 'POST',
                headers: csrfHeaders(),
                body: JSON.stringify({ id, notlar: yeniNot }),
            }).catch(() => {});
        }
    });
};

/* ── Sayfa Yüklenme ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
    // Bugünün tarihini filtre inputuna yaz
    const tarihInput = document.getElementById('filtre-tarih');
    if (tarihInput && !tarihInput.value) {
        const bugun = new Date().toISOString().split('T')[0];
        tarihInput.value = bugun;
    }

    // Modal dışına tıkla kapat
    ['yeni-gorev-modal', 'ai-senaryo-modal'].forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === this) this.classList.add('hidden');
            });
        }
    });
});
