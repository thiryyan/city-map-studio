/* City Map Studio — Aperçu à l'écran, deux lieux, gestes, papier, composition complète, aperçu au mur.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html. */
'use strict';
// ---------- Aperçu ----------
const $=id=>document.getElementById(id);
/** Crée un élément sans innerHTML : h('button', {type:'button', className:'card', dataset:{v:k}, style:{…}}, enfant, 'texte').
 *  Les textes sont insérés comme texte (jamais interprétés) et les styles passent par le CSSOM (compatibles avec la CSP). */
function h(tag,props={},...kids){
  const e=document.createElement(tag);
  for(const [k,v] of Object.entries(props)){
    if(k==='dataset') Object.assign(e.dataset,v); else if(k==='style') Object.assign(e.style,v);
    else if(k in e && !k.includes('-')) e[k]=v; else e.setAttribute(k,v);
  }
  e.append(...kids.filter(x=>x!=null)); return e;
}
const cvU=$('cvUnder'), cvO=$('cvOver'), cvT=$('cvTex'), vecC=$('vecCanvas'), slot=$('slot'), poster=$('poster'), stage=$('stage');
function layoutPreview(){
  const SW=stage.clientWidth, SH=stage.clientHeight, small=innerWidth<900;
  const pad = small ? (SH<260 ? 8 : 14) : 36, FAB=54;
  const RATIO=ratio(), fit=(aw,ah)=>Math.min(aw,ah/RATIO);
  // Boutons flottants : à droite ou en bas, selon ce qui laisse l'affiche la plus grande ; masqués si l'aperçu est une vignette
  let mode='side', w;
  if(!small) w=fit(SW-pad*2,SH-pad*2);
  else if(SH<250){ mode='none'; w=fit(SW-pad*2,SH-pad*2); }
  else{ const side=SH>=264?fit(SW-pad*2-FAB,SH-pad*2):0, bot=fit(SW-pad*2,SH-pad*2-FAB); if(bot>side+1){ mode='bottom'; w=bot; } else w=side; }
  stage.dataset.fab=mode;
  w=Math.max(60,w); const h=w*RATIO;
  if(mode==='bottom') poster.style.marginBottom=FAB+'px'; else poster.style.marginBottom='';
  if(mode==='side') poster.style.marginRight=FAB+'px'; else poster.style.marginRight='';
  ui.posterCss={w,h}; ui.dpr=Math.min(window.devicePixelRatio||1,3);
  poster.style.width=w+'px'; poster.style.height=h+'px';
  for(const cv of [cvU,cvO,cvT]){ cv.width=Math.round(w*ui.dpr); cv.height=Math.round(h*ui.dpr); }
  const G=geom(st,w,h), g=G.map; ui.slotCss=g; ui.geomCss=G;
  const clip=g.shape && g.shape!=='circle' ? `path('${shapeD(g.shape,g.w,g.h)}')` : '';
  Object.assign(slot.style,{left:g.x+'px',top:g.y+'px',width:g.w+'px',height:g.h+'px',clipPath:clip});
  Object.assign($('shield').style,{left:g.x+'px',top:g.y+'px',width:g.w+'px',height:g.h+'px',borderRadius:g.circle?'50%':'',clipPath:clip});
  $('shield').classList.toggle('mini',g.w<170);
  slot.classList.toggle('circle',!!g.circle);
  // Deux lieux : la vue non éditée est une image figée ; la toucher la rend éditable
  const other=G.rects ? G.rects[1-(st.active||0)] : null, ps=$('placeSwitch');
  ps.hidden=!other; if(other){ Object.assign(ps.style,{left:other.x+'px',top:other.y+'px',width:other.w+'px',height:other.h+'px'}); ps.querySelector('span').textContent=`Modifier le lieu ${2-(st.active||0)}`; ps.classList.toggle('mini',other.w<170); }
  if(G.sky) ensureSky();
  drawTexture();
  vecC.width=Math.round(g.w*ui.dpr); vecC.height=Math.round(g.h*ui.dpr);
  drawUnder(); renderMap(true);
}
function drawUnder(){
  const ctx=cvU.getContext('2d'), g=drawPoster(ctx,cvU.width,cvU.height,'under');
  if(g.rects){   // vue figée du lieu non édité
    const r=g.rects[1-(st.active||0)];
    ctx.save(); clipMap(ctx,r); ctx.fillStyle=st.colors.land; ctx.fillRect(r.x,r.y,r.w,r.h);
    if(ui.snap && ui.snap.key===snapKey()) ctx.drawImage(ui.snap.canvas,r.x,r.y,r.w,r.h); else scheduleSnap();
    ctx.restore();
  }
}
// ---------- Deux lieux : image de la vue non éditée ----------
function otherView(){ return st.place2 || {center:{...st.center},zoom:st.zoom,marker:{...st.marker}}; }
function snapKey(){ const r=ui.geomCss?.rects?.[1-(st.active||0)]; return JSON.stringify([st.engine,otherView(),st.colors,st.stroke,st.waterMult,st.layers,r&&Math.round(r.w),r&&Math.round(r.h),!!osmData]); }
let snapT=0, snapBusy=false;
function scheduleSnap(){ clearTimeout(snapT); snapT=setTimeout(makeSnap,250); }
async function makeSnap(){
  const G=ui.geomCss; if(!G?.rects || snapBusy) return;
  const r=G.rects[1-(st.active||0)], key=snapKey(), w=Math.round(r.w*ui.dpr), h=Math.round(r.h*ui.dpr);
  snapBusy=true;
  try{ const canvas=await renderView(otherView(),w,h); if(canvas){ ui.snap={canvas,key}; drawUnder(); } }
  catch(e){ console.warn('vue figée',e); } finally{ snapBusy=false; }
}
/** Carte d'une vue quelconque, à la taille demandée (px) : MapLibre hors écran, ou vecteurs du moteur Fichier */
async function renderView(view,wPx,hPx){
  if(st.engine==='maplibre'){ if(mlLib!=='ok' || !consent) return null; return (await renderMaplibreOffscreen(wPx,hPx,view)).canvas; }
  if(!osmData) return null;
  const cv=document.createElement('canvas'); cv.width=wPx; cv.height=hPx; const c=cv.getContext('2d');
  c.fillStyle=st.colors.land; c.fillRect(0,0,wPx,hPx); drawVectors(c,{x:0,y:0,w:wPx,h:hPx},osmData,view); return cv;
}
/** Change le lieu édité (gabarit Deux lieux) : la carte interactive passe sur l'autre cadre */
function setActivePlace(i){
  if(st.layout!=='diptych' || i===(st.active||0)) return;
  const cur={center:st.center,zoom:st.zoom,marker:st.marker}, o=otherView();
  st.center=o.center; st.zoom=o.zoom; st.marker=o.marker; st.place2=cur; st.active=i; ui.snap=null;
  setSeg('placeSeg',String(i)); syncZoomUI(); updateMarkerTxt();
  layoutPreview(); if(mlMap) mlRestyle(); saveState();
  toast(`Lieu ${i+1} : cadrez la carte et placez son repère`);
}
function drawOver(){ const ctx=cvO.getContext('2d'); ctx.clearRect(0,0,cvO.width,cvO.height); fitSink={}; drawPoster(ctx,cvO.width,cvO.height,'over'); const fit=fitSink; fitSink=null; showFit(fit); describePoster(); }
/** Texte de remplacement de l'aperçu (lecteurs d'écran) : gabarit, thème, orientation et textes affichés */
function describePoster(){
  const lay=(LAYOUTS.find(l=>l[0]===st.layout)||[,''])[1], th=THEMES[st.theme]?.name||'personnalisé';
  const txt=['title','subtitle','dedication','names','date'].map(textLine).filter(Boolean).join(', ');
  const d=`Aperçu de l'affiche, gabarit ${lay}, thème ${th}, ${st.orient==='landscape'?'paysage':'portrait'}${txt?' : '+txt:''}`;
  if(cvO.getAttribute('aria-label')!==d) cvO.setAttribute('aria-label',d);
}
/** Signale dans l'onglet Textes les lignes réduites automatiquement pour tenir dans l'affiche */
const FIT_NAMES={title:'titre',subtitle:'sous-titre',coords:'coordonnées',dedication:'dédicace',names:'noms',date:'date'};
let fitPrev='';
function showFit(fit){
  const key=JSON.stringify(fit); if(key===fitPrev) return; fitPrev=key;
  for(const k of Object.keys(FIT_NAMES)){ const o=$('oTs-'+k); if(!o) continue; const f=fit[k];
    o.classList.toggle('shrunk',!!f); o.title = f ? `Réduit à ${Math.round(f*100)} % pour tenir dans l'affiche` : ''; }
  syncOutputs();
  const ks=Object.keys(fit);
  $('fitNote').textContent = ks.length ? '↘ Réduit pour tenir dans l\'affiche : '+ks.map(k=>`${FIT_NAMES[k]} (${Math.round(fit[k]*100)} %)`).join(', ')+'. Raccourcissez le texte ou baissez une autre taille.' : '';
}
let rafO=0, rafM=0;
function scheduleOver(){ if(!rafO) rafO=requestAnimationFrame(()=>{rafO=0;drawOver()}); }
function renderMap(viewChanged){
  const isML = st.engine==='maplibre';
  $('mlMap').hidden = !isML;
  vecC.hidden = isML;
  if(isML){ if(!mlMap) initMaplibre(); if(viewChanged) mlUpdateView(); if(mlLib==='loading') setStatus('Chargement de la librairie MapLibre…','busy'); }
  else scheduleOp();
  scheduleOver();
}
function scheduleOp(){ if(!rafM) rafM=requestAnimationFrame(()=>{rafM=0;drawOp()}); }
function drawOp(){
  const ctx=vecC.getContext('2d'), r={x:0,y:0,w:vecC.width,h:vecC.height};
  ctx.fillStyle=st.colors.land; ctx.fillRect(0,0,r.w,r.h);
  if(osmData) drawVectors(ctx,r,osmData);
  checkDataBanner();
}
function redrawAll(restyle){ drawUnder(); if(restyle) mlRestyle(); renderMap(false); saveState(); }
/** Après une modification de l'état : redessine ce qui en dépend, puis enregistre (différé, cf. saveState).
 *  Par défaut, la couche du dessus (textes, repères) ; cards : vignettes ; all : fond, carte et style MapLibre. */
function changed(o={}){
  if(o.cards) refreshCards();
  if(o.all) redrawAll(true);
  else { scheduleOver(); saveState(); }
}

// Gestes du canvas vectoriel (glisser, pincer, molette, toucher)
(function(){
  const pts=new Map(); let moved=false, startD=0, startZ=0, last=null, start=null;
  vecC.addEventListener('pointerdown',e=>{ vecC.setPointerCapture(e.pointerId); pts.set(e.pointerId,{x:e.clientX,y:e.clientY}); if(pts.size===1){moved=false; start={x:e.clientX,y:e.clientY};} last={x:e.clientX,y:e.clientY};
    if(pts.size===2){ const [a,b]=[...pts.values()]; startD=Math.hypot(a.x-b.x,a.y-b.y); startZ=st.zoom; } });
  vecC.addEventListener('pointermove',e=>{
    if(!pts.has(e.pointerId)) return; pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===2){ const [a,b]=[...pts.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); if(startD>0){ st.zoom=clamp(startZ+Math.log2(d/startD),10,18); moved=true; syncZoomUI(); renderMap(); } return; }
    const dx=e.clientX-last.x, dy=e.clientY-last.y; if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>4) moved=true;
    last={x:e.clientX,y:e.clientY};
    const S=worldSize(ui.slotCss.w,st.zoom);
    st.center={lon:st.center.lon-dx/S*360, lat:imerc(merc(st.center.lat)+dy*2*Math.PI/S)};
    renderMap();
  });
  const up=e=>{ const wasTap=!moved && pts.size===1; pts.delete(e.pointerId); if(pts.size<2) startD=0; if(pts.size===1){ const q=[...pts.values()][0]; last={x:q.x,y:q.y}; moved=true; }
    if(wasTap && ui.placing){ const rc=vecC.getBoundingClientRect(); const ll=unproject(e.clientX-rc.left,e.clientY-rc.top,{x:0,y:0,w:rc.width,h:rc.height},st); placeAt(ll.lat,ll.lon); }
    if(pts.size===0) saveState(); };
  vecC.addEventListener('pointerup',up); vecC.addEventListener('pointercancel',up);
  vecC.addEventListener('wheel',e=>{ e.preventDefault(); st.zoom=clamp(st.zoom-e.deltaY*0.0025,10,18); syncZoomUI(); renderMap(); saveState(); },{passive:false});
})();

// ---------- Papier : textures générées (aucune image) ----------
// Base de largeur fixe (1240 px) agrandie à la taille voulue : le grain est le même à l'aperçu et à l'export.
// Papier clair : fusion « multiply » (assombrit légèrement) ; papier sombre : « screen » sur la texture inversée.
const TEX_BASE=1240, texCache=new Map();
function rng(seed){ return ()=>{ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function textureBase(kind, land, dark){
  const key=kind+land+dark; if(texCache.has(key)) return texCache.get(key);
  const w=land?Math.round(TEX_BASE*1.4145):TEX_BASE, h=land?TEX_BASE:Math.round(TEX_BASE*1.4145);
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h; const c=cv.getContext('2d');
  const R=rng({grain:11,aquarelle:23,kraft:37,toile:53}[kind]||1);
  c.fillStyle=kind==='kraft'?'#E3CFAE':'#fff'; c.fillRect(0,0,w,h);
  if(kind==='aquarelle'){   // taches douces : bruit de valeur à basse résolution, agrandi avec lissage
    for(const [n,a] of [[9,0.10],[23,0.06],[60,0.035]]){
      const sm=document.createElement('canvas'); sm.width=n; sm.height=Math.round(n*h/w); const sc=sm.getContext('2d'), d=sc.createImageData(sm.width,sm.height);
      for(let i=0;i<d.data.length;i+=4){ const v=255-R()*255*a*0.55; d.data[i]=d.data[i+1]=d.data[i+2]=v; d.data[i+3]=255; }
      sc.putImageData(d,0,0); c.globalCompositeOperation='multiply'; c.imageSmoothingEnabled=true; c.imageSmoothingQuality='high'; c.drawImage(sm,0,0,w,h); }
    c.globalCompositeOperation='multiply'; const gr=c.createRadialGradient(w/2,h/2,Math.min(w,h)*0.35,w/2,h/2,Math.max(w,h)*0.75);
    gr.addColorStop(0,'#fff'); gr.addColorStop(1,'#ECE8E2'); c.fillStyle=gr; c.fillRect(0,0,w,h); c.globalCompositeOperation='source-over';
  }
  if(kind==='kraft'){   // fibres
    c.lineCap='round';
    for(let i=0;i<9000;i++){ const x=R()*w, y=R()*h, a=R()*Math.PI, l=3+R()*12; c.strokeStyle=`rgba(${110+R()*40|0},${80+R()*30|0},${40+R()*20|0},${0.10+R()*0.18})`; c.lineWidth=0.5+R()*0.8;
      c.beginPath(); c.moveTo(x,y); c.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l); c.stroke(); }
  }
  if(kind==='toile'){   // trame de toile de lin
    for(let y=0;y<h;y+=3){ c.fillStyle=`rgba(0,0,0,${0.025+R()*0.03})`; c.fillRect(0,y,w,1); }
    for(let x=0;x<w;x+=3){ c.fillStyle=`rgba(0,0,0,${0.02+R()*0.03})`; c.fillRect(x,0,1,h); }
  }
  // grain fin, commun à toutes les textures
  const d=c.getImageData(0,0,w,h), D=d.data, amp={grain:34,aquarelle:14,kraft:22,toile:12}[kind]||20;
  for(let i=0;i<D.length;i+=4){ const n=R()*R()*amp; D[i]-=n; D[i+1]-=n; D[i+2]-=n; }
  c.putImageData(d,0,0);
  if(dark){ c.globalCompositeOperation='difference'; c.fillStyle='#fff'; c.fillRect(0,0,w,h); c.globalCompositeOperation='saturation'; c.fillStyle='#808080'; c.fillRect(0,0,w,h); c.globalCompositeOperation='source-over'; }
  texCache.set(key,cv); return cv;
}
function texMode(){ return lum(st.colors.paper)<0.3 ? 'screen' : 'multiply'; }
/** Applique le papier à un rendu complet (export, aperçu au mur) */
function applyTexture(ctx,W,H){
  if(!st.texture || st.texture==='none') return;
  ctx.save(); ctx.globalCompositeOperation=texMode(); ctx.drawImage(textureBase(st.texture,W>H,texMode()==='screen'),0,0,W,H); ctx.restore();
}
/** Aperçu : calque de texture au-dessus de l'affiche, fondu par CSS (mix-blend-mode) comme à l'export */
function drawTexture(){
  const on=st.texture && st.texture!=='none'; cvT.hidden=!on; if(!on) return;
  cvT.style.mixBlendMode=texMode();
  const c=cvT.getContext('2d'); c.clearRect(0,0,cvT.width,cvT.height); c.drawImage(textureBase(st.texture,cvT.width>cvT.height,texMode()==='screen'),0,0,cvT.width,cvT.height);
}

// ---------- Composition complète (export et aperçu au mur) ----------
async function composePoster(W,H,step=()=>{}){
  step('Chargement des polices…'); await loadFonts(); const fontWarn=!fontsReady();
  const g=geom(st,W,H); if(g.sky){ step('Chargement du ciel…'); await ensureSky(); }
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H; const ctx=cv.getContext('2d');
  let warn=false; const imgs=[];
  if(st.engine==='maplibre'){
    step('Rendu vectoriel haute définition…');
    for(const [i,p] of g.places.entries()){ const r=await renderMaplibreOffscreen(Math.round(p.rect.w),Math.round(p.rect.h),p.view); imgs[i]=r.canvas; warn=warn||r.warn; }
  } else step('Re-projection des vecteurs…');
  const mapFn=(c,rect,view,i)=> st.engine==='maplibre' ? c.drawImage(imgs[i],rect.x,rect.y,rect.w,rect.h) : drawVectors(c,rect,osmData,view);
  drawPoster(ctx,W,H,'all',mapFn); applyTexture(ctx,W,H);
  for(const c of imgs) if(c){ c.width=c.height=0; }   // rendus MapLibre intermédiaires : mémoire rendue tout de suite (iOS)
  return {canvas:cv,warn,fontWarn};
}

// ---------- Aperçu au mur ----------
const WALLS=[['Blanc cassé','#ECE8E1'],['Sauge','#C7D1C1'],['Terracotta','#C98B6B'],['Béton','#9C9C99'],['Nuit','#2B2F36']];
const FRAMES=[['Chêne','oak'],['Noir','#1B1B1B'],['Blanc','#F4F4F2'],['Doré','gold']];
const mock={wall:0,frame:0,mat:true,poster:null};
async function openMockup(){
  if(st.engine==='maplibre' && !needConsent(()=>openMockup())) return;
  if(st.engine!=='maplibre' && !osmData){ toast('Chargez d\'abord la carte (onglet Lieu, section Avancé).',true); return; }
  setBusy(true,'Préparation de l\'aperçu…'); let ok=false;
  try{ const d=posterDims(), k=1100/Math.max(d.W,d.H); mock.poster=(await composePoster(Math.round(d.W*k),Math.round(d.H*k),t=>$('busyTxt').textContent=t)).canvas;
    drawMockup(); ok=true; }
  catch(e){ console.error(e); toast('Aperçu impossible : '+(e.message||e),true); }
  finally{ setBusy(false); }
  if(ok) openDialog('mockup');
}
function drawMockup(){
  const P=mock.poster; if(!P) return;
  const land=P.width>P.height, SW=land?1800:1400, SH=land?1350:1750, cv=$('mockCv'); cv.width=SW; cv.height=SH; const c=cv.getContext('2d');
  const wall=WALLS[mock.wall][1];
  c.fillStyle=wall; c.fillRect(0,0,SW,SH);
  let g=c.createLinearGradient(0,0,0,SH); g.addColorStop(0,'rgba(255,255,255,0.10)'); g.addColorStop(0.7,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.12)'); c.fillStyle=g; c.fillRect(0,0,SW,SH);
  c.fillStyle='rgba(0,0,0,0.10)'; c.fillRect(0,SH*0.93,SW,SH*0.07); c.fillStyle='rgba(255,255,255,0.08)'; c.fillRect(0,SH*0.93,SW,3);
  // cadre
  const ph=land?SH*0.56:SH*0.62, pw=ph*P.width/P.height, mat=mock.mat?pw*0.08:0, fw=pw*0.045;
  const ow=pw+2*mat+2*fw, oh=ph+2*mat+2*fw, ox=(SW-ow)/2, oy=SH*0.42-oh/2;
  c.save(); c.shadowColor='rgba(0,0,0,0.38)'; c.shadowBlur=46; c.shadowOffsetY=22; c.fillStyle='#000'; c.fillRect(ox,oy,ow,oh); c.restore();
  const fr=FRAMES[mock.frame][1];
  if(fr==='oak'){ c.fillStyle='#B98A5C'; c.fillRect(ox,oy,ow,oh); const R=rng(7); c.globalAlpha=0.18;
    for(let i=0;i<140;i++){ const y=oy+R()*oh; c.strokeStyle=R()>0.5?'#7A5434':'#E2BC8E'; c.lineWidth=1+R()*2; c.beginPath(); c.moveTo(ox,y); c.bezierCurveTo(ox+ow*0.3,y+R()*8-4,ox+ow*0.7,y+R()*8-4,ox+ow,y); c.stroke(); } c.globalAlpha=1; }
  else if(fr==='gold'){ g=c.createLinearGradient(ox,oy,ox+ow,oy+oh); g.addColorStop(0,'#E6C979'); g.addColorStop(0.5,'#B8913E'); g.addColorStop(1,'#E1C470'); c.fillStyle=g; c.fillRect(ox,oy,ow,oh); }
  else { c.fillStyle=fr; c.fillRect(ox,oy,ow,oh); }
  c.strokeStyle='rgba(255,255,255,0.25)'; c.lineWidth=2; c.strokeRect(ox+1,oy+1,ow-2,oh-2);
  c.strokeStyle='rgba(0,0,0,0.35)'; c.strokeRect(ox+fw-1,oy+fw-1,ow-2*fw+2,oh-2*fw+2);
  if(mat){ c.fillStyle='#F7F5F0'; c.fillRect(ox+fw,oy+fw,ow-2*fw,oh-2*fw); c.strokeStyle='rgba(0,0,0,0.18)'; c.lineWidth=2; c.strokeRect(ox+fw+mat-1,oy+fw+mat-1,pw+2,ph+2); }
  c.drawImage(P,ox+fw+mat,oy+fw+mat,pw,ph);
  g=c.createLinearGradient(ox,oy,ox+ow,oy+oh); g.addColorStop(0,'rgba(255,255,255,0.10)'); g.addColorStop(0.45,'rgba(255,255,255,0)'); c.fillStyle=g; c.fillRect(ox+fw,oy+fw,ow-2*fw,oh-2*fw);
  document.querySelectorAll('#mockWalls .chip').forEach((b,i)=>b.classList.toggle('on',i===mock.wall));
  document.querySelectorAll('#mockFrames .chip').forEach((b,i)=>b.classList.toggle('on',i===mock.frame));
  $('mockMat').checked=mock.mat;
}
function downloadMockup(){
  $('mockCv').toBlob(b=>{ if(!b) return; const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`apercu-au-mur-${slug(st.texts.title)}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); },'image/png');
}
