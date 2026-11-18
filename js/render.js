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
function fontStr(size, o={}){const f=fontOf(o.role,o.key); return `${o.italic&&!f.script?'italic ':''}${o.weight||f.weight||400} ${size*(f.scale||1)}px ${f.fam}`}
/** Largeur dessinée : texte d'un bloc sans interlettrage ; sinon somme des caractères dessinés un à un (comme drawText),
 *  pour que le centrage et l'alignement à droite tombent juste (le crénage d'un bloc ne s'applique pas lettre à lettre).
 *  Les caractères sont comptés en points de code (emoji, lettres hors du plan de base). */
function textW(ctx, t, sp, size){
  if(!sp) return ctx.measureText(t).width;
  const chars=[...t]; let w=0; for(const ch of chars) w+=ctx.measureText(ch).width;
  return w + sp*size*Math.max(0,chars.length-1);
}
/** Facteur de taille d'une ligne de texte : réglage de la ligne × réglage global */
function tScale(k){ return (st.textScale?.[k]??100)/100 * (st.textScaleAll??100)/100; }
/** Réductions automatiques relevées pendant le rendu de l'aperçu (clé de ligne → facteur appliqué < 1) */
let fitSink=null;
const FIT_WARN=0.9;   // en deçà de 10 % de réduction, pas d'avertissement
function noteFit(k,f){ if(fitSink && k && f<FIT_WARN) fitSink[k]=Math.min(fitSink[k]??1,f); }
/** Dessine un texte avec interlettrage et réduction automatique ; renvoie la largeur dessinée.
 *  Une police manuscrite n'est jamais mise en capitales ni espacée. */
function drawText(ctx, t, x, y, o){
  if(!t) return 0;
  const F=fontOf(o.role,o.key);
  if(o.upper && !F.script) t=t.toUpperCase();
  let size=o.size; const sp=F.script?0:(o.spacing||0);
  ctx.font=fontStr(size,o);
  let w=textW(ctx,t,sp,size);
  if(o.maxW && w>o.maxW){ noteFit(o.key,o.maxW/w); size*=o.maxW/w; ctx.font=fontStr(size,o); w=textW(ctx,t,sp,size); }
  ctx.fillStyle=o.color; ctx.textBaseline='alphabetic';
  let sx = o.align==='center' ? x-w/2 : o.align==='right' ? x-w : x;
  if(!sp){ ctx.textAlign='left'; ctx.fillText(t,sx,y); return w; }
  ctx.textAlign='left';
  for(const ch of t){ ctx.fillText(ch,sx,y); sx += ctx.measureText(ch).width + sp*size; }
  return w;
}
/** Dessine bout à bout plusieurs segments de tailles différentes, alignés sur la même ligne de base,
 *  avec une réduction commune s'ils dépassent maxW. parts : [{t, size, key, italic, role}] ; renvoie la largeur. */
function drawRun(ctx, parts, x, y, o){
  parts=parts.filter(p=>p.t); if(!parts.length) return 0;
  const ws=parts.map(p=>{ ctx.font=fontStr(p.size,p); return ctx.measureText(p.t).width; });
  let tot=ws.reduce((a,b)=>a+b,0), f=1;
  if(o.maxW && tot>o.maxW){ f=o.maxW/tot; parts.forEach(p=>(p.keys||[p.key]).forEach(k=>noteFit(k,f))); }
  let sx = o.align==='right' ? x-tot*f : o.align==='center' ? x-tot*f/2 : x;
  ctx.fillStyle=o.color; ctx.textBaseline='alphabetic'; ctx.textAlign='left';
  parts.forEach((p,i)=>{ ctx.font=fontStr(p.size*f,p); ctx.fillText(p.t,sx,y); sx+=ws[i]*f; });
  return tot*f;
}
function hline(ctx,x1,x2,y,lw,color){ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke()}

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
  ctx.fillStyle=col; ctx.strokeStyle=col;
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
      ctx.strokeStyle = fill ? (o.facet||'#ffffff') : col; ctx.globalAlpha = o.opacity*(fill?0.55:0.8); ctx.lineWidth=fill?0.035:0.045;
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
  pts.forEach((p,i)=>{ const q=project(p.lat,p.lon,r,view); drawMarker(ctx,q.x,q.y,i?size*0.75:size,markerOpts());
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
function drawSky(ctx, r, U){
  const c=st.colors, dark=lum(c.paper)<0.3, R=r.w/2, cx=r.x+R, cy=r.y+R;
  const bg=dark?c.land:c.text, ink=dark?c.text:c.paper;
  ctx.save(); ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.fill(); ctx.clip();
  const ms=skyTime(), S=window.SKY_DATA;
  if(ms!=null && S){
    const {lat,lon}=st.marker;
    // projection stéréographique centrée sur le zénith : horizon = bord du disque, nord en haut, est à gauche
    const P=(ra,dec)=>{ const a=altAz(ra,dec,lat,lon,ms), q=Math.tan((90-a.alt)*D2R/2)*R, z=a.az*D2R; return {x:cx-q*Math.sin(z), y:cy-q*Math.cos(z), alt:a.alt}; };
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
  } else if(!S && !ui.thumb) ensureSky();
  ctx.restore();
  // horizon, points cardinaux
  ctx.strokeStyle=c.frame; ctx.lineWidth=0.0022*U; ctx.beginPath(); ctx.arc(cx,cy,R+0.012*U,0,7); ctx.stroke();
  ctx.lineWidth=0.0008*U; ctx.beginPath(); ctx.arc(cx,cy,R+0.004*U,0,7); ctx.stroke();
  const cs=0.016*U, o=R+0.032*U;
  [['N',0,-1],['E',-1,0],['S',0,1],['O',1,0]].forEach(([t,dx,dy])=>drawText(ctx,t,cx+dx*o,cy+dy*o+cs*0.36,{size:cs,align:'center',color:c.text}));
}
function lum(hex){ const n=parseInt(hex.slice(1),16), f=v=>{ v/=255; return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4; }; return 0.2126*f(n>>16&255)+0.7152*f(n>>8&255)+0.0722*f(n&255); }
function contrast(a,b){ const x=lum(a), y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); }

// ---------- Rendu de l'affiche (aperçu ET export) ----------
/** pass: 'under' (papier, ciel) | 'over' (tout ce qui est au-dessus de la carte) | 'all'.
 *  mapFn(ctx, rect, view, index) dessine la carte d'une vue (export : une ou deux vues). */
function drawPoster(ctx, W, H, pass, mapFn){
  const c=st.colors, g=geom(st,W,H), m=g.m, U=g.U, r=g.map;
  if(pass!=='over'){ ctx.fillStyle=c.paper; ctx.fillRect(0,0,W,H); if(g.sky) drawSky(ctx,g.sky,U); }
  if(pass==='all' && mapFn) g.places.forEach((p,i)=>{ ctx.save(); clipMap(ctx,p.rect); ctx.fillStyle=c.land; ctx.fillRect(p.rect.x,p.rect.y,p.rect.w,p.rect.h); mapFn(ctx,p.rect,p.view,i); ctx.restore(); });
  if(pass==='under') return g;

  // Fondu
  if(st.layout==='fade'){
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
  // Repères (et itinéraires) de chaque vue
  for(const p of g.places){ ctx.save(); clipMap(ctx,p.rect); drawMarkers(ctx,p.rect,p.view,U,W,p.main); ctx.restore(); }

  // Filets & textes
  const lay=st.layout;
  if(lay==='souvenir' && !g.land){
    const yH=m+0.061*U, inner=W-2*m;
    const title=textLine('title'), date=textLine('date'), coords=textLine('coords'), hs=0.031*U;
    // En-tête : « Titre - Date », chaque partie à sa taille et dans sa police, sur une même ligne de base
    const same=tScale('title')===tScale('date') && fontKey('title')===fontKey('','date');
    const left = title&&date&&same ? [{t:title+' - '+date,size:hs*tScale('title'),keys:['title','date']}]
               : title&&date ? [{t:title,size:hs*tScale('title'),key:'title',role:'title'},{t:' - ',size:hs*Math.min(tScale('title'),tScale('date'))},{t:date,size:hs*tScale('date'),key:'date'}]
               : [{t:title||date,size:hs*tScale(title?'title':'date'),key:title?'title':'date',role:title?'title':''}];
    drawRun(ctx,left,m,yH,{align:'left',color:c.text,maxW:inner*(coords?0.58:1)});
    drawText(ctx,coords,W-m,yH,{size:0.026*U*tScale('coords'),key:'coords',align:'right',color:c.text,maxW:inner*(title||date?0.4:1)});
    const yF=H-m-0.0195*U, ded=textLine('dedication'), names=textLine('names'), ns=tScale('names'), ds=0.062*U*tScale('dedication');
    if(names && ded){
      // Dédicace | Noms : s'ils dépassent la largeur, les deux sont réduits du même facteur (les tailles choisies gardent leur rapport)
      const gap=0.062*U, nsz=0.026*U*ns;
      ctx.font=fontStr(ds,{key:'dedication'}); const wd=ctx.measureText(ded).width; ctx.font=fontStr(nsz,{italic:true,key:'names'}); const wn=ctx.measureText(names).width;
      const f=Math.min(1,(inner-gap)/(wd+wn)); noteFit('dedication',f); noteFit('names',f);
      drawText(ctx,ded,m,yF,{size:ds*f,align:'left',color:c.text,key:'dedication'});
      const bx=m+wd*f+0.032*U;
      ctx.strokeStyle=c.frame; ctx.lineWidth=0.0018*U; ctx.beginPath(); ctx.moveTo(bx,yF-0.04*U); ctx.lineTo(bx,yF+0.004*U); ctx.stroke();
      drawText(ctx,names,bx+0.03*U,yF-0.008*U,{size:nsz*f,italic:true,align:'left',color:c.text,key:'names'});
    } else if(ded){
      drawText(ctx,ded,m,yF,{size:ds,key:'dedication',align:'left',color:c.text,maxW:inner});
    } else if(names){
      drawText(ctx,names,m,yF-0.008*U,{size:0.026*U*ns,key:'names',italic:true,align:'left',color:c.text,maxW:inner});
    }
  } else if(lay==='diptych'){
    drawText(ctx,textLine('title'),W/2,g.title.y,{size:0.06*U*tScale('title'),spacing:0.15,upper:true,role:'title',key:'title',align:'center',color:c.text,maxW:W-2*m});
    const views=[], A=st.active||0; views[A]=st; views[1-A]=st.place2||st;
    g.rects.forEach((rc,i)=>{ ctx.strokeStyle=c.frame; ctx.lineWidth=0.0018*U; ctx.strokeRect(rc.x,rc.y,rc.w,rc.h);
      const lab=textLine('label'+(i+1)), co=placeCoordText(views[i].marker);
      drawText(ctx,lab,rc.x,g.labels[i],{size:0.03*U*tScale('dedication'),italic:true,key:'label'+(i+1),align:'left',color:c.text,maxW:rc.w*(co?0.6:1)});
      if(st.show.coords!==false) drawText(ctx,co,rc.x+rc.w,g.labels[i],{size:0.015*U*tScale('coords'),spacing:0.08,align:'right',color:c.text,maxW:rc.w*(lab?0.38:1)}); });
    drawCartouche(ctx,U,{...g.text,rows:CART_ROWS,only:['subtitle','dedication','names','date']});
  } else if(g.box){
    drawTravelText(ctx,U,g.box);
  } else {
    if(lay==='classic'){
      ctx.strokeStyle=c.frame;
      ctx.lineWidth=0.0025*U; const o1=0.014*U; ctx.strokeRect(r.x-o1,r.y-o1,r.w+2*o1,r.h+2*o1);
      ctx.lineWidth=0.0009*U; const o2=0.006*U; ctx.strokeRect(r.x-o2,r.y-o2,r.w+2*o2,r.h+2*o2);
    } else if(['medallion','heart','arch'].includes(lay) && st.ring){
      ctx.strokeStyle=c.frame; ctx.lineWidth=0.0022*U; strokeShape(ctx,r,0.014*U);
      ctx.lineWidth=0.0008*U; strokeShape(ctx,r,0.006*U);
    } else if(lay==='polaroid'){
      ctx.strokeStyle=hexA(c.text)(0.18); ctx.lineWidth=0.0012*U; ctx.strokeRect(r.x,r.y,r.w,r.h);
    } else if(lay==='sky'){
      ctx.strokeStyle=c.frame; ctx.lineWidth=0.0012*U; ctx.strokeRect(r.x,r.y,r.w,r.h);
    }
    drawCartouche(ctx,U,{...g.text,rows:lay==='polaroid'?POLA_ROWS:CART_ROWS});
  }
  // Attribution OSM (ODbL)
  if(st.attribution){
    ctx.globalAlpha=0.55;
    drawText(ctx,'© contributeurs OpenStreetMap'+(st.engine==='maplibre'?' · OpenFreeMap © OpenMapTiles':'')+(g.sky?' · Ciel : d3-celestial (XHIP)':''),W-m,H-m*0.38,{size:0.0085*U,align:'right',color:c.text});
    ctx.globalAlpha=1;
  }
  return g;
}
function hexA(hex){const n=parseInt(hex.slice(1),16);const r=n>>16&255,g=n>>8&255,b=n&255;return a=>`rgba(${r},${g},${b},${a})`}
