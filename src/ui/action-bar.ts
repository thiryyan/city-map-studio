/* City Map Studio — Barre d'actions : étape suivante ou export (#118, issu de features.ts). */
import {$} from '../core/dom.js';
import {isSheet, setSheet} from './sheet.js';
import {ui} from '../core/doc/state.js';
import {showTab} from './panel.js';
// ---------- Barre d'actions : étape suivante ou export ----------
// Le bouton principal de la barre du bas mène à l'onglet visible suivant (même parcours que les boutons « Étape suivante »
// des onglets) ; sur le dernier onglet, il lance l'export et suit l'état du bouton d'export (désactivé s'il l'est).
CMS.define('actbar', () => {
  const NAMES: Record<string, string>={lieu:'le lieu',repere:'le repère',illus:'l\'illustration',textes:'les textes',style:'le style',export:'l\'export'};
  const SHORT: Record<string, string>={lieu:'Lieu',repere:'Repère',illus:'Illustration',textes:'Textes',style:'Style',export:'Export'};
  const tabs=()=>[...document.querySelectorAll<HTMLElement>('#tabs button')].filter(b=>!b.hidden).map(b=>b.dataset.tab!);
  /** Onglet visible qui suit l'onglet courant ; null sur le dernier */
  function next(){ const t=tabs(), i=t.indexOf(ui.tab); return i>=0 && i<t.length-1 ? t[i+1] : null; }
  function update(){
    const b=$('bNext'), n=next(), exp=!n;
    const pre=exp ? '' : 'Suivant : ', txt=exp ? 'Exporter' : SHORT[n!];   // « Suivant : » quand la barre est assez large (CSS)
    if($('bNextTxt').textContent!==txt) $('bNextTxt').textContent=txt;
    $('bNextPre').textContent=pre;
    b.setAttribute('aria-label', exp ? 'Exporter l\'affiche HD' : 'Étape suivante : '+NAMES[n!]);
    b.disabled=exp && $('bExport').disabled; b.dataset.act=exp?'export':'next';
  }
  function go(){
    const n=next();
    if(isSheet() && ui.sheet==='peek') setSheet('half');   // résultat de l'export ou onglet suivant : visibles
    if(!n){ $('bExport').click(); return; }
    showTab(n); document.querySelector<HTMLElement>('.tabbody')!.scrollTop=0;
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

