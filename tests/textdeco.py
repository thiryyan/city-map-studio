"""e2e : présentations et zones des textes (issue #86), en Carte + illustration, en Carte et en Illustration.

Vérifie : rendu par défaut inchangé (texte seul, sur l'illustration) ; zone de chaque bloc en Carte + illustration (sur
l'illustration, sur la carte, sur toute l'affiche) : titre posé dans la moitié carte, aperçu = export, zone de prise et
glisser relatifs à la zone, halo couleur papier sur la carte, prompt sans zone réservée au titre ; présentations : cartouche
(encre lisible à 4,5:1 sur sa plaque), bandeau, étiquette, capsule, filets art déco, cachet, vertical, arc autour du médaillon (lettres courbées, ni
glissé ni alerte de débordement) ; présentations proposées selon le contexte (arc : médaillon ; bloc du bas : trois) ;
vignette : une présentation pose le bloc sur la carte ; mode Carte : une présentation sort le bloc du gabarit, arc avec les
gabarits Médaillon et Arche, rien pour le titre du gabarit Lettres ; mises en page prêtes ; validation de l'état ; aucune
erreur de page.
"""
import asyncio, os, pathlib, math
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
# Textes tracés [texte, police, couleur, x, y, rotation] (x, y en fraction de l'affiche) pour un rendu de largeur W
GLYPHS = """async (W)=>{ const d=__cms.posterDims(), H=Math.round(W*d.H/d.W), seen=[], f=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(t,x,y){ const m=this.getTransform(); seen.push([String(t),this.font,String(this.fillStyle),(m.a*x+m.c*y+m.e)/W,(m.b*x+m.d*y+m.f)/H,Math.atan2(m.b,m.a)]); return f.apply(this,arguments); };
  try{ const r=await __cms.composePoster(W,H); r.canvas.width=0; } finally{ CanvasRenderingContext2D.prototype.fillText=f; } return seen; }"""
SET = "(()=>{{ const S=__cms.st, M=S.illusText.mix, P=S.illusText.map, I=S.illusText; {}; __cms.ui.snap=null; layoutPreview(); CMS.emit('state:synced'); drawOver(); }})()"


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


def words(glyphs, w):
    """Tracés d'un mot : d'un seul bloc commençant par w, ou lettre à lettre ; premier glyphe de chacun"""
    return [g for i, g in enumerate(glyphs) if g[0].startswith(w) or (len(g[0]) == 1 and ''.join(x[0] for x in glyphs[i:i + len(w)]) == w)]


def seq(glyphs, w='BLOIS'):
    """Lettres d'un mot tracées une à une (arc, cachet) : première suite consécutive de glyphes"""
    for i in range(len(glyphs) - len(w) + 1):
        if ''.join(g[0] for g in glyphs[i:i + len(w)]) == w and all(len(g[0]) == 1 for g in glyphs[i:i + len(w)]): return glyphs[i:i + len(w)]
    return []


def word(glyphs, w):
    found = words(glyphs, w)
    return found[0] if found else None


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(('file:', 'blob:', 'data:')) else r.abort())
        await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
        await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX); await wait_js(page, "!!__cms.osmData", 5000)
        ev = page.evaluate
        st = lambda js: ev(SET.format(js))

        # ---------- État : valeurs par défaut et validation ----------
        d = await ev("structuredClone(__cms.st.illusText)")
        check(d['deco'] == d['map']['deco'] == d['mix']['deco'] == {'title': 'libre', 'foot': 'libre'} and d['mix']['zone'] == {'title': 'illus', 'foot': 'illus'},
              'par défaut : texte seul partout, blocs sur l\'illustration')
        n = await ev("normState({illusText:{v:2,deco:{title:'neon',foot:'arc'},map:{deco:{title:'cachet'}},mix:{pos:'hc',deco:{title:'vertical',foot:'bandeau'},zone:{title:'map',foot:'ciel'}}}}).illusText")
        check(n['deco'] == {'title': 'libre', 'foot': 'libre'} and n['map']['deco'] == {'title': 'cachet', 'foot': 'libre'}
              and n['mix']['deco'] == {'title': 'vertical', 'foot': 'bandeau'} and n['mix']['zone'] == {'title': 'map', 'foot': 'illus'},
              f'état forgé : présentation inconnue ou réservée au titre → texte seul ; zone inconnue → illustration {n}')
        old = await ev("normState({illusText:{v:2,pos:'bd',mix:{pos:'hg'}}}).illusText.mix")
        check(old['zone'] == {'title': 'illus', 'foot': 'illus'} and old['deco']['title'] == 'libre' and old['pos'] == 'hg', 'état antérieur : positions gardées, zones et présentations par défaut')

        # ---------- Carte + illustration : Haut/bas, titre sur la carte ----------
        await page.click('#modeSeg button[data-v=mix]'); await page.wait_for_timeout(300)
        await ev(MAKE, [1200, 1700]); await ev("CMS.illus.importFile(window.__f)"); await wait_js(page, "CMS.illus.ready()", 5000)
        await ev("__cms.st.texts.title='Blois'; __cms.st.texts.subtitle='Val de Loire'; loadFonts()")
        await st("S.mix.compo='hb'; S.mix.split='half'"); await ev("__cms.showTab('textes')"); await page.wait_for_timeout(400)
        g0 = await ev(GLYPHS, 620); t0 = word(g0, 'BLOIS')
        check(t0 and t0[4] < 0.25, f'par défaut : titre en haut de l\'illustration {t0 and t0[3:5]}')
        check(await page.is_visible('#tZoneSeg') and await page.get_attribute('#tZoneSeg [data-v=illus]', 'aria-pressed') == 'true', 'zone du titre proposée, « Sur l\'illustration » enfoncé')
        await page.click('#tZoneSeg [data-v=map]'); await page.wait_for_timeout(400)
        check(await ev("__cms.st.illusText.mix.zone.title") == 'map', 'titre posé sur la carte')
        g1 = await ev(GLYPHS, 620); g2 = await ev(GLYPHS, 2480); t1, t2 = word(g1, 'BLOIS'), word(g2, 'BLOIS')
        check(t1 and 0.5 < t1[4] < 0.7, f'Haut/bas : titre en haut de la moitié carte {t1 and t1[3:5]}')
        check(t2 and abs(t1[3] - t2[3]) < 0.004 and abs(t1[4] - t2[4]) < 0.004, 'aperçu = export')
        check(len(words(g1, 'BLOIS')) == 1, 'sur la carte, « Auto » : sans ombre (titre tracé une fois)')
        halo = await ev("(()=>{ const s=[], f=CanvasRenderingContext2D.prototype.strokeText; CanvasRenderingContext2D.prototype.strokeText=function(t){ s.push([String(t),String(this.strokeStyle)]); return f.apply(this,arguments); }; try{ drawOver(); } finally{ CanvasRenderingContext2D.prototype.strokeText=f; } return s; })()")
        paper = (await ev("__cms.st.colors.paper")).lower()
        check(any(c.lower() == paper for t, c in halo if t.startswith('B') or t == 'B'), f'sur la carte : halo couleur papier autour des lettres {halo[:3]}')
        hi = await ev("(()=>{ const h=CMS.illus.hitInfo.title, g=__cms.geom(__cms.st,1000,1414); return {a:h.area, y:g.map.y/1414}; })()")
        check(abs(hi['a']['y'] - hi['y']) < 0.01 and hi['a']['h'] < 0.55, f'zone de prise : relative à la moitié carte {hi}')
        pr = await ev("CMS.illus.buildPrompt(__cms.st)")
        check('pour le titre.' not in pr and 'le titre sera posé sur la carte' in pr, 'prompt : aucune zone réservée au titre sur l\'illustration')
        # Glisser le titre dans la carte : position libre relative à la zone
        await ev("CMS.intent.open('text')"); await page.wait_for_timeout(300)
        box = await page.locator('#hitTitle').bounding_box(); poster = await page.locator('#poster').bounding_box()
        await page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); await page.mouse.down()
        await page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2 + poster['height'] * 0.07, steps=5); await page.mouse.up(); await page.wait_for_timeout(300)
        fr = await ev("__cms.st.illusText.mix.free")
        check(fr and 0.25 < fr['y'] < 0.45, f'glisser : position libre en fraction de la zone carte {fr}')
        await ev("__cms.setFraming(false)")
        await page.click('#tZoneSeg [data-v=poster]'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.illusText.mix.free") is None, 'changement de zone : position libre oubliée')
        await page.click('#tZoneSeg [data-v=illus]')

        # ---------- Présentations proposées ----------
        vis = lambda seg: ev(f"[...document.querySelectorAll('#{seg} button')].filter(b=>!b.hidden).map(b=>b.dataset.v)")
        check(await vis('tDecoSeg') == ['libre', 'cartouche', 'bandeau', 'etiquette', 'capsule', 'filets', 'cachet', 'vertical'], 'Haut/bas : toutes les présentations du titre, sauf l\'arc')
        check(await vis('fDecoSeg') == ['libre', 'cartouche', 'bandeau', 'etiquette', 'filets'], 'lignes du bas : texte seul, cartouche, bandeau, étiquette, filets')

        # ---------- Cartouche : plaque et encre lisible ----------
        await page.click('#tZoneSeg [data-v=map]'); await page.click('#tDecoSeg [data-v=cartouche]'); await page.click('#swText [data-v="#F3EAD8"]'); await page.wait_for_timeout(300)
        check(await page.get_attribute('#tDecoSeg [data-v=cartouche]', 'aria-pressed') == 'true', 'Cartouche choisi et enfoncé')
        g3 = await ev(GLYPHS, 620); t3 = word(g3, 'BLOIS')
        ratio = await ev("c=>contrast(c,__cms.st.colors.paper)", t3[2])
        check(t3[2].lower() != '#f3ead8' and ratio >= 4.5, f'cartouche : lettres crème trop pâles remplacées par une encre lisible ({t3[2]}, {ratio:.1f}:1)')
        px = await ev("""async ()=>{ const r=await __cms.composePoster(620,877), c=r.canvas.getContext('2d'), h=CMS.illus.hitInfo.title;
          const p=[...c.getImageData(Math.round((h.x+0.03)*620),Math.round((h.y+h.h/2)*877),1,1).data]; r.canvas.width=0; return p; }""")
        pp = await ev("(h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)))(__cms.st.colors.paper)")
        check(all(abs(px[i] - pp[i]) < 30 for i in range(3)), f'cartouche : plaque couleur papier sous le titre {px[:3]} ~ {pp}')
        await page.click('#swText [data-v=auto]')

        # ---------- Bandeau, étiquette, capsule, filets, cachet, vertical ----------
        for d in ('bandeau', 'etiquette', 'capsule', 'filets', 'cachet', 'vertical'):
            await page.click(f'#tDecoSeg [data-v={d}]'); await page.wait_for_timeout(250)
            g = await ev(GLYPHS, 620)
            ok = word(g, 'BLOIS') is not None and await page.is_visible('#hitTitle')
            check(ok, f'{d} : titre tracé, zone de prise présente')
        gv = await ev(GLYPHS, 620); tv = word(gv, 'BLOIS')
        check(tv and abs(abs(tv[5]) - math.pi / 2) < 0.01, f'vertical : titre pivoté d\'un quart de tour ({tv and tv[5]:.2f})')
        await page.click('#tDecoSeg [data-v=cachet]'); await page.wait_for_timeout(250)
        gc = [g for g in await ev(GLYPHS, 620) if g[2].lower() != paper]
        rots = {round(g[5], 2) for g in seq(gc)}
        check(len(rots) >= 4, f'cachet : lettres du titre en couronne (orientations distinctes : {len(rots)})')

        # ---------- Médaillon : arc ----------
        await st("S.mix.compo='med'; S.mix.shape='circle'; S.mix.pos='bas'; M.zone={title:'illus',foot:'illus'}; M.free=null; M.pos='hc'; M.fpos='hc';"); await page.wait_for_timeout(300)
        check('arc' in await vis('tDecoSeg'), 'médaillon rond : arc proposé')
        await page.click('#tDecoSeg [data-v=arc]'); await page.wait_for_timeout(300)
        ga = [g for g in await ev(GLYPHS, 620) if g[2].lower() != paper]; geo = await ev("(()=>{ const g=__cms.geom(__cms.st,620,877); return {y:g.map.y/877, cx:(g.map.x+g.map.w/2)/620}; })()")
        letters = seq(ga)
        check(len(letters) == 5 and all(g[4] < geo['y'] for g in letters), f'arc : lettres du titre au-dessus du médaillon {[round(g[4], 3) for g in letters]} < {geo["y"]:.3f}')
        check(len({round(g[5], 2) for g in letters}) == 5 and abs(sum(g[3] for g in letters) / 5 - geo['cx']) < 0.03, 'arc : lettres courbées, centrées sur le médaillon')
        check('titre déborde' not in await page.text_content('#textWarn'), 'arc : pas d\'alerte de débordement sur la carte')
        check(await ev("CMS.illus.hitInfo.title.fixed") and await page.evaluate("document.getElementById('hitTitle').classList.contains('fixed')"), 'arc : zone de prise fixe (il suit la carte)')
        await page.click('#tPosSeg button[data-v=bc]'); await page.wait_for_timeout(300)
        gb = [g for g in await ev(GLYPHS, 620) if g[2].lower() != paper]; lb = seq(gb)
        check(lb and all(g[4] > geo['y'] + 0.2 for g in lb), 'arc : position en bas de la grille → sous le médaillon')
        await st("S.mix.compo='hb'"); await page.wait_for_timeout(300)
        check('arc' not in await vis('tDecoSeg') and 'sans effet' in await page.text_content('#tDecoNote'), 'Haut/bas : arc masqué, choix gardé et signalé sans effet')
        check(await ev("CMS.illus.decoOf('title')") == 'libre', 'arc sans médaillon : rendu en texte seul')

        # ---------- Vignette : une présentation pose le bloc sur la carte ----------
        await st("S.mix.compo='vig'; M.zone={title:'illus',foot:'illus'}; M.deco={title:'libre',foot:'libre'}; M.pos='hc'; M.fpos='auto';"); await page.wait_for_timeout(300)
        check(await page.text_content('#tZoneSeg [data-v=illus]') == 'Dans la bande', 'vignette : zone « Dans la bande »')
        await page.click('#tDecoSeg [data-v=cachet]'); await page.wait_for_timeout(300)
        check(await ev("[__cms.st.illusText.mix.zone.title, CMS.illus.decoOf('title')]") == ['map', 'cachet'], 'vignette : cachet → titre posé sur la carte')
        gk = [g for g in await ev(GLYPHS, 620) if g[2].lower() != paper]; band = await ev("__cms.geom(__cms.st,620,877).band.y/877")
        check(seq(gk) and all(g[4] < band for g in seq(gk)), 'vignette : titre sur la carte, hors de la bande')
        check(word(gk, 'Là où') is not None, 'vignette : lignes du bas restées dans la bande')

        # ---------- Mises en page prêtes ----------
        await st("S.mix.compo='hb'; M.deco={title:'libre',foot:'libre'}; M.zone={title:'illus',foot:'illus'};"); await page.wait_for_timeout(300)
        names = await ev("[...document.querySelectorAll('#textPresets button')].map(b=>b.textContent)")
        check('Bandeau à la jonction' in names and 'Titre en arc sur le médaillon' not in names, f'mises en page prêtes selon la composition {names}')
        await page.click('#textPresets button:has-text("Bandeau à la jonction")'); await page.wait_for_timeout(300)
        m = await ev("__cms.st.illusText.mix")
        check(m['deco']['title'] == 'bandeau' and m['zone']['title'] == 'poster' and abs(m['free']['y'] - 0.5) < 0.01, f'« Bandeau à la jonction » : bandeau sur l\'affiche, à la séparation {m["free"]}')
        gj = await ev(GLYPHS, 620); tj = word(gj, 'BLOIS')
        check(tj and 0.44 < tj[4] < 0.6, f'bandeau à la jonction : titre à mi-hauteur {tj and tj[4]:.3f}')

        # ---------- Mode Carte ----------
        await ev("CMS.illus.setMode('map'); __cms.setLayout('classic',true); __cms.showTab('textes')"); await page.wait_for_timeout(400)
        check(await page.is_hidden('#tZoneSeg'), 'Carte : pas de choix de zone')
        check('hors du gabarit' in await page.text_content('#tDecoNote'), 'Carte : note « une présentation pose le bloc sur l\'affiche »')
        await page.click('#tDecoSeg [data-v=cartouche]'); await page.wait_for_timeout(400)
        mp = await ev("__cms.st.illusText.map")
        check(mp['pos'] == 'hc' and mp['deco']['title'] == 'cartouche', f'Carte : Cartouche → titre sorti du gabarit, en haut au centre {mp["pos"]}')
        gm = await ev(GLYPHS, 620)
        check(len(words(gm, 'BLOIS')) == 1 and word(gm, 'BLOIS')[4] < 0.25, 'Carte : titre en cartouche en haut de l\'affiche, tracé une fois')
        check(await ev("__cms.st.illusText.mix.deco.title") == 'bandeau', 'présentations propres à chaque type d\'affiche')
        check('arc' not in await vis('tDecoSeg'), 'gabarit Cadre : pas d\'arc')
        await ev("__cms.setLayout('medallion',true)"); await page.wait_for_timeout(300)
        check('arc' in await vis('tDecoSeg'), 'gabarit Médaillon : arc proposé')
        await page.click('#tDecoSeg [data-v=arc]'); await page.click('#tPosSeg button[data-v=mc]'); await page.wait_for_timeout(300)
        gm2 = await ev(GLYPHS, 620); mt = await ev("__cms.geom(__cms.st,620,877).map.y/877")
        lm = seq(gm2)
        check(lm and all(0 < g[4] < mt for g in lm), f'Médaillon, arc au milieu : au-dessus de la carte (le gabarit garde le bas) {[round(g[4], 3) for g in lm]}')
        await ev("__cms.setLayout('typo',true)"); await page.wait_for_timeout(300)
        check(await vis('tDecoSeg') == ['libre'], 'gabarit Lettres : aucune présentation pour le titre')
        await ev("__cms.setLayout('classic',true)")

        # ---------- Illustration ----------
        await ev("CMS.illus.setMode('illus')"); await page.wait_for_timeout(300)
        await page.click('#tDecoSeg [data-v=capsule]'); await page.wait_for_timeout(300)
        gi = await ev(GLYPHS, 620); ti = word(gi, 'BLOIS')
        check(ti and ti[2].lower() == paper, f'Illustration, capsule : lettres couleur papier sur la plaque pleine {ti and ti[2]}')
        check(await ev("__cms.st.illusText.deco.title") == 'capsule' and await page.is_hidden('#textPresets'), 'Illustration : présentation propre, pas de mise en page prête')

        # Enregistrement : l'état normalisé garde présentations et zones
        rt = await ev("normState(JSON.parse(JSON.stringify(__cms.st))).illusText")
        check(rt['deco']['title'] == 'capsule' and rt['map']['deco']['title'] == 'arc' and rt['mix']['zone']['title'] == 'poster', 'enregistrement : présentations et zones conservées')

        # ---------- Trait des plaques (Plus de réglages) ----------
        STROKES = """async ()=>{ const s=[], f=CanvasRenderingContext2D.prototype.strokeRect;
          CanvasRenderingContext2D.prototype.strokeRect=function(...a){ s.push([String(this.strokeStyle),this.lineWidth,this.getLineDash().length]); return f.apply(this,a); };
          try{ const r=await __cms.composePoster(620,877); r.canvas.width=0; } finally{ CanvasRenderingContext2D.prototype.strokeRect=f; } return s; }"""
        await page.click('#fDecoSeg [data-v=cartouche]'); await page.wait_for_timeout(300)
        sr = await ev(STROKES)
        check(len(sr) == 1 and all(x[2] == 0 for x in sr), f'par défaut : cartouche encadré d\'un seul trait plein {sr}')
        await page.click('#textMore summary'); await page.wait_for_timeout(200)
        await page.click('#plateLineSeg [data-v=double]'); await page.click('#swPlate [data-v="#B5654B"]')
        await page.fill('#sPlateW', '2'); await page.dispatch_event('#sPlateW', 'input'); await page.wait_for_timeout(300)
        check(await ev("JSON.stringify(__cms.st.illusText.plate)") == '{"line":"double","w":2,"color":"#B5654B","gap":1}', 'trait : double, × 2, terracotta enregistrés')
        sr2 = await ev(STROKES)
        check(len(sr2) == 2 and all(x[0].lower() == '#b5654b' for x in sr2) and sr2[0][1] > sr[0][1] * 1.5, f'trait double, épais, à la couleur choisie {sr2}')
        await page.click('#plateLineSeg [data-v=dashed]'); await page.wait_for_timeout(200)
        check(all(x[2] > 0 for x in await ev(STROKES)), 'tirets : trait discontinu')
        await page.click('#plateLineSeg [data-v=none]'); await page.wait_for_timeout(200)
        check(await ev(STROKES) == [] and await page.is_hidden('#sPlateW'), 'aucun trait : épaisseur et couleur masquées')
        check(await page.text_content('#chg-textMore') == '1 modifié', 'section repliée : réglage modifié compté')

        # ---------- Ordre des lignes ----------
        names = lambda: ev("[...document.querySelectorAll('#lineOrderList li span')].map(s=>s.textContent)")
        check(await names() == ['Titre', 'Sous-titre', 'Dédicace', 'Noms', 'Date', 'Coordonnées'] and await page.is_hidden('#bOrderReset'), 'Illustration : ordre affiché, titre puis bloc du bas')
        await page.click('#lineOrderList button[aria-label="Monter : Sous-titre"]'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.lineOrder") == ['subtitle', 'title', 'dedication', 'names', 'date', 'coords'], 'Monter : sous-titre avant le titre')
        check(await ev("document.activeElement.getAttribute('aria-label')") == 'Descendre : Sous-titre', 'focus : reste sur la ligne déplacée')
        go = await ev(GLYPHS, 620); sub, tit = word(go, 'VAL'), word(go, 'BLOIS')
        check(sub and tit and sub[4] < tit[4], 'Illustration : sous-titre au-dessus du titre')
        await page.click('#lineOrderList button[aria-label="Monter : Coordonnées"]'); await page.wait_for_timeout(300)
        go = await ev(GLYPHS, 620)
        d, c = word(go, 'Le 23'), word(go, '47.')
        check(d and c and c[3] < d[3] and abs(c[4] - d[4]) < 0.002, 'coordonnées avant la date, sur la même ligne')
        await ev("CMS.illus.setMode('map'); __cms.setLayout('classic',true)"); await ev("__cms.st.illusText.map.pos='auto'; __cms.st.illusText.map.fpos='auto'; drawOver()"); await page.wait_for_timeout(400)
        await page.click('#lineOrderList button[aria-label="Descendre : Titre"]'); await page.click('#lineOrderList button[aria-label="Monter : Dédicace"]'); await page.wait_for_timeout(300)
        go = await ev(GLYPHS, 620); t, s2, de = word(go, 'BLOIS'), word(go, 'VAL'), word(go, 'Là où')
        check(t and s2 and de and de[4] < s2[4] < t[4], f'gabarit Cadre : lignes du cartouche dans l\'ordre choisi {[x and round(x[4], 3) for x in (de, s2, t)]}')
        await ev("__cms.setLayout('souvenir',true)"); await page.wait_for_timeout(800)
        check(await page.is_visible('#dep-order'), 'gabarit Souvenir : ordre signalé sans effet')
        await page.click('#bOrderReset'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.lineOrder") is None and await page.is_hidden('#dep-order'), 'Ordre du gabarit : ordre retiré')
        await page.click('#bUndo'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.lineOrder") is not None, 'Annuler : ordre retrouvé')
        n = await ev("normState({lineOrder:['title','title','names','date','coords','dedication']}).lineOrder")
        check(n is None, 'état forgé : ordre invalide ignoré')

        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails

asyncio.run(main())
