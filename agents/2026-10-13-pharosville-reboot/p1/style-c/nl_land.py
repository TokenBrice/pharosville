"""Northern Light (style C) - land, headland, breakwater, harbour structures, town + dressing.
exec'd into nl_world's namespace (shares M, PAL, COAST, ...)."""

# ------------------------------------------------------------------ LAND
SEA_FLOOR = -4.0
Z_QUAY = 2.4
Z_T1, Z_T2, Z_T3, Z_HEAD = 7.5, 12.5, 16.5, 13.0
COAST = []          # waterline polygons (R channel)
CONTACT = []        # hull waterlines (B channel)
CIRCLES = []        # rocks
PILES = []          # pile contact (B channel)

QX0, QX1 = -54.0, 40.0
ISLAND = smooth_closed([(QX0, 0), (-20, 0), (10, 0), (QX1, 0), (40, -5), (42, -15), (48, -24), (58, -29), (70, -31), (81, -27),
                        (88, -17), (92, -4), (91, 10), (86, 22), (78, 32), (66, 40), (54, 47), (40, 55), (26, 62), (10, 67),
                        (-8, 70), (-26, 69), (-42, 65), (-55, 57), (-63, 46), (-68, 33), (-66, 20), (-61, 9), (-57, 2)], 3)


def fix_quay(poly):
    out = []
    for x, y in poly:
        if QX0 - 0.5 <= x <= QX1 + 0.5 and abs(y) < 1.8:
            y = 0.0
        out.append((x, y))
    return out


ISLAND = fix_quay(ISLAND)
HEADLAND = smooth_closed([(39.5, 6), (41, -6), (44, -16), (50, -23), (60, -27), (71, -28), (81, -24), (87, -14), (90, -2),
                          (88, 12), (82, 23), (72, 30), (60, 32), (50, 29), (43, 20)], 3)
T1 = smooth_closed([(-62, 21.5), (-40, 21.5), (-12, 21.5), (14, 21.5), (29, 22.5), (32, 32), (27, 44), (13, 54), (-6, 61),
                    (-26, 63), (-44, 59), (-56, 50), (-64, 36)], 3)
T2 = smooth_closed([(-47, 40.5), (-26, 40.5), (-4, 40.5), (12, 42), (19, 49), (11, 56), (-6, 61), (-26, 63), (-42, 58), (-50, 50)], 3)
T3 = smooth_closed([(-38, 52.5), (-18, 51), (0, 52.5), (7, 57), (-6, 61.5), (-26, 63.5), (-40, 59)], 3)
for P_ in (ISLAND, HEADLAND, T1, T2, T3):
    if poly_area(P_) < 0:
        P_.reverse()
COAST.append(ISLAND)


def rock_wall(name, poly, z0, z1, rows=4, amp=0.9, seed=0, straight=None, ashlar=None, top_color=None, lip=True,
              top_pattern=None, family='terrain', jag=0.0):
    """Faceted strata cliff around poly z0..z1 + top; `straight(x,y)` keeps an exact vertical edge (quay),
    `ashlar(x,y)` marks retaining-wall stretches."""
    bm = bmesh.new(); n = len(poly); rings = []
    for r in range(rows + 1):
        f = r / rows
        z = z0 + (z1 - z0) * f
        ring = []
        for i, (x, y) in enumerate(poly):
            st_ = straight and straight(x, y)
            as_ = ashlar and ashlar(x, y)
            if st_ or as_:
                q = Vector((x, y)); dz = 0.0
            else:
                p0 = Vector(poly[i - 1]); p2 = Vector(poly[(i + 1) % n])
                tng = (p2 - p0).normalized(); nr = Vector((tng.y, -tng.x))
                k = noise.noise(Vector((x * 0.13 + seed, y * 0.13, z * 0.3))) * amp
                k += 0.4 * amp * math.sin(z * 1.3 + x * 0.07 + y * 0.05)
                k += jag * (((i * 7 + r * 3) % 5) / 4 - 0.5)
                if 0 < r < rows:
                    k += amp * 0.55 * ((r % 2) * 2 - 1) * (0.6 + 0.4 * noise.noise(Vector((x * 0.05, y * 0.05, r))))
                if r == 0:
                    k += amp * 0.9
                if r == rows:
                    k *= 0.35
                q = Vector((x, y)) + nr * k
                dz = noise.noise(Vector((x * 0.2, y * 0.2, seed))) * 0.3 if 0 < r < rows else 0.0
            ring.append(bm.verts.new((q.x, q.y, z + dz)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    top = bm.faces.new(rings[-1])
    bmesh.ops.triangulate(bm, faces=[top])
    bm.normal_update()
    zt = z1

    def fc(poly_):
        c = poly_.center
        if poly_.normal.z > 0.9 and c.z > zt - 0.05:
            return (top_color or PAL['grass'], top_pattern if top_pattern is not None else PT['grass'])
        if straight and straight(c.x, c.y):
            return (PAL['quay_dark'], PT['ashlar'])
        if ashlar and ashlar(c.x, c.y):
            return (PAL['granite'], PT['ashlar'])
        if c.z < 0.6:
            return (PAL['rock_wet'], PT['rock'])
        nn = noise.noise(Vector((c.x * 0.09, c.y * 0.09, c.z * 0.4 + seed)))
        if poly_.normal.z > 0.45:
            return (PAL['rock_light'], PT['rock'])
        return (PAL['rock_dark'] if nn > 0.2 else PAL['rock'], PT['rock'])
    ob = obj(name, bm, face=fc, jitter=0.07, seed=seed, family=family)
    if lip:
        lp = offset_poly(poly, 0.4)
        lb = bm_prism(lp, zt - 0.5, zt + 0.14)
        # drop lip stretches where the wall is masonry: rebuild as per-edge slabs instead
        lb.free()
        lb = bmesh.new()
        m_ = len(lp)
        for i in range(m_):
            a, b = Vector(poly[i]), Vector(poly[(i + 1) % m_])
            if (straight and straight(a.x, a.y)) or (ashlar and ashlar(a.x, a.y) and ashlar(b.x, b.y)):
                continue
            pa, pb = Vector(lp[i]), Vector(lp[(i + 1) % m_])
            t0_, t1_ = zt + 0.14, zt - 0.55
            v = [lb.verts.new((a.x, a.y, t0_)), lb.verts.new((b.x, b.y, t0_)), lb.verts.new((pb.x, pb.y, t0_)),
                 lb.verts.new((pa.x, pa.y, t0_)), lb.verts.new((pb.x, pb.y, t1_)), lb.verts.new((pa.x, pa.y, t1_))]
            lb.faces.new((v[0], v[1], v[2], v[3]))
            lb.faces.new((v[3], v[2], v[4], v[5]))
        bmesh.ops.recalc_face_normals(lb, faces=lb.faces)

        def lfc(q):
            if q.normal.z > 0.9:
                return (top_color or PAL['grass'], top_pattern if top_pattern is not None else PT['grass'])
            return (PAL['grass_dark'], PT['grass'])
        if len(lb.faces):
            obj(name + '_lip', lb, face=lfc, family=family, jitter=0.03)
        else:
            lb.free()
    return ob


def in_quay(x, y):
    return QX0 - 0.5 <= x <= QX1 + 0.5 and abs(y) < 0.01


def front_t1(x, y):
    return y < 24 and -61 < x < 30


def front_t2(x, y):
    return y < 43 and -46 < x < 14


rock_wall('land_shore', ISLAND, SEA_FLOOR, Z_QUAY, rows=4, amp=1.2, seed=1, straight=in_quay, lip=True, jag=0.8)
rock_wall('land_headland', HEADLAND, SEA_FLOOR, Z_HEAD, rows=9, amp=1.9, seed=3, jag=1.5)
rock_wall('land_t1', T1, Z_QUAY - 0.5, Z_T1, rows=3, amp=0.9, seed=5, ashlar=front_t1, jag=0.6)
rock_wall('land_t2', T2, Z_T1 - 0.5, Z_T2, rows=3, amp=0.9, seed=7, ashlar=front_t2, jag=0.6)
rock_wall('land_t3', T3, Z_T2 - 0.5, Z_T3, rows=3, amp=1.2, seed=9, jag=1.0)

# quay apron paving + coping stones
qa = bm_box2(QX0, 0, Z_QUAY - 0.3, QX1, 10.5, Z_QUAY + 0.06)
obj('quay_paving', qa, PAL['cobble'], PT['cobble'], family='quay', jitter=0.0)
cp = bmesh.new()
nseg = int((QX1 - QX0) / 2.0)
for k in range(nseg):
    x0 = QX0 + k * 2.0
    merge(cp, bm_box2(x0 + 0.03, -0.2, Z_QUAY, x0 + 1.97, 0.9, Z_QUAY + 0.34))
obj('quay_coping', cp, PAL['quay'], PT['plain'], family='quay', jitter=0.08, bevel=0.06)
# quay water stair (cut into the wall, west of the spine)
qs = bmesh.new()
for k in range(6):
    merge(qs, bm_box2(-2.6 - k * 0.0, -2.2 + k * 0.0, -1.0, -0.4, -0.4 - k * 0.3, Z_QUAY - 0.4 * k) if False else
          bm_box2(30.5, -0.2 - 1.8 + k * 0.3, -1.0, 33.0, -0.2, Z_QUAY - 0.4 * (5 - k)))
obj('quay_waterstair', qs, PAL['quay'], PT['ashlar'], family='quay', bevel=0.03)
COAST.append([(30.5, -2.0), (33.0, -2.0), (33.0, 0.0), (30.5, 0.0)])
# coping on retaining walls
for nm, poly, z, test in (('t1', T1, Z_T1, front_t1), ('t2', T2, Z_T2, front_t2)):
    cb = bmesh.new()
    for i in range(len(poly)):
        a, b = Vector(poly[i]), Vector(poly[(i + 1) % len(poly)])
        if test(a.x, a.y) and test(b.x, b.y):
            merge(cb, beam((a.x, a.y, z + 0.16), (b.x, b.y, z + 0.16), 0.9, 0.38))
    obj(f'{nm}_coping', cb, PAL['granite_light'], PT['plain'], family='quay', bevel=0.05)


def ground_z(x, y):
    for poly, z in ((T3, Z_T3), (T2, Z_T2), (T1, Z_T1), (HEADLAND, Z_HEAD), (ISLAND, Z_QUAY)):
        if point_in_poly(x, y, poly):
            return z
    return -9.0


# ------------------------------------------------------------------ HEADLAND
set_coll(collection('lighthouse', ROOTC))
LH_POS = (66.0, -3.0)
lh_root, LAMP = build_lighthouse('pharos', (LH_POS[0], LH_POS[1], Z_HEAD))
build_house('keeper_cottage', dict(w=10.0, d=6.4, floors=1, fh=3.0, base=0.6, ridge='x', pitch=44, wall=PAL['wall_white'],
                                   wall_pat='render', roof=PAL['roof_red'], roof_style='tiles', door='-y', win_pitch=2.4,
                                   flowers=True, door_col=PAL['door_green'], chimney=True, win_faces=['-y', '-x']),
            (58.0, 19.0, Z_HEAD), 0.0, seed=41, family='lighthouse')
build_oil_store('oil_store', (78.0, 9.0, Z_HEAD), 0.0)
build_signal_mast('signal_mast', (49.5, -12.0, Z_HEAD))
gw = bmesh.new()
for a, b in (((51, 13), (51, 25)), ((51, 25), (67, 25)), ((67, 25), (67, 14))):
    merge(gw, beam((a[0], a[1], Z_HEAD + 0.45), (b[0], b[1], Z_HEAD + 0.45), 0.6, 1.0))
obj('keeper_wall', gw, PAL['granite'], PT['ashlar'], family='lighthouse', bevel=0.05)
pth = bmesh.new()
for a, b in (((44, 23), (52, 11)), ((52, 11), (60, 5.5)), ((60, 5.5), (66, -6.5)), ((60, 5.5), (72, 8)), ((72, 8), (78, 6))):
    merge(pth, beam((a[0], a[1], Z_HEAD + 0.03), (b[0], b[1], Z_HEAD + 0.03), 1.8, 0.24))
obj('headland_path', pth, PAL['gravel'], PT['cobble'], family='lighthouse', jitter=0.02)
# keeper's veg rows + laundry
veg = bmesh.new()
for r in range(4):
    for k in range(6):
        merge(veg, bm_ico(0.35, (54 + k * 1.6, 23.0 - r * 1.0 if False else 22.5 - r * 0.9 + 0.0, Z_HEAD + 0.3), 1, (1, 1, 0.7), seed=r * 6 + k))
obj('keeper_veg', veg, PAL['grass_light'], PT['leaf'], family='lighthouse', jitter=0.1)
# cliff stair from the quay to the headland
st = bmesh.new()
nst = 20
for k in range(nst):
    z = Z_QUAY + (k + 1) * (Z_HEAD - Z_QUAY) / nst
    y0 = 6.0 + k * 0.8
    merge(st, bm_box2(35.5, y0, Z_QUAY - 1, 39.0, y0 + 0.82, z))
merge(st, bm_box2(35.5, 22.0, Z_QUAY - 1, 44.5, 26.0, Z_HEAD + 0.05))
obj('cliff_stair', st, PAL['granite_light'], PT['ashlar'], family='quay', bevel=0.04)
rl_ = bmesh.new()
for k in range(0, nst + 1, 4):
    z = Z_QUAY + k * (Z_HEAD - Z_QUAY) / nst; y0 = 6.0 + k * 0.8
    merge(rl_, line3((35.6, y0, z), (35.6, y0, z + 1.0), 0.05))
merge(rl_, line3((35.6, 6.0, Z_QUAY + 1.0), (35.6, 22.0, Z_HEAD + 1.0), 0.05))
obj('cliff_stair_rail', rl_, PAL['iron'], PT['metal'], family='quay')

# ------------------------------------------------------------------ BREAKWATER + harbour light
set_coll(collection('breakwater', ROOTC))
BW = smooth_open([(47, -21), (50, -38), (43, -54), (26, -64), (4, -69), (-12, -70)], 6)
L_bw = []
for i in range(len(BW)):
    a = Vector(BW[max(0, i - 1)]); b = Vector(BW[min(len(BW) - 1, i + 1)])
    t = (b - a).normalized(); nrm = Vector((t.y, -t.x))      # nrm points to the open sea (outside)
    L_bw.append((Vector(BW[i]), t, nrm))
crown = bmesh.new(); para = bmesh.new(); rub = bmesh.new()
for (p, t, nrm), (q, t2, n2) in zip(L_bw, L_bw[1:]):
    merge(crown, beam((p.x, p.y, 1.6), (q.x, q.y, 1.6), 6.4, 4.4))
    pp = p + nrm * 2.5; qq = q + n2 * 2.5
    merge(para, beam((pp.x, pp.y, 4.3), (qq.x, qq.y, 4.3), 1.4, 1.3))
obj('breakwater_crown', crown, PAL['quay'], PT['ashlar'], family='breakwater', bevel=0.06)
obj('breakwater_parapet', para, PAL['granite_light'], PT['ashlar'], family='breakwater', bevel=0.06)
rng = random.Random(5)
for i, (p, t, nrm) in enumerate(L_bw):
    for side, cnt, rr in ((1, 3, (1.5, 2.5)), (-1, 2, (1.0, 1.6))):
        for k in range(cnt):
            r = rng.uniform(*rr)
            off = nrm * side * (3.6 + k * 1.7 + rng.uniform(-0.4, 0.4)) + t * rng.uniform(-1.6, 1.6)
            c = p + off
            merge(rub, bm_ico(r, (c.x, c.y, rng.uniform(-0.2, 1.0) - k * 0.6), 1, (1.3, 1.0, 0.8), seed=i * 7 + k, amp=0.3))
            CIRCLES.append((c.x, c.y, r * 1.15))
obj('breakwater_rubble', rub, face=lambda q: ((PAL['rock_wet'] if q.center.z < 0.45 else (PAL['rock'] if q.normal.z < 0.6 else PAL['rock_light'])), PT['rock']),
    family='breakwater', jitter=0.08)
left = [tuple(p + nrm * 3.3) for p, t, nrm in L_bw]; right = [tuple(p - nrm * 3.3) for p, t, nrm in L_bw]
COAST.append(left + right[::-1])
tip = Vector(BW[-1]) + Vector((-1.8, 0))
hl = bmesh.new()
merge(hl, bm_cyl(3.0, 3.0, 5.0, 16, (tip.x, tip.y, -1)))
obj('harbour_light_base', hl, PAL['quay'], PT['ashlar'], family='breakwater', bevel=0.05)
hl = bm_cyl(1.6, 1.3, 5.2, 12, (tip.x, tip.y, 4.0))
obj('harbour_light_tower', hl, face=lambda q: ((PAL['hull_red'] if 5.7 < q.center.z < 7.4 else PAL['wall_white']), PT['render']), family='breakwater', bevel=0.04)
bl = bm_cyl(1.7, 1.7, 0.2, 12, (tip.x, tip.y, 9.2))
merge(bl, bm_cyl(0.95, 0.15, 0.9, 12, (tip.x, tip.y, 10.6)))
obj('harbour_light_cap', bl, PAL['iron'], PT['metal'], family='breakwater')
obj('harbour_light_lamp', bm_cyl(0.75, 0.75, 1.2, 10, (tip.x, tip.y, 9.4)), mat=M['beacon_red'], family='breakwater')
HL_POS = Vector((tip.x, tip.y, 10.0))
CIRCLES.append((tip.x, tip.y, 3.2))
# channel buoys
by = bmesh.new()
for (x, y, red) in ((-24.0, -56.0, True), (-16.0, -78.0, False)):
    merge(by, bm_cyl(0.8, 0.9, 1.4, 8, (x, y, -0.3)))
    merge(by, bm_cyl(0.55, 0.0 if not red else 0.55, 1.3, 8, (x, y, 1.1)))
    CONTACT.append([(x + math.cos(a) * 0.9, y + math.sin(a) * 0.9) for a in np.linspace(0, 2 * math.pi, 10, endpoint=False)])
obj('buoys', by, face=lambda q: ((PAL['hull_red'] if q.center.x < -20 else PAL['hull_green']) if q.center.z > 0.25 else (PAL['hull_white'], 0)[0], PT['plain']),
    family='prop_buoy')

# ------------------------------------------------------------------ HARBOUR
set_coll(collection('harbour', ROOTC))
DECK = 1.2
LAMPS = []
PIER_SEGS = [(8, -38, 13, 0.4), (-10, -43, 30, -38)]
FING_SEGS = [(-6, -12.9, 8, -11.1), (-8, -26.9, 8, -25.1)]
build_pier('pier_grand', PIER_SEGS, DECK)
build_pier('pier_fingers', FING_SEGS, DECK, pile_step=3.4)
for (x0, y0, x1, y1) in PIER_SEGS + FING_SEGS:
    along_x = (x1 - x0) >= (y1 - y0)
    if along_x:
        n = max(1, round((x1 - x0) / (3.2 if (x0, y0) in [(s[0], s[1]) for s in PIER_SEGS] else 3.4)))
        for k in range(n + 1):
            xx = x0 + 0.2 + k * (x1 - x0 - 0.4) / n
            PILES += [(xx, y0 + 0.1, 0.24), (xx, y1 - 0.1, 0.24)]
    else:
        n = max(1, round((y1 - y0) / 3.2))
        for k in range(n + 1):
            yy = y0 + 0.2 + k * (y1 - y0 - 0.4) / n
            PILES += [(x0 + 0.1, yy, 0.24), (x1 - 0.1, yy, 0.24)]
stp = bmesh.new()
for k in range(4):
    merge(stp, bm_box2(8, 0.4 + k * 0.6, -1, 13, 0.4 + (k + 1) * 0.6, DECK + (k + 1) * 0.3))
obj('pier_steps', stp, PAL['quay'], PT['ashlar'], family='quay', bevel=0.03)
# pier ladder + life ring
lad = bmesh.new()
for (x, y) in ((13.1, -30.0), (-10.1, -40.5)):
    for s in (-0.35, 0.35):
        merge(lad, line3((x, y + s, -0.5), (x, y + s, DECK + 0.9), 0.05))
    for k in range(5):
        merge(lad, line3((x, y - 0.35, k * 0.35), (x, y + 0.35, k * 0.35), 0.035))
obj('pier_ladders', lad, PAL['iron'], PT['metal'], family='pier')
lr = bmesh.new()
for (x, y) in ((12.6, -33.0), (30.0 - 0.5, -42.6)):
    merge(lr, bm_box2(x - 0.08, y - 0.08, DECK, x + 0.08, y + 0.08, DECK + 1.5))
obj('lifering_posts', lr, PAL['trim'], PT['plain'], family='pier')
ring = bmesh.new()
for (x, y) in ((12.6, -33.2), (29.5, -42.8)):
    t = bm_cyl(0.42, 0.42, 0.14, 12, (0, 0, -0.07), cap=False)
    merge(t, bm_cyl(0.24, 0.24, 0.14, 12, (0, 0, -0.07), cap=False))
    xf(t, rx=math.pi / 2); xf(t, loc=(x, y, DECK + 1.05))
    merge(ring, t)
obj('liferings', ring, face=lambda q: ((PAL['hull_red'] if (math.atan2(q.center.z - DECK - 1.05, q.center.x - 12.6) * 4 / math.pi) % 2 < 1 else PAL['hull_white']), 0), family='pier')

BOLL = {}
bol = bmesh.new()
for x in (-50, -44, -36, -26, -16, -4, 4, 18, 26, 36):
    bollard(bol, (x, 0.8, Z_QUAY + 0.3)); BOLL[f'q{x}'] = Vector((x, 0.8, Z_QUAY + 0.75))
for nm, p in (('f1e', (-5.4, -12.0)), ('f1m', (1.0, -12.0)), ('f2e', (-7.4, -26.0)), ('f2m', (0.0, -26.0)),
              ('sp1', (8.6, -9.0)), ('sp2', (8.6, -16.0)), ('sp3', (8.6, -23.5)), ('sp4', (8.6, -29.5)), ('sp5', (12.4, -9)),
              ('t1', (-9.2, -42.4)), ('t2', (0.0, -42.4)), ('t3', (10.0, -42.4)), ('t4', (20.0, -42.4)), ('t5', (29.2, -42.4)),
              ('t6', (-9.2, -38.6)), ('t7', (29.2, -38.6)), ('f2x', (0.0, -26.6))):
    bollard(bol, (p[0], p[1], DECK), 0.75); BOLL[nm] = Vector((p[0], p[1], DECK + 0.45))
obj('bollards', bol, PAL['iron'], PT['metal'], family='quay', smooth=False)
for i, (x, y, z) in enumerate(((-47, 1.6, Z_QUAY + 0.06), (-21, 1.6, Z_QUAY + 0.06), (0.5, 1.6, Z_QUAY + 0.06), (24, 1.6, Z_QUAY + 0.06),
                               (12.5, -19.0, DECK), (-9.4, -40.4, DECK), (29.4, -40.4, DECK), (-5.6, -26.0, DECK), (-5.6, -12.0, DECK))):
    lamp_post(f'lamp_{i}', (x, y, z), h=3.4 if z > 2 else 3.0, lamps=LAMPS)
for i, (x, y) in enumerate(((-40, 24.5), (-12, 24.5), (16, 24.5), (-30, 43.3), (2, 43.3))):
    lamp_post(f'lamp_town_{i}', (x, y, ground_z(x, y)), h=3.2, lamps=LAMPS)
for i, (x, y) in enumerate(((44.0, 24.0), (60.0, 6.5))):
    lamp_post(f'lamp_head_{i}', (x, y, Z_HEAD), h=3.0, lamps=LAMPS)

# quay clutter
cr = bmesh.new(); br = bmesh.new(); nets = bmesh.new(); corks = bmesh.new(); coils = bmesh.new()
rng = random.Random(21)
for (x, y, n) in ((-49.5, 6.8, 4), (-28.0, 7.5, 3), (-9.5, 7.2, 5), (27.5, 6.0, 6), (31.5, 8.3, 3)):
    for k in range(n):
        crate(cr, (x + (k % 3) * 1.1 + rng.uniform(-0.1, 0.1), y + (k // 3) * 0.9, Z_QUAY + 0.06 + (0.75 if k == n - 1 and n > 3 else 0)),
              rng.uniform(0.8, 1.0), rng.uniform(-0.2, 0.2))
for (x, y) in ((-41, 7.2), (-40.2, 7.9), (-14.5, 8.0), (2.6, 7.0), (3.4, 7.6), (2.9, 8.3), (34.0, 4.0), (34.8, 4.6), (12.0, -36.5)):
    barrel(br, (x, y, Z_QUAY + 0.06 if y > 0 else DECK), rng.uniform(0.9, 1.05))
for (x, y, r) in ((-33.8, 5.5, 1.5), (-5.2, 6.5, 1.3), (20.5, 4.5, 1.2), (5.0, -40.5, 1.0), (-2.0, -12.0, 0.6)):
    z = Z_QUAY + 0.06 if y > 0 else DECK
    merge(nets, bm_ico(r, (x, y, z + 0.1), 2, (1.3, 1.0, 0.42), seed=int(x), amp=0.25))
    for k in range(6):
        a = rng.uniform(0, 6.28)
        merge(corks, bm_ico(0.17, (x + math.cos(a) * r * 1.0, y + math.sin(a) * r * 0.8, z + 0.35), 1, seed=k))
for (x, y, z) in ((-44.5, 1.8, Z_QUAY + 0.06), (-17.0, 2.0, Z_QUAY + 0.06), (11.6, -5.0, DECK), (-1.0, -38.8, DECK), (22.0, -38.8, DECK), (2.0, -25.6, DECK)):
    t = bm_cyl(0.5, 0.5, 0.18, 10, (x, y, z))
    merge(t, bm_cyl(0.32, 0.32, 0.2, 10, (x, y, z + 0.18)))
    merge(coils, t)
obj('props_crates', cr, PAL['timber'], PT['boards'], family='prop_crate', jitter=0.14, bevel=0.03)
obj('props_barrels', br, face=lambda q: ((PAL['timber_dark'] if (q.center.z % 0.45) < 0.08 else PAL['timber']), PT['boards']),
    family='prop_barrel', jitter=0.05)
obj('props_nets', nets, lin('#596B52'), PT['leaf'], family='prop_nets', jitter=0.1, smooth=True)
obj('props_corks', corks, face=lambda q: ((PAL['wall_ochre'] if q.index % 40 < 20 else PAL['brand_red']), 0), family='prop_nets')
obj('props_coils', coils, PAL['rope'], PT['plain'], family='prop_rope', jitter=0.05)
# hand crane
cx_, cy_ = 28.5, 1.8
cn = bmesh.new()
merge(cn, bm_box2(cx_ - 0.8, cy_ - 0.8, Z_QUAY, cx_ + 0.8, cy_ + 0.8, Z_QUAY + 0.6))
merge(cn, bm_cyl(0.28, 0.22, 5.5, 8, (cx_, cy_, Z_QUAY + 0.6)))
merge(cn, beam((cx_, cy_, Z_QUAY + 1.8), (cx_ - 1.0, cy_ - 5.0, Z_QUAY + 6.6), 0.3, 0.3))
merge(cn, beam((cx_, cy_, Z_QUAY + 6.1), (cx_ - 1.0, cy_ - 5.0, Z_QUAY + 6.6), 0.16, 0.16))
merge(cn, line3((cx_ - 1.0, cy_ - 5.0, Z_QUAY + 6.6), (cx_ - 1.0, cy_ - 5.0, Z_QUAY + 2.2), 0.03))
merge(cn, bm_box2(cx_ - 1.4, cy_ - 5.4, Z_QUAY + 1.4, cx_ - 0.6, cy_ - 4.6, Z_QUAY + 2.2))
obj('prop_crane', cn, face=lambda q: ((PAL['hull_red'] if q.center.z > Z_QUAY + 0.7 else PAL['iron']), PT['metal']), family='prop_crane')
# fish stall with a striped awning
sx_, sy_ = -24.0, 6.8
stl = bmesh.new()
merge(stl, bm_box2(sx_ - 2.0, sy_ - 0.6, Z_QUAY, sx_ + 2.0, sy_ + 0.6, Z_QUAY + 1.0))
for dx in (-1.9, 1.9):
    for dy in (-1.2, 0.5):
        merge(stl, bm_box2(sx_ + dx - 0.06, sy_ + dy - 0.06, Z_QUAY, sx_ + dx + 0.06, sy_ + dy + 0.06, Z_QUAY + 2.6))
obj('prop_stall', stl, PAL['timber'], PT['boards'], family='prop_stall')
aw = bmesh.new()
for k in range(8):
    x0 = sx_ - 2.2 + k * 0.55
    b = bm_box2(x0, sy_ - 1.6, -0.03, x0 + 0.55, sy_ + 0.7, 0.03)
    xf(b, loc=(0, 0, 0))
    for v in b.verts:
        v.co.z += Z_QUAY + 2.6 + (v.co.y - (sy_ + 0.7)) * -0.35
    merge(aw, b)
obj('prop_awning', aw, face=lambda q: ((PAL['hull_red'] if int((q.center.x - (sx_ - 2.2)) / 0.55) % 2 == 0 else PAL['trim']), 0), family='prop_stall')
fishb = bmesh.new()
for k in range(6):
    merge(fishb, bm_box2(sx_ - 1.8 + k * 0.62, sy_ - 0.5, Z_QUAY + 1.0, sx_ - 1.25 + k * 0.62, sy_ + 0.5, Z_QUAY + 1.25))
obj('prop_fishboxes', fishb, face=lambda q: ((PAL['brand_usdc'] if int(q.center.x * 10) % 3 else PAL['wall_white']), 0), family='prop_stall')

# ------------------------------------------------------------------ TOWN
set_coll(collection('town', ROOTC))
HOUSES = [
    ('h01', -47.5, 14.5, Z_QUAY, dict(w=7.0, d=9.0, floors=2, wall=PAL['wall_falu'], wall_pat='boards', roof=PAL['roof_red'], roof_style='tiles', ridge='y', pitch=47, flowers=True)),
    ('h02', -39.2, 14.5, Z_QUAY, dict(w=7.2, d=9.4, floors=3, fh=2.6, wall=PAL['wall_ochre'], wall_pat='boards', roof=PAL['roof_slate'], roof_style='slate', ridge='y', pitch=50, shutters=True, shutter_col=PAL['door_blue'])),
    ('h03', -28.2, 14.5, Z_QUAY, dict(w=7.6, d=9.0, floors=2, wall=PAL['wall_white'], wall_pat='render', roof=PAL['roof_red'], roof_style='tiles', ridge='y', pitch=45, flowers=True, door_col=PAL['door_red'])),
    ('h04', -19.2, 14.5, Z_QUAY, dict(w=8.0, d=9.4, floors=2, wall=PAL['wall_blue'], wall_pat='boards', roof=PAL['roof_tar'], roof_style='tar', ridge='y', pitch=42, door_col=PAL['door_red'])),
    ('h05', -10.5, 14.5, Z_QUAY, dict(w=7.0, d=9.0, floors=3, fh=2.55, wall=PAL['wall_mustard'], wall_pat='boards', roof=PAL['roof_red'], roof_style='tiles', ridge='y', pitch=48, flowers=True)),
    ('h06', 0.4, 14.5, Z_QUAY, dict(w=7.6, d=9.4, floors=2, wall=PAL['wall_white'], wall_pat='boards', roof=PAL['roof_slate'], roof_style='slate', ridge='y', pitch=46, shutters=True, shutter_col=PAL['door_green'])),
    ('h07', 11.6, 15.0, Z_QUAY, dict(w=12.0, d=8.6, floors=2, fh=3.0, wall=PAL['wall_falu'], wall_pat='boards', roof=PAL['roof_tar'], roof_style='tar', ridge='x', pitch=38, win_pitch=3.0, door_col=PAL['door_green'])),
    ('h08', 24.5, 14.5, Z_QUAY, dict(w=7.0, d=8.4, floors=2, wall=PAL['wall_salmon'], wall_pat='render', roof=PAL['roof_red'], roof_style='tiles', ridge='y', pitch=46, flowers=True)),
    ('h09', -49.0, 31.0, Z_T1, dict(w=9.0, d=6.8, floors=1, fh=3.0, wall=PAL['wall_white'], wall_pat='render', roof=PAL['turf'], roof_style='turf', ridge='x', pitch=32, flowers=True)),
    ('h10', -33.5, 31.0, Z_T1, dict(w=8.0, d=8.2, floors=2, wall=PAL['wall_sage'], wall_pat='boards', roof=PAL['roof_red'], roof_style='tiles', ridge='x', pitch=45)),
    ('h11', -17.0, 31.0, Z_T1, dict(w=8.4, d=8.0, floors=2, wall=PAL['wall_salmon'], wall_pat='render', roof=PAL['roof_slate'], roof_style='slate', ridge='y', pitch=47, flowers=True)),
    ('h12', 1.0, 31.0, Z_T1, dict(w=9.0, d=8.0, floors=2, wall=PAL['wall_mint'], wall_pat='boards', roof=PAL['roof_ochre'], roof_style='tiles', ridge='x', pitch=43, shutters=True, shutter_col=PAL['wall_white'])),
    ('h13', -33.0, 47.0, Z_T2, dict(w=9.0, d=7.0, floors=2, wall=PAL['wall_falu'], wall_pat='boards', roof=PAL['roof_red'], roof_style='tiles', ridge='x', pitch=45)),
    ('h14', -11.0, 47.0, Z_T2, dict(w=8.0, d=7.0, floors=1, fh=3.0, wall=PAL['wall_ochre'], wall_pat='boards', roof=PAL['turf'], roof_style='turf', ridge='x', pitch=30)),
]
for i, (nm, x, y, z, P_) in enumerate(HOUSES):
    P_.setdefault('door', '-y'); P_.setdefault('win_faces', ['-y', '-x'])
    build_house(nm, P_, (x, y, z), 0.0, seed=100 + i)

EXCL = []    # (x0, y0, x1, y1) no-scatter rectangles
for (nm, x, y, z, P_) in HOUSES:
    EXCL.append((x - P_['w'] / 2 - 1.3, y - P_['d'] / 2 - 2.0, x + P_['w'] / 2 + 1.3, y + P_['d'] / 2 + 1.3))
EXCL += [(47, 11, 69, 27), (LH_POS[0] - 7, LH_POS[1] - 8, LH_POS[0] + 7, LH_POS[1] + 7), (74, 5, 83, 13), (QX0, -1, QX1, 11),
         (34, 4, 46, 27)]

# stairs: through the waterfront lanes up the T1 wall, and up the T2 wall
steps = bmesh.new()
for x0 in (-33.8, -5.2, 19.5):
    n = 12
    for k in range(n):
        z = Z_QUAY + (k + 1) * (Z_T1 - Z_QUAY) / n
        y = 15.5 + k * 0.5
        merge(steps, bm_box2(x0 - 1.3, y, Z_QUAY - 0.5, x0 + 1.3, y + 0.52, z))
    EXCL.append((x0 - 1.6, 15, x0 + 1.6, 23))
for x0 in (-24.5, 6.0):
    n = 11
    for k in range(n):
        z = Z_T1 + (k + 1) * (Z_T2 - Z_T1) / n
        y = 35.0 + k * 0.5
        merge(steps, bm_box2(x0 - 1.2, y, Z_T1 - 0.5, x0 + 1.2, y + 0.52, z))
    EXCL.append((x0 - 1.5, 34.5, x0 + 1.5, 41.5))
obj('town_stairs', steps, PAL['granite_light'], PT['ashlar'], family='town', bevel=0.03)
lanes = bmesh.new()
for (a, b, z, w) in (((-60, 24.5), (29, 24.5), Z_T1, 3.0), ((-46, 43.3), (14, 43.3), Z_T2, 2.6), ((-60, 19.8), (28, 19.8), Z_QUAY, 2.6),
                     ((-33.8, 9), (-33.8, 16), Z_QUAY, 3.2), ((-5.2, 9), (-5.2, 16), Z_QUAY, 3.2), ((19.5, 9), (19.5, 16), Z_QUAY, 3.0),
                     ((-24.5, 24.5), (-24.5, 35), Z_T1, 2.2), ((6.0, 24.5), (6.0, 35), Z_T1, 2.2), ((44, 23), (60, 23), Z_HEAD, 0.1)):
    merge(lanes, beam((a[0], a[1], z + 0.03), (b[0], b[1], z + 0.03), w, 0.22))
    EXCL.append((min(a[0], b[0]) - w / 2, min(a[1], b[1]) - w / 2, max(a[0], b[0]) + w / 2, max(a[1], b[1]) + w / 2))
obj('town_lanes', lanes, PAL['gravel'], PT['cobble'], family='town', jitter=0.03)

fence = bmesh.new(); walls = bmesh.new(); racks = bmesh.new(); fish = bmesh.new(); logs = bmesh.new()
laund = bmesh.new(); cloth = bmesh.new(); beds = bmesh.new(); bench = bmesh.new()


def picket(a, b, z, h=1.0):
    a, b = Vector(a), Vector(b); d = b - a; n = int(d.length / 0.4)
    for k in range(n + 1):
        p = a + d * (k / max(1, n))
        merge(fence, bm_box(0.1, 0.1, h, (p.x, p.y, z + h / 2)))
    for zz in (z + h * 0.35, z + h * 0.75):
        merge(fence, beam((a.x, a.y, zz), (b.x, b.y, zz), 0.06, 0.1))


# front gardens on T1 (between the lane and row B), back gardens on T2
for (nm, x, y, z, P_) in HOUSES[8:12]:
    x0, x1 = x - P_['w'] / 2 - 0.6, x + P_['w'] / 2 + 0.6
    picket((x0, 26.3), (x1, 26.3), z)
    picket((x0, 26.3), (x0, y - P_['d'] / 2), z)
    # vegetable / flower beds
    for k in range(3):
        bx = x0 + 0.8 + k * (x1 - x0 - 1.6) / 2.5
        merge(beds, bm_box2(bx, 26.9, z, bx + 1.6, y - P_['d'] / 2 - 0.6, z + 0.25))
for (a, b, z) in (((-40, 51.5), (-26, 51.5), Z_T2), ((-17, 51.5), (-4, 51.5), Z_T2), ((-60, 17), (-52, 17), Z_QUAY)):
    picket(a, b, z)
for (a, b, z) in (((-60, 40), (-52, 46), Z_T1), ((22, 40), (27, 30), Z_T1), ((-50, 56), (-40, 58), Z_T2), ((10, 48), (16, 55), Z_T2)):
    merge(walls, beam((a[0], a[1], z + 0.45), (b[0], b[1], z + 0.45), 0.7, 1.0))
# woodpiles against side walls
for (nm, x, y, z, P_) in (HOUSES[0], HOUSES[3], HOUSES[9], HOUSES[12]):
    xw = x - P_['w'] / 2 - 0.55
    merge(logs, bm_box2(xw - 0.45, y - 2.0, z, xw + 0.45, y + 1.5, z + 1.4))
    merge(logs, bm_box2(xw - 0.6, y - 2.2, z + 1.4, xw + 0.6, y + 1.7, z + 1.55))
# laundry lines
for (a, b, z) in (((-58, 27.5), (-52, 28.5), Z_T1), ((-14, 50.5), (-6, 51.0), Z_T2), ((53, 26.8), (60, 26.8), Z_HEAD)):
    a3 = Vector((a[0], a[1], z)); b3 = Vector((b[0], b[1], z))
    merge(laund, line3(a3, a3 + Vector((0, 0, 2.3)), 0.06)); merge(laund, line3(b3, b3 + Vector((0, 0, 2.3)), 0.06))
    merge(laund, line3(a3 + Vector((0, 0, 2.2)), b3 + Vector((0, 0, 2.2)), 0.02))
    d = (b3 - a3)
    for k in range(4):
        c = a3 + d * (0.15 + k * 0.22) + Vector((0, 0, 1.55))
        t = d.normalized()
        merge(cloth, obox(c, t, rng.uniform(0.5, 0.9), 0.04, rng.uniform(0.6, 1.0)))
# benches
for (x, y, z) in ((-12.0, 3.5, Z_QUAY), (38.5, 3.0, Z_QUAY), (56.0, 3.0, Z_HEAD), (-20.0, 27.0, Z_T1)):
    merge(bench, bm_box2(x - 0.9, y - 0.25, z + 0.45, x + 0.9, y + 0.25, z + 0.55))
    merge(bench, bm_box2(x - 0.9, y + 0.2, z + 0.55, x + 0.9, y + 0.28, z + 1.0))
    for dx in (-0.75, 0.75):
        merge(bench, bm_box2(x + dx - 0.05, y - 0.2, z, x + dx + 0.05, y + 0.2, z + 0.45))
# hjell drying racks on the west slope
for (x, y, z) in ((-62.0, 27.0, Z_QUAY), (-58.0, 37.0, Z_T1)):
    L_ = 7.0
    for k in range(3):
        yy = y + k * L_ / 2
        for s in (-1, 1):
            merge(racks, beam((x, yy, z), (x + s * 0.9, yy, z + 2.6), 0.14, 0.14))
    merge(racks, beam((x, y, z + 2.45), (x, y + L_, z + 2.45), 0.14, 0.14))
    for s in (-0.5, 0.5):
        merge(racks, beam((x + s, y, z + 1.6), (x + s, y + L_, z + 1.6), 0.1, 0.1))
    for k in range(18):
        yy = y + 0.2 + k * (L_ - 0.4) / 17
        for xx, zz in ((x - 0.5, z + 1.6), (x + 0.5, z + 1.6), (x, z + 2.45)):
            merge(fish, bm_box(0.14, 0.12, 0.7, (xx, yy, zz - 0.4)))
    EXCL.append((x - 1.5, y - 0.5, x + 1.5, y + L_ + 0.5))
obj('town_fences', fence, PAL['trim'], PT['plain'], family='prop_fence')
obj('town_walls', walls, PAL['granite'], PT['ashlar'], family='prop_wall', bevel=0.05)
obj('town_racks', racks, PAL['timber_grey'], PT['plain'], family='prop_rack')
obj('town_stockfish', fish, lin('#B8A07A'), PT['plain'], family='prop_rack', jitter=0.15)
obj('town_woodpiles', logs, lin('#9C7A55'), PT['boards'], family='prop_wood', jitter=0.06)
obj('town_laundry_lines', laund, PAL['timber_dark'], PT['plain'], family='prop_laundry')
obj('town_laundry', cloth, face=lambda q: (random.Random(q.index // 6).choice((PAL['trim'], PAL['brand_usdc'], PAL['hull_red'], PAL['wall_ochre'], PAL['trim'])), 0), family='prop_laundry')
obj('town_beds', beds, lin('#6B5038'), PT['plain'], family='prop_garden', jitter=0.05)
obj('town_benches', bench, PAL['timber'], PT['boards'], family='prop_bench')
# garden plants on the beds
gp = bmesh.new()
for (nm, x, y, z, P_) in HOUSES[8:12]:
    x0, x1 = x - P_['w'] / 2 - 0.6, x + P_['w'] / 2 + 0.6
    for k in range(3):
        bx = x0 + 0.8 + k * (x1 - x0 - 1.6) / 2.5
        for j in range(4):
            merge(gp, bm_ico(0.3, (bx + 0.4 + (j % 2) * 0.8, 27.4 + (j // 2) * 0.9, z + 0.4), 1, (1, 1, 0.8), seed=j + k * 4))
obj('town_garden_plants', gp, face=lambda q: (random.Random(q.index // 20).choice((PAL['grass_light'], PAL['spruce_light'], PAL['flower_y'], PAL['flower_p'])), PT['leaf']),
    family='prop_garden', jitter=0.1)

# slipway + dinghies at the west end
sw = bmesh.new()
merge(sw, beam((QX0 - 3.2, -6.0, -1.4), (QX0 - 3.2, 8.0, Z_QUAY + 0.05), 5.5, 0.6))
obj('slipway', sw, PAL['timber_dark'], PT['planks_y'], family='quay')
COAST.append([(QX0 - 6.0, -6.0), (QX0 - 0.4, -6.0), (QX0 - 0.4, 0.5), (QX0 - 6.0, 0.5)])
dinghy('dinghy_a', (QX0 - 3.2, 2.5, 0.25), math.radians(88), 4.2, PAL['hull_green'])
dinghy('dinghy_b', (QX0 - 7.5, 9.0, Z_QUAY + 0.55), math.radians(12), 3.8, PAL['hull_red'], upturned=True)
dinghy('dinghy_c', (-30.0, -2.6, 0.0), math.radians(178), 4.0, PAL['hull_blue'])
CONTACT.append([(-32, -3.3), (-28, -3.3), (-28, -1.9), (-32, -1.9)])

# ------------------------------------------------------------------ VEGETATION + GROUND DRESSING (the anti-empty-lawn pass)
set_coll(collection('vegetation', ROOTC))
leafS, trunkS, leafB, trunkB = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
rng = random.Random(77)


def free_at(x, y, pad=0.0):
    for (x0, y0, x1, y1) in EXCL:
        if x0 - pad <= x <= x1 + pad and y0 - pad <= y <= y1 + pad:
            return False
    return point_in_poly(x, y, ISLAND)


SPRUCE_PTS, BIRCH_PTS = [], []
# a dark spruce crest along the back of the hill (silhouette against the sky band)
for k in range(46):
    t = k / 45
    x = -58 + t * 92 + rng.uniform(-2, 2)
    y = 55 + 10 * math.sin(t * 3.1) + rng.uniform(-4, 6)
    if point_in_poly(x, y, ISLAND) and free_at(x, y):
        SPRUCE_PTS.append((x, y))
SPRUCE_PTS += [(-62, 44), (-60, 52), (28, 40), (30, 34), (80, 24), (84, 14), (74, 22), (86, 2), (-64, 16), (-50, 21.5 - 0.0)]
BIRCH_PTS = [(-56, 26), (-26, 27.5), (-8, 27.8), (12, 27.5), (-44, 52), (-20, 52), (8, 50), (-54, 42), (-4, 38), (-28, 38),
             (32, 22), (46, 13), (-62, 6), (20, 44), (52, 2), (84, -8), (-42, 39), (16, 38)]
for (x, y) in SPRUCE_PTS:
    z = ground_z(x, y)
    if z > -5:
        spruce(leafS, trunkS, (x, y, z), rng.uniform(6.5, 10.5), rng)
for (x, y) in BIRCH_PTS:
    z = ground_z(x, y)
    if z > -5:
        birch(leafB, trunkB, (x, y, z), rng.uniform(5.5, 8.0), rng)
obj('trees_spruce', leafS, face=lambda q: ((PAL['spruce_light'] if q.normal.z > 0.35 else PAL['spruce']), PT['leaf']),
    family='tree_spruce', jitter=0.1, seed=3)
obj('trees_spruce_trunk', trunkS, PAL['timber_dark'], PT['plain'], family='tree_spruce')
obj('trees_birch', leafB, face=lambda q: ((PAL['birch_leaf2'] if noise.noise(q.center * 0.15) > 0.15 else PAL['birch_leaf']), PT['leaf']),
    family='tree_birch', jitter=0.08, seed=5)
obj('trees_birch_trunk', trunkB, PAL['birch_bark'], PT['plain'], family='tree_birch')

tuft = bmesh.new(); fl = bmesh.new(); bo = bmesh.new(); he = bmesh.new(); sh = bmesh.new(); lich = bmesh.new()
mound = bmesh.new()
placed = 0
# low grass mounds: relief so lawns catch the low sun
for k in range(400):
    x = rng.uniform(-66, 90); y = rng.uniform(-28, 66)
    if not free_at(x, y, 2.5):
        continue
    z = ground_z(x, y)
    if z < 0:
        continue
    r = rng.uniform(2.5, 5.5)
    ok = all(free_at(x + dx, y + dy) and ground_z(x + dx, y + dy) == z for dx, dy in ((r, 0), (-r, 0), (0, r), (0, -r)))
    if not ok:
        continue
    merge(mound, bm_ico(r, (x, y, z - r * 0.13), 2, (1.25, 1.0, 0.24), seed=k, amp=0.2))
    placed += 1
    if placed > 34:
        break


def sprinkle(cx, cy, kind, rng):
    global placed
    n = {'meadow': 9, 'rocky': 5, 'heather': 7, 'bush': 3, 'flowers': 6}[kind]
    spread = {'meadow': 3.2, 'rocky': 2.4, 'heather': 3.0, 'bush': 2.0, 'flowers': 2.2}[kind]
    for j in range(n):
        x = cx + rng.gauss(0, spread); y = cy + rng.gauss(0, spread)
        if not free_at(x, y):
            continue
        z = ground_z(x, y)
        if z < 0:
            continue
        placed += 1
        if kind == 'meadow' or (kind == 'rocky' and j % 2):
            for q in range(3):
                a = rng.uniform(0, 6.28); h = rng.uniform(0.45, 0.9)
                merge(tuft, bm_cyl(0.12, 0.0, h, 3, (x + math.cos(a) * 0.18, y + math.sin(a) * 0.18, z), rot=a))
        if kind in ('flowers', 'meadow') and rng.random() < 0.6:
            for q in range(4):
                merge(fl, bm_cyl(0.13, 0.0, 0.3, 4, (x + rng.uniform(-0.6, 0.6), y + rng.uniform(-0.6, 0.6), z + 0.05), rot=rng.random()))
        if kind == 'heather':
            merge(he, bm_ico(rng.uniform(0.5, 1.0), (x, y, z + 0.1), 1, (1.4, 1.0, 0.5), seed=j + int(cx * 13), amp=0.3))
        if kind == 'bush':
            merge(sh, bm_ico(rng.uniform(0.6, 1.1), (x, y, z + 0.35), 1, (1.2, 1.0, 0.85), seed=j + int(cy * 7), amp=0.3))
        if kind == 'rocky' and j % 2 == 0:
            rr = rng.uniform(0.5, 1.5)
            merge(bo, bm_ico(rr, (x, y, z + 0.1), 1, (1.25, 1.0, 0.7), seed=j + int(cx * 31), amp=0.35))
            if rng.random() < 0.6:
                merge(lich, bm_ico(rr * 0.5, (x + rr * 0.1, y, z + 0.1 + rr * 0.55), 1, (1.3, 1.0, 0.25), seed=j + 1))


ncl = 0
for k in range(3000):
    x = rng.uniform(-66, 90); y = rng.uniform(-28, 68)
    if not free_at(x, y):
        continue
    if ground_z(x, y) < 0:
        continue
    on_head = point_in_poly(x, y, HEADLAND)
    r = rng.random()
    if on_head:
        kind = 'heather' if r < 0.4 else ('rocky' if r < 0.75 else 'meadow')
    else:
        kind = 'meadow' if r < 0.35 else ('flowers' if r < 0.55 else ('bush' if r < 0.72 else ('rocky' if r < 0.88 else 'heather')))
    sprinkle(x, y, kind, rng)
    ncl += 1
    if ncl >= 175:
        break
print('dressing placed', placed, 'clusters', ncl)
obj('land_mounds', mound, face=lambda q: ((PAL['grass_light'] if q.normal.z > 0.8 else PAL['grass']), PT['grass']), family='terrain', jitter=0.02, smooth=True)
obj('veg_tufts', tuft, face=lambda q: ((PAL['grass_light'] if q.index % 3 == 0 else PAL['grass_dark']), PT['leaf']), family='veg', jitter=0.1)
obj('veg_flowers', fl, face=lambda q: ((PAL['flower_y'], PAL['flower_w'], PAL['flower_p'], PAL['rowan_berry'])[(q.index // 25) % 4], 0), family='veg')
obj('veg_heather', he, face=lambda q: ((PAL['heather'] if q.normal.z > 0.3 else lin('#5E4A5C')), PT['leaf']), family='veg', jitter=0.1)
obj('veg_shrubs', sh, face=lambda q: ((PAL['spruce_light'] if q.normal.z > 0.3 else PAL['grass_dark']), PT['leaf']), family='veg', jitter=0.08)
obj('land_boulders', bo, face=lambda q: ((PAL['rock_light'] if q.normal.z > 0.5 else PAL['rock']), PT['rock']), family='rock', jitter=0.08)
obj('land_lichen', lich, PAL['lichen'], PT['rock'], family='rock', jitter=0.1)
# shore boulders at the waterline
sb = bmesh.new()
for i in range(0, len(ISLAND)):
    x, y = ISLAND[i]
    if in_quay(x, y) or (QX0 - 7 < x < QX1 + 1 and y < 2):
        continue
    if rng.random() < 0.6:
        r = rng.uniform(0.9, 2.3)
        p0 = Vector(ISLAND[i - 1]); p2 = Vector(ISLAND[(i + 1) % len(ISLAND)])
        tng = (p2 - p0).normalized(); nr = Vector((tng.y, -tng.x))
        c = Vector((x, y)) + nr * rng.uniform(0.5, 2.2)
        merge(sb, bm_ico(r, (c.x, c.y, rng.uniform(-0.6, 0.3)), 1, (1.25, 1.0, 0.7), seed=i, amp=0.3))
        CIRCLES.append((c.x, c.y, r * 1.05))
for (x, y, r) in ((-74, -34, 3.0), (-70, -38, 1.8), (-79, -30, 1.6), (96, -10, 2.0), (62, -36, 2.0), (92, -22, 2.4)):
    merge(sb, bm_ico(r, (x, y, -0.3), 1, (1.3, 1.0, 0.75), seed=int(x * y), amp=0.3))
    CIRCLES.append((x, y, r * 1.15))
obj('shore_boulders', sb, face=lambda q: ((PAL['rock_wet'] if q.center.z < 0.4 else (PAL['rock_light'] if q.normal.z > 0.55 else PAL['rock'])), PT['rock']),
    family='rock', jitter=0.07)
SK = smooth_closed([(-82, -42), (-73, -46), (-65, -42), (-66, -35), (-75, -32)], 2)
if poly_area(SK) < 0:
    SK.reverse()
rock_wall('skerry', SK, SEA_FLOOR, 2.2, rows=3, amp=1.0, seed=9, top_color=PAL['rock_light'], top_pattern=PT['rock'], lip=False, jag=1.0)
COAST.append(SK)
cairn = bmesh.new()
for k in range(4):
    merge(cairn, bm_ico(0.9 - k * 0.18, (-73.5, -39.0, 2.2 + k * 0.55), 1, (1.2, 1.0, 0.6), seed=k + 50, amp=0.2))
obj('skerry_cairn', cairn, PAL['rock_light'], PT['rock'], family='rock')
