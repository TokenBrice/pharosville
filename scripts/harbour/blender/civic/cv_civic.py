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


# =================================================================== THE CHART ROOM  18 x 14  (observatory dome + armillary)
def build_chartroom(coll=None):
    root = empty('chartroom', coll=coll)
    K = Kit(43)
    op = K.op
    P = 0.6
    box2(op, -9.0, -7.0, -1.5, 9.0, 7.0, P, PAL['granite'], PT['ashlar'], skip=('+z',))
    poly(op, ((-9, -7, P), (9, -7, P), (9, 7, P), (-9, 7, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    # compass rose inlaid in the forecourt
    rc = Vector((-4.6, -3.6, P + 0.02))
    disc_pts = [rc + Vector((2.3 * math.cos(2 * math.pi * k / 16), 2.3 * math.sin(2 * math.pi * k / 16), 0)) for k in range(16)]
    for a, b in zip(disc_pts, disc_pts[1:] + disc_pts[:1]):
        poly(op, (rc, a, b), PAL['stone_light'], 0, nrm=(0, 0, 1), jitter=0.0)
    for k in range(8):
        a = math.pi / 2 + 2 * math.pi * k / 8
        L_ = 2.2 if k % 2 == 0 else 1.3
        tip = rc + Vector((L_ * math.cos(a), L_ * math.sin(a), 0.03))
        for s in (-1, 1):
            side = rc + Vector((0.32 * math.cos(a + s * math.pi / 2), 0.32 * math.sin(a + s * math.pi / 2), 0.03))
            poly(op, (rc + Vector((0, 0, 0.03)), side, tip), PAL['gilt'] if (k == 0) else (PAL['flag_blue'] if s > 0 else PAL['slate']), 0,
                 nrm=(0, 0, 1), jitter=0.0)
    # observatory drum + dome with a shutter slit and a telescope
    DC, DR = Vector((-1.0, 1.6, 0)), 4.6
    cyl(op, DC, DR, DR, P, P + 5.6, PAL['stone'], PT['ashlar'], 16, top=False)
    cyl(op, DC, DR + 0.25, DR + 0.25, P + 5.6, P + 6.1, PAL['stone_light'], 0, 16, top=False)
    for k in range(6):
        a = -math.pi / 2 + (k - 2.5) * 0.5
        window(K, (DC.x + DR * math.cos(a), DC.y + DR * math.sin(a), P + 3.0), (math.cos(a), math.sin(a), 0), 0.8, 1.6, arch=True, frame=PAL['stone_light'])
    dz0 = P + 6.1
    prof = [(DR * math.cos(0.5 * math.pi * i / 6), dz0 + DR * 0.95 * math.sin(0.5 * math.pi * i / 6)) for i in range(7)]
    segs = 16
    for i in range(len(prof) - 1):
        for k in range(segs):
            a0, a1 = 2 * math.pi * k / segs, 2 * math.pi * (k + 1) / segs
            mid = (a0 + a1) / 2
            slit = abs(math.atan2(math.sin(mid - (-math.pi / 2 + 0.35)), math.cos(mid - (-math.pi / 2 + 0.35)))) < 0.2 and i < 5
            (r0, z0), (r1, z1) = prof[i], prof[i + 1]
            pts = [(DC.x + r0 * math.cos(a0), DC.y + r0 * math.sin(a0), z0), (DC.x + r0 * math.cos(a1), DC.y + r0 * math.sin(a1), z0),
                   (DC.x + r1 * math.cos(a1), DC.y + r1 * math.sin(a1), z1), (DC.x + r1 * math.cos(a0), DC.y + r1 * math.sin(a0), z1)]
            if r1 < 1e-3:
                pts = pts[:3]
            c = PAL['interior'] if slit else PAL['lead']
            poly(op, pts, c, 0, nrm=Vector((math.cos(mid), math.sin(mid), 0.6)), smooth=not slit)
    sa = -math.pi / 2 + 0.35
    for s in (-1, 1):   # slit ribs
        a = sa + s * 0.2
        pts = [Vector((DC.x + (r + 0.08) * math.cos(a), DC.y + (r + 0.08) * math.sin(a), z)) for r, z in prof[:6]]
        for p, q in zip(pts[:-1], pts[1:]):
            beam(op, p, q, 0.22, 0.18, PAL['copper_dark'])
    tb = DC + Vector((0, 0, dz0 + 1.2))
    td = Vector((math.cos(sa) * 0.75, math.sin(sa) * 0.75, 0.66)).normalized()
    rod(op, tb, tb + td * 6.6, 0.42, PAL['brass'], 8, r2=0.32, cap=True)
    rod(op, tb + td * 6.0, tb + td * 6.8, 0.48, PAL['iron'], 8, cap=True)
    sphere(op, (DC.x, DC.y, dz0 + DR * 0.95 + 0.25), 0.35, PAL['gilt'], 6, 3)
    # chart office wing with tall windows + a hipped roof
    box2(op, 2.8, -4.6, P, 8.6, 5.6, P + 5.0, PAL['wall_white'], PT['render'])
    hip_roof(op, 2.8, -4.6, 8.6, 5.6, P + 5.0, 2.6, PAL['roof_red'], PT['tiles'], ov=0.4)
    for x in (4.4, 7.0):
        window(K, (x, -4.6, P + 2.6), (0, -1, 0), 1.4, 2.8, frame=PAL['trim'], shutters=PAL['door_blue'])
    window(K, (8.6, 0.5, P + 2.6), (1, 0, 0), 1.4, 2.8, frame=PAL['trim'], shutters=PAL['door_blue'])
    door(K, (DC.x + 0.0, DC.y - DR, P), (0, -1, 0), 1.6, 2.6, col=PAL['door_blue'])
    # armillary sphere on a pedestal at the front corner
    ac = Vector((5.4, -6.0, P))
    cyl(op, ac, 0.55, 0.45, P, P + 1.8, PAL['stone_light'], 0, 8)
    sc = ac + Vector((0, 0, P + 1.8 + 1.15 - P))
    for (ax, tilt) in (((1, 0, 0), 0.0), ((0, 1, 0), 0.0), ((1, 0, 0), 0.41)):
        pts = []
        for k in range(14):
            a = 2 * math.pi * k / 14
            v = Vector((math.cos(a), 0, math.sin(a))) if ax == (0, 1, 0) else Vector((0, math.cos(a), math.sin(a)))
            if tilt:
                v = Vector((math.cos(a), math.sin(a) * math.cos(1.2), math.sin(a) * math.sin(1.2)))
            pts.append(sc + v * 1.05)
        for p, q in zip(pts, pts[1:] + pts[:1]):
            beam(op, p, q, 0.1, 0.1, PAL['brass'])
    rod(op, sc - Vector((0.4, 0.0, 1.2)), sc + Vector((0.4, 0.0, 1.2)), 0.05, PAL['iron'], 4)
    sphere(op, tuple(sc), 0.22, PAL['gold'], 6, 3)
    K.emit(root, 'chartroom_body', coll)
    return root, dict(anchors=dict(entrance=[DC.x, 0.0, round(-(DC.y - DR), 2)], telescope_tip=[round((tb + td * 6.8).x, 2),
                                   round((tb + td * 6.8).z, 2), round(-(tb + td * 6.8).y, 2)]))


# =================================================================== STORM STATION  14 x 14  (signal mast, weather board)
def build_stormstation(coll=None):
    """The storm-signal STATION: the one home of the DEWS signal. Its own signal mast at the front-left corner (clear of
    the Harbourmaster's tower from the heart camera) carries a yard across the view; readings/storm-cones.ts hoists one
    shape per DEWS step on the left yardarm's halyard (anchor signal: slot centres top -> down, the masthead for the
    Danger pennant). The office keeps the watch: the anemometer, the weather board chalked with the band (anchor
    weather_board) and the signal locker (rope and crates; the shapes themselves are all on the mast)."""
    root = empty('stormstation', coll=coll)
    K = Kit(44)
    op = K.op
    P = 0.5
    box2(op, -7.0, -7.0, -1.5, 7.0, 7.0, P, PAL['granite'], PT['ashlar'], skip=('+z',))
    poly(op, ((-7, -7, P), (7, -7, P), (7, 7, P), (-7, 7, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    # the office
    HX0, HX1, HY0, HY1 = -6.2, 1.4, 0.6, 6.4
    box2(op, HX0, HY0, P, HX1, HY1, P + 3.8, PAL['wall_white'], PT['render'])
    hip_roof(op, HX0, HY0, HX1, HY1, P + 3.8, 2.2, PAL['roof_red'], PT['tiles'], ov=0.35)
    box2(op, -0.4, 3.4, P + 4.6, 0.4, 4.2, P + 6.6, PAL['brick'], PT['ashlar'])
    for x in (-4.6, -0.6):
        window(K, (x, HY0, P + 2.0), (0, -1, 0), 1.1, 1.3, shutters=PAL['flag_red'])
    door(K, (-2.6, HY0, P), (0, -1, 0), 1.2, 2.4, col=PAL['flag_red'])
    window(K, (HX1, 3.5, P + 2.0), (1, 0, 0), 1.1, 1.3, shutters=PAL['flag_red'])
    # anemometer + wind vane on the roof
    ax, ay, az = -4.2, 3.5, P + 5.8
    cyl(op, (ax, ay), 0.06, 0.05, P + 4.8, az + 1.6, PAL['iron'], PT['metal'], 5)
    for k in range(3):
        a = 2 * math.pi * k / 3
        p = Vector((ax + 0.75 * math.cos(a), ay + 0.75 * math.sin(a), az + 1.6))
        beam(op, (ax, ay, az + 1.6), p, 0.05, 0.05, PAL['iron'])
        sphere(op, tuple(p), 0.2, PAL['brass'], 6, 3)
    # the weather board in front of the office, under a little roof: the runtime chalks the DEWS band on it
    WB_X, WB_Y, WB_Z, WB_W, WB_H = -2.0, -3.0, P + 2.9, 7.2, 2.7
    for s in (-1, 1):
        box2(op, WB_X + s * (WB_W / 2 - 0.1) - 0.14, WB_Y - 0.14, P, WB_X + s * (WB_W / 2 - 0.1) + 0.14, WB_Y + 0.14, WB_Z + WB_H / 2 + 0.6,
             PAL['oak'], 0)
    box2(op, WB_X - WB_W / 2 - 0.18, WB_Y + 0.0, WB_Z - WB_H / 2 - 0.18, WB_X + WB_W / 2 + 0.18, WB_Y + 0.16, WB_Z + WB_H / 2 + 0.18, PAL['timber_dark'], 0)
    box2(op, WB_X - WB_W / 2 - 0.35, WB_Y - 0.35, WB_Z + WB_H / 2 + 0.18, WB_X + WB_W / 2 + 0.35, WB_Y + 0.4, WB_Z + WB_H / 2 + 0.45, PAL['roof_red'], 0)
    # the signal locker: rope coils and crates (every shape is on the mast: no spare cones to read as a second signal)
    box2(op, 2.2, 0.8, P, 6.6, 6.2, P + 0.5, PAL['timber'], PT['boards'])
    for (cx, cy, cs) in ((3.4, 2.0, 0.9), (5.3, 2.3, 0.8), (3.6, 4.6, 0.75), (5.4, 5.0, 0.95)):
        box2(op, cx - cs / 2, cy - cs / 2, P + 0.5, cx + cs / 2, cy + cs / 2, P + 0.5 + cs, PAL['timber_fresh'], PT['boards'])
    for (cx, cy) in ((4.4, 3.4), (2.9, 5.6)):
        cyl(op, (cx, cy), 0.55, 0.55, P + 0.5, P + 0.8, PAL['rope'], 0, 10, top=True)
    for y in (0.9, 6.1):
        beam(op, (2.3, y, P + 0.5), (2.3, y, P + 3.1), 0.16, 0.16, PAL['oak'])
        beam(op, (6.5, y, P + 0.5), (6.5, y, P + 3.1), 0.16, 0.16, PAL['oak'])
    box2(op, 2.0, 0.6, P + 3.1, 6.8, 6.4, P + 3.35, PAL['roof_red'], 0)
    # lamps: the door and the weather board
    box2(K.em, -2.6 - 0.25, HY0 - 0.6, P + 2.8, -2.6 + 0.25, HY0 - 0.1, P + 3.4, PAL['iron'], 0)
    box2(K.em, WB_X - 0.25, WB_Y - 0.75, WB_Z + WB_H / 2 + 0.5, WB_X + 0.25, WB_Y - 0.25, WB_Z + WB_H / 2 + 0.9, PAL['iron'], 0)
    # the signal mast: granite foot, white pole, a black yard across the heart view (camera right = (1, 1)), stays
    MX, MY, MH, YZ = -5.6, -5.6, P + 29.0, P + 23.5
    box2(op, MX - 0.9, MY - 0.9, P, MX + 0.9, MY + 0.9, P + 0.8, PAL['granite_light'], PT['ashlar'])
    cyl(op, (MX, MY), 0.34, 0.14, P + 0.8, MH, PAL['wall_white'], 0, 8)
    sphere(op, (MX, MY, MH + 0.15), 0.28, PAL['gilt'], 6, 3)
    ux, uy = 1 / math.sqrt(2), 1 / math.sqrt(2)
    YA = 3.0
    beam(op, (MX - ux * YA, MY - uy * YA, YZ), (MX + ux * YA, MY + uy * YA, YZ), 0.22, 0.22, PAL['tar'])
    for s_ in (-1, 1):                                                   # yard lifts and the shrouds to the foot block
        beam(op, (MX, MY, YZ + 3.2), (MX + s_ * ux * YA, MY + s_ * uy * YA, YZ), 0.035, 0.035, PAL['tar'])
    for (dx, dy) in ((1.0, -1.0), (-1.0, 1.0), (-1.0, -1.0)):
        beam(op, (MX, MY, YZ - 0.3), (MX + dx * 0.85, MY + dy * 0.85, P + 0.8), 0.03, 0.03, PAL['tar'])
    HX, HY = MX - ux * (YA - 0.25), MY - uy * (YA - 0.25)                # the signal halyard at the left yardarm
    beam(op, (HX, HY, YZ), (HX, HY, P + 0.9), 0.03, 0.03, PAL['tar'])
    box2(op, HX - 0.3, HY - 0.3, P, HX + 0.3, HY + 0.3, P + 0.9, PAL['granite_light'], PT['ashlar'])   # the cleat post
    K.emit(root, 'stormstation_body', coll)
    gl = lambda v: [round(v[0], 2), round(v[2], 2), round(-v[1], 2)]
    slots = [gl((HX, HY, YZ - 2.3 - k * 3.5)) for k in range(4)]
    return root, dict(anchors=dict(weather_board=dict(centre=gl((WB_X, WB_Y - 0.02, WB_Z)), normal=[0, 0, 1], size=[WB_W, WB_H]),
                                   signal=dict(slots=slots, foot=gl((HX, HY, P + 1.8)), masthead=gl((MX, MY, MH - 0.6)))))


# =================================================================== HARBOURMASTER  20 x 16  (tower office with a balcony)
def build_harbourmaster(coll=None):
    root = empty('harbourmaster', coll=coll)
    K = Kit(45)
    op = K.op
    P = 0.5
    box2(op, -10.0, -8.0, -1.5, 10.0, 8.0, P, PAL['granite'], PT['ashlar'], skip=('+z',))
    poly(op, ((-10, -8, P), (10, -8, P), (10, 8, P), (-10, 8, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    OX0, OX1, OY0, OY1, E = -9.0, 2.6, -5.0, 6.0, P + 7.6
    box2(op, OX0, OY0, P, OX1, OY1, E, PAL['wall_ochre'], PT['render'])
    box2(op, OX0 - 0.15, OY0 - 0.15, P, OX1 + 0.15, OY1 + 0.15, P + 0.8, PAL['granite_light'], PT['ashlar'])
    box2(op, OX0 - 0.3, OY0 - 0.3, E - 0.1, OX1 + 0.3, OY1 + 0.3, E + 0.35, PAL['trim'], 0)
    hip_roof(op, OX0, OY0, OX1, OY1, E + 0.35, 3.4, PAL['roof_red'], PT['tiles'], ov=0.45)
    for x in (-7.2, -4.4, -0.2):
        window(K, (x, OY0, P + 5.4), (0, -1, 0), 1.1, 1.8, shutters=PAL['door_green'])
    for x in (-7.2, -0.2):
        window(K, (x, OY0, P + 2.2), (0, -1, 0), 1.1, 1.8, shutters=PAL['door_green'])
    door(K, (-4.0, OY0, P), (0, -1, 0), 1.6, 2.9, col=PAL['door_green'], lamp=True)
    # bay window on the front
    box2(op, -5.4, OY0 - 1.0, P + 3.9, -2.6, OY0, P + 7.0, PAL['trim'], PT['boards'])
    window(K, (-4.0, OY0 - 1.0, P + 5.4), (0, -1, 0), 2.0, 1.8, frame=PAL['trim'], sill=False)
    # the tower: stone shaft, balcony gallery, glazed lookout, pyramid roof, flagstaff
    TX0, TX1, TY0, TY1 = 2.6, 8.6, -3.0, 3.0
    tz1 = P + 15.0
    box2(op, TX0, TY0, P, TX1, TY1, tz1, PAL['stone'], PT['ashlar'])
    for s in (-1, 1):
        for t_ in (-1, 1):
            x = TX1 if s > 0 else TX0
            y = TY1 if t_ > 0 else TY0
            box2(op, x - 0.35, y - 0.35, P, x + 0.35, y + 0.35, tz1, PAL['stone_light'], PT['ashlar'])   # quoins
    for z in (P + 4.0, P + 8.0, P + 11.6):
        window(K, ((TX0 + TX1) / 2, TY0, z), (0, -1, 0), 1.0, 1.9, arch=True, frame=PAL['stone_light'])
    window(K, (TX1, 0.0, P + 9.0), (1, 0, 0), 1.0, 1.9, arch=True, frame=PAL['stone_light'])
    door(K, ((TX0 + TX1) / 2, TY0, P), (0, -1, 0), 1.4, 2.6, col=PAL['door_green'])
    # balcony: projecting slab on corbels + iron railing all round
    bo = 1.3
    box2(op, TX0 - bo, TY0 - bo, tz1, TX1 + bo, TY1 + bo, tz1 + 0.45, PAL['stone_light'], 0)
    for k in range(5):
        x = TX0 + (TX1 - TX0) * k / 4
        beam(op, (x, TY0, tz1 - 1.2), (x, TY0 - bo + 0.2, tz1), 0.3, 0.3, PAL['stone_light'])
    rail(op, [(TX0 - bo + 0.1, TY0 - bo + 0.1, tz1 + 0.45), (TX1 + bo - 0.1, TY0 - bo + 0.1, tz1 + 0.45), (TX1 + bo - 0.1, TY1 + bo - 0.1, tz1 + 0.45),
              (TX0 - bo + 0.1, TY1 + bo - 0.1, tz1 + 0.45), (TX0 - bo + 0.1, TY0 - bo + 0.1, tz1 + 0.45)], 1.1, PAL['iron'], 0.9)
    lz0, lz1 = tz1 + 0.45, tz1 + 3.6
    box2(op, TX0 + 0.3, TY0 + 0.3, lz0, TX1 - 0.3, TY1 - 0.3, lz0 + 0.8, PAL['trim'], PT['boards'])
    for (c_, n_) in ((((TX0 + TX1) / 2, TY0 + 0.3), (0, -1, 0)), (((TX0 + TX1) / 2, TY1 - 0.3), (0, 1, 0)), ((TX0 + 0.3, 0.0), (-1, 0, 0)),
                     ((TX1 - 0.3, 0.0), (1, 0, 0))):
        windows_along(K, (c_[0] - 2.0 * abs(n_[1]), c_[1] - 2.0 * abs(n_[0]), 0), (c_[0] + 2.0 * abs(n_[1]), c_[1] + 2.0 * abs(n_[0]), 0),
                      lz0 + 1.85, n_, 3, 1.05, 1.9, sill=False, lit=0.95, warm=0.2, frame=PAL['trim'])
    for (x, y) in ((TX0 + 0.3, TY0 + 0.3), (TX1 - 0.3, TY0 + 0.3), (TX1 - 0.3, TY1 - 0.3), (TX0 + 0.3, TY1 - 0.3)):
        box2(op, x - 0.2, y - 0.2, lz0, x + 0.2, y + 0.2, lz1, PAL['trim'], 0)
    box2(op, TX0 + 0.05, TY0 + 0.05, lz1, TX1 - 0.05, TY1 - 0.05, lz1 + 0.35, PAL['trim'], 0)
    pyramid_roof(op, (TX0 + TX1) / 2, (TY0 + TY1) / 2, (TX1 - TX0) / 2, lz1 + 0.35, 3.0, PAL['copper'], 0, ov=0.5)
    fx, fy = (TX0 + TX1) / 2, (TY0 + TY1) / 2
    # the movers hoist: a signal yard across the tower (front to back, so both hoists read side by side from the camera);
    # the runtime flies the day's top gaining harbour's crest (green hoist stripe) at the front yardarm and the top losing
    # harbour's (red stripe) at the back one (anchors mover_up / mover_down). No cones here: the storm station owns them.
    cyl(op, (fx, fy), 0.16, 0.08, lz1 + 3.0, lz1 + 11.0, PAL['trim'], 0, 6)
    sphere(op, (fx, fy, lz1 + 11.1), 0.2, PAL['gilt'], 6, 3)
    YDZ, YA = lz1 + 8.4, 4.6
    beam(op, (fx, fy - YA - 0.2, YDZ), (fx, fy + YA + 0.2, YDZ), 0.14, 0.14, PAL['trim'])
    movers = {}
    for key, s_ in (('mover_up', -1), ('mover_down', 1)):
        hy = fy + s_ * YA
        beam(op, (fx, fy, lz1 + 10.6), (fx, hy, YDZ), 0.035, 0.035, PAL['tar'])                          # yard lift
        beam(op, (fx, hy, YDZ), (fx, hy, YDZ - 6.2), 0.03, 0.03, PAL['tar'])                               # halyard
        movers[key] = [round(fx, 2), round(YDZ - 0.25, 2), round(-hy, 2)]
    # telescope on the balcony
    rod(op, (TX0 - 0.5, TY0 - 0.6, tz1 + 1.4), (TX0 + 0.9, TY0 - 1.3, tz1 + 1.9), 0.14, PAL['brass'], 6, cap=True)
    beam(op, (TX0 - 0.1, TY0 - 0.9, tz1 + 0.45), (TX0 + 0.1, TY0 - 0.95, tz1 + 1.55), 0.06, 0.06, PAL['iron'])
    # notice board (the movers) by the door
    box2(op, -8.6, OY0 - 0.6, P, -8.4, OY0 - 0.4, P + 2.6, PAL['oak'], 0)
    box2(op, -8.0, OY0 - 0.6, P, -7.8, OY0 - 0.4, P + 2.6, PAL['oak'], 0)
    box2(op, -9.1, OY0 - 0.7, P + 1.2, -7.3, OY0 - 0.5, P + 2.7, PAL['door_green'], PT['boards'])
    for k in range(4):
        box2(op, -8.9 + (k % 2) * 0.8, OY0 - 0.74, P + 1.35 + (k // 2) * 0.65, -8.3 + (k % 2) * 0.8, OY0 - 0.7, P + 1.85 + (k // 2) * 0.65,
             PAL['canvas'], 0)
    K.emit(root, 'harbourmaster_body', coll)
    return root, dict(anchors=dict(balcony=[fx, round(tz1 + 0.45, 2), round(-fy, 2)], entrance=[-4.0, P, 5.0],
                                   mover_up=dict(hoist=movers['mover_up'], size=[3.6, 2.4]), mover_down=dict(hoist=movers['mover_down'], size=[3.6, 2.4])))


# =================================================================== KEEPER'S LOG  12 x 10  (octagonal watch house)
def build_keeperslog(coll=None):
    root = empty('keeperslog', coll=coll)
    K = Kit(46)
    op = K.op
    P = 0.4
    box2(op, -6.0, -5.0, -1.5, 6.0, 5.0, P, PAL['granite'], PT['ashlar'], skip=('+z',))
    poly(op, ((-6, -5, P), (6, -5, P), (6, 5, P), (-6, 5, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    C_, R_ = Vector((0.4, 0.6, 0)), 3.1
    cyl(op, C_, R_ + 0.25, R_ + 0.25, P, P + 0.7, PAL['granite_light'], PT['ashlar'], 8, rot=math.pi / 8)
    cyl(op, C_, R_, R_, P + 0.7, P + 3.9, PAL['stone'], PT['ashlar'], 8, top=False, rot=math.pi / 8)
    cyl(op, C_, R_ + 0.3, R_ + 0.3, P + 3.9, P + 4.3, PAL['trim'], 0, 8, rot=math.pi / 8)
    for k in range(8):
        a = 2 * math.pi * k / 8
        n_ = Vector((math.cos(a), math.sin(a), 0))
        if abs(a - 3 * math.pi / 2) < 0.1 or abs(a + math.pi / 2) < 0.1:
            door(K, tuple(C_ + n_ * R_ * math.cos(math.pi / 8) + Vector((0, 0, P + 0.7))), tuple(n_), 1.1, 2.3, col=PAL['door_blue'], lamp=True)
            continue
        window(K, tuple(C_ + n_ * R_ * math.cos(math.pi / 8) + Vector((0, 0, P + 2.4))), tuple(n_), 0.8, 1.3, lit=0.9, warm=0.15,
               frame=PAL['trim'])
    pyramid_roof(op, C_.x, C_.y, R_ * math.cos(math.pi / 8), P + 4.3, 3.0, PAL['slate'], PT['slate'], ov=0.35, segs=8, rot=math.pi / 8 + math.pi / 8)
    # lantern finial + an hourglass vane (freshness)
    cyl(op, C_, 0.32, 0.32, P + 7.0, P + 7.3, PAL['iron'], PT['metal'], 6)
    cyl(K.em, C_, 0.26, 0.26, P + 7.3, P + 7.9, PAL['brass'], 0, 6)
    cyl(op, C_, 0.36, 0.0, P + 7.9, P + 8.4, PAL['iron'], PT['metal'], 6)
    cyl(op, C_, 0.04, 0.04, P + 8.4, P + 9.4, PAL['iron'], PT['metal'], 4)
    hz = P + 9.6
    lathe(op, (C_.x + 0.0, C_.y), [(0.32, hz - 0.35), (0.03, hz), (0.32, hz + 0.35)], PAL['gilt'], PT['metal'], 6, smooth=False)
    box2(op, C_.x - 0.4, C_.y - 0.4, hz + 0.35, C_.x + 0.4, C_.y + 0.4, hz + 0.42, PAL['gilt'], 0)
    box2(op, C_.x - 0.4, C_.y - 0.4, hz - 0.42, C_.x + 0.4, C_.y + 0.4, hz - 0.35, PAL['gilt'], 0)
    vane = empty('vane', (C_.x, C_.y, hz), parent=root, coll=coll)
    vane['anim'] = 'hourglass vane: turns (about local +Y) once per data refresh'
    # chimney, bench, lectern with the open log
    box2(op, C_.x + 1.0, C_.y + 1.0, P + 4.5, C_.x + 1.7, C_.y + 1.7, P + 7.2, PAL['brick'], PT['ashlar'])
    box2(op, -5.2, -4.2, P, -2.6, -3.6, P + 0.5, PAL['oak'], PT['planks_x'])
    lx, ly = 4.2, -2.8
    box2(op, lx - 0.15, ly - 0.15, P, lx + 0.15, ly + 0.15, P + 1.1, PAL['oak'], 0)
    poly(op, ((lx - 0.55, ly - 0.35, P + 1.1), (lx + 0.55, ly - 0.35, P + 1.1), (lx + 0.55, ly + 0.25, P + 1.35), (lx - 0.55, ly + 0.25, P + 1.35)),
         PAL['cream'], 0, nrm=(0, -1, 1))
    for (x, y) in ((-5.6, 4.6), (5.6, 4.6), (5.6, -4.6)):   # low wall posts
        box2(op, x - 0.25, y - 0.25, P, x + 0.25, y + 0.25, P + 1.0, PAL['granite_light'], 0)
    beam(op, (-5.6, 4.6, P + 0.6), (5.6, 4.6, P + 0.6), 0.45, 0.45, PAL['granite_light'])
    beam(op, (5.6, 4.6, P + 0.6), (5.6, -4.6, P + 0.6), 0.45, 0.45, PAL['granite_light'])
    K.emit(root, 'keeperslog_body', coll)
    return root, dict(anchors=dict(entrance=[C_.x, P, round(-(C_.y - R_), 2)], lantern=[C_.x, round(P + 7.6, 2), round(-C_.y, 2)]))


# =================================================================== HARBOUR OFFICE  20 x 16, one builder, 8 chain accents
OFFICE = {
    # wall, wall pattern, roof kind, roof colour, roof pattern, eave, rise, trim, base
    'ethereum': dict(wall='cream', wp='render', roof='pediment', rc='roof_ochre', rp='tiles', E=8.6, rise=4.2, trim='stone_light', arcade=True),
    'tron': dict(wall='brick', wp='ashlar', roof='step', rc='slate', rp='slate', E=9.4, rise=7.6, trim='stone_light', hoist=True),
    'bsc': dict(wall='wall_mustard', wp='ashlar', roof='bell', rc='roof_red', rp='tiles', E=8.8, rise=6.4, trim='trim'),
    'solana': dict(wall='hull_black', wp='boards', roof='steep', rc='slate', rp='slate', E=7.8, rise=8.6, trim='trim', bargeboard=True),
    'hyperliquid-l1': dict(wall='stone_light', wp='ashlar', roof='mansard', rc='slate', rp='slate', E=8.0, rise=5.0, trim='trim'),
    'base': dict(wall='wall_white', wp='boards', roof='gambrel', rc='slate', rp='slate', E=6.8, rise=6.8, trim='trim'),
    'arbitrum': dict(wall='granite_light', wp='ashlar', roof='hipcross', rc='slate', rp='slate', E=8.6, rise=4.6, trim='stone_light', cupola=True),
    'polygon': dict(wall='wall_white', wp='render', roof='tudor', rc='roof_red', rp='tiles', E=8.4, rise=7.6, trim='timber_dark', jetty=True),
}


def build_stoa_office(chain, coll=None):
    """Classical harbour office (PLAN §4.2 common base, concept A): a Doric stoa on a stepped stylobate with the crest on
    a red-framed attic under a small blue pediment, a low tiled gable with pedimented ends, two velaria (the chain colour)
    split round the steps on their own poles, bronze tripod lamps and a flag mast on a bronze-shod base."""
    root = empty(f'harbour-office:{chain}', coll=coll)
    K = Kit(60 + list(OFFICE).index(chain))
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


STOA_OFFICES = ('ethereum',)      # P2 pilot: the stoa; the other offices keep their P6 builders until P3


def build_office(chain, coll=None):
    if chain in STOA_OFFICES:
        return build_stoa_office(chain, coll)
    S = OFFICE[chain]
    root = empty(f'harbour-office:{chain}', coll=coll)
    K = Kit(60 + list(OFFICE).index(chain))
    op = K.op
    acc = lin(CHAINS[chain])
    wall, wp, trim = PAL[S['wall']], PT[S['wp']], PAL[S['trim']]
    rc, rp = PAL[S['rc']], PT[S['rp']]
    P = 0.5
    X0, X1, Y0, Y1, E, R = -7.8, 7.8, -4.6, 6.8, P + S['E'], S['rise']
    box2(op, -10.0, -8.0, -1.5, 10.0, 8.0, P, PAL['granite'], PT['ashlar'], skip=('+z',))
    poly(op, ((-10, -8, P), (10, -8, P), (10, 8, P), (-10, 8, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    kind = S['roof']
    jet = 0.8 if S.get('jetty') else 0.0
    # body (jettied upper floor for the Tudor house)
    if jet:
        box2(op, X0, Y0, P, X1, Y1, P + 3.8, wall, wp)
        box2(op, X0 - jet, Y0 - jet, P + 3.8, X1 + jet, Y1, E, wall, wp)
        for k in range(9):   # half-timbering: posts, rails, braces
            x = X0 - jet + (X1 - X0 + 2 * jet) * k / 8
            obox(op, (x, Y0 - jet - 0.06, (P + 3.8 + E) / 2), (1, 0, 0), (0, 1, 0), 0.28, 0.14, E - P - 3.8, PAL['timber_dark'])
        for z in (P + 3.8, (P + 3.8 + E) / 2, E - 0.15):
            obox(op, (0, Y0 - jet - 0.07, z), (1, 0, 0), (0, 1, 0), X1 - X0 + 2 * jet, 0.14, 0.26, PAL['timber_dark'])
        for k in (0, 3, 5, 8):
            x = X0 - jet + (X1 - X0 + 2 * jet) * k / 8
            x2 = x + (X1 - X0 + 2 * jet) / 8 * (1 if k < 4 else -1)
            beam(op, (x, Y0 - jet - 0.08, P + 3.9), (x2, Y0 - jet - 0.08, (P + 3.8 + E) / 2), 0.2, 0.12, PAL['timber_dark'], up=Vector((0, -1, 0)))
        for k in range(8):
            x = X0 + (X1 - X0) * (k + 0.5) / 8
            beam(op, (x, Y0, P + 3.2), (x, Y0 - jet, P + 3.8), 0.2, 0.2, PAL['timber_dark'])
    else:
        box2(op, X0, Y0, P, X1, Y1, E, wall, wp)
    box2(op, X0 - 0.15, Y0 - 0.15, P, X1 + 0.15, Y1 + 0.15, P + 0.7, PAL['granite_light'], PT['ashlar'])
    fy = Y0 - jet     # front plane of the upper floor
    # ground floor: arcade or big doors + windows, accent doors
    if S.get('arcade'):
        box2(op, X0, Y0 - 2.2, P, X1, Y0, P + 0.25, PAL['stone_light'], PT['ashlar'])
        arcade(op, X0, X1, Y0 - 2.2, 0.6, P + 0.25, P + 4.6, 3, 1.0, P + 2.6, PAL['cream'], PT['render'], keystone=trim)
        poly(op, ((X0, Y0 - 2.2, P + 4.6), (X1, Y0 - 2.2, P + 4.6), (X1, Y0, P + 4.6), (X0, Y0, P + 4.6)), PAL['roof_ochre'], PT['tiles'], nrm=(0, 0, 1))
        box2(op, X0 - 0.1, Y0 - 2.4, P + 4.6, X1 + 0.1, Y0 - 1.6, P + 5.3, PAL['stone_light'], 0)   # loggia balustrade top
        for x in (-4.8, 0.0, 4.8):
            door(K, (x, Y0, P + 0.25), (0, -1, 0), 1.8, 2.8, col=acc, frame=trim, step=False)
    else:
        door(K, (0.0, Y0, P), (0, -1, 0), 3.0, 3.6, col=acc, frame=trim)
        for x in (-5.2, 5.2):
            window(K, (x, Y0, P + 2.3), (0, -1, 0), 1.4, 2.0, frame=trim, shutters=acc if S['wp'] != 'boards' else None)
    # upper floor windows (front) + side windows
    for x in (-5.2, 5.2):
        window(K, (x, fy, P + 6.0), (0, -1, 0), 1.3, 2.0, frame=trim, shutters=acc if kind in ('steep', 'gambrel', 'tudor', 'pediment') else None,
               arch=kind in ('bell', 'hipcross'))
    for y in (-1.6, 3.6):
        for s in (-1, 1):
            window(K, (s * X1, y, P + 2.3), (s, 0, 0), 1.2, 1.9, frame=trim)
            window(K, (s * (X1 + jet), y, P + 6.0), (s, 0, 0), 1.2, 1.9, frame=trim)
    window(K, (0.0, fy, P + 6.0), (0, -1, 0), 2.2, 2.2, frame=trim, arch=True)
    # roofs + front gables; each returns the crest centre + size
    cz, cs = E + R * 0.38, min(3.6, R * 0.62)
    if kind in ('steep', 'tudor', 'pediment', 'step', 'bell'):
        ov = 0.0 if kind in ('step', 'bell') else (0.7 if kind != 'pediment' else 0.5)
        gable_roof(op, X0 - jet, fy, X1 + jet, Y1, E, R, rc, rp, ov=ov, axis='y', ends=kind not in ('step', 'bell'), end_col=wall, end_pat=wp)
    if kind == 'pediment':
        box2(op, X0 - 0.45, fy - 0.5, E - 0.3, X1 + 0.45, Y1 + 0.3, E + 0.1, trim, 0)
        for (xa, xb) in ((X0 - 0.6, 0.0), (0.0, X1 + 0.6)):
            za, zb = (E, E + R) if xa < 0 else (E + R, E)
            beam(op, (xa, fy - 0.45, za + 0.1), (xb, fy - 0.45, zb + 0.1), 0.5, 0.45, trim)
        cz, cs = E + R * 0.36, 2.6
        box2(op, -1.2, Y1 - 3.0, E + R - 1.0, 1.2, Y1 - 1.0, E + R + 2.6, PAL['cream'], PT['render'])   # little belvedere chimney
        hip_roof(op, -1.2, Y1 - 3.0, 1.2, Y1 - 1.0, E + R + 2.6, 0.9, rc, rp, ov=0.25)
    elif kind == 'step':
        for (y, ny) in ((fy, -1), (Y1, 1)):
            n = 6
            for k in range(n):
                hw = (X1 - X0) / 2 * (1 - k / n) + 0.0
                z0_ = E + R * k / n
                box2(op, -hw - 0.15, y - 0.45 if ny < 0 else y - 0.2, z0_, hw + 0.15, y + 0.2 if ny < 0 else y + 0.45, z0_ + R / n, wall, wp)
                box2(op, -hw - 0.3, y - 0.55 if ny < 0 else y - 0.25, z0_ + R / n, -hw + 0.6, y + 0.25 if ny < 0 else y + 0.55, z0_ + R / n + 0.2, trim, 0)
                box2(op, hw - 0.6, y - 0.55 if ny < 0 else y - 0.25, z0_ + R / n, hw + 0.3, y + 0.25 if ny < 0 else y + 0.55, z0_ + R / n + 0.2, trim, 0)
        # loading doors stacked under a hoist beam
        box2(op, -1.0, fy - 0.5, E + R * 0.68, 1.0, fy - 0.45, E + R * 0.68 + 1.9, acc, PT['boards'])
        beam(op, (0, fy, E + R * 0.68 + 2.3), (0, fy - 2.2, E + R * 0.68 + 2.3), 0.35, 0.35, PAL['timber_dark'])
        box2(op, -0.1, fy - 2.1, E + R * 0.68, 0.1, fy - 1.9, E + R * 0.68 + 2.2, PAL['tar'], 0)
        cz, cs = E + R * 0.33, 2.7
    elif kind == 'bell':
        hw, nw, nz = (X1 - X0) / 2 + 0.2, 2.8, E + R * 0.62
        pts = [(-hw, E)]
        for k in range(1, 7):
            a = math.pi / 2 * k / 6
            pts.append((-hw + (hw - nw) * math.sin(a), E + (nz - E) * (1 - math.cos(a))))
        pts.append((-nw, E + R * 0.84))
        for k in range(1, 8):
            a = math.pi * k / 8
            pts.append((-nw * math.cos(a), E + R * 0.84 + 1.5 * math.sin(a)))
        pts.append((nw, E + R * 0.84))
        for k in range(6, -1, -1):
            a = math.pi / 2 * k / 6
            pts.append((hw - (hw - nw) * math.sin(a), E + (nz - E) * (1 - math.cos(a))))
        for (y, ny) in ((fy - 0.25, -1), (Y1 + 0.25, 1)):
            wall_poly(op, y, pts, wall, wp, ny, centre=(0.0, E + 1.0))
        for a, b in zip(pts[:-1], pts[1:]):   # white coping along the outline
            beam(op, (a[0], fy - 0.35, a[1] + 0.1), (b[0], fy - 0.35, b[1] + 0.1), 0.35, 0.3, trim, up=Vector((0, -1, 0)))
        for s in (-1, 1):
            disc(op, (s * (nw + 0.5), fy - 0.3, nz - 0.4), (0, -1, 0), 0.55, 0.2, trim, 10)
        cz, cs = E + R * 0.44, 3.4
    elif kind == 'steep':
        for s in (-1, 1):    # crossed bargeboards with carved ends at the apex
            beam(op, (s * (X1 + 0.9), fy - 0.75, E - 0.7), (-s * 1.2, fy - 0.75, E + R + 1.0), 0.45, 0.28, trim, up=Vector((0, -1, 0)))
        cz, cs = E + R * 0.33, 3.4
    elif kind == 'tudor':
        for s in (-1, 1):
            beam(op, (s * (X1 + jet + 0.8), fy - 0.7, E - 0.6), (0, fy - 0.7, E + R + 0.2), 0.4, 0.3, PAL['timber_dark'], up=Vector((0, -1, 0)))
        for k in (-1, 0, 1):
            x = k * 2.8
            zt = E + R * (1 - abs(x) / (X1 + jet))
            obox(op, (x, fy - 0.08, (E + zt) / 2), (1, 0, 0), (0, 1, 0), 0.26, 0.14, zt - E, PAL['timber_dark'])
        cz, cs = E + 2.3, 2.6
    elif kind == 'mansard':
        prof = [(Y0 - 0.4, E), (Y0 + 1.0, E + R * 0.82), (Y1 - 1.0, E + R * 0.82), (Y1 + 0.4, E)]
        extrude_roof(op, X0 - 0.4, X1 + 0.4, prof, rc, rp, end_col=rc, end_pat=rp)
        poly(op, ((X0 - 0.4, Y0 + 1.0, E + R * 0.82), (X1 + 0.4, Y0 + 1.0, E + R * 0.82), (X1 + 0.4, Y1 - 1.0, E + R * 0.82),
                  (X0 - 0.4, Y1 - 1.0, E + R * 0.82)), PAL['lead'], 0, nrm=(0, 0, 1))
        box2(op, X0 - 0.5, Y0 - 0.5, E - 0.25, X1 + 0.5, Y1 + 0.5, E + 0.15, trim, 0)
        # central pavilion carrying the crest + its pediment; dormers either side
        box2(op, -2.8, Y0 - 0.9, P, 2.8, Y0, E + R + 0.6, PAL['stone'], PT['ashlar'])
        pediment(op, -3.1, 3.1, Y0 - 1.2, Y0 + 1.5, E + R + 0.6, 1.6, trim, tymp=PAL['stone'])
        gable_roof(op, -3.1, Y0 - 1.2, 3.1, Y0 + 2.4, E + R + 0.6, 1.6, rc, rp, ov=0.0, axis='y', ends=False)
        for x in (-5.4, 5.4):
            box2(op, x - 0.9, Y0 + 0.2, E + 0.2, x + 0.9, Y0 + 1.6, E + 2.6, trim, 0)
            gable_roof(op, x - 0.9, Y0 + 0.2, x + 0.9, Y0 + 1.6, E + 2.6, 0.8, rc, rp, ov=0.2, axis='y', end_col=trim)
            window(K, (x, Y0 + 0.2, E + 1.4), (0, -1, 0), 0.8, 1.2, frame=trim, sill=False)
        fy = Y0 - 0.9
        cz, cs = E + R * 0.42, 2.8
    elif kind == 'gambrel':
        hw = (X1 - X0) / 2 + 0.6
        prof = [(-hw, E - 0.4), (-hw + 1.6, E + R * 0.6), (0.0, E + R), (hw - 1.6, E + R * 0.6), (hw, E - 0.4)]
        extrude_y(op, fy - 0.6, Y1 + 0.6, prof, rc, rp, ends=False)
        gp = [(X0, E), (X0 + 1.45, E + R * 0.6 - 0.15), (0.0, E + R - 0.25), (X1 - 1.45, E + R * 0.6 - 0.15), (X1, E)]
        for (y, ny) in ((fy, -1), (Y1, 1)):
            wall_poly(op, y, gp, wall, wp, ny, centre=(0.0, E + 1.0))
        for a, b in zip(gp[:-1], gp[1:]):
            beam(op, (a[0] * 1.06, fy - 0.62, a[1] + 0.05), (b[0] * 1.06, fy - 0.62, b[1] + 0.05), 0.3, 0.3, trim, up=Vector((0, -1, 0)))
        cz, cs = E + R * 0.4, 3.4
    elif kind == 'hipcross':
        hip_roof(op, X0, Y0 + 2.4, X1, Y1, E, R, rc, rp, ov=0.5)
        box2(op, -4.0, Y0, E - 0.2, 4.0, Y0 + 3.0, E, wall, wp)
        gable_roof(op, -4.0, Y0, 4.0, Y0 + 5.4, E, R + 0.6, rc, rp, ov=0.45, axis='y', ends=True, end_col=wall, end_pat=wp)
        box2(op, X0 - 0.3, Y0 - 0.3, E - 0.3, X1 + 0.3, Y0 + 2.4, E, trim, 0)
        cx_, cy_ = 0.0, 3.6
        box2(op, cx_ - 1.3, cy_ - 1.3, E + R - 0.6, cx_ + 1.3, cy_ + 1.3, E + R + 1.8, trim, PT['boards'])
        windows_along(K, (cx_ - 1.3, cy_ - 1.3, 0), (cx_ + 1.3, cy_ - 1.3, 0), E + R + 0.6, (0, -1, 0), 2, 0.7, 1.4, sill=False, lit=0.9, frame=trim)
        pyramid_roof(op, cx_, cy_, 1.3, E + R + 1.8, 1.6, PAL['copper'], 0, ov=0.25)
        cyl(op, (cx_, cy_), 0.05, 0.05, E + R + 3.4, E + R + 4.6, PAL['iron'], PT['metal'], 4)
        cz, cs = E + R * 0.42, 2.8
    # the crest on the front gable
    crest_panel(K, root, (0.0, fy - (0.5 if kind in ('step', 'bell') else (0.25 if kind != 'gambrel' else 0.05)), cz), cs,
                trim if kind not in ('tudor',) else PAL['timber_dark'], coll)
    # awning (hb_cover: runtime tints by the chain colour; COLOR_0 = shade with alternating stripes)
    if not S.get('arcade'):
        az, ad = P + 4.0, 2.3
        n = 10
        for k in range(n):
            xa = -6.8 + 13.6 * k / n; xb = -6.8 + 13.6 * (k + 1) / n
            sh = (1.0, 1.0, 1.0) if k % 2 == 0 else (0.78, 0.78, 0.78)
            poly(K.cover, ((xa, Y0, az + 0.6), (xb, Y0, az + 0.6), (xb, Y0 - ad, az - 0.2), (xa, Y0 - ad, az - 0.2)), sh, 0, nrm=(0, -1, 1), jitter=0.0)
            poly(K.cover, ((xa, Y0 - ad, az - 0.2), (xb, Y0 - ad, az - 0.2), ((xa + xb) / 2, Y0 - ad, az - 0.75)), mul(sh, 0.92), 0, nrm=(0, -1, 0), jitter=0.0)
        for x in (-6.8, 6.8):
            beam(op, (x, Y0, az + 0.6), (x, Y0 - ad, az - 0.2), 0.08, 0.08, PAL['iron'])
    else:
        n = 10
        for k in range(n):   # striped awnings over the loggia arches instead
            xa = X0 + (X1 - X0) * k / n; xb = X0 + (X1 - X0) * (k + 1) / n
            sh = (1.0, 1.0, 1.0) if k % 2 == 0 else (0.78, 0.78, 0.78)
            poly(K.cover, ((xa, Y0 - 2.4, P + 5.3), (xb, Y0 - 2.4, P + 5.3), (xb, Y0 - 3.8, P + 4.5), (xa, Y0 - 3.8, P + 4.5)), sh, 0, nrm=(0, -1, 1), jitter=0.0)
    # forecourt: bollards with chain-colour caps, crates, the flag pole on a granite foot
    for x in (-8.6, -3.0, 3.0):
        cyl(op, (x, -7.3), 0.3, 0.25, P, P + 0.9, PAL['iron'], PT['metal'], 7)
        cyl(op, (x, -7.3), 0.34, 0.2, P + 0.9, P + 1.15, acc, 0, 7)
    crate(op, (-8.6, -5.6, P), 1.0, PAL['timber'], 0.1); crate(op, (-8.5, -5.6, P + 1.0), 0.8, PAL['timber'], 0.4)
    barrel(op, (7.0, -6.0, P)); barrel(op, (7.9, -5.4, P))
    fx, fy_ = 8.9, -7.0
    box2(op, fx - 0.6, fy_ - 0.6, P, fx + 0.6, fy_ + 0.6, P + 0.8, PAL['granite_light'], PT['ashlar'])
    cyl(op, (fx, fy_), 0.14, 0.07, P + 0.8, P + 15.0, PAL['trim'], 0, 6)
    sphere(op, (fx, fy_, P + 15.1), 0.2, acc, 6, 3)
    flag_node(root, (fx, fy_, P + 14.8), coll, 'chain house flag (crest on the chain colour)')
    # accent beacon lamp on the gable corner
    box2(K.em, X1 + 0.1, Y0 - 0.5, P + 3.4, X1 + 0.6, Y0 - 0.0, P + 4.0, PAL['iron'], 0)
    made = K.emit(root, 'office_body', coll)
    made['cover'].name = 'awning'
    made['cover']['anim'] = 'awning: hb_cover, tinted by the chain colour (COLOR_0 = stripe shade)'
    return root, dict(chain=chain, accent=CHAINS[chain], roof=kind,
                      anchors=dict(crest_centre=[0.0, round(cz, 2), round(-fy + 0.3, 2)], crest_size_m=cs, flag_pole_top=[fx, round(P + 14.8, 2), -fy_]))
