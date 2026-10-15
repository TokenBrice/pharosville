"""Harbour civic kit - the Mint (temple-treasury of Moneta) and the Burn (fire altar on a rocky point)."""
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


def coin_press(K, root, i, xc, yc, coll=None):
    """Timber screw press (olive-press type): stone anvil block, two posts, a head beam (static, in the body);
    press_N = the screw, bronze ram and capstan bars, its origin at the capstan (turns about glTF Y, drops on a strike)."""
    op = K.op
    box2(op, xc - 0.9, yc - 0.7, Z0, xc + 0.9, yc + 0.7, Z0 + 0.9, PAL['lime'], PT['ashlar'])
    box2(op, xc - 0.4, yc - 0.4, Z0 + 0.9, xc + 0.4, yc + 0.4, Z0 + 1.15, PAL['bronze'], PT['metal'])
    for s in (-1, 1):
        box2(op, xc + s * 1.05 - 0.2, yc - 0.25, Z0, xc + s * 1.05 + 0.2, yc + 0.25, Z0 + 3.5, PAL['oak_dark'], PT['boards'])
    box2(op, xc - 1.5, yc - 0.35, Z0 + 3.5, xc + 1.5, yc + 0.35, Z0 + 4.1, PAL['oak_dark'], PT['boards'])
    mb = MB(100 + i)
    zf = Z0 + 4.6
    cyl(mb, (xc, yc), 0.17, 0.17, Z0 + 1.45, zf + 0.25, PAL['timber'], PT['boards'], 6)
    box2(mb, xc - 0.34, yc - 0.34, Z0 + 1.2, xc + 0.34, yc + 0.34, Z0 + 1.5, PAL['bronze_light'], PT['metal'])
    beam(mb, (xc - 1.7, yc, zf), (xc + 1.7, yc, zf), 0.16, 0.16, PAL['timber'])
    beam(mb, (xc, yc - 1.7, zf), (xc, yc + 1.7, zf), 0.16, 0.16, PAL['timber'])
    ob = to_object(mb, f'press_{i}', 'hb_opaque', parent=root, origin=(xc, yc, zf), coll=coll)
    ob['anim'] = 'screw press: rotate about local +Y (glTF) +/-0.7 rad and drop 0.3 m on each strike; rate ~ mint volume'
    return ob


def build_mint(coll=None):
    """The Mint as the temple-treasury of Moneta (classical-town PLAN §4.1, concept A): a hexastyle Doric treasury with a
    gilt coin in its blue tympanum at the back of a forecourt; the coining workshop on the left with the screw presses in
    its arch mouths on the plot front (the runtime's press glints sit 1.5 m behind the plot front); three domed clay kilns
    on the right whose short flues carry the smoke; the undershot wheel in its stone race with the wheel-house behind."""
    root = empty('mint', coll=coll)
    K = Kit(11)
    op, em = K.op, K.em
    # ---- plinth with the race cut out
    box2(op, -32, -22, Z0 - 2.6, 32, 22, Z0, PAL['sandstone'], PT['ashlar'], skip=('+z', '-z'))
    RY0, RY1, RZ = 1.6, 4.8, Z0 - 1.6
    for (x0, y0, x1, y1) in ((-32, -22, 9.4, 22), (9.4, -22, 32, RY0), (9.4, RY1, 32, 22)):
        poly(op, ((x0, y0, Z0), (x1, y0, Z0), (x1, y1, Z0), (x0, y1, Z0)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    for y, n in ((RY0, (0, 1, 0)), (RY1, (0, -1, 0))):
        poly(op, ((9.4, y, RZ - 0.4), (32, y, RZ - 0.4), (32, y, Z0), (9.4, y, Z0)), PAL['lime_dark'], PT['ashlar'], nrm=n)
    poly(op, ((9.4, RY0, RZ - 0.4), (9.4, RY1, RZ - 0.4), (9.4, RY1, Z0), (9.4, RY0, Z0)), PAL['lime_dark'], PT['ashlar'], nrm=(1, 0, 0))
    poly(op, ((9.4, RY0, RZ), (32.0, RY0, RZ), (32.0, RY1, RZ), (9.4, RY1, RZ)), PAL['water'], 0, nrm=(0, 0, 1), jitter=0.0)
    for y in (RY0 - 0.35, RY1 + 0.35):    # coping
        box2(op, 9.4, y - 0.35, Z0, 32, y + 0.35, Z0 + 0.35, PAL['lime'], PT['ashlar'])
    box2(op, 10.0, RY0 - 0.5, Z0, 10.8, RY1 + 0.5, Z0 + 2.2, PAL['oak_dark'], PT['boards'])       # sluice
    for y in (RY0 - 0.4, RY1 + 0.4):
        box2(op, 10.0, y - 0.25, Z0, 10.8, y + 0.25, Z0 + 3.4, PAL['oak_dark'], 0)
    beam(op, (10.4, RY0 - 0.4, Z0 + 3.3), (10.4, RY1 + 0.4, Z0 + 3.3), 0.3, 0.3, PAL['oak_dark'])
    # ---- temenos wall (back + sides), stucco with a tile coping; the race runs out through the east wall
    for (a, b, c_, d) in ((-32, 21.2, 32, 22), (-32, -7.5, -31.2, 21.2), (31.2, -22, 32, RY0 - 0.7), (31.2, RY1 + 0.7, 32, 21.2)):
        box2(op, a, b, Z0, c_, d, Z0 + 2.6, PAL['wash_cream'], PT['render'])
        box2(op, a - 0.15, b - 0.15, Z0 + 2.6, c_ + 0.15, d + 0.15, Z0 + 2.95, PAL['tile_ridge'], PT['tiles'])

    # ---- the temple-treasury: crepidoma, hexastyle Doric portico, cella, blue pediment with the gilt coin
    TX0, TX1, TY0, TY1 = -8.0, 8.0, -4.2, 15.6
    ZC = Z0 + 1.2
    for k in range(3):
        g = 0.55 * (2 - k)
        box2(op, TX0 - 0.6 - g, TY0 - 1.2 - g, Z0 + 0.4 * k, TX1 + 0.6 + g, TY1 + 0.6 + g, Z0 + 0.4 * (k + 1), PAL['lime'], PT['ashlar'],
             skip=('-z',))
    xs = colonnade(op, TX0 + 0.9, TX1 - 0.9, TY0 + 0.4, ZC, 7.4, 6, 0.62, PAL['marble'], cap_col=PAL['lime'])
    for x in xs:
        cyl(op, (x, TY0 + 0.4), 0.56, 0.56, ZC + 6.45, ZC + 6.7, PAL['poly_red'], 0, 8, top=False)
    box2(op, TX0 + 0.6, TY0 + 3.2, ZC, TX1 - 0.6, TY1, ZC + 7.4, PAL['wash_cream'], PT['render'])          # cella
    arch_door(K, (0.0, TY0 + 3.17, ZC), (0, -1, 0), 2.8, 5.0, PAL['bronze'], PAL['marble'], step=False, fanlight=True)
    for x in (-4.6, 4.6):        # gilt shields on the pronaos wall
        disc(op, (x, TY0 + 3.17, ZC + 3.6), (0, -1, 0), 1.0, 0.12, PAL['gilt'], 10, col_side=PAL['bronze'])
    for y in (2.5, 8.5, 13.0):   # high plain openings down the long sides
        for s in (-1, 1):
            plain_window(K, (s * (TX1 - 0.6), y, ZC + 5.2), (s, 0, 0), 0.9, 1.3, PAL['wash_cream'], lit=0.9, warm=0.2)
    zt = entablature(op, TX0, TX1, TY0 - 0.2, TY1, ZC + 7.4)
    PR = rise_for((TX1 - TX0) / 2 + 0.1, 20.0)
    pediment(op, TX0 - 0.1, TX1 + 0.1, TY0 - 0.55, TY1, zt + 0.55, PR, PAL['marble'], tymp=PAL['poly_blue'], cornice=0.45)
    tiled_gable(op, TX0 - 0.1, TY0 - 0.55, TX1 + 0.1, TY1 + 0.3, zt + 0.55, 20.0, PAL['tile_a'], 'y', ov=0.35, ends=False)
    poly(op, ((TX0, TY1 + 0.3, zt + 0.55), (TX1, TY1 + 0.3, zt + 0.55), (0, TY1 + 0.3, zt + 0.55 + PR)), PAL['wash_cream'], PT['render'],
         nrm=(0, 1, 0))
    mcz = zt + 0.55 + PR * 0.42
    disc(op, (0.0, TY0 - 0.3, mcz), (0, -1, 0), 1.25, 0.25, PAL['gold'], 16, PT['metal'], col_side=PAL['gilt'])    # the coin
    disc(op, (0.0, TY0 - 0.55, mcz), (0, -1, 0), 0.95, 0.06, PAL['gilt'], 16, PT['metal'])
    for k in range(12):
        a = 2 * math.pi * k / 12
        obox(op, Vector((1.1 * math.cos(a), TY0 - 0.6, mcz + 1.1 * math.sin(a))), (1, 0, 0), (0, 1, 0), 0.14, 0.12, 0.14, PAL['gold'])
    # the Mint's sign at overview: a great gilt coin standing on the apex as the central acroterion
    za = zt + 0.55 + PR + 0.15
    box2(op, -0.7, TY0 - 0.8, za - 0.3, 0.7, TY0 + 0.2, za + 0.35, PAL['marble'], 0)
    disc(op, (0.0, TY0 + 0.05, za + 1.95), (0, -1, 0), 1.6, 0.4, PAL['gold'], 16, PT['metal'], col_side=PAL['gilt'])
    disc(op, (0.0, TY0 - 0.4, za + 1.95), (0, -1, 0), 1.2, 0.06, PAL['gilt'], 16, PT['metal'])
    disc(op, (0.0, TY0 + 0.05, za + 1.95), (0, 1, 0), 1.6, 0.06, PAL['gold'], 16, PT['metal'])
    for (x, z, h) in ((TX0 - 0.4, zt + 0.5, 0.95), (TX1 + 0.4, zt + 0.5, 0.95)):   # gilt corner acroteria
        poly(op, ((x - 0.5, TY0 - 1.0, z), (x + 0.5, TY0 - 1.0, z), (x + 0.25, TY0 - 1.0, z + h * 0.6), (x, TY0 - 1.0, z + h),
                  (x - 0.25, TY0 - 1.0, z + h * 0.6)), PAL['gilt'], 0, nrm=(0, -1, 0), jitter=0.0)

    # ---- the coining workshop (left, on the plot front): an arcade of three bays, a press in each arch mouth
    WX0, WX1, WY0, WY1, WZ = -31.0, -13.0, -19.0, -8.0, Z0 + 6.4
    box2(op, WX0, WY0 + 0.6, Z0, WX1, WY1, WZ, PAL['wash_ochre'], PT['render'], skip=('-y',))
    box2(op, WX0 + 0.3, WY0 + 0.6, Z0, WX1 - 0.3, WY0 + 2.6, WZ - 0.4, PAL['interior'], 0, skip=('-z', '+z', '+y'))
    bays = arcade(op, WX0, WX1, WY0, 0.6, Z0, WZ, 3, 1.2, Z0 + 3.4, PAL['wash_ochre'], PT['render'], keystone=PAL['lime'])
    box2(op, WX0 - 0.2, WY0 - 0.2, Z0, WX1 + 0.2, WY0 + 0.8, Z0 + 0.6, PAL['sandstone'], PT['ashlar'])
    frieze(op, (WX0, WY0), (WX1, WY0), WZ - 1.9, 0.5, (0, -1, 0))
    frieze(op, (WX1, WY0), (WX1, WY1), WZ - 1.9, 0.5, (1, 0, 0))
    tiled_gable(op, WX0, WY0, WX1, WY1, WZ, 21.0, PAL['tile_b'], 'x', ov=0.45, end_col=PAL['wash_ochre'])
    for y in (-14.5, -10.5):
        plain_window(K, (WX1, y, Z0 + 3.0), (1, 0, 0), 0.9, 1.3, PAL['wash_ochre'], shutter=PAL['shutter_green'])
    arch_door(K, (WX1, -12.5, Z0), (1, 0, 0), 1.4, 2.8, PAL['oak_dark'], PAL['lime'])
    glow = MB(50)
    for i, (xc, r) in enumerate(bays):
        coin_press(K, root, i, xc, WY0 - 0.9, coll)
        box2(op, xc + 1.6, WY0 - 1.6, Z0, xc + 2.8, WY0 - 0.4, Z0 + 0.9, PAL['oak_dark'], PT['planks_x'])     # coin tray (the glint)
        cyl(op, (xc + 2.2, WY0 - 1.0), 0.45, 0.45, Z0 + 0.9, Z0 + 1.1, PAL['gold'], PT['metal'], 8)
        # the annealing hearth glowing at the back of each bay
        poly(glow, ((xc - 1.0, WY0 + 2.55, Z0 + 0.3), (xc + 1.0, WY0 + 2.55, Z0 + 0.3), (xc + 1.0, WY0 + 2.55, Z0 + 1.5),
                    (xc - 1.0, WY0 + 2.55, Z0 + 1.5)), (1.0, 0.45, 0.12), 0, nrm=(0, -1, 0), jitter=0.0)

    # ---- three domed kilns (right front); their short stone flues are chimney_N; glowing mouths -> furnace_glow
    for i, kx in enumerate((14.5, 19.6, 24.7)):
        ky = -12.6
        lathe(op, (kx, ky), [(2.1, Z0), (2.15, Z0 + 1.2), (1.85, Z0 + 2.4), (1.2, Z0 + 3.3), (0.6, Z0 + 3.7)], PAL['clay'], PT['render'], 9,
              smooth=True, cap=False, colfn=lambda z: mix(PAL['clay'], PAL['soot2'], sstep(Z0 + 1.6, Z0 + 3.9, z)))
        # stone flues tall enough that the smoke clears the treasury's roof; the middle one taller, bronze-capped
        FH = Z0 + (15.5 if i == 1 else 9.5)
        box2(op, kx - 0.6, ky - 0.6, Z0 + 3.5, kx + 0.6, ky + 0.6, FH, PAL['lime_dark'], PT['ashlar'])
        for zz in (Z0 + 6.0, FH - 3.0) if i == 1 else (Z0 + 6.0,):
            box2(op, kx - 0.72, ky - 0.72, zz, kx + 0.72, ky + 0.72, zz + 0.35, PAL['sandstone'], 0)
        box2(op, kx - 0.75, ky - 0.75, FH, kx + 0.75, ky + 0.75, FH + 0.35, PAL['bronze'] if i == 1 else PAL['soot2'], PT['metal'] if i == 1 else 0)
        poly(op, ((kx - 0.45, ky - 0.45, FH + 0.36), (kx + 0.45, ky - 0.45, FH + 0.36), (kx + 0.45, ky + 0.45, FH + 0.36), (kx - 0.45, ky + 0.45, FH + 0.36)),
             (0.01, 0.01, 0.01), 0, nrm=(0, 0, 1), jitter=0.0)
        if i == 1:
            for (dx, dy) in ((-0.6, -0.6), (0.6, -0.6), (0.6, 0.6), (-0.6, 0.6)):
                box2(op, kx + dx - 0.07, ky + dy - 0.07, FH + 0.35, kx + dx + 0.07, ky + dy + 0.07, FH + 1.2, PAL['bronze'], PT['metal'])
            lathe(op, (kx, ky), [(1.05, FH + 1.15), (0.0, FH + 1.9)], PAL['bronze_light'], PT['metal'], 8, smooth=False)
            sphere(op, (kx, ky, FH + 2.05), 0.22, PAL['gilt'], 6, 3)
        e = empty(f'chimney_{i}', (kx, ky, FH + 0.55), parent=root, coll=coll)
        e['anim'] = 'smoke emitter at the kiln flue; puff rate/darkness ~ mint volume'
        fy = ky - 2.6
        box2(op, kx - 1.0, fy, Z0, kx + 1.0, ky - 1.2, Z0 + 2.1, PAL['lime'], PT['ashlar'])
        arc = [(kx + 0.55 * math.cos(math.pi * k / 6), Z0 + 1.1 + 0.55 * math.sin(math.pi * k / 6)) for k in range(7)]
        poly(glow, [(kx - 0.55, fy - 0.03, Z0 + 0.25), (kx + 0.55, fy - 0.03, Z0 + 0.25)] + [(x, fy - 0.03, z) for x, z in arc],
             (1.0, 0.45, 0.12), 0, nrm=(0, -1, 0), jitter=0.0)
        box2(glow, kx - 0.5, fy - 0.9, Z0, kx + 0.5, fy, Z0 + 0.15, (1.0, 0.5, 0.15), 0, skip=('-z',))   # ember spill
        crate(op, (kx + 1.4, fy - 0.6, Z0), 0.7, PAL['oak_dark'], 0.5)
    gl = to_object(glow, 'furnace_glow', 'hb_emissive', parent=root, coll=coll)
    gl['anim'] = 'kiln mouths, ember spills + the workshop hearths: emissive strength ~ mint volume (flicker)'

    # ---- the wheel-house (back right): an ochre hall under a tiled gable facing the race
    HX0, HX1, HY0, HY1 = 11.0, 31.0, 7.0, 20.0
    box2(op, HX0, HY0, Z0, HX1, HY1, Z0 + 6.6, PAL['wash_sienna'], PT['render'])
    socle(op, HX0, HY0, HX1, HY1, Z0, 0.9)
    frieze(op, (HX0, HY0), (HX1, HY0), Z0 + 4.6, 0.5, (0, -1, 0), ground=PAL['poly_blue'], key=PAL['wash_white'])
    tiled_gable(op, HX0, HY0, HX1, HY1, Z0 + 6.6, 21.0, PAL['tile_c'], 'x', ov=0.45, end_col=PAL['wash_sienna'])
    for x in (13.5, 16.5, 25.5, 28.5):
        plain_window(K, (x, HY0, Z0 + 3.2), (0, -1, 0), 0.9, 1.3, PAL['wash_sienna'], shutter=PAL['shutter_green'])
    arch_door(K, (26.5, HY0, Z0), (0, -1, 0), 1.6, 3.0, PAL['oak_dark'], PAL['lime'])
    disc(op, (21.0, HY0, Z0 + 2.4), (0, -1, 0), 0.9, 0.3, PAL['bronze'], 8, PT['metal'])      # the gear housing for the axle
    wheel = MB(60)
    wc = Vector((21.0, (RY0 + RY1) / 2, Z0 + 1.6))
    R_, W_ = 4.4, 2.4
    for yy in (wc.y - W_ / 2, wc.y + W_ / 2):
        for k in range(16):
            a0, a1 = 2 * math.pi * k / 16, 2 * math.pi * (k + 1) / 16
            pa = wc + Vector((R_ * math.cos(a0), yy - wc.y, R_ * math.sin(a0)))
            pb = wc + Vector((R_ * math.cos(a1), yy - wc.y, R_ * math.sin(a1)))
            beam(wheel, pa, pb, 0.28, 0.4, PAL['oak_dark'], up=Vector((0, 1, 0)))
        for k in range(8):
            a = 2 * math.pi * (k + 0.25) / 8
            beam(wheel, wc + Vector((0, yy - wc.y, 0)), wc + Vector((R_ * math.cos(a), yy - wc.y, R_ * math.sin(a))), 0.22, 0.22, PAL['timber'])
    for k in range(16):   # paddles
        a = 2 * math.pi * (k + 0.5) / 16
        d = Vector((math.cos(a), 0, math.sin(a)))
        box(wheel, wc + d * (R_ - 0.45), (0.85, W_ + 0.2, 0.12), PAL['timber'], PT['boards'], axes=(d, Vector((0, 1, 0)), Vector((-d.z, 0, d.x))))
    rod(wheel, wc - Vector((0, W_ / 2 + 0.6, 0)), wc + Vector((0, W_ / 2 + 1.2, 0)), 0.32, PAL['bronze'], 8, cap=True)
    wob = to_object(wheel, 'wheel', 'hb_opaque', parent=root, origin=wc, coll=coll)
    wob['anim'] = 'waterwheel: rotate about local Z (glTF; the axle, Blender Y); undershot - turns with the flow; speed ~ mint volume'
    for yy in (RY0 - 0.35, RY1 + 0.35):   # axle bearings
        box2(op, 20.4, yy - 0.35, Z0, 21.6, yy + 0.35, Z0 + 1.4, PAL['lime'], PT['ashlar'])

    # ---- forecourt + yard: an altar-table of ingots before the steps, bronze braziers, ingot stacks, coin chests, amphorae
    box2(op, -1.8, -9.6, Z0, 1.8, -8.0, Z0 + 1.0, PAL['marble'], 0)
    for k in range(4):
        box2(op, -1.5 + k * 0.78, -9.2, Z0 + 1.0, -0.9 + k * 0.78, -8.4, Z0 + 1.25, PAL['gold'], PT['metal'])
    for (x, y) in ((-6.0, -8.0), (6.0, -8.0), (-11.0, -20.5), (10.5, -20.5)):
        cyl(op, (x, y), 0.15, 0.1, Z0, Z0 + 3.2, PAL['bronze'], 0, 6)
        lathe(op, (x, y), [(0.15, Z0 + 3.1), (0.55, Z0 + 3.25), (0.6, Z0 + 3.5)], PAL['bronze_light'], PT['metal'], 8, smooth=True, cap=False)
        cyl(em, (x, y), 0.5, 0.5, Z0 + 3.4, Z0 + 3.45, (1.0, 0.6, 0.2), 0, 8)
    # the bullion store along the back-left wall: a lean-to stoa of square piers, amphorae and ingots under it; olives
    SX0, SX1, SY = -30.6, -12.0, 15.2
    box2(op, SX0, SY + 1.4, Z0, SX1, 21.2, Z0 + 4.6, PAL['wash_cream'], PT['render'])
    for k in range(6):
        x = SX0 + 0.4 + (SX1 - SX0 - 0.8) * k / 5
        box2(op, x - 0.3, SY - 0.3, Z0, x + 0.3, SY + 0.3, Z0 + 3.3, PAL['lime'], PT['ashlar'])
    box2(op, SX0, SY - 0.4, Z0 + 3.3, SX1, SY + 1.4, Z0 + 3.7, PAL['lime'], 0)
    lean_to(op, SX0, SX1, SY - 0.4, Z0 + 3.7, 21.2, Z0 + 5.6, PAL['tile_b'])
    for k in range(5):
        amphora(op, (SX0 + 2.5 + k * 1.0, SY + 2.6, Z0), 1.05)
    ingot_stack(op, (-17.5, SY + 2.8, Z0), 3, 2, 2)
    rng = random.Random(11)
    for (x, y) in ((-22.0, 6.0), (-16.0, 1.0), (-25.5, -2.5)):
        cyl(op, (x, y), 0.25, 0.16, Z0, Z0 + 2.0, PAL['oak_dark'], PT['boards'], 5)
        foliage(op, rng, (x, y, Z0 + 2.9), 1.5, [PAL['olive_leaf'], PAL['olive_dark']], 3, 0.6, LEAF_EVERGREEN)
    ingot_stack(op, (14.0, -5.5, Z0), 4, 3, 3)
    ingot_stack(op, (26.5, -4.0, Z0), 3, 3, 3)
    # the counting yard in the forecourt: a linen workers' velarium over a counting table and an ingot stack, coin
    # carts, a small fire altar, amphorae (clear of the press arches and of the worker path)
    cloth = Kit(13)
    velarium(cloth, (-10.5, -13.4), (-1.5, -13.4), 3.8, Z0 + 3.4, Z0 + 3.0, n_out=(0, -1, 0), ground=Z0, panels=6)
    for f in cloth.cover.f:
        poly(op, [cloth.cover.v[i] for i in f['i']], tuple(c * k for c, k in zip(PAL['linen'], f['col'])), 0, jitter=0.0)
    for f in cloth.op.f:
        poly(op, [cloth.op.v[i] for i in f['i']], f['col'], f['pat'], jitter=0.0)
    box2(op, -6.6, -16.2, Z0, -3.0, -15.0, Z0 + 0.95, PAL['oak'], PT['planks_x'])
    for k in range(5):
        cyl(op, (-6.2 + k * 0.8, -15.6), 0.3, 0.3, Z0 + 0.95, Z0 + 1.1 + 0.12 * (k % 3), PAL['gold'], PT['metal'], 7)
    ingot_stack(op, (-8.8, -15.4, Z0), 3, 2, 2)
    for (cx_, cy_, a_) in ((-4.0, -19.0, 0.0), (18.0, -6.8, 0.4)):      # coin carts: a tray of ingots on two wheels
        t_ = Vector((math.cos(a_), math.sin(a_), 0)); n_ = Vector((-t_.y, t_.x, 0)); c_ = Vector((cx_, cy_, Z0 + 0.8))
        obox(op, c_, t_, n_, 2.2, 1.3, 0.2, PAL['timber'], PT['planks_x'])
        for s_ in (-1, 1):
            disc(op, c_ + n_ * s_ * 0.66 - Vector((0, 0, 0.2)), n_ * s_, 0.6, 0.12, PAL['oak_dark'], 8)
        beam(op, c_ + t_ * 1.1, c_ + t_ * 2.6 - Vector((0, 0, 0.6)), 0.1, 0.1, PAL['timber'])
        ingot_stack(op, (c_.x, c_.y, c_.z + 0.1), 2, 2, 2)
    box2(op, -9.2, -9.4, Z0, -7.6, -7.8, Z0 + 1.1, PAL['marble'], 0)                 # the small fire altar
    box2(op, -9.4, -9.6, Z0 + 1.1, -7.4, -7.6, Z0 + 1.3, PAL['poly_red'], 0)
    lathe(op, (-8.4, -8.6), [(0.2, Z0 + 1.3), (0.6, Z0 + 1.45), (0.65, Z0 + 1.7)], PAL['bronze_light'], PT['metal'], 8, smooth=True, cap=False)
    cyl(em, (-8.4, -8.6), 0.55, 0.55, Z0 + 1.6, Z0 + 1.65, (1.0, 0.6, 0.2), 0, 8)
    for (x, y) in ((-2.0, -17.0), (-1.3, -17.4), (-1.8, -16.2), (23.5, -7.6), (24.2, -7.9), (6.8, -19.2)):
        amphora(op, (x, y, Z0), 1.0)
    for k, (x, y) in enumerate(((24.0, -19.0), (25.3, -19.0), (26.6, -19.0), (6.0, -16.5), (7.3, -16.5))):
        coin_crate(op, (x, y, Z0), rz=0.05 * (k % 3))
    for (x, y) in ((28.5, -19.5), (29.2, -19.0), (28.8, -18.2), (-28.5, -4.0), (-27.8, -4.4)):
        amphora(op, (x, y, Z0), 1.0)
    K.emit(root, 'mint_body', coll)
    # worker path: a closed loop past the presses, the altar, the kiln mouths, the wheel and back over the forecourt
    pts = [(0.0, -20.8), (-14.0, -21.3), (-27.0, -21.3), (-24.0, -16.5), (-11.0, -12.0), (-4.0, -10.6), (4.0, -11.0), (11.0, -16.8),
           (21.0, -17.4), (28.5, -15.0), (28.5, -6.0), (21.0, -0.6), (11.5, -1.5), (9.0, -9.0), (4.5, -15.5), (0.0, -20.8)]
    wp = empty('worker_path', (0, 0, Z0), parent=root, coll=coll)
    flat = []
    for (x, y) in pts:
        flat += [round(x, 2), round(Z0, 2), round(-y, 2)]
    wp['points_gltf'] = flat
    wp['anim'] = 'closed walking loop for mint workers (glTF x,y,z triplets in the mint frame); crowd ~ mint volume'
    return root, dict(anchors=dict(worker_path=[[round(x, 2), Z0, round(-y, 2)] for x, y in pts], ground_y=Z0,
                                   coin_emblem=[0.0, round(mcz, 2), round(-TY0 + 0.6, 2)]))


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
    """The Burn as a fire altar (classical-town PLAN §4.1, concept A): a dressed octagonal platform on the rocky point, a
    three-step krepis, an Ionic altar (meander frieze, volute cushions) whose hearth glows through a bronze grille, the
    great bronze bowl on a lion-paw tripod with tall flames (fire_core), four bronze torch-stands, and the coin chute as
    a bronze ramp from an offering pier down over the steps into the bowl."""
    root = empty('burn', coll=coll)
    K = Kit(21)
    op = K.op
    rng = random.Random(11)
    PZ = 0.9   # platform top
    # ---- the rocky point: a skirt of warm limestone boulders, then a dressed octagonal platform with a landing stair
    for k in range(11):
        a = 2 * math.pi * k / 11 + 0.2
        rr = 11.9 + rng.uniform(-0.6, 0.5)
        rock_blob(op, (rr * math.cos(a), rr * math.sin(a), -1.2), rng.uniform(2.6, 3.6), rng.uniform(1.4, 2.6), rng,
                  col=mix(PAL['lime_dark'], PAL['rock_dark'], rng.uniform(0.2, 0.6)))
    for (x, y, r, h) in ((-11.5, -11.5, 3.2, 3.0), (11.6, -11.0, 2.8, 2.4), (-12.0, 9.0, 3.0, 3.6), (10.5, 11.8, 3.3, 3.2)):
        rock_blob(op, (x, y, -0.6), r, h, rng, col=mix(PAL['lime_dark'], PAL['rock_dark'], 0.5))
    oct_ = [Vector((11.0 * math.cos(math.pi / 8 + k * math.pi / 4), 11.0 * math.sin(math.pi / 8 + k * math.pi / 4), 0)) for k in range(8)]
    for k in range(8):
        a, b = oct_[k], oct_[(k + 1) % 8]
        poly(op, ((a.x, a.y, -2.5), (b.x, b.y, -2.5), (b.x, b.y, PZ), (a.x, a.y, PZ)), PAL['sandstone'], PT['ashlar'], nrm=a + b)
        t = 1 - min(1, ((a + b) / 2).length / 14)
        poly(op, ((0, 0, PZ), (a.x, a.y, PZ), (b.x, b.y, PZ)), mix(PAL['quay'], PAL['soot2'], 0.2 + 0.25 * t), PT['cobble'], nrm=(0, 0, 1))
        beam(op, (a.x, a.y, PZ + 0.2), (b.x, b.y, PZ + 0.2), 0.6, 0.4, PAL['lime'])
    stairs(op, -1.8, 1.8, -12.8, -1.6, PZ, 5, 0.55, PAL['lime'])
    # ---- the krepis: three steps, alternating limestone and marble
    z = PZ
    for k, hw in enumerate((7.0, 6.0, 5.0)):
        box2(op, -hw, -hw, z, hw, hw, z + 0.5, PAL['lime'] if k % 2 == 0 else PAL['marble'], PT['ashlar'], skip=('-z',))
        z += 0.5
    ZP = z
    # ---- the Ionic altar: moulded plinth, the hearth (glowing behind a bronze grille), meander frieze, cornice, volutes
    AX, AY = 3.2, 2.4
    box2(op, -AX, -AY, ZP, AX, AY, ZP + 0.4, PAL['marble'], 0)
    box2(op, -AX + 0.3, -AY + 0.3, ZP + 0.4, AX - 0.3, AY - 0.3, ZP + 2.2, PAL['marble'], PT['ashlar'])
    meander(op, (-AX + 0.3, -AY + 0.3), (AX - 0.3, -AY + 0.3), ZP + 1.6, 0.5, (0, -1, 0), unit=0.75)
    meander(op, (-AX + 0.3, AY - 0.3), (-AX + 0.3, -AY + 0.3), ZP + 1.6, 0.5, (-1, 0, 0), unit=0.75)
    box2(op, -AX, -AY, ZP + 2.2, AX, AY, ZP + 2.55, PAL['marble'], 0)
    for s in (-1, 1):
        rod(op, (s * (AX - 0.3), -AY - 0.05, ZP + 2.9), (s * (AX - 0.3), AY + 0.05, ZP + 2.9), 0.45, PAL['marble'], 8, cap=True)
        disc(op, (s * (AX - 0.3), -AY - 0.05, ZP + 2.9), (0, -1, 0), 0.32, 0.06, PAL['poly_red'], 8)
    grate = MB(70)
    hy = -AY + 0.28
    hx, hw_, hh = 0.0, 1.5, 1.05
    poly(op, ((hx - hw_ / 2 - 0.2, hy - 0.02, ZP + 0.4), (hx + hw_ / 2 + 0.2, hy - 0.02, ZP + 0.4), (hx + hw_ / 2 + 0.2, hy - 0.02, ZP + 0.6 + hh),
              (hx - hw_ / 2 - 0.2, hy - 0.02, ZP + 0.6 + hh)), PAL['bronze_dark'], PT['metal'], nrm=(0, -1, 0), jitter=0)
    poly(grate, ((hx - hw_ / 2, hy - 0.05, ZP + 0.5), (hx + hw_ / 2, hy - 0.05, ZP + 0.5), (hx + hw_ / 2, hy - 0.05, ZP + 0.5 + hh),
                 (hx - hw_ / 2, hy - 0.05, ZP + 0.5 + hh)), (1.0, 0.45, 0.1), 0, nrm=(0, -1, 0), jitter=0)
    for k in range(6):
        x = hx - hw_ / 2 + 0.12 + k * (hw_ - 0.24) / 5
        box2(op, x - 0.05, hy - 0.2, ZP + 0.5, x + 0.05, hy - 0.08, ZP + 0.5 + hh, PAL['bronze'], 0, skip=('-z', '+z'))
    for s in (-1, 1):    # side vents in the krepis risers: the fire's glow at the platform's feet
        poly(grate, ((s * 7.02, -1.2, PZ + 0.1), (s * 7.02, 1.2, PZ + 0.1), (s * 7.02, 1.2, PZ + 0.4), (s * 7.02, -1.2, PZ + 0.4)), (1.0, 0.45, 0.1), 0,
             nrm=(s, 0, 0), jitter=0)
    # ---- the great bronze bowl on a lion-paw tripod, with a gilt rim and ring handles
    BZ = ZP + 2.55
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 2
        beam(op, (2.2 * math.cos(a), 1.7 * math.sin(a), BZ), (0.9 * math.cos(a), 0.75 * math.sin(a), BZ + 1.8), 0.38, 0.38, PAL['bronze'], PT['metal'])
        sphere(op, (2.2 * math.cos(a), 1.7 * math.sin(a), BZ + 0.22), 0.38, PAL['bronze_light'], 6, 3)
    cyl(op, (0, 0), 0.5, 0.65, BZ, BZ + 1.8, PAL['bronze'], PT['metal'], 8)
    bz = BZ + 1.7
    lathe(op, (0, 0), [(0.65, bz), (2.3, bz + 0.35), (3.4, bz + 1.0), (3.85, bz + 1.6), (4.05, bz + 1.75)], PAL['bronze'], PT['metal'], 16, smooth=True,
          cap=False, colfn=lambda zz: mix(PAL['bronze_dark'], PAL['bronze_light'], sstep(bz, bz + 1.7, zz)))
    lathe(op, (0, 0), [(4.05, bz + 1.75), (4.25, bz + 1.92), (3.85, bz + 1.98)], PAL['gilt'], PT['metal'], 16, smooth=True, cap=False)
    for k in range(4):
        a = 2 * math.pi * k / 4 + math.pi / 4
        disc(op, (3.8 * math.cos(a), 3.8 * math.sin(a), bz + 1.15), (math.cos(a), math.sin(a), 0), 0.38, 0.1, PAL['bronze_light'], 6)
    # fire_core: ember bed + tall faceted flames, origin on the bed (the runtime scales it with burn volume)
    fire = MB(71)
    fc = Vector((0, 0, bz + 1.5))
    lathe(fire, fc, [(3.7, fc.z), (2.2, fc.z + 0.5), (0.0, fc.z + 0.7)], (1.0, 0.4, 0.1), 0, 12, smooth=False)
    flames(fire, fc + Vector((0, 0, 0.4)), random.Random(5), 11, 2.8, 5.0, 9.0, col=(1.0, 0.62, 0.2))
    fob = to_object(fire, 'fire_core', 'hb_emissive', parent=root, origin=fc, coll=coll)
    fob['anim'] = 'flames: scale (y up) and emissive ~ burn volume; flicker'
    empty('fire_emitter', (0, 0, fc.z + 3.0), parent=root, coll=coll)['anim'] = 'sparks / embers / heat shimmer from the bowl'
    smoke = empty('smoke_emitter', (0, 0, fc.z + 9.5), parent=root, coll=coll)
    smoke['anim'] = 'smoke column above the flames: height/darkness ~ burn volume; dominates when the net trend is negative'
    to_object(grate, 'grate_glow', 'hb_emissive', parent=root, coll=coll)['anim'] = 'altar hearth + krepis vents glow ~ burn volume'
    # ---- four bronze torch-stands on the krepis corners
    for (x, y) in ((-6.3, -6.3), (6.3, -6.3), (-6.3, 6.3), (6.3, 6.3)):
        for k in range(3):
            a = 2 * math.pi * k / 3 + 0.4
            beam(op, (x + 0.5 * math.cos(a), y + 0.5 * math.sin(a), PZ + 0.5), (x, y, PZ + 1.6), 0.09, 0.09, PAL['bronze'])
        cyl(op, (x, y), 0.13, 0.09, PZ + 0.5, PZ + 4.0, PAL['bronze'], 0, 6)
        lathe(op, (x, y), [(0.1, PZ + 3.9), (0.55, PZ + 4.1), (0.6, PZ + 4.35)], PAL['bronze_light'], PT['metal'], 7, smooth=True, cap=False)
        flames(K.em, (x, y, PZ + 4.3), random.Random(int(x * 7 + y)), 3, 0.38, 0.9, 1.5, col=(1.0, 0.6, 0.2), segs=4)
    # ---- the offering pier (a stair-cased ashlar block with a bronze hopper) and the bronze chute down over the steps
    QX0, QX1, QY0, QY1, QZ = 6.4, 9.6, -3.4, -0.2, PZ + 6.4
    box2(op, QX0, QY0, PZ, QX1, QY1, QZ, PAL['sandstone'], PT['ashlar'])
    box2(op, QX0 - 0.25, QY0 - 0.25, QZ, QX1 + 0.25, QY1 + 0.25, QZ + 0.4, PAL['marble'], 0)
    frieze(op, (QX0, QY0 - 0.02), (QX1, QY0 - 0.02), QZ - 0.9, 0.6, (0, -1, 0))
    stairs(op, QX0 + 0.3, QX1 - 0.3, QY1, PZ, QZ, 10, 0.55, PAL['lime'], ny=-1)
    arch_door(K, ((QX0 + QX1) / 2, QY0, PZ), (0, -1, 0), 1.3, 2.6, PAL['bronze_dark'], PAL['marble'], step=False)
    hx_, hy_ = QX0 + 0.9, (QY0 + QY1) / 2
    lathe(op, (hx_, hy_), [(0.35, QZ + 0.4), (1.1, QZ + 1.6), (1.15, QZ + 1.75)], PAL['bronze'], PT['metal'], 8, smooth=False, cap=False)
    a_ = Vector((hx_ - 0.4, hy_, QZ + 0.6)); b_ = Vector((2.9, -1.0, bz + 2.0))
    d_ = (b_ - a_).normalized(); s_ = d_.cross(Vector((0, 0, 1))).normalized()
    beam(op, a_, b_, 1.3, 0.16, PAL['bronze'], PT['metal'])
    for sd in (-1, 1):
        beam(op, a_ + s_ * sd * 0.65 + Vector((0, 0, 0.3)), b_ + s_ * sd * 0.65 + Vector((0, 0, 0.3)), 0.12, 0.6, PAL['bronze_light'], PT['metal'])
    m_ = a_.lerp(b_, 0.5)
    for sd in (-1, 1):
        beam(op, (m_.x + s_.x * sd * 0.6, m_.y + s_.y * sd * 0.6, ZP), (m_.x, m_.y, m_.z - 0.1), 0.22, 0.22, PAL['bronze_dark'])
    cc = empty('coin_chute', tuple(a_ + Vector((0.3, 0, 0.9))), parent=root, coll=coll)
    cc['anim'] = 'coins enter here (the offering hopper) and slide down the bronze trough to coin_chute_end; rate ~ burn volume'
    ce = empty('coin_chute_end', tuple(b_ + Vector((0, 0, 0.3))), parent=root, coll=coll)
    ce['anim'] = 'coins drop from here into the fire'
    # ---- offerings at the pier foot: a gilt heap, coin chests, amphorae; ash swept to the platform edge
    lathe(op, (8.8, -6.6), [(1.7, PZ), (1.0, PZ + 0.6), (0.0, PZ + 0.85)], PAL['gold'], PT['metal'], 9, smooth=False)
    coin_crate(op, (6.4, -8.2, PZ)); coin_crate(op, (10.0, -4.6, PZ), 0.3)
    for (x, y) in ((-8.6, -3.2), (-8.9, -2.3), (-8.1, -2.6)):
        amphora(op, (x, y, PZ), 0.95)
    for (x, y, r) in ((-8.5, 3.0, 1.5), (3.5, -9.6, 1.0)):
        lathe(op, (x, y), [(r, PZ), (r * 0.5, PZ + r * 0.35), (0.0, PZ + r * 0.45)], PAL['ash'], PT['rock'], 7, smooth=False)
    K.emit(root, 'burn_body', coll)
    return root, dict(anchors=dict(platform_y=PZ, bowl_centre=[0.0, round(fc.z, 2), 0.0],
                                   chute=[[round(a_.x, 2), round(a_.z, 2), round(-a_.y, 2)], [round(b_.x, 2), round(b_.z, 2), round(-b_.y, 2)]]))
