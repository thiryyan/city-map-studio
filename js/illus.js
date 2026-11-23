/* City Map Studio — Modes illustrés : affiche de voyage façon vintage à partir d'une illustration importée.
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html.
 *
 * L'application ne génère pas l'image : elle rédige un prompt pour l'IA de l'utilisateur (ChatGPT, Gemini…), qui pose
 * ses questions puis livre une illustration sans texte ni marge ; l'image importée est cadrée, retouchée, et le titre
 * est posé par drawPoster (aperçu et export identiques). Aucune requête réseau : tout reste dans le navigateur.
 * L'image n'est pas dans l'état (st) : elle est tenue ici (image source ré-encodée, copie réduite pour l'aperçu).
 */
'use strict';
CMS.define('illus', () => {
  const C = CMS.illusConf;
  // ---------- Fonctions pures (testées sans navigateur : tests/unit/illus.test.mjs) ----------
  const GRADES = {ok:'Bonne', mid:'Juste', bad:'Insuffisante'};
  /** Résolution d'impression de l'image pour chaque format (ppp), selon le cadrage ; agrandissement ×2 : lissage crédité de 45 %.
   *  Seuils (bonne, juste) : 200 / 140 ppp ; 300 / 200 pour le 10 × 15 cm, petite photo regardée de près. */
  const SEUILS={'10x15':[300,200]};
  /** Part de l'affiche occupée par l'illustration (1 × 1, sauf la vignette du mode Carte + illustration) */
  function region(s){
    if(s.mode!=='mix' || s.mix.compo==='med' || s.mix.compo==='fondu') return {fw:1,fh:1};
    const d=posterDims(s), g=geom(s,d.W,d.H); return {fw:g.illus.w/d.W, fh:g.illus.h/d.H};
  }
  function quality(s, iw, ih){
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
  function cropPct(s, iw, ih){
    const d=posterDims(s), R=region(s), a=iw/ih, b=d.W*R.fw/(d.H*R.fh);
    return Math.round((1-Math.min(a,b)/Math.max(a,b))*100);
  }
  /** Rectangle de l'image dans une affiche W × H : remplir ou contenir, puis zoom et décalage (fractions de l'affiche) */
  function placement(W, H, iw, ih, I){
    const s0=I.fit==='contain' ? Math.min(W/iw,H/ih) : Math.max(W/iw,H/ih), s=s0*I.zoom/100, w=iw*s, h=ih*s;
    return {x:(W-w)/2+I.ox*W, y:(H-h)/2+I.oy*H, w, h};
  }
  /** Retouches point par point (identiques quelle que soit la résolution : aperçu et export concordent).
   *  Luminosité, contraste, saturation ; filtre vintage (sépia, contraste) ; aplats (6 niveaux par couche). */
  function adjust(I){
    const v=I.vintage;
    return {b:1+I.bright/100, c:1+I.contrast/100+(v==='strong'?0.06:0), s:1+I.satur/100-(v==='strong'?0.15:0),
      sep:v==='light'?0.18:v==='strong'?0.42:0, flat:!!I.flat};
  }
  const neutral=a=>a.b===1 && a.c===1 && a.s===1 && !a.sep && !a.flat;
  function processPixels(d, a){
    const lut=new Uint8ClampedArray(256);
    for(let i=0;i<256;i++) lut[i]=(i*a.b-128)*a.c+128;
    const q=v=>Math.round(Math.min(255,Math.max(0,v))/51)*51;
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
  const POI_W={castle:10,palace:9,lighthouse:9,monument:7,fort:7,city_gate:6,attraction:7,ruins:6,viewpoint:5,museum:5,harbor:5,marina:5,townhall:4,zoo:3,theatre:3};
  const BIG_WORSHIP=/cath[ée]drale|basilique|abbaye|abbatiale|collégiale|cathedral|basilica|abbey|minster/i;
  /** Étiquettes OSM (moteur Fichier) → piste {name, w} pondérée, ou null */
  function osmPiste(t){
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
  function omtPiste(layer, p){
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
  const distKm=(a,b)=>Math.hypot((a.lon-b.lon)*111.32*Math.cos(b.lat*Math.PI/180),(a.lat-b.lat)*110.57);
  /** Meilleures pistes : poids, rang OpenMapTiles (importance), distance au centre ; un seul exemplaire par nom */
  function rankPistes(cands, max=6){
    const best=new Map();
    for(const c of cands){ if(!c || !c.name) continue;
      const sc=c.w*10-Math.min(c.rank??10,30)*0.3-Math.min(c.d||0,20)*1.5, k=c.name.toLowerCase();
      if(!best.has(k) || best.get(k).sc<sc) best.set(k,{name:c.name.slice(0,80),sc}); }
    return [...best.values()].sort((a,b)=>b.sc-a.sc).slice(0,max).map(x=>x.name);
  }
  const L10N={
    fr:{rule:"RÈGLE ABSOLUE, À RESPECTER JUSQU'À LA FIN : l'image finale ne contient AUCUN texte (ni titre, ni nom de ville, ni lettre, chiffre, signature, logo ou filigrane) et AUCUN cadre, marge ou bordure : l'illustration va jusqu'aux bords. Le titre sera ajouté ensuite par un autre logiciel ; tout texte dans l'image la rendrait inutilisable, même si les affiches vintage en ont habituellement un.",
      role:w=>`Tu es illustrateur spécialisé dans les affiches touristiques vintage. Nous allons créer ensemble une illustration de ${w}, destinée à être imprimée en affiche.`,
      city:'la ville choisie', pistes:'PISTES À PRIVILÉGIER (choisies par moi) : ',
      style:"STYLE : affiche de voyage vintage, illustration vectorielle en aplats, dégradés doux, palette limitée (6 à 10 teintes) ; plans successifs : premier plan détaillé, sujet principal au plan médian, arrière-plan estompé, ciel avec un grand soleil pâle, nuages stylisés, quelques oiseaux ; lumière douce, aucune texture photographique.",
      comp:'COMPOSITION : garder une zone de ciel ou de fond calme et peu détaillée ', compEnd:' pour le titre.',
      zone:{h:'EN HAUT (environ 25 % de la hauteur)', m:'AU MILIEU (bande horizontale d’environ 20 % de la hauteur)', b:'EN BAS (environ 25 % de la hauteur)'},
      side:{g:', plutôt à gauche', c:'', d:', plutôt à droite'},
      footAt:{h:' Garder aussi le haut de l\u2019image assez simple pour quelques lignes de texte discrètes.', m:' Garder aussi le milieu de l\u2019image assez simple pour quelques lignes de texte discrètes.', b:' Garder aussi le bas de l\u2019image assez simple pour quelques lignes de texte discrètes.'},
      foot:{h:' Garder aussi le bas de l\u2019image assez simple pour quelques lignes de texte discrètes.', m:' Garder aussi le bas de l’image assez simple pour quelques lignes de texte discrètes.', b:' Garder aussi le haut de l’image assez simple pour quelques lignes de texte discrètes.'},
      format:'FORMAT : ', res:', dans la plus haute résolution possible', big:' ; au moins 4000 px sur le grand côté si possible',
      ratio:{p:'portrait, proportions 1:1,414 (A4) ; si ce format n\u2019est pas disponible, 2:3', p57:'portrait, proportions 5:7 ; si ce format n\u2019est pas disponible, 2:3',
        p23:'portrait, proportions 2:3', l23:'paysage, proportions 3:2',
        l:'paysage, proportions 1,414:1 (A4 couché) ; si ce format n’est pas disponible, 3:2', l57:'paysage, proportions 7:5 ; si ce format n’est pas disponible, 3:2'},
      fixed:'IMPOSÉ : ', moment:'moment de la journée : ', saison:'saison : ',
      med:(pos,shape)=>`Laisser aussi une zone calme et peu détaillée ${{haut:'en haut',centre:'au centre',bas:'en bas'}[pos]} de l’image, au milieu de la largeur (${{circle:'un cercle',heart:'un cœur',arch:'une arche'}[shape]} d’environ 45 % de la largeur) : une carte y sera posée.`,
      vig:'COMPOSITION : l’illustration sera affichée en petite vignette en forme d’arche, posée sur une carte : un sujet unique, centré, lisible de loin, sans détails fins ni zone réservée au titre.',
      vratio:'portrait, proportions 3:4 ; si ce format n\u2019est pas disponible, 2:3',
      hb:f=>`COMPOSITION DE L\u2019AFFICHE : l\u2019illustration n\u2019occupera que ${f==='two'?'les deux tiers du haut':'la moitié haute'} de l\u2019affiche, une carte occupant le bas : composition en largeur, sans élément important coupé par le bas de l\u2019image.`,
      cote:'COMPOSITION DE L\u2019AFFICHE : l\u2019illustration occupera la moitié gauche d\u2019une affiche en paysage, une carte occupant la moitié droite : composition en hauteur.',
      fondu:'Le bas de l\u2019image (environ 40 %) se fondra dans une carte : n\u2019y placer que des éléments simples (eau, prairie, chemin), sans sujet important.',
      ratioOf:(o,lab,alt)=>`${o}, proportions ${lab}${alt?` ; si ce format n\u2019est pas disponible, ${alt}`:''}`, orient:{p:'portrait',l:'paysage',c:'carré',w:'panoramique'},
      theme:c=>`palette accordée à l'affiche : fond ${c.paper}, encre ${c.text}, eau ${c.water}, accent ${c.marker}`,
      photo:'je te fournirai une photo dont tu reprendras la palette',
      steps:'DÉROULEMENT (une étape à la fois) :',
      s1:(c,p)=>`1. Propose-moi 4 ou 5 thèmes caractéristiques de ${c}${p?' en partant des pistes ci-dessus':''}, une phrase chacun, et demande-moi d'en choisir un ou d'en combiner deux.`,
      s2:'2. Pose-moi en une seule fois tes questions : ',
      q:{moment:'moment de la journée', saison:'saison ou événement', palette:'palette (propose 3 palettes nommées)', more:'éléments à inclure ou à éviter', view:'point de vue'},
      s3:'3. Résume la scène finale et attends ma validation.',
      s4:'4. Génère l’image en rappelant dans ta consigne de génération : « no text, no letters, no title, no typography, no border, no frame, full bleed ». Si tu ne peux pas générer d’images, écris un prompt final en anglais contenant ces mêmes interdictions.',
      s5:'5. Vérifie toi-même l’image : si elle contient du texte ou une marge, régénère-la sans attendre que je le demande. Propose-moi ensuite 2 ou 3 ajustements.'},
    en:{rule:'ABSOLUTE RULE, TO BE KEPT UNTIL THE END: the final image contains NO text at all (no title, no city name, no letters, numbers, signature, logo or watermark) and NO frame, margin or border: the illustration is full bleed. The title will be added later in another program; any text in the image would make it unusable, even though vintage posters usually have one.',
      role:w=>`You are an illustrator specialised in vintage travel posters. Together we will create an illustration of ${w}, to be printed as a poster.`,
      city:'the chosen city', pistes:'IDEAS TO FAVOUR (my choice): ',
      style:'STYLE: vintage travel poster, flat vector illustration, soft gradients, limited palette (6 to 10 hues); layered planes: detailed foreground, main subject in the middle ground, faded background, sky with a large pale sun, stylised clouds, a few birds; soft light, no photographic texture.',
      comp:'COMPOSITION: keep a calm, low-detail sky or background area ', compEnd:' for the title.',
      zone:{h:'at the TOP (about 25% of the height)', m:'in the MIDDLE (a horizontal band of about 20% of the height)', b:'at the BOTTOM (about 25% of the height)'},
      side:{g:', towards the left', c:'', d:', towards the right'},
      footAt:{h:' Also keep the top of the image simple enough for a few discreet lines of text.', m:' Also keep the middle of the image simple enough for a few discreet lines of text.', b:' Also keep the bottom of the image simple enough for a few discreet lines of text.'},
      foot:{h:' Also keep the bottom of the image simple enough for a few discreet lines of text.', m:' Also keep the bottom of the image simple enough for a few discreet lines of text.', b:' Also keep the top of the image simple enough for a few discreet lines of text.'},
      format:'FORMAT: ', res:', in the highest resolution available', big:'; at least 4000 px on the long side if possible',
      ratio:{p:'portrait, aspect ratio 1:1.414 (A4); if unavailable, 2:3', p57:'portrait, aspect ratio 5:7; if unavailable, 2:3',
        p23:'portrait, aspect ratio 2:3', l23:'landscape, aspect ratio 3:2',
        l:'landscape, aspect ratio 1.414:1 (A4 landscape); if unavailable, 3:2', l57:'landscape, aspect ratio 7:5; if unavailable, 3:2'},
      fixed:'FIXED: ', moment:'time of day: ', saison:'season: ',
      med:(pos,shape)=>`Also keep a calm, low-detail area ${{haut:'at the top',centre:'in the centre',bas:'at the bottom'}[pos]} of the image, horizontally centred (${{circle:'a circle',heart:'a heart',arch:'an arch'}[shape]} about 45% of the width wide): a map will be placed there.`,
      vig:'COMPOSITION: the illustration will be shown as a small arch-shaped vignette over a map: one single, centred subject, readable from afar, no fine detail and no area reserved for a title.',
      vratio:'portrait, aspect ratio 3:4; if unavailable, 2:3',
      hb:f=>`POSTER LAYOUT: the illustration will fill only ${f==='two'?'the top two thirds':'the top half'} of the poster, with a map below it: use a wide composition, with nothing important cut by the bottom edge.`,
      cote:'POSTER LAYOUT: the illustration will fill the left half of a landscape poster, with a map on the right half: use a tall composition.',
      fondu:'The bottom of the image (about 40%) will fade into a map: put only simple elements there (water, meadow, path), no important subject.',
      ratioOf:(o,lab,alt)=>`${o}, aspect ratio ${lab}${alt?`; if unavailable, ${alt}`:''}`, orient:{p:'portrait',l:'landscape',c:'square',w:'panoramic'},
      theme:c=>`palette matching the poster: background ${c.paper}, ink ${c.text}, water ${c.water}, accent ${c.marker}`,
      photo:'I will give you a photo whose palette you will reuse',
      steps:'PROCESS (one step at a time):',
      s1:(c,p)=>`1. Suggest 4 or 5 themes typical of ${c}${p?', starting from the ideas above':''}, one sentence each, and ask me to pick one or combine two.`,
      s2:'2. Ask me all your questions at once: ',
      q:{moment:'time of day', saison:'season or event', palette:'palette (suggest 3 named palettes)', more:'elements to include or avoid', view:'point of view'},
      s3:'3. Summarise the final scene and wait for my approval.',
      s4:'4. Generate the image, repeating in your generation instruction: "no text, no letters, no title, no typography, no border, no frame, full bleed". If you cannot generate images, write a final English prompt containing the same restrictions.',
      s5:'5. Check the image yourself: if it contains any text or margin, regenerate it without waiting for me to ask. Then suggest 2 or 3 adjustments.'}
  };
  /** Lignes de texte affichées en pied (dédicace, noms, date, coordonnées) : le prompt leur réserve une zone calme */
  const footLines=s=>['dedication','names','date','coords'].some(k=>s.show[k]!==false && (k==='coords' || (s.texts[k]||'').trim()));
  /** Phrase du prompt propre à la composition (mode Carte + illustration), affichée dans l'étape Composition */
  function compoLine(s, lang='fr'){
    const L=L10N[lang], M=s.mix;
    return M.compo==='vig' ? L.vig : M.compo==='hb' ? L.hb(M.split) : M.compo==='cote' ? L.cote : M.compo==='fondu' ? L.fondu
      : L.med(M.pos,M.shape).replace(/^Laisser aussi/,'Laisser').replace(/^Also keep/,'Keep');
  }
  /** Proportions demandées pour une zone d'illustration de rapport r (largeur / hauteur) : la plus proche d'une liste
   *  usuelle, et en secours la plus proche de celles que proposent les générateurs (2:3, 3:4, 1:1, 4:3, 3:2, 16:9) */
  const RATIOS=[[1/1.4142,'1:1,414','1:1.414','p'],[2/3,'2:3','2:3','p'],[3/4,'3:4','3:4','p'],[1,'1:1','1:1','c'],[4/3,'4:3','4:3','l'],
    [1.4142,'1,414:1','1.414:1','l'],[3/2,'3:2','3:2','l'],[16/9,'16:9','16:9','l'],[2.5,'5:2','5:2','w'],[3,'3:1','3:1','w']];
  const GEN=['2:3','3:4','1:1','4:3','3:2','16:9'];
  function ratioText(r, L, en){
    const near=list=>list.reduce((a,b)=>Math.abs(Math.log(b[0]/r))<Math.abs(Math.log(a[0]/r))?b:a);
    const best=near(RATIOS), alt=near(RATIOS.filter(x=>GEN.includes(x[1])));
    return L.ratioOf(L.orient[best[3]], en?best[2]:best[1], alt===best ? '' : en?alt[2]:alt[1]);
  }
  /** Prompt complet pour l'IA externe, d'après l'état (ville, pistes, choix, format, position du titre) */
  function buildPrompt(s){
    const P=s.illus.prompt, L=L10N[P.lang]||L10N.fr, T=s.illusText;
    const city=(s.texts.title||'').trim()||L.city, area=(s.texts.subtitle||'').trim();
    const where=(s.texts.title||'').trim() ? city.toUpperCase()+(area?` (${area})`:'') : city;
    const out=[L.rule, L.role(where)];
    if(P.pistes.length) out.push(L.pistes+P.pistes.join(', ')+'.');
    out.push(L.style);
    const cp=s.mode==='mix' ? s.mix.compo : '', vig=cp==='vig';
    if(cp==='hb') out.push(L.hb(s.mix.split)); else if(cp==='cote') out.push(L.cote);
    if(vig) out.push(L.vig);
    const rc=titleRC(T), auto=T.fpos==='auto' && !T.ffree;   // positions réelles (glissées) des deux blocs
    if(!vig) out.push(L.comp+L.zone[rc[0]]+L.side[rc[1]]+L.compEnd+(footLines(s)?(auto ? L.foot[rc[0]] : L.footAt[footRC(T)[0]]):'')
      +(cp==='med'?' '+L.med(s.mix.pos,s.mix.shape):'')+(cp==='fondu'?' '+L.fondu:''));
    const r57=s.format==='50x70', land=s.orient==='landscape';
    let fmt=vig ? L.vratio : L.ratio[(land?'l':'p')+(r57?'57':s.format==='10x15'?'23':'')];
    if(cp==='hb' || cp==='cote'){ const d=posterDims(s), R=region(s); fmt=ratioText(d.W*R.fw/(d.H*R.fh),L,P.lang==='en'); }
    out.push(L.format+fmt+L.res+(r57?L.big:'')+'.');
    const idx=P.lang==='en'?2:1, label=(list,k)=>(list.find(x=>x[0]===k)||list[0])[idx].toLowerCase();
    const fixed=[];
    if(P.moment!=='any') fixed.push(L.moment+label(C.MOMENTS,P.moment));
    if(P.saison!=='any') fixed.push(L.saison+label(C.SAISONS,P.saison));
    if(P.palette==='theme') fixed.push(L.theme(s.colors));
    if(P.palette==='photo') fixed.push(L.photo);
    if(fixed.length) out.push(L.fixed+fixed.join(' ; ')+'.');
    const qs=[];
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
  let img=null;          // {full, prev, w, h, name, size, ref, url}
  let step='prompt', found=[];   // found : pistes trouvées dans la carte (proposées, non retenues)
  const cache={key:'', canvas:null};   // dernière image retouchée (aperçu ou export)
  let grainTex=null;
  const canvasOf=(w,h)=>{ const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w)); c.height=Math.max(1,Math.round(h)); return c; };
  /** Réduction de qualité : par moitiés successives (plus net qu'un seul passage) */
  function resample(src, w, h){
    let cur=src, cw=src.width, ch=src.height;
    while(cw/2>w*1.05 && ch/2>h*1.05){ const n=canvasOf(cw/2,ch/2), x=n.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(cur,0,0,n.width,n.height); cur=n; cw=n.width; ch=n.height; }
    const out=canvasOf(w,h), o=out.getContext('2d'); o.imageSmoothingQuality='high'; o.drawImage(cur,0,0,out.width,out.height); return out;
  }
  /** Agrandissement ×2 lissé, suivi d'un léger renforcement des contours (aucun détail inventé) ; borné par la mémoire */
  function upscale2(src){
    const f=Math.min(2, Math.sqrt(MAX_PX/(src.width*src.height)));
    if(f<=1.05) return src;
    const out=canvasOf(src.width*f,src.height*f), x=out.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(src,0,0,out.width,out.height);
    const id=x.getImageData(0,0,out.width,out.height), d=id.data, w=out.width, h=out.height, o=new Uint8ClampedArray(d);
    const k=0.35;   // renforcement doux : p + k·(p − moyenne des 4 voisins)
    for(let y=1;y<h-1;y++) for(let xx=1;xx<w-1;xx++){ const i=(y*w+xx)*4;
      for(let c=0;c<3;c++){ const p=o[i+c]; d[i+c]=p+k*(4*p-o[i+c-4]-o[i+c+4]-o[i+c-4*w]-o[i+c+4*w])/4; } }
    x.putImageData(id,0,0); return out;
  }
  /** Image retouchée pour un rendu de largeur W : copie réduite pour l'aperçu, pleine définition (×2 si demandé) pour l'export */
  function processed(W, H){
    const I=st.illus, r=placement(W,H,img.w,img.h,I), big=r.w>img.prev.width*1.15;
    const a=adjust(I), key=JSON.stringify([big, big && I.upscale, a, img.full.width]);
    if(cache.key===key) return cache.canvas;
    let src=big ? (I.upscale ? upscale2(img.full) : img.full) : img.prev;
    if(!neutral(a)){
      const c=canvasOf(src.width,src.height), x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(src,0,0);
      const id=x.getImageData(0,0,c.width,c.height); processPixels(id.data,a); x.putImageData(id,0,0); src=c;
    }
    if(cache.canvas && cache.canvas!==img.full && cache.canvas!==img.prev && cache.canvas!==src){ cache.canvas.width=cache.canvas.height=0; }
    cache.key=key; cache.canvas=src; return src;
  }
  /** Grain : bruit fixe (graine constante) d'une base de 1240 px agrandie, comme le papier : même grain à l'aperçu et à l'export */
  function grain(land){
    if(grainTex && grainTex.land===land) return grainTex.c;
    const w=land?1754:1240, h=land?1240:1754, c=canvasOf(w,h), x=c.getContext('2d'), id=x.createImageData(w,h), d=id.data;
    let seed=20231123; const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
    for(let i=0;i<d.length;i+=4){ const v=255-Math.round(rnd()*rnd()*150); d[i]=d[i+1]=d[i+2]=v; d[i+3]=255; }
    x.putImageData(id,0,0); grainTex={land,c}; return c;
  }
  // ---------- Conservation : IndexedDB (images binaires), l'état ne garde qu'une référence ----------
  // st.illus.img = {ref, name, w, h} : ref = empreinte SHA-256 du fichier importé (64 hexa). L'image ré-encodée (WebP,
  // PNG si le navigateur n'encode pas le WebP) est rangée sous cette clé. Les configurations restent dans localStorage.
  // Sans IndexedDB (navigation privée stricte, stockage bloqué) : l'image n'est gardée que pendant la visite.
  const DB_NAME='cityMapStudio', DB_STORE='images', REF_RE=/^[0-9a-f]{64}$/, DATA_RE=/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
  const memStore=new Map(); let dbP=null, dbWarned=false, persistAsked=false;
  function db(){
    if(dbP) return dbP;
    dbP=new Promise(res=>{
      try{
        const rq=indexedDB.open(DB_NAME,1);
        rq.onupgradeneeded=()=>rq.result.createObjectStore(DB_STORE);
        rq.onsuccess=()=>res(rq.result); rq.onerror=()=>res(null); rq.onblocked=()=>res(null);
      }catch(e){ res(null); }
    });
    return dbP;
  }
  async function idb(mode, fn){
    const d=await db(); if(!d) throw new Error('IndexedDB indisponible');
    return new Promise((res,rej)=>{ try{ const tx=d.transaction(DB_STORE,mode), rq=fn(tx.objectStore(DB_STORE));
      tx.oncomplete=()=>res(rq?.result); tx.onerror=tx.onabort=()=>rej(tx.error||new Error('IndexedDB')); }catch(e){ rej(e); } });
  }
  const store={
    async get(ref){ try{ const v=await idb('readonly',s=>s.get(ref)); return v ?? memStore.get(ref); }catch(e){ return memStore.get(ref); } },
    async put(ref,rec){
      memStore.set(ref,rec);
      try{ await idb('readwrite',s=>s.put(rec,ref)); memStore.delete(ref);
        if(!persistAsked){ persistAsked=true; navigator.storage?.persist?.().catch(()=>{}); }   // demande d'un stockage persistant
        return true; }
      catch(e){ if(!dbWarned){ dbWarned=true; toast('Stockage du navigateur indisponible : l’illustration ne sera gardée que pendant cette visite',true); } return false; }
    },
    async keys(){ let k=[]; try{ k=(await idb('readonly',s=>s.getAllKeys()))||[]; }catch(e){} return [...new Set([...k,...memStore.keys()])]; },
    async del(ref){ memStore.delete(ref); try{ await idb('readwrite',s=>s.delete(ref)); }catch(e){} }
  };
  /** Empreinte SHA-256 (hexadécimal) des octets d'un fichier */
  async function sha256(buf){
    const d=new Uint8Array(await crypto.subtle.digest('SHA-256',buf));
    return Array.from(d,x=>x.toString(16).padStart(2,'0')).join('');
  }
  const refOf=s=>s?.illus?.img?.ref||'';
  /** Supprime les images que plus rien n'utilise (affiche en cours, Mes affiches) ; lancé au démarrage et après une suppression */
  async function gc(){
    const used=new Set([refOf(st),...loadSaves().map(e=>refOf(e.state))].filter(Boolean));
    for(const k of await store.keys()) if(!used.has(k)) await store.del(k);
  }
  const blobToDataUrl=b=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsDataURL(b); });
  /** Images à intégrer dans un fichier : {ref: {data, name, w, h}} (celles qui manquent sont omises) */
  async function exportImages(refs){
    const out={};
    for(const ref of new Set(refs.filter(r=>REF_RE.test(r)))){ const rec=await store.get(ref); if(rec?.blob) out[ref]={data:await blobToDataUrl(rec.blob), name:rec.name, w:rec.w, h:rec.h}; }
    return out;
  }
  // Fichiers de configuration et sauvegardes avec illustrations intégrées (js/features.js) : version 2, limites propres
  const FILE=Object.freeze({version:2, cfgMax:60*1024*1024, bakMax:400*1024*1024});
  /** Ajoute à un fichier les illustrations de ses affiches (include : case « Inclure les illustrations ») ; renvoie {o, note} */
  async function attachImages(o, states, include){
    const refs=[...new Set(states.map(refOf).filter(Boolean))];
    if(!refs.length || !include) return {o, note:refs.length ? ' · sans les illustrations' : ''};
    const images=await exportImages(refs), n=Object.keys(images).length, missing=refs.length-n, pl=k=>k>1?'s':'';
    return {o:n ? {...o, version:FILE.version, images} : o,
      note:(n?` · ${n} illustration${pl(n)} incluse${pl(n)}`:'')+(missing?` · ${missing} illustration${pl(missing)} introuvable${pl(missing)} dans ce navigateur`:'')};
  }
  /** Images lues dans un fichier : chacune décodée puis ré-encodée ; une image déjà présente n'est jamais remplacée.
   *  Renvoie {added, bad} (images ajoutées, images refusées). */
  async function importImages(images){
    let added=0, bad=0;
    if(!images || typeof images!=='object' || Array.isArray(images)) return {added,bad};
    for(const [ref,o] of Object.entries(images).slice(0,50)){
      try{
        if(!REF_RE.test(ref) || !o || typeof o.data!=='string' || o.data.length>MAX_BYTES*1.4 || !DATA_RE.test(o.data)) throw new Error('entrée invalide');
        if((await store.get(ref))?.blob) continue;
        const bin=atob(o.data.slice(o.data.indexOf(',')+1)), u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
        const bmp=await createImageBitmap(new Blob([u8]));
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
  function toCanvas(bmp){
    const f=Math.min(1, Math.sqrt(MAX_PX/(bmp.width*bmp.height)));
    const full=canvasOf(bmp.width*f,bmp.height*f), x=full.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(bmp,0,0,full.width,full.height);
    return {full, reduced:f<1};
  }
  const encode=c=>new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('encodage impossible')),'image/webp',0.95));
  function setImage(full, meta){
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
  async function importFile(file){
    if(!file) return false;
    if(!(TYPES.test(file.type) || (!file.type && EXT.test(file.name||'')))){
      const ext=((file.name||'').match(/\.([\w]{1,6})$/)||[])[1];
      return fail(`Format non pris en charge${ext?` (.${ext.toLowerCase()})`:''}. Formats acceptés : PNG, JPEG ou WebP.`);
    }
    if(file.size>MAX_BYTES) return fail('Image trop lourde (40 Mo au plus).');
    let bmp, buf;
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
  function fail(msg){ const e=$('illusErr'); if(e) e.textContent=msg; if(msg) toast(msg,true); return !msg; }
  /** Retire l'illustration de l'affiche (l'image reste stockée jusqu'au prochain nettoyage : « Annuler » la retrouve) */
  function removeImage(){
    if(!img && !st.illus.img) return;
    freeImage(); st.illus.img=null; missing=false; sync(); redraw(); saveState(); toast('Illustration retirée');
  }

  // ---------- Rendu (appelé par drawPoster : aperçu et export) ----------
  function draw(ctx, W, H, pass, g){
    const I=st.illus, U=g.U;
    if(pass!=='over'){
      ctx.fillStyle=st.colors.paper; ctx.fillRect(0,0,W,H);
      if(ready()) drawImageIn(ctx,g.illus,W,H); else placeholder(ctx,W,H,U,st.illus.img);
    }
    if(pass!=='under') drawTexts(ctx,W,H,U);
  }
  const FADE_STOP=0.45;   // fondu : la carte est pleinement visible à partir de 45 % de sa hauteur
  /** Image retouchée dans un cadre r (et sa forme : arche de la vignette), avec papier jauni et grain */
  function drawImageIn(ctx, r, W, H){
    const I=st.illus, P=placement(r.w,r.h,img.w,img.h,I), x=r.x+P.x, y=r.y+P.y;
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
  function drawMix(ctx, W, H, pass, g, mapFn){
    const c=st.colors, U=g.U, T=st.illusText, med=g.mix==='med', r=g.map;
    if(pass!=='over'){
      ctx.fillStyle=c.paper; ctx.fillRect(0,0,W,H);
      if(g.mix!=='vig'){ if(ready()) drawImageIn(ctx,g.illus,W,H); else if(med || g.mix==='fondu') placeholder(ctx,W,H,U,st.illus.img); else placeholderIn(ctx,g.illus,U); }
    }
    if(pass==='all' && mapFn) g.places.forEach((p,i)=>{
      if(p.rect.fade){   // fondu : carte rendue à part, puis effacée vers le haut (même dégradé que le masque de l'aperçu)
        const R=p.rect, t=canvasOf(R.w,R.h), x=t.getContext('2d'), loc={x:0,y:0,w:t.width,h:t.height};
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
    if(med){
      ctx.save(); ctx.strokeStyle=c.paper; ctx.lineWidth=0.02*U; strokeShape(ctx,r,0.01*U);
      ctx.strokeStyle=paint(ink); ctx.lineWidth=0.0022*U; strokeShape(ctx,r,0.021*U); ctx.restore();
      drawTexts(ctx,W,H,U,null,r);
    } else if(g.mix!=='vig'){
      drawTexts(ctx,W,H,U,g.textArea);
    } else {
      ctx.strokeStyle=paint(c.frame);
      ctx.lineWidth=0.0025*U; const o1=0.014*U; ctx.strokeRect(r.x-o1,r.y-o1,r.w+2*o1,r.h+2*o1);
      ctx.lineWidth=0.0009*U; const o2=0.006*U; ctx.strokeRect(r.x-o2,r.y-o2,r.w+2*o2,r.h+2*o2);
      const v=g.illus, e=0.012*U, edge={...v,x:v.x-e,y:v.y-e,w:v.w+2*e,h:v.h+2*e};
      ctx.save(); ctx.shadowColor='rgba(0,0,0,0.22)'; ctx.shadowBlur=0.02*U; ctx.shadowOffsetY=0.006*U; clipMap(ctx,{...edge,x:edge.x-0.04*U,y:edge.y-0.04*U,w:edge.w+0.08*U,h:edge.h+0.08*U,shape:null});
      ctx.fillStyle=c.paper; const pth=new Path2D(); pth.addPath(new Path2D(shapeD('arch',edge.w,edge.h)),new DOMMatrix().translate(edge.x,edge.y)); ctx.fill(pth); ctx.restore();
      if(ready()) drawImageIn(ctx,v,W,H); else placeholderIn(ctx,v,U);
      drawBand(ctx,W,H,U,g,ink);
    }
    ctx.globalAlpha=0.55;
    drawText(ctx,attributionText(false),W-g.m,H-g.m*0.38,{size:0.0085*U,align:'right',color:g.mix==='vig' ? c.text : T.color,ink:'attribution'});
    ctx.globalAlpha=1;
  }
  function placeholderIn(ctx, r, U){
    const ink=st.colors.text; ctx.save(); clipMap(ctx,r); ctx.fillStyle=hexA(ink)(0.08); ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.fillStyle=hexA(ink)(0.7); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`600 ${0.026*U}px system-ui, sans-serif`;
    ctx.fillText(st.illus.img && !loading ? 'Illustration à importer' : 'Illustration',r.x+r.w/2,r.y+r.h*0.6,r.w*0.9); ctx.restore();
  }
  /** Vignette : titre et lignes dans la bande sous la carte, centrés, réduits ensemble pour y tenir */
  function placeholder(ctx, W, H, U, want){
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
  const third=v=>v<1/3 ? 0 : v>2/3 ? 2 : 1;
  const rowOf=y=>'hmb'[third(y)], colOf=x=>'gcd'[third(x)];
  /** Largeur dessinée d'une ligne (mêmes règles que drawText : capitales, interlettrage, réduction à maxW) */
  function measure(ctx, t, o){
    if(!t) return 0;
    const F=o.fk ? FONTS[o.fk] : fontOf(o.role,o.key); if(o.upper && !F.script) t=t.toUpperCase();
    ctx.save(); ctx.font=fontStr(o.size,o); const w=textW(ctx,t,F.script?0:(o.spacing||0),o.size); ctx.restore();
    return Math.min(w,o.maxW||Infinity);
  }
  /** Rangée d'une ligne : lignes [{t, o, at}] (at : ligne de base depuis le haut du bloc) → bloc {lines, w, h} */
  function blockOf(ctx, lines, h){ return {lines, w:Math.max(0,...lines.map(l=>measure(ctx,l.t,l.o))), h}; }
  /** Place un bloc : position prédéfinie (row, col) avec ses marges, ou centre libre {x, y} ; renvoie {left, top, align} */
  function placeBlock(b, W, H, m, spec, kind){
    let left, top, align;
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
  const titleRC=T=>T.free ? rowOf(T.free.y)+colOf(T.free.x) : T.pos;
  const footSpec=T=>T.ffree ? {free:T.ffree} : {pos:T.fpos==='auto' ? (titleRC(T)[0]==='b' ? 'hc' : 'bc') : T.fpos};
  const footRC=T=>T.ffree ? rowOf(T.ffree.y)+colOf(T.ffree.x) : footSpec(T).pos;
  /** Mise en page des deux blocs dans une zone W × H (coordonnées de la zone) */
  function textLayout(ctx, W, H, U, over){
    const T={...st.illusText,...(over||{})}, m=0.06*U, vint=T.style==='vintage', maxW=W-2*m;
    const shadow=T.shadow ? {color:T.shadow, dx:T.off*0.0016*U, dy:T.off*0.0016*U} : null;
    const stroke=w=>T.outline ? {color:T.outline, w:Math.max(1,w*U)} : null;
    const title=textLine('title'), sub=textLine('subtitle');
    const k=Math.min(1,W/U), ts=(vint?0.2:0.11)*U*k*tScale('title'), ss=0.024*U*tScale('subtitle'), gap=0.03*U;   // zone étroite (côte à côte) : titre réduit
    const capT=ts*(vint?0.84:0.72), capS=ss*0.75, tl=[];
    let y=0;
    if(title){ y+=capT; tl.push({t:title,at:y,o:{size:ts,spacing:vint?0.03:0.12,upper:true,role:'title',key:'title',fk:vint?'bebas':undefined,maxW,shadow,stroke:stroke(0.004)}}); y+=gap; }
    if(sub){ y+=capS; tl.push({t:sub,at:y,o:{size:ss,spacing:0.3,upper:true,key:'subtitle',maxW,stroke:stroke(0.0012),shadow:shadow && {color:shadow.color,dx:shadow.dx*0.3,dy:shadow.dy*0.3}}}); }
    const tb=blockOf(ctx,tl,(title?capT:0)+(title&&sub?gap:0)+(sub?capS:0));
    const lead=sz=>sz*1.55, fl=[]; let yy=0;
    for(const [k2,sz0,o] of [['dedication',0.034,{italic:true}],['names',0.026,{italic:true}],['info',0.017,{spacing:0.2}]]){
      const t=k2==='info' ? [textLine('date'),textLine('coords')].filter(Boolean).join('  ·  ') : textLine(k2); if(!t) continue;
      const sz=sz0*U*tScale(k2==='info'?'date':k2); yy+=lead(sz);
      fl.push({t,at:yy-sz*0.45,o:{...o,size:sz,key:k2==='info'?'date':k2,maxW,stroke:stroke(0.001)}});
    }
    const fb=blockOf(ctx,fl,yy);
    return {title:tl.length ? {...tb,...placeBlock(tb,W,H,m,T.free?{free:T.free}:{pos:T.pos},'title')} : null,
            foot:fl.length ? {...fb,...placeBlock(fb,W,H,m,footSpec(T),'foot')} : null};
  }
  /** Textes dans une zone (l'affiche, ou l'illustration en mode Carte + illustration) ; avoid : cadre de la carte à signaler */
  function drawTexts(ctx, PW, PH, U, area, avoid){
    const A=area||{x:0,y:0,w:PW,h:PH}, col=st.illusText.color;
    ctx.save(); ctx.translate(A.x,A.y);
    let L;
    try{
      L=textLayout(ctx,A.w,A.h,U);
      for(const b of [L.title,L.foot]) if(b) for(const l of b.lines) drawText(ctx,l.t,b.ax,b.top+l.at,{...l.o,align:b.align,color:col});
    } finally{ ctx.restore(); }
    noteLayout(ctx,PW,PH,'area',A,L,avoid);
  }
  /** Vignette : titre et bloc du bas empilés dans la bande sous la carte ; chacun se place à gauche, au centre ou à droite */
  function drawBand(ctx, W, H, U, g, ink){
    const T=st.illusText, vint=T.style==='vintage', b=g.band, m=g.m+0.02*U, maxW=W-2*m;
    const shadow=T.shadow && contrast(T.shadow,st.colors.paper)>=1.3 ? {color:T.shadow, dx:T.off*0.001*U, dy:T.off*0.001*U} : null;
    const rows=[['title',textLine('title'),(vint?0.13:0.075)*U*tScale('title'),{spacing:vint?0.04:0.12,upper:true,role:'title',key:'title',fk:vint?'bebas':undefined,shadow},vint?0.84:0.72],
      ['title',textLine('subtitle'),0.021*U*tScale('subtitle'),{spacing:0.3,upper:true,key:'subtitle'},0.75],
      ['foot',textLine('dedication'),0.03*U*tScale('dedication'),{italic:true,key:'dedication'},0.75],
      ['foot',[textLine('date'),textLine('coords')].filter(Boolean).join('  ·  '),0.015*U*tScale('date'),{spacing:0.2,key:'date'},0.75]].filter(x=>x[1]);
    if(!rows.length){ noteLayout(ctx,W,H,'band',b,{}); return; }
    const gap=0.022*U; let total=rows.reduce((a,x)=>a+x[2]*x[4],0)+gap*(rows.length-1);
    const f=Math.min(1,b.h*0.82/total); total*=f;
    const colX=x=>x!=null ? x : 0.5;   // centre horizontal en fraction de la bande
    const tx=T.free ? T.free.x : {g:0,c:0.5,d:1}[T.pos[1]], fx=T.ffree ? T.ffree.x : T.fpos==='auto' ? tx : {g:0,c:0.5,d:1}[T.fpos[1]];
    const L={}; let y=b.y+(b.h-total)/2;
    for(const [k,t,sz,o,cap] of rows){
      const s=sz*f, w=measure(ctx,t,{...o,size:s,maxW}), x0=k==='title'?colX(tx):colX(fx), al=['left','center','right'][third(x0)];
      const left=clamp(m+x0*(W-2*m)-w/2,m,W-m-w), ax=al==='left'?left:al==='right'?left+w:left+w/2;
      const top=y; y+=s*cap; drawText(ctx,t,ax,y,{...o,size:s,align:al,color:ink,maxW});
      const r=L[k]||(L[k]={rect:{x:Infinity,y:Infinity,w:0,h:0},x2:-Infinity,y2:-Infinity});
      r.rect.x=Math.min(r.rect.x,left); r.rect.y=Math.min(r.rect.y,top); r.x2=Math.max(r.x2,left+w); r.y2=Math.max(r.y2,y);
      y+=gap*f;
    }
    for(const r of Object.values(L)){ r.rect.w=r.x2-r.rect.x; r.rect.h=r.y2-r.rect.y; }
    noteLayout(ctx,W,H,'band',{x:m,y:b.y,w:W-2*m,h:b.h},L);
  }
  // ---------- Zones de prise des textes (aperçu) : glisser, clavier ; chevauchements signalés ----------
  let hitInfo=null;   // dernière mise en page de l'aperçu : {kind, area, title, foot} en fractions de l'affiche
  function noteLayout(ctx, PW, PH, kind, A, L, avoid){
    if(ctx.canvas!==$('cvOver')) return;   // seulement l'aperçu (ni l'export, ni les vignettes)
    const fr=r=>r && {x:(r.x)/PW, y:(r.y)/PH, w:r.w/PW, h:r.h/PH}, off=r=>r && (kind==='area' ? {...r,x:r.x+A.x,y:r.y+A.y} : r);
    hitInfo={kind, area:fr(A), title:fr(off(L?.title?.rect)), foot:fr(off(L?.foot?.rect))};
    // Chevauchements : bloc du bas sur le titre ; texte sur la carte (médaillon, fondu)
    const inter=(a,b)=>a && b && a.x<b.x+b.w && b.x<a.x+a.w && a.y<b.y+b.h && b.y<a.y+a.h;
    const map=avoid && fr(avoid), msgs=[];
    if(inter(hitInfo.title,hitInfo.foot)) msgs.push('les lignes du bas chevauchent le titre');
    if(inter(hitInfo.title,map)) msgs.push('le titre déborde sur la carte');
    if(inter(hitInfo.foot,map)) msgs.push('les lignes du bas débordent sur la carte');
    const w=$('textWarn'); if(w){ const t=msgs.length ? '⚠ '+msgs.join(' ; ')+'.' : ''; if(w.textContent!==t) w.textContent=t; }
    placeHits();
  }

  /** Zones de prise au-dessus des deux blocs de texte (aperçu) : 44 px de haut au moins, marge pour le doigt */
  function placeHits(){
    const P=ui.posterCss;
    for(const k of ['title','foot']){
      const el=$(k==='title'?'hitTitle':'hitFoot'), r=st.mode!=='map' && hitInfo?.[k];
      el.hidden=!r; if(!r) continue;
      const pad=6, w=r.w*P.w+2*pad, h=Math.max(44,r.h*P.h+2*pad), cy=(r.y+r.h/2)*P.h;
      Object.assign(el.style,{left:(r.x*P.w-pad)+'px',top:(cy-h/2)+'px',width:w+'px',height:h+'px'});
    }
  }
  const setFree=(k,p)=>{ if(k==='title') st.illusText.free=p; else st.illusText.ffree=p; scheduleOver(); };
  /** Centre actuel d'un bloc, en fraction de la zone des textes */
  function centerOf(k){ const r=hitInfo[k], A=hitInfo.area; return {x:(r.x+r.w/2-A.x)/A.w, y:(r.y+r.h/2-A.y)/A.h}; }
  /** Fin d'un déplacement : aimantation sur les positions prédéfinies (et « Auto » pour le bloc du bas) */
  function snapToPreset(k){
    const T=st.illusText, c=k==='title' ? T.free : T.ffree; if(!c) return;
    if(hitInfo.kind==='band'){   // bande de la vignette : gauche, centre, droite
      const i=[0,0.5,1].findIndex(v=>Math.abs(c.x-v)<0.04); if(i<0) return;
      if(k==='title'){ T.pos=T.pos[0]+'gcd'[i]; T.free=null; } else { T.fpos=(T.fpos==='auto'?'b':T.fpos[0])+'gcd'[i]; T.ffree=null; }
      return;
    }
    const cv=$('cvOver'), ctx=cv.getContext('2d'), A=hitInfo.area, W=A.w*cv.width, H=A.h*cv.height, U=Math.min(cv.width,cv.height);
    const cands=k==='title' ? C.POS.map(p=>[p,{free:null,pos:p}]) : [['auto',{ffree:null,fpos:'auto'}],...C.POS.map(p=>[p,{ffree:null,fpos:p}])];
    for(const [p,over] of cands){
      const b=textLayout(ctx,W,H,U,over)[k]; if(!b) continue;
      if(Math.hypot((b.rect.x+b.rect.w/2)/W-c.x,(b.rect.y+b.rect.h/2)/H-c.y)<0.04){ Object.assign(T,over); return; }
    }
  }
  function initHits(){
    let tdrag=null;
    for(const k of ['title','foot']){
      const el=$(k==='title'?'hitTitle':'hitFoot');
      el.addEventListener('pointerdown',e=>{
        if(e.button>0 || !hitInfo?.[k]) return;
        e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); el.focus({preventScroll:true});
        tdrag={k,id:e.pointerId,x:e.clientX,y:e.clientY,c:centerOf(k),moved:false}; el.classList.add('dragging');
      });
      el.addEventListener('pointermove',e=>{
        if(!tdrag || tdrag.id!==e.pointerId) return;
        const A=hitInfo.area, P=ui.posterCss;
        let x=tdrag.c.x+(e.clientX-tdrag.x)/(A.w*P.w), y=tdrag.c.y+(e.clientY-tdrag.y)/(A.h*P.h);
        if(Math.abs(x-0.5)<0.02) x=0.5; if(Math.abs(y-0.5)<0.02) y=0.5;   // aimantation sur les axes centraux
        if(hitInfo.kind==='band') y=0.5;   // vignette : déplacement horizontal dans la bande
        if(Math.hypot(e.clientX-tdrag.x,e.clientY-tdrag.y)>3) tdrag.moved=true;
        if(tdrag.moved) setFree(k,{x:clamp(x,0,1),y:clamp(y,0,1)});
      });
      const end=e=>{ if(!tdrag || tdrag.id!==e.pointerId) return; const moved=tdrag.moved; tdrag=null; el.classList.remove('dragging');
        if(moved){ snapToPreset(k); syncText(); scheduleOver(); saveState(); } };
      el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
      // Clavier : flèches = 1 % de la zone (Maj : 5 %) ; Origine = retour à la grille ; Échap = sortie
      el.addEventListener('keydown',e=>{
        if(!hitInfo?.[k]) return;
        const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
        if(d){ const s=e.shiftKey?0.05:0.01, c=centerOf(k), T=st.illusText, cur=(k==='title'?T.free:T.ffree)||c;
          setFree(k,{x:clamp(cur.x+d[0]*s,0,1),y:hitInfo.kind==='band'?0.5:clamp(cur.y+d[1]*s,0,1)}); syncText(); saveState(); }
        else if(e.key==='Home'){ if(k==='title') st.illusText.free=null; else Object.assign(st.illusText,{ffree:null,fpos:'auto'}); syncText(); scheduleOver(); saveState(); }
        else if(e.key==='Escape') el.blur();
        else return;
        e.preventDefault();
      });
    }
  }

  // ---------- Interface ----------
  const SW_TEXT=[['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#B5654B','Terracotta'],['#F3EAD8','Crème'],['#FFFFFF','Blanc']];
  const SW_SHADOW=[['','Sans ombre'],['#F3EAD8','Crème'],['#D9CDB5','Sable'],['#C5A059','Or'],['#24365A','Bleu nuit'],['#2C2A29','Encre']];
  const SW_OUTLINE=[['','Sans contour'],['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#F3EAD8','Crème'],['#FFFFFF','Blanc'],['#C5A059','Or']];
  const POS_NAMES={h:'en haut',m:'au milieu',b:'en bas'}, COL_NAMES={g:'à gauche',c:'au centre',d:'à droite'};
  const POS_ARROWS=['↖','↑','↗','←','•','→','↙','↓','↘'];
  const ready=()=>!!img && img.ref===refOf(st);
  /** Rafraîchit l'affiche après un changement de l'image ou de son cadrage */
  let rafU=0;
  function redraw(){ if(rafU) return; rafU=requestAnimationFrame(()=>{ rafU=0; drawUnder(); scheduleOver(); exportState(); placeHit(); }); }
  /** Vignette : zone de prise au-dessus de la carte, pour déplacer l'illustration sans déplacer la carte */
  function placeHit(){
    const hit=$('illusHit'), on=st.mode==='mix' && st.mix.compo==='vig' && ready() && ui.posterCss.w>0;
    hit.hidden=!on; if(!on) return;
    const r=geom(st,ui.posterCss.w,ui.posterCss.h).illus;
    Object.assign(hit.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px',borderRadius:`${r.w/2}px ${r.w/2}px 0 0`});
  }
  /** Pistes lues dans la carte : données importées (moteur Fichier) ou tuiles du lieu (moteur GPU, carte hors écran) */
  async function scanPistes(){
    const btn=$('bScanPistes'), lab=btn.querySelector('span'), center=st.center;
    const done=list=>{ found=list; syncPrompt();
      toast(list.length ? `${list.length} piste${list.length>1?'s':''} trouvée${list.length>1?'s':''} dans la carte : touchez-les pour les ajouter`
        : 'Aucune piste nommée autour du lieu : dézoomez la carte ou ajoutez vos pistes', !list.length); };
    if(st.engine==='file'){
      if(!osmData){ toast('Importez d\u2019abord un fichier de données (onglet Lieu, section Avancé)',true); return; }
      done(rankPistes((osmData.named||[]).map(x=>{ const c=osmPiste(x.t); return c && {...c, d:distKm(x,center)}; }))); return;
    }
    if(!needConsent(()=>scanPistes())) return;
    btn.disabled=true; lab.textContent='Lecture de la carte…';
    try{
      if(!CMS.maplibre.lib) await loadMaplibre();
      if(!CMS.maplibre.lib) throw new Error('librairie cartographique indisponible');
      const cands=await CMS.engines.mlQuery(st, map=>{
        const out=[];
        for(const L of OMT_LAYERS){ let fs=[]; try{ fs=map.querySourceFeatures('omt',{sourceLayer:L}); }catch(e){}
          for(const f of fs){ const c=omtPiste(L,f.properties||{}); if(!c) continue;
            const g=f.geometry; if(g?.type==='Point') c.d=distKm({lon:g.coordinates[0],lat:g.coordinates[1]},center); out.push(c); } }
        return out;
      });
      done(rankPistes(cands||[]));
    }catch(e){ toast('Lecture de la carte impossible : '+(e.message||e),true); }
    finally{ btn.disabled=false; lab.textContent='Trouver des pistes dans la carte'; }
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
  }
  /** Couleurs de la carte tirées de l'illustration (même calcul que la palette d'une photo) */
  function harmonize(v){
    if(!ready()){ toast('Importez d\u2019abord votre illustration (étape Image)',true); return; }
    const k=80/Math.max(img.prev.width,img.prev.height), c=canvasOf(img.prev.width*k,img.prev.height*k), x=c.getContext('2d',{willReadFrequently:true});
    x.drawImage(img.prev,0,0,c.width,c.height); const pal=paletteOf(x.getImageData(0,0,c.width,c.height).data);
    if(!pal.length){ toast('Aucune couleur exploitable dans cette illustration.',true); return; }
    const before={theme:st.theme,colors:{...st.colors}};
    st.colors=photoTheme(pal,v==='dark'); setSeg('harmSeg',v);
    noteThemeChange(before); refreshColors(); changed({all:true,cards:true});
    toast('Couleurs de la carte tirées de l\u2019illustration · « Annuler » pour revenir');
  }
  function exportState(){
    const off=st.mode!=='map' && !ready();
    for(const id of ['bExport']){ const b=$(id); if(b){ b.disabled=off; b.title=off?'Importez d’abord votre illustration (onglet Illustration)':''; } }
    const own=/illustration/i.test($('stTxt').textContent);   // message posé par ce module (sinon : état de la carte, à laisser)
    if(st.mode==='mix' && ready()){ if(own) setStatus('Prêt'); return; }
    if(st.mode==='map'){ if(own) setStatus('Prêt'); return; }
    setStatus(ready() ? 'Prêt' : loading ? 'Chargement de l\u2019illustration…' : missing ? 'Illustration à réimporter' : 'Importez votre illustration pour exporter', ready() ? '' : loading ? 'busy' : 'wait');
  }
  function setMode(v){
    if(!C.MODES.includes(v) || st.mode===v) return;
    st.mode=v; if(v==='mix' && !ready()) step='compo';
    applyMode(); sync();
    layoutPreview(); refreshCards(); loadFonts().then(()=>scheduleOver());
    if(v!=='illus') updateEngineUI();
    saveState();
    toast({illus:'Affiche illustrée : créez le prompt, puis importez votre image', mix:'Carte + illustration : choisissez la composition, puis créez le prompt', map:'Affiche cartographique'}[v]);
  }
  function applyMode(){
    const m=st.mode, ill=m==='illus';
    $('app').dataset.mode=m; setSeg('modeSeg',m); setSeg('modeSegM',m);
    $('tb-repere').hidden=ill; $('tb-illus').hidden=m==='map';
    if(ill && ui.tab==='repere') showTab('illus');
    if(m==='map' && ui.tab==='illus') showTab('lieu');
    if(m!=='mix' && step==='compo') step='prompt';
    exportState(); placeHit(); applyFade(); if(m==='map'){ hitInfo=null; } placeHits();
  }
  function setStep(v){
    step=v; setSeg('illusStepSeg',v);
    $('illusCompo').hidden=v!=='compo'; $('illusPrompt').hidden=v!=='prompt'; $('illusImage').hidden=v!=='image';
  }
  function swatches(id, list, field, custom){
    const box=$(id); box.replaceChildren();
    for(const [hex,name] of list){
      const b=h('button',{type:'button',className:'sw'+(hex?'':' none'),dataset:{v:hex},title:name,'aria-label':name});
      if(hex) b.style.background=hex;
      b.onclick=()=>{ st.illusText[field]=hex; syncText(); scheduleOver(); saveState(); };
      box.append(b);
    }
    if(custom){
      const i=h('input',{type:'color','aria-label':'Autre couleur des lettres'}), l=h('label',{className:'sw custom',title:'Autre couleur'},i);
      i.oninput=()=>{ st.illusText[field]=i.value.toUpperCase(); syncText(); scheduleOver(); saveState(); };
      box.append(l);
    }
  }
  function syncText(){
    const T=st.illusText;
    setSeg('tStyleSeg',T.style);
    for(const [id,f] of [['swText','color'],['swShadow','shadow'],['swOutline','outline']])
      $(id).querySelectorAll('button').forEach(b=>pressed(b,b.dataset.v===T[f]));
    const cu=$('swText').querySelector('input'); if(cu){ cu.value=T.color; cu.parentElement.classList.toggle('on',!SW_TEXT.some(([x])=>x===T.color)); }
    $('sShadowOff').closest('.slider').hidden=!T.shadow;   // décalage : seulement avec une ombre
    $('tPosSeg').querySelectorAll('button').forEach(b=>pressed(b,!T.free && b.dataset.v===T.pos));
    $('fPosSeg').querySelectorAll('button').forEach(b=>pressed(b,!T.ffree && b.dataset.v===T.fpos));
    pressed($('fAutoBtn'),!T.ffree && T.fpos==='auto');
    $('tFreeNote').firstChild.textContent=T.free ? 'Titre placé librement (glissé sur l\u2019aperçu) : touchez une position pour revenir à la grille. ' : '';
    $('fFreeNote').firstChild.textContent=T.ffree ? 'Lignes du bas placées librement : touchez « Auto » ou une position pour revenir à la grille. ' : '';
    $('oShadowOff').textContent=T.off;
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
    const T=st.illusText, d=exportSpec();
    $('promptInfo').textContent=`Format demandé : ${d.name} ${st.orient==='landscape'?'paysage':'portrait'} · zone du titre : ${POS_NAMES[titleRC(T)[0]]}, ${COL_NAMES[titleRC(T)[1]]} (onglet Textes).`;
  }
  function syncImage(){
    const I=st.illus, has=ready(), want=I.img;
    const ms=$('illusMissing'); ms.hidden=!(missing && want);
    if(missing && want) ms.textContent=`Illustration introuvable dans ce navigateur : « ${want.name} » (${want.w} × ${want.h} px). Réimportez-la : elle a pu être effacée par le navigateur, ou l\u2019affiche vient d\u2019un lien ou d\u2019un fichier sans image.`;
    $('illusDrop').hidden=has; $('illusFile').hidden=!has; $('illusTools').hidden=!has;
    setSeg('illusFitSeg',I.fit); setSeg('illusVintageSeg',I.vintage);
    $('oIllusZoom').textContent=I.zoom+' %';
    for(const [k,o] of [['bright','oIllusBright'],['contrast','oIllusContrast'],['satur','oIllusSatur']]) $(o).textContent=(I[k]>0?'+':'')+I[k];
    if(!has) return;
    const th=$('illusThumb'); if(th.dataset.for!==img.name+img.w){ th.dataset.for=img.name+img.w; img.prev.toBlob(b=>{ if(!b || !img) return; if(img.url) URL.revokeObjectURL(img.url); img.url=URL.createObjectURL(b); th.src=img.url; },'image/jpeg',0.8); }
    $('illusName').textContent=img.name;
    $('illusInfo').textContent=`${img.w} × ${img.h} px · ${Math.max(1,Math.round(img.size/1024)).toLocaleString('fr-FR')} Ko`;
    const cur=st.format, q=quality(st,img.w,img.h), icon={ok:'✓',mid:'!',bad:'✕'};
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
    document.querySelectorAll('.modes button').forEach(b=>b.onclick=()=>setMode(b.dataset.v));
    document.querySelectorAll('#illusStepSeg button').forEach(b=>b.onclick=()=>setStep(b.dataset.v));
    $('bToImage').onclick=()=>{ setStep('image'); CMS.panelScroll.to($('illusDrop'),'nearest'); };
    const P=()=>st.illus.prompt;
    for(const [id,list,f] of [['momentSeg',C.MOMENTS,'moment'],['saisonSeg',C.SAISONS,'saison']])
      for(const [k,n] of list){ const b=h('button',{type:'button',dataset:{v:k}},n); b.onclick=()=>{ P()[f]=k; syncPrompt(); saveState(); }; $(id).append(b); }
    for(const [id,f] of [['paletteSeg','palette'],['langSeg','lang']])
      document.querySelectorAll(`#${id} button`).forEach(b=>b.onclick=()=>{ P()[f]=b.dataset.v; syncPrompt(); saveState(); });
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
    for(const id of ['illusIn','illusIn2']) $(id).onchange=e=>{ const f=e.target.files[0]; if(f) importFile(f); e.target.value=''; };
    const dropOn=el=>{
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
      catch(e){ toast(e?.name==='NotAllowedError' ? `Accès au presse-papiers refusé : ${pick}.` : `Presse-papiers illisible : ${pick}.`,true); return; }
      for(const it of items||[]){
        const t=(it.types||[]).find(x=>/^image\/(png|jpeg|webp)$/.test(x)) || (it.types||[]).find(x=>x.startsWith('image/'));
        if(!t) continue;
        let blob; try{ blob=await it.getType(t); }catch(e){ toast(`Image du presse-papiers illisible : ${pick}.`,true); return; }
        importFile(new File([blob],'image-collee.'+(t.split('/')[1]||'png').replace('jpeg','jpg'),{type:t})); return;
      }
      toast(`Aucune image dans le presse-papiers : dans votre IA, faites un appui long sur l'image puis « Copier », ou ${pick}.`,true);
    };
    document.addEventListener('paste',e=>{
      if(st.mode==='map' || e.target.matches?.('input[type=text],input[type=search],textarea')) return;
      const it=[...(e.clipboardData?.items||[])].find(i=>i.kind==='file' && i.type.startsWith('image/'));
      if(it){ e.preventDefault(); if(ui.tab!=='illus') showTab('illus'); importFile(it.getAsFile()); }
    });
    $('bIllusDel').onclick=removeImage;
    document.querySelectorAll('#illusFitSeg button').forEach(b=>b.onclick=()=>{ Object.assign(st.illus,{fit:b.dataset.v,ox:0,oy:0}); syncImage(); redraw(); saveState(); });
    document.querySelectorAll('#illusVintageSeg button').forEach(b=>b.onclick=()=>{ st.illus.vintage=b.dataset.v; syncImage(); redraw(); saveState(); });
    $('bIllusCenter').onclick=()=>{ Object.assign(st.illus,{zoom:100,ox:0,oy:0}); syncInputs(); redraw(); saveState(); };
    // Champs liés (data-k) : curseurs et cases (ui.js émet illus:input)
    CMS.on('illus:input',k=>{
      if(k.startsWith('illusText.')){ syncText(); scheduleOver(); saveState(); return; }
      syncImage(); redraw(); saveState();
    });
    CMS.on('state:synced',sync);
    CMS.on('state:saved',()=>{ if(st.mode!=='map' && ui.tab==='illus' && step==='prompt') updatePrompt(); });
    // Déplacer l'image en la glissant sur l'aperçu
    let drag=null;
    poster.addEventListener('pointerdown',e=>{
      if(st.mode==='map' || !ready() || e.button>0 || e.target.closest('button')) return;
      // Carte + illustration : la carte garde ses gestes ; la vignette se déplace par sa zone de prise
      if(st.mode==='mix' && (st.mix.compo==='vig' ? e.target.id!=='illusHit' : e.target.closest('#slot'))) return;
      drag={x:e.clientX,y:e.clientY,ox:st.illus.ox,oy:st.illus.oy,id:e.pointerId}; poster.setPointerCapture(e.pointerId); poster.classList.add('dragging');
    });
    poster.addEventListener('pointermove',e=>{
      if(!drag || e.pointerId!==drag.id) return;
      const r=geom(st,ui.posterCss.w,ui.posterCss.h).illus;   // décalage en fraction du cadre de l'illustration
      st.illus.ox=clamp(drag.ox+(e.clientX-drag.x)/r.w,-1,1); st.illus.oy=clamp(drag.oy+(e.clientY-drag.y)/r.h,-1,1); redraw();
    });
    const end=e=>{ if(!drag || e.pointerId!==drag.id) return; drag=null; poster.classList.remove('dragging'); saveState(); };
    poster.addEventListener('pointerup',end); poster.addEventListener('pointercancel',end);
    // Composition (Carte + illustration)
    const mixSet=(f,v)=>{ st.mix[f]=v;
      if(f==='compo' && v==='cote' && st.orient!=='landscape'){ setOrient('landscape'); toast('Côte à côte : affiche passée en paysage'); }
      syncCompo(); syncImage(); ui.snap=null; layoutPreview(); placeHit(); saveState(); };
    document.querySelectorAll('#mixSplitSeg button').forEach(b=>b.onclick=()=>mixSet('split',b.dataset.v));
    $('bScanPistes').onclick=scanPistes;
    document.querySelectorAll('#compoSeg button').forEach(b=>b.onclick=()=>mixSet('compo',b.dataset.v));
    document.querySelectorAll('#mixShapeSeg button').forEach(b=>b.onclick=()=>mixSet('shape',b.dataset.v));
    document.querySelectorAll('#mixPosSeg button').forEach(b=>b.onclick=()=>mixSet('pos',b.dataset.v));
    document.querySelectorAll('#harmSeg button').forEach(b=>b.onclick=()=>harmonize(b.dataset.v));
    $('bToPrompt').onclick=()=>setStep('prompt');
    new ResizeObserver(()=>placeHit()).observe(poster);
    // Style du titre
    document.querySelectorAll('#tStyleSeg button').forEach(b=>b.onclick=async()=>{ st.illusText.style=b.dataset.v; syncText(); saveState(); await loadFonts(); scheduleOver(); });
    swatches('swText',SW_TEXT,'color',true); swatches('swShadow',SW_SHADOW,'shadow'); swatches('swOutline',SW_OUTLINE,'outline');
    C.POS.forEach((p,i)=>{ const b=h('button',{type:'button',dataset:{v:p},'aria-label':`Titre ${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`,title:`${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`},POS_ARROWS[i]);
      b.onclick=()=>{ Object.assign(st.illusText,{pos:p,free:null}); syncText(); scheduleOver(); saveState(); }; $('tPosSeg').append(b);
      const f=h('button',{type:'button',dataset:{v:p},'aria-label':`Lignes du bas ${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`,title:`${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`},POS_ARROWS[i]);
      f.onclick=()=>{ Object.assign(st.illusText,{fpos:p,ffree:null}); syncText(); scheduleOver(); saveState(); }; $('fPosSeg').append(f); });
    $('fAutoBtn').onclick=()=>{ Object.assign(st.illusText,{fpos:'auto',ffree:null}); syncText(); scheduleOver(); saveState(); };
    initHits();
    sync();
    setTimeout(()=>gc().catch(()=>{}),2000);   // images orphelines (affiches supprimées, autre image importée)
  }
  return {init, draw, drawMix, textLayout, get hitInfo(){ return hitInfo; }, harmonize, compoLine, region, ratioText, osmPiste, omtPiste, rankPistes, scanPistes, get found(){ return found; }, ready, importFile, removeImage, setMode, ensureImage, gc, exportImages, importImages, attachImages, FILE, refOf,
    get missing(){ return missing; }, get loading(){ return !!loading; }, buildPrompt, quality, cropPct, placement, adjust, processPixels,
    get step(){ return step; }, get image(){ return img && {w:img.w, h:img.h, name:img.name}; }};
});
