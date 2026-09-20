/* ============================================
   Service Worker — Offline Caching
   ============================================ */

const CACHE_NAME = 'novel-writer-v5';


// URL relatif terhadap lokasi sw.js → aman di sub-path
// (mis. https://user.github.io/Novel-Writer/) maupun root domain.
const BASE = new URL('.', self.location.href).href;

const ASSETS = [
  'index.html',
  'css/style.css',
  'js/i18n.js',
  'js/storage.js',
  'js/icons.js',
  'js/markdown.js',
  'js/export.js',
  'js/app.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
].map(p => BASE + p);

// Install — cache aset inti satu per satu:
// aset yang gagal/404 (mis. ikon belum di-generate di clone baru)
// TIDAK membuat seluruh Service Worker gagal terpasang.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting(); // Activate immediately
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — cache-first for local, network-first for CDN
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Untuk resource CDN (marked, html2pdf, docx): network-first
  if (url.hostname.includes('cdn') || url.hostname.includes('unpkg') || url.hostname.includes('cdnjs')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Update cache dengan salinan terbaru
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Untuk aset lokal: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});