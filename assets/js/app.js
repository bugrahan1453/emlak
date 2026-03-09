/**
 * EmlakRadar Pro — Genel JS (app.js)
 * Sidebar toggle, bildirim paneli, global arama
 */

/* ── Sidebar Toggle ─────────────────────────────────────────────────── */
(function () {
    const sidebar   = document.getElementById('sidebar');
    const overlay   = document.getElementById('sidebar-overlay');
    const openBtn   = document.getElementById('sidebar-open');
    const closeBtn  = document.getElementById('sidebar-close');

    function openSidebar() {
        if (!sidebar) return;
        sidebar.classList.add('open');
        if (overlay) overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        if (!sidebar) return;
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.add('hidden');
        document.body.style.overflow = '';
    }

    if (openBtn)  openBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay)  overlay.addEventListener('click', closeSidebar);

    // ESC tuşu ile kapat
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeSidebar();
    });
})();

/* ── Global Arama ───────────────────────────────────────────────────── */
(function () {
    const input   = document.getElementById('global-search');
    const results = document.getElementById('search-results');
    if (!input || !results) return;

    let timer = null;

    input.addEventListener('input', function () {
        clearTimeout(timer);
        const q = this.value.trim();
        if (q.length < 2) {
            results.innerHTML = '';
            results.classList.add('hidden');
            return;
        }
        timer = setTimeout(() => aramaYap(q), 350);
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            this.value = '';
            results.innerHTML = '';
            results.classList.add('hidden');
        }
    });

    document.addEventListener('click', function (e) {
        if (!input.contains(e.target) && !results.contains(e.target)) {
            results.classList.add('hidden');
        }
    });

    function aramaYap(q) {
        fetch('/api/ilanlar.php?action=search&q=' + encodeURIComponent(q))
            .then(r => r.json())
            .then(data => {
                if (!data.success || !data.data.length) {
                    results.innerHTML = '<div class="p-3 text-sm text-slate-500 text-center">Sonuç bulunamadı.</div>';
                    results.classList.remove('hidden');
                    return;
                }
                results.innerHTML = data.data.map(item => `
                    <a href="${item.url}" class="search-item">
                        <span class="text-xl">${item.ikon}</span>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm text-slate-200 truncate">${escHtml(item.baslik)}</div>
                            <div class="text-xs text-slate-500">${escHtml(item.alt)}</div>
                        </div>
                    </a>
                `).join('');
                results.classList.remove('hidden');
            })
            .catch(() => {
                results.classList.add('hidden');
            });
    }
})();

/* ── Bildirimler ────────────────────────────────────────────────────── */
(function () {
    const bell    = document.getElementById('bildirim-bell');
    const panel   = document.getElementById('bildirim-panel');
    const sayac   = document.getElementById('bildirim-sayac');
    const liste   = document.getElementById('bildirim-liste');
    const tumunu  = document.getElementById('bildirim-tumunu-oku');

    if (!bell) return;

    let panelAcik = false;

    bell.addEventListener('click', function (e) {
        e.stopPropagation();
        panelAcik = !panelAcik;
        if (panelAcik) {
            panel.classList.remove('hidden');
            bildirimleriYukle();
        } else {
            panel.classList.add('hidden');
        }
    });

    document.addEventListener('click', function (e) {
        if (panel && !bell.contains(e.target) && !panel.contains(e.target)) {
            panel.classList.add('hidden');
            panelAcik = false;
        }
    });

    if (tumunu) {
        tumunu.addEventListener('click', function () {
            fetch('/api/bildirimler.php?action=tumunu_oku', { method: 'POST', headers: csrfHeaders() })
                .then(() => {
                    if (sayac) { sayac.textContent = '0'; sayac.classList.add('hidden'); }
                    document.querySelectorAll('.bildirim-item.okunmamis').forEach(el => {
                        el.classList.remove('okunmamis');
                    });
                });
        });
    }

    function bildirimleriYukle() {
        if (!liste) return;
        liste.innerHTML = '<div class="p-4 text-center"><div class="loader mx-auto"></div></div>';

        fetch('/api/bildirimler.php?action=liste')
            .then(r => r.json())
            .then(data => {
                if (!data.success || !data.data.length) {
                    liste.innerHTML = '<div class="p-4 text-sm text-slate-500 text-center">Bildirim yok.</div>';
                    return;
                }
                liste.innerHTML = data.data.map(b => `
                    <div class="bildirim-item ${b.okundu ? '' : 'okunmamis'}"
                         onclick="bildirimOku(${b.id}, '${b.link || ''}')">
                        <div class="flex items-start gap-2">
                            <span class="text-lg">${b.ikon}</span>
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-medium text-slate-200">${escHtml(b.baslik)}</div>
                                <div class="text-xs text-slate-400 mt-0.5 line-clamp-2">${escHtml(b.icerik)}</div>
                                <div class="text-xs text-slate-600 mt-1">${b.zaman}</div>
                            </div>
                            ${!b.okundu ? '<div class="w-2 h-2 rounded-full bg-[#00d4ff] mt-1 flex-shrink-0"></div>' : ''}
                        </div>
                    </div>
                `).join('');
            })
            .catch(() => {
                liste.innerHTML = '<div class="p-4 text-sm text-red-400 text-center">Yüklenemedi.</div>';
            });
    }

    // İlk yüklemede sayacı güncelle
    function sayacGuncelle() {
        fetch('/api/bildirimler.php?action=sayac')
            .then(r => r.json())
            .then(data => {
                if (data.success && sayac) {
                    const n = data.data.sayac;
                    sayac.textContent = n;
                    n > 0 ? sayac.classList.remove('hidden') : sayac.classList.add('hidden');
                }
            })
            .catch(() => {});
    }

    sayacGuncelle();
    setInterval(sayacGuncelle, 60000); // Her 1 dakikada güncelle
})();

/* ── Bildirim Oku (global) ──────────────────────────────────────────── */
function bildirimOku(id, link) {
    fetch('/api/bildirimler.php?action=okundu&id=' + id, { method: 'POST', headers: csrfHeaders() })
        .then(() => {
            const el = document.querySelector(`.bildirim-item[onclick*="${id}"]`);
            if (el) el.classList.remove('okunmamis');
        });
    if (link) window.location.href = link;
}

/* ── Flash Mesaj (programmatic) ─────────────────────────────────────── */
function showFlash(message, type = 'info') {
    const existing = document.getElementById('flash-programmatic');
    if (existing) existing.remove();

    const colors = {
        success: 'background:rgba(0,255,136,0.15);color:#00ff88;border:1px solid rgba(0,255,136,0.3)',
        error:   'background:rgba(255,51,102,0.15);color:#ff3366;border:1px solid rgba(255,51,102,0.3)',
        warning: 'background:rgba(255,170,0,0.15);color:#ffaa00;border:1px solid rgba(255,170,0,0.3)',
        info:    'background:rgba(0,212,255,0.15);color:#00d4ff;border:1px solid rgba(0,212,255,0.3)',
    };
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

    const div = document.createElement('div');
    div.id = 'flash-programmatic';
    div.className = 'fixed bottom-20 right-4 lg:bottom-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm fade-in';
    div.style.cssText = colors[type] || colors.info;
    div.innerHTML = `
        <span>${icons[type] || icons.info}</span>
        <span>${escHtml(message)}</span>
        <button onclick="this.parentElement.remove()" class="ml-2 opacity-60 hover:opacity-100">✕</button>
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
}

/* ── CSRF Helper ────────────────────────────────────────────────────── */
function csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
}

function csrfHeaders() {
    return {
        'X-CSRF-Token': csrfToken(),
        'Content-Type': 'application/json',
    };
}

function csrfFormData(formData) {
    formData.append('csrf_token', csrfToken());
    return formData;
}

/* ── XSS Koruması ───────────────────────────────────────────────────── */
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ── Sayı Formatı ───────────────────────────────────────────────────── */
function formatFiyat(n) {
    if (!n) return '—';
    return Number(n).toLocaleString('tr-TR') + ' ₺';
}

function formatSayi(n) {
    return Number(n).toLocaleString('tr-TR');
}

/* ── Debounce ───────────────────────────────────────────────────────── */
function debounce(fn, ms) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

/* ── Form Submit Loader ─────────────────────────────────────────────── */
document.addEventListener('submit', function (e) {
    const form = e.target;
    const btn  = form.querySelector('button[type="submit"]');
    if (!btn || btn.dataset.noLoader) return;
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="loader inline-block mr-2"></span>' + orig;
    // Sayfadan çıkış sonrası otomatik sıfırlanır
    setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 8000);
});

/* ── Tablo Sıralama ─────────────────────────────────────────────────── */
function initTableSort(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    table.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', function () {
            const col  = this.dataset.sort;
            const asc  = this.classList.toggle('asc');
            this.classList.toggle('desc', !asc);

            // Diğer th'leri temizle
            table.querySelectorAll('th[data-sort]').forEach(t => {
                if (t !== this) { t.classList.remove('asc', 'desc'); }
            });

            const tbody = table.querySelector('tbody');
            const rows  = Array.from(tbody.querySelectorAll('tr'));

            rows.sort((a, b) => {
                const aVal = a.querySelector(`[data-col="${col}"]`)?.textContent.trim() || '';
                const bVal = b.querySelector(`[data-col="${col}"]`)?.textContent.trim() || '';
                const numA = parseFloat(aVal.replace(/[^\d.-]/g, ''));
                const numB = parseFloat(bVal.replace(/[^\d.-]/g, ''));
                if (!isNaN(numA) && !isNaN(numB)) return asc ? numA - numB : numB - numA;
                return asc ? aVal.localeCompare(bVal, 'tr') : bVal.localeCompare(aVal, 'tr');
            });

            rows.forEach(r => tbody.appendChild(r));
        });
    });
}

/* ── Clipboard ──────────────────────────────────────────────────────── */
function copyToClipboard(text, label = 'Kopyalandı') {
    navigator.clipboard.writeText(text).then(() => {
        showFlash(label, 'success');
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showFlash(label, 'success');
    });
}

/* ── Confirm Dialog (Promise) ───────────────────────────────────────── */
function confirmDialog(message, title = 'Emin misiniz?') {
    return new Promise((resolve) => {
        // Mevcut varsa kaldır
        document.getElementById('confirm-dialog')?.remove();

        const el = document.createElement('div');
        el.id = 'confirm-dialog';
        el.className = 'modal-overlay fade-in';
        el.innerHTML = `
            <div class="modal-box" style="max-width:400px">
                <div class="modal-header">
                    <span class="font-semibold text-slate-200">⚠️ ${escHtml(title)}</span>
                </div>
                <div class="modal-body">
                    <p class="text-slate-300 text-sm">${escHtml(message)}</p>
                </div>
                <div class="modal-footer">
                    <button id="confirm-cancel" class="btn btn-ghost">İptal</button>
                    <button id="confirm-ok" class="btn btn-red">Onayla</button>
                </div>
            </div>
        `;
        document.body.appendChild(el);

        el.querySelector('#confirm-ok').addEventListener('click', () => {
            el.remove();
            resolve(true);
        });
        el.querySelector('#confirm-cancel').addEventListener('click', () => {
            el.remove();
            resolve(false);
        });
        el.addEventListener('click', (e) => {
            if (e.target === el) { el.remove(); resolve(false); }
        });
    });
}

/* ── Dinamik Alpine.js yenileme ─────────────────────────────────────── */
window.refreshAlpine = function () {
    if (window.Alpine) window.Alpine.initTree(document.body);
};

/* ── Sayfa hazır ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
    // Tüm tabloları sırala
    document.querySelectorAll('table[data-sortable]').forEach(t => {
        initTableSort(t.id);
    });

    // Auto-submit select filtreler
    document.querySelectorAll('select[data-autosubmit]').forEach(sel => {
        sel.addEventListener('change', function () {
            this.closest('form')?.submit();
        });
    });

    // Confirm before delete
    document.querySelectorAll('[data-confirm]').forEach(el => {
        el.addEventListener('click', async function (e) {
            e.preventDefault();
            const ok = await confirmDialog(this.dataset.confirm);
            if (ok) {
                const href = this.href || this.dataset.href;
                if (href) window.location.href = href;
                else this.closest('form')?.submit();
            }
        });
    });
});
