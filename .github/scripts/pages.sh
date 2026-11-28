#!/usr/bin/env bash
# City Map Studio — publication à deux voies sur la branche gh-pages (#97, lot 1 : #99 ; bascule : #104)
#
# Après la bascule (fichier .github/bascule présent dans la branche `main`) :
#   racine       = branche `main`, construite par scripts/build.mjs
#   /classique/  = branche `classique` (version d'origine, figée par l'étiquette v1-classique)
#   /nouvelle/   = renvoi vers la racine, et service worker qui se retire (anciennes installations de /nouvelle/)
# Avant la bascule (sans ce fichier) : racine = `classique`, /nouvelle/ = `main`.
#   /pr-N/       = préversion de la pull request N (supprimée à sa fermeture), dans les deux cas
#
# La disposition suit la branche `main` publiée, pas la pull request : une préversion ne bascule jamais le site.
# Chaque appel republie la racine, /classique/ et /nouvelle/ depuis leurs branches, puis ajoute ou retire la préversion demandée.
# Les autres préversions déjà publiées sont conservées. Seuls les fichiers servis sont copiés (ni tests, ni docs).
#
# Variables :
#   REMOTE   adresse du dépôt (avec jeton en CI)                       — obligatoire
#   PR       numéro de la pull request                                — facultatif
#   PR_DIR   dossier contenant le code de la pull request à publier  — avec PR, pour l'ouvrir ou la mettre à jour
#   PR_CLOSE 1 pour retirer la préversion de la pull request PR
#   PUSH     0 pour ne pas pousser (essai local)                      — 1 par défaut
set -euo pipefail

: "${REMOTE:?REMOTE manquant}"
PUSH="${PUSH:-1}"
SITE=(index.html manifest.webmanifest sw.js .nojekyll css js lib icons)

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Copie le site de $1 vers $2 : construit (dist/, #102) si l'arbre a un build, sinon les seuls fichiers servis
# (version classique, sans build)
copy_site() {
  local src="$1" dst="$2" f
  mkdir -p "$dst"
  if [ -f "$src/scripts/build.mjs" ]; then
    (cd "$src" && npm ci --no-audit --no-fund --silent && node scripts/build.mjs "$work/build") >&2
    cp -R "$work/build/." "$dst/"
    rm -rf "$work/build"
  else
    for f in "${SITE[@]}"; do
      [ -e "$src/$f" ] && cp -R "$src/$f" "$dst/"
    done
  fi
  [ -f "$dst/index.html" ] || { echo "✗ $src : index.html absent" >&2; exit 1; }
}

clone_branch() {
  git clone --quiet --depth 1 --branch "$1" "$REMOTE" "$2"
}

# Version classique sous /classique/ : son service worker (figé) nomme son cache VERSION et efface tous les autres
# caches de l'origine à son activation. La copie publiée nomme son cache « VERSION@dossier » et n'efface que les
# siens, comme la nouvelle version (§ 7.5) : la racine garde sa copie hors ligne. La branche n'est pas modifiée.
patch_classic_sw() {
  local f="$1/sw.js"
  grep -q "caches.open(VERSION)" "$f" && grep -q "keys.filter(k => k !== VERSION)" "$f" \
    || { echo "✗ sw.js de la version classique : motif attendu absent, adaptation impossible" >&2; exit 1; }
  sed -i -e "s|^const VERSION = \('[^']*'\);|const VERSION = \1, CACHE = \`\${VERSION}@\${new URL(self.registration.scope).pathname}\`;|" \
         -e "s|caches.open(VERSION)|caches.open(CACHE)|g" \
         -e "s|keys.filter(k => k !== VERSION)|keys.filter(k => k.endsWith('@' + new URL(self.registration.scope).pathname) \&\& k !== CACHE)|" "$f"
  grep -q "CACHE = " "$f" && ! grep -q "caches.open(VERSION)" "$f" || { echo "✗ sw.js de la version classique : adaptation incomplète" >&2; exit 1; }
}

# Ancienne adresse /nouvelle/ : renvoi vers la racine (adresse, paramètres et lien partagé #a=… conservés) ; le
# service worker installé à cette adresse est remplacé par un worker qui efface ses caches et se retire
write_redirect() {
  mkdir -p "$1"
  cat > "$1/index.html" <<'HTML'
<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0; url=../"><title>City Map Studio</title>
<script>location.replace('../'+location.search+location.hash)</script></head>
<body><p>City Map Studio est maintenant à l'adresse habituelle : <a href="../">ouvrir l'application</a>.</p></body></html>
HTML
  cat > "$1/sw.js" <<'JS'
// Ancienne adresse /nouvelle/ (#104) : efface les caches de ce dossier, se retire et renvoie les pages vers la racine
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  const scope = new URL(self.registration.scope).pathname;
  for (const k of await caches.keys()) if (k.endsWith('@' + scope)) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({type: 'window'})) c.navigate(new URL('../', self.registration.scope).href);
})()));
JS
}

clone_branch classique "$work/classique"
clone_branch main "$work/main"
bascule=0; [ -f "$work/main/.github/bascule" ] && bascule=1

# Branche gh-pages existante, ou créée vide à la première publication
if git ls-remote --exit-code --heads "$REMOTE" gh-pages >/dev/null 2>&1; then
  clone_branch gh-pages "$work/pages"
else
  git init --quiet -b gh-pages "$work/pages"
  git -C "$work/pages" remote add origin "$REMOTE"
fi
pages="$work/pages"

# Racine : tout est remplacé, sauf l'historique git, /classique/, /nouvelle/ et les préversions
find "$pages" -mindepth 1 -maxdepth 1 ! -name .git ! -name classique ! -name nouvelle ! -name 'pr-*' -exec rm -rf {} +
rm -rf "$pages/classique" "$pages/nouvelle"
if [ "$bascule" = 1 ]; then
  copy_site "$work/main" "$pages"
  copy_site "$work/classique" "$pages/classique"
  patch_classic_sw "$pages/classique"
  write_redirect "$pages/nouvelle"
else
  copy_site "$work/classique" "$pages"
  copy_site "$work/main" "$pages/nouvelle"
fi

if [ -n "${PR:-}" ]; then
  [[ "$PR" =~ ^[0-9]+$ ]] || { echo "✗ numéro de pull request invalide : $PR" >&2; exit 1; }
  rm -rf "$pages/pr-$PR"
  if [ "${PR_CLOSE:-0}" != 1 ]; then
    : "${PR_DIR:?PR_DIR manquant}"
    copy_site "$PR_DIR" "$pages/pr-$PR"
  fi
fi

label=""
if [ -n "${PR:-}" ]; then
  if [ "${PR_CLOSE:-0}" = 1 ]; then label=", PR #$PR retirée"; else label=", PR #$PR"; fi
fi

cd "$pages"
git add --all
if git diff --cached --quiet; then
  echo "✓ gh-pages déjà à jour"
  exit 0
fi
git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit --quiet -m "Publication$([ "$bascule" = 1 ] && echo ' (après bascule)') : classique $(git -C "$work/classique" rev-parse --short HEAD), main $(git -C "$work/main" rev-parse --short HEAD)$label"
echo "✓ $(git log -1 --format=%s)"
echo "  préversions publiées : $(ls -d pr-* 2>/dev/null | tr '\n' ' ' || true)"
if [ "$PUSH" = 1 ]; then
  git push --quiet origin gh-pages
fi
