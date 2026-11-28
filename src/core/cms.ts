/* City Map Studio — Socle : espace de noms CMS et bus d'événements. Chargé en premier.
 * Module TypeScript (#103), importé par src/app/main.ts ; réuni en un seul script par le build (scripts/build.mjs, esbuild).
 * Types de l'espace de noms CMS : src/types.d.ts.
 *
 * Chaque fichier de src/ est un module ES rangé dans une couche (#118) : il n'importe que des couches inférieures
 * (tests/layers.py). Une couche basse s'adresse à une couche supérieure par événement : CMS.on / CMS.emit, ou les
 * demandes nommées de src/core/port.ts. CMS.define('nom', …) range des fonctions sous CMS.nom (testées seules :
 * tests/unit).
 */
(function (g: typeof globalThis) {
  const CMS = g.CMS = g.CMS || ({} as CmsNamespace);
  const bus = new EventTarget();
  /** Abonnement à un événement ; renvoie la fonction de désabonnement */
  CMS.on = (type, fn) => { const h = (e: Event) => fn((e as CustomEvent).detail); bus.addEventListener(type, h); return () => bus.removeEventListener(type, h); };
  /** Émission synchrone ; une erreur d'un abonné est signalée sans interrompre les autres */
  CMS.emit = (type, detail) => { bus.dispatchEvent(new CustomEvent(type, { detail })); };
  /** Définit le module CMS[name] une seule fois (objet figé) */
  CMS.define = <T extends object>(name: string, factory: (cms: CmsNamespace) => T): Readonly<T> => {
    if (Object.prototype.hasOwnProperty.call(CMS, name)) throw new Error(`CMS.${name} déjà défini`);
    const mod = Object.freeze(factory(CMS));
    Object.defineProperty(CMS, name, { value: mod, enumerable: true, writable: false, configurable: false });
    return mod;
  };
})(globalThis);
// ---------- Version de l'application ----------
// Identique à VERSION de sw.js (les deux générées par le build ; vérifié par tests/pwa.py) : la page connaît sa version
// même sans service worker (file://, première visite, hors ligne, tests). Format SemVer (#118) : <version de
// package.json>+<empreinte du contenu>, par exemple 2.0.0-alpha.1+3522713.
CMS.define('build', () => {
  const version: string = '0.0.0-dev';   // remplacée au build (scripts/build.mjs), comme VERSION de sw.js
  /** Libellé lisible : « 2.0.0-alpha.1 (3522713) » ; ancien format « cms-2026-11-28-3522713 » → « 28/11/2026 (3522713) »
   *  (copie hors ligne d'avant #118) ; autre format rendu tel quel */
  const label = (v?: string): string => {
    const s = /^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\+([0-9A-Za-z.-]+))?$/.exec(v || '');
    if (s) return s[1] + (s[2] ? ` (${s[2]})` : '');
    const m = /^cms-(\d{4})-(\d\d)-(\d\d)-?(.*)$/.exec(v || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` (${m[4]})` : '') : (v || 'inconnue');
  };
  return { version, label };
});
// ---------- Mesures de performance (#97, lot 3 : #101) ----------
// Temps relevés sur l'appareil, gardés en mémoire seulement (rien n'est enregistré ni envoyé) et affichés dans
// Lieu › Avancé › « Mesures de performance ». Budgets fixés le 27/11/2026 (réglage visible porté à 400 ms le 28/11/2026) ; un seul appareil de référence,
// l'« Appareil S2x » (téléphone 412 × 892, densité 3,5 ; décision du 28/11/2026).
CMS.define('perf', () => {
  /** Budgets : durée maximale en ms ; « geste » : 95e centile de l'intervalle entre images (60 images/s, gigue de l'écran tolérée) */
  const BUDGET: Record<string, number> = {ouverture: 3000, reglage: 400, 'export-a4': 6000, 'export-10x15': 3000, geste: 20};
  const LABEL: Record<string, string> = {ouverture: 'Ouverture jusqu\'à l\'aperçu', reglage: 'Réglage visible', 'export-a4': 'Export A4',
    'export-10x15': 'Export 10 × 15', 'export-a3': 'Export A3', 'export-50x70': 'Export 50 × 70', geste: 'Geste sur la carte'};
  const log: PerfMeasure[] = [], pending = new Map<string, {t0: number, waitFor: string}>();
  let opened = false;
  const now = () => performance.now();
  /** Enregistre une mesure (ms) avec un détail facultatif */
  const add = (k: string, ms: number, info = ''): PerfMeasure => {
    const m: PerfMeasure = {k, ms: Math.round(ms), info, at: Date.now()};
    log.push(m); if (log.length > 200) log.shift();
    CMS.emit('perf:mesure', m);
    return m;
  };
  /** Durée depuis t0 (performance.now()) */
  const since = (k: string, t0: number, info?: string) => add(k, now() - t0, info);
  /** Première fois que l'aperçu est prêt : temps depuis le début du chargement de la page */
  const ready = (info?: string): PerfMeasure | null => { if (opened) return null; opened = true; return add('ouverture', now(), info); };
  /** Mesure en attente : start au déclenchement ; end(k, source) la clôt si source correspond (ou si aucune n'est attendue) */
  const start = (k: string, waitFor = ''): void => { const p = pending.get(k); if (p && now() - p.t0 < 10000) return; pending.set(k, {t0: now(), waitFor}); };
  const end = (k: string, source = ''): PerfMeasure | null => {
    const p = pending.get(k); if (!p) return null;
    if (now() - p.t0 >= 10000) { pending.delete(k); return null; }   // jamais abouti : abandonné
    if (p.waitFor && p.waitFor !== source) return null;
    pending.delete(k); return since(k, p.t0, source);
  };
  /** Images pendant un geste sur el (doigt ou souris enfoncé) : 95e centile de l'intervalle entre deux images */
  const watchFrames = (el: EventTarget): void => {
    let raf = 0, last = 0, gaps: number[] = [];
    const loop = (t: number) => { if (last) gaps.push(t - last); last = t; raf = requestAnimationFrame(loop); };
    const stop = () => {
      if (!raf) return; cancelAnimationFrame(raf); raf = 0; last = 0;
      if (gaps.length >= 10) { const s = gaps.sort((a, b) => a - b), p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
        add('geste', p95, `${Math.round(1000 / p95)} images/s, ${s.length} images`); }
      gaps = [];
    };
    el.addEventListener('pointerdown', () => { if (!raf) raf = requestAnimationFrame(loop); }, {capture: true, passive: true});
    addEventListener('pointerup', stop, {passive: true}); addEventListener('pointercancel', stop, {passive: true});
  };
  /** Dernière mesure de chaque type, dans l'ordre des budgets puis des autres */
  const latest = (): PerfMeasure[] => { const m = new Map<string, PerfMeasure>(); for (const x of log) m.set(x.k, x); return [...m.values()]; };
  const ok = (m: PerfMeasure): boolean => !(m.k in BUDGET) || m.ms <= BUDGET[m.k];
  return {BUDGET, LABEL, add, since, ready, start, end, watchFrames, latest, ok, get log() { return log.slice(); }};
});

/** Clés d'un objet, typées (Object.keys renvoie string[]) */
const keysOf=<T extends object>(o: T)=>Object.keys(o) as (keyof T)[];
// Fonctions internes exposées (window.__cms) seulement pour les tests et le débogage : adresse avec ?test,
// ou localStorage['cms3.debug']='1'. En usage normal, rien n'est exposé.
const TEST_HOOKS = /[?&]test(?:[=&]|$)/.test(location.search) || (()=>{ try{ return localStorage.getItem('cms3.debug')==='1'; }catch(e){ return false; } })();

export {keysOf, TEST_HOOKS};
