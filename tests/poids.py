"""Budgets de poids du site construit (#103) : chaque fichier chargé au démarrage, brut et compressé (gzip, comme
GitHub Pages le sert), ne dépasse pas son budget ; le site entier non plus. Un dépassement fait échouer la suite (CI) :
alléger, ou relever le budget ici en le justifiant dans la pull request.

Budgets fixés au 28/11/2026 (lot 5), environ 10 % au-dessus des tailles mesurées : script 299 Ko (113 Ko compressé),
feuille de style 34 Ko (7 Ko), page 65 Ko (16 Ko), MapLibre 784 Ko (205 Ko, dépendance embarquée), site 2,3 Mo.
"""
import gzip, os, pathlib, sys

T = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get('CMS_ROOT') or T.parent / 'dist').resolve()
KO = 1024
# [motif, brut max, compressé max] (Ko)
BUDGETS = [('js/app.*.js', 330, 125), ('css/app.*.css', 38, 9), ('index.html', 72, 18), ('sw.js', 6, 3),
           ('lib/maplibre-gl.js', 790, 210)]
DEMARRAGE_GZ = 150   # page + script + feuille de style, compressés (Ko) : ce qu'il faut télécharger avant le premier affichage
SITE = 2600          # tout le site publié (Ko, brut)

fails = []
def check(cond, msg):
    print('✓' if cond else '✗', msg)
    if not cond: fails.append(msg)

if not (ROOT / 'index.html').is_file() or not list(ROOT.glob('js/app.*.js')):
    print(f'✗ site construit introuvable dans {ROOT} (npm run build)'); sys.exit(1)
start = 0
for pat, raw_max, gz_max in BUDGETS:
    files = list(ROOT.glob(pat))
    check(len(files) == 1, f'{pat} : un seul fichier ({len(files)})')
    if not files: continue
    b = files[0].read_bytes(); raw, gz = len(b) / KO, len(gzip.compress(b, 9)) / KO
    check(raw <= raw_max and gz <= gz_max, f'{files[0].relative_to(ROOT)} : {raw:.0f} Ko (≤ {raw_max}), compressé {gz:.0f} Ko (≤ {gz_max})')
    if pat in ('js/app.*.js', 'css/app.*.css', 'index.html'): start += gz
check(start <= DEMARRAGE_GZ, f'démarrage (page, script, feuille de style compressés) : {start:.0f} Ko (≤ {DEMARRAGE_GZ})')
site = sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file()) / KO
check(site <= SITE, f'site publié : {site:.0f} Ko (≤ {SITE})')
print('OK' if not fails else 'ÉCHEC')
sys.exit(1 if fails else 0)
