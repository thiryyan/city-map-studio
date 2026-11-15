# Contribuer à City Map Studio

Spécification complète : [`docs/dossier-technique.md`](docs/dossier-technique.md). L'état de validation et la feuille de route figurent aux § 10 et 11.

## Règles non négociables
- **100 % open source** : aucune clé API, aucun service propriétaire (ni ArcGIS, ni Mapbox, ni Google Maps).
- **Un seul `index.html`** (HTML + CSS + JavaScript natifs), **sans étape de build**, servi par GitHub Pages depuis `main`. Seule exception : la librairie MapLibre, fournie dans `lib/` avec sa licence.
- **Mobile en priorité**, puis ordinateur. Interface en français.
- `drawPoster(ctx, W, H, pass, mapFn)` est la **seule** fonction de rendu de l'affiche : l'aperçu et l'export doivent rester identiques.
- Attribution « © contributeurs OpenStreetMap » active par défaut (licence ODbL).
- **Overpass et Nominatim** : requêtes uniquement à la demande, une seule à la fois ; un serveur qui répond 406 ou 429 n'est plus rappelé pendant sa suspension (risque de bannissement d'IP).

## Organisation
- `index.html` : sections balisées `// ---------- Titre ----------` (dossier, § 9.2). `window.__cms` expose l'état et les fonctions pour la console et les tests.
- `lib/` : MapLibre GL JS 4.7.1 et sa licence BSD-3. Pour changer de version, remplacer les fichiers et mettre à jour `ML_VERSION`.
- `tests/` : tests de bout en bout Playwright (Python) avec un réseau simulé.

## Commandes
```bash
pip install playwright mapbox-vector-tile && python -m playwright install chromium   # une fois
python tests/fixture.py && python tests/make_formats.py   # génère les données de test
python tests/run.py              # moteur Overpass simulé + export PNG 2480×3508 / pHYs 300 DPI
python tests/offline.py          # réseau coupé : diagnostic, import json/osm/geojson, iframe
python tests/layouts.py          # captures des gabarits
python tests/maplibre.py         # moteur Vectoriel GPU : lib/ + OpenFreeMap simulé, export hors écran
python tests/overpass_policy.py  # 406/429 : suspension des miroirs, aucun nouvel essai
python tests/coords.py           # saisie des coordonnées du repère
python -m http.server 8000       # aperçu local : http://localhost:8000
```
Variable optionnelle `CHROME=/chemin/vers/chrome` pour utiliser un Chrome ou Chromium installé.

## Avant chaque commit
- Lancer `run.py`, `offline.py`, `maplibre.py`, `overpass_policy.py` et `coords.py` : ils doivent finir sans `PAGEERROR`, et les exports doivent mesurer 2480 × 3508 px.
- Vérifier visuellement l'export par rapport au modèle (dossier, § 2).
- Mettre à jour le dossier technique quand un comportement change.

## Branches
- `main` : version publiée sur GitHub Pages.
- `develop` : intégration ; fusion vers `main` par pull request.
