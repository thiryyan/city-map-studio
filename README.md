# City Map Studio

Atelier web de création d'affiches cartographiques souvenir : tracé minimaliste des rues et des cours d'eau, repère discret sur le lieu d'une rencontre, export PNG A4 à 300 DPI (2480 × 3508 px).

- **100 % open source** : MapLibre GL JS, tuiles OpenFreeMap, Overpass API, Nominatim, polices SIL OFL auto-hébergées. Aucune clé API, aucun appel à Google.
- **Trois moteurs** : Vectoriel GPU (par défaut), Overpass (tracé artistique) et Fichier (hors ligne : JSON Overpass, `.osm`, GeoJSON).
- **Dix gabarits** (Souvenir, Cadre, Fondu, Médaillon, Cœur, Arche, Voyage, Polaroid, Deux lieux, Ciel) en portrait ou paysage, quinze thèmes, huit ambiances, dix repères, onze polices en duos, quatre papiers.
- **Plus que la carte** : jusqu'à trois lieux, itinéraire GPX, carte du ciel du jour J, aperçu au mur, partage par lien.
- **Un seul fichier** `index.html`, sans build, pensé d'abord pour le mobile.

## Utilisation
Ouvrir la version publiée sur GitHub Pages, ou servir le dépôt localement :
```bash
python3 -m http.server 8000   # puis http://localhost:8000
```
Ouvrir directement `index.html` en `file://` fonctionne aussi, mais certains serveurs Overpass refusent alors les requêtes.

## Documentation
- [Dossier technique](docs/dossier-technique.md) : exigences, architecture, rendu, export et tests.
- [Issues](https://github.com/thiryyan/city-map-studio/issues) : évolutions prévues et validations à mener.
- [Contribuer](CONTRIBUTING.md) : règles de développement et commandes de test.

## Licences
- Code de l'application : [MIT](LICENSE) © Contributeurs de City Map Studio.
- MapLibre GL JS (`lib/`) : BSD-3-Clause (`lib/LICENSE-maplibre-gl.txt`).
- Données : © contributeurs OpenStreetMap, licence ODbL.
- Schéma des tuiles vectorielles : © OpenMapTiles, CC-BY 4.0 (tuiles servies par OpenFreeMap).
- Polices (`lib/fonts/`) : SIL Open Font License 1.1, auto-hébergées (`OFL.txt` dans chaque dossier). Aucun appel à Google Fonts.
- Données du ciel (`lib/sky/`) : d3-celestial © Olaf Frohn, BSD-3-Clause (`lib/sky/LICENSE-d3-celestial.txt`), compilées depuis XHIP et les tracés de l'UAI.

Les affiches produites doivent porter l'attribution « © contributeurs OpenStreetMap », complétée de « OpenFreeMap © OpenMapTiles » avec le moteur Vectoriel GPU. L'application l'ajoute par défaut.
