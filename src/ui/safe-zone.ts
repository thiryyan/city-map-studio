/* City Map Studio — Zone de sécurité pour l'impression maison (#60) (#118, issu de features.ts). */
import {$} from '../core/dom.js';
import {exportSpec} from '../core/geo/geo.js';
import {scheduleOver} from '../view/preview.js';
import {ui} from '../core/doc/state.js';
// ---------- Zone de sécurité pour l'impression maison (issue #60) ----------
// Trait pointillé à 5 mm du bord, dans l'aperçu seulement (élément HTML posé sur l'affiche : jamais dans l'export).
// Les textes et repères relevés pendant le rendu de l'aperçu (CMS.ink) qui entrent dans cette bande sont signalés.
// Réglage de l'appareil, hors de l'état de l'affiche (comme A− / A+).
CMS.define('safe', () => {
  const KEY='cms:safeZone', MM=5;
  const LABELS: Record<string, string>={title:'le titre',subtitle:'le sous-titre',coords:'les coordonnées',dedication:'la dédicace',names:'les noms',date:'la date',
    legend:'la légende',marker:'un repère',attribution:'la mention des sources',text:'un texte'};
  let on=(()=>{ try{ return localStorage.getItem(KEY)==='1'; }catch(e){ return false; } })(), prev='';
  /** Bande de sécurité en px pour une affiche de largeur w px (le format donne la largeur en mm, orientation comprise) */
  const inset=(w: number)=>MM/exportSpec().mm[0]*w;
  function layout(){
    const g=$('safeGuide'); g.hidden=!on; if(!on) return;
    const i=inset(ui.posterCss.w)+'px'; Object.assign(g.style,{top:i,left:i,right:i,bottom:i});
  }
  function check(boxes: {k: string; x1: number; y1: number; x2: number; y2: number}[] | null,W: number,H: number){
    let msg='', warn=false;
    if(on && boxes){
      const i=inset(W)-0.5, out=[...new Set(boxes.filter(b=>b.x2>b.x1 && (b.x1<i || b.y1<i || b.x2>W-i || b.y2>H-i)).map(b=>LABELS[b.k]||LABELS.text))];
      warn=out.length>0;
      // 10 × 15 cm : la mention des sources reste dans la bande même à la marge maximale (12 % de 10 cm × 0,38 < 5 mm)
      const smallAttr=out.includes(LABELS.attribution) && exportSpec().key==='10x15', rest=out.filter(x=>!(smallAttr && x===LABELS.attribution));
      const list=out.length>1?out.slice(0,-1).join(', ')+' et '+out[out.length-1]:out[0];
      msg = !warn ? 'Textes et repères dans la zone imprimable.'
        : `⚠ Trop près du bord pour une imprimante de bureau : ${list}.`
          +(rest.length?' Augmentez la marge (onglet Style) ou réduisez la taille de ces textes.':'')
          +(smallAttr?' Sur ce petit format, la mention des sources reste dans la marge basse : imprimez « sans marge » (papier photo) ou confiez le tirage à un laboratoire photo.':'');
    }
    if(msg===prev) return; prev=msg;
    const n=$('safeWarn'); n.textContent=msg; n.className=warn?'fitnote':'hint';
  }
  function init(){
    $('safeTog').checked=on;
    $('safeTog').onchange=e=>{ on=(e.target as HTMLInputElement).checked; try{ on ? localStorage.setItem(KEY,'1') : localStorage.removeItem(KEY); }catch(_){} layout(); scheduleOver(); };
    layout();
  }
  return {get on(){ return on; }, layout, check, init};
});

