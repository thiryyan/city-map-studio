"""e2e : lignes de texte optionnelles (cases à cocher de l'onglet Textes).

Pour chacun des 11 gabarits : chaque case modifie l'affiche (sauf le sous-titre, que Souvenir et Polaroid
n'affichent pas), la réactiver rend le rendu d'origine, capture avec une sélection masquée. Puis : texte masqué
conservé, état persisté au rechargement, export A4 sans aucune ligne ; chaque police de texte (11 familles) donne
un rendu distinct et le choix est persisté.
"""
import pathlib, os, asyncio, struct
from playwright.async_api import async_playwright
from jswait import wait_js
from seed import seed
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri()+'?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
KEYS = ['title', 'subtitle', 'coords', 'dedication', 'names', 'date']
# Couches haute et basse : le gabarit Lettres découpe le titre dans la carte, le gabarit Ciel dessine sous la carte
SNAP = "(()=>['cvOver','cvUnder'].map(id=>document.getElementById(id).toDataURL()).join())()"
LAYOUTS = ['souvenir', 'classic', 'fade', 'medallion', 'heart', 'arch', 'travel', 'polaroid', 'diptych', 'sky', 'typo']
NO_SUBTITLE = {'souvenir', 'polaroid'}   # gabarits qui n'affichent pas le sous-titre (note dans l'onglet Textes, tests/deps.py)
FAMILIES = ['serif', 'garamond', 'bodoni', 'italiana', 'fraunces', 'sans', 'jost', 'mono', 'deco', 'bebas', 'cinzel', 'fell', 'marcellus', 'vibes']

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            u = r.request.url
            if u.startswith('file:'): await r.continue_()
            else: await r.abort()
        await page.route('**/*', route)
        await seed(page, APP, wait=1200)   # accord préalable et section Avancé, sans script injecté (cf. tests/seed.py)
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        await page.click('#tabs [data-tab=textes]')
        fails = []
        for lay in LAYOUTS:
            await page.click('#tabs [data-tab=style]'); await page.click(f'#layouts .card[data-v={lay}]')
            await page.click('#tabs [data-tab=textes]'); await page.wait_for_timeout(500)
            base = await page.evaluate(SNAP)
            for k in KEYS:
                if k == 'subtitle' and lay in NO_SUBTITLE: continue
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
        await wait_js(page, "Object.values(JSON.parse(localStorage.getItem('cms3.affiche')||'{}').show||{}).every(v=>v===false)")   # lignes masquées enregistrées
        await page.reload(); await page.wait_for_timeout(1500)
        show = await page.evaluate("__cms.st.show")
        print('après rechargement :', show, '| titre conservé :', kept)
        if any(show.values()) or kept != 'Blois': fails.append('persistance')
        # un fichier importé n'est pas conservé entre deux sessions : nouvel import avant l'export
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        async with page.expect_download() as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value; path = str(T / 'texts-export.png'); await d.save_as(path)
        w, h = struct.unpack('>II', open(path, 'rb').read()[16:24]); print('export sans texte', d.suggested_filename, w, h)
        if (w, h) != (2480, 3508): fails.append('export')
        await page.click('#resClose'); await page.click('#tabs [data-tab=textes]')
        for k in KEYS: await page.click(f'input[data-k="show.{k}"]')
        # Polices : chaque famille modifie le rendu et le choix est persisté
        snaps = set()
        await page.click('#tabs [data-tab=style]'); await page.click('#layouts .card[data-v=souvenir]')
        await page.click('#tabs [data-tab=textes]')   # les polices sont dans l'onglet Textes (#72)
        for f in FAMILIES:
            await page.click(f'#fontSeg [data-v={f}]'); await page.wait_for_timeout(300); snaps.add(await page.evaluate(SNAP))
        await wait_js(page, "JSON.parse(localStorage.getItem('cms3.affiche')||'{}').font==='vibes'")   # choix enregistré avant de recharger
        await page.reload(); await page.wait_for_timeout(1200)
        font = await page.evaluate('__cms.st.font'); print('polices : rendus distincts', len(snaps), '| après rechargement', font)
        if len(snaps) != len(FAMILIES) or font != 'vibes': fails.append('polices')
        await page.evaluate("__cms.st.font='serif'")
        print('échecs', fails, '| errors', errs)
        await b.close()
        assert not fails and not errs
    print('OK')
asyncio.run(main())
