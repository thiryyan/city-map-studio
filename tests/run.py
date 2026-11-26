"""e2e : parcours de référence du moteur Fichier, sur mobile (390 × 844, densité 2) et sur ordinateur (1400 × 900).

Données de test (tests/osm.json) importées sans réseau. Vérifie : moteur Fichier actif et données chargées ;
conversion DMS de référence (dossier, § 3.2), retenue comprise ; assemblage des anneaux du fleuve (îles) ;
export PNG A4 de 2480 × 3508 px portant un chunk pHYs à 300 DPI (11 811 px/m) ; aucune erreur de page.
Captures : tests/mobile.png, tests/desktop.png et les exports tests/export-*.png.
"""
import pathlib, os, asyncio, struct
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None   # Chrome/Chromium ; vide = Chromium de Playwright
FIX = open(T / 'osm.json').read()
INIT = "try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.advOpen','1');localStorage.setItem('cityMapStudio.styleMoreOpen','1');localStorage.setItem('cityMapStudio.themeOpen','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}"   # accord préalable donné (cf. tests/consent.py)
# Valeurs de référence du dossier technique (§ 3.2 et § 9) : Blois, retenue (1,99999 → 2°), hémisphère ouest
DMS = [(47.5861, 'N', 'S', '47° 35′ 10.0″ N'), (1.3359, 'E', 'W', '1° 20′ 09.2″ E'),
       (1.99999, 'E', 'W', '2° 00′ 00.0″ E'), (-73.9855, 'E', 'W', '73° 59′ 07.8″ W')]


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        for name, vp, mobile in [('mobile', {'width': 390, 'height': 844}, True), ('desktop', {'width': 1400, 'height': 900}, False)]:
            ctx = await b.new_context(viewport=vp, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
            page = await ctx.new_page(); errs = []
            await page.add_init_script(INIT)
            page.on('pageerror', lambda e: errs.append(str(e)))
            await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
            await page.goto(APP); await page.wait_for_timeout(1500)
            await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
            await page.screenshot(path=str(T / f'{name}.png'))
            check(await page.evaluate('__cms.st.engine') == 'file' and await page.evaluate('!!__cms.osmData'), f'{name} : moteur Fichier, données importées')
            if mobile:
                for v, pos, neg, want in DMS:
                    got = await page.evaluate('([v,p,n])=>__cms.dms(v,p,n)', [v, pos, neg])
                    check(got == want, f'DMS {v} → {got}')
                rings = await page.evaluate("__cms.osmData.water.map(f=>f.rings.length)")
                check(max(rings, default=0) >= 2, f'fleuve assemblé avec ses îles (anneaux par surface : {rings})')
            async with page.expect_download() as dl:
                await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
            d = await dl.value; path = str(T / f'export-{name}.png'); await d.save_as(path)
            data = open(path, 'rb').read()
            w, h = struct.unpack('>II', data[16:24]); i = data.find(b'pHYs')
            phys = struct.unpack('>IIB', data[i + 4:i + 13]) if i > 0 else None
            check(d.suggested_filename == 'affiche-carte-blois-300dpi.png', f'{name} : nom du fichier {d.suggested_filename}')
            check((w, h) == (2480, 3508), f'{name} : export {w} × {h} px')
            check(phys == (11811, 11811, 1), f'{name} : pHYs 300 DPI {phys}')
            await page.wait_for_timeout(300); await page.screenshot(path=str(T / f'{name}-result.png'))
            check(not errs, f'{name} : aucune erreur de page {errs or ""}')
            await ctx.close()
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
