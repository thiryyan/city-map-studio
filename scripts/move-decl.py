"""Outil de refactorisation (#118) : déplace des déclarations de premier niveau d'un module de src/ vers un autre.

    python3 scripts/move-decl.py SRC DST NOM [NOM…]

Pour chaque NOM (fonction, const ou let de premier niveau dans SRC, avec ses commentaires de tête) : le bloc est
retiré de SRC et ajouté à la fin de DST (créé s'il n'existe pas), avant sa liste d'exports ; puis, dans tout src/ :
imports réécrits (le nom vient désormais de DST), appels « late.NOM » remplacés par un import direct, entrées du
registre late retirées, listes d'exports mises à jour. Les imports dont le code déplacé a besoin dans DST ne sont pas
ajoutés : `npm run typecheck` les signale. Un bloc s'arrête à la ligne qui précède la déclaration suivante (ligne
commençant en colonne 0 par autre chose que « } », « ) » ou « ] »).
"""
import os, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / 'src'


def mod(p):  # chemin sans extension, relatif à la racine
    return str(pathlib.Path(p).with_suffix('')).replace(str(ROOT) + '/', '')


def rel(from_file, target_mod):
    r = os.path.relpath(ROOT / target_mod, (ROOT / from_file).parent)
    return (r if r.startswith('.') else './' + r) + '.js'


def resolve(from_file, spec):
    return mod(os.path.normpath((ROOT / from_file).parent / spec))


DECL = r'^(?:export\s+)?(?:async\s+)?(?:function\*?\s+{n}\b|(?:const|let|var)\s+(?:[\w$]+\s*(?::[^=]*)?=[^;]*?,\s*)*{n}\b\s*[:=<(])'


def cut(text, name):
    L = text.split('\n')
    pat = re.compile(DECL.format(n=re.escape(name)))
    starts = [i for i, l in enumerate(L) if pat.match(l)]
    if len(starts) != 1:
        sys.exit(f'✗ {name} : {len(starts)} déclarations de premier niveau trouvées')
    i = starts[0]
    if re.match(r'^(?:const|let|var)\s+[\w$]+\s*(?::[^=]*)?=[^;]*?,', L[i]) and not re.match(rf'^(?:const|let|var)\s+{re.escape(name)}\b', L[i]):
        sys.exit(f'✗ {name} : déclaré dans une liste (const a=…, {name}=…) ; à séparer d\'abord')
    j = i
    while j + 1 < len(L) and not re.match(r'^[^\s})\]]', L[j + 1]):
        j += 1
    s = i
    while s > 0 and re.match(r'^\s*(/\*\*|\*|//)', L[s - 1]) and not re.match(r'^// -{5,}', L[s - 1]):
        s -= 1
    block = L[s:j + 1]
    del L[s:j + 1]
    return '\n'.join(L), '\n'.join(block)


def exports_edit(text, add=(), remove=()):
    m = list(re.finditer(r'^export \{([^}]*)\};\s*$', text, re.M))
    names = [n.strip() for n in m[-1].group(1).split(',') if n.strip()] if m else []
    names = [n for n in names if n not in remove]
    for n in add:
        if n not in names: names.append(n)
    names.sort(key=lambda n: (n.lower(), n))
    line = f"export {{{', '.join(names)}}};" if names else ''
    if m: return text[:m[-1].start()] + line + text[m[-1].end():]
    return text.rstrip('\n') + '\n\n' + line + '\n'


def add_import(text, names, spec):
    if not names: return text
    m = re.search(r"^import \{([^}]*)\} from '" + re.escape(spec) + r"';$", text, re.M)
    if m:
        cur = [n.strip() for n in m.group(1).split(',') if n.strip()]
        allnames = sorted(set(cur) | set(names), key=lambda n: (n.lstrip('type ').lower(), n))
        return text[:m.start()] + f"import {{{', '.join(allnames)}}} from '{spec}';" + text[m.end():]
    ims = list(re.finditer(r"^import .*;$", text, re.M))
    line = f"import {{{', '.join(sorted(names, key=str.lower))}}} from '{spec}';"
    if ims: return text[:ims[-1].end()] + '\n' + line + text[ims[-1].end():]
    # après le commentaire d'en-tête /* … */
    h = re.match(r'/\*.*?\*/\n', text, re.S)
    pos = h.end() if h else 0
    return text[:pos] + line + '\n' + text[pos:]


def uses(text, name):
    body = re.sub(r"^import .*;$", '', text, flags=re.M)
    body = re.sub(r'^export \{[^}]*\};$', '', body, flags=re.M)
    body = re.sub(r'Object\.assign\(late, \{[^}]*\}\);?', '', body)
    return re.search(r'(?<![\w$.\'"])' + re.escape(name) + r'(?![\w$\'"])', body) is not None


def main(src, dst, names):
    src, dst = mod(src), mod(dst)
    sp, dp = ROOT / (src + '.ts'), ROOT / (dst + '.ts')
    text = sp.read_text()
    blocks = []
    for n in names:
        text, b = cut(text, n)
        blocks.append(re.sub(r'^export\s+', '', b))
    # Module enveloppé dans CMS.define : noms retirés de l'objet rendu et de la liste qui les redistribue
    drop = lambda items: ', '.join(x.strip() for x in items.split(',') if x.strip() and x.strip() not in names)
    text = re.sub(r'^return \{([^}]*)\};$', lambda mm: f'return {{{drop(mm.group(1))}}};', text, flags=re.M)
    text = re.sub(r'^const \{([^}]*)\} = ([\w$]+);$', lambda mm: f'const {{{drop(mm.group(1))}}} = {mm.group(2)};', text, flags=re.M)
    sp.write_text(exports_edit(text, remove=names))
    dtext = dp.read_text() if dp.exists() else f'/* City Map Studio — {dst} (#118). */\n'
    m = list(re.finditer(r'^export \{[^}]*\};\s*$', dtext, re.M))
    pos = m[-1].start() if m else len(dtext)
    dtext = dtext[:pos].rstrip('\n') + '\n' + '\n'.join(blocks) + '\n' + ('\n' + dtext[pos:] if m else '')
    dp.write_text(exports_edit(dtext, add=names))
    for f in SRC_DIR.rglob('*.ts'):
        fr = str(f.relative_to(ROOT)); t = f.read_text(); o = t
        need = set()
        def fix_import(mm):
            spec = mm.group(2); target = resolve(fr, spec)
            items = [x.strip() for x in mm.group(1).split(',') if x.strip()]
            if target == src:
                moved = [x for x in items if x.replace('type ', '') in names]
                need.update(moved)
                items = [x for x in items if x not in moved]
            return f"import {{{', '.join(items)}}} from '{spec}';" if items else '\x00'
        t = re.sub(r"^import \{([^}]*)\} from '([^']+)';$", fix_import, t, flags=re.M)
        t = t.replace('\x00\n', '')
        for n in names:
            t, k = re.subn(r'(?<![\w$.])late\.' + re.escape(n) + r'(?![\w$])', n, t)
            if k: need.add(n)
        def fix_late(mm):
            items = [x.strip() for x in mm.group(1).split(',') if x.strip() and x.strip() not in names]
            return f"Object.assign(late, {{{', '.join(items)}}});" if items else ''
        t = re.sub(r'Object\.assign\(late, \{([^}]*)\}\);', fix_late, t)
        if fr == src + '.ts':
            need |= {n for n in names if uses(t, n)}
        if mod(fr) != dst and need:
            t = add_import(t, sorted(need), rel(fr, dst))
        # import de late devenu inutile
        if 'late' in t and not re.search(r'(?<![\w$.])late\.|Object\.assign\(late', t):
            t = re.sub(r"^import \{([^}]*)\} from '([^']*core/cms\.js)';$",
                       lambda mm: (lambda items: f"import {{{', '.join(items)}}} from '{mm.group(2)}';" if items else '\x00')(
                           [x.strip() for x in mm.group(1).split(',') if x.strip() and x.strip() != 'late']), t, flags=re.M)
            t = t.replace('\x00\n', '')
        if t != o: f.write_text(t)
    print(f'✓ {", ".join(names)} : {src} → {dst}')


if __name__ == '__main__':
    if len(sys.argv) < 4: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
