"""e2e : mode Carte + illustration, compositions Médaillon et Vignette (issue #44).

Vérifie : onglets (Lieu, Repère, Illustration, Textes, Style) et réglages visibles ; étape Composition ; prompt selon la
composition (zone du médaillon, vignette en 3:4) ; géométrie (formes et positions du médaillon, découpe de la carte à
l'aperçu) ; rendu (illustration hors du médaillon, carte dedans ; vignette sur la carte ; titre dans la bande ;
attribution OSM) ; qualité calculée sur la zone de l'illustration ; couleurs de la carte d'après l'illustration
(annulable) ; glisser : l'image hors de la carte, la carte dans le médaillon, la vignette par sa zone de prise ;
export A4 ; export bloqué sans image ; validation de l'état.
"""
import asyncio, json, os, pathlib
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
COTE = '''async ()=>{ const r=await __cms.composePoster(877,620), c=r.canvas.getContext('2d');
  const px=[[0.25,0.2],[0.75,0.5]].map(([x,y])=>[...c.getImageData(Math.round(x*877),Math.round(y*620),1,1).data].slice(0,3)); r.canvas.width=0; return px; }'''
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
        check(tabs == ['lieu', 'repere', 'illus', 'textes', 'style', 'export'], f'onglets du mode Carte + illustration {tabs}')
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
        await wait_js(page, "!$('result').hidden", 30000)
        check('2480 × 3508 px' in await page.text_content('#resInfo'), 'export A4 : 2480 × 3508 px')
        await page.click('#resClose')

        # Haut / bas (moitié, deux tiers), côte à côte (paysage), fondu (issue #45)
        await page.evaluate("__cms.showTab('illus')"); await page.click('#illusStepSeg button[data-v=compo]'); await page.click('#compoSeg button[data-v=hb]'); await page.wait_for_timeout(300)
        check(await page.is_visible('#hbOpts') and await page.is_hidden('#medOpts'), 'haut / bas : choix du partage')
        g = await page.evaluate("(()=>{ const g=__cms.geom(__cms.st,1000,1414); return [g.illus.h, g.map.y, g.map.h]; })()")
        check(abs(g[0] - 707) < 1 and g[1] > g[0] and abs(g[1] + g[2] - 1414) < 1, f'haut / bas : illustration sur la moitié haute {g}')
        pr = await page.evaluate("CMS.illus.buildPrompt(__cms.st)")
        check('la moitié haute de l’affiche' in pr and 'paysage, proportions 1,414:1' in pr, 'prompt haut / bas : partage et proportions de la zone')
        r = await page.evaluate(RENDER, [[0.5, 0.25], [0.5, 0.8]])
        check(red(r['px'][0]) or blue(r['px'][0]), f'haut / bas : illustration en haut {r["px"][0]}')
        check(not red(r['px'][1]) and not blue(r['px'][1]), f'haut / bas : carte en bas {r["px"][1]}')
        await page.click('#mixSplitSeg button[data-v=two]'); await page.wait_for_timeout(200)
        check(abs(await page.evaluate("__cms.geom(__cms.st,1000,1414).illus.h") - 1414 * 2 / 3) < 1 and 'deux tiers du haut' in await page.evaluate("CMS.illus.buildPrompt(__cms.st)"), 'haut / bas : deux tiers')
        await page.click('#compoSeg button[data-v=cote]'); await page.wait_for_timeout(400)
        check(await page.evaluate("__cms.st.orient") == 'landscape', 'côte à côte : affiche passée en paysage')
        dims = await page.evaluate("['a4','a3','50x70'].map(f=>{ const d=__cms.exportSpec({...__cms.st,format:f}); return [d.W,d.H]; })")
        check(dims[0] == [3508, 2480] and all(w > h for w, h in dims), f'côte à côte : export paysage en A4, A3, 50 × 70 {dims}')
        g = await page.evaluate("(()=>{ const g=__cms.geom(__cms.st,1414,1000); return [Math.round(g.illus.w), Math.round(g.map.x), Math.round(g.map.w)]; })()")
        check(g[0] == g[2] and g[1] > g[0], f'côte à côte : illustration à gauche, carte à droite {g}')
        pr = await page.evaluate("CMS.illus.buildPrompt(__cms.st)")
        check('moitié gauche d’une affiche en paysage' in pr and 'portrait, proportions 1:1,414' in pr, 'prompt côte à côte : zone en portrait')
        r = await page.evaluate(COTE)
        check(red(r[0]) and not red(r[1]) and not blue(r[1]), f'côte à côte : rendu (illustration, carte) {r}')
        await page.evaluate("__cms.setOrient('portrait')")
        await page.click('#compoSeg button[data-v=fondu]'); await page.wait_for_timeout(400)
        check('linear-gradient' in await page.evaluate("document.getElementById('slot').style.maskImage"), "fondu : carte de l'aperçu effacée vers le haut (masque)")
        check('se fondra dans une carte' in await page.evaluate("CMS.illus.buildPrompt(__cms.st)"), "prompt fondu : bas de l'image simple")
        r = await page.evaluate(RENDER, [[0.5, 0.6], [0.5, 0.95]])
        check(blue(r['px'][0]), f'fondu : illustration visible en haut de la carte {r["px"][0]}')
        check(not blue(r['px'][1]) and not red(r['px'][1]), f'fondu : carte pleine en bas {r["px"][1]}')
        await page.click('#compoSeg button[data-v=med]'); await page.wait_for_timeout(200)
        check(await page.evaluate("document.getElementById('slot').style.maskImage") in ('', 'none'), 'médaillon : plus de masque')

        # Pistes lues dans les données importées (moteur Fichier)
        lat0, lon0 = 47.5861, 1.3359
        named = {'elements': [
          {'type': 'node', 'id': 1, 'lat': lat0 + 0.002, 'lon': lon0, 'tags': {'historic': 'castle', 'name': 'Château royal de Blois'}},
          {'type': 'way', 'id': 2, 'tags': {'amenity': 'place_of_worship', 'name': 'Cathédrale Saint-Louis'}, 'geometry': [{'lat': lat0 + 0.004, 'lon': lon0 + 0.001}, {'lat': lat0 + 0.0042, 'lon': lon0 + 0.0012}]},
          {'type': 'node', 'id': 3, 'lat': lat0, 'lon': lon0 + 0.003, 'tags': {'amenity': 'place_of_worship', 'name': 'Chapelle du quartier'}},
          {'type': 'way', 'id': 4, 'tags': {'waterway': 'river', 'name': 'La Loire'}, 'geometry': [{'lat': lat0 - 0.004, 'lon': lon0 - 0.02}, {'lat': lat0 - 0.004, 'lon': lon0 + 0.02}]},
          {'type': 'way', 'id': 5, 'tags': {'landuse': 'vineyard'}, 'geometry': [{'lat': lat0 + 0.01, 'lon': lon0}, {'lat': lat0 + 0.011, 'lon': lon0 + 0.001}]},
          {'type': 'node', 'id': 6, 'lat': lat0, 'lon': lon0, 'tags': {'amenity': 'bench', 'name': 'Banc'}},
          {'type': 'way', 'id': 7, 'tags': {'highway': 'primary', 'name': 'Rue Denis Papin'}, 'geometry': [{'lat': lat0, 'lon': lon0}, {'lat': lat0 + 0.001, 'lon': lon0}]}]}
        await page.evaluate("t=>__cms.importText(t,'noms.json')", json.dumps(named)); await wait_js(page, "!!__cms.osmData && !!__cms.osmData.named", 5000)
        await page.evaluate("__cms.showTab('illus')"); await page.click('#illusStepSeg button[data-v=prompt]')
        await page.click('#bScanPistes'); await page.wait_for_timeout(300)
        f = await page.evaluate("CMS.illus.found")
        check(f[:2] == ['Château royal de Blois', 'Cathédrale Saint-Louis'] and 'La Loire' in f and 'Vignobles' in f and 'Banc' not in f and 'Rue Denis Papin' not in f,
              f"pistes (moteur Fichier) : monuments et cours d'eau d'abord, rues et bancs écartés {f}")
        sugg = await page.evaluate("[...$('pisteSugg').querySelectorAll('button')].map(b=>b.textContent)")
        check(sugg[0] == '+ Château royal de Blois', f'pistes proposées en puces {sugg[:2]}')
        await page.click('#pisteSugg button >> nth=0')
        check(await page.evaluate("__cms.st.illus.prompt.pistes") == ['Château royal de Blois'] and 'PISTES À PRIVILÉGIER (choisies par moi) : Château royal de Blois.' in await page.input_value('#promptOut'),
              "piste ajoutée au prompt d'un toucher")
        check(not await page.evaluate("[...$('pisteSugg').querySelectorAll('button')].some(b=>b.textContent.includes('Château'))"), 'piste retenue retirée des propositions')

        # Mes affiches : le type est affiché ; état forgé ; retour au mode Carte
        check('Carte + illustration' in await page.evaluate("(__cms.saveCurrent('Mix'), openSaves(), $('savesList').textContent)"), 'Mes affiches : « Carte + illustration »')
        n = await page.evaluate("normState({mode:'mix',mix:{compo:'xx',shape:'star',pos:'gauche',split:'3/4'}}).mix")
        check(n == {'compo': 'med', 'shape': 'circle', 'pos': 'bas', 'split': 'half'}, f'état forgé : composition corrigée {n}')
        await page.click('#modeSeg button[data-v=map]'); await page.wait_for_timeout(300)
        await page.evaluate("__cms.showTab('style')")
        check(await page.is_hidden('#tb-illus') and await page.is_visible('#tb-repere') and await page.is_visible('#layouts'), 'retour au mode Carte : onglets et gabarits')
        check(await page.evaluate("__cms.geom(__cms.st,1000,1414).mix") is None, 'mode Carte : géométrie des gabarits')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
