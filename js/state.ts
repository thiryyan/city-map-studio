/* City Map Studio — État de l'affiche : validation, chargement, enregistrement ; fenêtres modales ; accord préalable.
 * Module TypeScript (#103), importé par js/main.js ; réuni en un seul script par le build (scripts/build.mjs). */
import {late} from './core.js';
import {DEFAULT_STATE, FONTS, FORMATS, LAYOUTS, MARKERS, STORE_KEY, TEXTURES, THEMES} from './config.js';
// ---------- Validation de l'état (lien partagé, localStorage) ----------
// Un état venu de l'extérieur n'est jamais repris tel quel : seuls les champs connus sont lus, chacun est vérifié
// (type, liste de valeurs, bornes) et remplacé par sa valeur par défaut s'il est invalide. Un lien forgé ne peut donc
// ni casser l'application, ni rester enregistré dans le navigateur.
/** Donnée venue de l'extérieur (lien, localStorage, fichier) : lue champ par champ, chaque valeur vérifiée */
type Ext = Record<string, any>;
export interface LatLon { lat: number; lon: number }
const V = {
  num:<D,>(v: unknown, d: D, a: number, b: number): number | D=>typeof v==='number' && Number.isFinite(v) ? Math.min(b,Math.max(a,v)) : d,
  bool:(v: unknown, d: boolean): boolean=>typeof v==='boolean' ? v : d,
  str:(v: unknown, d: string, max=200): string=>typeof v==='string' ? v.slice(0,max) : d,
  oneOf:<T,>(v: unknown, list: readonly T[], d: T): T=>list.includes(v as T) ? v as T : d,
  hex:(v: unknown, d: string): string=>typeof v==='string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : d,
  obj:(v: unknown): Ext=>v && typeof v==='object' && !Array.isArray(v) ? v as Ext : {},
  /** Point {lat, lon} valide (projection de Mercator : latitude ±85,06°), sinon null */
  ll:(p: unknown): LatLon | null=>{ const q=p as Ext; return q && typeof q==='object' && Number.isFinite(q.lat) && Number.isFinite(q.lon) && Math.abs(q.lat)<=85.06 && Math.abs(q.lon)<=180 ? {lat:q.lat,lon:q.lon} : null; },
  /** Chaque clé de `def` : valeur de `src` vérifiée par `check(valeur, défaut)` */
  each:<T,>(src: unknown, def: Record<string, T>, check: (v: unknown, d: T)=>T): Record<string, T>=>{ const s=V.obj(src), o: Record<string, T>={}; for(const k of Object.keys(def)) o[k]=check(s[k],def[k]); return o; }
};
const SHARE_MAX_CHARS = 64*1024, SHARE_MAX_BYTES = 512*1024, ROUTE_MAX_PTS = 5000;
/** Complète un état enregistré ou partagé avec les valeurs par défaut (champs ajoutés depuis) et rejette toute valeur invalide */
function normState(src: unknown){
  const s=V.obj(src), D=structuredClone(DEFAULT_STATE), keys=(a: readonly (readonly unknown[])[])=>a.map(x=>x[0] as string);
  const view=(v: unknown, dv: {zoom: number})=>{ const o=V.obj(v), c=V.ll(o.center), m=V.ll(o.marker);
    return c && m ? {center:c, zoom:V.num(o.zoom,dv.zoom,1,22), marker:m} : null; };
  const route=(r: unknown)=>{ const o=V.obj(r); if(!Array.isArray(o.pts)) return null;
    const pts=o.pts.slice(0,ROUTE_MAX_PTS).filter(p=>Array.isArray(p) && V.ll({lat:p[0],lon:p[1]})).map(p=>[p[0],p[1]]);
    if(pts.length<2) return null;
    const wpts=(Array.isArray(o.wpts)?o.wpts:[]).map(p=>{ const q=V.ll(p); return q && {...q,name:V.str(p.name,'',80)}; }).filter(Boolean).slice(0,20);
    return {name:V.str(o.name,''), pts, show:V.bool(o.show,true), ...(wpts.length?{wpts}:{})}; };
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
    lineOrder:CMS.order.norm(s.lineOrder),
    texture:V.oneOf(s.texture,keys(TEXTURES),D.texture),
    markers2:(Array.isArray(s.markers2)?s.markers2:[]).map((p: Ext)=>{ const q=V.ll(p); return q && {...q,label:V.str(p.label,'')}; }).filter((m): m is LatLon & {label: string}=>!!m).slice(0,2),
    markerLabel:V.str(s.markerLabel,''), numbered:V.bool(s.numbered,D.numbered), linkMarkers:V.bool(s.linkMarkers,D.linkMarkers),
    route:route(s.route),
    routeStyle:{color:V.oneOf(V.obj(s.routeStyle).color,['marker','roadMajor','frame'],D.routeStyle.color),
      width:V.num(V.obj(s.routeStyle).width,D.routeStyle.width,0.5,3), dash:V.bool(V.obj(s.routeStyle).dash,D.routeStyle.dash)},
    routePrompt:(()=>{ const o=V.obj(s.routePrompt), d=D.routePrompt;
      return {kind:V.oneOf(o.kind,['walk','bike','car','trip'],d.kind), loop:V.bool(o.loop,d.loop),
        off:[...new Set((Array.isArray(o.off)?o.off:[]).filter(i=>[0,1,2].includes(i)))].sort(), extra:V.str(o.extra,'',400), lang:V.oneOf(o.lang,['fr','en'],d.lang)}; })(),
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
  function normIllus(src: unknown, d: typeof DEFAULT_STATE.illus){
    const o=V.obj(src), p=V.obj(o.prompt), C=CMS.illusConf, keys=(a: readonly (readonly unknown[])[])=>a.map(x=>x[0] as string);
    const pistes=[...new Set((Array.isArray(p.pistes)?p.pistes:[]).filter((x: unknown): x is string=>typeof x==='string').map((x: string)=>x.replace(/\s+/g,' ').trim().slice(0,80)).filter(Boolean))].slice(0,C.PISTES_MAX);
    return {fit:V.oneOf(o.fit,C.FITS,d.fit), zoom:V.num(o.zoom,d.zoom,30,300), ox:V.num(o.ox,d.ox,-1,1), oy:V.num(o.oy,d.oy,-1,1),
      bright:V.num(o.bright,d.bright,-50,50), contrast:V.num(o.contrast,d.contrast,-50,50), satur:V.num(o.satur,d.satur,-50,50),
      vintage:V.oneOf(o.vintage,C.VINTAGE,d.vintage), grain:V.bool(o.grain,d.grain), paper:V.bool(o.paper,d.paper), flat:V.bool(o.flat,d.flat),
      upscale:V.bool(o.upscale,d.upscale),
      img:(()=>{ const m=V.obj(o.img); return typeof m.ref==='string' && /^[0-9a-f]{64}$/.test(m.ref)
        ? {ref:m.ref, name:V.str(m.name,'image',120)||'image', w:Math.round(V.num(m.w,1,1,100000)), h:Math.round(V.num(m.h,1,1,100000))} : null; })(),
      prompt:{pistes, moment:V.oneOf(p.moment,keys(C.MOMENTS),d.prompt.moment), saison:V.oneOf(p.saison,keys(C.SAISONS),d.prompt.saison),
        palette:V.oneOf(p.palette,C.PALETTES,d.prompt.palette), lang:V.oneOf(p.lang,C.LANGS,d.prompt.lang)}};
  }
  /** Style et position des textes : ombre et contour acceptent '' (aucun) ; style, lettres et ombre acceptent 'auto'.
   *  Migration d'un état antérieur aux valeurs Auto (sans v:2, #74) : style Vintage → Auto (même rendu dans chaque mode) ;
   *  affiche Carte : lettres, ombre et contour reviennent à Auto (le mode Carte ne les dessinait pas : rendu inchangé). */
  function normIllusText(src: unknown, d: typeof DEFAULT_STATE.illusText){
    const o=V.obj(src), C=CMS.illusConf, hexOrNone=(v: unknown, dv: string)=>v==='' ? '' : V.hex(v,dv), orAuto=(v: unknown, f: ()=>string)=>v==='auto' ? 'auto' : f();
    const pt=(p: unknown)=>{ const q=V.obj(p); return Number.isFinite(q.x) && Number.isFinite(q.y) ? {x:V.num(q.x,0.5,0,1), y:V.num(q.y,0.5,0,1)} : null; };   // position libre
    const m=V.obj(o.map), dm=d.map;
    // présentation des blocs (#86) ; un état antérieur n'en a pas : texte seul
    // le ruban (avant #90) devient la capsule
    const deco=(x: unknown)=>{ const q=V.obj(x), t=q.title==='ruban' ? 'capsule' : q.title; return {title:V.oneOf(t,C.DECOS,'libre'), foot:V.oneOf(q.foot,C.FOOT_DECOS,'libre')}; };
    const ftpl=(v: unknown)=>V.oneOf(v,C.FOOT_TPLS,'classique');
    const T={v:2, style:V.oneOf(o.style,C.TSTYLES,d.style), color:orAuto(o.color,()=>V.hex(o.color,d.color)), shadow:orAuto(o.shadow,()=>hexOrNone(o.shadow,d.shadow)),
      outline:hexOrNone(o.outline,d.outline), off:V.num(o.off,d.off,1,12), pos:V.oneOf(o.pos,C.POS,d.pos),
      free:pt(o.free), fpos:V.oneOf(o.fpos,['auto',...C.POS],d.fpos), ffree:pt(o.ffree), deco:deco(o.deco),
      plate:((q: Ext)=>({line:V.oneOf(q.line,C.PLATE_LINES,d.plate.line), w:V.num(q.w,d.plate.w,0.5,3), color:orAuto(q.color,()=>V.hex(q.color,'#2C2A29')), gap:V.num(q.gap,d.plate.gap,0.5,2.5),
        fill:orAuto(q.fill,()=>V.hex(q.fill,'#F3EAD8')), alpha:V.num(q.alpha,d.plate.alpha,0,1)}))(V.obj(o.plate)), ftpl:ftpl(o.ftpl),
      map:{pos:V.oneOf(m.pos,['auto',...C.POS],dm.pos), free:pt(m.free), fpos:V.oneOf(m.fpos,['auto',...C.POS],dm.fpos), ffree:pt(m.ffree), deco:deco(m.deco), ftpl:ftpl(m.ftpl)}};
    // Carte + illustration : positions propres (#77). Un état antérieur, où elles étaient partagées avec l'Illustration, les reprend.
    const x: Ext=o.mix ? V.obj(o.mix) : {pos:T.pos,free:T.free,fpos:T.fpos,ffree:T.ffree};
    const z=V.obj(x.zone);
    const R={...T, mix:{pos:V.oneOf(x.pos,C.POS,d.mix.pos), free:pt(x.free), fpos:V.oneOf(x.fpos,['auto',...C.POS],d.mix.fpos), ffree:pt(x.ffree),
      deco:deco(o.mix && x.deco), zone:{title:V.oneOf(z.title,C.ZONES,'illus'), foot:V.oneOf(z.foot,C.ZONES,'illus')}, ftpl:ftpl(o.mix && x.ftpl)}};
    if(o.v!==2 && Object.keys(o).length){
      if(R.style==='vintage') R.style='auto';
      if(V.oneOf(s.mode,C.MODES,'map')==='map') Object.assign(R,{color:'auto',shadow:'auto',outline:''});
    }
    return R;
  }
}
let st = loadState();
/** État de l'interface, non enregistré (champs posés en cours de route par les autres modules : Ext) */
const ui: Ext = {intent:'map', clean:false, inkSink:null, comparing:false, cmpKeep:null, placing:false, framing:false, sheet:'half', sheetBefore:null, tab:'lieu', posterCss:{w:0,h:0}, dpr:1, slotCss:{x:0,y:0,w:0,h:0}};
let mlMap: any = null, osmData: any = null;   // carte MapLibre, données OSM importées (non typées)
let mlLib = 'loading', mlCdn = '', mlFailMsg = '';   // état de la librairie MapLibre
// Modules ES : une variable importée ne se réaffecte pas ; les autres fichiers passent par ces fonctions (#102)
const setMlMap = (v: any) => { mlMap = v; }, setOsmData = (v: any) => { osmData = v; };
const setMlLib = (v: string) => { mlLib = v; }, setMlCdn = (v: string) => { mlCdn = v; }, setMlFailMsg = (v: string) => { mlFailMsg = v; };

// ---------- Fenêtres modales ----------
// <dialog> + showModal() : focus retenu dans la fenêtre, arrière-plan inerte, touche Échap (événement « cancel »).
// La classe « show » reste posée sur la fenêtre ouverte (état lisible par les tests et le CSS de secours).
const dlgOpener=new Map<string, Element | null>(), dlgCancel: Record<string, ()=>void>={};
const dlg=(id: string)=>document.getElementById(id) as HTMLDialogElement;
function openDialog(id: string){
  const d=dlg(id); if(d.open) return;
  dlgOpener.set(id,document.activeElement); d.classList.add('show');
  if(typeof d.showModal==='function') d.showModal(); else d.setAttribute('open','');
}
function closeDialog(id: string){
  const d=dlg(id); d.classList.remove('show');
  if(d.open){ if(typeof d.close==='function') d.close(); else d.removeAttribute('open'); }
  const o=dlgOpener.get(id); dlgOpener.delete(id);
  if(o && o!==document.body && o.isConnected && typeof (o as HTMLElement).focus==='function') (o as HTMLElement).focus({preventScroll:true});   // retour à l'élément d'origine
}
/** Échap : action propre à chaque fenêtre (refuser, passer, fermer) au lieu de la fermeture brute du navigateur */
function initDialogs(){
  for(const d of document.querySelectorAll('dialog.modal')){
    d.addEventListener('cancel',e=>{ e.preventDefault(); (dlgCancel[d.id]||(()=>closeDialog(d.id)))(); });
    d.addEventListener('close',()=>d.classList.remove('show'));
  }
}
/** Écran d'attente : annoncé aux lecteurs d'écran, le reste de la page devient inerte */
let busyFocus: Element | null=null;
const byId=(id: string)=>document.getElementById(id) as HTMLElement;
function setBusy(on: boolean, txt?: string){
  if(txt) byId('busyTxt').textContent=txt;
  if(on && !busyFocus) busyFocus=document.activeElement;   // la page devient inerte : le focus est rendu à la fin
  byId('busy').classList.toggle('show',!!on);
  byId('app').inert=!!on; byId('busy').setAttribute('aria-busy',String(!!on));
  if(!on && busyFocus){ const f=busyFocus; busyFocus=null; if(f.isConnected && typeof (f as HTMLElement).focus==='function') (f as HTMLElement).focus({preventScroll:true}); }
}

// ---------- Accord préalable aux services tiers (RGPD) ----------
// Aucune requête vers un service tiers (tuiles, Nominatim, CDN) avant l'accord explicite de l'utilisateur.
const CONSENT_KEY = 'cms3.consent';
let consent = (()=>{ try{ return localStorage.getItem(CONSENT_KEY)==='1'; }catch(e){ return false; } })();
let consentNext: (()=>void) | null = null;
/** true si l'accord est donné ; sinon affiche la demande et exécute `next` après acceptation */
function needConsent(next?: ()=>void){
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
    if(mlLib==='fail'||mlLib==='local-fail'){ await late.loadMaplibre(); late.updateEngineUI(); }
    if(next) next();
    late.maybeWelcome();
    if(st.engine==='maplibre') late.renderMap(true);                              // la carte s'affiche dans tous les cas
  })();
}
function declineConsent(){
  consentNext=null; closeDialog('consent');
  late.setEngine('file',true); late.openAdvanced(true); late.maybeWelcome();   // consigne d'import : ligne d'état et section Avancé
  if(!osmData) late.setStatus('Hors ligne · importez un fichier de données (onglet Lieu)','wait');
}
function withdrawConsent(){
  try{ localStorage.removeItem(CONSENT_KEY); }catch(e){}
  location.reload();
}
function updateConsentInfo(){
  const el=byId('consentInfo'); el.textContent='';
  el.append(consent ? 'Services cartographiques autorisés (OpenFreeMap, Nominatim). ' : 'Aucun service tiers n\'est contacté sans votre accord. ');
  const b=document.createElement('button'); b.className='btn sm'; b.type='button';
  b.textContent = consent ? 'Retirer l\'accord' : 'Autoriser la carte';
  b.onclick = consent ? withdrawConsent : ()=>needConsent();
  el.append(b);
}

function loadState(){
  try{ const s=JSON.parse(localStorage.getItem(STORE_KEY)||'null'); if(s && typeof s==='object') return normState(s); }catch(e){}
  return structuredClone(DEFAULT_STATE);
}
let saveT=0;
function saveState(){if(ui.comparing) return; clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(STORE_KEY,JSON.stringify(st))}catch(e){} CMS.emit('state:saved');},300)}
function getPath(o: unknown, p: string): any {return p.split('.').reduce((a: any,k)=>a?.[k],o)}
function setPath(o: unknown, p: string, v: unknown){const ks=p.split('.');const last=ks.pop() as string;ks.reduce((a: any,k)=>a[k],o)[last]=v}

// Fonctions lues par des fichiers chargés avant celui-ci (registre late de js/core.ts)
Object.assign(late, {st});

export {SHARE_MAX_BYTES, SHARE_MAX_CHARS, V, closeDialog, consent, declineConsent, dlgCancel, getPath, giveConsent, initDialogs, mlCdn, mlFailMsg, mlLib, mlMap, needConsent, normState, openDialog, osmData, saveState, saveT, setBusy, setMlCdn, setMlFailMsg, setMlLib, setMlMap, setOsmData, setPath, st, ui, updateConsentInfo};
