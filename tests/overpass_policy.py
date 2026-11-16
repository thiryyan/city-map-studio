"""e2e : politique Overpass (P0-4).

Miroir 1 → HTTP 406, miroir 2 → HTTP 429 (Retry-After: 7200), miroir 3 → réponse valide.
Vérifie : bascule vers le miroir 3 ; aucun nouvel essai vers les miroirs 1 et 2,
ni à l'actualisation suivante, ni après un rechargement de la page, ni par le diagnostic ;
durée de suspension (24 h pour 406, Retry-After pour 429) ; message clair quand tous
les miroirs sont suspendus.
"""
import pathlib, os, asyncio, collections
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri()
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'overpass.json').read()

async def main():
    hits = collections.Counter(); mode = {'all_fail': False}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
        page = await ctx.new_page(); errs = []
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1')}catch(e){}")  # accord préalable donné (cf. tests/consent.py)
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            u = r.request.url
            if u.startswith('file:'): return await r.continue_()
            if 'interpreter' in u:
                host = u.split('/')[2]; hits[host] += 1
                if 'private.coffee' in host: return await r.fulfill(status=406, body='Not Acceptable')
                if 'kumi' in host: return await r.fulfill(status=429, body='Too Many', headers={'Retry-After': '7200', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Retry-After'})
                if mode['all_fail']: return await r.fulfill(status=429, body='Too Many')
                return await r.fulfill(status=200, content_type='application/json', body=FIX)
            await r.abort()
        await page.route('**/*', route)
        await page.goto(APP); await page.wait_for_timeout(1200)
        await page.click('#engineSeg [data-v=overpass]'); await page.wait_for_timeout(1500)
        st = await page.inner_text('#stTxt'); print('1er chargement :', st, dict(hits))
        assert 'maps.mail.ru' in st and hits['overpass.private.coffee'] == 1 and hits['overpass.kumi.systems'] == 1
        blk = await page.evaluate("Object.fromEntries(Object.entries(__cms.opBlock).map(([k,v])=>[new URL(k).host,[v.status,Math.round((v.until-Date.now())/60000)]]))")
        print('suspensions (statut, minutes) :', blk)
        assert abs(blk['overpass.private.coffee'][1] - 1440) <= 1 and abs(blk['overpass.kumi.systems'][1] - 120) <= 1

        await page.evaluate("__cms.fetchOverpass()"); await page.wait_for_timeout(1000)
        print('2e requête :', dict(hits))
        await page.reload(); await page.wait_for_timeout(2000)
        print('après rechargement :', dict(hits))
        await page.click('#bDiag'); await page.wait_for_timeout(1500)
        diag = await page.inner_text('#diag'); print('diagnostic :', ' / '.join(l for l in diag.split('\n') if 'suspendu' in l))
        assert hits['overpass.private.coffee'] == 1 and hits['overpass.kumi.systems'] == 1, 'nouvel essai vers un serveur suspendu'

        mode['all_fail'] = True
        await page.evaluate("__cms.fetchOverpass()"); await page.wait_for_timeout(1000)
        before = dict(hits)
        await page.evaluate("__cms.fetchOverpass()"); await page.wait_for_timeout(1000)
        print('tous suspendus :', await page.inner_text('#stTxt'), '| bandeau :', await page.inner_text('#banner'))
        assert dict(hits) == before, 'requête émise alors que tous les serveurs sont suspendus'
        print('errors', errs); assert not errs
        await b.close()
    print('OK')
asyncio.run(main())
