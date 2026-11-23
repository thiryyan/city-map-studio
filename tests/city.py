"""e2e : moteur Fichier sur une ville réaliste (tests/city.json, généré par tests/make_city.py).

Une ville fictive de 6,4 × 5,2 km (fleuve en multipolygone à assembler avec deux îles, affluent, canal, étang ;
vieille ville organique et château, faubourgs, grand ensemble, pavillons, port, gare, quais, ponts, rocade, campagne ; ~18 500 bâtiments)
au format « nœuds + chemins à références », comme un export Overpass. Vérifie :
- import JSON et XML (.osm reconstitué) : mêmes objets, toutes les classes de voies, fleuve assemblé (1 + 2 anneaux) ;
- points de contrôle : eau au milieu du fleuve, chaussée au milieu du pont principal ;
- fluidité : construction du cache de tracés, puis déplacements (budgets larges, mesures affichées) ;
- export 2480 × 3508 en Souvenir et avec les pistes artistiques ; vignettes de contrôle tests/city-*.png.
Aucun accès réseau.
"""
import pathlib, os, asyncio, json, struct, subprocess, sys, base64
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
if not (T / 'city.json').exists(): subprocess.run([sys.executable, str(T / 'make_city.py')], check=True)
CITY = (T / 'city.json').read_text(); META = json.loads((T / 'city.meta.json').read_text())

# Couleur du pixel central d'une vue centrée sur un point (zoom 16), avec le thème courant
PIXEL = r"""([lat,lon])=>{ const st=__cms.st, w=800, h=800, c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
  x.fillStyle=st.colors.land; x.fillRect(0,0,w,h); drawVectors(x,{x:0,y:0,w,h},__cms.osmData,{center:{lat,lon},zoom:16,marker:st.marker});
  const d=x.getImageData(w/2-1,h/2-1,3,3).data; return '#'+[0,1,2].map(i=>Math.round((d[i]+d[16+i]+d[32+i])/3).toString(16).padStart(2,'0')).join('').toUpperCase(); }"""
near = lambda a, b, tol=40: all(abs(int(a[i:i + 2], 16) - int(b[i:i + 2], 16)) <= tol for i in (1, 3, 5))

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
        ev = page.evaluate

        # 1. Import JSON (nœuds + références) : objets, classes, fleuve assemblé
        t = await ev("f=>{ __cms.setEngine('file'); const t0=performance.now(); __cms.importText(f,'city.json'); return performance.now()-t0; }", CITY)
        await page.wait_for_timeout(400)
        s = await ev("""()=>{ const d=__cms.osmData, R=d.roads, river=d.water.reduce((a,f)=>f.rings.length>a.rings.length?f:a);
          const closed=r=>r[0][0]===r[r.length-1][0] && r[0][1]===r[r.length-1][1];
          return {count:d.count, buildings:d.buildings.length, water:d.water.length, lines:d.waterLines.map(f=>f.cls).sort().filter((v,i,a)=>a.indexOf(v)===i), parks:d.parks.length,
            rails:d.rails.length, railTunnel:d.rails.some(f=>f.tunnel), roadTunnel:Object.values(R).flat().some(f=>f.tunnel),
            classes:Object.fromEntries(Object.entries(R).map(([k,v])=>[k,v.length])), rings:river.rings.length, closed:river.rings.every(closed)}; }""")
        print('  import JSON', round(t), 'ms ·', s)
        check(s['buildings'] > 15000 and s['count'] > 18000, f'ville importée : {s["buildings"]} bâtiments, {s["count"]} objets ({round(t)} ms)')
        check(all(v > 0 for v in s['classes'].values()), f'toutes les classes de voies présentes {s["classes"]}')
        check(s['rings'] == 3 and s['closed'], f'fleuve : membres assemblés en un anneau extérieur et deux îles ({s["rings"]} anneaux fermés : {s["closed"]})')
        check(s['water'] >= 2 and s['lines'] == ['canal', 'river', 'stream'] and s['parks'] >= 5, f'eau (fleuve, étang), cours d\'eau {s["lines"]}, parcs ({s["parks"]})')
        check(s['railTunnel'] and s['roadTunnel'] and s['rails'] >= 4, 'voie ferrée (pont, tunnel) et passage routier en tunnel')

        # 2. Import XML (.osm reconstitué depuis le JSON) : mêmes objets
        x = await ev("""f=>{ const e=JSON.parse(f).elements, esc=v=>String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'), tg=t=>Object.entries(t||{}).map(([k,v])=>`<tag k="${esc(k)}" v="${esc(v)}"/>`).join('');
          const xml='<?xml version="1.0"?><osm version="0.6">'+e.map(o=>o.type==='node'?`<node id="${o.id}" lat="${o.lat}" lon="${o.lon}"/>`:o.type==='way'?`<way id="${o.id}">${o.nodes.map(n=>`<nd ref="${n}"/>`).join('')}${tg(o.tags)}</way>`
            :`<relation id="${o.id}">${o.members.map(m=>`<member type="way" ref="${m.ref}" role="${m.role}"/>`).join('')}${tg(o.tags)}</relation>`).join('')+'</osm>';
          const n=__cms.osmData.count, t0=performance.now(); __cms.importText(xml,'city.osm'); return {n, m:__cms.osmData.count, ms:performance.now()-t0, kb:xml.length>>10}; }""", CITY)
        check(x['m'] == x['n'], f'import XML ({x["kb"]} Ko, {round(x["ms"])} ms) : mêmes objets ({x["m"]} / {x["n"]})')

        # 3. Points de contrôle
        await ev("()=>{ const st=__cms.st; st.theme='souvenir'; st.colors={...__cms.THEMES.souvenir.c}; st.fx={}; st.layers={parks:true,buildings:true,rail:true}; }")
        c = await ev("__cms.st.colors")
        river = await ev(PIXEL, META['river']); bridge = await ev(PIXEL, META['bridge'])
        check(near(river, c['water']), f'milieu du fleuve : eau ({river}, attendu {c["water"]})')
        check(near(bridge, c['roadMajor'], 60), f'milieu du pont : chaussée au-dessus de l\'eau ({bridge}, attendu {c["roadMajor"]})')

        # 4. Fluidité du moteur Fichier : cache construit une fois, déplacements rapides
        perf = await ev("""()=>{ const st=__cms.st, d=__cms.osmData, w=420, h=560, c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
          const draw=()=>{ x.fillStyle=st.colors.land; x.fillRect(0,0,w,h); drawVectors(x,{x:0,y:0,w,h},d); };
          st.zoom=14; vecCache.delete(d); let t0=performance.now(); draw(); const build=performance.now()-t0;
          t0=performance.now(); for(let i=0;i<20;i++){ st.center={lat:st.center.lat,lon:st.center.lon+0.0006}; draw(); } const pan=(performance.now()-t0)/20;
          st.center={lat:st.center.lat,lon:st.center.lon-0.012}; st.zoom=12.5; vecCache.delete(d); t0=performance.now(); draw(); const wide=performance.now()-t0; st.zoom=14;
          return {build, pan, wide}; }""")
        print('  fluidité (ms) :', {k: round(v, 1) for k, v in perf.items()})
        check(perf['build'] < 5000 and perf['wide'] < 5000, f'cache de tracés construit en {perf["build"]:.0f} ms (zoom 14), {perf["wide"]:.0f} ms (vue large)')
        check(perf['pan'] < 200, f'déplacement : {perf["pan"]:.1f} ms par image')

        # 5. Vignettes de contrôle (revue visuelle) et exports pleine définition
        for k, js in (('souvenir', "__cms.applyAmbiance('souvenir')"), ('ancienne', "__cms.applyAmbiance('ancienne'); st.zoom=13.4"),
                      ('nuit', "__cms.applyAmbiance('nuit'); st.zoom=13.6"), ('lettres', "__cms.applyAmbiance('lettres'); st.zoom=13.6")):
            url = await ev(f"async()=>{{ const st=__cms.st; {js}; const r=await __cms.composePoster(620,877); return r.canvas.toDataURL('image/png'); }}")
            (T / f'city-{k}.png').write_bytes(base64.b64decode(url.split(',')[1]))
        await ev("()=>{ __cms.applyAmbiance('souvenir'); __cms.st.zoom=14; }")
        for name, js in (('Souvenir', ''), ('pistes artistiques', "__cms.st.fx={hatch:true,glow:true,waterlines:true,dots:true,parkHatch:true,riso:true,halo:true,quarter:true,foil:true}; __cms.st.orn={scale:true,compass:true,grid:true}; __cms.st.folds=true")):
            if js: await ev(f"()=>{{ {js} }}")
            t0 = await ev("performance.now()")
            async with page.expect_download(timeout=120000) as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
            d = await dl.value; path = str(T / 'city-export.png'); await d.save_as(path)
            secs = (await ev("performance.now()") - t0) / 1000
            w, h = struct.unpack('>II', open(path, 'rb').read()[16:24])
            check((w, h) == (2480, 3508), f'export {name} : {w} × {h} en {secs:.1f} s')
            await page.click('#resClose'); await page.wait_for_timeout(200)
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
asyncio.run(main())
