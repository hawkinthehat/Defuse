const CACHE_NAME = 'defuse-v8';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/protocols/cas/cas.css',
  '/protocols/cas/cas.js',
  '/protocols/ccd/ccd.css',
  '/protocols/ccd/ccd.js',
  '/protocols/cpi/cpi.css',
  '/protocols/cpi/cpi.js',
  '/protocols/kcb/kcb.css',
  '/protocols/kcb/kcb.js',
  '/protocols/obd/obd.css',
  '/protocols/obd/obd.js',
  '/protocols/wmd/wmd.css',
  '/protocols/wmd/wmd.js',
  '/protocols/cre/cre.css',
  '/protocols/cre/cre.js',
  '/protocols/mdr/mdr.css',
  '/protocols/mdr/mdr.js',
  '/protocols/ics/ics.css',
  '/protocols/ics/ics.js',
  '/protocols/audio/audio.css',
  '/protocols/audio/audio.js',
  '/protocols/vsd/vsd.css',
  '/protocols/vsd/vsd.js',
  '/protocols/gcm/gcm.css',
  '/protocols/gcm/gcm.js',
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
