"""Ancient fleet (classical restyle P7a + Water & Boats overhaul): hull FORMS and one rig per family,
alongside hb_hulls.VARIANTS (not replacing it).

Same node contract as hb_hulls.py (docstring there), with these additions / choices:

  sail_main   square rigs: hangs from _heel (mirrored on port tack, like the old ship). On ships with an artemon the
              artemon is a SECOND COMPONENT of sail_main with no emblem UVs: sail-plan.ts never picks a component of
              sail_main as the "second roundel" (SKIP_SECOND), so the small raked bow sail gets no roundel by geometry.
  sail_extra  the siparum (triangular topsail on the main yard): an "upper" sail for sail-plan (main directly under it).
  sail_cover  square rigs: the BRAILED-SAIL BUNDLE on the main yard (hb_cover, child of _heel, braced with the yard).
              furl 0 = collapsed inside the yard, 1 = the plump festooned bundle with cinched hemp lashings hanging
              from the yard. The sprit rig keeps the boom-group cover of hb_hulls.
  yards       square-rig yards (node=1, _PAINT=8) plus 3-sided yard lifts & yard braces (_PAINT=10, E27 hairline-protected).
  oars        galleys only (hb_opaque, child of _heel, symmetric so it needs no mirroring). furl 0 = oars out
              mid-stroke (under way), 1 = oars raked up (docked).
  flag        4-segment fluttering brand burgee at the masthead (_BRAND) + 3-segment FAMILY swallowtail pennant on a
              stern staff, replacing ENSIGN.
  deck        carries classical deckhouses, amphora racks, cargo bales, steering oars, bitts, anchors, gooseneck davits,
              and (on high-density docked classes) 3 interchangeable diversity modules tagged _PAINT 20/21/22.
  Static hull/deck/mast carry E15 BVHTree baked corner attribute _AO in [0.35, 1.0] (hb_bake.py, Seam S-5).
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

# hull forms (same keys as hb_hulls.FORMS). Double-ended (small transom), strong sheer at both ends, deepened bulwarks.
# NOTE (Seam S-4): 'syracusia' stays untouched so W4's Titans keep exact dimensions.
ANCIENT_FORMS = {
    'fisher':    dict(br=0.38, fb=0.13, dr=0.07, bow=2.0, stern=0.22, sheer=(0.45, 0.45), rb=0.04, rs=0.05, bul=0.022, rpow=1.2),
    'coaster':   dict(br=0.33, fb=0.12, dr=0.08, bow=2.2, stern=0.22, sheer=(0.50, 0.60), rb=0.05, rs=0.07, bul=0.025, rpow=1.3),
    'corbita':   dict(br=0.30, fb=0.115, dr=0.08, bow=2.4, stern=0.20, sheer=(0.45, 0.70), rb=-0.035, rs=0.08, bul=0.028, rpow=0.8),
    'merchant':  dict(br=0.29, fb=0.115, dr=0.085, bow=2.4, stern=0.20, sheer=(0.50, 0.70), rb=0.04, rs=0.085, bul=0.030, rpow=1.3),
    'grain':     dict(br=7.40 / 26.0, fb=0.125, dr=0.09, bow=2.3, stern=0.24, sheer=(0.45, 0.70), rb=0.05, rs=0.09, bul=0.035, rpow=1.3),
    'greek':     dict(br=0.31, fb=0.115, dr=0.075, bow=2.3, stern=0.20, sheer=(0.60, 0.65), rb=0.05, rs=0.06, bul=0.025, rpow=1.4),
    'galley':    dict(br=0.14, fb=0.078, dr=0.045, bow=2.6, stern=0.25, sheer=(0.35, 0.90), rb=0.015, rs=0.07, bul=0.018, rpow=1.0),
    'hippos':    dict(br=0.39, fb=0.13, dr=0.07, bow=1.8, stern=0.30, sheer=(0.60, 0.50), rb=0.02, rs=0.04, bul=0.024, rpow=1.0),
    'sprit':     dict(br=0.31, fb=0.105, dr=0.05, bow=2.2, stern=0.20, sheer=(0.88, 0.98), rb=0.08, rs=0.08, bul=0.016, rpow=0.8),
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

# id, family, rig (= form), class, scheme.
ANCIENT_VARIANTS = [
    ('usd_fisher_skiff', 'usd', 'fisher', 'skiff', ASCH(top='timber_pale', band='egypt_blue', stripe='egypt_blue')),
    ('usd_coaster_boat', 'usd', 'coaster', 'boat', ASCH(band='egypt_blue', stripe='egypt_blue')),
    ('usd_coaster_small', 'usd', 'coaster', 'small', ASCH(top='timber_warm', band='ochre_red', stripe='ochre_red', transom='timber_warm')),
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
    ('other_sprit_skiff', 'other', 'sprit', 'skiff', ASCH(top='timber_pale', band='timber_grey', stripe='ochre_red', cap='timber_dark', cloth='canvas_old')),
    ('other_sprit_boat', 'other', 'sprit', 'boat', ASCH(top='timber_pale', band='timber_grey', stripe='ochre_red', cap='timber_dark', cloth='canvas_old')),
    ('other_sprit_small', 'other', 'sprit', 'small', ASCH(top='timber_pale', band='timber_grey', stripe='ochre_red', cap='timber_dark', cloth='canvas_old')),
]
REPLACES = {v[0]: o[0] for v in ANCIENT_VARIANTS for o in hb_hulls.VARIANTS if (o[1], o[3]) == (v[1], v[3])}

# Target section counts per variant (strictly 9-14 smooth sections, matching PLAN §4.1!)
VARIANT_SECTIONS = {
    'usd_fisher_skiff': 9,
    'other_sprit_skiff': 9,
    'usd_coaster_boat': 10,
    'eur_greek_boat': 10,
    'fiat_hippos_boat': 10,
    'other_sprit_boat': 10,
    'usd_coaster_small': 11,
    'eur_greek_small': 11,
    'fiat_hippos_small': 11,
    'other_sprit_small': 11,
    'usd_corbita_medium': 12,
    'eur_greek_medium': 12,
    'fiat_hippos_medium': 12,
    'gold_bireme_medium': 11,
    'usd_merchant_large': 14,
    'eur_greek_large': 14,
    'gold_trireme_large': 13,
    'usd_grain_flagship': 14,
}


def chain(mb, pts, r0, r1, col, segs=5, pat=0, jitter=0.03, paint=None):
    """A tapered tube along a polyline (posts, necks, curls). Extra kwargs optional (Seam S-4)."""
    n = len(pts) - 1
    for i in range(n):
        ra = r0 + (r1 - r0) * i / n; rb = r0 + (r1 - r0) * (i + 1) / n
        rod(mb, pts[i], pts[i + 1], ra, col, segs, r2=rb, cap=(i == n - 1), pat=pat, jitter=jitter, paint=paint)


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
    def mast_at(s, x, h, r=None, rake=0.0, parts=1, calcet=False):
        base, top = super().mast_at(x, h, r, rake, parts)
        if calcet:
            s.karchesion(top, r or s.r_mast)
        s.lod['masts'].append((base.copy(), top.copy()))
        return base, top

    def karchesion(s, top, r=None):
        """Masthead calcet / karchesion sheave block, UNWELDED on `mast` so E27 tubeRadii stays pure."""
        rr = r or s.r_mast
        c = top - Vector((0, 0, rr * 1.4))
        box(s.mast, c, (rr * 2.5, rr * 2.0, rr * 2.2), PAL['timber_dark'], PT['boards'], skip=('-z',))

    def yard(s, mx, z, span, r, paint=None):
        """Square yard spar. Optional `paint=8.0` tags yard spars when lifts/braces (`paint=10.0`) share `s.yards`."""
        br = s._brace(mx)
        c = Vector((mx + s.r_mast * 0.6, 0, z))
        for sd in (-1, 1):
            rod(s.yards, br(c), br(c + Vector((0, sd * span / 2, 0))), r, s.sch['spar'], 4, r2=r * 0.55, paint=paint)

    def yard_rigging(s, mx, zy, span, top, braces=True):
        """3-sided yard lifts and yard braces on `s.yards` (node=1, _PAINT=10 -> E27 hairline-protected)."""
        br = s._brace(mx)
        c_mast = Vector((mx, 0, top.z - 0.025 * s.L))
        x_br = max(s.H.stern().x + 0.14 * s.L, mx - 0.28 * s.L)
        u_br = s.H.u_at(x_br)
        w_br = s.H.w(u_br) * 0.94
        z_br = s.H.zt(u_br)
        r_line = s.rope * 0.9
        for sd in (-1, 1):
            tip = br(Vector((mx + s.r_mast * 0.6, sd * span * 0.46, zy)))
            line(s.yards, c_mast, tip, r_line, PAL['tar'], paint=10.0)
            if braces:
                cleat = Vector((x_br, sd * w_br, z_br))
                line(s.yards, tip, cleat, r_line, PAL['tar'], paint=10.0)

    ROLL_SLIM = 0.22

    def square(s, mb, mx, zy, span, zb, span_b, emblem=False, belly=0.06, nu=3, nv=2,
               roach=0.0, scallop=0.0, asym=False):
        """Square sail hung from a braced yard, its furled roll slimmed to ROLL_SLIM (0.22).
        Optional sculpted parameters (roach, scallop, asym) default off for Seam S-4 compatibility."""
        n0 = len(mb.v)
        if roach == 0.0 and scallop == 0.0 and not asym:
            super().square(mb, mx, zy, span, zb, span_b, emblem=emblem, belly=belly, nu=nu, nv=nv)
        else:
            S = s.S
            br = s._brace(mx)
            R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
            fwd = R_ @ Vector((1, 0, 0)); up = Vector((0, 0, 1))
            x0 = mx + s.r_mast * 0.9
            H_sail = zy - zb
            rf = max(0.14, 0.11 * max(H_sail, 0.1) ** 0.7 + 0.06 * S)

            def flat(u, v):
                wv = span_b + (span - span_b) * v
                return br(Vector((x0, -wv / 2 + wv * u, zb + H_sail * v)))

            def P(u, v):
                z_roach = roach * H_sail * math.sin(math.pi * u) * ((1.0 - v) ** 1.25)
                u_a = (u ** 0.90) if asym else u
                b_bell = belly * span * math.sin(math.pi * u_a) * math.sin(math.pi * (0.14 + 0.78 * (1.0 - v)))
                b_scal = -scallop * span * abs(math.sin(4.0 * math.pi * u)) * math.sin(math.pi * v) * (1.0 - 0.30 * v)
                return flat(u, v) + up * z_roach + fwd * (b_bell + b_scal)

            def Pf(u, v):
                th = math.pi * (0.1 + 1.7 * (1 - v))
                k = 0.55 + 0.45 * math.sin(math.pi * (0.1 + 0.8 * u))
                c = br(Vector((x0 + rf * 0.3, (-span / 2 + span * u) * 0.9, zy + rf * 0.55)))
                return c + rf * k * (0.6 + 0.4 * v) * (math.cos(th) * fwd + math.sin(th) * up)

            uv2f = None
            if emblem:
                uv2f = s.emblem_uv(flat(0, 0), flat(1, 0), flat(0, 1), flat(1, 1), square=True)
            hb_hulls.patch(mb, nu, nv, P, Pf, s.sch['cloth'], uv=lambda u, v: (u, v),
                           uv2=(lambda u, v: uv2f(flat(u, v))) if uv2f else (lambda u, v: (-4.0, -4.0)), smooth=True)
        ax = Matrix.Rotation(s.BRACE, 3, 'Z') @ Vector((0, 1, 0))
        pts = mb.vf[n0:]
        if not pts:
            return
        c = sum(pts, Vector()) / len(pts)
        for i in range(n0, len(mb.vf)):
            d = mb.vf[i] - c
            al = d.dot(ax)
            mb.vf[i] = c + ax * al + (d - ax * al) * s.ROLL_SLIM

    def course(s, mx, zy, span, zb, span_b, emblem=True, belly=0.06, nu=3, nv=3, cover=True,
               top=None, sculpted=False):
        """Main square sail on a braced yard (+ plump brailed bundle + optional lifts/braces)."""
        if sculpted:
            big = s.L >= 13.0
            nu = 6 if big else 5
            nv = 5 if big else 4
            s.yard(mx, zy, span, s.r_mast * 0.5, paint=8.0)
            s.square(s.main_sq, mx, zy, span, zb, span_b, emblem=emblem, belly=0.13, nu=nu, nv=nv,
                     roach=0.07, scallop=0.015, asym=True)
            if top is not None:
                s.yard_rigging(mx, zy, span, top, braces=True)
            s.lod['squares'].append((mx, zb, zy, span_b, span))
            if cover:
                nf = 4 if (not big or s.rig == 'galley') else 5
                segs_c = 6 if big else (4 if s.L < 6.0 else 5)
                s.brail_cover(mx, zy, span, zb, nf=nf, segs=segs_c, plump=True)
            return
        s.yard(mx, zy, span, s.r_mast * 0.5)
        s.square(s.main_sq, mx, zy, span, zb, span_b, emblem=emblem, belly=belly, nu=nu, nv=nv)
        s.lod['squares'].append((mx, zb, zy, span_b, span))
        if cover:
            small = s.L < 10
            s.brail_cover(mx, zy, span, zb, nf=3 if small else 4, segs=5 if small else 6)

    def brail_cover(s, mx, zy, span, zb, nf=4, segs=6, plump=False):
        """Brailed-sail bundle: plump 4-5 swag gathered festoons with cinched dark-hemp lashings."""
        br = s._brace(mx)
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        fwd = R_ @ Vector((1, 0, 0)); up = Vector((0, 0, 1))
        rf = max(0.14, 0.11 * max(zy - zb, 0.1) ** 0.7 + 0.06 * s.S)
        x0 = mx + s.r_mast * 0.9
        ry = s.r_mast * 0.5 * 0.4

        if not plump:
            nr = 2 * nf + 1
            rings = []
            for i in range(nr):
                t = i / (nr - 1)
                y = (-span / 2 + span * t) * 0.92
                fest = abs(math.sin(math.pi * nf * t))
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
            return

        # Plump 4-5 swag gathered brail roll with cinched dark-hemp lashing bands
        # Skiff/boat use 2-step swags (96 tris); small+ use dedicated narrow cinch collars (140-176 tris)
        detailed_cinch = s.L >= 10.0
        stations = []
        if detailed_cinch:
            dt = 0.075 / nf
            for k in range(nf):
                t0 = k / nf
                t1 = (k + 1) / nf
                if k == 0:
                    stations.append((0.0, True))
                else:
                    stations.append((t0 - dt, True))
                    stations.append((t0 + dt, True))
                stations.append((0.5 * (t0 + t1), False))
            stations.append((1.0, True))
        else:
            for i in range(2 * nf + 1):
                stations.append((i / (2 * nf), i % 2 == 0))

        rings = []
        for (t, is_cinch) in stations:
            y = (-span / 2 + span * t) * 0.92
            taper = 0.66 + 0.34 * math.sin(math.pi * min(1.0, 0.08 + 0.84 * t))
            c_set = br(Vector((mx + s.r_mast * 0.6, y, zy)))
            c_f = br(Vector((x0 + rf * 0.30, y, zy + rf * 0.22)))
            base_r = (rf * 1.22 + 0.045) * taper
            rc = base_r * (0.74 if is_cinch else 1.08)
            ring = []
            for j in range(segs):
                a = 2 * math.pi * j / segs
                ca, sa = math.cos(a), math.sin(a)
                d = (ca * 1.04) * fwd + (sa * 0.96) * up
                # Soft pillowy cloth swag between brails; cinched neatly by dark-hemp lashings
                sag_k = 0.38 if is_cinch else 1.0
                sag = up * (-(rf * 0.86 + 0.08) * sag_k * (0.25 + 0.75 * max(0.0, -sa)))
                ring.append((s.cover_y.vert(c_set + d * ry, c_f + d * rc + sag), sa))
            rings.append((ring, is_cinch))

        for (r0, c0), (r1, c1) in zip(rings, rings[1:]):
            lashing = c0 and c1
            for j in range(segs):
                j2 = (j + 1) % segs
                up_k = 0.5 * (r0[j][1] + r0[j2][1])
                if lashing:
                    col = (0.36, 0.31, 0.25)   # cinched dark-hemp lashing collar
                    sm = False
                else:
                    # Subtle cinch crease darkening near ends + rich cylindrical pillow shading
                    cinch_sh = 0.88 if (c0 or c1) else 1.0
                    sh = (0.72 + 0.28 * max(0.0, up_k * 0.5 + 0.5)) * cinch_sh
                    col = (sh, sh, sh)
                    sm = True
                s.cover_y.face((r0[j][0], r1[j][0], r1[j2][0], r0[j2][0]), col, 0, smooth=sm, jitter=0.0)
        s.cover_y.face([v for v, _ in rings[0][0]], (0.78, 0.76, 0.72), jitter=0.0)
        s.cover_y.face([v for v, _ in rings[-1][0]][::-1], (0.78, 0.76, 0.72), jitter=0.0)
        s.lod['cover'] = (mx, zy, span, rf)

    def artemon(s, rake_deg=40.0, h=None, span=None, nu=2, nv=2, sculpted=False):
        """Raked bow mast + small square sail: a second component of sail_main WITHOUT emblem UVs."""
        H, L = s.H, s.L
        bw = H.bow()
        x = bw.x - 0.07 * L
        h = h or 0.34 * L
        _, top = s.mast_at(x, h, s.r_mast * 0.6, rake=-math.radians(rake_deg), calcet=sculpted)
        span = span or 0.3 * L
        zy = top.z - 0.05 * L
        sh = 0.55 * (zy - H.deck(x))
        mxy = top.x - 0.02 * L
        s.yard(mxy, zy, span, s.r_mast * 0.35, paint=8.0 if sculpted else None)
        if sculpted:
            s.square(s.main_sq, mxy, zy, span, zy - sh, span * 0.95, emblem=False,
                     belly=0.12, nu=nu, nv=nv, roach=0.06, scallop=0.01, asym=True)
            s.yard_rigging(mxy, zy, span, top, braces=False)
        else:
            s.square(s.main_sq, mxy, zy, span, zy - sh, span * 0.95, emblem=False, nu=nu, nv=nv)
        s.lod['squares'].append((mxy, zy - sh, zy, span * 0.95, span))
        line(s.rigging, top, bw + Vector((0.02 * L, 0, 0.0)), s.rope)
        return top

    def siparum(s, mx, zy, span, top, nu=2, nv=2):
        """Triangular topsail: foot along the main yard, head at the masthead. furl = rolled down onto the yard."""
        br = s._brace(mx)
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        fwd = R_ @ Vector((1, 0, 0)); up = Vector((0, 0, 1))
        x0 = mx + s.r_mast * 0.9
        zh = top.z - 0.15

        def P(u, v):
            w = span * (1 - v)
            b = (0.075 if nu > 2 else 0.04) * span * math.sin(math.pi * u) * math.sin(math.pi * (0.15 + 0.75 * (1 - v)))
            return br(Vector((x0, -w / 2 + w * u, zy + 0.12 + (zh - zy - 0.12) * v))) + fwd * b

        def Pf(u, v):
            r = 0.08 + 0.022 * s.L * (1 - v)
            th = math.pi * (0.2 + 1.4 * v)
            return br(Vector((x0 + 0.05, (-span / 2 + span * u) * 0.8 * (1 - 0.5 * v), zy + 0.18))) + r * (math.cos(th) * fwd + math.sin(th) * up) * 0.55
        hb_hulls.patch(s.extra, nu, nv, P, Pf, s.sch['cloth'], uv=lambda u, v: (u, v), uv2=lambda u, v: (-4.0, -4.0), smooth=True, tri_head=True)
        s.lod['squares'].append((mx, zy + 0.12, zh, span, 0.05))

    # -------------------------------------------------- hull dress & classical fittings
    def steering_oars(s, k=1.0, sculpted=False):
        H, L = s.H, s.L
        u = -0.78
        x = H.x(u, H.zt(u)); w = H.w(u); zt = H.zt(u)
        sides = (-1,) if L < 6 else (-1, 1)
        if not sculpted:
            for sd in sides:
                a = Vector((x + 0.02 * L, sd * (w + 0.04), zt + 0.08 * s.S))
                b = Vector((x - 0.11 * L * k, sd * (w + 0.12 * s.S + 0.1), -H.dr * 0.9))
                rod(s.deck, a, b, max(0.035, 0.005 * L), s.sch['spar'], 4)
                d = (b - a).normalized(); y = Vector((0, 1, 0)); wv = d.cross(y).normalized()
                box(s.deck, b - d * 0.045 * L * k, (0.11 * L * k, 0.035, 0.03 * L * k + 0.1), s.sch['spar'], axes=(d, y, wv))
            return
        # Sculpted teardrop quarter steering oars with timber outrigger brackets + inboard tillers
        for sd in sides:
            brk_c = Vector((x + 0.005 * L, sd * (w + 0.055 * s.S + 0.04), zt - 0.04 * s.S))
            box(s.deck, brk_c, (0.045 * L, 0.12 * s.S + 0.09, 0.06 * s.S + 0.04), PAL['timber_dark'], PT['boards'],
                skip=('-y' if sd > 0 else '+y', '-z'))
            a = Vector((x + 0.025 * L, sd * (w + 0.06 * s.S + 0.03), zt + 0.14 * s.S))
            b = Vector((x - 0.115 * L * k, sd * (w + 0.14 * s.S + 0.11), -H.dr * 0.95))
            r_loom = max(0.032, 0.0046 * L)
            rod(s.deck, a, b, r_loom, s.sch['spar'], 4 if L >= 13 else 3, r2=r_loom * 0.85)
            if L >= 6.0:
                rod(s.deck, a, a + Vector((0.03 * L, -sd * (0.18 * H.B), 0.02 * s.S)), r_loom * 0.65, PAL['timber_dark'], 3)
            d = (b - a).normalized()
            side_n = Vector((0, sd, 0))
            wv = d.cross(Vector((0, 1, 0))).normalized()
            bl_len = 0.12 * L * k
            bl_w = 0.026 * L * k + 0.08
            th = max(0.018, 0.0022 * L)
            p_top = b - d * bl_len
            p_mid = b - d * (bl_len * 0.35)
            p_tip = b + d * (bl_len * 0.08)
            prof = [p_top, p_mid + wv * bl_w, p_tip + wv * (bl_w * 0.38), p_tip - wv * (bl_w * 0.38), p_mid - wv * bl_w]
            f_out = [s.deck.vert(p + side_n * th) for p in prof]
            f_in = [s.deck.vert(p - side_n * th) for p in prof]
            s.deck.face(f_out if sd > 0 else f_out[::-1], s.sch['spar'], PT['boards'], jitter=0.02)
            s.deck.face(f_in[::-1] if sd > 0 else f_in, s.sch['spar'], PT['boards'], jitter=0.02)

    def post(s, pts, r0, r1, col, segs=5, pat=0, jitter=0.03):
        chain(s.hull, pts, r0, r1, col, 4 if s.L < 6 else segs, pat=pat, jitter=jitter)
        s.lod['posts'].append(([p.copy() for p in pts], r0, col))

    def swan_neck(s, col, R=None):
        H, L = s.H, s.L
        st = H.stern() + Vector((0.01 * L, 0, -0.02 * L))
        R = R or 0.075 * L
        pts = arc(st, R, 235, n=6)
        s.post(pts, 0.016 * L + 0.03, 0.009 * L + 0.02, col)
        e = pts[-1]; d = (pts[-1] - pts[-2]).normalized()
        box(s.hull, e + d * 0.02 * L, (0.06 * L, 0.025 * L, 0.025 * L), col, axes=(d, Vector((0, 1, 0)), d.cross(Vector((0, 1, 0)))))

    def cheniskos(s, col, R=None, gilt_collar=False):
        """Sculpted S-curve swan-neck (*cheniskos*) with arched neck, head crest, and tapered bill."""
        H, L = s.H, s.L
        st = H.stern() + Vector((0.01 * L, 0, -0.02 * L))
        R = R or 0.072 * L
        is_metal = (col == PAL['gilt'])
        pat = PT['metal'] if is_metal else 0
        jit = 0.0 if is_metal else 0.02
        # Graceful S-curve: sweeps aft & up, curves over forward, then lifts gracefully into swan head
        pts = [
            st,
            st + Vector((-0.42 * R, 0, 0.42 * R)),
            st + Vector((-0.68 * R, 0, 1.05 * R)),
            st + Vector((-0.42 * R, 0, 1.68 * R)),
            st + Vector((0.18 * R, 0, 1.92 * R)),
            st + Vector((0.55 * R, 0, 1.62 * R)),
        ]
        sg_c = 5 if L >= 12 else 4
        s.post(pts, 0.016 * L + 0.028, 0.009 * L + 0.018, col, segs=sg_c, pat=pat, jitter=jit)
        # Sculpted head & bill pointing gently forward/down
        head = pts[-1]
        d = Vector((0.86, 0, -0.50)).normalized()
        up_h = Vector((0.50, 0, 0.86)).normalized()
        rod(s.hull, head - d * (0.006 * L), head + d * (0.026 * L), 0.011 * L + 0.018, col, sg_c,
            r2=0.008 * L + 0.014, cap=True, pat=pat, jitter=jit)
        rod(s.hull, head + d * (0.024 * L), head + d * (0.056 * L) - up_h * (0.005 * L),
            0.006 * L + 0.01, PAL['gilt'] if (is_metal or gilt_collar) else col, 3 if L < 10 else 4,
            r2=0.002 * L + 0.005, cap=True, pat=PT['metal'] if (is_metal or gilt_collar) else 0, jitter=0.0)
        if gilt_collar and not is_metal:
            c0, c1 = pts[2], pts[3]
            cm = c0.lerp(c1, 0.45)
            dc = (c1 - c0).normalized()
            rod(s.hull, cm - dc * (0.01 * L), cm + dc * (0.01 * L), 0.016 * L + 0.025, PAL['gilt'], 5,
                pat=PT['metal'], jitter=0.0)

    def stern_curl(s, col, R=None, th=200):
        H, L = s.H, s.L
        st = H.stern() + Vector((0.01 * L, 0, -0.02 * L))
        s.post(arc(st, R or 0.05 * L, th, n=4 if L < 6 else 5), 0.014 * L + 0.03, 0.007 * L + 0.02, col, segs=3 if L < 6 else 4)

    def stem_post(s, col, h=0.06, pat=0):
        H, L = s.H, s.L
        bw = H.bow()
        pts = [bw + Vector((-0.01 * L, 0, -0.02 * L)), bw + Vector((0.008 * L, 0, h * 0.6 * L)), bw + Vector((0.0, 0, h * L))]
        s.post(pts, 0.012 * L + 0.03, 0.008 * L + 0.02, col, 3 if L < 6 else 4, pat=pat, jitter=0.0 if pat else 0.03)

    def greek_stem(s, col, h=0.08):
        """Concave Greek stempost sweeping aft-upward then curling forward into a spiral scroll finial."""
        H, L = s.H, s.L
        bw = H.bow() + Vector((-0.008 * L, 0, -0.02 * L))
        R = h * L
        pts = [
            bw,
            bw + Vector((0.18 * R, 0, 0.35 * R)),
            bw + Vector((-0.08 * R, 0, 0.82 * R)),
            bw + Vector((-0.34 * R, 0, 1.18 * R)),
            bw + Vector((-0.04 * R, 0, 1.38 * R)),
            bw + Vector((0.20 * R, 0, 1.20 * R)),
        ]
        sg = 5 if L >= 13 else 4
        s.post(pts, 0.014 * L + 0.028, 0.007 * L + 0.016, col, segs=sg)
        rod(s.hull, pts[-1] + Vector((0, -0.012 * L, 0)), pts[-1] + Vector((0, 0.012 * L, 0)),
            0.013 * L + 0.015, PAL['ochre_yel'], sg, cap=True)

    def eyes(s, u=0.8, size=None):
        """Painted ophthalmoi on both bows: white almond + dark iris, proud of the hull & 3D rubbing wales."""
        H, L = s.H, s.L
        size = min((size or 0.05 * L) * 1.45, (H.zt(u) - H.boot) * 0.78 / 0.42)
        # Sit cleanly in the upper bow sheer strake (between the upper and lower 3D wales)
        zc = H.boot + (H.zt(u) - H.boot) * 0.66
        xc = H.x(u, zc)
        alm = [(-1.0, 0.0), (-0.45, 0.42), (0.35, 0.4), (1.0, 0.0), (0.35, -0.3), (-0.45, -0.32)]
        iris = [(-0.12, -0.25), (0.32, -0.25), (0.32, 0.27), (-0.12, 0.27)]
        wale_clr = max(0.044, 0.0072 * L)
        for sd in (-1, 1):
            for pts, col, off in ((alm, PAL['eye_white'], wale_clr + 0.045 * size),
                                  (iris, PAL['eye_black'], wale_clr + 0.018 + 0.055 * size)):
                ids = []
                for px, pz in pts:
                    x = xc + px * size * 0.5; z = zc + pz * size * 0.5
                    ids.append(s.hull.vert((x, sd * (H.w(H.u_at(x)) + off), z)))
                v = [s.hull.v[i] for i in ids[:3]]
                outward = ((v[1] - v[0]).cross(v[2] - v[0])).y * sd > 0
                s.hull.face(ids if outward else ids[::-1], col, 0, jitter=0.0)

    def bulwark_knees(s, n_pairs=4):
        """Interior timber bulwark knees (small+) bridging recessed deck margin to under-cap rail."""
        H, L = s.H, s.L
        if H.bh <= 0.05:
            return
        kw = max(0.05, 0.007 * L)
        kh = H.bh * 0.88
        for k in range(n_pairs):
            u = -0.62 + 1.24 * k / max(1, n_pairs - 1)
            x = H.x(u, H.zt(u))
            w_in = max(H.w(u) - H.th, 0.1)
            z0 = H.zt(u) - H.bh
            for sd in (-1, 1):
                box(s.deck, (x, sd * (w_in - kw * 0.7), z0 + kh * 0.5),
                    (kw * 0.95, kw * 1.4, kh), PAL['timber_dark'], PT['boards'],
                    skip=('-z', '+z', '+y' if sd > 0 else '-y'))

    def mooring_bitts(s, coils=1):
        """Stout oak mooring bitts right under bow_cleat / stern_cleat + coiled hemp hawsers."""
        H, L, S = s.H, s.L, s.S
        ends = (0.80,) if L < 6.0 else (0.80, -0.84)
        for idx, u in enumerate(ends):
            x = H.x(u, H.zt(u)) + (-0.03 * L if u > 0 else 0.03 * L)
            z0 = H.deck_at(x, 0.0)
            bh_p = max(0.18, 0.24 * S + 0.10)
            r_p = max(0.038, 0.0058 * L)
            sp = min(H.w(u) * 0.34, max(0.14, 0.22 * S))
            box(s.deck, (x, 0.0, z0 + bh_p * 0.45), (r_p * 2.2, r_p * 2.4, bh_p),
                PAL['timber_dark'], PT['boards'], skip=('-z',))
            if L >= 6.0:
                box(s.deck, (x, 0.0, z0 + bh_p * 0.78), (r_p * 1.6, sp * 2.2, r_p * 1.4),
                    PAL['timber_dark'], PT['boards'], skip=('-z',))
            if idx < coils:
                cx = x + (-0.06 * L if u > 0 else 0.06 * L)
                cy = min(H.w(H.u_at(cx)) * 0.36, 0.24 * H.B)
                cz = H.deck_at(cx, cy) + 0.025
                rc = max(0.11, 0.015 * L)
                rt = max(0.026, 0.0035 * L)
                n_c = 4 if L >= 13 else 3
                for j in range(n_c):
                    a0, a1 = 2 * math.pi * j / n_c, 2 * math.pi * (j + 1) / n_c
                    rod(s.deck, (cx + rc * math.cos(a0), cy + rc * math.sin(a0), cz),
                        (cx + rc * math.cos(a1), cy + rc * math.sin(a1), cz), rt, PAL['rope'], 3, smooth=False)

    def fluked_anchor(s, side=1):
        """Stowed classical Greco-Roman lead/timber-stocked bronze-fluked anchor on the foredeck bow rail."""
        H, L = s.H, s.L
        u = 0.72
        x = H.x(u, H.zt(u))
        w = H.w(u) * 0.72
        z = H.deck_at(x, side * w) + 0.05
        al = 0.085 * L
        r_sh = max(0.024, 0.0032 * L)
        p_head = Vector((x + al * 0.45, side * w, z + 0.06))
        p_crown = Vector((x - al * 0.45, side * (w * 0.92), z + 0.03))
        rod(s.deck, p_head, p_crown, r_sh, PAL['bronze'], 3, pat=PT['metal'], jitter=0.0)
        rod(s.deck, p_head + Vector((-0.08 * al, -0.30 * al, -0.02)),
            p_head + Vector((-0.08 * al, 0.30 * al, 0.04)), r_sh * 1.35, PAL['timber_dark'], 3, cap=True)
        for dy in (-1, 1):
            tip = p_crown + Vector((0.36 * al, dy * 0.34 * al, 0.06 * al))
            rod(s.deck, p_crown, tip, r_sh * 0.9, PAL['bronze'], 3, r2=r_sh * 0.45, pat=PT['metal'], jitter=0.0)
            box(s.deck, tip, (r_sh * 2.8, r_sh * 2.2, r_sh * 1.4), PAL['bronze'], PT['metal'], skip=('-z',), jitter=0.0)

    def amphorae(s, xs, ys, h, segs=4):
        for x in xs:
            for y in ys:
                z = s.H.deck_at(x, y) - 0.02
                rod(s.deck, (x, y, z), (x, y, z + h), h * 0.32, PAL['amphora'], segs, r2=h * 0.12, cap=True)

    def amphora_rack(s, x0, x1, y0, y1, nx, ny, h, paint=0.0, segs=6):
        """Timber cradle rack holding turned 6-sided terracotta amphorae (foot -> plump belly -> narrow neck)."""
        H = s.H
        xc = 0.5 * (x0 + x1); yc = 0.5 * (y0 + y1)
        zr = H.deck_at(xc, yc)
        th = max(0.035, 0.06 * h)
        for yy in (y0 - th, y1 + th):
            box2(s.deck, x0 - th, yy - th * 0.6, zr - 0.02, x1 + th, yy + th * 0.6, zr + h * 0.36,
                 PAL['timber_dark'], PT['boards'], skip=('-z', '-x', '+x'), paint=paint)
        for ix in range(nx):
            tx = 0.5 if nx == 1 else ix / (nx - 1)
            x = x0 + (x1 - x0) * tx
            for iy in range(ny):
                ty = 0.5 if ny == 1 else iy / (ny - 1)
                y = y0 + (y1 - y0) * ty
                z = H.deck_at(x, y) - 0.015
                col = PAL['amphora'] if (ix + iy) % 2 == 0 else PAL['terracotta']
                # Shared 3-ring turned profile (foot -> plump belly -> narrow rim, open bottom = 2*segs*2 + (segs-2) tris)
                r_b, r_m, r_t = h * 0.14, h * 0.31, h * 0.12
                z_m, z_t = z + h * 0.60, z + h
                ring = lambda rr, zz: [s.deck.vert((x + rr * math.cos(2 * math.pi * k / segs),
                                                    y + rr * math.sin(2 * math.pi * k / segs), zz)) for k in range(segs)]
                R0, R1, R2 = ring(r_b, z), ring(r_m, z_m), ring(r_t, z_t)
                for k in range(segs):
                    k2 = (k + 1) % segs
                    s.deck.face((R0[k], R0[k2], R1[k2], R1[k]), col, 0, smooth=True, jitter=0.03, paint=paint)
                    s.deck.face((R1[k], R1[k2], R2[k2], R2[k]), col, 0, smooth=True, jitter=0.03, paint=paint)
                s.deck.face(R2, PAL['timber_dark'], 0, jitter=0.0, paint=paint)

    def cargo_bales(s, items, paint=0.0):
        """Tarped cargo bales with dark-hemp cross-lashings. items: [(x, y, lx, ly, hz, col), ...]."""
        for (x, y, lx, ly, hz, col) in items:
            z = s.H.deck_at(x, y) - 0.02
            box(s.deck, (x, y, z + hz * 0.5), (lx, ly, hz), col, PT['boards'], skip=('-z',), jitter=0.05, paint=paint)
            box(s.deck, (x, y, z + hz * 0.52), (lx * 0.16, ly * 1.04, hz * 1.03), PAL['tar'], 0,
                skip=('-z', '-x', '+x'), jitter=0.0, paint=paint)

    def cedar_bundles(s, x, y, length, r_log, paint=0.0):
        """Bound Lebanese cedar-log bundle (3 stacked logs + 2 hemp binding bands) for Phoenician hippos."""
        z = s.H.deck_at(x, y) + r_log * 0.85
        offs = [(0, -r_log * 0.95, 0), (0, r_log * 0.95, 0), (0, 0, r_log * 1.55)]
        sg = 3 if s.L < 9.0 else 4
        for (_, oy, oz) in offs:
            rod(s.deck, (x - length * 0.5, y + oy, z + oz), (x + length * 0.5, y + oy, z + oz),
                r_log, PAL['timber_warm'], sg, cap=True, pat=PT['boards'], paint=paint)
        for sx in (-0.28, 0.28):
            box(s.deck, (x + sx * length, y, z + r_log * 0.65),
                (r_log * 0.6, r_log * 3.9, r_log * 2.9), PAL['rope'], 0,
                skip=('-z', '-x', '+x'), jitter=0.0, paint=paint)

    def arched_awning(s, x0, x1, half_w, h, col=None, stripe=None, paint=0.0):
        """Classical 3-panel arched linen canopy on 4 timber stanchions."""
        H = s.H
        col = col or PAL['linen']
        stripe = stripe or s.sch['stripe']
        r_st = max(0.024, 0.0032 * s.L)
        z0 = H.deck((x0 + x1) * 0.5)
        for xx in (x0 + 0.04 * (x1 - x0), x1 - 0.04 * (x1 - x0)):
            for sd in (-1, 1):
                zb = H.deck_at(xx, sd * half_w) - 0.02
                rod(s.deck, (xx, sd * half_w, zb), (xx, sd * half_w, z0 + h), r_st, PAL['timber_dark'], 3, smooth=False, paint=paint)
        # 3-panel arched canopy (port slope, crown, stbd slope) + double-sided underside
        arch = [(-1.0, 0.0), (-0.42, 0.24 * h), (0.42, 0.24 * h), (1.0, 0.0)]
        r_a = [s.deck.vert((x0, yk * half_w, z0 + h + zk)) for (yk, zk) in arch]
        r_b = [s.deck.vert((x1, yk * half_w, z0 + h + zk)) for (yk, zk) in arch]
        g0 = len(s.deck.f)
        for k in range(3):
            c_use = stripe if k == 1 else col
            s.deck.face((r_a[k], r_b[k], r_b[k + 1], r_a[k + 1]), c_use, 0, smooth=True, jitter=0.01, paint=paint)
        s.deck.backface(g0, dark=0.72)

    def gable_house(s, x0, x1, wfrac, h, col=None, roof=None, porch=False, paint=0.0):
        """Classical Mediterranean deckhouse with pitched tiled gable roof and optional colonnaded porch."""
        H, S = s.H, s.S
        z = H.deck((x0 + x1) * 0.5)
        w = min(H.half(x0), H.half(x1)) * 2 * wfrac
        col = col or s.sch['house']
        roof = roof or s.sch['roof']
        x_body1 = x1 - (0.28 * (x1 - x0) if porch else 0.0)
        # Main cabin walls
        box2(s.deck, x0, -w / 2, z - 0.08, x_body1, w / 2, z + h, col, PT['render'], skip=('-z', '+z'), paint=paint)
        # Dark timber door on forward wall + small quarter shutters
        box2(s.deck, x_body1 - 0.02, -w * 0.16, z + 0.05, x_body1 + 0.03, w * 0.16, z + h * 0.72,
             PAL['timber_dark'], PT['boards'], skip=('-x', '-z'), paint=paint)
        if porch:
            for sd in (-1, 1):
                rod(s.deck, (x1 - 0.08 * S, sd * w * 0.44, z - 0.04), (x1 - 0.08 * S, sd * w * 0.44, z + h),
                    0.065 * S + 0.025, col, 5, paint=paint)
        # Pitched terracotta tiled gable roof + tympana
        ov = 0.06 * S + 0.04
        rh = 0.24 * w + 0.08 * S
        xa, xb = x0 - ov, x1 + ov
        ya, yb = -w / 2 - ov, w / 2 + ov
        z_e = z + h
        va, vb, vc, vd = s.deck.vert((xa, ya, z_e)), s.deck.vert((xb, ya, z_e)), s.deck.vert((xb, yb, z_e)), s.deck.vert((xa, yb, z_e))
        vr0, vr1 = s.deck.vert((xa, 0.0, z_e + rh)), s.deck.vert((xb, 0.0, z_e + rh))
        rp = 7.0 if paint == 0.0 else paint
        s.deck.face((va, vb, vr1, vr0), roof, PT['tiles'], jitter=0.02, paint=rp)
        s.deck.face((vc, vd, vr0, vr1), roof, PT['tiles'], jitter=0.02, paint=rp)
        s.deck.face((vd, va, vr0), col, 0, jitter=0.01, paint=paint)
        s.deck.face((vb, vc, vr1), col, 0, jitter=0.01, paint=paint)

    def deck_boat(s, xc, scale_l=0.16):
        """Overturned classical *lembos* ship's boat lashed onto twin timber chocks (for grain flagship)."""
        H, L, S = s.H, s.L, s.S
        z = H.deck_at(xc, 0.0)
        bl = scale_l * L
        # Twin chocks on deck
        for sx in (-0.26, 0.26):
            box(s.deck, (xc + sx * bl, 0.0, z + 0.14 * S), (0.14 * S, 0.34 * bl, 0.28 * S), PAL['timber_dark'], PT['boards'], skip=('-z',))
        # Overturned double-ended boat hull
        bt = MB(41)
        Hb = Hull(bl, dict(br=0.35, fb=0.14, dr=0.05, bow=2.1, stern=0.2, sheer=(0.5, 0.5), rb=0.04, rs=0.04, bul=0.0, rpow=1.0))
        loft(bt, Hb, SCH(top='timber_pale', stripe='ochre_red', cap='timber_dark', bottom='pitch', boot='brand_default'),
             5, hole=lambda c, nm: nm == 'deck', paint=False)
        for i, p in enumerate(bt.v):
            q = Vector((p.x + xc, -p.y, -p.z + z + 0.22 * S + Hb.fb * 1.15))
            bt.v[i] = q; bt.vf[i] = q.copy()
        s.deck.extend(bt)

    def hoplite_shields(s, n_per_side, x0, x1, r, y_off=0.04, z_bias=-0.05):
        """Row of domed 6-sided gilded-bronze hoplite shields along the outrigger/rail (PT['metal'])."""
        H = s.H
        for k in range(n_per_side):
            t = 0.5 if n_per_side == 1 else k / (n_per_side - 1)
            x = x0 + (x1 - x0) * t
            u = H.u_at(x)
            w = H.w(u) + y_off
            zc = H.zt(u) + z_bias
            for sd in (-1, 1):
                rim = [s.hull.vert((x + r * math.cos(2 * math.pi * j / 6), sd * w, zc + r * math.sin(2 * math.pi * j / 6)))
                       for j in range(6)]
                boss = s.hull.vert((x, sd * (w + r * 0.38), zc))
                for j in range(6):
                    j2 = (j + 1) % 6
                    tri = (rim[j], rim[j2], boss) if sd < 0 else (rim[j2], rim[j], boss)
                    s.hull.face(tri, PAL['gilt'], PT['metal'], smooth=True, jitter=0.0)

    def diversity_modules(s, x0, x1, half_w, fam='usd'):
        """Zero-draw docked diversity modules (§4.2.5): 3 mutually exclusive ~60-tri deck assemblies
        tagged with decorative _PAINT codes 20, 21, 22 (selected per boat in hbFleetPose)."""
        L, S = s.L, s.S
        xc = 0.5 * (x0 + x1)
        dx = x1 - x0
        # Module 20 (_PAINT = 20.0): Arched linen/striped deck awning (~44 tris)
        s.arched_awning(x0, x1, half_w * 0.86, 0.58 * S + 0.34,
                        col=PAL['linen'], stripe=PAL['egypt_blue'] if fam == 'usd' else PAL['ochre_red'], paint=20.0)
        # Module 21 (_PAINT = 21.0): Braced 6-sided turned terracotta amphora rack (~64 tris)
        s.amphora_rack(x0 + 0.16 * dx, x1 - 0.16 * dx, -half_w * 0.42, half_w * 0.42,
                       2, 1, 0.34 * S + 0.22, paint=21.0, segs=6)
        # Module 22 (_PAINT = 22.0): Lashed tarped cargo bales (~32-48 tris)
        b_col1 = PAL['linen'] if fam == 'usd' else PAL['ochre_yel']
        b_col2 = PAL['ochre_yel'] if fam == 'usd' else PAL['terracotta']
        bales = [
            (xc - 0.18 * dx, -half_w * 0.30, 0.38 * dx, half_w * 0.68, 0.32 * S + 0.20, b_col1),
            (xc + 0.20 * dx, half_w * 0.26, 0.36 * dx, half_w * 0.64, 0.28 * S + 0.18, b_col2),
        ]
        if L >= 13.0:
            bales.append((xc, 0.0, 0.28 * dx, half_w * 0.50, 0.24 * S + 0.14, PAL['timber_pale']))
        s.cargo_bales(bales, paint=22.0)

    # -------------------------------------------------- galley oars
    def oar_banks(s, banks, n, x_from, x_to, reach, loom_w):
        H, L = s.H, s.L
        for b in range(banks):
            for k in range(n):
                t = (k + 0.25 + 0.5 * (b % 2)) / n
                x = x_from + (x_to - x_from) * t
                u = H.u_at(x)
                for sd in (-1, 1):
                    a = Vector((x, sd * (H.w(u) + 0.03 + 0.03 * L * (b == 2)), H.zt(u) - H.bh * 0.5 - 0.22 * b * s.S + 0.04 * L * (b == 2)))
                    ln = reach * (1.0 + 0.12 * b)
                    tip = Vector((x - 0.02 * L, sd * (H.w(u) + ln * 0.93), -0.02))
                    tip_f = a + Vector((-0.86 * ln, sd * 0.4 * ln, 0.14 * ln))
                    s.oar(a, tip, tip_f, loom_w)
            s.lod['oars'].append((x_from, x_to, b, reach))

    def oar(s, a, tip, tip_f, w):
        up = Vector((0, 0, 1))

        def strip(tp):
            d = tp - a; wd = d.cross(up).normalized()
            k = a + d * 0.70
            # Clean tapered shaft (w -> 0.85*w) flaring smoothly into a sculpted paddle blade (2.8*w)
            return [a - wd * w, a + wd * w, k + wd * (w * 0.82), k - wd * (w * 0.82),
                    tp + wd * (w * 2.8), tp - wd * (w * 2.8)]
        P0, P1 = strip(tip), strip(tip_f)
        ids = [s.oars.vert(p, q) for p, q in zip(P0, P1)]
        for f in ((ids[0], ids[1], ids[2], ids[3]), (ids[3], ids[2], ids[4], ids[5])):
            n = (s.oars.v[f[1]] - s.oars.v[f[0]]).cross(s.oars.v[f[2]] - s.oars.v[f[0]])
            s.oars.face(f if n.z > 0 else f[::-1], s.sch['spar'], 0, jitter=0.05)

    # -------------------------------------------------- flags: 4-segment fluttering burgee + 3-segment family pennant
    def flags(s, pennant_tops, ensign=True, segs=1):
        S = s.S
        for (top, plen) in pennant_tops:
            ph = max(0.26, 0.13 * plen)
            g0 = len(s.flag.f)
            if segs <= 1:
                a = s.flag.vert(top + Vector((0, 0, 0.02))); b = s.flag.vert(top + Vector((0, 0, -ph)))
                c = s.flag.vert(top + Vector((-plen, 0.0, -ph * 0.6)))
                s.flag.face((a, b, c), PAL['brand_default'], 0, 1.0, uv=[(0, 1), (0, 0), (1, 0.5)], jitter=0.0)
            else:
                # 4-segment tapered fluttering streamer
                cols = []
                for j in range(segs):
                    u = j / segs
                    h_u = ph * (1.0 - 0.82 * u)
                    yc = 0.055 * plen * math.sin(2.0 * math.pi * u)
                    zc = -ph * (0.5 + 0.14 * u)
                    vt = s.flag.vert(top + Vector((-plen * u, yc, zc + 0.5 * h_u)))
                    vb = s.flag.vert(top + Vector((-plen * u, yc, zc - 0.5 * h_u)))
                    cols.append((vt, vb, u))
                tip = s.flag.vert(top + Vector((-plen, 0.0, -ph * 0.64)))
                for j in range(segs - 1):
                    (t0, b0, u0), (t1, b1, u1) = cols[j], cols[j + 1]
                    s.flag.face((t0, b0, b1, t1), PAL['brand_default'], 0, 1.0,
                                uv=[(u0, 1), (u0, 0), (u1, 0), (u1, 1)], smooth=True, jitter=0.0)
                tL, bL, uL = cols[-1]
                s.flag.face((tL, bL, tip), PAL['brand_default'], 0, 1.0,
                            uv=[(uL, 1), (uL, 0), (1.0, 0.5)], smooth=True, jitter=0.0)
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
        P = lambda u, z: h0 + Vector((-fw * u, 0.05 * fw * math.sin(math.pi * u * 1.6), -fh * z - 0.12 * fh * u))
        g0 = len(s.flag.f)
        if segs <= 1 or s.L < 6.0:
            ht, hm, hb = s.flag.vert(P(0, 0)), s.flag.vert(P(0, 0.5)), s.flag.vert(P(0, 1))
            ft, nt, fb = s.flag.vert(P(1, 0.15)), s.flag.vert(P(0.72, 0.55)), s.flag.vert(P(1, 0.95))
            s.flag.face((ht, hm, nt, ft), c1, 0, uv=[(0, 1), (0, 0.5), (0.72, 0.5), (1, 1)], jitter=0.0)
            s.flag.face((hm, hb, fb, nt), c2, 0, uv=[(0, 0.5), (0, 0), (1, 0), (0.72, 0.5)], jitter=0.0)
        else:
            # 3-segment fluttering swallowtail family pennant
            us = (0.0, 0.36, 0.72)
            rows = [(s.flag.vert(P(u, 0.0 + 0.08 * u)), s.flag.vert(P(u, 0.5 + 0.04 * u)), s.flag.vert(P(u, 1.0 - 0.04 * u)), u)
                    for u in us]
            for j in range(len(rows) - 1):
                (t0, m0, b0, u0), (t1, m1, b1, u1) = rows[j], rows[j + 1]
                s.flag.face((t0, m0, m1, t1), c1, 0, uv=[(u0, 1), (u0, 0.5), (u1, 0.5), (u1, 1)], smooth=True, jitter=0.0)
                s.flag.face((m0, b0, b1, m1), c2, 0, uv=[(u0, 0.5), (u0, 0), (u1, 0), (u1, 0.5)], smooth=True, jitter=0.0)
            tL, mL, bL, uL = rows[-1]
            ft, fb = s.flag.vert(P(1.0, 0.12)), s.flag.vert(P(1.0, 0.92))
            s.flag.face((tL, mL, ft), c1, 0, uv=[(uL, 1), (uL, 0.5), (1.0, 1.0)], smooth=True, jitter=0.0)
            s.flag.face((mL, bL, fb), c2, 0, uv=[(uL, 0.5), (uL, 0), (1.0, 0.0)], smooth=True, jitter=0.0)
        s.flag.backface(g0)

    # -------------------------------------------------- 06-F6 stern lantern
    LANTERN_TRIS = 20

    def stern_lantern(s, gooseneck=False):
        """Bronze lantern on a stern staff (or curved bronze gooseneck davit, PT['metal']), its glass a separate
        hb_emissive node (stern_lantern_glass); empty 'stern_lantern' = the glass centre."""
        H, L, S = s.H, s.L, s.S
        st = H.stern()
        x = st.x + 0.05 * L
        z0 = H.deck_at(x, 0.0)
        hw = 0.09 + 0.006 * L
        hh = hw * 1.45
        top = Vector((x - 0.006 * L, 0, z0 + 0.5 + 0.42 * S))
        c = top + Vector((0, 0, hh))
        if gooseneck:
            # Curved bronze gooseneck davit rising from deck and arching aft to hang the lantern from above
            p0 = Vector((x + 0.018 * L, 0, z0 - 0.04))
            p1 = Vector((x + 0.015 * L, 0, z0 + 0.35 + 0.32 * S))
            p2 = Vector((x + 0.005 * L, 0, c.z + hh + hw * 1.45))
            p3 = Vector((c.x, 0, c.z + hh + hw * 1.25))
            chain(s.deck, [p0, p1, p2, p3], max(0.026, 0.0038 * L), max(0.018, 0.0025 * L),
                  PAL['bronze'], segs=3, pat=PT['metal'], jitter=0.0)
        else:
            rod(s.deck, Vector((x, 0, z0 - 0.05)), top, max(0.025, 0.0035 * L), s.sch['spar'], 3, smooth=False)
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
    n = n_sec or VARIANT_SECTIONS.get(vid, SECTIONS.get(cls, 14))
    is_kit = (rig != 'syracusia')
    if is_kit:
        loft(R.hull, H, sch, n, band=rig not in ('fisher', 'sprit'),
             wales=True, deck_strips=4, simple_bottom=True, spine=(cls != 'skiff'),
             compact_cap=(cls in ('skiff', 'boat', 'small', 'medium')))
    else:
        loft(R.hull, H, sch, n, band=True)
    st, bw = H.stern(), H.bow()
    dz = H.deck
    pennants = []
    B = H.B

    def square_main(mxk, hk, spk, foot, artemon=False, siparum=False):
        mx = H.x0 + mxk * L
        _, top = R.mast_at(mx, hk * L, calcet=True)
        zy = top.z - 0.07 * L
        zb = dz(mx) + foot * L
        span = spk * L
        R.course(mx, zy, span, zb, span * 1.04, top=top, sculpted=True)
        R.shrouds(top, mx, 2 if L >= 13 else 1, 0.86)
        line(R.rigging, top - Vector((0, 0, 0.1)), st + Vector((0.06 * L, 0, 0.1 * S)), R.rope)
        if siparum:
            R.siparum(mx, zy, span * 0.62, top, nu=4, nv=3)
        if artemon:
            R.artemon(nu=4, nv=3, sculpted=True)
        else:
            line(R.rigging, top - Vector((0, 0, 0.1)), bw + Vector((-0.02 * L, 0, 0)), R.rope)
        pennants.append((top, 1.15 + 0.12 * L))
        return mx, top

    # -------------------------------------------------- USD family progression
    if rig == 'fisher':
        # usd_fisher_skiff (5 m): open fishing thwarts, coiled green nets, wicker basket, stern curl
        mx, top = square_main(0.12, 0.78, 0.70, 0.12)
        R.stem_post(sch['spar'], 0.055)
        R.stern_curl(sch['spar'], 0.038 * L, 180)
        R.steering_oars(0.85, sculpted=True)
        for u_t in (-0.36, 0.26):
            xt = H.x(u_t, H.fb)
            wt = H.w(u_t) * 0.86
            zt = dz(xt) + H.bh * 0.45
            box2(R.deck, xt - 0.11, -wt, zt - 0.04, xt + 0.11, wt, zt + 0.03, PAL['timber'], PT['planks_y'], skip=('-z', '-y', '+y'))
        box(R.deck, (H.x0 - 0.14 * L, -B * 0.06, dz(H.x0) + 0.11), (0.18 * L, B * 0.44, 0.18), PAL['door_green'], skip=('-z',))
        rod(R.deck, (H.x0 - 0.28 * L, B * 0.16, dz(H.x0)), (H.x0 - 0.28 * L, B * 0.16, dz(H.x0) + 0.24),
            0.14, PAL['ochre_yel'], 4, r2=0.17, cap=False)
        R.mooring_bitts(coils=0)

    elif rig == 'coaster':
        mx, top = square_main(0.06, 0.82, 0.72, 0.10)
        R.stem_post(sch['spar'], 0.065)
        R.cheniskos(sch['spar'], 0.052 * L)
        R.eyes(0.80, 0.052 * L)
        R.steering_oars(1.0, sculpted=True)
        R.mooring_bitts(coils=1)
        if cls == 'boat':
            # usd_coaster_boat (7.5 m): low sloped aft cuddy + midships 6-sided amphora rack + tarped bale
            R.gable_house(st.x + 0.11 * L, st.x + 0.26 * L, 0.58, 0.32 * S + 0.22, roof=PAL['terracotta'])
            R.amphora_rack(H.x0 + 0.15 * L, H.x0 + 0.24 * L, -B * 0.22, B * 0.22, 1, 3, 0.30 * S + 0.20, segs=6)
            R.cargo_bales([(H.x0 - 0.10 * L, B * 0.14, 0.11 * L, 0.22 * B, 0.26 * S + 0.12, PAL['linen'])])
        else:
            # usd_coaster_small (10 m): arched linen awning aft + cargo hatch + knees + diversity modules 20/21/22
            R.bulwark_knees(4)
            R.arched_awning(st.x + 0.10 * L, st.x + 0.24 * L, B * 0.28, 0.56 * S + 0.26, col=PAL['linen'], stripe=PAL['ochre_red'])
            R.hatch(H.x0 + 0.17 * L, 0.10 * L, B * 0.42, 0.22 * S + 0.08, PAL['timber'])
            R.diversity_modules(H.x0 - 0.22 * L, H.x0 - 0.04 * L, B * 0.34, fam='usd')

    elif rig in ('corbita', 'merchant', 'grain'):
        big = rig != 'corbita'
        mx, top = square_main(0.03 if big else 0.02, 0.84 if big else 0.86, 0.84 if big else 0.78, 0.17,
                              artemon=True, siparum=big)
        R.cheniskos(PAL['gilt'] if rig == 'grain' else sch['spar'],
                    R=(0.072 if rig == 'grain' else 0.076) * L, gilt_collar=(rig == 'merchant'))
        R.eyes(0.82, (0.042 if rig == 'grain' else 0.050) * L)
        R.steering_oars(1.0, sculpted=True)
        R.mooring_bitts(coils=2)
        R.fluked_anchor(side=1)

        if rig == 'corbita':
            # usd_corbita_medium (13 m): tiled stern cabin + fore hatch + knees + diversity modules 20/21/22
            R.bulwark_knees(5)
            R.stem_post(sch['spar'], 0.055)
            R.gable_house(st.x + 0.09 * L, st.x + 0.24 * L, 0.66, 0.56 * S + 0.18, roof=PAL['terracotta'])
            R.hatch(H.x0 + 0.14 * L, 0.09 * L, B * 0.42, 0.24 * S, PAL['timber'])
            R.diversity_modules(H.x0 - 0.20 * L, H.x0 - 0.04 * L, B * 0.34, fam='usd')
        elif rig == 'merchant':
            # usd_merchant_large (18 m): colonnaded gable house + double hatches + twin amphora racks + bales + twin anchors
            R.bulwark_knees(6)
            R.fluked_anchor(side=-1)
            R.stem_post(PAL['gilt'], 0.055, pat=PT['metal'])
            R.gable_house(st.x + 0.09 * L, st.x + 0.27 * L, 0.70, 0.78 * S, roof=PAL['terracotta'], porch=True)
            R.hatch(H.x0 - 0.12 * L, 0.08 * L, B * 0.44, 0.30 * S, PAL['timber'])
            R.hatch(H.x0 + 0.15 * L, 0.08 * L, B * 0.42, 0.30 * S, PAL['timber'])
            R.amphora_rack(H.x0 + 0.21 * L, H.x0 + 0.31 * L, -B * 0.26, -B * 0.06, 2, 2, 0.36 * S, segs=6)
            R.amphora_rack(H.x0 + 0.21 * L, H.x0 + 0.31 * L, B * 0.06, B * 0.26, 2, 2, 0.36 * S, segs=6)
            R.cargo_bales([
                (H.x0 - 0.02 * L, B * 0.26, 0.07 * L, 0.22 * B, 0.28 * S, PAL['linen']),
                (H.x0 - 0.02 * L, -B * 0.26, 0.07 * L, 0.22 * B, 0.26 * S, PAL['ochre_yel']),
                (H.x0 + 0.09 * L, B * 0.26, 0.06 * L, 0.20 * B, 0.24 * S, PAL['ochre_yel']),
                (H.x0 + 0.09 * L, -B * 0.26, 0.06 * L, 0.20 * B, 0.24 * S, PAL['linen']),
            ])
            # Foredeck timber windlass capstan
            xc_w = H.x0 + 0.34 * L
            rod(R.deck, (xc_w, 0, dz(xc_w)), (xc_w, 0, dz(xc_w) + 0.48 * S), 0.14 * S, PAL['timber_dark'], 6, cap=True)
        else:
            # usd_grain_flagship (26.0 x 7.40 m): Isis-class twin-deck flagship with colonnaded gallery + boat-on-chocks
            R.bulwark_knees(7)
            R.fluked_anchor(side=-1)
            R.stem_post(PAL['gilt'], 0.055, pat=PT['metal'])
            x_c0, x_c1 = st.x + 0.08 * L, st.x + 0.26 * L
            zc = dz(0.5 * (x_c0 + x_c1))
            wc = min(H.half(x_c0), H.half(x_c1)) * 1.56
            box2(R.deck, x_c0, -wc / 2, zc - 0.1, x_c1, wc / 2, zc + 0.95 * S, PAL['whitewash'], PT['render'], skip=('-z',))
            # Upper pillared gallery deck with timber entablature & balustrade
            for k in range(6):
                xp = x_c0 + 0.014 * L + k * (x_c1 - x_c0 - 0.028 * L) / 5
                for sd in (-1, 1):
                    rod(R.deck, (xp, sd * wc * 0.46, zc + 0.95 * S), (xp, sd * wc * 0.46, zc + 1.58 * S),
                        0.055 * S, PAL['whitewash'], 5)
            box2(R.deck, x_c0 - 0.04 * S, -wc / 2 - 0.04 * S, zc + 1.54 * S, x_c1 + 0.04 * S, wc / 2 + 0.04 * S,
                 zc + 1.66 * S, PAL['gilt'], PT['metal'], jitter=0.0)
            ov = 0.09 * S
            rh = 0.34 * S
            z_e = zc + 1.66 * S
            va = R.deck.vert((x_c0 - ov, -wc / 2 - ov, z_e)); vb = R.deck.vert((x_c1 + ov, -wc / 2 - ov, z_e))
            vc = R.deck.vert((x_c1 + ov, wc / 2 + ov, z_e)); vd = R.deck.vert((x_c0 - ov, wc / 2 + ov, z_e))
            vr0 = R.deck.vert((x_c0 - ov, 0.0, z_e + rh)); vr1 = R.deck.vert((x_c1 + ov, 0.0, z_e + rh))
            R.deck.face((va, vb, vr1, vr0), PAL['terracotta'], PT['tiles'], jitter=0.02, paint=7.0)
            R.deck.face((vc, vd, vr0, vr1), PAL['terracotta'], PT['tiles'], jitter=0.02, paint=7.0)
            R.deck.face((vd, va, vr0), PAL['whitewash'], 0, jitter=0.01)
            R.deck.face((vb, vc, vr1), PAL['whitewash'], 0, jitter=0.01)
            for sd in (-1, 1):
                box2(R.deck, x_c0 + 0.01 * L, sd * wc * 0.44 - 0.04 * S, zc + 0.95 * S,
                     x_c1 - 0.01 * L, sd * wc * 0.44 + 0.04 * S, zc + 1.18 * S, PAL['timber_dark'], PT['boards'], skip=('-z',))
            # Midships colonnaded deckhouse + foredeck linen shade awning
            R.gable_house(H.x0 + 0.07 * L, H.x0 + 0.16 * L, 0.44, 0.68 * S, col=PAL['whitewash'], roof=PAL['terracotta'], porch=True)
            R.arched_awning(H.x0 + 0.25 * L, H.x0 + 0.35 * L, B * 0.26, 0.62 * S, col=PAL['linen'], stripe=PAL['egypt_blue'])
            # Overturned ship's boat (*lembos*) lashed on timber chocks aft of mainmast
            R.deck_boat(H.x0 - 0.13 * L, scale_l=0.16)
            # Double cargo hatches + twin amphora racks + grain bales + fore/aft windlass capstans
            R.hatch(H.x0 + 0.18 * L, 0.065 * L, B * 0.44, 0.34 * S, PAL['timber'])
            R.hatch(H.x0 - 0.03 * L, 0.055 * L, B * 0.38, 0.28 * S, PAL['timber'])
            R.amphora_rack(H.x0 + 0.25 * L, H.x0 + 0.34 * L, -B * 0.24, -B * 0.05, 2, 2, 0.38 * S, segs=6)
            R.amphora_rack(H.x0 + 0.25 * L, H.x0 + 0.34 * L, B * 0.05, B * 0.24, 2, 2, 0.38 * S, segs=6)
            R.amphora_rack(H.x0 - 0.08 * L, H.x0 - 0.01 * L, -B * 0.34, -B * 0.22, 2, 1, 0.34 * S, segs=6)
            R.amphora_rack(H.x0 - 0.08 * L, H.x0 - 0.01 * L, B * 0.22, B * 0.34, 2, 1, 0.34 * S, segs=6)
            R.cargo_bales([
                (H.x0 + 0.11 * L, B * 0.28, 0.065 * L, 0.18 * B, 0.26 * S, PAL['ochre_yel']),
                (H.x0 + 0.11 * L, -B * 0.28, 0.065 * L, 0.18 * B, 0.26 * S, PAL['linen']),
                (H.x0 + 0.19 * L, B * 0.28, 0.060 * L, 0.16 * B, 0.24 * S, PAL['linen']),
                (H.x0 + 0.19 * L, -B * 0.28, 0.060 * L, 0.16 * B, 0.24 * S, PAL['ochre_yel']),
            ])
            for xc_w in (H.x0 + 0.37 * L, st.x + 0.28 * L):
                rod(R.deck, (xc_w, 0, dz(xc_w)), (xc_w, 0, dz(xc_w) + 0.50 * S), 0.14 * S, PAL['timber_dark'], 5, cap=True)

    # -------------------------------------------------- EUR family progression (distinct wine-merchant decks!)
    elif rig == 'greek':
        is_large = (cls == 'large')
        mx, top = square_main(0.02, 0.84, 0.78 if is_large else 0.74, 0.11 if is_large else 0.10,
                              artemon=is_large, siparum=is_large)
        R.eyes(0.80, 0.072 * L)
        R.greek_stem(PAL['ochre_red'], 0.078)
        R.stern_curl(sch['spar'], 0.062 * L, 220)
        R.steering_oars(1.0, sculpted=True)
        R.mooring_bitts(coils=2 if L >= 13 else 1)

        if cls == 'boat':
            # eur_greek_boat (7.5 m): open coastal wine-carrier with central 3-amphora rack & aft helm locker
            R.amphora_rack(H.x0 + 0.15 * L, H.x0 + 0.24 * L, -B * 0.22, B * 0.22, 1, 3, 0.30 * S + 0.18, segs=6)
            R.hatch(st.x + 0.14 * L, 0.11 * L, B * 0.44, 0.24 * S + 0.12, PAL['ochre_red'])
            R.cargo_bales([(H.x0 - 0.14 * L, 0.0, 0.12 * L, B * 0.38, 0.24 * S + 0.12, PAL['linen'])])
        elif cls == 'small':
            # eur_greek_small (10 m): ochre-red aft cabin + fore wine rack + knees + diversity modules 20/21/22
            R.bulwark_knees(3)
            R.gable_house(st.x + 0.10 * L, st.x + 0.22 * L, 0.56, 0.36 * S + 0.20, col=PAL['whitewash'], roof=PAL['ochre_red'])
            R.amphora_rack(H.x0 + 0.16 * L, H.x0 + 0.23 * L, -B * 0.18, B * 0.18, 1, 2, 0.32 * S + 0.18, segs=6)
            R.diversity_modules(H.x0 - 0.21 * L, H.x0 - 0.05 * L, B * 0.33, fam='eur')
        elif cls == 'medium':
            # eur_greek_medium (13 m): pitched Hellenic holkas cabin + amphora hold + anchor + diversity 20/21/22
            R.bulwark_knees(5)
            R.fluked_anchor(side=-1)
            R.gable_house(st.x + 0.09 * L, st.x + 0.23 * L, 0.62, 0.48 * S + 0.20, col=PAL['whitewash'], roof=PAL['ochre_red'])
            R.amphora_rack(H.x0 + 0.13 * L, H.x0 + 0.25 * L, -B * 0.22, B * 0.22, 2, 2, 0.34 * S + 0.14, segs=6)
            R.diversity_modules(H.x0 - 0.20 * L, H.x0 - 0.04 * L, B * 0.34, fam='eur')
        else:
            # eur_greek_large (18 m): grand Aegean wine-merchantman with colonnaded gable cabin + twin amphora wells + bales
            R.bulwark_knees(6)
            R.fluked_anchor(side=1)
            R.gable_house(st.x + 0.08 * L, st.x + 0.25 * L, 0.68, 0.74 * S, col=PAL['whitewash'], roof=PAL['ochre_red'], porch=True)
            R.hatch(H.x0 - 0.08 * L, 0.09 * L, B * 0.40, 0.26 * S, PAL['timber'])
            R.amphora_rack(H.x0 + 0.11 * L, H.x0 + 0.24 * L, -B * 0.32, -B * 0.08, 3, 2, 0.36 * S, segs=6)
            R.amphora_rack(H.x0 + 0.11 * L, H.x0 + 0.24 * L, B * 0.08, B * 0.32, 3, 2, 0.36 * S, segs=6)
            R.cargo_bales([
                (H.x0 - 0.16 * L, -B * 0.20, 0.08 * L, 0.24 * B, 0.28 * S, PAL['linen']),
                (H.x0 - 0.16 * L, B * 0.20, 0.08 * L, 0.24 * B, 0.28 * S, PAL['ochre_yel']),
            ])

    # -------------------------------------------------- GOLD war galleys (bireme & trireme)
    elif rig == 'galley':
        tri = (cls == 'large')
        mx, top = square_main(0.06, 0.50, 0.44, 0.07)
        xf = H.x(1.0, 0.0)
        rod(R.hull, (xf - 0.03 * L, 0, 0.02), (xf + 0.072 * L, 0, 0.02), 0.020 * L, PAL['bronze'], 5 if tri else 4,
            r2=0.011 * L, cap=True, pat=PT['metal'], jitter=0.0)
        for dz_b, len_k in ((-0.014 * L, 0.92), (0.0, 1.08), (0.014 * L, 0.95)):
            box(R.hull, (xf + 0.056 * L * len_k, 0, 0.02 + dz_b),
                (0.036 * L * len_k, 0.044 * L, 0.006 * L), PAL['bronze'], PT['metal'], skip=('-x',), jitter=0.0)
        z_pro = H.fb * 0.78
        rod(R.hull, (xf - 0.02 * L, 0, z_pro), (xf + 0.040 * L, 0, z_pro + 0.012 * L),
            0.012 * L, PAL['bronze'], 4, r2=0.007 * L, cap=True, pat=PT['metal'], jitter=0.0)
        box(R.hull, (xf + 0.038 * L, 0, z_pro + 0.014 * L), (0.016 * L, 0.016 * L, 0.018 * L),
            PAL['bronze'], PT['metal'], skip=('-x',), jitter=0.0)
        R.lod['boxes'].append((Vector((xf + 0.03 * L, 0, 0.02)), (0.11 * L, 0.035 * L, 0.035 * L), PAL['bronze']))

        # 5-plume fanned gilded-bronze *aphlaston* over the stern + transverse tie-bar
        stp = st + Vector((0.01 * L, 0, -0.01 * L))
        for j in range(5):
            pts = arc(stp, 0.034 * L * (1.0 + 0.14 * j), 212, y=(j - 2.0) * 0.0065 * L, n=5)
            chain(R.hull, pts, 0.0055 * L + 0.012, 0.0028 * L + 0.008, PAL['gilt'], 4 if tri else 3, pat=PT['metal'], jitter=0.0)
        p_tie = arc(stp, 0.042 * L, 150, n=3)[-1]
        rod(R.hull, p_tie + Vector((0, -0.016 * L, 0)), p_tie + Vector((0, 0.016 * L, 0)),
            0.005 * L, PAL['gilt'], 4 if tri else 3, pat=PT['metal'], jitter=0.0)
        R.lod['posts'].append((arc(stp, 0.046 * L, 210, n=5), 0.01 * L + 0.03, PAL['gilt']))

        R.stem_post(PAL['gilt'], 0.038, pat=PT['metal'])
        R.eyes(0.86, 0.048 * L)
        R.steering_oars(0.92, sculpted=True)
        R.mooring_bitts(coils=1)
        R.fluked_anchor(side=1)

        # Parexeiresia outrigger box + row of domed gilded-bronze hoplite shields (8/side bireme, 12/side trireme)
        x_out0, x_out1 = H.x0 - 0.30 * L, H.x0 + 0.28 * L
        for sd in (-1, 1):
            wy = H.half(H.x0) + (0.032 if tri else 0.018) * L
            zz = H.zt(0) + (0.022 if tri else 0.008) * L
            box2(R.hull, x_out0, min(sd * (wy - 0.035 * L), sd * wy), zz - 0.025 * L,
                 x_out1, max(sd * (wy - 0.035 * L), sd * wy), zz, PAL['pitch'], PT['boards'])
        R.hoplite_shields(12 if tri else 8, x_out0 + 0.03 * L, x_out1 - 0.03 * L,
                          r=0.014 * L + 0.04, y_off=(0.034 if tri else 0.020) * L,
                          z_bias=(0.022 if tri else 0.012) * L)

        # Raised central marine catwalk (*katastroma*) on stanchions down the centerline
        x_cw0, x_cw1 = H.x0 - 0.28 * L, H.x0 + 0.28 * L
        z_cw = dz(H.x0) + 0.50 * S
        box2(R.deck, x_cw0, -B * 0.22, z_cw, x_cw1, B * 0.22, z_cw + 0.07 * S,
             PAL['timber_pale'], PT['planks_y'], skip=())
        for k in range(6 if tri else 4):
            xs = x_cw0 + (x_cw1 - x_cw0) * k / (5 if tri else 3)
            for sd in (-1, 1):
                rod(R.deck, (xs, sd * B * 0.18, dz(xs) - 0.02), (xs, sd * B * 0.18, z_cw),
                    0.032 * S, PAL['timber_dark'], 3, smooth=False)
        if tri:
            # Fore ramming bulkhead + trierarch aft bronze rail + twin anchor on trireme
            R.fluked_anchor(side=-1)
            xf_b = H.x0 + 0.30 * L
            box2(R.deck, xf_b, -H.half(xf_b) * 0.72, dz(xf_b) - 0.04, xf_b + 0.03 * L, H.half(xf_b) * 0.72,
                 dz(xf_b) + 0.58 * S, PAL['pitch'], PT['boards'], skip=('-z',))
            box2(R.deck, xf_b - 0.01 * L, -H.half(xf_b) * 0.75, dz(xf_b) + 0.56 * S, xf_b + 0.04 * L, H.half(xf_b) * 0.75,
                 dz(xf_b) + 0.66 * S, PAL['gilt'], PT['metal'], jitter=0.0)
            R.bulwark_knees(5)

        R.oar_banks(3 if tri else 2, 11 if tri else 9, H.x0 - 0.30 * L, H.x0 + 0.27 * L, 0.20 * L, 0.0045 * L + 0.02)
        R.arched_awning(st.x + 0.09 * L, st.x + 0.21 * L, B * 0.32, 0.85 * S, col=PAL['linen'], stripe=PAL['tyrian'])

    # -------------------------------------------------- FIAT Phoenician hippos progression
    elif rig == 'hippos':
        mx, top = square_main(0.02, 0.80, 0.72, 0.10)
        bw2 = bw + Vector((-0.01 * L, 0, -0.01 * L))
        hk = 1.0 + 2.8 / L
        k = 0.01 * L * hk
        neck = [bw2, bw2 + Vector((2.2 * k, 0, 6.0 * k)), bw2 + Vector((5.0 * k, 0, 11.2 * k)),
                bw2 + Vector((6.2 * k, 0, 15.8 * k)), bw2 + Vector((5.4 * k, 0, 19.2 * k))]
        sg = 5 if L >= 12 else 4
        R.post(neck, 3.4 * k + 0.028, 2.3 * k + 0.024, sch['spar'], sg)
        poll = neck[-1]
        d = Vector((math.cos(math.radians(-38)), 0, math.sin(math.radians(-38))))
        skull = poll + d * 4.6 * k
        muz = poll + d * 11.2 * k
        chain(R.hull, [poll - d * 0.8 * k, skull, muz], 2.9 * k + 0.02, 1.65 * k + 0.015, sch['spar'], sg)
        box(R.hull, muz + d * 0.4 * k, (2.4 * k, 3.3 * k, 2.2 * k), sch['spar'],
            axes=(d, Vector((0, 1, 0)), d.cross(Vector((0, 1, 0)))), skip=('-x',))
        dn = Vector((d.z, 0, -d.x))
        rod(R.hull, skull + dn * 1.6 * k, muz + dn * 1.9 * k - d * 1.2 * k, 1.5 * k, sch['spar'], 3, r2=0.9 * k, cap=True)
        for sd in (-1, 1):
            e0 = poll + Vector((0, sd * 1.4 * k, 0)) - d * 0.5 * k
            rod(R.hull, e0, e0 + Vector((-1.6 * k, sd * 0.6 * k, 4.3 * k)), 0.9 * k, sch['spar'], 3, r2=0.16 * k)
            ec = skull + Vector((0, sd * 2.95 * k, 0.6 * k))
            ids = [R.hull.vert(ec + Vector((px * 0.85 * k, 0, pz * 0.55 * k))) for px, pz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            R.hull.face(ids if sd < 0 else ids[::-1], PAL['eye_black'], 0, jitter=0.0)
        for j in range(3 if L >= 10 else 2):
            c = neck[1].lerp(neck[3], 0.14 + (0.36 if L >= 10 else 0.65) * j)
            box(R.hull, c + Vector((-2.6 * k, 0, 0.6 * k)), (1.9 * k, 1.25 * k, 3.0 * k), PAL['ochre_red'], skip=('-z', '+x'))
        rod(R.hull, neck[1] + Vector((0, 0, -0.6 * k)), neck[1] + Vector((0, 0, 1.1 * k)),
            3.9 * k + 0.032, PAL['bronze'], sg, pat=PT['metal'], jitter=0.0)
        R.lod['posts'].append(([poll, skull, muz], 2.6 * k + 0.03, sch['spar']))

        R.stern_curl(sch['spar'], 0.048 * L, 165)
        stt = R.lod['posts'][-1][0][-1]
        for sd in (-1, 1):
            mid_f = stt + Vector((0.008 * L, sd * 0.022 * L, 0.016 * L))
            tip_f = stt + Vector((0.022 * L, sd * 0.042 * L, 0.040 * L))
            rod(R.hull, stt, mid_f, 0.009 * L + 0.018, sch['spar'], 3, r2=0.006 * L + 0.012)
            rod(R.hull, mid_f, tip_f, 0.006 * L + 0.012, PAL['ochre_yel'], 3, r2=0.014, cap=True)
        R.steering_oars(1.0, sculpted=True)
        R.mooring_bitts(coils=0 if cls == 'boat' else 1)

        if cls == 'boat':
            # fiat_hippos_boat (7.5 m): Tyrian aft awning + bound cedar-log bundle + Tyrian bale
            R.arched_awning(st.x + 0.10 * L, st.x + 0.25 * L, B * 0.28, 0.50 * S + 0.24, col=PAL['linen'], stripe=PAL['tyrian'])
            R.cedar_bundles(H.x0 + 0.16 * L, -B * 0.10, 0.22 * L, 0.045 * B)
            R.cargo_bales([(H.x0 - 0.08 * L, B * 0.16, 0.11 * L, 0.20 * B, 0.26 * S + 0.12, PAL['tyrian'])])
        elif cls == 'small':
            # fiat_hippos_small (10 m): Tyrian aft cabin + twin bound cedar-log bundles + Tyrian bale + knees
            R.bulwark_knees(3)
            R.gable_house(st.x + 0.10 * L, st.x + 0.23 * L, 0.56, 0.34 * S + 0.22, col=PAL['whitewash'], roof=PAL['tyrian'])
            R.cedar_bundles(H.x0 + 0.16 * L, -B * 0.16, 0.24 * L, 0.042 * B)
            R.cedar_bundles(H.x0 + 0.16 * L, B * 0.16, 0.24 * L, 0.042 * B)
            R.cargo_bales([(H.x0 - 0.13 * L, 0.0, 0.11 * L, B * 0.36, 0.28 * S + 0.14, PAL['tyrian'])])
        else:
            # fiat_hippos_medium (13 m): Tyrian stern cabin + midships Tyrian cargo awning + cedar logs + amphora rack + anchor
            R.bulwark_knees(5)
            R.fluked_anchor(side=1)
            R.gable_house(st.x + 0.09 * L, st.x + 0.23 * L, 0.62, 0.48 * S + 0.20, col=PAL['whitewash'], roof=PAL['tyrian'])
            R.arched_awning(H.x0 - 0.18 * L, H.x0 - 0.05 * L, B * 0.30, 0.58 * S + 0.24, col=PAL['linen'], stripe=PAL['tyrian'])
            R.cedar_bundles(H.x0 + 0.16 * L, -B * 0.18, 0.24 * L, 0.044 * B)
            R.amphora_rack(H.x0 + 0.12 * L, H.x0 + 0.23 * L, B * 0.06, B * 0.26, 2, 2, 0.32 * S + 0.14, segs=6)
            R.cargo_bales([(H.x0 - 0.11 * L, 0.0, 0.09 * L, B * 0.34, 0.26 * S + 0.12, PAL['tyrian'])])

    # -------------------------------------------------- OTHER double-ended crescent sprit workboats
    elif rig == 'sprit':
        mx = H.x0 + 0.20 * L
        mh = 0.95 * L
        _, top = R.mast_at(mx, mh, calcet=True)
        blen = min(0.62 * L, mx - st.x - 0.06 * L)
        zb = dz(mx) + 0.30 + 0.05 * L
        R.fore_aft('boom', mx, zb, blen, dz(mx) + mh * 0.62, blen * 0.72, 44, emblem=True, belly=0.095, nu=5, nv=4)
        g = R.groups[-1]
        g['gaff'] = MB()
        sn = Vector((mx - R.r_mast, 0, zb + 0.18 * mh))
        rf = max(0.09, 0.042 * blen)
        fz = zb + R.r_mast * 0.62 + rf * 2.2
        rod(g['gaff'], sn, g['Pk'], R.r_mast * 0.55, sch['spar'], 5,
            pf=Vector((mx - 0.05 * L, 0, fz)), qf=Vector((mx - 0.05 * L - (g['Pk'] - sn).length * 0.95, 0, fz)),
            r2=R.r_mast * 0.4)
        R.lod['gaff'] = (mx, zb, blen, dz(mx) + mh * 0.62, blen * 0.72, 44, sn)
        R.shrouds(top, mx, 1, 0.84)
        line(R.rigging, top - Vector((0, 0, 0.1)), bw + Vector((-0.02 * L, 0, 0)), R.rope)
        line(R.rigging, top - Vector((0, 0, 0.1)), st + Vector((0.04 * L, 0, 0)), R.rope)
        R.stem_post(sch['spar'], 0.075)
        R.stern_curl(sch['spar'], 0.042 * L, 165)
        R.steering_oars(0.85, sculpted=True)
        R.mooring_bitts(coils=0 if cls == 'skiff' else 1)

        n_ribs = 2 if cls == 'skiff' else (4 if cls == 'boat' else 5)
        for k in range(n_ribs):
            u_r = -0.45 + 0.82 * k / max(1, n_ribs - 1)
            xr = H.x(u_r, H.fb)
            wr = H.w(u_r) * 0.88
            zr0 = dz(xr)
            zr1 = H.zt(u_r) - 0.02
            for sd in (-1, 1):
                rod(R.deck, (xr, sd * wr * 0.72, zr0), (xr, sd * wr, zr1), max(0.024, 0.004 * L),
                    PAL['timber_dark'], 3, smooth=False)
        for u_t in ((-0.36, 0.04) if cls == 'skiff' else (-0.42, -0.08)):
            xt = H.x(u_t, H.fb); wt = H.w(u_t) * 0.86; zt = dz(xt) + H.bh * 0.42
            box2(R.deck, xt - 0.12, -wt, zt - 0.04, xt + 0.12, wt, zt + 0.03, PAL['timber'], PT['planks_y'], skip=('-z', '-y', '+y'))

        if cls == 'skiff':
            box(R.deck, (H.x0 - 0.12 * L, B * 0.08, dz(H.x0) + 0.10), (0.18 * L, B * 0.42, 0.16), PAL['door_green'], skip=('-z',))
            rod(R.deck, (H.x0 + 0.04 * L, -B * 0.16, dz(H.x0)), (H.x0 + 0.04 * L, -B * 0.16, dz(H.x0) + 0.22),
                0.13, PAL['ochre_yel'], 4, r2=0.16, cap=False)
        elif cls == 'boat':
            R.gable_house(mx + 0.05 * L, mx + 0.20 * L, 0.56, 0.26 * S + 0.16, col=PAL['timber_pale'], roof=PAL['timber_dark'])
            box(R.deck, (H.x0 - 0.18 * L, -B * 0.10, dz(H.x0) + 0.14), (0.16 * L, B * 0.44, 0.22), PAL['door_green'], skip=('-z',))
            R.cargo_bales([(H.x0 - 0.04 * L, B * 0.14, 0.12 * L, B * 0.24, 0.24 * S + 0.12, PAL['ochre_yel'])])
        else:
            R.bulwark_knees(4)
            R.gable_house(st.x + 0.10 * L, st.x + 0.24 * L, 0.58, 0.34 * S + 0.18, col=PAL['timber_pale'], roof=PAL['ochre_red'])
            box(R.deck, (H.x0 - 0.06 * L, -B * 0.16, dz(H.x0) + 0.16), (0.16 * L, B * 0.34, 0.24), PAL['door_green'], skip=('-z',))
            R.amphora_rack(H.x0 + 0.04 * L, H.x0 + 0.13 * L, B * 0.04, B * 0.24, 2, 2, 0.28 * S + 0.16, segs=6)
            R.cargo_bales([(H.x0 - 0.12 * L, B * 0.14, 0.10 * L, B * 0.24, 0.26 * S + 0.12, PAL['linen'])])
        pennants.append((top, 1.15 + 0.12 * L))

    # -------------------------------------------------- Legacy Titan study (kept intact for lineup_ancient)
    elif rig == 'syracusia':
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
        for tx, tw in ((H.x0 + 0.37 * L, 0.06 * L), (H.x0 - 0.36 * L, 0.07 * L)):
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
        for k in range(14):
            u = -0.6 + 1.25 * k / 13
            x = H.x(u, H.zt(u)); w = H.w(u) + 0.04
            for sd in (-1, 1):
                ids = [R.hull.vert((x + 0.4 * math.cos(2 * math.pi * j / 6), sd * w, H.zt(u) - 0.45 + 0.4 * math.sin(2 * math.pi * j / 6))) for j in range(6)]
                R.hull.face(ids if sd < 0 else ids[::-1], PAL['gilt'], 0, jitter=0.0)
        R.amphorae([H.x0 + 0.13 * L, H.x0 + 0.17 * L], [-B * 0.2, 0, B * 0.2], 0.35 * S)

    R.flags(pennants, True, segs=4 if is_kit else 1)
    R.stern_lantern(gooseneck=is_kit)
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
    n_sec = VARIANT_SECTIONS.get(vid, SECTIONS.get(cls, 14))
    budget = (budget or BUDGET[cls]) + AncientRig.LANTERN_TRIS
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
    # Cap LOD posts/boxes cleanly so every LOD stays strictly <= 150 tris
    for (pts, r0, col) in R.lod['posts'][:2]:
        p3 = [pts[0], pts[len(pts) // 2], pts[-1]]
        chain(mb, p3, max(0.08, r0), max(0.06, r0 * 0.6), col, 3)
    for (c, size, col) in R.lod['boxes'][:1]:
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
    if R.lod['cover']:
        x, zy, span, rf = R.lod['cover']
        b_ = lambda p: Vector((x, 0, 0)) + Rb @ (p - Vector((x, 0, 0)))
        h = rf * 2.6 + 0.25
        nf = 2 if R.rig in ('galley', 'grain', 'hippos') else 4
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
