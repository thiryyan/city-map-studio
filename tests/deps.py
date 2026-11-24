"""e2e : réglages dépendants d'un autre choix (issue #58).

Règle : masqué quand le réglage n'a aucun sens (rayon sans halo ni quartier, numéroter / relier sans second lieu ou en
« Deux lieux ») ; note d'une ligne et bouton de bascule quand il est activé mais empêché (parcs hachurés sans le calque,
bâtiments en contour ou pointillés sans le calque, pointillés sous le contour, lueur sur fond clair, sous-titre en Souvenir
ou Polaroid, itinéraire en Deux lieux). La bascule s'annule (historique) et les notes sont lisibles (contraste 4,5:1).
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
fails = []
GPX = ('<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><trkseg>'
       + ''.join(f'<trkpt lat="{47.586 + i * 0.0002}" lon="{1.333 + i * 0.0003}"/>' for i in range(40)) + '</trkseg></trk></gpx>')


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await b.new_page(viewport={'width': 1280, 'height': 900})
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)

        async def setk(k, v):   # comme un clic dans l'interface
            await page.evaluate("([k,v])=>{ const e=document.querySelector(`[data-k=\"${k}\"]`); e.checked=v; e.dispatchEvent(new Event('input',{bubbles:true})); }", [k, v])
            await page.wait_for_timeout(450)   # enregistrement et historique (300 ms de calme)
        shown = lambda id: page.evaluate(f"(()=>{{ const n=document.getElementById('dep-{id}'); return !!n && !n.hidden; }})()")
        text = lambda id: page.evaluate(f"document.getElementById('dep-{id}').textContent")
        async def act(id):
            await page.evaluate(f"document.querySelector('#dep-{id} button').click()"); await page.wait_for_timeout(450)
        visible = lambda k: page.evaluate(f"(()=>{{ const e=document.querySelector('[data-k=\"{k}\"]').closest('label,.slider'); return !e.hidden; }})()")
        st = lambda expr: page.evaluate(f"__cms.st.{expr}")

        await page.evaluate("__cms.showTab('style')")
        notes = await page.evaluate("[...document.querySelectorAll('.depnote')].filter(n=>!n.hidden).map(n=>n.id)")
        # Seule note attendue par défaut : le sous-titre (coché) que le gabarit Souvenir n'affiche pas ; elle remplace l'ancienne aide fixe
        check(notes == (['dep-subtitle'] if await st('layout') == 'souvenir' and await st('show.subtitle') else []), f'réglages par défaut : aucune note superflue {notes}')

        # Rayon autour du repère : masqué sans halo ni quartier
        check(not await visible('focusR'), 'rayon masqué sans halo ni quartier')
        await setk('fx.halo', True); check(await visible('focusR'), 'rayon visible avec le halo')
        await setk('fx.halo', False); await setk('fx.quarter', True); check(await visible('focusR'), 'rayon visible avec le quartier')
        await setk('fx.quarter', False)

        # Parcs hachurés sans le calque Parcs
        await setk('layers.parks', False); check(not await shown('parkHatch'), 'calque Parcs masqué, hachures décochées : pas de note')
        await setk('fx.parkHatch', True)
        check(await shown('parkHatch') and 'Parcs' in await text('parkHatch'), 'parcs hachurés sans le calque : note')
        await act('parkHatch')
        check(await st('layers.parks') and not await shown('parkHatch'), '« Afficher les parcs » : calque rétabli, note retirée')
        await page.evaluate('__cms.undo()'); await page.wait_for_timeout(450)
        check(not await st('layers.parks') and await shown('parkHatch'), 'bascule annulable (Annuler)')
        await setk('layers.parks', True); await setk('fx.parkHatch', False)

        # Bâtiments : contour et pointillés sans le calque, pointillés sous le contour
        await setk('fx.outline', True); await setk('layers.buildings', False)
        check(await shown('outline'), 'bâtiments en contour sans le calque : note')
        await act('outline'); check(await st('layers.buildings') and not await shown('outline'), '« Afficher les bâtiments » : calque rétabli')
        await setk('fx.dots', True)
        check(await shown('dots') and 'contour' in await text('dots'), 'pointillés sous le contour : note')
        await act('dots'); check(not await st('fx.outline') and not await shown('dots'), '« Retirer le contour » : pointillés visibles')
        await setk('fx.dots', False)

        # Lueur sur fond clair
        light = await page.evaluate("lum(__cms.st.colors.paper)>=0.3")
        await setk('fx.glow', True)
        check(light and await shown('glow'), 'lueur sur fond clair : note')
        await act('glow')
        hid = await page.evaluate("[...document.querySelectorAll('#themes .theme')].filter(t=>!t.hidden).every(t=>t.dataset.cat==='sombre')")
        check(hid, '« Voir les thèmes sombres » : seuls les thèmes sombres affichés')
        await page.evaluate("document.querySelector('#themes .theme:not([hidden])').click()"); await page.wait_for_timeout(450)
        check(not await shown('glow'), 'thème sombre choisi : note retirée')
        await setk('fx.glow', False)

        # Sous-titre : Souvenir et Polaroid ne l'affichent pas
        await page.evaluate("__cms.showTab('textes')")
        await setk('show.subtitle', True)
        for lay, n in [('souvenir', 'Souvenir'), ('polaroid', 'Polaroid')]:
            await page.evaluate(f"__cms.setLayout('{lay}')"); await page.wait_for_timeout(450)
            check(await shown('subtitle') and n in await text('subtitle'), f'sous-titre en {n} : note')
        await act('subtitle'); check(await st('layout') == 'classic' and not await shown('subtitle'), '« Passer au gabarit Cadre » : note retirée')
        check(await page.evaluate("!document.querySelector('#tab-textes').textContent.includes('Cadre, Fondu et Médaillon')"), 'ancienne aide statique retirée')

        # Plusieurs lieux : numéroter et relier masqués sans second lieu, et en Deux lieux
        await page.evaluate("__cms.showTab('repere')")
        check(not await visible('numbered') and not await visible('linkMarkers'), 'un seul lieu : numéroter et relier masqués')
        await page.evaluate("document.getElementById('bAddPlace').click()"); await page.wait_for_timeout(450)
        check(await visible('numbered') and await visible('linkMarkers'), 'second lieu ajouté : numéroter et relier proposés')
        await page.evaluate("__cms.setLayout('diptych')"); await page.wait_for_timeout(450)
        check(not await visible('numbered'), 'Deux lieux : numéroter et relier masqués')

        # Itinéraire en Deux lieux
        f = T / 'deps-test.gpx'; f.write_text(GPX)
        await page.set_input_files('#gpxIn', str(f)); await page.wait_for_timeout(600); f.unlink()
        check(await shown('route'), 'itinéraire en Deux lieux : note')
        await act('route'); check(await st('layout') == 'souvenir' and not await shown('route'), '« Passer au gabarit Souvenir » : note retirée')

        # Style de l'itinéraire : masqué quand l'itinéraire est masqué
        rvis = "(()=>[document.getElementById('routeColor'),document.getElementById('routeW').closest('.slider'),document.getElementById('routeDash').closest('label')].map(e=>!e.hidden))()"
        check(await page.evaluate(rvis) == [True, True, True], 'itinéraire affiché : couleur, épaisseur et pointillés proposés')
        await page.evaluate("document.getElementById('routeShow').click()"); await page.wait_for_timeout(450)
        check(await page.evaluate(rvis) == [False, False, False], 'itinéraire masqué : son style est masqué')
        await page.evaluate("document.getElementById('routeShow').click()"); await page.wait_for_timeout(450)

        # Taille du titre avec le gabarit Lettres
        check(not await shown('titleTypo'), 'gabarit Souvenir : pas de note sur la taille du titre')
        await page.evaluate("__cms.setLayout('typo')"); await page.wait_for_timeout(450)
        check(await shown('titleTypo') and 'Lettres' in await text('titleTypo'), 'gabarit Lettres : taille du titre sans effet, note')
        await act('titleTypo'); check(await st('layout') == 'classic' and not await shown('titleTypo'), '« Passer au gabarit Cadre » : note retirée')

        # Taille d'une ligne décochée
        await setk('show.date', False)
        check(not await shown('hidden-date'), 'date décochée, taille par défaut : pas de note')
        await page.evaluate("()=>{ const e=document.querySelector('[data-k=\"textScale.date\"]'); e.value=130; e.dispatchEvent(new Event('input',{bubbles:true})); }"); await page.wait_for_timeout(450)
        check(await shown('hidden-date') and 'date est masquée' in await text('hidden-date'), 'taille d\'une ligne décochée : note')
        await act('hidden-date'); check(await st('show.date') and not await shown('hidden-date'), '« L\'afficher » : ligne cochée, note retirée')

        # Contraste des notes
        await page.evaluate("__cms.setLayout('diptych')"); await page.wait_for_timeout(450)
        c = await page.evaluate("""(()=>{ const n=document.getElementById('dep-route'); const p=s=>s.match(/\\d+(\\.\\d+)?/g).slice(0,3).map(Number);
          const L=c=>{ const f=v=>{ v/=255; return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4; }; return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]); };
          let e=n, bg; while(e){ const b=getComputedStyle(e).backgroundColor; if(!/rgba\\(.*, 0\\)|transparent/.test(b)){ bg=p(b); break; } e=e.parentElement; }
          const a=L(p(getComputedStyle(n).color)), b=L(bg); return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05); })()""")
        check(c >= 4.5, f'note lisible : contraste {c:.1f}:1')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
