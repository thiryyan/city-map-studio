/* City Map Studio — Port des couches supérieures (#118).
 * Demandes qu'une couche basse (état, rendu, carte, aperçu, fonctions de l'affiche) adresse à une couche supérieure
 * (aperçu, fonctions de l'affiche, interface) sans l'importer, conformément à la règle des couches (tests/layers.py) :
 * chacune émet l'événement « ui:<nom> » sur le bus CMS, de façon synchrone, et le module qui la réalise s'y abonne au
 * chargement (onUi). Demandes sans valeur de retour ; un module de même couche ou supérieure appelle directement la
 * fonction réelle. Les noms sont ceux des fonctions déclenchées. */

/** Commandes et leurs arguments */
interface UiCommands {
  syncInputs: [];
  syncOutputs: [];
  syncZoomUI: [];
  refreshCards: [];
  refreshColors: [];
  updateMarkerTxt: [];
  updateEngineUI: [];
  showTab: [name: string, focus?: boolean];
  openAdvanced: [scroll?: boolean];
  showBanner: [show: boolean, txt?: string, label?: string, action?: (() => void) | null];
  setPlacing: [on: boolean, idx?: number];
  applySheet: [];
  syncFonts: [];
  // Aperçu (src/view/preview.ts)
  renderMap: [force?: boolean];
  scheduleOver: [];
  drawUnder: [];
  // Fonctions de l'affiche
  placeAt: [lat: number, lon: number];
  setDedWrap: [v: string];
  runDiagnostics: [];
}
type UiName = keyof UiCommands;

const send = <K extends UiName>(k: K) => (...args: UiCommands[K]): void => CMS.emit('ui:' + k, args);
/** Abonnement du module d'interface qui réalise la commande */
function onUi<K extends UiName>(k: K, fn: (...args: UiCommands[K]) => void): () => void {
  return CMS.on('ui:' + k, (args: UiCommands[K]) => fn(...args));
}

const syncInputs = send('syncInputs');
const syncOutputs = send('syncOutputs');
const syncZoomUI = send('syncZoomUI');
const refreshCards = send('refreshCards');
const refreshColors = send('refreshColors');
const updateMarkerTxt = send('updateMarkerTxt');
const updateEngineUI = send('updateEngineUI');
const showTab = send('showTab');
const openAdvanced = send('openAdvanced');
const showBanner = send('showBanner');
const setPlacing = send('setPlacing');
const applySheet = send('applySheet');
const syncFonts = send('syncFonts');
const renderMap = send('renderMap');
const scheduleOver = send('scheduleOver');
const drawUnder = send('drawUnder');
const placeAt = send('placeAt');
const setDedWrap = send('setDedWrap');
const runDiagnostics = send('runDiagnostics');

export {applySheet, drawUnder, onUi, openAdvanced, placeAt, refreshCards, refreshColors, renderMap, runDiagnostics, scheduleOver, setDedWrap, setPlacing, showBanner, showTab, syncFonts, syncInputs, syncOutputs, syncZoomUI, updateEngineUI, updateMarkerTxt};
export type {UiCommands};
