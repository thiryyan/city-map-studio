"""e2e : chargement résilient de MapLibre (js/maplibre-loader.js, issue #31).

Réseau simulé : lib/ peut être bloquée, retardée au-delà du délai, ou servir une autre version ; les CDN servent la
copie de lib/ (empreinte SRI identique) avec l'en-tête CORS, ou sont bloqués. Délai du chargeur abaissé à 1 s
(__cmsTestConfig) pour garder le test court.

Vérifie : bascule vers unpkg, aucune double instance quand la copie locale arrive en retard, adoption d'une copie
arrivée après l'échec de toutes les sources, refus d'une autre version, feuille de style de secours, aucun CDN sans accord.
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()   # site testé : dist/ (construit par run_all.py), ou CMS_ROOT
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
LIBJS = (ROOT / 'lib/maplibre-gl.js').read_bytes()
LIBCSS = (ROOT / 'lib/maplibre-gl.css').read_bytes()
CORS = {'Access-Control-Allow-Origin': '*'}
ok_count = 0


def check(cond, msg):
    global ok_count
    print(('✓ ' if cond else '✗ ') + msg)
    ok_count += bool(cond)


async def scenario(b, name, lib='ok', libcss='ok', cdn=True, consent=True, delay=0):
    """lib : 'ok' | 'block' | 'late' (servie après `delay` s) | 'wrong' (autre version)"""
    ctx = await b.new_context(viewport={'width': 1200, 'height': 800})
    page = await ctx.new_page()
    init = "window.__cmsTestConfig={mlTimeout:1000,mlCssTimeout:1000};addEventListener('cms:maplibre-ready',()=>{window.__lateReady=true});try{localStorage.setItem('cms3.welcomed','1');"
    init += ("localStorage.setItem('cms3.consent','1');" if consent else '') + "}catch(e){}"
    await page.add_init_script(init)
    logs, remote = [], []
    page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))

    async def route(r):
        u = r.request.url
        if u.endswith('lib/maplibre-gl.js'):
            if lib == 'block': return await r.abort()
            if lib == 'late': await asyncio.sleep(delay)
            if lib == 'wrong': return await r.fulfill(body="window.maplibregl={getVersion:()=>'0.0.1'};", content_type='text/javascript')
            return await r.continue_()
        if u.endswith('lib/maplibre-gl.css') and libcss == 'block': return await r.abort()
        if u.startswith('file:'): return await r.continue_()
        if 'maplibre-gl' in u:
            remote.append(u)
            if not cdn: return await r.abort()
            if u.endswith('.js'): return await r.fulfill(body=LIBJS, content_type='text/javascript', headers=CORS)
            if u.endswith('.css'): return await r.fulfill(body=LIBCSS, content_type='text/css', headers=CORS)
        await r.abort()
    await page.route('**/*', route)
    await page.goto(APP)
    return ctx, page, logs, remote


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'])

        # 1. lib/ bloquée : unpkg (SRI) prend le relais
        ctx, page, logs, remote = await scenario(b, 'block', lib='block')
        await wait_js(page, "__cms.mlLib==='ok'", 15000)
        check(await page.evaluate("CMS.maplibre.source") == 'unpkg.com', 'lib/ bloquée : MapLibre chargé depuis unpkg')
        check(await page.evaluate("CMS.maplibre.cssOk && !!document.querySelector('link[data-maplibre*=unpkg]')"), 'lib/ bloquée : feuille de style de unpkg')
        check(not logs, 'lib/ bloquée : aucune erreur de page ' + ' '.join(logs))
        await ctx.close()

        # 2. lib/ arrive après le délai, alors que unpkg a déjà gagné : une seule instance utilisée
        ctx, page, logs, remote = await scenario(b, 'late', lib='late', delay=3)
        await wait_js(page, "__cms.mlLib==='ok'", 15000)
        await page.evaluate("window.__ref=CMS.maplibre.lib")
        await wait_js(page, "document.querySelectorAll('script[data-maplibre]').length===2", 5000)
        await page.wait_for_timeout(3500)   # la copie locale est arrivée et s'est exécutée entre-temps
        same = await page.evaluate("window.maplibregl===window.__ref && CMS.maplibre.lib===window.__ref")
        check(same, 'copie locale tardive : référence gagnante rétablie (une seule instance)')
        check(await page.evaluate("CMS.maplibre.source") == 'unpkg.com', 'copie locale tardive : source = unpkg')
        check(await page.evaluate("!!__cms.mlMap"), 'copie locale tardive : carte créée')
        check(not logs, 'copie locale tardive : aucune erreur de page ' + ' '.join(logs))
        await ctx.close()

        # 3. toutes les sources en échec, puis la copie locale arrive : elle est adoptée
        ctx, page, logs, remote = await scenario(b, 'all-fail', lib='late', cdn=False, delay=3)
        await wait_js(page, "__cms.mlLib==='ok'", 15000)
        check(await page.evaluate("window.__lateReady===true && CMS.maplibre.source.includes('arrivée tardive')"), 'toutes les sources en échec : la copie tardive est adoptée (cms:maplibre-ready)')
        check(len(remote) == 3, 'toutes les sources en échec : les 3 CDN ont été essayés')
        check(await page.evaluate("!/MapLibre injoignable/.test(document.getElementById('stTxt').textContent) && !document.querySelector('#engineSeg [data-v=maplibre]').disabled && !!__cms.mlMap"), 'copie tardive : moteur GPU réactivé, carte créée')
        check(not logs, 'copie tardive : aucune erreur de page ' + ' '.join(logs))
        await ctx.close()

        # 4. lib/ d'une autre version : refusée, unpkg prend le relais
        ctx, page, logs, remote = await scenario(b, 'wrong', lib='wrong')
        await wait_js(page, "__cms.mlLib==='ok'", 15000)
        check(await page.evaluate("CMS.maplibre.source==='unpkg.com' && CMS.maplibre.lib.getVersion()==='4.7.1'"), 'autre version dans lib/ : refusée, 4.7.1 depuis unpkg')
        await ctx.close()

        # 5. feuille de style locale absente : celle d'un CDN autorisé est utilisée
        ctx, page, logs, remote = await scenario(b, 'css', libcss='block')
        await wait_js(page, "__cms.mlLib==='ok' && CMS.maplibre.cssOk", 15000)
        check(await page.evaluate("CMS.maplibre.source.startsWith('copie locale') && !!document.querySelector('link[data-maplibre*=unpkg]')"), 'CSS locale absente : script local, CSS de secours (unpkg)')
        await ctx.close()

        # 6. sans accord : lib/ bloquée, aucune requête vers un CDN
        ctx, page, logs, remote = await scenario(b, 'noconsent', lib='block', consent=False)
        await wait_js(page, "__cms.mlLib==='local-fail'", 15000)
        await page.wait_for_timeout(500)
        check(not remote, 'sans accord : aucune requête vers un CDN ' + ' '.join(remote))
        await ctx.close()
        await b.close()
    print(f'{ok_count} vérifications réussies')

asyncio.run(main())
