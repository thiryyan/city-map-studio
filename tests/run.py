import pathlib
T=pathlib.Path(__file__).resolve().parent
ROOT=T.parent
APP_URL=(ROOT/'index.html').as_uri()+'?test'
import os
CHROME=os.environ.get('CHROME') or None  # Chrome/Chromium ; vide = Chromium de Playwright
import asyncio, json, struct, sys
from playwright.async_api import async_playwright
APP=APP_URL
FIX=open(T/'osm.json').read()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        for name,vp,mobile in [('mobile',{'width':390,'height':844},True),('desktop',{'width':1400,'height':900},False)]:
            ctx=await b.new_context(viewport=vp,device_scale_factor=2 if mobile else 1,is_mobile=mobile,has_touch=mobile,accept_downloads=True)
            page=await ctx.new_page()
            await page.add_init_script("try{localStorage.setItem('cityMapStudio.consent','1');localStorage.setItem('cityMapStudio.advOpen','1');localStorage.setItem('cityMapStudio.welcomed','1')}catch(e){}")  # accord préalable donné (cf. tests/consent.py)
            logs=[]
            page.on('console',lambda m: logs.append(f'{m.type}: {m.text}'))
            page.on('pageerror',lambda e: logs.append(f'PAGEERROR: {e}'))
            async def route(r):
                u=r.request.url
                if u.startswith('file:'): await r.continue_()
                else: await r.abort()
            await page.route('**/*',route)
            await page.goto(APP); await page.wait_for_timeout(1500); await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
            await page.screenshot(path=str(T/f'{name}.png'))
            print(name,'engine=',await page.evaluate('__cms.st.engine'),'data=',await page.evaluate('!!__cms.osmData'))
            if name=='mobile':
                print('dms',await page.evaluate("[__cms.dms(47.5861,'N','S'),__cms.dms(1.3359,'E','W'),__cms.dms(1.99999,'E','W'),__cms.dms(-73.9855,'E','W')]"))
                print('rings',await page.evaluate("__cms.osmData.water.map(f=>f.rings.length+':'+f.rings.map(r=>r.length).join('/'))"))
            async with page.expect_download() as dl:
                await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
            d=await dl.value; path=str(T/f'export-{name}.png'); await d.save_as(path)
            data=open(path,'rb').read()
            w,h=struct.unpack('>II',data[16:24]); i=data.find(b'pHYs')
            print('export',d.suggested_filename,w,h,'pHYs',struct.unpack('>IIB',data[i+4:i+13]) if i>0 else None)
            await page.wait_for_timeout(300)
            await page.screenshot(path=str(T/f'{name}-result.png'))
            print('\n'.join(logs[:15]))
            await ctx.close()
        await b.close()
asyncio.run(main())
