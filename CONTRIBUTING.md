# Contribuer à City Map Studio

Spécification complète : [`docs/dossier-technique.md`](docs/dossier-technique.md) ; usage : [`USER_GUIDE.md`](USER_GUIDE.md). Les tests et les validations restantes figurent au § 9 du dossier ; les évolutions prévues sont suivies dans les [issues](https://github.com/thiryyan/city-map-studio/issues).

## Règles non négociables
- **100 % open source** : aucune clé API, aucun service propriétaire (ni ArcGIS, ni Mapbox, ni Google Maps).
- **HTML, CSS et JavaScript natifs, sans étape de build**, servis tels quels par GitHub Pages (branche `gh-pages`, remplie par la CI : dossier § 7.6) : `index.html`, `css/app.css`, `js/*.js`. Chemins toujours relatifs (le site est servi sous `/city-map-studio/`). Scripts **classiques**, pas de module ES : l'application doit rester utilisable en `file://`. Dépendances embarquées dans `lib/` (MapLibre, polices), chacune avec sa licence.
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
- **Nouveau fichier de l'application** (`js/`, `css/`, `lib/` hors `lib/sky/`) : l'ajouter à la liste `APP` de `sw.js` (vérifié par `tests/pwa.py`). **Changer `VERSION`** dans `sw.js` à chaque modification de `sw.js`, de la liste `APP` ou d'un fichier qu'elle contient, et sa copie à l'identique dans `js/core.js` (`CMS.build`, version affichée par la page) : sinon les applications installées ne voient pas la mise à jour (vérifié en CI par `tests/swversion.py`, et l'égalité des deux par `tests/pwa.py`). Les utilisateurs se voient proposer « Mettre à jour » ; rien n'est rechargé sans leur accord (dossier, § 7.5).
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
- `tests/` : tests de bout en bout Playwright (Python) avec un réseau simulé. Un test qui recharge la page prépare le `localStorage` avec `tests/seed.py`, pas avec `add_init_script` (perte d'écritures au rechargement, cf. dossier § 9.1), et attend que l'état soit enregistré avant de recharger.

## Commandes
```bash
pip install playwright mapbox-vector-tile && python -m playwright install chromium   # une fois
python tests/run_all.py          # toute la suite, un test par cœur (génère les données, résume les échecs) — lancée aussi par la CI
python tests/run_all.py -j 1     # un test à la fois
python tests/run_all.py ux saves # seulement ces tests (ou : python tests/ux.py, après génération des données)
python tests/fixture.py && python tests/make_formats.py && python tests/make_city.py   # génère seulement les données de test
python tests/swversion.py        # VERSION de sw.js changée si sw.js ou un fichier de APP diffère de origin/main (lancé par la CI)
python tests/layouts.py          # captures des 11 gabarits (contrôle visuel, hors suite)
python tests/make_og.py          # régénère icons/og-image.jpg (aperçu des liens partagés) avec le rendu actuel
python -m http.server 8000       # aperçu local : http://localhost:8000
```
Variable optionnelle `CHROME=/chemin/vers/chrome` pour utiliser un Chrome ou Chromium installé. Le rôle et les critères de chaque test sont décrits dans le [catalogue des tests](docs/dossier-technique.md#92-catalogue-et-critères-dacceptation) (dossier, § 9.2) ; un nouveau test y est ajouté, ainsi que dans la liste `TESTS` de `tests/run_all.py`.

`tests/city.json` (généré par `tests/make_city.py`) est une ville fictive mais réaliste — fleuve à îles, vieille ville et château, faubourgs, grand ensemble, pavillons, port, gare, rocade, campagne, ~18 500 bâtiments — à importer aussi dans l'application (onglet Lieu, section Avancé, moteur Fichier) pour juger un rendu sans réseau ; elle est centrée sur la vue par défaut.

## Avant chaque commit
- Lancer `python tests/run_all.py` : « Tous les tests passent » (aucune vérification ✗, aucun `PAGEERROR`, aucune violation de la CSP ; exports A4 de 2480 × 3508 px). La même suite tourne dans GitHub Actions à chaque pull request et à chaque push sur `main` (un nouveau push annule l'exécution en cours). Un test en échec est relancé seul une fois : s'il passe, il est signalé « INSTABLE » à corriger.
- Les tests ouvrent la page avec `?test` ; pour attendre une condition, utiliser `wait_js` (`tests/jswait.py`), jamais `page.wait_for_function` (refusé par la CSP).
- Vérifier visuellement l'export avec le gabarit et le thème Souvenir (dossier, § 4.1 et 4.2).
- Mettre à jour le dossier technique quand un comportement change, et le guide de l'utilisateur quand une commande, une option ou un libellé change.

## Branches et publication (#97)
- `main` : version en cours de refonte, publiée sous `/nouvelle/` après des tests réussis.
- `classique` : version de référence (étiquette `v1-classique`), publiée à la racine ; correctifs seulement, puis relancer le workflow à la main.
- `gh-pages` : site publié, écrit seulement par la CI (`.github/scripts/pages.sh`) ; ne jamais la modifier à la main.
- Chaque pull request est publiée en préversion sous `/pr-N/` (lien posté dans la pull request, retirée à sa fermeture).
- `develop` : intégration ; fusion vers `main` par pull request.
