"""The Pharos of Alexandria, v2 (E18 / O6-I4: a monument, not an office tower) - geometry.

Same contract as pharos_geo.py (v1, still buildable: export.py -- --v1): the node names, the beam pivot ('mirror',
MIRROR_Z 87.4), the lantern (FIRE_Z 88.2, the beam origin), the emitters, the gallery floor (Z_GAL 85.0), the 64 m
platform, the pharaohs, the dome and the statue's top are unchanged. The stack below the gallery is re-proportioned
(O6-F5: tier 1 ends at 42 m, octagon 48.5-71 m, drum 9.5 m) and re-crafted:

    tier 1  square, battered (half 15.0 -> 12.7) 2.6 -> 42.0 m: drafted corner quoins, two string courses, one
            recessed bay per face with plain openings in 0.4 m reveals; the door at the foot of the front bay
    cornice an Egyptian cavetto over a dentil frieze (a deep corona shadow); the first terrace at ~46 m
    tritons four bronze tritons (2.3x) on corner pedestals blowing gilt conches, tails coiled round the pedestal's lip
            and curling up behind into raised flukes; the corner facing the camera turns its conch to the sea
    tier 2  octagon 48.5 -> 71.0 m: corner pilasters, a string course, windows in reveals, a cavetto cornice
    tier 3  drum 9.5 m (74.1 -> 83.6) with engaged pilasters and windows in reveals, under v1's gallery cornice
    lantern v1's tholos, dome and brazier; the mirror grows to R 2.5 m with a gilt rim, level with the flames
    statue  Helios without the cloak quad (it read as a chest shield), a larger radiate crown
    value   a ladder in vertex colour from a warm foot to a pale marble crown (+ E15's AO bake: pharos_bake.py)

The craft follows the fixed diorama camera (yaw 45, pitch 26-30: it sees the front -Y and the +X faces and three
corners): the hidden +Y/-X faces stay plain masonry, closed so the sun's shadow keeps the whole tower.
Blender units = metres, Z up, origin = the platform centre at pavement level, FRONT (door, ramp) = -Y.
"""
import math
from mathutils import Vector
from hb_lib import MB, box, box2, rod, lin, to_object, empty, ensure_export_materials, material
import pharos_geo as v1
from pharos_geo import (ngon_frustum, ngon_ring, moulding, quad, face_frame, figure_pharaoh, P, PT, TAU,
                        PLAT, PODIUM, LAN_Z1, LAN_R, DOME_Z0, FIRE_Z, MIRROR_Z, DOOR_Z)

VERSION = 2
# the v2 stone ladder (sRGB): warm foot -> pale crown. The runtime limewash (E03a) still prints plain/ashlar x1.06.
HEX2 = {
    'plinth': '#C9BB9C', 'field1': '#DACEB3', 'field2': '#DFD4BB', 'field3': '#E3D9C2', 'bay': '#E2D8C2',
    'quoin': '#EBE3D2', 'trim': '#F0EBE0', 'gorge': '#E7DFCC', 'oct': '#E6DDCA', 'oct_pil': '#EEE7D8',
    'drum': '#EAE3D3', 'drum_pil': '#F0EADD', 'reveal': '#CFC3A8', 'sill': '#F2EEE5',
    'bronze_v': '#58806F', 'bronze_t': '#4C6E61', 'gilt2': '#E0AE48', 'portal': '#EFE9DC',
}
P2 = {k: lin(v) for k, v in HEX2.items()}

# ------------------------------------------------------------------ dimensions (metres)
T1_Z0, T1_Z1 = 2.6, 42.0
T1_H0, T1_H1 = 15.0, 12.7          # tier-1 half-widths (battered)
STRINGS = (15.4, 28.7)              # string-course bottoms: three stages
T2_Z0, T2_Z1 = 48.5, 71.0
T2_R0, T2_R1 = 10.1, 9.0            # octagon circumradius
T3_Z0, T3_Z1 = 74.1, 83.6           # the drum, 9.5 m
T3_R0, T3_R1 = 6.5, 6.25
Z_GAL = 85.0                        # gallery / lantern floor: unchanged (the fire, the mirror and the lantern sit on it)
RD = 0.7                            # tier-1 bay recess
WD = 0.4                            # window reveal depth (E18)
BW = 3.4                            # tier-1 bay half-width
QE = 0.22                           # quoin projection
VISIBLE = (0, 1)                    # tier-1 faces the camera sees (front -Y, +X)


def h1(z):
    return T1_H0 + (T1_H1 - T1_H0) * (z - T1_Z0) / (T1_Z1 - T1_Z0)


def r2(z):
    return T2_R0 + (T2_R1 - T2_R0) * (z - T2_Z0) / (T2_Z1 - T2_Z0)


def t1p(k, u, z, e=0.0):
    """Point on tier-1 face k at lateral offset u (m, + = right seen from outside), height z, raised e (m)."""
    d, t = face_frame(k)
    return d * (h1(z) + e) + t * u + Vector((0, 0, z))


def sq_ring(mb, z, steps, col, pat=PT['plain'], hfn=h1):
    """Square mouldings that follow the batter: steps = [(dz, out0, out1)] (projection beyond hfn(z) at the slab's
    bottom/top). Returns the top z."""
    for dz, a, b in steps:
        r0, r1 = (hfn(z) + a) * math.sqrt(2), (hfn(z + dz) + b) * math.sqrt(2)
        ngon_frustum(mb, 4, z, z + dz, r0, r1, col, pat, rot=math.pi / 4, top=True, bot=True)
        z += dz
    return z


def cavetto(z0, r0, flare, height, n=4):
    """An Egyptian gorge as moulding steps: a quarter-circle cove from vertical (bottom) to flat (top)."""
    pts = [(r0 + flare * (1 - math.cos(i / n * math.pi / 2)), z0 + height * math.sin(i / n * math.pi / 2)) for i in range(n + 1)]
    return [(pts[i + 1][1] - pts[i][1], pts[i][0], pts[i + 1][0]) for i in range(n)]


def opening(S, W, pt, z0, z1, uc, hw, depth, rng, sill=True, kind=1.0):
    """A plain opening (hb_window kind 1: no glass, a deep warm reveal) in a wall described by pt(u, z, e) (e = 0 on
    the wall, + outward). Builds the two jambs, the sill, the head soffit (never seen from the diorama's pitch, it
    closes the reveal for the sun's shadow), the window at the reveal's back and a projecting marble sill; the caller
    leaves the hole in the wall."""
    a0, b0, a1, b1 = pt(uc - hw, z0, 0), pt(uc + hw, z0, 0), pt(uc - hw, z1, 0), pt(uc + hw, z1, 0)
    A0, B0, A1, B1 = pt(uc - hw, z0, -depth), pt(uc + hw, z0, -depth), pt(uc - hw, z1, -depth), pt(uc + hw, z1, -depth)
    rv = P2['reveal']
    quad(S, a0, A0, A1, a1, rv, PT['plain'])          # left jamb (faces +u, into the opening)
    quad(S, B0, b0, b1, B1, rv, PT['plain'])          # right jamb
    quad(S, a0, b0, B0, A0, rv, PT['plain'])          # sill (looks up)
    quad(S, A1, B1, b1, a1, rv, PT['plain'])          # head soffit (looks down; closes the reveal for the sun's shadow)
    col = (0.55 + 0.45 * rng.random(), rng.random(), kind)
    quad(W, A0, B0, B1, A1, col)
    if sill:
        c0, c1 = pt(uc - hw - 0.25, z0 - 0.2, 0), pt(uc + hw + 0.25, z0 - 0.2, 0)
        c2, c3 = pt(uc + hw + 0.25, z0, 0), pt(uc - hw - 0.25, z0, 0)
        C0, C1 = pt(uc - hw - 0.25, z0 - 0.2, 0.22), pt(uc + hw + 0.25, z0 - 0.2, 0.22)
        C2, C3 = pt(uc + hw + 0.25, z0, 0.22), pt(uc - hw - 0.25, z0, 0.22)
        sc = P2['sill']
        quad(S, C0, C1, C2, C3, sc, PT['plain'])      # front
        quad(S, C3, C2, c2, c3, sc, PT['plain'])      # top
        quad(S, c0, C0, C3, c3, sc, PT['plain'])      # ends
        quad(S, C1, c1, c2, C2, sc, PT['plain'])


def wall_with_openings(S, pt, u0, u1, z0, z1, holes, col, pat, rows=()):
    """A wall panel u0..u1 x z0..z1 (pt(u, z, e)) with rectangular holes [(uc, hw, hz0, hz1)] stacked in one column
    (same uc/hw), split into quads; extra horizontal rows (z) give the AO bake vertices to work with."""
    if holes:
        uc, hw = holes[0][0], holes[0][1]
        cuts = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes], *[r for r in rows if z0 < r < z1]})
    else:
        cuts = sorted({z0, z1, *[r for r in rows if z0 < r < z1]})
    for za, zb in zip(cuts, cuts[1:]):
        hole = any(h[2] <= za and zb <= h[3] for h in holes)
        if hole:
            spans = [(u0, uc - hw), (uc + hw, u1)]
        else:
            spans = [(u0, u1)]
        for ua, ub in spans:
            if ub - ua > 1e-4:
                quad(S, pt(ua, za, 0), pt(ub, za, 0), pt(ub, zb, 0), pt(ua, zb, 0), col, pat)


# ------------------------------------------------------------------ tier 1
def quoins(S):
    """Drafted corner quoins, alternating long/short along each face (a toothed, light-framed corner). The hidden
    back corner (faces 2/3) carries none."""
    n = 16
    qh = (T1_Z1 - T1_Z0) / n
    for k in (0, 1, 3):                         # corner between face k and k+1
        dk, _ = face_frame(k)
        dn, _ = face_frame((k + 1) % 4)
        for i in range(n):
            z0, z1 = T1_Z0 + i * qh, T1_Z0 + (i + 1) * qh - 0.06     # a 6 cm joint shadow between courses
            la, lb = (3.1, 1.9) if i % 2 == 0 else (1.9, 3.1)
            col = tuple(c * (1.0 + (0.025 if i % 2 else -0.015)) for c in P2['quoin'])

            def pts(z):
                h = h1(z)
                C = dk * h + dn * h
                return [dk * h + dn * (h - la), dk * (h + QE) + dn * (h - la), dk * (h + QE) + dn * (h + QE),
                        dn * (h + QE) + dk * (h - lb), dn * h + dk * (h - lb), C]
            lo = [p + Vector((0, 0, z0)) for p in pts(z0)]
            hi = [p + Vector((0, 0, z1)) for p in pts(z1)]
            for a, b in ((0, 1), (1, 2), (2, 3), (3, 4)):
                quad(S, lo[a], lo[b], hi[b], hi[a], col, PT['plain'])
            S.face([S.vert(p) for p in hi], col, PT['plain'])     # the tooth's top (the joint above shows the wall)


def tier1(S, W, rng):
    rows = (3.6, 5.0, 8.0, 12.0, 20.0, 24.0, 33.0, 37.0, 40.4, 41.3)
    for k in range(4):
        pt = lambda u, z, e, k=k: t1p(k, u, z, e)
        if k not in VISIBLE:
            # hidden face: plain masonry, a few rows for the AO bake
            cuts = sorted({T1_Z0, T1_Z1, 4.0, 8.0, 40.4})
            for za, zb in zip(cuts, cuts[1:]):
                quad(S, pt(-h1(za), za, 0), pt(h1(za), za, 0), pt(h1(zb), zb, 0), pt(-h1(zb), zb, 0), P2['field2'], PT['ashlar'])
            continue
        bz0 = DOOR_Z if k == 0 else 4.2
        bz1 = 40.4
        # the field either side of the bay (full height), below and above it
        for za, zb in zip((T1_Z0,) + rows, rows + (T1_Z1,)):
            col = P2['field1'] if za < STRINGS[0] else P2['field2'] if za < STRINGS[1] else P2['field3']
            quad(S, pt(-h1(za), za, 0), pt(-BW, za, 0), pt(-BW, zb, 0), pt(-h1(zb), zb, 0), col, PT['ashlar'])
            quad(S, pt(BW, za, 0), pt(h1(za), za, 0), pt(h1(zb), zb, 0), pt(BW, zb, 0), col, PT['ashlar'])
        quad(S, pt(-BW, T1_Z0, 0), pt(BW, T1_Z0, 0), pt(BW, bz0, 0), pt(-BW, bz0, 0), P2['field1'], PT['ashlar'])
        quad(S, pt(-BW, bz1, 0), pt(BW, bz1, 0), pt(BW, T1_Z1, 0), pt(-BW, T1_Z1, 0), P2['field3'], PT['ashlar'])
        # the bay: reveals, a sill ledge, and its back wall with the openings
        quad(S, pt(-BW, bz0, 0), pt(-BW, bz0, -RD), pt(-BW, bz1, -RD), pt(-BW, bz1, 0), P2['reveal'], PT['plain'])
        quad(S, pt(BW, bz0, -RD), pt(BW, bz0, 0), pt(BW, bz1, 0), pt(BW, bz1, -RD), P2['reveal'], PT['plain'])
        quad(S, pt(-BW, bz0, 0), pt(BW, bz0, 0), pt(BW, bz0, -RD), pt(-BW, bz0, -RD), P2['reveal'], PT['plain'])
        quad(S, pt(-BW, bz1, -RD), pt(BW, bz1, -RD), pt(BW, bz1, 0), pt(-BW, bz1, 0), P2['reveal'], PT['plain'])
        back = lambda u, z, e, k=k: t1p(k, u, z, e - RD)
        wins = [(0.0, 0.5, 19.6, 22.6), (0.0, 0.5, 32.6, 35.8)] if k == 0 else \
               [(0.0, 0.5, 8.6, 11.4), (0.0, 0.5, 19.6, 22.6), (0.0, 0.5, 32.6, 35.8)]
        top_bay = 14.95 if k == 0 else bz0           # the front portal fills the bay's foot
        # the bay's back wall is smooth dressed stone (plain): a quiet panel framed by its reveal shadows
        wall_with_openings(S, back, -BW, BW, top_bay, bz1, wins, P2['bay'], PT['plain'], rows=rows)
        if k == 0:
            # behind the portal: the bay wall down to the threshold (the door leaf covers its middle)
            wall_with_openings(S, back, -BW, BW, bz0, top_bay, [(0.0, 2.2, bz0, 13.0)], P2['bay'], PT['plain'])
        for uc, hw, z0, z1 in wins:
            opening(S, W, back, z0, z1, uc, hw, WD, rng)
    # the two string courses (they run across the bays) and the plinths
    for zs in STRINGS:
        sq_ring(S, zs, [(0.55, 0.45, 0.45), (0.22, 0.45, 0.12)], P2['trim'])
    v1.sq_moulding(S, 0.0, [(1.2, 17.2, 17.2), (0.2, 17.2, 16.8), (1.0, 16.0, 16.0), (0.2, 16.0, 15.4)], P2['plinth'], PT['ashlar'])
    quoins(S)


def portal(S):
    """The door at the foot of the front bay: a timber leaf in a deep marble frame with an Egyptian gorge crown,
    the landing and the ramp down to the causeway gate (v1's ramp)."""
    zf = DOOR_Z
    yb = -(h1(zf) - RD)                       # the bay's back wall (front face: y = -(h + e))
    yface = -h1(zf)
    box2(S, -2.2, yb - 0.05, zf, 2.2, yb + 0.9, zf + 7.4, P['door'], PT['boards'], skip=('+y',))
    for x0, x1 in ((-3.0, -2.2), (2.2, 3.0)):                                           # jambs
        box2(S, x0, yface - 0.25, zf, x1, yb + 0.05, zf + 7.4, P2['portal'], PT['plain'], skip=('+y', '-z'))
    box2(S, -3.25, yface - 0.4, zf + 7.4, 3.25, yb + 0.05, zf + 8.6, P2['portal'], PT['plain'], skip=('+y',))   # lintel
    # the gorge crown over the lintel (front + ends flare out)
    za = zf + 8.6
    for dz, o0, o1 in cavetto(za, 0.0, 0.35, 0.5, n=2) + [(0.25, 0.35, 0.35)]:
        box2(S, -3.3 - o1, yface - 0.4 - o1, za, 3.3 + o1, yb + 0.05, za + dz, P2['trim'], PT['plain'], skip=('+y', '-z'))
        za += dz
    # landing + ramp (as v1), with side walls
    y_land = yface - 3.0
    box2(S, -4.0, y_land, 0.0, 4.0, yface, zf, P['lime_dark'], PT['ashlar'])
    quad(S, (-3.6, y_land, zf + 0.01), (3.6, y_land, zf + 0.01), (3.6, yface, zf + 0.01), (-3.6, yface, zf + 0.01), P['paving'], PT['cobble'])
    y_foot = -PLAT + 3.0
    for s in (-1, 1):
        x0, x1 = (s * 3.0, s * 3.9) if s > 0 else (s * 3.9, s * 3.0)
        a0, a1 = S.vert((x0, y_foot, 0)), S.vert((x1, y_foot, 0))
        b0, b1 = S.vert((x0, y_land, 0)), S.vert((x1, y_land, 0))
        c0, c1 = S.vert((x0, y_foot, 1.0)), S.vert((x1, y_foot, 1.0))
        d0, d1 = S.vert((x0, y_land, zf + 1.0)), S.vert((x1, y_land, zf + 1.0))
        S.face([a1, b1, d1, c1], P['lime'], PT['ashlar']); S.face([b0, a0, c0, d0], P['lime'], PT['ashlar'])
        S.face([c0, c1, d1, d0], P['marble'], PT['plain']); S.face([a0, a1, c1, c0], P['lime'], PT['ashlar'])
    r0, r1, r2_, r3 = (S.vert(p) for p in ((-3.0, y_foot, 0.03), (3.0, y_foot, 0.03), (3.0, y_land, zf), (-3.0, y_land, zf)))
    S.face([r0, r1, r2_, r3], P['paving'], PT['planks_y'])
    s0, s1 = S.vert((-3.0, y_land, 0.0)), S.vert((3.0, y_land, 0.0))
    S.face([s0, s1, r2_, r3][::-1], P['lime_dark'], PT['ashlar'])
    return yface


def cornice1(S):
    """The Egyptian cornice: torus, a dentil frieze, the cavetto gorge and its corona lip. Returns the terrace z."""
    h = h1(T1_Z1)
    flat = lambda _z: h
    z = sq_ring(S, T1_Z1, [(0.3, 0.32, 0.32), (0.18, 0.32, 0.12)], P2['trim'], hfn=flat)  # torus roll
    z = sq_ring(S, z, [(1.1, 0.12, 0.12)], P2['trim'], hfn=flat)                          # frieze
    zf1 = z
    z = sq_ring(S, z, [(0.18, 0.2, 0.55)], P2['trim'], hfn=flat)                          # bed moulding
    for dz, a, b in cavetto(z, 0.55, 1.45, 1.5, n=4):                                      # the gorge
        ngon_frustum(S, 4, z, z + dz, (h + a) * math.sqrt(2), (h + b) * math.sqrt(2), P2['gorge'], PT['plain'], rot=math.pi / 4, top=True, bot=True)
        z += dz
    z = sq_ring(S, z, [(0.5, 2.0, 2.0), (0.12, 2.0, 1.85)], P2['trim'], hfn=flat)        # corona + fillet
    # dentils under the bed moulding, on the faces the camera sees
    for k in VISIBLE:
        d, t = face_frame(k)
        hh = h1(T1_Z1) + 0.12
        for i in range(-13, 14):
            c = d * (hh + 0.16) + t * (i * 0.98) + Vector((0, 0, zf1 - 0.42))
            box(S, c, (0.46, 0.32, 0.6), P2['trim'], PT['plain'], axes=(t, d, Vector((0, 0, 1))), skip=('-y', '-z'))   # tops show under the bed
    return z


def terrace1(S, zt):
    """The first terrace: paving, a low parapet behind the corona, the tritons' corner pedestals."""
    hp = 13.9
    quad(S, (-hp, -hp, zt + 0.01), (hp, -hp, zt + 0.01), (hp, hp, zt + 0.01), (-hp, hp, zt + 0.01), P['paving'], PT['cobble'])
    for k in range(4):
        d, t = face_frame(k)
        ax = (t, d, Vector((0, 0, 1)))
        c = d * (hp - 0.3) + Vector((0, 0, zt + 0.5))
        box(S, c, (2 * hp - 5.0, 0.6, 1.0), P['lime'], PT['ashlar'], axes=ax, skip=('-z',))
        box(S, c + Vector((0, 0, 0.6)), (2 * hp - 5.0, 0.86, 0.2), P2['trim'], PT['plain'], axes=ax, skip=('-z',))
    PED = 12.75
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * PED, sy * PED
            box2(S, x - 1.8, y - 1.8, zt, x + 1.8, y + 1.8, zt + 0.45, P2['trim'], PT['plain'], skip=('-z',))
            box2(S, x - 1.55, y - 1.55, zt + 0.45, x + 1.55, y + 1.55, zt + 2.35, P['lime'], PT['ashlar'], skip=('-z',))
            box2(S, x - 1.7, y - 1.7, zt + 2.35, x + 1.7, y + 1.7, zt + 2.8, P2['trim'], PT['plain'], skip=('-z',))
    return PED, zt + 2.8


def figure_triton2(mb, base, facing, sc=2.3, turn=0.0):
    """A bronze triton blowing a conch out to sea: an upright torso over the corner, both arms raised to a long gilt
    conch thrown up and out (turned `turn` rad off the diagonal so it reads in profile even on the corner that faces
    the camera), the fish tail coiled round the pedestal's lip and curling up behind into a raised forked fluke (a
    merman's silhouette, never a seated figure's legs)."""
    f = Vector(facing).normalized(); s = Vector((-f.y, f.x, 0)); up = Vector((0, 0, 1)); B = Vector(base)
    W = lambda a, b, c: B + (f * a + s * b + up * c) * sc
    body, tail, gilt = P2['bronze_v'], P2['bronze_t'], P2['gilt2']
    # tail: hips -> down and back -> a coil round the pedestal's lip -> rising behind the shoulder -> the fluke
    path = [(0.0, 0.0, 1.05, 0.42), (-0.28, 0.36, 0.56, 0.4), (-0.7, 0.3, 0.3, 0.37), (-0.98, -0.18, 0.36, 0.33),
            (-0.82, -0.62, 0.72, 0.29), (-0.55, -0.66, 1.3, 0.25), (-0.5, -0.5, 1.92, 0.2), (-0.62, -0.44, 2.46, 0.15)]
    for (a0, b0, c0, r0), (a1, b1, c1, r1) in zip(path, path[1:]):
        rod(mb, W(a0, b0, c0), W(a1, b1, c1), r0 * sc, tail, segs=6, r2=r1 * sc, smooth=True, pat=PT['metal'])
    fl = W(*path[-1][:3])
    for side in (-1, 1):
        rod(mb, fl, fl + (-f * 0.22 + s * (side * 0.62 - 0.12) + up * 0.42) * sc, 0.17 * sc, gilt, segs=3, r2=0.02, smooth=False, pat=PT['metal'])
    # the conch and the arms turn off the corner's diagonal
    fc = f * math.cos(turn) + s * math.sin(turn); sc_ = Vector((-fc.y, fc.x, 0))
    Wc = lambda a, b, c: B + (fc * a + sc_ * b + up * c) * sc
    # a gilt fin ruff where man becomes fish
    ngon_frustum(mb, 8, B.z + 0.95 * sc, B.z + 1.2 * sc, 0.5 * sc, 0.42 * sc, gilt, PT['metal'], cx=B.x, cy=B.y)
    # torso (narrow waist, broad chest), shoulders, neck, head tipped back to the conch
    rod(mb, W(0.0, 0.0, 1.15), W(0.22, 0.0, 2.75), 0.36 * sc, body, segs=7, r2=0.5 * sc, smooth=True, pat=PT['metal'])
    box(mb, W(0.26, 0.0, 2.92), (0.62 * sc, 1.32 * sc, 0.42 * sc), body, PT['metal'], axes=(f, s, up), skip=('-z',))
    rod(mb, W(0.28, 0.0, 3.1), W(0.33, 0.0, 3.4), 0.17 * sc, body, segs=6, smooth=True, pat=PT['metal'])
    hc = Wc(0.38, 0.0, 3.68)
    ngon_frustum(mb, 7, hc.z - 0.3 * sc, hc.z + 0.12 * sc, 0.27 * sc, 0.31 * sc, body, PT['metal'], cx=hc.x, cy=hc.y, top=False, bot=True, smooth=True)
    ngon_frustum(mb, 7, hc.z + 0.12 * sc, hc.z + 0.4 * sc, 0.33 * sc, 0.12 * sc, tail, PT['metal'], cx=hc.x - fc.x * 0.05 * sc, cy=hc.y - fc.y * 0.05 * sc, smooth=True)
    # the conch: mouth -> bell, up and out to sea, a gilt spiral (two tapering rods and a flared lip)
    m0, m1, m2 = Wc(0.66, 0.0, 3.74), Wc(1.32, 0.0, 4.3), Wc(2.0, 0.0, 5.05)
    rod(mb, m0, m1, 0.1 * sc, gilt, segs=7, r2=0.2 * sc, smooth=True, pat=PT['metal'])
    rod(mb, m1, m2, 0.2 * sc, gilt, segs=8, r2=0.56 * sc, smooth=True, pat=PT['metal'])
    rod(mb, m2, m2 + (m2 - m1).normalized() * 0.12 * sc, 0.62 * sc, gilt, segs=8, r2=0.6 * sc, smooth=False, pat=PT['metal'], cap=True)
    # arms raised to the conch: one hand at the mouthpiece, one under the bell
    for side, hand in ((-1, Wc(0.95, -0.12, 4.02)), (1, Wc(1.62, 0.18, 4.62))):
        sh = W(0.26, side * 0.66, 2.95)
        el = Wc(0.62 if side < 0 else 0.92, side * 0.86, 3.2 if side < 0 else 3.3)
        rod(mb, sh, el, 0.19 * sc, body, segs=5, r2=0.16 * sc, smooth=True, pat=PT['metal'])
        rod(mb, el, hand, 0.15 * sc, body, segs=5, r2=0.12 * sc, smooth=True, pat=PT['metal'])


# ------------------------------------------------------------------ tier 2: the octagon
def octagon(S, W, rng, zt):
    rot8 = math.pi / 8
    k_ = (T2_Z0 - zt) / 2.6
    z = moulding(S, 8, zt, [(1.2 * k_, 10.9, 10.9), (0.3 * k_, 10.9, 10.5), (0.85 * k_, 10.4, 10.4), (0.25 * k_, 10.4, 10.15)], P['lime_dark'], PT['ashlar'], rot=rot8)
    assert abs(z - T2_Z0) < 1e-6 and k_ > 0.5, (z, k_)
    cos8 = math.cos(math.pi / 8)
    see = {6: 2, 7: 2, 0: 2, 5: 1, 1: 1}                  # face k (normal at k*45 deg): openings it carries
    zs = 59.4                                           # mid string course
    for k in range(8):
        a = TAU * k / 8
        dv = Vector((math.cos(a), math.sin(a), 0)); tv = Vector((-math.sin(a), math.cos(a), 0))
        pt = lambda u, zz, e, dv=dv, tv=tv: dv * (r2(zz) * cos8 + e) + tv * u + Vector((0, 0, zz))
        hs = lambda zz: r2(zz) * math.sin(math.pi / 8)
        n = see.get(k, 0)
        wins = [(0.0, 0.42, 52.4, 55.2), (0.0, 0.42, 63.0, 66.0)][:n] if n == 2 else [(0.0, 0.42, 63.0, 66.0)] if n == 1 else []
        rows = (50.0, 69.6) if n else ()
        cuts = sorted({T2_Z0, T2_Z1, *rows, *[w[2] for w in wins], *[w[3] for w in wins]})
        for za, zb in zip(cuts, cuts[1:]):
            hole = any(w[2] <= za and zb <= w[3] for w in wins)
            spans = [(-hs(za), -0.42, -hs(zb), -0.42), (0.42, hs(za), 0.42, hs(zb))] if hole else [(-hs(za), hs(za), -hs(zb), hs(zb))]
            for ua0, ub0, ua1, ub1 in spans:
                quad(S, pt(ua0, za, 0), pt(ub0, za, 0), pt(ub1, zb, 0), pt(ua1, zb, 0), P2['oct'], PT['ashlar'])
        for uc, hw, z0, z1 in wins:
            opening(S, W, pt, z0, z1, uc, hw, 0.36, rng)
    # corner pilasters (none on the two hidden back corners)
    for k in range(8):
        a = rot8 + TAU * k / 8
        if k in (2, 3):
            continue
        dv = Vector((math.cos(a), math.sin(a), 0)); tv = Vector((-math.sin(a), math.cos(a), 0))
        p0, p1 = dv * (T2_R0 + 0.05) + Vector((0, 0, T2_Z0)), dv * (T2_R1 + 0.05) + Vector((0, 0, T2_Z1))
        up = (p1 - p0).normalized()
        box(S, (p0 + p1) / 2, (1.15, 0.5, (p1 - p0).length), P2['oct_pil'], PT['plain'], axes=(tv, up.cross(tv).normalized() * -1, up), skip=('-z', '+z'))
    # mid string course
    moulding(S, 8, zs, [(0.5, r2(zs) + 0.42, r2(zs) + 0.42), (0.2, r2(zs) + 0.42, r2(zs) + 0.15)], P2['trim'], PT['plain'], rot=rot8)
    # the cornice: torus, frieze, cavetto, corona; a parapet ring on the second terrace
    R = T2_R1
    z = moulding(S, 8, T2_Z1, [(0.28, R + 0.3, R + 0.3), (0.14, R + 0.3, R + 0.15), (0.8, R + 0.2, R + 0.2), (0.15, R + 0.25, R + 0.5)], P2['trim'], PT['plain'], rot=rot8)
    zf1 = z - 0.15
    for dz, a_, b_ in cavetto(z, R + 0.5, 1.05, 1.1, n=3):
        ngon_frustum(S, 8, z, z + dz, a_, b_, P2['gorge'], PT['plain'], rot=rot8, top=True, bot=True)
        z += dz
    z = moulding(S, 8, z, [(0.42, R + 1.55, R + 1.55), (0.1, R + 1.55, R + 1.4)], P2['trim'], PT['plain'], rot=rot8)
    for k in (5, 6, 7, 0, 1):                           # dentils on the faces the camera sees
        a = TAU * k / 8
        dv = Vector((math.cos(a), math.sin(a), 0)); tv = Vector((-math.sin(a), math.cos(a), 0))
        ap = (R + 0.2) * cos8
        half = (R + 0.2) * math.sin(math.pi / 8) - 0.45
        m = int(half / 0.62)
        for i in range(-m, m + 1):
            c = dv * (ap + 0.13) + tv * (i * half / max(m, 1)) + Vector((0, 0, zf1 - 0.32))
            box(S, c, (0.3, 0.26, 0.42), P2['trim'], PT['plain'], axes=(tv, dv, Vector((0, 0, 1))), skip=('-y', '-z'))
    ztop = z
    ngon_ring(S, 8, ztop, ztop + 0.9, R + 1.2, R + 0.7, P['lime'], PT['ashlar'], rot=rot8)
    ngon_ring(S, 8, ztop + 0.9, ztop + 1.1, R + 1.38, R + 0.6, P2['trim'], PT['plain'], rot=rot8)
    ngon_frustum(S, 8, ztop - 0.01, ztop + 0.01, R + 0.75, R + 0.75, P['paving'], PT['cobble'], rot=rot8, top=True)
    return ztop


# ------------------------------------------------------------------ tier 3: the drum (and v1's gallery cornice)
def drum(S, W, rng, zt):
    n = 24
    moulding(S, n, zt, [(0.55, 7.25, 7.25), (0.25, 7.25, 6.9)], P['lime_dark'], PT['ashlar'])     # encloses the shaft's foot
    rr = lambda zz: T3_R0 + (T3_R1 - T3_R0) * (zz - T3_Z0) / (T3_Z1 - T3_Z0)
    wz0, wz1 = 77.4, 80.3
    win_segments = (1, 4, 7, 10, 13, 16, 19, 22)        # 45 deg apart; only the ones the camera sees get an opening
    vis = lambda ang: math.cos(ang - math.radians(-45.0)) > -0.42
    for j in range(n):
        a0, a1 = TAU * j / n, TAU * (j + 1) / n
        am = (a0 + a1) / 2
        dv = Vector((math.cos(am), math.sin(am), 0)); tv = Vector((-math.sin(am), math.cos(am), 0))
        half = math.sin(math.pi / n)
        apo = math.cos(math.pi / n)
        pt = lambda u, zz, e, dv=dv, tv=tv: dv * (rr(zz) * apo + e) + tv * u + Vector((0, 0, zz))
        hs = lambda zz: rr(zz) * half
        has_win = j in win_segments and vis(am)
        wins = [(0.0, 0.46, wz0, wz1)] if has_win else []
        cuts = sorted({T3_Z0, T3_Z1, 75.4, 82.6, *[w[2] for w in wins], *[w[3] for w in wins]})
        for za, zb in zip(cuts, cuts[1:]):
            hole = any(w[2] <= za and zb <= w[3] for w in wins)
            spans = [(-hs(za), -0.46, -hs(zb), -0.46), (0.46, hs(za), 0.46, hs(zb))] if hole else [(-hs(za), hs(za), -hs(zb), hs(zb))]
            for ua0, ub0, ua1, ub1 in spans:
                quad(S, pt(ua0, za, 0), pt(ub0, za, 0), pt(ub1, zb, 0), pt(ua1, zb, 0), P2['drum'], PT['ashlar'])
        for uc, hw, z0_, z1_ in wins:
            opening(S, W, pt, z0_, z1_, uc, hw, 0.32, rng, sill=True)
    # engaged pilasters between the windows, on the side the camera sees
    for k in range(8):
        a = TAU * k / 8
        if not vis(a):
            continue
        dv = Vector((math.cos(a), math.sin(a), 0)); tv = Vector((-math.sin(a), math.cos(a), 0))
        p0, p1 = dv * (T3_R0 - 0.05) + Vector((0, 0, T3_Z0)), dv * (T3_R1 - 0.05) + Vector((0, 0, T3_Z1))
        up = (p1 - p0).normalized()
        box(S, (p0 + p1) / 2, (0.62, 0.42, (p1 - p0).length), P2['drum_pil'], PT['plain'], axes=(tv, up.cross(tv).normalized() * -1, up), skip=('-z', '+z'))
    # v1's gallery cornice, exactly: its profile from 83.6 m up to the gallery floor (85.0 m)
    z = moulding(S, n, T3_Z1, [(0.5, 6.4, 6.8), (0.6, 7.0, 7.7), (0.3, 7.7, 7.5)], P['marble'], PT['plain'])
    assert abs(z - Z_GAL) < 1e-6, z
    return z


def lantern(S):
    """v1's gallery, tholos, entablature, coffered ceiling, ribbed dome and brazier (unchanged geometry)."""
    marble = P['marble']
    n16 = 20
    ngon_frustum(S, n16, Z_GAL - 0.01, Z_GAL + 0.01, 7.4, 7.4, P['paving'], PT['cobble'], top=True)
    ngon_ring(S, n16, Z_GAL + 1.05, Z_GAL + 1.25, 7.45, 7.1, marble, PT['plain'])
    for k in range(40):
        a = TAU * k / 40
        c = Vector((7.27 * math.cos(a), 7.27 * math.sin(a), Z_GAL + 0.52))
        rod(S, c - Vector((0, 0, 0.52)), c + Vector((0, 0, 0.53)), 0.13, marble, segs=4, r2=0.1, smooth=False)
    for k in range(8):
        a = TAU * (k + 0.5) / 8
        c = Vector((LAN_R * math.cos(a), LAN_R * math.sin(a), 0))
        box2(S, c.x - 0.75, c.y - 0.75, Z_GAL, c.x + 0.75, c.y + 0.75, Z_GAL + 0.45, marble, PT['plain'])
        ngon_frustum(S, 10, Z_GAL + 0.45, Z_GAL + 0.75, 0.62, 0.5, marble, PT['plain'], cx=c.x, cy=c.y, top=False)
        ngon_frustum(S, 10, Z_GAL + 0.75, LAN_Z1 - 0.6, 0.48, 0.4, P['marble_warm'], PT['plain'], cx=c.x, cy=c.y, top=False, smooth=True)
        ngon_frustum(S, 10, LAN_Z1 - 0.6, LAN_Z1 - 0.3, 0.42, 0.62, marble, PT['plain'], cx=c.x, cy=c.y, top=False)
        box2(S, c.x - 0.8, c.y - 0.8, LAN_Z1 - 0.3, c.x + 0.8, c.y + 0.8, LAN_Z1, marble, PT['plain'])
    ngon_ring(S, n16, LAN_Z1, LAN_Z1 + 0.7, 6.1, 4.4, marble, PT['plain'])
    ngon_ring(S, n16, LAN_Z1 + 0.7, LAN_Z1 + 1.1, 6.4, 4.4, P['lime'], PT['plain'])
    ngon_ring(S, n16, LAN_Z1 + 1.1, DOME_Z0, 6.6, 4.4, marble, PT['plain'])
    ngon_frustum(S, n16, LAN_Z1 + 0.05, LAN_Z1 + 0.06, 4.5, 4.5, P['lime_dark'], PT['plain'], bot=True, top=False)
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
    for k in range(8):
        a = TAU * k / 8
        pts = [Vector((rr * math.cos(a), rr * math.sin(a), DOME_Z0 + dz)) for dz, rr in rings]
        for p0, p1 in zip(pts, pts[1:]):
            rod(S, p0 + Vector((0, 0, 0.12)), p1 + Vector((0, 0, 0.12)), 0.16, P['gilt'], segs=4, smooth=False, pat=PT['metal'])
    zt = DOME_Z0 + rings[-1][0]
    moulding(S, 8, zt, [(0.5, 1.6, 1.6), (0.25, 1.75, 1.75)], marble, PT['plain'], rot=math.pi / 8)
    ngon_frustum(S, 12, Z_GAL, Z_GAL + 0.4, 3.3, 3.1, P['bronze_dark'], PT['metal'])                 # pivot ring
    for k in range(3):
        a = TAU * k / 3
        rod(S, (1.8 * math.cos(a), 1.8 * math.sin(a), Z_GAL + 0.4), (1.1 * math.cos(a), 1.1 * math.sin(a), Z_GAL + 1.2), 0.18, P['bronze'], segs=4, smooth=False, pat=PT['metal'])
    ngon_frustum(S, 12, Z_GAL + 1.0, Z_GAL + 2.0, 0.9, 2.1, P['bronze'], PT['metal'], top=False, bot=True)
    ngon_ring(S, 12, Z_GAL + 2.0, Z_GAL + 2.22, 2.25, 1.9, P['gilt'], PT['metal'])
    return zt + 0.75


def figure_helios2(mb, base):
    """v1's gilded Helios (raised torch, sceptre) without the cloak quad, crowned with a larger radiate crown that
    reads against the sky from the diorama's diagonal."""
    B = Vector(base); up = Vector((0, 0, 1)); f = Vector((0, -1, 0)); s = Vector((1, 0, 0))
    g, gd = P['gilt'], lin('#B88A35')
    ngon_frustum(mb, 8, B.z, B.z + 0.45, 1.2, 1.15, gd, PT['metal'], rot=math.pi / 8, cx=B.x, cy=B.y, bot=False)
    z0 = B.z + 0.45
    ngon_frustum(mb, 10, z0, z0 + 2.5, 0.8, 0.56, g, PT['metal'], cx=B.x, cy=B.y, top=False)
    ngon_frustum(mb, 8, z0 + 2.5, z0 + 3.7, 0.56, 0.74, g, PT['metal'], cx=B.x, cy=B.y, top=False, smooth=True)
    sh = z0 + 3.7
    box(mb, B + up * (sh - B.z + 0.12), (1.75, 0.8, 0.34), g, PT['metal'])
    rod(mb, B + up * (sh - B.z + 0.25), B + up * (sh - B.z + 0.55), 0.18, g, segs=5, pat=PT['metal'])
    hz = sh + 0.85
    ngon_frustum(mb, 8, hz - 0.32, hz + 0.05, 0.28, 0.34, g, PT['metal'], cx=B.x, cy=B.y, top=False, smooth=True)
    ngon_frustum(mb, 8, hz + 0.05, hz + 0.38, 0.34, 0.1, g, PT['metal'], cx=B.x, cy=B.y, smooth=True)
    # the radiate crown: a gilt band and eleven rays round the head, tipped up
    hc = Vector((B.x, B.y, hz + 0.02))
    ngon_ring(mb, 9, hz - 0.02, hz + 0.14, 0.4, 0.3, P['gilt'], PT['metal'])
    for k in range(11):
        a = TAU * k / 11 + 0.15
        dirv = Vector((math.cos(a) * math.cos(0.5), math.sin(a) * math.cos(0.5), math.sin(0.5)))
        rod(mb, hc + dirv * 0.34, hc + dirv * 1.2, 0.085, P['gilt'], segs=3, r2=0.012, smooth=False, pat=PT['metal'])
    rod(mb, hc + up * 0.3, hc + up * 1.25, 0.085, P['gilt'], segs=3, r2=0.012, smooth=False, pat=PT['metal'])
    rs = B + s * 0.82 + up * (sh - B.z + 0.15)
    relb = rs + s * 0.12 + up * 1.05
    rhand = relb + s * 0.02 + up * 1.0
    rod(mb, rs, relb, 0.22, g, segs=5, r2=0.18, smooth=True, pat=PT['metal'])
    rod(mb, relb, rhand, 0.18, g, segs=5, r2=0.15, smooth=True, pat=PT['metal'])
    rod(mb, rhand - up * 0.5, rhand + up * 0.7, 0.1, gd, segs=5, smooth=False, pat=PT['metal'])
    ngon_frustum(mb, 8, rhand.z + 0.7, rhand.z + 1.15, 0.14, 0.38, g, PT['metal'], cx=rhand.x, cy=rhand.y, smooth=True)
    ls = B - s * 0.82 + up * (sh - B.z + 0.1)
    lelb = ls - s * 0.18 - up * 0.95 + f * 0.1
    lhand = lelb - s * 0.05 + f * 0.55 + up * 0.25
    rod(mb, ls, lelb, 0.21, g, segs=5, r2=0.17, smooth=True, pat=PT['metal'])
    rod(mb, lelb, lhand, 0.17, g, segs=5, r2=0.14, smooth=True, pat=PT['metal'])
    sp = Vector((lhand.x, lhand.y, B.z + 0.45))
    rod(mb, sp, Vector((lhand.x, lhand.y, lhand.z + 1.5)), 0.07, gd, segs=4, smooth=False, pat=PT['metal'])
    ngon_frustum(mb, 6, lhand.z + 1.5, lhand.z + 1.9, 0.2, 0.02, g, PT['metal'], cx=lhand.x, cy=lhand.y)
    return rhand + up * 1.15


def mirror_parts2():
    """The bronze mirror in the 'mirror' node's frame (origin on the pivot axis at MIRROR_Z, beam along -Y): a
    concave disc R 2.5 m centred 0.5 m above the pivot (level with the flames), 3.0 m behind the fire, a broad gilt
    rim (the day glint that carries at heart) and a yoke down to the lantern floor clear of the column bases. The
    runtime tilts the node 0.3 rad when the fire is banked: the lip still clears the coffered ceiling (91.65 m) and
    the pivot ring (export.py asserts both poses)."""
    D = MB(seed=21); F = MB(seed=22)
    R, back, depth, zc = 2.5, 3.0, 0.5, 0.5
    n, rings = 24, 4
    grid = []
    for i in range(rings + 1):
        rr = R * i / rings
        sag = depth * (rr / R) ** 2
        grid.append([Vector((rr * math.cos(TAU * k / n), back + depth - sag, zc + rr * math.sin(TAU * k / n))) for k in range(n if i else 1)])
    ids = [[D.vert(p) for p in row] for row in grid]
    uvf = lambda p: ((p.x / R) * 0.5 + 0.5, ((p.z - zc) / R) * 0.5 + 0.5)
    for k in range(n):
        k2 = (k + 1) % n
        D.face([ids[0][0], ids[1][k2], ids[1][k]], P['mirror'], PT['metal'], uv=[uvf(grid[0][0]), uvf(grid[1][k2]), uvf(grid[1][k])], smooth=True)
        for i in range(1, rings):
            q = [(i, k), (i, k2), (i + 1, k2), (i + 1, k)]
            D.face([ids[a][b] for a, b in q][::-1], P['mirror'], PT['metal'], uv=[uvf(grid[a][b]) for a, b in q][::-1], smooth=True)
    ring = lambda r, y: [Vector((r * math.cos(TAU * k / n), y, zc + r * math.sin(TAU * k / n))) for k in range(n)]
    A = [F.vert(p) for p in ring(R, back)]
    B = [F.vert(p) for p in ring(R * 1.04, back + depth + 0.25)]
    cb = F.vert(Vector((0, back + depth + 0.8, zc)))
    for k in range(n):
        k2 = (k + 1) % n
        F.face([A[k], A[k2], B[k2], B[k]], P['bronze'], PT['metal'])
        F.face([B[k], B[k2], cb], P['bronze_dark'], PT['metal'])
    lip_o = [F.vert(p) for p in ring(R * 1.13, back - 0.05)]
    lip_b = [F.vert(p) for p in ring(R * 1.13, back + 0.18)]
    for k in range(n):                       # the gilt rim: a broad lip in front of the disc edge and its outer band
        k2 = (k + 1) % n
        F.face([A[k2], A[k], lip_o[k], lip_o[k2]], P2['gilt2'], PT['metal'])
        F.face([lip_o[k2], lip_o[k], lip_b[k], lip_b[k2]], P2['gilt2'], PT['metal'])
    zb = Z_GAL + 0.12 - MIRROR_Z
    for sd in (-1, 1):
        rod(F, (sd * 2.45, back - 0.2, zb), (sd * 2.95, back + 0.2, zc), 0.15, P['bronze_dark'], segs=4, smooth=False, pat=PT['metal'])
    rod(F, (-2.45, back - 0.2, zb), (2.45, back - 0.2, zb), 0.17, P['bronze_dark'], segs=4, smooth=False, pat=PT['metal'])
    rod(F, (0, back - 0.2, zb), (0, 0.6, zb + 0.05), 0.2, P['bronze_dark'], segs=4, smooth=False, pat=PT['metal'])
    rod(F, Vector((0, back + depth + 0.65, zc)), Vector((0, back + depth + 0.95, zc)), 0.62, P['gilt'], segs=8, cap=True, smooth=False, pat=PT['metal'])
    return D, F


def build(coll=None):
    """Build the whole Pharos v2 under an empty 'pharos'. Returns (root, info)."""
    import random
    rng = random.Random(7)
    ensure_export_materials()
    for nm in ('hb_window', 'hb_fire', 'hb_mirror'):
        material(nm)
    root = empty('pharos', (0, 0, 0), coll=coll)
    S, W = MB(seed=11), MB(seed=12)
    counts = {}

    def mark(name):
        counts[name] = S.tris() - sum(counts.values())
    v1_platform(S); mark('platform')
    tier1(S, W, rng); mark('tier1')
    yface = portal(S); mark('portal')
    zt = cornice1(S); mark('cornice1')
    ped, zp = terrace1(S, zt); mark('terrace1')
    for sx in (-1, 1):
        for sy in (-1, 1):
            # the corner facing the camera turns its conch out to the open sea (screen-left) so it reads in profile;
            # the silhouette corners already show theirs side-on
            figure_triton2(S, (sx * ped, sy * ped, zp), (sx, sy, 0), turn=-1.1 if (sx, sy) == (1, -1) else 0.0)
    mark('tritons')
    for sx in (-1, 1):
        figure_pharaoh(S, (sx * 9.8, -PLAT + 8.5, 0.0), (0, -1, 0), scale=1.5)
    mark('pharaohs')
    zt2 = octagon(S, W, rng, zt); mark('octagon')
    zg = drum(S, W, rng, zt2); mark('drum')
    dome_top = lantern(S); mark('lantern')
    to_object(S, 'tower', 'hb_opaque', parent=root, coll=coll)
    to_object(W, 'tower_windows', 'hb_window', parent=root, coll=coll)
    Sm = MB(seed=31)
    hand = figure_helios2(Sm, (0, 0, 0))
    SC = 1.45
    for i, v in enumerate(Sm.v):
        Sm.v[i] = Sm.vf[i] = Vector((v.x * SC, v.y * SC, v.z * SC + dome_top))
    hand = Vector((hand.x * SC, hand.y * SC, hand.z * SC + dome_top))
    to_object(Sm, 'statue', 'hb_opaque', parent=root, coll=coll)
    Fm = MB(seed=41)
    zb = Z_GAL + 1.95
    nf = 12
    rim = [Fm.vert((1.9 * math.cos(TAU * k / nf), 1.9 * math.sin(TAU * k / nf), zb)) for k in range(nf)]
    mid = [Fm.vert((1.1 * math.cos(TAU * (k + 0.5) / nf), 1.2 * math.sin(TAU * (k + 0.5) / nf), zb + 0.55 + 0.2 * rng.random())) for k in range(nf)]
    top = Fm.vert((0, 0, zb + 0.95))
    for k in range(nf):
        k2 = (k + 1) % nf
        Fm.face([rim[k], rim[k2], mid[k]], P['ember'], 0)
        Fm.face([mid[k], rim[k2], mid[k2]], P['ember'], 0)
        Fm.face([mid[k], mid[k2], top], P['ember'], 0)
    to_object(Fm, 'fire_core', 'hb_fire', parent=root, coll=coll)
    mir = empty('mirror', (0, 0, MIRROR_Z), parent=root, coll=coll)
    D, F = mirror_parts2()
    to_object(D, 'mirror_disc', 'hb_mirror', parent=mir, coll=coll)
    to_object(F, 'mirror_frame', 'hb_opaque', parent=mir, coll=coll)
    empty('fire_emitter', (0, 0, zb + 0.6), parent=root, coll=coll)
    empty('lantern', (0, 0, FIRE_Z), parent=root, coll=coll)
    empty('smoke_emitter', (0, 0, dome_top - 1.0), parent=root, coll=coll)
    empty('door', (0, yface - 3.0, DOOR_Z), parent=root, coll=coll)
    empty('causeway_gate', (0, -PLAT, 0.0), parent=root, coll=coll)
    info = dict(Z_T1TOP=zt, Z_T2TOP=zt2, Z_GAL=zg, DOME_TOP=dome_top, yface=yface, hand_z=hand.z, fire_z=FIRE_Z,
                mirror_z=MIRROR_Z, platform=PLAT * 2, podium=PODIUM, triton_z=(zp, zp + 2.95 * 2.3, zp + 5.7 * 2.3), version=VERSION)
    info.update({'tris_' + k: v for k, v in counts.items()})
    return root, info


def v1_platform(S):
    """v1's platform, unchanged: a battered podium, the pavement, a parapet with corner piers and the causeway gap."""
    lime, marble = P['lime'], P['marble']
    ngon_frustum(S, 4, -PODIUM, -0.6, (PLAT + 2.2) * math.sqrt(2), (PLAT + 0.4) * math.sqrt(2), P['lime_podium'], PT['ashlar'], rot=math.pi / 4, top=False, bot=True)
    v1.sq_moulding(S, -0.6, [(0.6, PLAT + 0.6, PLAT + 0.6)], P['lime_dark'], PT['plain'])
    quad(S, (-PLAT, -PLAT, 0.02), (PLAT, -PLAT, 0.02), (PLAT, PLAT, 0.02), (-PLAT, PLAT, 0.02), P['paving'], PT['cobble'])
    PH, PT_ = 1.5, 0.9
    gap = 6.0
    for k in range(4):
        d, t = face_frame(k)
        segs = [(-PLAT, -gap), (gap, PLAT)] if k == 0 else [(-PLAT, PLAT)]
        for u0, u1 in segs:
            c = d * (PLAT - PT_ / 2) + t * ((u0 + u1) / 2) + Vector((0, 0, PH / 2))
            ax = (t, d, Vector((0, 0, 1)))
            box(S, c, (u1 - u0 - (0.4 if k else 0), PT_, PH), lime, PT['ashlar'], axes=ax)
            cc = d * (PLAT - PT_ / 2 + 0.12) + t * ((u0 + u1) / 2) + Vector((0, 0, PH + 0.12))
            box(S, cc, (u1 - u0, PT_ + 0.36, 0.24), marble, PT['plain'], axes=ax)
        if k == 0:
            for s in (-1, 1):
                c = d * (PLAT - 1.0) + t * (s * (gap + 1.0)) + Vector((0, 0, 1.6))
                box(S, c, (2.0, 2.0, 3.2), lime, PT['ashlar'], axes=(t, d, Vector((0, 0, 1))))
                box(S, c + Vector((0, 0, 1.75)), (2.4, 2.4, 0.3), marble, PT['plain'], axes=(t, d, Vector((0, 0, 1))))
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = Vector((sx * (PLAT - 1.6), sy * (PLAT - 1.6), 0))
            box2(S, c.x - 1.6, c.y - 1.6, 0, c.x + 1.6, c.y + 1.6, 3.4, lime, PT['ashlar'])
            box2(S, c.x - 1.9, c.y - 1.9, 3.4, c.x + 1.9, c.y + 1.9, 3.8, marble, PT['plain'])
            box2(S, c.x - 1.2, c.y - 1.2, 3.8, c.x + 1.2, c.y + 1.2, 4.3, marble, PT['plain'])


def stats(root):
    return v1.stats(root)
