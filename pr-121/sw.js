/* City Map Studio — service worker (mode hors ligne, GitHub Pages)
 *
 * - Ne touche qu'aux requêtes GET de la même origine : tuiles et Nominatim (services tiers, soumis à
 *   l'accord de l'utilisateur) passent directement au réseau, sans jamais être mis en cache ici.
 * - Application (HTML, CSS, JS, manifeste, icônes) : réseau d'abord, copie en cache si le réseau manque.
 *   En ligne, la version publiée est toujours servie : pas de mélange d'anciens et de nouveaux fichiers après une mise à jour.
 *   Requête « no-cache » : revalidation auprès du serveur, jamais de copie périmée du cache HTTP
 *   (GitHub Pages répond Cache-Control: max-age=600).
 * - lib/ (MapLibre, polices, données du ciel ; versions figées) : cache d'abord.
 * - Plusieurs copies sur la même origine (#97) : racine = version classique, /nouvelle/, préversions /pr-N/. Le stockage
 *   des caches est commun à l'origine : chaque copie nomme son cache « VERSION@dossier » et n'efface que les siens.
 * - Mise à jour (issue #65) : un nouveau worker attend (« waiting ») ; la page propose « Mettre à jour » et n'envoie
 *   {type:'SKIP_WAITING'} qu'à l'accord de l'utilisateur. {type:'GET_VERSION'} renvoie VERSION sur le port fourni.
 *
 * Changer VERSION (et sa copie CMS.build de src/core/cms.ts, à l'identique) à chaque modification de la liste APP ci-dessous, de ce fichier ou d'un fichier de APP
 * (vérifié par la CI : tests/swversion.py). Tout fichier de js/, css/ et lib/ (hors lib/sky/, polices woff2 et licences)
 * doit figurer dans APP (tests/pwa.py).
 */
'use strict';
const VERSION = '2.0.0-alpha.1+0adbca3';   // remplacée au build (scripts/build.mjs) : <version de package.json>+<empreinte> (SemVer)
// Cache propre à ce dossier : une autre copie de l'application sur la même origine ne touche pas à ses fichiers
const SCOPE = new URL(self.registration.scope).pathname, CACHE = `${VERSION}@${SCOPE}`;
const APP = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'css/app.6de28c91c0.css', 'js/app.6a0df3a423.js', 'lib/maplibre-gl.js', 'lib/maplibre-gl.css', 'lib/fonts/fonts.css'];

self.addEventListener('install', e => {
  // Pas de skipWaiting() ici : à la première installation, le worker s'active seul (aucun autre en place) ;
  // ensuite, il attend l'accord de l'utilisateur pour ne pas mêler ancien JS en mémoire et nouveaux fichiers.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP.map(u => new Request(u, {cache: 'no-cache'})))));
});
self.addEventListener('message', e => {
  const t = e.data && e.data.type;
  if (t === 'SKIP_WAITING') self.skipWaiting();
  else if (t === 'GET_VERSION' && e.ports[0]) e.ports[0].postMessage(VERSION);
});
self.addEventListener('activate', e => {
  // Seuls les anciens caches de ce dossier sont purgés (ceux des autres copies, et l'ancien nommage sans « @ », restent)
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.endsWith(`@${SCOPE}`) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, {cache: 'no-cache'});   // revalidation (304 peu coûteux), jamais de copie HTTP périmée
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
  const cache = await caches.open(CACHE), hit = await cache.match(req);
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
