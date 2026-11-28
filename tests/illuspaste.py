"""e2e : coller l'illustration depuis le presse-papiers (issue #57).

Presse-papiers simulé (navigator.clipboard.read remplacé avant le chargement) : image PNG importée comme un fichier,
GIF refusé par le même contrôle que le fichier, presse-papiers sans image, permission refusée, bouton absent sans
l'API ; texte d'aide adapté à l'écran tactile (pas de « Ctrl + V »). Rien n'est lu sans toucher le bouton.
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()   # site testé : dist/ (construit par run_all.py), ou CMS_ROOT
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
fails = []

# Presse-papiers simulé : window.__clip = 'png' | 'gif' | 'text' | 'deny' | 'none' (API absente) ; __clipReads compte les lectures
MOCK = """(()=>{ try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.welcomed','1')}catch(e){}
  window.__clip = sessionStorage.getItem('clip') || 'png'; window.__clipReads = 0;
  if(window.__clip==='none'){ try{ Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true}); }catch(e){} return; }
  const make = type => new Promise(r=>{ const c=document.createElement('canvas'); c.width=800; c.height=1100; const x=c.getContext('2d');
    x.fillStyle='#7FB2D6'; x.fillRect(0,0,800,550); x.fillStyle='#6E9A4A'; x.fillRect(0,550,800,550); c.toBlob(r,type); });
  const clip = { read: async ()=>{ window.__clipReads++;
      if(window.__clip==='deny') throw new DOMException('refus', 'NotAllowedError');
      if(window.__clip==='text') return [{types:['text/plain'], getType: async()=>new Blob(['bonjour'],{type:'text/plain'})}];
      const type = window.__clip==='gif' ? 'image/gif' : 'image/png';
      const b = window.__clip==='gif' ? new Blob([new Uint8Array([71,73,70,56,57,97])],{type}) : await make(type);
      return [{types:[type], getType: async()=>b}]; },
    writeText: async()=>{} };
  Object.defineProperty(navigator,'clipboard',{value:clip,configurable:true});
})()"""


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 760}, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        await page.add_init_script(MOCK)
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            if r.request.url.startswith(('file:', 'blob:', 'data:')): return await r.continue_()
            await r.abort()
        await page.route('**/*', route)

        async def open_with(mode):
            await page.goto(APP); await page.evaluate(f"sessionStorage.setItem('clip','{mode}')")
            await page.reload(); await wait_js(page, "typeof __cms==='object'", 20000)
            await page.evaluate("CMS.illus.setMode('illus')"); await page.wait_for_timeout(200)
            await page.evaluate("__cms.showTab('illus')")
            await page.evaluate("document.getElementById('bToImage').click()"); await page.wait_for_timeout(200)
            if await page.evaluate("!document.getElementById('illusFile').hidden"):   # image du cas précédent, retrouvée au rechargement
                await page.evaluate("document.getElementById('bIllusDel').click()"); await page.wait_for_timeout(300)
        toast = lambda: page.evaluate("document.getElementById('toast').textContent")
        loaded = lambda: page.evaluate("!!document.getElementById('illusFile') && !document.getElementById('illusFile').hidden")

        # Image PNG : importée comme un fichier
        await open_with('png')
        check(await page.is_visible('#bIllusPaste'), 'bouton « Coller l\'image » proposé quand l\'API existe')
        check(await page.evaluate('window.__clipReads') == 0, 'rien n\'est lu sans toucher le bouton')
        check(await page.is_visible('.drop .touchonly') and await page.is_hidden('.drop .kbonly'), 'écran tactile : texte d\'aide sans « Ctrl + V »')
        await page.tap('#bIllusPaste'); await page.wait_for_timeout(800)
        check(await page.evaluate('window.__clipReads') == 1 and await loaded(), 'image du presse-papiers importée')
        check((await page.evaluate("document.getElementById('illusName').textContent")).startswith('image-collee'), 'nom de fichier attribué à l\'image collée')
        check(await page.evaluate("!!__cms.st.illus.img"), 'illustration enregistrée dans l\'état')

        # GIF : refusé par le contrôle commun
        await open_with('gif'); await page.tap('#bIllusPaste'); await page.wait_for_timeout(500)
        check(not await loaded(), 'GIF collé : refusé')
        msg = await page.evaluate("document.body.innerText")
        check('PNG, JPEG ou WebP' in msg, 'GIF collé : message des formats acceptés')

        # Texte seul, permission refusée
        await open_with('text'); await page.tap('#bIllusPaste'); await page.wait_for_timeout(300)
        t = await toast(); check('Aucune image' in t and 'Choisir un fichier' in t, f'presse-papiers sans image : message et renvoi au fichier ({t})')
        await open_with('deny'); await page.tap('#bIllusPaste'); await page.wait_for_timeout(300)
        t = await toast(); check('refusé' in t and 'Choisir un fichier' in t, f'permission refusée : message et renvoi au fichier ({t})')

        # API absente : pas de bouton
        await open_with('none')
        check(await page.is_hidden('#bIllusPaste'), 'API absente : bouton masqué')
        check(await page.is_visible('#illusDrop label.btn'), 'API absente : « Choisir un fichier » reste disponible')
        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails
    print('OK')

asyncio.run(main())
