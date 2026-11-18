"""Génère tests/city.json : une ville fictive mais réaliste pour le moteur Fichier (JSON OSM, nœuds partagés).

« Ville-sur-Loire », centrée sur la vue par défaut (Blois) et longue de 6,4 km sur 5,2 km :
- un fleuve large et sinueux (multipolygone en plusieurs morceaux, deux îles, axe `waterway=river`),
  un affluent sinueux (`stream`), un canal, un étang ;
- une vieille ville radioconcentrique (rues rayonnantes, boulevards circulaires, ruelles, rues piétonnes, escaliers),
  des quartiers en damier d'orientations différentes, un lotissement à rues courbes et impasses ;
- des quais, trois ponts routiers et un pont ferroviaire, une rocade (autoroute, bretelles, voie rapide),
  une voie ferrée avec une branche et un tunnel, un passage routier en tunnel ;
- des parcs (jardin des quais, grand parc avec étang, île-jardin), une forêt, des chemins ;
- plusieurs milliers de bâtiments alignés sur les rues (rangs serrés au centre, pavillons, entrepôts).

Déterministe (graine fixe) : mêmes données à chaque exécution. Format « nœuds + chemins à références »
(comme un export Overpass `out body`), qui exerce aussi l'assemblage des géométries (normalizeElements, stitch).
Écrit aussi tests/city.meta.json : points de contrôle (milieu du fleuve, milieu d'un pont, centre-ville) pour les tests.

    python tests/make_city.py
"""
import json, math, random, pathlib

T = pathlib.Path(__file__).resolve().parent
LAT0, LON0 = 47.5861, 1.3359              # vue par défaut de l'application
X0, X1, Y0, Y1 = -3200, 3200, -2600, 2600  # emprise en mètres (x vers l'est, y vers le nord)
KY = 111320.0; KX = KY * math.cos(math.radians(LAT0))
rnd = random.Random(20231114)

def ll(x, y): return (round(LAT0 + y / KY, 7), round(LON0 + x / KX, 7))

# ---------- Éléments OSM ----------
nodes, ways, rels = {}, [], []
nid, wid = [0], [0]
def node(x, y):
    k = ll(x, y)
    if k not in nodes: nid[0] += 1; nodes[k] = nid[0]
    return nodes[k]
def way(pts, tags, closed=False):
    if len(pts) < 2: return None
    refs = [node(x, y) for x, y in pts]
    if closed and refs[0] != refs[-1]: refs.append(refs[0])
    refs = [r for i, r in enumerate(refs) if i == 0 or r != refs[i - 1]]
    if len(refs) < 2: return None
    wid[0] += 1; ways.append({'type': 'way', 'id': wid[0], 'nodes': refs, 'tags': tags}); return wid[0]

# ---------- Fleuve ----------
def yc(x): return -250 + 180 * math.sin(x / 900) + 70 * math.sin(x / 310 + 1.3)
def wr(x): return 260 + 60 * math.sin(x / 700 + 0.5)
def north(x): return yc(x) + wr(x) / 2
def south(x): return yc(x) - wr(x) / 2
ISLANDS = [(-1450, -700, 0.42, 0.10), (950, 1500, 0.36, -0.12)]   # x début, x fin, largeur relative, décalage
def island_half(x, i):
    a, b, f, o = ISLANDS[i]
    if not a < x < b: return None
    t = (x - a) / (b - a); h = f * wr(x) / 2 * math.sin(math.pi * t) ** 0.8
    return yc(x) + o * wr(x), h
POND = (-80, -1500, 120, 70)   # étang du grand parc : centre, demi-axes
def in_water(x, y, m=0):
    if south(x) - m < y < north(x) + m:
        for i in range(len(ISLANDS)):
            r = island_half(x, i)
            if r and abs(y - r[0]) < r[1] - m: return False
        return True
    cx, cy, a, b = POND
    return ((x - cx) / (a + m)) ** 2 + ((y - cy) / (b + m)) ** 2 < 1

def river():
    xs = list(range(X0, X1 + 1, 40))
    nb = [(x, north(x)) for x in xs]; sb = [(x, south(x)) for x in reversed(xs)]
    # rive nord en trois morceaux, rive sud en deux, fermetures aux bords : l'anneau extérieur est à assembler
    cuts = [0, len(nb) // 3, 2 * len(nb) // 3, len(nb) - 1]
    members = []
    for a, b in zip(cuts, cuts[1:]): members.append(('outer', nb[a:b + 1]))
    members.append(('outer', [nb[-1], sb[0]]))
    h = len(sb) // 2; members += [('outer', sb[h:]), ('outer', sb[:h + 1])]   # ordre mélangé, sens conservé
    members.append(('outer', [sb[-1], nb[0]]))
    for i, (a, b, _, _) in enumerate(ISLANDS):
        top = [(x, island_half(x, i)[0] + island_half(x, i)[1]) for x in range(int(a) + 20, int(b), 25)]
        bot = [(x, island_half(x, i)[0] - island_half(x, i)[1]) for x in reversed(range(int(a) + 20, int(b), 25))]
        members.append(('inner', [(a, island_half(a + 1, i)[0])] + top + [(b, island_half(b - 1, i)[0])] + bot + [(a, island_half(a + 1, i)[0])]))
    mem = []
    for role, pts in members:
        w = way(pts, {}); mem.append({'type': 'way', 'ref': w, 'role': role})
    rels.append({'type': 'relation', 'id': 1, 'members': mem, 'tags': {'type': 'multipolygon', 'natural': 'water', 'water': 'river', 'name': 'La Loire'}})
    way([(x, yc(x)) for x in xs], {'waterway': 'river', 'name': 'La Loire'})
    # île-jardin (la première île)
    a, b, _, _ = ISLANDS[0]
    pts = [(x, island_half(x, 0)[0] + island_half(x, 0)[1] * 0.85) for x in range(int(a) + 60, int(b) - 40, 25)]
    pts += [(x, island_half(x, 0)[0] - island_half(x, 0)[1] * 0.85) for x in reversed(range(int(a) + 60, int(b) - 40, 25))]
    way(pts, {'leisure': 'park', 'name': 'Île-jardin'}, closed=True)
    # affluent : du nord jusqu'à la rive
    fx = lambda y: 1900 + 140 * math.sin(y / 300) + 35 * math.sin(y / 95)
    pts, y = [], float(Y1)
    while y > north(fx(y)) - 10: pts.append((fx(y), y)); y -= 20
    pts.append((fx(y), north(fx(y)) - 10)); way(pts, {'waterway': 'stream', 'name': 'La Cisse'})
    # canal au sud-est
    way([(x, south(x) - 380 - 0.08 * (x - 1200)) for x in range(1200, X1 + 1, 50)], {'waterway': 'canal'})
    # étang
    cx, cy, a, b = POND
    way([(cx + a * math.cos(t / 24 * 2 * math.pi), cy + b * math.sin(t / 24 * 2 * math.pi)) for t in range(24)], {'natural': 'water', 'name': 'Étang du parc'}, closed=True)

# ---------- Rues ----------
streets = []   # (points, demi-largeur) : pour écarter les bâtiments de la chaussée
HALF = {'motorway': 14, 'trunk': 11, 'primary': 9, 'secondary': 8, 'tertiary': 7, 'residential': 5.5, 'living_street': 4, 'pedestrian': 4,
        'unclassified': 5, 'service': 3.5, 'footway': 2, 'path': 2, 'cycleway': 2, 'steps': 2, 'motorway_link': 7}
def clip(pts, ok):
    """Découpe une polyligne là où `ok` est faux (fleuve, hors emprise…)"""
    out, cur = [], []
    for p in pts:
        if ok(*p): cur.append(p)
        else:
            if len(cur) > 1: out.append(cur)
            cur = []
    if len(cur) > 1: out.append(cur)
    return out
inside = lambda x, y: X0 <= x <= X1 and Y0 <= y <= Y1
def road(pts, hw, bridge=False, extra=None, keep_water=False):
    tags = {'highway': hw, **(extra or {})}
    parts = [pts] if keep_water else clip(pts, lambda x, y: inside(x, y) and not in_water(x, y, 12))
    for seg in parts:
        if bridge: tags = {**tags, 'bridge': 'yes', 'layer': '1'}
        if way(seg, tags): streets.append((seg, HALF.get(hw, 5)))
def dens(a, b, step=20):
    """Points intermédiaires sur [a, b] (chemins droits redécoupés : découpe fine au bord du fleuve)"""
    n = max(1, int(math.dist(a, b) / step)); return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]

CENTER = (-200, 520)
def old_town():
    """Vieille ville : tissu organique (graphe de voisinage relatif sur des carrefours semés au hasard, rues légèrement
    courbes), six grandes rues rayonnantes, boulevards sur les anciens remparts, rue de ceinture"""
    cx, cy = CENTER
    # grandes rues : rayonnantes, presque droites, jusqu'aux faubourgs (ou jusqu'au fleuve)
    for i in range(6):
        a = i / 6 * 2 * math.pi + 0.35 + rnd.uniform(-0.15, 0.15); pts = [(cx, cy)]; r = 0
        while r < 1250:
            r += 20; b = a + 0.06 * math.sin(r / 260 + i); x, y = cx + r * math.cos(b), cy + r * math.sin(b)
            if in_water(x, y, 25): break
            pts.append((x, y))
        road(pts, 'secondary' if i % 2 == 0 else 'tertiary')
    for R, hw in ((430, 'secondary'), (840, 'tertiary')):
        pts = [(cx + (R + 15 * math.sin(k / 4)) * math.cos(k / 120 * 2 * math.pi), cy + (R + 15 * math.sin(k / 4)) * math.sin(k / 120 * 2 * math.pi)) for k in range(121)]
        road(pts, hw)
    # carrefours : plus serrés au cœur (45 m) qu'en bordure (95 m)
    pts, tries = [], 0
    while tries < 20000:
        tries += 1; r = 800 * math.sqrt(rnd.random()); a = rnd.uniform(0, 2 * math.pi); p = (cx + r * math.cos(a), cy + r * math.sin(a))
        if in_water(*p, 30): continue
        d = 45 + 50 * r / 800
        if all(math.dist(p, q) >= d for q in pts): pts.append(p)
    # graphe de voisinage relatif : arête p–q gardée si aucun r n'est plus proche des deux (planaire, aspect « médiéval »)
    near = lambda p: [q for q in pts if q is not p and math.dist(p, q) < 170]
    seen = set()
    for p in pts:
        for q in near(p):
            k = tuple(sorted([p, q])); d = math.dist(p, q)
            if k in seen: continue
            seen.add(k)
            if any(max(math.dist(p, r), math.dist(q, r)) < d for r in near(p) if r is not q): continue
            off = rnd.uniform(-0.12, 0.12) * d; mx, my = (p[0] + q[0]) / 2 - off * (q[1] - p[1]) / d, (p[1] + q[1]) / 2 + off * (q[0] - p[0]) / d
            line = [(((1 - t) ** 2) * p[0] + 2 * (1 - t) * t * mx + t * t * q[0], ((1 - t) ** 2) * p[1] + 2 * (1 - t) * t * my + t * t * q[1]) for t in (i / 6 for i in range(7))]
            r0 = math.dist(((p[0] + q[0]) / 2, (p[1] + q[1]) / 2), CENTER)
            hw = 'pedestrian' if r0 < 160 else 'living_street' if r0 < 300 and rnd.random() < 0.3 else 'footway' if rnd.random() < 0.06 else 'residential'
            road(line, hw)
    for _ in range(10):   # escaliers vers les quais
        x = rnd.uniform(-1200, 600); y0 = north(x) + 30
        road(dens((x, y0), (x + rnd.uniform(-20, 20), y0 + 70), 10), 'steps')

def grid(origin, ang, sx, sy, region, n, classes):
    """Damier tourné de `ang` degrés, pas sx × sy, limité à `region(x, y)` ; classes(i) : classe de la i-ème rue"""
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang)); ox, oy = origin
    P = lambda u, v: (ox + u * ca - v * sa, oy + u * sa + v * ca)
    blocks = []
    for i in range(-n, n + 1):
        for s in clip([P(i * sx, v) for v in range(-n * sy, n * sy + 1, 20)], region): road(s, classes(i))
        for s in clip([P(u, i * sy) for u in range(-n * sx, n * sx + 1, 20)], region): road(s, classes(i + 3))
    for i in range(-n, n):
        for j in range(-n, n):
            c = P((i + 0.5) * sx, (j + 0.5) * sy)
            if region(*c): blocks.append((c, ang, sx, sy))
    return blocks

PARK = [(-560, -1820), (330, -1820), (330, -1180), (-560, -1180)]   # grand parc (rectangle légèrement tourné)
def in_park(x, y):
    if -560 < x < 330 and -1820 < y < -1180: return True
    if -2600 < x < -1500 and north(x) + 30 < y < north(x) + 110: return True   # jardin des quais
    return in_forest(x, y)
def in_forest(x, y): return x < -2200 and y > 1500 + 250 * math.sin(x / 300)

def districts():
    blocks = []
    south_ok = lambda x, y: inside(x, y) and y < south(x) - 70 and y > Y0 + 60 and not in_park(x, y) and not (x > 1500 and y < -1900)
    blocks += grid((-600, -1300), 18, 130, 100, south_ok, 26, lambda i: 'secondary' if i % 10 == 0 else 'tertiary' if i % 5 == 0 else 'residential')
    ne_ok = lambda x, y: inside(x, y) and y > north(x) + 70 and math.dist((x, y), CENTER) > 880 and x > 350 and not in_park(x, y)
    blocks += grid((1600, 1300), -8, 110, 110, ne_ok, 26, lambda i: 'tertiary' if i % 6 == 0 else 'residential')
    # lotissement au nord-ouest : rues courbes et impasses
    for k in range(8):
        y = 1100 + k * 95; pts = [(x, y + 25 * math.sin(x / 160 + k)) for x in range(-2150, -1150, 20)]
        for seg in clip(pts, lambda x, y: not in_forest(x, y) and math.dist((x, y), CENTER) > 880): road(seg, 'residential')
        for x0 in range(-2100, -1200, 180):
            yy = y + 25 * math.sin(x0 / 160 + k); a = rnd.uniform(0.3, 0.9) * (1 if k % 2 else -1)
            road([(x0 + t * math.sin(a), yy + t * math.cos(a)) for t in range(0, 70, 10)], 'service')
            blocks.append(((x0 + 40, yy + 45), 0, 70, 50))
    return blocks

def network():
    xs = range(X0, X1 + 1, 20)
    # quais et piste cyclable
    road([(x, north(x) + 18) for x in xs], 'secondary', extra={'name': 'Quai nord'}, keep_water=True)
    road([(x, south(x) - 18) for x in xs], 'tertiary', extra={'name': 'Quai sud'}, keep_water=True)
    road([(x, north(x) + 8) for x in range(-2600, 900, 20)], 'cycleway', keep_water=True)
    # ponts
    for x, hw in ((-900, 'primary'), (600, 'secondary'), (2300, 'trunk')):
        y0, y1 = south(x) - 18, north(x) + 18
        road(dens((x, y0), (x, y1), 20), hw, bridge=True, keep_water=True)
        road(dens((x, Y0), (x, y0)), hw); road(dens((x, y1), (x, Y1) if hw == 'trunk' else CENTER if hw == 'primary' else (x + 150, Y1)), hw)
    # rocade : autoroute au sud, bretelles vers la voie rapide
    pts = [(x, -2350 + 500 * (x - X0) / (X1 - X0) + 120 * math.sin(x / 800)) for x in xs]
    road(pts, 'motorway', extra={'ref': 'A 10'})
    ym = -2350 + 500 * (2300 - X0) / (X1 - X0) + 120 * math.sin(2300 / 800)
    for s in (-1, 1): road([(2300 + s * (60 + 90 * math.cos(t / 10 * math.pi / 2)), ym + s * 90 * math.sin(t / 10 * math.pi / 2)) for t in range(11)], 'motorway_link')
    # passage en tunnel sous la voie ferrée, rue de service, chemins des parcs et de la forêt
    road(dens((900, 1150), (900, 1400), 20), 'tertiary', extra={'tunnel': 'yes', 'layer': '-1'}, keep_water=True)
    for k in range(6):
        cx, cy = rnd.uniform(-480, 250), rnd.uniform(-1760, -1240)
        road([(cx + 90 * math.cos(t / 12 * 2 * math.pi) + 15 * math.sin(t), cy + 60 * math.sin(t / 12 * 2 * math.pi)) for t in range(13)], 'footway' if k % 2 else 'path')
    for k in range(5):
        y = 1800 + k * 150; road([(x, y + 60 * math.sin(x / 210 + k)) for x in range(X0, -2150, 20)], 'track' if k % 2 else 'path')

def railway():
    main = [(x, 1200 + 120 * math.sin(x / 1500) + (x > 600) * (x - 600) * 0.15) for x in range(X0, X1 + 1, 25)]
    tunnel = [p for p in main if 1800 <= p[0] <= 2300]
    way([p for p in main if p[0] <= 1800], {'railway': 'rail'}); way(tunnel, {'railway': 'rail', 'tunnel': 'yes'}); way([p for p in main if p[0] >= 2300], {'railway': 'rail'})
    streets.extend([(main, 10)])
    br = [(-1800 - 500 * math.sin(t / 60 * math.pi / 2), 1210 - 3800 * t / 60) for t in range(61)]
    bridge = [p for p in br if in_water(*p, 15)]; land = clip(br, lambda x, y: not in_water(x, y, 15) and inside(x, y))
    for s in land: way(s, {'railway': 'rail'})
    if bridge: way([land[0][-1]] + bridge + [land[1][0]], {'railway': 'rail', 'bridge': 'yes'})
    streets.append((br, 10))

def parks():
    way(PARK, {'leisure': 'park', 'name': 'Grand parc'}, closed=True)
    xs = list(range(-2600, -1500, 25))
    way([(x, north(x) + 30) for x in xs] + [(x, north(x) + 110) for x in reversed(xs)], {'leisure': 'park', 'name': 'Jardin des quais'}, closed=True)
    xs = list(range(X0, -2190, 25))
    way([(x, 1500 + 250 * math.sin(x / 300)) for x in xs] + [(-2200, Y1), (X0, Y1)], {'natural': 'wood'}, closed=True)
    cx, cy = CENTER
    way([(cx + 45 * math.cos(t / 16 * 2 * math.pi), cy + 35 * math.sin(t / 16 * 2 * math.pi)) for t in range(16)], {'leisure': 'garden', 'name': 'Jardin de l\'évêché'}, closed=True)
    way([(1400, -2250), (1950, -2200), (1980, -1980), (1420, -2010)], {'landuse': 'grass'}, closed=True)

# ---------- Bâtiments ----------
SEGS = {}   # grille de 60 m : segments de rue proches
def index_streets():
    for pts, hw in streets:
        for a, b in zip(pts, pts[1:]):
            for gx in {int((a[0]) // 60), int((b[0]) // 60)}:
                for gy in {int((a[1]) // 60), int((b[1]) // 60)}:
                    SEGS.setdefault((gx, gy), []).append((a, b, hw))
def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
def clear(p, m=1.5):
    gx, gy = int(p[0] // 60), int(p[1] // 60)
    for i in (gx - 1, gx, gx + 1):
        for j in (gy - 1, gy, gy + 1):
            for a, b, hw in SEGS.get((i, j), ()):
                if seg_dist(p, a, b) < hw + m: return False
    return True
taken = {}
def free(c, r):
    gx, gy = int(c[0] // 20), int(c[1] // 20)
    for i in (gx - 1, gx, gx + 1):
        for j in (gy - 1, gy, gy + 1):
            for q, rq in taken.get((i, j), ()):
                if math.dist(c, q) < (r + rq) * 0.8: return False
    taken.setdefault((gx, gy), []).append((c, r)); return True
nb = [0]
def building(c, ang, w, d, tags=None):
    ca, sa = math.cos(ang), math.sin(ang)
    corners = [(c[0] + u * ca - v * sa, c[1] + u * sa + v * ca) for u, v in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]
    if not all(inside(*p) and not in_water(*p, 4) and not in_park(*p) and clear(p) for p in corners + [c]): return
    if not free(c, max(w, d) / 2): return
    if way(corners, {'building': 'yes', **(tags or {})}, closed=True): nb[0] += 1

def buildings(blocks):
    index_streets()
    # rangs le long des rues : serrés au centre, espacés au-delà
    for pts, hw in list(streets):
        if hw >= 9 or hw <= 2.5: continue
        for k in range(0, len(pts) - 1):
            a, b = pts[k], pts[k + 1]; L = math.dist(a, b)
            if L < 1: continue
            ang = math.atan2(b[1] - a[1], b[0] - a[0]); mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            dc = math.dist(mid, CENTER); dense = dc < 900
            if not dense and rnd.random() < 0.45: continue
            for side in (-1, 1):
                t = 0.0
                while t < L:
                    w = rnd.uniform(8, 15) if dense else rnd.uniform(9, 13); dpt = rnd.uniform(12, 20) if dense else rnd.uniform(9, 12)
                    off = hw + (2.5 if dense else rnd.uniform(5, 9)) + dpt / 2
                    for row in ((0, 1) if dense else (0,)):   # au centre, un second rang remplit le cœur d'îlot
                        o = off + row * (dpt + rnd.uniform(1, 4))
                        p = (a[0] + (b[0] - a[0]) * (t + w / 2) / L - side * o * math.sin(ang), a[1] + (b[1] - a[1]) * (t + w / 2) / L + side * o * math.cos(ang))
                        building(p, ang + rnd.uniform(-0.03, 0.03), w * (1 if row == 0 else rnd.uniform(0.7, 1.2)), dpt)
                    t += w + (rnd.uniform(0, 1.5) if dense else rnd.uniform(4, 12))
    # cœurs d'îlot : immeubles et entrepôts
    for c, ang, sx, sy in blocks:
        if rnd.random() < 0.35:
            big = c[1] > 1350 and c[0] > 900
            building(c, math.radians(ang), rnd.uniform(40, 70) if big else rnd.uniform(25, 40), rnd.uniform(25, 40) if big else rnd.uniform(12, 16))

def main():
    river(); old_town(); network(); railway(); parks()
    blocks = districts(); buildings(blocks)
    els = [{'type': 'node', 'id': i, 'lat': k[0], 'lon': k[1]} for k, i in nodes.items()] + ways + rels
    json.dump({'version': 0.6, 'generator': 'tests/make_city.py', 'elements': els}, open(T / 'city.json', 'w'), separators=(',', ':'))
    # points de contrôle : milieu du fleuve (hors îles), milieu du pont principal, centre-ville
    xr = -2000; meta = {'river': ll(xr, yc(xr)), 'bridge': ll(-900, yc(-900)), 'center': ll(*CENTER), 'buildings': nb[0],
                        'extent': [ll(X0, Y0), ll(X1, Y1)]}
    json.dump(meta, open(T / 'city.meta.json', 'w'), indent=1)
    print(f'city.json : {len(nodes)} nœuds, {len(ways)} chemins, {len(rels)} relation, {nb[0]} bâtiments, {(T / "city.json").stat().st_size // 1024} Ko')

if __name__ == '__main__':
    main()
