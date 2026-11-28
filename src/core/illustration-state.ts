/* City Map Studio — État partagé de l'illustration : image importée, étape, pistes, zones de prise (extrait de features/illustration.ts, #119).
 * Un seul objet (IS) tient les variables qui étaient locales à la fermeture du module d'origine ; les couches de rendu, de stockage,
 * de fonctions et d'interface le lisent sans se connaître entre elles. */
import {type Ctx2D, createCanvas} from './canvas.js';
import {CANVAS_MAX_PX, type PosterState} from '../content/config.js';

/** Contexte 2D ; réglages de l'illustration (st.illus) ; sacs d'options */
export type Ctx = Ctx2D;
export type Illus = PosterState['illus'];
export type Opts = Record<string, any>;
/** Image importée : source ré-encodée, copie réduite (aperçu), dimensions, métadonnées, adresse locale (blob) */
export type Img = {full: HTMLCanvasElement; prev: HTMLCanvasElement; w: number; h: number; name: string; size: number; ref: string; url: string | null};
/** Piste du prompt : nom, poids, rang OpenMapTiles, distance au centre (km) */
/** Texte d'une ligne : simple, ou composé de morceaux [texte, options] ; ligne posée dans un bloc */
export type Part = [string, Opts];
export type Txt = string | Part[];
/** Morceaux présents (les lignes vides valent '' ou false) */
export const present=(a: unknown[])=>a.filter(Boolean) as Part[];
export type Piste = {name: string; w: number; rank?: number; d?: number};
export const MAX_PX=Math.min(36e6, CANVAS_MAX_PX*0.6);
/** Image importée, supposée présente (appelants : après ready()) */
export const IMG=()=>IS.img!;
/** Canevas de travail (page : élément canvas ; Worker : OffscreenCanvas, typé comme l'élément : mêmes méthodes utilisées) */
export const canvasOf=(w: number,h: number)=>createCanvas(Math.max(1,Math.round(w)),Math.max(1,Math.round(h))) as HTMLCanvasElement;
export const refOf=(s: {illus?: {img?: {ref: string} | null}} | null | undefined)=>s?.illus?.img?.ref||'';
// ---------- Pistes Wikipédia (#46) : option désactivée par défaut, accord préalable, coordonnées du lieu seulement ----------
export const WIKI_KEY='cms:wiki';

export const IS: {img: Img | null; step: any; found: string[]; grainTex: {land: boolean; c: HTMLCanvasElement} | null; dbWarned: any; persistAsked: any; loading: any; missing: any; tried: any; hitInfo: Opts | null; moreAuto: any; rafU: any; wikiOn: any; wikiBusy: any; layerPref: any; badgeT: any} = {
  img: null,
  step: 'prompt',
  found: [],
  grainTex: null,
  dbWarned: false,
  persistAsked: false,
  loading: '',
  missing: false,
  tried: '',
  hitInfo: null,
  moreAuto: false,
  rafU: 0,
  wikiOn: (()=>{ try{ return localStorage.getItem(WIKI_KEY)==='1'; }catch(e){ return false; } })(),
  wikiBusy: false,
  layerPref: 'map',
  badgeT: 0};
/** Crochets du rendu vers l'interface (le rendu n'importe pas l'interface) : posés par src/ui/illustration-hits.ts */
export const hooks: {note: (ctx: Ctx, PW: number, PH: number, B: Opts, avoid?: Opts | null) => void} = {note: () => {}};
