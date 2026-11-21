"""Top-10 Major Titans #1-#5: USDT, USDC, USDe, DAI, USDS.

Hard clearance & budget compliance (PLAN.md §3):
  #1 titan_usdt  flagship  32.0 x 7.80 m  target ~3,100 (cap 3,600)
  #2 titan_usdc  flagship  28.5 x 7.60 m  target ~2,950 (cap 3,600)
  #3 titan_usde  large     22.0 x 5.05 m  target ~2,600 (cap 3,000)
  #4 titan_dai   large     21.2 x 6.20 m  target ~2,550 (cap 3,000)
  #5 titan_usds  large     21.8 x 6.15 m  target ~2,600 (cap 3,000)
"""
import math
from mathutils import Vector
from hb_lib import PAL, PT, rod, line, box, box2
from hb_hulls import SCH
from hb_ancient import arc
from tt_common import (
    TP, PT_EVERGREEN, TitanRig, gable, hip_roof, dome, torus_ring, column,
    quad_oriented, poly_oriented, face_oriented,
)


# =================================================================== #1 USDT: Sovereign Syracusia Grain Colossus
def build_usdt(coll=None):
    sch = SCH(
        top=TP['emerald'], band=TP['marble'], stripe=TP['gilt'], cap=TP['gilt'],
        deck=TP['timber_deck'], deck_in=TP['marble'], boot=TP['marble'], bottom=TP['pitch'],
        house=TP['marble'], roof=TP['gilt'], spar='timber_dark', cloth=TP['canvas_warm'],
        transom=TP['emerald'],
    )
    sch['deck_margin'] = TP['deck_dark']
    sch['pennant_a'], sch['pennant_b'] = TP['gilt'], TP['emerald']

    L = 32.0
    form = dict(
        br=7.80 / L, fb=0.130, dr=0.088, bow=2.3, stern=0.26, sheer=(0.34, 0.48),
        rb=0.052, rs=0.078, bul=0.028, rpow=1.3,
        fore_step=(0.62, 0.52), aft_step=(-0.48, 0.72), tumblehome=0.04, wale_out=0.10,
    )
    R = TitanRig('titan_usdt', 'flagship', L, form, sch, seed=101,
                 hull_pats=dict(stripe=PT['metal'], cap=PT['metal']))
    H, S = R.H, R.S
    dz = H.deck
    st, bw = H.stern(), H.bow()
    B = H.B

    # Stepped hull + 16 domed aged-bronze hoplite shields (8/side) + twin gilt steering oars
    R.dress_hull(n_sec=14, steering=True, steering_col=TP['gilt'], eyes_u=0.84, eye_scale=0.032)
    R.rail_shields(8, TP['bronze'], rim_col=TP['gilt'], u0=-0.50, u1=0.56, r_scale=0.0155)
    R.stem_post(TP['gilt'], 0.055)

    # Twin sweeping gilt crane-necks (cheniskoi) flanking the stern
    for sd in (-1, 1):
        R.crane_neck(st + Vector((0.012 * L, 0, -0.015 * L)), 0.062 * L, TP['gilt'],
                     y=sd * 0.032 * L, segs=5, head_scale=1.05)

    # 3 masts + artemon + 3 gilt carchesia
    green = TP['emerald_lt']
    R.mast_course(0.24, 0.58, 0.52, 0.14, green, r=0.78, carchesion_col=TP['gilt'], finial=TP['gilt'], nu=5, nv=4)
    R.mast_course(0.02, 0.85, 0.78, 0.12, green, main=True, siparum=True, carchesion_col=TP['gilt'], finial=TP['gilt'], nu=6, nv=5)
    R.mast_course(-0.20, 0.56, 0.45, 0.25, green, r=0.74, carchesion_col=TP['gilt'], finial=TP['gilt'], nu=5, nv=4)
    R.artemon_t(38, 0.28 * L, 0.22 * L, finial=TP['gilt'])
    R.stays()

    # Crenellated fore fighting turret (limestone ashlar + emerald belt + merlons)
    tx = H.x0 + 0.365 * L
    tw, ww, th = 0.068 * L, H.half(tx) * 1.32, 0.112 * L
    z0 = dz(tx)
    box2(R.deck, tx - tw * 0.5, -ww * 0.5, z0 - 0.15, tx + tw * 0.5, ww * 0.5, z0 + th, TP['marble'], PT['ashlar'], skip=('-z',), jitter=0.0)
    box2(R.deck, tx - tw * 0.54, -ww * 0.54, z0 + th * 0.62, tx + tw * 0.54, ww * 0.54, z0 + th * 0.76, TP['emerald'], 0, skip=('-z',), jitter=0.0)
    box2(R.deck, tx - tw * 0.58, -ww * 0.58, z0 + th, tx + tw * 0.58, ww * 0.58, z0 + th + 0.22, TP['gilt'], PT['metal'], skip=(), jitter=0.0)
    for cx in (-1, 1):
        for cy in (-1, 0, 1):
            box(R.deck, (tx + cx * tw * 0.44, cy * ww * 0.44, z0 + th + 0.44), (0.38, 0.38, 0.44), TP['marble'], PT['ashlar'], skip=('-z',), jitter=0.0)
    R.lod['boxes'].append((Vector((tx, 0, z0 + th * 0.5)), (tw, ww, th), TP['marble']))

    # Peristyle Temple of Aphrodite aft: 2-step stylobate, 10 fluted marble columns, glowing altar sanctuary, gilt tile roof
    x0, x1 = st.x + 0.08 * L, st.x + 0.255 * L
    xm = (x0 + x1) * 0.5
    z = dz(xm)
    w = min(H.half(x0), H.half(x1)) * 1.54
    m, g = TP['marble'], TP['gilt']
    # Two-step marble stylobate
    box2(R.deck, x0 - 0.14, -w * 0.52, z - 0.20, x1 + 0.14, w * 0.52, z + 0.22 * S, m, PT['ashlar'], skip=('-z',), jitter=0.0)
    box2(R.deck, x0, -w * 0.48, z + 0.22 * S, x1, w * 0.48, z + 0.42 * S, m, PT['ashlar'], skip=('-z',), jitter=0.0)
    zc0 = z + 0.42 * S
    ch = 1.48 * S
    zc1 = zc0 + ch
    # 10 fluted marble columns (4 along port, 4 along starboard, 1 fore-center, 1 aft-center = 10 columns!)
    col_xs = [x0 + 0.16 * S + (x1 - x0 - 0.32 * S) * i / 3.0 for i in range(4)]
    for i, cx in enumerate(col_xs):
        for sd in (-1, 1):
            column(R.deck, cx, sd * (w * 0.43), zc0, zc1, 0.115 * S, m, cap_col=g, segs=6)
        if i in (0, 3):
            column(R.deck, cx, 0.0, zc0, zc1, 0.115 * S, m, cap_col=g, segs=6)
    # Recessed emerald sanctuary cella + glowing altar sanctuary panes (hb_fleet_window)
    cx0, cx1, cyw = x0 + 0.42 * S, x1 - 0.42 * S, w * 0.26
    box2(R.deck, cx0, -cyw, zc0, cx1, cyw, zc1, TP['emerald'], PT['ashlar'], skip=('-z', '+z'), jitter=0.0)
    # Glowing sanctuary altar & arched cella windows on all 4 sides
    R.glow_pane((cx1 + 0.03, 0, zc0 + ch * 0.46), (0, cyw * 0.9, 0), (0, 0, ch * 0.62), (1, 0, 0), col=TP['win_gold'])
    R.glow_pane((cx0 - 0.03, 0, zc0 + ch * 0.46), (0, cyw * 0.9, 0), (0, 0, ch * 0.62), (-1, 0, 0), col=TP['win_gold'])
    for sd in (-1, 1):
        for fx in (0.30, 0.70):
            wx = cx0 + (cx1 - cx0) * fx
            R.glow_pane((wx, sd * (cyw + 0.03), zc0 + ch * 0.50), (0.34 * S, 0, 0), (0, 0, ch * 0.48), (0, sd, 0), col=TP['win_amber'])
    # Sanctuary gilt altar pedestal just ahead of the cella
    box(R.deck, (cx1 + 0.24 * S, 0, zc0 + 0.26 * S), (0.34 * S, 0.52 * S, 0.52 * S), m, PT['ashlar'], skip=('-z',), jitter=0.0)
    R.glow_box((cx1 + 0.24 * S, 0, zc0 + 0.58 * S), (0.24 * S, 0.36 * S, 0.22 * S), col=TP['win_gold'])

    # Gilt entablature, frieze, pitched gilt tile roof (PT['tiles']), emerald tympana & gilt acroteria
    box2(R.deck, x0 - 0.10, -w * 0.51, zc1, x1 + 0.10, w * 0.51, zc1 + 0.30 * S, g, PT['metal'], skip=(), jitter=0.0)
    gable(R.deck, x0 - 0.18, x1 + 0.18, -w * 0.53, w * 0.53, zc1 + 0.30 * S, 0.64 * S, g, TP['emerald'], roof_pat=PT['tiles'], ridge_col=g)
    for ax in (x0 - 0.12, xm, x1 + 0.12):
        rod(R.deck, (ax, 0, zc1 + 0.94 * S), (ax, 0, zc1 + (1.32 if ax == xm else 1.18) * S), 0.10 * S, g, 5, r2=0.02, cap=True, pat=PT['metal'])
    R.lod['boxes'].append((Vector((xm, 0, (z + zc1) * 0.5)), (x1 - x0, w, zc1 - z), m))
    R.lod['boxes'].append((Vector((xm, 0, zc1 + 0.45 * S)), (x1 - x0 + 0.3, w + 0.25, 0.90 * S), g))

    # Waist cargo house, framed hatch & terracotta amphora rack
    R.titan_house(H.x0 - 0.11 * L, H.x0 - 0.04 * L, 0.44, 0.68 * S, TP['marble'], TP['terracotta'], hip=True, pat=PT['ashlar'])
    R.hatch(H.x0 + 0.125 * L, 0.06 * L, B * 0.40, 0.30 * S, PAL['timber'], TP['gilt'])
    R.amphora_rack(H.x0 + 0.175 * L, H.x0 + 0.215 * L, [-B * 0.18, 0.0, B * 0.18], h=0.42 * S)

    # 4-pane stern quarter galleries + transom windows
    R.stern_gallery_windows(n=4, u_start=-0.84, u_step=0.052, z_drop=0.52)
    R.transom_windows(n=4, z_frac=0.66, h=0.45)
    return R


# =================================================================== #2 USDC: Imperial Deceres Astrolabe Flagship
def build_usdc(coll=None):
    sch = SCH(
        top=TP['navy'], band=TP['pentelic'], stripe=TP['cobalt_circle'], cap=TP['gilt'],
        deck=TP['timber_deck'], deck_in=TP['pentelic'], boot=TP['pentelic'], bottom=TP['pitch'],
        house=TP['pentelic'], roof=TP['cobalt_circle'], spar='timber_dark', cloth=TP['canvas_ivory'],
        transom=TP['navy'],
    )
    sch['deck_margin'] = TP['deck_dark']
    sch['pennant_a'], sch['pennant_b'] = TP['cobalt_circle'], TP['pentelic']

    L = 28.5
    form = dict(
        br=7.60 / L, fb=0.134, dr=0.088, bow=2.25, stern=0.28, sheer=(0.36, 0.56),
        rb=0.055, rs=0.075, bul=0.028, rpow=1.25,
        fore_step=(0.44, 0.64), aft_step=(-0.54, 0.80), tumblehome=0.035, wale_out=0.095,
    )
    R = TitanRig('titan_usdc', 'flagship', L, form, sch, seed=202, hull_pats=dict(cap=PT['metal']))
    H, S = R.H, R.S
    dz = H.deck
    st, bw = H.stern(), H.bow()
    B = H.B
    blue, white, g, brz = TP['cobalt_circle'], TP['pentelic'], TP['gilt'], TP['bronze']

    # Stepped hull + 12 white/cobalt shields (6/side) + gilt swan-neck + volute scroll prow
    R.dress_hull(n_sec=14, steering=True, steering_col=TP['bronze'], eyes_u=0.85, eye_scale=0.034,
                 shields=white, shield_rim=blue, n_shields=6, shield_u=(-0.52, 0.44))
    R.crane_neck(st + Vector((0.01 * L, 0, -0.015 * L)), 0.058 * L, g, y=0.0, segs=5)
    # Carved scroll prow curling forward from the stem
    prow_pts = arc(bw + Vector((-0.01 * L, 0, -0.01 * L)), 0.042 * L, 220, n=6, fwd=-1.0)
    R.post(prow_pts, 0.016 * L, 0.008 * L, g, segs=5)

    # 2 towering masts + artemon + 2 gilt carchesia
    R.mast_course(-0.07, 0.88, 0.78, 0.14, blue, main=True, siparum=True, carchesion_col=g, finial=g, nu=6, nv=5)
    R.mast_course(-0.29, 0.60, 0.46, 0.20, blue, r=0.78, carchesion_col=g, finial=g, nu=5, nv=4)
    R.artemon_t(40, 0.30 * L, 0.23 * L, finial=g)
    R.stays()

    # Midships Circular Gilded Tholos / Astrolabe Rotunda (8 white columns, dome, 3D intersecting brass armillary rings!)
    rx = H.x0 + 0.07 * L
    rz0 = dz(rx)
    rr = min(B * 0.29, 0.088 * L)
    # 2-step circular marble plinth
    rod(R.deck, (rx, 0, rz0 - 0.12), (rx, 0, rz0 + 0.24 * S), rr * 1.12, white, 10, cap=True, pat=PT['ashlar'], smooth=False)
    rod(R.deck, (rx, 0, rz0 + 0.24 * S), (rx, 0, rz0 + 0.42 * S), rr * 1.02, white, 10, cap=True, pat=PT['ashlar'], smooth=False)
    zc0 = rz0 + 0.42 * S
    ch = 1.40 * S
    zc1 = zc0 + ch
    # 8 white Pentelic marble columns around the circular tholos
    for k in range(8):
        ang = 2.0 * math.pi * k / 8.0
        cx = rx + rr * 0.86 * math.cos(ang)
        cy = rr * 0.86 * math.sin(ang)
        column(R.deck, cx, cy, zc0, zc1, 0.095 * S, white, cap_col=g, segs=5)
    # Glowing circular sanctuary rotunda core (8 outward-facing amber panes on hb_fleet_window)
    r_core = rr * 0.56
    for k in range(8):
        a0 = 2.0 * math.pi * k / 8.0
        a1 = 2.0 * math.pi * (k + 1) / 8.0
        am = 0.5 * (a0 + a1)
        p0 = (rx + r_core * math.cos(a0), r_core * math.sin(a0), zc0 + 0.08 * S)
        p1 = (rx + r_core * math.cos(a1), r_core * math.sin(a1), zc0 + 0.08 * S)
        p2 = (rx + r_core * math.cos(a1), r_core * math.sin(a1), zc1 - 0.08 * S)
        p3 = (rx + r_core * math.cos(a0), r_core * math.sin(a0), zc1 - 0.08 * S)
        quad_oriented(R.win, (p0, p1, p2, p3), (math.cos(am), math.sin(am), 0), TP['win_gold'])
    # Circular gilded entablature + ribbed dome
    rod(R.deck, (rx, 0, zc1), (rx, 0, zc1 + 0.24 * S), rr * 1.08, g, 10, cap=True, pat=PT['metal'], smooth=False)
    dome(R.deck, rx, 0, zc1 + 0.24 * S, rr * 0.94, 0.72 * S, blue, segs=8, rings=3, pat=PT['tiles'])
    # 3D intersecting brass/gilt armillary sphere rings crowning the dome!
    arm_c = Vector((rx, 0, zc1 + 1.48 * S))
    arm_r = rr * 0.56
    rod(R.deck, (rx, 0, zc1 + 0.90 * S), arm_c - Vector((0, 0, arm_r * 0.95)), 0.09 * S, brz, 5, pat=PT['metal'])
    torus_ring(R.deck, arm_c, arm_r, 0.055 * S, (1, 0, 0), (0, 0, 1), g, n_seg=10, t_seg=4, pat=PT['metal'])
    torus_ring(R.deck, arm_c, arm_r * 0.90, 0.050 * S, (0, 1, 0), (0, 0, 1), brz, n_seg=10, t_seg=4, pat=PT['metal'])
    torus_ring(R.deck, arm_c, arm_r * 0.82, 0.045 * S, (1, 0, 0.45), (0, 1, 0), g, n_seg=10, t_seg=4, pat=PT['metal'])
    rod(R.deck, arm_c + Vector((0, 0, arm_r * 0.95)), arm_c + Vector((0, 0, arm_r * 1.40)), 0.06 * S, g, 4, r2=0.015, cap=True, pat=PT['metal'])
    R.lod['boxes'].append((Vector((rx, 0, (rz0 + zc1) * 0.5)), (rr * 2.0, rr * 2.0, zc1 - rz0), white))
    R.lod['boxes'].append((Vector((rx, 0, zc1 + 0.8 * S)), (rr * 1.6, rr * 1.6, 1.3 * S), g))

    # Upgraded Archimedes Bronze Catapult (palintonon) on stepped fore bastion
    xc = H.x0 + 0.285 * L
    z0 = dz(xc)
    tim, dk = PAL['timber'], PAL['timber_dark']
    zt = z0 + 0.36 * S
    bw_p = min(H.half(xc + 0.07 * L), H.half(xc - 0.07 * L)) * 1.56
    box2(R.deck, xc - 0.095 * L, -bw_p * 0.5, z0 - 0.14, xc + 0.095 * L, bw_p * 0.5, zt, blue, PT['boards'], skip=('-z',), jitter=0.0)
    el = math.radians(24)
    d = Vector((math.cos(el), 0, math.sin(el)))
    y = Vector((0, 1, 0))
    n_ax = d.cross(y)
    Pv = Vector((xc - 0.01 * L, 0, zt + 1.05 * S))
    rear, front = Pv - d * (0.115 * L), Pv + d * (0.115 * L)
    box(R.deck, (rear + front) * 0.5, ((front - rear).length, 0.52 * S, 0.30 * S), tim, PT['boards'], axes=(d, y, n_ax))
    # Bronze slider rails on top of trough
    for sd in (-1, 1):
        rod(R.deck, rear + Vector((0, sd * 0.22 * S, 0.18 * S)), front + Vector((0, sd * 0.22 * S, 0.18 * S)), 0.045 * S, brz, 4, pat=PT['metal'])
    for lx in (-0.055, 0.045):
        for sd in (-1, 1):
            a = Vector((Pv.x + lx * L, sd * 0.19 * B, zt))
            b = Pv + d * (lx * L) - Vector((0, 0, 0.10 * S))
            rod(R.deck, a, b, 0.085 * S, dk, 4)
    F = front - d * (0.025 * L)
    fw = 0.22 * B
    for sd in (-1, 1):
        a = F + Vector((0, sd * fw, -0.64 * S))
        b = F + Vector((0, sd * fw, 0.78 * S))
        rod(R.deck, a, b, 0.19 * S, PAL['pitch'], 6)
        for p in (a, b):
            box(R.deck, p, (0.48 * S, 0.48 * S, 0.18 * S), brz, pat=PT['metal'], jitter=0.0)
        tip = F + Vector((-0.095 * L, sd * (fw + 0.15 * B), 0.06 * S))
        rod(R.deck, F + Vector((0, sd * fw, 0.06 * S)), tip, 0.10 * S, dk, 4, r2=0.065 * S)
        line(R.rigging, tip, rear + d * (0.02 * L) + Vector((0, 0, 0.18 * S)), R.rope)
    for zz in (-0.64, 0.78):
        box(R.deck, F + Vector((0, 0, zz * S)), (0.28 * S, 2 * fw + 0.48 * S, 0.28 * S), brz, pat=PT['metal'], jitter=0.0)
    rod(R.deck, rear + Vector((0, -0.26 * B, 0.1)), rear + Vector((0, 0.26 * B, 0.1)), 0.16 * S, brz, 6, cap=True, pat=PT['metal'])
    for ox, oy in ((0.055, -0.22), (0.072, -0.16), (0.055, 0.22)):
        box(R.deck, (xc + ox * L, oy * B, zt + 0.20 * S), (0.38 * S, 0.38 * S, 0.38 * S), TP['stone'], PT['ashlar'], skip=('-z',))
    R.lod['boxes'].append((Vector((xc, 0, (z0 + zt) * 0.5)), (0.19 * L, bw_p, zt - z0), blue))
    R.lod['posts'].append(([rear, Pv, front], 0.26 * S, tim))

    # 2-tier Imperial Stern Gallery (marble & navy colonnaded upper balcony + cobalt tiled roof)
    sx0, sx1 = st.x + 0.09 * L, st.x + 0.24 * L
    sxm = (sx0 + sx1) * 0.5
    sz, sw = R.titan_house(sx0, sx1, 0.76, 0.90 * S, white, blue, pat=PT['ashlar'])
    # Upper gallery colonnade
    for k in range(4):
        gx = sx0 + 0.18 * S + (sx1 - sx0 - 0.36 * S) * k / 3.0
        for sd in (-1, 1):
            column(R.deck, gx, sd * sw * 0.48, sz + 0.95 * S, sz + 1.62 * S, 0.07 * S, white, cap_col=g, segs=5)
    hip_roof(R.deck, sx0 - 0.12, sx1 + 0.12, -sw * 0.54, sw * 0.54, sz + 1.62 * S, 0.48 * S, TP['navy'], pat=PT['tiles'])
    # Upper gallery glowing core panes
    for sd in (-1, 1):
        R.glow_pane((sxm, sd * sw * 0.34, sz + 1.28 * S), ((sx1 - sx0) * 0.76, 0, 0), (0, 0, 0.44 * S), (0, sd, 0), col=TP['win_amber'])
    R.lod['boxes'].append((Vector((sxm, 0, sz + 0.95 * S)), (sx1 - sx0, sw, 1.85 * S), white))

    # 2-tier stern hull quarter windows + transom windows
    R.stern_gallery_windows(n=4, u_start=-0.84, u_step=0.052, z_drop=0.45, two_tier=True)
    R.transom_windows(n=4, z_frac=0.68, h=0.42)
    return R


# =================================================================== #3 USDe: Obsidian & Silver Hellenistic Pentere
def build_usde(coll=None):
    sch = SCH(
        top=TP['obsidian'], band=TP['slate'], stripe=TP['silver'], cap=TP['silver'],
        deck=TP['deck_dark'], deck_in=TP['slate'], boot=TP['silver'], bottom=TP['obsidian'],
        house=TP['slate'], roof=TP['obsidian'], spar='timber_dark', cloth=TP['canvas_pearl'],
        transom=TP['obsidian'],
    )
    sch['deck_margin'] = TP['obsidian']
    sch['pennant_a'], sch['pennant_b'] = TP['silver'], TP['obsidian']

    L = 22.0
    form = dict(
        br=5.05 / L, fb=0.124, dr=0.078, bow=2.55, stern=0.22, sheer=(0.44, 0.68),
        rb=0.078, rs=0.075, bul=0.022, rpow=1.55,
        aft_step=(-0.46, 0.42), tumblehome=-0.02, wale_out=0.075,
    )
    R = TitanRig('titan_usde', 'large', L, form, sch, seed=303,
                 hull_pats=dict(stripe=PT['metal'], cap=PT['metal'], boot=PT['metal']))
    H, S = R.H, R.S
    dz = H.deck
    st, bw = H.stern(), H.bow()
    B = H.B
    sil, verd, slt, obs = TP['silver'], TP['verdigris'], TP['slate'], TP['obsidian']

    # Sleek obsidian & satin-silver hull + silver shields (6/side) + steering oars
    R.dress_hull(n_sec=14, steering=True, steering_col=sil, eyes_u=0.84, eye_scale=0.036,
                 shields=sil, shield_rim=verd, n_shields=6, shield_u=(-0.50, 0.48))

    # Razor silver-sheathed beakhead prow (PT['metal']) + verdigris collar
    xf = H.x(1.0, H.zt(1.0) * 0.45)
    prow_base = Vector((xf - 0.02 * L, 0, H.zt(1.0) * 0.42))
    prow_tip = Vector((bw.x + 0.082 * L, 0, bw.z + 0.035 * L))
    rod(R.hull, prow_base, prow_tip, 0.024 * L, sil, 5, r2=0.004 * L, cap=True, pat=PT['metal'])
    # Razor upper & lower silver shear blades on beakhead
    p_lo = Vector((H.x(1.0, 0.08), 0, 0.08))
    rod(R.hull, p_lo, prow_tip, 0.016 * L, sil, 4, r2=0.003 * L, cap=True, pat=PT['metal'])
    rod(R.hull, prow_base + Vector((0.02 * L, 0, 0.01 * L)), prow_base + Vector((0.035 * L, 0, 0.018 * L)),
        0.028 * L, verd, 6, cap=True, pat=PT['metal'])
    R.lod['posts'].append(([prow_base, (prow_base + prow_tip) * 0.5, prow_tip], 0.020 * L, sil))

    # Double-horned satin-silver stern aphlaston
    for sd in (-1, 1):
        pts = arc(st + Vector((0.01 * L, 0, -0.01 * L)), 0.056 * L, 222, y=sd * 0.026 * L, n=6)
        for i in range(len(pts) - 1):
            ra = (0.012 * L + 0.02) * (1.0 - 0.48 * i / 5.0)
            rb = (0.012 * L + 0.02) * (1.0 - 0.48 * (i + 1) / 5.0)
            rod(R.hull, pts[i], pts[i + 1], ra, sil, 5, r2=rb, cap=(i == 4), pat=PT['metal'])
    R.lod['posts'].append((arc(st, 0.056 * L, 222, n=5), 0.015 * L, sil))

    # Hybrid Split Rig: raked square main + siparum + artemon + swinging aft sprit mizzen (boom!)
    R.mast_course(0.05, 0.84, 0.76, 0.13, slt, main=True, siparum=True, rake=math.radians(4),
                  carchesion_col=sil, finial=sil, nu=6, nv=5)
    R.artemon_t(42, 0.28 * L, 0.22 * L, finial=sil)
    R.sprit_mizzen(-0.26, 0.56, 0.28, foot_k=0.14, peak_deg=44.0, foot_col=slt, rake_deg=5.0)
    R.stays()

    # Suspended Verdigris-Bronze Balance-Scales Gantry (forward waist, iconic Ethena balance!)
    gx = H.x0 + 0.19 * L
    gz = dz(gx)
    gw = H.half(gx) * 0.78
    gh = 1.98 * S
    for sd in (-1, 1):
        rod(R.deck, (gx, sd * gw, gz - 0.05), (gx, sd * gw, gz + gh), 0.085 * S, verd, 5, pat=PT['metal'])
    # Arched gantry beam + central balance beam + suspended bronze weighing pans
    rod(R.deck, (gx, -gw, gz + gh), (gx, gw, gz + gh), 0.095 * S, verd, 5, cap=True, pat=PT['metal'])
    rod(R.deck, (gx, 0, gz + gh), (gx, 0, gz + gh + 0.44 * S), 0.075 * S, sil, 5, r2=0.025, cap=True, pat=PT['metal'])
    # Suspended pans hanging port & starboard
    for sd in (-1, 1):
        py = sd * gw * 0.62
        rod(R.deck, (gx, py, gz + gh), (gx, py, gz + gh * 0.54), 0.032 * S, sil, 4, pat=PT['metal'])
        rod(R.deck, (gx, py, gz + gh * 0.54), (gx, py, gz + gh * 0.40), 0.34 * S, verd, 6, r2=0.14 * S, cap=True, pat=PT['metal'])

    # Terraced Hanging Peristyle Deck-Garden (evergreen umbrella pines & cypresses, PT_EVERGREEN=14!)
    def planter(x0, x1, y0, y1, h=0.38 * S):
        z = dz((x0 + x1) * 0.5)
        box2(R.deck, x0, y0, z - 0.06, x1, y1, z + h, slt, PT['ashlar'], skip=('-z',), jitter=0.0)
        box2(R.deck, x0 - 0.03, y0 - 0.03, z + h - 0.06, x1 + 0.03, y1 + 0.03, z + h + 0.03, sil, PT['metal'], skip=('-z',), jitter=0.0)
        box2(R.deck, x0 + 0.05, y0 + 0.05, z + h + 0.01, x1 - 0.05, y1 - 0.05, z + h + 0.05, TP['soil'], PT['grass'], skip=('-z', '-x', '+x', '-y', '+y'))
        return z + h

    def umbrella_pine(x, y, h, r):
        z = planter(x - 0.38 * S, x + 0.38 * S, y - 0.38 * S, y + 0.38 * S)
        top = Vector((x - 0.018 * L, y, z + h))
        rod(R.deck, (x, y, z), top, 0.08 * S, PAL['timber_dark'], 5, r2=0.055 * S)
        # Wide layered Mediterranean stone-pine umbrella crown (evergreen pid=14!)
        rod(R.deck, top - Vector((0, 0, 0.24 * S)), top + Vector((0, 0, 0.14 * S)), r, TP['pine'], 7, r2=r * 0.88, cap=True, pat=PT_EVERGREEN)
        rod(R.deck, top + Vector((0.06 * r, 0, 0.12 * S)), top + Vector((0.06 * r, 0, 0.42 * S)), r * 0.72, TP['pine_lt'], 7, r2=r * 0.28, cap=True, pat=PT_EVERGREEN)
        R.lod['boxes'].append((top, (2.0 * r, 2.0 * r, 0.75 * S), TP['pine']))

    def cypress(x, y, h):
        z = planter(x - 0.28 * S, x + 0.28 * S, y - 0.28 * S, y + 0.28 * S, 0.32 * S)
        rod(R.deck, (x, y, z), (x, y, z + 0.28 * h), 0.22 * S, TP['cypress'], 6, r2=0.28 * S, pat=PT_EVERGREEN)
        rod(R.deck, (x, y, z + 0.28 * h), (x, y, z + h), 0.28 * S, TP['cypress'], 6, r2=0.02, cap=True, pat=PT_EVERGREEN)

    # Fore umbrella pines framing the bow garden
    xf_p = H.x0 + 0.29 * L
    for sd in (-1, 1):
        umbrella_pine(xf_p + 0.015 * L * sd, sd * 0.21 * B, 0.165 * L, 0.080 * L)

    # Terraced peristyle pergola over the quarterdeck walk with glowing recessed slit windows!
    px0, px1 = H.x0 - 0.19 * L, H.x0 - 0.04 * L
    pz = dz((px0 + px1) * 0.5)
    ph = 1.28 * S
    pw = 0.34 * B
    # Terraced obsidian plinth with recessed amber slit windows underneath
    box2(R.deck, px0, -pw * 0.88, pz - 0.08, px1, pw * 0.88, pz + 0.48 * S, obs, PT['ashlar'], skip=('-z',), jitter=0.0)
    for sd in (-1, 1):
        for k in range(3):
            wx = px0 + (px1 - px0) * (k + 0.5) / 3.0
            R.glow_pane((wx, sd * (pw * 0.88 + 0.03), pz + 0.28 * S), (0.48 * S, 0, 0), (0, 0, 0.18 * S), (0, sd, 0), col=TP['win_amber'])
    # Slender silver peristyle columns supporting evergreen vine pergola roof
    for k in range(3):
        cx = px0 + (px1 - px0) * k / 2.0
        for sd in (-1, 1):
            rod(R.deck, (cx, sd * pw, pz + 0.45 * S), (cx, sd * pw, pz + ph), 0.055 * S, sil, 5, pat=PT['metal'])
    box2(R.deck, px0 - 0.12, -pw - 0.14, pz + ph, px1 + 0.12, pw + 0.14, pz + ph + 0.20 * S, TP['vine'], PT_EVERGREEN, skip=(), jitter=0.0)
    R.lod['boxes'].append((Vector(((px0 + px1) * 0.5, 0, pz + ph * 0.65)), (px1 - px0, pw * 2.1, ph), TP['vine']))

    # Stern cabin flanked by twin slender cypresses
    sx0, sx1 = st.x + 0.10 * L, st.x + 0.22 * L
    sz, sw = R.titan_house(sx0, sx1, 0.66, 0.88 * S, obs, slt, roof_pat=PT['slate'], pat=PT['ashlar'])
    for sd in (-1, 1):
        cypress(st.x + 0.25 * L, sd * 0.30 * B, 0.185 * L)
        R.glow_pane(((sx0 + sx1) * 0.5, sd * (sw * 0.5 + 0.03), sz + 0.50 * S), ((sx1 - sx0) * 0.55, 0, 0), (0, 0, 0.26 * S), (0, sd, 0), col=TP['win_amber'])
    R.stern_gallery_windows(n=3, u_start=-0.82, u_step=0.06, z_drop=0.52)
    R.transom_windows(n=3, z_frac=0.68, h=0.34)
    return R


# =================================================================== #4 DAI: Golden-Ochre Doric Corbita Citadel
def build_dai(coll=None):
    sch = SCH(
        top=TP['cedar'], band=TP['ochre'], stripe=TP['ochre_lt'], cap=TP['gilt'],
        deck=TP['timber_deck'], deck_in=TP['sandstone'], boot=TP['cedar'], bottom=TP['pitch'],
        house=TP['sandstone'], roof=TP['terracotta'], spar='timber_dark', cloth=TP['canvas_warm'],
        transom=TP['cedar'],
    )
    sch['deck_margin'] = TP['deck_dark']
    sch['pennant_a'], sch['pennant_b'] = TP['gilt'], TP['cedar']

    L = 21.2
    form = dict(
        br=6.20 / L, fb=0.144, dr=0.092, bow=2.55, stern=0.30, sheer=(0.38, 0.54),
        rb=0.038, rs=0.068, bul=0.030, rpow=1.1,
        aft_step=(-0.40, 0.76), tumblehome=0.055, wale_out=0.105,
    )
    R = TitanRig('titan_dai', 'large', L, form, sch, seed=404, hull_pats=dict(cap=PT['metal']))
    H, S = R.H, R.S
    dz = H.deck
    st, bw = H.stern(), H.bow()
    B = H.B
    sand, terr, brz, g, och = TP['sandstone'], TP['terracotta'], TP['bronze'], TP['gilt'], TP['ochre']

    # Stoutest broad-beamed cedar/ochre corbita + twin GILDED rudders + bronze rail shields (6/side)
    R.dress_hull(n_sec=14, steering=True, steering_col=g, eyes_u=0.84, eye_scale=0.036,
                 shields=brz, shield_rim=g, n_shields=6, shield_u=(-0.38, 0.56))
    # Stout golden-ochre stern scroll behind the fortress
    R.crane_neck(st + Vector((0.01 * L, 0, -0.01 * L)), 0.046 * L, g, y=0.0, segs=5, head_scale=0.85)

    # Sculpted Gilt Solar Disc Prow (iconic DAI emblem motif!)
    sd_c = bw + Vector((0.028 * L, 0, 0.056 * L))
    rod(R.hull, bw + Vector((-0.01 * L, 0, -0.015 * L)), sd_c, 0.018 * L, brz, 5, pat=PT['metal'])
    # Solid thick gilt disc facing fore/aft + outer torus sunburst ring + 8 gilt rays
    rod(R.hull, sd_c + Vector((-0.14, 0, 0)), sd_c + Vector((0.14, 0, 0)), 0.052 * L, g, 10, cap=True, pat=PT['metal'])
    torus_ring(R.hull, sd_c, 0.058 * L, 0.0095 * L, (0, 1, 0), (0, 0, 1), brz, n_seg=10, t_seg=4, pat=PT['metal'])
    for k in range(8):
        ang = 2.0 * math.pi * k / 8.0
        p0 = sd_c + Vector((0, math.cos(ang) * 0.050 * L, math.sin(ang) * 0.050 * L))
        p1 = sd_c + Vector((0, math.cos(ang) * 0.084 * L, math.sin(ang) * 0.084 * L))
        rod(R.hull, p0, p1, 0.0085 * L, g, 4, r2=0.0025 * L, cap=True, pat=PT['metal'])
    R.lod['boxes'].append((sd_c, (0.045 * L, 0.14 * L, 0.14 * L), g))

    # 1 monumental broad-yard central mast (MAX emblem scale!) + siparum + stout artemon
    R.mast_course(0.06, 0.88, 0.92, 0.13, och, main=True, siparum=True, carchesion_col=g, finial=g, nu=6, nv=5)
    R.artemon_t(36, 0.28 * L, 0.26 * L, finial=g)
    R.stays()

    # Stepped Crenellated Doric Stone Fortress aft (sandstone ashlar + corner quoins + terracotta hip roof)
    fx0, fx1 = st.x + 0.09 * L, st.x + 0.31 * L
    fxm = (fx0 + fx1) * 0.5
    fz = dz(fxm)
    fw = min(H.half(fx0), H.half(fx1)) * 1.56
    h1, h2 = 1.25 * S, 0.82 * S
    # Lower fortress storey (sandstone ashlar)
    box2(R.deck, fx0, -fw * 0.5, fz - 0.18, fx1, fw * 0.5, fz + h1, sand, PT['ashlar'], skip=('-z',), jitter=0.0)
    # Proud corner quoins (alternating ochre/sandstone heavy stone corner blocks)
    for cx in (fx0, fx1):
        for cy in (-fw * 0.5, fw * 0.5):
            for qi in range(3):
                qz = fz + (0.20 + qi * 0.36) * S
                box(R.deck, (cx, cy, qz), (0.34 * S, 0.34 * S, 0.26 * S), och if qi % 2 == 0 else sand, PT['ashlar'], skip=('-z',), jitter=0.0)
    # Doric cornice belt + upper crenellated parapet wall
    box2(R.deck, fx0 - 0.10, -fw * 0.53, fz + h1, fx1 + 0.10, fw * 0.53, fz + h1 + 0.18 * S, och, PT['ashlar'], skip=(), jitter=0.0)
    # Upper stepped fortress keep inset inside crenellated rampart
    ux0, ux1, uw = fx0 + 0.38 * S, fx1 - 0.38 * S, fw * 0.72
    box2(R.deck, ux0, -uw * 0.5, fz + h1 + 0.16 * S, ux1, uw * 0.5, fz + h1 + h2, sand, PT['ashlar'], skip=('-z',), jitter=0.0)
    # Crenellated stone merlons around the lower parapet rim
    for cx in (fx0 + 0.10, fxm, fx1 - 0.10):
        for sd in (-1, 1):
            box(R.deck, (cx, sd * (fw * 0.49), fz + h1 + 0.38 * S), (0.42 * S, 0.24 * S, 0.38 * S), sand, PT['ashlar'], skip=('-z',), jitter=0.0)
    for cy in (-fw * 0.32, 0.0, fw * 0.32):
        box(R.deck, (fx1 - 0.08, cy, fz + h1 + 0.38 * S), (0.24 * S, 0.38 * S, 0.38 * S), sand, PT['ashlar'], skip=('-z',), jitter=0.0)
    # Terracotta hip roof crowning the Doric fortress keep
    hip_roof(R.deck, ux0 - 0.16, ux1 + 0.16, -uw * 0.54, uw * 0.54, fz + h1 + h2, 0.65 * S, terr, inset=0.24, pat=PT['tiles'])
    R.lod['boxes'].append((Vector((fxm, 0, fz + h1 * 0.5)), (fx1 - fx0, fw, h1), sand))
    R.lod['boxes'].append((Vector((fxm, 0, fz + h1 + h2 * 0.75)), (ux1 - ux0 + 0.2, uw + 0.2, h2 + 0.5 * S), terr))

    # Glowing stone embrasures on all 4 sides of the fortress (hb_fleet_window)
    for sd in (-1, 1):
        for k in range(3):
            ex = fx0 + (fx1 - fx0) * (k + 0.5) / 3.0
            R.glow_pane((ex, sd * (fw * 0.5 + 0.03), fz + h1 * 0.56), (0.24 * S, 0, 0), (0, 0, 0.42 * S), (0, sd, 0), col=TP['win_amber'])
        R.glow_pane((fxm, sd * (uw * 0.5 + 0.03), fz + h1 + h2 * 0.52), (0.42 * S, 0, 0), (0, 0, 0.32 * S), (0, sd, 0), col=TP['win_gold'])
    R.glow_pane((fx1 + 0.03, 0, fz + h1 * 0.45), (0, 0.56 * S, 0), (0, 0, 0.62 * S), (1, 0, 0), col=TP['win_gold'])

    # Sunken Bronze-Coffered Collateral Vault amidships-forward!
    vx0, vx1 = H.x0 + 0.14 * L, H.x0 + 0.29 * L
    vxm = (vx0 + vx1) * 0.5
    vz = dz(vxm)
    vw = B * 0.54
    # Heavy stone vault coaming frame
    box2(R.deck, vx0, -vw * 0.5, vz - 0.08, vx1, vw * 0.5, vz + 0.62 * S, sand, PT['ashlar'], skip=('-z',), jitter=0.0)
    # Recessed bronze-coffered vault lid with heavy bronze cross-bands & gilt boss studs
    box2(R.deck, vx0 + 0.14, -vw * 0.44, vz + 0.56 * S, vx1 - 0.14, vw * 0.44, vz + 0.72 * S, brz, PT['metal'], skip=('-z',), jitter=0.0)
    for k in range(3):
        bx = vx0 + 0.22 + (vx1 - vx0 - 0.44) * k / 2.0
        box(R.deck, (bx, 0, vz + 0.75 * S), (0.18 * S, vw * 0.92, 0.12 * S), g, PT['metal'], skip=('-z',), jitter=0.0)
    # Glowing bronze-framed collateral vault doorway facing aft toward the waist
    R.glow_pane((vx0 - 0.03, 0, vz + 0.30 * S), (0, 0.56 * S, 0), (0, 0, 0.44 * S), (-1, 0, 0), col=TP['win_gold'])
    R.lod['boxes'].append((Vector((vxm, 0, vz + 0.36 * S)), (vx1 - vx0, vw, 0.72 * S), brz))

    # Stern quarter & transom windows
    R.stern_gallery_windows(n=3, u_start=-0.83, u_step=0.058, z_drop=0.55)
    R.transom_windows(n=3, z_frac=0.66, h=0.38)
    return R


# =================================================================== #5 USDS: Ptolemaic Thalamegos Sky-Palace
def build_usds(coll=None):
    sch = SCH(
        top=TP['alabaster'], band=TP['sunset'], stripe=TP['cerulean'], cap=TP['gilt'],
        deck=TP['timber_deck'], deck_in=TP['alabaster'], boot=TP['cerulean'], bottom=TP['pitch'],
        house=TP['alabaster'], roof=TP['sunset'], spar='timber', cloth=TP['canvas_ivory'],
        transom=TP['alabaster'],
    )
    sch['deck_margin'] = TP['sunset_lt']
    sch['pennant_a'], sch['pennant_b'] = TP['sunset'], TP['cerulean']

    L = 21.8
    form = dict(
        br=6.15 / L, fb=0.132, dr=0.084, bow=2.25, stern=0.28, sheer=(0.48, 0.66),
        rb=0.052, rs=0.072, bul=0.025, rpow=1.25,
        aft_step=(-0.50, 0.50), tumblehome=0.02, wale_out=0.085,
    )
    R = TitanRig('titan_usds', 'large', L, form, sch, seed=505, hull_pats=dict(cap=PT['metal']))
    H, S = R.H, R.S
    dz = H.deck
    st, bw = H.stern(), H.bow()
    B = H.B
    alab, suns, cer, cer_dk, g, brz = TP['alabaster'], TP['sunset'], TP['cerulean'], TP['cerulean_dk'], TP['gilt'], TP['bronze']

    # Alabaster + sunset-terracotta sheer + sky-cerulean frieze hull + gilt rail trim
    R.dress_hull(n_sec=14, steering=True, steering_col=g, eyes_u=0.83, eye_scale=0.036,
                 shields=g, shield_rim=cer, n_shields=6, shield_u=(-0.44, 0.48))

    # TWIN white-and-gilt swan-neck prows linked by a gilded sun-arch (NO artemon — keeps twin prows crystal-clear!)
    arch_tops = []
    for sd in (-1, 1):
        base = Vector((bw.x - 0.032 * L, sd * 0.072 * L, bw.z - 0.012 * L))
        pts = arc(base, 0.065 * L, 218, y=0.0, n=6, fwd=-1.0)
        for i in range(len(pts) - 1):
            ra = (0.015 * L + 0.022) * (1.0 - 0.42 * i / 5.0)
            rb = (0.015 * L + 0.022) * (1.0 - 0.42 * (i + 1) / 5.0)
            c_seg = alab if i < 3 else g
            p_seg = PT['metal'] if i >= 3 else 0
            rod(R.hull, pts[i], pts[i + 1], ra, c_seg, 5, r2=rb, cap=(i == 4), pat=p_seg)
        e = pts[-1]
        d_ = (pts[-1] - pts[-2]).normalized()
        rod(R.hull, e, e + d_ * (0.042 * L), 0.012 * L, g, 5, r2=0.004 * L, cap=True, pat=PT['metal'])
        arch_tops.append(pts[3])
    # Gilded sun-arch spanning gracefully between the twin swan-neck prows!
    pL, pR = arch_tops[0], arch_tops[1]
    a_mid = (pL + pR) * 0.5 + Vector((0.014 * L, 0, 0.048 * L))
    arch_pts = [pL, pL.lerp(a_mid, 0.55) + Vector((0, 0, 0.018 * L)), a_mid, pR.lerp(a_mid, 0.55) + Vector((0, 0, 0.018 * L)), pR]
    for i in range(len(arch_pts) - 1):
        rod(R.hull, arch_pts[i], arch_pts[i + 1], 0.011 * L, g, 5, pat=PT['metal'])
    rod(R.hull, a_mid + Vector((-0.10, 0, 0)), a_mid + Vector((0.10, 0, 0)), 0.028 * L, g, 8, cap=True, pat=PT['metal'])
    R.lod['posts'].append((arc(bw + Vector((-0.03 * L, 0, -0.01 * L)), 0.064 * L, 218, n=5, fwd=-1.0), 0.018 * L, g))

    # 1 soaring forward mast + siparum (NO artemon!) with sunset-terracotta foot band
    R.mast_course(0.15, 0.92, 0.86, 0.13, suns, main=True, siparum=True, carchesion_col=g, finial=g, nu=6, nv=5)
    R.stays()

    # Open Two-Tier Ionic Colonnaded Pavilion shaded by a Scalloped Sunset-and-Cerulean Silk Velarium!
    px0, px1 = H.x0 - 0.20 * L, H.x0 + 0.05 * L
    pxm = (px0 + px1) * 0.5
    pz = dz(pxm)
    pw = min(H.half(px0), H.half(px1)) * 1.48
    h_t1, h_t2 = 0.88 * S, 0.78 * S
    # Alabaster stylobate + mid-deck cornice balcony
    box2(R.deck, px0, -pw * 0.5, pz - 0.12, px1, pw * 0.5, pz + 0.22 * S, alab, PT['ashlar'], skip=('-z',), jitter=0.0)
    z1 = pz + 0.22 * S
    z2 = z1 + h_t1
    z3 = z2 + 0.16 * S + h_t2
    # Lower tier: 5 Ionic columns per side + glowing palace inner walls (hb_fleet_window)
    for k in range(5):
        cx = px0 + 0.18 * S + (px1 - px0 - 0.36 * S) * k / 4.0
        for sd in (-1, 1):
            column(R.deck, cx, sd * pw * 0.44, z1, z2, 0.072 * S, alab, cap_col=g, segs=5)
    # Recessed glowing palace interior (both tiers!)
    box2(R.deck, px0 + 0.42 * S, -pw * 0.28, z1, px1 - 0.42 * S, pw * 0.28, z2, alab, PT['ashlar'], skip=('-z', '+z'), jitter=0.0)
    for sd in (-1, 1):
        R.glow_pane((pxm, sd * (pw * 0.28 + 0.03), z1 + h_t1 * 0.52), ((px1 - px0) * 0.66, 0, 0), (0, 0, h_t1 * 0.64), (0, sd, 0), col=TP['win_gold'])
    # Mid-tier cerulean & gilt frieze balcony
    box2(R.deck, px0 - 0.06, -pw * 0.52, z2, px1 + 0.06, pw * 0.52, z2 + 0.16 * S, cer, 0, skip=(), jitter=0.0)
    # Upper tier: open Ionic loggia columns + glowing upper sanctuary screen
    for k in range(4):
        cx = px0 + 0.30 * S + (px1 - px0 - 0.60 * S) * k / 3.0
        for sd in (-1, 1):
            column(R.deck, cx, sd * pw * 0.40, z2 + 0.16 * S, z3, 0.064 * S, alab, cap_col=g, segs=5)
    for sd in (-1, 1):
        R.glow_pane((pxm, sd * (pw * 0.24), z2 + 0.16 * S + h_t2 * 0.50), ((px1 - px0) * 0.58, 0, 0), (0, 0, h_t2 * 0.56), (0, sd, 0), col=TP['win_amber'])
    # Scalloped Sunset-Terracotta & Sky-Cerulean Silk Velarium canopy (6 alternating scalloped stripes!)
    n_vel = 6
    vy_w = pw * 0.54
    for i in range(n_vel):
        vx0 = px0 - 0.14 + (px1 - px0 + 0.28) * i / n_vel
        vx1 = px0 - 0.14 + (px1 - px0 + 0.28) * (i + 1) / n_vel
        vcol = suns if i % 2 == 0 else cer
        sag = 0.08 * S if i % 2 == 0 else 0.02 * S
        ridge = z3 + 0.46 * S - sag
        eave = z3 + 0.04 * S - sag * 0.5
        quad_oriented(R.deck, ((vx0, -vy_w, eave), (vx1, -vy_w, eave), (vx1, 0, ridge), (vx0, 0, ridge)), (0, -1, 1), vcol, pat=0, jitter=0.0)
        quad_oriented(R.deck, ((vx1, vy_w, eave), (vx0, vy_w, eave), (vx0, 0, ridge), (vx1, 0, ridge)), (0, 1, 1), vcol, pat=0, jitter=0.0)
    R.lod['boxes'].append((Vector((pxm, 0, (z1 + z3) * 0.5)), (px1 - px0, pw, z3 - z1), alab))
    R.lod['boxes'].append((Vector((pxm, 0, z3 + 0.22 * S)), (px1 - px0 + 0.2, pw + 0.15, 0.42 * S), suns))

    # Octagonal Stone-and-Bronze Brazier Tower aft (with flame cones on hb_fleet_window for W3's living amber brazier!)
    tx = st.x + 0.165 * L
    tz0 = dz(tx)
    tw = 0.115 * L
    ww = H.half(tx) * 1.24
    h1_t = 0.155 * L
    box2(R.deck, tx - tw * 0.5, -ww * 0.5, tz0 - 0.15, tx + tw * 0.5, ww * 0.5, tz0 + h1_t, alab, PT['ashlar'], skip=('-z',), jitter=0.0)
    box2(R.deck, tx - tw * 0.54, -ww * 0.54, tz0 + h1_t * 0.66, tx + tw * 0.54, ww * 0.54, tz0 + h1_t * 0.80, suns, 0, skip=('-z',), jitter=0.0)
    box2(R.deck, tx - tw * 0.58, -ww * 0.58, tz0 + h1_t, tx + tw * 0.58, ww * 0.58, tz0 + h1_t + 0.18 * S, g, PT['metal'], skip=(), jitter=0.0)
    # Octagonal stone lantern stage
    zb = tz0 + h1_t + 0.18 * S
    h2_t = 0.135 * L
    r2 = 0.44 * min(tw, ww)
    rod(R.deck, (tx, 0, zb), (tx, 0, zb + h2_t), r2, alab, 8, r2=r2 * 0.88, pat=PT['ashlar'], smooth=False)
    # Glowing lantern window slits on 4 cardinal faces of the octagonal tower
    for ang in (0.0, math.pi * 0.5, math.pi, math.pi * 1.5):
        nx, ny = math.cos(ang), math.sin(ang)
        ux, uy = -ny * 0.24 * r2, nx * 0.24 * r2
        R.glow_pane((tx + nx * r2 * 0.96, ny * r2 * 0.96, zb + h2_t * 0.52), (ux * 2, uy * 2, 0), (0, 0, h2_t * 0.44), (nx, ny, 0), col=TP['win_gold'])
    zt = zb + h2_t
    rod(R.deck, (tx, 0, zt), (tx, 0, zt + 0.14 * S), r2 * 1.24, cer_dk, 8, cap=True, smooth=False)
    # Flared cast-bronze fire brazier bowl (PT['metal'])
    rod(R.deck, (tx, 0, zt + 0.14 * S), (tx, 0, zt + 0.60 * S), r2 * 0.48, brz, 8, r2=r2 * 1.04, cap=True, pat=PT['metal'])
    zf = zt + 0.58 * S
    # Sculpted living amber brazier flame cones on R.win (hb_fleet_window) -> bright flame by day, flickering amber beacon by night!
    rod(R.win, (tx, 0, zf - 0.04), (tx + 0.03, 0, zf + 1.18 * S), r2 * 0.82, TP['flame'], 6, r2=0.03, cap=True, smooth=False)
    rod(R.win, (tx, 0, zf), (tx - 0.06, 0.04, zf + 0.82 * S), r2 * 0.52, TP['flame_lt'], 5, r2=0.02, cap=True, smooth=False)
    for sd in (-1, 1):
        line(R.rigging, Vector((tx, sd * r2, zt)), Vector((tx - 0.04 * L, sd * (H.half(tx - 0.04 * L) - 0.04), dz(tx) + 0.1)), R.rope * 0.8)
    R.lod['posts'].append(([Vector((tx, 0, zb)), Vector((tx, 0, zt)), Vector((tx, 0, zf + 1.15 * S))], r2, alab))
    R.lod['boxes'].append((Vector((tx, 0, zf + 0.36 * S)), (r2 * 1.5, r2 * 1.5, 0.88 * S), TP['flame']))

    # Stern quarter & transom windows
    R.stern_gallery_windows(n=3, u_start=-0.83, u_step=0.058, z_drop=0.52)
    R.transom_windows(n=3, z_frac=0.68, h=0.36)
    return R
