/* City Map Studio — Repère à placer et bandeau de la scène (#118, issu de features.ts). */
import {$} from '../core/dom.js';
import {applySheet, isSheet, setSheet, stageMode} from './sheet.js';
import {slot} from '../view/preview.js';
import {ui} from '../core/doc/state.js';
import {onUi} from '../core/port.js';
// ---------- Interface ----------
function showBanner(show: boolean,txt?: string,label?: string,action?: (()=>void) | null){
  $('banner').classList.toggle('show',!!show); if(txt) $('bannerTxt').textContent=txt;
  if(ui.sheet==='peek') applySheet();
  const b=$('bBanner'); b.textContent=label||''; b.onclick=action||null; b.hidden=!action;
}
function setPlacing(on: boolean,idx=0){ ui.placing=on; ui.placeIdx=on?idx:0;
  $('placeHint').textContent = idx ? `Touchez la carte pour placer le lieu ${idx+1}` : 'Touchez la carte pour placer le repère';
  if(on && idx && isSheet()) setSheet(ui.sheet); $('bPlace2').classList.toggle('on',on); slot.classList.toggle('placing',on);
  if(ui.framing) CMS.intent.placing(on);   // en Modification, « Repère » est un choix du sélecteur
  stageMode(); }

// Commandes du port de l'interface (src/core/port.ts) réalisées ici
onUi('showBanner', showBanner);
onUi('setPlacing', setPlacing);

export {setPlacing, showBanner};
