// Offline cache for the Wi-Fi magic prop app. Cache-first with a runtime
// fallback so nothing (including the large OCR/wasm assets) requires the
// network once it has been loaded successfully one time.
const CACHE_VERSION = 'wifimagic-v14';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/storage.js',
  './js/ocr.js',
  './js/effect.js',
  './js/app.js',
  './vendor/tesseract/tesseract.min.js',
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/tesseract-core.wasm.js',
  './vendor/tesseract/tesseract-core.wasm',
  './vendor/tesseract/tesseract-core-simd.wasm',
  './vendor/tesseract/lang/eng.traineddata.gz',
  './icons/hero-wifi.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(() => {}) // never block install even if one asset fails to fetch
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
