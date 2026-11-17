"""e2e : politique Overpass (P0-4).

Miroir 1 → HTTP 406, miroir 2 → HTTP 429 (Retry-After: 7200), miroir 3 → réponse valide.
Vérifie : bascule vers le miroir 3 ; durée de suspension (24 h pour 406, Retry-After pour 429) ;
aucun nouvel essai vers les miroirs 1 et 2, ni à l'actualisation suivante, ni après un
rechargement de la page (suspension relue depuis localStorage), ni par le diagnostic ;
message clair quand tous les miroirs sont suspendus.

Le stockage est préparé par tests/seed.py, sans script injecté : un script injecté qui
touche localStorage faisait perdre, au rechargement, la suspension tout juste enregistrée
(échec intermittent de l'ancienne version de ce test, sans lien avec l'application).
"""
import pathlib, os, asyncio, collections
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri()
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'overpass.json').read()
BLOCKED = ('overpass.private.coffee', 'overpass.kumi.systems')
OP_BLOCK = """Object.fromEntries(Object.entries(__cms.opBlock).map(([k,v])=>[new URL(k).host,[v.status,Math.round((v.until-Date.now())/60000)]]))"""
STORED = """Object.keys(JSON.parse(localStorage.getItem('cityMapStudio.opBlocked')||'{}')).map(k=>new URL(k).host).sort()"""


async def main():
    hits = collections.Counter(); mode = {'all_fail': False}; fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
        page = await ctx.new_page(); errs = []
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
        await seed(page, APP)   # accord préalable donné, section Avancé ouverte (cf. tests/consent.py)
        blocked_hits = lambda: [hits[h] for h in BLOCKED]

        # 1. Premier chargement : 406 puis 429, bascule vers le 3e miroir
        await page.click('#engineSeg [data-v=overpass]'); await page.wait_for_timeout(1500)
        st = await page.inner_text('#stTxt'); print('  1er chargement :', st, dict(hits))
        check('maps.mail.ru' in st and blocked_hits() == [1, 1], 'bascule vers le 3e miroir après 406 et 429, un seul essai chacun')
        blk = await page.evaluate(OP_BLOCK); print('  suspensions (statut, minutes) :', blk)
        check(abs(blk['overpass.private.coffee'][1] - 1440) <= 1 and abs(blk['overpass.kumi.systems'][1] - 120) <= 1,
              'durée de suspension : 24 h après 406, Retry-After (2 h) après 429')
        check(await page.evaluate(STORED) == sorted(BLOCKED), 'suspensions enregistrées dans localStorage')

        # 2. Actualisation : les miroirs suspendus ne sont pas rappelés
        await page.evaluate("__cms.fetchOverpass()"); await page.wait_for_timeout(1000)
        check(blocked_hits() == [1, 1] and hits['maps.mail.ru'] == 2, f'actualisation : 3e miroir seul ({dict(hits)})')

        # 3. Rechargement : suspension relue, aucun nouvel essai au démarrage
        await page.reload(); await page.wait_for_timeout(2000)
        eng = await page.evaluate("__cms.st.engine"); blk2 = await page.evaluate(OP_BLOCK)
        check(eng == 'overpass' and sorted(blk2) == sorted(BLOCKED), f'après rechargement : moteur Overpass et suspensions relues ({eng}, {sorted(blk2)})')
        check(blocked_hits() == [1, 1] and hits['maps.mail.ru'] == 3, f'après rechargement : seul le 3e miroir est interrogé ({dict(hits)})')

        # 4. Diagnostic : les miroirs suspendus sont signalés, pas sondés
        await page.click('#bDiag'); await page.wait_for_timeout(1500)
        diag = await page.inner_text('#diag'); print('  diagnostic :', ' / '.join(l for l in diag.split('\n') if 'suspendu' in l))
        check(blocked_hits() == [1, 1] and diag.count('suspendu') >= 2, 'diagnostic : miroirs suspendus signalés sans nouvel essai')

        # 5. Tous les miroirs suspendus : plus aucune requête, message clair
        mode['all_fail'] = True
        await page.evaluate("__cms.fetchOverpass()"); await page.wait_for_timeout(1000)
        before = dict(hits)
        await page.evaluate("__cms.fetchOverpass()"); await page.wait_for_timeout(1000)
        st = await page.inner_text('#stTxt'); ban = await page.inner_text('#banner'); print('  tous suspendus :', st, '| bandeau :', ban)
        check(dict(hits) == before, 'tous suspendus : aucune requête émise')
        check('suspendu' in st.lower(), 'tous suspendus : message explicite')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
