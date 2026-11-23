/* City Map Studio — Interface : taille du texte, coordonnées, historique, construction de l'interface, recherche, polices.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html. */
'use strict';
// ---------- Taille du texte de l'interface (A− / A+) ----------
// Préférence d'affichage propre à l'appareil : hors de l'état de l'affiche, non concernée par « Réinitialiser ».
const UI_SCALE_KEY='cityMapStudio.uiScale', UI_SCALES=[0.875,1,1.125,1.25,1.375];
let uiScale=(()=>{ try{ const v=parseFloat(localStorage.getItem(UI_SCALE_KEY)); return UI_SCALES.includes(v)?v:1; }catch(e){ return 1; } })();
function applyUiScale(){
  const r=document.documentElement.style;
  if(uiScale===1) r.removeProperty('font-size'); else r.fontSize=(uiScale*100)+'%';   // 100 % : réglage du système (Dynamic Type sur iOS)
  $('bUiSmaller').disabled=uiScale===UI_SCALES[0]; $('bUiLarger').disabled=uiScale===UI_SCALES[UI_SCALES.length-1];
  try{ uiScale===1 ? localStorage.removeItem(UI_SCALE_KEY) : localStorage.setItem(UI_SCALE_KEY,String(uiScale)); }catch(e){}
  requestAnimationFrame(()=>applySheet());
}
function stepUiScale(d){ const i=UI_SCALES.indexOf(uiScale); uiScale=UI_SCALES[Math.max(0,Math.min(UI_SCALES.length-1,i+d))]; applyUiScale(); toast(`Texte de l'interface : ${Math.round(uiScale*100)} %`); }
/** Lit des coordonnées saisies : décimal (point ou virgule), DMS / DM avec N S E W O, ou URL de carte. Renvoie {lat,lon} ou lève une erreur. */
function parseCoords(input){
  let t=String(input||'').trim(); if(!t) throw new Error('Saisissez des coordonnées.');
  const url=t.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) || t.match(/[?&#](?:mlat|lat|q|query|ll)=(-?\d+(?:\.\d+)?)(?:,|&mlon=|&lon=|%2C)(-?\d+(?:\.\d+)?)/i) || t.match(/#map=[\d.]+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
  let lat, lon;
  if(url){ lat=+url[1]; lon=+url[2]; }
  else{
    const toks=[...t.matchAll(/(-?\d+(?:[.,]\d+)?)|([NSEWO])(?![a-z])/gi)].map(m=>m[1]!=null?{n:m[1]}:{h:m[2].toUpperCase()});
    const nums=toks.filter(x=>x.n!=null);
    if(!nums.length) throw new Error('Format non reconnu : saisissez « latitude, longitude ».');
    const val=g=>{ if(!g.length||g.length>3) throw new Error('Format non reconnu.');
      const v=g.map(x=>parseFloat(x.replace(',','.'))); const neg=g[0].startsWith('-');
      if(v.slice(1).some(x=>x<0||x>=60)) throw new Error('Minutes et secondes doivent être comprises entre 0 et 60.');
      const a=Math.abs(v[0])+(v[1]||0)/60+(v[2]||0)/3600; return neg?-a:a; };
    if(toks.some(x=>x.h)){
      const groups=[]; const prefix=!!toks[0].h; let cur={nums:[],h:null};
      for(const x of toks){
        if(x.h){ if(prefix){ if(cur.h||cur.nums.length) groups.push(cur); cur={nums:[],h:x.h}; } else { cur.h=x.h; groups.push(cur); cur={nums:[],h:null}; } }
        else cur.nums.push(x.n);
      }
      if(cur.h||cur.nums.length) groups.push(cur);
      if(groups.length!==2||groups.some(g=>!g.h)) throw new Error('Indiquez une latitude (N/S) et une longitude (E/O).');
      for(const g of groups){ let v=val(g.nums); if('SWO'.includes(g.h)) v=-Math.abs(v); if('NS'.includes(g.h)) lat=v; else lon=v; }
      if(lat==null||lon==null) throw new Error('Indiquez une latitude (N/S) et une longitude (E/O).');
    } else {
      if(nums.length%2||nums.length>6||!nums.length) throw new Error('Format non reconnu : saisissez « latitude, longitude ».');
      const k=nums.length/2; lat=val(nums.slice(0,k).map(x=>x.n)); lon=val(nums.slice(k).map(x=>x.n));
    }
  }
  if(!isFinite(lat)||!isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180) throw new Error('Coordonnées hors limites (latitude ±85°, longitude ±180°).');
  return {lat,lon};
}
function placeMarkerFromInput(){
  let c; try{ c=parseCoords($('markerIn').value); }catch(e){ toast(e.message,true); return; }
  setMarker(c.lat,c.lon);
  const g=geom(st,posterDims().W,posterDims().H), v=viewBounds(st,g.map.h/g.map.w,0);
  const out=c.lat<v.s||c.lat>v.n||c.lon<v.w||c.lon>v.e;
  if(out) goTo(c.lat,c.lon);
  $('markerIn').value=''; $('markerIn').blur();
  toast('Repère placé'+(out?' · carte recentrée':''));
}
function setMarker(lat,lon){ st.marker={lat,lon}; setPlacing(false); updateMarkerTxt(); if(st.fx.quarter){ ui.snap=null; redrawAll(true); } else changed(); }
/** Indications du panneau Lieu, sur le même modèle pour la ville (centre de la carte) et le lieu de rencontre (repère) :
 *  nom de la ville proposée la plus proche (5 km au plus) ou « Autre lieu », puis les coordonnées ; bouton de la ville en surbrillance */
function updateMarkerTxt(){
  const near=({lat,lon})=>{ let best=null, bd=5; for(const p of PRESETS){ const dy=(lat-p[1])*111.2, dx=(lon-p[2])*111.2*Math.cos(lat*Math.PI/180), d=Math.hypot(dx,dy); if(d<bd){ bd=d; best=p; } } return best; };
  const show=(id,pt,p,sub)=>$(id).replaceChildren(h('b',{},p?p[4]:'Autre lieu'),h('span',{className:'sr-only'},', '),h('small',{},p?sub(p):'Hors des villes proposées'),
    h('span',{className:'mono'},`${dms(pt.lat,'N','S')}  ·  ${dms(pt.lon,'E','W')}`));
  const city=near(st.center), mk=near(st.marker);
  show('cityTxt',st.center,city,p=>p[5]);
  show('markerTxt',st.marker,mk,p=>mk===city?'Dans la ville affichée':'Hors de la ville affichée');
  document.querySelectorAll('#presets .chip').forEach((b,i)=>{ const on=PRESETS[i]===city; b.classList.toggle('on',on); b.setAttribute('aria-pressed',String(on)); });
  $('coordsManual').placeholder=coordText();
}
function syncZoomUI(){ $('zoom').value=st.zoom.toFixed(1); $('oZoom').textContent=st.zoom.toFixed(1); }
function setZoom(z){ st.zoom=clamp(z,10,18); syncZoomUI(); if(mlMap&&st.engine==='maplibre'){ mlMap.easeTo({zoom:mlZoom(ui.slotCss.w),duration:250}); } else renderMap(); saveState(); }
function goTo(lat,lon,zoom){
  st.center={lat,lon}; if(zoom!=null) st.zoom=zoom; syncZoomUI();
  if(mlMap&&st.engine==='maplibre'){ mlMap.jumpTo({center:[lon,lat],zoom:mlZoom(ui.slotCss.w)}); mlRestyle(); }
  renderMap(true); saveState(); updateMarkerTxt();
}
function setSeg(id,v){ document.querySelectorAll(`#${id} button`).forEach(b=>{ const on=b.dataset.v===String(v); b.classList.toggle('on',on);
  if(b.getAttribute('role')==='radio') b.setAttribute('aria-checked',String(on)); else b.setAttribute('aria-pressed',String(on)); }); }
/** Affiche un onglet (état ARIA, focus clavier). Le panneau coulissant n'est pas modifié. */
function showTab(name, focus){
  document.querySelectorAll('#tabs button').forEach(x=>{ const on=x.dataset.tab===name; x.classList.toggle('on',on); x.setAttribute('aria-selected',String(on)); x.tabIndex=on?0:-1; if(on&&focus) x.focus(); });
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.id==='tab-'+name));
  ui.tab=name; drawCards(name);
}
/** Section « Avancé » de l'onglet Lieu : ouverte à la demande, mémorisée ; ouverte d'office quand elle devient utile */
const ADV_KEY='cityMapStudio.advOpen';
function openAdvanced(scroll){ const d=$('adv'); if(!d.open) d.open=true; if(scroll){ showTab('lieu'); setTimeout(()=>d.scrollIntoView({block:'start',behavior:'smooth'}),60); } }
/** Aperçu des polices : chaque carte montre le titre saisi */
function updateFontSamples(){
  const t=(st.texts.title||'').trim()||'Blois', x=(st.texts.names||'').trim()||(st.texts.dedication||'').trim()||'Aa';
  document.querySelectorAll('#fontTitleSeg .smp').forEach(e=>e.textContent=e.parentElement.dataset.v?t:'= texte');
  document.querySelectorAll('#fontSeg .smp').forEach(e=>e.textContent=x);
  document.querySelectorAll('#duos .t').forEach(e=>e.textContent=t); document.querySelectorAll('#duos .d').forEach(e=>e.textContent=x);
}
/** Date au format de l'affiche : « Le 1er juillet 2023 » */
function frDate(iso){
  const [y,m,d]=iso.split('-').map(Number); if(!y||!m||!d) return '';
  const mois=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][m-1];
  return `Le ${d===1?'1er':d} ${mois} ${y}`;
}
/** Lecture inverse (pour ouvrir le calendrier sur la date déjà saisie) ; '' si le texte n'est pas une date */
function isoFromFr(t){
  const M=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const r=String(t||'').toLowerCase().match(/(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/); if(!r) return '';
  const m=M.indexOf(r[2]); if(m<0) return '';
  return `${r[3]}-${String(m+1).padStart(2,'0')}-${String(+r[1]).padStart(2,'0')}`;
}

// ---------- Historique : annuler / rétablir ----------
// Un instantané de l'état par modification (regroupées comme l'enregistrement, après 300 ms de calme).
// Le moteur cartographique est exclu : le rétablir relancerait des requêtes réseau.
const HIST_MAX=50, hist={past:[],future:[],cur:null,quietUntil:0};
function histSnap(){ const {engine,...rest}=st; return JSON.stringify(rest); }
CMS.on('state:saved',()=>{ recordHistory(); updateMarkerTxt(); });   // émis par saveState (state.js)
function recordHistory(){
  const s=histSnap(); if(s===hist.cur) return;
  if(Date.now()<hist.quietUntil || hist.cur==null){ hist.cur=s; return; }   // effets de bord d'un retour arrière (recentrage de la carte)
  hist.past.push(hist.cur); if(hist.past.length>HIST_MAX) hist.past.shift();
  hist.cur=s; hist.future=[]; updateHistUI();
}
function updateHistUI(){ $('bUndo').disabled=!hist.past.length; $('bRedo').disabled=!hist.future.length; }
function applySnap(s){
  hist.quietUntil=Date.now()+900;
  const o=JSON.parse(s), eng=st.engine, view=JSON.stringify([st.center,st.zoom]);
  replaceState(o,{engine:eng});
  setPlacing(false); syncInputs(); layoutPreview();
  loadFonts().then(()=>scheduleOver());
  if(JSON.stringify([st.center,st.zoom])!==view) goTo(st.center.lat,st.center.lon,st.zoom); else redrawAll(true);
  hist.cur=s; saveState(); updateHistUI();
}
/** Fige tout de suite l'étape en cours (action ponctuelle : réinitialisation, changement de moteur), puis ignore
 *  pendant un instant les petits recentrages de la carte qui suivent, pour ne pas créer de fausses étapes. */
function commitHistory(quietMs=1500){ clearTimeout(saveT); try{localStorage.setItem(STORE_KEY,JSON.stringify(st))}catch(e){} hist.quietUntil=0; recordHistory(); hist.quietUntil=Date.now()+quietMs; }
function undo(){ compareTheme(false); if(!hist.past.length) return; clearTimeout(saveT); recordHistory(); if(!hist.past.length) return; hist.future.push(hist.cur); applySnap(hist.past.pop()); toast('Modification annulée'); }
function redo(){ compareTheme(false); if(!hist.future.length) return; hist.past.push(hist.cur); applySnap(hist.future.pop()); toast('Modification rétablie'); }

function buildUI(){
  // onglets
  document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{
    if(isSheet()){
      if(ui.framing) setFraming(false);
      if(ui.sheet==='peek') setSheet('half');
      else if(b.classList.contains('on')) setSheet(ui.sheet==='full'?'half':'full');
    }
    showTab(b.dataset.tab);
  });
  // clavier : flèches, Début, Fin (motif ARIA des onglets)
  $('tabs').addEventListener('keydown',e=>{
    const bs=[...document.querySelectorAll('#tabs button:not([hidden])')], i=bs.findIndex(x=>x.classList.contains('on'));
    const j={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:bs.length-1}[e.key]; if(j==null) return;
    e.preventDefault(); showTab(bs[(j+bs.length)%bs.length].dataset.tab,true);
  });
  // parcours guidé : Lieu → Repère → Textes → Style → Exporter
  document.querySelectorAll('[data-next]').forEach(b=>b.onclick=()=>{ showTab(b.dataset.next); document.querySelector('.tabbody').scrollTop=0; if(isSheet()&&ui.sheet==='peek') setSheet('half'); });
  $('bNextExport').onclick=()=>$('bExport').click();
  // section Avancé
  try{ if(localStorage.getItem(ADV_KEY)==='1') $('adv').open=true; }catch(e){}
  $('adv').addEventListener('toggle',()=>{ try{ $('adv').open ? localStorage.setItem(ADV_KEY,'1') : localStorage.removeItem(ADV_KEY); }catch(e){} });
  // date : calendrier natif
  $('dateIn').addEventListener('focus',()=>{ const v=isoFromFr(st.texts.date); if(v) $('dateIn').value=v; });
  $('dateIn').addEventListener('pointerdown',()=>{ const v=isoFromFr(st.texts.date); if(v) $('dateIn').value=v; });
  $('dateIn').addEventListener('change',e=>{ const t=frDate(e.target.value); if(!t) return; st.texts.date=t; st.show.date=true; syncInputs(); changed(); toast('Date : '+t); });
  // ma position (géolocalisation de l'appareil, demandée par le navigateur)
  if('geolocation' in navigator){ $('bGeo').hidden=false; $('bGeo').onclick=locateMe; }
  // annuler / rétablir
  $('bUndo').onclick=undo; $('bRedo').onclick=redo;
  addEventListener('keydown',e=>{
    if(!(e.ctrlKey||e.metaKey) || e.altKey) return;
    if(e.target.matches?.('input[type=text],input[type=search],textarea')) return;   // laisser l'annulation native des champs
    const k=e.key.toLowerCase();
    if(k==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
    else if((k==='z' && e.shiftKey) || k==='y'){ e.preventDefault(); redo(); }
  });
  // presets
  const pr=$('presets');
  PRESETS.forEach(([lbl,lat,lon,z,title,sub])=>{ const b=document.createElement('button'); b.className='chip'; b.textContent=lbl;
    b.onclick=()=>{ st.marker={lat,lon}; st.texts.title=title; st.texts.subtitle=sub; syncInputs(); updateMarkerTxt(); osmData=null; goTo(lat,lon,z); redrawAll(); };
    pr.appendChild(b); });
  // gabarits
  const lay=$('layouts');
  LAYOUTS.forEach(([k,n])=>{ const d=h('button',{type:'button',className:'card',dataset:{v:k}},h('canvas',{width:70,height:99}),n);
    d.onclick=()=>setLayout(k); lay.appendChild(d); });
  // ambiances
  AMBIANCES.forEach(([k,n])=>{ const b=h('button',{type:'button',dataset:{v:k}},h('canvas',{width:70,height:99}),h('small',{},n));
    b.onclick=()=>applyAmbiance(k); $('ambiances').appendChild(b); });
  // orientation
  document.querySelectorAll('#orientSeg button').forEach(b=>b.onclick=()=>setOrient(b.dataset.v));
  document.querySelectorAll('#dedWrapSeg button').forEach(b=>b.onclick=()=>setDedWrap(b.dataset.v));
  document.querySelectorAll('#formatSeg button').forEach(b=>b.onclick=()=>setFormat(b.dataset.v));
  document.querySelectorAll('#fileSeg button').forEach(b=>b.onclick=()=>setFileType(b.dataset.v));
  // ciel
  const tz=$('skyTz'); tz.add(new Option('Celui de cet appareil','auto'));
  for(let m=-720;m<=840;m+=30){ const h=Math.trunc(Math.abs(m)/60), mi=Math.abs(m)%60; tz.add(new Option(`UTC${m<0?'−':'+'}${h}${mi?':'+String(mi).padStart(2,'0'):''}`,String(m))); }
  $('skyWhen').onchange=e=>{ st.sky.when=e.target.value; drawUnder(); saveState(); };
  tz.onchange=e=>{ st.sky.tz=e.target.value==='auto'?'auto':+e.target.value; drawUnder(); saveState(); };
  // deux lieux
  document.querySelectorAll('#placeSeg button').forEach(b=>b.onclick=()=>setActivePlace(+b.dataset.v));
  $('placeSwitch').onclick=()=>setActivePlace(1-(st.active||0));
  // filtres des thèmes
  THEME_CATS.forEach(([k,n],i)=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'+(i?'':' on'); b.textContent=n; b.dataset.v=k;
    b.onclick=()=>{ document.querySelectorAll('#themeCats .chip').forEach(x=>x.classList.toggle('on',x===b)); document.querySelectorAll('#themes .theme').forEach(t=>t.hidden=!!k && t.dataset.cat!==k); }; $('themeCats').appendChild(b); });
  // papier
  TEXTURES.forEach(([k,n])=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.dataset.v=k; b.textContent=n; b.onclick=()=>{ st.texture=k; setSeg('textures',k); drawTexture(); saveState(); }; $('textures').appendChild(b); });
  // modèles de texte
  OCCASIONS.forEach(([k,n])=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=n; b.onclick=()=>applyOccasion(k); $('occasions').appendChild(b); });
  // polices : duos, catégories, police du titre, police du texte
  const fam=k=>FONTS[k].fam;
  DUOS.forEach(([k,n,ft,fx])=>{ const b=h('button',{type:'button',dataset:{v:k},role:'radio'},
      h('span',{className:'t',style:{fontFamily:fam(ft)}}),h('span',{className:'d',style:{fontFamily:fam(fx)}}),h('small',{},n));
    b.onclick=async()=>{ st.fontTitle=ft===fx?'':ft; st.font=fx; syncFonts(); saveState(); await loadFonts(); scheduleOver(); }; $('duos').appendChild(b); });
  FONT_CATS.forEach(([k,n],i)=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'+(i?'':' on'); b.textContent=n;
    b.onclick=()=>{ document.querySelectorAll('#fontCats .chip').forEach(x=>x.classList.toggle('on',x===b)); document.querySelectorAll('#fontSeg button,#fontTitleSeg button').forEach(f=>f.hidden=!!k && f.dataset.cat && f.dataset.cat!==k); }; $('fontCats').appendChild(b); });
  const fbtn=(k,n,cat)=>h('button',{type:'button',dataset:cat?{v:k,cat}:{v:k},role:'radio'},
    h('span',{className:'smp',style:k?{fontFamily:fam(k),fontSize:FONTS[k].scale?(1.25*FONTS[k].scale).toFixed(2)+'rem':''}:{}}),h('small',{},n));
  const same=fbtn('','Comme le texte'); same.onclick=async()=>{ st.fontTitle=''; syncFonts(); saveState(); await loadFonts(); scheduleOver(); }; $('fontTitleSeg').appendChild(same);
  FONT_LIST.forEach(([k,n,cat])=>{
    const t=fbtn(k,n,cat); t.onclick=async()=>{ st.fontTitle=k===st.font?'':k; syncFonts(); saveState(); await loadFonts(); scheduleOver(); }; $('fontTitleSeg').appendChild(t);
    const x=fbtn(k,n,cat); x.onclick=async()=>{ if(!st.fontTitle && FONTS[k].script) st.fontTitle=st.font; st.font=k; if(st.fontTitle===k) st.fontTitle=''; syncFonts(); saveState(); await loadFonts(); scheduleOver(); }; $('fontSeg').appendChild(x); });
  // plusieurs lieux, itinéraire, aperçu au mur, lien
  $('bAddPlace').onclick=addPlace;
  $('gpxIn').onchange=e=>{ const f=e.target.files[0]; if(f) importGpx(f); e.target.value=''; };
  $('routeShow').onchange=e=>{ if(st.route){ st.route.show=e.target.checked; changed(); } };
  document.querySelectorAll('#routeColor button').forEach(b=>b.onclick=()=>{ st.routeStyle.color=b.dataset.v; renderRoute(); changed(); });
  $('routeW').oninput=e=>{ st.routeStyle.width=+e.target.value; renderRoute(); changed(); };
  $('routeDash').onchange=e=>{ st.routeStyle.dash=e.target.checked; changed(); };
  $('bFitRoute').onclick=fitRoute;
  $('bDelRoute').onclick=()=>{ st.route=null; renderRoute(); changed(); toast('Itinéraire retiré · « Annuler » pour le retrouver'); };
  $('bMockup').onclick=openMockup; $('mockClose').onclick=()=>closeDialog('mockup'); $('mockDl').onclick=downloadMockup;
  WALLS.forEach(([n],i)=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=n; b.onclick=()=>{ mock.wall=i; drawMockup(); }; $('mockWalls').appendChild(b); });
  FRAMES.forEach(([n],i)=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent='Cadre '+n.toLowerCase(); b.onclick=()=>{ mock.frame=i; drawMockup(); }; $('mockFrames').appendChild(b); });
  $('mockMat').onchange=e=>{ mock.mat=e.target.checked; drawMockup(); };
  $('bShare').onclick=shareLink;
  $('welSkip').onclick=()=>{ closeWelcome(); toast('Vous pourrez choisir une ambiance plus tard, dans l\'onglet Style'); };
  // thèmes
  const th=$('themes');
  Object.entries(THEMES).forEach(([k,t])=>{
    const d=h('button',{type:'button',className:'theme',dataset:{v:k,cat:t.cat}},
      h('span',{className:'sw'},...['paper','land','water','roadMajor','marker'].map(c=>h('i',{style:{background:t.c[c]}}))),h('span',{className:'n'},t.name));
    d.onclick=()=>{ const before={theme:st.theme,colors:{...st.colors}};
      st.theme=k; st.colors={...t.c}; noteThemeChange(before); refreshColors(); changed({all:true,cards:true}); }; th.appendChild(d); });
  initCompare();
  // couleurs
  const co=$('colors');
  Object.entries(COLOR_LABELS).forEach(([k,n])=>{ const l=h('label',{},h('input',{type:'color',dataset:{c:k}}),h('span',{},n));
    l.querySelector('input').oninput=e=>{ st.colors[k]=e.target.value.toUpperCase(); colorChanged(k); }; co.appendChild(l); });
  $('photoIn').onchange=e=>{ const f=e.target.files[0]; if(f) importPhotoPalette(f); e.target.value=''; };
  document.querySelectorAll('#photoSeg button').forEach(b=>b.onclick=()=>applyPhotoPalette(b.dataset.v));
  document.querySelectorAll('[data-gold]').forEach(b=>b.onclick=()=>{ st.colors[b.dataset.gold]=GOLD; refreshColors(); changed({all:true,cards:true}); toast('Touche d\'or appliquée'); });
  // repères
  const mk=$('marks');
  MARKERS.forEach(([k,n])=>{ const d=h('button',{type:'button',className:'card',dataset:{v:k}},h('canvas',{width:96,height:96}),n);
    d.onclick=()=>{ st.markerStyle=k; changed({cards:true}); }; mk.appendChild(d); });
  const mc=$('mColors');
  MARKER_COLORS.forEach(([n,v])=>{ const b=document.createElement('button'); b.className='chip'; b.textContent=n; b.onclick=()=>{ st.colors.marker=v; refreshColors(); changed({cards:true}); }; mc.appendChild(b); });
  $('mColor').oninput=e=>{ st.colors.marker=e.target.value.toUpperCase(); colorChanged('marker'); };
  // segments
  document.querySelectorAll('#engineSeg button').forEach(b=>b.onclick=()=>setEngine(b.dataset.v));
  document.querySelectorAll('#fillSeg button').forEach(b=>b.onclick=()=>{ st.markerFill=b.dataset.v==='1'; setSeg('fillSeg',b.dataset.v); changed({cards:true}); });
  document.querySelectorAll('#coordSeg button').forEach(b=>b.onclick=()=>{ st.coordFormat=b.dataset.v; setSeg('coordSeg',st.coordFormat); updateMarkerTxt(); changed(); });
  // champs liés data-k
  document.querySelectorAll('[data-k]').forEach(el=>{
    const k=el.dataset.k;
    el.addEventListener('input',()=>{
      const v = el.type==='checkbox' ? el.checked : el.type==='range' ? parseFloat(el.value) : el.value;
      setPath(st,k,v); syncOutputs();
      if(k==='texts.title'||k==='texts.names'||k==='texts.dedication') updateFontSamples();
      if(k.startsWith('sky.')){ drawUnder(); saveState(); return; }
      if(k==='folds'){ drawTexture(); saveState(); return; }
      if(k==='focusR'){ if(st.fx.quarter) redrawAll(true); else changed(); return; }
      if(k==='numbered'||k==='linkMarkers'){ changed(); return; }
      if(k.startsWith('illus.')||k.startsWith('illusText.')){ CMS.emit('illus:input',k); return; }   // modes illustrés (js/illus.js)
      if(k.startsWith('layers.')||k.startsWith('fx.')){ ui.snap=null; redrawAll(true); }
      else if(k==='margin'){ layoutPreview(); saveState(); }
      else if(k==='stroke'||k==='waterMult'){ redrawAll(true); }
      else { changed(); }
    });
  });
  $('zoom').oninput=e=>setZoom(parseFloat(e.target.value));
  $('bZoomIn').onclick=()=>setZoom(st.zoom+0.5); $('bZoomOut').onclick=()=>setZoom(st.zoom-0.5);
  $('bPlace').onclick=$('bPlace2').onclick=()=>setPlacing(!ui.placing);
  $('markerForm').onsubmit=e=>{ e.preventDefault(); placeMarkerFromInput(); };
  $('bMarkerCenter').onclick=()=>setMarker(st.center.lat,st.center.lon);
  $('bToMarker').onclick=()=>goTo(st.marker.lat,st.marker.lon);
  $('bDiag').onclick=runDiagnostics;
  $('bReset').onclick=askReset;
  $('bUiSmaller').onclick=()=>stepUiScale(-1); $('bUiLarger').onclick=()=>stepUiScale(1);
  $('bTsReset').onclick=()=>{ st.textScale={...DEFAULT_STATE.textScale}; st.textScaleAll=DEFAULT_STATE.textScaleAll; syncInputs(); changed(); toast('Tailles des textes rétablies'); };
  $('fileIn').onchange=e=>{ const f=e.target.files[0]; if(f) importFile(f); e.target.value=''; };
  const submitSearch=CMS.geocoder.debounceSubmit(q=>search(q),300);
  $('searchForm').onsubmit=e=>{ e.preventDefault(); submitSearch($('q').value); };
  $('results').addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); closeResults(); } });
  $('bExport').onclick=exportPoster;
  $('resClose').onclick=()=>closeDialog('result');
}
/** Réinitialisation : un premier appui demande confirmation (pas de confirm(), bloqué dans les aperçus intégrés) */
let resetT=0;
function askReset(){
  const b=$('bReset');
  if(!b.classList.contains('confirm')){
    b.classList.add('confirm'); b.textContent='Confirmer ?';
    clearTimeout(resetT); resetT=setTimeout(()=>{ b.classList.remove('confirm'); b.textContent='Réinitialiser'; },4000);
    return;
  }
  clearTimeout(resetT); b.classList.remove('confirm'); b.textContent='Réinitialiser';
  resetAll();
}
/** Rétablit tous les réglages par défaut (lieu, cadrage, gabarit, thème, couleurs, repère, textes, calques).
 *  Sont conservés : l'accord aux services tiers et les données déjà importées. */
function resetAll(){
  clearTimeout(saveT); recordHistory();   // modification en attente : étape distincte
  const fresh=structuredClone(DEFAULT_STATE);
  replaceState(fresh);
  setPlacing(false); $('markerIn').value='';
  syncInputs(); layoutPreview();
  loadFonts().then(()=>scheduleOver());
  setEngine(st.engine); goTo(st.center.lat,st.center.lon,st.zoom);
  commitHistory(); toast('Réglages par défaut rétablis · « Annuler » pour revenir en arrière');
}
function syncInputs(){
  document.querySelectorAll('[data-k]').forEach(el=>{ const v=getPath(st,el.dataset.k); if(el.type==='checkbox') el.checked=!!v; else el.value=v??''; });
  setSeg('engineSeg',st.engine); setSeg('fillSeg',st.markerFill?'1':'0'); setSeg('coordSeg',st.coordFormat);
  setSeg('orientSeg',st.orient); setSeg('formatSeg',st.format); setSeg('fileSeg',st.fileType); setSeg('dedWrapSeg',st.dedWrap);
  setSeg('textures',st.texture); updateExportLabel();
  syncZoomUI(); syncOutputs(); refreshColors(); refreshCards(); updateMarkerTxt(); updateEngineUI(); syncFonts(); updateLayoutUI(); renderRoute(); drawTexture();
  CMS.emit('state:synced');   // modes illustrés : sélecteur de mode, onglet Illustration, style du titre
}
/** Polices : sélection des cartes (titre, texte, duo) et aperçus */
function syncFonts(){
  setSeg('fontSeg',st.font); setSeg('fontTitleSeg',st.fontTitle||'');
  const duo=DUOS.find(([,,ft,fx])=>fx===st.font && (st.fontTitle||st.font)===ft);
  setSeg('duos',duo?duo[0]:'—'); updateFontSamples();
}
function syncOutputs(){
  $('oMargin').textContent=st.margin+' %'; $('oStroke').textContent='× '+st.stroke.toFixed(2); $('oWater').textContent='× '+st.waterMult.toFixed(1);
  $('oFocus').textContent=st.focusR+' %';
  $('oMSize').textContent=st.markerSize+' %'; $('oMOp').textContent=Math.round(st.markerOpacity*100)+' %';
  $('oTsAll').textContent=st.textScaleAll+' %';
  for(const k of Object.keys(FIT_NAMES)){ const o=$('oTs-'+k); if(o) o.textContent=st.textScale[k]+' %'+(o.classList.contains('shrunk')?' ↘':''); }
}
/** Sélecteur de couleur : il émet un événement par mouvement du curseur ; le rendu complet (affiche, style MapLibre,
 *  vignettes) est regroupé en un seul passage par image. */
const colorQueue=new Set(); let rafColor=0;
function colorChanged(k){
  updateContrast(); updateCompare();   // légers : immédiats
  colorQueue.add(k); if(rafColor) return;
  rafColor=requestAnimationFrame(()=>{ rafColor=0; const ks=[...colorQueue]; colorQueue.clear();
    redrawAll(true); if(ks.includes('paper')) drawTexture();
    // les autres sélecteurs de la même couleur suivent (jamais celui en cours de manipulation)
    document.querySelectorAll('[data-c],#mColor').forEach(i=>{ const c=i.id==='mColor'?'marker':i.dataset.c; if(ks.includes(c) && i!==document.activeElement) i.value=st.colors[c]; });
    if(ks.some(x=>x==='marker'||x==='paper')) refreshCards(); });
}
/** État « choisi » d'un bouton de sélection : classe visuelle et état ARIA */
function pressed(b,on){ b.classList.toggle('on',on); b.setAttribute('aria-pressed',String(on)); }
function refreshColors(){ document.querySelectorAll('[data-c]').forEach(i=>i.value=st.colors[i.dataset.c]); $('mColor').value=st.colors.marker; updateContrast(); drawTexture(); }
/** Exécute fn avec un état provisoirement modifié (vignettes) */
/** Vignettes : drawPoster lit l'état global ; il est modifié le temps d'un rendu SYNCHRONE puis rétabli.
 *  Une fonction asynchrone rendrait la main avec l'état modifié : elle est refusée. */
function withState(patch,fn){
  const saved={}; for(const k in patch){ saved[k]=st[k]; st[k]=patch[k]; } ui.thumb=true;
  try{ const r=fn(); if(r && typeof r.then==='function') throw new Error('withState : fonction asynchrone interdite'); return r; }
  finally{ Object.assign(st,saved); ui.thumb=false; }
}
const thumbMap=(c,r)=>{ c.strokeStyle=st.colors.roadMinor; c.globalAlpha=.35; c.lineWidth=.5; for(let i=0;i<14;i++){c.beginPath();c.moveTo(r.x+i*7,r.y);c.lineTo(r.x+i*7-20,r.y+r.h);c.stroke();c.beginPath();c.moveTo(r.x,r.y+i*8);c.lineTo(r.x+r.w,r.y+i*8+6);c.stroke()} c.globalAlpha=1; c.fillStyle=st.colors.water; c.fillRect(r.x,r.y+r.h*0.45,r.w,r.h*0.08); };
function thumb(cv,patch){ const land=st.orient==='landscape'; if(cv.width!==(land?99:70)){ cv.width=land?99:70; cv.height=land?70:99; }
  const ctx=cv.getContext('2d'); withState(patch,()=>{ drawPoster(ctx,cv.width,cv.height,'all',thumbMap); drawPoster(ctx,cv.width,cv.height,'over'); }); }
/** Vignettes (gabarits, ambiances, repères) : l'état choisi est mis à jour tout de suite ; le dessin, coûteux
 *  (28 vignettes, deux passes de drawPoster chacune), une fois par image et seulement pour l'onglet affiché.
 *  Les vignettes d'un onglet masqué sont redessinées à son ouverture (showTab). */
const cardsDirty=new Set(); let rafCards=0;
function refreshCards(){
  document.querySelectorAll('#layouts .card').forEach(d=>pressed(d,d.dataset.v===st.layout));
  document.querySelectorAll('#ambiances button').forEach(d=>{ const p=AMBIANCES.find(a=>a[0]===d.dataset.v)[2];
    d.classList.toggle('land',st.orient==='landscape');
    pressed(d,st.theme===p.theme && st.layout===p.layout && st.font===p.font && (st.fontTitle||'')===p.fontTitle && st.markerStyle===p.markerStyle); });
  document.querySelectorAll('#themes .theme').forEach(d=>pressed(d,d.dataset.v===st.theme));
  updateCompare();
  document.querySelectorAll('#marks .card').forEach(d=>pressed(d,d.dataset.v===st.markerStyle));
  cardsDirty.add('style'); cardsDirty.add('repere');
  if(!rafCards) rafCards=requestAnimationFrame(()=>{ rafCards=0; drawCards(ui.tab); });
  syncOutputs();
}
function drawCards(tab){
  if(!cardsDirty.delete(tab)) return;
  if(tab==='style'){
    document.querySelectorAll('#layouts .card').forEach(d=>thumb(d.querySelector('canvas'),{layout:d.dataset.v}));
    document.querySelectorAll('#ambiances button').forEach(d=>{ const p=AMBIANCES.find(a=>a[0]===d.dataset.v)[2];
      thumb(d.querySelector('canvas'),{layout:p.layout,colors:THEMES[p.theme].c,font:p.font,fontTitle:p.fontTitle,markerStyle:p.markerStyle}); });
  } else if(tab==='repere'){
    const col = st.colors.marker.toUpperCase()==='#FFFFFF' ? '#999' : st.colors.marker;
    document.querySelectorAll('#marks .card').forEach(d=>{ const cv=d.querySelector('canvas'), ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,96,96);
      drawMarker(ctx,48,d.dataset.v==='pin'?72:50,d.dataset.v==='pin'?42:58,{style:d.dataset.v,color:col,fill:st.markerFill,opacity:1,facet:'#fff'}); });
  }
}
function updateEngineUI(){
  document.querySelector('#engineSeg [data-v=maplibre]').disabled = mlLib==='fail';
  $('fileBlock').hidden=st.engine!=='file';
  $('mcOmt').hidden=st.engine!=='maplibre';   // attribution près de la carte : schéma OpenMapTiles avec le moteur GPU seulement
  $('engineHint').textContent = {
    maplibre: mlLib==='fail' ? 'Librairie MapLibre impossible à charger (aucun CDN joignable).' : 'Tuiles vectorielles OpenFreeMap : instantané, mers et côtes correctes, idéal sur mobile.',
    file:'Aucun accès réseau requis : importez un fichier de données OSM. Tracé vectoriel au détail maximal, aperçu et export identiques.'
  }[st.engine];
}
function setEngine(v,quiet){
  if(v==='maplibre' && mlLib==='fail'){ toast('MapLibre n\'a pas pu être chargé : aucun CDN joignable depuis cette page.',true); return; }
  st.engine=v; setSeg('engineSeg',v); updateEngineUI(); setPlacing(false); showBanner(false);
  if(v!=='maplibre') openAdvanced();
  hist.quietUntil=Date.now()+1500;   // le moteur n'entre pas dans l'historique ; ses recentrages non plus
  if(v==='file'){ renderMap(true); if(!osmData && !quiet) toast('Importez un fichier de données (onglet Lieu).'); }
  else { mlFailMsg=''; renderMap(true); mlRestyle(); }
  saveState();
}

// ---------- Ma position (géolocalisation de l'appareil) ----------
function locateMe(){
  if(window.isSecureContext===false){ toast('La position n\'est disponible que sur une page sécurisée (https).',true); return; }
  const b=$('bGeo'); b.disabled=true; setStatus('Recherche de votre position…','busy');
  navigator.geolocation.getCurrentPosition(pos=>{
    b.disabled=false; const {latitude:lat,longitude:lon,accuracy}=pos.coords;
    setMarker(lat,lon); goTo(lat,lon,Math.max(st.zoom,15));
    setStatus('Prêt'); toast(`Repère placé sur votre position (précision ${Math.round(accuracy)} m)`);
  },err=>{
    b.disabled=false; setStatus('Position indisponible','err');
    toast(err.code===1 ? 'Accès à la position refusé : autorisez-le dans les réglages du navigateur.' : err.code===3 ? 'La position n\'a pas pu être obtenue à temps.' : 'Position indisponible sur cet appareil.',true);
  },{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
}

// ---------- Géocodage Nominatim ----------
// Recherche uniquement à la validation (pas d'autocomplétion : interdite par la politique d'usage de Nominatim).
// Délai, quota, relance, cache et validation des réponses : CMS.geocoder (js/geocoder.js).
CMS.define('searchUI', () => {
const GEO_MSG={
  TIMEOUT:()=>'Le service de recherche ne répond pas.',
  RATE_LIMITED:e=>`Trop de recherches : réessayez dans ${Math.ceil((e.retryInMs||60000)/1000)} s.`,
  NETWORK:e=>`Recherche indisponible (${e.message}).`,
  HTTP:e=>`Recherche indisponible (${e.message}).`,
  BAD_RESPONSE:()=>'Réponse inattendue du service de recherche.'
};
let searching=false;
/** Message de la recherche : affiché dans la liste (texte) et annoncé par la zone d'état */
function searchMsg(t){ const box=$('results'); box.replaceChildren(...(t?[h('li',{className:'msg'},t)]:[])); $('resultsStatus').textContent=t; }
async function search(q){
  q=(q||'').trim(); if(!q){ $('q').focus(); return; }
  if(searching) return;
  if(!needConsent(()=>search(q))) return;
  const box=$('results'), sb=document.querySelector('#searchForm [type=submit]');
  searching=true; sb.disabled=true; box.setAttribute('aria-busy','true'); searchMsg('Recherche…');
  try{
    const list=await CMS.geocoder.search(q);
    if(!list.length){ searchMsg('Aucun résultat.'); return; }
    box.replaceChildren(...list.map(resultItem));
    $('resultsStatus').textContent=`${list.length} résultat${list.length>1?'s':''} pour « ${q} ».`;
    box.querySelector('button')?.focus({preventScroll:false});
  }catch(e){
    if(e.code==='ABORTED') return;
    searchMsg((GEO_MSG[e.code]?.(e) ?? 'Recherche indisponible.')+' Vous pouvez placer le repère en touchant la carte.');
  }
  finally{ searching=false; sb.disabled=false; box.removeAttribute('aria-busy'); }
}
/** Ferme la liste des résultats et rend le focus au champ de recherche */
function closeResults(){ searchMsg(''); $('q').focus(); }
/** Un résultat validé (CMS.geocoder) : nom en tête, adresse en dessous, deux actions décrites par le lieu */
let resultSeq=0;
function resultItem(it){
  const {lat,lon,name:nm,display}=it, id='res-'+(++resultSeq);
  const rest=nm && display.startsWith(nm) ? display.slice(nm.length).replace(/^,\s*/,'') : display;
  const t=h('div',{className:'t',id});
  if(nm && rest!==display) t.append(h('b',{},nm),h('span',{className:'sr-only'},', '),h('small',{},rest)); else t.textContent=display;   // virgule lue, non affichée
  const btn=(label,fn)=>{ const b=h('button',{type:'button',className:'btn sm'},label); b.setAttribute('aria-describedby',id);
    b.onclick=e=>{ fn(); if(e.detail===0) $('q').focus({preventScroll:true}); };   // activé au clavier : le focus revient au champ
    return b; };
  const b1=btn('Carte + repère',()=>{ st.marker={lat,lon}; updateMarkerTxt(); goTo(lat,lon); searchMsg(''); $('resultsStatus').textContent='Carte centrée et repère placé.'; });
  const b2=btn('Repère seul',()=>{ setMarker(lat,lon); searchMsg(''); toast('Repère placé'); });
  return h('li',{className:'res'},t,h('div',{className:'row'},b1,b2));
}

return {search, closeResults};
});
const {search, closeResults} = CMS.searchUI;

// ---------- Polices ----------
/** Polices utilisées par l'affiche : titre, texte, police manuscrite éventuelle ; Bebas Neue pour le titre « Vintage » des modes illustrés */
async function loadFonts(){
  try{ await Promise.all(loadFonts.used().flatMap(f=>f.load).map(f=>document.fonts.load(f))); }catch(e){}
  CMS.glyphs.clear();   // largeurs mesurées avec une police de secours pendant le chargement
}
/** true si toutes les variantes de la famille active sont chargées (sinon l'export utiliserait une police de secours) */
loadFonts.used=()=>[fontOf('title'),fontOf('','dedication'),fontOf('','date'),...(st.mode!=='map' && st.illusText.style==='vintage' ? [FONTS.bebas] : [])];
function fontsReady(){ try{ return loadFonts.used().flatMap(f=>f.load).every(f=>document.fonts.check(f)); }catch(e){ return true; } }

// ---------- Comparer avant / après un changement de thème ----------
/** Dernier changement de thème : couleurs d'avant, et couleurs appliquées (le bouton disparaît dès qu'elles changent :
 *  autre thème, couleur retouchée, annulation). Un appui maintenu sur « Comparer » montre l'affiche avec le thème
 *  précédent ; le relâcher rétablit le thème choisi. Ni l'état enregistré ni l'historique ne voient l'aperçu. */
let themeCmp=null;
function noteThemeChange(before){
  const after=JSON.stringify(st.colors);
  if(JSON.stringify(before.colors)===after) return;   // même thème reconfirmé : la comparaison précédente reste valable
  themeCmp={before,after};
}
const compareAvailable=()=>!!themeCmp && themeCmp.after===JSON.stringify(ui.comparing?ui.cmpKeep.colors:st.colors);
const themeName=t=>THEMES[t.theme] && JSON.stringify(THEMES[t.theme].c)===JSON.stringify(t.colors) ? THEMES[t.theme].name : 'couleurs précédentes';
function updateCompare(){
  const b=$('bCompare'), ok=compareAvailable();
  b.hidden=!ok; if(!ok){ themeCmp=null; return; }   // couleurs modifiées depuis : comparaison périmée
  b.querySelector('span').textContent=`Maintenir pour comparer avec « ${themeName(themeCmp.before)} »`;
}
function compareTheme(on){
  if(on===!!ui.comparing) return;
  if(on && !compareAvailable()) return;
  if(on){ commitHistory(0); ui.cmpKeep={theme:st.theme,colors:st.colors}; st.theme=themeCmp.before.theme; st.colors={...themeCmp.before.colors}; }
  else { st.theme=ui.cmpKeep.theme; st.colors=ui.cmpKeep.colors; ui.cmpKeep=null; }
  ui.comparing=on;
  const b=$('bCompare'); b.setAttribute('aria-pressed',String(on)); b.classList.toggle('on',on);
  const badge=$('cmpBadge'); badge.hidden=!on; if(on) badge.textContent='Avant · '+themeName(themeCmp.before);
  drawUnder(); drawTexture(); mlRestyle(); renderMap(false); scheduleOver();   // rendu seulement : rien n'est enregistré
}
function initCompare(){
  const b=$('bCompare'), stop=()=>compareTheme(false);
  b.addEventListener('pointerdown',e=>{ if(e.button) return; e.preventDefault(); b.setPointerCapture(e.pointerId); compareTheme(true); });
  b.addEventListener('pointerup',stop); b.addEventListener('pointercancel',stop); b.addEventListener('lostpointercapture',stop);
  b.addEventListener('keydown',e=>{ if((e.key===' '||e.key==='Enter') && !e.repeat){ e.preventDefault(); compareTheme(true); } });
  b.addEventListener('keyup',e=>{ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); stop(); } });
  b.addEventListener('blur',stop); b.addEventListener('contextmenu',e=>e.preventDefault());   // appui long sur mobile : pas de menu
  addEventListener('blur',stop); document.addEventListener('visibilitychange',stop);
}
