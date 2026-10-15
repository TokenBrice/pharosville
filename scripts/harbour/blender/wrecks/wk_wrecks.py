"""Wreck Cove kit v2 - the wrecks, on the ANCIENT hull forms (classical restyle P7b: hulls/hb_ancient.py ANCIENT_FORMS).
Each builder returns (root, info); pose is baked (see wk_lib frame notes). The same causes of death as kit v2, on
double-ended hulls with sternposts and steering oars, square-sail yards with rags of linen, stone and lead-stocked
anchors, and amphorae spilled on the sand.

Node contract per wreck GLB:
  wreck_<id>          root empty, extras {family: 'wreck', class, loa_m, sits}
    hull              hb_opaque: the hulk, spars, rigging, drift sand, weed, amphorae - static, weathered per corner
    rag               hb_opaque (two-sided by duplicated faces): tattered linen; optional flutter (sway ~ height below its top)
    epitaph           hb_opaque: driftwood post + nameboard (TEXCOORD_0 [0,1]^2 = name region, -4 elsewhere); origin = post base
      epitaph_lamp    hb_emissive: the lantern glass (lit at dusk)
      epitaph_light   empty: lantern centre (point light / glow sprite)
"""
import math, random
from mathutils import Vector, Matrix
from wk_lib import *
from wk_lib import PAL
import hb_ancient                       # registers ANCIENT_FORMS into hb_hulls.FORMS (= wk_lib FORMS)
from hb_ancient import arc, chain

for _k, _v in hb_ancient.ANC_HEX.items():
    PAL.setdefault(_k, lin(_v))
PAL.setdefault('lead', lin('#6C6E70'))

R = math.radians
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def rot(rx=0.0, ry=0.0, rz=0.0, t=(0, 0, 0)):
    return Matrix.Translation(Vector(t)) @ Matrix.Rotation(R(rz), 4, 'Z') @ Matrix.Rotation(R(ry), 4, 'Y') @ Matrix.Rotation(R(rx), 4, 'X')


def zaxes(a):
    return (Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0)), Z)


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


# --------------------------------------------------------------------------- ancient wreck carpentry
def amphora(mb, p, d, h, col=None, broken=False):
    """A transport amphora, toe at p, mouth toward d, h long: toe -> belly -> shoulder (capped) -> neck.
    broken: only the lower half, open at the break (~16 tris; whole ~34)."""
    p = Vector(p); d = Vector(d).normalized()
    col = col or PAL['amphora']
    f0 = len(mb.f)
    b = p + d * 0.32 * h
    rod(mb, p, b, 0.05 * h, col, 5, r2=0.24 * h)
    if broken:
        rod(mb, b, p + d * 0.5 * h, 0.24 * h, col, 5, r2=0.22 * h)
    else:
        s = p + d * 0.7 * h
        rod(mb, b, s, 0.24 * h, col, 5, r2=0.19 * h, cap=True)
        rod(mb, s, p + d * h, 0.07 * h, col, 4, r2=0.055 * h)
    tag(mb, f0, wk=0.35)


def spill(mb, c, n, rng, h=0.95, rx=2.0, ry=1.2, broken=0.35, upright=0.15, z=0.0):
    """Amphorae tumbled out of a broken hold: lying every which way, some broken, a few standing toe-down in the sand."""
    c = Vector(c)
    for k in range(n):
        a = rng.uniform(0, 2 * math.pi); r = math.sqrt(rng.random())
        q = c + Vector((math.cos(a) * rx * r, math.sin(a) * ry * r, 0))
        hh = h * rng.uniform(0.85, 1.12)
        col = mix(PAL['amphora'], PAL['terracotta'] if rng.random() < 0.5 else PAL['ochre_yel'], rng.uniform(0.0, 0.45))
        br = rng.random() < broken
        if rng.random() < upright:
            d = Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), 1.0))
            p = Vector((q.x, q.y, z - 0.28 * hh))
        else:
            th = rng.uniform(0, 2 * math.pi)
            d = Vector((math.cos(th), math.sin(th), rng.uniform(0.12, 0.26)))
            p = Vector((q.x, q.y, z + 0.06 * hh))
        amphora(mb, p, d, hh, col, br)


def steer_oar(mb, a, b, r, blade, col):
    """A quarter steering oar a (loom head) -> b (blade tip): loom + a flat blade."""
    a, b = Vector(a), Vector(b)
    rod(mb, a, b, r, col, 4)
    d = (b - a).normalized()
    y = Y if abs(d.y) < 0.9 else X
    w = d.cross(y).normalized(); y = w.cross(d).normalized()
    box(mb, b - d * blade * 0.5, (blade, r * 1.1, blade * 0.3), col, PT['boards'], axes=(d, y, w))


def anchor_shape(mb, p, size, rot_z=0.0, lie=0.0):
    """Roman anchor at p (crown), shank up: oak shank and arms, a lead stock across the head; lie tips it toward the
    sand (0 upright .. 1 flat). Returns the ring position (for the cable)."""
    M = Matrix.Translation(p) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Rotation(lie * 1.35, 4, 'Y')
    s = size / 1.9
    s0 = len(mb.v); f0 = len(mb.f)
    rod(mb, (0, 0, 0), (0, 0, size), 0.09 * s, PAL['timber_dark'], 4, r2=0.07 * s)
    for sd in (1, -1):
        a = Vector((0, sd * 0.6, 0.5)) * s
        rod(mb, (0, 0, 0.02), a, 0.08 * s, PAL['timber_dark'], 4, r2=0.06 * s)
        rod(mb, a, a + Vector((0, sd * 0.06, 0.22)) * s, 0.06 * s, PAL['timber_dark'], 3, r2=0.02 * s)
    box(mb, (0, 0, size * 0.86), (1.5 * s, 0.17 * s, 0.17 * s), PAL['lead'], PT['metal'])
    rod(mb, (0, 0, size), (0, 0, size + 0.16), 0.07 * s, PAL['rope'], 4)
    xform(mb, M, s0)
    tag(mb, f0, wk=0.5)
    return M @ Vector((0, 0, size + 0.12))


def stone_anchor(mb, p, r, rot_z=0.0, tilt=0.0):
    """A pierced stone anchor: a flat, tapering slab with its rope hole, lying in the sand."""
    ax = zaxes(rot_z)
    T = Matrix.Rotation(tilt, 3, ax[1])
    ax = tuple(T @ v for v in ax)
    f0 = len(mb.f)
    p = Vector(p)
    box(mb, p, (1.0 * r, 1.25 * r, 0.32 * r), PAL['rock_light'], PT['rock'], axes=ax, skip=('-z',))
    box(mb, p + ax[0] * 0.58 * r, (0.4 * r, 0.8 * r, 0.3 * r), PAL['rock_light'], PT['rock'], axes=ax, skip=('-z',))
    box(mb, p + ax[0] * 0.55 * r + ax[2] * 0.16 * r, (0.16 * r, 0.16 * r, 0.02), PAL['rock_dark'], 0, axes=ax, skip=('-z',))
    tag(mb, f0, wk=0.2)


def eyes_on(mb, P, u, t, sd, du=0.05, dt=0.14, off=0.03):
    """Painted ophthalmos on a shell side: white almond + dark iris, just proud of the planking."""
    alm = [(-1.0, 0.0), (-0.45, 0.42), (0.35, 0.4), (1.0, 0.0), (0.35, -0.3), (-0.45, -0.32)]
    iris = [(-0.12, -0.25), (0.32, -0.25), (0.32, 0.27), (-0.12, 0.27)]
    f0 = len(mb.f)
    for pts, col, o in ((alm, PAL['eye_white'], off), (iris, PAL['eye_black'], off * 1.8)):
        ids = [mb.vert(P(u + px * du, t + pz * dt, sd) + Vector((0, sd * o, 0))) for px, pz in pts]
        mb.face(ids if sd < 0 else ids[::-1], col, 0, jitter=0.0)
    tag(mb, f0, wk=0.6)


def house(mb, H, x0, x1, wk, h, roof_tilt=0.0, roof_dy=0.0):
    """Stern cabin: whitewashed timber walls + a terracotta-tiled roof (tilt/dy: slid half off)."""
    xc = (x0 + x1) / 2; zc = H.deck(xc); hw = H.half(xc) * wk
    box(mb, (xc, 0, zc + h / 2), (x1 - x0, 2 * hw, h), PAL['whitewash'], PT['boards'], skip=('-z',))
    ax = (X, Matrix.Rotation(roof_tilt, 3, 'X') @ Y, Matrix.Rotation(roof_tilt, 3, 'X') @ Z)
    f0 = len(mb.f)
    box(mb, (xc, roof_dy, zc + h + 0.12), (x1 - x0 + 0.4, 2 * hw + 0.5, 0.2), PAL['terracotta'], PT['tiles'], axes=ax)
    tag(mb, f0, wk=0.25)
    return xc, zc, hw


# =========================================================================== 1. the great hulk
def great_hulk(coll=None):
    """A 26 m Alexandrian grain ship laid up whole on the strand, keeled over with her back broken: ribs bare on the
    high side, her single great mast still standing (raked hard over) with a rag of linen under its long drooping
    yard, the stern cabin's roof slid off, the gilt swan-neck sternpost snapped (its head lies on the sand), a
    steering oar torn askew, a lead-stocked anchor run out on its cable, her amphorae tumbled out of the break."""
    L = 26.0; H = Hull(L, FORMS['grain']); rng = random.Random(101)
    mb, rg = MB(101), MB(102)
    liv = livery(PAL['pitch'], PAL['pitch'], PAL['timber_warm'], PAL['egypt_blue'], PAL['timber_dark'], band=PAL['ochre_red'])
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
        rod(pm, Vector((H.x(u0, 0), 0, H.zk(u0) + 0.3)), Vector((H.x(u1, 0), 0, H.zk(u1) + 0.3)), 0.2, PAL['timber_dark'], 4)
        deck_strip(pm, H, P, u0, u1, nu, PAL['deck'], hole=lambda u: rng.random() < 0.3)
        for u in (u0 + 0.03, u1 - 0.03) if nm == 'stern' else (u0 + 0.03,):
            zd = H.zt(u) - 0.2
            rod(pm, (H.x(u, zd), -H.w(u) * 0.95, zd), (H.x(u, zd), H.w(u) * 0.95, zd), 0.13, PAL['timber'], 4)
        pieces[nm] = (pm, P)
    sm, sP = pieces['stern']; bm, bP = pieces['bow']
    S = L / 13.0
    # ---- stern: snapped swan neck, stern cabin with its roof slid off, a steering oar torn askew
    st = H.stern()
    neck = arc(st + Vector((0.01 * L, 0, -0.02 * L)), 0.075 * L, 235, n=6)
    chain(sm, neck[:4], 0.016 * L + 0.03, 0.012 * L + 0.02, PAL['gilt_old'], 5)
    splinters(sm, neck[3], neck[3] - neck[2], 0.012 * L + 0.02, 0.5, PAL['bleach_light'], rng, 4)
    house(sm, H, st.x + 0.09 * L, st.x + 0.22 * L, 0.78, 1.8, roof_tilt=0.3, roof_dy=0.9)
    u = -0.78; xq = H.x(u, H.zt(u)); wq = H.w(u)
    steer_oar(sm, (xq + 0.02 * L, -(wq + 0.05), H.zt(u) + 0.1 * S), (xq - 0.12 * L, -(wq + 1.8), -H.dr * 0.4), 0.14, 0.11 * L, PAL['timber_dark'])
    shr_s = [sP(u, 1.0, -1) for u in (-0.3, -0.18)]
    # ---- bow: the mast (carchesium at its head), the long yard, the artemon snapped, the gilt stem ornament
    xf = H.x0 + 0.12 * L; zdf = H.deck(xf)
    mtop = Vector((xf, 0, zdf + 14.5))
    rod(bm, (xf, 0, zdf - 1.2), mtop, 0.36, PAL['timber_dark'], 6, r2=0.24)
    box(bm, mtop - Vector((0, 0, 0.4)), (0.75, 0.75, 0.9), PAL['timber_dark'], PT['boards'])
    yc = Vector((xf + 0.4, 0, zdf + 12.8))
    ya = yc + Vector((4.2, 6.6, 1.3)); yb = yc + Vector((-3.6, -6.2, -3.0))      # braced round, so the rag reads
    rod(bm, ya, yc, 0.13, PAL['timber_dark'], 4, r2=0.2); rod(bm, yc, yb, 0.2, PAL['timber_dark'], 4, r2=0.11)
    bw = H.bow()
    ad = Vector((math.sin(R(40)), 0, math.cos(R(40))))
    a0 = bw + Vector((-0.07 * L, 0, -0.6)); a1 = a0 + ad * 4.6
    rod(bm, a0, a1, 0.24, PAL['timber_dark'], 5, r2=0.19)
    splinters(bm, a1, ad, 0.19, 0.55, PAL['bleach_light'], rng, 4)
    chain(bm, [bw + Vector((-0.01 * L, 0, -0.02 * L)), bw + Vector((0.008 * L, 0, 0.03 * L)), bw + Vector((0.0, 0, 0.05 * L))],
          0.012 * L + 0.03, 0.008 * L + 0.02, PAL['gilt_old'], 4)
    shr_b = [bP(u, 1.0, -1) for u in (0.2, 0.32)]
    hawse_b = bP(0.9, 0.85, -1)
    # ---- pose: stern settled hard over, bow keeled less, pitched up and slewed
    Ms = settle(sm, rot(-34, 2, -3), 1.25)
    Mb = settle(bm, rot(-27, -8, 7, (0.9, -0.5, 0)), 0.95)
    mb.extend(sm); mb.extend(bm)
    # ---- world-frame dressing
    mt = Mb @ mtop
    for p in shr_b:
        sag_line(mb, Mb @ (mtop - Vector((0, 0, 3.0))), Mb @ p, 1.4, 0.045, n=3)
    for p in shr_s:      # the backstays, cut, hanging off the stern rail
        q = Ms @ p
        sag_line(mb, q, q + Vector((-0.6, -2.5, -q.z + 0.05)), 0.3, 0.045, n=2, floor=0.05)
    YA, YB = Mb @ ya, Mb @ yb
    top = [YA.lerp(YB, k / 12) + Vector((0, 0, -0.15)) for k in range(13)]
    cloth(rg, top, 7.4, 9, rng, mix(PAL['linen'], PAL['canvas_old'], 0.45), billow=(0.7, 0.4), folds=0.3, ragged=0.5, holes=0.04, tears=(4, 9))
    hang_line(mb, YB, YB.z, 0.035, rng)
    hang_line(mb, YA, YA.z, 0.035, rng, lie=2.0)
    sag_line(mb, mt, YA, 0.5, 0.04, n=2)
    # the artemon's top, broken off and lying on the sand
    m0 = Vector((-1.0, 9.5, 0.3)); m1 = Vector((-8.0, 12.0, 0.12))
    rod(mb, m0, m1, 0.2, PAL['timber_dark'], 5, r2=0.14)
    splinters(mb, m0, (m0 - m1), 0.2, 0.45, PAL['bleach_light'], rng, 4)
    sag_line(mb, Mb @ a1, m0.lerp(m1, 0.4), 0.8, 0.04, n=3, floor=0.04)
    # the swan's head, snapped off the sternpost, lying on the sand astern
    hd = arc(Vector((0, 0, 0)), 0.075 * L, 235, n=6)[3:]
    Mh = Matrix.Translation((-15.8, -4.6, 0.45)) @ Matrix.Rotation(R(-80), 4, 'X') @ Matrix.Rotation(R(20), 4, 'Z') @ Matrix.Translation(-hd[0])
    hd = [Mh @ q for q in hd]
    chain(mb, hd, 0.012 * L + 0.02, 0.009 * L + 0.02, PAL['gilt_old'], 5)
    splinters(mb, hd[0], hd[0] - hd[1], 0.012 * L + 0.02, 0.4, PAL['bleach_light'], rng, 3)
    # lead-stocked anchor run out across the sand on its cable
    hawse = Mb @ hawse_b
    anc = Vector((hawse.x + 6.5, hawse.y - 5.0, 0.3))
    ring = anchor_shape(mb, anc, 2.3, rot_z=0.5, lie=0.85)
    sag_line(mb, hawse, ring, 0.6, 0.075, PAL['rope'], n=4, floor=0.07)
    # her cargo, tumbled out of the break, and a few out of the open hold behind her
    spill(mb, (0.3, -5.6, 0), 9, rng, h=1.05, rx=3.6, ry=1.3, broken=0.35)
    spill(mb, (-0.5, 5.6, 0), 5, rng, h=1.05, rx=3.0, ry=1.5, broken=0.4)
    # sand drifted against her, weed and kelp at her foot
    drift(mb, (-6.0, -3.2, 0), 6.0, 1.8, 0.9, rot=R(-4), skew=(0.0, 1.0), seed=3)
    drift(mb, (5.5, -3.0, 0), 5.0, 1.6, 0.7, rot=R(6), skew=(0.0, 0.9), seed=4)
    for k in range(4):
        kelp(mb, (rng.uniform(-12, 12), rng.uniform(-7, -4.5), 0), (rng.uniform(-1, 1), rng.uniform(-1, 1)), rng.uniform(1.5, 3.0), 0.22, rng)
    return emit('wreck_great_hulk', 'great', L, 'sand', mb, rg, (L / 2 + 3.5, -4.0, 0.0), 11, coll, wl=0.75)


# =========================================================================== 2. the half-sunk merchantman
def merchant_sunk(coll=None):
    """An 18 m merchantman gone down by the stern in the shallows: her bow with its raked artemon and a rag of the
    bow sail stands out of the water, the mast raked aft with the yard hanging diagonal by one lift and a rag of
    the mainsail still bent to it, lashed amphorae on the foredeck and a few more awash around her."""
    L = 18.0; H = Hull(L, FORMS['merchant']); rng = random.Random(202)
    mb, rg = MB(202), MB(203)
    liv = livery(PAL['pitch'], PAL['pitch'], PAL['pitch'], PAL['ochre_red'], PAL['timber_dark'], band=PAL['ochre_yel'])

    def hole(u, t, sd):
        if u < -0.05 and t > 0.55 and rng.random() < 0.5:
            return True
        return sd < 0 and 0.15 < u < 0.4 and 0.45 < t < 0.85
    P = shell(mb, H, -0.35, 1.0, 8, 6, liv, hole)
    mb.backface(0, dark=0.5)
    deck_strip(mb, H, P, -0.35, 0.96, 8, PAL['deck'], hole=lambda u: u < 0.0 or rng.random() < 0.25)
    for u in (0.2, 0.28):
        rib(mb, inset(P, 0.12), u, -1, 0.4, 1.05, 0.11, PAL['timber'], n=2, segs=4)
    # the mast + carchesium; the yard hanging by its starboard lift
    xm = H.x0 + 0.03 * L; zdm = H.deck(xm)
    mtop = Vector((xm, 0, zdm + 13.5))
    rod(mb, (xm, 0, zdm - 0.8), mtop, 0.24, PAL['timber'], 6, r2=0.16)
    box(mb, mtop - Vector((0, 0, 0.3)), (0.5, 0.5, 0.65), PAL['timber_dark'], PT['boards'])
    yc = Vector((xm + 0.3, 0, zdm + 11.6))
    ya = yc + Vector((0.4, 5.4, 0.5)); yb = yc + Vector((-0.8, -5.6, -6.0))
    rod(mb, ya, yb, 0.13, PAL['timber'], 4, r2=0.09)
    # the artemon raked over the bow, its little yard still crossed
    bw = H.bow()
    ad = Vector((math.sin(R(42)), 0, math.cos(R(42))))
    a0 = bw + Vector((-0.08 * L, 0, -0.4)); a1 = a0 + ad * 6.2
    rod(mb, a0, a1, 0.14, PAL['timber'], 5, r2=0.09)
    ac = a0 + ad * 5.4
    aa, ab = ac + Vector((0.1, 2.3, 0.1)), ac + Vector((-0.1, -2.2, -0.7))
    rod(mb, aa, ab, 0.06, PAL['timber'], 4)
    chain(mb, [bw + Vector((-0.01 * L, 0, -0.02 * L)), bw + Vector((0.008 * L, 0, 0.035 * L)), bw + Vector((0.0, 0, 0.06 * L))],
          0.012 * L + 0.03, 0.008 * L + 0.02, PAL['timber_dark'], 4)
    # deck cargo forward: amphorae still lashed upright
    for x in (H.x0 + 0.26 * L, H.x0 + 0.31 * L):
        for y in (-H.B * 0.14, H.B * 0.14):
            amphora(mb, (x, y, H.deck(x) - 0.05), (rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 1), 1.05,
                    mix(PAL['amphora'], PAL['terracotta'], rng.random() * 0.4))
    shr = [P(u, 1.0, sd) for u in (0.0, 0.08) for sd in (1, -1)]
    M = rot(12, -24, 0, (0, 0, 0))
    zb = M @ P(-0.35, 0.5, 1)
    M = Matrix.Translation((0, 0, -3.0 - zb.z)) @ M
    xform(mb, M)
    MT = M @ mtop
    sag_line(mb, MT - Vector((0, 0, 0.4)), M @ a1, 1.4, 0.035, n=3)                         # forestay, slack
    for p in shr:
        sag_line(mb, M @ (mtop - Vector((0, 0, 1.5))), M @ p, 0.8, 0.035, n=2)
    sag_line(mb, MT, M @ ya, 0.15, 0.03, n=2)                                                # the lift that holds
    YA, YB = M @ ya, M @ yb
    rag(rg, [YA.lerp(YB, k / 5) for k in range(6)], 5.0, 4, rng, mix(PAL['linen'], PAL['canvas_old'], 0.4), holes=0.25,
        billow=(-0.5, -1.2), ragged=0.6)
    AA, AB = M @ aa, M @ ab
    rag(rg, [AA.lerp(AB, k / 3) for k in range(4)], 2.4, 3, rng, mix(PAL['linen'], PAL['canvas_old'], 0.4), holes=0.25,
        billow=(0.4, -0.6), ragged=0.7)
    hang_line(mb, YB, YB.z + 0.6, 0.03, rng)
    pin = [(M @ P(u, 0.5, sd), (M.to_3x3() @ Vector((0, sd, 0))).normalized()) for u in (0.55, 0.65, 0.75, 0.85) for sd in (1, -1)]
    bar = []
    for p, n in pin:
        if -0.4 < p.z < 0.9:
            for k in range(3):
                bar.append((p + Vector((rng.uniform(-0.6, 0.6), 0, rng.uniform(-0.25, 0.25))), n))
    barnacles(mb, bar, rng, 0.1)
    # amphorae awash in the shallows off her bow
    bx = (M @ bw).x
    spill(mb, (bx - 3.0, -4.2, 0), 5, rng, h=1.0, rx=3.0, ry=1.6, broken=0.2, upright=0.0, z=-0.2)
    return emit('wreck_merchant_sunk', 'sunk', L, 'water', mb, rg, (L * 0.5 + 2.0, 7.5, 0.0), 22, coll, cull=-1.6)


# =========================================================================== 3. the rib cage
def rib_cage(coll=None):
    """A 16 m corbita rotted to her bones: keel, the concave stem and the curled sternpost, ribs arching out of the
    sand, a few low strakes, the belly filled with sand, weed hanging off the frame heads; broken amphorae and her
    stone anchor half buried beside her."""
    L = 16.0; H = Hull(L, FORMS['corbita']); rng = random.Random(303)
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
    # keel, stem, sternpost with its curl
    rod(mb, (H.x(-0.98, 0), 0, H.zk(-0.98) + 0.2), (H.x(0.98, 0), 0, H.zk(0.98) + 0.2), 0.26, PAL['timber_dark'], 4)
    stem = [Vector((H.x(1.0, z), 0, z)) for z in (H.zk(1.0), H.zk(1.0) + 0.5 * (H.zt(1.0) - H.zk(1.0)), H.zt(1.0) + 0.9)]
    for a, b in zip(stem, stem[1:]):
        rod(mb, a, b, 0.24, PAL['bleach'], 4, r2=0.2)
    sp = Vector((H.x(-1.0, H.zt(-1)), 0, H.zt(-1)))
    rod(mb, (H.x(-1.0, H.zk(-1)), 0, H.zk(-1)), sp, 0.24, PAL['timber_dark'], 4, r2=0.2)
    chain(mb, arc(sp, 0.06 * L, 150, n=4), 0.2, 0.13, PAL['bleach'], 4)
    for u in (-0.3, 0.25):
        zd = H.zt(u) - 0.3
        rod(mb, (H.x(u, zd), -H.w(u) * 0.95, zd), (H.x(u, zd) + 0.5, H.w(u) * 0.7, zd - 0.6), 0.12, PAL['bleach'], 4)
    M = settle(mb, rot(-6, 2, 0), 0.0)
    zt = (M @ P(0.0, 0.32, 1)).z
    xform(mb, Matrix.Translation((0, 0, -zt)))
    drift(mb, (0.0, 0.0, 0.0), L * 0.33, H.B * 0.27, 0.5, seed=31)                 # her belly full of sand
    drift(mb, (-2.0, -H.B * 0.62, 0.0), 6.0, 1.6, 0.6, rot=R(-3), skew=(0, 1.0), seed=32)
    drift(mb, (4.5, -H.B * 0.58, 0.0), 4.0, 1.3, 0.5, rot=R(5), skew=(0, 0.8), seed=33)
    spill(mb, (1.5, -H.B * 0.95, 0), 4, rng, h=0.95, rx=2.5, ry=0.7, broken=0.8, upright=0.5)
    stone_anchor(mb, (L / 2 - 1.0, -H.B * 0.9, 0.05), 0.9, rot_z=0.7, tilt=0.12)
    for k in range(6):
        kelp(mb, (rng.uniform(-7, 7), rng.uniform(-4.5, -2.5), 0), (rng.uniform(-1, 1), -1), rng.uniform(1.2, 2.4), 0.2, rng)
    return emit('wreck_rib_cage', 'ribs', L, 'sand', mb, None, (L / 2 + 2.5, -3.2, 0.0), 33, coll, wl=0.4)


# =========================================================================== 4. capsized
def capsized(coll=None):
    """A 13 m Greek merchantman turned turtle: her bare bottom planking to the sky, sun-silvered to grey-brown
    timber, keel up, one steering oar still lashed and pointing at the sky, barnacles thick along her old waterline
    and crusted in clusters over the bottom, a painted eye on her bow, one gunwale buried in a drift, a hole stove
    in her bilge, a few amphorae spilled from under her."""
    L = 13.0; H = Hull(L, FORMS['greek']); rng = random.Random(404)
    mb = MB(404)
    bottom = set()          # face indices of the bottom planking

    def colf(u, t, sd):
        if t < 0.4:
            v = vnoise((u * 3, t * 4, sd), 1.0, 4)
            c = mix(mix(PAL['timber_grey'], PAL['timber_dark'], 0.2 + 0.3 * v), PAL['timber_wet'], 0.35 * smoothstep(0.25, 0.4, t))
            bottom.add(len(mb.f))   # shell() adds this face next
            return c, PT['strakes']
        if t < 0.47:
            return PAL['ochre_red'], PT['strakes']
        if t < 0.88:
            return PAL['pitch'], PT['strakes']
        return PAL['ochre_red'], PT['strakes']

    def hole(u, t, sd):
        return sd > 0 and -0.2 < u < 0.15 and 0.05 < t < 0.42
    P = shell(mb, H, -1.0, 1.0, 10, 6, colf, hole)
    for i in bottom:
        mb.f[i]['wk'] = 0.55          # half the sun bleach: grey-brown, not silver on the sand
    transom(mb, P, -1.0, (0.2, 0.45, 0.7, 1.0), PAL['pitch'])
    mb.backface(0, dark=0.45)
    Q = inset(P, 0.1)
    for u in (-0.2, -0.1, 0.0, 0.1, 0.17):
        rib(mb, Q, u, 1, 0.0, 0.55, 0.1, PAL['timber'], n=2, segs=4)
    splinters(mb, P(-0.02, 0.24, 1), Vector((0, 1, -0.3)), 0.5, 0.6, PAL['bleach_light'], rng, 4)
    rod(mb, (H.x(-1, H.zk(-1)), 0, H.zk(-1) - 0.12), (H.x(1, 0), 0, H.zk(1) - 0.12), 0.14, PAL['timber_dark'], 4)
    eyes_on(mb, P, 0.8, 0.68, 1)
    # the starboard steering oar, still lashed at the quarter: upside down it points at the sky
    u = -0.78; xq = H.x(u, H.zt(u)); wq = H.w(u)
    steer_oar(mb, (xq + 0.3, wq + 0.08, H.zt(u) + 0.1), (xq - 1.3, wq + 0.35, H.zk(u) - 1.7), 0.08, 1.5, PAL['timber_dark'])
    pts = []
    for k in range(26):
        u = rng.uniform(-0.85, 0.85); sd = rng.choice((1, -1))
        t = 0.44 + rng.uniform(-0.05, 0.12) if rng.random() < 0.75 else rng.uniform(0.1, 0.4)
        pts.append((P(u, t, sd), Vector((0, sd, -0.3))))
    barnacles(mb, pts, rng, 0.11)
    crust = []
    for k in range(6):
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
    # the port steering oar, torn away, on the sand
    steer_oar(mb, (2.2, -H.B * 0.95, 0.1), (5.6, -H.B * 1.5, 0.06), 0.06, 1.3, PAL['bleach'])
    sag_line(mb, (H.x(1, 0) - 0.2, 0, 0.6), (H.x(1, 0) + 3.0, 1.5, 0.05), 0.2, 0.035, PAL['rope'], n=3, floor=0.04)
    spill(mb, (-2.5, -H.B * 1.15, 0), 4, rng, h=0.9, rx=1.8, ry=0.6, broken=0.5)
    for k in range(4):
        kelp(mb, (rng.uniform(-6, 6), rng.uniform(-5, -3.5), 0), (rng.uniform(-1, 1), -1), rng.uniform(1.0, 2.0), 0.18, rng)
    return emit('wreck_capsized', 'capsized', L, 'sand', mb, None, (L / 2 + 2.0, -2.4, 0.0), 44, coll, wl=0.45)


# =========================================================================== 5. burned
def burned(coll=None):
    """A 15 m galley burned to her bilges: charred frames standing ragged, black planking scalloped by the fire, the
    bronze ram still at her forefoot (green with verdigris), a stump of a mast, a fallen blackened yard, charred
    oars and planks thrown on the sand, ash and cinders drifted in her."""
    L = 15.0; H = Hull(L, FORMS['galley']); rng = random.Random(505)
    mb = MB(505)

    def colf(u, t, sd):
        v = vnoise((u * 5, t * 5, sd), 1.0, 5)
        c = mix(PAL['char'], PAL['char2'], v)
        if t > 0.48:
            c = mix(c, PAL['ember'], 0.5 * v)
        if t < 0.3:
            c = mix(PAL['pitch'], c, 0.5)
        return c, PT['strakes']

    def hole(u, t, sd):
        edge = 0.42 + 0.3 * fbm((u * 3.0, sd, 0), 1.0, 8) - 0.18 * (1 - abs(u))
        return t > edge or (abs(u) < 0.2 and t > 0.33 and sd > 0)
    P = shell(mb, H, -1.0, 1.0, 10, 7, colf, hole)
    for f in mb.f:
        f['wk'] = 0.25; f['salt'] = False
    mb.backface(0, dark=0.6)
    Q = inset(P, 0.08)
    f0 = len(mb.f)
    for k in range(9):
        u = -0.8 + 1.6 * k / 8
        for sd in (1, -1):
            t1 = 0.6 + 0.55 * rng.random()
            pts = rib(mb, Q, u, sd, 0.1, t1, 0.11, PAL['char'], n=3, segs=3, wobble=0.3, rng=rng)
            if rng.random() < 0.5:
                splinters(mb, pts[-1], pts[-1] - pts[-2], 0.1, 0.3, PAL['char2'], rng, 3)
    rod(mb, (H.x(-1, H.zk(-1)), 0, H.zk(-1) + 0.2), (H.x(1, 0), 0, H.zk(1) + 0.2), 0.2, PAL['char'], 4)
    xm = H.x0 + 0.06 * L
    rod(mb, (xm, 0, H.zk(0.1) + 0.3), (xm + 0.15, 0, H.fb + 1.8), 0.24, PAL['char'], 6, r2=0.2)
    splinters(mb, Vector((xm + 0.15, 0, H.fb + 1.8)), Vector((0, 0, 1)), 0.2, 0.7, PAL['char2'], rng, 4)
    stem = [Vector((H.x(1.0, z), 0, z)) for z in (H.zk(1.0), H.zt(1.0) * 0.5, H.zt(1.0) + 0.4)]
    for a, b in zip(stem, stem[1:]):
        rod(mb, a, b, 0.18, PAL['char'], 4)
    sp = [Vector((H.x(-1.0, z), 0, z)) for z in (H.zk(-1.0), H.zt(-1.0) * 0.6, H.zt(-1.0) + 0.6)]
    for a, b in zip(sp, sp[1:]):
        rod(mb, a, b, 0.18, PAL['char'], 4)
    for f in mb.f[f0:]:
        f['wk'] = 0.15; f['salt'] = False
    # the bronze ram: the one thing the fire could not take
    f1 = len(mb.f)
    xf = H.x(1.0, 0.0); bz = mix(PAL['bronze'], PAL['verdigris'], 0.45)
    rod(mb, (xf - 0.03 * L, 0, 0.02), (xf + 0.075 * L, 0, 0.02), 0.022 * L, bz, 4, r2=0.012 * L, cap=True)
    box(mb, (xf + 0.07 * L, 0, 0.02), (0.02 * L, 0.06 * L, 0.012 * L), bz)
    tag(mb, f1, wk=0.1, salt=False)
    M = settle(mb, rot(9, -2, 0), 0.0)
    zt = (M @ P(0.0, 0.3, 1)).z
    xform(mb, Matrix.Translation((0, 0, -zt)))
    drift(mb, (0.5, 0.0, 0.0), L * 0.33, H.B * 0.3, 0.4, col=PAL['ash'], seed=51)            # ash and cinders inside
    drift(mb, (-1.0, -H.B * 0.75, 0.0), 5.0, 1.5, 0.55, rot=R(-4), skew=(0, 1.0), seed=52)
    y0 = Vector((-3.0, -H.B * 1.1, 0.2)); y1 = Vector((-9.5, -H.B * 2.0, 0.08))
    rod(mb, y0, y1, 0.14, PAL['char'], 4, r2=0.09)
    splinters(mb, y0, y0 - y1, 0.13, 0.35, PAL['char2'], rng, 3)
    for k in range(7):     # charred oars and planks thrown on the sand
        c = Vector((rng.uniform(-8, 8), rng.choice((-1, 1)) * rng.uniform(H.B * 1.2, H.B * 2.6), 0.05))
        a = rng.uniform(0, 3.14)
        if k < 4:
            d = Vector((math.cos(a), math.sin(a), 0)); ln = rng.uniform(3.0, 4.5)
            steer_oar(mb, c - d * ln / 2, c + d * ln / 2, 0.05, 0.9, PAL['char2'])
        else:
            box(mb, c, (rng.uniform(1.6, 3.0), 0.28, 0.08), PAL['char2'], PT['boards'], axes=zaxes(a))
    return emit('wreck_burned', 'burned', L, 'sand', mb, None, (L / 2 + 2.2, -3.0, 0.0), 55, coll, wl=0.35)


# =========================================================================== 6. the stern section
def stern_section(coll=None):
    """The after third of a 22 m grain ship, torn off at the mast and stood on the strand stern-high: the gilt
    swan-neck sternpost, the stern cabin with its gallery and tiled roof, both steering oars (one hanging askew), her
    broken forward end a fan of ribs and plank ends, amphorae spilled out of it across the sand."""
    L = 22.0; H = Hull(L, FORMS['grain']); rng = random.Random(606)
    mb = MB(606)
    liv = livery(PAL['pitch'], PAL['pitch'], PAL['timber_warm'], PAL['gilt_old'], PAL['timber_dark'], band=PAL['egypt_blue'])
    U1 = -0.3
    S = L / 13.0

    def hole(u, t, sd):
        return u > U1 - 0.12 and t > 0.2 and rng.random() < 0.55
    P = shell(mb, H, -1.0, U1, 6, 7, liv, hole)
    transom(mb, P, -1.0, (0.4, 0.6, 0.8, 1.0), PAL['timber_warm'])
    mb.backface(0, dark=0.5)
    Q = inset(P, 0.14)
    for u in (U1 - 0.1, U1 - 0.05, U1, U1 + 0.04):
        for sd in (1, -1):
            if rng.random() < 0.85:
                rib(mb, Q, u, sd, 0.05, 1.0 + 0.12 * rng.random(), 0.14, PAL['timber'], n=3, segs=4, wobble=0.35, rng=rng)
    deck_strip(mb, H, P, -0.98, U1 - 0.04, 5, PAL['deck'], hole=lambda u: u > -0.62 and rng.random() < 0.7)
    zd = H.zt(U1 - 0.04) - 0.2
    rod(mb, (H.x(U1 - 0.04, zd), -H.w(U1) * 0.95, zd), (H.x(U1 - 0.04, zd), H.w(U1) * 0.95, zd), 0.13, PAL['timber'], 4)
    # the gilt swan neck, whole
    st = H.stern()
    neck = arc(st + Vector((0.01 * L, 0, -0.02 * L)), 0.052 * L, 235, n=6)
    chain(mb, neck, 0.011 * L + 0.03, 0.006 * L + 0.02, PAL['gilt_old'], 5)
    e = neck[-1]; d = (neck[-1] - neck[-2]).normalized()
    box(mb, e + d * 0.015 * L, (0.045 * L, 0.018 * L, 0.018 * L), PAL['gilt_old'], axes=(d, Y, d.cross(Y)))
    # stern cabin: whitewashed walls, a gallery of posts, the tiled roof
    x0, x1 = st.x + 0.08 * L, st.x + 0.19 * L
    xc, zc, hw = house(mb, H, x0, x1, 0.76, 1.6)
    for k in range(4):
        x = x0 - 0.2 + (x1 - x0 + 0.4) * k / 3
        for sd in (-1, 1):
            rod(mb, (x, sd * (hw + 0.2), zc + 0.9), (x, sd * (hw + 0.2), zc + 1.7), 0.06, PAL['whitewash'], 3)
    # steering oars: starboard still shipped, port hanging askew off its broken lashing
    u = -0.78; xq = H.x(u, H.zt(u)); wq = H.w(u)
    steer_oar(mb, (xq + 0.02 * L, wq + 0.05, H.zt(u) + 0.08 * S), (xq - 0.11 * L, wq + 0.35, -H.dr * 0.9), 0.12, 0.1 * L, PAL['timber_dark'])
    steer_oar(mb, (xq + 0.02 * L, -(wq + 0.05), H.zt(u) + 0.08 * S), (xq - 0.05 * L, -(wq + 1.9), -H.dr * 1.2), 0.12, 0.1 * L, PAL['timber_dark'])
    brk = [P(U1, 0.45, 1), P(U1, 0.45, -1)]
    M = settle(mb, rot(-19, 21, 0), 1.6)
    bc = (M @ brk[0]).lerp(M @ brk[1], 0.5)
    drift(mb, (-1.0, -3.3, 0), 4.5, 1.6, 0.8, skew=(0, 1.0), seed=61)
    drift(mb, (-2.5, 2.8, 0), 5.0, 1.6, 0.6, skew=(0, -0.8), seed=62)
    spill(mb, (bc.x + 2.4, bc.y - 0.6, 0), 7, rng, h=1.0, rx=2.4, ry=2.6, broken=0.4)
    for k in range(4):
        kelp(mb, (rng.uniform(-10, 2), rng.uniform(-5, -3.5), 0), (rng.uniform(-1, 1), -1), rng.uniform(1.0, 2.2), 0.2, rng)
    return emit('wreck_stern_section', 'stern', 8.5, 'sand', mb, None, (2.5, -4.0, 0.0), 66, coll, wl=0.5)


# =========================================================================== 7. wrecked skiff
def skiff(coll=None):
    """A 5 m fishing boat, planks stove in on one side, half full of sand, thwart broken, an oar snapped, her
    little stern curl still standing, a broken amphora beside her."""
    L = 5.0; H = Hull(L, FORMS['fisher']); rng = random.Random(707)
    mb = MB(707)
    liv = livery(PAL['pitch'], PAL['ochre_red'], PAL['timber_pale'], PAL['egypt_blue'], PAL['timber_dark'])

    def hole(u, t, sd):
        return sd > 0 and -0.1 < u < 0.35 and 0.35 < t < 0.95 and rng.random() < 0.75
    P = shell(mb, H, -1.0, 1.0, 6, 4, liv, hole)
    transom(mb, P, -1.0, (0.3, 0.65, 1.0), PAL['timber_pale'])
    mb.backface(0, col=PAL['bleach'], dark=0.85)
    for u in (0.0, 0.2):
        rib(mb, inset(P, 0.05), u, 1, 0.15, 1.0, 0.05, PAL['bleach'], n=2, segs=3)
    chain(mb, arc(H.stern() + Vector((0.01 * L, 0, -0.02 * L)), 0.06 * L, 170, n=4), 0.07, 0.045, PAL['timber_dark'], 4)
    chain(mb, [H.bow() + Vector((-0.02 * L, 0, -0.02 * L)), H.bow() + Vector((0.01 * L, 0, 0.05 * L))], 0.06, 0.045, PAL['timber_dark'], 4)
    zt = H.fb * 0.75
    box(mb, (H.x(-0.4, zt), 0, zt), (0.25, H.w(-0.4) * 1.9, 0.06), PAL['timber_pale'], PT['planks_y'])
    box(mb, (H.x(0.3, zt), -H.w(0.3) * 0.45, zt - 0.15), (0.25, H.w(0.3) * 1.0, 0.06), PAL['timber_pale'], PT['planks_y'],
        axes=(X, Vector((0, math.cos(0.4), math.sin(0.4))), Vector((0, -math.sin(0.4), math.cos(0.4)))))
    rod(mb, (-1.6, -0.3, zt + 0.08), (1.0, -0.55, zt + 0.15), 0.035, PAL['bleach'], 4)
    splinters(mb, Vector((1.0, -0.55, zt + 0.15)), Vector((1, -0.1, 0.05)), 0.035, 0.18, PAL['bleach_light'], rng, 3)
    M = settle(mb, rot(19, -3, 0), 0.3)
    drift(mb, (0.0, 0.0, 0.0), L * 0.32, H.B * 0.28, 0.45, seed=71)
    drift(mb, (0.2, -H.B * 0.75, 0.0), 2.8, 1.1, 0.55, skew=(0, 0.6), seed=72)
    box(mb, (2.6, 1.9, 0.04), (1.0, 0.13, 0.03), PAL['bleach'], 0, axes=zaxes(math.atan2(0.6, 0.8)))
    rod(mb, (2.95, 2.15, 0.05), (4.2, 3.1, 0.05), 0.035, PAL['bleach'], 4)
    spill(mb, (-2.4, -1.9, 0), 2, rng, h=0.8, rx=0.6, ry=0.3, broken=0.6)
    for k in range(3):
        kelp(mb, (rng.uniform(-2, 2), rng.uniform(-2.2, -1.6), 0), (rng.uniform(-1, 1), -1), rng.uniform(0.8, 1.4), 0.15, rng)
    return emit('wreck_skiff', 'skiff', L, 'sand', mb, None, (L / 2 + 1.4, -1.8, 0.0), 77, coll, wl=0.18)


# =========================================================================== 8. upturned dinghy
def dinghy(coll=None):
    """A 3.4 m plank boat (the big ship's tender) turned over on the sand, one gunwale propped on a drift log, a hole
    in her pitched bottom."""
    L = 3.4; H = Hull(L, FORMS['fisher']); rng = random.Random(808)
    mb = MB(808)

    def colf(u, t, sd):
        if t < 0.38:
            return PAL['pitch'], PT['strakes']
        if t < 0.9:
            return PAL['timber_pale'], PT['strakes']
        return PAL['ochre_red'], PT['boards']

    def hole(u, t, sd):
        return sd < 0 and -0.3 < u < 0.05 and 0.1 < t < 0.45
    P = shell(mb, H, -1.0, 1.0, 6, 4, colf, hole)
    transom(mb, P, -1.0, (0.3, 0.65, 1.0), PAL['timber_pale'])
    mb.backface(0, col=PAL['cream'], dark=0.8)
    for u in (-0.2, -0.05):
        rib(mb, inset(P, 0.04), u, -1, 0.0, 0.5, 0.04, PAL['bleach'], n=2, segs=3)
    for u in (-0.45, 0.25):     # thwarts
        zt = H.fb * 0.62; x = H.x(u, zt)
        box(mb, (x, 0, zt), (0.22, H.w(u) * 1.8, 0.05), PAL['timber'], PT['planks_y'])
    rod(mb, (H.x(-1, 0), 0, H.zk(-1) - 0.04), (H.x(1, 0), 0, H.zk(1) - 0.04), 0.05, PAL['timber_dark'], 4)
    rod(mb, (-0.9, 0.2, H.fb * 0.7), (1.0, -0.15, H.fb * 0.75), 0.03, PAL['bleach'], 4)            # an oar left in her
    M = settle(mb, rot(66, 0, 8), 0.25)
    drift(mb, (0.0, 0.9, 0), 2.0, 0.7, 0.4, skew=(0, -0.3), seed=81)
    bw = M @ Vector((H.x(1, H.fb), 0, H.zt(1)))
    sag_line(mb, bw, (bw.x + 1.4, bw.y - 0.9, 0.03), 0.1, 0.025, PAL['rope'], n=3, floor=0.03)
    return emit('wreck_dinghy', 'dinghy', L, 'sand', mb, None, (L / 2 + 1.0, -1.4, 0.0), 88, coll, wl=0.12)


# =========================================================================== 9. the mast stump
def mast_stump(coll=None):
    """All that shows of a ship the sand has swallowed: her mast standing raked out of the strand, snapped above the
    yard, the yard hanging diagonal from one lift with a rag of linen, slack shrouds into the sand, a ring of frame
    heads tracing the buried hull, amphora necks poking out of the sand, her stone anchor, a gull keeping watch."""
    rng = random.Random(909)
    mb, rg = MB(909), MB(910)
    lean = Matrix.Rotation(R(-14), 4, 'Y') @ Matrix.Rotation(R(5), 4, 'X')
    base = Vector((0, 0, -0.8)); top = lean @ Vector((0, 0, 9.0))
    rod(mb, base, top, 0.34, PAL['timber_dark'], 6, r2=0.24)
    splinters(mb, top, top.normalized(), 0.23, 0.55, PAL['bleach_light'], rng, 4)
    tp = lean @ Vector((0, 0, 7.2))
    for sd in (1, -1):
        e = tp + Vector((0, sd * 0.3, 0))
        sag_line(mb, e, (rng.uniform(-2, 2) + 1.0, sd * 4.5, 0.03), 0.7, 0.035, n=3, floor=0.03)
    ya = lean @ Vector((0, 0, 6.4)) + Vector((0.4, 3.4, 1.0))
    yb = Vector((1.8, -4.2, 0.1))
    rod(mb, ya, yb, 0.16, PAL['timber_dark'], 4, r2=0.11)
    sag_line(mb, top - Vector((0, 0, 0.4)), ya, 0.2, 0.03, n=2)
    rag(rg, [ya.lerp(yb, k / 4) for k in range(4)], 2.8, 3, rng, mix(PAL['linen'], PAL['canvas_old'], 0.4), holes=0.3, billow=(0.9, 0.0), ragged=0.7)
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
    spill(mb, (-2.0, -0.6, 0), 4, rng, h=0.95, rx=2.6, ry=1.0, broken=0.6, upright=0.6)
    stone_anchor(mb, (4.2, -3.4, 0.05), 0.8, rot_z=-0.4, tilt=0.15)
    rock(mb, (-3.0, 1.2, 0.0), 0.7, rng, weed=0.5)
    rock(mb, (-3.7, 0.4, 0.0), 0.45, rng, weed=0.5)
    gull(mb, top + Vector((0, 0, 0.2)), 1.2, rng)
    for k in range(3):
        kelp(mb, (rng.uniform(-4, 4), rng.uniform(-3, -2), 0), (rng.uniform(-1, 1), -1), rng.uniform(1.0, 1.8), 0.18, rng)
    return emit('wreck_mast_stump', 'stump', 14.0, 'sand', mb, rg, (3.4, -3.2, 0.0), 99, coll, wl=0.35)


WRECKS = [
    # id, builder, size class, budget
    ('great_hulk', great_hulk, 'great', 2500),
    ('merchant_sunk', merchant_sunk, 'large', 1200),
    ('stern_section', stern_section, 'large', 1200),
    ('capsized', capsized, 'medium', 1200),
    ('burned', burned, 'medium', 1200),
    ('rib_cage', rib_cage, 'medium', 1200),
    ('mast_stump', mast_stump, 'small', 1200),
    ('skiff', skiff, 'small', 1200),
    ('dinghy', dinghy, 'tiny', 1200),
]
