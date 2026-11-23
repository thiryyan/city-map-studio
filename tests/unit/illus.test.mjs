// Mode Illustration (issue #42) : fonctions pures de CMS.illus, sans navigateur
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, ev } from './load.mjs';

const ctx = load(['js/config.js', 'js/maplibre-loader.js', 'js/geocoder.js', 'js/state.js', 'js/geo.js', 'js/illus.js']);
const J = expr => JSON.parse(JSON.stringify(ev(ctx, expr)));
const S = patch => `Object.assign(structuredClone(DEFAULT_STATE), ${patch})`;

test('qualité d\'impression : 1696 × 2528 px → A4 bonne, A3 juste, 50 × 70 insuffisante', () => {
  const q = J(`CMS.illus.quality(${S('{}')},1696,2528)`);
  assert.deepEqual(q.map(f => [f.key, f.dpi, f.grade]), [['a4', 205, 'ok'], ['a3', 145, 'mid'], ['50x70', 86, 'bad']]);
});

test('qualité : zoom (ppp divisés), image entière (côté le moins contraint), agrandissement ×2 (lissage crédité)', () => {
  const z = J(`CMS.illus.quality(${S("{illus:{...DEFAULT_STATE.illus,zoom:200}}")},1696,2528)`);
  assert.equal(z[0].dpi, 103);
  const c = J(`CMS.illus.quality(${S("{illus:{...DEFAULT_STATE.illus,fit:'contain'}}")},1696,2528)`);
  assert.equal(c[0].dpi, 216);
  const u = J(`CMS.illus.quality(${S("{illus:{...DEFAULT_STATE.illus,upscale:true}}")},1696,2528)`);
  assert.deepEqual(u.map(f => f.grade), ['ok', 'ok', 'bad']);
});

test('placement : remplir, contenir, zoom et décalage', () => {
  const I = "{fit:'cover',zoom:100,ox:0,oy:0}";
  assert.deepEqual(J(`CMS.illus.placement(100,200,100,100,${I})`), { x: -50, y: 0, w: 200, h: 200 });
  assert.deepEqual(J(`CMS.illus.placement(100,200,100,100,{fit:'contain',zoom:100,ox:0,oy:0})`), { x: 0, y: 50, w: 100, h: 100 });
  assert.deepEqual(J(`CMS.illus.placement(100,200,100,100,{fit:'contain',zoom:200,ox:0.1,oy:-0.1})`), { x: -40, y: -20, w: 200, h: 200 });
});

test('retouches : neutres par défaut, luminosité, aplats', () => {
  const px = (I, rgb) => J(`Array.from(CMS.illus.processPixels(new Uint8ClampedArray([${rgb},255]), CMS.illus.adjust({...DEFAULT_STATE.illus, ...${I}})).slice(0,3))`);
  assert.deepEqual(px('{}', '10,128,250'), [10, 128, 250]);
  assert.deepEqual(px('{bright:50}', '100,100,100'), [150, 150, 150]);
  assert.deepEqual(px('{flat:true}', '30,100,240'), [51, 102, 255]);
});

test('prompt : interdictions, ville, format, zone du titre, choix imposés, pistes, anglais', () => {
  const p = ev(ctx, `CMS.illus.buildPrompt(${S('{}')})`);
  assert.match(p, /^RÈGLE ABSOLUE/);
  assert.match(p, /AUCUN cadre, marge ou bordure/);
  assert.match(p, /no text, no letters, no title/);
  assert.match(p, /illustration de BLOIS \(Val de Loire • France\)/);
  assert.match(p, /portrait, proportions 1:1,414 \(A4\)/);
  assert.match(p, /EN HAUT \(environ 25 %/);
  assert.match(p, /moment de la journée, saison ou événement, palette/);
  const q = ev(ctx, `CMS.illus.buildPrompt(${S("{orient:'landscape',format:'50x70',illusText:{...DEFAULT_STATE.illusText,pos:'bd'},illus:{...DEFAULT_STATE.illus,prompt:{pistes:['Château royal','La Loire'],moment:'nuit',saison:'hiver',palette:'photo',lang:'fr'}}}")})`);
  assert.match(q, /paysage, proportions 7:5/);
  assert.match(q, /4000 px/);
  assert.match(q, /EN BAS \(environ 25 % de la hauteur\), plutôt à droite/);
  assert.match(q, /PISTES À PRIVILÉGIER \(choisies par moi\) : Château royal, La Loire\./);
  assert.match(q, /IMPOSÉ : moment de la journée : nuit ; saison : hiver ; je te fournirai une photo/);
  assert.match(q, /en partant des pistes ci-dessus/);
  assert.match(q, /questions : éléments à inclure ou à éviter, point de vue\./);
  const e = ev(ctx, `CMS.illus.buildPrompt(${S("{illus:{...DEFAULT_STATE.illus,prompt:{...DEFAULT_STATE.illus.prompt,lang:'en',moment:'couchant'}}}")})`);
  assert.match(e, /^ABSOLUTE RULE/);
  assert.match(e, /FIXED: time of day: sunset\./);
  assert.match(e, /portrait, aspect ratio 1:1\.414 \(A4\)/);
});

test('prompt sans titre : « la ville choisie »', () => {
  const p = ev(ctx, `CMS.illus.buildPrompt(${S("{texts:{...DEFAULT_STATE.texts,title:'  '}}")})`);
  assert.match(p, /illustration de la ville choisie,/);
});

test('normState : mode et réglages de l\'illustration validés', () => {
  const n = J(`normState({mode:'illus',illus:{zoom:150,ox:5,bright:-80,prompt:{pistes:['  Port   de pêche ','Port de pêche',7]}},illusText:{pos:'bd',shadow:'',color:'#abcdef'}})`);
  assert.equal(n.mode, 'illus');
  assert.equal(n.illus.zoom, 150); assert.equal(n.illus.ox, 1); assert.equal(n.illus.bright, -50);
  assert.deepEqual(n.illus.prompt.pistes, ['Port de pêche']);
  assert.equal(n.illusText.pos, 'bd'); assert.equal(n.illusText.shadow, ''); assert.equal(n.illusText.color, '#abcdef');
  assert.equal(J("normState({})").mode, 'map');
});

test('normState : référence de l\'illustration (empreinte SHA-256) validée', () => {
  const ok = 'ab'.repeat(32);
  assert.deepEqual(J(`normState({illus:{img:{ref:'${ok}',name:'blois.png',w:1696.4,h:2528,extra:1}}}).illus.img`), { ref: ok, name: 'blois.png', w: 1696, h: 2528 });
  for (const bad of ["{ref:'AB'.repeat(32)}", "{ref:'ab'.repeat(31)}", "{ref:'<script>'}", "'x'", '42'])
    assert.equal(J(`normState({illus:{img:${bad}}}).illus.img`), null, bad);
  assert.equal(J(`normState({illus:{img:{ref:'${ok}',name:'x'.repeat(500),w:-5,h:1e9}}}).illus.img.name.length`), 120);
  assert.deepEqual(J(`(({w,h})=>[w,h])(normState({illus:{img:{ref:'${ok}',w:-5,h:1e9}}}).illus.img)`), [1, 100000]);
});

test('Carte + illustration : prompt et zone de l\'illustration selon la composition', () => {
  const med = S("{mode:'mix',mix:{compo:'med',shape:'arch',pos:'centre'}}"), vig = S("{mode:'mix',mix:{compo:'vig',shape:'circle',pos:'bas'}}");
  const pm = ev(ctx, `CMS.illus.buildPrompt(${med})`), pv = ev(ctx, `CMS.illus.buildPrompt(${vig})`);
  assert.match(pm, /pour le titre\..*Laisser aussi une zone calme et peu détaillée au centre de l’image.*une arche d’environ 45 %/s);
  assert.match(pv, /petite vignette en forme d’arche/);
  assert.match(pv, /FORMAT : portrait, proportions 3:4/);
  assert.doesNotMatch(pv, /pour le titre/);
  assert.deepEqual(J(`CMS.illus.region(${med})`), { fw: 1, fh: 1 });
  const r = J(`CMS.illus.region(${vig})`);
  assert.ok(r.fw > 0.25 && r.fw < 0.35 && Math.abs(r.fh / r.fw * 1.4142 - 1.34) < 0.02, JSON.stringify(r));
  assert.equal(ev(ctx, `CMS.illus.compoLine(${med})`).startsWith('Laisser une zone calme'), true);
});
