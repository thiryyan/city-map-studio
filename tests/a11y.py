"""e2e : accessibilité au clavier et aux lecteurs d'écran.

- Fenêtres (<dialog> modal) : focus placé dans la fenêtre et retenu, arrière-plan inerte, Échap, retour du focus.
- Gabarits, thèmes et repères : boutons atteignables au clavier, état aria-pressed.
- Cibles tactiles des boutons de la ligne d'état : 44 px de haut au moins.
- Aperçu de l'affiche : texte de remplacement qui suit les réglages ; champs tous nommés.
"""
import pathlib, os, asyncio
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = (T / 'osm.json').read_text()


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 860}, accept_downloads=True)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        ev = page.evaluate

        # 1. Demande d'accord : fenêtre modale, focus sur « Afficher la carte », Échap = refuser
        await page.goto(APP); await page.wait_for_timeout(1500)
        check(await ev("document.getElementById('consent').open && document.getElementById('consent').matches(':modal')"), 'accord : <dialog> modal ouvert')
        check(await ev("document.activeElement.id") == 'bConsentYes', 'accord : focus sur « Afficher la carte »')
        # Tab : le focus parcourt la fenêtre, et peut passer par l'interface du navigateur (body), jamais par la page derrière
        seen = []
        for _ in range(8):
            await page.keyboard.press('Tab'); seen.append(await ev("document.activeElement===document.body ? 'body' : (document.activeElement.closest('#consent') ? 'in' : document.activeElement.id||document.activeElement.tagName)"))
        check(set(seen) <= {'in', 'body'} and 'in' in seen, f'accord : le focus reste dans la fenêtre (Tab) {seen}')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(500)
        check(not await ev("document.getElementById('consent').open") and await ev("__cms.st.engine") == 'file', 'accord : Échap = travailler hors ligne')
        check(not await ev("[...document.querySelectorAll('dialog')].some(d=>d.open)") and not await ev("document.getElementById('welStrip').hidden"),
              'bienvenue : proposition non bloquante (aucune fenêtre modale), ensuite')
        check(await ev("document.getElementById('welClose').getAttribute('aria-label')") == "Fermer la proposition d'ambiance", 'bienvenue : bouton de fermeture nommé')
        await page.click('#welClose'); await page.wait_for_timeout(200)

        # 2. Vignettes au clavier
        await ev("f=>__cms.importText(f,'osm.json')", FIX); await page.wait_for_timeout(400)
        await ev("__cms.showTab('style'); document.getElementById('styleMore').open=true")   # gabarits : dans « Plus de réglages »
        kinds = await ev("['#layouts .card','#themes .theme','#marks .card','#ambiances button'].map(s=>[...document.querySelectorAll(s)].every(e=>e.tagName==='BUTTON' && e.type==='button' && e.hasAttribute('aria-pressed')))")
        check(all(kinds), f'gabarits, thèmes, repères, ambiances : boutons avec aria-pressed {kinds}')
        await page.focus('#layouts .card[data-v=arch]'); await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.layout") == 'arch' and await ev("document.querySelector('#layouts [data-v=arch]').getAttribute('aria-pressed')") == 'true', 'gabarit choisi au clavier (Entrée)')
        await page.focus('#themes .theme[data-v=nuit]'); await page.keyboard.press('Space'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.theme") == 'nuit', 'thème choisi au clavier (Espace)')
        alt = await ev("document.getElementById('cvOver').getAttribute('aria-label')")
        check('Arche' in alt and 'Nuit boréale' in alt and 'BLOIS' not in alt and 'Blois' in alt, f'aperçu : texte de remplacement à jour ({alt})')

        # 3. Aperçu au mur : focus retenu, Échap, retour du focus sur le bouton d'origine
        await ev("__cms.showTab('export')"); await page.focus('#bMockup'); await page.keyboard.press('Enter'); await page.wait_for_timeout(1500)
        check(await ev("document.getElementById('mockup').open && !!document.activeElement.closest('#mockup')"), 'aperçu au mur : fenêtre ouverte, focus dedans')
        check(await ev("document.getElementById('app').matches(':modal')") is False and await ev("(()=>{ const r=document.getElementById('bExport').getBoundingClientRect(); return document.elementFromPoint(r.x+5,r.y+5)?.id!=='bExport'; })()"),
              'aperçu au mur : arrière-plan inaccessible')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
        check(not await ev("document.getElementById('mockup').open") and await ev("document.activeElement.id") == 'bMockup', 'aperçu au mur : Échap, focus rendu au bouton')

        # 4. Export (onglet Export) : résultat dans l'onglet, focus sur « Télécharger », « Masquer l'aperçu » rend le focus
        async with page.expect_download():
            await page.focus('#bExport'); await page.keyboard.press('Enter')
        await page.wait_for_timeout(800)
        check(await ev("!document.getElementById('result').hidden && document.getElementById('busy').getAttribute('role')==='status'"), 'export : résultat affiché dans l\'onglet ; attente annoncée (role=status)')
        check(not await ev("document.getElementById('app').inert"), 'export terminé : page de nouveau active')
        check(await ev("document.activeElement.id") == 'resDl', 'export : focus sur « Télécharger »')
        await page.focus('#resClose'); await page.keyboard.press('Enter'); await page.wait_for_timeout(200)
        check(await ev("document.getElementById('result').hidden") and await ev("document.activeElement.id") == 'bExport', 'export : « Masquer l\'aperçu », focus rendu au bouton d\'export')

        # 5. Cibles tactiles et noms accessibles
        small = await ev("[...document.querySelectorAll('.hist button,.uisz button,#bReset')].filter(e=>e.getBoundingClientRect().height<44).map(e=>e.id)")
        check(not small, f'ligne d\'état : boutons de 44 px de haut au moins {small}')
        unnamed = await ev("""[...document.querySelectorAll('input:not([type=hidden]),select,button')].filter(e=>{
            if(e.closest('[hidden]')||e.type==='file') return false;
            const lab=e.labels&&e.labels.length, al=e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||e.title, txt=(e.textContent||'').trim();
            return !(lab||al||(e.tagName==='BUTTON'&&txt)); }).map(e=>e.id||e.outerHTML.slice(0,60))""")
        check(not unnamed, f'tous les champs et boutons ont un nom accessible {unnamed}')
        check(await ev("getComputedStyle(document.documentElement).colorScheme") == 'dark', 'color-scheme sombre déclaré')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('ÉCHECS :', fails) if fails else print('OK')

asyncio.run(main())
