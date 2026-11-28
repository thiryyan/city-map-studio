"""e2e : saisie des coordonnées du point de rencontre (parseCoords + formulaire de l'onglet Lieu)."""
import pathlib, os, asyncio, json
from playwright.async_api import async_playwright
T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()   # site testé : dist/ (construit par run_all.py), ou CMS_ROOT
APP = (ROOT / 'index.html').as_uri()+'?test'
CHROME = os.environ.get('CHROME') or None

OK = {
    '47.5861, 1.3359': (47.5861, 1.3359),
    '47.5861 1.3359': (47.5861, 1.3359),
    '47,5861 ; 1,3359': (47.5861, 1.3359),
    '47,5861, 1,3359': (47.5861, 1.3359),
    '40.7484,-73.9857': (40.7484, -73.9857),
    "47° 35′ 10.0″ N, 1° 20′ 09.2″ E": (47.586111, 1.335889),
    '47°35\'10"N 1°20\'9.2"E': (47.586111, 1.335889),
    '40° 44′ 54″ N 73° 59′ 9″ O': (40.748333, -73.985833),
    'N 47 35.1667 E 1 20.1533': (47.586111, 1.335888),
    '33°51′S 151°12′E': (-33.85, 151.2),
    'https://www.google.com/maps/place/Blois/@47.5861,1.3359,15z': (47.5861, 1.3359),
    'https://www.openstreetmap.org/?mlat=47.5861&mlon=1.3359#map=15/47.5861/1.3359': (47.5861, 1.3359),
    'https://www.openstreetmap.org/#map=16/47.5870/1.3340': (47.5870, 1.3340),
}
BAD = ['', 'Blois', '47.5861', '95, 10', '47 35 70 N 1 20 0 E', '47 N 1 N']

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await b.new_page(viewport={'width': 390, 'height': 844}); errs = []
        await page.add_init_script("try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.advOpen','1');localStorage.setItem('cms3.styleMoreOpen','1');localStorage.setItem('cms3.themeOpen','1');localStorage.setItem('cms3.welcomed','1')}catch(e){}")  # accord préalable donné (cf. tests/consent.py)
        page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            await (r.continue_() if r.request.url.startswith('file:') else r.abort())
        await page.route('**/*', route)
        await page.goto(APP); await page.wait_for_timeout(1500)
        fails = []
        for s, (la, lo) in OK.items():
            r = await page.evaluate('s=>{try{return __cms.parseCoords(s)}catch(e){return {err:e.message}}}', s)
            good = 'err' not in r and abs(r['lat'] - la) < 1e-5 and abs(r['lon'] - lo) < 1e-5
            print('✓' if good else '✗', s, '→', r)
            if not good: fails.append(s)
        for s in BAD:
            r = await page.evaluate('s=>{try{return __cms.parseCoords(s)}catch(e){return {err:e.message}}}', s)
            print('✓' if 'err' in r else '✗', repr(s), '→', r.get('err', r))
            if 'err' not in r: fails.append(s)
        # Formulaire : point hors cadre → repère placé et carte recentrée
        await page.fill('#markerIn', '48.8530, 2.3499'); await page.press('#markerIn', 'Enter'); await page.wait_for_timeout(500)
        st = await page.evaluate('({m:__cms.st.marker,c:__cms.st.center})')
        print('formulaire :', st, '| toast :', await page.inner_text('#toast'))
        if abs(st['m']['lat'] - 48.853) > 1e-6 or abs(st['c']['lat'] - 48.853) > 1e-6: fails.append('formulaire')
        await page.screenshot(path=str(T / 'coords.png'))
        print('errors', errs); await b.close()
        assert not fails and not errs, fails
    print('OK')
asyncio.run(main())
