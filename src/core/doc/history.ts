/* City Map Studio — Historique : annuler / rétablir (#118, issu de l'interface).
 * Un instantané de l'état par modification (regroupées comme l'enregistrement, après 300 ms de calme). Le moteur
 * cartographique est exclu : le rétablir relancerait des requêtes réseau.
 * Événements (synchrones) pour l'interface : « history:applied » (un instantané vient de remplacer l'état :
 * resynchroniser les champs, l'aperçu et la vue ; détail {viewChanged}) et « history:changed » (piles modifiées :
 * boutons Annuler / Rétablir). « state:commit » : étape figée, l'affiche est enregistrée tout de suite
 * (src/storage/documents.ts) ; les piles sont enregistrées aussi, pour être reprises après un rechargement (#16). */
import {saveState, saveT, st} from './state.js';
import {replaceState} from './store.js';

const HIST_MAX=50;
const hist: {past: string[]; future: string[]; cur: string | null; quietUntil: number}={past:[],future:[],cur:null,quietUntil:0};
function histSnap(){ const {engine,...rest}=st; return JSON.stringify(rest); }
function recordHistory(){
  const s=histSnap(); if(s===hist.cur) return;
  if(Date.now()<hist.quietUntil || hist.cur==null){ hist.cur=s; return; }   // effets de bord d'un retour arrière (recentrage de la carte)
  hist.past.push(hist.cur); if(hist.past.length>HIST_MAX) hist.past.shift();
  hist.cur=s; hist.future=[]; CMS.emit('history:changed');
}
/** Remplace l'état par un instantané (le moteur courant est gardé) ; l'interface se resynchronise sur « history:applied » */
function applySnap(s: string){
  hist.quietUntil=Date.now()+900;
  const o=JSON.parse(s), eng=st.engine, view=JSON.stringify([st.center,st.zoom]);
  replaceState(o,{engine:eng});
  CMS.emit('history:applied', {viewChanged: JSON.stringify([st.center,st.zoom])!==view});
  hist.cur=s; saveState(); CMS.emit('history:changed');
}
/** Fige tout de suite l'étape en cours (action ponctuelle : réinitialisation, changement de moteur), puis ignore
 *  pendant un instant les petits recentrages de la carte qui suivent, pour ne pas créer de fausses étapes. */
function commitHistory(quietMs=1500){ clearTimeout(saveT); CMS.emit('state:commit'); hist.quietUntil=0; recordHistory(); hist.quietUntil=Date.now()+quietMs; }

export {applySnap, commitHistory, hist, HIST_MAX, histSnap, recordHistory};
