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
  // Seulement ce qui existe dans le type d'affiche courant (#77) : rien ne change en silence pour un autre type.
  // Illustration : ni carte ni repère ; Carte + illustration : sans gabarit (la composition en tient lieu).
  const map=st.mode==='map', withMap=st.mode!=='illus', parts=['thème','polices','papier'];
  st.theme=p.theme; st.colors={...THEMES[p.theme].c}; st.font=p.font; st.fontTitle=p.fontTitle; st.illusText.style='auto'; st.texture=p.texture; st.folds=!!p.folds;
  const fx={...DEFAULT_STATE.fx,...(p.fx||{})};
  if(withMap){ st.markerStyle=p.markerStyle; st.fx=fx; st.orn={...DEFAULT_STATE.orn,...(p.orn||{})}; parts.push('repère','effets'); }
  else st.fx.foil=fx.foil;   // dorure des textes : seul effet d'une affiche illustrée
  if(map){ setLayout(p.layout,true); parts.push('gabarit'); }
  noteChange(before,`l'ambiance « ${a[1]} »`);
  syncInputs(); loadFonts().then(()=>{ scheduleOver(); refreshCards(); }); redrawAll(true); drawTexture(); commitHistory();
  toast(`Ambiance « ${a[1]} » : ${parts.slice(0,-1).join(', ')} et ${parts.at(-1)} · « Annuler » pour revenir`);
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
  // Marge et contour (#77) : en Carte, selon le gabarit ; en Carte + illustration, médaillon (contour) et vignette (marge)
  const mix=st.mode==='mix', cp=st.mix?.compo;
  $('ringTog').hidden=mix ? cp!=='med' : !['medallion','heart','arch'].includes(L);
  $('marginBox').hidden=mix && cp!=='vig';
  $('mixFormH').hidden=$('mixFormHint').hidden=mix && cp!=='med' && cp!=='vig';
  $('mixFormHint').textContent=cp==='med' ? 'Médaillon : trait autour de la forme de la carte.' : cp==='vig' ? 'Vignette : marge autour de la carte et de sa bande de texte.' : '';
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
/** Ligne d'état (voyant sur la scène) : « Prêt » réduit à la pastille ; un message sans gravité s'efface après 4 s ;
 *  chargement, attente et erreur restent écrits tant qu'ils durent. */
function setStatus(t,kind,detail){
  $('stTxt').textContent=t; $('stPill').title=$('stTxt').title=detail?t+' — '+detail:t; $('stDot').className='dot'+(kind?' '+kind:'');
  const ready=!kind && /^Prêt/.test(t); clearTimeout(setStatus.t);
  $('stPill').classList.toggle('quiet',ready);
  if(!kind && !ready) setStatus.t=setTimeout(()=>$('stPill').classList.add('quiet'),4000);
}
let toastT=0;
/** Message bref ; `action` {label,fn} ajoute un bouton (ex. « Annuler » après un réglage) et prolonge l'affichage. */
function toast(msg,err,action){
  const t=$('toast'); t.textContent=msg;
  if(action){ const b=document.createElement('button'); b.type='button'; b.textContent=action.label;
    b.onclick=()=>{ t.className=''; action.fn(); }; t.append(b); }
  t.className='show'+(err?' err':'')+(action?' act':''); clearTimeout(toastT);
  toastT=setTimeout(()=>t.className='',err?6000:action?5000:3200); }
function showBanner(show,txt,label,action){
  $('banner').classList.toggle('show',!!show); if(txt) $('bannerTxt').textContent=txt;
  if(ui.sheet==='peek') applySheet();
  const b=$('bBanner'); b.textContent=label||''; b.onclick=action||null; b.hidden=!action;
}
function setPlacing(on,idx=0){ ui.placing=on; ui.placeIdx=on?idx:0;
  $('placeHint').textContent = idx ? `Touchez la carte pour placer le lieu ${idx+1}` : 'Touchez la carte pour placer le repère';
  if(on && idx && isSheet()) setSheet(ui.sheet); $('bPlace2').classList.toggle('on',on); slot.classList.toggle('placing',on);
  if(ui.framing) CMS.intent.placing(on);   // en Modification, « Repère » est un choix du sélecteur
  stageMode(); }

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
/** Lecture ou Modification (ui.framing), placement du repère : sur mobile, le panneau se réduit pour libérer l'affiche,
 *  puis reprend sa position. En Lecture, le verrou #shield couvre l'affiche : rien ne bouge, un toucher ouvre la Modification. */
function stageMode(){
  const active=ui.framing||ui.placing;
  if(active && isSheet() && ui.sheetBefore==null){ ui.sheetBefore=ui.sheet; setSheet('peek'); }
  else if(!active && ui.sheetBefore!=null){ const s=ui.sheetBefore; ui.sheetBefore=null; setSheet(s); }
  app.classList.toggle('editing',ui.framing);
  $('frameBar').classList.toggle('show',ui.framing);
  $('placeHint').classList.toggle('show',ui.placing && !ui.framing);
  const e=$('bEdit'); e.classList.toggle('on',ui.framing); e.setAttribute('aria-pressed',String(ui.framing));
  $('bEditTxt').textContent=ui.framing ? 'Terminer' : 'Modifier';
  if(ui.framing) e.title='Terminer la modification';
  $('shield').hidden = ui.framing || ui.placing;
  CMS.intent.hint();
  if(CMS.intent.sync(ui.framing)) applySheet();   // le pied change de hauteur avec le sélecteur
}
function setFraming(on){
  on=!!on; if(on!==ui.framing){ ui.framing=on; if(on) CMS.intent.begin(); else CMS.intent.end(); }
  stageMode();
}

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
    // style de l'itinéraire : sans objet tant que l'itinéraire est masqué
    [()=>$('routeColor'), ()=>st.route?.show===false], [()=>$('routeW').closest('.slider'), ()=>st.route?.show===false],
    [()=>$('routeDash').closest('label'), ()=>st.route?.show===false],
  ];
  const LINE_NAMES={title:'le titre est masqué',subtitle:'le sous-titre est masqué',coords:'les coordonnées sont masquées',
    dedication:'la dédicace est masquée',names:'les noms sont masqués',date:'la date est masquée'};
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
    ['subtitle', ()=>tog('texts.subtitle'), ()=>st.mode==='map' && st.show.subtitle && ['souvenir','polaroid'].includes(st.layout),
      ()=>`Le gabarit « ${layName(st.layout)} » n'affiche pas le sous-titre.`, 'Passer au gabarit Cadre', ()=>setLayout('classic')],
    ['route', ()=>$('routeShow').closest('label'), ()=>st.layout==='diptych' && !!st.route?.pts?.length && st.route.show!==false,
      ()=>'Le gabarit « Deux lieux » n\'affiche pas l\'itinéraire.', 'Passer au gabarit Souvenir', ()=>setLayout('souvenir')],
    // Lettres : le titre est dessiné à la plus grande taille possible (§ 4.11) ; sa taille propre est sans effet
    // ordre des lignes choisi : sans effet là où les lignes ont une place fixe
    ['order', ()=>$('lineOrderList'), ()=>!!st.lineOrder && st.mode==='map' && ['souvenir','travel','diptych'].includes(st.layout),
      ()=>`Sans effet avec le gabarit « ${layName(st.layout)} » : chaque ligne y a sa place.`, 'Passer au gabarit Cadre', ()=>setLayout('classic')],
    ['titleTypo', ()=>row('textScale.title'), ()=>st.mode==='map' && st.layout==='typo' && st.show.title!==false,
      ()=>'Sans effet avec le gabarit « Lettres » : le titre y prend toute la largeur.', 'Passer au gabarit Cadre', ()=>setLayout('classic')],
    // ligne décochée dont la taille a été changée (ou coordonnées saisies) : rien ne s'affiche
    ...Object.keys(LINE_NAMES).map(k=>['hidden-'+k, ()=>row('textScale.'+k), ()=>st.show[k]===false && (st.textScale[k]!==100 || (k==='coords' && !!st.coordsManual)),
      ()=>`Sans effet : ${LINE_NAMES[k]} sur l'affiche.`,
      ()=>k==='coords'||k==='names' ? 'Les afficher' : 'L\'afficher', ()=>setTog('show.'+k,true)]),
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
// Masque tout ce qui recouvre l'aperçu (boutons flottants, « Toucher pour cadrer », légende, badges, voyant d'état) et
// le panneau des réglages (mobile et ordinateur) : l'affiche occupe toute la fenêtre, et tout l'écran là où le navigateur
// le permet (API Fullscreen ; pas sur iPhone, où la fenêtre suffit). Quitter le plein écran (Échap du navigateur) quitte ce mode. Une couche transparente reçoit le toucher de sortie, qui ne déplace donc
// pas la carte et ne pose aucun repère. Sortie aussi par Échap ou le bouton retour du système. Aucun état d'affiche modifié.
CMS.define('clean', () => {
  let before=null, pushed=false, full=false;
  const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement||null;
  function goFull(){
    const r=document.documentElement, req=r.requestFullscreen||r.webkitRequestFullscreen;
    if(!req || fsEl()) return;
    try{ const pr=req.call(r,{navigationUI:'hide'}); full=true; if(pr && pr.catch) pr.catch(()=>{ full=false; }); }catch(e){ full=false; }
  }
  function leaveFull(){
    if(!full) return; full=false;
    const ex=document.exitFullscreen||document.webkitExitFullscreen;
    if(fsEl() && ex){ try{ const pr=ex.call(document); if(pr && pr.catch) pr.catch(()=>{}); }catch(e){} }
  }
  function enter(){
    if(ui.clean) return;
    setPlacing(false); setFraming(false);
    before=ui.sheet; ui.clean=true; base=null; app.classList.add('clean'); applySheet(); goFull();
    const x=$('cleanExit'); x.hidden=false; x.classList.remove('hinted'); void x.offsetWidth; x.classList.add('hinted');
    try{ history.pushState({cmsClean:1},''); pushed=true; }catch(e){ pushed=false; }
    x.focus({preventScroll:true});
  }
  /** fromHistory : sortie déclenchée par le bouton retour (l'entrée d'historique est déjà retirée) */
  function exit(fromHistory){
    if(!ui.clean) return;
    resetZoom();
    ui.clean=false; app.classList.remove('clean'); $('cleanExit').hidden=true; leaveFull();
    if(before) setSheet(before); before=null;
    if(pushed && !fromHistory){ pushed=false; try{ if(history.state?.cmsClean) history.back(); }catch(e){} }
    pushed=false;
    $('bClean').focus({preventScroll:true});
  }
  // ---------- Loupe (#90) : pincer, double toucher, molette ou + / − agrandissent l'affiche jusqu'à × 4 ; un rendu net
  // (composePoster, au plus à la taille d'export) remplace l'aperçu agrandi. Hors zoom, un toucher (simple) ramène aux réglages.
  const ZMAX=4;
  let z=1, tx=0, ty=0, base=null, gen=0, busy=false, sharpUrl='', tapT=0, lastTap=0;
  const pts=new Map(); let g0=null, moved=false;
  const poster=()=>$('poster');
  function measure(){
    poster().style.transform=''; const P=poster().getBoundingClientRect(), S=$('stage').getBoundingClientRect();
    base={x:P.left-S.left, y:P.top-S.top, w:P.width, h:P.height, W:S.width, H:S.height, sx:S.left, sy:S.top};
  }
  function apply(){
    const on=z>1.001, p=poster();
    p.style.transformOrigin='0 0'; p.style.transform=on ? `translate(${tx}px,${ty}px) scale(${z})` : '';
    app.classList.toggle('zoomed',on); $('cleanZoom').hidden=!on;
    if(on) sharpen();
  }
  /** Bornes : l'affiche agrandie couvre l'écran dans le sens où elle le dépasse, et reste centrée dans l'autre */
  function bound(){
    if(z<=1.001){ z=1; tx=ty=0; return; }
    const w=base.w*z, h=base.h*z;
    const x0=w<=base.W ? (base.W-w)/2 : clamp(base.x+tx,base.W-w,0), y0=h<=base.H ? (base.H-h)/2 : clamp(base.y+ty,base.H-h,0);
    tx=x0-base.x; ty=y0-base.y;
  }
  /** Zoom autour d'un point de la scène (px, py) : ce point reste sous le doigt */
  function zoomAt(nz, px, py){
    if(!base) measure();
    nz=clamp(nz,1,ZMAX); if(px==null){ px=base.W/2; py=base.H/2; }
    const x0=base.x+tx, y0=base.y+ty;
    tx=px-(px-x0)*nz/z-base.x; ty=py-(py-y0)*nz/z-base.y; z=nz; bound(); apply();
  }
  function pan(dx,dy){ tx+=dx; ty+=dy; bound(); apply(); }
  /** Rendu net de l'affiche entière, une fois par passage en Aperçu (rien ne change pendant ce mode) */
  async function sharpen(){
    if(sharpUrl || busy) return;
    busy=true; const my=gen, badge=$('zoomSharpBadge'); badge.hidden=false;
    try{
      const spec=exportSpec(), W=Math.min(spec.W,Math.round(base.w*(window.devicePixelRatio||1)*ZMAX)), H=Math.round(W*spec.H/spec.W);
      const r=await composePoster(W,H);
      const blob=await new Promise(res=>r.canvas.toBlob(res,'image/jpeg',0.92)); r.canvas.width=r.canvas.height=0;
      if(my!==gen || !blob) return;
      sharpUrl=URL.createObjectURL(blob);
      const im=h('img',{className:'zoomsharp',id:'zoomSharp',alt:'',src:sharpUrl}); im.setAttribute('aria-hidden','true'); poster().append(im);
    } catch(e){ /* l'aperçu agrandi reste affiché */ }
    finally{ if(my===gen){ busy=false; badge.hidden=true; } }
  }
  function resetZoom(){
    gen++; busy=false; z=1; tx=ty=0; base=null; pts.clear(); clearTimeout(tapT);
    poster().style.transform=''; app.classList.remove('zoomed'); $('cleanZoom').hidden=true; $('zoomSharpBadge').hidden=true;
    $('zoomSharp')?.remove(); if(sharpUrl){ URL.revokeObjectURL(sharpUrl); sharpUrl=''; }
  }
  function initZoom(){
    const el=$('cleanExit'), loc=e=>({x:e.clientX-base.sx, y:e.clientY-base.sy});
    el.addEventListener('pointerdown',e=>{
      if(!base) measure();
      el.setPointerCapture(e.pointerId); pts.set(e.pointerId,loc(e));
      if(pts.size===1){ moved=false; g0={p:loc(e)}; }
      if(pts.size===2){ const [a,b]=[...pts.values()]; g0={d:Math.hypot(a.x-b.x,a.y-b.y)||1, z, c:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}; moved=true; }
    });
    el.addEventListener('pointermove',e=>{
      if(!pts.has(e.pointerId)) return;
      const prev=pts.get(e.pointerId), p=loc(e); pts.set(e.pointerId,p);
      if(pts.size>=2 && g0?.d){ const [a,b]=[...pts.values()], c={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        zoomAt(g0.z*Math.hypot(a.x-b.x,a.y-b.y)/g0.d,c.x,c.y); return; }
      if(Math.hypot(p.x-g0.p.x,p.y-g0.p.y)>6) moved=true;
      if(moved && z>1.001) pan(p.x-prev.x,p.y-prev.y);
    });
    const end=e=>{
      if(!pts.has(e.pointerId)) return; const p=pts.get(e.pointerId); pts.delete(e.pointerId);
      if(pts.size) return;
      if(moved || e.type==='pointercancel'){ moved=false; return; }
      // toucher : double = zoom × 2,5 au point (ou retour à l'écran) ; simple, hors zoom = retour aux réglages
      const now=Date.now();
      if(now-lastTap<300){ clearTimeout(tapT); lastTap=0; if(z>1.05) zoomAt(1); else zoomAt(2.5,p.x,p.y); }
      else { lastTap=now; tapT=setTimeout(()=>{ if(z<=1.001 && ui.clean) exit(false); },300); }
    };
    el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
    el.addEventListener('wheel',e=>{ e.preventDefault(); if(!base) measure(); const p=loc(e); zoomAt(z*Math.exp(-e.deltaY*0.0015),p.x,p.y); },{passive:false});
    // clavier : + / − / 0, flèches quand l'affiche est agrandie ; Entrée ou Espace : retour aux réglages
    el.addEventListener('keydown',e=>{
      const step=0.15*(base?.W||300), d={ArrowLeft:[step,0],ArrowRight:[-step,0],ArrowUp:[0,step],ArrowDown:[0,-step]}[e.key];
      if(e.key==='+'||e.key==='='){ zoomAt(z*1.5); } else if(e.key==='-'){ zoomAt(z/1.5); } else if(e.key==='0'){ zoomAt(1); }
      else if(d && z>1.001) pan(d[0],d[1]); else return;
      e.preventDefault();
    });
    el.addEventListener('click',e=>{ if(e.detail===0) exit(false); });   // le pointeur est traité par pointerup (simple ou double toucher)
    $('bZoomFit').onclick=()=>{ zoomAt(1); el.focus({preventScroll:true}); };
    $('bZoomExit').onclick=()=>exit(false);
    addEventListener('resize',()=>{ if(ui.clean && z>1.001){ const k=z; measure(); z=1; tx=ty=0; zoomAt(k); } else base=null; });
  }
  function init(){
    $('bClean').onclick=enter;
    initZoom();
    addEventListener('popstate',()=>{ if(ui.clean) exit(true); });
    addEventListener('keydown',e=>{ if(e.key==='Escape' && ui.clean){ e.preventDefault(); exit(false); } });
    const onFs=()=>{ if(!fsEl() && full){ full=false; if(ui.clean) exit(false); } };   // plein écran quitté par le navigateur
    document.addEventListener('fullscreenchange',onFs); document.addEventListener('webkitfullscreenchange',onFs);
  }
  return {enter, exit, init, zoomAt, get zoom(){ return z; }, get sharp(){ return !!sharpUrl; }};
});
// ---------- Barre d'actions : étape suivante ou export ----------
// Le bouton principal de la barre du bas mène à l'onglet visible suivant (même parcours que les boutons « Étape suivante »
// des onglets) ; sur le dernier onglet, il lance l'export et suit l'état du bouton d'export (désactivé s'il l'est).
CMS.define('actbar', () => {
  const NAMES={lieu:'le lieu',repere:'le repère',illus:'l\'illustration',textes:'les textes',style:'le style',export:'l\'export'};
  const SHORT={lieu:'Lieu',repere:'Repère',illus:'Illustration',textes:'Textes',style:'Style',export:'Export'};
  const tabs=()=>[...document.querySelectorAll('#tabs button')].filter(b=>!b.hidden).map(b=>b.dataset.tab);
  /** Onglet visible qui suit l'onglet courant ; null sur le dernier */
  function next(){ const t=tabs(), i=t.indexOf(ui.tab); return i>=0 && i<t.length-1 ? t[i+1] : null; }
  function update(){
    const b=$('bNext'), n=next(), exp=!n;
    const pre=exp ? '' : 'Suivant : ', txt=exp ? 'Exporter' : SHORT[n];   // « Suivant : » quand la barre est assez large (CSS)
    if($('bNextTxt').textContent!==txt) $('bNextTxt').textContent=txt;
    $('bNextPre').textContent=pre;
    b.setAttribute('aria-label', exp ? 'Exporter l\'affiche HD' : 'Étape suivante : '+NAMES[n]);
    b.disabled=exp && $('bExport').disabled; b.dataset.act=exp?'export':'next';
  }
  function go(){
    const n=next();
    if(isSheet() && ui.sheet==='peek') setSheet('half');   // résultat de l'export ou onglet suivant : visibles
    if(!n){ $('bExport').click(); return; }
    showTab(n); document.querySelector('.tabbody').scrollTop=0;
  }
  function init(){
    $('bNext').onclick=go;
    CMS.on('tab:shown',update); CMS.on('state:synced',update); CMS.on('state:saved',update);
    new MutationObserver(update).observe($('bExport'),{attributes:true,attributeFilter:['disabled']});
    new MutationObserver(update).observe($('tabs'),{subtree:true,attributes:true,attributeFilter:['hidden']});
    update();
  }
  return {init, update, next};
});

// ---------- Lecture et Modification ; « Que déplacer ? » (#82) ----------
// Lecture (par défaut, mobile et ordinateur) : rien ne bouge sur l'affiche, ni carte, ni illustration, ni textes. Le verrou
// #shield couvre l'affiche ; le toucher (ou le bouton Modifier de la barre d'actions) ouvre la Modification. Une invitation
// visible (« Toucher pour modifier ») s'affiche aux deux premières utilisations.
// Modification : un seul choix actif à la fois (Carte · Repère · Illustration · Textes, selon le type d'affiche) ; ce qui
// est choisi reçoit les gestes, le reste est inerte (CSS `#app[data-intent]`, calque cadré de CMS.illus, gestes de l'image
// dans js/illus.js). Choix de départ : onglet Repère ou Illustration, sinon la zone touchée (carte ou illustration), sinon le
// calque cadré. « Textes » n'est jamais choisi d'office : c'est un interrupteur (un second toucher revient au choix d'avant).
// Le choix reste hors de l'état de l'affiche (pas d'historique, pas d'enregistrement).
CMS.define('intent', () => {
  const NAMES={map:'Carte',mark:'Repère',illus:'Illustration',text:'Textes'};
  const HINT_TOUCH={map:'Glissez · pincez pour zoomer', illus:'Glissez ou pincez l’illustration', text:'Glissez un texte pour le déplacer'};
  const HINT_MOUSE={map:'Glissez · molette pour zoomer', illus:'Glissez l’illustration · molette : taille', text:'Glissez un texte pour le déplacer'};
  const USES_KEY='cityMapStudio.editUses', HINT_USES=2;
  let sig='', shown=false, pending=null, prev='map';
  const uses=()=>{ try{ return parseInt(localStorage.getItem(USES_KEY),10)||0; }catch(e){ return HINT_USES; } };
  const illusReady=()=>!!CMS.illus?.ready?.();
  const hasText=()=>{ const h=CMS.illus?.hitInfo; return !!(h && (h.title || h.foot)); };
  /** Choix proposés selon le type d'affiche : Illustration seule = image et textes ; sinon carte, repère, image (si importée), textes (s'il y a un bloc à déplacer) */
  function available(){
    const m=st.mode, a=[];
    if(m!=='illus') a.push('map','mark');
    if(m!=='map' && illusReady()) a.push('illus');
    if(hasText()) a.push('text');
    return a;
  }
  /** Choix par défaut : jamais « Textes » */
  const fallback=a=>st.mode==='illus' && a.includes('illus') ? 'illus' : a.includes('map') ? 'map' : a.find(v=>v!=='text') || 'map';
  /** Choix de départ : placement en cours, onglet Repère ou Illustration, zone touchée, calque cadré */
  function initial(a){
    if(ui.placing && a.includes('mark')) return 'mark';
    const v={repere:'mark',illus:'illus'}[ui.tab];
    if(v && a.includes(v)) return v;
    if(pending && a.includes(pending)) return pending;
    return CMS.illus?.layer?.()==='illus' && a.includes('illus') ? 'illus' : fallback(a);
  }
  /** Applique le choix : calque cadré, placement du repère. quiet : sans bulle d'information */
  function apply(v,quiet){
    if(ui.intent!==v && ui.intent!=='text') prev=ui.intent;
    ui.intent=v;
    if(st.mode==='mix' && v!=='text') CMS.illus.setLayer(v==='illus' ? 'illus' : 'map',quiet);   // Carte + illustration : calque cadré ; sinon il est imposé par le type d'affiche
    const wantPlacing=v==='mark';
    if(wantPlacing!==ui.placing) setPlacing(wantPlacing,0);
    sync(ui.framing);
  }
  /** Choix de l'utilisateur ; « Textes » touché alors qu'il est actif : retour au choix d'avant (interrupteur) */
  function set(v){
    const a=available(); if(!a.includes(v)) return;
    if(v===ui.intent){ if(v==='text') apply(a.includes(prev) && prev!=='text' ? prev : fallback(a),false); return; }
    apply(v,false);
  }
  /** Ouvre la Modification depuis un point de l'affiche (coordonnées écran) : la zone touchée donne le choix de départ */
  function enterAt(x,y){
    const P=$('poster').getBoundingClientRect(), G=ui.geomCss, px=x-P.left, py=y-P.top;
    const inR=r=>r && r.w>0 && px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h;
    pending = st.mode==='illus' ? 'illus' : st.mode==='mix' && illusReady() && inR(G?.illus) && !inR(G?.map) ? 'illus' : 'map';
    setFraming(true); pending=null;
  }
  /** Début de la Modification */
  function begin(){
    try{ localStorage.setItem(USES_KEY,String(uses()+1)); }catch(e){}
    prev='map'; apply(initial(available()),true);
  }
  /** Fin de la Modification : le placement du repère lancé depuis le sélecteur se termine avec elle */
  function end(){ if(ui.placing) setPlacing(false); ui.intent='map'; }
  /** Placement du repère terminé (ou lancé) pendant la Modification : le sélecteur suit */
  function placing(on){
    if(on) ui.intent='mark';
    else if(ui.intent==='mark') ui.intent=fallback(available());
    sync(ui.framing);
  }
  /** Invitation visible en Lecture, aux premières utilisations ; « Modifier » inactif quand rien ne peut bouger
   *  (Illustration sans image importée) */
  function hint(){
    const none=!ui.framing && !available().some(v=>v!=='text'), e=$('bEdit');
    if(!ui.framing){ e.disabled=none; e.title=none ? 'Importez d\u2019abord votre illustration (onglet Illustration)' : 'Modifier l\'affiche : déplacer la carte, l\'illustration, les textes, poser le repère'; }
    const h=$('shieldHint'), on=!ui.framing && uses()<HINT_USES;
    h.hidden=!on; if(on) h.querySelector('b').textContent=isSheet() ? 'Toucher pour modifier' : 'Cliquer pour modifier';
  }
  /** Contour de la zone de l'illustration (celle de la composition) quand « Illustration » est choisi */
  function frame(){
    const r=ui.geomCss?.illus, f=$('illusFrame'); if(!r) return;
    Object.assign(f.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});
  }
  /** Affichage : choix proposés, choix actif (radio ARIA), indication en haut de la scène. Un choix devenu impossible
   *  (texte replacé dans le gabarit, image retirée) est remplacé. Renvoie vrai si le sélecteur apparaît ou disparaît
   *  (le pied change de hauteur). */
  function sync(bar){
    bar = bar===undefined ? ui.framing : !!bar;
    const was=shown, a=bar ? available() : [];
    if(bar && !a.includes(ui.intent)){
      const v=fallback(a);
      if(a.includes(v) && v!=='text') apply(v,true); else setFraming(false);   // plus rien à déplacer (image retirée) : retour en Lecture
      return was!==shown;
    }
    const H=matchMedia('(pointer:coarse)').matches ? HINT_TOUCH : HINT_MOUSE;
    const hint = ui.intent==='mark' ? $('placeHint').textContent : H[ui.intent] || H.map;
    if(bar) app.dataset.intent=ui.intent; else delete app.dataset.intent;
    if(bar && ui.intent==='illus') frame();
    const s=(bar?'1':'0')+a.join()+ui.intent+hint;
    if(s===sig) return false; sig=s;
    document.querySelectorAll('#intentSeg button').forEach(b=>{
      const v=b.dataset.v, on=a.includes(v), cur=on && v===ui.intent; b.hidden=!on; b.setAttribute('aria-checked',String(cur)); b.tabIndex=cur ? 0 : -1;
    });
    if(bar && $('frameTxt').textContent!==hint) $('frameTxt').textContent=hint;
    $('intentBar').hidden=!bar; shown=bar;
    return was!==bar;
  }
  /** Pour les tests et la console : ouvre la Modification sur un choix */
  function open(v){ if(!ui.framing) setFraming(true); if(v && v!==ui.intent) set(v); }
  function init(){
    const seg=$('intentSeg');
    seg.addEventListener('click',e=>{ const b=e.target.closest('button'); if(b && !b.hidden) set(b.dataset.v); });
    seg.addEventListener('keydown',e=>{   // motif ARIA des boutons radio : flèches, Début, Fin
      const bs=[...seg.querySelectorAll('button:not([hidden])')], i=bs.findIndex(x=>x.dataset.v===ui.intent);
      const j={ArrowRight:i+1,ArrowDown:i+1,ArrowLeft:i-1,ArrowUp:i-1,Home:0,End:bs.length-1}[e.key]; if(j==null) return;
      e.preventDefault(); const b=bs[(j+bs.length)%bs.length]; set(b.dataset.v); b.focus();
    });
    // les blocs de texte, l'illustration, le type d'affiche et la mise en page changent les choix possibles ou le contour
    for(const ev of ['hits:placed','layer:synced','state:synced','layout:changed']) CMS.on(ev,()=>{ if(ui.framing){ sync(); if(ui.intent==='illus') frame(); } else hint(); });
    hint();
  }
  return {init, begin, end, placing, sync, set, open, enterAt, hint, available, NAMES};
});

// ---------- Réglages modifiés : pastilles, comptes et relecture (évolutions 5 et 7) ----------
// Une seule table de parties : chacune dit quels réglages s'écartent des valeurs par défaut (DEFAULT_STATE ; pour les
// couleurs, la palette du thème choisi) et sait les rétablir. Le lieu, le cadrage, les textes saisis, le type d'affiche, le
// gabarit et le thème sont des choix, jamais comptés comme des écarts. Seules comptent les parties qui agissent dans le
// type d'affiche courant (onglet visible, condition `on`). Affichage : pastille sur l'onglet (avec description pour les
// lecteurs d'écran), compte dans le titre des sections repliables (sec), liste de l'onglet Export avec « Voir » et
// « Réinitialiser ». Une réinitialisation partielle passe par l'historique : « Annuler » revient en arrière.
CMS.define('changes', () => {
  const D=DEFAULT_STATE, J=JSON.stringify, same=(a,b)=>J(a)===J(b);
  /** Nom court d'un réglage : texte de son étiquette, sans la précision entre parenthèses */
  const lab=k=>{ const el=document.querySelector(`[data-k="${k}"]`), l=el && el.closest('label');
    return l ? [...l.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').replace(/\s*\(.*$/,'').trim() || k : k; };
  const nm=(list,k)=>(list.find(x=>x[0]===k)||[,k])[1];
  const pct=v=>Math.round(v)+' %', signed=v=>(v>0?'+':'')+v;
  const LINES={title:'titre',subtitle:'sous-titre',coords:'coordonnées',dedication:'dédicace',names:'noms',date:'date'};
  const TABS={lieu:'Lieu',repere:'Repère',illus:'Illustration',textes:'Textes',style:'Style',export:'Export'};
  const tpos=s=>CMS.illus.posOf(s);
  const duoOf=s=>DUOS.find(([,,ft,fx])=>fx===s.font && (s.fontTitle||s.font)===ft);   // duo de polices choisi, s'il y en a un   // CMS.illus : chargé après ce fichier, lu à l'usage
  const dpos=s=>s.mode==='map' ? D.illusText.map : s.mode==='mix' ? D.illusText.mix : D.illusText;
  const onMap=s=>s.mode!=='illus';
  const copy=(o,keys,src=D)=>{ for(const k of keys) o[k]=structuredClone(src[k]); };
  const fmtWhen=w=>{ const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d:\d\d)$/.exec(w); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : w; };
  const FX=Object.keys(D.fx).filter(k=>k!=='foil');   // la dorure est réglée avec le papier
  /** Parties : id, onglet, ancre (id), nom, sections repliables (sec), condition (on), écarts (items), réinitialisation (reset) */
  const GROUPS=[
    {id:'marker', tab:'repere', at:'hMarker', name:'Repère', items:s=>[
      s.markerStyle!==D.markerStyle && `« ${nm(MARKERS,s.markerStyle)} »`, s.markerFill!==D.markerFill && 'contour seul',
      s.markerSize!==D.markerSize && 'taille '+pct(s.markerSize), s.markerOpacity!==D.markerOpacity && 'opacité '+pct(s.markerOpacity*100),
      !!s.markerLabel && 'nom du lieu'],
      reset:o=>copy(o,['markerStyle','markerFill','markerSize','markerOpacity','markerLabel'])},
    {id:'places', tab:'repere', at:'hPlaces', name:'Plusieurs lieux', on:s=>s.layout!=='diptych', items:s=>[
      s.markers2.length>0 && (s.markers2.length+1)+' lieux', s.numbered && 'numérotés', s.linkMarkers && 'reliés'],
      reset:o=>copy(o,['markers2','numbered','linkMarkers'])},
    {id:'route', tab:'repere', at:'hRoute', name:'Itinéraire', items:s=>[
      !!s.route && ('GPX actif'+(s.route.name?` « ${s.route.name} »`:'')+(s.route.show===false?' (masqué)':'')),
      !same(s.routeStyle,D.routeStyle) && 'style du tracé'],
      reset:o=>copy(o,['route','routeStyle'])},
    {id:'illusCrop', tab:'illus', at:'hIllusCrop', step:'image', name:'Cadrage de l\'image', items:s=>[
      s.illus.fit!==D.illus.fit && 'image entière', s.illus.zoom!==D.illus.zoom && 'zoom '+pct(s.illus.zoom),
      !!(s.illus.ox||s.illus.oy) && 'image déplacée'],
      reset:o=>copy(o.illus,['fit','zoom','ox','oy'],D.illus)},
    {id:'illusFx', tab:'illus', at:'hIllusFx', step:'image', name:'Retouches de l\'image', items:s=>[
      !!s.illus.bright && 'luminosité '+signed(s.illus.bright), !!s.illus.contrast && 'contraste '+signed(s.illus.contrast),
      !!s.illus.satur && 'saturation '+signed(s.illus.satur),
      s.illus.vintage!==D.illus.vintage && 'filtre vintage '+(s.illus.vintage==='light'?'léger':'marqué'),
      s.illus.grain && lab('illus.grain'), s.illus.flat && lab('illus.flat'), s.illus.upscale && lab('illus.upscale')],
      reset:o=>copy(o.illus,['bright','contrast','satur','vintage','grain','flat','upscale'],D.illus)},
    // Onglet Textes (#88) : duos, Vintage et couleur des lettres en vue ; polices détaillées, ombre, tailles par ligne… dans Plus de réglages
    {id:'typo', tab:'textes', at:'hTypo', name:'Typographie', items:s=>{ const d=duoOf(s); return [
      d && d[0]!==duoOf(D)?.[0] && `duo « ${d[1]} »`, s.illusText.style!==D.illusText.style && (s.illusText.style==='vintage' ? 'titre Vintage' : 'police du titre fixée'),
      s.illusText.color!==D.illusText.color && 'couleur des lettres']; },
      reset:o=>{ copy(o,['font','fontTitle']); copy(o.illusText,['style','color'],D.illusText); }},
    {id:'fonts', tab:'textes', at:'hFonts', sec:['textMore'], name:'Polices', items:s=>duoOf(s) ? [] : [
      s.fontTitle!==D.fontTitle && 'police du titre', s.font!==D.font && 'police du texte'],
      reset:o=>copy(o,['font','fontTitle'])},
    {id:'textFx', tab:'textes', at:'hTextFx', sec:['textMore'], name:'Ombre et contour', items:s=>[
      s.illusText.shadow!==D.illusText.shadow && 'ombre', s.illusText.outline!==D.illusText.outline && 'contour', s.illusText.off!==D.illusText.off && 'décalage de l\'ombre'],
      reset:o=>copy(o.illusText,['shadow','outline','off'],D.illusText)},
    {id:'textPos', tab:'textes', at:'hTextPos', name:'Positions des textes', items:s=>{ const p=tpos(s), d=dpos(s); return [
      (p.free || p.pos!==d.pos) && (p.free ? 'titre placé à la main' : 'titre déplacé'),
      (p.ffree || p.fpos!==d.fpos) && (p.ffree ? 'lignes du bas placées à la main' : 'lignes du bas déplacées'),
      !!p.zone && !same(p.zone,d.zone) && 'textes posés sur la carte ou sur toute l\'affiche',   // Carte + illustration (#86)
      !same(p.deco,d.deco) && 'présentation des textes', (p.ftpl||'classique')!==d.ftpl && 'mise en forme des lignes du bas'];  },
      reset:o=>{ const p=tpos(o), d=dpos(o); copy(p,['pos','free','fpos','ffree','deco','ftpl',...(p.zone?['zone']:[])],d); }},
    {id:'textMore', tab:'textes', at:'hPlate', sec:['textMore'], name:'Plaques (fond et trait) et ordre des lignes', items:s=>[
      !same(s.illusText.plate,D.illusText.plate) && 'plaques (fond, opacité, trait ou éloignement)', !!s.lineOrder && 'ordre des lignes'],
      reset:o=>{ o.illusText.plate=structuredClone(D.illusText.plate); o.lineOrder=null; }},
    {id:'textSize', tab:'textes', at:'hTextSize', name:'Taille de tous les textes', items:s=>[s.textScaleAll!==D.textScaleAll && 'tous les textes à '+pct(s.textScaleAll)],
      reset:o=>copy(o,['textScaleAll'])},
    {id:'lineSizes', tab:'textes', at:'hLineSizes', sec:['textMore'], name:'Taille de chaque ligne', items:s=>{
      const n=Object.keys(D.textScale).filter(k=>s.textScale[k]!==D.textScale[k]).length;
      return [n>0 && (n>1 ? n+' lignes redimensionnées' : '1 ligne redimensionnée')]; },
      reset:o=>copy(o,['textScale'])},
    {id:'lines', tab:'textes', at:'hLines', name:'Lignes', items:s=>{ const off=Object.keys(D.show).filter(k=>s.show[k]!==D.show[k]); return [
      off.length>0 && (off.length>1?'masquées : ':'masquée : ')+off.map(k=>LINES[k]||k).join(', '), !!s.coordsManual && 'coordonnées saisies à la main']; },
      reset:o=>copy(o,['show','coordsManual'])},
    {id:'lineOpts', tab:'textes', at:'hLineOpts', sec:['textMore'], name:'Dédicace et coordonnées', items:s=>[
      s.dedWrap!==D.dedWrap && 'coupure de la dédicace imposée', s.coordFormat!==D.coordFormat && 'coordonnées en degrés, minutes, secondes'],
      reset:o=>copy(o,['coordFormat','dedWrap'])},
    {id:'paper', tab:'style', at:'hPaper', name:'Papier et dorure', items:s=>[
      s.texture!==D.texture && `papier « ${nm(TEXTURES,s.texture)} »`, s.folds && lab('folds'),
      s.mode!=='map' && s.illus.paper && lab('illus.paper'), s.fx.foil && lab('fx.foil')],
      reset:o=>{ copy(o,['texture','folds']); o.illus.paper=D.illus.paper; o.fx.foil=D.fx.foil; }},
    {id:'colors', tab:'style', at:'colorsBox', sec:['styleMore','colorsBox'], on:onMap, name:'Couleurs', items:s=>{
      const t=THEMES[s.theme], n=t ? Object.keys(s.colors).filter(k=>s.colors[k]!==t.c[k]).length : 0;
      return [n>0 && (n>1 ? n+' teintes personnalisées' : '1 teinte personnalisée')+(t?` (thème « ${t.name} »)`:'')]; },
      reset:o=>{ const t=THEMES[o.theme]; if(t) o.colors={...t.c}; }},
    {id:'fx', tab:'style', at:'hFx', sec:['styleMore'], on:onMap, name:'Effets de tracé', items:s=>[
      ...FX.map(k=>s.fx[k] && lab('fx.'+k)), (s.fx.halo||s.fx.quarter) && s.focusR!==D.focusR && 'rayon '+pct(s.focusR)],
      reset:o=>{ for(const k of FX) o.fx[k]=D.fx[k]; o.focusR=D.focusR; }},
    {id:'orn', tab:'style', at:'hOrn', sec:['styleMore'], on:onMap, name:'Ornements', items:s=>Object.keys(D.orn).map(k=>s.orn[k]!==D.orn[k] && lab('orn.'+k)),
      reset:o=>copy(o,['orn'])},
    {id:'sky', tab:'style', at:'hSky', sec:['styleMore'], on:s=>onMap(s) && s.layout==='sky', name:'Ciel du jour J', items:s=>[
      !!s.sky.when && 'ciel du '+fmtWhen(s.sky.when), s.sky.tz!=='auto' && 'fuseau choisi',
      ['lines','grid','moon','planets','milky'].some(k=>s.sky[k]!==D.sky[k]) && 'options du ciel'],
      reset:o=>copy(o,['sky'])},
    {id:'trace', tab:'style', at:'hTrace', sec:['styleMore'], on:onMap, name:'Tracé, calques et mise en page', items:s=>[
      s.stroke!==D.stroke && 'trait '+pct(s.stroke*100), s.waterMult!==D.waterMult && 'eau '+pct(s.waterMult*100),
      ...Object.keys(D.layers).map(k=>s.layers[k]!==D.layers[k] && `sans « ${lab('layers.'+k)} »`),
      s.margin!==D.margin && 'marge '+String(s.margin).replace('.',',')+' %', s.ring!==D.ring && 'sans contour de la forme',
      s.attribution!==D.attribution && 'mention des sources abrégée'],
      reset:o=>copy(o,['stroke','waterMult','layers','margin','ring','attribution'])},
    {id:'export', tab:'export', at:'hRender', name:'Rendu', items:s=>[
      s.format!==D.format && nm(FORMATS,s.format), s.orient!==D.orient && !(s.mode==='mix' && s.mix.compo==='cote') && 'paysage',
      s.fileType!==D.fileType && 'document PDF'],
      reset:o=>{ copy(o,['format','fileType']); if(!(o.mode==='mix' && o.mix.compo==='cote')) o.orient=D.orient; }},
  ];
  const tabOn=t=>{ const b=$('tb-'+t); return !!b && !b.hidden; };
  /** Parties modifiées dans le contexte courant : [{g, items}] */
  function list(s=st){
    const out=[];
    for(const g of GROUPS){
      if(!tabOn(g.tab) || (g.on && !g.on(s))) continue;
      const items=g.items(s).filter(Boolean); if(items.length) out.push({g,items});
    }
    return out;
  }
  function reveal(g){
    showTab(g.tab); if(isSheet() && ui.sheet==='peek') setSheet('half');
    if(g.step) document.querySelector(`#illusStepSeg [data-v="${g.step}"]`)?.click();
    const el=$(g.at); if(!el) return;
    for(let d=el.closest('details'); d; d=d.parentElement.closest('details')) d.open=true;
    if(el.tagName==='DETAILS') el.open=true;
    setTimeout(()=>CMS.panelScroll.to(el,'start',true),60);
  }
  function reset(id){
    const g=GROUPS.find(x=>x.id===id); if(!g) return false;
    compareBefore(false); clearTimeout(saveT); recordHistory();
    const {engine,...o}=structuredClone(st); g.reset(o);
    const s=JSON.stringify(o); if(s===hist.cur) return false;
    hist.past.push(hist.cur); if(hist.past.length>HIST_MAX) hist.past.shift(); hist.future=[];
    applySnap(s); hist.quietUntil=Date.now()+1500;
    toast(`${g.name} : réglages par défaut rétablis · « Annuler » pour revenir en arrière`);
    update(); return true;
  }
  let sig='';
  function update(){
    const L=list(), per={}, secs={};
    for(const {g,items} of L){ (per[g.tab]=per[g.tab]||[]).push(g.name+' : '+items.join(', ')); for(const k of g.sec||[]) secs[k]=(secs[k]||0)+items.length; }
    // pastilles des onglets
    document.querySelectorAll('#tabs button').forEach(b=>{
      const t=b.dataset.tab, d=b.querySelector('.tbd'), txt=per[t] ? 'Réglages modifiés : '+per[t].join(' ; ') : '';
      if(d) d.hidden=!txt;
      const desc=$('tbdesc-'+t); if(desc && desc.textContent!==txt) desc.textContent=txt;
      if(txt) b.setAttribute('aria-describedby','tbdesc-'+t); else b.removeAttribute('aria-describedby');
      b.title=txt;
    });
    // comptes des sections repliables
    document.querySelectorAll('summary .chg').forEach(c=>{ const n=secs[c.id.slice(4)]||0, t=n ? n+(n>1?' modifiés':' modifié') : '';
      c.hidden=!n; if(c.textContent!==t) c.textContent=t; });
    // relecture (onglet Export) : reconstruite seulement si elle change (le focus reste en place)
    const s=J(L.map(x=>[x.g.id,x.items])); if(s===sig) return; sig=s;
    const ul=$('changesList'), had=ul.contains(document.activeElement);
    ul.textContent='';
    for(const {g,items} of L){
      const bView=h('button',{type:'button',className:'btn sm','aria-label':'Voir : '+g.name},'Voir'); bView.onclick=()=>reveal(g);
      const bReset=h('button',{type:'button',className:'btn sm','aria-label':'Réinitialiser : '+g.name},'Réinitialiser'); bReset.dataset.reset=g.id;
      bReset.onclick=()=>reset(g.id);
      ul.appendChild(h('li',{},h('div',{className:'cg'},h('span',{className:'ctab'},TABS[g.tab]),h('b',{},g.name),h('small',{},items.join(' · '))),
        h('div',{className:'acts'},bView,bReset)));
    }
    $('changesEmpty').hidden=L.length>0;
    if(had) (ul.querySelector('button[data-reset]')||$('bReset')).focus({preventScroll:true});
  }
  let raf=0; const schedule=()=>{ if(!raf) raf=requestAnimationFrame(()=>{ raf=0; update(); }); };
  function init(){
    document.querySelectorAll('#tabs button').forEach(b=>{
      b.appendChild(h('i',{className:'tbd',hidden:true,'aria-hidden':'true'}));
      $('panel').appendChild(h('span',{id:'tbdesc-'+b.dataset.tab,hidden:true}));
    });
    CMS.on('state:saved',schedule); CMS.on('state:synced',schedule); CMS.on('tab:shown',schedule);
    $('panel').addEventListener('input',schedule); $('panel').addEventListener('click',schedule);
    new MutationObserver(schedule).observe($('tabs'),{subtree:true,attributes:true,attributeFilter:['hidden']});
    update();
  }
  return {init, update, list, reset, groups:GROUPS.map(g=>g.id)};
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
  $('shield').onclick=e=>CMS.intent.enterAt(e.clientX,e.clientY);   // la zone touchée (carte ou illustration) donne le choix de départ
  $('bEdit').onclick=()=>setFraming(!ui.framing);
  CMS.intent.init();
  TWO_COL.addEventListener('change',()=>{ setFraming(false); setPlacing(false); ui.sheetBefore=null; setSheet(ui.sheet); stageMode(); });
  CMS.clean.init();
  setSheet('half'); stageMode();
}

// ---------- Couleurs d'après une image : photo ou illustration importée (#77) ----------
// L'image est lue et réduite sur l'appareil (aucune adresse ni envoi) ; seules ses couleurs sont gardées.
// Une seule entrée, onglet Style, pour les trois types d'affiche : la même palette donne la version claire ou sombre.
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

CMS.define('palette', () => {
  let photoPal=null, photoSrc='photo';
  /** Couleurs dominantes d'une image (bitmap, canevas ou image), réduite à 80 px de côté */
  function paletteOfImage(src, iw, ih){
    const k=Math.min(1,80/Math.max(iw,ih)), w=Math.max(1,Math.round(iw*k)), hh=Math.max(1,Math.round(ih*k));
    const cv=document.createElement('canvas'); cv.width=w; cv.height=hh; const c=cv.getContext('2d',{willReadFrequently:true}); c.drawImage(src,0,0,w,hh);
    return paletteOf(c.getImageData(0,0,w,hh).data);
  }
  /** Nouvelle palette (src : 'photo' | 'illus') : nuancier affiché, version claire appliquée */
  function setImagePalette(pal, src){
    if(!pal || !pal.length){ toast('Aucune couleur exploitable dans cette image.',true); return; }
    photoPal=pal; photoSrc=src;
    const sw=$('photoSw'); sw.textContent=''; pal.forEach(p=>sw.append(h('i',{style:{background:p.hex}})));
    $('photoNote').textContent=src==='illus' ? 'Couleurs tirées de l\'illustration importée : papier, textes et carte s\'y accordent.' : 'La photo reste sur votre appareil : seules ses couleurs sont gardées.';
    $('photoPal').hidden=false; apply('light');
  }
  async function importPhotoPalette(file){
    let bmp;
    try{ bmp=await createImageBitmap(file); }catch(e){ toast('Image illisible : choisissez une photo JPEG, PNG ou WebP.',true); return; }
    const pal=paletteOfImage(bmp,bmp.width,bmp.height); if(bmp.close) bmp.close();
    setImagePalette(pal,'photo');
  }
  /** Palette de l'illustration importée (modes illustrés) */
  function illusPalette(){
    const im=CMS.illus.previewImage();
    if(!im){ toast('Importez d\'abord votre illustration (onglet Illustration, étape Image).',true); return; }
    setImagePalette(paletteOfImage(im,im.width,im.height),'illus');
  }
  function apply(v){
    if(!photoPal) return;
    const before=cmpSnap();
    st.colors=photoTheme(photoPal,v==='dark'); setSeg('photoSeg',v);
    noteChange(before,{theme:true}); refreshColors(); changed({all:true,cards:true});
    toast((photoSrc==='illus' ? 'Couleurs tirées de l\'illustration' : 'Palette de la photo appliquée')+' · « Annuler » pour revenir');
  }
  return {fromFile:importPhotoPalette, fromIllus:illusPalette, apply};
});

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
