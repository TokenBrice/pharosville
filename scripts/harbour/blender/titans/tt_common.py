"""Shared geometry, hull lofting, classical rigging, and architectural ornaments for the Top-10 Titans.

Respects Seam S-4: imports only stable existing signatures from `../hulls/` (`hb_lib`, `hb_hulls`, `hb_ancient`).
"""
import math
import os
import sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
HULLS_DIR = os.path.abspath(os.path.join(HERE, '..', 'hulls'))
if HULLS_DIR not in sys.path:
    sys.path.insert(0, HULLS_DIR)

import hb_lib  # noqa: E402
import hb_hulls  # noqa: E402
import hb_ancient  # noqa: E402
from hb_lib import (  # noqa: E402
    PAL, PT, MB, lin, smoothstep, basis, rod, line, box, box2, empty, to_object, tri_count, descendants, material,
)
from hb_hulls import Hull, Rig, SCH, _flip  # noqa: E402
from hb_ancient import AncientRig, ANCIENT_FORMS, chain, arc  # noqa: E402

# Pattern ID 14 = PATTERN_LEAF_EVERGREEN (src/harbour/world/shaders/patterns.ts) — stays lush green all year.
PT_EVERGREEN = 14

# Complete Top-10 Classical Titan Palette (carefully calibrated against src/harbour/world/metal.ts!).
# - Gilt `#E4B444` (linear 0.776, 0.456, 0.058): cleanly passes metal.ts gilt (r > 0.6, g/r in 0.5..0.68, b/r < 0.13).
# - Ochre `#C98C28` (linear 0.584, 0.262, 0.021): cleanly stays dielectric paint (r < 0.6).
# - Aged Bronze `#A0703A` & Copper-Bronze `#B5683C` + PT['metal']: passes metal.ts warm bronze (k = 2).
# - Verdigris Bronze `#4E8677` + PT['metal']: passes metal.ts verdigris (k = 3).
# - Satin Silver `#C4CACF` + PT['metal']: passes W3's metal.ts satin silver (k = 4).
TITAN_HEX = {
    # Shared precious metals & masonry
    'gilt': '#E4B444',
    'gilt_deep': '#D9A93E',
    'bronze': '#A0703A',
    'copper': '#B5683C',
    'silver': '#C4CACF',
    'silver_dk': '#8C949B',
    'verdigris': '#5DA28F',
    'pitch': '#25201C',
    'ebony': '#231B15',
    'marble': '#ECE5D5',
    'pentelic': '#F0EBE0',
    'alabaster': '#F0E7D4',
    'ivory': '#F1EDE2',
    'bone': '#EAE4D4',
    'ivory_crisp': '#F2EFE7',
    'sandstone': '#DFD2B8',
    'stone': '#9C968C',
    'terracotta': '#B35538',
    'terracotta_dk': '#8E3E26',
    'cedar': '#6E4526',
    'oak': '#7B5434',
    'timber_deck': '#9E7D54',
    'deck_dark': '#7D6040',
    'canvas_warm': '#EFE8D8',
    'canvas_pearl': '#E6E7E5',
    'canvas_ivory': '#F3EEE1',
    # #1 USDT
    'emerald': '#1F6B52',
    'emerald_lt': '#2E8D6B',
    # #2 USDC
    'navy': '#1A2F4F',
    'cobalt_circle': '#2C67B0',
    # #3 USDe
    'obsidian': '#1A1D21',
    'slate': '#2F353B',
    'pine': '#4C7A3D',
    'pine_lt': '#6D9C4F',
    'cypress': '#3D6634',
    'vine': '#7BA046',
    'soil': '#483224',
    # #4 DAI
    'ochre': '#C98C28',
    'ochre_lt': '#D49E3C',
    # #5 USDS
    'sunset': '#C85A24',
    'sunset_lt': '#DF7436',
    'cerulean': '#5394C4',
    'cerulean_dk': '#356E9E',
    'flame': '#F08A24',
    'flame_lt': '#FFD25A',
    # #6 RLUSD
    'aegean': '#154A96',
    'seafoam': '#54B4C2',
    'seafoam_lt': '#76CFD9',
    # #7 USD1
    'navy_imp': '#1A2B48',
    'crimson': '#9A2B26',
    'crimson_dk': '#781F1C',
    # #8 XAUT
    'tyrian': '#7A2434',
    'tyrian_lt': '#983246',
    # #9 USDG
    'olive': '#354B24',
    'olive_lt': '#4D6A34',
    # #10 PYUSD
    'sapphire': '#1D3C6E',
    'sapphire_lt': '#2D5899',
    # Night window daylight backing (warm amber glass tint; lit at night by hb_fleet_window)
    'win_dark': '#3E2B1A',
    'win_amber': '#8C5A24',
    'win_gold': '#C8882C',
}
TP = {k: lin(v) for k, v in TITAN_HEX.items()}


def ensure_titan_materials():
    """Ensure all 5 fleet export materials exist with clean Principled BSDF nodes wired to Col."""
    hb_lib.ensure_export_materials()
    for nm, rough, double in (('hb_emissive', 0.4, False), ('hb_fleet_window', 0.35, False)):
        m = material(nm)
        try:
            m.use_nodes = True
        except Exception:
            pass
        nt = m.node_tree
        p = nt.nodes.get('Principled BSDF') if nt else None
        if p is not None and not any(n.type == 'ATTRIBUTE' for n in nt.nodes):
            a = nt.nodes.new('ShaderNodeAttribute')
            a.attribute_name = 'Col'
            nt.links.new(a.outputs['Color'], p.inputs['Base Color'])
            p.inputs['Roughness'].default_value = rough
        m.use_backface_culling = not double


def face_oriented(mb, idx, want_dir, col, pat=0, brand=0.0, uv=None, uv2=None, smooth=False, jitter=0.0):
    """Add a face guaranteed to point along `want_dir` (eliminates inverted normals)."""
    if len(idx) < 3:
        return
    v0, v1, v2 = mb.v[idx[0]], mb.v[idx[1]], mb.v[idx[2]]
    n = (v1 - v0).cross(v2 - v0)
    if n.dot(Vector(want_dir)) < 0:
        idx = list(idx)[::-1]
        if uv is not None:
            uv = list(uv)[::-1]
        if uv2 is not None:
            uv2 = list(uv2)[::-1]
    mb.face(idx, col, pat, brand, uv=uv, uv2=uv2, smooth=smooth, jitter=jitter)


def quad_oriented(mb, pts, want_dir, col, pat=0, brand=0.0, smooth=False, jitter=0.0):
    ids = [mb.vert(p) for p in pts]
    face_oriented(mb, ids, want_dir, col, pat=pat, brand=brand, smooth=smooth, jitter=jitter)


def poly_oriented(mb, pts, want_dir, col, pat=0, brand=0.0, smooth=False, jitter=0.0):
    ids = [mb.vert(p) for p in pts]
    face_oriented(mb, ids, want_dir, col, pat=pat, brand=brand, smooth=smooth, jitter=jitter)


# ------------------------------------------------------------------ sail trims (non-uniform patch)
def trim_patch(mb, us, vs, P, Pf, col, foot=None, uv=None, uv2=None, smooth=True, pat=0, brand=0.0, jitter=0.0, tri_head=False):
    """Non-uniform grid patch with optional foot-band color (row i == 0)."""
    nu, nv = len(us) - 1, len(vs) - 1
    grid = []
    for i, v in enumerate(vs):
        if tri_head and i == nv:
            k = mb.vert(P(0.5, 1.0), Pf(0.5, 1.0))
            grid.append([k] * (nu + 1))
            continue
        grid.append([mb.vert(P(u, v), Pf(u, v)) for u in us])
    for i in range(nv):
        for j in range(nu):
            q = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
            uvs = [uv(us[jj], vs[ii]) for ii, jj in q] if uv else None
            uv2s = [uv2(us[jj], vs[ii]) for ii, jj in q] if uv2 else None
            c = foot if (foot is not None and i == 0) else col
            mb.face([grid[ii][jj] for ii, jj in q], c, pat, brand, uv=uvs, uv2=uv2s, smooth=smooth, jitter=jitter)
    return grid


# ------------------------------------------------------------------ stepped classical TitanHull
class TitanHull(Hull):
    """Classical Titan hull supporting stepped castles, proud 3D rubbing wales, and 4-strip cambered deck.

    Preserves full Hull API (`w`, `zt`, `zk`, `x`, `u_at`, `deck`, `half`, `bow`, `stern`) for
    compatibility with `AncientRig` and `lineup.py`.
    """

    def __init__(s, L, F):
        super().__init__(L, F)
        s.fore_step = F.get('fore_step', None)   # (u_start, h_add) smooth raised forecastle
        s.aft_step = F.get('aft_step', None)     # (u_end, h_add)   smooth raised sterncastle / quarterdeck
        s.tumblehome = F.get('tumblehome', 0.03) # inward lean at sheer (>0 merchant, <0 flared cruiser/galley)
        s.wale_out = F.get('wale_out', 0.085)    # proud rubbing wale projection (m)
        s.deck_camber = F.get('deck_camber', 0.045)

    def _step_h(s, u):
        dh = 0.0
        if s.fore_step is not None:
            u0, h = s.fore_step
            dh += h * smoothstep(u0 - 0.10, u0 + 0.08, u)
        if s.aft_step is not None:
            u1, h = s.aft_step
            dh += h * smoothstep(u1 + 0.10, u1 - 0.08, u)
        return dh

    def zt(s, u):
        return super().zt(u) + s._step_h(u)

    def crown_z(s, u):
        return s.zt(u) - s.bh + s.deck_camber * s.B * 0.5

    def titan_profile(s, u):
        """Hull cross-section with interior bulwark, overhanging cap rail, 2 proud 3D wales (zosteres),
        midship decorative band, painted boot-top, and deep wineglass keel."""
        w = s.w(u)
        zt = s.zt(u)
        zk = s.zk(u)
        fb = s.fb
        bowk = max(u, 0.0) ** 2
        zbt = s.boot * (1.0 + 0.25 * u * u)
        th = s.th
        wo = s.wale_out * (0.45 + 0.55 * (1.0 - min(1.0, u * u)))
        # Tumblehome / flare modulation on upper topside
        top_k = 1.0 - s.tumblehome * (1.0 - u * u)
        w_top = w * top_k
        z_cap_bot = zt - s.cap
        z_stripe = z_cap_bot - s.stripe
        z_band_hi = z_stripe - (z_stripe - zbt) * 0.15
        z_band_lo = z_stripe - (z_stripe - zbt) * 0.54
        w_mid = w * (0.995 - 0.02 * bowk)
        kw = 0.94 - 0.12 * bowk
        pts = []
        if s.bh > 0.0:
            pts.append(('deck_in', max(w_top - th, 0.02), zt - s.bh))
        pts += [
            ('cap', max(w_top - th, 0.02), zt),
            ('cap', w_top + th * 0.45, zt + 0.015),                     # proud overhanging cap rail
            ('stripe', w_top + wo * 0.85, z_cap_bot),                   # upper rubbing wale (zoster 1)
            ('top', w_top, z_stripe),
            ('band', w_mid + wo, z_band_hi),                            # lower rubbing wale / frieze (zoster 2)
            ('top', w_mid, z_band_lo),
            ('boot', w * kw, zbt),
            ('bottom', w * (kw - 0.06), -0.07 * fb),
            ('bottom', w * 0.60, zk * 0.64),
            (None, 0.0, zk),
        ]
        return pts


def loft_titan_hull(mb, H, sch, n=14, pats=None):
    """Loft a smooth classical Titan hull with 3D wales, 4-strip cambered deck, and ZERO _PAINT/_BRAND."""
    pats = pats or {}
    # Cosine-biased stations: slightly tighter near bow/stern curves while keeping clean section count.
    us = []
    for i in range(n + 1):
        t = i / n
        u = -1.0 + 2.0 * t
        # Gentle clustering toward ends (15%) for crisp prows and sterns.
        u_c = -math.cos(math.pi * t)
        us.append(0.82 * u + 0.18 * u_c)
    us[0], us[-1] = -1.0, 1.0

    secs = []
    deck_rows = []
    for u in us:
        pr = H.titan_profile(u)
        port, stbd = [], []
        for (nm, y, z) in pr[:-1]:
            x = H.x(u, z)
            port.append(mb.vert((x, y, z)))
            stbd.append(mb.vert((x, -y, z)))
        zk = pr[-1][2]
        k = mb.vert((H.x(u, zk), 0.0, zk))
        port.append(k)
        stbd.append(k)
        secs.append((port, stbd, [p[0] for p in pr]))

        # 4-strip cambered recessed deck: stbd_edge -> stbd_mid -> crown -> port_mid -> port_edge
        w_in = pr[0][1]
        z_ed = pr[0][2]
        x_ed = H.x(u, z_ed)
        camb = H.deck_camber * w_in
        d_row = [
            stbd[0],
            mb.vert((x_ed, -w_in * 0.52, z_ed + camb * 0.72)),
            mb.vert((x_ed, 0.0, z_ed + camb)),
            mb.vert((x_ed, w_in * 0.52, z_ed + camb * 0.72)),
            port[0],
        ]
        deck_rows.append(d_row)

    smooth_seg = {'top', 'band', 'boot', 'bottom', 'stripe'}
    pat_map = dict(
        deck=PT['planks_y'], top=PT['strakes'], band=PT['strakes'],
        deck_in=PT['boards'], transom=PT['strakes'], cap=0, stripe=0, boot=0, bottom=0,
    )
    pat_map.update(pats)

    for i in range(n):
        (pa, sa, names), (pb, sb, _) = secs[i], secs[i + 1]
        for k in range(len(pa) - 1):
            nm = names[k]
            col = sch[nm]
            pat = pat_map.get(nm, 0)
            sm = nm in smooth_seg
            mb.face((pa[k], pb[k], pb[k + 1], pa[k + 1]), col, pat, 0.0, smooth=sm, jitter=0.0, paint=0.0)
            mb.face((sa[k], sa[k + 1], sb[k + 1], sb[k]), col, pat, 0.0, smooth=sm, jitter=0.0, paint=0.0)
        # 4-strip cambered deck (margin dark -> central crown planks)
        da, db = deck_rows[i], deck_rows[i + 1]
        for j in range(4):
            dcol = sch.get('deck_margin', sch['deck']) if j in (0, 3) else sch['deck']
            mb.face((da[j], db[j], db[j + 1], da[j + 1]), dcol, pat_map['deck'], 0.0, smooth=False, jitter=0.0, paint=0.0)

    # Stern transom & bow stem closure
    pa, sa, _ = secs[0]
    mb.face(pa + sa[-2::-1], sch['transom'], pat_map['transom'], 0.0, smooth=False, jitter=0.0, paint=0.0)
    pb, sb, _ = secs[-1]
    mb.face((pb + sb[-2::-1])[::-1], sch['top'], pat_map['top'], 0.0, smooth=False, jitter=0.0, paint=0.0)
    return secs


# ------------------------------------------------------------------ shared architectural & ornamental builders
def gable(mb, x0, x1, y0, y1, z, h, roof, tymp, roof_pat=PT['tiles'], ridge_col=None):
    """Pitched classical roof along x with fore/aft pediments (tympana) and optional ridge beam."""
    yc = (y0 + y1) * 0.5
    a, b, c, d = (x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)
    r0, r1 = (x0, yc, z + h), (x1, yc, z + h)
    V = lambda p: mb.vert(p)
    quad_oriented(mb, (a, b, r1, r0), (0, -1, 1), roof, pat=roof_pat, jitter=0.0)
    quad_oriented(mb, (c, d, r0, r1), (0, 1, 1), roof, pat=roof_pat, jitter=0.0)
    poly_oriented(mb, (d, a, r0), (-1, 0, 0), tymp, pat=0, jitter=0.0)
    poly_oriented(mb, (b, c, r1), (1, 0, 0), tymp, pat=0, jitter=0.0)
    if ridge_col is not None:
        rod(mb, (x0 - 0.05, yc, z + h + 0.03), (x1 + 0.05, yc, z + h + 0.03), 0.055, ridge_col, 4, cap=True)


def hip_roof(mb, x0, x1, y0, y1, z, h, roof, inset=0.25, pat=PT['tiles']):
    """Classical Mediterranean hipped roof (all 4 slopes pitched to a short ridge)."""
    yc = (y0 + y1) * 0.5
    dx = (x1 - x0) * inset
    rx0, rx1 = x0 + dx, x1 - dx
    a, b, c, d = (x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)
    r0, r1 = (rx0, yc, z + h), (rx1, yc, z + h)
    quad_oriented(mb, (a, b, r1, r0), (0, -1, 1), roof, pat=pat, jitter=0.0)
    quad_oriented(mb, (c, d, r0, r1), (0, 1, 1), roof, pat=pat, jitter=0.0)
    poly_oriented(mb, (d, a, r0), (-1, 0, 0.5), roof, pat=pat, jitter=0.0)
    poly_oriented(mb, (b, c, r1), (1, 0, 0.5), roof, pat=pat, jitter=0.0)


def dome(mb, cx, cy, z0, r, h, col, segs=10, rings=3, pat=0, smooth=True):
    """Hemispherical / classical dome with base at (cx, cy, z0), radius r, height h."""
    rows = []
    for i in range(rings):
        el = (math.pi * 0.5) * i / rings
        rr = r * math.cos(el)
        zz = z0 + h * math.sin(el)
        rows.append([mb.vert((cx + rr * math.cos(2 * math.pi * j / segs),
                              cy + rr * math.sin(2 * math.pi * j / segs), zz)) for j in range(segs)])
    apex = mb.vert((cx, cy, z0 + h))
    for i in range(rings - 1):
        r0, r1 = rows[i], rows[i + 1]
        for j in range(segs):
            j2 = (j + 1) % segs
            mb.face((r0[j], r0[j2], r1[j2], r1[j]), col, pat, 0.0, smooth=smooth, jitter=0.0)
    top = rows[-1]
    for j in range(segs):
        j2 = (j + 1) % segs
        mb.face((top[j], top[j2], apex), col, pat, 0.0, smooth=smooth, jitter=0.0)


def torus_ring(mb, center, radius, tube_r, axis_u, axis_v, col, n_seg=12, t_seg=4, pat=PT['metal']):
    """Thin 3D ring (armillary sphere rings, halo arches) oriented in plane (axis_u, axis_v)."""
    c = Vector(center)
    u = Vector(axis_u).normalized()
    v = Vector(axis_v).normalized()
    w = u.cross(v).normalized()
    rings = []
    for i in range(n_seg):
        a = 2 * math.pi * i / n_seg
        rad_dir = u * math.cos(a) + v * math.sin(a)
        p = c + rad_dir * radius
        ring = []
        for j in range(t_seg):
            b = 2 * math.pi * j / t_seg
            ring.append(mb.vert(p + (rad_dir * math.cos(b) + w * math.sin(b)) * tube_r))
        rings.append(ring)
    for i in range(n_seg):
        r0, r1 = rings[i], rings[(i + 1) % n_seg]
        for j in range(t_seg):
            j2 = (j + 1) % t_seg
            mb.face((r0[j], r1[j], r1[j2], r0[j2]), col, pat, 0.0, smooth=True, jitter=0.0)


def column(mb, x, y, z0, z1, r, col, cap_col=None, segs=6, pat=0):
    """Classical fluted-feel column with plinth base and echinus/abacus capital."""
    cap_col = cap_col or col
    h = z1 - z0
    ch = min(0.14 * h, r * 1.4)
    box(mb, (x, y, z0 + ch * 0.45), (r * 2.5, r * 2.5, ch * 0.9), cap_col, skip=('-z',), jitter=0.0)
    rod(mb, (x, y, z0 + ch * 0.8), (x, y, z1 - ch), r, col, segs, r2=r * 0.84, pat=pat, smooth=True)
    box(mb, (x, y, z1 - ch * 0.5), (r * 2.6, r * 2.6, ch), cap_col, skip=(), jitter=0.0)


# ------------------------------------------------------------------ TitanRig
class TitanRig(AncientRig):
    """Upgraded classical flagship rig supporting 1-3 square masts, hybrid split sprit-mizzen (`boom`),
    animated galley oar banks (`oars`), sculpted brailed courses, and rich night windows (`hb_fleet_window`).
    """

    def __init__(s, vid, cls, L, form, sch, seed=0, hull_pats=None):
        super().__init__(vid, 'titan', 'syracusia', cls, sch, seed, L=L)
        full_form = dict(ANCIENT_FORMS['syracusia'], **form)
        s.H = TitanHull(L, full_form)
        s.cls = cls
        s.hull_pats = hull_pats or {}
        s.pennants = []

    # -------------------------------------------------- sculpted sails & rigging
    def course_t(s, mb, mx, zy, span, zb, span_b, foot=None, emblem=False, cover=False,
                 nu=6, nv=5, belly=0.115, yard_finial=None, lifts=True):
        """Sculpted classical brailed square course with arched foot roach, asymmetric belly,
        subtle brail-pocket scalloping, coin-dyed foot band, optional yard finials and lifts."""
        yr = s.r_mast * (0.50 if emblem else 0.42)
        s.titan_yard(mx, zy, span, yr, finial=yard_finial)
        br = s._brace(mx)
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        fwd = R_ @ Vector((1, 0, 0))
        up = Vector((0, 0, 1))
        x0 = mx + s.r_mast * 0.9
        rf = max(0.14, 0.11 * (zy - zb) ** 0.7 + 0.06 * s.S)
        h = zy - zb

        def flat(u, v):
            wv = span_b + (span - span_b) * v
            roach = 0.055 * h * math.sin(math.pi * u) * (1.0 - v) ** 1.3
            return br(Vector((x0, -wv * 0.5 + wv * u, zb + h * v + roach)))

        def P(u, v):
            base = flat(u, v)
            su = math.sin(math.pi * u)
            sv = math.sin(math.pi * (0.16 + 0.70 * (1.0 - v)))
            # Subtle brail-cord scalloping along the sail cloth
            brail = -0.014 * span * abs(math.sin(4.0 * math.pi * u)) * (1.0 - v) * su
            return base + fwd * (belly * span * su * sv + brail)

        def Pf(u, v):
            th = math.pi * (0.1 + 1.7 * (1.0 - v))
            k = 0.55 + 0.45 * math.sin(math.pi * (0.1 + 0.8 * u))
            c = br(Vector((x0 + rf * 0.28, (-span * 0.5 + span * u) * 0.90, zy + rf * 0.50)))
            return c + rf * k * (0.6 + 0.4 * v) * (math.cos(th) * fwd + math.sin(th) * up) * 0.30

        us = [j / nu for j in range(nu + 1)]
        if foot is None:
            vs = [i / nv for i in range(nv + 1)]
        elif nv >= 5:
            vs = [0.0, 0.11, 0.34, 0.57, 0.79, 1.0]
        else:
            vs = [0.0, 0.12, 0.42, 0.72, 1.0]

        uv2f = None
        if emblem:
            v0 = vs[1] if foot is not None else 0.0
            e1 = (flat(1.0, 0.5) - flat(0.0, 0.5)).normalized()
            e2 = Vector((0, 0, 1))
            centre = (flat(0.5, v0) + flat(0.5, 1.0)) * 0.5
            size = min(h * (1.0 - v0) / 1.12, (span_b + span) * 0.5 * 0.80)
            s.emblem = (centre, size)
            uv2f = lambda p: ((p - centre).dot(e1) / size + 0.5, (p - centre).dot(e2) / size + 0.5)

        trim_patch(
            mb, us, vs, P, Pf, s.sch['cloth'], foot=foot,
            uv=lambda u, v: (u, v),
            uv2=(lambda u, v: uv2f(flat(u, v))) if uv2f else (lambda u, v: (-4.0, -4.0)),
            smooth=True,
        )
        s.lod['squares'].append((mx, zb, zy, span_b, span))
        if cover:
            s.titan_brail_cover(mx, zy, span, zb, nf=5, segs=6)
        if lifts:
            # Yard lifts from just below masthead down to yardarms (on s.yards so they mirror with the yard on port tack)
            mt = Vector((mx, 0, zy + 0.048 * s.L))
            for sd in (-1, 1):
                y_tip = br(Vector((mx + s.r_mast * 0.6, sd * span * 0.44, zy)))
                line(s.yards, mt, y_tip, s.rope * 0.72, s.sch['spar'])

    def titan_yard(s, mx, z, span, r, finial=None):
        """Tapered classical yard with optional gilt/silver/bronze end finials."""
        br = s._brace(mx)
        c = Vector((mx + s.r_mast * 0.6, 0, z))
        for sd in (-1, 1):
            tip = c + Vector((0, sd * span * 0.5, 0))
            rod(s.yards, br(c), br(tip), r, s.sch['spar'], 5, r2=r * 0.52)
            if finial is not None:
                f_end = c + Vector((0, sd * (span * 0.5 + r * 2.2), 0))
                rod(s.yards, br(tip), br(f_end), r * 0.68, finial, 5, r2=r * 0.25, cap=True, pat=PT['metal'])

    def titan_brail_cover(s, mx, zy, span, zb, nf=5, segs=6):
        """Plump 5-swag gathered brail roll with cinched dark-hemp lashing bands."""
        br = s._brace(mx)
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        fwd = R_ @ Vector((1, 0, 0))
        up = Vector((0, 0, 1))
        rf = max(0.15, 0.095 * (zy - zb) ** 0.7 + 0.055 * s.S)
        x0 = mx + s.r_mast * 0.9
        ry = s.r_mast * 0.20
        nr = 2 * nf + 1
        rings = []
        for i in range(nr):
            t = i / (nr - 1)
            y = (-span * 0.5 + span * t) * 0.88
            is_cinch = (i % 2 == 0)
            fest = 0.0 if is_cinch else 1.0
            taper = 0.58 + 0.42 * math.sin(math.pi * min(1.0, 0.08 + 0.84 * t))
            c_set = br(Vector((mx + s.r_mast * 0.6, y, zy)))
            c_f = br(Vector((x0 + rf * 0.25, y, zy + rf * 0.16)))
            rc = (rf * (0.72 if is_cinch else 1.02) + 0.025) * taper
            ring = []
            for j in range(segs):
                a = 2 * math.pi * j / segs
                ca, sa = math.cos(a), math.sin(a)
                d = ca * fwd + sa * up
                sag = up * (-(rf * 0.88 + 0.06) * fest * max(0.0, -sa)) if sa < 0 else Vector()
                ring.append((s.cover_y.vert(c_set + d * ry, c_f + d * rc + sag), sa, is_cinch))
            rings.append(ring)
        for r0, r1 in zip(rings, rings[1:]):
            for j in range(segs):
                j2 = (j + 1) % segs
                savg = 0.5 * (r0[j][1] + r0[j2][1])
                cinch_dark = 0.86 if (r0[j][2] or r1[j][2]) else 1.0
                shade = (0.80 + 0.20 * max(0.0, savg)) * cinch_dark
                s.cover_y.face((r0[j][0], r1[j][0], r1[j2][0], r0[j2][0]), (shade, shade, shade), 0, smooth=True, jitter=0.0)
        s.cover_y.face([v for v, _, _ in rings[0]], (0.82, 0.82, 0.82), jitter=0.0)
        s.cover_y.face([v for v, _, _ in rings[-1]][::-1], (0.82, 0.82, 0.82), jitter=0.0)
        s.lod['cover'] = (mx, zy, span, rf)

    def siparum_t(s, mx, zy, span, top, nu=4, nv=3, foot=None):
        """Upgraded 4x3 triangular topsail (siparum) with crisp wind belly."""
        br = s._brace(mx)
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        fwd = R_ @ Vector((1, 0, 0))
        up = Vector((0, 0, 1))
        x0 = mx + s.r_mast * 0.9
        zh = top.z - 0.16

        def P(u, v):
            w = span * (1.0 - v)
            return br(Vector((x0, -w * 0.5 + w * u, zy + 0.14 + (zh - zy - 0.14) * v))) + fwd * (0.06 * span * math.sin(math.pi * u) * (1.0 - v))

        def Pf(u, v):
            r = 0.08 + 0.022 * s.L * (1.0 - v)
            th = math.pi * (0.2 + 1.4 * v)
            return br(Vector((x0 + 0.05, (-span * 0.5 + span * u) * 0.78 * (1.0 - 0.5 * v), zy + 0.18))) + r * (math.cos(th) * fwd + math.sin(th) * up) * 0.45

        us = [j / nu for j in range(nu + 1)]
        vs = [i / nv for i in range(nv + 1)]
        trim_patch(s.extra, us, vs, P, Pf, s.sch['cloth'], foot=foot,
                   uv=lambda u, v: (u, v), uv2=lambda u, v: (-4.0, -4.0), smooth=True, tri_head=True)
        s.lod['squares'].append((mx, zy + 0.14, zh, span, 0.05))

    def artemon_t(s, rake_deg=38.0, h=None, span=None, nu=4, nv=3, x_frac=None, finial=None):
        """Upgraded 4x3 raked bow artemon sail (second component of sail_main, emblem-free)."""
        H, L = s.H, s.L
        bw = H.bow()
        x = (H.x0 + x_frac * L) if x_frac is not None else (bw.x - 0.075 * L)
        h = h or 0.30 * L
        _, top = s.mast_at(x, h, s.r_mast * 0.58, rake=-math.radians(rake_deg))
        span = span or 0.26 * L
        zy = top.z - 0.045 * L
        sh = 0.56 * (zy - H.deck(x))
        mxy = top.x - 0.02 * L
        s.titan_yard(mxy, zy, span, s.r_mast * 0.34, finial=finial)
        br = s._brace(mxy)
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        fwd = R_ @ Vector((1, 0, 0))
        up = Vector((0, 0, 1))
        x0 = mxy + s.r_mast * 0.65
        zb = zy - sh
        span_b = span * 0.94
        rf = max(0.10, 0.09 * sh ** 0.7)

        def P(u, v):
            wv = span_b + (span - span_b) * v
            return br(Vector((x0, -wv * 0.5 + wv * u, zb + sh * v))) + fwd * (0.09 * span * math.sin(math.pi * u) * math.sin(math.pi * (0.2 + 0.65 * (1.0 - v))))

        def Pf(u, v):
            th = math.pi * (0.1 + 1.7 * (1.0 - v))
            c = br(Vector((x0 + rf * 0.25, (-span * 0.5 + span * u) * 0.85, zy + rf * 0.4)))
            return c + rf * 0.22 * (math.cos(th) * fwd + math.sin(th) * up)

        us = [j / nu for j in range(nu + 1)]
        vs = [i / nv for i in range(nv + 1)]
        trim_patch(s.main_sq, us, vs, P, Pf, s.sch['cloth'],
                   uv=lambda u, v: (u, v), uv2=lambda u, v: (-4.0, -4.0), smooth=True)
        s.lod['squares'].append((mxy, zb, zy, span_b, span))
        line(s.rigging, top, bw + Vector((0.015 * L, 0, 0.0)), s.rope)
        return top

    def carchesion(s, top, col=None, r_k=1.0):
        """Classical masthead crow's-nest / calcet basket (*carchesion*) on `mast`."""
        col = col or TP['gilt']
        pat = PT['metal'] if col in (TP['gilt'], TP['bronze'], TP['silver'], TP['copper']) else 0
        r = max(0.32, s.r_mast * 2.1 * r_k)
        z0 = top.z - 0.048 * s.L
        h = r * 0.95
        rod(s.mast, (top.x, 0, z0), (top.x, 0, z0 + h * 0.25), r * 0.65, s.sch['spar'], 6, r2=r, cap=True)
        rod(s.mast, (top.x, 0, z0 + h * 0.25), (top.x, 0, z0 + h), r, s.sch['spar'], 6, r2=r * 1.08, smooth=False)
        rod(s.mast, (top.x, 0, z0 + h * 0.88), (top.x, 0, z0 + h * 1.04), r * 1.12, col, 6, r2=r * 1.12, pat=pat, smooth=False)

    def mast_course(s, kx, kh, kspan, kfoot, foot, main=False, siparum=False, r=1.0,
                    rake=0.0, carchesion_col=None, finial=None, nu=6, nv=5, belly=0.115):
        H, L = s.H, s.L
        x = H.x0 + kx * L
        _, top = s.mast_at(x, kh * L, s.r_mast * r, rake=rake)
        zy = top.z - 0.058 * L
        span = kspan * L
        zb = H.deck(x) + kfoot * L
        mx_y = top.x + (x - top.x) * (0.058 / kh)
        s.course_t(
            s.main_sq if main else s.extra, mx_y, zy, span, zb, span * 1.04,
            foot=foot, emblem=main, cover=main, nu=nu if main else max(5, nu - 1),
            nv=nv if main else max(4, nv - 1), belly=belly, yard_finial=finial,
        )
        if siparum:
            s.siparum_t(mx_y, zy, span * 0.62, top)
        if carchesion_col is not None:
            s.carchesion(top, col=carchesion_col, r_k=1.0 if main else 0.78)
        s.shrouds(top, x, 2, 0.80)
        s.pennants.append((top, (1.5 + 0.12 * L) * (1.0 if main else 0.72)))
        return x, top

    def sprit_mizzen(s, kx, kh, blen_k, foot_k=0.14, peak_deg=44.0, foot_col=None, rake_deg=5.0, nu=5, nv=4):
        """Swinging aft sprit-rigged mizzen (`boom` empty -> `boom_spar`, `gaff`, `sail_spanker`).

        Leaves `cover` empty so `sail_cover` stays unique on `_heel` (main yard brailed bundle),
        preventing any Blender `.001` collision and honoring `check-civic-contract.mjs` + `hull-kit.ts`!
        """
        H, L, S = s.H, s.L, s.S
        mx = H.x0 + kx * L
        mh = kh * L
        _, top = s.mast_at(mx, mh, s.r_mast * 0.72, rake=math.radians(rake_deg))
        st = H.stern()
        blen = min(blen_k * L, mx - st.x + 0.03 * L)
        zb = H.deck(mx) + foot_k * L
        thz = H.deck(mx) + mh * 0.64
        glen = blen * 0.74
        rb = s.r_mast * 0.48
        G = Vector((mx - s.r_mast * 0.8, 0, zb))
        ad = Vector((-1, 0, 0.06)).normalized()
        E = G + ad * blen
        up = Vector((0, 0, 1))
        side = Vector((0, 1, 0))
        boom_mb, gaff_mb, sail_mb, empty_cov = MB(s.rng.randint(1, 9999)), MB(s.rng.randint(1, 9999)), MB(s.rng.randint(1, 9999)), MB()

        rod(boom_mb, G + ad * (-0.08 * S), E, rb, s.sch['spar'], 5, r2=rb * 0.72, cap=True)
        T = G + Vector((0, 0, rb * 1.1)) + ad * (0.04 * blen)
        C = E + Vector((0, 0, rb * 0.9))
        Th = Vector((mx - s.r_mast * 0.9 - math.sin(math.radians(rake_deg)) * (thz - zb), 0, thz))
        pk = math.radians(peak_deg)
        Pk = Th + Vector((-math.cos(pk) * glen, 0, math.sin(pk) * glen))
        rf = max(0.08, 0.036 * blen)
        axis_f = lambda t: G + ad * (blen * (0.04 + 0.90 * t)) + up * (rb + rf * 0.85)

        def flat(u, v):
            return T.lerp(Th, v).lerp(C.lerp(Pk, v), u)

        def P(u, v):
            return flat(u, v) + side * (0.095 * blen * math.sin(math.pi * u) * (0.38 + 0.62 * math.sin(math.pi * (0.15 + 0.72 * (1.0 - v)))))

        def Pf(u, v):
            k = 0.45 + 0.55 * math.sin(math.pi * (0.08 + 0.84 * u))
            th = math.pi * (0.1 + 1.6 * v)
            return axis_f(u) + rf * 0.65 * k * (0.55 + 0.45 * v) * (math.cos(th) * up + math.sin(th) * side)

        us = [j / nu for j in range(nu + 1)]
        vs = [0.0, 0.14, 0.44, 0.72, 1.0] if foot_col is not None else [i / nv for i in range(nv + 1)]
        trim_patch(sail_mb, us, vs, P, Pf, s.sch['cloth'], foot=foot_col,
                   uv=lambda u, v: (u, v), uv2=lambda u, v: (-4.0, -4.0), smooth=True)
        _flip(sail_mb)

        # Diagonal sprit spar: snotter low on mast -> peak when set, lowered onto boom when furled!
        sn = Vector((mx - s.r_mast * 0.85, 0, zb + 0.18 * mh))
        fz = zb + rb + rf * 1.4
        sprit_len = (Pk - sn).length * 0.94
        rod(gaff_mb, sn, Pk, s.r_mast * 0.40, s.sch['spar'], 5,
            pf=Vector((mx - 0.04 * L, 0, fz)), qf=Vector((mx - 0.04 * L - sprit_len, 0, fz)), r2=s.r_mast * 0.28)
        mt = Vector((mx, 0, min(top.z, thz + glen * 0.7)))
        line(boom_mb, mt, E + Vector((0, 0, rb)), s.rope * 0.75)

        s.groups.append(dict(
            name='boom', G=G, boom=boom_mb, gaff=gaff_mb, sail=sail_mb, cover=empty_cov,
            sail_name='sail_spanker', E=E, Pk=Pk, Th=Th,
        ))
        s.lod['gaff'] = (mx, zb, blen, thz, glen, peak_deg, sn)
        s.shrouds(top, mx, 1, 0.82)
        s.pennants.append((top, (1.1 + 0.09 * L)))
        return mx, top

    def stays(s):
        H, L = s.H, s.L
        tops = sorted(s.tops[:], key=lambda t: t.x)
        tall = [t for t in tops if t.z > H.deck(t.x) + 0.36 * L]
        if not tall:
            return
        for a_, b_ in zip(tall, tall[1:]):
            line(s.rigging, a_ - Vector((0, 0, 0.28)), b_ - Vector((0, 0, 0.28)), s.rope)
        line(s.rigging, tall[0] - Vector((0, 0, 0.28)), H.stern() + Vector((0.35, 0, 0)), s.rope)
        line(s.rigging, tall[-1] - Vector((0, 0, 0.28)), H.bow() + Vector((-0.03 * L, 0, 0)), s.rope)

    def titan_flags(s, pennant_tops, ensign=True):
        """Multi-segment fluttering burgees (_BRAND) + swallowtail stern pennant."""
        S = s.S
        for (top, plen) in pennant_tops:
            ph = max(0.28, 0.135 * plen)
            segs = 3
            pts_t = [top + Vector((-plen * k / segs, 0.035 * plen * math.sin(math.pi * k / segs * 1.4), 0.02 - ph * 0.45 * (k / segs))) for k in range(segs + 1)]
            pts_b = [top + Vector((-plen * k / segs, 0.035 * plen * math.sin(math.pi * k / segs * 1.4), -ph * (1.0 - 0.55 * (k / segs)))) for k in range(segs + 1)]
            g0 = len(s.flag.f)
            for k in range(segs):
                u0, u1 = k / segs, (k + 1) / segs
                if k == segs - 1:
                    a = s.flag.vert(pts_t[k]); b = s.flag.vert(pts_b[k]); c = s.flag.vert((pts_t[-1] + pts_b[-1]) * 0.5)
                    s.flag.face((a, b, c), PAL['brand_default'], 0, 1.0, uv=[(u0, 1), (u0, 0), (1, 0.5)], jitter=0.0)
                else:
                    a = s.flag.vert(pts_t[k]); b = s.flag.vert(pts_b[k]); c = s.flag.vert(pts_b[k + 1]); d = s.flag.vert(pts_t[k + 1])
                    s.flag.face((a, b, c, d), PAL['brand_default'], 0, 1.0, uv=[(u0, 1), (u0, 0), (u1, 0), (u1, 1)], jitter=0.0)
            s.flag.backface(g0)
        if not ensign:
            return
        st = s.H.stern()
        fh = 0.034 * s.L + 0.24
        fw = fh * 2.5
        base = Vector((st.x + 0.10 * s.L, 0, s.H.deck(st.x + 0.10 * s.L)))
        topp = base + Vector((-0.02 * s.L, 0, fh * 1.55 + 0.85 * S))
        rod(s.mast, base, topp, max(0.032, 0.009 * s.L), s.sch['spar'], 4)
        c1, c2 = s.sch.get('pennant_a', TP['gilt']), s.sch.get('pennant_b', s.sch['top'])
        h0 = topp - Vector((0, 0, 0.04))
        P = lambda u, z: h0 + Vector((-fw * u, 0.055 * fw * math.sin(math.pi * u * 1.5), -fh * z - 0.12 * fh * u))
        ht, hm, hb = s.flag.vert(P(0, 0)), s.flag.vert(P(0, 0.5)), s.flag.vert(P(0, 1))
        ft, nt, fb = s.flag.vert(P(1, 0.14)), s.flag.vert(P(0.70, 0.54)), s.flag.vert(P(1, 0.94))
        g0 = len(s.flag.f)
        s.flag.face((ht, hm, nt, ft), c1, 0, uv=[(0, 1), (0, 0.5), (0.70, 0.5), (1, 1)], jitter=0.0)
        s.flag.face((hm, hb, fb, nt), c2, 0, uv=[(0, 0.5), (0, 0), (1, 0), (0.70, 0.5)], jitter=0.0)
        s.flag.backface(g0)

    # -------------------------------------------------- galley oars (with custom color & tight docked rake)
    def titan_oar_banks(s, banks, n_per_bank, x_from, x_to, reach, loom_w, col=None, outrigger_y=0.0):
        """Live animated oar banks (`oars` mesh, `furl` morph). Guarantees every single oar is a
        strictly disconnected component (>= 20 mm apart) so `hull-kit.ts:oarTholes` computes exact thole pivots."""
        H, L = s.H, s.L
        col = col or s.sch['spar']
        pat = PT['metal'] if col in (TP['gilt'], TP['gilt_deep'], TP['bronze'], TP['silver']) else 0
        up = Vector((0, 0, 1))
        for b in range(banks):
            for k in range(n_per_bank):
                t = (k + 0.30 + 0.45 * (b % 2)) / n_per_bank
                x = x_from + (x_to - x_from) * t
                u = H.u_at(x)
                for sd in (-1, 1):
                    y_in = H.w(u) + 0.04 + (outrigger_y if b == 0 else 0.0)
                    z_in = H.zt(u) - H.bh * 0.42 - 0.24 * b * s.S + (0.08 if b == 0 and outrigger_y > 0 else 0.0)
                    a = Vector((x, sd * y_in, z_in))
                    ln = reach * (1.0 + 0.08 * b)
                    tip = Vector((x - 0.025 * L, sd * (y_in + ln * 0.94), -0.02))
                    # Tight aft-raked moored pose so blades stay cleanly inside the gunwale clear of stone piers
                    tip_f = a + Vector((-0.94 * ln, sd * 0.08 * ln, 0.24 * ln))
                    s._titan_oar(a, tip, tip_f, loom_w, col, pat)
            s.lod['oars'].append((x_from, x_to, b, reach))

    def _titan_oar(s, a, tip, tip_f, w, col, pat=0):
        up = Vector((0, 0, 1))

        def strip(tp):
            d = tp - a
            wd = d.cross(up).normalized()
            k = a + d * 0.72
            return [a - wd * w, a + wd * w, k + wd * w, k - wd * w, tp + wd * w * 2.7, tp - wd * w * 2.7]

        P0, P1 = strip(tip), strip(tip_f)
        ids = [s.oars.vert(p, q) for p, q in zip(P0, P1)]
        for f in ((ids[0], ids[1], ids[2], ids[3]), (ids[3], ids[2], ids[4], ids[5])):
            n = (s.oars.v[f[1]] - s.oars.v[f[0]]).cross(s.oars.v[f[2]] - s.oars.v[f[0]])
            s.oars.face(f if n.z > 0 else f[::-1], col, pat, jitter=0.0)

    # -------------------------------------------------- hull dress & classical ornaments
    def dress_hull(s, n_sec=14, steering=True, steering_col=None, eyes_u=0.84, eye_scale=0.036,
                   shields=None, shield_rim=None, n_shields=0, shield_u=(-0.58, 0.62)):
        """Loft stepped TitanHull + optional sculpted steering oars, painted ophthalmoi, and hoplite shields."""
        H, L = s.H, s.L
        loft_titan_hull(s.hull, H, s.sch, n=n_sec, pats=s.hull_pats)
        if steering:
            s.titan_steering_oars(col=steering_col)
        if eye_scale and eye_scale > 0:
            s.eyes(eyes_u, eye_scale * L)
        if shields is not None and n_shields > 0:
            s.rail_shields(n_shields, shields, rim_col=shield_rim, u0=shield_u[0], u1=shield_u[1])

    def titan_steering_oars(s, k=1.0, col=None):
        """Sculpted twin quarter steering oars with outrigger brackets and teardrop blades."""
        H, L, S = s.H, s.L, s.S
        col = col or s.sch['spar']
        pat = PT['metal'] if col in (TP['gilt'], TP['bronze'], TP['silver']) else 0
        u = -0.78
        x = H.x(u, H.zt(u))
        w = H.w(u)
        zt = H.zt(u)
        for sd in (-1, 1):
            # Outrigger bracket
            box(s.deck, (x + 0.015 * L, sd * (w + 0.08 * S), zt - 0.04 * S),
                (0.035 * L, 0.22 * S, 0.14 * S), s.sch['cap'], skip=(), jitter=0.0)
            a = Vector((x + 0.025 * L, sd * (w + 0.12 * S), zt + 0.12 * S))
            b = Vector((x - 0.115 * L * k, sd * (w + 0.18 * S + 0.12), -H.dr * 0.92))
            rod(s.deck, a, b, max(0.055, 0.005 * L), col, 5, pat=pat)
            # Sculpted teardrop blade
            d = (b - a).normalized()
            y = Vector((0, 1, 0))
            wv = d.cross(y).normalized()
            box(s.deck, b - d * (0.045 * L * k), (0.11 * L * k, 0.045, 0.034 * L * k + 0.12), col, pat=pat, axes=(d, y, wv), jitter=0.0)

    def rail_shields(s, n_shields, col, rim_col=None, u0=-0.58, u1=0.62, y_off=0.06, z_off=0.0, r_scale=0.014, alt_col=None):
        """Domed classical bronze/painted hoplite shields along both rails (6-sided domed boss)."""
        H, L = s.H, s.L
        pat = PT['metal'] if col in (TP['gilt'], TP['bronze'], TP['silver'], TP['copper']) else 0
        boss_col = rim_col or TP['gilt']
        boss_pat = PT['metal'] if boss_col in (TP['gilt'], TP['bronze'], TP['silver'], TP['copper']) else 0
        rr = r_scale * L + 0.03
        for k in range(n_shields):
            u = u0 + (u1 - u0) * (k / max(1, n_shields - 1))
            x = H.x(u, H.zt(u))
            w = H.w(u) + y_off
            zc = H.zt(u) - rr * 0.85 + z_off
            c_use = (alt_col if (alt_col is not None and k % 2 == 1) else col)
            p_use = PT['metal'] if c_use in (TP['gilt'], TP['bronze'], TP['silver'], TP['copper']) else 0
            for sd in (-1, 1):
                rim = [s.hull.vert((x + rr * math.cos(2 * math.pi * j / 6), sd * w, zc + rr * math.sin(2 * math.pi * j / 6))) for j in range(6)]
                apex = s.hull.vert((x, sd * (w + rr * 0.24), zc))
                want = (0, sd, 0)
                for j in range(6):
                    j2 = (j + 1) % 6
                    face_oriented(s.hull, (rim[j], rim[j2], apex), want, c_use if j % 2 == 0 else (boss_col if rim_col else c_use),
                                  pat=p_use if j % 2 == 0 else (boss_pat if rim_col else p_use), smooth=True, jitter=0.0)

    def crane_neck(s, base, radius, col, y=0.0, segs=5, head_scale=1.0):
        """Sweeping classical gilt crane/swan neck (*cheniskos*) curling gracefully over the stern."""
        L = s.L
        pts = arc(base, radius, 232, y=y, n=7)
        pat = PT['metal'] if col in (TP['gilt'], TP['bronze'], TP['silver']) else 0
        r0 = 0.015 * L + 0.04
        r1 = 0.0085 * L + 0.025
        for i in range(len(pts) - 1):
            ra = r0 + (r1 - r0) * i / (len(pts) - 1)
            rb = r0 + (r1 - r0) * (i + 1) / (len(pts) - 1)
            rod(s.hull, pts[i], pts[i + 1], ra, col, segs, r2=rb, cap=(i == len(pts) - 2), pat=pat)
        e = pts[-1]
        d = (pts[-1] - pts[-2]).normalized()
        rod(s.hull, e, e + d * (0.045 * L * head_scale), r1 * 1.35, col, 5, r2=r1 * 0.35, cap=True, pat=pat)
        s.lod['posts'].append(([p.copy() for p in pts], r0, col))
        return pts

    def aphlaston(s, n_plumes, col, spread_y=0.012, r_base=0.048, th_end=215):
        """Fanned classical multi-plume stern *aphlaston*."""
        H, L = s.H, s.L
        stp = H.stern() + Vector((0.01 * L, 0, -0.01 * L))
        pat = PT['metal'] if col in (TP['gilt'], TP['bronze'], TP['silver']) else 0
        mid = (n_plumes - 1) * 0.5
        for j in range(n_plumes):
            off = j - mid
            rad = r_base * L * (1.0 + 0.14 * (1.0 - abs(off) / max(1.0, mid + 0.5)))
            pts = arc(stp, rad, th_end, y=off * spread_y * L, n=6)
            for i in range(len(pts) - 1):
                ra = (0.008 * L + 0.02) * (1.0 - 0.5 * i / (len(pts) - 1))
                rb = (0.008 * L + 0.02) * (1.0 - 0.5 * (i + 1) / (len(pts) - 1))
                rod(s.hull, pts[i], pts[i + 1], ra, col, 4, r2=rb, cap=(i == len(pts) - 2), pat=pat)
        s.lod['posts'].append((arc(stp, r_base * L * 1.1, th_end, n=5), 0.013 * L + 0.03, col))

    def bronze_ram(s, length_k=0.085, col=None, trident=True):
        """Heavy cast-bronze waterline naval ram (*embolos*) + upper *proembolion*."""
        H, L = s.H, s.L
        col = col or TP['bronze']
        xf = H.x(1.0, 0.0)
        z_ram = 0.04
        rod(s.hull, (xf - 0.03 * L, 0, z_ram), (xf + length_k * L, 0, z_ram), 0.022 * L, col, 6, r2=0.011 * L, cap=True, pat=PT['metal'])
        if trident:
            for dz in (-0.014 * L, 0.0, 0.014 * L):
                box(s.hull, (xf + (length_k - 0.01) * L, 0, z_ram + dz),
                    (0.035 * L, 0.048 * L, 0.009 * L), col, pat=PT['metal'], jitter=0.0)
        # Upper proembolion boss
        z_pro = H.fb * 0.78
        xp = H.x(1.0, z_pro)
        rod(s.hull, (xp - 0.02 * L, 0, z_pro), (xp + 0.042 * L, 0, z_pro + 0.01 * L),
            0.012 * L, col, 5, r2=0.007 * L, cap=True, pat=PT['metal'])
        s.lod['boxes'].append((Vector((xf + 0.035 * L, 0, z_ram)), (length_k * 1.2 * L, 0.038 * L, 0.038 * L), col))

    def amphora_rack(s, x0, x1, y_list, h=0.55):
        """Turned 6-sided terracotta amphorae in a wooden timber rack."""
        H = s.H
        zc = H.deck((x0 + x1) * 0.5)
        w = max(abs(y) for y in y_list) + h * 0.35
        box2(s.deck, x0 - h * 0.3, -w, zc - 0.02, x1 + h * 0.3, w, zc + h * 0.25, PAL['timber_dark'], PT['boards'], skip=('-z',))
        xs = [x0 + (x1 - x0) * i / max(1, 2) for i in range(3)]
        for x in xs:
            z = H.deck(x)
            for y in y_list:
                rod(s.deck, (x, y, z + h * 0.1), (x, y, z + h * 0.72), h * 0.18, PAL['amphora'], 6, r2=h * 0.26, smooth=True)
                rod(s.deck, (x, y, z + h * 0.72), (x, y, z + h), h * 0.26, PAL['amphora'], 6, r2=h * 0.11, cap=True, smooth=True)

    def cargo_bales(s, items):
        """Tarped cargo bales & timber chests: list of (x, y, lx, ly, lz, col)."""
        for (x, y, lx, ly, lz, col) in items:
            z = s.H.deck(x)
            box(s.deck, (x, y, z + lz * 0.5 - 0.02), (lx, ly, lz), col, PT['boards'], skip=('-z',), jitter=0.02)

    def hatch(s, x, l, w, h, col=None, trim=None):
        """Framed deck hatch with timber coaming."""
        z = s.H.deck(x)
        box2(s.deck, x - l * 0.5, -w * 0.5, z - 0.04, x + l * 0.5, w * 0.5, z + h, col or PAL['timber'], PT['boards'], skip=('-z',))
        box2(s.deck, x - l * 0.46, -w * 0.46, z + h, x + l * 0.46, w * 0.46, z + h + 0.08, trim or PAL['timber_dark'], PT['planks_y'], skip=('-z',))

    def titan_house(s, x0, x1, wfrac, h, wall_col, roof_col, roof_pat=PT['tiles'], hip=False, pat=PT['boards']):
        """Titan deckhouse (ZERO _PAINT so livery never repaints it)."""
        H = s.H
        z = H.deck((x0 + x1) * 0.5)
        w = min(H.half(x0), H.half(x1)) * 2.0 * wfrac
        box2(s.deck, x0, -w * 0.5, z - 0.12, x1, w * 0.5, z + h, wall_col, pat, skip=('-z',), jitter=0.0)
        if hip:
            hip_roof(s.deck, x0 - 0.12, x1 + 0.12, -w * 0.5 - 0.12, w * 0.5 + 0.12, z + h, h * 0.36, roof_col, pat=roof_pat)
        else:
            box2(s.deck, x0 - 0.08, -w * 0.5 - 0.08, z + h, x1 + 0.08, w * 0.5 + 0.08, z + h + 0.16, roof_col, roof_pat, skip=('-z',), jitter=0.0)
        return z, w

    # -------------------------------------------------- glowing night windows & altars (hb_fleet_window)
    def glow_pane(s, center, u_vec, v_vec, normal_dir, col=None):
        """One outward-oriented glowing quad on `s.win` (`hb_fleet_window`)."""
        c = Vector(center)
        u = Vector(u_vec) * 0.5
        v = Vector(v_vec) * 0.5
        pts = [c - u - v, c + u - v, c + u + v, c - u + v]
        quad_oriented(s.win, pts, normal_dir, col or TP['win_dark'], pat=0, jitter=0.0)

    def glow_box(s, center, size, col=None, skip=('-z',)):
        """Glowing sanctuary/altar/vault core on `s.win` (`hb_fleet_window`)."""
        box(s.win, center, size, col or TP['win_amber'], pat=0, skip=skip, jitter=0.0)

    def stern_gallery_windows(s, n=4, u_start=-0.83, u_step=0.055, z_drop=0.58, col=None, two_tier=False):
        """Quarter stern gallery windows on both sides (hb_fleet_window)."""
        H, S = s.H, s.S
        a, b = 0.19 * S, 0.23 * S
        tiers = [z_drop * S, (z_drop + 0.62) * S] if two_tier else [z_drop * S]
        for ti, zd in enumerate(tiers):
            for k in range(n):
                u = u_start + u_step * k
                x = H.x(u, H.zt(u))
                w = H.w(u) + 0.045
                z = H.zt(u) - zd
                for sd in (-1, 1):
                    s.glow_pane((x, sd * w, z), (a * 2, 0, 0), (0, 0, b * 2), (0, sd, 0), col=col)

    def transom_windows(s, n=4, z_frac=0.68, w_frac=0.68, h=0.38, col=None):
        """Aft-facing glowing stern transom windows."""
        H = s.H
        st = H.stern()
        w_tot = H.w(-0.98) * 2.0 * w_frac
        z = H.boot + (st.z - H.boot) * z_frac
        x = H.x(-1.0, z) - 0.04
        pw = (w_tot / max(1, n)) * 0.68
        for k in range(n):
            y = -w_tot * 0.5 + w_tot * (k + 0.5) / n
            s.glow_pane((x, y, z), (0, pw, 0), (0, 0, h), (-1, 0, 0), col=col)

    # -------------------------------------------------- finalize
    def _clear_all_paint(s):
        """Ensure Titans keep 100% bespoke paint (zero _PAINT on hull/deck)."""
        for mb in (s.hull, s.deck):
            for f in mb.f:
                f['paint'] = 0.0
                f['brand'] = 0.0

    def finish(s, coll=None, add_default_windows=True):
        H, L = s.H, s.L
        s.titan_flags(s.pennants, True)
        s.stern_lantern()
        if add_default_windows and not s.win.f:
            s.stern_gallery_windows()
        s._clear_all_paint()
        st = H.stern()
        main_t = max(s.tops, key=lambda t: t.z)
        u_b, u_s = 0.82, -0.86
        s.empties['bow_cleat'] = Vector((H.x(u_b, H.zt(u_b)) - 0.02 * L, 0, H.zt(u_b)))
        s.empties['stern_cleat'] = Vector((H.x(u_s, H.zt(u_s)) + 0.02 * L, 0, H.zt(u_s)))
        s.empties['masthead_light'] = main_t + Vector((0, 0, 0.25 + s.r_mast))
        s.empties['wake_origin'] = Vector((st.x, 0, 0))
        root, objs = s.build_nodes(coll)
        root['family'] = 'titan'
        root['class'] = s.cls
        root['rig'] = s.rig
        root['loa_m'] = round(L, 2)
        root['beam_m'] = round(H.B, 2)
        return root, objs
