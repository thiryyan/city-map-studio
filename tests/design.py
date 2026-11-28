"""e2e : évolutions graphiques (phases A, B et C).

A : 14 polices et duos (police manuscrite réservée à la dédicace et aux noms), filtres,
    16 thèmes avec filtres et contrôle de contraste, gabarits Cœur / Arche / Voyage,
    ambiances, modèles de texte.
B : aperçu au mur, plusieurs lieux numérotés et reliés, textures de papier,
    5 nouveaux repères, gabarit Polaroid, partage par lien.
C : orientation paysage, gabarit Deux lieux, itinéraire GPX, carte du ciel.
Moteur Fichier avec les données de test : aucun accès réseau.
"""
import pathlib, os, asyncio, struct, math
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()   # site testé : dist/ (construit par run_all.py), ou CMS_ROOT
APP = (ROOT / 'index.html').as_uri()+'?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
SNAP = "(()=>document.getElementById('cvOver').toDataURL())()"
UNDER = "(()=>document.getElementById('cvUnder').toDataURL())()"

def gpx(n):
    pts = ''.join(f'<trkpt lat="{47.580 + 0.012 * math.sin(i / 90):.6f}" lon="{1.318 + 0.03 * i / n:.6f}"/>' for i in range(n))
    return f'<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>Bords de Loire</name><trkseg>{pts}</trkseg></trk></gpx>'

async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        page = await ctx.new_page(); errs = []
        INIT = "try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.advOpen','1');localStorage.setItem('cms3.styleMoreOpen','1');localStorage.setItem('cms3.themeOpen','1');localStorage.setItem('cms3.textMoreOpen','1');localStorage.setItem('cms3.welcomed','1')}catch(e){}"
        await page.add_init_script(INIT)
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            u = r.request.url
            if u.startswith('file:'): await r.continue_()
            else: await r.abort()
        await page.route('**/*', route)
        await page.goto(APP); await page.wait_for_timeout(1300)
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        snap = lambda: page.evaluate(SNAP)
        ev = page.evaluate

        # ================= Phase A =================
        print('— Phase A')
        n = await ev("Object.keys(__cms.FONTS).length")
        await ev("__cms.showTab('textes')")   # les polices sont dans l'onglet Textes (section Typographie, #72)
        cards = await ev("[document.querySelectorAll('#fontSeg button').length, document.querySelectorAll('#fontTitleSeg button').length, document.querySelectorAll('#duos button').length]")
        check(n == 14 and cards == [14, 16, 8], f'14 polices, cartes titre (avec Vintage et « Comme le texte ») et texte, 7 duos et Vintage ({n}, {cards})')
        await page.click('#fontCats .chip:has-text("Manuscrites")')
        # affichage réel (offsetParent), pas l'attribut hidden : un display:flex l'emportait sur hidden
        VIS = "s=>[...document.querySelectorAll(s)].filter(b=>b.offsetParent!==null).map(b=>b.dataset.v)"
        vis = await ev(VIS, '#fontSeg button'); vt = await ev(VIS, '#fontTitleSeg button')
        check(vis == ['vibes'] and vt == ['*vintage', '', 'vibes'], f'filtre « Manuscrites » : seules les polices manuscrites restent affichées {vis} {vt}')
        await page.click('#fontCats .chip:has-text("Affiche")')
        vis = await ev(VIS, '#fontSeg button')
        check(vis == ['deco', 'bebas'], f'filtre « Affiche » {vis}')
        await page.click('#fontCats .chip:has-text("Gravées")')
        vis = await ev(VIS, '#fontSeg button')
        check(vis == ['cinzel', 'fell', 'marcellus'], f'filtre « Gravées » {vis}')
        await page.click('#fontCats .chip:has-text("Toutes")')
        check(len(await ev(VIS, '#fontSeg button')) == 14, 'filtre « Toutes » : 14 polices affichées')
        base = await snap()
        await page.click('#duos [data-v=mariage]'); await page.wait_for_timeout(400)
        st = await ev("[__cms.st.fontTitle, __cms.st.font]")
        check(st == ['italiana', 'vibes'] and await snap() != base, f'duo « Mariage » : titre Italiana, texte calligraphique {st}')
        uses = await ev("""(()=>{ const ctx=document.createElement('canvas').getContext('2d'); const res={};
            // fontStr n'est pas exposée : on lit la police réellement posée par drawText via un canvas espion
            const orig=CanvasRenderingContext2D.prototype.fillText, seen=[];
            CanvasRenderingContext2D.prototype.fillText=function(t,x,y){ seen.push([t,this.font]); return orig.call(this,t,x,y); };
            const c=document.createElement('canvas'); c.width=620; c.height=877; __cms.st.layout='classic'; __cms.drawPoster(c.getContext('2d'),620,877,'over');
            CanvasRenderingContext2D.prototype.fillText=orig; __cms.st.layout='souvenir';
            const f=t=>(seen.find(s=>s[0].startsWith(t))||['',''])[1];
            return {ded:f('Là où'), names:f('Alice'), sub:f('V'), date:f('L')}; })()""")
        check('Great Vibes' in uses['ded'] and 'Great Vibes' in uses['names'] and 'Great Vibes' not in uses['sub'] and 'Great Vibes' not in uses['date'],
              f'police manuscrite : dédicace et noms seulement {uses}')
        await page.click('#duos [data-v=origine]'); await page.wait_for_timeout(300)

        await ev("__cms.showTab('style')")
        themes = await ev("Object.keys(__cms.THEMES).length")
        await page.click('#themeCats .chip:has-text("Sombres")')
        dark = await ev("[...document.querySelectorAll('#themes .theme')].filter(t=>t.offsetParent!==null).map(t=>t.dataset.v)")
        check(themes == 16 and sorted(dark) == ['neon', 'nuit', 'onyx', 'plan'], f'16 thèmes, filtre « Sombres » {dark}')
        await page.click('#themeCats .chip:has-text("Tous")')
        bad = []
        for k in await ev("Object.keys(__cms.THEMES)"):
            await page.click(f'#themes .theme[data-v={k}]'); await page.wait_for_timeout(60)
            if await page.inner_text('#contrastWarn'): bad.append(k)
        check(not bad, f'aucun thème ne déclenche l\'avertissement de contraste {bad}')
        await ev("(()=>{ const i=document.querySelector('[data-c=roadMajor]'); i.value=__cms.st.colors.land.toLowerCase(); i.dispatchEvent(new Event('input')); })()")
        w = await page.inner_text('#contrastWarn')
        check('rues principales' in w, f'contraste insuffisant signalé : {w}')
        await page.click('#themes .theme[data-v=souvenir]')

        shots = {}
        for lay in ['souvenir', 'heart', 'arch', 'travel', 'polaroid']:
            await page.click(f'#layouts .card[data-v={lay}]'); await page.wait_for_timeout(250); shots[lay] = await snap()
        check(len(set(shots.values())) == 5, 'gabarits Cœur, Arche, Voyage et Polaroid : rendus distincts')
        await page.click('#layouts .card[data-v=heart]'); await page.wait_for_timeout(200)
        clip = await ev("document.getElementById('slot').style.clipPath")
        check(clip.startswith('path('), f'gabarit Cœur : carte interactive découpée en cœur ({clip[:24]}…)')
        await page.click('#layouts .card[data-v=souvenir]')

        await page.wait_for_timeout(400)
        await page.click('#ambiances [data-v=voyage]'); await page.wait_for_timeout(600)
        amb = await ev("[__cms.st.theme, __cms.st.layout, __cms.st.fontTitle, __cms.st.font, __cms.st.markerStyle, __cms.st.texture]")
        check(amb == ['terracotta', 'travel', 'bebas', 'jost', 'pin', 'kraft'], f'ambiance « Carnet de voyage » {amb}')
        check(await ev("document.querySelector('#ambiances [data-v=voyage]').classList.contains('on')"), 'ambiance active signalée')
        await page.click('#bUndo'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.layout") == 'souvenir', 'ambiance annulable')
        await ev("__cms.applyOccasion('naissance')")
        occ = await ev("[__cms.st.texts.dedication, __cms.st.texts.names]")
        check(occ == ['Bienvenue, petit trésor', 'Léa'], f'modèle « Naissance » {occ}')
        await ev("__cms.st.texts.names='Alice & Tom'; __cms.applyOccasion('mariage')")
        check(await ev("__cms.st.texts.names") == 'Alice & Tom', 'modèle : des noms saisis ne sont pas remplacés')
        await ev("__cms.resetAll()"); await page.wait_for_timeout(500)
        await ev("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(400)

        # ================= Phase B =================
        print('— Phase B')
        await ev("__cms.showTab('repere')")
        mk = await ev("""(()=>{ const ds=[...document.querySelectorAll('#marks .card canvas')].map(c=>c.toDataURL());
            return [ds.length, new Set(ds).size]; })()""")
        check(mk == [10, 10], f'10 repères, tous distincts {mk}')
        base = await snap()
        await page.click('#bAddPlace'); await page.wait_for_timeout(200)
        check(await ev("[__cms.ui.placing, __cms.ui.placeIdx]") == [True, 1], 'ajouter un lieu : mode placement du lieu 2')
        s = await page.locator('#slot').bounding_box()
        await page.mouse.click(s['x'] + s['width'] * 0.25, s['y'] + s['height'] * 0.3); await page.wait_for_timeout(300)
        m2 = await ev("__cms.st.markers2[0]"); m1 = await ev("__cms.st.marker")
        check(abs(m2['lat'] - m1['lat']) > 1e-4 and not await ev("__cms.ui.placing"), 'lieu 2 placé d\'un toucher, repère principal inchangé')
        await page.fill('#mList .prow:nth-child(1) input', 'Rencontre'); await page.fill('#mList .prow:nth-child(2) input', 'Mariage')
        await page.click('label.tog:has(input[data-k=numbered])'); await page.wait_for_timeout(300)
        leg = await ev("__cms.st.numbered") and await snap() != base
        await page.click('label.tog:has(input[data-k=linkMarkers])'); await page.wait_for_timeout(300)
        check(leg and await snap() != base, 'lieux numérotés (pastilles, légende) et reliés')
        await page.click('#bAddPlace'); await ev("__cms.placeAt(47.585,1.34)")
        check(await page.is_disabled('#bAddPlace'), 'trois lieux au plus')

        await ev("__cms.showTab('style')")
        base = await page.evaluate("document.getElementById('cvTex').hidden")
        tex = []
        for k in ['grain', 'aquarelle', 'kraft', 'toile']:
            await page.click(f'#textures [data-v={k}]'); await page.wait_for_timeout(200)
            tex.append(await ev("document.getElementById('cvTex').toDataURL()"))
        check(base and len(set(tex)) == 4 and await ev("!document.getElementById('cvTex').hidden"), 'papier : 4 textures distinctes, calque visible')
        same = await ev("__cms.textureBase('grain',false,false)===__cms.textureBase('grain',false,false)")
        check(same, 'texture identique à l\'aperçu et à l\'export (même base, en cache)')

        await ev("__cms.showTab('export')"); await page.click('#bMockup'); await page.wait_for_timeout(1500)
        mock = await ev("[document.getElementById('mockup').classList.contains('show'), document.getElementById('mockCv').width, document.getElementById('mockCv').height]")
        check(mock == [True, 1400, 1750], f'aperçu au mur affiché {mock}')
        a = await ev("document.getElementById('mockCv').toDataURL()")
        await page.click('#mockWalls .chip:has-text("Sauge")'); await page.click('#mockFrames .chip:has-text("doré")')
        check(await ev("document.getElementById('mockCv').toDataURL()") != a, 'mur et cadre modifiables')
        async with page.expect_download() as dl: await page.click('#mockDl')
        check((await dl.value).suggested_filename.startswith('apercu-au-mur-'), 'aperçu au mur téléchargeable')
        await page.click('#mockClose')

        await ev("__cms.st.texts.title='Chambord'")
        url = await ev("__cms.encodeShare().then(r=>r.url)")
        check('#a=z' in url and len(url) < 3000, f'lien de partage compressé ({len(url)} caractères)')
        # Accord donné aussi à cette page : en file://, un Chrome récent ne partage pas toujours le localStorage entre pages
        p2 = await ctx.new_page(); await p2.add_init_script(INIT); await p2.route('**/*', route)
        await p2.goto(url); await p2.wait_for_timeout(1600)
        got = await p2.evaluate("[__cms.st.texts.title, __cms.st.texture, __cms.st.markers2.length, location.hash]")
        check(got == ['Chambord', 'toile', 2, ''], f'lien ouvert : affiche reconstituée, ancre effacée {got}')
        await p2.click('#bUndo'); await p2.wait_for_timeout(300)
        check(await p2.evaluate("__cms.st.texts.title") != 'Chambord', 'lien ouvert : « Annuler » retrouve l\'affiche précédente')
        await p2.close()

        # ================= Phase C =================
        print('— Phase C')
        await ev("__cms.resetAll()"); await page.wait_for_timeout(500)
        await ev("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(400)
        await ev("__cms.showTab('export')"); await page.click('#orientSeg [data-v=landscape]'); await page.wait_for_timeout(300)
        bx = await page.locator('#poster').bounding_box()
        check(bx['width'] > bx['height'] * 1.3, 'paysage : aperçu horizontal')
        dims = {}
        for lay in ['classic', 'heart', 'travel', 'diptych', 'sky']:
            await ev(f"__cms.setLayout('{lay}',true)"); await page.wait_for_timeout(200)
            dims[lay] = await ev("__cms.composePoster(3508,2480).then(r=>[r.canvas.width,r.canvas.height])")
        check(all(v == [3508, 2480] for v in dims.values()), f'paysage : 5 gabarits composés en 3508 × 2480 {dims}')
        await ev("__cms.showTab('export')"); await page.click('#orientSeg [data-v=portrait]'); await page.wait_for_timeout(300)

        await ev("__cms.showTab('style')"); await page.click('#layouts .card[data-v=diptych]'); await page.wait_for_timeout(500)
        await ev("__cms.showTab('lieu')")
        check(await page.is_visible('#placeSwitch') and await page.is_visible('#placeBox'), 'deux lieux : bascule sur la carte et dans l\'onglet Lieu')
        c0 = await ev("JSON.stringify(__cms.st.center)")
        await page.click('#placeSwitch'); await page.wait_for_timeout(500)
        check(await ev("__cms.st.active") == 1, 'toucher l\'autre carte : lieu 2 édité')
        await ev("__cms.st.center={lat:47.583,lon:1.33}; __cms.st.marker={lat:47.583,lon:1.33}")
        await page.click('#placeSeg [data-v="0"]'); await page.wait_for_timeout(500)
        st2 = await ev("[__cms.st.active, JSON.stringify(__cms.st.center), __cms.st.place2.marker.lat]")
        check(st2[0] == 0 and st2[1] == c0 and abs(st2[2] - 47.583) < 1e-9, 'deux vues conservées en passant d\'un lieu à l\'autre')
        await page.wait_for_timeout(800)
        check(await ev("!!__cms.ui.snap"), 'vue figée du lieu non édité dessinée')
        async with page.expect_download() as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value; path = str(T / 'design-diptych.png'); await d.save_as(path)
        w, h = struct.unpack('>II', open(path, 'rb').read()[16:24])
        check((w, h) == (2480, 3508), f'export « Deux lieux » {w} × {h}')
        await page.click('#resClose')

        await ev("__cms.showTab('style')"); await page.click('#layouts .card[data-v=classic]')
        f = T / 'design-test.gpx'; f.write_text(gpx(3000))
        await ev("__cms.showTab('repere')")
        before = await snap()
        await page.set_input_files('#gpxIn', str(f)); await page.wait_for_timeout(600)
        r = await ev("[__cms.st.route.name, __cms.st.route.pts.length]")
        check(r[0] == 'Bords de Loire' and 2 <= r[1] <= 1500, f'GPX importé et simplifié (3000 → {r[1]} points)')
        check(await snap() != before and await page.is_visible('#routeBox'), 'itinéraire tracé sur la carte')
        z = await ev("__cms.st.zoom")
        check(10 <= z <= 18, f'cadrage automatique sur l\'itinéraire (zoom {z:.1f})')
        await ev("__cms.st.route.pts=Array.from({length:600},(_,i)=>[47.58+i*1e-5,1.33])")
        sh = await ev("__cms.encodeShare()")
        check(sh['dropped'], 'lien : itinéraire long non inclus, et signalé')
        f.unlink()

        # Ciel : l'étoile Polaire est à une hauteur égale à la latitude (à ~1° près)
        pol = await ev("__cms.altAz(37.95,89.26,47.5861,1.3359,Date.UTC(2023,6,14,20,0)).alt")
        sirius = await ev("__cms.altAz(101.29,-16.72,47.5861,1.3359,Date.UTC(2023,0,15,23,0)).alt")
        check(abs(pol - 47.59) < 1.2 and 20 < sirius < 30, f'astronomie : Polaire à {pol:.1f}° (lat 47,6°), Sirius à {sirius:.1f}° un soir de janvier')
        await ev("__cms.showTab('style')"); await page.click('#layouts .card[data-v=sky]'); await page.wait_for_timeout(1200)
        check(await ev("!!window.SKY_DATA && __cms.st.sky.when.startsWith('2023-09-23')"), 'ciel : données chargées à la demande, date reprise du texte')
        u1 = await ev(UNDER)
        await page.fill('#skyWhen', '2023-01-15T23:00'); await page.dispatch_event('#skyWhen', 'change'); await page.wait_for_timeout(300)
        check(await ev(UNDER) != u1, 'ciel : la date change les étoiles')
        await page.select_option('#skyTz', '60'); await page.wait_for_timeout(200)
        check(await ev("__cms.st.sky.tz") == 60 and await ev("__cms.skyTime()") == 1673820000000, 'ciel : fuseau UTC+1 pris en compte')
        async with page.expect_download() as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value; path = str(T / 'design-sky.png'); await d.save_as(path)
        w, h = struct.unpack('>II', open(path, 'rb').read()[16:24])
        check((w, h) == (2480, 3508), f'export « Ciel » {w} × {h}')

        # ================= Effets de tracé (moteur Fichier ; le moteur Vectoriel GPU est vérifié par maplibre.py) =================
        print('— Effets de tracé')
        await page.click('#resClose')
        await ev("__cms.showTab('style')"); await page.click('#layouts .card[data-v=classic]'); await page.wait_for_timeout(400)
        MAP = "(()=>document.getElementById('vecCanvas').toDataURL())()"
        base = await ev(MAP); seen = {}
        for k in ['hatch', 'outline', 'pencil']:
            await page.click(f'label.tog:has(input[data-k="fx.{k}"])'); await page.wait_for_timeout(300)
            seen[k] = await ev(MAP)
            await page.click(f'label.tog:has(input[data-k="fx.{k}"])'); await page.wait_for_timeout(300)
        check(all(v != base for v in seen.values()) and len(set(seen.values())) == 3, 'eau hachurée, bâtiments en contour, trait crayon : trois rendus distincts')
        check(await ev(MAP) == base, 'effets retirés : rendu d\'origine')
        dims = await ev("""(async()=>{ __cms.st.fx={hatch:true,outline:true,pencil:true}; const r=await __cms.composePoster(2480,3508); __cms.st.fx={hatch:false,outline:false,pencil:false}; return [r.canvas.width,r.canvas.height]; })()""")
        check(dims == [2480, 3508], f'export avec les trois effets {dims}')
        await page.click('#ambiances [data-v=encre]'); await page.wait_for_timeout(300)
        e1 = await ev("JSON.stringify(__cms.st.fx)")
        await page.click('#ambiances [data-v=voyage]'); await page.wait_for_timeout(300)
        e2 = await ev("JSON.stringify(__cms.st.fx)")
        check('"hatch":true' in e1 and '"pencil":true' in e2 and '"hatch":false' in e2, f'ambiances : Encre de Chine hachurée, Carnet de voyage au crayon ({e1} {e2})')
        await page.click('#bUndo'); await page.wait_for_timeout(300)
        check('"hatch":true' in await ev("JSON.stringify(__cms.st.fx)"), 'effets annulables avec l\'ambiance')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
