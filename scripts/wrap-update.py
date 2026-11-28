"""Outil de refactorisation (#118) : enveloppe le corps de fonctions nommées dans update() (src/core/doc/store.ts).

    python3 scripts/wrap-update.py FICHIER NOM [NOM…]

Pour une fonction « function NOM(…){ CORPS } » ou « const NOM=(…)=>{ CORPS } » qui modifie l'état par des alias de sous-objets (const P=posOf();
P.x=…), le corps devient « update(()=>{ CORPS }); » : toutes ses écritures sont faites dans le magasin (les appels
imbriqués à update sont permis). Une fonction qui renvoie une valeur garde son return : « return update(()=>{…}); ».
"""
import importlib.util, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('ts', ROOT / 'scripts' / 'to-store.py')
src = (ROOT / 'scripts' / 'to-store.py').read_text()
ns = {'__file__': str(ROOT / 'scripts' / 'to-store.py')}; exec(compile(src.split('\nfiles = ')[0], 'to-store', 'exec'), ns)   # expr_end, sans exécuter la conversion
expr_end = ns['expr_end']
f = ROOT / sys.argv[1]; t = f.read_text()
for name in sys.argv[2:]:
    m = re.search(r'(?:async\s+)?function\s+' + re.escape(name) + r'\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{', t) or \
        re.search(r'(?:const|let)\s+' + re.escape(name) + r'\s*=\s*(?:async\s*)?\([^)]*\)(?:\s*:\s*[^=]+)?\s*=>\s*\{', t)
    if not m: sys.exit(f'✗ {name} introuvable')
    a = m.end(); b = expr_end(t, a)           # s'arrête à la fermeture de la fonction… ou au premier « ; »
    depth = 1; i = a
    while depth:                              # accolade fermante correspondante (chaînes et gabarits ignorés)
        j = expr_end(t, i)
        if j >= len(t): sys.exit(f'✗ {name} : fin introuvable')
        if t[j] == '}': depth -= 1; i = j + 1
        else: i = j + 1
        if depth == 0: b = j
    body = t[a:b]
    if 'update(()=>{' in body[:20]: continue
    wrapped = ('return update(()=>{' if re.search(r'\breturn\b[^;]*\S', body) else 'update(()=>{') + body + '});'
    t = t[:a] + wrapped + t[b:]
    print(f'  {name} : corps enveloppé')
f.write_text(t)
