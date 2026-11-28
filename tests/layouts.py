"""Captures des 11 gabarits (outil de contrôle visuel, hors de la suite : aucune vérification).

Moteur Fichier avec les données de test, sans réseau. Chaque gabarit est rendu avec le thème Souvenir, puis
capturé dans tests/L-<gabarit>.png ; à comparer à l'œil après une modification du rendu (dossier, § 4.1).

    python tests/fixture.py && python tests/layouts.py
"""
import pathlib, os, asyncio
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()   # site testé : dist/ (construit par run_all.py), ou CMS_ROOT
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None   # Chrome/Chromium ; vide = Chromium de Playwright
FIX = open(T / 'osm.json').read()
LAYOUTS = ['souvenir', 'classic', 'fade', 'medallion', 'heart', 'arch', 'travel', 'polaroid', 'diptych', 'sky', 'typo']


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await b.new_page(viewport={'width': 1400, 'height': 900})
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        await seed(page, APP, wait=1200)   # accord préalable, sections ouvertes (cf. tests/seed.py)
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        await page.click('#tabs [data-tab=style]'); await page.click('#themes .theme[data-v=souvenir]')
        for lay in LAYOUTS:
            await page.click(f'#layouts .card[data-v={lay}]'); await page.wait_for_timeout(600)
            await page.locator('#poster').screenshot(path=str(T / f'L-{lay}.png'))
            print('capture', f'tests/L-{lay}.png')
        await b.close()

asyncio.run(main())
