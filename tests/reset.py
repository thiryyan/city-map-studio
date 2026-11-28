"""e2e : bouton « Tout réinitialiser » (onglet Export) (retour aux réglages par défaut).

Modifie gabarit, thème, couleur, police, textes, lignes affichées, repère,
zoom, marge et calques, avec des données importées (moteur Fichier), une affiche
enregistrée et la taille de l'interface agrandie, puis vérifie : un seul appui ne
réinitialise rien (confirmation demandée, annulée après 4 s) ; deux appuis rétablissent
l'état par défaut et l'affiche initiale, moteur Vectoriel GPU compris ; sont conservés
l'accord aux services, les données importées, Mes affiches et la taille de l'interface ;
le résultat est persisté après rechargement.
"""
import pathlib, os, asyncio, json
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()   # site testé : dist/ (construit par run_all.py), ou CMS_ROOT
APP = (ROOT / 'index.html').as_uri()+'?test'
CHROME = os.environ.get('CHROME') or None
SNAP = "document.getElementById('cvOver').toDataURL()"
STATE = "JSON.stringify(__cms.st)"
FIX = open(T / 'osm.json').read()

async def main():
    fails = []
    def check(c, m):
        print('✓' if c else '✗', m)
        if not c: fails.append(m)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await b.new_page(viewport={'width': 390, 'height': 844}); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            await (r.continue_() if r.request.url.startswith('file:') else r.abort())
        await page.route('**/*', route)
        await seed(page, APP, wait=1500)   # accord préalable et section Avancé, sans script injecté (cf. tests/seed.py)
        await page.evaluate("localStorage.removeItem('cms3.affiche')"); await page.reload(); await page.wait_for_timeout(1500)
        default_state = json.loads(await page.evaluate(STATE)); base = await page.evaluate(SNAP)

        # Modifications (moteur Fichier avec des données, affiche enregistrée, interface agrandie : à conserver)
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        await page.click('#bUiLarger'); await page.keyboard.press('Control+s'); await page.wait_for_timeout(300)
        saves = await page.evaluate("localStorage.getItem('cms3.saves')")
        await page.click('#tabs [data-tab=style]')
        await page.click('#layouts .card[data-v=medallion]'); await page.click('#themes .theme[data-v=onyx]')
        await page.click('#tabs [data-tab=textes]')
        await page.click('#fontSeg [data-v=deco]')   # polices : onglet Textes (#72)
        await page.fill('input[data-k="texts.title"]', 'Paris'); await page.click('input[data-k="show.names"]')
        await page.click('#tabs [data-tab=lieu]')
        await page.fill('#markerIn', '48.853, 2.3499'); await page.press('#markerIn', 'Enter')
        await page.evaluate("__cms.st.margin=10; __cms.st.layers.buildings=false; __cms.st.zoom=16")
        await page.wait_for_timeout(500)
        changed = json.loads(await page.evaluate(STATE))
        check(changed != default_state and await page.evaluate(SNAP) != base, 'réglages modifiés')

        # « Tout réinitialiser » : en bas de la relecture, onglet Export ; la liste montre les parties modifiées
        await page.click('#tabs [data-tab=export]'); await page.wait_for_timeout(300)
        parts = await page.evaluate("[...document.querySelectorAll('#changesList [data-reset]')].map(b=>b.dataset.reset)")
        check('fonts' in parts and 'lines' in parts and 'trace' in parts, f'relecture : polices (hors duo), lignes, tracé et calques modifiés {parts}')
        await page.click('#bReset'); await page.wait_for_timeout(300)
        check(await page.inner_text('#bReset') == 'Confirmer ?', 'premier appui : confirmation demandée')
        check(json.loads(await page.evaluate(STATE)) == changed, 'premier appui : rien n\'est réinitialisé')
        await page.wait_for_timeout(4300)
        check(await page.inner_text('#bReset') == 'Tout réinitialiser', 'confirmation annulée après 4 s')

        await page.click('#bReset'); await page.click('#bReset'); await page.wait_for_timeout(1200)
        now = json.loads(await page.evaluate(STATE))
        diff = {k: (now.get(k), default_state.get(k)) for k in set(now) | set(default_state) if now.get(k) != default_state.get(k)}
        check(not diff, f'état par défaut rétabli {diff}')
        check(await page.evaluate(SNAP) == base, 'affiche identique à l\'affiche initiale')
        check(await page.input_value('input[data-k="texts.title"]') == 'Blois', 'champs de saisie resynchronisés')
        check(await page.evaluate('__cms.consent'), 'accord aux services conservé')
        check(await page.evaluate("__cms.st.engine==='maplibre' && !!__cms.osmData"), 'moteur Vectoriel GPU rétabli, données importées conservées')
        check(saves and await page.evaluate("localStorage.getItem('cms3.saves')") == saves, 'Mes affiches conservées')
        check(await page.evaluate("localStorage.getItem('cms3.uiScale')") == '1.125', 'taille de l\'interface conservée')
        await page.wait_for_timeout(500); await page.reload(); await page.wait_for_timeout(1500)
        check(json.loads(await page.evaluate(STATE)) == default_state, 'réglages par défaut persistés après rechargement')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
