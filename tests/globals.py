"""Garde-fou d'architecture : nombre de déclarations globales des scripts js/*.js (issue #35).

Les scripts classiques partagent une seule portée globale. Le code placé dans un module CMS.define(…) lui est privé ;
seuls comptent les noms déclarés en tête de fichier (fonctions, const / let / var, noms d'une déstructuration).
Le nombre ne peut pas dépasser le plafond enregistré dans tests/globals.max : quand il baisse, abaisser le plafond.
"""
import pathlib, re, sys

T = pathlib.Path(__file__).resolve().parent
JS = sorted((T.parent / 'js').glob('*.js'))
MAX = int((T / 'globals.max').read_text().split()[0])


def top_level_names(src):
    names, inside, prev = [], False, ''
    for line in src.splitlines():
        if line.startswith('CMS.define('): inside = True; continue
        if inside:   # fin du module : « }); » juste après son « return {…}; »
            if line.startswith('});') and prev.startswith('return {'): inside = False
            if line.strip(): prev = line
            continue
        m = re.match(r'(?:async\s+)?function\s*\*?\s*([\w$]+)', line)
        if m: names.append(m.group(1)); continue
        m = re.match(r'(?:const|let|var)\s+(.*)', line)
        if not m: continue
        rest = m.group(1)
        d = re.match(r'\{([^}]*)\}\s*=', rest)
        if d: names += [n.split(':')[-1].strip() for n in d.group(1).split(',') if n.strip()]
        else: names += re.findall(r'(?:^|,\s*)([A-Za-z_$][\w$]*)\s*=', rest) or [rest.split()[0]]
    return names


total = 0
for f in JS:
    n = top_level_names(f.read_text(encoding='utf-8'))
    total += len(n)
    print(f'  {f.name:22} {len(n):4}')
dup = {}
for f in JS:
    for n in top_level_names(f.read_text(encoding='utf-8')): dup.setdefault(n, []).append(f.name)
dups = {n: fs for n, fs in dup.items() if len(fs) > 1}
print(('✓ ' if not dups else '✗ ') + f'aucun nom global déclaré deux fois {dups or ""}')
print(('✓ ' if total <= MAX else '✗ ') + f'{total} déclarations globales (plafond {MAX})')
if total < MAX: print(f'  → plafond à abaisser : echo {total} > tests/globals.max')
sys.exit(0 if total <= MAX and not dups else 1)
