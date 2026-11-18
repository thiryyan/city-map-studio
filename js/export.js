/* City Map Studio — Export PNG 300 DPI, contexte d'exécution, diagnostic réseau, import de fichier.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html. */
'use strict';
// ---------- Export PNG 300 DPI ----------
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC_T[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
/** Insère un chunk pHYs (300 DPI = 11811 px/m) après IHDR */
async function withDpi(blob,dpi){
  const src=new Uint8Array(await blob.arrayBuffer()), ppm=Math.round(dpi/0.0254);
  const chunk=new Uint8Array(21), dv=new DataView(chunk.buffer);
  dv.setUint32(0,9); chunk.set([0x70,0x48,0x59,0x73],4); dv.setUint32(8,ppm); dv.setUint32(12,ppm); chunk[16]=1;
  dv.setUint32(17,crc32(chunk.subarray(4,17)));
  const out=new Uint8Array(src.length+21); out.set(src.subarray(0,33),0); out.set(chunk,33); out.set(src.subarray(33),54);
  return new Blob([out],{type:'image/png'});
}
const slug=s=>(s||'ville').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'ville';
let lastUrl=null;
async function exportPoster(){
  if(st.engine==='maplibre' && !needConsent(()=>exportPoster())) return;
  if(st.engine!=='maplibre' && !opData){ toast(st.engine==='file'?'Importez d\'abord un fichier de données.':'Chargez d\'abord les vecteurs Overpass.',true); return; }
  setBusy(true,'Chargement des polices…'); let show=false;
  try{
    const {W:EW,H:EH}=posterDims();
    const {canvas:cv,warn,fontWarn}=await composePoster(EW,EH,t=>$('busyTxt').textContent=t);
    $('busyTxt').textContent='Encodage PNG 300 DPI…';
    const blob0=await new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error('toBlob a échoué')),'image/png'));
    cv.width=cv.height=0;   // ≈ 35 Mo de pixels libérés avant d'assembler le PNG final (limite mémoire des canevas sur iOS)
    const blob=await withDpi(blob0,300);
    const name=`affiche-carte-${slug(st.texts.title)}-300dpi.png`;
    if(lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl=URL.createObjectURL(blob);
    $('resImg').src=lastUrl; $('resDl').href=lastUrl; $('resDl').download=name;
    $('resInfo').textContent=`${name} · ${EW} × ${EH} px · 300 DPI · ${(blob.size/1048576).toFixed(1)} Mo`+(warn?' · ⚠ certaines tuiles ont pu manquer (délai dépassé)':'')+(fontWarn?' · ⚠ police non chargée : une police de secours a été utilisée':'');
    // Partage : le fichier n'est créé qu'au moment du partage (pas de copie gardée en mémoire avec la fenêtre)
    const asFile=()=>new File([blob],name,{type:'image/png'});
    const canShare=!!(navigator.canShare && navigator.canShare({files:[asFile()]}));
    $('resShare').hidden=!canShare;
    $('resShare').onclick=()=>navigator.share({files:[asFile()],title:name}).catch(()=>{});
    show=true;
    try{ const a=document.createElement('a'); a.href=lastUrl; a.download=name; document.body.appendChild(a); a.click(); a.remove(); }catch(e){}
  }catch(e){
    console.error(e); toast('Échec de l\'export : '+(e.message||e),true);
  }finally{ setBusy(false); }
  if(show) openDialog('result');
}

// ---------- Contexte d'exécution ----------
const ENV = (()=>{
  let framed=false; try{ framed = window.self!==window.top; }catch(e){ framed=true; }
  const proto=location.protocol;
  return {framed, proto, http:/^https?:$/.test(proto), blocked:false};
})();
function showEnvWarning(){
  const w=$('envWarn'); let msg=null;   // [titre en gras, explication]
  if(ENV.framed) msg=['Page ouverte dans un aperçu intégré.','Ces aperçus (messageries, assistants, visionneuses) bloquent le réseau et les téléchargements : les cartes ne peuvent pas se charger. Ouvrez le fichier directement dans Chrome, ou utilisez le moteur « Fichier ».'];
  else if(!ENV.http && ENV.proto!=='file:') msg=['Page ouverte depuis une visionneuse ('+ENV.proto.replace(':','')+').','Si les cartes ne se chargent pas, ouvrez le fichier dans Chrome ou utilisez le moteur « Fichier ».'];
  if(navigator.onLine===false) msg=['Appareil hors ligne.','Utilisez le moteur « Fichier » avec des données déjà téléchargées.'];
  w.hidden=!msg; w.replaceChildren(...(msg ? [h('b',{},msg[0]),' '+msg[1]] : []));
}

// ---------- Diagnostic réseau ----------
async function probe(fn,ms=10000){
  const ctl=new AbortController(), t=setTimeout(()=>ctl.abort(),ms), t0=performance.now();
  try{ const r=await fn(ctl.signal); clearTimeout(t); return {ok:r.ok, status:r.status, op:r.op, info:r.info||('HTTP '+r.status), ms:Math.round(performance.now()-t0)}; }
  catch(e){ clearTimeout(t); return {ok:false, info:e.name==='AbortError'?'délai dépassé':netMsg(e)}; }
}
async function runDiagnostics(){
  if(!needConsent(()=>runDiagnostics())) return;
  openAdvanced(true);
  const box=$('diag'); box.textContent=''; $('bDiag').disabled=true;
  const line=(label)=>{ const d=h('div',{},h('span',{className:'wt'},'…'),h('span',{},label),h('small')); box.appendChild(d); return d; };
  const set=(d,r)=>{ d.children[0].className=r.ok?'ok':'ko'; d.children[0].textContent=r.ok?'✓':'✗'; d.children[2].textContent=r.info+(r.ms?` · ${r.ms} ms`:''); };
  const env=line('Contexte'); set(env,{ok:!ENV.framed&&navigator.onLine!==false, info:(ENV.framed?'aperçu intégré (sandbox) · ':'')+ENV.proto+(navigator.onLine===false?' · hors ligne':'')});
  const lib=line('Librairie MapLibre'); set(lib,{ok:mlLib==='ok', info: mlLib==='ok'?('chargée'+(mlCdn?' via '+mlCdn:'')):mlLib==='loading'?'chargement en cours':'aucun CDN joignable'});
  const tests=[
    ['Tuiles OpenFreeMap', s=>fetch(OFM_URL,{signal:s}).then(async r=>({ok:r.ok&&!!(await r.json()).tiles,status:r.status}))],
    ...OVERPASS.map(u=>['Overpass · '+new URL(u).host, async s=>{
      const b=opBlockInfo(u); if(b) return {ok:false,status:b.status,info:opBlockMsg(b),op:'suspended'};   // pas de nouvel essai
      let r;
      try{ r=await fetch(u,{method:'POST',body:'data='+encodeURIComponent('[out:json][timeout:5];node(1);out;'),headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:s}); }
      catch(e){ if(e.name==='AbortError') throw e; return {ok:false,status:0,info:'pas de réponse (connexion, ou erreur serveur sans CORS)',op:'nores'}; }
      if(r.status===406||r.status===429){ opSuspend(u,r.status,r.headers.get('Retry-After')); return {ok:false,status:r.status,info:'HTTP '+r.status+' · '+opBlockMsg(opBlockInfo(u)),op:'suspended'}; }
      return {ok:r.ok,status:r.status,op:r.ok?'ok':'http'}; }, OP_TIMEOUT.diag]),
    ['Géocodage Nominatim', s=>fetch(NOMINATIM+'?format=json&limit=1&q=Blois',{signal:s}).then(r=>({ok:r.ok,status:r.status}))]
  ];
  const results=await Promise.all(tests.map(async([label,fn,ms])=>{ const d=line(label); const r=await probe(fn,ms); set(d,r); return r; }));
  const anyOk=results.some(r=>r.ok);
  ENV.blocked=!anyOk;
  const c=document.createElement('div'); c.className='note';
  c.textContent = !anyOk ? '→ Aucun service n\'est joignable depuis cette page. Ouvrez le fichier dans Chrome (pas dans un aperçu), vérifiez la connexion, ou utilisez le moteur « Fichier ».'
    : results[0].ok && mlLib==='ok' ? '→ Le moteur Vectoriel GPU devrait fonctionner.'
    : results.slice(1,1+OVERPASS.length).some(r=>r.ok) ? '→ Utilisez le moteur Overpass.' : '→ Utilisez le moteur « Fichier ».';
  box.appendChild(c);
  // Overpass : tous les miroirs en échec alors que d'autres services répondent → panne côté serveurs
  const op=results.slice(1,1+OVERPASS.length);
  if(anyOk && !op.some(r=>r.ok)){
    const o=document.createElement('div'); o.className='diagOp';
    o.textContent = op.every(r=>r.op==='suspended')
      ? '→ Overpass : tous les serveurs sont suspendus après un refus (406/429). Utilisez le moteur Vectoriel GPU ou « Fichier » en attendant la reprise.'
      : '→ Overpass : aucun serveur public ne répond correctement (erreurs 5xx ou délai dépassé), alors que votre connexion fonctionne. La panne vient des serveurs Overpass : réessayez plus tard, ou utilisez le moteur Vectoriel GPU ou « Fichier ».';
    box.appendChild(o);
  }
  $('bDiag').disabled=false;
}

// ---------- Moteur 3 : import de fichier (hors ligne) ----------
function currentQuery(){
  const g=geom(st,posterDims().W,posterDims().H); return buildQuery(viewBounds(st,g.map.h/g.map.w,0.15));
}
function overpassGetUrl(){ return (opAvailable()[0]||OVERPASS[0])+'?data='+encodeURIComponent(currentQuery()); }
function osmXmlToElements(txt){
  const doc=new DOMParser().parseFromString(txt,'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('XML illisible');
  const tags=n=>{ const o={}; n.querySelectorAll(':scope > tag').forEach(t=>o[t.getAttribute('k')]=t.getAttribute('v')); return o; };
  const els=[];
  doc.querySelectorAll('osm > node').forEach(n=>els.push({type:'node',id:+n.getAttribute('id'),lat:+n.getAttribute('lat'),lon:+n.getAttribute('lon')}));
  doc.querySelectorAll('osm > way').forEach(w=>els.push({type:'way',id:+w.getAttribute('id'),tags:tags(w),nodes:[...w.querySelectorAll(':scope > nd')].map(n=>+n.getAttribute('ref'))}));
  doc.querySelectorAll('osm > relation').forEach(r=>els.push({type:'relation',id:+r.getAttribute('id'),tags:tags(r),
    members:[...r.querySelectorAll(':scope > member')].map(m=>({type:m.getAttribute('type'),ref:+m.getAttribute('ref'),role:m.getAttribute('role')||''}))}));
  return els;
}
function geojsonToElements(gj){
  const els=[]; let id=1;
  const ring=c=>c.map(([lon,lat])=>({lat,lon}));
  const feats = gj.type==='FeatureCollection' ? gj.features : gj.type==='Feature' ? [gj] : [];
  for(const f of feats){
    const g=f.geometry; if(!g) continue;
    const p=f.properties||{}; const tags=(p.tags&&typeof p.tags==='object')?p.tags:p;
    if(g.type==='LineString') els.push({type:'way',id:id++,tags,geometry:ring(g.coordinates)});
    else if(g.type==='MultiLineString') g.coordinates.forEach(c=>els.push({type:'way',id:id++,tags,geometry:ring(c)}));
    else if(g.type==='Polygon'||g.type==='MultiPolygon'){
      const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
      if(polys.length===1 && polys[0].length===1) els.push({type:'way',id:id++,tags,geometry:ring(polys[0][0])});
      else els.push({type:'relation',id:id++,tags,members:polys.flatMap(pl=>pl.map((r,i)=>({type:'way',role:i?'inner':'outer',geometry:ring(r)})))});
    }
  }
  return els;
}
function importText(txt,name=''){
  let els; const t=txt.trimStart();
  if(t.startsWith('<')) els=osmXmlToElements(t);
  else { const j=JSON.parse(t); els = Array.isArray(j.elements) ? j.elements : (j.type ? geojsonToElements(j) : null); }
  if(!els) throw new Error('format non reconnu');
  const d=parseOverpass({elements:els});
  if(!d.count || !d.extent) throw new Error('aucun objet cartographique exploitable');
  d.source='file'; d.bounds=d.extent; d.layers=JSON.stringify(st.layers);
  opData=d;
  // recadrage si la vue courante ne recoupe pas les données
  const e=d.extent, inside=(st.center.lat>e.s&&st.center.lat<e.n&&st.center.lon>e.w&&st.center.lon<e.e);
  if(!inside){
    const sx=REF_W*360/Math.max(1e-6,e.e-e.w), z=Math.log2(sx/512);
    const lat=(e.s+e.n)/2, lon=(e.w+e.e)/2; st.center={lat,lon}; st.zoom=clamp(z,10,18); syncZoomUI();
    const mk=st.marker; if(!(mk.lat>e.s&&mk.lat<e.n&&mk.lon>e.w&&mk.lon<e.e)){ st.marker={lat,lon}; updateMarkerTxt(); }
  }
  if(st.engine!=='file'){ st.engine='file'; setSeg('engineSeg','file'); updateEngineUI(); }
  showBanner(false); renderMap(true); saveState();
  setStatus(`Fichier ${name} importé · ${d.count.toLocaleString('fr-FR')} objets`);
  return d.count;
}
async function importFile(f){
  try{ setStatus('Lecture du fichier…','busy'); const n=importText(await f.text(),f.name); toast(`${n.toLocaleString('fr-FR')} objets importés`); }
  catch(e){ setStatus('Import impossible : '+e.message,'err'); toast('Import impossible : '+e.message,true); }
}
