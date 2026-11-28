/* City Map Studio — Lecture et Modification ; « Que déplacer ? » (#82) (#118, issu de features.ts). */
import {$} from '../core/dom.js';
import {app, isSheet, setFraming} from './sheet.js';
import {setPlacing} from './shell.js';
import {st, ui} from '../core/doc/state.js';
// ---------- Lecture et Modification ; « Que déplacer ? » (#82) ----------
// Lecture (par défaut, mobile et ordinateur) : rien ne bouge sur l'affiche, ni carte, ni illustration, ni textes. Le verrou
// #shield couvre l'affiche ; le toucher (ou le bouton Modifier de la barre d'actions) ouvre la Modification. Une invitation
// visible (« Toucher pour modifier ») s'affiche aux deux premières utilisations.
// Modification : un seul choix actif à la fois (Carte · Repère · Illustration · Textes, selon le type d'affiche) ; ce qui
// est choisi reçoit les gestes, le reste est inerte (CSS `#app[data-intent]`, calque cadré de CMS.illus, gestes de l'image
// dans src/features/illustration.ts). Choix de départ : onglet Repère ou Illustration, sinon la zone touchée (carte ou illustration), sinon le
// calque cadré. « Textes » n'est jamais choisi d'office : c'est un interrupteur (un second toucher revient au choix d'avant).
// Le choix reste hors de l'état de l'affiche (pas d'historique, pas d'enregistrement).
CMS.define('intent', () => {
  const NAMES={map:'Carte',mark:'Repère',illus:'Illustration',text:'Textes'};
  const HINT_TOUCH: Record<string, string>={map:'Glissez · pincez pour zoomer', illus:'Glissez ou pincez l’illustration', text:'Glissez un texte pour le déplacer'};
  const HINT_MOUSE: Record<string, string>={map:'Glissez · molette pour zoomer', illus:'Glissez l’illustration · molette : taille', text:'Glissez un texte pour le déplacer'};
  const USES_KEY='cms3.editUses', HINT_USES=2;
  let sig='', shown=false, pending: string | null=null, prev='map';
  const uses=()=>{ try{ return parseInt(localStorage.getItem(USES_KEY)||'',10)||0; }catch(e){ return HINT_USES; } };
  const illusReady=()=>!!CMS.illus?.ready?.();
  const hasText=()=>{ const h=CMS.illus?.hitInfo; return !!(h && (h.title || h.foot)); };
  /** Choix proposés selon le type d'affiche : Illustration seule = image et textes ; sinon carte, repère, image (si importée), textes (s'il y a un bloc à déplacer) */
  function available(){
    const m=st.mode, a: string[]=[];
    if(m!=='illus') a.push('map','mark');
    if(m!=='map' && illusReady()) a.push('illus');
    if(hasText()) a.push('text');
    return a;
  }
  /** Choix par défaut : jamais « Textes » */
  const fallback=(a: string[])=>st.mode==='illus' && a.includes('illus') ? 'illus' : a.includes('map') ? 'map' : a.find((v: string)=>v!=='text') || 'map';
  /** Choix de départ : placement en cours, onglet Repère ou Illustration, zone touchée, calque cadré */
  function initial(a: string[]){
    if(ui.placing && a.includes('mark')) return 'mark';
    const v=({repere:'mark',illus:'illus'} as Record<string, string>)[ui.tab];
    if(v && a.includes(v)) return v;
    if(pending && a.includes(pending)) return pending;
    return CMS.illus?.layer?.()==='illus' && a.includes('illus') ? 'illus' : fallback(a);
  }
  /** Applique le choix : calque cadré, placement du repère. quiet : sans bulle d'information */
  function apply(v: string,quiet: boolean){
    if(ui.intent!==v && ui.intent!=='text') prev=ui.intent;
    ui.intent=v;
    if(st.mode==='mix' && v!=='text') CMS.illus.setLayer(v==='illus' ? 'illus' : 'map',quiet);   // Carte + illustration : calque cadré ; sinon il est imposé par le type d'affiche
    const wantPlacing=v==='mark';
    if(wantPlacing!==ui.placing) setPlacing(wantPlacing,0);
    sync(ui.framing);
  }
  /** Choix de l'utilisateur ; « Textes » touché alors qu'il est actif : retour au choix d'avant (interrupteur) */
  function set(v: string){
    const a=available(); if(!a.includes(v)) return;
    if(v===ui.intent){ if(v==='text') apply(a.includes(prev) && prev!=='text' ? prev : fallback(a),false); return; }
    apply(v,false);
  }
  /** Ouvre la Modification depuis un point de l'affiche (coordonnées écran) : la zone touchée donne le choix de départ */
  function enterAt(x: number,y: number){
    const P=$('poster').getBoundingClientRect(), G=ui.geomCss, px=x-P.left, py=y-P.top;
    const inR=(r?: {x: number; y: number; w: number; h: number})=>!!r && r.w>0 && px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h;
    pending = st.mode==='illus' ? 'illus' : st.mode==='mix' && illusReady() && inR(G?.illus) && !inR(G?.map) ? 'illus' : 'map';
    setFraming(true); pending=null;
  }
  /** Début de la Modification */
  function begin(){
    try{ localStorage.setItem(USES_KEY,String(uses()+1)); }catch(e){}
    prev='map'; apply(initial(available()),true);
  }
  /** Fin de la Modification : le placement du repère lancé depuis le sélecteur se termine avec elle */
  function end(){ if(ui.placing) setPlacing(false); ui.intent='map'; }
  /** Placement du repère terminé (ou lancé) pendant la Modification : le sélecteur suit */
  function placing(on: boolean){
    if(on) ui.intent='mark';
    else if(ui.intent==='mark') ui.intent=fallback(available());
    sync(ui.framing);
  }
  /** Invitation visible en Lecture, aux premières utilisations ; « Modifier » inactif quand rien ne peut bouger
   *  (Illustration sans image importée) */
  function hint(){
    const none=!ui.framing && !available().some(v=>v!=='text'), e=$('bEdit');
    if(!ui.framing){ e.disabled=none; e.title=none ? 'Importez d\u2019abord votre illustration (onglet Illustration)' : 'Modifier l\'affiche : déplacer la carte, l\'illustration, les textes, poser le repère'; }
    const h=$('shieldHint'), on=!ui.framing && uses()<HINT_USES;
    h.hidden=!on; if(on) h.querySelector('b')!.textContent=isSheet() ? 'Toucher pour modifier' : 'Cliquer pour modifier';
  }
  /** Contour de la zone de l'illustration (celle de la composition) quand « Illustration » est choisi */
  function frame(){
    const r=ui.geomCss?.illus, f=$('illusFrame'); if(!r) return;
    Object.assign(f.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});
  }
  /** Affichage : choix proposés, choix actif (radio ARIA), indication en haut de la scène. Un choix devenu impossible
   *  (texte replacé dans le gabarit, image retirée) est remplacé. Renvoie vrai si le sélecteur apparaît ou disparaît
   *  (le pied change de hauteur). */
  function sync(bar?: boolean){
    bar = bar===undefined ? ui.framing : !!bar;
    const was=shown, a=bar ? available() : [];
    if(bar && !a.includes(ui.intent)){
      const v=fallback(a);
      if(a.includes(v) && v!=='text') apply(v,true); else setFraming(false);   // plus rien à déplacer (image retirée) : retour en Lecture
      return was!==shown;
    }
    const H=matchMedia('(pointer:coarse)').matches ? HINT_TOUCH : HINT_MOUSE;
    const hint = ui.intent==='mark' ? $('placeHint').textContent : H[ui.intent] || H.map;
    if(bar) app.dataset.intent=ui.intent; else delete app.dataset.intent;
    if(bar && ui.intent==='illus') frame();
    const s=(bar?'1':'0')+a.join()+ui.intent+hint;
    if(s===sig) return false; sig=s;
    document.querySelectorAll<HTMLElement>('#intentSeg button').forEach(b=>{
      const v=b.dataset.v!, on=a.includes(v), cur=on && v===ui.intent; b.hidden=!on; b.setAttribute('aria-checked',String(cur)); b.tabIndex=cur ? 0 : -1;
    });
    if(bar && $('frameTxt').textContent!==hint) $('frameTxt').textContent=hint;
    $('intentBar').hidden=!bar; shown=!!bar;
    return was!==bar;
  }
  /** Pour les tests et la console : ouvre la Modification sur un choix */
  function open(v: string){ if(!ui.framing) setFraming(true); if(v && v!==ui.intent) set(v); }
  function init(){
    const seg=$('intentSeg');
    seg.addEventListener('click',e=>{ const b=(e.target as HTMLInputElement).closest('button'); if(b && !b.hidden) set(b.dataset.v!); });
    seg.addEventListener('keydown',e=>{   // motif ARIA des boutons radio : flèches, Début, Fin
      const bs=[...seg.querySelectorAll<HTMLElement>('button:not([hidden])')], i=bs.findIndex(x=>x.dataset.v===ui.intent);
      const j={ArrowRight:i+1,ArrowDown:i+1,ArrowLeft:i-1,ArrowUp:i-1,Home:0,End:bs.length-1}[e.key]; if(j==null) return;
      e.preventDefault(); const b=bs[(j+bs.length)%bs.length]; set(b.dataset.v!); b.focus();
    });
    // les blocs de texte, l'illustration, le type d'affiche et la mise en page changent les choix possibles ou le contour
    for(const ev of ['hits:placed','layer:synced','state:synced','layout:changed']) CMS.on(ev,()=>{ if(ui.framing){ sync(); if(ui.intent==='illus') frame(); } else hint(); });
    hint();
  }
  return {init, begin, end, placing, sync, set, open, enterAt, hint, available, NAMES};
});

