"""The Pharos of Alexandria, v2 (E18 / O6-I4: a monument, not an office tower) - geometry.

Same contract as pharos_geo.py (v1, still buildable: export.py -- --v1): the node names, the beam pivot ('mirror',
MIRROR_Z 87.4), the lantern (FIRE_Z 88.2, the beam origin), the emitters, the gallery floor (Z_GAL 85.0), the 64 m
platform, the pharaohs, the dome and the statue's top are unchanged. The stack below the gallery keeps v2's
re-proportioned silhouette (tier 1 ends at 42 m, octagon 48.5-71 m, drum 9.5 m) enriched with Alexandrian craft:

    courtyard 64 m platform with tone-on-tone limestone/travertine opus sectile paving (close in value to limestone),
              4 bronze ceremonial courtyard braziers (courtyard_embers hb_emissive + brazier_0..3 empties),
              carved marble exedrae benches, muted terracotta amphorae, merlon parapet coping, gate pylons & corner urns
    portal    distyle-in-antis entrance built into tier 1's recessed front bay (fluted limestone columns, studded dark
              bronze double doors, dentil frieze, Egyptian cavetto hood tucked under the 15.4 m string course) up a
              9-step ceremonial limestone ramp flanked by sculpted Ptolemaic royal colossi on stone pedestals
    tier 1    square, battered (half 15.0 -> 12.7) 2.6 -> 42.0 m: drafted corner quoins, two string courses, one
              recessed bay per visible face with plain openings in 0.4 m reveals
    cornice   Egyptian cavetto over a dentil frieze; first terrace at ~46 m
    tritons   four sculpted bronze tritons (2.3x) on corner pedestals blowing gilt conches, rounded deltoid shoulders,
              coiled tails rising behind into forked flukes; camera-facing corner turns its conch out to sea
    tier 2    octagon 48.5 -> 71.0 m: corner pilasters with capitals/bases, string course, windows in reveals, cavetto + dentils
    tier 3    drum 9.5 m (74.1 -> 83.6) with engaged pilasters (capitals/bases), windows in reveals, gallery dentil cornice
    lantern   8 fluted Corinthian tholos columns with gilt bell capitals, dentiled entablature, palmette antefixes,
              ribbed cupola dome with 8 bold gilded ribs & lotus collar, brazier, larger R 2.5 m gilt-rimmed mirror
    statue    refined gilded Helios (fluted chiton, rounded shoulders, 3D 11-ray radiate crown, sculpted torch & sceptre,
              no cloak quad)
    value     warm-foot to pale-marble-crown ladder in vertex colour (+ E15's AO bake: pharos_bake.py)

The craft follows the fixed diorama camera (yaw 45, pitch 26-30: it sees the front -Y and +X faces and three corners):
the hidden +Y/-X faces stay plain masonry, closed so the sun's shadow keeps the whole tower.
Blender units = metres, Z up, origin = the platform centre at pavement level, FRONT (door, ramp) = -Y.
"""
import math
from mathutils import Vector
from hb_lib import MB, box as _hb_box, box2, rod, lin, to_object, empty, ensure_export_materials, material
import pharos_geo as v1
from pharos_geo import (ngon_frustum, moulding, quad, face_frame, P, PT, TAU,
                        PLAT, PODIUM, LAN_Z1, LAN_R, DOME_Z0, FIRE_Z, MIRROR_Z, DOOR_Z)


def box(mb, c, size, col, pat=0, axes=None, **kw):
    """Right-handed guard over hb_lib.box: guarantees outward face normals (crucial for Cycles AO bake)."""
    if axes is not None:
        det = axes[0].cross(axes[1]).dot(axes[2])
        assert det > 0.0, f"Left-handed box axes (det={det:.3f}) invert face normals"
    return _hb_box(mb, c, size, col, pat, axes=axes, **kw)

VERSION = 2
# v2 stone ladder (sRGB): warm foot -> pale crown (runtime limewash prints plain/ashlar x1.06).
# Courtyard tones stay close in value to limestone (#D4C8AE) so paving & plinths read as texture, not pattern.
# Metal colours satisfy src/harbour/world/metal.ts hbMetalKind (1=gilt, 2=antique bronze, 3=verdigris patina).
HEX2 = {
    'plinth': '#C9BB9C', 'field1': '#DACEB3', 'field2': '#DFD4BB', 'field3': '#E3D9C2', 'bay': '#E2D8C2',
    'quoin': '#EBE3D2', 'trim': '#F0EBE0', 'gorge': '#E7DFCC', 'oct': '#E6DDCA', 'oct_pil': '#EEE7D8',
    'drum': '#EAE3D3', 'drum_pil': '#F0EADD', 'reveal': '#CFC3A8', 'sill': '#F2EEE5', 'portal': '#EFE9DC',
    # Restrained courtyard & plinth tones (warm limestone / travertine / sandstone — no loud porphyry or slate)
    'pav_light': '#E2D9C4', 'pav_mid': '#DBD1BA', 'pav_band': '#CFC3A7', 'pav_panel': '#D2C6AC',
    'terracotta': '#A66D50',
    # Metals tuned for metal.ts (gilt survives metal AO > 0.60 linear R; bronze warm; verdigris green-teal)
    'bronze_v': '#58806F', 'bronze_t': '#4C6E61', 'bronze_vl': '#6B9483',
    'bronze': '#A87038', 'bronze_aged': '#825228', 'bronze_dark': '#54351A',
    'gilt2': '#E4B64A', 'gilt_bright': '#EBC056', 'gilt_deep': '#BA8632',
    'coal_ember': '#B54214',
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
# 4 ceremonial courtyard braziers framing the 64x64 m plaza quadrants
BRAZIER_XY = ((-23.8, -23.8), (23.8, -23.8), (23.8, 23.8), (-23.8, 23.8))


def h1(z):
    return T1_H0 + (T1_H1 - T1_H0) * (z - T1_Z0) / (T1_Z1 - T1_Z0)


def r2(z):
    return T2_R0 + (T2_R1 - T2_R0) * (z - T2_Z0) / (T2_Z1 - T2_Z0)


def t1p(k, u, z, e=0.0):
    """Point on tier-1 face k at lateral offset u (m, + = right seen from outside), height z, raised e (m)."""
    d, t = face_frame(k)
    return d * (h1(z) + e) + t * u + Vector((0, 0, z))


def sq_ring(mb, z, steps, col, pat=PT['plain'], hfn=h1):
    """Square mouldings that follow the batter: steps = [(dz, out0, out1)]. Returns the top z."""
    for dz, a, b in steps:
        r0, r1 = (hfn(z) + a) * math.sqrt(2), (hfn(z + dz) + b) * math.sqrt(2)
        ngon_frustum(mb, 4, z, z + dz, r0, r1, col, pat, rot=math.pi / 4, top=True, bot=True)
        z += dz
    return z


def sq_steps(mb, z, steps, col, pat=PT['plain'], cx=0.0, cy=0.0, keep_bot=False):
    """Triangle-lean stacked square mouldings at (cx, cy); drops buried internal caps."""
    for idx, (dz, a, b) in enumerate(steps):
        prev_r = steps[idx - 1][2] if idx > 0 else 0.0
        next_r = steps[idx + 1][1] if idx + 1 < len(steps) else 0.0
        need_bot = keep_bot if idx == 0 else (a > prev_r + 1e-3)
        need_top = True if idx == len(steps) - 1 else (b > next_r + 1e-3)
        ngon_frustum(mb, 4, z, z + dz, a * math.sqrt(2), b * math.sqrt(2), col, pat,
                     rot=math.pi / 4, top=need_top, bot=need_bot, cx=cx, cy=cy)
        z += dz
    return z


def ngon_ring(mb, n, z0, z1, ro, ri, col, pat=0, rot=0.0, cx=0.0, cy=0.0, bot=True):
    """Thick n-gon annulus centred at (cx, cy): outer wall, inner wall, top, optional bottom."""
    def ring(r, z):
        return [mb.vert((cx + r * math.cos(rot + TAU * k / n), cy + r * math.sin(rot + TAU * k / n), z)) for k in range(n)]
    Ao, Bo, Ai, Bi = ring(ro, z0), ring(ro, z1), ring(ri, z0), ring(ri, z1)
    for k in range(n):
        k2 = (k + 1) % n
        mb.face((Ao[k], Ao[k2], Bo[k2], Bo[k]), col, pat)
        mb.face((Ai[k2], Ai[k], Bi[k], Bi[k2]), col, pat)
        mb.face((Bo[k], Bo[k2], Bi[k2], Bi[k]), col, pat)
        if bot:
            mb.face((Ao[k2], Ao[k], Ai[k], Ai[k2]), col, pat)


def lathe_z(mb, cx, cy, prof, col, pat=0, segs=6, smooth=True, cap_top=False, cap_bot=False, rot=0.0, cols=None):
    """Surface of revolution about vertical axis (cx, cy). prof = [(r, z), ...] bottom -> top."""
    rings = []
    for (r, z) in prof:
        if r < 1e-4:
            rings.append([mb.vert((cx, cy, z))] * segs)
        else:
            rings.append([mb.vert((cx + r * math.cos(rot + TAU * k / segs),
                                   cy + r * math.sin(rot + TAU * k / segs), z)) for k in range(segs)])
    for i in range(len(rings) - 1):
        cc = cols[i] if cols else col
        for k in range(segs):
            k2 = (k + 1) % segs
            mb.face((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]), cc, pat, smooth=smooth)
    if cap_top and prof[-1][0] > 1e-4:
        mb.face(rings[-1], cols[-1] if cols else col, pat)
    if cap_bot and prof[0][0] > 1e-4:
        mb.face(rings[0][::-1], cols[0] if cols else col, pat)


def flat_quad(mb, x0, y0, x1, y1, z, col, pat=0):
    """Flush top-only paving quad (2 tris, zero buried sides)."""
    quad(mb, (x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), col, pat)


def palmette_acroterion(mb, c, fwd, h=0.85, col=None, pat=None, base_col=None):
    """Lean 3D sculpted classical palmette acroterion (~18 tris)."""
    c = Vector(c)
    f = Vector(fwd).normalized()
    t = Vector((-f.y, f.x, 0.0)).normalized()
    up = Vector((0, 0, 1))
    col = col or P2['trim']
    pat = PT['plain'] if pat is None else pat
    box(mb, c + up * (h * 0.09), (h * 0.54, h * 0.34, h * 0.18), base_col or P2['trim'], PT['plain'], axes=(-t, f, up), skip=('-z',))
    z0 = h * 0.18
    w, d = h * 0.40, h * 0.11
    pts_f = [c + up * z0 - t * (w * 0.55) + f * d, c + up * z0 + t * (w * 0.55) + f * d,
             c + up * (z0 + h * 0.32) + t * w + f * (d * 0.8), c + up * (z0 + h * 0.86) + f * (d * 0.35),
             c + up * (z0 + h * 0.32) - t * w + f * (d * 0.8)]
    pts_b = [p - f * (2 * d if i < 2 else (1.5 * d if i in (2, 4) else 0.7 * d)) for i, p in enumerate(pts_f)]
    fi = [mb.vert(p) for p in pts_f]
    bi = [mb.vert(p) for p in pts_b]
    mb.face(fi, col, pat)
    mb.face(bi[::-1], col, pat)
    for k in range(len(fi)):
        k2 = (k + 1) % len(fi)
        mb.face((fi[k], bi[k], bi[k2], fi[k2]), col, pat)


def classical_urn(mb, cx, cy, z0, scale=1.0, col_body=None, col_trim=None, pat_body=PT['plain'], pat_trim=PT['metal'], segs=5):
    """Lean Ptolemaic krater urn on a moulded foot, with twin handles."""
    s = scale
    cb = col_body or P2['pav_light']
    ct = col_trim or P2['bronze']
    prof = [
        (0.32 * s, z0),
        (0.18 * s, z0 + 0.22 * s),
        (0.45 * s, z0 + 0.78 * s),
        (0.22 * s, z0 + 1.24 * s),
        (0.35 * s, z0 + 1.52 * s),
        (0.0, z0 + 1.68 * s),
    ]
    lathe_z(mb, cx, cy, prof, cb, pat_body, segs=segs, smooth=True, cols=[ct, cb, cb, ct, ct])
    for sd in (-1, 1):
        rod(mb, (cx + sd * 0.44 * s, cy, z0 + 0.86 * s), (cx + sd * 0.26 * s, cy, z0 + 1.44 * s),
            0.055 * s, ct, segs=3, pat=pat_trim, smooth=False)


def classical_amphora(mb, cx, cy, z0, scale=1.0, col=None):
    """Lean muted-terracotta Alexandrian amphora on a small square stone plinth."""
    s = scale
    col = col or P2['terracotta']
    box2(mb, cx - 0.36 * s, cy - 0.36 * s, z0, cx + 0.36 * s, cy + 0.36 * s, z0 + 0.22 * s, P2['plinth'], PT['ashlar'], skip=('-z',))
    z = z0 + 0.22 * s
    prof = [
        (0.14 * s, z),
        (0.38 * s, z + 0.62 * s),
        (0.16 * s, z + 1.12 * s),
        (0.20 * s, z + 1.42 * s),
        (0.0, z + 1.44 * s),
    ]
    lathe_z(mb, cx, cy, prof, col, PT['plain'], segs=5, smooth=True)


def cavetto(z0, r0, flare, height, n=4):
    """An Egyptian gorge as moulding steps: a quarter-circle cove from vertical (bottom) to flat (top)."""
    pts = [(r0 + flare * (1 - math.cos(i / n * math.pi / 2)), z0 + height * math.sin(i / n * math.pi / 2)) for i in range(n + 1)]
    return [(pts[i + 1][1] - pts[i][1], pts[i][0], pts[i + 1][0]) for i in range(n)]


def opening(S, W, pt, z0, z1, uc, hw, depth, rng, sill=True, kind=1.0):
    """A plain opening (hb_window kind 1: no glass, a deep warm reveal) in a wall described by pt(u, z, e)."""
    a0, b0, a1, b1 = pt(uc - hw, z0, 0), pt(uc + hw, z0, 0), pt(uc - hw, z1, 0), pt(uc + hw, z1, 0)
    A0, B0, A1, B1 = pt(uc - hw, z0, -depth), pt(uc + hw, z0, -depth), pt(uc - hw, z1, -depth), pt(uc + hw, z1, -depth)
    rv = P2['reveal']
    quad(S, a0, A0, A1, a1, rv, PT['plain'])
    quad(S, B0, b0, b1, B1, rv, PT['plain'])
    quad(S, a0, b0, B0, A0, rv, PT['plain'])
    quad(S, A1, B1, b1, a1, rv, PT['plain'])
    col = (0.55 + 0.45 * rng.random(), rng.random(), kind)
    quad(W, A0, B0, B1, A1, col)
    if sill:
        c0, c1 = pt(uc - hw - 0.25, z0 - 0.2, 0), pt(uc + hw + 0.25, z0 - 0.2, 0)
        c2, c3 = pt(uc + hw + 0.25, z0, 0), pt(uc - hw - 0.25, z0, 0)
        C0, C1 = pt(uc - hw - 0.25, z0 - 0.2, 0.22), pt(uc + hw + 0.25, z0 - 0.2, 0.22)
        C2, C3 = pt(uc + hw + 0.25, z0, 0.22), pt(uc - hw - 0.25, z0, 0.22)
        sc = P2['sill']
        quad(S, C0, C1, C2, C3, sc, PT['plain'])
        quad(S, C3, C2, c2, c3, sc, PT['plain'])
        quad(S, c0, C0, C3, c3, sc, PT['plain'])
        quad(S, C1, c1, c2, C2, sc, PT['plain'])


def wall_with_openings(S, pt, u0, u1, z0, z1, holes, col, pat, rows=()):
    """A wall panel u0..u1 x z0..z1 with rectangular holes stacked in one column, split into quads."""
    if holes:
        uc, hw = holes[0][0], holes[0][1]
        cuts = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes], *[r for r in rows if z0 < r < z1]})
    else:
        cuts = sorted({z0, z1, *[r for r in rows if z0 < r < z1]})
    for za, zb in zip(cuts, cuts[1:]):
        hole = any(h[2] <= za and zb <= h[3] for h in holes)
        spans = [(u0, uc - hw), (uc + hw, u1)] if hole else [(u0, u1)]
        for ua, ub in spans:
            if ub - ua > 1e-4:
                quad(S, pt(ua, za, 0), pt(ub, za, 0), pt(ub, zb, 0), pt(ua, zb, 0), col, pat)


# ------------------------------------------------------------------ courtyard: paving, braziers, exedrae, parapet
def build_courtyard_paving(S):
    """Tone-on-tone Alexandrian limestone & travertine paving across the 64x64 m plaza.
    All values sit close to the base limestone so it reads as refined stone texture at heart distance, not pattern."""
    flat_quad(S, -PLAT, -PLAT, PLAT, PLAT, 0.01, P['paving'], PT['cobble'])

    # Outer promenade flags inside the parapet + subtle cut-sandstone curb band
    B0, B1 = 27.5, 31.1
    for (x0, y0, x1, y1) in ((-B1, -B1, B1, -B0), (-B1, B0, B1, B1), (-B1, -B0, -B0, B0), (B0, -B0, B1, B0)):
        flat_quad(S, x0, y0, x1, y1, 0.032, P2['pav_mid'], PT['ashlar'])
    G0, G1 = 27.0, 27.5
    for (x0, y0, x1, y1) in ((-G1, -G1, G1, -G0), (-G1, G0, G1, G1), (-G1, -G0, -G0, G0), (G0, -G0, G1, G0)):
        flat_quad(S, x0, y0, x1, y1, 0.044, P2['pav_band'], PT['plain'])

    # Inner dressed travertine apron hugging the tower plinth (17.2..20.2) + gentle stone curb
    A0, A1 = 17.2, 20.2
    for (x0, y0, x1, y1) in ((-A1, -A1, A1, -A0), (-A1, A0, A1, A1), (-A1, -A0, -A0, A0), (A0, -A0, A1, A0)):
        flat_quad(S, x0, y0, x1, y1, 0.038, P2['pav_light'], PT['ashlar'])
    D0, D1 = 20.2, 20.65
    for (x0, y0, x1, y1) in ((-D1, -D1, D1, -D0), (-D1, D0, D1, D1), (-D1, -D0, -D0, D0), (D0, -D0, D1, D0)):
        flat_quad(S, x0, y0, x1, y1, 0.048, P2['pav_band'], PT['plain'])

    # 4 Cardinal processional travertine runners + subtle limestone edge strips
    W_BAND = 2.8
    for (x0, y0, x1, y1) in (
        (-W_BAND, -PLAT + 0.1, W_BAND, -20.65),
        (-W_BAND, 20.65, W_BAND, 27.0),
        (-27.0, -W_BAND, -20.65, W_BAND),
        (20.65, -W_BAND, 27.0, W_BAND),
    ):
        flat_quad(S, x0, y0, x1, y1, 0.052, P2['pav_light'], PT['ashlar'])
    for s in (-1, 1):
        xa, xb = (s * W_BAND - 0.35, s * W_BAND) if s > 0 else (s * W_BAND, s * W_BAND + 0.35)
        flat_quad(S, xa, -PLAT + 0.1, xb, -20.65, 0.060, P2['pav_band'], PT['plain'])
        flat_quad(S, 20.65, xa, 27.0, xb, 0.060, P2['pav_band'], PT['plain'])

    # Inset stone carpet panels in the visible East & West bays
    for (x0, y0, x1, y1) in (
        (21.6, -19.2, 26.0, -4.4), (21.6, 4.4, 26.0, 19.2),
        (-26.0, -19.2, -21.6, -4.4), (-26.0, 4.4, -21.6, 19.2),
    ):
        flat_quad(S, x0, y0, x1, y1, 0.036, P2['pav_band'], PT['plain'])
        flat_quad(S, x0 + 0.42, y0 + 0.42, x1 - 0.42, y1 - 0.42, 0.048, P2['pav_mid'], PT['ashlar'])

    # Subtle diagonal travertine sightline bands connecting tower corners -> brazier daises -> corner piers
    for sx, sy in ((-1, -1), (1, -1), (1, 1)):
        d = Vector((sx, sy, 0)).normalized()
        t = Vector((-d.y, d.x, 0))
        c = d * 34.0 + Vector((0, 0, 0.035))
        box(S, c, (12.0, 1.25, 0.04), P2['pav_light'], PT['plain'], axes=(d, t, Vector((0, 0, 1))), skip=('-z',))


def build_courtyard_brazier(S, CE, cx, cy, rng, lean=False):
    """Monumental Alexandrian bronze ceremonial brazier on a carved limestone pedestal & octagonal stone dais.
    Recessed dark charcoal ember bed uses hb_emissive (CE — never hb_fire!). Returns ember-top height z."""
    rot8 = math.pi / 8
    ngon_frustum(S, 8, 0.01, 0.08, 3.65, 3.58, P2['pav_band'], PT['plain'], rot=rot8, cx=cx, cy=cy)
    ngon_frustum(S, 8, 0.08, 0.14, 3.15, 3.08, P2['pav_light'], PT['ashlar'], rot=rot8, cx=cx, cy=cy)

    # Stepped carved limestone & marble pedestal (z = 0.14 .. 2.26) — flush proud stone panel quads (clean Cycles AO)
    z = sq_steps(S, 0.14, [(0.32, 1.48, 1.44), (0.22, 1.28, 1.20)], P2['plinth'], PT['ashlar'], cx=cx, cy=cy)
    box2(S, cx - 0.94, cy - 0.94, z, cx + 0.94, cy + 0.94, 1.88, P2['field1'], PT['ashlar'], skip=('-z', '+z'))
    if not lean:
        for k in VISIBLE:
            d, t = face_frame(k)
            c = Vector((cx, cy, 1.28)) + d * 0.965
            up = Vector((0, 0, 1))
            quad(S, c - t * 0.56 - up * 0.36, c + t * 0.56 - up * 0.36,
                 c + t * 0.56 + up * 0.36, c - t * 0.56 + up * 0.36, P2['pav_panel'], PT['plain'])
            quad(S, c + d * 0.02 - t * 0.13 - up * 0.13, c + d * 0.02 + t * 0.13 - up * 0.13,
                 c + d * 0.02 + t * 0.13 + up * 0.13, c + d * 0.02 - t * 0.13 + up * 0.13, P2['bronze'], PT['metal'])
    z = sq_steps(S, 1.88, [(0.18, 1.04, 1.22), (0.20, 1.22, 1.02)], P2['trim'], PT['plain'], cx=cx, cy=cy)
    ngon_frustum(S, 6 if lean else 8, z, z + 0.14, 1.00, 0.94, P2['bronze_dark'], PT['metal'], rot=rot8, cx=cx, cy=cy)
    zb = z + 0.14

    # Aged-bronze central baluster + 3 splayed tripod legs (simplified on unseen back-left corner)
    lathe_z(S, cx, cy, [(0.40, zb), (0.22, zb + 0.40), (0.46, zb + 0.78)], P2['bronze_dark'], PT['metal'], segs=5 if lean else 6, smooth=True)
    if not lean:
        for k in range(3):
            a = TAU * k / 3 + math.pi / 6
            dv = Vector((math.cos(a), math.sin(a), 0))
            p_foot = Vector((cx, cy, zb)) + dv * 0.86
            p_knee = Vector((cx, cy, zb + 0.54)) + dv * 0.66
            p_rim = Vector((cx, cy, zb + 1.20)) + dv * 1.28
            ngon_frustum(S, 4, zb, zb + 0.18, 0.20, 0.15, P2['bronze_aged'], PT['metal'], cx=p_foot.x, cy=p_foot.y)
            rod(S, p_foot + Vector((0, 0, 0.14)), p_knee, 0.12, P2['bronze_dark'], segs=3, r2=0.11, pat=PT['metal'], smooth=False)
            rod(S, p_knee, p_rim, 0.11, P2['bronze_aged'], segs=3, r2=0.13, pat=PT['metal'], smooth=False)
        ngon_ring(S, 6, zb + 0.48, zb + 0.58, 0.74, 0.60, P2['bronze'], PT['metal'], cx=cx, cy=cy, bot=False)

    # Dark aged-bronze fire cauldron with deep walls & flared rim (crisp silhouette day & night)
    bowl_z = zb + 0.70
    n_b = 6 if lean else 8
    lathe_z(S, cx, cy, [
        (0.44, bowl_z), (1.06, bowl_z + 0.24), (1.44, bowl_z + 0.64), (1.54, bowl_z + 0.86)
    ], P2['bronze_aged'], PT['metal'], segs=n_b, smooth=True, cap_bot=False,
        cols=[P2['bronze_dark'], P2['bronze_aged'], P2['bronze_dark']])
    ngon_ring(S, n_b, bowl_z + 0.84, bowl_z + 1.02, 1.60, 1.22, P2['bronze_dark'], PT['metal'], cx=cx, cy=cy)
    if not lean:
        ngon_frustum(S, n_b, bowl_z + 0.74, bowl_z + 0.84, 1.48, 1.54, P2['bronze'], PT['metal'], cx=cx, cy=cy, top=False)

    # Deeply recessed charred-coal ember bed tucked inside the bronze rim (hb_emissive)
    ez = bowl_z + 0.70
    n = 6 if lean else 8
    rim = [CE.vert((cx + 1.20 * math.cos(TAU * k / n), cy + 1.20 * math.sin(TAU * k / n), ez)) for k in range(n)]
    mid = [CE.vert((cx + 0.64 * math.cos(TAU * (k + 0.5) / n), cy + 0.64 * math.sin(TAU * (k + 0.5) / n),
                    ez + 0.16 + 0.08 * rng.random())) for k in range(n)]
    top = CE.vert((cx, cy, ez + 0.28))
    for k in range(n):
        k2 = (k + 1) % n
        CE.face([rim[k], rim[k2], mid[k]], P2['coal_ember'], 0, jitter=0.04)
        CE.face([mid[k], rim[k2], mid[k2]], P2['coal_ember'], 0, jitter=0.04)
        CE.face([mid[k], mid[k2], top], P2['coal_ember'], 0, jitter=0.04)
    return bowl_z + 1.06


def build_courtyard_exedra(S, c, facing):
    """Carved limestone & marble courtyard exedra bench against the parapet, flanked by muted terracotta amphorae."""
    c = Vector(c)
    f = Vector(facing).normalized()
    t = Vector((-f.y, f.x, 0.0)).normalized()
    up = Vector((0, 0, 1))
    ax = (-t, f, up)
    box(S, c + up * 0.14, (7.4, 2.3, 0.28), P2['pav_light'], PT['ashlar'], axes=ax, skip=('-z',))
    for x in (-1.65, 1.65):
        box(S, c + t * x + f * 0.15 + up * 0.54, (0.38, 1.05, 0.52), P2['field1'], PT['ashlar'], axes=ax, skip=('-z', '+z', '-y'))
    box(S, c + f * 0.15 + up * 0.88, (6.2, 1.18, 0.20), P2['trim'], PT['plain'], axes=ax, skip=('-y',))
    box(S, c - f * 0.36 + up * 1.24, (6.0, 0.32, 0.64), P2['field1'], PT['ashlar'], axes=ax, skip=('-z', '+z'))
    box(S, c - f * 0.36 + up * 1.62, (6.3, 0.44, 0.16), P2['trim'], PT['plain'], axes=ax)
    for sd in (-1, 1):
        ep = c + t * (sd * 3.15) - f * 0.05
        box(S, ep + up * 0.90, (0.56, 1.16, 1.24), P2['trim'], PT['plain'], axes=ax, skip=('-z',))
        ngon_frustum(S, 4, 1.52, 1.82, 0.18, 0.05, P2['bronze'], PT['metal'], cx=ep.x, cy=ep.y)
        ap = c + t * (sd * 4.45) - f * 0.25
        classical_amphora(S, ap.x, ap.y, 0.04, scale=1.02)


def build_platform(S, CE, rng):
    """64 m battered podium, restrained Alexandrian paving, 4 bronze braziers, exedrae, amphorae & refined parapet."""
    lime, marble = P2['field1'], P2['trim']
    ngon_frustum(S, 4, -PODIUM, -0.7, (PLAT + 2.3) * math.sqrt(2), (PLAT + 0.45) * math.sqrt(2),
                 P['lime_podium'], PT['ashlar'], rot=math.pi / 4, top=False, bot=True)
    sq_steps(S, -0.7, [(0.45, PLAT + 0.65, PLAT + 0.72), (0.25, PLAT + 0.72, PLAT + 0.60)],
             P2['plinth'], PT['plain'], keep_bot=True)

    build_courtyard_paving(S)

    brazier_pos = []
    for bx, by in BRAZIER_XY:
        bz = build_courtyard_brazier(S, CE, bx, by, rng, lean=(bx < 0 and by > 0))
        brazier_pos.append((bx, by, bz))

    # Parapet walls with moulded coping, intermediate piers & spaced merlons on visible sides
    PH, PT_ = 1.5, 0.9
    gap = 6.0
    for k in range(4):
        d, t = face_frame(k)
        ax = (-t, d, Vector((0, 0, 1)))
        segs = [(-PLAT, -gap), (gap, PLAT)] if k == 0 else [(-PLAT, PLAT)]
        for u0, u1 in segs:
            L = u1 - u0
            um = (u0 + u1) / 2
            c = d * (PLAT - PT_ / 2) + t * um + Vector((0, 0, PH / 2))
            box(S, c, (L - (0.4 if k else 0), PT_, PH), lime, PT['ashlar'], axes=ax, skip=('-z', '+z'))
            cc = d * (PLAT - PT_ / 2 + 0.08) + t * um + Vector((0, 0, PH + 0.14))
            box(S, cc, (L, PT_ + 0.36, 0.28), marble, PT['plain'], axes=ax)
            # Intermediate piers & merlons only where the camera looks (front -Y, East +X, front half of West -X)
            if k in (0, 1, 3):
                pier_us = (-18.5,) if (k == 0 and u0 < 0) else ((18.5,) if k == 0 else ((-16.0, 0.0, 16.0) if k == 1 else (16.0,)))
                for pu in pier_us:
                    pc = d * (PLAT - PT_ / 2) + t * pu
                    box(S, pc + Vector((0, 0, PH / 2 + 0.12)), (1.32, PT_ + 0.40, PH + 0.24), lime, PT['ashlar'], axes=ax, skip=('-z', '+z'))
                    box(S, pc + Vector((0, 0, PH + 0.38)), (1.58, PT_ + 0.64, 0.28), marble, PT['plain'], axes=ax)
                n_mer = max(2, int((L - 5.0) / 6.2))
                for mi in range(n_mer):
                    mu = u0 + 3.0 + (L - 6.0) * (mi + 0.5) / n_mer
                    if k == 3 and mu < 0.0:   # skip unseen back half of West wall
                        continue
                    if any(abs(mu - pu) < 1.8 for pu in pier_us):
                        continue
                    if k == 0 and abs(mu) < gap + 2.8:
                        continue
                    # Seated cleanly ON TOP of coping (z = PH + 0.285..PH + 0.565) with zero buried corners for clean Cycles AO
                    mc = d * (PLAT - PT_ / 2 + 0.04) + t * mu + Vector((0, 0, PH + 0.425))
                    box(S, mc, (1.80, PT_ + 0.14, 0.28), marble, PT['plain'], axes=ax, skip=('-z',))

        if k == 0:
            # Monumental causeway gate pylons with clean proud stone panel quads & aged-bronze krater urns
            up = Vector((0, 0, 1))
            for s in (-1, 1):
                gc = d * (PLAT - 1.2) + t * (s * (gap + 1.3))
                box(S, gc + up * 0.28, (2.7, 2.7, 0.56), P2['plinth'], PT['ashlar'], axes=ax, skip=('-z',))
                box(S, gc + up * 2.10, (2.2, 2.2, 3.1), lime, PT['ashlar'], axes=ax, skip=('-z', '+z'))
                pc = gc + d * 1.13 + up * 2.15
                quad(S, pc - t * 0.62 - up * 0.85, pc + t * 0.62 - up * 0.85,
                     pc + t * 0.62 + up * 0.85, pc - t * 0.62 + up * 0.85, P2['pav_panel'], PT['plain'])
                box(S, gc + up * 3.78, (2.58, 2.58, 0.26), marble, PT['plain'], axes=ax)
                box(S, gc + up * 4.06, (2.1, 2.1, 0.30), P2['pav_light'], PT['plain'], axes=ax, skip=('-z',))
                classical_urn(S, gc.x, gc.y, 4.21, scale=0.84, col_body=P2['bronze_aged'], col_trim=P2['bronze'],
                              pat_body=PT['metal'], pat_trim=PT['metal'])

    # Corner piers: stepped caps + clean proud stone panel quads + marble/bronze krater urns on the 3 visible corners
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * (PLAT - 1.65), sy * (PLAT - 1.65)
            sq_steps(S, 0.0, [(0.52, 1.82, 1.78)], P2['plinth'], PT['ashlar'], cx=cx, cy=cy)
            box2(S, cx - 1.60, cy - 1.60, 0.52, cx + 1.60, cy + 1.60, 3.50, lime, PT['ashlar'], skip=('-z', '+z'))
            vis_corner = (sx, sy) != (-1, 1)
            if vis_corner:
                px = cx + sx * 1.63
                quad(S, (px, cy - 0.82, 1.32), (px, cy + 0.82, 1.32), (px, cy + 0.82, 2.90), (px, cy - 0.82, 2.90),
                     P2['pav_panel'], PT['plain']) if sx > 0 else \
                    quad(S, (px, cy + 0.82, 1.32), (px, cy - 0.82, 1.32), (px, cy - 0.82, 2.90), (px, cy + 0.82, 2.90),
                         P2['pav_panel'], PT['plain'])
                py = cy + sy * 1.63
                quad(S, (cx - 0.82, py, 1.32), (cx + 0.82, py, 1.32), (cx + 0.82, py, 2.90), (cx - 0.82, py, 2.90),
                     P2['pav_panel'], PT['plain']) if sy < 0 else \
                    quad(S, (cx + 0.82, py, 1.32), (cx - 0.82, py, 1.32), (cx - 0.82, py, 2.90), (cx + 0.82, py, 2.90),
                         P2['pav_panel'], PT['plain'])
            sq_steps(S, 3.50, [(0.24, 1.70, 1.94), (0.26, 1.94, 1.92), (0.34, 1.34, 1.22)], marble, PT['plain'], cx=cx, cy=cy)
            if vis_corner:
                classical_urn(S, cx, cy, 4.34, scale=1.0, col_body=P2['pav_light'], col_trim=P2['bronze'],
                              pat_body=PT['plain'], pat_trim=PT['metal'])

    # Carved marble exedra bench on the visible East flank (+X) + amphorae at the 3 visible tower-plinth corners
    build_courtyard_exedra(S, (28.3, 0.0, 0.02), (-1, 0, 0))
    for sx, sy in ((-1, -1), (1, -1), (1, 1)):
        classical_amphora(S, sx * 18.6, sy * 18.6, 0.04, scale=1.12)

    return brazier_pos


# ------------------------------------------------------------------ tier 1
def quoins(S):
    """Drafted corner quoins, alternating long/short along each face. The hidden back corner (faces 2/3) carries none."""
    n = 16
    qh = (T1_Z1 - T1_Z0) / n
    for k in (0, 1, 3):
        dk, _ = face_frame(k)
        dn, _ = face_frame((k + 1) % 4)
        for i in range(n):
            z0, z1 = T1_Z0 + i * qh, T1_Z0 + (i + 1) * qh - 0.06
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
            S.face([S.vert(p) for p in hi], col, PT['plain'])


def tier1(S, W, rng):
    rows = (3.6, 5.0, 8.0, 12.0, 20.0, 24.0, 33.0, 37.0, 40.4, 41.3)
    for k in range(4):
        pt = lambda u, z, e, k=k: t1p(k, u, z, e)
        if k not in VISIBLE:
            cuts = sorted({T1_Z0, T1_Z1, 4.0, 8.0, 40.4})
            for za, zb in zip(cuts, cuts[1:]):
                quad(S, pt(-h1(za), za, 0), pt(h1(za), za, 0), pt(h1(zb), zb, 0), pt(-h1(zb), zb, 0), P2['field2'], PT['ashlar'])
            continue
        bz0 = DOOR_Z if k == 0 else 4.2
        bz1 = 40.4
        for za, zb in zip((T1_Z0,) + rows, rows + (T1_Z1,)):
            col = P2['field1'] if za < STRINGS[0] else P2['field2'] if za < STRINGS[1] else P2['field3']
            quad(S, pt(-h1(za), za, 0), pt(-BW, za, 0), pt(-BW, zb, 0), pt(-h1(zb), zb, 0), col, PT['ashlar'])
            quad(S, pt(BW, za, 0), pt(h1(za), za, 0), pt(h1(zb), zb, 0), pt(BW, zb, 0), col, PT['ashlar'])
        quad(S, pt(-BW, T1_Z0, 0), pt(BW, T1_Z0, 0), pt(BW, bz0, 0), pt(-BW, bz0, 0), P2['field1'], PT['ashlar'])
        quad(S, pt(-BW, bz1, 0), pt(BW, bz1, 0), pt(BW, T1_Z1, 0), pt(-BW, T1_Z1, 0), P2['field3'], PT['ashlar'])
        # Bay reveals & sill/soffit
        quad(S, pt(-BW, bz0, 0), pt(-BW, bz0, -RD), pt(-BW, bz1, -RD), pt(-BW, bz1, 0), P2['reveal'], PT['plain'])
        quad(S, pt(BW, bz0, -RD), pt(BW, bz0, 0), pt(BW, bz1, 0), pt(BW, bz1, -RD), P2['reveal'], PT['plain'])
        quad(S, pt(-BW, bz0, 0), pt(BW, bz0, 0), pt(BW, bz0, -RD), pt(-BW, bz0, -RD), P2['reveal'], PT['plain'])
        quad(S, pt(-BW, bz1, -RD), pt(BW, bz1, -RD), pt(BW, bz1, 0), pt(-BW, bz1, 0), P2['reveal'], PT['plain'])
        back = lambda u, z, e, k=k: t1p(k, u, z, e - RD)
        wins = [(0.0, 0.5, 19.6, 22.6), (0.0, 0.5, 32.6, 35.8)] if k == 0 else \
               [(0.0, 0.5, 8.6, 11.4), (0.0, 0.5, 19.6, 22.6), (0.0, 0.5, 32.6, 35.8)]
        top_bay = 15.32 if k == 0 else bz0           # integrated distyle-in-antis portico docks right below string 1 (15.4)
        wall_with_openings(S, back, -BW, BW, top_bay, bz1, wins, P2['bay'], PT['plain'], rows=rows)
        if k == 0:
            wall_with_openings(S, back, -BW, BW, bz0, top_bay, [(0.0, 2.0, bz0, 12.4)], P2['bay'], PT['plain'])
        for uc, hw, z0, z1 in wins:
            opening(S, W, back, z0, z1, uc, hw, WD, rng)
    for zs in STRINGS:
        sq_ring(S, zs, [(0.55, 0.45, 0.45), (0.22, 0.45, 0.12)], P2['trim'])
    sq_steps(S, 0.0, [(1.2, 17.2, 17.2), (0.2, 17.2, 16.8), (1.0, 16.0, 16.0), (0.2, 16.0, 15.4)], P2['plinth'], PT['ashlar'])
    quoins(S)


def portal(S):
    """Distyle-in-antis Alexandrian entrance portico built INTO v2's recessed front bay (x = +-3.4, z = 5.6..15.32),
    belonging to the battered tower rather than stuck onto its face: recessed dark-bronze studded double doors,
    two fluted limestone columns framed between the bay's masonry reveals, carved frieze with dentils, and an
    Egyptian cavetto hood docking cleanly beneath the 15.4 m string course; 9-step limestone ramp below."""
    zf = DOOR_Z
    yb = -(h1(zf) - RD)                       # bay back wall at threshold (-14.125)
    yb_top = -(h1(15.3) - RD) + 0.18          # extends cleanly into battered back wall at z=15.3 (-13.38)
    yface = -h1(zf)                           # front wall plane at threshold (-14.825)
    y_col = yface - 0.44                      # column line seated on the bay mouth edge (in-antis!)

    # Recessed monumental warm antique-bronze double doors with gilt centre astragal, bronze rail straps & ring-bosses
    box2(S, -2.0, yb - 0.06, zf, 2.0, yb + 0.85, zf + 6.9, P2['bronze_aged'], PT['metal'], skip=('+y',))
    box2(S, -0.11, yb - 0.14, zf, 0.11, yb - 0.02, zf + 6.85, P2['gilt2'], PT['metal'], skip=('+y',))
    for zz in (zf + 0.42, zf + 2.35, zf + 4.60, zf + 6.45):
        box2(S, -1.96, yb - 0.12, zz, 1.96, yb - 0.02, zz + 0.22, P2['bronze'], PT['metal'], skip=('+y',))
    for sd in (-1, 1):
        box2(S, sd * 0.88 - 0.18, yb - 0.22, zf + 2.80, sd * 0.88 + 0.18, yb - 0.10, zf + 3.20, P2['gilt2'], PT['metal'], skip=('+y',))

    # Dressed limestone door architrave (jambs + lintel recessed inside the bay)
    for x0, x1 in ((-2.52, -2.0), (2.0, 2.52)):
        box2(S, x0, yb - 0.36, zf, x1, yb + 0.12, zf + 6.9, P2['portal'], PT['plain'], skip=('+y', '-z'))
    box2(S, -2.85, yb - 0.44, zf + 6.9, 2.85, yb_top, zf + 7.55, P2['portal'], PT['plain'], skip=('+y',))

    # Two in-antis fluted pale-limestone columns framed cleanly inside the +-3.4 m bay opening
    for sd in (-1, 1):
        cx = sd * 2.68
        box2(S, cx - 0.66, y_col - 0.66, zf, cx + 0.66, y_col + 0.66, zf + 0.48, P2['trim'], PT['plain'], skip=('-z',))
        ngon_frustum(S, 8, zf + 0.48, zf + 0.74, 0.56, 0.47, P2['trim'], PT['plain'], cx=cx, cy=y_col, top=False)
        # 10-facet fluted limestone shaft (subtle warm-stone shadow flutes, belonging to the tower)
        z_sh0, z_sh1 = zf + 0.74, zf + 6.72
        n_fl = 10
        A_sh = [S.vert((cx + (0.46 if fi % 2 == 0 else 0.40) * math.cos(TAU * fi / n_fl),
                        y_col + (0.46 if fi % 2 == 0 else 0.40) * math.sin(TAU * fi / n_fl), z_sh0)) for fi in range(n_fl)]
        B_sh = [S.vert((cx + (0.40 if fi % 2 == 0 else 0.35) * math.cos(TAU * fi / n_fl),
                        y_col + (0.40 if fi % 2 == 0 else 0.35) * math.sin(TAU * fi / n_fl), z_sh1)) for fi in range(n_fl)]
        for fi in range(n_fl):
            f2 = (fi + 1) % n_fl
            S.face((A_sh[fi], A_sh[f2], B_sh[f2], B_sh[fi]), P2['trim'] if fi % 2 == 0 else P2['bay'], PT['plain'], smooth=False)
        # Alexandrian lotus-bell capital with slender gilt necking ring & marble abacus
        ngon_frustum(S, 8, z_sh1, z_sh1 + 0.14, 0.42, 0.44, P2['gilt2'], PT['metal'], cx=cx, cy=y_col, top=False)
        ngon_frustum(S, 8, z_sh1 + 0.14, zf + 7.32, 0.42, 0.62, P2['trim'], PT['plain'], cx=cx, cy=y_col, top=False)
        box2(S, cx - 0.70, y_col - 0.70, zf + 7.32, cx + 0.70, y_col + 0.70, zf + 7.55, P2['trim'], PT['plain'])

    # Integrated bay entablature (architrave + carved stone frieze + dentils + Egyptian cavetto hood)
    # Fits cleanly within the +-3.4 m bay width and docks under the 15.4 m string course!
    ey0 = y_col - 0.70
    box2(S, -3.40, ey0, zf + 7.55, 3.40, yb_top, zf + 8.05, P2['portal'], PT['plain'], skip=('+y',))
    box2(S, -3.38, ey0 + 0.08, zf + 8.05, 3.38, yb_top, zf + 8.55, P2['reveal'], PT['plain'], skip=('+y', '-z', '+z'))
    # Five crisp carved stone relief bosses along the frieze (restrained, no loud red)
    for rx in (-2.5, -1.25, 0.0, 1.25, 2.5):
        box2(S, rx - 0.22, ey0 - 0.03, zf + 8.15, rx + 0.22, ey0 + 0.10, zf + 8.46, P2['trim'], PT['plain'], skip=('+y',))
    # Dentil course under the cavetto bed moulding
    for di in range(-4, 5):
        box2(S, di * 0.76 - 0.15, ey0 - 0.14, zf + 8.55, di * 0.76 + 0.15, ey0 + 0.08, zf + 8.82, P2['trim'], PT['plain'], skip=('+y', '+z'))
    # Egyptian cavetto gorge & corona hood echoing v2's cornices (z = 14.42 .. 15.32)
    za = zf + 8.82
    for dz, o0, o1 in cavetto(za, 0.0, 0.65, 0.64, n=3):
        box2(S, -3.44 - o1 * 0.45, ey0 - 0.14 - o1, za, 3.44 + o1 * 0.45, yb_top, za + dz, P2['gorge'], PT['plain'], skip=('+y', '-z'))
        za += dz
    box2(S, -3.76, ey0 - 0.80, za, 3.76, yb_top, za + 0.26, P2['trim'], PT['plain'], skip=('+y', '-z'))
    # Ptolemaic winged solar disc centered on the cavetto gorge (subtle gilt sun + carved bronze wings)
    gy = ey0 - 0.54
    gz = zf + 9.20
    for k in range(8):
        a0, a1 = TAU * k / 8, TAU * (k + 1) / 8
        sc = Vector((0.0, gy, gz))
        S.face([S.vert(sc), S.vert(sc + Vector((0.32 * math.cos(a0), 0, 0.32 * math.sin(a0)))),
                S.vert(sc + Vector((0.32 * math.cos(a1), 0, 0.32 * math.sin(a1))))], P2['gilt2'], PT['metal'])
    for sd in (-1, 1):
        box2(S, sd * 0.36 if sd > 0 else -1.55, gy + 0.02, gz - 0.14, 1.55 if sd > 0 else sd * 0.36, gy + 0.16, gz + 0.14,
             P2['bronze'], PT['metal'], skip=('+y',))

    # Landing & 9-step ceremonial limestone ramp (keeps exact v2 y_land = yface - 3.0 for 'door' anchor!)
    y_land = yface - 3.0
    box2(S, -4.0, y_land, 0.0, 4.0, yface + 0.1, zf - 0.26, P2['plinth'], PT['ashlar'], skip=('-z', '+z', '+y'))
    box2(S, -4.2, y_land - 0.18, zf - 0.26, 4.2, yface + 0.1, zf, P2['trim'], PT['plain'], skip=('+y',))
    quad(S, (-3.6, y_land, zf + 0.015), (3.6, y_land, zf + 0.015), (3.6, yface, zf + 0.015), (-3.6, yface, zf + 0.015),
         P2['pav_light'], PT['ashlar'])
    y_foot = -PLAT + 3.0
    for s in (-1, 1):
        x0, x1 = (s * 3.0, s * 3.92) if s > 0 else (s * 3.92, s * 3.0)
        a0, a1 = S.vert((x0, y_foot, 0)), S.vert((x1, y_foot, 0))
        b0, b1 = S.vert((x0, y_land, 0)), S.vert((x1, y_land, 0))
        c0, c1 = S.vert((x0, y_foot, 1.05)), S.vert((x1, y_foot, 1.05))
        d0, d1 = S.vert((x0, y_land, zf + 1.05)), S.vert((x1, y_land, zf + 1.05))
        S.face([a1, b1, d1, c1], P2['field1'], PT['ashlar']); S.face([b0, a0, c0, d0], P2['field1'], PT['ashlar'])
        S.face([c0, c1, d1, d0], P2['trim'], PT['plain']); S.face([a0, a1, c1, c0], P2['field1'], PT['ashlar'])
        nx = s * 3.48
        box2(S, nx - 0.68, y_foot - 0.68, 0.0, nx + 0.68, y_foot + 0.68, 1.40, P2['field1'], PT['ashlar'], skip=('-z', '+z'))
        box2(S, nx - 0.82, y_foot - 0.82, 1.40, nx + 0.82, y_foot + 0.82, 1.66, P2['trim'], PT['plain'])
        classical_urn(S, nx, y_foot, 1.66, scale=0.62, col_body=P2['bronze_aged'], col_trim=P2['bronze'],
                      pat_body=PT['metal'], pat_trim=PT['metal'])
    # 9-step ceremonial limestone flight (width 5.92 m < 6.0 m so step creases receive crisp Cycles AO)
    n_steps = 9
    for si in range(n_steps):
        t0, t1 = si / n_steps, (si + 1) / n_steps
        ya, yb_s = y_foot + (y_land - y_foot) * t0, y_foot + (y_land - y_foot) * t1
        za, zb_s = 0.03 + (zf - 0.03) * t0, 0.03 + (zf - 0.03) * t1
        quad(S, (-2.96, ya, za), (2.96, ya, za), (2.96, ya, zb_s), (-2.96, ya, zb_s), P2['plinth'], PT['plain'])
        quad(S, (-2.96, ya, zb_s), (2.96, ya, zb_s), (2.96, yb_s, zb_s), (-2.96, yb_s, zb_s),
             P2['pav_light'] if si % 2 == 0 else P2['pav_mid'], PT['ashlar'])
    s0, s1 = S.vert((-3.0, y_land, 0.0)), S.vert((3.0, y_land, 0.0))
    r2_, r3 = S.vert((3.0, y_land, zf)), S.vert((-3.0, y_land, zf))
    S.face([s0, s1, r2_, r3][::-1], P2['plinth'], PT['ashlar'])
    return yface


def cornice1(S):
    """The Egyptian cornice: torus, a dentil frieze, the cavetto gorge and its corona lip. Returns the terrace z."""
    h = h1(T1_Z1)
    flat = lambda _z: h
    z = sq_ring(S, T1_Z1, [(0.3, 0.32, 0.32), (0.18, 0.32, 0.12)], P2['trim'], hfn=flat)
    z = sq_ring(S, z, [(1.1, 0.12, 0.12)], P2['trim'], hfn=flat)
    zf1 = z
    z = sq_ring(S, z, [(0.18, 0.2, 0.55)], P2['trim'], hfn=flat)
    for dz, a, b in cavetto(z, 0.55, 1.45, 1.5, n=4):
        ngon_frustum(S, 4, z, z + dz, (h + a) * math.sqrt(2), (h + b) * math.sqrt(2), P2['gorge'], PT['plain'], rot=math.pi / 4, top=True, bot=True)
        z += dz
    z = sq_ring(S, z, [(0.5, 2.0, 2.0), (0.12, 2.0, 1.85)], P2['trim'], hfn=flat)
    for k in VISIBLE:
        d, t = face_frame(k)
        hh = h1(T1_Z1) + 0.12
        for i in range(-13, 14):
            c = d * (hh + 0.16) + t * (i * 0.98) + Vector((0, 0, zf1 - 0.42))
            box(S, c, (0.46, 0.32, 0.6), P2['trim'], PT['plain'], axes=(-t, d, Vector((0, 0, 1))), skip=('-y',))
    return z


def terrace1(S, zt):
    """The first terrace: paving, low parapet behind the corona, the tritons' corner pedestals."""
    hp = 13.9
    quad(S, (-hp, -hp, zt + 0.01), (hp, -hp, zt + 0.01), (hp, hp, zt + 0.01), (-hp, hp, zt + 0.01), P['paving'], PT['cobble'])
    for k in range(4):
        d, t = face_frame(k)
        ax = (-t, d, Vector((0, 0, 1)))
        c = d * (hp - 0.3) + Vector((0, 0, zt + 0.5))
        box(S, c, (2 * hp - 5.0, 0.6, 1.0), P2['field3'], PT['ashlar'], axes=ax, skip=('-z',))
        box(S, c + Vector((0, 0, 0.6)), (2 * hp - 5.0, 0.86, 0.2), P2['trim'], PT['plain'], axes=ax, skip=('-z',))
    PED = 12.75
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * PED, sy * PED
            box2(S, x - 1.8, y - 1.8, zt, x + 1.8, y + 1.8, zt + 0.45, P2['trim'], PT['plain'], skip=('-z',))
            box2(S, x - 1.55, y - 1.55, zt + 0.45, x + 1.55, y + 1.55, zt + 2.35, P2['field3'], PT['ashlar'], skip=('-z',))
            box2(S, x - 1.7, y - 1.7, zt + 2.35, x + 1.7, y + 1.7, zt + 2.70, P2['trim'], PT['plain'], skip=('-z',))
            ngon_frustum(S, 8, zt + 2.70, zt + 2.80, 1.48, 1.42, P2['bronze_dark'], PT['metal'], rot=math.pi / 8, cx=x, cy=y)
    return PED, zt + 2.8


# ------------------------------------------------------------------ refined monumental sculpture
def figure_triton2(mb, base, facing, sc=2.3, turn=0.0, lean=False):
    """Refined bronze triton (v2 pose, scale 2.3, camera-facing conch turned out to sea): sculpted rounded deltoid
    shoulders (no boxy shelf), muscular torso with warm-bronze chest accents, bearded crested head, coiled verdigris
    tail rising behind into forked gilt-bronze flukes, and multi-stage flared gilt conch."""
    f = Vector(facing).normalized(); s = Vector((-f.y, f.x, 0)); up = Vector((0, 0, 1)); B = Vector(base)
    W = lambda a, b, c: B + (f * a + s * b + up * c) * sc
    body, tail, br, gilt = P2['bronze_v'], P2['bronze_t'], P2['bronze'], P2['gilt2']
    sg = 4 if lean else 6
    # Coiled marine tail rising behind shoulder into raised twin flukes
    path = [(0.0, 0.0, 1.05, 0.42), (-0.28, 0.36, 0.56, 0.40), (-0.70, 0.30, 0.30, 0.37), (-0.98, -0.18, 0.36, 0.33),
            (-0.82, -0.62, 0.72, 0.29), (-0.55, -0.66, 1.30, 0.25), (-0.50, -0.50, 1.92, 0.20), (-0.62, -0.44, 2.46, 0.15)]
    for idx, ((a0, b0, c0, r0), (a1, b1, c1, r1)) in enumerate(zip(path, path[1:])):
        rod(mb, W(a0, b0, c0), W(a1, b1, c1), r0 * sc, tail if idx % 2 == 0 else body, segs=sg, r2=r1 * sc, smooth=True, pat=PT['metal'])
    fl = W(*path[-1][:3])
    for side in (-1, 1):
        rod(mb, fl, fl + (-f * 0.22 + s * (side * 0.64 - 0.12) + up * 0.44) * sc, 0.18 * sc, gilt, segs=3, r2=0.02, smooth=False, pat=PT['metal'])

    fc = f * math.cos(turn) + s * math.sin(turn); sc_ = Vector((-fc.y, fc.x, 0))
    Wc = lambda a, b, c: B + (fc * a + sc_ * b + up * c) * sc
    ngon_frustum(mb, 6 if lean else 8, B.z + 0.95 * sc, B.z + 1.20 * sc, 0.50 * sc, 0.42 * sc, gilt, PT['metal'], cx=B.x, cy=B.y)
    rod(mb, W(0.0, 0.0, 1.15), W(0.10, 0.0, 1.90), 0.36 * sc, tail, segs=sg, r2=0.42 * sc, smooth=True, pat=PT['metal'])
    rod(mb, W(0.10, 0.0, 1.90), W(0.24, 0.0, 2.86), 0.42 * sc, body, segs=sg, r2=0.52 * sc, smooth=True, pat=PT['metal'])
    rod(mb, W(0.26, -0.62, 2.92), W(0.26, 0.62, 2.92), 0.26 * sc, body, segs=sg, cap=True, smooth=True, pat=PT['metal'])
    if not lean:
        rod(mb, W(0.42, -0.32, 2.74), W(0.42, 0.32, 2.74), 0.18 * sc, br, segs=5, cap=True, smooth=True, pat=PT['metal'])
    rod(mb, W(0.28, 0.0, 3.06), W(0.33, 0.0, 3.40), 0.17 * sc, body, segs=sg, smooth=True, pat=PT['metal'])
    hc = Wc(0.38, 0.0, 3.68)
    ngon_frustum(mb, 5 if lean else 7, hc.z - 0.30 * sc, hc.z + 0.12 * sc, 0.27 * sc, 0.31 * sc, body, PT['metal'], cx=hc.x, cy=hc.y, top=False, bot=True, smooth=True)
    ngon_frustum(mb, 5 if lean else 7, hc.z + 0.12 * sc, hc.z + 0.40 * sc, 0.33 * sc, 0.12 * sc, tail, PT['metal'],
                 cx=hc.x - fc.x * 0.05 * sc, cy=hc.y - fc.y * 0.05 * sc, smooth=True)
    if not lean:
        rod(mb, hc + fc * (0.20 * sc) - up * (0.14 * sc), hc + fc * (0.28 * sc) - up * (0.44 * sc), 0.13 * sc, br, segs=4, r2=0.05 * sc, pat=PT['metal'])
        rod(mb, hc + up * (0.28 * sc), hc + up * (0.44 * sc) - fc * (0.42 * sc), 0.10 * sc, gilt, segs=4, r2=0.03 * sc, pat=PT['metal'], smooth=False)
    m0, m1, m2 = Wc(0.66, 0.0, 3.74), Wc(1.32, 0.0, 4.30), Wc(2.00, 0.0, 5.05)
    rod(mb, m0, m1, 0.10 * sc, br, segs=sg, r2=0.21 * sc, smooth=True, pat=PT['metal'])
    rod(mb, m1, m2, 0.21 * sc, gilt, segs=sg, r2=0.56 * sc, smooth=True, pat=PT['metal'])
    rod(mb, m2, m2 + (m2 - m1).normalized() * 0.14 * sc, 0.62 * sc, P2['gilt_bright'], segs=sg, r2=0.60 * sc, smooth=False, pat=PT['metal'], cap=True)
    for side, hand in ((-1, Wc(0.95, -0.12, 4.02)), (1, Wc(1.62, 0.18, 4.62))):
        sh = W(0.26, side * 0.64, 2.92)
        el = Wc(0.62 if side < 0 else 0.92, side * 0.86, 3.20 if side < 0 else 3.30)
        rod(mb, sh, el, 0.19 * sc, body, segs=4 if lean else 5, r2=0.16 * sc, smooth=True, pat=PT['metal'])
        rod(mb, el, hand, 0.15 * sc, body, segs=4 if lean else 5, r2=0.12 * sc, smooth=True, pat=PT['metal'])


def figure_pharaoh2(mb, base, facing, scale=1.5):
    """Refined colossal Ptolemaic royal guardian in weathered verdigris bronze & metallic gilt on a carved
    tone-on-tone limestone pedestal (no loud red porphyry panels): rounded deltoid shoulders, fluted gilt shendyt
    kilt, usekh collar, gilt armlets, was-sceptre, lathed head, nemes headcloth with uraeus & double Pschent crown."""
    B = Vector(base); f = Vector(facing).normalized(); s = Vector((-f.y, f.x, 0)).normalized(); up = Vector((0, 0, 1)); sc = scale
    pat, patd, br, kilt, gilt = P2['bronze_v'], P2['bronze_t'], P2['bronze'], P2['gilt_deep'], P2['gilt2']
    ax = (-s, f, up)

    # Restrained carved limestone pedestal (clean proud stone panel quads, zero buried corners -> crisp Cycles AO)
    box(mb, B + up * 0.32 * sc, (4.7 * sc, 5.3 * sc, 0.64 * sc), P['lime_podium'], PT['ashlar'], axes=ax, skip=('-z',))
    box(mb, B + up * 0.88 * sc, (4.05 * sc, 4.65 * sc, 0.48 * sc), P2['plinth'], PT['ashlar'], axes=ax, skip=('-z',))
    box(mb, B + up * 2.38 * sc, (3.25 * sc, 3.85 * sc, 2.52 * sc), P2['field1'], PT['ashlar'], axes=ax, skip=('-z', '+z'))
    pf = B + f * (1.96 * sc) + up * (2.38 * sc)
    quad(mb, pf - s * (0.98 * sc) - up * (0.75 * sc), pf + s * (0.98 * sc) - up * (0.75 * sc),
         pf + s * (0.98 * sc) + up * (0.75 * sc), pf - s * (0.98 * sc) + up * (0.75 * sc), P2['pav_panel'], PT['plain'])
    for sd in (-1, 1):
        ps = B + s * (sd * 1.66 * sc) + up * (2.38 * sc)
        pts = (ps - f * (1.12 * sc) - up * (0.75 * sc), ps + f * (1.12 * sc) - up * (0.75 * sc),
               ps + f * (1.12 * sc) + up * (0.75 * sc), ps - f * (1.12 * sc) + up * (0.75 * sc))
        quad(mb, *(pts if sd < 0 else (pts[1], pts[0], pts[3], pts[2])), P2['pav_panel'], PT['plain'])
    box(mb, B + up * 3.76 * sc, (3.76 * sc, 4.36 * sc, 0.24 * sc), P2['trim'], PT['plain'], axes=ax)
    box(mb, B + up * 4.02 * sc, (3.42 * sc, 4.02 * sc, 0.28 * sc), P2['trim'], PT['plain'], axes=ax, skip=('-z',))
    z = 4.16 * sc
    sc = scale * 1.2
    P0 = lambda dx, df, dz: B + s * (dx * sc) + f * (df * sc) + up * (z + dz * sc)

    box(mb, P0(0, 0.1, 0.10), (1.72 * sc, 2.30 * sc, 0.20 * sc), P2['bronze_dark'], PT['metal'], axes=ax, skip=('-z',))
    box(mb, P0(0, -0.58, 2.85), (0.66 * sc, 0.32 * sc, 5.4 * sc), patd, PT['metal'], axes=ax, skip=('-z',))
    for sd, fwd in ((-1, 0.58), (1, -0.22)):
        box(mb, P0(sd * 0.37, fwd + 0.22, 0.28), (0.44 * sc, 0.96 * sc, 0.28 * sc), pat, PT['metal'], axes=ax, skip=('-z',))
        rod(mb, P0(sd * 0.37, fwd, 0.42), P0(sd * 0.37, fwd * 0.38, 1.68), 0.23 * sc, pat, segs=5, r2=0.28 * sc, pat=PT['metal'])
        rod(mb, P0(sd * 0.37, fwd * 0.38, 1.68), P0(sd * 0.34, 0.0, 3.05), 0.28 * sc, pat, segs=5, r2=0.36 * sc, pat=PT['metal'])

    # Fluted shendyt kilt, belt & central gilt apron
    ngon_frustum(mb, 8, B.z + z + 2.24 * sc, B.z + z + 3.36 * sc, 0.94 * sc, 0.66 * sc, kilt, PT['metal'], rot=math.pi / 8, cx=B.x, cy=B.y)
    ngon_frustum(mb, 8, B.z + z + 3.36 * sc, B.z + z + 3.64 * sc, 0.70 * sc, 0.70 * sc, gilt, PT['metal'], rot=math.pi / 8, cx=B.x, cy=B.y)
    box(mb, P0(0.0, 0.68, 2.82), (0.42 * sc, 0.15 * sc, 1.14 * sc), gilt, PT['metal'], axes=ax)

    # Sculpted athletic torso with rounded deltoid shoulders + usekh collar
    tz0, tz1 = z + 3.62 * sc, z + 5.64 * sc
    rod(mb, B + up * tz0, B + up * (tz0 + 1.05 * sc), 0.64 * sc, pat, segs=7, r2=0.80 * sc, smooth=True, pat=PT['metal'])
    rod(mb, B + up * (tz0 + 1.05 * sc), B + up * (tz1 - 0.16 * sc), 0.80 * sc, pat, segs=7, r2=0.84 * sc, smooth=True, pat=PT['metal'])
    ngon_frustum(mb, 7, B.z + tz1 - 0.16 * sc, B.z + tz1 + 0.22 * sc, 0.84 * sc, 0.36 * sc, pat, PT['metal'], cx=B.x, cy=B.y, top=False, smooth=True)
    rod(mb, B - s * (0.94 * sc) + up * (tz1 - 0.24 * sc), B + s * (0.94 * sc) + up * (tz1 - 0.24 * sc), 0.38 * sc, pat, segs=6, cap=True, smooth=True, pat=PT['metal'])
    ngon_frustum(mb, 8, B.z + tz1 - 0.20 * sc, B.z + tz1 + 0.18 * sc, 0.88 * sc, 0.44 * sc, gilt, PT['metal'], cx=B.x, cy=B.y)

    # Arms with gilt armlets, closed fists & tall was-sceptre
    shl = B + s * (-0.98 * sc) + up * (tz1 - 0.22 * sc)
    elbl = shl - s * 0.10 * sc - up * 1.32 * sc
    fisl = elbl + s * 0.02 * sc - up * 1.18 * sc + f * 0.14 * sc
    rod(mb, shl, elbl, 0.26 * sc, pat, segs=5, r2=0.22 * sc, pat=PT['metal'])
    rod(mb, shl.lerp(elbl, 0.35), shl.lerp(elbl, 0.52), 0.27 * sc, gilt, segs=5, pat=PT['metal'], smooth=False)
    rod(mb, elbl, fisl, 0.22 * sc, pat, segs=5, r2=0.19 * sc, pat=PT['metal'])
    box(mb, fisl - up * 0.14 * sc, (0.34 * sc, 0.42 * sc, 0.36 * sc), patd, PT['metal'], axes=ax)

    shr = B + s * (0.98 * sc) + up * (tz1 - 0.22 * sc)
    elb = shr + s * 0.18 * sc - up * 1.22 * sc + f * 0.16 * sc
    hand = B + s * (1.34 * sc) + f * (0.94 * sc) + up * (tz0 + 0.56 * sc)
    rod(mb, shr, elb, 0.26 * sc, pat, segs=5, r2=0.22 * sc, pat=PT['metal'])
    rod(mb, shr.lerp(elb, 0.35), shr.lerp(elb, 0.52), 0.27 * sc, gilt, segs=5, pat=PT['metal'], smooth=False)
    rod(mb, elb, hand, 0.22 * sc, pat, segs=5, r2=0.19 * sc, pat=PT['metal'])
    box(mb, hand, (0.36 * sc, 0.40 * sc, 0.42 * sc), patd, PT['metal'], axes=ax)
    st0 = Vector((hand.x, hand.y, B.z + z + 0.10 * sc))
    st1 = Vector((hand.x, hand.y, B.z + tz1 + 2.75 * sc))
    rod(mb, st0, st1, 0.10 * sc, br, segs=4, pat=PT['metal'], smooth=False)
    rod(mb, st1, st1 + up * 0.38 * sc + f * 0.48 * sc, 0.14 * sc, gilt, segs=4, r2=0.07 * sc, pat=PT['metal'], smooth=False)
    ngon_frustum(mb, 6, st1.z - 0.28 * sc, st1.z + 0.06 * sc, 0.18 * sc, 0.22 * sc, gilt, PT['metal'], cx=st1.x, cy=st1.y)

    # Neck, sculpted head, ceremonial beard, nemes headcloth with lappets, uraeus & double Pschent crown
    rod(mb, B + up * (tz1 + 0.12 * sc), B + up * (tz1 + 0.48 * sc), 0.25 * sc, pat, segs=5, pat=PT['metal'])
    hz = tz1 + 0.96 * sc
    lathe_z(mb, B.x, B.y, [
        (0.32 * sc, B.z + hz - 0.46 * sc), (0.42 * sc, B.z + hz - 0.05 * sc), (0.38 * sc, B.z + hz + 0.34 * sc)
    ], pat, PT['metal'], segs=6, smooth=True)
    rod(mb, B + f * (0.34 * sc) + up * (hz - 0.32 * sc), B + f * (0.42 * sc) + up * (hz - 0.82 * sc), 0.11 * sc, gilt, segs=4, r2=0.07 * sc, pat=PT['metal'], smooth=False)
    a0, a1 = B + up * (hz + 0.38 * sc) - s * 0.48 * sc, B + up * (hz + 0.38 * sc) + s * 0.48 * sc
    b1, b0 = B + up * (hz - 0.86 * sc) + s * 0.96 * sc - f * 0.10 * sc, B + up * (hz - 0.86 * sc) - s * 0.96 * sc - f * 0.10 * sc
    for off, flip in ((f * 0.08 * sc, False), (-f * 0.36 * sc, True)):
        ids = [mb.vert(p + off) for p in (b0, b1, a1, a0)]
        mb.face(ids[::-1] if flip else ids, gilt, PT['tiles'])
    for sd in (-1, 1):
        box(mb, B + s * (sd * 0.54 * sc) + f * (0.32 * sc) + up * (hz - 0.88 * sc), (0.28 * sc, 0.18 * sc, 0.88 * sc), gilt, PT['metal'], axes=ax)
    rod(mb, B + f * (0.42 * sc) + up * (hz + 0.24 * sc), B + f * (0.50 * sc) + up * (hz + 0.62 * sc), 0.08 * sc, P2['gilt_bright'], segs=4, r2=0.05 * sc, pat=PT['metal'], smooth=False)
    ngon_frustum(mb, 6, B.z + hz + 0.34 * sc, B.z + hz + 0.88 * sc, 0.44 * sc, 0.54 * sc, br, PT['metal'], cx=B.x, cy=B.y)
    lathe_z(mb, B.x, B.y, [
        (0.36 * sc, B.z + hz + 0.86 * sc), (0.34 * sc, B.z + hz + 1.38 * sc),
        (0.20 * sc, B.z + hz + 1.82 * sc), (0.24 * sc, B.z + hz + 1.98 * sc), (0.0, B.z + hz + 2.12 * sc)
    ], P2['bronze_vl'], PT['metal'], segs=6, smooth=True, cols=[pat, pat, P2['bronze_vl'], gilt])


# ------------------------------------------------------------------ tier 2: the octagon
def octagon(S, W, rng, zt):
    rot8 = math.pi / 8
    k_ = (T2_Z0 - zt) / 2.6
    z = moulding(S, 8, zt, [(1.2 * k_, 10.9, 10.9), (0.3 * k_, 10.9, 10.5), (0.85 * k_, 10.4, 10.4), (0.25 * k_, 10.4, 10.15)], P2['plinth'], PT['ashlar'], rot=rot8)
    assert abs(z - T2_Z0) < 1e-6 and k_ > 0.5, (z, k_)
    cos8 = math.cos(math.pi / 8)
    see = {6: 2, 7: 2, 0: 2, 5: 1, 1: 1}
    zs = 59.4
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
    # Corner pilasters with crisp capitals on the 6 visible corners (none on the two hidden back corners)
    for k in range(8):
        a = rot8 + TAU * k / 8
        if k in (2, 3):
            continue
        dv = Vector((math.cos(a), math.sin(a), 0)); tv = Vector((-math.sin(a), math.cos(a), 0))
        p0, p1 = dv * (T2_R0 + 0.05) + Vector((0, 0, T2_Z0)), dv * (T2_R1 + 0.05) + Vector((0, 0, T2_Z1))
        up = (p1 - p0).normalized()
        ax = (-tv, up.cross(tv).normalized() * -1, up)
        box(S, (p0 + p1) / 2, (1.15, 0.50, (p1 - p0).length), P2['oct_pil'], PT['plain'], axes=ax, skip=('-z', '+z'))
        box(S, p1 - Vector((0, 0, 0.34)), (1.38, 0.68, 0.68), P2['trim'], PT['plain'], axes=ax, skip=('+z',))
    moulding(S, 8, zs, [(0.5, r2(zs) + 0.42, r2(zs) + 0.42), (0.2, r2(zs) + 0.42, r2(zs) + 0.15)], P2['trim'], PT['plain'], rot=rot8)
    R = T2_R1
    z = moulding(S, 8, T2_Z1, [(0.28, R + 0.3, R + 0.3), (0.14, R + 0.3, R + 0.15), (0.8, R + 0.2, R + 0.2), (0.15, R + 0.25, R + 0.5)], P2['trim'], PT['plain'], rot=rot8)
    zf1 = z - 0.15
    for dz, a_, b_ in cavetto(z, R + 0.5, 1.05, 1.1, n=3):
        ngon_frustum(S, 8, z, z + dz, a_, b_, P2['gorge'], PT['plain'], rot=rot8, top=True, bot=True)
        z += dz
    z = moulding(S, 8, z, [(0.42, R + 1.55, R + 1.55), (0.1, R + 1.55, R + 1.4)], P2['trim'], PT['plain'], rot=rot8)
    for k in (5, 6, 7, 0, 1):
        a = TAU * k / 8
        dv = Vector((math.cos(a), math.sin(a), 0)); tv = Vector((-math.sin(a), math.cos(a), 0))
        ap = (R + 0.2) * cos8
        half = (R + 0.2) * math.sin(math.pi / 8) - 0.45
        m = int(half / 0.62)
        for i in range(-m, m + 1):
            c = dv * (ap + 0.13) + tv * (i * half / max(m, 1)) + Vector((0, 0, zf1 - 0.32))
            box(S, c, (0.3, 0.26, 0.42), P2['trim'], PT['plain'], axes=(-tv, dv, Vector((0, 0, 1))), skip=('-y',))
    ztop = z
    ngon_ring(S, 8, ztop, ztop + 0.9, R + 1.2, R + 0.7, P2['oct'], PT['ashlar'], rot=rot8)
    ngon_ring(S, 8, ztop + 0.9, ztop + 1.1, R + 1.38, R + 0.6, P2['trim'], PT['plain'], rot=rot8)
    ngon_frustum(S, 8, ztop - 0.01, ztop + 0.01, R + 0.75, R + 0.75, P['paving'], PT['cobble'], rot=rot8, top=True)
    # Subtle marble corner finials on the 6 visible octagon parapet corners (bright stone + small bronze tip)
    for k in range(8):
        if k in (2, 3):
            continue
        a = rot8 + TAU * k / 8
        fx, fy = (R + 0.95) * math.cos(a), (R + 0.95) * math.sin(a)
        ngon_frustum(S, 4, ztop + 1.1, ztop + 1.48, 0.36, 0.28, P2['trim'], PT['plain'], cx=fx, cy=fy)
        ngon_frustum(S, 4, ztop + 1.48, ztop + 1.98, 0.20, 0.03, P2['gilt2'], PT['metal'], cx=fx, cy=fy)
    return ztop


# ------------------------------------------------------------------ tier 3: the drum (and gallery dentil cornice)
def drum(S, W, rng, zt):
    n = 24
    moulding(S, n, zt, [(0.55, 7.25, 7.25), (0.25, 7.25, 6.9)], P2['plinth'], PT['ashlar'])
    rr = lambda zz: T3_R0 + (T3_R1 - T3_R0) * (zz - T3_Z0) / (T3_Z1 - T3_Z0)
    wz0, wz1 = 77.4, 80.3
    win_segments = (1, 4, 7, 10, 13, 16, 19, 22)
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
    # Engaged pilasters with crisp capitals on the visible arc
    for k in range(8):
        a = TAU * k / 8
        if not vis(a):
            continue
        dv = Vector((math.cos(a), math.sin(a), 0)); tv = Vector((-math.sin(a), math.cos(a), 0))
        p0, p1 = dv * (T3_R0 - 0.05) + Vector((0, 0, T3_Z0)), dv * (T3_R1 - 0.05) + Vector((0, 0, T3_Z1))
        up = (p1 - p0).normalized()
        ax = (-tv, up.cross(tv).normalized() * -1, up)
        box(S, (p0 + p1) / 2, (0.62, 0.42, (p1 - p0).length), P2['drum_pil'], PT['plain'], axes=ax, skip=('-z', '+z'))
        box(S, p1 - Vector((0, 0, 0.25)), (0.80, 0.56, 0.50), P2['trim'], PT['plain'], axes=ax, skip=('+z',))
    # Gallery cornice (83.6 -> 85.0 m exact!) with crisp marble dentils on the visible arc
    z = moulding(S, n, T3_Z1, [(0.5, 6.4, 6.8), (0.6, 7.0, 7.7), (0.3, 7.7, 7.5)], P2['trim'], PT['plain'])
    for k in range(16):
        a = TAU * k / 16
        if not vis(a):
            continue
        dv = Vector((math.cos(a), math.sin(a), 0)); tv = Vector((-math.sin(a), math.cos(a), 0))
        box(S, dv * 7.12 + Vector((0, 0, T3_Z1 + 0.54)), (0.44, 0.32, 0.36), P2['trim'], PT['plain'],
            axes=(-tv, dv, Vector((0, 0, 1))), skip=('-y', '+z'))
    assert abs(z - Z_GAL) < 1e-6, z
    return z


def lantern(S):
    """Refined 8-column fluted Corinthian tholos, dentiled pale-marble entablature, palmette antefixes,
    ribbed cupola dome with 8 bold gilded dome ribs & lotus collar, and beacon brazier. Keeps Z_GAL=85.0,
    LAN_Z1=91.6, DOME_Z0=93.0 and dome_top=97.35 (exact match to smoke_emitter 96.35)."""
    marble = P2['trim']
    n16 = 16
    vis = lambda ang: math.cos(ang - math.radians(-45.0)) > -0.45
    ngon_frustum(S, n16, Z_GAL - 0.01, Z_GAL + 0.01, 7.4, 7.4, P['paving'], PT['cobble'], top=True)
    ngon_ring(S, n16, Z_GAL, Z_GAL + 0.20, 7.44, 7.12, marble, PT['plain'], bot=False)
    ngon_ring(S, n16, Z_GAL + 1.05, Z_GAL + 1.25, 7.46, 7.08, marble, PT['plain'])
    for k in range(16):
        a = TAU * k / 16
        c = Vector((7.27 * math.cos(a), 7.27 * math.sin(a), Z_GAL + 0.62))
        rod(S, c - Vector((0, 0, 0.43)), c + Vector((0, 0, 0.44)), 0.14, marble, segs=3, r2=0.11, smooth=False)
    # 8 fluted Corinthian tholos columns with gilded bell capitals
    for k in range(8):
        a = TAU * (k + 0.5) / 8
        cx, cy = LAN_R * math.cos(a), LAN_R * math.sin(a)
        box2(S, cx - 0.76, cy - 0.76, Z_GAL, cx + 0.76, cy + 0.76, Z_GAL + 0.44, marble, PT['plain'], skip=('-z',))
        ngon_frustum(S, 8, Z_GAL + 0.44, Z_GAL + 0.78, 0.62, 0.49, marble, PT['plain'], cx=cx, cy=cy, top=False)
        # 12-facet fluted shaft (6 crisp flutes + 6 arrises)
        z_sh0, z_sh1 = Z_GAL + 0.78, LAN_Z1 - 0.88
        n_fl = 12
        A_sh = [S.vert((cx + (0.49 if fi % 2 == 0 else 0.42) * math.cos(TAU * fi / n_fl),
                        cy + (0.49 if fi % 2 == 0 else 0.42) * math.sin(TAU * fi / n_fl), z_sh0)) for fi in range(n_fl)]
        B_sh = [S.vert((cx + (0.42 if fi % 2 == 0 else 0.36) * math.cos(TAU * fi / n_fl),
                        cy + (0.42 if fi % 2 == 0 else 0.36) * math.sin(TAU * fi / n_fl), z_sh1)) for fi in range(n_fl)]
        for fi in range(n_fl):
            f2 = (fi + 1) % n_fl
            S.face((A_sh[fi], A_sh[f2], B_sh[f2], B_sh[fi]), P2['drum_pil'] if fi % 2 == 0 else P2['oct'], PT['plain'], smooth=False)
        # Corinthian bell capital with gilt necking & flared gilt acanthus collar + marble abacus
        ngon_frustum(S, 8, z_sh1, z_sh1 + 0.16, 0.46, 0.48, P2['gilt2'], PT['metal'], cx=cx, cy=cy, top=False)
        ngon_frustum(S, 8, z_sh1 + 0.16, LAN_Z1 - 0.28, 0.44, 0.70, P2['gilt2'], PT['metal'], cx=cx, cy=cy, top=False)
        box2(S, cx - 0.82, cy - 0.82, LAN_Z1 - 0.28, cx + 0.82, cy + 0.82, LAN_Z1, marble, PT['plain'])

    # Bright pale-marble entablature (preserves v2's luminous pale crown; no dark red frieze band) + dentils & antefixes
    ngon_ring(S, n16, LAN_Z1, LAN_Z1 + 0.62, 6.12, 4.4, marble, PT['plain'])
    ngon_ring(S, n16, LAN_Z1 + 0.62, LAN_Z1 + 1.06, 6.26, 4.4, P2['gorge'], PT['plain'])
    ngon_ring(S, n16, LAN_Z1 + 1.06, DOME_Z0, 6.64, 4.4, marble, PT['plain'])
    for k in range(16):
        a = TAU * k / 16
        if not vis(a):
            continue
        dv = Vector((math.cos(a), math.sin(a), 0)); tv = Vector((-math.sin(a), math.cos(a), 0))
        box(S, dv * 6.38 + Vector((0, 0, LAN_Z1 + 0.94)), (0.42, 0.26, 0.26), marble, PT['plain'],
            axes=(-tv, dv, Vector((0, 0, 1))), skip=('-y', '+z'))
    for k in range(8):
        a = TAU * (k + 0.5) / 8
        dv = Vector((math.cos(a), math.sin(a), 0))
        palmette_acroterion(S, dv * 6.42 + Vector((0, 0, DOME_Z0)), dv, h=0.82, col=P2['gilt2'], pat=PT['metal'], base_col=marble)
    ngon_frustum(S, n16, LAN_Z1 + 0.05, LAN_Z1 + 0.06, 4.5, 4.5, P2['plinth'], PT['plain'], bot=True, top=False)

    # Ribbed cupola dome with 8 bold tapered gilded bronze ribs & gilded lotus finial collar
    rings = [(0.0, 6.30), (1.18, 5.80), (2.28, 4.68), (3.08, 3.02), (3.60, 1.35)]
    prev = None
    for dz, rr in rings:
        cur = [S.vert((rr * math.cos(TAU * k / n16), rr * math.sin(TAU * k / n16), DOME_Z0 + dz)) for k in range(n16)]
        if prev:
            for k in range(n16):
                k2 = (k + 1) % n16
                S.face((prev[k], prev[k2], cur[k2], cur[k]), P2['drum_pil'], PT['tiles'], smooth=True)
        prev = cur
    S.face(prev, P2['drum_pil'], PT['plain'])
    for k in range(8):
        a = TAU * k / 8
        dv = Vector((math.cos(a), math.sin(a), 0))
        pts = [Vector((rr * math.cos(a), rr * math.sin(a), DOME_Z0 + dz)) + dv * 0.09 + Vector((0, 0, 0.10)) for dz, rr in rings]
        for idx_p, (p0, p1) in enumerate(zip(pts, pts[1:])):
            rod(S, p0, p1, 0.21 - idx_p * 0.014, P2['gilt2'], segs=4, r2=0.19 - idx_p * 0.014, smooth=False, pat=PT['metal'])
    zt = DOME_Z0 + rings[-1][0]                      # 96.60 m
    ngon_frustum(S, 8, zt - 0.14, zt + 0.18, 1.76, 1.48, P2['gilt2'], PT['metal'], top=True)
    moulding(S, 8, zt + 0.18, [(0.38, 1.60, 1.56), (0.19, 1.74, 1.74)], marble, PT['plain'], rot=math.pi / 8)
    dome_top = zt + 0.75                             # 97.35 m exact -> smoke_emitter = 96.35 m!

    # Beacon brazier + mirror pivot ring (unchanged clearances for mirror_parts2)
    ngon_frustum(S, 12, Z_GAL, Z_GAL + 0.4, 3.3, 3.1, P2['bronze_dark'], PT['metal'])
    for k in range(3):
        a = TAU * k / 3
        rod(S, (1.8 * math.cos(a), 1.8 * math.sin(a), Z_GAL + 0.4), (1.1 * math.cos(a), 1.1 * math.sin(a), Z_GAL + 1.2),
            0.18, P2['bronze'], segs=4, smooth=False, pat=PT['metal'])
    ngon_frustum(S, 12, Z_GAL + 1.0, Z_GAL + 2.0, 0.9, 2.1, P2['bronze'], PT['metal'], top=False, bot=True)
    ngon_ring(S, 12, Z_GAL + 2.0, Z_GAL + 2.22, 2.25, 1.9, P2['gilt2'], PT['metal'])
    return dome_top


def figure_helios2(mb, base):
    """Refined gilded Helios (no cloak quad, v2's 3D 11-ray radiate crown tipped up for the diorama diagonal):
    fluted chiton drapery, belted waist, rounded deltoid shoulders + tapered trapezius (zero boxy shelf),
    diagonal himation strap, sculpted lathed head, sculpted beacon torch (tip at local z = 7.500 -> world 108.225 m),
    and plinth-planted royal sceptre."""
    B = Vector(base); up = Vector((0, 0, 1)); f = Vector((0, -1, 0)); s = Vector((1, 0, 0))
    g, gb, gd, br = P2['gilt2'], P2['gilt_bright'], P2['gilt_deep'], P2['bronze_dark']
    # Two-step octagonal bronze/gilt base (0 .. 0.45)
    ngon_frustum(mb, 8, B.z, B.z + 0.26, 1.22, 1.16, br, PT['metal'], rot=math.pi / 8, cx=B.x, cy=B.y, bot=False)
    ngon_frustum(mb, 8, B.z + 0.26, B.z + 0.45, 1.12, 1.06, gd, PT['metal'], rot=math.pi / 8, cx=B.x, cy=B.y, bot=False)
    z0 = B.z + 0.45

    # 12-facet fluted chiton drapery (z0 .. z0 + 2.45)
    n_dr = 12
    z_w = z0 + 2.45
    R_b = (0.84, 0.74) * (n_dr // 2)
    R_w = (0.58, 0.50) * (n_dr // 2)
    A_d = [mb.vert((B.x + R_b[k] * math.cos(TAU * k / n_dr), B.y + R_b[k] * math.sin(TAU * k / n_dr), z0)) for k in range(n_dr)]
    B_d = [mb.vert((B.x + R_w[k] * math.cos(TAU * k / n_dr), B.y + R_w[k] * math.sin(TAU * k / n_dr), z_w)) for k in range(n_dr)]
    for k in range(n_dr):
        k2 = (k + 1) % n_dr
        mb.face((A_d[k], A_d[k2], B_d[k2], B_d[k]), g if k % 2 == 0 else gd, PT['metal'], smooth=False)

    # Belted waist, athletic chest, tapered trapezius & rounded deltoid shoulder bar
    ngon_frustum(mb, 8, z_w - 0.04, z_w + 0.20, 0.60, 0.60, gb, PT['metal'], cx=B.x, cy=B.y)
    sh = z0 + 3.70                           # 4.15 m local (same as v2)
    ngon_frustum(mb, 8, z_w + 0.20, sh - 0.12, 0.55, 0.76, g, PT['metal'], cx=B.x, cy=B.y, top=False, smooth=True)
    ngon_frustum(mb, 8, sh - 0.12, sh + 0.22, 0.76, 0.36, g, PT['metal'], cx=B.x, cy=B.y, top=False, smooth=True)
    rod(mb, B - s * 0.74 + up * (sh - B.z - 0.02), B + s * 0.74 + up * (sh - B.z - 0.02), 0.30, g, segs=6, cap=True, smooth=True, pat=PT['metal'])
    rod(mb, B - s * 0.56 + up * (sh - B.z + 0.06) + f * 0.35, B + s * 0.42 + up * (z_w - B.z + 0.14) + f * 0.42, 0.12, gb, segs=5, pat=PT['metal'])

    # Neck, lathed heroic head & v2's larger 3D radiate solar crown (11 tipped rays + zenith ray)
    rod(mb, B + up * (sh - B.z + 0.18), B + up * (sh - B.z + 0.56), 0.19, g, segs=6, pat=PT['metal'])
    hz = sh + 0.85
    lathe_z(mb, B.x, B.y, [
        (0.24, hz - 0.34), (0.34, hz - 0.06), (0.36, hz + 0.14), (0.27, hz + 0.34), (0.0, hz + 0.42)
    ], gb, PT['metal'], segs=8, smooth=True)
    hc = Vector((B.x, B.y, hz + 0.02))
    ngon_ring(mb, 9, hz - 0.02, hz + 0.14, 0.40, 0.30, gb, PT['metal'])
    for k in range(11):
        a = TAU * k / 11 + 0.15
        dirv = Vector((math.cos(a) * math.cos(0.5), math.sin(a) * math.cos(0.5), math.sin(0.5)))
        rod(mb, hc + dirv * 0.34, hc + dirv * 1.20, 0.082, gb, segs=3, r2=0.012, smooth=False, pat=PT['metal'])
    rod(mb, hc + up * 0.30, hc + up * 1.25, 0.082, gb, segs=3, r2=0.012, smooth=False, pat=PT['metal'])

    # Right arm raised straight up with sculpted beacon torch ending at EXACT local z = 7.500 (-> 108.225 m world)
    rs = B + s * 0.78 + up * (sh - B.z + 0.02)
    relb = rs + s * 0.13 + up * 1.08
    rhand = relb + s * 0.02 + up * 1.00       # rhand.z = 6.25
    rod(mb, rs, relb, 0.22, g, segs=6, r2=0.18, smooth=True, pat=PT['metal'])
    rod(mb, relb, rhand, 0.18, g, segs=6, r2=0.15, smooth=True, pat=PT['metal'])
    rod(mb, rhand - up * 0.45, rhand + up * 0.52, 0.10, gd, segs=5, smooth=False, pat=PT['metal'])
    lathe_z(mb, rhand.x, rhand.y, [
        (0.14, rhand.z + 0.48), (0.40, rhand.z + 0.78), (0.32, rhand.z + 0.94), (0.18, rhand.z + 1.12), (0.0, B.z + 7.500)
    ], gb, PT['metal'], segs=6, smooth=True, cols=[gd, g, gb, gb])

    # Left arm clasping tall royal solar sceptre planted squarely ON the plinth
    ls = B - s * 0.78 + up * (sh - B.z + 0.02)
    lelb = ls - s * 0.14 - up * 0.92 + f * 0.10
    lhand = Vector((B.x - 0.86, B.y - 0.34, lelb.z + 0.24))
    rod(mb, ls, lelb, 0.21, g, segs=6, r2=0.17, smooth=True, pat=PT['metal'])
    rod(mb, lelb, lhand, 0.17, g, segs=6, r2=0.14, smooth=True, pat=PT['metal'])
    sp = Vector((lhand.x, lhand.y, B.z + 0.44))
    rod(mb, sp, Vector((lhand.x, lhand.y, lhand.z + 1.62)), 0.075, gd, segs=4, smooth=False, pat=PT['metal'])
    lathe_z(mb, lhand.x, lhand.y, [
        (0.08, lhand.z + 1.56), (0.22, lhand.z + 1.76), (0.13, lhand.z + 1.92), (0.0, lhand.z + 2.18)
    ], gb, PT['metal'], segs=6, smooth=False)
    return Vector((rhand.x, rhand.y, B.z + 7.500))


def mirror_parts2():
    """The bronze mirror in the 'mirror' node's frame (v2's larger R 2.5 m gilt-rimmed disc, unchanged clearances)."""
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
        F.face([A[k], A[k2], B[k2], B[k]], P2['bronze'], PT['metal'])
        F.face([B[k], B[k2], cb], P2['bronze_dark'], PT['metal'])
    lip_o = [F.vert(p) for p in ring(R * 1.13, back - 0.05)]
    lip_b = [F.vert(p) for p in ring(R * 1.13, back + 0.18)]
    for k in range(n):
        k2 = (k + 1) % n
        F.face([A[k2], A[k], lip_o[k], lip_o[k2]], P2['gilt2'], PT['metal'])
        F.face([lip_o[k2], lip_o[k], lip_b[k], lip_b[k2]], P2['gilt2'], PT['metal'])
    zb = Z_GAL + 0.12 - MIRROR_Z
    for sd in (-1, 1):
        rod(F, (sd * 2.45, back - 0.2, zb), (sd * 2.95, back + 0.2, zc), 0.15, P2['bronze_dark'], segs=4, smooth=False, pat=PT['metal'])
    rod(F, (-2.45, back - 0.2, zb), (2.45, back - 0.2, zb), 0.17, P2['bronze_dark'], segs=4, smooth=False, pat=PT['metal'])
    rod(F, (0, back - 0.2, zb), (0, 0.6, zb + 0.05), 0.2, P2['bronze_dark'], segs=4, smooth=False, pat=PT['metal'])
    rod(F, Vector((0, back + depth + 0.65, zc)), Vector((0, back + depth + 0.95, zc)), 0.62, P2['gilt2'], segs=8, cap=True, smooth=False, pat=PT['metal'])
    return D, F


def ensure_pharos_materials():
    ensure_export_materials()
    for nm in ('hb_window', 'hb_fire', 'hb_mirror'):
        material(nm)
    em = material('hb_emissive')
    try:
        em.use_nodes = True
    except Exception:
        pass
    p = em.node_tree.nodes.get('Principled BSDF') if em.node_tree else None
    if p is not None:
        # Dark charred-coal base by day so unlit courtyard braziers read as dark charcoal inside bronze bowls
        p.inputs['Base Color'].default_value = (*lin('#261712'), 1.0)
        p.inputs['Roughness'].default_value = 0.78
        p.inputs['Emission Color'].default_value = (1.0, 0.44, 0.12, 1.0)
        p.inputs['Emission Strength'].default_value = 1.0


def build(coll=None):
    """Build the whole Pharos v2 under an empty 'pharos'. Returns (root, info)."""
    import random
    rng = random.Random(7)
    ensure_pharos_materials()
    root = empty('pharos', (0, 0, 0), coll=coll)
    S, W, CE = MB(seed=11), MB(seed=12), MB(seed=13)
    counts = {}

    def mark(name):
        counts[name] = S.tris() - sum(counts.values())
    brazier_pos = build_platform(S, CE, rng); mark('platform')
    tier1(S, W, rng); mark('tier1')
    yface = portal(S); mark('portal')
    zt = cornice1(S); mark('cornice1')
    ped, zp = terrace1(S, zt); mark('terrace1')
    for sx in (-1, 1):
        for sy in (-1, 1):
            figure_triton2(S, (sx * ped, sy * ped, zp), (sx, sy, 0),
                           turn=-1.1 if (sx, sy) == (1, -1) else 0.0, lean=(sx, sy) == (-1, 1))
    mark('tritons')
    for sx in (-1, 1):
        figure_pharaoh2(S, (sx * 9.8, -PLAT + 8.5, 0.02), (0, -1, 0), scale=1.5)
    mark('pharaohs')
    zt2 = octagon(S, W, rng, zt); mark('octagon')
    zg = drum(S, W, rng, zt2); mark('drum')
    dome_top = lantern(S); mark('lantern')
    to_object(S, 'tower', 'hb_opaque', parent=root, coll=coll)
    to_object(W, 'tower_windows', 'hb_window', parent=root, coll=coll)
    to_object(CE, 'courtyard_embers', 'hb_emissive', parent=root, coll=coll)
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
    for idx, (bx, by, bz) in enumerate(brazier_pos):
        empty(f'brazier_{idx}', (bx, by, bz), parent=root, coll=coll)
    info = dict(Z_T1TOP=zt, Z_T2TOP=zt2, Z_GAL=zg, DOME_TOP=dome_top, yface=yface, hand_z=hand.z, fire_z=FIRE_Z,
                mirror_z=MIRROR_Z, platform=PLAT * 2, podium=PODIUM, triton_z=(zp, zp + 2.95 * 2.3, zp + 5.7 * 2.3), version=VERSION)
    info.update({'tris_' + k: v for k, v in counts.items()})
    return root, info


def stats(root):
    return v1.stats(root)
