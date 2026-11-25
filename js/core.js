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
  const version = 'cms-2026-11-25b';
  /** Libellé lisible : « 24/11/2026 (h) » ; identifiant d'un autre format rendu tel quel */
  const label = v => { const m = /^cms-(\d{4})-(\d\d)-(\d\d)(.*)$/.exec(v || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` (${m[4]})` : '') : (v || 'inconnue'); };
  return { version, label };
});
