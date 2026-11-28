"""Outil de refactorisation (#118) : ajoute les imports manquants signalés par tsc (« Cannot find name 'X' »).

    python3 scripts/fix-imports.py

Pour chaque nom manquant, cherche le module de src/ qui l'exporte (listes « export {…}; ») et ajoute l'import au
fichier concerné. Un nom exporté par plusieurs modules, ou par aucun, est signalé sans être corrigé.
"""
import importlib.util, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('move_decl', ROOT / 'scripts' / 'move-decl.py')
md = importlib.util.module_from_spec(spec); spec.loader.exec_module(md)

RANK = {'content': 0, 'core': 1, 'render': 2, 'services': 2, 'storage': 2, 'map': 3, 'view': 4, 'features': 5, 'ui': 6, 'app': 7}
exporters = {}
for f in (ROOT / 'src').rglob('*.ts'):
    for m in re.finditer(r'^export \{([^}]*)\};', f.read_text(), re.M):
        for n in m.group(1).split(','):
            n = n.strip().replace('type ', '')
            if n: exporters.setdefault(n, []).append(md.mod(f))
    for m in re.finditer(r'^export (?:interface|type) ([\w$]+)', f.read_text(), re.M):
        exporters.setdefault(m.group(1), []).append(md.mod(f))
r = subprocess.run(['npx', '--no-install', 'tsc', '-p', '.'], cwd=ROOT, capture_output=True, text=True)
missing = {}
for m in re.finditer(r"^(src/[^(]+)\(\d+,\d+\): error TS(?:2304|2581|2552): Cannot find name '([\w$]+)'", r.stdout, re.M):
    missing.setdefault(m.group(1), set()).add(m.group(2))
for file, names in missing.items():
    p = ROOT / file; t = p.read_text(); by = {}
    for n in sorted(names):
        ex = [e for e in exporters.get(n, []) if e != md.mod(p)]
        if len(ex) > 1:   # le module réel s'il est permis par la règle des couches, sinon le port
            ok = [e for e in ex if RANK.get(e.split('/')[1], 9) <= RANK.get(file.split('/')[1], 9)]
            real = [e for e in ok if e != 'src/core/port']
            ex = real[:1] if len(real) == 1 else ok if len(ok) == 1 else ex
        if len(ex) != 1: print(f'  ? {file} : {n} → {ex or "introuvable"}'); continue
        by.setdefault(ex[0], []).append(n)
    for target, ns in by.items():
        t = md.add_import(t, ns, md.rel(file, target))
    p.write_text(t); print(f'  {file} : {sum(len(v) for v in by.values())} import(s) ajouté(s)')

# Imports devenus inutiles (TS6133 sur une ligne d'import ; TS6192 : toute la ligne)
r = subprocess.run(['npx', '--no-install', 'tsc', '-p', '.'], cwd=ROOT, capture_output=True, text=True)
unused = {}
for m in re.finditer(r"^(src/[^(]+)\((\d+),\d+\): error TS(6133|6192): (?:'([\w$]+)' is declared|All imports)", r.stdout, re.M):
    unused.setdefault(m.group(1), []).append((int(m.group(2)), m.group(4)))
for file, items in unused.items():
    p = ROOT / file; L = p.read_text().split('\n')
    for line, name in sorted(items, reverse=True):
        l = L[line - 1]
        if not l.startswith('import '): continue
        if name is None: del L[line - 1]; continue
        m = re.match(r"import \{([^}]*)\} from '([^']+)';$", l)
        if not m: continue
        keep = [x.strip() for x in m.group(1).split(',') if x.strip() and x.strip().replace('type ', '') != name]
        if keep: L[line - 1] = f"import {{{', '.join(keep)}}} from '{m.group(2)}';"
        else: del L[line - 1]
    p.write_text('\n'.join(L)); print(f'  {file} : {len(items)} import(s) inutile(s) retiré(s)')
