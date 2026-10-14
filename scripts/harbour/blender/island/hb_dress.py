"""The Harbour v3 - dressing: roads (the winding road to the Pharos, the coast road over the south ridge), walled
meadows, vegetation (spruce crests on the spines and behind the amphitheatre, lush A-graft trees in the town gardens,
birches, meadow + headland dressing, rock outcrops), quay life along the curved quays (lamps, bunting, stalls,
crates, nets, cranes), hamlet characters, skerries, the Shoals, buoys, the Far Ports rafts, folk, gulls, the mainland.
exec'd into build_island's namespace (after land + town)."""
from PIL import Image, ImageDraw

DRNG = random.Random(909)
set_coll(collection('dress', ROOTC))
COVES = {c['pid']: c for c in CJ['coves']}

# ------------------------------------------------------------------ occupancy raster (1 m): where nothing may grow
_xs = [p[0] for p in COAST]; _ys = [p[1] for p in COAST]
OX0, OY0, OX1, OY1 = min(_xs) - 10, min(_ys) - 10, max(_xs) + 10, max(_ys) + 10
OS = 1.0
OW, OH = int((OX1 - OX0) / OS), int((OY1 - OY0) / OS)
occ_im = Image.new('L', (OW, OH), 0); od = ImageDraw.Draw(occ_im)
o_to = lambda x, y: ((x - OX0) / OS, (OY1 - y) / OS)


def occ_poly(poly):
    od.polygon([o_to(*p) for p in poly], fill=255)


def lot_rect(lot, pad_w=1.5, pad_d=2.0):
    f = Vector((lot['face'][0], lot['face'][1])); s_ = Vector((-f.y, f.x)); c = Vector(lot['c'])
    w, d = lot['w'] / 2 + pad_w, lot['d'] / 2 + pad_d
    return [tuple(c + s_ * a + f * b) for a, b in ((-w, -d), (w, -d), (w, d + 0.6), (-w, d + 0.6))]


for lot in CJ['lots']:
    occ_poly(lot_rect(lot))
for k, L in CJ['landmarks'].items():
    if k in ('shoals', 'wreck_cove', 'far_ports', 'breakwater') or k.startswith('hamlet'):
        continue
    r = L['fp'] / 2 + 3
    occ_poly([(L['p'][0] - r, L['p'][1] - r), (L['p'][0] + r, L['p'][1] - r), (L['p'][0] + r, L['p'][1] + r), (L['p'][0] - r, L['p'][1] + r)])
for cv in CJ.get('civic', []):                                 # P6: the civic plots (+ a lane round each) stay clear
    occ_poly(plot_rect(cv, 2.5))
for name, L in QL.items():                                     # quay aprons
    depth = APRON.get(name, 3.0 if name.endswith(('-w', '-e')) else 7.0) + 1.5
    for a, b in zip(L, L[1:]):
        t = Vector(b) - Vector(a)
        if t.length < 1e-3:
            continue
        t.normalize(); nl = Vector((-t.y, t.x))
        occ_poly([a, b, tuple(Vector(b) + nl * depth), tuple(Vector(a) + nl * depth)])
for (k, pts, z) in LANES:                                       # terrace lanes + walls
    for a, b in zip(pts, pts[1:]):
        od.line([o_to(*a), o_to(*b)], fill=255, width=7)
for (th, band, p0, radial, run) in STAIRS:
    a = p0 - radial * 1.0; b = p0 + radial * (run + 2.0)
    od.line([o_to(a.x, a.y), o_to(b.x, b.y)], fill=255, width=5)
# the Customs square
for th in range(70, 112, 3):
    od.line([o_to(*town_pt(th, TOWN['r_quay'] + 6)), o_to(*town_pt(th, TOWN['r_quay'] + 31))], fill=255, width=5)
# the strands stay open (no trees, walls or meadow clutter on a beach)
for _b in CJ.get('beaches', []):
    _bx = [p[0] for p in _b['line']]; _by = [p[1] for p in _b['line']]; _m = _b['depth'] + 20.0
    for _yy in np.arange(min(_by) - _m, max(_by) + _m, 1.0):
        for _xx in np.arange(min(_bx) - _m, max(_bx) + _m, 1.0):
            if terrain.beach_k(_xx, _yy)[0] > 0.3:
                od.point(o_to(_xx, _yy), fill=255)
OCC = np.array(occ_im) > 0


def occupied(x, y):
    i, j = int((OY1 - y) / OS), int((x - OX0) / OS)
    if not (0 <= i < OH and 0 <= j < OW):
        return True
    return bool(OCC[i, j])


def on_land(x, y):
    return point_in_poly(x, y, COAST) and not occupied(x, y)


def in_crop(x, y):
    f = terrain.field_at(x, y)
    return f is not None and f['kind'] in ('hay', 'plough')


def refresh_occ():
    global OCC
    OCC = np.array(occ_im) > 0


# ------------------------------------------------------------------ ROADS: the winding road to the Pharos, the coast road
def road(ctrl_uv, width, col, name, bm, step=3.5, smooth=True, mark=True):
    pts = [wpt(*p) for p in (catmull(ctrl_uv, 6, closed=False) if smooth else ctrl_uv)]
    out = []
    dense = []
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5))
        for k in range(n):
            dense.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    dense.append(pts[-1])
    run = []
    for i, p in enumerate(dense):
        if point_in_poly(*p, COAST):
            run.append(p)
            if mark and run and len(run) > 1:
                od.line([o_to(*run[-2]), o_to(*run[-1])], fill=255, width=int(width + 2))
            if i % 2 == 0:
                out.append(p)
        else:
            ribbon(bm, run, width); run = []
    ribbon(bm, run, width)
    return out


import geom as _G
catmull = _G.catmull
ROADS = {}
road_bm = bmesh.new(); path_bm = bmesh.new()
# the winding road: Tron quay -> switchbacks up the headland's flank -> the Pharos; a spur to the keeper's cottage
ROADS['pharos'] = road(terrain.PHAROS_ROAD, terrain.ROAD_CUT_W, PAL['gravel'], 'road_pharos', road_bm)     # on its own bench (terrain.py)
# the west road: Long Quay west end -> the farms -> the windmill -> up the spine to the headland road
ROADS["west"] = road([(-131.0, -178.0), (-140.0, -152.0), (-160.0, -146.0), (-186.0, -132.0), (-200.0, -110.0), (-206.0, -80.0),
                      (-196.0, -50.0), (-176.0, -20.0), (-152.0, 4.0), (-134.0, 22.0), (-118.0, 22.0)], 3.0, PAL['gravel'], 'road_west', road_bm)
# the coast road over the south ridge, east to west, with spurs down to each hamlet
ROADS['south'] = road([(200.0, -196.0), (176.0, -214.0), (130.0, -230.0), (80.0, -238.0), (20.0, -240.0), (-40.0, -236.0),
                       (-100.0, -232.0), (-150.0, -222.0), (-196.0, -206.0), (-222.0, -186.0), (-216.0, -160.0), (-190.0, -146.0)],
                      3.0, PAL['gravel'], 'road_south', road_bm)
ROADS['east'] = road([(176.0, -150.0), (196.0, -172.0), (200.0, -196.0), (214.0, -180.0), (232.0, -170.0)], 2.6, PAL['gravel'], 'road_east', road_bm)
for pid, cv in COVES.items():
    b = Vector(cv['back']); n_ = Vector(cv['n'])
    a = b - n_ * 6.0
    u0, v0 = uvp(a.x, a.y)
    tgt = min(ROADS['south'] + ROADS['west'] + ROADS['east'], key=lambda p: (p[0] - a.x) ** 2 + (p[1] - a.y) ** 2)
    u1, v1 = uvp(*tgt)
    mid = ((u0 + u1) / 2 + 6.0, (v0 + v1) / 2)
    road([(u0, v0), mid, (u1, v1)], 2.2, PAL['earth'], 'path_' + pid, path_bm)
# footpaths: the town top to the crest; the windmill; Wreck Cove
for ctrl in ([(96.0, 128.0), (108.0, 140.0), (130.0, 146.0)], [(-206.0, -80.0), (-218.0, -110.0), (-226.0, -150.0), (-224.0, -162.0)],
             [(-196.0, -50.0), (-214.0, -54.0), (-226.0, -58.0)]):
    road(ctrl, 1.8, PAL['earth'], 'path', path_bm)
refresh_occ()
obj('land_roads', road_bm, PAL['gravel'], PT['cobble'], family='terrain', jitter=0.04)
obj('land_paths', path_bm, PAL['earth'], PT['cobble'], family='terrain', jitter=0.05)

# ------------------------------------------------------------------ dry-stone walls round the meadows (they follow the land)
walls = bmesh.new(); hedge = bmesh.new(); sheep = bmesh.new(); sheep_h = bmesh.new()
for fi, f in enumerate(terrain.FIELDS):
    p = f['poly'] + f['poly'][:1]
    for ei, (a, b) in enumerate(zip(p, p[1:])):
        # pastures and hay fields are bounded by hedgerows on some sides, dry-stone walls on the rest
        is_hedge = f['kind'] != 'plough' and (ei + fi) % 3 == 0
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / (1.6 if is_hedge else 3.0)))
        for k in range(n):
            q0 = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)
            q1 = (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)
            if not on_land(*q0) or not on_land(*q1) or DRNG.random() < 0.06:
                continue
            if is_hedge:
                r_ = DRNG.uniform(0.9, 1.5)
                merge(hedge, bm_ico(r_, (q0[0], q0[1], H(*q0) + r_ * 0.55), 1, (1.25, 1.0, 0.95), seed=DRNG.randint(0, 999), amp=0.3))
            else:
                merge(walls, nl_kit.beam((q0[0], q0[1], H(*q0) + 0.32), (q1[0], q1[1], H(*q1) + 0.32), 0.6, 0.85))
            od.line([o_to(*q0), o_to(*q1)], fill=255, width=2)
    if f['kind'] == 'pasture':           # a small flock grazing (decorative)
        xs_ = [q[0] for q in f['poly']]; ys_ = [q[1] for q in f['poly']]
        cx_, cy_ = sum(xs_) / len(xs_), sum(ys_) / len(ys_)
        for k in range(DRNG.randint(5, 9)):
            q = (cx_ + DRNG.gauss(0, 5.0), cy_ + DRNG.gauss(0, 4.0))
            if not point_in_poly(q[0], q[1], f['poly']):
                continue
            a_ = DRNG.uniform(0, 6.28); z_ = H(*q)
            merge(sheep, bm_ico(0.55, (q[0], q[1], z_ + 0.62), 1, (1.35, 0.85, 0.8), seed=DRNG.randint(0, 999), amp=0.12))
            merge(sheep_h, bm_ico(0.24, (q[0] + math.cos(a_) * 0.75, q[1] + math.sin(a_) * 0.75, z_ + 0.72), 0, (1.2, 1.0, 1.0), seed=k))
            for lx in (-0.3, 0.3):
                merge(sheep_h, bm_cyl(0.07, 0.07, 0.4, 4, (q[0] + lx * math.cos(a_), q[1] + lx * math.sin(a_), z_)))
refresh_occ()
obj('field_walls', walls, PAL['rock'], PT['ashlar'], family='prop_wall', jitter=0.12)
obj('field_hedges', hedge, face=lambda q: ((lin('#5E8238') if q.normal.z > 0.3 else lin('#4A6A2E')), PT['leaf']), family='veg', jitter=0.1)
obj('field_sheep', sheep, lin('#EEE9DD'), PT['plain'], family='veg', jitter=0.04)
obj('field_sheep_heads', sheep_h, lin('#2E2B29'), PT['plain'], family='veg')

# ------------------------------------------------------------------ VEGETATION
leafS, trunkS = bmesh.new(), bmesh.new()
leafR, trunkR = bmesh.new(), bmesh.new()
leafB, trunkB = bmesh.new(), bmesh.new()
shrub, tuft, flw, heath, bould, lich = (bmesh.new() for _ in range(6))
TREES = {'spruce': 0, 'round': 0, 'birch': 0}


ROUND_TINTS = [lin('#7FA348'), lin('#6C9440'), lin('#8DAA52'), lin('#5F8A3C'), lin('#9AA24C')]
ROUND_TINT_AT = []          # (x, y, r2, tint) per tree: the leaf faces take their tree's tint


def round_tree(p, h, rng):
    """A clustered, multi-lobe canopy (3-5 lobes of different sizes round a main crown), one of five tints per tree."""
    x, y, z = p
    merge(trunkR, bm_cyl(0.22 * h / 8, 0.14 * h / 8, h * 0.55, 5, (x, y, z - 0.3)))
    r = h * 0.3
    lobes = [(0.0, 0.0, h * 0.64, r)]
    a0 = rng.uniform(0, 6.28)
    for k in range(rng.randint(2, 4)):
        a = a0 + k * 2.1 + rng.uniform(-0.4, 0.4)
        d = r * rng.uniform(0.55, 0.85)
        lobes.append((math.cos(a) * d, math.sin(a) * d, h * rng.uniform(0.46, 0.66), r * rng.uniform(0.55, 0.78)))
    if rng.random() < 0.6:
        lobes.append((rng.uniform(-0.3, 0.3) * r, rng.uniform(-0.3, 0.3) * r, h * 0.84, r * 0.5))
    for (ox, oy, oz, rr) in lobes:
        merge(leafR, bm_ico(rr, (x + ox, y + oy, z + oz), 1, (1.0, 1.0, rng.uniform(0.78, 0.9)), seed=rng.randint(0, 999), amp=0.24))
    ROUND_TINT_AT.append((x, y, (r * 2.2) ** 2, rng.choice(ROUND_TINTS) if rng.random() > 0.06 else lin('#B49A4A')))


def scatter(n, sampler, place, min_d, rng, max_try=None, allow_crop=False):
    placed = []
    tries = 0
    grid = {}
    cell = max(min_d, 1.0)
    while len(placed) < n and tries < (max_try or n * 30):
        tries += 1
        p = sampler(rng)
        if p is None or not on_land(*p) or (not allow_crop and in_crop(*p)):
            continue
        key = (int(p[0] // cell), int(p[1] // cell))
        ok = True
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for q in grid.get((key[0] + i, key[1] + j), ()):
                    if (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 < min_d * min_d:
                        ok = False; break
        if not ok:
            continue
        grid.setdefault(key, []).append(p)
        placed.append(p)
        place(p, rng)
    return placed


def line_sampler(pts_uv, spread):
    def s(rng):
        i = rng.randrange(len(pts_uv) - 1)
        a, b = pts_uv[i], pts_uv[i + 1]
        t = rng.random()
        u = a[0] + (b[0] - a[0]) * t + rng.gauss(0, spread); v = a[1] + (b[1] - a[1]) * t + rng.gauss(0, spread)
        return wpt(u, v)
    return s


def place_spruce(p, rng):
    z = H(*p)
    h = rng.uniform(7.5, 12.5) * (1.0 if z > 12 else 0.85)
    nl_kit.spruce(leafS, trunkS, (p[0], p[1], z - 0.3), h, rng)
    TREES['spruce'] += 1


def place_round(p, rng):
    round_tree((p[0], p[1], H(*p)), rng.uniform(6.5, 9.5), rng)
    TREES['round'] += 1


def place_birch(p, rng):
    nl_kit.birch(leafB, trunkB, (p[0], p[1], H(*p) - 0.2), rng.uniform(6.0, 8.5), rng)
    TREES['birch'] += 1


# the crest behind the amphitheatre: a dark spruce band against the sky (r 124..142 round the Vagen)
CREST = [(CT_UV[0] + math.cos(math.radians(a)) * 133.0, CT_UV[1] + math.sin(math.radians(a)) * 133.0) for a in range(166, 8, -6)]
scatter(260, line_sampler(CREST, 6.5), place_spruce, 4.4, DRNG)
scatter(200, line_sampler(terrain.WEST_SPINE, 13.0), place_spruce, 4.6, DRNG)
scatter(180, line_sampler(terrain.EAST_SPINE, 12.0), place_spruce, 4.6, DRNG)
COPSES = [((-150.0, -40.0), 10, 14), ((-180.0, 20.0), 12, 16), ((-250.0, -190.0), 12, 14), ((-90.0, -250.0), 9, 8), ((100.0, -250.0), 9, 8),
          ((230.0, -40.0), 10, 12), ((210.0, 40.0), 12, 14), ((-60.0, 120.0), 7, 5), ((-150.0, 60.0), 9, 7), ((150.0, -210.0), 8, 8)]
for (c, sp, n) in COPSES:
    scatter(n, lambda r, c=c, sp=sp: wpt(c[0] + r.gauss(0, sp), c[1] + r.gauss(0, sp)), place_spruce, 4.8, DRNG, max_try=n * 30)
# lush round-crowned trees in the town gardens: between the terraces' houses, behind them, round the squares
TOWN_SPOTS = []
for k, (r0, r1, z) in enumerate(RINGS):
    th0, th1 = TOWN_TH[k]
    for i in range(60):
        TOWN_SPOTS.append(town_pt(DRNG.uniform(th1, th0), DRNG.uniform(r0 + 2, r1 + 1)))
scatter(130, lambda r: TOWN_SPOTS[r.randrange(len(TOWN_SPOTS))], place_round, 6.0, DRNG, max_try=5000)
for pid, cv in COVES.items():
    b = Vector(cv['back']); n_ = Vector(cv['n']); t_ = Vector(cv['t'])
    scatter(5, lambda r, b=b, n_=n_, t_=t_, hw=cv['hw']: tuple(b - n_ * r.uniform(14, 34) + t_ * r.uniform(-hw - 10, hw + 10)), place_round, 7.0, DRNG, max_try=300)
scatter(36, lambda r: wpt(r.uniform(-200, 220), r.uniform(-250, -200)), place_round, 9.0, DRNG, max_try=2000)
scatter(30, lambda r: wpt(r.uniform(-240, -150), r.uniform(-200, -40)), place_round, 10.0, DRNG, max_try=2000)
scatter(60, line_sampler(terrain.WEST_SPINE + [(-150.0, 40.0)], 40.0), place_birch, 8.0, DRNG, max_try=3000)
scatter(40, line_sampler(terrain.EAST_SPINE, 34.0), place_birch, 8.0, DRNG, max_try=2000)
scatter(30, line_sampler(CREST, 16.0), place_birch, 8.0, DRNG, max_try=2000)
print('TREES', TREES)


# ground dressing: shrubs, tufts, flowers, heather on the headland, boulders + lichen
def seat_z(p, r):
    """Lowest ground under a round prop of radius r: seated there it never floats off the downhill side."""
    return min(H(p[0] + dx, p[1] + dy) for dx, dy in ((0, 0), (r, 0), (-r, 0), (0, r), (0, -r)))


def place_meadow(p, rng):
    z = H(*p)
    u, v = uvp(*p)
    kind = rng.random()
    hd = terrain.head_d(u, v)
    if hd < 1.05:
        if terrain.fbm(p[0], p[1], 0.045, 2, 21) < 0.56:
            return
        for k_ in range(rng.randint(2, 4)):
            q = (p[0] + rng.uniform(-2.2, 2.2), p[1] + rng.uniform(-2.2, 2.2))
            rh = rng.uniform(0.6, 1.1)
            merge(heath, bm_ico(rh, (q[0], q[1], seat_z(q, rh * 1.3) + 0.05), 1, (1.4, 1.0, 0.45), seed=rng.randint(0, 999), amp=0.3))
        if hd > 0.8 and rng.random() < 0.5:
            rr = rng.uniform(0.8, 1.8)
            merge(bould, bm_ico(rr, (p[0], p[1], seat_z(p, rr * 1.2) + 0.05), 1, (1.25, 1.0, 0.7), seed=rng.randint(0, 999), amp=0.35))
        return
    if kind < 0.3:
        merge(shrub, bm_ico(rng.uniform(0.7, 1.3), (p[0], p[1], z + 0.4), 1, (1.2, 1.0, 0.85), seed=rng.randint(0, 999), amp=0.3))
    elif kind < 0.62:
        for q in range(3):
            a = rng.uniform(0, 6.28); h = rng.uniform(0.5, 1.0)
            merge(tuft, bm_cyl(0.14, 0.0, h, 3, (p[0] + math.cos(a) * 0.25, p[1] + math.sin(a) * 0.25, z), rot=a))
    elif kind < 0.86:
        for q in range(3):
            merge(flw, bm_cyl(0.18, 0.0, 0.34, 3, (p[0] + rng.uniform(-0.9, 0.9), p[1] + rng.uniform(-0.9, 0.9), z + 0.05), rot=rng.random()))
    else:
        rr = rng.uniform(0.6, 1.8)
        z = seat_z(p, rr * 1.2)
        merge(bould, bm_ico(rr, (p[0], p[1], z + 0.05), 1, (1.25, 1.0, 0.7), seed=rng.randint(0, 999), amp=0.35))
        if rng.random() < 0.6:
            merge(lich, bm_ico(rr * 0.5, (p[0] + rr * 0.1, p[1], z + 0.1 + rr * 0.55), 0, (1.3, 1.0, 0.25), seed=rng.randint(0, 99)))


scatter(1700, lambda r: (r.uniform(OX0, OX1), r.uniform(OY0, OY1)), place_meadow, 3.2, DRNG, max_try=60000)
# rock outcrops: clustered granite tors on the slopes (charm + breakup of the green)
OUTCROPS = [(-170.0, -70.0), (-240.0, -120.0), (-158.0, 52.0), (250.0, -90.0), (230.0, -150.0), (-30.0, -232.0), (120.0, -226.0),
            (-270.0, -170.0), (220.0, 20.0), (-200.0, 10.0), (60.0, 132.0), (-160.0, -200.0)]
for (u, v) in OUTCROPS:
    cx, cy = wpt(u, v)
    if not point_in_poly(cx, cy, COAST):
        continue
    for k in range(DRNG.randint(4, 8)):
        q = (cx + DRNG.gauss(0, 3.2), cy + DRNG.gauss(0, 3.2))
        if not on_land(*q):
            continue
        rr = DRNG.uniform(1.2, 3.4) * (1.3 if k == 0 else 1.0)
        zq = seat_z(q, rr * 1.1)
        merge(bould, bm_ico(rr, (q[0], q[1], zq + rr * 0.1), 1, (1.2, 1.0, 0.85 + DRNG.random() * 0.4), seed=DRNG.randint(0, 999), amp=0.32))
        if DRNG.random() < 0.7:
            merge(lich, bm_ico(rr * 0.45, (q[0], q[1], zq + rr * 0.9), 0, (1.3, 1.0, 0.25), seed=DRNG.randint(0, 99)))
obj('trees_spruce', leafS, face=lambda q: ((PAL['spruce_light'] if q.normal.z > 0.35 else PAL['spruce']), PT['leaf']), family='tree_spruce', jitter=0.1, seed=3)
obj('trees_spruce_trunk', trunkS, PAL['timber_dark'], PT['plain'], family='tree_spruce')
_RT_GRID = {}
for (x_, y_, r2_, t_) in ROUND_TINT_AT:
    _RT_GRID.setdefault((int(x_ // 16), int(y_ // 16)), []).append((x_, y_, r2_, t_))


def _round_face(q):
    c = q.center
    best, tint = 1e9, ROUND_TINTS[0]
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for (x_, y_, r2_, t_) in _RT_GRID.get((int(c.x // 16) + i, int(c.y // 16) + j), ()):
                d2 = (c.x - x_) ** 2 + (c.y - y_) ** 2
                if d2 < best:
                    best, tint = d2, t_
    k = 1.08 if q.normal.z > 0.45 else (0.94 if q.normal.z > -0.1 else 0.72)      # sunlit crowns, shaded undersides
    return (tuple(ch * k for ch in tint), PT['leaf'])


obj('trees_round', leafR, face=_round_face, family='tree_round', jitter=0.07, seed=4)
obj('trees_round_trunk', trunkR, PAL['timber_dark'], PT['plain'], family='tree_round')
obj('trees_birch', leafB, face=lambda q: ((PAL['birch_leaf2'] if noise.noise(q.center * 0.15) > 0.15 else PAL['birch_leaf']), PT['leaf']), family='tree_birch', jitter=0.08, seed=5)
obj('trees_birch_trunk', trunkB, PAL['birch_bark'], PT['plain'], family='tree_birch')
obj('veg_shrubs', shrub, face=lambda q: ((PAL['spruce_light'] if q.normal.z > 0.3 else PAL['grass_dark']), PT['leaf']), family='veg', jitter=0.08)
obj('veg_tufts', tuft, face=lambda q: ((PAL['grass_light'] if q.index % 3 == 0 else PAL['grass_dark']), PT['leaf']), family='veg', jitter=0.1)
obj('veg_flowers', flw, face=lambda q: ((PAL['flower_y'], PAL['flower_w'], PAL['flower_p'], PAL['rowan_berry'])[(q.index // 25) % 4], 0), family='veg')
obj('veg_heather', heath, face=lambda q: ((PAL['heather'] if q.normal.z > 0.3 else lin('#5E4A5C')), PT['leaf']), family='veg', jitter=0.1)
obj('land_boulders', bould, face=lambda q: ((PAL['rock_light'] if q.normal.z > 0.5 else PAL['rock']), PT['rock']), family='rock', jitter=0.08)
obj('land_lichen', lich, PAL['lichen'], PT['rock'], family='rock', jitter=0.1)

# ------------------------------------------------------------------ QUAY LIFE
LAMP_PTS = []
LAMP_LIGHTS = []         # (x, y, z, kind, colour) -> layout lights
lampb = bmesh.new(); lglass = bmesh.new(); pennb = bmesh.new()
PENN_COLS = []


def lamp(p, z, h=3.6, pennant=None, kind='lamp'):
    x, y = p
    merge(lampb, bm_cyl(0.18, 0.18, 0.5, 6, (x, y, z), cap=False))
    merge(lampb, bm_cyl(0.09, 0.06, h, 4, (x, y, z + 0.4), cap=False))
    merge(lampb, bm_cyl(0.32, 0.05, 0.3, 6, (x, y, z + h + 0.75)))
    merge(lglass, bm_cyl(0.2, 0.26, 0.55, 6, (x, y, z + h + 0.2)))
    LAMP_PTS.append(Vector((x, y, z + h + 0.45)))
    LAMP_LIGHTS.append((x, y, z + h + 0.45, kind, pennant))
    if pennant:
        merge(lampb, bm_cyl(0.04, 0.03, 1.6, 4, (x, y, z + h + 1.2)))
        f = bmesh.new()
        vs = [f.verts.new(v) for v in ((x, y, z + h + 2.7), (x + 1.3, y + 0.2, z + h + 2.55), (x + 0.95, y + 0.15, z + h + 2.38),
                                        (x + 1.3, y + 0.2, z + h + 2.2), (x, y, z + h + 2.1))]
        f.faces.new(vs)
        n0 = len(pennb.faces)
        merge(pennb, f)
        PENN_COLS.append((n0, len(pennb.faces), lin(pennant)))


def along_line(line, step, inset, start=None):
    """Points every `step` m along a quay line, `inset` m to its land side, with the tangent."""
    out = []
    Lw = polyline_len(line)
    s = start if start is not None else step / 2
    while s < Lw:
        p, t = along(line, s)
        nl = (-t[1], t[0])
        out.append(((p[0] + nl[0] * inset, p[1] + nl[1] * inset), t, nl))
        s += step
    return out


for name, L in QL.items():
    if name.endswith(('-w', '-e')) or name == 'yard':
        continue
    step = {'grand': 21.0, 'long': 26.0, 'tron': 20.0, 'wharf': 24.0, 'battery': 18.0}.get(name, 22.0)
    for (p, t, nl) in along_line(L, step, 1.8):
        lamp(p, Z_SHORE + 0.06)
for (k, pts, z) in LANES:
    for i in range(3, len(pts) - 2, 9):
        if not in_pad(*pts[i], 1.5):
            lamp(pts[i], z + 0.04)
for (x, y, z, kind, col) in CJ['lamps']:
    lamp((x, y), z, 3.0 if z < 2 else 3.4, pennant=col if kind == 'pierhead' else None, kind=kind)
obj('lamps_posts', lampb, PAL['iron'], PT['metal'], family='prop_lamp')
obj('lamps_glass', lglass, mat=M['lamp'], family='prop_lamp', shadow=False)
if len(pennb.faces):
    obj('lamps_pennants', pennb, face=lambda q: (next((c for (a, b, c) in PENN_COLS if a <= q.index < b), PAL['trim']), PT['plain']), family='prop_lamp', jitter=0.0)
else:
    pennb.free()

# bunting (A graft): catenary strings of little flags along the Vagen promenade and across the hamlet coves
bunt_line = bmesh.new(); bunt = bmesh.new()
BCOLS = [PAL['hull_red'], PAL['flower_w'], PAL['wall_ochre'], PAL['hull_blue'], PAL['door_green'], PAL['flower_y']]


def bunting(a, b, sag):
    pts = nl_kit.catenary(a, b, sag, 10)
    for p, q in zip(pts, pts[1:]):
        merge(bunt_line, nl_kit.line3(p, q, 0.02))
    n = int((b - a).length / 1.0)
    t = (b - a).normalized()
    for k in range(1, n):
        u_ = k / n
        p = a.lerp(b, u_); p.z -= sag * 4 * u_ * (1 - u_)
        f = bmesh.new()
        vs = [f.verts.new(v) for v in (tuple(p - t * 0.32), tuple(p + t * 0.32), (p.x, p.y, p.z - 0.62))]
        f.faces.new(vs)
        merge(bunt, f)


gp = along_line(QL['grand'], 21.0, 1.8)
for (p0, _, _), (p1, _, _) in zip(gp, gp[1:]):
    bunting(Vector((p0[0], p0[1], Z_SHORE + 4.3)), Vector((p1[0], p1[1], Z_SHORE + 4.3)), 1.1)
for pid, cv in COVES.items():
    qa, qb = Vector(cv['qa']), Vector(cv['qb']); n_ = Vector(cv['n'])
    a = qa - n_ * 1.6; b = qb - n_ * 1.6
    bunting(Vector((a.x, a.y, Z_SHORE + 4.0)), Vector((b.x, b.y, Z_SHORE + 4.0)), 1.2)
obj('bunting_lines', bunt_line, PAL['tar'], PT['plain'], family='prop_bunting')
obj('bunting_flags', bunt, face=lambda q: (BCOLS[q.index % len(BCOLS)], PT['plain']), family='prop_bunting', jitter=0.0)

# market stalls with striped awnings on the Customs square + the promenade (A graft) + fish boxes
stall = bmesh.new(); awn = bmesh.new(); awn_cols = []; boxes = bmesh.new()
STALLS = [(128.0, 13.0), (100.0, 13.0), (144.0, 12.5), (84.0, 13.0)]
for i, (th, dr) in enumerate(STALLS):
    p = Vector(town_pt(th, TOWN['r_quay'] + dr)); fdir = (Vector(town_pt(th, 0)) - p).normalized(); sd = Vector((-fdir.y, fdir.x))
    ang = math.atan2(sd.y, sd.x)
    sb = bmesh.new()
    merge(sb, bm_box2(-2.0, -0.6, Z_SHORE, 2.0, 0.6, Z_SHORE + 1.0))
    for dx in (-1.9, 1.9):
        for dy in (-1.3, 0.5):
            merge(sb, bm_box2(dx - 0.06, dy - 0.06, Z_SHORE, dx + 0.06, dy + 0.06, Z_SHORE + 2.6))
    xf(sb, rz=ang + math.pi); xf(sb, loc=(p.x, p.y, 0)); merge(stall, sb)
    col = (PAL['hull_red'], PAL['hull_blue'], PAL['door_green'], PAL['wall_ochre'], PAL['hull_red'])[i % 5]
    for k in range(8):
        x0 = -2.2 + k * 0.55
        b = bm_box2(x0, -1.7, -0.03, x0 + 0.55, 0.7, 0.03)
        for v in b.verts:
            v.co.z += Z_SHORE + 2.6 + (v.co.y - 0.7) * -0.35
        xf(b, rz=ang + math.pi); xf(b, loc=(p.x, p.y, 0))
        n0 = len(awn.faces); merge(awn, b)
        awn_cols.append((n0, len(awn.faces), col if k % 2 == 0 else PAL['trim']))
    bx = bmesh.new()
    for k in range(6):
        merge(bx, bm_box2(-1.8 + k * 0.62, -0.5, Z_SHORE + 1.0, -1.25 + k * 0.62, 0.5, Z_SHORE + 1.25))
    xf(bx, rz=ang + math.pi); xf(bx, loc=(p.x, p.y, 0)); merge(boxes, bx)
obj('quay_stalls', stall, PAL['timber'], PT['boards'], family='prop_stall')
obj('quay_awnings', awn, face=lambda q: (next((c for (a, b, c) in awn_cols if a <= q.index < b), PAL['trim']), PT['plain']), family='prop_stall', jitter=0.0)
obj('quay_fishboxes', boxes, face=lambda q: ((PAL['brand_usdc'] if int(q.center.x * 10) % 3 else PAL['wall_white']), 0), family='prop_stall')

# crates, barrels, nets, coils along the aprons
cr, br, nets, corks, coils = (bmesh.new() for _ in range(5))
CLUTTER = []
for name, L in QL.items():
    if name.endswith(('-w', '-e')) or name == 'yard':
        continue
    for (p, t, nl) in along_line(L, {'grand': 34.0, 'long': 30.0, 'wharf': 18.0}.get(name, 26.0), 4.5, start=9.0):
        if not in_pad(*p, 2.0):
            CLUTTER.append((p, t, DRNG.randint(3, 6)))
for (p, t, n) in CLUTTER:
    tv = Vector((t[0], t[1])); nv = Vector((-t[1], t[0])); c0 = Vector(p)
    ang = math.atan2(t[1], t[0])
    for k in range(n):
        q = c0 + tv * ((k % 3) * 1.1) + nv * ((k // 3) * 0.9)
        nl_kit.crate(cr, (q.x, q.y, Z_SHORE + 0.06 + (0.75 if k == n - 1 and n > 3 else 0)), DRNG.uniform(0.8, 1.0), ang + DRNG.uniform(-0.2, 0.2))
    for k in range(DRNG.randint(1, 3)):
        q = c0 + tv * (4.0 + k * 0.85)
        nl_kit.barrel(br, (q.x, q.y, Z_SHORE + 0.06), DRNG.uniform(0.9, 1.05))
    if DRNG.random() < 0.6:
        r = DRNG.uniform(0.9, 1.4); q = c0 - tv * 2.5
        merge(nets, bm_ico(r, (q.x, q.y, Z_SHORE + 0.15), 2, (1.3, 1.0, 0.42), seed=int(abs(q.x)), amp=0.25))
        for k in range(5):
            a = DRNG.uniform(0, 6.28)
            merge(corks, bm_ico(0.17, (q.x + math.cos(a) * r, q.y + math.sin(a) * r * 0.8, Z_SHORE + 0.45), 0, seed=k))
for (x, y, z) in CJ['bollards'][::7]:
    t = bm_cyl(0.5, 0.5, 0.18, 10, (x + 1.2, y, z)); merge(t, bm_cyl(0.32, 0.32, 0.2, 10, (x + 1.2, y, z + 0.18)))
    merge(coils, t)
obj('props_crates', cr, PAL['timber'], PT['boards'], family='prop_crate', jitter=0.14, bevel=0.03)
obj('props_barrels', br, face=lambda q: ((PAL['timber_dark'] if (q.center.z % 0.45) < 0.08 else PAL['timber']), PT['boards']), family='prop_barrel', jitter=0.05)
obj('props_nets', nets, lin('#596B52'), PT['leaf'], family='prop_nets', jitter=0.1, smooth=True)
obj('props_corks', corks, face=lambda q: ((PAL['wall_ochre'] if q.index % 40 < 20 else PAL['brand_red']), 0), family='prop_nets')
obj('props_coils', coils, PAL['rope'], PT['plain'], family='prop_rope', jitter=0.05)

# benches on the squares + lanes
bench = bmesh.new()
for (th, r_, k) in ((126.0, 60.0, 2), (62.0, 60.0, 2), (134.0, 14.0, 0)):
    p = Vector(town_pt(th, TOWN['r_quay'] + r_)); z = RINGS[k][2]
    fdir = (Vector(town_pt(th, 0)) - p).normalized(); ang = math.atan2(fdir.y, fdir.x) + math.pi / 2
    b = bmesh.new()
    merge(b, bm_box2(-0.9, -0.25, 0.45, 0.9, 0.25, 0.55)); merge(b, bm_box2(-0.9, 0.2, 0.55, 0.9, 0.28, 1.0))
    for dx in (-0.75, 0.75):
        merge(b, bm_box2(dx - 0.05, -0.2, 0, dx + 0.05, 0.2, 0.45))
    xf(b, rz=ang); xf(b, loc=(p.x, p.y, z)); merge(bench, b)
obj('props_benches', bench, PAL['timber'], PT['boards'], family='prop_bench')


def hand_crane(name, cx_, cy_, z, rz=0.0, col='hull_red'):
    cn = bmesh.new()
    merge(cn, bm_box2(-0.8, -0.8, 0, 0.8, 0.8, 0.6))
    merge(cn, bm_cyl(0.28, 0.22, 5.5, 8, (0, 0, 0.6)))
    merge(cn, nl_kit.beam((0, 0, 1.8), (-1.0, -5.0, 6.6), 0.3, 0.3))
    merge(cn, nl_kit.beam((0, 0, 6.1), (-1.0, -5.0, 6.6), 0.16, 0.16))
    merge(cn, nl_kit.line3((-1.0, -5.0, 6.6), (-1.0, -5.0, 2.2), 0.03))
    merge(cn, bm_box2(-1.4, -5.4, 1.4, -0.6, -4.6, 2.2))
    xf(cn, rz=rz); xf(cn, loc=(cx_, cy_, z))
    obj(name, cn, face=lambda q: ((PAL[col] if q.center.z > z + 0.7 else PAL['iron']), PT['metal']), family='prop_crane')


def crane_on(line, s_, name, col='hull_red'):
    p, t = along(line, polyline_len(line) * s_)
    nl = (-t[1], t[0])
    c = (p[0] + nl[0] * 2.0, p[1] + nl[1] * 2.0)
    hand_crane(name, c[0], c[1], Z_SHORE, rz=math.atan2(-nl[0], nl[1]), col=col)      # jib (local -y) out over the water


crane_on(QL['grand'], 0.82, 'crane_vagen')
crane_on(QL['wharf'], 0.55, 'crane_wharf', 'wall_ochre')
crane_on(QL['long'], 0.15, 'crane_longquay')

# ------------------------------------------------------------------ HAMLET CHARACTERS (in each cove's own frame)
def cove_pt(cv, along_t, out_n):
    return tuple(Vector(cv['back']) + Vector(cv['t']) * along_t + Vector(cv['n']) * out_n)


def cove_rz(cv):
    n_ = cv['n']
    return math.atan2(n_[0], -n_[1])


cv = COVES['pier-hyperliquid-l1']; p = cove_pt(cv, cv['hw'] - 3, -3)
obj('hamlet_hyper_beacon', bm_cyl(1.6, 1.3, 9.0, 12, (p[0], p[1], Z_SHORE)), face=lambda q: ((lin('#5FD3BC') if (q.center.z % 2.2) < 1.1 else PAL['wall_white']), PT['render']), family='hamlet')
obj('hamlet_hyper_beacon_cap', bm_cyl(1.5, 0.2, 1.3, 12, (p[0], p[1], Z_SHORE + 9.0)), PAL['iron'], PT['metal'], family='hamlet')
obj('hamlet_hyper_beacon_lamp', bm_cyl(0.9, 0.9, 1.0, 10, (p[0], p[1], Z_SHORE + 8.0)), mat=M['lamp'], family='hamlet', shadow=False)
LAMP_PTS.append(Vector((p[0], p[1], Z_SHORE + 8.5))); LAMP_LIGHTS.append((p[0], p[1], Z_SHORE + 8.5, 'pierhead', '#5FD3BC'))
# Polygon: boatyard - a hull on stocks + timber stacks
cv = COVES['pier-polygon']
P_ = dict(br=0.3, fb=0.11, dr=0.06, bow=2.2, stern=0.6, sheer=(0.3, 0.15), bulwark=0.2)
hc = dict(top=PAL['timber'], band=PAL['timber'], stripe=PAL['timber'], rail=PAL['timber_dark'], boot=PAL['timber'], bottom=PAL['antifoul'],
          deck=PAL['timber'], deck_in=PAL['timber'], transom=PAL['timber'])
hb_, names, D_ = nl_kit.hull_mesh(12.0, P_, hc, n=10)
lay = hb_.faces.layers.int.get('seg'); segs = {f.index: names[f[lay]] for f in hb_.faces}
p = cove_pt(cv, -cv['hw'] - 12, -10)
xf(hb_, loc=(p[0], p[1], H(*p) + 1.6), rz=cove_rz(cv) + math.radians(90))
obj('hamlet_polygon_hull_on_stocks', hb_, face=lambda q: ((PAL['antifoul'] if segs.get(q.index) == 'bottom' else PAL['timber']), PT['strakes']), family='hamlet')
stk = bmesh.new()
for k in range(5):
    q = cove_pt(cv, -cv['hw'] - 16 + k * 2.4, -14)
    merge(stk, nl_kit.obox((q[0], q[1], H(*q) + 0.6), tuple(cv['n']) + (0,), 4.0, 0.6, 1.2 + (0.4 if k in (1, 3) else 0)))
obj('hamlet_polygon_stocks', stk, PAL['timber_dark'], PT['boards'], family='hamlet')
# Arbitrum: rope-walk - a long low shed + coils
cv = COVES['pier-arbitrum']
p = cove_pt(cv, 0, -30); rz_ = cove_rz(cv); zr = H(*p)
rw = bm_box2(-14, -2.25, -1.5, 14, 2.25, 2.6); xf(rw, rz=rz_); xf(rw, loc=(p[0], p[1], zr))
obj('hamlet_arbitrum_ropewalk', rw, PAL['wall_blue'], PT['boards'], family='hamlet', bevel=0.04)
rr_ = bmesh.new()
vs = [rr_.verts.new(v) for v in ((-14.3, -2.65, 2.6), (14.3, -2.65, 2.6), (14.3, 0, 3.8), (-14.3, 0, 3.8), (-14.3, 2.65, 2.6), (14.3, 2.65, 2.6))]
rr_.faces.new((vs[0], vs[1], vs[2], vs[3])); rr_.faces.new((vs[3], vs[2], vs[5], vs[4]))
xf(rr_, rz=rz_); xf(rr_, loc=(p[0], p[1], zr))
obj('hamlet_arbitrum_ropewalk_roof', rr_, PAL['roof_tar'], PT['boards'], family='hamlet')
coils2 = bmesh.new()
for k in range(5):
    q = cove_pt(cv, -10 + k * 4.5, -24)
    merge(coils2, bm_cyl(0.7, 0.7, 0.35, 12, (q[0], q[1], H(*q)))); merge(coils2, bm_cyl(0.45, 0.45, 0.38, 12, (q[0], q[1], H(*q) + 0.35)))
obj('hamlet_arbitrum_coils', coils2, PAL['rope'], PT['plain'], family='hamlet')
# Base: hjell drying racks of stockfish
cv = COVES['pier-base']
racks = bmesh.new(); fish = bmesh.new()
for (at, an) in ((-cv['hw'] - 10, -16), (cv['hw'] + 8, -18)):
    o = Vector(cove_pt(cv, at, an)); tt = Vector(cv['t']); nn_ = Vector(cv['n'])
    z = H(o.x, o.y)
    L_ = 9.0
    for k in range(3):
        yy = o - nn_ * (k * L_ / 2)
        for s in (-1, 1):
            merge(racks, nl_kit.beam((yy.x, yy.y, z), (yy.x + tt.x * s * 0.9, yy.y + tt.y * s * 0.9, z + 2.6), 0.14, 0.14))
    e = o - nn_ * L_
    merge(racks, nl_kit.beam((o.x, o.y, z + 2.45), (e.x, e.y, z + 2.45), 0.14, 0.14))
    for s in (-0.5, 0.5):
        a_ = o + tt * s; b_ = e + tt * s
        merge(racks, nl_kit.beam((a_.x, a_.y, z + 1.6), (b_.x, b_.y, z + 1.6), 0.1, 0.1))
    for k in range(20):
        yy = o - nn_ * (0.2 + k * (L_ - 0.4) / 19)
        for off_, zz in ((-0.5, z + 1.6), (0.5, z + 1.6), (0.0, z + 2.45)):
            q = yy + tt * off_
            merge(fish, bm_box(0.14, 0.12, 0.7, (q.x, q.y, zz - 0.4)))
obj('hamlet_base_hjell', racks, PAL['timber_grey'], PT['plain'], family='hamlet')
obj('hamlet_base_stockfish', fish, lin('#B8A07A'), PT['plain'], family='hamlet', jitter=0.15)
# Solana: merchant wharf crane; BSC: lumber stacks + an ochre crane
cv = COVES['pier-solana']
p = cove_pt(cv, -cv['hw'] + 4, -4); hand_crane('hamlet_solana_crane', p[0], p[1], Z_SHORE, rz=cove_rz(cv) + 0.3, col='brand_violet')
cv = COVES['pier-bsc']
lum = bmesh.new()
for k in range(3):
    q = cove_pt(cv, -cv['hw'] + 6 + k * 3.6, -5)
    for j in range(4):
        merge(lum, nl_kit.obox((q[0], q[1], H(*q) + j * 0.42 + 0.19), tuple(cv['n']) + (0,), 4.5, 2.8, 0.38))
obj('hamlet_bsc_lumber', lum, PAL['timber'], PT['plain'], family='hamlet', jitter=0.1)
p = cove_pt(cv, cv['hw'] - 4, -4); hand_crane('hamlet_bsc_crane', p[0], p[1], Z_SHORE, rz=cove_rz(cv) - 0.3, col='wall_ochre')

# ------------------------------------------------------------------ STRANDS (v4): Wreck Cove's sand and shingle, the coves' pebble beaches
# shingle along the waterline, driftwood under the dunes, old stakes in the shallows; pebbles, upturned dinghies and
# net posts on the cove beaches; granite rocks off every cove's arms
peb, drift_w, stakes, dinghy, dinghy_in, crock, marram = (bmesh.new() for _ in range(7))
SRNG = random.Random(4242)


def strand_pts(line, step, inland0, inland1, rng):
    out = []
    Ls = polyline_len(line); s_ = rng.uniform(0, step)
    while s_ < Ls:
        p, t = along(line, s_)
        nl = Vector((-t[1], t[0]))
        q = Vector(p) + nl * rng.uniform(inland0, inland1) + Vector(t) * rng.uniform(-step * 0.4, step * 0.4)
        out.append((q, Vector(t), nl))
        s_ += step * rng.uniform(0.6, 1.4)
    return out


for b in CJ.get('beaches', []):
    line = [tuple(p) for p in b['line']]
    if b['kind'] == 'sand':
        for (q, t, nl) in strand_pts(line, 0.9, -0.5, 3.6, SRNG):                 # the shingle band
            if point_in_poly(q.x, q.y, COAST) or SRNG.random() < 0.5:
                r_ = SRNG.uniform(0.18, 0.42)
                merge(peb, bm_ico(r_, (q.x, q.y, max(H(q.x, q.y), 0.05) + r_ * 0.25), 0, (1.3, 1.0, 0.6), seed=SRNG.randint(0, 99)))
        for (q, t, nl) in strand_pts(line, 4.2, 41.0, 46.0, SRNG):               # driftwood under the dunes
            if not point_in_poly(q.x, q.y, COAST):
                continue
            a_ = math.atan2(t.y, t.x) + SRNG.uniform(-0.6, 0.6); L_ = SRNG.uniform(2.8, 7.5); r_ = SRNG.uniform(0.16, 0.34)
            d_ = Vector((math.cos(a_), math.sin(a_)))
            pa, pb = q - d_ * L_ / 2, q + d_ * L_ / 2
            merge(drift_w, nl_kit.beam((pa.x, pa.y, H(pa.x, pa.y) + r_ * 0.7), (pb.x, pb.y, H(pb.x, pb.y) + r_ * 0.7), r_ * 2, r_ * 1.7))
            if SRNG.random() < 0.4:                                               # a root boss
                merge(drift_w, bm_ico(r_ * 1.9, (pa.x, pa.y, H(pa.x, pa.y) + r_), 1, (1.0, 1.0, 0.8), seed=SRNG.randint(0, 99), amp=0.4))
        for (q, t, nl) in strand_pts(line, 2.2, 37.0, 47.0, SRNG):               # marram tufts on the dune foot
            if SRNG.random() < 0.55:
                continue
            z0 = H(q.x, q.y)
            for k_ in range(SRNG.randint(3, 6)):
                a_ = SRNG.uniform(0, 6.28); h_ = SRNG.uniform(0.45, 0.95)
                merge(marram, bm_cyl(0.12, 0.0, h_, 3, (q.x + math.cos(a_) * 0.35, q.y + math.sin(a_) * 0.35, z0 - 0.05), rot=a_))
        for (q, t, nl) in strand_pts(line, 13.0, -9.0, -3.0, SRNG):              # old stakes in the shallows, leaning
            lean = SRNG.uniform(-0.25, 0.25)
            top = q + nl * lean * 2.0
            merge(stakes, nl_kit.beam((q.x, q.y, -1.6), (top.x, top.y, SRNG.uniform(1.2, 2.4)), 0.28, 0.28))
    else:
        for (q, t, nl) in strand_pts(line, 0.55, -0.3, 6.5, SRNG):                # the pebbles
            r_ = SRNG.uniform(0.12, 0.34)
            merge(peb, bm_ico(r_, (q.x, q.y, max(H(q.x, q.y), 0.05) + r_ * 0.2), 0, (1.25, 1.0, 0.65), seed=SRNG.randint(0, 99)))
        n_d = SRNG.randint(1, 2)
        for k in range(n_d):                                                      # dinghies drawn up, keel to the sky
            p, t = along(line, polyline_len(line) * SRNG.uniform(0.25, 0.85))
            nl = Vector((-t[1], t[0])); q = Vector(p) + nl * SRNG.uniform(3.0, 5.5)
            hb_, _nm, _D = nl_kit.hull_mesh(4.2, dict(br=0.36, fb=0.14, dr=0.05, bow=2.0, stern=0.7, sheer=(0.3, 0.15), bulwark=0.1), {}, n=8)
            xf(hb_, rx=math.pi, rz=math.atan2(nl.y, nl.x) + SRNG.uniform(-0.5, 0.5))
            xf(hb_, loc=(q.x, q.y, H(q.x, q.y) + 0.62))
            merge(dinghy if k % 2 == 0 else dinghy_in, hb_)
        for (q, t, nl) in strand_pts(line, 6.0, 7.0, 8.5, SRNG):                 # net posts + a line between
            z0 = H(q.x, q.y)
            merge(stakes, bm_cyl(0.09, 0.07, 2.1, 5, (q.x, q.y, z0 - 0.2)))
for (x, y, r) in CJ.get('cove_rocks', []):
    merge(crock, bm_ico(r, (x, y, SRNG.uniform(-0.4, 0.2)), 1, (1.25, 1.0, 0.8), seed=int(abs(x * 3 + y)), amp=0.35))
    if SRNG.random() < 0.5:
        merge(crock, bm_ico(r * 0.55, (x + r * 0.9, y - r * 0.4, -0.3), 1, (1.2, 1.0, 0.7), seed=int(abs(x + y * 3)), amp=0.3))
obj('strand_pebbles', peb, face=lambda q: ((lin('#B3AC9D'), lin('#8E887E'), lin('#C7B79A'), lin('#77746F'))[q.index // 7 % 4], PT['plain']), family='rock', jitter=0.1)
obj('strand_driftwood', drift_w, face=lambda q: ((lin('#C9BCA6') if q.normal.z > 0.3 else lin('#9C8F7C')), PT['plain']), family='prop_crate', jitter=0.08)
obj('strand_stakes', stakes, lin('#5A4B3E'), PT['plain'], family='prop_crate', jitter=0.1)
obj('strand_dinghies', dinghy, face=lambda q: ((PAL['hull_blue'] if q.normal.z > -0.3 else PAL['hull_white']), PT['strakes']), family='prop_crate', jitter=0.05)
obj('strand_dinghies_red', dinghy_in, face=lambda q: ((PAL['hull_red'] if q.normal.z > -0.3 else PAL['hull_white']), PT['strakes']), family='prop_crate', jitter=0.05)
obj('strand_marram', marram, face=lambda q: ((lin('#A7A65A') if q.index % 3 else lin('#7F8C47')), PT['leaf']), family='veg', jitter=0.1)
obj('cove_rocks', crock, face=lambda q: ((PAL['rock_wet'] if q.center.z < 0.35 else (PAL['rock_light'] if q.normal.z > 0.5 else PAL['rock'])), PT['rock']), family='rock', jitter=0.08)

# ------------------------------------------------------------------ SKERRIES: granite humps, a grass cap, a few wind-bent spruces
from mathutils.geometry import tessellate_polygon
skL, skT = bmesh.new(), bmesh.new()
for i, sk in enumerate(CJ['skerries']):
    poly = [tuple(p) for p in sk['poly']]
    cx_ = sum(p[0] for p in poly) / len(poly); cy_ = sum(p[1] for p in poly) / len(poly)
    top = sk['top']
    coast_skirt(f'skerry_{i}', poly, lambda x, y, top=top: top * 0.55, lambda x, y: False, rows=3, amp=1.4, seed=40 + i, jag=1.2)
    capb = bmesh.new(); rings = []
    for r_, z_ in ((1.0, top * 0.55), (0.72, top * 0.85), (0.4, top)):
        rings.append([capb.verts.new((cx_ + (x - cx_) * r_, cy_ + (y - cy_) * r_, z_ + noise.noise(Vector((x * 0.2, y * 0.2, r_))) * 0.3)) for x, y in poly])
    for a_, b_ in zip(rings, rings[1:]):
        for k in range(len(poly)):
            j = (k + 1) % len(poly)
            capb.faces.new((a_[k], a_[j], b_[j], b_[k]))
    for (i0, i1, i2) in tessellate_polygon([[v.co for v in rings[-1]]]):
        try:
            capb.faces.new((rings[-1][i0], rings[-1][i1], rings[-1][i2]))
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(capb, faces=capb.faces)
    g_ = sk['grass']
    obj(f'skerry_{i}_cap', capb, face=lambda q, g_=g_: ((PAL['grass_dark'] if (g_ and q.normal.z > 0.75) else (PAL['rock_light'] if q.normal.z > 0.5 else PAL['rock'])),
                                                       PT['grass'] if (g_ and q.normal.z > 0.75) else PT['rock']), family='rock', jitter=0.06)
    if g_:
        for k in range(3):
            sp = (cx_ + DRNG.uniform(-5, 5), cy_ + DRNG.uniform(-3, 3))
            nl_kit.spruce(skL, skT, (sp[0], sp[1], top - 0.4), DRNG.uniform(5.0, 7.5), DRNG)
    CIRCLES_EXTRA.append((cx_, cy_, 1.0))
obj('skerry_spruce', skL, face=lambda q: ((PAL['spruce_light'] if q.normal.z > 0.35 else PAL['spruce']), PT['leaf']), family='tree_spruce', jitter=0.1)
obj('skerry_spruce_trunk', skT, PAL['timber_dark'], PT['plain'], family='tree_spruce')

# ------------------------------------------------------------------ SHOALS reef: rocks + cardinal buoys; MOORING buoys; FAR PORTS rafts
rk = bmesh.new()
for (x, y, r) in CJ['shoals']['rocks']:
    merge(rk, bm_ico(r, (x, y, DRNG.uniform(-0.5, 0.4)), 1, (1.3, 1.0, 0.7), seed=int(x * 7 + y), amp=0.35))
obj('shoals_rocks', rk, face=lambda q: ((PAL['rock_wet'] if q.center.z < 0.35 else PAL['rock']), PT['rock']), family='shoals', jitter=0.08)
cb = bmesh.new()
for (x, y) in CJ['shoals']['buoys']:
    merge(cb, bm_cyl(0.75, 0.85, 1.2, 8, (x, y, -0.3)))
    merge(cb, bm_cyl(0.12, 0.12, 3.0, 6, (x, y, 0.9)))
    merge(cb, bm_cyl(0.0, 0.55, 0.8, 8, (x, y, 3.7)))
    merge(cb, bm_cyl(0.55, 0.0, 0.8, 8, (x, y, 4.5)))
obj('shoals_buoys', cb, face=lambda q: ((PAL['hull_red'] if int((q.center.z + 0.3) / 0.75) % 2 == 0 else PAL['wall_white']), PT['plain']), family='shoals')
# P6 (D18): the reef beacon - a squat granite tower on the reef's biggest rock, red-and-white day-mark cage, a red light
_bc = CJ['shoals']['beacon']
bb_, bt_, bm_ = bmesh.new(), bmesh.new(), bmesh.new()
merge(bb_, bm_cyl(3.6, 3.0, 2.2, 14, (_bc[0], _bc[1], -1.5)))
for k in range(4):
    merge(bt_, bm_cyl(2.3 - 0.18 * k, 2.3 - 0.18 * (k + 1), 1.6, 12, (_bc[0], _bc[1], 0.7 + k * 1.6), cap=(k == 3)))
merge(bm_, bm_cyl(2.0, 2.0, 0.2, 12, (_bc[0], _bc[1], 7.1)))
for k in range(8):
    a_ = 2 * math.pi * k / 8
    merge(bm_, nl_kit.beam((_bc[0] + math.cos(a_) * 1.4, _bc[1] + math.sin(a_) * 1.4, 7.2), (_bc[0] + math.cos(a_) * 0.2, _bc[1] + math.sin(a_) * 0.2, 10.4), 0.16, 0.16))
merge(bm_, bm_sphere(0.9, (_bc[0], _bc[1], 10.8), 10, 6))
obj('shoals_beacon_base', bb_, face=lambda q: ((PAL['rock_wet'] if q.center.z < 0.3 else PAL['granite']), PT['rock']), family='shoals', jitter=0.06)
obj('shoals_beacon_tower', bt_, face=lambda q: ((PAL['hull_red'] if int((q.center.z - 0.7) / 1.6) % 2 == 0 else PAL['wall_white']), PT['ashlar']), family='shoals', bevel=0.03)
obj('shoals_beacon_daymark', bm_, PAL['iron'], PT['metal'], family='shoals')
obj('shoals_beacon_lamp', bm_cyl(0.75, 0.75, 1.0, 10, (_bc[0], _bc[1], 7.3)), mat=M['beacon_red'], family='shoals', shadow=False)
LAMP_PTS.append(Vector((_bc[0], _bc[1], 7.8)))
mb = bmesh.new()
for m_ in CJ['moorings']:
    x, y = m_['buoy']
    merge(mb, bm_cyl(0.45, 0.2, 0.55, 5, (x, y, -0.15)))
obj('mooring_buoys', mb, face=lambda q: ((PAL['hull_red'] if q.normal.z > 0.5 else lin('#E8E2D6')), PT['plain']), family='mooring')
fr, fpile, ffloat = bmesh.new(), bmesh.new(), bmesh.new()
for (a, b) in CJ['far']['rafts']:
    L_ = math.hypot(b[0] - a[0], b[1] - a[1])
    dx, dy = (b[0] - a[0]) / L_, (b[1] - a[1]) / L_
    # plank deck in short sections (a slight stagger reads as separate floating pontoon units), drum floats below
    n_sec = max(1, int(L_ / 7.5))
    for k in range(n_sec):
        t0, t1 = k * L_ / n_sec + 0.15, (k + 1) * L_ / n_sec - 0.15
        za = 0.32 + 0.04 * math.sin(k * 1.7)
        merge(fr, nl_kit.beam((a[0] + dx * t0, a[1] + dy * t0, za), (a[0] + dx * t1, a[1] + dy * t1, za), 2.2, 0.22))
        for t in (t0 + 1.2, t1 - 1.2):
            merge(ffloat, nl_kit.beam((a[0] + dx * t - dy * 0.7, a[1] + dy * t + dx * 0.7, 0.02), (a[0] + dx * t + dy * 0.7, a[1] + dy * t - dx * 0.7, 0.02), 1.0, 0.4))
    # mooring piles standing proud of the deck every other section, a cleat between
    for k in range(int(L_ / 9) + 1):
        t = min(L_, k * 9.0)
        for sd in (-1.25, 1.25):
            q = (a[0] + dx * t - dy * sd, a[1] + dy * t + dx * sd)
            merge(fpile, bm_cyl(0.24, 0.22, 3.6, 7, (q[0], q[1], -1.6)))
            merge(fpile, bm_cyl(0.27, 0.0, 0.25, 7, (q[0], q[1], 2.0)))
# P6 (D18): the buoyed anchorage - a marker-light post at each raft's head and tail (amber), yellow buoys round the field
fpost, flamp, fbuoy = bmesh.new(), bmesh.new(), bmesh.new()
for (a, b) in CJ['far']['rafts']:
    L_ = math.hypot(b[0] - a[0], b[1] - a[1]); dx, dy = (b[0] - a[0]) / L_, (b[1] - a[1]) / L_
    for (q, sg) in ((a, -1), (b, 1)):
        p_ = (q[0] + dx * sg * 1.6, q[1] + dy * sg * 1.6)
        merge(fpost, bm_cyl(0.32, 0.26, 7.4, 8, (p_[0], p_[1], -2.4)))
        merge(fpost, bm_cyl(0.55, 0.55, 0.16, 8, (p_[0], p_[1], 4.9)))
        merge(fpost, bm_cyl(0.5, 0.0, 0.5, 8, (p_[0], p_[1], 5.9)))
        merge(flamp, bm_cyl(0.36, 0.36, 0.8, 8, (p_[0], p_[1], 5.05)))
        LAMP_PTS.append(Vector((p_[0], p_[1], 5.45))); LAMP_LIGHTS.append((p_[0], p_[1], 5.45, 'pierhead', '#FFB347'))
for p_ in CJ['far'].get('buoys', []):
    merge(fbuoy, bm_cyl(0.7, 0.8, 1.1, 8, (p_[0], p_[1], -0.3)))
    merge(fbuoy, bm_cyl(0.0, 0.5, 0.9, 8, (p_[0], p_[1], 0.8)))
obj('far_ports_marker_posts', fpost, face=lambda q: ((PAL['wall_ochre'] if q.center.z > 3.0 else PAL['tar']), PT['plain']), family='far_ports', jitter=0.05)
obj('far_ports_marker_lamps', flamp, mat=M['lamp'], family='far_ports', shadow=False)
obj('far_ports_buoys', fbuoy, lin('#E8C33A'), PT['plain'], family='far_ports', jitter=0.05)
obj('far_ports_rafts', fr, PAL['timber_grey'], PT['planks_x'] if 'planks_x' in PT else PT['plain'], family='far_ports', jitter=0.08)
obj('far_ports_piles', fpile, PAL['timber_dark'], PT['plain'], family='far_ports', jitter=0.06)
obj('far_ports_floats', ffloat, lin('#3A3F42'), PT['plain'], family='far_ports', jitter=0.04)

# ------------------------------------------------------------------ P6 (D18): Wreck Cove - old ribs on the strand, masts in the shallows
# The long-dead, left where they broke up: bleached keels with their frames standing like ribs, half sunk in the sand at
# the waterline, and topmasts leaning out of the shallows beyond (the runtime's beached hulks lie up the strand above them).
ribs, wmast = bmesh.new(), bmesh.new()
_wrng = random.Random(1313)
_strand = [tuple(p) for p in CJ['wreck']['strand']]
_Ls = polyline_len(_strand)
_lanes = [(Vector(CJ['lanes']['nodes'][a_]), Vector(CJ['lanes']['nodes'][b_])) for a_, b_ in CJ['lanes']['edges']]


def _off_lanes(p, clr):
    return all(seg_d((p.x, p.y), a_, b_) > clr for a_, b_ in _lanes)


for k, s_ in enumerate((0.16, 0.37, 0.58, 0.8)):
    p, t = along(_strand, _Ls * s_)
    t = Vector(t); nl = Vector((-t.y, t.x))                    # nl points inland (the strand's left)
    c = Vector(p) - nl * _wrng.uniform(2.5, 5.0)
    L_ = _wrng.uniform(12.0, 19.0)
    ax = (t * math.cos(0.5) + nl * math.sin(0.5) * _wrng.choice((-1, 1))).normalized()     # lying across the waterline
    up_ = Vector((0, 0, 1)); side = Vector((-ax.y, ax.x, 0))
    k0 = c - ax * L_ / 2; k1 = c + ax * L_ / 2
    zk = -0.7
    merge(ribs, nl_kit.beam((k0.x, k0.y, zk), (k1.x, k1.y, zk + 0.3), 0.45, 0.4))           # the keel
    merge(ribs, nl_kit.beam((k1.x, k1.y, zk + 0.3), (k1.x + ax.x * 1.2, k1.y + ax.y * 1.2, zk + 4.2), 0.4, 0.35))   # stem post
    nfr = int(L_ / 1.35)
    for j in range(1, nfr):
        if _wrng.random() < 0.18:
            continue                                            # a gap where frames have gone
        u_ = j / nfr
        q = k0 + ax * L_ * u_
        half = 2.7 * math.sin(math.pi * min(1.0, 0.15 + u_ * 0.9)) + 0.4
        hgt = (3.4 if _wrng.random() > 0.3 else _wrng.uniform(1.4, 2.6)) * (0.75 + 0.25 * math.sin(math.pi * u_))
        for sd in (-1, 1):
            if _wrng.random() < 0.12:
                continue
            pts3 = [Vector((q.x, q.y, zk + 0.2))]
            for m_ in range(1, 4):
                f_ = m_ / 3
                off = side * sd * half * math.sin(f_ * math.pi / 2)
                pts3.append(Vector((q.x + off.x, q.y + off.y, zk + 0.2 + hgt * (1 - math.cos(f_ * math.pi / 2)) ** 0.8 + hgt * 0.4 * f_)))
            for a3, b3 in zip(pts3, pts3[1:]):
                merge(ribs, nl_kit.beam(a3, b3, 0.26, 0.3))
for k in range(5):
    p, t = along(_strand, _Ls * (0.1 + 0.2 * k + _wrng.uniform(-0.05, 0.05)))
    t = Vector(t); nl = Vector((-t.y, t.x))
    base = Vector(p) - nl * _wrng.uniform(9.0, 16.0)
    if not _off_lanes(base, 12.0):
        continue
    lean = _wrng.uniform(0.25, 0.6); az = math.atan2(-nl.y, -nl.x) + _wrng.uniform(-0.8, 0.8)
    h_ = _wrng.uniform(8.0, 13.0)
    top = Vector((base.x + math.cos(az) * math.sin(lean) * h_, base.y + math.sin(az) * math.sin(lean) * h_, -1.0 + math.cos(lean) * h_))
    merge(wmast, nl_kit.beam((base.x, base.y, -1.5), tuple(top), 0.42, 0.42))
    if _wrng.random() < 0.6:                                    # a yard still crossed on it, canted
        yc = Vector((base.x, base.y, -1.5)).lerp(top, 0.78); ya = Vector((math.cos(az + 1.57), math.sin(az + 1.57), _wrng.uniform(-0.4, 0.4))).normalized()
        merge(wmast, nl_kit.beam(tuple(yc - ya * 3.2), tuple(yc + ya * 3.2), 0.22, 0.22))
obj('wreck_ribs', ribs, face=lambda q: ((lin('#B8AE9C') if q.normal.z > 0.2 else lin('#8B8172')) if q.center.z > -0.1 else (lin('#4A4640'), 0)[0], PT['plain']),
    family='wreck', jitter=0.1)
obj('wreck_masts', wmast, face=lambda q: ((lin('#6E6458') if q.center.z > 0.0 else lin('#3D3A36')), PT['plain']), family='wreck', jitter=0.08)

# ------------------------------------------------------------------ folk + gulls (decorative)
dark, coats, heads = bmesh.new(), bmesh.new(), bmesh.new(); coat_ranges = []
FOLK = []
gpts = along_line(QL['grand'], 3.0, 5.5)
for k in range(64):
    if k < 30:
        (p, t, nl) = gpts[DRNG.randrange(len(gpts))]
        p = (p[0] + nl[0] * DRNG.uniform(-3, 3), p[1] + nl[1] * DRNG.uniform(-3, 3)); z = Z_SHORE
    elif k < 44:
        (band, pts, zb) = LANES[k % len(LANES)]; p = pts[DRNG.randrange(len(pts))]; z = zb
        if in_pad(*p, 1.0):
            continue
    elif k < 52:
        lp = along_line(QL['long'], 3.0, 5.0); (p, t, nl) = lp[DRNG.randrange(len(lp))]; z = Z_SHORE
    else:
        cv = list(COVES.values())[k % len(COVES)]
        p = cove_pt(cv, DRNG.uniform(-cv['hw'] + 6, cv['hw'] - 6), -DRNG.uniform(1.5, 6.0)); z = H(*p)
    c = DRNG.choice(('#2E4B6B', '#A84A33', '#D9A441', '#2F5A4A', '#7A2A22', '#E9E4DE', '#C2453A', '#AB9BC4', '#E39A7E'))
    rz_ = DRNG.uniform(0, 6.28)
    d_ = bm_box2(-0.22, -0.16, 0, 0.22, 0.16, 0.85); merge(d_, bm_cyl(0.2, 0.15, 0.14, 8, (0, 0, 1.78)))
    xf(d_, rz=rz_); xf(d_, loc=(p[0], p[1], z)); merge(dark, d_)
    c_ = bm_box2(-0.27, -0.19, 0.85, 0.27, 0.19, 1.5); xf(c_, rz=rz_); xf(c_, loc=(p[0], p[1], z))
    n0 = len(coats.faces); merge(coats, c_); coat_ranges.append((n0, len(coats.faces), lin(c)))
    merge(heads, bm_sphere(0.17, (p[0], p[1], z + 1.68), 8, 5))
obj('folk_dark', dark, lin('#2B2E36'), PT['plain'], family='life')
obj('folk_coats', coats, face=lambda q: (next(cc for (a0, a1, cc) in coat_ranges if a0 <= q.index < a1), 0), family='life', jitter=0.0)
obj('folk_heads', heads, lin('#E3BE9E'), PT['plain'], family='life', smooth=True)
gb = bmesh.new()
for k in range(24):
    x, y = wpt(DRNG.uniform(-120, 160), DRNG.uniform(-100, 110)); z = DRNG.uniform(14, 34)
    yaw = DRNG.uniform(0, 6.28); flap = DRNG.uniform(0.15, 0.45); s = DRNG.uniform(1.0, 1.4)
    g = bmesh.new()
    for side in (-1, 1):
        vs = [g.verts.new((0.15 * s, 0, 0)), g.verts.new((-0.25 * s, 0, 0)), g.verts.new((-0.35 * s, side * 1.15 * s, flap * s)),
              g.verts.new((0.05 * s, side * 1.2 * s, flap * s))]
        g.faces.new(vs if side > 0 else vs[::-1])
        tip = [g.verts.new((-0.35 * s, side * 1.15 * s, flap * s)), g.verts.new((0.05 * s, side * 1.2 * s, flap * s)),
               g.verts.new((-0.25 * s, side * 1.7 * s, flap * s * 0.4))]
        g.faces.new(tip if side > 0 else tip[::-1])
    merge(g, bm_box(0.7 * s, 0.18 * s, 0.16 * s))
    xf(g, rz=yaw); xf(g, loc=(x, y, z))
    merge(gb, g)
obj('gulls', gb, face=lambda q: ((lin('#3A3F45') if q.area < 0.25 and abs(q.normal.z) > 0.2 else PAL['trim']), 0), family='life_keyart')

# chimney smoke (key art only)
m_s = new_mat('M_smoke'); nts = m_s.node_tree; ps = nts.nodes['Principled BSDF']
ps.inputs['Base Color'].default_value = (*lin('#E9E4DE'), 1); ps.inputs['Roughness'].default_value = 1.0
ps.inputs['Alpha'].default_value = 0.22; m_s.surface_render_method = 'BLENDED'; M['smoke'] = m_s
sm = bmesh.new()
for c in CHIMNEYS[::4]:
    for k in range(6):
        r = 0.22 + k * 0.14
        p = c + Vector((0.8 * k + DRNG.uniform(-0.2, 0.2), 0.55 * k, 0.7 + k * 0.95))
        merge(sm, bm_ico(r, tuple(p), 2, (1.2, 1.0, 0.9), seed=k, amp=0.15))
obj('chimney_smoke', sm, mat=M['smoke'], smooth=True, shadow=False, family='life_keyart')

# key-art window spill lights: one in front of each building's facade
for (nm, pts) in WINDOW_GROUPS:
    c = sum(pts, Vector()) / len(pts)
    WIN_SPILL.append(c + Vector((0, -2.6, -0.6)))
print('DRESS built; lamps', len(LAMP_PTS))

# ------------------------------------------------------------------ THE MAINLAND across the northern sound (shakkei): forested hills
set_coll(collection('shakkei', ROOTC))
SQ2 = math.sqrt(2.0)
to_xy = lambda u, v: ((u - v) / SQ2, (u + v) / SQ2)
MC = [tuple(p) for p in CJ['mainland']['coast']]
MCUV = sorted(((p[0] + p[1]) / SQ2, (p[1] - p[0]) / SQ2) for p in MC)


def coast_v(u):
    for (u0, v0), (u1, v1) in zip(MCUV, MCUV[1:]):
        if u0 <= u <= u1:
            return v0 + (v1 - v0) * (u - u0) / max(1e-6, u1 - u0)
    return MCUV[0][1] if u < MCUV[0][0] else MCUV[-1][1]


def mainland_h(u, v):
    d = v - coast_v(u)
    if d <= 0:
        return 0.0
    h = 3.0 + min(d, 140) * 0.42 + max(0.0, d - 140) * 0.9
    h += 40.0 * terrain.fbm(u, v, 0.006, 3, 61) * min(1.0, d / 90.0)
    h += (terrain.fbm(u, v, 0.03, 2, 62) - 0.5) * 6.0
    return h


mrng = random.Random(64)
mpts = []
u0_, u1_ = MCUV[0][0], MCUV[-1][0]
for v in np.arange(min(p[1] for p in MCUV) - 10, min(p[1] for p in MCUV) + 360.0, 20.0):
    for u in np.arange(u0_, u1_, 20.0):
        uu, vv = u + mrng.uniform(-6, 6), v + mrng.uniform(-6, 6)
        if vv > coast_v(uu) + 1.5:
            mpts.append((uu, vv))
mpts += [(u, coast_v(u)) for u in np.arange(u0_, u1_, 10.0)]
MP = np.array(mpts)
mtri = Delaunay(MP)
mbm = bmesh.new()
mvs = [mbm.verts.new((*to_xy(u, v), mainland_h(u, v))) for u, v in mpts]
for t in mtri.simplices:
    c_ = MP[t].mean(axis=0)
    if c_[1] < coast_v(c_[0]) + 0.5:
        continue
    try:
        mbm.faces.new([mvs[i] for i in t])
    except ValueError:
        continue
mbm.normal_update()
for f in mbm.faces:
    if f.normal.z < 0:
        f.normal_flip()


def mland_face(q):
    c = q.center; nz = q.normal.z
    nn = terrain.fbm(c.x, c.y, 0.01, 2, 63)
    if nz < 0.6:
        return (PAL['rock_dark'] if nn > 0.5 else PAL['rock'], PT['rock'])
    if c.z < 8 and nn > 0.62:
        return (PAL['grass'], PT['grass'])
    return (lin('#3F5A3C') if nn > 0.45 else lin('#4B6741'), PT['leaf'])


obj('shakkei_land', mbm, face=mland_face, jitter=0.05, family='shakkei')
print('MAINLAND built')
