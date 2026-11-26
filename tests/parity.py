"""e2e : mêmes capacités d'édition dans les trois types d'affiche (issue #77).

Lot A : en Illustration et en Carte + illustration, la taille des coordonnées et le retour à la ligne de la dédicace agissent
sur le rendu ; la légende des lieux numérotés s'affiche en Carte + illustration (aussi dans la bande de la vignette, avec
les noms). Lot B : une ambiance ne change que ce qui existe dans le type courant ; « Côte à côte » rend l'orientation
d'avant ; style de titre « Auto » expliqué. Lot C : onglet Lieu en Illustration (coordonnées modifiables, inscrites sur
l'affiche). Lot D : contour du médaillon et marge de la vignette en Carte + illustration ; « Couleurs d'après une
image » dans Style (illustration ou photo) ; « Papier jauni » rangé avec le papier ; couleur du repère « Auto ».
Lot E : boutons flottants et verrou « Toucher pour cadrer » sur le calque cadré (carte ou illustration).
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
INIT = "try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.welcomed','1');localStorage.setItem('cityMapStudio.styleMoreOpen','1');localStorage.setItem('cityMapStudio.themeOpen','1')}catch(e){}"
MAKE = """async ([w,h])=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
  x.fillStyle='#C0392B'; x.fillRect(0,0,w,h); x.fillStyle='#2E86C1'; x.fillRect(0,h/2,w,h/2);
  const b=await new Promise(r=>c.toBlob(r,'image/png')); window.__f=new File([b],'test.png',{type:'image/png'}); }"""
# Rendu complet 620 × 877 : textes tracés [texte, police] et empreinte des pixels
RENDER = """async ()=>{ const seen=[], f=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(t,...a){ seen.push([String(t),this.font]); return f.call(this,t,...a); };
  let sum=0; try{ const r=await __cms.composePoster(620,877), d=r.canvas.getContext('2d').getImageData(0,0,620,877).data;
    for(let i=0;i<d.length;i+=40) sum=(sum*31+d[i]+d[i+1]*3+d[i+2]*7)%1000000007; r.canvas.width=0; }
  finally{ CanvasRenderingContext2D.prototype.fillText=f; } return {sum, seen}; }"""
# Ligne « date · coordonnées » du bloc du bas : tailles de ses trois morceaux (date, séparateur, coordonnées)
PARTS = """(()=>{ const c=document.createElement('canvas').getContext('2d'), L=CMS.illus.textLayout(c,1000,1414,1000);
  const l=L.foot && L.foot.lines.find(x=>Array.isArray(x.t)); return l ? l.t.map(p=>Math.round(p[1].size*100)/100) : null; })()"""
# Texte tracé (lettre à lettre quand il est interlettré) : concaténation de tous les fillText
txt = lambda r: ''.join(t for t, _ in r['seen'])
fails = []


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.add_init_script(INIT)
        async def route(r):
            if r.request.url.startswith(('file:', 'blob:', 'data:')): return await r.continue_()
            await r.abort()
        await page.route('**/*', route)
        await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
        await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX)
        await wait_js(page, "!!__cms.osmData", 5000)
        render = lambda: page.evaluate(RENDER)
        ev = page.evaluate

        # ---------- Lot A : textes ----------
        for mode in ('illus', 'mix'):
            await ev(f"CMS.illus.setMode('{mode}')"); await page.wait_for_timeout(300)
            await ev("__cms.st.texts.dedication='Ici commence une très longue histoire que nous écrirons ensemble pour toujours'; __cms.st.dedWrap='one'; scheduleOver()")
            one = await render()
            await ev("__cms.setDedWrap('two')"); two = await render()
            n1 = [t for t, _ in one['seen'] if 'commence' in t or 'toujours' in t]; n2 = [t for t, _ in two['seen'] if 'commence' in t or 'toujours' in t]
            check(len(n1) == 1 and len(n2) == 2, f'{mode} : dédicace sur une ou deux lignes (réglage Retour à la ligne) {n1} {n2}')
            await ev("__cms.setDedWrap('auto'); __cms.st.texts.dedication='Là où tout a commencé'")
            a = await ev(PARTS); await ev("__cms.st.textScale.coords=150; scheduleOver()"); bb = await ev(PARTS)
            check(a and bb and bb[2] > a[2] * 1.3 and abs(bb[0] - a[0]) < 0.01, f'{mode} : la taille des coordonnées agit, la date garde la sienne {a} → {bb}')
            s1 = await render(); await ev("__cms.st.textScale.coords=100; scheduleOver()"); s0 = await render()
            check(s1['sum'] != s0['sum'], f'{mode} : rendu modifié par la taille des coordonnées')
        # Légende des lieux numérotés (Carte + illustration), y compris dans la bande de la vignette
        await ev("__cms.st.markers2=[{lat:47.59,lon:1.34,label:'Mariage'}]; __cms.st.markerLabel='Rencontre'; __cms.st.numbered=true; scheduleOver()")
        r = await render()
        check('Mariage' in txt(r), 'Carte + illustration (médaillon) : légende des lieux numérotés')
        await ev("__cms.st.mix.compo='vig'; layoutPreview()"); await page.wait_for_timeout(200)
        r = await render()
        check('Mariage' in txt(r) and 'Alice' in txt(r), 'vignette : légende et noms dans la bande')
        await ev("CMS.illus.setMode('illus')"); await page.wait_for_timeout(200)
        r = await render()
        check('Mariage' not in txt(r), 'Illustration : pas de légende de repères (aucune carte)')
        await ev("__cms.st.markers2=[]; __cms.st.numbered=false; __cms.st.mix.compo='med'")

        # ---------- Lot B : pas d'effet de bord ----------
        await ev("CMS.illus.setMode('illus'); __cms.st.layout='souvenir'; __cms.st.markerStyle='heart'; __cms.st.fx.pencil=false")
        await ev("__cms.showTab('style')"); await page.wait_for_timeout(300)
        await page.click('#ambiances button[data-v=voyage]'); await page.wait_for_timeout(300)
        s = await ev("[__cms.st.layout, __cms.st.markerStyle, __cms.st.fx.pencil, __cms.st.theme, __cms.st.texture]")
        check(s[:3] == ['souvenir', 'heart', False] and s[3] == 'terracotta' and s[4] == 'kraft', f'Illustration : ambiance sans gabarit, repère ni effets de carte {s}')
        check('gabarit' not in await page.text_content('#toast') and 'thème' in await page.text_content('#toast'), 'ambiance : le message dit ce qui change')
        await ev("CMS.illus.setMode('mix')"); await page.wait_for_timeout(200)
        await page.click('#ambiances button[data-v=voyage]'); await page.wait_for_timeout(300)
        s = await ev("[__cms.st.layout, __cms.st.markerStyle, __cms.st.fx.pencil]")
        check(s == ['souvenir', 'pin', True], f'Carte + illustration : ambiance avec repère et effets, sans gabarit {s}')
        await ev("__cms.undo(); __cms.undo()"); await page.wait_for_timeout(300)
        # Côte à côte : orientation rendue
        await ev("__cms.showTab('illus'); __cms.setOrient('portrait')"); await ev("document.querySelector('#illusStepSeg [data-v=compo]').click()")
        await page.click('#compoSeg button[data-v=cote]'); await page.wait_for_timeout(200)
        o1 = await ev("__cms.st.orient")
        await page.click('#compoSeg button[data-v=med]'); await page.wait_for_timeout(200)
        check(o1 == 'landscape' and await ev("__cms.st.orient") == 'portrait', 'Côte à côte : paysage, puis portrait rendu avec une autre composition')
        # Titre automatique expliqué
        await ev("__cms.st.illusText.style='auto'; __cms.showTab('textes'); CMS.emit('state:synced')"); await page.wait_for_timeout(200)
        t = await page.text_content('#titleAuto')
        check(await page.is_visible('#titleAuto') and 'Vintage' in t, f'style de titre Auto : ce qu\'il donne est indiqué ({t[:60]}…)')

        # ---------- Lot C : Lieu en Illustration ----------
        await ev("CMS.illus.setMode('illus')"); await page.wait_for_timeout(200)
        check(await page.is_visible('#tb-lieu') and await page.is_hidden('#tb-repere'), 'Illustration : onglet Lieu proposé, sans Repère')
        await ev("__cms.showTab('lieu')"); await page.wait_for_timeout(150)
        check(await page.is_visible('#q') and await page.is_visible('#markerIn') and await page.is_hidden('#bPlace2') and await page.is_hidden('#zoom'),
              'Lieu en Illustration : recherche et coordonnées, sans placement sur la carte ni zoom')
        await page.fill('#markerIn', '48.8566, 2.3522'); await page.press('#markerIn', 'Enter'); await page.wait_for_timeout(300)
        r = await render()
        check('48.8566' in txt(r), 'Illustration : coordonnées du lieu modifiées sur l\'affiche')
        await ev("__cms.st.marker={lat:47.5861,lon:1.3359}")

        # ---------- Lot D : formes et couleurs ----------
        await ev(MAKE, [600, 800]); await ev("CMS.illus.importFile(window.__f)"); await wait_js(page, "CMS.illus.ready()", 5000)
        await ev("CMS.illus.setMode('mix'); __cms.st.mix.compo='med'; layoutPreview(); __cms.showTab('style'); document.getElementById('styleMore').open=true"); await page.wait_for_timeout(300)
        check(await page.is_visible('#ringTog') and await page.is_hidden('#marginBox'), 'médaillon : contour proposé, pas de marge')
        await ev("__cms.st.ring=true; scheduleOver()"); on = await render()
        await ev("__cms.st.ring=false; scheduleOver()"); off = await render()
        check(on['sum'] != off['sum'], 'médaillon : le réglage Contour de la forme agit sur le rendu')
        await ev("__cms.st.ring=true; __cms.st.mix.compo='vig'; CMS.emit('state:synced')"); await page.wait_for_timeout(200)
        check(await page.is_visible('#marginBox') and await page.is_hidden('#ringTog'), 'vignette : marge proposée, pas de contour')
        await ev("__cms.st.mix.compo='hb'; CMS.emit('state:synced')"); await page.wait_for_timeout(200)
        check(await page.is_hidden('#marginBox') and await page.is_hidden('#ringTog') and await page.is_hidden('#mixFormH'), 'haut / bas : ni marge ni contour (rien d\'inopérant)')
        await ev("__cms.st.mix.compo='med'; CMS.emit('state:synced')")
        before = await ev("JSON.stringify(__cms.st.colors)")
        await page.click('#bPalIllus'); await page.wait_for_timeout(300)
        check(await ev("JSON.stringify(__cms.st.colors)") != before and await page.is_visible('#photoSw'), 'Style : couleurs d\'après l\'illustration')
        for mode in ('illus', 'map'):
            await ev(f"CMS.illus.setMode('{mode}')"); await page.wait_for_timeout(200)
            vis = [await page.is_visible(q) for q in ('#bPalIllus', 'label.btn:has(#photoIn)', 'label.tog:has([data-k="illus.paper"])')]
            want = [True, True, True] if mode == 'illus' else [False, True, False]
            check(vis == want, f'{mode} : « Couleurs d\'après une image » (illustration, photo) et Papier jauni {vis}')
        await ev("__cms.showTab('repere')"); await page.wait_for_timeout(150)
        await ev("__cms.st.colors.marker=THEMES[__cms.st.theme].c.marker; refreshColors()")
        check(await ev("document.querySelector('#mColors [data-v=auto]').getAttribute('aria-pressed')") == 'true', 'repère : « Auto » enfoncé avec la couleur du thème')
        await page.click('#mColors [data-v="#111111"]'); await page.wait_for_timeout(150)
        check(await ev("__cms.st.colors.marker") == '#111111' and await ev("document.querySelector('#mColors [data-v=auto]').getAttribute('aria-pressed')") == 'false', 'repère : couleur choisie enfoncée, « Auto » relâché')
        await page.click('#mColors [data-v=auto]'); await page.wait_for_timeout(150)
        check(await ev("__cms.st.colors.marker===THEMES[__cms.st.theme].c.marker.toUpperCase()"), 'repère : « Auto » rend la couleur du thème')

        # ---------- Lot E : cadrage unifié ----------
        await ev("CMS.illus.setMode('illus')"); await page.wait_for_timeout(300)
        check(await page.is_visible('#bZoomIn') and await page.is_visible('#bToMarker') and await page.is_hidden('#bPlace'), 'Illustration : zoom et recentrage proposés, pas de repère')
        z = await ev("__cms.st.illus.zoom"); await page.click('#bZoomIn'); await page.wait_for_timeout(100)
        check(await ev("__cms.st.illus.zoom") == z + 10 and 'illustration' in await page.get_attribute('#bZoomIn', 'aria-label'), 'Illustration : « + » agrandit l\'image')
        await ev("__cms.st.illus.ox=0.3"); await page.click('#bToMarker'); await page.wait_for_timeout(100)
        check(await ev("__cms.st.illus.ox") == 0, 'Illustration : recentrer l\'image')
        await ev("CMS.illus.setMode('mix')"); await page.wait_for_timeout(300)
        check(await ev("CMS.illus.layer()") == 'map', 'Carte + illustration : calque cadré au choix, la carte d\'abord')
        zm = await ev("__cms.st.zoom"); await page.click('#bZoomIn'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.zoom") > zm, 'calque carte : « + » zoome la carte')
        await ev("CMS.intent.open('illus')"); await page.wait_for_timeout(200)   # « Que déplacer ? » : Illustration (#82)
        zi = await ev("__cms.st.illus.zoom"); zm = await ev("__cms.st.zoom"); await page.click('#bZoomIn'); await page.wait_for_timeout(200)
        check(await ev("CMS.illus.layer()") == 'illus' and await ev("__cms.st.illus.zoom") == zi + 10 and await ev("__cms.st.zoom") == zm, 'calque illustration : « + » agrandit l\'image, la carte ne bouge pas')
        check(await ev("getComputedStyle(document.getElementById('slot')).pointerEvents") == 'none', 'calque illustration : la carte est figée')
        await ev("CMS.intent.open('map'); __cms.setFraming(false)")
        await ctx.close()

        # Mobile : le verrou « Toucher pour cadrer » couvre le calque cadré
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
        await page.add_init_script(INIT); await page.route('**/*', route)
        await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
        await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX)
        await page.evaluate(MAKE, [600, 800]); await page.evaluate("CMS.illus.importFile(window.__f)"); await wait_js(page, "CMS.illus.ready()", 5000)
        await page.evaluate("CMS.illus.setMode('illus')"); await page.wait_for_timeout(400)
        sh = await page.locator('#shield').bounding_box(); po = await page.locator('#poster').bounding_box()
        check(sh and abs(sh['width'] - po['width']) < 2 and abs(sh['height'] - po['height']) < 2, 'mobile, Illustration : verrou sur toute l\'image')
        ox = await page.evaluate("__cms.st.illus.ox")
        await page.tap('#shield'); await page.wait_for_timeout(300)
        check(await page.evaluate("__cms.ui.framing") and 'illustration' in await page.text_content('#frameTxt'), 'mobile : « Toucher pour cadrer » ouvre le cadrage de l\'illustration')
        await page.evaluate("document.getElementById('bEdit').click()")
        await page.evaluate("CMS.illus.setMode('mix'); CMS.illus.setLayer('illus')"); await page.wait_for_timeout(400)
        sh = await page.locator('#shield').bounding_box()
        check(sh and sh['width'] > po['width'] * 0.9, 'mobile, Carte + illustration : verrou sur l\'illustration quand elle est cadrée')
        check(ox == await page.evaluate("__cms.st.illus.ox"), 'mobile : rien ne bouge sans cadrage')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
