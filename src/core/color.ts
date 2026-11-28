/* City Map Studio — Couleurs (#118) : luminance et contraste (WCAG), teintes dérivées. Fonctions pures. */
function lum(hex: string){ const n=parseInt(hex.slice(1),16), f=(v: number)=>{ v/=255; return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4; }; return 0.2126*f(n>>16&255)+0.7152*f(n>>8&255)+0.0722*f(n&255); }
function contrast(a: string,b: string){ const x=lum(a), y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); }

/** Teinte assombrie (f : part de noir) ou éclaircie (f : part de blanc) */
const shade=(hex: string,f: number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-f)).toString(16).padStart(2,'0')).join('');
const tint=(hex: string,f: number)=>'#'+[1,3,5].map(i=>{ const v=parseInt(hex.slice(i,i+2),16); return Math.round(v+(255-v)*f).toString(16).padStart(2,'0'); }).join('');
/** Mélange de deux teintes (t : part de b) */
const mix=(a: string,b: string,t: number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');

export {contrast, lum, mix, shade, tint};
