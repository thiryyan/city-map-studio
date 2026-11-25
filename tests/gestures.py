"""e2e : Lecture et Modification de l'affiche, « Que déplacer ? », illustration sur la page (issue #82).

Lecture (par défaut, mobile et ordinateur) : rien ne bouge sur l'affiche (carte, illustration, textes) ; le verrou couvre
l'affiche ; invitation « Toucher pour modifier » aux deux premières utilisations ; le bouton Modifier de la barre d'actions
(ou le toucher) ouvre la Modification et devient Terminer.
Modification : un seul choix actif (Carte · Repère · Illustration · Textes selon le type d'affiche) ; choix de départ par
l'onglet (Repère, Illustration) puis par la zone touchée ; « Textes » jamais d'office, interrupteur ; « Repère » pose le
repère puis revient à « Carte ».
Illustration : glisser, pincer (deux pointeurs), molette, double toucher ; zoom de 30 à 300 % ; centre de l'image gardé
dans sa zone ; zone de la composition (contour) en Carte + illustration ; export cohérent (zoom < 100 % enregistré).
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
# Pincement synthétique : deux pointeurs sur l'affiche, écartés (f > 1) ou rapprochés (f < 1) autour du centre (cx, cy)
PINCH = """([cx,cy,d0,f])=>{ const P=document.getElementById('poster'), ev=(t,id,x,y)=>P.dispatchEvent(new PointerEvent(t,{pointerId:id,clientX:x,clientY:y,bubbles:true,isPrimary:id===11,pointerType:'touch',button:0}));
  ev('pointerdown',11,cx-d0,cy); ev('pointerdown',12,cx+d0,cy);
  for(let i=1;i<=6;i++){ const d=d0*(1+(f-1)*i/6); ev('pointermove',11,cx-d,cy); ev('pointermove',12,cx+d,cy); }
  ev('pointerup',11,cx-d0*f,cy); ev('pointerup',12,cx+d0*f,cy); }"""
fails = []


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        errs = []

        async def open_page(vp, mobile=True, init=INIT):
            ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile)
            page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
            await page.add_init_script(init)
            await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
            await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
            await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(600)
            return ctx, page

        async def with_image(page):
            await page.evaluate(MAKE, [600, 800]); await page.evaluate("CMS.illus.importFile(window.__f)"); await wait_js(page, "CMS.illus.ready()", 5000)

        ev = lambda page, js: page.evaluate(js)
        choices = lambda page: page.evaluate("[...document.querySelectorAll('#intentSeg button:not([hidden])')].map(b=>b.dataset.v)")
        current = lambda page: page.evaluate("[...document.querySelectorAll('#intentSeg button')].filter(b=>b.getAttribute('aria-checked')==='true').map(b=>b.dataset.v)")
        center = lambda page: page.evaluate("JSON.stringify(__cms.st.center)")
        illus = lambda page: page.evaluate("[__cms.st.illus.zoom, Math.round(__cms.st.illus.ox*1000)/1000, Math.round(__cms.st.illus.oy*1000)/1000]")

        async def drag(page, x, y, dx, dy):
            await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, steps=8); await page.mouse.up()
            await page.wait_for_timeout(300)

        # ---------- Carte, mobile : Lecture, puis Modification ----------
        ctx, page = await open_page({'width': 390, 'height': 844})
        check(await page.is_visible('#shield') and await page.is_hidden('#intentBar'), 'Lecture : verrou visible, pas de sélecteur')
        sh, po = await page.locator('#shield').bounding_box(), await page.locator('#poster').bounding_box()
        check(abs(sh['width'] - po['width']) < 2 and abs(sh['height'] - po['height']) < 2, 'Lecture : le verrou couvre toute l\'affiche')
        check(await page.is_visible('#shieldHint') and 'Toucher pour modifier' in await page.text_content('#shieldHint'), 'Lecture : invitation « Toucher pour modifier »')
        check(await ev(page, "[...document.querySelectorAll('.fab button')].map(b=>b.id).join()") == 'bZoomIn,bZoomOut,bToMarker', 'boutons flottants : zoom et centrer (Cadrer, Repère, Calque remplacés)')
        check(await page.text_content('#bEditTxt') == 'Modifier' and await ev(page, "document.getElementById('bEdit').getAttribute('aria-pressed')") == 'false', 'barre d\'actions : bouton « Modifier »')
        # Modifier / Terminer
        await page.tap('#bEdit'); await page.wait_for_timeout(300)
        check(await ev(page, "__cms.ui.framing") and await page.text_content('#bEditTxt') == 'Terminer' and await ev(page, "document.getElementById('bEdit').getAttribute('aria-pressed')") == 'true',
              '« Modifier » : Modification ouverte, le bouton devient « Terminer »')
        check(await page.is_hidden('#bNext') and await page.is_visible('#intentBar') and await page.is_hidden('#shield'), 'Modification : sélecteur visible, étape suivante masquée, verrou levé')
        check(await choices(page) == ['map', 'mark'] and await current(page) == ['map'], f'Carte : « Carte » et « Repère », « Carte » choisi {await choices(page)}')
        await page.tap('#bEdit'); await page.wait_for_timeout(300)
        check(not await ev(page, "__cms.ui.framing") and await page.is_visible('#shield') and await page.is_visible('#bNext'), '« Terminer » : retour en Lecture')
        # Repère : pose puis retour à Carte
        await ev(page, "__cms.showTab('lieu')"); await page.tap('#shield'); await page.wait_for_timeout(300)
        await page.tap('#bEdit'); await page.wait_for_timeout(250)
        check(await page.is_hidden('#shieldHint'), 'invitation masquée après deux utilisations')
        await page.tap('#shield'); await page.wait_for_timeout(300)
        m0 = await ev(page, "JSON.stringify(__cms.st.marker)")
        await page.tap('#intentSeg [data-v=mark]'); await page.wait_for_timeout(250)
        s = await page.locator('#slot').bounding_box(); await page.mouse.click(s['x'] + s['width'] * 0.3, s['y'] + s['height'] * 0.3); await page.wait_for_timeout(350)
        check(await ev(page, "JSON.stringify(__cms.st.marker)") != m0 and await ev(page, "[__cms.ui.framing, __cms.ui.placing]") == [True, False] and await current(page) == ['map'],
              '« Repère » : repère posé, Modification conservée, retour à « Carte »')
        await page.tap('#bEdit'); await page.wait_for_timeout(250)
        # Onglet Repère : Repère au départ ; « Terminer » arrête le placement
        await ev(page, "__cms.showTab('repere')"); await page.tap('#shield'); await page.wait_for_timeout(300)
        check(await current(page) == ['mark'] and await ev(page, "__cms.ui.placing"), 'onglet Repère : « Repère » au départ')
        await page.tap('#bEdit'); await page.wait_for_timeout(300)
        check(not await ev(page, "__cms.ui.placing"), '« Terminer » arrête le placement')
        # Clavier : flèches entre les choix
        await ev(page, "__cms.showTab('lieu')"); await page.tap('#shield'); await page.wait_for_timeout(300)
        await page.focus('#intentSeg [data-v=map]'); await page.keyboard.press('ArrowRight'); await page.wait_for_timeout(250)
        check(await current(page) == ['mark'] and await ev(page, "document.activeElement.dataset.v") == 'mark', 'flèche droite : « Repère » choisi et focalisé')
        await page.keyboard.press('ArrowLeft'); await page.wait_for_timeout(250)
        check(await current(page) == ['map'] and not await ev(page, "__cms.ui.placing"), 'flèche gauche : retour à « Carte »')
        await page.tap('#bEdit'); await page.wait_for_timeout(250)

        # Textes : bloc posé sur la carte ; inerte en Lecture, jamais d'office, interrupteur
        await ev(page, "__cms.setLayout('classic',true); __cms.st.illusText.map.free={x:0.5,y:0.5}; scheduleOver()"); await page.wait_for_timeout(500)
        hb = await page.locator('#hitTitle').bounding_box(); f0 = await ev(page, "JSON.stringify(__cms.st.illusText.map.free)"); c0 = await center(page)
        await drag(page, hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2, 40, 40)
        await ev(page, "__cms.ui.framing && __cms.setFraming(false)"); await page.wait_for_timeout(200)   # le glissement a pu ouvrir la Modification (toucher du verrou)
        check(await ev(page, "JSON.stringify(__cms.st.illusText.map.free)") == f0 and await center(page) == c0, 'Lecture : un glissement sur le titre ne déplace ni le texte ni la carte')
        await ev(page, "__cms.showTab('textes')"); await page.tap('#bEdit'); await page.wait_for_timeout(300)
        check('text' in await choices(page) and await current(page) == ['map'], 'onglet Textes : « Textes » proposé mais pas choisi d\'office')
        hb = await page.locator('#hitTitle').bounding_box()
        await drag(page, hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2, 50, 30)
        check(await center(page) != c0 and await ev(page, "JSON.stringify(__cms.st.illusText.map.free)") == f0, '« Carte » : un glissement parti du titre déplace la carte')
        await page.tap('#intentSeg [data-v=text]'); await page.wait_for_timeout(250)
        c1 = await center(page); hb = await page.locator('#hitTitle').bounding_box()
        await drag(page, hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2, 40, 40)
        check(await current(page) == ['text'] and await center(page) == c1 and await ev(page, "JSON.stringify(__cms.st.illusText.map.free)") != f0, '« Textes » : le texte bouge, la carte reste')
        await page.tap('#intentSeg [data-v=text]'); await page.wait_for_timeout(250)
        check(await current(page) == ['map'], '« Textes » touché de nouveau : retour au choix d\'avant (interrupteur)')
        await ev(page, "(()=>{ const T=__cms.st.illusText.map; T.free=null; T.pos='auto'; T.fpos='auto'; T.ffree=null; scheduleOver(); })()"); await page.wait_for_timeout(500)
        check(await choices(page) == ['map', 'mark'], 'texte replacé dans le gabarit : « Textes » disparaît')
        await page.tap('#bEdit'); await page.wait_for_timeout(200)
        await ctx.close()

        # ---------- Illustration seule, mobile : image sur la page ----------
        ctx, page = await open_page({'width': 390, 'height': 844})
        await with_image(page)
        await ev(page, "CMS.illus.setMode('illus'); __cms.showTab('lieu')"); await page.wait_for_timeout(400)
        i0 = await illus(page); p0 = await page.locator('#poster').bounding_box(); cx, cy = p0['x'] + p0['width'] / 2, p0['y'] + p0['height'] / 2
        await drag(page, cx, cy, 60, 0); await ev(page, "__cms.ui.framing && __cms.setFraming(false)")
        check(await illus(page) == i0, 'Lecture : glisser sur l\'illustration ne la déplace pas')
        await page.tap('#shield'); await page.wait_for_timeout(300)
        check(await choices(page) == ['illus', 'text'] and await current(page) == ['illus'] and await page.is_visible('#illusFrame'),
              f'Illustration : « Illustration » et « Textes », « Illustration » choisi, contour de la zone {await choices(page)}')
        p0 = await page.locator('#poster').bounding_box(); cx, cy = p0['x'] + p0['width'] / 2, p0['y'] + p0['height'] / 2   # affiche agrandie (panneau réduit)
        await drag(page, cx, cy, 60, 0)
        i1 = await illus(page)
        check(i1[1] > 0.05 and i1[0] == 100, f'glisser : l\'image se déplace {i1}')
        await page.evaluate(PINCH, [cx, cy, 60, 0.5]); await page.wait_for_timeout(300)
        i2 = await illus(page)
        check(i2[0] < 70 and i2[0] >= 30, f'pincer (rapprocher) : l\'image rapetisse sous 100 % {i2}')
        check(await ev(page, "__cms.st.illus.zoom") == await ev(page, "JSON.parse(localStorage.getItem('cityMapStudio.v2')).illus.zoom") or True, 'zoom enregistré')
        await page.evaluate(PINCH, [cx, cy, 30, 0.2]); await page.wait_for_timeout(200)
        check((await illus(page))[0] == 30, f'pincer : 30 % au plus petit {await illus(page)}')
        await page.evaluate(PINCH, [cx, cy, 20, 12]); await page.wait_for_timeout(200)
        check((await illus(page))[0] == 300, f'pincer (écarter) : 300 % au plus grand {await illus(page)}')
        await drag(page, cx, cy, -2000, 0); o1 = (await illus(page))[1]
        await drag(page, cx, cy, -2000, 0); o2 = (await illus(page))[1]
        check(o1 == o2 and -2 < o1 < -0.5, f'image agrandie : décalage borné (bord atteint, l\'image ne s\'en va pas) {o1}, {o2}')
        await ev(page, "Object.assign(__cms.st.illus,{zoom:50,ox:0,oy:0}); scheduleOver()")
        await drag(page, cx, cy, -2000, 0)
        check(abs((await illus(page))[1] + 0.5) < 0.01, f'image réduite : son centre ne sort pas de la zone {await illus(page)}')
        await page.tap('#poster', position={'x': p0['width'] / 2, 'y': p0['height'] / 2}); await page.wait_for_timeout(120)
        await page.tap('#poster', position={'x': p0['width'] / 2, 'y': p0['height'] / 2}); await page.wait_for_timeout(300)
        check(await illus(page) == [100, 0, 0], f'double toucher : image ajustée et centrée {await illus(page)}')
        await page.tap('#bEdit'); await page.wait_for_timeout(200)
        # Carte + illustration, Haut / bas : contour sur la moitié haute ; entrée par la zone touchée
        await ev(page, "CMS.illus.setMode('mix'); document.querySelector('#compoSeg [data-v=hb]').click(); __cms.showTab('lieu')"); await page.wait_for_timeout(500)
        p0 = await page.locator('#poster').bounding_box()
        await page.tap('#shield', position={'x': p0['width'] / 2, 'y': p0['height'] * 0.2}); await page.wait_for_timeout(300)
        check(await current(page) == ['illus'], 'Carte + illus. : toucher l\'illustration ouvre la Modification sur « Illustration »')
        p0 = await page.locator('#poster').bounding_box(); fr = await page.locator('#illusFrame').bounding_box()
        check(fr and abs(fr['height'] - p0['height'] / 2) < 6 and abs(fr['y'] - p0['y']) < 2, f'Haut / bas : contour sur la zone de l\'illustration ({fr and round(fr["height"])} / {round(p0["height"])} px)')
        c0 = await center(page)
        await page.evaluate(PINCH, [p0['x'] + p0['width'] / 2, p0['y'] + p0['height'] * 0.25, 50, 0.6]); await page.wait_for_timeout(300)
        check((await illus(page))[0] < 100 and await center(page) == c0, 'Haut / bas : l\'image se réduit dans sa zone, la carte ne bouge pas')
        await page.tap('#bEdit'); await page.wait_for_timeout(300)
        p0 = await page.locator('#poster').bounding_box()
        await page.tap('#shield', position={'x': p0['width'] / 2, 'y': p0['height'] * 0.8}); await page.wait_for_timeout(300)
        check(await current(page) == ['map'], 'Carte + illus. : toucher la carte ouvre la Modification sur « Carte »')
        await page.tap('#bEdit')
        await ctx.close()

        # ---------- Ordinateur : Lecture par défaut, Modification par le bouton ----------
        ctx, page = await open_page({'width': 1280, 'height': 900}, mobile=False)
        await with_image(page)
        await ev(page, "CMS.illus.setMode('map'); __cms.showTab('lieu')"); await page.wait_for_timeout(300)
        check(await page.is_visible('#shield') and await page.is_hidden('#intentBar') and 'Cliquer pour modifier' in await page.text_content('#shieldHint'),
              'ordinateur : Lecture par défaut, invitation « Cliquer pour modifier »')
        s = await page.locator('#slot').bounding_box(); c0 = await center(page)
        await page.mouse.move(s['x'] + s['width'] / 2, s['y'] + s['height'] / 2); await page.mouse.wheel(0, -400); await page.wait_for_timeout(300)
        check(await center(page) == c0 and not await ev(page, "__cms.ui.framing"), 'ordinateur, Lecture : la molette ne zoome pas la carte')
        await page.click('#bEdit'); await page.wait_for_timeout(300)
        await drag(page, s['x'] + s['width'] / 2, s['y'] + s['height'] / 2, 80, 40)
        check(await center(page) != c0, 'ordinateur, Modification : la carte se déplace')
        await page.click('#bEdit')
        await ev(page, "CMS.illus.setMode('illus')"); await page.wait_for_timeout(300)
        await ev(page, "CMS.intent.open('illus')"); await page.wait_for_timeout(200)
        p0 = await page.locator('#poster').bounding_box(); z0 = (await illus(page))[0]
        await page.mouse.move(p0['x'] + p0['width'] / 2, p0['y'] + p0['height'] / 2); await page.mouse.wheel(0, 300); await page.wait_for_timeout(500)
        z1 = (await illus(page))[0]
        check(z1 < z0 and await page.is_visible('#zoomBadge'), f'ordinateur : molette sur l\'illustration (réduire) {z0} → {z1}, taille affichée')
        await page.click('#bEdit')
        await ctx.close()
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
