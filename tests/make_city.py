"""Génère tests/city.json : une ville fictive mais réaliste pour le moteur Fichier (JSON OSM, nœuds partagés).

« Ville-sur-Loire », centrée sur la vue par défaut (Blois), 6,4 km sur 5,2 km. Chaque quartier a l'aspect de son époque :
- vieille ville sur la rive nord : tissu organique (graphe de voisinage relatif), rues piétonnes, escaliers vers les
  quais, boulevards sur les anciens remparts ; château en U au-dessus du fleuve, cathédrale en croix, îlots bâtis serrés ;
- faubourgs du XIXᵉ siècle (rive sud, nord-est) : damiers légèrement déformés, immeubles mitoyens à l'alignement ;
- grand ensemble : barres posées dans de grands îlots ; zones pavillonnaires : maisons en retrait, en L ou rectangulaires,
  super-îlots, lotissements à rues courbes et impasses en raquette ;
- zone portuaire et industrielle : bassin, entrepôts, canal ; gare avec faisceau de voies et bâtiment voyageurs ;
- fleuve large à deux îles (multipolygone en sept morceaux à assembler), affluent, étang, parcs, forêt ;
- quais, trois ponts routiers et un pont ferroviaire, rocade (autoroute, échangeurs, voie rapide), avenues ;
- au-delà de la rocade, la campagne : chemins agricoles, bois, un hameau.

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

# ---------- Terrain : déformation douce (les rues des damiers ondulent un peu) ----------
def warp(x, y):
    return (x + 28 * math.sin(y / 410 + 0.7) + 14 * math.sin((x + y) / 230 + 2.1),
            y + 24 * math.sin(x / 470 + 1.9) + 12 * math.sin((x - y) / 260 + 0.4))

# ---------- Eau ----------
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
POND = (-80, -1500, 120, 70)                    # étang du grand parc : centre, demi-axes
BASIN = (1680, 1960, -420)                      # bassin portuaire : x de début et de fin, profondeur sous la rive sud
def stream_x(y): return 1900 + 140 * math.sin(y / 300) + 35 * math.sin(y / 95)
def canal_y(x): return south(1200) - 380 - 0.08 * (x - 1200) + 20 * math.sin(x / 500)
def in_water(x, y, m=0):
    if south(x) - m < y < north(x) + m:
        for i in range(len(ISLANDS)):
            r = island_half(x, i)
            if r and abs(y - r[0]) < r[1] - m: return False
        return True
    a, b, d = BASIN
    if a - m < x < b + m and south(x) + d - m < y < south(x) + 5: return True
    cx, cy, ea, eb = POND
    if ((x - cx) / (ea + m)) ** 2 + ((y - cy) / (eb + m)) ** 2 < 1: return True
    if y > north(x) and abs(x - stream_x(y)) < 7 + m: return True
    return x > 1200 and abs(y - canal_y(x)) < 9 + m

def river():
    xs = list(range(X0, X1 + 1, 40))
    nb = [(x, north(x)) for x in xs]
    a, b, d = BASIN   # rive sud : le bassin portuaire s'y ouvre
    sb = []
    for x in reversed(xs):
        if a < x < b: continue
        if x == max(v for v in xs if v <= a) and sb: sb += [(b, south(b)), (b, south(b) + d), (a, south(a) + d), (a, south(a))]
        sb.append((x, south(x)))
    # rive nord en trois morceaux, rive sud en deux, fermetures aux bords : l'anneau extérieur est à assembler
    cuts = [0, len(nb) // 3, 2 * len(nb) // 3, len(nb) - 1]
    members = []
    for i0, i1 in zip(cuts, cuts[1:]): members.append(('outer', nb[i0:i1 + 1]))
    members.append(('outer', [nb[-1], sb[0]]))
    h = len(sb) // 2; members += [('outer', sb[h:]), ('outer', sb[:h + 1])]
    members.append(('outer', [sb[-1], nb[0]]))
    for i, (ia, ib, _, _) in enumerate(ISLANDS):
        top = [(x, island_half(x, i)[0] + island_half(x, i)[1]) for x in range(int(ia) + 20, int(ib), 25)]
        bot = [(x, island_half(x, i)[0] - island_half(x, i)[1]) for x in reversed(range(int(ia) + 20, int(ib), 25))]
        tip = lambda x: (x, island_half(x + (1 if x == ia else -1), i)[0])
        members.append(('inner', [tip(ia)] + top + [tip(ib)] + bot + [tip(ia)]))
    mem = [{'type': 'way', 'ref': way(pts, {}), 'role': role} for role, pts in members]
    rels.append({'type': 'relation', 'id': 1, 'members': mem, 'tags': {'type': 'multipolygon', 'natural': 'water', 'water': 'river', 'name': 'La Loire'}})
    way([(x, yc(x)) for x in xs], {'waterway': 'river', 'name': 'La Loire'})
    ia, ib, _, _ = ISLANDS[0]   # île-jardin
    pts = [(x, island_half(x, 0)[0] + island_half(x, 0)[1] * 0.85) for x in range(int(ia) + 60, int(ib) - 40, 25)]
    pts += [(x, island_half(x, 0)[0] - island_half(x, 0)[1] * 0.85) for x in reversed(range(int(ia) + 60, int(ib) - 40, 25))]
    way(pts, {'leisure': 'park', 'name': 'Île-jardin'}, closed=True)
    pts, y = [], float(Y1)
    while y > north(stream_x(y)) - 10: pts.append((stream_x(y), y)); y -= 20
    pts.append((stream_x(y), north(stream_x(y)) - 10)); way(pts, {'waterway': 'stream', 'name': 'La Cisse'})
    way([(x, canal_y(x)) for x in range(1200, X1 + 1, 40)], {'waterway': 'canal', 'name': 'Canal du port'})
    cx, cy, ea, eb = POND
    way([(cx + ea * math.cos(t / 28 * 2 * math.pi) + 10 * math.sin(3 * t / 28 * 2 * math.pi), cy + eb * math.sin(t / 28 * 2 * math.pi)) for t in range(28)],
        {'natural': 'water', 'name': 'Étang du parc'}, closed=True)

# ---------- Rues ----------
streets = []            # (points, demi-largeur) : pour écarter les bâtiments de la chaussée
row_streets = []        # rues bordées de bâtiments en rangs (vieille ville, faubourgs linéaires, lotissements) : (points, demi-largeur, style)
HALF = {'motorway': 14, 'trunk': 11, 'primary': 9, 'secondary': 8, 'tertiary': 7, 'residential': 5.5, 'living_street': 4, 'pedestrian': 4,
        'unclassified': 5, 'service': 3.5, 'footway': 2, 'path': 2, 'cycleway': 2, 'steps': 2, 'track': 2, 'motorway_link': 7}
inside = lambda x, y: X0 <= x <= X1 and Y0 <= y <= Y1
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
def road(pts, hw, bridge=False, extra=None, keep_water=False, rows=None):
    tags = {'highway': hw, **(extra or {})}
    if bridge: tags.update({'bridge': 'yes', 'layer': '1'})
    parts = [pts] if keep_water else clip(pts, lambda x, y: inside(x, y) and not in_water(x, y, 10))
    for seg in parts:
        if way(seg, tags):
            streets.append((seg, HALF.get(hw, 5)))
            if rows: row_streets.append((seg, HALF.get(hw, 5), rows))
def dens(a, b, step=20):
    n = max(1, int(math.dist(a, b) / step)); return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]
def bez(p, q, bend):
    """Rue légèrement courbe de p à q (flèche `bend` × longueur)"""
    d = math.dist(p, q) or 1; mx, my = (p[0] + q[0]) / 2 - bend * (q[1] - p[1]), (p[1] + q[1]) / 2 + bend * (q[0] - p[0])
    n = max(2, int(d / 15))
    return [((1 - t) ** 2 * p[0] + 2 * (1 - t) * t * mx + t * t * q[0], (1 - t) ** 2 * p[1] + 2 * (1 - t) * t * my + t * t * q[1]) for t in (i / n for i in range(n + 1))]

CENTER = (-200, 520)
CASTLE = (-560, None)                 # x ; y fixé au-dessus de la rive nord
CATHEDRAL = (-90, 610)
def castle_c(): return (CASTLE[0], north(CASTLE[0]) + 120)
def old_town():
    cx, cy = CENTER
    for i in range(6):   # grandes rues rayonnantes, jusqu'aux faubourgs (bordées de maisons au-delà des remparts)
        a = i / 6 * 2 * math.pi + 0.35 + rnd.uniform(-0.15, 0.15); pts = [(cx, cy)]; r = 0
        while r < 1350:
            r += 20; b = a + 0.06 * math.sin(r / 260 + i); x, y = cx + r * math.cos(b), cy + r * math.sin(b)
            if in_water(x, y, 25): break
            pts.append((x, y))
        road(pts, 'secondary' if i % 2 == 0 else 'tertiary', rows='faubourg')
    for R, hw in ((430, 'secondary'), (840, 'tertiary')):
        pts = [(cx + (R + 15 * math.sin(k / 4)) * math.cos(k / 120 * 2 * math.pi), cy + (R + 15 * math.sin(k / 4)) * math.sin(k / 120 * 2 * math.pi)) for k in range(121)]
        road(pts, hw, rows='ancien')
    # carrefours semés au hasard (plus serrés au cœur), sauf sur le château et la cathédrale
    keep_out = [(castle_c(), 110), (CATHEDRAL, 70)]
    pts, tries = [], 0
    while tries < 20000:
        tries += 1; r = 800 * math.sqrt(rnd.random()); a = rnd.uniform(0, 2 * math.pi); p = (cx + r * math.cos(a), cy + r * math.sin(a))
        if in_water(*p, 30) or any(math.dist(p, c) < m for c, m in keep_out): continue
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
            mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
            if any(math.dist(mid, c) < m * 0.8 for c, m in keep_out): continue
            r0 = math.dist(mid, CENTER)
            hw = 'pedestrian' if r0 < 160 else 'living_street' if r0 < 300 and rnd.random() < 0.3 else 'footway' if rnd.random() < 0.06 else 'residential'
            road(bez(p, q, rnd.uniform(-0.12, 0.12)), hw, rows='ancien')
    for _ in range(10):   # escaliers vers les quais
        x = rnd.uniform(-1200, 600); y0 = north(x) + 30
        road(dens((x, y0), (x + rnd.uniform(-20, 20), y0 + 70), 10), 'steps')

# ---------- Parcs, forêt ----------
PARK = [(-560, -1820), (330, -1820), (330, -1180), (-560, -1180)]
def in_forest(x, y): return (x < -2200 and y > 1500 + 250 * math.sin(x / 300)) or math.dist((x, y), (-2350, -2380)) < 260 + 60 * math.sin(math.atan2(y + 2380, x + 2350) * 3)
def in_park(x, y):
    if -560 < x < 330 and -1820 < y < -1180: return True
    if -2600 < x < -1500 and north(x) + 30 < y < north(x) + 110: return True   # jardin des quais
    return in_forest(x, y)
def parks():
    way(PARK, {'leisure': 'park', 'name': 'Grand parc'}, closed=True)
    xs = list(range(-2600, -1500, 25))
    way([(x, north(x) + 30) for x in xs] + [(x, north(x) + 110) for x in reversed(xs)], {'leisure': 'park', 'name': 'Jardin des quais'}, closed=True)
    xs = list(range(X0, -2190, 25))
    way([(x, 1500 + 250 * math.sin(x / 300)) for x in xs] + [(-2200, Y1), (X0, Y1)], {'natural': 'wood'}, closed=True)
    way([(-2350 + (260 + 60 * math.sin(3 * a)) * math.cos(a), -2380 + (260 + 60 * math.sin(3 * a)) * math.sin(a)) for a in (k / 40 * 2 * math.pi for k in range(40))], {'natural': 'wood', 'name': 'Bois de la Garenne'}, closed=True)
    cx, cy = CENTER
    way([(cx + 45 * math.cos(t / 16 * 2 * math.pi), cy + 35 * math.sin(t / 16 * 2 * math.pi)) for t in range(16)], {'leisure': 'garden', 'name': 'Jardin de l\'évêché'}, closed=True)
    way([(-1280, 1280), (-1180, 1270), (-1170, 1360), (-1290, 1370)], {'landuse': 'recreation_ground', 'name': 'Stade'}, closed=True)
    # allées du grand parc (jardin à la française) : ceinture, grand axe, diagonales, tour de l'étang
    x0, y0, x1, y1 = -530, -1790, 300, -1210; mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    road(dens((x0, y0), (x1, y0)) + dens((x1, y0), (x1, y1))[1:] + dens((x1, y1), (x0, y1))[1:] + dens((x0, y1), (x0, y0))[1:], 'footway')
    road(dens((x0, my), (POND[0] - POND[2] - 15, my)), 'footway'); road(dens((POND[0] + POND[2] + 15, my), (x1, my)), 'footway')
    road(dens((mx, y0), (mx, POND[1] - POND[3] - 15)), 'path'); road(dens((mx, POND[1] + POND[3] + 15), (mx, y1)), 'path')
    for (ax, ay), (bx, by) in (((x0, y0), (x1, y1)), ((x0, y1), (x1, y0))):
        for seg in clip(dens((ax, ay), (bx, by), 10), lambda x, y: ((x - POND[0]) / (POND[2] + 25)) ** 2 + ((y - POND[1]) / (POND[3] + 25)) ** 2 > 1): road(seg, 'path')
    road([(POND[0] + (POND[2] + 15) * math.cos(t / 32 * 2 * math.pi), POND[1] + (POND[3] + 15) * math.sin(t / 32 * 2 * math.pi)) for t in range(33)], 'footway')
    for k in range(5):   # chemins forestiers
        y = 1800 + k * 150; road([(x, y + 60 * math.sin(x / 210 + k)) for x in range(X0, -2150, 20)], 'track' if k % 2 else 'path')

# ---------- Damiers : lignes déformées, rues supprimées (super-îlots), îlots bâtis selon l'époque ----------
blocks = []   # (coins, côtés bordés d'une rue, style)
def gridnet(origin, ang, sx, sy, n, region, classes, drop, style):
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang)); ox, oy = origin
    P = lambda u, v: warp(ox + u * ca - v * sa, oy + u * sa + v * ca)
    ok = {}
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            p = P(i * sx, j * sy); ok[i, j] = region(*p) and not in_water(*p, 20) and not in_park(*p)
    kept = {}
    for j in range(-n, n + 1):          # lignes « horizontales » (u)
        cls = classes(j); line = []
        for i in range(-n, n):
            k = ok[i, j] and ok[i + 1, j] and (cls != 'residential' or rnd.random() > drop)
            kept['h', i, j] = k
            if k:
                seg = [P(u, j * sy) for u in [i * sx + t * sx / 6 for t in range(7)]]
                line = line + seg[1:] if line else seg
            elif line: road(line, cls); line = []
        if line: road(line, cls)
    for i in range(-n, n + 1):          # lignes « verticales » (v)
        cls = classes(i + 3); line = []
        for j in range(-n, n):
            k = ok[i, j] and ok[i, j + 1] and (cls != 'residential' or rnd.random() > drop)
            kept['v', i, j] = k
            if k:
                seg = [P(i * sx, v) for v in [j * sy + t * sy / 6 for t in range(7)]]
                line = line + seg[1:] if line else seg
            elif line: road(line, cls); line = []
        if line: road(line, cls)
    for i in range(-n, n):
        for j in range(-n, n):
            if not all(ok[a, b] for a, b in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))): continue
            q = [P(i * sx, j * sy), P((i + 1) * sx, j * sy), P((i + 1) * sx, (j + 1) * sy), P(i * sx, (j + 1) * sy)]
            sides = [kept['h', i, j], kept['v', i + 1, j], kept['h', i, j + 1], kept['v', i, j]]
            c = (sum(p[0] for p in q) / 4, sum(p[1] for p in q) / 4)
            blocks.append((q, sides, style(*c)))

def districts():
    south_ok = lambda x, y: inside(x, y) and y < south(x) - 70 and y > motorway_y(x) + 60 and not (x > 1500 and y < -1900)
    def south_style(x, y):
        if y > south(x) - 650 and -1500 < x < 1300: return 'mitoyen'
        if -1450 < x < -650 and y < -1200: return 'barres'
        if x > 1450 and y > -1500: return 'industrie'
        return 'pavillon'
    gridnet((-600, -1300), 18, 110, 95, 30, lambda x, y: south_ok(x, y) and not (x < -1700 and y < -1250),
            lambda i: 'secondary' if i % 10 == 0 else 'tertiary' if i % 5 == 0 else 'residential', 0.14, south_style)
    ne_ok = lambda x, y: inside(x, y) and y > north(x) + 70 and math.dist((x, y), CENTER) > 880 and x > 350 and not (y > rail_y(x) - 25 and y < rail_y(x) + 25)
    gridnet((1600, 1300), -8, 100, 105, 28, ne_ok, lambda i: 'tertiary' if i % 6 == 0 else 'residential', 0.1,
            lambda x, y: 'industrie' if abs(y - rail_y(x)) < 260 and x > 900 else 'mitoyen' if math.dist((x, y), CENTER) < 1450 else 'pavillon')
    # dessertes : voie d'accès et parking au cœur des îlots de barres et d'entrepôts
    for q, sides, style in blocks:
        if style not in ('barres', 'industrie') or rnd.random() < 0.4: continue
        k = next((k for k in range(4) if sides[k]), None)
        if k is None: continue
        a, b = q[k], q[(k + 1) % 4]; m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); c = (sum(p[0] for p in q) / 4, sum(p[1] for p in q) / 4)
        e = (m[0] + (c[0] - m[0]) * 0.75, m[1] + (c[1] - m[1]) * 0.75)
        road(dens(m, e, 10), 'service', extra={'service': 'parking_aisle' if style == 'barres' else 'driveway'})
    # lotissement nord-ouest et lotissement sud-ouest : rues courbes, impasses en raquette, pavillons
    for k in range(8):
        y = 1100 + k * 95
        for seg in clip([(x, y + 25 * math.sin(x / 160 + k)) for x in range(-2150, -1150, 20)], lambda x, y: not in_forest(x, y) and math.dist((x, y), CENTER) > 880):
            road(seg, 'residential', rows='pavillon')
    for k in range(5):
        y0 = -1350 - k * 190; spine = [(x, y0 + 40 * math.sin(x / 230 + k)) for x in range(-3000, -1700, 20)]
        road(spine, 'residential', rows='pavillon')
        for x0 in range(-2900, -1800, 150 + 20 * k):
            yy = y0 + 40 * math.sin(x0 / 230 + k); s = 1 if (x0 // 150 + k) % 2 else -1; a = rnd.uniform(-0.3, 0.3)
            stem = [(x0 + t * math.sin(a), yy + s * t * math.cos(a)) for t in range(0, 75, 15)]
            e = stem[-1]; loop = [(e[0] + 18 * math.sin(u), e[1] + s * 18 * (1 - math.cos(u))) for u in (v / 10 * 2 * math.pi for v in range(11))]
            road(stem + loop, 'residential', rows='pavillon')

# ---------- Réseau principal ----------
def motorway_y(x): return -2350 + 500 * (x - X0) / (X1 - X0) + 120 * math.sin(x / 800)
def rail_y(x): return 1200 + 120 * math.sin(x / 1500) + (x > 600) * (x - 600) * 0.15
def network():
    xs = range(X0, X1 + 1, 20)
    road([(x, north(x) + 18) for x in xs], 'secondary', extra={'name': 'Quai nord'}, keep_water=True)
    road([(x, south(x) - 18) for x in xs if not BASIN[0] - 30 < x < BASIN[1] + 30], 'tertiary', extra={'name': 'Quai sud'})
    road([(x, north(x) + 8) for x in range(-2600, 900, 20)], 'cycleway', keep_water=True)
    for x, hw in ((-900, 'primary'), (600, 'secondary'), (2300, 'trunk')):   # ponts et avenues qui les prolongent
        y0, y1 = south(x) - 18, north(x) + 18
        road(dens((x, y0), (x, y1), 20), hw, bridge=True, keep_water=True)
        road(dens((x, motorway_y(x)), (x, y0)), hw, rows='faubourg' if hw != 'trunk' else None)
        road(dens((x, y1), (x, Y1) if hw == 'trunk' else CENTER if hw == 'primary' else (x + 150, Y1)), hw)
    road(bez((600, south(600) - 18), (2300, motorway_y(2300) + 40), 0.08), 'primary', extra={'name': 'Avenue du Port'})
    road([(x, motorway_y(x)) for x in xs], 'motorway', extra={'ref': 'A 10'})
    for xm in (-900, 2300):   # échangeurs : bretelles en boucle
        ym = motorway_y(xm)
        for s in (-1, 1): road([(xm + s * (60 + 90 * math.cos(t / 10 * math.pi / 2)), ym + s * 90 * math.sin(t / 10 * math.pi / 2)) for t in range(11)], 'motorway_link')
    road([(x, -1000 + 160 * math.sin(x / 700) - 0.05 * x) for x in range(-1700, 1500, 20)], 'secondary', extra={'name': 'Boulevard sud'})
    road(dens((900, rail_y(900) - 130), (900, rail_y(900) + 130), 20), 'tertiary', extra={'tunnel': 'yes', 'layer': '-1'}, keep_water=True)
    # campagne au-delà de la rocade : chemins agricoles, routes de hameau
    for k in range(7):
        x0 = -2900 + k * 900; road([(x0 + 120 * math.sin(y / 300 + k), y) for y in range(int(motorway_y(x0)) - 20, Y0 - 1, -20)], 'track' if k % 2 else 'unclassified')
    road([(x, Y0 + 120 + 40 * math.sin(x / 400)) for x in range(-1800, 2600, 20)], 'unclassified', extra={'name': 'Route des Fermes'})
    for k in range(5):
        y = motorway_y(-500) - 160 - k * 70; road([(x, y + 30 * math.sin(x / 200 + k)) for x in range(-1200, 900, 25)], 'track')

def railway():
    main = [(x, rail_y(x)) for x in range(X0, X1 + 1, 25)]
    way([p for p in main if p[0] <= 1800], {'railway': 'rail'}); way([p for p in main if 1800 <= p[0] <= 2300], {'railway': 'rail', 'tunnel': 'yes'}); way([p for p in main if p[0] >= 2300], {'railway': 'rail'})
    streets.append((main, 10))
    # faisceau de la gare : voies parallèles qui s'écartent puis se rejoignent
    for off in (-24, -12, 12, 24, 36):
        pts = []
        for x in range(-1250, -250, 25):
            t = min(1, (x + 1250) / 200, (-250 - x) / 200); pts.append((x, rail_y(x) + off * (3 * t * t - 2 * t * t * t)))
        way(pts, {'railway': 'rail', 'service': 'siding'}); streets.append((pts, 6))
    br = [(-1800 - 500 * math.sin(t / 60 * math.pi / 2), 1210 - 3800 * t / 60) for t in range(61)]
    land = clip(br, lambda x, y: not in_water(x, y, 15) and inside(x, y))
    for s in land: way(s, {'railway': 'rail'})
    if len(land) > 1: way([land[0][-1]] + [p for p in br if in_water(*p, 15)] + [land[1][0]], {'railway': 'rail', 'bridge': 'yes'})
    streets.append((br, 10))

# ---------- Bâtiments ----------
SEGS = {}
def index_streets():
    SEGS.clear()
    for pts, hw in streets:
        for a, b in zip(pts, pts[1:]):
            for gx in range(int(min(a[0], b[0]) // 60), int(max(a[0], b[0]) // 60) + 1):
                for gy in range(int(min(a[1], b[1]) // 60), int(max(a[1], b[1]) // 60) + 1):
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
    gx, gy = int(c[0] // 25), int(c[1] // 25)
    for i in range(gx - 2, gx + 3):
        for j in range(gy - 2, gy + 3):
            for q, rq in taken.get((i, j), ()):
                if math.dist(c, q) < (r + rq) * 0.72: return False
    taken.setdefault((gx, gy), []).append((c, r)); return True
nb = [0]
def footprint(c, ang, w, d, shape='rect'):
    """Emprise d'un bâtiment : rectangle, L, U (cour ouverte) ou croix ; u le long de la rue, v en profondeur"""
    if shape == 'L': loc = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 10), (w / 10, d / 10), (w / 10, d / 2), (-w / 2, d / 2)]
    elif shape == 'U': loc = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (w / 4, d / 2), (w / 4, -d / 6), (-w / 4, -d / 6), (-w / 4, d / 2), (-w / 2, d / 2)]
    elif shape == 'cross': loc = [(-w / 2, -d / 8), (-w / 8, -d / 8), (-w / 8, -d / 2), (w / 8, -d / 2), (w / 8, -d / 8), (w / 2, -d / 8), (w / 2, d / 8), (w / 8, d / 8), (w / 8, d / 2), (-w / 8, d / 2), (-w / 8, d / 8), (-w / 2, d / 8)]
    else: loc = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
    ca, sa = math.cos(ang), math.sin(ang)
    return [(c[0] + u * ca - v * sa, c[1] + u * sa + v * ca) for u, v in loc]
def building(c, ang, w, d, tags=None, shape='rect', check=True):
    pts = footprint(c, ang, w, d, shape)
    if check:
        if not all(inside(*p) and not in_water(*p, 4) and not in_park(*p) and clear(p) for p in pts + [c]): return False
        if not free(c, max(w, d) / 2): return False
    else: free(c, max(w, d) / 2)
    if way(pts, {'building': 'yes', **(tags or {})}, closed=True): nb[0] += 1; return True
    return False

STYLE = {   # largeur, profondeur, retrait, écart, forme
    'ancien':   ((7, 14), (12, 20), (2.5, 3), (0, 1.2), 'rect'),
    'mitoyen':  ((10, 20), (13, 18), (2.5, 3), (0, 0.5), 'rect'),
    'faubourg': ((8, 13), (10, 15), (3, 6), (0, 6), 'rect'),
    'pavillon': ((8, 12), (8, 11), (6, 10), (6, 14), 'L'),
    'industrie': ((35, 80), (25, 45), (10, 16), (12, 30), 'rect'),
}
def frontage(a, b, hw, style, inward):
    """Bâtiments le long d'un côté de rue a→b, du côté `inward` (+1 : gauche, −1 : droite)"""
    (w0, w1), (d0, d1), (s0, s1), (g0, g1), shape = STYLE[style]
    L = math.dist(a, b)
    if L < 6: return
    ang = math.atan2(b[1] - a[1], b[0] - a[0]); nx, ny = -math.sin(ang) * inward, math.cos(ang) * inward
    t = rnd.uniform(0, 2)
    rows = 2 if style in ('ancien', 'mitoyen') else 1
    while t < L - 4:
        w = rnd.uniform(w0, w1); d = rnd.uniform(d0, d1); off = hw + rnd.uniform(s0, s1) + d / 2
        for r in range(rows):   # au centre et dans les faubourgs anciens, un second rang remplit le cœur d'îlot
            if r and rnd.random() < 0.35: continue
            o = off + r * (d + rnd.uniform(1, 5))
            c = (a[0] + (b[0] - a[0]) * (t + w / 2) / L + nx * o, a[1] + (b[1] - a[1]) * (t + w / 2) / L + ny * o)
            sh = shape if (shape != 'L' or rnd.random() < 0.3) else 'rect'
            building(c, ang + rnd.uniform(-0.02, 0.02), w if not r else w * rnd.uniform(0.7, 1.2), d, shape=sh)
        t += w + rnd.uniform(g0, g1)

def buildings():
    index_streets()
    # monuments et grands équipements d'abord : ils réservent leur place
    cc = castle_c(); building(cc, math.atan2(north(CASTLE[0] + 10) - north(CASTLE[0] - 10), 20) + math.pi, 150, 75, {'building': 'castle', 'name': 'Château'}, shape='U', check=False)
    building(CATHEDRAL, 0.12, 95, 40, {'building': 'cathedral', 'name': 'Cathédrale'}, shape='cross', check=False)
    ra = math.atan2(rail_y(-740) - rail_y(-760), 20)
    building((-750, rail_y(-750) - 48), ra, 130, 20, {'building': 'train_station', 'name': 'Gare'}, check=False)
    for off in (-6, 6, 18, 30): building((-780, rail_y(-780) + off), ra, 220, 4, {'building': 'roof'}, check=False)   # marquises des quais
    # rues bordées de rangs (vieille ville, faubourgs linéaires le long des grandes rues, lotissements)
    for pts, hw, style in row_streets:
        for a, b in zip(pts, pts[1:]):
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); st = style
            if style == 'faubourg' and math.dist(mid, CENTER) < 860: st = 'ancien'
            if style == 'faubourg' and math.dist(mid, CENTER) > 1500 and rnd.random() < 0.5: continue
            for side in (-1, 1): frontage(a, b, hw, st, side)
    # îlots des damiers : bâtiments le long des côtés bordés d'une rue ; barres et entrepôts au cœur des grands îlots
    for q, sides, style in blocks:
        c = (sum(p[0] for p in q) / 4, sum(p[1] for p in q) / 4)
        if style == 'barres':
            ang = math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]) + (math.pi / 2 if rnd.random() < 0.4 else 0)
            building(c, ang, rnd.uniform(55, 75), rnd.uniform(11, 14))
            for s in (-1, 1): building((c[0] - s * 30 * math.sin(ang), c[1] + s * 30 * math.cos(ang)), ang, rnd.uniform(30, 50), 12)
            continue
        for k in range(4):
            if not sides[k]: continue
            a, b = q[k], q[(k + 1) % 4]
            inward = 1 if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 0 else -1
            frontage(a, b, 5.5, style, inward)
        if style == 'industrie' and rnd.random() < 0.6: building(c, math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]), rnd.uniform(40, 70), rnd.uniform(25, 40))
    # hameau au-delà de la rocade : fermes autour d'un carrefour
    for k in range(9):
        a = k / 9 * 2 * math.pi; building((900 + 70 * math.cos(a), Y0 + 200 + 50 * math.sin(a)), a, rnd.uniform(14, 24), rnd.uniform(9, 14), shape='L' if k % 3 else 'rect')

def main():
    river(); old_town(); network(); railway(); parks(); districts(); buildings()
    els = [{'type': 'node', 'id': i, 'lat': k[0], 'lon': k[1]} for k, i in nodes.items()] + ways + rels
    json.dump({'version': 0.6, 'generator': 'tests/make_city.py', 'elements': els}, open(T / 'city.json', 'w'), separators=(',', ':'))
    xr = -2000
    meta = {'river': ll(xr, yc(xr)), 'bridge': ll(-900, yc(-900)), 'center': ll(*CENTER), 'castle': ll(*castle_c()), 'buildings': nb[0],
            'extent': [ll(X0, Y0), ll(X1, Y1)]}
    json.dump(meta, open(T / 'city.meta.json', 'w'), indent=1)
    print(f'city.json : {len(nodes)} nœuds, {len(ways)} chemins, {len(rels)} relation, {nb[0]} bâtiments, {(T / "city.json").stat().st_size // 1024} Ko')

if __name__ == '__main__':
    main()
