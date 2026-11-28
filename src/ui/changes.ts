/* City Map Studio — Réglages modifiés : pastilles, comptes et relecture (#118, issu de features.ts). */
import {$, h, toast} from '../core/dom.js';
import {DEFAULT_STATE, DUOS, FORMATS, MARKERS, PosterState, TEXTURES, THEMES} from '../content/config.js';
import {applySnap, hist, HIST_MAX, recordHistory} from '../core/doc/history.js';
import {app, applySheet, isSheet, setFraming, setSheet, sheetHeights, stageMode, TWO_COL} from './sheet.js';
import {keysOf} from '../core/cms.js';
import {saveT, st, ui} from '../core/doc/state.js';
import {setPlacing} from './shell.js';
import {compareBefore} from '../features/compare.js';
import {showTab} from './panel.js';
import {snapshotDoc} from '../core/doc/store.js';
// ---------- Réglages modifiés : pastilles, comptes et relecture (évolutions 5 et 7) ----------
// Une seule table de parties : chacune dit quels réglages s'écartent des valeurs par défaut (DEFAULT_STATE ; pour les
// couleurs, la palette du thème choisi) et sait les rétablir. Le lieu, le cadrage, les textes saisis, le type d'affiche, le
// gabarit et le thème sont des choix, jamais comptés comme des écarts. Seules comptent les parties qui agissent dans le
// type d'affiche courant (onglet visible, condition `on`). Affichage : pastille sur l'onglet (avec description pour les
// lecteurs d'écran), compte dans le titre des sections repliables (sec), liste de l'onglet Export avec « Voir » et
// « Réinitialiser ». Une réinitialisation partielle passe par l'historique : « Annuler » revient en arrière.
CMS.define('changes', () => {
  const D=DEFAULT_STATE, J=JSON.stringify, same=(a: unknown,b: unknown)=>J(a)===J(b);
  /** Nom court d'un réglage : texte de son étiquette, sans la précision entre parenthèses */
  const lab=(k: string)=>{ const el=document.querySelector<HTMLElement>(`[data-k="${k}"]`), l=el && el.closest('label');
    return l ? [...l.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').replace(/\s*\(.*$/,'').trim() || k : k; };
  const nm=(list: readonly (readonly unknown[])[],k: string)=>(list.find(x=>x[0]===k)||[,k])[1];
  const pct=(v: number)=>Math.round(v)+' %', signed=(v: number)=>(v>0?'+':'')+v;
  const LINES: Record<string, string>={title:'titre',subtitle:'sous-titre',coords:'coordonnées',dedication:'dédicace',names:'noms',date:'date'};
  const TABS: Record<string, string>={lieu:'Lieu',repere:'Repère',illus:'Illustration',textes:'Textes',style:'Style',export:'Export'};
  const tpos=(s: PosterState)=>CMS.illus.posOf(s);
  const duoOf=(s: PosterState)=>DUOS.find(([,,ft,fx])=>fx===s.font && (s.fontTitle||s.font)===ft);   // duo de polices choisi, s'il y en a un   // CMS.illus : chargé après ce fichier, lu à l'usage
  const dpos=(s: PosterState): Record<string, any>=>s.mode==='map' ? D.illusText.map : s.mode==='mix' ? D.illusText.mix : D.illusText;
  const onMap=(s: PosterState)=>s.mode!=='illus';
  /** Copie des valeurs par défaut (objets de l'état, indexés par nom de champ) */
  const copy=(o: Record<string, any>,keys: string[],src: Record<string, any>=D)=>{ for(const k of keys) o[k]=structuredClone(src[k]); };
  const fmtWhen=(w: string)=>{ const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d:\d\d)$/.exec(w); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : w; };
  const FX=keysOf(D.fx).filter(k=>k!=='foil');   // la dorure est réglée avec le papier
  /** Parties : id, onglet, ancre (id), nom, sections repliables (sec), condition (on), écarts (items), réinitialisation (reset) */
  type Item = string | false | null | undefined | 0 | '';
  interface Group { id: string; tab: string; at: string; name: string; step?: string; sec?: string[]; on?: (s: PosterState)=>boolean;
    items: (s: PosterState)=>Item[]; reset: (o: PosterState & Record<string, any>)=>void }
  const GROUPS: Group[]=[
    {id:'marker', tab:'repere', at:'hMarker', name:'Repère', items:s=>[
      s.markerStyle!==D.markerStyle && `« ${nm(MARKERS,s.markerStyle)} »`, s.markerFill!==D.markerFill && 'contour seul',
      s.markerSize!==D.markerSize && 'taille '+pct(s.markerSize), s.markerOpacity!==D.markerOpacity && 'opacité '+pct(s.markerOpacity*100),
      !!s.markerLabel && 'nom du lieu'],
      reset:o=>copy(o,['markerStyle','markerFill','markerSize','markerOpacity','markerLabel'])},
    {id:'places', tab:'repere', at:'hPlaces', name:'Plusieurs lieux', on:s=>s.layout!=='diptych', items:s=>[
      s.markers2.length>0 && (s.markers2.length+1)+' lieux', s.numbered && 'numérotés', s.linkMarkers && 'reliés'],
      reset:o=>copy(o,['markers2','numbered','linkMarkers'])},
    {id:'route', tab:'repere', at:'hRoute', name:'Itinéraire', items:s=>[
      !!s.route && ('GPX actif'+(s.route.name?` « ${s.route.name} »`:'')+(s.route.show===false?' (masqué)':'')),
      !same(s.routeStyle,D.routeStyle) && 'style du tracé'],
      reset:o=>copy(o,['route','routeStyle'])},
    {id:'illusCrop', tab:'illus', at:'hIllusCrop', step:'image', name:'Cadrage de l\'image', items:s=>[
      s.illus.fit!==D.illus.fit && 'image entière', s.illus.zoom!==D.illus.zoom && 'zoom '+pct(s.illus.zoom),
      !!(s.illus.ox||s.illus.oy) && 'image déplacée'],
      reset:o=>copy(o.illus,['fit','zoom','ox','oy'],D.illus)},
    {id:'illusFx', tab:'illus', at:'hIllusFx', step:'image', name:'Retouches de l\'image', items:s=>[
      !!s.illus.bright && 'luminosité '+signed(s.illus.bright), !!s.illus.contrast && 'contraste '+signed(s.illus.contrast),
      !!s.illus.satur && 'saturation '+signed(s.illus.satur),
      s.illus.vintage!==D.illus.vintage && 'filtre vintage '+(s.illus.vintage==='light'?'léger':'marqué'),
      s.illus.grain && lab('illus.grain'), s.illus.flat && lab('illus.flat'), s.illus.upscale && lab('illus.upscale')],
      reset:o=>copy(o.illus,['bright','contrast','satur','vintage','grain','flat','upscale'],D.illus)},
    // Onglet Textes (#88) : duos, Vintage et couleur des lettres en vue ; polices détaillées, ombre, tailles par ligne… dans Plus de réglages
    {id:'typo', tab:'textes', at:'hTypo', name:'Typographie', items:s=>{ const d=duoOf(s); return [
      d && d[0]!==duoOf(D)?.[0] && `duo « ${d[1]} »`, s.illusText.style!==D.illusText.style && (s.illusText.style==='vintage' ? 'titre Vintage' : 'police du titre fixée'),
      s.illusText.color!==D.illusText.color && 'couleur des lettres']; },
      reset:o=>{ copy(o,['font','fontTitle']); copy(o.illusText,['style','color'],D.illusText); }},
    {id:'fonts', tab:'textes', at:'hFonts', sec:['textMore'], name:'Polices', items:s=>duoOf(s) ? [] : [
      s.fontTitle!==D.fontTitle && 'police du titre', s.font!==D.font && 'police du texte'],
      reset:o=>copy(o,['font','fontTitle'])},
    {id:'textFx', tab:'textes', at:'hTextFx', sec:['textMore'], name:'Ombre et contour', items:s=>[
      s.illusText.shadow!==D.illusText.shadow && 'ombre', s.illusText.outline!==D.illusText.outline && 'contour', s.illusText.off!==D.illusText.off && 'décalage de l\'ombre'],
      reset:o=>copy(o.illusText,['shadow','outline','off'],D.illusText)},
    {id:'textPos', tab:'textes', at:'hTextPos', name:'Positions des textes', items:s=>{ const p=tpos(s), d=dpos(s); return [
      (p.free || p.pos!==d.pos) && (p.free ? 'titre placé à la main' : 'titre déplacé'),
      (p.ffree || p.fpos!==d.fpos) && (p.ffree ? 'lignes du bas placées à la main' : 'lignes du bas déplacées'),
      !!p.zone && !same(p.zone,d.zone) && 'textes posés sur la carte ou sur toute l\'affiche',   // Carte + illustration (#86)
      !same(p.deco,d.deco) && 'présentation des textes', (p.ftpl||'classique')!==d.ftpl && 'mise en forme des lignes du bas'];  },
      reset:o=>{ const p=tpos(o), d=dpos(o); copy(p,['pos','free','fpos','ffree','deco','ftpl',...(p.zone?['zone']:[])],d); }},
    {id:'textMore', tab:'textes', at:'hPlate', sec:['textMore'], name:'Plaques (fond et trait) et ordre des lignes', items:s=>[
      !same(s.illusText.plate,D.illusText.plate) && 'plaques (fond, opacité, trait ou éloignement)', !!s.lineOrder && 'ordre des lignes'],
      reset:o=>{ o.illusText.plate=structuredClone(D.illusText.plate); o.lineOrder=null; }},
    {id:'textSize', tab:'textes', at:'hTextSize', name:'Taille de tous les textes', items:s=>[s.textScaleAll!==D.textScaleAll && 'tous les textes à '+pct(s.textScaleAll)],
      reset:o=>copy(o,['textScaleAll'])},
    {id:'lineSizes', tab:'textes', at:'hLineSizes', sec:['textMore'], name:'Taille de chaque ligne', items:s=>{
      const n=keysOf(D.textScale).filter(k=>s.textScale[k]!==D.textScale[k]).length;
      return [n>0 && (n>1 ? n+' lignes redimensionnées' : '1 ligne redimensionnée')]; },
      reset:o=>copy(o,['textScale'])},
    {id:'lines', tab:'textes', at:'hLines', name:'Lignes', items:s=>{ const off=keysOf(D.show).filter(k=>s.show[k]!==D.show[k]); return [
      off.length>0 && (off.length>1?'masquées : ':'masquée : ')+off.map(k=>LINES[k]||k).join(', '), !!s.coordsManual && 'coordonnées saisies à la main']; },
      reset:o=>copy(o,['show','coordsManual'])},
    {id:'lineOpts', tab:'textes', at:'hLineOpts', sec:['textMore'], name:'Dédicace et coordonnées', items:s=>[
      s.dedWrap!==D.dedWrap && 'coupure de la dédicace imposée', s.coordFormat!==D.coordFormat && 'coordonnées en degrés, minutes, secondes'],
      reset:o=>copy(o,['coordFormat','dedWrap'])},
    {id:'paper', tab:'style', at:'hPaper', name:'Papier et dorure', items:s=>[
      s.texture!==D.texture && `papier « ${nm(TEXTURES,s.texture)} »`, s.folds && lab('folds'),
      s.mode!=='map' && s.illus.paper && lab('illus.paper'), s.fx.foil && lab('fx.foil')],
      reset:o=>{ copy(o,['texture','folds']); o.illus.paper=D.illus.paper; o.fx.foil=D.fx.foil; }},
    {id:'colors', tab:'style', at:'colorsBox', sec:['styleMore','colorsBox'], on:onMap, name:'Couleurs', items:s=>{
      const t=THEMES[s.theme], n=t ? keysOf(s.colors).filter(k=>s.colors[k]!==t.c[k]).length : 0;
      return [n>0 && (n>1 ? n+' teintes personnalisées' : '1 teinte personnalisée')+(t?` (thème « ${t.name} »)`:'')]; },
      reset:o=>{ const t=THEMES[o.theme]; if(t) o.colors={...t.c}; }},
    {id:'fx', tab:'style', at:'hFx', sec:['styleMore'], on:onMap, name:'Effets de tracé', items:s=>[
      ...FX.map(k=>s.fx[k] && lab('fx.'+k)), (s.fx.halo||s.fx.quarter) && s.focusR!==D.focusR && 'rayon '+pct(s.focusR)],
      reset:o=>{ for(const k of FX) o.fx[k]=D.fx[k]; o.focusR=D.focusR; }},
    {id:'orn', tab:'style', at:'hOrn', sec:['styleMore'], on:onMap, name:'Ornements', items:s=>keysOf(D.orn).map(k=>s.orn[k]!==D.orn[k] && lab('orn.'+k)),
      reset:o=>copy(o,['orn'])},
    {id:'sky', tab:'style', at:'hSky', sec:['styleMore'], on:s=>onMap(s) && s.layout==='sky', name:'Ciel du jour J', items:s=>[
      !!s.sky.when && 'ciel du '+fmtWhen(s.sky.when), s.sky.tz!=='auto' && 'fuseau choisi',
      (['lines','grid','moon','planets','milky'] as const).some(k=>s.sky[k]!==D.sky[k]) && 'options du ciel'],
      reset:o=>copy(o,['sky'])},
    {id:'trace', tab:'style', at:'hTrace', sec:['styleMore'], on:onMap, name:'Tracé, calques et mise en page', items:s=>[
      s.stroke!==D.stroke && 'trait '+pct(s.stroke*100), s.waterMult!==D.waterMult && 'eau '+pct(s.waterMult*100),
      ...keysOf(D.layers).map(k=>s.layers[k]!==D.layers[k] && `sans « ${lab('layers.'+k)} »`),
      s.margin!==D.margin && 'marge '+String(s.margin).replace('.',',')+' %', s.ring!==D.ring && 'sans contour de la forme',
      s.attribution!==D.attribution && 'mention des sources abrégée'],
      reset:o=>copy(o,['stroke','waterMult','layers','margin','ring','attribution'])},
    {id:'export', tab:'export', at:'hRender', name:'Rendu', items:s=>[
      s.format!==D.format && nm(FORMATS,s.format), s.orient!==D.orient && !(s.mode==='mix' && s.mix.compo==='cote') && 'paysage',
      s.fileType!==D.fileType && 'document PDF'],
      reset:o=>{ copy(o,['format','fileType']); if(!(o.mode==='mix' && o.mix.compo==='cote')) o.orient=D.orient; }},
  ];
  const tabOn=(t: string)=>{ const b=$('tb-'+t); return !!b && !b.hidden; };
  /** Parties modifiées dans le contexte courant : [{g, items}] */
  function list(s=st){
    const out: {g: Group; items: string[]}[]=[];
    for(const g of GROUPS){
      if(!tabOn(g.tab) || (g.on && !g.on(s))) continue;
      const items=g.items(s).filter((x): x is string=>!!x); if(items.length) out.push({g,items});
    }
    return out;
  }
  function reveal(g: Group){
    showTab(g.tab); if(isSheet() && ui.sheet==='peek') setSheet('half');
    if(g.step) document.querySelector<HTMLElement>(`#illusStepSeg [data-v="${g.step}"]`)?.click();
    const el=$(g.at); if(!el) return;
    for(let d=el.closest('details'); d; d=d.parentElement!.closest('details')) d.open=true;
    if(el instanceof HTMLDetailsElement) el.open=true;
    setTimeout(()=>CMS.panelScroll.to(el,'start',true),60);
  }
  function reset(id: string){
    const g=GROUPS.find(x=>x.id===id); if(!g) return false;
    compareBefore(false); clearTimeout(saveT); recordHistory();
    const {engine,...o}=snapshotDoc(); g.reset(o as PosterState);
    const s=JSON.stringify(o); if(s===hist.cur) return false;
    hist.past.push(hist.cur!); if(hist.past.length>HIST_MAX) hist.past.shift(); hist.future=[];
    applySnap(s); hist.quietUntil=Date.now()+1500;
    toast(`${g.name} : réglages par défaut rétablis · « Annuler » pour revenir en arrière`);
    update(); return true;
  }
  let sig='';
  function update(){
    const L=list(), per: Record<string, string[]>={}, secs: Record<string, number>={};
    for(const {g,items} of L){ (per[g.tab]=per[g.tab]||[]).push(g.name+' : '+items.join(', ')); for(const k of g.sec||[]) secs[k]=(secs[k]||0)+items.length; }
    // pastilles des onglets
    document.querySelectorAll<HTMLElement>('#tabs button').forEach(b=>{
      const t=b.dataset.tab!, d=b.querySelector<HTMLElement>('.tbd'), txt=per[t] ? 'Réglages modifiés : '+per[t].join(' ; ') : '';
      if(d) d.hidden=!txt;
      const desc=$('tbdesc-'+t); if(desc && desc.textContent!==txt) desc.textContent=txt;
      if(txt) b.setAttribute('aria-describedby','tbdesc-'+t); else b.removeAttribute('aria-describedby');
      b.title=txt;
    });
    // comptes des sections repliables
    document.querySelectorAll<HTMLElement>('summary .chg').forEach(c=>{ const n=secs[c.id.slice(4)]||0, t=n ? n+(n>1?' modifiés':' modifié') : '';
      c.hidden=!n; if(c.textContent!==t) c.textContent=t; });
    // relecture (onglet Export) : reconstruite seulement si elle change (le focus reste en place)
    const s=J(L.map(x=>[x.g.id,x.items])); if(s===sig) return; sig=s;
    const ul=$('changesList'), had=ul.contains(document.activeElement);
    ul.textContent='';
    for(const {g,items} of L){
      const bView=h('button',{type:'button',className:'btn sm','aria-label':'Voir : '+g.name},'Voir'); bView.onclick=()=>reveal(g);
      const bReset=h('button',{type:'button',className:'btn sm','aria-label':'Réinitialiser : '+g.name},'Réinitialiser'); bReset.dataset.reset=g.id;
      bReset.onclick=()=>reset(g.id);
      ul.appendChild(h('li',{},h('div',{className:'cg'},h('span',{className:'ctab'},TABS[g.tab]),h('b',{},g.name),h('small',{},items.join(' · '))),
        h('div',{className:'acts'},bView,bReset)));
    }
    $('changesEmpty').hidden=L.length>0;
    if(had) (ul.querySelector<HTMLElement>('button[data-reset]')||$('bReset')).focus({preventScroll:true});
  }
  let raf=0; const schedule=()=>{ if(!raf) raf=requestAnimationFrame(()=>{ raf=0; update(); }); };
  function init(){
    document.querySelectorAll<HTMLElement>('#tabs button').forEach(b=>{
      b.appendChild(h('i',{className:'tbd',hidden:true,'aria-hidden':'true'}));
      $('panel').appendChild(h('span',{id:'tbdesc-'+b.dataset.tab,hidden:true}));
    });
    CMS.on('state:saved',schedule); CMS.on('state:synced',schedule); CMS.on('tab:shown',schedule);
    $('panel').addEventListener('input',schedule); $('panel').addEventListener('click',schedule);
    new MutationObserver(schedule).observe($('tabs'),{subtree:true,attributes:true,attributeFilter:['hidden']});
    update();
  }
  return {init, update, list, reset, groups:GROUPS.map(g=>g.id)};
});
function initSheet(){
  const g=$('grab'); let drag: {y: number; h: number; moved: boolean} | null=null, dragged=false;
  g.addEventListener('pointerdown',e=>{ if(!isSheet()) return; g.setPointerCapture(e.pointerId);
    drag={y:e.clientY, h:$('panel').getBoundingClientRect().height, moved:false}; });
  g.addEventListener('pointermove',e=>{ if(!drag) return; const dy=e.clientY-drag.y;
    if(Math.abs(dy)>6 && !drag.moved){ drag.moved=true; app.classList.add('dragging'); app.dataset.sheet='half'; }
    if(drag.moved) applySheet(drag.h-dy); });
  const end=()=>{ if(!drag) return; const d=drag; drag=null; app.classList.remove('dragging');
    // Un simple toucher est traité au « click » : changer le panneau dès pointerup ferait tomber le clic sur la carte, désormais sous le doigt
    if(!d.moved) return;
    dragged=true; setTimeout(()=>dragged=false,400);
    // cran le plus proche, avec une préférence pour le sens du geste
    const H=sheetHeights(), h=$('panel').getBoundingClientRect().height, dir=Math.sign(d.h-h);
    let best='half', bd=1e9;
    for(const k of ['peek','half','full'] as const){ const dist=Math.abs(H[k]-h)-(Math.sign(d.h-H[k])===dir&&dir?40:0); if(dist<bd){ bd=dist; best=k; } }
    ui.sheetBefore=null; setSheet(best); };
  g.addEventListener('pointerup',end); g.addEventListener('pointercancel',end);
  g.addEventListener('click',()=>{ if(dragged || !isSheet()){ dragged=false; return; } ui.sheetBefore=null; setSheet(ui.sheet==='peek'?'half':ui.sheet==='half'?'full':'half'); });
  g.addEventListener('keydown',e=>{ if(e.key==='ArrowUp'){ e.preventDefault(); setSheet(ui.sheet==='peek'?'half':'full'); } if(e.key==='ArrowDown'){ e.preventDefault(); setSheet(ui.sheet==='full'?'half':'peek'); } });
  // Saisie d'un texte : le panneau se déplie (clavier + champ visibles), puis reprend sa place
  let restoreT=0, before: string | null=null;
  $('panel').addEventListener('focusin',e=>{ if(!isSheet() || !(e.target as HTMLInputElement).matches('input[type=text],input[type=search]')) return;
    clearTimeout(restoreT); if(before==null && ui.sheet!=='full'){ before=ui.sheet; setSheet('full'); }
    setTimeout(()=>CMS.panelScroll.to(e.target,'nearest'),50); });
  $('panel').addEventListener('focusout',()=>{ clearTimeout(restoreT); restoreT=setTimeout(()=>{
    if(before!=null && !document.activeElement?.matches?.('input[type=text],input[type=search]')){ setSheet(before); before=null; } },200); });
  $('shield').onclick=e=>CMS.intent.enterAt(e.clientX,e.clientY);   // la zone touchée (carte ou illustration) donne le choix de départ
  $('bEdit').onclick=()=>setFraming(!ui.framing);
  CMS.intent.init();
  TWO_COL.addEventListener('change',()=>{ setFraming(false); setPlacing(false); ui.sheetBefore=null; setSheet(ui.sheet); stageMode(); });
  CMS.clean.init();
  setSheet('half'); stageMode();
}

export {initSheet};
