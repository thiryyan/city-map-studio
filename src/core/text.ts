/* City Map Studio — Textes (#118) : fonctions pures sur les chaînes. */
/** Nom de fichier tiré d'un texte : minuscules sans accents, tirets ; « ville » si vide */
const slug=(s: string)=>(s||'ville').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'ville';
/** Date au format de l'affiche : « Le 1er juillet 2023 » */
function frDate(iso: string){
  const [y,m,d]=iso.split('-').map(Number); if(!y||!m||!d) return '';
  const mois=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][m-1];
  return `Le ${d===1?'1er':d} ${mois} ${y}`;
}
/** Lecture inverse (pour ouvrir le calendrier sur la date déjà saisie) ; '' si le texte n'est pas une date */
function isoFromFr(t: string){
  const M=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const r=String(t||'').toLowerCase().match(/(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/); if(!r) return '';
  const m=M.indexOf(r[2]); if(m<0) return '';
  return `${r[3]}-${String(m+1).padStart(2,'0')}-${String(+r[1]).padStart(2,'0')}`;
}


export {frDate, isoFromFr, slug};