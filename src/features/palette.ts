/* City Map Studio — Couleurs d'après une image (#77) (#118, issu de features.ts). */
import {$, h, setSeg, toast} from '../core/dom.js';
import {Colors} from '../content/config.js';
import {changed} from '../view/preview.js';
import {contrast, lum, mix} from '../core/color.js';
import {st} from '../core/doc/state.js';
import {cmpSnap, noteChange} from './compare.js';
import {refreshColors} from '../core/port.js';
// ---------- Couleurs d'après une image : photo ou illustration importée (#77) ----------
// L'image est lue et réduite sur l'appareil (aucune adresse ni envoi) ; seules ses couleurs sont gardées.
// Une seule entrée, onglet Style, pour les trois types d'affiche : la même palette donne la version claire ou sombre.
/** Couleurs dominantes (k-moyennes, 6 groupes, départ aux quantiles de luminance : résultat reproductible) : [{hex, n}] */
function paletteOf(D: ArrayLike<number>, K=6): {hex: string; n: number}[] {
  const px: number[][]=[]; for(let i=0;i<D.length;i+=4) if(D[i+3]>=128) px.push([D[i],D[i+1],D[i+2]]);
  if(px.length<K) return [];
  const Y=(p: number[])=>0.299*p[0]+0.587*p[1]+0.114*p[2]; px.sort((a,b)=>Y(a)-Y(b));
  let C=Array.from({length:K},(_,i)=>[...px[Math.floor((i+0.5)/K*px.length)]]), cnt: number[]=[];
  for(let it=0;it<12;it++){
    const S=C.map(()=>[0,0,0]); cnt=C.map(()=>0);
    for(const p of px){ let b=0, bd=1e9; C.forEach((q,j)=>{ const d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2; if(d<bd){ bd=d; b=j; } }); S[b][0]+=p[0]; S[b][1]+=p[1]; S[b][2]+=p[2]; cnt[b]++; }
    C=C.map((q,j)=>cnt[j]?S[j].map(v=>v/cnt[j]):q);
  }
  const hex=(q: number[])=>'#'+q.map((v: number)=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
  return C.map((q,j)=>({hex:hex(q),n:cnt[j]})).filter(p=>p.n>0).sort((a,b)=>b.n-a.n);
}
/** Thème tiré d'une palette : papier (couleur la plus claire, ou la plus sombre), encre opposée, accents saturés pour l'eau, les parcs et le repère */
function photoTheme(pal: {hex: string; n: number}[], dark: boolean): Colors {
  const sat=(x: string)=>{ const v=[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)), M=Math.max(...v), m=Math.min(...v); return M?(M-m)/M:0; };
  const byL=[...pal].sort((a,b)=>lum(a.hex)-lum(b.hex)), lo=byL[0].hex, hi=byL[byL.length-1].hex;
  const acc=[...pal].sort((a,b)=>sat(b.hex)*Math.sqrt(b.n)-sat(a.hex)*Math.sqrt(a.n)), a1=acc[0].hex, a2=(acc[1]||acc[0]).hex;
  const paper = dark ? mix(lo,'#000000',0.55) : mix(hi,'#FFFFFF',0.75), ink = dark ? mix(hi,'#FFFFFF',0.5) : mix(lo,'#000000',0.35);
  let marker=a1; for(let i=0;i<4 && contrast(marker,paper)<2.6;i++) marker=mix(marker,ink,0.3);
  const c: Colors={paper, land:paper, water:mix(a1,paper,0.5), park:mix(a2,paper,0.72), building:mix(ink,paper,0.88),
    roadMajor:ink, roadMinor:mix(ink,paper,0.35), path:mix(ink,paper,0.62), rail:mix(ink,paper,0.62), text:ink, frame:mix(marker,ink,0.2), marker};
  for(const k of Object.keys(c) as (keyof Colors)[]) c[k]=c[k].toUpperCase();
  return c;
}

CMS.define('palette', () => {
  let photoPal: {hex: string; n: number}[] | null=null, photoSrc='photo';
  /** Couleurs dominantes d'une image (bitmap, canevas ou image), réduite à 80 px de côté */
  function paletteOfImage(src: CanvasImageSource, iw: number, ih: number){
    const k=Math.min(1,80/Math.max(iw,ih)), w=Math.max(1,Math.round(iw*k)), hh=Math.max(1,Math.round(ih*k));
    const cv=document.createElement('canvas'); cv.width=w; cv.height=hh; const c=cv.getContext('2d',{willReadFrequently:true})!; c.drawImage(src,0,0,w,hh);
    return paletteOf(c.getImageData(0,0,w,hh).data);
  }
  /** Nouvelle palette (src : 'photo' | 'illus') : nuancier affiché, version claire appliquée */
  function setImagePalette(pal: {hex: string; n: number}[], src: string){
    if(!pal || !pal.length){ toast('Aucune couleur exploitable dans cette image.',true); return; }
    photoPal=pal; photoSrc=src;
    const sw=$('photoSw'); sw.textContent=''; pal.forEach(p=>sw.append(h('i',{style:{background:p.hex}})));
    $('photoNote').textContent=src==='illus' ? 'Couleurs tirées de l\'illustration importée : papier, textes et carte s\'y accordent.' : 'La photo reste sur votre appareil : seules ses couleurs sont gardées.';
    $('photoPal').hidden=false; apply('light');
  }
  async function importPhotoPalette(file: Blob){
    let bmp: ImageBitmap;
    try{ bmp=await createImageBitmap(file); }catch(e){ toast('Image illisible : choisissez une photo JPEG, PNG ou WebP.',true); return; }
    const pal=paletteOfImage(bmp,bmp.width,bmp.height); if(bmp.close) bmp.close();
    setImagePalette(pal,'photo');
  }
  /** Palette de l'illustration importée (modes illustrés) */
  function illusPalette(){
    const im=CMS.illus.previewImage();
    if(!im){ toast('Importez d\'abord votre illustration (onglet Illustration, étape Image).',true); return; }
    setImagePalette(paletteOfImage(im,im.width,im.height),'illus');
  }
  function apply(v: string){
    if(!photoPal) return;
    const before=cmpSnap();
    st.colors=photoTheme(photoPal,v==='dark'); setSeg('photoSeg',v);
    noteChange(before,{theme:true}); refreshColors(); changed({all:true,cards:true});
    toast((photoSrc==='illus' ? 'Couleurs tirées de l\'illustration' : 'Palette de la photo appliquée')+' · « Annuler » pour revenir');
  }
  return {fromFile:importPhotoPalette, fromIllus:illusPalette, apply};
});

export {paletteOf, photoTheme};
