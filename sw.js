const CACHE_NAME = 'dzixw-v19';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/dzixw-logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/protocols/obd/obd.css',
  '/protocols/obd/obd.js',
  '/protocols/obd/script.js',
  '/protocols/obd/audio/obd-audio.js',
  '/protocols/obd/audio/gunwale-strike.wav',
  '/protocols/obd/assets/paddle-blade.svg',
  '/protocols/cre/cre.css',
  '/protocols/cre/cre.js',
  '/protocols/sam/sam.css',
  '/protocols/sam/app.js',
  '/protocols/iec/iec.css',
  '/protocols/iec/app.js',
  '/protocols/prcb/prcb.css',
  '/protocols/prcb/prcb.js',
  '/protocols/aed/index.html',
  '/protocols/aed/script.js',
  '/protocols/gwədiʔ/index.html',
  '/protocols/gwədiʔ/script.js',
  '/protocols/mif/index.html',
  '/protocols/mif/script.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request, { ignoreSearch: false }).then((cached) => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return caches.match(event.request.url);
      })
    )
  );
});
