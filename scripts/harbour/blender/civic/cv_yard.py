"""Harbour civic kit - the Shipyard (6 slipways + 37 building berths) and the hull construction stages.

Classical restyle (PLAN §4.3): the berth rows are neosoikoi (ship sheds) - stone piers and an oak frame with a tiled
course on the water-side pitch only, so the hulls stay readable from the runtime camera (it looks at this plot from the
back-right, Blender +x +y, at 34 deg: a ray from a hull leaves through the open landward pitch). The slips stay open to
the sky under three timber treadwheel cranes (polyspastos) on sledges; the mould loft is a tiled timber hall. The hull
stages are built on the ancient corbita form (hulls/hb_ancient.py) so a launched hull matches the fleet.
"""
import math, random
from mathutils import Vector
from cv_lib import *
import hb_hulls
from hb_hulls import Hull, FORMS, loft, SCH
from hb_ancient import ANCIENT_FORMS, ASCH, arc, chain

PAL.setdefault('gravel', lin('#A79E89'))
PAL.setdefault('earth', lin('#8B7558'))

SLIP_X = [-67.5 + 12.5 * i for i in range(6)]
SLIP_HALF = 4.5
SLIP_HEAD, SLIP_TOE = 20.0, -47.0
SLIP_DROP = 4.2
YARD_FRONT = -40.0
REST_Y = -4.0


def bed(y):
    """Slip bed height at y (head 0 at SLIP_HEAD, falling to -SLIP_DROP at SLIP_TOE)."""
    return -SLIP_DROP * (SLIP_HEAD - y) / (SLIP_HEAD - SLIP_TOE)


SLOPE = math.atan(SLIP_DROP / (SLIP_HEAD - SLIP_TOE))
ROWS = [(-20.0, 13), (0.0, 12), (20.0, 12)]     # berth rows: (y centre, count) -> 37 berths
BX0, BX1 = 3.5, 74.5
ROW_HALF = 7.0
WHEEL_R = 2.5                                     # treadwheel radius (src/harbour/civic/shipyard.ts spins it by slide / R)


def quay_strip(op, x0, x1, y0, y1, top=None, pat=PT['cobble'], wall_front=True, slip_walls=()):
    poly(op, ((x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)), top or PAL['gravel'], pat, nrm=(0, 0, 1))
    if wall_front:
        poly(op, ((x0, y0, -4.6), (x1, y0, -4.6), (x1, y0, 0), (x0, y0, 0)), PAL['sandstone'], PT['ashlar'], nrm=(0, -1, 0))
        box2(op, x0, y0 - 0.1, -0.05, x1, y0 + 0.9, 0.35, PAL['lime'], PT['ashlar'])    # coping
    for (x, s) in slip_walls:   # trench wall facing into the slip
        poly(op, ((x, y0, bed(y0) - 0.4), (x, y1, bed(y1) - 0.4), (x, y1, 0), (x, y0, 0)), PAL['sandstone'], PT['ashlar'], nrm=(s, 0, 0))


def bollard(op, x, y):
    """Stone mooring post with a rounded head."""
    cyl(op, (x, y), 0.36, 0.3, 0.0, 1.0, PAL['lime_dark'], PT['ashlar'], 7)
    cyl(op, (x, y), 0.42, 0.3, 1.0, 1.25, PAL['lime'], 0, 7)


def lamp_column(K, x, y, h=4.0):
    """Quay lamp: a stone column on a square base carrying a bronze bowl with its flame (hb_emissive)."""
    op = K.op
    box2(op, x - 0.35, y - 0.35, 0.0, x + 0.35, y + 0.35, 0.5, PAL['lime_dark'], PT['ashlar'], skip=('-z',))
    cyl(op, (x, y), 0.2, 0.17, 0.5, h, PAL['lime'], 0, 6, top=False)
    lathe(op, Vector((x, y, 0)), [(0.12, h - 0.05), (0.42, h + 0.12), (0.46, h + 0.32)], PAL['bronze_light'], PT['metal'], 7,
          smooth=True, cap=False)
    cyl(K.em, (x, y), 0.36, 0.3, h + 0.22, h + 0.5, (1.0, 0.6, 0.2), 0, 6)


def neosoikos(K, x0, x1, nb, yc, half, h=6.2, pitch=22.0, tile=None, lamps=()):
    """Ship shed over a row of berths: stone piers on every other berth boundary (oak posts between) under an oak
    architrave, open king-post trusses, and a tiled course on the WATER-SIDE (-y) pitch only, from the eave up 60% of the
    slope (no antefixes: from the landward camera they read as spikes on the quay). The landward pitch is bare purlins: the runtime camera sits landward, so a hull's sight line leaves through
    it and the tiles never cover a hull."""
    op = K.op
    oak, oak_d = PAL['oak'], PAL['oak_dark']
    xs = [x0 + (x1 - x0) * j / nb for j in range(nb + 1)]
    ov = 0.7
    rise = rise_for(half + ov, pitch)
    zr = h + 0.45 + rise * half / (half + ov)            # ridge (the rafters start at the architrave top, out at the eave)
    for j, x in enumerate(xs):
        pier = j % 2 == 0 or j == nb
        for s in (-1, 1):
            y = yc + s * half
            if pier:
                box2(op, x - 0.42, y - 0.42, 0.0, x + 0.42, y + 0.42, 0.55, PAL['sandstone'], PT['ashlar'], skip=('-z',))
                box2(op, x - 0.34, y - 0.34, 0.55, x + 0.34, y + 0.34, h - 0.3, PAL['lime'], PT['ashlar'], skip=('-z', '+z'))
                box2(op, x - 0.48, y - 0.48, h - 0.3, x + 0.48, y + 0.48, h, PAL['lime_dark'], 0, skip=('-z',))
            else:
                box2(op, x - 0.16, y - 0.16, 0.0, x + 0.16, y + 0.16, h, oak_d, 0, skip=('-z', '+z'))
        if pier:
            beam(op, (x, yc - half - 0.3, h + 0.2), (x, yc + half + 0.3, h + 0.2), 0.24, 0.3, oak)                     # tie beam
            for s in (-1, 1):
                beam(op, (x, yc + s * (half + ov), h + 0.45 - ov * rise / (half + ov)), (x, yc, zr), 0.2, 0.24, oak)  # rafters
            box2(op, x - 0.11, yc - 0.11, h + 0.35, x + 0.11, yc + 0.11, zr, oak, 0, skip=('-z', '+z'))              # king post
        if j in lamps:   # a bronze lantern under the water-side architrave
            box2(op, x - 0.08, yc - half - 0.6, h - 1.4, x + 0.08, yc - half - 0.45, h, PAL['bronze'], 0)
            box2(K.em, x - 0.22, yc - half - 0.75, h - 1.95, x + 0.22, yc - half - 0.31, h - 1.4, PAL['bronze'], 0)
    for s in (-1, 1):   # architraves
        beam(op, (x0 - 0.6, yc + s * half, h + 0.06), (x1 + 0.6, yc + s * half, h + 0.06), 0.36, 0.42, oak_d)
    beam(op, (x0 - 0.8, yc, zr + 0.12), (x1 + 0.8, yc, zr + 0.12), 0.24, 0.28, oak)                                       # ridge
    # landward pitch: two bare purlins
    for f in (0.35, 0.7):
        y = yc + (half + ov) * (1 - f)
        beam(op, (x0 - 0.8, y, h + 0.6 + (zr - h - 0.45) * f), (x1 + 0.8, y, h + 0.6 + (zr - h - 0.45) * f), 0.16, 0.16, oak)
    # water-side pitch: the tiled course (eave -> 60%) and a purlin above it
    ye, ze = yc - half - ov, h + 0.45 - ov * rise / (half + ov) + 0.18
    ft = 0.6
    yt, zt = ye + (yc - ye) * ft, ze + (zr + 0.18 - ze) * ft
    col = tile or PAL['tile_a']
    poly(op, ((x0 - 0.8, ye, ze), (x1 + 0.8, ye, ze), (x1 + 0.8, yt, zt), (x0 - 0.8, yt, zt)), col, PT['tiles'], nrm=(0, -1, 2.5))
    poly(op, ((x0 - 0.8, ye, ze - 0.24), (x1 + 0.8, ye, ze - 0.24), (x1 + 0.8, ye, ze), (x0 - 0.8, ye, ze)), PAL['tile_ridge'], 0, nrm=(0, -1, 0))
    for xe, sx in ((x0 - 0.8, -1), (x1 + 0.8, 1)):    # verges
        poly(op, ((xe, ye, ze - 0.24), (xe, ye, ze), (xe, yt, zt), (xe, yt, zt - 0.24)), PAL['tile_ridge'], 0, nrm=(sx, 0, 0))
    poly(op, ((x0 - 0.8, yt, zt - 0.24), (x0 - 0.8, yt, zt), (x1 + 0.8, yt, zt), (x1 + 0.8, yt, zt - 0.24)), PAL['tile_ridge'], 0, nrm=(0, 1, 0.3))
    y2 = ye + (yc - ye) * 0.83
    beam(op, (x0 - 0.8, y2, ze + (zr - ze) * 0.83 - 0.1), (x1 + 0.8, y2, ze + (zr - ze) * 0.83 - 0.1), 0.16, 0.16, oak)
    return xs


def treadwheel_crane(root, i, x0, y0, lean, coll=None):
    """Polyspastos on a sledge: an oak shear-legs jib stepped on the sledge, leaning `lean` m over the slip on its
    +x side, guyed back to the sledge; the hoist falls to a hanging oak baulk; the treadwheel (its own node,
    crane_<i>_wheel, axle along x) sits behind the jib's foot and winds the fall. Origin ground centre of the sledge."""
    mb = MB(300 + i)
    oak, oak_d, rope = PAL['oak'], PAL['oak_dark'], PAL['rope']
    H = 16.5
    # sledge: two runners on the rails, cross bearers, a plank floor
    for s in (-1, 1):
        box2(mb, x0 + s * 0.9 - 0.24, y0 - 4.0, 0.14, x0 + s * 0.9 + 0.24, y0 + 4.0, 0.5, oak_d, PT['boards'])
    for yy in (y0 - 3.4, y0, y0 + 3.4):
        box2(mb, x0 - 1.55, yy - 0.2, 0.5, x0 + 1.55, yy + 0.2, 0.72, oak, 0, skip=('-z',))
    box2(mb, x0 - 1.5, y0 - 3.7, 0.72, x0 + 1.5, y0 + 3.7, 0.84, PAL['timber'], PT['planks_x'], skip=('-z',))
    zf = 0.84
    # the jib: shear legs from the sledge's +x edge to the head over the slip, two rungs, the head block
    apex = Vector((x0 + 0.8 + lean, y0, H))
    feet = [Vector((x0 + 0.8, y0 + s * 2.9, zf)) for s in (-1, 1)]
    for f, s in zip(feet, (-1, 1)):
        beam(mb, f, apex + Vector((0, s * 0.3, 0)), 0.4, 0.4, oak)
    for t in (0.3, 0.62):
        a, b = feet[0].lerp(apex, t), feet[1].lerp(apex, t)
        beam(mb, a, b, 0.24, 0.24, oak_d)
    box2(mb, apex.x - 0.45, y0 - 0.7, H - 0.3, apex.x + 0.45, y0 + 0.7, H + 0.5, oak_d, 0)
    # guys back to the sledge's far corners (ropes)
    for s in (-1, 1):
        beam(mb, apex + Vector((-0.3, 0, 0.2)), (x0 - 1.4, y0 + s * 3.6, zf), 0.07, 0.07, rope)
    # the hoist: double fall to the lower block, a sling, the oak baulk being lifted
    hz = H - 6.5
    for d in (-0.15, 0.15):
        beam(mb, (apex.x + 0.3, y0 + d, H - 0.3), (apex.x + 0.3, y0 + d, hz + 0.5), 0.06, 0.06, rope)
    box2(mb, apex.x + 0.05, y0 - 0.35, hz, apex.x + 0.55, y0 + 0.35, hz + 0.6, oak_d, 0)
    for s in (-1, 1):
        beam(mb, (apex.x + 0.3, y0, hz), (apex.x + 0.3, y0 + s * 1.6, hz - 1.6), 0.05, 0.05, rope)
    beam(mb, (apex.x + 0.3, y0 - 2.8, hz - 1.75), (apex.x + 0.3, y0 + 2.8, hz - 1.75), 0.45, 0.45, PAL['timber_fresh'], PT['boards'])
    # the fall back down to the drum on the wheel's axle, and the wheel's two A-trestles
    xw, zc = x0 - 0.75, zf + WHEEL_R + 0.3
    beam(mb, (apex.x - 0.3, y0, H - 0.2), (xw, y0, zc + 0.3), 0.06, 0.06, rope)
    for xt in (xw - 0.72, xw + 0.72):
        for s in (-1, 1):
            beam(mb, (xt, y0 + s * 1.5, zf), (xt, y0, zc + 0.2), 0.22, 0.22, oak_d)
    ob = to_object(mb, f'crane_{i}', 'hb_opaque', parent=root, origin=(x0, y0, 0.0), coll=coll)
    ob['anim'] = 'treadwheel crane on its sledge: may travel along local Z (glTF; rails run front-back, +/-12 m) beside its slips'
    ob['span_slips'] = [2 * i, 2 * i + 1]
    # the treadwheel: two rims, the treads between them, spokes, the axle with its drum
    wb = MB(310 + i)
    segs = 14
    rim = [Vector((0, WHEEL_R * math.sin(2 * math.pi * k / segs), WHEEL_R * math.cos(2 * math.pi * k / segs))) for k in range(segs)]
    c = Vector((xw, y0, zc))
    for dx in (-0.5, 0.5):
        off = c + Vector((dx, 0, 0))
        for k in range(segs):
            beam(wb, off + rim[k] * 1.02, off + rim[(k + 1) % segs] * 1.02, 0.2, 0.32, oak, up=Vector((1, 0, 0)))
        for k in range(0, segs, 2):   # seven spokes a side, alternating with the far side
            a = rim[(k + (1 if dx > 0 else 0)) % segs] * 0.96
            beam(wb, off, off + a, 0.1, 0.12, oak_d)
    for k in range(segs):
        p = c + (rim[k] + rim[(k + 1) % segs]) * 0.5 * 0.99
        beam(wb, p + Vector((-0.55, 0, 0)), p + Vector((0.55, 0, 0)), 0.18, 0.08, PAL['timber_fresh'], up=rim[k].normalized())
    rod(wb, c + Vector((-0.95, 0, 0)), c + Vector((0.95, 0, 0)), 0.12, oak_d, 6, cap=True)
    rod(wb, c + Vector((-0.4, 0, 0)), c + Vector((0.4, 0, 0)), 0.3, oak, 7, cap=True)
    w = to_object(wb, f'crane_{i}_wheel', 'hb_opaque', parent=root, origin=(c.x, c.y, c.z), coll=coll)
    w['anim'] = (f'treadwheel of crane_{i}: rides with it along local Z and turns about local X (axle) by slide / {WHEEL_R} rad '
                 '(it rolls with the travel)')
    return ob


def build_shipyard(coll=None):
    root = empty('shipyard', coll=coll)
    K = Kit(31)
    op, em = K.op, K.em
    rng = random.Random(12)
    # ---------------- ground: strips between the slips, the yard behind, the berth field, the fitting-out quay
    edges = [-75.0] + [x for c in SLIP_X for x in (c - SLIP_HALF, c + SLIP_HALF)] + [BX0 - 0.5]
    for k in range(0, len(edges), 2):
        x0, x1 = edges[k], edges[k + 1]
        walls = []
        if k > 0:
            walls.append((x0, 1))
        if k + 2 < len(edges):
            walls.append((x1, -1))
        quay_strip(op, x0, x1, YARD_FRONT, SLIP_HEAD, PAL['gravel'], PT['cobble'], slip_walls=walls)
    quay_strip(op, -75.0, BX0 - 0.5, SLIP_HEAD, 40.0, PAL['earth'], PT['grass'], wall_front=False)
    for c in SLIP_X:   # slip head wall
        poly(op, ((c - SLIP_HALF, SLIP_HEAD, -0.4), (c + SLIP_HALF, SLIP_HEAD, -0.4), (c + SLIP_HALF, SLIP_HEAD, 0.0), (c - SLIP_HALF, SLIP_HEAD, 0.0)),
             PAL['sandstone'], PT['ashlar'], nrm=(0, -1, 0))
    quay_strip(op, BX0 - 0.5, 75.0, -27.0, 40.0, PAL['gravel'], PT['cobble'], wall_front=False)
    quay_strip(op, BX0 - 0.5, 75.0, YARD_FRONT, -27.0, PAL['quay'], PT['cobble'])
    box2(op, 74.6, YARD_FRONT, -4.6, 75.0, 40.0, 0.0, PAL['sandstone'], PT['ashlar'], skip=('+z', '-z', '-x'))
    # ---------------- six slipways, open to the sky
    slips = []
    for i, c in enumerate(SLIP_X):
        y0, y1 = SLIP_TOE, SLIP_HEAD
        poly(op, ((c - SLIP_HALF, y0, bed(y0) - 0.4), (c + SLIP_HALF, y0, bed(y0) - 0.4), (c + SLIP_HALF, y1, -0.4), (c - SLIP_HALF, y1, -0.4)),
             PAL['timber_grey'], PT['planks_y'], nrm=(0, 0, 1))
        # cross sleepers + two greased standing ways + keel blocks
        y = y1 - 1.0
        while y > y0 + 1.0:
            beam(op, (c - SLIP_HALF + 0.3, y, bed(y) - 0.25), (c + SLIP_HALF - 0.3, y, bed(y) - 0.25), 0.45, 0.3, PAL['timber_dark'])
            y -= 5.6
        for s in (-1, 1):
            beam(op, (c + s * 1.7, y1 - 0.5, bed(y1 - 0.5) + 0.05), (c + s * 1.7, y0 + 0.5, bed(y0 + 0.5) + 0.05), 0.55, 0.32, PAL['oak_dark'])
        for yy in [REST_Y + d for d in (-14, -7, 0, 7, 14)]:
            box2(op, c - 0.6, yy - 0.5, bed(yy) - 0.1, c + 0.6, yy + 0.5, bed(yy) + 0.75, PAL['timber'], PT['boards'], skip=('-z',))
        # cradle: poppets + raking shores either side of the rest position
        for yy in [REST_Y + d for d in (-12, -6, 0, 6, 12)]:
            for s in (-1, 1):
                beam(op, (c + s * 1.7, yy, bed(yy) + 0.2), (c + s * 2.25, yy, bed(yy) + 2.3), 0.3, 0.3, PAL['timber'])
                beam(op, (c + s * (SLIP_HALF - 0.2), yy, bed(yy)), (c + s * 2.45, yy, bed(yy) + 2.9), 0.22, 0.22, PAL['timber_grey'])
        e = empty(f'slip_{i}', (c, REST_Y, bed(REST_Y) + 0.75), parent=root, coll=coll, rot=(SLOPE, 0, 0))
        e['anim'] = ('slipway: hull rests here (keel on the blocks: raise the hull by its draft); local +Z (glTF) points down the slip into '
                     'the water; launch stern-first along +Z to the toe')
        e['toe_gltf'] = [round(c, 2), round(bed(SLIP_TOE), 2), round(-SLIP_TOE, 2)]
        slips.append(dict(name=f'slip_{i}', origin=[round(c, 2), round(bed(REST_Y) + 0.75, 3), round(-REST_Y, 2)],
                          toe=[round(c, 2), round(bed(SLIP_TOE), 2), round(-SLIP_TOE, 2)], slope_rad=round(SLOPE, 4), max_loa_m=34.0,
                          width_m=2 * SLIP_HALF))
    for x in [c + 6.25 for c in SLIP_X[:-1]]:   # lamps at the slip heads
        lamp_column(K, x, SLIP_HEAD - 1.0)
    # three treadwheel cranes, each on the strip between its two slips, on oak rails; the jib leans over the right-hand slip
    cranes = []
    for i in range(3):
        x = SLIP_X[2 * i] + 6.25
        for s in (-1, 1):
            beam(op, (x + s * 0.9, YARD_FRONT + 1.5, 0.07), (x + s * 0.9, SLIP_HEAD - 2.5, 0.07), 0.34, 0.14, PAL['oak_dark'])
        cranes.append(treadwheel_crane(root, i, x, REST_Y + (2.0 if i == 1 else -2.0), 3.6, coll))
    # ---------------- the berth field: three ship sheds, 37 building berths
    berths = []
    bi = 0
    for r, (yc, n) in enumerate(ROWS):
        xs = neosoikos(K, BX0, BX1, n, yc, ROW_HALF, tile=PAL[('tile_a', 'tile_c', 'tile_b')[r]], lamps=(0, n // 2, n))
        for j in range(n):
            x = (xs[j] + xs[j + 1]) / 2
            box2(op, x - 1.9, yc - 5.6, 0.0, x + 1.9, yc + 5.6, 0.12, PAL['timber_fresh'], PT['planks_x'], skip=('-z',))   # building floor
            for yy in (yc - 4.2, yc - 1.4, yc + 1.4, yc + 4.2):
                box2(op, x - 0.45, yy - 0.4, 0.18, x + 0.45, yy + 0.4, 0.75, PAL['timber'], PT['boards'], skip=('-z',))
            for s in (-1, 1):
                for yy in (yc - 2.8, yc + 2.8):
                    beam(op, (x + s * 2.25, yy, 0.0), (x + s * 1.25, yy, 1.7), 0.16, 0.16, PAL['timber_grey'])
            e = empty(f'berth_{bi}', (x, yc, 0.75), parent=root, coll=coll)
            e['anim'] = 'building berth: small keel rests here (raise by its draft); local +Z (glTF) toward the water; max LOA ~10.5 m, beam ~3.6 m'
            berths.append(dict(name=f'berth_{bi}', origin=[round(x, 2), 0.75, round(-yc, 2)], max_loa_m=10.5, max_beam_m=3.6))
            bi += 1
    # ---------------- fitting-out quay: stone bollards, sheer legs, capstans, spars on trestles, crates, amphorae, anchor
    for x in [BX0 + 2.0 + 8.0 * k for k in range(9)]:
        bollard(op, x, YARD_FRONT + 0.6)
    SX_ = 40.0
    for s in (-1, 1):
        beam(op, (SX_ + s * 4.5, YARD_FRONT + 6.0, 0.3), (SX_, YARD_FRONT - 3.2, 23.0), 0.5, 0.5, PAL['oak_dark'])
    beam(op, (SX_, YARD_FRONT - 3.2, 23.0), (SX_, YARD_FRONT + 16.0, 0.3), 0.08, 0.08, PAL['rope'])
    box2(op, SX_ - 0.4, YARD_FRONT - 3.6, 15.0, SX_ + 0.4, YARD_FRONT - 2.8, 15.8, PAL['oak_dark'], 0)
    beam(op, (SX_, YARD_FRONT - 3.2, 15.8), (SX_, YARD_FRONT - 3.2, 23.0), 0.06, 0.06, PAL['rope'])
    for (x, y) in ((SX_ - 9, YARD_FRONT + 7.0), (SX_ + 9, YARD_FRONT + 7.0), (64.0, YARD_FRONT + 6.0)):
        cyl(op, (x, y), 0.8, 0.6, 0.0, 1.1, PAL['timber_dark'], PT['boards'], 8)
        for k in range(4):
            a = math.pi * k / 4
            beam(op, (x - 1.4 * math.cos(a), y - 1.4 * math.sin(a), 0.95), (x + 1.4 * math.cos(a), y + 1.4 * math.sin(a), 0.95), 0.12, 0.12, PAL['timber'])
    for x in (12.0, 22.0):
        box2(op, x - 0.4, YARD_FRONT + 9.0, 0.0, x + 0.4, YARD_FRONT + 10.0, 1.2, PAL['timber_dark'], 0)
    for k in range(3):
        rod(op, (8.0, YARD_FRONT + 9.2 + k * 0.6, 1.3), (28.0, YARD_FRONT + 9.2 + k * 0.6, 1.3), 0.28 - k * 0.04, PAL['timber_fresh'], 6, cap=True)
    for k, (x, y) in enumerate(((50.0, YARD_FRONT + 9.0), (51.3, YARD_FRONT + 9.0), (52.6, YARD_FRONT + 9.0), (50.6, YARD_FRONT + 10.3), (70.0, YARD_FRONT + 8.0))):
        crate(op, (x, y, 0.0), 1.2, PAL['timber'], 0.05 * k)
    for (x, y) in ((56.0, YARD_FRONT + 8.0), (56.8, YARD_FRONT + 8.6), (57.4, YARD_FRONT + 7.8), (68.0, YARD_FRONT + 9.5), (68.7, YARD_FRONT + 10.0)):
        amphora(op, (x, y, 0.0), 0.9)
    beam(op, (30.0, YARD_FRONT + 4.0, 0.25), (34.0, YARD_FRONT + 4.0, 0.25), 0.35, 0.35, PAL['iron'])   # anchor shank + arms
    beam(op, (30.0, YARD_FRONT + 2.8, 0.25), (30.0, YARD_FRONT + 5.2, 0.25), 0.3, 0.3, PAL['iron'])
    beam(op, (34.0, YARD_FRONT + 3.0, 0.4), (34.0, YARD_FRONT + 5.0, 0.4), 0.3, 0.3, PAL['oak_dark'])     # wooden stock
    # ---------------- back of the yard: the mould loft (a tiled timber hall), smithy, sawpit, timber stacks, steam chest
    MX0, MX1, MY0, MY1, MZ = -71.0, -31.0, 26.0, 38.0, 8.0
    socle(op, MX0, MY0, MX1, MY1, 0.0, 1.0)
    box2(op, MX0, MY0, 1.0, MX1, MY1, MZ, PAL['timber_grey'], PT['boards'], skip=('-z',))
    for x in [MX0 + 4.0 * k for k in range(11)]:          # oak frame posts proud of the boarding, a wall plate on top
        for y, s in ((MY0, -1), (MY1, 1)):
            box2(op, x - 0.22, y + s * 0.12 - 0.2, 1.0, x + 0.22, y + s * 0.12 + 0.2, MZ, PAL['oak_dark'], 0, skip=('-z', '+z'))
    for y, s in ((MY0, -1), (MY1, 1)):
        beam(op, (MX0 - 0.2, y + s * 0.15, MZ - 0.25), (MX1 + 0.2, y + s * 0.15, MZ - 0.25), 0.42, 0.5, PAL['oak_dark'])
    tiled_gable(op, MX0, MY0, MX1, MY1, MZ, 21.0, PAL['tile_b'], 'x', ov=0.6, end_col=PAL['timber_grey'], end_pat=PT['boards'])
    for x in [MX0 + 2.0 + 4.0 * k for k in range(10)]:
        if abs(x - (MX0 + MX1) / 2) < 3:
            continue
        plain_window(K, (x, MY0, 5.2), (0, -1, 0), 1.3, 1.2, PAL['timber_grey'], shutter=PAL['oak_dark'], reveal=0.2)
    arch_door(K, ((MX0 + MX1) / 2, MY0, 1.0), (0, -1, 0), 4.0, 5.4, PAL['oak_dark'], PAL['lime'], step=False)
    stairs(op, (MX0 + MX1) / 2 - 2.6, (MX0 + MX1) / 2 + 2.6, MY0 - 0.12, 0.0, 1.0, 3, 0.5, PAL['sandstone'])
    SXa, SXb, SYa, SYb = -26.0, -14.0, 29.0, 38.0
    socle(op, SXa, SYa, SXb, SYb, 0.0, 0.7)
    box2(op, SXa, SYa, 0.7, SXb, SYb, 5.0, PAL['stone'], PT['ashlar'], skip=('-z',))
    tiled_gable(op, SXa, SYa, SXb, SYb, 5.0, 21.0, PAL['tile_a'], 'y', ov=0.4, end_col=PAL['stone'], end_pat=PT['ashlar'])
    box2(op, SXb - 2.4, SYb - 3.0, 0.0, SXb - 0.6, SYb - 1.2, 9.5, PAL['lime_dark'], PT['ashlar'])           # forge flue
    box2(op, SXb - 2.6, SYb - 3.2, 9.5, SXb - 0.4, SYb - 1.0, 9.9, PAL['soot2'], 0)
    arch_door(K, ((SXa + SXb) / 2, SYa, 0.0), (0, -1, 0), 2.6, 3.4, PAL['shutter_green'], PAL['lime'], step=False)
    box2(em, (SXa + SXb) / 2 - 1.1, SYa - 0.02, 0.3, (SXa + SXb) / 2 + 1.1, SYa + 0.2, 1.4, PAL['iron'], 0)   # forge glow at the door
    # sawpit: pit + log on trestles
    box2(op, -9.0, 24.0, -1.6, -3.0, 26.4, 0.0, PAL['earth'], 0, skip=('+z',))
    poly(op, ((-9.0, 24.0, -1.58), (-3.0, 24.0, -1.58), (-3.0, 26.4, -1.58), (-9.0, 26.4, -1.58)), PAL['soot2'], 0, nrm=(0, 0, 1))
    for x in (-8.4, -3.6):
        box2(op, x - 0.25, 23.6, 0.0, x + 0.25, 26.8, 1.0, PAL['timber_dark'], 0)
    rod(op, (-10.0, 25.2, 1.3), (-2.0, 25.2, 1.3), 0.45, PAL['timber'], 7, cap=True)
    # timber stacks: logs + sawn planks
    for (x0, y0, n, L_) in ((6.0, 30.5, 8, 14.0), (24.0, 30.5, 7, 12.0), (44.0, 30.5, 8, 14.0), (-10.0, 31.0, 5, 10.0)):
        for row in range(3):
            for k in range(n - row):
                x = x0 + (k + row * 0.5) * 0.95
                rod(op, (x, y0, 0.45 + row * 0.8), (x, y0 + L_ * 0.5, 0.45 + row * 0.8), 0.44, PAL['timber'] if row % 2 else PAL['timber_fresh'], 6, cap=True)
    for (x0, y0) in ((62.0, 31.0), (62.0, 35.5)):
        for row in range(4):
            box2(op, x0, y0, row * 0.42, x0 + 10.0, y0 + 3.2, row * 0.42 + 0.3, PAL['timber_fresh'], PT['planks_x'], skip=('-z',))
            for x in (x0 + 0.5, x0 + 5.0, x0 + 9.5):
                box2(op, x - 0.12, y0 - 0.1, row * 0.42 + 0.3, x + 0.12, y0 + 3.3, row * 0.42 + 0.42, PAL['timber_dark'], 0, skip=('-z',))
    # steam chest for bending planks, fed by a bronze cauldron on a stone hearth
    box2(op, 30.0, 36.0, 0.8, 46.0, 37.4, 2.0, PAL['timber_dark'], PT['boards'])
    for x in (31.0, 45.0):
        box2(op, x - 0.3, 35.8, 0.0, x + 0.3, 37.6, 0.8, PAL['sandstone'], 0)
    box2(op, 36.8, 37.6, 0.0, 39.2, 39.8, 0.8, PAL['sandstone'], PT['ashlar'])
    cyl(op, (38.0, 38.7), 0.75, 0.95, 0.8, 1.9, PAL['bronze'], PT['metal'], 8)
    # lamp columns along the quay
    for x in (8.0, 26.0, 52.0, 70.0):
        lamp_column(K, x, YARD_FRONT + 2.2)
    K.emit(root, 'shipyard_body', coll)
    return root, dict(slips=slips, berths=berths, ground_y=0.0, quay_wall_to_y=-4.6, sea_level_y=-2.4,
                      fitting_out_quay=dict(edge_z=round(-YARD_FRONT, 2), x=[BX0, 75.0]),
                      cranes=[dict(name=c.name, origin=[round(c.location.x, 2), 0.0, round(-c.location.y, 2)], slips=list(c['span_slips']),
                                   wheel=f'{c.name}_wheel', wheel_radius_m=WHEEL_R)
                              for c in cranes])


# =================================================================== hull construction stages (medium corbita, 13 m)
def build_hull_stages(coll=None):
    """keel_only / ribs / planked / painted: four alternatives of one medium hull (13 m LOA) on the ancient corbita form
    (hulls/hb_ancient.py: the usd medium), origin midships on the waterline, +x bow (kit convention). The runtime scales
    to the coin's class and shows one stage. The stern rises into the corbita's swan neck as she grows."""
    root = empty('hull_stages', coll=coll)
    L = 13.0
    H = Hull(L, ANCIENT_FORMS['corbita'])
    tim, dark, fresh = PAL['timber'], PAL['timber_dark'], PAL['timber_fresh']
    us = [-0.88 + 1.76 * k / 10 for k in range(11)]
    st0 = H.stern() + Vector((0.01 * L, 0, -0.02 * L))     # where hb_ancient.AncientRig.swan_neck starts
    NECK = arc(st0, 0.08 * L, 235, n=6)

    def neck(mb, col, upto=6, head=True):
        chain(mb, NECK[:upto], 0.016 * L + 0.03, 0.009 * L + 0.02 + (0.007 * L) * (6 - upto) / 5, col, 5)
        if head and upto == 6:
            e = NECK[-1]; d = (NECK[-1] - NECK[-2]).normalized()
            box(mb, e + d * 0.02 * L, (0.06 * L, 0.025 * L, 0.025 * L), col, axes=(d, Vector((0, 1, 0)), d.cross(Vector((0, 1, 0)))))

    def backbone(mb):
        zk0 = H.zk(0.0)
        xs, xb = H.x(-1.0, H.zk(-1.0)), H.x(1.0, H.zk(1.0))
        beam(mb, (xs, 0, H.zk(-1.0) - 0.12), (xb, 0, H.zk(1.0) - 0.12), 0.32, 0.36, dark)          # keel
        pts = [Vector((H.x(1.0, z), 0, z)) for z in [H.zk(1.0) + (H.zt(1.0) + 0.3 - H.zk(1.0)) * k / 5 for k in range(6)]]
        for a, b in zip(pts[:-1], pts[1:]):
            beam(mb, a, b, 0.3, 0.32, dark, up=Vector((1, 0, 0)))                                   # stem
        a = Vector((H.x(-1.0, H.zk(-1.0)), 0, H.zk(-1.0)))
        beam(mb, a, NECK[0], 0.3, 0.32, dark, up=Vector((1, 0, 0)))                                 # sternpost
        return zk0

    def frame_pts(u):
        pr = H.profile(u)
        side = [(H.x(u, z), y, z) for (nm, y, z) in pr if nm not in ('deck_in',)]
        port = [Vector(p) for p in side]
        stbd = [Vector((p[0], -p[1], p[2])) for p in side]
        return port, stbd

    def steering_oars(mb, col):
        u = -0.78
        x = H.x(u, H.zt(u)); w = H.w(u); zt = H.zt(u)
        for sd in (-1, 1):
            a = Vector((x + 0.02 * L, sd * (w + 0.04), zt + 0.08))
            b = Vector((x - 0.11 * L, sd * (w + 0.22), -H.dr * 0.4))
            rod(mb, a, b, 0.065, col, 4)
            d = (b - a).normalized(); y = Vector((0, 1, 0)); wv = d.cross(y).normalized()
            box(mb, b - d * 0.045 * L, (0.11 * L, 0.035, 0.03 * L + 0.1), col, axes=(d, y, wv))

    # keel_only: the backbone laid and the floors going on (a ship begun, not a row of stakes): a deep keel with its hog,
    # a tall stem and the sternpost curving up toward the swan neck, seven floor timbers with their first futtocks, the shores
    mb = MB(400)
    zkb, zks = H.zk(1.0), H.zk(-1.0)
    xs, xb = H.x(-1.0, zks), H.x(1.0, zkb)
    gz = H.zk(0.0) - 0.3 - 0.79                       # the berth floor in this frame (blocks 0.63 m at the berth scale 0.8)
    beam(mb, (xs - 0.25, 0, zks - 0.05), (xb + 0.25, 0, zkb - 0.05), 0.5, 0.54, dark)              # keel
    beam(mb, (xs + 0.5, 0, zks + 0.3), (xb - 0.6, 0, zkb + 0.3), 0.34, 0.2, tim)                   # hog
    st = [Vector((H.x(1.0, z) + 0.15, 0, z)) for z in [zkb + (H.zt(1.0) + 0.9 - zkb) * k / 6 for k in range(7)]]
    for a, b in zip(st[:-1], st[1:]):
        beam(mb, a, b, 0.46, 0.5, dark, up=Vector((1, 0, 0)))                                       # stem
    sa = Vector((xs - 0.1, 0, zks))
    beam(mb, sa, NECK[0], 0.46, 0.5, dark, up=Vector((1, 0, 0)))                                    # sternpost
    chain(mb, NECK[:3], 0.26, 0.2, dark, 5)                                                         # ... curving up aft
    beam(mb, (H.x(0.72, H.zk(0.72)), 0, H.zk(0.72) + 0.25), st[2], 0.4, 0.42, tim)                 # stemson / apron knee
    beam(mb, (H.x(-0.7, H.zk(-0.7)), 0, H.zk(-0.7) + 0.25), sa.lerp(NECK[0], 0.45), 0.4, 0.42, tim)  # stern knee
    for u in [-0.7 + 1.4 * k / 10 for k in range(11)]:   # floors + first futtocks, fresh-sawn so they read from the camera
        port, stbd = frame_pts(u)
        a, b = port[-2] + Vector((0, 0, 0.12)), stbd[-2] + Vector((0, 0, 0.12))
        beam(mb, a, b, 0.3, 0.36, fresh)
        for side in (port, stbd):
            p0, p1 = side[-2] + Vector((0, 0, 0.12)), side[-3]
            rod(mb, p0, p0.lerp(p1, 0.95), 0.2, fresh, 4, smooth=False)
    for (p, q) in ((st[-2], Vector((xb + 2.6, 0, gz))), (NECK[2], Vector((xs - 2.4, 0, gz)))):
        beam(mb, p, q, 0.18, 0.18, PAL['timber_grey'])                                             # end shores
    for u in (-0.33, 0.33):
        port, stbd = frame_pts(u)
        for side, sg in ((port, 1), (stbd, -1)):
            top = side[-2].lerp(side[-3], 0.85)
            beam(mb, top, Vector((top.x, sg * (H.B / 2 + 1.1), gz)), 0.16, 0.16, PAL['timber_grey'])  # side shores
    to_object(mb, 'keel_only', 'hb_opaque', parent=root, coll=coll)
    # ribs: the frames up, ribbands sprung round them, the swan neck stepped, the garboard strakes on (the hull's shape reads)
    mb = MB(401)
    backbone(mb)
    n0 = len(mb.f)
    loft(mb, H, SCH(bottom=mix(fresh, tim, 0.5)), 9, band=True, hole=lambda c, nm: nm != 'bottom', paint=False)
    mb.backface(n0, dark=0.55)
    for f in mb.f[n0:]:
        f['brand'] = 0.0
    neck(mb, dark, head=False)
    for u in us:
        port, stbd = frame_pts(u)
        for side in (port, stbd):
            for a, b in zip(side[:-1], side[1:]):
                rod(mb, a, b, 0.12, fresh, 4, smooth=False)
        beam(mb, port[0] + Vector((0, 0, -0.15)), stbd[0] + Vector((0, 0, -0.15)), 0.14, 0.16, fresh)   # cross spall
    for frac in (0.25, 0.7):       # ribbands
        for sgn in (1, -1):
            pts = []
            for u in us:
                port, _ = frame_pts(u)
                k = int(frac * (len(port) - 1))
                p = port[k].lerp(port[k + 1], 0.5)
                pts.append(Vector((p.x, sgn * (p.y + 0.06), p.z)))
            for a, b in zip(pts[:-1], pts[1:]):
                beam(mb, a, b, 0.12, 0.2, fresh)
    to_object(mb, 'ribs', 'hb_opaque', parent=root, coll=coll)
    # planked (fresh timber, the painted wale not yet on, deck open over the beams)
    mb = MB(402)
    sch = SCH(top=fresh, band=tim, stripe=tim, cap=tim, boot=mix(fresh, tim, 0.4), bottom=tim, deck_in=tim, transom=fresh)
    n0 = len(mb.f)
    loft(mb, H, sch, 9, band=True, hole=lambda c, nm: nm == 'deck' or (nm in ('top', 'stripe', 'cap') and c.x > 0.3 * L and c.z > H.fb * 0.75),
         pat_top=PT['strakes'], paint=False)
    mb.backface(n0, dark=0.55)
    for f in mb.f:
        f['brand'] = 0.0
    for u in us[1:-1]:
        x = H.x(u, H.fb)
        beam(mb, (x, -H.w(u) + 0.15, H.deck(x) - 0.12), (x, H.w(u) - 0.15, H.deck(x) - 0.12), 0.18, 0.18, tim)
    neck(mb, tim)
    to_object(mb, 'planked', 'hb_opaque', parent=root, coll=coll)
    # painted (no rig): the usd corbita's scheme with the kit livery regions (_PAINT, _BRAND boot-top) so the runtime can
    # paint the coin's colours; swan neck, steering oars, the stern house and the hatch, mast partners only
    mb = MB(403)
    sch = ASCH(band='ochre_red', stripe='ochre_yel')
    loft(mb, H, sch, 9, band=True)
    neck(mb, sch['spar'])
    steering_oars(mb, sch['spar'])
    st_ = H.stern()
    x0h, x1h = st_.x + 0.09 * L, st_.x + 0.23 * L
    zh = H.deck((x0h + x1h) / 2)
    wh = min(H.half(x0h), H.half(x1h)) * 2 * 0.68
    box2(mb, x0h, -wh / 2, zh - 0.1, x1h, wh / 2, zh + 0.8, sch['house'], PT['boards'], skip=('-z',))
    mb.paint = 7.0
    box2(mb, x0h - 0.04, -wh / 2 - 0.04, zh + 0.8, x1h + 0.04, wh / 2 + 0.04, zh + 0.95, sch['roof'], PT['planks_y'], skip=('-z',))
    mb.paint = 0.0
    xh = H.x0 + 0.12 * L
    box2(mb, xh - 0.45 * L * 0.07 * 2, -H.B * 0.2, H.deck(xh) - 0.05, xh + 0.45 * L * 0.07 * 2, H.B * 0.2, H.deck(xh) + 0.3, PAL['timber'], PT['boards'],
         skip=('-z',))
    xm = H.x0 + 0.02 * L
    cyl(mb, (xm, 0), 0.3, 0.28, H.deck(xm) - 0.1, H.deck(xm) + 0.25, PAL['timber_dark'], 0, 8)   # mast partners, no mast
    to_object(mb, 'painted', 'hb_opaque', parent=root, coll=coll)
    return root, dict(loa_m=L, beam_m=round(H.B, 2), keel_bottom_y=round(H.zk(0.0) - 0.3, 3), freeboard_m=round(H.fb, 2))
