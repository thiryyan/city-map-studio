/* City Map Studio — Scène de rendu (#119) : ce que le rendu et la géométrie lisent, et rien d'autre.
 * Le noyau de rendu (src/render) n'importe que core et content : il ne lit ni l'état de l'application, ni le DOM. Il reçoit
 * le document de l'affiche (st) et les réglages d'un rendu (ui : aperçu réduit, relevé d'emprise des textes, style des textes)
 * par ce module. Sur la page principale, ils suivent l'état vivant (useLive) ; dans un Worker, chaque rendu les reçoit avec
 * sa scène (withScene), sans état global partagé avec la page. */
import type {PosterState} from '../content/config.js';

/** Réglages d'un rendu : vignette, relevé d'emprise (zone de sécurité), style des textes du mode Carte */
export type RenderUi = Record<string, any>;

/** Document de l'affiche et réglages du rendu en cours (liaisons vivantes : les modules les lisent à chaque appel) */
export let st: PosterState = undefined as unknown as PosterState;
export let ui: RenderUi = {};

/** Page principale : le rendu suit l'état vivant de l'application (même objet, modifié en place) */
export function useLive(doc: PosterState, appUi: RenderUi){ st = doc; ui = appUi; }

/** Scène d'un rendu : le document, les réglages et les ressources du rendu (images, données du ciel) */
export type Scene = {doc: PosterState; ui: RenderUi};

/** Rend avec la scène donnée le temps de `fn` (synchrone) ; la liaison précédente est rétablie ensuite */
export function withScene<T>(scene: Scene, fn: () => T): T {
  const [d, u] = [st, ui];
  st = scene.doc; ui = scene.ui;
  try{ return fn(); } finally{ st = d; ui = u; }
}
