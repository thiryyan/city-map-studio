# City Map Studio — Dossier technique de référence

> **Objet** : atelier web de création d'affiches cartographiques souvenir. L'application trace de façon minimaliste les rues et les cours d'eau d'une ville, marque d'un repère discret le lieu exact d'une rencontre, et exporte une affiche d'impression A4 à 300 DPI.

---

## 1. Exigences

| # | Sujet | Exigence |
| :--- | :--- | :--- |
| E1 | Licence | **100 % open source** : code sous licence **MIT** (© Contributeurs de City Map Studio) ; librairies, polices, données et services ouverts, sans clé API ni service propriétaire (ni ArcGIS, ni Mapbox, ni Google Maps, ni Google Fonts). |
| E2 | Navigateurs | Chromium ≥ 110, Safari ≥ 16, Firefox ≥ 115. |
| E3 | Rendu | L'export est identique à l'aperçu ; le gabarit et le thème **Souvenir** (par défaut) définissent le rendu de référence (§ 4.1 et 4.2). |
| E4 | Moteurs cartographiques | **Vectoriel GPU** (MapLibre GL + OpenFreeMap, par défaut) et **Fichier** (import hors ligne, Canvas 2D). |
| E5 | Gabarits | **Souvenir** (par défaut), **Cadre classique**, **Fondu moderne**, **Médaillon**. |
| E6 | Coordonnées | Affichage au choix en décimal (par défaut) ou en DMS. |
| E7 | Libellés | Aucun libellé sur la carte : le tracé est purement graphique. |
| E8 | Ville au lancement | Blois et la Loire. |
| E9 | Export | PNG A4 300 DPI (2480 × 3508 px). |
| E10 | Livraison | Fichiers statiques **sans étape de build**, servis tels quels : `index.html` (balisage), `css/app.css`, `js/*.js` (scripts classiques chargés dans l'ordre, sans module ES, pour que l'ouverture en `file://` reste possible). MapLibre et les polices sont fournis dans `lib/`. Tous les chemins sont relatifs (site servi sous `/city-map-studio/`). |
| E11 | Écrans | Mobile en priorité, ordinateur en second. Interface en français. |
| E12 | Hébergement | **GitHub Pages** (dépôt public, `index.html` à la racine, branche `main`). |
| E13 | Données | Attribution « © contributeurs OpenStreetMap » (ODbL), complétée de « OpenFreeMap © OpenMapTiles » (schéma CC-BY 4.0) avec le moteur Vectoriel GPU. Active par défaut, désactivable sous la responsabilité de l'utilisateur. |
| E14 | Vie privée | Aucune ressource de présentation (librairie, polices, styles) n'est chargée depuis un tiers : l'adresse IP du visiteur n'est transmise qu'aux services de données cartographiques nécessaires au fonctionnement, et **seulement après son accord explicite** (§ 2.4). Les polices sont auto-hébergées, conformément à la jurisprudence RGPD sur Google Fonts (LG München, 20/01/2022, 3 O 17493/20). |
| E15 | Sécurité | Politique de sécurité du contenu (CSP) en balise meta : aucun script ni style en ligne, réseau limité aux services cartographiques. Tout état venu de l'extérieur (lien partagé, `localStorage`) est validé champ par champ (`normState`). CDN de secours chargés avec empreinte SRI. |
| E16 | Accessibilité | Fenêtres en `<dialog>` modal (focus retenu, Échap), commandes au clavier, cibles tactiles de 44 px, noms accessibles pour tous les champs, texte de remplacement de l'aperçu. |
| E17 | Hors ligne | Application installable (manifeste) ; en http(s), un service worker garde l'application en cache (réseau d'abord) : démarrage et export du moteur Fichier sans réseau. Aucune ressource tierce mise en cache. |

---

## 2. Architecture

### 2.1. Briques techniques

| Brique | Choix | Licence |
| :--- | :--- | :--- |
| Langage | HTML5, CSS3, JavaScript ES2020, sans framework | — |
| Moteur vectoriel GPU | MapLibre GL JS **4.7.1**, chargé depuis `lib/`, puis en secours depuis unpkg, jsDelivr et cdnjs (version figée) | BSD-3-Clause |
| Tuiles vectorielles | OpenFreeMap (`https://tiles.openfreemap.org/planet`, schéma OpenMapTiles, sans clé) | Données ODbL, schéma CC-BY |
| Géocodage | Nominatim (`nominatim.openstreetmap.org`) | GPL / ODbL |
| Polices | Playfair Display, Montserrat, Space Mono, Cormorant Garamond, Josefin Sans, **auto-hébergées** dans `lib/fonts/` (woff2, sous-ensembles latin et latin-ext, `OFL.txt` par famille) | SIL OFL 1.1 |
| Rendu de l'affiche | Canvas 2D natif | — |

### 2.2. Moteurs cartographiques

| Moteur | Source | Atouts | Limites |
| :--- | :--- | :--- | :--- |
| **1. Vectoriel GPU (défaut)** | MapLibre + OpenFreeMap | Instantané, monde entier, mers et côtes correctes, fluide sur mobile. | Généralisation des tuiles : certaines petites voies disparaissent aux zooms faibles. |
| **2. Fichier (hors ligne)** | Fichier importé : `.osm` XML, JSON OSM (`{"elements":[…]}`) ou GeoJSON → Canvas 2D | Aucun accès réseau requis ; géométrie OSM brute au niveau de détail maximal, contrôle total du tracé. | L'utilisateur obtient le fichier lui-même (§ 7.3) ; le trait de côte marin n'est pas traité (villes continentales et fluviales). |

**Chaîne de secours** : MapLibre est chargé depuis `lib/`, puis depuis 3 CDN (12 s par source). Les tuiles sont surveillées pendant 15 s. En cas d'échec, un bandeau « Diagnostiquer » oriente vers le moteur qui fonctionne, et en dernier recours vers le moteur Fichier.

### 2.3. Rendu en trois couches (WYSIWYG)

Une fonction unique, `drawPoster(ctx, W, H, pass, mapFn)`, dessine l'affiche à n'importe quelle résolution. L'aperçu et l'export partagent donc le même code :

1. **Couche basse** (canvas) : le papier.
2. **Couche carte** : un conteneur placé exactement sur le cadre de la carte, qui accueille MapLibre ou le canvas vectoriel du moteur Fichier. Il est découpé en cercle pour le gabarit Médaillon.
3. **Couche haute** (canvas, `pointer-events: none`) : fondu, filets, repère, typographie et attribution.

À l'export, les trois couches sont recomposées dans un canvas unique de 2480 × 3508 px.

### 2.4. Réseau et politiques d'usage

* **Accord préalable (RGPD)** : au premier lancement, **aucune requête n'est émise vers un service tiers**. Un panneau « Afficher la carte ? » explique que l'affichage des tuiles transmet l'adresse IP à OpenFreeMap, et que Nominatim la reçoit aussi, seulement à la demande. Il propose deux choix :
  * **Afficher la carte** : l'accord est mémorisé dans `localStorage` (clé `cityMapStudio.consent`), la carte s'affiche, et l'action qui a déclenché la demande (recherche, diagnostic, export) s'exécute ;
  * **Travailler hors ligne** : passage au moteur Fichier, sans aucune requête.

  Tant que l'accord n'est pas donné, chaque point d'accès au réseau (`initMaplibre`, `search`, `runDiagnostics`, `exportPoster` avec le moteur Vectoriel GPU, CDN de secours de MapLibre) affiche la demande au lieu d'appeler le service. L'onglet Lieu indique l'état de l'accord et permet de le retirer, ce qui recharge la page dans l'état initial.
* **Nominatim** : appel uniquement à la validation de la recherche (jamais à la frappe), 5 résultats, `accept-language=fr`. Les résultats sont insérés via `textContent` (aucune injection HTML).
* **Persistance** : l'état de l'atelier est sauvegardé dans `localStorage` (clé `cityMapStudio.v2`, sous `try/catch`). La clé `cityMapStudio.opBlocked`, laissée par une version antérieure, est effacée au démarrage.

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

**Orientation** : portrait (2480 × 3508) ou paysage (3508 × 2480) pour tous les gabarits. En paysage, la carte (ou le ciel) occupe la gauche et le texte une colonne à droite, centrée verticalement ; Deux lieux place les cartes côte à côte. Les tailles s'expriment en fraction du petit côté (`U`), si bien qu'un texte garde la même taille physique dans les deux orientations. En portrait, les gabarits d'origine sont rendus au pixel près comme avant cette évolution.

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

Les thèmes se filtrent par catégorie (**Clairs**, **Sombres**, **Couleurs**). Un **contrôle de contraste à l'impression** avertit quand les rues principales ressortent mal sur la terre (contraste < 3), quand le texte manque de contraste avec le papier (< 4,5) ou quand le repère se distingue mal de la carte (< 1,8). Aucun thème fourni ne déclenche l'avertissement ; il sert pour les couleurs personnalisées.

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

**Itinéraire** : import d'un fichier GPX (traces `trkpt`, routes `rtept` ou, à défaut, points `wpt`), simplifié par Douglas-Peucker à 1 500 points au plus, puis cadrage automatique de la carte (zoom borné à 10–18). Couleur (repère, rues ou filets), épaisseur et pointillés réglables. L'itinéraire est conservé dans le navigateur avec les autres réglages.

### 4.4. Typographie (6 champs, 11 familles)

Champs : **Titre** (« Blois ») · **Sous-titre** (« Val de Loire • France ») · **Coordonnées** (automatiques ou saisies) · **Dédicace** (« Là où tout a commencé ») · **Noms** (« Prénom & Prénom ») · **Date** (« Le 14 juillet 2023 »).
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

**Police du titre et police du texte** : le titre peut avoir sa propre police (« Comme le texte » par défaut). Six **duos** préassortis : Origine (Playfair), Mariage (Italiana + Calligraphie), Voyage (Bebas + Jost), Classique (Bodoni + Garamond), Moderne (Jost), Chaleureux (Fraunces + Montserrat). Les cartes de police se filtrent par catégorie (Classiques, Modernes, Manuscrites, Affiche) et montrent le titre ou les noms saisis.

**Règle de la police manuscrite** : elle n'est jamais mise en capitales, ni espacée, ni penchée. Elle ne sert qu'aux lignes d'émotion (dédicace, noms, légendes des deux lieux) ; le sous-titre, les coordonnées, la date et la légende prennent alors la police du titre (Playfair si le titre est lui aussi manuscrit).

**Modèles de texte** : Rencontre, Mariage, Naissance, Maison, Voyage, Anniversaire. Un modèle remplace la dédicace ; il ne remplace les noms que s'ils sont encore ceux d'un exemple.

Le coefficient de corps (`scale`) et la graisse par défaut (`weight`) sont définis par famille dans `FONTS`.
Chaque ligne est **optionnelle** : une case à cocher devant chaque champ l'affiche ou la masque, sans effacer le texte saisi (état `show`, persisté). Dans les gabarits à cartouche (Cadre, Fondu, Médaillon), les lignes masquées ou vides sont retirées et les suivantes remontent ; le gabarit Fondu garde le bloc calé en bas. Dans le gabarit Souvenir, une ligne d'en-tête seule occupe toute la largeur, et les noms sans dédicace s'affichent seuls, sans filet.
Les textes trop longs sont réduits automatiquement pour tenir dans leur zone.

**Taille des textes.** Chaque ligne a son curseur de taille (60 à 150 %, état `textScale`), complété d'un curseur global « Tous les textes » (70 à 140 %, `textScaleAll`) ; les deux se multiplient (`tScale(k)`). Le lien « Tailles par défaut » les remet à 100 %, comme « Réinitialiser ». À 100 %, le rendu est identique à celui d'avant les curseurs.
* **Gabarits à cartouche** : quand une ligne grandit, les interlignes suivent (0,8 × l'écart de corps de la ligne, 0,25 × celui de la précédente). Si le bloc dépasse la hauteur disponible, il est réduit en entier pour tenir. Le gabarit Fondu garde le bloc calé en bas et le fait grandir vers le haut, sur la zone en fondu.
* **Gabarit Souvenir** : le titre et la date de l'en-tête gardent chacun leur taille, sur la même ligne de base (`drawRun`). En pied de page, si la dédicace et les noms dépassent la largeur, ils sont réduits du même facteur, ce qui garde le rapport entre les tailles choisies. Avant, la dédicace était plafonnée à 72 % de la largeur et les noms prenaient le reste.
* **Réduction signalée** : pendant le rendu de l'aperçu, `drawText`, `drawRun` et `drawCartouche` relèvent les réductions automatiques (`noteFit`). Au-delà de 10 %, l'onglet Textes l'indique (« ↘ Réduit pour tenir dans l'affiche : dédicace (67 %) ») et le curseur de la ligne passe en orange.

### 4.5. Réinitialisation

Le lien **« Réinitialiser »**, dans la barre du bas (visible depuis tous les onglets), rétablit tous les réglages par défaut : lieu et cadrage (Blois), gabarit, thème et couleurs, repère, police, textes et lignes affichées, marge, épaisseurs et calques. Un premier appui affiche « Confirmer ? » pendant 4 s ; un second appui réinitialise (`resetAll`). La confirmation est intégrée à la page, car `confirm()` est bloqué dans les aperçus intégrés.
Sont conservés : l'accord aux services tiers et les données déjà importées.

---

### 4.6. Ambiances et papier

**Au premier lancement**, une fenêtre propose de choisir une ambiance (vignettes des 8 ambiances) ou de « Commencer sans ambiance » (aussi avec Échap). Elle s'affiche après la demande d'accord, jamais en même temps, et une seule fois (`cityMapStudio.welcomed`). Elle ne s'affiche pas si une affiche est déjà enregistrée, ni à l'ouverture d'un lien partagé. Après le choix, l'onglet Lieu invite à chercher son lieu ; l'ambiance est une étape d'historique annulable.

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
| Souvenir | Souvenir | Playfair | Souvenir | Cœur | Lisse |

**Papier** : Lisse, Grain, Aquarelle, Kraft, Toile. Les textures sont générées par le code (bruit pseudo-aléatoire à graine fixe), sans image. La base mesure 1 240 px de large et s'agrandit à la taille voulue : le grain est le même à l'aperçu et à l'export. Fusion `multiply` sur papier clair, `screen` sur papier sombre (texture inversée et désaturée). Dans l'aperçu, un calque `#cvTex` posé au-dessus de l'affiche reproduit la fusion avec `mix-blend-mode` ; à l'export, elle est appliquée au canvas final.

### 4.7. Deux lieux

Deux cartes sur la même affiche (par exemple « Notre rencontre » et « Notre mariage »), chacune avec son cadrage et son repère, une légende éditable et ses coordonnées. Une seule carte est interactive à la fois ; l'autre est une **image figée** rendue hors écran (MapLibre ou vecteurs) et redessinée quand ses réglages changent. Le choix du lieu édité se fait dans l'onglet Lieu ou en touchant l'autre carte de l'affiche. L'export rend les deux vues à pleine résolution. Avec le moteur Fichier, la seconde vue n'affiche que les données importées : pour deux lieux éloignés, le moteur Vectoriel GPU est conseillé. Ce gabarit n'affiche qu'un repère par carte (pas de lieux supplémentaires ni d'itinéraire).

### 4.8. Carte du ciel

Gabarit **Ciel** : disque des étoiles visibles au-dessus du repère principal à la date et à l'heure choisies, puis la carte en bandeau et le texte. Données : `lib/sky/sky-data.js` (2 851 étoiles de magnitude ≤ 5,5 et 150 tracés de constellations, époque J2000), issues de d3-celestial (licence BSD-3, compilées depuis XHIP et l'UAI), chargées seulement quand le gabarit est utilisé.
* **Calcul** : temps sidéral moyen de Greenwich, angle horaire, puis hauteur et azimut de chaque étoile ; la précession depuis J2000 est négligée (moins d'un demi-degré sur des décennies). Contrôle : l'étoile Polaire est à une hauteur égale à la latitude, à 1° près.
* **Projection** : stéréographique centrée sur le zénith, l'horizon au bord du disque, nord en haut et est à gauche (vue du ciel en levant les yeux), points cardinaux autour.
* **Réglages** : date et heure locales du lieu (proposées depuis la date du texte, à 22 h), fuseau horaire (celui de l'appareil à cette date, ou de UTC−12 à UTC+14 par demi-heure), constellations, grille.
* **Couleurs** : sur papier clair, disque à l'encre du texte et étoiles couleur papier ; sur papier sombre, disque couleur terre et étoiles couleur texte. L'attribution mentionne la source des données du ciel.

### 4.9. Effets de tracé

Trois effets cumulables (onglet Style), rendus de la même façon par les deux moteurs, à l'aperçu comme à l'export. Toutes les mesures sont exprimées pour un cadre de 800 px, puis mises à l'échelle du cadre.
* **Eau hachurée** : hachures à 45°, au pas de 6 px, sur fond couleur terre ; les traits prennent la couleur de l'eau assombrie de 28 %, pour rester lisibles sur une eau pâle.
  * Moteur Vectoriel GPU : motif `fill-pattern` fourni à la demande (événement `styleimagemissing`). Son identifiant contient le pas, la densité de pixels et les deux couleurs, ce qui permet de le recréer sans état.
  * Vecteurs : motif de canvas (`createPattern`) à la même échelle.
* **Bâtiments en contour** : un trait fin (0,35 × l'épaisseur de référence) dans la couleur des rues secondaires, à la place de l'aplat.
* **Trait crayon** : chaque classe de rue est tracée deux fois, décalée de (1,2 ; −0,9) puis (−0,9 ; 1,0) × l'épaisseur de référence, à 72 % de sa largeur et 62 % d'opacité, comme une esquisse reprise au crayon. Côté GPU, deux couches par classe avec `line-translate`. Un tracé « tremblé » a été écarté : le moteur GPU ne peut pas le produire, et l'export ne correspondrait plus à l'aperçu.

Les ambiances fixent leurs effets : Encre de Chine (eau hachurée), Plan d'architecte (bâtiments en contour), Carnet de voyage (trait crayon) ; les autres les désactivent.

## 5. Export haute définition

* **Format** : 2480 × 3508 px en portrait, 3508 × 2480 px en paysage (A4 à 300 DPI ; 212 DPI en A3 par mise à l'échelle chez l'imprimeur). L'export est un **recalcul intégral** à pleine résolution, jamais un agrandissement de l'aperçu.
* **Étapes** :
  1. Attente du chargement des polices (`document.fonts.load`), puis contrôle par `document.fonts.check` : si une variante manque, l'export se fait avec une police de secours et le signale dans la fenêtre de résultat.
  2. Création d'un canvas 2480 × 3508 et dessin de la couche basse.
  3. Carte :
     * **MapLibre** : instance hors écran de 800 px CSS de large, `pixelRatio` = largeur du cadre / 800 (environ 2,7), `preserveDrawingBuffer`, `maxCanvasSize` 8192, attente de l'événement `idle` (45 s au plus), puis `drawImage` dans le cadre ;
     * **Fichier** : re-projection directe des géométries dans le cadre, à pleine résolution.
  4. Couche haute (repère, filets, textes) à la même échelle.
  5. `toBlob('image/png')`, injection d'un chunk **`pHYs`** (11 811 px/m = 300 DPI) pour que les logiciels ouvrent le fichier à la bonne résolution, puis téléchargement de `affiche-carte-[ville]-300dpi.png`. Sur mobile, le partage natif (`navigator.share`) est proposé quand il est disponible ; si le téléchargement est bloqué, l'image reste enregistrable par appui long.
* **Mémoire** : 8,7 Mpx, sous la limite de 16,7 Mpx de Safari iOS ; le canvas WebGL (environ 2160 × 2500 px) reste sous la limite de 4096 px.

---

* **Composition commune** (`composePoster`) : la même fonction produit l'export, l'aperçu au mur et les vues des deux lieux ; elle rend chaque vue (une ou deux), puis l'affiche et enfin le papier.
* **Aperçu au mur** (onglet Style) : l'affiche rendue à 1 100 px environ, dans un cadre (chêne, noir, blanc, doré) avec ou sans passe-partout, sur un mur au choix (blanc cassé, sauge, terracotta, béton, nuit), avec une ombre portée. L'image se télécharge en PNG.
* **Partage par lien** (onglet Style) : l'état de l'affiche, sans le moteur cartographique, est compressé (`CompressionStream` deflate) dans l'ancre de l'adresse (`#a=…`). Rien n'est envoyé à un serveur ; le lien contient le lieu et les textes, ce que l'interface rappelle. À l'ouverture, l'affiche est reconstituée, l'ancre effacée, et « Annuler » retrouve l'affiche précédente. Un itinéraire de plus de 400 points n'est pas inclus, et c'est signalé.

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
* **Onglet Lieu** : recherche, « Ma position actuelle », villes, lieu de rencontre et cadrage. Le moteur cartographique, l'import de fichier, le diagnostic et l'accord aux services tiers sont dans la section repliable **« Avancé »**. Son état est mémorisé (`cityMapStudio.advOpen`), et elle s'ouvre d'office quand elle devient utile : moteur Fichier, « Travailler hors ligne », diagnostic lancé depuis le bandeau. Les calques sont dans l'onglet Style, et les 12 couleurs dans une section repliable « Personnaliser les couleurs ».
* **Recherche d'adresse** : uniquement à la validation, une seule à la fois (bouton inactif pendant la requête). Il n'y a pas d'autocomplétion, que la politique d'usage de Nominatim interdit. Chaque résultat affiche le nom en tête et l'adresse en dessous.
* **Ma position actuelle** : géolocalisation de l'appareil (`navigator.geolocation`, permission demandée par le navigateur, page sécurisée requise). Elle place le repère et y centre la carte, à un zoom d'au moins 15.
* **Date** : un bouton calendrier, couvert par un champ `date` natif transparent pour fonctionner aussi sur iOS, remplit le champ au format de l'affiche (« Le 1er juillet 2023 ») et réaffiche la ligne si elle était masquée. Le texte reste modifiable, et le calendrier s'ouvre sur la date déjà saisie quand elle est reconnue.
* **Polices** : cartes à défilement horizontal, chacune montrant le titre saisi dans sa police.
* **Annuler / Rétablir** : jusqu'à 50 étapes, regroupées comme l'enregistrement (300 ms de calme), avec les boutons ou Ctrl/Cmd+Z et Ctrl/Cmd+Maj+Z (ou Ctrl+Y) hors des champs de texte, qui gardent leur annulation native. « Réinitialiser » peut être annulé. Le moteur cartographique n'entre pas dans l'historique, et les petits recentrages de la carte qui suivent un retour arrière, une réinitialisation ou un changement de moteur sont ignorés. L'historique n'est pas conservé après un rechargement.
* **Accessibilité** : onglets selon le motif ARIA (`tablist`, `tab`, `tabpanel`, `aria-selected`, flèches, Début, Fin) ; segments en `aria-pressed` et polices en `radio` ; focus clavier visible ; cibles tactiles d'au moins 44 px (36 px dans la barre du bas, poignée de 28 px sur toute la largeur) ; transitions courtes, coupées si `prefers-reduced-motion`.
* **Taille du texte de l'interface** : les tailles sont en `rem`. L'interface suit le réglage du système (taille de police d'Android ; Dynamic Type d'iOS via `font: -apple-system-body`). A− / A+ propose 87,5 à 137,5 %. Ce réglage est mémorisé dans l'appareil (`cityMapStudio.uiScale`), hors de l'état de l'affiche, et « Réinitialiser » ne le modifie pas. Les champs de saisie font au moins 16 px pour éviter le zoom automatique d'iOS.
* **Superpositions** : la demande d'accord aux services tiers est un panneau modal en bas d'écran, avec un texte court et un repli « En savoir plus ». Le bandeau d'action (« Carte indisponible → Diagnostiquer », « Aucun fichier importé → Importer ») s'affiche en tête du panneau, plus sur l'affiche. Les bulles d'information apparaissent au-dessus du panneau, sans masquer les réglages.
* **États visibles** : moteur actif, chargement, attente d'accord et mode hors ligne (pastille orange), erreurs réseau en clair.

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
| **GitHub Pages** (E12) | 1, 2 | **Recommandé**, surtout sur mobile : URL HTTPS stable, application installable, téléchargements fiables. |
| Serveur local (`python3 -m http.server`) | 1, 2 | Pour développer. |
| Fichier ouvert dans un navigateur (`file://`) | 1, 2 | Ni installable ni mis en cache. |
| Aperçu intégré d'une application ou visionneuse | 2 uniquement | Réseau et téléchargements bloqués. |
| Entièrement hors ligne | 2 (+ 1 si les tuiles sont autohébergées) | Une extraction **PMTiles** (Protomaps) peut être servie localement. |

---

## 8. Organisation du code

### 8.1. Arborescence

```
city-map-studio/
├── index.html              # balisage, CSP, métadonnées ; charge css/ et js/ (sans build)
├── css/app.css             # feuille de styles de l'application
├── js/                     # scripts classiques, chargés dans cet ordre (cf. § 8.2)
│   ├── config.js  state.js  geo.js  render.js  engines.js
│   └── preview.js  features.js  ui.js  export.js  main.js
├── sw.js                   # service worker (cache de l'application, http(s) seulement)
├── manifest.webmanifest    # application installable
├── icons/                  # icône SVG, PNG 192 / 512 / maskable / apple-touch, image d'aperçu des liens
├── .github/workflows/      # tests.yml : suite de bout en bout à chaque push et pull request
├── lib/                    # dépendances embarquées
│   ├── maplibre-gl.js/.css # MapLibre GL JS 4.7.1 (licence BSD-3)
│   ├── fonts/              # polices woff2 + fonts.css + OFL.txt par famille (11 familles)
│   └── sky/                # données du ciel (sky-data.js) + licence BSD-3 de d3-celestial
├── .nojekyll               # GitHub Pages : fichiers servis tels quels
├── LICENSE                 # MIT (code de l'application) + rappel des licences tierces
├── README.md
├── CONTRIBUTING.md         # règles de développement et commandes
├── docs/
│   └── dossier-technique.md
└── tests/
    ├── fixture.py          # génère une ville synthétique (tests/osm.json, JSON OSM)
    ├── make_formats.py     # convertit la ville synthétique en .osm et .geojson
    ├── run.py              # moteur Fichier, export PNG, DMS, assemblage des anneaux (mobile + ordinateur)
    ├── offline.py          # réseau coupé : diagnostic, import des 3 formats, iframe
    ├── layouts.py          # captures des gabarits Cadre / Fondu / Médaillon
    ├── maplibre.py         # MapLibre local + OpenFreeMap simulé (tuiles MVT générées), export hors écran
    ├── coords.py           # saisie des coordonnées du repère
    ├── texts.py            # lignes de texte optionnelles, dans les 4 gabarits
    ├── fonts.py            # polices auto-hébergées, file:// et HTTP, aucun appel tiers
    ├── consent.py          # accord préalable : aucune requête tierce sans accord
    ├── reset.py            # réinitialisation des réglages par défaut
    ├── textsize.py         # taille des textes de l'affiche
    ├── mobile.py           # panneau coulissant, mode Cadrer, paysage, A− / A+
    ├── ux.py               # parcours guidé, accessibilité, annuler / rétablir, date, position, recherche
    ├── design.py           # polices, thèmes, gabarits, ambiances, lieux, papier, aperçu au mur, lien, paysage, deux lieux, GPX, ciel
    ├── welcome.py          # ambiance proposée au premier lancement
    ├── security.py         # lien forgé ou piégé, état corrompu, crochets de test, libellé d'export
    ├── a11y.py             # fenêtres modales, clavier, aria-pressed, cibles tactiles, noms accessibles
    ├── csp.py              # aucune violation de la CSP (file:// et HTTP), aucun style ni script en ligne
    ├── pwa.py              # sous-chemin GitHub Pages, manifeste, service worker, démarrage hors ligne
    ├── run_all.py          # génère les données puis lance toute la suite (utilisé par la CI)
    ├── jswait.py           # attente d'une condition sans eval (compatible avec la CSP)
    └── seed.py             # préparation du localStorage sans script injecté (tests qui rechargent la page)
```

### 8.2. Fichiers et sections du script

Le script est découpé en dix fichiers `js/*.js`, eux-mêmes organisés en sections balisées `// ---------- Titre ----------`.
Ce sont des scripts classiques : leurs déclarations de premier niveau sont partagées et le **code exécuté au chargement
d'un fichier ne peut utiliser que les fichiers précédents** (les fonctions, elles, peuvent s'appeler d'un fichier à l'autre).

| Fichier | Contenu |
| :--- | :--- |
| `config.js` | Constantes : polices, thèmes, gabarits, repères, ambiances, villes, hiérarchie routière, `DEFAULT_STATE`. |
| `state.js` | Validation (`normState`), état `st`, fenêtres modales (`openDialog`, `closeDialog`, `setBusy`), accord préalable, enregistrement. |
| `geo.js` | Mercator, `geom` (géométrie des gabarits), formes. |
| `render.js` | Typographie, cartouche, repères, ciel, `drawPoster`. |
| `engines.js` | Données OSM et tracé Canvas (moteur Fichier), effets de tracé, moteur MapLibre. |
| `preview.js` | `$`, `h` (création d'éléments sans `innerHTML`), aperçu, deux lieux, gestes, papier, `composePoster`, aperçu au mur. |
| `features.js` | Lieux multiples, GPX, partage par lien, ambiances, panneau coulissant. |
| `ui.js` | Taille de l'interface, coordonnées, historique, `buildUI`, `changed`, vignettes, recherche, polices. |
| `export.js` | Export PNG 300 DPI, contexte d'exécution, diagnostic, import de fichier. |
| `main.js` | `boot`, application installable (`installPwa`), crochets de test. |

Principales sections :

| Section | Fonctions clés | Rôle |
| :--- | :--- | :--- |
| Constantes | `THEMES`, `ROADS`, `HW_CLASS`, `ML_CDNS`, `PRESETS` | Paramétrage. |
| État | `DEFAULT_STATE`, `loadState`, `saveState` | État unique `st`, persisté dans `localStorage`. |
| Accord préalable | `needConsent`, `giveConsent`, `declineConsent`, `withdrawConsent` | Aucun appel tiers avant l'accord de l'utilisateur. |
| Mathématiques | `merc`, `project`, `unproject`, `viewBounds`, `dms` | Web Mercator 512 px, zoom de référence pour un cadre de 800 px. |
| Gabarits | `geom` | Rectangle ou cercle de la carte selon le gabarit. |
| Rendu de l'affiche | `drawPoster`, `drawCartouche`, `drawMarker`, `drawText` | **Fonction unique pour l'aperçu et l'export** (passes `under` / `over` / `all`). |
| Moteur 2 : données | `normalizeElements`, `stitch`, `parseOsm`, `drawVectors`, `checkDataBanner` | Données OSM → Canvas 2D. |
| Moteur 1 | `loadMaplibre`, `buildStyle`, `initMaplibre`, `renderMaplibreOffscreen`, `mlFail` | MapLibre + OpenFreeMap ; export hors écran. |
| Interface | `parseCoords`, `placeMarkerFromInput`, `setMarker`, `goTo`, `setEngine`, `askReset`, `resetAll` | Commandes de l'atelier. |
| Contexte et diagnostic | `ENV`, `showEnvWarning`, `runDiagnostics`, `netMsg` | Détection d'iframe ou de blocage réseau, tests des services. |
| Moteur 2 : import | `osmXmlToElements`, `geojsonToElements`, `importText`, `importFile` | Import de fichier, avec recadrage automatique. |
| Export | `exportPoster`, `withDpi`, `crc32` | PNG 2480 × 3508 px à 300 DPI. |
| Débogage | `window.__cms` | Accès à l'état et aux fonctions depuis la console et les tests ; exposé seulement avec `?test` dans l'adresse ou `localStorage['cityMapStudio.debug']='1'`. |

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
| Accord préalable | Au premier lancement, aucune requête tierce ; demande modale ; « Travailler hors ligne » passe au moteur Fichier (pastille orange) ; recherche et diagnostic redemandent l'accord, sans requête ; après accord, l'action en attente s'exécute et le choix est mémorisé ; retrait possible ; « Travailler hors ligne » passe au moteur Fichier sans requête. |
| Polices | Les 5 familles (normale et italique) se chargent depuis `lib/fonts/`, y compris hors ligne et en `file://` ; elles s'appliquent à l'aperçu et à l'export ; le choix est conservé ; aucune requête vers Google. |
| Lignes de texte | Chaque ligne se masque et se réaffiche dans les 4 gabarits, sans perte du texte ; export possible sans aucune ligne. |
| Taille des textes | Chaque curseur (par ligne et global) modifie l'affiche dans les 4 gabarits ; retour à 100 % = rendu d'origine ; réduction automatique signalée ; tailles persistées et remises à 100 % par « Réinitialiser » ; export 2480 × 3508. |
| Effets de tracé | Eau hachurée, bâtiments en contour et trait crayon : rendus distincts, retour exact au rendu d'origine, export aux bonnes dimensions ; moteur GPU : motif fourni, couche en contour, deux passes décalées, hachures présentes à l'export ; effets fixés par les ambiances et annulables. |
| Premier lancement | Accord d'abord, puis choix d'une ambiance ; ambiance appliquée et annulable ; proposition unique (après un choix ou « Commencer sans ambiance ») ; rien pour une affiche existante ni pour un lien partagé. |
| Évolutions graphiques | 11 polices et duos, police manuscrite limitée à la dédicace et aux noms ; 15 thèmes, filtres, contraste ; gabarits distincts, cœur découpé dans l'aperçu ; ambiances et modèles annulables ; 10 repères distincts ; 3 lieux numérotés et reliés ; 4 textures ; aperçu au mur téléchargeable ; lien reconstituant l'affiche ; paysage 3508 × 2480 ; deux vues conservées ; GPX simplifié et cadré ; Polaire à la hauteur de la latitude ; exports aux bonnes dimensions. Gabarits d'origine identiques au pixel près. |
| Lisibilité et confort | Onglets dans l'ordre du parcours, rôles ARIA et navigation au clavier ; « Étape suivante » ; « Avancé » et couleurs repliés, « Avancé » rouvert d'office et mémorisé ; cibles tactiles ; annuler / rétablir (boutons, clavier, après réinitialisation, moteur exclu) ; calendrier (« 1er », lecture inverse) ; aperçu des polices ; « Ma position » ; recherche unique, sans requête pendant la frappe. |
| Mobile | iPhone 13 (390 × 664) : au moins 180 px de réglages à mi-hauteur ; poignée (toucher, glisser) ; dépliage à la saisie ; carte verrouillée hors du mode Cadrer ; placement du repère ; bulle au-dessus du panneau ; A− / A+ persistant, sans défilement horizontal ; paysage en deux colonnes ; ordinateur inchangé. |
| Saisie du repère | Formats du § 3.3 acceptés, saisies invalides refusées avec un message, recentrage si le point sort du cadre. |
| Résilience | MapLibre indisponible → bascule possible vers le moteur Fichier, recommandée par le diagnostic. |
| Licence | Aucune dépendance propriétaire ; attribution OSM présente par défaut. |
| Hors ligne | Réseau coupé : diagnostic en échec, import `.json` / `.osm` / `.geojson` réussi, export PNG 2480 × 3508. |
| Aperçu intégré | Page dans une iframe : avertissement explicite dans l'onglet Lieu. |
| Sécurité | Lien forgé (types faux, valeurs hors bornes, champs inconnus) : application intacte, valeurs invalides remplacées, rien d'invalide enregistré ; lien piégé (contenu décompressé > 512 Ko) refusé ; aucune violation de la CSP en `file://` ni en HTTP. |
| Accessibilité | Fenêtres modales : focus placé et retenu, Échap, focus rendu ; vignettes utilisables au clavier ; cibles de 44 px ; tous les champs nommés. |
| GitHub Pages et hors ligne | Servi sous `/city-map-studio/` sans ressource manquante ; manifeste et icônes valides ; après une visite, démarrage et export (moteur Fichier) sans réseau. |

### 9.2. Tests automatisés

**Visibilité** : un test vérifie l'affichage réel d'un élément (`offsetParent`, `is_visible`), pas son attribut `hidden`. Une règle `display` de composant l'emportait sur `hidden` : les filtres de polices semblaient fonctionner en test, mais rien ne changeait à l'écran. La règle globale `[hidden]{display:none!important}` corrige ce piège.

**Persistance et rechargement** : un script injecté par Playwright (`add_init_script`) qui accède à `localStorage` au démarrage de chaque document fait perdre, au rechargement suivant, les écritures récentes de la page. Mesuré sur une page minimale, sans l'application : 0 perte sur 25 rechargements sans script injecté, 3 à 4 sur 25 avec. C'était la cause d'échecs intermittents d'un test de persistance, et un risque pour tous les tests qui rechargent la page. Ces tests préparent désormais le stockage avec `tests/seed.py` (écriture par la page elle-même, puis rechargement), et attendent que l'état soit enregistré avant de recharger. Un utilisateur réel n'est pas concerné.

**CSP et attentes** : `page.wait_for_function()` évalue sa condition avec `eval()` dans la page, ce que la CSP refuse. Les tests utilisent `tests/jswait.py`, qui interroge la condition avec `page.evaluate()` (protocole DevTools, non soumis à la CSP). La CSP n'est jamais désactivée dans les tests.

**Crochets de test** : les tests ouvrent la page avec `?test` (sinon `window.__cms` n'existe pas). Le service worker n'est pas enregistré pendant les tests, sauf avec `?test&sw` (`tests/pwa.py`).

Tests de bout en bout Playwright (Python), avec un réseau simulé : OpenFreeMap et Nominatim sont simulés, tout autre accès externe est coupé. `python tests/run_all.py` lance toute la suite ; le workflow `.github/workflows/tests.yml` l'exécute à chaque push et à chaque pull request. Les commandes figurent dans `CONTRIBUTING.md`.

### 9.3. État de validation

| Élément | Statut | Moyen |
| :--- | :--- | :--- |
| Gabarits, thèmes, repères, typographie, DMS (dont la retenue) | ✅ | Captures automatisées. |
| Moteur Fichier, assemblage des anneaux, îles `evenodd` | ✅ | `tests/run.py` |
| Import JSON OSM / `.osm` / GeoJSON, export hors ligne | ✅ | `tests/offline.py` |
| Export PNG 2480 × 3508 et chunk `pHYs` 300 DPI | ✅ | Lecture binaire du PNG. |
| Détection d'iframe, diagnostic tout en échec | ✅ | `tests/offline.py` |
| MapLibre embarqué, style (filtres 4.7.1), aperçu, export hors écran | ✅ | `tests/maplibre.py` (tuiles OpenMapTiles simulées). |
| Saisie des coordonnées du repère | ✅ | `tests/coords.py` |
| Lignes de texte optionnelles | ✅ | `tests/texts.py` |
| Taille des textes de l'affiche | ✅ | `tests/textsize.py` |
| Polices, thèmes, gabarits, ambiances, lieux, papier, aperçu au mur, lien, paysage, deux lieux, GPX, ciel | ✅ | `tests/design.py` (moteur Fichier, sans réseau) ; ⏳ Deux lieux et aperçu au mur avec les vraies tuiles OpenFreeMap. |
| Parcours guidé, accessibilité, historique, date, géolocalisation, recherche | ✅ | `tests/ux.py` (émulation) ; ⏳ géolocalisation et calendrier natif à valider sur iOS et Android. |
| Panneau coulissant, mode Cadrer, paysage, A− / A+ | ✅ | `tests/mobile.py` (émulation) ; ⏳ gestes à valider sur iOS Safari et Chrome Android. |
| MapLibre avec les vraies tuiles OpenFreeMap (aperçu, déplacement et zoom, export, rendu Souvenir) | ✅ | Sur l'URL GitHub Pages, dans un vrai navigateur ([#5](https://github.com/thiryyan/city-map-studio/issues/5)). |
| Diagnostic réel (MapLibre, OpenFreeMap, Nominatim) | ✅ mobile ; ⏳ ordinateur | Diagnostic depuis GitHub Pages ([#4](https://github.com/thiryyan/city-map-studio/issues/4)). |
| Polices auto-hébergées dans l'aperçu et l'export, contrôle `document.fonts.check` | ✅ | `tests/fonts.py` |
| Accord préalable aux services tiers | ✅ | `tests/consent.py` |
| Réinitialisation des réglages | ✅ | `tests/reset.py` |
| Lien forgé ou piégé, état corrompu, crochets de test | ✅ | `tests/security.py` |
| Accessibilité au clavier et aux lecteurs d'écran | ✅ | `tests/a11y.py` (Chromium) ; ⏳ VoiceOver (iOS) et TalkBack (Android) à valider sur appareil. |
| Politique de sécurité du contenu | ✅ | `tests/csp.py`, `tests/maplibre.py` |
| Sous-chemin GitHub Pages, application installable, hors ligne | ✅ | `tests/pwa.py` (serveur local) ; ⏳ installation et hors ligne sur l'URL publiée, iOS et Android. |
| Image d'aperçu des liens partagés | ⏳ à valider | L'adresse `https://thiryyan.github.io/city-map-studio/icons/og-image.jpg` suppose la publication à cette adresse ; à adapter en cas de domaine personnalisé. |
| Téléchargement sur iOS Safari et Chrome Android (bouton, partage natif, appui long, 2480 × 3508 et 300 DPI conservés) | ✅ | Appareils réels ([#7](https://github.com/thiryyan/city-map-studio/issues/7)). |
