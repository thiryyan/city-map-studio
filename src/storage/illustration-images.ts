/* City Map Studio — Conservation des illustrations : IndexedDB (ou mémoire), empreinte, export et import avec les fichiers de configuration (extrait de features/illustration.ts, #119). */
import {idb as idbStore} from './db.js';
import {toast} from '../core/dom.js';
import {V, st} from '../core/doc/state.js';
import {MAX_PX, canvasOf, refOf} from '../core/illustration-state.js';
import {IS} from '../core/illustration-state.js';

export const MAX_BYTES=40*1024*1024, MIN_SIDE=64, PREV_SIDE=1600;
// ---------- Conservation : IndexedDB (images binaires), l'état ne garde qu'une référence ----------
// update(_s=>(_s.illus.img = {ref, name, w, h})) : ref = empreinte SHA-256 du fichier importé (64 hexa). L'image ré-encodée (WebP,
// PNG si le navigateur n'encode pas le WebP) est rangée sous cette clé. Base commune « city-map-studio », magasin « images » (src/storage/db.ts, #118).
// Sans IndexedDB (navigation privée stricte, stockage bloqué) : l'image n'est gardée que pendant la visite.
export const REF_RE=/^[0-9a-f]{64}$/, DATA_RE=/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
/** Image rangée (IndexedDB, ou mémoire de la visite) */
export type Rec = {blob: Blob; w: number; h: number; name: string; size: number};
export const memStore=new Map<string, Rec>();
/** Requête sur le magasin des images (base commune) */
export const idb=<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore)=>IDBRequest | void): Promise<T | undefined> => idbStore<T>('images',mode,fn);
export const store={
  async get(ref: string): Promise<Rec | undefined> { try{ const v=await idb<Rec>('readonly',(s: IDBObjectStore)=>s.get(ref)); return v ?? memStore.get(ref); }catch(e){ return memStore.get(ref); } },
  async put(ref: string,rec: Rec){
    memStore.set(ref,rec);
    try{ await idb('readwrite',(s: IDBObjectStore)=>s.put(rec,ref)); memStore.delete(ref);
      if(!IS.persistAsked){ IS.persistAsked=true; navigator.storage?.persist?.().catch(()=>{}); }   // demande d'un stockage persistant
      return true; }
    catch(e){ if(!IS.dbWarned){ IS.dbWarned=true; toast('Stockage du navigateur indisponible : l’illustration ne sera gardée que pendant cette visite',true); } return false; }
  },
  async keys(){ let k: string[]=[]; try{ k=(await idb<string[]>('readonly',(s: IDBObjectStore)=>s.getAllKeys()))||[]; }catch(e){} return [...new Set([...k,...memStore.keys()])]; },
  async del(ref: string){ memStore.delete(ref); try{ await idb('readwrite',(s: IDBObjectStore)=>s.delete(ref)); }catch(e){} }
};
/** Empreinte SHA-256 (hexadécimal) des octets d'un fichier */
export async function sha256(buf: ArrayBuffer){
  const d=new Uint8Array(await crypto.subtle.digest('SHA-256',buf));
  return Array.from(d,x=>x.toString(16).padStart(2,'0')).join('');
}
/** Supprime les images que plus rien n'utilise (affiche en cours, Mes affiches) ; lancé au démarrage et après une suppression */
export async function gc(listSaves: () => {state: Parameters<typeof refOf>[0]}[]){
  const used=new Set([refOf(st),...listSaves().map(e=>refOf(e.state))].filter(Boolean));
  for(const k of await store.keys()) if(!used.has(k)) await store.del(k);
}
export const blobToDataUrl=(b: Blob)=>new Promise<string>((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result as string); r.onerror=()=>rej(r.error); r.readAsDataURL(b); });
/** Images à intégrer dans un fichier : {ref: {data, name, w, h}} (celles qui manquent sont omises) */
export async function exportImages(refs: string[]){
  const out: Record<string, {data: string; name: string; w: number; h: number}>={};
  for(const ref of new Set(refs.filter((r: string)=>REF_RE.test(r)))){ const rec=await store.get(ref); if(rec?.blob) out[ref]={data:await blobToDataUrl(rec.blob), name:rec.name, w:rec.w, h:rec.h}; }
  return out;
}
// Fichiers de configuration et sauvegardes avec illustrations intégrées (src/features/features.ts) : version 2, limites propres
export const FILE=Object.freeze({version:2, cfgMax:60*1024*1024, bakMax:400*1024*1024});
/** Ajoute à un fichier les illustrations de ses affiches (include : case « Inclure les illustrations ») ; renvoie {o, note} */
export async function attachImages(o: Record<string, unknown>, states: Parameters<typeof refOf>[0][], include: boolean){
  const refs=[...new Set(states.map(refOf).filter(Boolean))];
  if(!refs.length || !include) return {o, note:refs.length ? ' · sans les illustrations' : ''};
  const images=await exportImages(refs), n=Object.keys(images).length, missing=refs.length-n, pl=(k: number)=>k>1?'s':'';
  return {o:n ? {...o, version:FILE.version, images} : o,
    note:(n?` · ${n} illustration${pl(n)} incluse${pl(n)}`:'')+(missing?` · ${missing} illustration${pl(missing)} introuvable${pl(missing)} dans ce navigateur`:'')};
}
/** Images lues dans un fichier : chacune décodée puis ré-encodée ; une image déjà présente n'est jamais remplacée.
 *  Renvoie {added, bad} (images ajoutées, images refusées). */
export async function importImages(images: unknown){
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
  if(added){ IS.tried=''; }   // une image arrivée d'un fichier : nouvelle tentative de chargement
  return {added,bad};
}
/** Pixels d'une image décodée dans un canevas (taille bornée par la mémoire) : ré-encodage sans métadonnées */
export function toCanvas(bmp: ImageBitmap){
  const f=Math.min(1, Math.sqrt(MAX_PX/(bmp.width*bmp.height)));
  const full=canvasOf(bmp.width*f,bmp.height*f), x=full.getContext('2d')!; x.imageSmoothingQuality='high'; x.drawImage(bmp,0,0,full.width,full.height);
  return {full, reduced:f<1};
}
export const encode=(c: HTMLCanvasElement)=>new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('encodage impossible')),'image/webp',0.95));
