"""e2e : déplacement des textes des modes illustrés : titre (issue #48), lignes du bas (issue #53).

Vérifie : zones de prise au-dessus des deux blocs ; glisser le titre et le bloc du bas (position libre, aperçu =
export) ; aimantation sur les axes et sur les positions prédéfinies ; clavier (flèches, Maj, Origine) ; positions
du bloc du bas (Auto, 9 positions) ; alignement selon le tiers ; chevauchement signalé sans blocage ; médaillon :
glisser un texte posé sur la carte ne déplace ni la carte ni l'image ; vignette : déplacement horizontal dans la
bande ; prompt à la position réelle ; validation de l'état.
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
fails = []
MAKE = """async ()=>{ const c=document.createElement('canvas'); c.width=900; c.height=1300; const x=c.getContext('2d');
  x.fillStyle='#7FB2D6'; x.fillRect(0,0,900,1300); const b=await new Promise(r=>c.toBlob(r,'image/png'));
  await CMS.illus.importFile(new File([b],'a.png',{type:'image/png'})); await loadFonts(); }"""
# Lettres tracées (texte, x, y) en fraction de l'affiche, pour un rendu de largeur W (aperçu = export à toute taille)
GLYPHS = """async (W)=>{ const d=__cms.posterDims(), H=Math.round(W*d.H/d.W), seen=[], f=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(t,x,y){ const m=this.getTransform(); seen.push([String(t),(x+m.e)/W,(y+m.f)/H]); return f.apply(this,arguments); };
  try{ const r=await __cms.composePoster(W,H); r.canvas.width=0; } finally{ CanvasRenderingContext2D.prototype.fillText=f; } return seen; }"""


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


def first(glyphs, ch):
    return next((g for g in glyphs if g[0] == ch), None)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.add_init_script("try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.welcomed','1')}catch(e){}")
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(('file:', 'blob:', 'data:')) else r.abort())
        await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
        await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX); await wait_js(page, "!!__cms.osmData", 5000)
        await page.evaluate("CMS.illus.setMode('illus'); __cms.showTab('textes')")
        await page.evaluate(MAKE); await page.wait_for_timeout(400)

        # Zones de prise
        check(await page.is_visible('#hitTitle') and await page.is_visible('#hitFoot'), 'zones de prise du titre et des lignes du bas')
        hb = await page.locator('#hitTitle').bounding_box(); pb = await page.locator('#poster').bounding_box()
        check(hb['y'] < pb['y'] + pb['height'] * 0.3 and hb['height'] >= 44, f'zone du titre en haut, 44 px de haut au moins ({round(hb["height"])})')

        # Glisser le titre vers le bas à gauche (Modification, choix « Textes » ; #82) : position libre ; l'image ne bouge pas
        await page.evaluate("CMS.intent.open('text')"); await page.wait_for_timeout(200)
        ox = await page.evaluate("__cms.st.illus.ox")
        await page.mouse.move(hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2); await page.mouse.down()
        await page.mouse.move(hb['x'] + hb['width'] / 2 - pb['width'] * 0.2, hb['y'] + hb['height'] / 2 + pb['height'] * 0.4, steps=8); await page.mouse.up()
        await page.wait_for_timeout(300)
        fr = await page.evaluate("__cms.st.illusText.free")
        check(fr is not None and fr['y'] > 0.45 and fr['x'] < 0.4, f'titre glissé : position libre {fr}')
        check(await page.evaluate("__cms.st.illus.ox") == ox, 'glisser le titre ne déplace pas l\'image')
        check(not await page.evaluate("[...document.querySelectorAll('#tPosSeg button')].some(b=>b.getAttribute('aria-pressed')==='true')"), 'position libre : aucune position de la grille enfoncée')
        g1 = await page.evaluate(GLYPHS, 620); g2 = await page.evaluate(GLYPHS, 2480)
        a, c = first(g1, 'B'), first(g2, 'B')
        check(a and c and abs(a[1] - c[1]) < 0.003 and abs(a[2] - c[2]) < 0.003, f'titre déplacé : même place à toute taille (aperçu = export) {a} {c}')
        check(a[1] < 0.3 and a[2] > 0.5, f'titre déplacé : tracé en bas à gauche {a}')
        pr = await page.evaluate("CMS.illus.buildPrompt(__cms.st)")
        check('EN BAS' in pr or 'AU MILIEU' in pr, 'prompt : zone du titre à sa position réelle')
        exp = 'haut' if fr['y'] > 2 / 3 else 'bas'   # « Auto » : à l'opposé du titre (en haut seulement si le titre est en bas)
        check(f'{exp} de l’image assez simple' in pr, f'prompt : bloc du bas « Auto » à l\'opposé du titre déplacé ({exp})')

        # Aimantation : déposer près de la position « Haut centre » revient à la grille
        await page.evaluate("__cms.st.illusText.free={x:0.51,y:0.12}; scheduleOver()"); await page.wait_for_timeout(200)
        hb = await page.locator('#hitTitle').bounding_box()
        target = await page.evaluate("(()=>{ const cv=$('cvOver'), L=CMS.illus.textLayout(cv.getContext('2d'),cv.width,cv.height,Math.min(cv.width,cv.height),{free:null,pos:'hc'}).title.rect; return [(L.x+L.w/2)/cv.width,(L.y+L.h/2)/cv.height]; })()")
        await page.mouse.move(hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2); await page.mouse.down()
        await page.mouse.move(pb['x'] + target[0] * pb['width'] + 3, pb['y'] + target[1] * pb['height'] + 2, steps=6); await page.mouse.up(); await page.wait_for_timeout(300)
        t = await page.evaluate("[__cms.st.illusText.free, __cms.st.illusText.pos]")
        check(t[0] is None and t[1] == 'hc', f'aimantation : déposé près de « Haut centre », retour à la grille {t}')

        # Clavier : flèches (1 %), Maj (5 %), Origine
        await page.focus('#hitTitle'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
        f1 = await page.evaluate("__cms.st.illusText.free")
        await page.keyboard.press('Shift+ArrowDown'); f2 = await page.evaluate("__cms.st.illusText.free")
        check(f1 and f2 and abs(f2['y'] - f1['y'] - 0.05) < 1e-6 and f1['x'] > 0.5, f'clavier : flèches 1 %, Maj 5 % {f1} {f2}')
        await page.keyboard.press('Home')
        check(await page.evaluate("__cms.st.illusText.free") is None, 'clavier : Origine revient à la grille')

        # Bloc du bas : positions, alignement selon le tiers, Auto
        await page.click('#fPosSeg button[data-v=hg]'); await page.wait_for_timeout(200)
        g = await page.evaluate(GLYPHS, 1240)
        foot = [x for x in g if x[0].startswith('Là') or x[0].startswith('Alice')]
        check(await page.evaluate("__cms.st.illusText.fpos") == 'hg' and foot and all(abs(x[1] - foot[0][1]) < 0.002 for x in foot), f'bloc du bas en haut à gauche, lignes alignées à gauche {[(x[0][:6], round(x[1], 3)) for x in foot]}')
        check('⚠' in await page.text_content('#textWarn') and 'chevauchent le titre' in await page.text_content('#textWarn'), 'chevauchement avec le titre signalé (sans blocage)')
        await page.click('#fPosSeg button[data-v=bd]'); await page.wait_for_timeout(200)
        check(await page.text_content('#textWarn') == '', 'plus de chevauchement : message effacé')
        g = await page.evaluate(GLYPHS, 1240); ded = next(x for x in g if x[0].startswith('Là'))
        check(ded[1] > 0.5, f'bloc du bas à droite : aligné à droite ({ded[1]:.3f})')
        pr = await page.evaluate("CMS.illus.buildPrompt(__cms.st)")
        check('bas de l’image assez simple' in pr, 'prompt : bloc du bas à sa position (en bas)')
        fb = await page.locator('#hitFoot').bounding_box()
        await page.mouse.move(fb['x'] + fb['width'] / 2, fb['y'] + fb['height'] / 2); await page.mouse.down()
        await page.mouse.move(fb['x'] + fb['width'] / 2 - pb['width'] * 0.3, fb['y'] + fb['height'] / 2 - pb['height'] * 0.35, steps=8); await page.mouse.up(); await page.wait_for_timeout(300)
        ff = await page.evaluate("__cms.st.illusText.ffree")
        check(ff is not None and 0.3 < ff['y'] < 0.7, f'bloc du bas glissé : position libre {ff}')
        await page.click('#fAutoBtn'); await page.wait_for_timeout(200)
        check(await page.evaluate("[__cms.st.illusText.ffree, __cms.st.illusText.fpos]") == [None, 'auto'], '« Auto » rétablit le placement automatique')

        # Médaillon : le bloc du bas posé sur la carte ; le glisser ne déplace ni la carte ni l'image
        await page.evaluate("CMS.illus.setMode('mix'); __cms.st.mix.compo='med'; __cms.st.mix.pos='bas'; layoutPreview(); __cms.showTab('textes')"); await page.wait_for_timeout(500)
        await page.click('#fPosSeg button[data-v=mc]'); await page.evaluate("__cms.st.illusText.mix.ffree={x:0.5,y:0.75}; scheduleOver()"); await page.wait_for_timeout(300)
        check('débordent sur la carte' in await page.text_content('#textWarn'), 'médaillon : texte sur la carte signalé')
        c0 = await page.evaluate("JSON.stringify(__cms.st.center)"); ox = await page.evaluate("__cms.st.illus.ox")
        await page.evaluate("CMS.intent.open('text')"); await page.wait_for_timeout(200)
        fb = await page.locator('#hitFoot').bounding_box()
        await page.mouse.move(fb['x'] + fb['width'] / 2, fb['y'] + fb['height'] / 2); await page.mouse.down()
        await page.mouse.move(fb['x'] + fb['width'] / 2 + 30, fb['y'] + fb['height'] / 2 - 40, steps=6); await page.mouse.up(); await page.wait_for_timeout(300)
        check(await page.evaluate("JSON.stringify(__cms.st.center)") == c0 and await page.evaluate("__cms.st.illus.ox") == ox and await page.evaluate("__cms.st.illusText.mix.ffree.y") < 0.75,
              'médaillon : glisser le texte posé sur la carte ne déplace ni la carte ni l\'image')
        await page.click('#fAutoBtn')

        # Vignette : déplacement horizontal dans la bande
        await page.evaluate("__cms.st.mix.compo='vig'; layoutPreview()"); await page.wait_for_timeout(500)
        band = await page.evaluate("(()=>{ const g=__cms.geom(__cms.st,1000,1414); return [g.band.y/1414,(g.band.y+g.band.h)/1414]; })()")
        await page.evaluate("CMS.intent.open('text')"); await page.wait_for_timeout(200)
        hb = await page.locator('#hitTitle').bounding_box()
        await page.mouse.move(hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2); await page.mouse.down()
        await page.mouse.move(hb['x'] + hb['width'] / 2 - pb['width'] * 0.4, hb['y'] - pb['height'] * 0.4, steps=8); await page.mouse.up(); await page.wait_for_timeout(300)
        t = await page.evaluate("[__cms.st.illusText.mix.free, __cms.st.illusText.mix.pos]")
        g = await page.evaluate(GLYPHS, 1240); bl = first(g, 'B')
        check(bl and band[0] < bl[2] < band[1] and bl[1] < 0.3, f'vignette : titre déplacé à gauche, resté dans la bande {bl} {t}')
        check(t[0] is None and t[1][1] == 'g', f'vignette : aimanté à gauche de la bande {t}')
        await page.click('#tPosSeg button[data-v=hc]')
        # Positions propres à chaque type d'affiche (#77) : celles de l'Illustration n'ont pas bougé
        pi = await page.evaluate("[__cms.st.illusText.free, __cms.st.illusText.ffree, __cms.st.illusText.fpos]")
        check(pi == [None, None, 'auto'], f'positions de l\'Illustration indépendantes de la Carte + illustration {pi}')
        m = await page.evaluate("normState({illusText:{v:2,pos:'bd',fpos:'hg'}}).illusText.mix")
        check(m['pos'] == 'bd' and m['fpos'] == 'hg', f'état antérieur : la Carte + illustration reprend les positions partagées {m}')

        # État forgé
        n = await page.evaluate("normState({illusText:{free:{x:5,y:-1},fpos:'zz',ffree:{x:'a'}}}).illusText")
        check(n['free'] == {'x': 1, 'y': 0} and n['fpos'] == 'auto' and n['ffree'] is None, f'état forgé : positions bornées ou écartées {n}')
        await page.evaluate("CMS.illus.setMode('map')"); await page.wait_for_timeout(200)
        check(await page.is_hidden('#hitTitle') and await page.is_hidden('#hitFoot'), 'mode Carte : pas de zone de prise')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
