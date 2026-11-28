/* City Map Studio — Export PNG et PDF, contexte d'exécution, diagnostic réseau, import de fichier.
 * Module ES (#102), importé par js/main.js ; réuni en un seul script par le build (scripts/build.mjs).html. */
import {late} from './core.js';
import {OFM_URL, REF_W} from './config.js';
import {mlCdn, mlLib, needConsent, osmData, saveState, setBusy, setOsmData, st, ui} from './state.js';
import {clamp, exportSpec} from './geo.js';
import {netMsg, parseOsm} from './engines.js';
import {$, composePoster, h, renderMap} from './preview.js';
import {setStatus, showBanner, toast} from './features.js';
import {openAdvanced, setSeg, showTab, syncZoomUI, updateEngineUI, updateMarkerTxt} from './ui.js';
// Module CMS.export : tout ce fichier lui est privé, sauf les fonctions reprises en fin de fichier (utilisées par les autres fichiers).
CMS.define('export', () => {
// ---------- Export PNG (résolution inscrite dans le fichier) ----------
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC_T[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
/** Insère un chunk pHYs (résolution ; 300 DPI = 11811 px/m) après IHDR */
async function withDpi(blob,dpi){
  const src=new Uint8Array(await blob.arrayBuffer()), ppm=Math.round(dpi/0.0254);
  const chunk=new Uint8Array(21), dv=new DataView(chunk.buffer);
  dv.setUint32(0,9); chunk.set([0x70,0x48,0x59,0x73],4); dv.setUint32(8,ppm); dv.setUint32(12,ppm); chunk[16]=1;
  dv.setUint32(17,crc32(chunk.subarray(4,17)));
  const out=new Uint8Array(src.length+21); out.set(src.subarray(0,33),0); out.set(chunk,33); out.set(src.subarray(33),54);
  return new Blob([out],{type:'image/png'});
}
// ---------- Export PDF (sans dépendance) ----------
/** Chaîne PDF en UTF-16BE hexadécimal (accents des titres) */
const pdfText=t=>'<FEFF'+[...String(t)].map(ch=>{ const c=ch.codePointAt(0);
  const u=c>0xFFFF?[0xD800+((c-0x10000)>>10),0xDC00+((c-0x10000)&0x3FF)]:[c]; return u.map(x=>x.toString(16).padStart(4,'0')).join(''); }).join('').toUpperCase()+'>';
/** PDF d'une page à la taille exacte d'impression (mm → points) : l'affiche y est une image JPEG (DCTDecode), sans
 *  rééchantillonnage. Écrit à la main (une dizaine d'objets) : aucune bibliothèque à embarquer. */
function pdfFromJpeg(jpeg, wPx, hPx, mm, title){
  const pt=v=>(v/25.4*72).toFixed(2), W=pt(mm[0]), H=pt(mm[1]), enc=new TextEncoder();
  const d=new Date(), z=n=>String(n).padStart(2,'0');
  const date=`D:${d.getUTCFullYear()}${z(d.getUTCMonth()+1)}${z(d.getUTCDate())}${z(d.getUTCHours())}${z(d.getUTCMinutes())}${z(d.getUTCSeconds())}Z`;
  const content=`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  const objs=[
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /TrimBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    [`<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,jpeg,`\nendstream`],
    `<< /Title ${pdfText(title)} /Creator (City Map Studio) /Producer (City Map Studio) /CreationDate (${date}) >>`
  ];
  const parts=[], offs=[]; let n=0;
  const put=x=>{ const b=typeof x==='string'?enc.encode(x):x; parts.push(b); n+=b.length; };
  put('%PDF-1.4\n'); put(new Uint8Array([0x25,0xE2,0xE3,0xCF,0xD3,0x0A]));   // en-tête, puis commentaire binaire (fichier non textuel)
  objs.forEach((o,i)=>{ offs.push(n); put(`${i+1} 0 obj\n`); (Array.isArray(o)?o:[o]).forEach(put); put('\nendobj\n'); });
  const xref=n;
  put(`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offs.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join(''));
  put(`trailer\n<< /Size ${objs.length+1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts,{type:'application/pdf'});
}

const slug=s=>(s||'ville').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'ville';
const toBlobP=(cv,type,q)=>new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error('l\'image n\'a pas pu être encodée (mémoire insuffisante ?)')),type,q));
let lastUrl=null, lastImgUrl=null;
async function exportPoster(){
  const illus=st.mode==='illus';   // affiche illustrée : aucune carte, donc ni accord réseau ni données
  if(st.mode!=='map' && !CMS.illus.ready()){ toast('Importez d\'abord votre illustration (onglet Illustration, étape 2).',true); return; }
  if(!illus && st.engine==='maplibre' && !needConsent(()=>exportPoster())) return;
  if(!illus && st.engine!=='maplibre' && !osmData){ toast('Importez d\'abord un fichier de données.',true); return; }
  if(!illus && st.engine==='maplibre' && ui.glLost){ toast('Carte GPU momentanément indisponible (mémoire graphique) : réessayez dans un instant.',true); return; }
  const t0=performance.now();   // mesure de l'export (CMS.perf) : jusqu'au fichier prêt
  setBusy(true,'Chargement des polices…'); let show=false;
  try{
    const spec=exportSpec(), {W:EW,H:EH,dpi}=spec, pdf=st.fileType==='pdf';
    const {canvas:cv,warn,fontWarn}=await composePoster(EW,EH,t=>$('busyTxt').textContent=t);
    $('busyTxt').textContent=pdf?'Création du PDF…':`Encodage PNG ${dpi} DPI…`;
    const blob0=await toBlobP(cv,pdf?'image/jpeg':'image/png',pdf?0.95:undefined);
    cv.width=cv.height=0;   // pixels libérés avant d'assembler le fichier final (limite mémoire des canevas sur iOS)
    const blob=pdf ? pdfFromJpeg(new Uint8Array(await blob0.arrayBuffer()),EW,EH,spec.mm,st.texts.title||'Affiche') : await withDpi(blob0,dpi);
    CMS.perf.since('export-'+spec.key, t0, `${pdf?'PDF':'PNG'} ${EW} × ${EH} px`);
    const name=`affiche-${illus?'illustration':'carte'}-${slug(st.texts.title)}${spec.key==='a4'?'':'-'+spec.key}-${dpi}dpi.${pdf?'pdf':'png'}`;
    if(lastUrl) URL.revokeObjectURL(lastUrl);
    if(lastImgUrl){ URL.revokeObjectURL(lastImgUrl); lastImgUrl=null; }
    lastUrl=URL.createObjectURL(blob);
    if(pdf) lastImgUrl=URL.createObjectURL(blob0);   // aperçu : l'image du PDF
    $('resImg').src=lastImgUrl||lastUrl; $('resDl').href=lastUrl; $('resDl').download=name;
    const cm=v=>(v/10).toLocaleString('fr-FR');
    $('resInfo').textContent=`${name} · ${/^a\d/.test(spec.key)?`${spec.name} `:''}(${cm(spec.mm[0])} × ${cm(spec.mm[1])} cm) · ${EW} × ${EH} px · ${dpi} DPI · ${(blob.size/1048576).toFixed(1)} Mo`+(warn?' · ⚠ certaines tuiles ont pu manquer (délai dépassé)':'')+(fontWarn?' · ⚠ police non chargée : une police de secours a été utilisée':'');
    // Partage : le fichier n'est créé qu'au moment du partage (pas de copie gardée en mémoire avec la fenêtre)
    const asFile=()=>new File([blob],name,{type:blob.type});
    const canShare=!!(navigator.canShare && navigator.canShare({files:[asFile()]}));
    $('resShare').hidden=!canShare;
    $('resShare').onclick=()=>navigator.share({files:[asFile()],title:name}).catch(()=>{});
    show=true;
    try{ const a=document.createElement('a'); a.href=lastUrl; a.download=name; document.body.appendChild(a); a.click(); a.remove(); }catch(e){}
  }catch(e){
    console.error(e); toast('Échec de l\'export : '+(e.message||e),true);
  }finally{ setBusy(false); }
  // Résultat dans l'onglet Export : aperçu, informations, téléchargement, partage
  if(show){ showTab('export'); $('result').hidden=false; CMS.panelScroll.to($('result'),'nearest'); $('resDl').focus({preventScroll:true}); }
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
  try{ const r=await fn(ctl.signal); clearTimeout(t); return {ok:r.ok, status:r.status, info:r.info||('HTTP '+r.status), ms:Math.round(performance.now()-t0)}; }
  catch(e){ clearTimeout(t); return {ok:false, info:e.name==='AbortError'?'délai dépassé':netMsg(e)}; }
}
async function runDiagnostics(){
  if(!needConsent(()=>runDiagnostics())) return;
  openAdvanced(true);
  const box=$('diag'); box.textContent=''; $('bDiag').disabled=true;
  const line=(label)=>{ const d=h('div',{},h('span',{className:'wt'},'…'),h('span',{},label),h('small')); box.appendChild(d); return d; };
  const set=(d,r)=>{ d.children[0].className=r.ok?'ok':'ko'; d.children[0].textContent=r.ok?'✓':'✗'; d.children[2].textContent=r.info+(r.ms?` · ${r.ms} ms`:''); };
  const env=line('Contexte'); set(env,{ok:!ENV.framed&&navigator.onLine!==false, info:(ENV.framed?'aperçu intégré (sandbox) · ':'')+ENV.proto+(navigator.onLine===false?' · hors ligne':'')});
  // Version : celle de la page, et celle du cache hors ligne si elle diffère (mise à jour pas encore appliquée)
  const ver=line('Version'), B=CMS.build, swv=await CMS.pwa.version();
  set(ver,{ok:!swv || swv===B.version, info:B.label(B.version)+(swv && swv!==B.version ? ' · copie hors ligne : '+B.label(swv)+' → « Mettre à jour » ou rechargez la page' : swv ? ' · copie hors ligne à jour' : ' · sans copie hors ligne')});
  const lib=line('Librairie MapLibre'); set(lib,{ok:mlLib==='ok', info: mlLib==='ok'?('chargée'+(mlCdn?' via '+mlCdn:'')):mlLib==='loading'?'chargement en cours':'aucun CDN joignable'});
  const tests=[
    ['Tuiles OpenFreeMap', s=>fetch(OFM_URL,{signal:s}).then(async r=>({ok:r.ok&&!!(await r.json()).tiles,status:r.status}))],
    // État du service : ne consomme pas de recherche. Si la réponse n'est pas lisible par la page (en-tête CORS absent de
    // /status, filtre de contenu…), un second appel sans lecture (no-cors) distingue un serveur joignable d'un réseau bloqué.
    ['Géocodage Nominatim', async s=>{
      try{ const r=await fetch(CMS.geocoder.statusUrl(),{signal:s}); return {ok:r.ok,status:r.status}; }
      catch(e){
        if(s.aborted) throw e;
        const o=await fetch(CMS.geocoder.statusUrl(),{signal:s,mode:'no-cors',cache:'no-store'});   // échoue aussi si le serveur est injoignable
        return {ok:true,info:o.type==='opaque' ? 'serveur joignable (état non lisible par la page)' : 'HTTP '+o.status};
      }
    }]
  ];
  const results=await Promise.all(tests.map(async([label,fn,ms])=>{ const d=line(label); const r=await probe(fn,ms); set(d,r); return r; }));
  const anyOk=results.some(r=>r.ok);
  ENV.blocked=!anyOk;
  const c=document.createElement('div'); c.className='note';
  c.textContent = !anyOk ? '→ Aucun service n\'est joignable depuis cette page. Ouvrez le fichier dans Chrome (pas dans un aperçu), vérifiez la connexion, ou utilisez le moteur « Fichier ».'
    : results[0].ok && mlLib==='ok' ? '→ Le moteur Vectoriel GPU devrait fonctionner.'
    : '→ Utilisez le moteur « Fichier ».';
  box.appendChild(c);
  $('bDiag').disabled=false;
}

// ---------- Moteur 3 : import de fichier (hors ligne) ----------
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
  const d=parseOsm({elements:els});
  if(!d.count || !d.extent) throw new Error('aucun objet cartographique exploitable');
  d.source='file'; d.bounds=d.extent; d.layers=JSON.stringify(st.layers);
  setOsmData(d);
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

return {slug, exportPoster, ENV, showEnvWarning, runDiagnostics, importText, importFile};
});
const {slug, exportPoster, ENV, showEnvWarning, runDiagnostics, importText, importFile} = CMS.export;

// ---------- Mesures de performance : affichage et copie (#101) ----------
CMS.define('perfUI', () => {
  const P = CMS.perf, fmt = ms => ms >= 1000 ? `${(ms / 1000).toLocaleString('fr-FR', {maximumFractionDigits: 1})} s` : `${ms} ms`;
  const budget = k => k === 'geste' ? `≤ ${P.BUDGET[k]} ms entre deux images` : k in P.BUDGET ? `budget ${fmt(P.BUDGET[k])}` : 'sans budget';
  const ORDER = Object.keys(P.LABEL);
  const rows = () => P.latest().sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k));
  const render = () => {
    const box = $('perfOut'), r = rows();
    box.replaceChildren(...(r.length ? r.map(m => h('div', {},
      h('span', {className: P.ok(m) ? 'ok' : 'ko'}, P.ok(m) ? '✓' : '✗'),
      h('span', {}, `${P.LABEL[m.k] || m.k} : ${fmt(m.ms)}`),
      h('small', {}, [budget(m.k), m.info].filter(Boolean).join(' · ')))) :
      [h('div', {}, h('small', {}, 'Aucune mesure pour l\'instant : ouvrez la page, changez un réglage, déplacez la carte, exportez.'))]));
  };
  /** Texte copié : appareil, version, puis une ligne par mesure */
  const text = () => [
    `City Map Studio ${CMS.build.label(CMS.build.version)} · ${new Date().toLocaleString('fr-FR')}`,
    `Appareil : ${navigator.userAgent}`,
    `Écran : ${screen.width} × ${screen.height}, densité ${devicePixelRatio}`,
    ...rows().map(m => `${P.ok(m) ? '✓' : '✗'} ${P.LABEL[m.k] || m.k} : ${fmt(m.ms)} (${budget(m.k)}${m.info ? ' · ' + m.info : ''})`)
  ].join('\n');
  const init = () => {
    render(); CMS.on('perf:mesure', render);
    $('bPerfCopy').onclick = () => (navigator.clipboard ? navigator.clipboard.writeText(text()) : Promise.reject())
      .then(() => toast('Mesures copiées.'), () => toast('Copie impossible sur cet appareil.', true));
  };
  return {init, text};
});

// Fonctions lues par des fichiers chargés avant celui-ci (registre late de js/core.js)
Object.assign(late, {exportPoster, importFile, runDiagnostics, slug});

export {ENV, exportPoster, importFile, importText, runDiagnostics, showEnvWarning, slug};
