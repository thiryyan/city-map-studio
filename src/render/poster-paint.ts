/* City Map Studio — Rendu de l'affiche : peinture (dorure) et couleurs (extrait de render/poster.ts, #119). */
import {shade, tint} from '../core/color.js';
import {Ctx} from './poster-types.js';
// ---------- Couleurs dérivées ----------
// ---------- Dorure ----------
// Textes, filets et repères en dégradé métallique tiré de leur propre couleur (or, argent, cuivre…) :
// bandes de reflets en diagonale, calculées sur toute l'affiche (même rendu à l'aperçu et à l'export).
export let foilCtx: {W: number; H: number; cache: Map<string, CanvasGradient>} | null=null;
export function foilGradient(ctx: Ctx, hex: string, x0: number, y0: number, x1: number, y1: number, bands: number){
  const g=ctx.createLinearGradient(x0,y0,x1,y1), lo=shade(hex,0.45), hi=tint(hex,0.62), seq=[lo,hex,hi,hex];
  const n=bands*4; for(let i=0;i<=n;i++) g.addColorStop(i/n,seq[i%4]);
  return g;
}
/** Peinture d'un élément d'encre : la couleur, ou son dégradé doré pendant un rendu avec dorure */
export function paint(color: string){
  if(!foilCtx || typeof color!=='string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  let g=foilCtx.cache.get(color);
  if(!g){ const {W,H}=foilCtx; g=foilGradient(document.createElement('canvas').getContext('2d')!,color,0,0,W*0.7,H,6); foilCtx.cache.set(color,g); }
  return g;
}
export function hexA(hex: string){const n=parseInt(hex.slice(1),16);const r=n>>16&255,g=n>>8&255,b=n&255;return (a: number)=>`rgba(${r},${g},${b},${a})`}
/** Dorure : dégradés propres à un rendu (modules ES : réaffectation depuis poster.ts) */
export const setFoilCtx = (v: typeof foilCtx) => { foilCtx = v; };
