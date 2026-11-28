"""e2e : Mes affiches — sauvegarde et restauration de la configuration (moteur Fichier, sans réseau).

Vérifie : enregistrement nommé avec vignette, mise à jour d'un même nom, ordre ; restauration fidèle (aller-retour
exact de l'état), annulable ; persistance après rechargement ; suppression en deux temps ; Ctrl + S ;
fichier de configuration (téléchargé puis rouvert) ; sauvegarde complète (exportée, réimportée sans doublon) ;
fichiers piégés ou invalides refusés sans rien modifier, valeurs forgées corrigées, nombre de sauvegardes borné ;
navigateur plein : message, aucune perte ; accessibilité des commandes.
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
SNAP = "(()=>{ const {engine,...s}=__cms.st; return JSON.stringify(s); })()"

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
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        await seed(page, APP, wait=1300)
        ev = page.evaluate
        await ev("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(400)
        await page.click('#tb-style'); await page.wait_for_timeout(200)

        # 1. Fenêtre, enregistrement nommé, vignette
        await page.click('#tb-export'); await wait_js(page, "document.getElementById('tab-export').classList.contains('on')")
        check(await ev("!document.getElementById('savesEmpty').hidden && document.getElementById('bSavesBackup').disabled"), 'liste vide : message et sauvegarde complète désactivée')
        check(await ev("document.getElementById('saveName').value") == 'Blois · Alice & Mathias', 'nom proposé : titre et noms')
        await ev("()=>__cms.applyAmbiance('ancienne')")
        a_snap = await ev(SNAP)
        await page.fill('#saveName', 'Carte ancienne'); await page.click('#saveForm button[type=submit]'); await page.wait_for_timeout(200)
        check(await ev("document.querySelectorAll('#savesList .save').length") == 1, 'enregistrée : une affiche dans la liste')
        check(await ev("document.querySelector('#savesList img').src.startsWith('data:image/jpeg')"), 'vignette de l\'affiche (JPEG)')
        await ev("()=>{ __cms.applyAmbiance('nuit'); __cms.st.texts.title='Lyon'; }")
        b_snap = await ev(SNAP)
        await page.fill('#saveName', 'Nuit à Lyon'); await page.press('#saveName', 'Enter'); await page.wait_for_timeout(200)
        names = await ev("[...document.querySelectorAll('#savesList .meta b')].map(b=>b.textContent)")
        check(names == ['Nuit à Lyon', 'Carte ancienne'], f'la plus récente en tête {names}')
        await ev("()=>{ __cms.st.texts.subtitle='Rhône'; }"); b_snap = await ev(SNAP)
        await page.fill('#saveName', 'nuit à lyon'); await page.click('#saveForm button[type=submit]'); await page.wait_for_timeout(200)
        check(await ev("document.querySelectorAll('#savesList .save').length") == 2, 'même nom (casse ignorée) : mise à jour sous le nom saisi, pas de doublon')

        # 2. Restauration fidèle et annulable
        await page.click('#savesList button[aria-label="Restaurer « Carte ancienne »"]'); await page.wait_for_timeout(600)
        check(await ev(SNAP) == a_snap, 'restauration : état identique à l\'enregistrement')
        check(await page.is_visible('#savesList'), 'restauration : la liste reste affichée (onglet Export)')
        check(await ev("__cms.st.engine") == 'file', 'restauration : moteur de l\'appareil conservé')
        await page.click('#bUndo'); await page.wait_for_timeout(600)
        check(await ev(SNAP) == b_snap, 'restauration annulable (retour à l\'affiche en cours)')

        # 3. Persistance après rechargement (écriture faite par la page elle-même)
        await page.reload(); await page.wait_for_timeout(1300)
        await ev("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(300)
        n = await ev("__cms.loadSaves().map(s=>s.name)")
        check(n == ['nuit à lyon', 'Carte ancienne'], f'sauvegardes conservées après rechargement {n}')

        # 4. Ctrl + S, suppression en deux temps
        await page.keyboard.press('Control+s'); await page.wait_for_timeout(300)
        check(len(await ev("__cms.loadSaves()")) == 3, 'Ctrl + S : affiche en cours enregistrée')
        await page.click('#tb-export'); await wait_js(page, "document.getElementById('tab-export').classList.contains('on')")
        first = await ev("__cms.loadSaves()[0].name")
        sel = f'#savesList button[aria-label="Supprimer « {first} »"]'
        await page.click(sel); await page.wait_for_timeout(150)
        check(len(await ev("__cms.loadSaves()")) == 3 and await page.inner_text(sel) == 'Supprimer ?', 'suppression : confirmation demandée d\'abord')
        await page.click(sel); await page.wait_for_timeout(200)
        check(len(await ev("__cms.loadSaves()")) == 2, 'suppression confirmée')

        # 5. Fichier de configuration : téléchargé, puis rouvert
        async with page.expect_download() as dl: await page.click('#savesList button[aria-label="Télécharger « Carte ancienne »"]')
        d = await dl.value; cfg_path = str(T / 'saves-config.json'); await d.save_as(cfg_path)
        cfg = json.load(open(cfg_path))
        check(cfg['format'] == 'city-map-studio/configuration' and cfg['version'] == 1 and 'engine' not in cfg['state'] and d.suggested_filename == 'affiche-carte-ancienne.json',
              f'fichier de configuration : format, version, sans moteur ({d.suggested_filename})')
        await ev("()=>{ __cms.applyAmbiance('souvenir'); __cms.st.texts.title='Autre'; }")
        await page.set_input_files('#cfgIn', cfg_path); await page.wait_for_timeout(700)
        check(await ev(SNAP) == a_snap, 'fichier rouvert : affiche restaurée à l\'identique')
        async with page.expect_download() as dl:
            await page.click('#tb-export'); await page.click('#bCfgExport')
        cur = json.loads(open(await (await dl.value).path()).read())
        check(cur['state']['texts']['title'] == 'Blois' and cur['state']['layout'] == 'classic', 'affiche en cours téléchargée')

        # 6. Sauvegarde complète : exportée, réimportée sans doublon, fusionnée
        async with page.expect_download() as dl: await page.click('#bSavesBackup')
        bak_path = str(T / 'saves-backup.json'); await (await dl.value).save_as(bak_path)
        bak = json.load(open(bak_path))
        check(bak['format'] == 'city-map-studio/sauvegardes' and len(bak['saves']) == 2, f'sauvegarde complète : {len(bak["saves"])} affiches')
        await page.set_input_files('#cfgIn', bak_path); await page.wait_for_timeout(300)
        check(len(await ev("__cms.loadSaves()")) == 2, 'réimport de la même sauvegarde : aucun doublon')
        await ev("()=>localStorage.removeItem('cms3.saves')")
        await page.set_input_files('#cfgIn', bak_path); await page.wait_for_timeout(300)
        n = await ev("__cms.loadSaves().map(s=>s.name)")
        check(n == ['nuit à lyon', 'Carte ancienne'], f'sauvegarde complète réimportée dans un navigateur vide {n}')
        check(await ev("document.querySelectorAll('#savesList .save').length") == 2, 'liste mise à jour après l\'import')

        # 7. Fichiers invalides ou piégés : refusés sans rien modifier ; valeurs forgées corrigées
        before = await ev(SNAP)
        cases = [('pas-json.json', 'ceci n\'est pas du JSON'), ('tableau.json', '[1,2,3]'), ('autre.json', json.dumps({'format': 'autre', 'state': {}})),
                 ('gros.json', json.dumps({'format': 'city-map-studio/configuration', 'state': {'texts': {'title': 'x' * (1100 * 1024)}}}))]
        for name, body in cases:
            p_ = T / f'saves-{name}'; p_.write_text(body)
            await page.set_input_files('#cfgIn', str(p_)); await page.wait_for_timeout(250)
            toast = await page.inner_text('#toast')
            check(await ev(SNAP) == before and 'Ouverture impossible' in toast, f'fichier refusé ({name}) : « {toast[:70]} »')
        forged = {'format': 'city-map-studio/configuration', 'version': 9, 'name': '<img src=x onerror=alert(1)>',
                  'state': {'layout': 'evil', 'theme': 'souvenir', 'colors': {'paper': 'red;}', 'text': '#123456'}, 'texts': {'title': 'T' * 5000}, 'margin': 99,
                            'fx': {'glow': 'oui', 'halo': True}, 'engine': 'maplibre', '__proto__': {'polluted': 1}}}
        p_ = T / 'saves-forge.json'; p_.write_text(json.dumps(forged))
        await page.set_input_files('#cfgIn', str(p_)); await page.wait_for_timeout(600)
        s = await ev("({layout:__cms.st.layout, paper:__cms.st.colors.paper, text:__cms.st.colors.text, title:__cms.st.texts.title.length, margin:__cms.st.margin, glow:__cms.st.fx.glow, halo:__cms.st.fx.halo, engine:__cms.st.engine, polluted:({}).polluted, toast:document.getElementById('toast').textContent})")
        check(s['layout'] == 'souvenir' and s['paper'] == '#FFFFFF' and s['text'] == '#123456' and s['title'] == 200 and s['margin'] == 12, f'valeurs forgées corrigées {s}')
        check(s['glow'] is False and s['halo'] is True and s['engine'] == 'file' and s['polluted'] is None, 'effets vérifiés, moteur conservé, aucune pollution de prototype')
        check('version plus récente' in s['toast'] and '<img' in s['toast'], 'version plus récente signalée ; nom affiché comme texte')
        many = {'format': 'city-map-studio/sauvegardes', 'saves': [{'id': f'id{i:06d}', 'name': f'A{i}', 'savedAt': '2024-01-01T00:00:00Z', 'state': {}, 'thumb': 'javascript:alert(1)'} for i in range(300)]}
        p_ = T / 'saves-many.json'; p_.write_text(json.dumps(many))
        await page.set_input_files('#cfgIn', str(p_)); await page.wait_for_timeout(400)
        l = await ev("__cms.loadSaves()")
        check(len(l) == 40, f'nombre de sauvegardes borné à 40 ({len(l)})')
        check(all(x['thumb'] == '' for x in l if x['name'].startswith('A')), 'vignette piégée (javascript:) écartée')
        check(not await ev("[...document.querySelectorAll('#savesList img')].some(i=>!i.src.startsWith('data:image/'))"), 'vignettes affichées : images data: seulement')
        await ev("()=>localStorage.setItem('cms3.saves','{pas du json')")
        check(await ev("__cms.loadSaves().length") == 0, 'sauvegardes illisibles dans le navigateur : ignorées sans erreur')

        # 8. Navigateur plein : message clair, liste intacte
        await ev("()=>localStorage.removeItem('cms3.saves')")
        await ev("()=>__cms.saveCurrent('Gardée')")
        full = await ev("""()=>{ const orig=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){ if(k==='cms3.saves') throw new DOMException('quota','QuotaExceededError'); return orig.call(this,k,v); };
          const ok=__cms.saveCurrent('Trop'); Storage.prototype.setItem=orig; return {ok, toast:document.getElementById('toast').textContent, n:__cms.loadSaves().length}; }""")
        check(full['ok'] is False and 'plein' in full['toast'] and full['n'] == 1, f'navigateur plein : refus expliqué, aucune perte ({full["toast"][:60]})')

        # 9. Accessibilité : noms accessibles, fenêtre modale, Échap
        a11y = await ev("""[...document.querySelectorAll('#tab-export button, #tab-export input')].every(e=>(e.getAttribute('aria-label')||e.textContent.trim()||e.labels?.[0]?.textContent.trim()||e.closest('label')?.textContent.trim()))""")
        check(a11y, 'commandes de l\'onglet Export nommées')
        check(await ev("!!document.querySelector('#tab-export #savesList') && !!document.querySelector('#tab-export #result') && !document.querySelector('#savesList')?.closest('dialog')"),
              'Mes affiches et résultat de l\'export : intégrés à l\'onglet Export, hors de toute fenêtre modale')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    for f in T.glob('saves-*.json'): f.unlink()
    print('échecs', fails); assert not fails
asyncio.run(main())
