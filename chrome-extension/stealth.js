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
  if (window.chrome && window.chrome.app) {
    Object.defineProperty(window.chrome.app, 'isInstalled', {
      get: () => false,
      configurable: true,
    });
  }
} catch (_) {}

// 6. WebGL fingerprint — yaygın laptop GPU profili (Intel UHD 620)
// Cloudflare/FingerprintJS renderer bilgisini fingerprint için kullanır
try {
  const _glGetParam = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (param) {
    if (param === 37445) return 'Intel Inc.';
    if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)';
    return _glGetParam.call(this, param);
  };
} catch (_) {}
try {
  const _gl2GetParam = WebGL2RenderingContext.prototype.getParameter;
  WebGL2RenderingContext.prototype.getParameter = function (param) {
    if (param === 37445) return 'Intel Inc.';
    if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)';
    return _gl2GetParam.call(this, param);
  };
} catch (_) {}

// 7. Navigator properties — gerçekçi Türk kullanıcı profili
try {
  Object.defineProperty(navigator, 'languages',          { get: () => ['tr-TR', 'tr', 'en-US', 'en'], configurable: true });
  Object.defineProperty(navigator, 'platform',           { get: () => 'Win32',                        configurable: true });
  Object.defineProperty(navigator, 'hardwareConcurrency',{ get: () => 8,                              configurable: true });
  Object.defineProperty(navigator, 'deviceMemory',       { get: () => 8,                              configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints',     { get: () => 0,                              configurable: true });
} catch (_) {}

// 8. Network Information API — gerçekçi bağlantı bilgisi
try {
  if (navigator.connection) {
    Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g',  configurable: true });
    Object.defineProperty(navigator.connection, 'downlink',      { get: () => 10,    configurable: true });
    Object.defineProperty(navigator.connection, 'rtt',           { get: () => 50,    configurable: true });
    Object.defineProperty(navigator.connection, 'saveData',      { get: () => false, configurable: true });
  }
} catch (_) {}

// 9. Screen properties — tutarlı masaüstü profili
try {
  Object.defineProperty(screen, 'colorDepth',  { get: () => 24, configurable: true });
  Object.defineProperty(screen, 'pixelDepth',  { get: () => 24, configurable: true });
} catch (_) {}

// 10. Permission API normalizasyonu
// Cloudflare 'notifications' iznini kontrol eder; otomasyon ortamı hata verir
try {
  const _permQuery = Permissions.prototype.query;
  Permissions.prototype.query = function (desc) {
    if (desc && desc.name === 'notifications') {
      return Promise.resolve({ state: 'default', onchange: null });
    }
    return _permQuery.call(this, desc);
  };
} catch (_) {}
