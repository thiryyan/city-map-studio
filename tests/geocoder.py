"""e2e : client Nominatim (js/geocoder.js, CMS.geocoder ; issue #32).

Nominatim simulé : muet, 429, 503 puis 200, réponse piégée. Délais abaissés par __cmsTestConfig (seulement avec ?test).
Vérifie : délai dépassé (bouton réactivé), quota respecté sans nouvelle requête, une relance sur 5xx, cache,
une requête par seconde au plus, double validation ignorée, réponse piégée rendue comme texte, coordonnées invalides écartées,
diagnostic sur /status (aucune recherche consommée).
"""
import asyncio, json, os, pathlib, time
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent).resolve()   # site testé : source, ou dist/ (CI)
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
OK = json.dumps([
    {'lat': '48.8582599', 'lon': '2.2945006', 'name': 'Tour Eiffel', 'display_name': 'Tour Eiffel, Paris, France', 'osm_type': 'way', 'osm_id': 5013364},
    {'lat': 'abc', 'lon': '2.3', 'name': 'Invalide', 'display_name': 'Invalide'},
    {'lat': '48.85', 'lon': '2.35', 'name': '<img src=x id=pwn>', 'display_name': '<img src=x id=pwn>, Paris'},
    {'lat': '48.86', 'lon': '2.33'},
])
fails = []


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def open_page(b, mode):
    ctx = await b.new_context(viewport={'width': 1200, 'height': 800})
    page = await ctx.new_page()
    await page.add_init_script("window.__cmsTestConfig={geoTimeout:1500,geoRetry:300,geoInterval:1100};"
                               "try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.welcomed','1')}catch(e){}")
    errs, reqs = [], []
    page.on('pageerror', lambda e: errs.append(str(e)))
    state = {'n': 0}

    async def route(r):
        u = r.request.url
        if 'nominatim.openstreetmap.org' in u:
            reqs.append((time.monotonic(), u)); state['n'] += 1
            if mode == 'hang': await asyncio.sleep(10); return await r.abort()
            if mode == '429': return await r.fulfill(status=429, body='Too many requests', headers={'Access-Control-Allow-Origin': '*'})
            if mode == '503' and state['n'] == 1: return await r.fulfill(status=503, body='busy', headers={'Access-Control-Allow-Origin': '*'})
            if mode == 'nocors' and '/status' in u:   # /status sans en-tête CORS : l'appel lisible échoue (comme dans un navigateur), l'appel no-cors passe
                if 'origin' in await r.request.all_headers(): return await r.abort()   # appel lisible (cors) : en-tête Origin
                return await r.fulfill(status=200, content_type='application/json', body='{"status":0,"message":"OK"}')
            body = '{"status":0,"message":"OK"}' if '/status' in u else OK
            return await r.fulfill(status=200, content_type='application/json', body=body, headers={'Access-Control-Allow-Origin': '*'})
        if u.startswith('file:'): return await r.continue_()
        await r.abort()
    await page.route('**/*', route)
    await page.goto(APP)
    await wait_js(page, "typeof __cms==='object'", 20000)
    await page.evaluate("__cms.setEngine('file')")
    return ctx, page, errs, reqs


async def submit(page, q):
    await page.evaluate("__cms.showTab('lieu')")
    await page.fill('#q', q); await page.press('#q', 'Enter')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])

        # Serveur muet : délai dépassé, bouton réactivé
        ctx, page, errs, reqs = await open_page(b, 'hang')
        t0 = time.monotonic(); await submit(page, 'Blois')
        await wait_js(page, "/ne répond pas/.test(document.getElementById('results').textContent)", 5000)
        check(time.monotonic() - t0 < 3, f'serveur muet : message après le délai ({time.monotonic() - t0:.1f} s)')
        check(not await page.is_disabled('#searchForm [type=submit]'), 'serveur muet : bouton « Chercher » réactivé')
        await ctx.close()

        # 429 : message avec délai, aucune requête pendant l'attente
        ctx, page, errs, reqs = await open_page(b, '429')
        await submit(page, 'Blois')
        await wait_js(page, "/Trop de recherches/.test(document.getElementById('results').textContent)", 5000)
        check('60 s' in await page.inner_text('#results'), 'quota : délai d\'attente annoncé (60 s par défaut, Retry-After non exposé)')
        await page.wait_for_timeout(1200); await submit(page, 'Tours'); await page.wait_for_timeout(800)
        check(len(reqs) == 1, f'quota : aucune requête pendant l\'attente ({len(reqs)} requête(s))')
        await ctx.close()

        # 503 puis 200 : une relance, résultats affichés ; validation des réponses ; cache ; une requête par seconde
        ctx, page, errs, reqs = await open_page(b, '503')
        await submit(page, 'tour eiffel')
        await wait_js(page, "document.querySelectorAll('#results .res').length>0", 5000)
        check(len(reqs) == 2, f'5xx : une seule relance ({len(reqs)} requêtes)')
        n = await page.evaluate("document.querySelectorAll('#results .res').length")
        check(n == 3, f'coordonnées invalides écartées ({n} résultats sur 4)')
        check(await page.evaluate("!document.getElementById('pwn') && document.getElementById('results').textContent.includes('<img src=x id=pwn>')"),
              'nom piégé affiché comme texte, aucun élément injecté')
        await submit(page, 'Tour  Eiffel'); await page.wait_for_timeout(500)
        check(len(reqs) == 2, f'même requête : servie par le cache ({len(reqs)} requêtes)')
        await submit(page, 'Blois'); await page.wait_for_timeout(50); await page.press('#q', 'Enter')
        await wait_js(page, f"document.getElementById('results').textContent.length>0 && !document.getElementById('results').hasAttribute('aria-busy')", 5000)
        check(len(reqs) == 3, f'double validation : une seule requête ({len(reqs)} requêtes)')
        await submit(page, 'Tours')
        await wait_js(page, "!document.getElementById('results').hasAttribute('aria-busy')", 5000)
        gap = reqs[-1][0] - reqs[-2][0]
        check(len(reqs) == 4 and gap >= 1.0, f'au plus une requête par seconde (écart {gap:.2f} s)')
        await page.click('#results .res button')
        m = await page.evaluate("[__cms.st.marker.lat, __cms.st.marker.lon]")
        check(abs(m[0] - 48.8582599) < 1e-6 and abs(m[1] - 2.2945006) < 1e-6, f'résultat choisi : repère placé {m}')
        # Diagnostic : /status, pas une recherche
        await page.evaluate("__cms.runDiagnostics()"); await page.wait_for_timeout(800)
        check('/status' in reqs[-1][1] and 'q=' not in reqs[-1][1], f'diagnostic : état du service, sans recherche ({reqs[-1][1]})')
        await wait_js(page, "!document.getElementById('bDiag').disabled", 8000)
        diag = await page.evaluate("Object.fromEntries([...document.querySelectorAll('#diag > div')].filter(d=>d.children.length>=3).map(d=>[d.children[1].textContent, d.children[0].textContent]))")
        check(diag.get('Géocodage Nominatim') == '✓', f'diagnostic : Nominatim joignable {diag}')
        check(not errs, f'aucune erreur de page {errs}')
        await ctx.close()

        # /status sans en-tête CORS (réponse illisible) : serveur joignable, pas d'échec du diagnostic
        ctx, page, errs, reqs = await open_page(b, 'nocors')
        await page.evaluate("__cms.runDiagnostics()"); await wait_js(page, "!document.getElementById('bDiag').disabled", 8000)
        row = await page.evaluate("(()=>{ const d=[...document.querySelectorAll('#diag > div')].find(d=>d.children.length>=3 && d.children[1].textContent==='Géocodage Nominatim'); return [d.children[0].textContent, d.children[2].textContent]; })()")
        check(row[0] == '✓' and 'joignable' in row[1], f'/status sans CORS : serveur signalé joignable {row}')
        await ctx.close()
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
