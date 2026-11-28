"""e2e : comparer avant / après un changement de thème (#15), d'ambiance, de modèle ou d'effet (#63).

Vérifie : bouton masqué tant qu'aucun thème n'a été changé ; après un changement, bouton visible et
nommé d'après le thème précédent ; appui maintenu (souris, toucher, clavier) : l'affiche montre le
thème précédent avec un badge « Avant » ; relâché : thème choisi rétabli à l'identique ; rien n'est
enregistré ni ajouté à l'historique pendant la comparaison ; bouton masqué après « Annuler » ou
une retouche de couleur ; aucune comparaison entre un thème et lui-même.
Étendu (#63) : ambiance, modèle de texte, effet de tracé (activé, retiré), papier ; bouton dans le pied du panneau,
accessible depuis tous les onglets ; relâcher rétablit exactement l'état courant ; une autre modification (titre,
cadrage) n'efface pas la comparaison et n'est pas comparée.
Moteur Fichier avec les données de test : aucun accès réseau.
"""
import pathlib, os, asyncio, json
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent).resolve()   # site testé : source, ou dist/ (CI)
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
SNAP = "(()=>[document.getElementById('cvUnder').toDataURL(), document.getElementById('vecCanvas').toDataURL(), document.getElementById('cvOver').toDataURL()].join())()"
SAVED = "JSON.parse(localStorage.getItem('cms3.affiche')).theme"
STATE = "JSON.stringify(__cms.st)"
STORED = "localStorage.getItem('cms3.affiche')"

async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        await seed(page, APP, wait=1300)
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(1600)
        ev = page.evaluate; btn = page.locator('#bCompare')
        await ev("__cms.showTab('style')"); await page.wait_for_timeout(200)
        check(not await btn.is_visible(), 'bouton masqué avant tout changement de thème')

        # même thème reconfirmé : pas de comparaison
        await page.click(f'#themes .theme[data-v={await ev("__cms.st.theme")}]'); await page.wait_for_timeout(300)
        check(not await btn.is_visible(), 'thème inchangé : pas de comparaison')

        before = await ev(SNAP); t0 = await ev("__cms.st.theme"); name0 = await ev("__cms.THEMES[__cms.st.theme].name")
        await page.click('#themes .theme[data-v=nuit]'); await page.wait_for_timeout(700)
        after = await ev(SNAP)
        check(await btn.is_visible() and name0 in await btn.inner_text(), f'bouton visible, nommé d\'après « {name0} » : {await btn.inner_text()!r}')
        hist0 = await ev("__cms.hist.past.length"); colors_after = await ev("JSON.stringify(__cms.st.colors)")

        # souris : appui maintenu
        await btn.hover(); await page.mouse.down(); await page.wait_for_timeout(500)
        held = await ev(SNAP)
        check(held == before, 'appui maintenu : affiche identique à l\'avant (fond, carte, textes)')
        check(await page.locator('#cmpBadge').is_visible() and name0 in await page.inner_text('#cmpBadge'), 'badge « Avant » sur l\'affiche')
        check(await btn.get_attribute('aria-pressed') == 'true', 'aria-pressed vrai pendant l\'appui')
        await page.wait_for_timeout(500)   # au-delà du délai d'enregistrement (300 ms)
        check(await ev(SAVED) == 'nuit', 'rien n\'est enregistré pendant la comparaison')
        await page.mouse.up(); await page.wait_for_timeout(500)
        check(await ev(SNAP) == after and await ev("JSON.stringify(__cms.st.colors)") == colors_after and await ev("__cms.st.theme") == 'nuit',
              'relâché : thème choisi rétabli à l\'identique')
        check(not await page.locator('#cmpBadge').is_visible() and await btn.get_attribute('aria-pressed') == 'false', 'badge masqué, aria-pressed faux')
        check(await ev("__cms.hist.past.length") == hist0, 'la comparaison n\'ajoute rien à l\'historique')

        # clavier : Espace maintenu
        await btn.focus(); await page.keyboard.down(' '); await page.wait_for_timeout(400)
        check(await ev(SNAP) == before, 'clavier (Espace maintenu) : thème précédent affiché')
        await page.keyboard.up(' '); await page.wait_for_timeout(400)
        check(await ev(SNAP) == after, 'clavier relâché : thème choisi')

        # toucher : appui long, sans menu contextuel
        box = await btn.bounding_box(); x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        cdp = await ctx.new_cdp_session(page)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]}); await page.wait_for_timeout(700)
        check(await ev(SNAP) == before, 'toucher maintenu : thème précédent affiché')
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await page.wait_for_timeout(400)
        check(await ev(SNAP) == after, 'toucher relâché : thème choisi')

        # thème enchaîné : la comparaison porte sur le dernier changement
        await page.click('#themes .theme[data-v=creme]'); await page.wait_for_timeout(500)
        name1 = await ev("__cms.THEMES.nuit.name")
        check(name1 in await btn.inner_text(), f'nouveau changement : comparaison avec « {name1} »')

        # « Annuler » ou retouche d'une couleur : comparaison périmée
        await ev("__cms.undo()"); await page.wait_for_timeout(600)
        check(not await btn.is_visible(), 'après « Annuler » : bouton masqué')
        await page.click('#themes .theme[data-v=onyx]'); await page.wait_for_timeout(500)
        check(await btn.is_visible(), 'nouveau thème : bouton de nouveau visible')
        await ev("()=>{ const i=document.querySelector('[data-c=water]'); i.value='#123456'; i.dispatchEvent(new Event('input')); }"); await page.wait_for_timeout(500)
        check(not await btn.is_visible(), 'couleur retouchée : bouton masqué')

        # ---- #63 : comparaisons étendues ----
        async def hold_check(label, before_snap, after_snap, during=None):
            """Appui maintenu puis relâché : affiche d'avant, puis état courant rétabli à l'identique, rien d'enregistré."""
            await page.wait_for_timeout(500)   # enregistrement différé terminé
            s0, stored0, h0 = await ev(STATE), await ev(STORED), await ev("__cms.hist.past.length")
            await btn.hover(); await page.mouse.down(); await page.wait_for_timeout(600)
            if before_snap is not None: check(await ev(SNAP) == before_snap, f'{label} : appui maintenu, affiche d\'avant')
            if during: check(await ev(during[0]), f'{label} : {during[1]}')
            badge = await page.inner_text('#cmpBadge')
            await page.wait_for_timeout(400)
            check(await ev(STORED) == stored0, f'{label} : rien n\'est enregistré pendant la comparaison')
            await page.mouse.up(); await page.wait_for_timeout(600)
            if after_snap is not None: check(await ev(SNAP) == after_snap, f'{label} : relâché, affiche courante')
            check(await ev(STATE) == s0, f'{label} : relâché, état courant rétabli exactement')
            check(await ev("__cms.hist.past.length") == h0, f'{label} : historique inchangé')
            return badge

        # ambiance
        await ev("__cms.showTab('style')"); await page.wait_for_timeout(200)
        b0 = await ev(SNAP)
        await page.click('#ambiances button[data-v=gala]'); await page.wait_for_timeout(900)
        a0 = await ev(SNAP); txt = await btn.inner_text()
        check(await btn.is_visible() and "l'ambiance « Soirée de gala »" in txt, f'ambiance : bouton visible, libellé adapté {txt!r}')
        badge = await hold_check('ambiance', b0, a0)
        check(badge == "Avant l'ambiance « Soirée de gala »", f'ambiance : badge {badge!r}')

        # autre modification (titre) : comparaison conservée, le titre courant reste affiché pendant l'appui
        await ev("()=>{ const i=document.querySelector('input[data-k=\"texts.title\"]'); i.value='Titre 63'; i.dispatchEvent(new Event('input',{bubbles:true})); }")
        await page.wait_for_timeout(600)
        check(await btn.is_visible(), 'titre modifié après l\'ambiance : comparaison conservée')
        await hold_check('ambiance puis titre', None, None, ("__cms.st.texts.title==='Titre 63' && !__cms.st.fx.foil", 'titre courant conservé, ambiance d\'avant'))

        # cadrage : jamais comparé
        z = await ev("__cms.st.zoom"); await page.click('#bZoomIn'); await page.wait_for_timeout(700); z1 = await ev("__cms.st.zoom")
        check(z1 != z and await btn.is_visible(), 'cadrage modifié : comparaison conservée')
        await hold_check('ambiance puis cadrage', None, None, (f"__cms.st.zoom==={z1}", 'cadrage courant conservé'))

        # modèle de texte, depuis l'onglet Textes : bouton accessible (pied du panneau)
        await ev("__cms.showTab('textes')"); await page.wait_for_timeout(300)
        ded0 = await ev("__cms.st.texts.dedication"); m0 = await ev(SNAP)
        await page.click('#occasions button >> nth=1'); await page.wait_for_timeout(700)
        m1 = await ev(SNAP); txt = await btn.inner_text()
        check(await btn.is_visible() and "le modèle « Mariage »" in txt, f'modèle : bouton visible depuis l\'onglet Textes {txt!r}')
        await hold_check('modèle', m0, m1, (f"__cms.st.texts.dedication==={ded0!r}", 'dédicace d\'avant affichée'))

        # effet de tracé : activé puis retiré
        await ev("__cms.showTab('style')"); await page.wait_for_timeout(200)
        toggle = "v=>{ const i=document.querySelector('[data-k=\"fx.pencil\"]'); i.checked=v; i.dispatchEvent(new Event('input',{bubbles:true})); }"
        e0 = await ev(SNAP); await ev(toggle, True); await page.wait_for_timeout(800); e1 = await ev(SNAP)
        txt = await btn.inner_text()
        check(e0 != e1 and "l'effet « Trait crayon »" in txt, f'effet activé : libellé {txt!r}')
        await hold_check('effet', e0, e1)
        await ev(toggle, False); await page.wait_for_timeout(800)
        txt = await btn.inner_text()
        check("le retrait de l'effet « Trait crayon »" in txt, f'effet retiré : libellé {txt!r}')
        await hold_check('effet retiré', e1, e0)

        # papier
        p0 = await ev(SNAP); await page.click('#textures button[data-v=kraft]'); await page.wait_for_timeout(700)
        txt = await btn.inner_text()
        check("le papier « " in txt, f'papier : libellé {txt!r}')
        await hold_check('papier', p0, None)

        # « Annuler » : comparaison périmée
        await ev("__cms.undo()"); await page.wait_for_timeout(700)
        check(not await btn.is_visible(), 'après « Annuler » : bouton masqué')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
