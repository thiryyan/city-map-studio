"""e2e : formats d'impression (A4, A3, 50 × 70 cm, 10 × 15 cm) et export PDF.

Vérifie :
- les dimensions et la résolution de chaque format, en portrait et en paysage, sur ordinateur (300 DPI tant que le
  canevas tient dans 40 Mpx) et sur iPhone (limite de 16,7 Mpx de Safari iOS : résolution abaissée par pas de 10 DPI) ;
- le choix du format dans l'onglet Style : bouton d'export, indication sous le choix, rapport de l'aperçu (7/5 en 50 × 70) ;
- la validation d'un état forgé (format ou type de fichier inconnus) et la conservation du format dans un lien partagé ;
- l'export PNG A3 (3508 × 4961 px, pHYs 300 DPI) ;
- l'export PDF 50 × 70 cm et A4 paysage : structure du fichier (en-tête, table xref exacte, fin), page à la taille
  d'impression (points PostScript), image JPEG aux dimensions annoncées.
"""
import pathlib, os, asyncio, struct, re
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()
IPHONE = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
          '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')


def jpeg_size(b):
    """Dimensions (largeur, hauteur) d'un JPEG, lues dans son marqueur SOF"""
    i = 2
    while i < len(b):
        if b[i] != 0xFF: return None
        mk = b[i + 1]; ln = struct.unpack('>H', b[i + 2:i + 4])[0]
        if mk in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack('>HH', b[i + 5:i + 9]); return w, h
        i += 2 + ln
    return None


def check_pdf(data, wpx, hpx, mm):
    """Structure d'un PDF d'une page : renvoie la liste des problèmes (vide si tout va bien)"""
    bad = []
    if not data.startswith(b'%PDF-1.4\n'): bad.append('en-tête')
    if not data.rstrip().endswith(b'%%EOF'): bad.append('fin de fichier')
    sx = int(re.search(rb'startxref\n(\d+)', data).group(1))
    if data[sx:sx + 4] != b'xref': bad.append('startxref')
    n = int(re.search(rb'xref\n0 (\d+)\n', data[sx:]).group(1))
    offs = re.findall(rb'(\d{10}) 00000 n ', data[sx:])
    if len(offs) != n - 1: bad.append(f'xref : {len(offs)} entrées pour {n - 1} objets')
    for k, o in enumerate(offs, 1):
        if not data[int(o):].startswith(f'{k} 0 obj'.encode()): bad.append(f'xref : objet {k} mal placé')
    pt = lambda v: f'{v / 25.4 * 72:.2f}'.encode()
    if b'/MediaBox [0 0 ' + pt(mm[0]) + b' ' + pt(mm[1]) + b']' not in data: bad.append('MediaBox')
    if f'/Width {wpx} /Height {hpx}'.encode() not in data: bad.append('dimensions de l\'image')
    ln = int(re.search(rb'/DCTDecode /Length (\d+) >>\nstream\n', data).group(1))
    j = data.index(b'/DCTDecode'); j = data.index(b'stream\n', j) + 7
    jpg = data[j:j + ln]
    if jpg[:2] != b'\xff\xd8' or jpg[-2:] != b'\xff\xd9': bad.append('flux JPEG tronqué')
    if jpeg_size(jpg) != (wpx, hpx): bad.append(f'JPEG {jpeg_size(jpg)}')
    if b'/Title <FEFF' not in data: bad.append('titre')
    return bad


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        async def route(r):
            if r.request.url.startswith('file:'): await r.continue_()
            else: await r.abort()

        # --- iPhone : limite de 16,7 Mpx ---
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, user_agent=IPHONE, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); await page.route('**/*', route)
        await seed(page, APP)
        specs = await page.evaluate("['a4','a3','50x70','10x15'].map(f=>__cms.exportSpec({...__cms.st, format:f}))")
        print('  iPhone :', [(s['key'], s['W'], s['H'], s['dpi']) for s in specs])
        check(specs[0]['W'] == 2480 and specs[0]['H'] == 3508 and specs[0]['dpi'] == 300, 'iPhone : A4 à 300 DPI')
        check(all(s['W'] * s['H'] <= 16777216 for s in specs), 'iPhone : chaque format tient dans 16,7 Mpx')
        check((specs[3]['W'], specs[3]['H'], specs[3]['dpi']) == (1181, 1772, 300), 'iPhone : 10 × 15 cm à 300 DPI')
        check(specs[1]['dpi'] == 290 and specs[2]['dpi'] == 170, f"iPhone : A3 à 290 DPI, 50 × 70 à 170 DPI ({specs[1]['dpi']}, {specs[2]['dpi']})")
        await ctx.close()

        # --- Ordinateur ---
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.route('**/*', route)
        await seed(page, APP)
        await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
        ev = page.evaluate
        dims = await ev("""['a4','a3','50x70','10x15'].flatMap(f=>['portrait','landscape'].map(o=>{ const s=__cms.exportSpec({...__cms.st,format:f,orient:o}); return [f,o,s.W,s.H,s.dpi,s.mm]; }))""")
        exp = {('a4', 'portrait'): (2480, 3508, 300), ('a3', 'portrait'): (3508, 4961, 300), ('50x70', 'portrait'): (5315, 7441, 270), ('10x15', 'portrait'): (1181, 1772, 300)}
        for f, o, w, h, dpi, mm in dims:
            W, H, D = exp[(f, 'portrait')]
            if o == 'landscape': W, H = H, W
            check((w, h, dpi) == (W, H, D) and (mm[0] > mm[1]) == (o == 'landscape'), f'{f} {o} : {w} × {h} px à {dpi} DPI, {mm[0]} × {mm[1]} mm')

        # Choix dans l'onglet Export : bouton d'export, indication, rapport de l'aperçu
        await page.click('#tabs [data-tab=export]')
        await page.click('#formatSeg [data-v=a3]'); await page.wait_for_timeout(300)
        lab = await page.inner_text('#bExport')
        check('3508 × 4961' in lab and 'A3' in lab and '300 DPI' in lab, f'A3 : bouton d\'export « {lab.strip()} »')
        check(await ev("document.querySelector('#formatSeg [data-v=a3]').getAttribute('aria-pressed')") == 'true', 'A3 : bouton du format enfoncé (aria-pressed)')
        await page.click('#formatSeg [data-v="50x70"]'); await page.wait_for_timeout(400)
        hint = await page.inner_text('#formatHint')
        check('270 DPI' in hint and 'abaissée' in hint, f'50 × 70 : résolution abaissée signalée « {hint[:70]}… »')
        ratio = await ev("(()=>{ const r=document.getElementById('poster').getBoundingClientRect(); return r.height/r.width; })()")
        check(abs(ratio - 1.4) < 0.01, f'50 × 70 : aperçu au rapport 7/5 ({ratio:.4f})')
        await page.click('#formatSeg [data-v="10x15"]'); await page.wait_for_timeout(400)
        lab = await page.inner_text('#bExport'); hint = await page.inner_text('#formatHint')
        ratio = await ev("(()=>{ const r=document.getElementById('poster').getBoundingClientRect(); return r.height/r.width; })()")
        check('1181 × 1772' in lab and '10 × 15 cm' in lab and '300 DPI' in lab and abs(ratio - 1.5) < 0.01 and 'fond perdu' in hint,
              f'10 × 15 cm : bouton « {lab.strip()} », aperçu au rapport 3/2 ({ratio:.3f}), tirage photo signalé')
        await page.click('#formatSeg [data-v=a4]'); await page.wait_for_timeout(300)
        ratio = await ev("(()=>{ const r=document.getElementById('poster').getBoundingClientRect(); return r.height/r.width; })()")
        check(abs(ratio - 3508 / 2480) < 0.01, f'A4 : aperçu au rapport √2 ({ratio:.4f})')

        # État forgé, lien partagé
        norm = await ev("""(()=>{ const n=normState({format:'A0',fileType:'exe',dedWrap:'trois'}); return [n.format,n.fileType,n.dedWrap]; })()""")
        check(norm == ['a4', 'png', 'auto'], f'état forgé : format, fichier et retour à la ligne remis par défaut {norm}')
        rt = await ev("""(async()=>{ __cms.setFormat('a3'); __cms.setFileType('pdf'); const {url}=await __cms.encodeShare(); const s=normState(await __cms.decodeShare(url.split('#a=')[1])); return [s.format,s.fileType]; })()""")
        check(rt == ['a3', 'pdf'], f'lien partagé : format et fichier conservés {rt}')

        # Export PNG A3
        await ev("__cms.setFileType('png'); __cms.setFormat('a3')")
        async with page.expect_download(timeout=180000) as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value; path = T / 'export-a3.png'; await d.save_as(path)
        data = open(path, 'rb').read(); w, h = struct.unpack('>II', data[16:24]); i = data.find(b'pHYs')
        ppm = struct.unpack('>II', data[i + 4:i + 12]) if i > 0 else None
        check((w, h) == (3508, 4961) and ppm == (11811, 11811), f'export A3 : {w} × {h} px, pHYs {ppm}')
        check(d.suggested_filename.endswith('-a3-300dpi.png'), f'export A3 : nom {d.suggested_filename}')
        info = await page.inner_text('#resInfo')
        check('29,7 × 42 cm' in info, f'export A3 : taille d\'impression affichée « {info[:90]} »')
        await page.click('#resClose')

        # Export PNG et PDF 10 × 15 cm (tirage photo, issue #50)
        await ev("__cms.setFormat('10x15')")
        async with page.expect_download(timeout=120000) as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value; data = open(await d.path(), 'rb').read(); w, h = struct.unpack('>II', data[16:24]); i = data.find(b'pHYs')
        ppm = struct.unpack('>II', data[i + 4:i + 12]) if i > 0 else None
        check((w, h) == (1181, 1772) and ppm == (11811, 11811) and d.suggested_filename.endswith('-10x15-300dpi.png'), f'export 10 × 15 cm : {w} × {h} px, pHYs {ppm}, {d.suggested_filename}')
        info = await page.inner_text('#resInfo')
        check('(10 × 15 cm)' in info and '10 × 15 cm (10' not in info, f'export 10 × 15 cm : taille affichée une seule fois « {info[:80]} »')
        await page.click('#resClose'); await page.click('#fileSeg [data-v=pdf]')
        async with page.expect_download(timeout=120000) as dl: await page.click('#bExport')
        d = await dl.value; data = open(await d.path(), 'rb').read()
        bad = check_pdf(data, 1181, 1772, (100, 150))
        check(not bad and d.suggested_filename.endswith('-10x15-300dpi.pdf') and b'283.46 425.20' in data, f'PDF 10 × 15 cm : page de 283,46 × 425,20 pt {bad}')
        await page.click('#resClose'); await page.click('#fileSeg [data-v=png]')

        # Export PDF 50 × 70 cm
        await page.click('#fileSeg [data-v=pdf]'); await ev("__cms.setFormat('50x70')")
        lab = await page.inner_text('#bExport'); check('PDF' in lab, 'PDF : signalé sur le bouton d\'export')
        async with page.expect_download(timeout=240000) as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value; path = T / 'export-50x70.pdf'; await d.save_as(path)
        data = open(path, 'rb').read()
        bad = check_pdf(data, 5315, 7441, (500, 700))
        check(not bad and d.suggested_filename.endswith('-50x70-270dpi.pdf'), f'PDF 50 × 70 : {d.suggested_filename}, {len(data) / 1048576:.1f} Mo {bad}')
        check(await ev("document.getElementById('resImg').naturalWidth") == 5315, 'PDF : aperçu de l\'image dans la fenêtre du résultat')
        await page.click('#resClose')

        # Export PDF A4 paysage
        await ev("__cms.setFormat('a4'); __cms.setOrient('landscape')")
        async with page.expect_download(timeout=120000) as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
        d = await dl.value; data = open(await d.path(), 'rb').read()
        bad = check_pdf(data, 3508, 2480, (297, 210))
        check(not bad, f'PDF A4 paysage : page de 841,89 × 595,28 pt {bad}')
        await page.click('#resClose')
        await ev("__cms.setOrient('portrait'); __cms.setFileType('png')")
        check(not errs, f'aucune erreur de page {errs[:3]}')
        await ctx.close()
        await b.close()
    print('✗ échecs : ' + ', '.join(fails) if fails else 'OK')
    return 1 if fails else 0

raise SystemExit(asyncio.run(main()))
