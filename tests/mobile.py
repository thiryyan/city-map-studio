"""e2e : ergonomie mobile.

Panneau coulissant à trois crans (réduit / mi-hauteur / déplié), dépliage à la saisie,
carte verrouillée et mode « Cadrer », placement du repère, boutons flottants adaptatifs,
mode paysage en deux colonnes, bulle et bandeau hors de l'affiche, taille du texte de
l'interface (A− / A+), et rien de tout cela sur ordinateur.
"""
import pathlib, os, asyncio
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri()
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'overpass.json').read()
JS_RECT = "s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right}}"

async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        async def open_page(vp, mobile=True):
            ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile)
            page = await ctx.new_page(); errs = []
            await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.advOpen','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")
            page.on('pageerror', lambda e: errs.append(str(e)))
            async def route(r):
                u = r.request.url
                if 'interpreter' in u: await r.fulfill(status=200, content_type='application/json', body=FIX)
                elif u.startswith('file:'): await r.continue_()
                else: await r.abort()
            await page.route('**/*', route)
            await page.goto(APP); await page.wait_for_timeout(1200)
            return ctx, page, errs
        rect = lambda page, s: page.evaluate(JS_RECT, s)
        sheet = lambda page: page.evaluate('__cms.ui.sheet')
        center = lambda page: page.evaluate('JSON.stringify(__cms.st.center)')

        # ---------- Téléphone portrait (iPhone 13 : 390 × 664 utiles) ----------
        ctx, page, errs = await open_page({'width': 390, 'height': 664})
        await page.click('#engineSeg [data-v=overpass]'); await page.wait_for_timeout(800)
        await page.evaluate("document.getElementById('banner').classList.remove('show')")
        await page.evaluate("__cms.setSheet('half')"); await page.wait_for_timeout(200)
        half = {k: await rect(page, s) for k, s in [('body', '.tabbody'), ('poster', '#poster'), ('panel', '#panel')]}
        print('  mi-hauteur : réglages', round(half['body']['h']), 'px · affiche', round(half['poster']['w']), '×', round(half['poster']['h']))
        check(await sheet(page) == 'half', 'cran mi-hauteur par défaut')
        check(half['body']['h'] >= 180, f"zone de réglages ≥ 180 px (avant : 138 px) : {round(half['body']['h'])}")
        await page.screenshot(path=str(T / 'mobile-half.png'))

        await page.tap('#grab'); await page.wait_for_timeout(250)
        full = {k: await rect(page, s) for k, s in [('body', '.tabbody'), ('poster', '#poster')]}
        check(await sheet(page) == 'full' and full['body']['h'] > half['body']['h'] + 150, f"toucher la poignée : panneau déplié ({round(full['body']['h'])} px)")
        check(await page.evaluate("document.getElementById('stage').dataset.fab") == 'none', 'aperçu en vignette : boutons flottants masqués')
        await page.screenshot(path=str(T / 'mobile-full.png'))
        await page.tap('#grab'); await page.wait_for_timeout(250)
        check(await sheet(page) == 'half', 'second toucher : retour à mi-hauteur')

        # glisser la poignée vers le bas → cran réduit
        g = await rect(page, '#grab'); x, y = g['x'] + g['w'] / 2, g['y'] + g['h'] / 2
        await page.mouse.move(x, y); await page.mouse.down()
        for i in range(1, 11): await page.mouse.move(x, y + 30 * i)
        await page.mouse.up(); await page.wait_for_timeout(250)
        peek = await rect(page, '#poster')
        check(await sheet(page) == 'peek', 'glisser vers le bas : panneau réduit')
        check(peek['h'] > half['poster']['h'] * 1.3, f"panneau réduit : affiche agrandie ({round(half['poster']['h'])} → {round(peek['h'])} px)")
        check(await page.is_visible('#bExport') and await page.is_visible('#tabs'), 'panneau réduit : onglets et export visibles')
        await page.screenshot(path=str(T / 'mobile-peek.png'))
        await page.tap('#tabs [data-tab=style]'); await page.wait_for_timeout(250)
        check(await sheet(page) == 'half', 'onglet touché depuis le cran réduit : mi-hauteur')
        await page.tap('#tabs [data-tab=style]'); await page.wait_for_timeout(250)
        check(await sheet(page) == 'full', 'onglet actif touché : panneau déplié')
        await page.tap('#tabs [data-tab=style]'); await page.wait_for_timeout(250)

        # saisie d'un texte : le panneau se déplie, puis revient
        await page.tap('#tabs [data-tab=textes]'); await page.wait_for_timeout(150)
        before = await sheet(page)
        await page.focus('input[data-k="texts.title"]'); await page.wait_for_timeout(250)
        check(await sheet(page) == 'full', 'saisie : panneau déplié')
        await page.evaluate('document.activeElement.blur()'); await page.wait_for_timeout(400)
        check(await sheet(page) == before, f'fin de saisie : panneau revenu au cran {before}')

        # carte verrouillée : glisser sur l'affiche ne décadre pas
        await page.tap('#tabs [data-tab=lieu]'); await page.wait_for_timeout(150)
        await page.evaluate("__cms.setSheet('peek')"); await page.wait_for_timeout(250)
        c0 = await center(page); s = await rect(page, '#slot')
        cx, cy = s['x'] + s['w'] / 2, s['y'] + s['h'] / 2
        check(await page.is_visible('#shield'), 'carte verrouillée : invitation « Toucher pour cadrer »')
        await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 60, cy + 40, steps=6); await page.mouse.up()
        await page.wait_for_timeout(200)
        check(await center(page) == c0, 'carte verrouillée : un glissement ne décadre pas')
        await page.evaluate("__cms.setFraming(false)")   # le glissement a ouvert le mode Cadrer (clic sur le verrou)
        await page.evaluate("__cms.setSheet('half')"); await page.wait_for_timeout(200)

        # mode Cadrer
        await page.tap('#shield'); await page.wait_for_timeout(300)
        check(await page.evaluate('__cms.ui.framing') and await page.is_visible('#frameBar'), 'toucher la carte : mode Cadrer et barre « Terminer »')
        check(await sheet(page) == 'peek' and not await page.is_visible('#shield'), 'mode Cadrer : panneau réduit, carte déverrouillée')
        s = await rect(page, '#slot'); cx, cy = s['x'] + s['w'] / 2, s['y'] + s['h'] / 2
        await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 60, cy + 40, steps=6); await page.mouse.up()
        await page.wait_for_timeout(200)
        check(await center(page) != c0, 'mode Cadrer : le glissement déplace la carte')
        await page.screenshot(path=str(T / 'mobile-framing.png'))
        await page.tap('#bFrameDone'); await page.wait_for_timeout(300)
        check(not await page.evaluate('__cms.ui.framing') and await sheet(page) == 'half' and await page.is_visible('#shield'),
              '« Terminer » : carte reverrouillée, panneau revenu à mi-hauteur')

        # placer le repère : le panneau se réduit, un toucher place le repère, puis le panneau revient
        m0 = await page.evaluate('JSON.stringify(__cms.st.marker)')
        await page.tap('#bPlace2'); await page.wait_for_timeout(300)
        check(await sheet(page) == 'peek' and not await page.is_visible('#shield'), 'placer le repère : panneau réduit, carte touchable')
        s = await rect(page, '#slot'); await page.mouse.click(s['x'] + s['w'] * 0.3, s['y'] + s['h'] * 0.3); await page.wait_for_timeout(300)
        check(await page.evaluate('JSON.stringify(__cms.st.marker)') != m0 and await sheet(page) == 'half', 'repère placé, panneau revenu')

        # bulle d'information au-dessus du panneau, bandeau dans le panneau
        await page.evaluate("document.getElementById('toast').className='show'; document.getElementById('toast').textContent='Test'")
        await page.wait_for_timeout(350)
        t, pn = await rect(page, '#toast'), await rect(page, '#panel')
        check(t['b'] <= pn['y'] + 1, f"bulle au-dessus du panneau (bas {round(t['b'])} ≤ {round(pn['y'])})")
        check(await page.evaluate("document.getElementById('banner').parentElement.id") == 'panel', 'bandeau dans le panneau, hors de l\'affiche')

        # taille du texte de l'interface
        f0 = await page.evaluate("parseFloat(getComputedStyle(document.querySelector('.tabs button')).fontSize)")
        await page.tap('#bUiLarger'); await page.tap('#bUiLarger'); await page.wait_for_timeout(300)
        f1 = await page.evaluate("parseFloat(getComputedStyle(document.querySelector('.tabs button')).fontSize)")
        check(f1 >= f0 * 1.2, f'A+ : texte de l\'interface agrandi ({f0} → {f1} px)')
        check(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), 'A+ : aucun défilement horizontal')
        await page.screenshot(path=str(T / 'mobile-uiscale.png'))
        check(await page.evaluate("localStorage.getItem('cityMapStudio.uiScale')") == '1.25', 'A+ : préférence enregistrée (125 %)')
        # Relecture au démarrage : nouvelle page avec la préférence déjà enregistrée (un rechargement immédiat
        # peut précéder l'écriture différée de localStorage par Chromium)
        p2 = await ctx.new_page()
        await p2.add_init_script("try{localStorage.setItem('cityMapStudio.uiScale','1.25')}catch(e){}")
        await p2.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        await p2.goto(APP); await p2.wait_for_timeout(1000)
        f2 = await p2.evaluate("parseFloat(getComputedStyle(document.querySelector('.tabs button')).fontSize)")
        check(f2 == f1, f'taille de l\'interface reprise au démarrage suivant ({f1} → {f2} px)')
        await p2.close()
        await page.tap('#bUiSmaller'); await page.tap('#bUiSmaller'); await page.wait_for_timeout(200)
        check(await page.evaluate("!localStorage.getItem('cityMapStudio.uiScale')"), 'retour à 100 % : préférence effacée (taille du système)')
        check(not errs, f'portrait : aucune erreur de page {errs}')
        await ctx.close()

        # ---------- Téléphone paysage ----------
        ctx, page, errs = await open_page({'width': 844, 'height': 390})
        pn, sg = await rect(page, '#panel'), await rect(page, '#stage')
        check(pn['x'] == 0 and sg['x'] >= pn['r'] - 1 and pn['h'] >= 380, 'paysage : deux colonnes, panneau à gauche sur toute la hauteur')
        check(not await page.is_visible('#shield') and not await page.is_visible('#grab'), 'paysage : ni poignée ni verrou')
        await page.screenshot(path=str(T / 'mobile-landscape.png'))
        check(not errs, f'paysage : aucune erreur de page {errs}')
        await ctx.close()

        # ---------- Ordinateur : comportement inchangé ----------
        ctx, page, errs = await open_page({'width': 1400, 'height': 900}, mobile=False)
        check(not await page.is_visible('#shield') and not await page.is_visible('#grab') and not await page.is_visible('#bFrame'),
              'ordinateur : ni poignée, ni verrou, ni bouton Cadrer')
        check(await page.evaluate("document.getElementById('stage').dataset.fab") == 'side', 'ordinateur : boutons flottants à droite')
        check(not errs, f'ordinateur : aucune erreur de page {errs}')
        await ctx.close()
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
