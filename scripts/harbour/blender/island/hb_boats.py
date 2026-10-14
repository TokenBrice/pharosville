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


def proto(rig, cls, state, variant):
    key = (rig, cls, state, variant)
    if key in _protos:
        return _protos[key]
    rng = random.Random(sum(map(ord, str(key))))
    bname, emb = BRANDS[variant % len(BRANDS)]
    brand = PAL[bname]
    hk = ('stain' if rig == 'brig' else 'tar' if rig == 'botter' else
          ['white', 'blue', 'red', 'green', 'white', 'black'][variant % 6] if rig != 'ship' else ('black' if variant % 2 == 0 else 'white'))
    hc = dict(HULLS[hk]); hc['stripe'] = brand if hk != 'stain' else PAL['gilt']
    hc.setdefault('boot', brand if rig in ('cat', 'ship') else PAL['hull_white'])
    cloth = PAL['tanbark'] if rig == 'botter' else (PAL['lug_ochre'] if rig == 'lugger' else None)
    coll = bpy.data.collections.new(f'p_{rig}_{cls}_{state}_{variant}')
    PROTO_C.children.link(coll)
    prev = cur_coll(); set_coll(coll)
    L_ = nl_kit.CLASS_LOA[cls] if cls in nl_kit.CLASS_LOA else 5.0
    root, info = build_boat(f'b_{rig}_{cls}_{state}_{variant}', rig, cls, brand, state, math.radians(10) if state == 'sailing' else 0.0,
                            1, emb, hc, cloth=cloth, loc=(0, 0, 0), heading=0.0, seed=variant)
    if info['tops']:
        t = max(info['tops'], key=lambda v: v.z)
        obj(root.name + '_riding', bm_sphere(0.16, (t.x, t.y, t.z + 0.32), 8, 5), mat=M['riding'], parent=info['heel_root'], shadow=False)
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
LN = {n['id']: (n['position'][0], -n['position'][2]) for n in CJ_LAYOUT['lanes']['nodes']}
EDG = [(e['from'], e['to']) for e in CJ_LAYOUT['lanes']['edges'] if not e['from'].startswith('gate') and not e['to'].startswith('gate')]
UNDERWAY = [('L-e3', 'L-e4', 0.5, 'medium'), ('L-e4', 'M-out', 0.55, 'large'), ('M-in', 'L-ne', 0.4, 'small'), ('L-n1', 'L-n2', 0.35, 'medium'),
            ('L-n2', 'L-n3', 0.6, 'small'), ('L-w1', 'L-w2', 0.5, 'small'), ('L-w3', 'L-w4', 0.3, 'boat'), ('L-s1', 'L-s2', 0.4, 'medium'),
            ('L-se', 'L-e1', 0.6, 'small'), ('L-e1', 'L-e2', 0.45, 'boat'), ('Q-1', 'Q-2', 0.4, 'medium'), ('Q-3', 'Q-4', 0.5, 'small'),
            ('C-1' if 'C-1' in LN else 'C-0', 'C-solana' if 'C-solana' in LN else 'C-w', 0.5, 'small'), ('C-r2', 'C-r3', 0.4, 'boat'),
            ('C-r3', 'C-r4', 0.6, 'medium'), ('O-1' if 'O-1' in LN else 'N-1', 'N-1' if 'N-1' in LN else 'N-2', 0.5, 'large'),
            ('N-1', 'N-2', 0.5, 'medium'), ('N-3', 'N-4', 0.5, 'small'), ('N-5', 'F-gate', 0.4, 'boat'), ('N-7', 'N-8', 0.5, 'medium'),
            ('Q-6', 'Q-7', 0.5, 'small'), ('Q-5', 'Q-6', 0.4, 'boat'), ('L-sw', 'L-s1', 0.5, 'boat'), ('M-in', 'L-ne', 0.75, 'large'),
            ('C-r1', 'C-r2', 0.5, 'small'), ('N-9', 'N-10', 0.5, 'small'), ('X-1' if 'X-1' in LN else 'Q-2', 'Q-3', 0.5, 'boat')]
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
        place(coll, s, math.pi / 2)
        BOAT_CONTACT.append(waterline(s, (0, 1), pcls))
print('BOATS docked', DOCKED, 'sailing', SAILING, 'prototypes', len(_protos))
