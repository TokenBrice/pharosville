"""Parametric hull + rig builder (one family of late-19th-century working sail, D9).

hull(name, family, L, docked, brand, emblem) -> object, bow toward local +X, waterline z = 0.
Families: sloop (usd small/medium), schooner (usd large), ship (usd flagship), botter (eur), brig (gold).
Node contract for the runtime: the object carries custom props emblem/has_emblem/brand; child empties
'mast_<i>_head' (riding light), 'cleat_bow', 'cleat_stern'.
Docked = sails furled under brand-colour covers (emblem on the cover flank) + brand pennant.
Sailing = sails set with belly, boom out to leeward, emblem on the main sail; heel is applied by the caller.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
from lib import *

FAM = {
    #           beam  fb    draft  transom bowr  spring_b spring_s  sheer_col     paint
    'sloop':    (0.34, 0.085, 0.11, 0.62, 0.0, 0.35, 0.10),
    'schooner': (0.27, 0.075, 0.10, 0.55, 0.0, 0.45, 0.12),
    'ship':     (0.25, 0.10, 0.10, 0.50, 0.0, 0.35, 0.18),
    'botter':   (0.40, 0.095, 0.08, 0.55, 0.30, 0.85, 0.30),
    'brig':     (0.29, 0.07, 0.11, 0.55, 0.05, 0.30, 0.15),
}


def hull_shell(k, L, fam, paint, strake, deck_col):
    beam, fbk, drk, tr, bowr, spb, sps = FAM[fam]
    B, fb, dr = L * beam, L * fbk, L * drk
    n = 14 if L >= 20 else 12
    s = L / 26.0
    bw = 0.35 + 0.55 * s            # bulwark height above deck
    bt = 0.1 + 0.08 * s             # bulwark thickness
    secs = []
    for i in range(n + 1):
        u = -1 + 2 * i / n
        x = u * L / 2
        if u >= 0:
            if fam == 'botter':
                w = B / 2 * (1 - u ** 3) ** 0.45
            else:
                w = B / 2 * (1 - u ** 2.0) ** 0.5
        else:
            w = B / 2 * (1 - (1 - tr) * u * u)
        w = max(w, 0.02)
        zt = fb * (1 + spb * max(u, 0) ** 2 + sps * min(u, 0) ** 2)
        zb = -dr * (1 - max(u, 0) ** 3.5) * (1 - 0.35 * min(u, 0) ** 2)
        sk = min(0.18 + 0.22 * s, zt * 0.3)
        wi = max(w - bt, 0.005)
        prof = [(wi, zt - bw), (wi, zt), (w, zt), (w * 0.998, zt - sk), (w * 0.965, 0.1 + 0.08 * s), (w * 0.95, 0.0),
                (w * 0.7, zb * 0.7), (0.0, zb)]
        pts = prof + [(-yy, zz) for yy, zz in reversed(prof[:-1])]
        secs.append([Vector((x, yy, zz)) for yy, zz in pts])
    rows = secs
    fs, vs = k.quad_strip(rows, paint, 'hull', uv=None, smooth=False)
    # bands by profile row: inner bulwark, rail cap, strake, topsides, boot, antifoul x4, boot, topsides, strake, cap, inner
    m = len(rows[0]) - 1
    inner = mixc(P['hull_cream'], paint, 0.25)
    bands = [inner, P['wood_dark'], strake, paint, P['hull_cream'], P['antifoul'], P['antifoul'],
             P['antifoul'], P['antifoul'], P['hull_cream'], paint, strake, P['wood_dark'], inner]
    for idx, f in enumerate(fs):
        c = bands[idx % m]
        for lp in f.loops:
            lp[k.cl] = (*c, 1)
    # deck between the inner bulwark feet
    dfs, _ = k.quad_strip([[r[-1], r[0]] for r in rows], deck_col, 'wood', uv=None)
    for f in dfs:
        for lp in f.loops:
            co = lp.vert.co
            lp[k.uv].uv = (co.y, co.x)
    # transom (outer ring only)
    tv = [k.bm.verts.new(p) for p in rows[0][1:-1]]
    f = k.bm.faces.new(tv[::-1])
    k.bm.normal_update()
    k.paint([f], paint, 'hull', uv='box')
    return B, fb - bw + 0.05, dr, rows


def stern_roundel(k, L, fb, rows):
    """Emblem disc painted on the transom (faces local -X)."""
    s = L / 26.0
    r = 0.55 + 0.9 * s
    z = fb * 0.55
    x = -L / 2 - 0.03
    c = Vector((x, 0, z))
    segs = 12
    ring = [c + Vector((0, r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs))) for i in range(segs)]
    fs = k.tri_fan(tuple(c), [tuple(p) for p in ring[::-1]], P['canvas'], 'sail', uv=None)
    for f in fs:
        for lp in f.loops:
            co = lp.vert.co
            lp[k.uv].uv = (0.5 - (co.y) / (2 * r), 0.5 + (co.z - z) / (2 * r))
            lp[k.cl] = (*P['canvas'], 1)


def spar(k, p, q, r, col=None, r2=None, segs=5):
    return k.rod(p, q, r, col or P['wood_dark'], 'wood', segs=segs, r2=r2)


RIG = {}


def line(k, p, q, r=0.025, sag=0.0, n=1, col=None):
    k = RIG.get('k', k)
    col = col or P['ink']
    p, q = Vector(p), Vector(q)
    pts = [p.lerp(q, t / n) - Vector((0, 0, sag * math.sin(math.pi * t / n))) for t in range(n + 1)]
    for a, b in zip(pts, pts[1:]):
        k.rod(a, b, r, col, 'iron', segs=3)


def sail_quad(k, a, b, c, d, belly_dir, belly, col, emblem=False, nu=4, nv=4, emb_size=None, mat='sail', brand=False):
    """Bilinear sail a(tack) b(clew) c(peak/head) d(throat); belly along belly_dir."""
    a, b, c, d = map(Vector, (a, b, c, d))
    rows = []
    for j in range(nv + 1):
        v = j / nv
        row = []
        for i in range(nu + 1):
            u = i / nu
            p = (a.lerp(b, u)).lerp(d.lerp(c, u), v)
            p = p + Vector(belly_dir) * belly * math.sin(math.pi * u) * (0.55 + 0.45 * math.sin(math.pi * min(1, v * 1.2 + 0.1)))
            row.append(p)
        rows.append(row)
    fs, vs = k.quad_strip(rows, col, mat, uv=None, smooth=True, brand=brand)
    # emblem UV: centre of the sail, square of side emb_size (metres) in the sail plane
    cen = (a + b + c + d) / 4
    ex = (b - a).normalized()
    ez = ((d - a) - ex * (d - a).dot(ex)).normalized()
    es = emb_size or 0.45 * (d - a).length
    for f in fs:
        for lp in f.loops:
            co = lp.vert.co - cen
            if emblem:
                lp[k.uv].uv = (0.5 + co.dot(ex) / es, 0.5 + co.dot(ez) / es)
            else:
                lp[k.uv].uv = (5.0, 5.0)
    return fs


def sail_tri(k, head, tack, clew, belly_dir, belly, col, n=4):
    head, tack, clew = map(Vector, (head, tack, clew))
    rows = []
    for j in range(n + 1):
        v = j / n
        l, r = tack.lerp(head, v), clew.lerp(head, v)
        row = []
        for i in range(4):
            u = i / 3
            p = l.lerp(r, u) + Vector(belly_dir) * belly * math.sin(math.pi * u) * (1 - v)
            row.append(p)
        rows.append(row)
    fs, _ = k.quad_strip(rows, col, 'sail', uv=None, smooth=True)
    for f in fs:
        for lp in f.loops:
            lp[k.uv].uv = (5.0, 5.0)
    return fs


def cover(k, p, q, r_h, r_w, emblem_len=None, segs=8):
    """Brand-colour sail cover along p->q (elliptic section, taller than wide); emblem on the flanks."""
    p, q = Vector(p), Vector(q)
    d = q - p
    L = d.length
    ax = d.normalized()
    side = Vector((-ax.y, ax.x, 0)).normalized()
    up = ax.cross(side).normalized()
    if up.z < 0:
        up = -up
    rows = []
    n = 6
    for i in range(n + 1):
        t = i / n
        taper = 0.55 + 0.45 * math.sin(math.pi * (0.15 + 0.85 * t)) if t < 1 else 0.55
        c = p + d * t
        rows.append([c + side * (r_w * taper * math.cos(2 * math.pi * j / segs)) + up * (r_h * taper * math.sin(2 * math.pi * j / segs))
                     for j in range(segs)])
    fs, vs = k.quad_strip(rows, (1, 1, 1), 'sail', closed=True, uv=None, smooth=True, brand=True)
    mid = p + d * 0.5
    es = emblem_len or min(L * 0.5, r_h * 2.4)
    for f in fs:
        for lp in f.loops:
            co = lp.vert.co - mid
            s = co.dot(side)
            if abs(s) > r_w * 0.3:
                u = 0.5 + co.dot(ax) / es * (1 if s > 0 else -1)
                lp[k.uv].uv = (u, 0.5 + co.dot(up) / es)
            else:
                lp[k.uv].uv = (5.0, 5.0)
    for ring in (rows[0], rows[-1]):
        pass
    return fs


def pennant(k, top, length, col, brand=True):
    top = Vector(top)
    v = [k.bm.verts.new(p) for p in (top, top - Vector((0, 0, length * 0.28)), top + Vector((-length, 0.0, -length * 0.08)))]
    f = k.bm.faces.new(v)
    k.bm.normal_update()
    k.paint([f], col, 'canvas', brand=brand, uv=None)


def flag(k, top, w, h, col, emblem=True):
    """Rectangular ensign hanging from a halyard; emblem in its centre (uses sail material)."""
    top = Vector(top)
    rows = []
    for j in range(3):
        rows.append([top + Vector((-w * i / 3, 0.08 * math.sin(i * 1.7) * w, -h * j / 2)) for i in range(4)])
    fs, _ = k.quad_strip(rows, col, 'sail', uv=None, smooth=True, brand=True)
    for f in fs:
        for lp in f.loops:
            co = lp.vert.co - top
            lp[k.uv].uv = (0.5 + (co.x + w / 2) / (h * 0.9), 0.5 + (co.z + h / 2) / (h * 0.9)) if emblem else (5, 5)
    return fs


def hull(name, family, L, docked=True, brand=(0.5, 0.5, 0.5), emblem=0, paint=None, strake=None, seed=0, tack=1,
         cabin_lit=True):
    rng = random.Random(seed)
    k = Kit(name, seed)
    RIG['k'] = Kit(name + '_rig', seed)
    paint = paint or {'sloop': P['hull_navy'], 'schooner': P['hull_cream'], 'ship': P['hull_black'],
                      'botter': lin('#3E3A2E'), 'brig': P['hull_tar']}[family]
    strake = strake or {'sloop': P['hull_cream'], 'schooner': P['hull_green'], 'ship': P['hull_cream'],
                        'botter': lin('#5F7B4E'), 'brig': P['gilt']}[family]
    canvas = {'botter': P['tanbark']}.get(family, P['canvas'])
    B, deck, dr, rows = hull_shell(k, L, family, paint, strake, lin('#A88C6A'))
    fb = L * FAM[family][1]
    s = L / 13.0
    lights = []
    cleats = {'bow': (L * 0.42, 0, fb + 0.05), 'stern': (-L * 0.45, 0, fb + 0.05)}

    def sheer_at(x):
        u = 2 * x / L
        beam, fbk, drk, tr, bowr, spb, sps = FAM[family]
        return fb * (1 + spb * max(u, 0) ** 2 + sps * min(u, 0) ** 2) - 0.05

    # transom emblem roundel (readable at harbour zoom when the sails are stowed)
    if family in ('ship', 'brig', 'schooner'):
        stern_roundel(k, L, sheer_at(-L / 2) * 0.9 + 0.05, rows)
    # deck furniture
    if family == 'ship':
        k.box((L * 0.2, B * 0.7, 0.9 * s), (-L * 0.33, 0, deck + 0.45 * s), P['wood'], 'wood')         # quarterdeck house
        k.box((L * 0.1, B * 0.6, 0.7 * s), (L * 0.36, 0, sheer_at(L * 0.36) + 0.3 * s), P['wood'], 'wood')
        k.box((L * 0.08, B * 0.45, 0.4), (L * 0.1, 0, deck + 0.2), P['wood_dark'], 'wood')
        for side in (-1, 1):                                                                           # gunport chequer
            for i in range(9):
                x = -L * 0.32 + i * L * 0.075
                w_ = B / 2 * (1 - max(2 * x / L, 0) ** 2) ** 0.5 * 0.995
                k.box((0.55 * s, 0.05, 0.5 * s), (x, side * (w_ + 0.02), sheer_at(x) - 0.65 * s), P['hull_black'], 'hull')
        for side in (-1, 1):
            k.box((L * 0.12, 1.0 * s, 0.4 * s), (-L * 0.12, side * (B / 2 + 0.3), deck + 1.2 * s), P['hull_cream'], 'hull')
    elif family == 'brig':
        k.box((L * 0.18, B * 0.6, 0.8 * s), (-L * 0.32, 0, deck + 0.4 * s), P['wood'], 'wood')
        k.box((L * 0.12, B * 0.5, 0.35), (0.0, 0, deck + 0.17), P['wood_dark'], 'wood')
        for i in range(3):
            k.box((0.9 * s, 0.9 * s, 0.6 * s), (L * 0.05 + i * 0.6 * s, (i - 1) * 0.5 * s, deck + 0.4 * s), P['gilt'], 'wood')
    elif family == 'botter':
        k.box((L * 0.18, B * 0.5, 0.55 * s), (-L * 0.22, 0, deck + 0.27 * s), lin('#5F7B4E'), 'wood')
        for side in (-1, 1):                                                                           # leeboards
            c = Vector((L * 0.05, side * (B / 2 + 0.08), fb * 0.6))
            v = [k.bm.verts.new(c + Vector(o)) for o in ((-L * 0.09, 0, 0.3 * s), (L * 0.09, 0, 0.3 * s),
                                                          (L * 0.13, side * 0.05, -fb * 1.6), (-L * 0.11, side * 0.05, -fb * 1.6))]
            f = k.bm.faces.new(v if side > 0 else v[::-1])
            k.bm.normal_update()
            k.paint([f], lin('#4B3A28'), 'wood', uv='box')
            k.box((L * 0.2, 0.08, 0.3 * s), tuple(c + Vector((0, side * 0.04, -fb * 0.6))), lin('#4B3A28'), 'wood')
    else:
        k.box((L * 0.24, B * 0.5, 0.5 * s), (-L * 0.1, 0, deck + 0.25 * s), P['wood'] if family != 'schooner' else P['hull_cream'], 'wood')
        if cabin_lit:
            for side in (-1, 1):
                for i in range(2):
                    k.box((0.22 * s, 0.05, 0.16 * s), (-L * 0.15 + i * L * 0.09, side * B * 0.25, deck + 0.3 * s), (1, 1, 1), 'window')
    # ---------------------------------------------------------------- rigs
    up = Vector((0, 0, 1))
    lee = Vector((0, -tack, 0))

    def mast(x, h, r):
        top = (x, 0, deck + h)
        spar(k, (x, 0, deck), top, r, r2=r * 0.6, segs=6)
        lights.append(Vector(top) + Vector((0, 0, 0.25)))
        return Vector(top)

    def shrouds(x, h):
        bw = B / 2 * 0.95
        for side in (-1, 1):
            for dx in (-0.25 * s, 0.35 * s):
                line(k, (x, 0, deck + h * 0.78), (x + dx, side * bw, sheer_at(x + dx) + 0.05), r=0.018 * s + 0.01)

    if family in ('sloop', 'botter', 'schooner'):
        masts = {'sloop': [(0.12, 1.12)], 'botter': [(0.16, 0.9)], 'schooner': [(0.24, 0.95), (-0.04, 1.05)]}[family]
        bsp = {'sloop': 0.22, 'botter': 0.0, 'schooner': 0.3}[family]
        bow = Vector((L / 2, 0, sheer_at(L / 2)))
        tip = bow + Vector((L * bsp, 0, 0.3 * s))
        if bsp:
            spar(k, bow - Vector((L * 0.05, 0, 0)), tip, 0.08 * s, r2=0.05 * s)
        for mi, (mx_, mh_) in enumerate(masts):
            mx, mh = L * mx_, L * mh_
            top = mast(mx, mh, 0.13 * s)
            shrouds(mx, mh)
            is_main = mi == len(masts) - 1
            foot = L * (0.52 if family == 'sloop' else (0.48 if family == 'botter' else (0.42 if is_main else 0.26)))
            if family == 'schooner' and is_main:
                foot = L * 0.5
            gaff_l = foot * (0.62 if family != 'botter' else 0.42)
            boom_z = deck + 1.1 * s
            ang = 0.0 if docked else math.radians(26) * -tack
            bdir = Vector((-math.cos(ang), math.sin(ang), 0))
            clew = Vector((mx, 0, boom_z)) + bdir * foot
            spar(k, (mx, 0, boom_z), clew, 0.07 * s, r2=0.05 * s)
            if docked:
                throat = Vector((mx, 0, boom_z + 0.6 * s))
                peak = throat + bdir * gaff_l + Vector((0, 0, 0.2 * s))
                spar(k, throat, peak, 0.06 * s)
                cover(k, Vector((mx - 0.1, 0, boom_z + 0.35 * s)), clew + Vector((0.2 * s, 0, 0.3 * s)),
                      0.38 * s + 0.1, 0.22 * s + 0.06)
                line(k, top, clew + Vector((0, 0, 0.1)), r=0.012 * s + 0.008)                   # topping lift
            else:
                throat_z = deck + mh * (0.72 if family != 'botter' else 0.78)
                gaff_ang = math.radians(32 if family != 'botter' else 58)
                throat = Vector((mx, 0, throat_z))
                peak = throat + bdir * (gaff_l * math.cos(gaff_ang)) + Vector((0, 0, gaff_l * math.sin(gaff_ang)))
                if family == 'botter':                                                         # curved gaff
                    mid = throat.lerp(peak, 0.5) + Vector((0, 0, 0.35 * s)) + bdir * 0.15 * s
                    spar(k, throat, mid, 0.06 * s); spar(k, mid, peak, 0.055 * s)
                else:
                    spar(k, throat, peak, 0.06 * s)
                sail_quad(k, Vector((mx - 0.15, 0, boom_z + 0.12)), clew + Vector((0, 0, 0.1)), peak, throat,
                          lee, foot * 0.11, canvas, emblem=is_main, emb_size=min(foot * 0.55, (throat_z - boom_z) * 0.62))
                line(k, peak, clew, r=0.012 * s + 0.006)
            if mi == 0:
                # jib(s)
                stay_top = Vector((mx, 0, deck + mh * 0.82))
                tack_pt = tip if bsp else bow + Vector((0.1 * s, 0, 0.1))
                line(k, stay_top, tack_pt, r=0.02 * s + 0.01)
                if docked:
                    k.rod(tack_pt + (stay_top - tack_pt) * 0.04, tack_pt + (stay_top - tack_pt) * 0.3, 0.18 * s, P['canvas'], 'canvas', segs=6, r2=0.06 * s)
                else:
                    jclew = Vector((mx - 0.05 * L, 0, deck + 0.7 * s)) + lee * (B * 0.45)
                    sail_tri(k, stay_top + (tack_pt - stay_top) * 0.04, tack_pt + (stay_top - tack_pt) * 0.04, jclew, lee, L * 0.035, canvas)
            if family == 'schooner':
                tm = top + Vector((0, 0, L * 0.18))
                spar(k, top - Vector((0, 0, 0.6)), tm, 0.06 * s, r2=0.04 * s)
                lights[-1] = tm + Vector((0, 0, 0.2))
        # masthead pennant in brand colour
        pennant(k, lights[-1] - Vector((0, 0, 0.1)), 1.6 * s + 0.6, brand)
        if docked and family == 'schooner':
            flag(k, Vector((-L * 0.5, 0, deck + 2.6 * s)), 2.2 * s, 1.5 * s, (1, 1, 1))
            spar(k, (-L * 0.47, 0, deck), (-L * 0.5, 0, deck + 2.7 * s), 0.04 * s)
    else:
        # square rigs: ship (3 masts) / brig (2 masts), docked: furled bundles in brand colour
        spec = {'ship': [(0.27, 0.86, 0.85), (0.0, 0.95, 1.0), (-0.25, 0.75, 0.78)],
                'brig': [(0.2, 0.9, 0.95), (-0.1, 0.95, 1.0)]}[family]
        bow = Vector((L / 2, 0, sheer_at(L / 2)))
        tip = bow + Vector((L * 0.3, 0, 1.2 * s))
        spar(k, bow - Vector((L * 0.06, 0, 0)), tip, 0.13 * s, r2=0.06 * s)
        prev_top = None
        for mi, (mx_, mh_, yk) in enumerate(spec):
            mx, mh = L * mx_, L * mh_
            top = mast(mx, mh, 0.16 * s)
            # tops (platforms)
            for zf in (0.5,):
                k.box((0.8 * s, 1.0 * s, 0.08 * s), (mx, 0, deck + mh * zf), P['wood_dark'], 'wood')
            shrouds(mx, mh)
            nyard = 4 if family == 'ship' else 3
            for yi in range(nyard):
                zf = (0.28, 0.52, 0.74, 0.92)[yi]
                yl = L * 0.5 * yk * (1.0, 0.82, 0.62, 0.45)[yi]
                z = deck + mh * zf
                spar(k, (mx, -yl / 2, z), (mx, yl / 2, z), 0.09 * s, segs=4)
                k.rod((mx + 0.1 * s, -yl * 0.45, z - 0.1 * s), (mx + 0.1 * s, yl * 0.45, z - 0.1 * s), 0.13 * s + 0.04,
                      P['canvas'], 'canvas', segs=6, r2=0.13 * s + 0.04)
            line(k, top, tip if mi == 0 else prev_top - Vector((0, 0, mh * 0.2)), r=0.02 * s + 0.01)
            prev_top = top
        # spanker gaff + boom on the aftmost mast, ensign at the gaff end
        mx = L * spec[-1][0]
        spar(k, (mx, 0, deck + 1.4 * s), (mx - L * 0.28, 0, deck + 1.6 * s), 0.07 * s)
        g0 = Vector((mx, 0, deck + L * spec[-1][1] * 0.55))
        g1 = g0 + Vector((-L * 0.22, 0, L * 0.06))
        spar(k, g0, g1, 0.06 * s)
        cover(k, Vector((mx - 0.2, 0, deck + 1.75 * s)), Vector((mx - L * 0.26, 0, deck + 1.85 * s)), 0.3 * s + 0.05, 0.2 * s + 0.05)
        flag(k, g1 + Vector((0, 0, -0.1)), 3.0 * s * 0.7, 2.0 * s * 0.7, (1, 1, 1))
        for i, t in enumerate(lights):
            pennant(k, t - Vector((0, 0, 0.1)), 2.4 * s, brand)
    # riding light lanterns
    for t in lights[-1:]:
        k.box((0.22 * s + 0.1, 0.22 * s + 0.1, 0.3 * s + 0.1), tuple(t), (1, 1, 1), 'riding')
    ob = k.finish()
    rig = RIG.pop('k').finish(parent=ob, outline=False)
    rig['family'] = 'hulls'
    ob['family'] = 'hulls'
    ob['emblem'] = float(emblem)
    ob['has_emblem'] = 1.0
    ob.color = (*brand, 1)
    ob['lights'] = [tuple(t) for t in lights[-1:]]
    ob['cleats'] = cleats
    ob['L'] = L
    ob['B'] = B
    ob['fb'] = fb
    return ob


def waterline_poly(L, B, family, pos, heading):
    beam, fbk, drk, tr, bowr, spb, sps = FAM[family]
    pts = []
    n = 14
    for i in range(n + 1):
        u = -1 + 2 * i / n
        if u >= 0:
            w = B / 2 * (1 - u ** 2.0) ** 0.5 * 0.95
        else:
            w = B / 2 * (1 - (1 - tr) * u * u) * 0.95
        pts.append((u * L / 2, w))
    poly = pts + [(x, -y) for x, y in reversed(pts)]
    ch, sh = math.cos(heading), math.sin(heading)
    return [(pos[0] + x * ch - y * sh, pos[1] + x * sh + y * ch) for x, y in poly]
