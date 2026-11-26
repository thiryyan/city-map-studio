/* City Map Studio — Rendu de l'affiche (drawPoster) : textes, repères, ciel — commun à l'aperçu et à l'export.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html. */
'use strict';
// ---------- Typographie ----------
/** Police d'un rôle : 'title' (titre) ou texte (autres lignes). Une police manuscrite ne sert qu'aux lignes
 *  d'émotion (dédicace, noms, légendes des lieux) : sous-titre, coordonnées, date et légende prennent la police du titre. */
const SCRIPT_KEYS=['dedication','names','label1','label2'];
function fontKey(role,key){
  if(role==='title') return st.fontTitle||st.font;
  if(FONTS[st.font]?.script && !SCRIPT_KEYS.includes(key)) return (st.fontTitle && !FONTS[st.fontTitle]?.script) ? st.fontTitle : 'serif';
  return st.font;
}
function fontOf(role,key){ return FONTS[fontKey(role,key)]||FONTS.serif; }
function fontStr(size, o={}){const f=o.fk ? FONTS[o.fk] : fontOf(o.role,o.key); return `${o.italic&&!f.script?'italic ':''}${o.weight||f.weight||400} ${size*(f.scale||1)}px ${f.fam}`}
/** Graphèmes d'un texte (ce que le lecteur voit comme un caractère : « é » décomposé, émoji composé, drapeau) :
 *  l'interlettrage les trace d'un bloc, jamais un signe combinant isolé. Repli sans Intl.Segmenter : NFC puis points de code.
 *  Largeurs mises en cache par police (l'aperçu redessine les mêmes lettres à chaque image). */
CMS.define('glyphs', () => {
  const seg = typeof Intl!=='undefined' && Intl.Segmenter ? new Intl.Segmenter('fr',{granularity:'grapheme'}) : null;
  const graphemes = t => seg ? Array.from(seg.segment(t),x=>x.segment) : Array.from(t.normalize('NFC'));
  const cache=new Map();
  const width=(ctx,g)=>{ const k=ctx.font+'\u0000'+g; let w=cache.get(k);
    if(w===undefined){ w=ctx.measureText(g).width; if(cache.size>4000) cache.clear(); cache.set(k,w); } return w; };
  /** Parcourt les graphèmes d'une ligne espacée : fn(graphème, x) ; avance = largeur + spPx */
  const each=(ctx,t,x,spPx,fn)=>{ for(const g of graphemes(t)){ fn(g,x); x+=width(ctx,g)+spPx; } };
  // Une police chargée après une première mesure (police de secours en attendant) : les largeurs mémorisées sont fausses
  if(typeof document!=='undefined') document.fonts?.addEventListener?.('loadingdone',()=>cache.clear());
  return {graphemes, width, each, clear:()=>cache.clear()};
});
/** Largeur dessinée : texte d'un bloc sans interlettrage ; sinon somme des graphèmes dessinés un à un (comme drawText),
 *  pour que le centrage et l'alignement à droite tombent juste (le crénage d'un bloc ne s'applique pas lettre à lettre). */
function textW(ctx, t, sp, size){
  if(!sp) return ctx.measureText(t).width;
  const gs=CMS.glyphs.graphemes(t); let w=0; for(const g of gs) w+=CMS.glyphs.width(ctx,g);
  return w + sp*size*Math.max(0,gs.length-1);
}
/** Facteur de taille d'une ligne de texte : réglage de la ligne × réglage global */
function tScale(k){ return (st.textScale?.[k]??100)/100 * (st.textScaleAll??100)/100; }
/** Réductions automatiques relevées pendant le rendu de l'aperçu (clé de ligne → facteur appliqué < 1) */
let fitSink=null;
const FIT_WARN=0.9;   // en deçà de 10 % de réduction, pas d'avertissement
function noteFit(k,f){ if(fitSink && k && f<FIT_WARN) fitSink[k]=Math.min(fitSink[k]??1,f); }
/** Emprise des textes et repères, relevée pendant le rendu de l'aperçu quand ui.inkSink est un tableau (zone de sécurité, #60).
 *  Boîte en px du canevas (transformation courante appliquée) ; les jambages sous la ligne de base sont ignorés. */
CMS.define('ink', () => ({
  box(ctx,k,x1,y1,x2,y2){
    const m=ctx.getTransform(), P=[[x1,y1],[x2,y1],[x1,y2],[x2,y2]].map(([x,y])=>[m.a*x+m.c*y+m.e, m.b*x+m.d*y+m.f]);
    const xs=P.map(p=>p[0]), ys=P.map(p=>p[1]);
    ui.inkSink.push({k, x1:Math.min(...xs), y1:Math.min(...ys), x2:Math.max(...xs), y2:Math.max(...ys)});
  }
}));
/** Mode Carte : style des textes de l'affiche (#74) appliqué aux lignes du gabarit pendant leur dessin (ui.textFx, posé par
 *  drawPosterAt) : couleur des lettres, ombre et contour proportionnés à la taille, police Vintage du titre. La mention des
 *  sources (sans clé de ligne) n'est pas concernée. */
CMS.define('textFx', () => ({
  styled(o){
    const fx=ui.textFx; if(!fx || !o.key) return o;
    const q={...o,color:fx.color}, sz=o.size||0;
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
function drawText(ctx, t, x, y, o){
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
  const pass=(fn,dx,dy)=>{ if(!sp) fn(t,sx+dx,y+dy); else CMS.glyphs.each(ctx,t,sx+dx,sp*size,(g,gx)=>fn(g,gx,y+dy)); };
  if(o.shadow){ ctx.fillStyle=o.shadow.color; pass((g,gx,gy)=>ctx.fillText(g,gx,gy),o.shadow.dx,o.shadow.dy); }
  if(o.stroke){ ctx.save(); ctx.strokeStyle=o.stroke.color; ctx.lineWidth=o.stroke.w; ctx.lineJoin='round'; ctx.miterLimit=2;
    pass((g,gx,gy)=>ctx.strokeText(g,gx,gy),0,0); ctx.restore(); }
  ctx.fillStyle=paint(o.color);
  pass((g,gx,gy)=>ctx.fillText(g,gx,gy),0,0);
  if(ui.inkSink) CMS.ink.box(ctx,o.ink||o.key||'text',sx,y-size*0.75,sx+w,y);
  return w;
}
/** Dessine bout à bout plusieurs segments de tailles différentes, alignés sur la même ligne de base,
 *  avec une réduction commune s'ils dépassent maxW. parts : [{t, size, key, italic, role}] ; renvoie la largeur. */
function drawRun(ctx, parts, x, y, o){
  parts=parts.filter(p=>p.t).map(p=>({...p,fk:CMS.textFx.styled(p).fk})); if(!parts.length) return 0;
  const fx=ui.textFx; if(fx) o={...o,color:fx.color};   // mode Carte : style des textes (#74)
  const ws=parts.map(p=>{ ctx.font=fontStr(p.size,p); return ctx.measureText(p.t).width; });
  let tot=ws.reduce((a,b)=>a+b,0), f=1;
  if(o.maxW && tot>o.maxW){ f=o.maxW/tot; parts.forEach(p=>(p.keys||[p.key]).forEach(k=>noteFit(k,f))); }
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
if(document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone',()=>wrapCache.clear());   // mesures refaites avec les vraies polices
/** Largeur d'un texte (en U) pour une taille donnée (en U) */
function measU(t,sizeU,o){ measCtx.font=fontStr(sizeU*1000,o); return measCtx.measureText(t).width/1000; }
/** Coupure en deux lignes la plus équilibrée (à l'espace qui rend la plus longue ligne la plus courte) ; null pour un seul mot */
function splitBalanced(ctx,t){
  let best=null;
  for(const m of t.matchAll(/\s+/g)){ const a=t.slice(0,m.index).trim(), b=t.slice(m.index+m[0].length).trim(); if(!a||!b) continue;
    const w=Math.max(ctx.measureText(a).width,ctx.measureText(b).width); if(!best||w<best.w) best={a,b,w}; }
  return best;
}
/** Lignes de la dédicace (réglage st.dedWrap : 'auto' | 'one' | 'two'). sizeU, maxWU : taille et largeur disponible en U ;
 *  o.extraU : largeur occupée à côté sur la même ligne (noms du gabarit Souvenir). Renvoie {lines, w : ligne la plus longue (U)}. */
function dedLines(t,sizeU,maxWU,o={}){
  if(!t) return {lines:[],w:0};
  const mode=st.dedWrap||'auto', fo={key:'dedication',italic:!!o.italic}, extra=o.extraU||0;
  const key=[t,sizeU,maxWU,extra,mode,fontStr(1,fo)].join('|'); if(wrapCache.has(key)) return wrapCache.get(key);
  const w1=measU(t,sizeU,fo); let r={lines:[t],w:w1};
  if(mode==='two' || (mode==='auto' && (w1+extra)*WRAP_AT>maxWU)){
    measCtx.font=fontStr(sizeU*1000,fo); const sp=splitBalanced(measCtx,t);
    if(sp && sp.w/1000<w1) r={lines:[sp.a,sp.b],w:sp.w/1000};
  }
  if(wrapCache.size>300) wrapCache.clear();
  wrapCache.set(key,r); return r;
}
/** Interligne de la dédicace sur deux lignes (en U) */
const dedLeading=sizeU=>sizeU*(fontOf('','dedication').scale||1)*1.12;
/** Dédicace du cartouche (gabarits centrés) : lignes et hauteur ajoutée par la deuxième ligne (en U) */
function cartDed(rows,maxWU){
  const o=(rows||CART_ROWS).find(r=>r[0]==='dedication')[2], size=o.size*tScale('dedication');
  const L=dedLines(textLine('dedication'),size,maxWU,{italic:o.italic});
  return {L,size,extra:L.lines.length>1?dedLeading(size):0};
}
/** Pied du gabarit Souvenir : dédicace (une ou deux lignes) | noms. Partagé par geom (la carte cède la hauteur
 *  de la deuxième ligne) et par le dessin. Tailles et largeurs en U ; f : réduction commune si le pied déborde. */
function souvenirFoot(W,U,m){
  const ded=textLine('dedication'), names=textLine('names'), inner=(W-2*m)/U, gap=0.062;
  const ds=0.062*tScale('dedication'), ns=0.026*tScale('names');
  const wn=ded&&names ? measU(names,ns,{italic:true,key:'names'}) : 0;
  const L=dedLines(ded,ds,ded&&names?inner-gap:inner,{extraU:wn});
  const f=ded&&names ? Math.min(1,(inner-gap)/(L.w+wn)) : 1;
  return {ded,names,inner,gap,ds,ns,wn,L,f,lh:dedLeading(ds)*f,extra:L.lines.length>1?dedLeading(ds)*f:0};
}
function hline(ctx,x1,x2,y,lw,color){ctx.strokeStyle=paint(color);ctx.lineWidth=lw;ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke()}

// Lignes du cartouche : [clé, écart avant la ligne (× U), options de texte (tailles × U)]
const CART_ROWS=[
  ['title',0.115,{size:0.075,spacing:0.2,upper:true,role:'title'}],
  ['subtitle',0.050,{size:0.021,spacing:0.32,upper:true,narrow:0.7,rules:true}],
  ['coords',0.042,{size:0.019,spacing:0.12}],
  ['dedication',0.055,{size:0.034,italic:true}],
  ['names',0.038,{size:0.024,italic:true}],
  ['date',0.038,{size:0.017,spacing:0.3,upper:true}],
  ['legend',0.034,{size:0.016,spacing:0.06}]
];
// Polaroid : la dédicace en tête, le lieu en petit
const POLA_ROWS=[
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
function drawCartouche(ctx, U, box){
  const c=st.colors, cx=box.cx, maxW=box.maxW, avail=box.avail;
  const rows=(box.rows||CART_ROWS).filter(([k])=>!(box.only && !box.only.includes(k)))
    .map(([k,d,o])=>[textLine(k),d,{...o,size:o.size*U,maxW:maxW*(o.narrow||1),key:k},k]).filter(([txt])=>txt);
  if(!rows.length) return;
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
function drawTravelText(ctx, U, b){
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

// ---------- Repères vectoriels (unité : rayon r) ----------
const STAR_D=(()=>{ let d=''; for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, r=i%2?0.42:1; d+=(i?'L':'M')+(r*Math.cos(a)).toFixed(3)+','+(r*Math.sin(a)+0.08).toFixed(3); } return d+'Z'; })();
const MARKER_D={
  star:STAR_D,
  house:'M0,-0.95 L0.98,-0.08 L0.74,-0.08 L0.74,0.9 L0.24,0.9 L0.24,0.32 L-0.24,0.32 L-0.24,0.9 L-0.74,0.9 L-0.74,-0.08 L-0.98,-0.08 Z'
};
function markerPath(ctx, style){
  ctx.beginPath();
  if(style==='heart'){
    ctx.moveTo(0,-0.42);
    ctx.bezierCurveTo(-0.15,-0.85,-1.0,-0.95,-1.0,-0.3);
    ctx.bezierCurveTo(-1.0,0.2,-0.38,0.52,0,0.9);
    ctx.bezierCurveTo(0.38,0.52,1.0,0.2,1.0,-0.3);
    ctx.bezierCurveTo(1.0,-0.95,0.15,-0.85,0,-0.42);
    ctx.closePath();
  } else if(style==='heartGeo'){
    const P=[[0,-0.42],[0.32,-0.86],[0.78,-0.8],[1,-0.36],[0.8,0.12],[0,0.92],[-0.8,0.12],[-1,-0.36],[-0.78,-0.8],[-0.32,-0.86]];
    P.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.closePath();
  } else if(style==='pin'){
    ctx.moveTo(0,0);
    ctx.bezierCurveTo(-0.22,-0.45,-0.7,-0.85,-0.7,-1.3);
    ctx.arc(0,-1.3,0.7,Math.PI,0);
    ctx.bezierCurveTo(0.7,-0.85,0.22,-0.45,0,0);
    ctx.closePath();
  }
}
function drawMarker(ctx, x, y, size, o){
  const r=size/2, col=o.color, fill=o.fill;
  ctx.save(); ctx.translate(x,y); ctx.scale(r,r); ctx.globalAlpha=o.opacity;
  ctx.lineJoin='round'; ctx.lineCap='round';
  const st_=o.style;
  const ink=foilCtx ? foilGradient(ctx,col,-1.1,-1.1,1.1,1.1,2) : col;
  ctx.fillStyle=ink; ctx.strokeStyle=ink;
  if(st_==='dot'){
    ctx.beginPath(); ctx.arc(0,0,0.26,0,7); fill?ctx.fill():(ctx.lineWidth=0.08,ctx.stroke());
    ctx.lineWidth=0.06; ctx.beginPath(); ctx.arc(0,0,0.68,0,7); ctx.stroke();
    ctx.globalAlpha*=0.45; ctx.lineWidth=0.035; ctx.beginPath(); ctx.arc(0,0,1.0,0,7); ctx.stroke();
  } else if(st_==='ring'){
    ctx.lineWidth=fill?0.16:0.09; ctx.beginPath(); ctx.arc(0,0,0.72,0,7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,0.09,0,7); ctx.fill();
  } else if(MARKER_D[st_]){
    const p=new Path2D(MARKER_D[st_]);
    if(fill) ctx.fill(p); else { ctx.lineWidth=0.1; ctx.stroke(p); }
    if(st_==='house' && fill){ ctx.fillStyle=o.facet||'#fff'; ctx.fillRect(-0.12,-0.18,0.24,0.24); }
  } else if(st_==='rings'){   // alliances entrelacées
    ctx.lineWidth=fill?0.15:0.09;
    ctx.beginPath(); ctx.arc(-0.3,0.12,0.52,0,7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.3,0.12,0.52,0,7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.3,-0.62); ctx.lineTo(-0.16,-0.48); ctx.lineTo(-0.3,-0.34); ctx.lineTo(-0.44,-0.48); ctx.closePath(); fill?ctx.fill():ctx.stroke();
  } else if(st_==='anchor'){   // ancre marine
    ctx.lineWidth=fill?0.14:0.09;
    ctx.beginPath(); ctx.arc(0,-0.74,0.15,0,7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-0.59); ctx.lineTo(0,0.88); ctx.moveTo(-0.42,-0.36); ctx.lineTo(0.42,-0.36); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0.18,0.7,0.2,Math.PI-0.2); ctx.stroke();
    for(const s of [-1,1]){ ctx.beginPath(); const ax=s*0.7*Math.cos(0.2), ay=0.18+0.7*Math.sin(0.2); ctx.moveTo(ax,ay-0.24); ctx.lineTo(ax,ay); ctx.lineTo(ax-s*0.22,ay-0.06); ctx.stroke(); }
  } else if(st_==='feet'){   // pieds de bébé
    for(const s of [-1,1]){
      ctx.save(); ctx.translate(s*0.38,0.12); ctx.rotate(s*0.12);
      ctx.beginPath(); ctx.ellipse(0,0.22,0.24,0.48,0,0,7); fill?ctx.fill():(ctx.lineWidth=0.07,ctx.stroke());
      const T=[[-0.15,-0.42,0.09],[-0.01,-0.5,0.08],[0.11,-0.47,0.07],[0.2,-0.4,0.06],[0.26,-0.31,0.05]].map(([tx,ty,tr])=>[s>0?tx:-tx,ty,tr]);
      for(const [tx,ty,tr] of T){ ctx.beginPath(); ctx.arc(tx,ty,tr,0,7); fill?ctx.fill():(ctx.lineWidth=0.05,ctx.stroke()); }
      ctx.restore();
    }
  } else {
    markerPath(ctx,st_);
    if(fill){ ctx.fill(); }
    else { ctx.lineWidth=0.1; ctx.stroke(); }
    if(st_==='heartGeo'){ // facettes
      const F=[[[0,-0.42],[0,0.92]],[[0,-0.42],[-0.5,-0.32]],[[-0.32,-0.86],[-0.5,-0.32]],[[-0.78,-0.8],[-0.5,-0.32]],[[-1,-0.36],[-0.5,-0.32]],[[-0.8,0.12],[-0.5,-0.32]],[[-0.5,-0.32],[0,0.92]],
               [[0,-0.42],[0.5,-0.32]],[[0.32,-0.86],[0.5,-0.32]],[[0.78,-0.8],[0.5,-0.32]],[[1,-0.36],[0.5,-0.32]],[[0.8,0.12],[0.5,-0.32]],[[0.5,-0.32],[0,0.92]]];
      ctx.strokeStyle = fill ? (o.facet||'#ffffff') : ink; ctx.globalAlpha = o.opacity*(fill?0.55:0.8); ctx.lineWidth=fill?0.035:0.045;
      ctx.beginPath(); F.forEach(([a,b])=>{ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1])}); ctx.stroke();
    }
    if(st_==='pin' && fill){ ctx.globalAlpha=o.opacity; ctx.fillStyle=o.facet||'#fff'; ctx.beginPath(); ctx.arc(0,-1.3,0.26,0,7); ctx.fill(); }
  }
  ctx.restore();
}
function markerOpts(){return {style:st.markerStyle, color:st.colors.marker, fill:st.markerFill, opacity:st.markerOpacity, facet:st.colors.paper}}
/** Pastille numérotée (lieux multiples) */
function drawBadge(ctx, x, y, n, d){
  ctx.save(); ctx.fillStyle=st.colors.marker; ctx.strokeStyle=st.colors.paper; ctx.lineWidth=d*0.12;
  ctx.beginPath(); ctx.arc(x,y,d/2,0,7); ctx.fill(); ctx.stroke();
  ctx.fillStyle=st.colors.paper; ctx.font=`600 ${d*0.62}px Montserrat, Arial, sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(String(n),x,y+d*0.04); ctx.restore();
}
/** Tracé d'un itinéraire (GPX ou lieux reliés) dans un cadre de carte */
function drawRoute(ctx, pts, r, view, U, dashed){
  if(!pts || pts.length<2) return;
  const rs=st.routeStyle||{};
  ctx.save(); ctx.strokeStyle=st.colors[rs.color]||st.colors.marker; ctx.lineWidth=U*0.0035*(rs.width||1); ctx.lineJoin='round'; ctx.lineCap='round'; ctx.globalAlpha=0.92;
  if(dashed) ctx.setLineDash([U*0.012,U*0.009]);
  ctx.beginPath(); pts.forEach(([la,lo],i)=>{ const p=project(la,lo,r,view); i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); }); ctx.stroke(); ctx.restore();
}
/** Repère principal, lieux supplémentaires numérotés et itinéraires d'une vue */
function drawMarkers(ctx, r, view, U, W, main){
  const size=W*MARKER_BASE*st.markerSize/100*(U/W), extra=(main && st.layout!=='diptych') ? (st.markers2||[]) : [];
  if(main && st.layout!=='diptych'){
    if(st.route?.pts?.length && st.route.show!==false) drawRoute(ctx,st.route.pts,r,view,U,!!st.routeStyle?.dash);
    if(st.linkMarkers && extra.length) drawRoute(ctx,[[view.marker.lat,view.marker.lon],...extra.map(p=>[p.lat,p.lon])],r,view,U,true);
  }
  const pts=[view.marker,...extra];
  pts.forEach((p,i)=>{ const q=project(p.lat,p.lon,r,view), s=i?size*0.75:size; drawMarker(ctx,q.x,q.y,s,markerOpts());
    if(ui.inkSink && q.x>=r.x && q.x<=r.x+r.w && q.y>=r.y && q.y<=r.y+r.h) CMS.ink.box(ctx,'marker',q.x-s/2,q.y-s/2,q.x+s/2,q.y+s/2);
    if(st.numbered && extra.length){ const s=(i?size*0.75:size); drawBadge(ctx,q.x+s*0.55,q.y-s*0.55,i+1,Math.max(U*0.026,s*0.38)); } });
}

// ---------- Carte du ciel ----------
// Étoiles (magnitude ≤ 5,5) et constellations : lib/sky/sky-data.js (d3-celestial, BSD-3), chargé à la demande.
let skyLoading=null;
function ensureSky(){ if(window.SKY_DATA) return Promise.resolve(true);
  if(!skyLoading) skyLoading=loadScript('lib/sky/sky-data.js',15000).then(()=>{ drawUnder(); refreshCards(); return true; }).catch(e=>{ skyLoading=null; toast('Données du ciel indisponibles : '+e.message,true); return false; });
  return skyLoading; }
/** Instant observé, en ms UTC : date et heure locales du lieu, fuseau choisi (« auto » : celui de l'appareil à cette date) */
function skyTime(s=st.sky){
  const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(s?.when||''); if(!m) return null;
  const [y,mo,d,h,mi]=m.slice(1).map(Number);
  const tz = s.tz==='auto' || s.tz==null ? -new Date(y,mo-1,d,h,mi).getTimezoneOffset() : +s.tz;
  return Date.UTC(y,mo-1,d,h,mi)-tz*60000;
}
/** Hauteur et azimut (degrés, azimut depuis le nord vers l'est) d'un astre (AD, Déc en degrés) */
function altAz(ra, dec, lat, lon, ms){
  const jd=ms/86400000+2440587.5, gmst=280.46061837+360.98564736629*(jd-2451545);
  const H=((gmst+lon-ra)%360)*D2R, d=dec*D2R, p=lat*D2R;
  const alt=Math.asin(Math.sin(p)*Math.sin(d)+Math.cos(p)*Math.cos(d)*Math.cos(H));
  const az=Math.atan2(-Math.sin(H)*Math.cos(d), Math.cos(p)*Math.sin(d)-Math.sin(p)*Math.cos(d)*Math.cos(H));
  return {alt:alt/D2R, az:(az/D2R+360)%360};
}
// ---------- Ciel : Voie lactée, planètes, Lune ----------
let mwLoading=null;
function ensureMilkyWay(){ if(window.SKY_MW) return Promise.resolve(true);
  if(!mwLoading) mwLoading=loadScript('lib/sky/milkyway.js',15000).then(()=>{ drawUnder(); return true; }).catch(e=>{ mwLoading=null; toast('Voie lactée indisponible : '+e.message,true); return false; });
  return mwLoading; }
const OBLIQ=23.43928*D2R;
/** Coordonnées écliptiques (degrés) → équatoriales {ra, dec} (degrés) */
function eclToEq(lon,lat){ const l=lon*D2R, b=lat*D2R;
  const ra=Math.atan2(Math.sin(l)*Math.cos(OBLIQ)-Math.tan(b)*Math.sin(OBLIQ),Math.cos(l)), dec=Math.asin(Math.sin(b)*Math.cos(OBLIQ)+Math.cos(b)*Math.sin(OBLIQ)*Math.sin(l));
  return {ra:(ra/D2R+360)%360, dec:dec/D2R}; }
// Éléments képlériens moyens (JPL, E. M. Standish, valables de 1800 à 2050) : a, e, I, L, ϖ, Ω et leurs variations par siècle
const PLANETS=[
  ['Mercure',[0.38709927,0.20563593,7.00497902,252.25032350,77.45779628,48.33076593],[0.00000037,0.00001906,-0.00594749,149472.67411175,0.16047689,-0.12534081],-0.4],
  ['Vénus',[0.72333566,0.00677672,3.39467605,181.97909950,131.60246718,76.67984255],[0.00000390,-0.00004107,-0.00078890,58517.81538729,0.00268329,-0.27769418],-4.2],
  ['Terre',[1.00000261,0.01671123,-0.00001531,100.46457166,102.93768193,0],[0.00000562,-0.00004392,-0.01294668,35999.37244981,0.32327364,0],0],
  ['Mars',[1.52371034,0.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891],[0.00001847,0.00007882,-0.00813131,19140.30268499,0.44441088,-0.29257343],0.5],
  ['Jupiter',[5.20288700,0.04838624,1.30439695,34.39644051,14.72847983,100.47390909],[-0.00011607,-0.00013253,-0.00183714,3034.74612775,0.21252668,0.20469106],-2.2],
  ['Saturne',[9.53667594,0.05386179,2.48599187,49.95424423,92.59887831,113.66242448],[-0.00125060,-0.00050991,0.00193609,1222.49362201,-0.41897216,-0.28867794],0.6]
];
/** Position héliocentrique écliptique (UA) d'une planète, T en siècles juliens depuis J2000 */
function helio(p,T){
  const [a,e,I,L,w,O]=p[1].map((v,i)=>v+p[2][i]*T), M=((L-w)%360+540)%360-180, om=w-O;
  let E=M*D2R+e*Math.sin(M*D2R); for(let k=0;k<6;k++) E-=(E-e*Math.sin(E)-M*D2R)/(1-e*Math.cos(E));
  const x=a*(Math.cos(E)-e), y=a*Math.sqrt(1-e*e)*Math.sin(E), co=Math.cos(om*D2R), so=Math.sin(om*D2R), cO=Math.cos(O*D2R), sO=Math.sin(O*D2R), cI=Math.cos(I*D2R), sI=Math.sin(I*D2R);
  return [(co*cO-so*sO*cI)*x+(-so*cO-co*sO*cI)*y, (co*sO+so*cO*cI)*x+(-so*sO+co*cO*cI)*y, so*sI*x+co*sI*y];
}
/** Planètes visibles à l'œil nu : nom, {ra, dec}, magnitude indicative */
function planetsAt(ms){
  const T=(ms/86400000+2440587.5-2451545)/36525, E=helio(PLANETS[2],T);
  return PLANETS.filter(p=>p[0]!=='Terre').map(p=>{ const h=helio(p,T), x=h[0]-E[0], y=h[1]-E[1], z=h[2]-E[2];
    return {name:p[0], mag:p[3], ...eclToEq(Math.atan2(y,x)/D2R, Math.atan2(z,Math.hypot(x,y))/D2R)}; });
}
/** Lune et Soleil (précision de l'ordre du degré) : positions, fraction éclairée, croissante ou non */
function moonSun(ms){
  const d=ms/86400000+2440587.5-2451545, r=x=>x*D2R;
  const L=218.316+13.176396*d, M=134.963+13.064993*d, F=93.272+13.229350*d;
  const lm=L+6.289*Math.sin(r(M)), bm=5.128*Math.sin(r(F));
  const g=357.528+0.9856003*d, ls=280.460+0.9856474*d+1.915*Math.sin(r(g))+0.020*Math.sin(r(2*g));
  const el=Math.acos(Math.cos(r(bm))*Math.cos(r(lm-ls)));
  return {moon:eclToEq(lm,bm), sun:eclToEq(ls,0), frac:(1-Math.cos(el))/2, waxing:((lm-ls)%360+360)%360<180};
}
/** Lune en phase : partie éclairée tournée vers le Soleil (angle `toSun` dans le plan du dessin) */
function drawMoon(ctx,x,y,rad,frac,toSun,ink,bg){
  ctx.save(); ctx.translate(x,y); ctx.rotate(toSun);
  ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(0,0,rad,0,7); ctx.fill();
  ctx.strokeStyle=ink; ctx.globalAlpha=0.35; ctx.lineWidth=rad*0.08; ctx.stroke(); ctx.globalAlpha=1;
  const rx=rad*Math.abs(2*frac-1);
  ctx.fillStyle=ink; ctx.beginPath(); ctx.arc(0,0,rad,-Math.PI/2,Math.PI/2);
  if(frac>=0.5) ctx.ellipse(0,0,rx,rad,0,Math.PI/2,3*Math.PI/2,false); else ctx.ellipse(0,0,rx,rad,0,Math.PI/2,-Math.PI/2,true);
  ctx.fill(); ctx.restore();
}
function drawSky(ctx, r, U){
  const c=st.colors, dark=lum(c.paper)<0.3, R=r.w/2, cx=r.x+R, cy=r.y+R;
  const bg=dark?c.land:c.text, ink=dark?c.text:c.paper;
  ctx.save(); ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.fill(); ctx.clip();
  const ms=skyTime(), S=window.SKY_DATA;
  if(ms!=null && S){
    const {lat,lon}=st.marker;
    // projection stéréographique centrée sur le zénith : horizon = bord du disque, nord en haut, est à gauche
    const P=(ra,dec)=>{ const a=altAz(ra,dec,lat,lon,ms), q=Math.tan((90-Math.max(a.alt,-75))*D2R/2)*R, z=a.az*D2R; return {x:cx-q*Math.sin(z), y:cy-q*Math.cos(z), alt:a.alt}; };
    if(st.sky.milky){   // Voie lactée : cinq niveaux superposés, du plus diffus au plus dense
      if(window.SKY_MW){ ctx.save(); ctx.fillStyle=ink; ctx.globalAlpha=0.055;
        for(const lvl of SKY_MW){ ctx.beginPath(); for(const ring of lvl){ for(let i=0;i<ring.length;i+=2){ const p=P(ring[i],ring[i+1]); i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); } ctx.closePath(); } ctx.fill('evenodd'); }
        ctx.restore(); }
      else if(!ui.thumb) ensureMilkyWay();
    }
    ctx.strokeStyle=ink;
    if(st.sky.grid){ ctx.globalAlpha=0.18; ctx.lineWidth=U*0.0008;
      for(const a of [30,60]){ const q=Math.tan((90-a)*D2R/2)*R; ctx.beginPath(); ctx.arc(cx,cy,q,0,7); ctx.stroke(); }
      for(let k=0;k<8;k++){ const z=k*Math.PI/4; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx-R*Math.sin(z),cy-R*Math.cos(z)); ctx.stroke(); } }
    if(st.sky.lines){ ctx.globalAlpha=0.5; ctx.lineWidth=U*0.0011; ctx.beginPath();
      for(const l of S.lines){ let prev=null; for(const [ra,dec] of l){ const p=P(ra,dec); if(prev && (p.alt>-15 || prev.alt>-15)){ ctx.moveTo(prev.x,prev.y); ctx.lineTo(p.x,p.y); } prev=p; } }
      ctx.stroke(); }
    ctx.globalAlpha=1; ctx.fillStyle=ink;
    for(const [ra,dec,mag] of S.stars){ const p=P(ra,dec); if(p.alt<0) continue;
      const rr=U*0.0016*Math.max(0.6,(6.2-mag)*0.75); ctx.beginPath(); ctx.arc(p.x,p.y,rr,0,7); ctx.fill(); }
    if(st.sky.planets) for(const pl of planetsAt(ms)){ const p=P(pl.ra,pl.dec); if(p.alt<0) continue;
      const rr=U*0.0016*Math.max(0.6,(6.2-pl.mag)*0.75);
      ctx.beginPath(); ctx.arc(p.x,p.y,rr,0,7); ctx.fill(); ctx.save(); ctx.strokeStyle=ink; ctx.lineWidth=U*0.0007; ctx.beginPath(); ctx.arc(p.x,p.y,rr*2.1,0,7); ctx.stroke(); ctx.restore();
      drawText(ctx,pl.name,p.x+rr*2.6,p.y+U*0.003,{size:U*0.0095,italic:true,align:'left',color:ink}); }
    if(st.sky.moon){ const ml=moonSun(ms), p=P(ml.moon.ra,ml.moon.dec);
      if(p.alt>-1){ const s=P(ml.sun.ra,ml.sun.dec); drawMoon(ctx,p.x,p.y,U*0.014,ml.frac,Math.atan2(s.y-p.y,s.x-p.x),ink,bg); } }
  } else if(!S && !ui.thumb) ensureSky();
  ctx.restore();
  // horizon, points cardinaux
  ctx.strokeStyle=paint(c.frame); ctx.lineWidth=0.0022*U; ctx.beginPath(); ctx.arc(cx,cy,R+0.012*U,0,7); ctx.stroke();
  ctx.lineWidth=0.0008*U; ctx.beginPath(); ctx.arc(cx,cy,R+0.004*U,0,7); ctx.stroke();
  const cs=0.016*U, o=R+0.032*U;
  [['N',0,-1],['E',-1,0],['S',0,1],['O',1,0]].forEach(([t,dx,dy])=>drawText(ctx,t,cx+dx*o,cy+dy*o+cs*0.36,{size:cs,align:'center',color:c.text}));
}
function lum(hex){ const n=parseInt(hex.slice(1),16), f=v=>{ v/=255; return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4; }; return 0.2126*f(n>>16&255)+0.7152*f(n>>8&255)+0.0722*f(n&255); }
function contrast(a,b){ const x=lum(a), y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); }

// ---------- Couleurs dérivées ----------
/** Teinte assombrie (f : part de noir) ou éclaircie (f : part de blanc) */
const shade=(hex,f)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-f)).toString(16).padStart(2,'0')).join('');
const tint=(hex,f)=>'#'+[1,3,5].map(i=>{ const v=parseInt(hex.slice(i,i+2),16); return Math.round(v+(255-v)*f).toString(16).padStart(2,'0'); }).join('');
/** Mélange de deux teintes (t : part de b) */
const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');

// ---------- Dorure ----------
// Textes, filets et repères en dégradé métallique tiré de leur propre couleur (or, argent, cuivre…) :
// bandes de reflets en diagonale, calculées sur toute l'affiche (même rendu à l'aperçu et à l'export).
let foilCtx=null;
function foilGradient(ctx, hex, x0, y0, x1, y1, bands){
  const g=ctx.createLinearGradient(x0,y0,x1,y1), lo=shade(hex,0.45), hi=tint(hex,0.62), seq=[lo,hex,hi,hex];
  const n=bands*4; for(let i=0;i<=n;i++) g.addColorStop(i/n,seq[i%4]);
  return g;
}
/** Peinture d'un élément d'encre : la couleur, ou son dégradé doré pendant un rendu avec dorure */
function paint(color){
  if(!foilCtx || typeof color!=='string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  let g=foilCtx.cache.get(color);
  if(!g){ const {W,H}=foilCtx; g=foilGradient(document.createElement('canvas').getContext('2d'),color,0,0,W*0.7,H,6); foilCtx.cache.set(color,g); }
  return g;
}

// ---------- Autour du repère ----------
/** Rayon du halo et du quartier en relief, en px pour un cadre de largeur w */
const focusRadius=w=>(st.focusR??30)/100*w;
/** Halo du souvenir : la ville se dissout dans le papier en s'éloignant du lieu */
function drawHalo(ctx, r, view){
  const q=project(view.marker.lat,view.marker.lon,r,view), R=focusRadius(r.w), pc=hexA(st.colors.paper);
  const g=ctx.createRadialGradient(q.x,q.y,R*0.8,q.x,q.y,R*2.6);
  g.addColorStop(0,pc(0)); g.addColorStop(0.45,pc(0.6)); g.addColorStop(1,pc(0.95));
  ctx.fillStyle=g; ctx.fillRect(r.x,r.y,r.w,r.h);
}

// ---------- Ornements cartographiques ----------
const NICE_M=[10,20,25,50,100,200,250,500,1000,2000,2500,5000,10000,20000,50000];
const NICE_MIN=[0.25,0.5,1,2,5,10,15,30,60,120];   // pas des graduations, en minutes d'arc
/** Mètres par pixel au centre d'une vue (cadre de largeur w) */
const metersPerPx=(view,w)=>40075016.686*Math.cos(view.center.lat*D2R)/worldSize(w,view.zoom);
/** Plaque de papier semi-opaque sous un ornement (lisible sur la carte) */
function plate(ctx,x,y,w,h){ ctx.save(); ctx.fillStyle=hexA(st.colors.paper)(0.86); ctx.fillRect(x,y,w,h); ctx.restore(); }
function drawOrnaments(ctx, r, view, U, first){
  const o=st.orn||{}, c=st.colors, ink=paint(c.text); if(!o.scale && !o.compass && !o.grid) return;
  const sh=r.shape, cx=r.x+r.w/2;
  if(o.grid) drawGraticule(ctx,r,view,U,!sh);
  if(o.scale){
    const mpp=metersPerPx(view,r.w), want=r.w*(sh?0.26:0.2)*mpp, len=NICE_M.reduce((a,b)=>Math.abs(b-want)<Math.abs(a-want)?b:a), px=len/mpp, h=0.0055*U;
    const x0 = sh==='circle' ? cx-px/2 : sh==='heart' ? cx-px/2 : r.x+0.04*U;
    const y0 = sh==='circle' ? r.y+r.h*0.85 : sh==='heart' ? r.y+r.h*0.6 : r.y+r.h-0.042*U;
    plate(ctx,x0-0.016*U,y0-0.03*U,px+0.032*U,0.046*U);
    ctx.save(); ctx.strokeStyle=ink; ctx.lineWidth=0.001*U;
    for(let i=0;i<4;i++){ ctx.fillStyle=i%2?c.paper:ink; ctx.fillRect(x0+i*px/4,y0,px/4,h); } ctx.strokeRect(x0,y0,px,h); ctx.restore();
    const fs=0.0115*U, lab=len>=1000?`${len/1000} km`.replace('.',','):`${len} m`;
    drawText(ctx,'0',x0,y0-0.008*U,{size:fs,align:'center',color:c.text});
    drawText(ctx,lab,x0+px,y0-0.008*U,{size:fs,align:'center',color:c.text});
  }
  if(o.compass && first){
    const R=0.034*U, x = sh==='circle' ? cx : sh==='heart' ? r.x+r.w*0.74 : sh==='arch' ? cx : r.x+r.w-0.065*U,
          y = sh==='circle' ? r.y+r.h*0.15 : sh==='heart' ? r.y+r.h*0.27 : sh==='arch' ? r.y+r.w*0.16 : r.y+0.075*U;
    drawCompass(ctx,x,y,R,U);
  }
}
/** Rose des vents à huit pointes, nord marqué */
function drawCompass(ctx,x,y,R,U){
  const c=st.colors, ink=paint(c.text);
  ctx.save(); ctx.fillStyle=hexA(c.paper)(0.86); ctx.beginPath(); ctx.arc(x,y,R*1.42,0,7); ctx.fill();
  ctx.strokeStyle=ink; ctx.lineWidth=0.0008*U; ctx.lineJoin='round';
  ctx.beginPath(); ctx.arc(x,y,R*0.62,0,7); ctx.stroke(); ctx.beginPath(); ctx.arc(x,y,R*1.12,0,7); ctx.stroke();
  for(let k=0;k<16;k++){ const a=k*Math.PI/8; ctx.beginPath(); ctx.moveTo(x+Math.sin(a)*R*1.12,y-Math.cos(a)*R*1.12); ctx.lineTo(x+Math.sin(a)*R*(k%2?1.04:1.0),y-Math.cos(a)*R*(k%2?1.04:1.0)); ctx.stroke(); }
  for(const k of [1,3,5,7,0,2,4,6]){   // pointes intermédiaires d'abord, cardinales par-dessus
    const a=k*Math.PI/4, l=k%2?R*0.6:R, w=R*(k%2?0.12:0.16);
    for(const s of [-1,1]){ ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.sin(a)*l,y-Math.cos(a)*l); ctx.lineTo(x+Math.sin(a+s*Math.PI/2)*w,y-Math.cos(a+s*Math.PI/2)*w); ctx.closePath();
      ctx.fillStyle=s>0?ink:c.paper; ctx.fill(); ctx.stroke(); } }
  ctx.restore();
  drawText(ctx,'N',x,y-R*1.2,{size:0.013*U,align:'center',color:c.text});
}
const dmsShort=(v,pos,neg)=>{ const a=Math.abs(v), d=Math.floor(a+1e-9), mm=Math.round((a-d)*60*4)/4; const m=mm>=60?0:mm, dd=mm>=60?d+1:d;
  return `${dd}°${m?String(m%1?m.toFixed(2).replace(/0$/,''):m).replace('.',',').padStart(2,'0')+'′':''}${v>=0?pos:neg}`; };
/** Graduations : méridiens et parallèles à pas rond, fins et pâles ; repères et valeurs au bord d'un cadre rectangulaire */
function drawGraticule(ctx,r,view,U,ticks){
  const nw=unproject(r.x,r.y,r,view), se=unproject(r.x+r.w,r.y+r.h,r,view), span=(se.lon-nw.lon)*60;
  const step=NICE_MIN.find(s=>span/s<=5)||120, deg=step/60, c=st.colors, fs=0.0095*U, tl=0.012*U;
  const lons=[], lats=[];
  for(let v=Math.ceil(nw.lon/deg)*deg; v<se.lon; v+=deg) lons.push(v);
  for(let v=Math.ceil(se.lat/deg)*deg; v<nw.lat; v+=deg) lats.push(v);
  ctx.save(); ctx.strokeStyle=paint(c.text); ctx.lineWidth=0.0006*U; ctx.globalAlpha=0.35; ctx.setLineDash([0.006*U,0.004*U]);
  ctx.beginPath();
  for(const v of lons){ const x=project(view.center.lat,v,r,view).x; ctx.moveTo(x,r.y); ctx.lineTo(x,r.y+r.h); }
  for(const v of lats){ const y=project(v,view.center.lon,r,view).y; ctx.moveTo(r.x,y); ctx.lineTo(r.x+r.w,y); }
  ctx.stroke(); ctx.restore();
  if(!ticks) return;
  ctx.save(); ctx.strokeStyle=paint(c.text); ctx.lineWidth=0.0012*U; ctx.beginPath();
  for(const v of lons){ const x=project(view.center.lat,v,r,view).x; ctx.moveTo(x,r.y); ctx.lineTo(x,r.y+tl); ctx.moveTo(x,r.y+r.h); ctx.lineTo(x,r.y+r.h-tl); }
  for(const v of lats){ const y=project(v,view.center.lon,r,view).y; ctx.moveTo(r.x,y); ctx.lineTo(r.x+tl,y); ctx.moveTo(r.x+r.w,y); ctx.lineTo(r.x+r.w-tl,y); }
  ctx.stroke(); ctx.restore();
  for(const v of lons){ const x=project(view.center.lat,v,r,view).x; drawText(ctx,dmsShort(v,'E','O'),x+0.004*U,r.y+tl+fs*1.1,{size:fs,align:'left',color:c.text}); }
  for(const v of lats){ const y=project(v,view.center.lon,r,view).y; drawText(ctx,dmsShort(v,'N','S'),r.x+tl+0.004*U,y-0.004*U,{size:fs,align:'left',color:c.text}); }
}

// ---------- Gabarit « Lettres » : le nom de la ville découpé dans la carte ----------
// La carte n'apparaît pleinement qu'à travers les lettres du titre ; ailleurs, un voile de papier la laisse deviner.
const TYPO_ROWS=['subtitle','coords','dedication','names','date','legend'];
const TYPO_VEIL=0.9;
/** Lignes et taille des lettres : une ligne, ou un mot par ligne si les lettres y gagnent en taille */
function typoFit(ctx, title, r){
  const F=fontOf('title'), sp=0.03, words=title.split(/\s+/).filter(Boolean);
  const opts=[[title]]; if(words.length>1) opts.push(words);
  let best=null;
  for(const lines of opts){
    ctx.font=fontStr(100,{role:'title',key:'title'});
    const wMax=Math.max(...lines.map(l=>textW(ctx,l,sp,100)));
    const size=Math.min(r.w*0.92/wMax*100, r.h*0.86/(lines.length*0.86)/(F.scale||1));
    if(!best || size>best.size) best={lines,size};
  }
  return {...best,sp};
}
function drawLetters(ctx, g){
  const r=g.map, U=g.U, c=st.colors, t=(textLine('title')||'').toUpperCase();
  const w=Math.max(1,Math.ceil(r.w)), h=Math.max(1,Math.ceil(r.h));
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h; const m=cv.getContext('2d');
  m.fillStyle=hexA(c.paper)(TYPO_VEIL); m.fillRect(0,0,w,h);
  if(t){
    const f=typoFit(m,t,r), F=fontOf('title'), lh=f.size*(F.scale||1)*0.86, n=f.lines.length;
    const font=fontStr(f.size,{role:'title',key:'title'});
    m.font=font; m.textBaseline='alphabetic'; m.textAlign='left';
    const cap=lh*0.82, y0=h/2-(n*lh)/2+cap;   // lignes centrées sur la hauteur des capitales
    const lines=f.lines.map((l,i)=>{ const lw=textW(m,l,f.sp,f.size); return {l,x:(w-lw)/2,y:y0+i*lh}; });
    m.globalCompositeOperation='destination-out';
    const each=(fn)=>{ for(const L of lines) CMS.glyphs.each(m,L.l,L.x,f.sp*f.size,(g,x)=>fn(g,x,L.y)); };
    each((ch,x,y)=>m.fillText(ch,x,y));
    ctx.drawImage(cv,r.x,r.y,w,h);
    ctx.save(); ctx.font=font; ctx.textBaseline='alphabetic'; ctx.textAlign='left'; ctx.strokeStyle=paint(c.frame); ctx.lineWidth=0.0014*U; ctx.lineJoin='round';
    for(const L of lines) CMS.glyphs.each(m,L.l,L.x,f.sp*f.size,(g,x)=>ctx.strokeText(g,r.x+x,r.y+L.y));
    ctx.restore();
  } else ctx.drawImage(cv,r.x,r.y,w,h);
  cv.width=cv.height=0;
}

// ---------- Rendu de l'affiche (aperçu ET export) ----------
/** pass: 'under' (papier, ciel) | 'over' (tout ce qui est au-dessus de la carte) | 'all'.
 *  mapFn(ctx, rect, view, index) dessine la carte d'une vue (export : une ou deux vues). */
function drawPoster(ctx, W, H, pass, mapFn){
  foilCtx = st.fx?.foil ? {W,H,cache:new Map()} : null;   // dorure : dégradés propres à ce rendu
  try{ return drawPosterAt(ctx,W,H,pass,mapFn); } finally{ foilCtx=null; ui.textFx=null; ui.textHide=null; }
}
function drawPosterAt(ctx, W, H, pass, mapFn){
  const c=st.colors, g=geom(st,W,H), m=g.m, U=g.U, r=g.map;
  if(g.mix){ CMS.illus.drawMix(ctx,W,H,pass,g,mapFn); return g; }   // carte + illustration (js/illus.js)
  if(g.illus){ CMS.illus.draw(ctx,W,H,pass,g); return g; }   // modes illustrés : image importée et textes (js/illus.js)
  if(pass!=='over'){ ctx.fillStyle=c.paper; ctx.fillRect(0,0,W,H); if(g.sky) drawSky(ctx,g.sky,U); }
  if(pass==='all' && mapFn) g.places.forEach((p,i)=>{ ctx.save(); clipMap(ctx,p.rect); ctx.fillStyle=c.land; ctx.fillRect(p.rect.x,p.rect.y,p.rect.w,p.rect.h); mapFn(ctx,p.rect,p.view,i); ctx.restore(); });
  if(pass==='under') return g;

  const lay=st.layout;
  // Fondu
  if(lay==='fade'){
    const pc=hexA(c.paper);
    if(!g.land){
      let gr=ctx.createLinearGradient(0,r.h*0.62,0,r.h); gr.addColorStop(0,pc(0)); gr.addColorStop(1,pc(1));
      ctx.fillStyle=gr; ctx.fillRect(0,r.h*0.62,W,r.h*0.38+1);
      const sw=m*1.6;
      gr=ctx.createLinearGradient(0,0,sw,0); gr.addColorStop(0,pc(1)); gr.addColorStop(1,pc(0)); ctx.fillStyle=gr; ctx.fillRect(0,0,sw,r.h);
      gr=ctx.createLinearGradient(W,0,W-sw,0); gr.addColorStop(0,pc(1)); gr.addColorStop(1,pc(0)); ctx.fillStyle=gr; ctx.fillRect(W-sw,0,sw,r.h);
      gr=ctx.createLinearGradient(0,0,0,sw); gr.addColorStop(0,pc(1)); gr.addColorStop(1,pc(0)); ctx.fillStyle=gr; ctx.fillRect(0,0,W,sw);
    } else {
      let gr=ctx.createLinearGradient(r.w*0.62,0,r.w,0); gr.addColorStop(0,pc(0)); gr.addColorStop(1,pc(1));
      ctx.fillStyle=gr; ctx.fillRect(r.w*0.62,0,r.w*0.38+1,H);
      const sw=m*1.6;
      for(const [x0,y0,x1,y1,rx,ry,rw,rh] of [[0,0,sw,0,0,0,sw,H],[0,0,0,sw,0,0,r.w,sw],[0,H,0,H-sw,0,H-sw,r.w,sw]]){
        gr=ctx.createLinearGradient(x0,y0,x1,y1); gr.addColorStop(0,pc(1)); gr.addColorStop(1,pc(0)); ctx.fillStyle=gr; ctx.fillRect(rx,ry,rw,rh); }
    }
  }
  // Autour du repère et ornements, sous les repères
  if(st.fx?.halo) for(const p of g.places){ ctx.save(); clipMap(ctx,p.rect); drawHalo(ctx,p.rect,p.view); ctx.restore(); }
  if(lay==='typo') drawLetters(ctx,g);
  g.places.forEach((p,i)=>{ ctx.save(); clipMap(ctx,p.rect); drawOrnaments(ctx,p.rect,p.view,U,i===0); ctx.restore(); });
  // Repères (et itinéraires) de chaque vue
  for(const p of g.places){ ctx.save(); clipMap(ctx,p.rect); drawMarkers(ctx,p.rect,p.view,U,W,p.main); ctx.restore(); }

  // Filets & textes : style des textes (#74) ; blocs sortis du gabarit (#75) retirés de celui-ci, dessinés à la fin
  const mv=CMS.illus.mapMoved();
  ui.textFx={...CMS.illus.textStyle()};
  ui.textHide=new Set([...(mv.title?['title','subtitle']:[]),...(mv.foot?['dedication','names','date','coords']:[])]);
  if(lay==='souvenir' && !g.land){
    const yH=m+0.061*U, inner=W-2*m;
    const title=textLine('title'), date=textLine('date'), coords=textLine('coords'), hs=0.031*U;
    // En-tête : « Titre - Date », chaque partie à sa taille et dans sa police, sur une même ligne de base
    const same=tScale('title')===tScale('date') && fontKey('title')===fontKey('','date') && !ui.textFx?.vint;   // Vintage : titre dans sa police
    const left = title&&date&&same ? [{t:title+' - '+date,size:hs*tScale('title'),keys:['title','date']}]
               : title&&date ? [{t:title,size:hs*tScale('title'),key:'title',role:'title'},{t:' - ',size:hs*Math.min(tScale('title'),tScale('date'))},{t:date,size:hs*tScale('date'),key:'date'}]
               : [{t:title||date,size:hs*tScale(title?'title':'date'),key:title?'title':'date',role:title?'title':''}];
    drawRun(ctx,left,m,yH,{align:'left',color:c.text,maxW:inner*(coords?0.58:1)});
    drawText(ctx,coords,W-m,yH,{size:0.026*U*tScale('coords'),key:'coords',align:'right',color:c.text,maxW:inner*(title||date?0.4:1)});
    // Pied : dédicace (sur une ou deux lignes, cf. souvenirFoot) | noms, alignés sur la ligne de base du bas
    const yF=H-m-0.0195*U, P=souvenirFoot(W,U,m), {ded,names}=P, n=P.L.lines.length;
    const dedAt=(sz,maxW)=>P.L.lines.forEach((l,i)=>drawText(ctx,l,m,yF-(n-1-i)*P.lh*U,{size:sz,key:'dedication',align:'left',color:c.text,maxW}));
    if(names && ded){
      // Dédicace | Noms : s'ils dépassent la largeur, les deux sont réduits du même facteur (les tailles choisies gardent leur rapport)
      const f=P.f; noteFit('dedication',f); noteFit('names',f);
      dedAt(P.ds*U*f);
      const bx=m+P.L.w*U*f+0.032*U;
      ctx.strokeStyle=paint(c.frame); ctx.lineWidth=0.0018*U; ctx.beginPath(); ctx.moveTo(bx,yF-0.04*U-(n-1)*P.lh*U); ctx.lineTo(bx,yF+0.004*U); ctx.stroke();
      drawText(ctx,names,bx+0.03*U,yF-0.008*U,{size:P.ns*U*f,italic:true,align:'left',color:c.text,key:'names'});
    } else if(ded){
      dedAt(P.ds*U,P.inner*U);
    } else if(names){
      drawText(ctx,names,m,yF-0.008*U,{size:P.ns*U,key:'names',italic:true,align:'left',color:c.text,maxW:P.inner*U});
    }
  } else if(lay==='diptych'){
    drawText(ctx,textLine('title'),W/2,g.title.y,{size:0.06*U*tScale('title'),spacing:0.15,upper:true,role:'title',key:'title',align:'center',color:c.text,maxW:W-2*m});
    const views=[], A=st.active||0; views[A]=st; views[1-A]=st.place2||st;
    g.rects.forEach((rc,i)=>{ ctx.strokeStyle=paint(c.frame); ctx.lineWidth=0.0018*U; ctx.strokeRect(rc.x,rc.y,rc.w,rc.h);
      const lab=textLine('label'+(i+1)), co=placeCoordText(views[i].marker);
      drawText(ctx,lab,rc.x,g.labels[i],{size:0.03*U*tScale('dedication'),italic:true,key:'label'+(i+1),align:'left',color:c.text,maxW:rc.w*(co?0.6:1)});
      if(st.show.coords!==false) drawText(ctx,co,rc.x+rc.w,g.labels[i],{size:0.015*U*tScale('coords'),spacing:0.08,align:'right',color:c.text,maxW:rc.w*(lab?0.38:1)}); });
    drawCartouche(ctx,U,{...g.text,rows:CART_ROWS,only:['subtitle','dedication','names','date']});
  } else if(g.box){
    drawTravelText(ctx,U,g.box);
  } else {
    if(lay==='classic'){
      ctx.strokeStyle=paint(c.frame);
      ctx.lineWidth=0.0025*U; const o1=0.014*U; ctx.strokeRect(r.x-o1,r.y-o1,r.w+2*o1,r.h+2*o1);
      ctx.lineWidth=0.0009*U; const o2=0.006*U; ctx.strokeRect(r.x-o2,r.y-o2,r.w+2*o2,r.h+2*o2);
    } else if(['medallion','heart','arch'].includes(lay) && st.ring){
      ctx.strokeStyle=paint(c.frame); ctx.lineWidth=0.0022*U; strokeShape(ctx,r,0.014*U);
      ctx.lineWidth=0.0008*U; strokeShape(ctx,r,0.006*U);
    } else if(lay==='polaroid'){
      ctx.strokeStyle=hexA(c.text)(0.18); ctx.lineWidth=0.0012*U; ctx.strokeRect(r.x,r.y,r.w,r.h);
    } else if(lay==='sky'){
      ctx.strokeStyle=paint(c.frame); ctx.lineWidth=0.0012*U; ctx.strokeRect(r.x,r.y,r.w,r.h);
    }
    drawCartouche(ctx,U,{...g.text,rows:lay==='polaroid'?POLA_ROWS:CART_ROWS,only:lay==='typo'?TYPO_ROWS:null});
  }
  ui.textFx=null; ui.textHide=null;
  CMS.illus.drawMapTexts(ctx,W,H,U,mv,g);
  // Attributions (ODbL, CC-BY 4.0) : la mention minimale est toujours inscrite ; la case « Mention complète » l'étend
  ctx.globalAlpha=0.55;
  drawText(ctx,attributionText(!!g.sky),W-m,H-m*0.38,{size:0.0085*U,align:'right',color:c.text,ink:'attribution'});
  ctx.globalAlpha=1;
  return g;
}
/** Mention de l'affiche : minimale (toujours), complète si st.attribution */
function attributionText(sky){
  const gpu=st.engine==='maplibre';
  if(!st.attribution) return '© OpenStreetMap'+(gpu?' · © OpenMapTiles':'');
  return '© contributeurs OpenStreetMap'+(gpu?' · OpenFreeMap © OpenMapTiles':'')+(sky?' · Ciel : d3-celestial (XHIP)':'');
}
function hexA(hex){const n=parseInt(hex.slice(1),16);const r=n>>16&255,g=n>>8&255,b=n&255;return a=>`rgba(${r},${g},${b},${a})`}
