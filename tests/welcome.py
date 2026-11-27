"""e2e : ambiance proposée au premier lancement (issue #59 : non bloquante).

Première visite : une seule fenêtre modale, la demande d'accord ; puis l'affiche par défaut est visible et une
proposition d'ambiance s'affiche en tête des réglages, sans masquer l'affiche. Choisir une ambiance l'applique
(annulable) et la proposition reste pour en essayer d'autres ; la fermer (✕) la retire ; utilisée ou fermée, elle
ne revient plus. Pas de proposition pour un utilisateur qui a déjà une affiche enregistrée, ni à l'ouverture d'un
lien partagé.
Aucun script injecté : le stockage est écrit par la page elle-même (cf. tests/seed.py).
"""
import pathlib, os, asyncio, json
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri()+'?test'
CHROME = os.environ.get('CHROME') or None
shown = lambda page, id_: page.evaluate(f"document.getElementById('{id_}').classList.contains('show')")
strip = lambda page: page.evaluate("(()=>{ const s=document.getElementById('welStrip'); return !s.hidden && s.offsetParent!==null; })()")
modals = lambda page: page.evaluate("[...document.querySelectorAll('dialog')].filter(d=>d.open).map(d=>d.id)")

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

        # 1. Première visite : accord (seule fenêtre modale), puis affiche et proposition non bloquante
        ctx, page, errs = await fresh()
        await page.goto(APP); await page.wait_for_timeout(1500)
        check(await modals(page) == ['consent'] and not await strip(page), 'premier lancement : demande d\'accord seule')
        await page.click('#bConsentFile'); await page.wait_for_timeout(600)
        check(await modals(page) == [], 'après l\'accord : plus aucune fenêtre modale')
        check(await strip(page), 'après l\'accord : proposition d\'ambiance en tête des réglages')
        # hors ligne : les réglages défilent jusqu'à l'import (prioritaire) ; la proposition est dans le panneau, jamais sur l'affiche
        po, pn = await page.evaluate("[document.getElementById('poster').getBoundingClientRect(), document.getElementById('panel').getBoundingClientRect()].map(r=>({t:r.top,b:r.bottom,h:r.height}))")
        check(po['t'] >= 0 and po['h'] > 150 and pn['t'] >= po['b'] - 1 and await page.evaluate("!!document.getElementById('welStrip').closest('#panel')"),
              f"l'affiche reste en place, la proposition est dans le panneau ({po}, {pn})")
        n = await page.evaluate("document.querySelectorAll('#welAmb button').length")
        drawn = await page.evaluate("[...document.querySelectorAll('#welAmb canvas')].map(c=>c.toDataURL()).filter((v,i,a)=>a.indexOf(v)===i).length")
        check(n == 13 and drawn == 13, f'13 ambiances avec leur vignette ({n}, {drawn} distinctes)')
        await page.screenshot(path=str(T / 'welcome.png'))
        await page.click('#welAmb [data-v=naissance]'); await page.wait_for_timeout(600)
        st = await page.evaluate("[__cms.st.theme, __cms.st.layout, __cms.st.markerStyle]")
        check(st == ['sauge', 'arch', 'feet'], f'ambiance appliquée {st}')
        check(await strip(page) and await page.evaluate("document.querySelector('#welAmb [data-v=naissance]').getAttribute('aria-pressed')") == 'true',
              'la proposition reste, ambiance choisie marquée (en essayer d\'autres)')
        check(await page.evaluate("localStorage.getItem('cms3.welcomed')") == '1', 'choix mémorisé')
        await page.click('#bUndo'); await page.wait_for_timeout(300)
        check(await page.evaluate("__cms.st.layout") == 'souvenir', '« Annuler » revient à l\'affiche de départ')
        await page.click('#welClose'); await page.wait_for_timeout(200)
        check(not await strip(page), '✕ : proposition fermée')
        await page.reload(); await page.wait_for_timeout(1500)
        # « Travailler hors ligne » n'est pas mémorisé (l'accord est redemandé) ; l'ambiance, elle, n'est plus proposée
        if await shown(page, 'consent'): await page.click('#bConsentFile'); await page.wait_for_timeout(500)
        check(not await strip(page), 'visite suivante : plus de proposition d\'ambiance')
        check(not errs, f'aucune erreur de page {errs}')
        await ctx.close()

        # 2. Fermée sans rien choisir : affiche par défaut conservée, ne revient plus
        ctx, page, errs = await fresh({'width': 360, 'height': 740})
        await page.goto(APP); await page.wait_for_timeout(1200)
        await page.click('#bConsentYes'); await page.wait_for_timeout(800)
        inview = await page.evaluate("""(()=>{ const w=document.getElementById('welStrip').getBoundingClientRect(), t=document.querySelector('.tabbody').getBoundingClientRect(),
          p=document.getElementById('poster').getBoundingClientRect(); return w.top>=t.top-1 && w.top<t.bottom-40 && p.top>=0 && w.top>=p.bottom; })()""")
        check(await strip(page) and inview, '360 px, carte acceptée : proposition en vue au cran par défaut, sous l\'affiche')
        await page.screenshot(path=str(T / 'welcome-360.png'))
        await page.click('#welClose'); await page.wait_for_timeout(300)
        lay = await page.evaluate("__cms.st.layout")
        check(not await strip(page) and lay == 'souvenir', 'fermée : affiche par défaut conservée')
        check(await page.evaluate("localStorage.getItem('cms3.welcomed')") == '1', 'fermeture mémorisée')
        check(not errs, f'aucune erreur de page {errs}')
        await ctx.close()

        # 3. Utilisateur existant (affiche déjà enregistrée) : pas de proposition
        ctx, page, errs = await fresh()
        await page.goto(APP); await page.wait_for_timeout(800)
        await page.evaluate("""s=>{ localStorage.setItem('cms3.consent','1'); localStorage.setItem('cms3.affiche', s); }""",
                            json.dumps({'layout': 'classic', 'theme': 'souvenir'}))
        await page.reload(); await page.wait_for_timeout(1500)
        check(not await strip(page) and await page.evaluate("__cms.st.layout") == 'classic', 'affiche existante : aucune proposition')
        await ctx.close()

        # 4. Ouverture d'un lien partagé : pas de proposition
        ctx, page, errs = await fresh()
        await page.goto(APP); await page.wait_for_timeout(800)
        await page.evaluate("localStorage.setItem('cms3.consent','1'); localStorage.setItem('cms3.welcomed','1')")
        await page.reload(); await page.wait_for_timeout(1000)
        url = await page.evaluate("__cms.st.texts.title='Chambord'; __cms.encodeShare().then(r=>r.url)")
        await ctx.close()
        ctx, page, errs = await fresh()
        await page.goto(APP); await page.wait_for_timeout(800)
        await page.evaluate("localStorage.setItem('cms3.consent','1')")
        await page.goto(url); await page.reload(); await page.wait_for_timeout(1600)   # même page, seule l'ancre change : rechargement explicite
        check(not await strip(page) and await page.evaluate("__cms.st.texts.title") == 'Chambord', 'lien partagé : affiche ouverte, aucune proposition')
        check(not errs, f'aucune erreur de page {errs}')
        await ctx.close()
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
