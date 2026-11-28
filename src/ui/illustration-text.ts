/* City Map Studio — Interface des textes des modes illustrés : présentations, ornements, zones, ordre des lignes (extrait de features/illustration.ts, #119). */
import {DEFAULT_STATE, DUOS, type PosterState} from '../content/config.js';
import {saveState, st} from '../core/doc/state.js';
import {$, h, pressed, setSeg, toast} from '../core/dom.js';
import {update} from '../core/doc/store.js';
import {changed, scheduleOver} from '../view/preview.js';
import {syncFonts} from '../core/port.js';
import {Opts} from '../core/illustration-state.js';
import {arcShape, decoOf, decoWhy, mapMoved, posOf, textStyle, zoneOf} from '../render/illustration-text.js';
import {IS} from '../core/illustration-state.js';

// ---------- Interface ----------
export const SW_TEXT=[['auto','Auto : couleur Texte du thème'],['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#B5654B','Terracotta'],['#F3EAD8','Crème'],['#FFFFFF','Blanc']];
export const SW_SHADOW=[['auto','Auto : aucune en Carte, couleur du papier sur une illustration'],['','Sans ombre'],['#F3EAD8','Crème'],['#D9CDB5','Sable'],['#C5A059','Or'],['#24365A','Bleu nuit'],['#2C2A29','Encre']];
export const SW_OUTLINE=[['','Sans contour'],['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#F3EAD8','Crème'],['#FFFFFF','Blanc'],['#C5A059','Or']];
export const POS_NAMES: Record<string, string>={h:'en haut',m:'au milieu',b:'en bas'}, COL_NAMES: Record<string, string>={g:'à gauche',c:'au centre',d:'à droite'};
export const POS_ARROWS=['↖','↑','↗','←','•','→','↙','↓','↘'];
// Présentations des blocs (#86) : nom et description (bulle)
export const DECO_NAMES: Record<string, string>={libre:'Texte seul',cartouche:'Cartouche',bandeau:'Bandeau',etiquette:'Étiquette',capsule:'Capsule',filets:'Filets art déco',arc:'Arc',cachet:'Cachet',vertical:'Vertical'};
export const DECO_TIPS: Record<string, string>={libre:'Lettres seules, avec leur ombre et leur contour',cartouche:'Plaque couleur papier encadrée d\u2019un trait, façon carte ancienne',
  bandeau:'Bande couleur papier sur toute la largeur de la zone',etiquette:'Plaque couleur papier à coins coupés, façon étiquette de bagage',
  capsule:'Plaque pleine aux bouts arrondis, lettres couleur papier',filets:'Sans fond : filets au-dessus et au-dessous, losange au centre',
  arc:'Titre courbé autour de la carte ronde ou en arche',cachet:'Tampon rond : titre en couronne, étoile au centre',vertical:'Titre pivoté le long d\u2019un bord'};
export const DECO_HINTS: Record<string, string>={arc:'Le titre suit la forme de la carte : une position en haut de la grille le place au-dessus, en bas au-dessous.',
  cachet:'Le cachet se glisse sur l\u2019aperçu, comme un tampon ; le sous-titre court en bas de la couronne.',
  vertical:'Le titre longe le bord le plus proche : à gauche il se lit de bas en haut, à droite de haut en bas.'};
// Trait des plaques et ordre des lignes (Textes, Plus de réglages)
export const SW_FILL=[['auto','Auto : couleur du papier'],['#F3EAD8','Crème'],['#D9CDB5','Sable'],['#FFFFFF','Blanc'],['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#B5654B','Terracotta'],['#C5A059','Or']];
export const SW_PLATE=[['auto','Auto : encre de la plaque (couleur papier sur la capsule, couleur des lettres pour les filets)'],['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#B5654B','Terracotta'],['#C5A059','Or'],['#F3EAD8','Crème'],['#FFFFFF','Blanc']];
export const LINE_NAMES: Record<string, string>={title:'Titre',subtitle:'Sous-titre',coords:'Coordonnées',dedication:'Dédicace',names:'Noms',date:'Date'};
export const MORE_KEY='cms:textMoreOpen';
/** Un réglage de « Plus de réglages » diffère du défaut : polices hors duo, ombre, contour, tailles par ligne, coupure de la
 *  dédicace, format des coordonnées, trait des plaques, ordre des lignes (#88). La section s'ouvre alors d'office. */
export function moreActive(){
  const D=DEFAULT_STATE, T: Opts=st.illusText, J=JSON.stringify;
  const duo=DUOS.some(([,,ft,fx])=>fx===st.font && (st.fontTitle||st.font)===ft);
  return (!duo && (st.font!==D.font || st.fontTitle!==D.fontTitle)) || ['shadow','outline','off'].some(k=>T[k]!==(D.illusText as Opts)[k])
    || Object.keys(D.textScale).some(k=>st.textScale[k]!==D.textScale[k]) || st.dedWrap!==D.dedWrap || st.coordFormat!==D.coordFormat
    || J(T.plate)!==J(D.illusText.plate) || !!st.lineOrder;
}
/** Ordre des lignes : liste numérotée, boutons Monter et Descendre (le focus suit la ligne déplacée) */
export function syncOrder(focus?: {k: string; d: number}){
  const O=CMS.order.current(), box=$('lineOrderList'), sig=JSON.stringify([O,O.map((k: string)=>st.show[k]===false)]);
  $('bOrderReset').hidden=!st.lineOrder;
  if(!focus && box.dataset.sig===sig) return;   // inchangée : rien n'est reconstruit (le focus reste en place)
  box.dataset.sig=sig;
  box.replaceChildren(...O.map((k: string,i: number)=>{
    const off=st.show[k]===false, name=LINE_NAMES[k];
    const mk=(d: number,sym: string,lab: string)=>{ const b=h('button',{type:'button',dataset:{k,d},'aria-label':`${lab} : ${name}`,title:lab},sym);
      b.disabled=d<0 ? i===0 : i===O.length-1; b.onclick=()=>moveLine(k,d); return b; };
    return h('li',{className:off?'off':''},h('span',{},name+(off?' (masquée)':'')),mk(-1,'↑','Monter'),mk(1,'↓','Descendre'));
  }));
  if(focus){ const b=box.querySelector<HTMLButtonElement>(`button[data-k="${focus.k}"][data-d="${focus.d}"]`); (b && !b.disabled ? b : box.querySelector<HTMLElement>(`button[data-k="${focus.k}"]:not(:disabled)`))?.focus(); }
}
export function moveLine(k: string,d: number){
  const O=CMS.order.current(), i=O.indexOf(k), j=i+d; if(j<0 || j>=O.length) return;
  [O[i],O[j]]=[O[j],O[i]]; update(_s=>(_s.lineOrder=O)); syncOrder({k,d}); changed();
}
export function syncPlate(){
  const P=st.illusText.plate;
  setSeg('plateLineSeg',P.line); $('oPlateW').textContent='× '+String(P.w).replace('.',','); $('sPlateW').value=String(P.w);
  $('oPlateGap').textContent='× '+String(P.gap).replace('.',','); $('sPlateGap').value=String(P.gap);
  $('oPlateAlpha').textContent=Math.round(P.alpha*100)+' %'; $('sPlateAlpha').value=String(P.alpha);
  $('swPlateFill').querySelectorAll('button').forEach(b=>pressed(b,b.dataset.v===P.fill));
  { const cu=$('swPlateFill').querySelector('input'), own=P.fill!=='auto' && !SW_FILL.some(([x])=>x===P.fill); cu!.parentElement!.classList.toggle('on',own); if(own) cu!.value=P.fill; }
  const ai=$('swPlateFill').querySelector<HTMLElement>('.sw.auto i'); if(ai) ai.style.background=st.colors.paper;
  $('swPlate').querySelectorAll('button').forEach(b=>pressed(b,b.dataset.v===P.color));
  const cu=$('swPlate').querySelector('input'); if(cu){ const own=P.color!=='auto' && !SW_PLATE.some(([x])=>x===P.color); cu.parentElement!.classList.toggle('on',own); if(own) cu.value=P.color; }
  $('sPlateW').closest<HTMLElement>('.slider')!.hidden=P.line==='none'; $('swPlate').closest<HTMLElement>('.swrow')!.hidden=P.line==='none';
  syncMoreOpen();
}
/** « Plus de réglages » : ouverte d'office (sans mémoriser) quand un de ses réglages est actif ; aucun réglage appliqué n'est caché */
export function syncMoreOpen(){ const d=$<HTMLDetailsElement>('textMore'); if(moreActive() && !d.open){ IS.moreAuto=true; d.open=true; } }
// Gabarits du bloc du bas (#90)
export const TPL_NAMES: Record<string, string>={classique:'Classique',pile:'Empilé',ligne:'Ligne unique',souvenir:'Souvenir',carnet:'Carnet',colonnes:'Colonnes'};
export const TPL_TIPS: Record<string, string>={classique:'Lignes empilées : dédicace, noms, date · coordonnées',pile:'Une ligne par information, les unes sous les autres : dédicace, noms, date, coordonnées',ligne:'Tout sur une ligne : dédicace · noms · date · coordonnées',
  souvenir:'Dédicace | noms à gauche, date et coordonnées à droite',carnet:'Aligné à gauche : noms en grand, filet, dédicace, date · coordonnées',
  colonnes:'Date à gauche, dédicace et noms au centre, coordonnées à droite'};
/** Mise en forme du bloc du bas. Comme une présentation, elle sort le bloc du gabarit (Carte) ou de la bande (Vignette). */
export function setTpl(v: string){
  const P=posOf();
  update(()=>{ P.ftpl=v; });
  if(v!=='classique' && st.mode==='map' && !mapMoved().foot){ update(()=>Object.assign(P,{fpos:'bc',ffree:null})); toast('Lignes du bas posées sur l\u2019affiche, hors du gabarit'); }
  if(v!=='classique' && st.mode==='mix' && st.mix.compo==='vig' && zoneOf('foot')==='illus'){ update(()=>{ P.zone={...P.zone,foot:'map'}; P.ffree=null; }); toast('Lignes du bas posées sur la carte'); }
  syncText(); scheduleOver(); saveState();
}
/** Mises en page prêtes (#86) : elles ne font que remplir zone, position et présentation */
export const PRESETS: [string, (s: PosterState)=>boolean, (P: Opts)=>void][]=[
  ['Titre en cartouche sur la carte', (s: PosterState)=>s.mode==='mix' || (s.mode==='map' && s.layout!=='typo'),
    P=>Object.assign(P,{pos:'hc',free:null},{deco:{...P.deco,title:'cartouche'}},P.zone ? {zone:{...P.zone,title:'map'}} : {})],
  ['Bandeau à la jonction', (s: PosterState)=>s.mode==='mix' && ['hb','fondu'].includes(s.mix.compo),
    P=>Object.assign(P,{pos:'mc',free:{x:0.5,y:st.mix.compo==='fondu' ? 0.62 : st.mix.split==='two' ? 2/3 : 0.5},deco:{...P.deco,title:'bandeau'},zone:{...P.zone,title:'poster'}})],
  ['Titre en arc sur le médaillon', (s: PosterState)=>!!arcShape(s),
    P=>Object.assign(P,{pos:st.mode==='map' ? 'mc' : st.mix.pos==='haut' ? 'bc' : 'hc',free:null,deco:{...P.deco,title:'arc'}},P.zone ? {zone:{...P.zone,title:'illus'}} : {})],
  ['Cachet en coin', (s: PosterState)=>s.mode==='mix' || (s.mode==='map' && s.layout!=='typo'),
    P=>Object.assign(P,{pos:'hd',free:null,deco:{...P.deco,title:'cachet'}},P.zone ? {zone:{...P.zone,title:'map'}} : {})]];
/** Présentation d'un bloc. Un bloc encore dans le gabarit (Carte) ou dans la bande de la vignette en sort pour la recevoir. */
export function setDeco(k: string,d: string){update(()=>{
  const P=posOf(); P.deco={...P.deco,[k]:d};
  if(d!=='libre' && st.mode==='map' && !mapMoved()[k]){
    if(k==='title') Object.assign(P,{pos:d==='arc' ? 'mc' : d==='cachet' ? 'hd' : 'hc',free:null}); else Object.assign(P,{fpos:'bc',ffree:null});
    toast(k==='title' ? 'Titre posé sur l\u2019affiche, hors du gabarit' : 'Lignes du bas posées sur l\u2019affiche, hors du gabarit');
  }
  if(d!=='libre' && st.mode==='mix' && st.mix.compo==='vig' && zoneOf(k)==='illus'){
    P.zone={...P.zone,[k]:'map'}; if(k==='title') P.free=null; else P.ffree=null;
    toast(k==='title' ? 'Titre posé sur la carte' : 'Lignes du bas posées sur la carte');
  }
  syncText(); scheduleOver(); saveState();
});}
/** Zone d'un bloc (Carte + illustration) : la position libre, relative à l'ancienne zone, est oubliée */
export function setZone(k: string,z: string){
  update(_s=>{ const P=_s.illusText.mix; P.zone={...P.zone,[k]:z}; if(k==='title') P.free=null; else P.ffree=null; });
  syncText(); scheduleOver(); saveState();
}
export function syncDecos(){
  const P=posOf(), mix=st.mode==='mix';
  for(const [k,seg,note] of [['title','tDecoSeg','tDecoNote'],['foot','fDecoSeg','fDecoNote']]){
    const cur=P.deco?.[k]||'libre', why=decoWhy(k,cur);
    $(seg).querySelectorAll('button').forEach(b=>{ const d=b.dataset.v;
      b.hidden=d!=='libre' && ((d==='arc' && !arcShape()) || (k==='title' && st.mode==='map' && st.layout==='typo'));
      pressed(b,d===cur); });
    const inLay=st.mode==='map' && !mapMoved()[k] && !(k==='title' && st.layout==='typo');
    const t=why ? `« ${DECO_NAMES[cur]} » sans effet : ${why}.` : inLay && cur==='libre' ? 'Choisir une présentation pose ce bloc sur l\u2019affiche, hors du gabarit.'
      : mix && st.mix.compo==='vig' && zoneOf(k)==='illus' ? 'Dans la bande de la vignette, le texte reste seul ; une présentation pose le bloc sur la carte.'
      : k==='title' ? DECO_HINTS[cur]||'' : '';
    const n=$(note); if(n.textContent!==t) n.textContent=t; n.hidden=!t;
    if(mix){ const zs=$(k==='title' ? 'tZoneSeg' : 'fZoneSeg'); setSeg(zs.id,zoneOf(k)); zs.querySelector<HTMLElement>('[data-v=illus]')!.textContent=st.mix.compo==='vig' ? 'Dans la bande' : 'Sur l\'illustration'; }
  }
  const tpl=P.ftpl||'classique'; setSeg('fTplSeg',tpl);
  $('bPlateOpts').hidden=!['title','foot'].some(k=>['cartouche','bandeau','etiquette','capsule','filets'].includes(decoOf(k)));
  const tn=st.mode==='map' && !mapMoved().foot ? 'Choisir une mise en forme pose ce bloc sur l\u2019affiche, hors du gabarit.'
    : mix && st.mix.compo==='vig' && zoneOf('foot')==='illus' ? 'Dans la bande de la vignette, la mise en forme reste classique ; une autre pose le bloc sur la carte.' : '';
  { const n=$('fTplNote'); if(n.textContent!==tn) n.textContent=tn; n.hidden=!tn; }
  const box=$('textPresets'), list=PRESETS.filter(([,on])=>on(st));
  if(box.childElementCount!==list.length || [...box.children].some((b,i)=>b.textContent!==list[i][0]))
    box.replaceChildren(...list.map(([name,,apply])=>{ const b=h('button',{type:'button',className:'chip'},name);
      b.onclick=()=>{ update(()=>apply(posOf())); syncText(); scheduleOver(); saveState(); toast(`Mise en page « ${name} » appliquée · « Annuler » pour revenir`); }; return b; }));
  box.hidden=!list.length;
}
export function swatches(id: string, list: string[][], field: string, custom?: boolean){
  const box=$(id); box.replaceChildren();
  for(const [hex,name] of list){
    const auto=hex==='auto', b=h('button',{type:'button',className:'sw'+(auto?' auto':hex?'':' none'),dataset:{v:hex},title:name,'aria-label':name},
      ...(auto ? [h('span',{},'Auto'),h('i',{'aria-hidden':'true'})] : []));
    if(hex && !auto) b.style.background=hex;
    b.onclick=()=>{ update(_s=>{ (_s.illusText as Opts)[field]=hex; }); syncText(); scheduleOver(); saveState(); };
    box.append(b);
  }
  if(custom){
    const i=h('input',{type:'color','aria-label':'Autre couleur des lettres'}), l=h('label',{className:'sw custom',title:'Autre couleur'},i);
    i.oninput=()=>{ update(_s=>{ (_s.illusText as Opts)[field]=i.value.toUpperCase(); }); syncText(); scheduleOver(); saveState(); };
    box.append(l);
  }
}
/** Position d'un bloc ('title' | 'foot') : une des 9 positions, ou 'auto' (bas : à l'opposé du titre ; Carte : dans le gabarit) */
export function setPos(k: string,p: string){update(()=>{
  Object.assign(posOf(),k==='title' ? {pos:p,free:null} : {fpos:p,ffree:null});
  syncText(); scheduleOver(); saveState();
});}
export function syncText(){
  const T: Opts=st.illusText, R=textStyle(), P=posOf();
  syncFonts();   // Vintage : option de la police du titre (#72)
  for(const [id,f] of [['swText','color'],['swShadow','shadow'],['swOutline','outline']])
    $(id).querySelectorAll('button').forEach(b=>pressed(b,b.dataset.v===T[f]));
  for(const [id,f] of [['swText','color'],['swShadow','shadow']]){ const i=$(id).querySelector<HTMLElement>('.sw.auto i'); if(i) i.style.background=R[f]||'transparent'; }   // couleur que donne « Auto »
  const cu=$('swText').querySelector('input'); if(cu){ cu.value=R.color; cu.parentElement!.classList.toggle('on',!SW_TEXT.some(([x])=>x===T.color)); }
  $('sShadowOff').closest<HTMLElement>('.slider')!.hidden=!R.shadow;   // décalage : seulement avec une ombre
  const map=st.mode==='map', inLay=(v: string)=>map && v==='auto';   // mode Carte : 'auto' = dans le gabarit
  $('tPosSeg').querySelectorAll('button').forEach(b=>pressed(b,!P.free && b.dataset.v===P.pos));
  $('fPosSeg').querySelectorAll('button').forEach(b=>pressed(b,!P.ffree && b.dataset.v===P.fpos));
  pressed($('fAutoBtn'),!P.ffree && P.fpos==='auto'); pressed($('tLayBtn'),!P.free && inLay(P.pos));
  $('fAutoBtn').textContent=map ? 'Dans le gabarit' : 'Auto : à l\u2019opposé du titre';
  const back=map ? '« Dans le gabarit » ou une position' : 'une position';
  $('tFreeNote').firstChild!.textContent=P.free ? `Titre placé librement (glissé sur l\u2019aperçu) : touchez ${back} pour revenir à la grille. ` : '';
  $('fFreeNote').firstChild!.textContent=P.ffree ? `Lignes du bas placées librement : touchez ${map?back:'« Auto » ou une position'} pour revenir à la grille. ` : '';
  $('oShadowOff').textContent=String(T.off);
  syncDecos(); syncPlate(); syncOrder();
}
