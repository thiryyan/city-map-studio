"""e2e : mode Carte + illustration, compositions Médaillon et Vignette (issue #44).

Vérifie : onglets (Lieu, Repère, Illustration, Textes, Style) et réglages visibles ; étape Composition ; prompt selon la
composition (zone du médaillon, vignette en 3:4) ; géométrie (formes et positions du médaillon, découpe de la carte à
l'aperçu) ; rendu (illustration hors du médaillon, carte dedans ; vignette sur la carte ; titre dans la bande ;
attribution OSM) ; qualité calculée sur la zone de l'illustration ; couleurs de la carte d'après l'illustration
(annulable) ; glisser : l'image hors de la carte, la carte dans le médaillon, la vignette par sa zone de prise ;
export A4 ; export bloqué sans image ; validation de l'état.
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
fails = []
MAKE = """async ([w,h])=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
  x.fillStyle='#C0392B'; x.fillRect(0,0,w,h); x.fillStyle='#2E86C1'; x.fillRect(0,h/2,w,h/2);
  const b=await new Promise(r=>c.toBlob(r,'image/png')); window.__f=new File([b],'test.png',{type:'image/png'}); }"""
# Rendu complet 620 × 877 : couleur d'un point (x, y en fraction de l'affiche) et textes tracés
RENDER = """async (pts)=>{ const seen=[], f=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(t,...a){ seen.push([String(t),this.font]); return f.call(this,t,...a); };
  let px=[]; try{ const r=await __cms.composePoster(620,877), c=r.canvas.getContext('2d');
    px=pts.map(([x,y])=>[...c.getImageData(Math.round(x*620),Math.round(y*877),1,1).data].slice(0,3)); r.canvas.width=0; }
  finally{ CanvasRenderingContext2D.prototype.fillText=f; } return {px, seen}; }"""
red = lambda p: p[0] > 150 and p[1] < 90 and p[2] < 90
blue = lambda p: p[2] > 150 and p[0] < 90


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")
        async def route(r):
            if r.request.url.startswith(('file:', 'blob:', 'data:')): return await r.continue_()
            await r.abort()
        await page.route('**/*', route)
        await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
        await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX)
        await wait_js(page, "!!__cms.osmData", 5000)

        # Mode et onglets
        await page.click('#modeSeg button[data-v=mix]'); await page.wait_for_timeout(400)
        tabs = await page.evaluate("[...document.querySelectorAll('#tabs button:not([hidden])')].map(b=>b.dataset.tab)")
        check(tabs == ['lieu', 'repere', 'illus', 'textes', 'style'], f'onglets du mode Carte + illustration {tabs}')
        await page.evaluate("__cms.showTab('illus')")
        check(await page.is_visible('#illusCompo') and await page.evaluate("CMS.illus.step") == 'compo', 'étape Composition ouverte en premier (sans image)')
        await page.evaluate("__cms.showTab('style')")
        check(await page.is_hidden('#layouts') and await page.is_hidden('#ambiances') and await page.is_visible('#themes'), 'Style : gabarits et ambiances masqués, thèmes visibles')
        check(await page.is_visible('#slot') and await page.is_visible('#mapCredit'), 'carte et sources visibles')
        await page.evaluate("__cms.showTab('illus')")

        # Géométrie et découpe de la carte
        g = await page.evaluate("(()=>{ const g=__cms.geom(__cms.st,1000,1414); return [g.mix,g.map.shape,Math.round(g.map.w),Math.round(g.map.y+g.map.h),g.illus.w]; })()")
        check(g == ['med', 'circle', 450, 1414 - 170, 1000], f'médaillon rond en bas : 45 % de la largeur {g}')
        check(await page.evaluate("document.getElementById('slot').classList.contains('circle')"), 'aperçu : carte découpée en rond')
        await page.click('#mixShapeSeg button[data-v=heart]'); await page.click('#mixPosSeg button[data-v=haut]'); await page.wait_for_timeout(300)
        check('path(' in await page.evaluate("document.getElementById('slot').style.clipPath"), 'aperçu : carte découpée en cœur')
        check(await page.evaluate("Math.round(__cms.geom(__cms.st,1000,1414).map.y)") == round(1414 * 0.24), 'médaillon en haut')
        pr = await page.evaluate("CMS.illus.buildPrompt(__cms.st)")
        check('un cœur d’environ 45 %' in pr and 'en haut de l’image' in pr and 'une carte y sera posée' in pr, 'prompt : zone calme du médaillon (forme, position)')
        check('en haut de l’image' in await page.text_content('#compoPrompt'), 'étape Composition : phrase transmise au prompt')
        await page.click('#mixShapeSeg button[data-v=circle]'); await page.click('#mixPosSeg button[data-v=bas]')

        # Image, rendu du médaillon
        await page.evaluate(MAKE, [1200, 1700])
        check(await page.evaluate("$('bExport').disabled"), 'export désactivé sans illustration')
        await page.evaluate("CMS.illus.importFile(window.__f)"); await wait_js(page, "CMS.illus.ready()", 5000)
        check(await page.evaluate("CMS.illus.step") == 'image' and not await page.evaluate("$('bExport').disabled"), 'image importée : export actif')
        r = await page.evaluate(RENDER, [[0.1, 0.1], [0.5, 0.75], [0.9, 0.9]])
        check(red(r['px'][0]) and blue(r['px'][2]), f'médaillon : illustration en pleine page {r["px"]}')
        check(not red(r['px'][1]) and not blue(r['px'][1]), f'médaillon : carte dans le cercle {r["px"][1]}')
        check(any('OpenStreetMap' in s[0] for s in r['seen']), 'attribution OpenStreetMap sur l\'affiche')
        check(''.join(s[0] for s in r['seen'] if 'Bebas' in s[1]).startswith('BLOIS'), 'titre Vintage tracé')

        # Glisser : hors de la carte → image ; dans la carte → carte
        box = await page.locator('#poster').bounding_box()
        async def drag(x, y, dx):
            await page.mouse.move(box['x'] + x * box['width'], box['y'] + y * box['height']); await page.mouse.down()
            await page.mouse.move(box['x'] + x * box['width'] + dx, box['y'] + y * box['height'], steps=4); await page.mouse.up(); await page.wait_for_timeout(200)
        c0 = await page.evaluate("JSON.stringify(__cms.st.center)")
        await drag(0.15, 0.4, 40)
        check(await page.evaluate("__cms.st.illus.ox") > 0.05 and await page.evaluate("JSON.stringify(__cms.st.center)") == c0, 'glisser hors du médaillon : l\'image bouge, pas la carte')
        ox = await page.evaluate("__cms.st.illus.ox")
        await drag(0.5, 0.75, 40)
        check(await page.evaluate("__cms.st.illus.ox") == ox and await page.evaluate("JSON.stringify(__cms.st.center)") != c0, 'glisser dans le médaillon : la carte bouge, pas l\'image')
        await page.click('#bIllusCenter')

        # Vignette
        await page.click('#illusStepSeg button[data-v=compo]'); await page.click('#compoSeg button[data-v=vig]'); await page.wait_for_timeout(400)
        check(await page.is_hidden('#medOpts'), 'vignette : options du médaillon masquées')
        pr = await page.evaluate("CMS.illus.buildPrompt(__cms.st)")
        check('petite vignette en forme d’arche' in pr and 'proportions 3:4' in pr and 'pour le titre' not in pr, 'prompt : vignette, 3:4, sans zone de titre')
        g = await page.evaluate("(()=>{ const g=__cms.geom(__cms.st,1000,1414); return {v:g.illus, m:g.map, b:g.band}; })()")
        v, m = g['v'], g['m']
        check(v['shape'] == 'arch' and v['x'] > m['x'] + m['w'] / 2 and v['y'] < m['y'] + 0.1 * m['h'] and abs(v['h'] / v['w'] - 1.34) < 0.01, 'vignette en arche (3:4) en haut à droite de la carte')
        check(g['b']['h'] > 0.2 * 1000, 'bande de texte sous la carte')
        r = await page.evaluate(RENDER, [[(v['x'] + v['w'] / 2) / 1000, (v['y'] + v['h'] * 0.3) / 1414], [0.2, 0.5], [0.5, 0.97]])
        check(red(r['px'][0]), f'vignette : illustration dans l\'arche {r["px"][0]}')
        check(not red(r['px'][1]) and not blue(r['px'][1]), f'vignette : carte autour {r["px"][1]}')
        check(any('OpenStreetMap' in s[0] for s in r['seen']), 'vignette : attribution OpenStreetMap')
        qv = await page.evaluate("CMS.illus.quality(__cms.st,1200,1700)[0].dpi")
        qm = await page.evaluate("CMS.illus.quality({...__cms.st,mix:{...__cms.st.mix,compo:'med'}},1200,1700)[0].dpi")
        check(qv > qm * 2.5, f'qualité calculée sur la zone de la vignette ({qm} → {qv} ppp)')
        check(await page.is_visible('#illusHit'), 'vignette : zone de prise au-dessus de la carte')
        hb = await page.locator('#illusHit').bounding_box()
        c0 = await page.evaluate("JSON.stringify(__cms.st.center)")
        await page.mouse.move(hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2); await page.mouse.down()
        await page.mouse.move(hb['x'] + hb['width'] / 2 + 20, hb['y'] + hb['height'] / 2, steps=4); await page.mouse.up(); await page.wait_for_timeout(200)
        check(await page.evaluate("__cms.st.illus.ox") > 0.05 and await page.evaluate("JSON.stringify(__cms.st.center)") == c0, 'glisser la vignette : l\'image bouge, pas la carte')

        # Couleurs de la carte d'après l'illustration, annulables
        await page.wait_for_timeout(1600)
        before = await page.evaluate("JSON.stringify(__cms.st.colors)")
        await page.click('#harmSeg button[data-v=light]'); await page.wait_for_timeout(500)
        after = await page.evaluate("__cms.st.colors")
        check(await page.evaluate("JSON.stringify(__cms.st.colors)") != before and after['paper'] != '#C0392B', 'couleurs de la carte tirées de l\'illustration')
        await page.wait_for_timeout(500)
        await page.evaluate("__cms.undo()"); await page.wait_for_timeout(400)
        check(await page.evaluate("JSON.stringify(__cms.st.colors)") == before, '« Annuler » rétablit les couleurs')

        # Export A4
        await page.evaluate("__cms.exportPoster()")
        await wait_js(page, "$('result').open", 30000)
        check('2480 × 3508 px' in await page.text_content('#resInfo'), 'export A4 : 2480 × 3508 px')
        await page.click('#resClose')

        # Mes affiches : le type est affiché ; état forgé ; retour au mode Carte
        check('Carte + illustration' in await page.evaluate("(__cms.saveCurrent('Mix'), openSaves(), $('savesList').textContent)"), 'Mes affiches : « Carte + illustration »')
        await page.evaluate("closeDialog('saves')")
        n = await page.evaluate("normState({mode:'mix',mix:{compo:'xx',shape:'star',pos:'gauche'}}).mix")
        check(n == {'compo': 'med', 'shape': 'circle', 'pos': 'bas'}, f'état forgé : composition corrigée {n}')
        await page.click('#modeSeg button[data-v=map]'); await page.wait_for_timeout(300)
        await page.evaluate("__cms.showTab('style')")
        check(await page.is_hidden('#tb-illus') and await page.is_visible('#tb-repere') and await page.is_visible('#layouts'), 'retour au mode Carte : onglets et gabarits')
        check(await page.evaluate("__cms.geom(__cms.st,1000,1414).mix") is None, 'mode Carte : géométrie des gabarits')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
