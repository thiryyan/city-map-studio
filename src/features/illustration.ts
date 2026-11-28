/* City Map Studio — Modes illustrés : affiche de voyage façon vintage à partir d'une illustration importée.
 * Module ES (#102), importé par src/app/main.ts ; réuni en un seul script par le build (scripts/build.mjs).html.
 *
 * L'application ne génère pas l'image : elle rédige un prompt pour l'IA de l'utilisateur (ChatGPT, Gemini…), qui pose
 * ses questions puis livre une illustration sans texte ni marge ; l'image importée est cadrée, retouchée, et le titre
 * est posé par drawPoster (aperçu et export identiques). L'image reste dans le navigateur ; seules les pistes peuvent, à la
 * demande et après accord, lire les tuiles de la carte ou interroger Wikipédia (option désactivée par défaut, CMS.wiki).
 * L'image n'est pas dans l'état (st) : elle est tenue ici (image source ré-encodée, copie réduite pour l'aperçu).
 */
import {type PosterState, type Pt, CANVAS_MAX_PX, DEFAULT_STATE, DUOS, FONTS, FORMATS} from '../content/config.js';
import {V, needConsent, osmData, saveState, st, ui} from '../core/doc/state.js';
import {type Geom, type Rect, clamp, clipMap, exportSpec, geom, posterDims, ratio, shapeD, strokeShape, textLine, viewBounds} from '../core/geo/geo.js';
import {attributionText, contrast, dedLeading, dedLines, drawHalo, drawMarkers, drawOrnaments, drawText, fontOf, fontStr, hexA, noteFit, paint, tScale, textW} from '../render/poster.js';
import {loadMaplibre} from '../map/engines.js';
import {changed, drawUnder, layoutPreview, poster, scheduleOver, slot, stage} from '../ui/preview.js';
import {loadSaves, setOrient, updateLayoutUI} from './features.js';
import {loadFonts, refreshCards, showTab, syncFonts, syncInputs, updateEngineUI} from '../ui/panel.js';
import {$, h, pressed, setSeg, setStatus, toast} from '../ui/dom.js';
/** Contexte 2D ; réglages de l'illustration (st.illus) ; sacs d'options */
type Ctx = CanvasRenderingContext2D;
type Illus = PosterState['illus'];
type Opts = Record<string, any>;
/** Image importée : source ré-encodée, copie réduite (aperçu), dimensions, métadonnées, adresse locale (blob) */
type Img = {full: HTMLCanvasElement; prev: HTMLCanvasElement; w: number; h: number; name: string; size: number; ref: string; url: string | null};
/** Piste du prompt : nom, poids, rang OpenMapTiles, distance au centre (km) */
/** Texte d'une ligne : simple, ou composé de morceaux [texte, options] ; ligne posée dans un bloc */
type Part = [string, Opts];
type Txt = string | Part[];
/** Morceaux présents (les lignes vides valent '' ou false) */
const present=(a: unknown[])=>a.filter(Boolean) as Part[];
type Piste = {name: string; w: number; rank?: number; d?: number};
CMS.define('illus', () => {
  const C = CMS.illusConf;
  // ---------- Fonctions pures (testées sans navigateur : tests/unit/illus.test.mjs) ----------
  const GRADES: Record<string, string> = {ok:'Bonne', mid:'Juste', bad:'Insuffisante'};
  /** Résolution d'impression de l'image pour chaque format (ppp), selon le cadrage ; agrandissement ×2 : lissage crédité de 45 %.
   *  Seuils (bonne, juste) : 200 / 140 ppp ; 300 / 200 pour le 10 × 15 cm, petite photo regardée de près. */
  const SEUILS: Record<string, number[]>={'10x15':[300,200]};
  /** Part de l'affiche occupée par l'illustration (1 × 1, sauf la vignette du mode Carte + illustration) */
  function region(s: PosterState){
    if(s.mode!=='mix' || s.mix.compo==='med' || s.mix.compo==='fondu') return {fw:1,fh:1};
    const d=posterDims(s), g=geom(s,d.W,d.H); return {fw:g.illus!.w/d.W, fh:g.illus!.h/d.H};
  }
  function quality(s: PosterState, iw: number, ih: number){
    const I=s.illus, land=s.orient==='landscape', R=region(s);
    return FORMATS.map(([key,name,a,b])=>{
      const Win=(land?b:a)/25.4*R.fw, Hin=(land?a:b)/25.4*R.fh;
      const base=I.fit==='contain' ? Math.max(iw/Win,ih/Hin) : Math.min(iw/Win,ih/Hin);
      const dpi=Math.round(base/(I.zoom/100)), eff=I.upscale ? dpi*1.45 : dpi;
      const [ok,mid]=SEUILS[key]||[200,140];
      return {key, name, dpi, grade: eff>=ok ? 'ok' : eff>=mid ? 'mid' : 'bad'};
    });
  }
  /** Part de l'image hors de l'affiche (cadrage « Remplir ») ou des bandes laissées vides (« Image entière »), en % */
  function cropPct(s: PosterState, iw: number, ih: number){
    const d=posterDims(s), R=region(s), a=iw/ih, b=d.W*R.fw/(d.H*R.fh);
    return Math.round((1-Math.min(a,b)/Math.max(a,b))*100);
  }
  /** Rectangle de l'image dans une affiche W × H : remplir ou contenir, puis zoom et décalage (fractions de l'affiche) */
  function placement(W: number, H: number, iw: number, ih: number, I: Illus){
    const s0=I.fit==='contain' ? Math.min(W/iw,H/ih) : Math.max(W/iw,H/ih), s=s0*I.zoom/100, w=iw*s, h=ih*s;
    return {x:(W-w)/2+I.ox*W, y:(H-h)/2+I.oy*H, w, h};
  }
  /** Retouches point par point (identiques quelle que soit la résolution : aperçu et export concordent).
   *  Luminosité, contraste, saturation ; filtre vintage (sépia, contraste) ; aplats (6 niveaux par couche). */
  function adjust(I: Illus){
    const v=I.vintage;
    return {b:1+I.bright/100, c:1+I.contrast/100+(v==='strong'?0.06:0), s:1+I.satur/100-(v==='strong'?0.15:0),
      sep:v==='light'?0.18:v==='strong'?0.42:0, flat:!!I.flat};
  }
  type Adj = ReturnType<typeof adjust>;
  const neutral=(a: Adj)=>a.b===1 && a.c===1 && a.s===1 && !a.sep && !a.flat;
  function processPixels(d: Uint8ClampedArray, a: Adj){
    const lut=new Uint8ClampedArray(256);
    for(let i=0;i<256;i++) lut[i]=(i*a.b-128)*a.c+128;
    const q=(v: number)=>Math.round(Math.min(255,Math.max(0,v))/51)*51;
    for(let i=0;i<d.length;i+=4){
      let r=lut[d[i]], g=lut[d[i+1]], b=lut[d[i+2]];
      if(a.s!==1){ const L=0.2126*r+0.7152*g+0.0722*b; r=L+(r-L)*a.s; g=L+(g-L)*a.s; b=L+(b-L)*a.s; }
      if(a.sep){ const sr=0.393*r+0.769*g+0.189*b, sg=0.349*r+0.686*g+0.168*b, sb=0.272*r+0.534*g+0.131*b;
        r+=(sr-r)*a.sep; g+=(sg-g)*a.sep; b+=(sb-b)*a.sep; }
      if(a.flat){ r=q(r); g=q(g); b=q(b); }
      d[i]=r; d[i+1]=g; d[i+2]=b;   // Uint8ClampedArray : bornage et arrondi automatiques
    }
    return d;
  }
  // ---------- Pistes lues dans la carte (monuments, cours d'eau, paysages) ----------
  const POI_W: Record<string, number>={castle:10,palace:9,lighthouse:9,monument:7,fort:7,city_gate:6,attraction:7,ruins:6,viewpoint:5,museum:5,harbor:5,marina:5,townhall:4,zoo:3,theatre:3};
  const BIG_WORSHIP=/cath[ée]drale|basilique|abbaye|abbatiale|collégiale|cathedral|basilica|abbey|minster/i;
  /** Étiquettes OSM (moteur Fichier) → piste {name, w} pondérée, ou null */
  function osmPiste(t: Record<string, string>): Piste | null {
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
  function omtPiste(layer: string, p: Record<string, any>): Piste | null {
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
  const OMT_LAYERS=['poi','waterway','water_name','mountain_peak','park','landcover','water'];
  /** Distance approchée (km) entre deux points {lat, lon} */
  const distKm=(a: {lat: number; lon: number},b: {lat: number; lon: number})=>Math.hypot((a.lon-b.lon)*111.32*Math.cos(b.lat*Math.PI/180),(a.lat-b.lat)*110.57);
  /** Meilleures pistes : poids, rang OpenMapTiles (importance), distance au centre ; un seul exemplaire par nom */
  function rankPistes(cands: (Piste | null)[], max=6){
    const best=new Map<string, {name: string; sc: number}>();
    for(const c of cands){ if(!c || !c.name) continue;
      const sc=c.w*10-Math.min(c.rank??10,30)*0.3-Math.min(c.d||0,20)*1.5, k=c.name.toLowerCase();
      if(!best.has(k) || best.get(k)!.sc<sc) best.set(k,{name:c.name.slice(0,80),sc}); }
    return [...best.values()].sort((a,b)=>b.sc-a.sc).slice(0,max).map(x=>x.name);
  }
  const L10N: Record<string, any>={
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
  const footLines=(s: PosterState)=>['dedication','names','date','coords'].some(k=>s.show[k]!==false && (k==='coords' || (s.texts[k]||'').trim()));
  /** Phrase du prompt propre à la composition (mode Carte + illustration), affichée dans l'étape Composition */
  function compoLine(s: PosterState, lang='fr'){
    const L=L10N[lang], M=s.mix;
    return M.compo==='vig' ? L.vig : M.compo==='hb' ? L.hb(M.split) : M.compo==='cote' ? L.cote : M.compo==='fondu' ? L.fondu
      : L.med(M.pos,M.shape).replace(/^Laisser aussi/,'Laisser').replace(/^Also keep/,'Keep');
  }
  /** Proportions demandées pour une zone d'illustration de rapport r (largeur / hauteur) : la plus proche d'une liste
   *  usuelle, et en secours la plus proche de celles que proposent les générateurs (2:3, 3:4, 1:1, 4:3, 3:2, 16:9) */
  const RATIOS: [number, string, string, string][]=[[1/1.4142,'1:1,414','1:1.414','p'],[2/3,'2:3','2:3','p'],[3/4,'3:4','3:4','p'],[1,'1:1','1:1','c'],[4/3,'4:3','4:3','l'],
    [1.4142,'1,414:1','1.414:1','l'],[3/2,'3:2','3:2','l'],[16/9,'16:9','16:9','l'],[2.5,'5:2','5:2','w'],[3,'3:1','3:1','w']];
  const GEN=['2:3','3:4','1:1','4:3','3:2','16:9'];
  function ratioText(r: number, L: any, en: boolean){
    const near=(list: typeof RATIOS)=>list.reduce((a,b)=>Math.abs(Math.log(b[0]/r))<Math.abs(Math.log(a[0]/r))?b:a);
    const best=near(RATIOS), alt=near(RATIOS.filter(x=>GEN.includes(x[1])));
    return L.ratioOf(L.orient[best[3]], en?best[2]:best[1], alt===best ? '' : en?alt[2]:alt[1]);
  }
  /** Prompt complet pour l'IA externe, d'après l'état (ville, pistes, choix, format, position du titre) */
  function buildPrompt(s: PosterState){
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

  // ---------- Image importée (aucune donnée envoyée : décodée et ré-encodée dans le navigateur) ----------
  const TYPES=/^image\/(png|jpeg|webp)$/, EXT=/\.(png|jpe?g|webp)$/i;
  const MAX_BYTES=40*1024*1024, MIN_SIDE=64, PREV_SIDE=1600;
  const MAX_PX=Math.min(36e6, CANVAS_MAX_PX*0.6);   // laisse de la place au canevas d'export (iOS : 16,7 Mpx au total)
  let img: Img | null=null;
  let step='prompt', found: string[]=[];   // found : pistes trouvées dans la carte (proposées, non retenues)
  const cache: {key: string; canvas: HTMLCanvasElement | null}={key:'', canvas:null};   // dernière image retouchée (aperçu ou export)
  let grainTex: {land: boolean; c: HTMLCanvasElement} | null=null;
  /** Image importée, supposée présente (appelants : après ready()) */
  const IMG=()=>img!;
  const canvasOf=(w: number,h: number)=>{ const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w)); c.height=Math.max(1,Math.round(h)); return c; };
  /** Réduction de qualité : par moitiés successives (plus net qu'un seul passage) */
  function resample(src: HTMLCanvasElement, w: number, h: number){
    let cur=src, cw=src.width, ch=src.height;
    while(cw/2>w*1.05 && ch/2>h*1.05){ const n=canvasOf(cw/2,ch/2), x=n.getContext('2d')!; x.imageSmoothingQuality='high'; x.drawImage(cur,0,0,n.width,n.height); cur=n; cw=n.width; ch=n.height; }
    const out=canvasOf(w,h), o=out.getContext('2d')!; o.imageSmoothingQuality='high'; o.drawImage(cur,0,0,out.width,out.height); return out;
  }
  /** Agrandissement ×2 lissé, suivi d'un léger renforcement des contours (aucun détail inventé) ; borné par la mémoire */
  function upscale2(src: HTMLCanvasElement){
    const f=Math.min(2, Math.sqrt(MAX_PX/(src.width*src.height)));
    if(f<=1.05) return src;
    const out=canvasOf(src.width*f,src.height*f), x=out.getContext('2d')!; x.imageSmoothingQuality='high'; x.drawImage(src,0,0,out.width,out.height);
    const id=x.getImageData(0,0,out.width,out.height), d=id.data, w=out.width, h=out.height, o=new Uint8ClampedArray(d);
    const k=0.35;   // renforcement doux : p + k·(p − moyenne des 4 voisins)
    for(let y=1;y<h-1;y++) for(let xx=1;xx<w-1;xx++){ const i=(y*w+xx)*4;
      for(let c=0;c<3;c++){ const p=o[i+c]; d[i+c]=p+k*(4*p-o[i+c-4]-o[i+c+4]-o[i+c-4*w]-o[i+c+4*w])/4; } }
    x.putImageData(id,0,0); return out;
  }
  /** Image retouchée pour un rendu de largeur W : copie réduite pour l'aperçu, pleine définition (×2 si demandé) pour l'export */
  function processed(W: number, H: number){
    const img=IMG(), I=st.illus, r=placement(W,H,img.w,img.h,I), big=r.w>img.prev.width*1.15;
    const a=adjust(I), key=JSON.stringify([big, big && I.upscale, a, img.full.width]);
    if(cache.key===key) return cache.canvas!;
    let src=big ? (I.upscale ? upscale2(img.full) : img.full) : img.prev;
    if(!neutral(a)){
      const c=canvasOf(src.width,src.height), x=c.getContext('2d',{willReadFrequently:true})!; x.drawImage(src,0,0);
      const id=x.getImageData(0,0,c.width,c.height); processPixels(id.data,a); x.putImageData(id,0,0); src=c;
    }
    if(cache.canvas && cache.canvas!==img.full && cache.canvas!==img.prev && cache.canvas!==src){ cache.canvas.width=cache.canvas.height=0; }
    cache.key=key; cache.canvas=src; return src;
  }
  /** Grain : bruit fixe (graine constante) d'une base de 1240 px agrandie, comme le papier : même grain à l'aperçu et à l'export */
  function grain(land: boolean){
    if(grainTex && grainTex.land===land) return grainTex.c;
    const w=land?1754:1240, h=land?1240:1754, c=canvasOf(w,h), x=c.getContext('2d')!, id=x.createImageData(w,h), d=id.data;
    let seed=20231123; const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
    for(let i=0;i<d.length;i+=4){ const v=255-Math.round(rnd()*rnd()*150); d[i]=d[i+1]=d[i+2]=v; d[i+3]=255; }
    x.putImageData(id,0,0); grainTex={land,c}; return c;
  }
  // ---------- Conservation : IndexedDB (images binaires), l'état ne garde qu'une référence ----------
  // st.illus.img = {ref, name, w, h} : ref = empreinte SHA-256 du fichier importé (64 hexa). L'image ré-encodée (WebP,
  // PNG si le navigateur n'encode pas le WebP) est rangée sous cette clé. Les configurations restent dans localStorage.
  // Sans IndexedDB (navigation privée stricte, stockage bloqué) : l'image n'est gardée que pendant la visite.
  const DB_NAME='cms3', DB_STORE='images', REF_RE=/^[0-9a-f]{64}$/, DATA_RE=/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
  /** Image rangée (IndexedDB, ou mémoire de la visite) */
  type Rec = {blob: Blob; w: number; h: number; name: string; size: number};
  const memStore=new Map<string, Rec>(); let dbP: Promise<IDBDatabase | null> | null=null, dbWarned=false, persistAsked=false;
  function db(){
    if(dbP) return dbP;
    dbP=new Promise<IDBDatabase | null>(res=>{
      try{
        const rq=indexedDB.open(DB_NAME,1);
        rq.onupgradeneeded=()=>rq.result.createObjectStore(DB_STORE);
        rq.onsuccess=()=>res(rq.result); rq.onerror=()=>res(null); rq.onblocked=()=>res(null);
      }catch(e){ res(null); }
    });
    return dbP;
  }
  async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore)=>IDBRequest | void): Promise<T | undefined> {
    const d=await db(); if(!d) throw new Error('IndexedDB indisponible');
    return new Promise((res,rej)=>{ try{ const tx=d.transaction(DB_STORE,mode), rq=fn(tx.objectStore(DB_STORE));
      tx.oncomplete=()=>res(rq?.result); tx.onerror=tx.onabort=()=>rej(tx.error||new Error('IndexedDB')); }catch(e){ rej(e); } });
  }
  const store={
    async get(ref: string): Promise<Rec | undefined> { try{ const v=await idb<Rec>('readonly',(s: IDBObjectStore)=>s.get(ref)); return v ?? memStore.get(ref); }catch(e){ return memStore.get(ref); } },
    async put(ref: string,rec: Rec){
      memStore.set(ref,rec);
      try{ await idb('readwrite',(s: IDBObjectStore)=>s.put(rec,ref)); memStore.delete(ref);
        if(!persistAsked){ persistAsked=true; navigator.storage?.persist?.().catch(()=>{}); }   // demande d'un stockage persistant
        return true; }
      catch(e){ if(!dbWarned){ dbWarned=true; toast('Stockage du navigateur indisponible : l’illustration ne sera gardée que pendant cette visite',true); } return false; }
    },
    async keys(){ let k: string[]=[]; try{ k=(await idb<string[]>('readonly',(s: IDBObjectStore)=>s.getAllKeys()))||[]; }catch(e){} return [...new Set([...k,...memStore.keys()])]; },
    async del(ref: string){ memStore.delete(ref); try{ await idb('readwrite',(s: IDBObjectStore)=>s.delete(ref)); }catch(e){} }
  };
  /** Empreinte SHA-256 (hexadécimal) des octets d'un fichier */
  async function sha256(buf: ArrayBuffer){
    const d=new Uint8Array(await crypto.subtle.digest('SHA-256',buf));
    return Array.from(d,x=>x.toString(16).padStart(2,'0')).join('');
  }
  const refOf=(s: {illus?: {img?: {ref: string} | null}} | null | undefined)=>s?.illus?.img?.ref||'';
  /** Supprime les images que plus rien n'utilise (affiche en cours, Mes affiches) ; lancé au démarrage et après une suppression */
  async function gc(){
    const used=new Set([refOf(st),...loadSaves().map(e=>refOf(e.state))].filter(Boolean));
    for(const k of await store.keys()) if(!used.has(k)) await store.del(k);
  }
  const blobToDataUrl=(b: Blob)=>new Promise<string>((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result as string); r.onerror=()=>rej(r.error); r.readAsDataURL(b); });
  /** Images à intégrer dans un fichier : {ref: {data, name, w, h}} (celles qui manquent sont omises) */
  async function exportImages(refs: string[]){
    const out: Record<string, {data: string; name: string; w: number; h: number}>={};
    for(const ref of new Set(refs.filter((r: string)=>REF_RE.test(r)))){ const rec=await store.get(ref); if(rec?.blob) out[ref]={data:await blobToDataUrl(rec.blob), name:rec.name, w:rec.w, h:rec.h}; }
    return out;
  }
  // Fichiers de configuration et sauvegardes avec illustrations intégrées (src/features/features.ts) : version 2, limites propres
  const FILE=Object.freeze({version:2, cfgMax:60*1024*1024, bakMax:400*1024*1024});
  /** Ajoute à un fichier les illustrations de ses affiches (include : case « Inclure les illustrations ») ; renvoie {o, note} */
  async function attachImages(o: Record<string, unknown>, states: Parameters<typeof refOf>[0][], include: boolean){
    const refs=[...new Set(states.map(refOf).filter(Boolean))];
    if(!refs.length || !include) return {o, note:refs.length ? ' · sans les illustrations' : ''};
    const images=await exportImages(refs), n=Object.keys(images).length, missing=refs.length-n, pl=(k: number)=>k>1?'s':'';
    return {o:n ? {...o, version:FILE.version, images} : o,
      note:(n?` · ${n} illustration${pl(n)} incluse${pl(n)}`:'')+(missing?` · ${missing} illustration${pl(missing)} introuvable${pl(missing)} dans ce navigateur`:'')};
  }
  /** Images lues dans un fichier : chacune décodée puis ré-encodée ; une image déjà présente n'est jamais remplacée.
   *  Renvoie {added, bad} (images ajoutées, images refusées). */
  async function importImages(images: unknown){
    let added=0, bad=0;
    if(!images || typeof images!=='object' || Array.isArray(images)) return {added,bad};
    for(const [ref,o] of Object.entries(images as Record<string, any>).slice(0,50)){
      try{
        if(!REF_RE.test(ref) || !o || typeof o.data!=='string' || o.data.length>MAX_BYTES*1.4 || !DATA_RE.test(o.data)) throw new Error('entrée invalide');
        if((await store.get(ref))?.blob) continue;
        const bin=atob(o.data.slice(o.data.indexOf(',')+1)), u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
        const bmp=await createImageBitmap(new Blob([u8 as BlobPart]));
        try{
          if(bmp.width<MIN_SIDE || bmp.height<MIN_SIDE) throw new Error('image trop petite');
          const {full}=toCanvas(bmp);
          await store.put(ref,{blob:await encode(full), w:full.width, h:full.height, name:V.str(o.name,'image',120), size:u8.length}); full.width=full.height=0;
        }finally{ bmp.close?.(); }
        added++;
      }catch(e){ bad++; }
    }
    if(added){ tried=''; }   // une image arrivée d'un fichier : nouvelle tentative de chargement
    return {added,bad};
  }
  /** Pixels d'une image décodée dans un canevas (taille bornée par la mémoire) : ré-encodage sans métadonnées */
  function toCanvas(bmp: ImageBitmap){
    const f=Math.min(1, Math.sqrt(MAX_PX/(bmp.width*bmp.height)));
    const full=canvasOf(bmp.width*f,bmp.height*f), x=full.getContext('2d')!; x.imageSmoothingQuality='high'; x.drawImage(bmp,0,0,full.width,full.height);
    return {full, reduced:f<1};
  }
  const encode=(c: HTMLCanvasElement)=>new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('encodage impossible')),'image/webp',0.95));
  function setImage(full: HTMLCanvasElement, meta: {name: string; size: number; ref: string}){
    const p=Math.min(1,PREV_SIDE/Math.max(full.width,full.height)), prev=p<1 ? resample(full,full.width*p,full.height*p) : full;
    freeImage();
    img={full, prev, w:full.width, h:full.height, name:meta.name, size:meta.size, ref:meta.ref, url:null};
  }
  function freeImage(){
    if(cache.canvas && (!img || (cache.canvas!==img.full && cache.canvas!==img.prev))) cache.canvas.width=cache.canvas.height=0;
    cache.key=''; cache.canvas=null;
    if(!img) return;
    img.full.width=img.full.height=0; if(img.prev!==img.full) img.prev.width=img.prev.height=0;
    if(img.url) URL.revokeObjectURL(img.url);
    img=null;
  }
  /** L'image chargée suit la référence de l'état (démarrage, restauration, lien, « Annuler ») ; introuvable : signalée */
  let loading='', missing=false, tried='';   // tried : dernière référence introuvable (pas de nouvelle tentative en boucle)
  async function ensureImage(){
    const want=st.illus.img;
    if(!want){ if(img){ freeImage(); redraw(); } missing=false; return; }
    if(img && img.ref===want.ref){ missing=false; return; }
    if(st.mode==='map' || loading===want.ref) return;   // chargée au passage en mode illustré
    loading=want.ref; missing=false; syncImage(); redraw();
    let ok=false;
    try{
      const rec=await store.get(want.ref);
      if(rec?.blob && st.illus.img?.ref===want.ref){
        const bmp=await createImageBitmap(rec.blob);
        try{ setImage(toCanvas(bmp).full,{name:rec.name||want.name, size:rec.size, ref:want.ref}); ok=true; } finally{ bmp.close?.(); }
      }
    }catch(e){ ok=false; }
    loading=''; tried=ok ? '' : want.ref;
    if(st.illus.img?.ref!==want.ref) return ensureImage();   // l'état a changé pendant le chargement
    missing=!ok; sync(); redraw();
    CMS.emit('illus:loaded',ok);
  }
  async function importFile(file: File | null | undefined){
    if(!file) return false;
    if(!(TYPES.test(file.type) || (!file.type && EXT.test(file.name||'')))){
      const ext=((file.name||'').match(/\.([\w]{1,6})$/)||[])[1];
      return fail(`Format non pris en charge${ext?` (.${ext.toLowerCase()})`:''}. Formats acceptés : PNG, JPEG ou WebP.`);
    }
    if(file.size>MAX_BYTES) return fail('Image trop lourde (40 Mo au plus).');
    let bmp: ImageBitmap, buf: ArrayBuffer;
    try{ buf=await file.arrayBuffer(); bmp=await createImageBitmap(new Blob([buf],{type:file.type})); }catch(e){ return fail('Image illisible : le fichier est peut-être endommagé.'); }
    try{
      if(bmp.width<MIN_SIDE || bmp.height<MIN_SIDE) return fail(`Image trop petite (${MIN_SIDE} px de côté au moins).`);
      const ref=await sha256(buf), expected=st.illus.img, wasMissing=missing;
      const {full,reduced}=toCanvas(bmp);   // ré-encodage : seuls les pixels sont gardés (métadonnées, coordonnées GPS comprises, écartées)
      const name=(file.name||'image collée').slice(0,120);
      setImage(full,{name, size:file.size, ref});
      const same=!!expected && expected.ref===ref, other=wasMissing && !!expected && !same;
      st.illus.img={ref, name, w:full.width, h:full.height};
      if(!same) Object.assign(st.illus,{zoom:100,ox:0,oy:0});
      missing=false; fail('');
      setStep('image'); sync(); redraw(); saveState();
      toast(same ? 'Illustration retrouvée' : other ? `Ce n’est pas l’illustration de l’affiche (« ${expected.name} ») : la nouvelle image la remplace` : 'Illustration importée'+(reduced?' (réduite pour tenir en mémoire)':''), other);
      if(!(await store.get(ref))?.blob) await store.put(ref,{blob:await encode(full), w:full.width, h:full.height, name, size:file.size});
      return true;
    }finally{ bmp.close?.(); }
  }
  function fail(msg: string){ const e=$('illusErr'); if(e) e.textContent=msg; if(msg) toast(msg,true); return !msg; }
  /** Retire l'illustration de l'affiche (l'image reste stockée jusqu'au prochain nettoyage : « Annuler » la retrouve) */
  function removeImage(){
    if(!img && !st.illus.img) return;
    freeImage(); st.illus.img=null; missing=false; sync(); redraw(); saveState(); toast('Illustration retirée');
  }

  // ---------- Rendu (appelé par drawPoster : aperçu et export) ----------
  function draw(ctx: Ctx, W: number, H: number, pass: string, g: Geom){
    const U=g.U;
    if(pass!=='over'){
      ctx.fillStyle=st.colors.paper; ctx.fillRect(0,0,W,H);
      if(ready()) drawImageIn(ctx,g.illus!,W,H); else placeholder(ctx,W,H,U,st.illus.img);
    }
    if(pass!=='under') drawTexts(ctx,W,H,U);
  }
  const FADE_STOP=0.45;   // fondu : la carte est pleinement visible à partir de 45 % de sa hauteur
  /** Image retouchée dans un cadre r (et sa forme : arche de la vignette), avec papier jauni et grain */
  function drawImageIn(ctx: Ctx, r: Rect, W: number, H: number){
    const img=IMG(), I=st.illus, P=placement(r.w,r.h,img.w,img.h,I), x=r.x+P.x, y=r.y+P.y;
    ctx.save(); clipMap(ctx,r);
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    ctx.drawImage(processed(r.w,r.h),x,y,P.w,P.h);
    ctx.beginPath(); ctx.rect(x,y,P.w,P.h); ctx.clip();
    ctx.globalCompositeOperation='multiply';
    if(I.paper){ ctx.globalAlpha=I.vintage==='strong'?0.42:0.28; ctx.fillStyle='#E7D6B0'; ctx.fillRect(x,y,P.w,P.h); }
    if(I.grain){ ctx.globalAlpha=I.vintage==='strong'?0.6:0.42; ctx.drawImage(grain(W>H),0,0,W,H); }
    ctx.restore();
  }
  /** Carte + illustration (drawPoster) : médaillon (carte dans une forme sur l'illustration) ou vignette (illustration sur la carte) */
  function drawMix(ctx: Ctx, W: number, H: number, pass: string, g: Geom, mapFn?: (ctx: Ctx, rect: Rect, view: any, i: number)=>void){
    const c=st.colors, U=g.U, T=textStyle(), med=g.mix==='med', r=g.map;
    if(pass!=='over'){
      ctx.fillStyle=c.paper; ctx.fillRect(0,0,W,H);
      if(g.mix!=='vig'){ if(ready()) drawImageIn(ctx,g.illus!,W,H); else if(med || g.mix==='fondu') placeholder(ctx,W,H,U,st.illus.img); else placeholderIn(ctx,g.illus!,U); }
    }
    if(pass==='all' && mapFn) g.places.forEach((p,i)=>{
      if(p.rect.fade){   // fondu : carte rendue à part, puis effacée vers le haut (même dégradé que le masque de l'aperçu)
        const R=p.rect, t=canvasOf(R.w,R.h), x=t.getContext('2d')!, loc={x:0,y:0,w:t.width,h:t.height};
        x.fillStyle=c.land; x.fillRect(0,0,t.width,t.height); mapFn(x,loc,p.view,i);
        x.globalCompositeOperation='destination-in'; const gr=x.createLinearGradient(0,0,0,t.height); gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(FADE_STOP,'rgba(0,0,0,1)');
        x.fillStyle=gr; x.fillRect(0,0,t.width,t.height); ctx.drawImage(t,R.x,R.y,R.w,R.h); t.width=t.height=0; return;
      }
      ctx.save(); clipMap(ctx,p.rect); ctx.fillStyle=c.land; ctx.fillRect(p.rect.x,p.rect.y,p.rect.w,p.rect.h); mapFn(ctx,p.rect,p.view,i); ctx.restore(); });
    if(pass==='under') return;
    for(const p of g.places){
      if(st.fx?.halo){ ctx.save(); clipMap(ctx,p.rect); drawHalo(ctx,p.rect,p.view); ctx.restore(); }
      ctx.save(); clipMap(ctx,p.rect); drawOrnaments(ctx,p.rect,p.view,U,true); ctx.restore();
      ctx.save(); clipMap(ctx,p.rect); drawMarkers(ctx,p.rect,p.view,U,W,true); ctx.restore();
    }
    const ink=contrast(T.color,c.paper)>=2.5 ? T.color : c.text;   // sur le papier : couleur du titre si elle s'y lit
    // Zone de chaque bloc (#86) : l'illustration (la bande pour la vignette), la carte ou toute l'affiche
    const Z: Record<string, string>={title:zoneOf('title'), foot:zoneOf('foot')}, specs: Record<string, Opts>={}, band: string[]=[];
    for(const k of ['title','foot']){
      if(g.mix==='vig' && Z[k]==='illus'){ band.push(k); continue; }
      const A=zoneArea(Z[k],g,W,H)!; specs[k]={A,env:{halo:Z[k]==='map',map:mapIn(r,A)},onMap:Z[k]==='map'};
    }
    if(med){   // contour de la forme : même réglage que les gabarits de la Carte (#77) ; le filet papier détache toujours la carte
      ctx.save(); ctx.strokeStyle=c.paper; ctx.lineWidth=0.02*U; strokeShape(ctx,r,0.01*U);
      if(st.ring){ ctx.strokeStyle=paint(ink); ctx.lineWidth=0.0022*U; strokeShape(ctx,r,0.021*U); } ctx.restore();
    } else if(g.mix==='vig'){
      ctx.strokeStyle=paint(c.frame);
      ctx.lineWidth=0.0025*U; const o1=0.014*U; ctx.strokeRect(r.x-o1,r.y-o1,r.w+2*o1,r.h+2*o1);
      ctx.lineWidth=0.0009*U; const o2=0.006*U; ctx.strokeRect(r.x-o2,r.y-o2,r.w+2*o2,r.h+2*o2);
      const v=g.illus!, e=0.012*U, edge={...v,x:v.x-e,y:v.y-e,w:v.w+2*e,h:v.h+2*e};
      ctx.save(); ctx.shadowColor='rgba(0,0,0,0.22)'; ctx.shadowBlur=0.02*U; ctx.shadowOffsetY=0.006*U; clipMap(ctx,{...edge,x:edge.x-0.04*U,y:edge.y-0.04*U,w:edge.w+0.08*U,h:edge.h+0.08*U,shape:null});
      ctx.fillStyle=c.paper; const pth=new Path2D(); pth.addPath(new Path2D(shapeD('arch',edge.w,edge.h)),new DOMMatrix().translate(edge.x,edge.y)); ctx.fill(pth); ctx.restore();
      if(ready()) drawImageIn(ctx,v,W,H); else placeholderIn(ctx,v,U);
    }
    const B=drawBlocks(ctx,U,specs,T.color);
    if(g.mix==='vig') Object.assign(B,drawBand(ctx,W,H,U,g,ink,band));
    noteLayout(ctx,W,H,B,med ? r : null);
    ctx.globalAlpha=0.55;
    drawText(ctx,attributionText(false),W-g.m,H-g.m*0.38,{size:0.0085*U,align:'right',color:g.mix==='vig' ? c.text : T.color,ink:'attribution'});
    ctx.globalAlpha=1;
  }
  function placeholderIn(ctx: Ctx, r: Rect, U: number){
    const ink=st.colors.text; ctx.save(); clipMap(ctx,r); ctx.fillStyle=hexA(ink)(0.08); ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.fillStyle=hexA(ink)(0.7); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`600 ${0.026*U}px system-ui, sans-serif`;
    ctx.fillText(st.illus.img && !loading ? 'Illustration à importer' : 'Illustration',r.x+r.w/2,r.y+r.h*0.6,r.w*0.9); ctx.restore();
  }
  /** Vignette : titre et lignes dans la bande sous la carte, centrés, réduits ensemble pour y tenir */
  function placeholder(ctx: Ctx, W: number, H: number, U: number, want: Illus['img']){
    const m=0.06*U, ink=st.colors.text;
    ctx.save(); ctx.strokeStyle=hexA(ink)(0.35); ctx.lineWidth=Math.max(1,0.003*U); ctx.setLineDash([0.012*U,0.009*U]);
    ctx.strokeRect(m,H*0.3,W-2*m,H*0.62);
    ctx.fillStyle=hexA(ink)(0.7); ctx.textAlign='center'; ctx.textBaseline='middle';
    const [l1,l2]=!want ? ['Votre illustration apparaîtra ici','Onglet Illustration : prompt, puis import de l’image']
      : loading ? ['Chargement de l’illustration…',''] : ['Illustration à importer',`« ${want.name} » (${want.w} × ${want.h} px)`];
    ctx.font=`600 ${0.034*U}px system-ui, sans-serif`; ctx.fillText(l1,W/2,H*0.58,W-0.16*U);
    ctx.font=`400 ${0.024*U}px system-ui, sans-serif`; ctx.fillText(l2,W/2,H*0.58+0.05*U,W-0.16*U);
    ctx.restore();
  }
  // ---------- Textes des modes illustrés : mise en page des deux blocs (titre, bas), commune au rendu, aux zones de prise et au prompt ----------
  // Bloc de titre (titre + sous-titre) : 9 positions (pos) ou position libre (free). Bloc du bas (dédicace, noms, date et
  // coordonnées) : « Auto » (côté opposé au titre, centré), 9 positions (fpos) ou position libre (ffree). Position libre :
  // centre du bloc en fraction de la zone des textes ; alignement des lignes selon le tiers (gauche, centre, droite).
  const third=(v: number)=>v<1/3 ? 0 : v>2/3 ? 2 : 1;
  const rowOf=(y: number)=>'hmb'[third(y)], colOf=(x: number)=>'gcd'[third(x)];
  /** Largeur dessinée d'une ligne (mêmes règles que drawText : capitales, interlettrage, réduction à maxW) */
  function measure(ctx: Ctx, t: string, o: Opts){
    if(!t) return 0;
    const F=o.fk ? FONTS[o.fk] : fontOf(o.role,o.key); if(o.upper && !F.script) t=t.toUpperCase();
    ctx.save(); ctx.font=fontStr(o.size,o); const w=textW(ctx,t,F.script?0:(o.spacing||0),o.size); ctx.restore();
    return Math.min(w,o.maxW||Infinity);
  }
  /** Ligne composée (date · coordonnées, #77) : t est une liste de morceaux [texte, options] posés sur la même ligne de base,
   *  chacun à sa taille ; l'ensemble est réduit d'un même facteur pour tenir dans o.maxW. Sinon t est un texte. */
  function measureLine(ctx: Ctx, t: Txt, o: Opts): number {
    if(!Array.isArray(t)) return measure(ctx,t,o);
    const w=t.reduce((a: number,[x,po])=>a+measure(ctx,x,{...po,maxW:undefined}),0);
    return Math.min(w,o.maxW||Infinity);
  }
  /** Dessine une ligne (texte, ou morceaux d'une ligne composée) ; o.align : alignement de l'ensemble sur x */
  function drawLine(ctx: Ctx, t: Txt, x: number, y: number, o: Opts){
    if(!Array.isArray(t)){ drawText(ctx,t,x,y,o); return; }
    const ws=t.map(([s,po])=>measure(ctx,s,{...po,maxW:undefined})), tot=ws.reduce((a,b)=>a+b,0), k=Math.min(1,(o.maxW||Infinity)/(tot||1));
    if(k<1) noteFit(o.key,k);
    let sx=o.align==='center' ? x-tot*k/2 : o.align==='right' ? x-tot*k : x;
    t.forEach(([s,po],i)=>{ drawText(ctx,s,sx,y,{...o,...po,size:po.size*k,align:'left',maxW:undefined}); sx+=ws[i]*k; });
  }
  /** Ligne « date · coordonnées » des modes illustrés : chaque partie à sa propre taille (réglages Taille de la date et des coordonnées) */
  function infoLine(U: number, base: number, o: Opts): {t: Txt; o: Opts} | null {
    const d=textLine('date'), c=textLine('coords');
    const od={...o,key:'date',size:base*U*tScale('date')}, oc={...o,key:'coords',size:base*U*tScale('coords')};
    if(d && c) return {t:CMS.order.sort(['date','coords'])[0]==='coords' ? [[c,oc],['  ·  ',od],[d,od]] : [[d,od],['  ·  ',od],[c,oc]], o:{...od,size:Math.max(od.size,oc.size)}};
    return d ? {t:d,o:od} : c ? {t:c,o:oc} : null;
  }
  /** Lignes du bloc du bas, communes à toutes les mises en page des modes illustrés (et aux blocs sortis du gabarit en mode Carte) :
   *  dédicace (une ou deux lignes, réglage dedWrap, comme les gabarits), noms, date · coordonnées, légende des lieux numérotés.
   *  Tailles de base en U ; renvoie [{t, o, lead}] (lead : hauteur de ligne). */
  function footRows(U: number, maxW: number, sizes?: Opts){
    const S={dedication:0.034,names:0.026,info:0.017,legend:0.014,...sizes}, G: Record<string, {t: Txt; o: Opts; lead: number}[]>={}, lead=(sz: number)=>sz*1.55;
    const ded=textLine('dedication');
    if(ded){ const sz=S.dedication*U*tScale('dedication'), L=dedLines(ded,sz/U,maxW/U,{italic:true});
      G.dedication=L.lines.map((t: string,i: number)=>({t,o:{italic:true,key:'dedication',size:sz},lead:i ? dedLeading(sz/U)*U : lead(sz)})); }
    const names=textLine('names');
    if(names){ const sz=S.names*U*tScale('names'); G.names=[{t:names,o:{italic:true,key:'names',size:sz},lead:lead(sz)}]; }
    const info=infoLine(U,S.info,{spacing:0.2}), ik=CMS.order.sort(['date','coords'])[0];   // ligne date · coordonnées : rang de la première des deux
    if(info) G[ik]=[{...info,lead:lead(info.o.size)}];
    const leg=textLine('legend');
    if(leg){ const sz=S.legend*U; G.legend=[{t:leg,o:{spacing:0.06,key:'legend',size:sz},lead:lead(sz)}]; }
    return CMS.order.sort(['dedication','names',ik,'legend']).flatMap((k: string)=>G[k]||[]);
  }
  /** Gabarits du bloc du bas (#90) : Ligne unique, Souvenir, Carnet, Colonnes. Lignes [{t, o, at, x?, al?}] : x depuis le bord
   *  gauche du contenu, al : alignement propre ; rules : filets [{x1, y1, x2, y2}]. La légende des lieux numérotés suit, alignée
   *  sur le bloc. Renvoie {lines, w, h, rules} (null : aucune ligne). sk : contour des lettres (null sur une plaque). */
  function footTpl(ctx: Ctx, U: number, mw: number, tpl: string, sk: Opts | null){
    const tx=(k: string)=>textLine(k), sz=(k: string,b: number)=>b*U*tScale(k), lines: Opts[]=[], rules: Opts[]=[], W_=(t: Txt,o: Opts)=>measureLine(ctx,t,{...o,maxW:undefined});
    const od=(b: number)=>({italic:true,key:'dedication',size:sz('dedication',b),stroke:sk}), on=(b: number)=>({italic:true,key:'names',size:sz('names',b),stroke:sk});
    const oi=(k: string,b: number)=>({key:k,spacing:0.2,size:sz(k,b),stroke:sk});
    const ded=tx('dedication'), names=tx('names'), date=tx('date'), coords=tx('coords');
    let w=0, h=0;
    if(tpl==='ligne'){   // tout sur une ligne, dans l'ordre des lignes choisi, réduite pour tenir
      const P: Record<string, Part | ''>={dedication:ded && [ded,od(0.022)], names:names && [names,on(0.022)], date:date && [date,oi('date',0.015)], coords:coords && [coords,oi('coords',0.015)]};
      const parts=present(CMS.order.sort(['dedication','names','date','coords']).map((k: string)=>P[k]));
      if(parts.length){ const t: Part[]=[], sep=oi('date',0.015);
        parts.forEach((p,i)=>{ if(i) t.push(['   ·   ',{...sep,key:''}]); t.push(p); });
        const big=Math.max(...parts.map(p=>p[1].size)); h=big*1.15;
        lines.push({t,at:big*0.85,o:{size:big,maxW:mw,key:parts[0][1].key,stroke:sk}}); w=Math.min(mw,W_(t,{})); }
    } else if(tpl==='pile'){   // chaque information sur sa propre ligne, dans l'ordre choisi (la date et les coordonnées ne sont pas réunies)
      const P: Record<string, Part | ''>={dedication:ded && [ded,od(0.024)], names:names && [names,on(0.02)], date:date && [date,oi('date',0.015)], coords:coords && [coords,oi('coords',0.015)]};
      let y=0; for(const [t,o] of present(CMS.order.sort(['dedication','names','date','coords']).map((k: string)=>P[k]))){
        const q: Opts={...o,maxW:mw}; y+=q.size*(y ? 1.4 : 0.85); lines.push({t,at:y,o:q}); w=Math.max(w,W_(t,q)); }
      w=Math.min(w,mw); h=y+0.008*U;
    } else if(tpl==='souvenir'){   // dédicace | noms à gauche ; date sur coordonnées à droite
      const L=present(CMS.order.sort(['dedication','names']).map((k: string)=>k==='dedication' ? ded && [ded,od(0.03)] : names && [names,on(0.022)]));
      const R=present(CMS.order.sort(['date','coords']).map((k: string)=>k==='date' ? date && [date,oi('date',0.015)] : coords && [coords,oi('coords',0.015)]));
      const g=0.028*U, G=0.05*U, wl=L.map(([t,o])=>W_(t,o)), wr=Math.max(0,...R.map(([t,o])=>W_(t,o)));
      const need=wl.reduce((a,b)=>a+b,0)+(L.length>1 ? 2*g : 0)+(R.length && L.length ? G+wr : wr);
      const f=Math.min(1,mw/Math.max(need,1)); if(f<1) for(const [,o] of [...L,...R]){ o.size*=f; noteFit(o.key,f); }
      const rs=R.length ? R[0][1].size : 0, capL=Math.max(0,...L.map(([,o])=>o.size*0.8));
      const yb=Math.max(capL,R.length ? rs*0.8+(R.length-1)*rs*1.55 : 0);
      let x=0; L.forEach(([t,o],i)=>{ if(i){ rules.push({x1:x+g,x2:x+g,y1:yb-capL,y2:yb+o.size*0.2}); x+=2*g; } lines.push({t,at:yb,x,al:'left',o}); x+=wl[i]*f; });
      R.forEach(([t,o],i: number)=>lines.push({t,at:rs*0.8+i*rs*1.55+(yb-(rs*0.8+(R.length-1)*rs*1.55)),x:mw,al:'right',o}));
      w=R.length ? mw : Math.min(mw,x); h=yb+Math.max(rs,...L.map(([,o])=>o.size))*0.3;
    } else if(tpl==='carnet'){   // aligné à gauche : noms en grand, filet court, dédicace, date · coordonnées
      let y=0;
      if(names){ const o={...on(0.042),maxW:mw}; y+=o.size*0.85; lines.push({t:names,at:y,x:0,al:'left',o}); w=Math.max(w,W_(names,o)); y+=0.022*U; rules.push({x1:0,x2:0.08*U,y1:y,y2:y}); y+=0.02*U; w=Math.max(w,0.08*U); }
      if(ded){ const o={...od(0.024),maxW:mw}; y+=o.size*0.85; lines.push({t:ded,at:y,x:0,al:'left',o}); w=Math.max(w,W_(ded,o)); y+=o.size*0.6; }
      const info=infoLine(U,0.015,{spacing:0.2}); if(info){ const o: Opts={...info.o,maxW:mw,stroke:sk}; y+=o.size*1.1; lines.push({t:info.t,at:y,x:0,al:'left',o}); w=Math.max(w,W_(info.t,o)); }
      w=Math.min(w,mw); h=y+0.006*U;
    } else if(tpl==='colonnes'){   // date | dédicace et noms | coordonnées
      const C=present([ded && [ded,{...od(0.026),maxW:mw*0.5}], names && [names,{...on(0.02),maxW:mw*0.5}]]);
      let y=0; for(const [t,o] of C){ y+=o.size*(y ? 1.4 : 0.85); lines.push({t,at:y,x:mw/2,al:'center',o}); }
      const side=[date && [date,{...oi('date',0.015),maxW:mw*0.24},0,'left'], coords && [coords,{...oi('coords',0.015),maxW:mw*0.24},mw,'right']].filter(Boolean) as [string, Opts, number, string][];
      const yb=y || Math.max(0,...side.map(([,o])=>o.size*0.85));
      for(const [t,o,x,al] of side) lines.push({t,at:yb,x,al,o});
      w=mw; h=Math.max(yb,y)+0.008*U;
    }
    if(!lines.length) return null;
    const leg=textLine('legend');
    if(leg){ const o: Opts={spacing:0.06,key:'legend',size:0.014*U,maxW:mw,stroke:sk}; h+=o.size*1.6; lines.push({t:leg,at:h-o.size*0.3,o}); }
    return {lines,w,h,rules};
  }
  /** Rangée d'une ligne : lignes [{t, o, at}] (at : ligne de base depuis le haut du bloc) → bloc {lines, w, h} */
  function blockOf(ctx: Ctx, lines: Opts[], h: number){ return {lines, w:Math.max(0,...lines.map(l=>measureLine(ctx,l.t,l.o))), h}; }
  /** Place un bloc : position prédéfinie (row, col) avec ses marges, ou centre libre {x, y} ; renvoie {left, top, align} */
  function placeBlock(b: Opts, W: number, H: number, m: number, spec: Opts, kind: string){
    let left: number, top: number, align: string;
    if(spec.free){
      const cx=b.w>=W ? W/2 : clamp(spec.free.x*W,b.w/2,W-b.w/2), cy=b.h>=H ? H/2 : clamp(spec.free.y*H,b.h/2,H-b.h/2);
      left=cx-b.w/2; top=cy-b.h/2; align=['left','center','right'][third(spec.free.x)];
    } else {
      const [row,col]=spec.pos;
      top = kind==='title' ? (row==='h' ? 0.065*H : row==='m' ? (H-b.h)/2 : H-0.075*H-b.h)
                           : (row==='h' ? 0.05*H : row==='m' ? (H-b.h)/2 : H-0.045*H-b.h);
      align=col==='g' ? 'left' : col==='d' ? 'right' : 'center';
      left=col==='g' ? m : col==='d' ? W-m-b.w : (W-b.w)/2;
    }
    const ax=align==='left' ? left : align==='right' ? left+b.w : left+b.w/2;
    return {left, top, align, ax, rect:{x:left,y:top,w:b.w,h:b.h}};
  }
  /** Position effective (ligne, colonne) d'un bloc, pour le prompt et le bloc du bas « Auto » */
  const titleRC=(T: Opts): string=>T.free ? rowOf(T.free.y)+colOf(T.free.x) : T.pos;
  const footSpec=(T: Opts): Opts=>T.ffree ? {free:T.ffree} : {pos:T.fpos==='auto' ? (titleRC(T)[0]==='b' ? 'hc' : 'bc') : T.fpos};
  const footRC=(T: Opts): string=>T.ffree ? rowOf(T.ffree.y)+colOf(T.ffree.x) : footSpec(T).pos;
  // ---------- Présentations des blocs (#86, #90) : texte seul, cartouche, bandeau, étiquette, capsule, filets, arc, cachet, vertical ----------
  /** Zone d'un bloc : en Carte + illustration, l'illustration (la bande de la vignette), la carte ou toute l'affiche */
  const zoneOf=(k: string,s=st): string=>s.mode==='mix' ? ((s.illusText.mix.zone as Record<string, string>)?.[k]||'illus') : 'illus';
  /** Forme de carte autour de laquelle le titre peut se courber (Arc) : cercle ou arche, sinon null */
  function arcShape(s=st){
    if(s.mode==='mix') return s.mix.compo==='med' && ['circle','arch'].includes(s.mix.shape) ? s.mix.shape : null;
    if(s.mode==='map') return ({medallion:'circle',arch:'arch'} as Record<string, string>)[s.layout]||null;
    return null;
  }
  /** Pourquoi une présentation est sans objet ici ('' : elle s'applique) */
  function decoWhy(k: string, d: string, s=st){
    if(!d || d==='libre') return '';
    if(k==='foot' && !C.FOOT_DECOS.includes(d)) return 'réservée au titre';
    if(s.mode==='map' && !(mapMoved(s) as Record<string, boolean>)[k]) return s.layout==='typo' && k==='title' ? 'le titre forme la carte du gabarit Lettres'
      : k==='title' ? 'le titre est dans le gabarit' : 'les lignes du bas sont dans le gabarit';
    if(s.mode==='mix' && s.mix.compo==='vig' && zoneOf(k,s)==='illus') return 'la bande de la vignette garde le texte seul';
    if(d==='arc' && !arcShape(s)) return s.mode==='map' ? 'seulement avec les gabarits Médaillon et Arche' : 'seulement autour d’un médaillon rond ou en arche';
    return '';
  }
  /** Présentation appliquée : celle choisie, ou le texte seul quand elle est sans objet (le choix est gardé) */
  const decoOf=(k: string,s=st)=>{ const d=(posOf(s).deco as Record<string, string>)?.[k]||'libre'; return decoWhy(k,d,s) ? 'libre' : d; };
  // marges intérieures (en U) : horizontale, verticale ; multipliées par l'éloignement du trait (st.illusText.plate.gap, #90)
  const PADS: Record<string, number[]>={cartouche:[0.06,0.045], bandeau:[0,0.04], etiquette:[0.075,0.045], capsule:[0.06,0.03], filets:[0.012,0.04]};
  /** Encre des plaques (cartouche, bandeau, étiquette, capsule, cachet) : couleur des lettres si elle se lit à 4,5:1 sur le papier, sinon Texte du thème */
  function plateInk(col: string, bg?: string){
    const p=bg||st.colors.paper;
    for(const x of [col,st.colors.text]) if(/^#[0-9A-Fa-f]{6}$/.test(x||'') && contrast(x,p)>=4.5) return x;
    return contrast('#000000',p)>=contrast('#FFFFFF',p) ? '#000000' : '#FFFFFF';
  }
  /** Lettres d'un texte le long d'un cercle (centre cx, cy ; r : rayon de la ligne de base). En haut, les lettres montent vers
   *  l'extérieur ; en bas, elles restent debout, tournées vers le centre. Réduit pour tenir dans l'angle maxA. */
  function arcLayout(ctx: Ctx, t: string, cx: number, cy: number, r: number, top: boolean, o: Opts, maxA: number){
    if(!t || r<=0) return null;
    const F=o.fk ? FONTS[o.fk] : fontOf(o.role,o.key); if(o.upper && !F.script) t=t.toUpperCase();
    const chars=[...t], sp=F.script ? 0 : (o.spacing||0);
    const widths=(size: number)=>{ ctx.save(); ctx.font=fontStr(size,o); const w=chars.map(c=>ctx.measureText(c).width+sp*size); ctx.restore(); return w; };
    let size=o.size, ws=widths(size), tot=ws.reduce((a,b)=>a+b,0)-sp*size;
    if(tot>maxA*r){ const k=maxA*r/tot; noteFit(o.key,k); size*=k; ws=widths(size); tot=ws.reduce((a,b)=>a+b,0)-sp*size; }
    const glyphs: Opts[]=[], cap=size*0.75; let s=0, x1=Infinity, y1=Infinity, x2=-Infinity, y2=-Infinity;
    chars.forEach((c,i)=>{
      const a=(s+(ws[i]-sp*size)/2-tot/2)/r, th=top ? -Math.PI/2+a : Math.PI/2-a, x=cx+r*Math.cos(th), y=cy+r*Math.sin(th), r2=top ? r+cap : r-cap;
      glyphs.push([c,x,y,top ? th+Math.PI/2 : th-Math.PI/2]);
      for(const [qx,qy] of [[x,y],[cx+r2*Math.cos(th),cy+r2*Math.sin(th)]]){ x1=Math.min(x1,qx); y1=Math.min(y1,qy); x2=Math.max(x2,qx); y2=Math.max(y2,qy); }
      s+=ws[i];
    });
    const pad=size*0.35;
    return {glyphs, o:{...o,size,spacing:0,upper:false,maxW:undefined,align:'center'}, box:{x:x1-pad,y:y1-pad,w:x2-x1+2*pad,h:y2-y1+2*pad}};
  }
  const union=(boxes: (Opts | null | undefined)[])=>{ const B=boxes.filter(Boolean) as Opts[]; if(!B.length) return null;
    const x=Math.min(...B.map((b: Opts)=>b.x)), y=Math.min(...B.map((b: Opts)=>b.y)); return {x, y, w:Math.max(...B.map((b: Opts)=>b.x+b.w))-x, h:Math.max(...B.map((b: Opts)=>b.y+b.h))-y}; };
  function drawArc(ctx: Ctx, A: Opts, col: string){
    if(A) for(const [c,x,y,rot] of A.glyphs){ ctx.save(); ctx.translate(x,y); ctx.rotate(rot); drawText(ctx,c,0,0,{...A.o,color:col}); ctx.restore(); }
  }
  /** Trait des plaques (cartouche, bandeau, étiquette, capsule, filets ; Textes, Plus de réglages) : style, épaisseur et couleur
   *  ('auto' : couleur propre à la plaque). draw(d) trace le chemin du trait, rentré de d vers l'intérieur (second trait du style
   *  double) ; k : épaisseur relative (filet fin des filets art déco). */
  function plateLine(ctx: Ctx, U: number, auto: string, draw: (off: number)=>void, k=1){
    const P=st.illusText.plate||{line:'solid',w:1,color:'auto'}; if(P.line==='none') return;
    const lw=0.0018*U*P.w*k;
    ctx.save(); ctx.strokeStyle=paint(P.color==='auto' ? auto : P.color); ctx.lineCap=P.line==='dotted' ? 'round' : 'butt';
    if(P.line==='dashed') ctx.setLineDash([lw*5,lw*3.5]); else if(P.line==='dotted') ctx.setLineDash([0.001,lw*2.6]);
    if(P.line==='double'){ ctx.lineWidth=lw*1.2; draw(0); ctx.lineWidth=lw*0.45; draw(lw*3.2); }
    else { ctx.lineWidth=lw; draw(0); }
    ctx.restore();
  }
  /** Rectangle à coins coupés (étiquette) : chemin, coins de taille c */
  function chamfer(ctx: Ctx, x: number, y: number, w: number, h: number, c: number){
    ctx.beginPath(); ctx.moveTo(x+c,y); ctx.lineTo(x+w-c,y); ctx.lineTo(x+w,y+c); ctx.lineTo(x+w,y+h-c); ctx.lineTo(x+w-c,y+h);
    ctx.lineTo(x+c,y+h); ctx.lineTo(x,y+h-c); ctx.lineTo(x,y+c); ctx.closePath();
  }
  /** Rectangle aux bouts arrondis (capsule) : chemin */
  function pill(ctx: Ctx, x: number, y: number, w: number, h: number){
    const r=Math.min(h,w)/2; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arc(x+w-r,y+r,r,-Math.PI/2,Math.PI/2);
    ctx.lineTo(x+r,y+h); ctx.arc(x+r,y+r,r,Math.PI/2,Math.PI*1.5); ctx.closePath();
  }
  /** Filets art déco : un filet et un filet fin au-dessus et au-dessous du bloc, interrompus par un petit losange au centre */
  function drawRules(ctx: Ctx, r: Opts, U: number, ink: string){
    const w=(st.illusText.plate||{}).w||1, s=0.008*U*Math.sqrt(w), cx=r.x+r.w/2, thin=0.0065*U;
    for(const [y,dir] of [[r.y,-1],[r.y+r.h,1]]){
      const seg=(yy: number)=>{ ctx.beginPath(); ctx.moveTo(r.x,yy); ctx.lineTo(cx-2.2*s,yy); ctx.moveTo(cx+2.2*s,yy); ctx.lineTo(r.x+r.w,yy); ctx.stroke(); };
      plateLine(ctx,U,ink,(e: number)=>seg(y+dir*e)); plateLine(ctx,U,ink,(e: number)=>seg(y+dir*(thin+e)),0.45);
      if(st.illusText.plate?.line!=='none'){ ctx.save(); ctx.fillStyle=paint(st.illusText.plate.color==='auto' ? ink : st.illusText.plate.color);
        ctx.beginPath(); ctx.moveTo(cx,y-s); ctx.lineTo(cx+1.5*s,y); ctx.lineTo(cx,y+s); ctx.lineTo(cx-1.5*s,y); ctx.closePath(); ctx.fill(); ctx.restore(); }
    }
  }
  /** Cachet : disque papier, double filet, filet intérieur, étoile au centre et deux points entre les textes */
  function drawSeal(ctx: Ctx, S: Opts, ink: string){
    const {cx,cy,R,d,ri}=S;
    ctx.save(); ctx.fillStyle=hexA(st.colors.paper)(0.9); ctx.beginPath(); ctx.arc(cx,cy,R,0,2*Math.PI); ctx.fill();
    ctx.strokeStyle=paint(ink); ctx.fillStyle=paint(ink);
    const ring=(r: number,w: number)=>{ ctx.lineWidth=w; ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.stroke(); };
    ring(R-0.012*d,0.016*d); ring(R-0.045*d,0.005*d); ring(ri,0.005*d);
    const s=ri*0.42, q=s*0.28; ctx.beginPath();
    for(let i=0;i<8;i++){ const a=-Math.PI/2+i*Math.PI/4, rr=i%2 ? q : s; ctx[i ? 'lineTo' : 'moveTo'](cx+rr*Math.cos(a),cy+rr*Math.sin(a)); }
    ctx.closePath(); ctx.fill();
    const rm=(ri+R-0.045*d)/2; for(const a of [0,Math.PI]){ ctx.beginPath(); ctx.arc(cx+rm*Math.cos(a),cy+rm*Math.sin(a),0.012*d,0,2*Math.PI); ctx.fill(); }
    ctx.restore();
  }
  /** Mise en page des deux blocs dans une zone W × H (coordonnées de la zone). env : map (cadre de la carte dans la zone, pour
   *  l'arc), halo (zone sur la carte : « Auto » remplace l'ombre par un contour couleur papier). Chaque bloc porte sa
   *  présentation (deco), son rectangle de prise (rect) et le rectangle de sa plaque (box). */
  function textLayout(ctx: Ctx, W: number, H: number, U: number, over: Opts | null, env: Opts={}): Opts {
    const T={...textStyle(),...posOf(),...(over||{})}, m=Math.min(0.06*U,0.1*Math.min(W,H)), vint=T.vint, maxW=W-2*m;
    let haloK=1;
    if(env.halo && st.illusText.shadow==='auto'){ T.shadow=''; if(!T.outline){ T.outline=st.colors.paper; haloK=2.5; } }
    const shadow=T.shadow ? {color:T.shadow, dx:T.off*0.0016*U, dy:T.off*0.0016*U} : null;
    const stroke=(w: number)=>T.outline ? {color:T.outline, w:Math.max(1,w*U*haloK)} : null;
    const title=textLine('title'), sub=textLine('subtitle');
    const k=Math.min(1,W/U), ts=(vint?0.2:0.11)*U*k*tScale('title'), ss=0.024*U*tScale('subtitle'), gap=0.03*U;   // zone étroite (côte à côte) : titre réduit
    const capT=ts*(vint?0.84:0.72), capS=ss*0.75;
    const dT=decoOf('title'), dF=decoOf('foot'), pg=st.illusText.plate?.gap||1, pad=(d: string)=>(PADS[d]||[0,0]).map((v: number)=>v*U*pg);
    // flat : sur une plaque, ni ombre ni contour
    const titleBlock=(mw: number,flat: boolean)=>{
      const tl: Opts[]=[], sh=flat ? null : shadow, sk=(w: number)=>flat ? null : stroke(w); let y=0;
      const it: Opts={title:title && {t:title,cap:capT,o:{size:ts,spacing:vint?0.03:0.12,upper:true,role:'title',key:'title',fk:vint?'bebas':undefined,maxW:mw,shadow:sh,stroke:sk(0.004)}},
        subtitle:sub && {t:sub,cap:capS,o:{size:ss,spacing:0.3,upper:true,key:'subtitle',maxW:mw,stroke:sk(0.0012),shadow:sh && {color:sh.color,dx:sh.dx*0.3,dy:sh.dy*0.3}}}};
      CMS.order.sort(['title','subtitle']).filter((k: string)=>it[k]).forEach((k: string,i: number)=>{ if(i) y+=gap; y+=it[k].cap; tl.push({t:it[k].t,at:y,o:it[k].o}); });   // ordre des lignes choisi
      return blockOf(ctx,tl,y);
    };
    const footBlock=(mw: number,flat: boolean)=>{
      const sk=flat ? null : stroke(0.001), tpl=T.ftpl||'classique';
      if(tpl!=='classique'){ const b=footTpl(ctx,U,mw,tpl,sk); if(b) return b; }
      const fl=[]; let yy=0;
      for(const r of footRows(U,mw)){ yy+=r.lead; fl.push({t:r.t,at:yy-r.o.size*0.45,o:{...r.o,maxW:mw,stroke:sk}}); }
      return blockOf(ctx,fl,yy);
    };
    /** Bloc à plat (texte seul, cartouche, bandeau, étiquette, capsule, filets) : marges intérieures, puis placement. Les lignes
     *  d'un gabarit du bas (x, al) et ses filets (rules) se placent depuis le bord gauche du contenu (cl). */
    const place=(b: Opts,spec: Opts,kind: string,d: string)=>{
      let [px,py]=pad(d); if(d==='capsule') px=Math.max(px,(b.h+2*py)*0.55);   // capsule : bouts arrondis
      const bb={...b,lines:b.lines.map((l: Opts)=>({...l,at:l.at+py})),rules:(b.rules||[]).map((r: Opts)=>({...r,y1:r.y1+py,y2:r.y2+py})),w:b.w+2*px,h:b.h+2*py};
      const P=placeBlock(bb,W,H,m,spec,kind), ax=P.align==='left' ? P.left+px : P.align==='right' ? P.left+bb.w-px : P.ax;
      return {...bb,...P,ax,cl:P.left+px,deco:d,box:d==='bandeau' ? {x:0,y:P.top,w:W,h:bb.h} : P.rect};   // bandeau : toute la largeur de la zone
    };
    const tspec=T.free ? {free:T.free} : {pos:T.pos};
    const vert=()=>{   // titre pivoté le long d'un bord : de bas en haut à gauche, de haut en bas à droite
      const b=titleBlock(H-2*m,false), P=placeBlock({w:b.h,h:b.w},W,H,m,tspec,'title'), cx=P.left+b.h/2, cy=P.top+b.w/2;
      return {...b,...P,deco:'vertical',box:P.rect,cx,cy,rot:cx>W/2 ? Math.PI/2 : -Math.PI/2};
    };
    const seal=()=>{   // cachet : titre en couronne en haut, sous-titre en bas
      const d=clamp(0.3*U*Math.sqrt(tScale('title')),0.16*U,Math.max(0.16*U,Math.min(W,H)-m)), P=placeBlock({w:d,h:d},W,H,m,tspec,'title');
      const cx=P.left+d/2, cy=P.top+d/2, R=d/2, tsz=0.13*d, rt=R-0.065*d-0.75*tsz, ri=rt-0.03*d;
      const ot={size:tsz,spacing:vint?0.06:0.16,upper:true,role:'title',key:'title',fk:vint?'bebas':undefined};
      const arcs=[arcLayout(ctx,title,cx,cy,rt,true,ot,Math.PI*0.8),
        arcLayout(ctx,sub,cx,cy,R-0.065*d,false,{size:0.075*d*tScale('subtitle'),spacing:0.25,upper:true,key:'subtitle'},Math.PI*0.6)];
      return {lines:[],w:d,h:d,...P,deco:'cachet',box:P.rect,arcs,seal:{cx,cy,R,d,ri}};
    };
    const arc=()=>{   // titre courbé autour de la carte (médaillon) : au-dessus, ou au-dessous d'un cercle
      const M=env.map, sh=arcShape();
      const cx=M.x+M.w/2, cy=sh==='arch' ? M.y+M.w/2 : M.y+M.h/2, R0=M.w/2+0.04*U, row=titleRC(T)[0];
      const top=sh==='arch' || row==='h' || (row==='m' && (env.below || M.y>H-M.y-M.h));   // below : dessous occupé (gabarit)
      let ats=(vint?0.11:0.075)*U*tScale('title'); const ass=0.022*U*tScale('subtitle');
      if(top){ const room=cy-R0-(sub ? ass*0.75+0.02*U : 0)-0.025*U; if(ats*0.84>room) ats=Math.max(ats*0.5,room/0.84); }   // au-dessus : tenir dans l'affiche
      const ot={size:ats,spacing:vint?0.05:0.14,upper:true,role:'title',key:'title',fk:vint?'bebas':undefined,shadow,stroke:stroke(0.004)};
      const os={size:ass,spacing:0.3,upper:true,key:'subtitle',stroke:stroke(0.0012),shadow:shadow && {color:shadow.color,dx:shadow.dx*0.3,dy:shadow.dy*0.3}};
      let a1, a2;
      if(top){ a2=arcLayout(ctx,sub,cx,cy,R0,true,os,Math.PI*0.8); a1=arcLayout(ctx,title,cx,cy,R0+(sub ? ass*0.75+0.02*U : 0),true,ot,Math.PI*0.85); }
      else { const r1=R0+ats*0.75;   // en bas, lettres resserrées vers le centre : plus d'interlettrage
        a1=arcLayout(ctx,title,cx,cy,r1,false,{...ot,spacing:ot.spacing+0.06},Math.PI*0.7); a2=arcLayout(ctx,sub,cx,cy,r1+(title ? 0.02*U : 0)+ass*0.75,false,os,Math.PI*0.6); }
      const rect=union([a1?.box,a2?.box]);
      return {lines:[],w:rect!.w,h:rect!.h,left:rect!.x,top:rect!.y,align:'center',ax:rect!.x+rect!.w/2,rect,box:rect,deco:'arc',arcs:[a1,a2],fixed:true};
    };
    let tOut=null;
    if(title || sub){
      if(dT==='arc' && env.map) tOut=arc();
      else if(dT==='cachet') tOut=seal();
      else if(dT==='vertical') tOut=vert();
      else { const d=dT==='arc' ? 'libre' : dT; tOut=place(titleBlock(maxW-2*pad(d)[0],!['libre','filets'].includes(d)),tspec,'title',d); }
    }
    const fb=footBlock(maxW-2*pad(dF)[0],!['libre','filets'].includes(dF));
    return {title:tOut, foot:fb.lines.length ? place(fb,footSpec(T),'foot',dF) : null};
  }
  /** Dessine un bloc mis en page par textLayout (coordonnées de sa zone), avec sa présentation ; col : couleur des lettres */
  function drawBlock(ctx: Ctx, b: Opts, U: number, col: string){
    const c=st.colors, d=b.deco||'libre', ink=plateInk(col), r=b.box;
    // fond des plaques à fond papier (cartouche, bandeau, étiquette) : couleur et opacité réglables ; encre lisible sur ce fond
    const PL=st.illusText.plate||{}, bg=PL.fill && PL.fill!=='auto' ? PL.fill : c.paper, fillC=hexA(bg)(PL.alpha??0.92), pink=plateInk(col,bg);
    if(d==='cartouche'){
      ctx.save(); ctx.fillStyle=fillC; ctx.fillRect(r.x,r.y,r.w,r.h); ctx.restore();
      const o=0.012*U; plateLine(ctx,U,pink,(e: number)=>ctx.strokeRect(r.x+o+e,r.y+o+e,r.w-2*(o+e),r.h-2*(o+e)));
    } else if(d==='bandeau'){
      ctx.save(); ctx.fillStyle=fillC; ctx.fillRect(r.x,r.y,r.w,r.h); ctx.restore();
      const o=0.006*U; plateLine(ctx,U,pink,(e: number)=>{ ctx.beginPath(); for(const y of [r.y+o+e,r.y+r.h-o-e]){ ctx.moveTo(r.x,y); ctx.lineTo(r.x+r.w,y); } ctx.stroke(); });
    } else if(d==='etiquette'){   // coins coupés ; le trait suit la forme
      const cc=Math.min(0.035*U,r.h*0.28), o=0.011*U;
      ctx.save(); ctx.fillStyle=fillC; chamfer(ctx,r.x,r.y,r.w,r.h,cc); ctx.fill(); ctx.restore();
      plateLine(ctx,U,pink,(e: number)=>{ const q=o+e; chamfer(ctx,r.x+q,r.y+q,r.w-2*q,r.h-2*q,Math.max(0,cc-q*0.6)); ctx.stroke(); });
    } else if(d==='capsule'){   // plaque pleine aux bouts arrondis, lettres couleur papier
      ctx.save(); ctx.fillStyle=paint(ink); pill(ctx,r.x,r.y,r.w,r.h); ctx.fill(); ctx.restore();
      const o=0.008*U; plateLine(ctx,U,c.paper,(e: number)=>{ const q=o+e; pill(ctx,r.x+q,r.y+q,r.w-2*q,r.h-2*q); ctx.stroke(); });
    } else if(d==='filets') drawRules(ctx,r,U,col);
    else if(d==='cachet') drawSeal(ctx,b.seal,ink);
    const tc=d==='capsule' ? c.paper : ['cartouche','bandeau','etiquette'].includes(d) ? pink : d==='cachet' ? ink : col;
    // filets d'un gabarit du bas (Souvenir, Carnet)
    if(b.rules?.length){ ctx.save(); ctx.strokeStyle=paint(tc); ctx.lineWidth=0.0016*U; ctx.beginPath();
      for(const q of b.rules){ ctx.moveTo(b.cl+q.x1,b.top+q.y1); ctx.lineTo(b.cl+q.x2,b.top+q.y2); } ctx.stroke(); ctx.restore(); }
    if(b.arcs){ for(const a of b.arcs) drawArc(ctx,a,tc); return; }
    if(d==='vertical'){
      ctx.save(); ctx.translate(b.cx,b.cy); ctx.rotate(b.rot);
      try{ for(const l of b.lines) drawLine(ctx,l.t,0,-b.h/2+l.at,{...l.o,align:'center',color:tc}); } finally{ ctx.restore(); }
      return;
    }
    for(const l of b.lines) drawLine(ctx,l.t,l.x!=null ? b.cl+l.x : b.ax,b.top+l.at,{...l.o,align:l.al||b.align,color:tc});
  }
  /** Dessine les blocs, chacun dans sa zone (specs : {title, foot} → {A : zone dans l'affiche, env}) ; renvoie leurs rectangles
   *  dans l'affiche, pour les zones de prise */
  function drawBlocks(ctx: Ctx, U: number, specs: Opts, col: string){
    const out: Opts={};
    for(const k of ['title','foot']){
      const S=specs[k]; if(!S) continue; const A=S.A;
      ctx.save(); ctx.translate(A.x,A.y);
      try{
        const b=textLayout(ctx,A.w,A.h,U,null,S.env)[k];
        if(b){ drawBlock(ctx,b,U,col); out[k]={rect:{...b.rect,x:b.rect.x+A.x,y:b.rect.y+A.y},area:A,kind:'area',fixed:!!b.fixed,env:S.env,onMap:!!S.onMap}; }
      } finally{ ctx.restore(); }
    }
    return out;
  }
  /** Cadre de la carte vu depuis une zone (coordonnées de la zone) */
  const mapIn=(M: Opts | null | undefined,A: Opts)=>M && {...M,x:M.x-A.x,y:M.y-A.y};
  /** Textes de l'Illustration : toute l'affiche (ou une zone) ; avoid : cadre de la carte à signaler */
  function drawTexts(ctx: Ctx, PW: number, PH: number, U: number, area?: Opts, avoid?: Opts | null){
    const A=area||{x:0,y:0,w:PW,h:PH};
    noteLayout(ctx,PW,PH,drawBlocks(ctx,U,{title:{A,env:{}},foot:{A,env:{}}},textStyle().color),avoid);
  }
  /** Carte + illustration : zone d'un bloc. Carte : rectangle inscrit dans la forme du médaillon, partie opaque du fondu. */
  function zoneArea(z: string, g: Geom, W: number, H: number){
    if(z==='poster') return {x:0,y:0,w:W,h:H};
    if(z==='map'){
      const r=g.map;
      if(g.mix==='med'){ const [l,t,rr,b]=r.shape==='heart' ? [0.2,0.2,0.2,0.32] : r.shape==='arch' ? [0.06,0.3,0.06,0.04] : [0.146,0.146,0.146,0.146];
        return {x:r.x+r.w*l,y:r.y+r.h*t,w:r.w*(1-l-rr),h:r.h*(1-t-b)}; }
      if(g.mix==='fondu'){ const y=r.y+r.h*FADE_STOP*0.6; return {x:r.x,y,w:r.w,h:r.y+r.h-y}; }
      return {x:r.x,y:r.y,w:r.w,h:r.h};
    }
    return g.mix==='med' ? {x:0,y:0,w:W,h:H} : g.textArea;
  }
  /** Mode Carte (#75) : blocs sortis du gabarit (une des 9 positions, ou glissés). Gabarit Lettres : le titre forme la carte. */
  function mapMoved(s=st): Record<string, boolean> {
    const P=s.illusText.map;
    return {title:s.layout!=='typo' && (!!P.free || P.pos!=='auto'), foot:!!P.ffree || P.fpos!=='auto'};
  }
  /** Mode Carte : blocs sortis du gabarit, dessinés sur toute l'affiche (au-dessus de la carte) avec la mise en page des modes
   *  illustrés et leur présentation (#86) ; g : géométrie de l'affiche (cadre de la carte, pour l'arc) */
  function drawMapTexts(ctx: Ctx, W: number, H: number, U: number, mv: Opts, g: Geom){
    const B: Opts={};
    if(mv.title || mv.foot){
      const P=posOf(), col=textStyle().color, A={x:0,y:0,w:W,h:H}, env={map:g?.map,below:!mv.foot};   // arc : sous la carte, le gabarit garde les lignes du bas
      const L=textLayout(ctx,W,H,U,{pos:P.pos==='auto' ? 'hc' : P.pos},env);
      for(const k of ['title','foot']) if(mv[k] && L[k]){ drawBlock(ctx,L[k],U,col); B[k]={rect:L[k].rect,area:A,kind:'area',fixed:!!L[k].fixed,env}; }
    }
    noteLayout(ctx,W,H,B);
  }
  /** Vignette : titre et bloc du bas empilés dans la bande sous la carte ; chacun se place à gauche, au centre ou à droite.
   *  only : blocs à y mettre (les autres sont posés sur la carte ou sur l'affiche, #86). Renvoie leurs rectangles. */
  function drawBand(ctx: Ctx, W: number, _H: number, U: number, g: Geom, ink: string, only=['title','foot']){
    const T={...textStyle(),...posOf()}, vint=T.vint, b=g.band!, m=g.m+0.02*U, maxW=W-2*m;
    const shadow=T.shadow && contrast(T.shadow,st.colors.paper)>=1.3 ? {color:T.shadow, dx:T.off*0.001*U, dy:T.off*0.001*U} : null;
    // Bloc du bas : mêmes lignes que les autres mises en page (dédicace sur deux lignes, noms, date · coordonnées, légende ; #77)
    const head: Opts={title:['title',textLine('title'),(vint?0.13:0.075)*U*tScale('title'),{spacing:vint?0.04:0.12,upper:true,role:'title',key:'title',fk:vint?'bebas':undefined,shadow},vint?0.84:0.72],
      subtitle:['title',textLine('subtitle'),0.021*U*tScale('subtitle'),{spacing:0.3,upper:true,key:'subtitle'},0.75]};
    const rows=[...CMS.order.sort(['title','subtitle']).map((k: string)=>head[k]),
      ...footRows(U,maxW,{dedication:0.03,names:0.022,info:0.015,legend:0.013}).map((r: Opts)=>['foot',r.t,r.o.size,r.o,0.75])].filter(x=>x[1] && only.includes(x[0]));
    if(!rows.length) return {};
    const gap=0.022*U; let total=rows.reduce((a,x)=>a+x[2]*x[4],0)+gap*(rows.length-1);
    const f=Math.min(1,b.h*0.82/total); total*=f;
    const colX=(x?: number)=>x!=null ? x : 0.5;   // centre horizontal en fraction de la bande
    const XS: Record<string, number>={g:0,c:0.5,d:1}, tx=T.free ? T.free.x : XS[T.pos[1]], fx=T.ffree ? T.ffree.x : T.fpos==='auto' ? tx : XS[T.fpos[1]];
    const L: Opts={}; let y=b.y+(b.h-total)/2;
    for(const [k,t,sz,o,cap] of rows){
      const s=sz*f, tt=Array.isArray(t) ? t.map(([x,po])=>[x,{...po,size:po.size*f}]) : t;
      const w=measureLine(ctx,tt,{...o,size:s,maxW}), x0=k==='title'?colX(tx):colX(fx), al=['left','center','right'][third(x0)];
      const left=clamp(m+x0*(W-2*m)-w/2,m,W-m-w), ax=al==='left'?left:al==='right'?left+w:left+w/2;
      const top=y; y+=s*cap; drawLine(ctx,tt,ax,y,{...o,size:s,align:al,color:ink,maxW});
      const r=L[k]||(L[k]={rect:{x:Infinity,y:Infinity,w:0,h:0},x2:-Infinity,y2:-Infinity});
      r.rect.x=Math.min(r.rect.x,left); r.rect.y=Math.min(r.rect.y,top); r.x2=Math.max(r.x2,left+w); r.y2=Math.max(r.y2,y);
      y+=gap*f;
    }
    const area={x:m,y:b.y,w:W-2*m,h:b.h}, out: Opts={};
    for(const [k,r] of Object.entries(L)){ r.rect.w=r.x2-r.rect.x; r.rect.h=r.y2-r.rect.y; out[k]={rect:r.rect,area,kind:'band'}; }
    return out;
  }
  // ---------- Zones de prise des textes (aperçu) : glisser, clavier ; chevauchements signalés ----------
  // dernière mise en page de l'aperçu, en fractions de l'affiche : {title, foot}, chacun {x, y, w, h, area, kind ('area' | 'band'),
  // fixed (arc : il suit la carte, il ne se glisse pas), env (contexte de textLayout)} ou null
  let hitInfo: Opts | null=null;
  function noteLayout(ctx: Ctx, PW: number, PH: number, B: Opts, avoid?: Opts | null){
    if(ctx.canvas!==$<HTMLCanvasElement>('cvOver')) return;   // seulement l'aperçu (ni l'export, ni les vignettes)
    const fr=(r: Opts)=>r && {x:r.x/PW, y:r.y/PH, w:r.w/PW, h:r.h/PH};
    hitInfo={};
    for(const k of ['title','foot']){ const b=B?.[k]; hitInfo[k]=b ? {...fr(b.rect),area:fr(b.area),kind:b.kind,fixed:!!b.fixed,env:b.env,onMap:!!b.onMap} : null; }
    // Chevauchements : bloc du bas sur le titre ; texte sur la carte (médaillon, fondu) quand il n'y est pas posé exprès
    const inter=(a?: Opts | null,b?: Opts | null)=>a && b && a.x<b.x+b.w && b.x<a.x+a.w && a.y<b.y+b.h && b.y<a.y+a.h;
    const map=avoid && fr(avoid), msgs=[];
    if(inter(hitInfo.title,hitInfo.foot)) msgs.push('les lignes du bas chevauchent le titre');
    if(!hitInfo.title?.onMap && !hitInfo.title?.fixed && inter(hitInfo.title,map)) msgs.push('le titre déborde sur la carte');
    if(!hitInfo.foot?.onMap && inter(hitInfo.foot,map)) msgs.push('les lignes du bas débordent sur la carte');
    const w=$('textWarn'); if(w){ const t=msgs.length ? '⚠ '+msgs.join(' ; ')+'.' : ''; if(w.textContent!==t) w.textContent=t; }
    placeHits();
  }

  /** Zones de prise au-dessus des deux blocs de texte (aperçu) : 44 px de haut au moins, marge pour le doigt */
  function placeHits(){
    const P=ui.posterCss;
    for(const k of ['title','foot']){
      const el=$(k==='title'?'hitTitle':'hitFoot'), r=hitInfo?.[k];
      el.hidden=!r; if(!r) continue;
      const pad=6, w=r.w*P.w+2*pad, h=Math.max(44,r.h*P.h+2*pad), cy=(r.y+r.h/2)*P.h;
      Object.assign(el.style,{left:(r.x*P.w-pad)+'px',top:(cy-h/2)+'px',width:w+'px',height:h+'px'});
      el.classList.toggle('fixed',r.fixed);
    }
    CMS.emit('hits:placed');   // le choix « Textes » du mode Cadrer n'existe que s'il y a un bloc à déplacer
  }
  const setFree=(k: string,p: Pt | null)=>{ if(k==='title') posOf().free=p; else posOf().ffree=p; scheduleOver(); };
  /** Centre actuel d'un bloc, en fraction de sa zone */
  function centerOf(k: string){ const r=hitInfo![k], A=r.area; return {x:(r.x+r.w/2-A.x)/A.w, y:(r.y+r.h/2-A.y)/A.h}; }
  /** Fin d'un déplacement : aimantation sur les positions prédéfinies (et « Auto » pour le bloc du bas) */
  function snapToPreset(k: string){
    const T=posOf(), c=k==='title' ? T.free : T.ffree, I=hitInfo?.[k]; if(!c || !I) return;
    if(I.kind==='band'){   // bande de la vignette : gauche, centre, droite
      const i=[0,0.5,1].findIndex(v=>Math.abs(c.x-v)<0.04); if(i<0) return;
      if(k==='title'){ T.pos=T.pos[0]+'gcd'[i]; T.free=null; } else { T.fpos=(T.fpos==='auto'?'b':T.fpos[0])+'gcd'[i]; T.ffree=null; }
      return;
    }
    const cv=$<HTMLCanvasElement>('cvOver'), ctx=cv.getContext('2d')!, A=I.area, W=A.w*cv.width, H=A.h*cv.height, U=Math.min(cv.width,cv.height);
    const cands=k==='title' ? C.POS.map((p: string)=>[p,{free:null,pos:p}]) : [...(st.mode==='map' ? [] : [['auto',{ffree:null,fpos:'auto'}]]),...C.POS.map((p: string)=>[p,{ffree:null,fpos:p}])];   // Carte : « Auto » = gabarit, pas une cible
    for(const [,over] of cands){
      const b=textLayout(ctx,W,H,U,over,I.env)[k]; if(!b) continue;
      if(Math.hypot((b.rect.x+b.rect.w/2)/W-c.x,(b.rect.y+b.rect.h/2)/H-c.y)<0.04){ Object.assign(T,over); return; }
    }
  }
  function initHits(){
    let tdrag: {k: string; id: number; x: number; y: number; c: {x: number; y: number}; moved: boolean} | null=null;
    for(const k of ['title','foot']){
      const el=$(k==='title'?'hitTitle':'hitFoot');
      el.addEventListener('pointerdown',e=>{
        if(e.button>0 || !hitInfo?.[k]) return;
        e.preventDefault(); e.stopPropagation(); el.focus({preventScroll:true});
        if(hitInfo[k].fixed){ toast('Titre en arc : il suit la forme de la carte. Placez-le au-dessus ou au-dessous avec la grille (onglet Textes).'); return; }
        el.setPointerCapture(e.pointerId);
        tdrag={k,id:e.pointerId,x:e.clientX,y:e.clientY,c:centerOf(k),moved:false}; el.classList.add('dragging');
      });
      el.addEventListener('pointermove',e=>{
        if(!tdrag || tdrag.id!==e.pointerId) return;
        const I=hitInfo![k], A=I.area, P=ui.posterCss;
        let x=tdrag!.c.x+(e.clientX-tdrag!.x)/(A.w*P.w), y=tdrag!.c.y+(e.clientY-tdrag!.y)/(A.h*P.h);
        if(Math.abs(x-0.5)<0.02) x=0.5; if(Math.abs(y-0.5)<0.02) y=0.5;   // aimantation sur les axes centraux
        if(I.kind==='band') y=0.5;   // vignette : déplacement horizontal dans la bande
        if(Math.hypot(e.clientX-tdrag!.x,e.clientY-tdrag!.y)>3) tdrag!.moved=true;
        if(tdrag!.moved) setFree(k,{x:clamp(x,0,1),y:clamp(y,0,1)});
      });
      const end=(e: PointerEvent)=>{ if(!tdrag || tdrag.id!==e.pointerId) return; const moved=tdrag.moved; tdrag=null; el.classList.remove('dragging');
        if(moved){ snapToPreset(k); syncText(); scheduleOver(); saveState(); } };
      el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
      // Clavier : flèches = 1 % de la zone (Maj : 5 %) ; Origine = retour à la grille ; Échap = sortie
      el.addEventListener('keydown',e=>{
        if(!hitInfo?.[k]) return;
        const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
        if(d && hitInfo[k].fixed) return;
        if(d){ const s=e.shiftKey?0.05:0.01, c=centerOf(k), T=posOf(), cur=(k==='title'?T.free:T.ffree)||c;
          setFree(k,{x:clamp(cur.x+d[0]*s,0,1),y:hitInfo[k].kind==='band'?0.5:clamp(cur.y+d[1]*s,0,1)}); syncText(); saveState(); }
        else if(e.key==='Home'){ if(k==='title') Object.assign(posOf(),{free:null},st.mode==='map'?{pos:'auto'}:{}); else Object.assign(posOf(),{ffree:null,fpos:'auto'}); syncText(); scheduleOver(); saveState(); }
        else if(e.key==='Escape') el.blur();
        else return;
        e.preventDefault();
      });
    }
  }

  /** Style des textes résolu pour le type d'affiche (#74) : les valeurs 'auto' prennent celle du mode.
   *  vint : titre Vintage ; color : lettres ; shadow, outline : '' = aucun ; off : décalage de l'ombre. */
  function textStyle(s=st): Opts {
    const T=s.illusText, map=s.mode==='map', c=s.colors;
    return {vint:T.style==='auto' ? !map : T.style==='vintage', color:T.color==='auto' ? c.text : T.color,
      shadow:T.shadow==='auto' ? (map ? '' : c.paper) : T.shadow, outline:T.outline, off:T.off};
  }
  /** Positions des blocs de texte, propres à chaque type d'affiche (#77) : Illustration (illusText), Carte + illustration
   *  (illusText.mix) ou Carte (illusText.map, 'auto' = dans le gabarit) */
  /** Positions et présentations des blocs du type d'affiche (champs variables selon le type : sac d'options) */
  const posOf=(s=st): Opts=>s.mode==='map' ? s.illusText.map : s.mode==='mix' ? s.illusText.mix : s.illusText;
  // ---------- Interface ----------
  const SW_TEXT=[['auto','Auto : couleur Texte du thème'],['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#B5654B','Terracotta'],['#F3EAD8','Crème'],['#FFFFFF','Blanc']];
  const SW_SHADOW=[['auto','Auto : aucune en Carte, couleur du papier sur une illustration'],['','Sans ombre'],['#F3EAD8','Crème'],['#D9CDB5','Sable'],['#C5A059','Or'],['#24365A','Bleu nuit'],['#2C2A29','Encre']];
  const SW_OUTLINE=[['','Sans contour'],['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#F3EAD8','Crème'],['#FFFFFF','Blanc'],['#C5A059','Or']];
  const POS_NAMES: Record<string, string>={h:'en haut',m:'au milieu',b:'en bas'}, COL_NAMES: Record<string, string>={g:'à gauche',c:'au centre',d:'à droite'};
  const POS_ARROWS=['↖','↑','↗','←','•','→','↙','↓','↘'];
  // Présentations des blocs (#86) : nom et description (bulle)
  const DECO_NAMES: Record<string, string>={libre:'Texte seul',cartouche:'Cartouche',bandeau:'Bandeau',etiquette:'Étiquette',capsule:'Capsule',filets:'Filets art déco',arc:'Arc',cachet:'Cachet',vertical:'Vertical'};
  const DECO_TIPS: Record<string, string>={libre:'Lettres seules, avec leur ombre et leur contour',cartouche:'Plaque couleur papier encadrée d\u2019un trait, façon carte ancienne',
    bandeau:'Bande couleur papier sur toute la largeur de la zone',etiquette:'Plaque couleur papier à coins coupés, façon étiquette de bagage',
    capsule:'Plaque pleine aux bouts arrondis, lettres couleur papier',filets:'Sans fond : filets au-dessus et au-dessous, losange au centre',
    arc:'Titre courbé autour de la carte ronde ou en arche',cachet:'Tampon rond : titre en couronne, étoile au centre',vertical:'Titre pivoté le long d\u2019un bord'};
  const DECO_HINTS: Record<string, string>={arc:'Le titre suit la forme de la carte : une position en haut de la grille le place au-dessus, en bas au-dessous.',
    cachet:'Le cachet se glisse sur l\u2019aperçu, comme un tampon ; le sous-titre court en bas de la couronne.',
    vertical:'Le titre longe le bord le plus proche : à gauche il se lit de bas en haut, à droite de haut en bas.'};
  // Trait des plaques et ordre des lignes (Textes, Plus de réglages)
  const SW_FILL=[['auto','Auto : couleur du papier'],['#F3EAD8','Crème'],['#D9CDB5','Sable'],['#FFFFFF','Blanc'],['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#B5654B','Terracotta'],['#C5A059','Or']];
  const SW_PLATE=[['auto','Auto : encre de la plaque (couleur papier sur la capsule, couleur des lettres pour les filets)'],['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#B5654B','Terracotta'],['#C5A059','Or'],['#F3EAD8','Crème'],['#FFFFFF','Blanc']];
  const LINE_NAMES: Record<string, string>={title:'Titre',subtitle:'Sous-titre',coords:'Coordonnées',dedication:'Dédicace',names:'Noms',date:'Date'};
  const MORE_KEY='cms3.textMoreOpen';
  let moreAuto=false;
  /** Un réglage de « Plus de réglages » diffère du défaut : polices hors duo, ombre, contour, tailles par ligne, coupure de la
   *  dédicace, format des coordonnées, trait des plaques, ordre des lignes (#88). La section s'ouvre alors d'office. */
  function moreActive(){
    const D=DEFAULT_STATE, T: Opts=st.illusText, J=JSON.stringify;
    const duo=DUOS.some(([,,ft,fx])=>fx===st.font && (st.fontTitle||st.font)===ft);
    return (!duo && (st.font!==D.font || st.fontTitle!==D.fontTitle)) || ['shadow','outline','off'].some(k=>T[k]!==(D.illusText as Opts)[k])
      || Object.keys(D.textScale).some(k=>st.textScale[k]!==D.textScale[k]) || st.dedWrap!==D.dedWrap || st.coordFormat!==D.coordFormat
      || J(T.plate)!==J(D.illusText.plate) || !!st.lineOrder;
  }
  /** Ordre des lignes : liste numérotée, boutons Monter et Descendre (le focus suit la ligne déplacée) */
  function syncOrder(focus?: {k: string; d: number}){
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
  function moveLine(k: string,d: number){
    const O=CMS.order.current(), i=O.indexOf(k), j=i+d; if(j<0 || j>=O.length) return;
    [O[i],O[j]]=[O[j],O[i]]; st.lineOrder=O; syncOrder({k,d}); changed();
  }
  function syncPlate(){
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
  function syncMoreOpen(){ const d=$<HTMLDetailsElement>('textMore'); if(moreActive() && !d.open){ moreAuto=true; d.open=true; } }
  // Gabarits du bloc du bas (#90)
  const TPL_NAMES: Record<string, string>={classique:'Classique',pile:'Empilé',ligne:'Ligne unique',souvenir:'Souvenir',carnet:'Carnet',colonnes:'Colonnes'};
  const TPL_TIPS: Record<string, string>={classique:'Lignes empilées : dédicace, noms, date · coordonnées',pile:'Une ligne par information, les unes sous les autres : dédicace, noms, date, coordonnées',ligne:'Tout sur une ligne : dédicace · noms · date · coordonnées',
    souvenir:'Dédicace | noms à gauche, date et coordonnées à droite',carnet:'Aligné à gauche : noms en grand, filet, dédicace, date · coordonnées',
    colonnes:'Date à gauche, dédicace et noms au centre, coordonnées à droite'};
  /** Mise en forme du bloc du bas. Comme une présentation, elle sort le bloc du gabarit (Carte) ou de la bande (Vignette). */
  function setTpl(v: string){
    const P=posOf(); P.ftpl=v;
    if(v!=='classique' && st.mode==='map' && !mapMoved().foot){ Object.assign(P,{fpos:'bc',ffree:null}); toast('Lignes du bas posées sur l\u2019affiche, hors du gabarit'); }
    if(v!=='classique' && st.mode==='mix' && st.mix.compo==='vig' && zoneOf('foot')==='illus'){ P.zone={...P.zone,foot:'map'}; P.ffree=null; toast('Lignes du bas posées sur la carte'); }
    syncText(); scheduleOver(); saveState();
  }
  /** Mises en page prêtes (#86) : elles ne font que remplir zone, position et présentation */
  const PRESETS: [string, (s: PosterState)=>boolean, (P: Opts)=>void][]=[
    ['Titre en cartouche sur la carte', (s: PosterState)=>s.mode==='mix' || (s.mode==='map' && s.layout!=='typo'),
      P=>Object.assign(P,{pos:'hc',free:null},{deco:{...P.deco,title:'cartouche'}},P.zone ? {zone:{...P.zone,title:'map'}} : {})],
    ['Bandeau à la jonction', (s: PosterState)=>s.mode==='mix' && ['hb','fondu'].includes(s.mix.compo),
      P=>Object.assign(P,{pos:'mc',free:{x:0.5,y:st.mix.compo==='fondu' ? 0.62 : st.mix.split==='two' ? 2/3 : 0.5},deco:{...P.deco,title:'bandeau'},zone:{...P.zone,title:'poster'}})],
    ['Titre en arc sur le médaillon', (s: PosterState)=>!!arcShape(s),
      P=>Object.assign(P,{pos:st.mode==='map' ? 'mc' : st.mix.pos==='haut' ? 'bc' : 'hc',free:null,deco:{...P.deco,title:'arc'}},P.zone ? {zone:{...P.zone,title:'illus'}} : {})],
    ['Cachet en coin', (s: PosterState)=>s.mode==='mix' || (s.mode==='map' && s.layout!=='typo'),
      P=>Object.assign(P,{pos:'hd',free:null,deco:{...P.deco,title:'cachet'}},P.zone ? {zone:{...P.zone,title:'map'}} : {})]];
  /** Présentation d'un bloc. Un bloc encore dans le gabarit (Carte) ou dans la bande de la vignette en sort pour la recevoir. */
  function setDeco(k: string,d: string){
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
  }
  /** Zone d'un bloc (Carte + illustration) : la position libre, relative à l'ancienne zone, est oubliée */
  function setZone(k: string,z: string){
    const P=st.illusText.mix; P.zone={...P.zone,[k]:z}; if(k==='title') P.free=null; else P.ffree=null;
    syncText(); scheduleOver(); saveState();
  }
  function syncDecos(){
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
        b.onclick=()=>{ apply(posOf()); syncText(); scheduleOver(); saveState(); toast(`Mise en page « ${name} » appliquée · « Annuler » pour revenir`); }; return b; }));
    box.hidden=!list.length;
  }
  const ready=()=>!!img && img.ref===refOf(st);
  /** Rafraîchit l'affiche après un changement de l'image ou de son cadrage */
  let rafU=0;
  function redraw(){ if(rafU) return; rafU=requestAnimationFrame(()=>{ rafU=0; drawUnder(); scheduleOver(); exportState(); placeHit(); }); }
  /** Vignette : zone de prise au-dessus de la carte, pour déplacer l'illustration sans déplacer la carte */
  function placeHit(){
    const hit=$('illusHit'), on=st.mode==='mix' && st.mix.compo==='vig' && ready() && ui.posterCss.w>0;
    hit.hidden=!on; if(!on) return;
    const r=geom(st,ui.posterCss.w,ui.posterCss.h).illus!;
    Object.assign(hit.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px',borderRadius:`${r.w/2}px ${r.w/2}px 0 0`});
  }
  /** Pistes lues dans la carte : données importées (moteur Fichier) ou tuiles du lieu (moteur GPU, carte hors écran) */
  async function scanPistes(){
    const btn=$('bScanPistes'), lab=btn.querySelector('span'), center=st.center;
    const done=(list: string[])=>{ found=list; syncPrompt();
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
  // ---------- Pistes Wikipédia (#46) : option désactivée par défaut, accord préalable, coordonnées du lieu seulement ----------
  const WIKI_KEY='cms3.wiki';
  let wikiOn=(()=>{ try{ return localStorage.getItem(WIKI_KEY)==='1'; }catch(e){ return false; } })(), wikiBusy=false;
  function setWiki(on: boolean){
    wikiOn=!!on; try{ on ? localStorage.setItem(WIKI_KEY,'1') : localStorage.removeItem(WIKI_KEY); }catch(e){}
    syncWiki();
  }
  function syncWiki(){
    $('wikiOn').checked=wikiOn; $('wikiBox').hidden=!wikiOn;
    const off=navigator.onLine===false, b=$('bWikiPistes');
    b.disabled=off || wikiBusy;
    if(!wikiBusy) $('wikiHint').textContent=off ? 'Hors ligne : la recherche Wikipédia reviendra avec le réseau ; les pistes de la carte restent disponibles.'
      : 'Articles de Wikipédia situés autour du lieu, classés par notoriété.';
  }
  /** Rayon de recherche (m) : demi-diagonale de la carte affichée, entre 1 et 10 km */
  function wikiRadius(){
    const r=ui.slotCss, b=viewBounds({center:st.marker,zoom:st.zoom},r?.w>0 ? r.h/r.w : ratio()), dx=(b.e-b.w)/2*111.32*Math.cos(st.marker.lat*Math.PI/180), dy=(b.n-b.s)/2*110.57;
    return Math.round(clamp(Math.hypot(dx,dy)*1000,1000,10000));
  }
  async function scanWiki(){
    if(!wikiOn || wikiBusy) return;
    if(navigator.onLine===false){ syncWiki(); toast('Hors ligne : recherche Wikipédia indisponible',true); return; }
    if(!needConsent(()=>scanWiki())) return;
    const lab=$('bWikiPistes').querySelector('span'), m=st.marker;
    wikiBusy=true; syncWiki(); lab!.textContent='Recherche dans Wikipédia…'; $('wikiHint').textContent='Recherche en cours (10 s au plus)…';
    try{
      const pages=await CMS.wiki.search({lat:m.lat, lon:m.lon, radius:wikiRadius()});
      const list=CMS.wiki.rankWiki(pages, m, {city:st.texts.title||''}), seen=new Set(list.map((x: string)=>x.toLowerCase()));
      found=[...list, ...found.filter(x=>!seen.has(x.toLowerCase()))].slice(0,12); syncPrompt();
      toast(list.length ? `${list.length} lieu${list.length>1?'x':''} remarquable${list.length>1?'s':''} trouvé${list.length>1?'s':''} dans Wikipédia : touchez-les pour les ajouter`
        : 'Aucun lieu remarquable dans Wikipédia autour du lieu : dézoomez la carte ou ajoutez vos pistes', !list.length);
    }catch(e){
      const er=e as CmsError | undefined;
      if(er?.code==='ABORTED') return;
      toast(er?.code==='TIMEOUT' ? 'Wikipédia ne répond pas : réessayez plus tard (les pistes de la carte restent disponibles)'
        : er?.code==='RATE_LIMITED' ? 'Wikipédia limite les requêtes : réessayez dans une minute'
        : 'Recherche Wikipédia impossible : '+(er?.message||e),true);
    }finally{ wikiBusy=false; lab!.textContent='Lieux remarquables (Wikipédia)'; syncWiki(); }
  }
  /** Fondu : la carte de l'aperçu s'efface vers le haut, comme à l'export */
  function applyFade(){
    const on=st.mode==='mix' && st.mix.compo==='fondu', m=on ? `linear-gradient(to bottom, transparent, #000 ${FADE_STOP*100}%)` : '';
    slot.style.webkitMaskImage=m; slot.style.maskImage=m;
  }
  /** Composition (mode Carte + illustration) */
  function syncCompo(){
    const M=st.mix; setSeg('compoSeg',M.compo); setSeg('mixShapeSeg',M.shape); setSeg('mixPosSeg',M.pos);
    $('medOpts').hidden=M.compo!=='med'; $('hbOpts').hidden=M.compo!=='hb'; setSeg('mixSplitSeg',M.split); applyFade();
    $('compoPrompt').textContent='« '+compoLine(st)+' »';
    updateLayoutUI();   // marge et contour selon la composition (onglet Style)
  }
  /** Copie réduite de l'illustration importée (palette d'après l'image, onglet Style), ou null */
  const previewImage=()=>ready() ? IMG().prev : null;
  // ---------- Calque cadré (#77) : carte ou illustration, mêmes boutons flottants et même mode Cadrer ----------
  let layerPref='map';
  /** Calque que cadrent les boutons flottants et le mode Cadrer : la carte (Carte), l'image (Illustration), au choix (Carte + illustration) */
  const layer=()=>st.mode==='illus' ? 'illus' : st.mode==='map' || !ready() ? 'map' : layerPref;
  function syncLayer(){
    const il=layer()==='illus', app=$('app');
    app.dataset.layer=layer(); app.classList.toggle('illusready',ready());
    const set=(id: string,x: string)=>{ const e=$(id); e.title=x; e.setAttribute('aria-label',x); };
    set('bZoomIn',il?'Agrandir l\u2019illustration':'Zoom avant'); set('bZoomOut',il?'Réduire l\u2019illustration':'Zoom arrière');
    set('bToMarker',il?'Recentrer l\u2019illustration':'Centrer sur le repère');
    CMS.emit('layer:synced');   // sélecteur « Que déplacer ? » et indication de la Modification (CMS.intent)
  }
  function setLayer(v: string,quiet?: boolean){
    const was=layer(); layerPref=v==='illus' ? 'illus' : 'map'; syncLayer();
    if(!quiet && layer()!==was) toast(layer()==='illus' ? 'Cadrage de l\u2019illustration : la carte reste en place' : 'Cadrage de la carte');
  }
  function zoomBy(d: number){
    if(!ready()) return; const I=st.illus; I.zoom=clamp(I.zoom+d,ZMIN,ZMAX); Object.assign(I,bound(I.ox,I.oy,I.zoom,false));
    badge(I.zoom); syncInputs(); syncImage(); redraw(); saveState();
  }
  // ---------- Illustration sur la page : déplacer, agrandir, réduire (#82) ----------
  // Zoom de 30 à 300 % de l'ajustement (« Remplir » ou « Image entière ») dans la zone de l'illustration, celle de la
  // composition : sous 100 %, l'image rapetisse et laisse voir le papier ; elle reste toujours découpée par sa zone.
  const ZMIN=30, ZMAX=300;
  /** Décalage borné : le centre de l'image reste dans sa zone, ou ses bords restent atteignables quand elle déborde.
   *  snap : aimantation au centre et aux bords de la zone */
  function bound(ox: number,oy: number,z: number,snap: boolean){
    const r=geom(st,ui.posterCss.w||1,ui.posterCss.h||1).illus; if(!img || !r || !r.w) return {ox,oy};
    const P=placement(r.w,r.h,img.w,img.h,{...st.illus,zoom:z,ox:0,oy:0});
    const ex=(P.w/r.w-1)/2, ey=(P.h/r.h-1)/2;   // décalage qui aligne un bord de l'image sur celui de la zone
    if(snap){ const s=(v: number,e: number)=>{ for(const t of [0,e,-e]) if(Math.abs(v-t)<0.02) return t; return v; }; ox=s(ox,ex); oy=s(oy,ey); }
    const lx=Math.max(0.5,Math.abs(ex)), ly=Math.max(0.5,Math.abs(ey));
    return {ox:clamp(ox,-lx,lx), oy:clamp(oy,-ly,ly)};
  }
  /** Taille affichée pendant le pincement, la molette ou les boutons + et − */
  let badgeT=0;
  function badge(z: number){ const b=$('zoomBadge'); b.textContent=Math.round(z)+' %'; b.hidden=false; clearTimeout(badgeT); badgeT=setTimeout(()=>{ b.hidden=true; },900); }
  function recenter(){ if(!ready()) return; Object.assign(st.illus,{ox:0,oy:0}); redraw(); saveState(); }
  function exportState(){
    syncLayer();
    const off=st.mode!=='map' && !ready();
    for(const id of ['bExport']){ const b=$(id); if(b){ b.disabled=off; b.title=off?'Importez d’abord votre illustration (onglet Illustration)':''; } }
    const own=/illustration/i.test($('stTxt').textContent);   // message posé par ce module (sinon : état de la carte, à laisser)
    if(st.mode==='mix' && ready()){ if(own) setStatus('Prêt'); return; }
    if(st.mode==='map'){ if(own) setStatus('Prêt'); return; }
    setStatus(ready() ? 'Prêt' : loading ? 'Chargement de l\u2019illustration…' : missing ? 'Illustration à réimporter' : 'Importez votre illustration pour exporter', ready() ? '' : loading ? 'busy' : 'wait');
  }
  function setMode(v: string){
    if(!C.MODES.includes(v) || st.mode===v) return;
    st.mode=v; if(v==='mix' && !ready()) step='compo';
    applyMode(); sync();
    if(v==='illus' && ui.tab==='lieu') showTab('illus');   // le parcours continue par le prompt
    layoutPreview(); refreshCards(); loadFonts().then(()=>scheduleOver());
    if(v!=='illus') updateEngineUI();
    saveState();
    toast(({illus:'Affiche illustrée : créez le prompt, puis importez votre image', mix:'Carte + illustration : choisissez la composition, puis créez le prompt', map:'Affiche cartographique'} as Record<string, string>)[v]!);
  }
  function applyMode(){
    const m=st.mode, ill=m==='illus';
    $('app').dataset.mode=m; setSeg('modeSeg',m);
    // Parcours selon le type : Carte = Lieu, Repère, Textes… ; Illustration = Lieu, Illustration, Textes… (sans repère : pas de carte) ;
    // mixte = tout. Le lieu reste modifiable en Illustration (#77) : il donne le titre, les coordonnées et les pistes du prompt.
    $('tb-lieu').hidden=false; $('tb-repere').hidden=ill; $('tb-illus').hidden=m==='map';
    if(ill && ui.tab==='repere') showTab('illus');
    if(m==='map' && ui.tab==='illus') showTab('lieu');
    if(m!=='mix' && step==='compo') step='prompt';
    exportState(); placeHit(); applyFade(); if(m==='map'){ hitInfo=null; } placeHits();
  }
  function setStep(v: string){
    step=v; setSeg('illusStepSeg',v);
    $('illusCompo').hidden=v!=='compo'; $('illusPrompt').hidden=v!=='prompt'; $('illusImage').hidden=v!=='image';
  }
  function swatches(id: string, list: string[][], field: string, custom?: boolean){
    const box=$(id); box.replaceChildren();
    for(const [hex,name] of list){
      const auto=hex==='auto', b=h('button',{type:'button',className:'sw'+(auto?' auto':hex?'':' none'),dataset:{v:hex},title:name,'aria-label':name},
        ...(auto ? [h('span',{},'Auto'),h('i',{'aria-hidden':'true'})] : []));
      if(hex && !auto) b.style.background=hex;
      b.onclick=()=>{ (st.illusText as Opts)[field]=hex; syncText(); scheduleOver(); saveState(); };
      box.append(b);
    }
    if(custom){
      const i=h('input',{type:'color','aria-label':'Autre couleur des lettres'}), l=h('label',{className:'sw custom',title:'Autre couleur'},i);
      i.oninput=()=>{ (st.illusText as Opts)[field]=i.value.toUpperCase(); syncText(); scheduleOver(); saveState(); };
      box.append(l);
    }
  }
  /** Position d'un bloc ('title' | 'foot') : une des 9 positions, ou 'auto' (bas : à l'opposé du titre ; Carte : dans le gabarit) */
  function setPos(k: string,p: string){
    Object.assign(posOf(),k==='title' ? {pos:p,free:null} : {fpos:p,ffree:null});
    syncText(); scheduleOver(); saveState();
  }
  function syncText(){
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
  function syncPrompt(){
    const P=st.illus.prompt;
    setSeg('momentSeg',P.moment); setSeg('saisonSeg',P.saison); setSeg('paletteSeg',P.palette); setSeg('langSeg',P.lang);
    const box=$('pisteChips'); box.replaceChildren();
    const ia=h('button',{type:'button',className:'chip'},'L’IA propose'); pressed(ia,!P.pistes.length);
    ia.onclick=()=>{ P.pistes=[]; syncPrompt(); saveState(); }; box.append(ia);
    for(const p of P.pistes){
      const b=h('button',{type:'button',className:'chip on','aria-label':`Retirer la piste « ${p} »`},p,h('span',{className:'x','aria-hidden':'true'},' ✕'));
      b.onclick=()=>{ P.pistes=P.pistes.filter(x=>x!==p); syncPrompt(); saveState(); }; box.append(b);
    }
    $('pisteIn').disabled=P.pistes.length>=C.PISTES_MAX;
    const sug=found.filter(x=>!P.pistes.includes(x)), sb=$('pisteSugg'); sb.hidden=!sug.length;
    sb.replaceChildren(...sug.map(x=>{ const b=h('button',{type:'button',className:'chip','aria-label':`Ajouter la piste « ${x} »`},'+ '+x);
      b.onclick=()=>{ if(P.pistes.length<C.PISTES_MAX && !P.pistes.includes(x)){ P.pistes.push(x); syncPrompt(); saveState(); } else toast(`${C.PISTES_MAX} pistes au plus`,true); }; return b; }));
    updatePrompt();
  }
  function updatePrompt(){
    const o=$('promptOut'), t=buildPrompt(st); if(o.value!==t) o.value=t;
    const T=posOf(), d=exportSpec();
    $('promptInfo').textContent=`Format demandé : ${d.name} ${st.orient==='landscape'?'paysage':'portrait'} · zone du titre : ${POS_NAMES[titleRC(T)[0]]}, ${COL_NAMES[titleRC(T)[1]]} (onglet Textes).`;
  }
  function syncImage(){
    const I=st.illus, has=ready(), want=I.img;
    const ms=$('illusMissing'); ms.hidden=!(missing && want);
    if(missing && want) ms.textContent=`Illustration introuvable dans ce navigateur : « ${want.name} » (${want.w} × ${want.h} px). Réimportez-la : elle a pu être effacée par le navigateur, ou l\u2019affiche vient d\u2019un lien ou d\u2019un fichier sans image.`;
    $('illusDrop').hidden=has; $('illusFile').hidden=!has; $('illusTools').hidden=!has;
    setSeg('illusFitSeg',I.fit); setSeg('illusVintageSeg',I.vintage);
    $('oIllusZoom').textContent=I.zoom+' %';
    for(const [k,o] of [['bright','oIllusBright'],['contrast','oIllusContrast'],['satur','oIllusSatur']]) $(o).textContent=((I as Opts)[k]>0?'+':'')+(I as Opts)[k];
    if(!has) return;
    const img=IMG(), th=$('illusThumb'); if(th.dataset.for!==img.name+img.w){ th.dataset.for=img.name+img.w; img.prev.toBlob(b=>{ if(!b || !img) return; if(img.url) URL.revokeObjectURL(img.url); img.url=URL.createObjectURL(b); th.src=img.url; },'image/jpeg',0.8); }
    $('illusName').textContent=img.name;
    $('illusInfo').textContent=`${img.w} × ${img.h} px · ${Math.max(1,Math.round(img.size/1024)).toLocaleString('fr-FR')} Ko`;
    const cur=st.format, q=quality(st,img.w,img.h), icon: Record<string, string>={ok:'✓',mid:'!',bad:'✕'};
    $('illusQuality').replaceChildren(...q.map(f=>h('li',{className:'q '+f.grade+(f.key===cur?' cur':'')},
      h('span',{className:'qi','aria-hidden':'true'},icon[f.grade]),h('b',{},f.name),
      h('span',{},`${GRADES[f.grade]} · ${f.dpi} ppp${st.illus.upscale?' (lissée ×2)':''}${f.key===cur?' · format choisi':''}`))));
    const pct=cropPct(st,img.w,img.h);
    $('illusRatio').textContent=(I.fit==='cover' ? (pct>1 ? `Recadrage automatique : ${pct} % de l'image hors de l'affiche.` : 'Proportions de l’image conformes à l’affiche.')
      : (pct>1 ? `Image entière : bandes de ${pct} % de la couleur du fond.` : 'Proportions de l’image conformes à l’affiche.'))+' Agrandir ne crée pas de détails : pour un grand format, demandez à l’IA sa plus haute résolution.';
  }
  function sync(){
    const want=refOf(st);
    // Image déjà cherchée en vain (restauration, « Annuler ») : signalée tout de suite, sans nouvelle tentative
    if(want && want!==(img?.ref||'') && !loading && tried===want && st.mode!=='map') missing=true;
    applyMode(); setStep(step); syncCompo(); syncPrompt(); syncImage(); syncText();
    if(want!==(img?.ref||'') && !loading && tried!==want) ensureImage();
  }

  function init(){
    document.querySelectorAll<HTMLElement>('.modes button').forEach(b=>b.onclick=()=>setMode(b.dataset.v!));
    document.querySelectorAll<HTMLElement>('#illusStepSeg button').forEach(b=>b.onclick=()=>setStep(b.dataset.v!));
    $('bToImage').onclick=()=>{ setStep('image'); CMS.panelScroll.to($('illusDrop'),'nearest'); };
    const P=()=>st.illus.prompt as Opts;
    for(const [id,list,f] of [['momentSeg',C.MOMENTS,'moment'],['saisonSeg',C.SAISONS,'saison']])
      for(const [k,n] of list){ const b=h('button',{type:'button',dataset:{v:k}},n); b.onclick=()=>{ P()[f]=k; syncPrompt(); saveState(); }; $(id).append(b); }
    for(const [id,f] of [['paletteSeg','palette'],['langSeg','lang']])
      document.querySelectorAll<HTMLElement>(`#${id} button`).forEach(b=>b.onclick=()=>{ P()[f]=b.dataset.v!; syncPrompt(); saveState(); });
    $('pisteForm').onsubmit=e=>{ e.preventDefault(); const v=$('pisteIn').value.replace(/\s+/g,' ').trim().slice(0,80);
      if(v && !P().pistes.includes(v) && P().pistes.length<C.PISTES_MAX){ P().pistes.push(v); syncPrompt(); saveState(); }
      $('pisteIn').value=''; };
    $('bCopyPrompt').onclick=async()=>{
      updatePrompt(); const t=$('promptOut').value;
      try{ await navigator.clipboard.writeText(t); toast('Prompt copié : collez-le dans ChatGPT ou Gemini'); }
      catch(e){ const o=$('promptOut'); o.focus(); o.select(); let ok=false; try{ ok=document.execCommand('copy'); }catch(_){}
        toast(ok ? 'Prompt copié : collez-le dans ChatGPT ou Gemini' : 'Copie refusée par le navigateur : le prompt est sélectionné, copiez-le (Ctrl + C)',!ok); }
    };
    // Import : fichier, glisser-déposer (zone et aperçu), collage
    for(const id of ['illusIn','illusIn2']) $(id).onchange=e=>{ const f=(e.target as HTMLInputElement).files![0]; if(f) importFile(f); (e.target as HTMLInputElement).value=''; };
    const dropOn=(el: HTMLElement)=>{
      el.addEventListener('dragover',e=>{ if(st.mode==='map') return; e.preventDefault(); $('illusDrop').classList.add('over'); });
      el.addEventListener('dragleave',()=>$('illusDrop').classList.remove('over'));
      el.addEventListener('drop',e=>{ if(st.mode==='map') return; e.preventDefault(); $('illusDrop').classList.remove('over');
        const f=e.dataTransfer?.files?.[0]; if(f){ if(ui.tab!=='illus') showTab('illus'); importFile(f); } });
    };
    dropOn($('illusDrop')); dropOn(stage);
    // Coller l'image (#57) : lecture du presse-papiers au toucher seulement (geste requis par iOS et Android), même chemin que le fichier
    const canRead=!!(window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.read==='function');
    $('bIllusPaste').hidden=!canRead;
    $('bIllusPaste').onclick=async()=>{
      const pick="choisissez l'image avec « Choisir un fichier »";
      let items;
      try{ items=await navigator.clipboard.read(); }
      catch(e){ toast((e as Error)?.name==='NotAllowedError' ? `Accès au presse-papiers refusé : ${pick}.` : `Presse-papiers illisible : ${pick}.`,true); return; }
      for(const it of items||[]){
        const t=(it.types||[]).find(x=>/^image\/(png|jpeg|webp)$/.test(x)) || (it.types||[]).find(x=>x.startsWith('image/'));
        if(!t) continue;
        let blob; try{ blob=await it.getType(t); }catch(e){ toast(`Image du presse-papiers illisible : ${pick}.`,true); return; }
        importFile(new File([blob],'image-collee.'+(t.split('/')[1]||'png').replace('jpeg','jpg'),{type:t})); return;
      }
      toast(`Aucune image dans le presse-papiers : dans votre IA, faites un appui long sur l'image puis « Copier », ou ${pick}.`,true);
    };
    document.addEventListener('paste',e=>{
      if(st.mode==='map' || (e.target as HTMLInputElement).matches?.('input[type=text],input[type=search],textarea')) return;
      const it=[...(e.clipboardData?.items||[])].find(i=>i.kind==='file' && i.type.startsWith('image/'));
      if(it){ e.preventDefault(); if(ui.tab!=='illus') showTab('illus'); importFile(it.getAsFile()); }
    });
    $('bIllusDel').onclick=removeImage;
    document.querySelectorAll<HTMLElement>('#illusFitSeg button').forEach(b=>b.onclick=()=>{ Object.assign(st.illus,{fit:b.dataset.v,ox:0,oy:0}); syncImage(); redraw(); saveState(); });
    document.querySelectorAll<HTMLElement>('#illusVintageSeg button').forEach(b=>b.onclick=()=>{ st.illus.vintage=b.dataset.v!; syncImage(); redraw(); saveState(); });
    $('bIllusCenter').onclick=()=>{ Object.assign(st.illus,{zoom:100,ox:0,oy:0}); syncInputs(); redraw(); saveState(); };
    // Champs liés (data-k) : curseurs et cases (ui.ts émet illus:input)
    CMS.on('illus:input',k=>{
      if(k.startsWith('illusText.')){ syncText(); scheduleOver(); saveState(); return; }   // dont l'épaisseur du trait des plaques
      syncImage(); redraw(); saveState();
    });
    CMS.on('state:synced',sync);
    CMS.on('colors:changed',syncText);   // thème : couleur que donne « Auto »
    CMS.on('layout:changed',()=>{ syncDecos(); syncOrder(); });   // gabarit, composition : présentations possibles (arc), zones (#86), ordre du gabarit
    CMS.on('state:saved',()=>syncOrder());   // lignes masquées ou affichées
    CMS.on('state:saved',()=>{ if(st.mode!=='map' && ui.tab==='illus' && step==='prompt') updatePrompt(); });
    // Modification, choix « Illustration » : un doigt déplace l'image, deux doigts l'agrandissent ou la réduisent autour
    // d'eux, double toucher la remet ajustée ; molette (ordinateur) autour du pointeur. En Lecture, rien ne bouge.
    type Pt2 = {x: number; y: number};
    const pts=new Map<number, Pt2>(); let g0: {c: Pt2; d: number; ox: number; oy: number; z: number} | null=null, moved=false, t0=0, lastTap=0, wheelT=0;
    const editing=()=>ready() && st.mode!=='map' && ui.framing && ui.intent==='illus';
    const local=(e: PointerEvent | WheelEvent)=>{ const R=poster.getBoundingClientRect(); return {x:e.clientX-R.left, y:e.clientY-R.top}; };
    const mid=(P: Pt2[])=>({x:P.reduce((a,p)=>a+p.x,0)/P.length, y:P.reduce((a,p)=>a+p.y,0)/P.length});
    const dist=(P: Pt2[])=>P.length>1 ? Math.hypot(P[0].x-P[1].x,P[0].y-P[1].y) : 0;
    /** Nouveau geste (ou doigt ajouté, retiré) : point de départ */
    function base(){ const P=[...pts.values()]; g0={c:mid(P), d:dist(P), ox:st.illus.ox, oy:st.illus.oy, z:st.illus.zoom}; }
    /** Zoom z autour du point c (affiche, px), le point du départ restant sous les doigts */
    function apply(c: Pt2,z: number,snap: boolean){
      const r=geom(st,ui.posterCss.w,ui.posterCss.h).illus!, g0_=g0!, k=z/g0_.z;
      const icx=r.x+r.w/2+g0_.ox*r.w, icy=r.y+r.h/2+g0_.oy*r.h;   // centre de l'image au départ
      const nx=c.x-(g0_.c.x-icx)*k, ny=c.y-(g0_.c.y-icy)*k;
      Object.assign(st.illus,{zoom:z},bound((nx-r.x-r.w/2)/r.w,(ny-r.y-r.h/2)/r.h,z,snap));
    }
    poster.addEventListener('pointerdown',e=>{
      if(!editing() || e.button>0 || (e.target as HTMLInputElement).closest('button')) return;
      // Carte + illustration : la vignette se prend par sa zone ; ailleurs, la carte (figée) ne compte pas
      if(st.mode==='mix' && (st.mix.compo==='vig' ? (e.target as HTMLInputElement).id!=='illusHit' : (e.target as HTMLInputElement).closest('#slot'))) return;
      e.preventDefault(); try{ poster.setPointerCapture(e.pointerId); }catch(_){} pts.set(e.pointerId,local(e));
      if(pts.size===1){ moved=false; t0=Date.now(); }
      base(); poster.classList.add('dragging');
    });
    poster.addEventListener('pointermove',e=>{
      if(!pts.has(e.pointerId)) return; pts.set(e.pointerId,local(e));
      const P=[...pts.values()], c=mid(P), G=g0!;
      const z=P.length>1 && G.d>0 ? clamp(Math.round(G.z*dist(P)/G.d),ZMIN,ZMAX) : G.z;
      if(Math.hypot(c.x-G.c.x,c.y-G.c.y)>3 || z!==G.z) moved=true;
      apply(c,z,P.length===1); if(P.length>1) badge(z); redraw();
    });
    const end=(e: PointerEvent)=>{
      if(!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if(pts.size){ base(); return; }
      poster.classList.remove('dragging');
      if(!moved && Date.now()-t0<300){   // double toucher : image ajustée, centrée
        if(Date.now()-lastTap<350){ Object.assign(st.illus,{zoom:100,ox:0,oy:0}); badge(100); redraw(); lastTap=0; }
        else lastTap=Date.now();
      }
      syncInputs(); syncImage(); saveState();
    };
    poster.addEventListener('pointerup',end); poster.addEventListener('pointercancel',end);
    poster.addEventListener('wheel',e=>{
      if(!editing()) return; e.preventDefault();
      const c=local(e); pts.clear(); g0={c, d:0, ox:st.illus.ox, oy:st.illus.oy, z:st.illus.zoom};
      const z=clamp(Math.round(st.illus.zoom*Math.exp(-e.deltaY*0.0015)),ZMIN,ZMAX); apply(c,z,false); badge(z); redraw();
      clearTimeout(wheelT); wheelT=setTimeout(()=>{ syncInputs(); syncImage(); saveState(); },300);
    },{passive:false});
    // Composition (Carte + illustration)
    // Côte à côte impose le paysage ; une autre composition rend l'orientation d'avant (#77)
    let coteFrom: string | null=null;
    const mixSet=(f: string,v: string)=>{ const was=st.mix.compo; (st.mix as Opts)[f]=v;
      if(f==='compo' && v==='cote' && st.orient!=='landscape'){ coteFrom=st.orient; setOrient('landscape'); toast('Côte à côte : affiche passée en paysage'); }
      else if(f==='compo' && was==='cote' && v!=='cote' && coteFrom && st.orient==='landscape'){ setOrient(coteFrom); toast('Affiche revenue en portrait'); }
      if(f==='compo' && v!=='cote') coteFrom=null;
      syncCompo(); syncImage(); ui.snap=null; layoutPreview(); placeHit(); saveState(); };
    document.querySelectorAll<HTMLElement>('#mixSplitSeg button').forEach(b=>b.onclick=()=>mixSet('split',b.dataset.v!));
    $('bScanPistes').onclick=scanPistes;
    // Wikipédia : cocher l'option vaut accord pour ce service, après l'accord général (needConsent) ; aucune requête avant le bouton
    $('wikiOn').onchange=e=>{ if(!(e.target as HTMLInputElement).checked){ CMS.wiki.cancel(); setWiki(false); return; }
      if(needConsent(()=>setWiki(true))) setWiki(true); else (e.target as HTMLInputElement).checked=false; };
    $('bWikiPistes').onclick=scanWiki;
    addEventListener('online',syncWiki); addEventListener('offline',syncWiki); syncWiki();
    document.querySelectorAll<HTMLElement>('#compoSeg button').forEach(b=>b.onclick=()=>mixSet('compo',b.dataset.v!));
    document.querySelectorAll<HTMLElement>('#mixShapeSeg button').forEach(b=>b.onclick=()=>mixSet('shape',b.dataset.v!));
    document.querySelectorAll<HTMLElement>('#mixPosSeg button').forEach(b=>b.onclick=()=>mixSet('pos',b.dataset.v!));
    $('bToPrompt').onclick=()=>setStep('prompt');
    new ResizeObserver(()=>placeHit()).observe(poster);
    // Style du titre
    swatches('swText',SW_TEXT,'color',true); swatches('swShadow',SW_SHADOW,'shadow'); swatches('swOutline',SW_OUTLINE,'outline');
    C.POS.forEach((p: string,i: number)=>{ const b=h('button',{type:'button',dataset:{v:p},'aria-label':`Titre ${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`,title:`${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`},POS_ARROWS[i]);
      b.onclick=()=>setPos('title',p); $('tPosSeg').append(b);
      const f=h('button',{type:'button',dataset:{v:p},'aria-label':`Lignes du bas ${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`,title:`${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`},POS_ARROWS[i]);
      f.onclick=()=>setPos('foot',p); $('fPosSeg').append(f); });
    $('fAutoBtn').onclick=()=>setPos('foot','auto'); $('tLayBtn').onclick=()=>setPos('title','auto');
    // Trait des plaques, ordre des lignes (Plus de réglages : mémorisé, ouvert d'office si un de ses réglages est actif)
    const setPlate=(f: string,v: unknown)=>{ st.illusText.plate={...st.illusText.plate,[f]:v}; syncPlate(); scheduleOver(); saveState(); };
    $('plateLineSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>setPlate('line',b.dataset.v));
    for(const [hex,name] of SW_PLATE){ const auto=hex==='auto', b=h('button',{type:'button',className:'sw'+(auto?' auto':''),dataset:{v:hex},title:name,'aria-label':name},...(auto ? [h('span',{},'Auto')] : []));
      if(!auto) b.style.background=hex; b.onclick=()=>setPlate('color',hex); $('swPlate').append(b); }
    { const i=h('input',{type:'color','aria-label':'Autre couleur du trait'}); i.oninput=()=>setPlate('color',i.value.toUpperCase()); $('swPlate').append(h('label',{className:'sw custom',title:'Autre couleur'},i)); }
    for(const [hex,name] of SW_FILL){ const auto=hex==='auto', b=h('button',{type:'button',className:'sw'+(auto?' auto':''),dataset:{v:hex},title:name,'aria-label':'Fond : '+name},...(auto ? [h('span',{},'Auto'),h('i',{'aria-hidden':'true'})] : []));
      if(!auto) b.style.background=hex; b.onclick=()=>setPlate('fill',hex); $('swPlateFill').append(b); }
    { const i=h('input',{type:'color','aria-label':'Autre couleur du fond'}); i.oninput=()=>setPlate('fill',i.value.toUpperCase()); $('swPlateFill').append(h('label',{className:'sw custom',title:'Autre couleur'},i)); }
    // depuis la carte d'un bloc : ouvrir les réglages du fond et du trait
    $('bPlateOpts').onclick=()=>{ $<HTMLDetailsElement>('textMore').open=true; CMS.panelScroll.to($('hPlate'),'start',true); };
    $('bOrderReset').onclick=()=>{ st.lineOrder=null; syncOrder(); changed(); toast('Lignes dans l\u2019ordre du gabarit · « Annuler » pour revenir'); };
    try{ if(localStorage.getItem(MORE_KEY)==='1') $<HTMLDetailsElement>('textMore').open=true; }catch(e){}
    $<HTMLDetailsElement>('textMore').addEventListener('input',syncMoreOpen); $<HTMLDetailsElement>('textMore').addEventListener('click',e=>{ if(!(e.target as HTMLInputElement).closest('summary')) setTimeout(syncMoreOpen); });
    $<HTMLDetailsElement>('textMore').addEventListener('toggle',()=>{ if(moreAuto){ moreAuto=false; return; } try{ $<HTMLDetailsElement>('textMore').open ? localStorage.setItem(MORE_KEY,'1') : localStorage.removeItem(MORE_KEY); }catch(e){} });
    // Présentation et zone des blocs (#86)
    for(const v of C.FOOT_TPLS){ const b=h('button',{type:'button',className:'chip',dataset:{v},title:TPL_TIPS[v]},TPL_NAMES[v]); b.onclick=()=>setTpl(v); $('fTplSeg').append(b); }
    for(const [k,seg,list] of [['title','tDecoSeg',C.DECOS],['foot','fDecoSeg',C.FOOT_DECOS]])
      for(const d of list){ const b=h('button',{type:'button',className:'chip',dataset:{v:d},title:DECO_TIPS[d]},DECO_NAMES[d]); b.onclick=()=>setDeco(k,d); $(seg).append(b); }
    for(const [k,seg] of [['title','tZoneSeg'],['foot','fZoneSeg']]) $(seg).querySelectorAll('button').forEach(b=>b.onclick=()=>setZone(k,b.dataset.v!));
    initHits();
    sync();
    if(st.mode==='illus' && ui.tab==='lieu') showTab('illus');   // reprise d'une affiche illustrée : son étape principale
    setTimeout(()=>gc().catch(()=>{}),2000);   // images orphelines (affiches supprimées, autre image importée)
  }
  return {init, draw, drawMix, textLayout, textStyle, posOf, mapMoved, drawMapTexts, decoOf, decoWhy, zoneOf, arcShape, plateInk, get hitInfo(){ return hitInfo; }, previewImage, compoLine, region, ratioText, osmPiste, omtPiste, rankPistes, scanPistes, get found(){ return found; }, ready, importFile, removeImage, setMode, ensureImage, gc, exportImages, importImages, attachImages, FILE, refOf,
    get missing(){ return missing; }, get loading(){ return !!loading; }, buildPrompt, quality, cropPct, placement, adjust, processPixels,
    layer, setLayer, zoomBy, recenter,
    get step(){ return step; }, get image(){ return img && {w:img.w, h:img.h, name:img.name}; }};
});
