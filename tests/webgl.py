"""e2e : cycle de vie WebGL du moteur Vectoriel GPU (issue #33).

OpenFreeMap simulé : TileJSON servie, tuiles vides (ou jamais servies pour le scénario de perte hors écran).
Vérifie : perte et restauration du contexte de la carte (état affiché, export refusé puis rétabli), échec rapide d'un
rendu hors écran dont le contexte est perdu, un seul rendu hors écran à la fois, libération de la carte en moteur Fichier
et recréation au retour.
"""
import asyncio, json, os, pathlib, time
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
TILEJSON = json.dumps({'tilejson': '3.0.0', 'tiles': ['https://tiles.openfreemap.org/t/{z}/{x}/{y}.pbf'], 'minzoom': 0, 'maxzoom': 14,
                       'vector_layers': [{'id': n} for n in ['water', 'waterway', 'transportation', 'building', 'park', 'landcover']]})
CORS = {'Access-Control-Allow-Origin': '*'}
fails = []
LOSE = "(cv=>{ const gl=cv.getContext('webgl2')||cv.getContext('webgl'); window.__lose=gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); })"


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 1200, 'height': 800})
        page = await ctx.new_page()
        await page.add_init_script("window.__cmsTestConfig={mlRelease:1500};"
                                   "try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.welcomed','1')}catch(e){}")
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        hang = {'on': False}

        async def route(r):
            u = r.request.url
            if u.startswith('file:'): return await r.continue_()
            if u.endswith('/planet'): return await r.fulfill(status=200, content_type='application/json', body=TILEJSON, headers=CORS)
            if 'tiles.openfreemap.org/t/' in u:
                if hang['on']: await asyncio.sleep(20); return await r.abort()
                return await r.fulfill(status=204, body=b'', headers=CORS)
            await r.abort()
        await page.route('**/*', route)
        await page.goto(APP)
        await wait_js(page, "typeof __cms==='object' && !!__cms.mlMap", 20000)
        await wait_js(page, "__cms.mlMap.loaded()", 15000)

        # 1. Perte du contexte de la carte interactive
        await page.evaluate(f"{LOSE}(__cms.mlMap.getCanvas())")
        await wait_js(page, "__cms.ui.glLost===true", 5000)
        check('suspendue' in await page.inner_text('#stTxt'), 'perte de contexte : état « Carte GPU suspendue »')
        await page.evaluate("__cms.exportPoster()"); await page.wait_for_timeout(300)
        check('indisponible' in await page.inner_text('#toast') and not await page.evaluate("document.getElementById('busy').classList.contains('show')"),
              'perte de contexte : export refusé avec un message')
        await page.evaluate("window.__lose.restoreContext()")
        await wait_js(page, "__cms.ui.glLost===false", 5000)
        await wait_js(page, "/Prêt/.test(document.getElementById('stTxt').textContent)", 10000)
        check(True, 'restauration : carte rétablie, état « Prêt »')

        # 2. Un seul rendu hors écran à la fois
        await page.evaluate("""window.__maxOff=0; new MutationObserver(()=>{ window.__maxOff=Math.max(window.__maxOff,document.querySelectorAll('.ml-offscreen').length); })
                               .observe(document.body,{childList:true})""")
        r = await page.evaluate("Promise.all([__cms.renderMaplibreOffscreen(400,500),__cms.renderMaplibreOffscreen(400,500)]).then(a=>a.map(x=>x.canvas.width))")
        check(r == [400, 400] and await page.evaluate("window.__maxOff") == 1, f'deux rendus hors écran simultanés : exécutés l\'un après l\'autre (max {await page.evaluate("window.__maxOff")})')

        # 3. Perte du contexte d'un rendu hors écran : échec rapide
        hang['on'] = True
        await page.evaluate("void (window.__off=__cms.renderMaplibreOffscreen(400,500,{center:{lat:10,lon:10},zoom:14,marker:{lat:10,lon:10}}).then(()=>'ok',e=>'échec : '+e.message))")   # vue nouvelle : tuiles jamais servies
        await wait_js(page, "!!document.querySelector('.ml-offscreen canvas')", 5000)
        await page.wait_for_timeout(300)
        t0 = time.monotonic()
        await page.evaluate(f"{LOSE}(document.querySelector('.ml-offscreen canvas'))")
        res = await page.evaluate("window.__off")
        check(res.startswith('échec') and 'WebGL' in res and time.monotonic() - t0 < 5, f'rendu hors écran : échec explicite en {time.monotonic() - t0:.1f} s ({res})')
        check(await page.evaluate("document.querySelectorAll('.ml-offscreen').length") == 0, 'rendu hors écran : nettoyé')
        hang['on'] = False

        # 4. Moteur Fichier : carte libérée, recréée au retour
        await page.evaluate("__cms.setEngine('file')")
        await page.wait_for_timeout(2200)
        check(await page.evaluate("__cms.mlMap===null"), 'moteur Fichier : carte MapLibre libérée')
        await page.evaluate("__cms.setEngine('maplibre')")
        await wait_js(page, "!!__cms.mlMap", 5000)
        check(True, 'retour au moteur GPU : carte recréée')
        await page.evaluate("__cms.setEngine('file')"); await page.wait_for_timeout(300); await page.evaluate("__cms.setEngine('maplibre')")
        await page.wait_for_timeout(2200)
        check(await page.evaluate("!!__cms.mlMap"), 'aller-retour rapide : carte conservée')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
