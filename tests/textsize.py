"""e2e : taille des textes de l'affiche (onglet Textes).

Vérifie que chaque curseur de taille (par ligne et global) modifie l'affiche dans chacun des 11
gabarits (sauf les lignes qu'un gabarit n'affiche pas, et le titre du gabarit Lettres, dont les lettres prennent
toujours la plus grande taille possible), que le retour à 100 % rend le rendu d'origine, que la réduction automatique est signalée, que « Tailles par défaut » et
« Réinitialiser » rétablissent 100 %, que le réglage est persisté, et que l'export à
150 % mesure toujours 2480 × 3508 px.
"""
import pathlib, os, asyncio, struct
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()   # site testé : dist/ (construit par run_all.py), ou CMS_ROOT
APP = (ROOT / 'index.html').as_uri()+'?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
KEYS = ['title', 'subtitle', 'coords', 'dedication', 'names', 'date']
SNAP = "(()=>['cvOver','cvUnder'].map(id=>document.getElementById(id).toDataURL()).join())()"
LAYOUTS = ['souvenir', 'classic', 'fade', 'medallion', 'heart', 'arch', 'travel', 'polaroid', 'diptych', 'sky', 'typo']
# Lignes sans curseur effectif : sous-titre non affiché (Souvenir, Polaroid), titre du gabarit Lettres (taille calculée)
NO_SIZE = {('souvenir', 'subtitle'), ('polaroid', 'subtitle'), ('typo', 'title')}
SET = """([k,v])=>{const i=document.querySelector(`[data-k="${k}"]`); i.value=v; i.dispatchEvent(new Event('input'));}"""

async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
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
        setv = lambda k, v: page.evaluate(SET, [k, v])

        for lay in LAYOUTS:
            await page.evaluate(f"__cms.st.layout='{lay}'"); await page.click('#tabs [data-tab=style]')
            await page.click(f'#layouts .card[data-v={lay}]'); await page.click('#tabs [data-tab=textes]'); await page.wait_for_timeout(500)
            base = await page.evaluate(SNAP); dead = []
            for k in KEYS:
                if (lay, k) in NO_SIZE: continue
                await setv(f'textScale.{k}', 130); await page.wait_for_timeout(80)
                if await page.evaluate(SNAP) == base: dead.append(k)
                await setv(f'textScale.{k}', 100); await page.wait_for_timeout(80)
            check(not dead, f'{lay} : chaque curseur de ligne modifie l\'affiche {dead or ""}')
            check(await page.evaluate(SNAP) == base, f'{lay} : retour à 100 % = rendu d\'origine')
            await setv('textScaleAll', 130); await page.wait_for_timeout(120)
            check(await page.evaluate(SNAP) != base, f'{lay} : le curseur global modifie l\'affiche')
            for k in KEYS: await setv(f'textScale.{k}', 150)
            await page.wait_for_timeout(200); await page.locator('#poster').screenshot(path=str(T / f'textsize-{lay}.png'))
            await page.click('#bTsReset'); await page.wait_for_timeout(150)
            check(await page.evaluate(SNAP) == base, f'{lay} : « Tailles par défaut » rétablit le rendu')

        # Réduction automatique signalée
        await page.evaluate("__cms.st.layout='classic'"); await page.click('#tabs [data-tab=style]'); await page.click('#layouts .card[data-v=classic]')
        await page.click('#tabs [data-tab=textes]')
        await page.click('#dedWrapSeg [data-v=one]')   # sur une seule ligne (le retour à la ligne est vérifié par tests/dedication.py)
        await page.fill('input[data-k="texts.dedication"]', 'Là où tout a commencé, un soir de juillet sur les quais de la Loire, au coucher du soleil')
        await page.wait_for_timeout(250)
        note = await page.inner_text('#fitNote'); shr = await page.evaluate("document.getElementById('oTs-dedication').classList.contains('shrunk')")
        print('  avertissement :', note)
        check('dédicace' in note and shr, 'texte trop long : réduction signalée (note + curseur)')
        await page.fill('input[data-k="texts.dedication"]', 'Là où tout a commencé'); await page.wait_for_timeout(250)
        check(await page.inner_text('#fitNote') == '', 'texte raccourci : avertissement retiré')
        await page.click('#dedWrapSeg [data-v=auto]')
        # Toutes les lignes à 150 % : le bloc est réduit pour tenir, et le signale
        for k in KEYS: await setv(f'textScale.{k}', 150)
        await setv('textScaleAll', 140); await page.wait_for_timeout(250)
        check(await page.inner_text('#fitNote') != '', 'cartouche trop haut : réduction signalée')

        # Persistance, export, réinitialisation
        await setv('textScale.title', 120); await setv('textScaleAll', 110); await page.wait_for_timeout(1500)
        await page.reload(); await page.wait_for_timeout(1500)
        ts = await page.evaluate('[__cms.st.textScale.title, __cms.st.textScaleAll]')
        check(ts == [120, 110], f'tailles conservées après rechargement {ts}')
        check(await page.input_value('input[data-k="textScale.title"]') == '120', 'curseur resynchronisé')
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        async with page.expect_download() as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value; path = str(T / 'textsize-export.png'); await d.save_as(path)
        w, h = struct.unpack('>II', open(path, 'rb').read()[16:24]); print('  export', d.suggested_filename, w, h)
        check((w, h) == (2480, 3508), 'export 2480 × 3508 avec tailles modifiées')
        await page.click('#resClose')
        await page.evaluate('__cms.resetAll()'); await page.wait_for_timeout(300)
        ts = await page.evaluate('[Object.values(__cms.st.textScale).every(v=>v===100), __cms.st.textScaleAll]')
        check(ts == [True, 100], 'Réinitialiser : toutes les tailles à 100 %')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
