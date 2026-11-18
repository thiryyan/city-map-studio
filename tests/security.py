"""e2e : robustesse et sécurité de la page.

- Lien partagé forgé (types faux, valeurs hors bornes, champs inconnus) : l'application reste utilisable,
  les valeurs invalides sont remplacées par les valeurs par défaut et rien d'invalide n'est enregistré.
- Lien piégé (contenu compressé énorme) : refusé, l'affiche courante est conservée.
- window.__cms n'est exposé qu'avec ?test (ou la clé de débogage).
- Bouton d'export : les dimensions suivent l'orientation.
"""
import pathlib, os, asyncio, json, base64, zlib
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
BASE = (T.parent / 'index.html').as_uri()
APP = BASE + '?test'
CHROME = os.environ.get('CHROME') or None
SEEDED = {'cityMapStudio.consent': '1', 'cityMapStudio.welcomed': '1'}


def link(obj=None, raw=None):
    """Ancre de partage #a=z… (deflate brut, base64 URL), comme encodeShare()."""
    data = raw if raw is not None else json.dumps(obj).encode()
    c = zlib.compressobj(9, zlib.DEFLATED, -15); z = c.compress(data) + c.flush()
    return '#a=z' + base64.urlsafe_b64encode(z).decode().rstrip('=')


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 860})
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        await page.goto(APP)
        await page.evaluate("items=>{ for(const [k,v] of Object.entries(items)) localStorage.setItem(k,v); }", SEEDED)

        # 1. Lien forgé
        forged = {'marker': {'lat': 'x', 'lon': None}, 'center': {'lat': 999, 'lon': 2}, 'zoom': 'grand', 'layout': 'inconnu',
                  'colors': {'paper': 'red;}', 'text': '#123456'}, 'texts': {'title': 'Chambord', 'names': 42},
                  'markers2': [{'lat': 1}, {'lat': 47.6, 'lon': 1.4, 'label': 'Ici'}, 5], 'markerSize': 1e9,
                  'route': {'pts': [[1, 2], ['a', 3], [95, 0]]}, 'sky': {'when': '<script>', 'tz': 'x'},
                  '__proto__': {'pollue': True}, 'inattendu': 'champ ignoré', 'font': 'comic', 'fontTitle': 'vibes'}
        await page.goto(APP + link(forged)); await page.reload(); await page.wait_for_timeout(1800)
        s = await page.evaluate("JSON.parse(JSON.stringify(__cms.st))")
        check(s['texts']['title'] == 'Chambord' and s['colors']['text'] == '#123456' and s['fontTitle'] == 'vibes', 'lien forgé : valeurs valides reprises')
        check(s['marker'] == {'lat': 47.5861, 'lon': 1.3359} and s['center']['lat'] == 47.5861 and s['zoom'] == 14, 'lien forgé : repère, centre et zoom invalides remplacés')
        check(s['layout'] == 'souvenir' and s['font'] == 'serif' and s['colors']['paper'] == '#FFFFFF' and s['texts']['names'] == 'Camille & Julien',
              'lien forgé : gabarit, police, couleur et texte invalides remplacés')
        check(s['markerSize'] == 300 and len(s['markers2']) == 1 and s['markers2'][0]['label'] == 'Ici' and s['route'] is None and s['sky']['when'] == '',
              'lien forgé : nombres bornés, lieux, itinéraire et date du ciel filtrés')
        check('inattendu' not in s and 'pollue' not in s and not await page.evaluate("({}).pollue"), 'lien forgé : champs inconnus ignorés, aucune pollution de prototype')
        saved = json.loads(await page.evaluate("localStorage.getItem('cityMapStudio.v2')"))
        check(saved['marker']['lat'] == 47.5861 and await page.evaluate("location.hash") == '', 'lien forgé : état enregistré valide, ancre retirée')
        check(await page.inner_text('#markerTxt') != '' and not errs, f'lien forgé : interface utilisable, aucune erreur de page {errs}')

        # 2. Lien piégé : ~50 Mo une fois décompressé
        before = await page.evaluate("__cms.st.texts.title")
        await page.goto(APP + link(raw=b'{"texts":{"title":"' + b'A' * 50_000_000 + b'"}}')); await page.reload(); await page.wait_for_timeout(1800)
        check(await page.evaluate("__cms.st.texts.title") == before, 'lien piégé : refusé, affiche conservée')
        check('volumineux' in await page.inner_text('#toast') or 'trop long' in await page.inner_text('#toast'), 'lien piégé : message explicite')
        check(not errs, f'lien piégé : aucune erreur de page {errs}')

        # 3. Ancien état enregistré corrompu dans le navigateur
        await page.evaluate("localStorage.setItem('cityMapStudio.v2', JSON.stringify({marker:{lat:'?'}, zoom:null, layers:'x', texts:{title:'Tours'}}))")
        await page.goto(APP); await page.wait_for_timeout(1500)
        check(await page.evaluate("[__cms.st.texts.title, __cms.st.marker.lat, __cms.st.layers.parks]") == ['Tours', 47.5861, True] and not errs,
              'état enregistré corrompu : corrigé au chargement')

        # 4. Bouton d'export : dimensions selon l'orientation
        check('2480 × 3508' in await page.inner_text('#bExport'), 'export portrait : 2480 × 3508 px affiché')
        await page.evaluate("__cms.setOrient('landscape')"); await page.wait_for_timeout(200)
        check('3508 × 2480' in await page.inner_text('#bExport'), 'export paysage : 3508 × 2480 px affiché')
        await page.evaluate("__cms.setOrient('portrait')")

        # 5. Crochets de test
        await page.goto(BASE); await page.wait_for_timeout(1500)
        check(await page.evaluate("typeof window.__cms") == 'undefined', 'sans ?test : window.__cms non exposé')
        await page.evaluate("localStorage.setItem('cityMapStudio.debug','1')"); await page.reload(); await page.wait_for_timeout(1500)
        check(await page.evaluate("typeof window.__cms") == 'object', 'clé de débogage : window.__cms exposé')
        await page.evaluate("localStorage.removeItem('cityMapStudio.debug')")
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('ÉCHECS :', fails) if fails else print('OK')

asyncio.run(main())
