"""The Harbour v2 - town: terraced houses (style C base + the fixes: dormers, porches, gutters, finials, shop signs,
awnings, window variety), the bonded warehouse, hamlet sheds + net lofts, the storm mast, the tide gauge, the windmill.
P6: the civic buildings (Customs House, Mint, Burn, Shipyard, Registry, ...) are separate models on layout.civic plots.
exec'd into build_island's namespace."""

set_coll(collection('town', ROOTC))
TRNG = random.Random(2026)
WINDOW_GROUPS = []        # (building name, [world points of lit windows]) -> layout lights
WIN_SPILL = []            # key-art window spill lights (in front of facades)
NAMED = {}                # runtime-addressable nodes (tide_board, storm_mast, tide_gauge, ...)

WALLS = ['wall_white', 'wall_falu', 'wall_ochre', 'wall_blue', 'wall_mint', 'wall_mustard', 'wall_salmon', 'wall_sage']
DOORS = ['door_green', 'door_blue', 'door_red']
SIGN_COLS = ['door_green', 'door_blue', 'door_red', 'wall_ochre', 'hull_blue']


def lot_world(lot):
    return Vector((lot['c'][0], lot['c'][1], lot['z']))


def collect_windows(root, name):
    """World positions of lit window panes (Col.R > 0) of a building -> one light group."""
    pts = []
    for ob in descendants(root):
        if ob.type != 'MESH' or not ob.data.materials or ob.data.materials[0] != M['window']:
            continue
        me = ob.data
        attr = me.color_attributes.get('Col')
        if attr is None:
            continue
        mw = ob.matrix_world
        buf = np.zeros(len(me.loops) * 4, np.float32); attr.data.foreach_get('color', buf); buf = buf.reshape(-1, 4)
        for poly in me.polygons:
            if buf[poly.loop_indices[0], 0] > 0.3 and abs(poly.normal.z) < 0.3:
                pts.append(mw @ poly.center)
    if pts:
        WINDOW_GROUPS.append((name, pts))
    return pts


def eave_gutters(bm, w, d, H, ridge, ov=0.35, gov=0.3):
    """Gutters along both eaves + downpipes at the front corners."""
    if ridge == 'x':
        for s in (-1, 1):
            y = s * (d / 2 + ov - 0.05)
            merge(bm, bm_box2(-w / 2 - gov, y - 0.11, H - ov * 0.9 - 0.06, w / 2 + gov, y + 0.11, H - ov * 0.9 + 0.12))
        for sx in (-1, 1):
            merge(bm, bm_box2(sx * (w / 2 - 0.25) - 0.07, -d / 2 - 0.3, 0.3, sx * (w / 2 - 0.25) + 0.07, -d / 2 - 0.16, H - ov * 0.9))
    else:
        for s in (-1, 1):
            x = s * (w / 2 + ov - 0.05)
            merge(bm, bm_box2(x - 0.11, -d / 2 - gov, H - ov * 0.9 - 0.06, x + 0.11, d / 2 + gov, H - ov * 0.9 + 0.12))
        for sx in (-1, 1):
            merge(bm, bm_box2(sx * (w / 2 + 0.12) - 0.07, -d / 2 + 0.2, 0.3, sx * (w / 2 + 0.12) + 0.07, -d / 2 + 0.34, H - ov * 0.9))


def house2(name, lot, rng, extra=None):
    """A town house: C's build_house + dormers, porch hood, gutters, finials, shop sign, awning."""
    style = lot['style']
    w, d = lot['w'], lot['d']
    sides = [f for f, s in (('-x', -1), ('+x', 1)) if not lot.get('nb_' + ('w' if s < 0 else 'e'))]
    P = dict(w=w, d=d, base=0.7, door='-y', win_faces=['-y'] + sides, chimney=rng.random() < 0.85, chim_side=rng.choice((-1, 1)))
    if style == 'terrace':
        floors = rng.choice((2, 2, 3, 3)) if w < 9.2 else rng.choice((2, 3))
        ridge = 'y' if rng.random() < 0.55 else 'x'
        P.update(floors=floors, fh=rng.uniform(2.55, 2.85), ridge=ridge, pitch=rng.uniform(42, 52) if ridge == 'y' else rng.uniform(36, 44),
                 wall=PAL[rng.choice(WALLS)], wall_pat=rng.choice(('boards', 'boards', 'render')),
                 roof_style=rng.choice(('tiles', 'tiles', 'slate', 'tar')), flowers=rng.random() < 0.6,
                 shutters=rng.random() < 0.35, shutter_col=PAL[rng.choice(DOORS)], door_col=PAL[rng.choice(DOORS)],
                 ww=rng.choice((0.75, 0.8, 0.9)), wh=rng.choice((1.05, 1.15, 1.3)), win_pitch=rng.uniform(1.9, 2.4))
    elif style == 'cottage':
        ridge = 'x'
        turf = rng.random() < 0.35
        P.update(floors=1, fh=3.0, ridge=ridge, pitch=rng.uniform(34, 44), wall=PAL[(extra or {}).get('wall', rng.choice(WALLS))],
                 wall_pat=rng.choice(('boards', 'render')), roof_style='turf' if turf else rng.choice(('tiles', 'slate')),
                 flowers=True, door_col=PAL[rng.choice(DOORS)], win_pitch=2.3)
    elif style == 'hamlet':
        ridge = rng.choice(('x', 'y'))
        P.update(floors=rng.choice((1, 1, 2)), fh=2.7, ridge=ridge, pitch=rng.uniform(38, 48), wall=PAL[extra.get('wall', rng.choice(WALLS))] if extra else PAL[rng.choice(WALLS)],
                 wall_pat='boards', roof_style=rng.choice(('tar', 'tiles', 'turf')), flowers=rng.random() < 0.4,
                 door_col=PAL[rng.choice(DOORS)], win_pitch=2.2, chimney=rng.random() < 0.5)
    elif style == 'loft':
        ridge = 'y'
        P.update(floors=2, fh=2.9, ridge=ridge, pitch=50, wall=PAL[(extra or {}).get('wall', 'wall_falu')], wall_pat='boards',
                 roof_style='tar', flowers=False, door_col=PAL['tar'], win_pitch=3.0, chimney=False)
    elif style == 'farmhouse':
        ridge = 'x'
        P.update(floors=rng.choice((1, 2)), fh=2.8, ridge=ridge, pitch=rng.uniform(38, 46), wall=PAL[rng.choice(('wall_falu', 'wall_white', 'wall_ochre'))],
                 wall_pat='boards', roof_style=rng.choice(('turf', 'tiles', 'slate')), flowers=True, door_col=PAL[rng.choice(DOORS)], win_pitch=2.4)
    elif style == 'barn':
        ridge = 'x'
        P.update(floors=1, fh=4.2, ridge=ridge, pitch=40, wall=PAL['wall_falu'], wall_pat='boards', roof_style='tar', flowers=False,
                 door_col=PAL['tar'], win_pitch=4.0, chimney=False, win_faces=['-y'])
    elif style == 'warehouse':
        ridge = 'y'
        P.update(w=w, d=d, floors=3, fh=3.1, ridge='y', pitch=50, wall=PAL[rng.choice(('wall_falu', 'wall_ochre', 'wall_falu', 'wall_white', 'wall_mustard'))],
                 wall_pat='boards', roof_style='tar', flowers=False, door_col=PAL['tar'], win_pitch=3.2, chimney=False,
                 win_faces=['-y', '+x', '-x'])
    elif style == 'boathouse':
        P.update(floors=1, fh=3.3, ridge='y', pitch=rng.uniform(44, 50), wall=PAL[(extra or {}).get('wall', 'wall_falu')], wall_pat='boards',
                 roof_style=rng.choice(('tar', 'tiles', 'turf')), flowers=False, door_col=PAL['tar'], win_pitch=3.0, chimney=False,
                 win_faces=['+x', '-x'], base=0.5)
    if 'roof' not in P:
        P['roof'] = {'tiles': PAL[rng.choice(('roof_red', 'roof_red', 'roof_ochre'))], 'slate': PAL['roof_slate'],
                     'tar': PAL['roof_tar'], 'turf': PAL['turf']}[P['roof_style']]
    face = lot.get('face', (0, -1))
    rz = math.atan2(-face[0], face[1]) + math.pi if tuple(face) != (0, -1) else 0.0
    if tuple(face) == (1, 0):
        rz = math.pi / 2
    if tuple(face) == (-1, 0):
        rz = -math.pi / 2
    root = build_house(name, P, (lot['c'][0], lot['c'][1], lot['z']), rz, seed=rng.randint(0, 10 ** 6), family='house')
    if style == 'boathouse':        # the big doors on the water gable + a timber run down onto the pebbles
        bd = bm_box2(-w * 0.33, -d / 2 - 0.12, P['base'] - 0.2, w * 0.33, -d / 2 + 0.05, P['base'] + 2.75)
        obj(name + '_boatdoor', bd, lin('#3B2E26'), PT['boards'], parent=root, family='house', jitter=0.05)
        fr_ = bm_box2(-w * 0.36, -d / 2 - 0.16, P['base'] + 2.75, w * 0.36, -d / 2 + 0.05, P['base'] + 3.0)
        for sx_ in (-1, 1):
            merge(fr_, bm_box2(sx_ * w * 0.36 - 0.12, -d / 2 - 0.16, P['base'] - 0.2, sx_ * w * 0.36 + 0.12, -d / 2 + 0.05, P['base'] + 2.75))
        obj(name + '_boatdoor_frame', fr_, PAL['trim'], PT['plain'], parent=root, family='house', jitter=0.0)
        rp_ = nl_kit.beam((0, -d / 2 + 0.2, P['base'] - 0.05), (0, -d / 2 - 5.5, -1.2), w * 0.5, 0.22)
        obj(name + '_ramp', rp_, PAL['timber_grey'], PT['boards'], parent=root, family='house', jitter=0.08)
    H = P['base'] + P['floors'] * P['fh']
    pitch = math.radians(P['pitch'])
    span = d if P['ridge'] == 'x' else w
    rise = span / 2 * math.tan(pitch)
    zr = H + rise
    det = bmesh.new(); dark = bmesh.new(); glass = bmesh.new(); gl = []; signs = bmesh.new(); aw = bmesh.new()
    eave_gutters(dark, w, d, H, P['ridge'])
    # ridge finials / cresting
    if P['ridge'] == 'y':
        for s in (-1, 1):
            merge(dark, bm_cyl(0.09, 0.0, 1.1, 5, (0, s * (d / 2 + 0.25), zr + 0.1)))
            merge(dark, bm_sphere(0.14, (0, s * (d / 2 + 0.25), zr + 0.3), 6, 4))
        if rng.random() < 0.6:     # round attic window in the front gable
            add_window(det, glass, Vector((0, -d / 2, H + rise * 0.45)), Vector((1, 0, 0)), Vector((0, -1, 0)), 0.55, 0.55,
                       mull=False, sill=False, rng=rng, lit_p=0.5, gl_list=gl)
    else:
        for s in (-1, 1):
            merge(dark, bm_cyl(0.08, 0.0, 0.9, 5, (s * (w / 2 + 0.25), 0, zr + 0.12)))
        # dormers on the front slope
        if P['floors'] >= 2 and rng.random() < 0.7 and w > 7.5:
            nd = 1 if w < 9.5 else 2
            for k in range(nd):
                x = (k + 0.5) / nd * w - w / 2
                dist = span / 2 * 0.55
                yb = -math.cos(pitch) * dist; zb = zr - math.sin(pitch) * dist
                bw_, bh_ = 1.7, 1.6
                bx = bm_box2(x - bw_ / 2, yb - 0.6, zb - 0.3, x + bw_ / 2, yb + 1.2, zb + bh_)
                merge(det, bx)
                rf = bmesh.new()
                vs = [rf.verts.new(v) for v in ((x - bw_ / 2 - 0.2, yb - 0.75, zb + bh_), (x + bw_ / 2 + 0.2, yb - 0.75, zb + bh_),
                                                 (x, yb - 0.75, zb + bh_ + 0.9), (x - bw_ / 2 - 0.2, yb + 1.3, zb + bh_),
                                                 (x + bw_ / 2 + 0.2, yb + 1.3, zb + bh_), (x, yb + 1.3, zb + bh_ + 0.9))]
                rf.faces.new((vs[0], vs[1], vs[2])); rf.faces.new((vs[3], vs[5], vs[4]))
                rf.faces.new((vs[0], vs[2], vs[5], vs[3])); rf.faces.new((vs[1], vs[4], vs[5], vs[2]))
                merge(dark if P['roof_style'] in ('slate', 'tar') else signs, rf)
                add_window(det, glass, Vector((x, yb - 0.62, zb + 0.65)), Vector((1, 0, 0)), Vector((0, -1, 0)), 0.75, 0.95,
                           mull=True, sill=False, rng=rng, lit_p=0.55, gl_list=gl)
    # porch hood over the door (terrace + cottage)
    if style in ('terrace', 'cottage', 'hamlet', 'farmhouse') and rng.random() < 0.75:
        nwin = max(1, int((w - 0.6) / (P.get('win_pitch', 2.2))))
        xs = [(i + 0.5) / nwin * w - w / 2 for i in range(nwin)]
        xd = xs[nwin // 2]
        zt = P['base'] + 2.15 + 0.5
        hood = bmesh.new()
        vs = [hood.verts.new(v) for v in ((xd - 0.95, -d / 2, zt + 0.55), (xd + 0.95, -d / 2, zt + 0.55), (xd + 0.95, -d / 2 - 1.1, zt),
                                           (xd - 0.95, -d / 2 - 1.1, zt))]
        hood.faces.new(vs)
        bmesh.ops.solidify(hood, geom=hood.faces[:], thickness=0.12)
        merge(signs, hood)
        for s in (-1, 1):
            merge(dark, nl_kit.beam((xd + s * 0.8, -d / 2, zt - 0.6), (xd + s * 0.8, -d / 2 - 0.95, zt + 0.02), 0.08, 0.08))
    # shop sign + striped awning (quay front row)
    if lot.get('shop'):
        sc = PAL[rng.choice(SIGN_COLS)]
        zs = P['base'] + P['fh'] + 0.35
        xs_ = rng.choice((-1, 1)) * (w / 2 - 0.5)
        merge(dark, nl_kit.beam((xs_, -d / 2, zs + 0.6), (xs_, -d / 2 - 1.2, zs + 0.6), 0.07, 0.07))
        sb = bm_box2(xs_ - 0.04, -d / 2 - 1.15, zs - 0.35, xs_ + 0.04, -d / 2 - 0.35, zs + 0.5)
        obj(name + '_sign', sb, sc, PT['plain'], parent=root, family='house', jitter=0.0)
        if rng.random() < 0.8:
            stripe = PAL[rng.choice(('hull_red', 'door_green', 'hull_blue', 'wall_ochre'))]
            n_ = max(3, int(w / 0.7))
            for k in range(n_):
                x0 = -w / 2 + 0.3 + k * (w - 0.6) / n_
                b = bm_box2(x0, -d / 2 - 1.5, -0.03, x0 + (w - 0.6) / n_, -d / 2, 0.03)
                for v in b.verts:
                    v.co.z += P['base'] + 2.75 + (v.co.y + d / 2) * 0.42
                merge(aw, b)
            obj(name + '_awning', aw, face=lambda q, s_=stripe, x00=-w / 2 + 0.3, ww_=(w - 0.6) / n_: (
                (s_ if int((q.center.x - x00) / ww_) % 2 == 0 else PAL['trim']), PT['plain']), parent=root, family='house', jitter=0.0)
        else:
            aw.free()
    else:
        aw.free()
    obj(name + '_details', det, P.get('trim', PAL['trim']), PT['plain'], parent=root, family='house', jitter=0.0)
    obj(name + '_ironwork', dark, PAL['tar'], PT['metal'], parent=root, family='house', jitter=0.0)
    if len(signs.faces):
        obj(name + '_hoods', signs, P['roof'], PT['tiles'] if P['roof_style'] == 'tiles' else PT['plain'], parent=root, family='house')
    else:
        signs.free()
    if gl:
        glass_obj(name + '_glass2', glass, gl, root, 'house')
    else:
        glass.free()
    if 'chimney_top' in root:      # world position without relying on a depsgraph update
        CHIMNEYS.append(Matrix.Translation(root.location) @ Matrix.Rotation(root.rotation_euler.z, 4, 'Z') @ Vector(root['chimney_top']))
    return root


# =================================================================== P2 pilot: classical town houses (A + C)
# The terrace lots in front of the civic quarter (classical-town PLAN §4.4, P2): stucco town houses of 2-3 storeys under
# low tiled hips or gables (or a roof terrace with a pergola, ~1 in 4), a painted band >= 1.3 m under the eave, board
# shutters on plain deep-set windows, a kitchen flue (chimney_top); quay-front shops open as arched tabernae with a
# counter and a linen velarium on free poles. The other lots keep their Nordic house until P4.
import nl_classical as cl
CV, CP = cl.cv, cl.cv.PAL
CLASSICAL_NEAR = ('customs', 'mint', 'registry', 'harbour-office-ethereum')
CLASSICAL_R = 65.0
WASHES = ['wash_white', 'wash_cream', 'wash_ochre', 'wash_sienna', 'wash_rose', 'wash_cream', 'wash_white', 'wash_blue']
BANDS = [('poly_red', 'poly_ochre'), ('poly_blue', 'wash_white'), ('poly_red', 'wash_white')]
SHUTTERS = ['shutter_blue', 'shutter_green', 'shutter_teal', 'shutter_ox']
TILES = ['tile_a', 'tile_a', 'tile_b', 'tile_c']
_CIV_C = [Vector(cv_['c']) for cv_ in CJ['civic'] if cv_['id'] in CLASSICAL_NEAR]
_LAST_WASH = [None]


def is_classical(lot):
    return lot['style'] == 'terrace' and lot.get('band', 9) <= 1 and \
        min((Vector(lot['c']) - c).length for c in _CIV_C) < CLASSICAL_R


def lot_rz(lot):
    face = lot.get('face', (0, -1))
    rz = math.atan2(-face[0], face[1]) + math.pi if tuple(face) != (0, -1) else 0.0
    if tuple(face) == (1, 0):
        rz = math.pi / 2
    if tuple(face) == (-1, 0):
        rz = -math.pi / 2
    return rz


def classical_house(name, lot, rng):
    w, d = lot['w'], lot['d']
    root = empty(name, (lot['c'][0], lot['c'][1], lot['z']), (0, 0, lot_rz(lot)), family='house')
    K = CV.Kit(rng.randint(0, 10 ** 6))
    K.lit_p = 0.85        # small openings: light more of them so the night quarter stays as lit as the town
    op = K.op
    B = 0.6
    floors = rng.choice((2, 2, 3)) if w < 9.2 else rng.choice((2, 3))
    fh = rng.uniform(2.9, 3.2)
    E = B + floors * fh
    wk = rng.choice([k for k in WASHES if k != _LAST_WASH[0]])
    _LAST_WASH[0] = wk
    wash = CP[wk]
    sh = CP[rng.choice(SHUTTERS)]
    shop = bool(lot.get('shop'))
    sides = [s for s, k in ((-1, 'nb_w'), (1, 'nb_e')) if not lot.get(k)]
    CV.box2(op, -w / 2 - 0.08, -d / 2 - 0.08, -2.0, w / 2 + 0.08, d / 2 + 0.08, B, CP['sandstone'], CV.PT['ashlar'])
    CV.box2(op, -w / 2, -d / 2, B, w / 2, d / 2, E, wash, CV.PT['render'])
    # the painted band: its top >= 1.3 m under the eave (the eave shadow and the icicles leave it legible)
    g, k = BANDS[rng.randrange(len(BANDS))]
    zb = E - 1.3 - 0.55
    CV.meander(op, (-w / 2, -d / 2), (w / 2, -d / 2), zb, 0.55, (0, -1, 0), ground=CP[g], key=CP[k])
    for s in sides:
        CV.meander(op, (s * w / 2, -d / 2), (s * w / 2, d / 2), zb, 0.55, (s, 0, 0), ground=CP[g], key=CP[k])
    # roof: a low hip, a gable along the street, or a roof terrace with a pergola (~1 in 4)
    kind = 'terrace' if rng.random() < 0.25 else ('hip' if rng.random() < 0.55 else 'gable')
    tile = CP[rng.choice(TILES)]
    fx, fy = rng.choice((-1, 1)) * w * 0.26, d * 0.2
    if kind == 'terrace':
        zf = CV.roof_terrace(op, -w / 2, -d / 2, w / 2, d / 2, E, wash, parapet_h=0.75, pergola_canopy=rng.choice(('vine', 'bougain')),
                             rng=rng)
        fz = zf + 0.5
    else:
        CV.box2(op, -w / 2 - 0.15, -d / 2 - 0.15, E - 0.22, w / 2 + 0.15, d / 2 + 0.15, E, CP['lime'], 0)
        if kind == 'hip':
            rise = CV.tiled_hip(op, -w / 2, -d / 2, w / 2, d / 2, E, rng.uniform(20.0, 24.0), tile, ov=0.4)
            fz = E + rise * min(d / 2 - abs(fy), w / 2 - abs(fx)) / (min(w, d) / 2)
        else:
            rise = CV.tiled_gable(op, -w / 2, -d / 2, w / 2, d / 2, E, rng.uniform(20.0, 24.0), tile, 'x', ov=0.4, end_col=wash)
            fz = E + rise * (1 - abs(fy) / (d / 2))
    top = CV.flue(op, fx, fy, fz, h=1.1, col=wash)
    root['chimney_top'] = tuple(top)
    # the street front
    nwin = int((w - 0.8) / 2.1) + 1        # G1: one more opening per front than the first pilot
    shut = w / nwin >= 2.05                # board shutters only where they fold open clear of the next opening
    xs = [(i + 0.5) / nwin * w - w / 2 for i in range(nwin)]
    if shop:      # tabernae: one or two open arches with a counter, glowing at night
        nsh = 2 if w > 8.2 else 1
        for i in range(nsh):
            x = ((i + 0.5) / nsh - 0.5) * w * 0.92
            ow = 2.3 if nsh == 2 else 3.0
            hs = B + 2.2
            pts = [(x - ow / 2, -d / 2 - 0.07, B + 0.05), (x + ow / 2, -d / 2 - 0.07, B + 0.05)] + \
                [(x + ow / 2 * math.cos(math.pi * j / 6), -d / 2 - 0.07, hs + ow / 2 * math.sin(math.pi * j / 6)) for j in range(7)]
            CV.lit_opening(K, pts, (0, -1, 0), lit=rng.uniform(0.75, 1.0), warm=rng.uniform(0.4, 0.7))
            CV.arch_door(K, (x, -d / 2, B), (0, -1, 0), ow, hs - B + ow / 2, CP['interior'], CP['lime'], step=False)
            CV.box2(op, x - ow / 2 + 0.1, -d / 2 - 0.75, B, x + ow / 2 - 0.1, -d / 2 - 0.1, B + 1.0, CP['lime'], CV.PT['ashlar'])
            for j in range(3):
                CV.amphora(op, (x - 0.6 + j * 0.6, -d / 2 - 0.45, B + 1.0), 0.45)
        CV.velarium(K, (-w / 2 + 0.3, -d / 2 - 1.0), (w / 2 - 0.3, -d / 2 - 1.0), 2.6, B + 3.0, B + 2.6, ground=0.0,
                    panels=max(3, round(w / 1.5)))
    else:
        xd = xs[len(xs) // 2] if nwin > 1 else 0.0
        CV.arch_door(K, (xd, -d / 2, B), (0, -1, 0), 1.3, 2.8, sh, CP['lime'])
        for x in xs:
            if abs(x - xd) > 1.5:
                CV.plain_window(K, (x, -d / 2, B + 1.7), (0, -1, 0), 0.75, 1.0, wash, shutter=sh if shut else None,
                                closed=shut and rng.random() < 0.12)
    for f in range(1, floors):
        z = B + f * fh + 1.5
        top_floor = f == floors - 1 and floors == 3
        for x in xs:
            if top_floor:
                CV.plain_window(K, (x, -d / 2, z - 0.2), (0, -1, 0), 0.7, 0.8, wash)
            else:
                CV.plain_window(K, (x, -d / 2, z), (0, -1, 0), 0.85, 1.2, wash, shutter=sh if shut else None,
                                closed=shut and rng.random() < 0.1)
        for s in sides:
            CV.plain_window(K, (s * w / 2, d * 0.12, z), (s, 0, 0), 0.75, 1.05, wash, shutter=sh)
    if floors == 3 and not shop and rng.random() < 0.5:      # a timber balcony on beams at the first floor
        bx = xs[len(xs) // 2] if nwin > 1 else 0.0
        CV.box2(op, bx - 1.3, -d / 2 - 0.95, B + fh, bx + 1.3, -d / 2, B + fh + 0.18, CP['oak_dark'], CV.PT['planks_x'])
        for x in (bx - 1.1, bx + 1.1):
            CV.beam(op, (x, -d / 2, B + fh - 0.4), (x, -d / 2 - 0.85, B + fh), 0.16, 0.18, CP['oak_dark'])
        CV.rail(op, [(bx - 1.25, -d / 2 - 0.9, B + fh + 0.18), (bx + 1.25, -d / 2 - 0.9, B + fh + 0.18)], 0.9, CP['oak_dark'], post_every=0.5,
                r=0.04)
    if not shop and rng.random() < 0.5:
        CV.pot_plant(op, rng, (rng.choice((-1, 1)) * (w / 2 - 0.6), -d / 2 - 0.6, 0.0), rng.choice(('vine', 'bougain')))
    cl.kit_objects(K, name, root, family='house')
    CHIMNEYS.append(Matrix.Translation(root.location) @ Matrix.Rotation(root.rotation_euler.z, 4, 'Z') @ Vector(root['chimney_top']))
    return root


def drop_tree(root):
    for o in reversed(descendants(root)):
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


CHIMNEYS = []
BUILDINGS = []
# party walls: a house with a neighbour flush against a side shows no windows on that side (any heading)
LOTS_ = CJ['lots']
for la in LOTS_:
    f = Vector((la['face'][0], la['face'][1])); sd = Vector((-f.y, f.x))      # local +x (side axis) for a -y front
    for lb in LOTS_:
        if la is lb or abs(la['z'] - lb['z']) > 0.5:
            continue
        dv = Vector(lb['c']) - Vector(la['c'])
        along_ = dv.dot(sd); perp_ = dv.dot(f)
        if abs(perp_) < 2.5 and abs(along_) - (la['w'] + lb['w']) / 2 < 0.8 and abs(along_) > 0.5:
            la['nb_e' if along_ > 0 else 'nb_w'] = True
HAMLET_WALL = {'pier-hyperliquid-l1': 'wall_mint', 'pier-polygon': 'wall_white', 'pier-arbitrum': 'wall_blue',
               'pier-base': 'wall_falu', 'pier-solana': 'wall_sage', 'pier-bsc': 'wall_ochre'}
for i, lot in enumerate(LOTS_):
    nm = f"{lot['style']}_{i:03d}"
    extra = None
    if lot.get('pid') and lot['style'] in ('hamlet', 'loft', 'cottage', 'boathouse'):
        extra = dict(wall=HAMLET_WALL[lot['pid']])
        if lot['style'] != 'loft' and TRNG.random() < 0.45:
            extra['wall'] = TRNG.choice(WALLS)
    root = house2(nm, lot, TRNG, extra)
    if is_classical(lot):      # the Nordic house still draws from TRNG, so every other lot keeps its look
        if 'chimney_top' in root:
            CHIMNEYS.pop()
        drop_tree(root)
        root = classical_house(nm, lot, random.Random(7000 + i))
    BUILDINGS.append((nm, root))
    bpy.context.view_layer.update()
    collect_windows(root, nm)

bpy.context.view_layer.update()


# =================================================================== LANDMARK BUILDINGS
def stone_block(name, x0, y0, z0, x1, y1, z1, col='granite', pat='ashlar', parent=None, bevel=0.05):
    return obj(name, bm_box2(x0, y0, z0, x1, y1, z1), PAL[col], PT[pat], parent=parent, bevel=bevel, family='landmark')


def hip_roof(name, x0, y0, x1, y1, z, rise, col, pat, parent=None, ov=0.4):
    bm = bmesh.new()
    x0 -= ov; y0 -= ov; x1 += ov; y1 += ov
    w = x1 - x0; d = y1 - y0
    r = min(w, d) / 2
    if w >= d:
        a = (x0 + r, (y0 + y1) / 2, z + rise); b = (x1 - r, (y0 + y1) / 2, z + rise)
    else:
        a = ((x0 + x1) / 2, y0 + r, z + rise); b = ((x0 + x1) / 2, y1 - r, z + rise)
    v = [bm.verts.new(p) for p in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), a, b)]
    if w >= d:
        bm.faces.new((v[0], v[1], v[5], v[4])); bm.faces.new((v[2], v[3], v[4], v[5]))
        bm.faces.new((v[1], v[2], v[5])); bm.faces.new((v[3], v[0], v[4]))
    else:
        bm.faces.new((v[1], v[2], v[5], v[4])); bm.faces.new((v[3], v[0], v[4], v[5]))
        bm.faces.new((v[0], v[1], v[4])); bm.faces.new((v[2], v[3], v[5]))
    bm.faces.new((v[3], v[2], v[1], v[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, col, pat, parent=parent, family='landmark', jitter=0.03)


def facade_windows(name, parent, x0, x1, y, z_rows, ww=0.9, wh=1.5, pitch=2.4, lit_p=0.7, n=(0, -1, 0), rng=None, skip=None):
    trim = bmesh.new(); glass = bmesh.new(); gl = []
    t = Vector((1, 0, 0)) if abs(n[1]) > 0.5 else Vector((0, 1, 0))
    nn = Vector(n)
    k = max(1, int((x1 - x0) / pitch))
    for zc in z_rows:
        for i in range(k):
            xc = x0 + (i + 0.5) * (x1 - x0) / k
            if skip and skip(i, zc):
                continue
            c = Vector((xc, y, zc)) if abs(n[1]) > 0.5 else Vector((y, xc, zc))
            add_window(trim, glass, c, t, nn, ww, wh, rng=rng or TRNG, lit_p=lit_p, gl_list=gl)
    obj(name + '_wtrim', trim, PAL['trim'], PT['plain'], parent=parent, family='landmark', jitter=0.0)
    glass_obj(name + '_wglass', glass, gl, parent, 'landmark')


def face_rz(face):
    return math.atan2(face[0], -face[1])


def make_root(name, p, z, rz=0.0):
    return empty(name, (p[0], p[1], z), (0, 0, rz), family='landmark')


LM = CJ['landmarks']

# P6 (D19, D21): the Customs House, the Harbourmaster's office and the Registry are civic models now (public/harbour/civic,
# placed on layout.civic plots by the runtime); the tide board is gone (D19), and so is the Seamen's church (its terrace
# is the flows quarter's).
# ---------------------------------------------------------------- bonded warehouse (basin): hoist gable
zq = Z_SHORE
wp = LM['warehouse']['p']
wh_ = make_root('bonded_warehouse', wp, zq, face_rz(LM['warehouse']['face']))
stone_block('warehouse_body', -9, -11, -1.5, 9, 11, 12.0, 'wall_falu', 'boards', wh_, bevel=0.0)
stone_block('warehouse_plinth', -9.2, -11.2, -1.5, 9.2, 11.2, 1.0, 'granite', 'ashlar', wh_)
wr = bmesh.new()
vs = [wr.verts.new(v) for v in ((-9.5, -11.4, 12.0), (9.5, -11.4, 12.0), (0, -11.4, 19.0), (-9.5, 11.4, 12.0), (9.5, 11.4, 12.0), (0, 11.4, 19.0))]
wr.faces.new((vs[0], vs[2], vs[5], vs[3])); wr.faces.new((vs[1], vs[4], vs[5], vs[2]))
obj('warehouse_roof', wr, PAL['roof_tar'], PT['boards'], parent=wh_, family='landmark')
gb = bmesh.new()
vs = [gb.verts.new(v) for v in ((-9.0, -11.0, 12.0), (9.0, -11.0, 12.0), (0, -11.0, 18.6))]
gb.faces.new(vs)
obj('warehouse_gable', gb, PAL['wall_falu'], PT['boards'], parent=wh_, family='landmark')
lod = bmesh.new()
for z_ in (1.0, 4.6, 8.2):
    merge(lod, bm_box2(-1.4, -11.15, z_, 1.4, -10.95, z_ + 2.6))
merge(lod, nl_kit.beam((0, -11.0, 15.4), (0, -13.6, 15.4), 0.3, 0.3))
obj('warehouse_doors', lod, PAL['tar'], PT['boards'], parent=wh_, family='landmark')
facade_windows('warehouse', wh_, -8, 8, -11.0, (2.4, 6.0, 9.6), ww=0.8, wh=1.2, pitch=3.2, skip=lambda i, z: i in (2, 3))
facade_windows('warehouse_s', wh_, -10, 10, -9.05, (2.4, 6.0, 9.6), ww=0.8, wh=1.2, pitch=3.0, n=(-1, 0, 0))
collect_windows(wh_, 'warehouse')

# P6 (D15): the Pharos is the Alexandria tower on its islet (public/harbour/lighthouse.glb, its own builder); the old headland
# group (tower, keeper's cottage, oil store, garden) is gone - the Keeper's Log and the Chart Room plots stand by the road.
LH_LAMP = Vector((CJ['pharos']['p'][0], CJ['pharos']['p'][1], CJ['pharos']['z'] + 88.4))     # the fire (key-art light)

# ---------------------------------------------------------------- storm-signal mast (cone attach empties), tide gauge, slipway
set_coll(collection('landmarks', ROOTC))
smp = LM['storm_mast']['p']
sm = empty('storm_mast', (smp[0], smp[1], LM['storm_mast']['z']), (0, 0, face_rz(LM['storm_mast']['face'])), family='landmark')
NAMED['storm_mast'] = sm
b_ = bm_box2(-1.3, -1.3, -2.0, 1.3, 1.3, 0.6)
obj('storm_mast_foot', b_, PAL['granite_light'], PT['ashlar'], parent=sm, family='landmark', bevel=0.05)
pole = bm_cyl(0.34, 0.16, 24.0, 8, (0, 0, 0.6))
obj('storm_mast_pole', pole, PAL['wall_white'], PT['plain'], parent=sm, family='landmark')
yd = nl_kit.beam((0, -5.4, 19.6), (0, 5.4, 19.6), 0.24, 0.24)
merge(yd, bm_cyl(0.6, 0.6, 0.2, 8, (0, 0, 21.4)))
obj('storm_mast_yard', yd, PAL['tar'], PT['plain'], parent=sm, family='landmark')
ln = bmesh.new()
_smr = face_rz(LM['storm_mast']['face']); _smz = LM['storm_mast']['z']
_dead = bmesh.new()
for p in ((6.5, 0, 0.4), (-4.8, 4.8, 0.4), (-4.8, -4.8, 0.4)):
    # every stay comes down to a stone deadeye ON the quay: shortened until its foot is on land, never in the sea
    for k_ in (1.0, 0.8, 0.62, 0.48, 0.36):
        q_ = (p[0] * k_, p[1] * k_)
        wx = smp[0] + q_[0] * math.cos(_smr) - q_[1] * math.sin(_smr); wy = smp[1] + q_[0] * math.sin(_smr) + q_[1] * math.cos(_smr)
        if point_in_poly(wx, wy, COAST) and H(wx, wy) > _smz - 0.6:
            break
    foot_ = (q_[0], q_[1], 0.45)
    merge(ln, nl_kit.line3((0, 0, 22.0), foot_, 0.035))
    merge(_dead, bm_box2(q_[0] - 0.3, q_[1] - 0.3, -0.2, q_[0] + 0.3, q_[1] + 0.3, 0.45))
obj('storm_mast_deadeyes', _dead, PAL['granite_light'], PT['ashlar'], parent=sm, family='landmark')
for sx in (-1, 1):
    merge(ln, nl_kit.line3((0, sx * 5.1, 19.6), (0, sx * 5.1, 6.0), 0.03))
obj('storm_mast_halyards', ln, PAL['tar'], PT['plain'], parent=sm, family='landmark')
# cone attach points: 5 stations down each yard-arm halyard (runtime hoists 0..n cones)
for side, sx in (('n', 1), ('s', -1)):
    for k in range(5):
        empty(f'storm_mast_cone_{side}{k}', (0, sx * 5.1, 18.2 - k * 2.4), parent=sm, family='landmark', size=0.6)
# key-art: two storm cones hoisted (runtime-driven)
cones = bmesh.new()
for k in range(2):
    merge(cones, bm_cyl(0.0, 1.15, 1.9, 12, (0, 5.1, 18.2 - k * 2.4 - 1.2)))
obj('storm_mast_keyart_cones', cones, PAL['iron'], PT['plain'], parent=sm, family='keyart')

tgp = LM['tide_gauge']['p']
tg = empty('tide_gauge', (tgp[0], tgp[1], 0.0), (0, 0, face_rz(LM['tide_gauge']['face'])), family='landmark')
NAMED['tide_gauge'] = tg
gauge = bmesh.new()
for k in range(10):
    merge(gauge, bm_box2(-0.32, -0.45, -1.6 + k * 0.55, 0.32, -0.25, -1.6 + (k + 1) * 0.55 - 0.03))
merge(gauge, bm_box2(-0.42, -0.28, -1.8, 0.42, 0.0, Z_SHORE + 0.2))
obj('tide_gauge_board', gauge, face=lambda q: ((PAL['hull_red'] if int((q.center.z + 1.6) / 0.55) % 2 else PAL['trim']) if q.center.y < -0.26 else PAL['iron'], PT['plain']),
    parent=tg, family='landmark', jitter=0.0)
empty('tide_gauge_level', (0, -0.5, 0.0), parent=tg, family='landmark', size=0.5)

# (the Slipway is the Shipyard's launch slip: the shipyard model carries it)

# ---------------------------------------------------------------- the windmill on its meadow knoll (decorative)
wmp = CJ['windmill']; wz = min(H(wmp[0] + dx, wmp[1] + dy) for dx in (-3, 3) for dy in (-3, 3))
wm = empty('windmill', (wmp[0], wmp[1], wz), (0, 0, face_rz((-0.3, -1.0))), family='landmark')
body = bm_cyl(3.6, 2.5, 10.5, 8, (0, 0, -1.5), rot=math.pi / 8)
obj('windmill_body', body, PAL['stone_white'], PT['render'], parent=wm, family='landmark', bevel=0.03)
obj('windmill_plinth', bm_cyl(3.9, 3.9, 1.6, 8, (0, 0, -1.2), rot=math.pi / 8), PAL['granite'], PT['ashlar'], parent=wm, family='landmark')
cap = bm_cyl(2.9, 0.4, 3.0, 8, (0, 0, 9.0), rot=math.pi / 8); merge(cap, bm_sphere(0.35, (0, 0, 12.1), 6, 4))
obj('windmill_cap', cap, PAL['roof_slate'], PT['slate'], parent=wm, family='landmark')
gal = bm_cyl(3.4, 3.4, 0.2, 8, (0, 0, 6.2), rot=math.pi / 8)
obj('windmill_gallery', gal, PAL['timber_dark'], PT['plain'], parent=wm, family='landmark')
obj('windmill_door', bm_box2(-0.7, -3.25, 0.0, 0.7, -2.95, 2.3), PAL['door_green'], PT['boards'], parent=wm, family='landmark')
trim = bmesh.new(); glass = bmesh.new(); gl = []
add_window(trim, glass, Vector((0, -2.7, 5.0)), Vector((1, 0, 0)), Vector((0, -1, 0)), 0.7, 1.0, mull=True, rng=TRNG, lit_p=0.9, gl_list=gl)
obj('windmill_wtrim', trim, PAL['trim'], PT['plain'], parent=wm, family='landmark')
glass_obj('windmill_glass', glass, gl, wm, 'landmark')
sails = bmesh.new(); slats = bmesh.new()
hub = Vector((0, -3.3, 9.6))
merge(sails, bm_cyl(0.5, 0.5, 0.9, 8, (0, 0, 0)))
xf(sails, rx=math.pi / 2); xf(sails, loc=(hub.x, hub.y + 0.4, hub.z))
for k in range(4):
    blade = bm_box2(0.0, -0.11, -0.11, 9.6, 0.11, 0.11)
    merge(blade, bm_box2(1.9, -0.05, 1.75, 9.6, 0.05, 1.85))                     # the outer stile
    sl_ = bmesh.new()
    for j in range(9):
        x0 = 2.1 + j * 0.84
        merge(sl_, bm_box2(x0, -0.03, 0.12, x0 + 0.62, 0.03, 1.75))
    for bm_ in (blade, sl_):
        xf(bm_, ry=-math.radians(20 + 90 * k)); xf(bm_, loc=tuple(hub))
    merge(sails, blade); merge(slats, sl_)
obj('windmill_sails', sails, PAL['timber_dark'], PT['plain'], parent=wm, family='landmark')
obj('windmill_sailcloth', slats, PAL['canvas'], PT['plain'], parent=wm, family='landmark', jitter=0.06)
collect_windows(wm, 'windmill')

print('TOWN built', len(BUILDINGS), 'houses', len(WINDOW_GROUPS), 'window groups')
