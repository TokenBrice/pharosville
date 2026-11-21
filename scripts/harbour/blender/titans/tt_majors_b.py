"""Top-10 Major Titans #6-#10: RLUSD, USD1, XAUT, USDG, PYUSD.

Hard clearance & budget compliance (PLAN.md §3):
  #6  titan_rlusd  large  22.0 x 3.85 m  target ~2,650 (cap 3,000)  [48 animated oars!]
  #7  titan_usd1   large  21.6 x 5.70 m  target ~2,600 (cap 3,000)
  #8  titan_xaut   large  22.0 x 4.45 m  target ~2,650 (cap 3,000)  [40 animated gilded oars!]
  #9  titan_usdg   large  21.6 x 6.00 m  target ~2,550 (cap 3,000)
  #10 titan_pyusd  large  21.0 x 5.30 m  target ~2,500 (cap 3,000)  [hybrid split sprit mizzen!]
"""
import math
from mathutils import Vector
from hb_lib import PAL, PT, rod, line, box, box2
from hb_hulls import SCH
from hb_ancient import arc
from tt_common import (
    TP, TitanRig, gable, hip_roof, torus_ring, column, quad_oriented, poly_oriented,
)


# =================================================================== #6 RLUSD: Cobalt-and-Seafoam Trireme Express Packet
def build_rlusd(coll=None):
    sch = SCH(
        top=TP['aegean'], band=TP['seafoam'], stripe=TP['seafoam_lt'], cap=TP['gilt'],
        deck=TP['oak'], deck_in=TP['aegean'], boot=TP['aegean'], bottom=TP['pitch'],
        house=TP['seafoam'], roof=TP['aegean'], spar='timber_dark', cloth=TP['canvas_ivory'],
        transom=TP['aegean'],
    )
    sch['deck_margin'] = TP['deck_dark']
    sch['oar_col'] = PAL['timber']
    sch['pennant_a'], sch['pennant_b'] = TP['seafoam'], TP['aegean']

    L = 22.0
    form = dict(
        br=3.85 / L, fb=0.095, dr=0.056, bow=2.65, stern=0.24, sheer=(0.34, 0.86),
        rb=0.025, rs=0.072, bul=0.015, rpow=1.05,
        tumblehome=-0.03, wale_out=0.065,
    )
    R = TitanRig('titan_rlusd', 'large', L, form, sch, seed=606, hull_pats=dict(cap=PT['metal']))
    H, S = R.H, R.S
    dz = H.deck
    st, bw = H.stern(), H.bow()
    B = H.B
    cob, sf, oak, brz, g, sil = TP['aegean'], TP['seafoam'], TP['oak'], TP['bronze'], TP['gilt'], TP['silver']

    # Sleek war-trireme hull + bronze trident ram + war ophthalmoi eyes + steering oars
    R.dress_hull(n_sec=14, steering=True, steering_col=brz, eyes_u=0.86, eye_scale=0.044)
    R.bronze_ram(length_k=0.088, col=brz, trident=True)
    R.stem_post(g, 0.042)

    # Projecting oiled-oak parexeiresia outrigger on both sides + 20 cobalt/silver hoplite shields (10/side)
    ox0, ox1 = H.x0 - 0.30 * L, H.x0 + 0.28 * L
    out_y = 0.26
    for sd in (-1, 1):
        wy_in = H.half(H.x0) - 0.02
        wy_out = H.half(H.x0) + out_y
        zz = H.zt(0.0) + 0.14
        box2(R.hull, ox0, min(sd * wy_in, sd * wy_out), zz - 0.20, ox1, max(sd * wy_in, sd * wy_out), zz - 0.04,
             oak, PT['boards'], skip=(), jitter=0.0)
        box2(R.hull, ox0, min(sd * wy_in, sd * wy_out), zz - 0.04, ox1, max(sd * wy_in, sd * wy_out), zz + 0.03,
             cob, 0, skip=('-z',), jitter=0.0)
        # Angled oak outrigger brackets (5 per side)
        for k in range(5):
            bx = ox0 + (ox1 - ox0) * (k + 0.5) / 5.0
            rod(R.hull, (bx, sd * (H.half(bx) - 0.04), H.zt(H.u_at(bx)) - 0.52),
                (bx, sd * wy_out, zz - 0.16), 0.055 * S, oak, 4)
    # 20 domed hoplite shields (10/side = 20 total!) alternating Aegean cobalt & satin silver with gilt bosses!
    R.rail_shields(10, cob, rim_col=g, u0=-0.56, u1=0.54, y_off=out_y + 0.05, z_off=0.14, r_scale=0.016, alt_col=sil)

    # Raised marine catwalk (katastroma) down the centerline above the oar-well
    cw = B * 0.44
    cz = dz(H.x0) + 0.46 * S
    box2(R.deck, ox0 + 0.04 * L, -cw * 0.5, cz, ox1 - 0.04 * L, cw * 0.5, cz + 0.10 * S, oak, PT['planks_y'], skip=(), jitter=0.0)
    for k in range(6):
        px = ox0 + 0.06 * L + (ox1 - ox0 - 0.12 * L) * k / 5.0
        for sd in (-1, 1):
            rod(R.deck, (px, sd * cw * 0.44, dz(px) - 0.04), (px, sd * cw * 0.44, cz), 0.048 * S, PAL['timber_dark'], 4)
    R.lod['boxes'].append((Vector((H.x0, 0, cz)), (ox1 - ox0, cw, 0.35 * S), oak))

    # Triple-plumed wave aphlaston (echoing the Ripple triskelion!)
    stp = st + Vector((0.01 * L, 0, -0.01 * L))
    for j, (y_off, rk, c_pl) in enumerate(((-0.018 * L, 0.052, sf), (0.0, 0.064, g), (0.018 * L, 0.052, sf))):
        pts = arc(stp, rk * L, 224, y=y_off, n=6)
        pat_p = PT['metal'] if c_pl == g else 0
        for i in range(len(pts) - 1):
            ra = (0.009 * L + 0.018) * (1.0 - 0.48 * i / 5.0)
            rb = (0.009 * L + 0.018) * (1.0 - 0.48 * (i + 1) / 5.0)
            rod(R.hull, pts[i], pts[i + 1], ra, c_pl, 5, r2=rb, cap=(i == 4), pat=pat_p)
        # Sculpted gilt scroll tip on each plume
        rod(R.hull, pts[-1], pts[-1] + Vector((0.025 * L, 0, -0.012 * L)), 0.011 * L, g, 4, r2=0.004 * L, cap=True, pat=PT['metal'])
    R.lod['posts'].append((arc(stp, 0.060 * L, 224, n=5), 0.014 * L, g))

    # 1 swift courier square sail (furled/brailed under oars inside bay, bursts full cobalt sail outside!)
    R.mast_course(0.04, 0.68, 0.58, 0.09, sf, main=True, siparum=False, r=0.88, carchesion_col=g, finial=brz, nu=6, nv=5)
    R.stays()

    # LIVE ANIMATED OARS: 2 banks x 12 per side x 2 sides = 48 oars!
    R.titan_oar_banks(2, 12, ox0 + 0.02 * L, ox1 - 0.02 * L, 0.195 * L, 0.0048 * L + 0.018, col=PAL['timber'], outrigger_y=out_y)

    # Trierarch aft canopy pavilion with glowing warm canopy niches (hb_fleet_window)
    tx0, tx1 = st.x + 0.09 * L, st.x + 0.22 * L
    txm = (tx0 + tx1) * 0.5
    tz = dz(txm)
    tw = min(H.half(tx0), H.half(tx1)) * 1.44
    th = 1.02 * S
    for xx in (tx0 + 0.12, tx1 - 0.12):
        for sd in (-1, 1):
            rod(R.deck, (xx, sd * tw * 0.44, tz - 0.04), (xx, sd * tw * 0.44, tz + th), 0.055 * S, brz, 4, pat=PT['metal'])
    # Arched seafoam & cobalt silk canopy
    gable(R.deck, tx0 - 0.08, tx1 + 0.08, -tw * 0.50, tw * 0.50, tz + th, 0.34 * S, sf, cob, roof_pat=0, ridge_col=g)
    # Recessed glowing trierarch canopy niches
    box2(R.deck, tx0 + 0.14, -tw * 0.30, tz, tx1 - 0.14, tw * 0.30, tz + th * 0.72, cob, PT['boards'], skip=('-z',), jitter=0.0)
    for sd in (-1, 1):
        R.glow_pane((txm, sd * (tw * 0.30 + 0.03), tz + th * 0.40), ((tx1 - tx0) * 0.62, 0, 0), (0, 0, th * 0.44), (0, sd, 0), col=TP['win_gold'])
    R.glow_pane((tx1 - 0.11, 0, tz + th * 0.40), (0, tw * 0.46, 0), (0, 0, th * 0.44), (1, 0, 0), col=TP['win_amber'])
    R.lod['boxes'].append((Vector((txm, 0, tz + th * 0.6)), (tx1 - tx0, tw, th * 1.1), sf))

    R.stern_gallery_windows(n=3, u_start=-0.82, u_step=0.055, z_drop=0.38)
    return R


# =================================================================== #7 USD1: Gilded Eagle-Prow Imperial Liburna
def build_usd1(coll=None):
    sch = SCH(
        top=TP['ivory'], band=TP['navy_imp'], stripe=TP['gilt'], cap=TP['gilt'],
        deck=TP['timber_deck'], deck_in=TP['ivory'], boot=TP['ivory'], bottom=TP['pitch'],
        house=TP['ivory'], roof=TP['crimson'], spar='timber_dark', cloth=TP['canvas_ivory'],
        transom=TP['ivory'],
    )
    sch['deck_margin'] = TP['deck_dark']
    sch['pennant_a'], sch['pennant_b'] = TP['gilt'], TP['crimson']

    L = 21.6
    form = dict(
        br=5.70 / L, fb=0.132, dr=0.082, bow=2.35, stern=0.26, sheer=(0.44, 0.56),
        rb=0.068, rs=0.072, bul=0.025, rpow=1.35,
        aft_step=(-0.44, 0.64), tumblehome=0.025, wale_out=0.085,
    )
    R = TitanRig('titan_usd1', 'large', L, form, sch, seed=707,
                 hull_pats=dict(stripe=PT['metal'], cap=PT['metal']))
    H, S = R.H, R.S
    dz = H.deck
    st, bw = H.stern(), H.bow()
    B = H.B
    iv, nav, g, crim, brz = TP['ivory'], TP['navy_imp'], TP['gilt'], TP['crimson'], TP['bronze']

    # Gleaming ivory-white + imperial navy + gilt hull + crimson/gilt rail shields (6/side)
    R.dress_hull(n_sec=14, steering=True, steering_col=g, eyes_u=0.83, eye_scale=0.034,
                 shields=crim, shield_rim=g, n_shields=6, shield_u=(-0.44, 0.48))
    R.crane_neck(st + Vector((0.01 * L, 0, -0.012 * L)), 0.052 * L, g, y=0.0, segs=5)

    # Bronze rostrum + Sculpted Burnished-Gilt Imperial Eagle Figurehead!
    R.bronze_ram(length_k=0.065, col=brz, trident=False)
    eb = bw + Vector((0.010 * L, 0, -0.004 * L))
    # Proud eagle torso & neck leaning forward off the stem
    e_chest = eb + Vector((0.044 * L, 0, 0.048 * L))
    e_head = e_chest + Vector((0.028 * L, 0, 0.038 * L))
    e_beak = e_head + Vector((0.028 * L, 0, -0.008 * L))
    rod(R.hull, eb, e_chest, 0.024 * L, g, 6, r2=0.028 * L, cap=True, pat=PT['metal'])
    rod(R.hull, e_chest, e_head, 0.021 * L, g, 6, r2=0.016 * L, cap=True, pat=PT['metal'])
    rod(R.hull, e_head, e_beak, 0.013 * L, g, 5, r2=0.003 * L, cap=True, pat=PT['metal'])
    # Swept-back layered outstretched gilt wings spanning port & starboard (~2.2 m wingspan!)
    for sd in (-1, 1):
        w0 = e_chest + Vector((-0.004 * L, sd * 0.014 * L, 0.008 * L))
        w1 = e_chest + Vector((-0.032 * L, sd * 0.058 * L, 0.048 * L))
        w2 = e_chest + Vector((-0.072 * L, sd * 0.102 * L, 0.068 * L))
        rod(R.hull, w0, w1, 0.015 * L, g, 5, r2=0.012 * L, pat=PT['metal'])
        rod(R.hull, w1, w2, 0.012 * L, g, 5, r2=0.005 * L, cap=True, pat=PT['metal'])
        w_lo1 = w1 + Vector((-0.014 * L, -sd * 0.008 * L, -0.026 * L))
        w_lo2 = w2 + Vector((-0.018 * L, -sd * 0.014 * L, -0.028 * L))
        quad_oriented(R.hull, (w0, w1, w_lo1, w0 + Vector((-0.012 * L, 0, -0.022 * L))), (0, sd, 0.6), g, pat=PT['metal'])
        quad_oriented(R.hull, (w1, w2, w_lo2, w_lo1), (0, sd, 0.6), g, pat=PT['metal'])
    R.lod['boxes'].append((e_chest + Vector((0, 0, 0.015 * L)), (0.10 * L, 0.18 * L, 0.10 * L), g))

    # 2 tall ceremonial square masts (twin sipara topsails!) + slender artemon (stepped back slightly to clear eagle)
    R.mast_course(0.14, 0.84, 0.72, 0.14, nav, main=True, siparum=True, carchesion_col=g, finial=g, nu=6, nv=5)
    R.mast_course(-0.15, 0.72, 0.58, 0.22, nav, r=0.84, siparum=True, carchesion_col=g, finial=g, nu=5, nv=4)
    R.artemon_t(42, 0.27 * L, 0.20 * L, x_frac=0.40, finial=g)
    R.stays()

    # Midships Crimson-and-Gold Velvet Baldaquin (kx = -0.06..0.05)
    bx0, bx1 = H.x0 - 0.055 * L, H.x0 + 0.055 * L
    bxm = (bx0 + bx1) * 0.5
    bz = dz(bxm)
    bw_b = B * 0.48
    bh = 1.18 * S
    box2(R.deck, bx0, -bw_b * 0.5, bz - 0.08, bx1, bw_b * 0.5, bz + 0.18 * S, iv, PT['ashlar'], skip=('-z',), jitter=0.0)
    for xx in (bx0 + 0.12, bx1 - 0.12):
        for sd in (-1, 1):
            column(R.deck, xx, sd * bw_b * 0.44, bz + 0.18 * S, bz + bh, 0.06 * S, g, cap_col=g, segs=5, pat=PT['metal'])
    # Crimson velvet hipped canopy with burnished gold valence fringe
    box2(R.deck, bx0 - 0.06, -bw_b * 0.52, bz + bh - 0.06, bx1 + 0.06, bw_b * 0.52, bz + bh + 0.10 * S, g, PT['metal'], skip=(), jitter=0.0)
    hip_roof(R.deck, bx0 - 0.08, bx1 + 0.08, -bw_b * 0.53, bw_b * 0.53, bz + bh + 0.10 * S, 0.42 * S, crim, inset=0.22, pat=0)
    R.lod['boxes'].append((Vector((bxm, 0, bz + bh * 0.75)), (bx1 - bx0, bw_b, bh), crim))

    # White Marble Pedimented Quarterdeck Temple-Loggia aft with Royal Crimson Tympanum & recessed amber colonnade!
    lx0, lx1 = st.x + 0.08 * L, st.x + 0.275 * L
    lxm = (lx0 + lx1) * 0.5
    lz = dz(lxm)
    lw = min(H.half(lx0), H.half(lx1)) * 1.56
    box2(R.deck, lx0, -lw * 0.5, lz - 0.16, lx1, lw * 0.5, lz + 0.24 * S, iv, PT['ashlar'], skip=('-z',), jitter=0.0)
    zc0 = lz + 0.24 * S
    ch = 1.24 * S
    zc1 = zc0 + ch
    # 8 white marble columns (4 per side) framing recessed glowing amber colonnade!
    for k in range(4):
        cx = lx0 + 0.18 * S + (lx1 - lx0 - 0.36 * S) * k / 3.0
        for sd in (-1, 1):
            column(R.deck, cx, sd * lw * 0.44, zc0, zc1, 0.085 * S, iv, cap_col=g, segs=6)
    # Inner sanctuary core + recessed glowing amber marble colonnade panes (hb_fleet_window)
    box2(R.deck, lx0 + 0.28 * S, -lw * 0.29, zc0, lx1 - 0.28 * S, lw * 0.29, zc1, iv, PT['ashlar'], skip=('-z', '+z'), jitter=0.0)
    for sd in (-1, 1):
        for k in range(3):
            wx = lx0 + 0.44 * S + (lx1 - lx0 - 0.88 * S) * k / 2.0
            R.glow_pane((wx, sd * (lw * 0.29 + 0.03), zc0 + ch * 0.50), (0.48 * S, 0, 0), (0, 0, ch * 0.62), (0, sd, 0), col=TP['win_gold'])
    R.glow_pane((lx1 - 0.25 * S, 0, zc0 + ch * 0.48), (0, lw * 0.42, 0), (0, 0, ch * 0.62), (1, 0, 0), col=TP['win_amber'])
    # Gilded cornice + pedimented marble roof with Royal Crimson tympanum!
    box2(R.deck, lx0 - 0.08, -lw * 0.52, zc1, lx1 + 0.08, lw * 0.52, zc1 + 0.22 * S, g, PT['metal'], skip=(), jitter=0.0)
    gable(R.deck, lx0 - 0.14, lx1 + 0.14, -lw * 0.54, lw * 0.54, zc1 + 0.22 * S, 0.56 * S, iv, crim, roof_pat=PT['tiles'], ridge_col=g)
    rod(R.deck, (lxm, 0, zc1 + 0.78 * S), (lxm, 0, zc1 + 1.12 * S), 0.09 * S, g, 5, r2=0.02, cap=True, pat=PT['metal'])
    R.lod['boxes'].append((Vector((lxm, 0, (lz + zc1) * 0.5)), (lx1 - lx0, lw, zc1 - lz), iv))
    R.lod['boxes'].append((Vector((lxm, 0, zc1 + 0.42 * S)), (lx1 - lx0 + 0.2, lw + 0.2, 0.72 * S), crim))

    # 4 glowing stern transom windows + quarter lights
    R.stern_gallery_windows(n=3, u_start=-0.83, u_step=0.055, z_drop=0.50)
    R.transom_windows(n=4, z_frac=0.68, h=0.38)
    return R


# =================================================================== #8 XAUT: Sun-Forged Golden Bullion Cataphract Galley
def build_xaut(coll=None):
    sch = SCH(
        top=TP['ebony'], band=TP['gilt'], stripe=TP['gilt'], cap=TP['gilt'],
        deck=TP['deck_dark'], deck_in=TP['ebony'], boot=TP['tyrian'], bottom=TP['ebony'],
        house=TP['ebony'], roof=TP['gilt'], spar='timber_dark', cloth=TP['canvas_warm'],
        transom=TP['ebony'],
    )
    sch['deck_margin'] = TP['ebony']
    sch['oar_col'] = TP['gilt']
    sch['pennant_a'], sch['pennant_b'] = TP['gilt'], TP['tyrian']

    L = 22.0
    form = dict(
        br=4.45 / L, fb=0.108, dr=0.062, bow=2.55, stern=0.25, sheer=(0.36, 0.82),
        rb=0.032, rs=0.072, bul=0.020, rpow=1.1,
        aft_step=(-0.56, 0.46), tumblehome=-0.015, wale_out=0.085,
    )
    # Solid PBR Gilt armored upper strakes! (band=PT['strakes'] + stripe/cap=PT['metal'], all #E4B444 -> gleaming gold in metal.ts!)
    R = TitanRig('titan_xaut', 'large', L, form, sch, seed=808,
                 hull_pats=dict(band=PT['strakes'], stripe=PT['metal'], cap=PT['metal']))
    H, S = R.H, R.S
    dz = H.deck
    st, bw = H.stern(), H.bow()
    B = H.B
    eb, g, tyr, brz = TP['ebony'], TP['gilt'], TP['tyrian'], TP['bronze']

    # Armored ebony-bronze & solid PBR gilt galley + 12 Tyrian/gilt shields (6/side) + gilt steering oars
    R.dress_hull(n_sec=14, steering=True, steering_col=g, eyes_u=0.86, eye_scale=0.042,
                 shields=tyr, shield_rim=g, n_shields=6, shield_u=(-0.48, 0.46))

    # Cast-bronze ram + Lion/Sun-Disc Prow Bastion
    R.bronze_ram(length_k=0.086, col=brz, trident=True)
    bx = bw.x - 0.065 * L
    bz = dz(bx)
    bw_p = H.half(bx) * 1.48
    box2(R.deck, bx - 0.045 * L, -bw_p * 0.5, bz - 0.12, bx + 0.052 * L, bw_p * 0.5, bz + 0.50 * S, eb, PT['boards'], skip=('-z',), jitter=0.0)
    box2(R.deck, bx - 0.047 * L, -bw_p * 0.52, bz + 0.50 * S, bx + 0.054 * L, bw_p * 0.52, bz + 0.78 * S, tyr, 0, skip=('-z',), jitter=0.0)
    box2(R.deck, bx - 0.048 * L, -bw_p * 0.54, bz + 0.78 * S, bx + 0.056 * L, bw_p * 0.54, bz + 0.94 * S, g, PT['metal'], skip=(), jitter=0.0)
    # Sculpted gilt sun-disc / lion boss on prow face
    lc = Vector((bx + 0.058 * L, 0, bz + 0.46 * S))
    rod(R.deck, lc + Vector((-0.08, 0, 0)), lc + Vector((0.14, 0, 0)), 0.34 * S, g, 8, cap=True, pat=PT['metal'])
    torus_ring(R.deck, lc + Vector((0.06, 0, 0)), 0.40 * S, 0.065 * S, (0, 1, 0), (0, 0, 1), brz, n_seg=8, t_seg=4, pat=PT['metal'])
    R.lod['boxes'].append((Vector((bx, 0, bz + 0.45 * S)), (0.10 * L, bw_p, 0.95 * S), g))

    # 5-plume fanned golden aphlaston!
    R.aphlaston(5, g, spread_y=0.013, r_base=0.054, th_end=218)

    # 1 battle-mast + siparum (Tyrian crimson foot band, gilt carchesion & finials)
    R.mast_course(0.11, 0.74, 0.66, 0.11, tyr, main=True, siparum=True, r=0.92, carchesion_col=g, finial=g, nu=6, nv=5)
    R.stays()

    # LIVE ANIMATED GILDED OARS: 2 banks x 10 per side x 2 sides = 40 GILDED OARS!
    R.titan_oar_banks(2, 10, H.x0 - 0.28 * L, H.x0 + 0.24 * L, 0.195 * L, 0.0050 * L + 0.020, col=g)

    # Midships Open Gilded Vault framing a Glittering Pyramid of Stacked Solid-Gold Ingots!
    vx0, vx1 = H.x0 - 0.18 * L, H.x0 + 0.04 * L
    vxm = (vx0 + vx1) * 0.5
    vz = dz(vxm)
    vw = B * 0.68
    # Open gilded vault coaming & 4 heavy armored gilt pillars with overhead cross-arches
    box2(R.deck, vx0, -vw * 0.5, vz - 0.08, vx1, vw * 0.5, vz + 0.32 * S, eb, PT['ashlar'], skip=('-z',), jitter=0.0)
    box2(R.deck, vx0 - 0.04, -vw * 0.52, vz + 0.30 * S, vx1 + 0.04, vw * 0.52, vz + 0.40 * S, g, PT['metal'], skip=('-z',), jitter=0.0)
    vh = 1.32 * S
    for xx in (vx0 + 0.12, vx1 - 0.12):
        for sd in (-1, 1):
            column(R.deck, xx, sd * vw * 0.46, vz + 0.36 * S, vz + vh, 0.085 * S, g, cap_col=brz, segs=5, pat=PT['metal'])
        # Open gilded arch overhead framing the bullion stack
        rod(R.deck, (xx, -vw * 0.46, vz + vh), (xx, 0, vz + vh + 0.26 * S), 0.075 * S, g, 5, pat=PT['metal'])
        rod(R.deck, (xx, 0, vz + vh + 0.26 * S), (xx, vw * 0.46, vz + vh), 0.075 * S, g, 5, pat=PT['metal'])
    rod(R.deck, (vx0 + 0.12, 0, vz + vh + 0.26 * S), (vx1 - 0.12, 0, vz + vh + 0.26 * S), 0.08 * S, g, 5, pat=PT['metal'])
    # Fire-gold vault uplight floor bed (hb_fleet_window) illuminating the bullion pyramid at night!
    R.glow_pane((vxm, 0, vz + 0.41 * S), ((vx1 - vx0) * 0.86, 0, 0), (0, vw * 0.78, 0), (0, 0, 1), col=TP['win_gold'])
    for sd in (-1, 1):
        R.glow_pane((vxm, sd * (vw * 0.51), vz + 0.18 * S), ((vx1 - vx0) * 0.76, 0, 0), (0, 0, 0.16 * S), (0, sd, 0), col=TP['win_gold'])

    # Glittering 3-tier Pyramid of 14 Stacked Solid-Gold Bullion Ingots (all #E4B444 PBR Gilt, PT['metal'])!
    def ingot(cx, cy, z_bot, lx, ly, lz):
        # Trapezoidal beveled gold bar (bottom wider than top for gleaming slanted facets!)
        hx0, hy0 = lx * 0.5, ly * 0.5
        hx1, hy1 = lx * 0.36, ly * 0.36
        b0 = (cx - hx0, cy - hy0, z_bot); b1 = (cx + hx0, cy - hy0, z_bot)
        b2 = (cx + hx0, cy + hy0, z_bot); b3 = (cx - hx0, cy + hy0, z_bot)
        t0 = (cx - hx1, cy - hy1, z_bot + lz); t1 = (cx + hx1, cy - hy1, z_bot + lz)
        t2 = (cx + hx1, cy + hy1, z_bot + lz); t3 = (cx - hx1, cy + hy1, z_bot + lz)
        quad_oriented(R.deck, (t0, t1, t2, t3), (0, 0, 1), g, pat=PT['metal'])
        quad_oriented(R.deck, (b0, b1, t1, t0), (0, -1, 0.4), g, pat=PT['metal'])
        quad_oriented(R.deck, (b1, b2, t2, t1), (1, 0, 0.4), g, pat=PT['metal'])
        quad_oriented(R.deck, (b2, b3, t3, t2), (0, 1, 0.4), g, pat=PT['metal'])
        quad_oriented(R.deck, (b3, b0, t0, t3), (-1, 0, 0.4), g, pat=PT['metal'])

    ilx, ily, ilz = 0.72 * S, 0.40 * S, 0.24 * S
    z_ing = vz + 0.42 * S
    # Tier 1: 3 x 3 = 9 solid-gold bars
    for ix in (-1, 0, 1):
        for iy in (-1, 0, 1):
            ingot(vxm + ix * ilx * 1.08, iy * ily * 1.12, z_ing, ilx, ily, ilz)
    # Tier 2: 2 x 2 = 4 solid-gold bars
    for ix in (-0.5, 0.5):
        for iy in (-0.5, 0.5):
            ingot(vxm + ix * ilx * 1.10, iy * ily * 1.14, z_ing + ilz, ilx, ily, ilz)
    # Tier 3: 1 crowning solid-gold bar
    ingot(vxm, 0.0, z_ing + ilz * 2.0, ilx * 1.08, ily * 1.08, ilz * 1.12)
    R.lod['boxes'].append((Vector((vxm, 0, vz + 0.80 * S)), (vx1 - vx0, vw, 1.05 * S), g))

    # Aft Tyrian-crimson & ebony stern steering house with glowing stern ports
    sx0, sx1 = st.x + 0.09 * L, st.x + 0.21 * L
    sz, sw = R.titan_house(sx0, sx1, 0.66, 0.72 * S, eb, tyr, hip=True, roof_pat=PT['tiles'], pat=PT['boards'])
    R.lod['boxes'].append((Vector(((sx0 + sx1) * 0.5, 0, sz + 0.42 * S)), (sx1 - sx0, sw, 0.85 * S), tyr))
    R.stern_gallery_windows(n=3, u_start=-0.83, u_step=0.056, z_drop=0.44, col=TP['win_gold'])
    R.transom_windows(n=3, z_frac=0.66, h=0.34, col=TP['win_gold'])
    return R


# =================================================================== #9 USDG: Twin-Castled Global Consortium Naus
def build_usdg(coll=None):
    sch = SCH(
        top=TP['bone'], band=TP['olive'], stripe=TP['copper'], cap=TP['copper'],
        deck=TP['timber_deck'], deck_in=TP['bone'], boot=TP['bone'], bottom=TP['pitch'],
        house=TP['bone'], roof=TP['terracotta'], spar='timber_dark', cloth=TP['canvas_warm'],
        transom=TP['bone'],
    )
    sch['deck_margin'] = TP['deck_dark']
    sch['pennant_a'], sch['pennant_b'] = TP['olive_lt'], TP['bone']

    L = 21.6
    form = dict(
        br=6.00 / L, fb=0.128, dr=0.086, bow=2.3, stern=0.28, sheer=(0.36, 0.36),
        rb=0.048, rs=0.052, bul=0.025, rpow=1.25,
        # Symmetric raised forecastle AND sterncastle hull steps!
        fore_step=(0.46, 0.62), aft_step=(-0.46, 0.62), tumblehome=0.035, wale_out=0.088,
    )
    R = TitanRig('titan_usdg', 'large', L, form, sch, seed=909,
                 hull_pats=dict(stripe=PT['metal'], cap=PT['metal']))
    H, S = R.H, R.S
    dz = H.deck
    st, bw = H.stern(), H.bow()
    B = H.B
    bone, oliv, cop, terr = TP['bone'], TP['olive'], TP['copper'], TP['terracotta']

    # Balanced bone-white + laurel-olive + copper-bronze merchant naus
    R.dress_hull(n_sec=14, steering=True, steering_col=cop, eyes_u=0.85, eye_scale=0.034,
                 shields=cop, shield_rim=oliv, n_shields=6, shield_u=(-0.38, 0.38))
    R.crane_neck(st + Vector((0.01 * L, 0, -0.01 * L)), 0.048 * L, cop, y=0.0, segs=5, head_scale=0.9)
    R.stem_post(cop, 0.052)

    # 2 EQUAL twin square masts (sail-plan.ts auto-prints the USDG emblem on BOTH!) + artemon
    R.mast_course(0.15, 0.78, 0.66, 0.14, oliv, main=True, siparum=False, r=0.92, carchesion_col=cop, finial=cop, nu=6, nv=5)
    R.mast_course(-0.15, 0.78, 0.66, 0.14, oliv, main=False, siparum=False, r=0.92, carchesion_col=cop, finial=cop, nu=6, nv=5)
    R.artemon_t(40, 0.27 * L, 0.22 * L, finial=cop)
    R.stays()

    # Matching Raised Forecastle AND Sterncastle Deckhouses (olive shutters, terracotta roofs, twin-lit arched windows!)
    def castle_house(cx0, cx1, face_sign):
        cxm = (cx0 + cx1) * 0.5
        cz = dz(cxm)
        cw = min(H.half(cx0), H.half(cx1)) * 1.54
        ch = 1.12 * S
        box2(R.deck, cx0, -cw * 0.5, cz - 0.16, cx1, cw * 0.5, cz + ch, bone, PT['ashlar'], skip=('-z',), jitter=0.0)
        # Copper-bronze frieze cornice
        box2(R.deck, cx0 - 0.07, -cw * 0.53, cz + ch, cx1 + 0.07, cw * 0.53, cz + ch + 0.14 * S, cop, PT['metal'], skip=(), jitter=0.0)
        # Pitched terracotta tiled hip roof
        hip_roof(R.deck, cx0 - 0.14, cx1 + 0.14, -cw * 0.55, cw * 0.55, cz + ch + 0.14 * S, 0.54 * S, terr, inset=0.22, pat=PT['tiles'])
        # Deep laurel-olive shutters + glowing arched castle windows on both sides + waist face!
        for sd in (-1, 1):
            for k in range(2):
                wx = cx0 + (cx1 - cx0) * (0.30 + 0.40 * k)
                R.glow_pane((wx, sd * (cw * 0.5 + 0.03), cz + ch * 0.54), (0.42 * S, 0, 0), (0, 0, 0.52 * S), (0, sd, 0), col=TP['win_gold'])
                for sh_dx in (-0.30 * S, 0.30 * S):
                    box(R.deck, (wx + sh_dx, sd * (cw * 0.5 + 0.04), cz + ch * 0.54), (0.14 * S, 0.06, 0.54 * S), oliv, PT['boards'], jitter=0.0)
        # Waist-facing glowing arch doorway
        wx_end = cx0 - 0.03 if face_sign < 0 else cx1 + 0.03
        R.glow_pane((wx_end, 0, cz + ch * 0.48), (0, 0.58 * S, 0), (0, 0, 0.60 * S), (face_sign, 0, 0), col=TP['win_amber'])
        R.lod['boxes'].append((Vector((cxm, 0, cz + ch * 0.68)), (cx1 - cx0, cw, ch + 0.45 * S), bone))
        R.lod['boxes'].append((Vector((cxm, 0, cz + ch + 0.36 * S)), (cx1 - cx0 + 0.2, cw + 0.2, 0.55 * S), terr))
        return cz, cw, ch

    fc_x0, fc_x1 = H.x0 + 0.25 * L, H.x0 + 0.40 * L
    sc_x0, sc_x1 = H.x0 - 0.40 * L, H.x0 - 0.25 * L
    fcz, fcw, fch = castle_house(fc_x0, fc_x1, -1)
    scz, scw, sch_ = castle_house(sc_x0, sc_x1, 1)

    # Arched timber gangway joining forecastle & sterncastle across the cargo waist (twin side walkways clearing masts!)
    gz_deck = dz(H.x0) + 1.05 * S
    for sd in (-1, 1):
        gy = sd * B * 0.27
        # Slightly arched gangway deck planks + olive handrails
        segs = 4
        for i in range(segs):
            t0, t1 = i / segs, (i + 1) / segs
            xa = sc_x1 + (fc_x0 - sc_x1) * t0
            xb = sc_x1 + (fc_x0 - sc_x1) * t1
            za = gz_deck + 0.24 * S * math.sin(math.pi * t0)
            zb = gz_deck + 0.24 * S * math.sin(math.pi * t1)
            rod(R.deck, (xa, gy, za), (xb, gy, zb), 0.14 * S, PAL['timber'], 4, pat=PT['boards'])
            rod(R.deck, (xa, gy + sd * 0.14 * S, za + 0.42 * S), (xb, gy + sd * 0.14 * S, zb + 0.42 * S), 0.042 * S, oliv, 4)
        # Support stanchions down to waist deck
        for tx_s in (H.x0 - 0.08 * L, H.x0 + 0.08 * L):
            rod(R.deck, (tx_s, gy, dz(tx_s) - 0.04), (tx_s, gy, gz_deck + 0.18 * S), 0.065 * S, PAL['timber_dark'], 4)

    # Packed amphora & tarped bale cargo waist below the gangways
    R.amphora_rack(H.x0 - 0.07 * L, H.x0 + 0.07 * L, [-B * 0.14, 0.0, B * 0.14], h=0.44 * S)
    R.cargo_bales([
        (H.x0 - 0.19 * L, B * 0.14, 0.62 * S, 0.52 * S, 0.46 * S, TP['olive_lt']),
        (H.x0 - 0.19 * L, -B * 0.14, 0.56 * S, 0.56 * S, 0.42 * S, TP['bone']),
        (H.x0 + 0.19 * L, B * 0.14, 0.58 * S, 0.52 * S, 0.44 * S, TP['terracotta']),
        (H.x0 + 0.19 * L, -B * 0.14, 0.54 * S, 0.54 * S, 0.46 * S, TP['olive']),
    ])

    # Brass/Copper-Bronze Armillary Globe proudly crowning the central cargo waist bridge!
    gc = Vector((H.x0, 0, gz_deck + 0.92 * S))
    rod(R.deck, (H.x0, 0, dz(H.x0) + 0.42 * S), gc - Vector((0, 0, 0.48 * S)), 0.08 * S, cop, 5, pat=PT['metal'])
    torus_ring(R.deck, gc, 0.52 * S, 0.050 * S, (1, 0, 0), (0, 0, 1), cop, n_seg=10, t_seg=4, pat=PT['metal'])
    torus_ring(R.deck, gc, 0.45 * S, 0.045 * S, (0, 1, 0), (0, 0, 1), TP['gilt'], n_seg=10, t_seg=4, pat=PT['metal'])
    torus_ring(R.deck, gc, 0.42 * S, 0.040 * S, (1, 0, 0.4), (0, 1, 0), cop, n_seg=10, t_seg=4, pat=PT['metal'])

    # Stern quarter & transom windows
    R.stern_gallery_windows(n=3, u_start=-0.84, u_step=0.055, z_drop=0.48)
    R.transom_windows(n=3, z_frac=0.68, h=0.36)
    return R


# =================================================================== #10 PYUSD: Sapphire & Silver Commerce Lembos Packet
def build_pyusd(coll=None):
    sch = SCH(
        top=TP['ivory_crisp'], band=TP['sapphire'], stripe=TP['silver'], cap=TP['silver'],
        deck=TP['timber_deck'], deck_in=TP['ivory_crisp'], boot=TP['sapphire'], bottom=TP['pitch'],
        house=TP['ivory_crisp'], roof=TP['sapphire'], spar='timber_dark', cloth=TP['canvas_ivory'],
        transom=TP['ivory_crisp'],
    )
    sch['deck_margin'] = TP['deck_dark']
    sch['pennant_a'], sch['pennant_b'] = TP['sapphire_lt'], TP['silver']

    L = 21.0
    form = dict(
        br=5.30 / L, fb=0.125, dr=0.080, bow=2.45, stern=0.25, sheer=(0.52, 0.64),
        rb=0.085, rs=0.072, bul=0.022, rpow=1.70,
        aft_step=(-0.48, 0.46), tumblehome=-0.015, wale_out=0.075,
    )
    R = TitanRig('titan_pyusd', 'large', L, form, sch, seed=1010,
                 hull_pats=dict(stripe=PT['metal'], cap=PT['metal']))
    H, S = R.H, R.S
    dz = H.deck
    st, bw = H.stern(), H.bow()
    B = H.B
    iv, sap, sap_lt, sil, brz = TP['ivory_crisp'], TP['sapphire'], TP['sapphire_lt'], TP['silver'], TP['bronze']

    # Crisp ivory-white + Prussian-sapphire + satin-silver commerce lembos clipper
    R.dress_hull(n_sec=14, steering=True, steering_col=brz, eyes_u=0.83, eye_scale=0.036,
                 shields=sap, shield_rim=sil, n_shields=5, shield_u=(-0.46, 0.46))

    # Scalloped Silver-Trimmed Clipper Bow + Twin Overhanging Bronze Lantern Davits!
    bow_pts = arc(bw + Vector((-0.01 * L, 0, -0.008 * L)), 0.052 * L, 210, n=6, fwd=-1.0)
    for i in range(len(bow_pts) - 1):
        ra = (0.016 * L + 0.02) * (1.0 - 0.45 * i / 5.0)
        rb = (0.016 * L + 0.02) * (1.0 - 0.45 * (i + 1) / 5.0)
        rod(R.hull, bow_pts[i], bow_pts[i + 1], ra, sil, 5, r2=rb, cap=(i == 4), pat=PT['metal'])
    # Scalloped silver trailboard knee trim along both bows
    for sd in (-1, 1):
        p_a = Vector((H.x(0.84, H.zt(0.84)), sd * (H.w(0.84) + 0.06), H.zt(0.84) - 0.25))
        p_b = Vector((bw.x + 0.014 * L, sd * 0.14, bw.z + 0.014 * L))
        rod(R.hull, p_a, p_b, 0.072 * S, sil, 4, pat=PT['metal'])
        # Overhanging curved aged-bronze lantern davit + suspended glowing lantern box!
        dbase = Vector((H.x(0.82, H.zt(0.82)), sd * (H.w(0.82) - 0.04), H.zt(0.82)))
        dmid = dbase + Vector((0.044 * L, sd * 0.038 * L, 0.058 * L))
        dtip = dbase + Vector((0.076 * L, sd * 0.050 * L, 0.052 * L))
        rod(R.deck, dbase, dmid, 0.065 * S, brz, 5, r2=0.050 * S, pat=PT['metal'])
        rod(R.deck, dmid, dtip, 0.050 * S, brz, 5, r2=0.038 * S, cap=True, pat=PT['metal'])
        lc = dtip + Vector((0, 0, -0.30 * S))
        rod(R.deck, dtip, lc + Vector((0, 0, 0.17 * S)), 0.024 * S, brz, 4, pat=PT['metal'])
        box(R.deck, lc + Vector((0, 0, 0.17 * S)), (0.28 * S, 0.28 * S, 0.09 * S), brz, pat=PT['metal'], jitter=0.0)
        R.glow_box(lc, (0.24 * S, 0.24 * S, 0.28 * S), col=TP['win_gold'], skip=())
        box(R.deck, lc - Vector((0, 0, 0.17 * S)), (0.26 * S, 0.26 * S, 0.07 * S), brz, pat=PT['metal'], jitter=0.0)
    R.lod['posts'].append((bow_pts, 0.015 * L, sil))

    # Sweeping satin-silver stern volute
    R.crane_neck(st + Vector((0.01 * L, 0, -0.01 * L)), 0.050 * L, sil, y=0.0, segs=5, head_scale=0.9)

    # Hybrid Split Rig: tall square main + siparum + swinging aft sprit mizzen (boom!) — no artemon
    R.mast_course(0.09, 0.86, 0.78, 0.13, sap, main=True, siparum=True, carchesion_col=sil, finial=sil, nu=6, nv=5)
    R.sprit_mizzen(-0.23, 0.58, 0.30, foot_k=0.14, peak_deg=44.0, foot_col=sap, rake_deg=5.0)
    R.stays()

    # Twin Arched Sapphire-Silk Deck Canopies over merchant coffers & brass scales!
    def arched_canopy(cx0, cx1, with_scales=False):
        cxm = (cx0 + cx1) * 0.5
        cz = dz(cxm)
        cw = min(H.half(cx0), H.half(cx1)) * 1.38
        ch = 1.05 * S
        for xx in (cx0 + 0.10, cx1 - 0.10):
            for sd in (-1, 1):
                rod(R.deck, (xx, sd * cw * 0.44, cz - 0.04), (xx, sd * cw * 0.44, cz + ch), 0.052 * S, sil, 4, pat=PT['metal'])
        # Curved arched vault (4 arch facets across y) in Prussian sapphire with silver edge ribs!
        ny = 4
        ys = [-cw * 0.50 + cw * j / ny for j in range(ny + 1)]
        zs = [cz + ch + 0.38 * S * math.sin(math.pi * j / ny) for j in range(ny + 1)]
        for j in range(ny):
            quad_oriented(R.deck, ((cx0, ys[j], zs[j]), (cx1, ys[j], zs[j]), (cx1, ys[j + 1], zs[j + 1]), (cx0, ys[j + 1], zs[j + 1])),
                          (0, (ys[j] + ys[j + 1]) * 0.3, 1.0), sap if j in (0, 3) else sap_lt, pat=0, jitter=0.0)
        for xx in (cx0, cx1):
            for j in range(ny):
                rod(R.deck, (xx, ys[j], zs[j]), (xx, ys[j + 1], zs[j + 1]), 0.040 * S, sil, 4, pat=PT['metal'])
        # Glowing canopy sconce lantern tucked beneath the vault peak!
        R.glow_box((cxm, 0, cz + ch + 0.16 * S), (0.28 * S, 0.22 * S, 0.20 * S), col=TP['win_gold'], skip=())
        # Merchant coffers / brass balance scales beneath the canopy
        if with_scales:
            box(R.deck, (cxm, 0, cz + 0.26 * S), (0.72 * S, 0.90 * S, 0.52 * S), PAL['timber_dark'], PT['boards'], skip=('-z',))
            # Gleaming bronze counting scale on table
            rod(R.deck, (cxm, 0, cz + 0.52 * S), (cxm, 0, cz + 0.92 * S), 0.04 * S, brz, 4, pat=PT['metal'])
            rod(R.deck, (cxm, -0.32 * S, cz + 0.88 * S), (cxm, 0.32 * S, cz + 0.88 * S), 0.03 * S, brz, 4, pat=PT['metal'])
            for sd in (-1, 1):
                rod(R.deck, (cxm, sd * 0.30 * S, cz + 0.68 * S), (cxm, sd * 0.30 * S, cz + 0.74 * S), 0.14 * S, brz, 5, r2=0.06 * S, cap=True, pat=PT['metal'])
        else:
            for ox, oy in ((-0.28 * S, -0.26 * S), (0.26 * S, -0.22 * S), (0.0, 0.26 * S)):
                box(R.deck, (cxm + ox, oy, cz + 0.22 * S), (0.48 * S, 0.36 * S, 0.42 * S), PAL['timber_dark'], PT['boards'], skip=('-z',))
                box(R.deck, (cxm + ox, oy, cz + 0.43 * S), (0.50 * S, 0.10 * S, 0.06 * S), brz, PT['metal'], skip=('-z',), jitter=0.0)
        R.lod['boxes'].append((Vector((cxm, 0, cz + ch * 0.72)), (cx1 - cx0, cw, ch * 1.15), sap))

    arched_canopy(H.x0 + 0.18 * L, H.x0 + 0.30 * L, with_scales=False)
    arched_canopy(H.x0 - 0.14 * L, H.x0 - 0.02 * L, with_scales=True)

    # Ivory & Sapphire Counting-House Stern with glowing arched windows!
    sx0, sx1 = st.x + 0.08 * L, st.x + 0.25 * L
    sxm = (sx0 + sx1) * 0.5
    sz, sw = R.titan_house(sx0, sx1, 0.72, 1.02 * S, iv, sap, hip=True, roof_pat=PT['slate'], pat=PT['ashlar'])
    # Sapphire corner pilasters + glowing counting-house arched windows on sides & fore face!
    for xx in (sx0 + 0.06, sx1 - 0.06):
        for sd in (-1, 1):
            box(R.deck, (xx, sd * sw * 0.50, sz + 0.52 * S), (0.18 * S, 0.12 * S, 1.02 * S), sap, 0, skip=('-z',), jitter=0.0)
    for sd in (-1, 1):
        for k in range(3):
            wx = sx0 + (sx1 - sx0) * (k + 0.5) / 3.0
            R.glow_pane((wx, sd * (sw * 0.5 + 0.03), sz + 0.54 * S), (0.36 * S, 0, 0), (0, 0, 0.48 * S), (0, sd, 0), col=TP['win_gold'])
    R.glow_pane((sx1 + 0.03, 0, sz + 0.48 * S), (0, 0.54 * S, 0), (0, 0, 0.56 * S), (1, 0, 0), col=TP['win_amber'])
    R.lod['boxes'].append((Vector((sxm, 0, sz + 0.65 * S)), (sx1 - sx0, sw, 1.35 * S), iv))

    # Stern hull quarter & transom windows
    R.stern_gallery_windows(n=3, u_start=-0.83, u_step=0.055, z_drop=0.50)
    R.transom_windows(n=4, z_frac=0.68, h=0.36)
    return R
