"""e2e : migration unique des données d'avant le #118 et historique conservé après un rechargement (#16).

1. Données « cms3.* » posées comme par l'ancienne version (affiche en cours, Mes affiches, préférences) : au
   démarrage suivant, l'affiche et Mes affiches sont reprises (IndexedDB « city-map-studio »), les préférences
   sous « cms:* », les clés « cms3.* » effacées, et leur copie brute gardée dans le magasin « legacy ».
2. Une ambiance appliquée, puis la page rechargée : « Annuler » reste disponible et rétablit l'affiche d'avant.
"""
import asyncio, json, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
LEGACY = {
    'cms3.affiche': json.dumps({'texts': {'title': 'Migrée'}, 'layout': 'classic', 'theme': 'nuit'}),
    'cms3.saves': json.dumps([{'id': 'abc123def', 'name': 'Ancienne', 'savedAt': '2026-11-01T10:00:00Z', 'state': {'texts': {'title': 'Gardée'}}, 'thumb': ''}]),
    'cms3.consent': '1', 'cms3.welcomed': '1', 'cms3.uiScale': '1.25',
}
READ_LEGACY = """()=>new Promise(r=>{ const q=indexedDB.open('city-map-studio'); q.onsuccess=()=>{ const d=q.result;
  const g=d.transaction('legacy').objectStore('legacy').getAll(); g.onsuccess=()=>{ d.close(); r(g.result); }; }; })"""


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}); page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        ev = page.evaluate

        # 1. Migration unique
        await page.goto(APP)
        await ev("items=>{ for(const [k,v] of Object.entries(items)) localStorage.setItem(k,v); }", LEGACY)
        await page.reload(); await page.wait_for_timeout(1500)
        check(await ev("__cms.st.texts.title") == 'Migrée' and await ev("__cms.st.theme") == 'nuit', 'affiche en cours reprise')
        check([s['name'] for s in await ev("__cms.loadSaves()")] == ['Ancienne'], 'Mes affiches reprises')
        check(await ev("localStorage.getItem('cms:uiScale')") == '1.25' and await ev("localStorage.getItem('cms:consent')") == '1', 'préférences reprises sous « cms: »')
        check(await ev("Object.keys(localStorage).filter(k=>k.startsWith('cms3.'))") == [], 'clés « cms3. » effacées')
        legacy = [r for r in await ev(READ_LEGACY) if 'items' in r]
        check(legacy and json.loads(legacy[0]['items']['cms3.affiche'])['texts']['title'] == 'Migrée', 'copie brute gardée dans « legacy »')
        await page.reload(); await page.wait_for_timeout(1200)
        check(await ev("__cms.st.texts.title") == 'Migrée', 'affiche relue depuis IndexedDB au démarrage suivant')

        # 2. Historique conservé après un rechargement
        before = await ev("__cms.st.theme")
        await ev("__cms.applyAmbiance('souvenir')"); after = await ev("__cms.st.theme")
        await page.wait_for_timeout(1000)   # affiche et historique enregistrés (300 et 400 ms)
        await page.reload(); await page.wait_for_timeout(1500)
        check(await ev("__cms.st.theme") == after and after != before, f'ambiance relue après rechargement ({before} → {after})')
        check(await ev("!document.getElementById('bUndo').disabled"), '« Annuler » disponible après rechargement')
        await page.click('#bUndo'); await page.wait_for_timeout(500)
        check(await ev("__cms.st.theme") == before, f'« Annuler » rétablit l\'affiche d\'avant le rechargement ({await ev("__cms.st.theme")})')
        check(await ev("!document.getElementById('bRedo').disabled"), '« Rétablir » disponible')

        check(not errs, f'aucune erreur de page {errs[:2]}')
        await b.close()
    print('échecs', fails)
    print('OK' if not fails else 'ÉCHEC')
    raise SystemExit(1 if fails else 0)

asyncio.run(main())
