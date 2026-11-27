"""e2e : zone de sécurité pour l'impression maison (issue #60).

Case de l'onglet Export (désactivée par défaut, mémorisée dans l'appareil, hors de l'état de l'affiche) : trait
pointillé à 5 mm du bord pour chaque format et orientation, dans l'aperçu seulement (export identique) ; alerte
quand un texte, un repère ou la mention des sources entre dans la bande ; conseil propre au 10 × 15 cm ; masqué
en mode « affiche seule » ; conseil « Taille réelle » près du bouton d'export.
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
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
        await page.evaluate("__cms.showTab('export')")
        warn = lambda: page.evaluate("document.getElementById('safeWarn').textContent")
        guide = lambda: page.is_visible('#safeGuide')
        async def setup(fmt, orient='portrait', margin=6.5):
            await page.evaluate(f"__cms.setOrient('{orient}'); __cms.setFormat('{fmt}'); __cms.st.margin={margin}; __cms.setLayout(__cms.st.layout)")
            await page.wait_for_timeout(350)

        check(not await page.evaluate("document.getElementById('safeTog').checked") and not await guide() and await warn() == '',
              'désactivée par défaut : ni repère ni message')
        check('Taille réelle' in await page.evaluate("document.getElementById('tab-export').textContent"), 'conseil « Taille réelle » dans l\'onglet Export')
        export0 = await page.evaluate("__cms.composePoster(400,566).then(r=>{ const d=r.canvas.toDataURL(); r.canvas.width=0; return d; })")
        await page.click('#safeTog'); await page.wait_for_timeout(300)
        check(await guide(), 'case cochée : repère affiché sur l\'aperçu')
        check(await page.evaluate("localStorage.getItem('cms3.safeZone')") == '1' and 'safe' not in await page.evaluate("JSON.stringify(Object.keys(__cms.st))"),
              'réglage mémorisé dans l\'appareil, hors de l\'état de l\'affiche')

        # 5 mm exactement, selon le format et l'orientation (largeur imprimée en mm)
        for fmt, orient, mm in [('a4', 'portrait', 210), ('a4', 'landscape', 297), ('a3', 'portrait', 297), ('50x70', 'portrait', 500), ('10x15', 'portrait', 100)]:
            await setup(fmt, orient)
            g, pw = await page.evaluate("[(()=>{ const a=document.getElementById('safeGuide').getBoundingClientRect(), p=document.getElementById('poster').getBoundingClientRect(); return [a.left-p.left, a.top-p.top, p.right-a.right, p.bottom-a.bottom]; })(), __cms.ui.posterCss.w]")
            want = 5 / mm * pw
            check(all(abs(v - want) <= 1 for v in g), f'{fmt} {orient} : repère à 5 mm ({[round(v, 1) for v in g]} px, attendu {want:.1f})')

        # Export identique, repère affiché ou non
        await setup('a4')
        export1 = await page.evaluate("__cms.composePoster(400,566).then(r=>{ const d=r.canvas.toDataURL(); r.canvas.width=0; return d; })")
        check(export1 == export0, 'export identique : le repère n\'est jamais exporté')

        # Alertes
        check(await warn() == 'Textes et repères dans la zone imprimable.', f'A4, marge par défaut : tout est dans la zone ({await warn()})')
        await setup('a4', margin=3)
        w = await warn(); check(w.startswith('⚠') and 'mention des sources' in w and 'Augmentez la marge' in w, f'A4, marge 3 % : mention des sources signalée ({w})')
        await setup('10x15', margin=3)
        w = await warn(); check('dédicace' in w and 'titre' in w and 'laboratoire photo' in w, f'10 × 15 cm, marge 3 % : textes signalés et conseil du petit format ({w})')
        await setup('10x15', margin=12)
        w = await warn(); check('laboratoire photo' in w and 'Augmentez la marge' not in w, f'10 × 15 cm, marge maximale : pas de conseil impossible à suivre ({w})')
        await setup('a4')

        # Mode Illustration : les textes de l'affiche illustrée sont aussi relevés
        await page.evaluate("CMS.illus.setMode('illus')"); await page.wait_for_timeout(300)
        await page.evaluate("__cms.st.margin=3; __cms.setLayout(__cms.st.layout)"); await page.wait_for_timeout(300)
        check(await warn() != '', f'mode Illustration : alerte calculée ({await warn()})')
        await page.evaluate("CMS.illus.setMode('map'); __cms.st.margin=6.5; __cms.setLayout(__cms.st.layout)"); await page.wait_for_timeout(300)

        # Affiche seule : repère masqué ; décocher le retire
        await page.click('#bClean'); await page.wait_for_timeout(250)
        check(not await guide(), 'affiche seule : repère masqué')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(250)
        check(await guide(), 'retour aux réglages : repère rétabli')
        await page.evaluate("__cms.showTab('export')"); await page.click('#safeTog'); await page.wait_for_timeout(300)
        check(not await guide() and await warn() == '' and await page.evaluate("localStorage.getItem('cms3.safeZone')") is None, 'décochée : repère et message retirés')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
