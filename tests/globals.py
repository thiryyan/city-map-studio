"""Garde-fou d'architecture des modules ES de js/ (issues #35, #102).

1. ESLint (eslint.config.js) : aucun nom utilisé sans import (no-undef), aucune variable importée réaffectée
   (no-import-assign) ; un module qui oublie un import échouerait sinon seulement au moment de l'appel.
2. Registre « late » (js/core.js) : un fichier qui appelle une fonction d'un fichier chargé après lui la lit dans ce
   registre plutôt que de l'importer (l'import créerait un cycle et changerait l'ordre d'exécution). Chaque entrée est
   une dépendance à l'envers entre couches : leur nombre ne peut pas dépasser le plafond de tests/globals.max ; quand
   il baisse, abaisser le plafond.
"""
import pathlib, re, subprocess, sys

T = pathlib.Path(__file__).resolve().parent
ROOT = T.parent
MAX = int((T / 'globals.max').read_text().split()[0])

fails = []
lint = subprocess.run(['npx', '--no-install', 'eslint', 'js'], cwd=ROOT, capture_output=True, text=True)
print(lint.stdout.strip() or '  ESLint : aucun problème')
if lint.returncode != 0:
    fails.append('ESLint signale des problèmes dans js/ (voir ci-dessus)')

late = {}
for f in sorted((ROOT / 'js').glob('*.js')):
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

print('✓ modules ES : imports explicites, registre late borné' if not fails else '\n'.join('✗ ' + f for f in fails))
sys.exit(1 if fails else 0)
