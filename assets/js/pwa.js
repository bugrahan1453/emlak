/**
 * EmlakRadar Pro — PWA Service Worker Kayıt + Push Bildirimler + A2HS
 */

(function () {
    'use strict';

    // ── Service Worker Kayıt ────────────────────────────────────────
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            try {
                const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
                console.log('[PWA] Service Worker kaydedildi:', reg.scope);

                // Güncelleme var mı kontrol et
                reg.addEventListener('updatefound', () => {
                    const yeniSW = reg.installing;
                    yeniSW.addEventListener('statechange', () => {
                        if (yeniSW.state === 'installed' && navigator.serviceWorker.controller) {
                            guncellemeGoster();
                        }
                    });
                });

                // SW kontrolü değişince sayfayı yenile
                let yenileniyor = false;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (!yenileniyor) { yenileniyor = true; location.reload(); }
                });

            } catch (err) {
                console.warn('[PWA] SW kayıt hatası:', err);
            }
        });
    }

    // ── A2HS (Ana Ekrana Ekle) ──────────────────────────────────────
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        a2hsBannerGoster();
    });

    function a2hsBannerGoster() {
        // Daha önce reddedilmişse gösterme
        if (localStorage.getItem('emlakradar_a2hs_reddedildi')) return;

        const banner = document.createElement('div');
        banner.id = 'a2hs-banner';
        banner.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            z-index: 1000; display: flex; align-items: center; gap: 12px;
            background: #0c1129; border: 1px solid rgba(0,212,255,0.3);
            border-radius: 16px; padding: 12px 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.5);
            max-width: 360px; width: calc(100% - 32px); animation: slideUp 0.3s ease;
        `;
        banner.innerHTML = `
            <span style="font-size:28px;flex-shrink:0;">📡</span>
            <div style="flex:1;">
                <div style="font-size:13px;font-weight:600;color:#e8ecf4;">Ana Ekrana Ekle</div>
                <div style="font-size:12px;color:#7a8599;margin-top:2px;">EmlakRadar'ı uygulama gibi kullan</div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
                <button id="a2hs-reddet" style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#7a8599;font-size:12px;cursor:pointer;">Hayır</button>
                <button id="a2hs-kabul" style="padding:6px 12px;border-radius:8px;background:linear-gradient(135deg,rgba(0,212,255,0.2),rgba(139,92,246,0.2));border:1px solid rgba(0,212,255,0.3);color:#00d4ff;font-size:12px;font-weight:600;cursor:pointer;">Ekle</button>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = '@keyframes slideUp{from{transform:translateX(-50%) translateY(20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}';
        document.head.appendChild(style);
        document.body.appendChild(banner);

        document.getElementById('a2hs-kabul').addEventListener('click', async () => {
            banner.remove();
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    console.log('[PWA] A2HS kabul edildi.');
                }
                deferredPrompt = null;
            }
        });

        document.getElementById('a2hs-reddet').addEventListener('click', () => {
            banner.remove();
            localStorage.setItem('emlakradar_a2hs_reddedildi', '1');
        });

        // 10 saniye sonra otomatik kapat
        setTimeout(() => banner.remove(), 10000);
    }

    // ── Push Bildirim İzni ──────────────────────────────────────────
    async function pushIzniIste() {
        if (!('Notification' in window) || !('PushManager' in window)) return;
        if (Notification.permission === 'granted') return;
        if (Notification.permission === 'denied') return;
        if (localStorage.getItem('emlakradar_push_reddedildi')) return;

        // 30 saniye gecikmeyle sor (kullanıcı sayfayı görünsün)
        setTimeout(async () => {
            const izin = await Notification.requestPermission();
            if (izin === 'granted') {
                await pushAbonelikOlustur();
            } else {
                localStorage.setItem('emlakradar_push_reddedildi', '1');
            }
        }, 30000);
    }

    async function pushAbonelikOlustur() {
        try {
            const reg = await navigator.serviceWorker.ready;
            const mevcut = await reg.pushManager.getSubscription();
            if (mevcut) return mevcut;

            const vapidKey = document.querySelector('meta[name="vapid-public-key"]')?.content;
            if (!vapidKey) return null;

            const abonelik = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey),
            });

            // Sunucuya kaydet
            await fetch('/api/bildirimler.php?action=push_abone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(abonelik),
            });

            return abonelik;
        } catch (e) {
            console.warn('[PWA] Push abonelik hatası:', e);
        }
    }

    // ── Offline/Online Durumu ───────────────────────────────────────
    function agDurumuBildirimi(online) {
        const mevcut = document.getElementById('ag-durum-banner');
        if (mevcut) mevcut.remove();

        if (!online) {
            const banner = document.createElement('div');
            banner.id = 'ag-durum-banner';
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
                padding: 8px 16px; text-align: center; font-size: 12px; font-weight: 600;
                background: rgba(255,51,102,0.9); color: white;
            `;
            banner.textContent = '📡 İnternet bağlantısı yok — Çevrimdışı modda çalışıyorsunuz';
            document.body.prepend(banner);
        }
    }

    window.addEventListener('online',  () => agDurumuBildirimi(true));
    window.addEventListener('offline', () => agDurumuBildirimi(false));
    if (!navigator.onLine) agDurumuBildirimi(false);

    // ── SW Güncelleme Bildirimi ─────────────────────────────────────
    function guncellemeGoster() {
        const banner = document.createElement('div');
        banner.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 9999;
            background: #0c1129; border: 1px solid rgba(0,212,255,0.3);
            border-radius: 12px; padding: 12px 16px;
            display: flex; align-items: center; gap: 10px; box-shadow: 0 8px 40px rgba(0,0,0,0.5);
        `;
        banner.innerHTML = `
            <span>🔄</span>
            <span style="font-size:13px;color:#e8ecf4;">Yeni sürüm mevcut!</span>
            <button onclick="location.reload()" style="padding:5px 12px;border-radius:8px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.3);color:#00d4ff;font-size:12px;cursor:pointer;font-weight:600;">Güncelle</button>
        `;
        document.body.appendChild(banner);
    }

    // ── Başlat ─────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        pushIzniIste();
    });

    // ── Yardımcı: VAPID Key dönüştür ───────────────────────────────
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw     = atob(base64);
        return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
    }

})();
