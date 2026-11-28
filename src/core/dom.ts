/* City Map Studio — Socle navigateur (#118) : accès aux éléments, création sans innerHTML, boutons, état et messages,
 * chargement de script. Couche basse : n'importe rien, utilisable par tous les modules. */
/** Élément du document par son id, supposé présent (balisage de index.html). Type par défaut : champ de saisie, le plus
 *  fréquent (value, checked, disabled) ; préciser sinon : $<HTMLCanvasElement>('c'). */
const $=<T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
/** Crée un élément sans innerHTML : h('button', {type:'button', className:'card', dataset:{v:k}, style:{…}}, enfant, 'texte').
 *  Les textes sont insérés comme texte (jamais interprétés) et les styles passent par le CSSOM (compatibles avec la CSP). */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any>={}, ...kids: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const e=document.createElement(tag);
  for(const [k,v] of Object.entries(props)){
    if(k==='dataset') Object.assign(e.dataset,v); else if(k==='style') Object.assign(e.style,v);
    else if(k in e && !k.includes('-')) (e as any)[k]=v; else e.setAttribute(k,v);
  }
  e.append(...kids.filter((x): x is Node | string=>x!=null)); return e;
}
function setSeg(id: string,v: string){ document.querySelectorAll<HTMLElement>(`#${id} button`).forEach(b=>{ const on=b.dataset.v===String(v); b.classList.toggle('on',on);
  if(b.getAttribute('role')==='radio') b.setAttribute('aria-checked',String(on)); else b.setAttribute('aria-pressed',String(on)); }); }
/** État « choisi » d'un bouton de sélection : classe visuelle et état ARIA */
function pressed(b: Element,on: boolean){ b.classList.toggle('on',on); b.setAttribute('aria-pressed',String(on)); }
/** Ligne d'état (voyant sur la scène) : « Prêt » réduit à la pastille ; un message sans gravité s'efface après 4 s ;
 *  chargement, attente et erreur restent écrits tant qu'ils durent. */
function setStatus(t: string,kind?: string,detail?: string){
  $('stTxt').textContent=t; $('stPill').title=$('stTxt').title=detail?t+' — '+detail:t; $('stDot').className='dot'+(kind?' '+kind:'');
  const ready=!kind && /^Prêt/.test(t); clearTimeout(statusT);
  $('stPill').classList.toggle('quiet',ready);
  if(!kind && !ready) statusT=setTimeout(()=>$('stPill').classList.add('quiet'),4000);
}
let toastT=0, statusT=0;
/** Message bref ; `action` {label,fn} ajoute un bouton (ex. « Annuler » après un réglage) et prolonge l'affichage. */
function toast(msg: string,err?: boolean,action?: {label: string; fn: ()=>void}){
  const t=$('toast'); t.textContent=msg;
  if(action){ const b=document.createElement('button'); b.type='button'; b.textContent=action.label;
    b.onclick=()=>{ t.className=''; action.fn(); }; t.append(b); }
  t.className='show'+(err?' err':'')+(action?' act':''); clearTimeout(toastT);
  toastT=setTimeout(()=>t.className='',err?6000:action?5000:3200); }
/** Charge un script local (données du ciel) ; `integrity` (SRI) pour un fichier servi par un tiers */
function loadScript(src: string,ms: number,integrity?: string){
  return new Promise<void>((res,rej)=>{ const sc=document.createElement('script'); sc.src=src; sc.async=true;
    if(integrity){ sc.integrity=integrity; sc.crossOrigin='anonymous'; }
    const t=setTimeout(()=>{sc.remove();rej(new Error('délai dépassé'))},ms);
    sc.onload=()=>{clearTimeout(t);res()}; sc.onerror=()=>{clearTimeout(t);sc.remove();rej(new Error('bloqué'))};
    document.head.appendChild(sc); });
}

export {$, h, loadScript, pressed, setSeg, setStatus, toast};