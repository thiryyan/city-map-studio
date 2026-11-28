/* City Map Studio — Magasin de l'état de l'affiche (#118) : seul point d'écriture.
 * L'état (st, src/core/doc/state.ts) se lit partout, mais ne s'écrit que par update() : la recette reçoit l'état et le
 * modifie ; sa valeur est rendue, ce qui permet d'écrire update(d => (d.zoom = z)) au milieu d'une expression.
 * Chaque écriture incrémente `revision` (signal @preact/signals-core), sur lequel l'historique et, à l'Horizon 2,
 * l'interface en Preact s'appuient. Garde-fou : tests/layers.py refuse toute écriture directe de st hors de core/doc/. */
import {signal} from '@preact/signals-core';
import type {PosterState} from '../../content/config.js';
import {st, ui, writeState} from './state.js';

/** Nombre d'écritures depuis le démarrage (signal : un effet qui le lit est relancé à chaque écriture) */
const revision = signal(0);
/** Modifie l'état ; renvoie la valeur de la recette */
function update<R>(recipe: (d: PosterState) => R): R {
  const r = writeState(() => recipe(st));
  revision.value++;
  return r;
}
/** Copie indépendante de l'état (données JSON : identique à structuredClone, et compatible avec la garde du mode test) */
const snapshotDoc = (): PosterState => JSON.parse(JSON.stringify(st));
/** Remplace tout l'état (même objet : les références à st restent valables) ; `extra` l'emporte sur `next` */
function replaceState(next: PosterState, extra?: Partial<PosterState>){
  update(d => { for(const k of Object.keys(d)) delete (d as Record<string, unknown>)[k]; Object.assign(d, next, extra || {}); });
}

/** Rendu avec un état modifié le temps de `fn` (vignettes) : aucune révision, état rétabli à l'identique ensuite.
 *  `fn` doit être synchrone. */
function withState<T>(patch: Record<string, unknown>, fn: () => T): T {
  const S = st as Record<string, unknown>, saved: Record<string, unknown> = {};
  writeState(() => { for(const k in patch){ saved[k] = S[k]; S[k] = patch[k]; } });
  ui.thumb = true;
  try{ const r = fn(); if(r && typeof (r as {then?: unknown}).then === 'function') throw new Error('withState : fonction asynchrone interdite'); return r; }
  finally{ writeState(() => Object.assign(S, saved)); ui.thumb = false; }
}

export {replaceState, revision, snapshotDoc, update, withState};
