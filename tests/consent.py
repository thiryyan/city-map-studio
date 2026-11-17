"""e2e : accord préalable aux services tiers (RGPD).

Sans accord : aucune requête externe au démarrage, ni à la recherche, ni en
passant au moteur Overpass, ni au diagnostic ; la demande d'accord s'affiche.
Après « Afficher la carte » : l'action en attente s'exécute et l'accord est
mémorisé. « Retirer l'accord » revient à l'état initial. « Travailler hors
ligne » passe au moteur Fichier sans aucune requête.
"""
import pathlib, os, asyncio, threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
ROOT = T.parent
CHROME = os.environ.get('CHROME') or None

class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

async def main():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Q, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{srv.server_address[1]}'
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); ext = []; errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            u = r.request.url
            if u.startswith(base): return await r.continue_()
            ext.append(u.split('/')[2]); await r.abort()
        await page.route('**/*', route)
        visible = lambda: page.evaluate("document.getElementById('consent').classList.contains('show')")

        await page.goto(base + '/index.html'); await page.wait_for_timeout(2500)
        check(not ext, f'démarrage sans requête tierce {sorted(set(ext))}')
        check(await visible(), 'demande d\'accord affichée au démarrage')
        await page.screenshot(path=str(T / 'consent.png'))
        # Choix d'ambiance du premier lancement déjà fait (testé par tests/welcome.py) : écrit par la page, sans script injecté
        await page.evaluate("localStorage.setItem('cityMapStudio.welcomed','1')")

        # La demande est modale : « Travailler hors ligne » la ferme ; chaque action réseau la fait réapparaître, sans requête
        await page.click('#bConsentFile'); await page.wait_for_timeout(500)
        check(not await visible() and await page.evaluate('__cms.st.engine') == 'file', 'refus : demande fermée, moteur Fichier')
        dot = await page.evaluate("document.getElementById('stDot').className")
        check('wait' in dot, f'état hors ligne signalé (pastille orange, pas verte) : {dot}')
        reshown = []
        await page.fill('#q', 'Blois'); await page.press('#q', 'Enter'); await page.wait_for_timeout(800)
        reshown.append(await visible()); await page.click('#bConsentFile'); await page.wait_for_timeout(300)
        await page.click('#engineSeg [data-v=overpass]'); await page.wait_for_timeout(800)
        reshown.append(await visible()); await page.click('#bConsentFile'); await page.wait_for_timeout(300)
        await page.click('#bDiag'); await page.wait_for_timeout(800)
        reshown.append(await visible())
        check(all(reshown), f'recherche, Overpass et diagnostic redemandent l\'accord {reshown}')
        check(not ext, f'recherche, Overpass et diagnostic bloqués sans accord {sorted(set(ext))}')

        await page.click('#bConsentYes'); await page.wait_for_timeout(2500)
        hosts = sorted(set(ext))
        check(await page.evaluate('__cms.consent') and not await visible(), 'accord donné, demande masquée')
        check(any('overpass' in h or 'mail.ru' in h for h in hosts) and 'nominatim.openstreetmap.org' in hosts,
              f'action en attente (diagnostic) exécutée après accord {hosts}')

        ext.clear(); await page.reload(); await page.wait_for_timeout(1500)
        check(not await visible() and await page.evaluate('__cms.consent'), 'accord mémorisé après rechargement')

        await page.click('#consentInfo button'); await page.wait_for_load_state(); ext.clear(); await page.wait_for_timeout(2000)
        check(not await page.evaluate('__cms.consent'), 'accord retiré')
        check(await visible() and not ext, f'retour à l\'état initial, sans requête {sorted(set(ext))}')

        await page.click('#bConsentFile'); await page.wait_for_timeout(800)
        check(await page.evaluate('__cms.st.engine') == 'file' and not await visible() and not ext, 'hors ligne : moteur Fichier, aucune requête')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    srv.shutdown(); print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
