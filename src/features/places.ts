/* City Map Studio — Plusieurs lieux : ajout, choix, numérotation (#41) (#118, issu de features.ts). */
import {$, toast} from '../core/dom.js';
import {changed, redrawAll, renderMap} from '../view/preview.js';
import {mlMap, saveState, st, ui} from '../core/doc/state.js';
import {onUi, setPlacing, syncZoomUI, updateMarkerTxt} from '../core/port.js';
import {mlRestyle, mlZoom} from '../map/engines.js';
import {update} from '../core/doc/store.js';
// ---------- Plusieurs lieux ----------
function placeAt(lat: number,lon: number){
  const i=ui.placeIdx||0;
  if(i && st.markers2[i-1]){ update(_s=>(_s.markers2[i-1].lat=lat)); update(_s=>(_s.markers2[i-1].lon=lon)); setPlacing(false); renderPlaces(); changed(); toast(`Lieu ${i+1} placé`); }
  else setMarker(lat,lon);
}
function renderPlaces(){
  const box=$('mList'); box.textContent='';
  const row=(n: number,label: string,onLabel: (v: string)=>void,extra?: HTMLElement[])=>{ const d=document.createElement('div'); d.className='prow';
    const b=document.createElement('b'); b.textContent=String(n); const i=document.createElement('input'); i.type='text'; i.value=label; i.placeholder=n===1?'Lieu principal (ex. Rencontre)':'Nom du lieu (ex. Mariage)'; i.setAttribute('aria-label',`Nom du lieu ${n}`);
    i.oninput=()=>{ onLabel(i.value); changed(); }; d.append(b,i); if(extra) extra.forEach(e=>d.append(e)); box.appendChild(d); };
  row(1,st.markerLabel||'',(v: string)=>update(_s=>(_s.markerLabel=v)));
  (st.markers2||[]).forEach((p,k)=>{
    const pl=document.createElement('button'); pl.type='button'; pl.className='btn sm'; pl.textContent='Placer'; pl.onclick=()=>setPlacing(true,k+1);
    const rm=document.createElement('button'); rm.type='button'; rm.className='btn sm'; rm.textContent='✕'; rm.setAttribute('aria-label',`Retirer le lieu ${k+2}`);
    rm.onclick=()=>{ update(_s=>{ _s.markers2.splice(k,1); }); renderPlaces(); changed(); };
    row(k+2,p.label||'',(v: string)=>update(_s=>{ _s.markers2[k].label=v; }),[pl,rm]); });
  $('bAddPlace').disabled=(st.markers2||[]).length>=2;
  $('placesHint').hidden=st.layout!=='diptych';
}
function addPlace(){
  if((st.markers2||[]).length>=2) return;
  update(_s=>{ _s.markers2.push({lat:st.center.lat,lon:st.center.lon,label:''}); }); renderPlaces(); changed();
  setPlacing(true,st.markers2.length);
}

// Demandes du port (src/core/port.ts) réalisées ici
onUi('placeAt', placeAt);
function goTo(lat: number,lon: number,zoom?: number){
  update(_s=>(_s.center={lat,lon})); if(zoom!=null) update(_s=>(_s.zoom=zoom)); syncZoomUI();
  if(mlMap&&st.engine==='maplibre'&&st.mode!=='illus'){ mlMap.jumpTo({center:[lon,lat],zoom:mlZoom(ui.slotCss.w)}); mlRestyle(); }   // carte masquée : recadrée au retour en mode Carte
  renderMap(true); saveState(); updateMarkerTxt();
}
function setMarker(lat: number,lon: number){ update(_s=>(_s.marker={lat,lon})); setPlacing(false); updateMarkerTxt(); if(st.fx.quarter){ ui.snap=null; redrawAll(true); } else changed(); }

export {addPlace, goTo, placeAt, renderPlaces, setMarker};