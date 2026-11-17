# Contribuer à City Map Studio

Spécification complète : [`docs/dossier-technique.md`](docs/dossier-technique.md). L'état de validation figure au § 9 ; les évolutions prévues sont suivies dans les [issues](https://github.com/thiryyan/city-map-studio/issues).

## Règles non négociables
- **100 % open source** : aucune clé API, aucun service propriétaire (ni ArcGIS, ni Mapbox, ni Google Maps).
- **Un seul `index.html`** (HTML + CSS + JavaScript natifs), **sans étape de build**, servi par GitHub Pages depuis `main`. Seule exception : les dépendances embarquées dans `lib/` (MapLibre, polices), chacune avec sa licence.
- **Mobile en priorité**, puis ordinateur. Interface en français.
- `drawPoster(ctx, W, H, pass, mapFn)` est la **seule** fonction de rendu de l'affiche : l'aperçu et l'export doivent rester identiques.
- Attribution « © contributeurs OpenStreetMap » active par défaut (licence ODbL).
- **Aucune ressource tierce pour la présentation** (CDN de polices, de styles ou de scripts) : tout est servi depuis le dépôt (RGPD, cf. dossier E14). Les CDN de MapLibre ne servent qu'en secours.
- **Accord préalable** : tout nouvel appel à un service tiers passe par `needConsent()` ; aucune requête externe avant l'accord de l'utilisateur (`tests/consent.py`).
- **Overpass et Nominatim** : requêtes uniquement à la demande, une seule à la fois ; un serveur qui répond 406 ou 429 n'est plus rappelé pendant sa suspension (risque de bannissement d'IP).

## Organisation
- `index.html` : sections balisées `// ---------- Titre ----------` (dossier, § 8.2). `window.__cms` expose l'état et les fonctions pour la console et les tests.
- `lib/` : MapLibre GL JS 4.7.1 et sa licence BSD-3. `lib/sky/` : données du ciel (d3-celestial, BSD-3), chargées seulement par le gabarit Ciel. Pour changer de version, remplacer les fichiers et mettre à jour `ML_VERSION`.
- `lib/fonts/` : polices woff2 (paquets npm `@fontsource/*`, sous-ensembles latin et latin-ext), déclarées dans `lib/fonts/fonts.css`. Pour ajouter une famille : copier ses fichiers woff2 et sa licence `OFL.txt`, ajouter ses `@font-face` (avec `unicode-range`), puis l'entrée correspondante dans `FONTS`.
- `tests/` : tests de bout en bout Playwright (Python) avec un réseau simulé. Un test qui recharge la page prépare le `localStorage` avec `tests/seed.py`, pas avec `add_init_script` (perte d'écritures au rechargement, cf. dossier § 9.2), et attend que l'état soit enregistré avant de recharger.

## Commandes
```bash
pip install playwright mapbox-vector-tile && python -m playwright install chromium   # une fois
python tests/fixture.py && python tests/make_formats.py   # génère les données de test
python tests/run.py              # moteur Overpass simulé + export PNG 2480×3508 / pHYs 300 DPI
python tests/offline.py          # réseau coupé : diagnostic, import json/osm/geojson, iframe
python tests/layouts.py          # captures des gabarits
python tests/maplibre.py         # moteur Vectoriel GPU : lib/ + OpenFreeMap simulé, export hors écran
python tests/overpass_policy.py  # 406/429 : suspension des miroirs, aucun nouvel essai
python tests/overpass_outage.py  # panne des miroirs : message « serveurs en panne », diagnostic
python tests/coords.py           # saisie des coordonnées du repère
python tests/texts.py            # lignes de texte optionnelles
python tests/textsize.py         # taille des textes de l'affiche (par ligne et globale)
python tests/mobile.py           # panneau coulissant, mode Cadrer, paysage, A− / A+
python tests/ux.py               # parcours guidé, accessibilité, annuler / rétablir, date, position, recherche
python tests/design.py           # polices, thèmes, gabarits, ambiances, lieux, papier, mur, lien, paysage, GPX, ciel
python tests/welcome.py          # ambiance proposée au premier lancement
python tests/fonts.py            # polices auto-hébergées, aucun appel tiers
python tests/consent.py          # accord préalable : aucune requête tierce sans accord
python tests/reset.py            # réinitialisation des réglages par défaut
python -m http.server 8000       # aperçu local : http://localhost:8000
```
Variable optionnelle `CHROME=/chemin/vers/chrome` pour utiliser un Chrome ou Chromium installé.

## Avant chaque commit
- Lancer `run.py`, `offline.py`, `maplibre.py`, `overpass_policy.py`, `overpass_outage.py`, `coords.py`, `texts.py`, `textsize.py`, `mobile.py`, `ux.py`, `design.py`, `welcome.py`, `fonts.py`, `consent.py` et `reset.py` : ils doivent finir sans `PAGEERROR`, et les exports doivent mesurer 2480 × 3508 px.
- Vérifier visuellement l'export avec le gabarit et le thème Souvenir (dossier, § 4.1 et 4.2).
- Mettre à jour le dossier technique quand un comportement change.

## Branches
- `main` : version publiée sur GitHub Pages.
- `develop` : intégration ; fusion vers `main` par pull request.
