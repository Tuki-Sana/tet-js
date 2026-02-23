// tetris.js の APP_VERSION と揃えてデプロイごとにインクリメント
const CACHE_VERSION = '1.0.9';
const CACHE_NAME = 'tet-js-v' + CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/tetris.js',
  './manifest.json',
  './audio/bgm_normal.mp3',
  './audio/bgm_danger.mp3',
  './audio/iwa_gameover010.mp3',
  './audio/play.mp3',
  './audio/little_cure.mp3'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.startsWith('chrome-extension') || e.request.url.includes('extension')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const clone = res.clone();
      if (res.ok && e.request.method === 'GET' && sameOrigin(e.request.url)) {
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return res;
    }))
  );
});

function sameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}
