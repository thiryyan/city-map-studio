"""e2e : « Que déplacer ? », sélecteur d'intention du mode Cadrer sur mobile (issue #82, point 2).

Un seul choix à la fois (Carte · Repère · Illustration · Textes, selon le type d'affiche) : ce qui est choisi reçoit les
gestes, le reste est inerte. Vérifie : choix proposés par type d'affiche (Illustration seule : image et textes) ; choix de
départ selon l'onglet ; « Repère » pose le repère puis revient à « Carte » sans quitter le mode ; « Carte » : un glissement
qui part d'un bloc de texte déplace la carte, le texte reste ; « Textes » : le texte bouge, la carte reste ; Carte + illustration :
« Illustration » fige la carte ; boutons radio ARIA (flèches) ; « Terminer » referme tout ; boutons flottants Calque et Repère
remplacés sur mobile, conservés sur ordinateur (pas de sélecteur).
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
INIT = "try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}"
MAKE = """async ([w,h])=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
  x.fillStyle='#C0392B'; x.fillRect(0,0,w,h); x.fillStyle='#2E86C1'; x.fillRect(0,h/2,w,h/2);
  const b=await new Promise(r=>c.toBlob(r,'image/png')); window.__f=new File([b],'test.png',{type:'image/png'}); }"""
fails = []


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        errs = []

        async def open_page(vp, mobile=True):
            ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile)
            page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
            await page.add_init_script(INIT)
            await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
            await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
            await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(600)
            return ctx, page

        ev = lambda page, js: page.evaluate(js)
        choices = lambda page: page.evaluate("[...document.querySelectorAll('#intentSeg button:not([hidden])')].map(b=>b.dataset.v)")
        current = lambda page: page.evaluate("[...document.querySelectorAll('#intentSeg button')].filter(b=>b.getAttribute('aria-checked')==='true').map(b=>b.dataset.v)")
        center = lambda page: page.evaluate("JSON.stringify(__cms.st.center)")

        async def drag(page, x, y, dx, dy):
            await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, steps=8); await page.mouse.up()
            await page.wait_for_timeout(300)

        # ---------- Carte, mobile ----------
        ctx, page = await open_page({'width': 390, 'height': 844})
        check(await page.is_hidden('#intentBar'), 'hors du mode Cadrer : pas de sélecteur')
        check(await page.is_hidden('#bLayer') and await page.is_hidden('#bPlace'), 'mobile : boutons flottants Calque et Repère remplacés par le sélecteur')
        await page.tap('#shield'); await page.wait_for_timeout(300)
        check(await choices(page) == ['map', 'mark'] and await current(page) == ['map'], f'Carte : « Carte » et « Repère » proposés, « Carte » choisi {await choices(page)}')
        check(await ev(page, "document.getElementById('app').dataset.intent") == 'map' and 'zoomer' in await page.text_content('#frameTxt'), 'indication : glisser, pincer')
        check(await ev(page, "[document.getElementById('intentBar').getBoundingClientRect().height>=44, document.getElementById('bFrameDone').getBoundingClientRect().height>=44]") == [True, True],
              'sélecteur et « Terminer » : cibles de 44 px')
        # Repère : un toucher pose le repère, puis retour à « Carte » sans quitter le mode Cadrer
        m0 = await ev(page, "JSON.stringify(__cms.st.marker)")
        await page.tap('#intentSeg [data-v=mark]'); await page.wait_for_timeout(250)
        check(await ev(page, "[__cms.ui.framing, __cms.ui.placing]") == [True, True] and await current(page) == ['mark'] and 'placer le repère' in await page.text_content('#frameTxt'),
              'choix « Repère » : placement actif, indication « Touchez la carte… »')
        s = await page.locator('#slot').bounding_box(); await page.mouse.click(s['x'] + s['width'] * 0.3, s['y'] + s['height'] * 0.3); await page.wait_for_timeout(350)
        check(await ev(page, "JSON.stringify(__cms.st.marker)") != m0 and await ev(page, "[__cms.ui.framing, __cms.ui.placing]") == [True, False] and await current(page) == ['map'],
              'repère posé : mode Cadrer conservé, retour à « Carte »')
        # Terminer
        await page.tap('#bFrameDone'); await page.wait_for_timeout(300)
        check(await ev(page, "[__cms.ui.framing, __cms.ui.placing, document.getElementById('app').dataset.intent||'', document.getElementById('intentBar').hidden]") == [False, False, '', True],
              '« Terminer » : mode refermé, sélecteur masqué, plus d\'intention active')
        # Choix de départ selon l'onglet : Repère
        await ev(page, "__cms.showTab('repere')"); await page.tap('#shield'); await page.wait_for_timeout(300)
        check(await current(page) == ['mark'] and await ev(page, "__cms.ui.placing"), 'onglet Repère : « Repère » choisi au départ')
        await page.tap('#bFrameDone'); await page.wait_for_timeout(300)
        check(not await ev(page, "__cms.ui.placing"), '« Terminer » arrête aussi le placement lancé par le sélecteur')
        # Clavier : flèches entre les choix (boutons radio ARIA)
        await ev(page, "__cms.showTab('lieu')"); await page.tap('#shield'); await page.wait_for_timeout(300)
        tab0 = await ev(page, "[...document.querySelectorAll('#intentSeg button')].filter(b=>b.tabIndex===0 && !b.hidden).map(b=>b.dataset.v)")
        await page.focus('#intentSeg [data-v=map]'); await page.keyboard.press('ArrowRight'); await page.wait_for_timeout(250)
        check(tab0 == ['map'] and await current(page) == ['mark'] and await ev(page, "document.activeElement.dataset.v") == 'mark', 'flèche droite : « Repère » choisi et focalisé (un seul bouton dans l\'ordre de tabulation)')
        await page.keyboard.press('ArrowLeft'); await page.wait_for_timeout(250)
        check(await current(page) == ['map'] and not await ev(page, "__cms.ui.placing"), 'flèche gauche : retour à « Carte », placement arrêté')

        # Blocs de texte déplacés dans l'affiche (zones de prise) : « Textes » apparaît
        await ev(page, "__cms.setLayout('classic',true); __cms.st.illusText.map.free={x:0.5,y:0.5}; scheduleOver()"); await page.wait_for_timeout(500)   # titre posé sur la carte
        await page.tap('#bFrameDone')
        await ev(page, "__cms.showTab('lieu')"); await page.tap('#shield'); await page.wait_for_timeout(400)
        ch = await choices(page)
        check('text' in ch, f'bloc de texte déplaçable : « Textes » proposé {ch}')
        hb = await page.locator('#hitTitle').bounding_box()
        cx, cy = hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2
        c0 = await center(page); f0 = await ev(page, "JSON.stringify(__cms.st.illusText.map.free)")
        check(await ev(page, "getComputedStyle(document.getElementById('hitTitle')).pointerEvents") == 'none', 'choix « Carte » : zone de prise du texte inerte')
        await drag(page, cx, cy, 50, 30)
        check(await center(page) != c0 and await ev(page, "JSON.stringify(__cms.st.illusText.map.free)") == f0, 'choix « Carte » : un glissement parti du texte déplace la carte, le texte reste')
        await page.tap('#intentSeg [data-v=text]'); await page.wait_for_timeout(250)
        check(await current(page) == ['text'] and 'texte' in await page.text_content('#frameTxt') and await ev(page, "getComputedStyle(document.getElementById('hitTitle')).pointerEvents") == 'auto',
              'choix « Textes » : zone de prise active, indication « Glissez un texte »')
        c1 = await center(page); hb = await page.locator('#hitTitle').bounding_box()
        await drag(page, hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2, 40, 40)
        check(await center(page) == c1 and await ev(page, "JSON.stringify(__cms.st.illusText.map.free)") != f0, 'choix « Textes » : le texte bouge, la carte reste')
        s = await page.locator('#slot').bounding_box(); c2 = await center(page)
        await drag(page, s['x'] + 20, s['y'] + s['height'] - 30, 40, -30)
        check(await center(page) == c2, 'choix « Textes » : la carte est inerte')
        # Le bloc replacé dans le gabarit : le choix disparaît et on revient à « Carte »
        await ev(page, "(()=>{ const T=__cms.st.illusText.map; T.free=null; T.pos='auto'; T.fpos='auto'; T.ffree=null; scheduleOver(); })()"); await page.wait_for_timeout(500)
        check(await choices(page) == ['map', 'mark'] and await current(page) == ['map'], f'texte replacé dans le gabarit : « Textes » disparaît, retour à « Carte » {await choices(page)}')
        await page.tap('#bFrameDone'); await page.wait_for_timeout(200)
        await ctx.close()

        # ---------- Illustration seule, mobile : « Illustration » et « Textes » ----------
        ctx, page = await open_page({'width': 390, 'height': 844})
        await page.evaluate(MAKE, [600, 800]); await page.evaluate("CMS.illus.importFile(window.__f)"); await wait_js(page, "CMS.illus.ready()", 5000)
        await ev(page, "CMS.illus.setMode('illus')"); await page.wait_for_timeout(400)
        await page.tap('#shield'); await page.wait_for_timeout(300)
        check(await choices(page) == ['illus', 'text'] and await current(page) == ['illus'] and 'illustration' in await page.text_content('#frameTxt'),
              f'Illustration : « Illustration » et « Textes » proposés, image choisie {await choices(page)}')
        ox = await ev(page, "__cms.st.illus.ox"); p0 = await page.locator('#poster').bounding_box()
        await drag(page, p0['x'] + p0['width'] / 2, p0['y'] + p0['height'] / 2, 60, 0)
        check(await ev(page, "__cms.st.illus.ox") != ox, 'choix « Illustration » : le glissement déplace l\'image')
        await page.tap('#intentSeg [data-v=text]'); await page.wait_for_timeout(250)
        ox = await ev(page, "__cms.st.illus.ox")
        await drag(page, p0['x'] + p0['width'] / 2, p0['y'] + p0['height'] / 2, 60, 0)
        check(await ev(page, "__cms.st.illus.ox") == ox, 'choix « Textes » : l\'image reste en place')
        await page.tap('#bFrameDone'); await page.wait_for_timeout(200)

        # ---------- Carte + illustration : « Illustration » fige la carte ----------
        await ev(page, "CMS.illus.setMode('mix'); __cms.showTab('lieu')"); await page.wait_for_timeout(400)
        await page.tap('#shield'); await page.wait_for_timeout(300)
        check({'map', 'mark', 'illus'} <= set(await choices(page)) and await current(page) == ['map'],
              f'Carte + illustration : carte, repère et illustration proposés {await choices(page)}')
        await page.tap('#intentSeg [data-v=illus]'); await page.wait_for_timeout(300)
        check(await ev(page, "CMS.illus.layer()") == 'illus' and await ev(page, "getComputedStyle(document.getElementById('slot')).pointerEvents") == 'none', 'choix « Illustration » : calque image, carte figée')
        c0 = await center(page); ox = await ev(page, "__cms.st.illus.ox"); p0 = await page.locator('#poster').bounding_box()
        await drag(page, p0['x'] + p0['width'] / 2, p0['y'] + p0['height'] * 0.3, 50, 0)
        check(await center(page) == c0 and await ev(page, "__cms.st.illus.ox") != ox, 'choix « Illustration » : l\'image bouge, la carte reste')
        await page.tap('#intentSeg [data-v=map]'); await page.wait_for_timeout(300)
        check(await ev(page, "CMS.illus.layer()") == 'map' and await current(page) == ['map'], 'choix « Carte » : calque carte')
        await page.tap('#bFrameDone'); await page.wait_for_timeout(200)
        await ev(page, "__cms.showTab('illus')"); await page.tap('#shield'); await page.wait_for_timeout(300)
        check(await current(page) == ['illus'], 'onglet Illustration : « Illustration » choisi au départ')
        await page.tap('#bFrameDone')
        await ctx.close()

        # ---------- Ordinateur : pas de sélecteur, boutons flottants conservés ----------
        ctx, page = await open_page({'width': 1280, 'height': 900}, mobile=False)
        check(await page.is_hidden('#intentBar') and await page.is_visible('#bPlace') and await ev(page, "document.getElementById('app').dataset.intent===undefined"),
              'ordinateur : pas de sélecteur, bouton Repère conservé')
        await ctx.close()
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
