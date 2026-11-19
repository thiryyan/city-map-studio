/* City Map Studio — Moteurs cartographiques : données OSM + Canvas (moteur Fichier), effets de tracé, MapLibre + OpenFreeMap.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html. */
'use strict';
// ---------- Données OSM + Canvas (moteur Fichier) ----------
function toPts(geo){const a=[];for(const p of geo) if(p) a.push([p.lon,merc(p.lat)]);return a}   // points null (hors cadre) ignorés
/** Coupe une géométrie aux points null (points hors de la zone extraite) */
function splitNull(geo){ const out=[]; let cur=[]; for(const p of geo){ if(p) cur.push(p); else { if(cur.length>1) out.push(cur); cur=[]; } } if(cur.length>1) out.push(cur); return out; }
function bboxOf(rings){let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const r of rings)for(const p of r){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1]}return [x0,y0,x1,y1]}
/** Assemble des segments de ways (membres de relation) en anneaux fermés */
function stitch(segs){
  const key=p=>p.lon+','+p.lat, rings=[], open=[];
  for(const s of segs){ if(s.length<2) continue; (key(s[0])===key(s[s.length-1])?rings:open).push(s.slice()); }
  while(open.length){
    let cur=open.pop(), guard=0;
    while(key(cur[0])!==key(cur[cur.length-1]) && guard++<10000){
      const end=key(cur[cur.length-1]); let i=open.findIndex(s=>key(s[0])===end), rev=false;
      if(i<0){ i=open.findIndex(s=>key(s[s.length-1])===end); rev=true; }
      if(i<0) break;
      const s=open.splice(i,1)[0]; if(rev) s.reverse(); cur=cur.concat(s.slice(1));
    }
    rings.push(cur);
  }
  return rings;
}
/** Complète la géométrie des chemins et des membres de relation décrits par des références de nœuds (fichier .osm, JSON OSM) */
function normalizeElements(els){
  const nodes=new Map(), ways=new Map();
  for(const e of els){ if(e.type==='node') nodes.set(e.id,{lat:e.lat,lon:e.lon}); }
  for(const e of els){
    if(e.type!=='way') continue;
    if(!e.geometry && e.nodes){ const g=e.nodes.map(id=>nodes.get(id)).filter(Boolean); if(g.length>1) e.geometry=g; }
    if(e.geometry) ways.set(e.id,e.geometry);
  }
  for(const e of els){
    if(e.type!=='relation'||!e.members) continue;
    for(const m of e.members){ if(m.type==='way' && !m.geometry && ways.has(m.ref)) m.geometry=ways.get(m.ref); }
  }
  return els;
}
function parseOsm(json){
  normalizeElements(json.elements||[]);
  const d={water:[],waterLines:[],parks:[],buildings:[],rails:[],roads:{}};
  ROADS.forEach(([k])=>d.roads[k]=[]);
  const add=(arr,rings,extra)=>{const pr=rings.map(toPts);arr.push({rings:pr,bb:bboxOf(pr),...extra})};
  for(const el of json.elements||[]){
    const t=el.tags||{};
    if(el.type==='way' && el.geometry){
      const g=[el.geometry];
      if(t.building) add(d.buildings,g);
      else if(t.natural==='water'||t.waterway==='riverbank') add(d.water,g);
      else if(WATERWAY_W[t.waterway]) add(d.waterLines,g,{cls:t.waterway});
      else if(t.leisure==='park'||t.leisure==='garden'||t.natural==='wood'||['grass','forest','meadow','recreation_ground'].includes(t.landuse)) add(d.parks,g);
      else if(t.railway==='rail') add(d.rails,g,{tunnel:t.tunnel&&t.tunnel!=='no'});
      else if(HW_CLASS[t.highway] && t.area!=='yes') add(d.roads[HW_CLASS[t.highway]],g,{tunnel:t.tunnel&&t.tunnel!=='no'});
    } else if(el.type==='relation' && el.members){
      const segs=el.members.filter(m=>m.type==='way'&&m.geometry&&m.geometry.length).flatMap(m=>splitNull(m.geometry));
      if(!segs.length) continue;
      const rings=stitch(segs);
      if(t.natural==='water'||t.waterway==='riverbank') add(d.water,rings);
      else if(t.leisure==='park') add(d.parks,rings);
    }
  }
  d.count=[d.water,d.waterLines,d.parks,d.buildings,d.rails,...Object.values(d.roads)].reduce((a,x)=>a+x.length,0);
  d.extent=dataExtent(d);
  return d;
}
function dataExtent(d){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const arr of [d.water,d.waterLines,d.parks,d.buildings,d.rails,...Object.values(d.roads)]) for(const f of arr){
    if(f.bb[0]<x0)x0=f.bb[0]; if(f.bb[1]<y0)y0=f.bb[1]; if(f.bb[2]>x1)x1=f.bb[2]; if(f.bb[3]>y1)y1=f.bb[3]; }
  return x0>x1?null:{w:x0,e:x1,s:imerc(y0),n:imerc(y1)};
}
/** Cache des tracés : des Path2D par classe, en pixels « monde » relatifs au centre des données, pour une taille
 *  de monde S donnée (zoom et largeur du cadre). Pendant un déplacement, seule la translation change : les
 *  géométries ne sont plus reprojetées à chaque image. Reconstruit si S ou les données changent ; quelques tailles
 *  sont gardées (aperçu, seconde vue, export) pour ne pas reconstruire à chaque alternance.
 *  Les classes nombreuses (bâtiments, voies) sont regroupées par carreau de VEC_CELL px : seuls les carreaux
 *  visibles sont tracés, comme l'élagage objet par objet d'avant. */
const vecCache=new WeakMap(), VEC_CACHE_MAX=3, VEC_CELL=256;
function vecPaths(data,S){
  let byS=vecCache.get(data); if(!byS){ byS=new Map(); vecCache.set(data,byS); }
  const key=S.toPrecision(12); let P=byS.get(key);
  if(P){ byS.delete(key); byS.set(key,P); return P; }   // le plus récent en dernier
  const e=data.extent, ox=e?(e.w+e.e)/2:0, oy=e?merc((e.s+e.n)/2):0, kx=S/360, ky=S/(2*Math.PI);
  const trace=(path,ring,close)=>{ for(let i=0;i<ring.length;i++){ const q=ring[i], x=(q[0]-ox)*kx, y=(oy-q[1])*ky; i?path.lineTo(x,y):path.moveTo(x,y); } if(close) path.closePath(); };
  // regroupement par carreau (case de la grille contenant le coin bas-gauche de l'objet) ; bb du carreau = union des bb
  const cw=VEC_CELL/kx, ch=VEC_CELL/ky;
  const merged=(arr,close)=>{ const cells=new Map();
    for(const f of arr){ const id=Math.floor(f.bb[0]/cw)+':'+Math.floor(f.bb[1]/ch); let cell=cells.get(id);
      if(!cell) cells.set(id,cell={bb:[...f.bb],path:new Path2D()});
      else { const b=cell.bb; if(f.bb[0]<b[0])b[0]=f.bb[0]; if(f.bb[1]<b[1])b[1]=f.bb[1]; if(f.bb[2]>b[2])b[2]=f.bb[2]; if(f.bb[3]>b[3])b[3]=f.bb[3]; }
      trace(cell.path,f.rings[0],close); }
    return [...cells.values()]; };
  // surfaces remplies feature par feature (règle evenodd propre à chaque objet : îles, clairières) ; bb gardé pour l'élagage
  const each=arr=>arr.map(f=>{ const path=new Path2D(); for(const rg of f.rings) trace(path,rg,true); return {bb:f.bb,path}; });
  P={ox,oy,
    parks:each(data.parks), water:each(data.water),
    waterLines:Object.keys(WATERWAY_W).map(cls=>[cls,merged(data.waterLines.filter(f=>f.cls===cls),false)]),
    buildings:merged(data.buildings,true), rails:merged(data.rails,false),
    roads:Object.fromEntries(ROADS.map(([cls])=>[cls,{tun:merged(data.roads[cls].filter(f=>f.tunnel),false),open:merged(data.roads[cls].filter(f=>!f.tunnel),false)}]))};
  byS.set(key,P); if(byS.size>VEC_CACHE_MAX) byS.delete(byS.keys().next().value);
  return P;
}
/** Vecteurs du moteur Fichier dans le cadre r, pour une vue {center, zoom} (par défaut la vue éditée) */
function drawVectors(ctx, r, data, view=st){
  const c=st.colors, S=worldSize(r.w,view.zoom), cx=r.x+r.w/2, cy=r.y+r.h/2, lon0=view.center.lon, m0=merc(view.center.lat);
  const kx=S/360, ky=S/(2*Math.PI);
  const k=r.w/REF_W*st.stroke*zoomFactor(view.zoom);
  const P=vecPaths(data,S), tx=cx+(P.ox-lon0)*kx, ty=cy+(m0-P.oy)*ky;   // position de l'origine du cache dans le cadre
  // fenêtre visible en coordonnées (lon, merc) pour l'élagage des surfaces
  const vx0=lon0-(r.w/2)/kx, vx1=lon0+(r.w/2)/kx, vy0=m0-(r.h/2)/ky, vy1=m0+(r.h/2)/ky;
  const vis=f=>!(f.bb[2]<vx0||f.bb[0]>vx1||f.bb[3]<vy0||f.bb[1]>vy1);
  // carreaux visibles réunis en un seul tracé : un croisement entre deux carreaux n'est pas peint deux fois (passes transparentes)
  const visPath=cells=>{ const path=new Path2D(); for(const f of cells) if(vis(f)) path.addPath(f.path); return path; };
  const strokeCells=cells=>ctx.stroke(visPath(cells));
  const fx=st.fx||{}, scale=r.w/REF_W, wk=k/st.stroke*st.waterMult;
  /** Motif fixé au cadre, pas aux données (pas N en px) */
  const pattern=(kind,N,a,b)=>{ const tile=patTile(kind,N*2,a,b), pat=ctx.createPattern(tile,'repeat');
    pat.setTransform(new DOMMatrix().translate(r.x-tx,r.y-ty).scale(N/tile.width)); return pat; };
  const waterPaint = fx.hatch ? pattern('hatch',FX_HATCH*scale,c.water,c.land) : c.water;
  ctx.save(); ctx.translate(tx,ty);
  ctx.lineCap='round'; ctx.lineJoin='round';
  if(fx.waterlines){   // lignes d'eau : contours parallèles autour des rives, du plus lointain au plus proche
    const g=WL_GAP*scale, lw=WL_W*scale, ink=fxInk(c.water,0.32), wp=visPath(P.water);
    for(let i=WL_N;i>=1;i--){
      const ring=w=>{ ctx.lineWidth=w; ctx.stroke(wp); for(const [cls,cells] of P.waterLines){ ctx.lineWidth=WATERWAY_W[cls]*wk+w; strokeCells(cells); } };
      ctx.strokeStyle=ink; ctx.globalAlpha=wlAlpha(i); ring(2*i*g);
      ctx.strokeStyle=c.land; ctx.globalAlpha=1; ring(2*i*g-2*lw);
    }
  }
  if(st.layers.parks){ ctx.fillStyle=fx.parkHatch ? pattern('cross',FX_CROSS*scale,c.park,c.land) : c.park; for(const f of P.parks) if(vis(f)) ctx.fill(f.path,'evenodd'); }
  const drawWater=()=>{
    ctx.strokeStyle=c.water;
    for(const [cls,cells] of P.waterLines){ ctx.lineWidth=WATERWAY_W[cls]*wk; strokeCells(cells); }
    ctx.fillStyle=waterPaint; for(const f of P.water) if(vis(f)) ctx.fill(f.path,'evenodd');
  };
  if(!fx.riso) drawWater();
  if(st.layers.buildings && data.buildings.length){
    if(fx.outline){ ctx.save(); ctx.strokeStyle=c.roadMinor; ctx.lineWidth=OUTLINE_W*k; ctx.globalAlpha=0.8; strokeCells(P.buildings); ctx.restore(); }
    else { ctx.fillStyle=fx.dots ? pattern('dots',FX_DOTS*scale,c.building,c.land) : c.building; ctx.fill(visPath(P.buildings)); }
  }
  if(st.layers.rail && data.rails.length){
    ctx.strokeStyle=c.rail; ctx.lineWidth=0.8*k; ctx.setLineDash([3*k,2*k]); ctx.lineCap='butt';
    strokeCells(P.rails); ctx.setLineDash([]); ctx.lineCap='round';
  }
  const roads=(color,wMul,passes)=>{
    for(const [cls,w,col] of ROADS){
      if(!data.roads[cls].length) continue;
      ctx.strokeStyle=color||c[col];
      for(const [dx,dy,a,wf] of passes){
        ctx.save(); ctx.translate(dx,dy); ctx.lineWidth=w*k*wf*wMul;
        ctx.globalAlpha=0.4*a; strokeCells(P.roads[cls].tun);
        ctx.globalAlpha=a; strokeCells(P.roads[cls].open);
        ctx.restore();
      }
    }
  };
  if(fx.glow) for(const [wf,a] of GLOW) roads(null,wf,[[0,0,a,1]]);   // lueur : halos larges et pâles sous les rues
  const passes = fx.pencil ? PENCIL.map(([dx,dy])=>[dx*k,dy*k,PENCIL_ALPHA,PENCIL_W]) : [[0,0,1,1]];
  roads(null,1,passes);
  if(fx.quarter){   // quartier en relief : rues du rayon autour du repère, à la couleur du repère
    const q=project(view.marker.lat,view.marker.lon,r,view);
    ctx.save(); ctx.beginPath(); ctx.arc(q.x-tx,q.y-ty,focusRadius(r.w),0,7); ctx.clip(); roads(c.marker,QUARTER_W,passes); ctx.restore();
  }
  if(fx.riso){   // surimpression : l'eau, imprimée comme une plaque à part, décalée et fondue sur le reste
    ctx.save(); ctx.translate(RISO[0]*scale,RISO[1]*scale); ctx.globalCompositeOperation=lum(c.land)<0.3?'screen':'multiply'; ctx.globalAlpha=RISO_ALPHA;
    drawWater(); ctx.restore();
  }
  ctx.restore();
}
/** Bandeau du moteur Fichier : invite à importer tant qu'aucune donnée n'est chargée */
function checkDataBanner(){
  if(st.engine==='file') showBanner(!osmData,'Aucun fichier importé','Importer',()=>$('fileIn').click());
}
function netMsg(e){
  const m=(e&&e.message)||String(e);
  return /Failed to fetch|NetworkError|Load failed|blocked/i.test(m) ? 'accès réseau bloqué ou serveur injoignable' : m;
}

// ---------- Effets de tracé (communs aux deux moteurs, aperçu et export) ----------
// Toutes les mesures sont en px pour un cadre de 800 px (REF_W) puis mises à l'échelle du cadre : même rendu à toute taille.
const FX_HATCH=6, FX_DOTS=5, FX_CROSS=7;  // pas des motifs : eau hachurée, bâtiments pointillés, parcs hachurés
const PENCIL=[[1.2,-0.9],[-0.9,1.0]];   // trait crayon : deux passes décalées (× k), transparentes
const PENCIL_ALPHA=0.62, PENCIL_W=0.72, OUTLINE_W=0.35;
const GLOW=[[6,0.07],[3.4,0.12],[2,0.2]];  // lueur : [largeur (× trait), opacité] des halos, du plus large au plus serré
const WL_N=5, WL_GAP=2.4, WL_W=0.45;       // lignes d'eau : nombre, pas et épaisseur
const wlAlpha=i=>0.85*(1-(i-1)/WL_N);      // opacité de la ligne de rang i (1 : la plus proche de la rive)
const RISO=[2.6,-1.6], RISO_ALPHA=0.9;     // surimpression : décalage de la plaque « eau », opacité
const QUARTER_W=1.25;                      // quartier en relief : rues un peu plus épaisses
/** Encre d'un effet : la teinte assombrie sur papier clair, éclaircie sur papier sombre */
const fxInk=(hex,f)=>lum(st.colors.land)<0.3 ? tint(hex,f) : shade(hex,f);
/** Tuile de motif opaque, sans couture : 'hatch' (eau, traits à 45°), 'dots' (bâtiments), 'cross' (parcs, hachures croisées).
 *  a : couleur de l'élément (son encre en est tirée), b : fond (eau et bâtiments sur la terre, parcs sur leur couleur). */
function patTile(kind, T, a, b){
  T=Math.max(2,Math.round(T)); const cv=document.createElement('canvas'); cv.width=cv.height=T; const c=cv.getContext('2d');
  if(kind==='hatch'){
    c.fillStyle=b; c.fillRect(0,0,T,T); c.strokeStyle=shade(a,0.28); c.lineWidth=T*(lum(a)<0.05?0.16:0.3); c.lineCap='square';   // eau très sombre (Encre) : traits plus fins
    c.beginPath(); for(const o of [-T,0,T]){ c.moveTo(o,T); c.lineTo(o+T,0); } c.stroke();
  } else if(kind==='dots'){
    c.fillStyle=mix(a,b,0.55); c.fillRect(0,0,T,T); c.fillStyle=fxInk(a,0.3);
    for(const [x,y] of [[0.25,0.25],[0.75,0.75]]){ c.beginPath(); c.arc(x*T,y*T,T*0.17,0,7); c.fill(); }
  } else {
    c.fillStyle=a; c.fillRect(0,0,T,T); c.strokeStyle=fxInk(a,0.22); c.lineWidth=T*0.09; c.lineCap='square';
    c.beginPath(); for(const o of [-T,0,T]){ c.moveTo(o,T); c.lineTo(o+T,0); c.moveTo(o,0); c.lineTo(o+T,T); } c.stroke();
  }
  return cv;
}
/** Tuile de hachures de l'eau (conservée pour les tests et la console) */
const hatchTile=(T,water,land)=>patTile('hatch',T,water,land);
/** Identifiant d'un motif MapLibre : contient tout ce qu'il faut pour le recréer à la demande (styleimagemissing) */
const patId=(kind,N,scale,pr,a,b)=>`pat:${kind}:${(N*scale).toFixed(3)}:${pr.toFixed(3)}:${a}:${b}`;
function onImageMissing(map,e){
  const m=/^pat:(hatch|dots|cross):([\d.]+):([\d.]+):(#[0-9A-Fa-f]{6}):(#[0-9A-Fa-f]{6})$/.exec(e.id); if(!m || map.hasImage(e.id)) return;
  const css=+m[2], dev=Math.max(2,Math.round(css*+m[3])), d=patTile(m[1],dev,m[4],m[5]).getContext('2d').getImageData(0,0,dev,dev);
  map.addImage(e.id,{width:dev,height:dev,data:new Uint8Array(d.data.buffer)},{pixelRatio:dev/css});
}
/** Disque autour du repère d'une vue (polygone géographique, 64 côtés) : filtre `within` du quartier en relief */
function focusPolygon(view){
  const S=worldSize(REF_W,view.zoom), R=focusRadius(REF_W), m0=merc(view.marker.lat), ring=[];
  for(let i=0;i<=64;i++){ const a=i/64*2*Math.PI; ring.push([view.marker.lon+Math.cos(a)*R/S*360, imerc(m0-Math.sin(a)*R*2*Math.PI/S)]); }
  return {type:'Polygon',coordinates:[ring]};
}

// ---------- Moteur 1 : MapLibre + OpenFreeMap ----------
/** k : facteur d'épaisseur ; scale : largeur du cadre / 800 ; pr : densité de pixels de la carte (motifs) ; view : vue dessinée */
function buildStyle(k, scale=k/(st.stroke*zoomFactor(st.zoom)), pr=window.devicePixelRatio||1, view=st){
  const c=st.colors, L=[], fx=st.fx||{}, wk=k/st.stroke*st.waterMult;
  const lineGeom=['in',['geometry-type'],['literal',['LineString','MultiLineString']]];
  const wwFilter=['in',['get','class'],['literal',['river','canal','stream']]], wwWidth=(add=0)=>['match',['get','class'],'river',3*wk+add,'canal',2*wk+add,0.8*wk+add];
  const waterFilter=['!=',['coalesce',['get','intermittent'],0],1];
  L.push({id:'bg',type:'background',paint:{'background-color':c.land}});
  if(fx.waterlines){   // lignes d'eau : deux traits parallèles (line-gap-width) de part et d'autre du contour ; le côté eau est recouvert
    const g=WL_GAP*scale, lw=WL_W*scale, ink=fxInk(c.water,0.32);
    for(let i=WL_N;i>=1;i--){ const gap=2*i*g-lw, p={'line-color':ink,'line-width':lw,'line-opacity':wlAlpha(i)};
      L.push({id:`waterline-${i}`,type:'line',source:'omt','source-layer':'water',filter:waterFilter,layout:{'line-join':'round'},paint:{...p,'line-gap-width':gap}});
      L.push({id:`waterwayline-${i}`,type:'line',source:'omt','source-layer':'waterway',filter:wwFilter,layout:{'line-cap':'round','line-join':'round'},paint:{...p,'line-gap-width':wwWidth(gap)}}); }
  }
  if(st.layers.parks){
    const paint = fx.parkHatch ? {'fill-pattern':patId('cross',FX_CROSS,scale,pr,c.park,c.land)} : {'fill-color':c.park,'fill-antialias':false};
    L.push({id:'landcover',type:'fill',source:'omt','source-layer':'landcover',filter:['in',['get','class'],['literal',['grass','wood']]],paint});
    L.push({id:'park',type:'fill',source:'omt','source-layer':'park',paint});
  }
  const water=(id,tr)=>[
    {id:'waterway'+id,type:'line',source:'omt','source-layer':'waterway',filter:wwFilter,layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':c.water,'line-width':wwWidth(),...(tr?{'line-translate':tr,'line-opacity':RISO_ALPHA}:{})}},
    {id:'water'+id,type:'fill',source:'omt','source-layer':'water',filter:waterFilter,
      paint:{...(fx.hatch ? {'fill-pattern':patId('hatch',FX_HATCH,scale,pr,c.water,c.land)} : {'fill-color':c.water}),...(tr?{'fill-translate':tr,'fill-opacity':RISO_ALPHA}:{})}}];
  if(!fx.riso) L.push(...water(''));
  if(st.layers.buildings) L.push(fx.outline
    ? {id:'building',type:'line',source:'omt','source-layer':'building',paint:{'line-color':c.roadMinor,'line-width':OUTLINE_W*k,'line-opacity':0.8}}
    : {id:'building',type:'fill',source:'omt','source-layer':'building',paint:fx.dots ? {'fill-pattern':patId('dots',FX_DOTS,scale,pr,c.building,c.land)} : {'fill-color':c.building,'fill-antialias':false}});
  if(st.layers.rail) L.push({id:'rail',type:'line',source:'omt','source-layer':'transportation',filter:['all',lineGeom,['==',['get','class'],'rail']],
    paint:{'line-color':c.rail,'line-width':0.8*k,'line-dasharray':[3,2]}});
  const tunnel=a=>['case',['==',['get','brunnel'],'tunnel'],0.4*a,a];
  const roads=(pre,color,wMul,extra)=>{ for(const [cls,w,col] of ROADS){
    const f = cls==='path' ? ['in',['get','class'],['literal',['path','track']]] : ['==',['get','class'],cls];
    const base={type:'line',source:'omt','source-layer':'transportation',filter:['all',lineGeom,f,...(extra||[])],layout:{'line-cap':'round','line-join':'round'}};
    if(fx.pencil) PENCIL.forEach(([dx,dy],i)=>L.push({...base,id:`${pre}${cls}-${i}`,
      paint:{'line-color':color||c[col],'line-width':w*k*PENCIL_W*wMul,'line-translate':[dx*k,dy*k],'line-opacity':tunnel(PENCIL_ALPHA)}}));
    else L.push({...base,id:pre+cls,paint:{'line-color':color||c[col],'line-width':w*k*wMul,'line-opacity':tunnel(1)}});
  } };
  if(fx.glow) GLOW.forEach(([wf,a],i)=>{ for(const [cls,w,col] of ROADS){   // lueur : traits larges, flous et pâles sous les rues
    const f = cls==='path' ? ['in',['get','class'],['literal',['path','track']]] : ['==',['get','class'],cls];
    L.push({id:`glow-${i}-${cls}`,type:'line',source:'omt','source-layer':'transportation',filter:['all',lineGeom,f],layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':c[col],'line-width':w*k*wf,'line-blur':w*k*wf*0.5,'line-opacity':tunnel(a*1.3)}}); } });
  roads('road-',null,1);
  if(fx.quarter) roads('quarter-',c.marker,QUARTER_W,[['within',focusPolygon(view)]]);   // rues entièrement dans le rayon du repère
  if(fx.riso) L.push(...water('-plate',[RISO[0]*scale,RISO[1]*scale]));   // plaque d'eau décalée, par-dessus (fondu approché par l'opacité)
  return {version:8,sources:{omt:{type:'vector',url:OFM_URL,attribution:OFM_ATTRIBUTION}},layers:L};
}
/** Charge un script local (données du ciel) ; `integrity` (SRI) pour un fichier servi par un tiers */
function loadScript(src,ms,integrity){
  return new Promise((res,rej)=>{ const sc=document.createElement('script'); sc.src=src; sc.async=true;
    if(integrity){ sc.integrity=integrity; sc.crossOrigin='anonymous'; }
    const t=setTimeout(()=>{sc.remove();rej(new Error('délai dépassé'))},ms);
    sc.onload=()=>{clearTimeout(t);res()}; sc.onerror=()=>{clearTimeout(t);sc.remove();rej(new Error('bloqué'))};
    document.head.appendChild(sc); });
}
/** Charge MapLibre (js/maplibre-loader.js) et reporte son état dans mlLib / mlCdn */
async function loadMaplibre(){
  if(mlLib!=='ok') mlLib='loading';
  const ok=await CMS.maplibre.load({consent});
  mlLib=CMS.maplibre.state; mlCdn=CMS.maplibre.source;
  return ok;
}
/** Librairie arrivée après l'échec de toutes les sources (réseau lent) : la carte est relancée */
addEventListener('cms:maplibre-ready',()=>{
  mlLib='ok'; mlCdn=CMS.maplibre.source; mlFailMsg=''; showBanner(false); updateEngineUI();
  if(st.engine==='maplibre') renderMap(true);
});
function mlFail(msg){
  if(mlFailMsg) return; mlFailMsg=msg;
  setStatus(msg,'err');
  if(st.engine==='maplibre') showBanner(true,'Carte indisponible','Diagnostiquer',runDiagnostics);
}
const mlK = cssW => cssW/REF_W*st.stroke*zoomFactor(st.zoom);
const mlZoom = cssW => st.zoom + Math.log2(cssW/REF_W);
let mlSync=false;
function initMaplibre(){
  if(mlMap || mlLib!=='ok') return !!mlMap;
  if(!needConsent()){ setStatus('Carte en attente de votre accord','wait'); return false; }
  const w=ui.slotCss.w||300;
  try{
    mlMap=new CMS.maplibre.lib.Map({container:'mlMap',style:buildStyle(mlK(w),w/REF_W),center:[st.center.lon,st.center.lat],zoom:mlZoom(w),
      attributionControl:false,dragRotate:false,pitchWithRotate:false,touchPitch:false,maxPitch:0,fadeDuration:0,renderWorldCopies:false});
  }catch(e){ console.error(e); mlMap=null; return false; }
  mlMap.touchZoomRotate.disableRotation(); mlMap.keyboard.disableRotation();
  mlMap.on('move',()=>{ if(mlSync) return; const cc=mlMap.getCenter(); st.center={lat:cc.lat,lon:cc.lng}; st.zoom=mlMap.getZoom()-Math.log2(ui.slotCss.w/REF_W); scheduleOver(); syncZoomUI(); });
  mlMap.on('styleimagemissing',e=>onImageMissing(mlMap,e));
  mlMap.on('moveend',()=>{ mlMap.setStyle(buildStyle(mlK(ui.slotCss.w),ui.slotCss.w/REF_W)); saveState(); });
  mlMap.on('click',e=>{ if(ui.placing){ placeAt(e.lngLat.lat,e.lngLat.lng); } });
  // Perte du contexte WebGL (mémoire graphique saturée, onglet en arrière-plan sur mobile) : MapLibre le rétablit seul,
  // l'interface le signale et l'export attend
  mlMap.on('webglcontextlost',()=>{ ui.glLost=true; if(st.engine==='maplibre') setStatus('Carte GPU suspendue (mémoire graphique) : rétablissement…','wait'); });
  mlMap.on('webglcontextrestored',()=>{ ui.glLost=false; mlRestyle(); if(st.engine==='maplibre') setStatus('Prêt · Vectoriel GPU (OpenFreeMap)'); });
  // Messages du moteur GPU seulement quand il est actif : sinon ils écraseraient l'état du moteur Fichier
  mlMap.on('dataloading',()=>{ if(st.engine==='maplibre') setStatus('Chargement des tuiles…','busy'); });
  mlMap.on('idle',()=>{ if(st.engine==='maplibre') setStatus('Prêt · Vectoriel GPU (OpenFreeMap)'); });
  let gotTiles=false;
  mlMap.on('data',e=>{ if(e.dataType==='source' && e.sourceId==='omt' && e.isSourceLoaded){ gotTiles=true; if(mlFailMsg){ mlFailMsg=''; showBanner(false); } } });
  mlMap.on('error',e=>{ const m=(e&&e.error&&e.error.message)||''; console.warn('MapLibre',m);
    if(!gotTiles && /fetch|network|AJAX|status|blocked|Load failed|CORS/i.test(m)) mlFail('Tuiles OpenFreeMap inaccessibles ('+netMsg(e.error)+')'); });
  setTimeout(()=>{ if(!gotTiles && mlMap && st.engine==='maplibre') mlFail('Les tuiles OpenFreeMap ne se chargent pas (15 s).'); },15000);
  return true;
}
/** Moteur Fichier : la carte MapLibre (contexte WebGL, mémoire GPU) est libérée après ML_RELEASE_MS, recréée au retour */
const ML_RELEASE_MS=30000;
let mlReleaseT=0;
function mlKeepAlive(active){
  if(active){ clearTimeout(mlReleaseT); mlReleaseT=0; return; }
  if(!mlMap || mlReleaseT) return;
  const ms=(typeof TEST_HOOKS!=='undefined' && TEST_HOOKS && globalThis.__cmsTestConfig?.mlRelease) || ML_RELEASE_MS;
  mlReleaseT=setTimeout(()=>{ mlReleaseT=0;
    if(st.engine==='maplibre' || !mlMap) return;
    try{ mlMap.remove(); }catch(e){ console.warn('MapLibre',e); }
    mlMap=null; ui.glLost=false;
  },ms);
}
function mlUpdateView(){
  if(!mlMap) return;
  mlSync=true; mlMap.resize(); mlMap.jumpTo({center:[st.center.lon,st.center.lat],zoom:mlZoom(ui.slotCss.w)}); mlSync=false;
}
function mlRestyle(){ if(mlMap) mlMap.setStyle(buildStyle(mlK(ui.slotCss.w),ui.slotCss.w/REF_W)); }
/** Côté maximal d'un canevas WebGL sur cet appareil (GL_TILE_MAX au plus : limite courante des mobiles) */
let glMaxCache=0;
function glMax(){
  if(glMaxCache) return glMaxCache;
  let m=GL_TILE_MAX;
  try{ const gl=document.createElement('canvas').getContext('webgl');
    if(gl){ const v=gl.getParameter(gl.MAX_VIEWPORT_DIMS); m=Math.min(m,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),gl.getParameter(gl.MAX_TEXTURE_SIZE),v[0],v[1]);
      const lose=gl.getExtension('WEBGL_lose_context'); if(lose) lose.loseContext(); } }catch(e){}
  return glMaxCache=Math.max(1024,m||GL_TILE_MAX);
}
// Projection de Mercator en pixels CSS au zoom de la carte (tuiles de 512 px, comme MapLibre)
const mercX=(lon,ws)=>(lon+180)/360*ws;
const mercY=(lat,ws)=>{ const s=Math.sin(lat*Math.PI/180); return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*ws; };
const unmercX=(x,ws)=>x/ws*360-180;
const unmercY=(y,ws)=>180/Math.PI*Math.atan(Math.sinh(Math.PI-2*Math.PI*y/ws));
/** File d'attente des rendus MapLibre hors écran (vue figée, export, tuiles) : un seul contexte WebGL hors écran à la fois */
const gpuQueue=(()=>{ let tail=Promise.resolve(); return fn=>{ const run=tail.then(()=>fn()); tail=run.catch(()=>{}); return run; }; })();
const SNAP_TIMEOUT=45000;
/** Une carte MapLibre hors écran (cssW × cssH px CSS, densité pr) ; draw(canevas WebGL) est appelé une fois la carte prête.
 *  Échec immédiat si le contexte WebGL est perdu ou si le rendu échoue ; au bout de SNAP_TIMEOUT, la carte est livrée telle quelle (warn). */
function mlSnapshot(cssW,cssH,pr,center,view,draw){
  return gpuQueue(()=>new Promise((resolve,reject)=>{
    const div=document.createElement('div');
    div.className='ml-offscreen';
    div.style.cssText=`position:fixed;left:-20000px;top:0;width:${cssW}px;height:${cssH}px;pointer-events:none`;
    document.body.appendChild(div);
    let map=null, done=false, timer=0;
    const cleanup=()=>{ clearTimeout(timer); try{ map?.remove(); }catch(_){} div.remove(); };
    const fail=e=>{ if(done) return; done=true; cleanup(); reject(e); };
    const finish=warn=>{ if(done) return; done=true;
      try{ draw(map.getCanvas()); cleanup(); resolve(warn); } catch(e){ cleanup(); reject(e); } };
    try{
      map=new CMS.maplibre.lib.Map({container:div,style:buildStyle(st.stroke*zoomFactor(view.zoom),1,pr,view),center:[center.lon,center.lat],zoom:view.zoom,
        pixelRatio:pr,interactive:false,preserveDrawingBuffer:true,fadeDuration:0,attributionControl:false,renderWorldCopies:false,maxCanvasSize:[8192,8192]});
    }catch(e){ fail(e); return; }
    map.on('styleimagemissing',e=>onImageMissing(map,e));
    map.on('webglcontextlost',()=>fail(new Error('contexte WebGL perdu (mémoire graphique saturée) : réessayez')));
    // Erreurs de rendu (pas celles d'une tuile ou d'une source : « idle » ou le délai tranchent)
    map.on('error',e=>{ const m=e?.error?.message||''; if(!e?.sourceId && !e?.tile && /WebGL|context|shader/i.test(m)) fail(e.error); });
    map.once('idle',()=>finish(false));
    timer=setTimeout(()=>finish(true),SNAP_TIMEOUT);
  }));
}
/** Rendu MapLibre hors écran à pleine résolution pour l'export.
 *  Au-delà du côté maximal d'un canevas WebGL (glMax : 4096 px sur la plupart des mobiles), la carte serait rendue
 *  en basse définition puis agrandie : elle est alors rendue en tuiles (même zoom, centres décalés en Mercator),
 *  chacune débordant un peu sur ses voisines (pas d'effet de bord sur les traits), puis recollées sans raccord. */
async function renderMaplibreOffscreen(wPx,hPx,view=st){
  const pr=wPx/REF_W, out=document.createElement('canvas'); out.width=wPx; out.height=hPx; const o=out.getContext('2d');
  const max=glMax(), B=Math.ceil(8*pr), nx=Math.ceil(wPx/(max-2*B-4*pr)), ny=Math.ceil(hPx/(max-2*B-4*pr));
  if(nx*ny===1){   // cas courant (A4) : une seule carte, étirée au pixel près
    const warn=await mlSnapshot(REF_W,Math.round(REF_W*hPx/wPx),pr,view.center,view,c=>o.drawImage(c,0,0,wPx,hPx));
    return {canvas:out,warn};
  }
  const ws=512*2**view.zoom, cx=mercX(view.center.lon,ws), cy=mercY(view.center.lat,ws);
  let warn=false;
  try{
    for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){
      const x0=Math.round(i*wPx/nx), x1=Math.round((i+1)*wPx/nx), y0=Math.round(j*hPx/ny), y1=Math.round((j+1)*hPx/ny);
      const cw=Math.ceil((x1-x0+2*B)/pr), ch=Math.ceil((y1-y0+2*B)/pr);   // taille CSS entière de la tuile (débord compris)
      const mx=(x0+x1)/2, my=(y0+y1)/2;                                    // centre de la tuile (px de sortie)
      const center={lon:unmercX(cx+(mx-wPx/2)/pr,ws), lat:unmercY(cy+(my-hPx/2)/pr,ws)};
      warn = await mlSnapshot(cw,ch,pr,center,view,c=>{
        o.save(); o.beginPath(); o.rect(x0,y0,x1-x0,y1-y0); o.clip();
        o.drawImage(c,0,0,c.width,c.height,mx-cw*pr/2,my-ch*pr/2,cw*pr,ch*pr); o.restore();
      }) || warn;
    }
  }catch(e){ out.width=out.height=0; throw e; }
  return {canvas:out,warn};
}
