/* City Map Studio — Socle : espace de noms CMS et bus d'événements. Chargé en premier.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://).
 *
 * Les scripts classiques partagent une seule portée globale. Pour la réduire, un fichier déclare ses fonctions dans
 * un module : CMS.define('nom', () => ({…})) ; seules ses fonctions publiques sont reprises en tête de portée
 * (const {a, b} = CMS.nom), le reste lui reste privé. Les modules se parlent par des événements plutôt que par
 * des tests de présence (typeof f === 'function') : CMS.on('state:saved', …), CMS.emit('state:saved').
 * Le nombre de déclarations globales est surveillé par tests/globals.py (plafond : tests/globals.max).
 */
'use strict';
(function (g) {
  const CMS = g.CMS = g.CMS || {};
  const bus = new EventTarget();
  /** Abonnement à un événement ; renvoie la fonction de désabonnement */
  CMS.on = (type, fn) => { const h = e => fn(e.detail); bus.addEventListener(type, h); return () => bus.removeEventListener(type, h); };
  /** Émission synchrone ; une erreur d'un abonné est signalée sans interrompre les autres */
  CMS.emit = (type, detail) => { bus.dispatchEvent(new CustomEvent(type, { detail })); };
  /** Définit le module CMS[name] une seule fois (objet figé) */
  CMS.define = (name, factory) => {
    if (Object.prototype.hasOwnProperty.call(CMS, name)) throw new Error(`CMS.${name} déjà défini`);
    const mod = Object.freeze(factory(CMS));
    Object.defineProperty(CMS, name, { value: mod, enumerable: true, writable: false, configurable: false });
    return mod;
  };
})(globalThis);
// ---------- Version de l'application ----------
// Identique à VERSION de sw.js (vérifié par tests/swversion.py et tests/pwa.py) : la page connaît sa version même
// sans service worker (file://, première visite, hors ligne, tests). Format : cms-AAAA-MM-JJ suivi d'une lettre.
CMS.define('build', () => {
  const version = 'cms-dev';   // remplacée au build (scripts/build.mjs), comme VERSION de sw.js
  /** Libellé lisible : « 24/11/2026 (h) », « 28/11/2026 (3522713) » pour une version construite ; autre format rendu tel quel */
  const label = v => { const m = /^cms-(\d{4})-(\d\d)-(\d\d)-?(.*)$/.exec(v || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` (${m[4]})` : '') : (v || 'inconnue'); };
  return { version, label };
});
// ---------- Mesures de performance (#97, lot 3 : #101) ----------
// Temps relevés sur l'appareil, gardés en mémoire seulement (rien n'est enregistré ni envoyé) et affichés dans
// Lieu › Avancé › « Mesures de performance ». Budgets fixés le 27/11/2026 ; un seul appareil de référence
// (téléphone 412 × 892, densité 3,5 ; décision du 28/11/2026).
CMS.define('perf', () => {
  /** Budgets : durée maximale en ms ; « geste » : 95e centile de l'intervalle entre images (60 images/s, gigue de l'écran tolérée) */
  const BUDGET = {ouverture: 3000, reglage: 200, 'export-a4': 6000, 'export-10x15': 3000, geste: 20};
  const LABEL = {ouverture: 'Ouverture jusqu\'à l\'aperçu', reglage: 'Réglage visible', 'export-a4': 'Export A4',
    'export-10x15': 'Export 10 × 15', 'export-a3': 'Export A3', 'export-50x70': 'Export 50 × 70', geste: 'Geste sur la carte'};
  const log = [], pending = new Map();
  let opened = false;
  const now = () => performance.now();
  /** Enregistre une mesure (ms) avec un détail facultatif */
  const add = (k, ms, info = '') => {
    const m = {k, ms: Math.round(ms), info, at: Date.now()};
    log.push(m); if (log.length > 200) log.shift();
    CMS.emit('perf:mesure', m);
    return m;
  };
  /** Durée depuis t0 (performance.now()) */
  const since = (k, t0, info) => add(k, now() - t0, info);
  /** Première fois que l'aperçu est prêt : temps depuis le début du chargement de la page */
  const ready = info => { if (opened) return null; opened = true; return add('ouverture', now(), info); };
  /** Mesure en attente : start au déclenchement ; end(k, source) la clôt si source correspond (ou si aucune n'est attendue) */
  const start = (k, waitFor = '') => { const p = pending.get(k); if (p && now() - p.t0 < 10000) return; pending.set(k, {t0: now(), waitFor}); };
  const end = (k, source = '') => {
    const p = pending.get(k); if (!p) return null;
    if (now() - p.t0 >= 10000) { pending.delete(k); return null; }   // jamais abouti : abandonné
    if (p.waitFor && p.waitFor !== source) return null;
    pending.delete(k); return since(k, p.t0, source);
  };
  /** Images pendant un geste sur el (doigt ou souris enfoncé) : 95e centile de l'intervalle entre deux images */
  const watchFrames = el => {
    let raf = 0, last = 0, gaps = [];
    const loop = t => { if (last) gaps.push(t - last); last = t; raf = requestAnimationFrame(loop); };
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
  const latest = () => { const m = new Map(); for (const x of log) m.set(x.k, x); return [...m.values()]; };
  const ok = m => !(m.k in BUDGET) || m.ms <= BUDGET[m.k];
  return {BUDGET, LABEL, add, since, ready, start, end, watchFrames, latest, ok, get log() { return log.slice(); }};
});
