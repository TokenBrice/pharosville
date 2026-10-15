"""Harbour civic kit - Customs House, Registry, Chart Room, Storm Station, Harbourmaster, Keeper's Log, harbour offices."""
import math, random
from mathutils import Vector
from cv_lib import *


def flag_node(root, p, coll=None, note='house flag'):
    e = empty('flag_pole_top', p, parent=root, coll=coll)
    e['anim'] = f'{note}: the runtime hangs a waving flag here (hoist at this point, flying downwind)'
    return e


def clock(K, c, n, r):
    """Clock face: stone surround, cream dial, 12 ticks, two hands (fixed at ~10:10)."""
    t, n, up = frame3(n)
    c = Vector(c)
    disc(K.op, c, n, r * 1.25, 0.18, PAL['stone_light'], 12)
    disc(K.op, c + n * 0.18, n, r * 1.05, 0.06, PAL['gilt'], 16, PT['metal'])
    disc(K.op, c + n * 0.24, n, r, 0.04, PAL['clock'], 16)
    for k in range(12):
        a = 2 * math.pi * k / 12
        obox(K.op, c + n * 0.3 + (t * math.cos(a) + up * math.sin(a)) * r * 0.82, t, n, 0.16 * r if k % 3 else 0.24 * r, 0.04, 0.16 * r if k % 3 else 0.24 * r,
             PAL['iron'], skip=('-y', '-z', '+x', '-x'))
    for a, L in ((math.radians(150), 0.55), (math.radians(30), 0.78)):
        d = t * math.cos(a) + up * math.sin(a)
        beam(K.op, c + n * 0.32, c + n * 0.32 + d * r * L, 0.05 * r * 2, 0.04, PAL['iron'], up=n)


# =================================================================== CUSTOMS HOUSE  42 x 30
def tower_of_winds(K, root, c, z0, z1, ap, coll=None):
    """The horologion (Tower of the Winds): an octagonal marble drum from z0 to z1 (apothem ap) with sundial faces on
    the three front sides, a painted winds frieze, a low tiled cone and a bronze Triton vane. Returns the vane-mast top."""
    op = K.op
    c = Vector((c[0], c[1], 0))
    R = ap / math.cos(math.pi / 8)
    cyl(op, c, R + 0.25, R + 0.25, z0, z0 + 0.6, PAL['lime'], PT['ashlar'], 8, rot=math.pi / 8)
    cyl(op, c, R, R, z0 + 0.6, z1, PAL['marble'], 0, 8, top=False, rot=math.pi / 8)
    cyl(op, c, R + 0.04, R + 0.04, z1 - 1.5, z1 - 0.6, PAL['poly_blue'], 0, 8, top=False, rot=math.pi / 8)
    cyl(op, c, R + 0.3, R + 0.3, z1 - 0.6, z1, PAL['lime'], 0, 8, rot=math.pi / 8)
    for k in range(8):     # the winds frieze: one ochre figure-panel per face on the blue band
        a = 2 * math.pi * k / 8
        n = Vector((math.cos(a), math.sin(a), 0))
        t = Vector((-n.y, n.x, 0))
        p = c + n * (ap + 0.08) + Vector((0, 0, z1 - 1.05))
        obox(op, p, t, n, ap * 0.55, 0.06, 0.5, PAL['poly_ochre'], skip=('-y',), jitter=0.0)
    zd = (z0 + 0.6 + z1 - 1.5) / 2 + 0.3
    for k in (5, 6, 7):    # dials on the faces toward the front (-y) and the camera side: hour lines fanning from the gnomon
        a = 2 * math.pi * k / 8
        n = Vector((math.cos(a), math.sin(a), 0))
        t = Vector((-n.y, n.x, 0))
        g = c + n * (ap + 0.04) + Vector((0, 0, zd + 0.9))
        for j in range(7):
            u = math.radians(-60 + 20 * j)
            d = t * math.sin(u) - Vector((0, 0, 1)) * math.cos(u)
            beam(op, g + d * 0.25, g + d * (1.7 if j % 3 == 0 else 1.35), 0.07, 0.03, PAL['poly_black'], up=n)
        beam(op, g, g + n * 0.9 - Vector((0, 0, 0.35)), 0.08, 0.08, PAL['bronze'])
    rise = rise_for(R + 0.3, 24.0)
    lathe(op, c, [(R + 0.55, z1 - 0.05), (0.0, z1 + rise)], PAL['tile_a'], PT['tiles'], 8, smooth=False, rot=math.pi / 8)
    zt = z1 + rise
    cyl(op, c, 0.3, 0.16, zt - 0.2, zt + 0.5, PAL['bronze'], PT['metal'], 6)
    cyl(op, c, 0.07, 0.07, zt + 0.5, zt + 3.4, PAL['bronze_dark'], PT['metal'], 4)
    # the Triton: a bronze body with a fish tail and a pointing wand, turned to the wind
    vz = zt + 1.6
    beam(op, (c.x - 0.2, c.y, vz), (c.x + 0.9, c.y, vz + 0.2), 0.42, 0.6, PAL['bronze_light'])
    sphere(op, (c.x + 1.0, c.y, vz + 0.65), 0.22, PAL['bronze_light'], 6, 3)
    poly(op, ((c.x - 0.2, c.y, vz - 0.1), (c.x - 1.3, c.y, vz + 0.4), (c.x - 1.0, c.y, vz - 0.4)), PAL['bronze'], 0, nrm=(0, -1, 0), jitter=0.0)
    beam(op, (c.x + 0.9, c.y, vz + 0.4), (c.x + 2.0, c.y, vz + 1.0), 0.07, 0.07, PAL['bronze'])
    return Vector((c.x, c.y, zt + 3.3))


def build_customs(coll=None):
    """The Customs House as an Ionic hall: a sandstone podium and steps, a rusticated ground storey and a cream upper
    storey under a low terracotta hip with antefixes, a hexastyle Ionic portico whose blue pediment carries the gilt
    anchor, and on the roof the octagonal Tower of the Winds (sundials, Triton vane) - the old clock tower's time cue."""
    root = empty('customs', coll=coll)
    K = Kit(41)
    op = K.op
    P = 1.6
    box2(op, -20.5, -13.0, -2.0, 20.5, 14.5, P, PAL['sandstone'], PT['ashlar'])
    box2(op, -20.7, -13.2, P - 0.3, 20.7, 14.7, P, PAL['lime'], 0, skip=('-z',))
    stairs(op, -9.5, 9.5, -15.0, 0.0, P, 5, 0.4, PAL['lime'])
    for s in (-1, 1):   # cheek blocks with bronze tripod lamps
        box2(op, s * 10.2 - 0.9, -15.0, -0.5, s * 10.2 + 0.9, -13.0, P + 0.9, PAL['lime'], PT['ashlar'])
        tripod_lamp(K, (s * 10.2, -14.0, P + 0.9), 1.5)
    X0, X1, Y0, Y1, E = -18.0, 18.0, -10.0, 13.0, P + 9.8
    G = P + 4.4
    box2(op, X0 - 0.2, Y0 - 0.2, P, X1 + 0.2, Y1 + 0.2, G, PAL['lime'], PT['ashlar'])            # rusticated ground storey
    box2(op, X0, Y0, G, X1, Y1, E, PAL['wash_cream'], PT['render'])
    box2(op, X0 - 0.3, Y0 - 0.3, G, X1 + 0.3, Y1 + 0.3, G + 0.35, PAL['marble'], 0)                  # string course
    for (a, b, n) in (((X0, Y0), (X1, Y0), (0, -1, 0)), ((X1, Y0), (X1, Y1), (1, 0, 0)), ((X0, Y1), (X0, Y0), (-1, 0, 0))):
        frieze(op, a, b, E - 1.95, 0.6, n)
    box2(op, X0 - 0.45, Y0 - 0.45, E, X1 + 0.45, Y1 + 0.45, E + 0.55, PAL['marble'], 0)              # cornice
    tiled_hip(op, X0, Y0, X1, Y1, E + 0.55, 21.0, PAL['tile_a'], ov=0.35, antefix='all')
    # windows: ground arches + upper plain openings (no shutters on the senior building), sides alike
    for x in (-16.0, -13.2, -10.4, 10.4, 13.2, 16.0):
        plain_window(K, (x, Y0 - 0.2, P + 1.8), (0, -1, 0), 1.2, 1.7, PAL['lime'], arch=True)
        plain_window(K, (x, Y0, G + 2.4), (0, -1, 0), 1.1, 1.9, PAL['wash_cream'])
    for y in (-5.0, 1.5, 8.0):
        for s in (-1, 1):
            plain_window(K, (s * (X1 + 0.2), y, P + 1.8), (s, 0, 0), 1.2, 1.7, PAL['lime'], arch=True)
            plain_window(K, (s * X1, y, G + 2.4), (s, 0, 0), 1.1, 1.9, PAL['wash_cream'])
    # the portico: six Ionic columns, an entablature with a painted frieze, the pediment with the gilt anchor
    ZC = P + 9.0
    ionic_colonnade(op, -8.2, 8.2, -12.0, P, ZC - P, 6, 0.6, PAL['marble'], PAL['lime'])
    zt = entablature(op, -9.4, 9.4, -13.0, Y0, ZC, kind='meander')
    PR = rise_for(9.6, 21.0)
    pediment(op, -9.6, 9.6, -13.3, Y0, zt + 0.5, PR, PAL['marble'], tymp=PAL['poly_blue'], cornice=0.45)
    tiled_gable(op, -9.6, -13.3, 9.6, Y0 + 3.0, zt + 0.5, 21.0, PAL['tile_a'], 'y', ov=0.0, ends=False, antefix=None)
    for (x, z, h) in ((0.0, zt + 0.5 + PR + 0.25, 1.3), (-9.9, zt + 0.45, 0.9), (9.9, zt + 0.45, 0.9)):    # gilt acroteria
        poly(op, ((x - 0.45, -13.75, z), (x + 0.45, -13.75, z), (x + 0.22, -13.75, z + h * 0.6), (x, -13.75, z + h),
                  (x - 0.22, -13.75, z + h * 0.6)), PAL['gilt'], 0, nrm=(0, -1, 0), jitter=0.0)
    az = zt + 0.9
    yr = -13.15
    beam(op, (0, yr, az), (0, yr, az + 2.0), 0.26, 0.28, PAL['gold'], PT['metal'])                 # anchor shank
    beam(op, (-0.85, yr, az + 1.55), (0.85, yr, az + 1.55), 0.2, 0.28, PAL['gold'], PT['metal'])    # stock
    for s in (-1, 1):
        beam(op, (0, yr, az + 0.05), (s * 1.25, yr, az + 0.75), 0.24, 0.28, PAL['gold'], PT['metal'])   # arms
    disc(op, (0, yr + 0.1, az + 2.35), (0, -1, 0), 0.3, 0.1, PAL['gold'], 8)
    box2(op, -9.0, -12.2, P, 9.0, Y0, P + 0.05, PAL['marble'], 0, skip=('-z',))                       # pronaos floor
    arch_door(K, (0.0, Y0, P), (0, -1, 0), 2.6, 5.2, PAL['bronze'], PAL['marble'], step=False, fanlight=True)
    for x in (-5.0, 5.0):
        plain_window(K, (x, Y0, P + 3.4), (0, -1, 0), 1.4, 2.6, PAL['lime'], arch=True)
    # the Tower of the Winds on the ridge (the ridge runs along x at y = (Y0 + Y1) / 2)
    TC = (0.0, (Y0 + Y1) / 2 + 2.0)
    top = tower_of_winds(K, root, TC, E + 2.0, E + 7.6, 2.3, coll)
    flag_node(root, tuple(top), coll, 'customs ensign')
    K.emit(root, 'customs_body', coll)
    return root, dict(anchors=dict(entrance=[0.0, 0.0, 15.0], clock=[TC[0], round(E + 5.0, 2), round(-(TC[1] - 2.3), 2)], podium_y=P))


# =================================================================== THE REGISTRY  26 x 20  (a register of shipping: ledger hall, grade board, flag)
def build_registry(coll=None):
    """A classification society's hall (Lloyd's Register, not a chapel): a columned exchange with a gilt anchor-and-ledger
    relief in the pediment, the society's name on the frieze, a tall flagstaff, the Lutine bell (a bronze tintinnabulum)
    in a free-standing timber frame on the podium, and the grade board (painted shields A-F with counts) on the side wall the camera sees.
    The runtime paints the frieze, the flag and the board (anchors frieze / register_flag / grade_board)."""
    root = empty('registry', coll=coll)
    K = Kit(42)
    op = K.op
    P = 1.2
    box2(op, -12.5, -7.6, -2.0, 12.5, 9.6, P, PAL['sandstone'], PT['ashlar'])
    stairs(op, -8.0, 8.0, -10.0, 0.0, P, 4, 0.6, PAL['lime'])
    X0, X1, Y0, Y1, E = -10.5, 10.5, -5.0, 9.0, P + 9.8
    box2(op, X0, Y0, P, X1, Y1, E, PAL['wash_cream'], PT['render'])
    box2(op, X0 - 0.4, Y0 - 0.4, E, X1 + 0.4, Y1 + 0.4, E + 0.7, PAL['marble'], 0)
    # sandstone base course + a string course: a counting house, not a nave; the painted band under the far eave
    box2(op, X0 - 0.15, Y0 - 0.15, P, X1 + 0.15, Y1 + 0.15, P + 1.4, PAL['sandstone'], PT['ashlar'])
    box2(op, X0 - 0.2, Y0 - 0.2, P + 5.6, X1 + 0.2, Y1 + 0.2, P + 5.9, PAL['marble'], 0)
    frieze(op, (X1, Y0), (X1, Y1), E - 1.9, 0.55, (1, 0, 0))
    frieze(op, (X1, Y1), (X0, Y1), E - 1.9, 0.55, (0, 1, 0))
    for y in (-1.5, 2.5, 6.5):   # deep-set plain openings, two storeys (the far side; the near side carries the board)
        for z in (P + 3.3, P + 7.4):
            plain_window(K, (X1, y, z), (1, 0, 0), 1.2, 2.2, PAL['wash_cream'])
    # the grade board's frame on the near side wall (the runtime paints the shields inside it)
    GB_Y, GB_Z, GB_W, GB_H = 2.0, P + 5.0, 12.0, 4.6
    t, n, up = frame3((-1, 0, 0))
    gc = Vector((X0, GB_Y, GB_Z))
    fw = 0.32
    for (dx, dz, w, h) in ((0, -(GB_H / 2 + fw / 2), GB_W + 2 * fw, fw), (0, GB_H / 2 + fw / 2, GB_W + 2 * fw, fw),
                           (-(GB_W / 2 + fw / 2), 0, fw, GB_H), (GB_W / 2 + fw / 2, 0, fw, GB_H)):
        obox(op, gc + t * dx + up * dz + n * 0.22, t, n, w, 0.44, h, PAL['gilt'], PT['metal'])
    obox(op, gc + up * (GB_H / 2 + 0.75) + n * 0.3, t, n, GB_W + 1.2, 0.6, 0.35, PAL['marble'])        # hood moulding
    for s in (-1, 1):   # lamps either side of the board
        box2(K.em, X0 - 0.75, GB_Y + s * (GB_W / 2 + 0.9) - 0.25, GB_Z + 0.6, X0 - 0.25, GB_Y + s * (GB_W / 2 + 0.9) + 0.25, GB_Z + 1.3, PAL['bronze'], 0)
        beam(op, (X0, GB_Y + s * (GB_W / 2 + 0.9), GB_Z + 0.4), (X0 - 0.5, GB_Y + s * (GB_W / 2 + 0.9), GB_Z + 0.6), 0.08, 0.08, PAL['bronze'])
    # portico: six columns, an entablature carrying the society's name (the runtime letters it), the pediment
    colonnade(op, -8.6, 8.6, -7.0, P, 8.9, 6, 0.55, PAL['marble'], cap_col=PAL['gilt'])
    box2(op, -9.6, -8.0, P + 8.9, 9.6, Y0, P + 9.9, PAL['marble'], 0)
    for x in (-5.2, 5.2):
        plain_window(K, (x, Y0, P + 5.6), (0, -1, 0), 1.5, 2.6, PAL['wash_cream'], arch=True)
    pediment(op, -9.8, 9.8, -8.2, Y0, P + 10.2, 3.4, PAL['marble'], tymp=PAL['poly_blue'])
    box2(op, -9.8, -8.2, P + 9.9, 9.8, Y0, P + 10.2, PAL['marble'], 0)
    tiled_gable(op, X0, -8.2, X1, Y1, E + 0.7, math.degrees(math.atan2(3.4, (X1 - X0) / 2)), PAL['tile_b'], 'y', ov=0.3, ends=False)
    poly(op, ((X0, Y1 + 0.3, E + 0.7), (X1, Y1 + 0.3, E + 0.7), (0, Y1 + 0.3, E + 4.1)), PAL['stone_light'], PT['ashlar'], nrm=(0, 1, 0))
    # the relief: a great fouled anchor over an open ledger, gilt on the blue tympanum
    yr = -8.0          # proud of the tympanum (at yf + 0.25 = -7.95)
    z0 = P + 10.2
    nb = Vector((0, -1, 0))
    G = PAL['gilt']
    for s in (-1, 1):   # the ledger: two pages fanned open, ruled lines
        a = Vector((0, yr - 0.08, z0 + 0.35)); b = Vector((s * 3.0, yr - 0.16, z0 + 0.55))
        pts = (a, b, b + Vector((0, 0, 1.25)), a + Vector((0, 0, 1.45)))
        poly(op, pts, PAL['cream'], 0, nrm=nb)
        beam(op, b + Vector((0, 0, -0.04)), b + Vector((0, 0, 1.29)), 0.16, 0.16, G)
        beam(op, a + Vector((0, 0, -0.04)), b + Vector((0, 0, -0.04)), 0.12, 0.12, G)
        for k in range(4):
            z = 0.42 + k * 0.26
            beam(op, a + Vector((s * 0.35, -0.04, z)), a + Vector((s * 2.6, -0.1, z + 0.18)), 0.05, 0.03, PAL['iron'], up=nb)
    # the anchor in front of the book: shank, stock, ring, arms + flukes
    ay = yr - 0.45
    beam(op, (0, ay, z0 + 0.25), (0, ay, z0 + 2.95), 0.26, 0.26, G, PT['metal'])                         # shank
    beam(op, (-1.15, ay - 0.05, z0 + 2.55), (1.15, ay - 0.05, z0 + 2.55), 0.2, 0.22, PAL['oak'])          # stock
    disc(op, (0, ay, z0 + 3.12), (0, -1, 0), 0.26, 0.12, G, 10, PT['metal'])                              # ring
    for s in (-1, 1):
        p0 = Vector((0, ay, z0 + 0.3))
        pts = [p0 + Vector((s * 1.6 * math.sin(a_), 0, 1.6 * (1 - math.cos(a_)) * 0.75)) for a_ in (0.0, 0.45, 0.9, 1.25)]
        for a_, b_ in zip(pts[:-1], pts[1:]):
            beam(op, a_, b_, 0.24, 0.24, G, PT['metal'], up=nb)
        tip = pts[-1]
        poly(op, (tip + Vector((0, -0.14, -0.05)), tip + Vector((-s * 0.55, -0.14, 0.15)), tip + Vector((s * 0.15, -0.14, 0.7))), G, PT['metal'], nrm=nb)
    arch_door(K, (0, Y0, P), (0, -1, 0), 2.4, 4.6, PAL['bronze'], PAL['marble'], step=False)
    # the tintinnabulum: a bronze bell in a free-standing oak frame under a little tiled roof on the podium, right of the
    # steps (rung for a new listing / a loss)
    bx, by = 10.6, -6.6
    for s in (-1, 1):
        beam(op, (bx + s * 1.25, by, P), (bx + s * 0.95, by, P + 4.4), 0.26, 0.26, PAL['oak_dark'], PT['boards'])
        beam(op, (bx + s * 1.25, by, P + 0.9), (bx + s * 0.4, by, P + 4.35), 0.12, 0.12, PAL['oak_dark'])
    beam(op, (bx - 1.45, by, P + 4.4), (bx + 1.45, by, P + 4.4), 0.3, 0.34, PAL['oak_dark'], PT['boards'])
    tiled_gable(op, bx - 1.5, by - 0.7, bx + 1.5, by + 0.7, P + 4.6, 22.0, PAL['tile_a'], 'x', ov=0.2, ends=False, antefix=None)
    bz = P + 2.05
    lathe(op, (bx, by), [(0.95, bz), (0.88, bz + 0.18), (0.66, bz + 0.7), (0.56, bz + 1.5), (0.4, bz + 1.9), (0.0, bz + 2.05)], PAL['bronze_light'],
          PT['metal'], 14, smooth=True)
    sphere(op, (bx, by, bz + 0.12), 0.2, PAL['bronze'], 6, 3)
    beam(op, (bx, by, bz + 2.05), (bx, by, P + 4.25), 0.1, 0.1, PAL['iron'])
    bell = empty('bell', (bx, by, bz + 2.0), parent=root, coll=coll)
    bell['anim'] = 'the registry bell (Lutine): rung once on a new listing, twice on a delisting'
    # the society's flagstaff: a tall white mast with a yard on the podium's right corner (the runtime flies the register flag)
    fx, fy = 11.3, 8.4
    box2(op, fx - 0.7, fy - 0.7, P, fx + 0.7, fy + 0.7, P + 0.8, PAL['granite'], PT['ashlar'])
    box2(op, fx - 0.5, fy - 0.5, P + 0.8, fx + 0.5, fy + 0.5, P + 1.3, PAL['bronze'], PT['metal'])
    cyl(op, (fx, fy), 0.2, 0.09, P + 1.3, P + 21.0, PAL['oak_dark'], 0, 8)
    sphere(op, (fx, fy, P + 21.15), 0.22, PAL['gilt'], 6, 3)
    beam(op, (fx - 1.6, fy, P + 16.5), (fx + 1.6, fy, P + 16.5), 0.1, 0.12, PAL['oak_dark'])
    for p in ((fx - 3.0, fy + 1.0, P), (fx + 0.8, fy - 3.4, P)):
        beam(op, (fx, fy, P + 16.4), p, 0.04, 0.04, PAL['tar'])
    for s in (-1, 1):   # bronze tripod lamps on the stair cheeks
        tripod_lamp(K, (s * 8.6, -9.4, 0.0), 1.6)
    K.emit(root, 'registry_body', coll)
    gl = lambda v: [round(v[0], 2), round(v[2], 2), round(-v[1], 2)]
    return root, dict(anchors=dict(
        entrance=[0.0, 0.0, 10.0], bell=gl((bx, by, bz + 2.0)),
        # painted by the runtime: centre (glTF), outward normal (glTF), size (w, h) metres
        frieze=dict(centre=gl((0.0, -8.06, P + 9.4)), normal=[0, 0, 1], size=[17.0, 0.82]),
        grade_board=dict(centre=gl((X0 - 0.24, GB_Y, GB_Z)), normal=[-1, 0, 0], size=[GB_W, GB_H]),
        register_flag=dict(hoist=gl((fx + 0.12, fy, P + 20.6)), size=[5.2, 3.3])))


# =================================================================== THE CHART ROOM  18 x 14  (the Museum's star terrace)
def armillary(op, c, r=1.05):
    """Bronze armillary sphere: meridian, equator and a tilted ecliptic ring round a gilt earth, on a polar rod."""
    c = Vector(c)
    for k_ in range(3):
        pts = []
        for k in range(14):
            a = 2 * math.pi * k / 14
            if k_ == 0:
                v = Vector((math.cos(a), 0, math.sin(a)))
            elif k_ == 1:
                v = Vector((0, math.cos(a), math.sin(a)))
            else:
                v = Vector((math.cos(a), math.sin(a) * math.cos(1.2), math.sin(a) * math.sin(1.2)))
            pts.append(c + v * r)
        for p, q in zip(pts, pts[1:] + pts[:1]):
            beam(op, p, q, 0.1 * r, 0.1 * r, PAL['bronze_light'] if k_ < 2 else PAL['gilt'])
    rod(op, c - Vector((0.4, 0.0, 1.2)) * r, c + Vector((0.4, 0.0, 1.2)) * r, 0.05 * r, PAL['bronze_dark'], 4)
    sphere(op, tuple(c), 0.22 * r, PAL['gold'], 6, 3)


def build_chartroom(coll=None):
    """The Museum's star terrace: an open exedra (a semicircular Doric colonnade on a podium, painted back wall, stone
    bench) turned to the water with a great bronze armillary sphere at its centre, a compass rose inlaid in the
    forecourt, and a small tiled study wing (the chart office) with shuttered openings. No dome."""
    root = empty('chartroom', coll=coll)
    K = Kit(43)
    op = K.op
    P = 0.6
    box2(op, -9.0, -7.0, -1.5, 9.0, 7.0, P, PAL['sandstone'], PT['ashlar'], skip=('+z',))
    poly(op, ((-9, -7, P), (9, -7, P), (9, 7, P), (-9, 7, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    EC = Vector((-2.4, 0.6, 0))
    zt = exedra(op, EC, 4.4, P, h=4.0, n=7, col=PAL['marble'], cap_col=PAL['lime'], wall=PAL['wash_ochre'], podium=0.9)
    # the armillary on a marble pedestal at the exedra's centre (the old telescope_tip moves to its top)
    zp = P + 0.9
    cyl(op, EC, 0.8, 0.8, zp, zp + 0.3, PAL['marble'], 0, 8)
    cyl(op, EC, 0.5, 0.42, zp + 0.3, zp + 1.7, PAL['lime'], PT['ashlar'], 8)
    cyl(op, EC, 0.62, 0.62, zp + 1.7, zp + 1.95, PAL['marble'], 0, 8)
    sc = EC + Vector((0, 0, zp + 1.95 + 1.6))
    for k in range(4):        # bronze cradle
        a = math.pi / 4 + k * math.pi / 2
        beam(op, EC + Vector((0.45 * math.cos(a), 0.45 * math.sin(a), zp + 1.95)), sc + Vector((1.3 * math.cos(a), 1.3 * math.sin(a), -0.9)), 0.1, 0.1, PAL['bronze'])
    armillary(op, sc, 1.6)
    # compass rose inlaid in the forecourt, in front of the exedra steps
    rc = Vector((-2.4, -5.6, P + 0.02))
    disc_pts = [rc + Vector((1.25 * math.cos(2 * math.pi * k / 16), 1.25 * math.sin(2 * math.pi * k / 16), 0)) for k in range(16)]
    for a, b in zip(disc_pts, disc_pts[1:] + disc_pts[:1]):
        poly(op, (rc, a, b), PAL['marble'], 0, nrm=(0, 0, 1), jitter=0.0)
    for k in range(8):
        a = math.pi / 2 + 2 * math.pi * k / 8
        L_ = 1.2 if k % 2 == 0 else 0.75
        tip = rc + Vector((L_ * math.cos(a), L_ * math.sin(a), 0.03))
        for s in (-1, 1):
            side = rc + Vector((0.22 * math.cos(a + s * math.pi / 2), 0.22 * math.sin(a + s * math.pi / 2), 0.03))
            poly(op, (rc + Vector((0, 0, 0.03)), side, tip), PAL['gilt'] if k == 0 else (PAL['poly_blue'] if s > 0 else PAL['poly_red']), 0,
                 nrm=(0, 0, 1), jitter=0.0)
    # the study wing: stucco, a low tiled hip, painted band, shuttered openings, an arched door
    WX0, WX1, WY0, WY1, WE = 4.6, 8.6, -2.6, 6.2, P + 5.2
    box2(op, WX0, WY0, P, WX1, WY1, WE, PAL['wash_cream'], PT['render'])
    socle(op, WX0, WY0, WX1, WY1, P, 0.7)
    frieze(op, (WX0, WY0), (WX1, WY0), WE - 0.9, 0.5, (0, -1, 0))
    frieze(op, (WX0, WY1), (WX0, WY0), WE - 0.9, 0.5, (-1, 0, 0))
    frieze(op, (WX1, WY0), (WX1, WY1), WE - 0.9, 0.5, (1, 0, 0))
    box2(op, WX0 - 0.2, WY0 - 0.2, WE, WX1 + 0.2, WY1 + 0.2, WE + 0.3, PAL['lime'], 0)
    tiled_hip(op, WX0 - 0.2, WY0 - 0.2, WX1 + 0.2, WY1 + 0.2, WE + 0.3, 22.0, PAL['tile_b'], ov=0.4, antefix='front')
    arch_door(K, ((WX0 + WX1) / 2, WY0, P), (0, -1, 0), 1.3, 2.7, PAL['shutter_blue'], PAL['marble'])
    plain_window(K, ((WX0 + WX1) / 2, WY0, P + 3.9), (0, -1, 0), 0.8, 1.0, PAL['wash_cream'], shutter=PAL['shutter_blue'])
    for y in (-0.6, 2.2, 4.8):
        plain_window(K, (WX0, y, P + 2.6), (-1, 0, 0), 0.8, 1.3, PAL['wash_cream'], shutter=PAL['shutter_blue'])
        plain_window(K, (WX1, y, P + 2.6), (1, 0, 0), 0.8, 1.3, PAL['wash_cream'])
    flue(op, WX0 + 1.0, WY1 - 1.4, WE + 1.6, 1.0, PAL['wash_cream'])
    # bronze lamps and the chart table by the wing door
    tripod_lamp(K, (WX0 - 0.8, WY0 - 1.2, P), 1.6)
    tripod_lamp(K, (-7.6, -4.4, P), 1.6)
    box2(op, 6.0, -5.6, P, 8.0, -4.6, P + 0.9, PAL['oak_dark'], PT['boards'])
    box2(op, 5.9, -5.7, P + 0.9, 8.1, -4.5, P + 0.98, PAL['cream'], 0)
    K.emit(root, 'chartroom_body', coll)
    tip = sc + Vector((0, 0, 1.6))
    return root, dict(anchors=dict(entrance=[round(EC.x, 2), 0.0, round(-(EC.y - 6.6), 2)],
                                   telescope_tip=[round(tip.x, 2), round(tip.z, 2), round(-tip.y, 2)]))


# =================================================================== STORM STATION  14 x 14  (signal mast, weather board)
def build_stormstation(coll=None):
    """The storm-signal STATION: the one home of the DEWS signal. A small tiled guard-house keeps the watch (a bronze
    wind-vane on the ridge, the weather board under its own tiled hood, anchor weather_board) and a timber signal mast on
    a stepped stone base at the front-left corner (clear of the Harbourmaster's loggia from the heart camera) carries a
    yard across the view; readings/storm-cones.ts hoists the wicker shapes on the left yardarm's halyard (anchor signal:
    slot centres top -> down, the masthead for the Danger pennant). The signal store is a timber lean-to: rope and crates."""
    root = empty('stormstation', coll=coll)
    K = Kit(44)
    op = K.op
    P = 0.5
    box2(op, -7.0, -7.0, -1.5, 7.0, 7.0, P, PAL['sandstone'], PT['ashlar'], skip=('+z',))
    poly(op, ((-7, -7, P), (7, -7, P), (7, 7, P), (-7, 7, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    # the guard-house
    HX0, HX1, HY0, HY1, HE = -6.2, 1.4, 0.6, 6.4, P + 4.4
    box2(op, HX0, HY0, P, HX1, HY1, HE, PAL['wash_ochre'], PT['render'])
    socle(op, HX0, HY0, HX1, HY1, P, 0.8)
    frieze(op, (HX0, HY0), (HX1, HY0), HE - 0.8, 0.45, (0, -1, 0))
    frieze(op, (HX1, HY0), (HX1, HY1), HE - 0.8, 0.45, (1, 0, 0))
    box2(op, HX0 - 0.2, HY0 - 0.2, HE, HX1 + 0.2, HY1 + 0.2, HE + 0.28, PAL['lime'], 0)
    rr = tiled_gable(op, HX0 - 0.2, HY0 - 0.2, HX1 + 0.2, HY1 + 0.2, HE + 0.28, 22.0, PAL['tile_c'], 'x', ov=0.4, end_col=PAL['wash_ochre'])
    for x in (-4.6, -0.6):
        plain_window(K, (x, HY0, P + 2.3), (0, -1, 0), 0.9, 1.2, PAL['wash_ochre'], shutter=PAL['shutter_ox'])
    arch_door(K, (-2.6, HY0, P), (0, -1, 0), 1.2, 2.6, PAL['shutter_ox'], PAL['lime'])
    plain_window(K, (HX1, 3.5, P + 2.3), (1, 0, 0), 0.9, 1.2, PAL['wash_ochre'], shutter=PAL['shutter_ox'])
    flue(op, -0.4, 4.2, HE + rr * 0.5 + 0.3, 1.2, PAL['wash_ochre'])
    # a bronze wind-vane (a pennant on a rod) on the ridge
    ax, ay, az = -4.4, (HY0 + HY1) / 2, HE + 0.28 + rr
    cyl(op, (ax, ay), 0.2, 0.14, az - 0.1, az + 0.4, PAL['bronze'], PT['metal'], 6)
    cyl(op, (ax, ay), 0.05, 0.05, az + 0.4, az + 2.6, PAL['bronze_dark'], PT['metal'], 4)
    poly(op, ((ax, ay, az + 2.5), (ax + 1.5, ay + 0.2, az + 2.25), (ax, ay, az + 1.9)), PAL['bronze_light'], PT['metal'], nrm=(0, -1, 0), jitter=0.0)
    sphere(op, (ax, ay, az + 2.7), 0.14, PAL['gilt'], 6, 3)
    # the weather board in front of the house, under a little tiled hood: the runtime chalks the DEWS band on it
    WB_X, WB_Y, WB_Z, WB_W, WB_H = -2.0, -3.0, P + 2.9, 7.2, 2.7
    for s in (-1, 1):
        box2(op, WB_X + s * (WB_W / 2 - 0.1) - 0.16, WB_Y - 0.16, P, WB_X + s * (WB_W / 2 - 0.1) + 0.16, WB_Y + 0.16, WB_Z + WB_H / 2 + 0.6,
             PAL['oak_dark'], 0)
    box2(op, WB_X - WB_W / 2 - 0.18, WB_Y + 0.0, WB_Z - WB_H / 2 - 0.18, WB_X + WB_W / 2 + 0.18, WB_Y + 0.16, WB_Z + WB_H / 2 + 0.18, PAL['oak_dark'], 0)
    tiled_gable(op, WB_X - WB_W / 2 - 0.3, WB_Y - 0.5, WB_X + WB_W / 2 + 0.3, WB_Y + 0.5, WB_Z + WB_H / 2 + 0.3, 20.0, PAL['tile_a'], 'x', ov=0.25,
                ends=False, antefix='front')
    # the signal store: a timber lean-to with tiles, rope coils and crates
    box2(op, 2.2, 0.8, P, 6.6, 6.2, P + 0.4, PAL['lime'], PT['ashlar'])
    for (cx, cy, cs) in ((3.4, 2.0, 0.9), (5.3, 2.3, 0.8), (3.6, 4.6, 0.75), (5.4, 5.0, 0.95)):
        box2(op, cx - cs / 2, cy - cs / 2, P + 0.4, cx + cs / 2, cy + cs / 2, P + 0.4 + cs, PAL['timber'], PT['boards'])
    for (cx, cy) in ((4.4, 3.4), (2.9, 5.6)):
        cyl(op, (cx, cy), 0.55, 0.55, P + 0.4, P + 0.7, PAL['rope'], 0, 10, top=True)
    for y in (0.9, 6.1):
        beam(op, (6.5, y, P + 0.4), (6.5, y, P + 2.6), 0.18, 0.18, PAL['oak_dark'])
    poly(op, ((6.8, 0.4, P + 2.6), (6.8, 6.6, P + 2.6), (HX1 + 0.2, 6.6, P + 3.6), (HX1 + 0.2, 0.4, P + 3.6)), PAL['tile_b'], PT['tiles'], nrm=(1, 0, 1))
    beam(op, (6.8, 0.4, P + 2.55), (6.8, 6.6, P + 2.55), 0.22, 0.2, PAL['tile_ridge'])
    # lamps: a bronze tripod by the door, an oil lamp under the board hood
    tripod_lamp(K, (-0.2, HY0 - 1.4, P), 1.5)
    box2(K.em, WB_X - 0.25, WB_Y - 0.75, WB_Z + WB_H / 2 + 0.05, WB_X + 0.25, WB_Y - 0.25, WB_Z + WB_H / 2 + 0.3, PAL['bronze'], 0)
    # the signal mast: a stepped ashlar base, an oiled timber pole with bronze bands, a timber yard across the heart view
    # (camera right = (1, 1)), stays to the base
    MX, MY, MH, YZ = -5.6, -5.6, P + 29.0, P + 23.5
    box2(op, MX - 1.2, MY - 1.2, P, MX + 1.2, MY + 1.2, P + 0.6, PAL['lime'], PT['ashlar'])
    box2(op, MX - 0.85, MY - 0.85, P + 0.6, MX + 0.85, MY + 0.85, P + 2.2, PAL['sandstone'], PT['ashlar'])
    box2(op, MX - 0.95, MY - 0.95, P + 2.2, MX + 0.95, MY + 0.95, P + 2.45, PAL['marble'], 0)
    cyl(op, (MX, MY), 0.36, 0.15, P + 2.45, MH, PAL['oak_dark'], PT['boards'], 8)
    for z in (P + 2.6, P + 9.0, P + 16.0, YZ + 0.4):
        cyl(op, (MX, MY), 0.4 - (z - P) * 0.0075, 0.4 - (z - P) * 0.0075, z, z + 0.35, PAL['bronze'], PT['metal'], 8)
    sphere(op, (MX, MY, MH + 0.15), 0.3, PAL['gilt'], 6, 3)
    ux, uy = 1 / math.sqrt(2), 1 / math.sqrt(2)
    YA = 3.0
    beam(op, (MX - ux * YA, MY - uy * YA, YZ), (MX + ux * YA, MY + uy * YA, YZ), 0.24, 0.24, PAL['oak_dark'])
    for s_ in (-1, 1):
        beam(op, (MX, MY, YZ + 3.2), (MX + s_ * ux * YA, MY + s_ * uy * YA, YZ), 0.035, 0.035, PAL['tar'])
    for (dx, dy) in ((1.0, -1.0), (-1.0, 1.0), (-1.0, -1.0)):
        beam(op, (MX, MY, YZ - 0.3), (MX + dx * 1.1, MY + dy * 1.1, P + 0.6), 0.03, 0.03, PAL['tar'])
    HX, HY = MX - ux * (YA - 0.25), MY - uy * (YA - 0.25)
    beam(op, (HX, HY, YZ), (HX, HY, P + 0.9), 0.03, 0.03, PAL['tar'])
    box2(op, HX - 0.3, HY - 0.3, P, HX + 0.3, HY + 0.3, P + 0.9, PAL['lime'], PT['ashlar'])
    K.emit(root, 'stormstation_body', coll)
    gl = lambda v: [round(v[0], 2), round(v[2], 2), round(-v[1], 2)]
    slots = [gl((HX, HY, YZ - 2.3 - k * 3.5)) for k in range(4)]
    return root, dict(anchors=dict(weather_board=dict(centre=gl((WB_X, WB_Y - 0.02, WB_Z)), normal=[0, 0, 1], size=[WB_W, WB_H]),
                                   signal=dict(slots=slots, foot=gl((HX, HY, P + 1.8)), masthead=gl((MX, MY, MH - 0.6)))))


# =================================================================== HARBOURMASTER  20 x 16  (house + watch-loggia)
def build_harbourmaster(coll=None):
    """The Harbourmaster: a two-storey stuccoed house (shutters, painted band, a tiled hip) and beside it a square
    watch-loggia: a stone shaft with an open arcaded lookout under a low tiled pyramid, kept under 16 m. A timber
    signal mast on the pyramid carries the movers' yard (front to back, so both hoists read side by side from the
    camera): the runtime flies the day's top gaining harbour's crest at the front yardarm and the top losing one's at the
    back (anchors mover_up / mover_down). No cones here: the storm station owns them."""
    root = empty('harbourmaster', coll=coll)
    K = Kit(45)
    op = K.op
    P = 0.5
    box2(op, -10.0, -8.0, -1.5, 10.0, 8.0, P, PAL['sandstone'], PT['ashlar'], skip=('+z',))
    poly(op, ((-10, -8, P), (10, -8, P), (10, 8, P), (-10, 8, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    OX0, OX1, OY0, OY1, E = -9.0, 2.6, -5.0, 6.0, P + 7.4
    W = PAL['wash_sienna']
    box2(op, OX0, OY0, P, OX1, OY1, E, W, PT['render'])
    socle(op, OX0, OY0, OX1, OY1, P, 0.9)
    box2(op, OX0 - 0.12, OY0 - 0.12, P + 3.7, OX1 + 0.12, OY1 + 0.12, P + 3.95, PAL['lime'], 0)
    frieze(op, (OX0, OY0), (OX1, OY0), E - 0.85, 0.5, (0, -1, 0))
    frieze(op, (OX0, OY1), (OX0, OY0), E - 0.85, 0.5, (-1, 0, 0))
    box2(op, OX0 - 0.25, OY0 - 0.25, E, OX1 + 0.25, OY1 + 0.25, E + 0.3, PAL['lime'], 0)
    tiled_hip(op, OX0 - 0.25, OY0 - 0.25, OX1 + 0.25, OY1 + 0.25, E + 0.3, 22.0, PAL['tile_a'], ov=0.45, antefix='all')
    for x in (-7.2, -4.0, -0.8):
        plain_window(K, (x, OY0, P + 5.6), (0, -1, 0), 0.9, 1.4, W, shutter=PAL['shutter_green'])
    for x in (-7.2, -0.8):
        plain_window(K, (x, OY0, P + 2.0), (0, -1, 0), 0.9, 1.3, W, shutter=PAL['shutter_green'])
    arch_door(K, (-4.0, OY0, P), (0, -1, 0), 1.6, 3.2, PAL['shutter_green'], PAL['lime'])
    for y in (-2.4, 2.4):
        plain_window(K, (OX0, y, P + 5.6), (-1, 0, 0), 0.9, 1.4, W, shutter=PAL['shutter_green'])
        plain_window(K, (OX0, y, P + 2.0), (-1, 0, 0), 0.9, 1.3, W)
    flue(op, -6.0, 3.0, E + 2.4, 1.2, W)
    # a timber balcony over the door
    box2(op, -5.6, OY0 - 1.1, P + 3.95, -2.4, OY0, P + 4.2, PAL['oak_dark'], PT['boards'])
    rail(op, [(-5.5, OY0 - 1.0, P + 4.2), (-2.5, OY0 - 1.0, P + 4.2)], 0.9, PAL['oak_dark'], 0.75, r=0.05)
    for x in (-5.4, -2.6):
        beam(op, (x, OY0, P + 3.2), (x, OY0 - 1.0, P + 3.95), 0.18, 0.18, PAL['oak_dark'])
    # the watch-loggia: an ashlar shaft, a string course, the open arcaded lookout, a low tiled pyramid
    TX0, TX1, TY0, TY1 = 2.6, 8.8, -3.1, 3.1
    tz1 = P + 9.0
    box2(op, TX0, TY0, P, TX1, TY1, tz1, PAL['lime'], PT['ashlar'])
    socle(op, TX0, TY0, TX1, TY1, P, 1.0)
    for z in (P + 4.4,):
        plain_window(K, ((TX0 + TX1) / 2, TY0, z), (0, -1, 0), 0.9, 1.6, PAL['lime'], arch=True)
        plain_window(K, (TX1, 0.0, z), (1, 0, 0), 0.9, 1.6, PAL['lime'], arch=True)
    plain_window(K, (TX1, 0.0, P + 7.4), (1, 0, 0), 0.8, 1.1, PAL['lime'])
    arch_door(K, ((TX0 + TX1) / 2, TY0, P), (0, -1, 0), 1.4, 2.8, PAL['shutter_green'], PAL['marble'])
    box2(op, TX0 - 0.3, TY0 - 0.3, tz1, TX1 + 0.3, TY1 + 0.3, tz1 + 0.45, PAL['marble'], 0)
    lz0, lz1 = tz1 + 0.45, tz1 + 3.7
    cx_, cy_ = (TX0 + TX1) / 2, (TY0 + TY1) / 2
    for (x, y) in ((TX0, TY0), (TX1, TY0), (TX1, TY1), (TX0, TY1)):      # corner piers
        box2(op, x - 0.45, y - 0.45, lz0, x + 0.45, y + 0.45, lz1, PAL['lime'], PT['ashlar'])
    for (x, y) in ((cx_, TY0), (cx_, TY1), (TX0, cy_), (TX1, cy_)):       # mid columns
        column(op, x, y, lz0, lz1 - lz0, 0.3, PAL['marble'], 8, PAL['lime'])
    rail(op, [(TX0, TY0, lz0), (TX1, TY0, lz0), (TX1, TY1, lz0), (TX0, TY1, lz0), (TX0, TY0, lz0)], 1.0, PAL['lime'], 0.6, r=0.07)
    poly(op, ((TX0 + 0.4, TY0 + 0.4, lz0 + 0.02), (TX1 - 0.4, TY0 + 0.4, lz0 + 0.02), (TX1 - 0.4, TY1 - 0.4, lz0 + 0.02), (TX0 + 0.4, TY1 - 0.4, lz0 + 0.02)),
         PAL['interior2'], 0, nrm=(0, 0, 1))
    # lamp-lit lookout: a lit pane per side deep inside the loggia (the watch is kept at night)
    for (c_, n_) in (((cx_, TY1 - 0.9), (0, -1, 0)), ((TX0 + 0.9, cy_), (1, 0, 0))):
        t_, nn, up = frame3(n_)
        g = Vector((c_[0], c_[1], lz0 + 1.6))
        lit_opening(K, [g - t_ * 1.0 - up * 0.9, g + t_ * 1.0 - up * 0.9, g + t_ * 1.0 + up * 0.9, g - t_ * 1.0 + up * 0.9], n_, lit=0.95, warm=0.3)
    box2(op, TX0 - 0.55, TY0 - 0.55, lz1, TX1 + 0.55, TY1 + 0.55, lz1 + 0.5, PAL['lime'], 0)
    frieze(op, (TX0 - 0.55, TY0 - 0.57), (TX1 + 0.55, TY0 - 0.57), lz1 + 0.05, 0.4, (0, -1, 0))
    frieze(op, (TX1 + 0.57, TY0 - 0.55), (TX1 + 0.57, TY1 + 0.55), lz1 + 0.05, 0.4, (1, 0, 0))
    pr = rise_for((TX1 - TX0) / 2 + 0.55, 24.0)
    pyramid_roof(op, cx_, cy_, (TX1 - TX0) / 2 + 0.55, lz1 + 0.5, pr, PAL['tile_c'], PT['tiles'], ov=0.45)
    zt = lz1 + 0.5 + pr
    for (x, y) in ((TX0 - 1.0, TY0 - 1.0), (TX1 + 1.0, TY0 - 1.0), (TX1 + 1.0, TY1 + 1.0), (TX0 - 1.0, TY1 + 1.0)):
        ridge_cap(op, (x, y, lz1 + 0.5 - 0.45 * 0.4 + 0.05), (cx_, cy_, zt + 0.04))
    # the movers' signal mast on the apex: masts may stand above the 16 m roofline (PLAN R3)
    fx, fy = cx_, cy_
    cyl(op, (fx, fy), 0.32, 0.22, zt - 0.2, zt + 0.5, PAL['bronze'], PT['metal'], 6)
    cyl(op, (fx, fy), 0.17, 0.09, zt + 0.5, zt + 8.6, PAL['oak_dark'], 0, 6)
    sphere(op, (fx, fy, zt + 8.75), 0.22, PAL['gilt'], 6, 3)
    YDZ, YA = zt + 7.0, 4.6
    beam(op, (fx, fy - YA - 0.2, YDZ), (fx, fy + YA + 0.2, YDZ), 0.16, 0.16, PAL['oak_dark'])
    movers = {}
    for key, s_ in (('mover_up', -1), ('mover_down', 1)):
        hy = fy + s_ * YA
        beam(op, (fx, fy, zt + 8.3), (fx, hy, YDZ), 0.035, 0.035, PAL['tar'])
        beam(op, (fx, hy, YDZ), (fx, hy, YDZ - 6.2), 0.03, 0.03, PAL['tar'])
        movers[key] = [round(fx, 2), round(YDZ - 0.25, 2), round(-hy, 2)]
    # notice board (the movers) by the door, a bench, amphorae
    for x in (-8.6, -8.0):
        box2(op, x - 0.1, OY0 - 0.6, P, x + 0.1, OY0 - 0.4, P + 2.6, PAL['oak_dark'], 0)
    box2(op, -9.1, OY0 - 0.7, P + 1.2, -7.3, OY0 - 0.5, P + 2.7, PAL['shutter_green'], PT['boards'])
    for k in range(4):
        box2(op, -8.9 + (k % 2) * 0.8, OY0 - 0.74, P + 1.35 + (k // 2) * 0.65, -8.3 + (k % 2) * 0.8, OY0 - 0.7, P + 1.85 + (k // 2) * 0.65,
             PAL['linen'], 0)
    box2(op, 3.4, TY0 - 2.2, P, 7.6, TY0 - 1.6, P + 0.5, PAL['lime'], PT['ashlar'])
    tripod_lamp(K, (1.6, OY0 - 1.6, P), 1.6)
    for (x, y) in ((9.0, -6.6), (8.4, -7.1)):
        amphora(op, (x, y, P), 0.95)
    K.emit(root, 'harbourmaster_body', coll)
    return root, dict(anchors=dict(balcony=[round(cx_, 2), round(lz0, 2), round(-cy_, 2)], entrance=[-4.0, P, 5.0],
                                   mover_up=dict(hoist=movers['mover_up'], size=[3.6, 2.4]), mover_down=dict(hoist=movers['mover_down'], size=[3.6, 2.4])))


# =================================================================== KEEPER'S LOG  12 x 10  (a small tholos)
def build_keeperslog(coll=None):
    """The Keeper's Log as a small tholos: a stepped round base, a ring of eight Doric columns round a closed cella (the
    log is kept inside, lamp-lit), a painted ring frieze, a cone of terracotta tiles and a bronze finial carrying the
    hourglass vane (freshness, node `vane`); a lectern with the open log and a stone bench outside."""
    root = empty('keeperslog', coll=coll)
    K = Kit(46)
    op = K.op
    P = 0.4
    box2(op, -6.0, -5.0, -1.5, 6.0, 5.0, P, PAL['sandstone'], PT['ashlar'], skip=('+z',))
    poly(op, ((-6, -5, P), (6, -5, P), (6, 5, P), (-6, 5, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    C_ = Vector((0.0, 0.3, 0))
    R_, CR = 2.7, 1.85
    zc = P + 0.8
    top = tholos(op, C_, R_, P, h=3.6, n=8, col=PAL['marble'], cap_col=PAL['lime'], roof=PAL['tile_a'], cella=(CR, PAL['wash_cream']), steps=2)
    # the cella: a bronze door to the front, lit windows round it
    for k in range(8):
        a = -math.pi / 2 + 2 * math.pi * k / 8
        n_ = Vector((math.cos(a), math.sin(a), 0))
        p = C_ + n_ * (CR + 0.02)
        if k == 0:
            arch_door(K, (p.x, p.y, zc), tuple(n_), 1.0, 2.3, PAL['bronze'], PAL['marble'], step=False)
        elif k in (1, 7, 3, 5):
            t_, nn, up = frame3(n_)
            g = Vector((p.x, p.y, zc + 2.0))
            lit_opening(K, [g - t_ * 0.3 - up * 0.5, g + t_ * 0.3 - up * 0.5, g + t_ * 0.3 + up * 0.5, g - t_ * 0.3 + up * 0.5], tuple(n_), lit=0.9, warm=0.15)
    # the hourglass vane on the finial (turns once per data refresh)
    cyl(op, C_, 0.05, 0.05, top - 0.3, top + 1.0, PAL['bronze_dark'], PT['metal'], 4)
    hz = top + 1.3
    lathe(op, (C_.x, C_.y), [(0.32, hz - 0.35), (0.03, hz), (0.32, hz + 0.35)], PAL['gilt'], PT['metal'], 6, smooth=False)
    box2(op, C_.x - 0.4, C_.y - 0.4, hz + 0.35, C_.x + 0.4, C_.y + 0.4, hz + 0.42, PAL['gilt'], 0)
    box2(op, C_.x - 0.4, C_.y - 0.4, hz - 0.42, C_.x + 0.4, C_.y + 0.4, hz - 0.35, PAL['gilt'], 0)
    vane = empty('vane', (C_.x, C_.y, hz), parent=root, coll=coll)
    vane['anim'] = 'hourglass vane: turns (about local +Y) once per data refresh'
    # the lectern with the open log, a bench, bronze lamps, low dry-stone walls
    lx, ly = 4.3, -3.2
    box2(op, lx - 0.18, ly - 0.18, P, lx + 0.18, ly + 0.18, P + 1.1, PAL['marble'], 0)
    poly(op, ((lx - 0.55, ly - 0.35, P + 1.1), (lx + 0.55, ly - 0.35, P + 1.1), (lx + 0.55, ly + 0.25, P + 1.35), (lx - 0.55, ly + 0.25, P + 1.35)),
         PAL['cream'], 0, nrm=(0, -1, 1))
    box2(op, -5.4, -4.4, P, -2.8, -3.8, P + 0.5, PAL['lime'], PT['ashlar'])
    tripod_lamp(K, (-1.6, -4.3, P), 1.5)
    tripod_lamp(K, (1.6, -4.3, P), 1.5)
    for (a, b) in (((-5.6, 4.6), (5.6, 4.6)), ((5.6, 4.6), (5.6, -1.6))):
        box2(op, min(a[0], b[0]) - 0.3, min(a[1], b[1]) - 0.3, P, max(a[0], b[0]) + 0.3, max(a[1], b[1]) + 0.3, P + 0.9, PAL['lime_dark'], PT['rock'])
    K.emit(root, 'keeperslog_body', coll)
    return root, dict(anchors=dict(entrance=[C_.x, P, round(-(C_.y - R_), 2)], lantern=[C_.x, round(top - 1.0, 2), round(-C_.y, 2)]))


# =================================================================== HARBOUR OFFICES  20 x 16, eight chain variants (PLAN §4.2)
OFFICE_CHAINS = ('ethereum', 'tron', 'bsc', 'solana', 'hyperliquid-l1', 'base', 'arbitrum', 'polygon')


def build_stoa_office(chain, coll=None):
    """Classical harbour office (PLAN §4.2 common base, concept A): a Doric stoa on a stepped stylobate with the crest on
    a red-framed attic under a small blue pediment, a low tiled gable with pedimented ends, two velaria (the chain colour)
    split round the steps on their own poles, bronze tripod lamps and a flag mast on a bronze-shod base."""
    root = empty(f'harbour-office:{chain}', coll=coll)
    K = Kit(60 + OFFICE_CHAINS.index(chain))
    op = K.op
    P = 0.5
    box2(op, -10.0, -8.0, -1.5, 10.0, 8.0, P, PAL['sandstone'], PT['ashlar'], skip=('+z',))
    poly(op, ((-10, -8, P), (10, -8, P), (10, 8, P), (-10, 8, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    X0, X1 = -8.4, 8.4
    YS, YC, YW, YB = -4.6, -3.6, -0.4, 4.8       # stylobate front, column line, inner (rooms) wall, back wall
    ZS = P + 0.6
    stairs(op, X0 - 0.3, X1 + 0.3, YS - 0.9, P, ZS, 2, 0.45, PAL['lime'])
    box2(op, X0 - 0.3, YS, P, X1 + 0.3, YB + 0.3, ZS, PAL['lime'], PT['ashlar'], skip=('-z',))
    ZW = ZS + 5.0
    box2(op, X0, YW, ZS, X1, YB, ZW, PAL['wash_cream'], PT['render'])
    for s in (-1, 1):   # antae
        xa = X1 if s > 0 else X0
        box2(op, min(xa, xa - s * 0.8), YC - 0.4, ZS, max(xa, xa - s * 0.8), YW, ZW, PAL['lime'], 0)
    poly(op, ((X0 + 0.8, YW - 0.03, ZS), (X1 - 0.8, YW - 0.03, ZS), (X1 - 0.8, YW - 0.03, ZS + 1.6), (X0 + 0.8, YW - 0.03, ZS + 1.6)),
         PAL['poly_red'], 0, nrm=(0, -1, 0), jitter=0.0)
    for x in (-5.0, 0.0, 5.0):
        arch_door(K, (x, YW - 0.04, ZS), (0, -1, 0), 1.6 if x else 2.2, 3.2 if x else 3.8, PAL['bronze'] if not x else PAL['oak_dark'],
                  PAL['marble'], step=False, fanlight=bool(x))
    for x in (-6.8, -2.6, 2.6, 6.8):
        plain_window(K, (x, YW - 0.04, ZS + 3.9), (0, -1, 0), 0.75, 0.75, PAL['wash_cream'], sill=False)
    for y in (0.9, 3.4):
        for s in (-1, 1):
            plain_window(K, (s * X1, y, ZS + 3.4), (s, 0, 0), 0.8, 1.0, PAL['wash_cream'])
    xs = colonnade(op, X0 + 0.5, X1 - 0.5, YC, ZS, 5.0, 7, 0.42, PAL['marble'], cap_col=PAL['lime'])
    for x in xs:
        cyl(op, (x, YC), 0.39, 0.39, ZS + 4.35, ZS + 4.55, PAL['poly_red'], 0, 8, top=False)
    zt = entablature(op, X0 - 0.2, X1 + 0.2, YC - 0.5, YB + 0.2, ZS + 5.0)
    RS = tiled_gable(op, X0 - 0.2, YC - 0.5, X1 + 0.2, YB + 0.2, zt, 21.0, PAL['tile_a'], 'x', ov=0.5, end_col=PAL['marble'], end_pat=0)
    ym = (YC - 0.5 + YB + 0.2) / 2
    for s in (-1, 1):   # blue tympana on the end pediments
        xa = s * (X1 + 0.25)
        poly(op, ((xa, YC + 0.2, zt + 0.05), (xa, YB - 0.5, zt + 0.05), (xa, ym, zt + RS - 0.45)), PAL['poly_blue'], 0, nrm=(s, 0, 0), jitter=0.0)
    # central attic + pediment carrying the crest
    AX0, AX1, AY0, AY1, AZ1 = -2.9, 2.9, YC - 0.55, YC + 2.4, zt + 3.6
    box2(op, AX0, AY0, zt - 0.2, AX1, AY1, AZ1, PAL['wash_white'], PT['render'])
    for (a, b, c_, d) in ((AX0, zt, AX1, zt + 0.3), (AX0, AZ1 - 0.3, AX1, AZ1), (AX0, zt, AX0 + 0.3, AZ1), (AX1 - 0.3, zt, AX1, AZ1)):
        poly(op, ((a, AY0 - 0.03, b), (c_, AY0 - 0.03, b), (c_, AY0 - 0.03, d), (a, AY0 - 0.03, d)), PAL['poly_red'], 0, nrm=(0, -1, 0), jitter=0.0)
    pr = rise_for((AX1 - AX0) / 2 + 0.1, 24.0)
    pediment(op, AX0 - 0.1, AX1 + 0.1, AY0 - 0.2, AY1, AZ1 + 0.55, pr, PAL['marble'], tymp=PAL['poly_blue'], cornice=0.35)
    gable_roof(op, AX0 - 0.1, AY0 - 0.2, AX1 + 0.1, AY1, AZ1 + 0.55, pr, PAL['tile_a'], PT['tiles'], ov=0.0, axis='y', ends=False,
               th=0.2, fascia=PAL['tile_ridge'])
    ridge_cap(op, (0.0, AY0 - 0.2, AZ1 + 0.6 + pr), (0.0, AY1, AZ1 + 0.6 + pr))
    poly(op, ((AX0 - 0.1, AY1, AZ1 + 0.55), (AX1 + 0.1, AY1, AZ1 + 0.55), (0, AY1, AZ1 + 0.55 + pr)), PAL['wash_white'], PT['render'], nrm=(0, 1, 0))
    for (x, z, h) in ((0.0, AZ1 + 0.6 + pr + 0.2, 1.1), (AX0 - 0.35, AZ1 + 0.5, 0.75), (AX1 + 0.35, AZ1 + 0.5, 0.75)):   # gilt acroteria
        poly(op, ((x - 0.4, AY0 - 0.45, z), (x + 0.4, AY0 - 0.45, z), (x + 0.2, AY0 - 0.45, z + h * 0.6), (x, AY0 - 0.45, z + h),
                  (x - 0.2, AY0 - 0.45, z + h * 0.6)), PAL['gilt'], 0, nrm=(0, -1, 0), jitter=0.0)
    cz, cs = (zt + AZ1) / 2, 2.6
    crest_panel(K, root, (0.0, AY0 - 0.02, cz), cs, PAL['gilt'], coll)
    velarium(K, (X0 - 0.2, YS - 1.0), (-2.0, YS - 1.0), 2.7, P + 3.7, P + 3.3, ground=P)
    velarium(K, (2.0, YS - 1.0), (X1 + 0.2, YS - 1.0), 2.7, P + 3.7, P + 3.3, ground=P)
    for x in (-1.3, 1.3):
        tripod_lamp(K, (x, YS - 1.9, P))
    for (x, y) in ((8.8, -6.4), (8.2, -6.9), (8.6, -5.7)):
        amphora(op, (x, y, P), 0.95)
    # the flag mast on the -x corner: from the civic camera the big house flag then flies clear of the Customs House
    fx, fy_ = -8.9, -7.0
    box2(op, fx - 0.6, fy_ - 0.6, P, fx + 0.6, fy_ + 0.6, P + 0.5, PAL['lime'], PT['ashlar'])
    box2(op, fx - 0.42, fy_ - 0.42, P + 0.5, fx + 0.42, fy_ + 0.42, P + 1.0, PAL['bronze'], PT['metal'])
    cyl(op, (fx, fy_), 0.15, 0.08, P + 1.0, P + 15.0, PAL['oak_dark'], 0, 6)
    sphere(op, (fx, fy_, P + 15.1), 0.22, PAL['gilt'], 6, 3)
    flag_node(root, (fx, fy_, P + 14.8), coll, 'chain house flag (crest on the chain colour)')
    made = K.emit(root, 'office_body', coll)
    made['cover'].name = 'awning'
    made['cover']['anim'] = 'velaria: hb_cover, tinted by the chain colour (COLOR_0 = stripe shade)'
    return root, dict(chain=chain, accent=CHAINS[chain], roof='stoa',
                      anchors=dict(crest_centre=[0.0, round(cz, 2), round(-AY0 + 0.3, 2)], crest_size_m=cs, flag_pole_top=[fx, round(P + 14.8, 2), -fy_]))


# ------------------------------------------------------------------ the other seven offices (PLAN §4.2 variant table)
BASALT, BASALT_LIGHT = lin('#2C2E31'), lin('#4E5155')
STUCCO_RED, PORPHYRY = lin('#B0573E'), lin('#7A2E2A')
TEAL_GLAZE, TEAL_DARK = lin('#2E8C86'), lin('#1D5E5B')
TUFA, TUFA_DARK = lin('#D9CBA8'), lin('#9E8F78')


def office_ground(op, P):
    box2(op, -10.0, -8.0, -1.5, 10.0, 8.0, P, PAL['sandstone'], PT['ashlar'], skip=('+z',))
    poly(op, ((-10, -8, P), (10, -8, P), (10, 8, P), (-10, 8, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))


def office_flag(op, root, fx, fy, P, coll, h=15.0, foot=None, finial=None):
    """The chain's flag mast on a bronze-shod base; returns the flag_pole_top height."""
    box2(op, fx - 0.6, fy - 0.6, P, fx + 0.6, fy + 0.6, P + 0.5, foot or PAL['lime'], PT['ashlar'])
    box2(op, fx - 0.42, fy - 0.42, P + 0.5, fx + 0.42, fy + 0.42, P + 1.0, PAL['bronze'], PT['metal'])
    cyl(op, (fx, fy), 0.15, 0.08, P + 1.0, P + h, PAL['oak_dark'], 0, 6)
    sphere(op, (fx, fy, P + h + 0.1), 0.22, finial or PAL['gilt'], 6, 3)
    flag_node(root, (fx, fy, P + h - 0.2), coll, 'chain house flag (crest on the chain colour)')
    return P + h - 0.2


def office_emit(K, root, chain, coll, roof, crest, flag):
    """Emit the kit; the hb_cover mesh is the office's `awning` (velaria tinted by the chain colour)."""
    made = K.emit(root, 'office_body', coll)
    made['cover'].name = 'awning'
    made['cover']['anim'] = 'velaria: hb_cover, tinted by the chain colour (COLOR_0 = stripe shade)'
    (cx, cy, cz), cs = crest
    return root, dict(chain=chain, accent=CHAINS[chain], roof=roof,
                      anchors=dict(crest_centre=[round(cx, 2), round(cz, 2), round(-cy + 0.3, 2)], crest_size_m=cs,
                                   flag_pole_top=[flag[0], round(flag[2], 2), -flag[1]]))


def crest_frame(op, c, size, col, n=(0, -1, 0), hood=None):
    """A painted ground (red-ochre) behind a crest panel, with an optional little pediment hood over it."""
    t, n, up = frame3(n)
    c = Vector(c)
    s = size / 2 + 0.55
    poly(op, (c - t * s - up * s + n * 0.03, c + t * s - up * s + n * 0.03, c + t * s + up * s + n * 0.03, c - t * s + up * s + n * 0.03), col, 0,
         nrm=n, jitter=0.0)
    if hood:
        hz = c + up * (s + 0.05)
        obox(op, hz + n * 0.25, t, n, 2 * s + 0.5, 0.5, 0.22, hood, skip=('-y',))
        poly(op, (hz - t * (s + 0.25) + n * 0.5 + up * 0.11, hz + t * (s + 0.25) + n * 0.5 + up * 0.11, hz + n * 0.5 + up * 1.0), PAL['poly_blue'], 0,
             nrm=n, jitter=0.0)
        for sd in (-1, 1):
            beam(op, hz + t * sd * (s + 0.4) + n * 0.45 + up * 0.05, hz + n * 0.45 + up * 1.15, 0.3, 0.26, hood, up=n)


# ---- TRON: a red-ochre two-storey stoa warehouse on the deep-water quay (the outer harbour), a loading hoist on its
# end gable, porphyry-red velaria. The heart camera sees its -x end and its back, so the crest is carried twice.
def build_office_tron(K, root, chain, coll):
    op = K.op
    P = 0.5
    office_ground(op, P)
    X0, X1, YS, YC, YW, YB = -8.4, 8.4, -4.6, -3.6, -0.6, 4.8
    ZS = P + 0.6
    stairs(op, X0 - 0.3, X1 + 0.3, YS - 0.9, P, ZS, 2, 0.45, PAL['lime'])
    box2(op, X0 - 0.3, YS, P, X1 + 0.3, YB + 0.3, ZS, PAL['lime'], PT['ashlar'], skip=('-z',))
    Z1 = ZS + 4.4
    box2(op, X0, YW, ZS, X1, YB, Z1, STUCCO_RED, PT['render'])
    for s in (-1, 1):
        xa = X1 if s > 0 else X0
        box2(op, min(xa, xa - s * 0.9), YC - 0.4, ZS, max(xa, xa - s * 0.9), YW, Z1, PAL['lime'], PT['ashlar'])
    for x in (-4.8, 0.0, 4.8):
        arch_door(K, (x, YW - 0.04, ZS), (0, -1, 0), 2.0 if x else 2.4, 3.6, PAL['oak_dark'], PAL['lime'], step=False, fanlight=not x)
    xs = colonnade(op, X0 + 0.6, X1 - 0.6, YC, ZS, 4.4, 6, 0.45, PAL['lime'], cap_col=PAL['marble'])
    for x in xs:
        cyl(op, (x, YC), 0.42, 0.42, ZS + 3.75, ZS + 3.95, PAL['poly_black'], 0, 8, top=False)
    zt = entablature(op, X0 - 0.2, X1 + 0.2, YC - 0.5, YB + 0.2, Z1)
    # the upper (store) floor: red stucco with small high openings, a meander under the eaves
    U0, U1 = zt, zt + 3.4
    box2(op, X0 - 0.1, YC - 0.3, U0, X1 + 0.1, YB + 0.1, U1, STUCCO_RED, PT['render'])
    for (a, b, n) in (((X0 - 0.1, YC - 0.3), (X1 + 0.1, YC - 0.3), (0, -1, 0)), ((X0 - 0.1, YB + 0.1), (X0 - 0.1, YC - 0.3), (-1, 0, 0)),
                      ((X1 + 0.1, YB + 0.1), (X0 - 0.1, YB + 0.1), (0, 1, 0))):
        frieze(op, a, b, U1 - 0.7, 0.5, n)
    for x in (-6.4, -3.6, 3.6, 6.4):
        plain_window(K, (x, YC - 0.3, U0 + 1.4), (0, -1, 0), 0.8, 1.0, STUCCO_RED, shutter=PORPHYRY)
        plain_window(K, (x, YB + 0.1, U0 + 1.4), (0, 1, 0), 0.8, 1.0, STUCCO_RED, shutter=PORPHYRY)
    for x in (-4.8, 0.0, 4.8):
        plain_window(K, (x, YB, ZS + 2.2), (0, 1, 0), 0.9, 1.3, STUCCO_RED)
    box2(op, X0 - 0.4, YC - 0.6, U1, X1 + 0.4, YB + 0.4, U1 + 0.3, PAL['lime'], 0)
    RS = tiled_gable(op, X0 - 0.4, YC - 0.6, X1 + 0.4, YB + 0.4, U1 + 0.3, 21.0, PAL['tile_c'], 'x', ov=0.45, end_col=PAL['lime'], end_pat=0,
                     antefix='both')
    ym = (YC - 0.6 + YB + 0.4) / 2
    for s in (-1, 1):
        xa = s * (X1 + 0.45)
        poly(op, ((xa, YC + 0.1, U1 + 0.35), (xa, YB - 0.3, U1 + 0.35), (xa, ym, U1 + 0.3 + RS - 0.35)), PAL['poly_blue'], 0, nrm=(s, 0, 0), jitter=0.0)
    # the crests: the front (centre of the store floor) and the -x end wall, which the heart camera faces
    cs = 2.4
    cz = U0 + 1.65
    crest_frame(op, (0.0, YC - 0.32, cz), cs, PAL['poly_red'], (0, -1, 0))
    crest_panel(K, root, (0.0, YC - 0.34, cz), cs, PAL['gilt'], coll)
    crest_frame(op, (X0 - 0.12, ym, cz), cs, PAL['poly_red'], (-1, 0, 0))
    crest_panel(K, root, (X0 - 0.14, ym, cz), cs, PAL['gilt'], coll, n=(-1, 0, 0))
    # the loading hoist: a timber cathead out of the -x gable, a block, a hanging bale; bales and amphorae below
    hz = U1 + 0.3 + RS * 0.45
    beam(op, (X0 + 0.6, ym + 1.6, hz), (X0 - 2.6, ym + 1.6, hz), 0.34, 0.34, PAL['oak_dark'])
    beam(op, (X0 - 0.1, ym + 1.6, hz - 1.6), (X0 - 1.6, ym + 1.6, hz - 0.1), 0.2, 0.2, PAL['oak_dark'])
    box2(op, X0 - 2.6, ym + 1.4, hz - 0.7, X0 - 2.2, ym + 1.8, hz - 0.2, PAL['oak'], 0)
    beam(op, (X0 - 2.4, ym + 1.6, hz - 0.7), (X0 - 2.4, ym + 1.6, P + 2.6), 0.05, 0.05, PAL['rope'])
    box2(op, X0 - 2.9, ym + 1.0, P + 1.4, X0 - 1.9, ym + 2.2, P + 2.6, PAL['linen'], PT['boards'])
    for (x, y, s_) in ((-9.4, 2.6, 1.0), (-9.3, 4.0, 0.8), (-9.4, 5.4, 1.0)):
        crate(op, (x, y, P), s_, PAL['timber'], 0.2)
    for (x, y) in ((8.8, -6.4), (8.2, -6.9), (8.6, -5.7), (7.6, -6.4)):
        amphora(op, (x, y, P), 0.95)
    velarium(K, (X0 - 0.2, YS - 1.0), (-2.2, YS - 1.0), 2.6, P + 3.6, P + 3.2, ground=P)
    velarium(K, (2.2, YS - 1.0), (X1 + 0.2, YS - 1.0), 2.6, P + 3.6, P + 3.2, ground=P)
    for x in (-1.4, 1.4):
        tripod_lamp(K, (x, YS - 1.9, P))
    fx, fy = -9.0, -7.0
    fz = office_flag(op, root, fx, fy, P, coll)
    return office_emit(K, root, chain, coll, 'stoa-warehouse', ((0.0, YC - 0.34, cz), cs), (fx, fy, fz))


# ---- BSC: an ochre basilica front: a tall pedimented hall, distyle in antis, the crest on the attic, a gilt shield in
# the tympanum and gilt acroteria; two low lean-to aisles either side.
def build_office_bsc(K, root, chain, coll):
    op = K.op
    P = 0.5
    office_ground(op, P)
    W = PAL['wash_ochre']
    ZS = P + 0.8
    HX, HY0, HY1 = 4.4, -4.6, 5.6
    box2(op, -9.0, -5.2, P, 9.0, HY1 + 0.4, ZS, PAL['lime'], PT['ashlar'], skip=('-z',))
    stairs(op, -HX, HX, -6.4, P, ZS, 3, 0.4, PAL['lime'])
    # aisles: low ochre wings with lean-to roofs against the hall
    AE = ZS + 4.2
    for s in (-1, 1):
        xa, xb = (HX, 8.6) if s > 0 else (-8.6, -HX)
        box2(op, xa, -3.4, ZS, xb, HY1, AE, W, PT['render'])
        frieze(op, (xa, -3.4), (xb, -3.4), AE - 0.75, 0.45, (0, -1, 0))
        xo = xb if s > 0 else xa
        frieze(op, (xo, -3.4 if s > 0 else HY1), (xo, HY1 if s > 0 else -3.4), AE - 0.75, 0.45, (s, 0, 0))
        poly(op, ((xo + s * 0.4, -3.8, AE - 0.1), (xo + s * 0.4, HY1 + 0.4, AE - 0.1), (s * HX, HY1 + 0.4, AE + 1.6), (s * HX, -3.8, AE + 1.6)),
             PAL['tile_b'], PT['tiles'], nrm=(s, 0, 1))
        beam(op, (xo + s * 0.4, -3.8, AE - 0.15), (xo + s * 0.4, HY1 + 0.4, AE - 0.15), 0.22, 0.22, PAL['tile_ridge'])
        antefix_row(op, (xo + s * 0.4, -3.6, AE - 0.05), (xo + s * 0.4, HY1 + 0.2, AE - 0.05), (s, 0, 0))
        poly(op, ((xa, -3.82, AE - 0.1), (xb, -3.82, AE - 0.1), (s * HX, -3.82, AE + 1.6)) if s < 0 else
             ((xa, -3.82, AE + 1.6), (xb, -3.82, AE - 0.1), (xa, -3.82, AE - 0.1)), PAL['tile_ridge'], 0, nrm=(0, -1, 0))
        xm = (xa + xb) / 2
        arch_door(K, (xm, -3.4, ZS), (0, -1, 0), 1.4, 2.8, PAL['shutter_ox'], PAL['lime'], step=False, fanlight=True)
        plain_window(K, (xo, 1.2, ZS + 2.4), (s, 0, 0), 0.8, 1.2, W, shutter=PAL['shutter_ox'])
    # the hall: tall ochre walls, antae, two columns in antis, an attic with the crest, a pediment with the gilt shield
    HE = ZS + 5.4
    box2(op, -HX, -2.6, ZS, HX, HY1, HE + 4.0, W, PT['render'])
    for s in (-1, 1):
        box2(op, s * HX - (0.9 if s > 0 else 0), HY0, ZS, s * HX + (0.9 if s < 0 else 0), -2.6, HE, PAL['lime'], PT['ashlar'])
    column(op, -1.5, HY0 + 0.4, ZS, HE - ZS, 0.5, PAL['marble'], 8, PAL['lime'])
    column(op, 1.5, HY0 + 0.4, ZS, HE - ZS, 0.5, PAL['marble'], 8, PAL['lime'])
    arch_door(K, (0.0, -2.64, ZS), (0, -1, 0), 2.2, 4.0, PAL['bronze'], PAL['marble'], step=False)
    zt = entablature(op, -HX - 0.2, HX + 0.2, HY0, -2.6, HE)
    AT = zt + 3.2
    box2(op, -HX - 0.1, HY0 + 0.1, zt, HX + 0.1, -2.6, AT, W, PT['render'])
    cs, cz = 2.6, (zt + AT) / 2
    crest_frame(op, (0.0, HY0 + 0.08, cz), cs, PAL['poly_red'])
    crest_panel(K, root, (0.0, HY0 + 0.06, cz), cs, PAL['gilt'], coll)
    for x in (-3.0, 3.0):
        plain_window(K, (x, HY0 + 0.1, cz), (0, -1, 0), 0.7, 1.1, W)
    box2(op, -HX - 0.4, HY0 - 0.3, AT, HX + 0.4, HY1 + 0.3, AT + 0.4, PAL['marble'], 0)
    PR = rise_for(HX + 0.4, 22.0)
    pediment(op, -HX - 0.4, HX + 0.4, HY0 - 0.4, HY1 + 0.3, AT + 0.85, PR, PAL['marble'], tymp=PAL['poly_blue'], cornice=0.4)
    gable_roof(op, -HX - 0.4, HY0 - 0.4, HX + 0.4, HY1 + 0.3, AT + 0.85, PR, PAL['tile_a'], PT['tiles'], ov=0.3, axis='y', ends=False, th=0.22,
               fascia=PAL['tile_ridge'])
    ridge_cap(op, (0.0, HY0 - 0.4, AT + 0.9 + PR), (0.0, HY1 + 0.6, AT + 0.9 + PR))
    poly(op, ((-HX - 0.4, HY1 + 0.3, AT + 0.85), (HX + 0.4, HY1 + 0.3, AT + 0.85), (0, HY1 + 0.3, AT + 0.85 + PR)), W, PT['render'], nrm=(0, 1, 0))
    # the gilt shield in the tympanum, gilt acroteria
    disc(op, (0.0, HY0 - 0.2, AT + 0.85 + PR * 0.42), (0, -1, 0), 0.62, 0.14, PAL['gilt'], 10, PT['metal'])
    disc(op, (0.0, HY0 - 0.06, AT + 0.85 + PR * 0.42), (0, -1, 0), 0.28, 0.12, PAL['bronze'], 8, PT['metal'])
    for (x, z, h) in ((0.0, AT + 0.85 + PR + 0.2, 1.3), (-HX - 0.75, AT + 0.8, 0.95), (HX + 0.75, AT + 0.8, 0.95)):
        poly(op, ((x - 0.45, HY0 - 0.85, z), (x + 0.45, HY0 - 0.85, z), (x + 0.22, HY0 - 0.85, z + h * 0.6), (x, HY0 - 0.85, z + h),
                  (x - 0.22, HY0 - 0.85, z + h * 0.6)), PAL['gilt'], 0, nrm=(0, -1, 0), jitter=0.0)
    for s in (-1, 1):
        plain_window(K, (s * HX, 2.4, AE + 2.6), (s, 0, 0), 0.8, 1.2, W)
    velarium(K, (-8.8, -5.6), (-HX - 0.4, -5.6), 2.2, P + 3.4, P + 3.0, ground=P)
    velarium(K, (HX + 0.4, -5.6), (8.8, -5.6), 2.2, P + 3.4, P + 3.0, ground=P)
    for x in (-HX - 0.3, HX + 0.3):
        tripod_lamp(K, (x, -6.9, P))
    for (x, y) in ((-9.2, -7.4), (-8.6, -7.5)):
        amphora(op, (x, y, P), 0.9)
    fx, fy = 9.2, -7.3
    fz = office_flag(op, root, fx, fy, P, coll)
    return office_emit(K, root, chain, coll, 'basilica', ((0.0, HY0 + 0.06, cz), cs), (fx, fy, fz))


# ---- SOLANA: a black basalt Egyptian pylon gate (Ptolemaic Egypt): two battered towers with cavetto cornices and
# painted bands, flag masts in their front niches, the crest over the gate, a low hall behind.
def battered_block(op, x0, x1, y0, y1, z0, z1, b, col, pat=PT['ashlar']):
    """A truncated pyramid (pylon tower): the footprint x0..x1, y0..y1 shrinks by b on every side up to z1."""
    B = ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0))
    T = ((x0 + b, y0 + b, z1), (x1 - b, y0 + b, z1), (x1 - b, y1 - b, z1), (x0 + b, y1 - b, z1))
    for i, n in enumerate(((0, -1, 0.2), (1, 0, 0.2), (0, 1, 0.2), (-1, 0, 0.2))):
        j = (i + 1) % 4
        poly(op, (B[i], B[j], T[j], T[i]), col, pat, nrm=n)
    poly(op, T, col, 0, nrm=(0, 0, 1))


def build_office_solana(K, root, chain, coll):
    op = K.op
    P = 0.5
    office_ground(op, P)
    ZS = P + 0.5
    box2(op, -9.0, -4.8, P, 9.0, 6.0, ZS, BASALT_LIGHT, PT['ashlar'], skip=('-z',))
    stairs(op, -2.4, 2.4, -6.0, P, ZS, 2, 0.6, BASALT_LIGHT)
    # the hall behind the gate: sandstone, flat roof with a cavetto parapet, a blue-and-ochre band
    box2(op, -7.6, -1.0, ZS, 7.6, 5.6, ZS + 5.6, PAL['sandstone'], PT['ashlar'])
    for (a, b, n) in (((-7.6, 5.6), (-7.6, -1.0), (-1, 0, 0)), ((7.6, -1.0), (7.6, 5.6), (1, 0, 0)), ((7.6, 5.6), (-7.6, 5.6), (0, 1, 0))):
        meander(op, a, b, ZS + 4.3, 0.5, n, ground=PAL['poly_blue'], key=PAL['poly_ochre'])
    box2(op, -7.9, -1.3, ZS + 5.6, 7.9, 5.9, ZS + 6.0, PAL['sandstone'], 0)
    for y in (1.0, 3.6):
        for s in (-1, 1):
            plain_window(K, (s * 7.6, y, ZS + 2.6), (s, 0, 0), 0.6, 1.6, PAL['sandstone'])
    # the two towers
    TZ = ZS + 8.8
    for s in (-1, 1):
        x0, x1 = (2.0, 8.6) if s > 0 else (-8.6, -2.0)
        b = 0.9
        battered_block(op, x0, x1, -4.6, 0.6, ZS, TZ, b, BASALT, 0)
        # painted on the battered front: a relief panel (ochre figures on Egyptian blue) and a band under the cornice
        def face(u0, u1, w0, w1, col, d=0.03):
            """A quad on the battered front between heights u0..u1 (0..1 of the tower) and widths w0..w1 (0..1)."""
            pts = []
            for (u, w) in ((u0, w0), (u0, w1), (u1, w1), (u1, w0)):
                pts.append((x0 + b * u + (x1 - x0 - 2 * b * u) * w, -4.6 + b * u - d, ZS + (TZ - ZS) * u))
            poly(op, pts, col, 0, nrm=(0, -1, 0.2), jitter=0.0)
        face(0.35, 0.72, 0.16, 0.84, PAL['poly_blue'])
        for k in range(3):
            face(0.4, 0.67, 0.25 + k * 0.18, 0.37 + k * 0.18, PAL['poly_ochre'], 0.05)
        face(0.84, 0.9, 0.0, 1.0, PAL['poly_blue'])
        for k in range(5):
            face(0.85, 0.89, 0.08 + k * 0.19, 0.16 + k * 0.19, PAL['poly_ochre'], 0.05)
        X0c, X1c, Y0c, Y1c = x0 + b, x1 - b, -4.6 + b, 0.6 - b
        prof = [(0.0, 0.0), (0.35, 0.4), (0.8, 0.7), (1.0, 0.85)]     # the cavetto: flaring out over the top
        ring = lambda o, z: [Vector((X0c - o, Y0c - o, z)), Vector((X1c + o, Y0c - o, z)), Vector((X1c + o, Y1c + o, z)), Vector((X0c - o, Y1c + o, z))]
        for (o0, z0_), (o1, z1_) in zip(prof[:-1], prof[1:]):
            A, B_ = ring(o0, TZ + z0_), ring(o1, TZ + z1_)
            for i, n in enumerate(((0, -1, 0.6), (1, 0, 0.6), (0, 1, 0.6), (-1, 0, 0.6))):
                j = (i + 1) % 4
                poly(op, (A[i], A[j], B_[j], B_[i]), PAL['poly_ochre'] if z0_ > 0.3 else PAL['poly_blue'], 0, nrm=n)
        o = 1.0
        poly(op, ((X0c - o, Y0c - o, TZ + 0.85), (X1c + o, Y0c - o, TZ + 0.85), (X1c + o, Y1c + o, TZ + 0.85), (X0c - o, Y1c + o, TZ + 0.85)), BASALT, 0,
             nrm=(0, 0, 1))
        # the flag-mast niche on the front face (the runtime flies the chain's flag from the outer mast)
        mx = x0 + 1.4 if s < 0 else x1 - 1.4
        box2(op, mx - 0.45, -4.6 - 0.1, ZS, mx + 0.45, -4.6 + 0.3, ZS + 0.9, PAL['bronze'], PT['metal'])
        cyl(op, (mx, -4.6 - 0.2), 0.2, 0.1, ZS + 0.9, ZS + (15.0 if s < 0 else 13.0), PAL['oak_dark'], 0, 6)
        sphere(op, (mx, -4.6 - 0.2, ZS + (15.1 if s < 0 else 13.1)), 0.22, PAL['gilt'], 6, 3)
        if s > 0:
            poly(op, ((mx, -4.8, ZS + 12.6), (mx + 2.4, -4.8, ZS + 12.2), (mx, -4.8, ZS + 11.6)), PAL['linen'], 0, nrm=(0, -1, 0), jitter=0.0)
    # the gate: a lower basalt block between the towers with the bronze doors and the crest on its lintel
    GZ = ZS + 7.4
    box2(op, -2.0, -4.0, ZS, 2.0, 0.6, GZ, BASALT, PT['ashlar'])
    box2(op, -2.3, -4.3, GZ, 2.3, 0.9, GZ + 0.6, BASALT_LIGHT, 0)
    poly(op, ((-1.1, -4.03, ZS), (1.1, -4.03, ZS), (1.1, -4.03, ZS + 3.6), (-1.1, -4.03, ZS + 3.6)), PAL['bronze'], PT['boards'], nrm=(0, -1, 0))
    beam(op, (-1.3, -4.1, ZS + 3.75), (1.3, -4.1, ZS + 3.75), 0.3, 0.3, PAL['poly_ochre'])
    cs, cz = 2.4, ZS + 5.6
    crest_frame(op, (0.0, -4.02, cz), cs - 0.5, PAL['poly_blue'])
    crest_panel(K, root, (0.0, -4.04, cz), cs, PAL['gilt'], coll)
    for s in (-1, 1):   # the winged disc's wings either side of the crest
        poly(op, ((s * 1.75, -4.05, cz + 0.6), (s * 1.95, -4.05, cz + 0.9), (s * 1.95, -4.05, cz + 0.2), (s * 1.75, -4.05, cz + 0.0)), PAL['gilt'], 0,
             nrm=(0, -1, 0), jitter=0.0)
    # quay: velaria either side of the gate stair, sphinx-plinths with bronze braziers, amphorae
    velarium(K, (-8.8, -5.9), (-3.0, -5.9), 1.9, P + 3.3, P + 2.9, ground=P)
    velarium(K, (3.0, -5.9), (8.8, -5.9), 1.9, P + 3.3, P + 2.9, ground=P)
    for s in (-1, 1):
        box2(op, s * 2.9 - 0.5, -6.7, P, s * 2.9 + 0.5, -5.9, P + 1.1, BASALT, PT['ashlar'])
        tripod_lamp(K, (s * 2.9, -6.3, P + 1.1), 1.0)
    for (x, y) in ((9.0, 7.0), (8.4, 7.2)):
        amphora(op, (x, y, P), 0.9)
    fx, fy = -8.6 + 1.4, -4.8
    fz = ZS + 14.8
    flag_node(root, (fx, fy, fz), coll, 'chain house flag (crest on the chain colour)')
    return office_emit(K, root, chain, coll, 'pylon', ((0.0, -4.04, cz), cs), (fx, fy, fz))


# ---- HYPERLIQUID-L1: a two-storey white-marble stoa (Doric below, Ionic above) under a tiled hip, the crest in the
# open upper centre bay under a pedimented gable, a teal-glazed fountain-house aedicule on the -x end.
def build_office_hyperliquid(K, root, chain, coll):
    op = K.op
    P = 0.5
    office_ground(op, P)
    X0, X1, YS, YC, YW, YB = -7.6, 8.4, -4.6, -3.6, -0.6, 4.8
    ZS = P + 0.6
    stairs(op, X0 - 0.3, X1 + 0.3, YS - 0.9, P, ZS, 2, 0.45, PAL['lime'])
    box2(op, X0 - 0.3, YS, P, X1 + 0.3, YB + 0.3, ZS, PAL['lime'], PT['ashlar'], skip=('-z',))
    W = PAL['wash_white']
    Z1 = ZS + 4.2
    box2(op, X0, YW, ZS, X1, YB, Z1, W, PT['render'])
    xc = (X0 + X1) / 2
    for x in (xc - 4.6, xc, xc + 4.6):
        arch_door(K, (x, YW - 0.04, ZS), (0, -1, 0), 1.6 if x != xc else 2.2, 3.2, TEAL_DARK if x != xc else PAL['bronze'], PAL['marble'], step=False,
                  fanlight=x != xc)
    xs = colonnade(op, X0 + 0.5, X1 - 0.5, YC, ZS, 4.2, 7, 0.4, PAL['marble'], cap_col=PAL['lime'])
    for s in (-1, 1):
        xa = X1 if s > 0 else X0
        box2(op, min(xa, xa - s * 0.8), YC - 0.4, ZS, max(xa, xa - s * 0.8), YW, Z1, PAL['marble'], 0)
    zt = entablature(op, X0 - 0.2, X1 + 0.2, YC - 0.5, YB + 0.2, Z1)
    # upper storey: an Ionic gallery (open loggia) in front of the upper wall; the centre bay left open for the crest
    U1 = zt + 3.8
    box2(op, X0, YW + 0.4, zt, X1, YB, U1, W, PT['render'])
    box2(op, X0 - 0.2, YC - 0.5, zt, X1 + 0.2, YW + 0.4, zt + 0.25, PAL['marble'], 0)
    rail(op, [(X0, YC - 0.3, zt + 0.25), (xc - 1.9, YC - 0.3, zt + 0.25)], 0.9, PAL['marble'], 0.5, r=0.06)
    rail(op, [(xc + 1.9, YC - 0.3, zt + 0.25), (X1, YC - 0.3, zt + 0.25)], 0.9, PAL['marble'], 0.5, r=0.06)
    for k, x in enumerate(xs):
        if k == 3:
            continue
        ionic_colonnade(op, x, x + 1e-3, YC, zt + 0.25, 3.3, 2, 0.3, PAL['marble'], PAL['lime'])
    for x in (xc - 4.6, xc + 4.6, xc - 7.0, xc + 7.0):
        plain_window(K, (x, YW + 0.4, zt + 1.9), (0, -1, 0), 0.9, 1.6, W)
    # the centre bay is closed by a marble tablet on the gallery line carrying the crest (in the sun, not in the loggia)
    cs, cz, cy = 2.6, zt + 2.05, YC - 0.25
    box2(op, xc - 1.9, cy, zt + 0.25, xc + 1.9, cy + 0.5, U1, PAL['marble'], 0)
    crest_frame(op, (xc, cy - 0.02, cz), cs, PAL['poly_red'])
    crest_panel(K, root, (xc, cy - 0.04, cz), cs, PAL['gilt'], coll)
    box2(op, X0 - 0.3, YC - 0.6, U1, X1 + 0.3, YB + 0.3, U1 + 0.6, PAL['marble'], 0)
    triglyph_band(op, (X0 - 0.3, YC - 0.62), (X1 + 0.3, YC - 0.62), U1 - 0.6, 0.6, (0, -1, 0))
    tiled_hip(op, X0 - 0.3, YC - 0.6, X1 + 0.3, YB + 0.3, U1 + 0.6, 22.0, PAL['tile_b'], ov=0.45, antefix='all')
    # a small pedimented gable over the crest bay, breaking the hip's front slope
    pr = rise_for(2.3, 24.0)
    pediment(op, xc - 2.2, xc + 2.2, YC - 0.75, YC + 2.2, U1 + 0.6, pr, PAL['marble'], tymp=TEAL_GLAZE, cornice=0.3)
    gable_roof(op, xc - 2.2, YC - 0.75, xc + 2.2, YC + 2.6, U1 + 0.6, pr, PAL['tile_b'], PT['tiles'], ov=0.0, axis='y', ends=False, th=0.2,
               fascia=PAL['tile_ridge'])
    sphere(op, (xc, YC - 0.9, U1 + 0.6 + pr + 0.3), 0.3, PAL['gilt'], 6, 3)
    # the fountain house on the -x end: a teal-glazed niche between two little columns under a pediment, bronze spouts,
    # a marble basin
    FX = X0 - 0.3
    box2(op, FX - 2.0, -2.2, P, FX, 3.0, P + 0.6, PAL['marble'], 0)
    box2(op, FX - 0.3, -2.0, P + 0.6, FX + 0.05, 2.8, P + 4.6, TEAL_GLAZE, PT['tiles'])
    for y in (-1.7, 2.5):
        column(op, FX - 1.6, y, P + 0.6, 3.6, 0.26, PAL['marble'], 8, PAL['lime'])
    box2(op, FX - 2.0, -2.2, P + 4.2, FX, 3.0, P + 4.8, PAL['marble'], 0)
    for k, y in enumerate((-0.6, 0.4, 1.4)):
        beam(op, (FX - 0.3, y, P + 2.4), (FX - 0.7, y, P + 2.2), 0.24, 0.24, PAL['bronze'])
        beam(op, (FX - 0.75, y, P + 2.15), (FX - 1.0, y, P + 1.2), 0.07, 0.07, lin('#BFE3E6'))
    box2(op, FX - 1.5, -1.3, P + 0.6, FX - 0.3, 2.1, P + 1.2, PAL['marble'], 0)
    poly(op, ((FX - 1.4, -1.2, P + 1.15), (FX - 0.4, -1.2, P + 1.15), (FX - 0.4, 2.0, P + 1.15), (FX - 1.4, 2.0, P + 1.15)), PAL['water'], 0,
         nrm=(0, 0, 1), jitter=0.0)
    gable_roof(op, FX - 2.2, -2.4, FX + 0.2, 3.2, P + 4.8, 0.9, PAL['tile_b'], PT['tiles'], ov=0.1, axis='x', ends=True, end_col=TEAL_GLAZE, end_pat=0)
    velarium(K, (X0 - 0.2, YS - 1.0), (xc - 2.0, YS - 1.0), 2.5, P + 3.5, P + 3.1, ground=P)
    velarium(K, (xc + 2.0, YS - 1.0), (X1 + 0.2, YS - 1.0), 2.5, P + 3.5, P + 3.1, ground=P)
    for x in (xc - 1.3, xc + 1.3):
        tripod_lamp(K, (x, YS - 1.9, P))
    fx, fy = 9.3, -7.0
    fz = office_flag(op, root, fx, fy, P, coll, finial=TEAL_GLAZE)
    return office_emit(K, root, chain, coll, 'two-storey-stoa', ((xc, cy - 0.04, cz), cs), (fx, fy, fz))


# ---- BASE: a Corinthian tetrastyle portico on a tall podium, whitewashed cella with blue doors, Cycladic whitewashed
# cubes with blue doors and a roof terrace either side.
def corinthian_colonnade(op, xs, y, z0, h, r, col=None, cap_col=None):
    col, cap_col = col or PAL['marble'], cap_col or PAL['marble']
    for x in xs:
        cyl(op, (x, y), r * 1.4, r * 1.4, z0, z0 + r * 0.5, col, 0, 8)
        cyl(op, (x, y), r * 1.15, r, z0 + r * 0.5, z0 + r * 0.85, col, 0, 8, top=False)
        cyl(op, (x, y), r, r * 0.86, z0 + r * 0.85, z0 + h - r * 1.6, col, 0, 8, top=False, smooth=True, rot=math.pi / 8)
        # the bell: two rows of acanthus (leaf tips flaring out) and corner volutes under a concave abacus
        lathe(op, (x, y), [(r * 0.88, z0 + h - r * 1.6), (r * 1.15, z0 + h - r * 0.9), (r * 1.45, z0 + h - r * 0.3)], cap_col, 0, 8, smooth=True,
              cap=False)
        for k in range(8):
            a = 2 * math.pi * k / 8 + (math.pi / 8 if k % 2 else 0)
            zz = z0 + h - r * (1.25 if k % 2 else 0.85)
            poly(op, ((x + r * 0.95 * math.cos(a - 0.3), y + r * 0.95 * math.sin(a - 0.3), zz - r * 0.35),
                      (x + r * 0.95 * math.cos(a + 0.3), y + r * 0.95 * math.sin(a + 0.3), zz - r * 0.35),
                      (x + r * 1.45 * math.cos(a), y + r * 1.45 * math.sin(a), zz + r * 0.35)), mul(cap_col, 0.88), 0,
                 nrm=(math.cos(a), math.sin(a), 0.3), jitter=0.0)
        box2(op, x - r * 1.5, y - r * 1.5, z0 + h - r * 0.3, x + r * 1.5, y + r * 1.5, z0 + h, cap_col, 0)


def build_office_base(K, root, chain, coll):
    op = K.op
    P = 0.5
    office_ground(op, P)
    W = PAL['wash_white']
    BLUE = PAL['shutter_blue']
    CX0, CX1, CY0, CY1 = -4.6, 4.6, -1.4, 6.4
    ZP = P + 2.2                       # the podium top
    box2(op, CX0 - 0.3, -5.8, P, CX1 + 0.3, CY1 + 0.3, ZP - 0.3, PAL['sandstone'], PT['ashlar'])
    box2(op, CX0 - 0.5, -6.0, ZP - 0.3, CX1 + 0.5, CY1 + 0.5, ZP, PAL['marble'], 0)
    stairs(op, -2.6, 2.6, -7.9, P, ZP, 7, 0.3, PAL['lime'])
    for s in (-1, 1):   # stair cheeks with bronze tripods
        box2(op, s * 3.1 - 0.5, -7.9, P, s * 3.1 + 0.5, -5.8, ZP - 0.3, PAL['sandstone'], PT['ashlar'])
        tripod_lamp(K, (s * 3.1, -7.4, ZP - 0.3), 1.2)
    CE = ZP + 6.6
    box2(op, CX0, CY0, ZP, CX1, CY1, CE, W, PT['render'])
    frieze(op, (CX1, CY0), (CX1, CY1), CE - 0.9, 0.5, (1, 0, 0), ground=PAL['poly_blue'], key=PAL['wash_white'])
    frieze(op, (CX0, CY1), (CX0, CY0), CE - 0.9, 0.5, (-1, 0, 0), ground=PAL['poly_blue'], key=PAL['wash_white'])
    for y in (1.2, 4.2):
        for s in (-1, 1):
            plain_window(K, (s * CX1, y, ZP + 3.4), (s, 0, 0), 0.8, 1.6, W, shutter=BLUE)
    arch_door(K, (0.0, CY0, ZP), (0, -1, 0), 1.8, 3.4, BLUE, PAL['marble'], step=False, fanlight=True)
    corinthian_colonnade(op, (-3.9, -1.65, 1.65, 3.9), -5.2, ZP, 6.6, 0.42)
    # the crest as a votive tablet hung in the wide central intercolumniation, from bronze chains off the architrave
    cs, cz, cy = 2.2, CE - 1.75, -5.2
    for x in (-0.8, 0.8):
        beam(op, (x, cy, CE), (x, cy, cz + cs / 2 + 0.2), 0.06, 0.06, PAL['bronze_dark'])
    crest_frame(op, (0.0, cy + 0.12, cz), cs - 0.8, PAL['poly_blue'])
    crest_panel(K, root, (0.0, cy, cz), cs, PAL['gilt'], coll)
    zt = entablature(op, CX0 - 0.3, CX1 + 0.3, -5.8, CY1 + 0.3, CE, kind='meander')
    PR = rise_for(CX1 + 0.6, 22.0)
    pediment(op, CX0 - 0.6, CX1 + 0.6, -6.1, CY1 + 0.6, zt + 0.5, PR, PAL['marble'], tymp=PAL['poly_blue'], cornice=0.4)
    gable_roof(op, CX0 - 0.6, -6.1, CX1 + 0.6, CY1 + 0.6, zt + 0.5, PR, PAL['tile_c'], PT['tiles'], ov=0.3, axis='y', ends=False, th=0.22,
               fascia=PAL['tile_ridge'])
    ridge_cap(op, (0.0, -6.1, zt + 0.55 + PR), (0.0, CY1 + 0.9, zt + 0.55 + PR))
    poly(op, ((CX0 - 0.6, CY1 + 0.6, zt + 0.5), (CX1 + 0.6, CY1 + 0.6, zt + 0.5), (0, CY1 + 0.6, zt + 0.5 + PR)), W, PT['render'], nrm=(0, 1, 0))
    for (x, z, h) in ((0.0, zt + 0.5 + PR + 0.2, 1.0), (CX0 - 0.95, zt + 0.45, 0.7), (CX1 + 0.95, zt + 0.45, 0.7)):
        poly(op, ((x - 0.4, -6.55, z), (x + 0.4, -6.55, z), (x + 0.2, -6.55, z + h * 0.6), (x, -6.55, z + h), (x - 0.2, -6.55, z + h * 0.6)),
             PAL['gilt'], 0, nrm=(0, -1, 0), jitter=0.0)
    # the Cycladic cubes either side: whitewash, blue doors and shutters, a roof terrace with a pergola on one
    for s in (-1, 1):
        xa, xb = (5.4, 9.4) if s > 0 else (-9.4, -5.4)
        box2(op, xa, -2.4, P, xb, 5.6, P + 4.2, W, PT['render'])
        roof_terrace(op, xa, -2.4, xb, 5.6, P + 4.2, W, 0.7, pergola_canopy='bougain' if s > 0 else None, rng=K.rng)
        xm = (xa + xb) / 2
        arch_door(K, (xm, -2.4, P), (0, -1, 0), 1.2, 2.4, BLUE, W)
        plain_window(K, (xm, -2.4, P + 3.2), (0, -1, 0), 0.7, 0.8, W, shutter=BLUE)
        plain_window(K, (xb if s > 0 else xa, 1.6, P + 2.2), (s, 0, 0), 0.7, 1.0, W, shutter=BLUE)
        pot_plant(op, K.rng, (xm + s * 1.4, -3.0, P), 'bougain' if s > 0 else 'olive')
    velarium(K, (-9.4, -4.0), (-3.8, -4.0), 2.4, P + 3.4, P + 3.0, ground=P)
    velarium(K, (3.8, -4.0), (9.4, -4.0), 2.4, P + 3.4, P + 3.0, ground=P)
    fx, fy = 9.2, -7.4
    fz = office_flag(op, root, fx, fy, P, coll)
    return office_emit(K, root, chain, coll, 'podium-temple', ((0.0, cy, cz), cs), (fx, fy, fz))


# ---- ARBITRUM: a round tholos kiosk: a peristyle of eight columns under a ring of tiles, a clerestory drum rising
# above it carrying the crest, a low tile cone, and a ring velarium round the peristyle (split at the entrance).
def build_office_arbitrum(K, root, chain, coll):
    op = K.op
    P = 0.5
    office_ground(op, P)
    C = Vector((0.0, 0.4, 0))
    R, DR = 4.6, 3.0
    z = P
    for k, rr in enumerate((R + 1.6, R + 1.1)):
        cyl(op, C, rr, rr, z, z + 0.4, PAL['lime'] if k % 2 == 0 else PAL['marble'], PT['ashlar'], 16)
        z += 0.4
    ZS = z
    H = 4.2
    for i in range(8):
        a = -math.pi / 2 + 2 * math.pi * (i + 0.5) / 8
        column(op, C.x + R * math.cos(a), C.y + R * math.sin(a), ZS, H, 0.36, PAL['marble'], 8, PAL['lime'])
    zt = ZS + H
    cyl(op, C, R + 0.55, R + 0.55, zt, zt + 0.6, PAL['lime'], 0, 16, top=False)
    cyl(op, C, R + 0.57, R + 0.57, zt + 0.6, zt + 1.1, PAL['poly_red'], 0, 16, top=False)
    cyl(op, C, R + 0.8, R + 0.8, zt + 1.1, zt + 1.35, PAL['marble'], 0, 16, top=False)
    # the drum (the cella, rising through the peristyle roof as a clerestory)
    DZ = zt + 5.8
    W = PAL['wash_cream']
    cyl(op, C, DR, DR, ZS, DZ, W, PT['render'], 16, top=False)
    lathe(op, C, [(R + 1.1, zt + 1.25), (DR + 0.05, zt + 2.3)], PAL['tile_a'], PT['tiles'], 16, smooth=False, cap=False)
    for i in range(16):        # antefixes on the ring eave
        a = 2 * math.pi * (i + 0.5) / 16
        antefix(op, (C.x + (R + 1.1) * math.cos(a), C.y + (R + 1.1) * math.sin(a), zt + 1.25), (-math.sin(a), math.cos(a), 0), (math.cos(a), math.sin(a), 0))
    cyl(op, C, DR + 0.25, DR + 0.25, DZ - 0.9, DZ - 0.4, PAL['poly_blue'], 0, 16, top=False)
    cyl(op, C, DR + 0.45, DR + 0.45, DZ - 0.4, DZ, PAL['marble'], 0, 16)
    rise = rise_for(DR + 0.6, 24.0)
    lathe(op, C, [(DR + 0.75, DZ - 0.1), (0.4, DZ + rise * 0.9), (0.0, DZ + rise)], PAL['tile_a'], PT['tiles'], 16, smooth=False)
    cyl(op, C, 0.3, 0.16, DZ + rise - 0.1, DZ + rise + 0.6, PAL['bronze'], PT['metal'], 6)
    sphere(op, (C.x, C.y, DZ + rise + 0.85), 0.32, PAL['gilt'], 6, 3)
    # the crest on the drum front, above the peristyle roof; clerestory openings round the rest
    cs, cz = 2.2, zt + 3.75
    cy = C.y - DR - 0.05
    crest_frame(op, (C.x, cy, cz), cs - 0.7, PAL['poly_red'])
    crest_panel(K, root, (C.x, cy - 0.02, cz), cs, PAL['gilt'], coll)
    for k in (2, 3, 5, 6):
        a = -math.pi / 2 + 2 * math.pi * k / 8
        n_ = Vector((math.cos(a), math.sin(a), 0))
        t_, nn, up = frame3(n_)
        g = C + n_ * (DR + 0.02) + Vector((0, 0, zt + 3.5))
        lit_opening(K, [g - t_ * 0.35 - up * 0.6, g + t_ * 0.35 - up * 0.6, g + t_ * 0.35 + up * 0.6, g - t_ * 0.35 + up * 0.6], tuple(n_))
    arch_door(K, (C.x, C.y - DR, ZS), (0, -1, 0), 1.6, 3.2, PAL['bronze'], PAL['marble'], step=False, fanlight=True)
    for k in (1, 7):
        a = -math.pi / 2 + 2 * math.pi * k / 8
        n_ = Vector((math.cos(a), math.sin(a), 0))
        plain_window(K, tuple(C + n_ * DR + Vector((0, 0, ZS + 2.0))), tuple(n_), 0.8, 1.4, W)
    # the ring velarium: cloth from the peristyle's eave out to a ring of poles, open over the entrance
    RI, RO, ZI, ZO = R + 1.0, R + 2.8, ZS + 3.0, ZS + 2.5
    segs = 16
    for i in range(segs):
        a0, a1 = 2 * math.pi * i / segs, 2 * math.pi * (i + 1) / segs
        am = (a0 + a1) / 2
        if abs(math.atan2(math.sin(am + math.pi / 2), math.cos(am + math.pi / 2))) < 0.5:
            continue
        sh = (1.0, 1.0, 1.0) if i % 2 == 0 else (0.72, 0.72, 0.72)
        rm, zm = (RI + RO) / 2, (ZI + ZO) / 2 - 0.25
        I0, I1 = C + Vector((RI * math.cos(a0), RI * math.sin(a0), ZI)), C + Vector((RI * math.cos(a1), RI * math.sin(a1), ZI))
        M0, M1 = C + Vector((rm * math.cos(a0), rm * math.sin(a0), zm)), C + Vector((rm * math.cos(a1), rm * math.sin(a1), zm))
        O0, O1 = C + Vector((RO * math.cos(a0), RO * math.sin(a0), ZO)), C + Vector((RO * math.cos(a1), RO * math.sin(a1), ZO))
        nrm = Vector((math.cos(am), math.sin(am), 3.0))
        poly(K.cover, (I0, I1, M1, M0), sh, 0, nrm=nrm, jitter=0.0)
        poly(K.cover, (M0, M1, O1, O0), sh, 0, nrm=nrm, jitter=0.0)
        poly(K.cover, (O0, O1, (O0 + O1) / 2 - Vector((0, 0, 0.5))), mul(sh, 0.9), 0, nrm=(math.cos(am), math.sin(am), 0), jitter=0.0)
        if i % 2 == 0:
            p = C + Vector((RO * math.cos(a0), RO * math.sin(a0), 0))
            cyl(op, (p.x, p.y), 0.1, 0.08, P, ZO + 0.5, PAL['oak_dark'], PT['boards'], 6)
            sphere(op, (p.x, p.y, ZO + 0.6), 0.15, PAL['bronze_light'], 6, 3)
    for x in (-1.4, 1.4):
        tripod_lamp(K, (x, -6.8, P))
    for (x, y) in ((-9.0, 6.8), (-8.4, 7.2), (9.0, 7.0)):
        amphora(op, (x, y, P), 0.9)
    fx, fy = -9.0, -7.2
    fz = office_flag(op, root, fx, fy, P, coll)
    return office_emit(K, root, chain, coll, 'tholos', ((C.x, cy - 0.02, cz), cs), (fx, fy, fz))


# ---- POLYGON: a rose-stucco warehouse: a ground loggia of square piers with flat lintels, an upper storey of opus
# reticulatum panels between brick pilasters, a low tiled hip, the crest on the upper centre panel.
def reticulatum(op, a, b, z0, z1, n_out, unit=0.5, c0=None, c1=None):
    """Opus reticulatum: a net of small diamond-set squares (two tufa tones) on the wall face a -> b from z0 to z1."""
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    L = (b - a).length
    t = (b - a) / L
    n = Vector(n_out).normalized()
    up = Vector((0, 0, 1))
    c0, c1 = c0 or TUFA, c1 or TUFA_DARK
    o = a + n * 0.04
    poly(op, (o + up * z0, o + t * L + up * z0, o + t * L + up * z1, o + up * z1), mul(c0, 0.8), 0, nrm=n, jitter=0.0)
    d = unit / 2
    nx, nz = int(L / unit), int((z1 - z0) / unit)
    mx, mz = (L - nx * unit) / 2, (z1 - z0 - nz * unit) / 2
    for i in range(nx):
        for j in range(nz):
            c = o + n * 0.03 + t * (mx + (i + 0.5) * unit) + up * (z0 + mz + (j + 0.5) * unit)
            poly(op, (c - up * d * 0.9, c + t * d * 0.9, c + up * d * 0.9, c - t * d * 0.9), c0 if (i + j) % 2 else c1, 0, nrm=n, jitter=0.0)


def build_office_polygon(K, root, chain, coll):
    op = K.op
    P = 0.5
    office_ground(op, P)
    W = PAL['wash_rose']
    X0, X1, Y0, Y1 = -8.2, 8.2, -3.6, 5.6
    ZS = P + 0.5
    box2(op, X0 - 0.4, Y0 - 0.8, P, X1 + 0.4, Y1 + 0.4, ZS, PAL['lime'], PT['ashlar'], skip=('-z',))
    # the ground loggia: square brick-cased piers and flat timber lintels in front of the store's arched doors
    YW = Y0 + 2.2
    G1 = ZS + 4.4
    box2(op, X0, YW, ZS, X1, Y1, G1, W, PT['render'])
    for x in (-5.4, 0.0, 5.4):
        arch_door(K, (x, YW - 0.04, ZS), (0, -1, 0), 2.2, 3.4, PAL['oak_dark'] if x else PAL['bronze'], PAL['lime'], step=False, fanlight=bool(x))
    for k in range(6):
        x = X0 + 0.45 + (X1 - X0 - 0.9) * k / 5
        box2(op, x - 0.45, Y0 - 0.45, ZS, x + 0.45, Y0 + 0.45, G1, PAL['brick_light'], PT['ashlar'])
        box2(op, x - 0.55, Y0 - 0.55, G1 - 0.35, x + 0.55, Y0 + 0.55, G1, PAL['lime'], 0)
    box2(op, X0 - 0.1, Y0 - 0.5, G1, X1 + 0.1, YW, G1 + 0.7, PAL['oak_dark'], PT['boards'])
    poly(op, ((X0, Y0 + 0.3, ZS + 0.02), (X1, Y0 + 0.3, ZS + 0.02), (X1, YW, ZS + 0.02), (X0, YW, ZS + 0.02)), PAL['tile_c'], PT['cobble'], nrm=(0, 0, 1))
    # upper storey: reticulatum panels between pilasters, small windows, a meander under the eaves
    U0, U1 = G1 + 0.7, G1 + 4.6
    box2(op, X0, Y0 - 0.5, U0, X1, Y1, U1, W, PT['render'])
    px = [X0 + (X1 - X0) * k / 4 for k in range(5)]
    for x in px:
        box2(op, x - 0.35, Y0 - 0.65, U0, x + 0.35, Y0 - 0.45, U1, PAL['brick_light'], PT['ashlar'])
    for k in range(4):
        if k in (1, 2):
            continue
        reticulatum(op, (px[k] + 0.4, Y0 - 0.5), (px[k + 1] - 0.4, Y0 - 0.5), U0 + 0.3, U0 + 1.5, (0, -1, 0))
        plain_window(K, ((px[k] + px[k + 1]) / 2, Y0 - 0.5, U0 + 2.5), (0, -1, 0), 0.9, 1.1, W, shutter=PAL['shutter_teal'])
    for k in range(4):
        y0_, y1_ = Y0 - 0.5 + (Y1 - Y0 + 0.5) * k / 4, Y0 - 0.5 + (Y1 - Y0 + 0.5) * (k + 1) / 4
        reticulatum(op, (X1, y0_ + 0.35), (X1, y1_ - 0.35), U0 + 0.3, U1 - 0.6, (1, 0, 0))
        if k < 3:
            box2(op, X1 - 0.1, y1_ - 0.3, U0, X1 + 0.18, y1_ + 0.3, U1, PAL['brick_light'], PT['ashlar'])
    cs, cz = 2.6, U0 + 1.7
    crest_frame(op, (0.0, Y0 - 0.52, cz), cs, PAL['poly_red'])
    crest_panel(K, root, (0.0, Y0 - 0.54, cz), cs, PAL['gilt'], coll)
    frieze(op, (X0, Y0 - 0.52), (X1, Y0 - 0.52), U1 - 0.65, 0.5, (0, -1, 0))
    box2(op, X0 - 0.35, Y0 - 0.85, U1, X1 + 0.35, Y1 + 0.35, U1 + 0.35, PAL['lime'], 0)
    tiled_hip(op, X0 - 0.35, Y0 - 0.85, X1 + 0.35, Y1 + 0.35, U1 + 0.35, 20.0, PAL['tile_a'], ov=0.5, antefix='all')
    flue(op, -5.0, 3.2, U1 + 2.2, 1.0, W)
    # quay: velaria, bales and sacks, a hand-cart
    velarium(K, (X0 - 0.2, Y0 - 1.6), (-1.8, Y0 - 1.6), 2.5, P + 3.4, P + 3.0, ground=P)
    velarium(K, (1.8, Y0 - 1.6), (X1 + 0.2, Y0 - 1.6), 2.5, P + 3.4, P + 3.0, ground=P)
    for (x, y, s_) in ((-9.3, -6.2, 0.9), (-9.2, -5.1, 0.8), (-8.4, -6.4, 0.7)):
        crate(op, (x, y, P), s_, PAL['timber'], 0.3)
    for x in (-1.2, 1.2):
        tripod_lamp(K, (x, -6.2, P))
    fx, fy = 9.2, -7.2
    fz = office_flag(op, root, fx, fy, P, coll)
    return office_emit(K, root, chain, coll, 'pier-loggia', ((0.0, Y0 - 0.54, cz), cs), (fx, fy, fz))


OFFICE_BUILDERS = {'tron': build_office_tron, 'bsc': build_office_bsc, 'solana': build_office_solana,
                   'hyperliquid-l1': build_office_hyperliquid, 'base': build_office_base, 'arbitrum': build_office_arbitrum,
                   'polygon': build_office_polygon}


def build_office(chain, coll=None):
    if chain == 'ethereum':
        return build_stoa_office(chain, coll)
    root = empty(f'harbour-office:{chain}', coll=coll)
    return OFFICE_BUILDERS[chain](Kit(60 + OFFICE_CHAINS.index(chain)), root, chain, coll)
