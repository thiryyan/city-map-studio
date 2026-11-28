# City Map Studio — Dossier technique de référence

> **Objet** : atelier web de création d'affiches cartographiques souvenir. L'application trace de façon minimaliste les rues et les cours d'eau d'une ville, marque d'un repère discret le lieu exact d'une rencontre, et exporte une affiche d'impression A4 à 300 DPI, A3, 50 × 70 cm ou 10 × 15 cm, en PNG ou en PDF. Deux types d'affiche s'y ajoutent : l'affiche illustrée (§ 4.13) et la carte associée à une illustration (§ 4.14).
>
> **Portée** : ce dossier décrit les exigences, l'architecture, les algorithmes et les tests. L'usage de chaque fonction est décrit dans le [guide de l'utilisateur](../USER_GUIDE.md) ; les règles de contribution et les commandes, dans [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## 1. Exigences

| # | Sujet | Exigence |
| :--- | :--- | :--- |
| E1 | Licence | **100 % open source** : code sous licence **MIT** (© Contributeurs de City Map Studio) ; librairies, polices, données et services ouverts, sans clé API ni service propriétaire (ni ArcGIS, ni Mapbox, ni Google Maps, ni Google Fonts). |
| E2 | Navigateurs | Chromium ≥ 110, Safari ≥ 16, Firefox ≥ 115. |
| E3 | Rendu | L'export est identique à l'aperçu ; le gabarit et le thème **Souvenir** (par défaut) définissent le rendu de référence (§ 4.1 et 4.2). |
| E4 | Moteurs cartographiques | **Vectoriel GPU** (MapLibre GL + OpenFreeMap, par défaut) et **Fichier** (import hors ligne, Canvas 2D). |
| E5 | Gabarits | 11 gabarits (§ 4.1), **Souvenir** par défaut ; portrait ou paysage. |
| E6 | Coordonnées | Affichage au choix en décimal (par défaut) ou en DMS. |
| E7 | Libellés | Aucun libellé sur la carte : le tracé est purement graphique. |
| E8 | Ville au lancement | Blois et la Loire. |
| E9 | Export | PNG A4 300 DPI (2480 × 3508 px) par défaut ; A3, 50 × 70 cm et 10 × 15 cm (tirage photo) ; PDF à la taille d'impression (§ 5). |
| E10 | Livraison | Sources : `index.html` (balisage), `css/app.css`, `js/*.js` (scripts classiques chargés dans l'ordre), ouvrables telles quelles (`file://` ou serveur local). **Site publié construit** par `scripts/build.mjs` (#102, § 7.8) : `dist/`, un seul script et une seule feuille minifiés, `sw.js` généré ; il s'ouvre aussi en `file://`. MapLibre et les polices sont fournis dans `lib/`. Tous les chemins sont relatifs (site servi sous `/city-map-studio/`). |
| E11 | Écrans | Mobile en priorité, ordinateur en second. Interface en français. |
| E12 | Hébergement | **GitHub Pages**, publié depuis la branche `gh-pages` par GitHub Actions (§ 7.6) : racine = version classique (branche `classique`), `/nouvelle/` = branche `main`, `/pr-N/` = préversions. |
| E13 | Données | Attribution « © contributeurs OpenStreetMap » (ODbL), complétée de « OpenFreeMap © OpenMapTiles » (schéma CC-BY 4.0) avec le moteur Vectoriel GPU : mention complète active par défaut. Décochée, la case laisse une **mention minimale toujours inscrite** (« © OpenStreetMap », plus « © OpenMapTiles » avec le moteur GPU ; `attributionText`). À l'écran, les sources de la carte sont rappelées en légende discrète **sous l'aperçu**, hors de l'affiche (`#mapCredit`, placée par `layoutPreview`) : l'aperçu montre ainsi exactement la mention de l'export. |
| E14 | Vie privée | Aucune ressource de présentation (librairie, polices, styles) n'est chargée depuis un tiers : l'adresse IP du visiteur n'est transmise qu'aux services de données cartographiques nécessaires au fonctionnement, et **seulement après son accord explicite** (§ 2.4). Les polices sont auto-hébergées, conformément à la jurisprudence RGPD sur Google Fonts (LG München, 20/01/2022, 3 O 17493/20). |
| E15 | Sécurité | Politique de sécurité du contenu (CSP) en balise meta : aucun script ni style en ligne, réseau limité aux services cartographiques. Tout état venu de l'extérieur (lien partagé, `localStorage`) est validé champ par champ (`normState`). CDN de secours chargés avec empreinte SRI. |
| E16 | Accessibilité | Fenêtres en `<dialog>` modal (focus retenu, Échap), commandes au clavier, cibles tactiles de 44 px, noms accessibles pour tous les champs, texte de remplacement de l'aperçu. |
| E17 | Hors ligne | Application installable (manifeste) ; en http(s), un service worker garde l'application en cache (réseau d'abord) : démarrage et export du moteur Fichier sans réseau. Aucune ressource tierce mise en cache. Nouvelle version proposée par un bandeau, jamais imposée (§ 7.5). |

---

## 2. Architecture

### 2.1. Briques techniques

| Brique | Choix | Licence |
| :--- | :--- | :--- |
| Langage | HTML5, CSS3, JavaScript ES2020, sans framework | — |
| Moteur vectoriel GPU | MapLibre GL JS **4.7.1**, chargé depuis `lib/`, puis en secours depuis unpkg, jsDelivr et cdnjs (version figée) | BSD-3-Clause |
| Tuiles vectorielles | OpenFreeMap (`https://tiles.openfreemap.org/planet`, schéma OpenMapTiles, sans clé) | Données ODbL, schéma CC-BY |
| Géocodage | Nominatim (`nominatim.openstreetmap.org`) | GPL / ODbL |
| Polices | 11 familles (§ 4.4) **auto-hébergées** dans `lib/fonts/` (woff2, sous-ensembles latin et latin-ext, `OFL.txt` par famille), déclarées dans `lib/fonts/fonts.css` | SIL OFL 1.1 |
| Rendu de l'affiche | Canvas 2D natif | — |

### 2.2. Moteurs cartographiques

| Moteur | Source | Atouts | Limites |
| :--- | :--- | :--- | :--- |
| **1. Vectoriel GPU (défaut)** | MapLibre + OpenFreeMap | Instantané, monde entier, mers et côtes correctes, fluide sur mobile. | Généralisation des tuiles : certaines petites voies disparaissent aux zooms faibles. |
| **2. Fichier (hors ligne)** | Fichier importé : `.osm` XML, JSON OSM (`{"elements":[…]}`) ou GeoJSON → Canvas 2D | Aucun accès réseau requis ; géométrie OSM brute au niveau de détail maximal, contrôle total du tracé. | L'utilisateur obtient le fichier lui-même (§ 7.3) ; le trait de côte marin n'est pas traité (villes continentales et fluviales). |

* **Chargement de MapLibre** (`js/maplibre-loader.js`, `CMS.maplibre`) : depuis `lib/`, puis depuis 3 CDN (12 s par source ; CDN seulement après l'accord, avec empreinte SRI). Une seule promesse de chargement à la fois ; la version (`getVersion() === ML_VERSION`) est vérifiée pour toutes les sources, copie locale comprise. Un script arrivé après son délai (qu'on ne peut pas annuler) est neutralisé si une autre source a gagné, ou adopté si toutes avaient échoué (événement `cms:maplibre-ready`, la carte est relancée). La feuille de style est chargée avec `onload` / `onerror`, depuis la même source puis les autres sources autorisées (8 s).
* **Surveillance des tuiles** : sans tuile reçue au bout de 15 s, `mlFail` affiche le bandeau « Carte indisponible → Diagnostiquer », qui oriente vers le moteur qui fonctionne, et en dernier recours vers le moteur Fichier.
* **Style de la carte interactive** : les épaisseurs suivent le zoom par des expressions (`interpolate` exponentielle de base √2 entre les paliers 12 et 16 du zoom de l'affiche, soit exactement `zoomFactor` borné entre 0,5 et 2) : un geste ne reconstruit pas le style ; seul le disque du quartier en relief est remis à jour par `setFilter`. Le style n'est reconstruit (`mlRestyle`) que si un réglage ou la largeur du cadre change. Les exports gardent des valeurs figées.
* **Contexte WebGL** : MapLibre rétablit seul un contexte perdu ; l'application l'affiche (« Carte GPU suspendue ») et refuse l'export pendant ce temps. Les rendus hors écran (`mlSnapshot` : vue figée, export, tuiles, lecture des pistes `mlQuery`) passent par une file d'attente (`gpuQueue`, un seul contexte hors écran à la fois) et échouent immédiatement si leur contexte est perdu, au lieu d'attendre le délai de 45 s (`SNAP_TIMEOUT`). En moteur Fichier, la carte MapLibre est libérée au bout de 30 s (`ML_RELEASE_MS`) et recréée au retour.
* **Moteur Fichier au démarrage** : les données importées ne sont pas conservées ; un état enregistré avec le moteur Fichier redémarre avec le moteur Vectoriel GPU (`boot`).

### 2.3. Rendu en trois couches (WYSIWYG)

Une fonction unique, `drawPoster(ctx, W, H, pass, mapFn)`, dessine l'affiche à n'importe quelle résolution. L'aperçu et l'export partagent donc le même code :

1. **Couche basse** (canvas) : le papier.
2. **Couche carte** : un conteneur placé exactement sur le cadre de la carte, qui accueille MapLibre ou le canvas vectoriel du moteur Fichier. Il est découpé selon la forme des gabarits Médaillon, Cœur et Arche (`clip-path`, même tracé que l'export : `shapeD`).
3. **Couche haute** (canvas, `pointer-events: none`) : fondu, filets, repère, typographie et attribution.

À l'export, les trois couches sont recomposées dans un canvas unique aux dimensions du format (`exportSpec` : 2480 × 3508 px en A4 portrait ; § 5).

Les canevas de l'aperçu sont à la densité de l'écran (`devicePixelRatio`, 3 au plus), suivie aussi sans redimensionnement (fenêtre déplacée vers un autre écran : `CMS.surface.watchDpr`) ; ils ne sont réalloués que si leur taille change (`CMS.surface.fit`).

### 2.4. Réseau et politiques d'usage

* **Accord préalable (RGPD)** : au premier lancement, **aucune requête n'est émise vers un service tiers**. Un panneau « Afficher la carte ? » explique que l'affichage des tuiles transmet l'adresse IP à OpenFreeMap, et que Nominatim la reçoit aussi, seulement à la demande. Il propose deux choix :
  * **Afficher la carte** : l'accord est mémorisé dans `localStorage` (clé `cms3.consent`), la carte s'affiche, et l'action qui a déclenché la demande (recherche, diagnostic, export) s'exécute ;
  * **Travailler hors ligne** : passage au moteur Fichier, sans aucune requête.

  Tant que l'accord n'est pas donné, chaque point d'accès au réseau (`initMaplibre`, `search`, `runDiagnostics`, `exportPoster` avec le moteur Vectoriel GPU, CDN de secours de MapLibre) affiche la demande au lieu d'appeler le service. L'onglet Lieu indique l'état de l'accord et permet de le retirer, ce qui recharge la page dans l'état initial.
* **Nominatim** : appel uniquement à la validation de la recherche (jamais à la frappe), 5 résultats, `accept-language=fr`, par `CMS.geocoder` (`js/geocoder.js`) : délai de 10 s, au plus une requête par seconde, la plus récente annule la précédente, validation répétée ignorée pendant 300 ms ; 429 / 403 → attente de 60 s (l'en-tête `Retry-After` n'est pas exposé par CORS) sans aucune requête ; 5xx → une relance ; cache des 50 dernières requêtes. Les réponses sont validées (coordonnées finies et dans les bornes Mercator, textes tronqués) puis insérées via `textContent` (aucune injection HTML). Le diagnostic interroge `/status` (aucune recherche consommée) ; si sa réponse n'est pas lisible par la page (en-tête CORS absent, filtre de contenu du navigateur mobile…), un second appel `no-cors` distingue un serveur **joignable** (✓, « état non lisible par la page ») d'un réseau réellement bloqué (✗).
* **Wikipédia** (pistes d'illustration, issue #46) : option « Chercher aussi dans Wikipédia » de l'onglet Illustration, **désactivée par défaut** ; la cocher demande d'abord l'accord général (`needConsent`), et aucune requête ne part avant le bouton « Lieux remarquables (Wikipédia) ». Client `CMS.wiki` (`js/wiki.js`) : une requête `generator=geosearch` à `fr.wikipedia.org` (100 articles géolocalisés au plus, dans la demi-diagonale de la carte, 1 à 10 km) avec longueur, nombre de langues, description courte et coordonnées ; seules les **coordonnées du lieu** (arrondies à 4 décimales) et le rayon sont transmis, sans cookie ni adresse de la page (`credentials: 'omit'`, `referrerPolicy: 'no-referrer'`). Délai de 10 s (message « Wikipédia ne répond pas », l'interface reste utilisable), la plus récente annule la précédente, cache des 30 dernières requêtes, réponses validées. Hors ligne : bouton grisé, les pistes lues dans la carte restent disponibles.
* **Persistance** : tout accès au stockage est protégé par `try/catch` (navigation privée, stockage plein ou refusé : l'application fonctionne, sans mémoire).

  | Clé | Contenu | Remise à zéro par « Réinitialiser » |
  | :--- | :--- | :--- |
  | `cms3.affiche` | État de l'affiche (`st`), écrit 300 ms après la dernière modification (`saveState`), relu par `normState` | oui (valeurs par défaut) |
  | `cms3.saves` | Mes affiches (§ 4.12) | non |
  | `cms3.consent` | Accord aux services tiers | non |
  | `cms3.welcomed` | Proposition d'ambiance déjà vue (§ 4.6) | non |
  | `cms3.wiki` | Option « Chercher aussi dans Wikipédia » (§ 4.13) | non |
  | `cms3.uiScale`, `cms3.safeZone` | Taille de l'interface (§ 6), zone de sécurité (§ 5.4) : réglages de l'appareil | non |
  | `cms3.advOpen`, `cms3.styleMoreOpen` | Sections « Avancé » et « Plus de réglages » ouvertes | non |
  | `cms3.debug` | `'1'` : expose `window.__cms` (§ 8.2) | non |
  | IndexedDB `cms3`, magasin `images` | Illustrations, par empreinte SHA-256 (§ 4.13) | non (nettoyage des images orphelines) |

  **Espace de noms propre (#100)** : toutes les clés de cette version commencent par `cms3.` et sa base IndexedDB s'appelle `cms3`. La version classique, publiée à la racine sur la même origine (§ 7.6), garde `cityMapStudio.*` et la base `cityMapStudio` : aucune des deux ne lit ni n'écrit les données de l'autre (vérifié par `tests/storage.py`). Conséquence : les affiches de la version classique n'apparaissent pas dans cette version (décision du 27/11/2026 : pas de relecture des anciens formats).

### 2.5. Villes préréglées

Blois (Loire) · Paris (Seine) · Venise (Lagune) · New York (Manhattan) · Bordeaux (Garonne) · Périgueux (Isle).

L'onglet Lieu indique de la même façon la ville affichée (centre de la carte) et le lieu de rencontre (repère) : nom de la ville proposée la plus proche, à 5 km au plus (« Autre lieu » sinon), précision (région, ou repère dans / hors de la ville affichée) et coordonnées. Le bouton de la ville affichée est en surbrillance (`aria-pressed`).

---

## 3. Moteur géométrique

### 3.1. Projection unique (Web Mercator, tuiles de 512 px)

L'état stocke un **zoom de référence** $Z$, défini pour un cadre de carte large de $W_{\text{ref}} = 800$ px. Pour un cadre de largeur réelle $w$ (en pixels) :

$$S = 512 \cdot 2^{Z} \cdot \frac{w}{800}$$

$$x(\lambda) = x_0 + \frac{w}{2} + S \cdot \frac{\lambda - \lambda_c}{360}
\qquad
y(\phi) = y_0 + \frac{h}{2} - \frac{S}{2\pi}\left[\mathcal{M}(\phi) - \mathcal{M}(\phi_c)\right]$$

avec $\mathcal{M}(\phi) = \ln\tan\left(\frac{\pi}{4} + \frac{\phi\,\pi}{360}\right)$.

Côté MapLibre, le zoom effectif d'un conteneur de largeur CSS $w_{\text{css}}$ vaut $Z + \log_2(w_{\text{css}}/800)$. La convention de 512 px est commune aux deux moteurs : le cadrage est **identique sur un téléphone, sur un ordinateur et à l'export**.

### 3.2. Conversion décimal → DMS

$d = \lfloor |D| \rfloor,\; m = \lfloor (|D|-d)\cdot 60 \rfloor,\; s = \text{round}\big(((|D|-d)\cdot 60 - m)\cdot 60,\ 1\big)$.
Retenue : si $s = 60{,}0$, alors $s \leftarrow 0$ et $m \leftarrow m+1$ ; si $m = 60$, alors $m \leftarrow 0$ et $d \leftarrow d+1$.
Suffixes N/S et E/W. Exemple pour Blois : 47° 35′ 10.0″ N, 1° 20′ 09.2″ E.
Le format **décimal** (par défaut) affiche 7 décimales : `47.5861000, 1.3359000`.

### 3.3. Saisie des coordonnées du repère

`parseCoords` accepte :

| Format | Exemples |
| :--- | :--- |
| Décimal à point ou à virgule | `47.5861, 1.3359` · `40.7484,-73.9857` · `47,5861 ; 1,3359` |
| DMS ou DM avec hémisphère N / S / E / W / O (préfixe ou suffixe) | `47° 35′ 10″ N, 1° 20′ 09″ E` · `47°35'10"N 1°20'9.2"E` · `N 47 35.1667 E 1 20.1533` |
| Lien de carte | Google Maps (`…/@lat,lon,15z`), OpenStreetMap (`?mlat=…&mlon=…`, `#map=z/lat/lon`) |

Sont refusés, avec un message explicite : texte sans nombre, nombre de valeurs incohérent, hémisphère manquant ou dupliqué, minutes ou secondes ≥ 60, latitude au-delà de ±85° ou longitude au-delà de ±180°. Si le point sort du cadre, la carte se recentre dessus.

### 3.4. Hiérarchie des tracés

Épaisseur finale = base × ($w$/800) × $M_{\text{trait}}$ × $f(Z)$, avec $f(Z) = \text{clamp}(2^{0{,}5\,(Z-14)}, 0{,}5, 2)$ et $M_{\text{trait}} \in [0{,}5 ; 2{,}5]$.

| Classe | Valeurs OSM / OpenMapTiles | Base (px) | Couleur |
| :--- | :--- | :--- | :--- |
| Sentiers | footway, path, cycleway, steps, track, pedestrian | 0,45 | Chemins |
| Service | service | 0,55 | Rues secondaires |
| Desserte | residential, living_street, unclassified (`minor`) | 0,9 | Rues secondaires |
| Tertiaire | tertiary | 1,3 | Rues secondaires |
| Secondaire | secondary | 1,8 | Rues principales |
| Primaire | primary | 2,4 | Rues principales |
| Voie express | trunk | 2,8 | Rues principales |
| Autoroute | motorway | 3,2 | Rues principales |
| Voie ferrée | railway=rail | 0,8, en pointillés | Voies ferrées |
| Cours d'eau | river / canal / stream | 3 / 2 / 0,8 × $M_{\text{eau}}$ | Eau |

Les variantes `*_link` suivent la classe de leur axe.

**Ordre d'empilement** : Terre → Parcs → Eau (polygones puis lignes) → Bâtiments → Voies ferrées → Routes (des sentiers vers les autoroutes) → [couche haute] Fondu → Repère → Filets / anneau → Typographie → Attribution.

---

## 4. Personnalisation

### 4.1. Gabarits (marge de 3 à 12 %)

1. **Souvenir (défaut)** : en-tête sur une ligne (ville et date à gauche, coordonnées à droite), carte rectangulaire, pied avec la dédicace en grand, un filet vertical et les noms en italique.
2. **Cadre classique** : carte encadrée d'un double filet, cartouche inférieur centré (titre espacé, sous-titre entre filets, coordonnées, dédicace, noms, date).
3. **Fondu moderne** : carte pleine page fondue vers le papier en bas et sur les bords, typographie posée sur le fondu.
4. **Médaillon** : carte découpée dans un cercle, anneau fin optionnel, cartouche centré dessous.
5. **Cœur** et 6. **Arche** : carte découpée en forme de cœur ou de fenêtre en arche, contour fin optionnel (« Contour de la forme »). La forme découpe aussi la carte interactive de l'aperçu (`clip-path: path()`), à partir du même tracé que l'export (`shapeD`).
7. **Voyage** : carte pleine largeur, ville en très grand alignée à gauche, informations en dessous ; pensé pour une police d'affiche condensée.
8. **Polaroid** : carte carrée, large marge basse, dédicace en tête du texte et lieu en petit.
9. **Deux lieux** (§ 4.7) et 10. **Ciel** (§ 4.8).
11. **Lettres** : le nom de la ville, en capitales géantes, est découpé dans la carte (§ 4.11) ; cartouche dessous, sans le titre.

**Orientation** : portrait (2480 × 3508) ou paysage (3508 × 2480) pour tous les gabarits. En paysage, la carte (ou le ciel) occupe la gauche et le texte une colonne à droite, centrée verticalement ; Deux lieux place les cartes côte à côte. Les tailles s'expriment en fraction du petit côté (`U`), si bien qu'un texte garde la même taille physique dans les deux orientations.

### 4.2. Couleurs (12 variables)

Papier · Terre · Eau · Parcs · Bâtiments · Rues principales · Rues secondaires · Chemins · Voies ferrées · Texte · Filets · Repère.

| Thème | Papier | Terre | Eau | Rues princ. / sec. | Repère | Esprit |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Souvenir (défaut)** | `#FFFFFF` | `#F2F2F2` | `#C9D9DE` | `#111111` / `#4A4A4A` | `#D0312D` | Terre gris clair, eau bleu-gris, cœur rouge |
| **Galerie Or & Noir** | `#FFFFFF` | `#FFFFFF` | `#E9DDBF` | `#18181B` / `#3F3F46` | `#C5A059` | Noir et blanc, touches dorées |
| **Prestige Onyx & Or** | `#0F1115` | `#0F1115` | `#2A2415` | `#D4AF37` / `#8C7A3E` | `#F3E5AB` | Tracé doré sur fond noir |
| **Blanc minimaliste** | `#FFFFFF` | `#FFFFFF` | `#E5E7EB` | `#111111` / `#3A3A3A` | `#111111` | Contraste architectural |
| **Crème & Encre** | `#F4EFE6` | `#F4EFE6` | `#D6E0E2` | `#2C2A29` / `#57534E` | `#C5A059` | Papier coton |
| **Nuit boréale** | `#0B192C` | `#0B192C` | `#1E3E62` | `#E2E8F0` / `#94A3B8` | `#D4AF37` | Contemporain |
| **Sépia vintage** | `#EFE6D5` | `#EFE6D5` | `#DFD2B8` | `#433422` / `#6B5A43` | `#8B2635` | Cartographie ancienne |
| **Sauge** | `#EEF1EA` | `#EEF1EA` | `#C8D6CF` | `#34473B` / `#5E6F62` | `#B5654B` | Botanique, naissance, maison |
| **Terracotta** | `#F4EADF` | `#F4EADF` | `#B9CFCB` | `#7A3B26` / `#9C6248` | `#C96A3D` | Méditerranée, été |
| **Rose poudré** | `#F8EEEC` | `#F8EEEC` | `#E2D3D6` | `#5E4447` / `#846A6D` | `#C98A8E` | Mariage, filets dorés |
| **Automne** | `#F2E6D0` | `#F2E6D0` | `#CFD8D3` | `#3B2F2A` / `#6A5A50` | `#C2861F` | Chaleureux, moutarde |
| **Marine** | `#F1ECE2` | `#F1ECE2` | `#D5DCE4` | `#14284B` / `#3E5274` | `#C0392B` | Bord de mer, sobre |
| **Encre de Chine** | `#FFFFFF` | `#FFFFFF` | `#111111` | `#000000` / `#1A1A1A` | `#D0312D` | Noir et blanc graphique, eau en aplat noir |
| **Plan d'architecte** | `#1F3A5F` | `#1F3A5F` | `#2C4F7C` | `#E8F1FA` / `#A9C1DA` | `#FFD166` | Technique, avec la police Mono |
| **Néon** | `#120B24` | `#120B24` | `#1E1440` | `#FF4FD8` / `#9B5DE5` | `#36E3FF` | Urbain, nocturne |
| **Risographie** | `#F3EEE3` | `#F3EEE3` | `#FF6C9C` | `#0078BF` / `#3A8FCB` | `#FF6C9C` | Deux encres d'imprimerie (bleu, rose fluo), pensé pour la surimpression |

Les thèmes se filtrent par catégorie (**Clairs**, **Sombres**, **Couleurs**). Un **contrôle de contraste à l'impression** avertit quand les rues principales ressortent mal sur la terre (contraste < 3), quand le texte manque de contraste avec le papier (< 4,5) ou quand le repère se distingue mal de la carte (< 1,8). Aucun thème fourni ne déclenche l'avertissement ; il sert pour les couleurs personnalisées.

**Couleurs d'après une image** (`CMS.palette`, onglet Style, trois types d'affiche ; #77) : une photo ou, sur une affiche illustrée, l'illustration importée. L'image est lue et réduite sur l'appareil (`createImageBitmap`, 80 px au plus grand côté ; ni adresse, ni envoi, ni enregistrement), puis ramenée à six couleurs dominantes par k-moyennes (départ aux quantiles de luminance : même image, même palette). Version **claire** : papier tiré de la couleur la plus claire (fondue à 75 % vers le blanc), encre de la plus sombre ; version **sombre** : l'inverse. L'eau et les parcs prennent les deux couleurs les plus saturées et les plus présentes, fondues dans le papier ; le repère, la plus saturée, assombrie si elle contraste trop peu avec le papier (< 2,6). Seules les 12 couleurs sont gardées ; le changement est annulable et comparable comme un thème.

**Comparer avant / après** (issues #15 et #63) : après un changement « comparable », un bouton « Maintenir pour comparer… » apparaît dans le pied du panneau, au-dessus de la barre d'état : il reste accessible depuis tous les onglets, y compris panneau réduit. Changements comparables : thème ou palette (photo, illustration), ambiance, modèle de texte, effet de tracé et dorure ou riso (`fx.*`), ornement (`orn.*`), plis, papier. Le libellé suit la nature du changement : « … avec « *thème précédent* » », « … : avant l'ambiance « Soirée de gala » », « … : avant le modèle « Mariage » », « … : avant l'effet « Trait crayon » », « … : avant le retrait de l'effet « Lueur » », « … : avant le papier « Kraft » ». Tant qu'il est maintenu (souris, toucher, ou Espace / Entrée au clavier), l'affiche montre l'état d'avant, avec un badge (« Avant · *thème* », « Avant l'ambiance « … » ») ; relâché, l'état courant revient **exactement**. C'est un aperçu seulement : rien n'est enregistré (`saveState` est suspendu) ni ajouté à l'historique.

Seuls les champs modifiés par le dernier changement comparable sont retenus (`CMS.compare`, `js/ui.js`), avec leurs valeurs d'avant et d'après. Le bouton disparaît dès que l'un d'eux change de nouveau (autre choix, couleur retouchée, « Annuler ») ; une autre modification (titre, cadrage) ne l'efface pas et reste affichée pendant la comparaison. Le moteur et le cadrage (centre, zoom, repère, deuxième lieu) ne sont jamais comparés : ils relanceraient des requêtes réseau ou n'apporteraient rien. Reconfirmer le même choix ne crée pas de comparaison.

Chaque variable reste modifiable individuellement. Les actions rapides **« Touche d'or »** appliquent `#C5A059` à l'eau, aux rues principales, au repère ou aux filets.

### 4.3. Repère (10 styles vectoriels), lieux multiples, itinéraire

Cœur géométrique facetté · Point subtil à halo · Cœur lisse (plein ou contour) · Anneau cible · Épingle · Étoile · Maison · Alliances · Ancre · Petits pieds.
Réglages : taille de 10 à 300 % (100 % = 5,5 % de la largeur de l'affiche), couleur, opacité, plein ou contour.

Le repère (point de rencontre) est indépendant du centre de la carte. Il se place :
* au toucher ou au clic, en mode « Placer le repère » ;
* depuis un résultat de recherche ;
* au centre de la carte (« Au centre ») ;
* par **saisie de ses coordonnées** dans l'onglet Lieu (§ 3.3).

**Plusieurs lieux** (onglet Repère) : jusqu'à deux lieux de plus que le repère principal, chacun avec un nom, placé d'un toucher sur la carte. Options : **numéroter** les lieux (pastilles 1, 2, 3 et légende « 1 Rencontre · 2 Mariage » dans le texte de l'affiche) et les **relier** par un trait en pointillés. Les lieux supplémentaires sont dessinés au même style, à 75 % de la taille.

**Itinéraire** : import d'un fichier GPX, ou d'un GPX **collé** (bouton « Coller le GPX », presse-papiers au toucher, ou zone de texte puis « Importer le GPX collé ») : `CMS.route.extractGpx` retire les clôtures de code et garde le dernier bloc complet de `<gpx` à `</gpx>`, si bien que la réponse entière d'une IA s'importe ; un texte sans GPX donne un message explicite et ne modifie pas l'affiche. Le GPX (traces `trkpt`, routes `rtept` ou, à défaut, points `wpt`) est simplifié par Douglas-Peucker à 1 500 points au plus, puis cadrage automatique de la carte (zoom borné à 10–18). Couleur (repère, rues ou filets), épaisseur et pointillés réglables. L'itinéraire fait partie de l'état (`st.route`, 5 000 points au plus à la relecture : `ROUTE_MAX_PTS`) ; le lien partagé l'omet au-delà de 400 points (§ 5.6). Un tracé accompagné de points `wpt` nommés garde leurs noms (`st.route.wpts`, 20 au plus, pour de futures étiquettes d'étapes).

**Itinéraire préparé avec une IA** (issue #85, `js/route.js`, `CMS.route`) : section repliable « Préparer l'itinéraire avec une IA », sur le modèle du prompt d'illustration, sans aucun appel réseau. Réglages (`st.routePrompt`) : type de parcours (balade à pied, vélo, voiture / road trip, plusieurs villes), lieux de l'affiche à reprendre (cochables), étapes libres (400 caractères), aller simple ou boucle, langue (français, anglais). `buildRoutePrompt` (fonction pure) donne à l'IA la ville, la date, les lieux cochés avec leurs coordonnées à 6 décimales, l'emprise de la carte (`mapBounds` : cadre de la carte de l'aperçu ; le tracé doit y rester, sauf en voiture ou en plusieurs villes, où elle est indicative), 10 étapes au plus ; il demande la liste des étapes et **une validation** avant le GPX, puis un format strict (GPX 1.1, un `wpt` nommé par étape, un `trk` de 50 à 400 points qui suit les voies, le XML seul dans un unique bloc de code) et, en repli, les seules étapes dans un `rte`. Il se met à jour à chaque réglage. Un conseil sous le prompt renvoie, pour un tracé exact, vers un calculateur d'itinéraire qui exporte un GPX (cités sans lien).

**Contrôle de vraisemblance** (`routeChecks`, fonction pure), après tout import (fichier ou collage), sur les points lus avant simplification et par rapport au lieu et à l'emprise d'avant le recadrage : un point à plus de 10 km du lieu principal (vélo : 40 ; voiture : 150 ; plusieurs villes : 3 000), ou, à pied et à vélo, hors de l'emprise élargie de moitié → « Une partie du tracé est loin du lieu de l'affiche… vérifiez les étapes » ; deux points consécutifs à plus de 1 km (vélo : 3 ; voiture : 10 ; jamais pour plusieurs villes) → « Le tracé relie des étapes en ligne droite », avec le bouton **Pointillés**. Le message reste affiché sous l'import (`#routeWarn`).

### 4.4. Typographie (6 champs, 11 familles)

Interlettrage : le texte est tracé **graphème par graphème** (`CMS.glyphs`, `Intl.Segmenter` ; repli NFC) : un « é » décomposé ou un émoji composé reste d'un bloc ; largeurs mises en cache par police.

Champs : **Titre** (« Blois ») · **Sous-titre** (« Val de Loire • France ») · **Coordonnées** (automatiques ou saisies) · **Dédicace** (« Là où tout a commencé ») · **Noms** (« Prénom & Prénom ») · **Date** (« Le 23 septembre 2023 »).
Familles :

| Famille | Police | Esprit | Réglages |
| :--- | :--- | :--- | :--- |
| **Serif** (défaut) | Playfair Display | Didone à fort contraste, élégante et lisible | — |
| **Sans** | Montserrat | Linéale géométrique, contemporaine | — |
| **Mono** | Space Mono | Machine à écrire, technique | — |
| **Garamond** | Cormorant Garamond | Garalde classique, italique calligraphique, chiffres elzéviriens ; s'accorde avec les thèmes Crème & Encre et Sépia vintage | Graisse 500 et corps × 1,12, pour compenser le petit œil et le trait fin à l'impression |
| **Art déco** | Josefin Sans | Géométrique des années 1920, capitales élancées, esprit affiche de voyage ; s'accorde avec Prestige Onyx & Or et Nuit boréale | Corps × 1,04 |
| **Bodoni** | Bodoni Moda | Didone très contrastée, titres « magazine » | — |
| **Italiana** | Italiana | Capitales fines et élancées | Corps × 1,05 ; pas d'italique |
| **Fraunces** | Fraunces | Serif douce et chaleureuse | — |
| **Jost** | Jost | Géométrique façon Futura | — |
| **Bebas** | Bebas Neue | Linéale condensée en capitales, affiche | Corps × 1,18 ; pas d'italique |
| **Calligraphie** | Great Vibes | Calligraphie anglaise | Corps × 1,4 ; manuscrite (`script`) |
| **Cinzel** | Cinzel | Capitales romaines lapidaires (minuscules en petites capitales) ; titres de cartes anciennes | Pas d'italique |
| **Fell** | IM Fell English | Romain du XVIIᵉ siècle à l'encrage irrégulier, l'écriture des cartes anciennes, avec son italique | Corps × 1,05 ; latin seul |
| **Marcellus** | Marcellus | Capitales évasées des inscriptions romaines, minuscules douces | Pas d'italique |

**Police du titre et police du texte** (onglet **Textes**, section Typographie, #72) : le titre peut avoir sa propre police (« Comme le texte » par défaut) ou le style **Vintage** (première carte, valeur `*vintage` ; voir « Style des textes » ci-dessous). Sept **duos** préassortis : Origine (Playfair), Mariage (Italiana + Calligraphie), Voyage (Bebas + Jost), Classique (Bodoni + Garamond), Moderne (Jost), Chaleureux (Fraunces + Montserrat), Cartographe (Cinzel + Fell). Les cartes de police se filtrent par catégorie (Classiques, Modernes, Manuscrites, Affiche, Gravées) et montrent le titre ou les noms saisis.

**Règle de la police manuscrite** : elle n'est jamais mise en capitales, ni espacée, ni penchée. Elle ne sert qu'aux lignes d'émotion (dédicace, noms, légendes des deux lieux) ; le sous-titre, les coordonnées, la date et la légende prennent alors la police du titre (Playfair si le titre est lui aussi manuscrit).

**Style des textes, commun aux trois types d'affiche (#71, #74)** : `st.illusText` porte le style du titre (`style` : `auto`, `vintage`, `font`), les couleurs des lettres (`color`), de l'ombre (`shadow`) et du contour (`outline`, `''` = aucun) et le décalage de l'ombre (`off`). Les valeurs `auto` sont résolues par `CMS.illus.textStyle()` selon le type d'affiche :

| Champ | Carte | Illustration, Carte + illus. |
| :--- | :--- | :--- |
| `style: 'auto'` | police choisie | Vintage |
| `color: 'auto'` | couleur Texte du thème | couleur Texte du thème |
| `shadow: 'auto'` | aucune | couleur du papier |

Choisir une police de titre ou un duo passe `style` à `font` ; une ambiance le remet à `auto`. En mode Carte, `drawPosterAt` pose `ui.textFx` pendant le dessin des lignes du gabarit : `CMS.textFx.styled` applique à chaque ligne de texte (option `key` ; la mention des sources n'en a pas) la couleur, l'ombre et le contour proportionnés à son corps (décalage `off × 0,8 %`, contour 3,5 %), et Bebas Neue au titre en Vintage ; `drawRun` (en-tête Souvenir) fait de même, titre et date en deux segments. Taille et place restent celles du gabarit.
**Migration** : un état sans `illusText.v === 2` (antérieur aux valeurs Auto) voit son style Vintage passer à `auto` (même rendu dans chaque mode) ; pour une affiche Carte, lettres, ombre et contour reviennent à `auto` / `''`, car le mode Carte ne les dessinait pas : son rendu ne change pas. Une affiche illustrée garde ses couleurs.

**Position des textes en mode Carte (#75)** : `st.illusText.map = {pos, free, fpos, ffree}`, propre au mode Carte (`CMS.illus.posOf()` renvoie l'objet du mode courant) ; `'auto'` = **dans le gabarit** (défaut, rendu inchangé). Un bloc placé sur l'une des 9 positions ou glissé (`CMS.illus.mapMoved()`) est retiré du gabarit pendant le dessin (`ui.textHide`, lu par `textLine`), qui le traite comme une ligne masquée sans changer la géométrie : la carte garde sa taille, la zone reste vide. Il est ensuite dessiné sur toute l'affiche par la mise en page des modes illustrés (`textLayout`, `CMS.illus.drawMapTexts`), avec les mêmes zones de prise, aimantation (sauf vers « Dans le gabarit ») et commandes clavier (Origine : retour au gabarit). Gabarit Lettres : le titre forme la carte et n'est jamais déplacé.

**Zones et présentations des textes (#86)** : `st.illusText.deco`, `illusText.map.deco` et `illusText.mix.deco` (`{title, foot}`, propres à chaque type d'affiche) donnent la présentation de chaque bloc : `libre` (défaut, rendu inchangé), `cartouche`, `bandeau`, `etiquette`, `filets` (celles du bloc du bas, `FOOT_DECOS`), `capsule` (le `ruban` d'avant #90), `arc`, `cachet`, `vertical` (`DECOS`). `illusText.mix.zone = {title, foot}` (`illus` par défaut, `map`, `poster`) choisit la zone du bloc en Carte + illustration (`zoneArea` : rectangle inscrit dans la forme du médaillon, partie opaque du fondu ; `illus` = la bande en Vignette). `textLayout(ctx, W, H, U, over, env)` met en page chaque bloc avec sa présentation (marges intérieures `PADS`, plaque `box`, rectangle de prise `rect`) ; `drawBlock` la dessine ; `drawBlocks` place chaque bloc dans sa zone. Sur la carte (`env.halo`), « Auto » remplace l'ombre par un contour couleur papier. Plaques : encre `plateInk` (couleur des lettres si contraste ≥ 4,5:1 sur le papier, sinon Texte du thème). Arc et cachet : lettres posées une à une le long d'un cercle (`arcLayout`) ; l'arc suit le cadre de la carte (`env.map`, `arcShape` : médaillon rond ou en arche, gabarits Médaillon et Arche), il est fixe (`hitInfo[k].fixed`) et exclu de l'alerte de débordement. Une présentation sans objet (`decoWhy`) est gardée dans l'état et rendue en texte seul (`decoOf`). `hitInfo` est désormais par bloc (`{title, foot}`, chacun avec sa zone `area` et son type `kind`). Prompt : un bloc qui ne tombe pas sur l'illustration n'y réserve plus de zone (phrase `noTitle`).

**Trait des plaques et ordre des lignes** (Textes, Plus de réglages `#textMore`, ouverte d'office si l'un de ses réglages est actif) : `st.illusText.plate = {line, w, color}` (`PLATE_LINES` : `solid` par défaut, `double`, `dashed`, `dotted`, `none` ; épaisseur × 0,5 à 3 ; `'auto'` = encre de la plaque, papier sur le ruban), commun aux trois types d'affiche, tracé par `plateLine` pour le cartouche (un seul cadre), le bandeau (un filet en haut et en bas) et le ruban (cadre couleur papier rentré dans la banderole). `st.lineOrder` : `null` (ordre du gabarit) ou permutation des six lignes (`CMS.order`, `js/config.js` : `norm`, `sort`, `current`). `drawCartouche` trie ses lignes (chacune garde son style et son écart) ; `textLayout` trie titre et sous-titre, `footRows` la dédicace, les noms et la ligne date · coordonnées (rang de la première des deux, `infoLine` dans le même ordre) ; la bande de la vignette suit. Souvenir, Voyage et Deux lieux gardent leur disposition (note `order` de `CMS.deps`).

**Organisation de l'onglet Textes (#88)** : Vos textes (lignes, modèles), Mise en page (mises en page prêtes, une carte `.tcard` par bloc : zone, position, présentation), Typographie (duos dont Vintage, `*vintage` dans `#duos`, coché quand `textStyle().vint` ; taille de tous les textes ; couleur des lettres), puis Plus de réglages (`#textMore`, état mémorisé `cms3.textMoreOpen`). La section s'ouvre d'office (`moreActive`, sans mémoriser) quand une police hors duo, l'ombre, le contour, une taille de ligne, `dedWrap`, `coordFormat`, le trait ou l'ordre diffère du défaut. Relecture : groupes `typo` (duo, Vintage, lettres), `fonts`, `textFx`, `lineSizes`, `lineOpts`, `textMore` (ces quatre derniers comptés dans l'en-tête de la section).

**Gabarits du bas, plaques et loupe (#90)** : `ftpl` (objet de positions du mode : `classique` par défaut, `pile` (une information par ligne), `ligne`, `souvenir`, `carnet`, `colonnes`, `FOOT_TPLS`) choisit la mise en forme du bloc du bas ; `footTpl` renvoie ses lignes, chacune avec une abscisse `x` depuis le bord gauche du contenu (`cl`) et son alignement `al`, et ses filets `rules`. Mode Carte : une mise en forme autre que Classique sort le bloc du gabarit ; Vignette : la bande garde Classique (`drawBand`). Présentations : le ruban est retiré (`normState` le change en `capsule`) ; `etiquette` (coins coupés, `chamfer`), `capsule` (`pill`, lettres papier), `filets` (`drawRules`, sans fond, lettres et filets à la couleur des lettres). Marges intérieures `PADS` agrandies et multipliées par `illusText.plate.gap` (× 0,5 à 2,5). Loupe du mode Aperçu (`CMS.clean`) : transformation CSS de `#poster` (translation et échelle, bornée à l'écran), gestes sur `#cleanExit` (pincer, double toucher, molette, + − 0, flèches ; toucher simple différé de 300 ms pour distinguer le double toucher), rendu net unique par passage (`composePoster` à min(taille d'export, largeur affichée × dpr × 4), image JPEG `#zoomSharp` posée sur l'affiche, libérée à la sortie). Fond des plaques à fond papier (cartouche, bandeau, étiquette) : `illusText.plate.fill` (`'auto'` = papier, ou une teinte) et `plate.alpha` (0 à 1, 0,92 par défaut) ; l'encre des lettres et du trait « Auto » est choisie lisible sur ce fond (`plateInk(col, bg)`).

**Modèles de texte** : Rencontre, Mariage, Naissance, Maison, Voyage, Anniversaire. Un modèle remplace la dédicace ; il ne remplace les noms que s'ils sont encore ceux d'un exemple.

Le coefficient de corps (`scale`) et la graisse par défaut (`weight`) sont définis par famille dans `FONTS`.
Chaque ligne est **optionnelle** : une case à cocher devant chaque champ l'affiche ou la masque, sans effacer le texte saisi (état `show`, persisté). Dans les gabarits à cartouche (Cadre, Fondu, Médaillon), les lignes masquées ou vides sont retirées et les suivantes remontent ; le gabarit Fondu garde le bloc calé en bas. Dans le gabarit Souvenir, une ligne d'en-tête seule occupe toute la largeur, et les noms sans dédicace s'affichent seuls, sans filet.
Les textes trop longs sont réduits automatiquement pour tenir dans leur zone.

**Taille des textes.** Chaque ligne a son curseur de taille (60 à 150 %, état `textScale`), complété d'un curseur global « Tous les textes » (70 à 140 %, `textScaleAll`) ; les deux se multiplient (`tScale(k)`). Le lien « Tailles par défaut » les remet à 100 %, comme « Réinitialiser ». Exception : dans le gabarit Lettres, les lettres du titre prennent toujours la plus grande taille possible (§ 4.11) ; le curseur du titre y est sans effet.
* **Gabarits à cartouche** : quand une ligne grandit, les interlignes suivent (0,8 × l'écart de corps de la ligne, 0,25 × celui de la précédente). Si le bloc dépasse la hauteur disponible, il est réduit en entier pour tenir. Le gabarit Fondu garde le bloc calé en bas et le fait grandir vers le haut, sur la zone en fondu.
* **Gabarit Souvenir** : le titre et la date de l'en-tête gardent chacun leur taille, sur la même ligne de base (`drawRun`). En pied de page, si la dédicace et les noms dépassent la largeur, ils sont réduits du même facteur, ce qui garde le rapport entre les tailles choisies.
* **Réduction signalée** : pendant le rendu de l'aperçu, `drawText`, `drawRun` et `drawCartouche` relèvent les réductions automatiques (`noteFit`). Au-delà de 10 %, l'onglet Textes l'indique (« ↘ Réduit pour tenir dans l'affiche : dédicace (67 %) ») et le curseur de la ligne passe en orange. Si la dédicace réduite tient sur une ligne, l'avertissement propose « Passer la dédicace sur deux lignes ».
* **Dédicace sur deux lignes** (état `dedWrap`, sous le champ : Auto, Une ligne, Deux lignes) : en **Auto**, la dédicace passe sur deux lignes dès que, sur une seule, elle serait réduite de plus de 20 % (`WRAP_AT`, en tenant compte des noms à côté dans le gabarit Souvenir). La coupure se fait à l'espace qui rend la plus longue ligne la plus courte (`splitBalanced`) ; un mot seul n'est jamais coupé. Les mesures se font en unités `U`, à une taille de référence (`dedLines`, mises en cache, recalculées au chargement des polices) : la décision est la même dans l'aperçu, les vignettes et l'export. **La carte fait de la place** : dans le gabarit Souvenir, elle cède la hauteur de la deuxième ligne au pied (`souvenirFoot`), et le filet entre dédicace et noms s'allonge ; dans les cartouches sous une carte qui dépend de la hauteur (Cadre, Arche, Lettres), la carte raccourcit d'autant et le cartouche descend (`cartDed`). Les autres cartouches (Fondu, Médaillon, Cœur, Polaroid, Ciel, Deux lieux, paysage) ont déjà la place et ajoutent simplement la ligne ; le gabarit Voyage garde sa dédicace sur une ligne, à côté de la date. Quand la hauteur de la carte change, l'aperçu replace son cadre (`drawOver` → `layoutPreview`).

### 4.5. Réinitialisation

Le bouton **« Tout réinitialiser »** (`#bReset`), en bas de la relecture de l'onglet Export (ci-dessous), rétablit tous les réglages par défaut : lieu et cadrage (Blois), gabarit, thème et couleurs, repère, police, textes et lignes affichées, marge, épaisseurs et calques. Un premier appui affiche « Confirmer ? » pendant 4 s ; un second appui réinitialise (`resetAll`). La confirmation est intégrée à la page, car `confirm()` est bloqué dans les aperçus intégrés.
L'état est remplacé par `DEFAULT_STATE`, moteur compris : l'application revient au moteur Vectoriel GPU (la demande d'accord s'affiche s'il manque). Sont conservés : l'accord aux services tiers, les données déjà importées (en mémoire : un retour au moteur Fichier les retrouve), Mes affiches, les illustrations et les réglages de l'appareil (taille de l'interface, zone de sécurité). La réinitialisation est une étape d'historique (`commitHistory`) : « Annuler » revient en arrière, moteur excepté.

**Relecture : ce qui a changé** (`CMS.changes`, `js/features.js`). Une table unique de **parties** (repère, plusieurs lieux, itinéraire, cadrage et retouches de l'image, typographie, positions, tailles et lignes des textes, papier et dorure, couleurs, effets de tracé, ornements, ciel du jour J, tracé / calques / mise en page, rendu) dit, pour chacune, quels réglages s'écartent de `DEFAULT_STATE` (pour les couleurs : de la palette du thème choisi) et sait les rétablir. Ne comptent jamais : le lieu, le cadrage, les textes saisis, le type d'affiche, le gabarit et le thème (des choix, pas des écarts). Seules les parties qui agissent dans le type d'affiche courant sont listées (onglet visible, condition propre : ciel avec le gabarit Ciel, positions des textes du type courant…). Trois affichages :
* **pastille** sur l'onglet qui contient un réglage modifié, avec sa description (`aria-describedby`, bulle au survol) : « Réglages modifiés : Itinéraire : GPX actif ; Plusieurs lieux : 3 lieux » ;
* **compte** dans le titre des sections repliables (« Plus de réglages · 4 modifiés », « Personnaliser les couleurs ») ;
* **liste de relecture**, en tête de l'onglet Export : par partie, l'onglet, le nom, les écarts en clair, **Voir** (ouvre l'onglet, la sous-étape et les sections repliées, puis fait défiler jusqu'au réglage) et **Réinitialiser** (cette partie seule). Une réinitialisation partielle est une étape d'historique : « Annuler » la défait.

### 4.6. Ambiances et papier

**Au premier lancement** (issue #59 : non bloquant), une seule fenêtre modale s'ouvre : la demande d'accord (§ 2.4), imposée par la règle « aucune requête externe avant l'accord ». L'affiche par défaut est ensuite visible tout de suite, et une **proposition d'ambiance** (`#welStrip`, vignettes des 13 ambiances, à défilement horizontal) s'affiche en tête des réglages, sous l'affiche, sans la masquer. Un toucher applique une ambiance (étape d'historique annulable) ; la proposition reste alors affichée pour en essayer d'autres, jusqu'à sa fermeture (✕). Utilisée ou fermée, elle ne revient plus (`cms3.welcomed`). Elle ne s'affiche pas si une affiche est déjà enregistrée, ni à l'ouverture d'un lien partagé. Après « Travailler hors ligne », les réglages défilent d'abord jusqu'à l'import de fichier (section Avancé), prioritaire ; la proposition reste au-dessus.

**Ambiances** (en tête de l'onglet Style) : un toucher applique un ensemble assorti de thème, duo de polices, gabarit, repère et papier, en gardant le lieu et les textes. Vignettes rendues avec chaque ambiance ; l'ambiance active est signalée ; « Annuler » revient en arrière.

| Ambiance | Thème | Polices (titre / texte) | Gabarit | Repère | Papier |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Mariage doré | Galerie Or & Noir | Italiana / Calligraphie | Cœur | Alliances | Lisse |
| Naissance sauge | Sauge | Fraunces | Arche | Petits pieds | Grain |
| Carnet de voyage | Terracotta | Bebas / Jost | Voyage | Épingle | Kraft |
| Plan d'architecte | Plan d'architecte | Mono | Cadre | Point | Lisse |
| Nuit en ville | Néon | Bebas / Jost | Fondu | Anneau | Lisse |
| Bord de mer | Marine | Italiana / Jost | Polaroid | Ancre | Toile |
| Encre de Chine | Encre de Chine | Bodoni / Garamond | Médaillon | Cœur géométrique | Aquarelle |
| Carte ancienne | Sépia vintage | Garamond | Cadre | Étoile | Ancien, plis |
| Soirée de gala | Prestige Onyx & Or | Italiana / Garamond | Médaillon | Alliances | Lisse |
| Risographie | Risographie | Bebas / Jost | Voyage | Épingle | Grain |
| Lettres de ville | Crème & Encre | Bebas / Jost | Lettres | Point | Grain |
| Notre quartier | Souvenir | Garamond | Cadre | Cœur | Lisse |
| Souvenir | Souvenir | Playfair | Souvenir | Cœur | Lisse |

Une ambiance fixe aussi ses effets de tracé (§ 4.9), ses ornements et les plis du papier (§ 4.11) ; ceux qu'elle ne cite pas sont désactivés.

**Papier** : Lisse, Grain, Aquarelle, Kraft, Toile, Ancien. Les textures sont générées par le code (bruit pseudo-aléatoire à graine fixe), sans image. La base mesure 1 240 px de large et s'agrandit à la taille voulue : le grain est le même à l'aperçu et à l'export. Fusion `multiply` sur papier clair, `screen` sur papier sombre (texture inversée et désaturée). Dans l'aperçu, un calque `#cvTex` posé au-dessus de l'affiche reproduit la fusion avec `mix-blend-mode` ; à l'export, elle est appliquée au canvas final.
* **Ancien** : papier jauni, bords roussis (dégradé radial), salissures diffuses et rousseurs (petites taches brunes, isolées ou en grappes).
* **Plis d'une carte dépliée** (case à cocher, avec n'importe quel papier, même Lisse) : trois volets sur la largeur et deux sur la hauteur en portrait (l'inverse en paysage) ; chaque pli est une ombre douce d'un côté, un fin trait de cassure irrégulier, et une usure plus marquée aux croisements. Ils font partie de la texture (même rendu à l'aperçu et à l'export).

### 4.7. Deux lieux

Deux cartes sur la même affiche (par exemple « Notre rencontre » et « Notre mariage »), chacune avec son cadrage et son repère, une légende éditable et ses coordonnées. Une seule carte est interactive à la fois ; l'autre est une **image figée** rendue hors écran (MapLibre ou vecteurs) et redessinée quand ses réglages changent. Le choix du lieu édité se fait dans l'onglet Lieu ou en touchant l'autre carte de l'affiche. L'export rend les deux vues à pleine résolution. Avec le moteur Fichier, la seconde vue n'affiche que les données importées : pour deux lieux éloignés, le moteur Vectoriel GPU est conseillé. Ce gabarit n'affiche qu'un repère par carte (pas de lieux supplémentaires ni d'itinéraire).

### 4.8. Carte du ciel

Gabarit **Ciel** : disque des étoiles visibles au-dessus du repère principal à la date et à l'heure choisies, puis la carte en bandeau et le texte. Données : `lib/sky/sky-data.js` (2 851 étoiles de magnitude ≤ 5,5 et 150 tracés de constellations, époque J2000), issues de d3-celestial (licence BSD-3, compilées depuis XHIP et l'UAI), chargées seulement quand le gabarit est utilisé.
* **Calcul** : temps sidéral moyen de Greenwich, angle horaire, puis hauteur et azimut de chaque étoile ; la précession depuis J2000 est négligée (moins d'un demi-degré sur des décennies). Contrôle : l'étoile Polaire est à une hauteur égale à la latitude, à 1° près.
* **Projection** : stéréographique centrée sur le zénith, l'horizon au bord du disque, nord en haut et est à gauche (vue du ciel en levant les yeux), points cardinaux autour.
* **Réglages** : date et heure locales du lieu (proposées depuis la date du texte, à 22 h), fuseau horaire (celui de l'appareil à cette date, ou de UTC−12 à UTC+14 par demi-heure), constellations, grille.
* **Couleurs** : sur papier clair, disque à l'encre du texte et étoiles couleur papier ; sur papier sombre, disque couleur terre et étoiles couleur texte. L'attribution mentionne la source des données du ciel.
* **Lune** (activée par défaut) : position et phase approchées (longitude moyenne, anomalie et argument de latitude, terme principal de chaque série ; précision de l'ordre du degré, suffisante à cette échelle). Disque grossi pour rester lisible, partie éclairée tournée vers le Soleil, terminateur elliptique selon la fraction éclairée. Dessinée seulement au-dessus de l'horizon.
* **Planètes** (activées par défaut) : Mercure, Vénus, Mars, Jupiter et Saturne, d'après les éléments képlériens moyens du JPL (E. M. Standish, valables de 1800 à 2050 ; équation de Kepler résolue par Newton, puis passage géocentrique et équatorial). Point cerclé et nom en italique, au-dessus de l'horizon.
* **Voie lactée** (désactivée par défaut) : `lib/sky/milkyway.js`, cinq niveaux de densité issus de d3-celestial (`mw.json`, BSD-3, simplifié à 0,35°, 24 Ko), chargé seulement quand l'option est cochée ; chaque niveau est un voile léger qui s'ajoute aux précédents.

### 4.9. Effets de tracé

Effets cumulables (onglet Style), rendus de la même façon par les deux moteurs, à l'aperçu comme à l'export. Toutes les mesures sont exprimées pour un cadre de 800 px, puis mises à l'échelle du cadre.
* **Eau hachurée** : hachures à 45°, au pas de 6 px, sur fond couleur terre ; les traits prennent la couleur de l'eau assombrie de 28 %, pour rester lisibles sur une eau pâle. Sur une eau presque noire (Encre de Chine), les traits sont deux fois plus fins : les hachures ne dominent plus la composition.
  * Moteur Vectoriel GPU : motif `fill-pattern` fourni à la demande (événement `styleimagemissing`). Son identifiant (`pat:<motif>:…`) contient le motif, le pas, la densité de pixels et les deux couleurs, ce qui permet de le recréer sans état. Les trois motifs (hachures, points, hachures croisées) passent par `patTile`.
  * Vecteurs : motif de canvas (`createPattern`) à la même échelle.
* **Bâtiments en contour** : un trait fin (0,35 × l'épaisseur de référence) dans la couleur des rues secondaires, à la place de l'aplat.
* **Trait crayon** : chaque classe de rue est tracée deux fois, décalée de (1,2 ; −0,9) puis (−0,9 ; 1,0) × l'épaisseur de référence, à 72 % de sa largeur et 62 % d'opacité, comme une esquisse reprise au crayon. Côté GPU, deux couches par classe avec `line-translate`. Un tracé « tremblé » a été écarté : le moteur GPU ne peut pas le produire, et l'export ne correspondrait plus à l'aperçu.

* **Lueur** : sous les rues, trois halos de la même couleur, de plus en plus serrés (6 ; 3,4 ; 2 × la largeur du trait, opacités 7, 12 et 20 %). Côté GPU, trois couches par classe avec `line-blur` ; côté vecteurs, trois traits larges et pâles (un `filter: blur()` du canvas aurait été plus doux, mais Safari ne le gère que depuis peu). Pensée pour les thèmes sombres (Néon, Onyx).
* **Lignes d'eau gravées** : cinq contours parallèles autour des rives et des cours d'eau, au pas de 2,4 px, de plus en plus pâles en s'éloignant de l'eau, comme sur les cartes gravées du XIXᵉ siècle. Encre : l'eau assombrie de 32 % (éclaircie sur papier sombre). Côté GPU, chaque ligne est une couche `line` sur le contour de l'eau avec `line-gap-width` : deux traits parallèles, celui côté eau étant recouvert par l'aplat ; côté vecteurs, un trait large à l'encre puis un trait un peu moins large couleur terre, du plus éloigné au plus proche. Elles sont tracées avant les parcs, qui les recouvrent.
* **Bâtiments pointillés** : points en quinconce (pas de 5 px) sur un fond mi-chemin entre bâtiment et terre.
* **Parcs hachurés** : hachures croisées (pas de 7 px) un peu plus sombres que les parcs.
* **Surimpression riso** : l'eau est imprimée comme une plaque à part, décalée de (2,6 ; −1,6) px et posée par-dessus les rues. Vecteurs : fusion `multiply` (`screen` sur papier sombre) à 90 % ; GPU : couches finales `fill-translate` / `line-translate` à 90 % d'opacité (le style MapLibre ne connaît pas les modes de fusion : rendu approché).

**Autour du repère** (rayon réglable de 10 à 60 % de la largeur de la carte, 30 % par défaut) :
* **Halo du souvenir** : dégradé radial couleur papier, transparent jusqu'à 0,8 × le rayon puis presque opaque à 2,6 × ; la ville se dissout en s'éloignant du lieu. Dessiné dans la couche du dessus (`drawPoster`, sous les repères) : identique avec les deux moteurs.
* **Quartier en relief** : les rues du rayon reprennent la couleur du repère, 25 % plus épaisses. Vecteurs : rues retracées dans un disque de découpe, bord net ; GPU : couches filtrées par `within` sur un polygone de 64 côtés autour du repère (seules les rues entièrement dans le disque sont colorées, d'où un bord en escalier). Le style est recalculé quand le repère bouge.

Les ambiances fixent leurs effets : Encre de Chine (eau hachurée), Plan d'architecte (bâtiments en contour), Carnet de voyage (trait crayon), Nuit en ville (lueur), Carte ancienne (lignes d'eau, parcs hachurés), Soirée de gala (lueur, dorure), Risographie (surimpression, bâtiments pointillés), Notre quartier (halo, quartier en relief) ; les autres les désactivent.

### 4.10. Fluidité du moteur Fichier (cache de tracés)

`drawVectors` ne reprojette plus les géométries à chaque image. `vecPaths` construit, pour une taille de monde $S$ donnée (zoom et largeur du cadre), des `Path2D` en pixels « monde » relatifs au centre des données ; un déplacement n'applique qu'une translation.
* **Regroupement** : les surfaces (parcs, eau) gardent un tracé par objet, rempli en `evenodd` (îles) ; les classes nombreuses (bâtiments, voies par classe et par tunnel, cours d'eau, voies ferrées) sont regroupées par carreau de 256 px (`VEC_CELL`). Seuls les carreaux visibles sont tracés, réunis en un seul tracé par appel : un croisement n'est pas peint deux fois avec les tracés transparents (tunnels, trait crayon).
* **Validité** : le cache est rattaché aux données (`WeakMap`) et à $S$ ; un import le remplace, un changement de zoom en construit un autre. Trois tailles au plus sont gardées (aperçu, seconde vue, export).
* **Mesures** (ville synthétique de 30 000 bâtiments, cadre de 1 019 × 1 253 px, Chromium sans GPU) : déplacement au zoom 14 de 173 à 21 ms par image, au zoom 16 de 5,3 à 3,4 ms ; construction du cache, une fois par zoom, 23 à 30 ms.
* **Rendu** : identique à l'ancien tracé au pixel près, pour tous les effets et à la taille de l'export (au plus 1 pixel d'écart d'anticrénelage sur 5,8 Mpx).

### 4.11. Finitions : dorure, ornements, gabarit Lettres

Tous trois sont dessinés par `drawPoster` dans la couche du dessus : même rendu avec les deux moteurs, à l'aperçu et à l'export.
* **Dorure** : les textes, filets, contours et repères prennent un dégradé métallique tiré de leur propre couleur (ombre à −45 %, reflet à +62 %, en bandes diagonales sur toute l'affiche) ; l'or devient feuille d'or, le blanc argent, le terracotta cuivre. Les dégradés sont calculés à chaque rendu (`paint`, `foilGradient`) puis abandonnés : hors de `drawPoster` (vignettes des repères), la couleur reste unie. À l'impression, c'est une illusion de dorure ; un calque séparé pour la dorure à chaud reste à faire.
* **Ornements** (cases à cocher, sur chaque carte de l'affiche) :
  * **Échelle graphique** : longueur ronde (10 m à 50 km) la plus proche de 20 % de la largeur de la carte (26 % dans une forme), calculée au centre de la vue ($40\,075\,017 \cos\varphi / S$ m/px) ; quatre segments alternés sur une plaque de papier, en bas à gauche (centrée en bas dans un médaillon ou un cœur).
  * **Rose des vents** : huit pointes, couronne graduée, nord marqué ; en haut à droite (placée dans la forme pour le médaillon, le cœur et l'arche). Une seule, sur la première carte.
  * **Graduations** : méridiens et parallèles à pas rond (de 15″ à 2°, au plus cinq dans la largeur) en tirets pâles ; dans un cadre rectangulaire, repères au bord et valeurs en degrés et minutes (`1°19,5′E`, `47°35′N`).
* **Gabarit Lettres** : la carte occupe le haut de l'affiche ; un voile couleur papier (90 %) la recouvre, sauf dans les lettres du titre, découpées en `destination-out` sur un canvas intermédiaire de la taille de la carte (libéré aussitôt). Les lettres, en capitales de la police du titre, prennent la plus grande taille possible : sur une ligne, ou un mot par ligne si c'est plus grand ; un filet fin les détoure. La carte reste interactive dans l'aperçu : on la déplace sous les lettres. Le cartouche dessous reprend les autres lignes.

### 4.12. Mes affiches : sauvegarde et restauration de la configuration

La section **Mes affiches** (onglet Export, « Sauvegarde » ; ouverte aussi par `openSaves()`) garde la configuration complète d'une affiche : lieu, cadrage, repères et itinéraire, textes et tailles, gabarit, thème et couleurs, polices, effets, ornements, papier, ciel, type d'affiche et réglages de l'illustration. Ne sont pas inclus le moteur cartographique (choix de l'appareil) ni les données importées du moteur Fichier, trop volumineuses : on les réimporte. Une affiche illustrée garde la **référence** de son image (empreinte SHA-256) ; l'image elle-même est dans IndexedDB (§ 4.13).
* **Dans le navigateur** (`localStorage['cms3.saves']`, 40 affiches au plus) : nom (proposé : titre et noms), date, état, vignette JPEG d'environ 150 px (carte réelle avec le moteur Fichier, schématique avec le moteur GPU, dont le canvas n'est pas relisible). Enregistrer sous un nom existant, casse ignorée, met à jour cette affiche (sous le nom saisi) et la remonte en tête. **Ctrl + S** (⌘ + S) enregistre l'affiche en cours. Suppression en deux temps (« Supprimer ? »). La liste suit les modifications faites dans un autre onglet (événement `storage`). « Réinitialiser » ne touche pas aux sauvegardes.
* **Restaurer** applique l'état par `applyConfig`, commun au lien partagé et aux fichiers : validation par `normState`, moteur courant conservé, étape d'historique (« Annuler » revient à l'affiche en cours) ; en cas d'échec, l'affiche précédente revient intacte.
* **Fichier de configuration** (« Télécharger l'affiche en cours » ou ⤓ sur une sauvegarde) : `affiche-<nom>.json`, `{format: "city-map-studio/configuration", version: 1, app, name, savedAt, state}`. **Illustrations** : avec la case « Inclure les illustrations dans les fichiers » (cochée par défaut), un fichier dont une affiche est illustrée passe en **version 2** et ajoute `images: {<empreinte>: {data: "data:image/webp;base64,…", name, w, h}}` ; sans la case, ou si l'image n'est plus dans le navigateur, seule l'empreinte voyage (version 1) et l'illustration sera à réimporter. **Sauvegarde complète** : `mes-affiches-<date>.json`, `{format: "city-map-studio/sauvegardes", version: 1, saves: [...]}`. Les deux s'ouvrent avec « Ouvrir un fichier » : une configuration est appliquée, une sauvegarde complète est fusionnée dans la liste (sans doublon : même identifiant et même date ; limite de 40). Un état brut (ancien format, sans enveloppe) est aussi accepté.
* **Sécurité** : tout ce qui est relu (navigateur ou fichier) est traité comme un lien partagé. Taille bornée (1 Mo pour une configuration, 16 Mo pour une sauvegarde complète, 1 000 entrées lues au plus ; avec illustrations, 60 Mo et 400 Mo, 50 images lues au plus, chacune de 40 Mo au plus, décodée puis ré-encodée, refusée si elle est illisible ou si son empreinte n'a pas 64 caractères hexadécimaux, et jamais écrite à la place d'une image déjà présente sous la même empreinte), JSON vérifié, champs connus seulement, `normState` sur chaque état, nom tronqué à 80 caractères et toujours inséré comme texte, vignette acceptée seulement si c'est une image `data:` (JPEG, PNG ou WebP) de moins de 120 Ko. Un fichier non reconnu est refusé sans rien modifier. Un fichier d'une version plus récente est ouvert (réglages inconnus ignorés) avec un avertissement. Navigateur plein : message explicite, rien n'est perdu.

### 4.13. Affiche illustrée (mode Illustration)

Le **type d'affiche** (`st.mode`, sélecteur `#modeSeg` épinglé au-dessus des onglets, § 6) vaut **Carte** (`map`, l'affiche cartographique), **Illustration** (`illus`) : une affiche de voyage façon vintage, faite d'une illustration de la ville et d'un grand titre, ou **Carte + illustration** (`mix`, § 4.14). Changer de mode conserve le lieu, les textes, les polices, le format et l'image.

**Principe** : l'application **ne génère pas l'image**. Elle rédige un **prompt** pour l'IA de l'utilisateur (ChatGPT, Gemini…), qui pose ses questions, propose des thèmes et livre une illustration **sans texte ni marge** ; l'utilisateur l'importe, l'application la cadre, la retouche et pose le titre avec de vraies polices. Aucune clé API, aucune requête réseau, aucun service tiers : la carte n'est pas affichée (`renderMap` ne crée ni ne réveille MapLibre) et aucune mention cartographique n'est inscrite.

* **Onglets** : Lieu, **Illustration**, Textes, Style, Export (pas de Repère : il n'y a pas de carte). Le Lieu reste modifiable (#77), sans placement sur la carte ni zoom (`maponly`) : la ville et le lieu de rencontre donnent le titre, les coordonnées inscrites et les pistes du prompt. Les onglets Textes et Style montrent les mêmes réglages que pour une carte (#71), et chacun y agit de la même façon (#77, § 4.15). Style garde ambiances, thème (papier et couleur Auto des textes), couleurs d'après l'illustration ou une photo, papier (dont « Papier jauni sur l'illustration »), plis et dorure ; les réglages propres à la carte (« Plus de réglages » : gabarits, touche d'or, tracé, effets, ornements, calques, couleurs détaillées) sont masqués (classe `maponly`).
* **Étape 1 · Prompt** (`CMS.illus.buildPrompt`, fonction pure) : ville et région (titre et sous-titre de l'affiche), pistes facultatives (8 au plus ; « L'IA propose » par défaut ; saisies, ou trouvées dans la carte, ci-dessous), moment de la journée, saison, palette (proposée par l'IA, couleurs du thème de l'affiche, d'une photo), langue (français ou anglais). Le prompt interdit **tout texte et toute marge** en tête, puis au moment de générer (« no text, no letters, no title, no typography, no border, no frame, full bleed »), et demande à l'IA de **vérifier elle-même** l'image et de la régénérer au besoin (premiers essais : titre ajouté, marge crème). Il impose les proportions du format (A4 et A3 : 1:1,414 ; 50 × 70 : 5:7, avec au moins 4000 px ; sinon 2:3 ; paysage à l'avenant), réserve une zone calme à la position du titre et, si des lignes de pied sont affichées, du côté opposé. Les choix déjà tranchés sortent de la liste des questions. **Copier le prompt** passe par le presse-papiers (repli : texte sélectionné et `execCommand('copy')`).
* **Pistes lues dans la carte** (bouton « Trouver des pistes dans la carte ») : monuments (château, palais, phare, fort, ruines, cathédrale ou basilique — une simple église compte moins —, attraction, musée, point de vue), cours d'eau, plans d'eau, sommets, parcs, et paysages génériques (vignobles, bord de mer, port). Moteur Fichier : éléments nommés gardés à l'import (`osmData.named`, 5 000 au plus, étiquettes utiles seulement). Moteur GPU : carte MapLibre hors écran du lieu (`CMS.engines.mlQuery`, même file d'attente que les rendus d'export ; tuiles OpenFreeMap, donc avec l'accord préalable), couches OpenMapTiles `poi`, `waterway`, `water_name`, `mountain_peak`, `park`, `landcover`, `water`. Classement (`rankPistes`, fonction pure) : poids du type, rang OpenMapTiles (importance), distance au centre ; un nom une seule fois ; 6 pistes au plus, proposées en puces (« + nom ») qu'un toucher ajoute au prompt.
* **Pistes Wikipédia** (issue #46, option désactivée par défaut, § 2.4) : articles géolocalisés autour du lieu principal, classés par `CMS.wiki.rankWiki` (fonction pure) : 3 × ln(1 + nombre de langues) + ln(1 + longueur en milliers de caractères) − 0,3 × distance en km ; communes, quartiers, divisions administratives, gares, établissements scolaires, voies… écartés d'après la description courte ou le titre, comme la ville de l'affiche elle-même ; « (Blois) » retiré des titres. Blois : Château de Blois, Cathédrale Saint-Louis de Blois, Pont Jacques-Gabriel… Les 6 meilleures passent en tête des puces proposées.
* **Étape 2 · Image** : glisser-déposer (zone ou aperçu), collage (Ctrl + V), bouton **« Coller l'image »** (issue #57 : `navigator.clipboard.read()`, au toucher seulement, proposé si l'API existe ; presse-papiers sans image ou accès refusé : message et renvoi au fichier ; aucun lien vers une IA tierce) ou choix d'un fichier ; sur écran tactile (`pointer: coarse`), le texte d'aide ne parle ni de glisser-déposer ni de Ctrl + V ; **PNG, JPEG ou WebP** (HEIC : issue #47), 40 Mo au plus, 64 px de côté au moins. L'image est décodée (`createImageBitmap`) puis **ré-encodée** dans un canevas : seuls les pixels sont gardés (métadonnées, coordonnées GPS comprises, écartées) ; au-delà de `min(36 Mpx, 0,6 × CANVAS_MAX_PX)`, elle est réduite. Une copie de 1600 px de côté au plus sert à l'aperçu.
* **Conservation** (issue #43) : l'état ne garde que `st.illus.img = {ref, name, w, h}`, où `ref` est l'**empreinte SHA-256** du fichier importé. L'image ré-encodée (WebP 95 %) est rangée dans **IndexedDB** (base `cms3`, magasin `images`, clé : l'empreinte) ; `navigator.storage.persist()` est demandé à la première image. L'image affichée suit toujours la référence de l'état : démarrage, restauration de Mes affiches, fichier, lien, « Annuler » la rechargent depuis IndexedDB. **Introuvable** (effacée par le navigateur, notamment par Safari après 7 jours sans visite d'un site non installé ; navigation privée ; affiche venue d'un lien ou d'un fichier sans image) : message « Illustration introuvable dans ce navigateur : « nom » (L × H px) », emplacement « Illustration à importer » sur l'aperçu, export désactivé, ligne d'état « Illustration à réimporter » ; une seule tentative de chargement par référence. **Réimport** : même empreinte → « Illustration retrouvée », cadrage et retouches conservés ; autre image → signalé, elle remplace l'ancienne (cadrage remis à zéro). Sans IndexedDB : l'image est gardée en mémoire pendant la visite, avec un avertissement. **Nettoyage** : au démarrage et après la suppression d'une affiche, les images que n'utilisent ni l'affiche en cours ni Mes affiches sont effacées (« Retirer » ne les efface pas aussitôt : « Annuler » les retrouve pendant la visite).
* **Lien partagé** : il ne contient que la référence, jamais l'image ; le destinataire voit « Illustration à importer » et le message de copie le rappelle.
* **Qualité d'impression** (`CMS.illus.quality`) : ppp effectifs pour A4, A3, 50 × 70 et 10 × 15 cm, selon l'orientation, le cadrage et le zoom ; **bonne** ≥ 200 ppp, **juste** ≥ 140, **insuffisante** en deçà (10 × 15 cm : **300 / 200**, une petite photo étant regardée de près) ; le format courant est mis en avant. Exemple : 1696 × 2528 px → A4 205 ppp (bonne), A3 145 (juste), 50 × 70 86 (insuffisante). **Agrandir ×2** : rééchantillonnage lissé puis léger renforcement des contours, à l'export seulement, borné par la mémoire ; le lissage est crédité de 45 % (aucun détail n'est inventé, ce que dit l'interface).
* **Cadrage** (`st.illus`) : remplir l'affiche ou image entière (bandes de la couleur du fond), zoom de 30 à 300 % de l'ajustement (sous 100 %, l'image rapetisse et laisse voir le papier ; elle reste découpée par sa zone, celle de la composition en Carte + illustration), décalage en fraction de la zone (le centre de l'image y reste, ou ses bords restent atteignables quand elle déborde : `bound`), « Recentrer ». Gestes en Modification, choix Illustration (§ 6.2) : glisser, pincer autour des doigts, molette autour du pointeur, double toucher (ajustée, centrée), aimantation au centre et aux bords de la zone, taille affichée (`#zoomBadge`). **Retouches** point par point (`processPixels`, identiques à toute résolution) : luminosité, contraste, saturation ; **filtre vintage** léger (sépia 18 %) ou marqué (sépia 42 %, contraste + 6 %, saturation − 15 %) ; **aplats** (6 niveaux par couche). **Grain** : bruit fixe d'une base de 1240 px agrandie (même grain à l'aperçu et à l'export) ; **papier jauni** : `#E7D6B0` en produit.
* **Textes** (`st.illusText`, communs aux trois types, § 4.4) : style du titre **Vintage** par défaut (`auto` ; Bebas Neue en capitales, interlettrage 3 %, ombre décalée nette) ou police choisie ; couleurs des lettres (Auto, nuancier ou couleur libre), de l'ombre (Auto : couleur du papier) et du contour (« aucun » possible) ; décalage de l'ombre ; **9 positions** (haut, milieu, bas × gauche, centre, droite). Le sous-titre suit le titre ; dédicace, noms, date et coordonnées se placent du côté opposé, centrés. `drawText` accepte une police imposée (`fk`), une ombre et un contour.
* **Déplacer les textes** (issues #48 et #53) : deux blocs, le **titre** (titre et sous-titre) et le **bloc du bas** (dédicace, noms, date et coordonnées, toujours groupés).
  * Placement : 9 positions prédéfinies (`pos`, `fpos`), « Auto » pour le bloc du bas (à l'opposé du titre, centré : le rendu d'avant, vérifié lettre par lettre), ou **position libre** (`free`, `ffree` : centre du bloc en fraction de la zone des textes, identique à l'aperçu, à l'export et d'un format à l'autre).
  * Glisser sur l'aperçu : des zones de prise transparentes (`#hitTitle`, `#hitFoot`, 44 px de haut au moins) couvrent les deux blocs ; partir d'un texte le déplace, ailleurs l'illustration ou la carte bougent comme avant. Comme elles sont au-dessus de la carte, glisser un texte posé sur le médaillon ne la déplace pas. Aimantation sur les axes centraux pendant le geste ; à la fin, retour à la position prédéfinie (ou à « Auto ») la plus proche si le bloc en est à moins de 4 %.
  * Clavier : Tab atteint chaque bloc ; flèches = 1 % de la zone (Maj : 5 %), Origine = retour à la grille (ou à « Auto »), Échap = sortie.
  * Alignement des lignes selon le tiers où se trouve le centre du bloc (gauche, centre, droite).
  * Chevauchement autorisé, signalé dans l'onglet Textes (bloc du bas sur le titre ; texte sur la carte du médaillon).
  * Vignette : les deux blocs se placent à gauche, au centre ou à droite de la bande (déplacement horizontal seulement).
  * Prompt : la zone calme du titre et celle des lignes du bas suivent leur position réelle (la plus proche).
  * Une seule fonction de mise en page (`textLayout`) sert au rendu, aux zones de prise, à l'aimantation et au prompt.
* **Rendu** : `geom` renvoie `g.illus` (aucune vue de carte) et `drawPoster` délègue à `CMS.illus.draw` : fond et image dans la passe `under`, textes dans la passe `over`. Aperçu et export restent identiques. Sans image, l'aperçu montre un emplacement en pointillés et l'export est désactivé (message si on le demande). La carte MapLibre, masquée, ne modifie plus le cadrage (son cadre a une largeur nulle : le zoom n'en est pas déduit).

### 4.14. Carte + illustration (mode `mix`)

* **Onglets** : Lieu, Repère, **Illustration**, Textes, Style, Export. Tous les réglages de la carte restent disponibles (moteur, repère, halo, thèmes, effets, ornements, calques, attributions), sauf les ambiances et les gabarits, remplacés par la composition (classes `layoutonly`, `maponly`, `illusonly`, `pureillus`, `mixonly`). Deux lieux, ciel et légendes des deux lieux ne s'appliquent pas.
* **Étape Composition** (avant Prompt et Image ; ouverte d'office tant qu'aucune image n'est importée), `st.mix = {compo, shape, pos, split}` :
  * **Médaillon** (`med`) : l'illustration couvre l'affiche ; la carte est dans une forme de 45 % du petit côté (**rond**, **cœur** à 92 % de hauteur, **arche** à 120 %), centrée en largeur, **en haut** (à 24 % de la hauteur), **au centre** ou **en bas** (12 % au-dessus du bord). Un anneau couleur papier et un filet de la couleur du titre l'entourent. Titre et lignes de pied comme en mode Illustration (9 positions).
  * **Vignette** (`vig`) : la carte encadrée (double filet du gabarit Cadre, marge de l'onglet Style) ; l'illustration dans une **arche** de proportions 3:4 (30 % de la largeur ; 22 % en paysage), en haut à droite de la carte, bordée de papier avec une ombre portée ; une **bande** de 24 % du petit côté sous la carte reçoit titre, sous-titre, dédicace, date et coordonnées, centrés et réduits ensemble pour y tenir (couleur du titre si elle se lit sur le papier, sinon l'encre du thème).
  * **Haut / bas** (`hb`) : l'illustration sur la moitié haute (ou les deux tiers : `split`), la carte en dessous, séparées par un filet couleur papier ; titre et lignes de pied dans l'illustration.
  * **Côte à côte** (`cote`) : l'illustration à gauche, la carte à droite ; la choisir passe l'affiche en paysage. Titre réduit à la largeur de la moitié.
  * **Fondu** (`fondu`) : l'illustration couvre l'affiche ; la carte occupe les 42 % du bas et s'efface vers le haut (opaque à partir de 45 % de sa hauteur) : masque CSS à l'aperçu, carte rendue à part puis masquée (`destination-in`) à l'export. Textes dans le haut.
* **Prompt** : il connaît la composition. Médaillon : zone calme de la forme et à sa position, en plus de la zone du titre. Vignette : sujet unique, centré, lisible de loin, sans zone de titre, proportions 3:4. Haut / bas et côte à côte : place de l'illustration dans l'affiche, et proportions de sa zone (`ratioText` : la plus proche d'une liste usuelle, avec en secours la plus proche de celles des générateurs : 2:3, 3:4, 1:1, 4:3, 3:2, 16:9). Fondu : bas de l'image simple (eau, prairie, chemin). La phrase transmise est affichée dans l'étape Composition.
* **Qualité d'impression** : calculée sur la zone réellement occupée par l'illustration (`CMS.illus.region`) ; la vignette demande ~3,3 fois moins de pixels que la pleine page.
* **Couleurs de la carte d'après l'illustration** : onglet Style, « Couleurs d'après une image » (`CMS.palette`, § 4.2), source « L'illustration » (copie d'aperçu, `CMS.illus.previewImage`). Dans l'autre sens, la palette « Thème de l'affiche » du prompt transmet les couleurs de la carte à l'IA.
* **Marge et contour** (#77) : la marge (passe-partout) agit sur la Vignette, le « Contour de la forme » sur le Médaillon (sans lui, seul le filet couleur papier détache la carte) ; masqués pour les autres compositions (`updateLayoutUI`).
* **Gestes** : médaillon : glisser hors de la carte déplace l'image, dans la carte déplace la carte ; vignette : une zone de prise (`#illusHit`) au-dessus de la carte déplace l'image, la carte garde ses gestes ailleurs. Décalage en fraction du cadre de l'illustration. **Calque cadré** (#77, bouton flottant `#bLayer`, illustration importée) : zoom, recentrage et verrou « Toucher pour cadrer » agissent sur la carte (par défaut) ou sur l'illustration (`CMS.illus.layer`) ; l'illustration cadrée, la carte est figée (`#app[data-layer=illus] #slot`). Sur téléphone, seul le calque cadré se déplace.

### 4.15. Mêmes capacités d'édition dans les trois types d'affiche (#77)

Règle : un réglage visible agit dans le type d'affiche courant ; sinon il est masqué (§ 6.1). Vérifié par `tests/parity.py`.

* **Textes** : les modes illustrés (et les blocs sortis du gabarit en Carte, #75) passent par `textLayout`, dont le bloc du bas (`footRows`) suit les mêmes réglages que les gabarits : dédicace sur une ou deux lignes (`dedLines`, réglage `dedWrap`), noms, ligne « date · coordonnées » composée de morceaux à leur propre taille (`infoLine`, `drawLine` : Taille de la date et Taille des coordonnées), légende des lieux numérotés (Carte + illustration ; jamais en Illustration, sans repère). La bande de la vignette reprend ces lignes.
* **Positions des textes** : propres à chaque type (`illusText` pour l'Illustration, `illusText.mix`, `illusText.map`) ; un état antérieur donne à la Carte + illustration les positions jusque-là partagées (`normState`).
* **Pas d'effet de bord** : une ambiance n'applique que ce qui existe dans le type courant (Illustration : thème, polices, papier, plis, dorure ; Carte + illustration : sans gabarit) et le message le dit ; « Côte à côte » rend l'orientation d'avant quand on choisit une autre composition ; le titre « Auto » (Police en Carte, Vintage ailleurs) est expliqué sous les polices du titre (`#titleAuto`).
* **Couleur du repère** : puce « Auto » (couleur Repère du thème), et puce de la couleur en cours enfoncée (`aria-pressed`).
* **Cadrage** : les boutons flottants +, − et « Centrer » agissent sur le calque cadré (Illustration : l'image, dès qu'elle est importée ; Carte + illustration : le choix Carte ou Illustration de « Que déplacer ? »), comme la Modification (§ 6.2).
* **Rendu** : `geom` renvoie `g.mix`, `g.map` (une vue), `g.illus` (et `g.band`) ; `drawPoster` délègue à `CMS.illus.drawMix` : image du médaillon dans la passe `under`, carte (export), halo, ornements, repères, anneau ou cadre, vignette, textes et attribution OpenStreetMap dans la passe `over`. Export : il faut l'accord réseau (moteur GPU) et l'image.

## 5. Export haute définition

### 5.1. Formats et résolution

* **Formats** (onglet Export, section « Rendu », état `format`, table `FORMATS`) : A4 (2480 × 3508 px à 300 DPI, par défaut), A3, 50 × 70 cm et **10 × 15 cm** (tirage photo chez un labo : 1181 × 1772 px à 300 DPI, sans marge de fond perdu ; la question d'un fond perdu de 3 mm reste ouverte, issue #50), en portrait ou en paysage. A4 et A3 ont le rapport √2 ; 50 × 70 cm, le rapport 7/5 ; 10 × 15 cm, le rapport 3/2 : l'aperçu, les vignettes et la mise en page suivent (tailles en `U`). Le format ne change pas le contenu de la carte : une affiche plus grande montre la même zone, plus détaillée. L'export est un **recalcul intégral** à pleine résolution, jamais un agrandissement de l'aperçu.
* **Résolution et limites des canevas** (`exportSpec`) : 300 DPI si le canevas tient dans `CANVAS_MAX_PX`, sinon la plus haute résolution qui tient, par pas de 10 DPI. La limite est de 16,7 Mpx sur iPhone, iPad et Android (au-delà, Safari iOS rend un canevas vide) et de 40 Mpx ailleurs (mémoire). La résolution abaissée est annoncée sous le choix du format, sur le bouton d'export et dans le résultat de l'export.

  | Format | Ordinateur | iPhone, iPad, Android |
  | :--- | :--- | :--- |
  | A4 | 2480 × 3508 px, 300 DPI (8,7 Mpx) | identique |
  | A3 | 3508 × 4961 px, 300 DPI (17,4 Mpx) | 3391 × 4795 px, 290 DPI (16,3 Mpx) |
  | 50 × 70 cm | 5315 × 7441 px, 270 DPI (39,5 Mpx) | 3346 × 4685 px, 170 DPI (15,7 Mpx) |
  | 10 × 15 cm | 1181 × 1772 px, 300 DPI (2,1 Mpx) | identique |

  170 DPI suffisent pour une affiche de 50 × 70 cm regardée à plus d'un mètre.
* **Mémoire** : en A4, 8,7 Mpx, sous la limite de 16,7 Mpx de Safari iOS, et un canvas WebGL d'environ 2160 × 2500 px, sous la limite de 4096 px. Les grands formats restent sous ces limites grâce à `exportSpec` et au rendu en tuiles (§ 5.3) ; le canevas de l'affiche est libéré dès l'image encodée, avant d'assembler le fichier final.

### 5.2. Fichiers produits

* **Type** (« Image PNG » ou « Document PDF », état `fileType`) : le PNG est sans perte et porte sa résolution (`pHYs`). Le PDF (`pdfFromJpeg`, écrit sans bibliothèque : six objets, table `xref` exacte) contient une page à la taille exacte d'impression (mm → points PostScript, `MediaBox` et `TrimBox`), où l'affiche est une image JPEG qualité 0,95 (`DCTDecode`) aux dimensions de l'export, sans rééchantillonnage ; titre en UTF-16 (accents). jsPDF n'a pas été retenu : 350 Ko à embarquer pour une seule image par page. Noms : `affiche-carte-[ville]-300dpi.png` en A4, `affiche-carte-[ville]-a3-300dpi.png`, `affiche-carte-[ville]-50x70-270dpi.pdf`, `affiche-carte-[ville]-10x15-300dpi.png` (page PDF de 100 × 150 mm, soit 283,46 × 425,20 pt)… ; en mode illustré, `affiche-illustration-…`

### 5.3. Étapes de l'export (`exportPoster`)

1. Attente du chargement des polices (`document.fonts.load`), puis contrôle par `document.fonts.check` : si une variante manque, l'export se fait avec une police de secours et le signale dans le résultat de l'export.
2. Création d'un canvas aux dimensions du format (2480 × 3508 en A4) et dessin de la couche basse.
3. Carte :
   * **MapLibre** : instance hors écran de 800 px CSS de large, `pixelRatio` = largeur du cadre / 800 (environ 2,7 en A4), `preserveDrawingBuffer`, `maxCanvasSize` 8192, attente de l'événement `idle` (45 s au plus), puis `drawImage` dans le cadre. Au-delà du côté maximal d'un canevas WebGL (`glMax` : 4096 px au plus, moins si l'appareil l'impose), la carte est rendue **en tuiles** : même zoom, centres décalés en Mercator (tuiles de 512 px), chaque tuile débordant de 8 px CSS sur ses voisines puis découpée au recollage, ce qui évite tout effet de bord sur les traits et les motifs. Le rendu en 2 × 3 tuiles est identique au rendu d'un seul tenant (`tests/maplibre.py`) ;
   * **Fichier** : re-projection directe des géométries dans le cadre, à pleine résolution (cache de tracés propre à cette taille, cf. § 4.10).
4. Couche haute (repère, filets, textes) à la même échelle.
5. `toBlob('image/png')`, injection d'un chunk **`pHYs`** (11 811 px/m = 300 DPI) pour que les logiciels ouvrent le fichier à la bonne résolution, puis téléchargement de `affiche-carte-[ville]-300dpi.png` (en PDF : `toBlob('image/jpeg', 0.95)` puis `pdfFromJpeg`). Sur mobile, le partage natif (`navigator.share`) est proposé quand il est disponible ; si le téléchargement est bloqué, l'image reste enregistrable par appui long.

Préalables : accord réseau avec le moteur Vectoriel GPU, données importées avec le moteur Fichier, illustration présente dans les modes illustrés, contexte WebGL disponible ; sinon l'export est refusé avec un message.

### 5.4. Zone de sécurité (impression maison)

Issue #60 ; onglet Export, section « Rendu ». Les imprimantes de bureau n'impriment pas jusqu'au bord (3 à 5 mm). Une case affiche un **trait pointillé à 5 mm du bord** (`#safeGuide`, élément posé sur l'aperçu : il n'est jamais exporté), calculé selon la largeur imprimée du format et l'orientation. Pendant le rendu de l'aperçu, les textes (`drawText`, `drawRun`, boîte de la ligne de base à 75 % de la taille, jambages ignorés) et les repères sont relevés (`CMS.ink`, transformation courante appliquée) ; ceux qui entrent dans la bande sont nommés dans une alerte, avec le conseil d'augmenter la marge. La mention des sources est placée à 0,38 × la marge du bas : elle entre dans la bande en dessous d'une marge d'environ 6 % (A4, A3), et toujours en 10 × 15 cm (moins de 5 mm même à 12 %) : l'alerte conseille alors d'imprimer sans marge ou de confier le tirage à un laboratoire photo. Réglage de l'appareil (`cms3.safeZone`), hors de l'état de l'affiche. Un conseil près du bouton d'export rappelle d'imprimer en « Taille réelle / 100 % », et non « Ajuster à la page ». Pas de fond perdu ni de traits de coupe (impression maison). `tests/safezone.py`.

### 5.5. Composition commune et aperçu au mur

* **Composition commune** (`composePoster`) : la même fonction produit l'export, l'aperçu au mur et les vues des deux lieux ; elle rend chaque vue (une ou deux), puis l'affiche et enfin le papier.
* **Aperçu au mur** (onglet Export, section « Rendu ») : l'affiche rendue à 1 100 px environ, dans un cadre (chêne, noir, blanc, doré) avec ou sans passe-partout, sur un mur au choix (blanc cassé, sauge, terracotta, béton, nuit), avec une ombre portée. L'image se télécharge en PNG.

### 5.6. Partage par lien

Onglet Export, section « Sauvegarde ». L'état de l'affiche, sans le moteur cartographique, est compressé (`CompressionStream('deflate-raw')`, préfixe `z` ; sans cette API, JSON brut, préfixe `j`), encodé en base64url dans l'ancre de l'adresse (`#a=…`). Rien n'est envoyé à un serveur ; le lien contient le lieu et les textes, ce que l'interface rappelle. À l'ouverture, l'ancre est lue (64 Ko au plus, 512 Ko une fois décompressée : `SHARE_MAX_CHARS`, `SHARE_MAX_BYTES`), l'affiche reconstituée par `applyConfig` (validation `normState`), l'ancre effacée, et « Annuler » retrouve l'affiche précédente. Un itinéraire de plus de 400 points n'est pas inclus, et c'est signalé ; l'illustration n'y figure jamais (seule sa référence, § 4.13).

---

## 6. Interface (mobile en priorité)

L'usage de chaque commande est décrit dans le [guide de l'utilisateur](../USER_GUIDE.md) ; cette section fixe les règles de mise en page et de comportement.

### 6.1. Réglages dépendants d'un autre choix (issue #58)

Règle unique, appliquée par une table (`CMS.deps`, `js/features.js`) : un réglage qui **n'a aucun sens** dans le contexte est **masqué** ; un réglage **activé mais empêché** par un autre choix reçoit une **note d'une ligne** sous lui, avec un **bouton** qui fait la bascule. La bascule passe par les mêmes chemins que l'interface : elle entre dans l'historique et s'annule. Inventaire (vérifié par rendu : chaque réglage comparé avec et sans, pour chaque gabarit) :

| Réglage | Condition | Comportement |
| :--- | :--- | :--- |
| Contour de la forme | gabarits Médaillon, Cœur, Arche ; composition Médaillon (Carte + illustration) | masqué ailleurs |
| Marge (passe-partout) | Carte ; composition Vignette (Carte + illustration) | masquée pour les autres compositions |
| Ciel du jour J | gabarit Ciel | masqué ailleurs |
| Lieux 1 et 2, noms des lieux | gabarit Deux lieux | masqués ailleurs ; note fixe « un repère par carte » |
| Rayon autour du repère | Halo du souvenir ou Quartier en relief | **masqué** sans l'un d'eux |
| Numéroter les lieux, Relier les lieux | au moins deux lieux, hors Deux lieux | **masqués** sinon |
| Parcs hachurés | calque Parcs | note + « Afficher les parcs » |
| Bâtiments en contour | calque Bâtiments | note + « Afficher les bâtiments » |
| Bâtiments pointillés | calque Bâtiments, sans Bâtiments en contour (qui l'emporte) | note + « Afficher les bâtiments » ou « Retirer le contour » |
| Lueur | thème sombre (luminance du papier < 0,3) ; reste visible, mais faiblement, sur fond clair | note + « Voir les thèmes sombres » (filtre des thèmes) |
| Sous-titre | gabarits autres que Souvenir et Polaroid | note + « Passer au gabarit Cadre » |
| Itinéraire GPX | gabarits autres que Deux lieux | note + « Passer au gabarit Souvenir » |
| Décalage de l'ombre (titre illustré) | une ombre | masqué sans ombre |
| Réglages de la carte en mode Illustration ou Carte + illustration | mode | sections masquées (`maponly`, `mixonly`…) |
| Taille du titre | gabarits autres que Lettres (lettres à la plus grande taille possible, § 4.11) | note + « Passer au gabarit Cadre » |
| Taille d'une ligne, coordonnées saisies | ligne affichée (case cochée) | note + « L'afficher » quand la taille diffère de 100 % (ou que des coordonnées sont saisies) sur une ligne décochée |
| Couleur, épaisseur et pointillés de l'itinéraire | « Afficher l'itinéraire » coché | **masqués** sinon |

Aucun réglage ne dépend du moteur : les effets de tracé, motifs, calques, ornements, halo et dorure sont rendus à l'identique par le moteur Vectoriel GPU et le moteur Fichier ; seule la mention « © OpenMapTiles » suit le moteur (note fixe). La marge, les ornements, la dorure, les plis et les effets agissent dans tous les gabarits (`tests/deps.py`).

### 6.2. Disposition

* **Mobile portrait** : aperçu de l'affiche en haut, **panneau coulissant** en bas : type d'affiche, onglets, zone défilante des réglages, barre d'actions. Trois crans (`sheetHeights`, `setSheet`) :
  * **réduit** (`peek`) : type d'affiche, onglets et pied seuls ; sa hauteur est calculée sur ces éléments et sur les bandeaux affichés ;
  * **mi-hauteur** (`half`, 55 % de la hauteur, par défaut ; 120 px de réglages au moins) ;
  * **déplié** (`full`, 84 %) : l'affiche réduite à une vignette.

  On glisse la poignée (aimantation au cran le plus proche, avec une préférence pour le sens du geste), ou on la touche pour passer d'un cran à l'autre (flèches haut et bas au clavier). Toucher un onglet depuis le cran réduit ouvre la mi-hauteur ; toucher l'onglet actif bascule entre mi-hauteur et déplié. Le panneau se déplie pendant la saisie d'un texte, puis reprend sa place.
* **Deux colonnes** (`TWO_COL` : largeur ≥ 900 px, ou paysage et largeur ≥ 560 px) : panneau à gauche (`min(400px, 46vw)`), table lumineuse à droite. Pas de poignée ; Lecture et Modification comme sur mobile (souris : glisser, molette).
* **Lecture et Modification** (#82 ; mobile et ordinateur) : en **Lecture** (par défaut), rien ne bouge sur l'affiche : un calque transparent (`#shield`) la couvre entièrement ; les zones de texte et de vignette sont inertes au pointeur (le clavier reste possible). Une invitation visible (« ✎ Toucher pour modifier », « Cliquer pour modifier » à la souris) s'affiche aux deux premières utilisations (`cms3.editUses`). Le bouton **Modifier** de la barre d'actions (`#bEdit`), ou un toucher sur l'affiche, ouvre la **Modification** (`ui.framing`) : sur mobile, panneau réduit ; indication en haut de la scène (`#frameBar`) ; sélecteur « Que déplacer ? » dans le pied ; Modifier devient **Terminer**, et Comparer et l'étape suivante laissent la place. « Placer le repère » (onglet Lieu) reste possible en Lecture : il réduit le panneau et le rétablit une fois le repère posé (`stageMode`). « Modifier » est inactif quand rien ne peut bouger (Illustration sans image importée) ; une Modification où plus rien ne peut bouger (image retirée) revient en Lecture. « Modifier le lieu 2 » (Deux lieux) reste au-dessus du verrou : choisir le lieu édité ne déplace rien.
* **« Que déplacer ? »** (`CMS.intent`, `js/features.js` ; `#intentBar`) : en Modification, **un seul choix est actif à la fois**, parmi **Carte · Repère · Illustration · Textes** (boutons radio ARIA, flèches au clavier, cibles de 44 px). Ce qui est choisi reçoit les gestes ; le reste est inerte (CSS `#app[data-intent]` ; gestes de l'image dans `js/illus.js`). Les choix suivent le type d'affiche :

  | Type | Choix proposés |
  |---|---|
  | Carte | Carte · Repère · Textes (seulement s'il y a un bloc de texte déplaçable : position choisie ou glissée, § 4.4) |
  | Illustration | Illustration · Textes |
  | Carte + illus. | Carte · Repère · Illustration (image importée) · Textes |

  Choix de départ (`initial`) : placement en cours → Repère ; onglet **Repère** → Repère ; onglet **Illustration** → Illustration ; sinon la **zone touchée** (`enterAt` : l'illustration hors de la carte → Illustration, sinon Carte) ; sinon le calque cadré. **« Textes » n'est jamais choisi d'office** ; c'est un interrupteur : le toucher quand il est actif revient au choix d'avant. « Repère » lance le placement : un toucher sur la carte pose le repère, puis le choix revient à « Carte » ; « Terminer » arrête aussi le placement. Illustration et Carte choisissent le calque cadré de `CMS.illus` (`setLayer`). Un choix devenu impossible (bloc de texte remis dans le gabarit) est remplacé (évènement `hits:placed`). Choix Illustration : contour en pointillés de sa zone (`#illusFrame`, celle de la composition), gestes de l'image (§ 4.13). Le choix (`ui.intent`) n'est ni enregistré ni dans l'historique. `CMS.intent.open(choix)` ouvre la Modification sur un choix (console, tests).
* **Boutons flottants** (zoom, centrer ; Cadrer, Repère et Calque sont remplacés par Modifier et « Que déplacer ? ») : à droite ou en bas de l'aperçu, selon ce qui laisse l'affiche la plus grande ; masqués quand l'aperçu n'est qu'une vignette. En mode Illustration, sans image importée, aucun ne reste (« Aperçu » est dans la barre d'actions) ; l'image importée, zoom et « Centrer » agissent sur elle (#77). En Carte + illustration, le calque cadré se choisit par « Que déplacer ? ».
* **Voir l'affiche seule** (`CMS.clean`, issue #56) : referme la Modification ou le placement en cours, masque tout ce qui recouvre l'aperçu (boutons flottants, `#shield`, « Modifier le lieu 2 », badge de comparaison, légende des sources, zone de prise de la vignette) et le panneau des réglages, sur mobile (`--sheetH` à 0) comme sur ordinateur (une seule colonne) ; l'affiche occupe tout l'écran là où le navigateur le permet (API Fullscreen, `navigationUI: 'hide'` ; pas sur iPhone, où la fenêtre suffit), et quitter le plein écran par le navigateur quitte aussi ce mode. Le voyant d'état est masqué. Une couche transparente (`#cleanExit`) reçoit le toucher de sortie : il ne déplace pas la carte et ne pose aucun repère. Sortie aussi par Échap ou par le bouton retour du système (entrée d'historique `pushState`, sans changer l'adresse). Le panneau revient à son cran et le focus au bouton. Aucun état de l'affiche n'est modifié.
* **Barre d'actions** (pied du panneau, `.actbar`) : **Aperçu** (`#bClean`, affiche seule), **Modifier / Terminer** (`#bEdit`, ci-dessus), **Annuler**, **Rétablir**, **Comparer** (maintenir ; présent après un changement comparable, § 4.2 ; description complète au survol et pour les lecteurs d'écran) et un bouton principal (`CMS.actbar`) : **Suivant : <onglet>** mène à l'onglet visible suivant (même parcours que les boutons « Étape suivante »), et sur le dernier onglet **Exporter** lance l'export (désactivé avec le bouton d'export). Elle reste visible depuis tous les onglets, y compris au cran réduit (l'export ou l'onglet suivant ouvre alors la mi-hauteur). Libellés « Aperçu », « Comparer » et « Suivant : » quand la barre est assez large (requête de conteneur) ; icônes seules sinon, toutes à 44 px. **A− / A+** est dans la section Avancé de l'onglet Lieu, « Tout réinitialiser » dans la relecture de l'onglet Export (§ 4.5).
* **Superpositions** : la demande d'accord est un `<dialog>` modal en bas d'écran, avec un texte court et un repli « En savoir plus ». Le bandeau d'action (`#banner` : « Carte indisponible → Diagnostiquer », « Aucun fichier importé → Importer ») et celui des mises à jour (`#updBanner`, § 7.5) s'affichent en tête du panneau, hors de l'affiche. Les bulles d'information (`#toast`) apparaissent au-dessus du panneau.
* **États visibles** (voyant `#stPill` en haut à gauche de la scène, `setStatus`) : moteur actif, chargement, attente d'accord et mode hors ligne (pastille orange), erreurs réseau en clair. « Prêt » se réduit à la pastille (texte au survol et pour les lecteurs d'écran) ; un message sans gravité (fichier importé) s'efface au bout de 4 s ; chargement, attente et erreur restent écrits tant qu'ils durent.

### 6.3. Type d'affiche et onglets

* **Type d'affiche d'abord** (#62) : le choix **Carte / Illustration / Carte + illus.** est une barre unique (`#modeSeg`), épinglée au-dessus des onglets sur tous les écrans, y compris au cran réduit. Les onglets en découlent (`applyMode`, `js/illus.js`) :

  | Type | Onglets |
  |---|---|
  | Carte | Lieu · Repère · Textes · Style · Export |
  | Illustration | Lieu · Illustration · Textes · Style · Export (pas de Repère : il n'y a pas de carte ; #77) |
  | Carte + illus. | Lieu · Repère · Illustration · Textes · Style · Export |

  Changer de type ne perd rien (état, textes, illustration). L'onglet actif est conservé s'il existe dans le nouveau type, sinon on passe à Illustration (modes illustrés) ou à Lieu (retour en Carte). Sur téléphone, jusqu'à six onglets se partagent la largeur ; l'onglet « Illustration » s'affiche « Illus. » (nom accessible complet) : rien n'est tronqué ni ne défile à 360 px.
* **Parcours guidé** : les onglets suivent l'ordre de création ; chaque onglet se termine par un bouton « Étape suivante » (`data-next`), et l'onglet Export par le bouton d'export.
* **Onglet Lieu** : recherche, « Ma position actuelle », villes, lieu de rencontre et cadrage. Le moteur cartographique, l'import de fichier, le diagnostic, l'accord aux services tiers et la version (§ 7.5) sont dans la section repliable **« Avancé »** (`#adv`) : état mémorisé (`cms3.advOpen`), ouverture d'office quand elle devient utile (moteur Fichier, « Travailler hors ligne », diagnostic lancé depuis le bandeau).
* **Onglet Style : Essentiel et « Plus de réglages »** (#62) :
  * **Essentiel**, visible d'office dans les trois types (#73) : ambiances, thème, papier, plis et dorure. Les **polices** sont dans l'onglet Textes (section Typographie, #72), avec le style, les couleurs et la position des textes.
  * **« Plus de réglages »** (`#styleMore`, Carte et Carte + illus.) : gabarit (cartes, marge, contour, ciel du jour J), palette d'une photo, touche d'or, tracé, effets de tracé, halo et quartier, ornements, calques, couleurs détaillées (section repliable « Personnaliser les couleurs »), mention des sources. État mémorisé (`cms3.styleMoreOpen`).
  * **Ouverte d'office, sans mémoriser**, dès qu'un réglage qu'elle contient diffère du défaut (`moreActive` : effet de tracé, ornement, calque masqué, épaisseur du tracé ou des cours d'eau, mention des sources) : aucun effet appliqué n'est caché. Contrôle à chaque saisie dans la section et à chaque resynchronisation de l'état (`state:synced` : annuler, restauration, ambiance). Elle ne se referme jamais seule. Les couleurs ne comptent pas (tout thème les modifie), ni le gabarit (l'ambiance le choisit déjà).
  * Hauteur de l'Essentiel à 360 px : environ 2,1 écrans de téléphone, mesurée par `tests/flow.py` (objectif de #62 : 2).
* **Onglet Export** (#51 ; dernier onglet, dans les trois modes) : quatre sections, sans fenêtre modale.
  * **Relecture : ce qui a changé** : réglages modifiés par partie, « Voir », « Réinitialiser », « Tout réinitialiser » (§ 4.5).
  * **Rendu** : orientation, format d'impression, type de fichier (PNG ou PDF), résolution annoncée (et abaissement éventuel), zone de sécurité, aperçu au mur.
  * **Sauvegarde** : Mes affiches (§ 4.12), fichiers, illustrations incluses ou non, partage par lien (§ 5.6). À l'ouverture de l'onglet (événement `tab:export`), le nom proposé est rempli et la liste mise à jour.
  * **Export** : conseil d'impression « Taille réelle », bouton d'export (dimensions, format, DPI, PDF) ; après l'export, un encart (`#result`) montre l'aperçu, les informations du fichier (nom, taille d'impression, pixels, DPI, poids) et les avertissements (tuiles manquantes, police de secours), avec « Télécharger », le partage natif et « Masquer l'aperçu ». L'onglet Export s'ouvre et le focus va sur « Télécharger ».

### 6.4. Commandes

* **Recherche d'adresse** : uniquement à la validation (`debounceSubmit` : validation répétée ignorée pendant 300 ms), une seule à la fois (bouton inactif pendant la requête). Pas d'autocomplétion, que la politique d'usage de Nominatim interdit. Chaque résultat affiche le nom en tête et l'adresse en dessous, avec deux actions : « Carte + repère » et « Repère seul ». « Carte + repère » reporte aussi la ville (`addressdetails` : city, town, village…, à défaut le nom du lieu) dans le titre et « région • pays » dans le sous-titre, sauf texte personnalisé (seuls un texte vide, celui d'une ville proposée ou celui posé par la recherche précédente sont remplacés).
* **Ma position actuelle** : `navigator.geolocation` (haute précision, 15 s au plus ; permission demandée par le navigateur, page sécurisée requise). Elle place le repère et y centre la carte, à un zoom d'au moins 15.
* **Villes préréglées** : un toucher pose le repère, remplit le titre et le sous-titre, recadre la carte et retire les données importées du moteur Fichier (`osmData = null`).
* **Date** : un bouton calendrier, couvert par un champ `date` natif transparent pour fonctionner aussi sur iOS, remplit le champ au format de l'affiche (`frDate` : « Le 1er juillet 2023 ») et réaffiche la ligne si elle était masquée. Le texte reste modifiable, et le calendrier s'ouvre sur la date déjà saisie quand elle est reconnue (`isoFromFr`).
* **Polices** : cartes à défilement horizontal, chacune montrant le titre (police du titre) ou les noms (police du texte) saisis.
* **Clavier** : la carte du moteur Fichier est atteignable par Tab (rôle « application », consignes dans son nom) : flèches = déplacement de 10 % du cadre (Maj : 50 %), + / − = zoom de 0,5, Entrée = repère au centre en mode placement. Résultats de recherche en liste : focus sur le premier bouton, chaque bouton décrit par son lieu (`aria-describedby`), seule la phrase « N résultats pour « … » » est annoncée (zone d'état séparée), Échap ferme la liste et rend le focus au champ. Ctrl/Cmd + S enregistre dans Mes affiches (§ 4.12).
* **Annuler / Rétablir** (`hist`, `js/ui.js`) : jusqu'à 50 étapes (`HIST_MAX`), une par enregistrement de l'état (300 ms de calme), avec les boutons ou Ctrl/Cmd + Z et Ctrl/Cmd + Maj + Z (ou Ctrl + Y) hors des champs de texte, qui gardent leur annulation native. Les actions ponctuelles (ambiance, modèle, restauration, lien, réinitialisation) figent l'étape en cours avant d'agir (`commitHistory`) : elles s'annulent en une fois. Le moteur cartographique n'entre pas dans l'historique, et les petits recentrages de la carte qui suivent un retour arrière, une réinitialisation ou un changement de moteur sont ignorés. L'historique n'est pas conservé après un rechargement.

### 6.5. Accessibilité et lisibilité

* **Accessibilité** : fenêtres en `<dialog>` modal (`openDialog` / `closeDialog` : focus placé et retenu, Échap via `dlgCancel`, focus rendu) ; onglets selon le motif ARIA (`tablist`, `tab`, `tabpanel`, `aria-selected`, flèches, Début, Fin) ; segments et vignettes en `aria-pressed`, polices en `radio` ; focus clavier visible ; cibles tactiles d'au moins 44 px, barre d'actions comprise (poignée : 28 px de haut sur toute la largeur) ; texte de remplacement de l'aperçu qui suit les réglages ; transitions courtes, coupées si `prefers-reduced-motion`.
* **Contrastes de l'interface** (WCAG 2.2, critères 1.4.3 et 1.4.11, mesurés sur le rendu réel par `tests/contrast.py`, mobile et ordinateur, à l'agrandissement A+ compris) : textes 4,5:1 au moins (`--txt` 13:1, texte secondaire `--mut` 5,4:1 sur les panneaux, avertissement de réduction 9,7:1, texte d'erreur `--danger` 4,8:1) ; composants 3:1 (bordure des champs `--field` 3,3:1, pastilles d'état 5,3 à 10,8:1, icônes des boutons). Les boutons inactifs, exemptés par les WCAG, sont tenus à 3:1 (opacité `--off` .65) : lisibles, et nettement plus pâles que les boutons actifs. Une ligne masquée sur l'affiche garde un champ modifiable : sa bordure reste à 3:1, et seul son texte passe en couleur secondaire.
* **Taille du texte de l'interface** : les tailles sont en `rem`. L'interface suit le réglage du système (taille de police d'Android ; Dynamic Type d'iOS via `font: -apple-system-body`). A− / A+ propose 87,5 à 137,5 % (`UI_SCALES`), mémorisé dans l'appareil (`cms3.uiScale`), hors de l'état de l'affiche ; « Réinitialiser » ne le modifie pas. Sous 900 px de large, les champs de saisie font au moins 16 px pour éviter le zoom automatique d'iOS.

---

## 7. Contextes d'exécution et diagnostic

### 7.1. Contextes qui bloquent le réseau

Les deux services distants (tuiles OpenFreeMap, Nominatim) et, en secours, les CDN de MapLibre, sont appelés depuis la page. Plusieurs contextes d'ouverture **bloquent tout accès réseau** :
* l'aperçu de fichier intégré à certaines applications (messageries, assistants, gestionnaires de fichiers), qui charge la page dans une iframe sandboxée avec une politique CSP restrictive et bloque souvent les téléchargements ;
* certaines visionneuses HTML des gestionnaires de fichiers Android (`content://`) ;
* un réseau d'entreprise ou un bloqueur qui filtre certains domaines ;
* un appareil hors ligne.

### 7.2. Contre-mesures

1. **Détection du contexte** au démarrage (iframe, protocole, `navigator.onLine`), avec un avertissement explicite dans l'onglet Lieu.
2. **MapLibre embarqué** dans `lib/`, avec repli sur 3 CDN (12 s par source).
3. **Surveillance des tuiles** : un échec réseau, ou l'absence de tuile au bout de 15 s, affiche « Carte indisponible → Diagnostiquer ».
4. **Diagnostic réseau en un clic** : teste la librairie, OpenFreeMap et Nominatim, puis recommande un moteur.
5. **Moteur Fichier**, qui fonctionne sans aucun accès réseau.
6. **Enregistrement de secours** de l'export par appui long sur l'image.

### 7.3. Obtenir un fichier pour le moteur Fichier

| Source | Format | Limite / point d'attention |
| :--- | :--- | :--- |
| openstreetmap.org/export (lien de l'application) | `.osm` (XML) | Refus « too many nodes » au-delà d'environ 50 000 nœuds : zone d'environ 1,5 km de côté au maximum en centre-ville. |
| Autre outil d'extraction OSM | `.osm`, JSON OSM ou GeoJSON | Le JSON doit contenir un tableau `elements` (nœuds, chemins et relations, géométrie fournie ou par références de nœuds). |

### 7.4. Modes de déploiement

| Mode | Moteurs disponibles | Remarque |
| :--- | :--- | :--- |
| **GitHub Pages** (E12, § 7.6) | 1, 2 | **Recommandé**, surtout sur mobile : URL HTTPS stable, application installable, téléchargements fiables. |
| Serveur local (`python3 -m http.server`) | 1, 2 | Pour développer. |
| Fichier ouvert dans un navigateur (`file://`) | 1, 2 | Ni installable ni mis en cache. |
| Aperçu intégré d'une application ou visionneuse | 2 uniquement | Réseau et téléchargements bloqués. |
| Entièrement hors ligne | 2 uniquement | Après une première visite en http(s) (application en cache, § 7.5), ou en `file://`. Le moteur 1 exige le réseau : l'adresse des tuiles est fixe (`OFM_URL`) ; des tuiles autohébergées (extraction PMTiles, par exemple) demanderaient une évolution. |

### 7.5. Application installée et mises à jour (issue #65)

L'application installée (Chrome, Android, iOS) est le site dans une fenêtre dédiée : tout repose sur `sw.js` (cache) et `manifest.webmanifest` (icône, nom). Le navigateur voit une nouvelle version quand `sw.js` change d'au moins un octet ; d'où la constante `VERSION`, **générée au build** (§ 7.8) : `cms-AAAA-MM-JJ-<empreinte du contenu>`, donc nouvelle à chaque changement publié. Dans les sources, elle vaut `cms-dev`.

* **Stratégies de cache** : application (HTML, CSS, JS, manifeste, icônes) en **réseau d'abord**, avec une requête `cache: 'no-cache'` : le navigateur revalide auprès du serveur (304 peu coûteux) et ne sert jamais une copie périmée de son cache HTTP (GitHub Pages répond `Cache-Control: max-age=600`, sans possibilité de changer les en-têtes). `lib/` (versions figées) en cache d'abord. Le worker est enregistré avec `updateViaCache: 'none'`.
* **Détection** : `reg.update()` au démarrage, puis au retour au premier plan (`visibilitychange`), au plus une fois par heure : une PWA peut rester des jours en arrière-plan sur mobile.
* **Pas d'activation sans accord** : le nouveau worker reste en attente (`waiting`, pas de `skipWaiting()` à l'installation). Si la page est déjà contrôlée (donc pas à la première installation), un bandeau `#updBanner` affiche « Nouvelle version disponible » / **Mettre à jour** (✕ pour plus tard). Le bouton envoie `{type:'SKIP_WAITING'}` au worker ; `controllerchange` recharge alors la page **une seule fois**. Pas de rechargement automatique : un export ou un import d'illustration peut être en cours. L'état de l'affiche, enregistré en local, est retrouvé après le rechargement. Si un autre onglet a déjà activé la nouvelle version, le bandeau propose simplement de recharger.
* **Version visible** : onglet Lieu, section Avancé, sous le diagnostic (`#appVersion`). La page porte sa propre version (`CMS.build.version`, `js/core.js`), copie exacte de `VERSION` : elle est donc connue partout (`file://`, première visite, hors ligne, tests), affichée en date (« Version : 28/11/2026 (3522713) » pour `cms-2026-11-28-3522713` ; « (h) » pour l'ancien format `cms-2026-11-24h`). La version du worker actif est demandée en plus (`{type:'GET_VERSION'}` sur un `MessageChannel`) ; si elle diffère (mise à jour activée dans un autre onglet, copie hors ligne en retard), elle est ajoutée : « · copie hors ligne : 23/11/2026 (c) ». Identifiants bruts dans `data-version` et `data-sw`. Le diagnostic (« Diagnostiquer la connexion ») commence par une ligne **Version** : page, copie hors ligne à jour ou en retard (« Mettre à jour » ou recharger).
* **Identité** : le manifeste fixe `"id": "./"` (identique à l'identité dérivée de `start_url`) : changer un jour `start_url` ne créera pas une seconde application.
* **Garde-fous** : `tests/pwa.py` vérifie que tout fichier `.js` et `.css` de `js/`, `css/` et `lib/` (hors `lib/sky/`, chargé à la demande) figure dans `APP` et que tout élément de `APP` existe ; les polices woff2 sont mises en cache à leur premier usage. `VERSION`, la version de la page (`CMS.build`) et la liste `APP` sont produites ensemble par le build : plus de mise à jour à la main ni de contrôle en CI (l'ancien `tests/swversion.py` est retiré) ; `tests/pwa.py` vérifie toujours leur égalité et la liste.
* **Plusieurs copies sur la même origine** (#97) : la racine, `/nouvelle/` et les préversions `/pr-N/` partagent le stockage des caches du navigateur. Chaque worker nomme son cache `VERSION@dossier` (ex. `cms-2026-11-27d@/city-map-studio/nouvelle/`) et, à l'activation, ne purge que les anciens caches de son propre dossier : une préversion ne vide jamais le cache hors ligne de la version classique (vérifié par `tests/pwa.py`). La version classique figée (`v1-classique`) garde l'ancien nommage, sans `@`.
* **Hors de notre contrôle** : la mise à jour de l'icône et du nom de l'application installée par Chrome est asynchrone (WebAPK sur Android) ; elle se vérifie sur l'URL publiée, pas par test automatique.

### 7.6. Publication à deux voies (#97, #99)

Pendant la refonte, la version actuelle reste l'application de référence à l'adresse habituelle ; la nouvelle est publiée à côté. Le job `publish` de `.github/workflows/tests.yml` lance `.github/scripts/pages.sh` après des tests réussis, et écrit la branche `gh-pages`, source de GitHub Pages :

| Adresse | Contenu | Mise à jour |
| :--- | :--- | :--- |
| `/city-map-studio/` | Branche `classique` (étiquette `v1-classique` : version avant refonte) | À chaque publication ; après un correctif sur `classique`, relancer le workflow (Actions → Tests → Run workflow) |
| `/city-map-studio/nouvelle/` | Branche `main` | À chaque push sur `main` |
| `/city-map-studio/pr-N/` | Pull request N (commit de fusion testé) | À chaque push sur la pull request ; lien posté dans la pull request ; retirée à sa fermeture |

* Seuls les fichiers servis sont copiés (`index.html`, `manifest.webmanifest`, `sw.js`, `.nojekyll`, `css/`, `js/`, `lib/`, `icons/`) ; les autres préversions publiées sont conservées.
* Une seule écriture de `gh-pages` à la fois (`concurrency: gh-pages`) ; aucune publication pour une pull request venue d'un fork.
* Chaque copie a son propre service worker, limité à son dossier, et son propre cache (§ 7.5). Stockage local séparé (#100) : `/nouvelle/` et les préversions utilisent les clés `cms3.*` et la base `cms3`, la version classique `cityMapStudio.*` (§ 2.4).
* Bascule (lot 6, #104), seulement avec l'accord du propriétaire : `main` passe à la racine, la version classique sous `/classique/`.
* Essai local : `REMOTE=<dépôt> PUSH=0 bash .github/scripts/pages.sh` (variables `PR`, `PR_DIR`, `PR_CLOSE` décrites en tête du script).

### 7.7. Mesures de performance (#101)

L'application relève ses propres temps (`CMS.perf`, `js/core.js`), en mémoire seulement : rien n'est enregistré ni envoyé. Lieu › Avancé › « Mesures de performance » affiche la dernière mesure de chaque type, son budget et ✓ / ✗ ; « Copier les mesures » copie la version, l'appareil (navigateur, écran, densité) et les mesures, à coller dans une issue.

| Mesure | Début → fin | Budget |
| :--- | :--- | :--- |
| Ouverture jusqu'à l'aperçu | Début du chargement de la page → premier `idle` de la carte GPU (ou premier aperçu, sans carte GPU) | 3 s |
| Réglage visible | `changed()` → aperçu redessiné (`drawOver`), ou carte GPU au repos pour un réglage qui la restyle | 0,2 s |
| Export A4, Export 10 × 15 (et A3, 50 × 70 sans budget) | Clic sur Exporter, après l'accord → fichier PNG ou PDF prêt | 6 s, 3 s |
| Geste sur la carte | Doigt ou souris enfoncé sur la carte → relâché : 95e centile de l'intervalle entre deux images (10 images au moins) | 20 ms (60 images/s, gigue tolérée) |

Une mesure en attente qui n'aboutit pas en 10 s est abandonnée. Un seul appareil de référence (décision du 28/11/2026) : l'**Appareil S2x**, téléphone à écran 412 × 892 à densité 3,5, Chrome 159 sous Android.

**Relevés de référence du 28/11/2026** (Appareil S2x ; deux relevés par adresse quand ils existent) :

| Mesure | `/nouvelle/` (sources, lot 3) | Site construit (lot 4a, préversion #108) | Budget |
| :--- | :--- | :--- | :--- |
| Ouverture | 1,8 s · 467 ms | 614 ms · 813 ms | 3 s ✓ |
| Réglage visible (thème, carte) | 352 ms · 370 ms | 360 ms · 380 ms | 200 ms ✗ |
| Export A4 (PNG) | 851 ms · 784 ms | 558 ms · 583 ms | 6 s ✓ |
| Export 10 × 15 (PNG) | 1,1 s | 437 ms | 3 s ✓ |
| Geste sur la carte | 17 ms (59 images/s) | 18 ms (55 images/s) | 20 ms ✓ |

Le build ne fait rien régresser et accélère les exports. Seul le réglage d'un thème dépasse son budget, avant comme après le build : la mesure s'arrête quand la carte GPU est entièrement redessinée (`idle`), ce qui inclut le recalcul de toutes les tuiles ; point à traiter à l'horizon 1 (#61).

### 7.8. Construction du site publié (#102)

`npm run build` (`scripts/build.mjs`, esbuild) produit `dist/` à partir des sources, sans les modifier :

* les scripts de `index.html`, dans leur ordre, réunis en **un seul script classique** `js/app.<empreinte>.js`, minifié et **enveloppé dans une fonction** (environ 475 → 299 Ko) : les fichiers gardent leur portée commune, mais **aucun nom n'est global** sur le site publié (seul `CMS`, posé explicitement sur `globalThis`). Les tests n'atteignent l'application que par `window.__cms` et la **façade de test** de `js/main.js` (noms exposés sur `window` en mode `?test` seulement) : un test qui a besoin d'un nouveau nom l'y ajoute. Étape suivante (4b) : conversion des fichiers en modules ES ;
* `css/app.css` minifiée en `css/app.<empreinte>.css` ;
* `VERSION` (`sw.js`) et `CMS.build.version` (`js/core.js`) : `cms-AAAA-MM-JJ-<empreinte>` ; liste `APP` de `sw.js` : les fichiers réellement publiés ;
* `lib/`, `icons/`, `manifest.webmanifest`, `.nojekyll` copiés.

Les noms de fichiers à empreinte changent avec leur contenu : jamais de copie périmée d'un ancien script. La CI construit puis teste `dist/` ; `.github/scripts/pages.sh` construit `main` et chaque pull request avant de les publier (la version classique, sans build, est copiée telle quelle). `dist/index.html` s'ouvre en `file://` comme la source.

---

## 8. Organisation du code

### 8.1. Arborescence

```
city-map-studio/
├── index.html              # balisage, CSP, métadonnées ; charge css/ et js/ (sources ; dist/ = site construit, § 7.8)
├── css/app.css             # feuille de styles de l'application
├── js/                     # scripts classiques, chargés dans cet ordre (cf. § 8.2)
│   ├── core.js  config.js  maplibre-loader.js  geocoder.js  state.js  geo.js  render.js
│   └── engines.js  preview.js  features.js  ui.js  illus.js  export.js  main.js
├── sw.js                   # service worker (cache de l'application, http(s) seulement ; VERSION et liste APP générées au build)
├── package.json            # build : npm run build (scripts/build.mjs, esbuild) → dist/ ; npm test
├── manifest.webmanifest    # application installable
├── icons/                  # icône SVG, PNG 192 / 512 / maskable / apple-touch, image d'aperçu des liens (og-image.jpg)
├── .github/workflows/      # tests.yml : suite de bout en bout à chaque pull request et push sur main
├── lib/                    # dépendances embarquées
│   ├── maplibre-gl.js/.css # MapLibre GL JS 4.7.1 (licence BSD-3)
│   ├── fonts/              # polices woff2 + fonts.css + OFL.txt par famille (11 familles)
│   └── sky/                # données du ciel (sky-data.js, milkyway.js) + licence BSD-3 de d3-celestial
├── .nojekyll               # GitHub Pages : fichiers servis tels quels
├── LICENSE                 # MIT (code de l'application) + rappel des licences tierces
├── README.md               # présentation
├── USER_GUIDE.md           # guide de l'utilisateur
├── CONTRIBUTING.md         # règles de développement et commandes
├── docs/
│   ├── dossier-technique.md
│   └── evolution-overpass.md   # proposition : réintroduire le moteur Overpass, retiré en novembre 2026
└── tests/                  # tests automatisés (catalogue : § 9.2)
    ├── *.py                # un test de bout en bout par fichier (Playwright), lancés par run_all.py
    ├── unit/               # tests unitaires sous Node (*.test.mjs ; load.mjs charge les scripts dans node:vm)
    ├── run_all.py          # génère les données puis lance toute la suite (utilisé par la CI)
    ├── fixture.py, make_formats.py, make_city.py   # données de test : osm.json, data.osm, data.geojson, frame.html, city.json
    ├── jswait.py, seed.py  # attente d'une condition compatible avec la CSP ; préparation du localStorage (§ 9.1)
    ├── globals.max         # plafond des déclarations globales (tests/globals.py)
    └── layouts.py, make_og.py   # outils hors suite : captures des gabarits, image d'aperçu des liens
```

### 8.2. Fichiers et sections du script

Le script est découpé en fichiers `js/*.js`, eux-mêmes organisés en sections balisées `// ---------- Titre ----------`.
Ce sont des scripts classiques : leurs déclarations de premier niveau sont partagées et le **code exécuté au chargement
d'un fichier ne peut utiliser que les fichiers précédents** (les fonctions, elles, peuvent s'appeler d'un fichier à l'autre).
Pour réduire cette portée partagée, le code migre vers des modules `CMS.define('nom', () => {…})` : leur code est privé, seules leurs fonctions publiques sont reprises en tête de portée (`const {a, b} = CMS.nom`). Les fichiers se parlent par des événements synchrones (`CMS.on` / `CMS.emit`) plutôt que par des tests de présence :

| Événement | Émis par | Écouté par |
| :--- | :--- | :--- |
| `state:saved` | `saveState` (état écrit dans `localStorage`) | historique, comparaison, réglages dépendants, prompts de l'illustration et de l'itinéraire |
| `state:synced` | `syncInputs` (interface resynchronisée avec l'état) | modes illustrés, « Plus de réglages », réglages dépendants |
| `tab:export` | `showTab('export')` | Mes affiches (nom proposé, liste) |
| `illus:input` | champs liés `illus.*` / `illusText.*` | `CMS.illus` |
| `illus:loaded` | `CMS.illus` (image rechargée depuis IndexedDB) | — (point d'accroche) |

`tests/globals.py` interdit toute hausse du nombre de déclarations globales (plafond `tests/globals.max` : 378, à abaisser quand il baisse) ; `tests/unit/` teste les fonctions pures sous Node, sans navigateur.

| Fichier | Contenu |
| :--- | :--- |
| `core.js` | Socle : espace de noms `CMS`, `CMS.define` (module défini une seule fois, figé), bus d'événements `CMS.on` / `CMS.emit`. Chargé en premier. |
| `config.js` | Constantes : formats, polices, thèmes, gabarits, repères, ambiances, villes, hiérarchie routière, `DEFAULT_STATE` ; `CMS.illusConf` (listes de valeurs des modes illustrés, partagées avec `normState`). |
| `maplibre-loader.js` | `CMS.maplibre` : chargement résilient de MapLibre (sources, délais, version, CSS de secours). |
| `geocoder.js` | `CMS.geocoder` : client Nominatim (délai, annulation, une requête par seconde, quota 429 / 403, relance 5xx, cache, réponses validées). |
| `wiki.js` | `CMS.wiki` : lieux remarquables de Wikipédia autour du lieu (recherche géographique, délai, annulation, cache, réponses validées, classement `rankWiki`). |
| `state.js` | Validation (`normState`), état `st`, fenêtres modales (`openDialog`, `closeDialog`, `setBusy`), accord préalable, enregistrement. |
| `geo.js` | `CMS.geo` : Mercator, `geom` (géométrie des gabarits), formes (`shapeD`), `exportSpec`. |
| `render.js` | Typographie (`CMS.glyphs` : graphèmes et largeurs), relevé des zones d'encre pour la zone de sécurité (`CMS.ink`), cartouche, repères, ciel, `drawPoster`. |
| `engines.js` | `CMS.engines` : données OSM, cache de tracés et tracé Canvas (moteur Fichier), effets de tracé, moteur MapLibre, rendus hors écran (`gpuQueue`, `mlQuery`). |
| `preview.js` | `$`, `h` (création d'éléments sans `innerHTML`), canevas de l'aperçu (`CMS.surface`), défilement du panneau (`CMS.panelScroll`), aperçu, deux lieux, gestes, papier, `composePoster`, aperçu au mur. |
| `features.js` | Lieux multiples, GPX, partage par lien et `applyConfig`, proposition d'ambiance, ambiances et modèles, panneau coulissant, réglages dépendants (`CMS.deps`), zone de sécurité (`CMS.safe`), affiche seule (`CMS.clean`), palette d'une photo, Mes affiches. |
| `route.js` | `CMS.route` : itinéraire préparé avec une IA (prompt `buildRoutePrompt`), GPX collé (`extractGpx`), contrôle de vraisemblance (`routeChecks`). |
| `ui.js` | Taille de l'interface, coordonnées, historique, `buildUI`, `changed`, vignettes, recherche (`CMS.searchUI`), polices, comparaison avant / après un changement (`CMS.compare`). |
| `illus.js` | `CMS.illus` : modes Illustration et Carte + illustration (§ 4.13 et 4.14) : prompt, pistes lues dans la carte, conservation dans IndexedDB, import et ré-encodage de l'image, qualité d'impression, retouches, rendu de l'image et des textes, interface (sélecteur de mode, onglet Illustration, style du titre). |
| `export.js` | `CMS.export` : export PNG et PDF, contexte d'exécution, diagnostic, import de fichier. |
| `main.js` | `boot`, application installable et mises à jour (`CMS.pwa` : `install`, `check`, `version`), crochets de test. |

Principales sections :

| Section | Fonctions clés | Rôle |
| :--- | :--- | :--- |
| Constantes | `THEMES`, `ROADS`, `HW_CLASS`, `ML_CDNS`, `PRESETS` | Paramétrage. |
| État | `DEFAULT_STATE`, `loadState`, `saveState` | État unique `st`, persisté dans `localStorage`. |
| Accord préalable | `needConsent`, `giveConsent`, `declineConsent`, `withdrawConsent` | Aucun appel tiers avant l'accord de l'utilisateur. |
| Mathématiques | `merc`, `project`, `unproject`, `viewBounds`, `dms` | Web Mercator 512 px, zoom de référence pour un cadre de 800 px. |
| Gabarits | `geom` | Rectangle ou cercle de la carte selon le gabarit. |
| Rendu de l'affiche | `drawPoster`, `drawCartouche`, `drawMarker`, `drawText` | **Fonction unique pour l'aperçu et l'export** (passes `under` / `over` / `all`). |
| Moteur 2 : données | `normalizeElements`, `stitch`, `parseOsm`, `vecPaths`, `drawVectors`, `checkDataBanner` | Données OSM → cache de `Path2D` → Canvas 2D. |
| Moteur 1 | `loadMaplibre`, `buildStyle`, `initMaplibre`, `renderMaplibreOffscreen`, `mlFail` | MapLibre + OpenFreeMap ; export hors écran. |
| Interface | `parseCoords`, `placeMarkerFromInput`, `setMarker`, `goTo`, `setEngine`, `askReset`, `resetAll` | Commandes de l'atelier. |
| Contexte et diagnostic | `ENV`, `showEnvWarning`, `runDiagnostics`, `netMsg` | Détection d'iframe ou de blocage réseau, tests des services. |
| Moteur 2 : import | `osmXmlToElements`, `geojsonToElements`, `importText`, `importFile` | Import de fichier, avec recadrage automatique. |
| Export | `exportPoster`, `withDpi`, `crc32`, `pdfFromJpeg` | PNG ou PDF au format choisi (`exportSpec`) ; A4 : 2480 × 3508 px à 300 DPI. |
| Débogage | `window.__cms` | Accès à l'état et aux fonctions depuis la console et les tests ; exposé seulement avec `?test` dans l'adresse ou `localStorage['cms3.debug']='1'`. |

---

## 9. Tests et critères d'acceptation

### 9.1. Organisation des tests

Tests de bout en bout Playwright (Python), un fichier par domaine, avec un **réseau simulé** : OpenFreeMap (TileJSON et tuiles MVT générées à partir des données de test) et Nominatim sont simulés, tout autre accès externe est coupé. Les données de test sont générées avant la suite (`fixture.py`, `make_formats.py`, `make_city.py` ; non versionnées). `python tests/run_all.py` lance toute la suite, plusieurs tests à la fois ; le workflow `.github/workflows/tests.yml` l'exécute à chaque pull request et à chaque push sur `main`, avec le Google Chrome de l'image du runner, après construction (`npm run build`) et **sur `dist/`** (variable `CMS_ROOT=dist`, lue par chaque test ; par défaut, la source), puis publie le site si tout passe (§ 7.6). `unit` et `globals` portent toujours sur les sources. Les commandes figurent dans `CONTRIBUTING.md`.

**Verdict** : un test échoue si son code de sortie n'est pas nul, ou si sa sortie contient une vérification en échec (ligne commençant par « ✗ » suivie d'un texte), une erreur de page (`PAGEERROR`) ou une trace Python. Chaque test imprime ses vérifications (« ✓ » / « ✗ ») et se termine par une assertion. Un test en échec sous charge est relancé seul une fois : s'il passe, il est signalé « INSTABLE ».

**Règles du banc de test** :
* **Crochets de test** : les tests ouvrent la page avec `?test` (sinon `window.__cms` n'existe pas) ; `__cmsTestConfig` abaisse certains délais (chargeur MapLibre, géocodeur). Le service worker n'est pas enregistré pendant les tests, sauf avec `?test&sw` (`tests/pwa.py`).
* **CSP et attentes** : `page.wait_for_function()` évalue sa condition avec `eval()` dans la page, ce que la CSP refuse. Les tests utilisent `tests/jswait.py`, qui interroge la condition avec `page.evaluate()` (protocole DevTools, non soumis à la CSP). La CSP n'est jamais désactivée dans les tests.
* **Persistance et rechargement** : un script injecté par Playwright (`add_init_script`) qui accède à `localStorage` au démarrage de chaque document fait perdre, au rechargement suivant, des écritures récentes de la page (mesuré sur une page minimale : 0 perte sur 25 rechargements sans script injecté, 3 à 4 sur 25 avec). Les tests qui rechargent la page préparent donc le stockage avec `tests/seed.py` (écriture par la page elle-même, puis rechargement) et attendent que l'état soit enregistré avant de recharger. Un utilisateur réel n'est pas concerné. Les clés de départ ouvrent aussi les sections « Avancé » et « Plus de réglages » (`advOpen`, `styleMoreOpen`) et marquent la proposition d'ambiance comme vue.
* **Visibilité** : un test vérifie l'affichage réel d'un élément (`offsetParent`, `is_visible`), pas son attribut `hidden` : une règle `display` de composant peut l'emporter sur `hidden` (la règle globale `[hidden]{display:none!important}` l'empêche).

### 9.2. Catalogue et critères d'acceptation

| Test | Domaine | Critères vérifiés |
| :--- | :--- | :--- |
| `run.py` | Parcours de référence | Moteur Fichier sur mobile et ordinateur ; DMS (47,5861 → 47° 35′ 10.0″ N ; 1,99999 → 2° 00′ 00.0″ E, retenue) ; fleuve assemblé avec ses îles ; export PNG 2480 × 3508 avec `pHYs` 300 DPI. |
| `offline.py` | Hors ligne | Réseau coupé : MapLibre depuis `lib/`, carte signalée indisponible, diagnostic en échec avec recommandation du moteur Fichier ; import `.json`, `.osm`, `.geojson` ; export 2480 × 3508 ; avertissement dans une iframe. |
| `maplibre.py` | Moteur Vectoriel GPU | `lib/` sans CDN, style valide (filtres 4.7.1), tuiles reçues, couches des effets, export hors écran 2480 × 3508 non vide, rendu en 2 × 3 tuiles identique au rendu d'un seul tenant, pistes lues dans les tuiles. |
| `mlloader.py` | Chargement de MapLibre | Bascule vers un CDN, pas de double instance, adoption d'une copie tardive, refus d'une autre version, CSS de secours, aucun CDN sans accord. |
| `webgl.py` | Contexte WebGL | Perte et restauration (état affiché, export refusé puis rétabli), échec rapide hors écran, un seul rendu hors écran à la fois, carte libérée en moteur Fichier. |
| `perf.py` | Performance, netteté | Épaisseurs GPU en expressions de zoom égales à `zoomFactor`, aucun `setStyle` pendant les gestes ; densité de pixels suivie ; graphèmes tracés d'un bloc. |
| `vectors.py`, `city.py` | Moteur Fichier | Cache de tracés réutilisé au déplacement, reconstruit au zoom ou aux données, rendu identique avec un cache neuf, carreaux visibles seuls, croisement transparent non repeint ; ville réaliste : import JSON (≈ 0,15 s) et XML, fleuve assemblé (7 membres, 2 îles), points de contrôle, cache ≈ 0,2 s, déplacement ≈ 2 ms par image, exports. |
| `coords.py` | Saisie du repère | Formats du § 3.3 acceptés, saisies invalides refusées avec un message, recentrage si le point sort du cadre. |
| `geocoder.py`, `keyboard.py` | Recherche, clavier | Délai, quota 429 sans requête, relance 5xx, cache, une requête par seconde, réponse piégée rendue comme texte, diagnostic sur `/status`, serveur joignable malgré une réponse illisible (sans CORS) ; carte du moteur Fichier et résultats au clavier (§ 6.4). |
| `texts.py`, `textsize.py`, `dedication.py` | Textes | Dans les 11 gabarits : chaque ligne se masque et se réaffiche sans perte, chaque curseur de taille agit (sauf lignes non affichées et titre de Lettres), retour à 100 % = rendu d'origine ; réduction signalée ; persistance ; 14 polices distinctes ; dédicace Auto / Une / Deux lignes, carte qui fait de la place, même décision à l'export ; exports 2480 × 3508. |
| `fonts.py` | Polices | Les 11 familles (normale et italique quand elle existe) se chargent depuis `lib/fonts/` en `file://` et en HTTP ; export sans police de secours ; aucune requête vers Google. |
| `formats.py`, `safezone.py` | Formats, impression | Dimensions et DPI de chaque format et orientation (ordinateur, iPhone) ; état forgé corrigé ; export A3 PNG ; PDF 50 × 70 et A4 paysage (structure, `xref`, page en points, image JPEG) ; zone de 5 mm par format, export inchangé, alertes, conseil du 10 × 15. |
| `design.py`, `art.py` | Évolutions graphiques | 14 polices et duos, règle de la police manuscrite ; 16 thèmes, filtres, contraste ; gabarits distincts, cœur découpé dans l'aperçu ; ambiances et modèles annulables ; 10 repères ; 3 lieux numérotés et reliés ; papiers et plis ; aperçu au mur ; lien ; paysage 3508 × 2480 ; deux lieux ; GPX simplifié et cadré ; Polaire à la hauteur de la latitude ; effets (rendu modifié, identique avec un cache neuf), halo, dorure, ornements, Lettres, Lune, planètes, Voie lactée, palette d'une photo ; gabarits d'origine identiques au pixel près. |
| `compare.py` | Comparer avant / après | Critères du § 4.2 : bouton absent sans changement comparable, nommé d'après le changement, accessible depuis tous les onglets, maintenu à la souris, au toucher et au clavier, état courant rétabli exactement, rien d'enregistré, titre et cadrage ni comparés ni effaçant la comparaison. |
| `deps.py` | Réglages dépendants | Inventaire du § 6.1 : masquage, notes, bascule annulable, notes lisibles (4,5:1). |
| `saves.py`, `illustore.py` | Sauvegarde | Mes affiches : aller-retour exact de l'état, annulation, persistance, Ctrl + S, fichiers, fusion sans doublon, fichiers piégés, navigateur plein ; illustrations : IndexedDB, rechargement, image manquante, réimport, fichiers version 2, nettoyage. |
| `maptext.py` | Textes et style communs aux trois types (#71) | Polices dans l'onglet Textes, Vintage parmi les polices du titre ; Style en Illustration (ambiances, thème, papier, dorure) ; mode Carte : rendu par défaut inchangé, Vintage, couleurs, ombre, contour appliqués au gabarit, « Auto » suivant le thème ; titre et lignes du bas sortis du gabarit (9 positions, glisser, Origine), aperçu = export ; gabarit Lettres ; migration d'un état ancien. |
| `textdeco.py` | Zones et présentations des textes (#86) | Rendu par défaut inchangé ; état validé (présentation, zone) ; Carte + illustration : titre sur la carte (Haut / bas), aperçu = export, halo couleur papier, zone de prise et glisser relatifs à la zone, prompt sans zone de titre ; cartouche (plaque papier, encre ≥ 4,5:1), bandeau, ruban, cachet, vertical, arc autour du médaillon (au-dessus, au-dessous, fixe, sans alerte) ; présentations proposées selon le contexte ; Vignette : bloc posé sur la carte ; mises en page prêtes ; trait des plaques (un seul trait par défaut, double, épaisseur, couleur, tirets, aucun) ; ordre des lignes (Illustration, cartouche du gabarit Cadre, focus, note Souvenir, Annuler) ; mode Carte : bloc sorti du gabarit, arc au gabarit Médaillon, rien pour le titre de Lettres ; Illustration : ruban ; aucune erreur de page. |
| `textstab.py` | Organisation de l'onglet Textes (#88) | Ordre des parties ; réglages avancés regroupés ; une carte par bloc ; mobile : champ du titre visible sans défilement ; Vintage parmi les duos (coché, police du texte gardée, quitté par un autre duo, Auto en Illustration) ; Plus de réglages fermé par défaut, non ouvert par un duo, ouvert d'office par une police hors duo ou une taille de ligne, refermable, compte ; relecture « Voir » ; aucun identifiant perdu. |
| `textfoot.py` | Gabarits du bas, plaques, loupe (#90) | Classique inchangé ; Ligne unique, Souvenir, Carnet, Colonnes (positions des lignes), aperçu = export ; état validé ; Carte : bloc sorti du gabarit ; Vignette : note et bloc posé sur la carte ; ruban retiré, état ancien en Capsule ; étiquette et filets pour le bas ; éloignement du trait ; fond des plaques (couleur, opacité, encre lisible, lien depuis la mise en page, état borné) ; loupe : molette, rendu net ≤ export, déplacement borné, clic sans sortie une fois agrandie, touches 0 et +, Ajuster à l'écran, double clic, Revenir aux réglages, état inchangé, sortie au clic hors zoom. |
| `illus.py`, `illusmix.py`, `illustext.py`, `illuspaste.py` | Affiches illustrées | Onglets par mode, aucune requête en mode Illustration ; prompt ; import (refus GIF, fichier endommagé) ; qualité ; cadrage, retouches, titre Vintage ; 5 compositions ; harmonisation ; gestes ; déplacement des textes (« Auto » identique au rendu d'avant, lettre par lettre) ; collage depuis le presse-papiers simulé ; exports et export bloqué sans image. |
| `parity.py` | Parité des trois types d'affiche (#77) | Dédicace sur deux lignes, taille des coordonnées et légende en modes illustrés ; ambiance limitée au type ; orientation rendue après « Côte à côte » ; titre Auto expliqué ; Lieu en Illustration ; contour et marge en Carte + illustration ; couleurs d'après l'illustration ; repère « Auto » ; calque cadré (boutons flottants, verrou mobile). |
| `mobile.py`, `ux.py`, `flow.py`, `welcome.py` | Interface | Panneau coulissant (au moins 180 px de réglages à mi-hauteur sur 390 × 664), Lecture et Modification, affiche seule, paysage en deux colonnes, A− / A+ ; onglets ARIA, « Étape suivante », sections repliées puis ouvertes d'office, annuler / rétablir, calendrier, « Ma position », recherche unique ; type d'affiche épinglé et parcours par type, Essentiel en ≈ 2 écrans à 360 px ; une seule fenêtre au premier lancement, proposition d'ambiance non bloquante. |
| `a11y.py`, `contrast.py` | Accessibilité | Fenêtres modales (focus placé, retenu, rendu ; Échap), vignettes au clavier, `aria-pressed`, cibles de 44 px, champs nommés ; contrastes du § 6.5, états inactifs compris. |
| `consent.py`, `attribution.py` | RGPD, licences | Aucune requête tierce avant l'accord ; demande modale ; action en attente exécutée après accord ; retrait ; « Travailler hors ligne » sans requête ; mention minimale toujours inscrite, complète par défaut, légende sous l'aperçu. |
| `reset.py` | Réinitialisation | Un appui demande confirmation sans rien modifier ; deux appuis rétablissent l'état et l'affiche par défaut ; accord conservé ; résultat persisté. |
| `gestures.py` | Lecture et Modification | Lecture par défaut (mobile et ordinateur : ni glisser, ni molette), verrou sur toute l'affiche, invitation aux deux premières utilisations, Modifier / Terminer ; choix par type d'affiche, de départ par l'onglet ou la zone touchée, « Textes » jamais d'office et interrupteur, « Repère » ; illustration : glisser, pincer (30 à 300 %), molette, double toucher, décalage borné, contour de la zone de la composition (Haut / bas). |
| `changes.py` | Relecture et barre d'actions | État par défaut : aucune pastille, liste vide ; réglages modifiés : pastilles sur les bons onglets (description accessible), compte des sections repliables, liste par partie ; « Réinitialiser » ne rétablit que sa partie, « Annuler » la défait ; « Voir » ouvre l'onglet et la section ; parties hors du type d'affiche ignorées ; bouton principal « Suivant : … » puis « Exporter » ; voyant d'état ; version affichée en `file://`. |
| `security.py`, `csp.py` | Sécurité | Lien forgé (types faux, valeurs hors bornes, champs inconnus) : valeurs remplacées, rien d'invalide enregistré ; lien piégé (> 512 Ko décompressé) refusé ; `window.__cms` seulement avec `?test` ; aucune violation de la CSP en `file://` et en HTTP, aucun style ni script en ligne. |
| `mesures.py` | Mesures de performance | Ouverture, réglage, geste sur la carte et export 10 × 15 mesurés ; affichés avec leur budget dans Lieu › Avancé ; texte à copier (version, appareil, écran, mesures) ; rien envoyé sur le réseau (#101). |
| `storage.py` | Stockage séparé | Données de la version classique (`cityMapStudio.*`, base `cityMapStudio`) ni lues, ni modifiées, ni supprimées, même après enregistrement d'une affiche, import d'une illustration et réinitialisation ; données de cette version sous `cms3.*` et dans la base `cms3` (#100). |
| `pwa.py` | Déploiement | Servi sous `/city-map-studio/` sans ressource manquante ; manifeste et icônes ; service worker sans ressource tierce, liste `APP` complète ; cache propre à son dossier, celui d'une autre copie conservé ; cache HTTP contourné ; mise à jour proposée par un bandeau, un seul rechargement, état conservé ; démarrage hors ligne ; `VERSION` changée quand `sw.js` ou un fichier de `APP` change (CI). |
| `unit.py` | Fonctions pures (Node) | Socle `CMS`, Mercator, `zoomFactor`, `dms`, `exportSpec`, `normState`, `CMS.geocoder.sanitize` ; `CMS.illus` : qualité, placement, retouches, prompt, pistes, proportions ; `CMS.route` : prompt d'itinéraire (FR / EN, réglages), `extractGpx`, contrôle de vraisemblance, `routePrompt` et `wpts` dans `normState` ; `CMS.wiki` : classement sur une réponse réelle autour de Blois (`tests/wiki_blois.json`), validation, requête limitée aux coordonnées. |
| `wiki.py` | Pistes Wikipédia (#46) | Option désactivée par défaut ; sans accord : aucune requête (option refusée si l'accord général l'est) ; Blois : château et cathédrale en tête ; requête limitée aux coordonnées et au rayon ; cache ; service muet : message en moins de 11 s, interface utilisable ; hors ligne : bouton grisé, pistes de la carte disponibles. |
| `routeai.py` | Itinéraire préparé avec une IA (#85) | Prompt : lieux (noms, coordonnées), type, emprise, format, mis à jour à chaque réglage, anglais ; réponse d'IA collée telle quelle importée (étapes nommées), texte sans GPX refusé sans toucher à l'affiche, « Coller le GPX » (presse-papiers simulé), Annuler ; tracé à 50 km et tracé rectiligne signalés, « Pointillés » ; aucun appel réseau, `connect-src` sans hôte pour l'itinéraire. |
| `globals.py` | Architecture | Aucun nom global déclaré deux fois ; nombre de déclarations globales ≤ `tests/globals.max`. |

Outils hors suite : `layouts.py` (captures des 11 gabarits, contrôle visuel) et `make_og.py` (régénère `icons/og-image.jpg` à partir du rendu actuel).

### 9.3. Validations sur appareil réel

Validées sur l'URL GitHub Pages :

| Élément | Référence |
| :--- | :--- |
| MapLibre avec les vraies tuiles OpenFreeMap (aperçu, déplacement et zoom, export, rendu Souvenir) | [#5](https://github.com/thiryyan/city-map-studio/issues/5) |
| Diagnostic réel (MapLibre, OpenFreeMap, Nominatim), sur mobile | [#4](https://github.com/thiryyan/city-map-studio/issues/4) |
| Téléchargement sur iOS Safari et Chrome Android (bouton, partage natif, appui long, 2480 × 3508 et 300 DPI conservés) | [#7](https://github.com/thiryyan/city-map-studio/issues/7) |

Restent à valider (⏳), faute de pouvoir les automatiser :

| Domaine | Validation à mener |
| :--- | :--- |
| Rendu réel | Deux lieux, aperçu au mur, pistes artistiques, Carte + illustration et pertinence des pistes avec les vraies tuiles OpenFreeMap ; mêmes mesures de fluidité sur un téléphone réel et sur un vrai extrait OSM. |
| Impression | Export A3 et 50 × 70 sur un iPhone réel ; PDF chez un imprimeur ; dorure et riso imprimés ; marges réelles d'une imprimante de bureau ; A4 d'une illustration. |
| Gestes tactiles (iOS Safari, Chrome Android) | Panneau coulissant, Lecture et Modification (« Que déplacer ? », pincement de l'illustration), appui long de la comparaison, glisser des textes, du médaillon et de la vignette, bouton retour de l'affiche seule, collage et glisser-déposer d'une illustration (demande d'autorisation). |
| Fonctions natives | Géolocalisation et calendrier natif sur iOS et Android ; diagnostic réel sur ordinateur. |
| Stockage | Quota de Safari iOS (Mes affiches, téléchargement des fichiers) ; effacement réel des illustrations par Safari après 7 jours ; quota en navigation privée. |
| Lecteurs d'écran | VoiceOver (iOS) et TalkBack (Android). |
| Application installée | Installation, hors ligne et mise à jour après un vrai déploiement, Chrome Android et ordinateur, iOS ([#65](https://github.com/thiryyan/city-map-studio/issues/65)). |
| Prompt | À éprouver sur ChatGPT et Gemini avec d'autres villes. |
| Aperçu des liens | `https://thiryyan.github.io/city-map-studio/icons/og-image.jpg` suppose la publication à cette adresse ; à adapter en cas de domaine personnalisé. |
