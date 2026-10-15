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
    for (x, z, h) in ((0.0, zt + 0.55 + PR + 0.3, 1.5), (TX0 - 0.4, zt + 0.5, 0.95), (TX1 + 0.4, zt + 0.5, 0.95)):   # gilt acroteria
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
        box2(op, kx - 0.55, ky - 0.55, Z0 + 3.5, kx + 0.55, ky + 0.55, Z0 + 5.0, PAL['lime_dark'], PT['ashlar'])
        box2(op, kx - 0.7, ky - 0.7, Z0 + 5.0, kx + 0.7, ky + 0.7, Z0 + 5.3, PAL['soot2'], 0)
        poly(op, ((kx - 0.4, ky - 0.4, Z0 + 5.31), (kx + 0.4, ky - 0.4, Z0 + 5.31), (kx + 0.4, ky + 0.4, Z0 + 5.31), (kx - 0.4, ky + 0.4, Z0 + 5.31)),
             (0.01, 0.01, 0.01), 0, nrm=(0, 0, 1), jitter=0.0)
        e = empty(f'chimney_{i}', (kx, ky, Z0 + 5.5), parent=root, coll=coll)
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
    ingot_stack(op, (-8.5, -15.0, Z0), 3, 2, 2)
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
