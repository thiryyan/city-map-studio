"""e2e : pistes artistiques (#effets) — moteur Fichier, sans réseau.

Vérifie, pour chaque nouvel effet de tracé (lueur, lignes d'eau, bâtiments pointillés, parcs hachurés, surimpression
riso, quartier en relief) : rendu modifié, et identique avec un cache de tracés neuf (motifs fixés au cadre) ;
couche du dessus (halo, dorure, ornements) ; gabarit Lettres ; papier Ancien et plis ; ciel (phase de la Lune,
oppositions des planètes, Voie lactée chargée à la demande) ; palette tirée d'une photo (calcul et interface) ;
ambiances (effets, ornements, plis fixés puis effacés) ; validation d'un état forgé ; export 2480 × 3508 avec tout activé.
"""
import pathlib, os, asyncio, base64
from playwright.async_api import async_playwright
from seed import seed
from jswait import wait_js
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()

OFF = "{hatch:false,outline:false,pencil:false,glow:false,waterlines:false,dots:false,parkHatch:false,riso:false,halo:false,quarter:false,foil:false}"
# Part des pixels qui diffèrent entre deux rendus de la carte seule (moteur Fichier), effet `fx` coupé puis activé
DIFF_FX = r"""([fx,w,h])=>{ const st=__cms.st, d=__cms.osmData;
  const draw=()=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
    x.fillStyle=st.colors.land; x.fillRect(0,0,w,h); drawVectors(x,{x:0,y:0,w,h},d); return x.getImageData(0,0,w,h).data; };
  st.fx=%s; const a=draw(); st.fx[fx]=true; const b=draw(); st.fx=%s;
  let n=0; for(let i=0;i<a.length;i+=4) if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8) n++;
  return n/(w*h); }""" % (OFF, OFF)
# Même vue tracée avec un cache construit sur une autre vue, puis avec un cache neuf (cf. tests/vectors.py)
SAME = r"""([fx,w,h])=>{ const st=__cms.st, d=__cms.osmData, lon=st.center.lon; st.fx=%s; st.fx[fx]=true;
  const draw=()=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
    x.fillStyle=st.colors.land; x.fillRect(0,0,w,h); drawVectors(x,{x:0,y:0,w,h},d); return x.getImageData(0,0,w,h).data; };
  vecCache.delete(d); draw(); st.center={lat:st.center.lat,lon:lon+0.005}; const a=draw(); vecCache.delete(d); const b=draw();
  st.center={lat:st.center.lat,lon}; st.fx=%s;
  let n=0; for(let i=0;i<a.length;i+=4) if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>24) n++;
  return n/(w*h); }""" % (OFF, OFF)
# Part des pixels de l'affiche complète (petit format) modifiés par une mise à jour de l'état
DIFF_POSTER = r"""async(js)=>{ const st=__cms.st, keep=JSON.stringify(st);
  const shot=async()=>{ const r=await __cms.composePoster(310,438); const d=r.canvas.getContext('2d').getImageData(0,0,310,438).data; return d; };
  const a=await shot(); (new Function('st',js))(st); const b=await shot();
  for(const k of Object.keys(st)) delete st[k]; Object.assign(st,JSON.parse(keep));
  let n=0; for(let i=0;i<a.length;i+=4) if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8) n++;
  return n/(310*438); }"""

async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        await seed(page, APP, wait=1300)
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        ev = page.evaluate

        # 1. Effets de tracé : visibles, et indépendants du cache (motifs et halos fixés au cadre)
        await ev("()=>{ const st=__cms.st; st.theme='souvenir'; st.colors={...__cms.THEMES.souvenir.c}; st.layers={parks:true,buildings:true,rail:true}; }")
        for fx, need in (('glow', 0.02), ('waterlines', 0.003), ('dots', 0.002), ('parkHatch', 0.002), ('riso', 0.01), ('quarter', 0.005)):
            d = await ev(DIFF_FX, [fx, 400, 500])
            check(d > need, f'effet {fx} : visible ({d:.3%} des pixels)')
            s = await ev(SAME, [fx, 400, 500])
            check(s < 0.0005, f'effet {fx} : rendu identique avec un cache neuf ({s:.4%})')
        # quartier en relief : suit le repère
        moved = await ev("""()=>{ const st=__cms.st, w=300, h=300, m={...st.marker}; st.fx.quarter=true;
          const draw=()=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); x.fillStyle=st.colors.land; x.fillRect(0,0,w,h); drawVectors(x,{x:0,y:0,w,h},__cms.osmData); return c.toDataURL(); };
          const a=draw(); st.marker={lat:m.lat+0.004,lon:m.lon}; const b=draw(); st.marker=m; st.fx.quarter=false; return a!==b; }""")
        check(moved, 'quartier en relief : suit le repère')

        # 2. Couche du dessus : halo, dorure, ornements (identiques avec les deux moteurs)
        for name, js, need in (('halo du souvenir', 'st.fx.halo=true', 0.05), ('dorure', "st.fx.foil=true", 0.001),
                               ('échelle graphique', 'st.orn.scale=true', 0.001), ('rose des vents', 'st.orn.compass=true', 0.002),
                               ('graduations', 'st.orn.grid=true', 0.002), ('papier Ancien', "st.texture='ancien'", 0.05), ('plis', 'st.folds=true', 0.002)):
            d = await ev(DIFF_POSTER, js)
            check(d > need, f'{name} : visible ({d:.2%} des pixels)')
        for lay in ('medallion', 'heart', 'arch', 'diptych', 'souvenir'):
            ok = await ev(f"""async()=>{{ const st=__cms.st, keep=JSON.stringify(st); __cms.setLayout('{lay}',true); st.orn={{scale:true,compass:true,grid:true}}; st.fx.halo=true; st.fx.foil=true;
              const r=await __cms.composePoster(248,351); for(const k of Object.keys(st)) delete st[k]; Object.assign(st,JSON.parse(keep)); __cms.setLayout(st.layout,true); return r.canvas.width===248; }}""")
            check(ok, f'ornements, halo et dorure : gabarit {lay}')
        foil_off = await ev("()=>{ const st=__cms.st; st.fx.foil=true; const c=document.createElement('canvas').getContext('2d'); drawMarker(c,10,10,10,markerOpts()); const f=foilCtx; st.fx.foil=false; return f; }")
        check(foil_off is None, 'dorure : limitée au rendu de l\'affiche (vignettes en couleur unie)')
        scale = await ev("()=>{ const st=__cms.st; return Math.round(metersPerPx({center:{lat:0,lon:0},zoom:14},800)*100)/100; }")
        check(abs(scale - 40075016.686 / (512 * 2 ** 14)) < 0.02, f'échelle : mètres par pixel à l\'équateur ({scale})')

        # 3. Gabarit Lettres : titre découpé dans la carte, cartouche sans le titre
        typo = await ev("""async()=>{ const st=__cms.st, keep=JSON.stringify(st); __cms.setLayout('typo',true); st.texts.title='Blois';
          const g=__cms.geom(st,2480,3508); const c=document.createElement('canvas').getContext('2d'); const f=typoFit(c,'BLOIS',g.map), f2=typoFit(c,'NEW YORK CITY',{w:900,h:1400});
          const d1=await __cms.composePoster(248,351), t1=d1.canvas.toDataURL(); st.texts.title='Lyon'; const t2=(await __cms.composePoster(248,351)).canvas.toDataURL();
          for(const k of Object.keys(st)) delete st[k]; Object.assign(st,JSON.parse(keep)); __cms.setLayout(st.layout,true);
          return {map:!!g.map && !!g.text, lines:f.lines.length, size:f.size, stacked:f2.lines.length, titleChanges:t1!==t2}; }""")
        check(typo['map'] and typo['lines'] == 1 and typo['size'] > 500, f'Lettres : une ligne, lettres géantes ({typo})')
        check(typo['stacked'] == 3, 'Lettres : un mot par ligne quand la carte est haute et étroite')
        check(typo['titleChanges'], 'Lettres : la découpe suit le titre')

        # 4. Ciel : Lune (phase), planètes (oppositions connues), Voie lactée à la demande
        sky = await ev("""()=>{ const ms=s=>Date.parse(s), sep=(a,b)=>{ const r=Math.PI/180; return Math.acos(Math.sin(a.dec*r)*Math.sin(b.dec*r)+Math.cos(a.dec*r)*Math.cos(b.dec*r)*Math.cos((a.ra-b.ra)*r))/r; };
          const nm=moonSun(ms('2024-04-08T18:18:00Z')), fm=moonSun(ms('2024-03-25T07:00:00Z')), q=moonSun(ms('2024-04-15T19:13:00Z'));
          const opp=(name,when)=>{ const t=ms(when), pl=planetsAt(t).find(p=>p.name===name); return sep(pl,moonSun(t).sun); };
          return {nm:nm.frac, fm:fm.frac, q:q.frac, wax:q.waxing, jup:opp('Jupiter','2023-11-03T05:00:00Z'), sat:opp('Saturne','2023-08-27T08:00:00Z'), mars:opp('Mars','2022-12-08T05:00:00Z'), eclipse:sep(nm.moon,nm.sun)}; }""")
        check(sky['nm'] < 0.02 and sky['eclipse'] < 3, f'Lune : nouvelle lune de l\'éclipse du 8 avril 2024 ({sky["nm"]:.3f}, {sky["eclipse"]:.1f}° du Soleil)')
        check(sky['fm'] > 0.98, f'Lune : pleine lune du 25 mars 2024 ({sky["fm"]:.3f})')
        check(0.4 < sky['q'] < 0.6 and sky['wax'], f'Lune : premier quartier du 15 avril 2024, croissante ({sky["q"]:.2f})')
        for k, n in (('jup', 'Jupiter'), ('sat', 'Saturne'), ('mars', 'Mars')):
            check(sky[k] > 175, f'{n} : à l\'opposé du Soleil à son opposition ({sky[k]:.1f}°)')
        await ev("()=>{ __cms.setLayout('sky',true); const s=__cms.st.sky; s.when='2023-07-28T23:30'; s.milky=true; drawUnder(); }")
        await wait_js(page, "!!window.SKY_MW && !!window.SKY_DATA", timeout=8000)
        mw = await ev("()=>SKY_MW.length===5 && SKY_MW.every(l=>l.length && l.every(r=>r.length%2===0))")
        check(mw, 'Voie lactée : chargée à la demande, cinq niveaux')
        d = await ev(DIFF_POSTER, "st.sky.milky=false; st.sky.moon=false; st.sky.planets=false")
        check(d > 0.002, f'ciel : Lune, planètes et Voie lactée dessinées ({d:.2%} des pixels)')
        await ev("()=>{ __cms.st.sky.milky=false; __cms.setLayout('souvenir',true); }")

        # 5. Palette tirée d'une photo
        pal = await ev("""()=>{ const D=new Uint8ClampedArray(64*64*4); for(let i=0;i<64*64;i++){ const red=i%64<20, dk=i%64>=56;
            D.set(red?[200,40,50,255]:dk?[25,30,40,255]:[245,240,228,255],i*4); }
          const p=paletteOf(D), L=photoTheme(p,false), Dk=photoTheme(p,true);
          return {n:p.length, light:[lum(L.paper),contrast(L.text,L.paper),contrast(L.roadMajor,L.land)], dark:[lum(Dk.paper),contrast(Dk.text,Dk.paper)],
            hex:Object.values(L).every(v=>/^#[0-9A-F]{6}$/.test(v)), redMarker:parseInt(L.marker.slice(1,3),16)>parseInt(L.marker.slice(5,7),16)+60}; }""")
        check(pal['n'] >= 3 and pal['hex'], f'palette : couleurs dominantes ({pal["n"]})')
        check(pal['light'][0] > 0.7 and pal['light'][1] >= 4.5 and pal['light'][2] >= 3, f'palette claire : papier clair, texte et rues lisibles {pal["light"]}')
        check(pal['dark'][0] < 0.1 and pal['dark'][1] >= 4.5, f'palette sombre : papier sombre, texte lisible {pal["dark"]}')
        check(pal['redMarker'], 'palette : repère dans la couleur la plus saturée')
        png = await ev("""()=>{ const c=document.createElement('canvas'); c.width=60; c.height=40; const x=c.getContext('2d');
          x.fillStyle='#F4F1E8'; x.fillRect(0,0,60,40); x.fillStyle='#1F6F8B'; x.fillRect(0,0,22,40); x.fillStyle='#2B2B2B'; x.fillRect(50,0,10,40); return c.toDataURL('image/png').split(',')[1]; }""")
        await page.click('#tb-style'); await page.wait_for_timeout(300)
        before = await ev("JSON.stringify(__cms.st.colors)")
        await page.set_input_files('#photoIn', files=[{'name': 'photo.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(png)}])
        await wait_js(page, "!document.getElementById('photoPal').hidden", timeout=5000)
        after = await ev("JSON.stringify(__cms.st.colors)")
        check(after != before and await ev("document.querySelectorAll('#photoSw i').length>=3"), 'palette : appliquée depuis l\'interface, nuancier affiché')
        await page.click('#photoSeg [data-v=dark]'); await page.wait_for_timeout(300)
        check(await ev("lum(__cms.st.colors.paper)<0.1"), 'palette : version sombre')

        # 6. Interface : commandes accessibles et liées à l'état
        for k in ('fx.glow', 'fx.waterlines', 'fx.dots', 'fx.parkHatch', 'fx.riso', 'fx.halo', 'fx.quarter', 'fx.foil', 'orn.scale', 'orn.compass', 'orn.grid', 'folds'):
            await page.click(f'label.tog:has(input[data-k="{k}"])'); await page.wait_for_timeout(120)
            on = await ev(f"__cms.st.{k}") if '.' in k else await ev(f"__cms.st['{k}']")
            await page.click(f'label.tog:has(input[data-k="{k}"])'); await page.wait_for_timeout(120)
            check(on is True, f'commande « {k} » : active l\'option')
        check(await ev("document.getElementById('sFocus').labels.length===1 && document.getElementById('oFocus').textContent.endsWith('%')"), 'rayon autour du repère : curseur nommé, valeur affichée')

        # 7. Ambiances : effets, ornements et plis fixés, puis effacés par une autre ambiance
        await page.click('#ambiances [data-v=ancienne]'); await page.wait_for_timeout(500)
        a = await ev("({fx:__cms.st.fx, orn:__cms.st.orn, folds:__cms.st.folds, tex:__cms.st.texture, lay:__cms.st.layout})")
        check(a['fx']['waterlines'] and a['orn']['compass'] and a['folds'] and a['tex'] == 'ancien' and a['lay'] == 'classic', f'ambiance « Carte ancienne » ({a})')
        await page.click('#ambiances [data-v=souvenir]'); await page.wait_for_timeout(500)
        a = await ev("({fx:Object.values(__cms.st.fx).some(Boolean), orn:Object.values(__cms.st.orn).some(Boolean), folds:__cms.st.folds})")
        check(not any(a.values()), f'ambiance « Souvenir » : effets, ornements et plis effacés ({a})')
        for k in ('gala', 'riso', 'lettres', 'quartier', 'nuit'):
            await page.click(f'#ambiances [data-v={k}]'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.fx.glow && !__cms.st.fx.quarter"), 'ambiance « Nuit en ville » : lueur')

        # 8. État forgé : valeurs inconnues ou hors bornes remplacées
        n = await ev("""()=>normState({fx:{glow:'oui',halo:true,evil:1}, focusR:999, orn:{grid:1,compass:true}, folds:'x', texture:'ancien', layout:'typo', sky:{moon:0,milky:true}})""")
        check(n['fx']['glow'] is False and n['fx']['halo'] is True and 'evil' not in n['fx'], 'état forgé : effets vérifiés un à un')
        check(n['focusR'] == 60 and n['orn'] == {'scale': False, 'compass': True, 'grid': False} and n['folds'] is False, 'état forgé : rayon borné, ornements et plis vérifiés')
        check(n['texture'] == 'ancien' and n['layout'] == 'typo' and n['sky']['moon'] is True and n['sky']['milky'] is True, 'état forgé : papier, gabarit et ciel reconnus')

        # 9. Style MapLibre : couches des effets
        sty = await ev("""()=>{ const st=__cms.st, keep=JSON.stringify(st.fx); st.fx={hatch:true,outline:false,pencil:true,glow:true,waterlines:true,dots:true,parkHatch:true,riso:true,halo:true,quarter:true,foil:true};
          const s=__cms.buildStyle(1,1,2); st.fx=JSON.parse(keep); const ids=s.layers.map(l=>l.id), L=id=>s.layers.find(l=>l.id===id);
          const w=s.layers.find(l=>l.id.startsWith('quarter-')).filter.find(x=>Array.isArray(x)&&x[0]==='within')[1].coordinates[0];
          return {glow:ids.filter(i=>i.startsWith('glow-')).length, wl:ids.filter(i=>/^water(way)?line-/.test(i)).length, quarter:ids.filter(i=>i.startsWith('quarter-')).length,
            plate:ids.indexOf('water-plate')>ids.indexOf('road-motorway-0'), noWater:!ids.includes('water'), dots:/^pat:dots:/.test(L('building').paint['fill-pattern']),
            cross:/^pat:cross:/.test(L('park').paint['fill-pattern']), hatch:/^pat:hatch:/.test(L('water-plate').paint['fill-pattern']), closed:JSON.stringify(w[0])===JSON.stringify(w[w.length-1]) && w.length===65,
            order:ids.indexOf('waterline-1')<ids.indexOf('park')}; }""")
        check(sty['glow'] == 24 and sty['wl'] == 10 and sty['quarter'] == 16, f'style GPU : lueur, lignes d\'eau, quartier ({sty})')
        check(sty['plate'] and sty['noWater'] and sty['dots'] and sty['cross'] and sty['hatch'] and sty['closed'] and sty['order'], f'style GPU : plaque riso, motifs, disque du quartier ({sty})')
        tiles = await ev("""()=>['hatch','dots','cross'].map(k=>{ const t=patTile(k,12,'#C9D9DE','#F2F2F2'); const d=t.getContext('2d').getImageData(0,0,12,12).data; const s=new Set(); for(let i=0;i<d.length;i+=4) s.add(d[i]+','+d[i+1]+','+d[i+2]); return t.width===12 && s.size>1; })""")
        check(all(tiles), f'motifs : trois tuiles dessinées {tiles}')

        # 10. Export pleine définition avec tout activé
        await ev("""()=>{ const st=__cms.st; st.fx={hatch:true,outline:false,pencil:true,glow:true,waterlines:true,dots:true,parkHatch:true,riso:true,halo:true,quarter:true,foil:true};
          st.orn={scale:true,compass:true,grid:true}; st.folds=true; st.texture='ancien'; __cms.setLayout('typo',true); }""")
        async with page.expect_download(timeout=120000) as dl: await page.click('#bExport')
        d = await dl.value; path = str(T / 'art-export.png'); await d.save_as(path)
        import struct
        w, h = struct.unpack('>II', open(path, 'rb').read()[16:24])
        check((w, h) == (2480, 3508), f'export avec tous les effets : {w} × {h}')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
asyncio.run(main())
