"""The Harbour v2 - dressing: vegetation (spruce crest, lush A-graft tree clusters, birches, meadows, heather),
dry-stone walls + paths, quay life (lamps, bunting, striped awnings, stalls, crates, nets), pier-head pennant
lamps, hamlet characters, shoals reef + buoys, mooring buoys, Far Ports rafts, folk, gulls.
exec'd into build_island's namespace (after land + town)."""
from PIL import Image, ImageDraw

DRNG = random.Random(909)
set_coll(collection('dress', ROOTC))

# ------------------------------------------------------------------ occupancy raster (1 m): where nothing may grow
OX0, OY0, OX1, OY1 = -320.0, -300.0, 300.0, 430.0
OS = 1.0
OW, OH = int((OX1 - OX0) / OS), int((OY1 - OY0) / OS)
occ_im = Image.new('L', (OW, OH), 0); od = ImageDraw.Draw(occ_im)
o_to = lambda x, y: ((x - OX0) / OS, (OY1 - y) / OS)


def occ_rect(x0, y0, x1, y1):
    od.rectangle([o_to(x0, y1), o_to(x1, y0)], fill=255)


for lot in CJ['lots']:
    cx, cy = lot['c']; w, d = lot['w'], lot['d']
    if tuple(lot.get('face', (0, -1))) in ((1, 0), (-1, 0)):
        w, d = d, w
    occ_rect(cx - w / 2 - 1.5, cy - d / 2 - 2.5, cx + w / 2 + 1.5, cy + d / 2 + 1.5)
for k, L in CJ['landmarks'].items():
    if k in ('shoals', 'wreck_cove', 'far_ports', 'breakwater') or k.startswith('hamlet'):
        continue
    r = L['fp'] / 2 + 3
    occ_rect(L['p'][0] - r, L['p'][1] - r, L['p'][0] + r, L['p'][1] + r)
occ_rect(-152, QY - 2, 152, QY + 17)                 # Grand Quay apron
occ_rect(WX - 14, SY + 4, WX, QY + 2)                # basin apron
for (fy, tz, x0, x1) in terrain.TERRACES:            # terrace lanes + walls
    occ_rect(x0 - 2, fy - 2, x1 + 2, fy + 4.5)
for pid, cx, hw in CJ['coves']:
    occ_rect(cx - hw - 2, COVE_BACK - 2, cx + hw + 2, COVE_BACK + 9)
for (x0, fy, za, zb) in STAIRS:
    occ_rect(x0 - 2.5, fy - 9, x0 + 2.5, fy + 1)
OCC = np.array(occ_im) > 0


def occupied(x, y):
    i, j = int((OY1 - y) / OS), int((x - OX0) / OS)
    if not (0 <= i < OH and 0 <= j < OW):
        return True
    return bool(OCC[i, j])


def on_land(x, y, margin=2.0):
    return point_in_poly(x, y, COAST) and not occupied(x, y)


def in_crop(x, y):
    f = terrain.field_at(x, y)
    return f is not None and f['kind'] in ('hay', 'plough')


# ------------------------------------------------------------------ PATHS (earth/gravel) between hamlets, up to the church/headland
paths = bmesh.new()
PATHS = [
    [(-200, -214), (-150, -206), (-100, -210), (-40, -206), (20, -208), (80, -204), (130, -206), (176, -198)],    # hamlet coast path
    [(-30, -200), (-24, -170), (-10, -140), (0, -124)],                                                           # over the ridge
    [(150, 172), (172, 176), (196, 186), (214, 172), (222, 160)],                                                 # to the headland
    [(-110, 196), (-140, 210), (-170, 240), (-210, 268), (-252, 292)],                                            # to Wreck Cove
    [(84, 252), (84, 262)], [(-60, 266), (-100, 290), (-150, 300)],
]
for pl in PATHS:
    for a, b in zip(pl, pl[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 4.0))
        for k in range(n):
            p = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)
            q = (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)
            merge(paths, nl_kit.beam((p[0], p[1], H(*p) + 0.08), (q[0], q[1], H(*q) + 0.08), 2.0, 0.22))
            od.line([o_to(*p), o_to(*q)], fill=255, width=4)
OCC = np.array(occ_im) > 0
obj('land_paths', paths, PAL['earth'], PT['cobble'], family='terrain', jitter=0.05)

# ------------------------------------------------------------------ dry-stone field walls (south arm, west land, NE)
walls = bmesh.new()
WALLS = []
for f in terrain.FIELDS:
    p = f['poly']
    WALLS.append([p[0], p[1], p[2], p[3], p[0]])
for wl in WALLS:
    for a, b in zip(wl, wl[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 3.5))
        for k in range(n):
            p = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)
            q = (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)
            if not on_land(*p) or not on_land(*q):
                continue
            merge(walls, nl_kit.beam((p[0], p[1], H(*p) + 0.32), (q[0], q[1], H(*q) + 0.32), 0.6, 0.85))
            od.line([o_to(*p), o_to(*q)], fill=255, width=2)
OCC = np.array(occ_im) > 0
obj('field_walls', walls, PAL['rock'], PT['ashlar'], family='prop_wall', jitter=0.12)

# ------------------------------------------------------------------ VEGETATION
leafS, trunkS = bmesh.new(), bmesh.new()
leafR, trunkR = bmesh.new(), bmesh.new()
leafB, trunkB = bmesh.new(), bmesh.new()
shrub, tuft, flw, heath, bould, lich = (bmesh.new() for _ in range(6))


def round_tree(p, h, rng):
    """A-graft lush deciduous crown: two overlapping lumpy spheres on a short trunk."""
    x, y, z = p
    merge(trunkR, bm_cyl(0.22 * h / 8, 0.14 * h / 8, h * 0.5, 5, (x, y, z - 0.3)))
    r = h * 0.34
    merge(leafR, bm_ico(r, (x, y, z + h * 0.62), 1, (1.0, 1.0, 0.86), seed=rng.randint(0, 999), amp=0.22))
    o = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)).normalized() * r * 0.6
    merge(leafR, bm_ico(r * 0.72, (x + o.x, y + o.y, z + h * 0.5), 1, (1.0, 1.0, 0.85), seed=rng.randint(0, 999), amp=0.25))


def spruce_(p, h, rng):
    nl_kit.spruce(leafS, trunkS, p, h, rng)


TREES = {'spruce': 0, 'round': 0, 'birch': 0}


def scatter(n, sampler, place, min_d, rng, max_try=None):
    placed = []
    tries = 0
    grid = {}
    cell = max(min_d, 1.0)
    while len(placed) < n and tries < (max_try or n * 30):
        tries += 1
        p = sampler(rng)
        if p is None or not on_land(*p) or in_crop(*p):
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


# spruce crest: a dense dark band along the ridge (silhouette), thinning down the slopes
RIDGE_PTS = terrain.RIDGE


def ridge_sampler(rng, spread=34.0):
    i = rng.randrange(len(RIDGE_PTS) - 1)
    a, b = RIDGE_PTS[i], RIDGE_PTS[i + 1]
    t = rng.random()
    x = a[0] + (b[0] - a[0]) * t; y = a[1] + (b[1] - a[1]) * t
    return (x + rng.gauss(0, spread), y + rng.gauss(0, spread))


def place_spruce(p, rng):
    z = H(*p)
    h = rng.uniform(7.5, 12.5) * (1.0 if z > 14 else 0.85)
    spruce_((p[0], p[1], z - 0.3), h, rng)
    TREES['spruce'] += 1


scatter(470, lambda r: ridge_sampler(r, 16.0), place_spruce, 4.6, DRNG)          # the dark crest itself
COPSES = []
_crng = random.Random(4)
for k in range(44):
    COPSES.append((_crng.uniform(-280, 250), _crng.uniform(-200, 380), _crng.uniform(8, 18), _crng.randint(6, 16)))
COPSES += [(-238, 40, 26, 60), (-246, -20, 18, 30), (-226, 110, 20, 34), (-214, -96, 16, 22), (196, 300, 24, 46), (240, 230, 12, 14),
           (-60, -168, 20, 22), (110, -170, 16, 14), (-170, -172, 14, 12)]
for (cx, cy, sp, n) in COPSES:
    if terrain.field_at(cx, cy) is not None:
        continue
    scatter(n, lambda r, cx=cx, cy=cy, sp=sp: (cx + r.gauss(0, sp), cy + r.gauss(0, sp)), place_spruce, 4.8, DRNG, max_try=n * 20)


def place_round(p, rng):
    z = H(*p)
    round_tree((p[0], p[1], z), rng.uniform(6.5, 9.5), rng)
    TREES['round'] += 1


# lush round-crown trees: town gardens (the gaps between blocks), terrace backs, squares, hamlet greens
TOWN_SPOTS = []
for (fy, tz, x0, x1) in terrain.TERRACES:
    for k in range(70):
        TOWN_SPOTS.append((DRNG.uniform(x0, x1), fy + DRNG.uniform(6.0, 30.0)))
for k in range(40):
    TOWN_SPOTS.append((DRNG.uniform(-140, 150), DRNG.uniform(160, 182)))
scatter(150, lambda r: TOWN_SPOTS[r.randrange(len(TOWN_SPOTS))], place_round, 6.5, DRNG, max_try=4000)
for pid, cx, hw in CJ['coves']:
    scatter(4, lambda r, cx=cx, hw=hw: (cx + r.uniform(-hw - 16, hw + 16), COVE_BACK + r.uniform(18, 34)), place_round, 7.0, DRNG, max_try=200)
scatter(40, lambda r: (r.uniform(-210, 170), r.uniform(-196, -128)), place_round, 9.0, DRNG, max_try=2000)


def place_birch(p, rng):
    z = H(*p)
    nl_kit.birch(leafB, trunkB, (p[0], p[1], z - 0.2), rng.uniform(6.0, 8.5), rng)
    TREES['birch'] += 1


scatter(70, lambda r: ridge_sampler(r, 70.0), place_birch, 8.0, DRNG, max_try=3000)
scatter(24, lambda r: (r.uniform(-250, -170), r.uniform(-130, 140)), place_birch, 9.0, DRNG, max_try=1500)
print('TREES', TREES)


# ground dressing: shrubs, tufts, flowers, heather on the headland, boulders + lichen
def place_meadow(p, rng):
    z = H(*p)
    kind = rng.random()
    hd = math.hypot((p[0] - 224) / 46.0, (p[1] - 182) / 70.0)
    if hd < 1.05:
        # the headland: heather + gorse only in drifts (negative space between), rocks at the cliff edge
        if terrain.fbm(p[0], p[1], 0.045, 2, 21) < 0.56:
            return
        for k_ in range(rng.randint(2, 4)):
            q = (p[0] + rng.uniform(-2.2, 2.2), p[1] + rng.uniform(-2.2, 2.2))
            merge(heath, bm_ico(rng.uniform(0.6, 1.1), (q[0], q[1], H(*q) + 0.1), 1, (1.4, 1.0, 0.45), seed=rng.randint(0, 999), amp=0.3))
        if hd > 0.85 and rng.random() < 0.5:
            rr = rng.uniform(0.8, 1.8)
            merge(bould, bm_ico(rr, (p[0], p[1] + 1.5, z + 0.1), 1, (1.25, 1.0, 0.7), seed=rng.randint(0, 999), amp=0.35))
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
        merge(bould, bm_ico(rr, (p[0], p[1], z + 0.1), 1, (1.25, 1.0, 0.7), seed=rng.randint(0, 999), amp=0.35))
        if rng.random() < 0.6:
            merge(lich, bm_ico(rr * 0.5, (p[0] + rr * 0.1, p[1], z + 0.1 + rr * 0.55), 0, (1.3, 1.0, 0.25), seed=rng.randint(0, 99)))


scatter(1500, lambda r: (r.uniform(-300, 280), r.uniform(-250, 420)), place_meadow, 3.2, DRNG, max_try=40000)
obj('trees_spruce', leafS, face=lambda q: ((PAL['spruce_light'] if q.normal.z > 0.35 else PAL['spruce']), PT['leaf']), family='tree_spruce', jitter=0.1, seed=3)
obj('trees_spruce_trunk', trunkS, PAL['timber_dark'], PT['plain'], family='tree_spruce')
obj('trees_round', leafR, face=lambda q: ((lin('#7FA348') if terrain.vnoise(q.center.x, q.center.y, 0.05, 4) > 0.5 else lin('#5F8A3C')) if q.normal.z > 0.1 else lin('#4C6E33'), PT['leaf']),
    family='tree_round', jitter=0.08, seed=4)
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
        # chain pennant: a short staff + swallow-tail flag in the chain colour
        merge(lampb, bm_cyl(0.04, 0.03, 1.6, 4, (x, y, z + h + 1.2)))
        f = bmesh.new()
        vs = [f.verts.new(v) for v in ((x, y, z + h + 2.7), (x + 1.3, y + 0.2, z + h + 2.55), (x + 0.95, y + 0.15, z + h + 2.38),
                                        (x + 1.3, y + 0.2, z + h + 2.2), (x, y, z + h + 2.1))]
        f.faces.new(vs)
        n0 = len(pennb.faces)
        merge(pennb, f)
        PENN_COLS.append((n0, len(pennb.faces), lin(pennant)))


# Grand Quay: lamps along the edge every ~24 m, and along the terrace lanes
for x in range(-140, 151, 24):
    lamp((x, QY + 1.8), Z_SHORE + 0.06)
for (fy, tz, x0, x1) in terrain.TERRACES:
    for x in np.arange(x0 + 10, x1 - 5, 30.0):
        lamp((float(x), fy + 4.6), tz + 0.04)
for (x, y, z, kind, col) in CJ['lamps']:
    lamp((x, y), z, 3.0 if z < 2 else 3.4, pennant=col if kind == 'pierhead' else None, kind=kind)
for pid, cx, hw in CJ['coves']:
    for s in (-1, 1):
        lamp((cx + s * (hw - 7), COVE_BACK + 1.6), Z_SHORE + 0.06)
lamp((WX - 2.0, 120.0), Z_SHORE + 0.06); lamp((WX - 2.0, 40.0), Z_SHORE + 0.06); lamp((WX - 2.0, -40.0), Z_SHORE + 0.06)
obj('lamps_posts', lampb, PAL['iron'], PT['metal'], family='prop_lamp')
obj('lamps_glass', lglass, mat=M['lamp'], family='prop_lamp', shadow=False)
if len(pennb.faces):
    obj('lamps_pennants', pennb, face=lambda q: (next((c for (a, b, c) in PENN_COLS if a <= q.index < b), PAL['trim']), PT['plain']), family='prop_lamp', jitter=0.0)
else:
    pennb.free()

# bunting (A graft): catenary strings of little flags between the quay lamps
bunt_line = bmesh.new(); bunt = bmesh.new()
BCOLS = [PAL['hull_red'], PAL['flower_w'], PAL['wall_ochre'], PAL['hull_blue'], PAL['door_green'], PAL['flower_y']]
for x in range(-140, 127, 24):
    if 40 < x < 75:
        continue
    a = Vector((x, QY + 1.8, Z_SHORE + 4.3)); b = Vector((x + 24, QY + 1.8, Z_SHORE + 4.3))
    pts = nl_kit.catenary(a, b, 1.1, 10)
    for p, q in zip(pts, pts[1:]):
        merge(bunt_line, nl_kit.line3(p, q, 0.02))
    for k in range(1, 24):
        t = k / 24
        p = a.lerp(b, t); p.z -= 1.1 * 4 * t * (1 - t)
        f = bmesh.new()
        vs = [f.verts.new(v) for v in ((p.x - 0.32, p.y, p.z), (p.x + 0.32, p.y, p.z), (p.x, p.y - 0.02, p.z - 0.62))]
        f.faces.new(vs)
        merge(bunt, f)
# bunting across the hamlet coves too (festive hamlets)
for pid, cx, hw in CJ['coves']:
    a = Vector((cx - hw + 7, COVE_BACK + 1.6, Z_SHORE + 4.0)); b = Vector((cx + hw - 7, COVE_BACK + 1.6, Z_SHORE + 4.0))
    pts = nl_kit.catenary(a, b, 1.2, 10)
    for p, q in zip(pts, pts[1:]):
        merge(bunt_line, nl_kit.line3(p, q, 0.02))
    n = int((b - a).length / 1.0)
    for k in range(1, n):
        t = k / n
        p = a.lerp(b, t); p.z -= 1.2 * 4 * t * (1 - t)
        f = bmesh.new()
        vs = [f.verts.new(v) for v in ((p.x - 0.3, p.y, p.z), (p.x + 0.3, p.y, p.z), (p.x, p.y - 0.02, p.z - 0.58))]
        f.faces.new(vs)
        merge(bunt, f)
obj('bunting_lines', bunt_line, PAL['tar'], PT['plain'], family='prop_bunting')
obj('bunting_flags', bunt, face=lambda q: (BCOLS[q.index % len(BCOLS)], PT['plain']), family='prop_bunting', jitter=0.0)

# market stalls with striped awnings on the Grand Quay apron (A graft) + fish boxes
stall = bmesh.new(); awn = bmesh.new(); awn_cols = []; boxes = bmesh.new()
for i, (sx_, sy_) in enumerate(((-118.0, 160.5), (-30.0, 161.0), (-14.0, 161.0), (8.0, 160.5), (120.0, 161.0))):
    merge(stall, bm_box2(sx_ - 2.0, sy_ - 0.6, Z_SHORE, sx_ + 2.0, sy_ + 0.6, Z_SHORE + 1.0))
    for dx in (-1.9, 1.9):
        for dy in (-1.3, 0.5):
            merge(stall, bm_box2(sx_ + dx - 0.06, sy_ + dy - 0.06, Z_SHORE, sx_ + dx + 0.06, sy_ + dy + 0.06, Z_SHORE + 2.6))
    col = (PAL['hull_red'], PAL['hull_blue'], PAL['door_green'], PAL['wall_ochre'], PAL['hull_red'])[i]
    for k in range(8):
        x0 = sx_ - 2.2 + k * 0.55
        b = bm_box2(x0, sy_ - 1.7, -0.03, x0 + 0.55, sy_ + 0.7, 0.03)
        for v in b.verts:
            v.co.z += Z_SHORE + 2.6 + (v.co.y - (sy_ + 0.7)) * -0.35
        n0 = len(awn.faces); merge(awn, b)
        awn_cols.append((n0, len(awn.faces), col if k % 2 == 0 else PAL['trim']))
    for k in range(6):
        merge(boxes, bm_box2(sx_ - 1.8 + k * 0.62, sy_ - 0.5, Z_SHORE + 1.0, sx_ - 1.25 + k * 0.62, sy_ + 0.5, Z_SHORE + 1.25))
obj('quay_stalls', stall, PAL['timber'], PT['boards'], family='prop_stall')
obj('quay_awnings', awn, face=lambda q: (next((c for (a, b, c) in awn_cols if a <= q.index < b), PAL['trim']), PT['plain']), family='prop_stall', jitter=0.0)
obj('quay_fishboxes', boxes, face=lambda q: ((PAL['brand_usdc'] if int(q.center.x * 10) % 3 else PAL['wall_white']), 0), family='prop_stall')

# crates, barrels, nets, coils on aprons and piers
cr, br, nets, corks, coils = (bmesh.new() for _ in range(5))
CLUTTER = [(-100, 158, 4), (-70, 157, 3), (-40, 158, 5), (24, 156, 3), (96, 157, 4), (136, 158, 6), (WX - 6, 96, 4), (WX - 6, 30, 5),
           (WX - 6, -30, 3)]
for pid, cx, hw in CJ['coves']:
    CLUTTER.append((cx - hw + 8, COVE_BACK + 4.5, 4)); CLUTTER.append((cx + hw - 10, COVE_BACK + 4.5, 3))
for (x, y, n) in CLUTTER:
    for k in range(n):
        nl_kit.crate(cr, (x + (k % 3) * 1.1 + DRNG.uniform(-0.1, 0.1), y + (k // 3) * 0.9, Z_SHORE + 0.06 + (0.75 if k == n - 1 and n > 3 else 0)),
                     DRNG.uniform(0.8, 1.0), DRNG.uniform(-0.2, 0.2))
    for k in range(DRNG.randint(1, 3)):
        nl_kit.barrel(br, (x + 4.0 + k * 0.85, y + DRNG.uniform(-0.3, 0.3), Z_SHORE + 0.06), DRNG.uniform(0.9, 1.05))
    if DRNG.random() < 0.6:
        r = DRNG.uniform(0.9, 1.4)
        merge(nets, bm_ico(r, (x - 2.5, y, Z_SHORE + 0.15), 2, (1.3, 1.0, 0.42), seed=int(x), amp=0.25))
        for k in range(5):
            a = DRNG.uniform(0, 6.28)
            merge(corks, bm_ico(0.17, (x - 2.5 + math.cos(a) * r, y + math.sin(a) * r * 0.8, Z_SHORE + 0.45), 0, seed=k))
for (x, y, z) in CJ['bollards'][::7]:
    t = bm_cyl(0.5, 0.5, 0.18, 10, (x + 1.2, y, z)); merge(t, bm_cyl(0.32, 0.32, 0.2, 10, (x + 1.2, y, z + 0.18)))
    merge(coils, t)
obj('props_crates', cr, PAL['timber'], PT['boards'], family='prop_crate', jitter=0.14, bevel=0.03)
obj('props_barrels', br, face=lambda q: ((PAL['timber_dark'] if (q.center.z % 0.45) < 0.08 else PAL['timber']), PT['boards']), family='prop_barrel', jitter=0.05)
obj('props_nets', nets, lin('#596B52'), PT['leaf'], family='prop_nets', jitter=0.1, smooth=True)
obj('props_corks', corks, face=lambda q: ((PAL['wall_ochre'] if q.index % 40 < 20 else PAL['brand_red']), 0), family='prop_nets')
obj('props_coils', coils, PAL['rope'], PT['plain'], family='prop_rope', jitter=0.05)

# benches + a hand crane by the Customs House
bench = bmesh.new()
for (x, y, z) in ((-60, 163, Z_SHORE), (30, 164, Z_SHORE), (110, 163, Z_SHORE), (60, 187.5, 7.0), (-20, 187.5, 7.0), (84, 256, 17.0)):
    merge(bench, bm_box2(x - 0.9, y - 0.25, z + 0.45, x + 0.9, y + 0.25, z + 0.55))
    merge(bench, bm_box2(x - 0.9, y + 0.2, z + 0.55, x + 0.9, y + 0.28, z + 1.0))
    for dx in (-0.75, 0.75):
        merge(bench, bm_box2(x + dx - 0.05, y - 0.2, z, x + dx + 0.05, y + 0.2, z + 0.45))
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


hand_crane('crane_grandquay', 112.0, QY + 2.0, Z_SHORE)
hand_crane('crane_basin', WX - 2.0, 60.0, Z_SHORE, rz=-math.pi / 2)

# ------------------------------------------------------------------ HAMLET CHARACTERS
COVE = {pid: (cx, hw) for pid, cx, hw in CJ['coves']}
# Hyperliquid: deep-water jetty + a mint-banded beacon tower at the root
cx, hw = COVE['pier-hyperliquid-l1']
bt = bm_cyl(1.6, 1.3, 9.0, 12, (cx + hw - 3, COVE_BACK + 3, Z_SHORE))
obj('hamlet_hyper_beacon', bt, face=lambda q: ((lin('#5FD3BC') if (q.center.z % 2.2) < 1.1 else PAL['wall_white']), PT['render']), family='hamlet')
obj('hamlet_hyper_beacon_cap', bm_cyl(1.5, 0.2, 1.3, 12, (cx + hw - 3, COVE_BACK + 3, Z_SHORE + 9.0)), PAL['iron'], PT['metal'], family='hamlet')
obj('hamlet_hyper_beacon_lamp', bm_cyl(0.9, 0.9, 1.0, 10, (cx + hw - 3, COVE_BACK + 3, Z_SHORE + 8.0)), mat=M['lamp'], family='hamlet', shadow=False)
LAMP_PTS.append(Vector((cx + hw - 3, COVE_BACK + 3, Z_SHORE + 8.5))); LAMP_LIGHTS.append((cx + hw - 3, COVE_BACK + 3, Z_SHORE + 8.5, 'pierhead', '#5FD3BC'))
# Polygon: boatyard - a hull on stocks + timber stack
cx, hw = COVE['pier-polygon']
P_ = dict(br=0.3, fb=0.11, dr=0.06, bow=2.2, stern=0.6, sheer=(0.3, 0.15), bulwark=0.2)
hc = dict(top=PAL['timber'], band=PAL['timber'], stripe=PAL['timber'], rail=PAL['timber_dark'], boot=PAL['timber'], bottom=PAL['antifoul'],
          deck=PAL['timber'], deck_in=PAL['timber'], transom=PAL['timber'])
hb_, names, D_ = nl_kit.hull_mesh(12.0, P_, hc, n=10)
lay = hb_.faces.layers.int.get('seg'); segs = {f.index: names[f[lay]] for f in hb_.faces}
xf(hb_, loc=(cx - hw - 14, COVE_BACK + 14, Z_SHORE + 1.6), rz=math.radians(90))
obj('hamlet_polygon_hull_on_stocks', hb_, face=lambda q: ((PAL['antifoul'] if segs.get(q.index) == 'bottom' else PAL['timber']), PT['strakes']), family='hamlet')
stk = bmesh.new()
for k in range(5):
    y = COVE_BACK + 8 + k * 2.4
    merge(stk, bm_box2(cx - hw - 16, y - 0.3, Z_SHORE, cx - hw - 12, y + 0.3, Z_SHORE + 1.2 + (0.4 if k in (1, 3) else 0)))
for k in range(6):
    merge(stk, bm_box2(cx - hw - 6 + k * 0.0, COVE_BACK + 30 + k * 0.32, Z_SHORE, cx - hw + 2, COVE_BACK + 30.3 + k * 0.32, Z_SHORE + 0.3 + k * 0.0))
obj('hamlet_polygon_stocks', stk, PAL['timber_dark'], PT['boards'], family='hamlet')
# Arbitrum: rope-walk - a long low shed + coils
cx, hw = COVE['pier-arbitrum']
rw = bm_box2(cx - 14, COVE_BACK + 26, Z_SHORE - 0.5, cx + 14, COVE_BACK + 30.5, Z_SHORE + 2.6)
obj('hamlet_arbitrum_ropewalk', rw, PAL['wall_blue'], PT['boards'], family='hamlet', bevel=0.04)
rr_ = bmesh.new()
vs = [rr_.verts.new(v) for v in ((cx - 14.3, COVE_BACK + 25.6, Z_SHORE + 2.6), (cx + 14.3, COVE_BACK + 25.6, Z_SHORE + 2.6), (cx + 14.3, COVE_BACK + 28.25, Z_SHORE + 3.8),
                                  (cx - 14.3, COVE_BACK + 28.25, Z_SHORE + 3.8), (cx - 14.3, COVE_BACK + 30.9, Z_SHORE + 2.6), (cx + 14.3, COVE_BACK + 30.9, Z_SHORE + 2.6))]
rr_.faces.new((vs[0], vs[1], vs[2], vs[3])); rr_.faces.new((vs[3], vs[2], vs[5], vs[4]))
obj('hamlet_arbitrum_ropewalk_roof', rr_, PAL['roof_tar'], PT['boards'], family='hamlet')
coils2 = bmesh.new()
for k in range(5):
    x = cx - 10 + k * 4.5
    merge(coils2, bm_cyl(0.7, 0.7, 0.35, 12, (x, COVE_BACK + 23.5, Z_SHORE))); merge(coils2, bm_cyl(0.45, 0.45, 0.38, 12, (x, COVE_BACK + 23.5, Z_SHORE + 0.35)))
obj('hamlet_arbitrum_coils', coils2, PAL['rope'], PT['plain'], family='hamlet')
# Base: hjell drying racks of stockfish + net piles
cx, hw = COVE['pier-base']
racks = bmesh.new(); fish = bmesh.new()
for (x, y) in ((cx - hw - 12, COVE_BACK + 18), (cx + hw + 8, COVE_BACK + 20)):
    z = H(x, y)
    L_ = 9.0
    for k in range(3):
        yy = y + k * L_ / 2
        for s in (-1, 1):
            merge(racks, nl_kit.beam((x, yy, z), (x + s * 0.9, yy, z + 2.6), 0.14, 0.14))
    merge(racks, nl_kit.beam((x, y, z + 2.45), (x, y + L_, z + 2.45), 0.14, 0.14))
    for s in (-0.5, 0.5):
        merge(racks, nl_kit.beam((x + s, y, z + 1.6), (x + s, y + L_, z + 1.6), 0.1, 0.1))
    for k in range(20):
        yy = y + 0.2 + k * (L_ - 0.4) / 19
        for xx, zz in ((x - 0.5, z + 1.6), (x + 0.5, z + 1.6), (x, z + 2.45)):
            merge(fish, bm_box(0.14, 0.12, 0.7, (xx, yy, zz - 0.4)))
obj('hamlet_base_hjell', racks, PAL['timber_grey'], PT['plain'], family='hamlet')
obj('hamlet_base_stockfish', fish, lin('#B8A07A'), PT['plain'], family='hamlet', jitter=0.15)
# Solana: merchant wharf - crane, barrels, a purple-striped awning stall
cx, hw = COVE['pier-solana']
hand_crane('hamlet_solana_crane', cx - hw + 6, COVE_BACK + 2.0, Z_SHORE, rz=0.3, col='brand_violet')
# BSC: timber wharf - lumber stacks + an ochre crane
cx, hw = COVE['pier-bsc']
lum = bmesh.new()
for k in range(3):
    x0 = cx - hw + 6 + k * 3.6
    for j in range(4):
        merge(lum, bm_box2(x0, COVE_BACK + 3.0 + j * 0.0, Z_SHORE + j * 0.42, x0 + 2.8, COVE_BACK + 7.5, Z_SHORE + j * 0.42 + 0.38))
obj('hamlet_bsc_lumber', lum, PAL['timber'], PT['planks_x'], family='hamlet', jitter=0.1)
hand_crane('hamlet_bsc_crane', cx + hw - 6, COVE_BACK + 2.0, Z_SHORE, rz=-0.3, col='wall_ochre')

# ------------------------------------------------------------------ SKERRIES (west): granite humps, a grass cap, a few wind-bent spruces
from mathutils.geometry import tessellate_polygon
skL, skT = bmesh.new(), bmesh.new()
for i, sk in enumerate(CJ['skerries']):
    poly = [tuple(p) for p in sk['poly']]
    cx_ = sum(p[0] for p in poly) / len(poly); cy_ = sum(p[1] for p in poly) / len(poly)
    top = sk['top']
    coast_skirt(f'skerry_{i}', poly, lambda x, y, top=top: top * 0.55, lambda x, y: False, rows=3, amp=1.4, seed=40 + i, jag=1.2)
    # domed cap: rings shrinking toward the centre
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
        for k in range(4 if i == 0 else 2):
            sp = (cx_ + DRNG.uniform(-8, 8), cy_ + DRNG.uniform(-4, 4))
            nl_kit.spruce(skL, skT, (sp[0], sp[1], top - 0.4), DRNG.uniform(5.0, 7.5), DRNG)
    CIRCLES_EXTRA.append((cx_, cy_, 1.0))
obj('skerry_spruce', skL, face=lambda q: ((PAL['spruce_light'] if q.normal.z > 0.35 else PAL['spruce']), PT['leaf']), family='tree_spruce', jitter=0.1)
obj('skerry_spruce_trunk', skT, PAL['timber_dark'], PT['plain'], family='tree_spruce')
# a cairn + a little day-beacon on the big skerry
sk0 = CJ['skerries'][0]; c0 = (sum(p[0] for p in sk0['poly']) / len(sk0['poly']) + 9, sum(p[1] for p in sk0['poly']) / len(sk0['poly']) + 2)
cairn = bmesh.new()
for k in range(4):
    merge(cairn, bm_ico(1.0 - k * 0.2, (c0[0], c0[1], sk0['top'] - 0.2 + k * 0.6), 1, (1.2, 1.0, 0.6), seed=k + 50, amp=0.2))
merge(cairn, bm_cyl(0.12, 0.1, 4.0, 5, (c0[0], c0[1], sk0['top'] + 1.6)))
obj('skerry_cairn', cairn, face=lambda q: ((PAL['hull_red'] if q.center.z > sk0['top'] + 3.0 else PAL['rock_light']), PT['rock']), family='rock')

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
obj('shoals_buoys', cb, face=lambda q: ((lin('#E8C33A') if (q.center.z < 0.5 or 3.6 < q.center.z < 4.4) else PAL['hull_black']), PT['plain']), family='shoals')
mb = bmesh.new()
for m_ in CJ['moorings']:
    x, y = m_['buoy']
    merge(mb, bm_cyl(0.45, 0.2, 0.55, 5, (x, y, -0.15)))
obj('mooring_buoys', mb, face=lambda q: ((PAL['hull_red'] if q.normal.z > 0.5 else lin('#E8E2D6')), PT['plain']), family='mooring')
fr = bmesh.new()
for (a, b) in CJ['far']['rafts']:
    merge(fr, bm_box2(a[0], a[1] - 1.2, -0.1, b[0], a[1] + 1.2, 0.5))
    for k in range(int((b[0] - a[0]) / 6) + 1):
        merge(fr, bm_cyl(0.5, 0.5, 0.7, 8, (a[0] + k * 6, a[1] - 1.3, -0.3)))
obj('far_ports_rafts', fr, PAL['timber_grey'], PT['planks_y'], family='far_ports', jitter=0.05)

# ------------------------------------------------------------------ folk + gulls (decorative)
dark, coats, heads = bmesh.new(), bmesh.new(), bmesh.new(); coat_ranges = []
FOLK = []
for k in range(60):
    if k < 34:
        p = (DRNG.uniform(-140, 150), DRNG.uniform(QY + 2, QY + 15)); z = Z_SHORE
    elif k < 46:
        (fy, tz, x0, x1) = terrain.TERRACES[k % 3]; p = (DRNG.uniform(x0, x1), fy + DRNG.uniform(1.5, 4.5)); z = tz
    else:
        pid, cx, hw = CJ['coves'][k % 6]; p = (cx + DRNG.uniform(-hw + 4, hw - 4), COVE_BACK + DRNG.uniform(1.5, 6.5)); z = Z_SHORE
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
for k in range(22):
    x, y, z = DRNG.uniform(-60, 200), DRNG.uniform(-60, 200), DRNG.uniform(14, 34)
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
for v in np.arange(430.0, 820.0, 16.0):
    for u in np.arange(-650.0, 1150.0, 16.0):
        uu, vv = u + mrng.uniform(-5, 5), v + mrng.uniform(-5, 5)
        if vv > coast_v(uu) + 1.5:
            mpts.append((uu, vv))
mpts += [(u, coast_v(u)) for u in np.arange(-650.0, 1150.0, 8.0)]
MP = np.array(mpts)
mtri = Delaunay(MP)
mbm = bmesh.new()
mvs = [mbm.verts.new((*to_xy(u, v), mainland_h(u, v))) for u, v in mpts]
for t in mtri.simplices:
    c_ = MP[t].mean(axis=0)
    if c_[1] < coast_v(c_[0]) + 0.5:
        continue
    try:
        f = mbm.faces.new([mvs[i] for i in t])
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
    return (lin('#3F5A3C') if nn > 0.45 else lin('#4B6741'), PT['leaf'])         # dark forest canopy, read at distance


obj('shakkei_land', mbm, face=mland_face, jitter=0.05, family='shakkei')
coast_skirt('shakkei_cliffs', [to_xy(u, coast_v(u)) for u in np.arange(1150.0, -650.0, -8.0)], lambda x, y: 3.0, lambda x, y: False,
            rows=2, amp=1.8, seed=71, jag=1.4)
# a sparse spruce fringe along the near hills (silhouette texture)
shL, shT = bmesh.new(), bmesh.new()
for k in range(260):
    u = mrng.uniform(-600, 1100); v = coast_v(u) + mrng.uniform(10, 120)
    x, y = to_xy(u, v)
    nl_kit.spruce(shL, shT, (x, y, mainland_h(u, v) - 0.5), mrng.uniform(9, 15), mrng)
obj('shakkei_spruce', shL, face=lambda q: ((lin('#34503A') if q.normal.z > 0.35 else lin('#29402F')), PT['leaf']), family='shakkei', jitter=0.08)
shT.free()
print('MAINLAND built')
