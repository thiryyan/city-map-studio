# City Map Studio

Atelier web de création d'affiches cartographiques souvenir : tracé minimaliste des rues et des cours d'eau, repère discret sur le lieu d'une rencontre, export PNG A4 à 300 DPI (2480 × 3508 px).

- **100 % open source** : MapLibre GL JS, tuiles OpenFreeMap, Overpass API, Nominatim, polices SIL OFL. Aucune clé API.
- **Trois moteurs** : Vectoriel GPU (par défaut), Overpass (tracé artistique) et Fichier (hors ligne : JSON Overpass, `.osm`, GeoJSON).
- **Quatre gabarits** (Souvenir, Cadre classique, Fondu moderne, Médaillon), sept thèmes, cinq styles de repère, cinq familles de polices.
- **Un seul fichier** `index.html`, sans build, pensé d'abord pour le mobile.

## Utilisation
Ouvrir la version publiée sur GitHub Pages, ou servir le dépôt localement :
```bash
python3 -m http.server 8000   # puis http://localhost:8000
```
Ouvrir directement `index.html` en `file://` fonctionne aussi, mais certains serveurs Overpass refusent alors les requêtes.

## Documentation
- [Dossier technique](docs/dossier-technique.md) : exigences, architecture, rendu, export, tests et feuille de route.
- [Contribuer](CONTRIBUTING.md) : règles de développement et commandes de test.

## Licences
- Code de l'application : [MIT](LICENSE) © Thiryyan.
- MapLibre GL JS (`lib/`) : BSD-3-Clause (`lib/LICENSE-maplibre-gl.txt`).
- Données : © contributeurs OpenStreetMap, licence ODbL.
- Schéma des tuiles vectorielles : © OpenMapTiles, CC-BY 4.0 (tuiles servies par OpenFreeMap).
- Polices : SIL Open Font License 1.1.

Les affiches produites doivent porter l'attribution « © contributeurs OpenStreetMap », complétée de « OpenFreeMap © OpenMapTiles » avec le moteur Vectoriel GPU. L'application l'ajoute par défaut.
