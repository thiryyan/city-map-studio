# City Map Studio

Atelier web de création d'affiches cartographiques souvenir : tracé minimaliste des rues et des cours d'eau, repère discret sur le lieu d'une rencontre, export PNG ou PDF en A4 à 300 DPI (2480 × 3508 px), A3, 50 × 70 cm ou 10 × 15 cm (tirage photo).

- **100 % open source** : MapLibre GL JS, tuiles OpenFreeMap, Nominatim, polices SIL OFL auto-hébergées. Aucune clé API, aucun appel à Google.
- **Deux moteurs** : Vectoriel GPU (par défaut) et Fichier (hors ligne, tracé vectoriel au détail maximal : `.osm`, JSON OSM, GeoJSON).
- **Onze gabarits** (Souvenir, Cadre, Fondu, Médaillon, Cœur, Arche, Voyage, Polaroid, Deux lieux, Ciel, Lettres) en portrait ou paysage, seize thèmes et une palette tirée d'une photo, treize ambiances, dix repères, quatorze polices et sept duos, six papiers et des plis de carte dépliée.
- **Effets artistiques** : lueur, lignes d'eau gravées, motifs (eau hachurée, bâtiments pointillés, parcs hachurés), surimpression riso, trait crayon ; halo du souvenir et quartier en relief autour du lieu ; dorure ; échelle, rose des vents et graduations.
- **Affiche illustrée** : un mode Illustration pour une affiche de voyage façon vintage, et un mode Carte + illustration (carte en médaillon sur l'illustration, ou illustration en vignette sur la carte). L'application rédige le prompt à coller dans votre IA (ChatGPT, Gemini…), puis importe l'image obtenue, la cadre, la retouche (filtre vintage, grain) et pose un grand titre ; indicateur de qualité d'impression par format.
- **Plus que la carte** : jusqu'à trois lieux, itinéraire GPX, carte du ciel du jour J (Lune en phase, planètes, Voie lactée), aperçu au mur, partage par lien.
- **Mes affiches** : configurations enregistrées dans le navigateur (avec vignette), restaurées en un toucher et annulables ; fichier de configuration d'une affiche et sauvegarde complète à garder ou à ouvrir sur un autre appareil ; Ctrl + S.
- **Simple à développer** : HTML, CSS et JavaScript natifs (`index.html`, `css/`, `js/`), ouvrables tels quels ; le site publié est construit par `npm run build` (un script et une feuille minifiés), pensé d'abord pour le mobile.
- **Sûre, accessible, hors ligne** : politique de sécurité du contenu stricte, liens partagés validés, fenêtres et commandes accessibles au clavier ; installable, et utilisable sans réseau après une première visite (moteur Fichier).

## Utilisation
Ouvrir la version publiée sur GitHub Pages, ou servir le dépôt localement. Pendant la refonte ([#97](https://github.com/thiryyan/city-map-studio/issues/97)), la version de référence reste à l'adresse habituelle ; la version en cours de refonte est publiée sous `/nouvelle/`, et chaque pull request sous `/pr-N/` (dossier technique, § 7.6).

```bash
python3 -m http.server 8000   # puis http://localhost:8000
```
Ouvrir directement `index.html` en `file://` fonctionne aussi (scripts classiques, sans module ES), mais l'application n'est alors ni installable ni mise en cache.

## Documentation
- [Guide de l'utilisateur](USER_GUIDE.md) : toutes les fonctions, leurs options et des astuces.
- [Dossier technique](docs/dossier-technique.md) : exigences, architecture, rendu, export et tests.
- [Issues](https://github.com/thiryyan/city-map-studio/issues) : évolutions prévues et validations à mener.
- [Contribuer](CONTRIBUTING.md) : règles de développement et commandes de test.

## Licences
- Code de l'application : [MIT](LICENSE) © Contributeurs de City Map Studio.
- MapLibre GL JS (`lib/`) : BSD-3-Clause (`lib/LICENSE-maplibre-gl.txt`).
- Données : © contributeurs OpenStreetMap, licence ODbL.
- Schéma des tuiles vectorielles : © OpenMapTiles, CC-BY 4.0 (tuiles servies par OpenFreeMap).
- Polices (`lib/fonts/`) : SIL Open Font License 1.1, auto-hébergées (`OFL.txt` dans chaque dossier). Aucun appel à Google Fonts.
- Données du ciel (`lib/sky/`) : d3-celestial © Olaf Frohn, BSD-3-Clause (`lib/sky/LICENSE-d3-celestial.txt`), compilées depuis XHIP et les tracés de l'UAI ; Voie lactée d'après `mw.json` du même projet.

Les affiches produites doivent porter l'attribution « © contributeurs OpenStreetMap », complétée de « OpenFreeMap © OpenMapTiles » avec le moteur Vectoriel GPU. L'application l'ajoute par défaut.
