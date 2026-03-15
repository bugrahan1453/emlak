'use strict';
/**
 * EmlakRadar — Stealth Content Script
 * runAt: document_start, world: MAIN
 * Cloudflare/bot tespitini önlemek için sayfa JS'inden ÖNCE çalışır.
 */

// 1. navigator.webdriver gizle
try {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true,
  });
} catch (_) {}

// 2. Visibility state her zaman 'visible' görünsün
// Cloudflare, arka plan sekmesi tespiti için document.hidden kullanır
try {
  Object.defineProperty(document, 'hidden', {
    get: () => false,
    configurable: true,
  });
  Object.defineProperty(document, 'visibilityState', {
    get: () => 'visible',
    configurable: true,
  });
  // visibilitychange event listener'larını engelle
  const _addEvt = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (type === 'visibilitychange') return;
    return _addEvt.call(this, type, ...rest);
  };
} catch (_) {}

// 3. Canvas fingerprint noise — her piksel çağrısına mikro gürültü ekle
try {
  const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const ctx2d = this.getContext && this.getContext('2d');
    if (ctx2d && this.width > 0 && this.height > 0) {
      try {
        const d = ctx2d.getImageData(0, 0, 1, 1);
        d.data[0] = d.data[0] ^ (Math.random() * 3 | 0);
        ctx2d.putImageData(d, 0, 0);
      } catch (_) {}
    }
    return _toDataURL.apply(this, args);
  };

  const _getImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...args) {
    const data = _getImageData.apply(this, args);
    // Sadece fingerprint amaçlı küçük canvas çağrılarına gürültü ekle
    if (args[2] <= 16 && args[3] <= 16) {
      data.data[0] ^= (Math.random() * 3 | 0);
    }
    return data;
  };
} catch (_) {}

// 4. AudioContext fingerprint noise
try {
  const _getChannelData = AudioBuffer.prototype.getChannelData;
  AudioBuffer.prototype.getChannelData = function (...args) {
    const arr = _getChannelData.apply(this, args);
    if (arr.length > 0) {
      arr[0] += (Math.random() - 0.5) * 0.000001;
    }
    return arr;
  };
} catch (_) {}

// 5. Chrome otomasyon izlerini gizle
try {
  // window.chrome.runtime.id varlığı bazı tespitlerde kullanılır
  // Silmek yerine orijinali koru — silinince daha şüpheli görünür
  // chrome.app.isInstalled sıfır yapılır
  if (window.chrome && window.chrome.app) {
    Object.defineProperty(window.chrome.app, 'isInstalled', {
      get: () => false,
      configurable: true,
    });
  }
} catch (_) {}
