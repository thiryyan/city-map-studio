"""e2e : accessibilité clavier de la carte du moteur Fichier et des résultats de recherche (issue #37).

Vérifie : carte atteignable au clavier et nommée, flèches (Maj : plus loin), + / −, Entrée en mode placement ;
résultats en liste, focus sur le premier bouton, boutons décrits par leur lieu, annonce limitée au nombre de résultats,
Échap ferme la liste et rend le focus au champ, activation au clavier qui rend le focus au champ.
"""
import asyncio, json, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
NOMI = json.dumps([{'lat': '47.5861', 'lon': '1.3359', 'name': 'Château de Blois', 'display_name': 'Château de Blois, Blois, France'},
                   {'lat': '47.59', 'lon': '1.33', 'name': 'Cathédrale Saint-Louis', 'display_name': 'Cathédrale Saint-Louis, Blois, France'}])
fails = []


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
            u = r.request.url
            if u.startswith('file:'): return await r.continue_()
            if 'nominatim.openstreetmap.org' in u:
                return await r.fulfill(status=200, content_type='application/json', body=NOMI, headers={'Access-Control-Allow-Origin': '*'})
            await r.abort()
        await page.route('**/*', route)
        await page.goto(APP)
        await wait_js(page, "typeof __cms==='object'", 20000)
        await page.evaluate("f=>{__cms.setEngine('file',true); __cms.importText(f,'osm.json')}", FIX)
        await wait_js(page, "!!__cms.osmData", 5000)

        # ---------- Carte du moteur Fichier au clavier ----------
        a = await page.evaluate("(()=>{ const c=document.getElementById('vecCanvas'); return [c.tabIndex, c.getAttribute('role'), c.getAttribute('aria-label')||'']; })()")
        check(a[0] == 0 and a[1] == 'application' and 'Flèches' in a[2], f'carte atteignable au clavier et nommée {a[:2]}')
        await page.focus('#vecCanvas')
        c0 = await page.evaluate("({...__cms.st.center, z:__cms.st.zoom})")
        await page.keyboard.press('ArrowRight'); c1 = await page.evaluate("({...__cms.st.center})")
        await page.keyboard.press('Shift+ArrowUp'); c2 = await page.evaluate("({...__cms.st.center})")
        check(c1['lon'] > c0['lon'] and abs(c1['lat'] - c0['lat']) < 1e-12, 'flèche droite : carte déplacée vers l\'est')
        check(c2['lat'] > c1['lat'] and (c2['lat'] - c1['lat']) > 3 * abs(c1['lon'] - c0['lon']) * 0.5, 'Maj + flèche haut : déplacement plus grand vers le nord')
        await page.keyboard.press('+'); z1 = await page.evaluate("__cms.st.zoom")
        await page.keyboard.press('-'); z2 = await page.evaluate("__cms.st.zoom")
        check(abs(z1 - c0['z'] - 0.5) < 1e-9 and abs(z2 - c0['z']) < 1e-9, f'+ / − : zoom de 0,5 ({c0["z"]} → {z1} → {z2})')
        await page.evaluate("__cms.ui.placing=true"); await page.keyboard.press('Enter')
        m = await page.evaluate("[__cms.st.marker.lat-__cms.st.center.lat, __cms.st.marker.lon-__cms.st.center.lon]")
        check(abs(m[0]) < 1e-9 and abs(m[1]) < 1e-9, 'Entrée en mode placement : repère au centre de la carte')
        check(await page.evaluate("document.activeElement.id==='vecCanvas' && document.getElementById('vecCanvas').matches(':focus-visible')"), 'focus visible sur la carte')

        # ---------- Résultats de recherche ----------
        await page.evaluate("__cms.showTab('lieu')")
        await page.fill('#q', 'Blois'); await page.press('#q', 'Enter')
        await wait_js(page, "document.querySelectorAll('#results li.res').length===2", 5000)
        f = await page.evaluate("""(()=>{ const a=document.activeElement, d=document.getElementById(a.getAttribute('aria-describedby')||'');
          return {tag:a.tagName, txt:a.textContent, desc:d?d.textContent:'', status:document.getElementById('resultsStatus').textContent,
                  live:document.getElementById('results').hasAttribute('aria-live'), list:document.getElementById('results').tagName}; })()""")
        check(f['tag'] == 'BUTTON' and f['txt'] == 'Carte + repère', f'focus sur le premier bouton des résultats ({f["tag"]} {f["txt"]})')
        check('Château de Blois' in f['desc'], f'bouton décrit par son lieu ({f["desc"]})')
        check(f['status'] == '2 résultats pour « Blois ».' and not f['live'] and f['list'] == 'UL', f'annonce limitée au nombre de résultats, liste UL ({f["status"]})')
        check(await page.evaluate("[...document.querySelectorAll('#results button')].every(b=>b.getAttribute('aria-describedby'))"), 'tous les boutons décrits')
        await page.keyboard.press('Escape')
        check(await page.evaluate("document.querySelectorAll('#results li').length===0 && document.activeElement.id==='q'"), 'Échap : liste fermée, focus rendu au champ')
        await page.wait_for_timeout(400)   # validation répétée ignorée pendant 300 ms (anti-rebond)
        await page.press('#q', 'Enter')
        await wait_js(page, "document.querySelectorAll('#results li.res').length===2", 5000)
        await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')   # 2e résultat, « Carte + repère »
        await page.wait_for_timeout(200)
        r = await page.evaluate("[__cms.st.marker.lat, document.activeElement.id, document.getElementById('resultsStatus').textContent]")
        check(abs(r[0] - 47.59) < 1e-9 and r[1] == 'q' and 'repère placé' in r[2], f'activation au clavier : repère placé, focus rendu au champ, annonce ({r})')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
