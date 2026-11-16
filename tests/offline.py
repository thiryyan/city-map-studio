import pathlib
T=pathlib.Path(__file__).resolve().parent
ROOT=T.parent
APP_URL=(ROOT/'index.html').as_uri()
import os
CHROME=os.environ.get('CHROME') or None  # Chrome/Chromium ; vide = Chromium de Playwright
import asyncio, struct
from playwright.async_api import async_playwright
APP=APP_URL
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--allow-file-access-from-files'])
        ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,accept_downloads=True)
        page=await ctx.new_page(); errs=[]
        await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1')}catch(e){}")  # accord préalable donné (cf. tests/consent.py)
        page.on('pageerror',lambda e: errs.append(str(e)))
        async def route(r):
            if r.request.url.startswith('file:'): await r.continue_()
            else: await r.abort()
        await page.route('**/*',route)
        await page.goto(APP); await page.wait_for_timeout(2500)
        print('mlLib=',await page.evaluate('__cms.mlLib'),'| status=',await page.inner_text('#stTxt'),'| banner=',await page.inner_text('#banner'))
        await page.click('#bDiag'); await page.wait_for_timeout(1500)
        print('DIAG:\n'+await page.inner_text('#diag'))
        await page.screenshot(path=str(T/f'off-diag.png'))
        for f in ['overpass.json','data.osm','data.geojson']:
            await page.set_input_files('#fileIn',str(T/f'{f}')); await page.wait_for_timeout(600)
            print(f,'->',await page.inner_text('#stTxt'),'| engine',await page.evaluate('__cms.st.engine'),'| water rings',await page.evaluate("__cms.opData.water.map(w=>w.rings.length)"))
        await page.screenshot(path=str(T/f'off-import.png'))
        async with page.expect_download() as dl: await page.click('#bExport')
        d=await dl.value; await d.save_as(str(T/f'off-export.png')); data=open(str(T/f'off-export.png'),'rb').read()
        print('export',struct.unpack('>II',data[16:24]))
        print('errors',errs)
        # contexte iframe
        p2=await ctx.new_page(); await p2.route('**/*',route); await p2.goto((T/'frame.html').as_uri()); await p2.wait_for_timeout(1500)
        fr=p2.frames[1]; print('iframe warn:',await fr.inner_text('#envWarn'))
        await b.close()
asyncio.run(main())
