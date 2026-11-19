/* City Map Studio — Client de géocodage Nominatim, espace CMS.geocoder.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé après config.js.
 *
 * Politique d'usage (https://operations.osmfoundation.org/policies/nominatim/) : requêtes à la demande seulement
 * (jamais pendant la frappe), au plus une par seconde, résultats mis en cache, arrêt en cas de blocage (429 / 403).
 * - délai de TIMEOUT ms par requête ; une nouvelle requête annule la précédente ; la même requête en cours est partagée ;
 * - 429 / 403 : attente (Retry-After s'il est lisible : rarement, l'en-tête n'est pas exposé par CORS) sans aucune requête ;
 * - 5xx : une relance après 1,5 s ; cache LRU des CACHE_MAX dernières requêtes ;
 * - réponse validée : coordonnées finies et dans les bornes Mercator, textes tronqués ; aucune donnée brute n'est rendue.
 * Erreurs typées : err.code ∈ EMPTY, TIMEOUT, RATE_LIMITED, NETWORK, HTTP, BAD_RESPONSE, ABORTED.
 */
'use strict';
(function (g) {
  const CMS = g.CMS;   // js/core.js
  const testCfg = /[?&]test(?:[=&]|$)/.test(g.location?.search ?? '') ? (g.__cmsTestConfig ?? {}) : {};
  const MIN_INTERVAL = testCfg.geoInterval ?? 1100, TIMEOUT = testCfg.geoTimeout ?? 10000, RETRY_DELAY = testCfg.geoRetry ?? 1500;
  const CACHE_MAX = 50, DEFAULT_COOLDOWN = 60000;
  const cache = new Map();
  let lastAt = 0, current = null, cooldownUntil = 0;

  function geoError(code, message, extra) {
    const e = new Error(message); e.name = 'GeocodeError'; e.code = code;
    return Object.assign(e, extra);
  }
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(geoError('ABORTED', 'annulée')); return; }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(geoError('ABORTED', 'annulée')); }, { once: true });
  });
  function retryAfterMs(h) {
    if (!h) return DEFAULT_COOLDOWN;
    const s = Number(h); if (Number.isFinite(s)) return Math.max(1000, s * 1000);
    const d = Date.parse(h); return Number.isFinite(d) ? Math.max(1000, d - Date.now()) : DEFAULT_COOLDOWN;
  }
  const clip = (v, n) => String(v ?? '').trim().slice(0, n);

  /** Résultats sûrs : {lat, lon, name, display, key} ; les entrées invalides sont écartées */
  function sanitize(list) {
    if (!Array.isArray(list)) throw geoError('BAD_RESPONSE', 'réponse inattendue');
    return list.map(it => {
      const lat = Number.parseFloat(it?.lat), lon = Number.parseFloat(it?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85.06 || Math.abs(lon) > 180) return null;
      const display = clip(it?.display_name, 300), name = clip(it?.name, 120);
      return { lat, lon, name, display: display || name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`, key: `${clip(it?.osm_type, 10)}/${clip(it?.osm_id, 20)}` };
    }).filter(Boolean);
  }

  async function request(q, ck, url, ctl) {
    const wait = lastAt + MIN_INTERVAL - Date.now();
    if (wait > 0) await sleep(wait, ctl.signal);
    for (let attempt = 0; ; attempt++) {
      if (Date.now() < cooldownUntil) throw geoError('RATE_LIMITED', 'quota atteint', { retryInMs: cooldownUntil - Date.now() });
      lastAt = Date.now();
      let timedOut = false, res;
      const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, TIMEOUT);
      try { res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } }); }
      catch (e) {
        if (ctl.signal.aborted) throw geoError(timedOut ? 'TIMEOUT' : 'ABORTED', timedOut ? 'délai dépassé' : 'annulée');
        throw geoError('NETWORK', typeof netMsg === 'function' ? netMsg(e) : e.message);
      } finally { clearTimeout(timer); }
      if (res.status === 429 || res.status === 403) {
        const ms = retryAfterMs(res.headers.get('Retry-After'));
        cooldownUntil = Date.now() + ms;
        throw geoError('RATE_LIMITED', 'quota atteint', { retryInMs: ms, status: res.status });
      }
      if (res.status >= 500 && attempt === 0) { await sleep(RETRY_DELAY, ctl.signal); continue; }
      if (!res.ok) throw geoError('HTTP', `HTTP ${res.status}`, { status: res.status });
      let json;
      try { json = await res.json(); } catch (e) { throw geoError('BAD_RESPONSE', 'réponse illisible'); }
      const list = sanitize(json);
      cache.set(ck, list);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return list;
    }
  }

  /** Recherche (la plus récente l'emporte ; la même requête en cours est partagée) */
  function search(query, { lang = 'fr', limit = 5 } = {}) {
    const q = String(query ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!q) return Promise.reject(geoError('EMPTY', 'requête vide'));
    const ck = `${lang}|${limit}|${q.toLowerCase()}`;
    if (cache.has(ck)) { const v = cache.get(ck); cache.delete(ck); cache.set(ck, v); return Promise.resolve(v); }
    if (current && current.ck === ck) return current.promise;
    if (Date.now() < cooldownUntil) return Promise.reject(geoError('RATE_LIMITED', 'quota atteint', { retryInMs: cooldownUntil - Date.now() }));
    current?.ctl.abort();
    const ctl = new AbortController(), url = new URL(NOMINATIM);
    url.search = new URLSearchParams({ format: 'jsonv2', limit: String(limit), 'accept-language': lang, q }).toString();
    const entry = { ck, ctl, promise: null };
    entry.promise = request(q, ck, url, ctl).finally(() => { if (current === entry) current = null; });
    current = entry;
    return entry.promise;
  }

  /** Anti-rebond de la validation (front montant) : une validation moins de `ms` après la précédente est ignorée */
  function debounceSubmit(fn, ms = 300) {
    let last = -Infinity;
    return (...a) => { const now = Date.now(); if (now - last < ms) return; last = now; fn(...a); };
  }

  /** Adresse de l'état du service (diagnostic : ne consomme pas de recherche) */
  const statusUrl = () => new URL('status?format=json', NOMINATIM).href;

  CMS.define('geocoder', () => ({
    search, debounceSubmit, statusUrl, sanitize,
    cancel: () => current?.ctl.abort(),
    get cooldownMs() { return Math.max(0, cooldownUntil - Date.now()); },
  }));
})(globalThis);
