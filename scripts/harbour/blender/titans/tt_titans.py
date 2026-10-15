"""Titan-class flagships: four unique hero ships for the majors, classical restyle: Syracusia-class grain giants.

All four are Hieron's *Syracusia* family (PLAN 4.7): a deep, double-ended grain-ship hull with a gilt swan neck, painted
eyes, steering oars, square courses on braced yards, a siparum over the main course and a raked artemon at the bow.
Each one carries ONE distinct deck feature (period-plausible: the real ship had a temple of Aphrodite, Archimedes'
great engine, deck gardens and towers) and its own mast plan, so the four read apart at harbour zoom:

    titan_usdt  USDT  emerald-and-white, three masts + artemon, a fighting tower forward and a gilt temple of Aphrodite aft (32 m)
    titan_usdc  USDC  navy-and-white, two masts + artemon, Archimedes' great stone-thrower on a raised platform forward (30 m)
    titan_usde  USDe  charcoal-and-silver, two masts + artemon, a deck garden: umbrella pines, cypresses, a vine pergola (22 m)
    titan_usds  USDS  sky-blue-and-cream, one great mast + artemon, a tall signal tower with a burning brazier aft (22 m)

Same node / morph / material contract as the hull kit (hb_hulls.py + hb_ancient.py docstrings): _heel, hull, deck, mast,
yards, rigging, sail_main (the main course with the emblem, hanging from _heel; the artemon is a second, emblem-less
component of it), sail_extra (the other courses + the siparum), sail_cover (the brailed bundle on the main yard), flag
(brand burgees + the titan family pennant on a stern staff), bow_cleat, stern_cleat, masthead_light, wake_origin; furl
morph on every sail. Built at RUNTIME size (the fleet draws them at scale 1). Titans keep their own livery: no _PAINT
regions, and the boot-top is painted, not _BRAND (the pennants and the brailed cover still take the coin's brand colour
at runtime). Courses carry a coin-coloured foot band (sail-plan.ts ROLE_BAND), the emblem sits clear above it.
"""
import math, os, sys
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'hulls'))
import hb_lib  # noqa: E402
import hb_hulls  # noqa: E402
import hb_ancient  # noqa: E402
from hb_lib import PAL, PT, MB, lin, rod, line, box, box2, empty, to_object, tri_count, descendants  # noqa: E402
from hb_hulls import Hull, Rig, SCH, loft  # noqa: E402
from hb_ancient import AncientRig, ANCIENT_FORMS, chain  # noqa: E402

TITAN_HEX = {
    'emerald': '#22795A', 'emerald_lt': '#2E9A6E', 'navy': '#1D3354', 'usdc_blue': '#2E6BB4',
    'charcoal': '#1B1E21', 'graphite': '#2C3034', 'silver': '#B9BFC4', 'silver_dk': '#8D949A', 'pearl': '#E3E5E4',
    'sky': '#79AED6', 'sky_dk': '#4F87B5', 'cream_lt': '#F1E8D2', 'sky_cloth': '#F3EDDD',
    'marble': '#ECE6DA', 'pine': '#3D5C33', 'pine_lt': '#557A3F', 'cypress': '#2F4A2C', 'vine': '#6E8A3E',
    'soil': '#4A3426', 'stone': '#9C968C', 'flame': '#F08A24', 'flame_lt': '#FFD25A',
}
TP = {k: lin(v) for k, v in TITAN_HEX.items()}
BUDGET = 3000
LOD_BUDGET = 220

# ------------------------------------------------------------------ sail trims (one-shot non-uniform patch)
_TRIM = dict(us=None, vs=None, col=None)


def trim_patch(mb, nu, nv, P, Pf, col, uv=None, uv2=None, smooth=True, pat=0, brand=0.0, jitter=0.0, tri_head=False):
    """hb_lib.patch with optional non-uniform u/v stops and a per-cell colour (sail trims); the stops are consumed
    by the next call only."""
    us = _TRIM['us'] or [j / nu for j in range(nu + 1)]
    vs = _TRIM['vs'] or [i / nv for i in range(nv + 1)]
    cf = _TRIM['col']
    _TRIM.update(us=None, vs=None, col=None)
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
            c = (cf(j, i, nu, nv) if cf else None) or col
            mb.face([grid[ii][jj] for ii, jj in q], c, pat, brand, uv=uvs, uv2=uv2s, smooth=smooth, jitter=jitter)
    return grid


hb_hulls.patch = trim_patch      # Rig.square / fore_aft resolve `patch` in hb_hulls' globals (no trim set = hb_lib.patch)


def set_trim(us=None, vs=None, foot=None, leech=None):
    """Trim the next sail: `foot` colours the first v row, `leech` the last u column."""
    def col(j, i, nu, nv):
        if foot is not None and i == 0:
            return foot
        if leech is not None and j == nu - 1:
            return leech
        return None
    _TRIM.update(us=us, vs=vs, col=col if (foot is not None or leech is not None) else None)


def no_brand(mb):
    for f in mb.f:
        f['brand'] = 0.0


def gable(mb, x0, x1, y0, y1, z, h, roof, tymp):
    """Pitched roof, ridge along x, pediments (tympana) facing fore and aft."""
    yc = (y0 + y1) / 2
    a, b, c, d = (x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)
    r0, r1 = (x0, yc, z + h), (x1, yc, z + h)
    V = lambda p: mb.vert(p)
    mb.face((V(a), V(b), V(r1), V(r0)), roof, PT['tiles'], jitter=0.0)
    mb.face((V(c), V(d), V(r0), V(r1)), roof, PT['tiles'], jitter=0.0)
    mb.face((V(d), V(a), V(r0)), tymp, 0, jitter=0.0)
    mb.face((V(b), V(c), V(r1)), tymp, 0, jitter=0.0)


# ------------------------------------------------------------------ rig
class TitanRig(AncientRig):
    def __init__(s, vid, L, form, sch, seed=0):
        super().__init__(vid, 'titan', 'syracusia', 'flagship', sch, seed, L=L)
        s.H = Hull(L, dict(ANCIENT_FORMS['syracusia'], **form))
        s.pennants = []

    def course_t(s, mb, mx, zy, span, zb, span_b, foot=None, emblem=False, cover=False, nu=3, belly=0.06):
        """A square course on a braced yard with a coin-coloured foot band; the emblem (main only) is centred on the
        band-free cloth. furled = rolled on the yard (the main also gets the brailed bundle)."""
        s.yard(mx, zy, span, s.r_mast * (0.5 if emblem else 0.42))
        br = s._brace(mx)
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        fwd = R_ @ Vector((1, 0, 0)); up = Vector((0, 0, 1))
        x0 = mx + s.r_mast * 0.9
        rf = max(0.14, 0.11 * (zy - zb) ** 0.7 + 0.06 * s.S)

        def flat(u, v):
            wv = span_b + (span - span_b) * v
            return br(Vector((x0, -wv / 2 + wv * u, zb + (zy - zb) * v)))

        def P(u, v):
            return flat(u, v) + fwd * (belly * span * math.sin(math.pi * u) * math.sin(math.pi * (0.2 + 0.65 * (1 - v))))

        def Pf(u, v):
            th = math.pi * (0.1 + 1.7 * (1 - v))
            k = 0.55 + 0.45 * math.sin(math.pi * (0.1 + 0.8 * u))
            c = br(Vector((x0 + rf * 0.3, (-span / 2 + span * u) * 0.9, zy + rf * 0.55)))
            return c + rf * k * (0.6 + 0.4 * v) * (math.cos(th) * fwd + math.sin(th) * up)
        if foot is None:
            vs = [0.0, 0.5, 1.0]
        elif emblem:
            vs = [0.0, 0.11, 0.4, 0.72, 1.0]
        else:
            vs = [0.0, 0.13, 0.55, 1.0]
        uv2f = None
        if emblem:
            v0 = vs[1] if foot is not None else 0.0
            e1 = (flat(1, 0.5) - flat(0, 0.5)).normalized(); e2 = Vector((0, 0, 1))
            centre = (flat(0.5, v0) + flat(0.5, 1.0)) / 2
            size = min((zy - zb) * (1 - v0) / 1.12, (span_b + span) / 2 * 0.8)
            s.emblem = (centre, size)
            uv2f = lambda p: ((p - centre).dot(e1) / size + 0.5, (p - centre).dot(e2) / size + 0.5)
        set_trim(us=[j / nu for j in range(nu + 1)], vs=vs, foot=foot)
        trim_patch(mb, nu, len(vs) - 1, P, Pf, s.sch['cloth'], uv=lambda u, v: (u, v),
                   uv2=(lambda u, v: uv2f(flat(u, v))) if uv2f else (lambda u, v: (-4.0, -4.0)), smooth=True)
        s.lod['squares'].append((mx, zb, zy, span_b, span))
        if cover:
            s.brail_cover(mx, zy, span, zb)

    def mast_course(s, kx, kh, kspan, kfoot, foot, main=False, siparum=False, r=1.0):
        H, L = s.H, s.L
        x = H.x0 + kx * L
        _, top = s.mast_at(x, kh * L, s.r_mast * r)
        zy = top.z - 0.06 * L
        span = kspan * L
        s.course_t(s.main_sq if main else s.extra, x, zy, span, H.deck(x) + kfoot * L, span * 1.04, foot=foot, emblem=main, cover=main)
        if siparum:
            s.siparum(x, zy, span * 0.6, top)
        s.shrouds(top, x, 2, 0.8)
        s.pennants.append((top, (1.4 + 0.12 * L) * (1.0 if main else 0.7)))
        return x, top

    def stays(s):
        H, L = s.H, s.L
        tops = sorted(s.tops[:], key=lambda t: t.x)
        tall = [t for t in tops if t.z > H.deck(t.x) + 0.4 * L]       # the artemon is not stayed to the masts
        for a_, b_ in zip(tall, tall[1:]):
            line(s.rigging, a_ - Vector((0, 0, 0.3)), b_ - Vector((0, 0, 0.3)), s.rope)
        line(s.rigging, tall[0] - Vector((0, 0, 0.3)), H.stern() + Vector((0.4, 0, 0)), s.rope)
        line(s.rigging, tall[-1] - Vector((0, 0, 0.3)), H.bow() + Vector((-0.04 * L, 0, 0)), s.rope)

    def dress(s, neck, shields=None, n_shields=12, eye=0.035):
        """Hull, posts and the rail dress common to the class."""
        H, L = s.H, s.L
        loft(s.hull, H, s.sch, 14, band=True, paint=False)
        no_brand(s.hull)
        s.swan_neck(neck, 0.05 * L)
        s.stem_post(neck, 0.05)
        s.steering_oars()
        s.eyes(0.84, eye * L)
        if shields is not None:                                                      # round shields on the rail
            for k in range(n_shields):
                u = -0.6 + 1.25 * k / (n_shields - 1)
                x = H.x(u, H.zt(u)); w = H.w(u) + 0.04
                rr = 0.012 * L + 0.02
                for sd in (-1, 1):
                    ids = [s.hull.vert((x + rr * math.cos(2 * math.pi * j / 6), sd * w, H.zt(u) - rr * 1.1 + rr * math.sin(2 * math.pi * j / 6)))
                           for j in range(6)]
                    s.hull.face(ids if sd < 0 else ids[::-1], shields, 0, jitter=0.0)

    def tower(s, tx, tw, th, wall, cap):
        """Crenellated fighting tower (from the study)."""
        H = s.H
        z0 = H.deck(tx); ww = H.half(tx) * 1.3
        box2(s.deck, tx - tw / 2, -ww / 2, z0 - 0.1, tx + tw / 2, ww / 2, z0 + th, wall, PT['ashlar'], skip=('-z',))
        box2(s.deck, tx - tw / 2 - 0.1, -ww / 2 - 0.1, z0 + th, tx + tw / 2 + 0.1, ww / 2 + 0.1, z0 + th + 0.18, cap, skip=('-z',))
        for cx in (-1, 1):
            for cy in (-1, 0, 1):
                box(s.deck, (tx + cx * tw * 0.4, cy * ww * 0.4, z0 + th + 0.38), (0.35, 0.35, 0.4), wall, skip=('-z',))
        s.lod['boxes'].append((Vector((tx, 0, z0 + th / 2)), (tw, ww, th), wall))

    def finish(s, coll=None):
        H, L = s.H, s.L
        s.flags(s.pennants, True)
        st = H.stern()
        main_t = max(s.tops, key=lambda t: t.z)
        u_b, u_s = 0.82, -0.86
        s.empties['bow_cleat'] = Vector((H.x(u_b, H.zt(u_b)) - 0.02 * L, 0, H.zt(u_b)))
        s.empties['stern_cleat'] = Vector((H.x(u_s, H.zt(u_s)) + 0.02 * L, 0, H.zt(u_s)))
        s.empties['masthead_light'] = main_t + Vector((0, 0, 0.25 + s.r_mast))
        s.empties['wake_origin'] = Vector((st.x, 0, 0))
        root, objs = s.build_nodes(coll)
        root['family'] = 'titan'; root['class'] = 'flagship'; root['rig'] = s.rig
        return root, objs


# =================================================================== USDT: three masts + artemon, gilt temple of Aphrodite aft
def build_usdt(coll=None):
    sch = SCH(top=TP['emerald'], band='hull_white', stripe='gilt', cap='gilt', deck_in='timber_pale', boot='hull_white',
              bottom='pitch', house='whitewash', roof='terracotta', spar='timber_dark', cloth='canvas', transom=TP['emerald'])
    R = TitanRig('titan_usdt', 32.0, {}, sch)
    H, L, S = R.H, R.L, R.S
    dz = H.deck
    st = H.stern()
    green = TP['emerald_lt']
    R.dress(PAL['gilt'], PAL['gilt'], 14)
    R.mast_course(0.25, 0.6, 0.56, 0.14, green, r=0.8)
    R.mast_course(0.02, 0.84, 0.8, 0.12, green, main=True, siparum=True)
    R.mast_course(-0.19, 0.56, 0.46, 0.26, green, r=0.75)
    R.artemon(38, 0.3 * L, 0.24 * L)
    R.stays()
    R.tower(H.x0 + 0.37 * L, 0.06 * L, 0.12 * L, PAL['whitewash'], TP['emerald'])
    # the temple of Aphrodite: marble stylobate, a peristyle of 4 x 3 columns, an emerald cella, gilt entablature and roof
    x0, x1 = st.x + 0.08 * L, st.x + 0.235 * L
    z = dz((x0 + x1) / 2)
    w = min(H.half(x0), H.half(x1)) * 1.5
    m, g = TP['marble'], PAL['gilt']
    box2(R.deck, x0, -w / 2, z - 0.1, x1, w / 2, z + 0.3 * S, m, PT['ashlar'], skip=('-z',))
    zc0 = z + 0.3 * S; ch = 1.45 * S; zc1 = zc0 + ch
    box2(R.deck, x0 + 0.25 * S, -w * 0.32, zc0, x1 - 0.25 * S, w * 0.32, zc1, TP['emerald'], PT['ashlar'], skip=('-z', '+z'))   # cella
    for i in range(4):
        cx = x0 + 0.12 * S + (x1 - x0 - 0.24 * S) * i / 3
        for cy in (-1, 0, 1):
            if cy == 0 and i not in (0, 3):
                continue
            rod(R.deck, (cx, cy * (w / 2 - 0.12 * S), zc0), (cx, cy * (w / 2 - 0.12 * S), zc1), 0.13 * S, m, 5, r2=0.11 * S)
    box2(R.deck, x0 - 0.05, -w / 2 - 0.05, zc1, x1 + 0.05, w / 2 + 0.05, zc1 + 0.32 * S, g, skip=())       # entablature
    gable(R.deck, x0 - 0.12, x1 + 0.12, -w / 2 - 0.12, w / 2 + 0.12, zc1 + 0.32 * S, 0.62 * S, g, TP['emerald'])
    rod(R.deck, ((x0 + x1) / 2 + 0.0, 0, zc1 + 0.94 * S), ((x0 + x1) / 2, 0, zc1 + 1.25 * S), 0.12 * S, g, 4, r2=0.02, cap=True)  # acroterion
    R.lod['boxes'].append((Vector(((x0 + x1) / 2, 0, (z + zc1) / 2)), (x1 - x0, w, zc1 - z), m))
    R.lod['boxes'].append((Vector(((x0 + x1) / 2, 0, zc1 + 0.45 * S)), (x1 - x0 + 0.2, w + 0.2, 0.9 * S), g))
    R.house(H.x0 - 0.1 * L, H.x0 - 0.04 * L, 0.45, 0.7 * S, roof=PAL['terracotta'])
    R.hatch(H.x0 + 0.13 * L, 0.06 * L, H.B * 0.42, 0.35 * S, PAL['timber'])
    R.amphorae([H.x0 + 0.17 * L, H.x0 + 0.21 * L], [-H.B * 0.2, 0, H.B * 0.2], 0.35 * S)
    return R


# =================================================================== USDC: two masts + artemon, Archimedes' great engine forward
def build_usdc(coll=None):
    sch = SCH(top=TP['navy'], band='hull_white', stripe=TP['usdc_blue'], cap='hull_white', deck_in='timber_pale', boot='hull_white',
              bottom='pitch', house='hull_white', roof=TP['usdc_blue'], spar='timber_dark', cloth='canvas', transom=TP['navy'])
    R = TitanRig('titan_usdc', 30.0, dict(br=0.26, sheer=(0.45, 0.65)), sch)
    H, L, S = R.H, R.L, R.S
    dz = H.deck
    st = H.stern()
    blue = TP['usdc_blue']
    R.dress(PAL['gilt'], PAL['hull_white'], 12)
    R.mast_course(-0.04, 0.88, 0.8, 0.13, blue, main=True, siparum=True)
    R.mast_course(-0.27, 0.6, 0.46, 0.17, blue, r=0.78)
    R.artemon(42, 0.32 * L, 0.24 * L)
    R.stays()
    # the stone-thrower (a palintonon): raised platform, a trestle, the inclined slider-trough, the spring frame with its
    # two bronze-capped torsion springs and swept-back arms, the bowstring, a winch, a pile of shot
    xc = H.x0 + 0.2 * L
    z0 = dz(xc)
    B = H.B
    tim, dk, brz = PAL['timber'], PAL['timber_dark'], PAL['bronze']
    zt = z0 + 0.4 * S
    box2(R.deck, xc - 0.1 * L, -0.38 * B, z0 - 0.1, xc + 0.1 * L, 0.38 * B, zt, blue, PT['boards'], skip=('-z',))
    el = math.radians(24)
    d = Vector((math.cos(el), 0, math.sin(el))); y = Vector((0, 1, 0)); n = d.cross(y)
    Pv = Vector((xc - 0.01 * L, 0, zt + 1.15 * S))
    rear, front = Pv - d * 0.13 * L, Pv + d * 0.13 * L
    box(R.deck, (rear + front) / 2, ((front - rear).length, 0.55 * S, 0.32 * S), tim, PT['boards'], axes=(d, y, n))
    for lx in (-0.06, 0.05):
        for sd in (-1, 1):
            a = Vector((Pv.x + lx * L, sd * 0.2 * B, zt)); b = Pv + d * (lx * L) - Vector((0, 0, 0.12 * S))
            rod(R.deck, a, b, 0.09 * S, dk, 4)
    F = front - d * 0.03 * L
    fw = 0.24 * B
    for sd in (-1, 1):
        a = F + Vector((0, sd * fw, -0.7 * S)); b = F + Vector((0, sd * fw, 0.85 * S))
        rod(R.deck, a, b, 0.2 * S, PAL['pitch'], 6)                                           # torsion spring
        for p in (a, b):
            box(R.deck, p, (0.5 * S, 0.5 * S, 0.18 * S), brz)                                   # bronze washer
        tip = F + Vector((-0.11 * L, sd * (fw + 0.17 * B), 0.05 * S))
        rod(R.deck, F + Vector((0, sd * fw, 0.05 * S)), tip, 0.11 * S, dk, 4, r2=0.07 * S)     # arm
        line(R.rigging, tip, rear + d * 0.02 * L + Vector((0, 0, 0.2 * S)), R.rope)              # bowstring
    for zz in (-0.7, 0.85):
        box(R.deck, F + Vector((0, 0, zz * S)), (0.3 * S, 2 * fw + 0.5 * S, 0.3 * S), dk)       # frame crossbars
    rod(R.deck, rear + Vector((0, -0.3 * B, 0.1)), rear + Vector((0, 0.3 * B, 0.1)), 0.18 * S, dk, 6, cap=True)   # winch
    for k, (ox, oy) in enumerate(((0.06, -0.26), (0.08, -0.2), (0.07, -0.32), (0.06, 0.26))):
        box(R.deck, (xc + ox * L, oy * B, zt + 0.22 * S), (0.42 * S, 0.42 * S, 0.42 * S), TP['stone'], skip=('-z',))
    R.lod['boxes'].append((Vector(((xc), 0, (z0 + zt) / 2)), (0.2 * L, 0.76 * B, zt - z0), blue))
    R.lod['posts'].append(([rear, Pv, front], 0.3 * S, tim))
    R.lod['boxes'].append((F, (0.3 * S, 2 * fw + 0.4 * S, 1.55 * S), PAL['pitch']))
    # stern cabin, midships hatch
    R.house(st.x + 0.11 * L, st.x + 0.24 * L, 0.72, 0.95 * S, roof=blue)
    for k in range(4):
        x = st.x + 0.125 * L + k * 0.035 * L
        for sd in (-1, 1):
            rod(R.deck, (x, sd * H.half(x) * 0.8, dz(x) + 0.95 * S), (x, sd * H.half(x) * 0.8, dz(x) + 1.5 * S), 0.05 * S, PAL['whitewash'], 4)
    box2(R.deck, st.x + 0.105 * L, -H.half(st.x + 0.17 * L) * 0.84, dz(st.x + 0.17 * L) + 1.5 * S, st.x + 0.25 * L,
         H.half(st.x + 0.17 * L) * 0.84, dz(st.x + 0.17 * L) + 1.64 * S, TP['navy'], PT['tiles'], skip=('-z',))
    R.hatch(H.x0 - 0.14 * L, 0.06 * L, B * 0.42, 0.35 * S, PAL['timber'])
    return R


# =================================================================== USDe: two masts + artemon, the deck garden
def build_usde(coll=None):
    sch = SCH(top=TP['charcoal'], band=TP['graphite'], stripe=TP['silver'], cap=TP['silver'], deck_in=TP['graphite'], boot=TP['silver'],
              bottom=TP['graphite'], deck='deck', house=TP['silver_dk'], roof=TP['graphite'], spar='timber_dark', cloth=TP['pearl'],
              transom=TP['charcoal'])
    R = TitanRig('titan_usde', 22.0, dict(br=0.28, fb=0.135, sheer=(0.42, 0.7)), sch)
    H, L, S = R.H, R.L, R.S
    dz = H.deck
    st = H.stern()
    dark = TP['graphite']
    B = H.B
    R.dress(TP['silver'], TP['silver'], 10, eye=0.045)
    R.mast_course(0.04, 0.86, 0.8, 0.12, dark, main=True, siparum=True)
    R.mast_course(-0.25, 0.58, 0.44, 0.2, dark, r=0.75)
    R.artemon(40, 0.32 * L, 0.26 * L)
    R.stays()
    soil, terr = TP['soil'], PAL['terracotta']

    def planter(x0, x1, y0, y1, h=0.4 * S):
        z = dz((x0 + x1) / 2)
        box2(R.deck, x0, y0, z - 0.05, x1, y1, z + h, terr, PT['boards'], skip=('-z',))
        box2(R.deck, x0 + 0.06, y0 + 0.06, z + h, x1 - 0.06, y1 - 0.06, z + h + 0.04, soil, PT['grass'], skip=('-z', '-x', '+x', '-y', '+y'))
        return z + h

    def pine(x, y, h, r):
        z = planter(x - 0.45 * S, x + 0.45 * S, y - 0.45 * S, y + 0.45 * S)
        top = Vector((x - 0.02 * L, y, z + h))
        rod(R.deck, (x, y, z), top, 0.09 * S, PAL['timber_dark'], 4, r2=0.06 * S)
        rod(R.deck, top - Vector((0, 0, 0.32 * S)), top + Vector((0, 0, 0.12 * S)), r, TP['pine'], 7, r2=r * 0.85, cap=True, pat=PT['leaf'])
        rod(R.deck, top + Vector((0.1 * r, 0, 0.12 * S)), top + Vector((0.1 * r, 0, 0.42 * S)), r * 0.7, TP['pine_lt'], 6, r2=r * 0.3, cap=True,
            pat=PT['leaf'])
        R.lod['boxes'].append((top + Vector((0, 0, 0.0)), (2 * r, 2 * r, 0.7 * S), TP['pine']))

    def cypress(x, y, h):
        z = planter(x - 0.3 * S, x + 0.3 * S, y - 0.3 * S, y + 0.3 * S, 0.35 * S)
        rod(R.deck, (x, y, z), (x, y, z + 0.25 * h), 0.24 * S, TP['cypress'], 5, r2=0.3 * S, pat=PT['leaf'])
        rod(R.deck, (x, y, z + 0.25 * h), (x, y, z + h), 0.3 * S, TP['cypress'], 5, r2=0.02, cap=True, pat=PT['leaf'])
        R.lod['posts'].append(([Vector((x, y, z)), Vector((x, y, z + 0.5 * h)), Vector((x, y, z + h))], 0.3 * S, TP['cypress']))
    # umbrella pines on the foredeck, either side of the artemon's foot
    xf = H.x0 + 0.24 * L
    for sd in (-1, 1):
        pine(xf + 0.02 * L * sd, sd * 0.2 * B, 0.17 * L, 0.085 * L)
    # long planters with vines along the waist
    for sd in (-1, 1):
        xa, xb = H.x0 + 0.1 * L, H.x0 + 0.17 * L
        zz = planter(xa, xb, sd * 0.38 * B - 0.25 * S, sd * 0.38 * B + 0.25 * S)
        box2(R.deck, xa + 0.1, sd * 0.38 * B - 0.3 * S, zz, xb - 0.1, sd * 0.38 * B + 0.3 * S, zz + 0.35 * S, TP['vine'], PT['leaf'], skip=('-z',))
    # vine pergola over the quarterdeck walk: four posts, a leafy roof
    px0, px1 = H.x0 - 0.17 * L, H.x0 - 0.05 * L
    pz = dz((px0 + px1) / 2); ph = 1.25 * S; pw = 0.34 * B
    for xx in (px0, px1):
        for sd in (-1, 1):
            rod(R.deck, (xx, sd * pw, pz), (xx, sd * pw, pz + ph), 0.07 * S, TP['marble'], 4)
    box2(R.deck, px0 - 0.15, -pw - 0.2, pz + ph, px1 + 0.15, pw + 0.2, pz + ph + 0.22 * S, TP['vine'], PT['leaf'], skip=())
    # two cypresses flanking the stern cabin
    R.house(st.x + 0.12 * L, st.x + 0.23 * L, 0.6, 0.85 * S, roof=TP['graphite'])
    for sd in (-1, 1):
        cypress(st.x + 0.255 * L, sd * 0.3 * B, 0.2 * L)
    return R


# =================================================================== USDS: one great mast + artemon, the signal tower aft
def build_usds(coll=None):
    sch = SCH(top=TP['sky'], band=TP['cream_lt'], stripe=TP['cream_lt'], cap='hull_white', deck_in=TP['cream_lt'], boot=TP['cream_lt'],
              bottom='pitch', house=TP['cream_lt'], roof=TP['sky_dk'], spar='timber', cloth=TP['sky_cloth'], transom=TP['sky'])
    R = TitanRig('titan_usds', 22.0, dict(br=0.29, fb=0.135, sheer=(0.5, 0.75)), sch)
    H, L, S = R.H, R.L, R.S
    dz = H.deck
    st = H.stern()
    sky = TP['sky']
    B = H.B
    R.dress(PAL['gilt'], PAL['gilt'], 10, eye=0.045)
    R.mast_course(0.1, 0.92, 0.88, 0.12, sky, main=True, siparum=True)
    R.artemon(40, 0.3 * L, 0.24 * L)
    R.stays()
    # the signal tower: a square ashlar base with a sky band, an octagonal lantern stage, a gallery and a bronze brazier
    tx = H.x0 - 0.22 * L
    z0 = dz(tx); tw = 0.12 * L; ww = H.half(tx) * 1.15
    h1 = 0.24 * L
    cr = TP['cream_lt']
    box2(R.deck, tx - tw / 2, -ww / 2, z0 - 0.1, tx + tw / 2, ww / 2, z0 + h1, cr, PT['ashlar'], skip=('-z',))
    box2(R.deck, tx - tw / 2 - 0.06, -ww / 2 - 0.06, z0 + h1 * 0.62, tx + tw / 2 + 0.06, ww / 2 + 0.06, z0 + h1 * 0.74, sky, skip=('-z',))
    box2(R.deck, tx - tw / 2 - 0.18, -ww / 2 - 0.18, z0 + h1, tx + tw / 2 + 0.18, ww / 2 + 0.18, z0 + h1 + 0.2 * S, TP['sky_dk'], skip=())
    h2 = 0.12 * L; r2 = 0.42 * min(tw, ww)
    zb = z0 + h1 + 0.2 * S
    rod(R.deck, (tx, 0, zb), (tx, 0, zb + h2), r2, cr, 8, r2=r2 * 0.88, pat=PT['ashlar'], smooth=False)
    rod(R.deck, (tx, 0, zb + h2 * 0.35), (tx, 0, zb + h2 * 0.62), r2 * 1.01, TP['sky_dk'], 8, r2=r2 * 0.95, smooth=False)  # window band
    zt = zb + h2
    rod(R.deck, (tx, 0, zt), (tx, 0, zt + 0.12 * S), r2 * 1.25, sky, 8, cap=True, smooth=False)                           # gallery
    rod(R.deck, (tx, 0, zt + 0.12 * S), (tx, 0, zt + 0.55 * S), r2 * 0.45, PAL['bronze'], 6, r2=r2 * 0.95, cap=True)      # brazier
    zf = zt + 0.55 * S
    rod(R.deck, (tx, 0, zf - 0.05), (tx + 0.02, 0, zf + 1.15 * S), r2 * 0.8, TP['flame'], 6, r2=0.03, cap=True, smooth=False)
    rod(R.deck, (tx, 0, zf), (tx - 0.05, 0, zf + 0.75 * S), r2 * 0.5, TP['flame_lt'], 5, r2=0.02, cap=True, smooth=False)
    for sd in (-1, 1):   # stays
        line(R.rigging, Vector((tx, sd * r2, zt)), Vector((tx - 0.05 * L, sd * (H.half(tx - 0.05 * L) - 0.05), dz(tx) + 0.1)), R.rope * 0.8)
    R.lod['boxes'].append((Vector((tx, 0, (z0 + z0 + h1) / 2)), (tw, ww, h1), cr))
    R.lod['posts'].append(([Vector((tx, 0, zb)), Vector((tx, 0, zt)), Vector((tx, 0, zf + 1.1 * S))], r2, cr))
    R.lod['boxes'].append((Vector((tx, 0, zf + 0.35 * S)), (r2 * 1.4, r2 * 1.4, 0.8 * S), TP['flame']))
    # stern cabin, forward hatch, amphorae
    R.house(st.x + 0.1 * L, st.x + 0.19 * L, 0.66, 0.8 * S, roof=TP['sky_dk'])
    R.hatch(H.x0 + 0.24 * L, 0.06 * L, B * 0.42, 0.35 * S, PAL['timber'])
    R.amphorae([H.x0 - 0.06 * L, H.x0 - 0.1 * L], [-B * 0.2, B * 0.2], 0.38 * S)
    return R


TITANS = [
    # id, coin, builder, runtime summary
    ('titan_usdt', 'usdt-tether', build_usdt, 'emerald-and-white Syracusia: three masts + artemon, fighting tower, gilt temple of Aphrodite aft'),
    ('titan_usdc', 'usdc-circle', build_usdc, "navy-and-white Syracusia: two masts + artemon, Archimedes' great stone-thrower forward"),
    ('titan_usde', 'usde-ethena', build_usde, 'charcoal-and-silver Syracusia: two masts + artemon, a deck garden of pines, cypresses and vines'),
    ('titan_usds', 'usds-sky', build_usds, 'sky-blue-and-cream Syracusia: one great mast + artemon, a signal tower with a burning brazier'),
]


def build(vid, coll=None):
    fn = {t[0]: t[2] for t in TITANS}[vid]
    R = fn(coll)
    root, objs = R.finish(coll)
    return root, objs, R


# =================================================================== LOD: single mesh silhouette
def build_titan_lod(R, coll=None):
    """Far-zoom silhouette from the recorded rig (hb_ancient.build_ancient_lod pattern) in the titan's own livery: hull
    bands (no _BRAND boot, no _PAINT), masts, one quad per square sail, posts, the deck feature as boxes, and the brand
    cover strip that hangs from the main yard when furled. furl collapses the canvas onto its yards."""
    H, L, sch = R.H, R.L, R.sch
    mb = MB(7)
    n = 4
    secs = []
    for i in range(n + 1):
        u = -1 + 2 * i / n
        w = H.w(u); zt = H.zt(u); zk = H.zk(u); fb = H.fb
        pr = [('stripe', w, zt), ('top', w * 0.995, zt - 0.12 * fb), ('band', w * 0.99, zt - 0.32 * fb), ('top', w * 0.985, zt - 0.55 * fb),
              ('boot', w * 0.95, H.boot * 1.2), ('bottom', w * 0.85, -0.05 * fb), (None, 0, zk)]
        port = [mb.vert((H.x(u, z), y, z)) for _, y, z in pr[:-1]]
        stb = [mb.vert((H.x(u, z), -y, z)) for _, y, z in pr[:-1]]
        k = mb.vert((H.x(u, zk), 0, zk))
        secs.append((port + [k], stb + [k], [p[0] for p in pr]))
    for i in range(n):
        (pa, sa, nm), (pb, sb, _) = secs[i], secs[i + 1]
        for k in range(len(pa) - 1):
            c = sch[nm[k]]
            mb.face((pa[k], pb[k], pb[k + 1], pa[k + 1]), c, 0)
            mb.face((sa[k], sa[k + 1], sb[k + 1], sb[k]), c, 0)
        mb.face((sa[0], sb[0], pb[0], pa[0]), sch['deck'], 0)

    def tri2(pts, ptsf, col, brand=0.0, paint=None):
        ids = [mb.vert(p, q) for p, q in zip(pts, ptsf)]
        g0 = len(mb.f)
        mb.face(ids, col, 0, brand, jitter=0.0, paint=paint)
        mb.backface(g0)
    cloth = sch['cloth']
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
    mb.paint = 0.0
    x, zy, span, rf = R.lod['cover']
    b_ = lambda p: Vector((x, 0, 0)) + Rb @ (p - Vector((x, 0, 0)))
    h = rf * 2.2 + 0.1
    a = [b_(Vector((x + 0.1, -span * 0.46, zy))), b_(Vector((x + 0.1, span * 0.46, zy))), b_(Vector((x + 0.1, span * 0.46, zy))), b_(Vector((x + 0.1, -span * 0.46, zy)))]
    af = [b_(Vector((x + rf, -span * 0.46, zy + 0.1))), b_(Vector((x + rf, span * 0.46, zy + 0.1))), b_(Vector((x + rf, span * 0.4, zy - h))),
          b_(Vector((x + rf, -span * 0.4, zy - h)))]
    tri2(a, af, PAL['brand_default'], 1.0, paint=0.0)
    root = empty(R.id + '_lod', coll=coll)
    o = to_object(mb, 'lod', 'hb_opaque', parent=root, coll=coll)
    root['family'] = 'titan'; root['class'] = 'flagship'; root['rig'] = R.rig; root['loa_m'] = L; root['beam_m'] = round(H.B, 2)
    return root, o, mb.tris()


__all__ = ['TITANS', 'build', 'build_titan_lod', 'BUDGET', 'LOD_BUDGET', 'tri_count', 'descendants']
