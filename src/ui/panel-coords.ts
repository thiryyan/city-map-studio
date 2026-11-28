/* City Map Studio — Interface : taille du texte de l'interface, saisie des coordonnées, texte du repère (extrait de ui/panel.ts, #119). */
import {$, h, toast} from '../core/dom.js';
import {applySheet} from './sheet.js';
import {goTo, setMarker} from '../features/places.js';
import {geom} from '../render/layout.js';
import {st} from '../core/doc/state.js';
import {coordText, dms, posterDims, viewBounds} from '../core/geo/geo.js';
import {PRESETS} from '../content/config.js';
// ---------- Taille du texte de l'interface (A− / A+) ----------
// Préférence d'affichage propre à l'appareil : hors de l'état de l'affiche, non concernée par « Réinitialiser ».
const UI_SCALE_KEY='cms:uiScale', UI_SCALES=[0.875,1,1.125,1.25,1.375];
let uiScale=(()=>{ try{ const v=parseFloat(localStorage.getItem(UI_SCALE_KEY)||''); return UI_SCALES.includes(v)?v:1; }catch(e){ return 1; } })();
export function applyUiScale(){
  const r=document.documentElement.style;
  if(uiScale===1) r.removeProperty('font-size'); else r.fontSize=(uiScale*100)+'%';   // 100 % : réglage du système (Dynamic Type sur iOS)
  $('uiScaleTxt').textContent=Math.round(uiScale*100)+' %';
  $('bUiSmaller').disabled=uiScale===UI_SCALES[0]; $('bUiLarger').disabled=uiScale===UI_SCALES[UI_SCALES.length-1];
  try{ uiScale===1 ? localStorage.removeItem(UI_SCALE_KEY) : localStorage.setItem(UI_SCALE_KEY,String(uiScale)); }catch(e){}
  requestAnimationFrame(()=>applySheet());
}
export function stepUiScale(d: number){ const i=UI_SCALES.indexOf(uiScale); uiScale=UI_SCALES[Math.max(0,Math.min(UI_SCALES.length-1,i+d))]; applyUiScale(); toast(`Texte de l'interface : ${Math.round(uiScale*100)} %`); }
/** Lit des coordonnées saisies : décimal (point ou virgule), DMS / DM avec N S E W O, ou URL de carte. Renvoie {lat,lon} ou lève une erreur. */
export function parseCoords(input: string){
  let t=String(input||'').trim(); if(!t) throw new Error('Saisissez des coordonnées.');
  const url=t.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) || t.match(/[?&#](?:mlat|lat|q|query|ll)=(-?\d+(?:\.\d+)?)(?:,|&mlon=|&lon=|%2C)(-?\d+(?:\.\d+)?)/i) || t.match(/#map=[\d.]+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
  let lat: number | undefined, lon: number | undefined;
  if(url){ lat=+url[1]; lon=+url[2]; }
  else{
    const toks=[...t.matchAll(/(-?\d+(?:[.,]\d+)?)|([NSEWO])(?![a-z])/gi)].map((m): {n?: string; h?: string}=>m[1]!=null?{n:m[1]}:{h:m[2].toUpperCase()});
    const nums=toks.filter(x=>x.n!=null);
    if(!nums.length) throw new Error('Format non reconnu : saisissez « latitude, longitude ».');
    const val=(g: string[])=>{ if(!g.length||g.length>3) throw new Error('Format non reconnu.');
      const v=g.map((x: string)=>parseFloat(x.replace(',','.'))); const neg=g[0].startsWith('-');
      if(v.slice(1).some((x: number)=>x<0||x>=60)) throw new Error('Minutes et secondes doivent être comprises entre 0 et 60.');
      const a=Math.abs(v[0])+(v[1]||0)/60+(v[2]||0)/3600; return neg?-a:a; };
    if(toks.some(x=>x.h)){
      type G = {nums: string[]; h: string | null};
      const groups: G[]=[]; const prefix=!!toks[0].h; let cur: G={nums:[],h:null};
      for(const x of toks){
        if(x.h){ if(prefix){ if(cur.h||cur.nums.length) groups.push(cur); cur={nums:[],h:x.h}; } else { cur.h=x.h; groups.push(cur); cur={nums:[],h:null}; } }
        else cur.nums.push(x.n!);
      }
      if(cur.h||cur.nums.length) groups.push(cur);
      if(groups.length!==2||groups.some(g=>!g.h)) throw new Error('Indiquez une latitude (N/S) et une longitude (E/O).');
      for(const g of groups){ let v=val(g.nums); if('SWO'.includes(g.h!)) v=-Math.abs(v); if('NS'.includes(g.h!)) lat=v; else lon=v; }
      if(lat==null||lon==null) throw new Error('Indiquez une latitude (N/S) et une longitude (E/O).');
    } else {
      if(nums.length%2||nums.length>6||!nums.length) throw new Error('Format non reconnu : saisissez « latitude, longitude ».');
      const k=nums.length/2; lat=val(nums.slice(0,k).map(x=>x.n!)); lon=val(nums.slice(k).map(x=>x.n!));
    }
  }
  if(lat==null||lon==null||!isFinite(lat)||!isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180) throw new Error('Coordonnées hors limites (latitude ±85°, longitude ±180°).');
  return {lat,lon};
}
export function placeMarkerFromInput(){
  let c; try{ c=parseCoords($('markerIn').value); }catch(e){ toast((e as Error).message,true); return; }
  setMarker(c.lat,c.lon);
  const g=geom(st,posterDims().W,posterDims().H), v=viewBounds(st,g.map.h/g.map.w,0);
  const out=c.lat<v.s||c.lat>v.n||c.lon<v.w||c.lon>v.e;
  if(out) goTo(c.lat,c.lon);
  $('markerIn').value=''; $('markerIn').blur();
  toast('Repère placé'+(out?' · carte recentrée':''));
}
/** Indications du panneau Lieu, sur le même modèle pour la ville (centre de la carte) et le lieu de rencontre (repère) :
 *  nom de la ville la plus proche (5 km au plus) parmi les villes proposées et celles choisies par la recherche
 *  (updateMarkerTxt.remember), sinon « Autre lieu », puis les coordonnées ; bouton de la ville proposée en surbrillance */
export function updateMarkerTxt(){
  const all=[...PRESETS.map(p=>({lat:p[1],lon:p[2],name:p[4],sub:p[5],preset:p})),...updateMarkerTxt.places()];
  type Near = {lat: number; lon: number; name: string; sub: string; preset?: unknown};
  const near=({lat,lon}: {lat: number; lon: number})=>{ let best: Near | null=null, bd=5; for(const p of all){ const dy=(lat-p.lat)*111.2, dx=(lon-p.lon)*111.2*Math.cos(lat*Math.PI/180), d=Math.hypot(dx,dy); if(d<bd){ bd=d; best=p; } } return best; };
  const show=(id: string,pt: {lat: number; lon: number},p: Near | null,sub: (p: Near)=>string)=>$(id).replaceChildren(h('b',{},p?p.name:'Autre lieu'),h('span',{className:'sr-only'},', '),h('small',{},p?sub(p):'Hors des villes proposées'),
    h('span',{className:'mono'},`${dms(pt.lat,'N','S')}  ·  ${dms(pt.lon,'E','W')}`));
  const city=near(st.center), mk=near(st.marker);
  show('cityTxt',st.center,city,p=>p.sub||'Ville choisie');
  show('markerTxt',st.marker,mk,p=>city && p.name===city.name?'Dans la ville affichée':'Hors de la ville affichée');
  document.querySelectorAll<HTMLElement>('#presets .chip').forEach((b,i)=>{ const on=!!city && PRESETS[i]===city.preset; b.classList.toggle('on',on); b.setAttribute('aria-pressed',String(on)); });
  $('coordsManual').placeholder=coordText();
}
/** Villes choisies par la recherche (nom, « région • pays », point choisi), gardées dans ce navigateur : 30 au plus, les plus récentes d'abord */
updateMarkerTxt.KEY='cms:places';
updateMarkerTxt.list=null as {lat: number; lon: number; name: string; sub: string}[] | null;
updateMarkerTxt.places=()=>{
  if(!updateMarkerTxt.list){
    let a: any=[]; try{ a=JSON.parse(localStorage.getItem(updateMarkerTxt.KEY)||'[]'); }catch(e){}
    const ok=(p: any)=>p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat)<=90 && Math.abs(p.lon)<=180 && typeof p.name==='string' && p.name.trim();
    updateMarkerTxt.list=(Array.isArray(a)?a:[]).filter(ok).slice(0,30).map((p: any)=>({lat:p.lat,lon:p.lon,name:p.name.slice(0,120),sub:typeof p.sub==='string'?p.sub.slice(0,160):''}));
  }
  return updateMarkerTxt.list;
};
updateMarkerTxt.remember=(lat: number,lon: number,name?: string,sub?: string)=>{
  if(!name) return;
  const l=updateMarkerTxt.places().filter(p=>!(p.name===name && Math.hypot(p.lat-lat,p.lon-lon)<1e-4));
  l.unshift({lat,lon,name,sub:sub||''}); updateMarkerTxt.list=l.slice(0,30);
  try{ localStorage.setItem(updateMarkerTxt.KEY,JSON.stringify(updateMarkerTxt.list)); }catch(e){}
};
