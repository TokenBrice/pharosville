"""Titan-class flagships: four unique hero ships for the majors, style C "Northern Light".

    titan_usdt  USDT  emerald-and-white four-masted barque, gilded figurehead, Tether-green sail bands (32 m)
    titan_usdc  USDC  navy-and-white clipper, raked masts, coppered bottom, blue-banded sails; roundel on the fore course (30 m)
    titan_usde  USDe  dark modern staysail schooner, silver spars and accents, tall high-peaked sails (22 m)
    titan_usds  USDS  sky-blue-and-cream paddle frigate: paddle boxes with sunbursts, a tall funnel, brig-rigged fore (22 m)

Same node / morph / material contract as the hull kit (hb_hulls.py docstring, public/harbour/kit/manifest.json):
_heel, hull, deck, mast, yards, rigging, boom groups (boom_spar, gaff, sail_main | sail_spanker | sail_2, sail_cover),
sail_main (the emblem sail: a square course hanging from _heel on the ships, the boom-group mainsail otherwise),
sail_jib (+ stay_axis), sail_extra, flag, bow_cleat, stern_cleat, masthead_light, wake_origin. Built at RUNTIME size
(the fleet draws them at scale 1). Titans keep their own livery: no _PAINT regions, and the boot-top is painted,
not _BRAND (pennants and the sail covers still take the coin's brand colour at runtime).
"""
import math, os, sys
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'hulls'))
import hb_lib  # noqa: E402
import hb_hulls  # noqa: E402
from hb_lib import PAL, PT, MB, lin, rod, line, box, box2, empty, to_object, tri_count, descendants  # noqa: E402
from hb_hulls import Hull, Rig, SCH, loft, FORMS  # noqa: E402

TITAN_HEX = {
    'emerald': '#22795A', 'emerald_lt': '#2E9A6E', 'navy': '#1D3354', 'usdc_blue': '#2E6BB4',
    'charcoal': '#1B1E21', 'graphite': '#2C3034', 'silver': '#B9BFC4', 'silver_dk': '#8D949A', 'pearl': '#E3E5E4',
    'glass': '#1A242B', 'teak': '#B48A5E',
    'sky': '#79AED6', 'sky_dk': '#4F87B5', 'cream_lt': '#F1E8D2', 'sky_cloth': '#F3EDDD',
}
TP = {k: lin(v) for k, v in TITAN_HEX.items()}
BUDGET = 3000
LOD_BUDGET = 220

# ------------------------------------------------------------------ sail trims (one-shot non-uniform patch)
_TRIM = dict(us=None, vs=None, col=None)


def trim_patch(mb, nu, nv, P, Pf, col, uv=None, uv2=None, smooth=True, pat=0, brand=0.0, jitter=0.0, tri_head=False):
    """hb_lib.patch with optional non-uniform u/v stops and a per-cell colour (sail trims); the stops are consumed
    by the next call only, so Rig.fore_aft's own patch calls pick them up for the main cloth and nothing else."""
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


hb_hulls.patch = trim_patch      # Rig.fore_aft resolves `patch` in hb_hulls' globals


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


# ------------------------------------------------------------------ rig
class TitanRig(Rig):
    def __init__(s, vid, rig, L, form, sch, seed=0):
        super().__init__(vid, 'usd', 'ship', 'flagship', sch, seed)   # family 'usd': ensign layout only (runtime dyes it)
        s.rig = rig
        s.L = L; s.S = L / 13.0
        s.H = Hull(L, form)
        s.r_mast = min(0.42, max(0.085, 0.0165 * L))
        s.rope = max(0.022, 0.0028 * L)
        s.lod = dict(masts=[], stacks={}, gaffs=[], jibs=[], extra=[])

    def mast_at(s, x, h, r=None, rake=0.0, parts=1):
        base, top = super().mast_at(x, h, r, rake, parts)
        s.lod['masts'].append((x, h, rake))
        return base, top

    def xm(s, mx, z, rake):
        """Mast axis x at height z (raked masts lean aft)."""
        return mx - math.tan(rake) * (z - s.H.deck(mx))

    def yard_r(s, mx, z, span, r, rake=0.0):
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        x = s.xm(mx, z, rake)
        pv = Vector((x, 0, 0))
        br = lambda p: pv + R_ @ (Vector(p) - pv)
        c = Vector((x + s.r_mast * 0.6, 0, z))
        for sd in (-1, 1):
            rod(s.yards, br(c), br(c + Vector((0, sd * span / 2, 0))), r, s.sch['spar'], 4, r2=r * 0.55)

    def square_t(s, mb, mx, zy, span, zb, span_b, emblem=False, belly=0.06, nu=3, rake=0.0, foot=None, vs=None):
        """Square sail on a braced (and possibly raked) yard, with an optional coloured foot band; furled = rolled on the yard."""
        R_ = Matrix.Rotation(s.BRACE, 3, 'Z')
        fwd = R_ @ Vector((1, 0, 0)); up = Vector((0, 0, 1))
        zc = (zy + zb) / 2
        pv = Vector((s.xm(mx, zc, rake), 0, 0))
        br = lambda p: pv + R_ @ (Vector(p) - pv)
        off = s.r_mast * 0.9
        rf = max(0.14, 0.11 * (zy - zb) ** 0.7 + 0.06 * s.S)

        def flat(u, v):
            wv = span_b + (span - span_b) * v
            z = zb + (zy - zb) * v
            return br(Vector((s.xm(mx, z, rake) + off, -wv / 2 + wv * u, z)))

        def P(u, v):
            return flat(u, v) + fwd * (belly * span * math.sin(math.pi * u) * math.sin(math.pi * (0.2 + 0.65 * (1 - v))))

        def Pf(u, v):
            th = math.pi * (0.1 + 1.7 * (1 - v))
            k = 0.55 + 0.45 * math.sin(math.pi * (0.1 + 0.8 * u))
            c = br(Vector((s.xm(mx, zy, rake) + off + rf * 0.3, (-span / 2 + span * u) * 0.9, zy + rf * 0.55)))
            return c + rf * k * (0.6 + 0.4 * v) * (math.cos(th) * fwd + math.sin(th) * up)
        vs = vs or ([0.0, 0.14, 0.55, 1.0] if foot is not None else [0.0, 0.5, 1.0])
        uv2f = None
        if emblem:
            v0 = vs[1] if foot is not None else 0.0      # keep the emblem clear of the foot band
            # centred on the cloth (the kit's fit drifts to one side of a wide course), as big as the band-free height allows
            e1 = (flat(1, 0.5) - flat(0, 0.5)).normalized(); e2 = Vector((0, 0, 1))
            centre = (flat(0.5, v0) + flat(0.5, 1.0)) / 2
            size = min((zy - zb) * (1 - v0) / 1.1, (span_b + span) / 2 * 0.8)
            s.emblem = (centre, size)
            uv2f = lambda p: ((p - centre).dot(e1) / size + 0.5, (p - centre).dot(e2) / size + 0.5)
        set_trim(us=[j / nu for j in range(nu + 1)], vs=vs, foot=foot)
        trim_patch(mb, nu, len(vs) - 1, P, Pf, s.sch['cloth'], uv=lambda u, v: (u, v),
                   uv2=(lambda u, v: uv2f(flat(u, v))) if uv2f else (lambda u, v: (-4.0, -4.0)), smooth=True)
        st = s.lod['stacks'].setdefault(mx, dict(rake=rake, lo=1e9, hi=-1e9, wb=0.0, wt=0.0))
        if zb < st['lo']:
            st['lo'] = zb; st['wb'] = span_b
        if zy > st['hi']:
            st['hi'] = zy; st['wt'] = span

    def square_mast(s, k, x, top, fr, rake=0.0, emblem_yard=None, foot=None, nu=3):
        """A mast's stack of square sails: fr = [(foot frac, yard frac, span/B, foot span/B)] of the deck->truck height."""
        z0 = s.H.deck(x); hh = top.z - z0; B = s.H.B
        for yi, (fb_, fy, sp, spb) in enumerate(fr):
            zy = z0 + hh * fy; zb = z0 + hh * fb_ + 0.15
            s.yard_r(x, zy, B * sp, s.r_mast * 0.5, rake)
            main = emblem_yard == yi
            s.square_t(s.main_sq if main else s.extra, x, zy, B * sp, zb, B * spb, emblem=main, nu=nu, rake=rake, foot=foot,
                       vs=[0.0, 0.12, 0.4, 0.72, 1.0] if main and foot is not None else None)

    def fore_aft_t(s, name, mx, zb, blen, throat_z, gaff_len, peak_deg, rake=0.0, foot=None, leech=None, us=None, vs=None, **kw):
        """Rig.fore_aft on a raked mast (the throat follows the mast aft) with optional trims; records the LOD gaff."""
        lug = -math.tan(rake) * (throat_z - zb) if rake else kw.pop('lug_fwd', 0.0)
        if foot is not None or leech is not None:
            set_trim(us=us, vs=vs, foot=foot, leech=leech)
        out = s.fore_aft(name, mx, zb, blen, throat_z, gaff_len, peak_deg, lug_fwd=lug, **kw)
        _TRIM.update(us=None, vs=None, col=None)
        s.lod['gaffs'].append((mx, zb, blen, throat_z, gaff_len, peak_deg, lug, name == 'boom'))
        return out

    def headsail_t(s, tack, head, clew_x, clew_z, **kw):
        s.headsail(tack, head, clew_x, clew_z, **kw)
        s.lod['jibs'].append((tack.copy(), head.copy(), clew_x, clew_z))

    def boat_on_chocks(s, x, L_boat, z_lift):
        """Ship's boat, upside down on chocks (its bottom takes the brand colour, as on the kit ship)."""
        H = s.H
        bt = MB()
        Hb = Hull(L_boat, FORMS['dinghy'])
        loft(bt, Hb, SCH(top='hull_white', stripe='hull_white', cap='varnish', bottom='hull_white', boot='brand_default'), 4, paint=False)
        for i, p in enumerate(bt.v):
            q = Vector((p.x, -p.y, -p.z)) + Vector((x, 0, H.deck(x) + z_lift))
            bt.v[i] = q; bt.vf[i] = q.copy()
        s.deck.extend(bt)

    def gunports(s, n, u0, u1, col, frame=None):
        H = s.H
        for k in range(n):
            u = u0 + (u1 - u0) * k / (n - 1)
            pr = H.profile(u, band=True)
            zc = (pr[5][2] + pr[6][2]) / 2 if H.bh > 0 else 0
            w = H.w(u) * 0.99 + 0.025
            x = H.x(u, zc)
            hs = 0.28 * s.S
            for sd in (-1, 1):
                q = [s.hull.vert((x - hs, sd * w, zc - hs * 0.7)), s.hull.vert((x + hs, sd * w, zc - hs * 0.7)),
                     s.hull.vert((x + hs, sd * w, zc + hs * 0.7)), s.hull.vert((x - hs, sd * w, zc + hs * 0.7))]
                s.hull.face(q if sd < 0 else q[::-1], col, 0, jitter=0.0)

    def stern_windows(s, n, col, gilt):
        """Stern gallery: a gilt rail and a row of lit-looking panes on the transom."""
        H = s.H
        st = H.stern()
        wz = st.z - 0.55 * s.S
        hw = H.w(-1.0) * 0.8
        x = H.x(-1.0, wz) - 0.03
        box(s.hull, (x, 0, wz + 0.42 * s.S), (0.12 * s.S, hw * 2.1, 0.12 * s.S), gilt, skip=('+x',))
        for k in range(n):
            y = -hw + 2 * hw * (k + 0.5) / n
            box(s.hull, (x - 0.02, y, wz), (0.08 * s.S, 1.3 * hw / n, 0.42 * s.S), col, skip=('+x',), jitter=0.0)

    def empties_std(s):
        H, L = s.H, s.L
        main_t = max(s.tops, key=lambda t: t.z)
        u_b, u_s = 0.86, -0.9
        s.empties['bow_cleat'] = Vector((H.x(u_b, H.zt(u_b)) - 0.02 * L, 0, H.zt(u_b)))
        s.empties['stern_cleat'] = Vector((H.x(u_s, H.zt(u_s)) + 0.02 * L, 0, H.zt(u_s)))
        s.empties['masthead_light'] = main_t + Vector((0, 0, 0.25 + s.r_mast))
        s.empties['wake_origin'] = Vector((H.stern().x, 0, 0))

    def finish(s, coll=None):
        s.empties_std()
        root, objs = s.build_nodes(coll)
        root['family'] = 'titan'; root['class'] = 'flagship'; root['rig'] = s.rig
        return root, objs


def stays(R, tops, st):
    for a_, b_ in zip(tops[1:], tops[:-1]):
        line(R.rigging, a_ - Vector((0, 0, 0.4)), Vector((b_.x, 0, b_.z * 0.8)), R.rope)
    line(R.rigging, tops[-1] - Vector((0, 0, 0.3)), st + Vector((0.4, 0, 0)), R.rope)


# =================================================================== USDT: four-masted barque
def build_usdt(coll=None):
    sch = SCH(top=TP['emerald'], band='hull_white', stripe='gilt', cap='gilt', deck_in='hull_white', boot='hull_white',
              bottom='antifoul', house='hull_white', roof='timber', spar='timber_dark', cloth='canvas', transom=TP['emerald'])
    F = dict(br=0.205, fb=0.1, dr=0.07, bow=2.2, stern=0.6, sheer=(0.3, 0.2), rb=0.075, rs=0.045, bul=0.03, rpow=1.6)
    R = TitanRig('titan_usdt', 'barque', 32.0, F, sch)
    H, L, S = R.H, R.L, R.S
    loft(R.hull, H, sch, 14, band=True, paint=False)
    no_brand(R.hull)
    dz = H.deck
    st, bw = H.stern(), H.bow()
    green = TP['emerald_lt']
    masts = [(H.x0 + 0.3 * L, 0.98 * L), (H.x0 + 0.1 * L, 1.04 * L), (H.x0 - 0.1 * L, 0.98 * L), (H.x0 - 0.29 * L, 0.78 * L)]
    tops = []
    for k, (x, h) in enumerate(masts):
        _, t = R.mast_at(x, h, R.r_mast * (1.0 if k < 3 else 0.8), parts=3)
        tops.append(t)
    fr = [(0.17, 0.37, 2.1, 2.25), (0.4, 0.53, 1.82, 2.0), (0.56, 0.67, 1.55, 1.75), (0.7, 0.8, 1.22, 1.42), (0.83, 0.9, 0.9, 1.08)]
    pennants = []
    for k in range(3):
        x, _ = masts[k]
        z0 = dz(x); hh = tops[k].z - z0
        box(R.mast, (x, 0, z0 + hh * 0.38), (1.2 * S, 2.1 * S, 0.14 * S), sch['spar'], skip=('-z',))   # fighting top
        R.square_mast(k, x, tops[k], fr, emblem_yard=0 if k == 1 else None, foot=green)
        R.shrouds(tops[k], x, 2, 0.5)
        pennants.append((tops[k], (1.6 + 0.14 * L) * (1.0 if k == 1 else 0.75)))
    # jigger: spanker + gaff topsail
    jx, _ = masts[3]; jt = tops[3]
    blen = min(0.24 * L, jx - st.x + 0.03 * L)
    R.fore_aft_t('boom', jx, dz(jx) + 1.5 * S, blen, dz(jx) + (jt.z - dz(jx)) * 0.55, blen * 0.66, 26, foot=green,
                 vs=[0.0, 0.1, 0.45, 0.75, 1.0], sail_name='sail_spanker', topsail=jt - Vector((0, 0, 0.3)), nu=3, nv=4)
    R.shrouds(jt, jx, 1, 0.55)
    pennants.append((jt, 1.2 + 0.08 * L))
    # head rig: long bowsprit + jib-boom, three headsails
    bs = R.bowsprit(0.32 * L, 0.2)
    f_x = masts[0][0]; ft = tops[0]; fz = dz(f_x)
    R.headsail_t(bs, Vector((f_x, 0, fz + (ft.z - fz) * 0.74)), f_x + 0.08 * L, fz + 0.15 * L)
    R.headsail_t(bs.lerp(bw, 0.45), Vector((f_x, 0, fz + (ft.z - fz) * 0.58)), f_x + 0.05 * L, fz + 0.12 * L, nu=2, nv=2)
    R.headsail_t(bs.lerp(bw, 0.85), Vector((f_x, 0, fz + (ft.z - fz) * 0.42)), f_x + 0.03 * L, fz + 0.09 * L, nu=2, nv=2)
    stays(R, tops, st)
    # deck: poop, midships house, fo'c'sle, hatches, two boats on chocks, capstan
    R.house(st.x + 0.05 * L, st.x + 0.19 * L, 0.7, 1.2 * S, roof=PAL['timber'])
    R.house(H.x0 + 0.17 * L, H.x0 + 0.25 * L, 0.45, 0.95 * S)
    R.house(bw.x - 0.2 * L, bw.x - 0.1 * L, 0.55, 0.8 * S, roof=TP['emerald'])
    R.hatch(H.x0 + 0.0 * L, 0.05 * L, H.B * 0.36, 0.45 * S, PAL['timber'])
    R.hatch(H.x0 - 0.2 * L, 0.05 * L, H.B * 0.36, 0.45 * S, PAL['timber'])
    R.boat_on_chocks(H.x0 + 0.21 * L, 0.13 * L, 0.95 * S + 0.25)
    R.boat_on_chocks(H.x0 - 0.04 * L, 0.12 * L, 0.7 * S)
    rod(R.deck, (H.x0 + 0.38 * L, 0, dz(H.x0 + 0.38 * L) - 0.1), (H.x0 + 0.38 * L, 0, dz(H.x0 + 0.38 * L) + 0.6 * S), 0.32 * S,
        PAL['gilt'], 6, cap=True)                                                   # capstan
    # painted gunports on the white band, gilt figurehead + trailboards, stern gallery
    R.gunports(11, -0.66, 0.7, PAL['hull_black'])
    g = PAL['gilt']
    box(R.hull, bw + Vector((-0.35 * S, 0, -0.5 * S)), (0.9 * S, 0.42 * S, 0.7 * S), g, skip=('-x',))         # bust
    box(R.hull, bw + Vector((0.05 * S, 0, -0.05 * S)), (0.5 * S, 0.3 * S, 0.45 * S), g, skip=('-x',))         # head, leaning out
    box(R.hull, bw + Vector((-0.65 * S, 0, -0.95 * S)), (0.6 * S, 0.34 * S, 0.5 * S), g, skip=('-x',))        # scroll
    for sd in (-1, 1):
        u = 0.8
        x = H.x(u, H.zt(u) * 0.7); w = H.w(u) + 0.03
        box(R.hull, (x, sd * w, H.zt(u) - 0.45 * S), (1.9 * S, 0.06, 0.28 * S), g, jitter=0.0)          # trailboards
    R.stern_windows(5, lin('#E8C67A'), g)
    R.flags(pennants, True)
    return R


# =================================================================== USDC: clipper
def build_usdc(coll=None):
    sch = SCH(top=TP['navy'], stripe='hull_white', cap='hull_white', deck_in='hull_white', boot='hull_white', bottom='copper',
              house='hull_white', roof='varnish', spar='timber', cloth='canvas', transom=TP['navy'])
    F = dict(br=0.185, fb=0.088, dr=0.07, bow=1.7, stern=0.56, sheer=(0.42, 0.2), rb=0.11, rs=0.05, bul=0.024, rpow=2.3)
    R = TitanRig('titan_usdc', 'clipper', 30.0, F, sch)
    H, L, S = R.H, R.L, R.S
    loft(R.hull, H, sch, 14, paint=False)
    no_brand(R.hull)
    dz = H.deck
    st, bw = H.stern(), H.bow()
    blue = TP['usdc_blue']
    rake = math.radians(5)
    masts = [(H.x0 + 0.27 * L, 1.0 * L), (H.x0 + 0.02 * L, 1.1 * L), (H.x0 - 0.22 * L, 0.93 * L)]
    tops = []
    for k, (x, h) in enumerate(masts):
        _, t = R.mast_at(x, h, R.r_mast * (0.92 if k != 2 else 0.8), rake=rake, parts=3)
        tops.append(t)
    fr = [(0.16, 0.36, 2.3, 2.45), (0.39, 0.52, 1.95, 2.15), (0.55, 0.66, 1.6, 1.8), (0.69, 0.79, 1.25, 1.45), (0.82, 0.89, 0.92, 1.1),
          (0.91, 0.955, 0.62, 0.78)]
    pennants = []
    for k in range(3):
        x, _ = masts[k]
        frk = fr if k < 2 else fr[1:]
        R.square_mast(k, x, tops[k], frk, rake=rake, emblem_yard=0 if k == 0 else None, foot=blue)
        R.shrouds(tops[k], x, 2, 0.5)
        pennants.append((tops[k], (1.6 + 0.15 * L) * (1.0 if k == 1 else 0.75)))
    # spanker on the mizzen (raked)
    mx_, _ = masts[2]; mt = tops[2]
    blen = min(0.26 * L, mx_ - st.x + 0.05 * L)
    R.fore_aft_t('boom', mx_, dz(mx_) + 1.4 * S, blen, dz(mx_) + (mt.z - dz(mx_)) * 0.5, blen * 0.6, 24, rake=rake, foot=blue,
                 vs=[0.0, 0.1, 0.5, 1.0], sail_name='sail_spanker', nu=3, nv=3)
    # clipper head: a long, rising jib-boom with four headsails
    bs = R.bowsprit(0.36 * L, 0.22)
    f_x = masts[0][0]; ft = tops[0]; fz = dz(f_x)
    head = lambda k: Vector((R.xm(f_x, fz + (ft.z - fz) * k, rake), 0, fz + (ft.z - fz) * k))
    R.headsail_t(bs, head(0.86), f_x + 0.1 * L, fz + 0.2 * L)
    R.headsail_t(bs.lerp(bw, 0.35), head(0.7), f_x + 0.08 * L, fz + 0.15 * L, nu=2, nv=2)
    R.headsail_t(bs.lerp(bw, 0.65), head(0.55), f_x + 0.05 * L, fz + 0.11 * L, nu=2, nv=2)
    R.headsail_t(bs.lerp(bw, 0.92), head(0.4), f_x + 0.03 * L, fz + 0.08 * L, nu=2, nv=2)
    stays(R, tops, st)
    # deck: low white houses, a raised half-deck aft, boats
    R.house(st.x + 0.05 * L, st.x + 0.2 * L, 0.72, 0.85 * S, roof=PAL['varnish'])
    R.house(H.x0 + 0.1 * L, H.x0 + 0.21 * L, 0.42, 0.85 * S)
    R.house(H.x0 - 0.12 * L, H.x0 - 0.06 * L, 0.4, 0.7 * S)
    R.hatch(H.x0 - 0.02 * L, 0.05 * L, H.B * 0.34, 0.4 * S, PAL['timber'])
    R.boat_on_chocks(H.x0 + 0.155 * L, 0.12 * L, 0.85 * S + 0.25)
    # gilt eagle figurehead + scrolled trailboards, gilt name scroll on the counter
    g = PAL['gilt']
    box(R.hull, bw + Vector((-0.25 * S, 0, -0.45 * S)), (0.95 * S, 0.3 * S, 0.45 * S), g, skip=('-x',))
    box(R.hull, bw + Vector((0.12 * S, 0, -0.25 * S)), (0.45 * S, 0.24 * S, 0.3 * S), g, skip=('-x',))
    for sd in (-1, 1):
        for u, ln in ((0.84, 2.2), (0.72, 1.4)):
            x = H.x(u, H.zt(u) * 0.8); w = H.w(u) + 0.03
            box(R.hull, (x, sd * w, H.zt(u) - 0.4 * S), (ln * S, 0.06, 0.2 * S), g, jitter=0.0)
    R.stern_windows(4, lin('#E8C67A'), g)
    R.flags(pennants, True)
    return R


# =================================================================== USDe: modern staysail schooner
def build_usde(coll=None):
    sch = SCH(top=TP['charcoal'], stripe=TP['silver'], cap=TP['silver'], deck_in=TP['graphite'], boot=TP['silver'], bottom=TP['graphite'],
              deck=TP['teak'], house=TP['silver_dk'], roof=TP['pearl'], spar=TP['silver'], cloth=TP['pearl'], transom=TP['charcoal'])
    F = dict(br=0.2, fb=0.075, dr=0.065, bow=1.6, stern=0.5, sheer=(0.2, 0.08), rb=0.12, rs=0.15, bul=0.01, rpow=1.2)
    R = TitanRig('titan_usde', 'staysail_schooner', 22.0, F, sch)
    H, L, S = R.H, R.L, R.S
    R.r_mast = 0.3
    loft(R.hull, H, sch, 13, paint=False)
    no_brand(R.hull)
    dz = H.deck
    st, bw = H.stern(), H.bow()
    dark = TP['graphite']
    fx, mx = H.x0 + 0.16 * L, H.x0 - 0.1 * L
    _, ftop = R.mast_at(fx, 1.2 * L, parts=2)
    _, mtop = R.mast_at(mx, 1.42 * L, parts=2)
    # tall, high-peaked (near-Bermudan) sails with a graphite foot and leech band
    us = [0.0, 0.33, 0.66, 0.9, 1.0]
    R.fore_aft_t('boom_2', fx, dz(fx) + 1.3, (fx - mx) * 0.86, dz(fx) + 1.12 * L, 0.05 * L, 72, sail_name='sail_2', foot=dark, leech=dark,
                 us=us, vs=[0.0, 0.08, 0.4, 0.72, 1.0], nu=4, nv=4, belly=0.06)
    blen = min(0.42 * L, mx - st.x - 0.01 * L)
    R.fore_aft_t('boom', mx, dz(mx) + 1.35, blen, dz(mx) + 1.33 * L, 0.06 * L, 72, emblem=True, foot=dark, leech=dark,
                 us=us, vs=[0.0, 0.08, 0.4, 0.72, 1.0], nu=4, nv=4, belly=0.06)
    # headsails from a short sprit
    bs = R.bowsprit(0.07 * L, 0.05, r=0.16)
    R.headsail_t(bs, ftop - Vector((0, 0, 0.6)), fx + 0.05 * L, dz(fx) + 0.09 * L)
    R.headsail_t(bw + Vector((-0.05 * L, 0, 0)), ftop.lerp(Vector((fx, 0, dz(fx))), 0.36), fx + 0.02 * L, dz(fx) + 0.07 * L, nu=2, nv=2)
    for x, t in ((fx, ftop), (mx, mtop)):
        R.shrouds(t, x, 2, 0.75)
    line(R.rigging, mtop - Vector((0, 0, 0.3)), ftop - Vector((0, 0, 0.3)), R.rope)
    line(R.rigging, mtop - Vector((0, 0, 0.3)), st + Vector((0.3, 0, 0.05)), R.rope)
    # long, low, streamlined deckhouse with a dark glazing band, cockpit + wheel, silver lifelines
    x0, x1 = H.x0 - 0.06 * L, H.x0 + 0.1 * L
    z = dz((x0 + x1) / 2); w = min(H.half(x0), H.half(x1)) * 2 * 0.56
    box2(R.deck, x0, -w / 2, z - 0.1, x1, w / 2, z + 0.75, TP['silver_dk'], PT['metal'], skip=('-z',))
    box2(R.deck, x0 + 0.02, -w / 2 - 0.03, z + 0.32, x1 - 0.25, w / 2 + 0.03, z + 0.6, TP['glass'], 0, skip=('-z',), jitter=0.0)
    box2(R.deck, x0 - 0.1, -w / 2 - 0.08, z + 0.75, x1 + 0.35, w / 2 + 0.08, z + 0.88, TP['pearl'], PT['plain'], skip=('-z',))
    cx0, cx1 = st.x + 0.17 * L, H.x0 - 0.18 * L
    cz = dz(cx1)
    for sd in (-1, 1):
        box2(R.deck, cx0, sd * H.B * 0.28 - 0.06, cz - 0.05, cx1, sd * H.B * 0.28 + 0.06, cz + 0.42, TP['silver'], 0, skip=('-z',))
    rod(R.deck, (cx0 + 0.6, 0, cz), (cx0 + 0.6, 0, cz + 0.8), 0.07, TP['silver'], 4)
    rod(R.deck, (cx0 + 0.6, -0.42, cz + 0.85), (cx0 + 0.6, 0.42, cz + 0.85), 0.05, TP['silver'], 4)     # wheel (edge-on)
    for sd in (-1, 1):
        pts = []
        for u in (-0.82, -0.4, 0.05, 0.5, 0.82):
            x = H.x(u, H.zt(u)); pts.append(Vector((x, sd * (H.w(u) - 0.08), H.zt(u) + 0.62)))
        for a_, b_ in zip(pts, pts[1:]):
            rod(R.rigging, a_, b_, 0.025, TP['silver'], 3, smooth=False)
        for p in pts[1:-1]:
            rod(R.rigging, p, p - Vector((0, 0, 0.62)), 0.025, TP['silver'], 3, smooth=False)
    R.flags([(mtop, 1.3 + 0.12 * L), (ftop, 1.0 + 0.08 * L)], True)
    return R


# =================================================================== USDS: paddle frigate
def build_usds(coll=None):
    sch = SCH(top=TP['sky'], band=TP['cream_lt'], stripe=TP['cream_lt'], cap='hull_white', deck_in=TP['cream_lt'], boot=TP['cream_lt'],
              bottom='antifoul', house=TP['cream_lt'], roof=TP['sky_dk'], spar='timber', cloth=TP['sky_cloth'], transom=TP['sky'])
    F = dict(br=0.21, fb=0.108, dr=0.06, bow=2.2, stern=0.66, sheer=(0.3, 0.15), rb=0.06, rs=0.04, bul=0.025, rpow=1.4)
    R = TitanRig('titan_usds', 'paddle_frigate', 22.0, F, sch)
    H, L, S = R.H, R.L, R.S
    loft(R.hull, H, sch, 13, band=True, paint=False)
    no_brand(R.hull)
    dz = H.deck
    st, bw = H.stern(), H.bow()
    sky = TP['sky']
    fx, mx = H.x0 + 0.28 * L, H.x0 - 0.22 * L
    _, ft = R.mast_at(fx, 1.0 * L, parts=3)
    _, mt = R.mast_at(mx, 0.94 * L, parts=2)
    # fore: three square sails, sky-blue foot bands
    R.square_mast(0, fx, ft, [(0.22, 0.42, 2.0, 2.15), (0.46, 0.62, 1.6, 1.8), (0.66, 0.8, 1.15, 1.35)], foot=sky)
    R.shrouds(ft, fx, 2, 0.5)
    # main: big gaff mainsail with the emblem + gaff topsail
    blen = min(0.36 * L, mx - st.x + 0.03 * L)
    R.fore_aft_t('boom', mx, dz(mx) + 1.4 * S, blen, dz(mx) + 0.6 * L, blen * 0.66, 28, emblem=True, foot=sky,
                 vs=[0.0, 0.09, 0.45, 0.75, 1.0], topsail=mt - Vector((0, 0, 0.25)), nu=4, nv=4)
    R.shrouds(mt, mx, 2, 0.6)
    bs = R.bowsprit(0.3 * L, 0.16)
    fz = dz(fx)
    R.headsail_t(bs, Vector((fx, 0, fz + (ft.z - fz) * 0.66)), fx + 0.07 * L, fz + 0.13 * L)
    R.headsail_t(bs.lerp(bw, 0.6), Vector((fx, 0, fz + (ft.z - fz) * 0.48)), fx + 0.04 * L, fz + 0.1 * L, nu=2, nv=2)
    line(R.rigging, mt - Vector((0, 0, 0.4)), Vector((ft.x, 0, ft.z * 0.8)), R.rope)
    line(R.rigging, mt - Vector((0, 0, 0.3)), st + Vector((0.4, 0, 0)), R.rope)
    # funnel: tall, raked, cream with a sky band and a black top
    px = H.x0 + 0.03 * L
    fb = Vector((px, 0, dz(px) - 0.1))
    rk = Vector((-math.sin(math.radians(6)), 0, math.cos(math.radians(6))))
    fh = 0.43 * L; fr_ = 0.085 * L
    for (a, b, col) in ((0.0, 0.55, TP['cream_lt']), (0.55, 0.72, TP['sky']), (0.72, 0.9, TP['cream_lt']), (0.9, 1.0, PAL['hull_black'])):
        rod(R.deck, fb + rk * (fh * a), fb + rk * (fh * b), fr_, col, 8, cap=(b == 1.0))
    for sd in (-1, 1):   # funnel guys
        line(R.rigging, fb + rk * (fh * 0.8), Vector((px - 0.08 * L, sd * (H.half(px) - 0.1), H.zt(H.u_at(px)))), R.rope * 0.8)
    # paddle boxes with a sunburst on the outboard face, sponsons fore and aft of them
    pr = 0.155 * L; pw = 0.046 * L
    zc = dz(px) - 0.15 * S
    n = 8
    for sd in (-1, 1):
        y0 = sd * (H.half(px) - 0.05); y1 = sd * (H.half(px) + pw)
        rim = [Vector((px + pr * math.cos(math.pi * k / n), 0, zc + pr * math.sin(math.pi * k / n))) for k in range(n + 1)]
        cen = Vector((px, y1 + sd * 0.02, zc))
        # outboard face: alternating rays (cream / sky) from the hub
        for k in range(n):
            a = R.deck.vert(cen); b = R.deck.vert(rim[k] + Vector((0, y1 + sd * 0.02, 0))); c = R.deck.vert(rim[k + 1] + Vector((0, y1 + sd * 0.02, 0)))
            col = TP['sky'] if k % 2 == 0 else TP['cream_lt']
            R.deck.face((a, b, c) if sd > 0 else (a, c, b), col, 0, jitter=0.0)
        # curved top (gilt rim edge band) between the hull and the outboard face
        for k in range(n):
            q = [R.deck.vert(rim[k] + Vector((0, y0, 0))), R.deck.vert(rim[k + 1] + Vector((0, y0, 0))),
                 R.deck.vert(rim[k + 1] + Vector((0, y1, 0))), R.deck.vert(rim[k] + Vector((0, y1, 0)))]
            R.deck.face(q if sd < 0 else q[::-1], TP['cream_lt'] if k not in (0, n - 1) else PAL['gilt'], 0)
        # hub boss (gilt)
        box(R.deck, (px, y1 + sd * 0.08, zc + 0.12 * pr), (0.5 * S, 0.12, 0.5 * S), PAL['gilt'], jitter=0.0)
        # sponson deck fore and aft of the box
        box2(R.deck, px - pr - 1.2 * S, min(y0, y1), zc - 0.12, px + pr + 1.2 * S, max(y0, y1), zc + 0.02, PAL['timber'], PT['planks_y'],
             skip=('-z',))
    # deck: bridge between the paddle boxes, saloon aft, skylight, boat
    box2(R.deck, px + pr * 0.15, -H.half(px) - pw, dz(px) + 1.15 * S, px + pr * 0.45, H.half(px) + pw, dz(px) + 1.28 * S, PAL['hull_white'],
         PT['planks_y'], skip=())
    R.house(st.x + 0.07 * L, mx - 0.06 * L, 0.66, 0.95 * S)
    R.house(H.x0 + 0.12 * L, fx - 0.06 * L, 0.42, 0.75 * S)
    R.boat_on_chocks(H.x0 - 0.1 * L, 0.14 * L, 0.6 * S)
    box(R.hull, bw + Vector((-0.3 * S, 0, -0.45 * S)), (0.6 * S, 0.28 * S, 0.45 * S), PAL['gilt'], skip=('-x',))
    R.gunports(7, -0.62, 0.62, TP['sky_dk'])
    R.stern_windows(4, lin('#E8C67A'), PAL['gilt'])
    R.lod['extra'].append(('funnel', fb, rk, fh, fr_))
    R.lod['extra'].append(('paddles', px, pr, pw, zc))
    R.flags([(ft, 1.4 + 0.12 * L), (mt, 1.2 + 0.1 * L)], True)
    return R


TITANS = [
    # id, coin, builder, runtime summary
    ('titan_usdt', 'usdt-tether', build_usdt, 'emerald-and-white four-masted barque'),
    ('titan_usdc', 'usdc-circle', build_usdc, 'navy-and-white clipper'),
    ('titan_usde', 'usde-ethena', build_usde, 'dark modern staysail schooner'),
    ('titan_usds', 'usds-sky', build_usds, 'sky-blue-and-cream paddle frigate'),
]


def build(vid, coll=None):
    fn = {t[0]: t[2] for t in TITANS}[vid]
    R = fn(coll)
    root, objs = R.finish(coll)
    return root, objs, R


# =================================================================== LOD: single mesh silhouette
def build_titan_lod(R, coll=None):
    """Far-zoom silhouette from the recorded rig: hull in its own livery bands, masts, one quad per square-sail stack,
    the gaff sails, the outer jib, plus the funnel and paddle boxes (USDS). furl collapses the canvas onto its spars."""
    H, L, sch = R.H, R.L, R.sch
    mb = MB(7)
    n = 4
    secs = []
    has_band = R.id in ('titan_usdt', 'titan_usds')
    for i in range(n + 1):
        u = -1 + 2 * i / n
        w = H.w(u); zt = H.zt(u); zk = H.zk(u); fb = H.fb
        pr = [('stripe', w, zt), ('top', w * 0.995, zt - 0.1 * fb)]
        if has_band:
            pr += [('band', w * 0.99, zt - 0.35 * fb), ('top', w * 0.985, zt - 0.62 * fb)]
        pr += [('boot', w * 0.95, H.boot * 1.2), ('bottom', w * 0.85, -0.05 * fb), (None, 0, zk)]
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
    pa, sa, _ = secs[0]
    mb.face(pa + sa[-2::-1], sch['transom'])

    def tri2(pts, ptsf, col, brand=0.0, paint=None):
        ids = [mb.vert(p, q) for p, q in zip(pts, ptsf)]
        g0 = len(mb.f)
        mb.face(ids, col, 0, brand, jitter=0.0, paint=paint)
        mb.backface(g0)
    dz = H.deck
    cloth = sch['cloth']
    mb.paint = 8.0
    for (x, h, rake) in R.lod['masts']:
        a = Vector((x, 0, dz(x))); b = Vector((x - math.sin(rake) * h, 0, dz(x) + h))
        rod(mb, a, b, max(0.13, 0.011 * L + 0.06), sch['spar'], 3, r2=max(0.09, 0.007 * L + 0.04), smooth=False)
    Rb = Matrix.Rotation(Rig.BRACE, 3, 'Z')
    for x, stv in R.lod['stacks'].items():
        rake = stv['rake']; z0, z1 = stv['lo'], stv['hi']
        zc = (z0 + z1) / 2
        pv = Vector((R.xm(x, zc, rake), 0, 0))
        b_ = lambda p, pv=pv: pv + Rb @ (p - pv)
        xa = R.xm(x, z0, rake); xb = R.xm(x, z1, rake)
        wb, wt = stv['wb'], stv['wt']
        tri2([b_(Vector((xa, -wb / 2, z0))), b_(Vector((xa, wb / 2, z0))), b_(Vector((xb, wt / 2, z1))), b_(Vector((xb, -wt / 2, z1)))],
             [b_(Vector((xb, -wt / 2, z1 - 0.5))), b_(Vector((xb, wt / 2, z1 - 0.5))), b_(Vector((xb, wt / 2, z1))), b_(Vector((xb, -wt / 2, z1)))], cloth)
    for (x, zb, blen, thz, glen, deg, lug, cover) in R.lod['gaffs']:
        G = Vector((x, 0, zb)); E = G + Vector((-blen, 0, 0))
        Th = Vector((x + lug, 0, thz)); Pk = Th + Vector((-math.cos(math.radians(deg)) * glen, 0, math.sin(math.radians(deg)) * glen))
        tri2([G, E, Pk, Th], [G + Vector((0, 0, 0.15)), E + Vector((0, 0, 0.15)), G.lerp(E, 0.6) + Vector((0, 0, 0.2)), G + Vector((0, 0, 0.2))], cloth)
        if cover:
            r = max(0.15, 0.03 * blen + 0.08)
            a = [G + Vector((0, 0, 0.05)), E + Vector((0.05 * blen, 0, 0.05)), E + Vector((0.05 * blen, 0, 0.05)), G + Vector((0, 0, 0.05))]
            for sd in (-1, 1):
                ff = [G + Vector((-0.05 * blen, sd * r, 0.05)), E + Vector((0.06 * blen, sd * r, 0.05)), E + Vector((0.06 * blen, 0, 0.05 + 2 * r)),
                      G + Vector((-0.05 * blen, 0, 0.05 + 2 * r))]
                tri2(a, ff, PAL['brand_default'], 1.0, paint=0.0)
    if R.lod['jibs']:
        tack, head, cx, cz = R.lod['jibs'][0]
        tri2([tack, Vector((cx, 0, cz)), head], [tack, tack.lerp(head, 0.1) + Vector((0, 0, 0.05)), head], cloth)
    mb.paint = 0.0
    for ex in R.lod['extra']:
        if ex[0] == 'funnel':
            _, fb, rk, fh, fr_ = ex
            rod(mb, fb, fb + rk * fh * 0.9, fr_, TP['cream_lt'], 4, smooth=False)
            rod(mb, fb + rk * fh * 0.9, fb + rk * fh, fr_, PAL['hull_black'], 4, smooth=False, cap=True)
        elif ex[0] == 'paddles':
            _, px, pr, pw, zc = ex
            for sd in (-1, 1):
                y = sd * (H.half(px) + pw)
                pts = [Vector((px + pr * math.cos(math.pi * k / 4), y, zc + pr * math.sin(math.pi * k / 4))) for k in range(5)]
                ids = [mb.vert(p) for p in pts]
                mb.face(ids if sd > 0 else ids[::-1], TP['sky'], 0, jitter=0.0)
    root = empty(R.id + '_lod', coll=coll)
    o = to_object(mb, 'lod', 'hb_opaque', parent=root, coll=coll)
    root['family'] = 'titan'; root['class'] = 'flagship'; root['rig'] = R.rig; root['loa_m'] = L; root['beam_m'] = round(H.B, 2)
    return root, o, mb.tris()


__all__ = ['TITANS', 'build', 'build_titan_lod', 'BUDGET', 'LOD_BUDGET', 'tri_count', 'descendants']
