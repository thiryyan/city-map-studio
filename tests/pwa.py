"""e2e : déploiement GitHub Pages (sous-chemin) et application installable, utilisable hors ligne.

Le dépôt est servi sous /city-map-studio/, comme sur https://<compte>.github.io/city-map-studio/ :
toutes les ressources doivent être en chemins relatifs. Vérifie :
- chargement complet sans erreur ni ressource manquante (404) ;
- manifeste valide, icônes présentes, balises de description et d'aperçu des liens ;
- service worker actif, qui ne met en cache aucune ressource tierce ;
- rechargement hors ligne : l'application démarre et exporte avec le moteur Fichier ;
- en file:// : ni manifeste ni service worker déclarés (refusés par le navigateur).
"""
import pathlib, os, asyncio, threading, json, tempfile
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.async_api import async_playwright
from jswait import wait_js
T = pathlib.Path(__file__).resolve().parent
ROOT = T.parent
CHROME = os.environ.get('CHROME') or None
FIX = (T / 'osm.json').read_text()
SEED = "localStorage.setItem('cityMapStudio.consent','1'); localStorage.setItem('cityMapStudio.welcomed','1')"


class Q(SimpleHTTPRequestHandler):
    status = []
    def log_message(self, *a): pass
    def send_response(self, code, *a):
        Q.status.append((code, self.path)); super().send_response(code, *a)


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    site = tempfile.mkdtemp(); os.symlink(ROOT, os.path.join(site, 'city-map-studio'))
    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Q, directory=site))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{srv.server_address[1]}/city-map-studio/'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 860}, accept_downloads=True)
        page = await ctx.new_page(); errs = []; ext = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            if r.request.url.startswith(base): await r.continue_()
            else: ext.append(r.request.url); await r.abort()
        await ctx.route('**/*', route)
        url = base + 'index.html?test&sw'
        await page.goto(url); await page.evaluate(SEED); await page.reload(); await page.wait_for_timeout(1500)

        # 1. Sous-chemin GitHub Pages : aucune ressource manquante
        missing = [pth for code, pth in Q.status if code >= 400]
        check(not missing and not errs, f'sous-chemin /city-map-studio/ : aucune ressource manquante {missing} ni erreur {errs}')

        # 2. Manifeste, icônes, balises
        man = await page.evaluate("document.querySelector('link[rel=manifest]')?.href")
        m = json.loads(await page.evaluate("u=>fetch(u).then(r=>r.text())", man)) if man else {}
        icons = await page.evaluate("""m=>Promise.all(m.icons.map(i=>fetch(new URL(i.src,document.querySelector('link[rel=manifest]').href)).then(r=>r.ok)))""", m) if m else []
        check(m.get('start_url') == './' and m.get('display') == 'standalone' and icons and all(icons) and any(i['purpose'] == 'maskable' for i in m['icons']),
              f'manifeste valide, {len(icons)} icônes présentes dont une « maskable »')
        meta = await page.evaluate("""['meta[name=description]','meta[property="og:image"]','meta[name="twitter:card"]','link[rel=icon]','link[rel=apple-touch-icon]']
            .map(s=>{ const e=document.querySelector(s); return !!e && !!(e.content||e.href); })""")
        check(all(meta), f'description, aperçu des liens (Open Graph), icônes {meta}')
        fav = await page.evaluate("fetch('icons/icon.svg').then(r=>r.ok)")
        check(fav, 'icône de l\'onglet servie')

        # 3. Service worker
        await wait_js(page, "navigator.serviceWorker.controller || false", timeout=15000) if await page.evaluate("!!navigator.serviceWorker") else None
        await page.reload(); await page.wait_for_timeout(1500)
        ctl = await page.evaluate("!!navigator.serviceWorker.controller")
        keys = await page.evaluate("caches.keys().then(async ks=>{ const out=[]; for(const k of ks){ const c=await caches.open(k); for(const r of await c.keys()) out.push(r.url); } return out; })")
        check(ctl and any(k.endswith('/js/main.js') for k in keys) and any(k.endswith('/lib/maplibre-gl.js') for k in keys), f'service worker actif, application en cache ({len(keys)} fichiers)')
        check(all(k.startswith(base) for k in keys), 'cache : aucune ressource tierce')

        # 4. Hors ligne
        await ctx.set_offline(True); errs.clear()
        await page.reload(); await page.wait_for_timeout(2000)
        ok = await page.evaluate("typeof __cms==='object' && document.title.startsWith('City Map Studio')")
        check(ok, 'hors ligne : l\'application démarre depuis le cache')
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        async with page.expect_download() as dl:
            await page.click('#bExport')
        d = await dl.value
        check(d.suggested_filename.endswith('300dpi.png'), 'hors ligne : export du moteur Fichier')
        check(not errs, f'hors ligne : aucune erreur de page {errs}')
        await ctx.set_offline(False); await ctx.close()

        # 5. file:// : rien de déclaré
        ctx = await b.new_context(); page = await ctx.new_page()
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        await page.goto(ROOT.as_uri() + '/index.html?test'); await page.wait_for_timeout(1200)
        check(await page.evaluate("!document.querySelector('link[rel=manifest]')"), 'file:// : aucun manifeste déclaré')
        await ctx.close(); await b.close()
    srv.shutdown()
    print('ÉCHECS :', fails) if fails else print('OK')

asyncio.run(main())
