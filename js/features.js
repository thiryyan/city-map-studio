/* City Map Studio — Lieux multiples, itinéraire GPX, partage par lien, ambiances, panneau coulissant.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html. */
'use strict';
// ---------- Plusieurs lieux ----------
function placeAt(lat,lon){
  const i=ui.placeIdx||0;
  if(i && st.markers2[i-1]){ st.markers2[i-1].lat=lat; st.markers2[i-1].lon=lon; setPlacing(false); renderPlaces(); changed(); toast(`Lieu ${i+1} placé`); }
  else setMarker(lat,lon);
}
function renderPlaces(){
  const box=$('mList'); box.textContent='';
  const row=(n,label,onLabel,extra)=>{ const d=document.createElement('div'); d.className='prow';
    const b=document.createElement('b'); b.textContent=n; const i=document.createElement('input'); i.type='text'; i.value=label; i.placeholder=n===1?'Lieu principal (ex. Rencontre)':'Nom du lieu (ex. Mariage)'; i.setAttribute('aria-label',`Nom du lieu ${n}`);
    i.oninput=()=>{ onLabel(i.value); changed(); }; d.append(b,i); if(extra) extra.forEach(e=>d.append(e)); box.appendChild(d); };
  row(1,st.markerLabel||'',v=>st.markerLabel=v);
  (st.markers2||[]).forEach((p,k)=>{
    const pl=document.createElement('button'); pl.type='button'; pl.className='btn sm'; pl.textContent='Placer'; pl.onclick=()=>setPlacing(true,k+1);
    const rm=document.createElement('button'); rm.type='button'; rm.className='btn sm'; rm.textContent='✕'; rm.setAttribute('aria-label',`Retirer le lieu ${k+2}`);
    rm.onclick=()=>{ st.markers2.splice(k,1); renderPlaces(); changed(); };
    row(k+2,p.label||'',v=>p.label=v,[pl,rm]); });
  $('bAddPlace').disabled=(st.markers2||[]).length>=2;
  $('placesHint').hidden=st.layout!=='diptych';
}
function addPlace(){
  if((st.markers2||[]).length>=2) return;
  st.markers2.push({lat:st.center.lat,lon:st.center.lon,label:''}); renderPlaces(); changed();
  setPlacing(true,st.markers2.length);
}

// ---------- Itinéraire (GPX) ----------
/** Simplification de Douglas-Peucker (tolérance en degrés) */
function simplify(pts,tol){
  if(pts.length<3) return pts; const keep=new Uint8Array(pts.length); keep[0]=keep[pts.length-1]=1; const stack=[[0,pts.length-1]];
  while(stack.length){ const [a,b]=stack.pop(); let md=0, mi=-1; const [y1,x1]=pts[a], [y2,x2]=pts[b], dx=x2-x1, dy=y2-y1, L=Math.hypot(dx,dy)||1e-12;
    for(let i=a+1;i<b;i++){ const d=Math.abs(dy*pts[i][1]-dx*pts[i][0]+x2*y1-y2*x1)/L; if(d>md){ md=d; mi=i; } }
    if(md>tol && mi>0){ keep[mi]=1; stack.push([a,mi],[mi,b]); } }
  return pts.filter((_,i)=>keep[i]);
}
function parseGpx(txt){
  const x=new DOMParser().parseFromString(txt,'application/xml'); if(x.querySelector('parsererror')) throw new Error('fichier GPX illisible');
  let nodes=[...x.getElementsByTagName('trkpt')]; if(!nodes.length) nodes=[...x.getElementsByTagName('rtept')]; if(!nodes.length) nodes=[...x.getElementsByTagName('wpt')];
  let pts=nodes.map(n=>[+n.getAttribute('lat'),+n.getAttribute('lon')]).filter(([a,b])=>isFinite(a)&&isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180);
  if(pts.length<2) throw new Error('aucun tracé trouvé (points trkpt, rtept ou wpt)');
  let tol=0.00002; while(pts.length>1500){ pts=simplify(pts,tol); tol*=2; }
  pts=pts.map(([a,b])=>[+a.toFixed(6),+b.toFixed(6)]);
  return {name:(x.querySelector('trk > name, rte > name, metadata > name, name')?.textContent||'').trim(), pts, show:true};
}
async function importGpx(f){
  try{ st.route=parseGpx(await f.text()); renderRoute(); fitRoute(); changed(); toast(`Itinéraire importé · ${st.route.pts.length} points`); }
  catch(e){ toast('Import GPX impossible : '+e.message,true); }
}
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
  setSeg('routeColor',st.routeStyle.color); $('routeDash').checked=!!st.routeStyle.dash; $('routeW').value=st.routeStyle.width; $('oRouteW').textContent='× '+st.routeStyle.width;
}

// ---------- Partage par lien ----------
// L'état de l'affiche (sans le moteur, ni un itinéraire long) est compressé dans l'ancre de l'adresse (#a=…) :
// rien n'est envoyé à un serveur ; le lien contient le lieu et les textes.
const b64u={enc:b=>{ let s=''; for(const x of b) s+=String.fromCharCode(x); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); },
  dec:t=>{ const s=atob(t.replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(s,c=>c.charCodeAt(0)); }};
/** Passe des octets dans un flux de (dé)compression ; au-delà de `max` octets produits, abandonne (lien piégé) */
async function pipeBytes(bytes,stream,max=Infinity){
  const reader=new Blob([bytes]).stream().pipeThrough(stream).getReader(), parts=[]; let n=0;
  for(;;){ const {done,value}=await reader.read(); if(done) break;
    n+=value.length; if(n>max){ reader.cancel().catch(()=>{}); throw new Error('contenu trop volumineux'); }
    parts.push(value); }
  const out=new Uint8Array(n); let o=0; for(const p of parts){ out.set(p,o); o+=p.length; } return out;
}
async function encodeShare(){
  const o=JSON.parse(JSON.stringify(st)); delete o.engine; let dropped=false;
  if(o.route && o.route.pts.length>400){ o.route=null; dropped=true; }
  const raw=new TextEncoder().encode(JSON.stringify(o));
  const data=window.CompressionStream ? 'z'+b64u.enc(await pipeBytes(raw,new CompressionStream('deflate-raw'))) : 'j'+b64u.enc(raw);
  return {url:location.href.split('#')[0]+'#a='+data, dropped};
}
async function decodeShare(t){
  if(t.length>SHARE_MAX_CHARS) throw new Error('lien trop long');
  const kind=t[0], bytes=b64u.dec(t.slice(1));
  const raw = kind==='z' ? await pipeBytes(bytes,new DecompressionStream('deflate-raw'),SHARE_MAX_BYTES) : bytes;
  if(raw.length>SHARE_MAX_BYTES) throw new Error('contenu trop volumineux');
  const o=JSON.parse(new TextDecoder().decode(raw));
  if(!o || typeof o!=='object' || Array.isArray(o)) throw new Error('contenu invalide');
  return o;
}
async function shareLink(){
  try{ const {url,dropped}=await encodeShare(); $('shareOut').value=url; $('shareBox').hidden=false; $('shareOut').select();
    let ok=false; try{ await navigator.clipboard.writeText(url); ok=true; }catch(e){}
    toast((ok?'Lien copié':'Copiez le lien affiché')+(dropped?' · itinéraire non inclus (trop long)':'')+(st.illus.img?' · l\'illustration n\'est pas dans le lien : le destinataire devra l\'importer':'')); }
  catch(e){ toast('Lien impossible : '+e.message,true); }
}
async function loadFromHash(){
  const m=/^#a=([zj][A-Za-z0-9_-]+)$/.exec(location.hash); if(!m) return;
  try{ applyConfig(await decodeShare(m[1]),'Affiche chargée depuis le lien · « Annuler » pour retrouver la vôtre'); }
  catch(e){ toast('Lien d\'affiche illisible : '+e.message,true); }
  finally{ history.replaceState(null,'',location.pathname+location.search); }
}
/** Applique une configuration venue de l'extérieur (lien, fichier, sauvegarde) : validée champ par champ (normState),
 *  le moteur courant est gardé, étape d'historique annulable ; en cas d'erreur, l'affiche précédente revient intacte. */
function applyConfig(o,msg){
  let before=null;
  try{
    commitHistory(0);
    const eng=st.engine, fresh=normState(o); before=structuredClone(st);
    replaceState(fresh,{engine:eng});
    setPlacing(false); syncInputs(); renderPlaces(); renderRoute(); layoutPreview(); loadFonts().then(()=>{ scheduleOver(); refreshCards(); }); goTo(st.center.lat,st.center.lon,st.zoom); redrawAll(true); drawTexture();
    commitHistory(); if(msg) toast(msg);
  }catch(e){
    if(before){ replaceState(before); try{ syncInputs(); layoutPreview(); }catch(_){} commitHistory(); }   // jamais d'état à moitié appliqué
    throw e;
  }
}
/** Remplace le contenu de l'état (l'objet `st` garde son identité : __cms.st et les fermetures restent valides) */
function replaceState(next,extra){ for(const k of Object.keys(st)) delete st[k]; Object.assign(st,next,extra||{}); }

// ---------- Ambiance au premier lancement ----------
// Proposée une seule fois : première visite sans affiche enregistrée, ni lien partagé ; après la demande d'accord.
const WELCOME_KEY='cityMapStudio.welcomed';
const firstVisit=(()=>{ try{ return !localStorage.getItem(WELCOME_KEY) && !localStorage.getItem(STORE_KEY); }catch(e){ return false; } })();
let welcomeDone=!firstVisit || /^#a=/.test(location.hash);
/** Premier lancement (#59) : une proposition d'ambiance non bloquante en tête des réglages, après l'éventuelle demande d'accord.
 *  L'affiche par défaut est visible tout de suite ; la proposition se ferme d'un toucher et ne revient plus, une fois fermée ou utilisée. */
function maybeWelcome(){
  try{ if(localStorage.getItem(WELCOME_KEY)) welcomeDone=true; }catch(e){}   // choix fait dans un autre onglet ou depuis le démarrage
  if(welcomeDone || !$('welStrip').hidden) return;
  if($('consent').classList.contains('show')) return;   // repris après le choix d'accord (giveConsent / declineConsent)
  const box=$('welAmb'); box.textContent='';
  AMBIANCES.forEach(([k,n])=>{ const b=h('button',{type:'button',dataset:{v:k},ariaPressed:'false'},h('canvas',{width:70,height:99}),h('small',{},n));
    b.onclick=()=>{ closeWelcome(false); applyAmbiance(k); box.querySelectorAll('button').forEach(x=>pressed(x,x===b)); }; box.appendChild(b); });
  const draw=()=>box.querySelectorAll('button').forEach(b=>{ const p=AMBIANCES.find(a=>a[0]===b.dataset.v)[2];
    thumb(b.querySelector('canvas'),{layout:p.layout,colors:THEMES[p.theme].c,font:p.font,fontTitle:p.fontTitle,markerStyle:p.markerStyle}); });
  draw();
  // polices des ambiances : chargées une fois (fichiers locaux), puis vignettes redessinées
  Promise.all(AMBIANCES.flatMap(([,,p])=>[p.font,p.fontTitle].filter(Boolean)).flatMap(f=>FONTS[f].load).map(f=>document.fonts.load(f).catch(()=>0))).then(draw);
  $('welStrip').hidden=false; document.querySelector('.tabbody').scrollTop=0;
}
/** La proposition ne reviendra plus (utilisée ou fermée). hide=false : choix d'une ambiance, la proposition reste affichée
 *  pour en essayer d'autres jusqu'à sa fermeture */
function closeWelcome(hide=true){
  welcomeDone=true; try{ localStorage.setItem(WELCOME_KEY,'1'); }catch(e){}
  if(!hide) return;
  const s=$('welStrip'), had=s.contains(document.activeElement); s.hidden=true;
  if(had) document.querySelector('#tabs .on')?.focus();
}

// ---------- Ambiances et modèles de texte ----------
function applyAmbiance(k){
  const a=AMBIANCES.find(x=>x[0]===k); if(!a) return; const p=a[2];
  commitHistory(0);   // étape d'historique explicite : un choix fait juste après le démarrage reste annulable
  const before=cmpSnap();
  st.theme=p.theme; st.colors={...THEMES[p.theme].c}; st.font=p.font; st.fontTitle=p.fontTitle; st.markerStyle=p.markerStyle; st.texture=p.texture;
  st.fx={...DEFAULT_STATE.fx,...(p.fx||{})}; st.orn={...DEFAULT_STATE.orn,...(p.orn||{})}; st.folds=!!p.folds;
  setLayout(p.layout,true);
  noteChange(before,`l'ambiance « ${a[1]} »`);
  syncInputs(); loadFonts().then(()=>{ scheduleOver(); refreshCards(); }); redrawAll(true); drawTexture(); commitHistory();
  toast(`Ambiance « ${a[1]} » appliquée · tout reste personnalisable`);
}
function applyOccasion(k){
  const o=OCCASIONS.find(x=>x[0]===k); if(!o) return; commitHistory(0);
  const before=cmpSnap();
  st.texts.dedication=o[2]; st.show.dedication=true;
  if(!st.texts.names.trim() || OCCASIONS.some(x=>x[3]===st.texts.names)) st.texts.names=o[3];
  noteChange(before,`le modèle « ${o[1]} »`);
  syncInputs(); scheduleOver(); commitHistory(); toast(`Modèle « ${o[1]} » appliqué · « Annuler » pour revenir`);
}
/** Gabarit : met à jour l'état propre à certains gabarits (deux lieux, ciel), puis l'aperçu */
function setLayout(k,quiet){
  st.layout=k;
  if(k==='diptych' && !st.place2) st.place2={center:{...st.center},zoom:st.zoom,marker:{...st.marker}};
  if(k!=='diptych' && (st.active||0)===1) { st.active=0; const o=st.place2; st.place2={center:st.center,zoom:st.zoom,marker:st.marker}; st.center=o.center; st.zoom=o.zoom; st.marker=o.marker; }
  if(k==='sky' && !st.sky.when){ st.sky.when=(isoFromFr(st.texts.date)||new Date().toISOString().slice(0,10))+'T22:00'; }
  ui.snap=null; refreshCards(); updateLayoutUI(); layoutPreview(); saveState();
  if(!quiet && k==='diptych') toast('Deux lieux : touchez la seconde carte pour la cadrer et y placer son repère');
}
function setOrient(v){ st.orient=v; setSeg('orientSeg',v); updateExportLabel(); ui.snap=null; refreshCards(); layoutPreview(); saveState(); }
/** Format d'impression : le rapport de l'affiche peut changer (50 × 70 cm) ; aperçu et vignettes suivent */
function setFormat(v){ st.format=v; setSeg('formatSeg',v); updateExportLabel(); ui.snap=null; refreshCards(); layoutPreview(); saveState(); }
/** Retour à la ligne de la dédicace : la carte peut céder de la hauteur (geom), d'où la mise en page complète */
function setDedWrap(v){ st.dedWrap=v; setSeg('dedWrapSeg',v); ui.snap=null; refreshCards(); layoutPreview(); saveState(); }
function setFileType(v){ st.fileType=v; setSeg('fileSeg',v); updateExportLabel(); saveState(); }
/** Dimensions affichées sur le bouton d'export et sous le choix du format : suivent le format et l'orientation */
function updateExportLabel(){
  const e=exportSpec(), pdf=st.fileType==='pdf', cm=v=>(v/10).toLocaleString('fr-FR');
  $('exportDims').textContent=`\u00a0· ${e.W} × ${e.H} px`;
  $('exportDpi').textContent=`\u00a0· ${e.key==='a4'?'':e.name+' · '}${e.dpi} DPI${pdf?' · PDF':''}`;
  $('formatHint').textContent=`${/^a\d/.test(e.key)?`${e.name} (${cm(e.mm[0])} × ${cm(e.mm[1])} cm)`:e.name} : ${e.W} × ${e.H} px à ${e.dpi} DPI`
    +(e.dpi<EXPORT_MAX_DPI?` — résolution abaissée pour rester dans la limite de mémoire des images de cet appareil ; amplement suffisante vue à distance.`:'.')
    +(pdf?' Document PDF à la taille exacte d\'impression (image JPEG haute qualité).':' Image PNG sans perte.')
    +(e.key==='10x15'?' Tirage photo : sans marge de fond perdu, au format exact de 10 × 15 cm.':'');
}
/** Sections visibles selon le gabarit */
function updateLayoutUI(){
  const L=st.layout;
  $('ringTog').hidden=!['medallion','heart','arch'].includes(L);
  $('skyBox').hidden=L!=='sky'; $('placeBox').hidden=L!=='diptych'; $('labelsBox').hidden=L!=='diptych';
  setSeg('placeSeg',String(st.active||0));
  if(L==='sky'){ $('skyWhen').value=st.sky.when; $('skyTz').value=String(st.sky.tz); }
  if($('mList')) renderPlaces();
}
/** Contraste à l'impression : avertit quand des éléments se distinguent mal */
function updateContrast(){
  const c=st.colors, w=[];
  if(contrast(c.roadMajor,c.land)<3) w.push('les rues principales ressortent peu sur la terre');
  if(contrast(c.text,c.paper)<4.5) w.push('le texte manque de contraste avec le papier');
  if(contrast(c.marker,c.land)<1.8) w.push('le repère se distingue mal de la carte');
  $('contrastWarn').textContent = w.length ? '⚠ À l\'impression, '+w.join(' ; ')+'.' : '';
}

// ---------- Interface ----------
function setStatus(t,kind,detail){ $('stTxt').textContent=t; $('stTxt').title=detail?t+' — '+detail:t; $('stDot').className='dot'+(kind?' '+kind:''); }
let toastT=0;
function toast(msg,err){ const t=$('toast'); t.textContent=msg; t.className='show'+(err?' err':''); clearTimeout(toastT); toastT=setTimeout(()=>t.className='',err?6000:3200); }
function showBanner(show,txt,label,action){
  $('banner').classList.toggle('show',!!show); if(txt) $('bannerTxt').textContent=txt;
  if(ui.sheet==='peek') applySheet();
  const b=$('bBanner'); b.textContent=label||''; b.onclick=action||null; b.hidden=!action;
}
function setPlacing(on,idx=0){ ui.placing=on; ui.placeIdx=on?idx:0;
  $('placeHint').textContent = idx ? `Touchez la carte pour placer le lieu ${idx+1}` : 'Touchez la carte pour placer le repère';
  if(on && idx && isSheet()) setSheet(ui.sheet); $('bPlace').classList.toggle('on',on); $('bPlace2').classList.toggle('on',on); $('placeHint').classList.toggle('show',on); slot.classList.toggle('placing',on); stageMode(); }

// ---------- Panneau coulissant et mode Cadrer (mobile portrait) ----------
// Trois crans : « peek » (onglets + export, affiche presque plein écran), « half » (défaut), « full » (réglages, affiche en vignette).
// Sur mobile, la carte est verrouillée : un toucher ouvre le mode Cadrer (glisser, pincer), « Terminer » le referme.
const TWO_COL = matchMedia('(min-width:900px), (orientation:landscape) and (min-width:560px)');
const isSheet = () => !TWO_COL.matches;
const app = document.getElementById('app');
function sheetHeights(){
  const vh=app.clientHeight||innerHeight, pn=$('panel');
  const peek=Math.ceil($('grab').offsetHeight+$('modeSeg').offsetHeight+$('tabs').offsetHeight+document.querySelector('.foot').offsetHeight+['banner','updBanner'].reduce((s,id)=>s+($(id).classList.contains('show')?$(id).offsetHeight:0),0))+1;
  return {peek, half:Math.max(peek+120,Math.round(vh*0.55)), full:Math.max(peek+120,Math.round(vh*0.84)), max:Math.round(vh*0.92)};
}
/** Applique la hauteur du panneau : cran nommé, ou hauteur libre en px pendant un glissement */
function applySheet(px){
  const root=document.documentElement;
  app.classList.toggle('sheetmode',isSheet());
  if(!isSheet()){ root.style.removeProperty('--sheetH'); return; }
  if(ui.clean){ root.style.setProperty('--sheetH','0px'); return; }   // affiche seule : plus de panneau
  const H=sheetHeights(), h=px!=null ? Math.max(H.peek,Math.min(H.max,px)) : H[ui.sheet];
  root.style.setProperty('--sheetH',h+'px');
  $('grab').setAttribute('aria-label', ui.sheet==='full' ? 'Réduire le panneau des réglages' : 'Agrandir le panneau des réglages');
}
function setSheet(s){ ui.sheet=s; app.dataset.sheet=s; applySheet(); }
/** Placement du repère ou cadrage : le panneau se réduit pour libérer la carte, puis reprend sa position */
function stageMode(){
  const active=ui.framing||ui.placing;
  if(active && isSheet() && ui.sheetBefore==null){ ui.sheetBefore=ui.sheet; setSheet('peek'); }
  else if(!active && ui.sheetBefore!=null){ const s=ui.sheetBefore; ui.sheetBefore=null; setSheet(s); }
  $('frameBar').classList.toggle('show',ui.framing && !ui.placing);
  $('bFrame').classList.toggle('on',ui.framing); $('bFrame').setAttribute('aria-pressed',String(ui.framing));
  $('shield').hidden = !(isSheet() && !ui.framing && !ui.placing);
}
function setFraming(on){ ui.framing=!!on; stageMode(); }

// ---------- Réglages dépendants d'un autre choix (issue #58) ----------
// Une seule table, inventoriée dans le dossier technique (§ 6.1). Règle : un réglage qui n'a aucun sens dans le contexte
// est masqué ; un réglage activé mais empêché par un autre choix reçoit une note d'une ligne et un bouton qui fait la bascule
// (bascule annulable : elle passe par les mêmes chemins que l'interface, donc par l'historique).
CMS.define('deps', () => {
  const tog=k=>document.querySelector(`[data-k="${k}"]`);
  const row=k=>tog(k).closest('label,.slider,.tsz');
  const setTog=(k,v)=>{ const el=tog(k); el.checked=v; el.dispatchEvent(new Event('input',{bubbles:true})); };
  const layName=k=>(LAYOUTS.find(x=>x[0]===k)||[,k])[1];
  const extras=()=>(st.markers2||[]).length>0 && st.layout!=='diptych';
  /** Réglages masqués quand ils n'ont aucun sens */
  const HIDE=[
    [()=>row('focusR'), ()=>!(st.fx.halo||st.fx.quarter)],          // rayon : seulement avec le halo ou le quartier
    [()=>row('numbered'), ()=>!extras()],                             // numéroter, relier : au moins deux lieux sur une même carte
    [()=>row('linkMarkers'), ()=>!extras()],
  ];
  /** Réglages activés mais empêchés : [id, ancre, condition, texte, bouton, action] */
  const NOTES=[
    ['parkHatch', ()=>row('fx.parkHatch'), ()=>st.fx.parkHatch && !st.layers.parks,
      ()=>'Sans effet : le calque « Parcs et espaces verts » est masqué.', 'Afficher les parcs', ()=>setTog('layers.parks',true)],
    ['outline', ()=>row('fx.outline'), ()=>st.fx.outline && !st.layers.buildings,
      ()=>'Sans effet : le calque « Bâtiments » est masqué.', 'Afficher les bâtiments', ()=>setTog('layers.buildings',true)],
    ['dots', ()=>row('fx.dots'), ()=>st.fx.dots && (!st.layers.buildings || st.fx.outline),
      ()=>st.layers.buildings ? 'Sans effet avec « Bâtiments en contour », qui l\'emporte.' : 'Sans effet : le calque « Bâtiments » est masqué.',
      ()=>st.layers.buildings ? 'Retirer le contour' : 'Afficher les bâtiments',
      ()=>st.layers.buildings ? setTog('fx.outline',false) : setTog('layers.buildings',true)],
    ['glow', ()=>row('fx.glow'), ()=>st.fx.glow && lum(st.colors.paper)>=0.3,
      ()=>'Peu visible sur ce fond clair : la lueur est pensée pour les thèmes sombres.', 'Voir les thèmes sombres',
      ()=>{ const c=document.querySelector('#themeCats [data-v=sombre]'); c.click(); CMS.panelScroll.to($('themeCats'),'start',true); }],
    ['subtitle', ()=>row('textScale.subtitle'), ()=>st.mode==='map' && st.show.subtitle && ['souvenir','polaroid'].includes(st.layout),
      ()=>`Le gabarit « ${layName(st.layout)} » n'affiche pas le sous-titre.`, 'Passer au gabarit Cadre', ()=>setLayout('classic')],
    ['route', ()=>$('routeShow').closest('label'), ()=>st.layout==='diptych' && !!st.route?.pts?.length && st.route.show!==false,
      ()=>'Le gabarit « Deux lieux » n\'affiche pas l\'itinéraire.', 'Passer au gabarit Souvenir', ()=>setLayout('souvenir')],
  ];
  const els={};
  function update(){
    for(const [at,when] of HIDE){ const e=at(); if(e) e.hidden=!!when(); }
    for(const [id,,when,text,label] of NOTES){
      const n=els[id]; if(!n) continue; const on=!!when();
      n.hidden=!on; if(on){ n.firstChild.textContent=text()+' '; n.lastChild.textContent=typeof label==='function'?label():label; }
    }
  }
  let raf=0; const schedule=()=>{ if(!raf) raf=requestAnimationFrame(()=>{ raf=0; update(); }); };
  function init(){
    for(const [id,at,,,,act] of NOTES){
      const b=h('button',{type:'button',className:'lnk'}); b.onclick=()=>{ act(); schedule(); };
      const n=h('p',{className:'depnote',id:'dep-'+id,hidden:true},h('span'),b);
      at().after(n); els[id]=n;
    }
    CMS.on('state:saved',schedule); CMS.on('state:synced',schedule);
    $('panel').addEventListener('input',schedule); $('panel').addEventListener('click',schedule);
    update();
  }
  return {init, update};
});

// ---------- Zone de sécurité pour l'impression maison (issue #60) ----------
// Trait pointillé à 5 mm du bord, dans l'aperçu seulement (élément HTML posé sur l'affiche : jamais dans l'export).
// Les textes et repères relevés pendant le rendu de l'aperçu (CMS.ink) qui entrent dans cette bande sont signalés.
// Réglage de l'appareil, hors de l'état de l'affiche (comme A− / A+).
CMS.define('safe', () => {
  const KEY='cityMapStudio.safeZone', MM=5;
  const LABELS={title:'le titre',subtitle:'le sous-titre',coords:'les coordonnées',dedication:'la dédicace',names:'les noms',date:'la date',
    legend:'la légende',marker:'un repère',attribution:'la mention des sources',text:'un texte'};
  let on=(()=>{ try{ return localStorage.getItem(KEY)==='1'; }catch(e){ return false; } })(), prev='';
  /** Bande de sécurité en px pour une affiche de largeur w px (le format donne la largeur en mm, orientation comprise) */
  const inset=w=>MM/exportSpec().mm[0]*w;
  function layout(){
    const g=$('safeGuide'); g.hidden=!on; if(!on) return;
    const i=inset(ui.posterCss.w)+'px'; Object.assign(g.style,{top:i,left:i,right:i,bottom:i});
  }
  function check(boxes,W,H){
    let msg='', warn=false;
    if(on && boxes){
      const i=inset(W)-0.5, out=[...new Set(boxes.filter(b=>b.x2>b.x1 && (b.x1<i || b.y1<i || b.x2>W-i || b.y2>H-i)).map(b=>LABELS[b.k]||LABELS.text))];
      warn=out.length>0;
      // 10 × 15 cm : la mention des sources reste dans la bande même à la marge maximale (12 % de 10 cm × 0,38 < 5 mm)
      const smallAttr=out.includes(LABELS.attribution) && exportSpec().key==='10x15', rest=out.filter(x=>!(smallAttr && x===LABELS.attribution));
      const list=out.length>1?out.slice(0,-1).join(', ')+' et '+out[out.length-1]:out[0];
      msg = !warn ? 'Textes et repères dans la zone imprimable.'
        : `⚠ Trop près du bord pour une imprimante de bureau : ${list}.`
          +(rest.length?' Augmentez la marge (onglet Style) ou réduisez la taille de ces textes.':'')
          +(smallAttr?' Sur ce petit format, la mention des sources reste dans la marge basse : imprimez « sans marge » (papier photo) ou confiez le tirage à un laboratoire photo.':'');
    }
    if(msg===prev) return; prev=msg;
    const n=$('safeWarn'); n.textContent=msg; n.className=warn?'fitnote':'hint';
  }
  function init(){
    $('safeTog').checked=on;
    $('safeTog').onchange=e=>{ on=e.target.checked; try{ on ? localStorage.setItem(KEY,'1') : localStorage.removeItem(KEY); }catch(_){} layout(); scheduleOver(); };
    layout();
  }
  return {get on(){ return on; }, layout, check, init};
});

// ---------- Voir l'affiche seule (issue #56) ----------
// Masque tout ce qui recouvre l'aperçu (boutons flottants, « Toucher pour cadrer », légende, badges) et, sur mobile,
// le panneau : l'affiche occupe tout l'écran. Une couche transparente reçoit le toucher de sortie, qui ne déplace donc
// pas la carte et ne pose aucun repère. Sortie aussi par Échap ou le bouton retour du système. Aucun état d'affiche modifié.
CMS.define('clean', () => {
  let before=null, pushed=false;
  function enter(){
    if(ui.clean) return;
    setPlacing(false); setFraming(false);
    before=ui.sheet; ui.clean=true; app.classList.add('clean'); applySheet();
    const x=$('cleanExit'); x.hidden=false; x.classList.remove('hinted'); void x.offsetWidth; x.classList.add('hinted');
    try{ history.pushState({cmsClean:1},''); pushed=true; }catch(e){ pushed=false; }
    x.focus({preventScroll:true});
  }
  /** fromHistory : sortie déclenchée par le bouton retour (l'entrée d'historique est déjà retirée) */
  function exit(fromHistory){
    if(!ui.clean) return;
    ui.clean=false; app.classList.remove('clean'); $('cleanExit').hidden=true;
    if(before) setSheet(before); before=null;
    if(pushed && !fromHistory){ pushed=false; try{ if(history.state?.cmsClean) history.back(); }catch(e){} }
    pushed=false;
    $('bClean').focus({preventScroll:true});
  }
  function init(){
    $('bClean').onclick=enter;
    $('cleanExit').onclick=()=>exit(false);
    addEventListener('popstate',()=>{ if(ui.clean) exit(true); });
    addEventListener('keydown',e=>{ if(e.key==='Escape' && ui.clean){ e.preventDefault(); exit(false); } });
  }
  return {enter, exit, init};
});
function initSheet(){
  const g=$('grab'); let drag=null, dragged=false;
  g.addEventListener('pointerdown',e=>{ if(!isSheet()) return; g.setPointerCapture(e.pointerId);
    drag={y:e.clientY, h:$('panel').getBoundingClientRect().height, moved:false}; });
  g.addEventListener('pointermove',e=>{ if(!drag) return; const dy=e.clientY-drag.y;
    if(Math.abs(dy)>6 && !drag.moved){ drag.moved=true; app.classList.add('dragging'); app.dataset.sheet='half'; }
    if(drag.moved) applySheet(drag.h-dy); });
  const end=e=>{ if(!drag) return; const d=drag; drag=null; app.classList.remove('dragging');
    // Un simple toucher est traité au « click » : changer le panneau dès pointerup ferait tomber le clic sur la carte, désormais sous le doigt
    if(!d.moved) return;
    dragged=true; setTimeout(()=>dragged=false,400);
    // cran le plus proche, avec une préférence pour le sens du geste
    const H=sheetHeights(), h=$('panel').getBoundingClientRect().height, dir=Math.sign(d.h-h);
    let best='half', bd=1e9;
    for(const k of ['peek','half','full']){ const dist=Math.abs(H[k]-h)-(Math.sign(d.h-H[k])===dir&&dir?40:0); if(dist<bd){ bd=dist; best=k; } }
    ui.sheetBefore=null; setSheet(best); };
  g.addEventListener('pointerup',end); g.addEventListener('pointercancel',end);
  g.addEventListener('click',()=>{ if(dragged || !isSheet()){ dragged=false; return; } ui.sheetBefore=null; setSheet(ui.sheet==='peek'?'half':ui.sheet==='half'?'full':'half'); });
  g.addEventListener('keydown',e=>{ if(e.key==='ArrowUp'){ e.preventDefault(); setSheet(ui.sheet==='peek'?'half':'full'); } if(e.key==='ArrowDown'){ e.preventDefault(); setSheet(ui.sheet==='full'?'half':'peek'); } });
  // Saisie d'un texte : le panneau se déplie (clavier + champ visibles), puis reprend sa place
  let restoreT=0, before=null;
  $('panel').addEventListener('focusin',e=>{ if(!isSheet() || !e.target.matches('input[type=text],input[type=search]')) return;
    clearTimeout(restoreT); if(before==null && ui.sheet!=='full'){ before=ui.sheet; setSheet('full'); }
    setTimeout(()=>CMS.panelScroll.to(e.target,'nearest'),50); });
  $('panel').addEventListener('focusout',()=>{ clearTimeout(restoreT); restoreT=setTimeout(()=>{
    if(before!=null && !document.activeElement?.matches?.('input[type=text],input[type=search]')){ setSheet(before); before=null; } },200); });
  $('shield').onclick=()=>setFraming(true);
  $('bFrame').onclick=()=>setFraming(!ui.framing);
  $('bFrameDone').onclick=()=>setFraming(false);
  TWO_COL.addEventListener('change',()=>{ setFraming(false); setPlacing(false); ui.sheetBefore=null; setSheet(ui.sheet); stageMode(); });
  CMS.clean.init();
  setSheet('half'); stageMode();
}

// ---------- Palette tirée d'une photo ----------
// La photo est lue et réduite sur l'appareil (createImageBitmap, aucune adresse ni envoi) ; seules ses couleurs sont gardées.
let photoPal=null;
async function importPhotoPalette(file){
  let bmp;
  try{ bmp=await createImageBitmap(file); }catch(e){ toast('Image illisible : choisissez une photo JPEG, PNG ou WebP.',true); return; }
  const n=80, k=Math.min(1,n/Math.max(bmp.width,bmp.height)), w=Math.max(1,Math.round(bmp.width*k)), hh=Math.max(1,Math.round(bmp.height*k));
  const cv=document.createElement('canvas'); cv.width=w; cv.height=hh; const c=cv.getContext('2d'); c.drawImage(bmp,0,0,w,hh); if(bmp.close) bmp.close();
  photoPal=paletteOf(c.getImageData(0,0,w,hh).data);
  if(!photoPal.length){ toast('Aucune couleur exploitable dans cette image.',true); return; }
  const sw=$('photoSw'); sw.textContent=''; photoPal.forEach(p=>sw.append(h('i',{style:{background:p.hex}})));
  $('photoPal').hidden=false; applyPhotoPalette('light');
}
/** Couleurs dominantes (k-moyennes, 6 groupes, départ aux quantiles de luminance : résultat reproductible) : [{hex, n}] */
function paletteOf(D, K=6){
  const px=[]; for(let i=0;i<D.length;i+=4) if(D[i+3]>=128) px.push([D[i],D[i+1],D[i+2]]);
  if(px.length<K) return [];
  const Y=p=>0.299*p[0]+0.587*p[1]+0.114*p[2]; px.sort((a,b)=>Y(a)-Y(b));
  let C=Array.from({length:K},(_,i)=>[...px[Math.floor((i+0.5)/K*px.length)]]), cnt=[];
  for(let it=0;it<12;it++){
    const S=C.map(()=>[0,0,0]); cnt=C.map(()=>0);
    for(const p of px){ let b=0, bd=1e9; C.forEach((q,j)=>{ const d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2; if(d<bd){ bd=d; b=j; } }); S[b][0]+=p[0]; S[b][1]+=p[1]; S[b][2]+=p[2]; cnt[b]++; }
    C=C.map((q,j)=>cnt[j]?S[j].map(v=>v/cnt[j]):q);
  }
  const hex=q=>'#'+q.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
  return C.map((q,j)=>({hex:hex(q),n:cnt[j]})).filter(p=>p.n>0).sort((a,b)=>b.n-a.n);
}
/** Thème tiré d'une palette : papier (couleur la plus claire, ou la plus sombre), encre opposée, accents saturés pour l'eau, les parcs et le repère */
function photoTheme(pal, dark){
  const sat=x=>{ const v=[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)), M=Math.max(...v), m=Math.min(...v); return M?(M-m)/M:0; };
  const byL=[...pal].sort((a,b)=>lum(a.hex)-lum(b.hex)), lo=byL[0].hex, hi=byL[byL.length-1].hex;
  const acc=[...pal].sort((a,b)=>sat(b.hex)*Math.sqrt(b.n)-sat(a.hex)*Math.sqrt(a.n)), a1=acc[0].hex, a2=(acc[1]||acc[0]).hex;
  const paper = dark ? mix(lo,'#000000',0.55) : mix(hi,'#FFFFFF',0.75), ink = dark ? mix(hi,'#FFFFFF',0.5) : mix(lo,'#000000',0.35);
  let marker=a1; for(let i=0;i<4 && contrast(marker,paper)<2.6;i++) marker=mix(marker,ink,0.3);
  const c={paper, land:paper, water:mix(a1,paper,0.5), park:mix(a2,paper,0.72), building:mix(ink,paper,0.88),
    roadMajor:ink, roadMinor:mix(ink,paper,0.35), path:mix(ink,paper,0.62), rail:mix(ink,paper,0.62), text:ink, frame:mix(marker,ink,0.2), marker};
  for(const k of Object.keys(c)) c[k]=c[k].toUpperCase();
  return c;
}
function applyPhotoPalette(v){
  if(!photoPal) return;
  const before=cmpSnap();
  st.colors=photoTheme(photoPal,v==='dark'); setSeg('photoSeg',v);
  noteChange(before,{theme:true}); refreshColors(); changed({all:true,cards:true});
  toast('Palette de la photo appliquée · « Annuler » pour revenir');
}

// ---------- Mes affiches : sauvegarde et restauration de la configuration ----------
// Sauvegardes nommées dans ce navigateur (localStorage, avec une vignette), fichier de configuration d'une affiche,
// fichier de sauvegarde de toutes les affiches. Tout ce qui est relu (navigateur ou fichier) est validé comme un lien
// partagé : champs connus seulement, normState, tailles bornées ; une restauration est une étape annulable.
// Ne sont pas inclus : le moteur cartographique (choix de l'appareil) et les données importées (fichier OSM).
// Fichiers avec illustrations intégrées : version 2 et limites propres (CMS.illus.FILE) ; la version 1 reste lue.
const SAVES_KEY='cityMapStudio.saves', SAVES_MAX=40, CFG_FORMAT='city-map-studio/configuration', BAK_FORMAT='city-map-studio/sauvegardes', CFG_VERSION=1;
const CFG_MAX_BYTES=1024*1024, BAK_MAX_BYTES=16*1024*1024, THUMB_MAX=120*1024;
const THUMB_RE=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
/** État à sauvegarder : copie sans le moteur */
function savedState(){ const o=JSON.parse(JSON.stringify(st)); delete o.engine; return o; }
/** Une sauvegarde relue : chaque champ vérifié, l'état normalisé ; null si inexploitable */
function normSave(o){
  if(!o || typeof o!=='object' || Array.isArray(o) || !o.state || typeof o.state!=='object') return null;
  const t=Date.parse(o.savedAt), state=normState(o.state); delete state.engine;
  return {id:typeof o.id==='string' && /^[a-z0-9]{6,24}$/.test(o.id) ? o.id : newId(),
    name:(V.str(o.name,'',80).trim()||'Sans titre'), savedAt:Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(), state,
    thumb:typeof o.thumb==='string' && o.thumb.length<=THUMB_MAX && THUMB_RE.test(o.thumb) ? o.thumb : ''};
}
function loadSaves(){
  try{ const a=JSON.parse(localStorage.getItem(SAVES_KEY)||'[]'); return Array.isArray(a) ? a.map(normSave).filter(Boolean).slice(0,SAVES_MAX) : []; }
  catch(e){ return []; }
}
function storeSaves(list){
  try{ localStorage.setItem(SAVES_KEY,JSON.stringify(list.slice(0,SAVES_MAX))); }
  catch(e){ throw new Error('espace du navigateur plein : supprimez des affiches ou téléchargez la sauvegarde complète'); }
}
/** Vignette de l'affiche courante (JPEG, ~150 px) : carte réelle avec le moteur Fichier, schématique sinon */
function saveThumb(){
  const land=st.orient==='landscape', cv=document.createElement('canvas'); cv.width=land?212:150; cv.height=land?150:212; const ctx=cv.getContext('2d');
  const mapFn=(c,r,view)=> st.engine==='file' && osmData ? drawVectors(c,r,osmData,view) : thumbMap(c,r);
  ui.thumb=true; try{ drawPoster(ctx,cv.width,cv.height,'all',mapFn); applyTexture(ctx,cv.width,cv.height); } finally{ ui.thumb=false; }
  return cv.toDataURL('image/jpeg',0.8);
}
const defaultSaveName=()=>[st.texts.title,st.texts.names].map(s=>(s||'').trim()).filter(Boolean).join(' · ')||'Mon affiche';
/** Enregistre l'affiche courante ; une sauvegarde du même nom est mise à jour (elle remonte en tête de liste) */
function saveCurrent(name){
  name=(name||'').trim().slice(0,80)||defaultSaveName();
  const list=loadSaves(), i=list.findIndex(x=>x.name.toLowerCase()===name.toLowerCase());
  const entry={id:i>=0?list[i].id:newId(), name, savedAt:new Date().toISOString(), state:savedState(), thumb:saveThumb()};
  if(i>=0) list.splice(i,1);
  if(i<0 && list.length>=SAVES_MAX){ toast(`${SAVES_MAX} affiches au plus : supprimez-en une d'abord`,true); return false; }
  try{ storeSaves([entry,...list]); }catch(e){ toast('Enregistrement impossible : '+e.message,true); return false; }
  renderSaves(); toast(i>=0 ? `« ${name} » mise à jour` : `« ${name} » enregistrée dans Mes affiches`); return true;
}
function restoreSave(id){
  const e=loadSaves().find(x=>x.id===id); if(!e) return;
  try{ applyConfig(e.state,`« ${e.name} » restaurée · « Annuler » pour revenir`); }catch(err){ toast('Restauration impossible : '+err.message,true); }
}
function deleteSave(id){ const l=loadSaves(), e=l.find(x=>x.id===id); if(!e) return;
  try{ storeSaves(l.filter(x=>x.id!==id)); }catch(err){ toast(err.message,true); return; }
  renderSaves(); toast(`« ${e.name} » supprimée`); CMS.illus.gc().catch(()=>{}); }
/** Téléchargement d'un fichier JSON (aucun envoi : lien local vers un Blob) */
function downloadJson(obj,file){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,1)],{type:'application/json'})); a.download=file;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
const configOf=(name,state,savedAt)=>({format:CFG_FORMAT, version:CFG_VERSION, app:'City Map Studio', name, savedAt:savedAt||new Date().toISOString(), state});
async function downloadConfig(entry){
  const c = entry ? configOf(entry.name,entry.state,entry.savedAt) : configOf(defaultSaveName(),savedState());
  const {o,note}=await CMS.illus.attachImages(c,[c.state],$('cfgImg').checked);
  downloadJson(o,`affiche-${slug(c.name)}.json`); toast('Configuration téléchargée'+note);
}
async function downloadBackup(){
  const saves=loadSaves(); if(!saves.length){ toast('Aucune affiche enregistrée à sauvegarder',true); return; }
  const {o,note}=await CMS.illus.attachImages({format:BAK_FORMAT, version:CFG_VERSION, app:'City Map Studio', savedAt:new Date().toISOString(), saves},saves.map(e=>e.state),$('cfgImg').checked);
  downloadJson(o, `mes-affiches-${new Date().toISOString().slice(0,10)}.json`);
  toast(`${saves.length} affiche${saves.length>1?'s':''} sauvegardée${saves.length>1?'s':''} dans un fichier`+note);
}
/** Ouvre un fichier : configuration d'une affiche (appliquée), sauvegarde complète (fusionnée dans Mes affiches),
 *  ou état brut (ancien format). Tout le reste est refusé sans rien modifier. */
async function importConfigFile(file){
  try{
    const F=CMS.illus.FILE;
    if(file.size>F.bakMax) throw new Error('fichier trop volumineux');
    let o; try{ o=JSON.parse(await file.text()); }catch(e){ throw new Error('ce n\'est pas un fichier JSON'); }
    if(!o || typeof o!=='object' || Array.isArray(o)) throw new Error('contenu invalide');
    // Sans illustration, les limites habituelles ; avec, des limites propres (images vérifiées une à une)
    const hasImg=!!o.images && typeof o.images==='object' && !Array.isArray(o.images);
    if(file.size>(o.format===BAK_FORMAT ? (hasImg?F.bakMax:BAK_MAX_BYTES) : (hasImg?F.cfgMax:CFG_MAX_BYTES))) throw new Error('fichier trop volumineux');
    const newer=typeof o.version==='number' && o.version>F.version ? ' (créé par une version plus récente : réglages inconnus ignorés)' : '';
    let imgMsg='';
    if(hasImg){ const r=await CMS.illus.importImages(o.images); imgMsg=(r.added?` · ${r.added} illustration${r.added>1?'s':''} ajoutée${r.added>1?'s':''}`:'')+(r.bad?` · ${r.bad} illustration${r.bad>1?'s':''} illisible${r.bad>1?'s':''} ignorée${r.bad>1?'s':''}`:''); }
    if(o.format===BAK_FORMAT){
      if(!Array.isArray(o.saves)) throw new Error('sauvegarde sans affiches');
      const list=loadSaves(), seen=new Set(list.map(x=>x.id+'|'+x.savedAt)); let added=0, full=false;
      for(const raw of o.saves.slice(0,1000)){ const e=normSave(raw); if(!e || seen.has(e.id+'|'+e.savedAt)) continue;
        if(list.length>=SAVES_MAX){ full=true; break; }
        if(list.some(x=>x.id===e.id)) e.id=newId();
        list.push(e); seen.add(e.id+'|'+e.savedAt); added++; }
      list.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)); storeSaves(list); renderSaves();
      toast(`${added} affiche${added>1?'s':''} ajoutée${added>1?'s':''} à Mes affiches`+(full?` · limite de ${SAVES_MAX} atteinte`:'')+imgMsg+newer);
      return;
    }
    const state = o.format===CFG_FORMAT ? o.state : (o.texts && o.layout ? o : null);   // état brut : ancien format
    if(!state || typeof state!=='object' || Array.isArray(state)) throw new Error('fichier non reconnu (ni configuration, ni sauvegarde City Map Studio)');
    applyConfig(state,`Configuration « ${V.str(o.name,'',80).trim()||file.name} » ouverte · « Annuler » pour revenir`+imgMsg+newer);
  }catch(e){ toast('Ouverture impossible : '+e.message,true); }
}
const LAYOUT_NAME=k=>(LAYOUTS.find(l=>l[0]===k)||[,''])[1];
function renderSaves(){
  const box=$('savesList'); if(!box) return; box.textContent='';
  const list=loadSaves(); $('savesEmpty').hidden=list.length>0; $('bSavesBackup').disabled=!list.length;
  const fmt=new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'});
  for(const e of list){
    const del=h('button',{type:'button',className:'btn sm','aria-label':`Supprimer « ${e.name} »`,title:'Supprimer'},'✕');
    del.onclick=()=>{ if(!del.classList.contains('confirm')){ del.classList.add('confirm'); del.textContent='Supprimer ?'; setTimeout(()=>{ if(del.isConnected){ del.classList.remove('confirm'); del.textContent='✕'; } },4000); return; } deleteSave(e.id); };
    const res=h('button',{type:'button',className:'btn sm pri','aria-label':`Restaurer « ${e.name} »`},'Restaurer'); res.onclick=()=>restoreSave(e.id);
    const dl=h('button',{type:'button',className:'btn sm','aria-label':`Télécharger « ${e.name} »`,title:'Télécharger le fichier'},'⤓'); dl.onclick=()=>downloadConfig(e);
    const th=e.thumb ? h('img',{src:e.thumb,alt:'',width:56,height:79}) : h('span',{className:'nothumb','aria-hidden':'true'});
    box.append(h('li',{className:'save'},th,h('div',{className:'meta'},h('b',{},e.name),h('small',{},`${fmt.format(new Date(e.savedAt))} · `+(e.state.mode==='illus' ? 'Affiche illustrée' : e.state.mode==='mix' ? 'Carte + illustration' : `${LAYOUT_NAME(e.state.layout)} · ${THEMES[e.state.theme]?.name||''}`))),h('div',{className:'acts'},res,dl,del)));
  }
}
/** Mes affiches : section Sauvegarde de l'onglet Export (nom proposé, liste à jour, champ du nom sélectionné) */
function openSaves(){ $('saveName').value=defaultSaveName(); renderSaves(); showTab('export'); CMS.panelScroll.to($('savesTitle')); setTimeout(()=>$('saveName').focus({preventScroll:true}),50); }
function initSaves(){
  renderSaves();
  CMS.on('tab:export',()=>{ if(!$('saveName').value.trim()) $('saveName').value=defaultSaveName(); renderSaves(); });
  $('saveForm').onsubmit=e=>{ e.preventDefault(); saveCurrent($('saveName').value); };
  $('bCfgExport').onclick=()=>downloadConfig(null); $('bSavesBackup').onclick=downloadBackup;
  $('cfgIn').onchange=e=>{ const f=e.target.files[0]; if(f) importConfigFile(f); e.target.value=''; };
  addEventListener('storage',e=>{ if(e.key===SAVES_KEY) renderSaves(); });   // autre onglet
  addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase()==='s'){ e.preventDefault(); saveCurrent(defaultSaveName()); } });
}
