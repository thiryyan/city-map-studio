"""Garde-fou d'architecture des modules ES de src/ (issues #35, #102).

Les noms utilisés sans import et les variables importées réaffectées sont refusés par TypeScript (tests/typecheck.py,
mode strict : tous les fichiers de src/ sont en .ts) ; ESLint n'est plus nécessaire.
Registre « late » (src/core/cms.ts) : un fichier qui appelle une fonction d'un fichier chargé après lui la lit dans ce
   registre plutôt que de l'importer (l'import créerait un cycle et changerait l'ordre d'exécution). Chaque entrée est
   une dépendance à l'envers entre couches : leur nombre ne peut pas dépasser le plafond de tests/globals.max ; quand
   il baisse, abaisser le plafond.
"""
import pathlib, re, sys

T = pathlib.Path(__file__).resolve().parent
ROOT = T.parent
MAX = int((T / 'globals.max').read_text().split()[0])

fails = []

late = {}
for f in sorted([*(ROOT / 'src').rglob('*.js'), *(ROOT / 'src').rglob('*.ts')]):
    for m in re.finditer(r'Object\.assign\(late, \{([^}]*)\}\)', f.read_text(encoding='utf-8')):
        late[f.name] = [n.strip() for n in m.group(1).split(',') if n.strip()]
total = sum(len(v) for v in late.values())
for f, names in late.items():
    print(f'  {f:22} {len(names):3}  {", ".join(names)}')
print(f'  références vers l\'avant (registre late) : {total} (plafond {MAX})')
if total > MAX:
    fails.append(f'registre late : {total} entrées, plafond {MAX} (importer depuis un fichier antérieur, ou passer par un événement)')
elif total < MAX:
    print(f'  → abaisser le plafond de tests/globals.max à {total}')

print('✓ modules ES : registre late borné' if not fails else '\n'.join('✗ ' + f for f in fails))
sys.exit(1 if fails else 0)
