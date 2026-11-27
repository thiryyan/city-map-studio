/* City Map Studio — Lieux remarquables de Wikipédia autour du lieu (recherche géographique), espace CMS.wiki (issue #46).
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé après geocoder.js.
 *
 * Option désactivée par défaut (onglet Illustration, Pistes), soumise à l'accord préalable (needConsent) : aucune requête sans elle.
 * - une seule requête : generator=geosearch (articles géolocalisés les plus proches) avec la longueur de l'article,
 *   le nombre de langues, la description courte et les coordonnées ; seules les coordonnées du lieu (arrondies à 4 décimales,
 *   une dizaine de mètres) et le rayon sont transmis, sans cookie ni adresse de la page (referrerPolicy no-referrer) ;
 * - délai de TIMEOUT ms ; une nouvelle requête annule la précédente ; la même requête en cours est partagée ; cache LRU ;
 * - réponse validée : textes tronqués, nombres finis ; aucune donnée brute n'est rendue ;
 * - classement (rankWiki, fonction pure testée : tests/unit/wiki.test.mjs) : notoriété (nombre de langues, longueur),
 *   un peu de distance ; communes, quartiers, gares, écoles, rues… sont écartés (ce ne sont pas des sujets d'illustration).
 * Erreurs typées : err.code ∈ TIMEOUT, RATE_LIMITED, NETWORK, HTTP, BAD_RESPONSE, ABORTED.
 */
'use strict';
(function (g) {
  const CMS = g.CMS;   // js/core.js
  const testCfg = /[?&]test(?:[=&]|$)/.test(g.location?.search ?? '') ? (g.__cmsTestConfig ?? {}) : {};
  const API = 'https://fr.wikipedia.org/w/api.php', TIMEOUT = testCfg.wikiTimeout ?? 10000, CACHE_MAX = 30, LIMIT = 100;
  const cache = new Map();
  let current = null;

  function wikiError(code, message, extra) {
    const e = new Error(message); e.name = 'WikiError'; e.code = code;
    return Object.assign(e, extra);
  }
  const clip = (v, n) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
  const num = v => Number.isFinite(v) && v >= 0 ? v : 0;

  /** Pages sûres : {title, length, langs, desc, lat, lon, index} ; les entrées invalides sont écartées */
  function sanitize(json) {
    const pages = json?.query?.pages;
    if (json && typeof json === 'object' && !json.query && !json.error) return [];   // aucun article géolocalisé : réponse sans « query »
    if (!Array.isArray(pages)) throw wikiError('BAD_RESPONSE', 'réponse inattendue');
    return pages.map(p => {
      const title = clip(p?.title, 200); if (!title || p?.missing) return null;
      const c = Array.isArray(p.coordinates) ? p.coordinates[0] : null;
      const lat = Number(c?.lat), lon = Number(c?.lon), ok = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
      return { title, length: num(p.length), langs: num(p.langlinkscount), desc: clip(p.description, 300),
        lat: ok ? lat : null, lon: ok ? lon : null, index: Number.isFinite(p.index) ? p.index : 999 };
    }).filter(Boolean);
  }

  // Ce qui n'est pas un sujet d'illustration : divisions administratives, quartiers, transports, établissements, voies
  const SKIP_DESC = /^(?:ancien(?:ne)?\s+)?(?:commune|ville|village|hameau|quartier|lieu-dit|canton|arrondissement|département|région|circonscription|intercommunalité|communauté\s+(?:de\s+communes|d['’]agglomération|urbaine)|métropole|aire|unité\s+urbaine|gare|station|halte|arrêt|ligne|lycée|collège|école|université|établissement|club|équipe|entreprise|société|hôpital|clinique|diocèse|rue|avenue|boulevard|route|autoroute|voie|impasse|allée|liste)\b/i;
  const SKIP_TITLE = /^(?:Gare|Station|Arrondissement|Canton|Circonscription|Liste|Rue|Avenue|Boulevard|Lycée|Collège|École|Université|Hôpital|Diocèse)\b/;
  const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  /** Distance approchée (km) */
  const distKm = (a, b) => Math.hypot((a.lon - b.lon) * 111.32 * Math.cos(b.lat * Math.PI / 180), (a.lat - b.lat) * 110.57);

  /** Meilleurs lieux : score = notoriété (langues, longueur) − distance ; un seul exemplaire par nom, la ville elle-même écartée.
   *  pages : sortie de sanitize ; center {lat, lon} ; city : nom de la ville de l'affiche. Renvoie des noms (80 caractères au plus) */
  function rankWiki(pages, center, { city = '', max = 6 } = {}) {
    const town = fold(city), best = new Map();
    for (const p of pages || []) {
      if (!p || !p.title || SKIP_DESC.test(p.desc || '') || SKIP_TITLE.test(p.title)) continue;
      const name = p.title.replace(/\s*\([^)]*\)$/, '').slice(0, 80), k = fold(name);   // « Hôtel d'Épernon (Blois) » → « Hôtel d'Épernon »
      if (!k || (town && k === town)) continue;
      const d = p.lat != null && center ? distKm(p, center) : (p.index ?? 0) * 0.02;
      const sc = 3 * Math.log1p(p.langs || 0) + Math.log1p((p.length || 0) / 1000) - 0.3 * Math.min(d, 20);
      if (!best.has(k) || best.get(k).sc < sc) best.set(k, { name, sc });
    }
    return [...best.values()].sort((a, b) => b.sc - a.sc).slice(0, max).map(x => x.name);
  }

  /** Adresse de la requête : coordonnées arrondies (4 décimales) et rayon (m, 10 000 au plus : limite de l'API) */
  function requestUrl(lat, lon, radius) {
    const u = new URL(API), r = Math.round(Math.min(10000, Math.max(500, radius || 3000)));
    u.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'geosearch',
      ggscoord: `${lat.toFixed(4)}|${lon.toFixed(4)}`, ggsradius: String(r), ggslimit: String(LIMIT),
      prop: 'info|langlinkscount|description|coordinates', colimit: 'max' }).toString();
    return u;
  }

  async function request(url, ck, ctl) {
    let timedOut = false, res;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, TIMEOUT);
    try {
      try { res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } }); }
      catch (e) {
        if (ctl.signal.aborted) throw wikiError(timedOut ? 'TIMEOUT' : 'ABORTED', timedOut ? 'délai dépassé' : 'annulée');
        throw wikiError('NETWORK', typeof netMsg === 'function' ? netMsg(e) : e.message);
      }
      if (res.status === 429 || res.status === 403) throw wikiError('RATE_LIMITED', 'trop de requêtes', { status: res.status });
      if (!res.ok) throw wikiError('HTTP', `HTTP ${res.status}`, { status: res.status });
      let json;
      try { json = await res.json(); }
      catch (e) { throw ctl.signal.aborted ? wikiError(timedOut ? 'TIMEOUT' : 'ABORTED', timedOut ? 'délai dépassé' : 'annulée') : wikiError('BAD_RESPONSE', 'réponse illisible'); }
      const list = sanitize(json);
      cache.set(ck, list);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return list;
    } finally { clearTimeout(timer); }
  }

  /** Articles géolocalisés autour de {lat, lon} (la plus récente l'emporte ; la même requête en cours est partagée) */
  function search({ lat, lon, radius }) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Promise.reject(wikiError('BAD_RESPONSE', 'lieu invalide'));
    const url = requestUrl(lat, lon, radius), ck = url.href;
    if (cache.has(ck)) { const v = cache.get(ck); cache.delete(ck); cache.set(ck, v); return Promise.resolve(v); }
    if (current && current.ck === ck) return current.promise;
    current?.ctl.abort();
    const ctl = new AbortController(), entry = { ck, ctl, promise: null };
    entry.promise = request(url, ck, ctl).finally(() => { if (current === entry) current = null; });
    current = entry;
    return entry.promise;
  }

  CMS.define('wiki', () => ({
    search, sanitize, rankWiki, requestUrl, API,
    cancel: () => current?.ctl.abort(),
  }));
})(globalThis);
