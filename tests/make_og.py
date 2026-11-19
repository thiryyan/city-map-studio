"""Régénère icons/og-image.jpg (image d'aperçu des liens partagés, 1200 × 630) avec le rendu actuel de l'application.

Trois affiches rendues par l'application elle-même (composePoster, moteur Fichier, ville de test tests/city.json) :
Carte ancienne, Soirée de gala, Nuit en ville ; posées en éventail sur un fond sombre, avec le nom et l'accroche
dans les polices auto-hébergées de l'application. Aucun accès réseau. À relancer quand le rendu change :

    python tests/make_city.py && python tests/make_og.py

Pensez à garder `og:image:alt` (index.html) cohérent avec les ambiances choisies ici.
"""
import pathlib, os, asyncio, base64, subprocess, sys
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
if not (T / 'city.json').exists(): subprocess.run([sys.executable, str(T / 'make_city.py')], check=True)
CITY = (T / 'city.json').read_text()
# [ambiance, zoom, décalage du centre (lat, lon)] : de l'arrière vers l'avant
POSTERS = [['ancienne', 13.5, (0.0005, 0.0)], ['gala', 14.1, (0.0012, -0.0025)], ['nuit', 13.7, (0.0, 0.0)]]

COMPOSE = r"""async(P)=>{
  const st=__cms.st, imgs=[];
  for(const [k,z,[dla,dlo]] of P){ __cms.applyAmbiance(k); st.zoom=z; st.center={lat:47.5861+dla,lon:1.3359+dlo}; st.marker={lat:47.5861,lon:1.3359};
    await __cms.composePoster(40,57);   // polices de l'ambiance chargées avant le vrai rendu
    imgs.push((await __cms.composePoster(620,877)).canvas); }
  await Promise.all(['400 64px "Playfair Display"','400 22px Montserrat'].map(f=>document.fonts.load(f)));
  const W=1200, H=630, c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
  let g=x.createLinearGradient(0,0,W,H); g.addColorStop(0,'#232226'); g.addColorStop(1,'#141416'); x.fillStyle=g; x.fillRect(0,0,W,H);
  g=x.createRadialGradient(880,330,40,880,330,520); g.addColorStop(0,'rgba(197,160,89,0.10)'); g.addColorStop(1,'rgba(197,160,89,0)'); x.fillStyle=g; x.fillRect(0,0,W,H);
  // affiches en éventail, ombres portées
  const place=[[585,120,-0.06,0.43],[755,92,0.0,0.45],[905,112,0.055,0.46]];
  imgs.forEach((im,i)=>{ const [px,py,rot,s]=place[i], w=im.width*s, h=im.height*s;
    x.save(); x.translate(px+w/2,py+h/2); x.rotate(rot);
    x.shadowColor='rgba(0,0,0,0.55)'; x.shadowBlur=34; x.shadowOffsetY=16; x.fillStyle='#000'; x.fillRect(-w/2,-h/2,w,h);
    x.shadowColor='transparent'; x.drawImage(im,-w/2,-h/2,w,h); x.restore(); });
  // nom et accroche
  x.fillStyle='#F2EEE6'; x.font='400 64px "Playfair Display"'; x.textBaseline='alphabetic';
  x.fillText('City Map',72,248); x.fillText('Studio',72,330);
  x.fillStyle='#C5A059'; x.fillRect(74,362,88,3);
  x.fillStyle='#B9B5AD'; x.font='400 22px Montserrat';
  ['Affiches cartographiques souvenir','Rues, cours d’eau et lieu de rencontre','Export A4 · 300 DPI · 100 % open source'].forEach((t,i)=>x.fillText(t,74,420+i*38));
  return c.toDataURL('image/jpeg',0.88); }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await (await b.new_context(viewport={'width': 1400, 'height': 900})).new_page()
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
        await seed(page, APP, wait=1300)
        await page.evaluate("f=>{ __cms.setEngine('file'); __cms.importText(f,'city.json'); }", CITY); await page.wait_for_timeout(500)
        url = await page.evaluate(COMPOSE, POSTERS)
        out = T.parent / 'icons' / 'og-image.jpg'; out.write_bytes(base64.b64decode(url.split(',')[1]))
        print('écrit', out, out.stat().st_size // 1024, 'Ko')
        await b.close()
asyncio.run(main())
