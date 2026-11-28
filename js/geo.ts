/* City Map Studio — Projection de Mercator et géométrie des gabarits.
 * Module TypeScript (#103), importé par js/main.ts ; réuni en un seul script par le build (scripts/build.mjs). */
import {late} from './core.js';
import {type PosterState, CANVAS_MAX_PX, EXPORT_MAX_DPI, FORMATS, REF_W} from './config.js';
import {st, ui} from './state.js';
/** État de l'affiche (js/state.ts) */
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
// U : unité de mise en page = petit côté de l'affiche (2480 px à l'export A4, en portrait comme en paysage).
// Renvoie : map (cadre de la carte interactive), places (une ou deux vues : {rect, view}), sky (disque du ciel),
// text (zone du cartouche : cx, maxW, y0, avail, mode 'top' | 'bottom' | 'center').
function geom(s: PosterState, W: number, H: number): Geom {
  const U=Math.min(W,H), m=U*s.margin/100, land=W>H, lay=s.layout;
  const below=(r: Rect, gap: number): TextArea=>{ const y0=r.y+r.h+gap*U; return {cx:W/2,maxW:W-2*m-0.04*U,y0,avail:H-y0-0.6*m-0.01*U,mode:'top'}; };
  const g={m,U,land,lay} as Geom;
  // Mode Illustration : pas de carte (cadre vide, aucune vue) ; l'image couvre l'affiche (CMS.illus.draw)
  if(s.mode==='illus'){ g.illus={x:0,y:0,w:W,h:H}; g.map={x:0,y:0,w:0,h:0}; g.places=[]; return g; }
  // Carte + illustration : médaillon (illustration pleine page, carte dans une forme) ou vignette (carte encadrée, illustration en arche)
  if(s.mode==='mix'){
    const M=s.mix||{}; g.mix=CMS.illusConf.COMPOS.includes(M.compo) ? M.compo : 'med';
    const gap=0.012*U;   // filet couleur papier entre illustration et carte
    if(g.mix==='med'){
      const d=(land?H:W)*0.45, sh=M.shape||'circle', h=sh==='heart' ? d*0.92 : sh==='arch' ? d*1.2 : d;
      const y=M.pos==='haut' ? H*0.24 : M.pos==='centre' ? (H-h)/2 : H-h-H*0.12;
      g.illus={x:0,y:0,w:W,h:H}; g.map={x:(W-d)/2,y,w:d,h,shape:sh};
    } else if(g.mix==='hb'){   // illustration en haut (moitié ou deux tiers), carte en bas
      const f=M.split==='two' ? 2/3 : 0.5; g.illus={x:0,y:0,w:W,h:H*f}; g.map={x:0,y:H*f+gap,w:W,h:H-H*f-gap};
    } else if(g.mix==='cote'){   // côte à côte (affiche en paysage) : illustration à gauche, carte à droite
      const w=(W-gap)/2; g.illus={x:0,y:0,w,h:H}; g.map={x:w+gap,y:0,w,h:H};
    } else if(g.mix==='fondu'){   // la carte émerge du bas de l'illustration (dégradé)
      g.illus={x:0,y:0,w:W,h:H}; g.map={x:0,y:H*0.58,w:W,h:H*0.42,fade:true};
    } else {
      const band=0.24*U; g.map={x:m,y:m,w:W-2*m,h:H-2*m-band};
      let w=(land?0.22:0.3)*W; const pad=0.035*U; w=Math.min(w,(g.map.h-2*pad)/1.34);
      g.illus={x:W-m-pad-w,y:m+pad,w,h:w*1.34,shape:'arch'}; g.band={y:g.map.y+g.map.h,h:H-m-(g.map.y+g.map.h)};
    }
    // zone des textes : l'illustration (le haut de l'affiche pour le fondu) ; la vignette a sa bande
    g.textArea=g.mix==='fondu' ? {x:0,y:0,w:W,h:H*0.58} : g.illus;
    g.places=[{rect:g.map,view:s,main:true}]; g.map.circle=g.map.shape==='circle';
    return g;
  }
  if(!land){
    switch(lay){
      case 'classic': g.map={x:m,y:m,w:W-2*m,h:H-2*m-0.36*U}; g.text=below(g.map,0.014); break;
      case 'fade': g.map={x:0,y:0,w:W,h:H*0.80}; g.text={cx:W/2,maxW:W-2*m-0.04*U,y0:H-m-0.345*U,avail:0.56*U,mode:'bottom'}; break;
      case 'medallion': { const d=W-2*m-0.12*U; g.map={x:(W-d)/2,y:m+0.075*U,w:d,h:d,shape:'circle'}; g.text=below(g.map,0.02); break; }
      case 'heart': { const d=W-2*m-0.10*U; g.map={x:(W-d)/2,y:m+0.05*U,w:d,h:d*0.92,shape:'heart'}; g.text=below(g.map,0.025); break; }
      case 'arch': g.map={x:m+0.03*U,y:m+0.02*U,w:W-2*m-0.06*U,h:H-2*m-0.40*U,shape:'arch'}; g.text=below(g.map,0.02); break;
      case 'travel': g.map={x:0,y:0,w:W,h:H-0.42*U}; g.box={x:m,y:g.map.h,w:W-2*m,h:H-g.map.h-m}; break;
      case 'polaroid': { const p=Math.max(m,0.07*U); g.map={x:p,y:p,w:W-2*p,h:W-2*p}; g.text=below(g.map,0.02); break; }
      case 'sky': { const d=0.62*U; g.sky={x:(W-d)/2,y:m+0.04*U,w:d,h:d,shape:'circle'};
        g.map={x:m,y:g.sky.y+d+0.045*U,w:W-2*m,h:0.20*U}; g.text=below(g.map,0.01); break; }
      case 'typo': g.map={x:m,y:m,w:W-2*m,h:H-2*m-0.30*U}; g.text=below(g.map,0.012); break;
      case 'diptych': { const hM=(H-2*m-0.10*U-0.15*U-0.20*U)/2;
        const a={x:m,y:m+0.10*U,w:W-2*m,h:hM}, b={x:m,y:a.y+hM+0.075*U,w:W-2*m,h:hM};
        g.rects=[a,b]; g.title={y:m+0.07*U}; g.labels=[a.y+hM+0.045*U,b.y+hM+0.045*U]; g.text=below(b,0.07); break; }
      default: g.map={x:m,y:m+0.104*U,w:W-2*m,h:H-2*m-0.214*U};
    }
  } else {
    // Paysage : la carte (ou le ciel) à gauche, le texte en colonne à droite, centré verticalement
    const col=(x: number): TextArea & {x: number, w: number}=>{ const cx0=x+0.05*U, cw=W-m-cx0; return {cx:cx0+cw/2,maxW:cw,y0:m,avail:H-2*m,mode:'center',x:cx0,w:cw}; };
    switch(lay){
      case 'fade': g.map={x:0,y:0,w:W*0.64,h:H}; break;
      case 'travel': g.map={x:0,y:0,w:W*0.6,h:H}; break;
      case 'medallion': case 'heart': { const d=H-2*m-0.06*U; g.map={x:m+0.03*U,y:(H-d*(lay==='heart'?0.92:1))/2,w:d,h:d*(lay==='heart'?0.92:1),shape:lay==='heart'?'heart':'circle'}; break; }
      case 'arch': g.map={x:m,y:m,w:W*0.6-m,h:H-2*m,shape:'arch'}; break;
      case 'polaroid': { const p=Math.max(m,0.07*U), d=H-2*p; g.map={x:p,y:p,w:d,h:d}; break; }
      case 'sky': { const d=H-2*m; g.sky={x:m,y:m,w:d,h:d,shape:'circle'}; const t=col(g.sky.x+d);
        g.map={x:t.x,y:m,w:t.w,h:0.40*U}; g.text={...t,y0:g.map.y+g.map.h+0.01*U,avail:H-m-(g.map.y+g.map.h+0.01*U),mode:'top'}; break; }
      case 'typo': g.map={x:m,y:m,w:W-2*m,h:H-2*m-0.30*U}; g.text=below(g.map,0.012); break;
      case 'diptych': { const gap=0.05*U, w=(W-2*m-gap)/2, h=H-2*m-0.10*U-0.22*U;
        const a={x:m,y:m+0.10*U,w,h}, b={x:m+w+gap,y:a.y,w,h};
        g.rects=[a,b]; g.title={y:m+0.07*U}; g.labels=[a.y+h+0.045*U,a.y+h+0.045*U];
        g.text={cx:W/2,maxW:W-2*m,y0:a.y+h+0.07*U,avail:H-m-(a.y+h+0.07*U),mode:'top'}; break; }
      default: g.map={x:m,y:m,w:W*0.6-m,h:H-2*m};
    }
    if(!g.text && !g.box && lay!=='diptych'){ const t=col(g.map.x+g.map.w); if(lay==='travel'){ g.box={x:t.x,y:m,w:t.w,h:H-2*m}; } else g.text=t; }
  }
  // Dédicace sur deux lignes : la carte cède la hauteur de la deuxième ligne quand le texte est sous la carte et que
  // la place n'y est pas déjà (Souvenir : pied ; Cadre, Arche, Lettres : cartouche). Ailleurs, le cartouche a la marge nécessaire.
  if(lay==='souvenir' && !land){ const ex=late.souvenirFoot(W,U,m).extra*U; g.map.h-=ex; }
  else if(!land && g.text && ['classic','arch','typo'].includes(lay)){ const ex=late.cartDed(late.CART_ROWS,g.text.maxW/U).extra*U; g.map.h-=ex; g.text.y0-=ex; g.text.avail+=ex; }
  if(g.rects){ g.map=g.rects[s.active||0]; g.places=[{rect:g.rects[s.active||0],view:s,main:true},{rect:g.rects[1-(s.active||0)],view:s.place2||s}]; }
  else g.places=[{rect:g.map,view:s,main:true}];
  g.map.circle=g.map.shape==='circle';
  return g;
}
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

return {D2R, merc, imerc, clamp, zoomFactor, worldSize, project, unproject, viewBounds, dms, textLine, placeCoordText, coordText, exportSpec, posterDims, ratio, geom, shapeD, clipMap, strokeShape};
});
const {D2R, merc, imerc, clamp, zoomFactor, worldSize, project, unproject, viewBounds, dms, textLine, placeCoordText, coordText, exportSpec, posterDims, ratio, geom, shapeD, clipMap, strokeShape} = GEO;

export {D2R, clamp, clipMap, coordText, dms, exportSpec, geom, imerc, merc, placeCoordText, posterDims, project, ratio, shapeD, strokeShape, textLine, unproject, viewBounds, worldSize, zoomFactor};
