"""e2e : lisibilité, accessibilité et confort (revue UX, lots 3 et 4).

Onglets accessibles (rôles ARIA, flèches du clavier) dans l'ordre du parcours, boutons
« Étape suivante », section « Avancé » repliée puis ouverte quand elle sert, couleurs
repliées, cibles tactiles, focus visible ; annuler / rétablir (boutons et clavier, y
compris après « Réinitialiser ») ; calendrier pour la date ; « Ma position » ; recherche
à la validation, une seule à la fois ; aperçu des polices avec le titre saisi.
"""
import pathlib, os, asyncio, json
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri()+'?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
NOMI = json.dumps([{'lat': '48.8584', 'lon': '2.2945', 'name': 'Tour Eiffel',
                    'display_name': 'Tour Eiffel, Avenue Gustave Eiffel, Paris, France'}])

# Cibles tactiles : tout élément interactif visible du panneau, hors liens dans le texte et curseurs.
TARGETS = """() => {
  const sel = 'button, label.tog, label.f.show, .chip, summary, input[type=text], input[type=search], input[type=color], .card, .theme, label.btn';
  const out = [];
  for (const el of document.querySelectorAll('#panel ' + sel.split(', ').join(', #panel '))) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden') continue;
    if (el.matches('input[type=color]') && el.closest('label')) continue;   // la ligne entière est la cible
    const small = el.matches('.lnk, .uisz button, .hist button');            // barre du bas : 36 px (WCAG 2.2 AA : 24 px)
    if (el.matches('.grab')) { if (r.height < 28) out.push('poignée ' + Math.round(r.height) + ' px < 28'); continue; }   // toute la largeur
    const seg = el.matches('.seg button');                                    // segments : 40 px dans un cadre de 46 px
    const min = small ? 36 : seg ? 40 : 44;
    if (r.height < min - 0.5 || (el.matches('button') && r.width < min - 0.5))
      out.push(`${el.id || el.className || el.tagName} « ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)} » ${Math.round(r.width)}×${Math.round(r.height)} < ${min}`);
  }
  return out;
}"""

async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 664}, is_mobile=True, has_touch=True,
                                  permissions=['geolocation'], geolocation={'latitude': 48.8584, 'longitude': 2.2945})
        page = await ctx.new_page(); errs = []; nomi = []
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            u = r.request.url
            if 'nominatim' in u:
                nomi.append(u); await asyncio.sleep(0.6); await r.fulfill(status=200, content_type='application/json', body=NOMI)
            elif u.startswith('file:'): await r.continue_()
            else: await r.abort()
        await page.route('**/*', route)
        await page.goto(APP); await page.wait_for_timeout(1300)
        await page.evaluate("__cms.setSheet('full')"); await page.wait_for_timeout(200)

        # ---------- Onglets ----------
        order = await page.evaluate("[...document.querySelectorAll('#tabs button:not([hidden])')].map(b=>b.dataset.tab)")
        check(order == ['lieu', 'repere', 'textes', 'style', 'export'], f'onglets dans l\'ordre du parcours {order}')
        aria = await page.evaluate("""[document.getElementById('tabs').getAttribute('role'),
            [...document.querySelectorAll('#tabs button:not([hidden])')].map(b=>b.getAttribute('role')+':'+b.getAttribute('aria-selected')).join(' '),
            document.getElementById('tab-lieu').getAttribute('role')]""")
        check(aria == ['tablist', 'tab:true tab:false tab:false tab:false tab:false', 'tabpanel'], f'rôles ARIA {aria}')
        await page.focus('#tb-lieu'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
        cur = await page.evaluate("[document.activeElement.id, document.querySelector('#tabs .on').dataset.tab, document.getElementById('tb-textes').getAttribute('aria-selected')]")
        check(cur == ['tb-textes', 'textes', 'true'], f'flèches du clavier : onglet suivant, focus déplacé {cur}')
        await page.keyboard.press('End'); await page.keyboard.press('ArrowRight')
        check(await page.evaluate("document.querySelector('#tabs .on').dataset.tab") == 'lieu', 'Fin puis flèche : retour au premier onglet')
        outline = await page.evaluate("getComputedStyle(document.activeElement).outlineStyle")
        check(outline != 'none', f'focus clavier visible ({outline})')

        # ---------- Parcours guidé ----------
        seen = []
        for _ in range(3):
            await page.click('.tab.on [data-next]'); seen.append(await page.evaluate("document.querySelector('#tabs .on').dataset.tab"))
        check(seen == ['repere', 'textes', 'style'], f'« Étape suivante » : {seen}')
        check(await page.is_visible('#bNextExport'), 'dernière étape : bouton « exporter l\'affiche »')

        # ---------- Sections repliées ----------
        check(not await page.evaluate("document.getElementById('colorsBox').open") and not await page.is_visible('#colors input'),
              'couleurs repliées par défaut')
        # Onglet Style : « Plus de réglages » (#62) repliée par défaut, mémorisée, ouverte d'office si un réglage avancé est actif
        MORE = "[document.getElementById('styleMore').open, localStorage.getItem('cityMapStudio.styleMoreOpen')]"
        check(await page.evaluate(MORE) == [False, None] and not await page.is_visible('#colorsBox') and await page.is_visible('#themes'),
              'Style : « Plus de réglages » repliée par défaut, Essentiel visible')
        ess = await page.evaluate("['#ambiances','#layouts','#themes','#duos','#fontSeg','#textures'].map(q=>!!document.querySelector(q)?.offsetParent)")
        check(all(ess), f'Style, Essentiel : ambiances, gabarit, thèmes, polices, papier {ess}')
        await page.click('#styleMore summary'); await page.wait_for_timeout(150)
        check(await page.evaluate(MORE) == [True, '1'] and await page.is_visible('#colorsBox'), '« Plus de réglages » ouverte et mémorisée')
        await page.click('#styleMore summary'); await page.wait_for_timeout(150)
        check(await page.evaluate(MORE) == [False, None], '« Plus de réglages » refermée : mémoire effacée')
        await page.evaluate("()=>{ const c=document.querySelector('[data-k=\"fx.hatch\"]'); c.checked=true; c.dispatchEvent(new Event('input',{bubbles:true})); }")
        await page.wait_for_timeout(150)
        check(await page.evaluate(MORE) == [True, None], 'effet de tracé actif : section ouverte d\'office, sans être mémorisée')
        await page.evaluate("()=>{ const c=document.querySelector('[data-k=\"fx.hatch\"]'); c.checked=false; c.dispatchEvent(new Event('input',{bubbles:true})); }")
        await page.click('#colorsBox summary')
        check(await page.is_visible('#colors input'), 'couleurs dépliées au toucher')
        await page.evaluate("__cms.showTab('lieu')")
        check(not await page.evaluate("document.getElementById('adv').open") and not await page.is_visible('#engineSeg'),
              'onglet Lieu : moteur et diagnostic repliés dans « Avancé »')
        check(await page.is_visible('#presets') and await page.is_visible('#bPlace2'), 'onglet Lieu : recherche, villes et repère visibles')
        await page.click('#adv summary'); await page.wait_for_timeout(200)
        stored = await page.evaluate("[document.getElementById('adv').open, localStorage.getItem('cityMapStudio.advOpen')]")
        check(stored == [True, '1'], f'« Avancé » ouvert et mémorisé {stored}')
        # Relecture au démarrage : nouvelle page avec la préférence déjà enregistrée (un rechargement immédiat
        # peut précéder l'écriture différée de localStorage par Chromium)
        p2 = await ctx.new_page(); await p2.route('**/*', route)
        await p2.add_init_script("try{localStorage.setItem('cityMapStudio.advOpen','1');localStorage.setItem('cityMapStudio.styleMoreOpen','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")
        await p2.goto(APP); await p2.wait_for_timeout(1000)
        check(await p2.evaluate("document.getElementById('adv').open"), '« Avancé » rouvert au démarrage suivant')
        await p2.close()
        await page.click('#adv summary'); await page.wait_for_timeout(100)
        await page.evaluate("__cms.setEngine('file')"); await page.wait_for_timeout(200)
        check(await page.evaluate("document.getElementById('adv').open") and await page.is_visible('#fileIn + *, #fileBlock'),
              'moteur Fichier : « Avancé » ouvert d\'office (import)')
        # Données du moteur Fichier ; on laisse passer la fenêtre de 1,5 s pendant laquelle un changement de moteur n'entre pas dans l'historique
        await page.evaluate("f=>__cms.importText(f,'osm.json')", FIX); await page.wait_for_timeout(1600)

        # ---------- Cibles tactiles ----------
        await page.evaluate("__cms.setSheet('full'); document.getElementById('colorsBox').open=true")
        small = []
        for t in ['lieu', 'repere', 'textes', 'style']:
            await page.evaluate(f"__cms.showTab('{t}')"); await page.wait_for_timeout(100)
            small += await page.evaluate(TARGETS)
        check(not small, f'cibles tactiles ≥ 44 px (barre du bas ≥ 36 px) {small[:6]}')

        # ---------- Annuler / rétablir ----------
        await page.evaluate("__cms.showTab('textes')")
        check(await page.is_disabled('#bUndo'), 'historique vide au départ : « Annuler » inactif')
        await page.fill('input[data-k="texts.title"]', 'Tours'); await page.wait_for_timeout(500)
        await page.evaluate("__cms.showTab('style')"); await page.click('#layouts .card[data-v=medallion]'); await page.wait_for_timeout(500)
        await page.click('#themes .theme[data-v=nuit]'); await page.wait_for_timeout(500)
        state = lambda: page.evaluate("[__cms.st.texts.title, __cms.st.layout, __cms.st.theme]")
        check(await state() == ['Tours', 'medallion', 'nuit'], 'trois modifications')
        await page.click('#bUndo'); await page.wait_for_timeout(150)
        check(await state() == ['Tours', 'medallion', 'souvenir'], 'Annuler : thème rétabli')
        await page.click('#bUndo'); await page.click('#bUndo'); await page.wait_for_timeout(150)
        check(await state() == ['Blois', 'souvenir', 'souvenir'], 'Annuler × 3 : état de départ')
        check(await page.input_value('input[data-k="texts.title"]') == 'Blois', 'champs resynchronisés')
        check(await page.is_disabled('#bUndo') and not await page.is_disabled('#bRedo'), 'boutons à jour')
        await page.click('#bRedo'); await page.wait_for_timeout(150)
        check(await state() == ['Tours', 'souvenir', 'souvenir'], 'Rétablir : titre revenu')
        await page.evaluate("document.activeElement.blur()")
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(150)
        check(await state() == ['Blois', 'souvenir', 'souvenir'], 'Ctrl+Z annule')
        await page.keyboard.press('Control+Shift+z'); await page.wait_for_timeout(150)
        check(await state() == ['Tours', 'souvenir', 'souvenir'], 'Ctrl+Maj+Z rétablit')
        await page.evaluate("__cms.resetAll()"); await page.wait_for_timeout(2000)   # le moteur par défaut se charge, la carte se recentre
        eng = await page.evaluate("__cms.st.engine")
        await page.click('#bUndo'); await page.wait_for_timeout(300)
        check((await state())[0] == 'Tours', '« Réinitialiser » peut être annulé (recentrages de la carte ignorés)')
        check(await page.evaluate("__cms.st.engine") == eng, 'le moteur n\'est pas concerné par l\'historique')

        # ---------- Date ----------
        check(await page.evaluate("[__cms.frDate('2023-07-01'), __cms.frDate('2024-12-25'), __cms.isoFromFr('Le 14 juillet 2023'), __cms.isoFromFr('Le 1er mai 2020'), __cms.isoFromFr('Un beau jour')]")
              == ['Le 1er juillet 2023', 'Le 25 décembre 2024', '2023-07-14', '2020-05-01', ''], 'conversions de date (1er, mois en toutes lettres, lecture inverse)')
        await page.evaluate("__cms.showTab('textes'); __cms.st.show.date=false")
        await page.evaluate("const i=document.getElementById('dateIn'); i.value='2019-08-03'; i.dispatchEvent(new Event('change'))")
        await page.wait_for_timeout(200)
        check(await page.evaluate("[__cms.st.texts.date, __cms.st.show.date]") == ['Le 3 août 2019', True]
              and await page.input_value('input[data-k="texts.date"]') == 'Le 3 août 2019', 'calendrier : date saisie et ligne réaffichée')
        box = await page.evaluate("(()=>{const r=document.querySelector('.datebtn').getBoundingClientRect(), q=document.getElementById('dateIn').getBoundingClientRect(); return [r.width>=44&&r.height>=44, Math.abs(r.width-q.width)<=2.5&&Math.abs(r.height-q.height)<=2.5]})()")
        check(box == [True, True], 'bouton calendrier ≥ 44 px, entièrement couvert par le champ date natif (iOS)')

        # ---------- Polices ----------
        await page.evaluate("__cms.showTab('style')")   # les polices sont dans l'onglet Style
        smp = await page.evaluate("[...document.querySelectorAll('#fontTitleSeg button:not([data-v=\\'\\']) .smp')].map(e=>e.textContent)")
        check(len(smp) == 11 and all(t == 'Tours' for t in smp), f'aperçu des polices du titre avec le titre saisi {smp}')
        await page.click('#fontSeg [data-v=garamond]')
        check(await page.evaluate("[__cms.st.font, document.querySelector('#fontSeg [data-v=garamond]').getAttribute('aria-checked')]") == ['garamond', 'true'], 'police choisie (radio ARIA)')

        # ---------- Ma position ----------
        await page.evaluate("__cms.showTab('lieu'); document.querySelector('.tabbody').scrollTop=0")
        check(await page.is_visible('#bGeo'), 'bouton « Ma position » proposé')
        await page.click('#bGeo'); await page.wait_for_timeout(600)
        m = await page.evaluate("[__cms.st.marker.lat.toFixed(4), __cms.st.marker.lon.toFixed(4), __cms.st.center.lat.toFixed(4)]")
        check(m == ['48.8584', '2.2945', '48.8584'], f'« Ma position » : repère et carte sur la position {m}')
        cur = lambda: page.evaluate("[...['cityTxt','markerTxt'].map(i=>document.getElementById(i).querySelector('b').textContent), [...document.querySelectorAll('#presets .chip[aria-pressed=true]')].map(b=>b.textContent)]")
        check(await cur() == ['Paris', 'Paris', ['Paris · Seine']], f'onglet Lieu : ville et lieu de rencontre indiqués de la même façon, ville en surbrillance {await cur()}')
        await page.click('#presets .chip:has-text("Périgueux")'); await page.wait_for_timeout(300)
        check(await cur() == ['Périgueux', 'Périgueux', ['Périgueux · Isle']], f'onglet Lieu : indications suivant la ville choisie {await cur()}')
        await page.fill('#markerIn', '46.5, 2.5'); await page.press('#markerIn', 'Enter'); await page.wait_for_timeout(300)
        t = await page.inner_text('#markerTxt')
        check(t.startswith('Autre lieu') and '46° 30′' in t, f'onglet Lieu : repère hors des villes proposées {t!r}')

        # ---------- Recherche ----------
        await page.fill('#q', 'tour eiffel'); await page.press('#q', 'Enter'); await page.wait_for_timeout(100)
        busy = await page.is_disabled('#searchForm [type=submit]')
        await page.press('#q', 'Enter'); await page.wait_for_timeout(900)
        check(busy and len(nomi) == 1, f'recherche : bouton inactif pendant la requête, une seule requête ({len(nomi)})')
        await page.fill('#q', 'tour eiff'); await page.wait_for_timeout(700)
        check(len(nomi) == 1, 'aucune requête pendant la frappe (politique Nominatim)')
        res = await page.inner_text('#results')
        check('Tour Eiffel' in res and 'Paris' in res and not await page.is_disabled('#searchForm [type=submit]'), 'résultat : nom en tête, adresse en dessous')
        await page.screenshot(path=str(T / 'ux-search.png'))
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
