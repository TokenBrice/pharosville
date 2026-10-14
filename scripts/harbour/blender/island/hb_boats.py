"""The Harbour v2 - key-art fleet (NOT exported): style C hulls (nl_kit.build_boat) instanced as collections at a
representative occupancy: docked on fingers / alongside, swinging moorings (bows into the wind), ~27 under way
on the lanes, the Shoals (heeling on the reef), Wreck Cove hulks, the Far Ports rafts."""
BRNG = random.Random(625)
OCC_J = json.load(open(os.path.join(OUTD, 'occupancy.json')))['occupancy']
PROTO_C = bpy.data.collections.new('boat_protos')          # not linked to the scene
BOAT_CONTACT = []
WAKES = []
_protos = {}

BRANDS = [('brand_usdt', 0), ('brand_usdc', 1), ('brand_dai', 2), ('brand_red', 5), ('brand_violet', 6), ('brand_eur', 3),
          ('brand_gold', 4), ('door_green', 0), ('hull_blue', 1), ('wall_ochre', 2)]
HULLS = {
    'black': dict(top=PAL['hull_black'], band=PAL['hull_white'], rail=PAL['hull_black'], deck_in=PAL['hull_white'], transom=PAL['hull_black'], house=PAL['timber']),
    'white': dict(top=PAL['hull_white'], band=PAL['hull_white'], rail=PAL['timber'], deck_in=PAL['hull_white'], transom=PAL['hull_white'], house=PAL['timber']),
    'blue': dict(top=PAL['hull_blue'], band=PAL['hull_blue'], rail=PAL['timber'], deck_in=PAL['hull_white'], transom=PAL['timber'], house=PAL['hull_white']),
    'red': dict(top=PAL['hull_red'], band=PAL['hull_red'], rail=PAL['timber'], deck_in=PAL['hull_white'], transom=PAL['timber'], house=PAL['hull_white']),
    'green': dict(top=PAL['hull_green'], band=PAL['hull_green'], rail=PAL['timber'], deck_in=PAL['hull_white'], transom=PAL['timber'], house=PAL['hull_white']),
    'tar': dict(top=PAL['tar'], band=PAL['tar'], rail=PAL['hull_green'], boot=PAL['tar'], bottom=PAL['tar'], deck_in=PAL['hull_green'], transom=PAL['tar'], house=PAL['timber']),
    'stain': dict(top=PAL['hull_stain'], band=PAL['hull_stain'], rail=PAL['gilt'], boot=PAL['gilt'], deck_in=PAL['hull_stain'], transom=PAL['gilt'], house=PAL['hull_stain']),
}


def rig_for(cls, fam):
    if fam == 'eur':
        return 'botter', ('medium' if cls in ('large', 'flagship') else cls)
    if fam == 'gold':
        return ('brig', 'large') if cls in ('large', 'flagship') else ('sloop' if cls != 'skiff' else 'cat', cls)
    if fam == 'fiat':
        return 'lugger', cls if cls not in ('flagship',) else 'large'
    return {'flagship': 'ship', 'large': 'schooner', 'medium': 'sloop', 'small': 'sloop', 'boat': 'sloop', 'skiff': 'cat'}[cls], cls


def family_pick(rng):
    r = rng.random()
    return 'usd' if r < 0.78 else ('fiat' if r < 0.90 else ('eur' if r < 0.955 else ('gold' if r < 0.975 else 'usd')))


KIT_RAW = os.path.join(ROOT, 'outputs/harbour/hulls/raw')          # the kit GLBs before meshopt (Blender cannot decode it)
KIT_MAN = json.load(open(os.path.join(ROOT, 'public/harbour/kit/manifest.json')))
KIT_IDS = {h['id'] for h in KIT_MAN['hulls']}
EMB = json.load(open(os.path.join(ROOT, 'public/harbour/emblems.json')))
_EMB_IMG = {}
FAM_OF_RIG = {'botter': 'eur', 'brig': 'gold', 'lugger': 'fiat'}


def kit_id(fam, cls):
    tbl = {'usd': {'skiff': 'usd_cat_skiff', 'boat': 'usd_sloop_boat', 'small': 'usd_sloop_small', 'medium': 'usd_cutter_medium',
                   'large': 'usd_schooner_large', 'flagship': 'usd_ship_flagship'},
           'eur': {'boat': 'eur_botter_boat', 'small': 'eur_botter_small', 'medium': 'eur_botter_medium', 'large': 'eur_botter_large'},
           'gold': {'medium': 'gold_brig_medium', 'large': 'gold_brig_large', 'flagship': 'gold_brig_large'},
           'fiat': {'boat': 'fiat_lugger_boat', 'small': 'fiat_lugger_small', 'medium': 'fiat_lugger_medium'},
           'other': {'skiff': 'other_work_skiff', 'boat': 'other_work_boat', 'small': 'other_work_small'}}
    hid = tbl.get(fam, {}).get(cls) or tbl['usd'][cls]
    return hid if hid in KIT_IDS else None


def emblem_mat(slot):
    """hb_sail: cloth colour (COLOR_0) with the emblem atlas slot mapped into UV1's unit square."""
    key = 'M_kitsail_%d' % slot
    if key in M:
        return M[key]
    if 'img' not in _EMB_IMG:
        p = os.path.join(ROOT, 'public/harbour/emblems.png')
        _EMB_IMG['img'] = bpy.data.images.load(p, check_existing=True) if os.path.exists(p) else None
    m = new_mat(key); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    at = node(nt, 'ShaderNodeAttribute', attribute_name='Col')
    col = at.outputs['Color']
    img = _EMB_IMG['img']
    if img is not None:
        uv1 = node(nt, 'ShaderNodeUVMap'); uv1.uv_map = 'UVMap.001'
        u, v, _ = sep(nt, uv1.outputs['UV'])
        cols_ = EMB['cols']; sz = EMB['slot']; W_, H_ = EMB['width'], EMB['height']
        cx, cy = slot % cols_, slot // cols_
        inside = u.sstep(-0.001, 0.0) * (1.0 - u.sstep(1.0, 1.001)) * v.sstep(-0.001, 0.0) * (1.0 - v.sstep(1.0, 1.001))
        au = (u.clamp() + cx) * (sz / W_)
        av = 1.0 - (cy + 1.0 - v.clamp()) * (sz / H_)
        tex = node(nt, 'ShaderNodeTexImage', interpolation='Linear', extension='EXTEND'); tex.image = img
        link(nt, comb(nt, au, av, 0.0), tex.inputs['Vector'])
        a_ = SX(nt, tex.outputs['Alpha']) * inside
        col = mixc(nt, a_, col, tex.outputs['Color'])
    link(nt, col, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.85
    m.use_backface_culling = False
    M[key] = m
    return m


def kit_proto(hid, state, variant, brand, slot):
    key = ('kit', hid, state, variant)
    if key in _protos:
        return _protos[key]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(KIT_RAW, f'hull_{hid}.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    coll = bpy.data.collections.new(f'k_{hid}_{state}_{variant}')
    PROTO_C.children.link(coll)
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
        if o.type == 'MESH':
            me = o.data
            ca = me.color_attributes.get('Color') or (me.color_attributes[0] if len(me.color_attributes) else None)
            mat0 = me.materials[0].name if me.materials else ''
            if ca is not None:
                ca.name = 'Col'
            if ca is not None and ca.data_type == 'FLOAT_COLOR' and ca.domain == 'CORNER':
                buf = np.zeros(len(me.loops) * 4, np.float32); ca.data.foreach_get('color', buf); buf = buf.reshape(-1, 4)
                br_ = me.attributes.get('_BRAND') or me.attributes.get('_brand')
                if br_ is not None:
                    w = np.zeros(len(br_.data), np.float32); br_.data.foreach_get('value', w)
                    if br_.domain == 'POINT':
                        vi = np.zeros(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', vi); w = w[vi]
                    if len(w) == len(buf):
                        buf[w > 0.5, :3] = brand
                if mat0.startswith('hb_cover'):
                    buf[:, :3] *= np.array(brand, np.float32)
                ca.data.foreach_set('color', buf.ravel())
            if mat0.startswith('hb_sail'):
                me.materials[0] = emblem_mat(slot)
            elif mat0.startswith(('hb_opaque', 'hb_cover')) or not mat0:
                me.materials.clear(); me.materials.append(M['kit'])
            if me.shape_keys:
                for kb in me.shape_keys.key_blocks:
                    if kb.name == 'furl':
                        kb.value = 1.0 if state == 'docked' else 0.0
    # sailing pose (manifest): starboard tack - booms out to port, heel to port
    if state == 'sailing':
        for o in new:
            nm = o.name.split('.')[0]
            if nm in ('boom', 'boom_2'):
                o.rotation_mode = 'XYZ'; o.rotation_euler.z -= 0.55
            if nm == '_heel':
                o.rotation_mode = 'XYZ'; o.rotation_euler.x -= 0.14
    # riding light at the masthead empty
    for o in new:
        if o.name.split('.')[0] == 'masthead_light':
            ml = bpy.data.objects.new('riding', bpy.data.meshes.new('riding'))
            bmr = bm_sphere(0.16, (0, 0, 0.1), 8, 5); bmr.to_mesh(ml.data); bmr.free()
            ml.data.materials.append(M['riding']); ml.parent = o; coll.objects.link(ml)
    _protos[key] = (coll, {'tops': []})
    return _protos[key]


def proto(rig, cls, state, variant):
    fam = FAM_OF_RIG.get(rig, 'usd')
    if rig in ('sloop', 'cat') and variant % 7 == 3:
        fam = 'other'
    bname, emb = BRANDS[variant % len(BRANDS)]
    hid = kit_id(fam, cls)
    if hid is not None and os.path.isdir(KIT_RAW):
        ids = list(EMB.get('ids', {}).values()) or [0]
        return kit_proto(hid, state, variant, PAL[bname], ids[(variant * 37 + len(hid)) % len(ids)])
    key = (rig, cls, state, variant)
    if key in _protos:
        return _protos[key]
    brand = PAL[bname]
    hk = ('stain' if rig == 'brig' else 'tar' if rig == 'botter' else
          ['white', 'blue', 'red', 'green', 'white', 'black'][variant % 6] if rig != 'ship' else ('black' if variant % 2 == 0 else 'white'))
    hc = dict(HULLS[hk]); hc['stripe'] = brand if hk != 'stain' else PAL['gilt']
    hc.setdefault('boot', brand if rig in ('cat', 'ship') else PAL['hull_white'])
    cloth = PAL['tanbark'] if rig == 'botter' else (PAL['lug_ochre'] if rig == 'lugger' else None)
    coll = bpy.data.collections.new(f'p_{rig}_{cls}_{state}_{variant}')
    PROTO_C.children.link(coll)
    prev = cur_coll(); set_coll(coll)
    root, info = build_boat(f'b_{rig}_{cls}_{state}_{variant}', rig, cls, brand, state, math.radians(10) if state == 'sailing' else 0.0,
                            1, emb, hc, cloth=cloth, loc=(0, 0, 0), heading=0.0, seed=variant)
    set_coll(prev)
    _protos[key] = (coll, info)
    return _protos[key]


def place(coll, p, heading, z=0.0, tilt=(0.0, 0.0)):
    e = bpy.data.objects.new('boat', None)
    e.instance_type = 'COLLECTION'; e.instance_collection = coll
    e.location = (p[0], p[1], z); e.rotation_euler = (tilt[0], tilt[1], heading)
    ROOTC.objects.link(e)
    return e


def waterline(p, d, cls, k=0.92):
    L_, B_ = CJ['hull']['loa'][cls], CJ['hull']['beam'][cls]
    n = (-d[1], d[0])
    out = []
    for i in range(17):
        u = -1 + 2 * i / 16
        w = B_ / 2 * (max(0.0, 1 - u ** 2.2) ** 0.5 if u >= 0 else 1 - 0.4 * u * u) * k
        out.append((p[0] + d[0] * u * L_ / 2 + n[0] * w, p[1] + d[1] * u * L_ / 2 + n[1] * w))
    for i in range(16, -1, -1):
        u = -1 + 2 * i / 16
        w = B_ / 2 * (max(0.0, 1 - u ** 2.2) ** 0.5 if u >= 0 else 1 - 0.4 * u * u) * k
        out.append((p[0] + d[0] * u * L_ / 2 - n[0] * w, p[1] + d[1] * u * L_ / 2 - n[1] * w))
    return out


DOCKED = 0
# ---------------------------------------------------------------- berths: occupancy = expected / berths per pier + class
by_pc = {}
for b in CJ['berths']:
    by_pc.setdefault((b['pid'], b['cls']), []).append(b)
for m_ in CJ['moorings']:
    by_pc.setdefault((m_['pid'], m_['cls'] + '_m'), []).append(m_)
for (pid, ck), items in by_pc.items():
    cls = ck.replace('_m', '')
    E = OCC_J[pid][cls]['expected']
    frac = min(1.0, E / max(1, len(items)) * 1.02)
    for idx, it in enumerate(items):
        forced = cls == 'flagship' and ((pid == 'pier-tron') or (pid == 'pier-ethereum' and idx == 1))
        if cls == 'flagship' and not forced:
            continue
        if not forced and BRNG.random() > frac:
            continue
        fam = family_pick(BRNG)
        rig, pcls = rig_for(cls, fam)
        if cls == 'flagship':
            variant = 0 if 'tron' in pid else 1          # USDT-like under the Pharos, USDC-like on the Grand Quay
            rig, pcls = 'ship', 'flagship'
        else:
            variant = BRNG.randrange(10)
        coll, info = proto(rig, pcls, 'docked', variant)
        if ck.endswith('_m'):
            # swinging moorings: bows into the wind, each boat yawing a little about its buoy
            yaw = BRNG.uniform(-0.2, 0.2)
            b_ = it['buoy']; d0 = Vector((it['d'][0], it['d'][1], 0)); d0.rotate(Matrix.Rotation(yaw, 3, 'Z'))
            L_ = CJ['hull']['loa'][pcls]
            c = (b_[0] - d0.x * (L_ / 2 + 1.2), b_[1] - d0.y * (L_ / 2 + 1.2)); d = (d0.x, d0.y)
        else:
            c, d = it['pos'], it['d']
        place(coll, c, math.atan2(d[1], d[0]))
        BOAT_CONTACT.append(waterline(c, d, pcls))
        DOCKED += 1

# ---------------------------------------------------------------- under way: on the lanes (sails set, heeling, wakes)
LN = {k: tuple(p) for k, p in CJ['lanes']['nodes'].items()}
EDG = [tuple(e) for e in CJ['lanes']['edges'] if not e[0].startswith('gate') and not e[1].startswith('gate')]
# under way: hand-picked lane legs (the heart frame gets the lagoon loop + two departures out of the mouth toward the horizon)
UNDERWAY = [('L-m', 'L-t1', 0.5, 'medium'), ('L-t2', 'L-w1', 0.4, 'small'), ('L-w2', 'L-w3', 0.6, 'boat'), ('L-s1', 'L-s2', 0.3, 'medium'),
            ('L-s3', 'L-s4', 0.6, 'small'), ('L-e1', 'L-e2', 0.5, 'large'), ('L-v1', 'L-v2', 0.55, 'small'), ('L-v3', 'L-c1', 0.5, 'medium'),
            ('L-c2', 'L-c3', 0.4, 'large'), ('L-c3', 'M-out', 0.7, 'medium'), ('M-out', 'O-1', 0.25, 'small'), ('O-9', 'M-in', 0.6, 'medium'),
            ('O-1', 'O-2', 0.4, 'large'), ('O-2', 'O-3', 0.5, 'small'), ('O-3', 'FP-gate', 0.5, 'boat'), ('O-4', 'O-5', 0.4, 'medium'),
            ('O-5', 'C-0', 0.6, 'small'), ('C-0', 'C-hyperliquid-l1', 0.5, 'boat'), ('C-bsc', 'C-solana', 0.5, 'medium'),
            ('C-base', 'C-arbitrum', 0.4, 'small'), ('C-polygon', 'C-w', 0.5, 'boat'), ('O-6', 'SH-gate', 0.5, 'small'),
            ('SH-gate', 'O-7', 0.5, 'medium'), ('O-7', 'O-8', 0.5, 'small'), ('O-8', 'O-9', 0.5, 'boat'), ('L-w1', 'L-w2', 0.5, 'medium'),
            ('L-s2', 'L-s3', 0.5, 'boat')]
SAILING = 0
WIND = Vector((CJ['wind_bow'][0], CJ['wind_bow'][1], 0)).normalized()     # bows of moored boats point INTO the wind
for (a, b, t, cls) in UNDERWAY:
    if a not in LN or b not in LN:
        continue
    pa, pb = Vector((*LN[a], 0.0)), Vector((*LN[b], 0.0))
    p = pa.lerp(pb, t)
    d = (pb - pa).normalized()
    fam = family_pick(BRNG)
    rig, pcls = rig_for(cls, fam)
    tack = 1 if (d.x * WIND.y - d.y * WIND.x) > 0 else -1
    variant = BRNG.randrange(10) if cls != 'flagship' else 1
    coll, info = proto(rig, pcls, 'sailing', variant * 2 + (0 if tack > 0 else 1))
    e = place(coll, (p.x, p.y), math.atan2(d.y, d.x))
    L_ = CJ['hull']['loa'][pcls]
    back = -d
    st = p + back * L_ * 0.5; bw = p - back * L_ * 0.48
    for sgn in (-1, 1):
        arm = back.copy(); arm.rotate(Matrix.Rotation(sgn * math.radians(19.5), 3, 'Z'))
        WAKES.append((tuple(st[:2]), tuple((st + arm * L_ * 1.6)[:2]), 0.15, 0.6, 0.7))
        arm2 = back.copy(); arm2.rotate(Matrix.Rotation(sgn * math.radians(32), 3, 'Z'))
        WAKES.append((tuple(bw[:2]), tuple((bw + arm2 * L_ * 0.55)[:2]), 0.15, 0.4, 0.7))
    WAKES.append((tuple(st[:2]), tuple((st + back * L_ * 1.1)[:2]), 0.45, 1.2, 0.6))
    SAILING += 1

# ---------------------------------------------------------------- the Shoals: depegged boats heeling on the reef
for i, p in enumerate(CJ['shoals']['slots'][:21]):
    cls = ('medium', 'medium', 'small', 'small', 'small', 'boat', 'boat')[i % 7]
    rig, pcls = rig_for(cls, family_pick(BRNG))
    coll, info = proto(rig, pcls, 'docked', BRNG.randrange(10))
    place(coll, p, BRNG.uniform(0, 6.28), z=-0.15, tilt=(math.radians(BRNG.uniform(-16, 16)), math.radians(BRNG.uniform(-5, 5))))
    BOAT_CONTACT.append(waterline(p, (1, 0), pcls, 0.7))

# ---------------------------------------------------------------- Wreck Cove: grey hulks beached in the bight
hulk = bmesh.new()
for i, (p, a) in enumerate(CJ['wreck']['slots'][:22]):
    L_ = (18.0, 13.0, 10.0, 7.5)[i % 4]
    P_ = dict(br=0.3, fb=0.11, dr=0.06, bow=2.2, stern=0.6, sheer=(0.3, 0.15), bulwark=0.2)
    hb_, names, D_ = nl_kit.hull_mesh(L_, P_, {}, n=8)
    # broken: drop the deck faces, open the stern
    bmesh.ops.delete(hb_, geom=[f for f in hb_.faces if f.normal.z > 0.8 and f.calc_center_median().z > 0.1], context='FACES')
    xf(hb_, rx=math.radians(BRNG.uniform(-22, 22)), rz=a)
    z = H(*p) if globals().get('H') and point_in_poly(p[0], p[1], COAST) else -0.4
    xf(hb_, loc=(p[0], p[1], max(-0.6, min(z, 1.5)) - 0.3))
    merge(hulk, hb_)
obj('wreck_hulks', hulk, face=lambda q: ((lin('#6E6A64') if q.normal.z > -0.2 else lin('#4E4A46')), PT['strakes']), family='keyart', jitter=0.12)

# ---------------------------------------------------------------- Far Ports: boats moored on the rafts (expected fraction)
for row in CJ['far']['rows']:
    cls = row['cls']
    E = OCC_J['far'][cls]['expected']; nslots = OCC_J['far'][cls]['berths']
    for s in row['slots']:
        if BRNG.random() > E / max(1, nslots):
            continue
        rig, pcls = rig_for(cls, family_pick(BRNG))
        coll, info = proto(rig, pcls, 'docked', BRNG.randrange(10))
        rd = CJ['far']['row_dir']; ax_ = (-rd[1], rd[0])
        place(coll, s, math.atan2(ax_[1], ax_[0]))
        BOAT_CONTACT.append(waterline(s, ax_, pcls))
print('BOATS docked', DOCKED, 'sailing', SAILING, 'prototypes', len(_protos))
