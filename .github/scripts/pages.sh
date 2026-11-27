#!/usr/bin/env bash
# City Map Studio — publication à deux voies sur la branche gh-pages (#97, lot 1 : #99)
#
#   racine      = branche `classique` (version de référence, figée par l'étiquette v1-classique)
#   /nouvelle/  = branche `main` (version en cours de refonte)
#   /pr-N/      = préversion de la pull request N (supprimée à sa fermeture)
#
# Chaque appel republie la racine et /nouvelle/ depuis leurs branches, puis ajoute ou retire la préversion demandée.
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

# Copie les seuls fichiers servis de $1 vers $2
copy_site() {
  local src="$1" dst="$2" f
  mkdir -p "$dst"
  for f in "${SITE[@]}"; do
    [ -e "$src/$f" ] && cp -R "$src/$f" "$dst/"
  done
  [ -f "$dst/index.html" ] || { echo "✗ $src : index.html absent" >&2; exit 1; }
}

clone_branch() {
  git clone --quiet --depth 1 --branch "$1" "$REMOTE" "$2"
}

clone_branch classique "$work/classique"
clone_branch main "$work/main"

# Branche gh-pages existante, ou créée vide à la première publication
if git ls-remote --exit-code --heads "$REMOTE" gh-pages >/dev/null 2>&1; then
  clone_branch gh-pages "$work/pages"
else
  git init --quiet -b gh-pages "$work/pages"
  git -C "$work/pages" remote add origin "$REMOTE"
fi
pages="$work/pages"

# Racine : tout est remplacé, sauf l'historique git, /nouvelle/ et les préversions
find "$pages" -mindepth 1 -maxdepth 1 ! -name .git ! -name nouvelle ! -name 'pr-*' -exec rm -rf {} +
copy_site "$work/classique" "$pages"

rm -rf "$pages/nouvelle"
copy_site "$work/main" "$pages/nouvelle"

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
  commit --quiet -m "Publication : classique $(git -C "$work/classique" rev-parse --short HEAD), main $(git -C "$work/main" rev-parse --short HEAD)$label"
echo "✓ $(git log -1 --format=%s)"
echo "  préversions publiées : $(ls -d pr-* 2>/dev/null | tr '\n' ' ' || true)"
if [ "$PUSH" = 1 ]; then
  git push --quiet origin gh-pages
fi
