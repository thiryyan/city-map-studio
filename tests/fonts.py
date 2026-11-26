"""e2e : polices auto-hébergées (lib/fonts/).

Tout accès réseau externe est coupé et journalisé. Pour chaque famille et en
file:// comme en HTTP local : les variantes normale et italique se chargent
depuis lib/fonts, l'export ne signale aucune police de secours, et aucune
requête ne part vers un service tiers (Google Fonts compris).
"""
import pathlib, os, asyncio, threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
ROOT = T.parent
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
FAMILIES = ['serif', 'sans', 'mono', 'garamond', 'deco', 'bodoni', 'italiana', 'fraunces', 'jost', 'bebas', 'vibes', 'cinzel', 'fell', 'marcellus']

class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

async def check(b, url, label):
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
    page = await ctx.new_page(); errs = []; ext = []; fails = []
    await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.advOpen','1');localStorage.setItem('cityMapStudio.styleMoreOpen','1');localStorage.setItem('cityMapStudio.themeOpen','1');localStorage.setItem('cityMapStudio.textMoreOpen','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")  # accord préalable donné (cf. tests/consent.py)
    page.on('pageerror', lambda e: errs.append(str(e)))
    async def route(r):
        u = r.request.url
        if u.startswith('file:') or u.startswith('http://127.0.0.1'): return await r.continue_()
        ext.append(u); await r.abort()
    await page.route('**/*', route)
    await page.goto(url); await page.wait_for_timeout(1200)
    await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
    await page.click('#tabs [data-tab=textes]')   # les polices sont dans l'onglet Textes (section Typographie, #72)
    for f in FAMILIES:
        await page.click(f'#fontSeg [data-v={f}]'); await page.wait_for_timeout(300)
        # variantes attendues : celles que déclare FONTS[f].load (certaines familles n'ont pas d'italique)
        res = await page.evaluate("""async f=>{ const F=__cms.FONTS[f], L=F.fam.split(',')[0].replace(/["']/g,'').trim();
            const faces=[...document.fonts].filter(x=>x.family.replace(/["']/g,'')===L && x.status==='loaded').map(x=>x.style+' '+x.weight);
            return {faces:[...new Set(faces)].sort(), italic:F.load.some(l=>l.startsWith('italic'))} }""", f)
        ok = any(x.startswith('normal') for x in res['faces']) and (not res['italic'] or any(x.startswith('italic') for x in res['faces']))
        print(f'  {label} {f:9}', '✓' if ok else '✗', res['faces'])
        if not ok: fails.append(f'{label}:{f}')
    async with page.expect_download() as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
    await dl.value; info = await page.inner_text('#resInfo')
    print(f'  {label} export :', info)
    if 'police' in info: fails.append(f'{label}: export avec police de secours')
    google = [u for u in ext if 'google' in u or 'gstatic' in u]
    print(f'  {label} requêtes externes :', sorted({u.split('/')[2] for u in ext}), '| Google :', len(google))
    if google: fails.append(f'{label}: appel Google')
    if errs: fails.append(f'{label}: {errs}')
    await ctx.close(); return fails

async def main():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Q, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        fails = await check(b, (ROOT / 'index.html').as_uri()+'?test', 'file://')
        fails += await check(b, f'http://127.0.0.1:{srv.server_address[1]}/index.html?test', 'http')
        await b.close()
    srv.shutdown(); print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
