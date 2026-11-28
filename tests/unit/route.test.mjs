// Itinéraire préparé avec une IA (issue #85) : fonctions pures de CMS.route, sans navigateur
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, ev } from './load.mjs';

const ctx = await load(['js/config.js', 'js/maplibre-loader.js', 'js/geocoder.js', 'js/state.js', 'js/geo.js', 'js/route.js']);
const J = expr => JSON.parse(JSON.stringify(ev(ctx, expr)));
const S = patch => `Object.assign(structuredClone(DEFAULT_STATE), ${patch})`;
const TWO = S("{markerLabel:'Rencontre', markers2:[{lat:47.5856,lon:1.3311,label:'Château'}], texts:{...DEFAULT_STATE.texts,date:'14 juin 2019'}}");

test('prompt : ville, lieux et coordonnées, type de parcours, emprise, déroulement, format strict', () => {
  const p = ev(ctx, `CMS.route.buildRoutePrompt(${TWO})`);
  assert.match(p, /affiche souvenir de BLOIS \(Val de Loire • France\) \(date : 14 juin 2019\)/);
  assert.match(p, /1\. Rencontre : 47\.586100, 1\.335900/);
  assert.match(p, /2\. Château : 47\.585600, 1\.331100/);
  assert.match(p, /balade à pied, qui suit les rues/);
  assert.match(p, /Emprise de la carte de l'affiche : latitude de 47\.\d{6} à 47\.\d{6}, longitude de 1\.\d{6} à 1\.\d{6}\. Le tracé doit rester à l'intérieur\./);
  assert.match(p, /Aller simple/);
  assert.match(p, /10 étapes au plus/);
  assert.match(p, /attends ma validation/);
  assert.match(p, /GPX 1\.1 valide/);
  assert.match(p, /un <wpt lat="…" lon="…"><name>…<\/name><\/wpt> par étape/);
  assert.match(p, /de 50 à 400 <trkpt/);
  assert.match(p, /SEULEMENT le XML, dans un unique bloc de code/);
  assert.match(p, /REPLI : .*<rte>/);
  const b = J(`CMS.route.mapBounds(${TWO})`);
  assert.ok(b.s < 47.5861 && b.n > 47.5861 && b.w < 1.3359 && b.e > 1.3359, 'emprise autour du centre');
});

test('prompt : réglages (lieu décoché, étapes libres, boucle, vélo, plusieurs villes, anglais)', () => {
  const p = ev(ctx, `CMS.route.buildRoutePrompt(${TWO}, {kind:'bike', loop:true, off:[0], extra:'Pont Jacques-Gabriel,   puis la Loire', lang:'fr'})`);
  assert.doesNotMatch(p, /Rencontre/);
  assert.match(p, /1\. Château : 47\.585600/);
  assert.match(p, /trajet à vélo/);
  assert.match(p, /« Pont Jacques-Gabriel, puis la Loire »/);
  assert.match(p, /Parcours en boucle/);
  const t = ev(ctx, `CMS.route.buildRoutePrompt(${TWO}, {kind:'trip', loop:false, off:[], extra:'', lang:'fr'})`);
  assert.match(t, /tronçons en ligne droite entre deux villes sont admis/);
  assert.match(t, /indicative : la carte sera recadrée/);
  const e = ev(ctx, `CMS.route.buildRoutePrompt(${TWO}, {kind:'car', loop:false, off:[], extra:'', lang:'en'})`);
  assert.match(e, /keepsake poster of BLOIS/);
  assert.match(e, /car journey \(road trip\)/);
  assert.match(e, /ONLY the XML, in a single code block/);
  assert.match(e, /1\. Rencontre : 47\.586100, 1\.335900/);
  // Le prompt suit l'état : zoom changé → emprise changée
  const z = ev(ctx, `CMS.route.buildRoutePrompt(${S('{zoom:12}')})`);
  assert.notEqual(z, ev(ctx, `CMS.route.buildRoutePrompt(${S('{}')})`));
});

test('extractGpx : réponse complète d\'une IA (phrases, bloc ```xml), dernier bloc, erreurs claires', () => {
  const gpx = '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="47.58" lon="1.33"/><trkpt lat="47.59" lon="1.34"/></trkseg></trk></gpx>';
  const reply = `Voici le tracé demandé :\n\n\`\`\`xml\n<?xml version="1.0" encoding="UTF-8"?>\n${gpx}\n\`\`\`\n\nBonne balade !`;
  const x = ev(ctx, `CMS.route.extractGpx(${JSON.stringify(reply)})`);
  assert.match(x, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<gpx version="1\.1"/);
  assert.match(x, /<\/gpx>$/);
  assert.doesNotMatch(x, /Bonne balade|```|Voici/);
  const two = ev(ctx, `CMS.route.extractGpx(${JSON.stringify('<gpx><wpt lat="1" lon="1"/></gpx> corrigé : ' + gpx)})`);
  assert.match(two, /trkpt/);
  assert.throws(() => ev(ctx, `CMS.route.extractGpx('Je ne peux pas produire de fichier.')`), /aucun bloc GPX trouvé dans le texte collé/);
  assert.throws(() => ev(ctx, `CMS.route.extractGpx('<gpx version="1.1"><trk><trkseg><trkpt lat="1" lon="2"/>')`), /GPX incomplet/);
});

test('contrôle de vraisemblance : tracé loin du lieu, tronçons rectilignes, tracé correct', () => {
  const near = [];
  for (let i = 0; i <= 60; i++) near.push([47.5861 + i * 0.0001, 1.3359 + i * 0.0001]);   // ~800 m, points tous les ~14 m
  assert.deepEqual(J(`CMS.route.routeChecks(${JSON.stringify(near)}, ${S('{}')}, 'walk')`), []);
  const far = J(`CMS.route.routeChecks([[47.5861,1.3359],[47.5865,1.3362],[47.9,1.9]], ${S('{}')}, 'walk')`);
  assert.deepEqual(far.map(x => x.code), ['far', 'straight']);
  assert.ok(far[0].km > 50 && far[0].km < 60, `≈ 53 km : ${far[0].km}`);
  const straight = J(`CMS.route.routeChecks([[47.5861,1.3359],[47.5861,1.3559]], ${S('{}')}, 'walk')`);
  assert.deepEqual(straight.map(x => x.code), ['straight']);
  assert.ok(straight[0].km > 1.4 && straight[0].km < 1.6);
  // Voyage en plusieurs villes : lignes droites admises ; voiture : 1,5 km n'est pas un tronçon rectiligne suspect
  assert.deepEqual(J(`CMS.route.routeChecks([[47.5861,1.3359],[48.85,2.35]], ${S('{}')}, 'trip')`), []);
  assert.deepEqual(J(`CMS.route.routeChecks([[47.5861,1.3359],[47.5861,1.3559]], ${S('{}')}, 'car')`), []);
});

test('état : routePrompt et étapes du GPX validés par normState', () => {
  const n = J(`normState(${S("{routePrompt:{kind:'avion',loop:'oui',off:[0,0,7,2],extra:42,lang:'de'}, route:{name:'x',pts:[[47,1],[47.1,1.1]],wpts:[{lat:47,lon:1,name:'Départ'},{lat:999,lon:1}]}}")})`);
  assert.deepEqual(n.routePrompt, { kind: 'walk', loop: false, off: [0, 2], extra: '', lang: 'fr' });
  assert.deepEqual(n.route.wpts, [{ lat: 47, lon: 1, name: 'Départ' }]);
  assert.equal(J(`normState(${S('{}')})`).route, null);
});
