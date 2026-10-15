"""Wreck Cove kit v2 - the wrecks. Each builder returns (root, info); pose is baked (see wk_lib frame notes).

Node contract per wreck GLB:
  wreck_<id>          root empty, extras {family: 'wreck', class, loa_m, sits}
    hull              hb_opaque: the hulk, spars, rigging, drift sand, weed - static, weathered per corner
    rag               hb_opaque (two-sided by duplicated faces): tattered canvas; optional flutter (sway ~ height below its top)
    epitaph           hb_opaque: driftwood post + nameboard (TEXCOORD_0 [0,1]^2 = name region, -4 elsewhere); origin = post base
      epitaph_lamp    hb_emissive: the lantern glass (lit at dusk)
      epitaph_light   empty: lantern centre (point light / glow sprite)
"""
import math, random
from mathutils import Vector, Matrix
from wk_lib import *
from wk_lib import PAL

R = math.radians


def rot(rx=0.0, ry=0.0, rz=0.0, t=(0, 0, 0)):
    return Matrix.Translation(Vector(t)) @ Matrix.Rotation(R(rz), 4, 'Z') @ Matrix.Rotation(R(ry), 4, 'Y') @ Matrix.Rotation(R(rx), 4, 'X')


def settle(mb, M, burial, start_v=0):
    """Apply M, then drop the piece so its lowest vertex sits `burial` m under the sand. Returns the full matrix."""
    pts = [M @ mb.v[i] for i in range(start_v, len(mb.v))]
    dz = -burial - min(p.z for p in pts)
    M2 = Matrix.Translation((0, 0, dz)) @ M
    xform(mb, M2, start_v)
    return M2


def livery(bot, boot, top, stripe, cap, band=None):
    def f(u, t, sd):
        if t < 0.3:
            return bot, PT['strakes']
        if t < 0.42:
            return boot, PT['strakes']
        if band and 0.6 < t < 0.72:
            return band, PT['strakes']
        if t < 0.86:
            return top, PT['strakes']
        if t < 0.93:
            return stripe, PT['strakes']
        return cap, PT['boards']
    return f


def transom(mb, P, u, ts, col, pat=PT['strakes']):
    pts = [P(u, t, 1) for t in ts] + [P(u, t, -1) for t in reversed(ts)]
    ids = [mb.vert(p) for p in pts]
    mb.face(ids[::-1] if newell(pts).x > 0 else ids, col, pat)


def make_root(name, cls, L, sits, coll=None):
    root = empty(name, coll=coll)
    root['family'] = 'wreck'; root['class'] = cls; root['loa_m'] = L; root['sits'] = sits
    return root


def emit(name, cls, L, sits, mb, rg, ep_at, seed, coll=None, cull=BURY, wl=0.62):
    cull_compact(mb, cull)
    root = make_root(name, cls, L, sits, coll)
    finish(mb, 'hull', 'hb_opaque', root, seed, coll=coll, wl=wl)
    t = mb.tris()
    if rg is not None and rg.f:
        cull_compact(rg, cull)
        finish(rg, 'rag', 'hb_opaque', root, seed, coll=coll, wl=wl)
        t += rg.tris()
    _, te = attach_epitaph(root, ep_at, seed, coll=coll)
    return root, dict(tris=t + te, tris_wreck=t, tris_epitaph=te)


def chainplates(mb, P, us, t, sd, H):
    """Iron chainplates + deadeyes on the topsides: returns [(p, n)] in boat frame for the rust streaks / shrouds."""
    out = []
    for u in us:
        p = P(u, t, sd)
        q = P(u, t - 0.05, sd)
        n = Vector((0, sd, 0.15)).normalized()
        box(mb, p + n * 0.08, (0.12, 0.08, 0.5), PAL['iron'], PT['metal'],
            axes=(Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))))
        out.append((p + n * 0.12, n))
    return out


# =========================================================================== 1. the great hulk
def great_hulk(coll=None):
    """A 26 m ship, keeled over on the strand with her back broken: ribs bare on the high side, foremast still
    standing (raked hard over) with a tattered course under a drooping yard, mainmast snapped, its top lying on
    the sand, anchor and chain run out, sand drifted against her."""
    L = 26.0; H = Hull(L, FORMS['ship']); rng = random.Random(101)
    mb, rg = MB(101), MB(102)
    liv = livery(PAL['timber_dark'], PAL['paint_black'], PAL['paint_black'], PAL['gilt_old'], PAL['paint_black'], band=PAL['paint_white'])
    UB = 0.0      # the break
    pieces = {}
    for nm, (u0, u1, nu) in (('stern', (-1.0, UB - 0.06, 7)), ('bow', (UB + 0.06, 1.0, 7))):
        pm = MB(rng.randint(0, 999))

        def hole(u, t, sd, u0=u0, u1=u1):
            e = min(abs(u - (UB - 0.06)), abs(u - (UB + 0.06)))
            if e < 0.1 and t > 0.25 and rng.random() < 0.55:
                return True                                    # ragged break
            if sd < 0 and -0.5 < u < 0.42 and 0.2 < t < 0.98 and fbm((u * 3.1, t * 2.4, 0.3), 1.0, 7) > 0.4:
                return True                                    # stove-in high side: the ribs show
            return rng.random() < 0.04
        P = shell(pm, H, u0, u1, nu, 6, liv, hole)
        pm.backface(0, dark=0.5)
        Q = inset(P, 0.16)
        for k in range(nu + 1):
            u = u0 + (u1 - u0) * k / nu
            for sd in (1, -1):
                if (sd < 0 and -0.55 < u < 0.47) or abs(u - UB) < 0.16 or rng.random() < 0.15:
                    rib(pm, Q, u, sd, 0.04, 1.07 + 0.08 * rng.random(), 0.15, PAL['timber'], n=3, segs=4, wobble=0.3, rng=rng)
        # keelson + deck beams across the break
        rod(pm, Vector((H.x(u0, 0), 0, H.zk(u0) + 0.3)), Vector((H.x(u1, 0), 0, H.zk(u1) + 0.3)), 0.2, PAL['timber_dark'], 4)
        deck_strip(pm, H, P, u0, u1, nu, PAL['deck'], hole=lambda u: rng.random() < 0.3)
        for u in (u0 + 0.03, u1 - 0.03) if nm == 'stern' else (u0 + 0.03,):
            zd = H.zt(u) - 0.2
            rod(pm, (H.x(u, zd), -H.w(u) * 0.95, zd), (H.x(u, zd), H.w(u) * 0.95, zd), 0.13, PAL['timber'], 4)
        pieces[nm] = (pm, P)
    # ---- spars + fittings, boat frame
    sm, sP = pieces['stern']; bm, bP = pieces['bow']
    xm = -2.2; zdm = H.deck(xm)
    rod(sm, (xm, 0, zdm - 1.5), (xm, 0, zdm + 3.2), 0.36, PAL['timber_dark'], 6, r2=0.32)
    splinters(sm, Vector((xm, 0, zdm + 3.2)), Vector((0, 0, 1)), 0.34, 0.7, PAL['bleach_light'], rng, 5)
    xz = -8.4; zdz = H.deck(xz)
    rod(sm, (xz, 0, zdz - 1.0), (xz, 0, zdz + 1.4), 0.26, PAL['timber_dark'], 5)
    splinters(sm, Vector((xz, 0, zdz + 1.4)), Vector((0, 0, 1)), 0.25, 0.45, PAL['bleach_light'], rng, 4)
    cp_s = chainplates(sm, sP, (-0.27, -0.2, -0.13), 0.9, -1, H)
    # rudder hanging askew off the sternpost
    sx = H.x(-1, 0)
    box(sm, (sx - 0.35, 0.25, H.fb * 0.2), (0.7, 0.24, 3.6), PAL['timber_dark'], PT['boards'],
        axes=(Vector((math.cos(0.5), math.sin(0.5), 0)), Vector((-math.sin(0.5), math.cos(0.5), 0)), Vector((0, 0, 1))))
    # stern windows on the transom
    transom(sm, sP, -1.0, (0.38, 0.55, 0.72, 0.88, 1.0), PAL['paint_black'])
    tx = H.x(-1, H.fb) - 0.05
    for k, yy in enumerate((-1.3, -0.45, 0.45, 1.3)):
        box(sm, (tx, yy, H.fb * 0.62), (0.08, 0.55, 0.6), PAL['window_dark'] if k != 1 else PAL['bleach'], 0)
    box(sm, (tx + 0.02, 0, H.fb * 0.96), (0.1, 3.6, 0.16), PAL['gilt_old'], 0)
    # bow: foremast, top, drooping yard, snapped bowsprit, cathead anchor
    xf = 7.2; zdf = H.deck(xf)
    mtop = Vector((xf, 0, zdf + 13.0))
    rod(bm, (xf, 0, zdf - 1.2), mtop, 0.32, PAL['timber_dark'], 6, r2=0.2)
    splinters(bm, mtop, Vector((0, 0, 1)), 0.2, 0.6, PAL['bleach_light'], rng, 4)
    box(bm, (xf - 0.2, 0, zdf + 9.0), (2.0, 2.6, 0.18), PAL['timber_dark'], PT['planks_x'])
    yc = Vector((xf + 0.35, 0, zdf + 7.6))
    ya = yc + Vector((0.9, 5.4, 1.0)); yb = yc + Vector((-1.1, -5.0, -1.9))
    rod(bm, ya, yc, 0.12, PAL['timber_dark'], 4, r2=0.18); rod(bm, yc, yb, 0.18, PAL['timber_dark'], 4, r2=0.11)
    bw = H.bow()
    bs = bw + Vector((3.6, 0, 1.4))
    rod(bm, bw - Vector((1.2, 0, 0.35)), bs, 0.25, PAL['timber_dark'], 5, r2=0.2)
    splinters(bm, bs, Vector((1, 0, 0.38)), 0.2, 0.55, PAL['bleach_light'], rng, 4)
    box(bm, bw + Vector((0.25, 0, -0.6)), (0.5, 0.3, 1.2), PAL['gilt_old'], 0)      # what is left of the figurehead
    cp_b = chainplates(bm, bP, (0.36, 0.43, 0.5), 0.9, -1, H)
    cat = bP(0.8, 1.0, -1) + Vector((0.2, -0.45, 0.1))
    rod(bm, cat - Vector((0.9, -0.45, 0)), cat, 0.13, PAL['timber_dark'], 4)
    # ---- pose: stern settled hard over, bow keeled less, pitched up and slewed
    Ms = settle(sm, rot(-34, 2, -3), 1.25)
    Mb = settle(bm, rot(-27, -8, 7, (0.9, -0.5, 0)), 0.95)
    mb.extend(sm); mb.extend(bm)
    # ---- world-frame dressing
    mt = Mb @ mtop
    for (p, n) in cp_b:
        sag_line(mb, Mb @ (mtop - Vector((0, 0, 3.6))), Mb @ p, 1.6, 0.04, n=3)
    for M_, cps in ((Mb, cp_b), (Ms, cp_s)):
        for (p, n) in cps:
            rust_streak(mb, M_ @ p, M_.to_3x3() @ n, 0.9, 0.1)
    for (p, n) in cp_s[:2]:      # main shrouds cut, hanging off the chainplates
        q = Ms @ p
        sag_line(mb, q, q + Vector((-0.6, -2.5, -q.z + 0.05)), 0.3, 0.04, n=2, floor=0.05)
    YA, YB = Mb @ ya, Mb @ yb
    # the course, torn, hanging off the yard: soft draped canvas, split twice, its foot frayed in tongues (P8: was a
    # coarse flat-shaded sheet with a deep billow that read as faceted folded card)
    top = [YA.lerp(YB, k / 12) + Vector((0, 0, -0.15)) for k in range(13)]
    cloth(rg, top, 6.8, 9, rng, mix(PAL['canvas_old'], PAL['bleach'], 0.35), billow=(0.7, 0.4), folds=0.3, ragged=0.5, holes=0.04, tears=(4, 9))
    hang_line(mb, YB, YB.z, 0.035, rng)
    hang_line(mb, YA, YA.z - 0.0, 0.035, rng, lie=2.0)
    sag_line(mb, mt, YA, 0.5, 0.04, n=2)
    # the main topmast fallen on the sand, crosstrees still on it
    m0 = Vector((-1.0, 9.5, 0.35)); m1 = Vector((-11.5, 13.0, 0.12))
    rod(mb, m0, m1, 0.27, PAL['timber_dark'], 5, r2=0.17)
    splinters(mb, m0, (m0 - m1), 0.27, 0.5, PAL['bleach_light'], rng, 4)
    box(mb, m0.lerp(m1, 0.3) + Vector((0, 0, 0.35)), (0.5, 2.6, 0.18), PAL['timber_dark'], 0,
        axes=(Vector((-0.95, 0.32, 0)), Vector((-0.32, -0.95, 0)), Vector((0, 0, 1))))
    stump = Ms @ Vector((xm, 0, zdm + 3.2))
    sag_line(mb, stump, m0.lerp(m1, 0.3), 0.4, 0.04, n=3, floor=0.04)
    sag_line(mb, stump, m0.lerp(m1, 0.65), 0.6, 0.04, n=3, floor=0.04)
    # anchor hanging at the cathead, chain run out across the sand
    ca = Mb @ cat
    anc = Vector((ca.x + 1.2, ca.y - 1.6, 0.25))
    rod(mb, ca, anc + Vector((0, 0, 1.9)), 0.04, PAL['iron'], 3)
    anchor_shape(mb, anc, 1.9, rot_z=0.4, lie=0.75)
    hawse = Mb @ bP(0.93, 0.85, -1)
    sag_line(mb, hawse, Vector((hawse.x + 3.5, hawse.y - 4.5, 0.06)), 0.2, 0.07, PAL['rust_dark'], n=3, floor=0.06)
    rod(mb, Vector((hawse.x + 3.5, hawse.y - 4.5, 0.06)), Vector((hawse.x + 8.5, hawse.y - 5.0, 0.06)), 0.07, PAL['rust_dark'], 3)
    # sand drifted against her, weed and kelp at her foot
    drift(mb, (-6.0, -3.2, 0), 6.0, 1.8, 0.9, rot=R(-4), skew=(0.0, 1.0), seed=3)
    drift(mb, (5.5, -3.0, 0), 5.0, 1.6, 0.7, rot=R(6), skew=(0.0, 0.9), seed=4)
    for k in range(4):
        kelp(mb, (rng.uniform(-12, 12), rng.uniform(-7, -4.5), 0), (rng.uniform(-1, 1), rng.uniform(-1, 1)), rng.uniform(1.5, 3.0), 0.22, rng)
    return emit('wreck_great_hulk', 'great', L, 'sand', mb, rg, (L / 2 + 3.5, -4.0, 0.0), 11, coll, wl=0.75)


def anchor_shape(mb, p, size, rot_z=0.0, lie=0.0):
    """Admiralty anchor at p (crown), shank up; lie tips it toward the sand (0 upright .. 1 flat)."""
    M = Matrix.Translation(p) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Rotation(lie * 1.35, 4, 'Y')
    s0 = len(mb.v); f0 = len(mb.f)
    rod(mb, (0, 0, 0), (0, 0, size), 0.07 * size / 1.9, PAL['iron'], 4)
    for sd in (1, -1):
        a = Vector((0, sd * 0.55, 0.45)) * size / 1.9
        rod(mb, (0, 0, 0.02), a, 0.06 * size / 1.9, PAL['iron'], 4)
        rod(mb, a, a + Vector((0, sd * 0.12, 0.2)) * size / 1.9, 0.11 * size / 1.9, PAL['iron'], 3)
    rod(mb, Vector((-0.7, 0, 0.88)) * size / 1.9 * 1.0 + Vector((0, 0, size * 0.5)), Vector((0.7, 0, 0.88)) * size / 1.9 + Vector((0, 0, size * 0.5)),
        0.05 * size / 1.9, PAL['timber_dark'], 4)
    rod(mb, (0, 0, size), (0, 0, size + 0.18), 0.12 * size / 1.9, PAL['rust'], 4)
    xform(mb, M, s0)
    tag(mb, f0, wk=0.5)


# =========================================================================== 2. the half-sunk schooner
def schooner_sunk(coll=None):
    """An 18 m schooner gone down by the stern in the shallows: only her bow, bowsprit and the raked foremast
    with a rag of foresail stand out of the water; the mainmast head breaks the surface further aft."""
    L = 18.0; H = Hull(L, FORMS['schooner']); rng = random.Random(202)
    mb, rg = MB(202), MB(203)
    liv = livery(PAL['bottom_green'], PAL['paint_white'], PAL['paint_white'], PAL['paint_green'], PAL['varnish'])

    def hole(u, t, sd):
        if u < -0.05 and t > 0.55 and rng.random() < 0.5:
            return True
        return sd < 0 and 0.15 < u < 0.4 and 0.45 < t < 0.85
    P = shell(mb, H, -0.35, 1.0, 8, 6, liv, hole)
    mb.backface(0, dark=0.5)
    deck_strip(mb, H, P, -0.35, 0.96, 8, PAL['deck'], hole=lambda u: u < 0.0 or rng.random() < 0.25)
    for u in (0.2, 0.28):
        rib(mb, inset(P, 0.12), u, -1, 0.4, 1.05, 0.11, PAL['timber'], n=2, segs=4)
    xf = 0.2 * L; zdf = H.deck(xf)
    mtop = Vector((xf - 0.6, 0, zdf + 12.5))
    rod(mb, (xf, 0, zdf - 0.8), mtop, 0.2, PAL['timber'], 6, r2=0.13)
    rod(mb, mtop, mtop + Vector((-0.1, 0, 1.8)), 0.09, PAL['timber'], 4, r2=0.06)
    gj = Vector((xf - 0.35, 0, zdf + 2.0))
    gb = gj + Vector((-6.0, -1.6, -1.6))      # fore boom fallen across the rail
    rod(mb, gj, gb, 0.12, PAL['timber'], 4)
    gg = gj + Vector((-0.2, 0, 6.2)); ge = gg + Vector((-4.6, 1.4, -3.4))    # gaff hanging by its throat
    rod(mb, gg, ge, 0.1, PAL['timber'], 4)
    bw = H.bow(); bs = bw + Vector((5.0, 0, 0.9))
    rod(mb, bw - Vector((1.4, 0, 0.2)), bs, 0.15, PAL['timber'], 5, r2=0.09)
    box(mb, bw + Vector((0.1, 0, -0.3)), (0.4, 0.2, 0.8), PAL['gilt_old'], 0)
    cp = chainplates(mb, P, (0.16, 0.24), 0.9, 1, H) + chainplates(mb, P, (0.16, 0.24), 0.9, -1, H)
    xm = -0.18 * L
    rod(mb, (xm, 0, H.deck(xm) - 1.0), (xm - 0.8, 0, H.deck(xm) + 14.0), 0.2, PAL['timber'], 5, r2=0.12)
    rod(mb, (xm - 0.8, 0, H.deck(xm) + 14.0), (xm - 0.85, 0, H.deck(xm) + 15.4), 0.08, PAL['timber'], 4)
    M = rot(12, -24, 0, (0, 0, 0))
    zb = M @ P(-0.35, 0.5, 1)
    M = Matrix.Translation((0, 0, -3.0 - zb.z)) @ M
    xform(mb, M)
    MT = M @ mtop
    for p, n in cp:
        rust_streak(mb, M @ p, M.to_3x3() @ n, 0.7, 0.08)
    sag_line(mb, MT, M @ bs, 1.4, 0.035, n=3)                    # forestay, slack
    stay = [(M @ mtop).lerp(M @ bs, k / 5) - Vector((0, 0, 1.4 * 4 * (k / 5) * (1 - k / 5))) for k in range(6)]
    rag(rg, stay[1:5], 3.2, 3, rng, PAL['canvas_old'], holes=0.25, billow=(0.4, -0.9), ragged=0.7)   # jib scraps
    G0, G1 = M @ gg, M @ ge
    rag(rg, [G0.lerp(G1, k / 4) for k in range(5)], 6.5, 4, rng, PAL['canvas_old'], holes=0.25, billow=(-0.5, -1.4), ragged=0.6)
    for p, n in cp[:2]:
        sag_line(mb, M @ (mtop - Vector((0, 0, 1.5))), M @ p, 0.8, 0.035, n=2)
    hang_line(mb, G1, G1.z + 0.6, 0.03, rng)
    pin = [(M @ P(u, 0.5, sd), (M.to_3x3() @ Vector((0, sd, 0))).normalized()) for u in (0.55, 0.65, 0.75, 0.85) for sd in (1, -1)]
    bar = []
    for p, n in pin:
        if -0.4 < p.z < 0.9:
            for k in range(3):
                bar.append((p + Vector((rng.uniform(-0.6, 0.6), 0, rng.uniform(-0.25, 0.25))), n))
    barnacles(mb, bar, rng, 0.1)
    return emit('wreck_schooner_sunk', 'sunk', L, 'water', mb, rg, (L * 0.5 + 2.0, 7.5, 0.0), 22, coll, cull=-1.6)


# =========================================================================== 3. the rib cage
def rib_cage(coll=None):
    """A 16 m hull rotted to her bones: keel, stem and sternpost, ribs arching out of the sand, a few low strakes,
    the belly filled with sand, weed hanging off the frame heads."""
    L = 16.0; H = Hull(L, FORMS['brig']); rng = random.Random(303)
    mb = MB(303)
    liv = livery(PAL['timber_dark'], PAL['timber'], PAL['timber'], PAL['timber'], PAL['timber'])

    def hole(u, t, sd):
        return t > 0.45 or abs(u) > 0.82 or fbm((u * 4.0, t * 3.0, sd), 1.0, 3) > 0.47
    P = shell(mb, H, -0.95, 0.95, 9, 7, liv, hole, t1=1.0)
    mb.backface(0, dark=0.55)
    Q = inset(P, 0.1)
    for k in range(10):
        u = -0.84 + 1.68 * k / 9
        for sd in (1, -1):
            t1 = 1.18 - (0.55 * rng.random() if rng.random() < 0.35 else 0.0)
            rib(mb, Q, u, sd, 0.05, t1, 0.15 * (1.0 - 0.25 * abs(u)), PAL['bleach'], n=3, segs=4, wobble=0.25, rng=rng)
    # keel, stem, sternpost
    rod(mb, (H.x(-0.98, 0), 0, H.zk(-0.98) + 0.2), (H.x(0.98, 0), 0, H.zk(0.98) + 0.2), 0.26, PAL['timber_dark'], 4)
    stem = [Vector((H.x(1.0, z), 0, z)) for z in (H.zk(1.0), H.zk(1.0) + 0.5 * (H.zt(1.0) - H.zk(1.0)), H.zt(1.0) + 0.9)]
    for a, b in zip(stem, stem[1:]):
        rod(mb, a, b, 0.24, PAL['bleach'], 4, r2=0.2)
    rod(mb, (H.x(-1.0, H.zk(-1)), 0, H.zk(-1)), (H.x(-1.0, H.fb) - 0.3, 0, H.fb + 0.6), 0.24, PAL['timber_dark'], 4, r2=0.2)
    for u in (-0.3, 0.25):
        zd = H.zt(u) - 0.3
        rod(mb, (H.x(u, zd), -H.w(u) * 0.95, zd), (H.x(u, zd) + 0.5, H.w(u) * 0.7, zd - 0.6), 0.12, PAL['bleach'], 4)
    M = settle(mb, rot(-6, 2, 0), 0.0)
    # lift so the turn of the bilge is at the sand
    zt = (M @ P(0.0, 0.32, 1)).z
    xform(mb, Matrix.Translation((0, 0, -zt)))
    drift(mb, (0.0, 0.0, 0.0), L * 0.33, H.B * 0.27, 0.5, seed=31)                 # her belly full of sand
    drift(mb, (-2.0, -H.B * 0.62, 0.0), 6.0, 1.6, 0.6, rot=R(-3), skew=(0, 1.0), seed=32)
    drift(mb, (4.5, -H.B * 0.58, 0.0), 4.0, 1.3, 0.5, rot=R(5), skew=(0, 0.8), seed=33)
    for k in range(6):
        kelp(mb, (rng.uniform(-7, 7), rng.uniform(-4.5, -2.5), 0), (rng.uniform(-1, 1), -1), rng.uniform(1.2, 2.4), 0.2, rng)
    return emit('wreck_rib_cage', 'ribs', L, 'sand', mb, None, (L / 2 + 2.5, -3.2, 0.0), 33, coll, wl=0.4)


# =========================================================================== 4. capsized
def capsized(coll=None):
    """A 13 m cutter turned turtle: her bare bottom planking to the sky, sun-silvered to grey-brown timber
    (the copper long stripped), keel and rudder up, barnacles thick along her old waterline and crusted in
    clusters over the bottom, one gunwale buried in a drift, a hole stove in her bilge."""
    L = 13.0; H = Hull(L, FORMS['cutter']); rng = random.Random(404)
    mb = MB(404)
    bottom = set()          # face indices of the bottom planking

    def colf(u, t, sd):
        if t < 0.4:
            # weathered bottom planking: grey-brown timber, low-contrast plank-to-plank, darker where it stays damp
            v = vnoise((u * 3, t * 4, sd), 1.0, 4)
            c = mix(mix(PAL['timber_grey'], PAL['timber_dark'], 0.2 + 0.3 * v), PAL['timber_wet'], 0.35 * smoothstep(0.25, 0.4, t))
            bottom.add(len(mb.f))   # shell() adds this face next
            return c, PT['strakes']
        if t < 0.47:
            return PAL['paint_black'], PT['strakes']
        if t < 0.88:
            return PAL['paint_blue'], PT['strakes']
        return PAL['paint_white'], PT['strakes']

    def hole(u, t, sd):
        return sd > 0 and -0.2 < u < 0.15 and 0.05 < t < 0.42
    P = shell(mb, H, -1.0, 1.0, 10, 6, colf, hole)
    for i in bottom:
        mb.f[i]['wk'] = 0.55          # half the sun bleach: grey-brown, not silver on the sand
    transom(mb, P, -1.0, (0.2, 0.45, 0.7, 1.0), PAL['paint_blue'])
    mb.backface(0, dark=0.45)
    Q = inset(P, 0.1)
    for u in (-0.2, -0.1, 0.0, 0.1, 0.17):
        rib(mb, Q, u, 1, 0.0, 0.55, 0.1, PAL['timber'], n=2, segs=4)
    splinters(mb, P(-0.02, 0.24, 1), Vector((0, 1, -0.3)), 0.5, 0.6, PAL['bleach_light'], rng, 4)
    rod(mb, (H.x(-1, H.zk(-1)), 0, H.zk(-1) - 0.12), (H.x(1, 0), 0, H.zk(1) - 0.12), 0.14, PAL['timber_dark'], 4)
    sx = H.x(-1, 0)
    box(mb, (sx - 0.35, 0, H.zk(-1) * 0.4), (0.7, 0.14, 1.9), PAL['timber_dark'], PT['strakes'])
    pts = []
    for k in range(34):
        u = rng.uniform(-0.85, 0.85); sd = rng.choice((1, -1))
        t = 0.44 + rng.uniform(-0.05, 0.12) if rng.random() < 0.75 else rng.uniform(0.1, 0.4)
        p = P(u, t, sd)
        pts.append((p, Vector((0, sd, -0.3))))
    barnacles(mb, pts, rng, 0.11)
    # crusts over the bottom: a few clusters of 5-7, the planking showing between them, greyed by the weather
    crust = []
    for k in range(7):
        u0 = rng.uniform(-0.75, 0.75); t0 = rng.uniform(0.12, 0.36); sd = rng.choice((1, -1))
        for j in range(rng.randint(5, 7)):
            p = P(u0 + rng.uniform(-0.06, 0.06), min(0.39, max(0.05, t0 + rng.uniform(-0.05, 0.05))), sd)
            crust.append((p, Vector((0, sd * 0.4, -1.0))))
    barnacles(mb, crust, rng, 0.1, col=mix(PAL['barnacle'], PAL['rock_light'], 0.45))
    M = settle(mb, rot(180 - 13, 3, 0), 0.0)
    zs = (M @ P(0.0, 1.0, -1)).z
    xform(mb, Matrix.Translation((0, 0, -zs - 0.35)))
    drift(mb, (0.5, -H.B * 0.6, 0), L * 0.3, 1.4, 0.65, skew=(0, 0.8), seed=41)
    drift(mb, (-3.0, H.B * 0.6, 0), 4.0, 1.3, 0.5, skew=(0, -0.6), seed=42)
    rod(mb, (2.0, -H.B * 0.9, 0.12), (5.8, -H.B * 1.4, 0.06), 0.05, PAL['bleach'], 4)            # an oar
    box(mb, (6.3, -H.B * 1.48, 0.06), (0.9, 0.16, 0.03), PAL['bleach'], 0,
        axes=(Vector((0.99, -0.13, 0)), Vector((0.13, 0.99, 0)), Vector((0, 0, 1))))
    sag_line(mb, (H.x(1, 0) - 0.2, 0, 0.6), (H.x(1, 0) + 3.0, 1.5, 0.05), 0.2, 0.035, PAL['rope'], n=3, floor=0.04)
    for k in range(5):
        kelp(mb, (rng.uniform(-6, 6), rng.uniform(-5, -3.5), 0), (rng.uniform(-1, 1), -1), rng.uniform(1.0, 2.0), 0.18, rng)
    return emit('wreck_capsized', 'capsized', L, 'sand', mb, None, (L / 2 + 2.0, -2.4, 0.0), 44, coll, wl=0.45)


# =========================================================================== 5. burned
def burned(coll=None):
    """A 15 m brig burned to her bilges: charred frames standing ragged, black planking scalloped by the fire,
    a stump of a mast, a fallen blackened yard, ash and cinders drifted in her."""
    L = 15.0; H = Hull(L, FORMS['brig']); rng = random.Random(505)
    mb = MB(505)

    def colf(u, t, sd):
        v = vnoise((u * 5, t * 5, sd), 1.0, 5)
        c = mix(PAL['char'], PAL['char2'], v)
        if t > 0.48:
            c = mix(c, PAL['ember'], 0.5 * v)
        if t < 0.3:
            c = mix(PAL['timber_dark'], c, 0.5)
        return c, PT['strakes']

    def hole(u, t, sd):
        edge = 0.42 + 0.3 * fbm((u * 3.0, sd, 0), 1.0, 8) - 0.18 * (1 - abs(u))
        return t > edge or (abs(u) < 0.2 and t > 0.33 and sd > 0)
    P = shell(mb, H, -1.0, 1.0, 10, 7, colf, hole)
    for f in mb.f:
        f['wk'] = 0.25; f['salt'] = False
    mb.backface(0, dark=0.6)
    Q = inset(P, 0.1)
    f0 = len(mb.f)
    for k in range(9):
        u = -0.8 + 1.6 * k / 8
        for sd in (1, -1):
            t1 = 0.6 + 0.55 * rng.random()
            pts = rib(mb, Q, u, sd, 0.1, t1, 0.13, PAL['char'], n=3, segs=4, wobble=0.35, rng=rng)
            if rng.random() < 0.5:
                splinters(mb, pts[-1], pts[-1] - pts[-2], 0.12, 0.3, PAL['char2'], rng, 3)
    rod(mb, (H.x(-1, H.zk(-1)), 0, H.zk(-1) + 0.2), (H.x(1, 0), 0, H.zk(1) + 0.2), 0.22, PAL['char'], 4)
    xm = 0.1 * L
    rod(mb, (xm, 0, H.zk(0.1) + 0.3), (xm + 0.15, 0, H.fb + 1.8), 0.3, PAL['char'], 6, r2=0.25)
    splinters(mb, Vector((xm + 0.15, 0, H.fb + 1.8)), Vector((0, 0, 1)), 0.25, 0.7, PAL['char2'], rng, 4)
    stem = [Vector((H.x(1.0, z), 0, z)) for z in (H.zk(1.0), H.zt(1.0) * 0.5, H.zt(1.0) + 0.4)]
    for a, b in zip(stem, stem[1:]):
        rod(mb, a, b, 0.2, PAL['char'], 4)
    for f in mb.f[f0:]:
        f['wk'] = 0.15; f['salt'] = False
    M = settle(mb, rot(9, -2, 0), 0.0)
    zt = (M @ P(0.0, 0.3, 1)).z
    xform(mb, Matrix.Translation((0, 0, -zt)))
    drift(mb, (0.5, 0.0, 0.0), L * 0.33, H.B * 0.27, 0.45, col=PAL['ash'], seed=51)            # ash and cinders inside
    drift(mb, (-1.0, -H.B * 0.62, 0.0), 5.0, 1.5, 0.55, rot=R(-4), skew=(0, 1.0), seed=52)
    y0 = Vector((-3.0, -H.B * 0.7, 0.2)); y1 = Vector((-9.5, -H.B * 1.6, 0.08))
    rod(mb, y0, y1, 0.16, PAL['char'], 4, r2=0.1)
    splinters(mb, y0, y0 - y1, 0.15, 0.35, PAL['char2'], rng, 3)
    for k in range(5):     # charred planks thrown on the sand
        c = Vector((rng.uniform(-8, 8), rng.choice((-1, 1)) * rng.uniform(H.B * 0.8, H.B * 1.4), 0.05))
        a = rng.uniform(0, 3.14)
        box(mb, c, (rng.uniform(1.6, 3.0), 0.28, 0.08), PAL['char2'], PT['boards'],
            axes=(Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0)), Vector((0, 0, 1))))
    return emit('wreck_burned', 'burned', L, 'sand', mb, None, (L / 2 + 2.2, -3.0, 0.0), 55, coll, wl=0.35)


# =========================================================================== 6. the stern section
def stern_section(coll=None):
    """The after third of a 22 m ship, torn off at the mainmast and stood on the strand stern-high: carved,
    gilded transom with a row of cabin windows, quarter galleries, a stern lantern, the rudder hanging, her broken
    forward end a fan of ribs and plank ends."""
    L = 22.0; H = Hull(L, FORMS['ship']); rng = random.Random(606)
    mb = MB(606)
    liv = livery(PAL['timber_dark'], PAL['paint_blue'], PAL['paint_blue'], PAL['gilt_old'], PAL['paint_blue'], band=PAL['paint_ochre'])
    U1 = -0.3

    def hole(u, t, sd):
        return u > U1 - 0.12 and t > 0.2 and rng.random() < 0.55
    P = shell(mb, H, -1.0, U1, 6, 7, liv, hole)
    mb.backface(0, dark=0.5)
    Q = inset(P, 0.14)
    for u in (U1 - 0.1, U1 - 0.05, U1, U1 + 0.04):
        for sd in (1, -1):
            if rng.random() < 0.85:
                rib(mb, Q, u, sd, 0.05, 1.0 + 0.12 * rng.random(), 0.14, PAL['timber'], n=3, segs=4, wobble=0.35, rng=rng)
    deck_strip(mb, H, P, -0.98, U1 - 0.04, 5, PAL['deck'], hole=lambda u: u > -0.62 and rng.random() < 0.7)
    zd = H.zt(U1 - 0.04) - 0.2
    rod(mb, (H.x(U1 - 0.04, zd), -H.w(U1) * 0.95, zd), (H.x(U1 - 0.04, zd), H.w(U1) * 0.95, zd), 0.13, PAL['timber'], 4)
    # transom: counter + window row + carved, gilded taffrail
    transom(mb, P, -1.0, (0.4, 0.58, 0.76, 0.9, 1.0), PAL['paint_blue'])
    tx = H.x(-1, H.fb)
    wz = H.zt(-1) * 0.7
    ty = H.w(-1) * 0.9
    for k in range(5):
        yy = -ty * 0.75 + 1.5 * ty * k / 4
        box(mb, (tx - 0.03, yy, wz), (0.08, 0.36, 0.48), PAL['window_dark'] if k != 3 else PAL['bleach'], 0)
        box(mb, (tx - 0.06, yy, wz + 0.31), (0.06, 0.42, 0.08), PAL['gilt_old'], 0)
    box(mb, (tx - 0.06, 0, wz - 0.38), (0.08, ty * 1.7, 0.12), PAL['gilt_old'], 0)
    box(mb, (tx - 0.08, 0, wz + 0.62), (0.1, ty * 1.2, 0.26), PAL['paint_ochre'], 0)        # the name board, faded out
    tr = [Vector((tx - 0.1, y, H.zt(-1) + 0.45 + 0.25 * math.cos(y / ty * 1.4))) for y in (-ty, -ty * 0.5, 0, ty * 0.5, ty)]
    for a, b in zip(tr, tr[1:]):
        rod(mb, a, b, 0.11, PAL['gilt_old'], 4)
    for y in (-ty, 0, ty):
        rod(mb, (tx - 0.1, y, H.zt(-1)), (tx - 0.1, y, H.zt(-1) + 0.5 + 0.2 * (y == 0)), 0.08, PAL['gilt_old'], 4)
    lan = Vector((tx - 0.25, 0, H.zt(-1) + 1.3))
    rod(mb, lan - Vector((0, 0, 0.7)), lan - Vector((0, 0, 0.25)), 0.05, PAL['iron'], 4)
    box(mb, lan, (0.35, 0.35, 0.5), PAL['window_dark'], 0)
    box(mb, lan + Vector((0, 0, 0.3)), (0.42, 0.42, 0.1), PAL['iron'], PT['metal'])
    # quarter galleries
    for sd in (1, -1):
        u = -0.86
        c = P(u, 0.8, sd) + Vector((0, sd * 0.3, 0))
        box(mb, c, (2.0, 0.55, 1.2), PAL['paint_blue'], PT['boards'])
        box(mb, c + Vector((0, sd * 0.29, 0.05)), (1.2, 0.04, 0.5), PAL['window_dark'], 0)
        box(mb, c + Vector((0, 0, 0.72)), (2.1, 0.65, 0.22), PAL['gilt_old'], 0)
    sx = H.x(-1, 0)
    box(mb, (sx - 0.45, -0.2, H.zk(-1) * 0.2 + 0.6), (0.85, 0.22, 3.6), PAL['timber_dark'], PT['boards'],
        axes=(Vector((math.cos(-0.35), math.sin(-0.35), 0)), Vector((-math.sin(-0.35), math.cos(-0.35), 0)), Vector((0, 0, 1))))
    # mizzen stump with a hanging shroud
    xz = -0.72 * L / 2
    rod(mb, (xz, 0, H.deck(xz) - 0.5), (xz, 0, H.deck(xz) + 2.3), 0.22, PAL['timber_dark'], 5)
    splinters(mb, Vector((xz, 0, H.deck(xz) + 2.3)), Vector((0, 0, 1)), 0.21, 0.45, PAL['bleach_light'], rng, 4)
    M = settle(mb, rot(-19, 21, 0), 1.6)
    drift(mb, (-1.0, -3.3, 0), 4.5, 1.6, 0.8, skew=(0, 1.0), seed=61)
    drift(mb, (-2.5, 2.8, 0), 5.0, 1.6, 0.6, skew=(0, -0.8), seed=62)
    st = M @ Vector((xz, 0, H.deck(xz) + 2.0))
    sag_line(mb, st, Vector((st.x - 1.0, st.y - 4.5, 0.04)), 0.4, 0.035, n=3, floor=0.04)
    for k in range(4):
        kelp(mb, (rng.uniform(-10, 2), rng.uniform(-5, -3.5), 0), (rng.uniform(-1, 1), -1), rng.uniform(1.0, 2.2), 0.2, rng)
    return emit('wreck_stern_section', 'stern', 8.5, 'sand', mb, None, (2.5, -4.0, 0.0), 66, coll, wl=0.5)


# =========================================================================== 7. wrecked skiff
def skiff(coll=None):
    """A 5 m open workboat, planks stove in on one side, half full of sand, thwart broken, an oar snapped."""
    L = 5.0; H = Hull(L, FORMS['work']); rng = random.Random(707)
    mb = MB(707)
    liv = livery(PAL['timber_dark'], PAL['paint_red'], PAL['paint_teal'], PAL['paint_white'], PAL['varnish'])

    def hole(u, t, sd):
        return sd > 0 and -0.1 < u < 0.35 and 0.35 < t < 0.95 and rng.random() < 0.75
    P = shell(mb, H, -1.0, 1.0, 6, 4, liv, hole)
    transom(mb, P, -1.0, (0.3, 0.65, 1.0), PAL['paint_teal'])
    mb.backface(0, col=PAL['bleach'], dark=0.85)
    for u in (0.0, 0.2):
        rib(mb, inset(P, 0.05), u, 1, 0.15, 1.0, 0.05, PAL['bleach'], n=2, segs=3)
    zt = H.fb * 0.75
    box(mb, (H.x(-0.4, zt), 0, zt), (0.25, H.w(-0.4) * 1.9, 0.06), PAL['varnish'], PT['planks_y'])
    box(mb, (H.x(0.3, zt), -H.w(0.3) * 0.45, zt - 0.15), (0.25, H.w(0.3) * 1.0, 0.06), PAL['varnish'], PT['planks_y'],
        axes=(Vector((1, 0, 0)), Vector((0, math.cos(0.4), math.sin(0.4))), Vector((0, -math.sin(0.4), math.cos(0.4)))))
    rod(mb, (-1.6, -0.3, zt + 0.08), (1.0, -0.55, zt + 0.15), 0.035, PAL['bleach'], 4)
    splinters(mb, Vector((1.0, -0.55, zt + 0.15)), Vector((1, -0.1, 0.05)), 0.035, 0.18, PAL['bleach_light'], rng, 3)
    M = settle(mb, rot(19, -3, 0), 0.3)
    drift(mb, (0.0, 0.0, 0.0), L * 0.32, H.B * 0.28, 0.45, seed=71)
    drift(mb, (0.2, -H.B * 0.75, 0.0), 2.8, 1.1, 0.55, skew=(0, 0.6), seed=72)
    box(mb, (2.6, 1.9, 0.04), (1.0, 0.13, 0.03), PAL['bleach'], 0, axes=(Vector((0.8, 0.6, 0)), Vector((-0.6, 0.8, 0)), Vector((0, 0, 1))))
    rod(mb, (2.95, 2.15, 0.05), (4.2, 3.1, 0.05), 0.035, PAL['bleach'], 4)
    for k in range(3):
        kelp(mb, (rng.uniform(-2, 2), rng.uniform(-2.2, -1.6), 0), (rng.uniform(-1, 1), -1), rng.uniform(0.8, 1.4), 0.15, rng)
    return emit('wreck_skiff', 'skiff', L, 'sand', mb, None, (L / 2 + 1.4, -1.8, 0.0), 77, coll, wl=0.18)


# =========================================================================== 8. upturned dinghy
def dinghy(coll=None):
    """A 3.4 m tender turned over on the sand, one gunwale propped on a drift log, a hole in her bottom."""
    L = 3.4; H = Hull(L, FORMS['dinghy']); rng = random.Random(808)
    mb = MB(808)

    def colf(u, t, sd):
        if t < 0.38:
            return PAL['paint_red'], PT['strakes']
        if t < 0.9:
            return PAL['paint_white'], PT['strakes']
        return PAL['paint_blue'], PT['boards']

    def hole(u, t, sd):
        return sd < 0 and -0.3 < u < 0.05 and 0.1 < t < 0.45
    P = shell(mb, H, -1.0, 1.0, 6, 4, colf, hole)
    transom(mb, P, -1.0, (0.3, 0.65, 1.0), PAL['paint_white'])
    mb.backface(0, col=PAL['cream'], dark=0.8)
    for u in (-0.2, -0.05):
        rib(mb, inset(P, 0.04), u, -1, 0.0, 0.5, 0.04, PAL['bleach'], n=2, segs=3)
    for u in (-0.45, 0.25):     # thwarts
        zt = H.fb * 0.62; x = H.x(u, zt)
        box(mb, (x, 0, zt), (0.22, H.w(u) * 1.8, 0.05), PAL['varnish'], PT['planks_y'])
    rod(mb, (H.x(-1, 0), 0, H.zk(-1) - 0.04), (H.x(1, 0), 0, H.zk(1) - 0.04), 0.05, PAL['timber_dark'], 4)
    rod(mb, (-0.9, 0.2, H.fb * 0.7), (1.0, -0.15, H.fb * 0.75), 0.03, PAL['bleach'], 4)            # an oar left in her
    M = settle(mb, rot(66, 0, 8), 0.25)
    drift(mb, (0.0, 0.9, 0), 2.0, 0.7, 0.4, skew=(0, -0.3), seed=81)
    bw = M @ Vector((H.x(1, H.fb), 0, H.zt(1)))
    sag_line(mb, bw, (bw.x + 1.4, bw.y - 0.9, 0.03), 0.1, 0.025, PAL['rope'], n=3, floor=0.03)
    return emit('wreck_dinghy', 'dinghy', L, 'sand', mb, None, (L / 2 + 1.0, -1.4, 0.0), 88, coll, wl=0.12)


# =========================================================================== 9. the mast stump
def mast_stump(coll=None):
    """All that shows of a ship the sand has swallowed: her lower mast standing raked out of the strand with its
    top and crosstrees, a yard hanging diagonal from one lift, slack shrouds into the sand, a ring of frame heads
    tracing the buried hull, a gull keeping watch."""
    rng = random.Random(909)
    mb, rg = MB(909), MB(910)
    lean = Matrix.Rotation(R(-14), 4, 'Y') @ Matrix.Rotation(R(5), 4, 'X')
    base = Vector((0, 0, -0.8)); top = lean @ Vector((0, 0, 9.0))
    rod(mb, base, top, 0.34, PAL['timber_dark'], 6, r2=0.24)
    splinters(mb, top, top.normalized(), 0.23, 0.55, PAL['bleach_light'], rng, 4)
    tp = lean @ Vector((0, 0, 7.0))
    box(mb, tp, (1.8, 2.4, 0.18), PAL['timber_dark'], PT['planks_x'],
        axes=tuple((lean.to_3x3() @ v) for v in (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))))
    for sd in (1, -1):
        e = tp + Vector((0, sd * 1.15, 0))
        sag_line(mb, e, (rng.uniform(-2, 2) + 1.0, sd * 4.5, 0.03), 0.7, 0.035, n=3, floor=0.03)
    ya = lean @ Vector((0, 0, 6.2)) + Vector((0.4, 2.6, 0.9))
    yb = Vector((1.6, -3.4, 0.1))
    rod(mb, ya, yb, 0.16, PAL['timber_dark'], 4, r2=0.11)
    sag_line(mb, top - Vector((0, 0, 0.4)), ya, 0.2, 0.03, n=2)
    rag(rg, [ya.lerp(yb, k / 4) for k in range(4)], 2.6, 3, rng, PAL['canvas_old'], holes=0.3, billow=(0.9, 0.0), ragged=0.7)
    # frame heads of the buried hull: an oval of stubs + a bit of rail
    for k in range(22):
        a = 2 * math.pi * k / 22
        if rng.random() < 0.2:
            continue
        p = Vector((math.cos(a) * 7.0, math.sin(a) * 2.4 * (1 - 0.5 * max(0.0, math.cos(a)) ** 4), -0.3))
        h = rng.uniform(0.6, 1.7) * (1.3 if math.cos(a) > 0.9 else 1.0)
        rod(mb, p, p + Vector((math.cos(a) * 0.15, math.sin(a) * 0.3, h)), 0.15, PAL['bleach'], 4, r2=0.11)
    rail = [Vector((math.cos(a) * 7.05, math.sin(a) * 2.38, 0.35 + 0.15 * math.sin(a * 3))) for a in (2.6, 2.95, 3.3, 3.65)]
    for a, b in zip(rail, rail[1:]):
        rod(mb, a, b, 0.1, PAL['timber'], 4)
    drift(mb, (0.5, -1.8, 0), 4.5, 1.6, 0.6, skew=(0, 0.8), seed=91)
    rock(mb, (-3.0, 1.2, 0.0), 0.7, rng, weed=0.5)
    rock(mb, (-3.7, 0.4, 0.0), 0.45, rng, weed=0.5)
    gull(mb, top + Vector((0, 0, 0.2)), 1.2, rng)
    for k in range(3):
        kelp(mb, (rng.uniform(-4, 4), rng.uniform(-3, -2), 0), (rng.uniform(-1, 1), -1), rng.uniform(1.0, 1.8), 0.18, rng)
    return emit('wreck_mast_stump', 'stump', 14.0, 'sand', mb, rg, (3.4, -3.2, 0.0), 99, coll, wl=0.35)


WRECKS = [
    # id, builder, size class, budget, tier note
    ('great_hulk', great_hulk, 'great', 2500),
    ('schooner_sunk', schooner_sunk, 'large', 1200),
    ('stern_section', stern_section, 'large', 1200),
    ('capsized', capsized, 'medium', 1200),
    ('burned', burned, 'medium', 1200),
    ('rib_cage', rib_cage, 'medium', 1200),
    ('mast_stump', mast_stump, 'small', 1200),
    ('skiff', skiff, 'small', 1200),
    ('dinghy', dinghy, 'tiny', 1200),
]
