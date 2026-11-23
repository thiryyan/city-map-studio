/* City Map Studio — État de l'affiche : validation, chargement, enregistrement ; fenêtres modales ; accord préalable.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html. */
'use strict';
// ---------- Validation de l'état (lien partagé, localStorage) ----------
// Un état venu de l'extérieur n'est jamais repris tel quel : seuls les champs connus sont lus, chacun est vérifié
// (type, liste de valeurs, bornes) et remplacé par sa valeur par défaut s'il est invalide. Un lien forgé ne peut donc
// ni casser l'application, ni rester enregistré dans le navigateur.
const V = {
  num:(v,d,a,b)=>typeof v==='number' && Number.isFinite(v) ? Math.min(b,Math.max(a,v)) : d,
  bool:(v,d)=>typeof v==='boolean' ? v : d,
  str:(v,d,max=200)=>typeof v==='string' ? v.slice(0,max) : d,
  oneOf:(v,list,d)=>list.includes(v) ? v : d,
  hex:(v,d)=>typeof v==='string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : d,
  obj:v=>v && typeof v==='object' && !Array.isArray(v) ? v : {},
  /** Point {lat, lon} valide (projection de Mercator : latitude ±85,06°), sinon null */
  ll:p=>p && typeof p==='object' && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat)<=85.06 && Math.abs(p.lon)<=180 ? {lat:p.lat,lon:p.lon} : null,
  /** Chaque clé de `def` : valeur de `src` vérifiée par `check(valeur, défaut)` */
  each:(src,def,check)=>{ const s=V.obj(src), o={}; for(const k of Object.keys(def)) o[k]=check(s[k],def[k]); return o; }
};
const SHARE_MAX_CHARS = 64*1024, SHARE_MAX_BYTES = 512*1024, ROUTE_MAX_PTS = 5000;
/** Complète un état enregistré ou partagé avec les valeurs par défaut (champs ajoutés depuis) et rejette toute valeur invalide */
function normState(src){
  const s=V.obj(src), D=structuredClone(DEFAULT_STATE), keys=a=>a.map(x=>x[0]);
  const view=(v,dv)=>{ const o=V.obj(v), c=V.ll(o.center), m=V.ll(o.marker);
    return c && m ? {center:c, zoom:V.num(o.zoom,dv.zoom,1,22), marker:m} : null; };
  const route=(r)=>{ const o=V.obj(r); if(!Array.isArray(o.pts)) return null;
    const pts=o.pts.slice(0,ROUTE_MAX_PTS).filter(p=>Array.isArray(p) && V.ll({lat:p[0],lon:p[1]})).map(p=>[p[0],p[1]]);
    return pts.length>=2 ? {name:V.str(o.name,''), pts, show:V.bool(o.show,true)} : null; };
  return {
    engine:V.oneOf(s.engine,['maplibre','file'],D.engine),
    layout:V.oneOf(s.layout,keys(LAYOUTS),D.layout),
    theme:V.oneOf(s.theme,Object.keys(THEMES),D.theme),
    colors:V.each(s.colors,D.colors,V.hex),
    center:V.ll(s.center)||D.center, zoom:V.num(s.zoom,D.zoom,1,22), marker:V.ll(s.marker)||D.marker,
    markerStyle:V.oneOf(s.markerStyle,keys(MARKERS),D.markerStyle), markerFill:V.bool(s.markerFill,D.markerFill),
    markerSize:V.num(s.markerSize,D.markerSize,10,300), markerOpacity:V.num(s.markerOpacity,D.markerOpacity,0.2,1),
    coordFormat:V.oneOf(s.coordFormat,['dec','dms'],D.coordFormat), coordsManual:V.str(s.coordsManual,''),
    texts:V.each(s.texts,D.texts,(v,d)=>V.str(v,d)),
    show:V.each(s.show,D.show,V.bool),
    textScale:V.each(s.textScale,D.textScale,(v,d)=>V.num(v,d,60,150)),
    textScaleAll:V.num(s.textScaleAll,D.textScaleAll,70,140),
    font:V.oneOf(s.font,Object.keys(FONTS),D.font), margin:V.num(s.margin,D.margin,3,12),
    stroke:V.num(s.stroke,D.stroke,0.5,2.5), waterMult:V.num(s.waterMult,D.waterMult,0.5,3),
    ring:V.bool(s.ring,D.ring), attribution:V.bool(s.attribution,D.attribution),
    layers:V.each(s.layers,D.layers,V.bool),
    fontTitle:V.oneOf(s.fontTitle,['',...Object.keys(FONTS)],D.fontTitle),
    orient:V.oneOf(s.orient,['portrait','landscape'],D.orient),
    format:V.oneOf(s.format,keys(FORMATS),D.format), fileType:V.oneOf(s.fileType,['png','pdf'],D.fileType),
    dedWrap:V.oneOf(s.dedWrap,['auto','one','two'],D.dedWrap),
    texture:V.oneOf(s.texture,keys(TEXTURES),D.texture),
    markers2:(Array.isArray(s.markers2)?s.markers2:[]).map(p=>{ const q=V.ll(p); return q && {...q,label:V.str(p.label,'')}; }).filter(Boolean).slice(0,2),
    markerLabel:V.str(s.markerLabel,''), numbered:V.bool(s.numbered,D.numbered), linkMarkers:V.bool(s.linkMarkers,D.linkMarkers),
    route:route(s.route),
    routeStyle:{color:V.oneOf(V.obj(s.routeStyle).color,['marker','roadMajor','frame'],D.routeStyle.color),
      width:V.num(V.obj(s.routeStyle).width,D.routeStyle.width,0.5,3), dash:V.bool(V.obj(s.routeStyle).dash,D.routeStyle.dash)},
    active:V.oneOf(s.active,[0,1],0), place2:view(s.place2,D),
    sky:{when:typeof V.obj(s.sky).when==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(s.sky.when) ? s.sky.when : '',
      tz:V.obj(s.sky).tz==='auto' ? 'auto' : V.num(V.obj(s.sky).tz,'auto',-720,840),
      lines:V.bool(V.obj(s.sky).lines,D.sky.lines), grid:V.bool(V.obj(s.sky).grid,D.sky.grid),
      moon:V.bool(V.obj(s.sky).moon,D.sky.moon), planets:V.bool(V.obj(s.sky).planets,D.sky.planets), milky:V.bool(V.obj(s.sky).milky,D.sky.milky)},
    fx:V.each(s.fx,D.fx,V.bool),
    focusR:V.num(s.focusR,D.focusR,10,60),
    orn:V.each(s.orn,D.orn,V.bool),
    folds:V.bool(s.folds,D.folds),
    mode:V.oneOf(s.mode,CMS.illusConf.MODES,D.mode),
    mix:{compo:V.oneOf(V.obj(s.mix).compo,CMS.illusConf.COMPOS,D.mix.compo), shape:V.oneOf(V.obj(s.mix).shape,CMS.illusConf.SHAPES,D.mix.shape), pos:V.oneOf(V.obj(s.mix).pos,CMS.illusConf.MPOS,D.mix.pos), split:V.oneOf(V.obj(s.mix).split,CMS.illusConf.SPLITS,D.mix.split)},
    illus:normIllus(s.illus,D.illus),
    illusText:normIllusText(s.illusText,D.illusText)
  };
  /** Illustration : cadrage, retouches, filtre et choix du prompt (pistes : textes courts, 8 au plus, sans doublon) */
  function normIllus(src,d){
    const o=V.obj(src), p=V.obj(o.prompt), C=CMS.illusConf, keys=a=>a.map(x=>x[0]);
    const pistes=[...new Set((Array.isArray(p.pistes)?p.pistes:[]).filter(x=>typeof x==='string').map(x=>x.replace(/\s+/g,' ').trim().slice(0,80)).filter(Boolean))].slice(0,C.PISTES_MAX);
    return {fit:V.oneOf(o.fit,C.FITS,d.fit), zoom:V.num(o.zoom,d.zoom,100,300), ox:V.num(o.ox,d.ox,-1,1), oy:V.num(o.oy,d.oy,-1,1),
      bright:V.num(o.bright,d.bright,-50,50), contrast:V.num(o.contrast,d.contrast,-50,50), satur:V.num(o.satur,d.satur,-50,50),
      vintage:V.oneOf(o.vintage,C.VINTAGE,d.vintage), grain:V.bool(o.grain,d.grain), paper:V.bool(o.paper,d.paper), flat:V.bool(o.flat,d.flat),
      upscale:V.bool(o.upscale,d.upscale),
      img:(()=>{ const m=V.obj(o.img); return typeof m.ref==='string' && /^[0-9a-f]{64}$/.test(m.ref)
        ? {ref:m.ref, name:V.str(m.name,'image',120)||'image', w:Math.round(V.num(m.w,1,1,100000)), h:Math.round(V.num(m.h,1,1,100000))} : null; })(),
      prompt:{pistes, moment:V.oneOf(p.moment,keys(C.MOMENTS),d.prompt.moment), saison:V.oneOf(p.saison,keys(C.SAISONS),d.prompt.saison),
        palette:V.oneOf(p.palette,C.PALETTES,d.prompt.palette), lang:V.oneOf(p.lang,C.LANGS,d.prompt.lang)}};
  }
  /** Textes des modes illustrés : ombre et contour acceptent '' (aucun) */
  function normIllusText(src,d){
    const o=V.obj(src), hexOrNone=(v,dv)=>v==='' ? '' : V.hex(v,dv);
    return {style:V.oneOf(o.style,CMS.illusConf.TSTYLES,d.style), color:V.hex(o.color,d.color), shadow:hexOrNone(o.shadow,d.shadow),
      outline:hexOrNone(o.outline,d.outline), off:V.num(o.off,d.off,1,12), pos:V.oneOf(o.pos,CMS.illusConf.POS,d.pos)};
  }
}
let st = loadState();
const ui = {clean:false, inkSink:null, comparing:false, cmpKeep:null, placing:false, framing:false, sheet:'half', sheetBefore:null, tab:'lieu', posterCss:{w:0,h:0}, dpr:1, slotCss:{x:0,y:0,w:0,h:0}};
let mlMap = null, osmData = null;
let mlLib = 'loading', mlCdn = '', mlFailMsg = '';   // état de la librairie MapLibre

// ---------- Fenêtres modales ----------
// <dialog> + showModal() : focus retenu dans la fenêtre, arrière-plan inerte, touche Échap (événement « cancel »).
// La classe « show » reste posée sur la fenêtre ouverte (état lisible par les tests et le CSS de secours).
const dlgOpener=new Map(), dlgCancel={};
function openDialog(id){
  const d=document.getElementById(id); if(d.open) return;
  dlgOpener.set(id,document.activeElement); d.classList.add('show');
  if(typeof d.showModal==='function') d.showModal(); else d.setAttribute('open','');
}
function closeDialog(id){
  const d=document.getElementById(id); d.classList.remove('show');
  if(d.open){ if(typeof d.close==='function') d.close(); else d.removeAttribute('open'); }
  const o=dlgOpener.get(id); dlgOpener.delete(id);
  if(o && o!==document.body && o.isConnected && typeof o.focus==='function') o.focus({preventScroll:true});   // retour à l'élément d'origine
}
/** Échap : action propre à chaque fenêtre (refuser, passer, fermer) au lieu de la fermeture brute du navigateur */
function initDialogs(){
  for(const d of document.querySelectorAll('dialog.modal')){
    d.addEventListener('cancel',e=>{ e.preventDefault(); (dlgCancel[d.id]||(()=>closeDialog(d.id)))(); });
    d.addEventListener('close',()=>d.classList.remove('show'));
  }
}
/** Écran d'attente : annoncé aux lecteurs d'écran, le reste de la page devient inerte */
let busyFocus=null;
function setBusy(on,txt){
  if(txt) document.getElementById('busyTxt').textContent=txt;
  if(on && !busyFocus) busyFocus=document.activeElement;   // la page devient inerte : le focus est rendu à la fin
  document.getElementById('busy').classList.toggle('show',!!on);
  document.getElementById('app').inert=!!on; document.getElementById('busy').setAttribute('aria-busy',String(!!on));
  if(!on && busyFocus){ const f=busyFocus; busyFocus=null; if(f.isConnected && typeof f.focus==='function') f.focus({preventScroll:true}); }
}

// ---------- Accord préalable aux services tiers (RGPD) ----------
// Aucune requête vers un service tiers (tuiles, Nominatim, CDN) avant l'accord explicite de l'utilisateur.
const CONSENT_KEY = 'cityMapStudio.consent';
let consent = (()=>{ try{ return localStorage.getItem(CONSENT_KEY)==='1'; }catch(e){ return false; } })();
let consentNext = null;
/** true si l'accord est donné ; sinon affiche la demande et exécute `next` après acceptation */
function needConsent(next){
  if(consent) return true;
  consentNext = next || null;
  openDialog('consent');
  return false;
}
function giveConsent(){
  consent=true; try{ localStorage.setItem(CONSENT_KEY,'1'); }catch(e){}
  closeDialog('consent');
  updateConsentInfo();
  const next=consentNext; consentNext=null;
  (async()=>{
    if(mlLib==='fail'||mlLib==='local-fail'){ await loadMaplibre(); updateEngineUI(); }
    if(next) next();
    maybeWelcome();
    if(st.engine==='maplibre') renderMap(true);                              // la carte s'affiche dans tous les cas
  })();
}
function declineConsent(){
  consentNext=null; closeDialog('consent');
  setEngine('file',true); openAdvanced(true); maybeWelcome();   // consigne d'import : ligne d'état et section Avancé
  if(!osmData) setStatus('Hors ligne · importez un fichier de données (onglet Lieu)','wait');
}
function withdrawConsent(){
  try{ localStorage.removeItem(CONSENT_KEY); }catch(e){}
  location.reload();
}
function updateConsentInfo(){
  const el=document.getElementById('consentInfo'); el.textContent='';
  el.append(consent ? 'Services cartographiques autorisés (OpenFreeMap, Nominatim). ' : 'Aucun service tiers n\'est contacté sans votre accord. ');
  const b=document.createElement('button'); b.className='btn sm'; b.type='button';
  b.textContent = consent ? 'Retirer l\'accord' : 'Autoriser la carte';
  b.onclick = consent ? withdrawConsent : ()=>needConsent();
  el.append(b);
}

// Clé d'un ancien moteur réseau retiré (suspensions de serveurs) : effacée pour ne pas laisser de donnée orpheline.
try{ localStorage.removeItem('cityMapStudio.opBlocked'); }catch(e){}

function loadState(){
  try{ const s=JSON.parse(localStorage.getItem(STORE_KEY)||'null'); if(s && typeof s==='object') return normState(s); }catch(e){}
  return structuredClone(DEFAULT_STATE);
}
let saveT=0;
function saveState(){if(ui.comparing) return; clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(STORE_KEY,JSON.stringify(st))}catch(e){} CMS.emit('state:saved');},300)}
function getPath(o,p){return p.split('.').reduce((a,k)=>a?.[k],o)}
function setPath(o,p,v){const ks=p.split('.');const last=ks.pop();ks.reduce((a,k)=>a[k],o)[last]=v}
