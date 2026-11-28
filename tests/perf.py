"""e2e : performance et netteté (issue #36).

Vérifie :
- carte GPU : épaisseurs en expressions de zoom, égales au calcul figé d'avant (zoomFactor) à plusieurs zooms ; aucun
  setStyle pendant les gestes ; aucun avertissement de validation du style MapLibre ;
- changement de devicePixelRatio sans redimensionnement : canevas de l'aperçu à la nouvelle densité ; pas de réallocation
  quand la taille ne change pas ;
- interlettrage par graphème : « é » décomposé et émoji composé tracés d'un bloc, largeur identique à textW.
"""
import asyncio, json, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent).resolve()   # site testé : source, ou dist/ (CI)
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
TILEJSON = json.dumps({'tilejson': '3.0.0', 'tiles': ['https://tiles.openfreemap.org/t/{z}/{x}/{y}.pbf'], 'minzoom': 0, 'maxzoom': 14})
CORS = {'Access-Control-Allow-Origin': '*'}
fails = []
# Évaluation d'une expression ['interpolate',['exponential',b],['zoom'],z0,v0,z1,v1] (valeurs numériques) à un zoom donné
EVAL = """(e,z)=>{ if(typeof e==='number') return e; const b=e[1][1], z0=e[3], v0=e[4], z1=e[5], v1=e[6];
  if(z<=z0) return v0; if(z>=z1) return v1; return v0+(v1-v0)*(Math.pow(b,z-z0)-1)/(Math.pow(b,z1-z0)-1); }"""


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 1200, 'height': 800}, device_scale_factor=1)
        page = await ctx.new_page()
        # Chromium sans interface n'émet pas « change » sur la requête (resolution: …) quand la densité est émulée : la requête
        # créée par watchDpr est relevée pour que le test émette l'événement lui-même après le changement de densité
        await page.add_init_script("const __mm=window.matchMedia; window.matchMedia=function(q){ const m=__mm.call(this,q); if(/resolution/.test(q)) window.__resMql=m; return m; };")
        await page.add_init_script("try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.welcomed','1')}catch(e){}")
        errs, warns = [], []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: warns.append(m.text) if m.type == 'warning' and 'MapLibre' in m.text and 'layers[' in m.text else None)

        async def route(r):
            u = r.request.url
            if u.startswith('file:'): return await r.continue_()
            if u.endswith('/planet'): return await r.fulfill(status=200, content_type='application/json', body=TILEJSON, headers=CORS)
            if 'tiles.openfreemap.org/t/' in u: return await r.fulfill(status=204, body=b'', headers=CORS)
            await r.abort()
        await page.route('**/*', route)
        await page.goto(APP)
        await wait_js(page, "typeof __cms==='object' && !!__cms.mlMap && __cms.mlMap.isStyleLoaded()", 20000)

        # 1. Épaisseurs : expressions de zoom = calcul figé (k = cadre/800 × trait × zoomFactor), pour toute vue
        r = await page.evaluate(f"""(()=>{{ const ev={EVAL}, st=__cms.st, w=__cms.ui.slotCss.w, off=Math.log2(w/800), z0=st.zoom, out=[];
          const live=__cms.mlMap.getStyle().layers.find(l=>l.id==='road-primary').paint['line-width'];
          for(const z of [9,11,12.5,13,14,15.2,16,17,19]){{ st.zoom=z; const k=w/800*st.stroke*Math.min(2,Math.max(0.5,Math.pow(2,(z-14)*0.5)));
            const fixed=__cms.buildStyle(k,w/800).layers.find(l=>l.id==='road-primary').paint['line-width'];
            out.push(Math.abs(ev(live,z+off)-fixed)/fixed); }}
          st.zoom=z0; return {{max:Math.max(...out), expr:Array.isArray(live)}}; }})()""")
        check(r['expr'] and r['max'] < 1e-9, f'épaisseurs en expression de zoom, identiques au calcul figé (écart relatif max {r["max"]:.1e})')

        # 2. Aucun setStyle pendant les gestes (déplacements et zooms)
        n = await page.evaluate("""async()=>{ const m=__cms.mlMap; let n=0; const f=m.setStyle.bind(m); m.setStyle=(...a)=>{ n++; return f(...a); };
          for(const [dx,dz] of [[40,0],[0,0.7],[-80,-0.4],[10,1.2]]){ m.jumpTo({center:[m.getCenter().lng+dx*1e-5,m.getCenter().lat],zoom:m.getZoom()+dz}); await new Promise(r=>setTimeout(r,80)); }
          m.setStyle=f; return n; }""")
        check(n == 0, f'gestes sur la carte GPU : aucun setStyle ({n})')
        q = await page.evaluate("""async()=>{ const st=__cms.st; st.fx={...st.fx,quarter:true}; __cms.mlMap.setStyle(__cms.buildStyle(1,1,1,st,{off:0})); await new Promise(r=>setTimeout(r,300));
          const m=__cms.mlMap; let n=0; const f=m.setStyle.bind(m); m.setStyle=(...a)=>{ n++; return f(...a); };
          const before=JSON.stringify(m.getFilter('quarter-primary')); m.jumpTo({zoom:m.getZoom()+1}); await new Promise(r=>setTimeout(r,200));
          const after=JSON.stringify(m.getFilter('quarter-primary')); m.setStyle=f; st.fx={...st.fx,quarter:false}; return {n, changed:before!==after}; }""")
        check(q['n'] == 0 and q['changed'], f'quartier en relief : disque mis à jour par setFilter, sans setStyle ({q})')
        check(not warns, f'style MapLibre valide (aucun avertissement) {warns[:2]}')

        # 3. Densité de pixels changée sans redimensionnement
        cdp = await ctx.new_cdp_session(page)
        w1 = await page.evaluate("[document.getElementById('cvOver').width, document.getElementById('poster').getBoundingClientRect().width]")
        await page.evaluate("""window.__alloc=0; for(const id of ['cvUnder','cvOver']){ const cv=document.getElementById(id), d=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'width');
          Object.defineProperty(cv,'width',{configurable:true,get(){return d.get.call(this)},set(v){ window.__alloc++; d.set.call(this,v); }}); }""")
        await page.evaluate("__cms.setSheet && __cms.setSheet(__cms.ui.sheet)"); await page.wait_for_timeout(300)
        await page.evaluate("dispatchEvent(new Event('resize'))"); await page.wait_for_timeout(300)
        check(await page.evaluate("window.__alloc") == 0, 'mise en page sans changement de taille : aucun canevas réalloué')
        await cdp.send('Emulation.setDeviceMetricsOverride', {'width': 1200, 'height': 800, 'deviceScaleFactor': 2, 'mobile': False})
        await wait_js(page, "devicePixelRatio===2", 5000)
        await page.evaluate("window.__resMql.dispatchEvent(new Event('change'))"); await page.wait_for_timeout(500)
        w2 = await page.evaluate("[document.getElementById('cvOver').width, document.getElementById('poster').getBoundingClientRect().width]")
        check(abs(w2[1] - w1[1]) < 1 and w2[0] == round(w2[1] * 2), f'densité 1 → 2 sans redimensionnement : canevas à la nouvelle densité ({w1} → {w2})')

        # 4. Interlettrage par graphème
        g = await page.evaluate("""(()=>{ const cv=document.createElement('canvas'), c=cv.getContext('2d'), seen=[], f=c.fillText.bind(c);
          c.fillText=(t,...a)=>{ seen.push(t); return f(t,...a); };
          const t='Cafe\\u0301 👩\\u200d❤\\ufe0f\\u200d👨', o={size:40,spacing:0.3,role:'title',key:'title'};
          const w=drawText(c,t,0,50,o), w2=textW(c,t,0.3,40);
          return {seen, w, w2}; })()""")
        lone = [s for s in g['seen'] if s in ('́', '‍', '️')]
        check(not lone and 'é' in g['seen'] and '👩‍❤️‍👨' in g['seen'], f'graphèmes tracés d\'un bloc ({len(g["seen"])} tracés, signes isolés : {lone})')
        check(abs(g['w'] - g['w2']) < 1e-9, 'largeur tracée = textW (centrage exact)')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
