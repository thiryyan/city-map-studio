"""e2e : lignes de texte optionnelles (cases à cocher de l'onglet Textes).

Pour chaque gabarit : capture avec toutes les lignes, puis avec une sélection
masquée. Vérifie que chaque case modifie l'affiche, que le texte masqué est
conservé, que l'état est persisté, et que l'export fonctionne sans aucune ligne.
"""
import pathlib, os, asyncio, struct
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri()
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'overpass.json').read()
KEYS = ['title', 'subtitle', 'coords', 'dedication', 'names', 'date']
SNAP = "(()=>{const c=document.getElementById('cvOver');return c.toDataURL()})()"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        page = await ctx.new_page(); errs = []
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.advOpen','1')}catch(e){}")  # accord préalable donné (cf. tests/consent.py)
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            u = r.request.url
            if 'interpreter' in u: await r.fulfill(status=200, content_type='application/json', body=FIX)
            elif u.startswith('file:'): await r.continue_()
            else: await r.abort()
        await page.route('**/*', route)
        await page.goto(APP); await page.wait_for_timeout(1200)
        await page.click('#engineSeg [data-v=overpass]'); await page.wait_for_timeout(800)
        await page.click('#tabs [data-tab=textes]')
        fails = []
        for lay in ['souvenir', 'classic', 'fade', 'medallion']:
            await page.click('#tabs [data-tab=style]'); await page.click(f'#layouts .card[data-v={lay}]')
            await page.click('#tabs [data-tab=textes]'); await page.wait_for_timeout(300)
            base = await page.evaluate(SNAP)
            for k in KEYS:
                if lay == 'souvenir' and k == 'subtitle': continue   # le gabarit Souvenir n'affiche pas le sous-titre
                await page.click(f'input[data-k="show.{k}"]'); await page.wait_for_timeout(120)
                if await page.evaluate(SNAP) == base: fails.append(f'{lay}:{k} sans effet')
                await page.click(f'input[data-k="show.{k}"]'); await page.wait_for_timeout(120)
            # sélection masquée : titre + coordonnées + dédicace
            for k in ['title', 'coords', 'dedication']: await page.click(f'input[data-k="show.{k}"]')
            await page.wait_for_timeout(300); await page.locator('#poster').screenshot(path=str(T / f'texts-{lay}.png'))
            for k in ['title', 'coords', 'dedication']: await page.click(f'input[data-k="show.{k}"]')
            await page.wait_for_timeout(120)
            if await page.evaluate(SNAP) != base: fails.append(f'{lay}: rendu différent après réactivation')
        # tout masquer : texte conservé, état persisté, export OK
        for k in KEYS: await page.click(f'input[data-k="show.{k}"]')
        await page.wait_for_timeout(500)
        kept = await page.evaluate("__cms.st.texts.title")
        await page.reload(); await page.wait_for_timeout(1500)
        show = await page.evaluate("__cms.st.show")
        print('après rechargement :', show, '| titre conservé :', kept)
        if any(show.values()) or kept != 'Blois': fails.append('persistance')
        async with page.expect_download() as dl: await page.click('#bExport')
        d = await dl.value; path = str(T / 'texts-export.png'); await d.save_as(path)
        w, h = struct.unpack('>II', open(path, 'rb').read()[16:24]); print('export sans texte', d.suggested_filename, w, h)
        if (w, h) != (2480, 3508): fails.append('export')
        await page.click('#resClose'); await page.click('#tabs [data-tab=textes]')
        for k in KEYS: await page.click(f'input[data-k="show.{k}"]')
        # Polices : chaque famille modifie le rendu et le choix est persisté
        snaps = set()
        for f in ['serif', 'sans', 'mono', 'garamond', 'deco']:
            await page.click(f'#fontSeg [data-v={f}]'); await page.wait_for_timeout(300); snaps.add(await page.evaluate(SNAP))
        await page.reload(); await page.wait_for_timeout(1200)
        font = await page.evaluate('__cms.st.font'); print('polices : rendus distincts', len(snaps), '| après rechargement', font)
        if len(snaps) != 5 or font != 'deco': fails.append('polices')
        await page.evaluate("__cms.st.font='serif'")
        print('échecs', fails, '| errors', errs)
        await b.close()
        assert not fails and not errs
    print('OK')
asyncio.run(main())
