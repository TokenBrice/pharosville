"""The Pharos of Alexandria (P6, D15/D16) - geometry. Style C crafted miniature: pale limestone and marble,
micro-bevelled mouldings, procedural pattern ids in COLOR_0 alpha, bronze and gilt accents.

Blender units = metres, Z up, origin = the platform centre at pavement level. FRONT (door, ramp) = Blender -Y
(= glTF +Z). The tower is ~104 m to the statue's raised hand.

    tier 1  square, tapering (half 15 -> 12.6), pilaster panels, rows of slit windows, a door up a ramp
    cornice 1 with a parapet and four corner tritons blowing conches (acroteria)
    tier 2  octagonal, corner pilasters, windows, cornice + parapet
    tier 3  cylindrical drum, gallery balustrade
    lantern an 8-column tholos with a bronze brazier (fire_core) and the rotating bronze mirror
    crown   dome + a gilded Helios with a raised arm (statue)
    base    a 64 m square platform on a battered podium, a parapet with corner piers (front gap for the
            causeway), two colossal pharaonic statues flanking the ramp

Node contract (names are load-bearing, see src/harbour/world/lighthouse-system.ts):
    pharos (root) / tower (hb_opaque) / tower_windows (hb_window) / statue (hb_opaque) / fire_core (hb_fire)
    fire_emitter, lantern, smoke_emitter, door (empties)
    mirror (empty; rotates about up; the beam is thrown along its glTF +Z = Blender -Y)
        mirror_disc (hb_mirror: the polished face)  mirror_frame (hb_opaque: yoke + back)
"""
import bpy, math, random
from mathutils import Vector
import hb_lib
from hb_lib import MB, box, box2, rod, lin, to_object, empty, descendants, tri_count, ensure_export_materials, material

HEX = {
    'lime': '#E8DEC8', 'lime_panel': '#DED2B8', 'lime_dark': '#C2B394', 'lime_podium': '#B3A385',
    'marble': '#F3EFE6', 'marble_warm': '#EFE6D3', 'paving': '#D4C8AE', 'paving_dark': '#BBAE92',
    'bronze': '#A06C34', 'bronze_dark': '#5B3C20', 'gilt': '#DDAA45', 'patina': '#6F9A88',
    'door': '#3A2B20', 'shadow': '#4B4134', 'ember': '#FF8A2A', 'mirror': '#E2B060',
    'granite_red': '#B0705A',
}
P = {k: lin(v) for k, v in HEX.items()}
PT = hb_lib.PATTERN
TAU = math.pi * 2

# ------------------------------------------------------------------ dimensions (metres)
PLAT = 32.0            # platform half-size (64 m square)
PODIUM = 9.0           # podium depth below the pavement
T1_Z0, T1_Z1 = 2.6, 48.6
T1_H0, T1_H1 = 15.0, 12.6
T2_Z0, T2_Z1 = 55.2, 74.4
T2_R0, T2_R1 = 9.8, 8.7     # octagon circumradius
T3_Z0, T3_Z1 = 77.4, 83.6
T3_R = 6.3
LAN_Z0, LAN_Z1 = 85.0, 91.6  # lantern floor .. column tops
LAN_R = 5.3                   # column ring radius
DOME_Z0, DOME_Z1 = 93.0, 96.6
FIRE_Z = 88.2                 # lantern / beam origin (fire height)
MIRROR_Z = 87.4
DOOR_Z = 5.6                  # threshold height


def h1(z):
    t = (z - T1_Z0) / (T1_Z1 - T1_Z0)
    return T1_H0 + (T1_H1 - T1_H0) * t


def r2(z):
    t = (z - T2_Z0) / (T2_Z1 - T2_Z0)
    return T2_R0 + (T2_R1 - T2_R0) * t


# ------------------------------------------------------------------ primitives on top of hb_lib.MB
def ngon_frustum(mb, n, z0, z1, r0, r1, col, pat=0, rot=0.0, top=True, bot=False, smooth=False, cx=0.0, cy=0.0):
    """n-gon frustum (circumradius r0 -> r1), flat sides."""
    A = [mb.vert((cx + r0 * math.cos(rot + TAU * k / n), cy + r0 * math.sin(rot + TAU * k / n), z0)) for k in range(n)]
    B = [mb.vert((cx + r1 * math.cos(rot + TAU * k / n), cy + r1 * math.sin(rot + TAU * k / n), z1)) for k in range(n)]
    for k in range(n):
        k2 = (k + 1) % n
        mb.face((A[k], A[k2], B[k2], B[k]), col, pat, smooth=smooth)
    if top:
        mb.face(B, col, pat)
    if bot:
        mb.face(A[::-1], col, pat)


def ngon_ring(mb, n, z0, z1, ro, ri, col, pat=0, rot=0.0):
    """Thick n-gon annulus (an entablature / parapet ring): outer wall, inner wall, top, bottom."""
    def ring(r, z):
        return [mb.vert((r * math.cos(rot + TAU * k / n), r * math.sin(rot + TAU * k / n), z)) for k in range(n)]
    Ao, Bo, Ai, Bi = ring(ro, z0), ring(ro, z1), ring(ri, z0), ring(ri, z1)
    for k in range(n):
        k2 = (k + 1) % n
        mb.face((Ao[k], Ao[k2], Bo[k2], Bo[k]), col, pat)
        mb.face((Ai[k2], Ai[k], Bi[k], Bi[k2]), col, pat)
        mb.face((Bo[k], Bo[k2], Bi[k2], Bi[k]), col, pat)
        mb.face((Ao[k2], Ao[k], Ai[k], Ai[k2]), col, pat)


def moulding(mb, n, z, steps, col, pat=10, rot=0.0):
    """Stacked n-gon slabs: steps = [(dz, r_bottom, r_top)] from z upward. A crafted profile with micro-bevels
    (each slab's sides are chamfered by its own r_bottom != r_top)."""
    for dz, ra, rb in steps:
        ngon_frustum(mb, n, z, z + dz, ra, rb, col, pat, rot=rot, top=True, bot=True)
        z += dz
    return z


def sq_moulding(mb, z, steps, col, pat=10):
    """Square mouldings: half-widths given as 'circumradius' of a 4-gon rotated 45 deg."""
    return moulding(mb, 4, z, [(dz, a * math.sqrt(2), b * math.sqrt(2)) for dz, a, b in steps], col, pat, rot=math.pi / 4)


def quad(mb, a, b, c, d, col, pat=0, uv=None):
    ids = [mb.vert(p) for p in (a, b, c, d)]
    mb.face(ids, col, pat, uv=uv)


# ------------------------------------------------------------------ the tower
def face_frame(k):
    """Tier-1 face k: outward normal d, tangent t (left -> right seen from outside). k=0 front (-Y)."""
    a = -math.pi / 2 + k * math.pi / 2
    d = Vector((math.cos(a), math.sin(a), 0.0))
    t = Vector((-math.sin(a), math.cos(a), 0.0))
    return d, t


def t1_point(k, f, z, e=0.0):
    """Point on tier-1 face k at lateral fraction f (-1..1 of the half-width) and height z, raised e."""
    d, t = face_frame(k)
    h = h1(z)
    return d * (h + e) + t * (f * h) + Vector((0, 0, z))


def strip_on_t1(mb, k, f0, f1, z0, z1, e, col, pat=PT['ashlar'], top=True, bot=False):
    """A raised strip on tier-1 face k between lateral fractions f0..f1, heights z0..z1, raised e (front + sides)."""
    a0, b0 = t1_point(k, f0, z0), t1_point(k, f1, z0)
    a1, b1 = t1_point(k, f0, z1), t1_point(k, f1, z1)
    A0, B0 = t1_point(k, f0, z0, e), t1_point(k, f1, z0, e)
    A1, B1 = t1_point(k, f0, z1, e), t1_point(k, f1, z1, e)
    quad(mb, A0, B0, B1, A1, col, pat)
    quad(mb, a0, A0, A1, a1, col, pat)
    quad(mb, B0, b0, b1, B1, col, pat)
    if top:
        quad(mb, A1, B1, b1, a1, col, pat)
    if bot:
        quad(mb, a0, b0, B0, A0, col, pat)


def build_tower(rng):
    S = MB(seed=11)          # stone
    W = MB(seed=12)          # windows
    lime, panel, marble = P['lime'], P['lime_panel'], P['marble']

    # ---- platform: battered podium, pavement, parapet with corner piers and a front gap for the causeway
    ngon_frustum(S, 4, -PODIUM, -0.6, (PLAT + 2.2) * math.sqrt(2), (PLAT + 0.4) * math.sqrt(2), P['lime_podium'], PT['ashlar'], rot=math.pi / 4, top=False, bot=True)
    sq_moulding(S, -0.6, [(0.6, PLAT + 0.6, PLAT + 0.6)], P['lime_dark'], PT['plain'])
    # pavement inset (one quad, the cobble/flag pattern)
    quad(S, (-PLAT, -PLAT, 0.02), (PLAT, -PLAT, 0.02), (PLAT, PLAT, 0.02), (-PLAT, PLAT, 0.02), P['paving'], PT['cobble'])
    PH, PT_ = 1.5, 0.9           # parapet height, thickness
    gap = 6.0                    # half-width of the causeway gap at the front
    for k in range(4):
        d, t = face_frame(k)
        segs = [(-PLAT, -gap), (gap, PLAT)] if k == 0 else [(-PLAT, PLAT)]
        for u0, u1 in segs:
            c = d * (PLAT - PT_ / 2) + t * ((u0 + u1) / 2) + Vector((0, 0, PH / 2))
            ax = (t, d, Vector((0, 0, 1)))
            box(S, c, (u1 - u0 - (0.4 if k else 0), PT_, PH), lime, PT['ashlar'], axes=ax)
            cc = d * (PLAT - PT_ / 2 + 0.12) + t * ((u0 + u1) / 2) + Vector((0, 0, PH + 0.12))
            box(S, cc, (u1 - u0, PT_ + 0.36, 0.24), marble, PT['plain'], axes=ax)       # coping
        if k == 0:
            for s in (-1, 1):            # gate piers either side of the causeway gap
                c = d * (PLAT - 1.0) + t * (s * (gap + 1.0)) + Vector((0, 0, 1.6))
                box(S, c, (2.0, 2.0, 3.2), lime, PT['ashlar'], axes=(t, d, Vector((0, 0, 1))))
                box(S, c + Vector((0, 0, 1.75)), (2.4, 2.4, 0.3), marble, PT['plain'], axes=(t, d, Vector((0, 0, 1))))
    for sx in (-1, 1):
        for sy in (-1, 1):           # corner piers
            c = Vector((sx * (PLAT - 1.6), sy * (PLAT - 1.6), 0))
            box2(S, c.x - 1.6, c.y - 1.6, 0, c.x + 1.6, c.y + 1.6, 3.4, lime, PT['ashlar'])
            box2(S, c.x - 1.9, c.y - 1.9, 3.4, c.x + 1.9, c.y + 1.9, 3.8, marble, PT['plain'])
            box2(S, c.x - 1.2, c.y - 1.2, 3.8, c.x + 1.2, c.y + 1.2, 4.3, marble, PT['plain'])

    # ---- tier 1 base: two stepped plinths
    sq_moulding(S, 0.0, [(1.2, 17.2, 17.2), (0.2, 17.2, 16.8), (1.0, 16.0, 16.0), (0.2, 16.0, 15.4)], P['lime_dark'], PT['ashlar'])
    # main shaft (four tapered faces; the top is capped by the cornice)
    ngon_frustum(S, 4, T1_Z0, T1_Z1, T1_H0 * math.sqrt(2), T1_H1 * math.sqrt(2), panel, PT['ashlar'], rot=math.pi / 4, top=False)
    # pilasters: corners (wide) + 4 inner strips per face -> 5 recessed panels (ref: the vertical panels)
    PIL = [(-1.0, -0.84), (-0.63, -0.545), (-0.26, -0.175), (0.175, 0.26), (0.545, 0.63), (0.84, 1.0)]
    for k in range(4):
        for f0, f1 in PIL:
            strip_on_t1(S, k, f0, f1, T1_Z0, T1_Z1 - 0.01, 0.75, lime, PT['ashlar'])
        # string courses across the panels (they stop at the pilasters: drawn at a shallower relief)
        for z in (14.0, 25.4, 36.8):
            strip_on_t1(S, k, -0.99, 0.99, z, z + 0.6, 0.3, lime, PT['plain'], bot=True)
    # windows: small slits in the panels, staggered rows (hb_window: Col.r = lit, Col.g = warmth)
    panels = [(-0.84, -0.63), (-0.545, -0.26), (-0.175, 0.175), (0.26, 0.545), (0.63, 0.84)]
    rows = [8.4, 18.6, 21.6, 29.6, 32.6, 40.8, 43.8]
    for k in range(4):
        for pi_, (f0, f1) in enumerate(panels):
            for ri, z in enumerate(rows):
                if k == 0 and pi_ == 2 and z < 19:
                    continue                         # the door bay
                if (pi_ + ri) % 2 and not (pi_ == 2 and ri % 2 == 0):
                    continue
                fc = (f0 + f1) / 2
                hw = 0.55 / h1(z)
                lit = rng.random()
                col = (0.35 + 0.65 * lit if rng.random() < 0.8 else 0.0, rng.random(), 0.0)
                a, b = t1_point(k, fc - hw, z, 0.06), t1_point(k, fc + hw, z, 0.06)
                c, d = t1_point(k, fc + hw, z + 1.9, 0.06), t1_point(k, fc - hw, z + 1.9, 0.06)
                quad(W, a, b, c, d, col)
                # a marble sill + lintel (micro relief that catches the light)
                for zz in (z - 0.22, z + 1.92):
                    strip_on_t1(S, k, fc - hw * 1.6, fc + hw * 1.6, zz, zz + 0.22, 0.18, marble, PT['plain'], bot=True)
    # the door: a deep reveal with a timber leaf, a marble architrave and a pediment, up a ramp
    d, t = face_frame(0)
    zf = DOOR_Z
    yface = -h1(zf)
    box2(S, -2.2, yface - 0.05, zf, 2.2, yface + 0.9, zf + 7.4, P['door'], PT['boards'], skip=('+y',))
    for x0, x1 in ((-3.2, -2.2), (2.2, 3.2)):                                            # jambs
        box2(S, x0, yface - 0.75, zf, x1, yface + 0.2, zf + 7.4, P['marble'], PT['plain'])
    box2(S, -3.6, yface - 0.95, zf + 7.4, 3.6, yface + 0.2, zf + 8.6, P['marble'], PT['plain'])      # lintel
    pa, pb, pc = Vector((-4.0, yface - 1.0, zf + 8.6)), Vector((4.0, yface - 1.0, zf + 8.6)), Vector((0, yface - 1.0, zf + 10.4))
    S.face([S.vert(pa), S.vert(pb), S.vert(pc)], P['marble'], PT['plain'])
    qa, qb, qc = Vector((-4.0, yface + 0.2, zf + 8.6)), Vector((4.0, yface + 0.2, zf + 8.6)), Vector((0, yface + 0.2, zf + 10.4))
    ia, ib, ic = (S.vert(x) for x in (pa, pb, pc))
    ja, jb, jc = (S.vert(x) for x in (qa, qb, qc))
    S.face([ia, ic, jc, ja], P['marble'], PT['plain']); S.face([ic, ib, jb, jc], P['marble'], PT['plain'])
    # landing + ramp (ramp foot at the platform front, rising to the threshold), with side walls
    y_land = yface - 3.0
    box2(S, -4.0, y_land, 0.0, 4.0, yface + 0.1, zf, P['lime_dark'], PT['ashlar'])
    quad(S, (-3.6, y_land, zf + 0.01), (3.6, y_land, zf + 0.01), (3.6, yface, zf + 0.01), (-3.6, yface, zf + 0.01), P['paving'], PT['cobble'])
    y_foot = -PLAT + 3.0
    for s in (-1, 1):                # side walls (wedges)
        x0, x1 = (s * 3.0, s * 3.9) if s > 0 else (s * 3.9, s * 3.0)
        a0, a1 = S.vert((x0, y_foot, 0)), S.vert((x1, y_foot, 0))
        b0, b1 = S.vert((x0, y_land, 0)), S.vert((x1, y_land, 0))
        c0, c1 = S.vert((x0, y_foot, 1.0)), S.vert((x1, y_foot, 1.0))
        d0, d1 = S.vert((x0, y_land, zf + 1.0)), S.vert((x1, y_land, zf + 1.0))
        S.face([a1, b1, d1, c1], P['lime'], PT['ashlar']); S.face([b0, a0, c0, d0], P['lime'], PT['ashlar'])
        S.face([c0, c1, d1, d0], P['marble'], PT['plain']); S.face([a0, a1, c1, c0], P['lime'], PT['ashlar'])
    r0, r1, r2_, r3 = (S.vert(p) for p in ((-3.0, y_foot, 0.03), (3.0, y_foot, 0.03), (3.0, y_land, zf), (-3.0, y_land, zf)))
    S.face([r0, r1, r2_, r3], P['paving'], PT['planks_y'])
    # the ramp's underside fill (a solid wedge)
    s0, s1 = S.vert((-3.0, y_land, 0.0)), S.vert((3.0, y_land, 0.0))
    S.face([s0, s1, r2_, r3][::-1], P['lime_dark'], PT['ashlar'])

    # ---- cornice 1, the first terrace and its parapet
    z = sq_moulding(S, T1_Z1, [(1.4, 12.9, 12.9), (0.35, 12.9, 13.5), (1.1, 13.7, 13.7), (0.5, 13.7, 14.4),
                               (0.8, 14.4, 14.4), (0.3, 14.4, 14.0)], marble, PT['plain'])
    Z_T1TOP = z                       # terrace floor (~53.0)
    # frieze band of small dentils under the corona (the crafted read at heart distance)
    for k in range(4):
        dd, tt = face_frame(k)
        h = 13.5
        for i in range(-12, 13):
            c = dd * (h + 0.22) + tt * (i * 1.0) + Vector((0, 0, T1_Z1 + 1.75 + 0.3))
            box(S, c, (0.5, 0.44, 0.6), marble, PT['plain'], axes=(tt, dd, Vector((0, 0, 1))), skip=('-y', '+z'))
    for k in range(4):
        dd, tt = face_frame(k)
        c = dd * 13.55 + Vector((0, 0, Z_T1TOP + 0.6))
        box(S, c, (27.6, 0.7, 1.2), lime, PT['ashlar'], axes=(tt, dd, Vector((0, 0, 1))))
        box(S, c + Vector((0, 0, 0.7)), (28.1, 1.0, 0.22), marble, PT['plain'], axes=(tt, dd, Vector((0, 0, 1))))
    quad(S, (-13.2, -13.2, Z_T1TOP + 0.01), (13.2, -13.2, Z_T1TOP + 0.01), (13.2, 13.2, Z_T1TOP + 0.01), (-13.2, 13.2, Z_T1TOP + 0.01), P['paving'], PT['cobble'])
    # corner plinths for the tritons
    for sx in (-1, 1):
        for sy in (-1, 1):
            box2(S, sx * 13.6 - 1.3, sy * 13.6 - 1.3, Z_T1TOP, sx * 13.6 + 1.3, sy * 13.6 + 1.3, Z_T1TOP + 2.0, marble, PT['plain'])

    # ---- tier 2: octagon (flat faces toward the axes)
    rot8 = math.pi / 8
    z = moulding(S, 8, Z_T1TOP, [(1.2, 10.7, 10.7), (0.3, 10.7, 10.2), (0.9, 10.1, 10.1)], P['lime_dark'], PT['ashlar'], rot=rot8)
    ngon_frustum(S, 8, T2_Z0, T2_Z1, T2_R0, T2_R1, panel, PT['ashlar'], rot=rot8, top=False)
    for k in range(8):                       # corner pilasters
        a = rot8 + TAU * k / 8
        dv = Vector((math.cos(a), math.sin(a), 0))
        tv = Vector((-math.sin(a), math.cos(a), 0))
        A0, A1 = dv * (T2_R0 + 0.15), dv * (T2_R1 + 0.15)
        p0, p1 = A0 + Vector((0, 0, T2_Z0)), A1 + Vector((0, 0, T2_Z1))
        c = (p0 + p1) / 2
        up = (p1 - p0).normalized()
        box(S, c, (1.5, 0.9, (p1 - p0).length), lime, PT['ashlar'], axes=(tv, up.cross(tv).normalized() * -1, up))
    # windows: two per face, three rows (staggered), on the flat faces
    apo = lambda z: r2(z) * math.cos(math.pi / 8)
    for k in range(8):
        a = TAU * k / 8                       # face normal angle (flat faces at multiples of 45 deg)
        dv = Vector((math.cos(a), math.sin(a), 0)); tv = Vector((-math.sin(a), math.cos(a), 0))
        for ri, z in enumerate((58.6, 64.6, 70.2)):
            for s in ((-1, 1) if ri != 1 else (0,)):
                ap = apo(z) + 0.05
                lit = rng.random()
                col = (0.35 + 0.65 * lit if rng.random() < 0.75 else 0.0, rng.random(), 0.0)
                cx = s * 1.9
                quad(W, dv * ap + tv * (cx - 0.5) + Vector((0, 0, z)), dv * ap + tv * (cx + 0.5) + Vector((0, 0, z)),
                     dv * ap + tv * (cx + 0.5) + Vector((0, 0, z + 1.8)), dv * ap + tv * (cx - 0.5) + Vector((0, 0, z + 1.8)), col)
                box(S, dv * (ap + 0.1) + tv * cx + Vector((0, 0, z - 0.12)), (1.5, 0.26, 0.24), marble, PT['plain'], axes=(tv, dv, Vector((0, 0, 1))))
                box(S, dv * (ap + 0.1) + tv * cx + Vector((0, 0, z + 1.92)), (1.5, 0.26, 0.24), marble, PT['plain'], axes=(tv, dv, Vector((0, 0, 1))))
    z = moulding(S, 8, T2_Z1, [(0.8, 8.8, 8.8), (0.3, 8.8, 9.4), (0.9, 9.6, 9.6), (0.4, 9.6, 10.2), (0.6, 10.2, 10.0)], marble, PT['plain'], rot=rot8)
    Z_T2TOP = z
    ngon_ring(S, 8, Z_T2TOP, Z_T2TOP + 1.1, 9.9, 9.3, lime, PT['ashlar'], rot=rot8)
    ngon_ring(S, 8, Z_T2TOP + 1.1, Z_T2TOP + 1.3, 10.1, 9.15, marble, PT['plain'], rot=rot8)
    ngon_frustum(S, 8, Z_T2TOP - 0.01, Z_T2TOP + 0.01, 9.4, 9.4, P['paving'], PT['cobble'], rot=rot8, top=True)

    # ---- tier 3: cylindrical drum + gallery
    n16 = 20
    z = moulding(S, n16, Z_T2TOP, [(1.0, 7.0, 7.0), (0.3, 7.0, 6.6)], P['lime_dark'], PT['ashlar'])
    ngon_frustum(S, n16, T3_Z0 - 1.0 if T3_Z0 - 1.0 > z else z, T3_Z1, T3_R, T3_R - 0.25, panel, PT['ashlar'], top=False, smooth=True)
    for k in range(8):                       # drum windows
        a = TAU * (k + 0.5) / 8
        dv = Vector((math.cos(a), math.sin(a), 0)); tv = Vector((-math.sin(a), math.cos(a), 0))
        zz = 79.4; rr = T3_R - 0.1
        col = (0.5 + 0.5 * rng.random(), rng.random(), 0.0)
        quad(W, dv * rr + tv * -0.45 + Vector((0, 0, zz)), dv * rr + tv * 0.45 + Vector((0, 0, zz)),
             dv * rr + tv * 0.45 + Vector((0, 0, zz + 1.6)), dv * rr + tv * -0.45 + Vector((0, 0, zz + 1.6)), col)
    z = moulding(S, n16, T3_Z1, [(0.5, 6.4, 6.8), (0.6, 7.0, 7.7), (0.3, 7.7, 7.5)], marble, PT['plain'])
    Z_GAL = z                                 # gallery floor (~85.0)
    ngon_frustum(S, n16, Z_GAL - 0.01, Z_GAL + 0.01, 7.4, 7.4, P['paving'], PT['cobble'], top=True)
    # gallery balustrade: a rail + balusters
    ngon_ring(S, n16, Z_GAL + 1.05, Z_GAL + 1.25, 7.45, 7.1, marble, PT['plain'])
    for k in range(40):
        a = TAU * k / 40
        c = Vector((7.27 * math.cos(a), 7.27 * math.sin(a), Z_GAL + 0.52))
        rod(S, c - Vector((0, 0, 0.52)), c + Vector((0, 0, 0.53)), 0.13, marble, segs=4, r2=0.1, smooth=False)

    # ---- lantern: 8 columns with bases + capitals, the entablature ring, the dome, the statue plinth
    for k in range(8):
        a = TAU * (k + 0.5) / 8
        c = Vector((LAN_R * math.cos(a), LAN_R * math.sin(a), 0))
        box2(S, c.x - 0.75, c.y - 0.75, Z_GAL, c.x + 0.75, c.y + 0.75, Z_GAL + 0.45, marble, PT['plain'])
        ngon_frustum(S, 10, Z_GAL + 0.45, Z_GAL + 0.75, 0.62, 0.5, marble, PT['plain'], cx=c.x, cy=c.y, top=False)
        ngon_frustum(S, 10, Z_GAL + 0.75, LAN_Z1 - 0.6, 0.48, 0.4, P['marble_warm'], PT['plain'], cx=c.x, cy=c.y, top=False, smooth=True)
        ngon_frustum(S, 10, LAN_Z1 - 0.6, LAN_Z1 - 0.3, 0.42, 0.62, marble, PT['plain'], cx=c.x, cy=c.y, top=False)
        box2(S, c.x - 0.8, c.y - 0.8, LAN_Z1 - 0.3, c.x + 0.8, c.y + 0.8, LAN_Z1, marble, PT['plain'])
    ngon_ring(S, n16, LAN_Z1, LAN_Z1 + 0.7, 6.1, 4.4, marble, PT['plain'])
    ngon_ring(S, n16, LAN_Z1 + 0.7, LAN_Z1 + 1.1, 6.4, 4.4, lime, PT['plain'])
    ngon_ring(S, n16, LAN_Z1 + 1.1, DOME_Z0, 6.6, 4.4, marble, PT['plain'])
    # coffered ceiling disc over the fire (seen lit from below)
    ngon_frustum(S, n16, LAN_Z1 + 0.05, LAN_Z1 + 0.06, 4.5, 4.5, P['lime_dark'], PT['plain'], bot=True, top=False)
    # dome: a low ribbed hemisphere
    rings = [(0.0, 6.3), (1.2, 5.8), (2.3, 4.7), (3.1, 3.05), (3.6, 1.35)]
    prev = None
    for dz, rr in rings:
        cur = [S.vert((rr * math.cos(TAU * k / n16), rr * math.sin(TAU * k / n16), DOME_Z0 + dz)) for k in range(n16)]
        if prev:
            for k in range(n16):
                k2 = (k + 1) % n16
                S.face((prev[k], prev[k2], cur[k2], cur[k]), P['marble_warm'], PT['tiles'], smooth=True)
        prev = cur
    S.face(prev, P['marble_warm'], PT['plain'])
    for k in range(8):                       # gilt dome ribs
        a = TAU * k / 8
        pts = [Vector((rr * math.cos(a), rr * math.sin(a), DOME_Z0 + dz)) * 1.0 for dz, rr in rings]
        for p0, p1 in zip(pts, pts[1:]):
            rod(S, p0 + Vector((0, 0, 0.12)), p1 + Vector((0, 0, 0.12)), 0.16, P['gilt'], segs=4, smooth=False, pat=PT['metal'])
    zt = DOME_Z0 + rings[-1][0]
    moulding(S, 8, zt, [(0.5, 1.6, 1.6), (0.25, 1.75, 1.75)], marble, PT['plain'], rot=rot8)

    # ---- the brazier (bronze tripod bowl) + the mirror's pivot ring on the lantern floor
    ngon_frustum(S, 12, Z_GAL, Z_GAL + 0.4, 3.3, 3.1, P['bronze_dark'], PT['metal'])                 # pivot ring
    for k in range(3):
        a = TAU * k / 3
        rod(S, (1.8 * math.cos(a), 1.8 * math.sin(a), Z_GAL + 0.4), (1.1 * math.cos(a), 1.1 * math.sin(a), Z_GAL + 1.2), 0.18, P['bronze'], segs=4, smooth=False, pat=PT['metal'])
    ngon_frustum(S, 12, Z_GAL + 1.0, Z_GAL + 2.0, 0.9, 2.1, P['bronze'], PT['metal'], top=False, bot=True)
    ngon_ring(S, 12, Z_GAL + 2.0, Z_GAL + 2.22, 2.25, 1.9, P['gilt'], PT['metal'])
    # the four sea-facing hearth openings are open: no glazing (an ancient tholos)
    return S, W, dict(Z_T1TOP=Z_T1TOP, Z_T2TOP=Z_T2TOP, Z_GAL=Z_GAL, DOME_TOP=zt + 0.75, yface=yface)


# ------------------------------------------------------------------ figures
def figure_triton(mb, base, facing, scale=1.0):
    """A triton on a corner plinth blowing a conch outward: a coiled fish tail, a torso, a raised conch."""
    f = Vector(facing).normalized(); s = Vector((-f.y, f.x, 0)); up = Vector((0, 0, 1))
    B = Vector(base)
    sc = scale
    col, gilt = P['patina'], P['gilt']
    # tail coil (a ring of rods) + flukes
    pts = []
    for i in range(9):
        a = i / 8 * TAU * 0.9
        pts.append(B + (f * math.cos(a) * 1.1 + s * math.sin(a) * 1.1) * sc + up * (0.35 + 0.18 * i) * sc)
    for i, (p0, p1) in enumerate(zip(pts, pts[1:])):
        rod(mb, p0, p1, (0.55 - i * 0.04) * sc, col, segs=5, r2=(0.51 - i * 0.04) * sc, smooth=True, pat=PT['metal'])
    fl = pts[-1]
    for side in (-1, 1):
        rod(mb, fl, fl + (s * side * 0.9 - f * 0.3 + up * 0.5) * sc, 0.2 * sc, col, segs=3, r2=0.05, smooth=False, pat=PT['metal'])
    # torso rising from the coil, leaning out
    hip = B + up * 1.0 * sc
    chest = hip + (up * 2.0 + f * 0.35) * sc
    rod(mb, hip, chest, 0.62 * sc, col, segs=6, r2=0.52 * sc, smooth=True, pat=PT['metal'])
    head = chest + (up * 0.85 + f * 0.15) * sc
    rod(mb, chest, head - up * 0.35 * sc, 0.22 * sc, col, segs=5, smooth=True, pat=PT['metal'])
    ngon_frustum(mb, 6, head.z - 0.45 * sc, head.z + 0.42 * sc, 0.38 * sc, 0.3 * sc, col, PT['metal'], cx=head.x, cy=head.y, smooth=True)
    # arms up to the conch at the lips, the conch thrown outward and up (gilt)
    mouth = head + f * 0.35 * sc
    for side in (-1, 1):
        sh = chest + s * side * 0.6 * sc
        hand = mouth + f * (0.5 + 0.4 * (side > 0)) * sc + s * side * 0.25 * sc
        rod(mb, sh, (sh + hand) / 2 - up * 0.2 * sc, 0.2 * sc, col, segs=4, smooth=False, pat=PT['metal'])
        rod(mb, (sh + hand) / 2 - up * 0.2 * sc, hand, 0.17 * sc, col, segs=4, smooth=False, pat=PT['metal'])
    horn_end = mouth + (f * 2.0 + up * 0.9) * sc
    rod(mb, mouth, horn_end, 0.12 * sc, gilt, segs=6, r2=0.55 * sc, smooth=True, pat=PT['metal'])


def figure_helios(mb, base):
    """The crowning statue: a gilded Helios, robed, a radiate crown, the right arm raised straight up with a torch,
    the left hand on a long sceptre. Built for the silhouette against the sky: a figure, not a spire."""
    B = Vector(base); up = Vector((0, 0, 1)); f = Vector((0, -1, 0)); s = Vector((1, 0, 0))
    g, gd = P['gilt'], lin('#B88A35')
    ngon_frustum(mb, 8, B.z, B.z + 0.45, 1.2, 1.15, gd, PT['metal'], rot=math.pi / 8, cx=B.x, cy=B.y, bot=False)
    z0 = B.z + 0.45
    # robe to the waist (a gentle flare, the folds are the facets), then the chest broadening to the shoulders
    ngon_frustum(mb, 10, z0, z0 + 2.5, 0.8, 0.56, g, PT['metal'], cx=B.x, cy=B.y, top=False)
    ngon_frustum(mb, 8, z0 + 2.5, z0 + 3.7, 0.56, 0.74, g, PT['metal'], cx=B.x, cy=B.y, top=False, smooth=True)
    sh = z0 + 3.7
    box(mb, B + up * (sh - B.z + 0.12), (1.75, 0.8, 0.34), g, PT['metal'])                       # shoulders
    # neck + head + a radiate crown ringing the head (short rays, a halo disc read)
    rod(mb, B + up * (sh - B.z + 0.25), B + up * (sh - B.z + 0.55), 0.18, g, segs=5, pat=PT['metal'])
    hz = sh + 0.85
    ngon_frustum(mb, 8, hz - 0.32, hz + 0.05, 0.28, 0.34, g, PT['metal'], cx=B.x, cy=B.y, top=False, smooth=True)
    ngon_frustum(mb, 8, hz + 0.05, hz + 0.38, 0.34, 0.1, g, PT['metal'], cx=B.x, cy=B.y, smooth=True)
    for k in range(9):
        a = math.radians((k - 4) * 21)                             # a fan of rays round the head, in the facade plane
        dirv = Vector((math.sin(a), 0.0, math.cos(a)))
        c = B + up * (hz - B.z + 0.02) + f * -0.05
        rod(mb, c + dirv * 0.32, c + dirv * 0.8, 0.07, P['gilt'], segs=3, r2=0.015, smooth=False, pat=PT['metal'])
    # right arm raised straight up, a torch with a gilt flame cup
    rs = B + s * 0.82 + up * (sh - B.z + 0.15)
    relb = rs + s * 0.12 + up * 1.05
    rhand = relb + s * 0.02 + up * 1.0
    rod(mb, rs, relb, 0.22, g, segs=5, r2=0.18, smooth=True, pat=PT['metal'])
    rod(mb, relb, rhand, 0.18, g, segs=5, r2=0.15, smooth=True, pat=PT['metal'])
    rod(mb, rhand - up * 0.5, rhand + up * 0.7, 0.1, gd, segs=5, smooth=False, pat=PT['metal'])
    ngon_frustum(mb, 8, rhand.z + 0.7, rhand.z + 1.15, 0.14, 0.38, g, PT['metal'], cx=rhand.x, cy=rhand.y, smooth=True)
    # left hand on a long sceptre planted on the plinth
    ls = B - s * 0.82 + up * (sh - B.z + 0.1)
    lelb = ls - s * 0.18 - up * 0.95 + f * 0.1
    lhand = lelb - s * 0.05 + f * 0.55 + up * 0.25
    rod(mb, ls, lelb, 0.21, g, segs=5, r2=0.17, smooth=True, pat=PT['metal'])
    rod(mb, lelb, lhand, 0.17, g, segs=5, r2=0.14, smooth=True, pat=PT['metal'])
    sp = Vector((lhand.x, lhand.y, B.z + 0.45))
    rod(mb, sp, Vector((lhand.x, lhand.y, lhand.z + 1.5)), 0.07, gd, segs=4, smooth=False, pat=PT['metal'])
    ngon_frustum(mb, 6, lhand.z + 1.5, lhand.z + 1.9, 0.2, 0.02, g, PT['metal'], cx=lhand.x, cy=lhand.y)
    # a cloak falling from the shoulders behind
    c0, c1 = B - s * 0.85 + up * (sh - B.z + 0.2) - f * 0.35, B + s * 0.85 + up * (sh - B.z + 0.2) - f * 0.35
    c2, c3 = B + s * 0.95 + up * 0.7 - f * 0.85, B - s * 0.95 + up * 0.7 - f * 0.85
    mb.face([mb.vert(c0), mb.vert(c1), mb.vert(c2), mb.vert(c3)], gd, PT['metal'])
    mb.face([mb.vert(c3), mb.vert(c2), mb.vert(c1), mb.vert(c0)], gd, PT['metal'])
    return rhand + up * 1.15


def figure_pharaoh(mb, base, facing, scale=1.0):
    """A colossal standing king in red granite on a plinth (the ramp's guardians): one block against its back
    pillar, the left foot forward, arms at the sides, a gilt nemes and the double crown."""
    B = Vector(base); f = Vector(facing).normalized(); s = Vector((-f.y, f.x, 0)); up = Vector((0, 0, 1)); sc = scale
    gr, grd, gilt = P['granite_red'], lin('#8E5646'), lin('#D9B45A')
    ax = (s, f, up)
    box(mb, B + up * 1.4 * sc, (3.0 * sc, 3.6 * sc, 2.8 * sc), P['lime_dark'], PT['ashlar'], axes=ax)          # plinth
    box(mb, B + up * 2.95 * sc, (3.3 * sc, 3.9 * sc, 0.3 * sc), P['marble'], PT['plain'], axes=ax)
    z = 3.1 * sc
    # back pillar
    box(mb, B + up * (z + 3.7 * sc) - f * 0.85 * sc, (1.4 * sc, 0.5 * sc, 7.4 * sc), grd, PT['plain'], axes=ax)
    # legs (striding: the left foot forward) and the kilt
    box(mb, B + up * (z + 1.4 * sc) - s * 0.33 * sc + f * 0.35 * sc, (0.58 * sc, 0.75 * sc, 2.8 * sc), gr, PT['plain'], axes=ax)
    box(mb, B + up * (z + 1.4 * sc) + s * 0.33 * sc - f * 0.25 * sc, (0.58 * sc, 0.75 * sc, 2.8 * sc), gr, PT['plain'], axes=ax)
    box(mb, B + up * (z + 3.2 * sc), (1.6 * sc, 1.1 * sc, 1.0 * sc), gilt, PT['tiles'], axes=ax)
    # torso (broad shoulders, narrow waist) + arms held at the sides
    tz0, tz1 = z + 3.7 * sc, z + 6.0 * sc
    pts = [(-0.7, tz0), (0.7, tz0), (1.05, tz1), (-1.05, tz1)]
    for d0, d1, flip in ((0.42, 0.42, False), (-0.42, -0.42, True)):
        ids = [mb.vert(B + s * (x * sc) + f * (d0 * sc) + up * zz) for x, zz in pts]
        mb.face(ids[::-1] if flip else ids, gr, PT['plain'])
    for side in (-1, 1):
        a0 = mb.vert(B + s * (side * 0.7 * sc) + f * 0.42 * sc + up * tz0); a1 = mb.vert(B + s * (side * 1.05 * sc) + f * 0.42 * sc + up * tz1)
        b0 = mb.vert(B + s * (side * 0.7 * sc) - f * 0.42 * sc + up * tz0); b1 = mb.vert(B + s * (side * 1.05 * sc) - f * 0.42 * sc + up * tz1)
        mb.face([a0, b0, b1, a1] if side > 0 else [a1, b1, b0, a0], gr, PT['plain'])
        box(mb, B + s * (side * 1.12 * sc) + up * (z + 4.6 * sc), (0.42 * sc, 0.6 * sc, 2.6 * sc), gr, PT['plain'], axes=ax)
    box(mb, B + up * (tz1 + 0.12 * sc), (2.2 * sc, 0.9 * sc, 0.24 * sc), gr, PT['plain'], axes=ax)
    # head + gilt nemes + the double crown
    hz = tz1 + 0.75 * sc
    ngon_frustum(mb, 6, B.z + hz - 0.5 * sc, B.z + hz + 0.4 * sc, 0.42 * sc, 0.38 * sc, gr, PT['plain'], cx=B.x, cy=B.y, smooth=True)
    a0 = B + up * (hz + 0.5 * sc) - s * 0.5 * sc
    a1 = B + up * (hz + 0.5 * sc) + s * 0.5 * sc
    b1 = B + up * (hz - 0.85 * sc) + s * 0.95 * sc - f * 0.15 * sc
    b0 = B + up * (hz - 0.85 * sc) - s * 0.95 * sc - f * 0.15 * sc
    for off, flip in ((f * 0.1 * sc, False), (-f * 0.32 * sc, True)):
        ids = [mb.vert(p + off) for p in (b0, b1, a1, a0)]
        mb.face(ids[::-1] if flip else ids, gilt, PT['tiles'])
    ngon_frustum(mb, 8, B.z + hz + 0.4 * sc, B.z + hz + 0.9 * sc, 0.45 * sc, 0.5 * sc, lin('#A8382C'), PT['plain'], cx=B.x, cy=B.y)
    ngon_frustum(mb, 8, B.z + hz + 0.9 * sc, B.z + hz + 1.7 * sc, 0.32 * sc, 0.12 * sc, P['marble'], PT['plain'], cx=B.x, cy=B.y, smooth=True)


def mirror_parts(rng):
    """The bronze mirror (in the 'mirror' node's own frame: origin on the pivot axis at MIRROR_Z, beam along -Y).
    A shallow concave disc 5.2 m across set 3.2 m behind the fire, on a yoke with a counterweight arm."""
    D = MB(seed=21); F = MB(seed=22)
    R, back, depth = 1.8, 3.0, 0.4
    n, rings = 20, 4
    centre = Vector((0, back, 0))
    grid = []
    for i in range(rings + 1):
        rr = R * i / rings
        sag = depth * (rr / R) ** 2           # concave toward -Y (the fire)
        row = []
        for k in range(n if i else 1):
            a = TAU * k / n
            row.append(Vector((rr * math.cos(a), back + depth - sag, rr * math.sin(a))))
        grid.append(row)
    # front (polished face, hb_mirror; uv = disc coords for the runtime's sheen)
    ids = [[D.vert(p) for p in row] for row in grid]
    for k in range(n):
        k2 = (k + 1) % n
        uvf = lambda p: ((p.x / R) * 0.5 + 0.5, (p.z / R) * 0.5 + 0.5)
        D.face([ids[0][0], ids[1][k2], ids[1][k]], P['mirror'], PT['metal'], uv=[uvf(grid[0][0]), uvf(grid[1][k2]), uvf(grid[1][k])], smooth=True)
        for i in range(1, rings):
            q = [(i, k), (i, k2), (i + 1, k2), (i + 1, k)]
            D.face([ids[a][b] for a, b in q][::-1], P['mirror'], PT['metal'], uv=[uvf(grid[a][b]) for a, b in q][::-1], smooth=True)
    # back + rim (bronze, hb_opaque)
    rim_f = [Vector((R * math.cos(TAU * k / n), back, R * math.sin(TAU * k / n))) for k in range(n)]
    rim_b = [Vector((R * 1.04 * math.cos(TAU * k / n), back + depth + 0.25, R * 1.04 * math.sin(TAU * k / n))) for k in range(n)]
    A = [F.vert(p) for p in rim_f]; B = [F.vert(p) for p in rim_b]
    cb = F.vert(centre + Vector((0, depth + 0.75, 0)))
    for k in range(n):
        k2 = (k + 1) % n
        F.face([A[k], A[k2], B[k2], B[k]], P['bronze'], PT['metal'])
        F.face([B[k], B[k2], cb], P['bronze_dark'], PT['metal'])
    rim = [F.vert(p + Vector((0, -0.02, 0))) for p in (Vector((R * 1.09 * math.cos(TAU * k / n), back - 0.03, R * 1.09 * math.sin(TAU * k / n))) for k in range(n))]
    for k in range(n):                     # a gilt rim lip in front of the disc edge
        k2 = (k + 1) % n
        F.face([A[k2], A[k], rim[k], rim[k2]], P['gilt'], PT['metal'])
    # yoke: two arms from the pivot ring up to the disc's sides, a cross-beam and a gilt sun boss on the back
    for sd in (-1, 1):
        rod(F, (sd * 2.2, back + 0.1, -2.4), (sd * 2.05, back + 0.15, 0.0), 0.15, P['bronze_dark'], segs=4, smooth=False, pat=PT['metal'])
    rod(F, (-2.2, back + 0.1, -2.4), (2.2, back + 0.1, -2.4), 0.17, P['bronze_dark'], segs=4, smooth=False, pat=PT['metal'])
    rod(F, (0, back + 0.1, -2.4), (0, 0.6, -2.35), 0.2, P['bronze_dark'], segs=4, smooth=False, pat=PT['metal'])
    rod(F, centre + Vector((0, depth + 0.6, 0)), centre + Vector((0, depth + 0.85, 0)), 0.55, P['gilt'], segs=8, cap=True, smooth=False, pat=PT['metal'])
    return D, F


def build(coll=None):
    """Build the whole Pharos under an empty 'pharos'. Returns (root, info)."""
    rng = random.Random(7)
    ensure_export_materials()
    for nm in ('hb_window', 'hb_fire', 'hb_mirror'):
        material(nm)
    root = empty('pharos', (0, 0, 0), coll=coll)
    S, W, info = build_tower(rng)
    # tritons on the four corners of the first terrace, conches out along the diagonals
    for sx in (-1, 1):
        for sy in (-1, 1):
            figure_triton(S, (sx * 13.6, sy * 13.6, info['Z_T1TOP'] + 2.0), (sx, sy, 0), scale=1.7)
    # the pharaoh guardians flank the ramp foot
    for sx in (-1, 1):
        figure_pharaoh(S, (sx * 9.8, -PLAT + 8.5, 0.0), (0, -1, 0), scale=1.55)
    tower = to_object(S, 'tower', 'hb_opaque', parent=root, coll=coll)
    wins = to_object(W, 'tower_windows', 'hb_window', parent=root, coll=coll)
    # statue (separate node: the runtime lights it from the fire)
    Sm = MB(seed=31)
    hand = figure_helios(Sm, (0, 0, 0))
    SC = 1.45
    for i, v in enumerate(Sm.v):
        Sm.v[i] = Sm.vf[i] = Vector((v.x * SC, v.y * SC, v.z * SC + info['DOME_TOP']))
    hand = Vector((hand.x * SC, hand.y * SC, hand.z * SC + info['DOME_TOP']))
    statue = to_object(Sm, 'statue', 'hb_opaque', parent=root, coll=coll)
    # fire core: the glowing ember bed in the brazier (hb_fire; the runtime adds the flames)
    Fm = MB(seed=41)
    zb = info['Z_GAL'] + 1.95
    n = 12
    rim = [Fm.vert((1.9 * math.cos(TAU * k / n), 1.9 * math.sin(TAU * k / n), zb)) for k in range(n)]
    mid = [Fm.vert((1.1 * math.cos(TAU * (k + 0.5) / n), 1.2 * math.sin(TAU * (k + 0.5) / n), zb + 0.55 + 0.2 * rng.random())) for k in range(n)]
    top = Fm.vert((0, 0, zb + 0.95))
    for k in range(n):
        k2 = (k + 1) % n
        Fm.face([rim[k], rim[k2], mid[k]], P['ember'], 0)
        Fm.face([mid[k], rim[k2], mid[k2]], P['ember'], 0)
        Fm.face([mid[k], mid[k2], top], P['ember'], 0)
    fire = to_object(Fm, 'fire_core', 'hb_fire', parent=root, coll=coll)
    # mirror
    mir = empty('mirror', (0, 0, MIRROR_Z), parent=root, coll=coll)
    D, F = mirror_parts(rng)
    to_object(D, 'mirror_disc', 'hb_mirror', parent=mir, coll=coll)
    to_object(F, 'mirror_frame', 'hb_opaque', parent=mir, coll=coll)
    empty('fire_emitter', (0, 0, zb + 0.6), parent=root, coll=coll)
    empty('lantern', (0, 0, FIRE_Z), parent=root, coll=coll)
    empty('smoke_emitter', (0, 0, info['DOME_TOP'] - 1.0), parent=root, coll=coll)
    empty('door', (0, info['yface'] - 3.0, DOOR_Z), parent=root, coll=coll)
    empty('causeway_gate', (0, -PLAT, 0.0), parent=root, coll=coll)
    info.update(hand_z=hand.z, fire_z=FIRE_Z, mirror_z=MIRROR_Z, platform=PLAT * 2, podium=PODIUM)
    return root, info


def stats(root):
    out = {}
    for o in descendants(root):
        if o.type == 'MESH':
            out[o.name] = tri_count([o])
    out['total'] = sum(out.values())
    return out
