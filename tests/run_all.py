"""Lance toute la suite de tests de bout en bout et résume le résultat (utilisé aussi par l'intégration continue).

Génère d'abord les données de test (osm.json, data.osm, data.geojson, frame.html, city.json : non versionnées),
puis lance chaque test dans un processus séparé, plusieurs à la fois (les tests attendent surtout le navigateur :
ils sont indépendants, serveurs sur ports éphémères, fichiers de sortie propres à chacun). Un test échoue si son code de sortie n'est pas nul,
si sa sortie contient une erreur de page (PAGEERROR), une trace Python, ou une vérification « ✗ … ».

    python tests/run_all.py              # tous les tests
    python tests/run_all.py ux design    # seulement ceux-là
    python tests/run_all.py -j 1         # un test à la fois (par défaut : un par cœur, variable JOBS)
"""
import os, pathlib, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

T = pathlib.Path(__file__).resolve().parent
TESTS = ['run', 'offline', 'maplibre', 'coords', 'texts', 'textsize', 'dedication', 'formats', 'art', 'city', 'saves',
         'mobile', 'ux', 'design', 'vectors', 'compare', 'welcome', 'fonts', 'consent', 'reset', 'security', 'a11y', 'contrast', 'csp', 'pwa', 'mlloader', 'geocoder', 'webgl', 'attribution', 'unit', 'globals', 'perf', 'keyboard', 'illus', 'illustore', 'illusmix', 'illustext', 'illuspaste', 'maptext', 'textdeco', 'textstab', 'textfoot', 'deps', 'changes', 'gestures', 'safezone', 'flow', 'parity', 'sliderguard', 'wiki', 'routeai', 'storage', 'mesures']
# « ✗ » suivi d'un texte : vérification en échec (un « ✗ » seul est une ligne du diagnostic réseau affiché, attendue hors ligne)
BAD = re.compile(r'^✗ \S|PAGEERROR|Traceback \(most recent call last\)', re.M)
# Les plus longs d'abord : ils ne retardent pas la fin de la suite
SLOW = ['maplibre', 'design', 'csp', 'texts', 'welcome', 'textsize', 'contrast']


def run(name):
    t0 = time.time()
    p = subprocess.run([sys.executable, str(T / f'{name}.py')], capture_output=True, text=True, timeout=900)
    out = p.stdout + p.stderr
    return name, bool(p.returncode != 0 or BAD.search(out)), time.time() - t0, out


def main(args):
    jobs = int(os.environ.get('JOBS') or os.cpu_count() or 2)
    if args[:1] == ['-j']: jobs, args = int(args[1]), args[2:]
    names = args or TESTS
    for gen in ('fixture', 'make_formats', 'make_city'):
        subprocess.run([sys.executable, str(T / f'{gen}.py')], check=True, stdout=subprocess.DEVNULL)
    order = sorted(names, key=lambda n: SLOW.index(n) if n in SLOW else len(SLOW))
    failed, t0 = [], time.time()
    with ThreadPoolExecutor(max(1, jobs)) as pool:
        for f in as_completed([pool.submit(run, n) for n in order]):
            name, bad, secs, out = f.result()
            print(f"{'ÉCHEC' if bad else 'ok   '} {name:16} {secs:5.0f} s", flush=True)
            if bad:
                failed.append(name)
                print('\n'.join('    ' + l for l in out.splitlines()[-40:]), flush=True)
    print(f'\n{len(names)} tests en {time.time() - t0:.0f} s ({jobs} à la fois)')
    # Un échec sous charge est relancé seul, une fois : s'il passe, il est signalé comme instable (sortie ci-dessus)
    if failed and jobs > 1:
        for name in list(failed):
            _, bad, secs, out = run(name)
            print(f"{'ÉCHEC' if bad else 'INSTABLE'} {name} relancé seul : {'échoue encore' if bad else 'passe'} ({secs:.0f} s)")
            if not bad: failed.remove(name)
    print(f"{len(failed)} échec(s) : {', '.join(failed)}" if failed else 'Tous les tests passent.')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
