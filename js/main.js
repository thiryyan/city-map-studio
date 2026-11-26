/* City Map Studio — Démarrage.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html. */
'use strict';
// ---------- Démarrage ----------
// Fonctions internes exposées (window.__cms) seulement pour les tests et le débogage : adresse avec ?test,
// ou localStorage['cityMapStudio.debug']='1'. En usage normal, rien n'est exposé.
const TEST_HOOKS = /[?&]test(?:[=&]|$)/.test(location.search) || (()=>{ try{ return localStorage.getItem('cityMapStudio.debug')==='1'; }catch(e){ return false; } })();
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
  installPwa();
  if(TEST_HOOKS) window.__cms={get mlMap(){return mlMap},buildStyle,hatchTile,get welcomeDone(){return welcomeDone},get ui(){return ui},setLayout,setOrient,setFormat,setFileType,setDedWrap,exportSpec,dedLines,renderMaplibreOffscreen,set glMaxTest(v){setGlMaxTest(v)},applyAmbiance,applyOccasion,setActivePlace,parseGpx,fitRoute,encodeShare,decodeShare,altAz,skyTime,contrast,THEMES,FONTS,AMBIANCES,composePoster,posterDims,saveCurrent,loadSaves,restoreSave,importConfigFile,applyConfig,textureBase,placeAt,addPlace,undo,redo,get hist(){return hist},frDate,isoFromFr,showTab,setSheet,setFraming,st,drawPoster,dms,geom,parseOsm,stitch,setEngine,exportPoster,importText,runDiagnostics,ENV,get osmData(){return osmData},get mlLib(){return mlLib},parseCoords,get consent(){return consent},resetAll,pwa:CMS.pwa};
}
/** Application installable et utilisable hors ligne : manifeste et service worker (sw.js), seulement en http(s).
 *  En file://, le navigateur refuse les deux (simple bruit dans la console) : rien n'est déclaré.
 *  Désactivé pendant les tests (?test), sauf demande explicite (?test&sw) : le cache fausserait le réseau simulé.
 *  Mises à jour (issue #65) : un nouveau worker attend ; un bandeau propose « Mettre à jour », jamais de rechargement
 *  sans accord (export ou import en cours). Vérification au démarrage et au retour au premier plan, au plus une fois par heure. */
CMS.define('pwa', () => {
  const HOUR=3600e3;
  let reg=null, last=0, wanted=false, refreshing=false, checks=0;
  const sw=()=>('serviceWorker' in navigator) ? navigator.serviceWorker : null;
  function showUpdate(on){
    $('updBanner').classList.toggle('show',!!on);
    if(ui.sheet==='peek') applySheet();
  }
  /** Version servie par le worker actif (copie hors ligne) ; null sans worker, hors ligne sans réponse, ou en file:// */
  function version(){
    const c=sw() && sw().controller;
    if(!c) return Promise.resolve(null);
    return new Promise(res=>{
      const ch=new MessageChannel(), t=setTimeout(()=>res(null),1500);
      ch.port1.onmessage=e=>{ clearTimeout(t); res(typeof e.data==='string'?e.data:null); };
      c.postMessage({type:'GET_VERSION'},[ch.port2]);
    });
  }
  /** Version de la page (CMS.build), toujours connue ; celle du cache hors ligne n'est ajoutée que si elle diffère
   *  (mise à jour en attente ou pas encore appliquée : utile au diagnostic). data-version : identifiants bruts. */
  let swV=null;
  function versionText(){
    const B=CMS.build, el=$('appVersion');
    el.dataset.version=B.version; if(swV) el.dataset.sw=swV; else delete el.dataset.sw;
    return 'Version : '+B.label(B.version)+(swV && swV!==B.version ? ' · copie hors ligne : '+B.label(swV) : '');
  }
  function showVersion(){ $('appVersion').textContent=versionText(); version().then(v=>{ swV=v; $('appVersion').textContent=versionText(); }); }
  /** Un worker installé alors qu'un autre contrôle déjà la page : une mise à jour (pas la première installation) */
  function watch(w){
    if(!w) return;
    const done=()=>{ if(w.state==='installed' && sw().controller) showUpdate(true); };
    done(); w.addEventListener('statechange',done);
  }
  function apply(){
    const w=reg && reg.waiting;
    wanted=true; showUpdate(false);
    if(w) w.postMessage({type:'SKIP_WAITING'}); else location.reload();   // déjà activé ailleurs (autre onglet) : simple rechargement
  }
  /** reg.update() au plus une fois par heure (now : horloge injectable par les tests) */
  function check(now=Date.now(),force){
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
    const hadController=!!sw().controller;
    sw().addEventListener('controllerchange',()=>{
      showVersion();
      if(wanted){ if(!refreshing){ refreshing=true; location.reload(); } }   // une seule fois
      else if(hadController) showUpdate(true);   // activé depuis un autre onglet : cette page garde l'ancien JS
    });
    sw().register('sw.js',{updateViaCache:'none'}).then(r=>{
      reg=r; watch(r.waiting); watch(r.installing);
      r.addEventListener('updatefound',()=>watch(r.installing));
      check(Date.now(),true);
      document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') check(); });
    }).catch(e=>console.warn('service worker',e.message));
  }
  return {install,check,version,get swVersion(){ return swV; },get checks(){ return checks; },get reg(){ return reg; }};
});
const {install: installPwa} = CMS.pwa;
boot();
