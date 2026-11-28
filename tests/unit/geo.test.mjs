// Tests unitaires sans navigateur : node --test 'tests/unit/*.test.mjs' (aussi lancés par tests/unit.py, donc par la CI)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, ev } from './load.mjs';

const ctx = await load(['js/config.js', 'js/maplibre-loader.js', 'js/geocoder.js', 'js/state.js', 'js/geo.js']);
const J = expr => JSON.parse(JSON.stringify(ev(ctx, expr)));   // valeurs copiées hors du contexte vm (autre royaume)

test('CMS.define : définition unique, module figé', () => {
  assert.throws(() => ev(ctx, "CMS.define('geo', () => ({}))"), /déjà défini/);
  assert.equal(ev(ctx, 'Object.isFrozen(CMS.geo)'), true);
  assert.equal(ev(ctx, "(()=>{ 'use strict'; try{ CMS.geo.merc=null; return false; }catch(e){ return true; } })()"), true);
});

test('CMS.on / CMS.emit : abonnement, détail, désabonnement', () => {
  assert.deepEqual(J("(()=>{ const got=[]; const off=CMS.on('t',d=>got.push(d)); CMS.emit('t',1); off(); CMS.emit('t',2); return got; })()"), [1]);
});

test('Mercator : aller-retour et projection du centre', () => {
  assert.ok(Math.abs(ev(ctx, 'CMS.geo.imerc(CMS.geo.merc(47.5861))') - 47.5861) < 1e-12);
  const v = '{center:{lat:47.5,lon:1.3},zoom:14}', r = '{x:0,y:0,w:800,h:1000}';
  assert.deepEqual(J(`CMS.geo.project(47.5,1.3,${r},${v})`), { x: 400, y: 500 });
  const back = J(`(()=>{ const p=CMS.geo.project(47.6,1.4,${r},${v}); return CMS.geo.unproject(p.x,p.y,${r},${v}); })()`);
  assert.ok(Math.abs(back.lat - 47.6) < 1e-9 && Math.abs(back.lon - 1.4) < 1e-9);
});

test('zoomFactor borné entre 0,5 et 2', () => {
  assert.deepEqual(J('[10,12,14,16,20].map(CMS.geo.zoomFactor)'), [0.5, 0.5, 1, 2, 2]);
});

test('dms : arrondis et hémisphères', () => {
  assert.equal(ev(ctx, "CMS.geo.dms(47.5861,'N','S')"), '47° 35′ 10.0″ N');
  assert.equal(ev(ctx, "CMS.geo.dms(1.99999,'E','W')"), '2° 00′ 00.0″ E');
  assert.equal(ev(ctx, "CMS.geo.dms(-73.9855,'E','W')"), '73° 59′ 07.8″ W');
});

test('exportSpec : A4 300 DPI, paysage, grand format borné par CANVAS_MAX_PX', () => {
  assert.deepEqual(J("CMS.geo.exportSpec({...DEFAULT_STATE,format:'a4',orient:'portrait'})"), { key: 'a4', name: 'A4', dpi: 300, W: 2480, H: 3508, mm: [210, 297] });
  const l = J("CMS.geo.exportSpec({...DEFAULT_STATE,format:'a4',orient:'landscape'})");
  assert.equal(l.W, 3508); assert.equal(l.H, 2480);
  const big = J("CMS.geo.exportSpec({...DEFAULT_STATE,format:'50x70'})");
  assert.ok(big.W * big.H <= ev(ctx, 'CANVAS_MAX_PX') && big.dpi <= 300 && big.dpi % 10 === 0);
});

test('normState : valeurs invalides remplacées, champs inconnus ignorés', () => {
  const s = J("normState({zoom:'x', center:{lat:999,lon:0}, engine:'evil', colors:{land:'red'}, inject:'<script>'})");
  const d = J('DEFAULT_STATE');
  assert.equal(s.zoom, d.zoom); assert.deepEqual(s.center, d.center); assert.equal(s.engine, d.engine);
  assert.equal(s.colors.land, d.colors.land); assert.equal('inject' in s, false);
});

test('CMS.geocoder.sanitize : coordonnées invalides écartées, textes tronqués', () => {
  const r = J(`CMS.geocoder.sanitize([{lat:'48.85',lon:'2.29',name:'Tour',display_name:'Tour, Paris'},{lat:'abc',lon:'2'},
    {lat:'89',lon:'0'},{lat:'1',lon:'1',display_name:'x'.repeat(500)}])`);
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].lat, r[0].lon, r[0].name], [48.85, 2.29, 'Tour']);
  assert.equal(r[1].display.length, 300);
  assert.throws(() => ev(ctx, 'CMS.geocoder.sanitize({})'), /inattendue/);
});
