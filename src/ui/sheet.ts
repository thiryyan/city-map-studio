/* City Map Studio — Panneau coulissant et mode Cadrer (mobile portrait) (#118, issu de features.ts). */
import {$} from '../core/dom.js';
import {ui} from '../core/doc/state.js';
import {onUi} from '../core/port.js';
// ---------- Panneau coulissant et mode Cadrer (mobile portrait) ----------
// Trois crans : « peek » (onglets + export, affiche presque plein écran), « half » (défaut), « full » (réglages, affiche en vignette).
// Sur mobile, la carte est verrouillée : un toucher ouvre le mode Cadrer (glisser, pincer), « Terminer » le referme.
const TWO_COL = matchMedia('(min-width:900px), (orientation:landscape) and (min-width:560px)');
const isSheet = () => !TWO_COL.matches;
const app = $<HTMLDivElement>('app');
function sheetHeights(){
  const vh=app.clientHeight||innerHeight;
  const peek=Math.ceil($('grab').offsetHeight+$('modeSeg').offsetHeight+$('tabs').offsetHeight+document.querySelector<HTMLElement>('.foot')!.offsetHeight+['banner','updBanner'].reduce((s,id)=>s+($(id).classList.contains('show')?$(id).offsetHeight:0),0))+1;
  return {peek, half:Math.max(peek+120,Math.round(vh*0.55)), full:Math.max(peek+120,Math.round(vh*0.84)), max:Math.round(vh*0.92)};
}
/** Applique la hauteur du panneau : cran nommé, ou hauteur libre en px pendant un glissement */
function applySheet(px?: number | null){
  const root=document.documentElement;
  app.classList.toggle('sheetmode',isSheet());
  if(!isSheet()){ root.style.removeProperty('--sheetH'); return; }
  if(ui.clean){ root.style.setProperty('--sheetH','0px'); return; }   // affiche seule : plus de panneau
  const H=sheetHeights(), h=px!=null ? Math.max(H.peek,Math.min(H.max,px)) : H[ui.sheet as 'peek' | 'half' | 'full'];
  root.style.setProperty('--sheetH',h+'px');
  $('grab').setAttribute('aria-label', ui.sheet==='full' ? 'Réduire le panneau des réglages' : 'Agrandir le panneau des réglages');
}
function setSheet(s: string){ ui.sheet=s; app.dataset.sheet=s; applySheet(); }
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
function setFraming(on: boolean){
  on=!!on; if(on!==ui.framing){ ui.framing=on; if(on) CMS.intent.begin(); else CMS.intent.end(); }
  stageMode();
}

// Commandes du port de l'interface (src/core/port.ts) réalisées ici
onUi('applySheet', applySheet);

export {app, applySheet, isSheet, setFraming, setSheet, sheetHeights, stageMode, TWO_COL};
