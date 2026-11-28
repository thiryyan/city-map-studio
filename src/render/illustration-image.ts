/* City Map Studio — Rendu de l'image importée : cadrage, retouches point par point, grain, remplaçant (extrait de features/illustration.ts, #119). */
import {FORMATS, type PosterState} from '../content/config.js';
import {clipMap, posterDims, type Rect} from '../core/geo/geo.js';
import {geom} from './layout.js';
import {st} from '../core/scene.js';
import {hexA} from './poster-paint.js';
import {Ctx, IMG, Illus, MAX_PX, canvasOf, refOf} from '../core/illustration-state.js';
import {IS} from '../core/illustration-state.js';

/** Résolution d'impression de l'image pour chaque format (ppp), selon le cadrage ; agrandissement ×2 : lissage crédité de 45 %.
 *  Seuils (bonne, juste) : 200 / 140 ppp ; 300 / 200 pour le 10 × 15 cm, petite photo regardée de près. */
export const SEUILS: Record<string, number[]>={'10x15':[300,200]};
/** Part de l'affiche occupée par l'illustration (1 × 1, sauf la vignette du mode Carte + illustration) */
export function region(s: PosterState){
  if(s.mode!=='mix' || s.mix.compo==='med' || s.mix.compo==='fondu') return {fw:1,fh:1};
  const d=posterDims(s), g=geom(s,d.W,d.H); return {fw:g.illus!.w/d.W, fh:g.illus!.h/d.H};
}
export function quality(s: PosterState, iw: number, ih: number){
  const I=s.illus, land=s.orient==='landscape', R=region(s);
  return FORMATS.map(([key,name,a,b])=>{
    const Win=(land?b:a)/25.4*R.fw, Hin=(land?a:b)/25.4*R.fh;
    const base=I.fit==='contain' ? Math.max(iw/Win,ih/Hin) : Math.min(iw/Win,ih/Hin);
    const dpi=Math.round(base/(I.zoom/100)), eff=I.upscale ? dpi*1.45 : dpi;
    const [ok,mid]=SEUILS[key]||[200,140];
    return {key, name, dpi, grade: eff>=ok ? 'ok' : eff>=mid ? 'mid' : 'bad'};
  });
}
/** Part de l'image hors de l'affiche (cadrage « Remplir ») ou des bandes laissées vides (« Image entière »), en % */
export function cropPct(s: PosterState, iw: number, ih: number){
  const d=posterDims(s), R=region(s), a=iw/ih, b=d.W*R.fw/(d.H*R.fh);
  return Math.round((1-Math.min(a,b)/Math.max(a,b))*100);
}
/** Rectangle de l'image dans une affiche W × H : remplir ou contenir, puis zoom et décalage (fractions de l'affiche) */
export function placement(W: number, H: number, iw: number, ih: number, I: Illus){
  const s0=I.fit==='contain' ? Math.min(W/iw,H/ih) : Math.max(W/iw,H/ih), s=s0*I.zoom/100, w=iw*s, h=ih*s;
  return {x:(W-w)/2+I.ox*W, y:(H-h)/2+I.oy*H, w, h};
}
/** Retouches point par point (identiques quelle que soit la résolution : aperçu et export concordent).
 *  Luminosité, contraste, saturation ; filtre vintage (sépia, contraste) ; aplats (6 niveaux par couche). */
export function adjust(I: Illus){
  const v=I.vintage;
  return {b:1+I.bright/100, c:1+I.contrast/100+(v==='strong'?0.06:0), s:1+I.satur/100-(v==='strong'?0.15:0),
    sep:v==='light'?0.18:v==='strong'?0.42:0, flat:!!I.flat};
}
export type Adj = ReturnType<typeof adjust>;
export const neutral=(a: Adj)=>a.b===1 && a.c===1 && a.s===1 && !a.sep && !a.flat;
export function processPixels(d: Uint8ClampedArray, a: Adj){
  const lut=new Uint8ClampedArray(256);
  for(let i=0;i<256;i++) lut[i]=(i*a.b-128)*a.c+128;
  const q=(v: number)=>Math.round(Math.min(255,Math.max(0,v))/51)*51;
  for(let i=0;i<d.length;i+=4){
    let r=lut[d[i]], g=lut[d[i+1]], b=lut[d[i+2]];
    if(a.s!==1){ const L=0.2126*r+0.7152*g+0.0722*b; r=L+(r-L)*a.s; g=L+(g-L)*a.s; b=L+(b-L)*a.s; }
    if(a.sep){ const sr=0.393*r+0.769*g+0.189*b, sg=0.349*r+0.686*g+0.168*b, sb=0.272*r+0.534*g+0.131*b;
      r+=(sr-r)*a.sep; g+=(sg-g)*a.sep; b+=(sb-b)*a.sep; }
    if(a.flat){ r=q(r); g=q(g); b=q(b); }
    d[i]=r; d[i+1]=g; d[i+2]=b;   // Uint8ClampedArray : bornage et arrondi automatiques
  }
  return d;
}
 // found : pistes trouvées dans la carte (proposées, non retenues)
export const cache: {key: string; canvas: HTMLCanvasElement | null}={key:'', canvas:null};
/** Réduction de qualité : par moitiés successives (plus net qu'un seul passage) */
export function resample(src: HTMLCanvasElement, w: number, h: number){
  let cur=src, cw=src.width, ch=src.height;
  while(cw/2>w*1.05 && ch/2>h*1.05){ const n=canvasOf(cw/2,ch/2), x=n.getContext('2d')!; x.imageSmoothingQuality='high'; x.drawImage(cur,0,0,n.width,n.height); cur=n; cw=n.width; ch=n.height; }
  const out=canvasOf(w,h), o=out.getContext('2d')!; o.imageSmoothingQuality='high'; o.drawImage(cur,0,0,out.width,out.height); return out;
}
/** Agrandissement ×2 lissé, suivi d'un léger renforcement des contours (aucun détail inventé) ; borné par la mémoire */
export function upscale2(src: HTMLCanvasElement){
  const f=Math.min(2, Math.sqrt(MAX_PX/(src.width*src.height)));
  if(f<=1.05) return src;
  const out=canvasOf(src.width*f,src.height*f), x=out.getContext('2d')!; x.imageSmoothingQuality='high'; x.drawImage(src,0,0,out.width,out.height);
  const id=x.getImageData(0,0,out.width,out.height), d=id.data, w=out.width, h=out.height, o=new Uint8ClampedArray(d);
  const k=0.35;   // renforcement doux : p + k·(p − moyenne des 4 voisins)
  for(let y=1;y<h-1;y++) for(let xx=1;xx<w-1;xx++){ const i=(y*w+xx)*4;
    for(let c=0;c<3;c++){ const p=o[i+c]; d[i+c]=p+k*(4*p-o[i+c-4]-o[i+c+4]-o[i+c-4*w]-o[i+c+4*w])/4; } }
  x.putImageData(id,0,0); return out;
}
/** Image retouchée pour un rendu de largeur W : copie réduite pour l'aperçu, pleine définition (×2 si demandé) pour l'export */
export function processed(W: number, H: number){
  const img=IMG(), I=st.illus, r=placement(W,H,img.w,img.h,I), big=r.w>img.prev.width*1.15;
  const a=adjust(I), key=JSON.stringify([big, big && I.upscale, a, img.full.width]);
  if(cache.key===key) return cache.canvas!;
  let src=big ? (I.upscale ? upscale2(img.full) : img.full) : img.prev;
  if(!neutral(a)){
    const c=canvasOf(src.width,src.height), x=c.getContext('2d',{willReadFrequently:true})!; x.drawImage(src,0,0);
    const id=x.getImageData(0,0,c.width,c.height); processPixels(id.data,a); x.putImageData(id,0,0); src=c;
  }
  if(cache.canvas && cache.canvas!==img.full && cache.canvas!==img.prev && cache.canvas!==src){ cache.canvas.width=cache.canvas.height=0; }
  cache.key=key; cache.canvas=src; return src;
}
/** Grain : bruit fixe (graine constante) d'une base de 1240 px agrandie, comme le papier : même grain à l'aperçu et à l'export */
export function grain(land: boolean){
  if(IS.grainTex && IS.grainTex.land===land) return IS.grainTex.c;
  const w=land?1754:1240, h=land?1240:1754, c=canvasOf(w,h), x=c.getContext('2d')!, id=x.createImageData(w,h), d=id.data;
  let seed=20231123; const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  for(let i=0;i<d.length;i+=4){ const v=255-Math.round(rnd()*rnd()*150); d[i]=d[i+1]=d[i+2]=v; d[i+3]=255; }
  x.putImageData(id,0,0); IS.grainTex={land,c}; return c;
}
/** Image retouchée dans un cadre r (et sa forme : arche de la vignette), avec papier jauni et grain */
export function drawImageIn(ctx: Ctx, r: Rect, W: number, H: number){
  const img=IMG(), I=st.illus, P=placement(r.w,r.h,img.w,img.h,I), x=r.x+P.x, y=r.y+P.y;
  ctx.save(); clipMap(ctx,r);
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.drawImage(processed(r.w,r.h),x,y,P.w,P.h);
  ctx.beginPath(); ctx.rect(x,y,P.w,P.h); ctx.clip();
  ctx.globalCompositeOperation='multiply';
  if(I.paper){ ctx.globalAlpha=I.vintage==='strong'?0.42:0.28; ctx.fillStyle='#E7D6B0'; ctx.fillRect(x,y,P.w,P.h); }
  if(I.grain){ ctx.globalAlpha=I.vintage==='strong'?0.6:0.42; ctx.drawImage(grain(W>H),0,0,W,H); }
  ctx.restore();
}
export function placeholderIn(ctx: Ctx, r: Rect, U: number){
  const ink=st.colors.text; ctx.save(); clipMap(ctx,r); ctx.fillStyle=hexA(ink)(0.08); ctx.fillRect(r.x,r.y,r.w,r.h);
  ctx.fillStyle=hexA(ink)(0.7); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`600 ${0.026*U}px system-ui, sans-serif`;
  ctx.fillText(st.illus.img && !IS.loading ? 'Illustration à importer' : 'Illustration',r.x+r.w/2,r.y+r.h*0.6,r.w*0.9); ctx.restore();
}
/** Vignette : titre et lignes dans la bande sous la carte, centrés, réduits ensemble pour y tenir */
export function placeholder(ctx: Ctx, W: number, H: number, U: number, want: Illus['img']){
  const m=0.06*U, ink=st.colors.text;
  ctx.save(); ctx.strokeStyle=hexA(ink)(0.35); ctx.lineWidth=Math.max(1,0.003*U); ctx.setLineDash([0.012*U,0.009*U]);
  ctx.strokeRect(m,H*0.3,W-2*m,H*0.62);
  ctx.fillStyle=hexA(ink)(0.7); ctx.textAlign='center'; ctx.textBaseline='middle';
  const [l1,l2]=!want ? ['Votre illustration apparaîtra ici','Onglet Illustration : prompt, puis import de l’image']
    : IS.loading ? ['Chargement de l’illustration…',''] : ['Illustration à importer',`« ${want.name} » (${want.w} × ${want.h} px)`];
  ctx.font=`600 ${0.034*U}px system-ui, sans-serif`; ctx.fillText(l1,W/2,H*0.58,W-0.16*U);
  ctx.font=`400 ${0.024*U}px system-ui, sans-serif`; ctx.fillText(l2,W/2,H*0.58+0.05*U,W-0.16*U);
  ctx.restore();
}
/** Une illustration est prête quand l'image importée est celle de l'affiche (même empreinte) */
export const ready=()=>!!IS.img && IS.img.ref===refOf(st);
