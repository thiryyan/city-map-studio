"""Outil de refactorisation (#118) : les écritures directes de l'état passent par update() (src/core/doc/store.ts).

    python3 scripts/to-store.py [FICHIER…]      (par défaut : tout src/ hors src/core/doc/)

Formes converties (la valeur de l'expression est conservée) :
    st.a.b = v ;  st.a += v ;  st.n++          →  update(_s=>(_s.a.b = v))  …
    Object.assign(st, x)                         →  update(_s=>Object.assign(_s, x))
    delete st.a                                   →  update(_s=>delete _s.a)
    setPath(st, k, v)                             →  update(_s=>setPath(_s, k, v))
La fin de la valeur affectée est trouvée par un analyseur léger (parenthèses, crochets, accolades, chaînes, gabarits) :
« ; », « , », « : » (hors ternaire de la valeur) ou une fermeture au niveau 0, ou une fin de ligne. Les affectations en chaîne sont converties de
l'intérieur vers l'extérieur par passes successives. Vérifier ensuite avec `npm run typecheck` et les tests.
"""
import importlib.util, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('md', ROOT / 'scripts' / 'move-decl.py'); md = importlib.util.module_from_spec(spec); spec.loader.exec_module(md)
STORE = 'src/core/doc/store'
LHS = re.compile(r'(?<![\w$.])st((?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])+)\s*(=(?!=)|\+=|-=|\*=|/=|\|\|=|&&=|\?\?=|\+\+|--)')
CALL = re.compile(r'(?<![\w$.])(Object\.assign\(|setPath\()st\b')
DEL = re.compile(r'(?<![\w$.])delete st((?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])+)')
PAIRS = {'(': ')', '[': ']', '{': '}'}


def expr_end(s, i):
    """Fin de l'expression qui commence en i (indice exclu)."""
    depth = []; tern = 0
    while i < len(s):
        c = s[i]
        if c in '\'"':
            q = c; i += 1
            while i < len(s) and s[i] != q:
                i += 2 if s[i] == '\\' else 1
            i += 1; continue
        if c == '`':
            i += 1; lvl = 0
            while i < len(s):
                if s[i] == '\\': i += 2; continue
                if s[i:i + 2] == '${': lvl += 1; i += 2; continue
                if s[i] == '}' and lvl: lvl -= 1; i += 1; continue
                if s[i] == '`' and not lvl: break
                i += 1
            i += 1; continue
        if c in PAIRS: depth.append(PAIRS[c]); i += 1; continue
        if c in ')]}':
            if not depth: return i
            depth.pop(); i += 1; continue
        if not depth:
            if c == '?' and s[i + 1:i + 2] not in '.?': tern += 1   # ternaire dans la valeur affectée
            elif c == ':' and tern: tern -= 1
            elif c in ';,:\n': return i
        i += 1
    return i


def call_end(s, i):
    """i : juste après la parenthèse ouvrante d'un appel ; renvoie l'indice après la parenthèse fermante."""
    j = expr_end(s, i)
    while j < len(s) and s[j] == ',':
        j = expr_end(s, j + 1)
    return j + 1


def convert(text):
    n = 0
    while True:
        # les plus internes d'abord : on prend la dernière occurrence
        ms = [('lhs', m) for m in LHS.finditer(text)] + [('call', m) for m in CALL.finditer(text)] + [('del', m) for m in DEL.finditer(text)]
        if not ms: return text, n
        kind, m = max(ms, key=lambda x: x[1].start())
        a = m.start()
        if kind == 'lhs':
            op = m.group(2)
            b = m.end() if op in ('++', '--') else expr_end(text, m.end())
            body = '_s' + text[a + 2:b].rstrip()
            tail = text[a + 2 + len(text[a + 2:b].rstrip()):b]
            text = text[:a] + f'update(_s=>({body}))' + tail + text[b:]
        elif kind == 'call':
            b = call_end(text, m.start() + len(m.group(1)))
            inner = text[a:b].replace(m.group(1) + 'st', m.group(1) + '_s', 1)
            text = text[:a] + f'update(_s=>{inner})' + text[b:]
        else:
            b = m.end()
            text = text[:a] + f'update(_s=>delete _s{m.group(1)})' + text[b:]
        n += 1


files = [pathlib.Path(f) for f in sys.argv[1:]] or [f for f in (ROOT / 'src').rglob('*.ts') if 'src/core/doc/' not in str(f) and not f.name.endswith('.d.ts')]
for f in files:
    f = (ROOT / f) if not f.is_absolute() else f
    t = f.read_text(); new, n = convert(t)
    if n:
        fr = str(f.relative_to(ROOT))
        if re.search(r'(?:function|const|let)\s+update\b', new):   # une fonction locale porte déjà ce nom
            new = new.replace('update(_s=>', 'updateDoc(_s=>')
            new = md.add_import(new, ['update as updateDoc'], md.rel(fr, STORE))
        elif not re.search(r"import \{[^}]*\bupdate\b[^}]*\} from '[^']*store\.js'", new):
            new = md.add_import(new, ['update'], md.rel(fr, STORE))
        f.write_text(new); print(f'  {fr} : {n} écriture(s) convertie(s)')
