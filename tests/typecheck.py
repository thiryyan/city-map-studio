"""Vérification TypeScript (#103) : `tsc -p .` (tsconfig.json, mode strict) sur tous les fichiers de js/.

Aucune erreur tolérée ; aucun fichier JavaScript dans js/ (un nouveau module s'écrit en TypeScript). TypeScript refuse
aussi un nom utilisé sans import et une variable importée réaffectée (contrôles qu'assurait ESLint jusqu'au lot 5).
"""
import pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ts = sorted(p.name for p in (ROOT / 'js').glob('*.ts') if not p.name.endswith('.d.ts'))
js = sorted(p.name for p in (ROOT / 'js').glob('*.js'))
r = subprocess.run(['npx', '--no-install', 'tsc', '-p', '.'], cwd=ROOT, capture_output=True, text=True)
print((r.stdout + r.stderr).strip() or '  tsc : aucune erreur')
print(f'  modules TypeScript : {len(ts)} ({", ".join(ts)})')
fails = r.returncode != 0
if js:
    print(f'✗ fichiers JavaScript dans js/ : {", ".join(js)} (à écrire en TypeScript)'); fails = True
print('✓ types : aucune erreur, tout js/ en TypeScript' if not fails else '✗ types : voir ci-dessus')
sys.exit(1 if fails else 0)
