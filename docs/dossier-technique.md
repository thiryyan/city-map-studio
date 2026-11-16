# City Map Studio — Dossier technique de référence

> **Objet** : atelier web de création d'affiches cartographiques souvenir. L'application trace de façon minimaliste les rues et les cours d'eau d'une ville, marque d'un repère discret le lieu exact d'une rencontre, et exporte une affiche d'impression A4 à 300 DPI.

---

## 1. Exigences

| # | Sujet | Exigence |
| :--- | :--- | :--- |
| E1 | Licence | **100 % open source** : code sous licence **MIT** (© Contributeurs de City Map Studio) ; librairies, polices, données et services ouverts, sans clé API ni service propriétaire (ni ArcGIS, ni Mapbox, ni Google Maps, ni Google Fonts). |
| E2 | Navigateurs | Chromium ≥ 110, Safari ≥ 16, Firefox ≥ 115. |
| E3 | Rendu | L'export est identique à l'aperçu ; le gabarit et le thème **Souvenir** (par défaut) définissent le rendu de référence (§ 4.1 et 4.2). |
| E4 | Moteurs cartographiques | **Vectoriel GPU** (MapLibre GL + OpenFreeMap, par défaut), **Overpass** (Canvas 2D, mode artistique) et **Fichier** (import hors ligne). |
| E5 | Gabarits | **Souvenir** (par défaut), **Cadre classique**, **Fondu moderne**, **Médaillon**. |
| E6 | Coordonnées | Affichage au choix en décimal (par défaut) ou en DMS. |
| E7 | Libellés | Aucun libellé sur la carte : le tracé est purement graphique. |
| E8 | Ville au lancement | Blois et la Loire. |
| E9 | Export | PNG A4 300 DPI (2480 × 3508 px). |
| E10 | Livraison | Un seul fichier `index.html` (HTML, CSS et JavaScript natifs), **sans étape de build**. MapLibre et les polices sont fournis dans `lib/`. |
| E11 | Écrans | Mobile en priorité, ordinateur en second. Interface en français. |
| E12 | Hébergement | **GitHub Pages** (dépôt public, `index.html` à la racine, branche `main`). Les plateformes de déploiement d'applications générées automatiquement sont exclues : la politique d'usage d'Overpass demande de ne pas les utiliser. |
| E13 | Données | Attribution « © contributeurs OpenStreetMap » (ODbL), complétée de « OpenFreeMap © OpenMapTiles » (schéma CC-BY 4.0) avec le moteur Vectoriel GPU. Active par défaut, désactivable sous la responsabilité de l'utilisateur. |
| E14 | Vie privée | Aucune ressource de présentation (librairie, polices, styles) n'est chargée depuis un tiers : l'adresse IP du visiteur n'est transmise qu'aux services de données cartographiques nécessaires au fonctionnement, et **seulement après son accord explicite** (§ 2.4). Les polices sont auto-hébergées, conformément à la jurisprudence RGPD sur Google Fonts (LG München, 20/01/2022, 3 O 17493/20). |

---

## 2. Architecture

### 2.1. Briques techniques

| Brique | Choix | Licence |
| :--- | :--- | :--- |
| Langage | HTML5, CSS3, JavaScript ES2020, sans framework | — |
| Moteur vectoriel GPU | MapLibre GL JS **4.7.1**, chargé depuis `lib/`, puis en secours depuis unpkg, jsDelivr et cdnjs (version figée) | BSD-3-Clause |
| Tuiles vectorielles | OpenFreeMap (`https://tiles.openfreemap.org/planet`, schéma OpenMapTiles, sans clé) | Données ODbL, schéma CC-BY |
| Données brutes | Overpass API ; ordre d'essai : `overpass.private.coffee` → `overpass.kumi.systems` → `maps.mail.ru` → `overpass-api.de` (en dernier, cf. § 2.4) | AGPL / ODbL |
| Géocodage | Nominatim (`nominatim.openstreetmap.org`) | GPL / ODbL |
| Polices | Playfair Display, Montserrat, Space Mono, Cormorant Garamond, Josefin Sans, **auto-hébergées** dans `lib/fonts/` (woff2, sous-ensembles latin et latin-ext, `OFL.txt` par famille) | SIL OFL 1.1 |
| Rendu de l'affiche | Canvas 2D natif | — |

### 2.2. Moteurs cartographiques

| Moteur | Source | Atouts | Limites |
| :--- | :--- | :--- | :--- |
| **1. Vectoriel GPU (défaut)** | MapLibre + OpenFreeMap | Instantané, monde entier, mers et côtes correctes, fluide sur mobile. | Généralisation des tuiles : certaines petites voies disparaissent aux zooms faibles. |
| **2. Overpass (artistique)** | Overpass → Canvas 2D | Géométrie OSM brute au niveau de détail maximal, contrôle total du tracé. | Lent pour les grandes zones (zoom minimal 11,5) ; le trait de côte marin n'est pas traité (villes continentales et fluviales). |
| **3. Fichier (hors ligne)** | Fichier importé : JSON Overpass, `.osm` XML ou GeoJSON → Canvas 2D | Aucun accès réseau requis ; même rendu et même export que le moteur 2. | L'utilisateur obtient le fichier lui-même (§ 7.3). |

**Chaîne de secours** : MapLibre est chargé depuis `lib/`, puis depuis 3 CDN (12 s par source). Les tuiles sont surveillées pendant 15 s. Overpass est essayé sur 4 miroirs. En cas d'échec, un bandeau « Diagnostiquer » oriente vers le moteur qui fonctionne, et en dernier recours vers le moteur Fichier.

### 2.3. Rendu en trois couches (WYSIWYG)

Une fonction unique, `drawPoster(ctx, W, H, pass, mapFn)`, dessine l'affiche à n'importe quelle résolution. L'aperçu et l'export partagent donc le même code :

1. **Couche basse** (canvas) : le papier.
2. **Couche carte** : un conteneur placé exactement sur le cadre de la carte, qui accueille MapLibre ou le canvas Overpass. Il est découpé en cercle pour le gabarit Médaillon.
3. **Couche haute** (canvas, `pointer-events: none`) : fondu, filets, repère, typographie et attribution.

À l'export, les trois couches sont recomposées dans un canvas unique de 2480 × 3508 px.

### 2.4. Réseau et politiques d'usage

* **Accord préalable (RGPD)** : au premier lancement, **aucune requête n'est émise vers un service tiers**. Un panneau « Afficher la carte ? » explique que l'affichage des tuiles transmet l'adresse IP à OpenFreeMap, et que Nominatim et Overpass la reçoivent aussi, seulement à la demande. Il propose deux choix :
  * **Afficher la carte** : l'accord est mémorisé dans `localStorage` (clé `cityMapStudio.consent`), la carte s'affiche, et l'action qui a déclenché la demande (recherche, Overpass, diagnostic, export) s'exécute ;
  * **Travailler hors ligne** : passage au moteur Fichier, sans aucune requête.

  Tant que l'accord n'est pas donné, chaque point d'accès au réseau (`initMaplibre`, `fetchOverpass`, `search`, `runDiagnostics`, `exportPoster` avec le moteur Vectoriel GPU, CDN de secours de MapLibre) affiche la demande au lieu d'appeler le service. L'onglet Lieu indique l'état de l'accord et permet de le retirer, ce qui recharge la page dans l'état initial.
* **Overpass**
  * Requêtes uniquement à la demande, **une seule à la fois**. Après un déplacement hors de la zone chargée, un bandeau propose « Actualiser les vecteurs ». La zone demandée est élargie de 40 % pour absorber les petits déplacements.
  * `[timeout:25]` côté serveur ; `AbortController` à **30 s** côté client, puis passage au miroir suivant. Une erreur HTTP 5xx ou un délai dépassé fait aussi passer au miroir suivant. Les délais sont regroupés dans `OP_TIMEOUT` (`fetch` : 30 s ; `diag` : 20 s pour la sonde du diagnostic).
  * **Message d'échec** : quand aucun miroir ne répond, chaque échec est enregistré (HTTP, délai dépassé, ou absence de réponse lisible). Une passerelle en 502/504 répond souvent sans en-tête CORS : le navigateur ne voit alors qu'un `TypeError` (« Failed to fetch »), indiscernable d'une coupure réseau. Si au moins un miroir a répondu en HTTP ou a dépassé le délai, la connexion fonctionne : la barre d'état et la notification indiquent « serveurs en panne ou surchargés » et non « accès réseau bloqué ». Le détail par miroir figure dans l'infobulle de la barre d'état et dans la notification. Ces échecs (5xx, délai) ne suspendent pas le miroir.
  * **Suspension après 406 ou 429** : overpass-api.de renvoie HTTP 406 aux clients qu'il ne juge pas légitimes (User-Agent, Referer, en-tête Accept). Une page ouverte en `file://` n'envoie pas de Referer, d'où le refus. Les clients qui insistent après une erreur 406 ou 429 sont bannis plus vite. Un miroir qui répond 406 est donc suspendu **24 h**, et un miroir qui répond 429 **1 h**. Pour un 429, l'application retient la durée de `Retry-After` si elle est plus longue, mais elle ne peut lire cet en-tête que si le serveur l'autorise par CORS. La suspension est conservée dans `localStorage` (clé `cityMapStudio.opBlocked`), y compris après un rechargement, et le diagnostic la respecte. Si tous les miroirs sont suspendus, aucune requête n'est émise : l'application indique l'heure de reprise et oriente vers le moteur Fichier.
  * overpass-api.de est essayé en dernier. Le lien « requête Overpass » du moteur Fichier vise le premier miroir disponible.
  * Un navigateur ne peut pas modifier son User-Agent : seul un hébergement HTTPS (GitHub Pages) fournit un Referer et une Origin valides.
* **Nominatim** : appel uniquement à la validation de la recherche (jamais à la frappe), 5 résultats, `accept-language=fr`. Les résultats sont insérés via `textContent` (aucune injection HTML).
* **Persistance** : l'état de l'atelier est sauvegardé dans `localStorage` (clé `cityMapStudio.v2`, sous `try/catch`).

### 2.5. Villes préréglées

Blois (Loire) · Paris (Seine) · Venise (Lagune) · New York (Manhattan) · Bordeaux (Garonne) · Kyoto (Kamo) · Lyon (Rhône & Saône).

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

### 3.2. Requête Overpass QL

La zone `(S,W,N,E)` est calculée par l'application. `out geom qt` inclut les coordonnées dans chaque `way` et chaque membre de `relation`, ce qui évite de reconstruire la géométrie à partir des nœuds.

```overpassql
[out:json][timeout:25];
(
  way["natural"="water"](S,W,N,E);
  relation["natural"="water"](S,W,N,E);
  way["waterway"="riverbank"](S,W,N,E);
  relation["waterway"="riverbank"](S,W,N,E);
  way["waterway"~"^(river|canal|stream)$"](S,W,N,E);
  way["leisure"~"^(park|garden)$"](S,W,N,E);
  relation["leisure"="park"](S,W,N,E);
  way["landuse"~"^(grass|forest|meadow|recreation_ground)$"](S,W,N,E);
  way["natural"="wood"](S,W,N,E);
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"](S,W,N,E);
  way["highway"~"^(unclassified|residential|living_street|pedestrian|service|footway|path|cycleway|steps|track)$"](S,W,N,E);
  way["railway"="rail"](S,W,N,E);   // si le calque Voies ferrées est actif
  way["building"](S,W,N,E);         // si le calque Bâtiments est actif
);
out geom qt;
```

`waterway=riverbank` est un étiquetage obsolète, conservé pour les données anciennes ; `natural=water` reste la source principale. Les anneaux des relations multipolygones sont **assemblés** par chaînage des segments à extrémités communes, puis remplis en `evenodd` (îles).

### 3.3. Conversion décimal → DMS

$d = \lfloor |D| \rfloor,\; m = \lfloor (|D|-d)\cdot 60 \rfloor,\; s = \text{round}\big(((|D|-d)\cdot 60 - m)\cdot 60,\ 1\big)$.
Retenue : si $s = 60{,}0$, alors $s \leftarrow 0$ et $m \leftarrow m+1$ ; si $m = 60$, alors $m \leftarrow 0$ et $d \leftarrow d+1$.
Suffixes N/S et E/W. Exemple pour Blois : 47° 35′ 10.0″ N, 1° 20′ 09.2″ E.
Le format **décimal** (par défaut) affiche 7 décimales : `47.5861000, 1.3359000`.

### 3.4. Saisie des coordonnées du repère

`parseCoords` accepte :

| Format | Exemples |
| :--- | :--- |
| Décimal à point ou à virgule | `47.5861, 1.3359` · `40.7484,-73.9857` · `47,5861 ; 1,3359` |
| DMS ou DM avec hémisphère N / S / E / W / O (préfixe ou suffixe) | `47° 35′ 10″ N, 1° 20′ 09″ E` · `47°35'10"N 1°20'9.2"E` · `N 47 35.1667 E 1 20.1533` |
| Lien de carte | Google Maps (`…/@lat,lon,15z`), OpenStreetMap (`?mlat=…&mlon=…`, `#map=z/lat/lon`) |

Sont refusés, avec un message explicite : texte sans nombre, nombre de valeurs incohérent, hémisphère manquant ou dupliqué, minutes ou secondes ≥ 60, latitude au-delà de ±85° ou longitude au-delà de ±180°. Si le point sort du cadre, la carte se recentre dessus.

### 3.5. Hiérarchie des tracés

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

Chaque variable reste modifiable individuellement. Les actions rapides **« Touche d'or »** appliquent `#C5A059` à l'eau, aux rues principales, au repère ou aux filets.

### 4.3. Repère (5 styles vectoriels)

Cœur géométrique facetté · Point subtil à halo · Cœur lisse (plein ou contour) · Anneau cible · Épingle.
Réglages : taille de 10 à 300 % (100 % = 5,5 % de la largeur de l'affiche), couleur, opacité, plein ou contour.

Le repère (point de rencontre) est indépendant du centre de la carte. Il se place :
* au toucher ou au clic, en mode « Placer le repère » ;
* depuis un résultat de recherche ;
* au centre de la carte (« Au centre ») ;
* par **saisie de ses coordonnées** dans l'onglet Lieu (§ 3.4).

### 4.4. Typographie (6 champs, 5 familles)

Champs : **Titre** (« Blois ») · **Sous-titre** (« Val de Loire • France ») · **Coordonnées** (automatiques ou saisies) · **Dédicace** (« Là où tout a commencé ») · **Noms** (« Prénom & Prénom ») · **Date** (« Le 14 juillet 2023 »).
Familles :

| Famille | Police | Esprit | Réglages |
| :--- | :--- | :--- | :--- |
| **Serif** (défaut) | Playfair Display | Didone à fort contraste, élégante et lisible | — |
| **Sans** | Montserrat | Linéale géométrique, contemporaine | — |
| **Mono** | Space Mono | Machine à écrire, technique | — |
| **Garamond** | Cormorant Garamond | Garalde classique, italique calligraphique, chiffres elzéviriens ; s'accorde avec les thèmes Crème & Encre et Sépia vintage | Graisse 500 et corps × 1,12, pour compenser le petit œil et le trait fin à l'impression |
| **Art déco** | Josefin Sans | Géométrique des années 1920, capitales élancées, esprit affiche de voyage ; s'accorde avec Prestige Onyx & Or et Nuit boréale | Corps × 1,04 |

Le coefficient de corps (`scale`) et la graisse par défaut (`weight`) sont définis par famille dans `FONTS`.
Chaque ligne est **optionnelle** : une case à cocher devant chaque champ l'affiche ou la masque, sans effacer le texte saisi (état `show`, persisté). Dans les gabarits à cartouche (Cadre, Fondu, Médaillon), les lignes masquées ou vides sont retirées et les suivantes remontent ; le gabarit Fondu garde le bloc calé en bas. Dans le gabarit Souvenir, une ligne d'en-tête seule occupe toute la largeur, et les noms sans dédicace s'affichent seuls, sans filet.
Les textes trop longs sont réduits automatiquement pour tenir dans leur zone.

**Taille des textes.** Chaque ligne a son curseur de taille (60 à 150 %, état `textScale`), complété d'un curseur global « Tous les textes » (70 à 140 %, `textScaleAll`) ; les deux se multiplient (`tScale(k)`). Le lien « Tailles par défaut » les remet à 100 %, comme « Réinitialiser ». À 100 %, le rendu est identique à celui d'avant les curseurs.
* **Gabarits à cartouche** : quand une ligne grandit, les interlignes suivent (0,8 × l'écart de corps de la ligne, 0,25 × celui de la précédente). Si le bloc dépasse la hauteur disponible, il est réduit en entier pour tenir. Le gabarit Fondu garde le bloc calé en bas et le fait grandir vers le haut, sur la zone en fondu.
* **Gabarit Souvenir** : le titre et la date de l'en-tête gardent chacun leur taille, sur la même ligne de base (`drawRun`). En pied de page, si la dédicace et les noms dépassent la largeur, ils sont réduits du même facteur, ce qui garde le rapport entre les tailles choisies. Avant, la dédicace était plafonnée à 72 % de la largeur et les noms prenaient le reste.
* **Réduction signalée** : pendant le rendu de l'aperçu, `drawText`, `drawRun` et `drawCartouche` relèvent les réductions automatiques (`noteFit`). Au-delà de 10 %, l'onglet Textes l'indique (« ↘ Réduit pour tenir dans l'affiche : dédicace (67 %) ») et le curseur de la ligne passe en orange.

### 4.5. Réinitialisation

Le lien **« Réinitialiser »**, dans la barre du bas (visible depuis tous les onglets), rétablit tous les réglages par défaut : lieu et cadrage (Blois), gabarit, thème et couleurs, repère, police, textes et lignes affichées, marge, épaisseurs et calques. Un premier appui affiche « Confirmer ? » pendant 4 s ; un second appui réinitialise (`resetAll`). La confirmation est intégrée à la page, car `confirm()` est bloqué dans les aperçus intégrés.
Sont conservés : l'accord aux services tiers, les suspensions de miroirs Overpass et les données déjà chargées ou importées.

---

## 5. Export haute définition

* **Format** : 2480 × 3508 px (A4 à 300 DPI ; 212 DPI en A3 par mise à l'échelle chez l'imprimeur). L'export est un **recalcul intégral** à pleine résolution, jamais un agrandissement de l'aperçu.
* **Étapes** :
  1. Attente du chargement des polices (`document.fonts.load`), puis contrôle par `document.fonts.check` : si une variante manque, l'export se fait avec une police de secours et le signale dans la fenêtre de résultat.
  2. Création d'un canvas 2480 × 3508 et dessin de la couche basse.
  3. Carte :
     * **MapLibre** : instance hors écran de 800 px CSS de large, `pixelRatio` = largeur du cadre / 800 (environ 2,7), `preserveDrawingBuffer`, `maxCanvasSize` 8192, attente de l'événement `idle` (45 s au plus), puis `drawImage` dans le cadre ;
     * **Overpass / Fichier** : re-projection directe des géométries dans le cadre, à pleine résolution.
  4. Couche haute (repère, filets, textes) à la même échelle.
  5. `toBlob('image/png')`, injection d'un chunk **`pHYs`** (11 811 px/m = 300 DPI) pour que les logiciels ouvrent le fichier à la bonne résolution, puis téléchargement de `affiche-carte-[ville]-300dpi.png`. Sur mobile, le partage natif (`navigator.share`) est proposé quand il est disponible ; si le téléchargement est bloqué, l'image reste enregistrable par appui long.
* **Mémoire** : 8,7 Mpx, sous la limite de 16,7 Mpx de Safari iOS ; le canvas WebGL (environ 2160 × 2500 px) reste sous la limite de 4096 px.

---

## 6. Interface (mobile en priorité)

* **Mobile portrait** : aperçu de l'affiche en haut, **panneau coulissant** en bas avec les onglets (**Lieu · Style · Repère · Textes**) et la barre d'export. Trois crans :
  * **réduit** : onglets et export seuls, l'affiche occupe presque tout l'écran (cadrage, placement du repère) ;
  * **mi-hauteur** (55 %, par défaut) ;
  * **déplié** (84 %) : réglages en grand, l'affiche réduite à une vignette.

  On glisse la poignée (aimantation au cran le plus proche, dans le sens du geste), ou on la touche pour passer d'un cran à l'autre (flèches haut et bas au clavier). Toucher un onglet depuis le cran réduit ouvre la mi-hauteur ; toucher l'onglet actif bascule entre mi-hauteur et déplié. Le panneau se déplie pendant la saisie d'un texte, puis reprend sa place.
* **Carte verrouillée et mode « Cadrer » (mobile portrait)** : un glissement sur l'affiche ne la décadre pas. Un toucher sur la carte, ou le bouton Cadrer, ouvre le mode Cadrer : panneau réduit, carte déverrouillée (glisser, pincer), barre « Terminer ». « Placer le repère » réduit aussi le panneau et le rétablit une fois le repère posé.
* **Boutons flottants** (cadrer, zoom, repère, centrer) : à droite ou en bas de l'aperçu, selon ce qui laisse l'affiche la plus grande ; masqués quand l'aperçu n'est qu'une vignette.
* **Deux colonnes** (ordinateur ≥ 900 px, tablette ou téléphone en paysage ≥ 560 px) : panneau à gauche (400 px au plus, 46 % de la largeur), table lumineuse à droite. Pas de poignée ni de verrou : la carte se manipule directement (glisser, pincer, molette).
* **Barre du bas** : **Annuler / Rétablir**, état courant (texte complet au survol), lien « Réinitialiser » (§ 4.5), réglage **A− / A+** et bouton « Exporter ».
* **Parcours guidé** : les onglets suivent l'ordre de création **Lieu → Repère → Textes → Style**. Chaque onglet se termine par un bouton « Étape suivante », et le dernier par « Tout est prêt : exporter l'affiche ».
* **Onglet Lieu** : recherche, « Ma position actuelle », villes, lieu de rencontre et cadrage. Le moteur cartographique, l'import de fichier, le diagnostic et l'accord aux services tiers sont dans la section repliable **« Avancé »**. Son état est mémorisé (`cityMapStudio.advOpen`), et elle s'ouvre d'office quand elle devient utile : moteur Overpass ou Fichier, « Travailler hors ligne », diagnostic lancé depuis le bandeau. Les calques sont dans l'onglet Style, et les 12 couleurs dans une section repliable « Personnaliser les couleurs ».
* **Recherche d'adresse** : uniquement à la validation, une seule à la fois (bouton inactif pendant la requête). Il n'y a pas d'autocomplétion, que la politique d'usage de Nominatim interdit. Chaque résultat affiche le nom en tête et l'adresse en dessous.
* **Ma position actuelle** : géolocalisation de l'appareil (`navigator.geolocation`, permission demandée par le navigateur, page sécurisée requise). Elle place le repère et y centre la carte, à un zoom d'au moins 15.
* **Date** : un bouton calendrier, couvert par un champ `date` natif transparent pour fonctionner aussi sur iOS, remplit le champ au format de l'affiche (« Le 1er juillet 2023 ») et réaffiche la ligne si elle était masquée. Le texte reste modifiable, et le calendrier s'ouvre sur la date déjà saisie quand elle est reconnue.
* **Polices** : cartes à défilement horizontal, chacune montrant le titre saisi dans sa police.
* **Annuler / Rétablir** : jusqu'à 50 étapes, regroupées comme l'enregistrement (300 ms de calme), avec les boutons ou Ctrl/Cmd+Z et Ctrl/Cmd+Maj+Z (ou Ctrl+Y) hors des champs de texte, qui gardent leur annulation native. « Réinitialiser » peut être annulé. Le moteur cartographique n'entre pas dans l'historique, et les petits recentrages de la carte qui suivent un retour arrière, une réinitialisation ou un changement de moteur sont ignorés. L'historique n'est pas conservé après un rechargement.
* **Accessibilité** : onglets selon le motif ARIA (`tablist`, `tab`, `tabpanel`, `aria-selected`, flèches, Début, Fin) ; segments en `aria-pressed` et polices en `radio` ; focus clavier visible ; cibles tactiles d'au moins 44 px (36 px dans la barre du bas, poignée de 28 px sur toute la largeur) ; transitions courtes, coupées si `prefers-reduced-motion`.
* **Taille du texte de l'interface** : les tailles sont en `rem`. L'interface suit le réglage du système (taille de police d'Android ; Dynamic Type d'iOS via `font: -apple-system-body`). A− / A+ propose 87,5 à 137,5 %. Ce réglage est mémorisé dans l'appareil (`cityMapStudio.uiScale`), hors de l'état de l'affiche, et « Réinitialiser » ne le modifie pas. Les champs de saisie font au moins 16 px pour éviter le zoom automatique d'iOS.
* **Superpositions** : la demande d'accord aux services tiers est un panneau modal en bas d'écran, avec un texte court et un repli « En savoir plus ». Le bandeau d'action (« Zone modifiée → Actualiser les vecteurs », « Carte indisponible ») s'affiche en tête du panneau, plus sur l'affiche. Les bulles d'information apparaissent au-dessus du panneau, sans masquer les réglages.
* **États visibles** : moteur actif, chargement, attente d'accord et mode hors ligne (pastille orange), erreurs réseau en clair.

---

## 7. Contextes d'exécution et diagnostic

### 7.1. Contextes qui bloquent le réseau

Les trois services distants (tuiles OpenFreeMap, Overpass, Nominatim) et, en secours, les CDN de MapLibre, sont appelés depuis la page. Plusieurs contextes d'ouverture **bloquent tout accès réseau** :
* l'aperçu de fichier intégré à certaines applications (messageries, assistants, gestionnaires de fichiers), qui charge la page dans une iframe sandboxée avec une politique CSP restrictive et bloque souvent les téléchargements ;
* certaines visionneuses HTML des gestionnaires de fichiers Android (`content://`) ;
* un réseau d'entreprise ou un bloqueur qui filtre certains domaines ;
* un appareil hors ligne.

### 7.2. Contre-mesures

1. **Détection du contexte** au démarrage (iframe, protocole, `navigator.onLine`), avec un avertissement explicite dans l'onglet Lieu.
2. **MapLibre embarqué** dans `lib/`, avec repli sur 3 CDN (12 s par source).
3. **Surveillance des tuiles** : un échec réseau, ou l'absence de tuile au bout de 15 s, affiche « Carte indisponible → Diagnostiquer ».
4. **Diagnostic réseau en un clic** : teste la librairie, OpenFreeMap, chaque miroir Overpass (sauf ceux qui sont suspendus) et Nominatim, puis recommande un moteur. Si tous les miroirs Overpass échouent alors que d'autres services répondent, une seconde conclusion indique que la panne vient des serveurs Overpass (ou de leur suspension).
5. **Moteur Fichier**, qui fonctionne sans aucun accès réseau.
6. **Enregistrement de secours** de l'export par appui long sur l'image.

### 7.3. Obtenir un fichier pour le moteur Fichier

| Source | Format | Limite / point d'attention |
| :--- | :--- | :--- |
| Lien « requête Overpass » de l'application | JSON Overpass (`out geom`) | Zone cadrée + 15 % ; vise le premier miroir disponible. |
| overpass-turbo.eu (lien prérempli par l'application) | JSON brut ou GeoJSON | Exporter → « données brutes ». |
| openstreetmap.org/export | `.osm` (XML) | Refus « too many nodes » au-delà d'environ 50 000 nœuds : zone d'environ 1,5 km de côté au maximum en centre-ville. Le lien « Overpass API » de la même page vise overpass-api.de (risque de 406). |

### 7.4. Modes de déploiement

| Mode | Moteurs disponibles | Remarque |
| :--- | :--- | :--- |
| **GitHub Pages** (E12) | 1, 2, 3 | **Recommandé**, surtout sur mobile : URL HTTPS stable, Referer valide pour Overpass, téléchargements fiables. |
| Serveur local (`python3 -m http.server`) | 1, 2, 3 | Pour développer. |
| Fichier ouvert dans un navigateur (`file://`) | 1, 3 (2 partiel) | overpass-api.de répond 406 (pas de Referer). |
| Aperçu intégré d'une application ou visionneuse | 3 uniquement | Réseau et téléchargements bloqués. |
| Entièrement hors ligne | 3 (+ 1 si les tuiles sont autohébergées) | Une extraction **PMTiles** (Protomaps) peut être servie localement. |

---

## 8. Organisation du code

### 8.1. Arborescence

```
city-map-studio/
├── index.html              # application complète (HTML + CSS + JS, sans build)
├── lib/                    # dépendances embarquées
│   ├── maplibre-gl.js/.css # MapLibre GL JS 4.7.1 (licence BSD-3)
│   └── fonts/              # polices woff2 + fonts.css + OFL.txt par famille
├── .nojekyll               # GitHub Pages : fichiers servis tels quels
├── LICENSE                 # MIT (code de l'application) + rappel des licences tierces
├── README.md
├── CONTRIBUTING.md         # règles de développement et commandes
├── docs/
│   └── dossier-technique.md
└── tests/
    ├── fixture.py          # génère une ville synthétique (tests/overpass.json)
    ├── make_formats.py     # convertit la ville synthétique en .osm et .geojson
    ├── run.py              # moteur Overpass simulé, export PNG, DMS, assemblage des anneaux (mobile + ordinateur)
    ├── offline.py          # réseau coupé : diagnostic, import des 3 formats, iframe
    ├── layouts.py          # captures des gabarits Cadre / Fondu / Médaillon
    ├── maplibre.py         # MapLibre local + OpenFreeMap simulé (tuiles MVT générées), export hors écran
    ├── overpass_policy.py  # suspension des miroirs après 406 / 429
    ├── overpass_outage.py  # panne des miroirs (délai, 504, 502 sans CORS) : message et diagnostic
    ├── coords.py           # saisie des coordonnées du repère
    ├── texts.py            # lignes de texte optionnelles, dans les 4 gabarits
    ├── fonts.py            # polices auto-hébergées, file:// et HTTP, aucun appel tiers
    ├── consent.py          # accord préalable : aucune requête tierce sans accord
    └── reset.py            # réinitialisation des réglages par défaut
```

### 8.2. Sections de `index.html`

Le script est découpé en sections balisées `// ---------- Titre ----------`.

| Section | Fonctions clés | Rôle |
| :--- | :--- | :--- |
| Constantes | `THEMES`, `ROADS`, `HW_CLASS`, `OVERPASS`, `ML_CDNS`, `PRESETS` | Paramétrage. |
| État | `DEFAULT_STATE`, `loadState`, `saveState` | État unique `st`, persisté dans `localStorage`. |
| Accord préalable | `needConsent`, `giveConsent`, `declineConsent`, `withdrawConsent` | Aucun appel tiers avant l'accord de l'utilisateur. |
| Politique Overpass | `opSuspend`, `opBlockInfo`, `opAvailable` | Suspension des miroirs après 406 / 429. |
| Mathématiques | `merc`, `project`, `unproject`, `viewBounds`, `dms` | Web Mercator 512 px, zoom de référence pour un cadre de 800 px. |
| Gabarits | `geom` | Rectangle ou cercle de la carte selon le gabarit. |
| Rendu de l'affiche | `drawPoster`, `drawCartouche`, `drawMarker`, `drawText` | **Fonction unique pour l'aperçu et l'export** (passes `under` / `over` / `all`). |
| Moteur 2 | `buildQuery`, `normalizeElements`, `stitch`, `parseOverpass`, `drawVectors`, `fetchOverpass` | Données OSM → Canvas 2D. |
| Moteur 1 | `loadMaplibre`, `buildStyle`, `initMaplibre`, `renderMaplibreOffscreen`, `mlFail` | MapLibre + OpenFreeMap ; export hors écran. |
| Interface | `parseCoords`, `placeMarkerFromInput`, `setMarker`, `goTo`, `setEngine`, `askReset`, `resetAll` | Commandes de l'atelier. |
| Contexte et diagnostic | `ENV`, `showEnvWarning`, `runDiagnostics`, `netMsg` | Détection d'iframe ou de blocage réseau, tests des services. |
| Moteur 3 | `osmXmlToElements`, `geojsonToElements`, `importText`, `importFile` | Import de fichier, avec recadrage automatique. |
| Export | `exportPoster`, `withDpi`, `crc32` | PNG 2480 × 3508 px à 300 DPI. |
| Débogage | `window.__cms` | Accès à l'état et aux fonctions depuis la console et les tests. |

---

## 9. Tests et critères d'acceptation

### 9.1. Critères d'acceptation

| Test | Critère |
| :--- | :--- |
| Lancement | Blois centré, gabarit Souvenir, thème Souvenir, cœur rouge. |
| Rendu Souvenir | Terre gris clair, eau bleu-gris, axes noirs ; en-tête et pied conformes au gabarit Souvenir (§ 4.1). |
| WYSIWYG | Cadrage et position du repère identiques entre l'aperçu (mobile et ordinateur) et l'export. |
| Export | PNG 2480 × 3508, métadonnée 300 DPI, polices correctes, aucun flou. |
| DMS | 47,5861 → 47° 35′ 10.0″ N ; 1,99999 → 2° 00′ 00.0″ E (retenue). |
| Réinitialisation | Un appui demande confirmation sans rien modifier ; deux appuis rétablissent l'état et l'affiche par défaut, accord conservé, résultat persisté. |
| Accord préalable | Au premier lancement, aucune requête tierce ; demande modale ; « Travailler hors ligne » passe au moteur Fichier (pastille orange) ; recherche, Overpass et diagnostic redemandent l'accord, sans requête ; après accord, l'action en attente s'exécute et le choix est mémorisé ; retrait possible ; « Travailler hors ligne » passe au moteur Fichier sans requête. |
| Polices | Les 5 familles (normale et italique) se chargent depuis `lib/fonts/`, y compris hors ligne et en `file://` ; elles s'appliquent à l'aperçu et à l'export ; le choix est conservé ; aucune requête vers Google. |
| Lignes de texte | Chaque ligne se masque et se réaffiche dans les 4 gabarits, sans perte du texte ; export possible sans aucune ligne. |
| Taille des textes | Chaque curseur (par ligne et global) modifie l'affiche dans les 4 gabarits ; retour à 100 % = rendu d'origine ; réduction automatique signalée ; tailles persistées et remises à 100 % par « Réinitialiser » ; export 2480 × 3508. |
| Lisibilité et confort | Onglets dans l'ordre du parcours, rôles ARIA et navigation au clavier ; « Étape suivante » ; « Avancé » et couleurs repliés, « Avancé » rouvert d'office et mémorisé ; cibles tactiles ; annuler / rétablir (boutons, clavier, après réinitialisation, moteur exclu) ; calendrier (« 1er », lecture inverse) ; aperçu des polices ; « Ma position » ; recherche unique, sans requête pendant la frappe. |
| Mobile | iPhone 13 (390 × 664) : au moins 180 px de réglages à mi-hauteur ; poignée (toucher, glisser) ; dépliage à la saisie ; carte verrouillée hors du mode Cadrer ; placement du repère ; bulle au-dessus du panneau ; A− / A+ persistant, sans défilement horizontal ; paysage en deux colonnes ; ordinateur inchangé. |
| Saisie du repère | Formats du § 3.4 acceptés, saisies invalides refusées avec un message, recentrage si le point sort du cadre. |
| Résilience | MapLibre indisponible → bascule possible vers Overpass ou Fichier ; miroir Overpass en erreur 5xx ou hors délai → miroir suivant ; miroir en 406 / 429 → suspendu, jamais rappelé pendant la suspension. |
| Licence | Aucune dépendance propriétaire ; attribution OSM présente par défaut. |
| Hors ligne | Réseau coupé : diagnostic en échec, import `.json` / `.osm` / `.geojson` réussi, export PNG 2480 × 3508. |
| Aperçu intégré | Page dans une iframe : avertissement explicite dans l'onglet Lieu. |

### 9.2. Tests automatisés

Tests de bout en bout Playwright (Python), avec un réseau simulé : Overpass et OpenFreeMap sont simulés, tout autre accès externe est coupé. Les commandes figurent dans `CONTRIBUTING.md`.

### 9.3. État de validation

| Élément | Statut | Moyen |
| :--- | :--- | :--- |
| Gabarits, thèmes, repères, typographie, DMS (dont la retenue) | ✅ | Captures automatisées. |
| Moteur Overpass (réponse simulée), assemblage des anneaux, îles `evenodd` | ✅ | `tests/run.py` |
| Import JSON Overpass / `.osm` / GeoJSON, export hors ligne | ✅ | `tests/offline.py` |
| Export PNG 2480 × 3508 et chunk `pHYs` 300 DPI | ✅ | Lecture binaire du PNG. |
| Détection d'iframe, diagnostic tout en échec | ✅ | `tests/offline.py` |
| MapLibre embarqué, style (filtres 4.7.1), aperçu, export hors écran | ✅ | `tests/maplibre.py` (tuiles OpenMapTiles simulées). |
| Suspension des miroirs Overpass après 406 / 429 | ✅ | `tests/overpass_policy.py` |
| Panne de tous les miroirs Overpass (délai, 5xx, réponse sans CORS) : message « serveurs en panne », conclusion du diagnostic, pas de suspension | ✅ | `tests/overpass_outage.py` |
| Saisie des coordonnées du repère | ✅ | `tests/coords.py` |
| Lignes de texte optionnelles | ✅ | `tests/texts.py` |
| Taille des textes de l'affiche | ✅ | `tests/textsize.py` |
| Parcours guidé, accessibilité, historique, date, géolocalisation, recherche | ✅ | `tests/ux.py` (émulation) ; ⏳ géolocalisation et calendrier natif à valider sur iOS et Android. |
| Panneau coulissant, mode Cadrer, paysage, A− / A+ | ✅ | `tests/mobile.py` (émulation) ; ⏳ gestes à valider sur iOS Safari et Chrome Android. |
| MapLibre avec les vraies tuiles OpenFreeMap | ⏳ à valider | Sur l'URL GitHub Pages, dans un vrai navigateur ([#5](https://github.com/thiryyan/city-map-studio/issues/5)). |
| Overpass réel depuis `github.io` (miroirs, temps de réponse, taille de la relation « Loire ») | ⏳ à valider | Idem ([#6](https://github.com/thiryyan/city-map-studio/issues/6)). |
| Nominatim réel | ⏳ à valider | Idem, avec le diagnostic ([#4](https://github.com/thiryyan/city-map-studio/issues/4)). |
| Polices auto-hébergées dans l'aperçu et l'export, contrôle `document.fonts.check` | ✅ | `tests/fonts.py` |
| Accord préalable aux services tiers | ✅ | `tests/consent.py` |
| Réinitialisation des réglages | ✅ | `tests/reset.py` |
| Téléchargement sur iOS Safari et Chrome Android | ⏳ à valider | Appareils réels ([#7](https://github.com/thiryyan/city-map-studio/issues/7)). |
