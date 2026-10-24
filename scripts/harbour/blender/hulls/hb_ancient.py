"""Ancient fleet (classical restyle P7a): hull FORMS and one rig per family, alongside hb_hulls.VARIANTS (not replacing it).

Same node contract as hb_hulls.py (docstring there), with these additions / choices:

  sail_main   square rigs: hangs from _heel (mirrored on port tack, like the old ship). On ships with an artemon the
              artemon is a SECOND COMPONENT of sail_main with no emblem UVs: sail-plan.ts never picks a component of
              sail_main as the "second roundel" (SKIP_SECOND), so the small raked bow sail gets no roundel by geometry.
  sail_extra  the siparum (triangular topsail on the main yard): an "upper" sail for sail-plan (main directly under it).
  sail_cover  square rigs: the BRAILED-SAIL BUNDLE on the main yard (hb_cover, child of _heel, braced with the yard).
              furl 0 = collapsed inside the yard, 1 = the festooned bundle hanging from the yard. The sprit rig keeps the
              boom-group cover of hb_hulls.
  oars        galleys only (hb_opaque, child of _heel, symmetric so it needs no mirroring). furl 0 = oars out
              mid-stroke (under way), 1 = oars raked up (docked).
  flag        brand burgee at the masthead (_BRAND) + a FAMILY pennant (swallowtail) on a stern staff, replacing ENSIGN.
  Steering oars, posts (swan neck, aphlaston, horse head), ram and eyes are baked into hull / deck (symmetric, rigid).
"""
import math, random
from mathutils import Vector, Matrix
from hb_lib import *
import hb_hulls
from hb_hulls import Hull, Rig, SCH, loft, CLASS_LOA, BUDGET, SECTIONS, topside_t, deck_side, _flip

ANC_HEX = {
    'ochre_red': '#9E3B2C', 'egypt_blue': '#2E5A8A', 'ochre_yel': '#C99A3E', 'bronze': '#A0703A', 'pitch': '#2B2521',
    'timber_warm': '#8A5E3B', 'timber_pale': '#B08A5E', 'linen': '#EDE4CC', 'tyrian': '#5E2A4A', 'owl_grey': '#8E8B84',
    'whitewash': '#E9E2D2', 'terracotta': '#A9573A', 'amphora': '#B0643F', 'eye_white': '#F1ECE0', 'eye_black': '#1B1A19',
}
for _k, _v in ANC_HEX.items():
    PAL.setdefault(_k, lin(_v))

# hull forms (same keys as hb_hulls.FORMS). Double-ended (small transom), strong sheer at both ends.
ANCIENT_FORMS = {
    'fisher':    dict(br=0.38, fb=0.13, dr=0.07, bow=2.0, stern=0.22, sheer=(0.45, 0.45), rb=0.04, rs=0.05, bul=0.012, rpow=1.2),
    'coaster':   dict(br=0.33, fb=0.12, dr=0.08, bow=2.2, stern=0.22, sheer=(0.5, 0.6), rb=0.05, rs=0.07, bul=0.016, rpow=1.3),
    'corbita':   dict(br=0.30, fb=0.115, dr=0.08, bow=2.4, stern=0.2, sheer=(0.45, 0.7), rb=-0.035, rs=0.08, bul=0.02, rpow=0.8),
    'merchant':  dict(br=0.29, fb=0.115, dr=0.085, bow=2.4, stern=0.2, sheer=(0.5, 0.7), rb=0.04, rs=0.085, bul=0.022, rpow=1.3),
    'grain':     dict(br=0.27, fb=0.12, dr=0.09, bow=2.3, stern=0.24, sheer=(0.45, 0.7), rb=0.05, rs=0.09, bul=0.028, rpow=1.3),
    'greek':     dict(br=0.31, fb=0.115, dr=0.075, bow=2.3, stern=0.2, sheer=(0.6, 0.65), rb=0.05, rs=0.06, bul=0.016, rpow=1.4),
    'galley':    dict(br=0.14, fb=0.075, dr=0.045, bow=2.6, stern=0.25, sheer=(0.35, 0.9), rb=0.015, rs=0.07, bul=0.012, rpow=1.0),
    'hippos':    dict(br=0.39, fb=0.13, dr=0.07, bow=1.8, stern=0.3, sheer=(0.6, 0.5), rb=0.02, rs=0.04, bul=0.014, rpow=1.0),
    'sprit':     dict(br=0.31, fb=0.1, dr=0.05, bow=2.2, stern=0.2, sheer=(0.85, 0.95), rb=0.08, rs=0.08, bul=0.0, rpow=0.8),
    'syracusia': dict(br=0.27, fb=0.14, dr=0.09, bow=2.3, stern=0.26, sheer=(0.4, 0.6), rb=0.05, rs=0.08, bul=0.03, rpow=1.3),
}
hb_hulls.FORMS.update(ANCIENT_FORMS)


def ASCH(**kw):
    """Ancient scheme: oiled timber topsides, a painted wale, pitch bottom, brand boot-top (still _BRAND)."""
    base = dict(top='timber_warm', band='ochre_red', stripe='ochre_red', cap='timber_dark', deck='deck', deck_in='timber_pale',
                bottom='pitch', transom='timber_warm', house='whitewash', roof='terracotta', spar='timber', cloth='linen')
    base.update(kw)
    return SCH(**base)


# family pennant (swallowtail): (upper colour, lower colour)
PENNANT = {
    'usd': ('flag_red', 'egypt_blue'), 'eur': ('owl_grey', 'eye_white'), 'gold': ('gilt', 'tyrian'),
    'fiat': ('tyrian', 'ochre_yel'), 'other': ('linen', 'ochre_red'), 'titan': ('gilt', 'egypt_blue'),
}

# id, family, rig (= form), class, scheme. New ids: the variant id says what the boat IS (PLAN 4.7 point 8).
ANCIENT_VARIANTS = [
    ('usd_fisher_skiff', 'usd', 'fisher', 'skiff', ASCH(top='timber_pale', band='egypt_blue', stripe='egypt_blue')),
    ('usd_coaster_boat', 'usd', 'coaster', 'boat', ASCH(band='egypt_blue', stripe='egypt_blue')),
    ('usd_coaster_small', 'usd', 'coaster', 'small', ASCH(top='whitewash', band='ochre_red', stripe='ochre_red', transom='whitewash')),
    ('usd_corbita_medium', 'usd', 'corbita', 'medium', ASCH(band='ochre_red', stripe='ochre_yel')),
    ('usd_merchant_large', 'usd', 'merchant', 'large', ASCH(top='pitch', band='ochre_yel', stripe='ochre_red', transom='pitch')),
    ('usd_grain_flagship', 'usd', 'grain', 'flagship', ASCH(top='timber_warm', band='egypt_blue', stripe='gilt', cap='gilt',
                                                              house='whitewash', roof='terracotta', spar='timber_dark')),
    ('eur_greek_boat', 'eur', 'greek', 'boat', ASCH(top='pitch', band='ochre_red', stripe='ochre_red', transom='pitch', cloth='tanbark_sail')),
    ('eur_greek_small', 'eur', 'greek', 'small', ASCH(top='pitch', band='ochre_red', stripe='ochre_red', transom='pitch', cloth='tanbark_sail')),
    ('eur_greek_medium', 'eur', 'greek', 'medium', ASCH(top='pitch', band='ochre_red', stripe='ochre_red', transom='pitch', cloth='tanbark_sail')),
    ('eur_greek_large', 'eur', 'greek', 'large', ASCH(top='pitch', band='ochre_red', stripe='ochre_red', transom='pitch', cloth='tanbark_sail')),
    ('gold_bireme_medium', 'gold', 'galley', 'medium', ASCH(top='pitch', band='gilt', stripe='ochre_red', cap='gilt', transom='pitch',
                                                              deck='timber_pale', spar='timber_dark')),
    ('gold_trireme_large', 'gold', 'galley', 'large', ASCH(top='pitch', band='gilt', stripe='ochre_red', cap='gilt', transom='pitch',
                                                             deck='timber_pale', spar='timber_dark')),
    ('fiat_hippos_boat', 'fiat', 'hippos', 'boat', ASCH(top='timber_warm', band='tyrian', stripe='ochre_yel', cloth='lug_ochre')),
    ('fiat_hippos_small', 'fiat', 'hippos', 'small', ASCH(top='timber_warm', band='tyrian', stripe='ochre_yel', cloth='lug_ochre')),
    ('fiat_hippos_medium', 'fiat', 'hippos', 'medium', ASCH(top='timber_warm', band='tyrian', stripe='ochre_yel', cloth='lug_ochre')),
    ('other_sprit_skiff', 'other', 'sprit', 'skiff', ASCH(top='timber_pale', band='timber_grey', stripe='ochre_red', cap='timber_grey', cloth='canvas_old')),
    ('other_sprit_boat', 'other', 'sprit', 'boat', ASCH(top='timber_pale', band='timber_grey', stripe='ochre_red', cap='timber_grey', cloth='canvas_old')),
    ('other_sprit_small', 'other', 'sprit', 'small', ASCH(top='timber_pale', band='timber_grey', stripe='ochre_red', cap='timber_grey', cloth='canvas_old')),
]
# the variant each new id replaces (same family + class) - P7c id rename
REPLACES = {v[0]: o[0] for v in ANCIENT_VARIANTS for o in hb_hulls.VARIANTS if (o[1], o[3]) == (v[1], v[3])}


def chain(mb, pts, r0, r1, col, segs=5):
    """A tapered tube along a polyline (posts, necks, curls)."""
    n = len(pts) - 1
    for i in range(n):
        ra = r0 + (r1 - r0) * i / n; rb = r0 + (r1 - r0) * (i + 1) / n
        rod(mb, pts[i], pts[i + 1], ra, col, segs, r2=rb, cap=(i == n - 1))


def arc(base, R, th_end, y=0.0, n=5, fwd=1.0):
    """Curl rising from `base`: aft, over the top, and forward (theta 0 = base, 180 = top)."""
    C = base + Vector((0, y, R))
    return [C + R * Vector((-fwd * math.sin(math.radians(t)), 0, -math.cos(math.radians(t)))) for t in
            [th_end * k / (n - 1) for k in range(n)]]


class AncientRig(Rig):
    def __init__(s, vid, family, rig, cls, sch, seed=0, L=None):
        super().__init__(vid, family, rig, cls, sch, seed)
        if L:
            s.L = L; s.S = L / 13.0; s.H = Hull(L, hb_hulls.FORMS[rig])
            s.r_mast = min(0.42, max(0.085, 0.0165 * L)); s.rope = max(0.022, 0.0028 * L)
        s.cover_y = MB(seed + 9)    # brailed bundle on the main yard
        s.oars = MB(seed + 10)
        s.lamp = MB(seed + 11)      # 06-F6 stern-lantern glass (hb_emissive)
        s.win = MB(seed + 12)       # 06-F7 titan stern-gallery windows (hb_fleet_window)
        s.lod = dict(masts=[], squares=[], cover=None, gaff=None, posts=[], oars=[], boxes=[])

    # -------------------------------------------------- spars + square sails
    def mast_at(s, x, h, r=None, rake=0.0, parts=1):
        base, top = super().mast_at(x, h, r, rake, parts)
        s.lod['masts'].append((base.copy(), top.copy()))
        return base, top

    ROLL_SLIM = 0.3

    def square(s, mb, mx, zy, span, zb, span_b, **kw):
        """Rig.square, its furled roll slimmed to ROLL_SLIM of its section (G6b): docked, the brailed bundle carries the
        cloth (and the roundel); a full-size dyed roll on every yard read as a fat coloured cylinder over the quay."""
        n0 = len(mb.v)
        super().square(mb, mx, zy, span, zb, span_b, **kw)
        ax = Matrix.Rotation(s.BRACE, 3, 'Z') @ Vector((0, 1, 0))
        pts = mb.vf[n0:]
        if not pts:
            return
        c = sum(pts, Vector()) / len(pts)
        for i in range(n0, len(mb.vf)):
            d = mb.vf[i] - c
            al = d.dot(ax)
            mb.vf[i] = c + ax * al + (d - ax * al) * s.ROLL_SLIM

    def course(s, mx, zy, span, zb, span_b, emblem=True, belly=0.06, nu=3, nv=3, cover=True):
        """The main square sail on a braced yard (+ the brailed bundle). emblem=False: a component without emblem UVs."""
        s.yard(mx, zy, span, s.r_mast * 0.5)
        s.square(s.main_sq, mx, zy, span, zb, span_b, emblem=emblem, belly=belly, nu=nu, nv=nv)
        s.lod['squares'].append((mx, zb, zy, span_b, span))
        if cover:
            small = s.L < 10
            s.brail_cover(mx, zy, span, zb, nf=3 if small else 4, segs=5 if small else 6)

    def brail_cover(s, mx, zy, span, zb, nf=4, segs=6):
        """Brailed-sail bundle: festoons of cloth gathered to the yard by the brails. furl 0 = inside the yard."""
        br = s._brace(mx)
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        fwd = R_ @ Vector((1, 0, 0)); up = Vector((0, 0, 1))
        rf = max(0.14, 0.11 * (zy - zb) ** 0.7 + 0.06 * s.S)          # Rig.square's rolled-sail radius
        x0 = mx + s.r_mast * 0.9
        ry = s.r_mast * 0.5 * 0.4
        nr = 2 * nf + 1
        rings = []
        for i in range(nr):
            t = i / (nr - 1)
            y = (-span / 2 + span * t) * 0.92
            fest = abs(math.sin(math.pi * nf * t))                      # 0 at a brail, 1 mid-festoon
            taper = 0.55 + 0.45 * math.sin(math.pi * min(1.0, 0.08 + 0.84 * t))
            c_set = br(Vector((mx + s.r_mast * 0.6, y, zy)))
            c_f = br(Vector((x0 + rf * 0.3, y, zy + rf * 0.35)))
            rc = (rf * 1.18 + 0.04) * taper
            ring = []
            for j in range(segs):
                a = 2 * math.pi * j / segs
                ca, sa = math.cos(a), math.sin(a)
                d = ca * fwd + sa * up
                sag = up * (-(rf * 0.9 + 0.08) * fest * max(0.0, -sa)) if sa < 0 else Vector()
                ring.append((s.cover_y.vert(c_set + d * ry, c_f + d * rc + sag), sa))
            rings.append(ring)
        for r0, r1 in zip(rings, rings[1:]):
            for j in range(segs):
                j2 = (j + 1) % segs
                shade = 0.80 + 0.2 * max(0.0, (r0[j][1] + r0[j2][1]) / 2)
                s.cover_y.face((r0[j][0], r1[j][0], r1[j2][0], r0[j2][0]), (shade, shade, shade), 0, smooth=True, jitter=0.0)
        s.cover_y.face([v for v, _ in rings[0]], (0.85, 0.85, 0.85), jitter=0.0)
        s.cover_y.face([v for v, _ in rings[-1]][::-1], (0.85, 0.85, 0.85), jitter=0.0)
        s.lod['cover'] = (mx, zy, span, rf)

    def artemon(s, rake_deg=40.0, h=None, span=None):
        """Raked bow mast + a small square sail: a second component of sail_main WITHOUT emblem UVs (no roundel)."""
        H, L = s.H, s.L
        bw = H.bow()
        x = bw.x - 0.07 * L
        h = h or 0.34 * L
        _, top = s.mast_at(x, h, s.r_mast * 0.6, rake=-math.radians(rake_deg))
        span = span or 0.3 * L
        zy = top.z - 0.05 * L
        sh = 0.55 * (zy - H.deck(x))
        mxy = top.x - 0.02 * L
        s.yard(mxy, zy, span, s.r_mast * 0.35)
        s.square(s.main_sq, mxy, zy, span, zy - sh, span * 0.95, emblem=False, nu=2, nv=2)
        s.lod['squares'].append((mxy, zy - sh, zy, span * 0.95, span))
        line(s.rigging, top, bw + Vector((0.02 * L, 0, 0.0)), s.rope)
        return top

    def siparum(s, mx, zy, span, top):
        """Triangular topsail: foot along the main yard, head at the masthead. furl = rolled down onto the yard."""
        br = s._brace(mx)
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        fwd = R_ @ Vector((1, 0, 0)); up = Vector((0, 0, 1))
        x0 = mx + s.r_mast * 0.9
        zh = top.z - 0.15
        g0 = len(s.extra.f)

        def P(u, v):
            w = span * (1 - v)
            return br(Vector((x0, -w / 2 + w * u, zy + 0.12 + (zh - zy - 0.12) * v))) + fwd * (0.04 * span * math.sin(math.pi * u) * (1 - v))

        def Pf(u, v):
            r = 0.1 + 0.03 * s.L * (1 - v)
            th = math.pi * (0.2 + 1.4 * v)
            return br(Vector((x0 + 0.05, (-span / 2 + span * u) * 0.8 * (1 - 0.5 * v), zy + 0.18))) + r * (math.cos(th) * fwd + math.sin(th) * up) * 0.6
        patch(s.extra, 2, 2, P, Pf, s.sch['cloth'], uv=lambda u, v: (u, v), uv2=lambda u, v: (-4.0, -4.0), smooth=True, tri_head=True)
        s.lod['squares'].append((mx, zy + 0.12, zh, span, 0.05))

    # -------------------------------------------------- hull dress
    def steering_oars(s, k=1.0):
        H, L = s.H, s.L
        u = -0.78
        x = H.x(u, H.zt(u)); w = H.w(u); zt = H.zt(u)
        for sd in ((-1,) if L < 6 else (-1, 1)):          # skiffs: one steering oar (port quarter), for the budget
            a = Vector((x + 0.02 * L, sd * (w + 0.04), zt + 0.08 * s.S))
            b = Vector((x - 0.11 * L * k, sd * (w + 0.12 * s.S + 0.1), -H.dr * 0.9))
            rod(s.deck, a, b, max(0.035, 0.005 * L), s.sch['spar'], 4)
            d = (b - a).normalized(); y = Vector((0, 1, 0)); wv = d.cross(y).normalized()
            box(s.deck, b - d * 0.045 * L * k, (0.11 * L * k, 0.035, 0.03 * L * k + 0.1), s.sch['spar'], axes=(d, y, wv))

    def post(s, pts, r0, r1, col, segs=5):
        chain(s.hull, pts, r0, r1, col, 4 if s.L < 6 else segs)
        s.lod['posts'].append(([p.copy() for p in pts], r0, col))

    def swan_neck(s, col, R=None):
        H, L = s.H, s.L
        st = H.stern() + Vector((0.01 * L, 0, -0.02 * L))
        R = R or 0.075 * L
        pts = arc(st, R, 235, n=6)
        s.post(pts, 0.016 * L + 0.03, 0.009 * L + 0.02, col)
        e = pts[-1]; d = (pts[-1] - pts[-2]).normalized()
        box(s.hull, e + d * 0.02 * L, (0.06 * L, 0.025 * L, 0.025 * L), col, axes=(d, Vector((0, 1, 0)), d.cross(Vector((0, 1, 0)))))

    def stern_curl(s, col, R=None, th=200):
        H, L = s.H, s.L
        st = H.stern() + Vector((0.01 * L, 0, -0.02 * L))
        s.post(arc(st, R or 0.05 * L, th, n=5), 0.014 * L + 0.03, 0.007 * L + 0.02, col)

    def stem_post(s, col, h=0.06):
        H, L = s.H, s.L
        bw = H.bow()
        pts = [bw + Vector((-0.01 * L, 0, -0.02 * L)), bw + Vector((0.008 * L, 0, h * 0.6 * L)), bw + Vector((0.0, 0, h * L))]
        s.post(pts, 0.012 * L + 0.03, 0.008 * L + 0.02, col, 4)

    def eyes(s, u=0.8, size=None):
        """Painted ophthalmoi on both bows: white almond + dark iris, a hair proud of the planking."""
        H, L = s.H, s.L
        # G6a polish: 1.5x the study's eyes, capped so the almond stays on the topsides (boot-top .. sheer)
        size = min((size or 0.05 * L) * 1.5, (H.zt(u) - H.boot) * 0.9 / 0.42)
        zc = H.boot + (H.zt(u) - H.boot) * 0.55
        xc = H.x(u, zc)
        alm = [(-1.0, 0.0), (-0.45, 0.42), (0.35, 0.4), (1.0, 0.0), (0.35, -0.3), (-0.45, -0.32)]
        iris = [(-0.12, -0.25), (0.32, -0.25), (0.32, 0.27), (-0.12, 0.27)]
        for sd in (-1, 1):
            for pts, col, off in ((alm, PAL['eye_white'], 0.02 + 0.04 * size), (iris, PAL['eye_black'], 0.035 + 0.05 * size)):  # clear of the bow's curve
                ids = []
                for px, pz in pts:
                    x = xc + px * size * 0.5; z = zc + pz * size * 0.5
                    ids.append(s.hull.vert((x, sd * (H.w(H.u_at(x)) * 0.99 + off), z)))
                v = [s.hull.v[i] for i in ids[:3]]
                outward = ((v[1] - v[0]).cross(v[2] - v[0])).y * sd > 0     # G6a fix: the almond was wound inward (culled)
                s.hull.face(ids if outward else ids[::-1], col, 0, jitter=0.0)

    def amphorae(s, xs, ys, h):
        for x in xs:
            for y in ys:
                z = s.H.deck(x)
                rod(s.deck, (x, y, z - 0.02), (x, y, z + h), h * 0.32, PAL['amphora'], 4, r2=h * 0.12, cap=True)

    # -------------------------------------------------- galley oars
    def oar_banks(s, banks, n, x_from, x_to, reach, loom_w):
        H, L = s.H, s.L
        up = Vector((0, 0, 1))
        for b in range(banks):
            for k in range(n):
                t = (k + 0.25 + 0.5 * (b % 2)) / n
                x = x_from + (x_to - x_from) * t
                u = H.u_at(x)
                for sd in (-1, 1):
                    a = Vector((x, sd * (H.w(u) + 0.03 + 0.03 * L * (b == 2)), H.zt(u) - H.bh * 0.5 - 0.22 * b * s.S + 0.04 * L * (b == 2)))
                    ln = reach * (1.0 + 0.12 * b)
                    tip = Vector((x - 0.02 * L, sd * (H.w(u) + ln * 0.93), -0.02))         # mid-stroke, blade at the water
                    tip_f = a + Vector((-0.86 * ln, sd * 0.4 * ln, 0.14 * ln))             # docked: raked aft, blades clear of the water
                    s.oar(a, tip, tip_f, loom_w)
            s.lod['oars'].append((x_from, x_to, b, reach))

    def oar(s, a, tip, tip_f, w):
        up = Vector((0, 0, 1))
        def strip(tp):
            d = tp - a; wd = d.cross(up).normalized()
            k = a + d * 0.72
            return [a - wd * w, a + wd * w, k + wd * w, k - wd * w, tp + wd * w * 2.6, tp - wd * w * 2.6]
        P0, P1 = strip(tip), strip(tip_f)
        ids = [s.oars.vert(p, q) for p, q in zip(P0, P1)]
        for f in ((ids[0], ids[1], ids[2], ids[3]), (ids[3], ids[2], ids[4], ids[5])):
            n = (s.oars.v[f[1]] - s.oars.v[f[0]]).cross(s.oars.v[f[2]] - s.oars.v[f[0]])
            s.oars.face(f if n.z > 0 else f[::-1], s.sch['spar'], 0, jitter=0.05)

    # -------------------------------------------------- flags: burgee + family pennant
    def flags(s, pennant_tops, ensign=True):
        S = s.S
        for (top, plen) in pennant_tops:
            ph = max(0.26, 0.13 * plen)
            a = s.flag.vert(top + Vector((0, 0, 0.02))); b = s.flag.vert(top + Vector((0, 0, -ph)))
            c = s.flag.vert(top + Vector((-plen, 0.0, -ph * 0.6)))
            g0 = len(s.flag.f)
            s.flag.face((a, b, c), PAL['brand_default'], 0, 1.0, uv=[(0, 1), (0, 0), (1, 0.5)], jitter=0.0)
            s.flag.backface(g0)
        if not ensign:
            return
        st = s.H.stern()
        fh = 0.035 * s.L + 0.25; fw = fh * 2.4
        base = Vector((st.x + 0.13 * s.L, 0, s.H.deck(st.x + 0.13 * s.L)))
        topp = base + Vector((0, 0, fh * 1.6 + 0.9 * S))
        rod(s.mast, base, topp, max(0.03, 0.01 * s.L), s.sch['spar'], 4)
        c1, c2 = (PAL[c] for c in PENNANT[s.family])
        h0 = topp - Vector((0, 0, 0.04))
        P = lambda u, z: h0 + Vector((-fw * u, 0.05 * fw * math.sin(math.pi * u * 1.5), -fh * z - 0.12 * fh * u))
        ht, hm, hb = s.flag.vert(P(0, 0)), s.flag.vert(P(0, 0.5)), s.flag.vert(P(0, 1))
        ft, nt, fb = s.flag.vert(P(1, 0.15)), s.flag.vert(P(0.72, 0.55)), s.flag.vert(P(1, 0.95))
        g0 = len(s.flag.f)
        s.flag.face((ht, hm, nt, ft), c1, 0, uv=[(0, 1), (0, 0.5), (0.72, 0.5), (1, 1)], jitter=0.0)
        s.flag.face((hm, hb, fb, nt), c2, 0, uv=[(0, 0.5), (0, 0), (1, 0), (0.72, 0.5)], jitter=0.0)
        s.flag.backface(g0)

    # -------------------------------------------------- 06-F6 stern lantern
    LANTERN_TRIS = 20

    def stern_lantern(s):
        """A bronze lantern on a short stern staff, its glass a separate hb_emissive node (stern_lantern_glass) that the
        runtime lights exactly when the hull's stern lamp is lit (variants.ts sternLampLit); empty 'stern_lantern' = the
        glass centre (the riding light's anchor). LANTERN_TRIS triangles, outside the class budget."""
        H, L, S = s.H, s.L, s.S
        st = H.stern()
        x = st.x + 0.05 * L
        z0 = H.deck(x)
        hw = 0.09 + 0.006 * L
        hh = hw * 1.45
        top = Vector((x - 0.006 * L, 0, z0 + 0.5 + 0.42 * S))
        rod(s.deck, Vector((x, 0, z0 - 0.05)), top, max(0.025, 0.0035 * L), s.sch['spar'], 3, smooth=False)
        c = top + Vector((0, 0, hh))
        box(s.lamp, c, (2 * hw, 2 * hw, 2 * hh), PAL['pitch'], skip=('+z', '-z'), jitter=0.0)
        a = hw * 1.25
        q = [s.deck.vert(c + Vector((dx * a, dy * a, hh))) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        apex = s.deck.vert(c + Vector((0, 0, hh + hw * 1.1)))
        for k in range(4):
            s.deck.face((q[k], q[(k + 1) % 4], apex), PAL['bronze'], PT['metal'], jitter=0.0)
        b = [s.deck.vert(c + Vector((dx * hw, dy * hw, -hh))) for dx, dy in ((-1, -1), (-1, 1), (1, 1), (1, -1))]
        s.deck.face(b, PAL['bronze'], PT['metal'], jitter=0.0)
        s.empties['stern_lantern'] = c

    # -------------------------------------------------- nodes
    def build_nodes(s, coll=None):
        root, objs = super().build_nodes(coll)
        heel = [c for c in root.children if c.name.split('.')[0] == '_heel'][0]
        for mb, nm, mat in ((s.cover_y, 'sail_cover', 'hb_cover'), (s.oars, 'oars', 'hb_opaque'),
                            (s.lamp, 'stern_lantern_glass', 'hb_emissive'), (s.win, 'stern_windows', 'hb_fleet_window')):
            if mb.f:
                objs[nm] = to_object(mb, nm, mat, parent=heel, coll=coll)
        return root, objs


# =================================================================== the boats
def build_ancient(vid, family, rig, cls, sch, coll=None, seed=0, n_sec=None, L=None):
    R = AncientRig(vid, family, rig, cls, sch, seed, L=L)
    H, L, S = R.H, R.L, R.S
    n = n_sec or SECTIONS.get(cls, 13)
    loft(R.hull, H, sch, n, band=rig not in ('fisher', 'sprit'))
    st, bw = H.stern(), H.bow()
    dz = H.deck
    pennants = []
    B = H.B

    def square_main(mxk, hk, spk, foot, artemon=False, siparum=False, nv=3):
        mx = H.x0 + mxk * L
        _, top = R.mast_at(mx, hk * L)
        zy = top.z - 0.07 * L
        zb = dz(mx) + foot * L
        span = spk * L
        R.course(mx, zy, span, zb, span * 1.04, nv=nv)
        R.shrouds(top, mx, 2 if L >= 13 else 1, 0.86)
        line(R.rigging, top - Vector((0, 0, 0.1)), st + Vector((0.06 * L, 0, 0.1 * S)), R.rope)       # backstay
        if siparum:
            R.siparum(mx, zy, span * 0.62, top)
        if artemon:
            R.artemon()
        else:
            line(R.rigging, top - Vector((0, 0, 0.1)), bw + Vector((-0.02 * L, 0, 0)), R.rope)      # forestay
        pennants.append((top, 1.1 + 0.12 * L))
        return mx, top

    if rig == 'fisher':
        mx, top = square_main(0.12, 0.78, 0.7, 0.12, nv=2)
        R.stern_curl(sch['spar'], 0.035 * L, 170)
        R.steering_oars(0.8)
        box(R.deck, (H.x0 - 0.12 * L, 0, dz(H.x0) + 0.08 * S + 0.06), (0.16 * L, B * 0.5, 0.16 * S + 0.12), PAL['door_green'], skip=('-z',))  # nets
        R.crates([(H.x0 - 0.28 * L, B * 0.12, 0.2 * S + 0.12, PAL['ochre_yel'])])                                                     # basket
    elif rig == 'coaster':
        mx, top = square_main(0.06, 0.82, 0.72, 0.1)
        R.stem_post(sch['spar'])
        R.stern_curl(sch['spar'], 0.05 * L, 205)
        R.steering_oars()
        R.house(st.x + 0.1 * L, st.x + 0.24 * L, 0.6, 0.35 * S + 0.25)
        R.amphorae([H.x0 + 0.16 * L, H.x0 + 0.22 * L], [-B * 0.15, B * 0.15], 0.28 * S + 0.18)
    elif rig in ('corbita', 'merchant', 'grain'):
        big = rig != 'corbita'
        mx, top = square_main(0.03 if big else 0.02, 0.84 if big else 0.86, 0.84 if big else 0.78, 0.17, artemon=True, siparum=big,
                              nv=3)
        R.swan_neck(PAL['gilt'] if rig == 'grain' else sch['spar'], R=(0.075 if rig == 'grain' else 0.08) * L)
        R.steering_oars()
        if rig == 'grain':
            # stern cabin with a gallery and a tiled roof, a midships deck house, the gilt figure of Isis's goose
            R.house(st.x + 0.08 * L, st.x + 0.24 * L, 0.78, 1.0 * S, roof=PAL['terracotta'])
            for k in range(5):
                x = st.x + 0.09 * L + k * 0.035 * L
                for sd in (-1, 1):
                    rod(R.deck, (x, sd * H.half(x) * 0.8, dz(x) + 1.0 * S), (x, sd * H.half(x) * 0.8, dz(x) + 1.6 * S), 0.05 * S, PAL['whitewash'], 4)
            box2(R.deck, st.x + 0.075 * L, -H.half(st.x + 0.15 * L) * 0.84, dz(st.x + 0.16 * L) + 1.6 * S, st.x + 0.26 * L,
                 H.half(st.x + 0.15 * L) * 0.84, dz(st.x + 0.16 * L) + 1.75 * S, PAL['terracotta'], PT['tiles'], skip=('-z',))
            R.hatch(H.x0 - 0.12 * L, 0.06 * L, B * 0.42, 0.35 * S, PAL['timber'])
            R.hatch(H.x0 + 0.16 * L, 0.06 * L, B * 0.42, 0.35 * S, PAL['timber'])
            R.amphorae([H.x0 + 0.24 * L, H.x0 + 0.28 * L], [-B * 0.2, 0, B * 0.2], 0.4 * S)
            R.stem_post(PAL['gilt'], 0.05)
        else:
            R.house(st.x + 0.09 * L, st.x + 0.23 * L, 0.68, 0.6 * S + 0.2)
            R.hatch(H.x0 + 0.12 * L, 0.07 * L, B * 0.4, 0.25 * S, PAL['timber'])
            R.amphorae([H.x0 - 0.1 * L, H.x0 - 0.15 * L], [-B * 0.16, B * 0.16], 0.32 * S + 0.1)
    elif rig == 'greek':
        mx, top = square_main(0.02, 0.84, 0.74, 0.1)
        R.eyes(0.8, 0.075 * L)
        R.stem_post(PAL['ochre_red'], 0.07)
        R.stern_curl(sch['spar'], 0.06 * L, 215)
        R.steering_oars()
        R.house(st.x + 0.1 * L, st.x + 0.2 * L, 0.55, 0.32 * S + 0.25, roof=PAL['ochre_red'])
        R.amphorae([H.x0 + 0.12 * L, H.x0 + 0.18 * L, H.x0 - 0.12 * L], [-B * 0.15, B * 0.15], 0.3 * S + 0.12)
    elif rig == 'galley':
        tri = cls == 'large'
        mx, top = square_main(0.06, 0.5, 0.42, 0.06, nv=2)
        # bronze ram at the forefoot, proembolion above it
        xf = H.x(1.0, 0.0)
        rod(R.hull, (xf - 0.03 * L, 0, 0.02), (xf + 0.075 * L, 0, 0.02), 0.022 * L, PAL['bronze'], 4, r2=0.012 * L, cap=True)
        box(R.hull, (xf + 0.07 * L, 0, 0.02), (0.02 * L, 0.06 * L, 0.012 * L), PAL['bronze'])
        rod(R.hull, (xf - 0.02 * L, 0, H.fb * 0.75), (xf + 0.035 * L, 0, H.fb * 0.8), 0.01 * L, PAL['bronze'], 4, r2=0.006 * L, cap=True)
        R.lod['boxes'].append((Vector((xf + 0.03 * L, 0, 0.02)), (0.11 * L, 0.035 * L, 0.035 * L), PAL['bronze']))
        # gilded aphlaston: a fan of curling strands over the stern
        stp = st + Vector((0.01 * L, 0, -0.01 * L))
        for j in range(4):
            pts = arc(stp, 0.035 * L * (1 + 0.18 * j), 210, y=(j - 1.5) * 0.008 * L, n=5)
            chain(R.hull, pts, 0.006 * L + 0.015, 0.003 * L + 0.01, PAL['gilt'], 4)
        R.lod['posts'].append((arc(stp, 0.045 * L, 210, n=5), 0.01 * L + 0.03, PAL['gilt']))
        R.stem_post(PAL['gilt'], 0.035)
        R.eyes(0.86, 0.05 * L)
        R.steering_oars(0.9)
        if tri:   # outriggers for the thranite bank
            for sd in (-1, 1):
                x0_, x1_ = H.x0 - 0.3 * L, H.x0 + 0.3 * L
                wy = H.half(H.x0) + 0.03 * L
                zz = H.zt(0) + 0.02 * L
                box2(R.hull, x0_, min(sd * (wy - 0.04 * L), sd * wy), zz - 0.03 * L, x1_, max(sd * (wy - 0.04 * L), sd * wy), zz,
                     PAL['pitch'], PT['boards'])
        R.oar_banks(3 if tri else 2, 11 if tri else 9, H.x0 - 0.3 * L, H.x0 + 0.27 * L, 0.2 * L, 0.0045 * L + 0.02)
        # linen awning aft for the trierarch
        box2(R.deck, st.x + 0.1 * L, -B * 0.32, dz(st.x + 0.15 * L) + 0.9 * S, st.x + 0.2 * L, B * 0.32, dz(st.x + 0.15 * L) + 0.95 * S,
             PAL['linen'], 0, skip=())
        for xx in (st.x + 0.105 * L, st.x + 0.195 * L):
            for sd in (-1, 1):
                rod(R.deck, (xx, sd * B * 0.3, dz(xx)), (xx, sd * B * 0.3, dz(xx) + 0.9 * S), 0.03, PAL['timber_dark'], 3)
    elif rig == 'hippos':
        mx, top = square_main(0.02, 0.8, 0.72, 0.1)
        # horse-head prow (G6a polish: sculpted): an arched neck off the stem, a modelled head (skull, cheek, muzzle,
        # open jaw), pricked ears, a crest of painted mane, eyes, a gilt collar. Small hulls get a relatively bigger head.
        bw2 = bw + Vector((-0.01 * L, 0, -0.01 * L))
        hk = 1.0 + 3.0 / L
        k = 0.01 * L * hk                              # 1 % of the hull, scaled
        neck = [bw2, bw2 + Vector((2.2 * k, 0, 6.0 * k)), bw2 + Vector((5.0 * k, 0, 11.0 * k)), bw2 + Vector((6.2 * k, 0, 15.5 * k)),
                bw2 + Vector((5.6 * k, 0, 19.0 * k))]
        sg = 6 if L >= 11 else 4
        R.post(neck, 3.4 * k + 0.03, 2.3 * k + 0.03, sch['spar'], sg)
        poll = neck[-1]
        d = Vector((math.cos(math.radians(-38)), 0, math.sin(math.radians(-38))))
        skull = poll + d * 4.5 * k
        muz = poll + d * 11.0 * k
        chain(R.hull, [poll - d * 0.8 * k, skull, poll + d * 8.0 * k, muz] if L >= 11 else [poll - d * 0.8 * k, skull, muz], 2.9 * k + 0.02, 1.7 * k + 0.015, sch['spar'], sg)
        box(R.hull, muz + d * 0.4 * k, (2.4 * k, 3.4 * k, 2.2 * k), sch['spar'], axes=(d, Vector((0, 1, 0)), d.cross(Vector((0, 1, 0)))), skip=('-x',))  # muzzle
        dn = Vector((d.z, 0, -d.x))                    # below the head line
        rod(R.hull, skull + dn * 1.6 * k, muz + dn * 1.9 * k - d * 1.2 * k, 1.5 * k, sch['spar'], 4 if L >= 11 else 3, r2=0.9 * k, cap=True)  # jaw
        for sd in (-1, 1):
            e0 = poll + Vector((0, sd * 1.4 * k, 0)) - d * 0.5 * k
            rod(R.hull, e0, e0 + Vector((-1.6 * k, sd * 0.6 * k, 4.2 * k)), 0.9 * k, sch['spar'], 4 if L >= 11 else 3, r2=0.15 * k)  # ears
            ec = skull + Vector((0, sd * 2.95 * k, 0.6 * k))
            ids = [R.hull.vert(ec + Vector((px * 0.8 * k, 0, pz * 0.5 * k))) for px, pz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            R.hull.face(ids if sd < 0 else ids[::-1], PAL['eye_black'], 0, jitter=0.0)                        # eyes
        for j in range(3 if L >= 11 else 2):           # mane: red tufts along the arch of the neck
            c = neck[1].lerp(neck[3], 0.15 + (0.35 if L >= 11 else 0.6) * j)
            box(R.hull, c + Vector((-2.6 * k, 0, 0.6 * k)), (1.8 * k, 1.2 * k, 3.0 * k), PAL['ochre_red'], skip=('-z', '+x'))
        if L >= 11:
            rod(R.hull, neck[1] + Vector((0, 0, -0.5 * k)), neck[1] + Vector((0, 0, 0.9 * k)), 3.9 * k + 0.03, PAL['gilt'], sg)  # collar
        R.lod['posts'].append(([poll, skull, muz], 2.6 * k + 0.03, sch['spar']))
        # fish-tail stern
        R.stern_curl(sch['spar'], 0.045 * L, 160)
        stt = R.lod['posts'][-1][0][-1]
        for sd in (-1, 1):
            rod(R.hull, stt, stt + Vector((0.01 * L, sd * 0.03 * L, 0.03 * L)), 0.008 * L + 0.02, sch['spar'], 4 if L >= 11 else 3, r2=0.02, cap=True)
        R.steering_oars()
        R.house(st.x + 0.1 * L, st.x + 0.22 * L, 0.55, 0.3 * S + 0.25, roof=PAL['tyrian'])
        R.crates([(H.x0 + 0.14 * L, B * 0.18, 0.3 * S + 0.12, PAL['tyrian']), (H.x0 - 0.12 * L, 0.0, 0.3 * S + 0.12, PAL['ochre_yel'])]
                 + ([(H.x0 + 0.14 * L, -B * 0.16, 0.26 * S + 0.12, PAL['timber'])] if L >= 11 else []))
    elif rig == 'sprit':
        mx = H.x0 + 0.2 * L
        mh = 0.95 * L
        _, top = R.mast_at(mx, mh)
        blen = min(0.62 * L, mx - st.x - 0.06 * L)
        zb = dz(mx) + 0.3 + 0.05 * L
        R.fore_aft('boom', mx, zb, blen, dz(mx) + mh * 0.62, blen * 0.72, 44, emblem=True, belly=0.07, nu=4, nv=4 if L >= 10 else 3)
        g = R.groups[-1]
        # the sprit: from the snotter low on the mast diagonally to the peak (replaces the gaff)
        g['gaff'] = MB()
        sn = Vector((mx - R.r_mast, 0, zb + 0.18 * mh))
        ad = Vector((-1, 0, 0))
        rf = max(0.09, 0.042 * blen)
        fz = zb + R.r_mast * 0.62 + rf * 2.2
        rod(g['gaff'], sn, g['Pk'], R.r_mast * 0.55, sch['spar'], 5, pf=Vector((mx - 0.05 * L, 0, fz)), qf=Vector((mx - 0.05 * L - (g['Pk'] - sn).length * 0.95, 0, fz)),
            r2=R.r_mast * 0.4)
        R.lod['gaff'] = (mx, zb, blen, dz(mx) + mh * 0.62, blen * 0.72, 44, sn)
        R.shrouds(top, mx, 1, 0.84)
        line(R.rigging, top - Vector((0, 0, 0.1)), bw + Vector((-0.02 * L, 0, 0)), R.rope)
        if L >= 6:
            R.stem_post(sch['spar'], 0.07)
        R.stern_curl(sch['spar'], 0.04 * L, 160)
        R.steering_oars(0.8)
        R.crates([(H.x0 + 0.02 * L, B * 0.14, 0.26 * S + 0.12, PAL['ochre_yel']), (H.x0 - 0.04 * L, -B * 0.14, 0.3 * S + 0.12, PAL['timber']),
                  (H.x0 - 0.1 * L, B * 0.1, 0.22 * S + 0.12, PAL['linen'])])
        pennants.append((top, 1.1 + 0.12 * L))
    elif rig == 'syracusia':
        # Syracusia-class titan study: three masts + artemon, siparum on the main, fighting towers fore and aft,
        # a row of gilt shields along the rail, the stern cabin and a gilt swan neck.
        masts = [(H.x0 + 0.27 * L, 0.62 * L, 0.6), (H.x0 + 0.02 * L, 0.84 * L, 0.8), (H.x0 - 0.24 * L, 0.56 * L, 0.52)]
        for k, (x, h, spk) in enumerate(masts):
            _, top = R.mast_at(x, h, R.r_mast * (1.0 if k == 1 else 0.8))
            zy = top.z - 0.06 * L
            span = spk * L
            if k == 1:
                R.course(x, zy, span, dz(x) + 0.12 * L, span * 1.04, nv=3)
                R.siparum(x, zy, span * 0.6, top)
            else:
                R.yard(x, zy, span, R.r_mast * 0.45)
                R.square(R.extra, x, zy, span, dz(x) + 0.14 * L, span * 1.03, nu=3, nv=2)
                R.lod['squares'].append((x, dz(x) + 0.14 * L, zy, span * 1.03, span))
            R.shrouds(top, x, 2, 0.8)
            pennants.append((top, (1.4 + 0.12 * L) * (1.0 if k == 1 else 0.7)))
        tops = R.tops[:]
        for a_, b_ in zip(tops[1:], tops[:-1]):
            line(R.rigging, a_ - Vector((0, 0, 0.3)), b_ - Vector((0, 0, 0.3)), R.rope)
        line(R.rigging, tops[-1] - Vector((0, 0, 0.3)), st + Vector((0.4, 0, 0)), R.rope)
        R.artemon(38, 0.3 * L, 0.24 * L)
        R.swan_neck(PAL['gilt'], 0.05 * L)
        R.stem_post(PAL['gilt'], 0.05)
        R.steering_oars()
        R.eyes(0.84, 0.035 * L)
        for tx, tw in ((H.x0 + 0.37 * L, 0.06 * L), (H.x0 - 0.36 * L, 0.07 * L)):     # crenellated fighting towers
            z0 = dz(tx); th = 0.12 * L
            ww = H.half(tx) * 1.3
            box2(R.deck, tx - tw / 2, -ww / 2, z0 - 0.1, tx + tw / 2, ww / 2, z0 + th, PAL['whitewash'], PT['ashlar'], skip=('-z',))
            box2(R.deck, tx - tw / 2 - 0.1, -ww / 2 - 0.1, z0 + th, tx + tw / 2 + 0.1, ww / 2 + 0.1, z0 + th + 0.18, PAL['ochre_red'], skip=('-z',))
            for cx in (-1, 1):
                for cy in (-1, 0, 1):
                    box(R.deck, (tx + cx * tw * 0.4, cy * ww * 0.4, z0 + th + 0.38), (0.35, 0.35, 0.4), PAL['whitewash'], skip=('-z',))
            R.lod['boxes'].append((Vector((tx, 0, z0 + th / 2)), (tw, ww, th), PAL['whitewash']))
        R.house(st.x + 0.13 * L, st.x + 0.25 * L, 0.7, 0.9 * S, roof=PAL['terracotta'])
        R.house(H.x0 - 0.12 * L, H.x0 - 0.05 * L, 0.45, 0.7 * S, roof=PAL['terracotta'])
        for k in range(14):                                                                  # gilt shields on the rail
            u = -0.6 + 1.25 * k / 13
            x = H.x(u, H.zt(u)); w = H.w(u) + 0.04
            for sd in (-1, 1):
                ids = [R.hull.vert((x + 0.4 * math.cos(2 * math.pi * j / 6), sd * w, H.zt(u) - 0.45 + 0.4 * math.sin(2 * math.pi * j / 6))) for j in range(6)]
                R.hull.face(ids if sd < 0 else ids[::-1], PAL['gilt'], 0, jitter=0.0)
        R.amphorae([H.x0 + 0.13 * L, H.x0 + 0.17 * L], [-B * 0.2, 0, B * 0.2], 0.35 * S)
    R.flags(pennants, True)
    R.stern_lantern()
    main_t = max(R.tops, key=lambda t: t.z)
    u_b, u_s = 0.82, -0.86
    R.empties['bow_cleat'] = Vector((H.x(u_b, H.zt(u_b)) - 0.02 * L, 0, H.zt(u_b)))
    R.empties['stern_cleat'] = Vector((H.x(u_s, H.zt(u_s)) + 0.02 * L, 0, H.zt(u_s)))
    R.empties['masthead_light'] = main_t + Vector((0, 0, 0.25 + R.r_mast))
    R.empties['wake_origin'] = Vector((st.x, 0, 0))
    root, objs = R.build_nodes(coll)
    if rig == 'syracusia':
        root['family'] = 'titan'; root['class'] = 'flagship'
    return root, objs, R


def build_ancient_budget(vid, family, rig, cls, sch, coll=None, seed=0, budget=None, L=None, remove=None):
    """Same guard as export.py: drop hull sections until the boat fits its class budget."""
    n_sec = SECTIONS.get(cls, 13)
    budget = (budget or BUDGET[cls]) + AncientRig.LANTERN_TRIS     # the stern lantern (06-F6) rides outside the class budget
    while True:
        root, objs, R = build_ancient(vid, family, rig, cls, sch, coll, seed, n_sec, L=L)
        t = tri_count(descendants(root))
        if t <= budget or n_sec <= 5:
            return root, objs, R, t, n_sec
        for o in descendants(root):
            remove(o) if remove else None
        n_sec -= 1


# =================================================================== low LOD (single mesh, <= 150 tris), from the recorded rig
def build_ancient_lod(R, coll=None, sch=None):
    H, L = R.H, R.L
    sch = sch or R.sch
    mb = MB(7)
    n = 5
    tfn = topside_t(H, 1.2)
    secs = []
    for i in range(n + 1):
        u = -1 + 2 * i / n
        w = H.w(u); zt = H.zt(u); zk = H.zk(u)
        pr = [('top', w, zt), ('boot', w * 0.95, H.boot * 1.2), ('bottom', w * 0.85, -0.05 * H.fb), (None, 0, zk)]
        port = [mb.vert((H.x(u, z), y, z)) for _, y, z in pr[:-1]]
        stb = [mb.vert((H.x(u, z), -y, z)) for _, y, z in pr[:-1]]
        k = mb.vert((H.x(u, zk), 0, zk))
        secs.append((port + [k], stb + [k], [p[0] for p in pr]))
    for i in range(n):
        (pa, sa, nm), (pb, sb, _) = secs[i], secs[i + 1]
        for k in range(len(pa) - 1):
            c = sch[nm[k]]; br = 1.0 if nm[k] == 'boot' else 0.0
            pc = tfn if nm[k] == 'top' else 0.0
            mb.face((pa[k], pb[k], pb[k + 1], pa[k + 1]), c, 0, br, paint=pc)
            mb.face((sa[k], sa[k + 1], sb[k + 1], sb[k]), c, 0, br, paint=pc)
        mb.face((sa[0], sb[0], pb[0], pa[0]), sch['deck'], 0, paint=deck_side)
    pa, sa, _ = secs[0]
    mb.face(pa + sa[-2::-1], sch['transom'], paint=tfn)

    def tri2(pts, ptsf, col, brand=0.0, paint=None):
        ids = [mb.vert(p, q) for p, q in zip(pts, ptsf)]
        g0 = len(mb.f)
        mb.face(ids, col, 0, brand, jitter=0.0, paint=paint)
        mb.backface(g0)
    cloth = sch['cloth']
    # posts (swan neck, aphlaston, horse head, curls): one 3-sided rod through first/mid/last point
    for (pts, r0, col) in R.lod['posts']:
        p3 = [pts[0], pts[len(pts) // 2], pts[-1]]
        chain(mb, p3, max(0.08, r0), max(0.06, r0 * 0.6), col, 3)
    for (c, size, col) in R.lod['boxes']:
        box(mb, c, size, col, skip=('-z',))
    mb.paint = 8.0
    for (a, b) in R.lod['masts']:
        rod(mb, a, b, max(0.11, 0.011 * L + 0.05), sch['spar'], 3, r2=max(0.08, 0.007 * L + 0.04), smooth=False)
    Rb = Matrix.Rotation(Rig.BRACE, 3, 'Z')
    for (x, z0, z1, wb, wt) in R.lod['squares']:
        b_ = lambda p, x=x: Vector((x, 0, 0)) + Rb @ (p - Vector((x, 0, 0)))
        tri2([b_(Vector((x, -wb / 2, z0))), b_(Vector((x, wb / 2, z0))), b_(Vector((x, wt / 2, z1))), b_(Vector((x, -wt / 2, z1)))],
             [b_(Vector((x, -wt / 2, z1 - 0.3))), b_(Vector((x, wt / 2, z1 - 0.3))), b_(Vector((x, wt / 2, z1))), b_(Vector((x, -wt / 2, z1)))], cloth)
    if R.lod['gaff']:
        x, zb, blen, thz, glen, deg, sn = R.lod['gaff']
        G = Vector((x, 0, zb)); E = G + Vector((-blen, 0, 0))
        Th = Vector((x, 0, thz)); Pk = Th + Vector((-math.cos(math.radians(deg)) * glen, 0, math.sin(math.radians(deg)) * glen))
        tri2([G, E, Pk, Th], [G + Vector((0, 0, 0.15)), E + Vector((0, 0, 0.15)), G.lerp(E, 0.6) + Vector((0, 0, 0.2)), G + Vector((0, 0, 0.2))], cloth)
    mb.paint = 0.0
    # brand cover: a strip that hangs from the main yard (square rigs) or lies on the boom (sprit) when furled
    if R.lod['cover']:
        # the brailed bundle (G6a polish: it must read docked at LOD): a deep front face under the yard with a festooned
        # foot (brails high, cloth sagging between), plus a top face back to the yard. Set: collapsed into the yard.
        x, zy, span, rf = R.lod['cover']
        b_ = lambda p: Vector((x, 0, 0)) + Rb @ (p - Vector((x, 0, 0)))
        h = rf * 2.6 + 0.25
        nf = 2 if R.rig == 'galley' else 4
        hw = span * 0.46
        foot = []
        for i in range(2 * nf + 1):
            t = i / (2 * nf)
            sag = 1.0 if i % 2 else 0.55
            foot.append((x + rf * 1.15, -hw + 2 * hw * t, zy - h * sag))
        front = [(x + rf * 1.15, hw, zy + 0.1), (x + rf * 1.15, -hw, zy + 0.1)] + foot
        tri2([b_(Vector((x + 0.1, p[1], zy))) for p in front], [b_(Vector(p)) for p in front], PAL['brand_default'], 1.0, paint=0.0)
        top = [(x + rf * 1.15, -hw, zy + 0.1), (x + rf * 1.15, hw, zy + 0.1), (x, hw * 0.95, zy + 0.15), (x, -hw * 0.95, zy + 0.15)]
        tri2([b_(Vector((x + 0.1, p[1], zy))) for p in top], [b_(Vector(p)) for p in top], PAL['brand_default'], 1.0, paint=0.0)
    elif R.lod['gaff']:
        x, zb, blen = R.lod['gaff'][:3]
        G = Vector((x, 0, zb)); E = G + Vector((-blen, 0, 0))
        r = max(0.15, 0.03 * blen + 0.08)
        a = [G + Vector((0, 0, 0.05)), E + Vector((0.05 * blen, 0, 0.05)), E + Vector((0.05 * blen, 0, 0.05)), G + Vector((0, 0, 0.05))]
        for sd in (-1, 1):
            ff = [G + Vector((-0.05 * blen, sd * r, 0.05)), E + Vector((0.06 * blen, sd * r, 0.05)), E + Vector((0.06 * blen, 0, 0.05 + 2 * r)),
                  G + Vector((-0.05 * blen, 0, 0.05 + 2 * r))]
            tri2(a, ff, PAL['brand_default'], 1.0, paint=0.0)
    # oar banks: one sheet per bank and side (mid-stroke -> raked up)
    for (x0, x1, b, reach) in R.lod['oars']:
        for sd in (-1, 1):
            zt = H.zt(0) - 0.22 * b * R.S
            w = H.w(0) + 0.03
            ln = reach * (1 + 0.12 * b)
            inner = [Vector((x0, sd * H.w(H.u_at(x0)), zt)), Vector((x1, sd * H.w(H.u_at(x1)), zt))]
            outer = [Vector((x1 - 0.02 * L, sd * (w + ln * 0.9), -0.02)), Vector((x0 - 0.02 * L, sd * (w + ln * 0.9), -0.02))]
            outf = [Vector((x1 - 0.86 * ln, sd * (w + 0.4 * ln), zt + 0.14 * ln)), Vector((x0 - 0.86 * ln, sd * (w + 0.4 * ln), zt + 0.14 * ln))]
            ids = [mb.vert(p) for p in inner] + [mb.vert(p, q) for p, q in zip(outer, outf)]
            f = ids
            nrm = (mb.v[f[1]] - mb.v[f[0]]).cross(mb.v[f[2]] - mb.v[f[0]])
            mb.face(f if nrm.z > 0 else f[::-1], sch['spar'], 0, jitter=0.0)
    root = empty(R.id + '_lod', coll=coll)
    o = to_object(mb, 'lod', 'hb_opaque', parent=root, coll=coll)
    root['family'] = R.family; root['class'] = R.cls; root['rig'] = R.rig; root['loa_m'] = L; root['beam_m'] = round(H.B, 2)
    return root, o, mb.tris()


TITAN_STUDY = ('titan_syracusia', 'titan', 'syracusia', 'flagship',
               ASCH(top='timber_warm', band='egypt_blue', stripe='gilt', cap='gilt', house='whitewash', roof='terracotta', spar='timber_dark'))
TITAN_L = 32.0
