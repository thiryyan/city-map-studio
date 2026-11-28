/* City Map Studio — Partage par lien et application d'une configuration (#118, issu de features.ts). */
import {$, toast} from '../core/dom.js';
import {PosterState} from '../content/config.js';
import {normState, replaceState, SHARE_MAX_BYTES, SHARE_MAX_CHARS, st} from '../core/doc/state.js';
import {commitHistory} from '../core/doc/history.js';
import {drawTexture, layoutPreview, redrawAll, scheduleOver} from '../view/preview.js';
import {loadFonts} from '../render/fonts.js';
import {goTo, renderPlaces} from './places.js';
import {renderRoute} from './gpx.js';
import {refreshCards, setPlacing, syncInputs} from '../core/port.js';
// ---------- Partage par lien ----------
// L'état de l'affiche (sans le moteur, ni un itinéraire long) est compressé dans l'ancre de l'adresse (#a=…) :
// rien n'est envoyé à un serveur ; le lien contient le lieu et les textes.
const b64u={enc:(b: Uint8Array)=>{ let s=''; for(const x of b) s+=String.fromCharCode(x); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); },
  dec:(t: string)=>{ const s=atob(t.replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(s,c=>c.charCodeAt(0)); }};
/** Passe des octets dans un flux de (dé)compression ; au-delà de `max` octets produits, abandonne (lien piégé) */
async function pipeBytes(bytes: Uint8Array,stream: CompressionStream | DecompressionStream,max=Infinity){
  const reader=new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader() as ReadableStreamDefaultReader<Uint8Array>, parts: Uint8Array[]=[]; let n=0;
  for(;;){ const {done,value}=await reader.read(); if(done) break;
    n+=value.length; if(n>max){ reader.cancel().catch(()=>{}); throw new Error('contenu trop volumineux'); }
    parts.push(value); }
  const out=new Uint8Array(n); let o=0; for(const p of parts){ out.set(p,o); o+=p.length; } return out;
}
async function encodeShare(){
  const o=JSON.parse(JSON.stringify(st)); delete o.engine; let dropped=false;
  if(o.route && o.route.pts.length>400){ o.route=null; dropped=true; }
  const raw=new TextEncoder().encode(JSON.stringify(o));
  const data=window.CompressionStream ? 'z'+b64u.enc(await pipeBytes(raw,new CompressionStream('deflate-raw'))) : 'j'+b64u.enc(raw);
  return {url:location.href.split('#')[0]+'#a='+data, dropped};
}
async function decodeShare(t: string){
  if(t.length>SHARE_MAX_CHARS) throw new Error('lien trop long');
  const kind=t[0], bytes=b64u.dec(t.slice(1));
  const raw = kind==='z' ? await pipeBytes(bytes,new DecompressionStream('deflate-raw'),SHARE_MAX_BYTES) : bytes;
  if(raw.length>SHARE_MAX_BYTES) throw new Error('contenu trop volumineux');
  const o=JSON.parse(new TextDecoder().decode(raw));
  if(!o || typeof o!=='object' || Array.isArray(o)) throw new Error('contenu invalide');
  return o;
}
async function shareLink(){
  try{ const {url,dropped}=await encodeShare(); $('shareOut').value=url; $('shareBox').hidden=false; $('shareOut').select();
    let ok=false; try{ await navigator.clipboard.writeText(url); ok=true; }catch(e){}
    toast((ok?'Lien copié':'Copiez le lien affiché')+(dropped?' · itinéraire non inclus (trop long)':'')+(st.illus.img?' · l\'illustration n\'est pas dans le lien : le destinataire devra l\'importer':'')); }
  catch(e){ toast('Lien impossible : '+(e as Error).message,true); }
}
async function loadFromHash(){
  const m=/^#a=([zj][A-Za-z0-9_-]+)$/.exec(location.hash); if(!m) return;
  try{ applyConfig(await decodeShare(m[1]),'Affiche chargée depuis le lien · « Annuler » pour retrouver la vôtre'); }
  catch(e){ toast('Lien d\'affiche illisible : '+(e as Error).message,true); }
  finally{ history.replaceState(null,'',location.pathname+location.search); }
}
/** Applique une configuration venue de l'extérieur (lien, fichier, sauvegarde) : validée champ par champ (normState),
 *  le moteur courant est gardé, étape d'historique annulable ; en cas d'erreur, l'affiche précédente revient intacte. */
function applyConfig(o: unknown,msg?: string){
  let before: PosterState | null=null;
  try{
    commitHistory(0);
    const eng=st.engine, fresh=normState(o); before=structuredClone(st);
    replaceState(fresh,{engine:eng});
    setPlacing(false); syncInputs(); renderPlaces(); renderRoute(); layoutPreview(); loadFonts().then(()=>{ scheduleOver(); refreshCards(); }); goTo(st.center.lat,st.center.lon,st.zoom); redrawAll(true); drawTexture();
    commitHistory(); if(msg) toast(msg);
  }catch(e){
    if(before){ replaceState(before); try{ syncInputs(); layoutPreview(); }catch(_){} commitHistory(); }   // jamais d'état à moitié appliqué
    throw e;
  }
}

export {applyConfig, b64u, decodeShare, encodeShare, loadFromHash, pipeBytes, shareLink};
