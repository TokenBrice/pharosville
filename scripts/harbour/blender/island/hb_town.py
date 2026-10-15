"""The Harbour v2 - town: the classical quarter (town houses, courtyard houses, cubic cove houses, horrea, net stores,
villae rusticae, a boat shed), the bonded warehouse, the storm mast, the tide gauge, the Cycladic windmill.
P6: the civic buildings (Customs House, Mint, Burn, Shipyard, Registry, ...) are separate models on layout.civic plots.
exec'd into build_island's namespace."""

set_coll(collection('town', ROOTC))
WINDOW_GROUPS = []        # (building name, [world points of lit windows]) -> layout lights
WIN_SPILL = []            # key-art window spill lights (in front of facades)
NAMED = {}                # runtime-addressable nodes (tide_board, storm_mast, tide_gauge, ...)



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


# =================================================================== P2 pilot: classical town houses (A + C)
# The terrace lots in front of the civic quarter (classical-town PLAN §4.4, P2): stucco town houses of 2-3 storeys under
# low tiled hips or gables (or a roof terrace with a pergola, ~1 in 4), a painted band >= 1.3 m under the eave, board
# shutters on plain deep-set windows, a kitchen flue (chimney_top); quay-front shops open as arched tabernae with a
# counter and a linen velarium on free poles. P4: every terrace lot.
import nl_classical as cl
CV, CP = cl.cv, cl.cv.PAL
WASHES = ['wash_white', 'wash_cream', 'wash_ochre', 'wash_sienna', 'wash_rose', 'wash_cream', 'wash_white', 'wash_blue']
BANDS = [('poly_red', 'poly_ochre'), ('poly_blue', 'wash_white'), ('poly_red', 'wash_white')]
SHUTTERS = ['shutter_blue', 'shutter_green', 'shutter_teal', 'shutter_ox']
TILES = ['tile_a', 'tile_a', 'tile_b', 'tile_c']
_LAST_WASH = [None]


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


# =================================================================== P4: the rest of the quarter, the coves and the farms
# (classical-town PLAN §4.4) on the same kit: every lot keeps its footprint; a style is a builder. Each keeps a lit
# opening on every free face (whichever way it turns to the camera), a kitchen flue (`chimney_top`) where people live,
# walls in render / plain (the icicle patterns), and no clapboard, slate, tar, turf, dormers, gutters or awnings.
SHUT_HAMLET = ['shutter_blue', 'shutter_green', 'shutter_teal', 'poly_blue']
# per-chain cove tint, now a limewash wash over whitewash (the hamlets stay chain-legible but Cycladic)
HAMLET_WALL = {'pier-hyperliquid-l1': ('wall_mint', 0.55), 'pier-polygon': ('bougain_light', 0.18), 'pier-arbitrum': ('wall_blue', 0.6),
               'pier-base': ('poly_blue', 0.16), 'pier-solana': ('wall_sage', 0.4), 'pier-bsc': ('wall_ochre', 0.5)}
OLIVE = [CP['olive_leaf'], CP['olive_dark']]


def hamlet_wash(pid):
    k, t = HAMLET_WALL[pid]
    return CV.mix(CP['wash_white'], CP[k], t)


def pick_wash(rng, keys=WASHES):
    wk = rng.choice([k for k in keys if k != _LAST_WASH[0]] or keys)
    _LAST_WASH[0] = wk
    return CP[wk]


def lot_root(name, lot):
    return empty(name, (lot['c'][0], lot['c'][1], lot['z']), (0, 0, lot_rz(lot)), family='house')


def finish(K, name, root, top=None):
    if top is not None:
        root['chimney_top'] = tuple(top)
    cl.kit_objects(K, name, root, family='house')
    if top is not None:
        CHIMNEYS.append(Matrix.Translation(root.location) @ Matrix.Rotation(root.rotation_euler.z, 4, 'Z') @ Vector(root['chimney_top']))
    return root


def free_faces(lot, back=True):
    """(normal, centre-offset sign) of the walls that show: the front, the sides without a neighbour, the back."""
    out = [(0, -1)]
    out += [(s, 0) for s, k in ((-1, 'nb_w'), (1, 'nb_e')) if not lot.get(k)]
    if back:
        out.append((0, 1))
    return out


def side_windows(K, lot, w, d, z, wash, sh=None, ww=0.65, wh=0.8, n_side=1, back=True, skip_front=True):
    """Small deep-set openings on the side and back walls (the front is the builder's own)."""
    for (sx, sy) in free_faces(lot, back):
        if sy == -1 and skip_front:
            continue
        L = d if sx else w
        for k in range(n_side):
            u = ((k + 0.5) / n_side - 0.5) * L * 0.6
            c = (sx * w / 2, u, z) if sx else (u, sy * d / 2, z)
            CV.plain_window(K, c, (sx, sy, 0), ww, wh, wash, shutter=sh)


def bay_door(op, c, n, w, h, col, frame):
    """A cheap round-headed loading door for long walls: the painted leaf in a flat stone surround (two polygons), for
    the many bays where the kit's moulded arch_door would cost ~120 triangles each."""
    t, n, up = CV.frame3(n)
    c = Vector(c)
    for (ww, hh, off, cc) in ((w + 0.5, h + 0.25, 0.04, frame), (w, h, 0.07, col)):
        hs = hh - ww / 2
        g = c + n * off
        CV.poly(op, [g + t * ww / 2, g + t * ww / 2 + up * hs] + [g + up * hs + t * (ww / 2 * math.cos(math.pi * k / 6)) + up * (ww / 2 * math.sin(math.pi * k / 6))
                                                             for k in range(1, 6)] + [g - t * ww / 2 + up * hs, g - t * ww / 2],
                cc, CV.PT['boards'] if cc is col else 0, nrm=n, jitter=0.0)


def court_tree(op, rng, x, y, z):
    """A small olive in a court: a leaning trunk and a broken grey-green crown (evergreen leaf pattern)."""
    h = rng.uniform(2.2, 2.8)
    CV.beam(op, (x, y, z), (x + rng.uniform(-0.4, 0.4), y + rng.uniform(-0.3, 0.3), z + h), 0.26, 0.26, CP['oak_dark'])
    CV.foliage(op, rng, (x, y, z + h + 0.5), 1.35, OLIVE, 3, 0.55, CV.LEAF_EVERGREEN)


def well(op, x, y, z):
    CV.cyl(op, (x, y), 0.6, 0.6, z, z + 0.75, CP['lime'], CV.PT['ashlar'], 8)
    CV.cyl(op, (x, y), 0.42, 0.42, z + 0.76, z + 0.77, CP['soot'], 0, 8)
    for s in (-1, 1):
        CV.box2(op, x + s * 0.55 - 0.08, y - 0.08, z + 0.7, x + s * 0.55 + 0.08, y + 0.08, z + 2.0, CP['oak_dark'], 0)
    CV.box2(op, x - 0.7, y - 0.07, z + 1.9, x + 0.7, y + 0.07, z + 2.05, CP['oak_dark'], 0)


def courtyard_house(name, lot, rng, wash=None):
    """Cottage lots: a single-storey L or U round a flagged court with a well and an olive, inward-looking; small high
    windows and an arched door on the street, low tiled ranges (the front one carries the flue)."""
    w, d = lot['w'], lot['d']
    root = lot_root(name, lot)
    K = CV.Kit(rng.randint(0, 10 ** 6)); K.lit_p = 0.9
    op = K.op
    B = 0.5
    wash = wash or pick_wash(rng)
    sh = CP[rng.choice(SHUTTERS)]
    tile = CP[rng.choice(TILES)]
    E = B + rng.uniform(3.3, 3.7)
    y0, y1 = -d / 2, d / 2
    fd = min(3.5, d * 0.46)
    yf = y0 + fd
    u_plan = w >= 7.7 and rng.random() < 0.5
    sw = 2.4 if u_plan else min(3.0, w * 0.38)
    side = rng.choice((-1, 1))
    CV.box2(op, -w / 2 - 0.08, y0 - 0.08, -2.0, w / 2 + 0.08, y1 + 0.08, B, CP['sandstone'], CV.PT['ashlar'])
    # the street range
    CV.box2(op, -w / 2, y0, B, w / 2, yf, E, wash, CV.PT['render'])
    if rng.random() < 0.5:
        rise = CV.tiled_gable(op, -w / 2, y0, w / 2, yf, E, rng.uniform(19.0, 23.0), tile, 'x', ov=0.35, end_col=wash)
    else:
        rise = CV.tiled_hip(op, -w / 2, y0, w / 2, yf, E, rng.uniform(20.0, 23.0), tile, ov=0.35)
    if rng.random() < 0.6:
        g, k = BANDS[rng.randrange(len(BANDS))]
        CV.meander(op, (-w / 2, y0), (w / 2, y0), E - 0.95, 0.45, (0, -1, 0), ground=CP[g], key=CP[k], unit=0.8)
    fx = rng.choice((-1, 1)) * w * 0.25
    top = CV.flue(op, fx, y0 + fd * 0.35, E + rise * 0.7, h=1.0, col=wash)
    # the side range(s): lower, their ridges running back from the street range
    ranges = (-1, 1) if u_plan else (side,)
    Es = E - 0.45
    for s in ranges:
        xa, xb = (-w / 2, -w / 2 + sw) if s < 0 else (w / 2 - sw, w / 2)
        CV.box2(op, xa, yf, B, xb, y1, Es, wash, CV.PT['render'])
        CV.tiled_gable(op, xa, yf, xb, y1, Es, 20.0, tile, 'y', ov=0.3, end_col=wash, antefix=None)
    # court wall: the back and (L plan) the open side, a tile coping on top
    ca = -w / 2 + (sw if (u_plan or side < 0) else 0.0)
    cb = w / 2 - (sw if (u_plan or side > 0) else 0.0)
    CV.box2(op, ca, y1 - 0.35, B, cb, y1, B + 2.2, wash, CV.PT['render'])
    CV.box2(op, ca - 0.05, y1 - 0.42, B + 2.2, cb + 0.05, y1 + 0.07, B + 2.38, tile, CV.PT['tiles'])
    if not u_plan:
        xw = -w / 2 if side > 0 else w / 2 - 0.35
        CV.box2(op, xw, yf, B, xw + 0.35, y1 - 0.35, B + 2.2, wash, CV.PT['render'])
        CV.box2(op, xw - 0.07, yf, B + 2.2, xw + 0.42, y1 - 0.35, B + 2.38, tile, CV.PT['tiles'])
    CV.poly(op, ((ca, yf, B + 0.02), (cb, yf, B + 0.02), (cb, y1 - 0.35, B + 0.02), (ca, y1 - 0.35, B + 0.02)), CP['lime_dark'],
            CV.PT['cobble'], nrm=(0, 0, 1))
    cx = (ca + cb) / 2
    well(op, cx + (cb - ca) * 0.22, yf + 1.1, B)
    court_tree(op, rng, cx - (cb - ca) * 0.2, (yf + y1) / 2 + 0.3, B)
    # street front: the door and two small high windows; small openings on the free sides and the back
    xd = rng.choice((-1, 1)) * w * 0.18
    CV.arch_door(K, (xd, y0, B), (0, -1, 0), 1.2, 2.6, sh, CP['lime'])
    for x in (-w / 2 + 1.1, w / 2 - 1.1):
        if abs(x - xd) > 1.3:
            CV.plain_window(K, (x, y0, B + 2.15), (0, -1, 0), 0.6, 0.75, wash, shutter=sh if rng.random() < 0.5 else None)
    for (sx, sy) in free_faces(lot):
        if sy == -1:
            continue
        if sx:
            CV.plain_window(K, (sx * w / 2, y0 + fd / 2, B + 2.1), (sx, 0, 0), 0.55, 0.7, wash)
        else:
            CV.plain_window(K, (cx, y1, B + 1.6), (0, 1, 0), 0.5, 0.6, wash, lit=0.0)
    if rng.random() < 0.6:
        CV.pot_plant(op, rng, (-xd * 0.9 + rng.uniform(-0.4, 0.4), y0 - 0.6, 0.0), rng.choice(('bougain', 'vine')))
    return finish(K, name, root, top)


def hamlet_rank(lot):
    """The hamlet lot's order along its cove's back quay (0, 1, 2, ... by the cove's t axis)."""
    cv_ = {c['pid']: c for c in CJ['coves']}.get(lot.get('pid'))
    if cv_ is None:
        return lot.get('seed', 0)
    t_ = lambda l_: (l_['c'][0] - cv_['back'][0]) * cv_['t'][0] + (l_['c'][1] - cv_['back'][1]) * cv_['t'][1]
    row = sorted((l_ for l_ in CJ['lots'] if l_['style'] == 'hamlet' and l_.get('pid') == lot['pid']), key=t_)
    return next((i for i, l_ in enumerate(row) if l_['c'] == lot['c']), 0)


def island_house(name, lot, rng):
    """Cove hamlets: a whitewashed cube (limewash-tinted per chain) with a flat roof behind a parapet, often a second
    cube set back on it, an outside stair to the roof, a painted door and shutters, a white flue."""
    w, d = lot['w'], lot['d']
    root = lot_root(name, lot)
    K = CV.Kit(rng.randint(0, 10 ** 6)); K.lit_p = 0.9
    op = K.op
    B = 0.35
    wash = hamlet_wash(lot['pid']) if lot.get('pid') else CP['wash_white']
    if rng.random() < 0.3:
        wash = CP['wash_white']
    door = CP[rng.choice(SHUT_HAMLET)]
    E1 = B + rng.uniform(3.0, 3.4)
    CV.box2(op, -w / 2 - 0.1, -d / 2 - 0.1, -2.0, w / 2 + 0.1, d / 2 + 0.1, B, CP['lime'], CV.PT['ashlar'])
    CV.box2(op, -w / 2, -d / 2, B, w / 2, d / 2, E1, wash, CV.PT['render'])
    # integration G3: neighbours along the cove never twin - the roof alternates set-back cube / pergola / dome by the
    # lot's rank along its cove, and the set-back side alternates with it
    rank = hamlet_rank(lot)
    upper = rank % 3 == 0
    domed = rank % 3 == 2
    us = -1 if rank % 2 == 0 else 1
    rng.random(); rng.random()                 # keep the rest of the lot's draws where they were
    zf = CV.roof_terrace(op, -w / 2, -d / 2, w / 2, d / 2, E1, wash, parapet_h=0.6, cornice=wash,
                         pergola_canopy=None if (upper or domed) else rng.choice(('vine', 'bougain')), rng=rng)
    if domed:      # a little limewashed drum and a Cycladic blue dome over the back of the terrace
        dc = (us * w * 0.18, d * 0.12)
        dr = min(w, d) * 0.24
        CV.lathe(op, dc, [(dr, zf), (dr, zf + 1.1), (dr + 0.12, zf + 1.1), (dr + 0.12, zf + 1.28), (0.0, zf + 1.28)], wash, 0, 12, False)
        CV.dome(op, dc, zf + 1.28, dr, dr * 0.85, CP['shutter_blue'], 0, segs=12, rings=4)
        CV.box2(op, dc[0] - 0.06, dc[1] - 0.06, zf + 1.28 + dr * 0.85, dc[0] + 0.06, dc[1] + 0.06, zf + 1.28 + dr * 0.85 + 0.7, CP['lime'], 0)
    if upper:      # the second cube, set back from the street, on one side
        ux0, ux1 = (-w / 2 + 0.3, -w / 2 + 0.3 + w * 0.52) if us < 0 else (w / 2 - 0.3 - w * 0.52, w / 2 - 0.3)
        uy0 = -d / 2 + rng.uniform(1.4, 2.4)
        E2 = zf + 2.7
        CV.box2(op, ux0, uy0, zf, ux1, d / 2 - 0.3, E2, wash, CV.PT['render'])
        CV.box2(op, ux0 - 0.1, uy0 - 0.1, E2, ux1 + 0.1, d / 2 - 0.2, E2 + 0.18, wash, 0)
        CV.parapet(op, ux0, uy0, ux1, d / 2 - 0.3, E2 + 0.18, 0.4, 0.22, wash)
        CV.plain_window(K, ((ux0 + ux1) / 2, uy0, zf + 1.5), (0, -1, 0), 0.7, 0.8, wash, shutter=door)
        top = CV.flue(op, (ux0 + ux1) / 2 + us * 0.5, d / 2 - 1.0, E2 + 0.2, h=1.0, col=wash, cap=wash)
    else:
        top = CV.flue(op, rng.choice((-1, 1)) * (w / 2 - 0.8), d / 2 - 0.9, zf, h=1.3, col=wash, cap=wash)
    # the outside stair up a free side to the roof terrace
    st = [s for s in (-us, us) if not lot.get('nb_w' if s < 0 else 'nb_e')]
    if st:
        sx = st[0]
        nst = max(6, int((E1 - B) / 0.32))
        CV.outside_stair(op, sx * w / 2, -d / 2 + 0.6, B, E1, steps=nst, run=min(0.5, (d - 2.6) / nst), width=1.1, side=sx, col=wash)
    # the street front: door and one or two shuttered openings, a pot by the door
    xd = rng.choice((-1, 1)) * w * 0.2
    CV.arch_door(K, (xd, -d / 2, B), (0, -1, 0), 1.1, 2.5, door, CV.mix(wash, CP['lime_dark'], 0.25))
    for x in (-w / 2 + 1.2, w / 2 - 1.2):
        if abs(x - xd) > 1.4:
            CV.plain_window(K, (x, -d / 2, B + 1.7), (0, -1, 0), 0.7, 0.85, wash, shutter=door, closed=rng.random() < 0.12)
    side_windows(K, lot, w, d, B + 1.8, wash, door)
    if rng.random() < 0.7:
        CV.pot_plant(op, rng, (xd + rng.choice((-1, 1)) * 1.1, -d / 2 - 0.55, B - 0.1), rng.choice(('bougain', 'bougain', 'vine')))
    return finish(K, name, root, top)


def horreum(name, lot, rng):
    """Warehouse lots: a long stuccoed store on an ashlar base, gable to the water under a low tiled roof, an arched
    loading door per bay on the free sides, slit windows high, a hoist beam in the gable. Tron's stores are red ochre."""
    w, d = lot['w'], lot['d']
    root = lot_root(name, lot)
    K = CV.Kit(rng.randint(0, 10 ** 6)); K.lit_p = 0.75
    op = K.op
    B = 0.6
    tron = lot.get('chain') == 'Tron'
    wall = CV.mix(CP['wash_sienna'], CP['poly_red'], 0.4) if tron else pick_wash(rng, ['stone', 'wash_cream', 'wash_ochre', 'lime',
                                                                                        'stone_rose'])
    tile = CV.mix(CV.mix(CP['tile_c'] if tron else CP[rng.choice(TILES)], CP['terracotta'], 0.45), CP['clay'], 0.75)   # long shaded slopes (in the east hill's shadow): a warm, light tile (G3)
    E = B + rng.uniform(6.4, 7.2)
    CV.box2(op, -w / 2 - 0.12, -d / 2 - 0.12, -2.0, w / 2 + 0.12, d / 2 + 0.12, B + 1.1, CP['sandstone'], CV.PT['ashlar'])
    CV.box2(op, -w / 2, -d / 2, B + 1.1, w / 2, d / 2, E, wall, CV.PT['render'])
    CV.box2(op, -w / 2 - 0.1, -d / 2 - 0.1, B + 3.6, w / 2 + 0.1, d / 2 + 0.1, B + 3.85, CP['lime'], 0)      # string course
    if rng.random() < 0.5:
        rise = CV.tiled_gable(op, -w / 2, -d / 2, w / 2, d / 2, E, rng.uniform(18.0, 21.0), tile, 'y', ov=0.45, end_col=wall)
        CV.box2(op, -w / 2 - 0.2, -d / 2 - 0.25, E - 0.25, w / 2 + 0.2, -d / 2 + 0.05, E, CP['lime'], 0)        # gable cornice
    else:      # a hipped store: one slope always takes the sun
        CV.tiled_hip(op, -w / 2, -d / 2, w / 2, d / 2, E, rng.uniform(19.0, 22.0), tile, ov=0.45)
        rise = 0.0           # no gable: the hoist beam comes out under the eave
    # the water gable: the great loading arch, a lit opening over it, two slits, the hoist beam at the apex
    CV.arch_door(K, (0, -d / 2, B), (0, -1, 0), 2.6, 3.9, CP['oak_dark'], CP['lime'], step=False)
    CV.plain_window(K, (0, -d / 2, E - 1.2), (0, -1, 0), 0.9, 1.1, wall, arch=True, sill=False)
    for s in (-1, 1):
        CV.plain_window(K, (s * w * 0.3, -d / 2, B + 5.0), (0, -1, 0), 0.38, 1.15, wall, sill=False)
        CV.plain_window(K, (s * w * 0.3, -d / 2, B + 2.4), (0, -1, 0), 0.38, 1.0, wall, sill=False, lit=0.0)
    CV.beam(op, (0, -d / 2 + 0.5, E + rise * 0.72), (0, -d / 2 - 1.6, E + rise * 0.72), 0.28, 0.3, CP['oak_dark'])
    CV.beam(op, (0, -d / 2 - 1.45, E + rise * 0.72), (0, -d / 2 - 1.45, B + 4.6), 0.04, 0.04, CP['oak_dark'])
    # the loading bays down each free side
    nb = 3
    for (sx, sy) in free_faces(lot, back=False):
        if not sx:
            continue
        for k in range(nb):
            y = ((k + 0.5) / nb - 0.5) * d * 0.86
            bay_door(op, (sx * w / 2, y, B + 1.1), (sx, 0, 0), 1.8, 2.9, CP['oak_dark'] if k != 1 else CP['timber_grey'], CP['lime'])
            CV.plain_window(K, (sx * w / 2, y, B + 5.0), (sx, 0, 0), 0.38, 1.1, wall, sill=False)
    CV.plain_window(K, (0, d / 2, B + 5.0), (0, 1, 0), 0.5, 1.0, wall, sill=False)
    return finish(K, name, root)


def net_store(name, lot, rng):
    """Loft lots: a stone ground floor with an arched door, an open timber loft over it (nets and a furled sail hanging
    under the tiles), gable to the water."""
    w, d = lot['w'], lot['d']
    root = lot_root(name, lot)
    K = CV.Kit(rng.randint(0, 10 ** 6)); K.lit_p = 0.85
    op = K.op
    B = 0.4
    stone = CV.mix(CP['stone_dark'], hamlet_wash(lot['pid']) if lot.get('pid') else CP['stone'], 0.35)
    tile = CP[rng.choice(TILES)]
    E1 = B + 3.0
    E2 = E1 + 2.5
    CV.box2(op, -w / 2 - 0.1, -d / 2 - 0.1, -2.0, w / 2 + 0.1, d / 2 + 0.1, B, CP['sandstone'], CV.PT['ashlar'])
    CV.box2(op, -w / 2, -d / 2, B, w / 2, d / 2, E1, stone, CV.PT['render'])
    CV.box2(op, -w / 2 - 0.3, -d / 2 - 0.35, E1, w / 2 + 0.3, d / 2 + 0.3, E1 + 0.22, CP['oak_dark'], CV.PT['planks_x'])
    for x in (-w / 2 + 0.15, 0.0, w / 2 - 0.15):               # loft posts and the boarded back
        for y in (-d / 2 + 0.15, -d / 6, d / 6, d / 2 - 0.15):
            if x == 0.0 and abs(y) < d / 2 - 0.2:
                continue
            CV.box2(op, x - 0.13, y - 0.13, E1 + 0.22, x + 0.13, y + 0.13, E2, CP['oak_dark'], CV.PT['boards'])
    CV.box2(op, -w / 2 + 0.1, d / 2 - 0.2, E1 + 0.22, w / 2 - 0.1, d / 2 - 0.05, E2, CP['timber_grey'], CV.PT['boards'])
    for s in (-1, 1):                                           # rail beams along the sides
        CV.box2(op, s * w / 2 - 0.1, -d / 2, E1 + 1.0, s * w / 2 + 0.1, d / 2, E1 + 1.15, CP['oak_dark'], 0)
        CV.box2(op, s * w / 2 - 0.1, -d / 2, E2 - 0.2, s * w / 2 + 0.1, d / 2, E2, CP['oak_dark'], 0)
    CV.tiled_gable(op, -w / 2, -d / 2, w / 2, d / 2, E2, rng.uniform(20.0, 23.0), tile, 'y', ov=0.5, end_col=CP['timber_grey'],
                   end_pat=CV.PT['boards'])
    # nets and a furled sail on the loft beams (visible through the open sides)
    for k in range(3):
        y = -d / 2 + 1.2 + k * (d - 2.4) / 2
        CV.box2(op, -w / 2 + 0.4, y - 0.12, E1 + 0.8, w / 2 - 0.4, y + 0.12, E2 - 0.3, lin('#5E6E50') if k != 1 else lin('#7A5A3A'), 0)
    CV.cyl(op, (0, 0), 0.32, 0.32, E1 + 0.25, E1 + 0.9, CP['linen'], 0, 6)
    for k in range(5):
        CV.sphere(op, (rng.uniform(-w / 2 + 0.6, w / 2 - 0.6), rng.uniform(-d / 2 + 0.6, d / 2 - 0.6), E1 + 0.4), 0.18, CP['wash_ochre'], 5, 3)
    # ground floor: the door to the water, a lit opening, side windows
    CV.arch_door(K, (0, -d / 2, B), (0, -1, 0), 1.9, 2.75, CP['oak_dark'], CP['lime'], step=False)
    CV.plain_window(K, (w / 2 - 1.0 if rng.random() < 0.5 else -w / 2 + 1.0, -d / 2, B + 1.7), (0, -1, 0), 0.55, 0.7, stone, sill=False)
    side_windows(K, lot, w, d, B + 1.7, stone, ww=0.55, wh=0.7)
    return finish(K, name, root)


def villa_rustica(name, lot, rng):
    """Farmhouse lots: a two-storey ochre or cream farmhouse under a low hip, a timber portico along the front on stone
    footings, shutters, a painted band, the kitchen flue."""
    w, d = lot['w'], lot['d']
    root = lot_root(name, lot)
    K = CV.Kit(rng.randint(0, 10 ** 6)); K.lit_p = 0.85
    op = K.op
    B = 0.6
    pd = 2.2                     # the portico eats into the lot's front
    y0 = -d / 2 + pd
    wash = pick_wash(rng, ['wash_ochre', 'wash_cream', 'wash_sienna', 'wash_rose'])
    sh = CP[rng.choice(SHUTTERS)]
    tile = CP[rng.choice(TILES)]
    fh = 3.0
    E = B + 2 * fh
    CV.box2(op, -w / 2 - 0.1, -d / 2 - 0.1, -2.0, w / 2 + 0.1, d / 2 + 0.1, B, CP['sandstone'], CV.PT['ashlar'])
    CV.box2(op, -w / 2, y0, B, w / 2, d / 2, E, wash, CV.PT['render'])
    rise = CV.tiled_hip(op, -w / 2, y0, w / 2, d / 2, E, rng.uniform(20.0, 23.0), tile, ov=0.45)
    g, k = BANDS[rng.randrange(len(BANDS))]
    CV.meander(op, (-w / 2, y0), (w / 2, y0), E - 1.25, 0.5, (0, -1, 0), ground=CP[g], key=CP[k])
    top = CV.flue(op, w * 0.22, (y0 + d / 2) / 2 + 0.6, E + rise * 0.8, h=1.2, col=wash)
    # the portico: four oak posts on stone footings, a lean-to tiled roof against the front wall
    for i in range(4):
        x = -w / 2 + 0.5 + i * (w - 1.0) / 3
        CV.box2(op, x - 0.3, -d / 2 + 0.05, B, x + 0.3, -d / 2 + 0.65, B + 0.5, CP['lime'], CV.PT['ashlar'])
        CV.box2(op, x - 0.14, -d / 2 + 0.21, B + 0.5, x + 0.14, -d / 2 + 0.49, B + 2.85, CP['oak_dark'], CV.PT['boards'])
    CV.box2(op, -w / 2 + 0.2, -d / 2 + 0.15, B + 2.85, w / 2 - 0.2, -d / 2 + 0.55, B + 3.1, CP['oak_dark'], 0)
    CV.lean_to(op, -w / 2 + 0.2, w / 2 - 0.2, -d / 2 + 0.2, B + 3.1, y0, B + 3.75, tile)
    CV.poly(op, ((-w / 2, -d / 2 + 0.1, B + 0.02), (w / 2, -d / 2 + 0.1, B + 0.02), (w / 2, y0, B + 0.02), (-w / 2, y0, B + 0.02)),
            CP['tile_c'], CV.PT['cobble'], nrm=(0, 0, 1))
    xs = [-w * 0.32, 0.0, w * 0.32]
    CV.arch_door(K, (0.0, y0, B), (0, -1, 0), 1.3, 2.7, sh, CP['lime'], step=False)
    for x in xs:
        if x:
            CV.plain_window(K, (x, y0, B + 1.6), (0, -1, 0), 0.8, 1.0, wash, shutter=sh)
        CV.plain_window(K, (x, y0, B + fh + 1.5), (0, -1, 0), 0.75, 0.95, wash, shutter=sh, closed=rng.random() < 0.15)
    for (sx, sy) in free_faces(lot):
        if sy == -1:
            continue
        if sx:
            CV.plain_window(K, (sx * w / 2, (y0 + d / 2) / 2, B + fh + 1.5), (sx, 0, 0), 0.7, 0.9, wash, shutter=sh)
            CV.plain_window(K, (sx * w / 2, (y0 + d / 2) / 2, B + 1.6), (sx, 0, 0), 0.7, 0.9, wash)
        else:
            CV.plain_window(K, (-w * 0.2, d / 2, B + fh + 1.5), (0, 1, 0), 0.7, 0.9, wash)
    return finish(K, name, root, top)


def barn_press(name, lot, rng):
    """Barn lots: a long tiled stone barn with a great arched door, slit windows, and an open olive-press shed at one end
    (a stone basin, the upright millstone and the press beam under a lean-to)."""
    w, d = lot['w'], lot['d']
    root = lot_root(name, lot)
    K = CV.Kit(rng.randint(0, 10 ** 6)); K.lit_p = 0.7
    op = K.op
    B = 0.4
    stone = pick_wash(rng, ['stone', 'lime', 'stone_rose'])
    tile = CP[rng.choice(TILES)]
    s = rng.choice((-1, 1))
    sw = 4.0
    xa, xb = (-w / 2, w / 2 - sw) if s > 0 else (-w / 2 + sw, w / 2)
    E = B + 4.6
    CV.box2(op, -w / 2 - 0.1, -d / 2 - 0.1, -2.0, w / 2 + 0.1, d / 2 + 0.1, B, CP['sandstone'], CV.PT['ashlar'])
    CV.box2(op, xa, -d / 2, B, xb, d / 2, E, stone, CV.PT['render'])
    CV.tiled_gable(op, xa, -d / 2, xb, d / 2, E, rng.uniform(19.0, 22.0), tile, 'x', ov=0.45, end_col=stone)
    xm = (xa + xb) / 2
    CV.arch_door(K, (xm, -d / 2, B), (0, -1, 0), 2.8, 3.8, CP['oak_dark'], CP['lime'], step=False)
    for x in (xa + 1.3, xb - 1.3):
        CV.plain_window(K, (x, -d / 2, B + 3.2), (0, -1, 0), 0.35, 1.0, stone, sill=False)
    xo = xb if s > 0 else xa
    CV.plain_window(K, (xo, 0.0, B + 3.0), (s, 0, 0), 0.6, 0.75, stone, sill=False)
    CV.plain_window(K, (xm, d / 2, B + 3.0), (0, 1, 0), 0.6, 0.75, stone, sill=False)
    CV.plain_window(K, (-xo, 0.0, B + 3.0), (-s, 0, 0), 0.35, 1.0, stone, sill=False)
    # the press shed: posts on the open side, a lean-to against the barn's end wall
    xs0, xs1 = (xb, w / 2) if s > 0 else (-w / 2, xa)
    xe = xs1 if s > 0 else xs0
    for y in (-d / 2 + 0.3, 0.0, d / 2 - 0.3):
        CV.box2(op, xe - s * 0.3 - 0.13, y - 0.13, B, xe - s * 0.3 + 0.13, y + 0.13, B + 2.7, CP['oak_dark'], CV.PT['boards'])
    CV.box2(op, xs0, -d / 2, B, xs1, d / 2, B + 0.06, CP['lime_dark'], CV.PT['cobble'])
    # a lean-to along the barn end: modelled as a low gable half (the kit's lean_to runs along y, so rotate by axes)
    zt, zl = E - 0.5, B + 2.9
    xi, xo2 = (xb, w / 2 + 0.4) if s > 0 else (xa, -w / 2 - 0.4)
    CV.poly(op, ((xi, -d / 2 - 0.4, zt), (xo2, -d / 2 - 0.4, zl), (xo2, d / 2 + 0.4, zl), (xi, d / 2 + 0.4, zt)), tile, CV.PT['tiles'],
            nrm=(s, 0, 1))
    CV.poly(op, ((xo2, -d / 2 - 0.4, zl - 0.2), (xo2, d / 2 + 0.4, zl - 0.2), (xo2, d / 2 + 0.4, zl), (xo2, -d / 2 - 0.4, zl)),
            CP['tile_ridge'], 0, nrm=(s, 0, 0))
    cx = (xs0 + xs1) / 2
    CV.cyl(op, (cx, 0.4), 1.25, 1.2, B, B + 0.8, CP['lime'], CV.PT['ashlar'], 10)
    CV.disc(op, (cx, 0.4, B + 1.55), (1, 0, 0), 0.75, 0.35, CP['stone_dark'], 10)
    CV.beam(op, (cx, 0.4, B + 0.8), (cx, 0.4, B + 2.6), 0.22, 0.22, CP['oak_dark'])
    CV.beam(op, (cx - 1.2, 0.4, B + 2.0), (cx + 1.2, 0.4, B + 2.0), 0.18, 0.18, CP['oak_dark'])
    for k in range(3):
        CV.amphora(op, (cx - 0.9 + k * 0.6, -d / 2 + 0.8, B), 0.9)
    return finish(K, name, root)


def boat_shed(name, lot, rng):
    """The boathouse: a stone shed under a tiled roof, its gable to the water opened by one tall arch over the slip, a
    lit opening in the gable, a timber run down onto the pebbles."""
    w, d = lot['w'], lot['d']
    root = lot_root(name, lot)
    K = CV.Kit(rng.randint(0, 10 ** 6)); K.lit_p = 0.85
    op = K.op
    B = 0.3
    stone = CV.mix(CP['stone'], hamlet_wash(lot['pid']) if lot.get('pid') else CP['stone'], 0.4)
    tile = CP[rng.choice(TILES)]
    E = B + 4.2
    CV.box2(op, -w / 2 - 0.1, -d / 2 + 0.4, -2.0, w / 2 + 0.1, d / 2 + 0.1, B, CP['sandstone'], CV.PT['ashlar'])
    for s in (-1, 1):
        CV.box2(op, s * w / 2 - (0.45 if s > 0 else 0), -d / 2 + 0.6, B, s * w / 2 + (0.45 if s < 0 else 0), d / 2, E, stone, CV.PT['render'])
    CV.box2(op, -w / 2, d / 2 - 0.45, B, w / 2, d / 2, E, stone, CV.PT['render'])
    CV.arcade(op, -w / 2, w / 2, -d / 2 + 0.6, 0.5, B - 0.4, E, 1, 0.9, B + 1.6, stone, CV.PT['render'], intr=CP['lime_dark'],
              keystone=CP['lime'])
    CV.poly(op, ((-w / 2 + 0.45, -d / 2 + 1.1, B + 0.2), (w / 2 - 0.45, -d / 2 + 1.1, B + 0.2), (w / 2 - 0.45, d / 2 - 0.45, B + 0.2),
                 (-w / 2 + 0.45, d / 2 - 0.45, B + 0.2)), CP['interior'], 0, nrm=(0, 0, 1))
    CV.box2(op, -w / 2 + 0.45, d / 2 - 0.6, B, w / 2 - 0.45, d / 2 - 0.45, E, CP['interior'], 0)
    CV.tiled_gable(op, -w / 2, -d / 2 + 0.6, w / 2, d / 2, E, 21.0, tile, 'y', ov=0.45, end_col=stone)
    CV.plain_window(K, (0, -d / 2 + 0.6, E + 0.6), (0, -1, 0), 0.6, 0.6, stone, arch=True, sill=False, lit=0.9)
    for s in (-1, 1):
        CV.plain_window(K, (s * w / 2, 0.8, B + 2.4), (s, 0, 0), 0.5, 0.7, stone, sill=False)
    CV.beam(op, (0, -d / 2 + 1.2, B + 0.1), (0, -d / 2 - 5.0, -1.2), w * 0.45, 0.22, CP['timber_grey'], CV.PT['boards'])
    return finish(K, name, root)


STYLE_BUILD = {'cottage': courtyard_house, 'hamlet': island_house, 'warehouse': horreum, 'loft': net_store, 'farmhouse': villa_rustica,
               'barn': barn_press, 'boathouse': boat_shed}


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
for i, lot in enumerate(LOTS_):
    i = lot.get('seed', i)                 # the lot's index before compose dropped the sightline lots
    nm = f"{lot['style']}_{i:03d}"
    rng = random.Random(7000 + i)          # per lot: the P2 terrace row keeps its look
    if lot['style'] == 'terrace':
        root = classical_house(nm, lot, rng)
    elif lot['style'] == 'cottage' and lot.get('pid') and rng.random() < 0.5:
        root = courtyard_house(nm, lot, rng, hamlet_wash(lot['pid']))
    else:
        root = STYLE_BUILD[lot['style']](nm, lot, rng)
    BUILDINGS.append((nm, root))
    bpy.context.view_layer.update()
    collect_windows(root, nm)

bpy.context.view_layer.update()


# =================================================================== LANDMARK BUILDINGS
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
# classical-town P4: the great horreum of the basin - stucco over an ashlar base, string courses, a low tiled gable to the
# water with a cornice, three storeys of deep-set openings, an arched loading door per floor bay and the hoist beam
K_ = CV.Kit(4411); K_.lit_p = 0.7
op_ = K_.op
whc = CP['wash_ochre']
CV.box2(op_, -9.2, -11.2, -1.5, 9.2, 11.2, 1.6, CP['sandstone'], CV.PT['ashlar'])
CV.box2(op_, -9.0, -11.0, 1.6, 9.0, 11.0, 10.6, whc, CV.PT['render'])
for zc in (4.6, 7.8):
    CV.box2(op_, -9.1, -11.1, zc, 9.1, 11.1, zc + 0.25, CP['lime'], 0)
rise_ = CV.tiled_gable(op_, -9.0, -11.0, 9.0, 11.0, 10.6, 19.0, CV.mix(CV.mix(CP['tile_a'], CP['terracotta'], 0.45), CP['clay'], 0.75), 'y', ov=0.5,
                      end_col=whc)      # the horreum tile (G3): warm and light enough to read on its shaded slope
CV.box2(op_, -9.3, -11.35, 10.35, 9.3, -10.9, 10.6, CP['lime'], 0)
CV.meander(op_, (-9.0, -11.0), (9.0, -11.0), 9.4, 0.6, (0, -1, 0), ground=CP['poly_red'], key=CP['poly_ochre'])
for zb_, hh in ((0.0, 3.8), (4.85, 2.7), (8.05, 2.2)):
    CV.arch_door(K_, (0, -11.0, zb_ + (1.6 if zb_ == 0.0 else 0.0)), (0, -1, 0), 2.4 if zb_ == 0.0 else 1.8, hh, CP['oak_dark'], CP['lime'],
                 step=False)
for x in (-6.0, -3.2, 3.2, 6.0):
    for zw in (3.0, 6.2, 9.0):
        CV.plain_window(K_, (x, -11.0, zw), (0, -1, 0), 0.7, 1.0 if zw < 9 else 0.8, whc)
for s in (-1, 1):
    for y in (-7.5, -2.5, 2.5, 7.5):
        CV.plain_window(K_, (s * 9.0, y, 7.6), (s, 0, 0), 0.6, 0.9, whc)
        bay_door(op_, (s * 9.0, y, 1.6), (s, 0, 0), 1.8, 2.8, CP['oak_dark'], CP['lime'])
CV.beam(op_, (0, -10.5, 10.6 + rise_ * 0.7), (0, -13.4, 10.6 + rise_ * 0.7), 0.3, 0.32, CP['oak_dark'])
CV.beam(op_, (0, -13.2, 10.6 + rise_ * 0.7), (0, -13.2, 5.6), 0.05, 0.05, CP['oak_dark'])
cl.kit_objects(K_, 'warehouse', wh_, family='landmark')
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
obj('storm_mast_pole', pole, CP['oak_dark'], PT['boards'], parent=sm, family='landmark')
yd = nl_kit.beam((0, -5.4, 19.6), (0, 5.4, 19.6), 0.24, 0.24)
merge(yd, bm_cyl(0.6, 0.6, 0.2, 8, (0, 0, 21.4)))
obj('storm_mast_yard', yd, CP['oak_dark'], PT['plain'], parent=sm, family='landmark')
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
# classical-town Q3: a Cycladic mill - a round whitewashed stone tower, a conical thatch cap, a ring of spars carrying
# triangular cloth sails, each sheeted to the next spar's tip
wmp = CJ['windmill']; wz = min(H(wmp[0] + dx, wmp[1] + dy) for dx in (-3, 3) for dy in (-3, 3))
# integration G3: the sail ring turned ~65 deg off the camera (seen obliquely, it no longer screens the round body and cap
# from the heart view) and a little smaller
wm = empty('windmill', (wmp[0], wmp[1], wz), (0, 0, face_rz((-0.34, -0.94))), family='landmark')
obj('windmill_plinth', bm_cyl(4.0, 4.0, 1.6, 12, (0, 0, -1.2)), CP['lime_dark'], PT['ashlar'], parent=wm, family='landmark')
body = bm_cyl(3.5, 3.1, 9.6, 12, (0, 0, -0.6)); merge(body, bm_cyl(3.3, 3.3, 0.3, 12, (0, 0, 9.0)))
obj('windmill_body', body, CP['wash_white'], PT['render'], parent=wm, family='landmark', bevel=0.03)
obj('windmill_cap', bm_cyl(3.45, 0.2, 3.6, 12, (0, 0, 9.3), cap=False), lin('#B89C62'), PT['plain'], parent=wm, family='landmark', jitter=0.08)
obj('windmill_door', bm_box2(-0.65, -3.62, 0.0, 0.65, -3.3, 2.2), CP['shutter_blue'], PT['boards'], parent=wm, family='landmark')
K_ = CV.Kit(5150); K_.lit_p = 1.0
CV.plain_window(K_, (0, -3.05, 5.0), (0, -1, 0), 0.6, 0.8, CP['wash_white'], lit=0.9)
CV.plain_window(K_, (3.15, 0, 4.0), (1, 0, 0), 0.5, 0.65, CP['wash_white'], lit=0.7)
cl.kit_objects(K_, 'windmill', wm, family='landmark')
sails = bmesh.new(); cloth = bmesh.new()
hub = Vector((0, -3.7, 10.0))
merge(sails, bm_cyl(0.45, 0.45, 1.3, 8, (0, 0, 0)))
xf(sails, rx=math.pi / 2); xf(sails, loc=(hub.x, hub.y + 0.6, hub.z))
NSP = 8
tips = []
for k in range(NSP):
    a_ = 2 * math.pi * k / NSP + 0.2
    d_ = Vector((math.cos(a_), 0, math.sin(a_)))
    tip = hub + d_ * 6.6
    tips.append(tip)
    merge(sails, nl_kit.beam(tuple(hub), tuple(tip), 0.14, 0.14))
for k in range(NSP):     # each sail: from the spar's root third to its tip, sheeted toward the next spar
    sa = hub + (tips[k] - hub) * 0.15; sb = tips[k]; sc = hub + (tips[(k + 1) % NSP] - hub) * 0.82
    f = bmesh.new()
    vs = [f.verts.new(tuple(v + Vector((0, -0.05, 0)))) for v in (sa, sb, sc)]
    f.faces.new(vs)
    bmesh.ops.solidify(f, geom=f.faces[:], thickness=0.04)
    merge(cloth, f)
    merge(sails, nl_kit.line3(tuple(sb), tuple(tips[(k + 1) % NSP]), 0.02))
obj('windmill_sails', sails, CP['oak_dark'], PT['plain'], parent=wm, family='landmark')
obj('windmill_sailcloth', cloth, CP['linen'], PT['plain'], parent=wm, family='landmark', jitter=0.04)
collect_windows(wm, 'windmill')

print('TOWN built', len(BUILDINGS), 'houses', len(WINDOW_GROUPS), 'window groups')
