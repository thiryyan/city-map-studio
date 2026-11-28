"""Tests unitaires sans navigateur (Vitest, #103 ; modules réunis par esbuild et exécutés dans un contexte node:vm :
tests/unit/load.mjs ; configuration : vitest.config.mjs).

Couvre le socle CMS (define, on, emit) et les fonctions pures : CMS.geo, exportSpec, normState, CMS.geocoder.sanitize
(tests/unit/geo.test.mjs) ; CMS.illus : qualité d'impression, placement, retouches, prompt, pistes, proportions
(tests/unit/illus.test.mjs) ; CMS.route : prompt d'itinéraire, extractGpx, contrôle de vraisemblance
(tests/unit/route.test.mjs) ; CMS.wiki : classement et validation (tests/unit/wiki.test.mjs).
"""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
p = subprocess.run(['npx', '--no-install', 'vitest', 'run', '--color=false'], cwd=ROOT, capture_output=True, text=True)
out = p.stdout + p.stderr
for line in out.splitlines():
    m = re.match(r'\s*([✓×])\s+tests/unit/\S+ > (.*?)(?: \d+ms)?$', line)
    if m: print(('✓ ' if m.group(1) == '✓' else '✗ ') + m.group(2))
if p.returncode:
    print(out[-3000:]); sys.exit(1)
print('OK')
