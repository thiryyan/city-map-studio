/* City Map Studio — Itinéraire préparé avec une IA externe (issue #85), espace CMS.route.
 * Module ES (#102), importé par src/app/main.ts ; réuni en un seul script par le build (scripts/build.mjs).
 *
 * Comme pour l'illustration : l'application rédige le prompt (buildRoutePrompt), l'utilisateur le colle dans son IA (ChatGPT,
 * Gemini…) et ramène le GPX, en fichier ou collé tel quel (extractGpx tolère les phrases et les clôtures de code autour).
 * Aucun appel réseau : la CSP est inchangée. Après import, un contrôle de vraisemblance (routeChecks) signale un tracé loin
 * du lieu de l'affiche ou fait de longs tronçons rectilignes (étapes reliées en ligne droite).
 * Fonctions pures testées sans navigateur : tests/unit/route.test.mjs.
 */
import type {PosterState, Route} from '../content/config.js';
import {saveState, st, ui} from '../core/doc/state.js';
import {ratio, viewBounds} from '../core/geo/geo.js';
import {changed} from '../view/preview.js';
import {fitRoute, parseGpx, renderRoute} from './features.js';
import {$, h, setSeg, toast} from '../core/dom.js';
/** Emprise {s, w, n, e} (degrés) */
type Bounds = {s: number; w: number; n: number; e: number};
type Kind = 'walk' | 'bike' | 'car' | 'trip';
CMS.define('route', () => {
  // ---------- Fonctions pures ----------
  const KINDS=['walk','bike','car','trip'], STEPS_MAX=10, EXTRA_MAX=400;
  /** Seuils du contrôle : distance au lieu principal (km), tronçon rectiligne (km), emprise de la carte vérifiée ou non */
  const LIMITS: Record<Kind, {far: number; gap: number; box: boolean}>={walk:{far:10,gap:1,box:true}, bike:{far:40,gap:3,box:true}, car:{far:150,gap:10,box:false}, trip:{far:3000,gap:Infinity,box:false}};

  /** Texte collé (réponse complète d'une IA, bloc ```xml, phrases autour) → XML de <gpx> à </gpx> ; le dernier bloc complet l'emporte */
  function extractGpx(txt: string){
    const t=String(txt??'').replace(/^﻿/,'').replace(/```[a-z]*[ \t]*\r?\n?/gi,'\n');
    const ends=[...t.matchAll(/<\/gpx\s*>/gi)], starts=[...t.matchAll(/<gpx[\s>]/gi)];
    if(!starts.length) throw new Error('aucun bloc GPX trouvé dans le texte collé');
    if(!ends.length) throw new Error('GPX incomplet (balise </gpx> absente) : la réponse de l’IA a peut-être été coupée');
    const end=ends[ends.length-1], e=end.index+end[0].length, st=[...starts].reverse().find(m=>m.index<end.index);
    if(!st) throw new Error('GPX incomplet (balise <gpx> absente)');
    return '<?xml version="1.0" encoding="UTF-8"?>\n'+t.slice(st.index,e).trim();
  }

  const distKm=(a: number[],b: number[])=>{   // haversine (km) entre [lat, lon]
    const R=6371, r=Math.PI/180, dl=(b[0]-a[0])*r, dn=(b[1]-a[1])*r;
    const x=Math.sin(dl/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dn/2)**2;
    return 2*R*Math.asin(Math.min(1,Math.sqrt(x)));
  };
  /** Emprise de la carte de l'affiche {s, w, n, e} : cadre de la carte de l'aperçu (gabarit, format), à défaut celui de l'affiche entière */
  function mapBounds(s: PosterState): Bounds {
    const r=typeof ui==='object' && ui?.slotCss?.w>0 ? ui.slotCss : null;
    return viewBounds({center:s.center, zoom:s.zoom}, r ? r.h/r.w : ratio(s));
  }
  /** Lieux de l'affiche proposés comme étapes : lieu principal puis lieux supplémentaires {name, lat, lon} */
  function placesOf(s: PosterState, lang='fr'){
    const en=lang==='en', out=[{name:(s.markerLabel||'').trim()||(en?'Main place':'Lieu principal'), lat:s.marker.lat, lon:s.marker.lon}];
    (s.markers2||[]).forEach((p,i)=>out.push({name:(p.label||'').trim()||(en?`Place ${i+2}`:`Lieu ${i+2}`), lat:p.lat, lon:p.lon}));
    return out;
  }
  const f6=(v: number)=>(+v).toFixed(6);
  const L10N: Record<'fr' | 'en', any>={
    fr:{city:'la ville choisie',
      role:(w: string,date: string)=>`Tu prépares un tracé GPX pour une affiche souvenir de ${w}${date?` (date : ${date})`:''}. Le tracé sera dessiné sur la carte de l'affiche.`,
      data:'DONNÉES FIXES :',
      kind:{walk:'Type de parcours : balade à pied, qui suit les rues, chemins et passages piétons réels.',
        bike:'Type de parcours : trajet à vélo, qui suit les rues, routes et pistes cyclables réelles.',
        car:'Type de parcours : trajet en voiture (road trip), qui suit les routes réelles.',
        trip:'Type de parcours : voyage en plusieurs villes, trajet libre ; les tronçons en ligne droite entre deux villes sont admis.'},
      places:'Lieux connus, à reprendre avec ces coordonnées exactes (latitude, longitude ; degrés décimaux WGS 84) :',
      noPlace:'Aucun lieu imposé : propose les étapes d’après mes souhaits ci-dessous.',
      extra:'Autres étapes souhaitées (dans cet ordre si possible) : ',
      loop:{true:'Parcours en boucle : retour au point de départ.', false:'Aller simple, de la première à la dernière étape.'},
      box:(b: Bounds)=>`Emprise de la carte de l'affiche : latitude de ${f6(b.s)} à ${f6(b.n)}, longitude de ${f6(b.w)} à ${f6(b.e)}. Le tracé doit rester à l'intérieur.`,
      boxFree:(b: Bounds)=>`Emprise actuelle de la carte (indicative : la carte sera recadrée sur le tracé) : latitude de ${f6(b.s)} à ${f6(b.n)}, longitude de ${f6(b.w)} à ${f6(b.e)}.`,
      max:`${STEPS_MAX} étapes au plus.`,
      steps:'DÉROULEMENT (une étape à la fois) :',
      s1:'1. Propose-moi la liste ordonnée des étapes : pour chacune, son nom, son adresse et ses coordonnées (6 décimales). Uniquement des lieux réels ; n’invente aucune coordonnée et signale celles dont tu n’es pas sûr. Puis attends ma validation.',
      s2:'2. Une fois les étapes validées, produis le GPX au format ci-dessous.',
      fmt:'FORMAT EXIGÉ :',
      f1:'GPX 1.1 valide : <gpx version="1.1" creator="IA" xmlns="http://www.topografix.com/GPX/1/1"> … </gpx> ;',
      f2:'un <wpt lat="…" lon="…"><name>…</name></wpt> par étape, dans l’ordre du parcours ;',
      f3:{road:'un <trk><name>…</name><trkseg> de 50 à 400 <trkpt lat="…" lon="…"/> qui suit les voies réelles (aucune étape reliée en ligne droite) ;',
        free:'un <trk><name>…</name><trkseg> de 50 à 400 <trkpt lat="…" lon="…"/> ; les routes réelles si possible, sinon des tronçons en ligne droite entre les villes ;'},
      f4:'coordonnées en degrés décimaux WGS 84, au moins 5 décimales, point décimal ;',
      f5:'réponds avec SEULEMENT le XML, dans un unique bloc de code, sans aucun texte avant ni après.',
      fallback:'REPLI : si tu ne peux pas suivre les rues, mets seulement les étapes dans un <rte> (un <rtept lat="…" lon="…"><name>…</name></rtept> par étape) ; je les relierai.'},
    en:{city:'the chosen city',
      role:(w: string,date: string)=>`You are preparing a GPX track for a keepsake poster of ${w}${date?` (date: ${date})`:''}. The track will be drawn on the poster's map.`,
      data:'FIXED DATA:',
      kind:{walk:'Route type: a walk, following real streets, paths and footways.',
        bike:'Route type: a bike ride, following real streets, roads and cycle lanes.',
        car:'Route type: a car journey (road trip), following real roads.',
        trip:'Route type: a trip through several cities, free route; straight segments between two cities are allowed.'},
      places:'Known places, to be used with these exact coordinates (latitude, longitude; WGS 84 decimal degrees):',
      noPlace:'No fixed place: suggest the stops from my wishes below.',
      extra:'Other stops I would like (in this order if possible): ',
      loop:{true:'Loop: back to the starting point.', false:'One way, from the first to the last stop.'},
      box:(b: Bounds)=>`Extent of the poster's map: latitude ${f6(b.s)} to ${f6(b.n)}, longitude ${f6(b.w)} to ${f6(b.e)}. The track must stay inside it.`,
      boxFree:(b: Bounds)=>`Current extent of the map (for reference: the map will be refitted to the track): latitude ${f6(b.s)} to ${f6(b.n)}, longitude ${f6(b.w)} to ${f6(b.e)}.`,
      max:`${STEPS_MAX} stops at most.`,
      steps:'PROCESS (one step at a time):',
      s1:'1. Suggest the ordered list of stops: for each one, its name, address and coordinates (6 decimals). Real places only; do not invent coordinates, and flag any you are unsure of. Then wait for my approval.',
      s2:'2. Once the stops are approved, produce the GPX in the format below.',
      fmt:'REQUIRED FORMAT:',
      f1:'valid GPX 1.1: <gpx version="1.1" creator="AI" xmlns="http://www.topografix.com/GPX/1/1"> … </gpx>;',
      f2:'one <wpt lat="…" lon="…"><name>…</name></wpt> per stop, in route order;',
      f3:{road:'one <trk><name>…</name><trkseg> with 50 to 400 <trkpt lat="…" lon="…"/> following real roads and streets (no stop joined by a straight line);',
        free:'one <trk><name>…</name><trkseg> with 50 to 400 <trkpt lat="…" lon="…"/>; real roads if possible, otherwise straight segments between cities;'},
      f4:'WGS 84 decimal degrees, at least 5 decimals, decimal point;',
      f5:'reply with ONLY the XML, in a single code block, with no text before or after it.',
      fallback:'FALLBACK: if you cannot follow the streets, put only the stops in a <rte> (one <rtept lat="…" lon="…"><name>…</name></rtept> per stop); I will join them.'}
  };
  /** Prompt pour l'IA externe : ville, lieux cochés avec leurs coordonnées, type de parcours, emprise, déroulement et format */
  function buildRoutePrompt(s: PosterState, o: Partial<PosterState['routePrompt']>=s.routePrompt){
    const lang=o.lang==='en'?'en':'fr', L=L10N[lang], kind=(KINDS.includes(o.kind as string)?o.kind:'walk') as Kind;
    const title=(s.texts.title||'').trim(), area=(s.texts.subtitle||'').trim();
    const where=title ? title.toUpperCase()+(area?` (${area})`:'') : L.city;
    const places=placesOf(s,lang).filter((_,i)=>!(o.off||[]).includes(i)), extra=String(o.extra||'').replace(/\s+/g,' ').trim().slice(0,EXTRA_MAX);
    const b=mapBounds(s), data=[L.kind[kind]];
    if(places.length) data.push(L.places+'\n'+places.map((p,i)=>`  ${i+1}. ${p.name} : ${f6(p.lat)}, ${f6(p.lon)}`).join('\n'));
    else if(extra) data.push(L.noPlace);
    if(extra) data.push(L.extra+`« ${extra} »`);
    data.push(L.loop[String(!!o.loop)], LIMITS[kind].box ? L.box(b) : L.boxFree(b), L.max);
    const list=(a: string[])=>a.map((x: string)=>'- '+x).join('\n');
    return [L.role(where,(s.texts.date||'').trim()), L.data+'\n'+list(data), L.steps+'\n'+L.s1+'\n'+L.s2,
      L.fmt+'\n'+list([L.f1, L.f2, kind==='trip' ? L.f3.free : L.f3.road, L.f4, L.f5]), L.fallback].join('\n\n');
  }

  /** Contrôle de vraisemblance d'un tracé [[lat, lon], …] : [{code:'far'|'straight', km}] (vide si rien à signaler).
   *  far : un point à plus de LIMITS.far km du lieu principal, ou (balade, vélo) hors de l'emprise de la carte élargie de moitié ;
   *  straight : deux points consécutifs à plus de LIMITS.gap km (étapes reliées en ligne droite). */
  function routeChecks(pts: unknown, s: PosterState, kind: string=s.routePrompt?.kind){
    const Lm=LIMITS[kind as Kind]||LIMITS.walk, out: {code: 'far' | 'straight'; km: number}[]=[], m=[s.marker.lat,s.marker.lon];
    if(!Array.isArray(pts) || pts.length<2) return out;
    let far=0, out_=false, gap=0;
    const b=mapBounds(s), pw=(b.e-b.w)/2, ph=(b.n-b.s)/2;
    for(let i=0;i<pts.length;i++){
      const p=pts[i]; far=Math.max(far,distKm(m,p));
      if(Lm.box && (p[0]<b.s-ph || p[0]>b.n+ph || p[1]<b.w-pw || p[1]>b.e+pw)) out_=true;
      if(i) gap=Math.max(gap,distKm(pts[i-1],p));
    }
    if(far>Lm.far || out_) out.push({code:'far', km:Math.round(far*10)/10});
    if(gap>Lm.gap) out.push({code:'straight', km:Math.round(gap*10)/10});
    return out;
  }

  // ---------- Interface (onglet Repère, section Itinéraire) ----------
  const KIND_NAMES=[['walk','Balade à pied'],['bike','Vélo'],['car','Voiture / road trip'],['trip','Plusieurs villes']];
  const P=()=>st.routePrompt;
  function syncPlaces(){
    const box=$('rpPlaces'), list=placesOf(st);
    box.replaceChildren(...list.map((p,i)=>{
      const c=h('input',{type:'checkbox',checked:!(P().off||[]).includes(i)});
      c.onchange=()=>{ const off=new Set(P().off); c.checked ? off.delete(i) : off.add(i); P().off=[...off].sort(); update(); saveState(); };
      return h('label',{className:'tog'},`${p.name} · ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`,c);
    }));
  }
  function update(){
    const o=$('routePromptOut'), t=buildRoutePrompt(st); if(o.value!==t) o.value=t;
  }
  function sync(){
    setSeg('rpKind',P().kind); setSeg('rpLoop',P().loop?'1':'0'); setSeg('rpLang',P().lang);
    const x=$('rpExtra'); if(document.activeElement!==x && x.value!==P().extra) x.value=P().extra;
    syncPlaces(); update();
  }
  /** Messages du contrôle de vraisemblance après import ; « Pointillés » proposé pour un tracé rectiligne */
  function warn(issues: {code: string; km: number}[]){
    const far=issues.find(x=>x.code==='far'), str=issues.find(x=>x.code==='straight'), km=(v: number)=>String(v).replace('.',',');
    const msg=[far && `Une partie du tracé est loin du lieu de l'affiche (jusqu'à ${km(far.km)} km) : vérifiez les étapes.`,
      str && `Le tracé relie des étapes en ligne droite (tronçon de ${km(str.km)} km) : l'IA n'a pas suivi les rues.`].filter(Boolean).join(' ');
    $('routeWarn').textContent=msg; $('routeWarn').hidden=false;
    toast(msg, true, str && !st.routeStyle.dash ? {label:'Pointillés', fn:()=>{ st.routeStyle.dash=true; renderRoute(); changed(); }} : undefined);
  }
  /** Import d'un texte GPX (fichier, ou collé : extractGpx) ; en cas d'erreur, l'affiche n'est pas modifiée.
   *  Le contrôle porte sur les points lus avant simplification, et sur le lieu et l'emprise d'avant le recadrage (fitRoute) */
  function importGpxText(txt: string, pasted: boolean){
    let route: Route; const info: {raw?: [number, number][]}={};
    try{ route=parseGpx(pasted ? extractGpx(txt) : txt, info); }
    catch(e){ toast((pasted ? 'Collage GPX impossible : ' : 'Import GPX impossible : ')+(e as Error).message,true); return false; }
    const issues=routeChecks(info.raw||route.pts, st, P().kind);
    st.route=route; $('routeWarn').hidden=true; renderRoute(); fitRoute(); changed();
    if(issues.length) warn(issues);
    else toast(`Itinéraire importé · ${route.pts.length} points`+(route.wpts?.length ? ` · ${route.wpts.length} étapes` : ''));
    return true;
  }
  function init(){
    for(const [k,n] of KIND_NAMES){ const b=h('button',{type:'button',dataset:{v:k}},n); b.onclick=()=>{ P().kind=k; sync(); saveState(); }; $('rpKind').append(b); }
    document.querySelectorAll<HTMLElement>('#rpLoop button').forEach(b=>b.onclick=()=>{ P().loop=b.dataset.v==='1'; sync(); saveState(); });
    document.querySelectorAll<HTMLElement>('#rpLang button').forEach(b=>b.onclick=()=>{ P().lang=b.dataset.v!; sync(); saveState(); });
    $('rpExtra').oninput=e=>{ P().extra=(e.target as HTMLInputElement).value.slice(0,EXTRA_MAX); update(); saveState(); };
    $('routeAi').addEventListener('toggle',()=>{ if($<HTMLDetailsElement>('routeAi').open) sync(); });
    $('bCopyRoute').onclick=async()=>{
      update(); const t=$('routePromptOut').value, okMsg='Prompt copié : collez-le dans ChatGPT ou Gemini, puis rapportez le GPX';
      try{ await navigator.clipboard.writeText(t); toast(okMsg); }
      catch(e){ const o=$('routePromptOut'); o.focus(); o.select(); let ok=false; try{ ok=document.execCommand('copy'); }catch(_){}
        toast(ok ? okMsg : 'Copie refusée par le navigateur : le prompt est sélectionné, copiez-le (Ctrl + C)',!ok); }
    };
    // Coller le GPX : presse-papiers au toucher (geste requis sur mobile), sinon zone de texte de secours puis Importer
    const canRead=!!(window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.readText==='function');
    $('bGpxPaste').hidden=!canRead;
    $('bGpxPaste').onclick=async()=>{
      let t; try{ t=await navigator.clipboard.readText(); }
      catch(e){ toast('Presse-papiers illisible : collez le GPX dans la zone de texte, puis « Importer »',true); $('gpxText').focus(); return; }
      if(!t || !t.trim()){ toast('Presse-papiers vide : copiez la réponse de l’IA, ou collez-la dans la zone de texte',true); return; }
      $('gpxText').value=t.slice(0,2e6); if(importGpxText(t,true)) $('gpxText').value='';
    };
    $('bGpxImport').onclick=()=>{ const t=$('gpxText').value;
      if(!t.trim()){ toast('Collez d’abord le GPX (ou toute la réponse de l’IA) dans la zone de texte',true); $('gpxText').focus(); return; }
      if(importGpxText(t,true)) $('gpxText').value=''; };
    CMS.on('state:saved',()=>{ if($<HTMLDetailsElement>('routeAi').open) sync(); });   // lieux, textes ou cadrage modifiés : prompt à jour
    sync();
  }
  return {init, sync, extractGpx, buildRoutePrompt, routeChecks, mapBounds, placesOf, importGpxText, KINDS, EXTRA_MAX};
});
