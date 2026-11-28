// PosterDoc (#118) : enveloppe versionnée, conversion de l'état nu d'avant le #118, versions futures refusées.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { load, ev } from './load.mjs';

const ctx = await load(['src/content/config.ts', 'src/core/doc/state.ts', 'src/core/doc/poster-doc.ts']);
const J = expr => JSON.parse(JSON.stringify(ev(ctx, expr)));

test('toDoc : enveloppe { schemaVersion: 1, poster }, copie indépendante', () => {
  const d = J("(()=>{ const s=normState({texts:{title:'Blois'}}); const d=toDoc(s); s.texts.title='Autre'; return d; })()");
  assert.equal(d.schemaVersion, 1);
  assert.equal(d.poster.texts.title, 'Blois');
});

test('parseDoc : aller-retour sans perte', () => {
  const same = ev(ctx, "(()=>{ const s=normState({layout:'classic', theme:'nuit', texts:{title:'Tours'}}); return JSON.stringify(parseDoc(toDoc(s)))===JSON.stringify(s); })()");
  assert.equal(same, true);
});

test('parseDoc : état nu (version 0) converti, valeurs forgées corrigées', () => {
  const s = J("parseDoc({texts:{title:'Ancien'}, format:'A0', zoom:'x'})");
  assert.equal(s.texts.title, 'Ancien');
  assert.equal(s.format, 'a4');
  assert.equal(typeof s.zoom, 'number');
});

test('parseDoc : version future refusée, enveloppe invalide refusée', () => {
  assert.throws(() => ev(ctx, "parseDoc({schemaVersion:2, poster:{}})"), /version plus récente/);
  assert.throws(() => ev(ctx, "parseDoc({schemaVersion:1, poster:'x'})"), /document invalide/);
  assert.throws(() => ev(ctx, "parseDoc(null)"), /document invalide/);
  assert.throws(() => ev(ctx, "parseDoc([1])"), /document invalide/);
});
