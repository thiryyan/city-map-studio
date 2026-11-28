/* City Map Studio — Modes illustrés : affiche de voyage façon vintage à partir d'une illustration importée.
 * Module ES (#102), importé par src/app/main.ts ; réuni en un seul script par le build.
 *
 * L'application ne génère pas l'image : elle rédige un prompt pour l'IA de l'utilisateur (ChatGPT, Gemini…), qui pose
 * ses questions puis livre une illustration sans texte ni marge ; l'image importée est cadrée, retouchée, et le titre
 * est posé par drawPoster (aperçu et export identiques). L'image reste dans le navigateur ; seules les pistes peuvent, à la
 * demande et après accord, lire les tuiles de la carte ou interroger Wikipédia (option désactivée par défaut, CMS.wiki).
 * L'image n'est pas dans l'état (st) : elle est tenue dans IS (src/core/illustration-state.ts).
 * Le découpage de l'ancien fichier unique (#119) : rendu → src/render/illustration-*.ts, stockage → src/storage/illustration-images.ts,
 * pistes et prompt → src/features/illustration-prompt.ts, zones de prise et textes → src/ui/illustration-*.ts. */
import {illusConf as C} from '../content/config.js';
import {needConsent, saveState, st, ui} from '../core/doc/state.js';
import {update} from '../core/doc/store.js';
import {$, h, pressed, setSeg, setStatus, toast} from '../core/dom.js';
import {changed, drawUnder, layoutPreview, poster, scheduleOver, slot, stage} from '../view/preview.js';
import {geom} from '../render/layout.js';
import {setOrient, updateLayoutUI} from '../features/presets.js';
import {clamp, exportSpec} from '../core/geo/geo.js';
import {refreshCards, showTab, syncInputs, updateEngineUI} from '../core/port.js';
import {loadFonts} from '../render/fonts.js';
import {FILE, MAX_BYTES, MIN_SIDE, PREV_SIDE, attachImages, encode, exportImages, gc, importImages, sha256, store, toCanvas} from '../storage/illustration-images.js';
import {adjust, cache, cropPct, placement, processPixels, quality, ready, region, resample} from '../render/illustration-image.js';
import {IMG, Opts, WIKI_KEY, refOf} from '../core/illustration-state.js';
import {FADE_STOP, draw, drawMapTexts, drawMix} from '../render/illustration-draw.js';
import {buildPrompt, compoLine, omtPiste, osmPiste, rankPistes, ratioText, refresh, scanPistes, scanWiki} from '../features/illustration-prompt.js';
import {loadSaves} from '../features/saves.js';
import {initHits, placeHits} from './illustration-hits.js';
import {arcShape, decoOf, decoWhy, mapMoved, plateInk, posOf, textLayout, textStyle, titleRC, zoneOf} from '../render/illustration-text.js';
import {COL_NAMES, DECO_NAMES, DECO_TIPS, MORE_KEY, POS_ARROWS, POS_NAMES, SW_FILL, SW_OUTLINE, SW_PLATE, SW_SHADOW, SW_TEXT, TPL_NAMES, TPL_TIPS, setDeco, setPos, setTpl, setZone, swatches, syncDecos, syncMoreOpen, syncOrder, syncPlate, syncText} from './illustration-text.js';
import {IS} from '../core/illustration-state.js';

// ---------- Fonctions pures (testées sans navigateur : tests/unit/illus.test.mjs) ----------
export const GRADES: Record<string, string> = {ok:'Bonne', mid:'Juste', bad:'Insuffisante'};
// ---------- Image importée (aucune donnée envoyée : décodée et ré-encodée dans le navigateur) ----------
export const TYPES=/^image\/(png|jpeg|webp)$/, EXT=/\.(png|jpe?g|webp)$/i;
export function setImage(full: HTMLCanvasElement, meta: {name: string; size: number; ref: string}){
  const p=Math.min(1,PREV_SIDE/Math.max(full.width,full.height)), prev=p<1 ? resample(full,full.width*p,full.height*p) : full;
  freeImage();
  IS.img={full, prev, w:full.width, h:full.height, name:meta.name, size:meta.size, ref:meta.ref, url:null};
}
export function freeImage(){
  if(cache.canvas && (!IS.img || (cache.canvas!==IS.img.full && cache.canvas!==IS.img.prev))) cache.canvas.width=cache.canvas.height=0;
  cache.key=''; cache.canvas=null;
  if(!IS.img) return;
  IS.img.full.width=IS.img.full.height=0; if(IS.img.prev!==IS.img.full) IS.img.prev.width=IS.img.prev.height=0;
  if(IS.img.url) URL.revokeObjectURL(IS.img.url);
  IS.img=null;
}
 // tried : dernière référence introuvable (pas de nouvelle tentative en boucle)
export async function ensureImage(){
  const want=st.illus.img;
  if(!want){ if(IS.img){ freeImage(); redraw(); } IS.missing=false; return; }
  if(IS.img && IS.img.ref===want.ref){ IS.missing=false; return; }
  if(st.mode==='map' || IS.loading===want.ref) return;   // chargée au passage en mode illustré
  IS.loading=want.ref; IS.missing=false; syncImage(); redraw();
  let ok=false;
  try{
    const rec=await store.get(want.ref);
    if(rec?.blob && st.illus.img?.ref===want.ref){
      const bmp=await createImageBitmap(rec.blob);
      try{ setImage(toCanvas(bmp).full,{name:rec.name||want.name, size:rec.size, ref:want.ref}); ok=true; } finally{ bmp.close?.(); }
    }
  }catch(e){ ok=false; }
  IS.loading=''; IS.tried=ok ? '' : want.ref;
  if(st.illus.img?.ref!==want.ref) return ensureImage();   // l'état a changé pendant le chargement
  IS.missing=!ok; sync(); redraw();
  CMS.emit('illus:loaded',ok);
}
export async function importFile(file: File | null | undefined){
  if(!file) return false;
  if(!(TYPES.test(file.type) || (!file.type && EXT.test(file.name||'')))){
    const ext=((file.name||'').match(/\.([\w]{1,6})$/)||[])[1];
    return fail(`Format non pris en charge${ext?` (.${ext.toLowerCase()})`:''}. Formats acceptés : PNG, JPEG ou WebP.`);
  }
  if(file.size>MAX_BYTES) return fail('Image trop lourde (40 Mo au plus).');
  let bmp: ImageBitmap, buf: ArrayBuffer;
  try{ buf=await file.arrayBuffer(); bmp=await createImageBitmap(new Blob([buf],{type:file.type})); }catch(e){ return fail('Image illisible : le fichier est peut-être endommagé.'); }
  try{
    if(bmp.width<MIN_SIDE || bmp.height<MIN_SIDE) return fail(`Image trop petite (${MIN_SIDE} px de côté au moins).`);
    const ref=await sha256(buf), expected=st.illus.img, wasMissing=IS.missing;
    const {full,reduced}=toCanvas(bmp);   // ré-encodage : seuls les pixels sont gardés (métadonnées, coordonnées GPS comprises, écartées)
    const name=(file.name||'image collée').slice(0,120);
    setImage(full,{name, size:file.size, ref});
    const same=!!expected && expected.ref===ref, other=wasMissing && !!expected && !same;
    update(_s=>(_s.illus.img={ref, name, w:full.width, h:full.height}));
    if(!same) update(_s=>Object.assign(_s.illus,{zoom:100,ox:0,oy:0}));
    IS.missing=false; fail('');
    setStep('image'); sync(); redraw(); saveState();
    toast(same ? 'Illustration retrouvée' : other ? `Ce n’est pas l’illustration de l’affiche (« ${expected.name} ») : la nouvelle image la remplace` : 'Illustration importée'+(reduced?' (réduite pour tenir en mémoire)':''), other);
    if(!(await store.get(ref))?.blob) await store.put(ref,{blob:await encode(full), w:full.width, h:full.height, name, size:file.size});
    return true;
  }finally{ bmp.close?.(); }
}
export function fail(msg: string){ const e=$('illusErr'); if(e) e.textContent=msg; if(msg) toast(msg,true); return !msg; }
/** Retire l'illustration de l'affiche (l'image reste stockée jusqu'au prochain nettoyage : « Annuler » la retrouve) */
export function removeImage(){
  if(!IS.img && !st.illus.img) return;
  freeImage(); update(_s=>(_s.illus.img=null)); IS.missing=false; sync(); redraw(); saveState(); toast('Illustration retirée');
}
export function redraw(){ if(IS.rafU) return; IS.rafU=requestAnimationFrame(()=>{ IS.rafU=0; drawUnder(); scheduleOver(); exportState(); placeHit(); }); }
/** Vignette : zone de prise au-dessus de la carte, pour déplacer l'illustration sans déplacer la carte */
export function placeHit(){
  const hit=$('illusHit'), on=st.mode==='mix' && st.mix.compo==='vig' && ready() && ui.posterCss.w>0;
  hit.hidden=!on; if(!on) return;
  const r=geom(st,ui.posterCss.w,ui.posterCss.h).illus!;
  Object.assign(hit.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px',borderRadius:`${r.w/2}px ${r.w/2}px 0 0`});
}
export function setWiki(on: boolean){
  IS.wikiOn=!!on; try{ on ? localStorage.setItem(WIKI_KEY,'1') : localStorage.removeItem(WIKI_KEY); }catch(e){}
  syncWiki();
}
export function syncWiki(){
  $('wikiOn').checked=IS.wikiOn; $('wikiBox').hidden=!IS.wikiOn;
  const off=navigator.onLine===false, b=$('bWikiPistes');
  b.disabled=off || IS.wikiBusy;
  if(!IS.wikiBusy) $('wikiHint').textContent=off ? 'Hors ligne : la recherche Wikipédia reviendra avec le réseau ; les pistes de la carte restent disponibles.'
    : 'Articles de Wikipédia situés autour du lieu, classés par notoriété.';
}
/** Fondu : la carte de l'aperçu s'efface vers le haut, comme à l'export */
export function applyFade(){
  const on=st.mode==='mix' && st.mix.compo==='fondu', m=on ? `linear-gradient(to bottom, transparent, #000 ${FADE_STOP*100}%)` : '';
  slot.style.webkitMaskImage=m; slot.style.maskImage=m;
}
/** Composition (mode Carte + illustration) */
export function syncCompo(){
  const M=st.mix; setSeg('compoSeg',M.compo); setSeg('mixShapeSeg',M.shape); setSeg('mixPosSeg',M.pos);
  $('medOpts').hidden=M.compo!=='med'; $('hbOpts').hidden=M.compo!=='hb'; setSeg('mixSplitSeg',M.split); applyFade();
  $('compoPrompt').textContent='« '+compoLine(st)+' »';
  updateLayoutUI();   // marge et contour selon la composition (onglet Style)
}
/** Copie réduite de l'illustration importée (palette d'après l'image, onglet Style), ou null */
export const previewImage=()=>ready() ? IMG().prev : null;
/** Calque que cadrent les boutons flottants et le mode Cadrer : la carte (Carte), l'image (Illustration), au choix (Carte + illustration) */
export const layer=()=>st.mode==='illus' ? 'illus' : st.mode==='map' || !ready() ? 'map' : IS.layerPref;
export function syncLayer(){
  const il=layer()==='illus', app=$('app');
  app.dataset.layer=layer(); app.classList.toggle('illusready',ready());
  const set=(id: string,x: string)=>{ const e=$(id); e.title=x; e.setAttribute('aria-label',x); };
  set('bZoomIn',il?'Agrandir l\u2019illustration':'Zoom avant'); set('bZoomOut',il?'Réduire l\u2019illustration':'Zoom arrière');
  set('bToMarker',il?'Recentrer l\u2019illustration':'Centrer sur le repère');
  CMS.emit('layer:synced');   // sélecteur « Que déplacer ? » et indication de la Modification (CMS.intent)
}
export function setLayer(v: string,quiet?: boolean){
  const was=layer(); IS.layerPref=v==='illus' ? 'illus' : 'map'; syncLayer();
  if(!quiet && layer()!==was) toast(layer()==='illus' ? 'Cadrage de l\u2019illustration : la carte reste en place' : 'Cadrage de la carte');
}
export function zoomBy(d: number){
  if(!ready()) return; update(_s=>{ const I=_s.illus; I.zoom=clamp(I.zoom+d,ZMIN,ZMAX); Object.assign(I,bound(I.ox,I.oy,I.zoom,false)); });
  badge(st.illus.zoom); syncInputs(); syncImage(); redraw(); saveState();
}
// ---------- Illustration sur la page : déplacer, agrandir, réduire (#82) ----------
// Zoom de 30 à 300 % de l'ajustement (« Remplir » ou « Image entière ») dans la zone de l'illustration, celle de la
// composition : sous 100 %, l'image rapetisse et laisse voir le papier ; elle reste toujours découpée par sa zone.
export const ZMIN=30, ZMAX=300;
/** Décalage borné : le centre de l'image reste dans sa zone, ou ses bords restent atteignables quand elle déborde.
 *  snap : aimantation au centre et aux bords de la zone */
export function bound(ox: number,oy: number,z: number,snap: boolean){
  const r=geom(st,ui.posterCss.w||1,ui.posterCss.h||1).illus; if(!IS.img || !r || !r.w) return {ox,oy};
  const P=placement(r.w,r.h,IS.img.w,IS.img.h,{...st.illus,zoom:z,ox:0,oy:0});
  const ex=(P.w/r.w-1)/2, ey=(P.h/r.h-1)/2;   // décalage qui aligne un bord de l'image sur celui de la zone
  if(snap){ const s=(v: number,e: number)=>{ for(const t of [0,e,-e]) if(Math.abs(v-t)<0.02) return t; return v; }; ox=s(ox,ex); oy=s(oy,ey); }
  const lx=Math.max(0.5,Math.abs(ex)), ly=Math.max(0.5,Math.abs(ey));
  return {ox:clamp(ox,-lx,lx), oy:clamp(oy,-ly,ly)};
}
export function badge(z: number){ const b=$('zoomBadge'); b.textContent=Math.round(z)+' %'; b.hidden=false; clearTimeout(IS.badgeT); IS.badgeT=setTimeout(()=>{ b.hidden=true; },900); }
export function recenter(){ if(!ready()) return; update(_s=>Object.assign(_s.illus,{ox:0,oy:0})); redraw(); saveState(); }
export function exportState(){
  syncLayer();
  const off=st.mode!=='map' && !ready();
  for(const id of ['bExport']){ const b=$(id); if(b){ b.disabled=off; b.title=off?'Importez d’abord votre illustration (onglet Illustration)':''; } }
  const own=/illustration/i.test($('stTxt').textContent);   // message posé par ce module (sinon : état de la carte, à laisser)
  if(st.mode==='mix' && ready()){ if(own) setStatus('Prêt'); return; }
  if(st.mode==='map'){ if(own) setStatus('Prêt'); return; }
  setStatus(ready() ? 'Prêt' : IS.loading ? 'Chargement de l\u2019illustration…' : IS.missing ? 'Illustration à réimporter' : 'Importez votre illustration pour exporter', ready() ? '' : IS.loading ? 'busy' : 'wait');
}
export function setMode(v: string){
  if(!C.MODES.includes(v) || st.mode===v) return;
  update(_s=>(_s.mode=v)); if(v==='mix' && !ready()) IS.step='compo';
  applyMode(); sync();
  if(v==='illus' && ui.tab==='lieu') showTab('illus');   // le parcours continue par le prompt
  layoutPreview(); refreshCards(); loadFonts().then(()=>scheduleOver());
  if(v!=='illus') updateEngineUI();
  saveState();
  toast(({illus:'Affiche illustrée : créez le prompt, puis importez votre image', mix:'Carte + illustration : choisissez la composition, puis créez le prompt', map:'Affiche cartographique'} as Record<string, string>)[v]!);
}
export function applyMode(){
  const m=st.mode, ill=m==='illus';
  $('app').dataset.mode=m; setSeg('modeSeg',m);
  // Parcours selon le type : Carte = Lieu, Repère, Textes… ; Illustration = Lieu, Illustration, Textes… (sans repère : pas de carte) ;
  // mixte = tout. Le lieu reste modifiable en Illustration (#77) : il donne le titre, les coordonnées et les pistes du prompt.
  $('tb-lieu').hidden=false; $('tb-repere').hidden=ill; $('tb-illus').hidden=m==='map';
  if(ill && ui.tab==='repere') showTab('illus');
  if(m==='map' && ui.tab==='illus') showTab('lieu');
  if(m!=='mix' && IS.step==='compo') IS.step='prompt';
  exportState(); placeHit(); applyFade(); if(m==='map'){ IS.hitInfo=null; } placeHits();
}
export function setStep(v: string){
  IS.step=v; setSeg('illusStepSeg',v);
  $('illusCompo').hidden=v!=='compo'; $('illusPrompt').hidden=v!=='prompt'; $('illusImage').hidden=v!=='image';
}
export function syncPrompt(){
  const P=st.illus.prompt;
  setSeg('momentSeg',P.moment); setSeg('saisonSeg',P.saison); setSeg('paletteSeg',P.palette); setSeg('langSeg',P.lang);
  const box=$('pisteChips'); box.replaceChildren();
  const ia=h('button',{type:'button',className:'chip'},'L’IA propose'); pressed(ia,!P.pistes.length);
  ia.onclick=()=>{ update(_s=>{ _s.illus.prompt.pistes=[]; }); syncPrompt(); saveState(); }; box.append(ia);
  for(const p of P.pistes){
    const b=h('button',{type:'button',className:'chip on','aria-label':`Retirer la piste « ${p} »`},p,h('span',{className:'x','aria-hidden':'true'},' ✕'));
    b.onclick=()=>{ update(()=>{ P.pistes=P.pistes.filter(x=>x!==p); }); syncPrompt(); saveState(); }; box.append(b);
  }
  $('pisteIn').disabled=P.pistes.length>=C.PISTES_MAX;
  const sug=IS.found.filter(x=>!P.pistes.includes(x)), sb=$('pisteSugg'); sb.hidden=!sug.length;
  sb.replaceChildren(...sug.map(x=>{ const b=h('button',{type:'button',className:'chip','aria-label':`Ajouter la piste « ${x} »`},'+ '+x);
    b.onclick=()=>{ if(P.pistes.length<C.PISTES_MAX && !P.pistes.includes(x)){ update(()=>{ P.pistes.push(x); }); syncPrompt(); saveState(); } else toast(`${C.PISTES_MAX} pistes au plus`,true); }; return b; }));
  updatePrompt();
}
export function updatePrompt(){
  const o=$('promptOut'), t=buildPrompt(st); if(o.value!==t) o.value=t;
  const T=posOf(), d=exportSpec();
  $('promptInfo').textContent=`Format demandé : ${d.name} ${st.orient==='landscape'?'paysage':'portrait'} · zone du titre : ${POS_NAMES[titleRC(T)[0]]}, ${COL_NAMES[titleRC(T)[1]]} (onglet Textes).`;
}
export function syncImage(){
  const I=st.illus, has=ready(), want=I.img;
  const ms=$('illusMissing'); ms.hidden=!(IS.missing && want);
  if(IS.missing && want) ms.textContent=`Illustration introuvable dans ce navigateur : « ${want.name} » (${want.w} × ${want.h} px). Réimportez-la : elle a pu être effacée par le navigateur, ou l\u2019affiche vient d\u2019un lien ou d\u2019un fichier sans image.`;
  $('illusDrop').hidden=has; $('illusFile').hidden=!has; $('illusTools').hidden=!has;
  setSeg('illusFitSeg',I.fit); setSeg('illusVintageSeg',I.vintage);
  $('oIllusZoom').textContent=I.zoom+' %';
  for(const [k,o] of [['bright','oIllusBright'],['contrast','oIllusContrast'],['satur','oIllusSatur']]) $(o).textContent=((I as Opts)[k]>0?'+':'')+(I as Opts)[k];
  if(!has) return;
  const img=IMG(), th=$('illusThumb'); if(th.dataset.for!==img.name+img.w){ th.dataset.for=img.name+img.w; img.prev.toBlob(b=>{ if(!b || !img) return; if(img.url) URL.revokeObjectURL(img.url); img.url=URL.createObjectURL(b); th.src=img.url; },'image/jpeg',0.8); }
  $('illusName').textContent=img.name;
  $('illusInfo').textContent=`${img.w} × ${img.h} px · ${Math.max(1,Math.round(img.size/1024)).toLocaleString('fr-FR')} Ko`;
  const cur=st.format, q=quality(st,img.w,img.h), icon: Record<string, string>={ok:'✓',mid:'!',bad:'✕'};
  $('illusQuality').replaceChildren(...q.map(f=>h('li',{className:'q '+f.grade+(f.key===cur?' cur':'')},
    h('span',{className:'qi','aria-hidden':'true'},icon[f.grade]),h('b',{},f.name),
    h('span',{},`${GRADES[f.grade]} · ${f.dpi} ppp${st.illus.upscale?' (lissée ×2)':''}${f.key===cur?' · format choisi':''}`))));
  const pct=cropPct(st,img.w,img.h);
  $('illusRatio').textContent=(I.fit==='cover' ? (pct>1 ? `Recadrage automatique : ${pct} % de l'image hors de l'affiche.` : 'Proportions de l’image conformes à l’affiche.')
    : (pct>1 ? `Image entière : bandes de ${pct} % de la couleur du fond.` : 'Proportions de l’image conformes à l’affiche.'))+' Agrandir ne crée pas de détails : pour un grand format, demandez à l’IA sa plus haute résolution.';
}
export function sync(){
  const want=refOf(st);
  // Image déjà cherchée en vain (restauration, « Annuler ») : signalée tout de suite, sans nouvelle tentative
  if(want && want!==(IS.img?.ref||'') && !IS.loading && IS.tried===want && st.mode!=='map') IS.missing=true;
  applyMode(); setStep(IS.step); syncCompo(); syncPrompt(); syncImage(); syncText();
  if(want!==(IS.img?.ref||'') && !IS.loading && IS.tried!==want) ensureImage();
}
export function init(){
  document.querySelectorAll<HTMLElement>('.modes button').forEach(b=>b.onclick=()=>setMode(b.dataset.v!));
  document.querySelectorAll<HTMLElement>('#illusStepSeg button').forEach(b=>b.onclick=()=>setStep(b.dataset.v!));
  $('bToImage').onclick=()=>{ setStep('image'); CMS.panelScroll.to($('illusDrop'),'nearest'); };
  const P=()=>st.illus.prompt as Opts;
  for(const [id,list,f] of [['momentSeg',C.MOMENTS,'moment'],['saisonSeg',C.SAISONS,'saison']])
    for(const [k,n] of list){ const b=h('button',{type:'button',dataset:{v:k}},n); b.onclick=()=>{ update(()=>{ P()[f]=k; }); syncPrompt(); saveState(); }; $(id).append(b); }
  for(const [id,f] of [['paletteSeg','palette'],['langSeg','lang']])
    document.querySelectorAll<HTMLElement>(`#${id} button`).forEach(b=>b.onclick=()=>{ update(()=>{ P()[f]=b.dataset.v!; }); syncPrompt(); saveState(); });
  $('pisteForm').onsubmit=e=>{ e.preventDefault(); const v=$('pisteIn').value.replace(/\s+/g,' ').trim().slice(0,80);
    if(v && !P().pistes.includes(v) && P().pistes.length<C.PISTES_MAX){ update(()=>{ P().pistes.push(v); }); syncPrompt(); saveState(); }
    $('pisteIn').value=''; };
  $('bCopyPrompt').onclick=async()=>{
    updatePrompt(); const t=$('promptOut').value;
    try{ await navigator.clipboard.writeText(t); toast('Prompt copié : collez-le dans ChatGPT ou Gemini'); }
    catch(e){ const o=$('promptOut'); o.focus(); o.select(); let ok=false; try{ ok=document.execCommand('copy'); }catch(_){}
      toast(ok ? 'Prompt copié : collez-le dans ChatGPT ou Gemini' : 'Copie refusée par le navigateur : le prompt est sélectionné, copiez-le (Ctrl + C)',!ok); }
  };
  // Import : fichier, glisser-déposer (zone et aperçu), collage
  for(const id of ['illusIn','illusIn2']) $(id).onchange=e=>{ const f=(e.target as HTMLInputElement).files![0]; if(f) importFile(f); (e.target as HTMLInputElement).value=''; };
  const dropOn=(el: HTMLElement)=>{
    el.addEventListener('dragover',e=>{ if(st.mode==='map') return; e.preventDefault(); $('illusDrop').classList.add('over'); });
    el.addEventListener('dragleave',()=>$('illusDrop').classList.remove('over'));
    el.addEventListener('drop',e=>{ if(st.mode==='map') return; e.preventDefault(); $('illusDrop').classList.remove('over');
      const f=e.dataTransfer?.files?.[0]; if(f){ if(ui.tab!=='illus') showTab('illus'); importFile(f); } });
  };
  dropOn($('illusDrop')); dropOn(stage);
  // Coller l'image (#57) : lecture du presse-papiers au toucher seulement (geste requis par iOS et Android), même chemin que le fichier
  const canRead=!!(window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.read==='function');
  $('bIllusPaste').hidden=!canRead;
  $('bIllusPaste').onclick=async()=>{
    const pick="choisissez l'image avec « Choisir un fichier »";
    let items;
    try{ items=await navigator.clipboard.read(); }
    catch(e){ toast((e as Error)?.name==='NotAllowedError' ? `Accès au presse-papiers refusé : ${pick}.` : `Presse-papiers illisible : ${pick}.`,true); return; }
    for(const it of items||[]){
      const t=(it.types||[]).find(x=>/^image\/(png|jpeg|webp)$/.test(x)) || (it.types||[]).find(x=>x.startsWith('image/'));
      if(!t) continue;
      let blob; try{ blob=await it.getType(t); }catch(e){ toast(`Image du presse-papiers illisible : ${pick}.`,true); return; }
      importFile(new File([blob],'image-collee.'+(t.split('/')[1]||'png').replace('jpeg','jpg'),{type:t})); return;
    }
    toast(`Aucune image dans le presse-papiers : dans votre IA, faites un appui long sur l'image puis « Copier », ou ${pick}.`,true);
  };
  document.addEventListener('paste',e=>{
    if(st.mode==='map' || (e.target as HTMLInputElement).matches?.('input[type=text],input[type=search],textarea')) return;
    const it=[...(e.clipboardData?.items||[])].find(i=>i.kind==='file' && i.type.startsWith('image/'));
    if(it){ e.preventDefault(); if(ui.tab!=='illus') showTab('illus'); importFile(it.getAsFile()); }
  });
  $('bIllusDel').onclick=removeImage;
  document.querySelectorAll<HTMLElement>('#illusFitSeg button').forEach(b=>b.onclick=()=>{ update(_s=>Object.assign(_s.illus,{fit:b.dataset.v,ox:0,oy:0})); syncImage(); redraw(); saveState(); });
  document.querySelectorAll<HTMLElement>('#illusVintageSeg button').forEach(b=>b.onclick=()=>{ update(_s=>(_s.illus.vintage=b.dataset.v!)); syncImage(); redraw(); saveState(); });
  $('bIllusCenter').onclick=()=>{ update(_s=>Object.assign(_s.illus,{zoom:100,ox:0,oy:0})); syncInputs(); redraw(); saveState(); };
  // Champs liés (data-k) : curseurs et cases (ui.ts émet illus:input)
  CMS.on('illus:input',k=>{
    if(k.startsWith('illusText.')){ syncText(); scheduleOver(); saveState(); return; }   // dont l'épaisseur du trait des plaques
    syncImage(); redraw(); saveState();
  });
  CMS.on('state:synced',sync);
  CMS.on('colors:changed',syncText);   // thème : couleur que donne « Auto »
  CMS.on('layout:changed',()=>{ syncDecos(); syncOrder(); });   // gabarit, composition : présentations possibles (arc), zones (#86), ordre du gabarit
  CMS.on('state:saved',()=>syncOrder());   // lignes masquées ou affichées
  CMS.on('state:saved',()=>{ if(st.mode!=='map' && ui.tab==='illus' && IS.step==='prompt') updatePrompt(); });
  // Modification, choix « Illustration » : un doigt déplace l'image, deux doigts l'agrandissent ou la réduisent autour
  // d'eux, double toucher la remet ajustée ; molette (ordinateur) autour du pointeur. En Lecture, rien ne bouge.
  type Pt2 = {x: number; y: number};
  const pts=new Map<number, Pt2>(); let g0: {c: Pt2; d: number; ox: number; oy: number; z: number} | null=null, moved=false, t0=0, lastTap=0, wheelT=0;
  const editing=()=>ready() && st.mode!=='map' && ui.framing && ui.intent==='illus';
  const local=(e: PointerEvent | WheelEvent)=>{ const R=poster.getBoundingClientRect(); return {x:e.clientX-R.left, y:e.clientY-R.top}; };
  const mid=(P: Pt2[])=>({x:P.reduce((a,p)=>a+p.x,0)/P.length, y:P.reduce((a,p)=>a+p.y,0)/P.length});
  const dist=(P: Pt2[])=>P.length>1 ? Math.hypot(P[0].x-P[1].x,P[0].y-P[1].y) : 0;
  /** Nouveau geste (ou doigt ajouté, retiré) : point de départ */
  function base(){ const P=[...pts.values()]; g0={c:mid(P), d:dist(P), ox:st.illus.ox, oy:st.illus.oy, z:st.illus.zoom}; }
  /** Zoom z autour du point c (affiche, px), le point du départ restant sous les doigts */
  function apply(c: Pt2,z: number,snap: boolean){
    const r=geom(st,ui.posterCss.w,ui.posterCss.h).illus!, g0_=g0!, k=z/g0_.z;
    const icx=r.x+r.w/2+g0_.ox*r.w, icy=r.y+r.h/2+g0_.oy*r.h;   // centre de l'image au départ
    const nx=c.x-(g0_.c.x-icx)*k, ny=c.y-(g0_.c.y-icy)*k;
    update(_s=>Object.assign(_s.illus,{zoom:z},bound((nx-r.x-r.w/2)/r.w,(ny-r.y-r.h/2)/r.h,z,snap)));
  }
  poster.addEventListener('pointerdown',e=>{
    if(!editing() || e.button>0 || (e.target as HTMLInputElement).closest('button')) return;
    // Carte + illustration : la vignette se prend par sa zone ; ailleurs, la carte (figée) ne compte pas
    if(st.mode==='mix' && (st.mix.compo==='vig' ? (e.target as HTMLInputElement).id!=='illusHit' : (e.target as HTMLInputElement).closest('#slot'))) return;
    e.preventDefault(); try{ poster.setPointerCapture(e.pointerId); }catch(_){} pts.set(e.pointerId,local(e));
    if(pts.size===1){ moved=false; t0=Date.now(); }
    base(); poster.classList.add('dragging');
  });
  poster.addEventListener('pointermove',e=>{
    if(!pts.has(e.pointerId)) return; pts.set(e.pointerId,local(e));
    const P=[...pts.values()], c=mid(P), G=g0!;
    const z=P.length>1 && G.d>0 ? clamp(Math.round(G.z*dist(P)/G.d),ZMIN,ZMAX) : G.z;
    if(Math.hypot(c.x-G.c.x,c.y-G.c.y)>3 || z!==G.z) moved=true;
    apply(c,z,P.length===1); if(P.length>1) badge(z); redraw();
  });
  const end=(e: PointerEvent)=>{
    if(!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if(pts.size){ base(); return; }
    poster.classList.remove('dragging');
    if(!moved && Date.now()-t0<300){   // double toucher : image ajustée, centrée
      if(Date.now()-lastTap<350){ update(_s=>Object.assign(_s.illus,{zoom:100,ox:0,oy:0})); badge(100); redraw(); lastTap=0; }
      else lastTap=Date.now();
    }
    syncInputs(); syncImage(); saveState();
  };
  poster.addEventListener('pointerup',end); poster.addEventListener('pointercancel',end);
  poster.addEventListener('wheel',e=>{
    if(!editing()) return; e.preventDefault();
    const c=local(e); pts.clear(); g0={c, d:0, ox:st.illus.ox, oy:st.illus.oy, z:st.illus.zoom};
    const z=clamp(Math.round(st.illus.zoom*Math.exp(-e.deltaY*0.0015)),ZMIN,ZMAX); apply(c,z,false); badge(z); redraw();
    clearTimeout(wheelT); wheelT=setTimeout(()=>{ syncInputs(); syncImage(); saveState(); },300);
  },{passive:false});
  // Composition (Carte + illustration)
  // Côte à côte impose le paysage ; une autre composition rend l'orientation d'avant (#77)
  let coteFrom: string | null=null;
  const mixSet=(f: string,v: string)=>{update(()=>{ const was=st.mix.compo; update(_s=>{ (_s.mix as Opts)[f]=v; });
    if(f==='compo' && v==='cote' && st.orient!=='landscape'){ coteFrom=st.orient; setOrient('landscape'); toast('Côte à côte : affiche passée en paysage'); }
    else if(f==='compo' && was==='cote' && v!=='cote' && coteFrom && st.orient==='landscape'){ setOrient(coteFrom); toast('Affiche revenue en portrait'); }
    if(f==='compo' && v!=='cote') coteFrom=null;
    syncCompo(); syncImage(); ui.snap=null; layoutPreview(); placeHit(); saveState(); });};
  document.querySelectorAll<HTMLElement>('#mixSplitSeg button').forEach(b=>b.onclick=()=>mixSet('split',b.dataset.v!));
  $('bScanPistes').onclick=scanPistes;
  // Wikipédia : cocher l'option vaut accord pour ce service, après l'accord général (needConsent) ; aucune requête avant le bouton
  $('wikiOn').onchange=e=>{ if(!(e.target as HTMLInputElement).checked){ CMS.wiki.cancel(); setWiki(false); return; }
    if(needConsent(()=>setWiki(true))) setWiki(true); else (e.target as HTMLInputElement).checked=false; };
  $('bWikiPistes').onclick=scanWiki;
  addEventListener('online',syncWiki); addEventListener('offline',syncWiki); syncWiki();
  document.querySelectorAll<HTMLElement>('#compoSeg button').forEach(b=>b.onclick=()=>mixSet('compo',b.dataset.v!));
  document.querySelectorAll<HTMLElement>('#mixShapeSeg button').forEach(b=>b.onclick=()=>mixSet('shape',b.dataset.v!));
  document.querySelectorAll<HTMLElement>('#mixPosSeg button').forEach(b=>b.onclick=()=>mixSet('pos',b.dataset.v!));
  $('bToPrompt').onclick=()=>setStep('prompt');
  new ResizeObserver(()=>placeHit()).observe(poster);
  // Style du titre
  swatches('swText',SW_TEXT,'color',true); swatches('swShadow',SW_SHADOW,'shadow'); swatches('swOutline',SW_OUTLINE,'outline');
  C.POS.forEach((p: string,i: number)=>{ const b=h('button',{type:'button',dataset:{v:p},'aria-label':`Titre ${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`,title:`${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`},POS_ARROWS[i]);
    b.onclick=()=>setPos('title',p); $('tPosSeg').append(b);
    const f=h('button',{type:'button',dataset:{v:p},'aria-label':`Lignes du bas ${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`,title:`${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`},POS_ARROWS[i]);
    f.onclick=()=>setPos('foot',p); $('fPosSeg').append(f); });
  $('fAutoBtn').onclick=()=>setPos('foot','auto'); $('tLayBtn').onclick=()=>setPos('title','auto');
  // Trait des plaques, ordre des lignes (Plus de réglages : mémorisé, ouvert d'office si un de ses réglages est actif)
  const setPlate=(f: string,v: unknown)=>{ update(_s=>(_s.illusText.plate={...st.illusText.plate,[f]:v})); syncPlate(); scheduleOver(); saveState(); };
  $('plateLineSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>setPlate('line',b.dataset.v));
  for(const [hex,name] of SW_PLATE){ const auto=hex==='auto', b=h('button',{type:'button',className:'sw'+(auto?' auto':''),dataset:{v:hex},title:name,'aria-label':name},...(auto ? [h('span',{},'Auto')] : []));
    if(!auto) b.style.background=hex; b.onclick=()=>setPlate('color',hex); $('swPlate').append(b); }
  { const i=h('input',{type:'color','aria-label':'Autre couleur du trait'}); i.oninput=()=>setPlate('color',i.value.toUpperCase()); $('swPlate').append(h('label',{className:'sw custom',title:'Autre couleur'},i)); }
  for(const [hex,name] of SW_FILL){ const auto=hex==='auto', b=h('button',{type:'button',className:'sw'+(auto?' auto':''),dataset:{v:hex},title:name,'aria-label':'Fond : '+name},...(auto ? [h('span',{},'Auto'),h('i',{'aria-hidden':'true'})] : []));
    if(!auto) b.style.background=hex; b.onclick=()=>setPlate('fill',hex); $('swPlateFill').append(b); }
  { const i=h('input',{type:'color','aria-label':'Autre couleur du fond'}); i.oninput=()=>setPlate('fill',i.value.toUpperCase()); $('swPlateFill').append(h('label',{className:'sw custom',title:'Autre couleur'},i)); }
  // depuis la carte d'un bloc : ouvrir les réglages du fond et du trait
  $('bPlateOpts').onclick=()=>{ $<HTMLDetailsElement>('textMore').open=true; CMS.panelScroll.to($('hPlate'),'start',true); };
  $('bOrderReset').onclick=()=>{ update(_s=>(_s.lineOrder=null)); syncOrder(); changed(); toast('Lignes dans l\u2019ordre du gabarit · « Annuler » pour revenir'); };
  try{ if(localStorage.getItem(MORE_KEY)==='1') $<HTMLDetailsElement>('textMore').open=true; }catch(e){}
  $<HTMLDetailsElement>('textMore').addEventListener('input',syncMoreOpen); $<HTMLDetailsElement>('textMore').addEventListener('click',e=>{ if(!(e.target as HTMLInputElement).closest('summary')) setTimeout(syncMoreOpen); });
  $<HTMLDetailsElement>('textMore').addEventListener('toggle',()=>{ if(IS.moreAuto){ IS.moreAuto=false; return; } try{ $<HTMLDetailsElement>('textMore').open ? localStorage.setItem(MORE_KEY,'1') : localStorage.removeItem(MORE_KEY); }catch(e){} });
  // Présentation et zone des blocs (#86)
  for(const v of C.FOOT_TPLS){ const b=h('button',{type:'button',className:'chip',dataset:{v},title:TPL_TIPS[v]},TPL_NAMES[v]); b.onclick=()=>setTpl(v); $('fTplSeg').append(b); }
  for(const [k,seg,list] of [['title','tDecoSeg',C.DECOS],['foot','fDecoSeg',C.FOOT_DECOS]])
    for(const d of list){ const b=h('button',{type:'button',className:'chip',dataset:{v:d},title:DECO_TIPS[d]},DECO_NAMES[d]); b.onclick=()=>setDeco(k,d); $(seg).append(b); }
  for(const [k,seg] of [['title','tZoneSeg'],['foot','fZoneSeg']]) $(seg).querySelectorAll('button').forEach(b=>b.onclick=()=>setZone(k,b.dataset.v!));
  refresh.prompt=syncPrompt; refresh.wiki=syncWiki;   // rappels de la couche des pistes
  initHits();
  sync();
  if(st.mode==='illus' && ui.tab==='lieu') showTab('illus');   // reprise d'une affiche illustrée : son étape principale
  setTimeout(()=>collect().catch(()=>{}),2000);   // images orphelines (affiches supprimées, autre image importée)
}
/** Supprime les images que plus rien n'utilise (affiche en cours, Mes affiches) */
const collect=()=>gc(loadSaves);
CMS.define('illus', () => {
  return {init, draw, drawMix, textLayout, textStyle, posOf, mapMoved, drawMapTexts, decoOf, decoWhy, zoneOf, arcShape, plateInk, get hitInfo(){ return IS.hitInfo; }, previewImage, compoLine, region, ratioText, osmPiste, omtPiste, rankPistes, scanPistes, get found(){ return IS.found; }, ready, importFile, removeImage, setMode, ensureImage, gc: collect, exportImages, importImages, attachImages, FILE, refOf,
    get missing(){ return IS.missing; }, get loading(){ return !!IS.loading; }, buildPrompt, quality, cropPct, placement, adjust, processPixels,
    layer, setLayer, zoomBy, recenter,
    get step(){ return IS.step; }, get image(){ return IS.img && {w:IS.img.w, h:IS.img.h, name:IS.img.name}; }};
});
