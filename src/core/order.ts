/* City Map Studio — Ordre des lignes de texte (Textes, Plus de réglages), fonctions pures (extrait de core/doc/state.ts, #119).
 * st.lineOrder : null (ordre du gabarit) ou permutation de LINE_KEYS. Appliqué au cartouche des gabarits centrés et, dans
 * chaque bloc, aux mises en page des modes illustrés (titre et sous-titre ; dédicace, noms, date · coordonnées). */
import type {PosterState} from '../content/config.js';

export const LINE_KEYS=['title','subtitle','coords','dedication','names','date'];
/** Ordre valide (permutation complète de LINE_KEYS) ou null */
export const normLineOrder=(v: unknown): string[] | null=>Array.isArray(v) && v.length===LINE_KEYS.length && LINE_KEYS.every(k=>v.includes(k)) ? [...v] : null;
/** Clés triées selon l'ordre choisi (tri stable ; une clé hors de LINE_KEYS, comme la légende, reste en fin) ; sans ordre : inchangées */
export function sortLines(keys: string[], s: PosterState): string[] {
  const O=s.lineOrder; if(!O) return keys;
  const r=(k: string)=>{ const i=O.indexOf(k); return i<0 ? 99 : i; };
  return keys.map((k,i)=>[k,i] as [string, number]).sort((a,b)=>r(a[0])-r(b[0]) || a[1]-b[1]).map(x=>x[0]);
}
/** Ordre affiché : celui choisi, sinon celui du gabarit (Polaroid : dédicace en tête ; modes illustrés : titre, puis bloc du bas) */
export function currentOrder(s: PosterState): string[] {
  if(s.lineOrder) return [...s.lineOrder];
  if(s.mode==='map' && s.layout==='polaroid') return ['dedication','names','title','date','coords','subtitle'];
  if(s.mode!=='map') return ['title','subtitle','dedication','names','date','coords'];
  return [...LINE_KEYS];
}
