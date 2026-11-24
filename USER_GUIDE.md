# City Map Studio — Guide de l'utilisateur

City Map Studio est un atelier d'affiches souvenir qui fonctionne dans le navigateur. On choisit un lieu, on marque
d'un repère l'endroit d'une rencontre, d'un mariage ou d'une naissance, on écrit quelques lignes, puis on exporte
une affiche prête à imprimer : A4, A3, 50 × 70 cm ou tirage photo 10 × 15 cm, en PNG ou en PDF.

Ce guide présente toutes les fonctions de l'application, dans l'ordre où on les rencontre. Les options sont
expliquées à chaque étape, et les encadrés **Astuce** donnent des raccourcis. Les choix techniques et leur
justification sont dans le [dossier technique](docs/dossier-technique.md).

---

## Sommaire

1. [En bref](#1-en-bref)
2. [Premier lancement](#2-premier-lancement)
3. [L'écran de travail](#3-lécran-de-travail)
4. [Onglet Lieu](#4-onglet-lieu)
5. [Onglet Repère](#5-onglet-repère)
6. [Onglet Textes](#6-onglet-textes)
7. [Onglet Style](#7-onglet-style)
8. [Gabarits particuliers : Deux lieux, Ciel, Lettres](#8-gabarits-particuliers--deux-lieux-ciel-lettres)
9. [Affiches illustrées](#9-affiches-illustrées)
10. [Onglet Export](#10-onglet-export)
11. [Annuler, comparer, réinitialiser](#11-annuler-comparer-réinitialiser)
12. [Raccourcis clavier](#12-raccourcis-clavier)
13. [Vie privée, hors ligne et données conservées](#13-vie-privée-hors-ligne-et-données-conservées)
14. [Astuces](#14-astuces)
15. [Dépannage](#15-dépannage)

---

## 1. En bref

| Capacité | Ce que fait l'application |
| :--- | :--- |
| **Trois types d'affiche** | **Carte** (affiche cartographique), **Illustration** (affiche de voyage façon vintage, à partir d'une image produite par votre IA) et **Carte + illustration** (les deux associées). |
| **Carte du monde entier** | Tracé minimaliste des rues, de l'eau, des parcs, des bâtiments et des voies ferrées, sans aucun nom sur la carte. |
| **Repère** | 10 styles (cœur, épingle, alliances, petits pieds…), jusqu'à 3 lieux numérotés et reliés, itinéraire GPX. |
| **11 gabarits** | Souvenir, Cadre, Fondu, Médaillon, Cœur, Arche, Voyage, Polaroid, Deux lieux, Ciel, Lettres ; en portrait ou en paysage. |
| **Style** | 13 ambiances prêtes à l'emploi, 16 thèmes de couleurs, palette tirée d'une photo, 6 papiers et des plis. Les 11 polices et 6 duos sont dans l'onglet Textes. |
| **Effets** | Eau hachurée, bâtiments en contour ou pointillés, trait crayon, lueur, lignes d'eau gravées, parcs hachurés, surimpression riso, halo et quartier en relief, dorure, échelle, rose des vents, graduations. |
| **Ciel du jour J** | Étoiles, constellations, Lune et planètes visibles au-dessus du lieu, à la date et à l'heure choisies. |
| **Export** | PNG 300 DPI (2480 × 3508 px en A4) ou PDF à la taille exacte d'impression ; aperçu au mur. |
| **Sauvegarde** | Mes affiches dans le navigateur, fichiers de configuration, sauvegarde complète, partage par lien. |
| **Sans compte, sans clé** | Aucune inscription. Seuls le fond de carte et la recherche d'adresse utilisent un service en ligne, et seulement après votre accord. |
| **Hors ligne** | Moteur Fichier : la carte est tracée depuis un fichier OpenStreetMap, sans réseau. Application installable. |

---

## 2. Premier lancement

### 2.1. Ouvrir l'application

* **En ligne** : ouvrez l'adresse publiée (GitHub Pages). C'est le mode recommandé, en particulier sur téléphone.
* **En local** : depuis le dossier du projet, lancez `python3 -m http.server 8000`, puis ouvrez `http://localhost:8000`.
* **En fichier** : un double-clic sur `index.html` fonctionne aussi, mais l'application n'est alors ni installable
  ni disponible hors ligne.

### 2.2. « Afficher la carte ? »

Au premier lancement, une seule fenêtre s'ouvre. Elle explique que le fond de carte vient d'**OpenFreeMap**, et que
l'afficher transmet votre adresse IP à ce service. La recherche d'adresse (**Nominatim**) la reçoit aussi, mais
seulement quand vous lancez une recherche. Aucun cookie et aucune mesure d'audience ne sont utilisés.

| Choix | Effet |
| :--- | :--- |
| **Afficher la carte** | La carte de Blois s'affiche. Le choix est mémorisé dans le navigateur. |
| **Travailler hors ligne** | Aucune requête n'est envoyée. L'application passe au moteur **Fichier** et ouvre la section d'import (§ 4.6). |

Tant que vous n'avez pas donné votre accord, la recherche, le diagnostic et l'export avec le moteur Vectoriel GPU
reposent la question au lieu de contacter le service. Si vous acceptez, l'action demandée s'exécute aussitôt. Le
choix se modifie à tout moment dans **Lieu › Avancé** (« Retirer l'accord » recharge la page).

### 2.3. « Essayer une ambiance »

Juste après, une bande de vignettes s'affiche en tête des réglages, sous l'affiche, sans rien masquer. Chaque
vignette applique une ambiance complète : thème, polices, gabarit, repère et papier. Vous pouvez en essayer
plusieurs, puis fermer la bande avec ✕. Elle ne revient plus ensuite, mais les ambiances restent dans l'onglet
Style (§ 7.1). Elle n'apparaît pas si une affiche est déjà enregistrée, ni à l'ouverture d'un lien partagé.

### 2.4. Installer l'application

Sur la version publiée, le navigateur propose d'installer l'application : menu « Installer » ou « Ajouter à
l'écran d'accueil ». Une fois installée, elle s'ouvre dans sa propre fenêtre et démarre sans réseau. Le moteur
Vectoriel GPU a toujours besoin d'Internet ; le moteur Fichier, non.

Quand une nouvelle version est publiée, un bandeau **« Nouvelle version disponible »** propose **Mettre à jour**.
Rien n'est rechargé sans votre accord ; ✕ reporte la mise à jour. Votre affiche en cours est retrouvée après le
rechargement. La version installée est indiquée dans **Lieu › Avancé**.

---

## 3. L'écran de travail

### 3.1. Disposition

| Écran | Disposition |
| :--- | :--- |
| **Téléphone en portrait** | L'affiche en haut, le panneau des réglages en bas. |
| **Ordinateur** (≥ 900 px), **tablette ou téléphone en paysage** (≥ 560 px) | Deux colonnes : le panneau à gauche, l'affiche à droite. |

En tête du panneau se trouve le **type d'affiche** : **Carte**, **Illustration** ou **Carte + illus.**. Il reste
visible en permanence, même quand le panneau est réduit. Les onglets en dépendent :

| Type | Onglets |
| :--- | :--- |
| Carte | Lieu · Repère · Textes · Style · Export |
| Illustration | Illustration · Textes · Style · Export |
| Carte + illus. | Lieu · Repère · Illustration · Textes · Style · Export |

Changer de type ne fait rien perdre : lieu, textes, polices, format et illustration sont conservés.

Les onglets suivent l'ordre de création. Chacun se termine par un bouton **« Étape suivante »**, et le dernier,
Export, par le bouton d'export.

### 3.2. Le panneau coulissant (téléphone)

Le panneau a trois crans : **réduit** (type d'affiche, onglets et barre du bas : l'affiche occupe presque tout
l'écran), **mi-hauteur** (par défaut) et **déplié** (réglages en grand, affiche en vignette).

* Glissez la poignée, ou touchez-la pour passer d'un cran à l'autre.
* Toucher un onglet depuis le cran réduit ouvre la mi-hauteur. Toucher l'onglet déjà actif bascule entre
  mi-hauteur et déplié.
* Pendant la saisie d'un texte, le panneau se déplie, puis reprend sa place.

### 3.3. Cadrer la carte

* **Sur ordinateur** : glissez la carte pour la déplacer, utilisez la molette ou les boutons + et − pour zoomer.
* **Sur téléphone** : la carte est verrouillée, pour qu'un geste de défilement ne la décadre pas. Touchez-la, ou
  touchez le bouton **Cadrer**, pour entrer dans le mode Cadrer : le panneau se réduit, vous glissez et pincez,
  puis vous touchez **Terminer**.

Les **boutons flottants**, à côté de l'affiche, sont :

| Bouton | Action |
| :--- | :--- |
| Cadrer | Ouvre ou ferme le mode Cadrer (téléphone). |
| + / − | Zoom d'un demi-cran (affiche illustrée : agrandit ou réduit l'illustration de 10 %). |
| Placer le repère | Le prochain toucher sur la carte pose le repère. |
| Centrer sur le repère | Ramène la carte sur le repère (affiche illustrée : recentre l'illustration). |
| Carte / Image | Carte + illustration seulement : choisit le calque que cadrent les autres boutons et le mode Cadrer. |
| Œil, « Voir l'affiche seule » | Masque tout ce qui recouvre l'affiche, panneau compris sur téléphone. Un toucher, Échap ou le bouton retour du téléphone ramène aux réglages, sans déplacer la carte ni poser de repère. |

### 3.4. La barre du bas

Toujours visible, elle regroupe **Annuler / Rétablir**, la ligne d'état (moteur, chargement, erreurs ; texte complet
au survol), le lien **Réinitialiser** et le réglage **A− / A+** de la taille du texte de l'interface. Au-dessus
peut apparaître le bouton **« Maintenir pour comparer »** (§ 11.2).

**A− / A+** règle la taille de l'interface de 87,5 à 137,5 %. Le réglage est propre à l'appareil : il n'est
pas lié à l'affiche, et « Réinitialiser » ne le modifie pas. L'interface suit aussi la taille de texte choisie
dans les réglages du téléphone.

---

## 4. Onglet Lieu

### 4.1. Rechercher une adresse ou une ville

Saisissez une adresse, un monument ou une ville, puis touchez **Chercher**. La recherche part seulement à la
validation : il n'y a pas de suggestions pendant la frappe, que le service Nominatim interdit. Cinq résultats au
plus s'affichent, chacun avec deux actions :

* **Carte + repère** : centre la carte sur le lieu et y pose le repère ; le titre prend le nom de la ville du lieu et le sous-titre sa région et son pays (un titre ou un sous-titre que vous avez personnalisé est conservé) ;
* **Repère seul** : pose le repère sans déplacer la carte.

Une recherche à la fois : le bouton est inactif pendant la requête. En cas de recherches trop rapprochées, le
service impose une pause d'une minute, et l'application l'indique.

### 4.2. Ma position actuelle

Le bouton **Ma position actuelle** utilise la géolocalisation de l'appareil. Le navigateur demande l'autorisation,
et la page doit être en https. Le repère est placé sur votre position, et la carte y est centrée avec un zoom d'au
moins 15.

### 4.3. Villes proposées

Six villes sont proposées en un toucher : **Blois** (par défaut), **Paris**, **Venise**, **New York**, **Bordeaux**
et **Périgueux**. Le titre et le sous-titre de l'affiche sont remplis en même temps. Sous le titre « Villes »,
l'application indique la ville affichée (la plus proche du centre, à 5 km au plus, ou « Autre lieu ») et ses
coordonnées ; la ville affichée est mise en surbrillance.

### 4.4. Lieu de rencontre (le repère)

Le repère est indépendant du centre de la carte. Il se place de quatre façons :

1. **Placer le repère sur la carte**, puis un toucher sur la carte ;
2. **Au centre** : au centre de la carte affichée ;
3. depuis un **résultat de recherche** (§ 4.1) ;
4. par la **saisie de ses coordonnées**, puis **Placer**.

Formats de coordonnées acceptés :

| Format | Exemples |
| :--- | :--- |
| Décimal, à point ou à virgule | `47.5861, 1.3359` · `40.7484,-73.9857` · `47,5861 ; 1,3359` |
| Degrés, minutes, secondes, avec N / S / E / W / O | `47° 35′ 10″ N, 1° 20′ 09″ E` · `47°35'10"N 1°20'9.2"E` · `N 47 35.1667 E 1 20.1533` |
| Lien de carte | lien Google Maps (`…/@47.58,1.33,15z`), lien OpenStreetMap (`?mlat=…&mlon=…` ou `#map=15/47.58/1.33`) |

Une saisie incomplète ou incohérente est refusée avec un message (hémisphère manquant, minutes ≥ 60, latitude
au-delà de ±85°…). Si le point sort du cadre, la carte se recentre dessus.

> **Astuce** — Dans Google Maps, un appui long sur un lieu affiche ses coordonnées : copiez-les et collez-les
> telles quelles dans le champ.

### 4.5. Cadrage

Le curseur **Zoom** va de 10 (une région) à 18 (quelques rues). Le cadrage est le même sur un téléphone, sur un
ordinateur et à l'export : ce que vous voyez est ce qui sera imprimé.

### 4.6. Section « Avancé » : moteur, connexion, hors ligne

Cette section repliable s'ouvre d'elle-même quand elle devient utile (moteur Fichier, travail hors ligne,
diagnostic). Elle contient :

**Le moteur cartographique**

| Moteur | Pour quoi | Limites |
| :--- | :--- | :--- |
| **Vectoriel GPU** (par défaut) | Le monde entier, instantané, mers et côtes correctes, fluide sur mobile. Nécessite Internet. | Aux zooms faibles, certaines petites rues sont simplifiées. |
| **Fichier (hors ligne)** | Aucun réseau : la carte est tracée depuis un fichier OpenStreetMap, au détail maximal. | Il faut obtenir le fichier ; le trait de côte marin n'est pas tracé (villes continentales ou fluviales). |

Les deux moteurs rendent les mêmes effets, ornements et couleurs, à l'aperçu comme à l'export.

**Importer un fichier (moteur Fichier)**

1. Sur [openstreetmap.org/export](https://www.openstreetmap.org/export), cadrez la zone voulue et exportez-la
   (fichier `.osm`). Au-delà d'environ 50 000 nœuds, le site refuse : restez sous 1,5 km de côté environ en
   centre-ville, ou utilisez un autre outil d'extraction.
2. Touchez **Importer un fichier de données**. Formats acceptés : `.osm` (XML), JSON OSM (`{"elements": […]}`) ou
   GeoJSON. La carte se recadre sur les données importées.

**Diagnostiquer la connexion** teste le contexte d'ouverture, la librairie cartographique, OpenFreeMap et Nominatim,
puis recommande le moteur qui fonctionne. **L'accord aux services tiers** se donne ou se retire ici. **La version**
de l'application installée est affichée en bas.

---

## 5. Onglet Repère

### 5.1. Style du repère

Dix styles : **Cœur géométrique**, **Point**, **Cœur**, **Anneau**, **Épingle**, **Étoile**, **Maison**,
**Alliances**, **Ancre**, **Petits pieds**.

| Réglage | Valeurs |
| :--- | :--- |
| Plein / Contour | Silhouette pleine ou simple trait. |
| Taille | 10 à 300 % (100 % = 5,5 % de la largeur de l'affiche). |
| Opacité | 20 à 100 %. |
| Couleur | **Auto** (couleur Repère du thème), Or, Rouge, Noir, Blanc, ou couleur libre. La couleur en cours est enfoncée. |

### 5.2. Plusieurs lieux

Jusqu'à **trois lieux** sur la même carte : le repère principal et deux lieux de plus (rencontre, mariage,
maison…). **+ Ajouter un lieu**, puis un toucher sur la carte pour le placer ; chaque lieu a un nom, un bouton
**Placer** pour le déplacer et ✕ pour le retirer. Les lieux supplémentaires sont dessinés dans le même style, à
75 % de la taille.

Dès qu'il y a au moins deux lieux, deux options apparaissent :

* **Numéroter les lieux** : pastilles 1, 2, 3 sur la carte et légende sous la carte (« 1 Rencontre · 2 Mariage ») ;
* **Relier les lieux par un trait** : trait en pointillés d'un lieu à l'autre.

### 5.3. Itinéraire GPX

**Importer un tracé GPX** (trace d'une randonnée, d'un voyage, d'un marathon…). L'application lit les traces, à
défaut les routes, à défaut les points de passage. Elle simplifie le tracé à 1 500 points au plus, puis cadre la
carte dessus.

| Réglage | Valeurs |
| :--- | :--- |
| Afficher l'itinéraire | Le masque sans le retirer. |
| Couleur | Couleur du repère, des rues ou des filets. |
| Épaisseur | × 0,5 à × 3. |
| Pointillés | Trait continu ou pointillé. |
| Cadrer sur l'itinéraire / Retirer | Recadre la carte, ou retire le tracé (« Annuler » le retrouve). |

---

## 6. Onglet Textes

### 6.1. Les six lignes

| Ligne | Exemple par défaut |
| :--- | :--- |
| Titre (ville) | Blois |
| Sous-titre / région | Val de Loire • France |
| Dédicace | Là où tout a commencé |
| Noms | Alice & Mathias |
| Date | Le 23 septembre 2023 |
| Coordonnées | calculées depuis le repère, ou saisies |

* **Afficher ou masquer** : la case devant chaque ligne la retire de l'affiche sans effacer le texte. Les lignes
  suivantes remontent.
* **Taille** : chaque ligne a son curseur (60 à 150 %), et **Tous les textes** agit sur l'ensemble (70 à 140 %).
  Les deux se combinent. **Tailles par défaut** remet tout à 100 %. Dans le gabarit Lettres, le titre prend toujours
  la plus grande taille possible : son curseur n'y a pas d'effet.
* **Réduction automatique** : un texte trop long est réduit pour tenir. Au-delà de 10 %, l'onglet le signale
  (« ↘ Réduit pour tenir dans l'affiche : dédicace (67 %) ») et le curseur de la ligne passe en orange.
* **Date** : le bouton calendrier remplit le champ au format de l'affiche (« Le 1er juillet 2023 ») ; le texte
  reste modifiable librement.
* **Coordonnées** : format **Décimal** (`47.5861000, 1.3359000`) ou **Degrés ° ′ ″** (`47° 35′ 10.0″ N`). Un texte
  saisi remplace le calcul automatique ; laissez le champ vide pour revenir aux coordonnées du repère.

### 6.2. Dédicace sur une ou deux lignes

Sous la dédicace, trois choix : **Auto** (par défaut), **Une ligne**, **Deux lignes**. En Auto, la dédicace passe
sur deux lignes dès que, sur une seule, elle serait réduite de plus de 20 %. La coupure se fait entre deux mots,
pour équilibrer les deux lignes. La carte cède alors un peu de hauteur au texte.

> **Astuce** — Quand l'avertissement de réduction s'affiche, il propose directement « Passer la dédicace sur deux
> lignes ».

### 6.3. Modèles de texte

**Rencontre**, **Mariage**, **Naissance**, **Maison**, **Voyage**, **Anniversaire** : chaque modèle propose une
dédicace. Il remplace aussi les noms, mais seulement s'ils sont encore ceux d'un exemple : vos noms saisis ne sont
jamais écrasés. Un modèle s'annule comme tout autre changement.

### 6.4. Note sur les gabarits

Tous les gabarits n'affichent pas toutes les lignes. Souvenir et Polaroid, par exemple, n'affichent pas le
sous-titre : une note sous la ligne l'indique, avec un bouton « Passer au gabarit Cadre ».

L'onglet Textes est le même pour les trois types d'affiche (Carte, Illustration, Carte + illus.). Les sections
6.5 à 6.7 sont en tête de l'onglet.

### 6.5. Typographie


* **Duos** préassortis : Origine (Playfair), Mariage (Italiana + Calligraphie), Voyage (Bebas + Jost), Classique
  (Bodoni + Garamond), Moderne (Jost), Chaleureux (Fraunces + Montserrat).
* **Police du titre** et **police du texte**, choisies séparément. La police du titre propose d'abord **Vintage** :
  grandes capitales condensées, à la manière des affiches de voyage. Viennent ensuite « Comme le texte » et onze
  familles : Playfair, Garamond, Bodoni, Italiana, Fraunces (classiques), Montserrat, Jost, Mono (modernes), Art
  déco, Bebas (affiche) et Calligraphie (manuscrite). Les cartes se filtrent par catégorie et montrent votre titre
  ou vos noms.
* **Règle de la police manuscrite** : elle n'est jamais mise en capitales ni espacée. Elle ne sert qu'à la dédicace,
  aux noms et aux légendes des deux lieux ; les autres lignes prennent la police du titre.

Toutes les polices sont incluses dans l'application : rien n'est téléchargé chez un tiers, et l'export utilise
exactement les polices de l'aperçu.

Choisir une police de titre ou un duo quitte le style Vintage. Une ambiance remet le style du titre sur **Auto** :
police choisie sur une affiche Carte, Vintage sur une affiche illustrée.

### 6.6. Couleurs des textes

* **Lettres** : **Auto** (couleur Texte du thème, par défaut), une teinte du nuancier ou une couleur libre.
* **Ombre** : **Auto** (aucune sur une affiche Carte, couleur du papier sur une affiche illustrée), aucune ou
  une teinte ; **décalage de l'ombre** de 1 à 12.
* **Contour** : aucun (par défaut) ou une teinte.

La pastille Auto montre, en bas, la couleur que donne le thème actuel. Le style du titre et ces couleurs sont
communs aux trois types d'affiche. Sur une affiche Carte, ils s'appliquent aux lignes du gabarit : cartouche,
en-tête et pied de Souvenir, Voyage… La mention des sources n'est pas concernée.

### 6.7. Position des textes

* **Titre** (et sous-titre) : grille de 9 positions. Sur une affiche Carte, **Dans le gabarit** (par défaut) le
  laisse à la place prévue par le gabarit.
* **Lignes du bas** (dédicace, noms, date et coordonnées) : un bloc. **Auto** le place à l'opposé du titre sur une
  affiche illustrée, **Dans le gabarit** sur une affiche Carte, ou choisissez l'une des 9 positions.
* Sur une affiche Carte, un bloc sorti du gabarit est posé sur l'affiche, au-dessus de la carte, et sa place
  dans le gabarit reste vide. Choisissez une ombre ou un contour pour qu'il reste lisible. Dans le gabarit
  Lettres, le titre forme la carte : il reste en place.
* **Glisser sur l'aperçu** : un bloc posé sur l'affiche se déplace au doigt ou à la souris, aimanté sur les axes
  du centre et sur les positions de la grille. Au clavier : Tab jusqu'au bloc, flèches (1 %, Maj : 5 %), Origine
  pour revenir à la grille (affiche Carte : dans le gabarit), Échap pour sortir.
* Les positions sont propres à chaque type d'affiche : un titre déplacé sur une illustration ne bouge pas sur la
  carte.

---

## 7. Onglet Style

L'onglet est en deux parties : l'**essentiel**, visible d'emblée, et **« Plus de réglages »**, une section
repliable. Celle-ci s'ouvre d'elle-même dès qu'un réglage qu'elle contient est actif (effet, ornement, calque
masqué…) : aucun effet appliqué ne reste caché.

### 7.1. Ambiances

Un toucher applique un ensemble assorti, en gardant le lieu et les textes :

| Ambiance | Thème | Polices | Gabarit | Repère | Papier et effets |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Mariage doré | Galerie Or & Noir | Italiana / Calligraphie | Cœur | Alliances | Lisse |
| Naissance sauge | Sauge | Fraunces | Arche | Petits pieds | Grain |
| Carnet de voyage | Terracotta | Bebas / Jost | Voyage | Épingle | Kraft, trait crayon |
| Plan d'architecte | Plan d'architecte | Mono | Cadre | Point | Lisse, bâtiments en contour |
| Nuit en ville | Néon | Bebas / Jost | Fondu | Anneau | Lisse, lueur |
| Bord de mer | Marine | Italiana / Jost | Polaroid | Ancre | Toile |
| Encre de Chine | Encre de Chine | Bodoni / Garamond | Médaillon | Cœur géométrique | Aquarelle, eau hachurée |
| Carte ancienne | Sépia vintage | Garamond | Cadre | Étoile | Ancien et plis, lignes d'eau, parcs hachurés, échelle, rose des vents, graduations |
| Soirée de gala | Prestige Onyx & Or | Italiana / Garamond | Médaillon | Alliances | Lisse, lueur, dorure |
| Risographie | Risographie | Bebas / Jost | Voyage | Épingle | Grain, surimpression riso, bâtiments pointillés |
| Lettres de ville | Crème & Encre | Bebas / Jost | Lettres | Point | Grain |
| Notre quartier | Souvenir | Garamond | Cadre | Cœur | Lisse, halo, quartier en relief |
| Souvenir | Souvenir | Playfair | Souvenir | Cœur | Lisse (rendu par défaut) |

Une ambiance désactive les effets qu'elle ne cite pas. Elle ne change que ce qui existe dans le type d'affiche en
cours : sur une affiche **Illustration**, le thème, les polices, le papier et la dorure (ni gabarit, ni repère, ni
effets de carte) ; sur une affiche **Carte + illustration**, tout sauf le gabarit (la composition en tient lieu). Le
message indique ce qui a changé. Tout reste modifiable ensuite, et « Annuler » revient en arrière.

### 7.2. Thème

Seize thèmes, filtrables par catégorie (**Clairs**, **Sombres**, **Couleurs**) : Souvenir, Galerie Or & Noir,
Prestige Onyx & Or, Blanc minimaliste, Crème & Encre, Nuit boréale, Sépia vintage, Sauge, Terracotta, Rose poudré,
Automne, Marine, Encre de Chine, Plan d'architecte, Néon, Risographie.

**Couleurs d'après une image** (pour les trois types d'affiche) : **Une photo** (un coucher de soleil, un bouquet,
la façade de la maison…) ou, sur une affiche illustrée, **L'illustration** importée. L'application en tire six
couleurs dominantes et en fait un thème, en version **Claire** ou **Sombre** : papier, textes et carte s'accordent
à l'image. La photo ne quitte pas l'appareil et n'est pas conservée.

Un **contrôle de contraste** avertit quand, à l'impression, les rues principales ressortent mal sur la terre, quand
le texte manque de contraste avec le papier, ou quand le repère se distingue mal. Il sert surtout pour les couleurs
personnalisées : aucun thème fourni ne le déclenche.

### 7.3. Polices

Les polices sont dans l'onglet **Textes** (§ 6.5).

### 7.4. Papier

**Lisse**, **Grain**, **Aquarelle**, **Kraft**, **Toile**, **Ancien** (papier jauni, bords roussis, rousseurs). Sur
une affiche illustrée, **Papier jauni sur l'illustration** teinte l'image comme un vieux papier. La
case **Plis d'une carte dépliée** ajoute les plis d'une carte routière, avec n'importe quel papier. Le papier
figure à l'identique sur l'aperçu et sur l'export.

**Dorure** (sous le papier, pour tous les types d'affiche) : textes, filets, contours et repères prennent un reflet
métallique tiré de leur propre couleur (l'or devient feuille d'or, le blanc argent, le terracotta cuivre). À
l'impression, c'est une illusion de dorure.

### 7.5. Plus de réglages

**Gabarit**

| Gabarit | Composition |
| :--- | :--- |
| **Souvenir** (par défaut) | En-tête sur une ligne (ville et date à gauche, coordonnées à droite), carte rectangulaire, dédicace en grand et noms en italique. |
| **Cadre** | Carte dans un double filet, cartouche centré dessous. |
| **Fondu** | Carte pleine page, fondue vers le papier en bas et sur les bords, texte posé sur le fondu. |
| **Médaillon**, **Cœur**, **Arche** | Carte découpée dans un cercle, un cœur ou une fenêtre en arche ; contour fin optionnel (« Contour de la forme »). |
| **Voyage** | Carte pleine largeur, ville en très grand alignée à gauche ; pensé pour une police d'affiche condensée. |
| **Polaroid** | Carte carrée, large marge basse, dédicace en tête du texte. |
| **Deux lieux**, **Ciel**, **Lettres** | Voir le § 8. |

* **Marge (passe-partout)** : 3 à 12 % de l'affiche (aussi pour la composition Vignette d'une affiche Carte +
  illustration ; le **Contour de la forme** vaut aussi pour son Médaillon).
* **Touche d'or** : applique un or `#C5A059` au fleuve, aux grands axes, au repère ou aux filets.
* **Tracé** : **Épaisseur des rues** (× 0,5 à × 2,5) et **Mise en valeur des cours d'eau** (× 0,5 à × 3).

**Effets de tracé** (cumulables)

| Effet | Rendu | Conseil |
| :--- | :--- | :--- |
| Eau hachurée | Hachures à 45° dans l'eau. | Avec Encre de Chine. |
| Bâtiments en contour | Bâtiments au trait fin au lieu de l'aplat. | Esprit plan d'architecte. |
| Trait crayon | Rues tracées deux fois, légèrement décalées, comme une esquisse. | Carnet de voyage. |
| Lueur | Halos lumineux sous les rues. | Thèmes sombres seulement : sur fond clair, une note le signale. |
| Lignes d'eau gravées | Cinq contours parallèles autour des rives, comme sur les cartes gravées anciennes. | Carte ancienne. |
| Bâtiments pointillés | Points en quinconce sur les bâtiments. | Sans effet avec « Bâtiments en contour », qui l'emporte. |
| Parcs hachurés | Hachures croisées dans les parcs. | Le calque Parcs doit être affiché. |
| Surimpression riso | L'eau imprimée comme une plaque à part, décalée. | Thème Risographie. |

**Autour du repère**

* **Halo du souvenir** : la ville se dissout en s'éloignant du lieu.
* **Quartier en relief** : les rues proches prennent la couleur du repère.
* **Rayon autour du repère** (10 à 60 % de la largeur de la carte) : visible seulement avec l'un de ces deux effets.

**Ornements** : **Échelle graphique**, **Rose des vents**, **Graduations** (latitude et longitude au bord de la
carte).

**Calques** : **Parcs et espaces verts**, **Bâtiments**, **Voies ferrées**. Rues et eau sont toujours tracées.

**Personnaliser les couleurs** : douze teintes modifiables une à une (papier, terre, eau, parcs, bâtiments, rues
principales, rues secondaires, chemins, voies ferrées, texte, filets, repère).

**Mention complète des sources** : cochée par défaut, elle inscrit « © contributeurs OpenStreetMap » (et
« OpenFreeMap © OpenMapTiles » avec le moteur GPU). Décochée, une mention minimale (« © OpenStreetMap ») reste
toujours inscrite : les licences des données l'exigent.

### 7.6. Réglages dépendants

Un réglage qui n'a pas de sens dans le contexte est masqué (rayon sans halo, numérotation avec un seul lieu…). Un
réglage activé mais empêché par un autre choix reçoit une note d'une ligne et un bouton qui fait la bascule
(« Afficher les parcs », « Retirer le contour », « Voir les thèmes sombres »…). Cette bascule s'annule comme tout
autre changement.

---

## 8. Gabarits particuliers : Deux lieux, Ciel, Lettres

### 8.1. Deux lieux

Deux cartes sur la même affiche (par exemple « Notre rencontre » et « Notre mariage »), chacune avec son cadrage,
son repère, ses coordonnées et sa légende.

* Choisissez le lieu à modifier dans **Lieu › Lieu édité** (Lieu 1 / Lieu 2), ou touchez l'autre carte de
  l'affiche (bouton « Modifier le lieu 2 »). La recherche, le repère et le cadrage s'appliquent au lieu choisi.
* Les légendes se saisissent dans **Textes › Deux lieux**.
* Une seule carte est interactive à la fois ; l'autre est une image figée, redessinée quand ses réglages changent.
* Ce gabarit n'affiche qu'un repère par carte : ni lieux supplémentaires, ni itinéraire.
* Avec le moteur Fichier, la seconde carte n'affiche que les données importées : pour deux villes éloignées,
  préférez le moteur Vectoriel GPU.

### 8.2. Ciel du jour J

Un disque des étoiles visibles au-dessus du repère principal, à la date et à l'heure choisies, puis la carte en
bandeau et le texte. Les réglages sont dans **Style › Plus de réglages › Ciel du jour J** :

| Réglage | Valeur |
| :--- | :--- |
| Date et heure | Heure locale du lieu ; proposée d'après la date de l'affiche, à 22 h. |
| Fuseau horaire | Celui de l'appareil à cette date, ou de UTC−12 à UTC+14 par demi-heure. |
| Constellations, grille de repérage | Activées par défaut. |
| Lune et sa phase, planètes visibles | Activées par défaut (Mercure, Vénus, Mars, Jupiter, Saturne). |
| Voie lactée | Désactivée par défaut. |

Le nord est en haut et l'est à gauche, comme quand on lève les yeux. La Lune et les planètes ne sont dessinées
que si elles sont au-dessus de l'horizon.

> **Astuce** — Pour un ciel de naissance, saisissez l'heure exacte et choisissez le fuseau du lieu de naissance
> (et non celui de l'appareil) si vous préparez l'affiche depuis un autre pays.

### 8.3. Lettres

Le nom de la ville, en capitales géantes de la police du titre, est découpé dans la carte : la ville n'apparaît
qu'à travers les lettres. Dans l'aperçu, la carte se déplace sous les lettres. Les autres lignes sont dans le
cartouche, dessous. Un titre court (Paris, Lyon, Nice) donne les lettres les plus grandes.

---

## 9. Affiches illustrées

### 9.1. Le principe

L'application **ne génère pas d'image**. Elle rédige un **prompt** pour l'IA de votre choix (ChatGPT, Gemini…).
L'IA livre une illustration de la ville sans aucun texte ; vous l'importez, l'application la cadre, la retouche et
pose le titre avec de vraies polices. Aucune clé, aucun service tiers : le mode Illustration n'envoie aucune requête.

### 9.2. Étape « Prompt »

| Option | Valeurs |
| :--- | :--- |
| Pistes à proposer à l'IA | Facultatives, 8 au plus : saisies (« Château, port, vignobles… ») ou trouvées dans la carte. |
| Moment de la journée | Au choix, aube, matin, midi, couchant, nuit. |
| Saison | Au choix, printemps, été, automne, hiver. |
| Palette | Proposée par l'IA, thème de l'affiche, ou couleurs d'une photo. |
| Langue du prompt | Français ou English. |

**Trouver des pistes dans la carte** relève les monuments, cours d'eau, plans d'eau, sommets, parcs et paysages
autour du lieu, et en propose six. Touchez une piste pour l'ajouter. Avec le moteur Fichier, les pistes viennent
des données importées ; avec le moteur GPU, des tuiles de la carte (avec votre accord réseau).

Le prompt reprend le titre et le sous-titre de l'affiche, les proportions du format choisi et la position du
titre, où l'IA doit laisser une zone calme. Il interdit tout texte et toute marge, et demande à l'IA de vérifier
son image. **Copier le prompt**, collez-le dans votre IA, répondez à ses questions, puis touchez **« J'ai mon
image : l'importer »**.

> **Astuce** — Choisissez le format et l'orientation (onglet Export) *avant* de copier le prompt : les proportions
> demandées à l'IA en dépendent.

### 9.3. Étape « Image »

Quatre façons d'importer l'image : **glisser-déposer** sur la zone ou sur l'affiche, **Ctrl + V** (⌘ + V), bouton
**Coller l'image** (proposé quand le navigateur le permet ; il demande l'accès au presse-papiers), ou **Choisir un
fichier**. Formats : **PNG, JPEG ou WebP**, 40 Mo au plus, 64 px de côté au moins.

L'image est ré-encodée dans le navigateur : ses métadonnées, coordonnées GPS comprises, sont écartées. Elle reste
sur l'appareil.

**Qualité d'impression** : pour chaque format, l'application calcule la résolution effective selon le cadrage et
le zoom. Le format choisi est mis en avant.

| Note | A4, A3, 50 × 70 cm | 10 × 15 cm |
| :--- | :--- | :--- |
| Bonne | ≥ 200 ppp | ≥ 300 ppp |
| Juste | ≥ 140 ppp | ≥ 200 ppp |
| Insuffisante | en deçà | en deçà |

**Agrandir ×2 dans le navigateur** lisse l'image puis renforce légèrement ses contours, à l'export seulement. Cela
améliore la note, mais n'invente aucun détail.

**Cadrage** : **Remplir l'affiche** ou **Image entière** (bandes de la couleur du fond), zoom de 100 à 300 %,
déplacement en glissant l'image sur l'aperçu, **Recentrer**.

**Retouches** : luminosité, contraste et saturation (−50 à +50), **filtre vintage** (aucun, léger, marqué),
**Grain**, **Aplats** (couleurs réduites, effet sérigraphie). **Papier jauni** est rangé avec le papier, onglet
Style (§ 7.4).

Sur l'aperçu, les boutons flottants **+**, **−** et **Recentrer** agissent sur l'illustration. Sur téléphone,
l'image est verrouillée comme la carte : touchez-la (« Toucher pour cadrer ») pour la déplacer, puis **Terminer**.

**Remplacer** importe une autre image ; ✕ retire l'illustration (« Annuler » la retrouve).

### 9.4. Les textes d'une affiche illustrée

L'onglet Textes est le même que pour une affiche Carte (§ 6.1 à 6.7), et chaque réglage y agit de la même façon :
dédicace sur une ou deux lignes, taille de chaque ligne (date et coordonnées gardent chacune la leur), légende des
lieux numérotés en Carte + illustration. Chaque type d'affiche garde ses propres positions de textes. Sur une
affiche illustrée, le titre est **Vintage** par défaut (« Titre automatique », indiqué sous les polices du titre), avec une ombre à la couleur du papier, et il se place sur l'illustration. Sa position
est reprise dans le prompt, pour que l'IA laisse cette zone calme. Un chevauchement (bloc du bas sur le titre,
texte sur la carte) est permis, mais signalé.

L'onglet Style garde, sans carte, ce qui agit sur l'affiche : ambiances, thème (papier et couleur Auto des
textes), couleurs d'après l'illustration ou une photo, papier, plis et dorure.

L'onglet **Lieu** reste proposé (sans placement sur la carte ni zoom) : la ville et le lieu de rencontre donnent le
titre, les coordonnées inscrites sur l'affiche et les pistes que l'application lit autour du lieu pour le prompt.

### 9.5. Carte + illustration

L'onglet Illustration commence par une étape **Composition** :

| Composition | Disposition | Options |
| :--- | :--- | :--- |
| **Médaillon** | Illustration en pleine page, carte dans une forme. | Forme : rond, cœur, arche ; position : haut, centre, bas. |
| **Vignette** | Carte encadrée, illustration dans une arche en haut à droite, textes dans une bande sous la carte. | — |
| **Haut / bas** | Illustration en haut, carte en bas. | Moitié · moitié, ou deux tiers · un tiers. |
| **Côte à côte** | Illustration à gauche, carte à droite. | L'affiche passe en paysage ; une autre composition rend l'orientation d'avant. |
| **Fondu** | La carte émerge du bas de l'illustration. | — |

La phrase transmise au prompt pour cette composition est affichée. Pour accorder la carte à l'image : onglet Style,
**Couleurs d'après une image**, **L'illustration** (version claire ou sombre). Le bouton flottant **Carte / Image**
choisit le calque cadré : zoom, recentrage et mode Cadrer agissent alors sur la carte ou sur l'illustration (la
carte reste en place pendant que l'illustration est cadrée). À l'inverse, la palette « Thème de l'affiche » de l'étape
Prompt transmet les couleurs de la carte à l'IA.

Tous les réglages de la carte restent disponibles, sauf les ambiances et les gabarits, remplacés par la
composition. Gestes : en médaillon, glisser hors de la carte déplace l'image, dans la carte déplace la carte ; en
vignette, glisser sur l'arche déplace l'image.

### 9.6. Où est mon illustration ?

L'image est conservée dans le navigateur ; l'affiche n'en garde que la référence. Elle est retrouvée au
redémarrage, à la restauration d'une affiche et après « Annuler ». Elle peut manquer :

* sur un autre appareil ou un autre navigateur ;
* à l'ouverture d'un **lien partagé** (il ne contient jamais l'image) ;
* après un nettoyage du navigateur : Safari efface les données d'un site non installé après 7 jours sans visite.

L'application affiche alors « Illustration à importer » avec le nom et la taille de l'image attendue, et l'export
est désactivé. Réimportez la même image : elle est reconnue (« Illustration retrouvée »), et le cadrage et les
retouches sont conservés.

> **Astuce** — Pour garder une affiche illustrée en lieu sûr, téléchargez son fichier de configuration avec la case
> « Inclure les illustrations dans les fichiers » cochée (§ 10.3).

---

## 10. Onglet Export

### 10.1. Rendu

**Orientation** : portrait ou paysage, pour tous les gabarits. En paysage, la carte occupe la gauche et le texte une
colonne à droite.

**Format d'impression** et **type de fichier** :

| Format | Ordinateur | iPhone, iPad, Android |
| :--- | :--- | :--- |
| A4 (par défaut) | 2480 × 3508 px, 300 DPI | identique |
| A3 | 3508 × 4961 px, 300 DPI | 3391 × 4795 px, 290 DPI |
| 50 × 70 cm | 5315 × 7441 px, 270 DPI | 3346 × 4685 px, 170 DPI |
| 10 × 15 cm (tirage photo) | 1181 × 1772 px, 300 DPI | identique |

Sur les grands formats, la résolution est abaissée pour respecter la limite de mémoire des images de l'appareil ;
elle est annoncée sous le choix du format et sur le bouton d'export. 170 DPI suffisent pour une affiche de
50 × 70 cm regardée à plus d'un mètre. Une affiche plus grande montre la même zone, plus détaillée : rien n'est
agrandi.

* **Image PNG** : sans perte, avec sa résolution inscrite dans le fichier.
* **Document PDF** : une page à la taille exacte d'impression, contenant l'affiche en JPEG haute qualité.

**Zone de sécurité** : la case trace sur l'aperçu un pointillé à 5 mm du bord, la marge que la plupart des
imprimantes de bureau n'impriment pas. Il n'apparaît jamais dans l'export. Si un texte ou un repère y entre, une
alerte le nomme et conseille d'augmenter la marge. En 10 × 15 cm, la mention des sources y reste toujours : imprimez
« sans marge » sur papier photo, ou confiez le tirage à un laboratoire.

**Voir l'affiche au mur** : l'affiche dans un cadre (chêne, noir, blanc, doré), avec ou sans passe-partout, sur un
mur au choix (blanc cassé, sauge, terracotta, béton, nuit). L'image se télécharge.

### 10.2. Mes affiches

* **Enregistrer** : la configuration complète de l'affiche est gardée dans le navigateur, avec une vignette. Le nom
  proposé reprend le titre et les noms. **Ctrl + S** (⌘ + S) enregistre l'affiche en cours, depuis n'importe quel
  onglet. Enregistrer sous un nom existant met à jour cette affiche. 40 affiches au plus.
* **Restaurer** applique une affiche enregistrée ; « Annuler » ramène l'affiche en cours.
* **⤓** télécharge le fichier d'une affiche ; **✕** la supprime (deux appuis : « Supprimer ? »).

Une affiche enregistrée garde le lieu, le cadrage, les repères et l'itinéraire, les textes et leurs tailles, le
gabarit, les couleurs, les polices, les effets, les ornements, le papier, le ciel et les réglages de
l'illustration. Elle ne garde pas le moteur cartographique ni les données importées du moteur Fichier, à
réimporter.

### 10.3. Fichiers

| Bouton | Fichier produit |
| :--- | :--- |
| **Télécharger l'affiche en cours** | `affiche-<nom>.json` : configuration d'une affiche. |
| **Sauvegarder toutes mes affiches dans un fichier** | `mes-affiches-<date>.json` : sauvegarde complète. |
| **Ouvrir un fichier** | Une configuration est appliquée ; une sauvegarde complète est ajoutée à Mes affiches, sans doublon. |

Avec la case **Inclure les illustrations dans les fichiers** (cochée par défaut), les images voyagent avec le
fichier, plus lourd. Sans elle, il faudra réimporter les images sur l'autre appareil. Un fichier abîmé ou étranger
est refusé sans rien modifier.

> **Astuce** — Les affiches enregistrées restent dans ce seul navigateur. Faites de temps en temps une sauvegarde
> complète : c'est le seul moyen de les retrouver après un nettoyage du navigateur ou un changement d'appareil.

### 10.4. Partager par lien

**Copier le lien de l'affiche** encode toute l'affiche (sans le moteur) dans l'adresse elle-même : rien n'est
envoyé à un serveur. À l'ouverture du lien, l'affiche est reconstituée, et « Annuler » retrouve celle du
destinataire. Le lien contient le lieu et les textes : partagez-le avec des personnes de confiance. Un itinéraire
de plus de 400 points n'est pas inclus, et l'illustration jamais.

### 10.5. Exporter

Le bouton **Exporter l'affiche HD** indique les dimensions, le format, la résolution et le type de fichier.
L'affiche est entièrement recalculée à pleine résolution : elle est identique à l'aperçu, en plus net. Le
téléchargement démarre, puis un encart montre l'aperçu, le nom du fichier, la taille d'impression, les pixels, la
résolution, le poids et d'éventuels avertissements (tuiles manquantes, police de secours). Il propose
**Télécharger**, **Partager** (partage natif du téléphone) et **Masquer l'aperçu**.

Si le téléchargement ne démarre pas (sur certains téléphones), faites un appui long sur l'image, puis
« Enregistrer l'image ».

> **Astuce** — Pour imprimer chez vous, choisissez « Taille réelle » ou « 100 % » dans la fenêtre d'impression, et
> non « Ajuster à la page ».

Noms des fichiers : `affiche-carte-blois-300dpi.png` en A4, `affiche-carte-blois-a3-300dpi.pdf`,
`affiche-carte-blois-10x15-300dpi.png`… ; `affiche-illustration-…` pour une affiche illustrée.

---

## 11. Annuler, comparer, réinitialiser

### 11.1. Annuler / Rétablir

Jusqu'à 50 étapes, avec les boutons de la barre du bas ou au clavier. Les changements rapprochés (moins de 300 ms)
forment une seule étape. Le moteur cartographique n'entre pas dans l'historique, qui n'est pas conservé après un
rechargement. Ambiances, modèles, restaurations, liens ouverts et réinitialisation s'annulent tous.

### 11.2. Maintenir pour comparer

Après un changement de thème ou de palette, d'ambiance, de modèle de texte, d'effet, d'ornement, de plis ou de
papier, le bouton **« Maintenir pour comparer… »** apparaît au-dessus de la barre du bas (« … avec « Souvenir » »,
« … : avant l'ambiance « Soirée de gala » »…). Tant que vous le maintenez (souris, doigt, ou Espace / Entrée), l'affiche
montre l'état d'avant, avec un badge « Avant… » ; relâché, votre choix revient. Rien n'est enregistré pendant la
comparaison. Le bouton disparaît dès que vous modifiez de nouveau le même réglage ; un changement de titre ou de
cadrage ne l'efface pas.

### 11.3. Réinitialiser

Le lien **Réinitialiser** rétablit tous les réglages par défaut : lieu (Blois) et cadrage, gabarit, thème, couleurs,
repère, polices, textes, marge, épaisseurs et calques, et le moteur revient au Vectoriel GPU. Un premier appui
affiche « Confirmer ? » pendant 4 s ; un second réinitialise. Sont conservés : l'accord aux services tiers, les données
importées (repassez au moteur Fichier pour les retrouver), Mes affiches, les illustrations et la taille de
l'interface. « Annuler » revient en arrière (sauf pour le moteur).

---

## 12. Raccourcis clavier

| Touche | Action | Où |
| :--- | :--- | :--- |
| Ctrl / ⌘ + Z | Annuler | Hors des champs de texte |
| Ctrl / ⌘ + Maj + Z, Ctrl + Y | Rétablir | Hors des champs de texte |
| Ctrl / ⌘ + S | Enregistrer dans Mes affiches | Partout |
| Ctrl / ⌘ + V | Coller une illustration | Modes illustrés, hors des champs de texte |
| ← → / Début / Fin | Changer d'onglet | Sur la barre d'onglets |
| ↑ ↓ | Agrandir ou réduire le panneau | Sur la poignée (téléphone) |
| Flèches (Maj : × 5) | Déplacer la carte de 10 % (50 %) | Carte du moteur Fichier, atteinte par Tab |
| + / − | Zoomer d'un demi-cran | Carte du moteur Fichier |
| Entrée | Poser le repère au centre | Carte du moteur Fichier, en mode placement |
| Flèches (Maj : × 5), Origine, Échap | Déplacer un bloc de texte, revenir à la grille, sortir | Titre ou bloc du bas d'une affiche illustrée |
| Espace / Entrée maintenue | Comparer avant / après | Sur le bouton de comparaison |
| Échap | Fermer une fenêtre, la liste des résultats, ou l'affiche seule | — |

---

## 13. Vie privée, hors ligne et données conservées

**Ce qui part sur le réseau**, et seulement après votre accord :

| Service | Quand | Ce qu'il reçoit |
| :--- | :--- | :--- |
| OpenFreeMap | Affichage et export de la carte (moteur Vectoriel GPU) | Votre adresse IP et les zones de carte affichées |
| Nominatim | Chaque recherche d'adresse, et le diagnostic | Votre adresse IP et le texte recherché |

Rien d'autre ne quitte l'appareil : ni les photos (palette), ni les illustrations, ni les fichiers importés. Les
polices et la librairie cartographique sont servies par l'application elle-même.

**Ce que le navigateur conserve** (sur cet appareil seulement) :

| Donnée | Effacée par « Réinitialiser » |
| :--- | :--- |
| L'affiche en cours | Oui (remise aux valeurs par défaut) |
| Mes affiches (40 au plus) | Non |
| Les illustrations importées | Non ; les images qui ne servent plus à aucune affiche sont effacées automatiquement |
| L'accord aux services tiers | Non |
| Les préférences d'affichage (taille de l'interface, zone de sécurité, sections ouvertes) | Non |
| Les données importées du moteur Fichier | Non, mais elles ne sont pas conservées d'une visite à l'autre |

**Travailler sans réseau** : installez l'application lors d'une première visite en ligne, puis utilisez le moteur
Fichier avec un fichier déjà téléchargé. Le mode Illustration fonctionne aussi hors ligne.

---

## 14. Astuces

* **Commencer vite** : choisissez une ambiance, puis changez seulement le lieu et les textes.
* **Avant l'export final**, jetez un œil à l'onglet Textes : un texte réduit y est signalé en orange.
* **Un cadrage précis** : zoomez au maximum, posez le repère, puis dézoomez jusqu'au cadrage voulu. Le repère ne
  bouge pas avec la carte.
* **Comparer deux thèmes** : appliquez-en un, puis maintenez « Comparer » pour revoir le précédent.
* **Voir l'affiche comme imprimée** : bouton œil (« Voir l'affiche seule »), puis « Voir l'affiche au mur ».
* **Thèmes sombres** : ajoutez la Lueur ; sur papier sombre, la dorure ressort particulièrement.
* **Dédicace longue** : passez-la sur deux lignes plutôt que de réduire sa taille.
* **Couleurs d'un souvenir** : une photo du jour J dans « Couleurs d'après une image » donne une affiche unique.
* **Affiche illustrée** : choisissez le format avant de copier le prompt, et visez une note « Bonne » pour le format
  d'impression.
* **Garder ses affiches** : sauvegarde complète en fichier, illustrations incluses.
* **Offrir une affiche modifiable** : envoyez le lien, ou le fichier de configuration si elle est illustrée.
* **Choisir une ville proposée** recentre la carte et remplit le titre : faites-le avant de saisir vos textes. Avec
  le moteur Fichier, cela retire aussi les données importées.

---

## 15. Dépannage

| Symptôme | Cause probable | Solution |
| :--- | :--- | :--- |
| « Carte indisponible → Diagnostiquer » | Réseau absent ou filtré, service momentanément injoignable. | Touchez **Diagnostiquer** ; passez au moteur Fichier si OpenFreeMap reste injoignable. |
| « Page ouverte dans un aperçu intégré » | Le fichier a été ouvert depuis une messagerie ou une visionneuse, qui bloque le réseau et les téléchargements. | Ouvrez l'adresse dans le navigateur (Chrome, Safari, Firefox). |
| La carte reste vide avec le moteur Fichier | Aucun fichier importé (les données ne sont pas conservées d'une visite à l'autre). | **Lieu › Avancé › Importer un fichier de données**. |
| La mer n'apparaît pas (moteur Fichier) | Le moteur Fichier ne trace pas le trait de côte marin. | Utilisez le moteur Vectoriel GPU pour une ville côtière. |
| « Carte GPU suspendue » | Le téléphone a repris la mémoire graphique. | Patientez un instant : la carte revient seule, puis relancez l'export. |
| « Trop de recherches » | Limite du service Nominatim. | Attendez une minute, ou saisissez des coordonnées (§ 4.4). |
| Export désactivé (affiche illustrée) | Aucune illustration, ou illustration introuvable dans ce navigateur. | Importez ou réimportez l'image (§ 9.6). |
| Le téléchargement ne démarre pas | Navigateur mobile restrictif. | Appui long sur l'image de l'encart, puis « Enregistrer l'image » ; ou bouton **Partager**. |
| Résolution abaissée (A3, 50 × 70) | Limite de mémoire des images sur téléphone. | Exportez depuis un ordinateur pour obtenir la résolution maximale. |
| « ⚠ certaines tuiles ont pu manquer » | Connexion lente pendant l'export. | Relancez l'export. |
| « Police de secours » dans le résultat | Une police n'était pas chargée à temps. | Relancez l'export. |
| Le texte passe sous le bord à l'impression | Imprimante de bureau, marge non imprimable. | Activez la zone de sécurité (§ 10.1) et augmentez la marge. |
| Le lien partagé n'a pas l'illustration | Le lien ne contient jamais l'image. | Envoyez le fichier de configuration, illustrations incluses. |
| « Enregistrement impossible : espace du navigateur plein » | Trop d'affiches ou d'illustrations stockées. | Supprimez des affiches, après une sauvegarde complète. |

---

## Licences et attributions

Le code de l'application est sous licence MIT. Les données cartographiques sont © contributeurs OpenStreetMap
(ODbL) ; le schéma des tuiles est © OpenMapTiles (CC-BY 4.0), servi par OpenFreeMap. Les affiches produites
doivent porter l'attribution « © contributeurs OpenStreetMap », complétée de « OpenFreeMap © OpenMapTiles » avec le
moteur Vectoriel GPU : l'application l'inscrit par défaut, et une mention minimale reste toujours présente. Les
polices sont sous SIL Open Font License, et les données du ciel viennent de d3-celestial (BSD-3). Voir le
[README](README.md) pour le détail.
