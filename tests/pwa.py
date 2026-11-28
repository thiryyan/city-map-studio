"""e2e : déploiement GitHub Pages (sous-chemin) et application installable, utilisable hors ligne.

Le dépôt est servi sous /city-map-studio/, comme sur https://<compte>.github.io/city-map-studio/ :
toutes les ressources doivent être en chemins relatifs. Vérifie :
- chargement complet sans erreur ni ressource manquante (404) ;
- manifeste valide, icônes présentes, balises de description et d'aperçu des liens ;
- service worker actif, qui ne met en cache aucune ressource tierce ;
- liste APP de sw.js complète (js/, css/, lib/ hors lib/sky/) et sans fichier manquant ;
- cache HTTP contourné (GitHub Pages : max-age=600) ; version affichée ; vérifications au plus une fois par heure ;
- déploiement simulé : bandeau « Mettre à jour » sur une page déjà contrôlée (pas à la première installation),
  un seul rechargement, état de l'affiche conservé (issue #65) ;
- rechargement hors ligne : l'application démarre et exporte avec le moteur Fichier ;
- en file:// : ni manifeste ni service worker déclarés (refusés par le navigateur).
"""
import pathlib, os, asyncio, threading, json, tempfile, re
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.async_api import async_playwright
from jswait import wait_js
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()   # site testé : dist/ (construit par run_all.py), ou CMS_ROOT
CHROME = os.environ.get('CHROME') or None
FIX = (T / 'osm.json').read_text()
SEED = "localStorage.setItem('cms3.consent','1'); localStorage.setItem('cms3.welcomed','1')"


SW = (ROOT / 'sw.js').read_text(encoding='utf-8')
VERSION = re.search(r"const VERSION = '([^']+)'", SW).group(1)
# Script de l'application : js/main.js dans la source, le script unique (js/app.<empreinte>.js) dans dist/
MAIN = 'js/main.js' if (ROOT / 'js' / 'main.js').is_file() else re.search(r'<script src="(js/app\.[0-9a-f]+\.js)"', (ROOT / 'index.html').read_text(encoding='utf-8')).group(1)


def label(v):
    """Libellé affiché (CMS.build.label) : cms-2026-11-24h → 24/11/2026 (h) ; cms-2026-11-28-3522713 → 28/11/2026 (3522713)"""
    m = re.match(r'cms-(\d{4})-(\d\d)-(\d\d)-?(.*)$', v)
    return (f'{m[3]}/{m[2]}/{m[1]}' + (f' ({m[4]})' if m[4] else '')) if m else v


class Q(SimpleHTTPRequestHandler):
    """Comme GitHub Pages : Cache-Control max-age=600. deploy : sw.js et les scripts servis avec une nouvelle VERSION
    (source : js/core.js ; dist/ : le script unique, qui contient CMS.build)."""
    status = []; reqs = []; deploy = False
    def log_message(self, *a): pass
    def send_response(self, code, *a):
        Q.status.append((code, self.path)); super().send_response(code, *a)
    def end_headers(self):
        self.send_header('Cache-Control', 'max-age=600'); super().end_headers()
    def do_GET(self):
        Q.reqs.append((self.path, self.headers.get('Cache-Control', ''), self.headers.get('Service-Worker', '')))
        p = self.path.split('?')[0]
        f = ROOT / p.removeprefix('/city-map-studio/')
        if Q.deploy and p.endswith('.js') and f.is_file() and VERSION in (src := f.read_text(encoding='utf-8')):
            body = src.replace(VERSION, VERSION + '-deploy').encode()
            self.send_response(200); self.send_header('Content-Type', 'text/javascript'); self.send_header('Content-Length', str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        super().do_GET()


def app_coverage():
    """Tout fichier de js/, css/ et lib/ (hors lib/sky/, polices woff2 chargées à la demande, licences) figure dans APP, et réciproquement."""
    app = set(re.findall(r"'([^']+)'", re.search(r'const APP = \[(.*?)\];', SW, re.S).group(1))) - {'./'}
    files = {str(f.relative_to(ROOT)) for d in ('js', 'css', 'lib') for f in (ROOT / d).rglob('*')
             if f.is_file() and f.suffix in ('.js', '.css') and not str(f.relative_to(ROOT)).startswith('lib/sky/')}
    return sorted(files - app), sorted(f for f in app if not (ROOT / f).is_file())


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    absent, missing_app = app_coverage()
    check(not absent, f'sw.js : tout fichier de js/, css/, lib/ figure dans APP (absents : {absent})')
    check(not missing_app, f'sw.js : tout élément de APP existe (introuvables : {missing_app})')
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
        check(m.get('id') == './', 'manifeste : identité figée (id)')
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
        check(ctl and any(k.endswith('/' + MAIN) for k in keys) and any(k.endswith('/lib/maplibre-gl.js') for k in keys), f'service worker actif, application en cache ({len(keys)} fichiers)')
        check(all(k.startswith(base) for k in keys), 'cache : aucune ressource tierce')

        # 3 bis. Cache HTTP contourné : malgré max-age=600, l'application est revalidée auprès du serveur (#65)
        Q.reqs.clear(); await page.goto(url)
        await wait_js(page, "(window.__cms && __cms.pwa.checks>0) || false", timeout=15000); await page.wait_for_timeout(500)
        main_js = [r for r in Q.reqs if r[0].split('?')[0].endswith('/' + MAIN)]
        check(main_js and all('max-age=0' in r[1] or 'no-cache' in r[1] for r in main_js),
              f'réseau d\'abord sans copie du cache HTTP : {MAIN} redemandé au serveur ({main_js})')
        sw_reqs = [r for r in Q.reqs if r[0].split('?')[0].endswith('/sw.js')]
        check(sw_reqs, f'vérification de mise à jour au démarrage (sw.js redemandé : {len(sw_reqs)})')
        await wait_js(page, "!!document.getElementById('appVersion').dataset.sw || false", timeout=5000)
        check(await page.text_content('#appVersion') == f'Version : {label(VERSION)}', f"version affichée : {await page.text_content('#appVersion')}")
        check(await page.evaluate("[document.getElementById('appVersion').dataset.version, document.getElementById('appVersion').dataset.sw]") == [VERSION, VERSION],
              'version de la page = version du service worker (data-version, data-sw)')
        check(not await page.evaluate("document.getElementById('updBanner').classList.contains('show')"),
              'première installation : aucun bandeau de mise à jour')

        # 3 ter. Au plus une vérification par heure, au retour au premier plan
        n0 = await page.evaluate("__cms.pwa.checks")
        await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        early = await page.evaluate("__cms.pwa.check(Date.now()+60e3)")
        late = await page.evaluate("__cms.pwa.check(Date.now()+3600e3+1)")
        check(n0 >= 1 and not early and late and await page.evaluate("__cms.pwa.checks") == n0 + 1,
              f'reg.update() : au démarrage, puis au plus une fois par heure ({n0} → {await page.evaluate("__cms.pwa.checks")})')

        # 3 quater. Déploiement simulé : bandeau, « Mettre à jour », un seul rechargement, état conservé
        await page.evaluate("""()=>{ const i=document.querySelector('input[data-k="texts.title"]'); i.value='Mise à jour 65'; i.dispatchEvent(new Event('input',{bubbles:true})); }""")
        await wait_js(page, "(localStorage.getItem('cms3.affiche')||'').includes('Mise à jour 65') || false", timeout=5000)
        # Cache d'une autre copie de l'application sur la même origine (/nouvelle/, /pr-N/ ; #97) : jamais purgé par celle-ci
        await page.evaluate("caches.open('cms-autre@/autre-copie/').then(c=>c.put('autre-copie.txt', new Response('x')))")
        Q.deploy = True
        await page.evaluate("__cms.pwa.check(Date.now()+7200e3)")
        await wait_js(page, "document.getElementById('updBanner').classList.contains('show') || false", timeout=15000)
        check(await page.is_visible('#bUpdate'), 'nouvelle version : bandeau « Mettre à jour » sur la page déjà contrôlée')
        check(await page.evaluate("__cms.pwa.reg.waiting && __cms.pwa.reg.active && true") or False, 'nouveau worker en attente, ancien toujours actif (pas d\'activation sans accord)')
        loads = []; page.on('load', lambda: loads.append(1))
        await page.evaluate("window.__avant=1"); await page.click('#bUpdate')
        await page.wait_for_timeout(3000)
        check(len(loads) == 1 and await page.evaluate("typeof window.__avant") == 'undefined', f'« Mettre à jour » : page rechargée une seule fois ({len(loads)})')
        await wait_js(page, "(document.getElementById('appVersion').dataset.sw||'').includes('deploy') || false", timeout=5000)
        check(await page.text_content('#appVersion') == f'Version : {label(VERSION + "-deploy")}', f"nouvelle version active : {await page.text_content('#appVersion')}")
        check(await page.evaluate("__cms.st.texts.title") == 'Mise à jour 65', 'état de l\'affiche conservé après la mise à jour')
        check(not await page.evaluate("document.getElementById('updBanner').classList.contains('show')"), 'après la mise à jour : plus de bandeau')
        old = sorted(await page.evaluate("caches.keys()"))
        scope = await page.evaluate("new URL(__cms.pwa.reg.scope).pathname")
        check(old == sorted([f'{VERSION}-deploy@{scope}', 'cms-autre@/autre-copie/']),
              f'ancien cache de ce dossier purgé, cache d\'une autre copie conservé : {old}')

        # 4. Hors ligne
        await ctx.set_offline(True); errs.clear()
        await page.reload(); await page.wait_for_timeout(2000)
        ok = await page.evaluate("typeof __cms==='object' && document.title.startsWith('City Map Studio')")
        check(ok, 'hors ligne : l\'application démarre depuis le cache')
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        async with page.expect_download() as dl:
            await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
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
