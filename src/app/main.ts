/* City Map Studio — Démarrage.
 * Module ES (#102), importé par src/app/main.ts ; réuni en un seul script par le build (scripts/build.mjs). */
// Ordre d'exécution des modules : celui des anciens scripts classiques (aucun import vers un fichier postérieur :
// registre late de src/core/cms.ts), donc chaque fichier s'exécute après ceux dont il dépend
import {TEST_HOOKS} from '../core/cms.js';
import '../core/cms.js';
import '../content/config.js';
import '../map/maplibre-loader.js';
import '../services/geocoder.js';
import '../services/wikipedia.js';
import '../core/doc/state.js';
import '../core/geo/geo.js';
import '../render/poster.js';
import '../map/engines.js';
import '../view/preview.js';
import '../features/features.js';
import '../features/route.js';
import '../ui/panel.js';
import '../features/illustration.js';
import '../features/export.js';
import {AMBIANCES, FONTS, THEMES} from '../content/config.js';
import {V, consent, declineConsent, dlgCancel, giveConsent, initDialogs, mlLib, mlMap, needConsent, normState, osmData, st, ui, updateConsentInfo} from '../core/doc/state.js';
import {dms, exportSpec, geom, posterDims} from '../core/geo/geo.js';
import {CART_ROWS, altAz, attributionText, cartDed, dedLines, drawMarker, drawPoster, drawText, foilCtx, markerOpts, metersPerPx, moonSun, planetsAt, skyTime, souvenirFoot, textW, typoFit} from '../render/poster.js';
import {VEC_CACHE_MAX, buildStyle, drawVectors, hatchTile, loadMaplibre, parseOsm, patTile, renderMaplibreOffscreen, setGlMaxTest, stitch, vecCache} from '../map/engines.js';
import {changed, composePoster, drawOp, drawOver, drawUnder, layoutPreview, renderMap, scheduleOver, setActivePlace, stage, textureBase} from '../view/preview.js';
import {addPlace, applyAmbiance, applyConfig, applyOccasion, applySheet, decodeShare, deleteSave, downloadBackup, downloadConfig, encodeShare, fitRoute, importConfigFile, initSaves, initSheet, loadFromHash, loadSaves, maybeWelcome, openSaves, paletteOf, parseGpx, photoTheme, placeAt, restoreSave, saveCurrent, setDedWrap, setFileType, setFormat, setFraming, setLayout, setOrient, setSheet, showBanner, welcomeDone} from '../features/features.js';
import {applyUiScale, buildUI, frDate, hist, histSnap, isoFromFr, loadFonts, parseCoords, redo, refreshCards, refreshColors, resetAll, setEngine, showTab, syncInputs, undo, updateEngineUI, updateHistUI} from '../ui/panel.js';
import {ENV, exportPoster, importText, runDiagnostics, showEnvWarning} from '../features/export.js';
import {$, h, pressed, setStatus, toast} from '../core/dom.js';
import {contrast, lum} from '../core/color.js';
// ---------- Démarrage ----------
async function boot(){
  buildUI(); CMS.illus.init(); CMS.route.init(); initSaves(); initSheet(); CMS.deps.init(); CMS.safe.init(); CMS.actbar.init(); CMS.changes.init(); applyUiScale();
  $('bConsentYes').onclick=giveConsent; $('bConsentFile').onclick=declineConsent; updateConsentInfo();
  dlgCancel.consent=declineConsent; initDialogs();
  showEnvWarning();
  if(st.engine==='file') st.engine='maplibre';   // un fichier importé n'est pas conservé entre deux sessions
  syncInputs();
  hist.cur=histSnap(); hist.quietUntil=Date.now()+2500; updateHistUI();   // l'état chargé est le point de départ de l'historique
  let rafL=0; new ResizeObserver(()=>{ if(!rafL) rafL=requestAnimationFrame(()=>{ rafL=0; layoutPreview(); }); }).observe(stage);
  addEventListener('resize',()=>applySheet());
  CMS.surface.watchDpr(()=>layoutPreview());   // densité changée sans redimensionnement : aperçu redessiné à la nouvelle densité
  layoutPreview();
  loadFonts().then(()=>{ scheduleOver(); refreshCards(); });
  loadFromHash();
  setTimeout(maybeWelcome,300);   // après l'éventuelle demande d'accord (affichée au démarrage)
  document.fonts && document.fonts.ready.then(()=>{ scheduleOver(); refreshCards(); });
  const ok=await loadMaplibre();
  updateEngineUI();
  if(ok){ if(st.engine==='maplibre') renderMap(true); }
  else if(mlLib==='local-fail'){ if(st.engine==='maplibre') needConsent(); }
  else if(st.engine==='maplibre'){
    toast('Librairie cartographique injoignable : passez au moteur « Fichier » ou lancez le diagnostic.',true);
    setStatus('MapLibre injoignable (aucun CDN accessible)','err');
    showBanner(true,'Carte indisponible','Diagnostiquer',runDiagnostics);
  }
  // Ouverture mesurée jusqu'à la carte GPU affichée (engines.ts) ; sans elle, jusqu'au premier aperçu
  if(!(ok && st.engine==='maplibre' && consent)) requestAnimationFrame(()=>CMS.perf.ready(st.engine==='file'?'moteur Fichier':'aperçu sans carte'));
  CMS.perf.watchFrames($('slot')); CMS.perfUI.init();
  installPwa();
  if(TEST_HOOKS) window.__cms={get mlMap(){return mlMap},buildStyle,hatchTile,get welcomeDone(){return welcomeDone},get ui(){return ui},setLayout,setOrient,setFormat,setFileType,setDedWrap,exportSpec,dedLines,renderMaplibreOffscreen,set glMaxTest(v: number){setGlMaxTest(v)},applyAmbiance,applyOccasion,setActivePlace,parseGpx,fitRoute,encodeShare,decodeShare,altAz,skyTime,contrast,THEMES,FONTS,AMBIANCES,composePoster,posterDims,saveCurrent,loadSaves,restoreSave,importConfigFile,applyConfig,textureBase,placeAt,addPlace,undo,redo,get hist(){return hist},frDate,isoFromFr,showTab,setSheet,setFraming,st,drawPoster,dms,geom,parseOsm,stitch,setEngine,exportPoster,importText,runDiagnostics,ENV,get osmData(){return osmData},get mlLib(){return mlLib},parseCoords,get consent(){return consent},resetAll,pwa:CMS.pwa};
  // Façade de test (#102, lot 4b) : les noms que les tests utilisent directement, exposés sur window en mode ?test
  // seulement. Le site construit n'a plus aucun nom global (script enveloppé dans une fonction) : cette liste est la
  // seule dépendance des tests envers la portée de l'application, et suivra la conversion en modules ES.
  if(TEST_HOOKS) Object.defineProperties(window, Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors({
    $, h, pressed, toast, setStatus, V, normState, THEMES, CART_ROWS,
    get st(){ return st; }, get consent(){ return consent; }, get foilCtx(){ return foilCtx; },
    lum, contrast, attributionText, parseCoords, encodeShare,
    changed, scheduleOver, layoutPreview, loadFonts, refreshColors, drawOver, drawUnder, drawOp, drawText,
    drawMarker, markerOpts, metersPerPx, patTile, moonSun, planetsAt, souvenirFoot, cartDed,
    drawVectors, vecCache, VEC_CACHE_MAX, openSaves, deleteSave, downloadConfig, downloadBackup, textW, typoFit, paletteOf, photoTheme
  })).filter(([k])=>!Object.prototype.hasOwnProperty.call(window,k))));
}
/** Application installable et utilisable hors ligne : manifeste et service worker (sw.js), seulement en http(s).
 *  En file://, le navigateur refuse les deux (simple bruit dans la console) : rien n'est déclaré.
 *  Désactivé pendant les tests (?test), sauf demande explicite (?test&sw) : le cache fausserait le réseau simulé.
 *  Mises à jour (issue #65) : un nouveau worker attend ; un bandeau propose « Mettre à jour », jamais de rechargement
 *  sans accord (export ou import en cours). Vérification au démarrage et au retour au premier plan, au plus une fois par heure. */
CMS.define('pwa', () => {
  const HOUR=3600e3;
  let reg: ServiceWorkerRegistration | null=null, last=0, wanted=false, refreshing=false, checks=0;
  const sw=()=>('serviceWorker' in navigator) ? navigator.serviceWorker : null;
  function showUpdate(on: boolean){
    $('updBanner').classList.toggle('show',!!on);
    if(ui.sheet==='peek') applySheet();
  }
  /** Version servie par le worker actif (copie hors ligne) ; null sans worker, hors ligne sans réponse, ou en file:// */
  function version(): Promise<string | null> {
    const c=sw() && sw()!.controller;
    if(!c) return Promise.resolve(null);
    return new Promise<string | null>(res=>{
      const ch=new MessageChannel(), t=setTimeout(()=>res(null),1500);
      ch.port1.onmessage=e=>{ clearTimeout(t); res(typeof e.data==='string'?e.data:null); };
      c.postMessage({type:'GET_VERSION'},[ch.port2]);
    });
  }
  /** Version de la page (CMS.build), toujours connue ; celle du cache hors ligne n'est ajoutée que si elle diffère
   *  (mise à jour en attente ou pas encore appliquée : utile au diagnostic). data-version : identifiants bruts. */
  let swV: string | null=null;
  function versionText(){
    const B=CMS.build, el=$('appVersion');
    el.dataset.version=B.version; if(swV) el.dataset.sw=swV; else delete el.dataset.sw;
    return 'Version : '+B.label(B.version)+(swV && swV!==B.version ? ' · copie hors ligne : '+B.label(swV) : '');
  }
  function showVersion(){ $('appVersion').textContent=versionText(); version().then(v=>{ swV=v; $('appVersion').textContent=versionText(); }); }
  /** Un worker installé alors qu'un autre contrôle déjà la page : une mise à jour (pas la première installation) */
  function watch(w: ServiceWorker | null){
    if(!w) return;
    const done=()=>{ if(w.state==='installed' && sw()!.controller) showUpdate(true); };
    done(); w.addEventListener('statechange',done);
  }
  function apply(){
    const w=reg && reg.waiting;
    wanted=true; showUpdate(false);
    if(w) w.postMessage({type:'SKIP_WAITING'}); else location.reload();   // déjà activé ailleurs (autre onglet) : simple rechargement
  }
  /** reg.update() au plus une fois par heure (now : horloge injectable par les tests) */
  function check(now=Date.now(),force=false){
    if(!reg || (!force && now-last<HOUR)) return false;
    last=now; checks++; reg.update().catch(()=>{});   // hors ligne : échec silencieux, nouvel essai au prochain retour
    return true;
  }
  function install(){
    showVersion();
    if(!/^https?:$/.test(location.protocol)) return;
    const l=h('link',{rel:'manifest',href:'manifest.webmanifest'}); document.head.appendChild(l);
    const on=!TEST_HOOKS || /[?&]sw(?:[=&]|$)/.test(location.search);
    if(!on || !sw()) return;
    $('bUpdate').onclick=apply; $('bUpdLater').onclick=()=>showUpdate(false);
    const hadController=!!sw()!.controller;
    sw()!.addEventListener('controllerchange',()=>{
      showVersion();
      if(wanted){ if(!refreshing){ refreshing=true; location.reload(); } }   // une seule fois
      else if(hadController) showUpdate(true);   // activé depuis un autre onglet : cette page garde l'ancien JS
    });
    sw()!.register('sw.js',{updateViaCache:'none'}).then(r=>{
      reg=r; watch(r.waiting); watch(r.installing);
      r.addEventListener('updatefound',()=>watch(r.installing));
      check(Date.now(),true);
      document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') check(); });
    }).catch((e: Error)=>console.warn('service worker',e.message));
  }
  return {install,check,version,get swVersion(){ return swV; },get checks(){ return checks; },get reg(){ return reg; }};
});
const {install: installPwa} = CMS.pwa;
boot();

// Fonctions lues par des fichiers chargés avant celui-ci (registre late de src/core/cms.ts)


