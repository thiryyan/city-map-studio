/* City Map Studio — Mes affiches : sauvegarde et restauration de la configuration (#118, issu de features.ts). */
import {$, h, toast} from '../core/dom.js';
import {LAYOUTS, PosterState, THEMES} from '../content/config.js';
import {normState, osmData, st, ui, V} from '../core/doc/state.js';
import {applyConfig} from './share.js';
import {applyTexture} from '../view/preview.js';
import {drawPoster} from '../render/poster.js';
import {drawVectors} from '../map/engines.js';
import {slug} from '../core/text.js';
import {showTab} from '../core/port.js';
import {thumbMap} from '../view/thumbnails.js';
// ---------- Mes affiches : sauvegarde et restauration de la configuration ----------
// Sauvegardes nommées dans ce navigateur (localStorage, avec une vignette), fichier de configuration d'une affiche,
// fichier de sauvegarde de toutes les affiches. Tout ce qui est relu (navigateur ou fichier) est validé comme un lien
// partagé : champs connus seulement, normState, tailles bornées ; une restauration est une étape annulable.
// Ne sont pas inclus : le moteur cartographique (choix de l'appareil) et les données importées (fichier OSM).
// Fichiers avec illustrations intégrées : version 2 et limites propres (CMS.illus.FILE) ; la version 1 reste lue.
const SAVES_KEY='cms3.saves', SAVES_MAX=40, CFG_FORMAT='city-map-studio/configuration', BAK_FORMAT='city-map-studio/sauvegardes', CFG_VERSION=1;
const CFG_MAX_BYTES=1024*1024, BAK_MAX_BYTES=16*1024*1024, THUMB_MAX=120*1024;
const THUMB_RE=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
/** État à sauvegarder : copie sans le moteur */
/** Affiche enregistrée dans Mes affiches (état sans le moteur) */
interface Save { id: string; name: string; savedAt: string; state: Omit<PosterState, 'engine'> & {engine?: string}; thumb: string }
function savedState(): Save['state'] { const o=JSON.parse(JSON.stringify(st)); delete o.engine; return o; }
/** Une sauvegarde relue : chaque champ vérifié, l'état normalisé ; null si inexploitable */
function normSave(o: any): Save | null {
  if(!o || typeof o!=='object' || Array.isArray(o) || !o.state || typeof o.state!=='object') return null;
  const t=Date.parse(o.savedAt), state: Save['state']=normState(o.state); delete state.engine;
  return {id:typeof o.id==='string' && /^[a-z0-9]{6,24}$/.test(o.id) ? o.id : newId(),
    name:(V.str(o.name,'',80).trim()||'Sans titre'), savedAt:Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(), state,
    thumb:typeof o.thumb==='string' && o.thumb.length<=THUMB_MAX && THUMB_RE.test(o.thumb) ? o.thumb : ''};
}
function loadSaves(){
  try{ const a=JSON.parse(localStorage.getItem(SAVES_KEY)||'[]'); return Array.isArray(a) ? a.map(normSave).filter((x): x is Save=>!!x).slice(0,SAVES_MAX) : []; }
  catch(e){ return []; }
}
function storeSaves(list: Save[]){
  try{ localStorage.setItem(SAVES_KEY,JSON.stringify(list.slice(0,SAVES_MAX))); }
  catch(e){ throw new Error('espace du navigateur plein : supprimez des affiches ou téléchargez la sauvegarde complète'); }
}
/** Vignette de l'affiche courante (JPEG, ~150 px) : carte réelle avec le moteur Fichier, schématique sinon */
function saveThumb(){
  const land=st.orient==='landscape', cv=document.createElement('canvas'); cv.width=land?212:150; cv.height=land?150:212; const ctx=cv.getContext('2d')!;
  const mapFn=(c: CanvasRenderingContext2D,r: any,view?: any)=> st.engine==='file' && osmData ? drawVectors(c,r,osmData,view) : thumbMap(c,r);
  ui.thumb=true; try{ drawPoster(ctx,cv.width,cv.height,'all',mapFn); applyTexture(ctx,cv.width,cv.height); } finally{ ui.thumb=false; }
  return cv.toDataURL('image/jpeg',0.8);
}
const defaultSaveName=()=>[st.texts.title,st.texts.names].map(s=>(s||'').trim()).filter(Boolean).join(' · ')||'Mon affiche';
/** Enregistre l'affiche courante ; une sauvegarde du même nom est mise à jour (elle remonte en tête de liste) */
function saveCurrent(name: string){
  name=(name||'').trim().slice(0,80)||defaultSaveName();
  const list=loadSaves(), i=list.findIndex(x=>x.name.toLowerCase()===name.toLowerCase());
  const entry={id:i>=0?list[i].id:newId(), name, savedAt:new Date().toISOString(), state:savedState(), thumb:saveThumb()};
  if(i>=0) list.splice(i,1);
  if(i<0 && list.length>=SAVES_MAX){ toast(`${SAVES_MAX} affiches au plus : supprimez-en une d'abord`,true); return false; }
  try{ storeSaves([entry,...list]); }catch(e){ toast('Enregistrement impossible : '+(e as Error).message,true); return false; }
  renderSaves(); toast(i>=0 ? `« ${name} » mise à jour` : `« ${name} » enregistrée dans Mes affiches`); return true;
}
function restoreSave(id: string){
  const e=loadSaves().find(x=>x.id===id); if(!e) return;
  try{ applyConfig(e.state,`« ${e.name} » restaurée · « Annuler » pour revenir`); }catch(err){ toast('Restauration impossible : '+(err as Error).message,true); }
}
function deleteSave(id: string){ const l=loadSaves(), e=l.find(x=>x.id===id); if(!e) return;
  try{ storeSaves(l.filter(x=>x.id!==id)); }catch(err){ toast((err as Error).message,true); return; }
  renderSaves(); toast(`« ${e.name} » supprimée`); CMS.illus.gc().catch(()=>{}); }
/** Téléchargement d'un fichier JSON (aucun envoi : lien local vers un Blob) */
function downloadJson(obj: unknown,file: string){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,1)],{type:'application/json'})); a.download=file;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
const configOf=(name: string,state: Save['state'],savedAt?: string)=>({format:CFG_FORMAT, version:CFG_VERSION, app:'City Map Studio', name, savedAt:savedAt||new Date().toISOString(), state});
async function downloadConfig(entry: Save | null){
  const c = entry ? configOf(entry.name,entry.state,entry.savedAt) : configOf(defaultSaveName(),savedState());
  const {o,note}=await CMS.illus.attachImages(c,[c.state],$('cfgImg').checked);
  downloadJson(o,`affiche-${slug(c.name)}.json`); toast('Configuration téléchargée'+note);
}
async function downloadBackup(){
  const saves=loadSaves(); if(!saves.length){ toast('Aucune affiche enregistrée à sauvegarder',true); return; }
  const {o,note}=await CMS.illus.attachImages({format:BAK_FORMAT, version:CFG_VERSION, app:'City Map Studio', savedAt:new Date().toISOString(), saves},saves.map(e=>e.state),$('cfgImg').checked);
  downloadJson(o, `mes-affiches-${new Date().toISOString().slice(0,10)}.json`);
  toast(`${saves.length} affiche${saves.length>1?'s':''} sauvegardée${saves.length>1?'s':''} dans un fichier`+note);
}
/** Ouvre un fichier : configuration d'une affiche (appliquée), sauvegarde complète (fusionnée dans Mes affiches),
 *  ou état brut (ancien format). Tout le reste est refusé sans rien modifier. */
async function importConfigFile(file: File){
  try{
    const F=CMS.illus.FILE;
    if(file.size>F.bakMax) throw new Error('fichier trop volumineux');
    let o: any; try{ o=JSON.parse(await file.text()); }catch(e){ throw new Error('ce n\'est pas un fichier JSON'); }
    if(!o || typeof o!=='object' || Array.isArray(o)) throw new Error('contenu invalide');
    // Sans illustration, les limites habituelles ; avec, des limites propres (images vérifiées une à une)
    const hasImg=!!o.images && typeof o.images==='object' && !Array.isArray(o.images);
    if(file.size>(o.format===BAK_FORMAT ? (hasImg?F.bakMax:BAK_MAX_BYTES) : (hasImg?F.cfgMax:CFG_MAX_BYTES))) throw new Error('fichier trop volumineux');
    const newer=typeof o.version==='number' && o.version>F.version ? ' (créé par une version plus récente : réglages inconnus ignorés)' : '';
    let imgMsg='';
    if(hasImg){ const r=await CMS.illus.importImages(o.images); imgMsg=(r.added?` · ${r.added} illustration${r.added>1?'s':''} ajoutée${r.added>1?'s':''}`:'')+(r.bad?` · ${r.bad} illustration${r.bad>1?'s':''} illisible${r.bad>1?'s':''} ignorée${r.bad>1?'s':''}`:''); }
    if(o.format===BAK_FORMAT){
      if(!Array.isArray(o.saves)) throw new Error('sauvegarde sans affiches');
      const list=loadSaves(), seen=new Set(list.map(x=>x.id+'|'+x.savedAt)); let added=0, full=false;
      for(const raw of o.saves.slice(0,1000)){ const e=normSave(raw); if(!e || seen.has(e.id+'|'+e.savedAt)) continue;
        if(list.length>=SAVES_MAX){ full=true; break; }
        if(list.some(x=>x.id===e.id)) e.id=newId();
        list.push(e); seen.add(e.id+'|'+e.savedAt); added++; }
      list.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)); storeSaves(list); renderSaves();
      toast(`${added} affiche${added>1?'s':''} ajoutée${added>1?'s':''} à Mes affiches`+(full?` · limite de ${SAVES_MAX} atteinte`:'')+imgMsg+newer);
      return;
    }
    const state = o.format===CFG_FORMAT ? o.state : (o.texts && o.layout ? o : null);   // état brut : ancien format
    if(!state || typeof state!=='object' || Array.isArray(state)) throw new Error('fichier non reconnu (ni configuration, ni sauvegarde City Map Studio)');
    applyConfig(state,`Configuration « ${V.str(o.name,'',80).trim()||file.name} » ouverte · « Annuler » pour revenir`+imgMsg+newer);
  }catch(e){ toast('Ouverture impossible : '+(e as Error).message,true); }
}
const LAYOUT_NAME=(k: string)=>(LAYOUTS.find(l=>l[0]===k)||[,''])[1];
function renderSaves(){
  const box=$('savesList'); if(!box) return; box.textContent='';
  const list=loadSaves(); $('savesEmpty').hidden=list.length>0; $('bSavesBackup').disabled=!list.length;
  const fmt=new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'});
  for(const e of list){
    const del=h('button',{type:'button',className:'btn sm','aria-label':`Supprimer « ${e.name} »`,title:'Supprimer'},'✕');
    del.onclick=()=>{ if(!del.classList.contains('confirm')){ del.classList.add('confirm'); del.textContent='Supprimer ?'; setTimeout(()=>{ if(del.isConnected){ del.classList.remove('confirm'); del.textContent='✕'; } },4000); return; } deleteSave(e.id); };
    const res=h('button',{type:'button',className:'btn sm pri','aria-label':`Restaurer « ${e.name} »`},'Restaurer'); res.onclick=()=>restoreSave(e.id);
    const dl=h('button',{type:'button',className:'btn sm','aria-label':`Télécharger « ${e.name} »`,title:'Télécharger le fichier'},'⤓'); dl.onclick=()=>downloadConfig(e);
    const th=e.thumb ? h('img',{src:e.thumb,alt:'',width:56,height:79}) : h('span',{className:'nothumb','aria-hidden':'true'});
    box.append(h('li',{className:'save'},th,h('div',{className:'meta'},h('b',{},e.name),h('small',{},`${fmt.format(new Date(e.savedAt))} · `+(e.state.mode==='illus' ? 'Affiche illustrée' : e.state.mode==='mix' ? 'Carte + illustration' : `${LAYOUT_NAME(e.state.layout)} · ${THEMES[e.state.theme]?.name||''}`))),h('div',{className:'acts'},res,dl,del)));
  }
}
/** Mes affiches : section Sauvegarde de l'onglet Export (nom proposé, liste à jour, champ du nom sélectionné) */
function openSaves(){ $('saveName').value=defaultSaveName(); renderSaves(); showTab('export'); CMS.panelScroll.to($('savesTitle')); setTimeout(()=>$('saveName').focus({preventScroll:true}),50); }
function initSaves(){
  renderSaves();
  CMS.on('tab:export',()=>{ if(!$('saveName').value.trim()) $('saveName').value=defaultSaveName(); renderSaves(); });
  $('saveForm').onsubmit=e=>{ e.preventDefault(); saveCurrent($('saveName').value); };
  $('bCfgExport').onclick=()=>downloadConfig(null); $('bSavesBackup').onclick=downloadBackup;
  $('cfgIn').onchange=e=>{ const f=(e.target as HTMLInputElement).files![0]; if(f) importConfigFile(f); (e.target as HTMLInputElement).value=''; };
  addEventListener('storage',e=>{ if(e.key===SAVES_KEY) renderSaves(); });   // autre onglet
  addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase()==='s'){ e.preventDefault(); saveCurrent(defaultSaveName()); } });
}

export {BAK_MAX_BYTES, CFG_MAX_BYTES, configOf, defaultSaveName, deleteSave, downloadBackup, downloadConfig, downloadJson, importConfigFile, initSaves, LAYOUT_NAME, loadSaves, newId, normSave, openSaves, renderSaves, restoreSave, saveCurrent, savedState, SAVES_KEY, SAVES_MAX, saveThumb, storeSaves, THUMB_RE};
