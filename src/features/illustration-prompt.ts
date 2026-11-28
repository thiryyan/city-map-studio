/* City Map Studio — Prompt du mode illustré et pistes (lues dans la carte, Wikipédia) (extrait de features/illustration.ts, #119). */
import {type PosterState, illusConf as C} from '../content/config.js';
import {clamp, posterDims, ratio, viewBounds} from '../core/geo/geo.js';
import {$, toast} from '../core/dom.js';
import {needConsent, osmData, st, ui} from '../core/doc/state.js';
import {loadMaplibre} from '../map/engines.js';
import {Piste} from '../core/illustration-state.js';
import {footRC, titleRC, zoneOf} from '../render/illustration-text.js';
import {region} from '../render/illustration-image.js';
import {IS} from '../core/illustration-state.js';
/** Rappels vers l'interface (une couche de fonctions n'importe pas l'interface) : posés par src/ui/illustration.ts */
export const refresh = {prompt: (): void => {}, wiki: (): void => {}};

// ---------- Pistes lues dans la carte (monuments, cours d'eau, paysages) ----------
export const POI_W: Record<string, number>={castle:10,palace:9,lighthouse:9,monument:7,fort:7,city_gate:6,attraction:7,ruins:6,viewpoint:5,museum:5,harbor:5,marina:5,townhall:4,zoo:3,theatre:3};
export const BIG_WORSHIP=/cath[ée]drale|basilique|abbaye|abbatiale|collégiale|cathedral|basilica|abbey|minster/i;
/** Étiquettes OSM (moteur Fichier) → piste {name, w} pondérée, ou null */
export function osmPiste(t: Record<string, string>): Piste | null {
  const n=(t['name:fr']||t.name||'').trim();
  if(t.landuse==='vineyard') return {name:'Vignobles',w:6};
  if(t.natural==='coastline') return {name:'Bord de mer',w:7};
  if(t.leisure==='marina' || t.landuse==='harbour') return {name:n||'Port',w:6};
  if(!n) return null;
  let w=0;
  if(t.historic==='castle' || t.building==='castle') w=10;
  else if(t.man_made==='lighthouse') w=9;
  else if(['monument','fort','city_gate'].includes(t.historic)) w=7;
  else if(t.historic==='ruins') w=6;
  else if(t.amenity==='place_of_worship' || ['cathedral','church','chapel','basilica'].includes(t.building)) w=BIG_WORSHIP.test(n) || t.building==='cathedral' ? 9 : 4;
  else if(t.tourism==='attraction') w=7;
  else if(t.tourism==='viewpoint' || t.tourism==='museum') w=5;
  else if(t.waterway==='river') w=8;
  else if(t.waterway==='canal' || t.natural==='water' || t.place==='island') w=4;
  else if(t.natural==='peak') w=5;
  else if(t.amenity==='townhall') w=4;
  else if(t.leisure==='park' || t.leisure==='garden') w=3;
  return w ? {name:n,w} : null;
}
/** Élément d'une couche OpenMapTiles (moteur GPU) → piste {name, w, rank}, ou null */
export function omtPiste(layer: string, p: Record<string, any>): Piste | null {
  const n=String(p['name:fr']||p.name||'').trim();
  switch(layer){
    case 'poi': { if(!n) return null; let w=POI_W[p.subclass]||POI_W[p.class]||0; if(p.class==='place_of_worship') w=BIG_WORSHIP.test(n)?9:4; return w ? {name:n,w,rank:p.rank} : null; }
    case 'waterway': return n && p.class==='river' ? {name:n,w:8} : null;
    case 'water_name': return n ? {name:n,w:['ocean','sea','bay'].includes(p.class)?8:6} : null;
    case 'mountain_peak': return n ? {name:n,w:5,rank:p.rank} : null;
    case 'park': return n ? {name:n,w:3} : null;
    case 'landcover': return p.subclass==='vineyard' ? {name:'Vignobles',w:6} : null;
    case 'water': return p.class==='ocean' ? {name:'Bord de mer',w:7} : null;
  }
  return null;
}
export const OMT_LAYERS=['poi','waterway','water_name','mountain_peak','park','landcover','water'];
/** Distance approchée (km) entre deux points {lat, lon} */
export const distKm=(a: {lat: number; lon: number},b: {lat: number; lon: number})=>Math.hypot((a.lon-b.lon)*111.32*Math.cos(b.lat*Math.PI/180),(a.lat-b.lat)*110.57);
/** Meilleures pistes : poids, rang OpenMapTiles (importance), distance au centre ; un seul exemplaire par nom */
export function rankPistes(cands: (Piste | null)[], max=6){
  const best=new Map<string, {name: string; sc: number}>();
  for(const c of cands){ if(!c || !c.name) continue;
    const sc=c.w*10-Math.min(c.rank??10,30)*0.3-Math.min(c.d||0,20)*1.5, k=c.name.toLowerCase();
    if(!best.has(k) || best.get(k)!.sc<sc) best.set(k,{name:c.name.slice(0,80),sc}); }
  return [...best.values()].sort((a,b)=>b.sc-a.sc).slice(0,max).map(x=>x.name);
}
export const L10N: Record<string, any>={
  fr:{rule:"RÈGLE ABSOLUE, À RESPECTER JUSQU'À LA FIN : l'image finale ne contient AUCUN texte (ni titre, ni nom de ville, ni lettre, chiffre, signature, logo ou filigrane) et AUCUN cadre, marge ou bordure : l'illustration va jusqu'aux bords. Le titre sera ajouté ensuite par un autre logiciel ; tout texte dans l'image la rendrait inutilisable, même si les affiches vintage en ont habituellement un.",
    role:(w: string)=>`Tu es illustrateur spécialisé dans les affiches touristiques vintage. Nous allons créer ensemble une illustration de ${w}, destinée à être imprimée en affiche.`,
    city:'la ville choisie', pistes:'PISTES À PRIVILÉGIER (choisies par moi) : ',
    style:"STYLE : affiche de voyage vintage, illustration vectorielle en aplats, dégradés doux, palette limitée (6 à 10 teintes) ; plans successifs : premier plan détaillé, sujet principal au plan médian, arrière-plan estompé, ciel avec un grand soleil pâle, nuages stylisés, quelques oiseaux ; lumière douce, aucune texture photographique.",
    comp:'COMPOSITION : garder une zone de ciel ou de fond calme et peu détaillée ', compEnd:' pour le titre.',
    noTitle:'COMPOSITION : le titre sera posé sur la carte, pas sur l\u2019illustration : inutile de lui réserver une zone.',
    zone:{h:'EN HAUT (environ 25 % de la hauteur)', m:'AU MILIEU (bande horizontale d’environ 20 % de la hauteur)', b:'EN BAS (environ 25 % de la hauteur)'},
    side:{g:', plutôt à gauche', c:'', d:', plutôt à droite'},
    footAt:{h:' Garder aussi le haut de l\u2019image assez simple pour quelques lignes de texte discrètes.', m:' Garder aussi le milieu de l\u2019image assez simple pour quelques lignes de texte discrètes.', b:' Garder aussi le bas de l\u2019image assez simple pour quelques lignes de texte discrètes.'},
    foot:{h:' Garder aussi le bas de l\u2019image assez simple pour quelques lignes de texte discrètes.', m:' Garder aussi le bas de l’image assez simple pour quelques lignes de texte discrètes.', b:' Garder aussi le haut de l’image assez simple pour quelques lignes de texte discrètes.'},
    format:'FORMAT : ', res:', dans la plus haute résolution possible', big:' ; au moins 4000 px sur le grand côté si possible',
    ratio:{p:'portrait, proportions 1:1,414 (A4) ; si ce format n\u2019est pas disponible, 2:3', p57:'portrait, proportions 5:7 ; si ce format n\u2019est pas disponible, 2:3',
      p23:'portrait, proportions 2:3', l23:'paysage, proportions 3:2',
      l:'paysage, proportions 1,414:1 (A4 couché) ; si ce format n’est pas disponible, 3:2', l57:'paysage, proportions 7:5 ; si ce format n’est pas disponible, 3:2'},
    fixed:'IMPOSÉ : ', moment:'moment de la journée : ', saison:'saison : ',
    med:(pos: string,shape: string)=>`Laisser aussi une zone calme et peu détaillée ${({haut:'en haut',centre:'au centre',bas:'en bas'} as Record<string, string>)[pos]} de l’image, au milieu de la largeur (${({circle:'un cercle',heart:'un cœur',arch:'une arche'} as Record<string, string>)[shape]} d’environ 45 % de la largeur) : une carte y sera posée.`,
    vig:'COMPOSITION : l’illustration sera affichée en petite vignette en forme d’arche, posée sur une carte : un sujet unique, centré, lisible de loin, sans détails fins ni zone réservée au titre.',
    vratio:'portrait, proportions 3:4 ; si ce format n\u2019est pas disponible, 2:3',
    hb:(f: string)=>`COMPOSITION DE L\u2019AFFICHE : l\u2019illustration n\u2019occupera que ${f==='two'?'les deux tiers du haut':'la moitié haute'} de l\u2019affiche, une carte occupant le bas : composition en largeur, sans élément important coupé par le bas de l\u2019image.`,
    cote:'COMPOSITION DE L\u2019AFFICHE : l\u2019illustration occupera la moitié gauche d\u2019une affiche en paysage, une carte occupant la moitié droite : composition en hauteur.',
    fondu:'Le bas de l\u2019image (environ 40 %) se fondra dans une carte : n\u2019y placer que des éléments simples (eau, prairie, chemin), sans sujet important.',
    ratioOf:(o: string,lab: string,alt: string)=>`${o}, proportions ${lab}${alt?` ; si ce format n\u2019est pas disponible, ${alt}`:''}`, orient:{p:'portrait',l:'paysage',c:'carré',w:'panoramique'},
    theme:(c: Record<string, string>)=>`palette accordée à l'affiche : fond ${c.paper}, encre ${c.text}, eau ${c.water}, accent ${c.marker}`,
    photo:'je te fournirai une photo dont tu reprendras la palette',
    steps:'DÉROULEMENT (une étape à la fois) :',
    s1:(c: string,p: boolean)=>`1. Propose-moi 4 ou 5 thèmes caractéristiques de ${c}${p?' en partant des pistes ci-dessus':''}, une phrase chacun, et demande-moi d'en choisir un ou d'en combiner deux.`,
    s2:'2. Pose-moi en une seule fois tes questions : ',
    q:{moment:'moment de la journée', saison:'saison ou événement', palette:'palette (propose 3 palettes nommées)', more:'éléments à inclure ou à éviter', view:'point de vue'},
    s3:'3. Résume la scène finale et attends ma validation.',
    s4:'4. Génère l’image en rappelant dans ta consigne de génération : « no text, no letters, no title, no typography, no border, no frame, full bleed ». Si tu ne peux pas générer d’images, écris un prompt final en anglais contenant ces mêmes interdictions.',
    s5:'5. Vérifie toi-même l’image : si elle contient du texte ou une marge, régénère-la sans attendre que je le demande. Propose-moi ensuite 2 ou 3 ajustements.'},
  en:{rule:'ABSOLUTE RULE, TO BE KEPT UNTIL THE END: the final image contains NO text at all (no title, no city name, no letters, numbers, signature, logo or watermark) and NO frame, margin or border: the illustration is full bleed. The title will be added later in another program; any text in the image would make it unusable, even though vintage posters usually have one.',
    role:(w: string)=>`You are an illustrator specialised in vintage travel posters. Together we will create an illustration of ${w}, to be printed as a poster.`,
    city:'the chosen city', pistes:'IDEAS TO FAVOUR (my choice): ',
    style:'STYLE: vintage travel poster, flat vector illustration, soft gradients, limited palette (6 to 10 hues); layered planes: detailed foreground, main subject in the middle ground, faded background, sky with a large pale sun, stylised clouds, a few birds; soft light, no photographic texture.',
    comp:'COMPOSITION: keep a calm, low-detail sky or background area ', compEnd:' for the title.',
    noTitle:'COMPOSITION: the title will be placed on the map, not on the illustration: no area needs to be reserved for it.',
    zone:{h:'at the TOP (about 25% of the height)', m:'in the MIDDLE (a horizontal band of about 20% of the height)', b:'at the BOTTOM (about 25% of the height)'},
    side:{g:', towards the left', c:'', d:', towards the right'},
    footAt:{h:' Also keep the top of the image simple enough for a few discreet lines of text.', m:' Also keep the middle of the image simple enough for a few discreet lines of text.', b:' Also keep the bottom of the image simple enough for a few discreet lines of text.'},
    foot:{h:' Also keep the bottom of the image simple enough for a few discreet lines of text.', m:' Also keep the bottom of the image simple enough for a few discreet lines of text.', b:' Also keep the top of the image simple enough for a few discreet lines of text.'},
    format:'FORMAT: ', res:', in the highest resolution available', big:'; at least 4000 px on the long side if possible',
    ratio:{p:'portrait, aspect ratio 1:1.414 (A4); if unavailable, 2:3', p57:'portrait, aspect ratio 5:7; if unavailable, 2:3',
      p23:'portrait, aspect ratio 2:3', l23:'landscape, aspect ratio 3:2',
      l:'landscape, aspect ratio 1.414:1 (A4 landscape); if unavailable, 3:2', l57:'landscape, aspect ratio 7:5; if unavailable, 3:2'},
    fixed:'FIXED: ', moment:'time of day: ', saison:'season: ',
    med:(pos: string,shape: string)=>`Also keep a calm, low-detail area ${({haut:'at the top',centre:'in the centre',bas:'at the bottom'} as Record<string, string>)[pos]} of the image, horizontally centred (${({circle:'a circle',heart:'a heart',arch:'an arch'} as Record<string, string>)[shape]} about 45% of the width wide): a map will be placed there.`,
    vig:'COMPOSITION: the illustration will be shown as a small arch-shaped vignette over a map: one single, centred subject, readable from afar, no fine detail and no area reserved for a title.',
    vratio:'portrait, aspect ratio 3:4; if unavailable, 2:3',
    hb:(f: string)=>`POSTER LAYOUT: the illustration will fill only ${f==='two'?'the top two thirds':'the top half'} of the poster, with a map below it: use a wide composition, with nothing important cut by the bottom edge.`,
    cote:'POSTER LAYOUT: the illustration will fill the left half of a landscape poster, with a map on the right half: use a tall composition.',
    fondu:'The bottom of the image (about 40%) will fade into a map: put only simple elements there (water, meadow, path), no important subject.',
    ratioOf:(o: string,lab: string,alt: string)=>`${o}, aspect ratio ${lab}${alt?`; if unavailable, ${alt}`:''}`, orient:{p:'portrait',l:'landscape',c:'square',w:'panoramic'},
    theme:(c: Record<string, string>)=>`palette matching the poster: background ${c.paper}, ink ${c.text}, water ${c.water}, accent ${c.marker}`,
    photo:'I will give you a photo whose palette you will reuse',
    steps:'PROCESS (one step at a time):',
    s1:(c: string,p: boolean)=>`1. Suggest 4 or 5 themes typical of ${c}${p?', starting from the ideas above':''}, one sentence each, and ask me to pick one or combine two.`,
    s2:'2. Ask me all your questions at once: ',
    q:{moment:'time of day', saison:'season or event', palette:'palette (suggest 3 named palettes)', more:'elements to include or avoid', view:'point of view'},
    s3:'3. Summarise the final scene and wait for my approval.',
    s4:'4. Generate the image, repeating in your generation instruction: "no text, no letters, no title, no typography, no border, no frame, full bleed". If you cannot generate images, write a final English prompt containing the same restrictions.',
    s5:'5. Check the image yourself: if it contains any text or margin, regenerate it without waiting for me to ask. Then suggest 2 or 3 adjustments.'}
};
/** Lignes de texte affichées en pied (dédicace, noms, date, coordonnées) : le prompt leur réserve une zone calme */
export const footLines=(s: PosterState)=>['dedication','names','date','coords'].some(k=>s.show[k]!==false && (k==='coords' || (s.texts[k]||'').trim()));
/** Phrase du prompt propre à la composition (mode Carte + illustration), affichée dans l'étape Composition */
export function compoLine(s: PosterState, lang='fr'){
  const L=L10N[lang], M=s.mix;
  return M.compo==='vig' ? L.vig : M.compo==='hb' ? L.hb(M.split) : M.compo==='cote' ? L.cote : M.compo==='fondu' ? L.fondu
    : L.med(M.pos,M.shape).replace(/^Laisser aussi/,'Laisser').replace(/^Also keep/,'Keep');
}
/** Proportions demandées pour une zone d'illustration de rapport r (largeur / hauteur) : la plus proche d'une liste
 *  usuelle, et en secours la plus proche de celles que proposent les générateurs (2:3, 3:4, 1:1, 4:3, 3:2, 16:9) */
export const RATIOS: [number, string, string, string][]=[[1/1.4142,'1:1,414','1:1.414','p'],[2/3,'2:3','2:3','p'],[3/4,'3:4','3:4','p'],[1,'1:1','1:1','c'],[4/3,'4:3','4:3','l'],
  [1.4142,'1,414:1','1.414:1','l'],[3/2,'3:2','3:2','l'],[16/9,'16:9','16:9','l'],[2.5,'5:2','5:2','w'],[3,'3:1','3:1','w']];
export const GEN=['2:3','3:4','1:1','4:3','3:2','16:9'];
export function ratioText(r: number, L: any, en: boolean){
  const near=(list: typeof RATIOS)=>list.reduce((a,b)=>Math.abs(Math.log(b[0]/r))<Math.abs(Math.log(a[0]/r))?b:a);
  const best=near(RATIOS), alt=near(RATIOS.filter(x=>GEN.includes(x[1])));
  return L.ratioOf(L.orient[best[3]], en?best[2]:best[1], alt===best ? '' : en?alt[2]:alt[1]);
}
/** Prompt complet pour l'IA externe, d'après l'état (ville, pistes, choix, format, position du titre) */
export function buildPrompt(s: PosterState){
  const P=s.illus.prompt, L=L10N[P.lang]||L10N.fr, T=s.mode==='mix' ? s.illusText.mix : s.illusText;   // positions de l'affiche illustrée (#77)
  const city=(s.texts.title||'').trim()||L.city, area=(s.texts.subtitle||'').trim();
  const where=(s.texts.title||'').trim() ? city.toUpperCase()+(area?` (${area})`:'') : city;
  const out=[L.rule, L.role(where)];
  if(P.pistes.length) out.push(L.pistes+P.pistes.join(', ')+'.');
  out.push(L.style);
  const cp=s.mode==='mix' ? s.mix.compo : '', vig=cp==='vig';
  if(cp==='hb') out.push(L.hb(s.mix.split)); else if(cp==='cote') out.push(L.cote);
  if(vig) out.push(L.vig);
  const rc=titleRC(T), auto=T.fpos==='auto' && !T.ffree;   // positions réelles (glissées) des deux blocs
  // Bloc posé sur l'illustration ? Carte + illustration (#86) : un bloc posé sur la carte n'y réserve aucune zone ; sur toute
  // l'affiche, il tombe sur l'illustration ou sur la carte selon sa position
  const onIllus=(k: string)=>{
    if(s.mode!=='mix') return true;
    const z=zoneOf(k,s); if(z==='illus') return true; if(z==='map') return false;
    const p=k==='title' ? rc : footRC(T);
    return cp==='hb' ? p[0]==='h' || (p[0]==='m' && s.mix.split==='two') : cp==='cote' ? p[1]==='g' : cp==='fondu' ? p[0]!=='b' : true;
  };
  const tI=onIllus('title'), fI=footLines(s) && onIllus('foot');
  const tail=(cp==='med'?' '+L.med(s.mix.pos,s.mix.shape):'')+(cp==='fondu'?' '+L.fondu:'');
  if(!vig && tI) out.push(L.comp+L.zone[rc[0]]+L.side[rc[1]]+L.compEnd+(fI?(auto && zoneOf('foot',s)===zoneOf('title',s) ? L.foot[rc[0]] : L.footAt[footRC(T)[0]]):'')+tail);
  else if(!vig) out.push(L.noTitle+(fI ? L.footAt[footRC(T)[0]] : '')+tail);
  const r57=s.format==='50x70', land=s.orient==='landscape';
  let fmt=vig ? L.vratio : L.ratio[(land?'l':'p')+(r57?'57':s.format==='10x15'?'23':'')];
  if(cp==='hb' || cp==='cote'){ const d=posterDims(s), R=region(s); fmt=ratioText(d.W*R.fw/(d.H*R.fh),L,P.lang==='en'); }
  out.push(L.format+fmt+L.res+(r57?L.big:'')+'.');
  const idx=P.lang==='en'?2:1, label=(list: string[][],k: string)=>(list.find(x=>x[0]===k)||list[0])[idx].toLowerCase();
  const fixed: string[]=[];
  if(P.moment!=='any') fixed.push(L.moment+label(C.MOMENTS,P.moment));
  if(P.saison!=='any') fixed.push(L.saison+label(C.SAISONS,P.saison));
  if(P.palette==='theme') fixed.push(L.theme(s.colors));
  if(P.palette==='photo') fixed.push(L.photo);
  if(fixed.length) out.push(L.fixed+fixed.join(' ; ')+'.');
  const qs: string[]=[];
  if(P.moment==='any') qs.push(L.q.moment);
  if(P.saison==='any') qs.push(L.q.saison);
  if(P.palette==='ia') qs.push(L.q.palette);
  qs.push(L.q.more, L.q.view);
  out.push(L.steps, L.s1(city,P.pistes.length>0), L.s2+qs.join(', ')+'.', L.s3, L.s4, L.s5);
  return out.join('\n\n');
}
/** Pistes lues dans la carte : données importées (moteur Fichier) ou tuiles du lieu (moteur GPU, carte hors écran) */
export async function scanPistes(){
  const btn=$('bScanPistes'), lab=btn.querySelector('span'), center=st.center;
  const done=(list: string[])=>{ IS.found=list; refresh.prompt();
    toast(list.length ? `${list.length} piste${list.length>1?'s':''} trouvée${list.length>1?'s':''} dans la carte : touchez-les pour les ajouter`
      : 'Aucune piste nommée autour du lieu : dézoomez la carte ou ajoutez vos pistes', !list.length); };
  if(st.engine==='file'){
    if(!osmData){ toast('Importez d\u2019abord un fichier de données (onglet Lieu, section Avancé)',true); return; }
    done(rankPistes((osmData.named||[]).map((x: any)=>{ const c=osmPiste(x.t); return c && {...c, d:distKm(x,center)}; }))); return;
  }
  if(!needConsent(()=>scanPistes())) return;
  btn.disabled=true; lab!.textContent='Lecture de la carte…';
  try{
    if(!CMS.maplibre.lib) await loadMaplibre();
    if(!CMS.maplibre.lib) throw new Error('librairie cartographique indisponible');
    const cands=await CMS.engines.mlQuery(st, (map: any)=>{
      const out=[];
      for(const L of OMT_LAYERS){ let fs=[]; try{ fs=map.querySourceFeatures('omt',{sourceLayer:L}); }catch(e){}
        for(const f of fs){ const c=omtPiste(L,f.properties||{}); if(!c) continue;
          const g=f.geometry; if(g?.type==='Point') c.d=distKm({lon:g.coordinates[0],lat:g.coordinates[1]},center); out.push(c); } }
      return out;
    });
    done(rankPistes(cands||[]));
  }catch(e){ toast('Lecture de la carte impossible : '+((e as Error).message||e),true); }
  finally{ btn.disabled=false; lab!.textContent='Trouver des pistes dans la carte'; }
}
/** Rayon de recherche (m) : demi-diagonale de la carte affichée, entre 1 et 10 km */
export function wikiRadius(){
  const r=ui.slotCss, b=viewBounds({center:st.marker,zoom:st.zoom},r?.w>0 ? r.h/r.w : ratio()), dx=(b.e-b.w)/2*111.32*Math.cos(st.marker.lat*Math.PI/180), dy=(b.n-b.s)/2*110.57;
  return Math.round(clamp(Math.hypot(dx,dy)*1000,1000,10000));
}
export async function scanWiki(){
  if(!IS.wikiOn || IS.wikiBusy) return;
  if(navigator.onLine===false){ refresh.wiki(); toast('Hors ligne : recherche Wikipédia indisponible',true); return; }
  if(!needConsent(()=>scanWiki())) return;
  const lab=$('bWikiPistes').querySelector('span'), m=st.marker;
  IS.wikiBusy=true; refresh.wiki(); lab!.textContent='Recherche dans Wikipédia…'; $('wikiHint').textContent='Recherche en cours (10 s au plus)…';
  try{
    const pages=await CMS.wiki.search({lat:m.lat, lon:m.lon, radius:wikiRadius()});
    const list=CMS.wiki.rankWiki(pages, m, {city:st.texts.title||''}), seen=new Set(list.map((x: string)=>x.toLowerCase()));
    IS.found=[...list, ...IS.found.filter(x=>!seen.has(x.toLowerCase()))].slice(0,12); refresh.prompt();
    toast(list.length ? `${list.length} lieu${list.length>1?'x':''} remarquable${list.length>1?'s':''} trouvé${list.length>1?'s':''} dans Wikipédia : touchez-les pour les ajouter`
      : 'Aucun lieu remarquable dans Wikipédia autour du lieu : dézoomez la carte ou ajoutez vos pistes', !list.length);
  }catch(e){
    const er=e as CmsError | undefined;
    if(er?.code==='ABORTED') return;
    toast(er?.code==='TIMEOUT' ? 'Wikipédia ne répond pas : réessayez plus tard (les pistes de la carte restent disponibles)'
      : er?.code==='RATE_LIMITED' ? 'Wikipédia limite les requêtes : réessayez dans une minute'
      : 'Recherche Wikipédia impossible : '+(er?.message||e),true);
  }finally{ IS.wikiBusy=false; lab!.textContent='Lieux remarquables (Wikipédia)'; refresh.wiki(); }
}
