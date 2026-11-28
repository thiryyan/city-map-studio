"""Vérification TypeScript (#103) : `tsc -p .` (tsconfig.json, mode strict) sur les fichiers .ts de js/.

La migration se fait fichier par fichier : les .ts sont vérifiés strictement, les .js restants sont lus pour leurs
types (allowJs) mais pas vérifiés. Aucune erreur tolérée.
"""
import pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ts = sorted(p.name for p in (ROOT / 'js').glob('*.ts') if not p.name.endswith('.d.ts'))
js = sorted(p.name for p in (ROOT / 'js').glob('*.js'))
r = subprocess.run(['npx', '--no-install', 'tsc', '-p', '.'], cwd=ROOT, capture_output=True, text=True)
print((r.stdout + r.stderr).strip() or '  tsc : aucune erreur')
print(f'  migrés en TypeScript : {len(ts)} ({", ".join(ts)}) · restent en JavaScript : {len(js)}')
print('✓ types : aucune erreur' if r.returncode == 0 else '✗ types : erreurs TypeScript (voir ci-dessus)')
sys.exit(r.returncode)
