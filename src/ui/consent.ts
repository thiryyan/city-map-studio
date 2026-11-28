/* City Map Studio — Réponse à la demande d'accord préalable (#118, issu de src/core/doc/state.ts).
 * L'accord lui-même (donné ou non, action en attente) reste dans l'état ; ici, ce qui suit la réponse : chargement de
 * la carte, action en attente, proposition d'ambiance, ou passage au moteur Fichier. */
import {setStatus} from '../core/dom.js';
import {grantConsent, mlLib, osmData, refuseConsent, st} from '../core/doc/state.js';
import {loadMaplibre} from '../map/engines.js';
import {renderMap} from '../view/preview.js';
import {maybeWelcome} from './welcome.js';
import {openAdvanced, setEngine, updateEngineUI} from './panel.js';

function giveConsent(){
  const next=grantConsent();
  (async()=>{
    if(mlLib==='fail'||mlLib==='local-fail'){ await loadMaplibre(); updateEngineUI(); }
    if(next) next();
    maybeWelcome();
    if(st.engine==='maplibre') renderMap(true);                              // la carte s'affiche dans tous les cas
  })();
}
function declineConsent(){
  refuseConsent();
  setEngine('file',true); openAdvanced(true); maybeWelcome();   // consigne d'import : ligne d'état et section Avancé
  if(!osmData) setStatus('Hors ligne · importez un fichier de données (onglet Lieu)','wait');
}

export {declineConsent, giveConsent};
