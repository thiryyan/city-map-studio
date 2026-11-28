/* City Map Studio — Itinéraire importé (GPX) : lecture, cadrage, liste (#118, issu de features.ts). */
import {$, setSeg, toast} from '../core/dom.js';
import {REF_W, Route} from '../content/config.js';
import {clamp, imerc, merc} from '../core/geo/geo.js';
import {st, ui} from '../core/doc/state.js';
import {goTo} from './places.js';
// ---------- Itinéraire (GPX) ----------
/** Simplification de Douglas-Peucker (tolérance en degrés) */
function simplify(pts: [number, number][],tol: number): [number, number][] {
  if(pts.length<3) return pts; const keep=new Uint8Array(pts.length); keep[0]=keep[pts.length-1]=1; const stack: [number, number][]=[[0,pts.length-1]];
  while(stack.length){ const [a,b]=stack.pop()!; let md=0, mi=-1; const [y1,x1]=pts[a], [y2,x2]=pts[b], dx=x2-x1, dy=y2-y1, L=Math.hypot(dx,dy)||1e-12;
    for(let i=a+1;i<b;i++){ const d=Math.abs(dy*pts[i][1]-dx*pts[i][0]+x2*y1-y2*x1)/L; if(d>md){ md=d; mi=i; } }
    if(md>tol && mi>0){ keep[mi]=1; stack.push([a,mi],[mi,b]); } }
  return pts.filter((_,i)=>keep[i]);
}
/** GPX → {name, pts (1 500 points au plus), show, wpts?} ; info.raw reçoit les points lus avant simplification (contrôle
 *  de vraisemblance, CMS.route). Un tracé (trk) accompagné de points nommés (wpt) garde leurs noms : wpts [{lat, lon, name}] */
function parseGpx(txt: string,info: {raw?: [number, number][]}={}): Route {
  const x=new DOMParser().parseFromString(txt,'application/xml'); if(x.querySelector('parsererror')) throw new Error('fichier GPX illisible');
  const ll=(n: Element): [number, number]=>[+n.getAttribute('lat')!,+n.getAttribute('lon')!], ok=([a,b]: [number, number])=>isFinite(a)&&isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180;
  const wnodes=[...x.getElementsByTagName('wpt')];
  let nodes=[...x.getElementsByTagName('trkpt')]; if(!nodes.length) nodes=[...x.getElementsByTagName('rtept')]; if(!nodes.length) nodes=wnodes;
  let pts=nodes.map(ll).filter(ok);
  if(pts.length<2) throw new Error('aucun tracé trouvé (points trkpt, rtept ou wpt)');
  info.raw=pts;
  let tol=0.00002; while(pts.length>1500){ pts=simplify(pts,tol); tol*=2; }
  pts=pts.map(([a,b]): [number, number]=>[+a.toFixed(6),+b.toFixed(6)]);
  const nm=['trk > name','rte > name','metadata > name','name'].map(q=>x.querySelector<HTMLElement>(q)).find(Boolean);   // tracé d'abord (pas le nom d'une étape)
  const r: Route={name:(nm?.textContent||'').trim().slice(0,120), pts, show:true};
  if(nodes!==wnodes){ const w=wnodes.map(n=>{ const p=ll(n); return ok(p) && {lat:+p[0].toFixed(6), lon:+p[1].toFixed(6),
      name:([...n.children].find(c=>c.localName==='name')?.textContent||'').replace(/\s+/g,' ').trim().slice(0,80)}; }).filter((x): x is {lat: number; lon: number; name: string}=>!!x).slice(0,20);
    if(w.length) r.wpts=w; }
  return r;
}
async function importGpx(f: File){ CMS.route.importGpxText(await f.text(),false); }
function fitRoute(){
  const pts=[...(st.route?.pts||[])]; if(pts.length<2) return;
  let y0=90,y1=-90,x0=180,x1=-180; for(const [a,b] of pts){ y0=Math.min(y0,a); y1=Math.max(y1,a); x0=Math.min(x0,b); x1=Math.max(x1,b); }
  const r=ui.slotCss, dl=Math.max(x1-x0,1e-6), dm=Math.max(merc(y1)-merc(y0),1e-9);
  const zx=Math.log2(0.82*360*REF_W/(512*dl)), zy=Math.log2(0.82*2*Math.PI*REF_W*(r.h/r.w)/(512*dm));
  const z=Math.min(zx,zy); if(z<10) toast('Itinéraire très étendu : la carte est au zoom minimal, une partie peut sortir du cadre.');
  goTo(imerc((merc(y0)+merc(y1))/2),(x0+x1)/2,clamp(z,10,18));
}
function renderRoute(){
  const r=st.route; $('routeBox').hidden=!r;
  if(r){ $('routeInfo').textContent=`${r.name||'Itinéraire'} · ${r.pts.length} points`; $('routeShow').checked=r.show!==false; }
  setSeg('routeColor',st.routeStyle.color); $('routeDash').checked=!!st.routeStyle.dash; $('routeW').value=String(st.routeStyle.width); $('oRouteW').textContent='× '+st.routeStyle.width;
}

export {fitRoute, importGpx, parseGpx, renderRoute, simplify};
