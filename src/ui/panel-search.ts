/* City Map Studio — Interface : ma position et recherche d'un lieu (Nominatim) (extrait de ui/panel.ts, #119). */
import {$, h, setStatus, toast} from '../core/dom.js';
import {goTo, setMarker} from '../features/places.js';
import {needConsent, st} from '../core/doc/state.js';
import {PRESETS} from '../content/config.js';
import {update} from '../core/doc/store.js';
import {changed} from '../view/preview.js';
import {syncInputs, updateFontSamples} from './panel.js';
import {updateMarkerTxt} from './panel-coords.js';
// ---------- Ma position (géolocalisation de l'appareil) ----------
export function locateMe(){
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
// Délai, quota, relance, cache et validation des réponses : CMS.geocoder (src/services/geocoder.ts).
const SEARCH_UI = CMS.define('searchUI', () => {
const GEO_MSG: Record<string, (e: CmsError)=>string>={
  TIMEOUT:()=>'Le service de recherche ne répond pas.',
  RATE_LIMITED:e=>`Trop de recherches : réessayez dans ${Math.ceil((e.retryInMs||60000)/1000)} s.`,
  NETWORK:e=>`Recherche indisponible (${e.message}).`,
  HTTP:e=>`Recherche indisponible (${e.message}).`,
  BAD_RESPONSE:()=>'Réponse inattendue du service de recherche.'
};
let searching=false;
/** Message de la recherche : affiché dans la liste (texte) et annoncé par la zone d'état */
function searchMsg(t: string){ const box=$('results'); box.replaceChildren(...(t?[h('li',{className:'msg'},t)]:[])); $('resultsStatus').textContent=t; }
async function search(q: string){
  q=(q||'').trim(); if(!q){ $('q').focus(); return; }
  if(searching) return;
  if(!needConsent(()=>search(q))) return;
  const box=$('results'), sb=document.querySelector<HTMLButtonElement>('#searchForm [type=submit]');
  searching=true; sb!.disabled=true; box.setAttribute('aria-busy','true'); searchMsg('Recherche…');
  try{
    const list=await CMS.geocoder.search(q);
    if(!list.length){ searchMsg('Aucun résultat.'); return; }
    box.replaceChildren(...list.map(resultItem));
    $('resultsStatus').textContent=`${list.length} résultat${list.length>1?'s':''} pour « ${q} ».`;
    box.querySelector('button')?.focus({preventScroll:false});
  }catch(e){
    if((e as CmsError).code==='ABORTED') return;
    searchMsg((GEO_MSG[(e as CmsError).code]?.(e as CmsError) ?? 'Recherche indisponible.')+' Vous pouvez placer le repère en touchant la carte.');
  }
  finally{ searching=false; sb!.disabled=false; box.removeAttribute('aria-busy'); }
}
/** Ferme la liste des résultats et rend le focus au champ de recherche */
function closeResults(){ searchMsg(''); $('q').focus(); }
/** Un résultat validé (CMS.geocoder) : nom en tête, adresse en dessous, deux actions décrites par le lieu */
let resultSeq=0;
/** Nom donné au lieu choisi : sa ville, ou à défaut (site naturel, monument isolé, lieu-dit) le nom du lieu lui-même */
/** Lieu trouvé par le géocodeur (CMS.geocoder.sanitize) */
type Found = {lat: number; lon: number; name: string; display: string; key: string; city: string; region: string; country: string};
const placeName=(it: Found)=>{ const d=(it.display||'').split(',')[0].trim(); return it.city || it.name || (/^[-\d.\s]+$/.test(d)?'':d); };   // jamais de simples coordonnées
/** Le titre (ville ou, à défaut, nom du lieu) et le sous-titre (région • pays) suivent le résultat choisi, comme pour les villes proposées,
 *  sauf s'ils ont été personnalisés : seuls un texte vide, celui d'une ville proposée ou le dernier posé ici sont remplacés.
 *  Rend le nouveau titre, ou '' si rien n'a changé. */
let autoTexts: Record<string, string>={title:'',subtitle:''};
function followCity(it: Found){
  const city=placeName(it), sub=[it.region,it.country].filter(Boolean).join(' • ');
  if(!city) return '';
  const free=(k: string,i: number)=>{ const v=(st.texts[k]||'').trim(); return !v || v===autoTexts[k] || PRESETS.some(p=>p[i]===v); };
  const t=free('title',4) && st.texts.title!==city, s=!!sub && free('subtitle',5) && st.texts.subtitle!==sub;
  if(t){ update(_s=>(_s.texts.title=city)); autoTexts.title=city; }
  if(s){ update(_s=>(_s.texts.subtitle=sub)); autoTexts.subtitle=sub; }
  if(t||s){ syncInputs(); updateFontSamples(); changed(); }
  return t ? city : '';
}
function resultItem(it: Found){
  const {lat,lon,name:nm,display}=it, id='res-'+(++resultSeq);
  const rest=nm && display.startsWith(nm) ? display.slice(nm.length).replace(/^,\s*/,'') : display;
  const t=h('div',{className:'t',id});
  if(nm && rest!==display) t.append(h('b',{},nm),h('span',{className:'sr-only'},', '),h('small',{},rest)); else t.textContent=display;   // virgule lue, non affichée
  const btn=(label: string,fn: ()=>void)=>{ const b=h('button',{type:'button',className:'btn sm'},label); b.setAttribute('aria-describedby',id);
    b.onclick=e=>{ fn(); if(e.detail===0) $('q').focus({preventScroll:true}); };   // activé au clavier : le focus revient au champ
    return b; };
  const remember=()=>updateMarkerTxt.remember(lat,lon,placeName(it),[it.region,it.country].filter(Boolean).join(' • '));
  const b1=btn('Carte + repère',()=>{ remember(); update(_s=>(_s.marker={lat,lon})); updateMarkerTxt(); goTo(lat,lon); const t=followCity(it); searchMsg('');
    $('resultsStatus').textContent='Carte centrée et repère placé.'+(t?` Titre : ${t}.`:''); if(t) toast('Titre : '+t); });
  const b2=btn('Repère seul',()=>{ remember(); setMarker(lat,lon); searchMsg(''); toast('Repère placé'); });
  return h('li',{className:'res'},t,h('div',{className:'row'},b1,b2));
}

return {search, closeResults};
});
export const {search, closeResults} = SEARCH_UI;
