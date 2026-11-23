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
  /** Résolution d'impression de l'image pour chaque format (ppp), selon le cadrage ; agrandissement ×2 : lissage crédité de 45 % */
  function quality(s, iw, ih){
    const I=s.illus, land=s.orient==='landscape';
    return FORMATS.map(([key,name,a,b])=>{
      const Win=(land?b:a)/25.4, Hin=(land?a:b)/25.4;
      const base=I.fit==='contain' ? Math.max(iw/Win,ih/Hin) : Math.min(iw/Win,ih/Hin);
      const dpi=Math.round(base/(I.zoom/100)), eff=I.upscale ? dpi*1.45 : dpi;
      return {key, name, dpi, grade: eff>=200 ? 'ok' : eff>=140 ? 'mid' : 'bad'};
    });
  }
  /** Part de l'image hors de l'affiche (cadrage « Remplir ») ou des bandes laissées vides (« Image entière »), en % */
  function cropPct(s, iw, ih){
    const d=posterDims(s), a=iw/ih, b=d.W/d.H;
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
  const L10N={
    fr:{rule:"RÈGLE ABSOLUE, À RESPECTER JUSQU'À LA FIN : l'image finale ne contient AUCUN texte (ni titre, ni nom de ville, ni lettre, chiffre, signature, logo ou filigrane) et AUCUN cadre, marge ou bordure : l'illustration va jusqu'aux bords. Le titre sera ajouté ensuite par un autre logiciel ; tout texte dans l'image la rendrait inutilisable, même si les affiches vintage en ont habituellement un.",
      role:w=>`Tu es illustrateur spécialisé dans les affiches touristiques vintage. Nous allons créer ensemble une illustration de ${w}, destinée à être imprimée en affiche.`,
      city:'la ville choisie', pistes:'PISTES À PRIVILÉGIER (choisies par moi) : ',
      style:"STYLE : affiche de voyage vintage, illustration vectorielle en aplats, dégradés doux, palette limitée (6 à 10 teintes) ; plans successifs : premier plan détaillé, sujet principal au plan médian, arrière-plan estompé, ciel avec un grand soleil pâle, nuages stylisés, quelques oiseaux ; lumière douce, aucune texture photographique.",
      comp:'COMPOSITION : garder une zone de ciel ou de fond calme et peu détaillée ', compEnd:' pour le titre.',
      zone:{h:'EN HAUT (environ 25 % de la hauteur)', m:'AU MILIEU (bande horizontale d’environ 20 % de la hauteur)', b:'EN BAS (environ 25 % de la hauteur)'},
      side:{g:', plutôt à gauche', c:'', d:', plutôt à droite'},
      foot:{h:' Garder aussi le bas de l’image assez simple pour quelques lignes de texte discrètes.', m:' Garder aussi le bas de l’image assez simple pour quelques lignes de texte discrètes.', b:' Garder aussi le haut de l’image assez simple pour quelques lignes de texte discrètes.'},
      format:'FORMAT : ', res:', dans la plus haute résolution possible', big:' ; au moins 4000 px sur le grand côté si possible',
      ratio:{p:'portrait, proportions 1:1,414 (A4) ; si ce format n’est pas disponible, 2:3', p57:'portrait, proportions 5:7 ; si ce format n’est pas disponible, 2:3',
        l:'paysage, proportions 1,414:1 (A4 couché) ; si ce format n’est pas disponible, 3:2', l57:'paysage, proportions 7:5 ; si ce format n’est pas disponible, 3:2'},
      fixed:'IMPOSÉ : ', moment:'moment de la journée : ', saison:'saison : ',
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
      foot:{h:' Also keep the bottom of the image simple enough for a few discreet lines of text.', m:' Also keep the bottom of the image simple enough for a few discreet lines of text.', b:' Also keep the top of the image simple enough for a few discreet lines of text.'},
      format:'FORMAT: ', res:', in the highest resolution available', big:'; at least 4000 px on the long side if possible',
      ratio:{p:'portrait, aspect ratio 1:1.414 (A4); if unavailable, 2:3', p57:'portrait, aspect ratio 5:7; if unavailable, 2:3',
        l:'landscape, aspect ratio 1.414:1 (A4 landscape); if unavailable, 3:2', l57:'landscape, aspect ratio 7:5; if unavailable, 3:2'},
      fixed:'FIXED: ', moment:'time of day: ', saison:'season: ',
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
  /** Prompt complet pour l'IA externe, d'après l'état (ville, pistes, choix, format, position du titre) */
  function buildPrompt(s){
    const P=s.illus.prompt, L=L10N[P.lang]||L10N.fr, T=s.illusText;
    const city=(s.texts.title||'').trim()||L.city, region=(s.texts.subtitle||'').trim();
    const where=(s.texts.title||'').trim() ? city.toUpperCase()+(region?` (${region})`:'') : city;
    const out=[L.rule, L.role(where)];
    if(P.pistes.length) out.push(L.pistes+P.pistes.join(', ')+'.');
    out.push(L.style);
    out.push(L.comp+L.zone[T.pos[0]]+L.side[T.pos[1]]+L.compEnd+(footLines(s)?L.foot[T.pos[0]]:''));
    const r57=s.format==='50x70', land=s.orient==='landscape';
    out.push(L.format+L.ratio[(land?'l':'p')+(r57?'57':'')]+L.res+(r57?L.big:'')+'.');
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
  let img=null;          // {full, prev, w, h, name, size}
  let step='prompt';
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
  async function importFile(file){
    if(!file) return false;
    if(!(TYPES.test(file.type) || (!file.type && EXT.test(file.name||'')))){
      const ext=((file.name||'').match(/\.([\w]{1,6})$/)||[])[1];
      return fail(`Format non pris en charge${ext?` (.${ext.toLowerCase()})`:''}. Formats acceptés : PNG, JPEG ou WebP.`);
    }
    if(file.size>MAX_BYTES) return fail('Image trop lourde (40 Mo au plus).');
    let bmp;
    try{ bmp=await createImageBitmap(file); }catch(e){ return fail('Image illisible : le fichier est peut-être endommagé.'); }
    try{
      if(bmp.width<MIN_SIDE || bmp.height<MIN_SIDE) return fail(`Image trop petite (${MIN_SIDE} px de côté au moins).`);
      const f=Math.min(1, Math.sqrt(MAX_PX/(bmp.width*bmp.height)));
      // Ré-encodage : seuls les pixels sont gardés (métadonnées, coordonnées GPS comprises, écartées)
      const full=canvasOf(bmp.width*f,bmp.height*f), x=full.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(bmp,0,0,full.width,full.height);
      const p=Math.min(1,PREV_SIDE/Math.max(full.width,full.height)), prev=p<1 ? resample(full,full.width*p,full.height*p) : full;
      if(img){ img.full.width=img.full.height=0; if(img.prev!==img.full) img.prev.width=img.prev.height=0; }
      cache.key=''; cache.canvas=null;
      img={full, prev, w:full.width, h:full.height, name:(file.name||'image collée').slice(0,120), size:file.size, url:null};
      Object.assign(st.illus,{zoom:100,ox:0,oy:0});
      fail('');
      setStep('image'); sync(); redraw(); saveState();
      toast('Illustration importée'+(f<1?' (réduite pour tenir en mémoire)':''));
      return true;
    }finally{ bmp.close?.(); }
  }
  function fail(msg){ const e=$('illusErr'); if(e) e.textContent=msg; if(msg) toast(msg,true); return !msg; }
  function removeImage(){
    if(!img) return;
    img.full.width=img.full.height=0; if(img.prev!==img.full) img.prev.width=img.prev.height=0;
    if(img.url) URL.revokeObjectURL(img.url);
    img=null; cache.key=''; cache.canvas=null; sync(); redraw(); toast('Illustration retirée');
  }

  // ---------- Rendu (appelé par drawPoster : aperçu et export) ----------
  function draw(ctx, W, H, pass, g){
    const I=st.illus, U=g.U;
    if(pass!=='over'){
      ctx.fillStyle=st.colors.paper; ctx.fillRect(0,0,W,H);
      if(img){
        const r=placement(W,H,img.w,img.h,I);
        ctx.save(); ctx.beginPath(); ctx.rect(0,0,W,H); ctx.clip();
        ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
        ctx.drawImage(processed(W,H),r.x,r.y,r.w,r.h);
        ctx.beginPath(); ctx.rect(r.x,r.y,r.w,r.h); ctx.clip();
        ctx.globalCompositeOperation='multiply';
        if(I.paper){ ctx.globalAlpha=I.vintage==='strong'?0.42:0.28; ctx.fillStyle='#E7D6B0'; ctx.fillRect(r.x,r.y,r.w,r.h); }
        if(I.grain){ ctx.globalAlpha=I.vintage==='strong'?0.6:0.42; ctx.drawImage(grain(W>H),0,0,W,H); }
        ctx.restore();
      } else placeholder(ctx,W,H,U);
    }
    if(pass!=='under') drawTexts(ctx,W,H,U);
  }
  function placeholder(ctx, W, H, U){
    const m=0.06*U, ink=st.colors.text;
    ctx.save(); ctx.strokeStyle=hexA(ink)(0.35); ctx.lineWidth=Math.max(1,0.003*U); ctx.setLineDash([0.012*U,0.009*U]);
    ctx.strokeRect(m,H*0.3,W-2*m,H*0.62);
    ctx.fillStyle=hexA(ink)(0.7); ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=`600 ${0.034*U}px system-ui, sans-serif`; ctx.fillText('Votre illustration apparaîtra ici',W/2,H*0.58);
    ctx.font=`400 ${0.024*U}px system-ui, sans-serif`; ctx.fillText('Onglet Illustration : prompt, puis import de l’image',W/2,H*0.58+0.05*U);
    ctx.restore();
  }
  /** Titre et sous-titre à la position choisie ; dédicace, noms, date et coordonnées du côté opposé */
  function drawTexts(ctx, W, H, U){
    const T=st.illusText, m=0.06*U, vint=T.style==='vintage', col=T.color, row=T.pos[0], cpos=T.pos[1];
    const align=cpos==='g'?'left':cpos==='d'?'right':'center', x=cpos==='g'?m:cpos==='d'?W-m:W/2, maxW=W-2*m;
    const title=textLine('title'), sub=textLine('subtitle');
    const ts=(vint?0.2:0.11)*U*tScale('title'), ss=0.024*U*tScale('subtitle'), gap=0.03*U;
    const capT=ts*(vint?0.84:0.72), capS=ss*0.75;
    const blockH=(title?capT:0)+(title&&sub?gap:0)+(sub?capS:0);
    const top=row==='h' ? 0.065*H : row==='m' ? (H-blockH)/2 : H-0.075*H-blockH;
    const shadow=T.shadow ? {color:T.shadow, dx:T.off*0.0016*U, dy:T.off*0.0016*U} : null;
    const stroke=w=>T.outline ? {color:T.outline, w:Math.max(1,w*U)} : null;
    let y=top;
    if(title){ y+=capT; drawText(ctx,title,x,y,{size:ts,spacing:vint?0.03:0.12,upper:true,role:'title',key:'title',fk:vint?'bebas':undefined,align,color:col,maxW,shadow,stroke:stroke(0.004)}); y+=gap; }
    if(sub){ y+=capS; drawText(ctx,sub,x,y,{size:ss,spacing:0.3,upper:true,key:'subtitle',align,color:col,maxW,stroke:stroke(0.0012),
      shadow:shadow && {color:shadow.color,dx:shadow.dx*0.3,dy:shadow.dy*0.3}}); }
    // Pied (ou tête si le titre est en bas) : lignes plus discrètes, centrées
    const rows=[['dedication',0.034,{italic:true}],['names',0.026,{italic:true}],['info',0.017,{spacing:0.2}]]
      .map(([k,sz,o])=>[k==='info' ? [textLine('date'),textLine('coords')].filter(Boolean).join('  ·  ') : textLine(k), sz*U*tScale(k==='info'?'date':k), {...o,key:k==='info'?'date':k}])
      .filter(r=>r[0]);
    if(!rows.length) return;
    const lead=sz=>sz*1.55, total=rows.reduce((a,r)=>a+lead(r[1]),0);
    let yy=row==='b' ? 0.05*H : H-0.045*H-total;
    for(const [t,sz,o] of rows){ yy+=lead(sz); drawText(ctx,t,W/2,yy-sz*0.45,{...o,size:sz,align:'center',color:col,maxW,stroke:stroke(0.001)}); }
  }

  // ---------- Interface ----------
  const SW_TEXT=[['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#B5654B','Terracotta'],['#F3EAD8','Crème'],['#FFFFFF','Blanc']];
  const SW_SHADOW=[['','Sans ombre'],['#F3EAD8','Crème'],['#D9CDB5','Sable'],['#C5A059','Or'],['#24365A','Bleu nuit'],['#2C2A29','Encre']];
  const SW_OUTLINE=[['','Sans contour'],['#24365A','Bleu nuit'],['#2C2A29','Encre'],['#F3EAD8','Crème'],['#FFFFFF','Blanc'],['#C5A059','Or']];
  const POS_NAMES={h:'en haut',m:'au milieu',b:'en bas'}, COL_NAMES={g:'à gauche',c:'au centre',d:'à droite'};
  const POS_ARROWS=['↖','↑','↗','←','•','→','↙','↓','↘'];
  const ready=()=>!!img;
  /** Rafraîchit l'affiche après un changement de l'image ou de son cadrage */
  let rafU=0;
  function redraw(){ if(rafU) return; rafU=requestAnimationFrame(()=>{ rafU=0; drawUnder(); scheduleOver(); exportState(); }); }
  function exportState(){
    const off=st.mode==='illus' && !img;
    for(const id of ['bExport','bNextExport']){ const b=$(id); if(b){ b.disabled=off; b.title=off?'Importez d’abord votre illustration (onglet Illustration)':''; } }
    if(st.mode==='illus') setStatus(img ? 'Prêt' : 'Importez votre illustration pour exporter', img ? '' : 'wait');
  }
  function setMode(v){
    if(!C.MODES.includes(v) || st.mode===v) return;
    st.mode=v; applyMode();
    layoutPreview(); refreshCards(); loadFonts().then(()=>scheduleOver());
    if(v==='map') updateEngineUI();
    saveState();
    toast(v==='illus' ? 'Affiche illustrée : créez le prompt, puis importez votre image' : 'Affiche cartographique');
  }
  function applyMode(){
    const ill=st.mode==='illus';
    $('app').dataset.mode=st.mode; setSeg('modeSeg',st.mode); setSeg('modeSegM',st.mode);
    $('tb-repere').hidden=ill; $('tb-illus').hidden=!ill;
    if(ill && ui.tab==='repere') showTab('illus');
    if(!ill && ui.tab==='illus') showTab('lieu');
    exportState();
  }
  function setStep(v){
    step=v; setSeg('illusStepSeg',v);
    $('illusPrompt').hidden=v!=='prompt'; $('illusImage').hidden=v!=='image';
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
    $('tPosSeg').querySelectorAll('button').forEach(b=>pressed(b,b.dataset.v===T.pos));
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
    updatePrompt();
  }
  function updatePrompt(){
    const o=$('promptOut'), t=buildPrompt(st); if(o.value!==t) o.value=t;
    const T=st.illusText, d=exportSpec();
    $('promptInfo').textContent=`Format demandé : ${d.name} ${st.orient==='landscape'?'paysage':'portrait'} · zone du titre : ${POS_NAMES[T.pos[0]]}, ${COL_NAMES[T.pos[1]]} (onglet Textes).`;
  }
  function syncImage(){
    const I=st.illus, has=!!img;
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
  function sync(){ applyMode(); setStep(step); syncPrompt(); syncImage(); syncText(); }

  function init(){
    document.querySelectorAll('.modes button').forEach(b=>b.onclick=()=>setMode(b.dataset.v));
    document.querySelectorAll('#illusStepSeg button').forEach(b=>b.onclick=()=>setStep(b.dataset.v));
    $('bToImage').onclick=()=>{ setStep('image'); $('illusDrop').scrollIntoView?.({block:'nearest'}); };
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
      el.addEventListener('dragover',e=>{ if(st.mode!=='illus') return; e.preventDefault(); $('illusDrop').classList.add('over'); });
      el.addEventListener('dragleave',()=>$('illusDrop').classList.remove('over'));
      el.addEventListener('drop',e=>{ if(st.mode!=='illus') return; e.preventDefault(); $('illusDrop').classList.remove('over');
        const f=e.dataTransfer?.files?.[0]; if(f){ if(ui.tab!=='illus') showTab('illus'); importFile(f); } });
    };
    dropOn($('illusDrop')); dropOn(stage);
    document.addEventListener('paste',e=>{
      if(st.mode!=='illus' || e.target.matches?.('input[type=text],input[type=search],textarea')) return;
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
    CMS.on('state:saved',()=>{ if(st.mode==='illus' && ui.tab==='illus' && step==='prompt') updatePrompt(); });
    // Déplacer l'image en la glissant sur l'aperçu
    let drag=null;
    poster.addEventListener('pointerdown',e=>{
      if(st.mode!=='illus' || !img || e.button>0 || e.target.closest('button')) return;
      drag={x:e.clientX,y:e.clientY,ox:st.illus.ox,oy:st.illus.oy,id:e.pointerId}; poster.setPointerCapture(e.pointerId); poster.classList.add('dragging');
    });
    poster.addEventListener('pointermove',e=>{
      if(!drag || e.pointerId!==drag.id) return;
      st.illus.ox=clamp(drag.ox+(e.clientX-drag.x)/ui.posterCss.w,-1,1); st.illus.oy=clamp(drag.oy+(e.clientY-drag.y)/ui.posterCss.h,-1,1); redraw();
    });
    const end=e=>{ if(!drag || e.pointerId!==drag.id) return; drag=null; poster.classList.remove('dragging'); saveState(); };
    poster.addEventListener('pointerup',end); poster.addEventListener('pointercancel',end);
    // Style du titre
    document.querySelectorAll('#tStyleSeg button').forEach(b=>b.onclick=async()=>{ st.illusText.style=b.dataset.v; syncText(); saveState(); await loadFonts(); scheduleOver(); });
    swatches('swText',SW_TEXT,'color',true); swatches('swShadow',SW_SHADOW,'shadow'); swatches('swOutline',SW_OUTLINE,'outline');
    C.POS.forEach((p,i)=>{ const b=h('button',{type:'button',dataset:{v:p},'aria-label':`Titre ${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`,title:`${POS_NAMES[p[0]]}, ${COL_NAMES[p[1]]}`},POS_ARROWS[i]);
      b.onclick=()=>{ st.illusText.pos=p; syncText(); scheduleOver(); saveState(); }; $('tPosSeg').append(b); });
    sync();
  }
  return {init, draw, ready, importFile, removeImage, setMode, buildPrompt, quality, cropPct, placement, adjust, processPixels,
    get step(){ return step; }, get image(){ return img && {w:img.w, h:img.h, name:img.name}; }};
});
