"""e2e : mêmes réglages de textes et de style dans les trois types d'affiche (issue #71).

Vérifie : polices dans l'onglet Textes, Vintage parmi les polices du titre (#72) ; onglet Style en Illustration :
ambiances, thème, papier, dorure (#73) ; mode Carte : rendu par défaut inchangé, Vintage, couleur, ombre et contour
appliqués aux lignes du gabarit, valeurs « Auto » qui suivent le thème et le type d'affiche, réglages communs (#74) ;
position des textes en mode Carte : « Dans le gabarit », 9 positions, bloc retiré du gabarit et posé sur l'affiche
(aperçu = export), glisser et clavier, gabarit Lettres, positions propres au mode (#75) ; migration d'un état ancien.
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
fails = []
# Textes tracés [texte, police, couleur, x, y] (x, y en fraction de l'affiche) par composePoster, pour un rendu de largeur W
GLYPHS = """async (W)=>{ const d=__cms.posterDims(), H=Math.round(W*d.H/d.W), seen=[], f=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(t,x,y){ const m=this.getTransform(); seen.push([String(t),this.font,String(this.fillStyle),(x+m.e)/W,(y+m.f)/H]); return f.apply(this,arguments); };
  try{ const r=await __cms.composePoster(W,H); r.canvas.width=0; } finally{ CanvasRenderingContext2D.prototype.fillText=f; } return seen; }"""
SNAP = "$('cvOver').toDataURL()"


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


def words(glyphs, w):
    """Tracés d'un mot : lettre à lettre (interlettrage) ou d'un seul bloc commençant par w ; premier glyphe de chacun"""
    return [g for i, g in enumerate(glyphs) if g[0].startswith(w) or (len(g[0]) == 1 and ''.join(x[0] for x in glyphs[i:i + len(w)]) == w)]


def word(glyphs, w):
    found = words(glyphs, w)
    return found[0] if found else None


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.textMoreOpen','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(('file:', 'blob:', 'data:')) else r.abort())
        await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
        await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX); await wait_js(page, "!!__cms.osmData", 5000)
        ev = page.evaluate
        await ev("__cms.setLayout('classic',true); __cms.st.texts.title='Blois'; loadFonts()"); await page.wait_for_timeout(400)

        # ---------- #72 : polices dans l'onglet Textes ----------
        await ev("__cms.showTab('textes')")
        check(all([await page.is_visible(q) for q in ('#duos', '#fontTitleSeg', '#fontSeg')]), 'Textes : duos, police du titre et police du texte')
        await ev("__cms.showTab('style')")
        check(not any([await page.is_visible(q) for q in ('#duos', '#fontTitleSeg', '#fontSeg')]), 'Style : plus aucune police')
        await ev("__cms.showTab('textes')")
        check(await ev("document.querySelector('#fontTitleSeg button').dataset.v") == '*vintage', 'Vintage : première option de la police du titre')
        PRESSED = "document.querySelector('#fontTitleSeg [aria-checked=true]')?.dataset.v"
        check(await ev(PRESSED) == '', 'Carte, style Auto : la police choisie est cochée, pas Vintage')

        # ---------- #74 : rendu Carte par défaut, puis Vintage, couleurs, ombre, contour ----------
        g0 = await ev(GLYPHS, 620); txt = await ev("__cms.st.colors.text")
        t0 = word(g0, 'BLOIS')
        check(t0 and 'Bebas' not in t0[1] and t0[2].lower() == txt.lower(), f'Carte par défaut : titre dans sa police, à la couleur du thème {t0 and t0[:3]}')
        check(len(words(g0, 'BLOIS')) == 1, 'Carte par défaut : titre tracé une fois (sans ombre)')
        base = await ev(SNAP)
        await page.click('#fontTitleSeg [data-v="*vintage"]'); await page.wait_for_timeout(400)
        check(await ev("__cms.st.illusText.style") == 'vintage' and await ev(PRESSED) == '*vintage', 'Vintage choisi et coché')
        g1 = await ev(GLYPHS, 620); t1 = word(g1, 'BLOIS')
        check(t1 and 'Bebas' in t1[1], f'Carte : titre du gabarit en Bebas Neue (Vintage) {t1 and t1[1]}')
        check(await ev(SNAP) != base, 'Vintage : aperçu modifié')
        await page.click('#swText [data-v="#B5654B"]'); await page.click('#swShadow [data-v="#C5A059"]'); await page.wait_for_timeout(300)
        g2 = await ev(GLYPHS, 620)
        bs = words(g2, 'BLOIS')
        check(len(bs) == 2 and bs[0][2].lower() == '#c5a059' and bs[1][2].lower() == '#b5654b', f'Carte : ombre dorée sous des lettres terracotta {[x[2] for x in bs]}')
        ded = [g for g in g2 if g[0].startswith('Là où')]
        check(len(ded) == 2 and ded[-1][2].lower() == '#b5654b', 'Carte : la dédicace prend aussi le style des textes')
        check(any('©' in g[0] and g[2].lower() != '#b5654b' for g in g2), 'mention des sources hors du style des textes')
        await page.click('#swOutline [data-v="#FFFFFF"]'); await page.wait_for_timeout(200)
        check(await ev(SNAP) != await ev("(()=>{ __cms.st.illusText.outline=''; drawOver(); const s=$('cvOver').toDataURL(); __cms.st.illusText.outline='#FFFFFF'; drawOver(); return s; })()"), 'Carte : contour des lettres dessiné')
        await page.click('#swOutline [data-v=""]')
        # « Auto » : couleur Texte du thème, suivie quand le thème change ; pastille Auto à cette couleur
        await page.click('#swText [data-v=auto]'); await page.click('#swShadow [data-v=auto]')
        await ev("__cms.showTab('style')"); await page.click('#themes .theme[data-v=onyx]'); await page.wait_for_timeout(300)
        g3 = await ev(GLYPHS, 620); ot = await ev("__cms.st.colors.text")
        bs = words(g3, 'BLOIS')
        check(len(bs) == 1 and bs[0][2].lower() == ot.lower(), f'« Auto » : lettres à la couleur Texte du nouveau thème, sans ombre en Carte {[x[2] for x in bs]}')
        sw = await ev("getComputedStyle(document.querySelector('#swText .sw.auto i')).backgroundColor")
        check(sw.replace(' ', '') == 'rgb(%d,%d,%d)' % tuple(int(ot[i:i + 2], 16) for i in (1, 3, 5)), f'pastille Auto à la couleur du thème ({sw})')
        # Réglages communs : Vintage choisi en Carte vaut aussi en Illustration ; « Auto » donne l'ombre du papier
        await ev("CMS.illus.setMode('illus')"); await page.wait_for_timeout(300)
        rs = await ev("CMS.illus.textStyle()")
        check(rs['vint'] and rs['shadow'] == await ev("__cms.st.colors.paper"), f'Illustration : même style (Vintage), ombre Auto = papier {rs}')

        # ---------- #73 : Style en Illustration ----------
        await ev("__cms.showTab('style')")
        vis = [await page.is_visible(q) for q in ('#ambiances', '#themes', '#textures', '[data-k="fx.foil"]')]
        hid = [await page.is_hidden(q) for q in ('#styleMore', '#layouts')]
        check(all(vis) and all(hid), f'Style (Illustration) : ambiances, thème, papier, dorure ; sans réglages de carte {vis} {hid}')
        await page.click('#ambiances [data-v=voyage]'); await page.wait_for_timeout(400)
        check(await ev("[__cms.st.theme, __cms.st.illusText.style]") == ['terracotta', 'auto'], 'ambiance en Illustration : thème appliqué, style du titre remis à Auto')

        # ---------- #75 : position des textes en mode Carte ----------
        await ev("CMS.illus.setMode('map'); __cms.setLayout('classic',true); __cms.showTab('textes')"); await page.wait_for_timeout(400)
        check(await page.is_visible('#tLayBtn') and await page.get_attribute('#tLayBtn', 'aria-pressed') == 'true', 'Carte : « Dans le gabarit » proposé et enfoncé')
        check(await page.text_content('#fAutoBtn') == 'Dans le gabarit', 'Carte : lignes du bas « Dans le gabarit »')
        check(await page.is_hidden('#hitTitle') and await page.is_hidden('#hitFoot'), 'textes dans le gabarit : aucune zone de prise')
        gA = await ev(GLYPHS, 620); tA = word(gA, 'BLOIS')
        await page.click('#tPosSeg button[data-v=hg]'); await page.wait_for_timeout(400)
        check(await ev("__cms.st.illusText.map.pos") == 'hg' and await ev("__cms.st.illusText.pos") == 'hc', 'position du mode Carte, distincte de celle des modes illustrés')
        gB = await ev(GLYPHS, 620); gC = await ev(GLYPHS, 2480)
        b1, b2 = word(gB, 'BLOIS'), word(gC, 'BLOIS')
        check(len(words(gB, 'BLOIS')) == 1, 'titre tracé une seule fois : retiré du gabarit')
        check(b1 and b1[3] < 0.2 and b1[4] < 0.25 and (b1[3], b1[4]) != (tA[3], tA[4]), f'titre en haut à gauche de l\'affiche {b1 and b1[3:]} (gabarit : {tA[3:]})')
        check(b2 and abs(b1[3] - b2[3]) < 0.003 and abs(b1[4] - b2[4]) < 0.003, 'aperçu = export (même place à toute taille)')
        check(word(gB, 'Là où') is not None, 'lignes du bas restées dans le gabarit')
        check(await page.is_visible('#hitTitle') and await page.is_hidden('#hitFoot'), 'zone de prise du seul titre déplacé')
        # Glisser le titre : position libre ; la carte ne bouge pas
        c0 = await ev("JSON.stringify(__cms.st.center)")
        await ev("CMS.intent.open('text')"); await page.wait_for_timeout(200)   # Modification, choix « Textes » (#82)
        hb = await page.locator('#hitTitle').bounding_box(); pb = await page.locator('#poster').bounding_box()
        await page.mouse.move(hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2); await page.mouse.down()
        await page.mouse.move(hb['x'] + hb['width'] / 2 + pb['width'] * 0.2, hb['y'] + hb['height'] / 2 + pb['height'] * 0.35, steps=8); await page.mouse.up()
        await page.wait_for_timeout(300)
        fr = await ev("__cms.st.illusText.map.free")
        check(fr is not None and fr['y'] > 0.3, f'titre glissé sur la carte : position libre {fr}')
        check(await ev("JSON.stringify(__cms.st.center)") == c0, 'glisser le titre ne déplace pas la carte')
        await page.focus('#hitTitle'); await page.keyboard.press('Home'); await page.wait_for_timeout(300)
        check(await ev("[__cms.st.illusText.map.pos, __cms.st.illusText.map.free]") == ['auto', None], 'clavier : Origine ramène le titre dans le gabarit')
        check(word(await ev(GLYPHS, 620), 'BLOIS')[3:] == tA[3:], 'titre revenu à sa place dans le gabarit')
        # Lignes du bas : 9 positions ; « Dans le gabarit » les y ramène
        await page.click('#fPosSeg button[data-v=hd]'); await page.wait_for_timeout(300)
        gD = await ev(GLYPHS, 620); d = word(gD, 'Là où')
        check(len(words(gD, 'Là où')) == 1 and d and d[4] < 0.3, f'lignes du bas en haut à droite, retirées du gabarit {d and d[3:]}')
        await page.click('#fAutoBtn'); await page.wait_for_timeout(200)
        check(await ev("__cms.st.illusText.map.fpos") == 'auto' and await page.is_hidden('#hitFoot'), 'lignes du bas revenues dans le gabarit')
        # Gabarit Lettres : le titre forme la carte et ne se déplace pas
        await ev("__cms.setLayout('typo',true); __cms.st.illusText.map.pos='bd'; scheduleOver()"); await page.wait_for_timeout(300)
        check(not await ev("CMS.illus.mapMoved().title") and await page.is_hidden('#hitTitle'), 'gabarit Lettres : titre non déplacé')
        await ev("__cms.setLayout('classic',true)")
        # État enregistré : positions du mode Carte persistées
        await wait_js(page, "JSON.parse(localStorage.getItem('cityMapStudio.v2')||'{}').illusText?.map?.pos==='bd'")
        check(await ev("normState(JSON.parse(localStorage.getItem('cityMapStudio.v2'))).illusText.map.pos") == 'bd', 'position du mode Carte enregistrée et relue (normState)')

        # ---------- Migration d'un état d'avant les valeurs Auto (affiche Carte) ----------
        n = await ev("normState({mode:'map',illusText:{style:'vintage',color:'#24365A',shadow:'#F3EAD8',outline:'#FFFFFF',off:4,pos:'hc'}}).illusText")
        check([n['style'], n['color'], n['shadow'], n['outline'], n['map']['pos']] == ['auto', 'auto', 'auto', '', 'auto'], f'ancien état Carte : style Auto, rendu de la carte inchangé {n}')

        check(not errs, f'aucune erreur de page {errs[:2]}')
        await b.close()
    print('échecs', fails); assert not fails

asyncio.run(main())
