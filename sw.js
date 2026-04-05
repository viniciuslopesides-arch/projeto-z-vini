const CACHE_NAME = 'barber-cash-v1';
const assets = [
  './',
  './index.html',
  './dash.html',
  './css/index.css',
  './css/dash.css',
  './js/dash.js',
  './icon.png',
  './manifest.json'
];

// Instalação do Service Worker e Cache dos arquivos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(assets);
    })
  );
});

// Resposta com arquivos do Cache
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request);
    })
  );
});