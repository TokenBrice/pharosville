"""The Harbour v5 - the coast's rock (exec'd from hb_land, shares its namespace).

Two kinds of coast below the heightfield's rim:
  - the low skirt (coast_skirt): quay masonry, strands, and rocky shore under ~4 m - four faceted rows to the sea floor;
  - the crafted cliffs (style C strata, P5 art direction): wherever the rim stands >= CLIFF_MIN above the sea and the
    shore is neither quay nor strand. Faceted granite in horizontal sheets: each sheet a near-vertical face, the sheets
    stepping in and out round a gently battered mean (ledges where a sheet sits back, shadowed lips where one stands
    out), vertical joints and clefts, a dark wet tide band at the waterline, weathered pale ledge tops with lichen, a
    turf lip at the rim, boulders tumbled at the foot and on the ledges, grass tufts and sea-pinks on the ledges.
The waterline stays within ~1.3 m of the coast line (the runtime sea SDF draws its foam on that line).
"""
CLIFF_MIN = 3.2
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
    """Sheet boundaries (z) from the sea floor to the rim: a deep foot, the tide band, then 1.7-2.8 m sheets."""
    z = [SEA_FLOOR, -1.1, 0.35, 1.25]
    rr = random.Random(int(top * 10))
    while z[-1] < top - 1.2:
        z.append(z[-1] + rr.choice((1.7, 2.1, 2.4, 2.8, 1.9, 2.6)))
    z = [q for q in z if q < top - 0.7]
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
    # vertical joints: a blocky 1-D field along the run (buttresses out, clefts in)
    def joint(s):
        k = terrain.vnoise(s, seed * 3.1, 0.15, seed)
        blk = math.floor(k * 4.0) / 4.0 - 0.45
        cleft = -2.0 * max(0.0, (0.34 - terrain.vnoise(s, seed * 7.7, 0.31, seed + 5)) / 0.34)
        return 1.1 * blk + cleft
    # each sheet stands out here and sits back there along the run (blocky, 8-20 m stretches)
    def sheet(s, k):
        n_ = terrain.vnoise(s + k * 31.0, seed * 1.3 + k * 5.0, 0.07, seed + k)
        sg = 1.0 if n_ > 0.5 else -1.0
        return sg * (0.45 + 0.85 * terrain.vnoise(s, k * 3.3, 0.05, seed + 40 + k))
    # sheet profile per column: [(z, offset)] rings; top ring = the coast point at the rim (offset 0)
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
            dip = 0.45 * math.sin(s / 23.0 + k * 1.7) + 0.5 * (terrain.vnoise(s, k * 9.0, 0.09, seed + 70) - 0.5)
            if k > 0:
                z0 += dip
            if z1 < top:
                z1 += 0.45 * math.sin(s / 23.0 + (k + 1) * 1.7) + 0.5 * (terrain.vnoise(s, (k + 1) * 9.0, 0.09, seed + 70) - 0.5)
            mean = 1.25 * max(0.0, 1.0 - max(0.0, z0) / max(top, 1.0))     # battered: ~1.25 m out at the waterline
            o = mean + (sheet(s, k) if 1.0 < z0 < top - 1.0 else 0.25 * sheet(s, k))
            if z0 > 0.8:
                o += jt * min(1.0, (z0 - 0.8) / 2.0) * (0.0 if z1 >= top - 0.01 else 1.0)
            o = max(o, -1.1) if z1 < top - 0.01 else min(max(o, 0.15), 0.6)
            batter = _crng.uniform(0.1, 0.5)
            spec.append((z0, o + batter, k, 'b'))
            spec.append((z1 - (0.0 if z1 >= top - 0.01 else 0.12), o, k, 't'))
        spec.append((top, 0.0, nlev, 'r'))
        rings_spec.append(spec)
    # rings must have the same count per column: pad shorter columns by repeating their rim
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
                q = p + nr * (o + _crng.uniform(-0.18, 0.18)) + t * _crng.uniform(-0.3, 0.3)
                dz = _crng.uniform(-0.12, 0.12) if z > -1.0 else 0.0
            colv.append(bm.verts.new((q.x, q.y, z + dz)))
            if kind == 't' and 1.6 < z < top - 0.6 and j + 1 < len(sp) and sp[j + 1][1] < o - 0.2:
                ledges.append((p + nr * (o + sp[j + 1][1]) * 0.5, z, nr, t))        # a ledge: this sheet's top, set back above
            if kind == 'b' and k == 1:
                foot.append((p + nr * (o + 0.6), nr, t))
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
    # faces must look out to sea
    for f in bm.faces:
        c = f.calc_center_median()
        if point_in_poly(c.x + f.normal.x * 0.6, c.y + f.normal.y * 0.6, COAST) and f.normal.z < 0.5 and \
                not point_in_poly(c.x - f.normal.x * 0.6, c.y - f.normal.y * 0.6, COAST):
            f.normal_flip()
    return bm, ledges, foot


GRANITE = [lin('#9A9EA2'), lin('#A8A398'), lin('#8D9298'), lin('#B0AA9C'), lin('#858A90'), lin('#A0A2A2'), lin('#97928A')]
WEATHER, LICHEN, LICHEN_O, WET, WEED = lin('#D2CEC2'), lin('#CDB46A'), lin('#C8925A'), lin('#353A3F'), lin('#3B4535')


def cliff_face(q):
    c = q.center; nz = q.normal.z
    nn = noise.noise(Vector((c.x * 0.11, c.y * 0.11, c.z * 0.5)))
    n2 = noise.noise(Vector((c.x * 0.035, c.y * 0.035, 7.0)))
    if c.z < -0.6:
        return (WET, PT['rock'])
    if c.z < 0.55:                                             # the tide band: wet black rock, weed at its foot
        return ((WEED if c.z < 0.05 and nn > -0.1 else WET), PT['rock'])
    if c.z < 1.2:
        return (lin('#474C52') if nn > -0.2 else WET, PT['rock'])
    if nz > 0.5:                                               # ledge tops: weathered pale granite, lichen spots
        return ((LICHEN if nn > 0.38 else (LICHEN_O if nn < -0.5 else WEATHER)), PT['rock'])
    band = int((c.z + 0.6 * math.sin(c.x * 0.02 + c.y * 0.017)) / 2.2)
    base = GRANITE[(band * 3 + (1 if n2 > 0.1 else 0) + (2 if nn > 0.3 else 0)) % len(GRANITE)]
    up = max(0.0, min(1.0, (c.z - 2.0) / 14.0))                # higher sheets weather paler, lower ones stay dark
    base = tuple(base[i] * (0.88 + 0.22 * up) for i in range(3))
    if nz < -0.2:                                              # overhang undersides read dark
        base = tuple(x * 0.62 for x in base)
    elif nz > 0.25:
        base = tuple(base[i] * 0.6 + WEATHER[i] * 0.4 for i in range(3))
    return (base, PT['rock'])


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
    # the turf lip along the rim: a thin dark-green roll over the edge
    rp = _resample(run, 1.6, closed=False)
    for a, b in zip(rp, rp[1:]):
        za, zb = H(*a), H(*b)
        a3, b3 = Vector((a[0], a[1], za)), Vector((b[0], b[1], zb))
        t = (b3 - a3).normalized(); nr = Vector((t.y, -t.x, 0))
        if point_in_poly(*(Vector(a) + nr.xy * 2.0), COAST):
            nr = -nr
        v = [lip.verts.new(a3 + nr * 0.35 + Vector((0, 0, 0.06))), lip.verts.new(b3 + nr * 0.35 + Vector((0, 0, 0.06))),
             lip.verts.new(b3 + nr * 0.5 - Vector((0, 0, 0.45))), lip.verts.new(a3 + nr * 0.5 - Vector((0, 0, 0.45))),
             lip.verts.new(a3 - nr * 0.4 + Vector((0, 0, 0.02))), lip.verts.new(b3 - nr * 0.4 + Vector((0, 0, 0.02)))]
        lip.faces.new((v[4], v[5], v[1], v[0])); lip.faces.new((v[0], v[1], v[2], v[3]))
    # boulders tumbled at the foot (half drowned) and a few lodged on the ledges
    for k, (p, nr, t) in enumerate(foot):
        if _crng.random() < 0.34:
            r = _crng.uniform(0.7, 1.9)
            c = p + nr * (r * 0.55 + _crng.uniform(-0.2, 0.8)) + t * _crng.uniform(-0.6, 0.6)
            merge(boul, bm_ico(r, (c.x, c.y, _crng.uniform(-0.45, 0.25)), 1 if r > 1.25 else 0, (1.25, 1.0, 0.8), seed=k + ri * 97, amp=0.28))
            if _crng.random() < 0.4:
                c2 = c + t * r * 1.1 + nr * 0.4
                merge(boul, bm_ico(r * 0.55, (c2.x, c2.y, 0.0), 0, (1.2, 1.0, 0.8), seed=k + 7 + ri * 97, amp=0.3))
            _nf += 1
    for k, (p, z, nr, t) in enumerate(ledges):
        u_ = _crng.random()
        if u_ < 0.2:
            r = _crng.uniform(0.35, 0.75)
            merge(boul, bm_ico(r, (p.x, p.y, z + r * 0.45), 0, (1.2, 1.0, 0.75), seed=k + 300 + ri * 13, amp=0.3))
        elif u_ < 0.55:                                        # a tuft of thrift grass, sea-pinks on half of them
            for kk in range(2):
                q = p + t * _crng.uniform(-0.7, 0.7) + nr * _crng.uniform(-0.15, 0.2)
                r = _crng.uniform(0.28, 0.45)
                merge(tuft, bm_cyl(r, 0.04, r * 1.5, 5, (q.x, q.y, z - 0.05), cap=False, rot=_crng.uniform(0, 1.2)))
                if _crng.random() < 0.6:
                    merge(pink, bm_cyl(r * 0.55, 0.05, r * 0.5, 5, (q.x, q.y, z + r * 1.0), cap=False, rot=0.6))
            _nl += 1
obj('land_cliffs_strata', cl_bm, face=cliff_face, jitter=0.06, seed=31, family='terrain')
obj('land_cliffs_lip', lip, face=lambda q: ((PAL['grass_dark'] if q.normal.z < 0.6 else lin('#6F8A44')), PT['grass']), family='terrain', jitter=0.05)
obj('land_cliffs_boulders', boul, face=lambda q: ((WET if q.center.z < 0.35 else (WEATHER if q.normal.z > 0.55 else GRANITE[q.index % 3])), PT['rock']),
    family='terrain', jitter=0.08)
obj('veg_cliff_tufts', tuft, face=lambda q: ((lin('#6E8F45') if q.normal.z > 0.2 else lin('#55733A')), PT['leaf']), family='veg', jitter=0.1)
obj('veg_cliff_pinks', pink, face=lambda q: ((lin('#E08AAE') if q.index % 3 else lin('#F2B8CC')), PT['plain']), family='veg', jitter=0.06)
print('CLIFFS', len(_runs), 'runs', sum(len(r_) for r_ in _runs), 'cols', 'ledge tufts', _nl, 'foot boulders', _nf)
