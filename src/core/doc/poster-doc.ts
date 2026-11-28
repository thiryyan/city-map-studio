/* City Map Studio — PosterDoc : document d'affiche versionné (#118).
 * Tout ce qui sort de l'application ou y revient (stockage, fichier de configuration, lien partagé, Mes affiches)
 * porte une enveloppe { schemaVersion, poster }. La lecture passe par parseDoc : enveloppe vérifiée (Valibot), puis
 * migrations numérotées jusqu'à la version courante, puis normalisation champ par champ (normState, qui borne,
 * complète et corrige chaque réglage). Version 0 : l'état nu, sans enveloppe, d'avant le #118 (affiches, liens et
 * fichiers déjà enregistrés) ; il est converti, pas refusé (décision du 28/11/2026). */
import * as v from 'valibot';
import type {PosterState} from '../../content/config.js';
import {normState} from './state.js';

const SCHEMA_VERSION = 1;

/** Enveloppe d'un document ; `poster` est vérifié ensuite, champ par champ, par normState */
const DocSchema = v.object({
  schemaVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  poster: v.looseObject({}),
});
type PosterDoc = {schemaVersion: number; poster: PosterState};

/** Migrations : MIGRATIONS[n] passe un contenu de la version n à la version n + 1 */
const MIGRATIONS: Record<number, (poster: Record<string, unknown>) => Record<string, unknown>> = {
  0: poster => poster,   // v0 → v1 : même contenu, désormais dans une enveloppe
};

/** Document versionné de l'état donné (copie) */
function toDoc(poster: PosterState | Omit<PosterState, 'engine'>): PosterDoc {
  return {schemaVersion: SCHEMA_VERSION, poster: JSON.parse(JSON.stringify(poster))};
}

/** État de l'affiche lu dans un document (enveloppe courante ou ancienne, ou état nu de la version 0) ; lève une
 *  erreur pour une version postérieure à celle de l'application ou un contenu inexploitable */
function parseDoc(input: unknown): PosterState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('document invalide');
  let version = 0, poster = input as Record<string, unknown>;
  if ('schemaVersion' in input) {
    const r = v.safeParse(DocSchema, input);
    if (!r.success) throw new Error('document invalide : ' + r.issues[0].message);
    if (r.output.schemaVersion > SCHEMA_VERSION) throw new Error(`document d'une version plus récente (${r.output.schemaVersion}) : mettez l'application à jour`);
    version = r.output.schemaVersion; poster = r.output.poster;
  }
  for (; version < SCHEMA_VERSION; version++) poster = MIGRATIONS[version](poster);
  return normState(poster);
}

export {parseDoc, SCHEMA_VERSION, toDoc};
export type {PosterDoc};
