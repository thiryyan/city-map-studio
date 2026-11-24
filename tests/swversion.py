"""Garde-fou de version du service worker (issue #65), lancé par la CI sur chaque pull request.

Si le diff contre la branche de base touche sw.js ou un fichier de sa liste APP, la constante VERSION de sw.js
doit avoir changé : sinon sw.js reste identique, le navigateur ne voit aucune mise à jour du worker et le cache
hors ligne garde les anciens fichiers. Toujours : la version de la page (CMS.build, js/core.js) est égale à VERSION.

    python tests/swversion.py               # contre origin/main
    python tests/swversion.py origin/develop
"""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def git(*a):
    return subprocess.run(['git', *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def app_files(src):
    body = re.search(r'const APP = \[(.*?)\];', src, re.S).group(1)
    return {f for f in re.findall(r"'([^']+)'", body) if f != './'}


def version(src):
    return re.search(r"const VERSION = '([^']+)'", src).group(1)


def core_version(src):
    m = re.search(r"const version = '([^']+)'", src)
    return m and m.group(1)


def main(base):
    now = (ROOT / 'sw.js').read_text(encoding='utf-8')
    core = core_version((ROOT / 'js' / 'core.js').read_text(encoding='utf-8'))
    if core != version(now):
        print(f'✗ version de la page (js/core.js, CMS.build : {core}) différente de VERSION de sw.js ({version(now)})')
        print('  → recopier VERSION de sw.js dans CMS.build (js/core.js)'); return 1
    merge = git('merge-base', base, 'HEAD').strip()
    changed = set(git('diff', '--name-only', merge, 'HEAD').split())
    try: before = git('show', f'{merge}:sw.js')
    except subprocess.CalledProcessError: before = ''
    touched = sorted(changed & (app_files(now) | {'sw.js'}))
    if not touched:
        print('✓ sw.js et fichiers de APP inchangés : VERSION libre'); return 0
    same = before and version(before) == version(now)
    print(('✗' if same else '✓'), f"VERSION {'inchangée' if same else 'changée'} ({version(now)}) ; fichiers modifiés : {', '.join(touched)}")
    if same: print('  → changer VERSION dans sw.js (CONTRIBUTING.md, § Sécurité)')
    return 1 if same else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else 'origin/main'))
