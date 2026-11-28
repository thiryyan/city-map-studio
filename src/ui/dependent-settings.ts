/* City Map Studio — Réglages dépendants d'un autre choix (#58) (#118, issu de features.ts). */
import {$, h} from '../core/dom.js';
import {LAYOUTS} from '../content/config.js';
import {lum} from '../core/color.js';
import {setLayout} from '../features/presets.js';
import {st} from '../core/doc/state.js';
// ---------- Réglages dépendants d'un autre choix (issue #58) ----------
// Une seule table, inventoriée dans le dossier technique (§ 6.1). Règle : un réglage qui n'a aucun sens dans le contexte
// est masqué ; un réglage activé mais empêché par un autre choix reçoit une note d'une ligne et un bouton qui fait la bascule
// (bascule annulable : elle passe par les mêmes chemins que l'interface, donc par l'historique).
CMS.define('deps', () => {
  const tog=(k: string)=>document.querySelector<HTMLInputElement>(`[data-k="${k}"]`);
  const row=(k: string)=>tog(k)!.closest<HTMLElement>('label,.slider,.tsz');
  const setTog=(k: string,v: boolean)=>{ const el=tog(k); el!.checked=v; el!.dispatchEvent(new Event('input',{bubbles:true})); };
  const layName=(k: string)=>(LAYOUTS.find(x=>x[0]===k)||[,k])[1];
  const extras=()=>(st.markers2||[]).length>0 && st.layout!=='diptych';
  /** Réglages masqués quand ils n'ont aucun sens */
  const HIDE: [()=>HTMLElement | null, ()=>boolean][]=[
    [()=>row('focusR'), ()=>!(st.fx.halo||st.fx.quarter)],          // rayon : seulement avec le halo ou le quartier
    [()=>row('numbered'), ()=>!extras()],                             // numéroter, relier : au moins deux lieux sur une même carte
    [()=>row('linkMarkers'), ()=>!extras()],
    // style de l'itinéraire : sans objet tant que l'itinéraire est masqué
    [()=>$('routeColor'), ()=>st.route?.show===false], [()=>$('routeW').closest<HTMLElement>('.slider'), ()=>st.route?.show===false],
    [()=>$('routeDash').closest<HTMLElement>('label'), ()=>st.route?.show===false],
  ];
  const LINE_NAMES: Record<string, string>={title:'le titre est masqué',subtitle:'le sous-titre est masqué',coords:'les coordonnées sont masquées',
    dedication:'la dédicace est masquée',names:'les noms sont masqués',date:'la date est masquée'};
  /** Réglages activés mais empêchés : [id, ancre, condition, texte, bouton, action] */
  const NOTES: [string, ()=>Element | null, ()=>boolean, ()=>string, string | (()=>string), ()=>void][]=[
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
      ()=>{ const c=document.querySelector<HTMLElement>('#themeCats [data-v=sombre]'); c!.click(); CMS.panelScroll.to($('themeCats'),'start',true); }],
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
    ...Object.keys(LINE_NAMES).map((k): typeof NOTES[number]=>['hidden-'+k, ()=>row('textScale.'+k), ()=>(st.show as Record<string, boolean>)[k]===false && ((st.textScale as Record<string, number>)[k]!==100 || (k==='coords' && !!st.coordsManual)),
      ()=>`Sans effet : ${LINE_NAMES[k]} sur l'affiche.`,
      ()=>k==='coords'||k==='names' ? 'Les afficher' : 'L\'afficher', ()=>setTog('show.'+k,true)]),
  ];
  const els: Record<string, HTMLElement>={};
  function update(){
    for(const [at,when] of HIDE){ const e=at(); if(e) e.hidden=!!when(); }
    for(const [id,,when,text,label] of NOTES){
      const n=els[id]; if(!n) continue; const on=!!when();
      n.hidden=!on; if(on){ n.firstChild!.textContent=text()+' '; n.lastChild!.textContent=typeof label==='function'?label():label; }
    }
  }
  let raf=0; const schedule=()=>{ if(!raf) raf=requestAnimationFrame(()=>{ raf=0; update(); }); };
  function init(){
    for(const [id,at,,,,act] of NOTES){
      const b=h('button',{type:'button',className:'lnk'}); b.onclick=()=>{ act(); schedule(); };
      const n=h('p',{className:'depnote',id:'dep-'+id,hidden:true},h('span'),b);
      at()!.after(n); els[id]=n;
    }
    CMS.on('state:saved',schedule); CMS.on('state:synced',schedule);
    $('panel').addEventListener('input',schedule); $('panel').addEventListener('click',schedule);
    update();
  }
  return {init, update};
});

