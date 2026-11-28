"""Garde-fou d'architecture (#35, #102, #118) : règle de dépendance entre couches de src/.

content (données pures) < core < render, services, storage < map < view < features < ui < app : une couche n'importe
que des couches inférieures (scripts/check-layers.mjs, sur le graphe d'imports d'esbuild). Deux compteurs, bornés par
tests/layers.max, qui ne peuvent que baisser jusqu'à 0 (lot 1 de l'Horizon 1) :
- imports hors règle ;
- appels par le registre « late » (supprimé au #118) ;
- fichiers source de plus de 40 Ko (lot 2 de l'Horizon 1, #119) ;
- écritures directes de l'état (st.x = …, Object.assign(st, …)…) hors de src/core/doc/ : toute écriture passe par
  update() de src/core/doc/store.ts, seul point d'écriture.
Les noms utilisés sans import et les variables importées réaffectées sont refusés par TypeScript (tests/typecheck.py).
"""
import json, pathlib, subprocess, sys

T = pathlib.Path(__file__).resolve().parent
ROOT = T.parent
MAX = dict(l.split(':') for l in (T / 'layers.max').read_text().split() if ':' in l)
r = subprocess.run(['node', 'scripts/check-layers.mjs', '--json'], cwd=ROOT, capture_output=True, text=True)
if r.returncode:
    print('✗ scripts/check-layers.mjs :', r.stderr[-400:]); sys.exit(1)
d = json.loads(r.stdout)
fails = []
for key, label, items in [('imports', 'imports hors règle', d['imports']), ('late', 'appels par le registre late', d['late']),
                          ('writes', "écritures directes de l'état hors du magasin", d['writes']),
                          ('big', 'fichiers source de plus de 40 Ko', d['big'])]:
    n, cap = len(items), int(MAX[key])
    for it in items[:60]: print('  ', ' → '.join(it[:2]) + (f' ({it[2]})' if len(it) > 2 else ''))
    print(f'  {label} : {n} (plafond {cap})')
    if n > cap: fails.append(f'{label} : {n}, plafond {cap} (importer dans le bon sens, ou passer par un événement)')
    elif n < cap: print(f'  → abaisser le plafond « {key} » de tests/layers.max à {n}')
print('✓ couches : règle de dépendance respectée dans les plafonds' if not fails else '\n'.join('✗ ' + f for f in fails))
sys.exit(1 if fails else 0)
