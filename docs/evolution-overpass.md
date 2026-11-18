# Évolution : réintroduire le moteur Overpass

> **Statut** : proposition. Le moteur a été retiré de l'application en novembre 2026.
> **Code de référence** : le dernier état fonctionnel est le commit `89c36f8` de `main`.
> Pour le consulter : `git show 89c36f8:js/engines.js`, `git show 89c36f8:js/state.js`, etc.
> Ce document décrit ce qu'il faut savoir pour le réintroduire, sans repartir de zéro.

## 1. Contexte

### 1.1. Rôle du moteur

Overpass était le deuxième des trois moteurs cartographiques, avec le moteur **Vectoriel GPU** (MapLibre + OpenFreeMap) et le moteur **Fichier** (import hors ligne). Il interrogeait l'[API Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) depuis le navigateur pour obtenir la géométrie OSM brute de la zone cadrée. Cette géométrie était ensuite dessinée sur un canvas 2D par le même pipeline que le moteur Fichier.

Intérêt par rapport au moteur Vectoriel GPU :

* niveau de détail maximal, sans la généralisation des tuiles vectorielles ;
* contrôle total du tracé : épaisseurs, effets crayon et hachures, rendu identique à l'aperçu et à l'export ;
* aucun fichier à préparer, contrairement au moteur Fichier.

### 1.2. Motif du retrait

* **Les serveurs publics sont indisponibles.** Lors de la validation depuis `github.io` sur mobile, en novembre 2026, les quatre miroirs ont échoué de façon persistante : `overpass.private.coffee` et `overpass.kumi.systems` hors délai, `maps.mail.ru` en HTTP 504 et `overpass-api.de` en HTTP 502. Au même moment, OpenFreeMap et Nominatim répondaient normalement.
* **Le coût est disproportionné.** La politique réseau (ordre des miroirs, sondage, second essai, suspension 406/429, messages d'échec), le diagnostic dédié et deux tests spécifiques représentaient une part importante de la complexité. Ce coût ne se justifie plus pour une fonction qui ne marche pas en conditions réelles.
* **Les autres moteurs couvrent le besoin.** Le moteur Vectoriel GPU est le moteur par défaut, et le moteur Fichier garde le même rendu sur canvas.

### 1.3. Ce qui a été conservé

Le pipeline de rendu reste en place pour le moteur Fichier, sous des noms neutres :

| Avant (avec Overpass) | Aujourd'hui | Rôle |
|---|---|---|
| `parseOverpass(json)` | `parseOsm(json)` | Éléments OSM (`node`, `way`, `relation`) → couches à dessiner |
| `normalizeElements`, `stitch`, `splitNull`, `toPts`, `bboxOf`, `dataExtent` | inchangés | Reconstruction des géométries, assemblage des anneaux, coupe aux points `null` |
| `drawVectors(ctx, r, data, view)` | inchangé | Dessin sur canvas, aperçu et export |
| `opData` | `osmData` | Données chargées (`source`, `bounds`, `layers`, `extent`) |
| `checkOpCoverage()` | `checkDataBanner()` | Bandeau « Aucun fichier importé » |
| Format importé « JSON Overpass » | « JSON OSM » (`{"elements":[…]}`) | Même structure, toujours acceptée |

## 2. Spécification fonctionnelle

### 2.1. Exigences

| # | Exigence |
|---|---|
| OP-1 | Un troisième bouton « Overpass » dans le sélecteur de moteur (onglet Lieu, section **Avancé**), entre « Vectoriel GPU » et « Fichier (hors ligne) ». Libellé d'aide : « Géométrie OSM brute, détail maximal, chargée à la demande. Ne trace pas le littoral marin. » |
| OP-2 | Les requêtes partent **uniquement à la demande** (choix du moteur, bouton « Actualiser les vecteurs Overpass », bandeau « Zone modifiée »), **une seule à la fois**, et jamais avant l'accord préalable aux services tiers (RGPD). |
| OP-3 | Le zoom minimal est 11,5. En deçà, une notification invite à zoomer ou à utiliser le moteur Vectoriel GPU, sans émettre de requête. |
| OP-4 | La zone demandée est le cadre visible élargi de 20 % (`OP_PAD`) pour absorber les petits déplacements. Si la vue sort de la zone chargée ou si les calques changent, un bandeau « Zone modifiée → Actualiser les vecteurs » s'affiche. |
| OP-5 | Le rendu et l'export sont identiques à ceux du moteur Fichier (`drawVectors`), y compris pour le gabarit « Deux lieux », où la seconde vue n'affiche que les données déjà chargées. |
| OP-6 | Respect de la politique d'usage des serveurs : un miroir qui répond 406 est suspendu 24 h, un miroir qui répond 429 est suspendu 1 h (ou la durée de `Retry-After` si elle est plus longue). La suspension est persistée et jamais contournée, pas même par le diagnostic. |
| OP-7 | Les messages d'échec distinguent une **panne des serveurs** d'une **coupure de la connexion**, avec le détail par miroir. |
| OP-8 | Le diagnostic réseau teste chaque miroir non suspendu et conclut explicitement sur Overpass. |
| OP-9 | Le moteur Fichier propose de nouveau le lien « requête Overpass » (premier miroir disponible, zone cadrée + 15 %) et un lien overpass-turbo prérempli. |
| OP-10 | Pas d'hébergement sur une plateforme de déploiement générée automatiquement : la politique d'usage d'Overpass le demande. GitHub Pages convient. |

### 2.2. Critères d'acceptation

* **Validation réelle** depuis `https://<compte>.github.io/city-map-studio/`, sur ordinateur et sur mobile : au moins un miroir répond pour Blois au zoom 14 en moins de 60 s, sur 3 essais à des heures différentes. Cette condition est **bloquante** : c'est elle qui a manqué.
* Taille de la réponse mesurée pour une grande relation (la Loire à Blois). Valeur de référence : 12,7 Mo de JSON, 2,2 Mo transférés compressés.
* Les tests automatisés de la § 5 passent.
* La CSP, le service worker et le texte d'accord préalable mentionnent de nouveau Overpass (§ 3.3).

## 3. Architecture

### 3.1. Flux

```
choix du moteur / « Actualiser »
        │
        ▼
needConsent ─(refus)→ demande d'accord, action mise en attente
        │
        ▼
zoom ≥ 11,5 ? ─(non)→ notification
        │
        ▼
viewBounds(st, aspect, OP_PAD) → buildQuery(b)
        │
        ▼
opAvailable()  (miroirs non suspendus, dans l'ordre OP_ORDER)
        │  aucun → message « suspendu jusqu'à … », bascule proposée vers Fichier
        ▼
opProbeOrder()  (pages /status sondées en parallèle, 5 s, no-cors)
        │
        ▼
pour chaque miroir : opQuery(url, q), second essai si échec rapide
        │  406/429 → opSuspend, miroir suivant
        │  succès  → parseOsm(json) → osmData (source 'overpass') → renderMap()
        ▼
tous en échec → message panne serveurs / injoignable + bandeau « Diagnostiquer »
```

### 3.2. Modules et fonctions à restaurer

| Fichier | Éléments | Rôle |
|---|---|---|
| `js/config.js` | `OVERPASS` (liste des miroirs), `OP_TIMEOUT = {fetch:100000, diag:20000, probe:5000, retry:1500}`, `OP_SERVER_TIMEOUT = 90`, `OP_PAD = 0.2` ; mention « Overpass API » dans les crédits | Paramétrage |
| `js/state.js` | `OP_BLOCK_KEY` (`cityMapStudio.opBlocked`), `OP_BLOCK_MS`, `opBlock`, `opBlockInfo`, `opSuspend`, `OP_ORDER`, `opAvailable`, `hhmm`, `opBlockMsg`, `opFailText`, `opQuery`, `opProbeOrder`, `opServerSide` ; `'overpass'` dans `normState` (`engine`) ; reprise de l'action en attente après accord | Politique réseau |
| `js/engines.js` | `buildQuery`, `fetchOverpass`, `checkOpCoverage` (zone modifiée) ; reconnaissance des bâtiments demandés en `out skel geom` dans `parseOsm` (voir § 4.2) | Moteur |
| `js/export.js` | Sondes Overpass dans `runDiagnostics` et conclusion dédiée ; `currentQuery`, `overpassGetUrl` (liens du moteur Fichier) ; message « Chargez d'abord les vecteurs Overpass » à l'export | Diagnostic, export |
| `js/ui.js` | Bloc `#opBlock`, bouton `#bRefresh2`, liens `#lnkApi` et `#lnkTurbo`, texte d'aide du moteur, branche `'overpass'` de `setEngine`, notification « actualisez les vecteurs » après un recentrage | Interface |
| `js/preview.js` | Rechargement à la sélection d'un lieu (`setActivePlace`), invalidation de `osmData` au changement de lieu | Deux lieux |
| `js/features.js` | Action par défaut du bandeau : `fetchOverpass` | Bandeau |
| `js/main.js` | Chargement au démarrage si le moteur enregistré est Overpass ; crochets de test (`buildQuery`, `OP_ORDER`, `OP_TIMEOUT`, `opBlock`, `opAvailable`, `fetchOverpass`) | Démarrage |
| `index.html` | Bouton `data-v="overpass"`, bloc `#opBlock`, liens d'aide du moteur Fichier, texte d'accord préalable, CSP | Structure |

### 3.3. Sécurité, hors ligne, vie privée

* **CSP** (`index.html`) : ajouter à `connect-src` les hôtes `https://overpass-api.de https://overpass.private.coffee https://overpass.kumi.systems https://maps.mail.ru`, à tenir à jour avec `OVERPASS`.
* **Service worker** (`sw.js`) : il ne met pas en cache les requêtes d'Overpass (méthode POST, autre origine). Rétablir la mention dans son commentaire d'en-tête.
* **Accord préalable** : le texte « En savoir plus » et l'état de l'accord doivent citer Overpass parmi les services qui reçoivent l'adresse IP, à la demande seulement.

## 4. Conception détaillée

### 4.1. Requête Overpass QL

La zone `(S,W,N,E)` est calculée par l'application. `out geom` inclut les coordonnées dans chaque `way` et dans chaque membre de `relation`. La requête est découpée en trois sorties pour alléger le travail des serveurs :

```overpassql
[out:json][timeout:90];
(
  way["natural"="water"](S,W,N,E);
  way["waterway"="riverbank"](S,W,N,E);
  way["waterway"~"^(river|canal|stream)$"](S,W,N,E);
  way["leisure"~"^(park|garden)$"](S,W,N,E);
  way["landuse"~"^(grass|forest|meadow|recreation_ground)$"](S,W,N,E);
  way["natural"="wood"](S,W,N,E);
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"](S,W,N,E);
  way["highway"~"^(unclassified|residential|living_street|pedestrian|service|footway|path|cycleway|steps|track)$"](S,W,N,E);
  way["railway"="rail"](S,W,N,E);   // si le calque Voies ferrées est actif
);
out tags geom qt;
(
  relation["natural"="water"](S,W,N,E);
  relation["waterway"="riverbank"](S,W,N,E);
  relation["leisure"="park"](S,W,N,E);
);
out tags geom(S,W,N,E) qt;          // géométrie découpée au cadre
way["building"](S,W,N,E);           // si le calque Bâtiments est actif (zoom ≥ 12,5)
out skel geom qt;                   // contour seul, sans étiquettes
```

* **Relations découpées au cadre** : sans `geom(S,W,N,E)`, une relation comme la Loire est renvoyée sur toute sa longueur. Avec le découpage, les points hors du cadre arrivent comme `null`. `splitNull`, conservé, coupe les tracés à ces points avant l'assemblage des anneaux.
* **Bâtiments sans étiquettes** : ils représentaient 69 % du volume (9 Mo sur 15,6 Mo pour Blois au zoom 14). À la réception, un `way` sans étiquette mais avec une géométrie fournie par le serveur est reconnu comme bâtiment.

### 4.2. Reconnaissance des bâtiments `out skel geom`

Cette règle a été retirée de `parseOsm`, parce qu'elle ne sert qu'à la réponse d'Overpass. Pour la rétablir, il faut l'exécuter **avant** `normalizeElements`, qui ajoute une géométrie aux chemins des fichiers importés (nœuds séparés) : sinon, les membres non étiquetés d'une relation seraient pris pour des bâtiments.

```js
for(const e of json.elements||[]) if(e.type==='way' && !e.tags && Array.isArray(e.geometry)) e.tags={building:'yes'};
```

Le mieux est de l'appliquer dans `fetchOverpass` seulement, avant l'appel à `parseOsm`, plutôt que dans le lecteur commun.

### 4.3. Politique réseau

| Règle | Valeur | Justification |
|---|---|---|
| Délai serveur | `[timeout:90]` | Mesure réelle : 24 à 32 s de calcul pour Blois au zoom 14 sur un miroir chargé. Les anciens 25 s coupaient une réponse valide. |
| Délai client | 100 s (`AbortController`), puis miroir suivant | Supérieur au délai serveur |
| Ordre des miroirs | En http(s) : `overpass-api.de` (instance de référence) en premier. En `file://` : en dernier, car il répond 406 sans Referer. | Politique d'overpass-api.de |
| Sondage | Pages `/api/status` en parallèle, 5 s, `mode:'no-cors'` : les miroirs qui répondent passent devant, aucun n'est écarté | Ne pas perdre 100 s par miroir muet |
| Second essai | Une seule fois, 1,5 s plus tard, si l'échec est rapide (< 4 s : 5xx ou absence de réponse). Jamais après un délai dépassé. | Les passerelles surchargées alternent 504 et réponse valide |
| Calcul interrompu | Réponse 200 dont `remark` contient `runtime error`, `timed out`, `out of memory` ou `rate_limited` → échec du miroir | Éviter une carte vide ou partielle |
| Suspension | 406 → 24 h ; 429 → 1 h ou `Retry-After` s'il est plus long ; persistée dans `localStorage` (`cityMapStudio.opBlocked`) | Les clients insistants sont bannis |
| Échecs 5xx et délai | Pas de suspension | Pannes passagères |

**Messages d'échec.** Chaque échec est enregistré sous la forme `{host, status?, kind:'http'|'timeout'|'nores'|'heavy'}`. Une passerelle en 502/504 répond souvent sans en-tête CORS : la page ne voit qu'un `TypeError` (« Failed to fetch »), indiscernable d'une coupure réseau. Si au moins un miroir a répondu en HTTP ou a dépassé le délai, la connexion fonctionne. Les messages affichés sont alors :

* barre d'état : « Overpass : serveurs en panne ou surchargés (n/N en échec) », avec le détail par miroir dans l'infobulle ;
* bandeau : « Serveurs Overpass en panne → Diagnostiquer » ;
* notification : « … Votre connexion n'est pas en cause : réessayez plus tard, ou utilisez le moteur Vectoriel GPU ou « Fichier ». »

Si aucun miroir n'a répondu du tout, la barre d'état affiche « Overpass injoignable ». Pendant la requête, elle indique le miroir interrogé et le temps écoulé.

**Diagnostic.** Le diagnostic envoie à chaque miroir non suspendu la requête `[out:json][timeout:5];node(1);out;`, avec un délai de 20 s. Si tous les miroirs échouent alors que d'autres services répondent, une seconde conclusion attribue la panne aux serveurs Overpass, ou à leur suspension.

## 5. Tests à rétablir

| Test | Contenu |
|---|---|
| `tests/overpass_policy.py` | Miroir 1 → 406, miroir 2 → 429 (`Retry-After: 7200`), miroir 3 → succès. Vérifie la bascule, les durées de suspension, l'absence de nouvel essai (actualisation, rechargement, diagnostic) et le message quand tous les miroirs sont suspendus. Préparer le stockage avec `tests/seed.py` : un `add_init_script` qui touche à `localStorage` fait perdre des écritures au rechargement. |
| `tests/overpass_outage.py` | Deux miroirs hors délai, un en 504, un en 502 sans CORS (simulé par `route.abort('failed')`, car Chromium lit la réponse en `file://`). Vérifie les messages « serveurs en panne », le détail par miroir, la conclusion du diagnostic et l'absence de suspension. |
| `tests/run.py`, `texts.py`, `textsize.py`, `mobile.py`, `fonts.py`, `consent.py`, `ux.py` | Variantes où le moteur Overpass est sélectionné, avec une réponse simulée par `page.route` (fichier `tests/osm.json`). |
| `tests/consent.py` | Sans accord, le passage au moteur Overpass n'émet aucune requête et redemande l'accord. |

Les deux premiers tests sont récupérables tels quels : `git show 89c36f8:tests/overpass_policy.py` et `git show 89c36f8:tests/overpass_outage.py`. Il faut seulement y remplacer `overpass.json` par `osm.json` et `parseOverpass` par `parseOsm`.

## 6. Pistes pour rendre le moteur fiable

La réintroduction n'a de sens que si les serveurs répondent. Pistes à évaluer avant de rouvrir le code :

1. **Revalider les miroirs publics** depuis `github.io` (§ 2.2), et consulter la liste à jour des instances sur le wiki OSM : certaines ne couvrent qu'une région, d'autres ont fermé.
2. **Instance Overpass dédiée** : coût d'hébergement, base planète d'environ 300 Go.
3. **Fichiers pré-générés** pour les villes préréglées, servis par GitHub Pages et chargés par le moteur Fichier. Pas de requête à l'exécution, mais une couverture limitée.
4. **Requête plus légère** : sans bâtiments au-delà d'un zoom donné, ou découpée en plusieurs requêtes plus petites. Cette piste multiplie les appels et doit rester dans la politique d'usage.
5. **Garder le moteur derrière une option expérimentale**, désactivée par défaut, le temps de mesurer la fiabilité réelle.
