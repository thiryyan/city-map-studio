/* City Map Studio — Dessin des modes illustrés : plaques, blocs de texte, bande, composition Carte + illustration (extrait de features/illustration.ts, #119). */
import {sortLines} from '../core/order.js';
import {clamp, clipMap, shapeD, strokeShape, textLine, type Geom, type Rect} from '../core/geo/geo.js';
import {st} from '../core/scene.js';
import {attributionText, drawHalo, drawOrnaments} from './poster-ornaments.js';
import {drawMarkers} from './poster-marker.js';
import {drawText, tScale} from './poster-text.js';
import {hexA, paint} from './poster-paint.js';
import {contrast} from '../core/color.js';
import {Ctx, Opts, canvasOf} from '../core/illustration-state.js';
import {drawImageIn, placeholder, placeholderIn, ready} from './illustration-image.js';
import {drawLine, footRows, measureLine, plateInk, posOf, textLayout, textStyle, third, zoneOf} from './illustration-text.js';
import {hooks} from '../core/illustration-state.js';

// ---------- Rendu (appelé par drawPoster : aperçu et export) ----------
export function draw(ctx: Ctx, W: number, H: number, pass: string, g: Geom){
  const U=g.U;
  if(pass!=='over'){
    ctx.fillStyle=st.colors.paper; ctx.fillRect(0,0,W,H);
    if(ready()) drawImageIn(ctx,g.illus!,W,H); else placeholder(ctx,W,H,U,st.illus.img);
  }
  if(pass!=='under') drawTexts(ctx,W,H,U);
}
export const FADE_STOP=0.45;
/** Carte + illustration (drawPoster) : médaillon (carte dans une forme sur l'illustration) ou vignette (illustration sur la carte) */
export function drawMix(ctx: Ctx, W: number, H: number, pass: string, g: Geom, mapFn?: (ctx: Ctx, rect: Rect, view: any, i: number)=>void){
  const c=st.colors, U=g.U, T=textStyle(), med=g.mix==='med', r=g.map;
  if(pass!=='over'){
    ctx.fillStyle=c.paper; ctx.fillRect(0,0,W,H);
    if(g.mix!=='vig'){ if(ready()) drawImageIn(ctx,g.illus!,W,H); else if(med || g.mix==='fondu') placeholder(ctx,W,H,U,st.illus.img); else placeholderIn(ctx,g.illus!,U); }
  }
  if(pass==='all' && mapFn) g.places.forEach((p,i)=>{
    if(p.rect.fade){   // fondu : carte rendue à part, puis effacée vers le haut (même dégradé que le masque de l'aperçu)
      const R=p.rect, t=canvasOf(R.w,R.h), x=t.getContext('2d')!, loc={x:0,y:0,w:t.width,h:t.height};
      x.fillStyle=c.land; x.fillRect(0,0,t.width,t.height); mapFn(x,loc,p.view,i);
      x.globalCompositeOperation='destination-in'; const gr=x.createLinearGradient(0,0,0,t.height); gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(FADE_STOP,'rgba(0,0,0,1)');
      x.fillStyle=gr; x.fillRect(0,0,t.width,t.height); ctx.drawImage(t,R.x,R.y,R.w,R.h); t.width=t.height=0; return;
    }
    ctx.save(); clipMap(ctx,p.rect); ctx.fillStyle=c.land; ctx.fillRect(p.rect.x,p.rect.y,p.rect.w,p.rect.h); mapFn(ctx,p.rect,p.view,i); ctx.restore(); });
  if(pass==='under') return;
  for(const p of g.places){
    if(st.fx?.halo){ ctx.save(); clipMap(ctx,p.rect); drawHalo(ctx,p.rect,p.view); ctx.restore(); }
    ctx.save(); clipMap(ctx,p.rect); drawOrnaments(ctx,p.rect,p.view,U,true); ctx.restore();
    ctx.save(); clipMap(ctx,p.rect); drawMarkers(ctx,p.rect,p.view,U,W,true); ctx.restore();
  }
  const ink=contrast(T.color,c.paper)>=2.5 ? T.color : c.text;   // sur le papier : couleur du titre si elle s'y lit
  // Zone de chaque bloc (#86) : l'illustration (la bande pour la vignette), la carte ou toute l'affiche
  const Z: Record<string, string>={title:zoneOf('title'), foot:zoneOf('foot')}, specs: Record<string, Opts>={}, band: string[]=[];
  for(const k of ['title','foot']){
    if(g.mix==='vig' && Z[k]==='illus'){ band.push(k); continue; }
    const A=zoneArea(Z[k],g,W,H)!; specs[k]={A,env:{halo:Z[k]==='map',map:mapIn(r,A)},onMap:Z[k]==='map'};
  }
  if(med){   // contour de la forme : même réglage que les gabarits de la Carte (#77) ; le filet papier détache toujours la carte
    ctx.save(); ctx.strokeStyle=c.paper; ctx.lineWidth=0.02*U; strokeShape(ctx,r,0.01*U);
    if(st.ring){ ctx.strokeStyle=paint(ink); ctx.lineWidth=0.0022*U; strokeShape(ctx,r,0.021*U); } ctx.restore();
  } else if(g.mix==='vig'){
    ctx.strokeStyle=paint(c.frame);
    ctx.lineWidth=0.0025*U; const o1=0.014*U; ctx.strokeRect(r.x-o1,r.y-o1,r.w+2*o1,r.h+2*o1);
    ctx.lineWidth=0.0009*U; const o2=0.006*U; ctx.strokeRect(r.x-o2,r.y-o2,r.w+2*o2,r.h+2*o2);
    const v=g.illus!, e=0.012*U, edge={...v,x:v.x-e,y:v.y-e,w:v.w+2*e,h:v.h+2*e};
    ctx.save(); ctx.shadowColor='rgba(0,0,0,0.22)'; ctx.shadowBlur=0.02*U; ctx.shadowOffsetY=0.006*U; clipMap(ctx,{...edge,x:edge.x-0.04*U,y:edge.y-0.04*U,w:edge.w+0.08*U,h:edge.h+0.08*U,shape:null});
    ctx.fillStyle=c.paper; const pth=new Path2D(); pth.addPath(new Path2D(shapeD('arch',edge.w,edge.h)),new DOMMatrix().translate(edge.x,edge.y)); ctx.fill(pth); ctx.restore();
    if(ready()) drawImageIn(ctx,v,W,H); else placeholderIn(ctx,v,U);
  }
  const B=drawBlocks(ctx,U,specs,T.color);
  if(g.mix==='vig') Object.assign(B,drawBand(ctx,W,H,U,g,ink,band));
  hooks.note(ctx,W,H,B,med ? r : null);
  ctx.globalAlpha=0.55;
  drawText(ctx,attributionText(false),W-g.m,H-g.m*0.38,{size:0.0085*U,align:'right',color:g.mix==='vig' ? c.text : T.color,ink:'attribution'});
  ctx.globalAlpha=1;
}
export function drawArc(ctx: Ctx, A: Opts, col: string){
  if(A) for(const [c,x,y,rot] of A.glyphs){ ctx.save(); ctx.translate(x,y); ctx.rotate(rot); drawText(ctx,c,0,0,{...A.o,color:col}); ctx.restore(); }
}
/** Trait des plaques (cartouche, bandeau, étiquette, capsule, filets ; Textes, Plus de réglages) : style, épaisseur et couleur
 *  ('auto' : couleur propre à la plaque). draw(d) trace le chemin du trait, rentré de d vers l'intérieur (second trait du style
 *  double) ; k : épaisseur relative (filet fin des filets art déco). */
export function plateLine(ctx: Ctx, U: number, auto: string, draw: (off: number)=>void, k=1){
  const P=st.illusText.plate||{line:'solid',w:1,color:'auto'}; if(P.line==='none') return;
  const lw=0.0018*U*P.w*k;
  ctx.save(); ctx.strokeStyle=paint(P.color==='auto' ? auto : P.color); ctx.lineCap=P.line==='dotted' ? 'round' : 'butt';
  if(P.line==='dashed') ctx.setLineDash([lw*5,lw*3.5]); else if(P.line==='dotted') ctx.setLineDash([0.001,lw*2.6]);
  if(P.line==='double'){ ctx.lineWidth=lw*1.2; draw(0); ctx.lineWidth=lw*0.45; draw(lw*3.2); }
  else { ctx.lineWidth=lw; draw(0); }
  ctx.restore();
}
/** Rectangle à coins coupés (étiquette) : chemin, coins de taille c */
export function chamfer(ctx: Ctx, x: number, y: number, w: number, h: number, c: number){
  ctx.beginPath(); ctx.moveTo(x+c,y); ctx.lineTo(x+w-c,y); ctx.lineTo(x+w,y+c); ctx.lineTo(x+w,y+h-c); ctx.lineTo(x+w-c,y+h);
  ctx.lineTo(x+c,y+h); ctx.lineTo(x,y+h-c); ctx.lineTo(x,y+c); ctx.closePath();
}
/** Rectangle aux bouts arrondis (capsule) : chemin */
export function pill(ctx: Ctx, x: number, y: number, w: number, h: number){
  const r=Math.min(h,w)/2; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arc(x+w-r,y+r,r,-Math.PI/2,Math.PI/2);
  ctx.lineTo(x+r,y+h); ctx.arc(x+r,y+r,r,Math.PI/2,Math.PI*1.5); ctx.closePath();
}
/** Filets art déco : un filet et un filet fin au-dessus et au-dessous du bloc, interrompus par un petit losange au centre */
export function drawRules(ctx: Ctx, r: Opts, U: number, ink: string){
  const w=(st.illusText.plate||{}).w||1, s=0.008*U*Math.sqrt(w), cx=r.x+r.w/2, thin=0.0065*U;
  for(const [y,dir] of [[r.y,-1],[r.y+r.h,1]]){
    const seg=(yy: number)=>{ ctx.beginPath(); ctx.moveTo(r.x,yy); ctx.lineTo(cx-2.2*s,yy); ctx.moveTo(cx+2.2*s,yy); ctx.lineTo(r.x+r.w,yy); ctx.stroke(); };
    plateLine(ctx,U,ink,(e: number)=>seg(y+dir*e)); plateLine(ctx,U,ink,(e: number)=>seg(y+dir*(thin+e)),0.45);
    if(st.illusText.plate?.line!=='none'){ ctx.save(); ctx.fillStyle=paint(st.illusText.plate.color==='auto' ? ink : st.illusText.plate.color);
      ctx.beginPath(); ctx.moveTo(cx,y-s); ctx.lineTo(cx+1.5*s,y); ctx.lineTo(cx,y+s); ctx.lineTo(cx-1.5*s,y); ctx.closePath(); ctx.fill(); ctx.restore(); }
  }
}
/** Cachet : disque papier, double filet, filet intérieur, étoile au centre et deux points entre les textes */
export function drawSeal(ctx: Ctx, S: Opts, ink: string){
  const {cx,cy,R,d,ri}=S;
  ctx.save(); ctx.fillStyle=hexA(st.colors.paper)(0.9); ctx.beginPath(); ctx.arc(cx,cy,R,0,2*Math.PI); ctx.fill();
  ctx.strokeStyle=paint(ink); ctx.fillStyle=paint(ink);
  const ring=(r: number,w: number)=>{ ctx.lineWidth=w; ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.stroke(); };
  ring(R-0.012*d,0.016*d); ring(R-0.045*d,0.005*d); ring(ri,0.005*d);
  const s=ri*0.42, q=s*0.28; ctx.beginPath();
  for(let i=0;i<8;i++){ const a=-Math.PI/2+i*Math.PI/4, rr=i%2 ? q : s; ctx[i ? 'lineTo' : 'moveTo'](cx+rr*Math.cos(a),cy+rr*Math.sin(a)); }
  ctx.closePath(); ctx.fill();
  const rm=(ri+R-0.045*d)/2; for(const a of [0,Math.PI]){ ctx.beginPath(); ctx.arc(cx+rm*Math.cos(a),cy+rm*Math.sin(a),0.012*d,0,2*Math.PI); ctx.fill(); }
  ctx.restore();
}
/** Dessine un bloc mis en page par textLayout (coordonnées de sa zone), avec sa présentation ; col : couleur des lettres */
export function drawBlock(ctx: Ctx, b: Opts, U: number, col: string){
  const c=st.colors, d=b.deco||'libre', ink=plateInk(col), r=b.box;
  // fond des plaques à fond papier (cartouche, bandeau, étiquette) : couleur et opacité réglables ; encre lisible sur ce fond
  const PL=st.illusText.plate||{}, bg=PL.fill && PL.fill!=='auto' ? PL.fill : c.paper, fillC=hexA(bg)(PL.alpha??0.92), pink=plateInk(col,bg);
  if(d==='cartouche'){
    ctx.save(); ctx.fillStyle=fillC; ctx.fillRect(r.x,r.y,r.w,r.h); ctx.restore();
    const o=0.012*U; plateLine(ctx,U,pink,(e: number)=>ctx.strokeRect(r.x+o+e,r.y+o+e,r.w-2*(o+e),r.h-2*(o+e)));
  } else if(d==='bandeau'){
    ctx.save(); ctx.fillStyle=fillC; ctx.fillRect(r.x,r.y,r.w,r.h); ctx.restore();
    const o=0.006*U; plateLine(ctx,U,pink,(e: number)=>{ ctx.beginPath(); for(const y of [r.y+o+e,r.y+r.h-o-e]){ ctx.moveTo(r.x,y); ctx.lineTo(r.x+r.w,y); } ctx.stroke(); });
  } else if(d==='etiquette'){   // coins coupés ; le trait suit la forme
    const cc=Math.min(0.035*U,r.h*0.28), o=0.011*U;
    ctx.save(); ctx.fillStyle=fillC; chamfer(ctx,r.x,r.y,r.w,r.h,cc); ctx.fill(); ctx.restore();
    plateLine(ctx,U,pink,(e: number)=>{ const q=o+e; chamfer(ctx,r.x+q,r.y+q,r.w-2*q,r.h-2*q,Math.max(0,cc-q*0.6)); ctx.stroke(); });
  } else if(d==='capsule'){   // plaque pleine aux bouts arrondis, lettres couleur papier
    ctx.save(); ctx.fillStyle=paint(ink); pill(ctx,r.x,r.y,r.w,r.h); ctx.fill(); ctx.restore();
    const o=0.008*U; plateLine(ctx,U,c.paper,(e: number)=>{ const q=o+e; pill(ctx,r.x+q,r.y+q,r.w-2*q,r.h-2*q); ctx.stroke(); });
  } else if(d==='filets') drawRules(ctx,r,U,col);
  else if(d==='cachet') drawSeal(ctx,b.seal,ink);
  const tc=d==='capsule' ? c.paper : ['cartouche','bandeau','etiquette'].includes(d) ? pink : d==='cachet' ? ink : col;
  // filets d'un gabarit du bas (Souvenir, Carnet)
  if(b.rules?.length){ ctx.save(); ctx.strokeStyle=paint(tc); ctx.lineWidth=0.0016*U; ctx.beginPath();
    for(const q of b.rules){ ctx.moveTo(b.cl+q.x1,b.top+q.y1); ctx.lineTo(b.cl+q.x2,b.top+q.y2); } ctx.stroke(); ctx.restore(); }
  if(b.arcs){ for(const a of b.arcs) drawArc(ctx,a,tc); return; }
  if(d==='vertical'){
    ctx.save(); ctx.translate(b.cx,b.cy); ctx.rotate(b.rot);
    try{ for(const l of b.lines) drawLine(ctx,l.t,0,-b.h/2+l.at,{...l.o,align:'center',color:tc}); } finally{ ctx.restore(); }
    return;
  }
  for(const l of b.lines) drawLine(ctx,l.t,l.x!=null ? b.cl+l.x : b.ax,b.top+l.at,{...l.o,align:l.al||b.align,color:tc});
}
/** Dessine les blocs, chacun dans sa zone (specs : {title, foot} → {A : zone dans l'affiche, env}) ; renvoie leurs rectangles
 *  dans l'affiche, pour les zones de prise */
export function drawBlocks(ctx: Ctx, U: number, specs: Opts, col: string){
  const out: Opts={};
  for(const k of ['title','foot']){
    const S=specs[k]; if(!S) continue; const A=S.A;
    ctx.save(); ctx.translate(A.x,A.y);
    try{
      const b=textLayout(ctx,A.w,A.h,U,null,S.env)[k];
      if(b){ drawBlock(ctx,b,U,col); out[k]={rect:{...b.rect,x:b.rect.x+A.x,y:b.rect.y+A.y},area:A,kind:'area',fixed:!!b.fixed,env:S.env,onMap:!!S.onMap}; }
    } finally{ ctx.restore(); }
  }
  return out;
}
/** Cadre de la carte vu depuis une zone (coordonnées de la zone) */
export const mapIn=(M: Opts | null | undefined,A: Opts)=>M && {...M,x:M.x-A.x,y:M.y-A.y};
/** Textes de l'Illustration : toute l'affiche (ou une zone) ; avoid : cadre de la carte à signaler */
export function drawTexts(ctx: Ctx, PW: number, PH: number, U: number, area?: Opts, avoid?: Opts | null){
  const A=area||{x:0,y:0,w:PW,h:PH};
  hooks.note(ctx,PW,PH,drawBlocks(ctx,U,{title:{A,env:{}},foot:{A,env:{}}},textStyle().color),avoid);
}
/** Carte + illustration : zone d'un bloc. Carte : rectangle inscrit dans la forme du médaillon, partie opaque du fondu. */
export function zoneArea(z: string, g: Geom, W: number, H: number){
  if(z==='poster') return {x:0,y:0,w:W,h:H};
  if(z==='map'){
    const r=g.map;
    if(g.mix==='med'){ const [l,t,rr,b]=r.shape==='heart' ? [0.2,0.2,0.2,0.32] : r.shape==='arch' ? [0.06,0.3,0.06,0.04] : [0.146,0.146,0.146,0.146];
      return {x:r.x+r.w*l,y:r.y+r.h*t,w:r.w*(1-l-rr),h:r.h*(1-t-b)}; }
    if(g.mix==='fondu'){ const y=r.y+r.h*FADE_STOP*0.6; return {x:r.x,y,w:r.w,h:r.y+r.h-y}; }
    return {x:r.x,y:r.y,w:r.w,h:r.h};
  }
  return g.mix==='med' ? {x:0,y:0,w:W,h:H} : g.textArea;
}
/** Mode Carte : blocs sortis du gabarit, dessinés sur toute l'affiche (au-dessus de la carte) avec la mise en page des modes
 *  illustrés et leur présentation (#86) ; g : géométrie de l'affiche (cadre de la carte, pour l'arc) */
export function drawMapTexts(ctx: Ctx, W: number, H: number, U: number, mv: Opts, g: Geom){
  const B: Opts={};
  if(mv.title || mv.foot){
    const P=posOf(), col=textStyle().color, A={x:0,y:0,w:W,h:H}, env={map:g?.map,below:!mv.foot};   // arc : sous la carte, le gabarit garde les lignes du bas
    const L=textLayout(ctx,W,H,U,{pos:P.pos==='auto' ? 'hc' : P.pos},env);
    for(const k of ['title','foot']) if(mv[k] && L[k]){ drawBlock(ctx,L[k],U,col); B[k]={rect:L[k].rect,area:A,kind:'area',fixed:!!L[k].fixed,env}; }
  }
  hooks.note(ctx,W,H,B);
}
/** Vignette : titre et bloc du bas empilés dans la bande sous la carte ; chacun se place à gauche, au centre ou à droite.
 *  only : blocs à y mettre (les autres sont posés sur la carte ou sur l'affiche, #86). Renvoie leurs rectangles. */
export function drawBand(ctx: Ctx, W: number, _H: number, U: number, g: Geom, ink: string, only=['title','foot']){
  const T={...textStyle(),...posOf()}, vint=T.vint, b=g.band!, m=g.m+0.02*U, maxW=W-2*m;
  const shadow=T.shadow && contrast(T.shadow,st.colors.paper)>=1.3 ? {color:T.shadow, dx:T.off*0.001*U, dy:T.off*0.001*U} : null;
  // Bloc du bas : mêmes lignes que les autres mises en page (dédicace sur deux lignes, noms, date · coordonnées, légende ; #77)
  const head: Opts={title:['title',textLine('title'),(vint?0.13:0.075)*U*tScale('title'),{spacing:vint?0.04:0.12,upper:true,role:'title',key:'title',fk:vint?'bebas':undefined,shadow},vint?0.84:0.72],
    subtitle:['title',textLine('subtitle'),0.021*U*tScale('subtitle'),{spacing:0.3,upper:true,key:'subtitle'},0.75]};
  const rows=[...sortLines(['title','subtitle'],st).map((k: string)=>head[k]),
    ...footRows(U,maxW,{dedication:0.03,names:0.022,info:0.015,legend:0.013}).map((r: Opts)=>['foot',r.t,r.o.size,r.o,0.75])].filter(x=>x[1] && only.includes(x[0]));
  if(!rows.length) return {};
  const gap=0.022*U; let total=rows.reduce((a,x)=>a+x[2]*x[4],0)+gap*(rows.length-1);
  const f=Math.min(1,b.h*0.82/total); total*=f;
  const colX=(x?: number)=>x!=null ? x : 0.5;   // centre horizontal en fraction de la bande
  const XS: Record<string, number>={g:0,c:0.5,d:1}, tx=T.free ? T.free.x : XS[T.pos[1]], fx=T.ffree ? T.ffree.x : T.fpos==='auto' ? tx : XS[T.fpos[1]];
  const L: Opts={}; let y=b.y+(b.h-total)/2;
  for(const [k,t,sz,o,cap] of rows){
    const s=sz*f, tt=Array.isArray(t) ? t.map(([x,po])=>[x,{...po,size:po.size*f}]) : t;
    const w=measureLine(ctx,tt,{...o,size:s,maxW}), x0=k==='title'?colX(tx):colX(fx), al=['left','center','right'][third(x0)];
    const left=clamp(m+x0*(W-2*m)-w/2,m,W-m-w), ax=al==='left'?left:al==='right'?left+w:left+w/2;
    const top=y; y+=s*cap; drawLine(ctx,tt,ax,y,{...o,size:s,align:al,color:ink,maxW});
    const r=L[k]||(L[k]={rect:{x:Infinity,y:Infinity,w:0,h:0},x2:-Infinity,y2:-Infinity});
    r.rect.x=Math.min(r.rect.x,left); r.rect.y=Math.min(r.rect.y,top); r.x2=Math.max(r.x2,left+w); r.y2=Math.max(r.y2,y);
    y+=gap*f;
  }
  const area={x:m,y:b.y,w:W-2*m,h:b.h}, out: Opts={};
  for(const [k,r] of Object.entries(L)){ r.rect.w=r.x2-r.rect.x; r.rect.h=r.y2-r.rect.y; out[k]={rect:r.rect,area,kind:'band'}; }
  return out;
}
