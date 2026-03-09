/**
 * EmlakRadar Pro — PWA Service Worker Kaydı
 */

(function () {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js')
            .then(function (registration) {
                // Güncelleme kontrolü
                registration.addEventListener('updatefound', function () {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', function () {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Güncelleme mevcut
                            if (typeof showFlash === 'function') {
                                showFlash('Uygulama güncellendi. Yenilemek için sayfayı kapatın.', 'info');
                            }
                        }
                    });
                });
            })
            .catch(function (err) {
                // Sessiz hata — geliştirme ortamında normal
            });
    });

    // Install prompt (A2HS)
    let deferredPrompt = null;
    const installBtn = document.getElementById('pwa-install-btn');

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) installBtn.classList.remove('hidden');
    });

    if (installBtn) {
        installBtn.addEventListener('click', async function () {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                installBtn.classList.add('hidden');
                if (typeof showFlash === 'function') {
                    showFlash('EmlakRadar Pro yüklendi!', 'success');
                }
            }
            deferredPrompt = null;
        });
    }

    window.addEventListener('appinstalled', function () {
        if (installBtn) installBtn.classList.add('hidden');
        deferredPrompt = null;
    });
})();
