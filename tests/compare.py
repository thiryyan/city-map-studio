"""e2e : comparer avant / après un changement de thème (#15).

Vérifie : bouton masqué tant qu'aucun thème n'a été changé ; après un changement, bouton visible et
nommé d'après le thème précédent ; appui maintenu (souris, toucher, clavier) : l'affiche montre le
thème précédent avec un badge « Avant » ; relâché : thème choisi rétabli à l'identique ; rien n'est
enregistré ni ajouté à l'historique pendant la comparaison ; bouton masqué après « Annuler » ou
une retouche de couleur ; aucune comparaison entre un thème et lui-même.
Moteur Fichier avec les données de test : aucun accès réseau.
"""
import pathlib, os, asyncio, json
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
SNAP = "(()=>[document.getElementById('cvUnder').toDataURL(), document.getElementById('vecCanvas').toDataURL(), document.getElementById('cvOver').toDataURL()].join())()"
SAVED = "JSON.parse(localStorage.getItem('cityMapStudio.v2')).theme"

async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        await seed(page, APP, wait=1300)
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(1600)
        ev = page.evaluate; btn = page.locator('#bCompare')
        await ev("__cms.showTab('style')"); await page.wait_for_timeout(200)
        check(not await btn.is_visible(), 'bouton masqué avant tout changement de thème')

        # même thème reconfirmé : pas de comparaison
        await page.click(f'#themes .theme[data-v={await ev("__cms.st.theme")}]'); await page.wait_for_timeout(300)
        check(not await btn.is_visible(), 'thème inchangé : pas de comparaison')

        before = await ev(SNAP); t0 = await ev("__cms.st.theme"); name0 = await ev("__cms.THEMES[__cms.st.theme].name")
        await page.click('#themes .theme[data-v=nuit]'); await page.wait_for_timeout(700)
        after = await ev(SNAP)
        check(await btn.is_visible() and name0 in await btn.inner_text(), f'bouton visible, nommé d\'après « {name0} » : {await btn.inner_text()!r}')
        hist0 = await ev("__cms.hist.past.length"); colors_after = await ev("JSON.stringify(__cms.st.colors)")

        # souris : appui maintenu
        await btn.hover(); await page.mouse.down(); await page.wait_for_timeout(500)
        held = await ev(SNAP)
        check(held == before, 'appui maintenu : affiche identique à l\'avant (fond, carte, textes)')
        check(await page.locator('#cmpBadge').is_visible() and name0 in await page.inner_text('#cmpBadge'), 'badge « Avant » sur l\'affiche')
        check(await btn.get_attribute('aria-pressed') == 'true', 'aria-pressed vrai pendant l\'appui')
        await page.wait_for_timeout(500)   # au-delà du délai d'enregistrement (300 ms)
        check(await ev(SAVED) == 'nuit', 'rien n\'est enregistré pendant la comparaison')
        await page.mouse.up(); await page.wait_for_timeout(500)
        check(await ev(SNAP) == after and await ev("JSON.stringify(__cms.st.colors)") == colors_after and await ev("__cms.st.theme") == 'nuit',
              'relâché : thème choisi rétabli à l\'identique')
        check(not await page.locator('#cmpBadge').is_visible() and await btn.get_attribute('aria-pressed') == 'false', 'badge masqué, aria-pressed faux')
        check(await ev("__cms.hist.past.length") == hist0, 'la comparaison n\'ajoute rien à l\'historique')

        # clavier : Espace maintenu
        await btn.focus(); await page.keyboard.down(' '); await page.wait_for_timeout(400)
        check(await ev(SNAP) == before, 'clavier (Espace maintenu) : thème précédent affiché')
        await page.keyboard.up(' '); await page.wait_for_timeout(400)
        check(await ev(SNAP) == after, 'clavier relâché : thème choisi')

        # toucher : appui long, sans menu contextuel
        box = await btn.bounding_box(); x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        cdp = await ctx.new_cdp_session(page)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]}); await page.wait_for_timeout(700)
        check(await ev(SNAP) == before, 'toucher maintenu : thème précédent affiché')
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await page.wait_for_timeout(400)
        check(await ev(SNAP) == after, 'toucher relâché : thème choisi')

        # thème enchaîné : la comparaison porte sur le dernier changement
        await page.click('#themes .theme[data-v=creme]'); await page.wait_for_timeout(500)
        name1 = await ev("__cms.THEMES.nuit.name")
        check(name1 in await btn.inner_text(), f'nouveau changement : comparaison avec « {name1} »')

        # « Annuler » ou retouche d'une couleur : comparaison périmée
        await ev("__cms.undo()"); await page.wait_for_timeout(600)
        check(not await btn.is_visible(), 'après « Annuler » : bouton masqué')
        await page.click('#themes .theme[data-v=onyx]'); await page.wait_for_timeout(500)
        check(await btn.is_visible(), 'nouveau thème : bouton de nouveau visible')
        await ev("()=>{ const i=document.querySelector('[data-c=water]'); i.value='#123456'; i.dispatchEvent(new Event('input')); }"); await page.wait_for_timeout(500)
        check(not await btn.is_visible(), 'couleur retouchée : bouton masqué')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
