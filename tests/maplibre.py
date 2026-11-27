"""e2e : moteur 1 (MapLibre embarqué dans lib/ + OpenFreeMap simulé).

Sert l'application en HTTP local, comme GitHub Pages, et simule OpenFreeMap :
la TileJSON https://tiles.openfreemap.org/planet est interceptée et pointe vers
des tuiles vectorielles (schéma OpenMapTiles) générées à la volée à partir de
tests/osm.json. Tout autre accès réseau externe est coupé : on vérifie
donc aussi que MapLibre se charge depuis lib/ sans CDN.

Vérifie : chargement local de la librairie, validité du style (filtres
MapLibre 4.7.1), réception des tuiles, export hors écran (événement idle,
maxCanvasSize) en PNG 2480 × 3508 à 300 DPI, et que la carte exportée n'est
pas vide (présence de l'eau et des axes noirs).
Dépendance : pip install mapbox-vector-tile
"""
import warnings; warnings.filterwarnings('ignore', category=DeprecationWarning)
import pathlib, os, json, math, struct, threading, asyncio, zlib, re
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import mapbox_vector_tile
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import polygonize, unary_union, transform
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent).resolve()   # site testé : source, ou dist/ (CI)
CHROME = os.environ.get('CHROME') or None
R = 6378137.0
def m(lon, lat): return (math.radians(lon) * R, math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R)
mproj = lambda x, y, z=None: m(x, y)

HW = {'motorway': 'motorway', 'trunk': 'trunk', 'primary': 'primary', 'secondary': 'secondary', 'tertiary': 'tertiary',
      'residential': 'minor', 'living_street': 'minor', 'unclassified': 'minor', 'service': 'service',
      'footway': 'path', 'path': 'path', 'cycleway': 'path', 'steps': 'path', 'pedestrian': 'path', 'track': 'track'}

def load_features():
    d = json.load(open(T / 'osm.json'))
    L = {k: [] for k in ['water', 'waterway', 'transportation', 'building', 'park']}
    ll = lambda g: [(p['lon'], p['lat']) for p in g]
    for e in d['elements']:
        t = e.get('tags', {})
        if e['type'] == 'relation' and t.get('natural') == 'water':
            outer = [LineString(ll(mm['geometry'])) for mm in e['members'] if mm['role'] == 'outer']
            inner = [Polygon(ll(mm['geometry'])) for mm in e['members'] if mm['role'] == 'inner']
            poly = unary_union(list(polygonize(unary_union(outer))))
            for i in inner: poly = poly.difference(i)
            L['water'].append((transform(mproj, poly), {'class': 'river'}))
            continue
        if e['type'] != 'way': continue
        pts = ll(e['geometry'])
        if 'highway' in t and t['highway'] in HW:
            L['transportation'].append((transform(mproj, LineString(pts)), {'class': HW[t['highway']]}))
        elif t.get('railway') == 'rail':
            L['transportation'].append((transform(mproj, LineString(pts)), {'class': 'rail'}))
        elif t.get('waterway') in ('river', 'canal', 'stream'):
            L['waterway'].append((transform(mproj, LineString(pts)), {'class': t['waterway'], **({'name': 'La Loire'} if t['waterway'] == 'river' else {})}))
        elif 'building' in t:
            L['building'].append((transform(mproj, Polygon(pts)), {}))
        elif t.get('leisure') == 'park':
            L['park'].append((transform(mproj, Polygon(pts)), {'class': 'park'}))
    # Éléments nommés (pistes du prompt des modes illustrés, issue #45) : un château, une cathédrale, un musée
    lat0, lon0 = 47.5861, 1.3359
    L['poi'] = [(Point(m(lon0 + 0.002, lat0 + 0.003)), {'class': 'castle', 'name': 'Château royal de Blois', 'rank': 1}),
                (Point(m(lon0 - 0.004, lat0 + 0.005)), {'class': 'place_of_worship', 'name': 'Cathédrale Saint-Louis', 'rank': 3}),
                (Point(m(lon0 + 0.006, lat0 - 0.001)), {'class': 'museum', 'name': 'Maison de la magie', 'rank': 8})]
    return L
FEATS = load_features()

def tile_bounds(z, x, y):
    n = 2 ** z; size = 2 * math.pi * R / n; o = math.pi * R
    return (x * size - o, o - (y + 1) * size, (x + 1) * size - o, o - y * size)

def make_tile(z, x, y):
    b = tile_bounds(z, x, y); pad = (b[2] - b[0]) * 0.05
    clip = box(b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad)
    layers = []
    for name, fs in FEATS.items():
        out = []
        for g, props in fs:
            if not g.intersects(clip): continue
            c = g.intersection(clip)
            if c.is_empty: continue
            out.append({'geometry': c.wkt, 'properties': props})
        if out: layers.append({'name': name, 'features': out})
    if not layers: return b''
    return mapbox_vector_tile.encode(layers, default_options={'quantize_bounds': b, 'extents': 4096, 'y_coord_down': False})

STATS = {'tiles': 0}
class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        mt = re.match(r'^/__tiles/(\d+)/(\d+)/(\d+)\.pbf$', self.path)
        if not mt: return super().do_GET()
        data = make_tile(*map(int, mt.groups())); STATS['tiles'] += 1
        self.send_response(200); self.send_header('Content-Type', 'application/x-protobuf')
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Content-Length', str(len(data)))
        self.end_headers(); self.wfile.write(data)

def png_stats(path):
    """Décode le PNG (RGBA 8 bits, non entrelacé) et compte les pixels proches de l'eau et des axes."""
    data = open(path, 'rb').read(); pos = 8; w = h = 0; idat = b''
    while pos < len(data):
        ln, typ = struct.unpack('>I4s', data[pos:pos + 8]); body = data[pos + 8:pos + 8 + ln]
        if typ == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', body[:10])
        if typ == b'IDAT': idat += body
        pos += 12 + ln
    raw = zlib.decompress(idat); bpp = 4; stride = w * bpp
    prev = bytearray(stride); water = dark = 0; i = 0
    for row in range(h):
        f = raw[i]; line = bytearray(raw[i + 1:i + 1 + stride]); i += 1 + stride
        for k in range(stride):
            a = line[k - bpp] if k >= bpp else 0; bb = prev[k]; c = prev[k - bpp] if k >= bpp else 0
            if f == 1: line[k] = (line[k] + a) & 255
            elif f == 2: line[k] = (line[k] + bb) & 255
            elif f == 3: line[k] = (line[k] + (a + bb) // 2) & 255
            elif f == 4:
                p = a + bb - c; pa, pb, pc = abs(p - a), abs(p - bb), abs(p - c)
                line[k] = (line[k] + (a if pa <= pb and pa <= pc else bb if pb <= pc else c)) & 255
        if row % 4 == 0:
            for k in range(0, stride, bpp * 4):
                r_, g_, b_ = line[k], line[k + 1], line[k + 2]
                if abs(r_ - 0xC9) < 8 and abs(g_ - 0xD9) < 8 and abs(b_ - 0xDE) < 8: water += 1
                if r_ < 40 and g_ < 40 and b_ < 40: dark += 1
        prev = line
    return w, h, water, dark

async def main():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(H, directory=str(ROOT)))
    port = srv.server_address[1]; threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{port}'
    tilejson = json.dumps({'tilejson': '3.0.0', 'tiles': [base + '/__tiles/{z}/{x}/{y}.pbf'], 'minzoom': 0, 'maxzoom': 14,
                           'vector_layers': [{'id': k} for k in [*FEATS, 'landcover']]})
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for name, vp, mobile in [('mobile', {'width': 390, 'height': 844}, True), ('desktop', {'width': 1400, 'height': 900}, False)]:
            ctx = await b.new_context(viewport=vp, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
            page = await ctx.new_page(); logs = []; ext = []
            await page.add_init_script("try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.advOpen','1');localStorage.setItem('cms3.styleMoreOpen','1');localStorage.setItem('cms3.themeOpen','1');localStorage.setItem('cms3.welcomed','1')}catch(e){}")  # accord préalable donné (cf. tests/consent.py)
            page.on('console', lambda mm: logs.append(f'{mm.type}: {mm.text}'))
            page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
            async def route(r):
                u = r.request.url
                if u.startswith(base): await r.continue_()
                elif u.startswith('https://tiles.openfreemap.org/planet'):
                    await r.fulfill(status=200, content_type='application/json', body=tilejson, headers={'Access-Control-Allow-Origin': '*'})
                else: ext.append(u); await r.abort()
            await page.route('**/*', route)
            STATS['tiles'] = 0
            await page.goto(base + '/index.html?test')
            await wait_js(page, "__cms && __cms.mlLib==='ok'", timeout=15000)
            await wait_js(page, "document.querySelector('#stTxt').textContent.startsWith('Prêt')", timeout=30000)
            await page.screenshot(path=str(T / f'ml-{name}.png'))
            print(name, '| engine', await page.evaluate('__cms.st.engine'), '| status', await page.inner_text('#stTxt'), '| tuiles servies', STATS['tiles'])
            await page.click('#bDiag'); await page.wait_for_timeout(2500)
            diag = await page.inner_text('#diag')
            print('  diag MapLibre :', 'copie locale (lib/)' in diag)
            async with page.expect_download(timeout=90000) as dl:
                await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
            d = await dl.value; path = str(T / f'ml-export-{name}.png'); await d.save_as(path)
            data = open(path, 'rb').read(); i = data.find(b'pHYs')
            w, h, water, dark = png_stats(path)
            print('  export', d.suggested_filename, w, h, 'pHYs', struct.unpack('>IIB', data[i + 4:i + 13]) if i > 0 else None,
                  '| pixels eau', water, '| pixels axes', dark)
            ml_ext = [u for u in ext if 'maplibre' in u]
            print('  requêtes CDN MapLibre :', len(ml_ext))
            errs = [l for l in logs if 'PAGEERROR' in l or ('MapLibre' in l and 'warn' in l)]
            print('  erreurs :', errs[:10])
            assert w == 2480 and h == 3508 and water > 1000 and dark > 200 and not ml_ext and not [l for l in logs if 'PAGEERROR' in l]
            csp = [l for l in logs if 'Content Security Policy' in l]
            print('  violations CSP :', csp[:3]); assert not csp, csp
            if name == 'desktop':
                # Effets de tracé avec le moteur Vectoriel GPU : style, motif de hachures fourni à la demande, export
                await page.evaluate("['hatch','outline','pencil'].forEach(k=>{ const i=document.querySelector(`[data-k=\"fx.${k}\"]`); i.checked=true; i.dispatchEvent(new Event('input')); })")
                await wait_js(page, "__cms.mlMap.isStyleLoaded() && __cms.mlMap.areTilesLoaded()", timeout=30000); await page.wait_for_timeout(1500)
                fx = await page.evaluate("""(()=>{ const m=__cms.mlMap, L=m.getStyle().layers, w=L.find(l=>l.id==='water'), b=L.find(l=>l.id==='building');
                    const pat=w.paint['fill-pattern']; return {pat:!!pat, img:!!pat && m.hasImage(pat), building:b&&b.type,
                    passes:L.filter(l=>/^road-minor-\\d$/.test(l.id)).map(l=>l.paint['line-translate'])}; })()""")
                print('  effets (aperçu) :', fx)
                assert fx['pat'] and fx['img'] and fx['building'] == 'line' and len(fx['passes']) == 2 and fx['passes'][0] != fx['passes'][1], fx
                async with page.expect_download(timeout=90000) as dl:
                    await page.click('#resClose'); await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
                d = await dl.value; path = str(T / 'ml-export-fx.png'); await d.save_as(path)
                w2, h2, water2, dark2 = png_stats(path)
                print('  export avec effets', w2, h2, '| pixels eau', water2, f'(sans effet : {water})')
                assert (w2, h2) == (2480, 3508) and water2 < water * 0.7, 'hachures absentes de l\'export'
                assert not [l for l in logs if 'PAGEERROR' in l or 'could not be loaded' in l], logs[-5:]
                # Pistes artistiques : lueur (line-blur), lignes d'eau (line-gap-width), motifs, plaque riso, quartier (within)
                await page.evaluate("""['hatch','outline','pencil'].forEach(k=>{ const i=document.querySelector(`[data-k="fx.${k}"]`); i.checked=false; i.dispatchEvent(new Event('input')); });
                    ['glow','waterlines','dots','parkHatch','riso','quarter','halo','foil'].forEach(k=>{ const i=document.querySelector(`[data-k="fx.${k}"]`); i.checked=true; i.dispatchEvent(new Event('input')); });""")
                await wait_js(page, "__cms.mlMap.isStyleLoaded() && __cms.mlMap.areTilesLoaded()", timeout=30000); await page.wait_for_timeout(1500)
                art = await page.evaluate("""(()=>{ const m=__cms.mlMap, L=m.getStyle().layers, ids=L.map(l=>l.id), b=L.find(l=>l.id==='building'), pk=L.find(l=>l.id==='park');
                    return {glow:ids.filter(i=>i.startsWith('glow-')).length, wl:ids.filter(i=>i.startsWith('waterline-')).length, q:ids.filter(i=>i.startsWith('quarter-')).length,
                      plate:ids.includes('water-plate'), dots:m.hasImage(b.paint['fill-pattern']), cross:!pk || m.hasImage(pk.paint['fill-pattern']),
                      rendered:m.queryRenderedFeatures().length}; })()""")
                print('  pistes artistiques (aperçu) :', art)
                assert art['glow'] == 24 and art['wl'] == 5 and art['q'] == 8 and art['plate'] and art['dots'] and art['cross'] and art['rendered'] > 0, art
                async with page.expect_download(timeout=90000) as dl:
                    await page.click('#resClose'); await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
                d = await dl.value; path = str(T / 'ml-export-art.png'); await d.save_as(path)
                w3, h3, _, _ = png_stats(path)
                print('  export avec les pistes artistiques', w3, h3)
                assert (w3, h3) == (2480, 3508)
                bad = [l for l in logs if 'PAGEERROR' in l or 'could not be loaded' in l or ('MapLibre' in l and 'warn' in l)]
                assert not bad, bad[-5:]
                # Pistes du prompt lues dans les tuiles (carte hors écran du lieu, issue #45)
                pist = await page.evaluate("CMS.illus.scanPistes().then(()=>CMS.illus.found)")
                print('  pistes lues dans la carte :', pist)
                assert pist[:2] == ['Château royal de Blois', 'Cathédrale Saint-Louis'] and 'La Loire' in pist and 'Maison de la magie' in pist, pist
                # Grands formats : au-delà du côté maximal d'un canevas WebGL, carte rendue en tuiles recollées.
                # Rendu d'un seul tenant comparé au même rendu en 2 × 3 tuiles (côté maximal forcé à 1024 px).
                cmp = await page.evaluate("""(async()=>{
                    const one=(await __cms.renderMaplibreOffscreen(1600,2400)).canvas;
                    __cms.glMaxTest=1024; const tiled=(await __cms.renderMaplibreOffscreen(1600,2400)).canvas; __cms.glMaxTest=0;
                    const a=one.getContext('2d').getImageData(0,0,1600,2400).data, b=tiled.getContext('2d').getImageData(0,0,1600,2400).data;
                    let diff=0, seam=0, n=a.length/4;
                    for(let i=0;i<a.length;i+=4){ const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]); if(d>60){ diff++; const x=(i/4)%1600, y=(i/4/1600)|0; if(Math.abs(x-800)<3||Math.abs(y-800)<3||Math.abs(y-1600)<3) seam++; } }
                    return {diff:diff/n, seam}; })()""")
                print('  tuiles WebGL (2 × 3) contre rendu unique :', cmp)
                assert cmp['diff'] < 0.01 and cmp['seam'] < 400, cmp
                # Export A3 (3508 × 4961) : carte de plus de 4096 px de haut, rendue en tuiles
                await page.evaluate("__cms.setFormat('a3')")
                async with page.expect_download(timeout=180000) as dl:
                    await page.click('#resClose'); await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
                d = await dl.value; path = str(T / 'ml-export-a3.png'); await d.save_as(path)
                w4, h4, water4, dark4 = png_stats(path)
                print('  export A3', w4, h4, '| pixels eau', water4, '| pixels axes', dark4)
                assert (w4, h4) == (3508, 4961) and dark4 > 200, (w4, h4, dark4)
                await page.evaluate("__cms.setFormat('a4')")
            await ctx.close()
        await b.close()
    srv.shutdown(); print('OK')
asyncio.run(main())
