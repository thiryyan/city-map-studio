"""e2e : conservation des illustrations (issue #43).

Vérifie : image rangée dans IndexedDB sous son empreinte SHA-256 et retrouvée après rechargement ; Mes affiches
(restaurer une affiche illustrée après avoir changé d'image) ; « Annuler » après « Retirer » ; IndexedDB vidée :
illustration signalée manquante, export désactivé, réimport de la même image accepté (cadrage conservé), d'une
autre image signalé ; fichier de configuration avec image (version 2) ouvert dans un navigateur vierge ; fichier
sans image (version 1) ; sauvegarde complète avec images ; fichiers piégés (image invalide, empreinte invalide,
image existante jamais remplacée) ; lien partagé sans donnée d'image ; nettoyage des images orphelines.
"""
import asyncio, base64, json, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js
from seed import seed

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent).resolve()   # site testé : source, ou dist/ (CI)
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
fails = []
MAKE = """async ([w,h,c1,c2])=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,h); g.addColorStop(0,c1); g.addColorStop(1,c2); x.fillStyle=g; x.fillRect(0,0,w,h);
  x.fillStyle='#fff'; x.fillRect(w*0.3,h*0.4,w*0.2,h*0.1);
  const b=await new Promise(r=>c.toBlob(r,'image/png')); const u=new Uint8Array(await b.arrayBuffer()); let s=''; for(const v of u) s+=String.fromCharCode(v); return btoa(s); }"""
KEYS = """()=>new Promise(r=>{ const q=indexedDB.open('cms3'); q.onsuccess=()=>{ const d=q.result;
  if(!d.objectStoreNames.contains('images')){ d.close(); return r([]); }
  const g=d.transaction('images').objectStore('images').getAllKeys(); g.onsuccess=()=>{ d.close(); r(g.result); }; }; q.onerror=()=>r(null); })"""
CLEAR = """()=>new Promise(r=>{ const q=indexedDB.open('cms3'); q.onsuccess=()=>{ const d=q.result; const tx=d.transaction('images','readwrite');
  tx.objectStore('images').clear(); tx.oncomplete=()=>{ d.close(); r(true); }; }; })"""


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])

        async def open_ctx():
            ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
            page = await ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            async def route(r):
                if r.request.url.startswith(('file:', 'blob:', 'data:')): return await r.continue_()
                await r.abort()
            await page.route('**/*', route)
            await seed(page, APP)   # pas d'add_init_script : il fait perdre des écritures au rechargement (cf. tests/seed.py)
            await wait_js(page, "typeof __cms==='object'", 20000)
            return ctx, page, errs

        async def imp(page, b64, name):
            await page.set_input_files('#illusIn', files=[{'name': name, 'mimeType': 'image/png', 'buffer': base64.b64decode(b64)}])

        async def save_now(page):   # enregistrement immédiat (saveState est différé de 300 ms), relu pour s'en assurer
            await page.wait_for_timeout(400)
            await page.evaluate("localStorage.setItem('cms3.affiche',JSON.stringify(__cms.st))")
            await wait_js(page, "localStorage.getItem('cms3.affiche')===JSON.stringify(__cms.st)", 3000)

        ctx, page, errs = await open_ctx()
        A = await page.evaluate(MAKE, [900, 1300, '#7FB2D6', '#3F6B2A'])
        B = await page.evaluate(MAKE, [700, 1000, '#E3A35C', '#5A2A1A'])
        await page.evaluate("CMS.illus.setMode('illus'); __cms.showTab('illus')")
        await page.click('#illusStepSeg button[data-v=image]')
        await imp(page, A, 'blois.png')
        await wait_js(page, "CMS.illus.ready()", 5000)
        ref = await page.evaluate("__cms.st.illus.img.ref")
        check(len(ref) == 64 and all(c in '0123456789abcdef' for c in ref), f'référence : empreinte SHA-256 ({ref[:12]}…)')
        await wait_js(page, "true", 100)
        await page.wait_for_timeout(600)
        keys = await page.evaluate(KEYS)
        check(keys == [ref], f'image rangée dans IndexedDB sous son empreinte {keys}')
        stored = await page.evaluate("""()=>new Promise(r=>{ const q=indexedDB.open('cms3'); q.onsuccess=()=>{ const d=q.result;
          const g=d.transaction('images').objectStore('images').get(__cms.st.illus.img.ref); g.onsuccess=()=>{ d.close(); const v=g.result; r([v.blob.type,v.w,v.h,v.name]); }; }; })""")
        check(stored == ['image/webp', 900, 1300, 'blois.png'], f'image ré-encodée en WebP avec ses dimensions {stored}')
        check(not await page.evaluate("JSON.stringify(localStorage).includes('data:image')"), 'aucune donnée d\'image dans localStorage')

        # Rechargement : image retrouvée, cadrage conservé
        await page.evaluate("__cms.st.illus.zoom=150"); await save_now(page)
        await page.reload(); await wait_js(page, "typeof __cms==='object'", 20000)
        await wait_js(page, "CMS.illus.ready()", 8000)
        check(await page.evaluate("[__cms.st.illus.img.ref, CMS.illus.image.w, __cms.st.illus.zoom]") == [ref, 900, 150], 'rechargement : illustration et cadrage retrouvés')
        check(not await page.evaluate("$('bExport').disabled"), 'rechargement : export actif')

        # Mes affiches : enregistrer, changer d'image, restaurer
        await page.evaluate("__cms.saveCurrent('Blois illustrée')")
        await page.evaluate("__cms.showTab('illus')"); await page.click('#illusStepSeg button[data-v=image]')
        await imp(page, B, 'autre.png')
        await wait_js(page, "CMS.illus.image && CMS.illus.image.w===700", 5000)
        refB = await page.evaluate("__cms.st.illus.img.ref")
        check(refB != ref, 'autre image : autre empreinte')
        sid = await page.evaluate("__cms.loadSaves()[0].id")
        await page.evaluate(f"__cms.restoreSave('{sid}')")
        await wait_js(page, f"CMS.illus.ready() && CMS.illus.image.w===900", 8000)
        check(await page.evaluate("__cms.st.illus.img.ref") == ref, 'Mes affiches : restaurer retrouve l\'illustration enregistrée')
        check('Affiche illustrée' in await page.evaluate("(openSaves(), $('savesList').textContent)"), 'Mes affiches : « Affiche illustrée » dans la liste')

        # Retirer puis Annuler (après le délai de calme qui suit une restauration : cf. commitHistory)
        await page.wait_for_timeout(1700)
        await page.evaluate("CMS.illus.removeImage()"); await page.wait_for_timeout(500)
        check(not await page.evaluate("CMS.illus.ready()") and await page.evaluate("__cms.st.illus.img") is None, 'retirer : plus d\'illustration')
        await page.evaluate("__cms.undo()")
        await wait_js(page, "CMS.illus.ready()", 8000)
        check(await page.evaluate("__cms.st.illus.img.ref") == ref, '« Annuler » : illustration retrouvée')

        # Fichier de configuration avec image (version 2)
        await page.evaluate("$('cfgImg').checked=true")
        async with page.expect_download() as dl:
            await page.evaluate("downloadConfig(null)")
        cfg_path = await (await dl.value).path()
        cfg = json.loads(pathlib.Path(cfg_path).read_text())
        check(cfg['version'] == 2 and list(cfg['images']) == [ref] and cfg['images'][ref]['data'].startswith('data:image/webp;base64,'), 'fichier avec image : version 2, image WebP intégrée sous son empreinte')
        check(cfg['state']['illus']['img']['ref'] == ref, 'fichier : l\'état désigne l\'image par son empreinte')
        await page.evaluate("$('cfgImg').checked=false")
        async with page.expect_download() as dl:
            await page.evaluate("downloadConfig(null)")
        cfg0 = json.loads(pathlib.Path(await (await dl.value).path()).read_text())
        check(cfg0['version'] == 1 and 'images' not in cfg0, 'fichier sans image : version 1, empreinte seule')
        await page.evaluate("$('cfgImg').checked=true")
        async with page.expect_download() as dl:
            await page.evaluate("downloadBackup()")
        bak = json.loads(pathlib.Path(await (await dl.value).path()).read_text())
        check(bak['version'] == 2 and ref in bak['images'] and len(bak['saves']) == 1, 'sauvegarde complète avec images')

        # Lien partagé : empreinte seulement
        url = (await page.evaluate("__cms.encodeShare()"))['url']
        dec = await page.evaluate("t=>__cms.decodeShare(t)", url.split('#a=')[1])
        check(dec['illus']['img']['ref'] == ref and 'data:image' not in json.dumps(dec) and len(url) < 4000, f'lien partagé : référence seule, sans image ({len(url)} caractères)')

        # IndexedDB vidée : illustration manquante, réimports
        await save_now(page)
        await page.evaluate(CLEAR)
        await page.reload(); await wait_js(page, "typeof __cms==='object'", 20000)
        await wait_js(page, "CMS.illus.missing", 8000)
        await page.evaluate("__cms.showTab('illus')"); await page.click('#illusStepSeg button[data-v=image]')
        check(await page.is_visible('#illusMissing') and 'blois.png' in await page.text_content('#illusMissing'), 'image effacée : « illustration introuvable » avec son nom')
        check(await page.evaluate("$('bExport').disabled") and 'réimporter' in await page.text_content('#stTxt'), 'image effacée : export désactivé, ligne d\'état')
        await imp(page, A, 'blois-copie.png')
        await wait_js(page, "CMS.illus.ready()", 5000)
        check('retrouvée' in await page.text_content('#toast') and await page.evaluate("__cms.st.illus.zoom") == 150, 'réimport de la même image : « retrouvée », cadrage conservé')
        for _ in range(50):   # rangement dans IndexedDB : asynchrone, après l'affichage
            if ref in (await page.evaluate(KEYS) or []): break
            await page.wait_for_timeout(100)
        await page.evaluate(CLEAR); await save_now(page)
        await page.reload(); await wait_js(page, "typeof __cms==='object'", 20000)
        await wait_js(page, "CMS.illus.missing", 8000)
        await imp(page, B, 'autre.png')
        await wait_js(page, "CMS.illus.ready()", 5000)
        check('pas l’illustration' in await page.text_content('#toast'), 'réimport d\'une autre image : signalé')

        # Nettoyage des images orphelines
        await page.evaluate("__cms.restoreSave(__cms.loadSaves()[0].id)")   # affiche enregistrée : image A, effacée plus haut
        await wait_js(page, "CMS.illus.missing", 8000)
        await imp(page, A, 'blois.png')
        await wait_js(page, "CMS.illus.ready() && __cms.st.illus.img.ref==='"+ref+"'", 8000)
        await page.wait_for_timeout(500)
        await page.evaluate("CMS.illus.gc()"); await page.wait_for_timeout(300)
        keys = await page.evaluate(KEYS)
        check(keys == [ref], f'nettoyage : l\'image remplacée, utilisée nulle part, est effacée {len(keys)}')
        check(not errs, f'aucune erreur de page {errs}')
        await ctx.close()

        # Navigateur vierge : ouvrir les fichiers
        ctx, page, errs = await open_ctx()
        await page.evaluate("openSaves()")
        await page.set_input_files('#cfgIn', files=[{'name': 'affiche.json', 'mimeType': 'application/json', 'buffer': json.dumps(cfg).encode()}])
        await wait_js(page, "CMS.illus.ready()", 8000)
        check(await page.evaluate("[__cms.st.mode, __cms.st.illus.img.ref, CMS.illus.image.w]") == ['illus', ref, 900], 'navigateur vierge : configuration avec image ouverte, illustration affichée')
        check('1 illustration ajoutée' in await page.text_content('#toast'), 'ouverture : illustration ajoutée signalée')
        check(await page.evaluate(KEYS) == [ref], 'image rangée dans IndexedDB à l\'ouverture')

        # Fichiers piégés : image invalide, empreinte invalide, image existante jamais remplacée
        forged = json.loads(json.dumps(cfg)); bad = '0' * 64
        forged['images'] = {bad: {'data': 'data:image/png;base64,QUJD', 'name': 'x'}, 'pas-une-empreinte': cfg['images'][ref],
                            ref: {'data': 'data:image/png;base64,' + B, 'name': 'pirate.png'}}
        forged['state']['illus']['img']['ref'] = bad
        await page.evaluate("openSaves()")
        await page.set_input_files('#cfgIn', files=[{'name': 'piege.json', 'mimeType': 'application/json', 'buffer': json.dumps(forged).encode()}])
        await wait_js(page, "CMS.illus.missing", 8000)
        t = await page.text_content('#toast')
        check('2 illustrations illisibles ignorées' in t, f'fichier piégé : images invalides ignorées ({t})')
        check(sorted(await page.evaluate(KEYS)) == [ref], 'fichier piégé : rien d\'ajouté, image existante non remplacée')
        await page.evaluate("__cms.undo()")
        await wait_js(page, "CMS.illus.ready()", 8000)
        check(await page.evaluate("CMS.illus.image.w") == 900, 'image existante intacte (900 px, pas l\'image pirate)')
        await ctx.close()

        ctx, page, errs2 = await open_ctx()
        await page.evaluate("openSaves()")
        await page.set_input_files('#cfgIn', files=[{'name': 'mes-affiches.json', 'mimeType': 'application/json', 'buffer': json.dumps(bak).encode()}])
        await page.wait_for_timeout(1500)
        check(await page.evaluate("__cms.loadSaves().length") == 1 and await page.evaluate(KEYS) == [ref], 'navigateur vierge : sauvegarde complète et ses images importées')
        await page.set_input_files('#cfgIn', files=[{'name': 'sans-image.json', 'mimeType': 'application/json', 'buffer': json.dumps({**cfg0, 'state': {**cfg0['state'], 'illus': {**cfg0['state']['illus'], 'img': {**cfg0['state']['illus']['img'], 'ref': 'a' * 64}}}}).encode()}])
        await wait_js(page, "CMS.illus.missing", 8000)
        check(True, 'fichier sans image d\'une image inconnue : illustration à importer')
        sid = await page.evaluate("__cms.loadSaves()[0].id")
        await page.evaluate(f"deleteSave('{sid}')"); await page.wait_for_timeout(800)
        check(await page.evaluate(KEYS) == [], 'affiche supprimée : son image orpheline effacée')
        check(not errs and not errs2, f'aucune erreur de page {errs + errs2}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
