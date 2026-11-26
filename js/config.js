/* City Map Studio — Constantes et réglages (thèmes, polices, gabarits, état par défaut).
 * Script classique (pas de module ES : l'application s'ouvre aussi en file://), chargé dans l'ordre par index.html. */
'use strict';
/* =========================================================================
   City Map Studio — 100 % open source
   Licence MIT © Contributeurs de City Map Studio (cf. LICENSE)
   MapLibre GL JS (BSD-3) · OpenFreeMap (données OSM ODbL, schéma © OpenMapTiles CC-BY 4.0) · Nominatim
   ========================================================================= */

// ---------- Constantes ----------
const EXPORT_W = 2480, EXPORT_H = 3508;   // A4 à 300 DPI, en portrait ; inversé en paysage (posterDims)
// Formats d'impression : [clé, nom, petit côté, grand côté (mm)]. A4 et A3 ont le rapport √2 ; 50 × 70 cm, le rapport 7/5 ;
// 10 × 15 cm (tirage photo chez un labo, sans fond perdu), le rapport 3/2.
const FORMATS = [['a4','A4',210,297],['a3','A3',297,420],['50x70','50 × 70 cm',500,700],['10x15','10 × 15 cm',100,150]];
const EXPORT_MAX_DPI = 300;
// Surface maximale d'un canevas d'export : 16,7 Mpx sous Safari iOS (au-delà, le canevas reste vide) ; même prudence
// sur Android (mémoire) ; 40 Mpx ailleurs. La résolution d'un grand format est abaissée (par pas de 10 DPI) pour tenir.
const CANVAS_MAX_PX = (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1)) ? 16777216 : 40e6;
const GL_TILE_MAX = 4096;   // côté maximal d'un rendu WebGL (MapLibre) : au-delà, la carte est rendue en plusieurs tuiles
const REF_W = 800;               // largeur de référence du cadre carte (zoom de référence)
const MARKER_BASE = 0.055;       // 100 % = 5,5 % de la largeur de l'affiche
const GOLD = '#C5A059';
const OFM_URL = 'https://tiles.openfreemap.org/planet';
// Attribution déclarée sur la source du style (texte statique ; affichée sous l'aperçu par #mapCredit, la carte n'ayant pas de contrôle d'attribution)
const OFM_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles · Données © contributeurs OpenStreetMap';
const ML_VERSION = '4.7.1';
// lib/ : copie embarquée dans le dépôt (BSD-3, cf. lib/LICENSE-maplibre-gl.txt) ; les CDN restent en secours
// Empreintes SRI des fichiers 4.7.1 (identiques au paquet npm et à lib/) : un CDN qui servirait un autre contenu est refusé.
// À recalculer à chaque changement de version : openssl dgst -sha384 -binary lib/maplibre-gl.js | base64
const ML_SRI = {js:'sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj', css:'sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V'};
const ML_CDNS = ['lib/',`https://unpkg.com/maplibre-gl@${ML_VERSION}/dist/`,`https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VERSION}/dist/`,`https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/${ML_VERSION}/`];
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const STORE_KEY = 'cityMapStudio.v2';

const FONTS = {
  serif:{fam:'"Playfair Display", Georgia, "Times New Roman", serif', load:['400 20px "Playfair Display"','italic 400 20px "Playfair Display"']},
  // Garalde : élégance classique, italique calligraphique (petit œil : agrandie de 12 %, graisse 500 pour l'impression)
  garamond:{fam:'"Cormorant Garamond", Garamond, Georgia, serif', scale:1.12, weight:500, load:['500 20px "Cormorant Garamond"','italic 500 20px "Cormorant Garamond"']},
  // Géométrique Art déco : capitales élancées, esprit affiche de voyage
  deco:{fam:'"Josefin Sans", "Futura", "Century Gothic", sans-serif', scale:1.04, load:['400 20px "Josefin Sans"','italic 400 20px "Josefin Sans"']},
  sans:{fam:'Montserrat, "Helvetica Neue", Arial, sans-serif', load:['400 20px Montserrat','italic 400 20px Montserrat']},
  mono:{fam:'"Space Mono", "Courier New", monospace', load:['400 20px "Space Mono"','italic 400 20px "Space Mono"']},
  // Didone très contrastée : titres « magazine », luxe
  bodoni:{fam:'"Bodoni Moda", Didot, "Times New Roman", serif', load:['400 20px "Bodoni Moda"','italic 400 20px "Bodoni Moda"']},
  // Capitales fines et élancées (pas d'italique : penchée par le navigateur si besoin)
  italiana:{fam:'Italiana, Didot, Georgia, serif', scale:1.05, load:['400 20px Italiana']},
  // Serif douce et chaleureuse
  fraunces:{fam:'Fraunces, Georgia, serif', load:['400 20px Fraunces','italic 400 20px Fraunces']},
  // Géométrique façon Futura
  jost:{fam:'Jost, Futura, "Century Gothic", sans-serif', load:['400 20px Jost','italic 400 20px Jost']},
  // Linéale condensée, capitales seules : affiche de voyage
  bebas:{fam:'"Bebas Neue", Oswald, Impact, sans-serif', scale:1.18, load:['400 20px "Bebas Neue"']},
  // Calligraphie anglaise : dédicace et noms ; jamais en capitales ni espacée (script:true), petit œil compensé
  vibes:{fam:'"Great Vibes", "Brush Script MT", cursive', scale:1.4, script:true, load:['400 20px "Great Vibes"']},
  // Gravées : lettres des inscriptions et des cartes anciennes
  // Capitales romaines lapidaires (les minuscules sont des petites capitales ; pas d'italique : penchée par le navigateur si besoin)
  cinzel:{fam:'Cinzel, "Trajan Pro", Georgia, serif', load:['400 20px Cinzel']},
  // Romain du XVIIe siècle, encrage irrégulier : l'écriture des cartes anciennes, avec son italique
  fell:{fam:'"IM Fell English", Garamond, Georgia, serif', scale:1.05, load:['400 20px "IM Fell English"','italic 400 20px "IM Fell English"']},
  // Capitales évasées à la manière des inscriptions romaines, minuscules douces (pas d'italique)
  marcellus:{fam:'Marcellus, "Trajan Pro", Georgia, serif', load:['400 20px Marcellus']}
};
// Cartes de police : [clé, nom, catégorie]
const FONT_LIST=[['serif','Playfair','classique'],['garamond','Garamond','classique'],['bodoni','Bodoni','classique'],['italiana','Italiana','classique'],['fraunces','Fraunces','classique'],
  ['sans','Montserrat','moderne'],['jost','Jost','moderne'],['mono','Mono','moderne'],['deco','Art déco','affiche'],['bebas','Bebas','affiche'],['vibes','Calligraphie','manuscrite'],
  ['cinzel','Cinzel','gravure'],['fell','Fell','gravure'],['marcellus','Marcellus','gravure']];
const FONT_CATS=[['','Toutes'],['classique','Classiques'],['moderne','Modernes'],['manuscrite','Manuscrites'],['affiche','Affiche'],['gravure','Gravées']];
// Duos typographiques : [clé, nom, police du titre, police du texte]
const DUOS=[['origine','Origine','serif','serif'],['mariage','Mariage','italiana','vibes'],['voyage','Voyage','bebas','jost'],['classique','Classique','bodoni','garamond'],
  ['moderne','Moderne','jost','jost'],['chaleureux','Chaleureux','fraunces','sans'],['cartographe','Cartographe','cinzel','fell']];

const COLOR_LABELS = {paper:'Papier',land:'Terre',water:'Eau',park:'Parcs',building:'Bâtiments',roadMajor:'Rues principales',roadMinor:'Rues secondaires',path:'Chemins',rail:'Voies ferrées',text:'Texte',frame:'Filets',marker:'Repère'};
const THEMES = {
  souvenir:{cat:'clair',name:'Souvenir',c:{paper:'#FFFFFF',land:'#F2F2F2',water:'#C9D9DE',park:'#E2E2E2',building:'#D8D8D8',roadMajor:'#111111',roadMinor:'#4A4A4A',path:'#8E8E8E',rail:'#9A9A9A',text:'#111111',frame:'#111111',marker:'#D0312D'}},
  galerie:{cat:'clair',name:'Galerie Or & Noir',c:{paper:'#FFFFFF',land:'#FFFFFF',water:'#E9DDBF',park:'#F1F1F1',building:'#ECECEC',roadMajor:'#18181B',roadMinor:'#3F3F46',path:'#8A8A93',rail:'#A1A1AA',text:'#18181B',frame:'#C5A059',marker:'#C5A059'}},
  onyx:{cat:'sombre',name:'Prestige Onyx & Or',c:{paper:'#0F1115',land:'#0F1115',water:'#2A2415',park:'#16171C',building:'#1A1B21',roadMajor:'#D4AF37',roadMinor:'#8C7A3E',path:'#5E5432',rail:'#6B5E33',text:'#F3E5AB',frame:'#D4AF37',marker:'#F3E5AB'}},
  blanc:{cat:'clair',name:'Blanc minimaliste',c:{paper:'#FFFFFF',land:'#FFFFFF',water:'#E5E7EB',park:'#F3F4F6',building:'#EEEEEE',roadMajor:'#111111',roadMinor:'#3A3A3A',path:'#9CA3AF',rail:'#9CA3AF',text:'#111111',frame:'#111111',marker:'#111111'}},
  creme:{cat:'clair',name:'Crème & Encre',c:{paper:'#F4EFE6',land:'#F4EFE6',water:'#D6E0E2',park:'#E9E3D6',building:'#E6DFD2',roadMajor:'#2C2A29',roadMinor:'#57534E',path:'#A8A29E',rail:'#A8A29E',text:'#2C2A29',frame:'#2C2A29',marker:'#C5A059'}},
  nuit:{cat:'sombre',name:'Nuit boréale',c:{paper:'#0B192C',land:'#0B192C',water:'#1E3E62',park:'#10213A',building:'#132640',roadMajor:'#E2E8F0',roadMinor:'#94A3B8',path:'#475569',rail:'#64748B',text:'#E2E8F0',frame:'#D4AF37',marker:'#D4AF37'}},
  sepia:{cat:'couleur',name:'Sépia vintage',c:{paper:'#EFE6D5',land:'#EFE6D5',water:'#DFD2B8',park:'#E6DCC6',building:'#E2D6BF',roadMajor:'#433422',roadMinor:'#6B5A43',path:'#A8957A',rail:'#A8957A',text:'#433422',frame:'#433422',marker:'#8B2635'}}
};

Object.assign(THEMES,{
  sauge:{cat:'couleur',name:'Sauge',c:{paper:'#EEF1EA',land:'#EEF1EA',water:'#C8D6CF',park:'#DCE5D6',building:'#E2E7DE',roadMajor:'#34473B',roadMinor:'#5E6F62',path:'#9AA89C',rail:'#9AA89C',text:'#34473B',frame:'#34473B',marker:'#B5654B'}},
  terracotta:{cat:'couleur',name:'Terracotta',c:{paper:'#F4EADF',land:'#F4EADF',water:'#B9CFCB',park:'#EADCCB',building:'#EBDDCF',roadMajor:'#7A3B26',roadMinor:'#9C6248',path:'#C4A28E',rail:'#C4A28E',text:'#5A2A1A',frame:'#C96A3D',marker:'#C96A3D'}},
  rose:{cat:'couleur',name:'Rose poudré',c:{paper:'#F8EEEC',land:'#F8EEEC',water:'#E2D3D6',park:'#F0E2E0',building:'#EFE3E1',roadMajor:'#5E4447',roadMinor:'#846A6D',path:'#B9A3A5',rail:'#B9A3A5',text:'#5E4447',frame:'#C5A059',marker:'#C98A8E'}},
  automne:{cat:'couleur',name:'Automne',c:{paper:'#F2E6D0',land:'#F2E6D0',water:'#CFD8D3',park:'#E6D9BE',building:'#E8DCC4',roadMajor:'#3B2F2A',roadMinor:'#6A5A50',path:'#A8988A',rail:'#A8988A',text:'#3B2F2A',frame:'#B07A1E',marker:'#C2861F'}},
  marine:{cat:'clair',name:'Marine',c:{paper:'#F1ECE2',land:'#F1ECE2',water:'#D5DCE4',park:'#E6E2D6',building:'#E7E1D5',roadMajor:'#14284B',roadMinor:'#3E5274',path:'#98A3B4',rail:'#98A3B4',text:'#14284B',frame:'#14284B',marker:'#C0392B'}},
  encre:{cat:'clair',name:'Encre de Chine',c:{paper:'#FFFFFF',land:'#FFFFFF',water:'#111111',park:'#E5E5E5',building:'#EDEDED',roadMajor:'#000000',roadMinor:'#1A1A1A',path:'#6B6B6B',rail:'#6B6B6B',text:'#000000',frame:'#000000',marker:'#D0312D'}},
  plan:{cat:'sombre',name:'Plan d\'architecte',c:{paper:'#1F3A5F',land:'#1F3A5F',water:'#2C4F7C',park:'#24436B',building:'#284A73',roadMajor:'#E8F1FA',roadMinor:'#A9C1DA',path:'#6F8DB0',rail:'#6F8DB0',text:'#E8F1FA',frame:'#E8F1FA',marker:'#FFD166'}},
  riso:{cat:'couleur',name:'Risographie',c:{paper:'#F3EEE3',land:'#F3EEE3',water:'#FF6C9C',park:'#E9E3D4',building:'#E7E0D1',roadMajor:'#0078BF',roadMinor:'#3A8FCB',path:'#8DB8DA',rail:'#8DB8DA',text:'#005A92',frame:'#FF6C9C',marker:'#FF6C9C'}},
  neon:{cat:'sombre',name:'Néon',c:{paper:'#120B24',land:'#120B24',water:'#1E1440',park:'#170F2E',building:'#1B1236',roadMajor:'#FF4FD8',roadMinor:'#9B5DE5',path:'#4B3A78',rail:'#4B3A78',text:'#F5E9FF',frame:'#36E3FF',marker:'#36E3FF'}}
});
const THEME_CATS=[['','Tous'],['clair','Clairs'],['sombre','Sombres'],['couleur','Couleurs']];

const LAYOUTS = [['souvenir','Souvenir'],['classic','Cadre'],['fade','Fondu'],['medallion','Médaillon'],['heart','Cœur'],['arch','Arche'],['travel','Voyage'],['polaroid','Polaroid'],['diptych','Deux lieux'],['sky','Ciel'],['typo','Lettres']];
const MARKERS = [['heartGeo','Cœur géo.'],['dot','Point'],['heart','Cœur'],['ring','Anneau'],['pin','Épingle'],['star','Étoile'],['house','Maison'],['rings','Alliances'],['anchor','Ancre'],['feet','Petits pieds']];
// Papier : texture générée par le code (aucune image), appliquée à l'aperçu et à l'export
const TEXTURES=[['none','Lisse'],['grain','Grain'],['aquarelle','Aquarelle'],['kraft','Kraft'],['toile','Toile'],['ancien','Ancien']];
// Ambiances : thème + duo de polices + gabarit + repère (+ papier, effets fx, ornements orn, plis) ; les textes et le lieu sont conservés
const AMBIANCES=[
  ['mariage','Mariage doré',{theme:'galerie',fontTitle:'italiana',font:'vibes',layout:'heart',markerStyle:'rings',texture:'none'}],
  ['naissance','Naissance sauge',{theme:'sauge',fontTitle:'fraunces',font:'fraunces',layout:'arch',markerStyle:'feet',texture:'grain'}],
  ['voyage','Carnet de voyage',{theme:'terracotta',fontTitle:'bebas',font:'jost',layout:'travel',markerStyle:'pin',texture:'kraft',fx:{pencil:true}}],
  ['plan','Plan d\'architecte',{theme:'plan',fontTitle:'mono',font:'mono',layout:'classic',markerStyle:'dot',texture:'none',fx:{outline:true}}],
  ['nuit','Nuit en ville',{theme:'neon',fontTitle:'bebas',font:'jost',layout:'fade',markerStyle:'ring',texture:'none',fx:{glow:true}}],
  ['mer','Bord de mer',{theme:'marine',fontTitle:'italiana',font:'jost',layout:'polaroid',markerStyle:'anchor',texture:'toile'}],
  ['encre','Encre de Chine',{theme:'encre',fontTitle:'bodoni',font:'garamond',layout:'medallion',markerStyle:'heartGeo',texture:'aquarelle',fx:{hatch:true}}],
  ['ancienne','Carte ancienne',{theme:'sepia',fontTitle:'garamond',font:'garamond',layout:'classic',markerStyle:'star',texture:'ancien',folds:true,fx:{waterlines:true,parkHatch:true},orn:{scale:true,compass:true,grid:true}}],
  ['gala','Soirée de gala',{theme:'onyx',fontTitle:'italiana',font:'garamond',layout:'medallion',markerStyle:'rings',texture:'none',fx:{foil:true,glow:true}}],
  ['riso','Risographie',{theme:'riso',fontTitle:'bebas',font:'jost',layout:'travel',markerStyle:'pin',texture:'grain',fx:{riso:true,dots:true}}],
  ['lettres','Lettres de ville',{theme:'creme',fontTitle:'bebas',font:'jost',layout:'typo',markerStyle:'dot',texture:'grain'}],
  ['quartier','Notre quartier',{theme:'souvenir',fontTitle:'',font:'garamond',layout:'classic',markerStyle:'heart',texture:'none',fx:{halo:true,quarter:true}}],
  ['souvenir','Souvenir',{theme:'souvenir',fontTitle:'',font:'serif',layout:'souvenir',markerStyle:'heart',texture:'none'}]
];
// Modèles de texte par occasion : la dédicace change ; les noms seulement s'ils sont encore ceux de l'exemple
const OCCASIONS=[
  ['rencontre','Rencontre','Là où tout a commencé','Alice & Mathias'],
  ['mariage','Mariage','Le plus beau jour de notre vie','Alice & Mathias'],
  ['naissance','Naissance','Bienvenue, petit trésor','Léa'],
  ['maison','Maison','Bienvenue à la maison','Famille Martin'],
  ['voyage','Voyage','Le voyage d\'une vie','Alice & Mathias'],
  ['anniversaire','Anniversaire','Dix ans, et toujours ici','Alice & Mathias']
];
const MARKER_COLORS = [['Or','#C5A059'],['Rouge','#D0312D'],['Noir','#111111'],['Blanc','#FFFFFF']];

const PRESETS = [
  ['Blois · Loire',47.5861,1.3359,14,'Blois','Val de Loire • France'],
  ['Paris · Seine',48.8566,2.3470,13.6,'Paris','Île-de-France • France'],
  ['Venise · Lagune',45.4380,12.3300,13.6,'Venezia','Vénétie • Italie'],
  ['New York',40.7580,-73.9855,13.2,'New York','Manhattan • USA'],
  ['Bordeaux · Garonne',44.8410,-0.5700,13.6,'Bordeaux','Gironde • France'],
  ['Périgueux · Isle',45.1843,0.7215,14,'Périgueux','Périgord • France']
];

// Hiérarchie routière (largeur de base en px pour un cadre de 800 px)
const ROADS = [
  ['path',0.45,'path'],['service',0.55,'roadMinor'],['minor',0.9,'roadMinor'],['tertiary',1.3,'roadMinor'],
  ['secondary',1.8,'roadMajor'],['primary',2.4,'roadMajor'],['trunk',2.8,'roadMajor'],['motorway',3.2,'roadMajor']
];
const HW_CLASS = {motorway:'motorway',motorway_link:'motorway',trunk:'trunk',trunk_link:'trunk',primary:'primary',primary_link:'primary',
  secondary:'secondary',secondary_link:'secondary',tertiary:'tertiary',tertiary_link:'tertiary',residential:'minor',living_street:'minor',
  unclassified:'minor',service:'service',footway:'path',path:'path',cycleway:'path',steps:'path',track:'path',pedestrian:'path'};
const WATERWAY_W = {river:3,canal:2,stream:0.8};

// ---------- État ----------
const DEFAULT_STATE = {
  engine:'maplibre', layout:'souvenir', theme:'souvenir', colors:{...THEMES.souvenir.c},
  center:{lat:47.5861,lon:1.3359}, zoom:14, marker:{lat:47.5861,lon:1.3359},
  markerStyle:'heart', markerFill:true, markerSize:100, markerOpacity:1,
  coordFormat:'dec', coordsManual:'',
  texts:{title:'Blois',subtitle:'Val de Loire • France',dedication:'Là où tout a commencé',names:'Alice & Mathias',date:'Le 23 septembre 2023',label1:'Notre rencontre',label2:'Notre mariage'},
  show:{title:true,subtitle:true,coords:true,dedication:true,names:true,date:true},   // lignes de texte affichées
  textScale:{title:100,subtitle:100,coords:100,dedication:100,names:100,date:100},   // taille de chaque ligne (%)
  textScaleAll:100,                                                                  // taille de tous les textes (%)
  font:'serif', margin:6.5, stroke:1, waterMult:1, ring:true, attribution:true,
  layers:{parks:true,buildings:true,rail:true},
  fontTitle:'',                 // police du titre ('' : celle du texte)
  orient:'portrait',            // 'portrait' | 'landscape'
  format:'a4',                  // format d'impression (FORMATS)
  fileType:'png',               // fichier exporté : 'png' | 'pdf'
  dedWrap:'auto',               // dédicace : 'auto' (deux lignes si elle serait trop réduite) | 'one' | 'two'
  lineOrder:null,               // ordre des lignes : null = celui du gabarit, sinon permutation de LINE_KEYS (CMS.order)
  texture:'none',               // papier (TEXTURES)
  markers2:[], markerLabel:'', numbered:false, linkMarkers:false,   // lieux supplémentaires (2 au plus)
  route:null,                   // itinéraire importé : {name, pts:[[lat,lon],…], show}
  routeStyle:{color:'marker',width:1,dash:false},
  active:0, place2:null,        // gabarit « Deux lieux » : vue éditée (0 ou 1) et l'autre vue {center, zoom, marker}
  sky:{when:'',tz:'auto',lines:true,grid:true,moon:true,planets:true,milky:false},  // gabarit « Ciel » : date et heure locales, fuseau (minutes ou 'auto'), Lune, planètes, Voie lactée
  // effets de tracé : eau hachurée, bâtiments en contour, trait crayon ; lueur, lignes d'eau, bâtiments pointillés, parcs hachurés,
  // surimpression riso ; autour du repère : halo et quartier en relief ; dorure des textes, filets et repères
  fx:{hatch:false,outline:false,pencil:false,glow:false,waterlines:false,dots:false,parkHatch:false,riso:false,halo:false,quarter:false,foil:false},
  focusR:30,                    // rayon du halo et du quartier en relief (% de la largeur de la carte)
  orn:{scale:false,compass:false,grid:false},     // ornements : échelle graphique, rose des vents, graduations
  folds:false,                  // papier : plis d'une carte dépliée
  mode:'map',                   // type d'affiche : 'map' (carte) | 'illus' (illustration importée, cf. js/illus.js) | 'mix' (carte + illustration)
  mix:{compo:'med',shape:'circle',pos:'bas',split:'half'},   // carte + illustration : composition (médaillon, vignette, haut/bas, côte à côte, fondu), forme et position du médaillon, partage haut/bas
  // Illustration : cadrage (zoom en %, décalage en fraction de l'affiche), retouches, filtre vintage, choix du prompt.
  // L'image elle-même n'est pas dans l'état (trop lourde) : elle est tenue par CMS.illus.
  illus:{fit:'cover',zoom:100,ox:0,oy:0,bright:0,contrast:0,satur:0,vintage:'none',grain:false,paper:false,flat:false,upscale:false,
    img:null,   // image importée : {ref (empreinte SHA-256), name, w, h} ; l'image est dans IndexedDB (js/illus.js)
    prompt:{pistes:[],moment:'any',saison:'any',palette:'ia',lang:'fr'}},
  // Style des textes, commun aux trois types d'affiche (#71) : style du titre, couleurs (ombre et contour : '' = aucun), décalage de l'ombre.
  // 'auto' : valeur propre au type d'affiche (CMS.illus.textStyle) : titre Police en Carte, Vintage sinon ; lettres à la couleur
  // Texte du thème ; ombre aucune en Carte, couleur du papier sinon. v : version (2 : valeurs Auto ; cf. migration de normState).
  // Positions des modes illustrés : pos (9 positions, ILLUS_POS) ; free / ffree : position libre (glissée) du bloc de titre / du bloc
  // du bas, centre en fraction de la zone des textes ({x, y}) ou null ; fpos : bloc du bas (dédicace, noms, date, coordonnées) :
  // 'auto' (côté opposé au titre) ou une des 9 positions. map : mêmes champs pour le mode Carte, où 'auto' = dans le gabarit (#75) ;
  // mix : mêmes champs pour le mode Carte + illustration (#77). Chaque type d'affiche garde ainsi ses propres positions.
  // deco : présentation de chaque bloc (#86), propre à chaque type d'affiche : 'libre' (texte seul), 'cartouche', 'bandeau',
  // 'etiquette', 'filets', et pour le titre seulement 'capsule', 'arc' (autour de la carte en forme), 'cachet', 'vertical' (DECOS,
  // FOOT_DECOS ; le 'ruban' d'avant #90 devient 'capsule'). ftpl : mise en forme du bloc du bas (FOOT_TPLS, #90).
  // mix.zone : zone de chaque bloc en Carte + illustration (#86) : 'illus' (l'illustration ; la bande de la vignette), 'map', 'poster'.
  illusText:{v:2,style:'auto',color:'auto',shadow:'auto',outline:'',off:4,pos:'hc',free:null,fpos:'auto',ffree:null,
    deco:{title:'libre',foot:'libre'},
    // trait des plaques (cartouche, bandeau, étiquette, capsule, filets) : style (PLATE_LINES), épaisseur (× 0,5 à 3), couleur ('auto' =
    // encre de la plaque), éloignement entre le trait et le texte (gap, × 0,5 à 2,5 ; #90)
    // fond des plaques à fond papier (cartouche, bandeau, étiquette) : couleur ('auto' = papier) et opacité (0 à 1)
    plate:{line:'solid',w:1,color:'auto',gap:1,fill:'auto',alpha:0.92},
    ftpl:'classique',
    map:{pos:'auto',free:null,fpos:'auto',ffree:null,deco:{title:'libre',foot:'libre'},ftpl:'classique'},
    mix:{pos:'hc',free:null,fpos:'auto',ffree:null,deco:{title:'libre',foot:'libre'},zone:{title:'illus',foot:'illus'},ftpl:'classique'}}   // Carte + illustration : positions propres (#77)
};
// Modes illustrés : listes de valeurs (aussi utilisées par normState pour valider un état venu de l'extérieur)
CMS.define('illusConf', () => ({
  MODES:['map','illus','mix'],
  // mode Carte + illustration : compositions, forme et position du médaillon
  COMPOS:['med','vig','hb','cote','fondu'], SHAPES:['circle','heart','arch'], MPOS:['haut','centre','bas'], SPLITS:['half','two'],
  // positions du bloc de titre : h/m/b (haut, milieu, bas) × g/c/d (gauche, centre, droite)
  POS:['hg','hc','hd','mg','mc','md','bg','bc','bd'],
  // présentations des blocs de texte (#86) : toutes pour le titre, les trois premières pour le bloc du bas ; zones (Carte + illustration)
  DECOS:['libre','cartouche','bandeau','etiquette','capsule','filets','arc','cachet','vertical'], PLATE_LINES:['solid','double','dashed','dotted','none'],
  FOOT_DECOS:['libre','cartouche','bandeau','etiquette','filets'], FOOT_TPLS:['classique','ligne','souvenir','carnet','colonnes'], ZONES:['illus','map','poster'],
  MOMENTS:[['any','Au choix','any time'],['aube','Aube','dawn'],['matin','Matin','morning'],['midi','Midi','midday'],['couchant','Couchant','sunset'],['nuit','Nuit','night']],
  SAISONS:[['any','Au choix','any season'],['printemps','Printemps','spring'],['ete','Été','summer'],['automne','Automne','autumn'],['hiver','Hiver','winter']],
  PALETTES:['ia','theme','photo'], LANGS:['fr','en'], VINTAGE:['none','light','strong'], FITS:['cover','contain'], TSTYLES:['auto','vintage','font'],
  PISTES_MAX:8
}));
// ---------- Ordre des lignes de texte (Textes, Plus de réglages) ----------
// st.lineOrder : null (ordre du gabarit) ou permutation de KEYS. Appliqué au cartouche des gabarits centrés et, dans
// chaque bloc, aux mises en page des modes illustrés (titre et sous-titre ; dédicace, noms, date · coordonnées).
CMS.define('order', () => {
  const KEYS=['title','subtitle','coords','dedication','names','date'];
  /** Ordre valide (permutation complète de KEYS) ou null */
  const norm=v=>Array.isArray(v) && v.length===KEYS.length && KEYS.every(k=>v.includes(k)) ? [...v] : null;
  /** Clés triées selon l'ordre choisi (tri stable ; une clé hors de KEYS, comme la légende, reste en fin) ; sans ordre : inchangées */
  function sort(keys, s=st){
    const O=s.lineOrder; if(!O) return keys;
    const r=k=>{ const i=O.indexOf(k); return i<0 ? 99 : i; };
    return keys.map((k,i)=>[k,i]).sort((a,b)=>r(a[0])-r(b[0]) || a[1]-b[1]).map(x=>x[0]);
  }
  /** Ordre affiché : celui choisi, sinon celui du gabarit (Polaroid : dédicace en tête ; modes illustrés : titre, puis bloc du bas) */
  function current(s=st){
    if(s.lineOrder) return [...s.lineOrder];
    if(s.mode==='map' && s.layout==='polaroid') return ['dedication','names','title','date','coords','subtitle'];
    if(s.mode!=='map') return ['title','subtitle','dedication','names','date','coords'];
    return [...KEYS];
  }
  return {KEYS, norm, sort, current};
});
