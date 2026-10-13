"""Style A "Lantern Miniature" -- style block builder + renderer (reproducible, headless).

    blender -b --factory-startup -P build.py -- [--states golden,night,noon] [--cams overview,harbour]
        [--prefix render] [--samples 64] [--scale 100] [--export] [--save]

World: 1 unit = 1 m, +Z up, sea level z=0. Camera: perspective, 25 deg vertical FOV, 35 deg pitch,
45 deg yaw (looking toward +X+Y). Screen-up = +X+Y, screen-right = +X-Y.
"""
import sys, os, math, time, json, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix, noise
from lib import *
import shading, stage
import kit_town as KT
import kit_harbour as KH
import kit_boats as KB
from shading import LOOK, set_global

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(n, d):
    return ARGV[ARGV.index(n) + 1] if n in ARGV else d


STATES = arg('--states', 'golden').split(',')
CAMS = arg('--cams', 'overview').split(',')
PREFIX = arg('--prefix', 'render')
SAMPLES = int(arg('--samples', '64'))
SCALE = int(arg('--scale', '100'))
EXPORT = '--export' in ARGV
T0 = time.time()

reset()
atlas = os.path.join(HERE, 'glb', 'emblem-atlas.png')
shading.build_emblem_atlas(atlas)
shading.build_all(atlas)
C_LAND = coll('land'); C_TOWN = coll('town'); C_HARB = coll('harbour'); C_BOATS = coll('boats')
C_SEA = coll('sea_sky'); C_LIGHTS = coll('lights'); C_FX = coll('fx')
random.seed(5)

# =============================================================== layout constants
QUAY_TOP = 1.9
T0Z, T1Z, T2Z = 1.9, 5.8, 9.6
W1Y, W2Y = 20.0, 34.0           # retaining walls (front face y), 1 m thick
TOWN_X0, TOWN_X1 = -50.0, 31.0
BACK_Y = 60.0
CORNER = (-50.0, -33.0, -22.0, 0.0)   # x0, x1, y0, y1  (slipway corner, lower-left)
HEAD_POLY = [(30, 2), (38, 7), (48, 8), (58, 4), (64, -4), (66, -16), (62, -27), (55, -35), (48, -38), (42, -33),
             (38, -23), (34, -13), (31, -5)]
LH_POS = (53.5, -26.0)
PIER_X = -2.0
PIER_Z = 1.2
MOLE = [(-35.0, -13.0), (-35.0, -44.0), (14.0, -44.0)]
MOLE_HEAD = (16.5, -44.0)
THEAD = (-22.0, 12.0, -24.0)    # x0, x1, centre y
FINGERS = (-7.0, -18.4)


def pip(x, y, poly):
    ins = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            ins = not ins
    return ins


def dist_poly(x, y, poly):
    best = 1e9
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]; bx, by = poly[(i + 1) % n]
        dx, dy = bx - ax, by - ay
        t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(x - ax - t * dx, y - ay - t * dy))
    return best


def head_sdf(x, y):
    d = dist_poly(x, y, HEAD_POLY)
    return -d if pip(x, y, HEAD_POLY) else d


def town_sdf(x, y):
    # wobbly back + left shores; straight quay edge (y=0) for x in [CORNER x1, TOWN_X1]
    back = BACK_Y + 3.0 * math.sin(x * 0.09) + 2.0 * math.sin(x * 0.23 + 1.0)
    left = TOWN_X0 + 2.5 * math.sin(y * 0.11) + 1.5 * math.sin(y * 0.31)
    d_town = max(-y, y - back, left - x, x - TOWN_X1 - 6.0)
    cx0, cx1, cy0, cy1 = CORNER
    cy0w = cy0 + 1.6 * math.sin(x * 0.2)
    d_corner = max(cx0 - 3 - x, x - cx1, cy0w - y, y - 1.0)
    return min(d_town, d_corner)


def land_sdf(x, y):
    return min(town_sdf(x, y), head_sdf(x, y))


def natural_shore(x, y):
    """True where the coast is rock/sand (not a quay wall)."""
    if -1.0 < y < 0.8 and CORNER[1] - 0.5 < x < 31.5:
        return False                       # town quay
    if CORNER[1] - 0.8 < x < CORNER[1] + 0.8 and CORNER[2] < y < 0.5:
        return False                       # corner quay (east face)
    return True


def terrace_z(x, y):
    if y < W1Y + 0.5:
        z = T0Z
    elif y < W2Y + 0.5:
        z = T1Z
    else:
        z = T2Z
        if y > 47:
            z = T2Z + min(3.0, (y - 47) * 0.5) * (1 - max(0, (y - 53) / 8.0))
    # west end: terraces melt into a natural slope
    if x < -40:
        t = min(1.0, (-40 - x) / 10.0)
        z = z * (1 - 0.35 * t) + 0.35 * t * (T0Z + 0.5 * max(0, y) / 8.0)
    return z


def height(x, y):
    sd = land_sdf(x, y)
    hd = head_sdf(x, y)
    if hd < 0 and hd < town_sdf(x, y) + 1.5 or (x > TOWN_X1 + 1 and hd < 3):
        base = 6.6 + 0.7 * noise.noise(Vector((x * 0.07, y * 0.07, 2.0)))
        dl = math.hypot(x - LH_POS[0], y - LH_POS[1])
        base = max(base, 7.6 - max(0, dl - 6.0) * 0.2)
        ramp = max(0.0, min(1.0, (x - 30.0) / 8.0))
        z = T0Z + (base - T0Z) * (ramp * ramp * (3 - 2 * ramp))
    else:
        z = terrace_z(x, y)
    if natural_shore(x, y) and sd > -6.0:
        t = max(0.0, min(1.0, (sd + 6.0) / 6.0))
        z = z * (1 - t ** 1.6) + (-2.5) * t ** 1.6 + 0.7 * noise.noise(Vector((x * 0.25, y * 0.25, 4.0))) * t * (1 - t) * 4
    return z


# =============================================================== terrain
def build_terrain():
    xs = list(np.arange(-62.0, 76.0, 1.25))
    ys = sorted(set(list(np.arange(-44.0, 70.0, 1.25)) + [0.0, W1Y, W1Y + 1.0, W2Y, W2Y + 1.0, -0.01]))
    nx, ny = len(xs), len(ys)
    Z = np.zeros((ny, nx))
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            Z[j, i] = height(x, y)
    bm = bmesh.new()
    vid = {}

    def V(i, j):
        k = (i, j)
        if k not in vid:
            vid[k] = bm.verts.new((xs[i], ys[j], Z[j, i]))
        return vid[k]
    for j in range(ny - 1):
        for i in range(nx - 1):
            cx, cy = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            sd = land_sdf(cx, cy)
            if sd > 0.0 and not natural_shore(cx, cy):
                continue
            if max(Z[j, i], Z[j, i + 1], Z[j + 1, i], Z[j + 1, i + 1]) < -1.0:
                continue
            bm.faces.new((V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1)))
    # planar decimation of the flat terrace interiors would lose AO detail; instead drop flat
    # interior faces that are fully covered by streets/houses (handled by budget elsewhere)
    me = bpy.data.meshes.new('terrain'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('terrain', me); C_LAND.objects.link(ob)
    me.materials.append(MATS['toon'])
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.update()
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    p0 = me.color_attributes.new('_pat0', 'FLOAT_COLOR', 'CORNER')
    p1 = me.color_attributes.new('_pat1', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = col
    vcol, vp1 = [], []
    for v in me.vertices:
        x, y, z = v.co
        slope = 1 - v.normal.z
        n1 = noise.noise(Vector((x * 0.05, y * 0.05, 1.0)))
        g = mixc(P('grass'), P('grass_lt'), max(0, n1) * 1.2)
        g = mixc(g, P('grass_dk'), max(0, -n1) * 0.9)
        rockk = max(0.0, min(1.0, (slope - 0.2) * 3.0))
        if z < 0.9:
            rockk = 1.0
        sand = 0.0
        if CORNER[0] - 2 < x < CORNER[1] - 2 and y < CORNER[2] + 4.0 and z < 2.2:
            sand = max(0.0, min(1.0, (CORNER[2] + 4.0 - y) / 3.0))
        rc = mixc(P('rock'), P('rock_lt'), 0.5 + 0.5 * noise.noise(Vector((x * 0.3, y * 0.3, z * 0.3))))
        if z < 0.35:
            rc = mixc(rc, P('weed'), min(1, (0.35 - z) * 1.5))
        c = mixc(g, rc, rockk)
        c = mixc(c, P('sand'), sand * (1 - rockk * 0.3))
        vcol.append(c)
        vp1.append((0, (1 - rockk) * (1 - sand), rockk * (1 - sand), 0))
    buf = np.zeros((len(me.loops), 4), np.float32); b1 = np.zeros((len(me.loops), 4), np.float32)
    for lp in me.loops:
        buf[lp.index] = (*vcol[lp.vertex_index], 1); b1[lp.index] = vp1[lp.vertex_index]
    col.data.foreach_set('color', buf.ravel()); p1.data.foreach_set('color', b1.ravel())
    p0.data.foreach_set('color', np.zeros(len(me.loops) * 4, np.float32))
    return ob


# =============================================================== town
F0, F1, F2 = 8.6, 26.2, 39.6     # front-facade y of each terrace row
HOUSES = [
    # (x, y-centre, terrace z, kwargs)   -- rows packed shoulder to shoulder, alleys at the stairs
    (-27.0, F0 + 4.0, T0Z, dict(w=6.4, d=8.0, h=6.4, wall='plaster_ochre', roof='terracotta', seed=1, lantern=True, ivy=True)),
    (-20.5, F0 + 4.0, T0Z, dict(w=5.0, d=8.0, h=8.4, wall='plaster_rose', roof='slate', ridge='y', seed=2, floors=3, shutters='shutter_teal', balcony=True)),
    (-10.9, F0 + 3.8, T0Z, dict(w=7.0, d=7.6, h=5.6, stone=True, roof='terracotta', seed=3, shutters='shutter_blue', dormer=True)),
    (-4.4, F0 + 4.0, T0Z, dict(w=5.2, d=8.0, h=7.6, wall='plaster_sky', roof='terracotta', seed=4, ridge='y', shutters='shutter_red', lantern=True)),
    (1.5, F0 + 3.8, T0Z, dict(w=5.8, d=7.6, h=6.2, wall='plaster_peach', roof='terracotta', seed=5, shutters='shutter_sage', half_timber=True)),
    (12.6, F0 + 3.8, T0Z, dict(w=6.6, d=7.6, h=5.4, wall='plaster_white', roof='slate', seed=6, shutters='shutter_blue', lantern=True, ivy=True)),
    (19.5, F0 + 4.0, T0Z, dict(w=5.2, d=8.0, h=7.2, wall='plaster_sage', roof='terracotta', ridge='y', seed=7, shutters='shutter_red')),
    (-25.0, F1 + 3.5, T1Z, dict(w=6.6, d=7.0, h=6.0, wall='plaster_peach', roof='terracotta', seed=8, shutters='shutter_teal', dormer=True)),
    (-18.2, F1 + 3.5, T1Z, dict(w=5.2, d=7.0, h=7.6, stone=True, roof='slate', ridge='y', seed=9, shutters='shutter_sage')),
    (-3.6, F1 + 3.5, T1Z, dict(w=7.4, d=7.0, h=5.6, wall='plaster_sky', roof='terracotta', seed=10, shutters='shutter_teal', lean_to=True, ivy=True)),
    (3.6, F1 + 3.5, T1Z, dict(w=5.4, d=7.0, h=7.4, wall='plaster_rose', roof='terracotta', ridge='y', seed=11, floors=3, shutters='shutter_blue')),
    (14.2, F1 + 3.5, T1Z, dict(w=6.0, d=7.0, h=5.4, wall='plaster_ochre', roof='slate', seed=12, shutters='shutter_sage', half_timber=True, lantern=True)),
    (-17.0, F2 + 3.5, T2Z, dict(w=6.4, d=7.0, h=6.4, wall='plaster_white', roof='terracotta', seed=13, shutters='shutter_teal', dormer=True)),
    (4.0, F2 + 3.5, T2Z, dict(w=5.8, d=7.0, h=6.6, wall='plaster_rose', roof='terracotta', ridge='y', seed=14, shutters='shutter_red', lantern=True)),
]
STAIRS1 = [-15.8, 7.1]       # x of stairs in wall W1 (alleys between T0 houses)
STAIRS2 = [-11.0, 9.0]       # x of stairs in wall W2
TREES = [
    # behind / between houses, terrace ends, ridge skyline, west slope, headland
    (-33.5, 13.5, 'round'), (25.5, 14.5, 'cypress'), (-14.0, 17.8, 'bush'), (9.4, 17.6, 'bush'),
    (-31.5, 28.5, 'round'), (21.0, 29.5, 'round'), (25.5, 30.5, 'cypress'), (-8.9, 29.5, 'cypress'),
    (-24.0, 43.0, 'round'), (-6.5, 44.0, 'round'), (13.0, 43.5, 'round'), (19.0, 41.0, 'cypress'), (-30.0, 39.0, 'cypress'),
    (-27.0, 50.0, 'round'), (-15.0, 51.0, 'round'), (-3.0, 50.5, 'cypress'), (8.0, 51.5, 'round'), (19.5, 49.0, 'round'),
    (-34.0, 46.0, 'round'), (-38.0, 33.0, 'round'), (-44.0, 22.0, 'round'), (-41.0, 10.0, 'bush'), (-46.0, 40.0, 'cypress'),
    (-36.0, 54.0, 'round'), (0.0, 56.0, 'round'), (-20.0, 56.0, 'round'), (12.0, 56.5, 'round'),
    (40.0, 3.0, 'round'), (60.0, -6.0, 'cypress'), (62.0, -20.0, 'pine'), (-30.0, 55.0, 'pine'), (22.0, 53.5, 'pine'), (-47.0, 33.0, 'pine'), (36.0, -9.0, 'bush'), (57.5, -1.0, 'round'), (42.0, -26.0, 'bush'),
    (-44.0, -5.0, 'round'), (-38.5, -9.0, 'bush'), (-48.0, 4.0, 'cypress'), (-36.0, 23.0, 'bush'),
]


def retaining_wall(p, y, x0, x1, z_lo, z_hi, stairs, seed):
    rng = random.Random(seed)
    xs = [x0] + sorted(sum([[s - 1.2, s + 1.2] for s in stairs], [])) + [x1]
    for a, b in zip(xs[0::2], xs[1::2]):
        if b - a < 0.2:
            continue
        p.add(bm_box(b - a, 1.0, z_hi - z_lo + 1.0, ((a + b) / 2, y + 0.5, (z_hi + z_lo) / 2 - 0.5)), P('stone_honey'), KT.MAS, drift=0.03)
        x = a
        while x < b - 0.05:
            w = min(rng.uniform(1.0, 1.6), b - x)
            bm = bm_box(w - 0.05, 1.15, 0.3, (x + w / 2, y + 0.5, z_hi + 0.12))
            jitter(bm, 0.03, int(x * 5 + y))
            p.add(bm, P('stone_honey_lt'), KT.MAS_SOFT, smooth=True, drift=0.07)
            x += w
    for s in stairs:
        n = int(round((z_hi - z_lo) / 0.3))
        run = 0.42
        for i in range(n):
            zt = z_lo + (i + 1) * (z_hi - z_lo) / n
            yy = y - (n - i) * run + run / 2
            p.add(bm_box(2.2, run + 0.02, zt - z_lo + 0.2, (s, yy + 0.5, (zt + z_lo) / 2 - 0.1)),
                  P('stone_honey_lt'), KT.MAS_SOFT, drift=0.05)
        for sx in (-1, 1):
            bm = bmesh.new()
            pts = [(s + sx * 1.25, y - n * run + 0.5, z_lo), (s + sx * 1.25, y + 0.5, z_lo), (s + sx * 1.25, y + 0.5, z_hi + 0.5),
                   (s + sx * 1.25, y - n * run + 0.5, z_lo + 0.5)]
            vs = [bm.verts.new(q) for q in pts]
            f = bm.faces.new(vs)
            bmesh.ops.solidify(bm, geom=[f], thickness=0.35)
            p.add(bm, P('stone_honey'), KT.MAS, drift=0.04)


def cobble_slab(p, x0, x1, y0, y1, z, color='cobble'):
    p.add(bm_box(x1 - x0, y1 - y0, 0.3, ((x0 + x1) / 2, (y0 + y1) / 2, z - 0.1)), P(color), KT.COB, drift=0.02)


def kerb(p, x0, x1, y, z):
    x = x0
    rng = random.Random(int(x0 + y))
    while x < x1:
        w = rng.uniform(0.7, 1.1)
        p.add(bm_box(w - 0.05, 0.3, 0.22, (x + w / 2, y, z + 0.06)), P('stone_honey_lt'), drift=0.06)
        x += w


def build_town(extra_bvh=None):
    objs = []
    streets = Part('streets')
    cobble_slab(streets, CORNER[1], TOWN_X1 + 1.5, 1.0, F0 - 0.2, QUAY_TOP + 0.08)
    cobble_slab(streets, CORNER[0] + 8, CORNER[1] + 0.5, -7.0, 1.0, QUAY_TOP + 0.08)
    cobble_slab(streets, -36.0, 27.0, W1Y + 1.0, F1 - 0.4, T1Z + 0.08)
    cobble_slab(streets, -30.0, 22.0, W2Y + 1.0, F2 - 0.4, T2Z + 0.08)
    kerb(streets, CORNER[1] + 1, TOWN_X1, F0 - 0.25, QUAY_TOP)
    for s in STAIRS1:
        cobble_slab(streets, s - 1.4, s + 1.4, F0 - 0.3, W1Y - 5.0, QUAY_TOP + 0.08)
    for s in STAIRS2:
        cobble_slab(streets, s - 1.4, s + 1.4, F1 - 0.5, W2Y - 5.0, T1Z + 0.08)
    # headland path: stepping stones from the quay end up to the cottage and the lighthouse
    for i in range(12):
        t = i / 11
        x = 30.5 + t * 20; y = 4 - t * 24
        z = height(x, y) + 0.08
        bm = bm_rock(0.7, 400 + i, sub=1, squash=0.22, amp=0.15, at=(x, y, z))
        streets.add(bm, P('stone_honey_lt'), KT.MAS_SOFT, smooth=True, drift=0.08)
    objs.append(streets.finish(C_TOWN, ao=0.5, ao_dist=1.2, grad=None))
    walls = Part('terrace_walls')
    retaining_wall(walls, W1Y, TOWN_X0 + 9, TOWN_X1 - 1, T0Z, T1Z, STAIRS1, 1)
    retaining_wall(walls, W2Y, TOWN_X0 + 13, TOWN_X1 - 6, T1Z, T2Z, STAIRS2, 2)
    objs.append(walls.finish(C_TOWN, ao=0.7, ao_dist=1.5, grad=(T0Z - 0.5, T2Z + 0.5, 0.85, 1.05, 1.0)))
    for i, (x, y, z, kw) in enumerate(HOUSES):
        kw = dict(kw)
        h = KT.house(f'house_{i:02d}', C_TOWN, **kw)
        objs.append(h.finish(C_TOWN, ao=0.8, ao_dist=1.6, ground=0.0, grad=(0, kw.get('h', 6) + 4, 0.84, 1.05, 1.0), loc=(x, y, z)))
    cz = height(45, -8)
    kc = KT.house('keepers_cottage', C_TOWN, w=7.4, d=5.2, h=4.4, wall='plaster_white', roof='slate', seed=21, floors=1,
                  shutters='shutter_teal', lean_to=True, lantern=True, chimneys=((-0.55, 0.0), (0.6, 0.0)), boxes=True)
    objs.append(kc.finish(C_TOWN, ao=0.8, ground=0.0, grad=(0, 7, 0.86, 1.05, 1.0), loc=(45.0, -8.0, cz - 0.1)))
    oz = height(58.5, -13)
    os_ = Part('oil_store'); KH.oil_store(os_, (0, 0, 0))
    objs.append(os_.finish(C_HARB, ao=0.7, ground=0.0, grad=(0, 4, 0.86, 1.04, 1.0), loc=(58.5, -13.0, oz - 0.1), rz=math.radians(90)))
    mz = height(40.5, -18.5)
    sm = Part('signal_mast'); KH.signal_mast(sm, (0, 0, 0), h=12.0, cones=2)
    objs.append(sm.finish(C_HARB, ao=0.4, ground=0.0, loc=(40.5, -18.5, mz)))
    lz = height(*LH_POS)
    lh = Part('lighthouse'); KH.lighthouse(lh, (0, 0, 0))
    objs.append(lh.finish(C_HARB, ao=0.8, ao_dist=2.0, ground=0.0, grad=(0, 20, 0.82, 1.06, 1.0), loc=(LH_POS[0], LH_POS[1], lz - 0.05)))
    KH.LIGHT_POS['lantern_world'] = Vector((LH_POS[0], LH_POS[1], lz)) + KH.LIGHT_POS['lantern']
    KH.LIGHT_POS['lh_door_world'] = [Vector((LH_POS[0], LH_POS[1], lz)) + v for v in KH.LIGHT_POS.get('door', [])]
    rng = random.Random(77)
    for i, (x, y, kind) in enumerate(TREES):
        z = height(x, y)
        hh = {'round': rng.uniform(4.8, 8.0), 'cypress': rng.uniform(6.5, 9.5), 'bush': 1.0, 'pine': rng.uniform(8.0, 10.0)}[kind]
        tp, sph = KT.tree(f'tree_{i:02d}', kind, h=hh, seed=100 + i, r=rng.uniform(0.9, 1.4) if kind == 'bush' else None)
        objs.append(tp.finish(C_TOWN, sphere_normals=sph, ao=0.5, ao_dist=1.5, ground=0.0, loc=(x, y, z - 0.1), rz=rng.uniform(0, 6.28)))
    gd = Part('gardens')
    hedges = [(-30.5, 18.4, 6, 0), (16.5, 18.6, 6, 0), (-29.0, 32.6, 6, 0), (21.5, 32.5, 5, 0), (-10.0, 46.5, 9, 0),
              (13.0, 46.0, 6, 0), (51.0, -2.0, 6, 0)]
    for k, (x, y, L_, rot) in enumerate(hedges):
        hp, sph = KT.hedge(f'hedge_{k}', L_, seed=200 + k)
        objs.append(hp.finish(C_TOWN, sphere_normals=sph, ao=0.4, ground=0.0, loc=(x, y, height(x, y) - 0.05), rz=math.pi / 2 * rot))
    # flower beds + vegetable rows
    for k, (x, y) in enumerate(((-6.5, 18.2), (-25.0, 33.0), (2.5, 32.8), (-10.0, 49.0), (16.0, 48.0), (-36.5, 7.5))):
        z = height(x, y)
        gd.add(bm_box(4.0, 1.4, 0.35, (x, y, z), bevel=0.05, seg=1), lin('#6E5038'), drift=0.05)
        for r in range(5):
            for c in range(2):
                fc = rng.choice(('flower_red', 'flower_pink', 'flower_white', 'flower_yellow', 'flower_violet', 'leaf_lt'))
                gd.add(bm_rock(0.3, k * 50 + r * 3 + c, sub=1, squash=0.8, amp=0.2, at=(x - 1.6 + r * 0.8, y - 0.35 + c * 0.7, z + 0.35)),
                       P(fc), KT.NONE, KT.FOL if fc == 'leaf_lt' else KT.NONE, smooth=True)
    # vegetable plot on the west slope
    for r in range(6):
        x = -45.0 + r * 1.1
        gd.add(bm_box(0.7, 6.0, 0.25, (x, 28.0, height(x, 28.0) + 0.05)), lin('#6E5038'), drift=0.06)
        for c in range(6):
            gd.add(bm_rock(0.28, 900 + r * 9 + c, sub=1, squash=0.7, amp=0.2, at=(x, 25.5 + c * 1.0, height(x, 28.0) + 0.3)),
                   P('leaf_lt' if r % 2 else 'leaf'), KT.NONE, KT.FOL, smooth=True)
    # keeper's garden: picket fence + washing line
    for i in range(18):
        x = 40 + i * 0.7
        gd.add(bm_box(0.08, 0.06, 0.9, (x, -13.4, height(x, -13.4) + 0.4)), P('frame_white'))
    gd.add(bm_box(12.6, 0.05, 0.08, (46.0, -13.4, height(46, -13.4) + 0.6)), P('frame_white'))
    for x in (41.0, 49.0):
        gd.add(bm_box(0.1, 0.1, 2.2, (x, -2.6, height(x, -2.6) + 1.0)), P('timber_dk'))
    pts = catenary((41, -2.6, height(41, -2.6) + 2.0), (49, -2.6, height(49, -2.6) + 2.0), 0.3, 8)
    gd.add(bm_tube(pts, 0.015, 3), P('frame_white'))
    for k, c in enumerate(('flower_white', 'shutter_blue', 'flower_pink', 'frame_white', 'flower_yellow')):
        t = (k + 1) / 6
        q = Vector(pts[0]).lerp(Vector(pts[-1]), t) - Vector((0, 0, 0.3 * 4 * t * (1 - t) + 0.45))
        gd.add(bm_box(0.7, 0.04, 0.8, tuple(q)), P(c), drift=0.03)
    # quay street furniture
    for x in (-28.0, -9.0, 8.0, 24.0):
        KT.lamp_post(gd, (x, 1.6, QUAY_TOP + 0.1))
        KH.LIGHT_POS.setdefault('street', []).append(Vector((x, 1.6, QUAY_TOP + 3.7)))
    for (x, y, z) in ((-30.0, W1Y + 1.6, T1Z), (-8.5, W1Y + 1.6, T1Z), (17.0, W1Y + 1.6, T1Z), (-20.0, W2Y + 1.6, T2Z), (11.0, W2Y + 1.6, T2Z)):
        KT.lamp_post(gd, (x, y, z + 0.1), h=3.0)
        KH.LIGHT_POS.setdefault('street', []).append(Vector((x, y, z + 3.4)))
    KT.bench(gd, (-24.0, F0 - 0.9, QUAY_TOP + 0.1)); KT.bench(gd, (-2.0, W1Y + 4.0, T1Z + 0.1)); KT.bench(gd, (15.0, F0 - 0.9, QUAY_TOP + 0.1))
    for k, (x, y) in enumerate(((-17.0, 3.0), (-16.3, 3.5), (-16.6, 2.4), (17.0, 3.0), (17.7, 3.4), (2.6, 2.6))):
        KT.barrel(gd, (x, y, QUAY_TOP + 0.1), seed=k)
    for k, (x, y, s_) in enumerate(((-14.5, 3.0, 0.7), (18.8, 2.3, 0.6), (19.5, 3.1, 0.5), (4.0, 2.6, 0.6), (-31.0, 3.0, 0.6))):
        KT.crate(gd, (x, y, QUAY_TOP + 0.1), s=s_, rz=k * 0.3, seed=k)
    KT.crate(gd, (-14.5, 3.0, QUAY_TOP + 0.8), s=0.55, rz=0.4, seed=9)
    KT.net_rack(gd, (-34.0, 5.0, QUAY_TOP + 0.1), rz=math.pi / 2, seed=1)
    KT.net_rack(gd, (-46.0, -4.5, QUAY_TOP + 0.3), rz=0.2, seed=2)
    KT.lobster_pots(gd, (-31.5, 1.8, QUAY_TOP + 0.1), n=4, seed=3)
    KT.lobster_pots(gd, (26.5, 2.2, QUAY_TOP + 0.1), n=3, seed=4)
    KT.lobster_pots(gd, (-39.0, -3.0, QUAY_TOP + 0.1), n=3, seed=5)
    # headland: meadow flowers, low stone ring round the lighthouse, a bench facing the sea
    for k in range(30):
        a = rng.uniform(0, 6.28); r_ = rng.uniform(4, 22)
        x, y = 50 + math.cos(a) * r_ * 0.8, -14 + math.sin(a) * r_
        if head_sdf(x, y) > -3 or math.hypot(x - LH_POS[0], y - LH_POS[1]) < 6.5 or math.hypot(x - 45, y + 8) < 5:
            continue
        z = height(x, y)
        fc = rng.choice(('flower_white', 'flower_yellow', 'flower_pink', 'flower_violet', 'flower_white', 'leaf_lt'))
        for j in range(2):
            gd.add(bm_sphere(0.16, 1, at=(x + rng.uniform(-0.5, 0.5), y + rng.uniform(-0.5, 0.5), z + 0.12)), P(fc), smooth=True, drift=0.08)
    for k in range(26):
        a = math.radians(-60) + k / 25 * math.radians(300)
        x, y = LH_POS[0] + math.cos(a) * 7.2, LH_POS[1] + math.sin(a) * 7.2
        gd.add(bm_rock(0.45, 4000 + k, sub=1, squash=0.75, amp=0.18, at=(x, y, height(x, y) + 0.25)),
               P(rng.choice(('stone_grey', 'stone_grey_lt', 'rock_lt'))), KT.NONE, KT.ROCK, smooth=True, drift=0.06)
    KT.bench(gd, (47.0, -27.5, height(47.0, -27.5) + 0.05), rz=math.radians(200))
    # dry-stone field walls on the west slope
    for (x0, y0, x1, y1) in ((-47.0, 8.0, -36.0, 9.0), (-48.5, 20.0, -38.0, 19.0), (-46.0, 31.0, -36.0, 31.5), (-42.5, 36.0, -36.0, 48.0),
                             (-46.0, 44.0, -38.5, 44.5), (30.0, 22.0, 30.5, 33.0), (25.0, 40.0, 30.0, 48.0)):
        L_ = math.hypot(x1 - x0, y1 - y0); n = max(2, int(L_ / 0.95))
        for i in range(n):
            t = (i + 0.5) / n
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            z = height(x, y)
            for lay in range(1):
                gd.add(bm_rock(0.45 - lay * 0.08, 3000 + i * 3 + lay + int(x0 * 7), sub=1, squash=0.7, amp=0.2,
                               at=(x + rng.uniform(-0.1, 0.1), y + rng.uniform(-0.1, 0.1), z + 0.2 + lay * 0.42)),
                       P(rng.choice(('stone_honey', 'stone_honey_lt', 'rock_lt'))), KT.NONE, KT.ROCK, smooth=True, drift=0.08)
    objs.append(gd.finish(C_TOWN, ao=0.6, ao_dist=1.2, ground=None))
    # orchard: small fruit trees with fruit dots
    for k, (x, y) in enumerate(((-45.0, 13.0), (-41.0, 15.0), (-45.5, 17.5), (-41.5, 24.0), (-45.0, 26.0), (-38.0, 41.0), (-42.0, 40.0))):
        z = height(x, y)
        tp, sph = KT.tree(f'orchard_{k}', 'round', h=4.2, seed=500 + k, r=1.35)
        for j in range(4):
            a = rng.uniform(0, 6.28); e = rng.uniform(-0.2, 0.8)
            q = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))) * 1.45 + Vector((0, 0, 4.2 - 1.35 * 0.9 + 0.2))
            tp.add(bm_sphere(0.14, 1, at=tuple(q)), P(rng.choice(('flower_red', 'flower_yellow', 'canvas_ochre'))), smooth=True)
        objs.append(tp.finish(C_TOWN, sphere_normals=sph, ao=0.5, ground=0.0, loc=(x, y, z - 0.1), rz=rng.uniform(0, 6.28)))
    return objs


# =============================================================== harbour
def build_harbour():
    objs = []
    q = Part('quay')
    KH.quay_wall(q, CORNER[1], TOWN_X1 - 0.5, 0.0, top=QUAY_TOP, face=-1, bollard_every=6.5)
    KH.quay_stairs(q, -24.0, 0.0, top=QUAY_TOP, face=-1, along=1)
    KH.quay_stairs(q, 22.0, 0.0, top=QUAY_TOP, face=-1, along=-1)
    objs.append(q.finish(C_HARB, ao=0.6, ao_dist=1.5, grad=(-0.6, QUAY_TOP + 0.3, 0.55, 1.03, 1.0)))
    qq = Part('quay_corner')
    KH.quay_wall(qq, CORNER[2] + 1.0, 0.0, 0.0, top=QUAY_TOP, face=-1, bollard_every=6.0)
    ob = qq.finish(C_HARB, ao=0.6, ao_dist=1.5, grad=(-0.6, QUAY_TOP + 0.3, 0.55, 1.03, 1.0))
    ob.rotation_euler.z = math.pi / 2; ob.location = (CORNER[1], 0.0, 0.0)
    objs.append(ob)
    pr = Part('pier_group')
    W = 5.0
    KH.pier_run(pr, PIER_X, -0.5, PIER_X, THEAD[2] + 2.0, W, z=PIER_Z, seed=1)
    bm = bm_box(W, 2.0, 0.3, (PIER_X, 0.6, (QUAY_TOP + PIER_Z) / 2))
    for v in bm.verts:
        if v.co.y < 0.6:
            v.co.z -= (QUAY_TOP - PIER_Z) / 2
    pr.add(bm, P('plank'), KT.PLANK)
    KH.pier_run(pr, THEAD[0], THEAD[2], THEAD[1], THEAD[2], 4.2, z=PIER_Z, seed=2)
    for fy in FINGERS:
        KH.pier_run(pr, PIER_X + W / 2, fy, PIER_X + W / 2 + 13.0, fy, 1.8, z=PIER_Z - 0.05, seed=int(-fy), pile_step=3.3, bracing=False, color='plank_grey')
    ty = THEAD[2]
    for (x, y) in ((PIER_X - 2.3, -9.0), (THEAD[0] + 1.0, ty - 1.8), (THEAD[1] - 1.0, ty - 1.8), (PIER_X + 2.3, ty + 2.5),
                   (PIER_X + W / 2 + 12.2, FINGERS[0] - 0.8), (PIER_X + W / 2 + 12.2, FINGERS[1] - 0.8)):
        KH.pier_lamp(pr, (x, y, PIER_Z))
    for x in np.arange(THEAD[0] + 1.5, THEAD[1], 4.5):
        KH.cleat(pr, (x, ty - 1.8, PIER_Z), 0.0); KH.cleat(pr, (x, ty + 1.8, PIER_Z), 0.0)
    for y in np.arange(-3.0, ty + 2.0, -4.0):
        KH.cleat(pr, (PIER_X - 2.3, y, PIER_Z), math.pi / 2)
    for fy in FINGERS:
        for x in (PIER_X + 6, PIER_X + 12):
            KH.cleat(pr, (x, fy + 0.75, PIER_Z - 0.05)); KH.cleat(pr, (x, fy - 0.75, PIER_Z - 0.05))
    KH.coil(pr, (PIER_X - 1.2, -12.0, PIER_Z)); KH.coil(pr, (PIER_X + 7.0, ty - 0.6, PIER_Z)); KH.coil(pr, (PIER_X - 9, ty + 0.8, PIER_Z))
    KT.barrel(pr, (PIER_X + 3.5, ty + 0.5, PIER_Z), seed=21); KT.barrel(pr, (PIER_X + 4.1, ty + 0.0, PIER_Z), seed=22)
    KT.barrel(pr, (PIER_X + 3.8, ty + 1.1, PIER_Z), seed=23, lying=True)
    KT.crate(pr, (PIER_X - 5.5, ty + 0.4, PIER_Z), 0.7, 0.2, 4); KT.crate(pr, (PIER_X - 6.3, ty + 0.5, PIER_Z), 0.6, -0.1, 5)
    KT.crate(pr, (PIER_X - 5.8, ty + 0.3, PIER_Z + 0.7), 0.5, 0.5, 6)
    KH.life_ring(pr, (PIER_X + 2.2, -13.0, PIER_Z), rz=math.pi / 2)
    KT.lobster_pots(pr, (PIER_X + 0.6, -3.5, PIER_Z), n=3, seed=8)
    objs.append(pr.finish(C_HARB, ao=0.55, ao_dist=1.2, grad=(-1.0, PIER_Z + 0.2, 0.7, 1.02, 1.0)))
    ml = Part('mole')
    KH.mole(ml, MOLE, width=5.0, top=2.6, seed=3)
    KH.mole_head(ml, MOLE_HEAD, top=2.6, r=4.2)
    for x in (-24.0, -6.0, 8.0):
        KH.bollard(ml, (x, MOLE[1][1] + 2.0, 2.75))
    objs.append(ml.finish(C_HARB, ao=0.4, ao_dist=1.5, grad=(-0.8, 3.0, 0.8, 1.03, 0.5)))
    sw = Part('slipway')
    sx = -42.5
    Y0 = -25.5
    bm = bm_box(5.0, 13.0, 0.5, (sx, Y0, 0.0))
    for v in bm.verts:
        v.co.z += (v.co.y - Y0) / 13.0 * 3.2 + 0.5
    sw.add(bm, P('stone_honey_lt'), KT.COB, drift=0.03)
    for k in range(8):
        yy = Y0 - 5.5 + k * 1.5
        sw.add(bm_box(5.0, 0.18, 0.12, (sx, yy, (yy - Y0) / 13.0 * 3.2 + 0.5 + 0.28)), P('timber_dk'))
    KT.rowboat(sw, (sx - 1.0, Y0 + 2.0, 1.3), rz=math.radians(84), color='shutter_teal', seed=1)
    KT.rowboat(sw, (sx + 1.2, Y0 - 1.5, 0.45), rz=math.radians(97), color='shutter_red', seed=2)
    KT.rowboat(sw, (sx - 6.0, Y0 + 9.0, 1.9), rz=math.radians(20), color='frame_white', seed=3, upside=True)
    sw.add(bm_box(1.2, 0.8, 0.8, (sx, Y0 + 8.0, 2.2)), P('timber_dk'))
    sw.add(bm_cyl(0.3, 0.3, 1.4, 8, (sx - 0.7, Y0 + 8.0, 2.6)), P('iron'), smooth=True)
    objs.append(sw.finish(C_HARB, ao=0.5, ao_dist=1.0))
    rk = Part('shore_rocks')
    rng = random.Random(9)
    pts = []
    for x in np.arange(-62, 74, 4.3):
        for y in np.arange(-40, 68, 4.3):
            jx, jy = x + rng.uniform(-1.1, 1.1), y + rng.uniform(-1.1, 1.1)
            s = land_sdf(jx, jy)
            if -1.5 < s < 1.2 and natural_shore(jx, jy) and not (-46 < jx < -39 and jy < -16):
                cl = noise.noise(Vector((jx * 0.08, jy * 0.08, 7.0)))
                if rng.random() < 0.45 + 0.5 * cl:
                    pts.append((jx, jy, s))
    for k, (x, y, s) in enumerate(pts):
        big = head_sdf(x, y) < 5
        r = rng.uniform(0.9, 2.0) * (1.4 if big else 1.0)
        z = max(-1.2, height(x, y)) * 0.5 - 0.3 + rng.uniform(-0.3, 0.3)
        bm = bm_rock(r, 700 + k, sub=2, squash=rng.uniform(0.5, 0.75), amp=0.22, at=(x, y, z))
        rk.add(bm, P(rng.choice(('rock', 'rock', 'rock_lt', 'stone_honey_dk', 'rock_dk'))), pat1=KT.ROCK, smooth=True, drift=0.12)
    # cliff boulders on steep natural slopes (no bare heightfield walls)
    k0 = len(pts)
    for x in np.arange(-62, 74, 5.5):
        for y in np.arange(-40, 68, 5.5):
            jx, jy = x + rng.uniform(-1.0, 1.0), y + rng.uniform(-1.0, 1.0)
            if land_sdf(jx, jy) > 0.5 or not natural_shore(jx, jy):
                continue
            gx = (height(jx + 0.5, jy) - height(jx - 0.5, jy)); gy = (height(jx, jy + 0.5) - height(jx, jy - 0.5))
            g = math.hypot(gx, gy)
            if g > 0.55 and height(jx, jy) > -0.8:
                k0 += 1
                r = rng.uniform(1.2, 2.4)
                z = height(jx, jy) - r * 0.18
                bm = bm_rock(r, 1300 + k0, sub=2, squash=rng.uniform(0.38, 0.55), amp=0.16, at=(0, 0, 0), stretch=(1.35, 1.0, 1.0))
                xform(bm, rz=rng.uniform(0, 6.28))
                nrm = Vector((-gx, -gy, 1.0)).normalized()
                nrm = (nrm + Vector((0, 0, 0.6))).normalized()      # half-way: slabs step down the slope
                bmesh.ops.transform(bm, matrix=Matrix.Translation((jx, jy, z)) @ nrm.to_track_quat('Z', 'Y').to_matrix().to_4x4(), verts=bm.verts)
                rk.add(bm, P(rng.choice(('rock', 'rock_lt', 'rock', 'stone_honey_dk', 'rock_dk'))), pat1=KT.ROCK, smooth=True, drift=0.12)
    objs.append(rk.finish(C_LAND, ao=0.4, ao_dist=1.5, grad=(-0.5, 4.0, 0.7, 1.05, 1.0)))
    return objs


# =============================================================== boats
_B = lambda L, r: L * r / 2           # half-beam
TY = THEAD[2]
BOATS = [
    # name, family, class, state, (x, y), heading(deg), brand, emblem, heel(deg), tack
    ('flagship_usdt', 'usd_ship', 'flagship', 'docked', (-4.0, TY - 2.1 - 0.45 - _B(26, 0.23)), 180, 'brand_usdt', 0, 0, 1),
    ('brig_gold', 'gold_brig', 'large', 'docked', (-13.8, TY + 2.1 + 0.45 + _B(18, 0.27)), 180, 'brand_gold', 3, 0, 1),
    ('sloop_usdc', 'usd_sloop', 'small', 'docked', (PIER_X - 2.5 - 0.45 - _B(10, 0.33), -8.0), -90, 'brand_usdc', 1, 0, 1),
    ('catboat_pyusd', 'usd_sloop', 'boat', 'docked', (PIER_X + 2.5 + 6.5, FINGERS[0] + 0.9 + 0.45 + _B(7.5, 0.33)), 180, 'brand_pyusd', 5, 0, 1),
    ('botter_eurc', 'eur_botter', 'medium', 'docked', (PIER_X + 2.5 + 7.5, FINGERS[0] - 0.9 - 0.45 - _B(13, 0.36)), 180, 'brand_eurc', 2, 0, 1),
    ('schooner_dai', 'usd_schooner', 'medium', 'docked', (PIER_X + 2.5 + 7.5, FINGERS[1] + 0.9 + 0.45 + _B(13, 0.27)), 180, 'brand_dai', 4, 0, 1),
    ('botter_sail', 'eur_botter', 'medium', 'sailing', (17.0, -31.0), -25, 'brand_eurc', 2, 7, 1),
    ('sloop_sail', 'usd_sloop', 'small', 'sailing', (31.0, -40.5), 160, 'brand_usdc', 1, 9, -1),
]
BOAT_INFO = {}


def build_boats():
    objs = []
    for (nm, fam, cls, st, (x, y), hd, brand, emb, heel, tack) in BOATS:
        p, sails, info = KB.boat(nm, fam, cls, st, brand=P(brand), emblem=emb, seed=hash(nm) % 97, tack=tack)
        if st == 'docked':
            KB.fenders(p, info['Lh'], info['B'], info['fb'], side=1, n=3)
            KB.fenders(p, info['Lh'], info['B'], info['fb'], side=-1, n=3)
        root = bpy.data.objects.new(nm, None); C_BOATS.objects.link(root)
        root.location = (x, y, 0.0)
        root.rotation_euler = (math.radians(heel) * tack, 0, math.radians(hd))
        objs.append(p.finish(C_BOATS, ao=0.5, ao_dist=1.0, parent=root, wn='angle'))
        if sails:
            so = sails.finish(C_BOATS, parent=root)
            so['emblem'] = float(emb)
            objs.append(so)
        BOAT_INFO[nm] = (root, info, st, (x, y), hd, cls)
    return objs


def mooring_lines():
    """Bow/stern lines from hull cleats to the nearest pier cleat/bollard (catenary tubes)."""
    ml = Part('mooring_lines')
    bpy.context.view_layer.update()
    for nm, (root, info, st, (x, y), hd, cls) in BOAT_INFO.items():
        if st != 'docked':
            continue
        mw = root.matrix_world
        for c in info['cleats']:
            a = mw @ c
            # target: toward the pier side, along the boat axis outward
            fwd = (mw.to_3x3() @ Vector((1, 0, 0))).normalized()
            side = Vector((-fwd.y, fwd.x, 0))
            sgn = 1 if c.x > 0 else -1
            # choose the side facing the nearest pier structure
            best = None
            for s in (-1, 1):
                b = a + fwd * sgn * 2.0 + side * s * (info['B'] / 2 + 1.0)
                b.z = PIER_Z + 0.1
                d = abs(land_like(b.x, b.y))
                if best is None or d < best[0]:
                    best = (d, b)
            ml.add(bm_tube(catenary(a, best[1], 0.35, 8), 0.035, 4), lin('#D9C9A0'), smooth=True)
    return ml.finish(C_HARB)


def pier_rects():
    W = 5.0
    r = [(PIER_X - W / 2, PIER_X + W / 2, THEAD[2] + 2.0, 0.0), (THEAD[0], THEAD[1], THEAD[2] - 2.1, THEAD[2] + 2.1)]
    for fy in FINGERS:
        r.append((PIER_X + W / 2, PIER_X + W / 2 + 13.0, fy - 0.9, fy + 0.9))
    return r


def land_like(x, y):
    d = 1e9
    for (x0, x1, y0, y1) in pier_rects():
        dx = max(x0 - x, 0, x - x1); dy = max(y0 - y, 0, y - y1)
        d = min(d, math.hypot(dx, dy))
    return d


# =============================================================== sea SDF (R = distance to coast/structures, G = wake)
SDF_N, SDF_SPAN, SDF_DMAX = 1024, 220.0, 14.0
SDF_C = (2.0, 14.0)


def occupancy():
    n = SDF_N
    h = SDF_SPAN / n
    xs = (np.arange(n) + 0.5) * h - SDF_SPAN / 2 + SDF_C[0]
    ys = (np.arange(n) + 0.5) * h - SDF_SPAN / 2 + SDF_C[1]
    occ = np.zeros((n, n), np.uint8)
    # sample the analytic height at 1/4 resolution, upsample
    s = 4
    sub = np.zeros((n // s, n // s))
    for j in range(n // s):
        for i in range(n // s):
            x, y = xs[i * s + s // 2], ys[j * s + s // 2]
            sub[j, i] = height(x, y) if land_sdf(x, y) < 1.0 else -3.0
    occ = np.kron(sub > 0.25, np.ones((s, s), bool))
    X, Y = np.meshgrid(xs, ys)
    for (x0, x1, y0, y1) in pier_rects():
        pass   # piers are open (piles only) -- piles added as small discs below
    # mole + head + quay walls + slipway are solid
    occ |= (np.abs(X - MOLE[0][0]) < 2.6) & (Y < MOLE[0][1] + 0.5) & (Y > MOLE[1][1] - 2.6)
    occ |= (np.abs(Y - MOLE[1][1]) < 2.6) & (X > MOLE[1][0] - 2.6) & (X < MOLE[2][0] + 1)
    occ |= np.hypot(X - MOLE_HEAD[0], Y - MOLE_HEAD[1]) < 4.2
    occ |= (np.abs(X + 42.5) < 2.5) & (Y > -32) & (Y < -19)
    occ |= np.hypot(X + 69.5, Y - 16.2) < 4.2
    return xs, ys, X, Y, occ


def edt(occ, h):
    """Exact-ish distance transform (two-pass chamfer 3-4-5 style via numpy)."""
    INF = 1e6
    d = np.where(occ, 0.0, INF)
    n = d.shape[0]
    # separable approximate EDT: do 1D squared distance transforms (Felzenszwalb) per row/col
    def dt1(f):
        n = len(f); v = np.zeros(n, int); z = np.zeros(n + 1); k = 0
        v[0] = 0; z[0] = -INF; z[1] = INF
        out = np.zeros(n)
        for q in range(1, n):
            s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
            while s <= z[k]:
                k -= 1
                s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
            k += 1; v[k] = q; z[k] = s; z[k + 1] = INF
        k = 0
        for q in range(n):
            while z[k + 1] < q:
                k += 1
            out[q] = (q - v[k]) ** 2 + f[v[k]]
        return out
    f = np.where(occ, 0.0, INF)
    for i in range(n):
        f[:, i] = dt1(f[:, i])
    for j in range(n):
        f[j, :] = dt1(f[j, :])
    return np.sqrt(f) * h


def build_sea_sdf():
    path = os.path.join(HERE, 'glb', 'sea-sdf.png')
    cache = os.path.join(HERE, 'glb', '.sea-sdf.npz')
    xs, ys, X, Y, occ = occupancy()
    h = SDF_SPAN / SDF_N
    key = float(occ.sum()) + len(pier_rects())
    if os.path.exists(cache) and float(np.load(cache)['key']) == key:
        d = np.load(cache)['d']
    else:
        d = edt(occ, h)
        np.savez_compressed(cache, d=d, key=key)
    # piles: small discs (foam rings), boats: hull ellipses
    pile_pts = []
    for (x0, x1, y0, y1) in pier_rects():
        if x1 - x0 > y1 - y0:
            for x in np.arange(x0, x1 + 0.1, 3.2):
                pile_pts += [(x, y0), (x, y1)]
        else:
            for y in np.arange(y0, y1 + 0.1, 3.2):
                pile_pts += [(x0, y), (x1, y)]
    ds = np.full_like(d, SDF_DMAX)
    for (px, py) in pile_pts:
        ds = np.minimum(ds, np.maximum(0, np.hypot(X - px, Y - py) + 0.12))
    wake = np.zeros_like(d)
    for nm, (root, info, st, (bx, by), hd, cls) in BOAT_INFO.items():
        a = math.radians(hd); fx, fy = math.cos(a), math.sin(a)
        Lh, B = info['Lh'], info['B']
        # hull footprint ellipse distance (approx)
        u = (X - bx) * fx + (Y - by) * fy; v = -(X - bx) * fy + (Y - by) * fx
        e = np.sqrt((u / (Lh / 2)) ** 2 + (v / (B / 2 * 0.95)) ** 2)
        dh = np.maximum(0, (e - 1) * min(Lh / 2, B / 2 * 0.95)) + 0.18
        ds = np.minimum(ds, dh)
        if st == 'sailing':
            # Kelvin wake: two arms at +-19.5 deg behind the stern + turbulent centre
            sx_, sy_ = bx - fx * Lh * 0.45, by - fy * Lh * 0.45
            ub = -((X - sx_) * fx + (Y - sy_) * fy)       # distance behind the stern
            vb = -(X - sx_) * fy + (Y - sy_) * fx
            behind = ub > 0
            L_w = 32.0
            fade = np.clip(1 - ub / L_w, 0, 1) ** 1.5 * behind
            arm = np.abs(np.abs(vb) - ub * math.tan(math.radians(19.5)) - B * 0.3)
            w = 0.35 + ub * 0.04
            g = np.exp(-(arm / w) ** 2) * fade
            centre = np.exp(-(vb / (B * 0.35 + ub * 0.03)) ** 2) * np.clip(1 - ub / 18.0, 0, 1) ** 1.2 * behind
            # bow wave
            bowc = np.exp(-((e - 1.05) / 0.12) ** 2) * (u > 0) * 0.8
            wake = np.maximum(wake, np.maximum(g * 0.9, np.maximum(centre * 0.75, bowc)))
    img = bpy.data.images.new('sea_sdf', SDF_N, SDF_N, float_buffer=True, alpha=False)
    px = np.zeros((SDF_N, SDF_N, 4), np.float32)
    px[..., 0] = np.clip(d / SDF_DMAX, 0, 1); px[..., 1] = wake; px[..., 2] = np.clip(ds / SDF_DMAX, 0, 1); px[..., 3] = 1
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    return img


# =============================================================== sea surface (curved edge-of-the-world)
# Camera-relative "rolling horizon": beyond D0 metres past the overview target (along the view),
# the sea bends down quadratically (+ a gentle lateral term so the horizon arcs).
# WebGL2: one line in the sea vertex shader, z -= K * max(0, dot(p - T, F) + A*l*l - D0)^2.
SEA_T = Vector((2.0, 9.0, 0.0))
SEA_D0 = 62.0
SEA_A = 0.0022
SEA_K = 0.015
SIDE = Vector((math.sin(stage.YAW), -math.cos(stage.YAW), 0))


def sea_z(x, y, K=None):
    K = SEA_K if K is None else K
    q = Vector((x, y, 0)) - SEA_T
    d = q.dot(stage.FWD); l = q.dot(SIDE)
    return -K * max(0.0, d + SEA_A * l * l - SEA_D0) ** 2


HORIZON = {}


def horizon_elev(camloc, K):
    def hits(e):
        dvec = Vector((stage.FWD.x * math.cos(e), stage.FWD.y * math.cos(e), math.sin(e)))
        s_ = 5.0
        while s_ < 4000:
            p_ = camloc + dvec * s_
            if p_.z <= sea_z(p_.x, p_.y, K):
                return True
            if p_.z < -2000:
                return False
            s_ += 1.0 if s_ < 600 else 5.0
        return False
    lo, hi = math.radians(-40), math.radians(-12)
    for _ in range(28):
        mid = (lo + hi) / 2
        if hits(mid):
            lo = mid
        else:
            hi = mid
    return lo


def tune_horizon(cam_ob, frac_from_top=0.13):
    global SEA_K
    t = math.tan(stage.VFOV / 2) * (1 - 2 * frac_from_top)
    e_target = -stage.PITCH + math.atan(t)
    lo, hi = 1e-4, 0.5
    for _ in range(26):
        k = math.sqrt(lo * hi)
        e = horizon_elev(cam_ob.location, k)
        if e > e_target:
            lo = k
        else:
            hi = k
    SEA_K = math.sqrt(lo * hi)
    HORIZON['e'] = horizon_elev(cam_ob.location, SEA_K)
    print('HORIZON K', SEA_K, 'elev', math.degrees(HORIZON['e']), 'target', math.degrees(e_target))
    return HORIZON['e']


def build_sea(sdf):
    bm = bmesh.new()
    ds = list(np.arange(-160, SEA_D0 - 20, 6.0)) + list(np.arange(SEA_D0 - 20, SEA_D0 + 60, 1.5)) + \
        list(SEA_D0 + 60 + np.array([5, 12, 22, 36, 55, 80, 120, 180, 260, 360, 500]))
    ls = list(np.arange(-320, 321, 5.0))
    grid = []
    for d in ds:
        row = []
        for l in ls:
            q = SEA_T + stage.FWD * d + SIDE * l
            row.append(bm.verts.new((q.x, q.y, sea_z(q.x, q.y))))
        grid.append(row)
    for i in range(len(ds) - 1):
        for j in range(len(ls) - 1):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    me = bpy.data.meshes.new('sea'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('sea', me); C_SEA.objects.link(ob)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    ob.visible_shadow = False
    me.materials.append(build_water_mat(sdf))
    return ob


def build_water_mat(sdf):
    """Calm stylised sea. WebGL2: SDF texture lookup + 3 value-noise octaves + analytic glint; no SSR needed."""
    m, nt, o = new_mat('M_water')
    geo = N(nt, 'ShaderNodeNewGeometry')
    pos = geo.outputs['Position']
    x, y, z = sep(nt, pos)
    u = fm(nt, 'ADD', fm(nt, 'DIVIDE', fm(nt, 'SUBTRACT', x, SDF_C[0]), SDF_SPAN), 0.5)
    v = fm(nt, 'ADD', fm(nt, 'DIVIDE', fm(nt, 'SUBTRACT', y, SDF_C[1]), SDF_SPAN), 0.5)
    im = N(nt, 'ShaderNodeTexImage', interpolation='Cubic', extension='EXTEND'); im.image = sdf
    Lk(nt, comb(nt, u, v, 0), im.inputs['Vector'])
    R, G, Bs = sepc(nt, im.outputs['Color'])
    d = fm(nt, 'MULTIPLY', fm(nt, 'MINIMUM', R, Bs), SDF_DMAX)
    wake = G
    n1 = noise_t(nt, pos, 0.28, 2.0)
    n2 = noise_t(nt, pos, 0.9, 2.0)
    n3 = noise_t(nt, pos, 2.2, 1.0)
    dn = fm(nt, 'ADD', d, fm(nt, 'MULTIPLY', fm(nt, 'SUBTRACT', n1.outputs['Fac'], 0.5), 0.8))
    foam_a = mr(nt, dn, 0.36, 0.08)
    band = mr(nt, fm(nt, 'ABSOLUTE', fm(nt, 'SUBTRACT', dn, 1.25)), 0.16, 0.04)
    foam_b = fm(nt, 'MULTIPLY', fm(nt, 'MULTIPLY', band, mr(nt, n2.outputs['Fac'], 0.54, 0.62)), 0.35)
    foam_w = fm(nt, 'MULTIPLY', wake, mr(nt, n3.outputs['Fac'], 0.32, 0.6))
    foam = fm(nt, 'MAXIMUM', fm(nt, 'MAXIMUM', foam_a, foam_b), foam_w)
    foam = fm(nt, 'MULTIPLY', foam, valn(nt, 1.0, 'FOAM_K'))
    # depth tint by coast distance (stylised bathymetry) + soft painterly patches
    ramp = N(nt, 'ShaderNodeValToRGB', name='DEPTH_RAMP'); Lk(nt, R, ramp.inputs['Fac'])
    body = ramp.outputs['Color']
    patch = noise_t(nt, pos, 0.035, 2.0)
    body = vm(nt, 'SCALE', body, scale=mr(nt, patch.outputs['Fac'], 0.3, 0.7, 0.93, 1.07))
    # wind streaks: long thin light bands (anisotropic noise), very subtle
    ws = N(nt, 'ShaderNodeMapping', vector_type='POINT')
    ws.inputs['Scale'].default_value = (0.02, 0.35, 1.0); ws.inputs['Rotation'].default_value = (0, 0, math.radians(20))
    Lk(nt, pos, ws.inputs['Vector'])
    streak = mr(nt, noise_t(nt, ws.outputs['Vector'], 1.0, 3.0, 0.5).outputs['Fac'], 0.56, 0.66)
    rr = vm(nt, 'DOT_PRODUCT', vm(nt, 'SUBTRACT', comb(nt, x, y, 0), (SEA_T.x, SEA_T.y, 0)), tuple(stage.FWD))
    far = mr(nt, rr, SEA_D0 - 45.0, SEA_D0 + 4.0, 0.0, 1.0)
    body = mixc_n(nt, far, body, rgbn(nt, P('sea_far'), 'FAR_COL'))
    hz = mr(nt, rr, SEA_D0 + 2.0, SEA_D0 + 34.0, 0.0, 1.0)
    hz = fm(nt, 'POWER', hz, 1.2)
    # gentle swell normal (glints only)
    rip = noise_t(nt, vm(nt, 'MULTIPLY', pos, (1.0, 2.2, 1.0)), 0.45, 2.0, 0.5)
    bump = N(nt, 'ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.3
    Lk(nt, rip.outputs['Fac'], bump.inputs['Height'])
    Nn = bump.outputs['Normal']
    I = geo.outputs['Incoming']
    Rv = vm(nt, 'REFLECT', vm(nt, 'SCALE', I, scale=-1.0), Nn)
    gd = N(nt, 'ShaderNodeCombineXYZ', name='GLINT_DIR'); gd.inputs[0].default_value = 1.0
    cosg = vm(nt, 'DOT_PRODUCT', vm(nt, 'NORMALIZE', Rv), vm(nt, 'NORMALIZE', gd.outputs[0]))
    glint = fm(nt, 'POWER', fm(nt, 'MAXIMUM', cosg, 0.0), valn(nt, 60.0, 'GLINT_POW'))
    spark = mr(nt, noise_t(nt, vm(nt, 'MULTIPLY', pos, (1.0, 3.0, 1.0)), 1.6, 1.0).outputs['Fac'], 0.55, 0.68)
    glint = fm(nt, 'MULTIPLY', glint, fm(nt, 'ADD', 0.35, spark))
    glint = fm(nt, 'MULTIPLY', glint, valn(nt, 1.0, 'GLINT_K'))
    glint = fm(nt, 'MULTIPLY', glint, mr(nt, rr, 0.0, SEA_D0 - 10.0, 0.15, 1.0))
    lw = N(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    fres = fm(nt, 'MULTIPLY', lw.outputs['Fresnel'], valn(nt, 0.35, 'FRES_K'))
    col = mixc_n(nt, fres, body, rgbn(nt, (0.6, 0.6, 0.7), 'SKYREF'))
    # lighting from the flat geometric normal: keeps calm water free of shading noise, but receives shadows
    light, rim = shading.toon_light(nt, geo.outputs['Normal'])
    lk = valn(nt, 0.45, 'SEA_LIGHT_K')
    lit = mixc_n(nt, lk, vm(nt, 'SCALE', col, scale=valn(nt, 1.0, 'SEA_SELF')), mixc_n(nt, 1.0, col, light, 'MULTIPLY'))
    fcol = mixc_n(nt, 1.0, rgbn(nt, P('foam'), 'FOAM_COL'), vm(nt, 'ADD', vm(nt, 'SCALE', light, scale=0.5), (0.45, 0.45, 0.45)), 'MULTIPLY')
    lit = mixc_n(nt, foam, lit, fcol)
    lit = vm(nt, 'ADD', lit, vm(nt, 'SCALE', rgbn(nt, (1, 0.85, 0.6), 'GLINT_COL'), scale=glint))
    lit = mixc_n(nt, hz, lit, rgbn(nt, (0.8, 0.7, 0.7), 'HORIZON_COL'))
    em = N(nt, 'ShaderNodeEmission'); Lk(nt, lit, em.inputs['Color'])
    gl = N(nt, 'ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.08
    Lk(nt, Nn, gl.inputs['Normal'])
    gk = valn(nt, 0.0, 'GLOSS_K')
    add = N(nt, 'ShaderNodeAddShader')
    Lk(nt, em.outputs[0], add.inputs[0]); Lk(nt, gl.outputs[0], add.inputs[1])
    glc = N(nt, 'ShaderNodeMixShader'); Lk(nt, fm(nt, 'MULTIPLY', gk, fm(nt, 'SUBTRACT', 1.0, foam)), glc.inputs[0])
    Lk(nt, em.outputs[0], glc.inputs[1]); Lk(nt, add.outputs[0], glc.inputs[2])
    Lk(nt, glc.outputs[0], o.inputs['Surface'])
    LOOK['water'] = nt
    return m


# =============================================================== clouds, beams, pillars
def cloud_mat():
    m, nt, o = new_mat('M_cloud')
    geo = N(nt, 'ShaderNodeNewGeometry')
    light, rim = shading.toon_light(nt, geo.outputs['Normal'], 0.6)
    base = rgbn(nt, (1, 1, 1), 'CLOUD_COL')
    lit = mixc_n(nt, 1.0, base, light, 'MULTIPLY')
    lit = vm(nt, 'ADD', lit, vm(nt, 'SCALE', rgbn(nt, (1, 0.8, 0.6), 'CLOUD_RIM'), scale=fm(nt, 'MULTIPLY', rim, 4.0)))
    sh = rgbn(nt, (0.6, 0.6, 0.8), 'CLOUD_SHADE')
    lit = vm(nt, 'ADD', lit, vm(nt, 'SCALE', sh, scale=0.35))
    # fade into the horizon haze toward the bottom of each cloud bank
    tc = N(nt, 'ShaderNodeTexCoord')
    _, _, oz = sep(nt, tc.outputs['Object'])
    hzf = mr(nt, oz, 0.0, 22.0, 1.0, 0.0)
    lit = mixc_n(nt, fm(nt, 'MULTIPLY', hzf, 0.7), lit, rgbn(nt, (0.8, 0.7, 0.7), 'CLOUD_HAZE'))
    em = N(nt, 'ShaderNodeEmission'); Lk(nt, lit, em.inputs['Color'])
    Lk(nt, em.outputs[0], o.inputs['Surface'])
    MATS['cloud'] = m
    LOOK['cloud'] = nt
    return m


def build_clouds(cam_ob):
    """Cumulus banks rising from beyond the curved horizon (bases hidden by the sea's edge).
    Many small lobes + normals blended toward one ellipsoid -> soft massed shading, not bubbles.
    Runtime: 6-8 billboard impostors baked from these meshes (or the same meshes, 1 draw)."""
    cloud_mat()
    fwd = Vector((math.cos(stage.YAW), math.sin(stage.YAW), 0))
    side = Vector((math.sin(stage.YAW), -math.cos(stage.YAW), 0))
    camp = cam_ob.location
    rng = random.Random(42)
    obs = []
    specs = [(-0.37, 1150, 150, 34, 3), (-0.16, 1400, 230, 56, 4), (0.05, 1250, 120, 26, 5), (0.22, 1200, 200, 48, 6),
             (0.39, 1350, 150, 38, 7), (-0.05, 1900, 300, 85, 9), (0.32, 2000, 260, 70, 10), (-0.28, 1950, 240, 62, 11)]
    for k, (lat, dist, width, hgt, seed) in enumerate(specs):
        hd = fwd * dist + side * (lat * dist)
        el = HORIZON['e'] - math.radians(0.35)
        base = camp + hd + Vector((0, 0, math.tan(el) * hd.length))
        p = Part(f'cloud_{k}', seed)
        spheres = []
        crown_x = rng.uniform(-0.25, 0.25) * width
        for i in range(14):
            t = rng.uniform(-0.5, 0.5)
            # envelope: tall near the crown, low at the ends (cumulus profile)
            env = math.exp(-((t * width - crown_x) / (width * 0.28)) ** 2)
            zc = rng.uniform(0.0, 1.0) * hgt * (0.25 + 0.75 * env)
            r = hgt * rng.uniform(0.20, 0.34) * (0.6 + 0.6 * env)
            c = Vector((t * width * 0.9, rng.uniform(-width * 0.06, width * 0.06), zc))
            p.add(bm_sphere(r, 2, at=tuple(c), scale=(1.25, 1.0, 0.85)), (1, 1, 1), smooth=True, mat='cloud')
            spheres.append((tuple(c), r))
        ob = p.finish(C_SEA, sphere_normals=spheres, sphere_glob=((crown_x, 0, hgt * 0.15), (width * 0.5, width * 0.1, hgt * 0.7), 0.62),
                      loc=tuple(base), rz=stage.YAW + math.pi / 2, shadow=False)
        obs.append(ob)
    return obs


def beam_mat():
    m, nt, o = new_mat('M_beam')
    tc = N(nt, 'ShaderNodeTexCoord')
    x, y, z = sep(nt, tc.outputs['Object'])
    along = fm(nt, 'MULTIPLY', fm(nt, 'POWER', mr(nt, x, 1.0, 80.0, 1.0, 0.0, smooth=False), 1.6), mr(nt, x, 1.0, 5.0, 0.0, 1.0))
    lw = N(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    core = fm(nt, 'POWER', fm(nt, 'SUBTRACT', 1.0, lw.outputs['Facing']), 3.0)
    dust = mr(nt, noise_t(nt, tc.outputs['Object'], 0.08, 3.0).outputs['Fac'], 0.3, 0.75, 0.55, 1.0)
    k = valn(nt, 0.0, 'BEAM_K')
    s = fm(nt, 'MULTIPLY', fm(nt, 'MULTIPLY', fm(nt, 'MULTIPLY', along, core), dust), k)
    em = N(nt, 'ShaderNodeEmission'); em.inputs['Color'].default_value = (*lin('#FFD69A'), 1)
    Lk(nt, s, em.inputs['Strength'])
    add = N(nt, 'ShaderNodeAddShader')
    Lk(nt, N(nt, 'ShaderNodeBsdfTransparent').outputs[0], add.inputs[0]); Lk(nt, em.outputs[0], add.inputs[1])
    Lk(nt, add.outputs[0], o.inputs['Surface'])
    m.surface_render_method = 'BLENDED'; m.use_backface_culling = False
    MATS['beam'] = m
    LOOK['beam'] = nt
    return m


def build_beams():
    beam_mat()
    lp = KH.LIGHT_POS['lantern_world']
    obs = []
    for k, a in enumerate((math.radians(163), math.radians(343))):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=24, radius1=0.5, radius2=6.5, depth=78.0,
                              matrix=Matrix.Translation((40.0, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
        me = bpy.data.meshes.new(f'beam_{k}'); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(f'beam_{k}', me); C_FX.objects.link(ob)
        me.materials.append(MATS['beam'])
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        ob.location = lp; ob.rotation_euler = (0, math.radians(4.5), a)
        ob.visible_shadow = False
        obs.append(ob)
    return obs


def pillar_mat():
    m, nt, o = new_mat('M_pillar')
    tc = N(nt, 'ShaderNodeTexCoord')
    x, y, z = sep(nt, tc.outputs['Object'])
    # object space: x across (-0.5..0.5), y along the streak (0..1)
    across = fm(nt, 'POWER', mr(nt, fm(nt, 'ABSOLUTE', x), 0.5, 0.0, 0.0, 1.0), 1.5)
    along = fm(nt, 'POWER', mr(nt, y, 1.0, 0.0, 0.0, 1.0, smooth=False), 1.5)
    mp = N(nt, 'ShaderNodeMapping', vector_type='POINT'); mp.inputs['Scale'].default_value = (3.0, 14.0, 1.0)
    Lk(nt, tc.outputs['Object'], mp.inputs['Vector'])
    brk = mr(nt, noise_t(nt, mp.outputs['Vector'], 1.0, 2.0, 0.5).outputs['Fac'], 0.35, 0.7, 0.15, 1.0)
    s = fm(nt, 'MULTIPLY', fm(nt, 'MULTIPLY', fm(nt, 'MULTIPLY', across, along), brk), valn(nt, 0.0, 'PILLAR_K'))
    oi = N(nt, 'ShaderNodeObjectInfo')
    em = N(nt, 'ShaderNodeEmission'); Lk(nt, oi.outputs['Color'], em.inputs['Color'])
    Lk(nt, s, em.inputs['Strength'])
    add = N(nt, 'ShaderNodeAddShader')
    Lk(nt, N(nt, 'ShaderNodeBsdfTransparent').outputs[0], add.inputs[0]); Lk(nt, em.outputs[0], add.inputs[1])
    Lk(nt, add.outputs[0], o.inputs['Surface'])
    m.surface_render_method = 'BLENDED'
    MATS['pillar'] = m
    LOOK['pillar'] = nt
    return m


def build_pillars(lamps):
    """Light pillars: camera-aligned emissive streaks on the water under each waterside lamp (WebGL2 path)."""
    pillar_mat()
    obs = []
    toward_cam = -Vector((math.cos(stage.YAW), math.sin(stage.YAW), 0))
    ang = math.atan2(toward_cam.y, toward_cam.x) - math.pi / 2
    for k, (p, col, w, L) in enumerate(lamps):
        bm = bmesh.new()
        vs = [bm.verts.new(q) for q in ((-0.5, 0, 0), (0.5, 0, 0), (0.5, 1, 0), (-0.5, 1, 0))]
        bm.faces.new(vs)
        me = bpy.data.meshes.new(f'pillar_{k}'); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(f'pillar_{k}', me); C_FX.objects.link(ob)
        me.materials.append(MATS['pillar'])
        ob.location = (p.x, p.y, 0.03)
        ob.rotation_euler = (0, 0, ang)
        ob.scale = (w, L, 1)
        ob.color = (*col, 1)
        ob.visible_shadow = False
        obs.append(ob)
    return obs


def smoke(chimney_pts):
    """Soft chimney smoke puffs (billboard sprites at runtime)."""
    p = Part('smoke')
    rng = random.Random(3)
    for (x, y, z) in chimney_pts:
        for i in range(4):
            r = 0.35 + i * 0.22
            c = (x + i * 0.55 + rng.uniform(-0.1, 0.1), y - i * 0.35, z + 0.4 + i * 0.75)
            p.add(bm_sphere(r, 2, at=c), (1, 1, 1), mat='cloud', smooth=True)
    return p.finish(C_FX, shadow=False)



# =============================================================== charm layer: bunting, awnings, moored dinghies, buoys, gulls
def bunting(p, a, b, n=14, sag=0.6, seed=0):
    rng = random.Random(seed)
    pts = catenary(a, b, sag, n)
    p.add(bm_tube(pts, 0.018, 3), lin('#E9E1CF'))
    cols = ('shutter_red', 'flower_yellow', 'shutter_blue', 'frame_white', 'brand_usdt', 'flower_pink')
    for i in range(n):
        q0, q1 = Vector(pts[i]), Vector(pts[i + 1])
        m = (q0 + q1) / 2
        bm = bmesh.new()
        d = (q1 - q0) * 0.42
        vs = [bm.verts.new(q) for q in (m - d, m + d, m - Vector((0, 0, 0.55)))]
        bm.faces.new(vs)
        p.add(bm, P(cols[(i + seed) % len(cols)]), drift=0.04)


def awning(p, x, y, z, w=3.2, d=2.2, rz=0.0, c1='shutter_red', c2='frame_white', seed=0):
    rng = random.Random(seed)
    for sx in (-1, 1):
        for sy in (-1, 1):
            bm = bm_box(0.09, 0.09, 2.3 if sy < 0 else 2.6, (sx * w / 2, sy * d / 2, (2.3 if sy < 0 else 2.6) / 2))
            xform(bm, rz=rz); xform(bm, loc=(x, y, z)); p.add(bm, P('timber_dk'))
    n = 8
    for i in range(n):
        bm = bm_box(w / n + 0.01, d + 0.5, 0.06, (-w / 2 + (i + 0.5) * w / n, 0, 0))
        for v in bm.verts:
            v.co.z += (v.co.y + (d + 0.5) / 2) / (d + 0.5) * 0.45
        # scalloped valance
        xform(bm, loc=(0, 0, 2.35)); xform(bm, rz=rz); xform(bm, loc=(x, y, z))
        p.add(bm, P(c1 if i % 2 == 0 else c2), drift=0.02)
    # trestle table with goods (crates of fish, fruit)
    bm = bm_box(w * 0.8, 0.8, 0.08, (0, -d * 0.2, 0.85)); xform(bm, rz=rz); xform(bm, loc=(x, y, z)); p.add(bm, P('plank'), (0, 0, 0, 1))
    for k in range(3):
        bm = bm_box(0.6, 0.45, 0.22, (-w * 0.28 + k * w * 0.28, -d * 0.2, 1.0)); xform(bm, rz=rz); xform(bm, loc=(x, y, z))
        p.add(bm, P('timber'))
        for j in range(3):
            fc = rng.choice(('flower_red', 'flower_yellow', 'leaf_lt', 'canvas_ochre', 'hull_white'))
            bm = bm_sphere(0.12, 1, at=(-w * 0.28 + k * w * 0.28 + (j - 1) * 0.16, -d * 0.2, 1.16))
            xform(bm, rz=rz); xform(bm, loc=(x, y, z)); p.add(bm, P(fc), smooth=True)


def gull(p, at, s=1.0, rz=0.0, flap=0.35):
    bm = bmesh.new()
    pts = [(-1.0, 0.25, 0.25 + flap), (-0.45, 0.0, 0.08), (0.0, 0.1, 0.0), (0.45, 0.0, 0.08), (1.0, 0.25, 0.25 + flap)]
    vs = [bm.verts.new((x * s, y * s, z * s)) for x, y, z in pts]
    vb = [bm.verts.new((x * s, (y + 0.22) * s, z * s)) for x, y, z in pts]
    for i in range(4):
        bm.faces.new((vs[i], vs[i + 1], vb[i + 1], vb[i]))
    xform(bm, rz=rz); xform(bm, loc=at)
    p.add(bm, P('frame_white'))


def build_charm():
    objs = []
    p = Part('charm')
    # bunting across the quay street (house fronts to lamp posts) and along the mid lane
    for (x0, x1, y0, y1) in ((-27.0, -20.0, F0 - 0.1, 2.0), (-10.0, -2.0, F0 - 0.1, 2.0), (1.5, 8.0, F0 - 0.1, 2.0), (12.0, 19.0, F0 - 0.1, 2.0)):
        bunting(p, (x0, y0, T0Z + 5.2), (x1, y1, T0Z + 3.9), n=12, sag=0.7, seed=int(x0))
    bunting(p, (-25.0, F1 - 0.1, T1Z + 4.8), (14.0, F1 - 0.1, T1Z + 4.8), n=24, sag=1.4, seed=3)
    # market awnings on the quay street
    awning(p, -21.0, 4.2, QUAY_TOP + 0.1, rz=0.0, c1='shutter_red', c2='frame_white', seed=1)
    awning(p, -17.2, 4.2, QUAY_TOP + 0.1, rz=0.0, c1='shutter_blue', c2='frame_white', seed=2)
    awning(p, 13.0, 4.0, QUAY_TOP + 0.1, rz=0.0, c1='canvas_ochre', c2='frame_white', seed=3)
    # dinghies moored by the quay stairs + red/green channel buoys at the mouth
    KT.rowboat(p, (-26.5, -2.2, 0.05), rz=math.radians(4), color='shutter_teal', seed=4)
    KT.rowboat(p, (-21.0, -2.0, 0.05), rz=math.radians(-6), color='flower_yellow', seed=5)
    KT.rowboat(p, (20.0, -2.3, 0.05), rz=math.radians(3), color='shutter_red', seed=6)
    for (x, y, c) in ((27.0, -39.0, 'shutter_red'), (38.0, -33.0, 'brand_usdt'), (-38.5, -40.0, 'shutter_red')):
        p.add(bm_cyl(0.55, 0.45, 1.2, 10, (x, y, -0.3)), P(c), smooth=True)
        p.add(bm_cyl(0.08, 0.08, 1.2, 5, (x, y, 0.9)), P('iron'))
        p.add(bm_sphere(0.16, 1, at=(x, y, 2.15)), P('lamp_gold'), KT.NONE, (0, 0, 0, 2.5), smooth=True)
        KH.LIGHT_POS.setdefault('buoy', []).append(Vector((x, y, 2.15)))
    KT.rowboat(p, (8.0, -34.0, 0.05), rz=math.radians(32), color='frame_white', seed=7)
    KT.rowboat(p, (-24.0, -30.0, 0.05), rz=math.radians(-58), color='shutter_blue', seed=8)
    KT.rowboat(p, (-48.0, -32.0, 0.05), rz=math.radians(10), color='shutter_red', seed=9)
    for (x, y) in ((-24.0, 18.5), (5.0, 18.2), (16.0, 32.8)):
        z = height(x, y)
        p.add(bm_box(2.2, 1.8, 2.0, (x, y, z + 1.0), bevel=0.05, seg=1), P('timber'), KT.PLANK)
        bm = bm_box(2.6, 2.3, 0.12, (0, 0, 0)); xform(bm, loc=(x, y, z + 2.15), rx=math.radians(12))
        p.add(bm, P('roof_terracotta'), KT.TILE, uv=lambda co, f: (co.x, co.y))
    for (x0, x1, y) in ((-30.0, -24.0, 17.0), (0.0, 6.0, 16.8)):
        z = height(x0, y)
        for x in (x0, x1):
            p.add(bm_box(0.09, 0.09, 2.0, (x, y, z + 1.0)), P('timber_dk'))
        pts = catenary((x0, y, z + 1.95), (x1, y, z + 1.95), 0.2, 6)
        p.add(bm_tube(pts, 0.012, 3), P('frame_white'))
        for k in range(4):
            t = (k + 1) / 5
            q = Vector(pts[0]).lerp(Vector(pts[-1]), t) - Vector((0, 0, 0.2 * 4 * t * (1 - t) + 0.35))
            p.add(bm_box(0.6, 0.03, 0.7, tuple(q)), P(('flower_white', 'shutter_blue', 'flower_pink', 'flower_yellow')[k]))
    objs.append(p.finish(C_TOWN, ao=0.3, ao_dist=0.8))
    isl = Part('islet')
    for k, (dx, dy, r) in enumerate(((0, 0, 3.2), (2.6, 1.2, 2.2), (-2.4, 1.6, 1.9), (1.0, -2.3, 1.7), (4.4, -0.6, 1.2))):
        bm = bm_rock(r, 5000 + k, sub=2, squash=0.42, amp=0.18, at=(0, 0, 0), stretch=(1.3, 1.0, 1.0))
        xform(bm, loc=(-70.0 + dx, 16.0 + dy, r * 0.12 - 0.2), rz=k * 1.3, rx=(k % 3 - 1) * 0.12)
        isl.add(bm, P(('rock_lt', 'rock', 'stone_grey', 'rock_lt', 'rock', 'rock_dk')[k]), pat1=KT.ROCK, smooth=True, drift=0.08)
    isl.add(bm_rock(1.6, 5100, sub=2, squash=0.35, amp=0.2, at=(-70.0, 16.0, 1.2)), P('grass'), pat1=KT.GRASS, smooth=True)
    isl.add(bm_cyl(0.12, 0.1, 4.2, 6, (-70.6, 15.4, 1.0)), P('iron'), smooth=True)
    isl.add(bm_cyl(0.32, 0.32, 0.9, 8, (-70.6, 15.4, 3.4)), P('shutter_red'), smooth=True)
    isl.add(bm_cyl(0.42, 0.0, 0.6, 8, (-70.6, 15.4, 5.2)), P('hull_black'))
    isl.add(bm_sphere(0.16, 1, at=(-70.6, 15.4, 4.55)), P('lamp_gold'), KT.NONE, (0, 0, 0, 2.5), smooth=True)
    KH.LIGHT_POS.setdefault('buoy', []).append(Vector((-70.6, 15.4, 4.55)))
    objs.append(isl.finish(C_LAND, ao=0.4, ao_dist=1.5, grad=(-0.5, 2.0, 0.6, 1.05, 1.0)))
    g = Part('gulls')
    rng = random.Random(8)
    for (x, y, z) in ((-69.0, 16.6, 1.9), (-67.6, 15.4, 1.4), (-71.3, 17.4, 1.5)):
        gull(g, (x, y, z), s=0.35, rz=rng.uniform(0, 6.28), flap=0.05)
    for k in range(9):
        x, y = rng.uniform(-20, 40), rng.uniform(-35, 10)
        gull(g, (x, y, rng.uniform(14, 26)), s=rng.uniform(0.55, 0.8), rz=rng.uniform(0, 6.28), flap=rng.uniform(0.1, 0.5))
    for (x, y, z) in ((-10.9, F0 + 3.8, T0Z + 9.6), (12.6, F0 + 3.8, T0Z + 8.6), (MOLE_HEAD[0] + 0.6, MOLE_HEAD[1], 8.6)):
        gull(g, (x, y, z), s=0.35, rz=rng.uniform(0, 6.28), flap=0.05)
    objs.append(g.finish(C_FX, shadow=False))
    return objs


# =============================================================== BUILD
t1 = time.time()
terrain = build_terrain()
town_objs = build_town()
harb_objs = build_harbour()
boat_objs = build_boats()
moor = mooring_lines()
charm_objs = build_charm()
print('BUILD geometry', round(time.time() - t1, 1), 's')
t1 = time.time()
# terrain AO against everything standing on it (static world bake)
bpy.context.view_layer.update()
bvh_world = bvh_of(town_objs + harb_objs)
bake_vertex_shading(terrain, 0.85, 3.0, None, (-1.0, 14.0, 0.72, 1.04, 0.6), [bvh_world])
print('BAKE terrain AO', round(time.time() - t1, 1), 's')
CAM = {}
CAM['overview'] = stage.camera('cam_overview', (2.0, 9.0, 2.0), 218.0, C_SEA, dof=float(arg('--fstop', '0.028')))
CAM['harbour'] = stage.camera('cam_harbour', (PIER_X + 0.5, -13.0, 2.0), 112.0, C_SEA, dof=0.035)
E_H = tune_horizon(CAM['overview'], 0.14)
sdf = build_sea_sdf()
sea = build_sea(sdf)
stage.build_world()
wn_ = LOOK['world'].nodes
wn_['E_LO'].outputs[0].default_value = E_H - math.radians(0.4)
wn_['E_HI'].outputs[0].default_value = -stage.PITCH + stage.VFOV / 2 + math.radians(0.5)
sc = stage.render_setup((1600 * SCALE // 100, 1000 * SCALE // 100), SAMPLES)
clouds = build_clouds(CAM['overview'])
beams = build_beams()
# lights
sun = stage.add_light('sun', 'SUN', C_LIGHTS, energy=3.6, angle=math.radians(2.2))
lamp_lights = []


def add_point(nm, p, e, r, col, shadow=True):
    lo = stage.add_light(nm, 'POINT', C_LIGHTS, loc=p, energy=e, shadow_soft_size=r, color=col)
    lo.data.use_shadow = shadow
    lo['base_e'] = e
    lamp_lights.append(lo)
    return lo


for k, pp in enumerate(KH.LIGHT_POS.get('pier', [])):
    add_point(f'pierlamp_{k}', pp, 260.0, 0.15, lin('#FFB35A'))
for k, pp in enumerate(KH.LIGHT_POS.get('street', [])):
    add_point(f'street_{k}', pp, 320.0, 0.15, lin('#FFB35A'))
add_point('lantern', KH.LIGHT_POS['lantern_world'], 9000.0, 0.6, lin('#FFD08A'))
add_point('mole_light', KH.LIGHT_POS['mole_light'], 600.0, 0.3, lin('#FFC070'))
for k, pp in enumerate(KH.LIGHT_POS.get('buoy', [])):
    add_point(f'buoy_{k}', pp, 30.0, 0.1, lin('#FFC070'), shadow=False)
for k, pp in enumerate(KH.LIGHT_POS.get('lh_door_world', [])):
    add_point(f'lhdoor_{k}', pp, 120.0, 0.1, lin('#FFB35A'))
# window spill: one warm low light in front of each house
for i, (x, y, z, kw) in enumerate(HOUSES):
    add_point(f'spill_{i}', Vector((x + 0.5, y - kw.get('d', 6) / 2 - 2.2, z + 2.2)), 180.0, 1.2, lin('#FF9E4A'), shadow=False)
add_point('spill_keeper', Vector((50, -9 - 4.8, height(50, -9) + 2.0)), 160.0, 1.0, lin('#FF9E4A'))
# riding lights on masts
bpy.context.view_layer.update()
for nm, (root, info, st, xy, hd, cls) in BOAT_INFO.items():
    for (kind, lp_) in info['lights']:
        wp = root.matrix_world @ lp_
        add_point(f'riding_{nm}_{kind}', wp, 25.0 if kind == 'mast' else 18.0, 0.05, lin('#FFD9A0'), shadow=False)
for nm, (root, info, st, xy, hd, cls) in BOAT_INFO.items():
    if st == 'docked':
        wp = root.matrix_world @ Vector((-info['Lh'] * 0.3, 0, info['fb'] + 1.2))
        add_point(f'deck_{nm}', wp, 60.0 + info['Lh'] * 3, 0.3, lin('#FFB45E'), shadow=False)
        wp2 = root.matrix_world @ Vector((info['Lh'] * 0.2, info['B'] * 0.8, info['fb'] + 2.0))
        add_point(f'deckb_{nm}', wp2, 40.0 + info['Lh'] * 2, 0.3, lin('#FFB45E'), shadow=False)
# light pillars on the water: waterside lamps + boats' stern lights + mole light + lantern
pil = []
for pp in KH.LIGHT_POS.get('pier', []):
    pil.append((pp, lin('#FFB35A'), 1.4, 11.0))
for pp in KH.LIGHT_POS.get('street', [])[:4]:
    pil.append((Vector((pp.x, -0.4, 0)), lin('#FFB35A'), 1.6, 9.0))
pil.append((Vector((MOLE_HEAD[0], MOLE_HEAD[1] - 4.6, 0)), lin('#FFC070'), 2.0, 16.0))
for nm, (root, info, st, xy, hd, cls) in BOAT_INFO.items():
    for (kind, lp_) in info['lights']:
        if kind == 'stern':
            wp = root.matrix_world @ lp_
            pil.append((Vector((wp.x, wp.y, 0)), lin('#FFD9A0'), 0.8, 6.0))
pillars = build_pillars(pil)

# chimney smoke (for the overview charm)
smk = None and smoke([(x + 0.3 * kw.get('w', 6) / 2, y + 0.25 * kw.get('d', 6) / 2, z + kw.get('h', 6) + 4.0) for (x, y, z, kw) in HOUSES[::3]])

# =============================================================== stats
dg = bpy.context.evaluated_depsgraph_get()
tris, groups = 0, {}
for ob in bpy.data.objects:
    if ob.type != 'MESH' or ob.name.startswith(('sea', 'beam', 'pillar', 'cloud', 'smoke')):
        continue
    me = ob.data
    me.calc_loop_triangles()
    nt_ = len(me.loop_triangles); tris += nt_
    g = ob.name.rstrip('0123456789_').split('_')[0]
    if ob.parent and ob.parent.name in BOAT_INFO:
        g = 'boat:' + ob.parent.name
    groups[g] = groups.get(g, 0) + nt_
cloud_tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.name.startswith('cloud') and o.type == 'MESH')
stats = dict(triangles_block=tris, sky_cloud_tris=cloud_tris, by_group=dict(sorted(groups.items(), key=lambda kv: -kv[1])),
             build_s=round(time.time() - T0, 1))
print('STATS', json.dumps(stats))
json.dump(stats, open(os.path.join(HERE, 'stats.json'), 'w'), indent=1)


# =============================================================== states
def set_state(st):
    w = LOOK['world'].nodes
    wt = LOOK['water'].nodes
    tg = bpy.data.node_groups['ToonLight'].nodes
    cn = LOOK['cloud'].nodes
    bl = LOOK['bloom']
    vt = bpy.context.scene.view_settings
    night = st == 'night'
    for lo in lamp_lights:
        lo.data.energy = lo['base_e'] if night else 0.0
        lo.hide_render = not night
    for b in beams:
        b.hide_render = not night
    for pp in pillars:
        pp.hide_render = not night
    LOOK['beam'].nodes['BEAM_K'].outputs[0].default_value = 0.42 if night else 0.0
    LOOK['pillar'].nodes['PILLAR_K'].outputs[0].default_value = 3.0 if night else 0.0
    cmp = LOOK['comp'].nodes
    fogs = {'golden': (0.45, '#F3CDB0'), 'noon': (0.3, '#D6E8F0'), 'night': (0.25, '#2A4572')}
    cmp['FOG_K'].inputs[1].default_value = fogs[st][0]
    cmp['FOG_COL'].outputs[0].default_value = (*lin(fogs[st][1]), 1)
    gr = cmp['GRADE']
    grades = {'golden': ((0.96, 0.95, 1.06), (1.06, 1.0, 0.92)), 'noon': ((0.98, 0.99, 1.03), (1.02, 1.01, 0.98)),
              'night': ((0.95, 0.97, 1.08), (1.04, 1.0, 0.96))}
    gr.inputs['Fac'].default_value = 0.0
    if st == 'golden':
        stage.aim(sun, 138, 13); sun.data.energy = 6.2; sun.data.color = lin('#FFB46A')
        w['AMB_SKY'].outputs[0].default_value = (*lin('#8F8AD8'), 1); w['AMB_GROUND'].outputs[0].default_value = (*lin('#D2A486'), 1)
        w['AMB_K'].outputs[0].default_value = 0.62
        shading.set_global('WIN_K', 0.7); shading.set_global('RIM_COL', lin('#FFD7A0'))
        tg['REF'].outputs[0].default_value = 2.6
        tg['RIM_K'].outputs[0].default_value = 0.35
        tg['FILL'].outputs[0].default_value = (*lin('#3A2F6A'), 1)
        set_ramp(w['SKY_RAMP'], [(0.0, lin('#FFD7A4')), (0.18, lin('#F5BE98')), (0.5, lin('#D6A9B4')), (1.0, lin('#8E9FD2'))])
        sun_dir = (math.cos(math.radians(62)), math.sin(math.radians(62)), math.tan(HORIZON['e'] + math.radians(1.1)))
        w['GLOW_DIR'].inputs[0].default_value, w['GLOW_DIR'].inputs[1].default_value, w['GLOW_DIR'].inputs[2].default_value = sun_dir
        w['GLOW_COL'].outputs[0].default_value = (*lin('#FFC27A'), 1)
        w['GLOW_K'].outputs[0].default_value = 1.4; w['HALO_R'].outputs[0].default_value = 0.45
        w['DISC_R'].outputs[0].default_value = 0.0085; w['DISC_R2'].outputs[0].default_value = 0.0085; w['DISC_K'].outputs[0].default_value = 4.0
        w['STAR_K'].outputs[0].default_value = 0.0; w['WISP_K'].outputs[0].default_value = 0.5
        w['WISP_COL'].outputs[0].default_value = (*lin('#FFE6CF'), 1)
        set_ramp(wt['DEPTH_RAMP'], [(0.0, lin('#9ED9C2')), (0.05, lin('#6DC1B2')), (0.18, lin('#3A98A2')), (0.45, lin('#2A7896')), (1.0, lin('#215E84'))])
        wt['FAR_COL'].outputs[0].default_value = (*lin('#3F7AA3'), 1)
        wt['HORIZON_COL'].outputs[0].default_value = (*lin('#F2C9A6'), 1)
        wt['SKYREF'].outputs[0].default_value = (*lin('#E9BFA8'), 1)
        wt['FOAM_COL'].outputs[0].default_value = (*lin('#FFF6E8'), 1)
        wt['GLINT_COL'].outputs[0].default_value = (*lin('#FFD9A0'), 1)
        gdir = (sun_dir[0], sun_dir[1], -sun_dir[2])
        for i, v in enumerate(gdir):
            wt['GLINT_DIR'].inputs[i].default_value = v
        wt['GLINT_K'].outputs[0].default_value = 1.8; wt['GLINT_POW'].outputs[0].default_value = 140.0
        wt['SEA_LIGHT_K'].outputs[0].default_value = 0.4; wt['SEA_SELF'].outputs[0].default_value = 1.0
        wt['GLOSS_K'].outputs[0].default_value = 0.0; wt['FRES_K'].outputs[0].default_value = 0.4
        cn['CLOUD_COL'].outputs[0].default_value = (*lin('#FFF1E4'), 1); cn['CLOUD_RIM'].outputs[0].default_value = (*lin('#FFC890'), 1)
        cn['CLOUD_SHADE'].outputs[0].default_value = (*lin('#B6A3C8'), 1); cn['CLOUD_HAZE'].outputs[0].default_value = (*lin('#F2C9A6'), 1)
        bl.inputs['Strength'].default_value = 0.45; bl.inputs['Threshold'].default_value = 0.9
        vt.exposure = 0.05
    elif st == 'noon':
        stage.aim(sun, 160, 58); sun.data.energy = 4.6; sun.data.color = lin('#FFF4E2')
        w['AMB_SKY'].outputs[0].default_value = (*lin('#9DB8EC'), 1); w['AMB_GROUND'].outputs[0].default_value = (*lin('#C2B494'), 1)
        w['AMB_K'].outputs[0].default_value = 0.7
        shading.set_global('WIN_K', 0.0); shading.set_global('RIM_COL', lin('#FFF4DC'))
        tg['REF'].outputs[0].default_value = 3.6
        tg['RIM_K'].outputs[0].default_value = 0.22
        tg['FILL'].outputs[0].default_value = (*lin('#2A3550'), 1)
        set_ramp(w['SKY_RAMP'], [(0.0, lin('#E6F0EE')), (0.2, lin('#BFDDEE')), (0.6, lin('#86BCE6')), (1.0, lin('#5592D8'))])
        sun_dir = (math.cos(math.radians(30)), math.sin(math.radians(30)), math.tan(HORIZON['e'] + math.radians(3.0)))
        for i, v in enumerate(sun_dir):
            w['GLOW_DIR'].inputs[i].default_value = v
        w['GLOW_COL'].outputs[0].default_value = (*lin('#FFFFFF'), 1)
        w['GLOW_K'].outputs[0].default_value = 0.25; w['HALO_R'].outputs[0].default_value = 0.25
        w['DISC_K'].outputs[0].default_value = 0.0
        w['STAR_K'].outputs[0].default_value = 0.0; w['WISP_K'].outputs[0].default_value = 0.35
        w['WISP_COL'].outputs[0].default_value = (*lin('#FFFFFF'), 1)
        set_ramp(wt['DEPTH_RAMP'], [(0.0, lin('#A6EBD6')), (0.06, lin('#68D3C6')), (0.2, lin('#2EADBE')), (0.5, lin('#1E8BB4')), (1.0, lin('#1A6C9C'))])
        wt['FAR_COL'].outputs[0].default_value = (*lin('#2F7EB4'), 1)
        wt['HORIZON_COL'].outputs[0].default_value = (*lin('#D9EAF0'), 1)
        wt['SKYREF'].outputs[0].default_value = (*lin('#BFDDEE'), 1)
        wt['FOAM_COL'].outputs[0].default_value = (*lin('#FFFFFF'), 1)
        wt['GLINT_COL'].outputs[0].default_value = (*lin('#FFFFFF'), 1)
        gdir = (sun_dir[0], sun_dir[1], -sun_dir[2])
        for i, v in enumerate(gdir):
            wt['GLINT_DIR'].inputs[i].default_value = v
        wt['GLINT_K'].outputs[0].default_value = 1.2; wt['GLINT_POW'].outputs[0].default_value = 140.0
        wt['SEA_LIGHT_K'].outputs[0].default_value = 0.3; wt['SEA_SELF'].outputs[0].default_value = 1.2
        wt['GLOSS_K'].outputs[0].default_value = 0.0; wt['FRES_K'].outputs[0].default_value = 0.3
        cn['CLOUD_COL'].outputs[0].default_value = (*lin('#FFFFFF'), 1); cn['CLOUD_RIM'].outputs[0].default_value = (*lin('#FFFFFF'), 1)
        cn['CLOUD_SHADE'].outputs[0].default_value = (*lin('#A9BEDF'), 1); cn['CLOUD_HAZE'].outputs[0].default_value = (*lin('#D9EAF0'), 1)
        bl.inputs['Strength'].default_value = 0.2; bl.inputs['Threshold'].default_value = 1.2
        vt.exposure = -0.35
    else:  # night
        stage.aim(sun, 70, 30); sun.data.energy = 0.55; sun.data.color = lin('#8FAAFF')
        w['AMB_SKY'].outputs[0].default_value = (*lin('#4A5FA8'), 1); w['AMB_GROUND'].outputs[0].default_value = (*lin('#2A2F4A'), 1)
        w['AMB_K'].outputs[0].default_value = 0.42
        shading.set_global('WIN_K', 3.2); shading.set_global('RIM_COL', lin('#9FB8FF'))
        tg['REF'].outputs[0].default_value = 0.55
        tg['RIM_K'].outputs[0].default_value = 0.45
        tg['FILL'].outputs[0].default_value = (*lin('#141C3A'), 1)
        set_ramp(w['SKY_RAMP'], [(0.0, lin('#3B5A8C')), (0.25, lin('#2A4170')), (0.6, lin('#1A2A52')), (1.0, lin('#0E1838'))])
        moon_dir = (math.cos(math.radians(66)), math.sin(math.radians(66)), math.tan(HORIZON['e'] + math.radians(2.0)))
        for i, v in enumerate(moon_dir):
            w['GLOW_DIR'].inputs[i].default_value = v
        w['GLOW_COL'].outputs[0].default_value = (*lin('#DCE6FF'), 1)
        w['GLOW_K'].outputs[0].default_value = 0.35; w['HALO_R'].outputs[0].default_value = 0.16
        w['DISC_R'].outputs[0].default_value = 0.010; w['DISC_R2'].outputs[0].default_value = 0.010; w['DISC_K'].outputs[0].default_value = 5.0
        w['STAR_K'].outputs[0].default_value = 2.5; w['WISP_K'].outputs[0].default_value = 0.25
        w['WISP_COL'].outputs[0].default_value = (*lin('#6E80B8'), 1)
        set_ramp(wt['DEPTH_RAMP'], [(0.0, lin('#3C7F86')), (0.06, lin('#2C6A78')), (0.2, lin('#1C4F68')), (0.5, lin('#163E5A')), (1.0, lin('#11304C'))])
        wt['FAR_COL'].outputs[0].default_value = (*lin('#16365A'), 1)
        wt['HORIZON_COL'].outputs[0].default_value = (*lin('#30507E'), 1)
        wt['SKYREF'].outputs[0].default_value = (*lin('#2E4778'), 1)
        wt['FOAM_COL'].outputs[0].default_value = (*lin('#9FB4D8'), 1)
        wt['GLINT_COL'].outputs[0].default_value = (*lin('#CFDCFF'), 1)
        gdir = (moon_dir[0], moon_dir[1], -moon_dir[2])
        for i, v in enumerate(gdir):
            wt['GLINT_DIR'].inputs[i].default_value = v
        wt['GLINT_K'].outputs[0].default_value = 1.6; wt['GLINT_POW'].outputs[0].default_value = 70.0
        wt['SEA_LIGHT_K'].outputs[0].default_value = 0.5; wt['SEA_SELF'].outputs[0].default_value = 1.0
        wt['GLOSS_K'].outputs[0].default_value = 0.35; wt['FRES_K'].outputs[0].default_value = 0.35
        cn['CLOUD_COL'].outputs[0].default_value = (*lin('#4E5F92'), 1); cn['CLOUD_RIM'].outputs[0].default_value = (*lin('#4F64A0'), 1)
        cn['CLOUD_SHADE'].outputs[0].default_value = (*lin('#22305A'), 1); cn['CLOUD_HAZE'].outputs[0].default_value = (*lin('#30507E'), 1)
        bl.inputs['Strength'].default_value = 0.7; bl.inputs['Threshold'].default_value = 0.8
        vt.exposure = 0.15


if '--save' in ARGV:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'style-a.blend'), compress=True)

for cam in CAMS:
    sc.camera = CAM[cam]
    for st in STATES:
        set_state(st)
        if '--look' in ARGV:
            sc.view_settings.look = arg('--look', 'AgX - Punchy')
        if '--expo' in ARGV:
            sc.view_settings.exposure = float(arg('--expo', '0'))
        out = os.path.join(HERE, f'{PREFIX}-{cam}-{st}.png') if not PREFIX.startswith('/') else f'{PREFIX}-{cam}-{st}.png'
        sc.render.filepath = out
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print('RENDERED', out, round(time.time() - t1, 1), 's')
