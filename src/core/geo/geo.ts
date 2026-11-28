/* City Map Studio — Projection de Mercator et géométrie des gabarits.
 * Module TypeScript (#103), importé par src/app/main.ts ; réuni en un seul script par le build (scripts/build.mjs). */
import {CANVAS_MAX_PX, EXPORT_MAX_DPI, FORMATS, REF_W} from '../../content/config.js';
import {st, ui} from '../doc/state.js';
/** État de l'affiche (src/core/doc/state.ts) */
/** Rectangle en pixels ; une carte peut avoir une forme (cercle, cœur, arche) */
export interface Rect { x: number; y: number; w: number; h: number; shape?: string | null; circle?: boolean; fade?: boolean }
export interface LatLon { lat: number; lon: number }
/** Vue de carte : centre et zoom de référence (cadre de REF_W px) */
export interface View { center: LatLon; zoom: number }
/** Zone du cartouche */
export interface TextArea { cx: number; maxW: number; y0: number; avail: number; mode: 'top' | 'bottom' | 'center'; x?: number; w?: number }
/** Géométrie d'un gabarit (voir geom) */
export interface Geom {
  m: number; U: number; land: boolean; lay: string;
  map: Rect; places: {rect: Rect, view: View & {marker: LatLon}, main?: boolean}[];
  illus?: Rect; mix?: string; textArea?: Rect; band?: {y: number, h: number};
  sky?: Rect; text?: TextArea; box?: Rect; rects?: Rect[]; title?: {y: number}; labels?: number[];
}
export interface ExportSpec { key: string; name: string; dpi: number; W: number; H: number; mm: [number, number] }

// Module CMS.geo : fonctions de projection, de format et de géométrie des gabarits (testées seules : tests/unit).
// Tout ce fichier lui est privé, sauf les fonctions reprises en fin de fichier.
const GEO = CMS.define('geo', () => {
// ---------- Mathématiques ----------
const D2R = Math.PI/180;
const merc = (lat: number): number => Math.log(Math.tan(Math.PI/4 + lat*D2R/2));
const imerc = (m: number): number => (2*Math.atan(Math.exp(m)) - Math.PI/2)/D2R;
const clamp = (v: number, a: number, b: number): number =>Math.max(a,Math.min(b,v));
const zoomFactor = (z: number): number => clamp(Math.pow(2,(z-14)*0.5),0.5,2);
function worldSize(rectW: number, z: number): number {return 512*Math.pow(2,z)*rectW/REF_W}
function project(lat: number, lon: number, rect: Rect, view: View): {x: number, y: number} {
  const S = worldSize(rect.w, view.zoom);
  return {x: rect.x + rect.w/2 + (lon-view.center.lon)/360*S,
          y: rect.y + rect.h/2 - (merc(lat)-merc(view.center.lat))*S/(2*Math.PI)};
}
function unproject(px: number, py: number, rect: Rect, view: View): LatLon {
  const S = worldSize(rect.w, view.zoom);
  const lon = view.center.lon + (px - rect.x - rect.w/2)/S*360;
  const m = merc(view.center.lat) - (py - rect.y - rect.h/2)*2*Math.PI/S;
  return {lat: imerc(m), lon};
}
function viewBounds(view: View, aspect: number, pad=0): {w: number, e: number, s: number, n: number} { // aspect = h/w du cadre
  const S = worldSize(REF_W, view.zoom), hw = REF_W/2*(1+pad), hh = REF_W*aspect/2*(1+pad);
  const m0 = merc(view.center.lat);
  return {w: view.center.lon - hw/S*360, e: view.center.lon + hw/S*360,
          s: imerc(m0 - hh*2*Math.PI/S), n: imerc(m0 + hh*2*Math.PI/S)};
}
function dms(v: number, pos: string, neg: string): string {
  const a=Math.abs(v); let d=Math.floor(a); const mf=(a-d)*60; let m=Math.floor(mf); let s=Math.round((mf-m)*600)/10;
  if(s>=60){s=0;m++} if(m>=60){m=0;d++}
  return `${d}° ${String(m).padStart(2,'0')}′ ${s.toFixed(1).padStart(4,'0')}″ ${v>=0?pos:neg}`;
}
/** Texte d'une ligne de l'affiche, ou '' si la ligne est masquée */
function textLine(k: string): string {
  if(k==='legend') return legendText();
  if((st.show as Record<string, boolean>)[k]===false || (ui as {textHide?: Set<string>}).textHide?.has(k)) return '';   // ui.textHide : bloc sorti du gabarit (mode Carte, #75)
  return k==='coords' ? coordText() : ((st.texts as Record<string, string>)[k]||'').trim();
}
/** Légende des lieux numérotés : « 1 Rencontre · 2 Mariage » */
function legendText(): string {
  const ex=st.markers2||[]; if(!st.numbered || !ex.length || st.mode==='illus') return '';   // Illustration : ni carte ni repères
  return [st.markerLabel,...ex.map((p: {label: string})=>p.label)].map((l: string, i: number)=>(l||'').trim()?`${i+1}  ${l.trim()}`:'').filter(Boolean).join('   ·   ');
}
function placeCoordText(mk: LatLon): string { return st.coordFormat==='dms' ? `${dms(mk.lat,'N','S')}, ${dms(mk.lon,'E','W')}` : `${mk.lat.toFixed(4)}, ${mk.lon.toFixed(4)}`; }
function coordText(): string {
  if(st.coordsManual.trim()) return st.coordsManual.trim();
  const {lat,lon}=st.marker;
  return st.coordFormat==='dms' ? `${dms(lat,'N','S')}, ${dms(lon,'E','W')}` : `${lat.toFixed(7)}, ${lon.toFixed(7)}`;
}

/** Export d'un format : dimensions (px) selon l'orientation, résolution (DPI), taille d'impression (mm).
 *  300 DPI si le canevas tient dans CANVAS_MAX_PX, sinon la plus haute résolution qui tient (multiple de 10). */
function exportSpec(s: {format: string, orient: string}=st): ExportSpec {
  const [key,name,a,b]=(FORMATS.find(f=>f[0]===s.format)||FORMATS[0]) as [string, string, number, number];
  const dpi=Math.min(EXPORT_MAX_DPI, Math.floor(Math.sqrt(CANVAS_MAX_PX/(a*b/645.16))/10)*10);
  const w=Math.round(a/25.4*dpi), h=Math.round(b/25.4*dpi);
  return s.orient==='landscape' ? {key,name,dpi,W:h,H:w,mm:[b,a]} : {key,name,dpi,W:w,H:h,mm:[a,b]};
}
/** Dimensions d'export (px) selon le format et l'orientation (A4 : 2480 × 3508) */
function posterDims(s: {format: string, orient: string}=st): {W: number, H: number} { const e=exportSpec(s); return {W:e.W,H:e.H}; }
function ratio(s: {format: string, orient: string}=st): number { const d=posterDims(s); return d.H/d.W; }

// ---------- Géométrie des gabarits ----------
/** Contour d'une forme de carte en coordonnées locales (0..w, 0..h), au format SVG (Path2D et clip-path CSS) */
const HEART_B=(()=>{ // bornes du cœur unitaire (mêmes courbes que le repère « Cœur »)
  const C=[[[0,-0.42],[-0.15,-0.85],[-1,-0.95],[-1,-0.3]],[[-1,-0.3],[-1,0.2],[-0.38,0.52],[0,0.9]]];
  let y0=1e9,y1=-1e9; for(const [a,b,c,d] of C) for(let t=0;t<=1;t+=0.01){ const u=1-t, y=u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]; y0=Math.min(y0,y); y1=Math.max(y1,y); }
  return {y0,y1}; })();
function shapeD(shape: string | undefined, w: number, h: number): string {
  const f=(n: number)=>Math.round(n*100)/100;
  if(shape==='heart'){ const X=(x: number)=>f((x+1)/2*w), Y=(y: number)=>f((y-HEART_B.y0)/(HEART_B.y1-HEART_B.y0)*h);
    return `M${X(0)},${Y(-0.42)} C${X(-0.15)},${Y(-0.85)} ${X(-1)},${Y(-0.95)} ${X(-1)},${Y(-0.3)} C${X(-1)},${Y(0.2)} ${X(-0.38)},${Y(0.52)} ${X(0)},${Y(0.9)} C${X(0.38)},${Y(0.52)} ${X(1)},${Y(0.2)} ${X(1)},${Y(-0.3)} C${X(1)},${Y(-0.95)} ${X(0.15)},${Y(-0.85)} ${X(0)},${Y(-0.42)} Z`; }
  if(shape==='arch'){ const R=w/2; return `M0,${f(h)} L0,${f(R)} A${f(R)},${f(R)} 0 0 1 ${f(w)},${f(R)} L${f(w)},${f(h)} Z`; }
  if(shape==='circle'){ const R=w/2; return `M0,${f(R)} A${f(R)},${f(R)} 0 1 1 ${f(w)},${f(R)} A${f(R)},${f(R)} 0 1 1 0,${f(R)} Z`; }
  return `M0,0 H${f(w)} V${f(h)} H0 Z`;
}
function shapePath(ctx: CanvasRenderingContext2D, r: Rect): Path2D | null {
  if(r.shape==='circle'){ ctx.beginPath(); ctx.arc(r.x+r.w/2, r.y+r.h/2, r.w/2, 0, Math.PI*2); return null; }
  if(r.shape){ const p=new Path2D(); p.addPath(new Path2D(shapeD(r.shape,r.w,r.h)),new DOMMatrix().translate(r.x,r.y)); return p; }
  ctx.beginPath(); ctx.rect(r.x,r.y,r.w,r.h); return null;
}
function clipMap(ctx: CanvasRenderingContext2D, r: Rect): void { const p=shapePath(ctx,r); p ? ctx.clip(p) : ctx.clip(); }
function strokeShape(ctx: CanvasRenderingContext2D, r: Rect, o: number): void { const e={...r,x:r.x-o,y:r.y-o,w:r.w+2*o,h:r.h+2*o}; const p=shapePath(ctx,e); p ? ctx.stroke(p) : ctx.stroke(); }

return {D2R, merc, imerc, clamp, zoomFactor, worldSize, project, unproject, viewBounds, dms, textLine, placeCoordText, coordText, exportSpec, posterDims, ratio, shapeD, clipMap, strokeShape};
});
const {D2R, merc, imerc, clamp, zoomFactor, worldSize, project, unproject, viewBounds, dms, textLine, placeCoordText, coordText, exportSpec, posterDims, ratio, shapeD, clipMap, strokeShape} = GEO;
/** Rayon du halo et du quartier en relief, en px pour un cadre de largeur w */
const focusRadius=(w: number)=>(st.focusR??30)/100*w;

export {clamp, clipMap, coordText, D2R, dms, exportSpec, focusRadius, imerc, merc, placeCoordText, posterDims, project, ratio, shapeD, strokeShape, textLine, unproject, viewBounds, worldSize, zoomFactor};