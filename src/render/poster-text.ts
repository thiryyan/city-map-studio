/* City Map Studio — Rendu de l'affiche : typographie, textes, dédicace, cartouche (extrait de render/poster.ts, #119). */
import {st, ui} from '../core/doc/state.js';
import {FONTS} from '../content/config.js';
import {textLine} from '../core/geo/geo.js';
import {Ctx, GlyphFn, Opts, Row} from './poster-types.js';
import {paint} from './poster-paint.js';
// ---------- Typographie ----------
/** Police d'un rôle : 'title' (titre) ou texte (autres lignes). Une police manuscrite ne sert qu'aux lignes
 *  d'émotion (dédicace, noms, légendes des lieux) : sous-titre, coordonnées, date et légende prennent la police du titre. */
const SCRIPT_KEYS=['dedication','names','label1','label2'];
export function fontKey(role: string,key?: string){
  if(role==='title') return st.fontTitle||st.font;
  if(FONTS[st.font]?.script && !SCRIPT_KEYS.includes(key as string)) return (st.fontTitle && !FONTS[st.fontTitle]?.script) ? st.fontTitle : 'serif';
  return st.font;
}
export function fontOf(role: string,key?: string){ return FONTS[fontKey(role,key)]||FONTS.serif; }
export function fontStr(size: number, o: Opts={}){const f=o.fk ? FONTS[o.fk] : fontOf(o.role,o.key); return `${o.italic&&!f.script?'italic ':''}${o.weight||f.weight||400} ${size*(f.scale||1)}px ${f.fam}`}
/** Graphèmes d'un texte (ce que le lecteur voit comme un caractère : « é » décomposé, émoji composé, drapeau) :
 *  l'interlettrage les trace d'un bloc, jamais un signe combinant isolé. Repli sans Intl.Segmenter : NFC puis points de code.
 *  Largeurs mises en cache par police (l'aperçu redessine les mêmes lettres à chaque image). */
CMS.define('glyphs', () => {
  const seg = typeof Intl!=='undefined' && Intl.Segmenter ? new Intl.Segmenter('fr',{granularity:'grapheme'}) : null;
  const graphemes = (t: string) => seg ? Array.from(seg.segment(t),x=>x.segment) : Array.from(t.normalize('NFC'));
  const cache=new Map<string, number>();
  const width=(ctx: Ctx,g: string)=>{ const k=ctx.font+'\u0000'+g; let w=cache.get(k);
    if(w===undefined){ w=ctx.measureText(g).width; if(cache.size>4000) cache.clear(); cache.set(k,w); } return w; };
  /** Parcourt les graphèmes d'une ligne espacée : fn(graphème, x) ; avance = largeur + spPx */
  const each=(ctx: Ctx,t: string,x: number,spPx: number,fn: (g: string, x: number)=>void)=>{ for(const g of graphemes(t)){ fn(g,x); x+=width(ctx,g)+spPx; } };
  // Une police chargée après une première mesure (police de secours en attendant) : les largeurs mémorisées sont fausses
  if(typeof document!=='undefined') document.fonts?.addEventListener?.('loadingdone',()=>cache.clear());
  return {graphemes, width, each, clear:()=>cache.clear()};
});
/** Largeur dessinée : texte d'un bloc sans interlettrage ; sinon somme des graphèmes dessinés un à un (comme drawText),
 *  pour que le centrage et l'alignement à droite tombent juste (le crénage d'un bloc ne s'applique pas lettre à lettre). */
export function textW(ctx: Ctx, t: string, sp: number, size: number){
  if(!sp) return ctx.measureText(t).width;
  const gs=CMS.glyphs.graphemes(t); let w=0; for(const g of gs) w+=CMS.glyphs.width(ctx,g);
  return w + sp*size*Math.max(0,gs.length-1);
}
/** Facteur de taille d'une ligne de texte : réglage de la ligne × réglage global */
export function tScale(k: string){ return ((st.textScale as Record<string, number>)?.[k]??100)/100 * (st.textScaleAll??100)/100; }
/** Réductions automatiques relevées pendant le rendu de l'aperçu (clé de ligne → facteur appliqué < 1) */
export let fitSink: Record<string, number> | null=null;
export const setFitSink = (v: Record<string, number> | null) => { fitSink = v; };
   // modules ES : réaffectation depuis preview.ts (#102)
const FIT_WARN=0.9;
   // en deçà de 10 % de réduction, pas d'avertissement
export function noteFit(k: string,f: number){ if(fitSink && k && f<FIT_WARN) fitSink[k]=Math.min(fitSink[k]??1,f); }
/** Emprise des textes et repères, relevée pendant le rendu de l'aperçu quand ui.inkSink est un tableau (zone de sécurité, #60).
 *  Boîte en px du canevas (transformation courante appliquée) ; les jambages sous la ligne de base sont ignorés. */
CMS.define('ink', () => ({
  box(ctx: Ctx,k: string,x1: number,y1: number,x2: number,y2: number){
    const m=ctx.getTransform(), P=[[x1,y1],[x2,y1],[x1,y2],[x2,y2]].map(([x,y])=>[m.a*x+m.c*y+m.e, m.b*x+m.d*y+m.f]);
    const xs=P.map(p=>p[0]), ys=P.map(p=>p[1]);
    ui.inkSink.push({k, x1:Math.min(...xs), y1:Math.min(...ys), x2:Math.max(...xs), y2:Math.max(...ys)});
  }
}));
/** Mode Carte : style des textes de l'affiche (#74) appliqué aux lignes du gabarit pendant leur dessin (ui.textFx, posé par
 *  drawPosterAt) : couleur des lettres, ombre et contour proportionnés à la taille, police Vintage du titre. La mention des
 *  sources (sans clé de ligne) n'est pas concernée. */
CMS.define('textFx', () => ({
  styled(o: Opts){
    const fx=ui.textFx; if(!fx || !o.key) return o;
    const q: Opts={...o,color:fx.color}, sz=o.size||0;
    if(fx.vint && o.role==='title') q.fk='bebas';
    if(fx.shadow) q.shadow={color:fx.shadow, dx:fx.off*0.008*sz, dy:fx.off*0.008*sz};
    if(fx.outline) q.stroke={color:fx.outline, w:Math.max(1,0.035*sz)};
    return q;
  }
}));
/** Dessine un texte avec interlettrage et réduction automatique ; renvoie la largeur dessinée.
 *  Une police manuscrite n'est jamais mise en capitales ni espacée.
 *  Options des modes illustrés : fk (police imposée, clé de FONTS), shadow {color, dx, dy} (ombre décalée, nette),
 *  stroke {color, w} (contour des lettres, sous le remplissage). */
export function drawText(ctx: Ctx, t: string, x: number, y: number, o: Opts){
  if(!t) return 0;
  o=CMS.textFx.styled(o);
  const F=o.fk ? FONTS[o.fk] : fontOf(o.role,o.key);
  if(o.upper && !F.script) t=t.toUpperCase();
  let size=o.size; const sp=F.script?0:(o.spacing||0);
  ctx.font=fontStr(size,o);
  let w=textW(ctx,t,sp,size);
  if(o.maxW && w>o.maxW){ noteFit(o.key,o.maxW/w); size*=o.maxW/w; ctx.font=fontStr(size,o); w=textW(ctx,t,sp,size); }
  ctx.textBaseline='alphabetic'; ctx.textAlign='left';
  let sx = o.align==='center' ? x-w/2 : o.align==='right' ? x-w : x;
  const pass=(fn: GlyphFn,dx: number,dy: number)=>{ if(!sp) fn(t,sx+dx,y+dy); else CMS.glyphs.each(ctx,t,sx+dx,sp*size,(g: string,gx: number)=>fn(g,gx,y+dy)); };
  if(o.shadow){ ctx.fillStyle=o.shadow.color; pass((g: string,gx: number,gy: number)=>ctx.fillText(g,gx,gy),o.shadow.dx,o.shadow.dy); }
  if(o.stroke){ ctx.save(); ctx.strokeStyle=o.stroke.color; ctx.lineWidth=o.stroke.w; ctx.lineJoin='round'; ctx.miterLimit=2;
    pass((g: string,gx: number,gy: number)=>ctx.strokeText(g,gx,gy),0,0); ctx.restore(); }
  ctx.fillStyle=paint(o.color);
  pass((g: string,gx: number,gy: number)=>ctx.fillText(g,gx,gy),0,0);
  if(ui.inkSink) CMS.ink.box(ctx,o.ink||o.key||'text',sx,y-size*0.75,sx+w,y);
  return w;
}
/** Dessine bout à bout plusieurs segments de tailles différentes, alignés sur la même ligne de base,
 *  avec une réduction commune s'ils dépassent maxW. parts : [{t, size, key, italic, role}] ; renvoie la largeur. */
export function drawRun(ctx: Ctx, parts: Opts[], x: number, y: number, o: Opts){
  parts=parts.filter(p=>p.t).map(p=>({...p,fk:CMS.textFx.styled(p).fk})); if(!parts.length) return 0;
  const fx=ui.textFx; if(fx) o={...o,color:fx.color};   // mode Carte : style des textes (#74)
  const ws=parts.map(p=>{ ctx.font=fontStr(p.size,p); return ctx.measureText(p.t).width; });
  let tot=ws.reduce((a,b)=>a+b,0), f=1;
  if(o.maxW && tot>o.maxW){ f=o.maxW/tot; parts.forEach(p=>(p.keys||[p.key]).forEach((k: string)=>noteFit(k,f))); }
  let sx = o.align==='right' ? x-tot*f : o.align==='center' ? x-tot*f/2 : x;
  if(ui.inkSink) CMS.ink.box(ctx,o.ink||parts.find(p=>p.key)?.key||parts.find(p=>p.keys)?.keys[0]||'text',sx,y-Math.max(...parts.map(p=>p.size))*f*0.75,sx+tot*f,y);
  ctx.fillStyle=paint(o.color); ctx.textBaseline='alphabetic'; ctx.textAlign='left';
  parts.forEach((p,i)=>{ ctx.font=fontStr(p.size*f,p); const sz=p.size*f;
    if(fx?.shadow){ ctx.fillStyle=fx.shadow; ctx.fillText(p.t,sx+fx.off*0.008*sz,y+fx.off*0.008*sz); }
    if(fx?.outline){ ctx.save(); ctx.strokeStyle=fx.outline; ctx.lineWidth=Math.max(1,0.035*sz); ctx.lineJoin='round'; ctx.miterLimit=2; ctx.strokeText(p.t,sx,y); ctx.restore(); }
    ctx.fillStyle=paint(o.color); ctx.fillText(p.t,sx,y); sx+=ws[i]*f; });
  return tot*f;
}
// ---------- Dédicace sur deux lignes ----------
// Une dédicace trop longue n'est plus seulement réduite : en mode automatique, elle passe sur deux lignes dès que,
// sur une seule, elle serait réduite de plus de 20 %. Les mesures se font en unités U (petit côté de l'affiche) :
// la décision est la même dans l'aperçu, les vignettes et l'export, quelle que soit la résolution.
const WRAP_AT=0.8;
const measCtx=document.createElement('canvas').getContext('2d'), wrapCache=new Map();
if(document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone',()=>wrapCache.clear());
   // mesures refaites avec les vraies polices
/** Largeur d'un texte (en U) pour une taille donnée (en U) */
function measU(t: string,sizeU: number,o: Opts){ measCtx!.font=fontStr(sizeU*1000,o); return measCtx!.measureText(t).width/1000; }
/** Coupure en deux lignes la plus équilibrée (à l'espace qui rend la plus longue ligne la plus courte) ; null pour un seul mot */
function splitBalanced(ctx: Ctx,t: string){
  let best=null;
  for(const m of t.matchAll(/\s+/g)){ const a=t.slice(0,m.index).trim(), b=t.slice(m.index+m[0].length).trim(); if(!a||!b) continue;
    const w=Math.max(ctx.measureText(a).width,ctx.measureText(b).width); if(!best||w<best.w) best={a,b,w}; }
  return best;
}
/** Lignes de la dédicace (réglage st.dedWrap : 'auto' | 'one' | 'two'). sizeU, maxWU : taille et largeur disponible en U ;
 *  o.extraU : largeur occupée à côté sur la même ligne (noms du gabarit Souvenir). Renvoie {lines, w : ligne la plus longue (U)}. */
export function dedLines(t: string,sizeU: number,maxWU: number,o: Opts={}){
  if(!t) return {lines:[],w:0};
  const mode=st.dedWrap||'auto', fo={key:'dedication',italic:!!o.italic}, extra=o.extraU||0;
  const key=[t,sizeU,maxWU,extra,mode,fontStr(1,fo)].join('|'); if(wrapCache.has(key)) return wrapCache.get(key);
  const w1=measU(t,sizeU,fo); let r={lines:[t],w:w1};
  if(mode==='two' || (mode==='auto' && (w1+extra)*WRAP_AT>maxWU)){
    measCtx!.font=fontStr(sizeU*1000,fo); const sp=splitBalanced(measCtx!,t);
    if(sp && sp.w/1000<w1) r={lines:[sp.a,sp.b],w:sp.w/1000};
  }
  if(wrapCache.size>300) wrapCache.clear();
  wrapCache.set(key,r); return r;
}
/** Interligne de la dédicace sur deux lignes (en U) */
export const dedLeading=(sizeU: number)=>sizeU*(fontOf('','dedication').scale||1)*1.12;
/** Dédicace du cartouche (gabarits centrés) : lignes et hauteur ajoutée par la deuxième ligne (en U) */
export function cartDed(rows: Row[] | null,maxWU: number){
  const o=(rows||CART_ROWS).find(r=>r[0]==='dedication')![2], size=o.size*tScale('dedication');
  const L=dedLines(textLine('dedication'),size,maxWU,{italic:o.italic});
  return {L,size,extra:L.lines.length>1?dedLeading(size):0};
}
/** Pied du gabarit Souvenir : dédicace (une ou deux lignes) | noms. Partagé par geom (la carte cède la hauteur
 *  de la deuxième ligne) et par le dessin. Tailles et largeurs en U ; f : réduction commune si le pied déborde. */
export function souvenirFoot(W: number,U: number,m: number){
  const ded=textLine('dedication'), names=textLine('names'), inner=(W-2*m)/U, gap=0.062;
  const ds=0.062*tScale('dedication'), ns=0.026*tScale('names');
  const wn=ded&&names ? measU(names,ns,{italic:true,key:'names'}) : 0;
  const L=dedLines(ded,ds,ded&&names?inner-gap:inner,{extraU:wn});
  const f=ded&&names ? Math.min(1,(inner-gap)/(L.w+wn)) : 1;
  return {ded,names,inner,gap,ds,ns,wn,L,f,lh:dedLeading(ds)*f,extra:L.lines.length>1?dedLeading(ds)*f:0};
}
function hline(ctx: Ctx,x1: number,x2: number,y: number,lw: number,color: string){ctx.strokeStyle=paint(color);ctx.lineWidth=lw;ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke()}
// Lignes du cartouche : [clé, écart avant la ligne (× U), options de texte (tailles × U)]
export const CART_ROWS: Row[]=[
  ['title',0.115,{size:0.075,spacing:0.2,upper:true,role:'title'}],
  ['subtitle',0.050,{size:0.021,spacing:0.32,upper:true,narrow:0.7,rules:true}],
  ['coords',0.042,{size:0.019,spacing:0.12}],
  ['dedication',0.055,{size:0.034,italic:true}],
  ['names',0.038,{size:0.024,italic:true}],
  ['date',0.038,{size:0.017,spacing:0.3,upper:true}],
  ['legend',0.034,{size:0.016,spacing:0.06}]
];
// Polaroid : la dédicace en tête, le lieu en petit
export const POLA_ROWS: Row[]=[
  ['dedication',0.075,{size:0.05,italic:true}],
  ['names',0.045,{size:0.026,italic:true}],
  ['title',0.05,{size:0.024,spacing:0.3,upper:true,role:'title'}],
  ['date',0.032,{size:0.016,spacing:0.3,upper:true}],
  ['coords',0.03,{size:0.015,spacing:0.12}],
  ['legend',0.03,{size:0.015,spacing:0.06}]
];
/** Cartouche centré : les lignes masquées ou vides sont retirées et les suivantes remontent.
 *  box : {cx, maxW, y0, avail, mode, rows} ; mode 'bottom' (Fondu : calé en bas, grandit vers le haut) ou 'center'.
 *  Si les tailles choisies dépassent la hauteur disponible, tout le bloc est réduit pour tenir. */
export function drawCartouche(ctx: Ctx, U: number, box: Opts){
  const c=st.colors, cx=box.cx, maxW=box.maxW, avail=box.avail;
  const rows=((box.rows||CART_ROWS) as Row[]).filter(([k])=>!(box.only && !box.only.includes(k)))
    .map(([k,d,o]): [string, number, Opts, string]=>[textLine(k),d,{...o,size:o.size*U,maxW:maxW*(o.narrow||1),key:k},k]).filter(([txt])=>txt);
  if(!rows.length) return;
  // Ordre des lignes choisi (Textes, Plus de réglages) : chaque ligne garde son style et son écart
  const ord=CMS.order.sort(rows.map(r=>r[3])); rows.sort((a,b)=>ord.indexOf(a[3])-ord.indexOf(b[3]));
  // Taille choisie : la ligne grandit (ou rétrécit) et les interlignes suivent (≈ 0,8 × l'écart de corps de la ligne, 0,25 × celui de la précédente)
  let prevGrow=0;
  for(const r of rows){ const base=r[2].size, grow=base*(tScale(r[3])-1); r[2].size=base+grow; r[1]=Math.max(0.2*r[2].size/U, r[1]+(0.8*grow+0.25*prevGrow)/U); prevGrow=grow; }
  // Dédicace trop longue : deux lignes (cf. dedLines), la seconde à l'interligne de la dédicace ; les lignes suivantes descendent
  const di=rows.findIndex(r=>r[3]==='dedication');
  if(di>=0){ const r=rows[di], L=dedLines(r[0],r[2].size/U,maxW/U,{italic:r[2].italic});
    if(L.lines.length>1) rows.splice(di,1,[L.lines[0],r[1],r[2],r[3]],[L.lines[1],dedLeading(r[2].size/U),{...r[2]},r[3]]); }
  rows[0][1]=Math.max(rows[0][1],rows[0][2].size/U*1.1);   // première ligne : juste sous le haut du bloc
  let total=rows.reduce((a,r)=>a+r[1],0)*U;
  if(avail && total>avail){ const f=avail/total; for(const r of rows){ r[1]*=f; r[2].size*=f; noteFit(r[3],f); } total=avail; }
  let y=box.y0 + (box.mode==='bottom' ? 0.338*U-total : box.mode==='center' ? (avail-total)/2 - 0.02*U : 0);
  for(const [txt,d,o] of rows){
    y+=d*U;
    const w=drawText(ctx,txt,cx,y,{...o,align:'center',color:c.text});
    if(o.rules){ const gap=0.025*U, len=0.07*U, yy=y-0.007*U;
      hline(ctx,cx-w/2-gap-len,cx-w/2-gap,yy,0.0016*U,c.frame); hline(ctx,cx+w/2+gap,cx+w/2+gap+len,yy,0.0016*U,c.frame); }
  }
}
/** Gabarit « Affiche de voyage » : ville en très grand, alignée à gauche, informations en dessous */
export function drawTravelText(ctx: Ctx, U: number, b: Opts){
  const c=st.colors, x=b.x, R=b.x+b.w;
  let y=b.y+(b.h-0.37*U)/2+0.155*U; if(b.h>0.6*U) y=b.y+b.h-0.215*U;   // colonne paysage : bloc en bas
  drawText(ctx,textLine('title'),x,y,{size:0.15*U*tScale('title'),spacing:0.02,upper:true,role:'title',key:'title',align:'left',color:c.text,maxW:b.w});
  hline(ctx,x,R,y+0.035*U,0.003*U,c.frame);
  const sub=textLine('subtitle'), co=textLine('coords');
  drawText(ctx,sub,x,y+0.085*U,{size:0.022*U*tScale('subtitle'),spacing:0.25,upper:true,key:'subtitle',align:'left',color:c.text,maxW:b.w*(co?0.55:1)});
  drawText(ctx,co,R,y+0.085*U,{size:0.019*U*tScale('coords'),spacing:0.08,key:'coords',align:'right',color:c.text,maxW:b.w*(sub?0.42:1)});
  const ded=textLine('dedication'), da=textLine('date');
  drawText(ctx,ded,x,y+0.15*U,{size:0.036*U*tScale('dedication'),italic:true,key:'dedication',align:'left',color:c.text,maxW:b.w*(da?0.64:1)});
  drawText(ctx,da,R,y+0.15*U,{size:0.017*U*tScale('date'),spacing:0.3,upper:true,key:'date',align:'right',color:c.text,maxW:b.w*(ded?0.34:1)});
  drawText(ctx,[textLine('names'),textLine('legend')].filter(Boolean).join('   ·   '),x,y+0.198*U,{size:0.024*U*tScale('names'),italic:true,key:'names',align:'left',color:c.text,maxW:b.w});
}
