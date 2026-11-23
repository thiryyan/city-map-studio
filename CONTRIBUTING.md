# Contribuer à City Map Studio

Spécification complète : [`docs/dossier-technique.md`](docs/dossier-technique.md). L'état de validation figure au § 9 ; les évolutions prévues sont suivies dans les [issues](https://github.com/thiryyan/city-map-studio/issues).

## Règles non négociables
- **100 % open source** : aucune clé API, aucun service propriétaire (ni ArcGIS, ni Mapbox, ni Google Maps).
- **HTML, CSS et JavaScript natifs, sans étape de build**, servis tels quels par GitHub Pages depuis `main` : `index.html`, `css/app.css`, `js/*.js`. Chemins toujours relatifs (le site est servi sous `/city-map-studio/`). Scripts **classiques**, pas de module ES : l'application doit rester utilisable en `file://`. Dépendances embarquées dans `lib/` (MapLibre, polices), chacune avec sa licence.
- **Mobile en priorité**, puis ordinateur. Interface en français.
- `drawPoster(ctx, W, H, pass, mapFn)` est la **seule** fonction de rendu de l'affiche : l'aperçu et l'export doivent rester identiques.
- Attributions : « © OpenStreetMap » (et « © OpenMapTiles » avec le moteur GPU) toujours inscrit sur l'affiche, mention complète active par défaut (`attributionText`) ; sources rappelées en légende sous l'aperçu, hors de l'affiche (`#mapCredit`). Licences ODbL et CC-BY 4.0.
- **Aucune ressource tierce pour la présentation** (CDN de polices, de styles ou de scripts) : tout est servi depuis le dépôt (RGPD, cf. dossier E14). Les CDN de MapLibre ne servent qu'en secours.
- **Accord préalable** : tout nouvel appel à un service tiers passe par `needConsent()` ; aucune requête externe avant l'accord de l'utilisateur (`tests/consent.py`).
- **Nominatim** : requêtes uniquement à la demande (jamais pendant la frappe), une seule à la fois, toujours par `CMS.geocoder` (`js/geocoder.js` : délai, une requête par seconde au plus, quota 429 / 403, cache, réponses validées).

## Sécurité, accessibilité
- **Aucun script ni style en ligne** (ni `<script>` sans `src`, ni `style="…"`, ni `onclick="…"`, ni `innerHTML` avec des styles) : la CSP les bloque. Créer les éléments avec `h(tag, props, …enfants)`, les styles par le CSSOM (`el.style.x = …`) ou des classes.
- **Nouveau service réseau** : l'ajouter à `connect-src` dans la CSP de `index.html`, en plus de `needConsent()`.
- **Nouveau champ d'état** : l'ajouter à `DEFAULT_STATE` **et** à `normState()` (`js/state.js`), avec sa vérification ; sinon il est ignoré au chargement (enregistrement local, lien partagé, Mes affiches et fichiers de configuration passent tous par `normState`).
- **Nouvelle version de MapLibre** : remplacer `lib/`, mettre à jour `ML_VERSION` et les empreintes `ML_SRI` (`openssl dgst -sha384 -binary lib/maplibre-gl.js | base64`).
- **Nouveau fichier de l'application** (`js/`, `css/`) : l'ajouter à la liste `APP` de `sw.js` ; changer `VERSION` dans `sw.js` à chaque modification de cette liste ou de `sw.js`.
- **Fenêtre modale** : un `<dialog class="modal">` ouvert par `openDialog(id)` et fermé par `closeDialog(id)` (focus rendu) ; action de la touche Échap dans `dlgCancel`.
- Tout bouton de sélection (vignette, carte) est un `<button type="button">` avec `aria-pressed` (`pressed(b, on)`) ; tout champ a un nom accessible (`<label for>` ou `aria-label`).
- **Couleurs de l'interface** : passer par les variables de `:root` (`css/app.css`) ; texte 4,5:1 et composants 3:1 au moins, états inactifs compris (`--off`), vérifiés par `tests/contrast.py`.
- **Grands formats** : ne jamais créer de canevas d'export plus grand que `exportSpec()` (limite `CANVAS_MAX_PX`) ni de carte WebGL de plus de `glMax()` px de côté (`renderMaplibreOffscreen` découpe en tuiles). Tout rendu MapLibre hors écran passe par `mlSnapshot` (file d'attente `gpuQueue` : un seul contexte hors écran à la fois).

## Organisation
- `index.html` : balisage, CSP et métadonnées seulement. `css/app.css` : styles. `js/*.js` : scripts chargés dans l'ordre (dossier, § 8.2), organisés en sections `// ---------- Titre ----------`. Le code exécuté au chargement d'un fichier ne doit utiliser que les fichiers précédents.
- **Modules `CMS`** (`js/core.js`, chargé en premier) : un fichier déclare son code dans `CMS.define('nom', () => { …; return {publiques}; });` puis reprend ses seules fonctions publiques en tête de portée (`const {a, b} = CMS.nom;`) ; le reste lui est privé. Les fichiers se parlent par événements (`CMS.on` / `CMS.emit`, ex. `state:saved`) plutôt que par `typeof f === 'function'`. Le nombre de déclarations globales ne peut pas augmenter (`tests/globals.py`, plafond `tests/globals.max`, à abaisser quand il baisse). Une fonction pure gagne un test dans `tests/unit/`.
- `window.__cms` expose l'état et les fonctions pour la console et les tests, seulement avec `?test` dans l'adresse (ou `localStorage['cityMapStudio.debug']='1'`).
- `sw.js`, `manifest.webmanifest`, `icons/` : application installable et cache hors ligne.
- `lib/` : MapLibre GL JS 4.7.1 et sa licence BSD-3. `lib/sky/` : données du ciel (d3-celestial, BSD-3), chargées seulement par le gabarit Ciel. Pour changer de version, remplacer les fichiers et mettre à jour `ML_VERSION`.
- `lib/fonts/` : polices woff2 (paquets npm `@fontsource/*`, sous-ensembles latin et latin-ext), déclarées dans `lib/fonts/fonts.css`. Pour ajouter une famille : copier ses fichiers woff2 et sa licence `OFL.txt`, ajouter ses `@font-face` (avec `unicode-range`), puis l'entrée correspondante dans `FONTS`.
- `tests/` : tests de bout en bout Playwright (Python) avec un réseau simulé. Un test qui recharge la page prépare le `localStorage` avec `tests/seed.py`, pas avec `add_init_script` (perte d'écritures au rechargement, cf. dossier § 9.2), et attend que l'état soit enregistré avant de recharger.

## Commandes
```bash
pip install playwright mapbox-vector-tile && python -m playwright install chromium   # une fois
python tests/fixture.py && python tests/make_formats.py && python tests/make_city.py   # génère les données de test
python tests/run_all.py          # toute la suite, un test par cœur en parallèle (génère les données, résume les échecs) — lancée aussi par la CI
python tests/run_all.py -j 1     # un test à la fois
python tests/run.py              # moteur Fichier + export PNG 2480×3508 / pHYs 300 DPI
python tests/offline.py          # réseau coupé : diagnostic, import json/osm/geojson, iframe
python tests/layouts.py          # captures des gabarits
python tests/maplibre.py         # moteur Vectoriel GPU : lib/ + OpenFreeMap simulé, export hors écran
python tests/keyboard.py         # clavier : carte du moteur Fichier, résultats de recherche (focus, descriptions, Échap)
python tests/perf.py             # épaisseurs GPU en expressions de zoom (aucun setStyle pendant les gestes), densité de pixels, graphèmes
python tests/unit.py             # tests unitaires sans navigateur (node --test tests/unit/*.test.mjs : CMS.geo, normState, CMS.geocoder)
python tests/globals.py          # garde-fou : nombre de déclarations globales ≤ tests/globals.max
python tests/attribution.py      # attributions : mention minimale toujours sur l'affiche, sources en légende sous l'aperçu
python tests/webgl.py            # WebGL : perte et restauration du contexte, rendus hors écran en file d'attente, carte libérée en moteur Fichier
python tests/geocoder.py         # recherche Nominatim : délai, quota, relance 5xx, cache, réponses piégées
python tests/mlloader.py         # chargement de MapLibre : CDN de secours, copie tardive, version, CSS de secours
python tests/coords.py           # saisie des coordonnées du repère
python tests/texts.py            # lignes de texte optionnelles
python tests/textsize.py         # taille des textes de l'affiche (par ligne et globale)
python tests/dedication.py       # dédicace sur deux lignes : Auto, Une ligne, Deux lignes ; la carte fait de la place
python tests/formats.py          # formats A4, A3, 50 × 70 cm, limites des canevas (ordinateur, iPhone), export PDF
python tests/mobile.py           # panneau coulissant, mode Cadrer, paysage, A− / A+
python tests/ux.py               # parcours guidé, accessibilité, annuler / rétablir, date, position, recherche
python tests/design.py           # polices, thèmes, gabarits, ambiances, lieux, papier, mur, lien, paysage, GPX, ciel
python tests/vectors.py          # cache de tracés du moteur Fichier
python tests/city.py             # ville réaliste (tests/city.json) : import JSON et XML, fleuve, ponts, fluidité, exports
python tests/saves.py            # Mes affiches : enregistrer, restaurer, fichier de configuration, sauvegarde complète, fichiers piégés
python tests/make_og.py          # régénère icons/og-image.jpg (aperçu des liens partagés) avec le rendu actuel
python tests/art.py              # pistes artistiques : effets, dorure, ornements, Lettres, papiers, ciel, palette d'une photo
python tests/compare.py          # comparer avant / après un changement de thème
python tests/welcome.py          # ambiance proposée au premier lancement
python tests/fonts.py            # polices auto-hébergées, aucun appel tiers
python tests/consent.py          # accord préalable : aucune requête tierce sans accord
python tests/reset.py            # réinitialisation des réglages par défaut
python tests/security.py         # lien forgé ou piégé, état corrompu, crochets de test
python tests/a11y.py             # fenêtres modales, clavier, cibles tactiles, noms accessibles
python tests/contrast.py         # contrastes de l'interface (WCAG 1.4.3 et 1.4.11), états inactifs compris
python tests/csp.py              # aucune violation de la politique de sécurité du contenu
python tests/pwa.py              # sous-chemin GitHub Pages, manifeste, service worker, hors ligne
python tests/illus.py            # mode Illustration : prompt, import (refus GIF / fichier endommagé), qualité, cadrage, retouches, titre, export
python -m http.server 8000       # aperçu local : http://localhost:8000
```
Variable optionnelle `CHROME=/chemin/vers/chrome` pour utiliser un Chrome ou Chromium installé.

`tests/city.json` (généré par `tests/make_city.py`) est une ville fictive mais réaliste — fleuve à îles, vieille ville et château, faubourgs, grand ensemble, pavillons, port, gare, rocade, campagne, ~18 500 bâtiments — à importer aussi dans l'application (onglet Lieu, section Avancé, moteur Fichier) pour juger un rendu sans réseau ; elle est centrée sur la vue par défaut.

## Avant chaque commit
- Lancer `python tests/run_all.py` : « Tous les tests passent » (aucune vérification ✗, aucun `PAGEERROR`, aucune violation de la CSP ; exports A4 de 2480 × 3508 px). La même suite tourne dans GitHub Actions à chaque pull request et à chaque push sur `main` (un nouveau push annule l'exécution en cours). Un test en échec est relancé seul une fois : s'il passe, il est signalé « INSTABLE » à corriger.
- Les tests ouvrent la page avec `?test` ; pour attendre une condition, utiliser `wait_js` (`tests/jswait.py`), jamais `page.wait_for_function` (refusé par la CSP).
- Vérifier visuellement l'export avec le gabarit et le thème Souvenir (dossier, § 4.1 et 4.2).
- Mettre à jour le dossier technique quand un comportement change.

## Branches
- `main` : version publiée sur GitHub Pages.
- `develop` : intégration ; fusion vers `main` par pull request.
