/* City Map Studio — Comparer avant / après un changement (#63 ; sorti de l'interface au #118). */
import {$} from '../core/dom.js';
import {THEMES} from '../content/config.js';
import {commitHistory} from '../core/doc/history.js';
import {drawTexture, drawUnder, layoutPreview, renderMap, scheduleOver} from '../view/preview.js';
import {mlRestyle} from '../map/engines.js';
import {st, ui} from '../core/doc/state.js';
import {loadFonts} from '../render/fonts.js';
import {applySheet} from '../core/port.js';
/** Dernier changement « comparable » (issue #63) : thème ou palette, ambiance, modèle de texte, effet de tracé, ornement,
 *  plis, papier. On retient les seuls champs modifiés (valeurs d'avant et d'après) : le bouton disparaît dès que l'un
 *  d'eux change de nouveau (autre choix, retouche, annulation), mais pas pour une autre modification (titre, cadrage).
 *  Un appui maintenu sur « Comparer » montre l'affiche avec les valeurs d'avant ; le relâcher rétablit les valeurs
 *  choisies, à l'identique. Ni l'état enregistré ni l'historique ne voient l'aperçu. Moteur et cadrage ne sont jamais
 *  comparés : ils relanceraient des requêtes réseau ou n'apporteraient rien. */
const COMPARE = CMS.define('compare', () => {
  const CMP_SKIP=new Set(['engine','center','zoom','marker','active','place2']);
  type Cmp = {keys: string[]; vals: Record<string, unknown>; after: string; pick: (o: Record<string, unknown>)=>string; button: string; badge: string};
  let cmp: Cmp | null=null;
  const S=()=>st as Record<string, any>;
  /** Instantané à prendre juste avant le changement */
  const cmpSnap=()=>JSON.parse(JSON.stringify(st));
  /** À appeler juste après le changement : before (cmpSnap), label (badge « Avant … » et bouton), ou {theme:true} */
  function noteChange(before: Record<string, any>,label: string | {theme: boolean}){
    const keys=Object.keys(st).filter(k=>!CMP_SKIP.has(k) && JSON.stringify(before[k])!==JSON.stringify(S()[k]));
    if(!keys.length) return;   // même choix reconfirmé : la comparaison précédente reste valable
    const pick=(o: Record<string, unknown>)=>JSON.stringify(keys.map(k=>o[k]));
    const vals: Record<string, unknown>={}; for(const k of keys) vals[k]=before[k];
    const name=typeof label==='object' && label.theme ? themeName(before) : '';
    cmp={keys,vals,after:pick(st),pick,
      button: name ? `Maintenir pour comparer avec « ${name} »` : `Maintenir pour comparer : avant ${label}`,
      badge: name ? 'Avant · '+name : 'Avant '+label};
    updateCompare();
  }
  /** Libellé d'un effet, d'un ornement ou des plis : « l'effet « Lueur » », « le retrait de « Lueur » » */
  function fxLabel(el: HTMLInputElement,k: string){
    if(k==='folds') return el.checked ? 'les plis' : 'le retrait des plis';
    const n=(el.closest('label')?.textContent||k).trim().replace(/\s*\(.*\)$/,''), what=`${k.startsWith('orn.')?'l\'ornement':'l\'effet'} « ${n} »`;
    return el.checked ? what : 'le retrait de '+what;
  }
  const compareAvailable=()=>!!cmp && cmp.after===cmp.pick(ui.comparing?{...st,...ui.cmpKeep}:st);
  const themeName=(t: Record<string, any>)=>THEMES[t.theme] && JSON.stringify(THEMES[t.theme].c)===JSON.stringify(t.colors) ? THEMES[t.theme].name : 'couleurs précédentes';
  function updateCompare(){
    const b=$('bCompare'), ok=compareAvailable(), was=!b.hidden;
    b.hidden=!ok; if(!ok) cmp=null;   // champs modifiés depuis : comparaison périmée
    else { b.querySelector<HTMLElement>('.cmpTxt')!.textContent=cmp!.button; b.title=cmp!.button; }
    if(was!==ok && ui.sheet==='peek') applySheet();   // bouton dans le pied du panneau
  }
  CMS.on('state:saved',updateCompare);
  function compareBefore(on: boolean){
    if(on===!!ui.comparing) return;
    if(on && !compareAvailable()) return;
    if(on){ commitHistory(0); ui.cmpKeep={}; for(const k of cmp!.keys){ ui.cmpKeep[k]=S()[k]; S()[k]=JSON.parse(JSON.stringify(cmp!.vals[k])); } }
    else { Object.assign(st,ui.cmpKeep); ui.cmpKeep=null; }
    ui.comparing=on;
    const b=$('bCompare'); b.setAttribute('aria-pressed',String(on)); b.classList.toggle('on',on);
    const badge=$('cmpBadge'); badge.hidden=!on; if(on) badge.textContent=cmp!.badge;
    // rendu seulement : rien n'est enregistré (saveState est inactif pendant la comparaison)
    ui.snap=null; layoutPreview(); drawUnder(); drawTexture(); mlRestyle(); renderMap(false); scheduleOver();
    loadFonts().then(()=>scheduleOver());
  }
  function initCompare(){
    const b=$('bCompare'), stop=()=>compareBefore(false);
    b.addEventListener('pointerdown',e=>{ if(e.button) return; e.preventDefault(); b.setPointerCapture(e.pointerId); compareBefore(true); });
    b.addEventListener('pointerup',stop); b.addEventListener('pointercancel',stop); b.addEventListener('lostpointercapture',stop);
    b.addEventListener('keydown',e=>{ if((e.key===' '||e.key==='Enter') && !e.repeat){ e.preventDefault(); compareBefore(true); } });
    b.addEventListener('keyup',e=>{ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); stop(); } });
    b.addEventListener('blur',stop); b.addEventListener('contextmenu',e=>e.preventDefault());   // appui long sur mobile : pas de menu
    addEventListener('blur',stop); document.addEventListener('visibilitychange',stop);
  }
  return {snap:cmpSnap,note:noteChange,update:updateCompare,hold:compareBefore,init:initCompare,fxLabel};
});

const {snap: cmpSnap, note: noteChange, update: updateCompare, hold: compareBefore, init: initCompare} = COMPARE;

export {cmpSnap, COMPARE, compareBefore, initCompare, noteChange, updateCompare};
