/* City Map Studio — Voir l'affiche seule et loupe (#56, #90) (#118, issu de features.ts). */
import {$, h} from '../core/dom.js';
import {app, applySheet, setFraming, setSheet} from './sheet.js';
import {clamp, exportSpec} from '../core/geo/geo.js';
import {composePoster} from '../view/preview.js';
import {setPlacing} from './shell.js';
import {ui} from '../core/doc/state.js';
// ---------- Voir l'affiche seule (issue #56) ----------
// Masque tout ce qui recouvre l'aperçu (boutons flottants, « Toucher pour cadrer », légende, badges, voyant d'état) et
// le panneau des réglages (mobile et ordinateur) : l'affiche occupe toute la fenêtre, et tout l'écran là où le navigateur
// le permet (API Fullscreen ; pas sur iPhone, où la fenêtre suffit). Quitter le plein écran (Échap du navigateur) quitte ce mode. Une couche transparente reçoit le toucher de sortie, qui ne déplace donc
// pas la carte et ne pose aucun repère. Sortie aussi par Échap ou le bouton retour du système. Aucun état d'affiche modifié.
CMS.define('clean', () => {
  let before: string | null=null, pushed=false, full=false;
  const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement||null;
  function goFull(){
    const r=document.documentElement, req=r.requestFullscreen||r.webkitRequestFullscreen;
    if(!req || fsEl()) return;
    try{ const pr=req.call(r,{navigationUI:'hide'}); full=true; if(pr && pr.catch) pr.catch(()=>{ full=false; }); }catch(e){ full=false; }
  }
  function leaveFull(){
    if(!full) return; full=false;
    const ex=document.exitFullscreen||document.webkitExitFullscreen;
    if(fsEl() && ex){ try{ const pr=ex.call(document); if(pr && pr.catch) pr.catch(()=>{}); }catch(e){} }
  }
  function enter(){
    if(ui.clean) return;
    setPlacing(false); setFraming(false);
    before=ui.sheet; ui.clean=true; base=null; app.classList.add('clean'); applySheet(); goFull();
    const x=$('cleanExit'); x.hidden=false; x.classList.remove('hinted'); void x.offsetWidth; x.classList.add('hinted');
    try{ history.pushState({cmsClean:1},''); pushed=true; }catch(e){ pushed=false; }
    x.focus({preventScroll:true});
  }
  /** fromHistory : sortie déclenchée par le bouton retour (l'entrée d'historique est déjà retirée) */
  function exit(fromHistory: boolean){
    if(!ui.clean) return;
    resetZoom();
    ui.clean=false; app.classList.remove('clean'); $('cleanExit').hidden=true; leaveFull();
    if(before) setSheet(before); before=null;
    if(pushed && !fromHistory){ pushed=false; try{ if(history.state?.cmsClean) history.back(); }catch(e){} }
    pushed=false;
    $('bClean').focus({preventScroll:true});
  }
  // ---------- Loupe (#90) : pincer, double toucher, molette ou + / − agrandissent l'affiche jusqu'à × 4 ; un rendu net
  // (composePoster, au plus à la taille d'export) remplace l'aperçu agrandi. Hors zoom, un toucher (simple) ramène aux réglages.
  const ZMAX=4;
  /** Position de l'affiche et de la scène (px), relevée par measure() */
  let z=1, tx=0, ty=0, base: {x: number; y: number; w: number; h: number; W: number; H: number; sx: number; sy: number} | null=null, gen=0, busy=false, sharpUrl='', tapT=0, lastTap=0;
  const pts=new Map<number, {x: number; y: number}>(); let g0: {p?: {x: number; y: number}; d?: number; z?: number; c?: {x: number; y: number}} | null=null, moved=false;
  const poster=()=>$('poster');
  function measure(){
    poster().style.transform=''; const P=poster().getBoundingClientRect(), S=$('stage').getBoundingClientRect();
    base={x:P.left-S.left, y:P.top-S.top, w:P.width, h:P.height, W:S.width, H:S.height, sx:S.left, sy:S.top};
  }
  function apply(){
    const on=z>1.001, p=poster();
    p.style.transformOrigin='0 0'; p.style.transform=on ? `translate(${tx}px,${ty}px) scale(${z})` : '';
    app.classList.toggle('zoomed',on); $('cleanZoom').hidden=!on;
    if(on) sharpen();
  }
  /** Bornes : l'affiche agrandie couvre l'écran dans le sens où elle le dépasse, et reste centrée dans l'autre */
  function bound(){
    if(z<=1.001){ z=1; tx=ty=0; return; }
    const w=base!.w*z, h=base!.h*z;
    const x0=w<=base!.W ? (base!.W-w)/2 : clamp(base!.x+tx,base!.W-w,0), y0=h<=base!.H ? (base!.H-h)/2 : clamp(base!.y+ty,base!.H-h,0);
    tx=x0-base!.x; ty=y0-base!.y;
  }
  /** Zoom autour d'un point de la scène (px, py) : ce point reste sous le doigt */
  function zoomAt(nz: number, px?: number, py?: number){
    if(!base) measure();
    nz=clamp(nz,1,ZMAX); if(px==null || py==null){ px=base!.W/2; py=base!.H/2; }
    const x0=base!.x+tx, y0=base!.y+ty;
    tx=px-(px-x0)*nz/z-base!.x; ty=py-(py-y0)*nz/z-base!.y; z=nz; bound(); apply();
  }
  function pan(dx: number,dy: number){ tx+=dx; ty+=dy; bound(); apply(); }
  /** Rendu net de l'affiche entière, une fois par passage en Aperçu (rien ne change pendant ce mode) */
  async function sharpen(){
    if(sharpUrl || busy) return;
    busy=true; const my=gen, badge=$('zoomSharpBadge'); badge.hidden=false;
    try{
      const spec=exportSpec(), W=Math.min(spec.W,Math.round(base!.w*(window.devicePixelRatio||1)*ZMAX)), H=Math.round(W*spec.H/spec.W);
      const r=await composePoster(W,H);
      const blob=await new Promise<Blob | null>(res=>r.canvas.toBlob(res,'image/jpeg',0.92)); r.canvas.width=r.canvas.height=0;
      if(my!==gen || !blob) return;
      sharpUrl=URL.createObjectURL(blob);
      const im=h('img',{className:'zoomsharp',id:'zoomSharp',alt:'',src:sharpUrl}); im.setAttribute('aria-hidden','true'); poster().append(im);
    } catch(e){ /* l'aperçu agrandi reste affiché */ }
    finally{ if(my===gen){ busy=false; badge.hidden=true; } }
  }
  function resetZoom(){
    gen++; busy=false; z=1; tx=ty=0; base=null; pts.clear(); clearTimeout(tapT);
    poster().style.transform=''; app.classList.remove('zoomed'); $('cleanZoom').hidden=true; $('zoomSharpBadge').hidden=true;
    $('zoomSharp')?.remove(); if(sharpUrl){ URL.revokeObjectURL(sharpUrl); sharpUrl=''; }
  }
  function initZoom(){
    const el=$('cleanExit'), loc=(e: PointerEvent | WheelEvent)=>({x:e.clientX-base!.sx, y:e.clientY-base!.sy});
    el.addEventListener('pointerdown',e=>{
      if(!base) measure();
      el.setPointerCapture(e.pointerId); pts.set(e.pointerId,loc(e));
      if(pts.size===1){ moved=false; g0={p:loc(e)}; }
      if(pts.size===2){ const [a,b]=[...pts.values()]; g0={d:Math.hypot(a.x-b.x,a.y-b.y)||1, z, c:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}; moved=true; }
    });
    el.addEventListener('pointermove',e=>{
      if(!pts.has(e.pointerId)) return;
      const prev=pts.get(e.pointerId), p=loc(e); pts.set(e.pointerId,p);
      if(pts.size>=2 && g0?.d){ const [a,b]=[...pts.values()], c={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        zoomAt(g0.z!*Math.hypot(a.x-b.x,a.y-b.y)/g0.d,c.x,c.y); return; }
      if(g0?.p && Math.hypot(p.x-g0.p.x,p.y-g0.p.y)>6) moved=true;
      if(moved && z>1.001) pan(p.x-prev!.x,p.y-prev!.y);
    });
    const end=(e: PointerEvent)=>{
      if(!pts.has(e.pointerId)) return; const p=pts.get(e.pointerId)!; pts.delete(e.pointerId);
      if(pts.size) return;
      if(moved || e.type==='pointercancel'){ moved=false; return; }
      // toucher : double = zoom × 2,5 au point (ou retour à l'écran) ; simple, hors zoom = retour aux réglages
      const now=Date.now();
      if(now-lastTap<300){ clearTimeout(tapT); lastTap=0; if(z>1.05) zoomAt(1); else zoomAt(2.5,p.x,p.y); }
      else { lastTap=now; tapT=setTimeout(()=>{ if(z<=1.001 && ui.clean) exit(false); },300); }
    };
    el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
    el.addEventListener('wheel',e=>{ e.preventDefault(); if(!base) measure(); const p=loc(e); zoomAt(z*Math.exp(-e.deltaY*0.0015),p.x,p.y); },{passive:false});
    // clavier : + / − / 0, flèches quand l'affiche est agrandie ; Entrée ou Espace : retour aux réglages
    el.addEventListener('keydown',e=>{
      const step=0.15*(base?.W||300), d=({ArrowLeft:[step,0],ArrowRight:[-step,0],ArrowUp:[0,step],ArrowDown:[0,-step]} as Record<string, number[]>)[e.key];
      if(e.key==='+'||e.key==='='){ zoomAt(z*1.5); } else if(e.key==='-'){ zoomAt(z/1.5); } else if(e.key==='0'){ zoomAt(1); }
      else if(d && z>1.001) pan(d[0],d[1]); else return;
      e.preventDefault();
    });
    el.addEventListener('click',e=>{ if(e.detail===0) exit(false); });   // le pointeur est traité par pointerup (simple ou double toucher)
    $('bZoomFit').onclick=()=>{ zoomAt(1); el.focus({preventScroll:true}); };
    $('bZoomExit').onclick=()=>exit(false);
    addEventListener('resize',()=>{ if(ui.clean && z>1.001){ const k=z; measure(); z=1; tx=ty=0; zoomAt(k); } else base=null; });
  }
  function init(){
    $('bClean').onclick=enter;
    initZoom();
    addEventListener('popstate',()=>{ if(ui.clean) exit(true); });
    addEventListener('keydown',e=>{ if(e.key==='Escape' && ui.clean){ e.preventDefault(); exit(false); } });
    const onFs=()=>{ if(!fsEl() && full){ full=false; if(ui.clean) exit(false); } };   // plein écran quitté par le navigateur
    document.addEventListener('fullscreenchange',onFs); document.addEventListener('webkitfullscreenchange',onFs);
  }
  return {enter, exit, init, zoomAt, get zoom(){ return z; }, get sharp(){ return !!sharpUrl; }};
});

