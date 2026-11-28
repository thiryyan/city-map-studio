/* City Map Studio — Rendu de l'affiche : carte du ciel du jour J (Voie lactée, planètes, Lune) (extrait de render/poster.ts, #119). */
import {st, ui} from '../core/scene.js';
import {D2R, type Rect} from '../core/geo/geo.js';
import {lum} from '../core/color.js';
import {Ctx, Planet} from './poster-types.js';
import {drawText} from './poster-text.js';
import {paint} from './poster-paint.js';
// ---------- Carte du ciel ----------
// Étoiles (magnitude ≤ 5,5) et constellations : lib/sky/sky-data.js (d3-celestial, BSD-3), chargé à la demande.
/** Chargement des données du ciel à la demande : rappels posés par l'application (src/view/sky-loader.ts) ; le rendu lit SKY_DATA et SKY_MW s'ils sont présents */
export const skyLoaders = {sky: (): void => {}, milkyWay: (): void => {}};
/** Instant observé, en ms UTC : date et heure locales du lieu, fuseau choisi (« auto » : celui de l'appareil à cette date) */
export function skyTime(s=st.sky){
  const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(s?.when||''); if(!m) return null;
  const [y,mo,d,h,mi]=m.slice(1).map(Number);
  const tz = s.tz==='auto' || s.tz==null ? -new Date(y,mo-1,d,h,mi).getTimezoneOffset() : +s.tz;
  return Date.UTC(y,mo-1,d,h,mi)-tz*60000;
}
/** Hauteur et azimut (degrés, azimut depuis le nord vers l'est) d'un astre (AD, Déc en degrés) */
export function altAz(ra: number, dec: number, lat: number, lon: number, ms: number){
  const jd=ms/86400000+2440587.5, gmst=280.46061837+360.98564736629*(jd-2451545);
  const H=((gmst+lon-ra)%360)*D2R, d=dec*D2R, p=lat*D2R;
  const alt=Math.asin(Math.sin(p)*Math.sin(d)+Math.cos(p)*Math.cos(d)*Math.cos(H));
  const az=Math.atan2(-Math.sin(H)*Math.cos(d), Math.cos(p)*Math.sin(d)-Math.sin(p)*Math.cos(d)*Math.cos(H));
  return {alt:alt/D2R, az:(az/D2R+360)%360};
}
// ---------- Ciel : Voie lactée, planètes, Lune ----------
const OBLIQ=23.43928*D2R;
/** Coordonnées écliptiques (degrés) → équatoriales {ra, dec} (degrés) */
function eclToEq(lon: number,lat: number){ const l=lon*D2R, b=lat*D2R;
  const ra=Math.atan2(Math.sin(l)*Math.cos(OBLIQ)-Math.tan(b)*Math.sin(OBLIQ),Math.cos(l)), dec=Math.asin(Math.sin(b)*Math.cos(OBLIQ)+Math.cos(b)*Math.sin(OBLIQ)*Math.sin(l));
  return {ra:(ra/D2R+360)%360, dec:dec/D2R}; }
// Éléments képlériens moyens (JPL, E. M. Standish, valables de 1800 à 2050) : a, e, I, L, ϖ, Ω et leurs variations par siècle
const PLANETS: Planet[]=[
  ['Mercure',[0.38709927,0.20563593,7.00497902,252.25032350,77.45779628,48.33076593],[0.00000037,0.00001906,-0.00594749,149472.67411175,0.16047689,-0.12534081],-0.4],
  ['Vénus',[0.72333566,0.00677672,3.39467605,181.97909950,131.60246718,76.67984255],[0.00000390,-0.00004107,-0.00078890,58517.81538729,0.00268329,-0.27769418],-4.2],
  ['Terre',[1.00000261,0.01671123,-0.00001531,100.46457166,102.93768193,0],[0.00000562,-0.00004392,-0.01294668,35999.37244981,0.32327364,0],0],
  ['Mars',[1.52371034,0.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891],[0.00001847,0.00007882,-0.00813131,19140.30268499,0.44441088,-0.29257343],0.5],
  ['Jupiter',[5.20288700,0.04838624,1.30439695,34.39644051,14.72847983,100.47390909],[-0.00011607,-0.00013253,-0.00183714,3034.74612775,0.21252668,0.20469106],-2.2],
  ['Saturne',[9.53667594,0.05386179,2.48599187,49.95424423,92.59887831,113.66242448],[-0.00125060,-0.00050991,0.00193609,1222.49362201,-0.41897216,-0.28867794],0.6]
];
/** Position héliocentrique écliptique (UA) d'une planète, T en siècles juliens depuis J2000 */
function helio(p: Planet,T: number){
  const [a,e,I,L,w,O]=p[1].map((v: number,i: number)=>v+p[2][i]*T), M=((L-w)%360+540)%360-180, om=w-O;
  let E=M*D2R+e*Math.sin(M*D2R); for(let k=0;k<6;k++) E-=(E-e*Math.sin(E)-M*D2R)/(1-e*Math.cos(E));
  const x=a*(Math.cos(E)-e), y=a*Math.sqrt(1-e*e)*Math.sin(E), co=Math.cos(om*D2R), so=Math.sin(om*D2R), cO=Math.cos(O*D2R), sO=Math.sin(O*D2R), cI=Math.cos(I*D2R), sI=Math.sin(I*D2R);
  return [(co*cO-so*sO*cI)*x+(-so*cO-co*sO*cI)*y, (co*sO+so*cO*cI)*x+(-so*sO+co*cO*cI)*y, so*sI*x+co*sI*y];
}
/** Planètes visibles à l'œil nu : nom, {ra, dec}, magnitude indicative */
export function planetsAt(ms: number){
  const T=(ms/86400000+2440587.5-2451545)/36525, E=helio(PLANETS[2],T);
  return PLANETS.filter(p=>p[0]!=='Terre').map(p=>{ const h=helio(p,T), x=h[0]-E[0], y=h[1]-E[1], z=h[2]-E[2];
    return {name:p[0], mag:p[3], ...eclToEq(Math.atan2(y,x)/D2R, Math.atan2(z,Math.hypot(x,y))/D2R)}; });
}
/** Lune et Soleil (précision de l'ordre du degré) : positions, fraction éclairée, croissante ou non */
export function moonSun(ms: number){
  const d=ms/86400000+2440587.5-2451545, r=(x: number)=>x*D2R;
  const L=218.316+13.176396*d, M=134.963+13.064993*d, F=93.272+13.229350*d;
  const lm=L+6.289*Math.sin(r(M)), bm=5.128*Math.sin(r(F));
  const g=357.528+0.9856003*d, ls=280.460+0.9856474*d+1.915*Math.sin(r(g))+0.020*Math.sin(r(2*g));
  const el=Math.acos(Math.cos(r(bm))*Math.cos(r(lm-ls)));
  return {moon:eclToEq(lm,bm), sun:eclToEq(ls,0), frac:(1-Math.cos(el))/2, waxing:((lm-ls)%360+360)%360<180};
}
/** Lune en phase : partie éclairée tournée vers le Soleil (angle `toSun` dans le plan du dessin) */
function drawMoon(ctx: Ctx,x: number,y: number,rad: number,frac: number,toSun: number,ink: string,bg: string){
  ctx.save(); ctx.translate(x,y); ctx.rotate(toSun);
  ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(0,0,rad,0,7); ctx.fill();
  ctx.strokeStyle=ink; ctx.globalAlpha=0.35; ctx.lineWidth=rad*0.08; ctx.stroke(); ctx.globalAlpha=1;
  const rx=rad*Math.abs(2*frac-1);
  ctx.fillStyle=ink; ctx.beginPath(); ctx.arc(0,0,rad,-Math.PI/2,Math.PI/2);
  if(frac>=0.5) ctx.ellipse(0,0,rx,rad,0,Math.PI/2,3*Math.PI/2,false); else ctx.ellipse(0,0,rx,rad,0,Math.PI/2,-Math.PI/2,true);
  ctx.fill(); ctx.restore();
}
export function drawSky(ctx: Ctx, r: Rect, U: number){
  const c=st.colors, dark=lum(c.paper)<0.3, R=r.w/2, cx=r.x+R, cy=r.y+R;
  const bg=dark?c.land:c.text, ink=dark?c.text:c.paper;
  ctx.save(); ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.fill(); ctx.clip();
  const ms=skyTime(), S=globalThis.SKY_DATA;
  if(ms!=null && S){
    const {lat,lon}=st.marker;
    // projection stéréographique centrée sur le zénith : horizon = bord du disque, nord en haut, est à gauche
    const P=(ra: number,dec: number)=>{ const a=altAz(ra,dec,lat,lon,ms), q=Math.tan((90-Math.max(a.alt,-75))*D2R/2)*R, z=a.az*D2R; return {x:cx-q*Math.sin(z), y:cy-q*Math.cos(z), alt:a.alt}; };
    if(st.sky.milky){   // Voie lactée : cinq niveaux superposés, du plus diffus au plus dense
      if(globalThis.SKY_MW){ ctx.save(); ctx.fillStyle=ink; ctx.globalAlpha=0.055;
        for(const lvl of SKY_MW!){ ctx.beginPath(); for(const ring of lvl){ for(let i=0;i<ring.length;i+=2){ const p=P(ring[i],ring[i+1]); i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); } ctx.closePath(); } ctx.fill('evenodd'); }
        ctx.restore(); }
      else if(!ui.thumb) skyLoaders.milkyWay();
    }
    ctx.strokeStyle=ink;
    if(st.sky.grid){ ctx.globalAlpha=0.18; ctx.lineWidth=U*0.0008;
      for(const a of [30,60]){ const q=Math.tan((90-a)*D2R/2)*R; ctx.beginPath(); ctx.arc(cx,cy,q,0,7); ctx.stroke(); }
      for(let k=0;k<8;k++){ const z=k*Math.PI/4; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx-R*Math.sin(z),cy-R*Math.cos(z)); ctx.stroke(); } }
    if(st.sky.lines){ ctx.globalAlpha=0.5; ctx.lineWidth=U*0.0011; ctx.beginPath();
      for(const l of S.lines){ let prev=null; for(const [ra,dec] of l){ const p=P(ra,dec); if(prev && (p.alt>-15 || prev.alt>-15)){ ctx.moveTo(prev.x,prev.y); ctx.lineTo(p.x,p.y); } prev=p; } }
      ctx.stroke(); }
    ctx.globalAlpha=1; ctx.fillStyle=ink;
    for(const [ra,dec,mag] of S.stars){ const p=P(ra,dec); if(p.alt<0) continue;
      const rr=U*0.0016*Math.max(0.6,(6.2-mag)*0.75); ctx.beginPath(); ctx.arc(p.x,p.y,rr,0,7); ctx.fill(); }
    if(st.sky.planets) for(const pl of planetsAt(ms)){ const p=P(pl.ra,pl.dec); if(p.alt<0) continue;
      const rr=U*0.0016*Math.max(0.6,(6.2-pl.mag)*0.75);
      ctx.beginPath(); ctx.arc(p.x,p.y,rr,0,7); ctx.fill(); ctx.save(); ctx.strokeStyle=ink; ctx.lineWidth=U*0.0007; ctx.beginPath(); ctx.arc(p.x,p.y,rr*2.1,0,7); ctx.stroke(); ctx.restore();
      drawText(ctx,pl.name,p.x+rr*2.6,p.y+U*0.003,{size:U*0.0095,italic:true,align:'left',color:ink}); }
    if(st.sky.moon){ const ml=moonSun(ms), p=P(ml.moon.ra,ml.moon.dec);
      if(p.alt>-1){ const s=P(ml.sun.ra,ml.sun.dec); drawMoon(ctx,p.x,p.y,U*0.014,ml.frac,Math.atan2(s.y-p.y,s.x-p.x),ink,bg); } }
  } else if(!S && !ui.thumb) skyLoaders.sky();
  ctx.restore();
  // horizon, points cardinaux
  ctx.strokeStyle=paint(c.frame); ctx.lineWidth=0.0022*U; ctx.beginPath(); ctx.arc(cx,cy,R+0.012*U,0,7); ctx.stroke();
  ctx.lineWidth=0.0008*U; ctx.beginPath(); ctx.arc(cx,cy,R+0.004*U,0,7); ctx.stroke();
  const cs=0.016*U, o=R+0.032*U;
  ([['N',0,-1],['E',-1,0],['S',0,1],['O',1,0]] as [string, number, number][]).forEach(([t,dx,dy])=>drawText(ctx,t,cx+dx*o,cy+dy*o+cs*0.36,{size:cs,align:'center',color:c.text}));
}
