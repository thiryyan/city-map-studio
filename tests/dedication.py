"""e2e : dédicace sur deux lignes (retour à la ligne des textes longs).

Vérifie :
- mode automatique : une dédicace courte reste sur une ligne ; une dédicace longue passe sur deux lignes équilibrées
  et la carte cède la hauteur de la deuxième ligne (Souvenir : pied ; Cadre : cartouche) ;
- un seul mot très long n'est jamais coupé ;
- « Une ligne » rétablit la réduction seule (et la hauteur de la carte) ; « Deux lignes » coupe même un texte court ;
- l'avertissement de réduction propose « Passer la dédicace sur deux lignes », qui applique le réglage ;
- même décision dans l'aperçu et à l'export (mesures en unités de mise en page) ; export A4 inchangé (2480 × 3508) ;
- le réglage est conservé au rechargement, et l'aperçu est dessiné pour contrôle (tests/dedication-*.png).
"""
import pathlib, os, asyncio, struct
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()   # site testé : dist/ (construit par run_all.py), ou CMS_ROOT
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
LONG = 'Là où tout a commencé, un soir de juillet sur les quais de la Loire'
# Cartouche (Cadre) : dédicace plus petite, il faut un texte plus long pour dépasser le seuil de 20 % de réduction
LONGER = LONG + ', au coucher du soleil, main dans la main'
# Hauteur de la carte (fraction de la hauteur de l'affiche) à la taille de l'export et à celle d'une vignette d'aperçu
MAPH = "(()=>{ const a=__cms.geom(__cms.st,2480,3508).map.h/3508, b=__cms.geom(__cms.st,620,877).map.h/877; return [a,b]; })()"
LINES = "(()=>{ const g=__cms.geom(__cms.st,2480,3508); return __cms.st.layout==='souvenir' ? souvenirFoot(2480,g.U,g.m).L.lines : cartDed(CART_ROWS,g.text.maxW/g.U).L.lines; })()"

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
        async def route(r):
            if r.request.url.startswith('file:'): await r.continue_()
            else: await r.abort()
        await page.route('**/*', route)
        await seed(page, APP)
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        ev = page.evaluate
        await page.evaluate("document.fonts.ready")
        await page.click('#tabs [data-tab=textes]')
        ded = page.locator('input[data-k="texts.dedication"]')

        for lay in ['souvenir', 'classic']:
            await ev(f"__cms.setLayout('{lay}')"); await page.wait_for_timeout(200)
            await ded.fill('Là où tout a commencé'); await page.wait_for_timeout(250)
            short_h = await ev(MAPH); lines = await ev(LINES)
            check(len(lines) == 1, f'{lay} : dédicace courte sur une ligne {lines}')
            txt = LONG if lay == 'souvenir' else LONGER
            await ded.fill(txt); await page.wait_for_timeout(300)
            long_h = await ev(MAPH); lines = await ev(LINES)
            check(len(lines) == 2 and ' '.join(lines) == txt, f'{lay} : dédicace longue sur deux lignes {lines}')
            check(long_h[0] < short_h[0] - 0.01, f'{lay} : la carte cède la hauteur de la deuxième ligne ({short_h[0]:.3f} → {long_h[0]:.3f})')
            check(abs(long_h[0] - long_h[1]) < 0.003, f'{lay} : même mise en page à l\'export et dans l\'aperçu {long_h}')
            slot = await ev("__cms.ui.slotCss.h/__cms.ui.posterCss.h")
            check(abs(slot - long_h[0]) < 0.003, f'{lay} : le cadre de la carte de l\'aperçu suit ({slot:.3f})')
            await page.locator('#poster').screenshot(path=str(T / f'dedication-{lay}.png'))
            await page.click('#dedWrapSeg [data-v=one]'); await page.wait_for_timeout(300)
            one_h = await ev(MAPH); note = await page.inner_text('#fitNote')
            check(len(await ev(LINES)) == 1 and abs(one_h[0] - short_h[0]) < 1e-6, f'{lay} : « Une ligne » rétablit la carte ({one_h[0]:.3f})')
            check('dédicace' in note and 'Passer la dédicace sur deux lignes' in note, f'{lay} : l\'avertissement propose les deux lignes')
            await page.click('#fitNote button'); await page.wait_for_timeout(300)
            check(await ev("__cms.st.dedWrap") == 'two' and await ev("document.querySelector('#dedWrapSeg [data-v=two]').getAttribute('aria-pressed')") == 'true'
                  and len(await ev(LINES)) == 2, f'{lay} : le bouton de l\'avertissement passe la dédicace sur deux lignes')
            await ded.fill('Là où tout a commencé'); await page.wait_for_timeout(250)
            check(len(await ev(LINES)) == 2, f'{lay} : « Deux lignes » coupe aussi un texte court {await ev(LINES)}')
            await page.click('#dedWrapSeg [data-v=auto]'); await page.wait_for_timeout(200)

        # Un seul mot très long : jamais coupé
        await ded.fill('Anticonstitutionnellementissimementvraiment'); await page.wait_for_timeout(250)
        check(len(await ev(LINES)) == 1, 'un seul mot très long reste sur une ligne')
        await ev("__cms.setDedWrap('two')"); await page.wait_for_timeout(150)
        check(len(await ev(LINES)) == 1, '« Deux lignes » : un seul mot reste entier')
        await ev("__cms.setDedWrap('auto')")

        # Polaroid (dédicace en tête du cartouche) : coupée sans erreur
        await ev("__cms.setLayout('polaroid')"); await ded.fill(LONGER); await page.wait_for_timeout(300)
        await page.locator('#poster').screenshot(path=str(T / 'dedication-polaroid.png'))

        # Export (Souvenir, deux lignes), puis persistance
        await ev("__cms.setLayout('souvenir')"); await ded.fill(LONG); await page.wait_for_timeout(300)
        async with page.expect_download(timeout=120000) as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value; data = open(await d.path(), 'rb').read(); w, h = struct.unpack('>II', data[16:24])
        check((w, h) == (2480, 3508), f'export avec la dédicace sur deux lignes : {w} × {h}')
        await page.click('#resClose'); await page.evaluate("__cms.showTab('textes')")
        await page.click('#dedWrapSeg [data-v=one]'); await page.wait_for_timeout(1500)
        await page.reload(); await page.wait_for_timeout(1500)
        check(await ev("__cms.st.dedWrap") == 'one' and await ev("document.querySelector('#dedWrapSeg [data-v=one]').getAttribute('aria-pressed')") == 'true',
              'réglage conservé après rechargement')
        check(not errs, f'aucune erreur de page {errs[:3]}')
        await b.close()
    print('✗ échecs : ' + ', '.join(fails) if fails else 'OK')
    return 1 if fails else 0

raise SystemExit(asyncio.run(main()))
