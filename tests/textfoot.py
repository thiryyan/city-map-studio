"""e2e : gabarits du bloc du bas, marges des plaques, nouvelles présentations, loupe en mode Aperçu (issue #90).

Vérifie : mises en forme Classique (défaut, rendu inchangé), Ligne unique (une seule ligne), Souvenir (dédicace à gauche,
date et coordonnées à droite, filet), Carnet (aligné à gauche), Colonnes (date à gauche, coordonnées à droite) ; aperçu =
export ; Carte : une mise en forme sort le bloc du gabarit ; Vignette : note et bloc posé sur la carte ; éloignement du
trait (plaque plus grande) ; ruban retiré de l'interface, état ancien en Ruban ouvert en Capsule ; étiquette et filets
proposés aussi pour le bas ; loupe : molette, double toucher, déplacement borné, touches + − 0, rendu net (taille ≤ export),
un toucher ne quitte pas l'affiche agrandie, « Ajuster à l'écran », « Revenir aux réglages », rien de modifié ; aucune erreur.
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()   # site testé : dist/ (construit par run_all.py), ou CMS_ROOT
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
fails = []
GLYPHS = """async (W)=>{ const d=__cms.posterDims(), H=Math.round(W*d.H/d.W), seen=[], f=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(t,x,y){ const m=this.getTransform(); seen.push([String(t),this.font,String(this.fillStyle),(m.a*x+m.c*y+m.e)/W,(m.b*x+m.d*y+m.f)/H]); return f.apply(this,arguments); };
  try{ const r=await __cms.composePoster(W,H); r.canvas.width=0; } finally{ CanvasRenderingContext2D.prototype.fillText=f; } return seen; }"""


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


def word(glyphs, w):
    """Dernier tracé d'un texte commençant par w (le texte, après son ombre) : d'un bloc, ou lettre à lettre (interlettrage)"""
    found = [g for i, g in enumerate(glyphs) if g[0].startswith(w) or (len(g[0]) == 1 and ''.join(x[0] for x in glyphs[i:i + len(w)]) == w)]
    return found[-1] if found else None


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.add_init_script("try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.welcomed','1');localStorage.setItem('cms3.textMoreOpen','1')}catch(e){}")
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(('file:', 'blob:', 'data:')) else r.abort())
        await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
        await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX); await wait_js(page, "!!__cms.osmData", 5000)
        ev = page.evaluate
        await ev("CMS.illus.setMode('illus'); __cms.showTab('textes')"); await page.wait_for_timeout(400)

        # ---------- Gabarits du bloc du bas ----------
        chips = await ev("[...document.querySelectorAll('#fTplSeg button')].map(b=>b.dataset.v)")
        check(chips == ['classique', 'pile', 'ligne', 'souvenir', 'carnet', 'colonnes'] and await page.get_attribute('#fTplSeg [data-v=classique]', 'aria-pressed') == 'true',
              f'mises en forme proposées, Classique par défaut {chips}')
        g0 = await ev(GLYPHS, 620); d0, n0, t0 = word(g0, 'Là où'), word(g0, 'Alice'), word(g0, 'Le 23')
        check(d0 and n0 and t0 and d0[4] < n0[4] < t0[4] and abs(d0[3] - n0[3]) < 0.1, 'Classique : lignes empilées et centrées (rendu inchangé)')
        await page.click('#fTplSeg [data-v=pile]'); await page.wait_for_timeout(300)
        gp = await ev(GLYPHS, 620); dp, np_, tp, cp = word(gp, 'Là où'), word(gp, 'Alice'), word(gp, 'Le 23'), word(gp, '47.')
        check(dp and np_ and tp and cp and dp[4] < np_[4] < tp[4] < cp[4] and abs(dp[3] - np_[3]) < 0.1 and abs(tp[3] - cp[3]) < 0.1,
              'Empilé : dédicace, noms, date, puis coordonnées, chacune sur sa ligne')
        await page.click('#fTplSeg [data-v=ligne]'); await page.wait_for_timeout(300)
        g1 = await ev(GLYPHS, 620); d1, n1, t1 = word(g1, 'Là où'), word(g1, 'Alice'), word(g1, 'Le 23')
        check(d1 and n1 and t1 and abs(d1[4] - n1[4]) < 0.003 and abs(n1[4] - t1[4]) < 0.003 and d1[3] < n1[3] < t1[3], 'Ligne unique : dédicace, noms et date sur la même ligne')
        await page.click('#fTplSeg [data-v=souvenir]'); await page.wait_for_timeout(300)
        g2 = await ev(GLYPHS, 620); d2, n2, t2, c2 = word(g2, 'Là où'), word(g2, 'Alice'), word(g2, 'Le 23'), word(g2, '47.')
        check(d2 and n2 and t2 and c2 and d2[3] < n2[3] < t2[3] and abs(t2[3] + 0 - c2[3]) < 0.08 and t2[4] < c2[4], 'Souvenir : dédicace | noms à gauche, date sur coordonnées à droite')
        g2b = await ev(GLYPHS, 2480); d2b = word(g2b, 'Là où')
        check(d2b and abs(d2[3] - d2b[3]) < 0.004 and abs(d2[4] - d2b[4]) < 0.004, 'aperçu = export')
        await page.click('#fTplSeg [data-v=carnet]'); await page.wait_for_timeout(300)
        g3 = await ev(GLYPHS, 620); d3, n3 = word(g3, 'Là où'), word(g3, 'Alice')
        check(d3 and n3 and abs(d3[3] - n3[3]) < 0.002 and n3[4] < d3[4], 'Carnet : noms puis dédicace, alignés à gauche')
        await page.click('#fTplSeg [data-v=colonnes]'); await page.wait_for_timeout(300)
        g4 = await ev(GLYPHS, 620); d4, t4, c4 = word(g4, 'Là où'), word(g4, 'Le 23'), word(g4, '47.')
        check(d4 and t4 and c4 and t4[3] < 0.3 and c4[3] > 0.6 and 0.3 < d4[3] < 0.5, f'Colonnes : date à gauche, dédicace au centre, coordonnées à droite {[t4 and round(t4[3], 2), d4 and round(d4[3], 2), c4 and round(c4[3], 2)]}')
        check(await ev("normState(JSON.parse(JSON.stringify(__cms.st))).illusText.ftpl") == 'colonnes' and await ev("normState({illusText:{v:2,ftpl:'zz'}}).illusText.ftpl") == 'classique',
              'mise en forme enregistrée ; valeur inconnue → Classique')

        # ---------- Plaques : marges et éloignement, nouvelles présentations, ruban retiré ----------
        vis = lambda seg: ev(f"[...document.querySelectorAll('#{seg} button')].filter(b=>!b.hidden).map(b=>b.dataset.v)")
        check('ruban' not in await vis('tDecoSeg') and {'etiquette', 'capsule', 'filets'} <= set(await vis('tDecoSeg')), 'titre : étiquette, capsule, filets ; plus de ruban')
        check(await vis('fDecoSeg') == ['libre', 'cartouche', 'bandeau', 'etiquette', 'filets'], 'lignes du bas : étiquette et filets proposés')
        check(await ev("normState({illusText:{v:2,deco:{title:'ruban'},mix:{deco:{title:'ruban'}}}}).illusText.deco.title") == 'capsule', 'état ancien : Ruban ouvert en Capsule')
        await page.click('#fTplSeg [data-v=classique]'); await page.click('#tDecoSeg [data-v=cartouche]'); await page.wait_for_timeout(300)
        r1 = await ev("CMS.illus.hitInfo.title")
        await page.fill('#sPlateGap', '2'); await page.dispatch_event('#sPlateGap', 'input'); await page.wait_for_timeout(300)
        r2 = await ev("CMS.illus.hitInfo.title")
        check(await ev("__cms.st.illusText.plate.gap") == 2 and r2['w'] > r1['w'] + 0.03 and r2['h'] > r1['h'] + 0.02, f'éloignement × 2 : plaque plus grande ({r1["w"]:.3f} → {r2["w"]:.3f})')
        check(await page.text_content('#oPlateGap') == '× 2', 'éloignement affiché')
        # Fond des plaques : couleur, opacité ; encre lisible sur ce fond ; lien depuis la carte du bloc
        await page.evaluate("$('textMore').open=false")
        check(await page.is_visible('#bPlateOpts'), 'plaque choisie : lien « Fond, transparence et trait des plaques… »')
        await page.click('#bPlateOpts'); await page.wait_for_timeout(300)
        check(await ev("$('textMore').open"), 'lien : réglages des plaques ouverts')
        await page.click('#swPlateFill [data-v="#24365A"]'); await page.fill('#sPlateAlpha', '1'); await page.dispatch_event('#sPlateAlpha', 'input'); await page.wait_for_timeout(300)
        PX = """async ()=>{ const r=await __cms.composePoster(620,877), c=r.canvas.getContext('2d'), h=CMS.illus.hitInfo.title;
          const p=[...c.getImageData(Math.round((h.x+0.006)*620),Math.round((h.y+h.h/2)*877),1,1).data]; r.canvas.width=0; return p; }"""
        px = await ev(PX)
        check(abs(px[0] - 0x24) < 12 and abs(px[1] - 0x36) < 12 and abs(px[2] - 0x5A) < 12, f'fond bleu nuit opaque sous le titre {px[:3]}')
        gf = await ev(GLYPHS, 620); tf = word(gf, 'BLOIS')
        ratio = await ev("c=>contrast(c,'#24365A')", tf[2]) if tf else 0
        check(ratio >= 4.5, f'lettres lisibles sur le fond choisi ({tf and tf[2]}, {ratio:.1f}:1)')
        await page.fill('#sPlateAlpha', '0.3'); await page.dispatch_event('#sPlateAlpha', 'input'); await page.wait_for_timeout(300)
        px2 = await ev(PX)
        check(px2[:3] != px[:3] and await page.text_content('#oPlateAlpha') == '30 %', f'opacité 30 % : le fond laisse voir l\'image {px2[:3]}')
        check(await ev("normState({illusText:{v:2,plate:{fill:'zz',alpha:7}}}).illusText.plate.alpha") == 1, 'état forgé : opacité bornée')
        await page.click('#swPlateFill [data-v=auto]'); await page.fill('#sPlateAlpha', '0.92'); await page.dispatch_event('#sPlateAlpha', 'input')

        # ---------- Carte : une mise en forme sort le bloc du gabarit ; Vignette ----------
        await ev("CMS.illus.setMode('map'); __cms.setLayout('classic',true)"); await page.wait_for_timeout(300)
        check('hors du gabarit' in await page.text_content('#fTplNote'), 'Carte : note « pose ce bloc sur l\'affiche »')
        await page.click('#fTplSeg [data-v=ligne]'); await page.wait_for_timeout(300)
        check(await ev("[__cms.st.illusText.map.fpos, __cms.st.illusText.map.ftpl]") == ['bc', 'ligne'], 'Carte : Ligne unique → bloc posé en bas au centre')
        await ev("CMS.illus.setMode('mix'); __cms.st.mix.compo='vig'; __cms.st.illusText.mix.zone={title:'illus',foot:'illus'}; layoutPreview(); CMS.emit('state:synced')"); await page.wait_for_timeout(300)
        check('bande de la vignette' in await page.text_content('#fTplNote'), 'Vignette : note sur la bande')
        await page.click('#fTplSeg [data-v=carnet]'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.illusText.mix.zone.foot") == 'map', 'Vignette : mise en forme → bloc posé sur la carte')
        await ev("__cms.st.mix.compo='med'; CMS.illus.setMode('illus')"); await page.wait_for_timeout(300)

        # ---------- Loupe en mode Aperçu ----------
        st0 = await ev("JSON.stringify(__cms.st)")
        await page.click('#bClean'); await page.wait_for_timeout(400)
        box = await page.locator('#poster').bounding_box()
        await page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        await page.mouse.wheel(0, -600); await page.wait_for_timeout(300)
        z = await ev("CMS.clean.zoom")
        check(z > 1.5 and await ev("document.getElementById('app').classList.contains('zoomed')") and await page.is_visible('#bZoomFit'), f'molette : affiche agrandie (× {z:.2f}), commandes affichées')
        await wait_js(page, "CMS.clean.sharp", 20000)
        nat = await ev("[document.getElementById('zoomSharp').naturalWidth, __cms.exportSpec().W]")
        check(nat[0] > box['width'] * 1.5 and nat[0] <= nat[1], f'rendu net, sans dépasser la taille d\'export {nat}')
        await page.mouse.down(); await page.mouse.move(box['x'] + box['width'] / 2 + 5000, box['y'] + 10, steps=4); await page.mouse.up(); await page.wait_for_timeout(300)
        pr = await ev("(()=>{ const p=$('poster').getBoundingClientRect(), s=$('stage').getBoundingClientRect(); return [p.left-s.left, p.right-s.right]; })()")
        check(abs(pr[0]) < 1 and pr[1] > 0, f'déplacement borné : le bord de l\'affiche s\'arrête au bord de l\'écran {pr}')
        await page.mouse.click(box['x'] + 40, box['y'] + 40); await page.wait_for_timeout(500)
        check(await ev("__cms.ui.clean"), 'agrandie : un clic ne quitte pas l\'aperçu')
        await page.focus('#cleanExit'); await page.keyboard.press('0'); await page.wait_for_timeout(200)
        check(await ev("CMS.clean.zoom") == 1 and await page.is_hidden('#cleanZoom'), 'touche 0 : affiche ajustée à l\'écran')
        await page.keyboard.press('+'); await page.wait_for_timeout(200)
        check(await ev("CMS.clean.zoom") == 1.5, 'touche + : zoom')
        await page.click('#bZoomFit'); await page.wait_for_timeout(200)
        check(await ev("CMS.clean.zoom") == 1, '« Ajuster à l\'écran »')
        await page.mouse.dblclick(box['x'] + box['width'] / 2, box['y'] + box['height'] / 3); await page.wait_for_timeout(400)
        check(await ev("CMS.clean.zoom") == 2.5 and await ev("__cms.ui.clean"), 'double clic : zoom × 2,5, sans quitter')
        await page.click('#bZoomExit'); await page.wait_for_timeout(300)
        check(not await ev("__cms.ui.clean") and await ev("$('poster').style.transform") == '' and not await ev("!!document.getElementById('zoomSharp')"),
              '« Revenir aux réglages » : affiche rétablie, rendu net libéré')
        check(await ev("JSON.stringify(__cms.st)") == st0, 'loupe : aucun état modifié')
        await page.click('#bClean'); await page.wait_for_timeout(300)
        await page.mouse.click(box['x'] + 40, box['y'] + 40); await page.wait_for_timeout(600)
        check(not await ev("__cms.ui.clean"), 'hors zoom : un clic revient aux réglages')

        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails

asyncio.run(main())
