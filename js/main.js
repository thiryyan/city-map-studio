/* City Map Studio — Démarrage.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html. */
'use strict';
// ---------- Démarrage ----------
// Fonctions internes exposées (window.__cms) seulement pour les tests et le débogage : adresse avec ?test,
// ou localStorage['cityMapStudio.debug']='1'. En usage normal, rien n'est exposé.
const TEST_HOOKS = /[?&]test(?:[=&]|$)/.test(location.search) || (()=>{ try{ return localStorage.getItem('cityMapStudio.debug')==='1'; }catch(e){ return false; } })();
async function boot(){
  buildUI(); initSaves(); initSheet(); applyUiScale();
  $('bConsentYes').onclick=giveConsent; $('bConsentFile').onclick=declineConsent; updateConsentInfo();
  dlgCancel.consent=declineConsent; dlgCancel.welcome=()=>$('welSkip').click(); initDialogs();
  showEnvWarning();
  if(st.engine==='file') st.engine='maplibre';   // un fichier importé n'est pas conservé entre deux sessions
  syncInputs();
  hist.cur=histSnap(); hist.quietUntil=Date.now()+2500; updateHistUI();   // l'état chargé est le point de départ de l'historique
  let rafL=0; new ResizeObserver(()=>{ if(!rafL) rafL=requestAnimationFrame(()=>{ rafL=0; layoutPreview(); }); }).observe(stage);
  addEventListener('resize',()=>applySheet());
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
  if(TEST_HOOKS) window.__cms={get mlMap(){return mlMap},buildStyle,hatchTile,get welcomeDone(){return welcomeDone},get ui(){return ui},setLayout,setOrient,setFormat,setFileType,setDedWrap,exportSpec,dedLines,renderMaplibreOffscreen,set glMaxTest(v){setGlMaxTest(v)},applyAmbiance,applyOccasion,setActivePlace,parseGpx,fitRoute,encodeShare,decodeShare,altAz,skyTime,contrast,THEMES,FONTS,AMBIANCES,composePoster,posterDims,saveCurrent,loadSaves,restoreSave,importConfigFile,applyConfig,textureBase,placeAt,addPlace,undo,redo,get hist(){return hist},frDate,isoFromFr,showTab,setSheet,setFraming,st,drawPoster,dms,geom,parseOsm,stitch,setEngine,exportPoster,importText,runDiagnostics,ENV,get osmData(){return osmData},get mlLib(){return mlLib},parseCoords,get consent(){return consent},resetAll};
}
/** Application installable et utilisable hors ligne : manifeste et service worker (sw.js), seulement en http(s).
 *  En file://, le navigateur refuse les deux (simple bruit dans la console) : rien n'est déclaré.
 *  Désactivé pendant les tests (?test), sauf demande explicite (?test&sw) : le cache fausserait le réseau simulé. */
function installPwa(){
  if(!/^https?:$/.test(location.protocol)) return;
  const l=h('link',{rel:'manifest',href:'manifest.webmanifest'}); document.head.appendChild(l);
  const sw=!TEST_HOOKS || /[?&]sw(?:[=&]|$)/.test(location.search);
  if(sw && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e=>console.warn('service worker',e.message));
}
boot();
