"""e2e : relecture des réglages modifiés (pastilles des onglets, comptes des sections, liste de l'onglet Export,
réinitialisation par partie) et barre d'actions (bouton principal, voyant d'état, version de la page).

Vérifie : état par défaut sans pastille ni écart ; pastilles sur les seuls onglets concernés, avec description accessible ;
compte de « Plus de réglages » ; liste par partie (« 3 lieux », « GPX actif », effets nommés sans leur précision entre
parenthèses) ; « Réinitialiser » ne rétablit que sa partie et « Annuler » la défait ; « Voir » ouvre l'onglet et la section
repliée ; parties hors du type d'affiche ignorées (effets en mode Illustration) ; couleurs comparées au thème choisi ;
bouton principal « Suivant : … » puis « Exporter » ; voyant d'état réduit à la pastille quand tout est prêt ;
version de la page connue en file:// (sans service worker), égale à VERSION de sw.js.
"""
import asyncio, os, pathlib, re
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()   # site testé : dist/ (construit par run_all.py), ou CMS_ROOT
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
VERSION = re.search(r"const VERSION = '([^']+)'", (ROOT / 'sw.js').read_text(encoding='utf-8')).group(1)
GPX = ('<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>Balade</name><trkseg>'
       + ''.join(f'<trkpt lat="{47.586 + i * 0.0002}" lon="{1.333 + i * 0.0003}"/>' for i in range(40)) + '</trkseg></trk></gpx>')
fails = []


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await b.new_page(viewport={'width': 1280, 'height': 900})
        await page.add_init_script("try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.welcomed','1')}catch(e){}")
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        ev = page.evaluate

        async def setk(k, v):   # comme un clic dans l'interface
            await ev("([k,v])=>{ const e=document.querySelector(`[data-k=\"${k}\"]`); if(e.type==='checkbox') e.checked=v; else e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); }", [k, v])
            await page.wait_for_timeout(450)   # enregistrement et historique (300 ms de calme)
        badges = lambda: ev("[...document.querySelectorAll('#tabs button')].filter(b=>!b.hidden && !b.querySelector('.tbd').hidden).map(b=>b.dataset.tab)")
        groups = lambda: ev("[...document.querySelectorAll('#changesList [data-reset]')].map(b=>b.dataset.reset)")
        row = lambda g: ev(f"(()=>{{ const b=document.querySelector('#changesList [data-reset=\"{g}\"]'); return b ? b.closest('li').querySelector('small').textContent : ''; }})()")

        # 1. Version de la page, sans service worker (file://)
        check(await page.text_content('#appVersion') != 'Version : –' and await ev("document.getElementById('appVersion').dataset.version") == VERSION,
              f"version connue en file:// : {await page.text_content('#appVersion')}")
        check(await ev("CMS.build.label('cms-2026-11-24h')") == '24/11/2026 (h)', 'libellé de version : date et lettre')

        # 2. État par défaut : aucun écart
        check(await badges() == [] and await groups() == [] and await ev("!document.getElementById('changesEmpty').hidden"),
              f'par défaut : aucune pastille, liste vide {await badges()} {await groups()}')
        check(await ev("document.getElementById('chg-styleMore').hidden"), 'par défaut : « Plus de réglages » sans compte')

        # 3. Réglages modifiés : pastilles, comptes, liste
        await setk('fx.pencil', True); await setk('fx.glow', True); await setk('layers.rail', False); await setk('show.subtitle', False)
        for _ in range(2): await ev("document.getElementById('bAddPlace').click()"); await page.wait_for_timeout(450)
        f = T / 'changes-test.gpx'; f.write_text(GPX)
        await page.set_input_files('#gpxIn', str(f)); await page.wait_for_timeout(700); f.unlink()
        await page.wait_for_timeout(300)
        check(sorted(await badges()) == ['repere', 'style', 'textes'], f'pastilles : Repère, Textes, Style {await badges()}')
        desc = await ev("document.getElementById(document.getElementById('tb-repere').getAttribute('aria-describedby')).textContent")
        check('3 lieux' in desc and 'GPX actif' in desc, f'description accessible de l\'onglet Repère : {desc!r}')
        fx = await row('fx')
        check('Trait crayon' in fx and 'Lueur' in fx and '(' not in fx, f'effets nommés, sans précision entre parenthèses : {fx!r}')
        check('sous-titre' in await row('lines'), 'lignes : sous-titre masqué')
        check(await row('trace') == 'sans « Voies ferrées »', f"calque masqué : {await row('trace')!r}")
        n = await ev("document.getElementById('chg-styleMore').textContent")
        check(n == '3 modifiés', f'« Plus de réglages » : compte des réglages modifiés {n!r}')

        # 4. Réinitialiser une partie, puis Annuler
        await ev("__cms.showTab('export')"); await page.wait_for_timeout(200)
        await page.click('#changesList [data-reset="fx"]'); await page.wait_for_timeout(600)
        check(not await ev("__cms.st.fx.pencil || __cms.st.fx.glow") and not await ev("__cms.st.layers.rail") and not await ev("__cms.st.show.subtitle")
              and await ev("__cms.st.markers2.length") == 2, 'Réinitialiser « Effets de tracé » : effets rétablis, autres parties intactes')
        check('fx' not in await groups(), 'partie rétablie : retirée de la liste')
        await ev("__cms.undo()"); await page.wait_for_timeout(600)
        check(await ev("__cms.st.fx.pencil && __cms.st.fx.glow") and 'fx' in await groups(), '« Annuler » : effets revenus')

        # 5. Voir : onglet et section repliée ouverts
        await ev("document.getElementById('styleMore').open=false")
        await ev("document.querySelector('#changesList [data-reset=\"fx\"]').previousElementSibling.click()"); await page.wait_for_timeout(400)
        check(await ev("__cms.ui.tab") == 'style' and await ev("document.getElementById('styleMore').open"), '« Voir » : onglet Style, « Plus de réglages » ouvert')

        # 6. Couleurs : comparées au thème choisi
        await ev("__cms.showTab('style')"); await ev("document.querySelector('#themes .theme[data-v=onyx]').click()")
        await page.wait_for_timeout(500)
        check('colors' not in await groups(), 'autre thème, palette intacte : couleurs non comptées')

        # 7. Type Illustration : les parties de la carte ne comptent pas
        await ev("CMS.illus.setMode('illus')"); await page.wait_for_timeout(500)
        g = await groups()
        check('fx' not in g and 'trace' not in g and 'places' not in g, f'mode Illustration : effets, tracé et lieux ignorés {g}')
        check('repere' not in await badges(), 'mode Illustration : onglet Repère absent, sans pastille')
        await ev("CMS.illus.setMode('map')"); await page.wait_for_timeout(500)

        # 8. Bouton principal de la barre d'actions
        await ev("__cms.showTab('lieu')"); await page.wait_for_timeout(150)
        check(await ev("document.getElementById('bNext').getAttribute('aria-label')") == 'Étape suivante : le repère'
              and await page.text_content('#bNextTxt') == 'Repère', 'onglet Lieu : « Suivant : Repère »')
        await page.click('#bNext'); await page.wait_for_timeout(150)
        check(await ev("__cms.ui.tab") == 'repere', 'bouton principal : onglet suivant')
        await ev("__cms.showTab('export')"); await page.wait_for_timeout(150)
        check(await page.text_content('#bNextTxt') == 'Exporter' and await ev("document.getElementById('bNext').dataset.act") == 'export', 'dernier onglet : « Exporter »')
        await ev("document.getElementById('bExport').disabled=true"); await page.wait_for_timeout(100)
        check(await ev("document.getElementById('bNext').disabled"), 'export impossible : bouton principal désactivé')
        await ev("document.getElementById('bExport').disabled=false"); await page.wait_for_timeout(100)

        # 9. Voyant d'état
        await ev("setStatus('Prêt · test')"); check(await ev("document.getElementById('stPill').classList.contains('quiet')"), 'voyant « Prêt » : pastille seule')
        await ev("setStatus('Chargement…','busy')"); check(not await ev("document.getElementById('stPill').classList.contains('quiet')"), 'voyant : chargement écrit')
        await ev("setStatus('Prêt')")

        # 10. Aperçu seul sur ordinateur : panneau masqué, scène sur toute la largeur
        await page.click('#bClean'); await page.wait_for_timeout(400)
        sw = await ev("[document.getElementById('panel').offsetParent===null, Math.round(document.getElementById('stage').getBoundingClientRect().width)]")
        check(sw == [True, 1280], f'ordinateur, affiche seule : panneau masqué, scène pleine largeur {sw}')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
        check(await ev("document.getElementById('panel').offsetParent!==null"), 'Échap : panneau rétabli')

        # 11. Tout réinitialiser : plus aucun écart
        await ev("__cms.showTab('export')")
        await page.click('#bReset'); await page.click('#bReset'); await page.wait_for_timeout(1200)
        check(await groups() == [] and await badges() == [], f'« Tout réinitialiser » : liste vide, aucune pastille {await groups()}')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
