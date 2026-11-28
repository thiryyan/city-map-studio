/* City Map Studio — Rendu de l'affiche (drawPoster) : ornements, gabarit Lettres, composition — commun à l'aperçu et à l'export.
 * Module ES (#102), importé par src/app/main.ts ; réuni en un seul script par le build (scripts/build.mjs).
 * Découpage (#119) : textes → poster-text.ts, repères → poster-marker.ts, ciel → poster-sky.ts, peinture → poster-paint.ts, types → poster-types.ts. */
import {D2R, clipMap, focusRadius, placeCoordText, project, strokeShape, textLine, type Geom, type Rect, type View, unproject, worldSize} from '../core/geo/geo.js';
import {st, ui} from '../core/doc/state.js';
import {geom} from './layout.js';
import {Ctx, GlyphFn, MapFn, MapView} from './poster-types.js';
import {hexA, paint, setFoilCtx} from './poster-paint.js';
import {CART_ROWS, POLA_ROWS, drawCartouche, drawRun, drawText, drawTravelText, fontKey, fontOf, fontStr, noteFit, souvenirFoot, tScale, textW} from './poster-text.js';
import {drawSky} from './poster-sky.js';
import {drawMarkers} from './poster-marker.js';
// ---------- Autour du repère ----------
/** Halo du souvenir : la ville se dissout dans le papier en s'éloignant du lieu */
export function drawHalo(ctx: Ctx, r: Rect, view: MapView){
  const q=project(view.marker.lat,view.marker.lon,r,view), R=focusRadius(r.w), pc=hexA(st.colors.paper);
  const g=ctx.createRadialGradient(q.x,q.y,R*0.8,q.x,q.y,R*2.6);
  g.addColorStop(0,pc(0)); g.addColorStop(0.45,pc(0.6)); g.addColorStop(1,pc(0.95));
  ctx.fillStyle=g; ctx.fillRect(r.x,r.y,r.w,r.h);
}
// ---------- Ornements cartographiques ----------
const NICE_M=[10,20,25,50,100,200,250,500,1000,2000,2500,5000,10000,20000,50000];
const NICE_MIN=[0.25,0.5,1,2,5,10,15,30,60,120];
   // pas des graduations, en minutes d'arc
/** Mètres par pixel au centre d'une vue (cadre de largeur w) */
export const metersPerPx=(view: View,w: number)=>40075016.686*Math.cos(view.center.lat*D2R)/worldSize(w,view.zoom);
/** Plaque de papier semi-opaque sous un ornement (lisible sur la carte) */
function plate(ctx: Ctx,x: number,y: number,w: number,h: number){ ctx.save(); ctx.fillStyle=hexA(st.colors.paper)(0.86); ctx.fillRect(x,y,w,h); ctx.restore(); }
export function drawOrnaments(ctx: Ctx, r: Rect, view: MapView, U: number, first: boolean){
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
function drawCompass(ctx: Ctx,x: number,y: number,R: number,U: number){
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
const dmsShort=(v: number,pos: string,neg: string)=>{ const a=Math.abs(v), d=Math.floor(a+1e-9), mm=Math.round((a-d)*60*4)/4; const m=mm>=60?0:mm, dd=mm>=60?d+1:d;
  return `${dd}°${m?String(m%1?m.toFixed(2).replace(/0$/,''):m).replace('.',',').padStart(2,'0')+'′':''}${v>=0?pos:neg}`; };
/** Graduations : méridiens et parallèles à pas rond, fins et pâles ; repères et valeurs au bord d'un cadre rectangulaire */
function drawGraticule(ctx: Ctx,r: Rect,view: MapView,U: number,ticks: boolean){
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
export function typoFit(ctx: Ctx, title: string, r: Rect){
  const F=fontOf('title'), sp=0.03, words=title.split(/\s+/).filter(Boolean);
  const opts=[[title]]; if(words.length>1) opts.push(words);
  let best: {lines: string[]; size: number} | null=null;
  for(const lines of opts){
    ctx.font=fontStr(100,{role:'title',key:'title'});
    const wMax=Math.max(...lines.map(l=>textW(ctx,l,sp,100)));
    const size=Math.min(r.w*0.92/wMax*100, r.h*0.86/(lines.length*0.86)/(F.scale||1));
    if(!best || size>best.size) best={lines,size};
  }
  return {...best!,sp};
}
function drawLetters(ctx: Ctx, g: Geom){
  const r=g.map, U=g.U, c=st.colors, t=(textLine('title')||'').toUpperCase();
  const w=Math.max(1,Math.ceil(r.w)), h=Math.max(1,Math.ceil(r.h));
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h; const m=cv.getContext('2d')!;
  m.fillStyle=hexA(c.paper)(TYPO_VEIL); m.fillRect(0,0,w,h);
  if(t){
    const f=typoFit(m,t,r), F=fontOf('title'), lh=f.size*(F.scale||1)*0.86, n=f.lines.length;
    const font=fontStr(f.size,{role:'title',key:'title'});
    m.font=font; m.textBaseline='alphabetic'; m.textAlign='left';
    const cap=lh*0.82, y0=h/2-(n*lh)/2+cap;   // lignes centrées sur la hauteur des capitales
    const lines=f.lines.map((l,i)=>{ const lw=textW(m,l,f.sp,f.size); return {l,x:(w-lw)/2,y:y0+i*lh}; });
    m.globalCompositeOperation='destination-out';
    const each=(fn: GlyphFn)=>{ for(const L of lines) CMS.glyphs.each(m,L.l,L.x,f.sp*f.size,(g: string,x: number)=>fn(g,x,L.y)); };
    each((ch: string,x: number,y: number)=>m.fillText(ch,x,y));
    ctx.drawImage(cv,r.x,r.y,w,h);
    ctx.save(); ctx.font=font; ctx.textBaseline='alphabetic'; ctx.textAlign='left'; ctx.strokeStyle=paint(c.frame); ctx.lineWidth=0.0014*U; ctx.lineJoin='round';
    for(const L of lines) CMS.glyphs.each(m,L.l,L.x,f.sp*f.size,(g: string,x: number)=>ctx.strokeText(g,r.x+x,r.y+L.y));
    ctx.restore();
  } else ctx.drawImage(cv,r.x,r.y,w,h);
  cv.width=cv.height=0;
}
// ---------- Rendu de l'affiche (aperçu ET export) ----------
/** pass: 'under' (papier, ciel) | 'over' (tout ce qui est au-dessus de la carte) | 'all'.
 *  mapFn(ctx, rect, view, index) dessine la carte d'une vue (export : une ou deux vues). */
export function drawPoster(ctx: Ctx, W: number, H: number, pass: string, mapFn?: MapFn){
  setFoilCtx(st.fx?.foil ? {W,H,cache:new Map()} : null);   // dorure : dégradés propres à ce rendu
  try{ return drawPosterAt(ctx,W,H,pass,mapFn); } finally{ setFoilCtx(null); ui.textFx=null; ui.textHide=null; }
}
function drawPosterAt(ctx: Ctx, W: number, H: number, pass: string, mapFn?: MapFn){
  const c=st.colors, g=geom(st,W,H), m=g.m, U=g.U, r=g.map;
  if(g.mix){ CMS.illus.drawMix(ctx,W,H,pass,g,mapFn); return g; }   // carte + illustration (src/ui/illustration.ts)
  if(g.illus){ CMS.illus.draw(ctx,W,H,pass,g); return g; }   // modes illustrés : image importée et textes (src/ui/illustration.ts)
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
  g.places.forEach((p,i: number)=>{ ctx.save(); clipMap(ctx,p.rect); drawOrnaments(ctx,p.rect,p.view,U,i===0); ctx.restore(); });
  // Repères (et itinéraires) de chaque vue
  for(const p of g.places){ ctx.save(); clipMap(ctx,p.rect); drawMarkers(ctx,p.rect,p.view,U,W,!!p.main); ctx.restore(); }

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
    const dedAt=(sz: number,maxW?: number)=>P.L.lines.forEach((l: string,i: number)=>drawText(ctx,l,m,yF-(n-1-i)*P.lh*U,{size:sz,key:'dedication',align:'left',color:c.text,maxW}));
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
    drawText(ctx,textLine('title'),W/2,g.title!.y,{size:0.06*U*tScale('title'),spacing:0.15,upper:true,role:'title',key:'title',align:'center',color:c.text,maxW:W-2*m});
    const views: MapView[]=[], A=st.active||0; views[A]=st; views[1-A]=st.place2||st;
    g.rects!.forEach((rc,i: number)=>{ ctx.strokeStyle=paint(c.frame); ctx.lineWidth=0.0018*U; ctx.strokeRect(rc.x,rc.y,rc.w,rc.h);
      const lab=textLine('label'+(i+1)), co=placeCoordText(views[i].marker);
      drawText(ctx,lab,rc.x,g.labels![i],{size:0.03*U*tScale('dedication'),italic:true,key:'label'+(i+1),align:'left',color:c.text,maxW:rc.w*(co?0.6:1)});
      if(st.show.coords!==false) drawText(ctx,co,rc.x+rc.w,g.labels![i],{size:0.015*U*tScale('coords'),spacing:0.08,align:'right',color:c.text,maxW:rc.w*(lab?0.38:1)}); });
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
export function attributionText(sky: boolean){
  const gpu=st.engine==='maplibre';
  if(!st.attribution) return '© OpenStreetMap'+(gpu?' · © OpenMapTiles':'');
  return '© contributeurs OpenStreetMap'+(gpu?' · OpenFreeMap © OpenMapTiles':'')+(sky?' · Ciel : d3-celestial (XHIP)':'');
}

// Façade : les importeurs (preview, saves, vignettes, main) gardent leur chemin d'import (#119)
export {altAz, ensureSky, moonSun, planetsAt, skyTime} from './poster-sky.js';
export {CART_ROWS, cartDed, dedLeading, dedLines, drawText, fitSink, fontOf, fontStr, noteFit, POLA_ROWS, setFitSink, souvenirFoot, textW, tScale} from './poster-text.js';
export {drawMarker, drawMarkers, markerOpts} from './poster-marker.js';
export {foilCtx, hexA, paint} from './poster-paint.js';
