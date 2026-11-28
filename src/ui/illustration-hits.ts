/* City Map Studio — Zones de prise des textes (aperçu) : glisser, clavier, chevauchements (extrait de features/illustration.ts, #119). */
import {$, toast} from '../core/dom.js';
import {saveState, st, ui} from '../core/doc/state.js';
import {type Pt} from '../content/config.js';
import {update} from '../core/doc/store.js';
import {scheduleOver} from '../view/preview.js';
import {clamp} from '../core/geo/geo.js';
import {Ctx, Opts} from '../core/illustration-state.js';
import {posOf, textLayout} from '../render/illustration-text.js';
import {syncText} from './illustration-text.js';
import {IS, hooks} from '../core/illustration-state.js';
const C = CMS.illusConf;

export function noteLayout(ctx: Ctx, PW: number, PH: number, B: Opts, avoid?: Opts | null){
  if(ctx.canvas!==$<HTMLCanvasElement>('cvOver')) return;   // seulement l'aperçu (ni l'export, ni les vignettes)
  const fr=(r: Opts)=>r && {x:r.x/PW, y:r.y/PH, w:r.w/PW, h:r.h/PH};
  IS.hitInfo={};
  for(const k of ['title','foot']){ const b=B?.[k]; IS.hitInfo[k]=b ? {...fr(b.rect),area:fr(b.area),kind:b.kind,fixed:!!b.fixed,env:b.env,onMap:!!b.onMap} : null; }
  // Chevauchements : bloc du bas sur le titre ; texte sur la carte (médaillon, fondu) quand il n'y est pas posé exprès
  const inter=(a?: Opts | null,b?: Opts | null)=>a && b && a.x<b.x+b.w && b.x<a.x+a.w && a.y<b.y+b.h && b.y<a.y+a.h;
  const map=avoid && fr(avoid), msgs=[];
  if(inter(IS.hitInfo.title,IS.hitInfo.foot)) msgs.push('les lignes du bas chevauchent le titre');
  if(!IS.hitInfo.title?.onMap && !IS.hitInfo.title?.fixed && inter(IS.hitInfo.title,map)) msgs.push('le titre déborde sur la carte');
  if(!IS.hitInfo.foot?.onMap && inter(IS.hitInfo.foot,map)) msgs.push('les lignes du bas débordent sur la carte');
  const w=$('textWarn'); if(w){ const t=msgs.length ? '⚠ '+msgs.join(' ; ')+'.' : ''; if(w.textContent!==t) w.textContent=t; }
  placeHits();
}
hooks.note=noteLayout;   // le rendu (src/render/illustration-draw.ts) signale la mise en page à l'aperçu par ce crochet
/** Zones de prise au-dessus des deux blocs de texte (aperçu) : 44 px de haut au moins, marge pour le doigt */
export function placeHits(){
  const P=ui.posterCss;
  for(const k of ['title','foot']){
    const el=$(k==='title'?'hitTitle':'hitFoot'), r=IS.hitInfo?.[k];
    el.hidden=!r; if(!r) continue;
    const pad=6, w=r.w*P.w+2*pad, h=Math.max(44,r.h*P.h+2*pad), cy=(r.y+r.h/2)*P.h;
    Object.assign(el.style,{left:(r.x*P.w-pad)+'px',top:(cy-h/2)+'px',width:w+'px',height:h+'px'});
    el.classList.toggle('fixed',r.fixed);
  }
  CMS.emit('hits:placed');   // le choix « Textes » du mode Cadrer n'existe que s'il y a un bloc à déplacer
}
export const setFree=(k: string,p: Pt | null)=>{update(()=>{ if(k==='title') posOf().free=p; else posOf().ffree=p; scheduleOver(); });};
/** Centre actuel d'un bloc, en fraction de sa zone */
export function centerOf(k: string){ const r=IS.hitInfo![k], A=r.area; return {x:(r.x+r.w/2-A.x)/A.w, y:(r.y+r.h/2-A.y)/A.h}; }
/** Fin d'un déplacement : aimantation sur les positions prédéfinies (et « Auto » pour le bloc du bas) */
export function snapToPreset(k: string){return update(()=>{
  const T=posOf(), c=k==='title' ? T.free : T.ffree, I=IS.hitInfo?.[k]; if(!c || !I) return;
  if(I.kind==='band'){   // bande de la vignette : gauche, centre, droite
    const i=[0,0.5,1].findIndex(v=>Math.abs(c.x-v)<0.04); if(i<0) return;
    if(k==='title'){ T.pos=T.pos[0]+'gcd'[i]; T.free=null; } else { T.fpos=(T.fpos==='auto'?'b':T.fpos[0])+'gcd'[i]; T.ffree=null; }
    return;
  }
  const cv=$<HTMLCanvasElement>('cvOver'), ctx=cv.getContext('2d')!, A=I.area, W=A.w*cv.width, H=A.h*cv.height, U=Math.min(cv.width,cv.height);
  const cands=k==='title' ? C.POS.map((p: string)=>[p,{free:null,pos:p}]) : [...(st.mode==='map' ? [] : [['auto',{ffree:null,fpos:'auto'}]]),...C.POS.map((p: string)=>[p,{ffree:null,fpos:p}])];   // Carte : « Auto » = gabarit, pas une cible
  for(const [,over] of cands){
    const b=textLayout(ctx,W,H,U,over,I.env)[k]; if(!b) continue;
    if(Math.hypot((b.rect.x+b.rect.w/2)/W-c.x,(b.rect.y+b.rect.h/2)/H-c.y)<0.04){ Object.assign(T,over); return; }
  }
});}
export function initHits(){
  let tdrag: {k: string; id: number; x: number; y: number; c: {x: number; y: number}; moved: boolean} | null=null;
  for(const k of ['title','foot']){
    const el=$(k==='title'?'hitTitle':'hitFoot');
    el.addEventListener('pointerdown',e=>{
      if(e.button>0 || !IS.hitInfo?.[k]) return;
      e.preventDefault(); e.stopPropagation(); el.focus({preventScroll:true});
      if(IS.hitInfo[k].fixed){ toast('Titre en arc : il suit la forme de la carte. Placez-le au-dessus ou au-dessous avec la grille (onglet Textes).'); return; }
      el.setPointerCapture(e.pointerId);
      tdrag={k,id:e.pointerId,x:e.clientX,y:e.clientY,c:centerOf(k),moved:false}; el.classList.add('dragging');
    });
    el.addEventListener('pointermove',e=>{
      if(!tdrag || tdrag.id!==e.pointerId) return;
      const I=IS.hitInfo![k], A=I.area, P=ui.posterCss;
      let x=tdrag!.c.x+(e.clientX-tdrag!.x)/(A.w*P.w), y=tdrag!.c.y+(e.clientY-tdrag!.y)/(A.h*P.h);
      if(Math.abs(x-0.5)<0.02) x=0.5; if(Math.abs(y-0.5)<0.02) y=0.5;   // aimantation sur les axes centraux
      if(I.kind==='band') y=0.5;   // vignette : déplacement horizontal dans la bande
      if(Math.hypot(e.clientX-tdrag!.x,e.clientY-tdrag!.y)>3) tdrag!.moved=true;
      if(tdrag!.moved) setFree(k,{x:clamp(x,0,1),y:clamp(y,0,1)});
    });
    const end=(e: PointerEvent)=>{ if(!tdrag || tdrag.id!==e.pointerId) return; const moved=tdrag.moved; tdrag=null; el.classList.remove('dragging');
      if(moved){ snapToPreset(k); syncText(); scheduleOver(); saveState(); } };
    el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
    // Clavier : flèches = 1 % de la zone (Maj : 5 %) ; Origine = retour à la grille ; Échap = sortie
    el.addEventListener('keydown',e=>{
      if(!IS.hitInfo?.[k]) return;
      const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
      if(d && IS.hitInfo[k].fixed) return;
      if(d){ const s=e.shiftKey?0.05:0.01, c=centerOf(k), T=posOf(), cur=(k==='title'?T.free:T.ffree)||c;
        setFree(k,{x:clamp(cur.x+d[0]*s,0,1),y:IS.hitInfo[k].kind==='band'?0.5:clamp(cur.y+d[1]*s,0,1)}); syncText(); saveState(); }
      else if(e.key==='Home'){ update(()=>{ if(k==='title') Object.assign(posOf(),{free:null},st.mode==='map'?{pos:'auto'}:{}); else Object.assign(posOf(),{ffree:null,fpos:'auto'}); }); syncText(); scheduleOver(); saveState(); }
      else if(e.key==='Escape') el.blur();
      else return;
      e.preventDefault();
    });
  }
}
