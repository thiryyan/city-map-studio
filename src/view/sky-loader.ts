/* City Map Studio — Chargement à la demande des données du ciel (étoiles, Voie lactée) (extrait de render/poster-sky.ts, #119).
 * Le rendu (src/render) ne charge rien : il lit SKY_DATA et SKY_MW s'ils sont présents, et demande leur chargement par skyLoaders. */
import {loadScript, toast} from '../core/dom.js';
import {drawUnder, refreshCards} from '../core/port.js';
import {skyLoaders} from '../render/poster-sky.js';

// Étoiles (magnitude ≤ 5,5) et constellations : lib/sky/sky-data.js (d3-celestial, BSD-3), chargé à la demande.
let skyLoading: Promise<boolean> | null=null;
export function ensureSky(){ if(globalThis.SKY_DATA) return Promise.resolve(true);
  if(!skyLoading) skyLoading=loadScript('lib/sky/sky-data.js',15000).then(()=>{ drawUnder(); refreshCards(); return true; }).catch((e: Error)=>{ skyLoading=null; toast('Données du ciel indisponibles : '+e.message,true); return false; });
  return skyLoading; }
let mwLoading: Promise<boolean> | null=null;
export function ensureMilkyWay(){ if(globalThis.SKY_MW) return Promise.resolve(true);
  if(!mwLoading) mwLoading=loadScript('lib/sky/milkyway.js',15000).then(()=>{ drawUnder(); return true; }).catch((e: Error)=>{ mwLoading=null; toast('Voie lactée indisponible : '+e.message,true); return false; });
  return mwLoading; }
skyLoaders.sky=()=>{ void ensureSky(); };
skyLoaders.milkyWay=()=>{ void ensureMilkyWay(); };
