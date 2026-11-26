"""e2e : itinéraire préparé avec une IA externe, puis GPX collé (issue #85, CMS.route).

- panneau « Préparer l'itinéraire avec une IA » : le prompt reprend les lieux de l'affiche (noms et coordonnées), le type de
  parcours, l'emprise et la consigne de format, et change aussitôt qu'un réglage change ;
- réponse complète d'une IA collée telle quelle (phrases + bloc ```xml) : importée, étapes nommées mémorisées ;
- texte sans GPX : message explicite, affiche inchangée ; bouton « Coller le GPX » (presse-papiers simulé) ;
- contrôle de vraisemblance : tracé à 50 km du lieu, tronçons rectilignes (« Pointillés » proposé) ;
- aucun appel réseau (CSP inchangée : connect-src sans nouvel hôte pour l'itinéraire).
"""
import asyncio, os, pathlib, re
from playwright.async_api import async_playwright
from jswait import wait_js
from seed import seed

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
fails = []


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


def walk(lat=47.5861, lon=1.3359, n=80, step=0.00012):
    """Balade réaliste : points rapprochés (une dizaine de mètres) autour du lieu"""
    return ''.join(f'<trkpt lat="{lat + i * step:.6f}" lon="{lon + (i % 20) * step:.6f}"/>' for i in range(n))


REPLY = f'''Voici le tracé validé de votre balade à Blois :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="IA" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="47.586100" lon="1.335900"><name>Rencontre</name></wpt>
  <wpt lat="47.585600" lon="1.331100"><name>Château royal</name></wpt>
  <trk><name>Balade du premier rendez-vous</name><trkseg>{walk()}</trkseg></trk>
</gpx>
```

Le tracé suit les rues de la vieille ville. Bonne balade !'''

FAR = f'<gpx version="1.1"><trk><trkseg>{walk(47.95, 1.8)}</trkseg></trk></gpx>'   # Orléans : ~ 50 km
STRAIGHT = '<gpx version="1.1"><rte><rtept lat="47.5861" lon="1.3359"/><rtept lat="47.5861" lon="1.3559"/><rtept lat="47.5961" lon="1.3559"/></rte></gpx>'


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 760}, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errs, ext = [], []
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            u = r.request.url
            if u.startswith(('file:', 'blob:', 'data:')): return await r.continue_()
            ext.append(u.split('/')[2]); await r.abort()
        await page.route('**/*', route)
        await seed(page, APP, {'cityMapStudio.welcomed': '1'}, 300)
        await wait_js(page, "typeof __cms==='object'", 20000)
        if await page.evaluate("document.getElementById('consent').open"): await page.evaluate("document.getElementById('bConsentFile').click()")
        await page.evaluate("__cms.showTab('repere')"); await page.wait_for_timeout(200)
        n0 = len(ext)
        await page.wait_for_timeout(2600)   # fin de la période calme de l'historique au démarrage (main.js)
        # Deux lieux sur l'affiche
        await page.evaluate("__cms.st.markerLabel='Rencontre'; __cms.st.markers2=[{lat:47.5856,lon:1.3311,label:'Château'}]; __cms.st.marker={lat:47.5861,lon:1.3359}")
        await page.evaluate("document.getElementById('routeAi').open=true"); await page.wait_for_timeout(300)
        pr = lambda: page.evaluate("document.getElementById('routePromptOut').value")
        p0 = await pr()
        check('Rencontre : 47.586100, 1.335900' in p0 and 'Château : 47.585600, 1.331100' in p0, 'prompt : noms et coordonnées des deux lieux')
        check('balade à pied' in p0 and re.search(r"Emprise de la carte de l'affiche : latitude de 47\.\d{6}", p0) and 'unique bloc de code' in p0,
              'prompt : type de parcours, emprise et consigne de format')
        check(await page.evaluate("document.querySelectorAll('#rpPlaces input[type=checkbox]').length") == 2, 'étapes : lieux de l\'affiche proposés et cochables')
        await page.evaluate("document.querySelector('#rpKind button[data-v=\"bike\"]').click()")
        check('trajet à vélo' in await pr(), 'type de parcours changé : prompt mis à jour aussitôt')
        await page.evaluate("document.querySelector('#rpPlaces input').click()")
        check('Rencontre :' not in await pr(), 'lieu décoché : retiré du prompt')
        await page.evaluate("const x=document.getElementById('rpExtra'); x.value='Pont Jacques-Gabriel'; x.dispatchEvent(new Event('input'))")
        check('« Pont Jacques-Gabriel »' in await pr(), 'étapes libres reprises dans le prompt')
        await page.evaluate("document.querySelector('#rpLang button[data-v=\"en\"]').click()")
        check('keepsake poster' in await pr(), 'prompt en anglais')
        await page.evaluate("document.querySelector('#rpLang button[data-v=\"fr\"]').click(); document.querySelector('#rpKind button[data-v=\"walk\"]').click(); document.querySelector('#rpPlaces input').click()")

        # Texte sans GPX : message explicite, affiche inchangée
        toast = lambda: page.evaluate("document.getElementById('toast').textContent")
        await page.fill('#gpxText', 'Désolé, je ne peux pas générer de fichier GPX.')
        await page.evaluate("document.getElementById('bGpxImport').click()"); await page.wait_for_timeout(200)
        check('aucun bloc GPX trouvé dans le texte collé' in await toast(), f'texte sans GPX : message explicite ({await toast()})')
        check(await page.evaluate("__cms.st.route") is None, 'texte sans GPX : affiche inchangée')

        # Réponse complète d'une IA collée telle quelle
        await page.fill('#gpxText', REPLY)
        await page.evaluate("document.getElementById('bGpxImport').click()"); await page.wait_for_timeout(400)
        r = await page.evaluate("__cms.st.route")
        check(bool(r) and len(r['pts']) == 80 and r['name'] == 'Balade du premier rendez-vous', f'réponse d\'IA collée : tracé importé ({r and len(r["pts"])} points)')
        check(bool(r) and [w['name'] for w in r.get('wpts', [])] == ['Rencontre', 'Château royal'], 'étapes nommées mémorisées (route.wpts)')
        check('Itinéraire importé' in await toast() and await page.evaluate("document.getElementById('routeWarn').hidden"), 'tracé vraisemblable : aucun avertissement')
        check(await page.evaluate("document.getElementById('gpxText').value") == '', 'zone de texte vidée après import')
        # Annuler retrouve l'état précédent
        await page.wait_for_timeout(1500)
        await page.evaluate("__cms.undo()"); await page.wait_for_timeout(300)
        check(await page.evaluate("__cms.st.route") is None, 'Annuler : itinéraire collé retiré')
        await page.evaluate("__cms.redo()")

        # Tracé à 50 km du lieu
        await page.evaluate("__cms.st.route=null; __cms.st.center={lat:47.5861,lon:1.3359}; __cms.st.zoom=14")
        await page.fill('#gpxText', FAR); await page.evaluate("document.getElementById('bGpxImport').click()"); await page.wait_for_timeout(400)
        w = await page.evaluate("document.getElementById('routeWarn').textContent")
        check('loin du lieu de l\'affiche' in w and 'vérifiez les étapes' in w, f'tracé à 50 km : message adapté ({w})')

        # Tronçons rectilignes : message et « Pointillés » proposé
        await page.evaluate("__cms.st.route=null; __cms.st.center={lat:47.5861,lon:1.3359}; __cms.st.zoom=14; __cms.st.routeStyle.dash=false")
        await page.fill('#gpxText', STRAIGHT); await page.evaluate("document.getElementById('bGpxImport').click()"); await page.wait_for_timeout(400)
        w = await page.evaluate("document.getElementById('routeWarn').textContent")
        check('ligne droite' in w and 'loin' not in w, f'tracé rectiligne : message adapté ({w})')
        btn = await page.evaluate("document.querySelector('#toast button')?.textContent")
        check(btn == 'Pointillés', f'« Pointillés » proposé ({btn})')
        await page.evaluate("document.querySelector('#toast button').click()"); await page.wait_for_timeout(200)
        check(await page.evaluate("__cms.st.routeStyle.dash") and await page.evaluate("document.getElementById('routeDash').checked"), 'Pointillés appliqués')

        # Bouton « Coller le GPX » : presse-papiers simulé (lecture au toucher seulement)
        await page.evaluate("""(t)=>{ window.__reads=0; Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>{ window.__reads++; return t; }, writeText:async()=>{}}}); }""", REPLY)
        check(await page.is_visible('#bGpxPaste'), 'bouton « Coller le GPX » proposé quand l\'API existe')
        await page.evaluate("__cms.st.route=null"); await page.tap('#bGpxPaste'); await page.wait_for_timeout(400)
        check(await page.evaluate("window.__reads") == 1 and await page.evaluate("__cms.st.route?.pts?.length") == 80, 'presse-papiers : réponse d\'IA importée')

        # Copie du prompt
        await page.evaluate("document.getElementById('bCopyRoute').click()"); await page.wait_for_timeout(200)
        check('Prompt copié' in await toast(), 'prompt copié')
        # État : réglages du prompt enregistrés et validés
        rp = await page.evaluate("__cms.st.routePrompt")
        check(rp['kind'] == 'walk' and rp['extra'] == 'Pont Jacques-Gabriel' and rp['off'] == [], f'réglages du prompt dans l\'état {rp}')
        check(len(ext) == n0, f'aucun appel réseau pour l\'itinéraire {ext[n0:]}')
        csp = await page.evaluate("document.querySelector('meta[http-equiv=Content-Security-Policy]').content")
        cs = re.search(r'connect-src ([^;]+)', csp).group(1).split()
        check(cs == ["'self'", 'https://tiles.openfreemap.org', 'https://nominatim.openstreetmap.org', 'https://fr.wikipedia.org'], f'connect-src : aucun hôte pour l\'itinéraire {cs}')
        await page.screenshot(path=str(T / 'routeai.png'), full_page=False)
        check(not errs, f'aucune erreur de page {errs[:2]}')
        for e in errs: print('PAGEERROR', e)
        await b.close()
    print('OK' if not fails else f'{len(fails)} échec(s)')
    return 1 if fails else 0

if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
