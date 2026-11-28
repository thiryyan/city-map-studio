"""Outil de refactorisation (#118) : les demandes vers une couche supérieure passent par src/core/port.ts.

    python3 scripts/use-port.py

Pour chaque fonction NOM du port et chaque fichier de src/ : si le module qui définit NOM (son « propriétaire ») est
d'une couche supérieure à celle du fichier, « late.NOM » et l'import de NOM depuis le propriétaire deviennent un import
de NOM depuis le port. Le propriétaire doit s'abonner : onUi('NOM', NOM) (signalé s'il manque).
"""
import importlib.util, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('md', ROOT / 'scripts' / 'move-decl.py'); md = importlib.util.module_from_spec(spec); spec.loader.exec_module(md)
RANK = {'content': 0, 'core': 1, 'render': 2, 'services': 2, 'storage': 2, 'map': 3, 'view': 4, 'features': 5, 'ui': 6, 'app': 7}
PORT = 'src/core/port'
NAMES = [n.strip() for n in re.search(r'^export \{([^}]*)\};', (ROOT / (PORT + '.ts')).read_text(), re.M).group(1).split(',') if n.strip() and n.strip() != 'onUi']
owner = {}
for f in (ROOT / 'src').rglob('*.ts'):
    if md.mod(f) == PORT: continue
    for m in re.finditer(r'^export \{([^}]*)\};', f.read_text(), re.M):
        for n in [x.strip() for x in m.group(1).split(',')]:
            if n in NAMES: owner[n] = md.mod(f)
rank = lambda m: RANK[m.split('/')[1]]
for f in (ROOT / 'src').rglob('*.ts'):
    fr = str(f.relative_to(ROOT)); me = md.mod(fr)
    if me == PORT or fr.endswith('.d.ts'): continue
    t = f.read_text(); o = t; need = set()
    for n in NAMES:
        if n not in owner or rank(owner[n]) <= rank(me): continue
        t, k = re.subn(r'(?<![\w$.])late\.' + re.escape(n) + r'(?![\w$])', n, t)
        if k: need.add(n)
    def fix(m):
        items = [x.strip() for x in m.group(1).split(',') if x.strip()]
        src_mod = md.resolve(fr, m.group(2))
        moved = [x for x in items if x in NAMES and owner.get(x) == src_mod and rank(src_mod) > rank(me)]
        need.update(moved); keep = [x for x in items if x not in moved]
        return f"import {{{', '.join(keep)}}} from '{m.group(2)}';" if keep else '\x00'
    t = re.sub(r"^import \{([^}]*)\} from '([^']+)';$", fix, t, flags=re.M).replace('\x00\n', '')
    if need: t = md.add_import(t, sorted(need), md.rel(fr, PORT))
    if t != o: f.write_text(t); print('  ' + fr, sorted(need))
for n, m_ in sorted(owner.items()):
    if not re.search(r"onUi\('" + n + "'", (ROOT / (m_ + '.ts')).read_text()): print(f'  ! {m_} : onUi(\'{n}\', {n}) manquant')
