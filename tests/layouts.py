import pathlib
T=pathlib.Path(__file__).resolve().parent
ROOT=T.parent
APP_URL=(ROOT/'index.html').as_uri()+'?test'
import os
CHROME=os.environ.get('CHROME') or None  # Chrome/Chromium ; vide = Chromium de Playwright
import asyncio, base64
from playwright.async_api import async_playwright
FIX=open(T/'overpass.json').read()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=CHROME,args=['--no-sandbox'])
        page=await b.new_page(viewport={'width':1400,'height':900})
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.advOpen','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")  # accord préalable donné (cf. tests/consent.py)
        async def route(r):
            u=r.request.url
            if 'interpreter' in u: await r.fulfill(status=200,content_type='application/json',body=FIX)
            elif u.startswith('file:'): await r.continue_()
            else: await r.abort()
        await page.route('**/*',route)
        await page.goto(APP_URL); await page.wait_for_timeout(1200)
        for lay,theme,mk in [('classic','galerie','heartGeo'),('fade','onyx','dot'),('medallion','creme','ring')]:
            url=await page.evaluate(f"""(()=>{{const c=__cms; const s=c.st; s.layout='{lay}'; s.theme='{theme}';
              Object.assign(s.colors,{{}}); s.markerStyle='{mk}'; s.coordFormat='dms';
              const T={{galerie:1}};
              const cv=document.createElement('canvas'); cv.width=620; cv.height=877;
              return null}})()""")
            # apply theme via UI click
            await page.click(f'#tabs button[data-tab=style]')
            await page.click(f'#themes .theme[data-v={theme}]')
            await page.click(f'#layouts .card[data-v={lay}]')
            await page.wait_for_timeout(300)
            await page.locator('#poster').screenshot(path=str(T/f'L-{lay}.png'))
        await b.close()
asyncio.run(main())
