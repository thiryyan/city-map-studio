/* City Map Studio — Polices de l'affiche (#118, sorti de l'interface) : chargement et vérification avant l'export. */
import {fontFaces} from '../core/canvas.js';
import {glyphs} from './poster-text.js';
import {textStyle} from './illustration-text.js';
import {FONTS} from '../content/config.js';
import {fontOf} from './poster-text.js';
/** Polices utilisées par l'affiche : titre, texte, police manuscrite éventuelle ; Bebas Neue pour le titre « Vintage » des modes illustrés */
async function loadFonts(){
  try{ await Promise.all(loadFonts.used().flatMap(f=>f.load).map(f=>fontFaces!.load(f))); }catch(e){}
  glyphs.clear();   // largeurs mesurées avec une police de secours pendant le chargement
}
/** true si toutes les variantes de la famille active sont chargées (sinon l'export utiliserait une police de secours) */
loadFonts.used=()=>[fontOf('title'),fontOf('','dedication'),fontOf('','date'),...(textStyle().vint ? [FONTS.bebas] : [])];
function fontsReady(){ try{ return loadFonts.used().flatMap(f=>f.load).every(f=>fontFaces!.check(f)); }catch(e){ return true; } }


export {fontsReady, loadFonts};
