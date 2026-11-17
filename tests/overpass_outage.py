"""e2e : panne des serveurs Overpass alors que la connexion fonctionne.

Reproduit le diagnostic observé sur mobile depuis github.io :
private.coffee et kumi.systems ne répondent pas (délai dépassé), maps.mail.ru → HTTP 504,
overpass-api.de → HTTP 502 sans en-tête CORS (la page ne voit qu'un « Failed to fetch »).
Les tuiles OpenFreeMap répondent.
Vérifie : aucun message « accès réseau bloqué » ; la barre d'état et la notification attribuent
la panne aux serveurs ; le détail par miroir est dans l'infobulle ; le diagnostic conclut
explicitement sur Overpass ; aucun serveur n'est suspendu (5xx et délai ≠ 406/429).
"""
import pathlib, os, asyncio, collections
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri()
CHROME = os.environ.get('CHROME') or None
CORS = {'Access-Control-Allow-Origin': '*'}

async def main():
    hits = collections.Counter()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
        page = await ctx.new_page(); errs = []
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.advOpen','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            u = r.request.url
            if u.startswith('file:'): return await r.continue_()
            if 'interpreter' in u:
                host = u.split('/')[2]; hits[host] += 1
                if 'private.coffee' in host or 'kumi' in host:
                    await asyncio.sleep(1.5)   # au-delà des délais abaissés ci-dessous
                    try: return await r.fulfill(status=200, body='{}', headers=CORS)
                    except Exception: return
                if 'mail.ru' in host: return await r.fulfill(status=504, body='Gateway Timeout', headers=CORS)
                # 502 sans en-tête CORS : la page ne voit qu'un TypeError (« Failed to fetch »).
                # En file://, Chromium laisse lire la réponse : on simule donc l'échec réseau équivalent.
                return await r.abort('failed')
            if 'openfreemap' in u and u.endswith('/planet'):
                return await r.fulfill(status=200, content_type='application/json', body='{"tiles":["https://tiles.openfreemap.org/x/{z}/{x}/{y}.pbf"]}', headers=CORS)
            if 'nominatim' in u: return await r.fulfill(status=200, content_type='application/json', body='[]', headers=CORS)
            await r.abort()
        await page.route('**/*', route)
        await page.goto(APP); await page.wait_for_timeout(1200)
        await page.evaluate("__cms.OP_TIMEOUT.fetch=600; __cms.OP_TIMEOUT.diag=600")

        await page.click('#engineSeg [data-v=overpass]'); await page.wait_for_timeout(3500)
        st = await page.inner_text('#stTxt'); tip = await page.get_attribute('#stTxt', 'title')
        toast = await page.inner_text('#toast'); banner = await page.inner_text('#bannerTxt')
        print('état :', st); print('infobulle :', tip); print('notification :', toast); print('bandeau :', banner)
        assert 'bloqué' not in st + tip + toast, 'message trompeur « accès réseau bloqué »'
        assert 'en panne ou surchargés' in st and '4/4' in st
        for frag in ('overpass.private.coffee : délai dépassé', 'overpass.kumi.systems : délai dépassé', 'maps.mail.ru : HTTP 504', 'overpass-api.de : réponse illisible'):
            assert frag in tip, frag
        assert 'Votre connexion n\'est pas en cause' in toast
        assert banner == 'Serveurs Overpass en panne'
        assert all(hits[h] == 1 for h in ('overpass.private.coffee', 'overpass.kumi.systems', 'maps.mail.ru', 'overpass-api.de')), dict(hits)

        await page.click('#bDiag'); await page.wait_for_timeout(3000)
        diag = await page.inner_text('#diag'); print('diagnostic :\n' + diag)
        assert 'Le moteur Vectoriel GPU devrait fonctionner' in diag
        assert 'La panne vient des serveurs Overpass' in diag
        assert 'HTTP 504' in diag and 'erreur serveur sans CORS' in diag and 'délai dépassé' in diag
        blk = await page.evaluate("Object.keys(__cms.opBlock).length")
        assert blk == 0, 'un miroir en 5xx ou hors délai ne doit pas être suspendu'
        print('errors', errs); assert not errs
        await b.close()
    print('OK')
asyncio.run(main())
