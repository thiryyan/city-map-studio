"""Lance toute la suite de tests de bout en bout et résume le résultat (utilisé aussi par l'intégration continue).

Génère d'abord les données de test (osm.json, data.osm, data.geojson, frame.html : non versionnées),
puis lance chaque test dans un processus séparé. Un test échoue si son code de sortie n'est pas nul,
si sa sortie contient une erreur de page (PAGEERROR), une trace Python, ou une vérification « ✗ … ».

    python tests/run_all.py              # tous les tests
    python tests/run_all.py ux design    # seulement ceux-là
"""
import pathlib, re, subprocess, sys, time

T = pathlib.Path(__file__).resolve().parent
TESTS = ['run', 'offline', 'maplibre', 'coords', 'texts', 'textsize',
         'mobile', 'ux', 'design', 'welcome', 'fonts', 'consent', 'reset', 'security', 'a11y', 'csp', 'pwa']
# « ✗ » suivi d'un texte : vérification en échec (un « ✗ » seul est une ligne du diagnostic réseau affiché, attendue hors ligne)
BAD = re.compile(r'^✗ \S|PAGEERROR|Traceback \(most recent call last\)', re.M)


def main(names):
    for gen in ('fixture', 'make_formats'):
        subprocess.run([sys.executable, str(T / f'{gen}.py')], check=True, stdout=subprocess.DEVNULL)
    failed = []
    for name in names or TESTS:
        t0 = time.time()
        p = subprocess.run([sys.executable, str(T / f'{name}.py')], capture_output=True, text=True, timeout=900)
        out = p.stdout + p.stderr
        bad = p.returncode != 0 or BAD.search(out)
        print(f"{'ÉCHEC' if bad else 'ok   '} {name:16} {time.time() - t0:5.0f} s")
        if bad:
            failed.append(name)
            print('\n'.join('    ' + l for l in out.splitlines()[-40:]))
    print(f"\n{len(failed)} échec(s) : {', '.join(failed)}" if failed else '\nTous les tests passent.')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
