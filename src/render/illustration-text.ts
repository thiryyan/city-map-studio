/* City Map Studio — Mise en page des textes des modes illustrés : lignes, blocs, présentations, arcs (extrait de features/illustration.ts, #119). */
import {sortLines} from '../core/order.js';
import {FONTS, illusConf as C} from '../content/config.js';
import {dedLeading, dedLines, drawText, fontOf, fontStr, noteFit, tScale, textW} from './poster-text.js';
import {clamp, textLine} from '../core/geo/geo.js';
import {st} from '../core/scene.js';
import {contrast} from '../core/color.js';
import {Ctx, Opts, Part, Txt, present} from '../core/illustration-state.js';

// ---------- Textes des modes illustrés : mise en page des deux blocs (titre, bas), commune au rendu, aux zones de prise et au prompt ----------
// Bloc de titre (titre + sous-titre) : 9 positions (pos) ou position libre (free). Bloc du bas (dédicace, noms, date et
// coordonnées) : « Auto » (côté opposé au titre, centré), 9 positions (fpos) ou position libre (ffree). Position libre :
// centre du bloc en fraction de la zone des textes ; alignement des lignes selon le tiers (gauche, centre, droite).
export const third=(v: number)=>v<1/3 ? 0 : v>2/3 ? 2 : 1;
export const rowOf=(y: number)=>'hmb'[third(y)], colOf=(x: number)=>'gcd'[third(x)];
/** Largeur dessinée d'une ligne (mêmes règles que drawText : capitales, interlettrage, réduction à maxW) */
export function measure(ctx: Ctx, t: string, o: Opts){
  if(!t) return 0;
  const F=o.fk ? FONTS[o.fk] : fontOf(o.role,o.key); if(o.upper && !F.script) t=t.toUpperCase();
  ctx.save(); ctx.font=fontStr(o.size,o); const w=textW(ctx,t,F.script?0:(o.spacing||0),o.size); ctx.restore();
  return Math.min(w,o.maxW||Infinity);
}
/** Ligne composée (date · coordonnées, #77) : t est une liste de morceaux [texte, options] posés sur la même ligne de base,
 *  chacun à sa taille ; l'ensemble est réduit d'un même facteur pour tenir dans o.maxW. Sinon t est un texte. */
export function measureLine(ctx: Ctx, t: Txt, o: Opts): number {
  if(!Array.isArray(t)) return measure(ctx,t,o);
  const w=t.reduce((a: number,[x,po])=>a+measure(ctx,x,{...po,maxW:undefined}),0);
  return Math.min(w,o.maxW||Infinity);
}
/** Dessine une ligne (texte, ou morceaux d'une ligne composée) ; o.align : alignement de l'ensemble sur x */
export function drawLine(ctx: Ctx, t: Txt, x: number, y: number, o: Opts){
  if(!Array.isArray(t)){ drawText(ctx,t,x,y,o); return; }
  const ws=t.map(([s,po])=>measure(ctx,s,{...po,maxW:undefined})), tot=ws.reduce((a,b)=>a+b,0), k=Math.min(1,(o.maxW||Infinity)/(tot||1));
  if(k<1) noteFit(o.key,k);
  let sx=o.align==='center' ? x-tot*k/2 : o.align==='right' ? x-tot*k : x;
  t.forEach(([s,po],i)=>{ drawText(ctx,s,sx,y,{...o,...po,size:po.size*k,align:'left',maxW:undefined}); sx+=ws[i]*k; });
}
/** Ligne « date · coordonnées » des modes illustrés : chaque partie à sa propre taille (réglages Taille de la date et des coordonnées) */
export function infoLine(U: number, base: number, o: Opts): {t: Txt; o: Opts} | null {
  const d=textLine('date'), c=textLine('coords');
  const od={...o,key:'date',size:base*U*tScale('date')}, oc={...o,key:'coords',size:base*U*tScale('coords')};
  if(d && c) return {t:sortLines(['date','coords'],st)[0]==='coords' ? [[c,oc],['  ·  ',od],[d,od]] : [[d,od],['  ·  ',od],[c,oc]], o:{...od,size:Math.max(od.size,oc.size)}};
  return d ? {t:d,o:od} : c ? {t:c,o:oc} : null;
}
/** Lignes du bloc du bas, communes à toutes les mises en page des modes illustrés (et aux blocs sortis du gabarit en mode Carte) :
 *  dédicace (une ou deux lignes, réglage dedWrap, comme les gabarits), noms, date · coordonnées, légende des lieux numérotés.
 *  Tailles de base en U ; renvoie [{t, o, lead}] (lead : hauteur de ligne). */
export function footRows(U: number, maxW: number, sizes?: Opts){
  const S={dedication:0.034,names:0.026,info:0.017,legend:0.014,...sizes}, G: Record<string, {t: Txt; o: Opts; lead: number}[]>={}, lead=(sz: number)=>sz*1.55;
  const ded=textLine('dedication');
  if(ded){ const sz=S.dedication*U*tScale('dedication'), L=dedLines(ded,sz/U,maxW/U,{italic:true});
    G.dedication=L.lines.map((t: string,i: number)=>({t,o:{italic:true,key:'dedication',size:sz},lead:i ? dedLeading(sz/U)*U : lead(sz)})); }
  const names=textLine('names');
  if(names){ const sz=S.names*U*tScale('names'); G.names=[{t:names,o:{italic:true,key:'names',size:sz},lead:lead(sz)}]; }
  const info=infoLine(U,S.info,{spacing:0.2}), ik=sortLines(['date','coords'],st)[0];   // ligne date · coordonnées : rang de la première des deux
  if(info) G[ik]=[{...info,lead:lead(info.o.size)}];
  const leg=textLine('legend');
  if(leg){ const sz=S.legend*U; G.legend=[{t:leg,o:{spacing:0.06,key:'legend',size:sz},lead:lead(sz)}]; }
  return sortLines(['dedication','names',ik,'legend'],st).flatMap((k: string)=>G[k]||[]);
}
/** Gabarits du bloc du bas (#90) : Ligne unique, Souvenir, Carnet, Colonnes. Lignes [{t, o, at, x?, al?}] : x depuis le bord
 *  gauche du contenu, al : alignement propre ; rules : filets [{x1, y1, x2, y2}]. La légende des lieux numérotés suit, alignée
 *  sur le bloc. Renvoie {lines, w, h, rules} (null : aucune ligne). sk : contour des lettres (null sur une plaque). */
export function footTpl(ctx: Ctx, U: number, mw: number, tpl: string, sk: Opts | null){
  const tx=(k: string)=>textLine(k), sz=(k: string,b: number)=>b*U*tScale(k), lines: Opts[]=[], rules: Opts[]=[], W_=(t: Txt,o: Opts)=>measureLine(ctx,t,{...o,maxW:undefined});
  const od=(b: number)=>({italic:true,key:'dedication',size:sz('dedication',b),stroke:sk}), on=(b: number)=>({italic:true,key:'names',size:sz('names',b),stroke:sk});
  const oi=(k: string,b: number)=>({key:k,spacing:0.2,size:sz(k,b),stroke:sk});
  const ded=tx('dedication'), names=tx('names'), date=tx('date'), coords=tx('coords');
  let w=0, h=0;
  if(tpl==='ligne'){   // tout sur une ligne, dans l'ordre des lignes choisi, réduite pour tenir
    const P: Record<string, Part | ''>={dedication:ded && [ded,od(0.022)], names:names && [names,on(0.022)], date:date && [date,oi('date',0.015)], coords:coords && [coords,oi('coords',0.015)]};
    const parts=present(sortLines(['dedication','names','date','coords'],st).map((k: string)=>P[k]));
    if(parts.length){ const t: Part[]=[], sep=oi('date',0.015);
      parts.forEach((p,i)=>{ if(i) t.push(['   ·   ',{...sep,key:''}]); t.push(p); });
      const big=Math.max(...parts.map(p=>p[1].size)); h=big*1.15;
      lines.push({t,at:big*0.85,o:{size:big,maxW:mw,key:parts[0][1].key,stroke:sk}}); w=Math.min(mw,W_(t,{})); }
  } else if(tpl==='pile'){   // chaque information sur sa propre ligne, dans l'ordre choisi (la date et les coordonnées ne sont pas réunies)
    const P: Record<string, Part | ''>={dedication:ded && [ded,od(0.024)], names:names && [names,on(0.02)], date:date && [date,oi('date',0.015)], coords:coords && [coords,oi('coords',0.015)]};
    let y=0; for(const [t,o] of present(sortLines(['dedication','names','date','coords'],st).map((k: string)=>P[k]))){
      const q: Opts={...o,maxW:mw}; y+=q.size*(y ? 1.4 : 0.85); lines.push({t,at:y,o:q}); w=Math.max(w,W_(t,q)); }
    w=Math.min(w,mw); h=y+0.008*U;
  } else if(tpl==='souvenir'){   // dédicace | noms à gauche ; date sur coordonnées à droite
    const L=present(sortLines(['dedication','names'],st).map((k: string)=>k==='dedication' ? ded && [ded,od(0.03)] : names && [names,on(0.022)]));
    const R=present(sortLines(['date','coords'],st).map((k: string)=>k==='date' ? date && [date,oi('date',0.015)] : coords && [coords,oi('coords',0.015)]));
    const g=0.028*U, G=0.05*U, wl=L.map(([t,o])=>W_(t,o)), wr=Math.max(0,...R.map(([t,o])=>W_(t,o)));
    const need=wl.reduce((a,b)=>a+b,0)+(L.length>1 ? 2*g : 0)+(R.length && L.length ? G+wr : wr);
    const f=Math.min(1,mw/Math.max(need,1)); if(f<1) for(const [,o] of [...L,...R]){ o.size*=f; noteFit(o.key,f); }
    const rs=R.length ? R[0][1].size : 0, capL=Math.max(0,...L.map(([,o])=>o.size*0.8));
    const yb=Math.max(capL,R.length ? rs*0.8+(R.length-1)*rs*1.55 : 0);
    let x=0; L.forEach(([t,o],i)=>{ if(i){ rules.push({x1:x+g,x2:x+g,y1:yb-capL,y2:yb+o.size*0.2}); x+=2*g; } lines.push({t,at:yb,x,al:'left',o}); x+=wl[i]*f; });
    R.forEach(([t,o],i: number)=>lines.push({t,at:rs*0.8+i*rs*1.55+(yb-(rs*0.8+(R.length-1)*rs*1.55)),x:mw,al:'right',o}));
    w=R.length ? mw : Math.min(mw,x); h=yb+Math.max(rs,...L.map(([,o])=>o.size))*0.3;
  } else if(tpl==='carnet'){   // aligné à gauche : noms en grand, filet court, dédicace, date · coordonnées
    let y=0;
    if(names){ const o={...on(0.042),maxW:mw}; y+=o.size*0.85; lines.push({t:names,at:y,x:0,al:'left',o}); w=Math.max(w,W_(names,o)); y+=0.022*U; rules.push({x1:0,x2:0.08*U,y1:y,y2:y}); y+=0.02*U; w=Math.max(w,0.08*U); }
    if(ded){ const o={...od(0.024),maxW:mw}; y+=o.size*0.85; lines.push({t:ded,at:y,x:0,al:'left',o}); w=Math.max(w,W_(ded,o)); y+=o.size*0.6; }
    const info=infoLine(U,0.015,{spacing:0.2}); if(info){ const o: Opts={...info.o,maxW:mw,stroke:sk}; y+=o.size*1.1; lines.push({t:info.t,at:y,x:0,al:'left',o}); w=Math.max(w,W_(info.t,o)); }
    w=Math.min(w,mw); h=y+0.006*U;
  } else if(tpl==='colonnes'){   // date | dédicace et noms | coordonnées
    const C=present([ded && [ded,{...od(0.026),maxW:mw*0.5}], names && [names,{...on(0.02),maxW:mw*0.5}]]);
    let y=0; for(const [t,o] of C){ y+=o.size*(y ? 1.4 : 0.85); lines.push({t,at:y,x:mw/2,al:'center',o}); }
    const side=[date && [date,{...oi('date',0.015),maxW:mw*0.24},0,'left'], coords && [coords,{...oi('coords',0.015),maxW:mw*0.24},mw,'right']].filter(Boolean) as [string, Opts, number, string][];
    const yb=y || Math.max(0,...side.map(([,o])=>o.size*0.85));
    for(const [t,o,x,al] of side) lines.push({t,at:yb,x,al,o});
    w=mw; h=Math.max(yb,y)+0.008*U;
  }
  if(!lines.length) return null;
  const leg=textLine('legend');
  if(leg){ const o: Opts={spacing:0.06,key:'legend',size:0.014*U,maxW:mw,stroke:sk}; h+=o.size*1.6; lines.push({t:leg,at:h-o.size*0.3,o}); }
  return {lines,w,h,rules};
}
/** Rangée d'une ligne : lignes [{t, o, at}] (at : ligne de base depuis le haut du bloc) → bloc {lines, w, h} */
export function blockOf(ctx: Ctx, lines: Opts[], h: number){ return {lines, w:Math.max(0,...lines.map(l=>measureLine(ctx,l.t,l.o))), h}; }
/** Place un bloc : position prédéfinie (row, col) avec ses marges, ou centre libre {x, y} ; renvoie {left, top, align} */
export function placeBlock(b: Opts, W: number, H: number, m: number, spec: Opts, kind: string){
  let left: number, top: number, align: string;
  if(spec.free){
    const cx=b.w>=W ? W/2 : clamp(spec.free.x*W,b.w/2,W-b.w/2), cy=b.h>=H ? H/2 : clamp(spec.free.y*H,b.h/2,H-b.h/2);
    left=cx-b.w/2; top=cy-b.h/2; align=['left','center','right'][third(spec.free.x)];
  } else {
    const [row,col]=spec.pos;
    top = kind==='title' ? (row==='h' ? 0.065*H : row==='m' ? (H-b.h)/2 : H-0.075*H-b.h)
                         : (row==='h' ? 0.05*H : row==='m' ? (H-b.h)/2 : H-0.045*H-b.h);
    align=col==='g' ? 'left' : col==='d' ? 'right' : 'center';
    left=col==='g' ? m : col==='d' ? W-m-b.w : (W-b.w)/2;
  }
  const ax=align==='left' ? left : align==='right' ? left+b.w : left+b.w/2;
  return {left, top, align, ax, rect:{x:left,y:top,w:b.w,h:b.h}};
}
/** Position effective (ligne, colonne) d'un bloc, pour le prompt et le bloc du bas « Auto » */
export const titleRC=(T: Opts): string=>T.free ? rowOf(T.free.y)+colOf(T.free.x) : T.pos;
export const footSpec=(T: Opts): Opts=>T.ffree ? {free:T.ffree} : {pos:T.fpos==='auto' ? (titleRC(T)[0]==='b' ? 'hc' : 'bc') : T.fpos};
export const footRC=(T: Opts): string=>T.ffree ? rowOf(T.ffree.y)+colOf(T.ffree.x) : footSpec(T).pos;
/** Zone d'un bloc : en Carte + illustration, l'illustration (la bande de la vignette), la carte ou toute l'affiche */
export const zoneOf=(k: string,s=st): string=>s.mode==='mix' ? ((s.illusText.mix.zone as Record<string, string>)?.[k]||'illus') : 'illus';
/** Forme de carte autour de laquelle le titre peut se courber (Arc) : cercle ou arche, sinon null */
export function arcShape(s=st){
  if(s.mode==='mix') return s.mix.compo==='med' && ['circle','arch'].includes(s.mix.shape) ? s.mix.shape : null;
  if(s.mode==='map') return ({medallion:'circle',arch:'arch'} as Record<string, string>)[s.layout]||null;
  return null;
}
/** Pourquoi une présentation est sans objet ici ('' : elle s'applique) */
export function decoWhy(k: string, d: string, s=st){
  if(!d || d==='libre') return '';
  if(k==='foot' && !C.FOOT_DECOS.includes(d)) return 'réservée au titre';
  if(s.mode==='map' && !(mapMoved(s) as Record<string, boolean>)[k]) return s.layout==='typo' && k==='title' ? 'le titre forme la carte du gabarit Lettres'
    : k==='title' ? 'le titre est dans le gabarit' : 'les lignes du bas sont dans le gabarit';
  if(s.mode==='mix' && s.mix.compo==='vig' && zoneOf(k,s)==='illus') return 'la bande de la vignette garde le texte seul';
  if(d==='arc' && !arcShape(s)) return s.mode==='map' ? 'seulement avec les gabarits Médaillon et Arche' : 'seulement autour d’un médaillon rond ou en arche';
  return '';
}
/** Présentation appliquée : celle choisie, ou le texte seul quand elle est sans objet (le choix est gardé) */
export const decoOf=(k: string,s=st)=>{ const d=(posOf(s).deco as Record<string, string>)?.[k]||'libre'; return decoWhy(k,d,s) ? 'libre' : d; };
// marges intérieures (en U) : horizontale, verticale ; multipliées par l'éloignement du trait (st.illusText.plate.gap, #90)
export const PADS: Record<string, number[]>={cartouche:[0.06,0.045], bandeau:[0,0.04], etiquette:[0.075,0.045], capsule:[0.06,0.03], filets:[0.012,0.04]};
/** Encre des plaques (cartouche, bandeau, étiquette, capsule, cachet) : couleur des lettres si elle se lit à 4,5:1 sur le papier, sinon Texte du thème */
export function plateInk(col: string, bg?: string){
  const p=bg||st.colors.paper;
  for(const x of [col,st.colors.text]) if(/^#[0-9A-Fa-f]{6}$/.test(x||'') && contrast(x,p)>=4.5) return x;
  return contrast('#000000',p)>=contrast('#FFFFFF',p) ? '#000000' : '#FFFFFF';
}
/** Lettres d'un texte le long d'un cercle (centre cx, cy ; r : rayon de la ligne de base). En haut, les lettres montent vers
 *  l'extérieur ; en bas, elles restent debout, tournées vers le centre. Réduit pour tenir dans l'angle maxA. */
export function arcLayout(ctx: Ctx, t: string, cx: number, cy: number, r: number, top: boolean, o: Opts, maxA: number){
  if(!t || r<=0) return null;
  const F=o.fk ? FONTS[o.fk] : fontOf(o.role,o.key); if(o.upper && !F.script) t=t.toUpperCase();
  const chars=[...t], sp=F.script ? 0 : (o.spacing||0);
  const widths=(size: number)=>{ ctx.save(); ctx.font=fontStr(size,o); const w=chars.map(c=>ctx.measureText(c).width+sp*size); ctx.restore(); return w; };
  let size=o.size, ws=widths(size), tot=ws.reduce((a,b)=>a+b,0)-sp*size;
  if(tot>maxA*r){ const k=maxA*r/tot; noteFit(o.key,k); size*=k; ws=widths(size); tot=ws.reduce((a,b)=>a+b,0)-sp*size; }
  const glyphs: Opts[]=[], cap=size*0.75; let s=0, x1=Infinity, y1=Infinity, x2=-Infinity, y2=-Infinity;
  chars.forEach((c,i)=>{
    const a=(s+(ws[i]-sp*size)/2-tot/2)/r, th=top ? -Math.PI/2+a : Math.PI/2-a, x=cx+r*Math.cos(th), y=cy+r*Math.sin(th), r2=top ? r+cap : r-cap;
    glyphs.push([c,x,y,top ? th+Math.PI/2 : th-Math.PI/2]);
    for(const [qx,qy] of [[x,y],[cx+r2*Math.cos(th),cy+r2*Math.sin(th)]]){ x1=Math.min(x1,qx); y1=Math.min(y1,qy); x2=Math.max(x2,qx); y2=Math.max(y2,qy); }
    s+=ws[i];
  });
  const pad=size*0.35;
  return {glyphs, o:{...o,size,spacing:0,upper:false,maxW:undefined,align:'center'}, box:{x:x1-pad,y:y1-pad,w:x2-x1+2*pad,h:y2-y1+2*pad}};
}
export const union=(boxes: (Opts | null | undefined)[])=>{ const B=boxes.filter(Boolean) as Opts[]; if(!B.length) return null;
  const x=Math.min(...B.map((b: Opts)=>b.x)), y=Math.min(...B.map((b: Opts)=>b.y)); return {x, y, w:Math.max(...B.map((b: Opts)=>b.x+b.w))-x, h:Math.max(...B.map((b: Opts)=>b.y+b.h))-y}; };
/** Mise en page des deux blocs dans une zone W × H (coordonnées de la zone). env : map (cadre de la carte dans la zone, pour
 *  l'arc), halo (zone sur la carte : « Auto » remplace l'ombre par un contour couleur papier). Chaque bloc porte sa
 *  présentation (deco), son rectangle de prise (rect) et le rectangle de sa plaque (box). */
export function textLayout(ctx: Ctx, W: number, H: number, U: number, over: Opts | null, env: Opts={}): Opts {
  const T={...textStyle(),...posOf(),...(over||{})}, m=Math.min(0.06*U,0.1*Math.min(W,H)), vint=T.vint, maxW=W-2*m;
  let haloK=1;
  if(env.halo && st.illusText.shadow==='auto'){ T.shadow=''; if(!T.outline){ T.outline=st.colors.paper; haloK=2.5; } }
  const shadow=T.shadow ? {color:T.shadow, dx:T.off*0.0016*U, dy:T.off*0.0016*U} : null;
  const stroke=(w: number)=>T.outline ? {color:T.outline, w:Math.max(1,w*U*haloK)} : null;
  const title=textLine('title'), sub=textLine('subtitle');
  const k=Math.min(1,W/U), ts=(vint?0.2:0.11)*U*k*tScale('title'), ss=0.024*U*tScale('subtitle'), gap=0.03*U;   // zone étroite (côte à côte) : titre réduit
  const capT=ts*(vint?0.84:0.72), capS=ss*0.75;
  const dT=decoOf('title'), dF=decoOf('foot'), pg=st.illusText.plate?.gap||1, pad=(d: string)=>(PADS[d]||[0,0]).map((v: number)=>v*U*pg);
  // flat : sur une plaque, ni ombre ni contour
  const titleBlock=(mw: number,flat: boolean)=>{
    const tl: Opts[]=[], sh=flat ? null : shadow, sk=(w: number)=>flat ? null : stroke(w); let y=0;
    const it: Opts={title:title && {t:title,cap:capT,o:{size:ts,spacing:vint?0.03:0.12,upper:true,role:'title',key:'title',fk:vint?'bebas':undefined,maxW:mw,shadow:sh,stroke:sk(0.004)}},
      subtitle:sub && {t:sub,cap:capS,o:{size:ss,spacing:0.3,upper:true,key:'subtitle',maxW:mw,stroke:sk(0.0012),shadow:sh && {color:sh.color,dx:sh.dx*0.3,dy:sh.dy*0.3}}}};
    sortLines(['title','subtitle'],st).filter((k: string)=>it[k]).forEach((k: string,i: number)=>{ if(i) y+=gap; y+=it[k].cap; tl.push({t:it[k].t,at:y,o:it[k].o}); });   // ordre des lignes choisi
    return blockOf(ctx,tl,y);
  };
  const footBlock=(mw: number,flat: boolean)=>{
    const sk=flat ? null : stroke(0.001), tpl=T.ftpl||'classique';
    if(tpl!=='classique'){ const b=footTpl(ctx,U,mw,tpl,sk); if(b) return b; }
    const fl=[]; let yy=0;
    for(const r of footRows(U,mw)){ yy+=r.lead; fl.push({t:r.t,at:yy-r.o.size*0.45,o:{...r.o,maxW:mw,stroke:sk}}); }
    return blockOf(ctx,fl,yy);
  };
  /** Bloc à plat (texte seul, cartouche, bandeau, étiquette, capsule, filets) : marges intérieures, puis placement. Les lignes
   *  d'un gabarit du bas (x, al) et ses filets (rules) se placent depuis le bord gauche du contenu (cl). */
  const place=(b: Opts,spec: Opts,kind: string,d: string)=>{
    let [px,py]=pad(d); if(d==='capsule') px=Math.max(px,(b.h+2*py)*0.55);   // capsule : bouts arrondis
    const bb={...b,lines:b.lines.map((l: Opts)=>({...l,at:l.at+py})),rules:(b.rules||[]).map((r: Opts)=>({...r,y1:r.y1+py,y2:r.y2+py})),w:b.w+2*px,h:b.h+2*py};
    const P=placeBlock(bb,W,H,m,spec,kind), ax=P.align==='left' ? P.left+px : P.align==='right' ? P.left+bb.w-px : P.ax;
    return {...bb,...P,ax,cl:P.left+px,deco:d,box:d==='bandeau' ? {x:0,y:P.top,w:W,h:bb.h} : P.rect};   // bandeau : toute la largeur de la zone
  };
  const tspec=T.free ? {free:T.free} : {pos:T.pos};
  const vert=()=>{   // titre pivoté le long d'un bord : de bas en haut à gauche, de haut en bas à droite
    const b=titleBlock(H-2*m,false), P=placeBlock({w:b.h,h:b.w},W,H,m,tspec,'title'), cx=P.left+b.h/2, cy=P.top+b.w/2;
    return {...b,...P,deco:'vertical',box:P.rect,cx,cy,rot:cx>W/2 ? Math.PI/2 : -Math.PI/2};
  };
  const seal=()=>{   // cachet : titre en couronne en haut, sous-titre en bas
    const d=clamp(0.3*U*Math.sqrt(tScale('title')),0.16*U,Math.max(0.16*U,Math.min(W,H)-m)), P=placeBlock({w:d,h:d},W,H,m,tspec,'title');
    const cx=P.left+d/2, cy=P.top+d/2, R=d/2, tsz=0.13*d, rt=R-0.065*d-0.75*tsz, ri=rt-0.03*d;
    const ot={size:tsz,spacing:vint?0.06:0.16,upper:true,role:'title',key:'title',fk:vint?'bebas':undefined};
    const arcs=[arcLayout(ctx,title,cx,cy,rt,true,ot,Math.PI*0.8),
      arcLayout(ctx,sub,cx,cy,R-0.065*d,false,{size:0.075*d*tScale('subtitle'),spacing:0.25,upper:true,key:'subtitle'},Math.PI*0.6)];
    return {lines:[],w:d,h:d,...P,deco:'cachet',box:P.rect,arcs,seal:{cx,cy,R,d,ri}};
  };
  const arc=()=>{   // titre courbé autour de la carte (médaillon) : au-dessus, ou au-dessous d'un cercle
    const M=env.map, sh=arcShape();
    const cx=M.x+M.w/2, cy=sh==='arch' ? M.y+M.w/2 : M.y+M.h/2, R0=M.w/2+0.04*U, row=titleRC(T)[0];
    const top=sh==='arch' || row==='h' || (row==='m' && (env.below || M.y>H-M.y-M.h));   // below : dessous occupé (gabarit)
    let ats=(vint?0.11:0.075)*U*tScale('title'); const ass=0.022*U*tScale('subtitle');
    if(top){ const room=cy-R0-(sub ? ass*0.75+0.02*U : 0)-0.025*U; if(ats*0.84>room) ats=Math.max(ats*0.5,room/0.84); }   // au-dessus : tenir dans l'affiche
    const ot={size:ats,spacing:vint?0.05:0.14,upper:true,role:'title',key:'title',fk:vint?'bebas':undefined,shadow,stroke:stroke(0.004)};
    const os={size:ass,spacing:0.3,upper:true,key:'subtitle',stroke:stroke(0.0012),shadow:shadow && {color:shadow.color,dx:shadow.dx*0.3,dy:shadow.dy*0.3}};
    let a1, a2;
    if(top){ a2=arcLayout(ctx,sub,cx,cy,R0,true,os,Math.PI*0.8); a1=arcLayout(ctx,title,cx,cy,R0+(sub ? ass*0.75+0.02*U : 0),true,ot,Math.PI*0.85); }
    else { const r1=R0+ats*0.75;   // en bas, lettres resserrées vers le centre : plus d'interlettrage
      a1=arcLayout(ctx,title,cx,cy,r1,false,{...ot,spacing:ot.spacing+0.06},Math.PI*0.7); a2=arcLayout(ctx,sub,cx,cy,r1+(title ? 0.02*U : 0)+ass*0.75,false,os,Math.PI*0.6); }
    const rect=union([a1?.box,a2?.box]);
    return {lines:[],w:rect!.w,h:rect!.h,left:rect!.x,top:rect!.y,align:'center',ax:rect!.x+rect!.w/2,rect,box:rect,deco:'arc',arcs:[a1,a2],fixed:true};
  };
  let tOut=null;
  if(title || sub){
    if(dT==='arc' && env.map) tOut=arc();
    else if(dT==='cachet') tOut=seal();
    else if(dT==='vertical') tOut=vert();
    else { const d=dT==='arc' ? 'libre' : dT; tOut=place(titleBlock(maxW-2*pad(d)[0],!['libre','filets'].includes(d)),tspec,'title',d); }
  }
  const fb=footBlock(maxW-2*pad(dF)[0],!['libre','filets'].includes(dF));
  return {title:tOut, foot:fb.lines.length ? place(fb,footSpec(T),'foot',dF) : null};
}
/** Mode Carte (#75) : blocs sortis du gabarit (une des 9 positions, ou glissés). Gabarit Lettres : le titre forme la carte. */
export function mapMoved(s=st): Record<string, boolean> {
  const P=s.illusText.map;
  return {title:s.layout!=='typo' && (!!P.free || P.pos!=='auto'), foot:!!P.ffree || P.fpos!=='auto'};
}
/** Style des textes résolu pour le type d'affiche (#74) : les valeurs 'auto' prennent celle du mode.
 *  vint : titre Vintage ; color : lettres ; shadow, outline : '' = aucun ; off : décalage de l'ombre. */
export function textStyle(s=st): Opts {
  const T=s.illusText, map=s.mode==='map', c=s.colors;
  return {vint:T.style==='auto' ? !map : T.style==='vintage', color:T.color==='auto' ? c.text : T.color,
    shadow:T.shadow==='auto' ? (map ? '' : c.paper) : T.shadow, outline:T.outline, off:T.off};
}
/** Positions des blocs de texte, propres à chaque type d'affiche (#77) : Illustration (illusText), Carte + illustration
 *  (illusText.mix) ou Carte (illusText.map, 'auto' = dans le gabarit) */
/** Positions et présentations des blocs du type d'affiche (champs variables selon le type : sac d'options) */
export const posOf=(s=st): Opts=>s.mode==='map' ? s.illusText.map : s.mode==='mix' ? s.illusText.mix : s.illusText;
