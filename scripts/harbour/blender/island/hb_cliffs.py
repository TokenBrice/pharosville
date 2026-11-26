"""The Harbour v6 (Phase 3) - Warm Alexandrian Limestone sea cliffs & tabular karst strata outcrops.

Exec'd from hb_land, shares its namespace.
  - Low skirt (coast_skirt): quay masonry, strands, and rocky shore under CLIFF_MIN (2.8 m).
  - Crafted sea cliffs (style C strata): wherever the rim stands >= 2.8 m above the sea and the shore
    is neither quay nor strand. Warm layered Alexandrian limestone (#D4C7AC / #B8A786 / #9E8D70 / #786D5B),
    weathered pale ledges with ochre lichen (#B89F60), damp olive-slate tide band (#3B4038).
    Cold Nordic grey granite is retired completely.
  - Hard invariant: all cliff sheets and foot boulders stay <= 1.3 m seaward of COAST (outside quays,
    channels, beaches, and navigation gates).
  - strata_outcrop(): sculpted tabular karst limestone crags (2-4 stacked tilted faceted strata slabs
    + angular talus scree wedges buried cleanly into slopes) for hb_dress.py.
"""
CLIFF_MIN = 2.8
_crng = random.Random(23)


def _col_runs(poly, tops):
    """Index runs (closed ring) of columns that carry a strata cliff."""
    n = len(poly)
    tall = [tops[i] >= CLIFF_MIN and not on_quay(*poly[i], tol=1.2) and terrain.beach_k(*poly[i])[0] < 0.3 for i in range(n)]
    # close one-column gaps, drop slivers
    for i in range(n):
        if not tall[i] and tall[i - 1] and tall[(i + 1) % n]:
            tall[i] = True
    runs, i0 = [], None
    start = next((i for i in range(n) if not tall[i]), None)
    if start is None:
        return [list(range(n))]
    for k in range(1, n + 1):
        i = (start + k) % n
        if tall[i] and i0 is None:
            i0 = k
        if (not tall[i] or k == n) and i0 is not None:
            idx = [(start + j) % n for j in range(i0, k)]
            if len(idx) >= 4:
                runs.append(idx)
            i0 = None
    return runs


def _strata_levels(top):
    """Sheet boundaries (z) from the sea floor to the rim: deep foot, tide band, then 1.5-2.6 m limestone beds."""
    z = [SEA_FLOOR, -1.1, 0.35, 1.25]
    rr = random.Random(int(top * 10))
    while z[-1] < top - 1.1:
        z.append(z[-1] + rr.choice((1.5, 1.9, 2.2, 2.6, 1.7, 2.4)))
    z = [q for q in z if q < top - 0.65]
    return z + [top]


def strata_cliff(run_pts, seed):
    """One cliff run (world polyline along the coast, land on the left of travel). Returns (bmesh, ledge sites, foot sites)."""
    bm = bmesh.new()
    pts = _resample(run_pts, 1.6, closed=False)
    n = len(pts)
    S = [0.0]
    for a, b in zip(pts, pts[1:]):
        S.append(S[-1] + math.dist(a, b))
    cols = []
    for i, p in enumerate(pts):
        a = Vector(pts[max(0, i - 1)]); b = Vector(pts[min(n - 1, i + 1)])
        t = (b - a).normalized(); nr = Vector((t.y, -t.x))
        if point_in_poly(*(Vector(p) + nr * 2.0), COAST):
            nr = -nr                                   # nr points out to sea
        cols.append((Vector(p), t, nr, H(*p)))

    def joint(s):
        k = terrain.vnoise(s, seed * 3.1, 0.15, seed)
        blk = math.floor(k * 4.0) / 4.0 - 0.45
        cleft = -1.9 * max(0.0, (0.34 - terrain.vnoise(s, seed * 7.7, 0.31, seed + 5)) / 0.34)
        return 1.0 * blk + cleft

    def sheet(s, k):
        n_ = terrain.vnoise(s + k * 31.0, seed * 1.3 + k * 5.0, 0.07, seed + k)
        sg = 1.0 if n_ > 0.5 else -1.0
        return sg * (0.42 + 0.78 * terrain.vnoise(s, k * 3.3, 0.05, seed + 40 + k))

    zmax = max(c[3] for c in cols)
    levels = _strata_levels(zmax)
    nlev = len(levels)
    rings_spec = []
    for i, (p, t, nr, top) in enumerate(cols):
        s = S[i]
        jt = joint(s)
        spec = []
        for k in range(nlev - 1):
            z0 = levels[k]; z1 = levels[k + 1]
            if z0 >= top - 0.5:
                break
            z1 = min(z1, top)
            dip = 0.42 * math.sin(s / 23.0 + k * 1.7) + 0.45 * (terrain.vnoise(s, k * 9.0, 0.09, seed + 70) - 0.5)
            if k > 0:
                z0 += dip
            if z1 < top:
                z1 += 0.42 * math.sin(s / 23.0 + (k + 1) * 1.7) + 0.45 * (terrain.vnoise(s, (k + 1) * 9.0, 0.09, seed + 70) - 0.5)
            mean = 1.05 * max(0.0, 1.0 - max(0.0, z0) / max(top, 1.0))     # battered: <= 1.05 m mean at waterline
            o = mean + (sheet(s, k) if 1.0 < z0 < top - 1.0 else 0.22 * sheet(s, k))
            if z0 > 0.8:
                o += jt * min(1.0, (z0 - 0.8) / 2.0) * (0.0 if z1 >= top - 0.01 else 1.0)
            # Hard invariant: strictly <= 1.25 m seaward of COAST at every elevation
            o = max(min(o, 1.12), -1.1) if z1 < top - 0.01 else min(max(o, 0.12), 0.55)
            batter = min(_crng.uniform(0.08, 0.36), max(0.0, 1.22 - o))
            spec.append((z0, o + batter, k, 'b'))
            spec.append((z1 - (0.0 if z1 >= top - 0.01 else 0.12), o, k, 't'))
        spec.append((top, 0.0, nlev, 'r'))
        rings_spec.append(spec)
    m = max(len(sp) for sp in rings_spec)
    for sp in rings_spec:
        while len(sp) < m:
            sp.insert(len(sp) - 1, (sp[-1][0], sp[-1][1], sp[-1][2], 'r'))
    V = []
    ledges, foot = [], []
    for i, ((p, t, nr, top), sp) in enumerate(zip(cols, rings_spec)):
        colv = []
        for j, (z, o, k, kind) in enumerate(sp):
            if kind == 'r':
                q = p.copy(); dz = 0.0
            else:
                o_clamped = min(1.24, o + _crng.uniform(-0.14, 0.12))
                q = p + nr * o_clamped + t * _crng.uniform(-0.28, 0.28)
                dz = _crng.uniform(-0.10, 0.10) if z > -1.0 else 0.0
            colv.append(bm.verts.new((q.x, q.y, z + dz)))
            if kind == 't' and 1.6 < z < top - 0.6 and j + 1 < len(sp) and sp[j + 1][1] < o - 0.2:
                ledges.append((p + nr * (o + sp[j + 1][1]) * 0.5, z, nr, t))
            if kind == 'b' and k == 1:
                foot.append((p, nr, t, o))
        V.append(colv)
    for i in range(n - 1):
        a, b = V[i], V[i + 1]
        for j in range(m - 1):
            f = (a[j], b[j], b[j + 1], a[j + 1])
            if len(set(f)) < 4 or (a[j].co - a[j + 1].co).length + (b[j].co - b[j + 1].co).length < 0.05:
                continue
            try:
                bm.faces.new(f)
            except ValueError:
                pass
    bm.normal_update()
    for f in bm.faces:
        c = f.calc_center_median()
        if point_in_poly(c.x + f.normal.x * 0.6, c.y + f.normal.y * 0.6, COAST) and f.normal.z < 0.5 and \
                not point_in_poly(c.x - f.normal.x * 0.6, c.y - f.normal.y * 0.6, COAST):
            f.normal_flip()
    return bm, ledges, foot


# Warm Alexandrian limestone cliff strata (cold Nordic granite retired!)
GRANITE = [
    lin('#D4C7AC'), lin('#C6B696'), lin('#B8A786'), lin('#AE9D7D'),
    lin('#9E8D70'), lin('#C4B597'), lin('#8C7D65'),
]
WEATHER = lin('#DED3BC')      # sun-bleached pale Alexandrian limestone ledge top
LICHEN = lin('#B89F60')       # warm Mediterranean ochre lichen
LICHEN_O = lin('#C48E4E')     # amber-ochre crustose lichen
WET = lin('#3B4038')          # damp olive-slate tide band
WET_MID = lin('#565A4D')      # upper splash transition
WEED = lin('#384432')         # wet coastal algae foot


def cliff_face(q):
    c = q.center; nz = q.normal.z
    nn = noise.noise(Vector((c.x * 0.11, c.y * 0.11, c.z * 0.5)))
    n2 = noise.noise(Vector((c.x * 0.035, c.y * 0.035, 7.0)))
    if c.z < -0.6:
        return (WET, PT['rock'])
    if c.z < 0.55:                                             # damp olive-slate tide band
        return ((WEED if c.z < 0.05 and nn > -0.1 else WET), PT['rock'])
    if c.z < 1.25:
        return (WET_MID if nn > -0.2 else WET, PT['rock'])
    if nz > 0.52:                                              # ledge tops: pale weathered limestone + ochre lichen
        return ((LICHEN if nn > 0.36 else (LICHEN_O if nn < -0.52 else WEATHER)), PT['rock'])
    band = int((c.z + 0.6 * math.sin(c.x * 0.02 + c.y * 0.017)) / 2.0)
    base = GRANITE[(band * 3 + (1 if n2 > 0.1 else 0) + (2 if nn > 0.3 else 0)) % len(GRANITE)]
    up = max(0.0, min(1.0, (c.z - 2.0) / 14.0))                # higher limestone beds weather sun-bleached cream
    base = tuple(min(1.0, base[i] * (0.90 + 0.18 * up)) for i in range(3))
    if nz < -0.2:                                              # shadowed bedding overhangs (#786D5B tone)
        base = tuple(x * 0.64 for x in base)
    elif nz > 0.25:
        base = tuple(base[i] * 0.58 + WEATHER[i] * 0.42 for i in range(3))
    return (base, PT['rock'])


def strata_outcrop(bm, lich_bm, cx, cy, radius, yaw, seed, n_slabs=None):
    """Build a sculpted tabular karst limestone crag formation (2-4 stacked tilted strata slabs + angular talus wedges).

    All slabs and talus wedges bury their roots cleanly into the slope (-1.2 m) so nothing ever floats.
    """
    rng = random.Random(seed)
    n_slabs = n_slabs or rng.randint(2, 4)
    # Local downhill direction for natural talus spill and strata dip
    gx = (H(cx + 1.5, cy) - H(cx - 1.5, cy)) / 3.0
    gy = (H(cx, cy + 1.5) - H(cx, cy - 1.5)) / 3.0
    gl = math.hypot(gx, gy)
    dn = Vector((-gx / gl, -gy / gl)) if gl > 0.04 else Vector((math.cos(yaw), math.sin(yaw)))
    up_dir = -dn
    side = Vector((-dn.y, dn.x))

    # Ground base anchored to lowest rim sample so slab bottom never exposes air
    z_foot = min(H(cx + dx, cy + dy) for dx, dy in ((0, 0), (radius, 0), (-radius, 0), (0, radius), (0, -radius)))
    z_mid = H(cx, cy)
    z_cur = z_foot

    dip_rx = rng.uniform(0.06, 0.16) * (1 if rng.random() < 0.5 else -1)
    dip_ry = rng.uniform(0.05, 0.14) * (1 if rng.random() < 0.5 else -1)

    for s in range(n_slabs):
        frac = 1.0 - s * (0.20 + rng.uniform(0.0, 0.05))
        r_a = radius * frac * rng.uniform(0.95, 1.20)
        r_b = radius * frac * rng.uniform(0.68, 0.90)
        h_slab = rng.uniform(0.65, 1.15) * (1.0 - 0.12 * s)
        # Step successive beds slightly upslope (natural terraced karst outcrop)
        off = up_dir * (s * radius * 0.16) + side * rng.uniform(-radius * 0.14, radius * 0.14)
        scx, scy = cx + off.x, cy + off.y
        z_bot = min(z_foot - 1.1, H(scx, scy) - 1.1)
        z_top = max(z_cur + h_slab, H(scx, scy) + h_slab * (0.55 + 0.32 * s))
        # Hard height cap: keep all landscape rock crags <= 4.2 m above local grade
        z_top = min(z_top, z_mid + 3.8)
        z_cur = z_top

        ns = rng.choice((7, 8, 9))
        a0 = yaw + rng.uniform(-0.22, 0.22)
        base_ring, mid_ring, top_ring = [], [], []
        sb = bmesh.new()
        for k in range(ns):
            ang = a0 + 2.0 * math.pi * k / ns + rng.uniform(-0.14, 0.14)
            # Angular blocky facets (not round potatoes)
            rk = 0.78 + 0.36 * ((k * 3 + s * 5) % 4) / 3.0 + rng.uniform(-0.08, 0.08)
            lx = math.cos(ang) * r_a * rk
            ly = math.sin(ang) * r_b * rk
            # Slight bedding dip tilt across the slab top
            dz_dip = lx * math.sin(dip_rx) + ly * math.sin(dip_ry)
            ca_, sa_ = math.cos(yaw), math.sin(yaw)
            wx = lx * ca_ - ly * sa_
            wy = lx * sa_ + ly * ca_
            z_sh = z_top - min(0.24, h_slab * 0.28) + dz_dip
            base_ring.append(sb.verts.new((scx + wx * 1.06, scy + wy * 1.06, z_bot)))
            mid_ring.append(sb.verts.new((scx + wx, scy + wy, z_sh)))
            top_ring.append(sb.verts.new((scx + wx * 0.86, scy + wy * 0.86, z_top + dz_dip)))
        for k in range(ns):
            j = (k + 1) % ns
            sb.faces.new((base_ring[k], base_ring[j], mid_ring[j], mid_ring[k]))
            sb.faces.new((mid_ring[k], mid_ring[j], top_ring[j], top_ring[k]))
        sb.faces.new(top_ring)
        bmesh.ops.recalc_face_normals(sb, faces=sb.faces)
        merge(bm, sb)

        # Thin weathered ochre lichen crust on the top slab ledge
        if s == n_slabs - 1 and lich_bm is not None and rng.random() < 0.72:
            lr = r_b * 0.42
            merge(lich_bm, bm_ico(lr, (scx, scy, z_top + 0.03), 0, (1.25, 0.9, 0.14), seed=seed + 17 + s, amp=0.18))

    # 2-3 angular talus scree wedges tumbled on the downhill apron
    for tk in range(rng.randint(2, 3)):
        dist = radius * rng.uniform(0.95, 1.65)
        lat = radius * rng.uniform(-0.75, 0.75)
        tx = cx + dn.x * dist + side.x * lat
        ty = cy + dn.y * dist + side.y * lat
        if not point_in_poly(tx, ty, COAST) or terrain.pad_at(tx, ty, 3.0) is not None:
            continue
        tz = H(tx, ty)
        tr = rng.uniform(0.45, 0.95) * min(1.2, radius / 2.2)
        th = tr * rng.uniform(0.42, 0.68)
        tb = bmesh.new()
        na = 5
        a_t = rng.uniform(0.0, 6.28)
        lo_v, hi_v = [], []
        for k in range(na):
            ang = a_t + 2.0 * math.pi * k / na + rng.uniform(-0.2, 0.2)
            rr_ = tr * rng.uniform(0.75, 1.18)
            lo_v.append(tb.verts.new((tx + math.cos(ang) * rr_ * 1.15, ty + math.sin(ang) * rr_ * 1.15, tz - 0.45)))
            hi_v.append(tb.verts.new((tx + math.cos(ang) * rr_ * 0.72, ty + math.sin(ang) * rr_ * 0.72, tz + th * rng.uniform(0.7, 1.1))))
        for k in range(na):
            j = (k + 1) % na
            tb.faces.new((lo_v[k], lo_v[j], hi_v[j], hi_v[k]))
        tb.faces.new(hi_v)
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces)
        merge(bm, tb)


def strata_outcrop_face(q):
    """Warm Alexandrian limestone face coloring for tabular karst crags & scree wedges."""
    c = q.center; nz = q.normal.z
    nn = noise.noise(Vector((c.x * 0.16, c.y * 0.16, c.z * 0.55)))
    if nz > 0.62:
        if nn > 0.42:
            return (LICHEN, PT['rock'])
        return ((WEATHER if nn > -0.1 else lin('#CFC1A4')), PT['rock'])
    if nz < -0.15:
        return (lin('#786D5B'), PT['rock'])
    band = int((c.z + 0.4 * nn) / 0.85) % len(GRANITE)
    return (GRANITE[band], PT['rock'])


def reef_outcrop(bm, cx, cy, radius, z_top, yaw, seed, n_slabs=2, z_bot=-3.0):
    """Sculpted stratified Alexandrian ochre limestone reef outcrop extending cleanly down to z_bot (-3.0 m).

    Replaces faceted bm_ico lumps on the Shoals reef, Wreck Cove rocks, and breakwater rubble so underwater
    refraction + caustics reveal terraced limestone beds plunging into the seabed.
    """
    rng = random.Random(seed)
    ca_, sa_ = math.cos(yaw), math.sin(yaw)
    dip_x = rng.uniform(0.06, 0.15) * (1 if rng.random() < 0.5 else -1)
    dip_y = rng.uniform(0.05, 0.13) * (1 if rng.random() < 0.5 else -1)
    # Build n_slabs tiered limestone beds: broadest shelf rooted at z_bot (-3.0 m), upper beds stepped & bevelled
    for s in range(n_slabs):
        frac = 1.0 - s * (0.24 + rng.uniform(0.0, 0.05))
        r_a = radius * frac * rng.uniform(1.05, 1.28)
        r_b = radius * frac * rng.uniform(0.76, 0.96)
        ox = rng.uniform(-radius * 0.14, radius * 0.14) * s
        oy = rng.uniform(-radius * 0.14, radius * 0.14) * s
        scx, scy = cx + ox * ca_ - oy * sa_, cy + ox * sa_ + oy * ca_
        slab_bot = z_bot if s == 0 else max(z_bot + 0.6, z_top - (n_slabs - s) * 0.78 - 0.55)
        slab_top = z_top - (n_slabs - 1 - s) * rng.uniform(0.32, 0.55)
        if slab_top <= slab_bot + 0.25:
            slab_top = slab_bot + 0.35
        bevel_h = min(0.22, (slab_top - slab_bot) * 0.25)
        ns = rng.choice((6, 7))
        a0 = yaw + s * 0.35 + rng.uniform(-0.2, 0.2)
        base_r, mid_r, top_r = [], [], []
        sb = bmesh.new()
        for k in range(ns):
            ang = a0 + 2.0 * math.pi * k / ns + rng.uniform(-0.14, 0.14)
            rk = 0.78 + 0.34 * ((k * 3 + s * 5) % 4) / 3.0 + rng.uniform(-0.06, 0.06)
            lx = math.cos(ang) * r_a * rk
            ly = math.sin(ang) * r_b * rk
            wx = lx * ca_ - ly * sa_
            wy = lx * sa_ + ly * ca_
            dz_dip = lx * math.sin(dip_x) + ly * math.sin(dip_y)
            foot_expand = 1.24 if s == 0 else 1.06
            base_r.append(sb.verts.new((scx + wx * foot_expand, scy + wy * foot_expand, slab_bot)))
            mid_r.append(sb.verts.new((scx + wx, scy + wy, slab_top - bevel_h + dz_dip)))
            top_r.append(sb.verts.new((scx + wx * 0.84, scy + wy * 0.84, slab_top + dz_dip)))
        for k in range(ns):
            j = (k + 1) % ns
            sb.faces.new((base_r[k], base_r[j], mid_r[j], mid_r[k]))
            sb.faces.new((mid_r[k], mid_r[j], top_r[j], top_r[k]))
        sb.faces.new(top_r)
        bmesh.ops.recalc_face_normals(sb, faces=sb.faces)
        merge(bm, sb)


def reef_rock_face(q):
    """Stratified Alexandrian ochre limestone coloring for intertidal & submerged reef outcrops."""
    c = q.center; nz = q.normal.z
    nn = noise.noise(Vector((c.x * 0.18, c.y * 0.18, c.z * 0.55)))
    if c.z < -0.35:
        return ((lin('#6E6B58') if nz > 0.45 else WET), PT['rock'])
    if c.z < 0.40:
        return ((WEED if c.z < 0.08 and nn > -0.05 else WET), PT['rock'])
    if c.z < 0.82:
        return ((WET_MID if nn > -0.15 else GRANITE[4]), PT['rock'])
    if nz > 0.56:
        if nn > 0.40:
            return (LICHEN, PT['rock'])
        return ((WEATHER if nn > -0.12 else GRANITE[1]), PT['rock'])
    band = int((c.z + 0.35 * nn) / 0.65) % len(GRANITE)
    return (GRANITE[band], PT['rock'])


_sk_poly = _resample(COAST, 3.0)
_sk_tops = [H(x, y) for x, y in _sk_poly]
_runs = _col_runs(_sk_poly, _sk_tops)
_skip = set()
for r_ in _runs:
    _skip.update(r_[1:-1])                                    # the skirt keeps the run's end columns (the seams overlap)
coast_skirt('land_cliffs', _sk_poly, lambda x, y: H(x, y), on_quay, skip=_skip)

cl_bm, boul, tuft, pink, lip = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
_nl = _nf = 0
for ri, r_ in enumerate(_runs):
    run = [_sk_poly[i] for i in r_]
    b_, ledges, foot = strata_cliff(run, 11 + ri)
    merge(cl_bm, b_)
    # the turf lip along the rim: a thin sage-olive roll over the limestone edge
    rp = _resample(run, 1.6, closed=False)
    for a, b in zip(rp, rp[1:]):
        za, zb = H(*a), H(*b)
        a3, b3 = Vector((a[0], a[1], za)), Vector((b[0], b[1], zb))
        t = (b3 - a3).normalized(); nr = Vector((t.y, -t.x, 0))
        if point_in_poly(*(Vector(a) + nr.xy * 2.0), COAST):
            nr = -nr
        v = [
            lip.verts.new(a3 + nr * 0.35 + Vector((0, 0, 0.06))), lip.verts.new(b3 + nr * 0.35 + Vector((0, 0, 0.06))),
            lip.verts.new(b3 + nr * 0.5 - Vector((0, 0, 0.45))), lip.verts.new(a3 + nr * 0.5 - Vector((0, 0, 0.45))),
            lip.verts.new(a3 - nr * 0.4 + Vector((0, 0, 0.02))), lip.verts.new(b3 - nr * 0.4 + Vector((0, 0, 0.02))),
        ]
        lip.faces.new((v[4], v[5], v[1], v[0])); lip.faces.new((v[0], v[1], v[2], v[3]))
    # Foot boulders: strictly <= 1.25 m seaward of COAST and clear of quays
    for k, (p, nr, t, o_foot) in enumerate(foot):
        if _crng.random() < 0.34 and not on_quay(p.x, p.y, tol=4.5):
            r = _crng.uniform(0.55, 1.05)
            sea_off = min(1.25 - r * 0.8, max(0.25, o_foot * 0.55))
            c = p + nr * sea_off + t * _crng.uniform(-0.5, 0.5)
            merge(boul, bm_ico(r, (c.x, c.y, _crng.uniform(-0.35, 0.22)), 0, (1.15, 0.95, 0.78), seed=k + ri * 97, amp=0.26))
            if _crng.random() < 0.35:
                r2 = r * 0.62
                c2 = p + nr * min(1.22 - r2 * 0.8, sea_off + 0.15) + t * (r * 1.05)
                merge(boul, bm_ico(r2, (c2.x, c2.y, -0.05), 0, (1.1, 0.95, 0.75), seed=k + 7 + ri * 97, amp=0.28))
            _nf += 1
    for k, (p, z, nr, t) in enumerate(ledges):
        u_ = _crng.random()
        if u_ < 0.22:
            r = _crng.uniform(0.32, 0.68)
            merge(boul, bm_ico(r, (p.x, p.y, z + r * 0.42), 0, (1.15, 0.95, 0.72), seed=k + 300 + ri * 13, amp=0.28))
        elif u_ < 0.55:
            for kk in range(2):
                q = p + t * _crng.uniform(-0.7, 0.7) + nr * _crng.uniform(-0.15, 0.2)
                r = _crng.uniform(0.28, 0.45)
                merge(tuft, bm_cyl(r, 0.04, r * 1.5, 5, (q.x, q.y, z - 0.05), cap=False, rot=_crng.uniform(0, 1.2)))
                if _crng.random() < 0.6:
                    merge(pink, bm_cyl(r * 0.55, 0.05, r * 0.5, 5, (q.x, q.y, z + r * 1.0), cap=False, rot=0.6))
            _nl += 1

obj('land_cliffs_strata', cl_bm, face=cliff_face, jitter=0.06, seed=31, family='terrain')
obj('land_cliffs_lip', lip, face=lambda q: ((PAL['grass_dark'] if q.normal.z < 0.6 else lin('#6F8A44')), PT['grass']), family='terrain', jitter=0.05)
obj('land_cliffs_boulders', boul, face=lambda q: ((WET if q.center.z < 0.35 else (WEATHER if q.normal.z > 0.55 else GRANITE[q.index % len(GRANITE)])), PT['rock']),
    family='terrain', jitter=0.08)
obj('veg_cliff_tufts', tuft, face=lambda q: ((lin('#6E8F45') if q.normal.z > 0.2 else lin('#55733A')), PT['leaf']), family='veg', jitter=0.1)
obj('veg_cliff_pinks', pink, face=lambda q: ((lin('#E08AAE') if q.index % 3 else lin('#F2B8CC')), PT['plain']), family='veg', jitter=0.06)
print('CLIFFS', len(_runs), 'runs', sum(len(r_) for r_ in _runs), 'cols', 'ledge tufts', _nl, 'foot boulders', _nf)
