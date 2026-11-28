/* City Map Studio — Rendu de l'affiche : repères vectoriels, itinéraire, repères multiples (extrait de render/poster.ts, #119). */
import {st, ui} from '../core/doc/state.js';
import {project, type Rect} from '../core/geo/geo.js';
import {MARKER_BASE} from '../content/config.js';
import {Ctx, MapView, Opts} from './poster-types.js';
import {foilCtx, foilGradient} from './poster-paint.js';
// ---------- Repères vectoriels (unité : rayon r) ----------
const STAR_D=(()=>{ let d=''; for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, r=i%2?0.42:1; d+=(i?'L':'M')+(r*Math.cos(a)).toFixed(3)+','+(r*Math.sin(a)+0.08).toFixed(3); } return d+'Z'; })();
const MARKER_D: Record<string, string>={
  star:STAR_D,
  house:'M0,-0.95 L0.98,-0.08 L0.74,-0.08 L0.74,0.9 L0.24,0.9 L0.24,0.32 L-0.24,0.32 L-0.24,0.9 L-0.74,0.9 L-0.74,-0.08 L-0.98,-0.08 Z'
};
function markerPath(ctx: Ctx, style: string){
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
export function drawMarker(ctx: Ctx, x: number, y: number, size: number, o: Opts){
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
export function markerOpts(){return {style:st.markerStyle, color:st.colors.marker, fill:st.markerFill, opacity:st.markerOpacity, facet:st.colors.paper}}
/** Pastille numérotée (lieux multiples) */
function drawBadge(ctx: Ctx, x: number, y: number, n: number, d: number){
  ctx.save(); ctx.fillStyle=st.colors.marker; ctx.strokeStyle=st.colors.paper; ctx.lineWidth=d*0.12;
  ctx.beginPath(); ctx.arc(x,y,d/2,0,7); ctx.fill(); ctx.stroke();
  ctx.fillStyle=st.colors.paper; ctx.font=`600 ${d*0.62}px Montserrat, Arial, sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(String(n),x,y+d*0.04); ctx.restore();
}
/** Tracé d'un itinéraire (GPX ou lieux reliés) dans un cadre de carte */
function drawRoute(ctx: Ctx, pts: number[][], r: Rect, view: MapView, U: number, dashed: boolean){
  if(!pts || pts.length<2) return;
  const rs=st.routeStyle||{};
  ctx.save(); ctx.strokeStyle=(st.colors as Record<string, string>)[rs.color]||st.colors.marker; ctx.lineWidth=U*0.0035*(rs.width||1); ctx.lineJoin='round'; ctx.lineCap='round'; ctx.globalAlpha=0.92;
  if(dashed) ctx.setLineDash([U*0.012,U*0.009]);
  ctx.beginPath(); pts.forEach(([la,lo],i)=>{ const p=project(la,lo,r,view); i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); }); ctx.stroke(); ctx.restore();
}
/** Repère principal, lieux supplémentaires numérotés et itinéraires d'une vue */
export function drawMarkers(ctx: Ctx, r: Rect, view: MapView, U: number, W: number, main: boolean){
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
