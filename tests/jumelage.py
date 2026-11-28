"""e2e : contrôle de parité avec la version classique (#97, lot 6 : #104).

La même série d'affiches est rendue par la version classique (branche `classique`, scripts d'origine) et par cette
version (dist/, construite) : chaque affiche est composée à 620 × 877 px (composePoster, le chemin de l'export) avec les
données du moteur Fichier (tests/osm.json), puis comparée pixel par pixel (empreinte de l'image) et texte par texte
(textes tracés et leur police). Couvre : onze gabarits (portrait, paysage), seize thèmes, treize ambiances, repères,
papiers et plis, effets de tracé, ornements, calques, textes et lignes, lieux multiples, itinéraire, Ciel du jour J,
Lettres, Deux lieux ; modes Illustration et Carte + illustration (image importée, cinq compositions) ; formats et
dimensions d'export ; listes proposées (gabarits, thèmes, ambiances, polices, repères).

Version classique : dossier CMS_CLASSIC, sinon extraite de la branche git `origin/classique` (git archive).
"""
import asyncio, json, os, pathlib, subprocess, sys, tempfile
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()


def classic_root():
    if os.environ.get('CMS_CLASSIC'):
        return pathlib.Path(os.environ['CMS_CLASSIC']).resolve()
    d = pathlib.Path(tempfile.mkdtemp(prefix='cms-classique-'))
    arch = subprocess.run(['git', 'archive', 'origin/classique'], cwd=T.parent, capture_output=True)
    if arch.returncode:
        print('✗ branche origin/classique introuvable (git fetch origin classique) :', arch.stderr.decode()[:200]); sys.exit(1)
    subprocess.run(['tar', '-x', '-C', str(d)], input=arch.stdout, check=True)
    return d


# Rendu complet : empreinte des pixels et textes tracés [texte, police]
RENDER = """async ()=>{ const seen=[], f=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(t,...a){ seen.push([String(t),this.font]); return f.call(this,t,...a); };
  let sum=0; try{ const r=await __cms.composePoster(620,877), d=r.canvas.getContext('2d').getImageData(0,0,620,877).data;
    for(let i=0;i<d.length;i+=4) sum=(sum*31+d[i]+d[i+1]*3+d[i+2]*7)%1000000007; r.canvas.width=0; }
  finally{ CanvasRenderingContext2D.prototype.fillText=f; } return {sum, seen}; }"""
PNG = """async ()=>{ const c=document.createElement('canvas'); c.width=900; c.height=1270; const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,1270); g.addColorStop(0,'#7FB2D6'); g.addColorStop(0.6,'#F3E2B3'); g.addColorStop(1,'#3F6B2A');
  x.fillStyle=g; x.fillRect(0,0,900,1270); x.fillStyle='#8E3B2E'; x.beginPath(); x.arc(450,640,180,0,7); x.fill();
  const b=await new Promise(r=>c.toBlob(r,'image/png')); return [...new Uint8Array(await b.arrayBuffer())]; }"""
# Listes proposées par l'application
LISTS = """()=>({layouts:[...document.querySelectorAll('#layouts .card')].map(b=>b.dataset.v),
  themes:Object.keys(__cms.THEMES), ambiances:__cms.AMBIANCES.map(a=>a[0]), fonts:Object.keys(__cms.FONTS),
  marks:[...document.querySelectorAll('#marks .card')].map(b=>b.dataset.v), formats:[...document.querySelectorAll('#formatSeg button')].map(b=>b.dataset.v)})"""

LAYOUTS = ['souvenir', 'classic', 'fade', 'medallion', 'heart', 'arch', 'travel', 'polaroid', 'diptych', 'sky', 'typo']
SKY = {'when': '2023-09-23T22:00', 'tz': 120}
PLACE2 = {'center': {'lat': 47.59, 'lon': 1.34}, 'zoom': 14.5, 'marker': {'lat': 47.59, 'lon': 1.34}}


def scenarios(lists):
    S = []
    for lay in LAYOUTS:
        S.append((f'gabarit {lay}', {'layout': lay, 'sky': SKY, 'place2': PLACE2}))
    for lay in ['souvenir', 'classic', 'medallion', 'travel', 'diptych']:
        S.append((f'gabarit {lay} paysage', {'layout': lay, 'orient': 'landscape', 'place2': PLACE2}))
    for th in lists['themes']:
        S.append((f'thème {th}', {'layout': 'classic', 'theme': th, '__theme': th}))
    for m in lists['marks']:
        S.append((f'repère {m}', {'layout': 'classic', 'markerStyle': m}))
    for tx in ['grain', 'aquarelle', 'kraft', 'toile', 'ancien']:
        S.append((f'papier {tx}', {'texture': tx}))
    S.append(('plis', {'folds': True}))
    for fx in ['hatch', 'outline', 'pencil', 'glow', 'waterlines', 'dots', 'parkHatch', 'riso', 'halo', 'quarter', 'foil']:
        S.append((f'effet {fx}', {'layout': 'classic', 'fx': {fx: True}}))
    S.append(('ornements', {'layout': 'classic', 'orn': {'scale': True, 'compass': True, 'grid': True}}))
    S.append(('calques masqués', {'layers': {'parks': False, 'buildings': False, 'rail': False}}))
    S.append(('textes et tailles', {'layout': 'classic', 'texts': {'title': 'Périgueux', 'subtitle': 'Dordogne', 'dedication': 'Pour toujours, ici et ailleurs, ensemble', 'names': 'Léa & Tom', 'date': 'Le 1er juillet 2023'},
              'textScale': {'title': 130, 'dedication': 80}, 'coordFormat': 'dms', 'dedWrap': 'two', 'fontTitle': 'cinzel', 'font': 'fraunces'}))
    S.append(('lignes masquées', {'layout': 'souvenir', 'show': {'subtitle': False, 'names': False}}))
    S.append(('lieux numérotés', {'layout': 'classic', 'numbered': True, 'linkMarkers': True,
              'markers2': [{'lat': 47.588, 'lon': 1.332, 'label': 'Mariage'}, {'lat': 47.584, 'lon': 1.34, 'label': 'Maison'}], 'markerLabel': 'Rencontre'}))
    S.append(('itinéraire', {'layout': 'classic', 'route': {'name': 'Balade', 'show': True, 'pts': [[47.583, 1.33], [47.586, 1.334], [47.589, 1.338], [47.587, 1.342]]},
              'routeStyle': {'color': 'frame', 'width': 2, 'dash': True}}))
    for fmt in lists['formats']:
        S.append((f'format {fmt}', {'format': fmt}))
    for a in lists['ambiances']:
        S.append((f'ambiance {a}', {'__ambiance': a}))
    return S


ILLUS = [('Illustration', {'mode': 'illus'}), ('Illustration, titre en cartouche', {'mode': 'illus', 'illusText': {'deco': {'title': 'cartouche', 'foot': 'filets'}, 'pos': 'bc'}})] + \
        [(f'Carte + illustration {c}', {'mode': 'mix', 'mix': {'compo': c, 'shape': 'circle', 'pos': 'bas', 'split': 'half'}}) for c in ['med', 'vig', 'hb', 'cote', 'fondu']]


async def open_app(b, root, ns, png):
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
    page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
    url = (root / 'index.html').as_uri() + '?test'
    await page.goto(url)
    await page.evaluate("k=>{ for(const s of ['consent','welcomed']) localStorage.setItem(k+s,'1'); }", ns)
    await page.reload(); await page.wait_for_timeout(1200)
    await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX)
    await page.wait_for_timeout(500)
    base = await page.evaluate("JSON.stringify(__cms.st)")
    return page, errs, base


async def render(page, base, patch):
    p = dict(patch); amb = p.pop('__ambiance', None); p.pop('__theme', None)
    st = json.loads(base)
    for k, v in p.items():
        st[k] = {**st[k], **v} if isinstance(v, dict) and isinstance(st.get(k), dict) else v
    if 'theme' in patch:
        st['colors'] = await page.evaluate("t=>({...__cms.THEMES[t].c})", patch['theme'])
    await page.evaluate("s=>__cms.applyConfig(s,'')", st)
    if amb: await page.evaluate("a=>__cms.applyAmbiance(a)", amb)
    await page.wait_for_timeout(60)
    return await page.evaluate(RENDER)


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    croot = classic_root()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        cpage, cerr, cbase = await open_app(b, croot, 'cityMapStudio.', None)
        npage, nerr, nbase = await open_app(b, ROOT, 'cms3.', None)
        cl, nl = await cpage.evaluate(LISTS), await npage.evaluate(LISTS)
        for k in cl:
            check(cl[k] == nl[k], f'listes proposées identiques : {k} ({len(nl[k])})')
        same = 0; S = scenarios(nl); sums = set()
        for name, patch in S:
            a, c = await render(cpage, cbase, patch), await render(npage, nbase, patch)
            ok = a['sum'] == c['sum'] and a['seen'] == c['seen']; sums.add(c['sum'])
            if ok: same += 1
            else:
                diff = [x for x in a['seen'] if x not in c['seen']][:3] + [x for x in c['seen'] if x not in a['seen']][:3]
                check(False, f'{name} : rendu différent (pixels {a["sum"]} / {c["sum"]}, textes {diff})')
        check(same == len(S), f'affiches carte identiques au pixel près : {same}/{len(S)}')
        # Témoins : les scénarios donnent bien des affiches différentes, et un écart d'une couleur est détecté
        check(len(sums) >= len(S) * 0.75, f'témoin : {len(sums)} rendus distincts pour {len(S)} scénarios')
        a = await render(cpage, cbase, {'layout': 'classic'})
        c = await render(npage, nbase, {'layout': 'classic', 'colors': {'roadMinor': '#4A4A4B'}})
        check(a['sum'] != c['sum'], 'témoin : une teinte de rue changée d\'une unité est détectée')
        # Dimensions d'export de chaque format et orientation
        for fmt in nl['formats']:
            for o in ['portrait', 'landscape']:
                q = "([f,o])=>{ __cms.st.format=f; __cms.st.orient=o; const s=__cms.exportSpec(); return [s.W,s.H,s.dpi,s.mm]; }"
                check(await cpage.evaluate(q, [fmt, o]) == await npage.evaluate(q, [fmt, o]), f'export {fmt} {o} : mêmes dimensions')
        # Modes illustrés : même image importée dans les deux versions
        data = bytes(await npage.evaluate(PNG))
        for pg, base in ((cpage, cbase), (npage, nbase)):
            await pg.evaluate("s=>__cms.applyConfig({...JSON.parse(s), mode:'illus'},'')", base)
            await pg.evaluate("__cms.showTab('illus')"); await pg.click('#illusStepSeg button[data-v=image]')
            await pg.set_input_files('#illusIn', files=[{'name': 'jumelage.png', 'mimeType': 'image/png', 'buffer': data}])
            await wait_js(pg, "CMS.illus.ready()", 8000); await pg.wait_for_timeout(300)
        cimg, nimg = await cpage.evaluate("JSON.stringify(__cms.st)"), await npage.evaluate("JSON.stringify(__cms.st)")
        isame = 0
        for name, patch in ILLUS:
            a, c = await render(cpage, cimg, patch), await render(npage, nimg, patch)
            if a['sum'] == c['sum'] and a['seen'] == c['seen']: isame += 1
            else: check(False, f'{name} : rendu différent (pixels {a["sum"]} / {c["sum"]})')
        check(isame == len(ILLUS), f'affiches illustrées identiques au pixel près : {isame}/{len(ILLUS)}')
        check(not cerr and not nerr, f'aucune erreur de page (classique {cerr[:2]}, nouvelle {nerr[:2]})')
        await b.close()
    print('échecs', fails)
    print('OK' if not fails else 'ÉCHEC')
    raise SystemExit(1 if fails else 0)

asyncio.run(main())
