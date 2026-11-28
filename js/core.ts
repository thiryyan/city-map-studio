/* City Map Studio — Socle : espace de noms CMS et bus d'événements. Chargé en premier.
 * Module TypeScript (#103), importé par js/main.ts ; réuni en un seul script par le build (scripts/build.mjs, esbuild).
 * Types de l'espace de noms CMS : js/types.d.ts.
 *
 * Chaque fichier de js/ est un module ES : il importe ce qu'il utilise des fichiers chargés avant lui, et lit dans le
 * registre late (fin de ce fichier) ce qu'il appelle des fichiers chargés après lui. CMS.define('nom', …) range des
 * fonctions sous CMS.nom (testées seules : tests/unit) ; les modules se parlent aussi par événements :
 * CMS.on('state:saved', …), CMS.emit('state:saved'). Garde-fous : tests/globals.py (ESLint, plafond du registre late).
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
// même sans service worker (file://, première visite, hors ligne, tests). Format : cms-AAAA-MM-JJ-<empreinte>.
CMS.define('build', () => {
  const version: string = 'cms-dev';   // remplacée au build (scripts/build.mjs), comme VERSION de sw.js
  /** Libellé lisible : « 24/11/2026 (h) », « 28/11/2026 (3522713) » pour une version construite ; autre format rendu tel quel */
  const label = (v?: string): string => { const m = /^cms-(\d{4})-(\d\d)-(\d\d)-?(.*)$/.exec(v || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` (${m[4]})` : '') : (v || 'inconnue'); };
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

// ---------- Références vers l'avant (modules ES, #102) ----------
// Un fichier qui appelle une fonction d'un fichier chargé APRÈS lui ne l'importe pas (l'import créerait un cycle et
// changerait l'ordre d'exécution des modules) : il la lit dans ce registre, rempli par le fichier qui la définit.
// Chaque entrée est une dépendance « à l'envers » entre couches, à faire disparaître (événements, injection).
// Registre volontairement non typé : chaque entrée est une dette à résorber, pas une interface à figer.
const late: Record<string, any> = Object.create(null);
/** Clés d'un objet, typées (Object.keys renvoie string[]) */
const keysOf=<T extends object>(o: T)=>Object.keys(o) as (keyof T)[];
export {keysOf, late};
