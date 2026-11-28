/* City Map Studio — Types du rendu de l'affiche (extrait de render/poster.ts, #119). */
import {type LatLon, type Rect, type View} from '../core/geo/geo.js';
/** Contexte de dessin 2D ; options de tracé d'un texte, d'un repère, d'un cartouche (sacs d'options, non typés) */
export type Ctx = CanvasRenderingContext2D;
export type Opts = Record<string, any>;
/** Ligne d'un cartouche : clé de ligne, écart au-dessus (U), style */
export type Row = [string, number, Opts];
/** Planète : nom, éléments orbitaux à J2000 et leur dérive par siècle, magnitude */
export type Planet = [string, number[], number[], number];
/** Vue d'une carte : centre, zoom, repère (l'état de l'affiche, ou l'autre lieu du gabarit Deux lieux) */
export type MapView = View & {marker: LatLon};
/** Dessin de la carte dans un cadre de l'affiche (moteur MapLibre ou Fichier) */
/** Dessin d'un caractère (graphème) à une position */
export type GlyphFn = (g: string, x: number, y: number)=>void;
export type MapFn = (ctx: Ctx, rect: Rect, view: MapView, i: number)=>void;
