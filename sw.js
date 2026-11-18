/* City Map Studio — service worker (mode hors ligne, GitHub Pages)
 *
 * - Ne touche qu'aux requêtes GET de la même origine : tuiles et Nominatim (services tiers, soumis à
 *   l'accord de l'utilisateur) passent directement au réseau, sans jamais être mis en cache ici.
 * - Application (HTML, CSS, JS, manifeste, icônes) : réseau d'abord, copie en cache si le réseau manque.
 *   En ligne, la version publiée est toujours servie : pas de mélange d'anciens et de nouveaux fichiers après une mise à jour.
 * - lib/ (MapLibre, polices, données du ciel ; versions figées) : cache d'abord.
 *
 * Changer VERSION à chaque modification de la liste APP ci-dessous ou de ce fichier.
 */
'use strict';
const VERSION = 'cms-2026-11-18b';
const APP = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'css/app.css',
  'js/config.js', 'js/state.js', 'js/geo.js', 'js/render.js', 'js/engines.js', 'js/preview.js',
  'js/features.js', 'js/ui.js', 'js/export.js', 'js/main.js',
  'lib/maplibre-gl.js', 'lib/maplibre-gl.css', 'lib/fonts/fonts.css'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    // Hors ligne : la page de l'application quelle que soit son adresse (?…, lien partagé #a=…)
    const hit = await cache.match(req, {ignoreSearch: req.mode === 'navigate'}) || (req.mode === 'navigate' && await cache.match('index.html'));
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(VERSION), hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const lib = url.pathname.startsWith(new URL('lib/', self.registration.scope).pathname);
  e.respondWith(lib ? cacheFirst(req) : networkFirst(req));
});
