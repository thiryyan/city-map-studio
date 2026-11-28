"""e2e : mesures de performance (#97, lot 3 : #101), moteur Fichier, sans réseau.

Vérifie que l'application relève, sans rien envoyer :
- l'ouverture jusqu'au premier aperçu ;
- un réglage jusqu'à l'aperçu redessiné ;
- un geste sur la carte (intervalle entre images) ;
- un export 10 × 15 jusqu'au fichier prêt ;
et les affiche dans Lieu › Avancé (budget, ✓ / ✗), avec un texte à copier (appareil, version, mesures).
"""
import pathlib, os, asyncio
from playwright.async_api import async_playwright
from seed import seed
from jswait import wait_js
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent).resolve()   # site testé : source, ou dist/ (CI)
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
KINDS = "CMS.perf.latest().map(m=>m.k)"


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        requests = []
        def route(r):
            requests.append(r.request.url)
            return r.continue_() if r.request.url.startswith('file:') else r.abort()
        await page.route('**/*', route)
        # Sans accord : la carte GPU n'est pas chargée, l'ouverture est mesurée jusqu'au premier aperçu
        await seed(page, APP, items={'cms3.welcomed': '1', 'cms3.advOpen': '1'}, wait=1300)
        ev = page.evaluate

        # 1. Ouverture
        await wait_js(page, f"{KINDS}.includes('ouverture')", 10000)
        o = await ev("CMS.perf.latest().find(m=>m.k==='ouverture')")
        check(o and 0 < o['ms'] < 60000, f"ouverture mesurée : {o and o['ms']} ms ({o and o['info']})")

        await page.click('#bConsentFile'); await page.wait_for_timeout(300)   # « Travailler hors ligne »
        await ev("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)

        # 2. Réglage visible
        await ev("()=>{ const i=document.querySelector('input[data-k=\"texts.title\"]'); i.value='Mesure'; i.dispatchEvent(new Event('input',{bubbles:true})); }")
        await wait_js(page, f"{KINDS}.includes('reglage')", 5000)
        r = await ev("CMS.perf.latest().find(m=>m.k==='reglage')")
        check(r and r['ms'] < 5000, f"réglage mesuré jusqu'à l'aperçu redessiné : {r and r['ms']} ms")

        # 3. Geste sur la carte
        await ev("__cms.showTab('lieu')"); await page.click('#bEdit'); await page.wait_for_timeout(300)
        box = await page.locator('#vecCanvas').bounding_box()
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        await page.mouse.move(x, y); await page.mouse.down()
        for i in range(30):
            await page.mouse.move(x + i * 4, y + i * 2); await page.wait_for_timeout(16)
        await page.mouse.up()
        await wait_js(page, f"{KINDS}.includes('geste')", 3000)
        g = await ev("CMS.perf.latest().find(m=>m.k==='geste')")
        check(g and g['ms'] > 0 and 'images/s' in g['info'], f"geste mesuré : {g and g['ms']} ms entre images ({g and g['info']})")
        await page.click('#bEdit')

        # 4. Export 10 × 15
        await ev("__cms.setFormat('10x15'); __cms.setFileType('png')")
        async with page.expect_download():
            await ev("__cms.exportPoster()")
        await wait_js(page, f"{KINDS}.includes('export-10x15')", 30000)
        e = await ev("CMS.perf.latest().find(m=>m.k==='export-10x15')")
        check(e and e['ms'] > 0 and 'PNG' in e['info'], f"export 10 × 15 mesuré jusqu'au fichier prêt : {e and e['ms']} ms ({e and e['info']})")

        # 5. Affichage et texte à copier
        await ev("__cms.showTab('lieu')")
        rows = await ev("[...document.querySelectorAll('#perfOut > div')].map(d=>d.textContent)")
        check(len(rows) == 4 and any(r.startswith(('✓', '✗')) and 'Export 10 × 15' in r for r in rows), f'mesures affichées dans Lieu › Avancé ({len(rows)} lignes)')
        check(all(('budget' in r) or ('entre deux images' in r) for r in rows), 'chaque mesure rappelle son budget')
        txt = await ev("CMS.perfUI.text()")
        check(txt.startswith('City Map Studio') and 'Appareil :' in txt and 'Écran :' in txt and txt.count('\n') == 6,
              f'texte à copier : version, appareil, écran et 4 mesures')
        check(all(u.startswith('file:') for u in requests if 'perf' in u or 'mesure' in u), 'aucune mesure envoyée sur le réseau')

        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails)
    print('OK' if not fails else 'ÉCHEC')
    raise SystemExit(1 if fails else 0)

asyncio.run(main())
