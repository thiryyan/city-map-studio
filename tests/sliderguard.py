"""e2e : sliders du panneau protégés contre le réglage accidentel au toucher (#92).

Sur mobile (toucher réel simulé via CDP) : un geste qui commence sur la piste du slider, loin de la poignée,
ne change pas la valeur (ni glissement ni saut au toucher) ; un glissement saisi par la poignée la change et
propose « Annuler » dans la notification ; « Annuler » rétablit la valeur d'origine. À la souris (ordinateur),
un clic sur la piste règle toujours le slider.
"""
import pathlib, os, asyncio
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent).resolve()   # site testé : source, ou dist/ (CI)
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None


async def main():
    fails = []
    def check(c, m):
        print('✓' if c else '✗', m)
        if not c: fails.append(m)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            await (r.continue_() if r.request.url.startswith('file:') else r.abort())
        await page.route('**/*', route)
        await seed(page, APP, wait=1500)
        await page.evaluate("document.querySelector('#tabs button[data-tab=style]').click()"); await page.wait_for_timeout(400)
        el = page.locator('#sStroke'); await el.scroll_into_view_if_needed(); await page.wait_for_timeout(300)
        val = lambda: page.evaluate("document.getElementById('sStroke').value")
        v0 = await val()
        r = await el.bounding_box()
        # position de la poignée (même formule que le garde-fou : poignée de 20 px)
        f = (float(v0) - 0.5) / 2.0; thumb = r['x'] + 10 + f * (r['width'] - 20); cy = r['y'] + r['height'] / 2
        far = r['x'] + r['width'] - 12 if thumb < r['x'] + r['width'] / 2 else r['x'] + 12
        cdp = await ctx.new_cdp_session(page)
        async def touch(x0, x1):
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': cy}]})
            for i in range(1, 7):
                await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + (x1 - x0) * i / 6, 'y': cy}]})
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
            await page.wait_for_timeout(500)
        await touch(far, far + (thumb - far) * 0.5)   # glissement parti de la piste
        check(await val() == v0, f'geste parti de la piste : valeur inchangée ({v0})')
        await touch(far, far)                           # simple toucher de la piste
        check(await val() == v0, 'toucher de la piste : pas de saut de la valeur')
        check('modifié' not in (await page.inner_text('#toast')), 'aucune notification de réglage')
        tx = thumb + (r['width'] * 0.25 if thumb < r['x'] + r['width'] / 2 else -r['width'] * 0.25)
        await touch(thumb, tx)                          # glissement saisi par la poignée
        v1 = await val(); check(v1 != v0, f'glissement par la poignée : valeur changée ({v0} → {v1})')
        check(await page.locator('#toast.show button').count() == 1, 'notification avec bouton « Annuler »')
        await page.click('#toast button'); await page.wait_for_timeout(500)
        check(await val() == v0, 'Annuler rétablit la valeur d\'origine')
        check(not errs, f'aucune erreur de page {errs}')
        await ctx.close()

        # Souris : comportement inchangé
        page = await b.new_page(viewport={'width': 1400, 'height': 900}); await page.route('**/*', route)
        await seed(page, APP, wait=1500)
        await page.evaluate("document.querySelector('#tabs button[data-tab=style]').click()"); await page.wait_for_timeout(400)
        await page.locator('#sStroke').scroll_into_view_if_needed(); await page.wait_for_timeout(300)
        v0 = await page.evaluate("document.getElementById('sStroke').value"); r = await page.locator('#sStroke').bounding_box()
        await page.mouse.click(r['x'] + r['width'] - 12, r['y'] + r['height'] / 2); await page.wait_for_timeout(300)
        check(await page.evaluate("document.getElementById('sStroke').value") != v0, 'souris : clic sur la piste règle toujours le slider')
        await b.close()
    if fails: raise SystemExit(1)

asyncio.run(main())
