/* City Map Studio — Chargement résilient de MapLibre GL JS (lib/ → unpkg → jsDelivr → cdnjs), espace CMS.maplibre.
 * Module ES (#102), importé par js/main.ts ; réuni en un seul script par le build (scripts/build.mjs).
 *
 * - Une seule promesse de chargement en cours ; une source en échec définitif (réseau, CSP, SRI, version) n'est pas retentée.
 * - Un <script> dont le délai est dépassé continue de se télécharger et s'exécute quand même à son arrivée (on ne peut pas
 *   l'annuler) : s'il arrive après qu'une autre source a gagné, la référence gagnante est rétablie ; s'il arrive après
 *   l'échec de toutes les sources, il est adopté et l'événement « cms:maplibre-ready » est émis sur window.
 * - Version vérifiée pour toutes les sources, copie locale comprise (le SRI ne couvre que les CDN).
 * - Feuille de style chargée avec onload/onerror : même source que le script, puis les autres sources autorisées.
 * - CDN tiers seulement après l'accord préalable (load({consent:true})).
 */
import {ML_CDNS, ML_SRI, ML_VERSION} from './config.js';
(function (g: typeof globalThis) {
  const CMS = g.CMS;   // js/core.ts
  const S = Object.freeze({ IDLE: 'idle', LOADING: 'loading', OK: 'ok', NEED_CONSENT: 'local-fail', FAIL: 'fail' } as const);
  type LoadState = typeof S[keyof typeof S];
  // Délais réglables par les tests seulement (adresse avec ?test et objet __cmsTestConfig posé avant le chargement)
  const testCfg = /[?&]test(?:[=&]|$)/.test(g.location?.search ?? '') ? (g.__cmsTestConfig ?? {}) : {};
  const JS_TIMEOUT = testCfg.mlTimeout ?? 12000, CSS_TIMEOUT = testCfg.mlCssTimeout ?? 8000;

  let state: LoadState = S.IDLE, source = '', lib: any = null, inflight: Promise<boolean> | null = null, cssOk = false;
  const failed = new Set<string>();

  const isRemote = (base: string) => /^https?:/.test(base);
  const hostOf = (base: string) => (isRemote(base) ? new URL(base).host : 'copie locale (lib/)');
  const versionOf = (ml: any) => (ml && typeof ml.getVersion === 'function' ? ml.getVersion() : ml?.version) ?? '';
  const err = (code: string, message: string) => Object.assign(new Error(message), { code });

  /** Adopte globalThis.maplibregl s'il est présent et à la bonne version */
  function adopt(src: string) {
    const ml = g.maplibregl;
    if (!ml) return false;
    if (ml === lib) return true;
    const v = versionOf(ml);
    if (v !== ML_VERSION) { console.error(`[MapLibre] version ${v || '?'} refusée (attendue ${ML_VERSION}) : ${src}`); return false; }
    lib = ml; source = src; state = S.OK;
    return true;
  }

  /** Script arrivé après son délai : ses effets sont neutralisés ou il est adopté */
  function onLateLoad(base: string) {
    if (state === S.OK) { if (g.maplibregl !== lib) g.maplibregl = lib; return; }   // une autre source a gagné
    if (state === S.LOADING) return;                                                 // la boucle l'adoptera
    if (adopt(hostOf(base) + ' (arrivée tardive)')) {
      loadCss(base, isRemote(base)).finally(() => g.dispatchEvent(new CustomEvent('cms:maplibre-ready', { detail: { source } })));
    } else failed.add(base);
  }

  function injectScript(base: string) {
    return new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = base + 'maplibre-gl.js'; el.async = true; el.dataset.maplibre = base;
      if (isRemote(base)) { el.integrity = ML_SRI.js; el.crossOrigin = 'anonymous'; }
      let settled = false;
      const timer = setTimeout(() => { settled = true; failed.add(base); reject(err('TIMEOUT', 'délai dépassé')); }, JS_TIMEOUT);   // jamais réinjecté : il peut encore arriver
      el.addEventListener('load', () => {
        if (settled) { onLateLoad(base); return; }
        settled = true; clearTimeout(timer); resolve();
      }, { once: true });
      el.addEventListener('error', () => {
        el.remove(); failed.add(base);
        if (settled) return;
        settled = true; clearTimeout(timer);
        reject(err('NETWORK', 'bloqué (réseau, CSP ou SRI)'));
      }, { once: true });
      document.head.append(el);
    });
  }

  function injectCss(base: string) {
    return new Promise<void>((resolve, reject) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = base + 'maplibre-gl.css'; l.dataset.maplibre = base;
      if (isRemote(base)) { l.integrity = ML_SRI.css; l.crossOrigin = 'anonymous'; }
      const timer = setTimeout(() => { l.remove(); reject(err('TIMEOUT', 'délai dépassé')); }, CSS_TIMEOUT);
      l.onload = () => { clearTimeout(timer); resolve(); };
      l.onerror = () => { clearTimeout(timer); l.remove(); reject(err('NETWORK', 'bloquée')); };
      document.head.append(l);
    });
  }

  /** Feuille de style : la même source que le script d'abord. Un échec n'empêche pas la carte de fonctionner. */
  async function loadCss(winner: string, allowRemote: boolean) {
    if (cssOk) return true;
    const order = [winner, ...ML_CDNS.filter(b => b !== winner && (allowRemote || !isRemote(b)))];
    for (const base of order) {
      try { await injectCss(base); cssOk = true; return true; }
      catch (e) { console.warn('[MapLibre CSS]', base, (e as Error).message); }
    }
    console.warn('[MapLibre] aucune feuille de style chargée : affichage dégradé');
    return false;
  }

  async function attempt(allowRemote: boolean) {
    for (const base of ML_CDNS) {
      if (adopt('déjà présente')) { await loadCss('lib/', allowRemote); return true; }   // arrivée tardive entre deux essais
      if (failed.has(base)) continue;
      if (isRemote(base) && !allowRemote) { state = S.NEED_CONSENT; return false; }
      try {
        await injectScript(base);
        if (adopt(hostOf(base))) { await loadCss(base, allowRemote); return true; }
        failed.add(base);
      } catch (e) { console.warn('[MapLibre]', base, (e as CmsError).code, (e as Error).message); }
    }
    if (adopt('déjà présente')) { await loadCss('lib/', allowRemote); return true; }
    return false;
  }

  /** @returns {Promise<boolean>} un seul chargement à la fois ; relançable (après l'accord par exemple) */
  function load({ consent = false } = {}) {
    if (state === S.OK) return Promise.resolve(true);
    if (inflight) return inflight;
    state = S.LOADING;
    inflight = attempt(consent)
      .then(ok => { if (!ok && state === S.LOADING) state = S.FAIL; return ok; })
      .finally(() => { inflight = null; });
    return inflight;
  }

  CMS.define('maplibre', () => ({
    load, STATES: S,
    get state() { return state; }, get source() { return source; }, get lib() { return lib; }, get cssOk() { return cssOk; },
  }));
})(globalThis);
