"""e2e : cache des tracés du moteur Fichier (#9).

Vérifie : un déplacement réutilise le cache (aucune reconstruction) ; un changement de zoom ou de
données le reconstruit ; le rendu d'une vue tracée avec un cache construit ailleurs est identique
au rendu avec un cache neuf ; seuls les carreaux visibles sont tracés ; tracés transparents
(tunnels) : un croisement n'est pas peint deux fois ; export aux bonnes dimensions.
Moteur Fichier avec les données de test : aucun accès réseau.
"""
import pathlib, os, asyncio, struct
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()

# Cache construit sur la vue d'origine, réutilisé sur une vue décalée, puis comparé à un cache neuf : part des pixels qui diffèrent
SAME = r"""([dlon, zoom, w, h])=>{ const st=__cms.st, d=__cms.osmData, lon=st.center.lon, z=st.zoom;
  st.zoom=zoom;
  const draw=()=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
    x.fillStyle=st.colors.land; x.fillRect(0,0,w,h); drawVectors(x,{x:0,y:0,w,h},d); return x.getImageData(0,0,w,h).data; };
  vecCache.delete(d); draw();                                    // cache construit sur la vue d'origine
  st.center={lat:st.center.lat,lon:lon+dlon}; const a=draw();    // réutilisé après le déplacement
  vecCache.delete(d); const b=draw();                             // cache neuf, construit sur la vue décalée
  st.center={lat:st.center.lat,lon}; st.zoom=z;
  let n=0; for(let i=0;i<a.length;i+=4) if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>24) n++;
  return n/(w*h); }"""

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

        # 1. Réutilisation : le cache de la vue courante sert pendant un déplacement
        builds = await ev("""async()=>{ const d=__cms.osmData, st=__cms.st, n0=vecCache.get(d)?.size||0; let made=0;
          const orig=Path2D; const keys=()=>[...(vecCache.get(d)||new Map()).keys()].join();
          const before=keys(); for(let i=1;i<=10;i++){ st.center={lat:st.center.lat,lon:st.center.lon+0.0004}; drawOp(); }
          const afterPan=keys(); st.zoom+=0.5; drawOp(); const afterZoom=keys(); st.zoom-=0.5;
          for(let i=1;i<=10;i++) st.center={lat:st.center.lat,lon:st.center.lon-0.0004}; drawOp();
          return {before, afterPan, afterZoom}; }""")
        check(builds['before'] and builds['before'] == builds['afterPan'], f'déplacement : cache réutilisé, aucune reconstruction ({builds["before"]})')
        check(builds['afterZoom'] != builds['afterPan'], 'changement de zoom : nouvelle entrée de cache')
        check(await ev("vecCache.get(__cms.osmData).size<=VEC_CACHE_MAX"), 'cache borné (quelques tailles au plus)')

        # 2. Identité : vue décalée avec le cache existant = même vue avec un cache neuf
        for dlon, zoom in ((0.006, 14), (-0.004, 15.5), (0.0, 13)):
            check(await ev(SAME, [dlon, zoom, 400, 500]) < 0.0005, f'vue décalée ({dlon:+}°, zoom {zoom}) : rendu identique avec un cache neuf')
        for fx in ('pencil', 'hatch', 'outline'):
            await ev(f"__cms.st.fx={{hatch:false,outline:false,pencil:false,{fx}:true}}")
            check(await ev(SAME, [0.005, 14.5, 400, 500]) < 0.0005, f'effet {fx} : rendu identique avec un cache neuf')
        await ev("__cms.st.fx={hatch:false,outline:false,pencil:false}")

        # 3. Élagage : carreaux visibles seulement ; données remplacées = cache distinct
        cells = await ev("""()=>{ const st=__cms.st, d=__cms.osmData; st.zoom=17; drawOp(); const P=[...vecCache.get(d).values()].pop();
          const all=P.buildings.length; st.zoom=14; drawOp(); return all; }""")
        check(cells > 4, f'bâtiments regroupés en carreaux ({cells} au zoom 17)')
        await ev("f=>__cms.importText(f,'osm.json')", FIX); await page.wait_for_timeout(300)
        check(await ev("vecCache.get(__cms.osmData).size") >= 1, 'nouvelles données : cache propre aux données')

        # 4. Tracés transparents (tunnels, 40 %) : deux rues de carreaux différents ne sont pas peintes deux fois au croisement
        # rues assez longues pour tomber dans des carreaux différents (coins bas-gauche éloignés de plus de VEC_CELL px)
        dark = await ev("""()=>{ const w=300,h=300, st=__cms.st; st.fx={hatch:false,outline:false,pencil:false}; st.stroke=2.5;
          const mk=(a,b)=>({type:'way',tags:{highway:'primary',tunnel:'yes'},geometry:a.map(([la,lo])=>({lat:la,lon:lo}))});
          const lat=st.center.lat, lon=st.center.lon, e=0.05;
          const d=__cms.parseOsm({elements:[mk([[lat,lon-e],[lat,lon+e]]),mk([[lat-e,lon],[lat+e,lon]])]});
          const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,w,h);
          drawVectors(x,{x:0,y:0,w,h},d);
          const px=(i,j)=>{ const g=x.getImageData(i-3,j-3,7,7).data; let m=255; for(let q=0;q<g.length;q+=4) m=Math.min(m,g[q]); return m; };   // pixel le plus sombre
          st.stroke=1;
          return [px(w/2,h/2), px(w/2+60,h/2)]; }""")
        check(dark[1] < 230 and abs(dark[0] - dark[1]) <= 8, f'tunnels : croisement de même teinte que la rue ({dark[0]} contre {dark[1]})')

        # 5. Export
        async with page.expect_download() as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value; path = str(T / 'vectors-export.png'); await d.save_as(path)
        w, h = struct.unpack('>II', open(path, 'rb').read()[16:24])
        check((w, h) == (2480, 3508), f'export {w} × {h}')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')
asyncio.run(main())
