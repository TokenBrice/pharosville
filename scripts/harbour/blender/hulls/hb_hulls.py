"""Harbour hulls - one parametric hull + rig builder for every runtime boat (style C "Northern Light").

Blender frame: bow +x, port +y, up +z, origin = midships on the waterline (sea level z = 0).
Node contract (per GLB), see export.py for the manifest that documents it:

  <id>                     root empty, extras {family, class, rig, loa_m, beam_m}
    _heel                  heel pivot (waterline, midships). Everything that heels hangs here.
      hull                 hb_opaque (+ _BRAND on the boot-top stripe)
      deck                 hb_opaque: houses, hatches, cargo, rudder/tiller
      mast                 hb_opaque: masts, bowsprit, tops, ensign staff (static spars)
      yards                hb_opaque: square-rig yards, braced 30 deg for wind from starboard (mirror on port tack)
      rigging              hb_opaque: shrouds and stays (static)
      boom                 empty pivot AT THE GOOSENECK (swing about local up)
        boom_spar          hb_opaque: the boom + topping lift
        gaff               hb_opaque, morph furl (lowered onto the boom)
        sail_main|_spanker hb_sail, morph furl (flaked onto the boom); sail_main carries the emblem
        sail_cover         hb_cover, morph furl (0 = collapsed inside the boom, 1 = cover on)
      boom_2 ...           second swinging group (schooner foresail, lugger mizzen), same children *_2
      sail_main            (square riggers: the main course, hangs from _heel)
      sail_jib             hb_sail, morph furl (rolled on the stay); origin at the tack
      sail_extra           hb_sail, morph furl: square sails / topsails that do not swing
      flag                 hb_opaque: currency ensign + brand pennant (_BRAND), UV0.u = 0 hoist .. 1 fly
      bow_cleat, stern_cleat, masthead_light   empties
    wake_origin            empty (does not heel)
"""
import math, random
from mathutils import Vector, Matrix
from hb_lib import *

CLASS_LOA = dict(flagship=30.0, large=18.0, medium=13.0, small=10.0, boat=7.5, skiff=5.0)
BUDGET = dict(skiff=450, boat=700, small=700, medium=900, large=1400, flagship=2500)
SECTIONS = dict(skiff=6, boat=8, small=9, medium=9, large=11, flagship=13)

# hull forms: beam/L, freeboard/L, draft/L, bow fullness exponent, transom width (0..1 of beam),
# sheer rise (bow, stern) as a fraction of freeboard, stem rake / counter as a fraction of LOA, bulwark/L
FORMS = {
    'cat':      dict(br=0.46, fb=0.12, dr=0.06, bow=2.6, stern=0.86, sheer=(0.28, 0.10), rb=0.03, rs=0.00, bul=0.016, rpow=1.0),
    'sloop':    dict(br=0.34, fb=0.105, dr=0.07, bow=2.0, stern=0.52, sheer=(0.36, 0.16), rb=0.05, rs=0.08, bul=0.014, rpow=1.4),
    'cutter':   dict(br=0.30, fb=0.10, dr=0.08, bow=1.9, stern=0.46, sheer=(0.36, 0.16), rb=0.015, rs=0.10, bul=0.015, rpow=1.0),
    'schooner': dict(br=0.27, fb=0.095, dr=0.07, bow=1.9, stern=0.50, sheer=(0.34, 0.16), rb=0.07, rs=0.06, bul=0.022, rpow=1.6),
    'ship':     dict(br=0.235, fb=0.105, dr=0.07, bow=2.1, stern=0.62, sheer=(0.32, 0.20), rb=0.075, rs=0.04, bul=0.034, rpow=1.6),
    'brig':     dict(br=0.31, fb=0.095, dr=0.08, bow=2.9, stern=0.68, sheer=(0.34, 0.24), rb=0.045, rs=0.03, bul=0.036, rpow=1.3),
    'botter':   dict(br=0.37, fb=0.11, dr=0.05, bow=4.2, stern=0.55, sheer=(0.95, 0.40), rb=0.07, rs=0.02, bul=0.012, rpow=0.7),
    'lugger':   dict(br=0.33, fb=0.11, dr=0.07, bow=2.4, stern=0.55, sheer=(0.32, 0.16), rb=0.012, rs=0.03, bul=0.02, rpow=1.0),
    'work':     dict(br=0.41, fb=0.125, dr=0.06, bow=2.7, stern=0.74, sheer=(0.30, 0.12), rb=0.02, rs=0.00, bul=0.02, rpow=1.0),
    'dinghy':   dict(br=0.40, fb=0.13, dr=0.04, bow=2.2, stern=0.62, sheer=(0.45, 0.16), rb=0.03, rs=0.01, bul=0.0, rpow=1.0),
}


class Hull:
    def __init__(s, L, F):
        s.L, s.F = L, F
        s.B = F['br'] * L; s.fb = F['fb'] * L; s.dr = F['dr'] * L
        s.rb = F['rb'] * L; s.rs = F['rs'] * L
        s.Lh = L - s.rb - s.rs
        s.x0 = (s.rs - s.rb) / 2
        s.bh = max(0.09, F['bul'] * L) if F['bul'] > 0 else 0.0
        s.th = max(0.05, 0.006 * L)
        s.cap = max(0.045, 0.0055 * L)
        s.stripe = max(0.06, 0.011 * L)
        s.boot = max(0.11, 0.24 * s.fb)

    def w(s, u):
        F = s.F
        if u >= 0:
            w = s.B / 2 * max(0.0, 1 - u ** F['bow']) ** 0.5
        else:
            w = s.B / 2 * (1 - (1 - F['stern']) * u * u)
        return max(w, 0.02 * s.B)

    def zt(s, u):
        sb, ss = s.F['sheer']
        return s.fb * (1 + (sb if u > 0 else ss) * u * u)

    def zk(s, u):
        return -s.dr * (1 - 0.65 * abs(u) ** 3)

    def x(s, u, z):
        h = min(1.0, max(0.0, (z - s.zk(u)) / max(1e-6, s.zt(u) - s.zk(u))))
        x = s.x0 + u * s.Lh / 2
        if u > 0:
            x += s.rb * h ** s.F['rpow'] * smoothstep(0.45, 1.0, u)
        else:
            x -= s.rs * h * smoothstep(0.45, 1.0, -u)
        return x

    def u_at(s, x):
        return max(-1.0, min(1.0, (x - s.x0) / (s.Lh / 2)))

    def deck(s, x):
        """deck height at boat x"""
        return s.zt(s.u_at(x)) - s.bh

    def half(s, x, z=None):
        return s.w(s.u_at(x))

    def bow(s):
        return Vector((s.x(1.0, s.zt(1.0)), 0, s.zt(1.0)))

    def stern(s):
        return Vector((s.x(-1.0, s.zt(-1.0)), 0, s.zt(-1.0)))

    def profile(s, u, band=False):
        w = s.w(u); zt = s.zt(u); zk = s.zk(u); fb = s.fb
        bowk = max(u, 0) ** 2
        zbt = s.boot * (1 + 0.3 * u * u)
        z4 = zt - s.cap - s.stripe
        pts = []
        if s.bh > 0:
            pts.append(('deck_in', max(w - s.th, 0.0), zt - s.bh))
        pts += [('cap', max(w - s.th, 0.0), zt), ('cap', w, zt), ('stripe', w * 0.997, zt - s.cap),
                ('top', w * 0.99, z4)]
        if band:
            za = z4 - (z4 - zbt) * 0.16; zb_ = z4 - (z4 - zbt) * 0.58
            pts[-1] = ('top', w * 0.99, z4)
            pts += [('band', w * 0.985, za), ('top', w * 0.975, zb_)]
        kw = 0.955 - 0.12 * bowk
        pts += [('boot', w * kw, zbt), ('bottom', w * (kw - 0.05), -0.07 * fb),
                ('bottom', w * 0.62, zk * 0.62), (None, 0.0, zk)]
        return pts


SMOOTH_SEG = ('top', 'band', 'boot', 'bottom', 'stripe')
# _PAINT region per profile segment (hb_lib.to_object): the runtime repaints these per coin (decorative livery)
PAINT_SEG = dict(stripe=3.0, band=3.0, cap=5.0, deck_in=6.0)


def deck_side(p):
    """_PAINT for the deck: 4 + 0.98 s, s = 0 starboard edge .. 1 port edge (a painted margin reads from above)."""
    return 4.0 + (0.98 if p.y > 0 else 0.0)


def topside_t(H, boot_k=1.0):
    """_PAINT for topsides: 1 + 0.98 t, t = 0 at the boot-top .. 1 at the sheer (corner-wise)."""
    def f(p):
        u = H.u_at(p.x)
        zb = H.boot * boot_k * (1 + 0.3 * u * u)
        t = (p.z - zb) / max(1e-3, H.zt(u) - zb)
        return 1.0 + 0.98 * min(1.0, max(0.0, t))
    return f


def loft(mb, H, sch, n, band=False, hole=None, pat_top=PT['strakes'], paint=True):
    """Sections from stern (u=-1) to bow (u=1). hole(x, y, z) -> True drops that face (wrecks).
    paint: tag the livery regions (_PAINT) - only the runtime hulls, never wrecks or tenders."""
    tfn = topside_t(H)
    secs = []
    for i in range(n + 1):
        t = i / n
        u = -1 + 2 * (t + 0.06 * math.sin(2 * math.pi * t) * 0.0)
        pr = H.profile(u, band)
        port, stbd = [], []
        for (nm, y, z) in pr[:-1]:
            x = H.x(u, z)
            port.append(mb.vert((x, y, z))); stbd.append(mb.vert((x, -y, z)))
        z = pr[-1][2]
        k = mb.vert((H.x(u, z), 0, z))
        port.append(k); stbd.append(k)
        secs.append((port, stbd, [p[0] for p in pr]))
    pat = dict(deck=PT['planks_y'], top=pat_top, band=pat_top, deck_in=PT['boards'], transom=pat_top)

    def put(idx, nm):
        if hole is not None:
            c = sum((mb.v[i] for i in idx), Vector()) / len(idx)
            if hole(c, nm):
                return
        pc = (tfn if nm in ('top', 'transom') else deck_side if nm == 'deck' else PAINT_SEG.get(nm, 0.0)) if paint else 0.0
        mb.face(idx, sch[nm], pat.get(nm, 0), 1.0 if nm == 'boot' else 0.0, smooth=nm in SMOOTH_SEG, paint=pc)
    for i in range(n):
        (pa, sa, names), (pb, sb, _) = secs[i], secs[i + 1]
        for k in range(len(pa) - 1):
            nm = names[k]
            put((pa[k], pb[k], pb[k + 1], pa[k + 1]), nm)
            put((sa[k], sa[k + 1], sb[k + 1], sb[k]), nm)
        put((sa[0], sb[0], pb[0], pa[0]), 'deck')
    pa, sa, _ = secs[0]
    put(pa + sa[-2::-1], 'transom')
    pb, sb, _ = secs[-1]
    put((pb + sb[-2::-1])[::-1], 'top')
    return secs


# =================================================================== variants (the runtime matrix)
def SCH(**kw):
    s = dict(deck=PAL['deck'], deck_in=PAL['hull_white'], cap=PAL['varnish'], stripe=PAL['hull_white'], top=PAL['hull_white'],
             band=PAL['hull_white'], boot=PAL['brand_default'], bottom=PAL['antifoul'], transom=None,
             house=PAL['cream'], roof=PAL['varnish'], spar=PAL['timber'], cloth=PAL['canvas'])
    s.update({k: (PAL[v] if isinstance(v, str) else v) for k, v in kw.items()})
    if s['transom'] is None:
        s['transom'] = s['top']
    return s


VARIANTS = [
    # id, family, rig, class, scheme
    ('usd_cat_skiff', 'usd', 'cat', 'skiff', SCH(top='hull_white', stripe='hull_blue', cap='varnish', deck_in='cream', transom='varnish')),
    ('usd_sloop_boat', 'usd', 'sloop', 'boat', SCH(top='hull_green', stripe='hull_white', cap='varnish', deck_in='cream')),
    ('usd_sloop_small', 'usd', 'sloop', 'small', SCH(top='hull_blue', stripe='gilt', cap='varnish', deck_in='hull_white', transom='varnish')),
    ('usd_cutter_medium', 'usd', 'cutter', 'medium', SCH(top='hull_black', stripe='gilt', cap='varnish', deck_in='hull_white', transom='hull_black')),
    ('usd_schooner_large', 'usd', 'schooner', 'large', SCH(top='hull_white', stripe='hull_green', cap='varnish', deck_in='hull_white', bottom='bottom_green')),
    ('usd_ship_flagship', 'usd', 'ship', 'flagship', SCH(top='hull_black', band='hull_white', stripe='gilt', cap='hull_black', deck_in='hull_white',
                                                          bottom='antifoul', house='hull_white', roof='timber', spar='timber_dark')),
    ('eur_botter_boat', 'eur', 'botter', 'boat', SCH(top='oak', stripe='hull_green', cap='hull_green', deck_in='hull_green', bottom='tar', transom='oak',
                                                      house='varnish', roof='hull_green', spar='timber', cloth='tanbark_sail')),
    ('eur_botter_small', 'eur', 'botter', 'small', SCH(top='oak', stripe='hull_green', cap='hull_green', deck_in='hull_green', bottom='tar', transom='oak',
                                                        house='varnish', roof='hull_green', spar='timber', cloth='tanbark_sail')),
    ('eur_botter_medium', 'eur', 'botter', 'medium', SCH(top='oak', stripe='hull_green', cap='hull_green', deck_in='hull_green', bottom='tar', transom='oak',
                                                          house='varnish', roof='hull_green', spar='timber', cloth='tanbark_sail')),
    ('eur_botter_large', 'eur', 'botter', 'large', SCH(top='oak', stripe='hull_green', cap='hull_green', deck_in='hull_green', bottom='tar', transom='oak',
                                                        house='varnish', roof='hull_green', spar='timber', cloth='tanbark_sail')),
    ('gold_brig_medium', 'gold', 'brig', 'medium', SCH(top='hull_stain', stripe='gilt', cap='gilt', deck_in='hull_stain', bottom='copper', transom='hull_stain',
                                                        house='hull_stain', roof='gilt', spar='timber_dark')),
    ('gold_brig_large', 'gold', 'brig', 'large', SCH(top='hull_stain', stripe='gilt', cap='gilt', deck_in='hull_stain', bottom='copper', transom='hull_stain',
                                                      house='hull_stain', roof='gilt', spar='timber_dark')),
    ('fiat_lugger_boat', 'fiat', 'lugger', 'boat', SCH(top='hull_black', stripe='hull_ochre', cap='hull_ochre', deck_in='hull_red', bottom='tar',
                                                        house='hull_red', roof='timber', spar='timber', cloth='lug_ochre')),
    ('fiat_lugger_small', 'fiat', 'lugger', 'small', SCH(top='hull_black', stripe='hull_ochre', cap='hull_ochre', deck_in='hull_red', bottom='tar',
                                                          house='hull_red', roof='timber', spar='timber', cloth='lug_ochre')),
    ('fiat_lugger_medium', 'fiat', 'lugger', 'medium', SCH(top='hull_black', stripe='hull_ochre', cap='hull_ochre', deck_in='hull_red', bottom='tar',
                                                            house='hull_red', roof='timber', spar='timber', cloth='lug_ochre')),
    ('other_work_skiff', 'other', 'work', 'skiff', SCH(top='hull_teal', stripe='cream', cap='timber_grey', deck_in='cream', bottom='tar',
                                                        house='cream', roof='hull_red', spar='timber_grey', cloth='canvas_old')),
    ('other_work_boat', 'other', 'work', 'boat', SCH(top='hull_teal', stripe='cream', cap='timber_grey', deck_in='cream', bottom='tar',
                                                      house='cream', roof='hull_red', spar='timber_grey', cloth='canvas_old')),
    ('other_work_small', 'other', 'work', 'small', SCH(top='hull_teal', stripe='cream', cap='timber_grey', deck_in='cream', bottom='tar',
                                                        house='cream', roof='hull_red', spar='timber_grey', cloth='canvas_old')),
]

ENSIGN = {  # cell colour fn(j: hoist->fly, i: bottom->top) on an nu x nv grid
    'usd': (2, 3, lambda j, i: PAL['flag_blue'] if (j == 0 and i == 2) else (PAL['flag_red'] if i % 2 == 0 else PAL['flag_white'])),
    'eur': (3, 3, lambda j, i: PAL['flag_gold'] if (j == 1 and i == 1) else PAL['flag_blue']),
    'gold': (3, 3, lambda j, i: PAL['flag_gold'] if (j == 1 and i == 1) else PAL['hull_black']),
    'fiat': (3, 3, lambda j, i: PAL['flag_white'] if (j == 1 or i == 1) else PAL['flag_red']),
    'other': (2, 1, lambda j, i: PAL['cream']),
}


# =================================================================== rig pieces
class Rig:
    """Collects the meshes of one boat in boat space, then turns them into the node tree."""

    def __init__(s, vid, family, rig, cls, sch, seed=0):
        s.id, s.family, s.rig, s.cls, s.sch = vid, family, rig, cls, sch
        s.L = CLASS_LOA[cls]; s.S = s.L / 13.0
        s.H = Hull(s.L, FORMS[rig])
        s.rng = random.Random(seed)
        s.hull, s.deck, s.mast, s.rigging, s.flag = MB(seed), MB(seed + 1), MB(seed + 2), MB(seed + 3), MB(seed + 4)
        s.jib, s.extra, s.main_sq, s.yards = MB(seed + 5), MB(seed + 6), MB(seed + 7), MB(seed + 8)
        s.groups = []          # boom groups: dict(name, G, boom, gaff, sail, cover, sail_name)
        s.r_mast = min(0.42, max(0.085, 0.0165 * s.L))
        s.rope = max(0.022, 0.0028 * s.L)
        s.tops = []            # (x, z_top) of masts
        s.main_top = None
        s.jib_tack = None; s.jib_axis = None
        s.emblem = None        # (centre_m, size_m) of the emblem square
        s.empties = {}

    # -------------------------------------------------- spars
    def mast_at(s, x, h, r=None, rake=0.0, parts=1):
        r = r or s.r_mast
        z0 = s.H.deck(x) - 0.25
        top = Vector((x - math.sin(rake) * h, 0, z0 + 0.25 + h))
        base = Vector((x, 0, z0))
        if parts == 1:
            rod(s.mast, base, top, r, s.sch['spar'], 6, r2=r * 0.62)
        else:  # lower mast + topmast (+ topgallant) with a doubling
            k1 = 0.58 if parts == 2 else 0.5
            m1 = base.lerp(top, k1)
            rod(s.mast, base, m1 + Vector((0, 0, 0.3 * s.S)), r, s.sch['spar'], 6, r2=r * 0.85)
            if parts == 2:
                rod(s.mast, m1 - Vector((0, 0, 0.6 * s.S)), top, r * 0.62, s.sch['spar'], 5, r2=r * 0.38)
            else:
                m2 = base.lerp(top, 0.8)
                rod(s.mast, m1 - Vector((0, 0, 0.6 * s.S)), m2 + Vector((0, 0, 0.2 * s.S)), r * 0.65, s.sch['spar'], 5, r2=r * 0.5)
                rod(s.mast, m2 - Vector((0, 0, 0.4 * s.S)), top, r * 0.42, s.sch['spar'], 4, r2=r * 0.3)
        # truck
        box(s.mast, top + Vector((0, 0, r * 0.3)), (r * 1.4, r * 1.4, r * 0.6), s.sch['spar'], skip=('-z',))
        s.tops.append(top)
        return base, top

    def bowsprit(s, length, rise=0.18, r=None):
        r = r or s.r_mast * 0.75
        b = s.H.bow()
        a = b + Vector((-0.10 * s.L, 0, -0.04 * s.L * 0.3))
        a.z = s.H.deck(a.x) + 0.15
        end = b + Vector((length, 0, length * rise))
        rod(s.mast, a, end, r, s.sch['spar'], 5, r2=r * 0.6)
        return end

    def shrouds(s, top, x, n=1, k=0.9):
        """n shrouds per side from top*k to the rail."""
        B = s.H.half(x)
        zr = s.H.zt(s.H.u_at(x))
        for side in (-1, 1):
            for j in range(n):
                dx = (-0.06 * s.L * (j + 0.4)) if n > 1 else -0.03 * s.L
                p = Vector((x + dx, side * (s.H.half(x + dx) + 0.02), s.H.zt(s.H.u_at(x + dx)) - 0.02))
                q = Vector((top.x, 0, s.H.deck(x) + (top.z - s.H.deck(x)) * k))
                line(s.rigging, p, q, s.rope)

    # -------------------------------------------------- sails
    def emblem_uv(s, T, C, Th, Pk, square=False):
        """Fit the largest emblem square (with margin) inside the sail quad, return a uv2(p_flat) function.
        Fore-and-aft sails read correctly from starboard; square sails from ahead."""
        if square:
            e1 = (C - T).normalized(); e2 = Vector((0, 0, 1))
        else:
            e1 = -(C - T).normalized()
            d = Th - T
            e2 = (d - (-e1) * d.dot(-e1)).normalized()
        quad = [T, C, Pk, Th]
        q2 = [((p - T).dot(e1), (p - T).dot(e2)) for p in quad]

        def inside(x, y):
            ins = False
            for a in range(4):
                (x0, y0), (x1, y1) = q2[a], q2[(a + 1) % 4]
                if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0 + 1e-9) + x0:
                    ins = not ins
            return ins
        # candidate centres on a grid; keep the biggest square that fits
        xs = [x for x, _ in q2]; ys = [y for _, y in q2]
        best = (0.0, 0.0, 0.0)
        for gi in range(1, 24):
            for gj in range(1, 24):
                cx = min(xs) + (max(xs) - min(xs)) * gi / 24
                cy = min(ys) + (max(ys) - min(ys)) * gj / 24
                if not inside(cx, cy):
                    continue
                lo, hi = 0.0, max(max(xs) - min(xs), max(ys) - min(ys))
                for _ in range(18):
                    m = (lo + hi) / 2; h = m / 2 * 1.12
                    ok = all(inside(cx + a * h, cy + b * h) for a in (-1, 0, 1) for b in (-1, 0, 1))
                    lo, hi = (m, hi) if ok else (lo, m)
                # prefer low, central placements a little (foot of the sail is the most visible)
                score = lo * (1.0 - 0.05 * abs(gj / 24 - 0.42))
                if score > best[0]:
                    best = (score, cx, cy, lo)
        _, cx, cy, size = best
        centre = T + e1 * cx + e2 * cy
        s.emblem = (centre, size)

        def uv2(p):
            d = p - centre
            return (d.dot(e1) / size + 0.5, d.dot(e2) / size + 0.5)
        return uv2

    def fore_aft(s, name, mx, zb, blen, throat_z, gaff_len, peak_deg, emblem=False, belly=0.075, topsail=None,
                 lug_fwd=0.0, nu=4, nv=4, sail_name=None, boom_rise=0.0):
        """Gaff/lug sail + boom + gaff/yard + cover as one swinging group (origin at the gooseneck)."""
        S = s.S
        rb = s.r_mast * 0.62
        G = Vector((mx - s.r_mast * 0.9, 0, zb))
        ad = Vector((-1, 0, boom_rise)).normalized()
        E = G + ad * blen
        up = Vector((0, 0, 1)); side = Vector((0, 1, 0))
        boom, gaff, sail, cover = MB(), MB(), MB(), MB()
        rod(boom, G + ad * (-0.1 * S), E, rb, s.sch['spar'], 5, r2=rb * 0.75, cap=False)
        # sail corners (flat, before belly)
        T = G + Vector((0, 0, rb * 1.1)) + ad * 0.05 * blen
        C = E + Vector((0, 0, rb * 0.9))
        Th = Vector((mx - s.r_mast + lug_fwd, 0, throat_z))
        pk = math.radians(peak_deg)
        Pk = Th + Vector((-math.cos(pk) * gaff_len, 0, math.sin(pk) * gaff_len))
        rf = max(0.09, 0.042 * blen)            # flaked bundle radius
        axis_f = lambda t: G + ad * (blen * (0.04 + 0.9 * t)) + up * (rb + rf * 0.95)

        def flat(u, v):
            return T.lerp(Th, v).lerp(C.lerp(Pk, v), u)

        def P(u, v):
            return flat(u, v) + side * (belly * blen * math.sin(math.pi * u) * (0.4 + 0.6 * math.sin(math.pi * (0.15 + 0.7 * (1 - v)))))

        def Pf(u, v):
            t = u
            k = 0.45 + 0.55 * math.sin(math.pi * (0.08 + 0.84 * t))
            th = math.pi * (0.1 + 1.6 * v)
            return axis_f(t) + rf * k * (0.55 + 0.45 * v) * (math.cos(th) * up + math.sin(th) * side)
        uv2f = s.emblem_uv(T, C, Th, Pk) if emblem else None
        patch(sail, nu, nv, P, Pf, s.sch['cloth'], uv=lambda u, v: (u, v),
              uv2=(lambda u, v: uv2f(flat(u, v))) if uv2f else None, smooth=True)
        _flip(sail)
        if topsail is not None:   # gaff topsail: luff up the topmast, clew at the gaff peak
            head = topsail
            Tt = Th + Vector((0, 0, 0.25 * S))

            def Pt(u, v):
                return Tt.lerp(Pk, u).lerp(head, v) + side * (belly * 0.5 * blen * math.sin(math.pi * u) * (1 - v))

            def Ptf(u, v):
                th = math.pi * (0.2 + 1.4 * v)
                return axis_f(0.2 + 0.5 * u) + rf * 0.6 * (math.cos(th) * up + math.sin(th) * side)
            g0 = len(sail.f)
            patch(sail, 2, 2, Pt, Ptf, s.sch['cloth'], uv=lambda u, v: (u, v), uv2=(lambda u, v: (-4.0, -4.0)) if uv2f else None,
                  smooth=True, tri_head=True)
            _flip(sail, g0)
        # gaff / yard: lowered onto the furled bundle
        gf0 = axis_f(0.0) + up * (rf * 1.1) + ad * (-0.02 * blen)
        gf1 = gf0 + ad * gaff_len * 0.97
        g_back = Th + (Th - Pk).normalized() * (lug_fwd * 0.9 if lug_fwd > 0 else 0.0)
        rod(gaff, g_back, Pk, rb * 0.8, s.sch['spar'], 5, pf=gf0 + (gf0 - gf1).normalized() * (lug_fwd * 0.9), qf=gf1, r2=rb * 0.6)
        # cover: collapsed inside the boom when set, a fat brand tube over the bundle when furled
        ts = [0.0, 0.06, 0.5, 0.88, 0.95]
        ks = [0.55, 1.0, 1.05, 0.95, 0.5]
        segs = 6 if s.L >= 10 else 5
        rings = []
        for t, kk in zip(ts, ks):
            c_set = G + ad * (blen * (0.02 + 0.93 * t))
            c_f = axis_f(min(1.0, t * 1.02)) + up * 0.02
            rc = (rf * 1.45 + 0.04) * kk
            ring = []
            for j in range(segs):
                a = 2 * math.pi * j / segs
                d = math.cos(a) * up + math.sin(a) * side
                ring.append((cover.vert(c_set + d * rb * 0.4, c_f + d * rc + up * (0.15 * rc if math.cos(a) > 0 else 0)), math.cos(a)))
            rings.append(ring)
        for r0, r1 in zip(rings, rings[1:]):
            for j in range(segs):
                j2 = (j + 1) % segs
                shade = 0.80 + 0.2 * max(0.0, (r0[j][1] + r0[j2][1]) / 2)
                cover.face((r0[j][0], r0[j2][0], r1[j2][0], r1[j][0]), (shade, shade, shade), 0, smooth=True, jitter=0.0)
        cover.face([v for v, _ in rings[-1]], (0.85, 0.85, 0.85), jitter=0.0)
        cover.face([v for v, _ in rings[0]][::-1], (0.85, 0.85, 0.85), jitter=0.0)
        # topping lift (rides with the boom: its top is on the mast axis)
        top = s.tops[-1] if s.tops else Th
        mt = Vector((mx, 0, min(top.z, throat_z + gaff_len * 0.9)))
        line(boom, mt - G * 0 + Vector((0, 0, 0)), E + Vector((0, 0, rb)), s.rope * 0.8)
        s.groups.append(dict(name=name, G=G, boom=boom, gaff=gaff, sail=sail, cover=cover,
                             sail_name=sail_name or ('sail_main' if emblem else 'sail' + name[4:]), E=E, Pk=Pk, Th=Th))
        return G, E, Th, Pk

    def headsail(s, tack, head, clew_x, clew_z, belly=0.06, nu=3, nv=3):
        """Jib/staysail: triangle on its stay, roller-furled along the stay when furl = 1."""
        S = s.S
        side = Vector((0, 1, 0))
        Cl = Vector((clew_x, 0.06 * s.H.B, clew_z))
        a, b = basis(head - tack)
        rj = max(0.07, 0.009 * s.L + 0.04)

        def P(u, v):
            return tack.lerp(Cl, u).lerp(head, v) + side * (belly * (head - tack).length * math.sin(math.pi * u) * (1 - v) ** 0.7)

        def Pf(u, v):
            th = 2 * math.pi * 0.85 * u
            rr = rj * (1.0 - 0.75 * v) * (0.45 + 0.55 * (1 - u))
            return tack.lerp(head, 0.03 + 0.94 * v) + rr * (math.cos(th) * a + math.sin(th) * b)
        g0 = len(s.jib.f)
        patch(s.jib, nu, nv, P, Pf, s.sch['cloth'], uv=lambda u, v: (u, v), uv2=lambda u, v: (-4.0, -4.0), smooth=True, tri_head=True)
        _flip(s.jib, g0)
        line(s.rigging, tack, head + (head - tack).normalized() * 0.1, s.rope)
        if s.jib_tack is None or tack.x > s.jib_tack.x:
            s.jib_tack = tack; s.jib_axis = (head - tack).normalized()

    BRACE = math.radians(30)

    def _brace(s, mx):
        """Square yards are braced (for wind from starboard): rotate about the mast axis."""
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        c = Vector((mx, 0, 0))
        return lambda p: c + R_ @ (Vector(p) - c)

    def square(s, mb, mx, zy, span, zb, span_b, emblem=False, belly=0.06, nu=3, nv=2):
        """Square sail hung from a braced yard at zy; furled = rolled up onto the yard."""
        S = s.S
        br = s._brace(mx)
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        fwd = R_ @ Vector((1, 0, 0)); up = Vector((0, 0, 1))
        x0 = mx + s.r_mast * 0.9
        rf = max(0.14, 0.11 * (zy - zb) ** 0.7 + 0.06 * S)

        def flat(u, v):
            wv = span_b + (span - span_b) * v
            return br(Vector((x0, -wv / 2 + wv * u, zb + (zy - zb) * v)))

        def P(u, v):
            return flat(u, v) + fwd * (belly * span * math.sin(math.pi * u) * math.sin(math.pi * (0.2 + 0.65 * (1 - v))))

        def Pf(u, v):
            th = math.pi * (0.1 + 1.7 * (1 - v))      # bundle rolled on top of / just forward of the yard
            k = 0.55 + 0.45 * math.sin(math.pi * (0.1 + 0.8 * u))
            c = br(Vector((x0 + rf * 0.3, (-span / 2 + span * u) * 0.9, zy + rf * 0.55)))
            return c + rf * k * (0.6 + 0.4 * v) * (math.cos(th) * fwd + math.sin(th) * up)
        uv2f = None
        if emblem:
            uv2f = s.emblem_uv(flat(0, 0), flat(1, 0), flat(0, 1), flat(1, 1), square=True)
        patch(mb, nu, nv, P, Pf, s.sch['cloth'], uv=lambda u, v: (u, v), uv2=(lambda u, v: uv2f(flat(u, v))) if uv2f else (lambda u, v: (-4.0, -4.0)),
              smooth=True)

    def yard(s, mx, z, span, r):
        br = s._brace(mx)
        c = Vector((mx + s.r_mast * 0.6, 0, z))
        for sd in (-1, 1):
            rod(s.yards, br(c), br(c + Vector((0, sd * span / 2, 0))), r, s.sch['spar'], 4, r2=r * 0.55)

    # -------------------------------------------------- flags
    def flags(s, pennant_tops, ensign=True):
        S = s.S
        for (top, plen) in pennant_tops:
            ph = max(0.26, 0.13 * plen)
            a = s.flag.vert(top + Vector((0, 0, 0.02)))
            b = s.flag.vert(top + Vector((0, 0, -ph)))
            c = s.flag.vert(top + Vector((-plen, 0.0, -ph * 0.6)))
            g0 = len(s.flag.f)
            s.flag.face((a, b, c), PAL['brand_default'], 0, 1.0, uv=[(0, 1), (0, 0), (1, 0.5)], jitter=0.0)
            s.flag.backface(g0)
        if not ensign:
            return
        st = s.H.stern()
        fh = 0.055 * s.L + 0.32; fw = fh * 1.5
        base = st + Vector((0.12 * S + 0.1, 0, -0.05))
        topp = base + Vector((-0.10 * fh, 0, fh * 1.55 + 0.25))
        rod(s.mast, base, topp, max(0.03, 0.012 * s.L), s.sch['spar'], 4)
        nu, nv, cf = ENSIGN[s.family]
        hoist0 = topp - Vector((0, 0, fh + 0.02))

        def P(u, v):
            return hoist0 + Vector((-fw * u, 0.04 * fw * math.sin(math.pi * u * 1.5), fh * v - 0.06 * fh * u))
        grid = [[s.flag.vert(P(j / nu, i / nv)) for j in range(nu + 1)] for i in range(nv + 1)]
        g0 = len(s.flag.f)
        for i in range(nv):
            for j in range(nu):
                q = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
                uvs = [(jj / nu, ii / nv) for ii, jj in q]
                s.flag.face([grid[ii][jj] for ii, jj in q], cf(j, i), 0, uv=uvs, jitter=0.02)
        s.flag.backface(g0)

    # -------------------------------------------------- deck furniture helpers
    def house(s, x0, x1, wfrac, h, col=None, roof=None, crown=0.05):
        H = s.H
        z = H.deck((x0 + x1) / 2)
        w = min(H.half(x0), H.half(x1)) * 2 * wfrac
        box2(s.deck, x0, -w / 2, z - 0.1, x1, w / 2, z + h, col or s.sch['house'], PT['boards'], skip=('-z',))
        s.deck.paint = 7.0
        box2(s.deck, x0 - 0.04 * s.S, -w / 2 - 0.04 * s.S, z + h, x1 + 0.04 * s.S, w / 2 + 0.04 * s.S, z + h + 0.07 * s.S + crown,
             roof or s.sch['roof'], PT['planks_y'], skip=('-z',))
        s.deck.paint = 0.0

    def hatch(s, x, l, w, h, col=None):
        z = s.H.deck(x)
        box2(s.deck, x - l / 2, -w / 2, z - 0.05, x + l / 2, w / 2, z + h, col or s.sch['house'], PT['boards'], skip=('-z',))

    def tiller(s):
        st = s.H.stern()
        z = s.H.deck(st.x + 0.3) + 0.25 * s.S
        rod(s.deck, Vector((st.x + 0.15, 0, z)), Vector((st.x + 0.12 * s.L, 0, z + 0.1 * s.S)), max(0.03, 0.012 * s.L), PAL['varnish'], 4)

    def crates(s, xs, ycol=None):
        for (x, y, sz, col) in xs:
            z = s.H.deck(x)
            box(s.deck, (x, y, z + sz / 2 - 0.02), (sz, sz, sz), col, PT['boards'], skip=('-z',), jitter=0.1)

    # -------------------------------------------------- node tree
    def build_nodes(s, coll=None):
        root = empty(s.id, coll=coll)
        heel = empty('_heel', parent=root, coll=coll)
        objs = {}

        def mk(mb, name, mat, parent=heel, origin=(0, 0, 0), local=None, props=None):
            if not mb.f:
                return None
            o = to_object(mb, name, mat, parent=parent, origin=origin, coll=coll, props=props)
            if local is not None:
                o.location = local
            objs[name] = o
            return o
        mk(s.hull, 'hull', 'hb_opaque')
        mk(s.deck, 'deck', 'hb_opaque')
        mk(s.mast, 'mast', 'hb_opaque')
        mk(s.rigging, 'rigging', 'hb_opaque')
        mk(s.yards, 'yards', 'hb_opaque')
        for g in s.groups:
            sfx = g['name'][4:]           # '' or '_2'
            b = empty(g['name'], g['G'], parent=heel, coll=coll)          # pivot at the gooseneck
            mk(g['boom'], g['name'] + '_spar', 'hb_opaque', parent=b, origin=g['G'], local=(0, 0, 0))
            mk(g['gaff'], 'gaff' + sfx, 'hb_opaque', parent=b, origin=g['G'], local=(0, 0, 0))
            mk(g['sail'], g['sail_name'], 'hb_sail', parent=b, origin=g['G'], local=(0, 0, 0))
            mk(g['cover'], 'sail_cover' + sfx, 'hb_cover', parent=b, origin=g['G'], local=(0, 0, 0))
        mk(s.main_sq, 'sail_main', 'hb_sail')
        if s.jib.f:
            ax = s.jib_axis
            mk(s.jib, 'sail_jib', 'hb_sail', origin=s.jib_tack, props={'stay_axis': [ax.x, ax.z, -ax.y]})
        mk(s.extra, 'sail_extra', 'hb_sail')
        mk(s.flag, 'flag', 'hb_opaque')
        for k, p in s.empties.items():
            empty(k, p, parent=root if k == 'wake_origin' else heel, coll=coll)
        L, B = s.L, s.H.B
        root['family'] = s.family; root['class'] = s.cls; root['rig'] = s.rig
        root['loa_m'] = round(L, 2); root['beam_m'] = round(B, 2)
        return root, objs


def _flip(mb, start=0):
    """Reverse the winding of faces from `start` on (sails face starboard / ahead)."""
    for f in mb.f[start:]:
        f['i'] = f['i'][::-1]; f['uv'] = f['uv'][::-1]; f['uv2'] = f['uv2'][::-1]


# =================================================================== the boats
def build_boat(vid, family, rig, cls, sch, coll=None, seed=0, n_sec=None):
    R = Rig(vid, family, rig, cls, sch, seed)
    H, L, S = R.H, R.L, R.S
    n = n_sec or SECTIONS[cls]
    loft(R.hull, H, sch, n, band=(rig == 'ship'))
    st, bw = H.stern(), H.bow()
    dz = lambda x: H.deck(x)
    pennants = []

    if rig == 'cat':
        mx = H.x0 + 0.34 * L
        _, top = R.mast_at(mx, 1.18 * L)
        R.fore_aft('boom', mx, dz(mx) + 0.55, 0.86 * L, dz(mx) + 0.78 * L, 0.5 * L, 26, emblem=True, belly=0.07, nu=4, nv=3)
        R.shrouds(top, mx, 1, 0.82)
        line(R.rigging, top - Vector((0, 0, 0.1)), bw + Vector((-0.05, 0, 0)), R.rope)       # forestay to the stem head
        R.house(H.x0 + 0.04 * L, mx + 0.12 * L, 0.62, 0.32, roof=PAL['cream'])
        box2(R.deck, st.x + 0.15 * L, -H.B * 0.3, dz(0) - 0.05, H.x0 + 0.04 * L, -H.B * 0.27, dz(0) + 0.22, sch['cap'], skip=('-z',))
        box2(R.deck, st.x + 0.15 * L, H.B * 0.27, dz(0) - 0.05, H.x0 + 0.04 * L, H.B * 0.3, dz(0) + 0.22, sch['cap'], skip=('-z',))
        # barn-door rudder
        box2(R.hull, st.x - 0.1, -0.05, H.zk(-1.0) * 0.7, st.x + 0.04, 0.05, st.z + 0.12, sch['cap'], skip=('+x',))
        R.tiller()
        pennants.append((top, 1.2 + 0.12 * L))
        ensign = False
    elif rig in ('sloop', 'cutter', 'work'):
        mxf = {'sloop': 0.13, 'cutter': 0.06, 'work': 0.17}[rig]
        mx = H.x0 + mxf * L
        mh = {'sloop': 1.28, 'cutter': 1.34, 'work': 1.02}[rig] * L
        _, top = R.mast_at(mx, mh, parts=2 if rig == 'cutter' else 1)
        blen = {'sloop': 0.56, 'cutter': 0.66, 'work': 0.6}[rig] * L
        blen = min(blen, mx - st.x - 0.06 * L) if rig != 'cutter' else blen
        thz = dz(mx) + mh * (0.66 if rig == 'cutter' else 0.74)
        glen = blen * (0.68 if rig == 'cutter' else 0.64)
        tops = top - Vector((0, 0, 0.15)) if rig == 'cutter' else None
        R.fore_aft('boom', mx, dz(mx) + 0.42 + 0.06 * L, blen, thz, glen, 34 if rig != 'work' else 30, emblem=True,
                   topsail=tops, nu=4, nv=4 if L >= 10 else 3)
        R.shrouds(top, mx, 2 if L >= 13 else 1, 0.88)
        if rig == 'work':
            tack = bw + Vector((-0.02 * L, 0, 0.0))
            R.headsail(tack, top.lerp(Vector((mx, 0, dz(mx))), 0.2), mx - 0.04 * L, dz(mx) + 0.1 * L)
            line(R.rigging, top - Vector((0, 0, 0.2)), st + Vector((0.25, 0, 0)), R.rope)
            R.house(st.x + 0.12 * L, st.x + 0.32 * L, 0.6, 0.85 * S + 0.25)          # wheel shelter
            R.hatch(H.x0 + 0.02 * L, 0.14 * L, H.B * 0.4, 0.2)
            R.crates([(mx - 0.08 * L, H.B * 0.18, 0.22 * S + 0.18, PAL['timber']), (mx - 0.13 * L, -H.B * 0.15, 0.2 * S + 0.16, PAL['flag_red'])])
            R.tiller()
            ensign = cls != 'skiff'
            if cls == 'skiff':
                R.r_mast *= 1.0
        else:
            bs = R.bowsprit(L * (0.24 if rig == 'sloop' else 0.34), 0.1)
            R.headsail(bs, top.lerp(Vector((mx, 0, dz(mx))), 0.08 if rig == 'sloop' else 0.0), mx + 0.03 * L, dz(mx) + 0.1 * L)
            if rig == 'cutter':
                R.headsail(bw + Vector((-0.03 * L, 0, 0)), top.lerp(Vector((mx, 0, dz(mx))), 0.33), mx - 0.02 * L, dz(mx) + 0.08 * L)
            line(R.rigging, top - Vector((0, 0, 0.2)), st + Vector((0.3, 0, 0.05)), R.rope)        # backstay
            R.house(H.x0 - 0.2 * L, mx - 0.03 * L, 0.6, 0.34 * S + 0.18)
            R.hatch(mx + 0.1 * L, 0.08 * L, H.B * 0.28, 0.16 * S + 0.08)
            box2(R.deck, st.x + 0.1 * L, -H.B * 0.28, dz(0) - 0.05, H.x0 - 0.2 * L, -H.B * 0.25, dz(0) + 0.16 * S + 0.08, sch['cap'], skip=('-z',))
            box2(R.deck, st.x + 0.1 * L, H.B * 0.25, dz(0) - 0.05, H.x0 - 0.2 * L, H.B * 0.28, dz(0) + 0.16 * S + 0.08, sch['cap'], skip=('-z',))
            R.tiller()
            ensign = True
        pennants.append((top, 1.2 + 0.13 * L))
    elif rig == 'schooner':
        fx, mx = H.x0 + 0.17 * L, H.x0 - 0.1 * L
        _, ft = R.mast_at(fx, 1.0 * L, parts=2)
        _, mt = R.mast_at(mx, 1.1 * L, parts=2)
        R.fore_aft('boom_2', fx, dz(fx) + 0.9, (fx - mx) * 0.88, dz(fx) + 0.62 * L, 0.2 * L, 30, sail_name='sail_2',
                   topsail=ft - Vector((0, 0, 0.2)), nu=3, nv=3)
        blen = min(0.42 * L, mx - st.x - 0.02 * L)
        R.fore_aft('boom', mx, dz(mx) + 1.0, blen, dz(mx) + 0.68 * L, 0.3 * L, 30, emblem=True, topsail=mt - Vector((0, 0, 0.2)), nu=4, nv=4)
        bs = R.bowsprit(0.27 * L, 0.12)
        R.headsail(bs, ft.lerp(Vector((fx, 0, dz(fx))), 0.2), fx + 0.04 * L, dz(fx) + 0.1 * L)
        R.headsail(bw + Vector((-0.04 * L, 0, 0)), ft.lerp(Vector((fx, 0, dz(fx))), 0.42), fx + 0.01 * L, dz(fx) + 0.07 * L, nu=2, nv=2)
        for x, t in ((fx, ft), (mx, mt)):
            R.shrouds(t, x, 2, 0.6)
        line(R.rigging, mt - Vector((0, 0, 0.3)), ft.lerp(Vector((fx, 0, dz(fx))), 0.38), R.rope)
        line(R.rigging, mt - Vector((0, 0, 0.3)), st + Vector((0.3, 0, 0)), R.rope)
        R.house(st.x + 0.08 * L, st.x + 0.22 * L, 0.55, 0.5 * S + 0.1)
        R.hatch(H.x0 + 0.02 * L, 0.08 * L, H.B * 0.35, 0.3 * S)
        R.hatch(H.x0 + 0.3 * L, 0.05 * L, H.B * 0.25, 0.25 * S)
        R.crates([(H.x0 + 0.06 * L, H.B * 0.27, 0.42 * S, PAL['timber']), (H.x0 + 0.1 * L, H.B * 0.27, 0.36 * S, PAL['timber'])])
        R.tiller()
        pennants += [(mt, 1.3 + 0.13 * L), (ft, 1.0 + 0.09 * L)]
        ensign = True
    elif rig in ('ship', 'brig'):
        if rig == 'ship':
            masts = [(H.x0 + 0.27 * L, 0.94 * L), (H.x0 + 0.0 * L, 1.04 * L), (H.x0 - 0.25 * L, 0.82 * L)]
        else:
            masts = [(H.x0 + 0.2 * L, 1.0 * L), (H.x0 - 0.12 * L, 1.08 * L)]
        tops = []
        for k, (x, h) in enumerate(masts):
            _, t = R.mast_at(x, h, R.r_mast * (1.0 if k != len(masts) - 1 or rig == 'brig' else 0.85), parts=3)
            tops.append(t)
        B = H.B
        big = rig == 'ship' or cls == 'large'
        for k, ((x, h), t) in enumerate(zip(masts, tops)):
            z0 = dz(x)
            hh = t.z - z0
            # tops + crosstrees
            box(R.mast, (x, 0, z0 + hh * 0.5), (1.1 * S, 1.9 * S, 0.14 * S), sch['spar'], skip=('-z',))
            if rig == 'ship':
                fr = [(0.27, 0.48, 1.95, 2.1), (0.52, 0.67, 1.55, 1.8), (0.71, 0.84, 1.15, 1.4)] if k < 2 else \
                     [(0.5, 0.66, 1.35, 1.55), (0.7, 0.83, 1.0, 1.25)]
            elif k == 0:
                fr = [(0.27, 0.48, 1.75, 1.9), (0.52, 0.68, 1.4, 1.65), (0.72, 0.85, 1.05, 1.3)]
            else:
                fr = [(0.52, 0.68, 1.35, 1.55), (0.72, 0.85, 1.0, 1.25)] if big else [(0.6, 0.82, 1.2, 1.45)]
            for yi, (fb_, fy, sp, spb) in enumerate(fr):
                zy = z0 + hh * fy; zb = z0 + hh * fb_ + 0.15
                span = B * sp; span_b = B * spb
                R.yard(x, zy, span, R.r_mast * 0.5)
                is_main = rig == 'ship' and k == 1 and yi == 0
                R.square(R.main_sq if is_main else R.extra, x, zy, span, zb, span_b, emblem=is_main, nu=3, nv=2 if not is_main else 3)
            R.shrouds(t, x, 2 if rig == 'ship' else 1, 0.5)
            pennants.append((t, (1.5 + 0.14 * L) * (1.0 if k == 1 else 0.7)))
        # spanker / brig main gaff on the aftermost mast
        ax_, ah = masts[-1]
        at = tops[-1]
        blen = min(0.3 * L if rig == 'ship' else 0.4 * L, ax_ - st.x + 0.04 * L)
        zbm = dz(ax_) + (1.6 if rig == 'ship' else 1.2) * S
        R.fore_aft('boom', ax_, zbm, blen, dz(ax_) + (at.z - dz(ax_)) * (0.52 if rig == 'ship' else 0.5), blen * 0.62, 26,
                   emblem=(rig == 'brig'), sail_name='sail_spanker' if rig == 'ship' else 'sail_main', nu=3, nv=3 if rig == 'ship' else 4)
        bs = R.bowsprit(0.3 * L, 0.2)
        f_x, _ = masts[0]
        ft = tops[0]
        fz = dz(f_x)
        R.headsail(bs, Vector((f_x, 0, fz + (ft.z - fz) * 0.66)), f_x + 0.07 * L, fz + 0.14 * L)
        R.headsail(bs.lerp(bw, 0.55), Vector((f_x, 0, fz + (ft.z - fz) * 0.48)), f_x + 0.04 * L, fz + 0.1 * L, nu=2, nv=2)
        for a_, b_ in zip(tops[1:], tops[:-1]):
            line(R.rigging, a_ - Vector((0, 0, 0.4)), Vector((b_.x, 0, b_.z * 0.82)), R.rope)
        # deck: poop house, midships house, hatches, ship's boat / cargo
        if rig == 'ship':
            R.house(st.x + 0.06 * L, st.x + 0.2 * L, 0.66, 1.15 * S)
            R.house(H.x0 + 0.08 * L, H.x0 + 0.17 * L, 0.42, 0.9 * S)
            R.hatch(H.x0 + 0.38 * L, 0.05 * L, B * 0.35, 0.4 * S, PAL['timber'])
            # ship's boat on chocks, upside down, brand bottom
            bt = MB()
            Hb = Hull(0.16 * L, FORMS['dinghy'])
            loft(bt, Hb, SCH(top='hull_white', stripe='hull_white', cap='varnish', bottom='hull_white', boot='brand_default'), 4, paint=False)
            for i, (p, pf) in enumerate(zip(bt.v, bt.vf)):
                q = Vector((p.x, -p.y, -p.z)) + Vector((H.x0 - 0.12 * L, 0, dz(H.x0 - 0.12 * L) + 0.75 * S))
                bt.v[i] = q; bt.vf[i] = q.copy()
            R.deck.extend(bt)
            # painted gunports on the white band
            u_ports = [-0.62 + k * 0.155 for k in range(9)]
            for u in u_ports:
                pr = H.profile(u, band=True)
                zc = (pr[5][2] + pr[6][2]) / 2 if H.bh > 0 else 0
                w = H.w(u) * 0.99 + 0.025
                x = H.x(u, zc)
                hs = 0.3 * S
                for sd in (-1, 1):
                    a_ = R.hull.vert((x - hs, sd * w, zc - hs * 0.7)); b_ = R.hull.vert((x + hs, sd * w, zc - hs * 0.7))
                    c_ = R.hull.vert((x + hs, sd * w, zc + hs * 0.7)); d_ = R.hull.vert((x - hs, sd * w, zc + hs * 0.7))
                    R.hull.face((a_, b_, c_, d_) if sd < 0 else (a_, d_, c_, b_), PAL['hull_black'], 0, jitter=0.0)
            # figurehead + stern gilt
            box(R.hull, bw + Vector((-0.3 * S, 0, -0.5 * S)), (0.7 * S, 0.3 * S, 0.5 * S), PAL['gilt'], skip=('-x',))
        else:
            R.house(st.x + 0.06 * L, st.x + 0.17 * L, 0.6, 0.9 * S)
            R.hatch(H.x0 - 0.0 * L, 0.09 * L, B * 0.4, 0.32 * S, PAL['timber'])
            R.hatch(H.x0 + 0.32 * L, 0.06 * L, B * 0.32, 0.28 * S, PAL['timber'])
            # deep-laden: cargo on deck (crates + a gilt-banded chest), capstan
            R.crates([(H.x0 + 0.08 * L, B * 0.22, 0.5 * S, PAL['timber']), (H.x0 + 0.08 * L, -B * 0.2, 0.44 * S, PAL['timber']),
                      (H.x0 - 0.06 * L, B * 0.22, 0.4 * S, PAL['gilt'])] + ([(H.x0 + 0.13 * L, B * 0.2, 0.4 * S, PAL['timber_dark'])] if big else []))
            # gilded stern panel + figurehead
            box(R.hull, st + Vector((0.08 * S, 0, -0.35 * S)), (0.12 * S, H.w(-1) * 1.3, 0.55 * S), PAL['gilt'], skip=('+x',))
            box(R.hull, bw + Vector((-0.3 * S, 0, -0.45 * S)), (0.6 * S, 0.28 * S, 0.45 * S), PAL['gilt'], skip=('-x',))
        line(R.rigging, tops[-1] - Vector((0, 0, 0.3)), st + Vector((0.4, 0, 0)), R.rope)
        ensign = True
    elif rig == 'botter':
        mx = H.x0 + 0.17 * L
        _, top = R.mast_at(mx, 0.98 * L, rake=math.radians(-3))
        blen = min(0.62 * L, mx - st.x + 0.02 * L)
        R.fore_aft('boom', mx, dz(mx) + 0.38 + 0.05 * L, blen, dz(mx) + 0.58 * L, 0.3 * L, 58, emblem=True, belly=0.08, nu=4,
                   nv=4 if L >= 10 else 3)
        R.headsail(bw + Vector((-0.04 * L, 0, 0)), top.lerp(Vector((mx, 0, dz(mx))), 0.22), mx + 0.02 * L, dz(mx) + 0.09 * L)
        R.shrouds(top, mx, 1, 0.82)
        # curved (bent) gaff look: a short sprit at the masthead is enough at this scale; wimpel pennant
        # leeboards (both raised, hung on the rail), fan shaped
        for sd in (-1, 1):
            x0 = H.x0 + 0.06 * L
            w0 = H.half(x0) + 0.05
            zt0 = H.zt(H.u_at(x0)) + 0.02
            pts = [(x0 + 0.06 * L, zt0 + 0.04), (x0 - 0.06 * L, zt0 + 0.04), (x0 - 0.15 * L, zt0 - 0.6 * H.fb), (x0 - 0.1 * L, zt0 - 1.15 * H.fb),
                   (x0 + 0.06 * L, zt0 - 1.3 * H.fb), (x0 + 0.15 * L, zt0 - 0.95 * H.fb)]
            th = max(0.05, 0.008 * L)
            outer = [R.hull.vert((x, sd * (w0 + th), z)) for x, z in pts]
            inner = [R.hull.vert((x, sd * w0, z)) for x, z in pts]
            R.hull.face(outer if sd < 0 else outer[::-1], PAL['varnish'], PT['boards'])
            for k in range(len(pts)):
                k2 = (k + 1) % len(pts)
                q = (outer[k], inner[k], inner[k2], outer[k2])
                R.hull.face(q if sd < 0 else q[::-1], sch['stripe'])
        # big rudder + tiller, low aft cabin, fish well
        box2(R.hull, st.x - 0.14 * S, -0.06 * S - 0.04, H.zk(-1.0), st.x + 0.05, 0.06 * S + 0.04, st.z + 0.15, sch['stripe'], skip=('+x',))
        R.house(st.x + 0.1 * L, st.x + 0.28 * L, 0.55, 0.28 * S + 0.2)
        R.hatch(H.x0 - 0.02 * L, 0.12 * L, H.B * 0.45, 0.12 * S + 0.06, sch['stripe'])
        R.tiller()
        pennants.append((top, 1.4 + 0.12 * L))       # the long Dutch 'wimpel'
        ensign = True
    elif rig == 'lugger':
        fx, mzx = H.x0 + 0.24 * L, H.x0 - 0.3 * L
        _, ft = R.mast_at(fx, 0.9 * L, rake=math.radians(4))
        _, mt = R.mast_at(mzx, 0.66 * L, rake=math.radians(6))
        # main (fore) lug with a boom: emblem; mizzen lug sheeted over the stern to a bumkin
        blen = (fx - mzx) * 0.95
        R.fore_aft('boom', fx, dz(fx) + 0.35 + 0.04 * L, blen, dz(fx) + 0.66 * L, 0.5 * L, 24, emblem=True, lug_fwd=0.12 * L, belly=0.08,
                   nu=4, nv=4 if L >= 10 else 3)
        blen2 = min(0.36 * L, mzx - st.x + 0.12 * L)
        R.fore_aft('boom_2', mzx, dz(mzx) + 0.4 + 0.04 * L, blen2, dz(mzx) + 0.48 * L, 0.36 * L, 26, sail_name='sail_2', lug_fwd=0.08 * L,
                   nu=3, nv=3)
        bs = R.bowsprit(0.22 * L, 0.05)
        R.headsail(bs, ft.lerp(Vector((fx, 0, dz(fx))), 0.15), fx + 0.06 * L, dz(fx) + 0.07 * L, nu=2, nv=3)
        rod(R.mast, st + Vector((0.5, 0, 0)), st + Vector((-0.18 * L, 0, 0.1)), R.r_mast * 0.5, sch['spar'], 4)   # bumkin
        R.shrouds(ft, fx, 1, 0.8)
        R.shrouds(mt, mzx, 1, 0.8)
        R.hatch(H.x0 + 0.02 * L, 0.18 * L, H.B * 0.45, 0.14 * S + 0.06, PAL['timber'])
        # nets heap + baskets
        box(R.deck, (H.x0 - 0.1 * L, 0, dz(H.x0) + 0.1 * S + 0.08), (0.14 * L, H.B * 0.42, 0.2 * S + 0.16), PAL['door_green'], 0, skip=('-z',))
        R.crates([(H.x0 - 0.2 * L, H.B * 0.16, 0.28 * S + 0.12, PAL['wall_ochre'])])
        R.tiller()
        pennants.append((ft, 1.2 + 0.13 * L))
        ensign = True
    R.flags(pennants, ensign)
    # empties
    main_t = max(R.tops, key=lambda t: t.z)
    u_b, u_s = 0.86, -0.9
    R.empties['bow_cleat'] = Vector((H.x(u_b, H.zt(u_b)) - 0.02 * L, 0, H.zt(u_b)))
    R.empties['stern_cleat'] = Vector((H.x(u_s, H.zt(u_s)) + 0.02 * L, 0, H.zt(u_s)))
    R.empties['masthead_light'] = main_t + Vector((0, 0, 0.25 + R.r_mast))
    R.empties['wake_origin'] = Vector((st.x, 0, 0))
    root, objs = R.build_nodes(coll)
    return root, objs, R


# =================================================================== low LOD (single mesh, <= 150 tris)
def build_lod(vid, family, rig, cls, sch, coll=None):
    """Far-zoom silhouette: 4-span hull with brand boot-top, masts as 3-sided prisms, sails as two-sided
    flat polygons that collapse (morph furl) onto their spars, plus a brand cover strip that grows when furled."""
    L = CLASS_LOA[cls]
    H = Hull(L, FORMS[rig])
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
    dz = H.deck
    cloth = sch['cloth']

    def mast(x, h):
        a = Vector((x, 0, dz(x))); b = Vector((x, 0, dz(x) + h))
        rod(mb, a, b, max(0.11, 0.011 * L + 0.05), sch['spar'], 3, r2=max(0.08, 0.007 * L + 0.04), smooth=False)
        return b

    def gaff(x, zb, blen, thz, glen, deg, cover=True):
        G = Vector((x, 0, zb)); E = G + Vector((-blen, 0, 0))
        Th = Vector((x, 0, thz)); Pk = Th + Vector((-math.cos(math.radians(deg)) * glen, 0, math.sin(math.radians(deg)) * glen))
        tri2([G, E, Pk, Th], [G + Vector((0, 0, 0.15)), E + Vector((0, 0, 0.15)), G.lerp(E, 0.6) + Vector((0, 0, 0.2)), G + Vector((0, 0, 0.2))], cloth)
        if cover:
            r = max(0.15, 0.03 * blen + 0.08)
            a = [G + Vector((0, 0, 0.05)), E + Vector((0.05 * blen, 0, 0.05)), E + Vector((0.05 * blen, 0, 0.05)), G + Vector((0, 0, 0.05))]
            af = [G + Vector((-0.05 * blen, -r, 0.05)), E + Vector((0.06 * blen, -r, 0.05)), E + Vector((0.06 * blen, 0, 0.05 + 2 * r)), G + Vector((-0.05 * blen, 0, 0.05 + 2 * r))]
            bf = [G + Vector((-0.05 * blen, r, 0.05)), E + Vector((0.06 * blen, r, 0.05)), E + Vector((0.06 * blen, 0, 0.05 + 2 * r)), G + Vector((-0.05 * blen, 0, 0.05 + 2 * r))]
            for ff in (af, bf):
                tri2(a, ff, PAL['brand_default'], 1.0, paint=0.0)

    def jib(tack, head, cx, cz):
        Cl = Vector((cx, 0, cz))
        tri2([tack, Cl, head], [tack, tack.lerp(head, 0.1) + Vector((0, 0, 0.05)), head], cloth)

    Rb = Matrix.Rotation(Rig.BRACE, 3, 'Z')

    def sq(x, z0, z1, wb, wt):
        b_ = lambda p: Vector((x, 0, 0)) + Rb @ (p - Vector((x, 0, 0)))
        tri2([b_(Vector((x, -wb / 2, z0))), b_(Vector((x, wb / 2, z0))), b_(Vector((x, wt / 2, z1))), b_(Vector((x, -wt / 2, z1)))],
             [b_(Vector((x, -wt / 2, z1 - 0.4))), b_(Vector((x, wt / 2, z1 - 0.4))), b_(Vector((x, wt / 2, z1))), b_(Vector((x, -wt / 2, z1)))], cloth)
    st, bw = H.stern(), H.bow()
    mb.paint = 8.0    # the rig (spars + furled cloth; not the brand covers): the runtime lets it recede far away
    if rig == 'cat':
        mx = H.x0 + 0.34 * L; t = mast(mx, 1.18 * L)
        gaff(mx, dz(mx) + 0.55, 0.86 * L, dz(mx) + 0.78 * L, 0.5 * L, 26)
    elif rig in ('sloop', 'cutter', 'work', 'botter'):
        mxf = {'sloop': 0.13, 'cutter': 0.06, 'work': 0.17, 'botter': 0.17}[rig]
        mx = H.x0 + mxf * L
        mh = {'sloop': 1.28, 'cutter': 1.34, 'work': 1.02, 'botter': 0.98}[rig] * L
        t = mast(mx, mh)
        blen = min({'sloop': 0.56, 'cutter': 0.66, 'work': 0.6, 'botter': 0.62}[rig] * L, mx - st.x + 0.02 * L)
        thz = dz(mx) + mh * (0.66 if rig == 'cutter' else 0.74 if rig != 'botter' else 0.59)
        gaff(mx, dz(mx) + 0.42 + 0.06 * L, blen, thz, blen * 0.64 if rig != 'botter' else 0.3 * L, 34 if rig != 'botter' else 58)
        tack = bw + Vector((0.24 * L, 0, 0.02 * L)) if rig in ('sloop', 'cutter') else bw
        jib(tack, t - Vector((0, 0, 0.1 * mh)), mx + 0.03 * L, dz(mx) + 0.1 * L)
    elif rig == 'schooner':
        fx, mx = H.x0 + 0.17 * L, H.x0 - 0.1 * L
        ft = mast(fx, 1.0 * L); mt = mast(mx, 1.1 * L)
        gaff(fx, dz(fx) + 0.9, (fx - mx) * 0.88, dz(fx) + 0.62 * L, 0.2 * L, 30, cover=False)
        gaff(mx, dz(mx) + 1.0, min(0.42 * L, mx - st.x), dz(mx) + 0.68 * L, 0.3 * L, 30)
        jib(bw + Vector((0.27 * L, 0, 0.03 * L)), ft - Vector((0, 0, 0.2 * L)), fx + 0.04 * L, dz(fx) + 0.1 * L)
    elif rig in ('ship', 'brig'):
        masts = [(H.x0 + 0.27 * L, 0.94 * L), (H.x0, 1.04 * L), (H.x0 - 0.25 * L, 0.82 * L)] if rig == 'ship' else \
                [(H.x0 + 0.2 * L, 1.0 * L), (H.x0 - 0.12 * L, 1.08 * L)]
        for k, (x, h) in enumerate(masts):
            t = mast(x, h)
            z0 = dz(x)
            if rig == 'brig' and k == 1:
                sq(x, z0 + h * 0.52, z0 + h * 0.85, H.B * 1.1, H.B * 0.8)
            else:
                sq(x, z0 + h * (0.28 if k < 2 or rig == 'brig' else 0.5), z0 + h * 0.82, H.B * 1.45, H.B * 0.85)
        ax_ = masts[-1][0]
        gaff(ax_, dz(ax_) + 1.5, 0.3 * L, dz(ax_) + masts[-1][1] * 0.5, 0.18 * L, 26)
        jib(bw + Vector((0.3 * L, 0, 0.06 * L)), Vector((masts[0][0], 0, dz(masts[0][0]) + masts[0][1] * 0.66)), masts[0][0] + 0.07 * L, dz(0) + 0.14 * L)
    elif rig == 'lugger':
        fx, mzx = H.x0 + 0.24 * L, H.x0 - 0.3 * L
        mast(fx, 0.9 * L); mast(mzx, 0.66 * L)
        gaff(fx, dz(fx) + 0.35 + 0.04 * L, (fx - mzx) * 0.95, dz(fx) + 0.66 * L, 0.5 * L, 24)
        gaff(mzx, dz(mzx) + 0.4, 0.36 * L, dz(mzx) + 0.48 * L, 0.36 * L, 26, cover=False)
    mb.paint = 0.0
    root = empty(vid + '_lod', coll=coll)
    o = to_object(mb, 'lod', 'hb_opaque', parent=root, coll=coll)
    root['family'] = family; root['class'] = cls; root['rig'] = rig; root['loa_m'] = L; root['beam_m'] = round(H.B, 2)
    return root, o, mb.tris()


# =================================================================== wrecks, buoy, dinghy
def build_wreck(kind, coll=None):
    """Grey sailless hulks for Wreck Cove. Origin on the sea surface; pose baked in."""
    sch = SCH(top='wreck', band='wreck', stripe='wreck_light', cap='wreck_dark', deck='wreck_light', deck_in='wreck_dark',
              bottom='weed', boot='wreck_dark', transom='wreck', spar='wreck_dark')
    rng = random.Random({'a': 3, 'b': 5, 'c': 9}[kind])
    L = {'a': 15.0, 'b': 17.0, 'c': 12.0}[kind]
    # classical restyle: ancient forms once hb_ancient has registered them (export.py imports it)
    H = Hull(L, FORMS.get('merchant' if kind != 'c' else 'corbita') or FORMS['schooner' if kind != 'c' else 'brig'])
    mb = MB(11)

    def hole(c, nm):
        if nm in ('deck',) and kind != 'a' and rng.random() < 0.35:
            return True
        if kind == 'a':   # stove-in starboard side amidships
            return c.y < 0 and -0.12 * L < c.x < 0.2 * L and c.z > H.boot * 0.5 and nm in ('top', 'stripe', 'cap')
        if kind == 'b':   # broken stern
            return c.x < -0.36 * L and nm in ('top', 'stripe', 'cap', 'deck', 'deck_in', 'transom')
        if kind == 'c':   # old ribs: most topside planking gone
            return nm in ('top', 'stripe', 'cap', 'deck', 'deck_in', 'transom') and (abs(c.x) < 0.38 * L or rng.random() < 0.5)
        return False
    loft(mb, H, sch, 9, hole=hole, pat_top=PT['boards'], paint=False)
    for f in mb.f:
        f['brand'] = 0.0
    # double-side the hull (we see inside through the holes)
    mb.backface(0, dark=0.6)
    # ribs where planking is gone
    r = max(0.09, 0.011 * L)
    if kind == 'c':
        rod(mb, (H.x(-0.9, 0), 0, H.zk(0) * 0.5), (H.x(0.9, 0), 0, H.zk(0) * 0.5 + 0.2), r * 1.6, PAL['wreck_dark'], 4)
    for k in range(10 if kind != 'c' else 12):
        u = -0.8 + 1.6 * k / 9
        x = H.x(u, H.fb)
        if kind == 'a' and not (-0.12 * L < x < 0.2 * L):
            continue
        if kind == 'b' and x > -0.3 * L:
            continue
        w = H.w(u); zt = H.zt(u)
        for sd in ((-1,) if kind == 'a' else (-1, 1)):
            top = zt + (0.5 if kind == 'c' else 0.15) * rng.random() + (0.35 if kind == 'c' else 0.0)
            rod(mb, (x, sd * 0.1, H.zk(u) * 0.55), (x, sd * w * 0.8, H.zk(u) * 0.2), r, PAL['wreck_dark'], 3, smooth=False)
            rod(mb, (x, sd * w * 0.8, H.zk(u) * 0.2), (x, sd * w * 1.0, H.boot), r, PAL['wreck_dark'], 3, smooth=False)
            rod(mb, (x, sd * w * 1.0, H.boot), (x, sd * w * 0.96, top), r * 0.85, PAL['wreck_dark'], 3, smooth=False)
    # mast stumps
    for x, h in (((0.15 * L, 0.28 * L), (-0.12 * L, 0.18 * L)) if kind != 'c' else ((0.05 * L, 0.1 * L),)):
        z0 = H.deck(x)
        rod(mb, (x, 0, z0 - 0.2), (x - 0.03 * h, 0.02 * h, z0 + h), 0.016 * L + 0.05, PAL['wreck_dark'], 5, r2=0.012 * L + 0.04, cap=True)
    if kind == 'b':  # broken yard hanging off the stump
        x = 0.15 * L; z0 = H.deck(x)
        rod(mb, (x, 0.2, z0 + 0.25 * L), (x - 0.05 * L, 0.45 * H.B, z0 - 0.2), 0.012 * L, PAL['wreck_dark'], 4)
    # pose
    if kind == 'a':     # beached on her side, bow up the shingle
        M_ = Matrix.Translation((0, 0, -0.15 * H.fb)) @ Matrix.Rotation(math.radians(-6), 4, 'Y') @ Matrix.Rotation(math.radians(-27), 4, 'X')
    elif kind == 'b':   # sunk by the stern, bow up
        M_ = Matrix.Translation((0, 0, -0.9 * H.fb)) @ Matrix.Rotation(math.radians(-11), 4, 'Y') @ Matrix.Rotation(math.radians(8), 4, 'X')
    else:               # settled upright, deck awash
        M_ = Matrix.Translation((0, 0, -0.75 * H.fb)) @ Matrix.Rotation(math.radians(3), 4, 'Y') @ Matrix.Rotation(math.radians(-5), 4, 'X')
    mb.v = [M_ @ p for p in mb.v]; mb.vf = [p.copy() for p in mb.v]
    root = empty('wreck_' + kind, coll=coll)
    to_object(mb, 'hull', 'hb_opaque', parent=root, coll=coll)
    root['family'] = 'wreck'; root['class'] = kind; root['loa_m'] = L; root['beam_m'] = round(H.B, 2)
    return root, mb.tris()


def build_buoy(coll=None):
    mb = MB(21)
    red, white = PAL['flag_red'], PAL['flag_white']
    rs = 0.55
    rings = []
    for i, (z, r) in enumerate(((-0.35, 0.25), (-0.15, 0.5), (0.1, rs), (0.32, 0.48), (0.5, 0.28), (0.58, 0.05))):
        rings.append([mb.vert((r * math.cos(2 * math.pi * k / 8), r * math.sin(2 * math.pi * k / 8), z)) for k in range(8)])
    for i, (a, b) in enumerate(zip(rings, rings[1:])):
        for k in range(8):
            k2 = (k + 1) % 8
            mb.face((a[k], a[k2], b[k2], b[k]), red if i < 2 or i == 4 else white, 0, smooth=True)
    rod(mb, (0, 0, 0.55), (0, 0, 0.85), 0.04, PAL['iron'], 4)
    rod(mb, (-0.13, 0, 0.92), (0.13, 0, 0.92), 0.035, PAL['iron'], 4, cap=False)
    rod(mb, (0.0, 0, 0.85), (-0.13, 0, 0.92), 0.035, PAL['iron'], 3)
    rod(mb, (0.0, 0, 0.85), (0.13, 0, 0.92), 0.035, PAL['iron'], 3)
    # pick-up float on a short line
    rod(mb, (0.3, 0.1, 0.5), (0.9, 0.35, 0.05), 0.02, PAL['rope'], 3)
    for k in range(1):
        box(mb, (0.95, 0.38, 0.08), (0.22, 0.22, 0.22), PAL['wall_ochre'], skip=('-z',))
    root = empty('mooring_buoy', coll=coll)
    to_object(mb, 'buoy', 'hb_opaque', parent=root, coll=coll)
    empty('ring', (0, 0, 0.92), parent=root, coll=coll)
    root['family'] = 'prop'; root['class'] = 'buoy'
    return root, mb.tris()


def build_dinghy(coll=None):
    L = 3.4
    H = Hull(L, FORMS['dinghy'])
    mb = MB(31)
    sch = SCH(top='hull_white', stripe='hull_blue', cap='varnish', deck='varnish', deck_in='cream', bottom='antifoul', transom='varnish')
    # open boat: no deck strip -> build a loft and drop the deck faces, add thwarts
    loft(mb, H, sch, 6, hole=lambda c, nm: nm == 'deck', paint=False)
    mb.backface(0, col=PAL['cream'], dark=0.9, brand=0.0)   # open boat: show the inside
    # floor (inside, below the sheer)
    zf = 0.12
    xs = [H.x(-0.85, zf), H.x(0.7, zf)]
    box2(mb, xs[0], -H.B * 0.3, zf - 0.05, xs[1], H.B * 0.3, zf, PAL['varnish'], PT['planks_y'], skip=('-z',))
    for u in (-0.55, 0.0, 0.5):
        x = H.x(u, H.fb)
        w = H.w(u) * 0.92
        box2(mb, x - 0.12, -w, H.fb * 0.62, x + 0.12, w, H.fb * 0.72, PAL['varnish'], PT['planks_y'], skip=('-z',))
    for sd in (-1, 1):   # oars shipped
        rod(mb, (-0.9, sd * 0.25, H.fb * 0.8), (1.3, sd * 0.32, H.fb * 0.85), 0.03, PAL['varnish'], 4)
        box(mb, (-1.05, sd * 0.25, H.fb * 0.8), (0.45, 0.1, 0.02), PAL['varnish'], skip=())
    root = empty('dinghy', coll=coll)
    to_object(mb, 'hull', 'hb_opaque', parent=root, coll=coll)
    empty('bow_cleat', (H.x(0.9, H.fb), 0, H.zt(0.9)), parent=root, coll=coll)
    root['family'] = 'prop'; root['class'] = 'dinghy'; root['loa_m'] = L; root['beam_m'] = round(H.B, 2)
    return root, mb.tris()
