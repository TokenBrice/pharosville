"""The Harbour v2 - town: terraced houses (style C base + the fixes: dormers, porches, gutters, finials, shop signs,
awnings, window variety), landmark buildings (Customs House + tide board, Harbourmaster, Registry, church,
bonded warehouse), hamlet sheds + net lofts, the Pharos group, storm mast, tide gauge, slipway.
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
    if lot.get('pid') and lot['style'] in ('hamlet', 'loft', 'cottage'):
        extra = dict(wall=HAMLET_WALL[lot['pid']])
        if lot['style'] != 'loft' and TRNG.random() < 0.45:
            extra['wall'] = TRNG.choice(WALLS)
    root = house2(nm, lot, TRNG, extra)
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

# ---------------------------------------------------------------- Customs House + the tide board
cp = LM['customs_house']['p']; zq = Z_SHORE
ch = make_root('customs_house', cp, zq, face_rz(LM['customs_house']['face']))
stone_block('customs_house_body', -11, -7, -1.5, 11, 7, 11.4, 'stone_white', 'render', ch)
stone_block('customs_house_plinth', -11.3, -7.3, -1.5, 11.3, 7.3, 1.0, 'granite', 'ashlar', ch)
stone_block('customs_house_cornice', -11.4, -7.4, 11.2, 11.4, 7.4, 11.8, 'granite_light', 'plain', ch)
for z_ in (4.6, 8.1):
    stone_block(f'customs_house_band{z_}', -11.15, -7.15, z_ - 0.15, 11.15, 7.15, z_ + 0.15, 'granite_light', 'plain', ch)
for sx in (-1, 1):
    stone_block(f'customs_house_quoin{sx}', sx * 11 - 0.6, -7.2, 1.0, sx * 11 + 0.6, 7.2, 11.2, 'granite_light', 'ashlar', ch)
hip_roof('customs_house_roof', -11.4, -7.4, 11.4, 7.4, 11.8, 4.6, PAL['roof_slate'], PT['slate'], ch)
# central pediment + clock
ped = bmesh.new()
vs = [ped.verts.new(v) for v in ((-5.2, -7.6, 11.8), (5.2, -7.6, 11.8), (0, -7.6, 15.2), (-5.2, -6.0, 11.8), (5.2, -6.0, 11.8), (0, -6.0, 15.2))]
ped.faces.new((vs[0], vs[1], vs[2])); ped.faces.new((vs[0], vs[2], vs[5], vs[3])); ped.faces.new((vs[1], vs[4], vs[5], vs[2]))
obj('customs_house_pediment', ped, PAL['stone_white'], PT['render'], parent=ch, family='landmark')
clk = bm_cyl(1.25, 1.25, 0.25, 20, (0, 0, 0)); xf(clk, rx=math.pi / 2); xf(clk, loc=(0, -7.7, 13.3))
obj('customs_house_clock', clk, PAL['trim'], PT['plain'], parent=ch, family='landmark')
hands = bm_box2(-0.06, -7.95, 13.25, 0.06, -7.85, 14.2); merge(hands, bm_box2(-0.06, -7.95, 13.25, 0.75, -7.85, 13.37))
merge(hands, bm_cyl(1.3, 1.3, 0.08, 20, (0, 0, 0)))
obj('customs_house_clockhands', hands, PAL['iron'], PT['metal'], parent=ch, family='landmark')
facade_windows('customs_house', ch, -10, 10, -7.0, (2.8, 6.3, 9.7), ww=1.0, wh=1.7, pitch=2.5,
               skip=lambda i, z: z < 3 and i in (3, 4))
for sx in (-1, 1):
    facade_windows(f'customs_house_side{sx}', ch, -6, 6, sx * 11.0, (2.8, 6.3, 9.7), ww=1.0, wh=1.7, pitch=2.6, n=(sx, 0, 0))
door = bm_box2(-1.6, -7.15, 1.0, 1.6, -6.9, 4.4)
obj('customs_house_door', door, PAL['door_blue'], PT['boards'], parent=ch, family='landmark')
steps = bmesh.new()
for k in range(4):
    merge(steps, bm_box2(-3.4 + k * 0.3, -9.4 + k * 0.5, -0.4, 3.4 - k * 0.3, -7.0, 0.25 * (k + 1)))
obj('customs_house_steps', steps, PAL['granite_light'], PT['ashlar'], parent=ch, family='landmark', bevel=0.03)
fp_ = bm_cyl(0.12, 0.08, 9.0, 6, (9.5, -9.5, 0)); merge(fp_, bm_sphere(0.22, (9.5, -9.5, 9.1), 6, 4))
obj('customs_house_flagpole', fp_, PAL['trim'], PT['plain'], parent=ch, family='landmark')
collect_windows(ch, 'customs_house')
# the tide board: a big framed black board on two granite posts on the square, facing the bay.
# "tide_board" = the flat face the runtime draws 24 hourly bars on (UV 0..1, u = hour, v = up).
tbp = LM['tide_board']['p']
tb = make_root('tide_board_frame', tbp, zq, face_rz(LM['tide_board']['face']))
BW_, BH_, BZ_ = 18.0, 6.2, 2.4
for sx in (-1, 1):
    stone_block(f'tide_board_post{sx}', sx * (BW_ / 2 + 0.2) - 0.45, -0.45, -0.5, sx * (BW_ / 2 + 0.2) + 0.45, 0.45, BZ_ + BH_ + 0.8, 'granite_light', 'ashlar', tb)
frame = bmesh.new()
merge(frame, bm_box2(-BW_ / 2 - 0.3, -0.25, BZ_ - 0.35, BW_ / 2 + 0.3, 0.25, BZ_ - 0.05))
merge(frame, bm_box2(-BW_ / 2 - 0.3, -0.25, BZ_ + BH_ + 0.05, BW_ / 2 + 0.3, 0.25, BZ_ + BH_ + 0.4))
merge(frame, bm_box2(-BW_ / 2 - 0.3, -0.2, BZ_ - 0.05, -BW_ / 2, 0.2, BZ_ + BH_ + 0.05))
merge(frame, bm_box2(BW_ / 2, -0.2, BZ_ - 0.05, BW_ / 2 + 0.3, 0.2, BZ_ + BH_ + 0.05))
merge(frame, bm_box2(-BW_ / 2 - 0.1, -0.15, BZ_, BW_ / 2 + 0.1, 0.15, BZ_ + BH_))          # backing
merge(frame, bm_box2(-1.6, -0.3, BZ_ + BH_ + 0.4, 1.6, 0.2, BZ_ + BH_ + 1.25))            # name plate
obj('tide_board_framework', frame, face=lambda q: ((PAL['brass'], PT['metal']) if q.center.z > BZ_ + BH_ + 0.42 else (PAL['door_green'], PT['boards'])),
    parent=tb, family='landmark')
board = bmesh.new(); uvl = board.loops.layers.uv.new('UVMap')
vs = [board.verts.new(v) for v in ((-BW_ / 2, -0.17, BZ_), (BW_ / 2, -0.17, BZ_), (BW_ / 2, -0.17, BZ_ + BH_), (-BW_ / 2, -0.17, BZ_ + BH_))]
f = board.faces.new(vs)
for lp, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
    lp[uvl].uv = uv
bf = obj('tide_board', board, lin('#1E2A26'), PT['plain'], parent=tb, family='landmark', jitter=0.0, shadow=False)
NAMED['tide_board'] = bf
# a painted demo pattern for the key art (runtime replaces it): 24 bars, mint up / rust down around a mid line
demo = bmesh.new()
rngb = random.Random(24)
for k in range(24):
    x0 = -BW_ / 2 + 0.35 + k * (BW_ - 0.7) / 24; x1 = x0 + (BW_ - 0.7) / 24 * 0.66
    v = rngb.uniform(-1, 1) * (0.5 + 0.5 * math.sin(k / 3.5))
    z0, z1 = (BZ_ + BH_ / 2, BZ_ + BH_ / 2 + v * BH_ * 0.42) if v > 0 else (BZ_ + BH_ / 2 + v * BH_ * 0.42, BZ_ + BH_ / 2)
    merge(demo, bm_box2(x0, -0.22, z0, x1, -0.19, z1))
merge(demo, bm_box2(-BW_ / 2 + 0.2, -0.23, BZ_ + BH_ / 2 - 0.03, BW_ / 2 - 0.2, -0.2, BZ_ + BH_ / 2 + 0.03))
TIDE_DEMO = obj('tide_board_demo_bars', demo, face=lambda q: ((lin('#8FF0C4') if q.center.z > BZ_ + BH_ / 2 + 0.01 else lin('#F08A5A')) if q.area < 3 else PAL['trim'], PT['plain']),
                parent=tb, family='keyart', jitter=0.0, shadow=False)

# ---------------------------------------------------------------- Harbourmaster's office: lookout cupola + flag mast
hp_ = LM['harbourmaster']['p']
hm = make_root('harbourmaster', hp_, zq, face_rz(LM['harbourmaster']['face']))
stone_block('harbourmaster_body', -6.5, -6, -1.5, 6.5, 6, 7.6, 'wall_falu', 'boards', hm, bevel=0.04)
stone_block('harbourmaster_plinth', -6.7, -6.2, -1.5, 6.7, 6.2, 0.8, 'granite', 'ashlar', hm)
hip_roof('harbourmaster_roof', -6.5, -6, 6.5, 6, 7.6, 3.4, PAL['roof_slate'], PT['slate'], hm)
stone_block('harbourmaster_lookout', -2.2, -2.2, 10.2, 2.2, 2.2, 12.6, 'trim', 'boards', hm)
facade_windows('harbourmaster_look', hm, -2.0, 2.0, -2.25, (11.4,), ww=0.8, wh=1.4, pitch=1.3, lit_p=1.0)
facade_windows('harbourmaster_look_e', hm, -2.0, 2.0, 2.25, (11.4,), ww=0.8, wh=1.4, pitch=1.3, lit_p=1.0, n=(1, 0, 0))
hip_roof('harbourmaster_lookroof', -2.2, -2.2, 2.2, 2.2, 12.6, 1.8, PAL['roof_slate'], PT['slate'], hm, ov=0.35)
facade_windows('harbourmaster', hm, -6, 6, -6.0, (2.6, 5.6), ww=0.9, wh=1.4, pitch=2.3)
facade_windows('harbourmaster_e', hm, -5, 5, 6.5, (2.6, 5.6), ww=0.9, wh=1.4, pitch=2.5, n=(1, 0, 0))
mast = bm_cyl(0.14, 0.08, 14.0, 6, (5.0, -7.5, 0)); merge(mast, nl_kit.beam((5.0, -9.5, 11.0), (5.0, -5.5, 11.0), 0.1, 0.1))
obj('harbourmaster_mast', mast, PAL['trim'], PT['plain'], parent=hm, family='landmark')
obj('harbourmaster_door', bm_box2(-1.0, -6.12, 0.8, 1.0, -5.9, 3.2), PAL['door_green'], PT['boards'], parent=hm, family='landmark')
collect_windows(hm, 'harbourmaster')

# ---------------------------------------------------------------- the Registry: portico, pediment, clock (terrace 2)
rp = LM['registry']['p']
rg = make_root('registry', rp, LM['registry']['z'], face_rz(LM['registry']['face']))
stone_block('registry_body', -10, -6.5, -2.0, 10, 6.5, 9.6, 'granite_light', 'ashlar', rg)
stone_block('registry_cornice', -10.3, -6.8, 9.4, 10.3, 6.8, 10.1, 'stone_white', 'plain', rg)
hip_roof('registry_roof', -10.3, -6.8, 10.3, 6.8, 10.1, 3.6, PAL['roof_slate'], PT['slate'], rg)
port = bmesh.new()
merge(port, bm_box2(-6.0, -9.6, -0.4, 6.0, -6.4, 0.5))
merge(port, bm_box2(-6.3, -9.9, 7.6, 6.3, -6.4, 8.4))
for k in range(6):
    x = -5.0 + k * 2.0
    merge(port, bm_cyl(0.38, 0.32, 7.1, 10, (x, -8.8, 0.5)))
obj('registry_portico', port, PAL['stone_white'], PT['plain'], parent=rg, family='landmark', smooth=False)
ped = bmesh.new()
vs = [ped.verts.new(v) for v in ((-6.4, -10.0, 8.4), (6.4, -10.0, 8.4), (0, -10.0, 11.0), (-6.4, -6.4, 8.4), (6.4, -6.4, 8.4), (0, -6.4, 11.0))]
ped.faces.new((vs[0], vs[1], vs[2])); ped.faces.new((vs[0], vs[2], vs[5], vs[3])); ped.faces.new((vs[1], vs[4], vs[5], vs[2]))
obj('registry_pediment', ped, PAL['roof_slate'], PT['slate'], parent=rg, family='landmark')
ptri = bmesh.new()
vs = [ptri.verts.new(v) for v in ((-6.0, -10.02, 8.5), (6.0, -10.02, 8.5), (0, -10.02, 10.7))]
ptri.faces.new(vs)
obj('registry_tympanum', ptri, PAL['stone_white'], PT['plain'], parent=rg, family='landmark')
facade_windows('registry', rg, -9.5, 9.5, -6.5, (2.4, 6.0), ww=1.1, wh=2.2, pitch=2.4, skip=lambda i, z: 2 <= i <= 5 and z < 3)
facade_windows('registry_e', rg, -5.5, 5.5, 10.0, (2.4, 6.0), ww=1.1, wh=2.2, pitch=2.6, n=(1, 0, 0))
obj('registry_door', bm_box2(-1.3, -6.6, 0.5, 1.3, -6.4, 4.6), PAL['door_green'], PT['boards'], parent=rg, family='landmark')
cl = bm_cyl(0.95, 0.95, 0.2, 18, (0, 0, 0)); xf(cl, rx=math.pi / 2); xf(cl, loc=(0, -10.1, 9.4))
obj('registry_clock', cl, PAL['brass'], PT['metal'], parent=rg, family='landmark')
collect_windows(rg, 'registry')

# ---------------------------------------------------------------- Seamen's church: white nave + slate spire (terrace 3)
cp2 = LM['church']['p']
cr = make_root('church', cp2, LM['church']['z'], face_rz(LM['church']['face']))
stone_block('church_nave', -5.0, -9.0, -2.0, 5.0, 9.0, 7.0, 'stone_white', 'render', cr)
nave = bmesh.new()
vs = [nave.verts.new(v) for v in ((-5.6, -9.3, 7.0), (5.6, -9.3, 7.0), (0, -9.3, 12.2), (-5.6, 9.3, 7.0), (5.6, 9.3, 7.0), (0, 9.3, 12.2))]
nave.faces.new((vs[0], vs[2], vs[5], vs[3])); nave.faces.new((vs[1], vs[4], vs[5], vs[2]))
obj('church_roof', nave, PAL['roof_slate'], PT['slate'], parent=cr, family='landmark')
gab = bmesh.new()
vs = [gab.verts.new(v) for v in ((-5.0, -9.0, 7.0), (5.0, -9.0, 7.0), (0, -9.0, 11.6)) ]
gab.faces.new(vs)
obj('church_gable', gab, PAL['stone_white'], PT['render'], parent=cr, family='landmark')
stone_block('church_tower', -2.6, -13.6, -2.0, 2.6, -8.4, 14.0, 'stone_white', 'render', cr)
stone_block('church_belfry', -2.8, -13.8, 14.0, 2.8, -8.2, 15.0, 'granite_light', 'plain', cr)
sp = bm_cyl(2.9 / math.cos(math.pi / 8), 0.1, 9.5, 8, (0, -11.0, 15.0), rot=math.pi / 8)
obj('church_spire', sp, PAL['roof_slate'], PT['slate'], parent=cr, family='landmark')
cross = bm_box2(-0.08, -11.08, 24.4, 0.08, -10.92, 26.2); merge(cross, bm_box2(-0.55, -11.08, 25.4, 0.55, -10.92, 25.6))
obj('church_cross', cross, PAL['brass'], PT['metal'], parent=cr, family='landmark')
trim = bmesh.new(); glass = bmesh.new(); gl = []
for y in (-4.5, -0.5, 3.5):
    for sx in (-1, 1):
        add_window(trim, glass, Vector((sx * 5.0, y, 3.8)), Vector((0, 1, 0)), Vector((sx, 0, 0)), 0.9, 2.6, mull=True, rng=TRNG, lit_p=0.8, gl_list=gl)
add_window(trim, glass, Vector((0, -13.6, 11.5)), Vector((1, 0, 0)), Vector((0, -1, 0)), 1.0, 1.6, mull=False, rng=TRNG, lit_p=0.4, gl_list=gl)
add_window(trim, glass, Vector((2.6, -11.0, 11.5)), Vector((0, 1, 0)), Vector((1, 0, 0)), 1.0, 1.6, mull=False, rng=TRNG, lit_p=0.4, gl_list=gl)
obj('church_wtrim', trim, PAL['trim'], PT['plain'], parent=cr, family='landmark')
glass_obj('church_glass', glass, gl, cr, 'landmark')
obj('church_door', bm_box2(-1.0, -13.75, -0.2, 1.0, -13.5, 2.8), PAL['door_red'], PT['boards'], parent=cr, family='landmark')
collect_windows(cr, 'church')

# ---------------------------------------------------------------- bonded warehouse (basin): hoist gable
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

# ---------------------------------------------------------------- the Pharos (D8) + keeper's cottage + oil store (headland)
set_coll(collection('lighthouse', ROOTC))
lhp = LM['pharos']['p']
PHAROS_ROOT, LH_LAMP = build_lighthouse('pharos', (lhp[0], lhp[1], LM['pharos']['z']), rz=math.radians(-45))
PHAROS_SCALE = 1.15                     # ~33.5 m to the lantern top (brief: 30-34 m)
PHAROS_ROOT.scale = (PHAROS_SCALE,) * 3
LH_LAMP = Vector((lhp[0], lhp[1], LM['pharos']['z'])) + (LH_LAMP - Vector((lhp[0], lhp[1], LM['pharos']['z']))) * PHAROS_SCALE
kp = LM['keepers_cottage']['p']
KRZ = face_rz(LM['keepers_cottage']['face'])
kc = build_house('keepers_cottage', dict(w=10.0, d=6.4, floors=1, fh=3.0, base=0.6, ridge='x', pitch=44, wall=PAL['wall_white'],
                                          wall_pat='render', roof=PAL['roof_red'], roof_style='tiles', door='-y', win_pitch=2.4,
                                          flowers=True, door_col=PAL['door_green'], chimney=True, win_faces=['-y', '-x', '+x']),
                 (kp[0], kp[1], LM['keepers_cottage']['z']), KRZ, seed=41, family='lighthouse')
collect_windows(kc, 'keepers_cottage')
if 'chimney_top' in kc:
    CHIMNEYS.append(kc.matrix_world @ Vector(kc['chimney_top']))
op = LM['oil_store']['p']
build_oil_store('oil_store', (op[0], op[1], LM['oil_store']['z']), face_rz(LM['oil_store']['face']))
# keeper's garden (in the cottage's own frame): a low stone wall round the yard, a path to the tower door, a washing line
kz = LM['keepers_cottage']['z']
_kc, _ks = math.cos(KRZ), math.sin(KRZ)
K = lambda lx, ly: (kp[0] + lx * _kc - ly * _ks, kp[1] + lx * _ks + ly * _kc)
gw = bmesh.new()
for a_, b_ in (((-9, -7), (-9, 8)), ((-9, 8), (9, 8)), ((9, 8), (9, -7)), ((9, -7), (2, -7))):
    pa, pb = K(*a_), K(*b_)
    merge(gw, nl_kit.beam((pa[0], pa[1], H(*pa) + 0.4), (pb[0], pb[1], H(*pb) + 0.4), 0.6, 0.9))
obj('keeper_wall', gw, PAL['granite'], PT['ashlar'], family='lighthouse')
pth = bmesh.new()
door = (lhp[0] - 0.707 * 7.5, lhp[1] - 0.707 * 7.5)
for a_, b_ in ((K(0, -7.5), K(0, -12)), (K(0, -12), door)):
    n_ = max(1, int(math.hypot(b_[0] - a_[0], b_[1] - a_[1]) / 3))
    for k_ in range(n_):
        p_ = (a_[0] + (b_[0] - a_[0]) * k_ / n_, a_[1] + (b_[1] - a_[1]) * k_ / n_)
        q_ = (a_[0] + (b_[0] - a_[0]) * (k_ + 1) / n_, a_[1] + (b_[1] - a_[1]) * (k_ + 1) / n_)
        merge(pth, nl_kit.beam((p_[0], p_[1], H(*p_) + 0.06), (q_[0], q_[1], H(*q_) + 0.06), 1.8, 0.24))
obj('headland_path', pth, PAL['gravel'], PT['cobble'], family='lighthouse', jitter=0.02)
ln_ = bmesh.new(); cl_ = bmesh.new()
a3 = Vector((*K(3, 5), kz)); b3 = Vector((*K(8, 5), kz))
for p_ in (a3, b3):
    merge(ln_, nl_kit.line3(p_, p_ + Vector((0, 0, 2.3)), 0.06))
merge(ln_, nl_kit.line3(a3 + Vector((0, 0, 2.2)), b3 + Vector((0, 0, 2.2)), 0.02))
for k_ in range(4):
    c_ = a3.lerp(b3, 0.15 + k_ * 0.22) + Vector((0, 0, 1.55))
    merge(cl_, nl_kit.obox(c_, (b3 - a3).normalized(), 0.7, 0.04, 0.8))
obj('keeper_laundry_line', ln_, PAL['timber_dark'], PT['plain'], family='lighthouse')
obj('keeper_laundry', cl_, face=lambda q: ((PAL['trim'], PAL['brand_usdc'], PAL['hull_red'], PAL['wall_ochre'])[q.index // 5 % 4], 0), family='lighthouse')

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
for p in ((6.5, 0, 0.4), (-4.8, 4.8, 0.4), (-4.8, -4.8, 0.4)):
    merge(ln, nl_kit.line3((0, 0, 22.0), p, 0.035))
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

sl = CJ['slip']
_sd = (sl['bottom'][0] - sl['top'][0], sl['bottom'][1] - sl['top'][1])
sw = make_root('slipway', sl['top'], 0.0, face_rz(_sd))
NAMED['slipway'] = sw
L_ = math.hypot(*_sd)
ramp = bmesh.new()
merge(ramp, nl_kit.beam((0, 0, Z_SHORE + 0.02), (0, -L_, -1.6), sl['width'], 0.5))
obj('slipway_ramp', ramp, PAL['timber_dark'], PT['plain'], parent=sw, family='landmark', jitter=0.08)
rails = bmesh.new()
for sx in (-1.6, 1.6):
    merge(rails, nl_kit.beam((sx, 0, Z_SHORE + 0.3), (sx, -L_, -1.3), 0.25, 0.18))
obj('slipway_rails', rails, PAL['iron'], PT['metal'], parent=sw, family='landmark')
cradle = bmesh.new()
for k in range(3):
    y = -4 - k * 3.2
    z = Z_SHORE + 0.3 + y * (Z_SHORE + 1.6) / L_
    merge(cradle, bm_box2(-2.2, y - 0.3, z, 2.2, y + 0.3, z + 0.5))
    for sx in (-1.8, 1.8):
        merge(cradle, nl_kit.beam((sx, y, z + 0.4), (sx * 0.6, y, z + 1.6), 0.24, 0.24))
obj('slipway_cradle', cradle, PAL['timber'], PT['boards'], parent=sw, family='landmark')
winch = bm_box2(-1.2, 3.0, Z_SHORE, 1.2, 4.6, Z_SHORE + 1.4); merge(winch, bm_cyl(0.45, 0.45, 2.0, 10, (-1.0, 3.8, Z_SHORE + 1.5)))
obj('slipway_winch', winch, PAL['hull_red'], PT['metal'], parent=sw, family='landmark')

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
