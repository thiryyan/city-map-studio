"""e2e : politique de sécurité du contenu (CSP) et structure des fichiers.

La page déclare une CSP stricte (aucun script ni style en ligne). On écoute les violations
(événement securitypolicyviolation) dès le chargement, en file:// puis en HTTP (comme GitHub Pages),
et on parcourt les fonctions qui touchent au DOM, aux canevas, aux workers et au réseau :
moteur Fichier, export, aperçu au mur, gabarit Ciel (script chargé à la demande), diagnostic
(requêtes vers tous les services autorisés), MapLibre (worker blob:), vignettes et polices.
Vérifie aussi qu'aucun style ni script n'est écrit dans le HTML.
"""
import pathlib, os, asyncio, threading, re, json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
ROOT = T.parent
CHROME = os.environ.get('CHROME') or None
FIX = (T / 'osm.json').read_text()
WATCH = "window.__csp=[]; document.addEventListener('securitypolicyviolation', e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));"


class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    html = (ROOT / 'index.html').read_text()
    body = html.split('<body>')[1]
    check(not re.search(r'<script(?![^>]*\bsrc=)', html) and '<style' not in html, 'aucun script ni style en ligne dans index.html')
    check(' style="' not in body and not re.search(r'\son[a-z]+="', body), 'aucun attribut style ni gestionnaire on…= dans le HTML')
    srcs = re.findall(r'<script src="([^"]+)"', html)
    check(all((ROOT / s).exists() for s in srcs) and len(srcs) >= 5, f'scripts présents : {srcs}')

    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Q, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    http = f'http://127.0.0.1:{srv.server_address[1]}'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for label, base in [('file://', ROOT.as_uri()), ('http', http)]:
            ctx = await b.new_context(viewport={'width': 1280, 'height': 860}, accept_downloads=True)
            await ctx.add_init_script(WATCH)
            page = await ctx.new_page(); errs = []; logs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.on('console', lambda m: logs.append(m.text) if 'Content Security Policy' in m.text else None)
            async def route(r):
                u = r.request.url
                if u.startswith('file:') or u.startswith(http): await r.continue_()
                else: await r.fulfill(status=503, body='', headers={'Access-Control-Allow-Origin': '*'})   # réseau simulé : services en panne
            await page.route('**/*', route)
            ev = page.evaluate
            await page.goto(base + '/index.html?test'); await page.wait_for_timeout(1500)
            await page.click('#bConsentYes'); await page.wait_for_timeout(800)          # accord : MapLibre (worker blob:) démarre
            if not await ev("document.getElementById('welStrip').hidden"): await page.click('#welClose')
            check(await ev("__cms.mlLib") == 'ok', f'{label} : MapLibre chargé depuis lib/')
            await ev("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(400)
            for tab in ['style', 'repere', 'textes', 'lieu']:
                await ev(f"__cms.showTab('{tab}')"); await page.wait_for_timeout(150)
            async with page.expect_download():
                await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
            await page.wait_for_timeout(500); await page.click('#resClose')
            await ev("__cms.showTab('export')"); await page.click('#bMockup'); await page.wait_for_timeout(1200); await page.click('#mockClose')
            await ev("__cms.setLayout('sky')"); await page.wait_for_timeout(1500)
            check(await ev("!!window.SKY_DATA"), f'{label} : données du ciel chargées (script à la demande)')
            await ev("__cms.setLayout('souvenir')")
            await ev("__cms.showTab('lieu')"); await page.click('#bDiag'); await page.wait_for_timeout(2500)   # requêtes vers chaque service autorisé
            await page.fill('#q', 'Blois'); await page.click('#searchForm [type=submit]'); await page.wait_for_timeout(600)
            v = await ev("window.__csp")
            check(not v and not logs, f'{label} : aucune violation de la CSP {v} {logs[:3]}')
            check(not errs, f'{label} : aucune erreur de page {errs}')
            await ctx.close()
        await b.close()
    srv.shutdown()
    print('ÉCHECS :', fails) if fails else print('OK')

asyncio.run(main())
