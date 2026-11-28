/* City Map Studio — Documents enregistrés (#118) : affiche en cours, Mes affiches, historique (#16).
 * Lecture au démarrage (loadStorage, avant boot) ; enregistrement à chaque « state:saved » (après 300 ms de calme,
 * src/core/doc/state.ts) et à chaque étape figée (« state:commit », src/core/doc/history.ts) ; historique enregistré
 * à chaque « history:changed ». Les écritures sont asynchrones ; un miroir synchrone (dernier contenu enregistré)
 * sert à Mes affiches et à la façade de test. Sans IndexedDB : la visite fonctionne, rien n'est gardé. */
import type {PosterState} from '../content/config.js';
import {parseDoc, toDoc} from '../core/doc/poster-doc.js';
import {st} from '../core/doc/state.js';
import {hist, histSnap} from '../core/doc/history.js';
import {dbGet, dbPut} from './db.js';
import {migrateLegacy} from './migrate.js';

/** Historique enregistré : instantanés (JSON) de l'affiche en cours */
type HistRec = {cur: string; past: string[]; future: string[]};
const mirror: {current: string | null; saves: unknown[]} = {current: null, saves: []};
let ready = false, histT = 0;

/** Ouvre le stockage, migre les données d'avant le #118, relit l'affiche en cours, Mes affiches et l'historique */
async function loadStorage(): Promise<{doc: PosterState | null; history: HistRec | null}> {
  let doc: PosterState | null = null, history: HistRec | null = null;
  try { await migrateLegacy(); } catch (e) {}
  try { const d = await dbGet('documents', 'current'); if (d) doc = parseDoc(d); } catch (e) { doc = null; }
  try { const s = await dbGet<{list: unknown[]}>('documents', 'saves'); mirror.saves = Array.isArray(s?.list) ? s!.list : []; } catch (e) {}
  try { const h = await dbGet<HistRec>('history', 'current'); if (h && typeof h.cur === 'string' && Array.isArray(h.past) && Array.isArray(h.future)) history = h; } catch (e) {}
  if (doc) mirror.current = JSON.stringify(doc);
  ready = true;
  return {doc, history};
}
/** Enregistre l'affiche en cours (le moteur n'en fait pas partie à la relecture : normState le recalcule) */
function saveCurrent(){
  if (!ready) return;
  mirror.current = JSON.stringify(st);
  dbPut('documents', 'current', toDoc(st)).catch(() => {});
}
/** Mes affiches : liste brute enregistrée (chaque entrée est normalisée à la lecture, src/features/saves.ts) */
const savedList = (): unknown[] => mirror.saves;
/** Enregistre Mes affiches ; en cas d'échec (stockage plein ou indisponible), la liste précédente est rétablie */
async function storeSavedList(list: unknown[]){
  const prev = mirror.saves; mirror.saves = list;
  try { await dbPut('documents', 'saves', {list}); } catch (e) { mirror.saves = prev; throw e; }
}
/** Historique de l'affiche en cours, enregistré peu après chaque changement des piles */
function saveHistory(){
  clearTimeout(histT);
  histT = setTimeout(() => { if (ready && hist.cur) dbPut('history', 'current', {cur: hist.cur, past: hist.past, future: hist.future}).catch(() => {}); }, 400) as unknown as number;
}
/** Historique relu, s'il correspond à l'affiche relue (sinon il est abandonné) */
function adoptHistory(h: HistRec | null){
  if (!h || h.cur !== histSnap()) return false;
  hist.past = h.past.slice(-50); hist.future = h.future.slice(-50); hist.cur = h.cur;
  return true;
}
CMS.on('state:saved', saveCurrent);
CMS.on('state:commit', saveCurrent);
CMS.on('history:changed', saveHistory);

/** Façade de test : dernier état enregistré (JSON), comme l'ancienne clé cms3.affiche */
const savedCurrent = () => mirror.current;

export {adoptHistory, loadStorage, saveCurrent, savedCurrent, savedList, storeSavedList};
export type {HistRec};
