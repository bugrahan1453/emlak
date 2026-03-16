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
  // visibilitychange listener'larını engelleme — bunun yerine event'i kontrollü geçir
  // Cloudflare listener kaydedip test edebilir, tamamen engellemek bizi ele verir
  const _addEvt = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, ...rest) {
    if (type === 'visibilitychange') {
      // Listener'ı normal kaydet — engelleme
      // document.hidden ve visibilityState zaten override edildiği için
      // callback tetiklense bile 'visible' görecek
    }
    return _addEvt.call(this, type, fn, ...rest);
  };
} catch (_) {}

// 3. Canvas fingerprint noise — session-stable seed tabanlı
try {
  // Session boyunca sabit seed
  const _seed = Date.now() ^ (Math.random() * 0xFFFFFFFF >>> 0);
  function stableNoise(input) {
    let h = _seed ^ input;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return (h % 5) - 2; // -2 ile +2 arası sabit offset
  }

  const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const ctx2d = this.getContext && this.getContext('2d');
    if (ctx2d && this.width > 0 && this.height > 0) {
      try {
        const d = ctx2d.getImageData(0, 0, 1, 1);
        d.data[0] = (d.data[0] + stableNoise(d.data[0])) & 0xFF;
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
      data.data[0] = (data.data[0] + stableNoise(data.data[0])) & 0xFF;
    }
    return data;
  };
} catch (_) {}

// 4. AudioContext fingerprint noise — session-stable seed tabanlı
try {
  const _audioSeed = Date.now() ^ (Math.random() * 0xFFFFFFFF >>> 0);
  const _getChannelData = AudioBuffer.prototype.getChannelData;
  AudioBuffer.prototype.getChannelData = function (...args) {
    const arr = _getChannelData.apply(this, args);
    if (arr.length > 0) {
      // Sabit, tekrarlanabilir mikro noise
      arr[0] += ((_audioSeed % 1000) / 1000000000);
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

// 6. WebGL fingerprint — session başında rastgele ama sabit GPU profili seçer
// Cloudflare/FingerprintJS renderer bilgisini fingerprint için kullanır
try {
  const GPU_PROFILES = [
    { vendor: 'Intel Inc.', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Intel Inc.', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Intel Inc.', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Intel Inc.', renderer: 'ANGLE (Intel, Intel(R) HD Graphics 530 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  ];
  const _gpuIdx = Math.floor(Math.random() * GPU_PROFILES.length);
  const _gpu = GPU_PROFILES[_gpuIdx];

  const _glGetParam = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (param) {
    if (param === 37445) return _gpu.vendor;
    if (param === 37446) return _gpu.renderer;
    return _glGetParam.call(this, param);
  };

  const _gl2GetParam = WebGL2RenderingContext.prototype.getParameter;
  WebGL2RenderingContext.prototype.getParameter = function (param) {
    if (param === 37445) return _gpu.vendor;
    if (param === 37446) return _gpu.renderer;
    return _gl2GetParam.call(this, param);
  };
} catch (_) {}

// 7. Navigator properties — hafif varyasyonlu Türk kullanıcı profili
try {
  const _hwConcurrency = [4, 8, 12][Math.floor(Math.random() * 3)];
  const _devMemory = [4, 8, 8, 16][Math.floor(Math.random() * 4)]; // 8 ağırlıklı
  Object.defineProperty(navigator, 'languages',          { get: () => ['tr-TR', 'tr', 'en-US', 'en'], configurable: true });
  Object.defineProperty(navigator, 'platform',           { get: () => 'Win32',                        configurable: true });
  Object.defineProperty(navigator, 'hardwareConcurrency',{ get: () => _hwConcurrency,                 configurable: true });
  Object.defineProperty(navigator, 'deviceMemory',       { get: () => _devMemory,                     configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints',     { get: () => 0,                              configurable: true });
} catch (_) {}

// 8. Network Information API — gerçekçi, hafif varyasyonlu bağlantı bilgisi
try {
  if (navigator.connection) {
    const _rtt = [50, 50, 75, 100][Math.floor(Math.random() * 4)];
    const _downlink = [8, 10, 10, 15, 20][Math.floor(Math.random() * 5)];
    Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g',       configurable: true });
    Object.defineProperty(navigator.connection, 'downlink',      { get: () => _downlink,  configurable: true });
    Object.defineProperty(navigator.connection, 'rtt',           { get: () => _rtt,       configurable: true });
    Object.defineProperty(navigator.connection, 'saveData',      { get: () => false,      configurable: true });
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
