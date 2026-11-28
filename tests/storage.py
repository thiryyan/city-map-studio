"""e2e : stockage séparé de la version classique (#97, lot 2 : #100).

La version classique (racine du site) et cette version (/nouvelle/, préversions) partagent la même origine, donc le
même localStorage et le même IndexedDB. Vérifie que cette version :
- ne lit pas les données de la version classique (clés « cityMapStudio.* », base « cityMapStudio ») ;
- n'en modifie, n'en ajoute ni n'en supprime aucune, même en enregistrant une affiche et une illustration ;
- range ses propres données sous « cms3.* » et dans la base « cms3 ».
"""
import pathlib, os, asyncio, json
from playwright.async_api import async_playwright
from seed import seed
from jswait import wait_js
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent).resolve()   # site testé : source, ou dist/ (CI)
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()

# Données laissées par la version classique
CLASSIC = {
    'cityMapStudio.v2': json.dumps({'texts': {'title': 'Classique'}, 'theme': 'nuit'}),
    'cityMapStudio.saves': json.dumps([{'name': 'Affiche classique', 'at': 1, 'state': {'texts': {'title': 'Classique'}}}]),
    'cityMapStudio.consent': '1', 'cityMapStudio.uiScale': '1.25', 'cityMapStudio.welcomed': '1',
}
SNAP_LS = "()=>JSON.stringify(Object.keys(localStorage).filter(k=>k.startsWith('cityMapStudio')).sort().map(k=>[k,localStorage.getItem(k)]))"
# Base IndexedDB de la version classique, avec une image
PUT_DB = """()=>new Promise(r=>{ const q=indexedDB.open('cityMapStudio',1);
  q.onupgradeneeded=()=>q.result.createObjectStore('images');
  q.onsuccess=()=>{ const d=q.result, tx=d.transaction('images','readwrite');
    tx.objectStore('images').put({name:'classique.png', w:10, h:10}, 'a'.repeat(64)); tx.oncomplete=()=>{ d.close(); r(true); }; }; })"""
READ_DB = """name=>new Promise(r=>{ const q=indexedDB.open(name); q.onsuccess=()=>{ const d=q.result;
  if(!d.objectStoreNames.contains('images')){ d.close(); return r(null); }
  const g=d.transaction('images').objectStore('images').getAllKeys(); g.onsuccess=()=>{ d.close(); r(g.result.map(String)); }; }; })"""
PNG = """async ()=>{ const c=document.createElement('canvas'); c.width=600; c.height=900; const x=c.getContext('2d');
  x.fillStyle='#7FB2D6'; x.fillRect(0,0,600,900); x.fillStyle='#3F6B2A'; x.fillRect(0,600,600,300);
  const b=await new Promise(r=>c.toBlob(r,'image/png')); return [...new Uint8Array(await b.arrayBuffer())]; }"""


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        ev = page.evaluate

        # 0. Données de la version classique déjà présentes sur l'appareil
        await page.goto(APP)
        await ev("items=>{ for (const [k,v] of Object.entries(items)) localStorage.setItem(k,v); }", CLASSIC)
        await ev(PUT_DB)
        before_ls, before_db = await ev(SNAP_LS), await ev(READ_DB, 'cityMapStudio')
        check(before_db == ['a' * 64], f'base classique préparée {before_db}')
        await seed(page, APP, wait=1300)

        # 1. Rien n'est lu de la version classique
        check(await ev("__cms.st.texts.title") == 'Blois', f'affiche de la version classique non reprise (titre : {await ev("__cms.st.texts.title")})')
        check(await ev("__cms.st.theme") != 'nuit', 'thème de la version classique non repris')

        # 2. Usage : affiche modifiée, enregistrée dans Mes affiches, illustration importée
        await ev("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(400)
        await ev("()=>{ __cms.st.texts.title='Nouvelle'; }")
        await page.click('#tb-export'); await wait_js(page, "document.getElementById('tab-export').classList.contains('on')")
        check(await ev("!document.getElementById('savesEmpty').hidden"), 'Mes affiches de la version classique non reprises')
        await page.fill('#saveName', 'Affiche nouvelle'); await page.click('#saveForm button[type=submit]'); await page.wait_for_timeout(300)
        check(await ev("document.querySelectorAll('#savesList .save').length") == 1, 'affiche enregistrée dans cette version')
        await ev("CMS.illus.setMode('illus'); __cms.showTab('illus')")
        await page.click('#illusStepSeg button[data-v=image]')
        data = await ev(PNG)
        await page.set_input_files('#illusIn', files=[{'name': 'nouvelle.png', 'mimeType': 'image/png', 'buffer': bytes(data)}])
        await wait_js(page, "CMS.illus.ready()", 8000); await page.wait_for_timeout(800)
        ref = await ev("__cms.st.illus.img && __cms.st.illus.img.ref")
        await ev("CMS.illus.setMode('map')")
        await page.wait_for_timeout(600)

        # 3. Données de cette version sous « cms3 »
        own = await ev("Object.keys(localStorage).filter(k=>k.startsWith('cms3.')).sort()")
        check('cms3.affiche' in own and 'cms3.saves' in own, f'données de cette version sous « cms3. » {own}')
        check('Nouvelle' in (await ev("localStorage.getItem('cms3.affiche')") or ''), 'affiche en cours enregistrée sous cms3.affiche')
        check(await ev(READ_DB, 'cms3') == [ref], f'illustration rangée dans la base « cms3 » ({(ref or "")[:12]}…)')

        # 4. Données de la version classique intactes
        check(await ev(SNAP_LS) == before_ls, 'clés « cityMapStudio.* » inchangées (aucune modifiée, ajoutée ni supprimée)')
        check(await ev(READ_DB, 'cityMapStudio') == before_db, 'base IndexedDB « cityMapStudio » inchangée')

        # 5. Réinitialisation : seules les données de cette version sont touchées
        await ev("__cms.resetAll()"); await page.wait_for_timeout(500)
        check(await ev(SNAP_LS) == before_ls, 'après « Réinitialiser » : version classique toujours intacte')

        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails)
    print('OK' if not fails else 'ÉCHEC')
    raise SystemExit(1 if fails else 0)

asyncio.run(main())
