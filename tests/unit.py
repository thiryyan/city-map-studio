"""Tests unitaires sans navigateur (node --test, scripts chargés dans un contexte node:vm : tests/unit/load.mjs).

Couvre le socle CMS (define, on, emit) et les fonctions pures : CMS.geo, exportSpec, normState, CMS.geocoder.sanitize
(tests/unit/geo.test.mjs) ; CMS.illus : qualité d'impression, placement, retouches, prompt, pistes, proportions
(tests/unit/illus.test.mjs).
"""
import pathlib, subprocess, sys

T = pathlib.Path(__file__).resolve().parent
files = sorted(str(p) for p in (T / 'unit').glob('*.test.mjs'))
p = subprocess.run(['node', '--test', *files], capture_output=True, text=True)
out = p.stdout + p.stderr
for line in out.splitlines():
    if line.startswith('ok ') or line.startswith('not ok '):
        print(('✓ ' if line.startswith('ok ') else '✗ ') + line.split(' - ', 1)[-1])
if p.returncode:
    print(out[-3000:]); sys.exit(1)
print('OK')
