"""e2e : attributions (issue #34).

Vérifie : mention minimale « © OpenStreetMap » toujours tracée sur l'affiche exportée (case « Mention complète » décochée),
mention complète quand la case est cochée (avec « © OpenMapTiles » pour le moteur Vectoriel GPU), attribution visible près
de la carte quel que soit l'onglet (liens rel=noopener), partie OpenMapTiles affichée seulement avec le moteur GPU.
Les textes tracés sont relevés en enveloppant CanvasRenderingContext2D.prototype.fillText pendant composePoster.
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
fails = []
TEXTS = """async (W)=>{ const seen=[], f=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(t,...a){ seen.push(String(t)); return f.call(this,t,...a); };
  try{ await __cms.composePoster(W,Math.round(W*1.414)); } finally{ CanvasRenderingContext2D.prototype.fillText=f; }
  return seen.filter(t=>t.includes('©')); }"""


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1200, 'height': 800})
        page = await ctx.new_page()
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            if r.request.url.startswith('file:'): return await r.continue_()
            await r.abort()
        await page.route('**/*', route)
        await page.goto(APP)
        await wait_js(page, "typeof __cms==='object'", 20000)
        await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX)
        await wait_js(page, "!!__cms.osmData", 5000)

        # Affiche : mention minimale case décochée, complète case cochée
        await page.evaluate("__cms.st.attribution=false")
        t = await page.evaluate(TEXTS, 600)
        check(t == ['© OpenStreetMap'], f'case décochée (moteur Fichier) : mention minimale tracée {t}')
        await page.evaluate("__cms.st.attribution=true")
        t = await page.evaluate(TEXTS, 600)
        check(t == ['© contributeurs OpenStreetMap'], f'case cochée (moteur Fichier) : mention complète {t}')
        await page.evaluate("__cms.st.engine='maplibre'; __cms.st.attribution=false")
        check(await page.evaluate("attributionText(false)") == '© OpenStreetMap · © OpenMapTiles', 'moteur GPU, case décochée : « © OpenStreetMap · © OpenMapTiles »')
        await page.evaluate("__cms.st.attribution=true")
        check('OpenFreeMap © OpenMapTiles' in await page.evaluate("attributionText(false)"), 'moteur GPU, case cochée : OpenFreeMap © OpenMapTiles')
        await page.evaluate("__cms.st.engine='file'")

        # Interface : attribution visible près de la carte, sur chaque onglet
        for tab in ['lieu', 'repere', 'textes', 'style']:
            await page.evaluate(f"__cms.showTab('{tab}')"); await page.wait_for_timeout(100)
            check(await page.is_visible('#mapCredit'), f'attribution visible près de la carte (onglet {tab})')
        check(await page.evaluate("[...document.querySelectorAll('#mapCredit a')].every(a=>a.rel.includes('noopener') && a.target==='_blank')"), 'liens d\'attribution rel=noopener')
        check(not await page.is_visible('#mcOmt'), 'moteur Fichier : pas de mention OpenMapTiles près de la carte')
        await page.evaluate("__cms.setEngine('maplibre')"); await page.wait_for_timeout(300)
        check(await page.is_visible('#mcOmt'), 'moteur GPU : mention OpenMapTiles près de la carte')
        check(await page.evaluate("__cms.buildStyle(1).sources.omt.attribution.includes('OpenMapTiles')"), 'style MapLibre : attribution déclarée sur la source')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
