/* City Map Studio — Interface : historique, construction de l'interface, synchronisation des réglages, polices.
 * Module ES (#102), importé par src/app/main.ts ; réuni en un seul script par le build (scripts/build.mjs).
 * Découpage (#119) : taille du texte et coordonnées → panel-coords.ts, position et recherche → panel-search.ts. */
import {$, h, pressed, setSeg, toast} from '../core/dom.js';
import {closeDialog, getPath, mlLib, mlMap, osmData, saveState, saveT, setMlFailMsg, setOsmData, setPath, st, ui} from '../core/doc/state.js';
import {replaceState, update} from '../core/doc/store.js';
import {clamp} from '../core/geo/geo.js';
import {mlRestyle, mlZoom} from '../map/engines.js';
import {FIT_NAMES, FRAMES, WALLS, changed, downloadMockup, drawMockup, drawTexture, drawUnder, layoutPreview, mock, openMockup, redrawAll, renderMap, scheduleOver, setActivePlace} from '../view/preview.js';
import {applySnap, commitHistory, hist, recordHistory} from '../core/doc/history.js';
import {setPlacing, showBanner} from './shell.js';
import {loadFonts} from '../render/fonts.js';
import {addPlace, goTo, setMarker} from '../features/places.js';
import {cmpSnap, compareBefore, initCompare, noteChange, updateCompare} from '../features/compare.js';
import {isSheet, setFraming, setSheet} from './sheet.js';
import {AMBIANCES, COLOR_LABELS, DEFAULT_STATE, DUOS, FONTS, FONT_CATS, FONT_LIST, GOLD, LAYOUTS, MARKERS, MARKER_COLORS, OCCASIONS, PRESETS, TEXTURES, THEMES, THEME_CATS} from '../content/config.js';
import {frDate, isoFromFr} from '../core/text.js';
import {applyAmbiance, applyOccasion, setDedWrap, setFileType, setFormat, setLayout, setOrient, updateContrast, updateExportLabel, updateLayoutUI} from '../features/presets.js';
import {fitRoute, importGpx, renderRoute} from '../features/gpx.js';
import {shareLink} from '../features/share.js';
import {closeWelcome} from './welcome.js';
import {exportPoster, importFile, runDiagnostics} from '../features/export.js';
import {thumb} from '../view/thumbnails.js';
import {drawMarker} from '../render/poster.js';
import {onUi} from '../core/port.js';
import {placeMarkerFromInput, stepUiScale, updateMarkerTxt} from './panel-coords.js';
import {closeResults, locateMe, search} from './panel-search.js';
export function syncZoomUI(){ $('zoom').value=st.zoom.toFixed(1); $('oZoom').textContent=st.zoom.toFixed(1); }
function setZoom(z: number){ update(_s=>(_s.zoom=clamp(z,10,18))); syncZoomUI(); if(mlMap&&st.engine==='maplibre'&&st.mode!=='illus'){ mlMap.easeTo({zoom:mlZoom(ui.slotCss.w),duration:250}); } else renderMap(); saveState(); }
/** Affiche un onglet (état ARIA, focus clavier). Le panneau coulissant n'est pas modifié. */
export function showTab(name: string, focus?: boolean){
  document.querySelectorAll<HTMLElement>('#tabs button').forEach(x=>{ const on=x.dataset.tab===name; x.classList.toggle('on',on); x.setAttribute('aria-selected',String(on)); x.tabIndex=on?0:-1; if(on&&focus) x.focus(); });
  document.querySelectorAll<HTMLElement>('.tab').forEach(t=>t.classList.toggle('on',t.id==='tab-'+name));
  ui.tab=name; drawCards(name);
  if(name==='export') CMS.emit('tab:export');   // Mes affiches : nom proposé, liste à jour (features.ts)
  CMS.emit('tab:shown',name);   // barre d'actions : étape suivante ou export
}
/** Section « Avancé » de l'onglet Lieu : ouverte à la demande, mémorisée ; ouverte d'office quand elle devient utile */
const ADV_KEY='cms:advOpen';
export function openAdvanced(scroll?: boolean){ const d=$<HTMLDetailsElement>('adv'); if(!d.open) d.open=true; if(scroll){ showTab('lieu'); setTimeout(()=>CMS.panelScroll.to(d,'start',true),60); } }
/** Aperçu des polices : chaque carte montre le titre saisi */
export function updateFontSamples(){
  const t=(st.texts.title||'').trim()||'Blois', x=(st.texts.names||'').trim()||(st.texts.dedication||'').trim()||'Aa';
  document.querySelectorAll<HTMLElement>('#fontTitleSeg .smp').forEach(e=>e.textContent=e.parentElement!.dataset.v?t:'= texte');
  document.querySelectorAll<HTMLElement>('#fontSeg .smp').forEach(e=>e.textContent=x);
  document.querySelectorAll<HTMLElement>('#duos .t').forEach(e=>e.textContent=t); document.querySelectorAll<HTMLElement>('#duos .d').forEach(e=>e.textContent=x);
}
// ---------- Historique : annuler / rétablir ----------
CMS.on('state:saved',()=>{ recordHistory(); updateMarkerTxt(); });
   // émis par saveState (state.ts)
export function updateHistUI(){ $('bUndo').disabled=!hist.past.length; $('bRedo').disabled=!hist.future.length; }
CMS.on('history:changed', updateHistUI);
   // piles modifiées (src/core/doc/history.ts)
// Instantané appliqué (annuler, rétablir, relecture des réglages) : interface, aperçu et vue resynchronisés
CMS.on('history:applied', (d: {viewChanged: boolean})=>{
  setPlacing(false); syncInputs(); layoutPreview();
  loadFonts().then(()=>scheduleOver());
  if(d.viewChanged) goTo(st.center.lat,st.center.lon,st.zoom); else redrawAll(true);
});
export function undo(){ compareBefore(false); if(!hist.past.length) return; clearTimeout(saveT); recordHistory(); if(!hist.past.length) return; hist.future.push(hist.cur!); applySnap(hist.past.pop()!); toast('Modification annulée'); }
export function redo(){ compareBefore(false); if(!hist.future.length) return; hist.past.push(hist.cur!); applySnap(hist.future.pop()!); toast('Modification rétablie'); }
export function buildUI(){
// ---------- Sliders du panneau : pas de réglage accidentel en faisant défiler (#92) ----------
  // Au toucher, un slider du panneau n'obéit que si le doigt se pose sur sa poignée ; ailleurs (piste), le geste
  // sert au défilement et toute valeur qu'il aurait provoquée est annulée. Souris et clavier : inchangés.
  // Un réglage abouti propose « Annuler » (historique existant).
  const SLIDER_GRAB=26;   // px autour du centre de la poignée
  const sliderGuard=()=>{
  const inPanel=(el: EventTarget | null): el is HTMLInputElement=>!!(el instanceof Element && el.matches('input[type=range]') && el.closest('#panel'));
  let guard: {el: HTMLInputElement; v: string} | null=null;   // {el,v}
  document.addEventListener('touchstart',e=>{
    const el=e.target; guard=null; if(!inPanel(el)) return;
    const r=el.getBoundingClientRect(), mn=+el.min||0, mx=+el.max||100, f=mx>mn?(+el.value-mn)/(mx-mn):0, th=20;
    const x=r.left+th/2+f*(r.width-th), t=e.touches[0];
    if(Math.abs(t.clientX-x)>SLIDER_GRAB) guard={el,v:el.value};
  },{capture:true,passive:true});
  const end=()=>{ if(guard){ guard.el.value=guard.v; guard=null; } };
  document.addEventListener('touchend',e=>{ if(guard){ e.preventDefault(); end(); } },{capture:true,passive:false});   // pas de saut au toucher de la piste
  document.addEventListener('touchcancel',end,{capture:true});
  document.addEventListener('input',e=>{ if(guard && e.target===guard.el){ e.stopImmediatePropagation(); guard.el.value=guard.v; } },true);
  document.addEventListener('change',e=>{ if(guard && e.target===guard.el) e.stopImmediatePropagation(); },true);
  // « Annuler » après un réglage
  let v0=new WeakMap<HTMLInputElement, string>();
  const note=(e: Event)=>{ const t=e.target; if(inPanel(t) && !guard) v0.set(t,t.value); };
  document.addEventListener('pointerdown',note,true); document.addEventListener('keydown',note,true);
  document.addEventListener('change',e=>{
    const el=e.target; if(!inPanel(el) || !v0.has(el) || v0.get(el)===el.value) return;
    v0.delete(el);
    const lab=document.querySelector<HTMLElement>(`label[for="${el.id}"]`)?.textContent || el.getAttribute('aria-label') || 'Réglage';
    toast(`${lab} modifié`,false,{label:'Annuler',fn:undo});
  });
  };
  sliderGuard();
  // onglets
  document.querySelectorAll<HTMLElement>('#tabs button').forEach(b=>b.onclick=()=>{
    if(isSheet()){
      if(ui.framing) setFraming(false);
      if(ui.sheet==='peek') setSheet('half');
      else if(b.classList.contains('on')) setSheet(ui.sheet==='full'?'half':'full');
    }
    showTab(b.dataset.tab!);
  });
  // clavier : flèches, Début, Fin (motif ARIA des onglets)
  $('tabs').addEventListener('keydown',e=>{
    const bs=[...document.querySelectorAll<HTMLElement>('#tabs button:not([hidden])')], i=bs.findIndex(x=>x.classList.contains('on'));
    const j={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:bs.length-1}[e.key]; if(j==null) return;
    e.preventDefault(); showTab(bs[(j+bs.length)%bs.length].dataset.tab!,true);
  });
  // parcours guidé : Lieu → Repère → Textes → Style → Exporter
  document.querySelectorAll<HTMLElement>('[data-next]').forEach(b=>b.onclick=()=>{ showTab(b.dataset.next!); document.querySelector<HTMLElement>('.tabbody')!.scrollTop=0; if(isSheet()&&ui.sheet==='peek') setSheet('half'); });
  $('bNextExport').onclick=()=>{ showTab('export'); document.querySelector<HTMLElement>('.tabbody')!.scrollTop=0; if(isSheet()&&ui.sheet==='peek') setSheet('half'); };
  // section Avancé
  try{ if(localStorage.getItem(ADV_KEY)==='1') $<HTMLDetailsElement>('adv').open=true; }catch(e){}
  $<HTMLDetailsElement>('adv').addEventListener('toggle',()=>{ try{ $<HTMLDetailsElement>('adv').open ? localStorage.setItem(ADV_KEY,'1') : localStorage.removeItem(ADV_KEY); }catch(e){} });
  // Onglet Style, « Plus de réglages » : mémorisée, et ouverte d'office si un réglage avancé diffère du défaut (aucun effet appliqué n'est caché)
  const MORE_KEY='cms:styleMoreOpen'; let moreAuto=false;   // locaux : pas de nouveaux noms globaux
  function moreActive(){
    const D=DEFAULT_STATE, diff=(a: Record<string, unknown>,b: Record<string, unknown>)=>Object.keys(b).some(k=>a?.[k]!==b[k]);
    return diff(st.fx,D.fx)||diff(st.orn,D.orn)||diff(st.layers,D.layers)||st.stroke!==D.stroke||st.waterMult!==D.waterMult||st.attribution!==D.attribution;
  }
  function syncMore(){ const d=$<HTMLDetailsElement>('styleMore'); if(moreActive() && !d.open){ moreAuto=true; d.open=true; } }
  // section « Plus de réglages » de l'onglet Style : état mémorisé ; ouverte d'office (sans mémoriser) quand un réglage qu'elle contient est actif
  try{ if(localStorage.getItem(MORE_KEY)==='1') $<HTMLDetailsElement>('styleMore').open=true; }catch(e){}
  $<HTMLDetailsElement>('styleMore').addEventListener('toggle',()=>{ if(moreAuto){ moreAuto=false; return; } try{ $<HTMLDetailsElement>('styleMore').open ? localStorage.setItem(MORE_KEY,'1') : localStorage.removeItem(MORE_KEY); }catch(e){} });
  $<HTMLDetailsElement>('styleMore').addEventListener('input',syncMore); CMS.on('state:synced',syncMore); syncMore();
  // date : calendrier natif
  $('dateIn').addEventListener('focus',()=>{ const v=isoFromFr(st.texts.date); if(v) $('dateIn').value=v; });
  $('dateIn').addEventListener('pointerdown',()=>{ const v=isoFromFr(st.texts.date); if(v) $('dateIn').value=v; });
  $('dateIn').addEventListener('change',e=>{ const t=frDate((e.target as HTMLInputElement).value); if(!t) return; update(_s=>(_s.texts.date=t)); update(_s=>(_s.show.date=true)); syncInputs(); changed(); toast('Date : '+t); });
  // ma position (géolocalisation de l'appareil, demandée par le navigateur)
  if('geolocation' in navigator){ $('bGeo').hidden=false; $('bGeo').onclick=locateMe; }
  // annuler / rétablir
  $('bUndo').onclick=undo; $('bRedo').onclick=redo;
  addEventListener('keydown',e=>{
    if(!(e.ctrlKey||e.metaKey) || e.altKey) return;
    if((e.target as HTMLInputElement).matches?.('input[type=text],input[type=search],textarea')) return;   // laisser l'annulation native des champs
    const k=e.key.toLowerCase();
    if(k==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
    else if((k==='z' && e.shiftKey) || k==='y'){ e.preventDefault(); redo(); }
  });
  // presets
  const pr=$('presets');
  PRESETS.forEach(([lbl,lat,lon,z,title,sub])=>{ const b=document.createElement('button'); b.className='chip'; b.textContent=lbl;
    b.onclick=()=>{ update(_s=>(_s.marker={lat,lon})); update(_s=>(_s.texts.title=title)); update(_s=>(_s.texts.subtitle=sub)); syncInputs(); updateMarkerTxt(); setOsmData(null); goTo(lat,lon,z); redrawAll(); };
    pr.appendChild(b); });
  // gabarits
  const lay=$('layouts');
  LAYOUTS.forEach(([k,n])=>{ const d=h('button',{type:'button',className:'card',dataset:{v:k}},h('canvas',{width:70,height:99}),n);
    d.onclick=()=>setLayout(k); lay.appendChild(d); });
  // ambiances
  AMBIANCES.forEach(([k,n])=>{ const b=h('button',{type:'button',dataset:{v:k}},h('canvas',{width:70,height:99}),h('small',{},n));
    b.onclick=()=>applyAmbiance(k); $('ambiances').appendChild(b); });
  // orientation
  document.querySelectorAll<HTMLElement>('#orientSeg button').forEach(b=>b.onclick=()=>setOrient(b.dataset.v!));
  document.querySelectorAll<HTMLElement>('#dedWrapSeg button').forEach(b=>b.onclick=()=>setDedWrap(b.dataset.v!));
  document.querySelectorAll<HTMLElement>('#formatSeg button').forEach(b=>b.onclick=()=>setFormat(b.dataset.v!));
  document.querySelectorAll<HTMLElement>('#fileSeg button').forEach(b=>b.onclick=()=>setFileType(b.dataset.v!));
  // ciel
  const tz=$<HTMLSelectElement>('skyTz'); tz.add(new Option('Celui de cet appareil','auto'));
  for(let m=-720;m<=840;m+=30){ const h=Math.trunc(Math.abs(m)/60), mi=Math.abs(m)%60; tz.add(new Option(`UTC${m<0?'−':'+'}${h}${mi?':'+String(mi).padStart(2,'0'):''}`,String(m))); }
  $('skyWhen').onchange=e=>{ update(_s=>(_s.sky.when=(e.target as HTMLInputElement).value)); drawUnder(); saveState(); };
  tz.onchange=e=>{ update(_s=>(_s.sky.tz=(e.target as HTMLInputElement).value==='auto'?'auto':+(e.target as HTMLInputElement).value)); drawUnder(); saveState(); };
  // deux lieux
  document.querySelectorAll<HTMLElement>('#placeSeg button').forEach(b=>b.onclick=()=>setActivePlace(+b.dataset.v!));
  $('placeSwitch').onclick=()=>setActivePlace(1-(st.active||0));
  // Thème : section repliée par défaut (gagne de la place), état mémorisé ; locaux : pas de nouveaux noms globaux
  const THEME_KEY='cms:themeOpen';
  try{ if(localStorage.getItem(THEME_KEY)==='1') $<HTMLDetailsElement>('themeBox').open=true; }catch(e){}
  $<HTMLDetailsElement>('themeBox').addEventListener('toggle',()=>{ try{ $<HTMLDetailsElement>('themeBox').open ? localStorage.setItem(THEME_KEY,'1') : localStorage.removeItem(THEME_KEY); }catch(e){} });
  // filtres des thèmes
  THEME_CATS.forEach(([k,n],i)=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'+(i?'':' on'); b.textContent=n; b.dataset.v=k;
    b.onclick=()=>{ document.querySelectorAll<HTMLElement>('#themeCats .chip').forEach(x=>x.classList.toggle('on',x===b)); document.querySelectorAll<HTMLElement>('#themes .theme').forEach(t=>t.hidden=!!k && t.dataset.cat!==k); }; $('themeCats').appendChild(b); });
  // papier
  TEXTURES.forEach(([k,n])=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.dataset.v=k; b.textContent=n; b.onclick=()=>{ const before=cmpSnap(); update(_s=>(_s.texture=k)); setSeg('textures',k); noteChange(before,`le papier « ${n} »`); drawTexture(); saveState(); }; $('textures').appendChild(b); });
  // modèles de texte
  OCCASIONS.forEach(([k,n])=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=n; b.onclick=()=>applyOccasion(k); $('occasions').appendChild(b); });
  // polices : duos, catégories, police du titre, police du texte
  const fam=(k: string)=>FONTS[k].fam;
  DUOS.forEach(([k,n,ft,fx])=>{ const b=h('button',{type:'button',dataset:{v:k},role:'radio'},
      h('span',{className:'t',style:{fontFamily:fam(ft)}}),h('span',{className:'d',style:{fontFamily:fam(fx)}}),h('small',{},n));
    b.onclick=async()=>{ update(_s=>(_s.fontTitle=ft===fx?'':ft)); update(_s=>(_s.font=fx)); update(_s=>(_s.illusText.style='font')); syncFonts(); saveState(); await loadFonts(); scheduleOver(); }; $('duos').appendChild(b); });
  // Vintage parmi les duos (#88) : titre en capitales condensées, police du texte inchangée
  { const b=h('button',{type:'button',dataset:{v:'*vintage'},role:'radio'},h('span',{className:'t',style:{fontFamily:fam('bebas')}}),h('span',{className:'d'}),h('small',{},'Vintage'));
    b.onclick=async()=>{ update(_s=>(_s.illusText.style='vintage')); syncFonts(); CMS.emit('state:synced'); saveState(); await loadFonts(); scheduleOver(); }; $('duos').appendChild(b); }
  FONT_CATS.forEach(([k,n],i)=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'+(i?'':' on'); b.textContent=n;
    b.onclick=()=>{ document.querySelectorAll<HTMLElement>('#fontCats .chip').forEach(x=>x.classList.toggle('on',x===b)); document.querySelectorAll<HTMLElement>('#fontSeg button,#fontTitleSeg button').forEach(f=>f.hidden=!!k && !!f.dataset.cat && f.dataset.cat!==k); }; $('fontCats').appendChild(b); });
  const fbtn=(k: string,n: string,cat?: string)=>h('button',{type:'button',dataset:cat?{v:k,cat}:{v:k},role:'radio'},
    h('span',{className:'smp',style:k?{fontFamily:fam(k),fontSize:FONTS[k].scale?(1.25*FONTS[k].scale).toFixed(2)+'rem':''}:{}}),h('small',{},n));
  // Police du titre : « Vintage » (capitales condensées, #72), puis « Comme le texte » et les polices ; choisir une police quitte Vintage
  const vint=h('button',{type:'button',dataset:{v:'*vintage'},role:'radio'},h('span',{className:'smp',style:{fontFamily:fam('bebas'),fontSize:(1.25*(FONTS.bebas.scale||1)).toFixed(2)+'rem'}}),h('small',{},'Vintage'));
  vint.onclick=async()=>{ update(_s=>(_s.illusText.style='vintage')); syncFonts(); CMS.emit('state:synced'); saveState(); await loadFonts(); scheduleOver(); }; $('fontTitleSeg').appendChild(vint);
  const same=fbtn('','Comme le texte'); same.onclick=async()=>{ update(_s=>(_s.fontTitle='')); update(_s=>(_s.illusText.style='font')); syncFonts(); saveState(); await loadFonts(); scheduleOver(); }; $('fontTitleSeg').appendChild(same);
  FONT_LIST.forEach(([k,n,cat])=>{
    const t=fbtn(k,n,cat); t.onclick=async()=>{ update(_s=>(_s.fontTitle=k===st.font?'':k)); update(_s=>(_s.illusText.style='font')); syncFonts(); saveState(); await loadFonts(); scheduleOver(); }; $('fontTitleSeg').appendChild(t);
    const x=fbtn(k,n,cat); x.onclick=async()=>{ if(!st.fontTitle && FONTS[k].script) update(_s=>(_s.fontTitle=st.font)); update(_s=>(_s.font=k)); if(st.fontTitle===k) update(_s=>(_s.fontTitle='')); syncFonts(); saveState(); await loadFonts(); scheduleOver(); }; $('fontSeg').appendChild(x); });
  // plusieurs lieux, itinéraire, aperçu au mur, lien
  $('bAddPlace').onclick=addPlace;
  $('gpxIn').onchange=e=>{ const f=(e.target as HTMLInputElement).files![0]; if(f) importGpx(f); (e.target as HTMLInputElement).value=''; };
  $('routeShow').onchange=e=>{ if(st.route){ update(_s=>(_s.route!.show=(e.target as HTMLInputElement).checked)); changed(); } };
  document.querySelectorAll<HTMLElement>('#routeColor button').forEach(b=>b.onclick=()=>{ update(_s=>(_s.routeStyle.color=b.dataset.v!)); renderRoute(); changed(); });
  $('routeW').oninput=e=>{ update(_s=>(_s.routeStyle.width=+(e.target as HTMLInputElement).value)); renderRoute(); changed(); };
  $('routeDash').onchange=e=>{ update(_s=>(_s.routeStyle.dash=(e.target as HTMLInputElement).checked)); changed(); };
  $('bFitRoute').onclick=fitRoute;
  $('bDelRoute').onclick=()=>{ update(_s=>(_s.route=null)); renderRoute(); changed(); toast('Itinéraire retiré · « Annuler » pour le retrouver'); };
  $('bMockup').onclick=openMockup; $('mockClose').onclick=()=>closeDialog('mockup'); $('mockDl').onclick=downloadMockup;
  WALLS.forEach(([n],i)=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=n; b.onclick=()=>{ mock.wall=i; drawMockup(); }; $('mockWalls').appendChild(b); });
  FRAMES.forEach(([n],i)=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent='Cadre '+n.toLowerCase(); b.onclick=()=>{ mock.frame=i; drawMockup(); }; $('mockFrames').appendChild(b); });
  $('mockMat').onchange=e=>{ mock.mat=(e.target as HTMLInputElement).checked; drawMockup(); };
  $('bShare').onclick=shareLink;
  $('welClose').onclick=()=>{ closeWelcome(); toast('Les ambiances restent proposées dans l\'onglet Style'); };
  // thèmes
  const th=$('themes');
  Object.entries(THEMES).forEach(([k,t])=>{
    const d=h('button',{type:'button',className:'theme',dataset:{v:k,cat:t.cat}},
      h('span',{className:'sw'},...['paper','land','water','roadMajor','marker'].map(c=>h('i',{style:{background:t.c[c]}}))),h('span',{className:'n'},t.name));
    d.onclick=()=>{ const before=cmpSnap();
      update(_s=>(_s.theme=k)); update(_s=>(_s.colors={...t.c})); noteChange(before,{theme:true}); refreshColors(); changed({all:true,cards:true}); }; th.appendChild(d); });
  initCompare();
  // couleurs
  const co=$('colors');
  Object.entries(COLOR_LABELS).forEach(([k,n])=>{ const l=h('label',{},h('input',{type:'color',dataset:{c:k}}),h('span',{},n));
    l.querySelector('input')!.oninput=e=>{ update(_s=>(_s.colors[k]=(e.target as HTMLInputElement).value.toUpperCase())); colorChanged(k); }; co.appendChild(l); });
  $('photoIn').onchange=e=>{ const f=(e.target as HTMLInputElement).files![0]; if(f) CMS.palette.fromFile(f); (e.target as HTMLInputElement).value=''; };
  $('bPalIllus').onclick=()=>CMS.palette.fromIllus();
  document.querySelectorAll<HTMLElement>('#photoSeg button').forEach(b=>b.onclick=()=>CMS.palette.apply(b.dataset.v));
  document.querySelectorAll<HTMLElement>('[data-gold]').forEach(b=>b.onclick=()=>{ update(_s=>(_s.colors[b.dataset.gold!]=GOLD)); refreshColors(); changed({all:true,cards:true}); toast('Touche d\'or appliquée'); });
  // repères
  const mk=$('marks');
  MARKERS.forEach(([k,n])=>{ const d=h('button',{type:'button',className:'card',dataset:{v:k}},h('canvas',{width:96,height:96}),n);
    d.onclick=()=>{ update(_s=>(_s.markerStyle=k)); changed({cards:true}); }; mk.appendChild(d); });
  const mc=$('mColors');
  // « Auto » (#77) : couleur Repère du thème, comme la couleur « Auto » des textes ; la puce de la couleur en cours est enfoncée
  [['Auto','auto','Auto : couleur Repère du thème'],...MARKER_COLORS].forEach(([n,v,t])=>{ const b=h('button',{type:'button',className:'chip',dataset:{v},title:t||n},n);
    b.onclick=()=>{ update(_s=>(_s.colors.marker=v==='auto' ? themeMarker() : v)); refreshColors(); changed({cards:true}); }; mc.appendChild(b); });
  $('mColor').oninput=e=>{ update(_s=>(_s.colors.marker=(e.target as HTMLInputElement).value.toUpperCase())); colorChanged('marker'); };
  // segments
  document.querySelectorAll<HTMLElement>('#engineSeg button').forEach(b=>b.onclick=()=>setEngine(b.dataset.v!));
  document.querySelectorAll<HTMLElement>('#fillSeg button').forEach(b=>b.onclick=()=>{ update(_s=>(_s.markerFill=b.dataset.v==='1')); setSeg('fillSeg',b.dataset.v!); changed({cards:true}); });
  document.querySelectorAll<HTMLElement>('#coordSeg button').forEach(b=>b.onclick=()=>{ update(_s=>(_s.coordFormat=b.dataset.v!)); setSeg('coordSeg',st.coordFormat); updateMarkerTxt(); changed(); });
  // champs liés data-k
  document.querySelectorAll<HTMLInputElement>('[data-k]').forEach(el=>{
    const k=el.dataset.k!;
    el.addEventListener('input',()=>{
      const v = el.type==='checkbox' ? el.checked : el.type==='range' ? parseFloat(el.value) : el.value;
      const cmpLabel=el.type==='checkbox' && /^(fx|orn)\.|^folds$/.test(k) ? CMS.compare.fxLabel(el,k) : '', before=cmpLabel && cmpSnap();
      update(_s=>setPath(_s,k,v)); syncOutputs();
      if(cmpLabel) noteChange(before,cmpLabel);
      if(k==='texts.title'||k==='texts.names'||k==='texts.dedication') updateFontSamples();
      if(k.startsWith('sky.')){ drawUnder(); saveState(); return; }
      if(k==='folds'){ drawTexture(); saveState(); return; }
      if(k==='focusR'){ if(st.fx.quarter) redrawAll(true); else changed(); return; }
      if(k==='numbered'||k==='linkMarkers'){ changed(); return; }
      if(k.startsWith('illus.')||k.startsWith('illusText.')){ CMS.emit('illus:input',k); return; }   // modes illustrés (src/ui/illustration.ts)
      if(k.startsWith('layers.')||k.startsWith('fx.')){ ui.snap=null; redrawAll(true); }
      else if(k==='margin'){ layoutPreview(); saveState(); }
      else if(k==='stroke'||k==='waterMult'){ redrawAll(true); }
      else { changed(); }
    });
  });
  $('zoom').oninput=e=>setZoom(parseFloat((e.target as HTMLInputElement).value));
  // Boutons flottants : ils agissent sur le calque cadré, carte ou illustration (#77)
  const onIllus=()=>CMS.illus.layer()==='illus';
  $('bZoomIn').onclick=()=>onIllus() ? CMS.illus.zoomBy(10) : setZoom(st.zoom+0.5); $('bZoomOut').onclick=()=>onIllus() ? CMS.illus.zoomBy(-10) : setZoom(st.zoom-0.5);
  $('bPlace2').onclick=()=>setPlacing(!ui.placing);
  $('markerForm').onsubmit=e=>{ e.preventDefault(); placeMarkerFromInput(); };
  $('bMarkerCenter').onclick=()=>setMarker(st.center.lat,st.center.lon);
  $('bToMarker').onclick=()=>onIllus() ? CMS.illus.recenter() : goTo(st.marker.lat,st.marker.lon);
  $('bDiag').onclick=runDiagnostics;
  $('bReset').onclick=askReset;
  $('bUiSmaller').onclick=()=>stepUiScale(-1); $('bUiLarger').onclick=()=>stepUiScale(1);
  $('bTsReset').onclick=()=>{ update(_s=>(_s.textScale={...DEFAULT_STATE.textScale})); update(_s=>(_s.textScaleAll=DEFAULT_STATE.textScaleAll)); syncInputs(); changed(); toast('Tailles des textes rétablies'); };
  $('fileIn').onchange=e=>{ const f=(e.target as HTMLInputElement).files![0]; if(f) importFile(f); (e.target as HTMLInputElement).value=''; };
  const submitSearch=CMS.geocoder.debounceSubmit((q: string)=>search(q),300);
  $('searchForm').onsubmit=e=>{ e.preventDefault(); submitSearch($('q').value); };
  $('results').addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); closeResults(); } });
  $('bExport').onclick=exportPoster;
  $('resClose').onclick=()=>{ $('result').hidden=true; $('bExport').focus(); };
}
/** Réinitialisation : un premier appui demande confirmation (pas de confirm(), bloqué dans les aperçus intégrés) */
let resetT=0;
function askReset(){
  const b=$('bReset');
  if(!b.classList.contains('confirm')){
    b.classList.add('confirm'); b.textContent='Confirmer ?';
    clearTimeout(resetT); resetT=setTimeout(()=>{ b.classList.remove('confirm'); b.textContent='Tout réinitialiser'; },4000);
    return;
  }
  clearTimeout(resetT); b.classList.remove('confirm'); b.textContent='Tout réinitialiser';
  resetAll();
}
/** Rétablit tous les réglages par défaut (lieu, cadrage, gabarit, thème, couleurs, repère, textes, calques).
 *  Sont conservés : l'accord aux services tiers et les données déjà importées. */
export function resetAll(){
  clearTimeout(saveT); recordHistory();   // modification en attente : étape distincte
  const fresh=structuredClone(DEFAULT_STATE);
  replaceState(fresh);
  setPlacing(false); $('markerIn').value='';
  syncInputs(); layoutPreview();
  loadFonts().then(()=>scheduleOver());
  setEngine(st.engine); goTo(st.center.lat,st.center.lon,st.zoom);
  commitHistory(); toast('Réglages par défaut rétablis · « Annuler » pour revenir en arrière');
}
export function syncInputs(){
  document.querySelectorAll<HTMLInputElement>('[data-k]').forEach(el=>{ const v=getPath(st,el.dataset.k!); if(el.type==='checkbox') el.checked=!!v; else el.value=v??''; });
  setSeg('engineSeg',st.engine); setSeg('fillSeg',st.markerFill?'1':'0'); setSeg('coordSeg',st.coordFormat);
  setSeg('orientSeg',st.orient); setSeg('formatSeg',st.format); setSeg('fileSeg',st.fileType); setSeg('dedWrapSeg',st.dedWrap);
  setSeg('textures',st.texture); updateExportLabel();
  syncZoomUI(); syncOutputs(); refreshColors(); refreshCards(); updateMarkerTxt(); updateEngineUI(); syncFonts(); updateLayoutUI(); renderRoute(); drawTexture();
  CMS.emit('state:synced');   // modes illustrés : sélecteur de mode, onglet Illustration, style du titre
}
/** Polices : sélection des cartes (titre, texte, duo) et aperçus */
export function syncFonts(){
  setSeg('fontSeg',st.font); setSeg('fontTitleSeg',CMS.illus.textStyle().vint ? '*vintage' : st.fontTitle||'');
  // Style du titre automatique (#77) : dit ce qu'il donne dans ce type d'affiche, et dans les autres
  const ta=$('titleAuto'), auto=st.illusText.style==='auto'; ta.hidden=!auto;
  if(auto) ta.textContent=`Titre automatique : ${st.mode==='map' ? 'police choisie sur une carte (Vintage sur une affiche illustrée)' : 'Vintage sur une affiche illustrée (police choisie sur une carte)'}. Touchez une police ou Vintage pour le fixer dans les trois types d\u2019affiche.`;
  const duo=DUOS.find(([,,ft,fx])=>fx===st.font && (st.fontTitle||st.font)===ft);
  setSeg('duos',CMS.illus.textStyle().vint ? '*vintage' : duo?duo[0]:'—');   // Vintage : coché quand le titre est en Vintage (#88)
  const vd=document.querySelector<HTMLElement>('#duos [data-v="*vintage"] .d'); if(vd) vd.style.fontFamily=FONTS[st.font].fam;
  updateFontSamples();
}
export function syncOutputs(){
  $('oMargin').textContent=st.margin+' %'; $('oStroke').textContent='× '+st.stroke.toFixed(2); $('oWater').textContent='× '+st.waterMult.toFixed(1);
  $('oFocus').textContent=st.focusR+' %';
  $('oMSize').textContent=st.markerSize+' %'; $('oMOp').textContent=Math.round(st.markerOpacity*100)+' %';
  $('oTsAll').textContent=st.textScaleAll+' %';
  for(const k of Object.keys(FIT_NAMES)){ const o=$('oTs-'+k); if(o) o.textContent=st.textScale[k]+' %'+(o.classList.contains('shrunk')?' ↘':''); }
}
/** Sélecteur de couleur : il émet un événement par mouvement du curseur ; le rendu complet (affiche, style MapLibre,
 *  vignettes) est regroupé en un seul passage par image. */
const colorQueue=new Set<string>();
let rafColor=0;
function colorChanged(k: string){
  updateContrast(); updateCompare();   // légers : immédiats
  colorQueue.add(k); if(rafColor) return;
  rafColor=requestAnimationFrame(()=>{ rafColor=0; const ks=[...colorQueue]; colorQueue.clear();
    redrawAll(true); if(ks.includes('paper')) drawTexture();
    // les autres sélecteurs de la même couleur suivent (jamais celui en cours de manipulation)
    document.querySelectorAll<HTMLInputElement>('[data-c],#mColor').forEach(i=>{ const c=i.id==='mColor'?'marker':i.dataset.c!; if(ks.includes(c) && i!==document.activeElement) i.value=st.colors[c]; });
    if(ks.some(x=>x==='marker'||x==='paper')) refreshCards(); });
}
/** Couleur Repère du thème choisi dans la liste des thèmes */
function themeMarker(){ return (THEMES[st.theme]?.c.marker || st.colors.marker).toUpperCase(); }
export function refreshColors(){ document.querySelectorAll<HTMLInputElement>('[data-c]').forEach(i=>i.value=st.colors[i.dataset.c!]); $('mColor').value=st.colors.marker;
  const mk=st.colors.marker.toUpperCase(); let any=false;
  $('mColors').querySelectorAll('button').forEach(b=>{ const on=!any && (b.dataset.v==='auto' ? themeMarker()===mk : b.dataset.v!.toUpperCase()===mk); any=any||on; pressed(b,on); });
  updateContrast(); drawTexture(); CMS.emit('colors:changed'); }
/** Vignettes (gabarits, ambiances, repères) : l'état choisi est mis à jour tout de suite ; le dessin, coûteux
 *  (28 vignettes, deux passes de drawPoster chacune), une fois par image et seulement pour l'onglet affiché.
 *  Les vignettes d'un onglet masqué sont redessinées à son ouverture (showTab). */
const cardsDirty=new Set();
let rafCards=0;
export function refreshCards(){
  document.querySelectorAll<HTMLElement>('#layouts .card').forEach(d=>pressed(d,d.dataset.v===st.layout));
  document.querySelectorAll<HTMLElement>('#ambiances button').forEach(d=>{ const p=AMBIANCES.find(a=>a[0]===d.dataset.v)![2];
    d.classList.toggle('land',st.orient==='landscape');
    pressed(d,st.theme===p.theme && st.layout===p.layout && st.font===p.font && (st.fontTitle||'')===p.fontTitle && st.markerStyle===p.markerStyle); });
  document.querySelectorAll<HTMLElement>('#themes .theme').forEach(d=>pressed(d,d.dataset.v===st.theme)); $('themeCur').textContent=THEMES[st.theme]?.name||'';
  updateCompare();
  document.querySelectorAll<HTMLElement>('#marks .card').forEach(d=>pressed(d,d.dataset.v===st.markerStyle));
  cardsDirty.add('style'); cardsDirty.add('repere');
  if(!rafCards) rafCards=requestAnimationFrame(()=>{ rafCards=0; drawCards(ui.tab); });
  syncOutputs();
}
function drawCards(tab: string){
  if(!cardsDirty.delete(tab)) return;
  if(tab==='style'){
    document.querySelectorAll<HTMLElement>('#layouts .card').forEach(d=>thumb(d.querySelector('canvas')!,{layout:d.dataset.v}));
    document.querySelectorAll<HTMLElement>('#ambiances button').forEach(d=>{ const p=AMBIANCES.find(a=>a[0]===d.dataset.v)![2];
      thumb(d.querySelector('canvas')!,{layout:p.layout,colors:THEMES[p.theme].c,font:p.font,fontTitle:p.fontTitle,markerStyle:p.markerStyle}); });
  } else if(tab==='repere'){
    const col = st.colors.marker.toUpperCase()==='#FFFFFF' ? '#999' : st.colors.marker;
    document.querySelectorAll<HTMLElement>('#marks .card').forEach(d=>{ const cv=d.querySelector('canvas'), ctx=cv!.getContext('2d')!; ctx.fillStyle='#fff'; ctx.fillRect(0,0,96,96);
      drawMarker(ctx,48,d.dataset.v==='pin'?72:50,d.dataset.v==='pin'?42:58,{style:d.dataset.v,color:col,fill:st.markerFill,opacity:1,facet:'#fff'}); });
  }
}
export function updateEngineUI(){
  document.querySelector<HTMLButtonElement>('#engineSeg [data-v=maplibre]')!.disabled = mlLib==='fail';
  $('fileBlock').hidden=st.engine!=='file';
  $('mcOmt').hidden=st.engine!=='maplibre';   // attribution près de la carte : schéma OpenMapTiles avec le moteur GPU seulement
  $('engineHint').textContent = ({
    maplibre: mlLib==='fail' ? 'Librairie MapLibre impossible à charger (aucun CDN joignable).' : 'Tuiles vectorielles OpenFreeMap : instantané, mers et côtes correctes, idéal sur mobile.',
    file:'Aucun accès réseau requis : importez un fichier de données OSM. Tracé vectoriel au détail maximal, aperçu et export identiques.'
  } as Record<string, string>)[st.engine];
}
export function setEngine(v: string,quiet?: boolean){
  if(v==='maplibre' && mlLib==='fail'){ toast('MapLibre n\'a pas pu être chargé : aucun CDN joignable depuis cette page.',true); return; }
  update(_s=>(_s.engine=v)); setSeg('engineSeg',v); updateEngineUI(); setPlacing(false); showBanner(false);
  if(v!=='maplibre') openAdvanced();
  hist.quietUntil=Date.now()+1500;   // le moteur n'entre pas dans l'historique ; ses recentrages non plus
  if(v==='file'){ renderMap(true); if(!osmData && !quiet) toast('Importez un fichier de données (onglet Lieu).'); }
  else { setMlFailMsg(''); renderMap(true); mlRestyle(); }
  saveState();
}
// Commandes du port de l'interface (src/core/port.ts) réalisées ici
onUi('syncInputs', syncInputs);
onUi('syncOutputs', syncOutputs);
onUi('syncZoomUI', syncZoomUI);
onUi('refreshCards', refreshCards);
onUi('refreshColors', refreshColors);
onUi('updateMarkerTxt', updateMarkerTxt);
onUi('updateEngineUI', updateEngineUI);
onUi('showTab', showTab);
onUi('openAdvanced', openAdvanced);
onUi('syncFonts', syncFonts);

// Façade : les importeurs gardent leur chemin d'import (#119)
export {applyUiScale, parseCoords, updateMarkerTxt} from './panel-coords.js';
