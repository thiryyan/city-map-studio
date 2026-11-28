/* City Map Studio — Ambiances, modèles de texte, gabarit, orientation, format (#118, issu de features.ts). */
import {$, setSeg, toast} from '../core/dom.js';
import {AMBIANCES, DEFAULT_STATE, EXPORT_MAX_DPI, OCCASIONS, THEMES} from '../content/config.js';
import {commitHistory} from '../core/doc/history.js';
import {contrast} from '../core/color.js';
import {drawTexture, layoutPreview, redrawAll, scheduleOver} from '../view/preview.js';
import {exportSpec} from '../core/geo/geo.js';
import {isoFromFr} from '../core/text.js';
import {loadFonts} from '../render/fonts.js';
import {renderPlaces} from './places.js';
import {saveState, st, ui} from '../core/doc/state.js';
import {cmpSnap, noteChange} from './compare.js';
import {onUi, refreshCards, syncInputs} from '../core/port.js';
// ---------- Ambiances et modèles de texte ----------
function applyAmbiance(k: string){
  const a=AMBIANCES.find(x=>x[0]===k); if(!a) return; const p=a[2];
  commitHistory(0);   // étape d'historique explicite : un choix fait juste après le démarrage reste annulable
  const before=cmpSnap();
  // Seulement ce qui existe dans le type d'affiche courant (#77) : rien ne change en silence pour un autre type.
  // Illustration : ni carte ni repère ; Carte + illustration : sans gabarit (la composition en tient lieu).
  const map=st.mode==='map', withMap=st.mode!=='illus', parts=['thème','polices','papier'];
  st.theme=p.theme; st.colors={...THEMES[p.theme].c}; st.font=p.font; st.fontTitle=p.fontTitle; st.illusText.style='auto'; st.texture=p.texture; st.folds=!!p.folds;
  const fx={...DEFAULT_STATE.fx,...(p.fx||{})};
  if(withMap){ st.markerStyle=p.markerStyle; st.fx=fx; st.orn={...DEFAULT_STATE.orn,...(p.orn||{})}; parts.push('repère','effets'); }
  else st.fx.foil=fx.foil;   // dorure des textes : seul effet d'une affiche illustrée
  if(map){ setLayout(p.layout,true); parts.push('gabarit'); }
  noteChange(before,`l'ambiance « ${a[1]} »`);
  syncInputs(); loadFonts().then(()=>{ scheduleOver(); refreshCards(); }); redrawAll(true); drawTexture(); commitHistory();
  toast(`Ambiance « ${a[1]} » : ${parts.slice(0,-1).join(', ')} et ${parts.at(-1)} · « Annuler » pour revenir`);
}
function applyOccasion(k: string){
  const o=OCCASIONS.find(x=>x[0]===k); if(!o) return; commitHistory(0);
  const before=cmpSnap();
  st.texts.dedication=o[2]; st.show.dedication=true;
  if(!st.texts.names.trim() || OCCASIONS.some(x=>x[3]===st.texts.names)) st.texts.names=o[3];
  noteChange(before,`le modèle « ${o[1]} »`);
  syncInputs(); scheduleOver(); commitHistory(); toast(`Modèle « ${o[1]} » appliqué · « Annuler » pour revenir`);
}
/** Gabarit : met à jour l'état propre à certains gabarits (deux lieux, ciel), puis l'aperçu */
function setLayout(k: string,quiet?: boolean){
  st.layout=k;
  if(k==='diptych' && !st.place2) st.place2={center:{...st.center},zoom:st.zoom,marker:{...st.marker}};
  if(k!=='diptych' && (st.active||0)===1) { st.active=0; const o=st.place2; st.place2={center:st.center,zoom:st.zoom,marker:st.marker}; st.center=o!.center; st.zoom=o!.zoom; st.marker=o!.marker; }
  if(k==='sky' && !st.sky.when){ st.sky.when=(isoFromFr(st.texts.date)||new Date().toISOString().slice(0,10))+'T22:00'; }
  ui.snap=null; refreshCards(); updateLayoutUI(); layoutPreview(); saveState();
  if(!quiet && k==='diptych') toast('Deux lieux : touchez la seconde carte pour la cadrer et y placer son repère');
}
function setOrient(v: string){ st.orient=v; setSeg('orientSeg',v); updateExportLabel(); ui.snap=null; refreshCards(); layoutPreview(); saveState(); }
/** Format d'impression : le rapport de l'affiche peut changer (50 × 70 cm) ; aperçu et vignettes suivent */
function setFormat(v: string){ st.format=v; setSeg('formatSeg',v); updateExportLabel(); ui.snap=null; refreshCards(); layoutPreview(); saveState(); }
/** Retour à la ligne de la dédicace : la carte peut céder de la hauteur (geom), d'où la mise en page complète */
function setDedWrap(v: string){ st.dedWrap=v; setSeg('dedWrapSeg',v); ui.snap=null; refreshCards(); layoutPreview(); saveState(); }
function setFileType(v: string){ st.fileType=v; setSeg('fileSeg',v); updateExportLabel(); saveState(); }
/** Dimensions affichées sur le bouton d'export et sous le choix du format : suivent le format et l'orientation */
function updateExportLabel(){
  const e=exportSpec(), pdf=st.fileType==='pdf', cm=(v: number)=>(v/10).toLocaleString('fr-FR');
  $('exportDims').textContent=`\u00a0· ${e.W} × ${e.H} px`;
  $('exportDpi').textContent=`\u00a0· ${e.key==='a4'?'':e.name+' · '}${e.dpi} DPI${pdf?' · PDF':''}`;
  $('formatHint').textContent=`${/^a\d/.test(e.key)?`${e.name} (${cm(e.mm[0])} × ${cm(e.mm[1])} cm)`:e.name} : ${e.W} × ${e.H} px à ${e.dpi} DPI`
    +(e.dpi<EXPORT_MAX_DPI?` — résolution abaissée pour rester dans la limite de mémoire des images de cet appareil ; amplement suffisante vue à distance.`:'.')
    +(pdf?' Document PDF à la taille exacte d\'impression (image JPEG haute qualité).':' Image PNG sans perte.')
    +(e.key==='10x15'?' Tirage photo : sans marge de fond perdu, au format exact de 10 × 15 cm.':'');
}
/** Sections visibles selon le gabarit */
function updateLayoutUI(){
  const L=st.layout;
  // Marge et contour (#77) : en Carte, selon le gabarit ; en Carte + illustration, médaillon (contour) et vignette (marge)
  const mix=st.mode==='mix', cp=st.mix?.compo;
  $('ringTog').hidden=mix ? cp!=='med' : !['medallion','heart','arch'].includes(L);
  $('marginBox').hidden=mix && cp!=='vig';
  $('mixFormH').hidden=$('mixFormHint').hidden=mix && cp!=='med' && cp!=='vig';
  $('mixFormHint').textContent=cp==='med' ? 'Médaillon : trait autour de la forme de la carte.' : cp==='vig' ? 'Vignette : marge autour de la carte et de sa bande de texte.' : '';
  $('skyBox').hidden=L!=='sky'; $('placeBox').hidden=L!=='diptych'; $('labelsBox').hidden=L!=='diptych';
  setSeg('placeSeg',String(st.active||0));
  if(L==='sky'){ $('skyWhen').value=st.sky.when; $('skyTz').value=String(st.sky.tz); }
  if($('mList')) renderPlaces();
}
/** Contraste à l'impression : avertit quand des éléments se distinguent mal */
function updateContrast(){
  const c=st.colors, w=[];
  if(contrast(c.roadMajor,c.land)<3) w.push('les rues principales ressortent peu sur la terre');
  if(contrast(c.text,c.paper)<4.5) w.push('le texte manque de contraste avec le papier');
  if(contrast(c.marker,c.land)<1.8) w.push('le repère se distingue mal de la carte');
  $('contrastWarn').textContent = w.length ? '⚠ À l\'impression, '+w.join(' ; ')+'.' : '';
}

// Demandes du port (src/core/port.ts) réalisées ici
onUi('setDedWrap', setDedWrap);

export {applyAmbiance, applyOccasion, setDedWrap, setFileType, setFormat, setLayout, setOrient, updateContrast, updateExportLabel, updateLayoutUI};
