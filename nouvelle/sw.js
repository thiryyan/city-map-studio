// Ancienne adresse /nouvelle/ (#104) : efface les caches de ce dossier, se retire et renvoie les pages vers la racine
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  const scope = new URL(self.registration.scope).pathname;
  for (const k of await caches.keys()) if (k.endsWith('@' + scope)) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({type: 'window'})) c.navigate(new URL('../', self.registration.scope).href);
})()));
