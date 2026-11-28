/* City Map Studio — Rendu de l'affiche : halo du souvenir, ornements cartographiques (échelle, rose des vents, graduations), mention des sources (extrait de render/poster.ts, #119). */
import {D2R, focusRadius, project, unproject, worldSize, type Rect, type View} from '../core/geo/geo.js';
import {st} from '../core/scene.js';
import {Ctx, MapView} from './poster-types.js';
import {hexA, paint} from './poster-paint.js';
import {drawText} from './poster-text.js';

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

/** Mention de l'affiche : minimale (toujours), complète si st.attribution */
export function attributionText(sky: boolean){
  const gpu=st.engine==='maplibre';
  if(!st.attribution) return '© OpenStreetMap'+(gpu?' · © OpenMapTiles':'');
  return '© contributeurs OpenStreetMap'+(gpu?' · OpenFreeMap © OpenMapTiles':'')+(sky?' · Ciel : d3-celestial (XHIP)':'');
}

