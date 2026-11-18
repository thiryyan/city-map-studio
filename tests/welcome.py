"""e2e : ambiance proposée au premier lancement.

Première visite : la demande d'accord d'abord, puis le choix d'une ambiance (jamais les deux
à la fois). Choisir une ambiance l'applique et ferme la fenêtre ; « Commencer sans ambiance »
la ferme aussi ; dans les deux cas, elle ne revient plus. Pas de proposition pour un
utilisateur qui a déjà une affiche enregistrée, ni à l'ouverture d'un lien partagé.
Aucun script injecté : le stockage est écrit par la page elle-même (cf. tests/seed.py).
"""
import pathlib, os, asyncio, json
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri()+'?test'
CHROME = os.environ.get('CHROME') or None
shown = lambda page, id_: page.evaluate(f"document.getElementById('{id_}').classList.contains('show')")

async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        async def fresh(viewport={'width': 390, 'height': 844}):
            ctx = await b.new_context(viewport=viewport, is_mobile=True, has_touch=True)
            page = await ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
            return ctx, page, errs

        # 1. Première visite : accord, puis ambiance
        ctx, page, errs = await fresh()
        await page.goto(APP); await page.wait_for_timeout(1500)
        check(await shown(page, 'consent') and not await shown(page, 'welcome'), 'premier lancement : demande d\'accord seule')
        await page.click('#bConsentFile'); await page.wait_for_timeout(600)
        check(await shown(page, 'welcome'), 'après l\'accord : choix d\'une ambiance')
        n = await page.evaluate("document.querySelectorAll('#welAmb button').length")
        drawn = await page.evaluate("[...document.querySelectorAll('#welAmb canvas')].map(c=>c.toDataURL()).filter((v,i,a)=>a.indexOf(v)===i).length")
        check(n == 8 and drawn == 8, f'8 ambiances avec leur vignette ({n}, {drawn} distinctes)')
        await page.screenshot(path=str(T / 'welcome.png'))
        await page.click('#welAmb [data-v=naissance]'); await page.wait_for_timeout(600)
        st = await page.evaluate("[__cms.st.theme, __cms.st.layout, __cms.st.markerStyle, document.querySelector('#tabs .on').dataset.tab]")
        check(st == ['sauge', 'arch', 'feet', 'lieu'] and not await shown(page, 'welcome'), f'ambiance appliquée, fenêtre fermée, onglet Lieu {st}')
        check(await page.evaluate("localStorage.getItem('cityMapStudio.welcomed')") == '1', 'choix mémorisé')
        await page.click('#bUndo'); await page.wait_for_timeout(300)
        check(await page.evaluate("__cms.st.layout") == 'souvenir', '« Annuler » revient à l\'affiche de départ')
        await page.reload(); await page.wait_for_timeout(1500)
        # « Travailler hors ligne » n'est pas mémorisé (l'accord est redemandé) ; l'ambiance, elle, n'est plus proposée
        if await shown(page, 'consent'): await page.click('#bConsentFile'); await page.wait_for_timeout(500)
        check(not await shown(page, 'welcome'), 'visite suivante : plus de proposition d\'ambiance')
        check(not errs, f'aucune erreur de page {errs}')
        await ctx.close()

        # 2. « Commencer sans ambiance » (et touche Échap)
        ctx, page, errs = await fresh()
        await page.goto(APP); await page.wait_for_timeout(1200)
        await page.click('#bConsentFile'); await page.wait_for_timeout(500)
        await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
        lay = await page.evaluate("__cms.st.layout")
        check(not await shown(page, 'welcome') and lay == 'souvenir', 'Échap : fermée, affiche par défaut conservée')
        check(await page.evaluate("localStorage.getItem('cityMapStudio.welcomed')") == '1', 'fermeture mémorisée')
        check(not errs, f'aucune erreur de page {errs}')
        await ctx.close()

        # 3. Utilisateur existant (affiche déjà enregistrée) : pas de proposition
        ctx, page, errs = await fresh()
        await page.goto(APP); await page.wait_for_timeout(800)
        await page.evaluate("""s=>{ localStorage.setItem('cityMapStudio.consent','1'); localStorage.setItem('cityMapStudio.v2', s); }""",
                            json.dumps({'layout': 'classic', 'theme': 'souvenir'}))
        await page.reload(); await page.wait_for_timeout(1500)
        check(not await shown(page, 'welcome') and await page.evaluate("__cms.st.layout") == 'classic', 'affiche existante : aucune proposition')
        await ctx.close()

        # 4. Ouverture d'un lien partagé : pas de proposition
        ctx, page, errs = await fresh()
        await page.goto(APP); await page.wait_for_timeout(800)
        await page.evaluate("localStorage.setItem('cityMapStudio.consent','1'); localStorage.setItem('cityMapStudio.welcomed','1')")
        await page.reload(); await page.wait_for_timeout(1000)
        url = await page.evaluate("__cms.st.texts.title='Chambord'; __cms.encodeShare().then(r=>r.url)")
        await ctx.close()
        ctx, page, errs = await fresh()
        await page.goto(APP); await page.wait_for_timeout(800)
        await page.evaluate("localStorage.setItem('cityMapStudio.consent','1')")
        await page.goto(url); await page.reload(); await page.wait_for_timeout(1600)   # même page, seule l'ancre change : rechargement explicite
        check(not await shown(page, 'welcome') and await page.evaluate("__cms.st.texts.title") == 'Chambord', 'lien partagé : affiche ouverte, aucune proposition')
        check(not errs, f'aucune erreur de page {errs}')
        await ctx.close()
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
