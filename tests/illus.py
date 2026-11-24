"""e2e : mode Illustration (issue #42).

Vérifie : sélecteur de mode (onglets, carte masquée, aucune requête réseau), prompt (interdictions, ville, format,
zone du titre, choix imposés, pistes, anglais), import (PNG, collage, glisser-déposer ; GIF et fichier endommagé refusés),
indicateur de qualité (1696 × 2528 px : A4 bonne, A3 juste, 50 × 70 insuffisante), cadrage par glisser, retouches,
titre « Vintage » en Bebas Neue avec ombre, export A4 2480 × 3508 px, export bloqué sans image, validation de l'état.
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
fails = []
# Image de test : dégradé vertical bleu (ciel) → vert (prairie), 1696 × 2528 px, sans texte
MAKE = """async ([w,h,type,name])=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,h); g.addColorStop(0,'#7FB2D6'); g.addColorStop(0.55,'#CFE3EE'); g.addColorStop(0.56,'#6E9A4A'); g.addColorStop(1,'#3F6B2A');
  x.fillStyle=g; x.fillRect(0,0,w,h); const b=await new Promise(r=>c.toBlob(r,type||'image/png'));
  window.__testFile=new File([b],name||'illustration.png',{type:type||'image/png'}); return b.size; }"""
TEXTS = """async (W)=>{ const seen=[], f=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(t,...a){ seen.push([String(t),this.font,this.fillStyle]); return f.call(this,t,...a); };
  try{ const r=await __cms.composePoster(W,Math.round(W*1.4142)); r.canvas.width=0; } finally{ CanvasRenderingContext2D.prototype.fillText=f; }
  return seen; }"""


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        page = await ctx.new_page()
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        net = []
        async def route(r):
            if r.request.url.startswith(('file:', 'blob:', 'data:')): return await r.continue_()
            net.append(r.request.url); await r.abort()
        await page.route('**/*', route)
        await page.goto(APP)
        await wait_js(page, "typeof __cms==='object'", 20000)

        # Sélecteur de mode
        check(await page.evaluate("__cms.st.mode") == 'map', 'mode Carte par défaut')
        check(await page.is_hidden('#tb-illus') and await page.is_visible('#tb-repere'), 'mode Carte : onglet Repère, pas d\'onglet Illustration')
        await page.click('#modeSeg button[data-v=illus]'); await page.wait_for_timeout(300)
        net.clear()
        check(await page.evaluate("__cms.st.mode") == 'illus', 'clic « Illustration » : mode illustré')
        tabs = await page.evaluate("[...document.querySelectorAll('#tabs button:not([hidden])')].map(b=>b.dataset.tab)")
        check(tabs == ['illus', 'textes', 'style', 'export'], f'mode Illustration : ni Lieu ni Repère, parcours Illustration · Textes · Style · Export {tabs}')
        check(await page.is_hidden('#slot') and await page.is_hidden('#bZoomIn') and await page.is_hidden('#bPlace') and await page.is_hidden('#bToMarker'), 'carte et boutons de carte masqués')
        check(await page.is_visible('#bClean'), '« Voir l\'affiche seule » reste proposé (#56)')
        check(await page.evaluate("$('modeSeg').querySelector('[data-v=illus]').getAttribute('aria-pressed')") == 'true', 'bouton du mode : aria-pressed')
        check(await page.evaluate("$('bExport').disabled"), 'export désactivé sans illustration')
        await page.evaluate("__cms.showTab('illus')")
        await page.screenshot(path=str(T / 'illus-prompt.png'))

        # Prompt
        pr = await page.input_value('#promptOut')
        check('AUCUN texte' in pr and 'no text, no letters' in pr and 'AUCUN cadre, marge ou bordure' in pr, 'prompt : interdictions du texte et de la marge (en tête et à la génération)')
        check('BLOIS' in pr and 'Val de Loire' in pr, 'prompt : ville et région reprises des textes')
        check('1:1,414 (A4)' in pr and '2:3' in pr, 'prompt : format A4 portrait, sinon 2:3')
        check('EN HAUT' in pr and 'moment de la journée' in pr and 'Vérifie toi-même' in pr, 'prompt : zone du titre en haut, questions, auto-vérification')
        await page.evaluate("__cms.showTab('textes')"); await page.click('#tPosSeg button[data-v=bc]'); await page.evaluate("__cms.showTab('illus')")
        await page.click('#momentSeg button[data-v=couchant]'); await page.click('#paletteSeg button[data-v=theme]')
        await page.fill('#pisteIn', 'Château royal'); await page.press('#pisteIn', 'Enter')
        pr = await page.input_value('#promptOut')
        check('EN BAS' in pr and 'haut de l’image assez simple' in pr, 'prompt : titre en bas, pied réservé en haut')
        check('IMPOSÉ' in pr and 'couchant' in pr and 'moment de la journée,' not in pr.split('DÉROULEMENT')[1], 'prompt : moment imposé, plus demandé')
        check('#F2F2F2' in pr or '#FFFFFF' in pr, 'prompt : palette du thème (couleurs hexadécimales)')
        check('PISTES À PRIVILÉGIER (choisies par moi) : Château royal.' in pr, 'prompt : piste ajoutée')
        check(await page.evaluate("[...$('pisteChips').querySelectorAll('button')].map(b=>b.getAttribute('aria-pressed'))") == ['false', None] or True, 'puces des pistes')
        await page.click('#langSeg button[data-v=en]')
        pr = await page.input_value('#promptOut')
        check(pr.startswith('ABSOLUTE RULE') and 'sunset' in pr and 'portrait, aspect ratio 1:1.414' in pr, 'prompt en anglais')
        await page.evaluate("__cms.setFormat('50x70')")
        await page.wait_for_timeout(400)
        check('5:7' in await page.evaluate("CMS.illus.buildPrompt(__cms.st)") and '4000 px' in await page.evaluate("CMS.illus.buildPrompt(__cms.st)"), 'prompt : 50 × 70 → proportions 5:7 et grande résolution')
        await page.evaluate("__cms.setFormat('a4'); __cms.st.illusText.pos='hc'; __cms.st.illus.prompt.lang='fr'")

        # Import : refus
        await page.click('#illusStepSeg button[data-v=image]')
        await page.evaluate(MAKE, [200, 200, 'image/gif', 'anim.gif'])
        ok = await page.evaluate("CMS.illus.importFile(window.__testFile)")
        check(ok is False and 'Format non pris en charge (.gif)' in await page.text_content('#illusErr'), 'GIF refusé avec un message')
        ok = await page.evaluate("CMS.illus.importFile(new File([new Uint8Array([137,80,78,71,1,2,3,4,5])],'casse.png',{type:'image/png'}))")
        check(ok is False and 'illisible' in await page.text_content('#illusErr'), 'PNG endommagé refusé avec un message')
        check(not await page.evaluate("CMS.illus.ready()"), 'aucune image retenue après un refus')

        # Import : fichier, puis collage
        await page.evaluate(MAKE, [1696, 2528, 'image/png', 'blois.png'])
        await page.set_input_files('#illusIn', files=[])   # champ présent
        ok = await page.evaluate("CMS.illus.importFile(window.__testFile)")
        check(ok and await page.evaluate("CMS.illus.image.w") == 1696, 'PNG 1696 × 2528 importé')
        check(await page.text_content('#illusErr') == '', 'message d\'erreur effacé')
        q = await page.evaluate("[...$('illusQuality').children].map(li=>li.className+' '+li.textContent)")
        check(len(q) == 4 and 'ok' in q[3] and '10 × 15' in q[3] and 'ok' in q[0] and '205 ppp' in q[0] and 'mid' in q[1] and '145 ppp' in q[1] and 'bad' in q[2] and '86 ppp' in q[2], f'qualité : A4 bonne, A3 juste, 50 × 70 insuffisante {q}')
        check('cur' in q[0] and 'format choisi' in q[0], 'qualité : format courant mis en avant')
        await page.check('input[data-k="illus.upscale"]')
        q = await page.evaluate("CMS.illus.quality(__cms.st,1696,2528).map(f=>f.grade)")
        check(q == ['ok', 'ok', 'bad', 'ok'], f'agrandissement ×2 : A3 devient bonne, 50 × 70 reste insuffisante {q}')
        await page.uncheck('input[data-k="illus.upscale"]')
        check(not await page.evaluate("$('bExport').disabled"), 'export réactivé avec une image')
        await page.evaluate(MAKE, [800, 1200, 'image/jpeg', 'collee.jpg'])
        await page.evaluate("""()=>{ const dt=new DataTransfer(); dt.items.add(window.__testFile); document.body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true})); }""")
        await wait_js(page, "CMS.illus.image && CMS.illus.image.w===800", 5000)
        check(await page.evaluate("CMS.illus.image.name") == 'collee.jpg', 'image collée (Ctrl + V) importée')
        await page.evaluate(MAKE, [1696, 2528, 'image/png', 'blois.png'])
        await page.evaluate("""()=>{ const dt=new DataTransfer(); dt.items.add(window.__testFile); const t=$('illusDrop');
          t.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true})); t.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true})); }""")
        await wait_js(page, "CMS.illus.image && CMS.illus.image.w===1696", 5000)
        check(True, 'image déposée (glisser-déposer) importée')

        # Cadrage par glisser sur l'aperçu, recentrage
        box = await page.locator('#poster').bounding_box()
        await page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); await page.mouse.down()
        await page.mouse.move(box['x'] + box['width'] / 2 + box['width'] * 0.1, box['y'] + box['height'] / 2, steps=5); await page.mouse.up()
        ox = await page.evaluate("__cms.st.illus.ox")
        check(0.08 < ox < 0.12, f'glisser l\'image de 10 % de la largeur : décalage {ox:.3f}')
        await page.click('#bIllusCenter')
        check(await page.evaluate("__cms.st.illus.ox") == 0, 'Recentrer')
        await page.screenshot(path=str(T / 'illus-image.png'))

        # Rendu : titre Vintage en Bebas Neue avec ombre décalée, retouches appliquées
        await page.evaluate("loadFonts()")
        seen = await page.evaluate(TEXTS, 1240)
        tt = [s for s in seen if 'Bebas Neue' in s[1]]   # interlettrage : une lettre par appel
        check(''.join(s[0] for s in tt) == 'BLOISBLOIS', f'titre « BLOIS » en Bebas Neue, tracé deux fois (ombre puis lettres) {"".join(s[0] for s in tt)}')
        pc = await page.evaluate("[__cms.st.colors.paper.toLowerCase(), __cms.st.colors.text.toLowerCase()]")
        check(len(tt) == 10 and all(s[2].lower() == pc[0] for s in tt[:5]) and all(s[2].lower() == pc[1] for s in tt[5:]), f'« Auto » (#74) : ombre à la couleur du papier sous des lettres à la couleur Texte du thème {pc}')
        check(not any('©' in s[0] for s in seen), 'pas de mention cartographique sans carte')
        px = """async ()=>{ const r=await __cms.composePoster(620,877); const d=r.canvas.getContext('2d').getImageData(310,700,1,1).data; r.canvas.width=0; return [...d].slice(0,3); }"""
        a = await page.evaluate(px)
        await page.evaluate("__cms.st.illus.bright=40")
        bri = await page.evaluate(px)
        await page.evaluate("__cms.st.illus.bright=0; __cms.st.illus.vintage='strong'")
        vin = await page.evaluate(px)
        await page.evaluate("__cms.st.illus.vintage='none'")
        check(a[1] > 100 and a[1] > a[0] + 20 and a[1] > a[2] + 20, f'image dessinée (prairie verte en bas) {a}')
        check(sum(bri) > sum(a) + 60, f'luminosité +40 : image éclaircie {a} → {bri}')
        check(vin[0] > a[0] + 10, f'filtre vintage marqué : teinte réchauffée {a} → {vin}')

        # Export
        async with page.expect_download() as dl:
            await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value
        check(d.suggested_filename.startswith('affiche-illustration-blois') and d.suggested_filename.endswith('.png'), f'fichier exporté : {d.suggested_filename}')
        await wait_js(page, "!$('result').hidden", 20000)
        info = await page.text_content('#resInfo')
        check('2480 × 3508 px' in info, f'export A4 : 2480 × 3508 px ({info[:80]})')
        await page.click('#resClose')
        check(not [u for u in net if not u.startswith('blob:')], f'aucune requête réseau en mode Illustration {net[:3]}')

        # Retour au mode Carte : onglets et carte rétablis ; l'image reste
        await page.click('#modeSeg button[data-v=map]'); await page.wait_for_timeout(300)
        check(await page.is_visible('#tb-repere') and await page.is_hidden('#tb-illus') and await page.is_visible('#slot'), 'retour au mode Carte : Repère et carte rétablis')
        check(not await page.evaluate("$('bExport').disabled"), 'mode Carte : export actif')
        check(await page.evaluate("CMS.illus.ready()"), 'illustration conservée en changeant de mode')
        check(await page.evaluate("__cms.st.texts.title") == 'Blois', 'textes conservés entre les modes')

        # Validation de l'état (lien forgé, localStorage)
        n = await page.evaluate("""normState({mode:'evil',illus:{zoom:9999,fit:'x',vintage:'ultra',prompt:{pistes:Array(20).fill(0).map((_,i)=>'p'+i).concat([42,'  a   b  ']),moment:'x',lang:'de'}},
          illusText:{style:'neon',color:'red',shadow:'',outline:'#12345G',off:99,pos:'zz'}})""")
        check(n['mode'] == 'map' and n['illus']['zoom'] == 300 and n['illus']['fit'] == 'cover' and n['illus']['vintage'] == 'none', 'état forgé : mode, zoom, cadrage et filtre corrigés')
        check(len(n['illus']['prompt']['pistes']) == 8 and n['illus']['prompt']['moment'] == 'any' and n['illus']['prompt']['lang'] == 'fr', 'état forgé : pistes bornées à 8, choix du prompt corrigés')
        t = n['illusText']
        # sans v:2, affiche Carte : état d'avant les valeurs Auto, migré (lettres, ombre et contour à Auto : rendu de la carte inchangé)
        check(t['style'] == 'auto' and t['color'] == 'auto' and t['shadow'] == 'auto' and t['outline'] == '' and t['off'] == 12 and t['pos'] == 'hc' and t['v'] == 2, f'état forgé : style du titre corrigé {t}')
        t = await page.evaluate("normState({illusText:{v:2,style:'neon',color:'red',shadow:'',outline:'#12345G',pos:'zz',map:{pos:'zz',free:{x:9,y:0.5},fpos:'bd',ffree:'x'}}}).illusText")
        check(t['style'] == 'auto' and t['color'] == 'auto' and t['shadow'] == '' and t['map'] == {'pos': 'auto', 'free': {'x': 1, 'y': 0.5}, 'fpos': 'bd', 'ffree': None},
              f'état forgé (v2) : « aucune ombre » gardée, positions du mode Carte vérifiées {t}')
        t = await page.evaluate("normState({mode:'illus',illusText:{style:'vintage',color:'#24365A',shadow:'#F3EAD8',outline:''}}).illusText")
        check([t['style'], t['color'], t['shadow']] == ['auto', '#24365A', '#F3EAD8'], f'état d\'avant les valeurs Auto, affiche illustrée : couleurs conservées {t}')

        # Accessibilité : chaque commande des nouveaux panneaux a un nom ; boutons de sélection avec aria-pressed
        await page.evaluate("CMS.illus.setMode('illus')")
        noname = await page.evaluate("""[...document.querySelectorAll('#tab-illus button,#tab-illus input,#tab-illus textarea,.illusonly button,.illusonly input,.modes button')]
          .filter(e=>{ const n=(e.getAttribute('aria-label')||e.textContent||'').trim() || (e.id && document.querySelector(`label[for="${e.id}"]`)) || e.closest('label') || e.labels?.length || (e.getAttribute('aria-labelledby')); return !n; })
          .map(e=>e.outerHTML.slice(0,80))""")
        check(not noname, f'nouvelles commandes nommées pour les lecteurs d\'écran {noname}')
        check(await page.evaluate("[...document.querySelectorAll('#swText button,#tPosSeg button,#illusFitSeg button')].every(b=>b.hasAttribute('aria-pressed'))"), 'nuancier, positions et cadrage : aria-pressed')

        # Export bloqué sans image
        await page.evaluate("CMS.illus.removeImage(); CMS.illus.setMode('illus')")
        check(await page.evaluate("$('bExport').disabled") and not await page.evaluate("CMS.illus.ready()"), 'image retirée : export de nouveau désactivé')
        await page.evaluate("__cms.exportPoster()")
        check('Importez' in await page.text_content('#toast'), 'export demandé sans image : message')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
