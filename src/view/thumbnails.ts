/* City Map Studio — src/view/thumbnails (#118). */
import {Rect} from '../core/geo/geo.js';
import {drawPoster} from '../render/poster.js';
import {st} from '../core/doc/state.js';
import {withState} from '../core/doc/store.js';
const thumbMap=(c: CanvasRenderingContext2D,r: Rect)=>{ c.strokeStyle=st.colors.roadMinor; c.globalAlpha=.35; c.lineWidth=.5; for(let i=0;i<14;i++){c.beginPath();c.moveTo(r.x+i*7,r.y);c.lineTo(r.x+i*7-20,r.y+r.h);c.stroke();c.beginPath();c.moveTo(r.x,r.y+i*8);c.lineTo(r.x+r.w,r.y+i*8+6);c.stroke()} c.globalAlpha=1; c.fillStyle=st.colors.water; c.fillRect(r.x,r.y+r.h*0.45,r.w,r.h*0.08); };
function thumb(cv: HTMLCanvasElement,patch: Record<string, unknown>){ const land=st.orient==='landscape'; if(cv.width!==(land?99:70)){ cv.width=land?99:70; cv.height=land?70:99; }
  const ctx=cv.getContext('2d')!; withState(patch,()=>{ drawPoster(ctx,cv.width,cv.height,'all',thumbMap); drawPoster(ctx,cv.width,cv.height,'over'); }); }
/** Exécute fn avec un état provisoirement modifié (vignettes) */
/** Vignettes : drawPoster lit l'état global ; il est modifié le temps d'un rendu SYNCHRONE puis rétabli.
 *  Une fonction asynchrone rendrait la main avec l'état modifié : elle est refusée. */

export {thumb, thumbMap};