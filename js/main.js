/* City Map Studio — Démarrage.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html. */
'use strict';
// ---------- Démarrage ----------
// Fonctions internes exposées (window.__cms) seulement pour les tests et le débogage : adresse avec ?test,
// ou localStorage['cityMapStudio.debug']='1'. En usage normal, rien n'est exposé.
const TEST_HOOKS = /[?&]test(?:[=&]|$)/.test(location.search) || (()=>{ try{ return localStorage.getItem('cityMapStudio.debug')==='1'; }catch(e){ return false; } })();
async function boot(){
  buildUI(); initSheet(); applyUiScale();
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
  if(st.engine==='overpass' && !opData) fetchOverpass();
  const ok=await loadMaplibre();
  updateEngineUI();
  if(ok){ if(st.engine==='maplibre') renderMap(true); }
  else if(mlLib==='local-fail'){ if(st.engine==='maplibre') needConsent(); }
  else if(st.engine==='maplibre'){
    toast('Librairie cartographique injoignable : passez au moteur « Fichier » ou lancez le diagnostic.',true);
    setStatus('MapLibre injoignable (aucun CDN accessible)','err');
    showBanner(true,'Carte indisponible','Diagnostiquer',runDiagnostics);
  }
  if(TEST_HOOKS) window.__cms={get mlMap(){return mlMap},buildQuery,get OP_ORDER(){return OP_ORDER},buildStyle,hatchTile,get welcomeDone(){return welcomeDone},get ui(){return ui},setLayout,setOrient,applyAmbiance,applyOccasion,setActivePlace,parseGpx,fitRoute,encodeShare,decodeShare,altAz,skyTime,contrast,THEMES,FONTS,AMBIANCES,composePoster,posterDims,textureBase,placeAt,addPlace,undo,redo,get hist(){return hist},frDate,isoFromFr,showTab,setSheet,setFraming,st,drawPoster,dms,geom,parseOverpass,stitch,setEngine,exportPoster,importText,runDiagnostics,ENV,OP_TIMEOUT,get opData(){return opData},get mlLib(){return mlLib},get opBlock(){return opBlock},opAvailable,fetchOverpass,parseCoords,get consent(){return consent},resetAll};
}
boot();
