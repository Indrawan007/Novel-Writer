/* ============================================
   Service Worker — Offline Caching
   Strategi:
     • Navigasi (index.html)  -> network-first, fallback cache
       (update UI langsung terasa, tetap jalan offline)
     • Aset lokal             -> stale-while-revalidate
     • CDN (html2pdf/docx, lazy-load saat ekspor) -> network-first + cache fallback
   ============================================ */

const CACHE_NAME = 'novel-writer-v10';

// URL relatif terhadap lokasi sw.js → aman di sub-path
// (mis. https://user.github.io/Novel-Writer/) maupun root domain.
const BASE = new URL('.', self.location.href).href;

const ASSETS = [
  '',                    // BASE itu sendiri (start_url "./")
  'index.html',
  'icon.svg',
  'css/style.css',
  'js/i18n.js',
  'js/storage.js',
  'js/icons.js',
  'js/text.js',
  'js/richtext.js',
  'js/export.js',
  'js/app.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
].map((p) => BASE + p);

const HOME = BASE + 'index.html';

function isCdnHost(hostname) {
  return hostname.includes('cdn') || hostname.includes('unpkg') ||
         hostname.includes('jsdelivr') || hostname.includes('cdnjs');
}

// Install — cache aset inti satu per satu:
// aset yang gagal/404 (mis. ikon belum di-generate di clone baru)
// TIDAK membuat seluruh Service Worker gagal terpasang.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// Activate — bersihkan cache lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // --- CDN (html2pdf, docx): network-first, fallback cache ---
  if (url.origin !== self.location.origin) {
    if (!isCdnHost(url.hostname)) return; // biarkan request lain apa adanya
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // --- Navigasi: network-first supaya pembaruan UI langsung terlihat ---
  const isNavigation = request.mode === 'navigate' ||
    (request.headers && request.headers.get && (request.headers.get('accept') || '').includes('text/html'));
  const isHome = url.href === BASE || url.href === HOME;

  if (isNavigation || isHome) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(HOME, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match(HOME)))
    );
    return;
  }

  // --- Aset lokal lain: stale-while-revalidate ---
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
