"""Tests unitaires sans navigateur (node --test, scripts chargés dans un contexte node:vm : tests/unit/load.mjs).

Couvre les fonctions pures (CMS.geo, normState, CMS.geocoder.sanitize) et le socle CMS (define, on, emit).
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
