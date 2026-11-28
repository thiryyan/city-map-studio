# Contribuer à City Map Studio

Spécification complète : [`docs/dossier-technique.md`](docs/dossier-technique.md) ; usage : [`USER_GUIDE.md`](USER_GUIDE.md). Les tests et les validations restantes figurent au § 9 du dossier ; les évolutions prévues sont suivies dans les [issues](https://github.com/thiryyan/city-map-studio/issues).

## Règles non négociables
- **100 % open source** : aucune clé API, aucun service propriétaire (ni ArcGIS, ni Mapbox, ni Google Maps).
- **HTML, CSS et TypeScript**, en **modules ES** (`src/app/main.ts` et ses imports) ; les sources ne s'ouvrent plus telles quelles (fichiers `.ts`) : `npm run dev` construit le site puis le sert en http ; le site publié est construit par `npm run build` (`dist/` : un seul script et une feuille minifiés, `sw.js` généré ; dossier § 7.8), puis publié par la CI sur la branche `gh-pages` (§ 7.6). Sources : `index.html`, `css/app.css`, `js/*.ts`. Chemins toujours relatifs (le site est servi sous `/city-map-studio/`). Le site construit (`dist/`, un seul script classique) reste utilisable en `file://`. Dépendances embarquées dans `lib/` (MapLibre, polices), chacune avec sa licence.
- **Mobile en priorité**, puis ordinateur. Interface en français.
- `drawPoster(ctx, W, H, pass, mapFn)` est la **seule** fonction de rendu de l'affiche : l'aperçu et l'export doivent rester identiques.
- Attributions : « © OpenStreetMap » (et « © OpenMapTiles » avec le moteur GPU) toujours inscrit sur l'affiche, mention complète active par défaut (`attributionText`) ; sources rappelées en légende sous l'aperçu, hors de l'affiche (`#mapCredit`). Licences ODbL et CC-BY 4.0.
- **Aucune ressource tierce pour la présentation** (CDN de polices, de styles ou de scripts) : tout est servi depuis le dépôt (RGPD, cf. dossier E14). Les CDN de MapLibre ne servent qu'en secours.
- **Accord préalable** : tout nouvel appel à un service tiers passe par `needConsent()` ; aucune requête externe avant l'accord de l'utilisateur (`tests/consent.py`).
- **Nominatim** : requêtes uniquement à la demande (jamais pendant la frappe), une seule à la fois, toujours par `CMS.geocoder` (`src/services/geocoder.ts` : délai, une requête par seconde au plus, quota 429 / 403, cache, réponses validées).

## Sécurité, accessibilité
- **Aucun script ni style en ligne** (ni `<script>` sans `src`, ni `style="…"`, ni `onclick="…"`, ni `innerHTML` avec des styles) : la CSP les bloque. Créer les éléments avec `h(tag, props, …enfants)`, les styles par le CSSOM (`el.style.x = …`) ou des classes.
- **Nouveau service réseau** : l'ajouter à `connect-src` dans la CSP de `index.html`, en plus de `needConsent()`.
- **Nouveau champ d'état** : l'ajouter à `DEFAULT_STATE` **et** à `normState()` (`src/core/doc/state.ts`), avec sa vérification ; sinon il est ignoré au chargement (enregistrement local, lien partagé, Mes affiches et fichiers de configuration passent tous par `normState`).
- **Nouvelle version de MapLibre** : remplacer `lib/`, mettre à jour `ML_VERSION` et les empreintes `ML_SRI` (`openssl dgst -sha384 -binary lib/maplibre-gl.js | base64`).
- **Nouveau script** : l'ajouter aux `<script>` de `index.html`, à sa place dans l'ordre ; le build le reprend. **`VERSION`** (`sw.js`) et `CMS.build` (`src/core/cms.ts`) valent `0.0.0-dev` dans les sources et sont générés au build (`<version de package.json>+<empreinte>`, SemVer), comme la liste `APP` : seule la `version` de `package.json` se change à la main (dossier, § 7.8). Une nouvelle dépendance de `lib/` chargée au démarrage s'ajoute à la liste `app` de `scripts/build.mjs` (vérifié par `tests/pwa.py`). Les utilisateurs se voient proposer « Mettre à jour » ; rien n'est rechargé sans leur accord (dossier, § 7.5).
- **Stockage local** : toute clé `localStorage` commence par `cms3.` et la seule base IndexedDB est `cms3` ; ne jamais lire ni écrire `cityMapStudio.*`, réservé à la version classique publiée sur la même origine (`tests/storage.py`, #100).
- **Fenêtre modale** : un `<dialog class="modal">` ouvert par `openDialog(id)` et fermé par `closeDialog(id)` (focus rendu) ; action de la touche Échap dans `dlgCancel`.
- Tout bouton de sélection (vignette, carte) est un `<button type="button">` avec `aria-pressed` (`pressed(b, on)`) ; tout champ a un nom accessible (`<label for>` ou `aria-label`).
- **Couleurs de l'interface** : passer par les variables de `:root` (`css/app.css`) ; texte 4,5:1 et composants 3:1 au moins, états inactifs compris (`--off`), vérifiés par `tests/contrast.py`.
- **Grands formats** : ne jamais créer de canevas d'export plus grand que `exportSpec()` (limite `CANVAS_MAX_PX`) ni de carte WebGL de plus de `glMax()` px de côté (`renderMaplibreOffscreen` découpe en tuiles). Tout rendu MapLibre hors écran passe par `mlSnapshot` (file d'attente `gpuQueue` : un seul contexte hors écran à la fois).

## Organisation
- `index.html` : balisage, CSP et métadonnées seulement. `css/app.css` : styles. `src/<domaine>/*.ts` : modules chargés dans l'ordre (dossier, § 8.2), organisés en sections `// ---------- Titre ----------`. Le code exécuté au chargement d'un fichier ne doit utiliser que les fichiers précédents.
- **Modules ES et couches** (#102, #118) : chaque fichier de `src/` importe ce qu'il utilise et exporte ce que les autres utilisent. Les dossiers sont des couches : `content` (données pures) < `core` < `render`, `services`, `storage` < `map` < `view` < `features` < `ui` < `app` ; un fichier n'importe que des couches inférieures (`tests/layers.py`). Pour prévenir une couche supérieure, émettre un événement (`CMS.emit`), qu'elle écoute (`CMS.on`). Le registre `late` de `src/core/cms.ts` est en voie de suppression : n'y ajouter aucun nom (plafond `tests/layers.max`).
- **TypeScript** (#103) : tout `src/` est en TypeScript, vérifié en mode strict (`tsconfig.json`) ; un nouveau fichier s'écrit en `.ts` (`tests/typecheck.py` refuse un `.js` dans `js/`). Les imports gardent l'extension `.js` (`import {st} from './state.js'`) : esbuild et `tsc` la résolvent vers le `.ts`. Les types partagés sont exportés du module qui les définit (`PosterState`, `Colors`, `Route` dans `config.ts` ; `Rect`, `View`, `Geom` dans `geo.ts` ; `OsmData` dans `engines.ts`) ; les noms globaux (`CMS`, MapLibre, données du ciel) sont décrits par `src/types.d.ts`. Un module défini par `CMS.define` est réexporté depuis la valeur rendue (`const GEO = CMS.define('geo', …)`) pour que ses fonctions restent typées. `any` (ou le sac d'options `Opts`) pour les données externes (MapLibre, OSM, IndexedDB) et les options de tracé ; une valeur supposée présente (élément du balisage, contexte 2D) prend `!` là où elle est obtenue. `npm run typecheck` (`tsc`, sans sortie) tourne dans `tests/typecheck.py`.
- **Modules `CMS`** (`src/core/cms.ts`) : `CMS.define('nom', () => { …; return {publiques}; })` range des fonctions sous `CMS.nom` ; les fichiers se parlent aussi par événements (`CMS.on` / `CMS.emit`, ex. `state:saved`). Une fonction pure gagne un test dans `tests/unit/` (Vitest, `npm run unit` ; chargeur `tests/unit/load.mjs` : modules réunis par esbuild, exports visibles par leur nom).
- `window.__cms` expose l'état et les fonctions pour la console et les tests, seulement avec `?test` dans l'adresse (ou `localStorage['cms3.debug']='1'`).
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
npm ci && npm run build         # site publié dans dist/ (Node 22)
CMS_ROOT=dist python tests/run_all.py   # la suite sur dist/, comme la CI (npm test fait les deux)
python tests/layouts.py          # captures des 11 gabarits (contrôle visuel, hors suite)
python tests/make_og.py          # régénère icons/og-image.jpg (aperçu des liens partagés) avec le rendu actuel
npm run dev                      # construit puis sert dist/ : http://localhost:8000 (relancer après chaque modification)
npm run typecheck                # tsc : types de src/ (strict)
npm run unit                     # tests unitaires (Vitest, sans navigateur)
python tests/poids.py            # budgets de poids de dist/ (après npm run build)
```
Variable optionnelle `CHROME=/chemin/vers/chrome` pour utiliser un Chrome ou Chromium installé. Le rôle et les critères de chaque test sont décrits dans le [catalogue des tests](docs/dossier-technique.md#92-catalogue-et-critères-dacceptation) (dossier, § 9.2) ; un nouveau test y est ajouté, ainsi que dans la liste `TESTS` de `tests/run_all.py`.

`tests/city.json` (généré par `tests/make_city.py`) est une ville fictive mais réaliste — fleuve à îles, vieille ville et château, faubourgs, grand ensemble, pavillons, port, gare, rocade, campagne, ~18 500 bâtiments — à importer aussi dans l'application (onglet Lieu, section Avancé, moteur Fichier) pour juger un rendu sans réseau ; elle est centrée sur la vue par défaut.

## Avant chaque commit
- Lancer `npm test` (build, puis la suite sur `dist/`), ou `python tests/run_all.py` (qui construit `dist/` d'abord) : « Tous les tests passent » (aucune vérification ✗, aucun `PAGEERROR`, aucune violation de la CSP ; exports A4 de 2480 × 3508 px). La même suite tourne sur `dist/` dans GitHub Actions à chaque pull request et à chaque push sur `main` (un nouveau push annule l'exécution en cours). Un test en échec est relancé seul une fois : s'il passe, il est signalé « INSTABLE » à corriger.
- Les tests n'atteignent l'application que par `window.__cms`, `CMS` et la façade de test de `src/app/main.ts` (exposée en mode `?test` seulement) : le site construit n'a aucun nom global, un nom utilisé directement par un test doit y figurer (sinon `ReferenceError` sur `dist/`).
- Les tests ouvrent la page avec `?test` ; pour attendre une condition, utiliser `wait_js` (`tests/jswait.py`), jamais `page.wait_for_function` (refusé par la CSP).
- Vérifier visuellement l'export avec le gabarit et le thème Souvenir (dossier, § 4.1 et 4.2).
- Mettre à jour le dossier technique quand un comportement change, et le guide de l'utilisateur quand une commande, une option ou un libellé change.

## Branches et publication (#97)
- `main` : version publiée à la racine du site après des tests réussis.
- `classique` : version d'origine (étiquette `v1-classique`), publiée sous `/classique/`, figée : ni évolution, ni correctif.
- `gh-pages` : site publié, écrit seulement par la CI (`.github/scripts/pages.sh`) ; ne jamais la modifier à la main.
- Chaque pull request est publiée en préversion sous `/pr-N/` (lien posté dans la pull request, retirée à sa fermeture).
- `develop` : intégration ; fusion vers `main` par pull request.
