/* City Map Studio — Mise en page de l'affiche (#118, issu de src/core/geo/geo.ts) : rectangle ou cercle de la carte et
 * zone des textes selon le gabarit ; dépend de la mesure des textes du cartouche (src/render/poster.ts). */
import {CART_ROWS, cartDed, souvenirFoot} from './poster.js';
import {Geom, Rect, TextArea} from '../core/geo/geo.js';
import {PosterState} from '../content/config.js';
// U : unité de mise en page = petit côté de l'affiche (2480 px à l'export A4, en portrait comme en paysage).
// Renvoie : map (cadre de la carte interactive), places (une ou deux vues : {rect, view}), sky (disque du ciel),
// text (zone du cartouche : cx, maxW, y0, avail, mode 'top' | 'bottom' | 'center').
function geom(s: PosterState, W: number, H: number): Geom {
  const U=Math.min(W,H), m=U*s.margin/100, land=W>H, lay=s.layout;
  const below=(r: Rect, gap: number): TextArea=>{ const y0=r.y+r.h+gap*U; return {cx:W/2,maxW:W-2*m-0.04*U,y0,avail:H-y0-0.6*m-0.01*U,mode:'top'}; };
  const g={m,U,land,lay} as Geom;
  // Mode Illustration : pas de carte (cadre vide, aucune vue) ; l'image couvre l'affiche (CMS.illus.draw)
  if(s.mode==='illus'){ g.illus={x:0,y:0,w:W,h:H}; g.map={x:0,y:0,w:0,h:0}; g.places=[]; return g; }
  // Carte + illustration : médaillon (illustration pleine page, carte dans une forme) ou vignette (carte encadrée, illustration en arche)
  if(s.mode==='mix'){
    const M=s.mix||{}; g.mix=CMS.illusConf.COMPOS.includes(M.compo) ? M.compo : 'med';
    const gap=0.012*U;   // filet couleur papier entre illustration et carte
    if(g.mix==='med'){
      const d=(land?H:W)*0.45, sh=M.shape||'circle', h=sh==='heart' ? d*0.92 : sh==='arch' ? d*1.2 : d;
      const y=M.pos==='haut' ? H*0.24 : M.pos==='centre' ? (H-h)/2 : H-h-H*0.12;
      g.illus={x:0,y:0,w:W,h:H}; g.map={x:(W-d)/2,y,w:d,h,shape:sh};
    } else if(g.mix==='hb'){   // illustration en haut (moitié ou deux tiers), carte en bas
      const f=M.split==='two' ? 2/3 : 0.5; g.illus={x:0,y:0,w:W,h:H*f}; g.map={x:0,y:H*f+gap,w:W,h:H-H*f-gap};
    } else if(g.mix==='cote'){   // côte à côte (affiche en paysage) : illustration à gauche, carte à droite
      const w=(W-gap)/2; g.illus={x:0,y:0,w,h:H}; g.map={x:w+gap,y:0,w,h:H};
    } else if(g.mix==='fondu'){   // la carte émerge du bas de l'illustration (dégradé)
      g.illus={x:0,y:0,w:W,h:H}; g.map={x:0,y:H*0.58,w:W,h:H*0.42,fade:true};
    } else {
      const band=0.24*U; g.map={x:m,y:m,w:W-2*m,h:H-2*m-band};
      let w=(land?0.22:0.3)*W; const pad=0.035*U; w=Math.min(w,(g.map.h-2*pad)/1.34);
      g.illus={x:W-m-pad-w,y:m+pad,w,h:w*1.34,shape:'arch'}; g.band={y:g.map.y+g.map.h,h:H-m-(g.map.y+g.map.h)};
    }
    // zone des textes : l'illustration (le haut de l'affiche pour le fondu) ; la vignette a sa bande
    g.textArea=g.mix==='fondu' ? {x:0,y:0,w:W,h:H*0.58} : g.illus;
    g.places=[{rect:g.map,view:s,main:true}]; g.map.circle=g.map.shape==='circle';
    return g;
  }
  if(!land){
    switch(lay){
      case 'classic': g.map={x:m,y:m,w:W-2*m,h:H-2*m-0.36*U}; g.text=below(g.map,0.014); break;
      case 'fade': g.map={x:0,y:0,w:W,h:H*0.80}; g.text={cx:W/2,maxW:W-2*m-0.04*U,y0:H-m-0.345*U,avail:0.56*U,mode:'bottom'}; break;
      case 'medallion': { const d=W-2*m-0.12*U; g.map={x:(W-d)/2,y:m+0.075*U,w:d,h:d,shape:'circle'}; g.text=below(g.map,0.02); break; }
      case 'heart': { const d=W-2*m-0.10*U; g.map={x:(W-d)/2,y:m+0.05*U,w:d,h:d*0.92,shape:'heart'}; g.text=below(g.map,0.025); break; }
      case 'arch': g.map={x:m+0.03*U,y:m+0.02*U,w:W-2*m-0.06*U,h:H-2*m-0.40*U,shape:'arch'}; g.text=below(g.map,0.02); break;
      case 'travel': g.map={x:0,y:0,w:W,h:H-0.42*U}; g.box={x:m,y:g.map.h,w:W-2*m,h:H-g.map.h-m}; break;
      case 'polaroid': { const p=Math.max(m,0.07*U); g.map={x:p,y:p,w:W-2*p,h:W-2*p}; g.text=below(g.map,0.02); break; }
      case 'sky': { const d=0.62*U; g.sky={x:(W-d)/2,y:m+0.04*U,w:d,h:d,shape:'circle'};
        g.map={x:m,y:g.sky.y+d+0.045*U,w:W-2*m,h:0.20*U}; g.text=below(g.map,0.01); break; }
      case 'typo': g.map={x:m,y:m,w:W-2*m,h:H-2*m-0.30*U}; g.text=below(g.map,0.012); break;
      case 'diptych': { const hM=(H-2*m-0.10*U-0.15*U-0.20*U)/2;
        const a={x:m,y:m+0.10*U,w:W-2*m,h:hM}, b={x:m,y:a.y+hM+0.075*U,w:W-2*m,h:hM};
        g.rects=[a,b]; g.title={y:m+0.07*U}; g.labels=[a.y+hM+0.045*U,b.y+hM+0.045*U]; g.text=below(b,0.07); break; }
      default: g.map={x:m,y:m+0.104*U,w:W-2*m,h:H-2*m-0.214*U};
    }
  } else {
    // Paysage : la carte (ou le ciel) à gauche, le texte en colonne à droite, centré verticalement
    const col=(x: number): TextArea & {x: number, w: number}=>{ const cx0=x+0.05*U, cw=W-m-cx0; return {cx:cx0+cw/2,maxW:cw,y0:m,avail:H-2*m,mode:'center',x:cx0,w:cw}; };
    switch(lay){
      case 'fade': g.map={x:0,y:0,w:W*0.64,h:H}; break;
      case 'travel': g.map={x:0,y:0,w:W*0.6,h:H}; break;
      case 'medallion': case 'heart': { const d=H-2*m-0.06*U; g.map={x:m+0.03*U,y:(H-d*(lay==='heart'?0.92:1))/2,w:d,h:d*(lay==='heart'?0.92:1),shape:lay==='heart'?'heart':'circle'}; break; }
      case 'arch': g.map={x:m,y:m,w:W*0.6-m,h:H-2*m,shape:'arch'}; break;
      case 'polaroid': { const p=Math.max(m,0.07*U), d=H-2*p; g.map={x:p,y:p,w:d,h:d}; break; }
      case 'sky': { const d=H-2*m; g.sky={x:m,y:m,w:d,h:d,shape:'circle'}; const t=col(g.sky.x+d);
        g.map={x:t.x,y:m,w:t.w,h:0.40*U}; g.text={...t,y0:g.map.y+g.map.h+0.01*U,avail:H-m-(g.map.y+g.map.h+0.01*U),mode:'top'}; break; }
      case 'typo': g.map={x:m,y:m,w:W-2*m,h:H-2*m-0.30*U}; g.text=below(g.map,0.012); break;
      case 'diptych': { const gap=0.05*U, w=(W-2*m-gap)/2, h=H-2*m-0.10*U-0.22*U;
        const a={x:m,y:m+0.10*U,w,h}, b={x:m+w+gap,y:a.y,w,h};
        g.rects=[a,b]; g.title={y:m+0.07*U}; g.labels=[a.y+h+0.045*U,a.y+h+0.045*U];
        g.text={cx:W/2,maxW:W-2*m,y0:a.y+h+0.07*U,avail:H-m-(a.y+h+0.07*U),mode:'top'}; break; }
      default: g.map={x:m,y:m,w:W*0.6-m,h:H-2*m};
    }
    if(!g.text && !g.box && lay!=='diptych'){ const t=col(g.map.x+g.map.w); if(lay==='travel'){ g.box={x:t.x,y:m,w:t.w,h:H-2*m}; } else g.text=t; }
  }
  // Dédicace sur deux lignes : la carte cède la hauteur de la deuxième ligne quand le texte est sous la carte et que
  // la place n'y est pas déjà (Souvenir : pied ; Cadre, Arche, Lettres : cartouche). Ailleurs, le cartouche a la marge nécessaire.
  if(lay==='souvenir' && !land){ const ex=souvenirFoot(W,U,m).extra*U; g.map.h-=ex; }
  else if(!land && g.text && ['classic','arch','typo'].includes(lay)){ const ex=cartDed(CART_ROWS,g.text.maxW/U).extra*U; g.map.h-=ex; g.text.y0-=ex; g.text.avail+=ex; }
  if(g.rects){ g.map=g.rects[s.active||0]; g.places=[{rect:g.rects[s.active||0],view:s,main:true},{rect:g.rects[1-(s.active||0)],view:s.place2||s}]; }
  else g.places=[{rect:g.map,view:s,main:true}];
  g.map.circle=g.map.shape==='circle';
  return g;
}

export {geom};
