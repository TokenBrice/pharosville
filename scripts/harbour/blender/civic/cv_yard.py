"""Harbour civic kit - the Shipyard (6 slipways + 37 building berths) and the hull construction stages."""
import math, random
from mathutils import Vector
from cv_lib import *
import hb_hulls
from hb_hulls import Hull, FORMS, loft, SCH

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


def quay_strip(op, x0, x1, y0, y1, top=None, pat=PT['cobble'], wall_front=True, slip_walls=()):
    poly(op, ((x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)), top or PAL['gravel'], pat, nrm=(0, 0, 1))
    if wall_front:
        poly(op, ((x0, y0, -4.6), (x1, y0, -4.6), (x1, y0, 0), (x0, y0, 0)), PAL['granite'], PT['ashlar'], nrm=(0, -1, 0))
        box2(op, x0, y0 - 0.1, -0.05, x1, y0 + 0.9, 0.35, PAL['granite_light'], PT['ashlar'])    # coping
    for (x, s) in slip_walls:   # trench wall facing into the slip
        poly(op, ((x, y0, bed(y0) - 0.4), (x, y1, bed(y1) - 0.4), (x, y1, 0), (x, y0, 0)), PAL['granite'], PT['ashlar'], nrm=(s, 0, 0))


def bollard(op, x, y):
    cyl(op, (x, y), 0.32, 0.26, 0.3, 1.2, PAL['iron'], PT['metal'], 7)
    cyl(op, (x, y), 0.38, 0.38, 1.2, 1.38, PAL['iron'], PT['metal'], 7)


def truss_shed(K, x0, x1, nb, yc, half, h=6.0, rise=3.2, lamps=()):
    """Open-sided shed over a row of berths, kept skeletal so the keels underneath read from a 30-38 deg camera: posts on every
    berth boundary, a king-post truss on every other one, three purlins and a narrow tarred ridge capping."""
    op = K.op
    tim, dark = PAL['timber_grey'], PAL['timber_dark']
    xs = [x0 + (x1 - x0) * j / nb for j in range(nb + 1)]
    for j, x in enumerate(xs):
        for s in (-1, 1):
            box2(op, x - 0.17, yc + s * half - 0.17, 0.0, x + 0.17, yc + s * half + 0.17, h, dark, 0, skip=('-z', '+z'))
        if j % 2 == 0 or j == nb:
            beam(op, (x, yc - half - 0.4, h + 0.1), (x, yc + half + 0.4, h + 0.1), 0.2, 0.24, tim)          # tie beam
            for s in (-1, 1):
                beam(op, (x, yc + s * (half + 0.6), h), (x, yc, h + rise), 0.18, 0.22, tim)                # rafters
            box2(op, x - 0.1, yc - 0.1, h + 0.2, x + 0.1, yc + 0.1, h + rise, tim, 0, skip=('-z', '+z'))   # king post
        if j in lamps:
            box2(K.em, x - 0.2, yc - half - 0.45, h - 2.0, x + 0.2, yc - half - 0.05, h - 1.5, PAL['iron'], 0)
    for (yy, zz) in ((yc - half, h + 0.2), (yc + half, h + 0.2), (yc, h + rise + 0.1)):
        beam(op, (x0 - 0.5, yy, zz), (x1 + 0.5, yy, zz), 0.2, 0.26, PAL['hull_red'] if zz < h + 1 else tim)    # eave plates + ridge
    for s in (-1, 1):
        poly(op, ((x0 - 0.6, yc, h + rise + 0.35), (x1 + 0.6, yc, h + rise + 0.35), (x1 + 0.6, yc + s * 0.7, h + rise - 0.05),
                  (x0 - 0.6, yc + s * 0.7, h + rise - 0.05)), PAL['tar'], PT['boards'], nrm=(0, s, 1))
    return xs


def gantry(root, i, xl, xr, y, coll=None):
    """Timber gantry crane straddling two slips: A-frame legs on rails, red girder truss, trolley + hook. Origin ground centre."""
    mb = MB(300 + i)
    H = 19.0
    xc = (xl + xr) / 2
    dark, red = PAL['timber_dark'], PAL['hull_red']
    for x in (xl, xr):
        for s in (-1, 1):
            beam(mb, (x, y + s * 3.6, 0.6), (x, y + s * 0.5, H), 0.55, 0.55, dark)
        for z in (5.0, 10.5):
            w_ = 3.6 - (3.1) * z / H
            beam(mb, (x, y - w_, z), (x, y + w_, z), 0.3, 0.3, dark)
        beam(mb, (x, y - 3.2, 5.0), (x, y + 1.9, 10.5), 0.22, 0.22, dark)
        beam(mb, (x, y + 3.2, 5.0), (x, y - 1.9, 10.5), 0.22, 0.22, dark)
        box2(mb, x - 0.6, y - 4.4, 0.0, x + 0.6, y - 2.8, 0.8, PAL['iron'], PT['metal'])     # bogies
        box2(mb, x - 0.6, y + 2.8, 0.0, x + 0.6, y + 4.4, 0.8, PAL['iron'], PT['metal'])
        box2(mb, x - 0.9, y - 1.0, H - 0.2, x + 0.9, y + 1.0, H + 0.6, dark, 0)
    # girder: top/bottom chords + verticals + diagonals
    zb, zt = H + 0.6, H + 2.8
    for s in (-1, 1):
        beam(mb, (xl - 0.9, y + s * 0.7, zb), (xr + 0.9, y + s * 0.7, zb), 0.35, 0.45, red)
        beam(mb, (xl - 0.9, y + s * 0.7, zt), (xr + 0.9, y + s * 0.7, zt), 0.35, 0.45, red)
        n = 8
        for k in range(n + 1):
            x = xl + (xr - xl) * k / n
            beam(mb, (x, y + s * 0.7, zb), (x, y + s * 0.7, zt), 0.2, 0.2, red)
            if k < n:
                x2 = xl + (xr - xl) * (k + 1) / n
                beam(mb, (x, y + s * 0.7, zb) if k % 2 == 0 else (x, y + s * 0.7, zt), (x2, y + s * 0.7, zt) if k % 2 == 0 else (x2, y + s * 0.7, zb),
                     0.16, 0.16, red)
    poly(mb, ((xl - 0.9, y - 0.9, zt + 0.23), (xr + 0.9, y - 0.9, zt + 0.23), (xr + 0.9, y + 0.9, zt + 0.23), (xl - 0.9, y + 0.9, zt + 0.23)),
         PAL['timber_grey'], PT['planks_x'], nrm=(0, 0, 1))
    # trolley, falls and hook block
    tx = xc - 3.0
    box2(mb, tx - 1.2, y - 1.2, zb - 1.0, tx + 1.2, y + 1.2, zb, PAL['iron'], PT['metal'])
    for s in (-0.25, 0.25):
        box2(mb, tx + s - 0.03, y - 0.03, H - 6.0, tx + s + 0.03, y + 0.03, zb - 1.0, PAL['tar'], 0, skip=('-z', '+z'))
    box2(mb, tx - 0.4, y - 0.3, H - 7.0, tx + 0.4, y + 0.3, H - 6.0, PAL['iron'], PT['metal'])
    beam(mb, (tx, y, H - 7.0), (tx + 0.35, y, H - 7.8), 0.12, 0.12, PAL['iron'])
    ob = to_object(mb, f'crane_{i}', 'hb_opaque', parent=root, origin=(xc, y, 0.0), coll=coll)
    ob['anim'] = 'gantry crane: may travel along local Z (glTF; rails run front-back, +/-18 m) over its two slips; trolley is baked'
    ob['span_slips'] = [2 * i, 2 * i + 1]
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
             PAL['granite'], PT['ashlar'], nrm=(0, -1, 0))
    quay_strip(op, BX0 - 0.5, 75.0, -27.0, 40.0, PAL['gravel'], PT['cobble'], wall_front=False)
    quay_strip(op, BX0 - 0.5, 75.0, YARD_FRONT, -27.0, PAL['quay'], PT['cobble'])
    box2(op, 74.6, YARD_FRONT, -4.6, 75.0, 40.0, 0.0, PAL['granite'], PT['ashlar'], skip=('+z', '-z', '-x'))
    # ---------------- six slipways
    slips = []
    for i, c in enumerate(SLIP_X):
        y0, y1 = SLIP_TOE, SLIP_HEAD
        poly(op, ((c - SLIP_HALF, y0, bed(y0) - 0.4), (c + SLIP_HALF, y0, bed(y0) - 0.4), (c + SLIP_HALF, y1, -0.4), (c - SLIP_HALF, y1, -0.4)),
             PAL['timber_grey'], PT['planks_y'], nrm=(0, 0, 1))
        # cross sleepers + two standing ways + keel blocks
        y = y1 - 1.0
        while y > y0 + 1.0:
            beam(op, (c - SLIP_HALF + 0.3, y, bed(y) - 0.25), (c + SLIP_HALF - 0.3, y, bed(y) - 0.25), 0.45, 0.3, PAL['timber_dark'])
            y -= 5.6
        for s in (-1, 1):
            beam(op, (c + s * 1.7, y1 - 0.5, bed(y1 - 0.5) + 0.05), (c + s * 1.7, y0 + 0.5, bed(y0 + 0.5) + 0.05), 0.55, 0.32, PAL['tar'])
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
        cyl(op, (x, SLIP_HEAD - 1.0), 0.13, 0.1, 0.0, 4.0, PAL['iron'], PT['metal'], 6)
        box2(em, x - 0.22, SLIP_HEAD - 1.22, 4.0, x + 0.22, SLIP_HEAD - 0.78, 4.6, PAL['iron'], 0)
    # rails for the gantry cranes on the strips + three gantries
    rails = [-73.25, SLIP_X[1] + 6.25, SLIP_X[3] + 6.25, SLIP_X[5] + 6.0]
    for x in rails:
        for s in (-1, 1):
            beam(op, (x + s * 0.5, YARD_FRONT + 1.0, 0.06), (x + s * 0.5, SLIP_HEAD + 6.0, 0.06), 0.3, 0.14, PAL['iron'])
    cranes = [gantry(root, i, rails[i], rails[i + 1], REST_Y + (2.0 if i == 1 else -2.0), coll) for i in range(3)]
    # ---------------- the berth field: three open sheds, 37 building berths
    berths = []
    bi = 0
    for (yc, n) in ROWS:
        xs = truss_shed(K, BX0, BX1, n, yc, ROW_HALF, lamps=(0, n // 2, n))
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
    # ---------------- fitting-out quay: bollards, sheerlegs, capstans, spars on trestles, crates, anchor
    for x in [BX0 + 2.0 + 8.0 * k for k in range(9)]:
        bollard(op, x, YARD_FRONT + 0.6)
    SX_ = 40.0
    for s in (-1, 1):
        beam(op, (SX_ + s * 4.5, YARD_FRONT + 6.0, 0.3), (SX_, YARD_FRONT - 3.2, 23.0), 0.5, 0.5, PAL['timber_dark'])
    beam(op, (SX_, YARD_FRONT - 3.2, 23.0), (SX_, YARD_FRONT + 16.0, 0.3), 0.08, 0.08, PAL['tar'])
    box2(op, SX_ - 0.4, YARD_FRONT - 3.6, 15.0, SX_ + 0.4, YARD_FRONT - 2.8, 15.8, PAL['iron'], PT['metal'])
    beam(op, (SX_, YARD_FRONT - 3.2, 15.8), (SX_, YARD_FRONT - 3.2, 23.0), 0.06, 0.06, PAL['tar'])
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
    for (x, y) in ((56.0, YARD_FRONT + 8.0), (57.0, YARD_FRONT + 8.8), (68.0, YARD_FRONT + 9.5)):
        barrel(op, (x, y, 0.0))
    beam(op, (30.0, YARD_FRONT + 4.0, 0.25), (34.0, YARD_FRONT + 4.0, 0.25), 0.35, 0.35, PAL['iron'])   # anchor shank + arms
    beam(op, (30.0, YARD_FRONT + 2.8, 0.25), (30.0, YARD_FRONT + 5.2, 0.25), 0.3, 0.3, PAL['iron'])
    # ---------------- back of the yard: mould loft, smithy, sawpit, timber stacks, steam box
    MX0, MX1, MY0, MY1, MZ = -71.0, -31.0, 26.0, 38.0, 8.5
    box2(op, MX0, MY0, 0.0, MX1, MY1, MZ, PAL['timber_grey'], PT['boards'])
    box2(op, MX0 - 0.2, MY0 - 0.2, 0.0, MX1 + 0.2, MY1 + 0.2, 1.0, PAL['granite'], PT['ashlar'])
    gable_roof(op, MX0, MY0, MX1, MY1, MZ, 5.0, PAL['slate'], PT['slate'], ov=0.6, end_col=PAL['timber_grey'], end_pat=PT['boards'])
    for x in [MX0 + 3 + 4.2 * k for k in range(9)]:
        if abs(x - (MX0 + MX1) / 2) < 3:
            continue
        window(K, (x, MY0, 5.6), (0, -1, 0), 1.6, 1.4, frame=PAL['trim'])
    door(K, ((MX0 + MX1) / 2, MY0, 0.0), (0, -1, 0), 4.6, 5.0, col=PAL['door_red'])
    for x in (-62.0, -51.0, -40.0):   # roof dormer vents
        box2(op, x - 1.4, (MY0 + MY1) / 2 - 1.0, MZ + 3.4, x + 1.4, (MY0 + MY1) / 2 + 1.0, MZ + 5.4, PAL['timber_grey'], PT['boards'])
        gable_roof(op, x - 1.4, (MY0 + MY1) / 2 - 1.0, x + 1.4, (MY0 + MY1) / 2 + 1.0, MZ + 5.4, 0.9, PAL['slate'], PT['slate'], ov=0.2, axis='y',
                   end_col=PAL['timber_grey'])
    SXa, SXb, SYa, SYb = -26.0, -14.0, 29.0, 38.0
    box2(op, SXa, SYa, 0.0, SXb, SYb, 5.0, PAL['stone'], PT['ashlar'])
    gable_roof(op, SXa, SYa, SXb, SYb, 5.0, 3.0, PAL['roof_red'], PT['tiles'], ov=0.4, axis='y', end_col=PAL['stone'])
    box2(op, SXb - 2.4, SYb - 3.0, 0.0, SXb - 0.6, SYb - 1.2, 10.5, PAL['brick'], PT['ashlar'])
    box2(op, SXb - 2.6, SYb - 3.2, 10.5, SXb - 0.4, SYb - 1.0, 11.0, PAL['soot2'], 0)
    door(K, ((SXa + SXb) / 2, SYa, 0.0), (0, -1, 0), 2.6, 3.0, col=PAL['door_green'])
    box2(em, (SXa + SXb) / 2 - 1.3, SYa - 0.02, 0.3, (SXa + SXb) / 2 + 1.3, SYa + 0.2, 1.4, PAL['iron'], 0)   # forge glow at the door
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
    # steam box for bending planks
    box2(op, 30.0, 36.0, 0.8, 46.0, 37.4, 2.0, PAL['timber_dark'], PT['boards'])
    for x in (31.0, 45.0):
        box2(op, x - 0.3, 35.8, 0.0, x + 0.3, 37.6, 0.8, PAL['granite'], 0)
    cyl(op, (38.0, 38.6), 0.9, 0.9, 0.0, 1.6, PAL['iron'], PT['metal'], 8)
    cyl(op, (38.0, 38.6), 0.18, 0.18, 1.6, 4.5, PAL['iron'], PT['metal'], 6)
    # lamp posts along the quay
    for x in (8.0, 26.0, 52.0, 70.0):
        cyl(op, (x, YARD_FRONT + 2.2), 0.13, 0.1, 0.0, 4.0, PAL['iron'], PT['metal'], 6)
        box2(em, x - 0.22, YARD_FRONT + 1.98, 4.0, x + 0.22, YARD_FRONT + 2.42, 4.6, PAL['iron'], 0)
        box2(op, x - 0.3, YARD_FRONT + 1.9, 4.6, x + 0.3, YARD_FRONT + 2.5, 4.75, PAL['iron'], PT['metal'])
    K.emit(root, 'shipyard_body', coll)
    return root, dict(slips=slips, berths=berths, ground_y=0.0, quay_wall_to_y=-4.6, sea_level_y=-2.4,
                      fitting_out_quay=dict(edge_z=round(-YARD_FRONT, 2), x=[BX0, 75.0]),
                      cranes=[dict(name=c.name, origin=[round(c.location.x, 2), 0.0, round(-c.location.y, 2)], slips=list(c['span_slips']))
                              for c in cranes])


# =================================================================== hull construction stages (medium hull, 13 m)
def build_hull_stages(coll=None):
    """keel_only / ribs / planked / painted: four alternatives of one medium hull (13 m LOA), origin midships on the waterline,
    +x bow (kit convention). The runtime scales to the coin's class and shows one stage."""
    root = empty('hull_stages', coll=coll)
    L = 13.0
    H = Hull(L, FORMS['schooner'])
    tim, dark, fresh = PAL['timber'], PAL['timber_dark'], PAL['timber_fresh']
    us = [-0.88 + 1.76 * k / 10 for k in range(11)]

    def backbone(mb):
        zk0 = H.zk(0.0)
        xs, xb = H.x(-1.0, H.zk(-1.0)), H.x(1.0, H.zk(1.0))
        beam(mb, (xs, 0, H.zk(-1.0) - 0.12), (xb, 0, H.zk(1.0) - 0.12), 0.32, 0.36, dark)          # keel
        pts = [Vector((H.x(1.0, z), 0, z)) for z in [H.zk(1.0) + (H.zt(1.0) + 0.3 - H.zk(1.0)) * k / 5 for k in range(6)]]
        for a, b in zip(pts[:-1], pts[1:]):
            beam(mb, a, b, 0.3, 0.32, dark, up=Vector((1, 0, 0)))                                   # stem
        a, b = Vector((H.x(-1.0, H.zk(-1.0)), 0, H.zk(-1.0))), Vector((H.x(-1.0, H.zt(-1.0)), 0, H.zt(-1.0) + 0.25))
        beam(mb, a, b, 0.3, 0.32, dark, up=Vector((1, 0, 0)))                                       # sternpost
        return zk0

    def frame_pts(u):
        pr = H.profile(u)
        side = [(H.x(u, z), y, z) for (nm, y, z) in pr if nm not in ('deck_in',)]
        port = [Vector(p) for p in side]
        stbd = [Vector((p[0], -p[1], p[2])) for p in side]
        return port, stbd

    # keel_only
    mb = MB(400)
    backbone(mb)
    for u in (-0.5, 0.0, 0.5):     # first floors on the keel
        port, stbd = frame_pts(u)
        beam(mb, (port[-2].x, port[-2].y, port[-2].z), (stbd[-2].x, stbd[-2].y, stbd[-2].z), 0.2, 0.2, tim)
    to_object(mb, 'keel_only', 'hb_opaque', parent=root, coll=coll)
    # ribs
    mb = MB(401)
    backbone(mb)
    for u in us:
        port, stbd = frame_pts(u)
        for side in (port, stbd):
            for a, b in zip(side[:-1], side[1:]):
                rod(mb, a, b, 0.085, tim, 4, smooth=False)
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
    # planked (fresh timber, deck open over the beams)
    mb = MB(402)
    sch = SCH(top=fresh, band=fresh, stripe=tim, cap=tim, boot=mix(fresh, tim, 0.4), bottom=tim, deck_in=tim, transom=fresh)
    n0 = len(mb.f)
    loft(mb, H, sch, 9, hole=lambda c, nm: nm == 'deck' or (nm in ('top', 'stripe', 'cap') and c.x > 0.3 * L and c.z > H.fb * 0.75),
         pat_top=PT['strakes'], paint=False)
    mb.backface(n0, dark=0.55)
    for f in mb.f:
        f['brand'] = 0.0
    for u in us[1:-1]:
        x = H.x(u, H.fb)
        beam(mb, (x, -H.w(u) + 0.15, H.deck(x) - 0.12), (x, H.w(u) - 0.15, H.deck(x) - 0.12), 0.18, 0.18, tim)
    to_object(mb, 'planked', 'hb_opaque', parent=root, coll=coll)
    # painted (no rig): kit livery regions (_PAINT, _BRAND boot-top) so the runtime can paint the coin's colours
    mb = MB(403)
    sch = SCH(top='hull_black', stripe='gilt', cap='varnish', deck_in='hull_white', transom='hull_black')
    loft(mb, H, sch, 9, band=False)
    xh = H.x0 - 0.1 * L
    box2(mb, xh - 0.9, -0.7, H.deck(xh) - 0.05, xh + 0.9, 0.7, H.deck(xh) + 0.4, PAL['varnish'], 0, skip=('-z',))
    for xm in (H.x0 + 0.18 * L, H.x0 - 0.22 * L):     # mast partners, no masts
        cyl(mb, (xm, 0), 0.32, 0.3, H.deck(xm) - 0.1, H.deck(xm) + 0.25, PAL['varnish'], 0, 8)
    to_object(mb, 'painted', 'hb_opaque', parent=root, coll=coll)
    return root, dict(loa_m=L, beam_m=round(H.B, 2), keel_bottom_y=round(H.zk(0.0) - 0.3, 3), freeboard_m=round(H.fb, 2))
