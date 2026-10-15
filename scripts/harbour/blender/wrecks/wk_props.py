"""Wreck Cove kit v2 - cove dressing props (each <= 600 tris). Origin = ground centre (z = 0 the sand / dune
surface the prop stands on), FRONT faces Blender -y (glTF +z, the sea / camera side).

Node contract: '<id>' root empty {family: 'cove', class}; 'body' hb_opaque (static, weathered per corner);
optional animated / lit nodes listed per prop in the manifest (hb_window panes, hb_emissive lamps,
empties for lights and smoke, swinging bell, fluttering pennants).
"""
import math, random
from mathutils import Vector, Matrix
from wk_lib import *
from wk_lib import PAL
import hb_lib

R = math.radians
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def zrot(a):
    return (Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0)), Z)


def root_of(name, cls, coll=None):
    r = empty(name, coll=coll)
    r['family'] = 'cove'; r['class'] = cls
    return r


def cyl(mb, c, r, h, col, segs=8, pat=0, axis=None, caps=(True, True), bulge=0.0, rings=1, smooth=True):
    """Upright (or along axis) cylinder; bulge > 0 makes a barrel (rings >= 2)."""
    c = Vector(c)
    ax = Vector(axis).normalized() if axis is not None else Z
    u, w = basis(ax)
    rows = []
    for i in range(rings + 1):
        t = i / rings
        rr = r * (1 + bulge * math.sin(math.pi * t))
        rows.append([mb.vert(c + ax * (h * t) + (math.cos(2 * math.pi * k / segs) * u + math.sin(2 * math.pi * k / segs) * w) * rr)
                     for k in range(segs)])
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(segs):
            k2 = (k + 1) % segs
            mb.face((r0[k], r0[k2], r1[k2], r1[k]), col, pat, smooth=smooth)
    if caps[1]:
        mb.face(rows[-1], col, pat)
    if caps[0]:
        mb.face(rows[0][::-1], col, pat)
    return rows


def lantern(op, em, p, size=0.22):
    """Iron lantern at p (centre of glass): roof + base on op, glass on em."""
    p = Vector(p)
    box(op, p + Vector((0, 0, size * 0.62)), (size * 1.25, size * 1.25, size * 0.22), PAL['iron'], PT['metal'], skip=('-z',))
    box(op, p + Vector((0, 0, size * 0.85)), (size * 0.5, size * 0.5, size * 0.3), PAL['iron'], PT['metal'], skip=('-z',))
    box(op, p - Vector((0, 0, size * 0.6)), (size * 1.1, size * 1.1, size * 0.18), PAL['iron'], PT['metal'])
    box(em, p, (size * 0.9, size * 0.9, size), PAL['lamp_glass'], 0)


def out(root, mb, coll, seed, name='body', wl=0.15):
    ob = finish(mb, name, 'hb_opaque', root, seed, coll=coll, wl=wl)
    return ob


def info(root, parts):
    t = sum(p.tris() for p in parts)
    return root, dict(tris=t)


# ------------------------------------------------------------------ 1. driftwood piles
def driftwood(coll=None):
    rng = random.Random(1001)
    mb = MB(1001)
    logs = [((-2.4, -0.4, 0.2), (2.2, 0.6, 0.25), 0.24), ((-1.8, 0.9, 0.18), (2.6, -0.3, 0.55), 0.2), ((-0.6, -1.2, 0.15), (1.2, 1.5, 0.6), 0.17),
            ((-2.8, 1.4, 0.14), (-0.2, 2.0, 0.16), 0.14), ((0.6, -1.4, 0.12), (3.4, -0.8, 0.14), 0.15), ((-1.2, 0.2, 0.55), (1.6, 0.0, 0.85), 0.13)]
    for a, b, r in logs:
        rod(mb, a, b, r, PAL['drift'] if rng.random() < 0.7 else PAL['bleach_light'], 5, r2=r * 0.75, cap=True, smooth=True)
        for k in range(rng.randint(0, 2)):     # snags
            t = rng.uniform(0.2, 0.8); p = Vector(a).lerp(Vector(b), t)
            rod(mb, p, p + Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), rng.uniform(0.2, 0.7))), r * 0.35, PAL['drift'], 3)
    # a root ball off one end, roots splaying
    rb = Vector((-2.7, -0.5, 0.45))
    rock(mb, rb, 0.55, rng, squash=0.9, col=PAL['drift_dark'], segs=5, pat=PT['boards'])
    for k in range(6):
        a = k * 1.05 + rng.uniform(0, 0.4)
        rod(mb, rb, rb + Vector((math.cos(a) * 1.0 - 0.4, math.sin(a) * 1.0, rng.uniform(-0.4, 0.7))), 0.06, PAL['drift_dark'], 3, r2=0.02)
    box(mb, (1.0, 1.9, 0.06), (2.4, 0.26, 0.06), PAL['paint_teal'], PT['boards'], axes=zrot(0.2))     # a painted plank
    sag_line(mb, (-0.5, 0.0, 0.7), (1.2, 2.6, 0.04), 0.1, 0.03, PAL['rope'], n=3, floor=0.03)
    for k in range(3):
        kelp(mb, (rng.uniform(-2, 2), rng.uniform(-2, -1.4), 0), (rng.uniform(-1, 1), -1), rng.uniform(0.8, 1.4), 0.16, rng)
    root = root_of('wreck_cove_driftwood', 'driftwood', coll)
    out(root, mb, coll, 1)
    return info(root, [mb])


# ------------------------------------------------------------------ 2. lobster pots
def creel(mb, c, a, rng, col=None):
    """A D-shaped lobster creel ~1.0 x 0.6 x 0.45: slatted base, three hoops, net slats, a lid rope."""
    c = Vector(c); ax = zrot(a)
    box(mb, c + Vector((0, 0, 0.04)), (1.0, 0.62, 0.08), col or PAL['timber'], PT['planks_x'], axes=ax)
    for xx in (-0.42, 0.0, 0.42):
        pts = [c + ax[0] * xx + ax[1] * (0.3 * math.cos(t)) + Z * (0.06 + 0.4 * math.sin(t)) for t in (0.0, 0.8, 1.57, 2.35, 3.14)]
        for p, q in zip(pts, pts[1:]):
            rod(mb, p, q, 0.025, PAL['bleach'], 3, smooth=False)
    for t in (0.5, 1.2, 1.94, 2.64):     # net, as dark slats running along
        p = c + ax[1] * (0.3 * math.cos(t)) + Z * (0.06 + 0.4 * math.sin(t))
        rod(mb, p - ax[0] * 0.44, p + ax[0] * 0.44, 0.016, PAL['tar'], 3, smooth=False)


def lobster_pots(coll=None):
    rng = random.Random(1002)
    mb = MB(1002)
    creel(mb, (0, 0, 0), 0.1, rng)
    creel(mb, (1.15, 0.2, 0), -0.15, rng, PAL['timber_grey'])
    creel(mb, (0.5, 0.1, 0.5), 0.05, rng, PAL['drift'])
    creel(mb, (-0.9, 1.2, 0), 1.5, rng, PAL['timber_dark'])
    # rope coil and cork floats, a dan-buoy pole with a rag flag
    for k in range(2):
        pts = [Vector((-1.2 + math.cos(t) * (0.42 - 0.08 * k), -0.4 + math.sin(t) * (0.42 - 0.08 * k), 0.04 + 0.05 * k)) for t in [i * 2 * math.pi / 7 for i in range(8)]]
        for p, q in zip(pts, pts[1:]):
            rod(mb, p, q, 0.04, PAL['rope'], 3, smooth=False)
    for p in ((1.9, -0.4), (2.2, -0.2), (2.0, 0.1)):
        box(mb, (*p, 0.1), (0.22, 0.22, 0.2), PAL['pennant_ochre'] if p[1] < 0 else PAL['pennant_red'], 0)
    rod(mb, (2.6, 0.6, -0.3), (2.75, 0.6, 2.2), 0.04, PAL['bleach'], 4)
    f0 = len(mb.f)
    a, b, c = mb.vert((2.75, 0.6, 2.15)), mb.vert((2.75, 0.6, 1.75)), mb.vert((3.4, 0.55, 1.9))
    mb.face((a, b, c), PAL['pennant_red'], 0)
    mb.backface(f0, dark=0.85)
    rod(mb, (2.6, 0.6, 0.15), (2.6, 0.6, 0.45), 0.22, PAL['pennant_white'], 6)
    root = root_of('wreck_cove_lobster_pots', 'pots', coll)
    out(root, mb, coll, 2)
    return info(root, [mb])


# ------------------------------------------------------------------ 3. the wreck-warden's hut
def warden_hut(coll=None):
    """A tarred-timber hut on a stone footing, turf-patched roof, a lantern on a bracket by the door (lit at
    dusk), a lit window, chimney, bench, water butt, a lookout glass on a post."""
    rng = random.Random(1003)
    op, win, em = MB(1003), MB(1004), MB(1005)
    W, D, Hh = 4.4, 3.2, 2.3
    box2(op, -W / 2 - 0.15, -D / 2 - 0.15, -0.6, W / 2 + 0.15, D / 2 + 0.15, 0.35, PAL['rock'], PT['ashlar'], skip=('-z',))
    box2(op, -W / 2, -D / 2, 0.35, W / 2, D / 2, Hh, PAL['tar'], PT['boards'], skip=('-z', '+z'))
    # gable ends + roof (front -y is a long side: the door faces the sea)
    rz = Hh + 1.5
    for sx in (-1, 1):
        ids = [op.vert((sx * W / 2, -D / 2, Hh)), op.vert((sx * W / 2, D / 2, Hh)), op.vert((sx * W / 2, 0, rz))]
        op.face(ids if sx > 0 else ids[::-1], PAL['tar'], PT['boards'])
    for sy in (-1, 1):
        p = [(-W / 2 - 0.35, sy * (D / 2 + 0.35), Hh - 0.25), (W / 2 + 0.35, sy * (D / 2 + 0.35), Hh - 0.25), (W / 2 + 0.35, 0, rz + 0.05), (-W / 2 - 0.35, 0, rz + 0.05)]
        ids = [op.vert(x) for x in p]
        op.face(ids if sy < 0 else ids[::-1], PAL['roof_tar'], PT['slate'])
        ids2 = [op.vert(Vector(x) - Vector((0, 0, 0.12))) for x in p]
        op.face(ids2[::-1] if sy < 0 else ids2, PAL['tar'], 0)
    for (x0, x1) in ((-1.6, -0.3), (0.7, 1.9)):    # turf patches
        p = [(x0, -D / 2 - 0.1, Hh - 0.05), (x1, -D / 2 - 0.1, Hh - 0.05), (x1, -0.9, rz - 0.85), (x0, -0.9, rz - 0.85)]
        ids = [op.vert(Vector(x) + Vector((0, 0, 0.06))) for x in p]
        op.face(ids, PAL['roof_turf'], PT['grass'])
    box(op, (1.2, 0.5, rz - 0.2), (0.55, 0.55, 1.6), PAL['rock'], PT['ashlar'])
    box(op, (1.2, 0.5, rz + 0.62), (0.65, 0.65, 0.1), PAL['rock_dark'], 0)
    # door, frames, window
    box(op, (-0.6, -D / 2 - 0.02, 1.25), (0.95, 0.06, 1.8), PAL['door_green'], PT['boards'])
    box(op, (-0.6, -D / 2 - 0.05, 2.2), (1.15, 0.08, 0.12), PAL['bleach'], 0)
    box(op, (1.1, -D / 2 - 0.05, 1.45), (1.05, 0.08, 0.95), PAL['bleach'], 0)
    box(win, (1.1, -D / 2 - 0.07, 1.45), (0.4, 0.04, 0.75), (1.0, 0.85, 0.0), 0, skip=('+y',))
    box(win, (1.1 + 0.42, -D / 2 - 0.07, 1.45), (0.4, 0.04, 0.75), (0.6, 0.85, 0.0), 0, skip=('+y',))
    box(op, (-W / 2 - 0.04, 0.0, 1.5), (0.06, 0.9, 0.8), PAL['bleach'], 0)
    box(win, (-W / 2 - 0.07, 0.0, 1.5), (0.04, 0.7, 0.6), (0.7, 0.8, 0.0), 0, skip=('+x',))
    # lantern on a bracket by the door
    lp = Vector((0.25, -D / 2 - 0.55, 2.05))
    rod(op, (0.25, -D / 2, 2.45), lp + Vector((0, 0, 0.45)), 0.03, PAL['iron'], 3)
    lantern(op, em, lp, 0.26)
    # bench, water butt, lookout glass, driftwood stack against the wall
    box(op, (-1.7, -D / 2 - 0.45, 0.45), (1.4, 0.4, 0.08), PAL['bleach'], PT['planks_x'])
    for xx in (-2.25, -1.15):
        box(op, (xx, -D / 2 - 0.45, 0.22), (0.1, 0.36, 0.44), PAL['bleach'], 0)
    cyl(op, (W / 2 + 0.45, -D / 2 + 0.3, 0.0), 0.32, 0.9, PAL['timber_dark'], 7, PT['boards'], bulge=0.08, rings=2)
    rod(op, (-W / 2 - 0.9, -D / 2 - 1.4, 0.0), (-W / 2 - 0.9, -D / 2 - 1.4, 1.35), 0.05, PAL['bleach'], 4)
    rod(op, (-W / 2 - 1.15, -D / 2 - 1.55, 1.3), (-W / 2 - 0.55, -D / 2 - 1.85, 1.48), 0.07, PAL['brass'], 5, cap=True)
    for k in range(4):
        rod(op, (W / 2 + 0.25, 0.4 + 0.25 * k, 0.12 + 0.02 * k), (W / 2 + 0.25, 0.3 + 0.25 * k, 1.1 + 0.2 * rng.random()), 0.09, PAL['drift'], 4)
    for k in range(3):
        rock(op, (rng.uniform(-2.5, 2.5), -D / 2 - rng.uniform(1.2, 2.0), 0.0), rng.uniform(0.2, 0.35), rng, segs=5)
    root = root_of('wreck_cove_warden_hut', 'hut', coll)
    out(root, op, coll, 3)
    hb_lib.to_object(win, 'hut_windows', 'hb_window', parent=root, coll=coll)
    hb_lib.to_object(em, 'hut_lamp', 'hb_emissive', parent=root, coll=coll)
    empty('lamp_light', tuple(lp), parent=root, coll=coll)
    empty('chimney', (1.2, 0.5, rz + 0.7), parent=root, coll=coll)
    return info(root, [op, win, em])


# ------------------------------------------------------------------ 4. lifeboat station
def lifeboat_station(coll=None):
    """The rescue boatshed (classical restyle G6b): a whitewashed ashlar shed gable-on to the sea, its front open between
    two Doric columns under a low terracotta pediment, the station's oared boat (an ochre-red double-ender with a stern
    curl and painted eyes) on a timber cradle at the head of a timber slipway that runs down into the water on piles.
    Origin = the shed floor; the slip foot is ~1.6 m below it. Same nodes as before (station_windows, station_lamp,
    lamp_light, slip_foot)."""
    lin = hb_lib.lin
    WASH, ASHLAR, TILE, OCHRE = lin('#E6DDCB'), lin('#CFC2A8'), lin('#A9573A'), lin('#9E3B2C')
    BOAT_TOP, PITCH, BRONZE = lin('#B08A5E'), lin('#2B2521'), lin('#A0703A')
    rng = random.Random(1006)
    op, win, em = MB(1006), MB(1007), MB(1008)
    W, D, Hh = 4.8, 8.0, 3.0
    y0 = 0.0
    box2(op, -W / 2 - 0.15, y0 - 0.3, -0.8, W / 2 + 0.15, y0 + D, 0.15, PAL['rock'], PT['ashlar'], skip=('-z',))   # stylobate
    # side and back walls: whitewashed ashlar
    box2(op, -W / 2, y0 + 0.5, 0.15, W / 2, y0 + D, Hh, WASH, PT['ashlar'], skip=('-z', '+z', '-y'))
    # the open front: two antae and two Doric columns, a plain architrave
    for sx in (-1, 1):
        box2(op, sx * W / 2 - (0.5 if sx > 0 else 0), y0 + 0.1, 0.15, sx * W / 2 + (0.5 if sx < 0 else 0), y0 + 0.6, Hh, ASHLAR, PT['ashlar'], skip=('-z', '+z'))
        cyl(op, (sx * 0.85, y0 + 0.35, 0.15), 0.22, Hh - 0.35, WASH, segs=6, caps=(False, False))
        box(op, (sx * 0.85, y0 + 0.35, Hh - 0.12), (0.55, 0.55, 0.22), ASHLAR, 0, skip=('-z',))                  # capital
    box2(op, -W / 2, y0 + 0.08, Hh, W / 2, y0 + 0.62, Hh + 0.45, ASHLAR, PT['ashlar'], skip=('-z',))              # architrave
    box2(op, -1.4, y0 + 0.62, 0.16, 1.4, y0 + 0.66, Hh, PAL['interior'], 0, skip=('-y',))                          # dark inside
    # low-pitched pediment and a terracotta tiled roof
    rz = Hh + 0.45 + 1.0
    for yy in (y0 + 0.08, y0 + D):
        ids = [op.vert((-W / 2 - 0.1, yy, Hh + 0.45)), op.vert((W / 2 + 0.1, yy, Hh + 0.45)), op.vert((0, yy, rz))]
        op.face(ids if yy < 1 else ids[::-1], WASH if yy < 1 else ASHLAR, PT['ashlar'])
    for sx in (-1, 1):
        q = [(sx * (W / 2 + 0.4), y0 - 0.15, Hh + 0.3), (sx * (W / 2 + 0.4), y0 + D + 0.3, Hh + 0.3), (0, y0 + D + 0.3, rz + 0.08), (0, y0 - 0.15, rz + 0.08)]
        ids = [op.vert(x) for x in q]
        op.face(ids[::-1] if sx < 0 else ids, TILE, PT['tiles'])                                                     # wound outward (up)
    box(op, (0, y0 - 0.14, rz + 0.25), (0.3, 0.12, 0.45), TILE, 0)                                                # acroterion
    box(op, (0, y0 + 0.06, Hh + 0.22), (2.2, 0.06, 0.3), OCHRE, 0)                                                 # painted frieze board
    # a bronze lamp hung from the architrave
    lp = Vector((0, y0 - 0.35, 2.75))
    rod(op, (0, y0 + 0.08, Hh + 0.1), lp + Vector((0, 0, 0.35)), 0.03, BRONZE, 3)
    lantern(op, em, lp, 0.22)
    box(win, (-W / 2 - 0.06, y0 + 3.0, 1.7), (0.04, 0.7, 0.8), (0.85, 0.8, 0.0), 0, skip=('+x',))
    box(win, (-W / 2 - 0.06, y0 + 5.6, 1.7), (0.04, 0.7, 0.8), (0.4, 0.8, 0.0), 0, skip=('+x',))
    # the slipway: timber ways from the shed down to the sea on piles
    s0, s1 = Vector((0, y0 + 1.0, 0.15)), Vector((0, y0 - 15.0, -1.7))
    d = (s1 - s0)
    for sx in (-1, 1):
        rod(op, s0 + Vector((sx * 0.75, 0, 0.1)), s1 + Vector((sx * 0.75, 0, 0.1)), 0.11, PAL['timber_dark'], 4)
    ids = [op.vert(s0 + Vector((-1.2, 0, 0))), op.vert(s1 + Vector((-1.2, 0, 0))), op.vert(s1 + Vector((1.2, 0, 0))), op.vert(s0 + Vector((1.2, 0, 0)))]
    op.face(ids, PAL['timber_grey'], PT['planks_x'])
    ids = [op.vert(s0 + Vector((-1.2, 0, -0.3))), op.vert(s0 + Vector((1.2, 0, -0.3))), op.vert(s1 + Vector((1.2, 0, -0.3))), op.vert(s1 + Vector((-1.2, 0, -0.3)))]
    op.face(ids, PAL['timber_dark'], 0)
    for k in range(1, 5):
        p = s0 + d * (k / 4.5)
        for sx in (-1, 1):
            rod(op, p + Vector((sx * 1.05, 0, -0.3)), p + Vector((sx * 1.05, 0, -2.8)), 0.13, PAL['timber_dark'], 4)
    # the station boat on her cradle: an oared double-ender
    H = Hull(6.0, FORMS.get('fisher') or FORMS['work'])
    lb = MB(1009)

    def colf(u, t, sd):
        return (PITCH if t < 0.4 else OCHRE if t < 0.55 else BOAT_TOP if t < 0.9 else OCHRE), PT['strakes']
    P = shell(lb, H, -1.0, 1.0, 5, 3, colf)
    ids = [lb.vert(P(-1.0, t, 1)) for t in (0.33, 0.66, 1.0)] + [lb.vert(P(-1.0, t, -1)) for t in (1.0, 0.66, 0.33)]
    lb.face(ids, BOAT_TOP, PT['strakes'])
    deck = [lb.vert(P(u, 1.0, sd)) for u, sd in ((-1, 1), (1, 1), (1, -1), (-1, -1))]
    lb.face(deck[::-1], PAL['varnish'], PT['planks_y'])
    st = P(-1.0, 1.0, 1).lerp(P(-1.0, 1.0, -1), 0.5)
    rod(lb, st, st + Vector((0.15, 0, 0.6)), 0.07, BOAT_TOP, 4)                                                     # stern curl
    rod(lb, st + Vector((0.15, 0, 0.6)), st + Vector((0.45, 0, 0.75)), 0.06, BOAT_TOP, 4, r2=0.04, cap=True)
    for sd in (-1, 1):                                                                                              # eyes
        c = P(0.72, 0.72, sd)
        n = Vector((0, sd, 0))
        q = [c + n * 0.03 + Vector((dx * 0.22, 0, dz * 0.1)) for dx, dz in ((-1, 0), (0, -1), (1, 0), (0, 1))]
        ids = [lb.vert(x) for x in q]
        lb.face(ids if sd > 0 else ids[::-1], PAL['bleach_light'] if 'bleach_light' in PAL else WASH, 0)
    for sd in (-0.35, 0.35):
        rod(lb, P(-0.7, 1.0, 1).lerp(P(-0.7, 1.0, -1), 0.5 + sd) + Vector((0, 0, 0.12)),
            P(0.7, 1.0, 1).lerp(P(0.7, 1.0, -1), 0.5 + sd) + Vector((0, 0, 0.12)), 0.04, PAL['timber'], 3)          # oars
    tag(lb, 0, wk=0.15)
    Mlb = Matrix.Translation(s0.lerp(s1, 0.28) + Vector((0, 0, 0.75 + H.dr))) @ Matrix.Rotation(math.atan2(-d.z, -d.y), 4, 'X') @ Matrix.Rotation(R(-90), 4, 'Z')
    xform(lb, Mlb)
    op.extend(lb)
    cc = s0.lerp(s1, 0.28)
    box(op, cc + Vector((0, 0, 0.25)), (1.5, 3.4, 0.25), PAL['timber_dark'], PT['boards'], axes=(X, d.normalized(), d.normalized().cross(X)))  # cradle
    # a timber capstan for the haul-up
    cyl(op, (0, y0 + D - 0.8, 0.15), 0.32, 1.0, PAL['timber'], segs=6, caps=(False, True))
    root = root_of('wreck_cove_lifeboat_station', 'lifeboat', coll)
    out(root, op, coll, 4)
    hb_lib.to_object(win, 'station_windows', 'hb_window', parent=root, coll=coll)
    hb_lib.to_object(em, 'station_lamp', 'hb_emissive', parent=root, coll=coll)
    empty('lamp_light', tuple(lp), parent=root, coll=coll)
    empty('slip_foot', tuple(s1), parent=root, coll=coll)
    return info(root, [op, win, em])


# ------------------------------------------------------------------ 5. tide-pool rocks
def tidepool(coll=None):
    rng = random.Random(1010)
    mb = MB(1010)
    for (x, y, r, sq) in ((-1.8, 0.6, 1.3, 0.75), (1.6, 1.0, 1.1, 0.7), (0.3, 2.0, 0.9, 0.8), (-2.6, -1.2, 0.7, 0.6), (2.4, -1.0, 0.6, 0.6),
                          (-0.6, -2.0, 0.5, 0.5), (0.9, -1.9, 0.35, 0.6)):
        rock(mb, (x, y, -0.05), r, rng, squash=sq, weed=0.75, segs=6)
    f0 = len(mb.f)
    ring = [mb.vert((math.cos(a) * 1.6 * (1 + 0.15 * math.sin(a * 3)), -0.3 + math.sin(a) * 1.0, 0.05)) for a in [k * 2 * math.pi / 10 for k in range(10)]]
    mb.face(ring, PAL['pool'], 0, jitter=0.0)
    tag(mb, f0, wk=0.0)
    for k in range(7):
        a = rng.uniform(0, 6.28)
        kelp(mb, (math.cos(a) * 1.7, -0.3 + math.sin(a) * 1.1, 0.02), (math.cos(a), math.sin(a)), rng.uniform(0.6, 1.1), 0.14, rng, z=0.06)
    # a starfish and limpets
    f0 = len(mb.f)
    c = Vector((0.8, -0.6, 0.07)); cc = mb.vert(c + Vector((0, 0, 0.03)))
    pts = []
    for k in range(10):
        a = k * math.pi / 5 + 0.3
        rr = 0.22 if k % 2 == 0 else 0.08
        pts.append(mb.vert(c + Vector((math.cos(a) * rr, math.sin(a) * rr, 0))))
    for k in range(10):
        mb.face((pts[k], pts[(k + 1) % 10], cc), PAL['pennant_ochre'] if k % 2 else mix(PAL['pennant_ochre'], PAL['paint_red'], 0.4), 0)
    tag(mb, f0, wk=0.0)
    barnacles(mb, [(Vector((-1.8 + rng.uniform(-0.6, 0.6), 0.6 + rng.uniform(-0.8, 0.0), 0.65)), (rng.uniform(-0.4, 0.4), -0.6, 0.6)) for k in range(10)], rng, 0.08)
    root = root_of('wreck_cove_tidepool', 'tidepool', coll)
    out(root, mb, coll, 5, wl=0.3)
    return info(root, [mb])


# ------------------------------------------------------------------ 6. anchor and chain
def anchor_chain(coll=None):
    from wk_wrecks import anchor_shape
    rng = random.Random(1011)
    mb = MB(1011)
    ring = anchor_shape(mb, Vector((0, 0, -0.5)), 3.0, rot_z=0.3, lie=0.42)
    # its hemp cable snaking off across the sand, half-buried (P7b: was an iron chain under an admiralty anchor)
    p = Vector((-1.2, 0.4, 0.06)); a = 2.6
    sag_line(mb, ring, p, 0.3, 0.08, PAL['rope'], n=3, floor=0.06)
    for k in range(7):
        a += rng.uniform(-0.45, 0.45)
        q = p + Vector((math.cos(a), math.sin(a), 0)) * 0.6
        rod(mb, p, q, 0.08, PAL['rope'], 4)
        p = q
    drift(mb, (0.4, 0.0, 0.0), 1.6, 1.0, 0.35, skew=(0.2, 0), seed=7)
    root = root_of('wreck_cove_anchor', 'anchor', coll)
    out(root, mb, coll, 6)
    return info(root, [mb])


# ------------------------------------------------------------------ 7. washed-up barrels and crates
def flotsam(coll=None):
    rng = random.Random(1012)
    mb = MB(1012)

    def barrel(c, axis, col):
        cyl(mb, c, 0.32, 0.95, col, 8, PT['boards'], axis=axis, bulge=0.12, rings=2)
        ax = Vector(axis).normalized()
        for t in (0.12, 0.88):
            cyl(mb, Vector(c) + ax * (0.95 * t - 0.03), 0.335 * (1 + 0.12 * math.sin(math.pi * t)), 0.06, PAL['rust_dark'], 8, PT['metal'], axis=ax, caps=(False, False))
    barrel((0.0, 0.0, 0.0), (0, 0, 1), PAL['timber'])
    barrel((-0.6, 0.9, 0.33), (math.cos(0.4), math.sin(0.4), 0), PAL['timber_dark'])
    barrel((1.7, -0.6, 0.31), (math.cos(2.2), math.sin(2.2), -0.05), PAL['timber'])
    # crates
    box(mb, (1.0, 0.8, 0.32), (0.75, 0.75, 0.64), PAL['timber_fresh'] if 'timber_fresh' in PAL else PAL['timber'], PT['boards'], axes=zrot(0.3))
    box(mb, (1.15, 0.7, 0.86), (0.6, 0.6, 0.45), PAL['timber_grey'], PT['boards'], axes=zrot(0.6))
    # a burst crate, staves and planks scattered, straw spilling
    box(mb, (-1.4, -0.5, 0.15), (0.8, 0.7, 0.3), PAL['timber_grey'], PT['boards'], axes=zrot(-0.2), skip=('+z',))
    box(mb, (-1.4, -0.5, 0.15), (0.74, 0.64, 0.02), PAL['lichen'], 0, axes=zrot(-0.2))
    for k in range(4):
        a = rng.uniform(0, 6.28)
        box(mb, (-1.4 + math.cos(a) * 1.0, -0.5 + math.sin(a) * 0.9, 0.03), (0.8, 0.12, 0.03), PAL['timber_grey'], PT['boards'], axes=zrot(a + 1))
    # glass net float in its netting
    cyl(mb, (0.5, -1.1, 0.0), 0.2, 0.36, lin('#5E8C7A'), 6, 0, rings=2, bulge=0.4)
    sag_line(mb, (0.5, -1.1, 0.3), (-0.2, -1.8, 0.03), 0.05, 0.02, PAL['rope'], n=2, floor=0.03)
    for k in range(3):
        kelp(mb, (rng.uniform(-1.5, 1.5), rng.uniform(-1.6, -1.2), 0), (rng.uniform(-1, 1), -1), rng.uniform(0.6, 1.1), 0.14, rng)
    root = root_of('wreck_cove_flotsam', 'flotsam', coll)
    out(root, mb, coll, 7)
    return info(root, [mb])


# ------------------------------------------------------------------ 8. the wreck bell
def wreck_bell(coll=None):
    """A ship's bell (salvaged, verdigris on bronze) in a driftwood A-frame on the strand; node 'bell' swings
    about its pivot (local +x of the headstock, glTF +x) - tolled when a coin goes down."""
    rng = random.Random(1013)
    mb, bm = MB(1013), MB(1014)
    Hh = 3.2
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod(mb, (sx * 1.0, sy * 0.55, -0.3), (sx * 0.85, 0, Hh), 0.11, PAL['drift'], 5)
        rod(mb, (sx * 1.0, -0.55, 0.9), (sx * 1.0, 0.55, 0.9), 0.06, PAL['drift'], 4)
    rod(mb, (-1.15, 0, Hh), (1.15, 0, Hh), 0.13, PAL['drift'], 5, cap=True)
    box(mb, (0, 0, Hh + 0.24), (2.5, 0.5, 0.06), PAL['roof_tar'], PT['boards'])
    # bell: lathe profile, pivot at the headstock
    piv = Vector((0, 0, Hh - 0.2))
    prof = [(0.06, 0.0), (0.2, -0.05), (0.24, -0.25), (0.28, -0.5), (0.4, -0.66), (0.37, -0.7)]
    segs = 10
    rows = [[bm.vert(piv + Vector((math.cos(2 * math.pi * k / segs) * r, math.sin(2 * math.pi * k / segs) * r, z))) for k in range(segs)] for r, z in prof]
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(segs):
            k2 = (k + 1) % segs
            bm.face((r0[k2], r0[k], r1[k], r1[k2]), PAL['bronze'] if 'bronze' in PAL else PAL['brass'], PT['metal'], smooth=True)
    bm.face(rows[0], PAL['brass'], PT['metal'])
    for f in bm.f:
        f['col'] = mix(f['col'], PAL['verdigris'], 0.35 * rng.random())
        f['wk'] = 0.0
    box(bm, piv + Vector((0, 0, 0.06)), (0.3, 0.14, 0.14), PAL['iron'], PT['metal'])
    rod(bm, piv + Vector((0, 0, -0.1)), piv + Vector((0.02, 0, -0.62)), 0.03, PAL['iron'], 3)
    rod(bm, piv + Vector((0.02, 0, -0.66)), piv + Vector((0.06, -0.05, -1.9)), 0.03, PAL['rope'], 3)
    tag(bm, 0, wk=0.0)
    for k in range(3):
        rock(mb, (rng.uniform(-1.3, 1.3), rng.uniform(-0.8, 0.8), 0.0), rng.uniform(0.2, 0.32), rng, segs=5)
    box(mb, (0, -0.6, 0.55), (0.6, 0.06, 0.3), PAL['board'], PT['boards'])        # a small plaque on a stake
    rod(mb, (0, -0.58, -0.2), (0, -0.58, 0.45), 0.04, PAL['drift'], 4)
    root = root_of('wreck_cove_bell', 'bell', coll)
    out(root, mb, coll, 8)
    finish(bm, 'bell', 'hb_opaque', root, 8, origin=piv, coll=coll)
    return info(root, [mb, bm])


# ------------------------------------------------------------------ 9. tattered pennants
def pennants(coll=None):
    """Three weathered poles with tattered swallow-tail pennants (nodes pennant_0..2: origin at the hoist,
    pennant runs along local +x; flutter = vertex sway growing with x)."""
    rng = random.Random(1014)
    mb = MB(1014)
    parts = []
    root = root_of('wreck_cove_pennants', 'pennants', coll)
    poles = [((-1.6, 0.2), 5.6, PAL['pennant_red']), ((0.2, -0.3), 4.6, PAL['pennant_white']), ((1.8, 0.4), 5.1, PAL['pennant_blue'])]
    for k, ((x, y), h, col) in enumerate(poles):
        lean = Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.1, 0.1), 0))
        top = Vector((x, y, h)) + lean
        rod(mb, (x, y, -0.4), top, 0.07, PAL['drift'], 5, r2=0.05)
        rod(mb, top, top + Vector((0, 0, 0.12)), 0.08, PAL['iron'], 4)
        for sy in (-1, 1):   # stays
            sag_line(mb, top - Vector((0, 0, 0.6)), (x + rng.uniform(-0.5, 0.5), y + sy * 1.4, 0.03), 0.15, 0.015, PAL['rope'], n=2)
        rock(mb, (x, y, 0.0), 0.3, rng, segs=5)
        pm = MB(1100 + k)
        L, Hh = 2.2 - 0.3 * k, 0.55
        nu = 5
        hoist = top - Vector((0, 0, 0.12))
        cols = []
        for j in range(nu + 1):
            t = j / nu
            hh = Hh * (1 - 0.7 * t)
            dz = -0.25 * t * t
            sway = 0.12 * math.sin(t * 5 + k)
            a = pm.vert(hoist + Vector((L * t, sway, dz)))
            b = pm.vert(hoist + Vector((L * t * (1 if j < nu else 0.82), sway, dz - hh)))
            cols.append((a, b))
        for j in range(nu):
            if j >= 2 and rng.random() < 0.2:
                continue
            (a0, b0), (a1, b1) = cols[j], cols[j + 1]
            pm.face((b0, b1, a1, a0), mix(col, PAL['pennant_white'], 0.15 * j), 0, jitter=0.08)
        pm.backface(0, dark=0.85)
        tag(pm, 0, wk=0.3, salt=False)
        ob = finish(pm, f'pennant_{k}', 'hb_opaque', root, 9 + k, origin=hoist, coll=coll)
        parts.append(pm)
    out(root, mb, coll, 9)
    return info(root, [mb] + parts)


# ------------------------------------------------------------------ 10. gulls' perches
def gull_perches(coll=None):
    """Old mooring piles at the tideline, weed-skirted, gulls on top (and one on the sand)."""
    rng = random.Random(1015)
    mb = MB(1015)
    tops = []
    for k, (x, y, h) in enumerate(((-2.2, 0.3, 2.4), (-0.7, -0.4, 1.7), (0.9, 0.1, 2.9), (2.3, -0.5, 1.3))):
        lean = Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.15, 0.15), 0))
        top = Vector((x, y, h)) + lean
        rod(mb, (x, y, -0.6), top, 0.2, PAL['timber_dark'], 5, r2=0.17, cap=True)
        splinters(mb, top, Vector((0, 0, 1)), 0.17, 0.2, PAL['bleach_light'], rng, 3)
        tops.append(top)
        rust_streak(mb, top + Vector((0, -0.18, -0.12)), Vector((0, -1, 0)), 0.8, 0.05)      # guano runs (re-coloured below)
        mb.f[-1]['col'] = PAL['salt']
    rod(mb, tops[0] - Vector((0, 0, 0.7)), tops[1] - Vector((0, 0, 0.3)), 0.09, PAL['timber'], 4)
    for t in (tops[0], tops[2], tops[3]):
        gull(mb, t + Vector((0, 0, 0.1)), rng.uniform(0, 6.28), rng)
    gull(mb, (0.2, -1.6, 0.0), 2.0, rng)
    barnacles(mb, [(Vector((x + rng.uniform(-0.12, 0.12), y - 0.2, rng.uniform(0.1, 0.5))), (0, -1, 0)) for (x, y) in ((-2.2, 0.3), (-0.7, -0.4), (0.9, 0.1)) for k in range(4)], rng, 0.07)
    root = root_of('wreck_cove_gull_perches', 'perches', coll)
    out(root, mb, coll, 10, wl=0.6)
    return info(root, [mb])


# ------------------------------------------------------------------ 11. standalone epitaph (memorial row)
def epitaph_post(coll=None):
    root = root_of('wreck_cove_epitaph', 'epitaph', coll)
    _, t = attach_epitaph(root, (0, 0, 0), 5, coll=coll)
    return root, dict(tris=t)


PROPS = [
    ('cove_driftwood', driftwood), ('cove_lobster_pots', lobster_pots), ('cove_warden_hut', warden_hut),
    ('cove_lifeboat_station', lifeboat_station), ('cove_tidepool', tidepool), ('cove_anchor', anchor_chain),
    ('cove_flotsam', flotsam), ('cove_bell', wreck_bell), ('cove_pennants', pennants), ('cove_gull_perches', gull_perches),
    ('cove_epitaph', epitaph_post),
]
