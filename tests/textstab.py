"""e2e : organisation de l'onglet Textes (issue #88).

Vérifie : ordre des parties (Vos textes, Mise en page, Typographie, Plus de réglages) ; sur mobile, panneau à mi-hauteur,
le champ du titre visible sans défilement ; une carte par bloc dans Mise en page ; Vintage parmi les duos (coché quand
le titre est en Vintage, quitté par un autre duo) ; « Plus de réglages » fermé par défaut, resté fermé après un duo,
ouvert d'office par un réglage avancé (police hors duo, taille d'une ligne), refermable sinon, compte des réglages
modifiés ; relecture « Voir » qui ouvre la section ; aucun réglage perdu (identifiants présents) ; aucune erreur de page.
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright
from jswait import wait_js

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent).resolve()   # site testé : source, ou dist/ (CI)
APP = (ROOT / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
fails = []


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await (await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)).new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.add_init_script("try{localStorage.setItem('cms3.consent','1');localStorage.setItem('cms3.welcomed','1')}catch(e){}")
        await page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(('file:', 'blob:', 'data:')) else r.abort())
        await page.goto(APP); await wait_js(page, "typeof __cms==='object'", 20000)
        ev = page.evaluate
        await ev("__cms.showTab('textes'); __cms.setSheet('half')"); await page.wait_for_timeout(500)

        # Ordre des parties et contenu
        order = await ev("[...document.querySelectorAll('#tab-textes h3, #tab-textes > details')].map(e=>e.id)")
        want = ['hLines', 'hTextLayout', 'hTypo', 'textMore']
        check([x for x in order if x in want] == want, f'parties : vos textes, mise en page, typographie, plus de réglages {order}')
        check(await ev("$('textMore').contains($('fontTitleSeg')) && $('textMore').contains($('swShadow')) && $('textMore').contains($('dedWrapSeg')) && $('textMore').contains($('coordSeg')) && $('textMore').querySelectorAll('.tsz').length===6"),
              'Plus de réglages : polices, ombre et contour, tailles par ligne, coupure de la dédicace, format des coordonnées')
        check(await ev("!$('textMore').contains($('duos')) && !$('textMore').contains($('swText')) && !$('textMore').contains($('sTsAll'))"), 'en vue : duos, couleur des lettres, taille de tous les textes')
        check(await ev("document.querySelectorAll('#tab-textes .tcard').length") == 2 and await ev("$('tPosSeg').closest('.tcard')!==$('fPosSeg').closest('.tcard') && !!$('tDecoSeg').closest('.tcard')"),
              'mise en page : une carte par bloc (position et présentation ensemble)')
        ids = ['occasions', 'coordsManual', 'dateIn', 'fitNote', 'textWarn', 'textPresets', 'tZoneSeg', 'fZoneSeg', 'tLayBtn', 'fAutoBtn', 'bTsReset', 'fontCats', 'sShadowOff', 'plateLineSeg', 'lineOrderList']
        missing = await ev(f"{ids}.filter(i=>!document.getElementById(i))")
        check(missing == [], f'aucun réglage perdu {missing}')

        # Mobile, panneau à mi-hauteur : le titre se saisit sans faire défiler
        r = await ev("(()=>{ const i=document.querySelector('[data-k=\"texts.title\"]').getBoundingClientRect(), t=document.querySelector('.tabbody').getBoundingClientRect(); return [i.top,i.bottom,t.top,t.bottom,document.querySelector('.tabbody').scrollTop]; })()")
        check(r[4] == 0 and r[0] >= r[2] and r[1] <= r[3], f'mobile : champ du titre visible à l\'ouverture de l\'onglet {r}')

        # Vintage parmi les duos
        check(await ev("$('textMore').open") is False, 'Plus de réglages fermé par défaut')
        await page.click('#duos [data-v=mariage]'); await page.wait_for_timeout(300)
        check(await ev("$('textMore').open") is False, 'un duo ne déplie pas les réglages avancés')
        await page.click('#duos [data-v="*vintage"]'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.illusText.style") == 'vintage' and await page.get_attribute('#duos [data-v="*vintage"]', 'aria-checked') == 'true'
              and await page.get_attribute('#duos [data-v=mariage]', 'aria-checked') == 'false', 'Vintage : choisi parmi les duos et coché')
        check(await ev("__cms.st.font") == 'vibes', 'Vintage : police du texte inchangée')
        await page.click('#duos [data-v=origine]'); await page.wait_for_timeout(300)
        check(await ev("__cms.st.illusText.style") == 'font' and await page.get_attribute('#duos [data-v="*vintage"]', 'aria-checked') == 'false', 'un autre duo quitte Vintage')
        await ev("CMS.illus.setMode('illus'); __cms.st.illusText.style='auto'; CMS.emit('state:synced')"); await page.wait_for_timeout(300)
        check(await page.get_attribute('#duos [data-v="*vintage"]', 'aria-checked') == 'true', 'Illustration, style Auto : Vintage coché (titre en Vintage)')
        await ev("CMS.illus.setMode('map')"); await page.wait_for_timeout(200)

        # Ouverture d'office, compte, refermer
        await ev("__cms.st.font='deco'; CMS.emit('state:synced')"); await page.wait_for_timeout(500)
        check(await ev("$('textMore').open"), 'police hors duo : Plus de réglages ouvert d\'office')
        await ev("__cms.st.font='serif'; __cms.st.fontTitle=''; CMS.emit('state:synced')"); await page.wait_for_timeout(500)
        await page.click('#textMore summary'); await page.wait_for_timeout(300)
        check(await ev("$('textMore').open") is False, 'aucun réglage avancé actif : la section se referme')
        await ev("(()=>{ const i=document.querySelector('[data-k=\"textScale.names\"]'); i.value=120; i.dispatchEvent(new Event('input',{bubbles:true})); })()"); await page.wait_for_timeout(600)
        check(await ev("$('textMore').open"), 'taille d\'une ligne modifiée : section ouverte d\'office')
        check(await page.text_content('#chg-textMore') == '1 modifié', 'en-tête : 1 réglage modifié compté')
        await page.click('#textMore summary'); await page.wait_for_timeout(200)
        await ev("__cms.showTab('export')"); await page.wait_for_timeout(400)
        parts = await ev("[...document.querySelectorAll('#changesList [data-reset]')].map(b=>b.dataset.reset)")
        check('lineSizes' in parts, f'relecture : « Taille de chaque ligne » {parts}')
        await page.click('#changesList button[aria-label="Voir : Taille de chaque ligne"]'); await page.wait_for_timeout(500)
        check(await ev("__cms.ui.tab") == 'textes' and await ev("$('textMore').open"), '« Voir » : onglet Textes, Plus de réglages ouvert')

        check(not errs, f'aucune erreur de page {errs}')
        await b.close()
    print('échecs', fails); assert not fails

asyncio.run(main())
