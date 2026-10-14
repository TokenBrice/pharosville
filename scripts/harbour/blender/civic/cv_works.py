"""Harbour civic kit - the Mint (coin works) and the Burn (furnace on a rocky point)."""
import math, random
from mathutils import Vector
from cv_lib import *

Z0 = 0.4     # plot ground (plinth top) above the plot origin


# =================================================================== THE MINT  64 x 44
def ingot_stack(mb, c, nx, ny, layers, col=None):
    col = col or PAL['gold']
    bx, by, bz = 0.95, 0.46, 0.28
    c = Vector(c)
    box2(mb, c.x - nx * bx / 2 - 0.15, c.y - ny * by / 2 - 0.15, c.z, c.x + nx * bx / 2 + 0.15, c.y + ny * by / 2 + 0.15, c.z + 0.22,
         PAL['timber'], PT['planks_x'], skip=('-z',))
    z = c.z + 0.22
    for L in range(layers):
        mx, my = nx - L, ny - L
        if mx < 1 or my < 1:
            break
        for i in range(mx):
            for j in range(my):
                x = c.x + (i - (mx - 1) / 2) * bx; y = c.y + (j - (my - 1) / 2) * by
                box2(mb, x - bx * 0.45, y - by * 0.42, z, x + bx * 0.45, y + by * 0.42, z + bz, mul(col, 1 + 0.06 * ((i + j + L) % 3 - 1)),
                     PT['metal'], skip=('-z',), jitter=0.0)
        z += bz


def coin_crate(mb, c, rz=0.0):
    crate(mb, c, 1.1, PAL['timber_dark'], rz)
    c = Vector(c)
    cyl(mb, (c.x, c.y), 0.48, 0.2, c.z + 1.1, c.z + 1.42, PAL['gold'], PT['metal'], 7)


def press_frame(mb, xc, yc):
    box2(mb, xc - 1.1, yc - 1.1, Z0, xc + 1.1, yc + 1.1, Z0 + 1.0, PAL['granite_light'], PT['ashlar'])
    for s in (-1, 1):
        box2(mb, xc + s * 0.95 - 0.22, yc - 0.3, Z0 + 1.0, xc + s * 0.95 + 0.22, yc + 0.3, Z0 + 4.4, PAL['iron'], PT['metal'])
    # the "bow": a heavy arched crosshead
    beam(mb, (xc - 1.3, yc, Z0 + 4.6), (xc, yc, Z0 + 5.2), 0.75, 0.55, PAL['iron'], PT['metal'])
    beam(mb, (xc, yc, Z0 + 5.2), (xc + 1.3, yc, Z0 + 4.6), 0.75, 0.55, PAL['iron'], PT['metal'])
    box2(mb, xc - 0.5, yc - 0.5, Z0 + 1.0, xc + 0.5, yc + 0.5, Z0 + 1.45, PAL['brass'], PT['metal'])   # anvil die


def press_ram(K, root, i, xc, yc, coll=None):
    """Moving part of a coining screw press: spindle + fly-bar with weighted balls + ram. Origin at the screw (fly-bar height)."""
    mb = MB(100 + i)
    zf = Z0 + 5.9
    o = Vector((xc, yc, zf))
    cyl(mb, (xc, yc), 0.2, 0.2, Z0 + 1.75, zf + 0.9, PAL['brass'], PT['metal'], 6)
    box2(mb, xc - 0.42, yc - 0.42, Z0 + 1.55, xc + 0.42, yc + 0.42, Z0 + 2.05, PAL['iron'], PT['metal'])
    beam(mb, (xc - 2.7, yc, zf), (xc + 2.7, yc, zf), 0.2, 0.2, PAL['iron'], PT['metal'])
    for s in (-1, 1):
        sphere(mb, (xc + s * 2.9, yc, zf), 0.48, PAL['iron'], 8, 4, PT['metal'])
    ob = to_object(mb, f'press_{i}', 'hb_opaque', parent=root, origin=o, coll=coll)
    ob['anim'] = 'screw press: rotate about local +Y (glTF) +/-0.7 rad and drop 0.3 m on each strike; rate ~ mint volume'
    return ob


def build_mint(coll=None):
    root = empty('mint', coll=coll)
    K = Kit(11)
    op, em = K.op, K.em
    rng = random.Random(4)
    # ---- plinth with the millrace cut out
    box2(op, -32, -22, Z0 - 2.6, 32, 22, Z0, PAL['granite'], PT['ashlar'], skip=('+z', '-z'))
    RY0, RY1, RZ = 1.6, 4.8, Z0 - 1.6
    for (x0, y0, x1, y1) in ((-32, -22, 9.4, 22), (9.4, -22, 32, RY0), (9.4, RY1, 32, 22)):
        poly(op, ((x0, y0, Z0), (x1, y0, Z0), (x1, y1, Z0), (x0, y1, Z0)), PAL['cobble'], PT['cobble'], nrm=(0, 0, 1))
    # race walls + water
    for y, n in ((RY0, (0, 1, 0)), (RY1, (0, -1, 0))):
        poly(op, ((9.4, y, RZ - 0.4), (32, y, RZ - 0.4), (32, y, Z0), (9.4, y, Z0)), PAL['granite_light'], PT['ashlar'], nrm=n)
    poly(op, ((9.4, RY0, RZ - 0.4), (9.4, RY1, RZ - 0.4), (9.4, RY1, Z0), (9.4, RY0, Z0)), PAL['granite_light'], PT['ashlar'], nrm=(1, 0, 0))
    poly(op, ((9.4, RY0, RZ), (32.0, RY0, RZ), (32.0, RY1, RZ), (9.4, RY1, RZ)), PAL['water'], 0, nrm=(0, 0, 1), jitter=0.0)
    for y in (RY0 - 0.35, RY1 + 0.35):    # coping
        box2(op, 9.4, y - 0.35, Z0, 32, y + 0.35, Z0 + 0.35, PAL['stone_light'], PT['ashlar'])
    # sluice at the race head
    box2(op, 10.0, RY0 - 0.5, Z0, 10.8, RY1 + 0.5, Z0 + 2.2, PAL['timber_dark'], PT['boards'])
    for y in (RY0 - 0.4, RY1 + 0.4):
        box2(op, 10.0, y - 0.25, Z0, 10.8, y + 0.25, Z0 + 3.4, PAL['timber_dark'], 0)
    beam(op, (10.4, RY0 - 0.4, Z0 + 3.3), (10.4, RY1 + 0.4, Z0 + 3.3), 0.3, 0.3, PAL['timber_dark'])

    # ---- the coining hall: stone arcade, presses + furnaces visible through four great arches
    HX0, HX1, HY0, HY1, HZ = -31.0, 9.0, -20.0, -2.0, Z0 + 10.0
    T = 1.3
    bays = arcade(op, HX0, HX1, HY0, T, Z0, HZ, 4, 2.6, Z0 + 5.0, PAL['stone'], PT['ashlar'], intr=PAL['stone_dark'],
                  keystone=PAL['gilt'])
    for (xc, r) in bays:   # rusticated arch rings
        for k in range(9):
            a = math.pi * k / 8
            p = Vector((xc + (r + 0.35) * math.cos(a), HY0 - 0.12, Z0 + 5.0 + (r + 0.35) * math.sin(a)))
            if k in (0, 8):
                continue
            obox(op, p, (1, 0, 0), (0, 1, 0), 0.75, 0.3, 0.75, PAL['stone_light'], PT['ashlar'])
    # pilasters on the piers + base course + cornice + attic
    for i in range(5):
        px = HX0 + 1.3 + i * (2.6 + 2 * bays[0][1])
        box2(op, px - 0.75, HY0 - 0.35, Z0, px + 0.75, HY0, HZ - 0.4, PAL['stone_light'], PT['ashlar'])
    box2(op, HX0 - 0.3, HY0 - 0.6, HZ - 0.6, HX1 + 0.3, HY1 + 0.3, HZ + 0.5, PAL['stone_light'], 0)
    box2(op, HX0, HY0 - 0.2, HZ + 0.5, HX1, HY1, HZ + 1.6, PAL['stone'], PT['ashlar'])
    box2(op, HX0 - 0.2, HY0 - 0.4, HZ + 1.6, HX1 + 0.2, HY1 + 0.2, HZ + 1.9, PAL['stone_light'], 0)
    hip_roof(op, HX0, HY0 + 0.2, HX1, HY1, HZ + 1.9, 4.8, PAL['slate'], PT['slate'], ov=0.3)
    # roof monitor (vented ridge: the hall breathes heat)
    box2(op, HX0 + 9, -12.3, HZ + 6.2, HX1 - 9, -9.7, HZ + 7.2, PAL['timber_dark'], PT['boards'])
    gable_roof(op, HX0 + 9, -12.6, HX1 - 9, -9.4, HZ + 7.2, 0.9, PAL['slate'], PT['slate'], ov=0.3, end_col=PAL['timber_dark'])
    # central attic over the arcade carrying the great gilded coin (the mint's sign, readable from the overview)
    AX0, AX1, AZ0 = -17.6, -4.4, HZ + 1.9
    box2(op, AX0, HY0 - 0.3, AZ0, AX1, HY0 + 3.4, AZ0 + 5.0, PAL['stone'], PT['ashlar'])
    box2(op, AX0 - 0.3, HY0 - 0.6, AZ0 + 5.0, AX1 + 0.3, HY0 + 3.6, AZ0 + 5.5, PAL['stone_light'], 0)
    pediment(op, AX0 - 0.3, AX1 + 0.3, HY0 - 0.6, HY0 + 3.6, AZ0 + 5.5, 2.2, PAL['stone_light'], tymp=PAL['stone'])
    gable_roof(op, AX0 - 0.3, HY0 - 0.6, AX1 + 0.3, HY0 + 3.6, AZ0 + 5.5, 2.2, PAL['slate'], PT['slate'], ov=0.0, ends=False, axis='y')
    for s_ in (-1, 1):
        lathe(op, ((AX0 + AX1) / 2 + s_ * 6.4, HY0 + 1.4), [(0.5, AZ0 + 5.5), (0.75, AZ0 + 6.0), (0.35, AZ0 + 6.5), (0.65, AZ0 + 7.1), (0.0, AZ0 + 7.9)],
              PAL['gilt'], PT['metal'], 8)
    mcx, mcz = (AX0 + AX1) / 2, AZ0 + 2.55
    disc(op, (mcx, HY0 - 0.3, mcz), (0, -1, 0), 2.35, 0.4, PAL['gold'], 20, PT['metal'])
    disc(op, (mcx, HY0 - 0.7, mcz), (0, -1, 0), 1.9, 0.06, PAL['gilt'], 20, PT['metal'])
    for k in range(16):
        a = 2 * math.pi * k / 16
        obox(op, Vector((mcx + 2.1 * math.cos(a), HY0 - 0.78, mcz + 2.1 * math.sin(a))), (1, 0, 0), (0, 1, 0), 0.22, 0.16, 0.22, PAL['gold'])
    for (w, z0_, z1_) in ((1.3, -1.3, -0.4), (0.95, -0.4, 0.45), (0.62, 0.45, 1.05)):
        box2(op, mcx - w / 2, HY0 - 1.0, mcz + z0_, mcx + w / 2, HY0 - 0.74, mcz + z1_, PAL['gold'], PT['metal'])
    lathe(op, (mcx, HY0 - 0.86), [(0.3, mcz + 1.05), (0.0, mcz + 1.6)], PAL['gold'], PT['metal'], 5)
    # side and back walls
    box2(op, HX0, HY0 + T, Z0, HX0 + T, HY1, HZ, PAL['stone'], PT['ashlar'])
    box2(op, HX1 - T, HY0 + T, Z0, HX1, HY1, HZ, PAL['stone'], PT['ashlar'])
    box2(op, HX0, HY1 - T, Z0, HX1, HY1, HZ, PAL['stone'], PT['ashlar'])
    for y in (-14.5, -7.5):
        window(K, (HX1, y, Z0 + 6.0), (1, 0, 0), 1.6, 3.2, arch=True, lit=0.9, warm=0.0)
        window(K, (HX0, y, Z0 + 6.0), (-1, 0, 0), 1.6, 3.2, arch=True, lit=0.9, warm=0.0)
    door(K, (HX1, -10.5, Z0), (1, 0, 0), 2.4, 3.4, col=PAL['door_green'], lamp=True)
    # interior: dark flags, furnace bank on the back wall
    poly(op, ((HX0 + T, HY0 + T, Z0 + 0.03), (HX1 - T, HY0 + T, Z0 + 0.03), (HX1 - T, HY1 - T, Z0 + 0.03), (HX0 + T, HY1 - T, Z0 + 0.03)),
         PAL['interior2'], PT['cobble'], nrm=(0, 0, 1))
    FY = HY1 - T - 3.2
    box2(op, HX0 + T, FY, Z0, HX1 - T, HY1 - T, Z0 + 4.4, PAL['brick'], PT['ashlar'], skip=('-y',))
    # hood over the furnace bank
    poly(op, ((HX0 + T, FY - 0.6, Z0 + 4.4), (HX1 - T, FY - 0.6, Z0 + 4.4), (HX1 - T, HY1 - T, Z0 + 8.5), (HX0 + T, HY1 - T, Z0 + 8.5)),
         PAL['brick_dark'], PT['ashlar'], nrm=(0, -1, 1))
    box2(op, HX0 + T, FY - 0.7, Z0 + 4.1, HX1 - T, FY - 0.3, Z0 + 4.5, PAL['iron'], PT['metal'])
    glow = MB(50)
    for (xc, r) in bays:   # one furnace mouth per bay: brick front with an arched glowing mouth + coal bed
        x0, x1 = xc - r - 1.3, xc + r + 1.3
        x0 = max(x0, HX0 + T); x1 = min(x1, HX1 - T)
        mw, mh = 2.6, 2.2
        for a, b in ((x0, xc - mw / 2), (xc + mw / 2, x1)):
            poly(op, ((a, FY, Z0), (b, FY, Z0), (b, FY, Z0 + 4.4), (a, FY, Z0 + 4.4)), PAL['brick'], PT['ashlar'], nrm=(0, -1, 0))
        poly(op, ((xc - mw / 2, FY, Z0 + 0.8 + mh), (xc + mw / 2, FY, Z0 + 0.8 + mh), (xc + mw / 2, FY, Z0 + 4.4), (xc - mw / 2, FY, Z0 + 4.4)),
             PAL['brick'], PT['ashlar'], nrm=(0, -1, 0))
        poly(op, ((xc - mw / 2, FY, Z0), (xc + mw / 2, FY, Z0), (xc + mw / 2, FY, Z0 + 0.8), (xc - mw / 2, FY, Z0 + 0.8)),
             PAL['brick_dark'], PT['ashlar'], nrm=(0, -1, 0))
        # mouth: glowing back + iron frame + coal bed
        poly(glow, ((xc - mw / 2, FY + 0.6, Z0 + 0.8), (xc + mw / 2, FY + 0.6, Z0 + 0.8), (xc + mw / 2, FY + 0.6, Z0 + 0.8 + mh),
                    (xc - mw / 2, FY + 0.6, Z0 + 0.8 + mh)), (1.0, 0.45, 0.12), 0, nrm=(0, -1, 0), jitter=0)
        for s in (-1, 1):
            poly(op, ((xc + s * mw / 2, FY, Z0 + 0.8), (xc + s * mw / 2, FY + 0.6, Z0 + 0.8), (xc + s * mw / 2, FY + 0.6, Z0 + 0.8 + mh),
                      (xc + s * mw / 2, FY, Z0 + 0.8 + mh)), PAL['soot'], 0, nrm=(-s, 0, 0))
        box2(op, xc - mw / 2 - 0.25, FY - 0.25, Z0 + 0.8 + mh, xc + mw / 2 + 0.25, FY + 0.05, Z0 + 1.1 + mh, PAL['iron'], PT['metal'])
        box2(glow, xc - mw / 2 + 0.2, FY - 0.9, Z0 + 0.8, xc + mw / 2 - 0.2, FY + 0.5, Z0 + 1.05, (1.0, 0.5, 0.15), 0, skip=('-z',))
        # crucible / ladle stand in front of the furnace
        cyl(op, (xc + 1.9, FY - 1.6), 0.55, 0.7, Z0, Z0 + 1.0, PAL['soot2'], PT['metal'], 7)
        cyl(glow, (xc + 1.9, FY - 1.6), 0.55, 0.55, Z0 + 1.0, Z0 + 1.03, (1.0, 0.6, 0.2), 0, 7)
    gl = to_object(glow, 'furnace_glow', 'hb_emissive', parent=root, coll=coll)
    gl['anim'] = 'furnace mouths + coal beds + crucibles: emissive strength ~ mint volume (flicker)'
    # presses (static frames in the body, moving rams as nodes) and coin trays
    presses = []
    for i in range(3):
        xc = bays[i][0]
        yc = HY0 + 6.2
        press_frame(op, xc, yc)
        presses.append(press_ram(K, root, i, xc, yc, coll))
        box2(op, xc + 1.6, yc - 0.7, Z0, xc + 3.0, yc + 0.7, Z0 + 1.0, PAL['timber_dark'], PT['planks_x'])
        cyl(op, (xc + 2.3, yc), 0.55, 0.55, Z0 + 1.0, Z0 + 1.25, PAL['gold'], PT['metal'], 8)
    xc = bays[3][0]   # 4th bay: the counting table + ingot stack on show
    box2(op, xc - 2.2, HY0 + 4.0, Z0, xc + 2.2, HY0 + 5.6, Z0 + 1.0, PAL['oak'], PT['planks_x'])
    for k in range(5):
        cyl(op, (xc - 1.6 + k * 0.8, HY0 + 4.8), 0.32, 0.32, Z0 + 1.0, Z0 + 1.0 + 0.2 + 0.15 * (k % 3), PAL['gold'], PT['metal'], 7)
    ingot_stack(op, (xc, HY0 + 8.0, Z0), 4, 3, 3)

    # ---- four brick chimneys behind the hall (the silhouette)
    chim = []
    for i, x in enumerate((-25.5, -15.5, -5.5, 4.5)):
        y = 1.8
        h = 30.0 + (1.5 if i in (1, 2) else 0.0)
        box2(op, x - 2.0, y - 2.0, Z0, x + 2.0, y + 2.0, Z0 + 3.2, PAL['granite_light'], PT['ashlar'])
        box2(op, x - 2.15, y - 2.15, Z0 + 3.2, x + 2.15, y + 2.15, Z0 + 3.7, PAL['stone_light'], 0)
        # tapered square shaft (frustum) + soot at the crown
        b0, b1 = 1.55, 1.05
        z0_, z1_ = Z0 + 3.7, Z0 + h
        def sq(hw, z):
            return [Vector((x - hw, y - hw, z)), Vector((x + hw, y - hw, z)), Vector((x + hw, y + hw, z)), Vector((x - hw, y + hw, z))]
        zm = z0_ + (z1_ - z0_) * 0.82
        hm = b0 + (b1 - b0) * 0.82
        for (za, ha, zb, hb, c) in ((z0_, b0, zm, hm, PAL['brick']), (zm, hm, z1_, b1, PAL['brick_dark'])):
            A, B = sq(ha, za), sq(hb, zb)
            for k in range(4):
                k2 = (k + 1) % 4
                poly(op, (A[k], A[k2], B[k2], B[k]), c, PT['ashlar'], nrm=(A[k] + A[k2]) / 2 - Vector((x, y, za)))
        for zz in (Z0 + 12.0, Z0 + 21.0):     # white stone bands
            hw = b0 + (b1 - b0) * (zz - z0_) / (z1_ - z0_) + 0.12
            box2(op, x - hw, y - hw, zz, x + hw, y + hw, zz + 0.45, PAL['stone_light'], 0)
        box2(op, x - 1.5, y - 1.5, z1_, x + 1.5, y + 1.5, z1_ + 0.9, PAL['soot2'], PT['ashlar'])    # corbelled crown
        box2(op, x - 1.3, y - 1.3, z1_ + 0.9, x + 1.3, y + 1.3, z1_ + 1.25, PAL['soot'], 0)
        poly(op, ((x - 0.8, y - 0.8, z1_ + 1.26), (x + 0.8, y - 0.8, z1_ + 1.26), (x + 0.8, y + 0.8, z1_ + 1.26), (x - 0.8, y + 0.8, z1_ + 1.26)),
             (0.01, 0.01, 0.01), 0, nrm=(0, 0, 1), jitter=0)
        e = empty(f'chimney_{i}', (x, y, z1_ + 1.3), parent=root, coll=coll)
        e['anim'] = 'smoke emitter at the chimney mouth; puff rate/darkness ~ mint volume'
        chim.append(e)
        # flue from the hall
        box2(op, x - 1.0, HY1, Z0 + 3.0, x + 1.0, y - 2.0, Z0 + 6.0, PAL['brick_dark'], PT['ashlar'])
    # coal heap + barrows between the chimneys
    for (x, y) in ((-20.5, 3.0), (-10.5, 3.6), (-0.5, 3.0)):
        lathe(op, (x, y), [(2.6, Z0), (1.6, Z0 + 1.0), (0.0, Z0 + 1.6)], PAL['soot'], PT['rock'], 7, smooth=False)

    # ---- treasury / assay house with a copper dome (back left)
    TX0, TX1, TY0, TY1, TZ = -30.5, -3.5, 8.0, 21.0, Z0 + 8.0
    box2(op, TX0, TY0, Z0, TX1, TY1, TZ, PAL['stone'], PT['ashlar'])
    box2(op, TX0 - 0.25, TY0 - 0.25, Z0, TX1 + 0.25, TY1 + 0.25, Z0 + 2.4, PAL['granite_light'], PT['ashlar'])   # rusticated base
    box2(op, TX0 - 0.3, TY0 - 0.35, TZ - 0.2, TX1 + 0.3, TY1 + 0.3, TZ + 0.5, PAL['stone_light'], 0)
    hip_roof(op, TX0, TY0, TX1, TY1, TZ + 0.5, 3.2, PAL['slate'], PT['slate'], ov=0.25)
    cx, cy = (TX0 + TX1) / 2, (TY0 + TY1) / 2
    cyl(op, (cx, cy), 3.6, 3.6, TZ + 2.0, TZ + 4.6, PAL['stone_light'], PT['ashlar'], 14, top=False)
    cyl(op, (cx, cy), 3.9, 3.9, TZ + 4.6, TZ + 5.0, PAL['stone_light'], 0, 14, top=False)
    dome(op, (cx, cy), TZ + 5.0, 3.7, 3.4, PAL['copper'], 0, 14, 5, ribs=PAL['copper_dark'])
    cyl(op, (cx, cy), 0.25, 0.1, TZ + 8.4, TZ + 9.8, PAL['gilt'], PT['metal'], 6)
    sphere(op, (cx, cy, TZ + 9.9), 0.45, PAL['gold'], 8, 4, PT['metal'])
    for k in range(6):
        a = 2 * math.pi * (k + 0.5) / 6 - math.pi / 2
        window(K, (cx + 3.62 * math.cos(a), cy + 3.62 * math.sin(a), TZ + 3.3), (math.cos(a), math.sin(a), 0), 0.8, 1.2, arch=True, sill=False)
    for x in (-27.5, -24.0, -20.5, -13.5, -10.0, -6.5):
        window(K, (x, TY0, Z0 + 4.9), (0, -1, 0), 1.0, 2.0, frame=PAL['stone_light'], lit=0.0 if x < -20 else None, shutters=None)
        box2(op, x - 0.6, TY0 - 0.12, Z0 + 3.9, x + 0.6, TY0 - 0.06, Z0 + 5.9, PAL['iron'], PT['metal'], skip=('+y',))   # bars
    door(K, (-17.0, TY0, Z0 + 0.0), (0, -1, 0), 2.2, 3.4, col=PAL['iron'], frame=PAL['stone_light'])
    # ---- the gate: rusticated arch, attic with the gilded coin
    GX = 21.0
    box2(op, 9.4, -22.0, Z0, GX - 5.6, -21.0, Z0 + 4.0, PAL['stone'], PT['ashlar'])
    box2(op, GX + 5.6, -22.0, Z0, 32.0, -21.0, Z0 + 4.0, PAL['stone'], PT['ashlar'])
    box2(op, 9.4, -22.2, Z0 + 4.0, GX - 5.6, -20.8, Z0 + 4.35, PAL['stone_light'], 0)
    box2(op, GX + 5.6, -22.2, Z0 + 4.0, 32.0, -20.8, Z0 + 4.35, PAL['stone_light'], 0)
    box2(op, 31.0, -22.0, Z0, 32.0, RY0 - 0.7, Z0 + 4.0, PAL['stone'], PT['ashlar'])   # east wall
    arcade(op, GX - 6.4, GX + 6.4, -22.6, 2.8, Z0, Z0 + 9.0, 1, 2.6, Z0 + 4.6, PAL['stone'], PT['ashlar'], intr=PAL['stone_dark'],
           keystone=PAL['gilt'], back=True)
    for s in (-1, 1):   # pilasters + urns
        box2(op, GX + s * 5.1 - 0.8, -23.0, Z0, GX + s * 5.1 + 0.8, -22.6, Z0 + 9.0, PAL['stone_light'], PT['ashlar'])
    box2(op, GX - 6.8, -23.2, Z0 + 9.0, GX + 6.8, -19.6, Z0 + 9.6, PAL['stone_light'], 0)
    box2(op, GX - 5.2, -22.9, Z0 + 9.6, GX + 5.2, -20.0, Z0 + 14.6, PAL['stone'], PT['ashlar'])
    box2(op, GX - 5.6, -23.2, Z0 + 14.6, GX + 5.6, -19.7, Z0 + 15.2, PAL['stone_light'], 0)
    for s in (-1, 1):
        lathe(op, (GX + s * 4.6, -21.4), [(0.5, Z0 + 15.2), (0.7, Z0 + 15.7), (0.35, Z0 + 16.1), (0.6, Z0 + 16.7), (0.0, Z0 + 17.4)], PAL['gilt'],
              PT['metal'], 8)
    # gilded coin relief: rim, field, beaded ring, a little Pharos
    cz = Z0 + 12.1
    disc(op, (GX, -22.9, cz), (0, -1, 0), 2.35, 0.32, PAL['gold'], 20, PT['metal'])
    disc(op, (GX, -23.22, cz), (0, -1, 0), 1.9, 0.06, PAL['gilt'], 20, PT['metal'])
    for k in range(16):
        a = 2 * math.pi * k / 16
        obox(op, Vector((GX + 2.1 * math.cos(a), -23.3, cz + 2.1 * math.sin(a))), (1, 0, 0), (0, 1, 0), 0.2, 0.16, 0.2, PAL['gold'])
    for (w, z0_, z1_) in ((1.3, -1.3, -0.4), (0.95, -0.4, 0.45), (0.62, 0.45, 1.05)):
        box2(op, GX - w / 2, -23.5, cz + z0_, GX + w / 2, -23.25, cz + z1_, PAL['gold'], PT['metal'])
    lathe(op, (GX, -23.38), [(0.3, cz + 1.05), (0.0, cz + 1.6)], PAL['gold'], PT['metal'], 5)
    # the gate itself (open iron leaves)
    for s in (-1, 1):
        rx = GX + s * 3.6
        for k in range(6):
            x = rx - s * 0.45 * k
            box2(op, x - 0.05, -20.5 + 0.0, Z0, x + 0.05, -20.4 + 0.0 + 0.1, Z0 + 4.0, PAL['iron'], 0, skip=('-z', '+z'))
    # ---- wheelhouse + waterwheel (back right)
    WX0, WX1, WY0, WY1 = 11.0, 31.0, 6.0, 20.0
    box2(op, WX0, WY0, Z0, WX1, WY1, Z0 + 7.2, PAL['stone'], PT['ashlar'])
    box2(op, WX0 - 0.2, WY0 - 0.2, Z0, WX1 + 0.2, WY1 + 0.2, Z0 + 1.6, PAL['granite_light'], PT['ashlar'])
    gable_roof(op, WX0, WY0, WX1, WY1, Z0 + 7.2, 4.4, PAL['roof_red'], PT['tiles'], ov=0.55, end_col=PAL['stone'])
    for x in (13.5, 16.5, 25.5, 28.5):
        window(K, (x, WY0, Z0 + 4.3), (0, -1, 0), 1.1, 1.8, frame=PAL['trim'], shutters=PAL['door_green'])
    disc(op, (21.0, WY0, Z0 + 2.4), (0, -1, 0), 0.9, 0.3, PAL['iron'], 8, PT['metal'])
    door(K, (26.5, WY0, Z0), (0, -1, 0), 1.8, 3.0, col=PAL['door_green'])
    wheel = MB(60)
    wc = Vector((21.0, (RY0 + RY1) / 2, Z0 + 1.6))
    R_, W_ = 4.4, 2.4
    for yy in (wc.y - W_ / 2, wc.y + W_ / 2):
        for k in range(16):
            a0, a1 = 2 * math.pi * k / 16, 2 * math.pi * (k + 1) / 16
            for rr in (R_,):
                pa = wc + Vector((rr * math.cos(a0), yy - wc.y, rr * math.sin(a0)))
                pb = wc + Vector((rr * math.cos(a1), yy - wc.y, rr * math.sin(a1)))
                beam(wheel, pa, pb, 0.28, 0.4, PAL['timber_dark'], up=Vector((0, 1, 0)))
        for k in range(8):
            a = 2 * math.pi * (k + 0.25) / 8
            beam(wheel, wc + Vector((0, yy - wc.y, 0)), wc + Vector((R_ * math.cos(a), yy - wc.y, R_ * math.sin(a))), 0.22, 0.22, PAL['timber'])
    for k in range(16):   # paddles
        a = 2 * math.pi * (k + 0.5) / 16
        d = Vector((math.cos(a), 0, math.sin(a)))
        p = wc + d * (R_ - 0.45)
        t_ = Vector((-d.z, 0, d.x))
        box(wheel, p, (0.85, W_ + 0.2, 0.12), PAL['timber'], PT['boards'], axes=(d, Vector((0, 1, 0)), t_))
    rod(wheel, wc - Vector((0, W_ / 2 + 0.6, 0)), wc + Vector((0, W_ / 2 + 1.2, 0)), 0.32, PAL['iron'], 8, cap=True)
    wob = to_object(wheel, 'wheel', 'hb_opaque', parent=root, origin=wc, coll=coll)
    wob['anim'] = 'waterwheel: rotate about local Z (glTF; the axle, Blender Y); undershot - turns with the flow; speed ~ mint volume'
    # axle bearings
    for yy in (RY0 - 0.35, RY1 + 0.35):
        box2(op, 20.4, yy - 0.35, Z0, 21.6, yy + 0.35, Z0 + 1.4, PAL['timber_dark'], PT['boards'])
    # ---- yard dressing: ingots, coin crates, handcart, lamp posts
    ingot_stack(op, (14.5, -15.0, Z0), 4, 3, 3)
    ingot_stack(op, (14.5, -9.5, Z0), 3, 3, 3)
    ingot_stack(op, (27.0, -12.0, Z0), 4, 2, 2)
    for k, (x, y) in enumerate(((25.0, -5.0), (26.3, -5.0), (27.6, -5.0), (25.6, -3.6), (26.9, -3.6), (13.0, -2.5), (14.3, -2.5))):
        coin_crate(op, (x, y, Z0), rz=0.05 * (k % 3))
    coin_crate(op, (25.6 + 0.65, -4.3, Z0 + 1.1))
    # handcart
    box2(op, 18.2, -6.0, Z0 + 0.8, 20.6, -4.6, Z0 + 1.0, PAL['timber'], PT['planks_x'])
    for x in (18.2, 20.6):
        box2(op, x - 0.08, -6.0, Z0 + 1.0, x + 0.08, -4.6, Z0 + 1.5, PAL['timber'], 0)
    for y in (-6.1, -4.5):
        disc(op, (19.4, y + (0.0 if y < -5 else 0.0), Z0 + 0.62), (0, -1 if y < -5 else 1, 0), 0.62, 0.12, PAL['timber_dark'], 8)
    beam(op, (20.6, -5.3, Z0 + 0.95), (22.4, -5.3, Z0 + 0.3), 0.12, 0.12, PAL['timber'])
    ingot_stack(op, (19.4, -5.3, Z0 + 1.0), 2, 2, 2)
    for (x, y) in ((10.6, -20.0), (31.0, -19.5), (10.6, 0.5), (31.0, 0.5)):
        cyl(op, (x, y), 0.14, 0.1, Z0, Z0 + 3.4, PAL['iron'], PT['metal'], 6)
        box2(em, x - 0.22, y - 0.22, Z0 + 3.4, x + 0.22, y + 0.22, Z0 + 3.95, PAL['iron'], 0)
        box2(op, x - 0.3, y - 0.3, Z0 + 3.95, x + 0.3, y + 0.3, Z0 + 4.1, PAL['iron'], PT['metal'])
    K.emit(root, 'mint_body', coll)
    # worker path: closed loop through the gate, the hall's side door, the stacks, the crates and the wheelhouse
    pts = [(21.0, -21.2), (17.0, -13.0), (10.4, -10.5), (16.5, -6.5), (22.0, -4.0), (26.5, 0.0), (26.5, 5.4), (24.0, -2.5), (27.0, -10.0), (21.0, -21.2)]
    wp = empty('worker_path', (0, 0, Z0), parent=root, coll=coll)
    flat = []
    for (x, y) in pts:
        flat += [round(x, 2), round(Z0, 2), round(-y, 2)]
    wp['points_gltf'] = flat
    wp['anim'] = 'closed walking loop for mint workers (glTF x,y,z triplets in the mint frame); crowd ~ mint volume'
    return root, dict(anchors=dict(worker_path=[[round(x, 2), Z0, round(-y, 2)] for x, y in pts], ground_y=Z0,
                                   gate=[GX, Z0, 22.0], coin_emblem=[round(mcx, 2), round(mcz, 2), round(-HY0 + 1.0, 2)], gate_coin=[GX, round(cz, 2), 23.5]))


# =================================================================== THE BURN  30 x 30 on a rocky point
def rock_blob(mb, c, r, h, rng, n=7, col=None, z_base=-4.0):
    c = Vector(c)
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n + rng.uniform(-0.2, 0.2)
        rr = r * rng.uniform(0.75, 1.1)
        pts.append(Vector((c.x + rr * math.cos(a), c.y + rr * math.sin(a), 0)))
    top = [Vector((p.x * 0.8 + c.x * 0.2, p.y * 0.8 + c.y * 0.2, c.z + h * rng.uniform(0.7, 0.95))) for p in pts]
    bot = [Vector((p.x, p.y, z_base)) for p in pts]
    mid = [Vector((p.x * 1.02 - c.x * 0.02, p.y * 1.02 - c.y * 0.02, c.z + h * rng.uniform(0.35, 0.6))) for p in pts]
    apex = Vector((c.x + rng.uniform(-0.3, 0.3) * r, c.y + rng.uniform(-0.3, 0.3) * r, c.z + h * rng.uniform(0.9, 1.05)))
    colr = col or PAL['granite']
    for k in range(n):
        k2 = (k + 1) % n
        poly(mb, (bot[k], bot[k2], mid[k2], mid[k]), mul(colr, 0.85), PT['rock'], nrm=mid[k] + mid[k2] - 2 * c)
        poly(mb, (mid[k], mid[k2], top[k2], top[k]), colr, PT['rock'], nrm=mid[k] + mid[k2] - 2 * c + Vector((0, 0, 1)))
        poly(mb, (top[k], top[k2], apex), mul(colr, 1.12), PT['rock'], nrm=(0, 0, 1))


def build_burn(coll=None):
    root = empty('burn', coll=coll)
    K = Kit(21)
    op, em = K.op, K.em
    rng = random.Random(9)
    PZ = 0.9   # platform top
    # ---- the rocky point: a skirt of boulders, then a dressed octagonal platform
    for k in range(11):
        a = 2 * math.pi * k / 11 + 0.2
        rr = 11.9 + rng.uniform(-0.6, 0.5)
        rock_blob(op, (rr * math.cos(a), rr * math.sin(a), -1.2), rng.uniform(2.6, 3.6), rng.uniform(1.6, 3.0), rng,
                  col=mix(PAL['granite'], PAL['rock_dark'], rng.uniform(0, 0.5)))
    for (x, y, r, h) in ((-11.5, -11.5, 3.2, 3.4), (11.6, -11.0, 2.8, 2.6), (-12.0, 9.0, 3.0, 4.2), (10.5, 11.8, 3.3, 3.6)):
        rock_blob(op, (x, y, -0.6), r, h, rng, col=mix(PAL['granite'], PAL['rock_dark'], 0.6))
    oct_ = [Vector((11.0 * math.cos(math.pi / 8 + k * math.pi / 4), 11.0 * math.sin(math.pi / 8 + k * math.pi / 4), 0)) for k in range(8)]
    for k in range(8):
        a, b = oct_[k], oct_[(k + 1) % 8]
        poly(op, ((a.x, a.y, -2.5), (b.x, b.y, -2.5), (b.x, b.y, PZ), (a.x, a.y, PZ)), PAL['granite'], PT['ashlar'], nrm=a + b)
    # soot-darkened paving, darker toward the fire
    ctr = Vector((-3.0, -6.0, 0))
    for k in range(8):
        a, b = oct_[k], oct_[(k + 1) % 8]
        m = (a + b) / 2
        t = 1 - min(1, (m - ctr).length / 14)
        poly(op, ((0, 0, PZ), (a.x, a.y, PZ), (b.x, b.y, PZ)), mix(PAL['quay'], PAL['soot2'], 0.25 + 0.5 * t), PT['cobble'], nrm=(0, 0, 1))
    for k in range(8):   # kerb
        a, b = oct_[k], oct_[(k + 1) % 8]
        beam(op, (a.x, a.y, PZ + 0.2), (b.x, b.y, PZ + 0.2), 0.6, 0.4, PAL['granite_light'])
    # ---- the bottle kiln: brick, soot-blackened toward the neck, iron hoops
    KC = (1.5, 5.0)
    prof = [(6.0, PZ), (6.5, PZ + 3.0), (6.6, PZ + 6.0), (6.0, PZ + 9.0), (4.6, PZ + 12.0), (3.2, PZ + 15.0), (2.4, PZ + 17.6),
            (2.2, PZ + 21.0), (2.75, PZ + 21.4), (2.75, PZ + 22.2), (2.0, PZ + 22.25), (1.9, PZ + 21.6)]
    lathe(op, KC, prof, PAL['brick'], PT['ashlar'], 16, smooth=True, cap=False,
          colfn=lambda z: mix(PAL['brick_dark'], PAL['soot'], sstep(PZ + 4.0, PZ + 15.0, z)))
    poly(op, [(KC[0] + 1.9 * math.cos(2 * math.pi * k / 16), KC[1] + 1.9 * math.sin(2 * math.pi * k / 16), PZ + 21.6) for k in range(16)],
         (0.012, 0.01, 0.01), 0, nrm=(0, 0, 1), jitter=0)
    for z in (PZ + 2.2, PZ + 5.0, PZ + 7.8, PZ + 18.6):
        rr = None
        for (r0, z0_), (r1, z1_) in zip(prof[:-1], prof[1:]):
            if z0_ <= z <= z1_:
                rr = r0 + (r1 - r0) * (z - z0_) / (z1_ - z0_)
        lathe(op, KC, [(rr + 0.1, z), (rr + 0.12, z + 0.35)], PAL['iron'], PT['metal'], 16, smooth=True, cap=False)
    smoke = empty('smoke_emitter', (KC[0], KC[1], PZ + 22.4), parent=root, coll=coll)
    smoke['anim'] = 'kiln smoke: column height/darkness ~ burn volume; dominates when the net trend is negative'
    # firebox porch on the kiln's front with the glowing grate behind an iron grille
    GY = KC[1] - 6.35
    box2(op, KC[0] - 2.6, GY - 1.8, PZ, KC[0] + 2.6, GY + 0.6, PZ + 4.8, PAL['brick_dark'], PT['ashlar'], skip=('-y',))
    gx0, gx1, gz0, gz1 = KC[0] - 1.4, KC[0] + 1.4, PZ + 0.5, PZ + 3.0
    for (xa, xb, za, zb) in ((KC[0] - 2.6, gx0, PZ, PZ + 4.8), (gx1, KC[0] + 2.6, PZ, PZ + 4.8), (gx0, gx1, gz1, PZ + 4.8), (gx0, gx1, PZ, gz0)):
        poly(op, ((xa, GY - 1.8, za), (xb, GY - 1.8, za), (xb, GY - 1.8, zb), (xa, GY - 1.8, zb)), PAL['brick_dark'], PT['ashlar'], nrm=(0, -1, 0))
    for s in (-1, 1):
        x = KC[0] + s * 1.4
        poly(op, ((x, GY - 1.8, gz0), (x, GY - 0.8, gz0), (x, GY - 0.8, gz1), (x, GY - 1.8, gz1)), PAL['soot'], 0, nrm=(-s, 0, 0))
    poly(op, ((gx0, GY - 1.8, gz1), (gx1, GY - 1.8, gz1), (gx1, GY - 0.8, gz1), (gx0, GY - 0.8, gz1)), PAL['soot'], 0, nrm=(0, 0, -1))
    box2(op, KC[0] - 2.9, GY - 2.1, PZ + 4.8, KC[0] + 2.9, GY + 0.6, PZ + 5.3, PAL['stone_dark'], 0)
    grate = MB(70)
    poly(grate, ((gx0, GY - 0.8, gz0), (gx1, GY - 0.8, gz0), (gx1, GY - 0.8, gz1), (gx0, GY - 0.8, gz1)), (1.0, 0.45, 0.1), 0, nrm=(0, -1, 0), jitter=0)
    for k in range(7):   # iron grille: verticals + two rails
        x = gx0 + 0.2 + k * (gx1 - gx0 - 0.4) / 6
        box2(op, x - 0.06, GY - 1.95, gz0, x + 0.06, GY - 1.83, gz1, PAL['iron'], 0, skip=('-z', '+z'))
    for z in (gz0 + 0.8, gz0 + 1.8):
        box2(op, gx0, GY - 2.0, z - 0.07, gx1, GY - 1.88, z + 0.07, PAL['iron'], 0)
    # ---- the great fire bowl on a stone drum (front left)
    BC = Vector((-3.4, -6.4, 0))
    cyl(op, BC, 3.0, 2.7, PZ, PZ + 2.6, PAL['stone_dark'], PT['ashlar'], 12, top=True, col_top=PAL['soot2'])
    box2(op, BC.x - 3.3, BC.y - 3.3, PZ, BC.x + 3.3, BC.y + 3.3, PZ + 0.5, PAL['granite_light'], PT['ashlar'], skip=('-z',))
    # vent in the drum, glowing behind a grille
    poly(grate, ((BC.x - 0.7, BC.y - 2.86, PZ + 0.8), (BC.x + 0.7, BC.y - 2.86, PZ + 0.8), (BC.x + 0.7, BC.y - 2.86, PZ + 1.9),
                 (BC.x - 0.7, BC.y - 2.86, PZ + 1.9)), (1.0, 0.45, 0.1), 0, nrm=(0, -1, 0), jitter=0)
    for k in range(4):
        x = BC.x - 0.5 + k * 0.33
        box2(op, x - 0.05, BC.y - 3.0, PZ + 0.8, x + 0.05, BC.y - 2.9, PZ + 1.9, PAL['iron'], 0, skip=('-z', '+z'))
    bz = PZ + 2.6
    lathe(op, BC, [(1.6, bz), (3.4, bz + 0.6), (4.3, bz + 1.6), (4.55, bz + 2.15), (4.55, bz + 2.45), (4.15, bz + 2.5), (3.0, bz + 1.9),
                   (1.4, bz + 1.55), (0.0, bz + 1.5)], PAL['iron'], PT['metal'], 18, smooth=True, cap=False,
          colfn=lambda z: PAL['bronze'] if z > bz + 2.0 else PAL['iron'])
    for k in range(18):   # bronze rim lugs
        a = 2 * math.pi * k / 18
        obox(op, Vector((BC.x + 4.6 * math.cos(a), BC.y + 4.6 * math.sin(a), bz + 2.3)), (-math.sin(a), math.cos(a), 0), (math.cos(a), math.sin(a), 0),
             0.35, 0.25, 0.35, PAL['bronze_light'])
    for k in range(3):    # brackets
        a = 2 * math.pi * k / 3 - math.pi / 2
        beam(op, (BC.x + 2.9 * math.cos(a), BC.y + 2.9 * math.sin(a), PZ + 2.2), (BC.x + 4.3 * math.cos(a), BC.y + 4.3 * math.sin(a), bz + 1.6),
             0.35, 0.35, PAL['iron'], PT['metal'])
    # embers bed + flames: fire_core (emissive, origin on the bed: scale with burn volume)
    fire = MB(71)
    fc = Vector((BC.x, BC.y, bz + 1.6))
    lathe(fire, fc, [(3.6, fc.z + 0.3), (2.0, fc.z + 0.75), (0.0, fc.z + 0.9)], (1.0, 0.4, 0.1), 0, 10, smooth=False)
    flames(fire, fc + Vector((0, 0, 0.5)), random.Random(3), 9, 2.6, 3.6, 6.5, col=(1.0, 0.62, 0.2))
    fob = to_object(fire, 'fire_core', 'hb_emissive', parent=root, origin=fc, coll=coll)
    fob['anim'] = 'flames: scale (y up) and emissive ~ burn volume; flicker'
    fe = empty('fire_emitter', (fc.x, fc.y, fc.z + 2.6), parent=root, coll=coll)
    fe['anim'] = 'sparks / embers / heat shimmer from the bowl'
    to_object(grate, 'grate_glow', 'hb_emissive', parent=root, coll=coll)['anim'] = 'kiln grate + drum vent glow ~ burn volume'
    # chain ring of iron posts around the bowl
    for k in range(7):
        a = 2 * math.pi * k / 7 + 0.3
        p = BC + Vector((5.6 * math.cos(a), 5.6 * math.sin(a), 0))
        if p.y > -1.5:
            continue
        cyl(op, p, 0.18, 0.14, PZ, PZ + 1.2, PAL['iron'], PT['metal'], 6)
        sphere(op, (p.x, p.y, PZ + 1.3), 0.2, PAL['iron'], 6, 3)
    # ---- loading tower + the coin chute down into the bowl
    TX0, TX1, TY0, TY1, TZ = 5.6, 10.4, -7.6, -2.8, PZ + 8.0
    box2(op, TX0, TY0, PZ, TX1, TY1, TZ, PAL['stone_dark'], PT['ashlar'])
    box2(op, TX0 - 0.3, TY0 - 0.3, TZ, TX1 + 0.3, TY1 + 0.3, TZ + 0.45, PAL['stone_light'], 0)
    rail(op, [(TX0 - 0.2, TY0 - 0.2, TZ + 0.45), (TX1 + 0.2, TY0 - 0.2, TZ + 0.45), (TX1 + 0.2, TY1 + 0.2, TZ + 0.45),
              (TX0 - 0.2, TY1 + 0.2, TZ + 0.45)], 1.1, PAL['iron'], 1.2)
    beam(op, (TX0 + 0.4, TY0 + 2.4, TZ + 0.45), (TX0 + 0.4, TY0 + 2.4, TZ + 4.4), 0.3, 0.3, PAL['timber_dark'])     # hoist gallows
    beam(op, (TX0 + 0.4, TY0 + 2.4, TZ + 4.2), (TX0 - 1.4, TY0 + 2.4, TZ + 4.2), 0.3, 0.3, PAL['timber_dark'])
    door(K, (8.0, TY0, PZ), (0, -1, 0), 1.6, 2.8, col=PAL['iron'], frame=PAL['stone_light'])
    window(K, (8.0, TY0, PZ + 5.4), (0, -1, 0), 0.8, 1.4, frame=PAL['stone_light'], arch=True)
    a_ = Vector((TX0 - 0.1, -5.6, TZ - 0.3)); b_ = Vector((BC.x + 2.3, BC.y + 0.9, bz + 3.1))
    d_ = (b_ - a_).normalized(); s_ = d_.cross(Vector((0, 0, 1))).normalized()
    # U-trough: floor + two cheeks, iron with bronze lip; trestle under its middle
    beam(op, a_, b_, 1.5, 0.16, PAL['iron'], PT['metal'])
    for sd in (-1, 1):
        beam(op, a_ + s_ * sd * 0.75 + Vector((0, 0, 0.35)), b_ + s_ * sd * 0.75 + Vector((0, 0, 0.35)), 0.14, 0.7, PAL['bronze_light'], PT['metal'])
    m_ = a_.lerp(b_, 0.5)
    for sd in (-1, 1):
        beam(op, (m_.x + s_.x * sd * 0.6, m_.y + s_.y * sd * 0.6, PZ), (m_.x, m_.y, m_.z - 0.1), 0.25, 0.25, PAL['iron'])
    lathe(op, (TX0 + 0.5, -5.6), [(0.4, TZ - 0.2), (1.2, TZ + 1.1)], PAL['iron'], PT['metal'], 6, smooth=False, cap=False)
    cc = empty('coin_chute', tuple(a_ + Vector((0.4, 0, 0.9))), parent=root, coll=coll)
    cc['anim'] = 'coins enter here (hopper) and slide down the trough to coin_chute_end; rate ~ burn volume'
    ce = empty('coin_chute_end', tuple(b_ + Vector((0, 0, 0.3))), parent=root, coll=coll)
    ce['anim'] = 'coins drop from here into the fire'
    # coins waiting at the tower foot + tools + ash heaps
    lathe(op, (11.5, -10.0), [(2.0, PZ), (1.2, PZ + 0.7), (0.0, PZ + 1.0)], PAL['gold'], PT['metal'], 9, smooth=False)
    coin_crate(op, (9.0, -9.8, PZ)); coin_crate(op, (12.2, -7.4, PZ), 0.3)
    for (x, y, r) in ((-8.5, -1.0, 1.8), (-9.0, -4.5, 1.2), (3.5, -10.5, 1.1)):
        lathe(op, (x, y), [(r, PZ), (r * 0.5, PZ + r * 0.35), (0.0, PZ + r * 0.45)], PAL['ash'], PT['rock'], 7, smooth=False)
    for k in range(3):   # rakes leaning on the drum
        a = -0.4 + k * 0.3
        p = BC + Vector((3.1 * math.cos(a + 3.6), 3.1 * math.sin(a + 3.6), PZ))
        beam(op, p, p + Vector((0.4, 0.2, 3.2)), 0.1, 0.1, PAL['timber_dark'])
    K.emit(root, 'burn_body', coll)
    return root, dict(anchors=dict(platform_y=PZ, bowl_centre=[round(BC.x, 2), round(bz + 1.6, 2), round(-BC.y, 2)],
                                   chute=[[round(a_.x, 2), round(a_.z, 2), round(-a_.y, 2)], [round(b_.x, 2), round(b_.z, 2), round(-b_.y, 2)]]))
