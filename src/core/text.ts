/* City Map Studio — Textes (#118) : fonctions pures sur les chaînes. */
/** Nom de fichier tiré d'un texte : minuscules sans accents, tirets ; « ville » si vide */
const slug=(s: string)=>(s||'ville').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'ville';

export {slug};
