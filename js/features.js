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
    toast((ok?'Lien copié':'Copiez le lien affiché')+(dropped?' · itinéraire non inclus (trop long)':'')); }
  catch(e){ toast('Lien impossible : '+e.message,true); }
}
async function loadFromHash(){
  const m=/^#a=([zj][A-Za-z0-9_-]+)$/.exec(location.hash); if(!m) return;
  let before=null;
  try{
    const o=await decodeShare(m[1]); commitHistory(0);
    const eng=st.engine, fresh=normState(o); before=structuredClone(st);
    replaceState(fresh,{engine:eng});
    setPlacing(false); syncInputs(); layoutPreview(); loadFonts().then(()=>scheduleOver()); goTo(st.center.lat,st.center.lon,st.zoom); redrawAll(true);
    commitHistory(); history.replaceState(null,'',location.pathname+location.search);
    toast('Affiche chargée depuis le lien · « Annuler » pour retrouver la vôtre');
  }catch(e){
    if(before){ replaceState(before); try{ syncInputs(); layoutPreview(); }catch(_){} commitHistory(); }   // jamais d'état à moitié appliqué
    history.replaceState(null,'',location.pathname+location.search);
    toast('Lien d\'affiche illisible : '+e.message,true);
  }
}
/** Remplace le contenu de l'état (l'objet `st` garde son identité : __cms.st et les fermetures restent valides) */
function replaceState(next,extra){ for(const k of Object.keys(st)) delete st[k]; Object.assign(st,next,extra||{}); }

// ---------- Ambiance au premier lancement ----------
// Proposée une seule fois : première visite sans affiche enregistrée, ni lien partagé ; après la demande d'accord.
const WELCOME_KEY='cityMapStudio.welcomed';
const firstVisit=(()=>{ try{ return !localStorage.getItem(WELCOME_KEY) && !localStorage.getItem(STORE_KEY); }catch(e){ return false; } })();
let welcomeDone=!firstVisit || /^#a=/.test(location.hash);
function maybeWelcome(){
  try{ if(localStorage.getItem(WELCOME_KEY)) welcomeDone=true; }catch(e){}   // choix fait dans un autre onglet ou depuis le démarrage
  if(welcomeDone || $('welcome').classList.contains('show')) return;
  if($('consent').classList.contains('show')) return;   // repris après le choix d'accord (giveConsent / declineConsent)
  const box=$('welAmb'); box.textContent='';
  AMBIANCES.forEach(([k,n])=>{ const b=h('button',{type:'button',dataset:{v:k},role:'listitem'},h('canvas',{width:70,height:99}),h('small',{},n));
    b.onclick=()=>{ closeWelcome(); applyAmbiance(k); showTab('lieu'); toast(`Ambiance « ${n} » · cherchez maintenant votre lieu`); }; box.appendChild(b); });
  const draw=()=>box.querySelectorAll('button').forEach(b=>{ const p=AMBIANCES.find(a=>a[0]===b.dataset.v)[2];
    thumb(b.querySelector('canvas'),{layout:p.layout,colors:THEMES[p.theme].c,font:p.font,fontTitle:p.fontTitle,markerStyle:p.markerStyle}); });
  draw();
  // polices des ambiances : chargées une fois (fichiers locaux), puis vignettes redessinées
  Promise.all(AMBIANCES.flatMap(([,,p])=>[p.font,p.fontTitle].filter(Boolean)).flatMap(f=>FONTS[f].load).map(f=>document.fonts.load(f).catch(()=>0))).then(draw);
  openDialog('welcome');
  setTimeout(()=>box.querySelector('button')?.focus(),50);
}
function closeWelcome(){
  welcomeDone=true; closeDialog('welcome');
  try{ localStorage.setItem(WELCOME_KEY,'1'); }catch(e){}
}

// ---------- Ambiances et modèles de texte ----------
function applyAmbiance(k){
  const a=AMBIANCES.find(x=>x[0]===k); if(!a) return; const p=a[2];
  commitHistory(0);   // étape d'historique explicite : un choix fait juste après le démarrage reste annulable
  st.theme=p.theme; st.colors={...THEMES[p.theme].c}; st.font=p.font; st.fontTitle=p.fontTitle; st.markerStyle=p.markerStyle; st.texture=p.texture;
  st.fx={...DEFAULT_STATE.fx,...(p.fx||{})}; st.orn={...DEFAULT_STATE.orn,...(p.orn||{})}; st.folds=!!p.folds;
  setLayout(p.layout,true);
  syncInputs(); loadFonts().then(()=>{ scheduleOver(); refreshCards(); }); redrawAll(true); drawTexture(); commitHistory();
  toast(`Ambiance « ${a[1]} » appliquée · tout reste personnalisable`);
}
function applyOccasion(k){
  const o=OCCASIONS.find(x=>x[0]===k); if(!o) return; commitHistory(0);
  st.texts.dedication=o[2]; st.show.dedication=true;
  if(!st.texts.names.trim() || OCCASIONS.some(x=>x[3]===st.texts.names)) st.texts.names=o[3];
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
/** Dimensions affichées sur le bouton d'export : suivent l'orientation */
function updateExportLabel(){ const d=posterDims(); $('exportDims').textContent=`\u00a0· ${d.W} × ${d.H} px`; }
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
  const peek=Math.ceil($('grab').offsetHeight+$('tabs').offsetHeight+document.querySelector('.foot').offsetHeight+($('banner').classList.contains('show')?$('banner').offsetHeight:0))+1;
  return {peek, half:Math.max(peek+120,Math.round(vh*0.55)), full:Math.max(peek+120,Math.round(vh*0.84)), max:Math.round(vh*0.92)};
}
/** Applique la hauteur du panneau : cran nommé, ou hauteur libre en px pendant un glissement */
function applySheet(px){
  const root=document.documentElement;
  app.classList.toggle('sheetmode',isSheet());
  if(!isSheet()){ root.style.removeProperty('--sheetH'); return; }
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
    setTimeout(()=>e.target.scrollIntoView({block:'nearest'}),50); });
  $('panel').addEventListener('focusout',()=>{ clearTimeout(restoreT); restoreT=setTimeout(()=>{
    if(before!=null && !document.activeElement?.matches?.('input[type=text],input[type=search]')){ setSheet(before); before=null; } },200); });
  $('shield').onclick=()=>setFraming(true);
  $('bFrame').onclick=()=>setFraming(!ui.framing);
  $('bFrameDone').onclick=()=>setFraming(false);
  TWO_COL.addEventListener('change',()=>{ setFraming(false); setPlacing(false); ui.sheetBefore=null; setSheet(ui.sheet); stageMode(); });
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
  const before={theme:st.theme,colors:{...st.colors}};
  st.colors=photoTheme(photoPal,v==='dark'); setSeg('photoSeg',v);
  noteThemeChange(before); refreshColors(); changed({all:true,cards:true});
  toast('Palette de la photo appliquée · « Annuler » pour revenir');
}
