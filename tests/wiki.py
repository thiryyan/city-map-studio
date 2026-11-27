"""e2e : pistes d'illustration enrichies par Wikipédia (issue #46, CMS.wiki).

Réseau simulé : fr.wikipedia.org répond par tests/wiki_blois.json (réponse réelle autour de Blois), ou ne répond pas.
- option désactivée par défaut ; sans accord (ni l'option, ni l'accord général) : aucune requête ;
- cocher l'option sans accord général ouvre la demande d'accord ; la refuser laisse l'option décochée ;
- Blois : le château et la cathédrale proposés en tête ; la requête ne contient que les coordonnées du lieu et le rayon ;
- service muet : message en moins de 11 s, interface utilisable pendant l'attente ;
- hors ligne : bouton grisé, les pistes de la carte restent disponibles.
"""
import asyncio, json, os, pathlib, time
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
from jswait import wait_js
from seed import seed

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
BLOIS = (T / 'wiki_blois.json').read_text(encoding='utf-8')
fails = []


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 760}, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        wiki, ext, mode = [], [], {'v': 'ok'}

        async def route(r):
            u = r.request.url
            if u.startswith(('file:', 'blob:', 'data:')): return await r.continue_()
            host = urlparse(u).netloc
            if host == 'fr.wikipedia.org':
                wiki.append(u)
                if mode['v'] == 'mute': await asyncio.sleep(15); return await r.abort()
                return await r.fulfill(status=200, body=BLOIS, headers={'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})
            ext.append(host); await r.abort()
        await page.route('**/*', route)

        async def open_illus():
            await wait_js(page, "typeof __cms==='object'", 20000)
            await page.evaluate("CMS.illus.setMode('illus'); __cms.showTab('illus')"); await page.wait_for_timeout(200)
        await seed(page, APP, {'cms3.welcomed': '1'}, 300); await open_illus()
        # Démarrage sans accord : la demande d'accord générale s'affiche ; on la ferme sans accepter
        if await page.evaluate("document.getElementById('consent').open"): await page.evaluate("document.getElementById('bConsentFile').click()")
        await page.wait_for_timeout(300)
        check(not await page.evaluate("document.getElementById('wikiOn').checked"), 'option Wikipédia désactivée par défaut')
        check(await page.evaluate("document.getElementById('wikiBox').hidden"), 'bouton Wikipédia masqué tant que l\'option est désactivée')
        await page.evaluate("const c=document.getElementById('wikiOn'); c.checked=true; c.dispatchEvent(new Event('change'))")
        await page.wait_for_timeout(300)
        check(await page.evaluate("document.getElementById('consent').open"), 'option cochée sans accord : demande d\'accord affichée')
        await page.evaluate("document.getElementById('bConsentFile').click()"); await page.wait_for_timeout(300)
        check(not await page.evaluate("document.getElementById('wikiOn').checked"), 'accord refusé : option décochée')
        await page.evaluate("document.getElementById('bWikiPistes').click()"); await page.wait_for_timeout(500)
        check(not wiki, f'sans accord : aucune requête à Wikipédia {wiki}')

        # Accord général donné, option toujours désactivée : aucune requête
        await seed(page, APP, {'cms3.consent': '1', 'cms3.welcomed': '1'}, 300); await open_illus()
        await page.wait_for_timeout(500)
        check(not wiki, 'accord général sans l\'option : aucune requête à Wikipédia')
        await page.evaluate("const c=document.getElementById('wikiOn'); c.checked=true; c.dispatchEvent(new Event('change'))")
        st_ = await page.evaluate("[__cms.consent, document.getElementById('wikiOn').checked, document.getElementById('wikiBox').hidden, localStorage.getItem('cms3.wiki'), document.getElementById('consent').open]")
        check(st_[1:4] == [True, False, '1'], f'option activée et mémorisée {st_}')
        await page.wait_for_timeout(300)
        check(not wiki, 'activer l\'option n\'envoie rien : la recherche attend le bouton')

        # Blois : château et cathédrale en tête
        await page.evaluate("document.getElementById('bWikiPistes').click()")
        await wait_js(page, "document.querySelectorAll('#pisteSugg button').length>0", 8000)
        sugg = await page.evaluate("[...document.querySelectorAll('#pisteSugg button')].map(b=>b.textContent.replace(/^\\+ /,''))")
        check(sugg[:2] == ['Château de Blois', 'Cathédrale Saint-Louis de Blois'], f'Blois : château et cathédrale en tête {sugg[:4]}')
        q = parse_qs(urlparse(wiki[-1]).query) if wiki else {}
        check(q.get('ggscoord') == ['47.5861|1.3359'] and set(q) == {'action', 'format', 'formatversion', 'origin', 'generator', 'ggscoord', 'ggsradius', 'ggslimit', 'prop', 'colimit'},
              f'requête : coordonnées du lieu et rayon seulement {q.get("ggscoord")}')
        await page.evaluate("document.querySelector('#pisteSugg button').click()"); await page.wait_for_timeout(200)
        check('Château de Blois' in await page.evaluate("__cms.st.illus.prompt.pistes.join('|')"), 'piste Wikipédia ajoutée au prompt d\'un toucher')
        check('Château de Blois' in await page.evaluate("document.getElementById('promptOut').value"), 'piste reprise dans le prompt')
        n = len(wiki)
        await page.evaluate("document.getElementById('bWikiPistes').click()"); await page.wait_for_timeout(500)
        check(len(wiki) == n, 'même lieu : réponse en cache, aucune nouvelle requête')

        # Service muet : message en moins de 11 s, interface utilisable pendant l'attente
        mode['v'] = 'mute'
        await page.evaluate("__cms.st.marker={lat:47.6,lon:1.35}")
        await page.evaluate("document.getElementById('toast').textContent=''")
        t0 = time.monotonic()
        await page.evaluate("document.getElementById('bWikiPistes').click()"); await page.wait_for_timeout(300)
        check(await page.evaluate("document.getElementById('bWikiPistes').disabled"), 'recherche en cours : bouton désactivé (pas de double requête)')
        await page.evaluate("document.querySelector('#langSeg button[data-v=\"en\"]').click()")
        check(await page.evaluate("__cms.st.illus.prompt.lang") == 'en', 'interface utilisable pendant l\'attente (langue du prompt changée)')
        await wait_js(page, "document.getElementById('toast').textContent.includes('Wikipédia ne répond pas')", 12000)
        dt = time.monotonic() - t0
        check(dt < 11, f'service muet : message en {dt:.1f} s (< 11 s)')
        check(not await page.evaluate("document.getElementById('bWikiPistes').disabled"), 'service muet : bouton de nouveau utilisable')

        # Hors ligne : bouton grisé, pistes de la carte disponibles
        await ctx.set_offline(True); await page.wait_for_timeout(300)
        check(await page.evaluate("document.getElementById('bWikiPistes').disabled"), 'hors ligne : bouton Wikipédia grisé')
        check('Hors ligne' in await page.evaluate("document.getElementById('wikiHint').textContent"), 'hors ligne : explication affichée')
        check(not await page.evaluate("document.getElementById('bScanPistes').disabled"), 'hors ligne : pistes de la carte disponibles')
        await ctx.set_offline(False); await page.wait_for_timeout(300)
        check(not await page.evaluate("document.getElementById('bWikiPistes').disabled"), 'retour du réseau : bouton réactivé')

        # Option décochée : plus de bouton
        await page.evaluate("const c=document.getElementById('wikiOn'); c.checked=false; c.dispatchEvent(new Event('change'))")
        check(await page.evaluate("document.getElementById('wikiBox').hidden && localStorage.getItem('cms3.wiki')===null"), 'option décochée : bouton masqué, choix effacé')
        check(not errs, f'aucune erreur de page {errs[:2]}')
        for e in errs: print('PAGEERROR', e)
        await b.close()
    print('OK' if not fails else f'{len(fails)} échec(s)')
    return 1 if fails else 0

if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
