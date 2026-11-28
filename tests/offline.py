"""e2e : réseau coupé (mobile, file://) : contexte, diagnostic, import des trois formats, export, aperçu intégré.

Tout accès autre que file:// est refusé. Vérifie : MapLibre chargé depuis lib/ ; carte signalée indisponible
(bandeau « Diagnostiquer ») ; diagnostic : librairie chargée, OpenFreeMap et Nominatim en échec, recommandation du
moteur Fichier ; import de tests/osm.json (JSON OSM), tests/data.osm (XML) et tests/data.geojson : moteur Fichier
et données chargées à chaque fois ; export PNG A4 de 2480 × 3508 px ; page ouverte dans une iframe (tests/frame.html) :
avertissement d'aperçu intégré dans l'onglet Lieu ; aucune erreur de page.
"""
import pathlib, os, asyncio, struct
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent).resolve()   # site testé : source, ou dist/ (CI)
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None   # Chrome/Chromium ; vide = Chromium de Playwright
INIT = "try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.advOpen','1');localStorage.setItem('cms3.styleMoreOpen','1');localStorage.setItem('cms3.themeOpen','1');localStorage.setItem('cms3.welcomed','1')}catch(e){}"   # accord préalable donné (cf. tests/consent.py)


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--allow-file-access-from-files'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        page = await ctx.new_page(); errs = []
        await page.add_init_script(INIT)
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            await (r.continue_() if r.request.url.startswith('file:') else r.abort())
        await page.route('**/*', route)
        await page.goto(APP); await page.wait_for_timeout(2500)
        check(await page.evaluate('__cms.mlLib') == 'ok', 'MapLibre chargé depuis lib/, sans réseau')
        check('Diagnostiquer' in await page.inner_text('#banner'), f"carte signalée indisponible : {await page.inner_text('#stTxt')}")
        await page.click('#bDiag'); await page.wait_for_timeout(1500)
        rows = await page.evaluate("[...document.querySelectorAll('#diag > div')].map(d=>[d.children[1]?.textContent, d.children[0]?.textContent])")
        diag = dict(r for r in rows if r[0])
        check(diag.get('Librairie MapLibre') == '✓', 'diagnostic : librairie chargée')
        check(diag.get('Tuiles OpenFreeMap') == '✗' and diag.get('Géocodage Nominatim') == '✗', 'diagnostic : OpenFreeMap et Nominatim en échec')
        check('moteur « Fichier »' in await page.inner_text('#diag'), 'diagnostic : moteur Fichier recommandé')
        await page.screenshot(path=str(T / 'off-diag.png'))
        for f in ['osm.json', 'data.osm', 'data.geojson']:
            await page.set_input_files('#fileIn', str(T / f)); await page.wait_for_timeout(600)
            info = await page.inner_text('#stTxt')
            ok = await page.evaluate("__cms.st.engine==='file' && __cms.osmData && __cms.osmData.water.length>0")
            check(ok and 'importé' in info, f'import {f} : {info}')
        await page.screenshot(path=str(T / 'off-import.png'))
        async with page.expect_download() as dl:
            await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value; path = str(T / 'off-export.png'); await d.save_as(path)
        w, h = struct.unpack('>II', open(path, 'rb').read()[16:24])
        check((w, h) == (2480, 3508), f'export hors ligne {w} × {h} px')
        # Aperçu intégré : la page est chargée dans une iframe
        p2 = await ctx.new_page(); await p2.route('**/*', route); await p2.goto((T / 'frame.html').as_uri()); await p2.wait_for_timeout(1500)
        warn = await p2.frames[1].inner_text('#envWarn')
        check(warn.startswith('Page ouverte dans un aperçu intégré'), 'iframe : avertissement d\'aperçu intégré')
        check(not errs, f'aucune erreur de page {errs or ""}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
