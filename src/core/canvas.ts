/* City Map Studio — Surfaces de dessin du rendu (#119) : canevas de la page, ou OffscreenCanvas dans un Worker (aucun DOM requis). */

/** Canevas de dessin : élément de la page, ou OffscreenCanvas (Worker) */
export type Surface = HTMLCanvasElement | OffscreenCanvas;
/** Contexte 2D d'une surface */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Crée une surface de w × h px : un canevas dans la page, un OffscreenCanvas là où il n'y a pas de document (Worker) */
export function createCanvas(w: number, h: number): Surface {
  if(typeof document !== 'undefined'){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
  return new OffscreenCanvas(w, h);
}
/** Contexte 2D d'une surface créée par createCanvas */
export function context2d(c: Surface): Ctx2D { return c.getContext('2d') as Ctx2D; }

/** Polices du document (page) ou du Worker ; null sans l'API */
export const fontFaces: FontFaceSet | null = (globalThis as {document?: Document}).document?.fonts ?? (globalThis as {fonts?: FontFaceSet}).fonts ?? null;
