/* City Map Studio — Ambiance proposée au premier lancement (#59) (#118, issu de features.ts). */
import {$, h, pressed} from '../core/dom.js';
import {AMBIANCES, FONTS, THEMES} from '../content/config.js';
import {applyAmbiance} from '../features/presets.js';
import {thumb} from '../view/thumbnails.js';
// ---------- Ambiance au premier lancement ----------
// Proposée une seule fois : première visite sans affiche enregistrée, ni lien partagé ; après la demande d'accord.
const WELCOME_KEY='cms:welcomed';
let welcomeDone=true;
/** Au démarrage, une fois le stockage relu : première visite = ni proposition déjà vue, ni affiche enregistrée, ni lien partagé */
function initWelcome(hadDoc: boolean){
  let seen=true; try{ seen=!!localStorage.getItem(WELCOME_KEY); }catch(e){}
  welcomeDone=seen || hadDoc || /^#a=/.test(location.hash);
}
/** Premier lancement (#59) : une proposition d'ambiance non bloquante en tête des réglages, après l'éventuelle demande d'accord.
 *  L'affiche par défaut est visible tout de suite ; la proposition se ferme d'un toucher et ne revient plus, une fois fermée ou utilisée. */
function maybeWelcome(){
  try{ if(localStorage.getItem(WELCOME_KEY)) welcomeDone=true; }catch(e){}   // choix fait dans un autre onglet ou depuis le démarrage
  if(welcomeDone || !$('welStrip').hidden) return;
  if($('consent').classList.contains('show')) return;   // repris après le choix d'accord (giveConsent / declineConsent)
  const box=$('welAmb'); box.textContent='';
  AMBIANCES.forEach(([k,n])=>{ const b=h('button',{type:'button',dataset:{v:k},ariaPressed:'false'},h('canvas',{width:70,height:99}),h('small',{},n));
    b.onclick=()=>{ closeWelcome(false); applyAmbiance(k); box.querySelectorAll('button').forEach(x=>pressed(x,x===b)); }; box.appendChild(b); });
  const draw=()=>box.querySelectorAll('button').forEach(b=>{ const p=AMBIANCES.find(a=>a[0]===b.dataset.v)![2];
    thumb(b.querySelector('canvas')!,{layout:p.layout,colors:THEMES[p.theme].c,font:p.font,fontTitle:p.fontTitle,markerStyle:p.markerStyle}); });
  draw();
  // polices des ambiances : chargées une fois (fichiers locaux), puis vignettes redessinées
  Promise.all(AMBIANCES.flatMap(([,,p])=>[p.font,p.fontTitle].filter(Boolean)).flatMap(f=>FONTS[f].load).map(f=>document.fonts.load(f).catch(()=>0))).then(draw);
  $('welStrip').hidden=false; document.querySelector<HTMLElement>('.tabbody')!.scrollTop=0;
}
/** La proposition ne reviendra plus (utilisée ou fermée). hide=false : choix d'une ambiance, la proposition reste affichée
 *  pour en essayer d'autres jusqu'à sa fermeture */
function closeWelcome(hide=true){
  welcomeDone=true; try{ localStorage.setItem(WELCOME_KEY,'1'); }catch(e){}
  if(!hide) return;
  const s=$('welStrip'), had=s.contains(document.activeElement); s.hidden=true;
  if(had) document.querySelector<HTMLElement>('#tabs .on')?.focus();
}

export {closeWelcome, initWelcome, maybeWelcome, WELCOME_KEY, welcomeDone};
