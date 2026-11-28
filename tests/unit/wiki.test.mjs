// Pistes Wikipédia (issue #46) : validation de la réponse et classement par notoriété, sans réseau.
// tests/wiki_blois.json : réponse réelle de fr.wikipedia.org (generator=geosearch, 3 km autour de Blois, 100 articles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load, ev } from './load.mjs';

const ctx = await load(['js/config.js', 'js/maplibre-loader.js', 'js/geocoder.js', 'js/wiki.js']);
const BLOIS = readFileSync(new URL('../wiki_blois.json', import.meta.url), 'utf8');
const J = expr => JSON.parse(JSON.stringify(ev(ctx, expr)));

test('Blois : le château et la cathédrale en tête ; communes, cantons, département et gare écartés', () => {
  const r = J(`CMS.wiki.rankWiki(CMS.wiki.sanitize(${BLOIS}), {lat:47.5861, lon:1.3359}, {city:'Blois'})`);
  assert.deepEqual(r.slice(0, 2), ['Château de Blois', 'Cathédrale Saint-Louis de Blois']);
  assert.equal(r.length, 6);
  for (const bad of ['Blois', 'Loir-et-Cher', 'Vineuil (Loir-et-Cher)', 'Vineuil', 'Saint-Gervais-la-Forêt', 'Arrondissement de Blois', 'Canton de Blois-1', 'Gare de Blois - Chambord'])
    assert.ok(!r.includes(bad), `${bad} écarté`);
});

test('réponse validée : textes tronqués, nombres invalides ignorés, réponse vide, réponse inattendue', () => {
  const s = J(`CMS.wiki.sanitize({query:{pages:[{title:'  A  b ', length:-3, langlinkscount:'x', description:7, coordinates:[{lat:99,lon:1}]}, {title:''}, {missing:true,title:'X'}]}})`);
  assert.deepEqual(s, [{ title: 'A b', length: 0, langs: 0, desc: '', lat: null, lon: null, index: 999 }]);
  assert.deepEqual(J(`CMS.wiki.sanitize({batchcomplete:true})`), []);
  assert.throws(() => ev(ctx, `CMS.wiki.sanitize({query:{pages:'x'}})`), /réponse inattendue/);
  // Disambiguïsation retirée, doublons fusionnés
  const r = J(`CMS.wiki.rankWiki([{title:"Hôtel d'Épernon (Blois)", length:5000, langs:0, desc:'hôtel particulier'}, {title:"Hôtel d'Épernon", length:100, langs:0, desc:''}], {lat:0,lon:0})`);
  assert.deepEqual(r, ["Hôtel d'Épernon"]);
});

test('requête : seules les coordonnées (arrondies) et le rayon sont transmis', () => {
  const u = new URL(ev(ctx, `CMS.wiki.requestUrl(47.586123456, 1.335987654, 25000).href`));
  assert.equal(u.host, 'fr.wikipedia.org');
  assert.equal(u.searchParams.get('ggscoord'), '47.5861|1.3360');
  assert.equal(u.searchParams.get('ggsradius'), '10000');
  assert.equal(u.searchParams.get('origin'), '*');
  assert.deepEqual([...u.searchParams.keys()].sort(), ['action', 'colimit', 'format', 'formatversion', 'generator', 'ggscoord', 'ggslimit', 'ggsradius', 'origin', 'prop']);
});
