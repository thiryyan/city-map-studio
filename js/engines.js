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
  const fx=st.fx||{}, scale=r.w/REF_W;
  ctx.save(); ctx.translate(tx,ty);
  ctx.lineCap='round'; ctx.lineJoin='round';
  if(st.layers.parks){ ctx.fillStyle=c.park; for(const f of P.parks) if(vis(f)) ctx.fill(f.path,'evenodd'); }
  ctx.strokeStyle=c.water;
  for(const [cls,cells] of P.waterLines){ ctx.lineWidth=WATERWAY_W[cls]*k/st.stroke*st.waterMult; strokeCells(cells); }
  if(fx.hatch){ const N=FX_HATCH*scale, tile=hatchTile(N*2,c.water,c.land), pat=ctx.createPattern(tile,'repeat');
    pat.setTransform(new DOMMatrix().translate(r.x-tx,r.y-ty).scale(N/tile.width)); ctx.fillStyle=pat; }   // motif fixé au cadre, pas aux données
  else ctx.fillStyle=c.water;
  for(const f of P.water) if(vis(f)) ctx.fill(f.path,'evenodd');
  if(st.layers.buildings && data.buildings.length){
    if(fx.outline){ ctx.save(); ctx.strokeStyle=c.roadMinor; ctx.lineWidth=OUTLINE_W*k; ctx.globalAlpha=0.8; strokeCells(P.buildings); ctx.restore(); }
    else { ctx.fillStyle=c.building; ctx.fill(visPath(P.buildings)); }
  }
  if(st.layers.rail && data.rails.length){
    ctx.strokeStyle=c.rail; ctx.lineWidth=0.8*k; ctx.setLineDash([3*k,2*k]); ctx.lineCap='butt';
    strokeCells(P.rails); ctx.setLineDash([]); ctx.lineCap='round';
  }
  const passes = fx.pencil ? PENCIL.map(([dx,dy])=>[dx*k,dy*k,PENCIL_ALPHA,PENCIL_W]) : [[0,0,1,1]];
  for(const [cls,w,col] of ROADS){
    if(!data.roads[cls].length) continue;
    ctx.strokeStyle=c[col];
    for(const [dx,dy,a,wf] of passes){
      ctx.save(); ctx.translate(dx,dy); ctx.lineWidth=w*k*wf;
      ctx.globalAlpha=0.4*a; strokeCells(P.roads[cls].tun);
      ctx.globalAlpha=a; strokeCells(P.roads[cls].open);
      ctx.restore();
    }
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
const FX_HATCH=6;                        // pas des hachures de l'eau
const PENCIL=[[1.2,-0.9],[-0.9,1.0]];   // trait crayon : deux passes décalées (× k), transparentes
const PENCIL_ALPHA=0.62, PENCIL_W=0.72, OUTLINE_W=0.35;
/** Teinte assombrie (f : part de noir) : traits de hachure lisibles sur une eau pâle */
const shade=(hex,f)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-f)).toString(16).padStart(2,'0')).join('');
/** Tuile de hachures à 45° : fond couleur terre, traits couleur eau (opaque, raccord sans couture) */
function hatchTile(T, water, land){
  T=Math.max(2,Math.round(T)); const cv=document.createElement('canvas'); cv.width=cv.height=T; const c=cv.getContext('2d');
  c.fillStyle=land; c.fillRect(0,0,T,T); c.strokeStyle=shade(water,0.28); c.lineWidth=T*0.3; c.lineCap='square';
  c.beginPath(); for(const o of [-T,0,T]){ c.moveTo(o,T); c.lineTo(o+T,0); } c.stroke(); return cv;
}
/** Identifiant du motif MapLibre : contient tout ce qu'il faut pour le recréer à la demande (styleimagemissing) */
const hatchId=(scale,pr)=>`hatch:${(FX_HATCH*scale).toFixed(3)}:${pr.toFixed(3)}:${st.colors.water}:${st.colors.land}`;
function onImageMissing(map,e){
  const m=/^hatch:([\d.]+):([\d.]+):(#[0-9A-Fa-f]{6}):(#[0-9A-Fa-f]{6})$/.exec(e.id); if(!m || map.hasImage(e.id)) return;
  const css=+m[1], dev=Math.max(2,Math.round(css*+m[2])), d=hatchTile(dev,m[3],m[4]).getContext('2d').getImageData(0,0,dev,dev);
  map.addImage(e.id,{width:dev,height:dev,data:new Uint8Array(d.data.buffer)},{pixelRatio:dev/css});
}

// ---------- Moteur 1 : MapLibre + OpenFreeMap ----------
/** k : facteur d'épaisseur ; scale : largeur du cadre / 800 ; pr : densité de pixels de la carte (motif de hachures) */
function buildStyle(k, scale=k/(st.stroke*zoomFactor(st.zoom)), pr=window.devicePixelRatio||1){
  const c=st.colors, L=[], fx=st.fx||{};
  const lineGeom=['in',['geometry-type'],['literal',['LineString','MultiLineString']]];
  L.push({id:'bg',type:'background',paint:{'background-color':c.land}});
  if(st.layers.parks){
    L.push({id:'landcover',type:'fill',source:'omt','source-layer':'landcover',filter:['in',['get','class'],['literal',['grass','wood']]],paint:{'fill-color':c.park,'fill-antialias':false}});
    L.push({id:'park',type:'fill',source:'omt','source-layer':'park',paint:{'fill-color':c.park,'fill-antialias':false}});
  }
  L.push({id:'waterway',type:'line',source:'omt','source-layer':'waterway',filter:['in',['get','class'],['literal',['river','canal','stream']]],
    layout:{'line-cap':'round','line-join':'round'},
    paint:{'line-color':c.water,'line-width':['match',['get','class'],'river',3*k/st.stroke*st.waterMult,'canal',2*k/st.stroke*st.waterMult,0.8*k/st.stroke*st.waterMult]}});
  L.push({id:'water',type:'fill',source:'omt','source-layer':'water',filter:['!=',['coalesce',['get','intermittent'],0],1],
    paint: fx.hatch ? {'fill-pattern':hatchId(scale,pr)} : {'fill-color':c.water}});
  if(st.layers.buildings) L.push(fx.outline
    ? {id:'building',type:'line',source:'omt','source-layer':'building',paint:{'line-color':c.roadMinor,'line-width':OUTLINE_W*k,'line-opacity':0.8}}
    : {id:'building',type:'fill',source:'omt','source-layer':'building',paint:{'fill-color':c.building,'fill-antialias':false}});
  if(st.layers.rail) L.push({id:'rail',type:'line',source:'omt','source-layer':'transportation',filter:['all',lineGeom,['==',['get','class'],'rail']],
    paint:{'line-color':c.rail,'line-width':0.8*k,'line-dasharray':[3,2]}});
  for(const [cls,w,col] of ROADS){
    const f = cls==='path' ? ['in',['get','class'],['literal',['path','track']]] : ['==',['get','class'],cls];
    const base={type:'line',source:'omt','source-layer':'transportation',filter:['all',lineGeom,f],layout:{'line-cap':'round','line-join':'round'}};
    if(fx.pencil) PENCIL.forEach(([dx,dy],i)=>L.push({...base,id:`road-${cls}-${i}`,
      paint:{'line-color':c[col],'line-width':w*k*PENCIL_W,'line-translate':[dx*k,dy*k],'line-opacity':['case',['==',['get','brunnel'],'tunnel'],0.4*PENCIL_ALPHA,PENCIL_ALPHA]}}));
    else L.push({...base,id:'road-'+cls,paint:{'line-color':c[col],'line-width':w*k,'line-opacity':['case',['==',['get','brunnel'],'tunnel'],0.4,1]}});
  }
  return {version:8,sources:{omt:{type:'vector',url:OFM_URL}},layers:L};
}
/** Charge un script ; `integrity` (SRI) pour un fichier servi par un tiers */
function loadScript(src,ms,integrity){
  return new Promise((res,rej)=>{ const sc=document.createElement('script'); sc.src=src; sc.async=true;
    if(integrity){ sc.integrity=integrity; sc.crossOrigin='anonymous'; }
    const t=setTimeout(()=>{sc.remove();rej(new Error('délai dépassé'))},ms);
    sc.onload=()=>{clearTimeout(t);res()}; sc.onerror=()=>{clearTimeout(t);sc.remove();rej(new Error('bloqué'))};
    document.head.appendChild(sc); });
}
async function loadMaplibre(){
  if(window.maplibregl){ mlLib='ok'; return true; }
  mlLib='loading';
  for(const base of ML_CDNS){
    if(!consent && /^https?:/.test(base)){ mlLib='local-fail'; return false; }   // CDN tiers : seulement après accord
    const remote=/^https?:/.test(base);
    try{
      await loadScript(base+'maplibre-gl.js',12000,remote?ML_SRI.js:'');
      if(window.maplibregl){
        const l=document.createElement('link'); l.rel='stylesheet'; l.href=base+'maplibre-gl.css';
        if(remote){ l.integrity=ML_SRI.css; l.crossOrigin='anonymous'; }
        document.head.appendChild(l);
        mlLib='ok'; mlCdn=/^https?:/.test(base)?new URL(base).host:'copie locale (lib/)'; return true;
      }
    }catch(e){ console.warn('MapLibre CDN',base,e.message); }
  }
  mlLib='fail'; return false;
}
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
    mlMap=new maplibregl.Map({container:'mlMap',style:buildStyle(mlK(w),w/REF_W),center:[st.center.lon,st.center.lat],zoom:mlZoom(w),
      attributionControl:false,dragRotate:false,pitchWithRotate:false,touchPitch:false,maxPitch:0,fadeDuration:0,renderWorldCopies:false});
  }catch(e){ console.error(e); mlMap=null; return false; }
  mlMap.touchZoomRotate.disableRotation(); mlMap.keyboard.disableRotation();
  mlMap.on('move',()=>{ if(mlSync) return; const cc=mlMap.getCenter(); st.center={lat:cc.lat,lon:cc.lng}; st.zoom=mlMap.getZoom()-Math.log2(ui.slotCss.w/REF_W); scheduleOver(); syncZoomUI(); });
  mlMap.on('styleimagemissing',e=>onImageMissing(mlMap,e));
  mlMap.on('moveend',()=>{ mlMap.setStyle(buildStyle(mlK(ui.slotCss.w),ui.slotCss.w/REF_W)); saveState(); });
  mlMap.on('click',e=>{ if(ui.placing){ placeAt(e.lngLat.lat,e.lngLat.lng); } });
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
function mlUpdateView(){
  if(!mlMap) return;
  mlSync=true; mlMap.resize(); mlMap.jumpTo({center:[st.center.lon,st.center.lat],zoom:mlZoom(ui.slotCss.w)}); mlSync=false;
}
function mlRestyle(){ if(mlMap) mlMap.setStyle(buildStyle(mlK(ui.slotCss.w),ui.slotCss.w/REF_W)); }
/** Rendu MapLibre hors écran à pleine résolution pour l'export */
function renderMaplibreOffscreen(wPx,hPx,view=st){
  return new Promise((resolve,reject)=>{
    const cssW=REF_W, cssH=Math.round(REF_W*hPx/wPx), pr=wPx/REF_W;
    const div=document.createElement('div');
    div.style.cssText=`position:fixed;left:-20000px;top:0;width:${cssW}px;height:${cssH}px;pointer-events:none`;
    document.body.appendChild(div);
    let map, done=false;
    const finish=(warn)=>{ if(done) return; done=true;
      try{ const out=document.createElement('canvas'); out.width=wPx; out.height=hPx; out.getContext('2d').drawImage(map.getCanvas(),0,0,wPx,hPx); map.remove(); div.remove(); resolve({canvas:out,warn}); }
      catch(e){ try{map.remove()}catch(_){} div.remove(); reject(e); } };
    try{
      map=new maplibregl.Map({container:div,style:buildStyle(st.stroke*zoomFactor(view.zoom),1,pr),center:[view.center.lon,view.center.lat],zoom:view.zoom,
        pixelRatio:pr,interactive:false,preserveDrawingBuffer:true,fadeDuration:0,attributionControl:false,renderWorldCopies:false,maxCanvasSize:[8192,8192]});
    }catch(e){ div.remove(); reject(e); return; }
    map.on('styleimagemissing',e=>onImageMissing(map,e));
    map.once('idle',()=>finish(false));
    setTimeout(()=>finish(true),45000);
  });
}
