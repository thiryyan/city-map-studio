/* City Map Studio — Client de géocodage Nominatim, espace CMS.geocoder.
 * Module ES (#102), importé par src/app/main.ts ; réuni en un seul script par le build (scripts/build.mjs).
 *
 * Politique d'usage (https://operations.osmfoundation.org/policies/nominatim/) : requêtes à la demande seulement
 * (jamais pendant la frappe), au plus une par seconde, résultats mis en cache, arrêt en cas de blocage (429 / 403).
 * - délai de TIMEOUT ms par requête ; une nouvelle requête annule la précédente ; la même requête en cours est partagée ;
 * - 429 / 403 : attente (Retry-After s'il est lisible : rarement, l'en-tête n'est pas exposé par CORS) sans aucune requête ;
 * - 5xx : une relance après 1,5 s ; cache LRU des CACHE_MAX dernières requêtes ;
 * - réponse validée : coordonnées finies et dans les bornes Mercator, textes tronqués ; aucune donnée brute n'est rendue.
 * Erreurs typées : err.code ∈ EMPTY, TIMEOUT, RATE_LIMITED, NETWORK, HTTP, BAD_RESPONSE, ABORTED.
 */
import {NOMINATIM} from '../content/config.js';
import {netMsg} from './network.js';
(function (g: typeof globalThis) {
  const CMS = g.CMS;   // src/core/cms.ts
  const testCfg = /[?&]test(?:[=&]|$)/.test(g.location?.search ?? '') ? (g.__cmsTestConfig ?? {}) : {};
  const MIN_INTERVAL = testCfg.geoInterval ?? 1100, TIMEOUT = testCfg.geoTimeout ?? 10000, RETRY_DELAY = testCfg.geoRetry ?? 1500;
  const CACHE_MAX = 50, DEFAULT_COOLDOWN = 60000;
  /** Lieu trouvé, validé (sanitize) */
  interface Found { lat: number; lon: number; name: string; display: string; key: string; city: string; region: string; country: string }
  const cache = new Map<string, Found[]>();
  let lastAt = 0, current: {ck: string; ctl: AbortController; promise: Promise<Found[]> | null} | null = null, cooldownUntil = 0;

  function geoError(code: string, message: string, extra?: {retryInMs?: number; status?: number}): CmsError {
    const e = new Error(message) as CmsError; e.name = 'GeocodeError'; e.code = code;
    return Object.assign(e, extra);
  }
  const sleep = (ms: number, signal?: AbortSignal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(geoError('ABORTED', 'annulée')); return; }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(geoError('ABORTED', 'annulée')); }, { once: true });
  });
  function retryAfterMs(h: string | null) {
    if (!h) return DEFAULT_COOLDOWN;
    const s = Number(h); if (Number.isFinite(s)) return Math.max(1000, s * 1000);
    const d = Date.parse(h); return Number.isFinite(d) ? Math.max(1000, d - Date.now()) : DEFAULT_COOLDOWN;
  }
  const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

  /** Résultats sûrs : {lat, lon, name, display, key, city, region, country} ; les entrées invalides sont écartées.
   *  city / region / country : tirés de l'adresse détaillée (addressdetails), chaîne vide s'ils manquent */
  function sanitize(list: unknown): Found[] {
    if (!Array.isArray(list)) throw geoError('BAD_RESPONSE', 'réponse inattendue');
    return list.map((it: any): Found | null => {
      const lat = Number.parseFloat(it?.lat), lon = Number.parseFloat(it?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85.06 || Math.abs(lon) > 180) return null;
      const display = clip(it?.display_name, 300), name = clip(it?.name, 120);
      const a = it?.address && typeof it.address === 'object' ? it.address : {};
      const first = (...k: string[]) => k.map(x => clip(typeof a[x] === 'string' ? a[x] : '', 120)).find(Boolean) || '';
      return { lat, lon, name, display: display || name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`, key: `${clip(it?.osm_type, 10)}/${clip(it?.osm_id, 20)}`,
        city: first('city', 'town', 'village', 'municipality', 'hamlet', 'locality', 'isolated_dwelling'), region: first('state', 'county', 'region'), country: first('country') };
    }).filter((x): x is Found => !!x);
  }

  async function request(ck: string, url: URL, ctl: AbortController): Promise<Found[]> {
    const wait = lastAt + MIN_INTERVAL - Date.now();
    if (wait > 0) await sleep(wait, ctl.signal);
    for (let attempt = 0; ; attempt++) {
      if (Date.now() < cooldownUntil) throw geoError('RATE_LIMITED', 'quota atteint', { retryInMs: cooldownUntil - Date.now() });
      lastAt = Date.now();
      let timedOut = false, res: Response;
      const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, TIMEOUT);
      try { res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } }); }
      catch (e) {
        if (ctl.signal.aborted) throw geoError(timedOut ? 'TIMEOUT' : 'ABORTED', timedOut ? 'délai dépassé' : 'annulée');
        throw geoError('NETWORK', typeof netMsg === 'function' ? netMsg(e) : (e as Error).message);
      } finally { clearTimeout(timer); }
      if (res.status === 429 || res.status === 403) {
        const ms = retryAfterMs(res.headers.get('Retry-After'));
        cooldownUntil = Date.now() + ms;
        throw geoError('RATE_LIMITED', 'quota atteint', { retryInMs: ms, status: res.status });
      }
      if (res.status >= 500 && attempt === 0) { await sleep(RETRY_DELAY, ctl.signal); continue; }
      if (!res.ok) throw geoError('HTTP', `HTTP ${res.status}`, { status: res.status });
      let json: unknown;
      try { json = await res.json(); } catch (e) { throw geoError('BAD_RESPONSE', 'réponse illisible'); }
      const list = sanitize(json);
      cache.set(ck, list);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
      return list;
    }
  }

  /** Recherche (la plus récente l'emporte ; la même requête en cours est partagée) */
  function search(query: unknown, { lang = 'fr', limit = 5 } = {}): Promise<Found[]> {
    const q = String(query ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!q) return Promise.reject(geoError('EMPTY', 'requête vide'));
    const ck = `${lang}|${limit}|${q.toLowerCase()}`;
    if (cache.has(ck)) { const v = cache.get(ck) as Found[]; cache.delete(ck); cache.set(ck, v); return Promise.resolve(v); }
    if (current && current.ck === ck && current.promise) return current.promise;
    if (Date.now() < cooldownUntil) return Promise.reject(geoError('RATE_LIMITED', 'quota atteint', { retryInMs: cooldownUntil - Date.now() }));
    current?.ctl.abort();
    const ctl = new AbortController(), url = new URL(NOMINATIM);
    url.search = new URLSearchParams({ format: 'jsonv2', limit: String(limit), 'accept-language': lang, addressdetails: '1', q }).toString();
    const entry: NonNullable<typeof current> = { ck, ctl, promise: null };
    entry.promise = request(ck, url, ctl).finally(() => { if (current === entry) current = null; });
    current = entry;
    return entry.promise as Promise<Found[]>;
  }

  /** Anti-rebond de la validation (front montant) : une validation moins de `ms` après la précédente est ignorée */
  function debounceSubmit<A extends unknown[]>(fn: (...a: A) => void, ms = 300) {
    let last = -Infinity;
    return (...a: A) => { const now = Date.now(); if (now - last < ms) return; last = now; fn(...a); };
  }

  /** Adresse de l'état du service (diagnostic : ne consomme pas de recherche) */
  const statusUrl = () => new URL('status?format=json', NOMINATIM).href;

  CMS.define('geocoder', () => ({
    search, debounceSubmit, statusUrl, sanitize,
    cancel: () => current?.ctl.abort(),
    get cooldownMs() { return Math.max(0, cooldownUntil - Date.now()); },
  }));
})(globalThis);
