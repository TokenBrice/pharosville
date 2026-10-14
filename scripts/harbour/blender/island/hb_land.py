"""The Harbour v3 - land: terrain heightfield, coast cliffs + curved quay walls, aprons, the amphitheatre's contour
terraces (curved retaining walls, lanes, stairs), plank-deck piers at any heading, the breakwater.
exec'd into build_island's namespace (shares CJ, M, PAL, PT, helpers)."""

SEA_FLOOR = -4.0
Q = CJ['consts']
Z_SHORE, DECK = Q['Z_SHORE'], Q['DECK']
COAST = [tuple(p) for p in CJ['coast']]
QL = {q['name']: [tuple(p) for p in q['line']] for q in CJ['quays']}
PILES = []          # (x, y, r) pile contact for the SDF B channel
STRUCT_POLYS = []   # structure footprints for the SDF
set_coll(collection('land', ROOTC))
import terrain
from scipy.spatial import Delaunay
from geom import along, polyline_len, catmull
terrain.init(COAST, QL, CJ.get('beaches'))
SAND, SHINGLE, PEBBLE, WETSAND = lin('#D3BF96'), lin('#A49E90'), lin('#AFA593'), lin('#9E8D6E')
TOWN = CJ['town']
CTW = Vector(TOWN['ct'])                 # amphitheatre centre (world)
CT_UV = tuple(TOWN['ct_uv'])
RINGS = TOWN['rings']; TOWN_TH = TOWN['th']


def H(x, y):
    return terrain.height(x, y)


def ground_z(x, y):
    return H(x, y) if point_in_poly(x, y, COAST) else -9.0


def uvp(x, y):
    return terrain.to_uv(x, y)


def wpt(u, v):
    return terrain.from_uv(u, v)


def town_pt(th_deg, r):
    a = math.radians(th_deg)
    return wpt(CT_UV[0] + math.cos(a) * r, CT_UV[1] + math.sin(a) * r)


def seg_d(p, a, b):
    ab = (b[0] - a[0], b[1] - a[1]); t = max(0.0, min(1.0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 + 1e-9)))
    return math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t)


def on_quay(x, y, tol=0.7):
    for L in QL.values():
        for a, b in zip(L, L[1:]):
            if seg_d((x, y), a, b) < tol:
                return True
    return False


def _resample(poly, step, closed=True):
    out = []
    n = len(poly)
    rng_ = range(n) if closed else range(n - 1)
    for i in rng_:
        a = Vector(poly[i]); b = Vector(poly[(i + 1) % n])
        L = (b - a).length; k = max(1, int(L / step))
        for j in range(k):
            out.append(tuple(a.lerp(b, j / k)))
    if not closed:
        out.append(tuple(poly[-1]))
    return out


def ribbon(bm, pts, width, lift=0.12, skirt=0.55):
    """A strip draped ON the heightfield: both edges sampled at the ground (so it follows cross-slope too), with a
    short skirt down each edge; never a slab bridging a hollow or standing proud on a slope."""
    if len(pts) < 2:
        return
    L_, R_, Ls, Rs = [], [], [], []
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]; b = pts[min(len(pts) - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]; tl = math.hypot(tx, ty) or 1.0
        nx_, ny_ = -ty / tl * width / 2, tx / tl * width / 2
        l_ = (p[0] + nx_, p[1] + ny_); r_ = (p[0] - nx_, p[1] - ny_)
        zl, zr, zc = H(*l_), H(*r_), H(*p)
        zt = max(zl, zr, zc)
        # on a steep flank the coarse ground mesh departs from H between its vertices: lift the strip with the slope
        g = math.hypot(H(p[0] + 1.0, p[1]) - zc, H(p[0], p[1] + 1.0) - zc)
        lf = lift + min(0.7, 0.55 * g)
        L_.append(bm.verts.new((l_[0], l_[1], (zl + zc) / 2 + lf if zt - min(zl, zr) < 0.6 else zl + lf)))
        R_.append(bm.verts.new((r_[0], r_[1], (zr + zc) / 2 + lf if zt - min(zl, zr) < 0.6 else zr + lf)))
        Ls.append(bm.verts.new((l_[0], l_[1], zl - skirt - 0.6 * g)))
        Rs.append(bm.verts.new((r_[0], r_[1], zr - skirt - 0.6 * g)))
    for i in range(len(pts) - 1):
        bm.faces.new((L_[i], R_[i], R_[i + 1], L_[i + 1]))
        bm.faces.new((Ls[i], L_[i], L_[i + 1], Ls[i + 1]))
        bm.faces.new((R_[i], Rs[i], Rs[i + 1], R_[i + 1]))


# ------------------------------------------------------------------ heightfield
def build_heightfield():
    from PIL import Image, ImageDraw
    from scipy import ndimage
    ring = _resample(COAST, 3.0)
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    X0, X1, Y0, Y1 = min(xs) - 2, max(xs) + 2, min(ys) - 2, max(ys) + 2
    S = 1.0
    W_, H_ = int((X1 - X0) / S) + 1, int((Y1 - Y0) / S) + 1
    im = Image.new('L', (W_, H_), 0)
    ImageDraw.Draw(im).polygon([((x - X0) / S, (Y1 - y) / S) for x, y in COAST], fill=255)
    mask = np.array(im) > 127
    dist = ndimage.distance_transform_edt(mask) * S
    inside = lambda x, y: 0 <= int((Y1 - y) / S) < H_ and 0 <= int((x - X0) / S) < W_ and mask[int((Y1 - y) / S), int((x - X0) / S)]
    dcoast = lambda x, y: dist[int((Y1 - y) / S), int((x - X0) / S)]
    rng = random.Random(77)
    pts = list(ring)
    step = 5.0
    y = Y0
    while y < Y1:
        x = X0
        while x < X1:
            px, py = x + rng.uniform(-1.7, 1.7), y + rng.uniform(-1.7, 1.7)
            if inside(px, py) and dcoast(px, py) > 2.2:
                pts.append((px, py))
            x += step
        y += step * 0.866
    # finer facets on the Pharos headland (the hero's ground) and the town bowl
    for (cu, cv, ru, rv, st) in ((terrain.PHAROS[0] - 16, terrain.PHAROS[1] - 4, 60, 34, 3.2), (CT_UV[0], CT_UV[1] + 60, 150, 90, 3.6)):
        v = cv - rv
        while v < cv + rv:
            u = cu - ru
            while u < cu + ru:
                px, py = wpt(u + rng.uniform(-0.8, 0.8), v + rng.uniform(-0.8, 0.8))
                if inside(px, py) and dcoast(px, py) > 1.6:
                    pts.append((px, py))
                u += st
            v += st * 0.866
    # terrace fronts: rows of points hugging both sides of each retaining wall arc (a clean vertical band)
    for k in range(1, len(RINGS)):
        r0 = RINGS[k][0]
        th0, th1 = TOWN_TH[k]
        for rr in (r0 - 1.4, r0 - 0.35, r0 + 0.35):
            n = int(math.radians(th0 - th1 + 16) * rr / 2.2)
            for i in range(n + 1):
                th = th1 - 8 + (th0 - th1 + 16) * i / n
                p = town_pt(th, rr)
                if inside(*p):
                    pts.append(p)
    # quay aprons: a row just inland of every quay line so the apron stays flat to its edge
    for L in QL.values():
        for p in _resample(L, 3.0, closed=False):
            pass
    P = np.array(pts)
    tri = Delaunay(P)
    bm = bmesh.new()
    vs = [bm.verts.new((p[0], p[1], H(p[0], p[1]))) for p in pts]
    for t in tri.simplices:
        c = P[t].mean(axis=0)
        if not inside(c[0], c[1]):
            continue
        # no slivers bridging a bay (a Delaunay edge across water whose centroid happens to fall on land)
        q3 = P[t]
        if max(np.hypot(*(q3[0] - q3[1])), np.hypot(*(q3[1] - q3[2])), np.hypot(*(q3[2] - q3[0]))) > 14.0:
            continue
        try:
            bm.faces.new([vs[i] for i in t])
        except ValueError:
            continue
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return bm


def hf_face(q):
    c = q.center; nz = q.normal.z
    u, v = uvp(c.x, c.y)
    nn = terrain.fbm(c.x, c.y, 0.02, 2, 11)
    if nz < 0.34:                                   # only the steepest ground shows granite; the flanks stay turf
        return ((PAL['rock'] if nn > 0.5 else lin('#8A8B86')), PT['rock'])
    if nz < 0.72:
        return ((lin('#7A7F72') if nn > 0.66 else PAL['grass_dark']), PT['rock'] if nn > 0.66 else PT['grass'])
    kb, kind = terrain.beach_k(c.x, c.y)
    if kb > 0.45:                                                                # the strands: sand / shingle / pebbles
        dc = terrain.dcoast(c.x, c.y)
        if kind == 'sand':
            col = SHINGLE if dc < 3.5 else (SAND if dc < 42 else lin('#B9B07A'))
        else:
            col = PEBBLE if dc < 7.5 else lin('#A6A77A')
        return (jitter_col(col, 0.95 + 0.1 * nn), PT['plain'])
    fl = terrain.field_at(c.x, c.y)
    if fl is not None:
        fc = lin(terrain.FIELD_COL[fl['kind']])
        stripe = int((u * 0.9 + v * 0.3) / 2.6) % 2 if fl['kind'] in ('plough', 'hay') else 0
        return (jitter_col(fc, 0.93 if stripe else 1.03), PT['grass'] if fl['kind'] != 'plough' else PT['plain'])
    base = PAL['grass']
    hd = math.hypot((u - terrain.PHAROS[0] + 16) / 50.0, (v - terrain.PHAROS[1] + 4) / 28.0)
    if hd < 1.1:
        base = lin('#7E9150')                                                    # wind-cropped headland turf
    elif c.z > 17 or terrain.line_d(u, v, terrain.WEST_SPINE) < 24 or terrain.line_d(u, v, terrain.EAST_SPINE) < 24:
        base = lin('#667F41')                                                    # forest floor under the spruce
    n2 = terrain.fbm(c.x, c.y, 0.006, 3, 5)
    t = max(0.0, min(1.0, (n2 - 0.38) / 0.26))
    lo, hi = jitter_col(base, 0.9), jitter_col(base, 1.1)
    return (tuple(lo[i] + (hi[i] - lo[i]) * t for i in range(3)), PT['grass'])


HF = obj('land_terrain', build_heightfield(), face=hf_face, jitter=0.0, seed=4, family='terrain', smooth=True)


class _VQ:          # a vertex dressed as a face for hf_face (centre + normal)
    __slots__ = ('center', 'normal')


def _terrain_paint(me):
    """Smooth-shaded ground with a painterly per-vertex colour: hf_face's ground type at each vertex (the pattern id
    stays per face), broken up by low-frequency dry-grass / moss / heather drifts and a darker damp foot to slopes."""
    me.calc_normals_split() if hasattr(me, 'calc_normals_split') else None
    vcol = np.zeros((len(me.vertices), 3), np.float32)
    dry, moss, heath_ = lin('#B2A866'), lin('#5D7A3C'), lin('#8A7090')
    q = _VQ()
    for v in me.vertices:
        q.center = v.co; q.normal = v.normal
        c, _pt = hf_face(q)
        c = Vector(c[:3])
        x, y = v.co.x, v.co.y
        n1 = terrain.fbm(x, y, 0.016, 3, 31)          # meadow drifts (tens of metres)
        n2 = terrain.fbm(x, y, 0.07, 2, 37)           # patches (a few metres)
        if v.normal.z > 0.72:
            k_dry = max(0.0, min(1.0, (n1 - 0.55) / 0.12)) * 0.42
            k_moss = max(0.0, min(1.0, (0.42 - n1) / 0.1)) * 0.35
            c = c.lerp(dry, k_dry).lerp(moss, k_moss)
            u_, v_ = uvp(x, y)
            hd = math.hypot((u_ - terrain.PHAROS[0] + 16) / 50.0, (v_ - terrain.PHAROS[1] + 4) / 28.0)
            if hd < 1.15 and n2 > 0.58:
                c = c.lerp(heath_, 0.35 * min(1.0, (n2 - 0.58) / 0.1))      # heather on the headland
            c = c * (0.92 + 0.16 * n2)
        vcol[v.index] = (c.x, c.y, c.z)
    attr = me.color_attributes['Col']
    buf = np.zeros(len(me.loops) * 4, np.float32)
    attr.data.foreach_get('color', buf)
    buf = buf.reshape(-1, 4)
    li = np.zeros(len(me.loops), np.int64)
    me.loops.foreach_get('vertex_index', li)
    buf[:, :3] = vcol[li]
    attr.data.foreach_set('color', buf.ravel())


_terrain_paint(HF.data)


def coast_skirt(name, poly, ztop, straight, rows=4, amp=1.3, seed=1, jag=0.8, skip=()):
    """Rock strata from the sea floor up to the heightfield rim (style C cliff), vertical masonry on quay lines."""
    bm = bmesh.new(); n = len(poly); rings = []
    tops = [ztop(x, y) for x, y in poly]
    for r in range(rows + 1):
        f = r / rows
        ring = []
        for i, (x, y) in enumerate(poly):
            z = SEA_FLOOR + (tops[i] - SEA_FLOOR) * f
            if straight(x, y) or r == rows or terrain.beach_k(x, y)[0] > 0.4:
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
                q = Vector((x, y)) + nr * k
                dz = noise.noise(Vector((x * 0.2, y * 0.2, seed))) * 0.3 if 0 < r < rows else 0.0
            ring.append(bm.verts.new((q.x, q.y, z + dz)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            if i in skip:
                continue
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.normal_update()

    def fc(q):
        c = q.center
        if straight(c.x, c.y):
            return ((PAL['rock_wet'] if c.z < 0.4 else PAL['quay_dark']), PT['ashlar'])
        kb_, kind_ = terrain.beach_k(c.x, c.y)
        if kb_ > 0.4:                       # the strand runs on under the water
            return ((WETSAND if kind_ == 'sand' else SHINGLE), PT['plain'])
        return cliff_face(q)                # the rock shares the strata cliffs' granite (hb_cliffs)
    return obj(name, bm, face=fc, jitter=0.07, seed=seed, family='terrain')


exec(open(os.path.join(HERE_, 'hb_cliffs.py')).read())          # the coast: low rocky skirt + crafted granite strata cliffs

# ------------------------------------------------------------------ the amphitheatre: curved retaining walls + coping + ivy
set_coll(collection('town', ROOTC))
tw_ = bmesh.new(); tc_ = bmesh.new(); ivy = bmesh.new(); ivyf = bmesh.new()
irng = random.Random(88)
WALL_ARCS = []          # (band, th list) for the dresser (lamps along the lanes)
for k in range(1, len(RINGS)):
    r0, r1, z = RINGS[k]
    zb = RINGS[k - 1][2]
    th0, th1 = TOWN_TH[k]
    th0 += 4.0; th1 -= 4.0
    n = max(4, int(math.radians(th0 - th1) * r0 / 3.0))
    ths = [th0 - (th0 - th1) * i / n for i in range(n + 1)]
    WALL_ARCS.append((k, ths))
    for a_, b_ in zip(ths, ths[1:]):
        pa, pb = town_pt(a_, r0 - 0.45), town_pt(b_, r0 - 0.45)
        merge(tw_, nl_kit.beam((pa[0], pa[1], (zb - 0.8 + z + 0.05) / 2), (pb[0], pb[1], (zb - 0.8 + z + 0.05) / 2), 1.0, z + 0.85 - zb))
        ca, cb = town_pt(a_, r0 - 0.4), town_pt(b_, r0 - 0.4)
        merge(tc_, nl_kit.beam((ca[0], ca[1], z + 0.25), (cb[0], cb[1], z + 0.25), 1.35, 0.4))
    for th in (th0, th1):
        p = town_pt(th, r0 - 0.5)
        merge(tw_, bm_box(2.0, 2.0, z + 0.3 - zb + 0.8, (p[0], p[1], zb - 0.8 + (z + 0.3 - zb + 0.8) / 2)))
    # ivy + valerian tumbling over the walls (A graft)
    th = th0 - irng.uniform(1, 4)
    while th > th1 + 2:
        w_ = irng.uniform(2.5, 6.0); h_ = (z - zb) * irng.uniform(0.45, 0.95)
        p = town_pt(th, r0 - 1.0)
        tn = Vector(town_pt(th - 1, r0)) - Vector(town_pt(th + 1, r0)); ang = math.atan2(tn.y, tn.x)
        b = bm_ico(1.0, (0, 0, 0), 1, (w_ / 2, 0.36, h_ / 2), seed=irng.randint(0, 999), amp=0.18)
        p = town_pt(th, r0 - 0.75)                   # hugging the wall face (never a dark spike standing off it)
        xf(b, rz=ang); xf(b, loc=(p[0], p[1], z - h_ / 2 + 0.15))
        merge(ivy, b)
        if irng.random() < 0.45:
            for kk in range(3):
                q = town_pt(th + irng.uniform(-1.2, 1.2), r0 - 1.5)
                merge(ivyf, bm_ico(0.32, (q[0], q[1], z - irng.uniform(0.3, h_)), 0, seed=kk))
        th -= math.degrees((w_ + irng.uniform(3.0, 14.0)) / r0)
obj('terrace_walls', tw_, PAL['granite'], PT['ashlar'], family='quay', bevel=0.04)
obj('terrace_coping', tc_, PAL['granite_light'], PT['plain'], family='quay', bevel=0.04)
obj('terrace_ivy', ivy, face=lambda q: ((lin('#6E9046') if q.normal.z > 0.2 else lin('#587C3C')), PT['leaf']), family='veg', jitter=0.1)
obj('terrace_ivy_flowers', ivyf, face=lambda q: ((PAL['flower_p'], PAL['flower_w'], PAL['rowan_berry'])[q.index // 20 % 3], 0), family='veg')

# lanes along each terrace (gravel), stairs between the bands, the squares
lanes_bm = bmesh.new(); steps = bmesh.new()
LANES = []              # world polylines (for lamps/folk)
for k in range(1, len(RINGS)):
    r0, r1, z = RINGS[k]
    th0, th1 = TOWN_TH[k]
    n = max(4, int(math.radians(th0 - th1) * r0 / 3.0))
    pts = [town_pt(th0 - (th0 - th1) * i / n, r0 + 1.8) for i in range(n + 1)]
    LANES.append((k, pts, z))
    for a_, b_ in zip(pts, pts[1:]):
        merge(lanes_bm, nl_kit.beam((a_[0], a_[1], z + 0.04), (b_[0], b_[1], z + 0.04), 3.2, 0.24))
obj('town_lanes', lanes_bm, PAL['gravel'], PT['cobble'], family='town', jitter=0.03)
STAIRS = []
for (th, band) in TOWN['stairs']:
    r0 = RINGS[band][0]; za = RINGS[band - 1][2]; zb = RINGS[band][2]
    n = int((zb - za) / 0.3)
    run = n * 0.34
    radial = Vector(town_pt(th, r0 + 1)) - Vector(town_pt(th, r0)); radial.normalize()
    side = Vector((-radial.y, radial.x))
    p0 = Vector(town_pt(th, r0 - 0.9 - run))          # foot of the flight
    ang = math.atan2(radial.y, radial.x)
    for kk in range(n):
        zz = za + (kk + 1) * (zb - za) / n
        c = p0 + radial * (kk * 0.34 + 0.18)
        merge(steps, nl_kit.obox((c.x, c.y, (za - 0.6 + zz) / 2), (radial.x, radial.y, 0), 0.36, 3.0, zz - za + 0.6))
    for sgn in (-1, 1):
        a_ = p0 + side * sgn * 1.65; b_ = p0 + radial * (run + 0.9) + side * sgn * 1.65
        merge(steps, nl_kit.beam((a_.x, a_.y, (za + zb) / 2 + 0.2), (b_.x, b_.y, zb + 0.6), 0.35, 1.2))
    STAIRS.append((th, band, p0, radial, run))
obj('town_stairs', steps, PAL['granite_light'], PT['ashlar'], family='town', bevel=0.03)

# ------------------------------------------------------------------ quay aprons (cobbles) + coping + water stairs
set_coll(collection('quay', ROOTC))
pav = bmesh.new(); cop = bmesh.new()
APRON = {'grand': 9.0, 'long': 12.0, 'tron': 6.0, 'battery': 8.0, 'wharf': 9.5}


def strip_left(line, depth, z0, z1, bm):
    """Paving strip on the land side (left of travel) of a quay polyline."""
    pts = _resample(line, 3.0, closed=False)
    off = []
    for i, p in enumerate(pts):
        a = Vector(pts[max(0, i - 1)]); b = Vector(pts[min(len(pts) - 1, i + 1)])
        t = (b - a).normalized(); nl = Vector((-t.y, t.x))
        off.append(Vector(p) + nl * depth)
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        quad = [a, b, off[i + 1], off[i]]
        vt = [bm.verts.new((q.x, q.y, z1)) for q in quad]
        vb = [bm.verts.new((q.x, q.y, z0)) for q in quad]
        bm.faces.new(vt)
        bm.faces.new((vb[0], vb[1], vt[1], vt[0]))     # the quay-edge face
    return off


def coping_line(line, bm):
    pts = _resample(line, 2.6, closed=False)
    for a, b in zip(pts, pts[1:]):
        a, b = Vector(a), Vector(b); t = (b - a); L = t.length
        if L < 0.3:
            continue
        t.normalize(); nl = Vector((-t.y, t.x))
        c = (a + b) / 2 + nl * 0.45
        bx = nl_kit.obox((c.x, c.y, Z_SHORE + 0.17), (t.x, t.y, 0), L - 0.06, 1.1, 0.34)
        bx.normal_update()
        bmesh.ops.delete(bx, geom=[f for f in bx.faces if f.normal.z < -0.9], context='FACES_ONLY')
        merge(bm, bx)


for name, L in QL.items():
    depth = APRON.get(name, 3.0 if name.endswith(('-w', '-e')) else 7.0)
    strip_left(L, depth, Z_SHORE - 0.3, Z_SHORE + 0.06, pav)
    coping_line(L, cop)
# the Customs square: a widening of the Vagen promenade at the top of the arc
sq = bmesh.new()
n = 16
for i in range(n):
    th_a = 111 - 42 * i / n; th_b = 111 - 42 * (i + 1) / n
    quad = [town_pt(th_a, TOWN['r_quay'] + 8.5), town_pt(th_b, TOWN['r_quay'] + 8.5), town_pt(th_b, TOWN['r_quay'] + 18.4),
            town_pt(th_a, TOWN['r_quay'] + 18.4)]
    vt = [pav.verts.new((q[0], q[1], Z_SHORE + 0.06)) for q in quad]
    pav.faces.new(vt)
sq.free()
obj('quay_paving', pav, PAL['cobble'], PT['cobble'], family='quay', jitter=0.0)
obj('quay_coping', cop, PAL['quay'], PT['plain'], family='quay', jitter=0.08)
# water stairs: two flights down the Vagen quay, one on the Long Quay
qs = bmesh.new()
for (line, s_) in ((QL['grand'], 0.3), (QL['grand'], 0.7), (QL['long'], 0.5)):
    p, t = along(line, polyline_len(line) * s_)
    t = Vector((t[0], t[1], 0)); nl = Vector((-t.y, t.x, 0))
    for k in range(6):
        c = Vector((p[0], p[1], 0)) - nl * (2.2 - k * 0.36 - 0.18)
        merge(qs, nl_kit.obox((c.x, c.y, (-1.0 + Z_SHORE - 0.4 * (5 - k)) / 2), (t.x, t.y, 0), 2.6, 0.36, Z_SHORE - 0.4 * (5 - k) + 1.0))
obj('quay_waterstairs', qs, PAL['quay'], PT['ashlar'], family='quay', bevel=0.03)

# ------------------------------------------------------------------ piers: plank decks laid across each pier's own axis
set_coll(collection('harbour', ROOTC))
by_pi = {}
for s in CJ['struct']:
    if s['kind'] in ('pier', 'finger', 'thead'):
        by_pi.setdefault(s['pi'], []).append(s)
dk_slab, dk_plank, dk_frame, dk_piles, dk_rail, stone = (bmesh.new() for _ in range(6))
PLANK_COLS = []


def plank_rect(bm, x0, y0, x1, y1, z, along_x, rng):
    """Planks across the long axis: top quads with a 4 cm gap; colour per plank."""
    if along_x:
        n = max(1, int((x1 - x0) / 0.34))
        for k in range(n):
            a = x0 + k * (x1 - x0) / n; b = a + (x1 - x0) / n - 0.04
            v = [bm.verts.new(p) for p in ((a, y0, z), (b, y0, z), (b, y1, z), (a, y1, z))]
            bm.faces.new(v)
    else:
        n = max(1, int((y1 - y0) / 0.34))
        for k in range(n):
            a = y0 + k * (y1 - y0) / n; b = a + (y1 - y0) / n - 0.04
            v = [bm.verts.new(p) for p in ((x0, a, z), (x1, a, z), (x1, b, z), (x0, b, z))]
            bm.faces.new(v)


prng = random.Random(5)
for pi, segs in by_pi.items():
    fr = CJ['pier_frames'][pi]
    root = Vector(fr['root']); d = Vector(fr['dir']).normalized(); nl = Vector((-d.y, d.x))
    deck = fr['deck']
    ang = math.atan2(d.y, d.x)
    loc = lambda p: ((Vector(p) - root).dot(d), (Vector(p) - root).dot(nl))
    rects = []
    for s in segs:
        (ax, ay), (bx, by) = loc(s['a']), loc(s['b'])
        w = s['width']
        if abs(bx - ax) >= abs(by - ay):
            rects.append((min(ax, bx), ay - w / 2, max(ax, bx), ay + w / 2, True))
        else:
            rects.append((ax - w / 2, min(ay, by), ax + w / 2, max(ay, by), False))
    if fr['material'] == 'stone':
        bm = bmesh.new()
        for (x0, y0, x1, y1, _) in rects:
            merge(bm, bm_box2(x0, y0, SEA_FLOOR, x1, y1, deck))
        xf(bm, rz=ang); xf(bm, loc=(root.x, root.y, 0))
        merge(stone, bm)
    else:
        floating = fr['material'] == 'pontoon'
        sl, pk, fm, pl, rl = (bmesh.new() for _ in range(5))
        for (x0, y0, x1, y1, along_x) in rects:
            merge(sl, bm_box2(x0, y0, deck - 0.2, x1, y1, deck - 0.05))
            # planks run across the walk direction: across the pier = constant x stripes when the rect runs along x
            plank_rect(pk, x0, y0, x1, y1, deck, along_x, prng)
            if along_x:
                for yy in (y0 - 0.05, y1 + 0.05):
                    merge(rl, bm_box2(x0, yy - 0.07, deck - 0.38, x1, yy + 0.07, deck + 0.04))
                n = max(1, round((x1 - x0) / (6.8 if floating else 3.4)))
                for k in range(n + 1):
                    xx = x0 + 0.2 + k * (x1 - x0 - 0.4) / n
                    if floating:     # a pontoon: drum floats under the deck, a guide pile every other bay
                        merge(fm, bm_box2(xx - 0.9, y0 + 0.15, -0.25, xx + 0.9, y1 - 0.15, deck - 0.2))
                        if k % 2 == 0:
                            merge(pl, bm_cyl(0.2, 0.18, 4.2, 6, (xx, y1 + 0.3, -2.6), rot=0.3))
                        continue
                    for yy in (y0 + 0.1, y1 - 0.1):
                        merge(pl, bm_cyl(0.22, 0.2, deck + 2.85, 4, (xx, yy, -2.6), cap=False, rot=0.785))
                    merge(fm, bm_box2(xx - 0.1, y0, deck - 0.62, xx + 0.1, y1, deck - 0.2))
            else:
                for xx in (x0 - 0.05, x1 + 0.05):
                    merge(rl, bm_box2(xx - 0.07, y0, deck - 0.38, xx + 0.07, y1, deck + 0.04))
                n = max(1, round((y1 - y0) / 3.4))
                for k in range(n + 1):
                    yy = y0 + 0.2 + k * (y1 - y0 - 0.4) / n
                    if floating:
                        merge(fm, bm_box2(x0 + 0.1, yy - 0.5, -0.2, x1 - 0.1, yy + 0.5, deck - 0.2))
                        continue
                    for xx in (x0 + 0.1, x1 - 0.1):
                        merge(pl, bm_cyl(0.22, 0.2, deck + 2.85, 4, (xx, yy, -2.6), cap=False, rot=0.785))
                    merge(fm, bm_box2(x0, yy - 0.1, x1, yy + 0.1, deck - 0.62, deck - 0.2) if False else bm_box2(x0, yy - 0.1, deck - 0.62, x1, yy + 0.1, deck - 0.2))
        for bm_, dst in ((sl, dk_slab), (pk, dk_plank), (fm, dk_frame), (pl, dk_piles), (rl, dk_rail)):
            xf(bm_, rz=ang); xf(bm_, loc=(root.x, root.y, 0))
            merge(dst, bm_)
    for (x0, y0, x1, y1, along_x) in rects:
        cs = [root + d * x + nl * y for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
        STRUCT_POLYS.append([(c.x, c.y) for c in cs])
        if along_x:
            n = max(1, round((x1 - x0) / 3.4))
            for k in range(n + 1):
                xx = x0 + 0.2 + k * (x1 - x0 - 0.4) / n
                for yy in (y0 + 0.1, y1 - 0.1):
                    c = root + d * xx + nl * yy; PILES.append((c.x, c.y, 0.24))
        else:
            n = max(1, round((y1 - y0) / 3.4))
            for k in range(n + 1):
                yy = y0 + 0.2 + k * (y1 - y0 - 0.4) / n
                for xx in (x0 + 0.1, x1 - 0.1):
                    c = root + d * xx + nl * yy; PILES.append((c.x, c.y, 0.24))
PLANK_TONES = [jitter_col(PAL['timber_grey'], k) for k in (0.86, 0.94, 1.0, 1.06, 1.12)] + [jitter_col(PAL['timber'], 0.85)]
obj('pier_planks', dk_plank, face=lambda q: (PLANK_TONES[(q.index * 7 + q.index // 11) % len(PLANK_TONES)], PT['plain']), family='pier', jitter=0.05)
obj('pier_slab', dk_slab, PAL['timber_dark'], PT['plain'], family='pier')
obj('pier_frame', dk_frame, PAL['timber_dark'], PT['plain'], family='pier')
obj('pier_rubrail', dk_rail, PAL['timber'], PT['plain'], family='pier', jitter=0.06)
obj('pier_piles', dk_piles, PAL['tar'], PT['plain'], family='pier', smooth=False)
if len(stone.faces):
    obj('pier_stone', stone, face=lambda q: ((PAL['quay'], PT['plain']) if q.normal.z > 0.9 else ((PAL['rock_wet'], PT['ashlar']) if q.center.z < 0.5 else (PAL['quay_dark'], PT['ashlar']))),
        family='pier', bevel=0.06)
else:
    stone.free()

# chain identity, in the world (no text): each chain's pier heads carry a painted fascia in the chain colour, and a tall
# flagstaff at every pier root / chain quay flies the chain colour downwind
CHAIN_BAND = {}
DOLPH = bmesh.new()
_wb = Vector(CJ['wind_bow']).normalized()
for pi, segs in by_pi.items():
    fr = CJ['pier_frames'][pi]
    pid = fr['pid']
    root = Vector(fr['root']); d = Vector(fr['dir']).normalized(); nl = Vector((-d.y, d.x))
    deck = fr['deck']
    bm_ = CHAIN_BAND.setdefault(pid, bmesh.new())
    heads = [s_ for s_ in segs if s_['kind'] == 'thead']
    arm = [s_ for s_ in segs if s_['kind'] == 'pier'][0]
    if heads:
        h_ = heads[0]; a_, b_ = Vector(h_['a']), Vector(h_['b'])
        off = d * (h_['width'] / 2 + 0.14)
        merge(bm_, nl_kit.beam((*(a_ + off), deck - 0.3), (*(b_ + off), deck - 0.3), 0.18, 0.85))
        for e_ in (a_, b_):                      # the head's ends too, and a painted mooring dolphin off each corner
            merge(bm_, nl_kit.beam((*(e_ + off), deck - 0.3), (*(e_ - d * (h_['width'] / 2 + 0.14)), deck - 0.3), 0.18, 0.85))
            dv = (e_ - (a_ + b_) / 2).normalized()
            dp = e_ + dv * 1.6 + d * 1.2
            merge(bm_, bm_cyl(0.55, 0.55, 0.7, 10, (dp.x, dp.y, deck + 0.9)))
            merge(DOLPH, bm_cyl(0.5, 0.45, deck + 6.0, 8, (dp.x, dp.y, -4.0)))
    else:
        tip = Vector(arm['b'])
        w_ = arm['width'] / 2 + 0.12
        merge(bm_, nl_kit.beam((*(tip + nl * w_ + d * 0.14), deck - 0.3), (*(tip - nl * w_ + d * 0.14), deck - 0.3), 0.18, 0.85))
        for sd in (1, -1):
            merge(bm_, nl_kit.beam((*(tip + nl * sd * w_ - d * 7.0), deck - 0.3), (*(tip + nl * sd * w_ + d * 0.14), deck - 0.3), 0.18, 0.85))
obj('pier_dolphins', DOLPH, PAL['tar'], PT['plain'], family='pier', jitter=0.05)
FLAG_AT = []
for pi, segs in by_pi.items():
    fr = CJ['pier_frames'][pi]
    if fr['pid'] == 'pier-hyperliquid-l1':
        continue
    root = Vector(fr['root']); d = Vector(fr['dir']).normalized(); nl = Vector((-d.y, d.x))
    FLAG_AT.append((fr['pid'], root - d * 3.5 + nl * (fr['width'] / 2 + 2.0)))
_tq = [Vector(p) for p in QL['tron']]
for k in (0.18, 0.5, 0.82):
    L_ = sum((b - a).length for a, b in zip(_tq, _tq[1:])); s_ = L_ * k
    for a, b in zip(_tq, _tq[1:]):
        if s_ <= (b - a).length:
            p_ = a.lerp(b, s_ / (b - a).length); t_ = (b - a).normalized()
            inl = Vector((t_.y, -t_.x)) if point_in_poly(*(p_ + Vector((t_.y, -t_.x)) * 4), COAST) else Vector((-t_.y, t_.x))
            FLAG_AT.append(('pier-tron', p_ + inl * 5.0)); break
        s_ -= (b - a).length
for cv in CJ['coves']:
    if cv['pid'] == 'pier-hyperliquid-l1':
        b = Vector(cv['back']); n_ = Vector(cv['n']); t_ = Vector(cv['t'])
        FLAG_AT.append((cv['pid'], b - n_ * 4.0 + t_ * 6.0))
flag_pole = bmesh.new()
for pid, p_ in FLAG_AT:
    z0 = H(p_.x, p_.y) if point_in_poly(p_.x, p_.y, COAST) else DECK
    merge(flag_pole, bm_cyl(0.13, 0.08, 10.5, 6, (p_.x, p_.y, z0 - 0.4)))
    merge(flag_pole, bm_sphere(0.2, (p_.x, p_.y, z0 + 10.2), 6, 4))
    fly = -_wb                                     # flags stream downwind
    fb = bmesh.new()
    for k in range(4):                             # a gently waved flag (four panels)
        a_ = p_ + fly * (0.15 + k * 0.85); b_ = p_ + fly * (0.15 + (k + 1) * 0.85)
        sway = Vector((-fly.y, fly.x)) * (0.18 * math.sin(k * 1.6))
        merge(fb, nl_kit.beam((*(a_ + sway), z0 + 9.2), (*(b_ + sway), z0 + 9.2), 0.06, 1.6))
    merge(CHAIN_BAND.setdefault(pid, bmesh.new()), fb)
obj('chain_flagstaffs', flag_pole, PAL['wall_white'], PT['plain'], family='quay')
for pid, bm_ in CHAIN_BAND.items():
    obj('chain_colour_' + pid[5:], bm_, lin(CJ['pennant'][pid]), PT['plain'], family='pier', jitter=0.03)

# bollards (one merged object)
bol = bmesh.new()
for (x, y, z) in CJ['bollards']:
    nl_kit.bollard(bol, (x, y, z + (0.06 if z > 2 else 0.0)), 0.75 if z < 2 else 1.0)
obj('bollards', bol, PAL['iron'], PT['metal'], family='quay')

# ------------------------------------------------------------------ the breakwater (crown, seaward parapet, rubble apron, head light)
set_coll(collection('breakwater', ROOTC))
BW = [Vector(p) for p in CJ['bw_line']]
BWW = CJ['bw_width']
crown = bmesh.new(); para = bmesh.new(); rub = bmesh.new()
pts = []
for i in range(len(BW) - 1):
    a, b = BW[i], BW[i + 1]
    n = max(1, int((b - a).length / 3.0))
    for k in range(n):
        pts.append(a.lerp(b, k / n))
pts.append(BW[-1])
frames = []
for i, p in enumerate(pts):
    a = pts[max(0, i - 1)]; b = pts[min(len(pts) - 1, i + 1)]
    t = (b - a).normalized(); nrm = Vector((t.y, -t.x))          # right of travel (root -> head) = the open sea
    frames.append((p, t, nrm))
for (p, t, nrm), (q, t2, n2) in zip(frames, frames[1:]):
    merge(crown, nl_kit.beam((p.x, p.y, (SEA_FLOOR + 3.2) / 2), (q.x, q.y, (SEA_FLOOR + 3.2) / 2), BWW, 3.2 - SEA_FLOOR))
    pp = p + nrm * (BWW / 2 - 0.8); qq = q + n2 * (BWW / 2 - 0.8)
    merge(para, nl_kit.beam((pp.x, pp.y, 4.0), (qq.x, qq.y, 4.0), 1.5, 1.4))
obj('breakwater_crown', crown, face=lambda q: ((PAL['quay'], PT['ashlar']) if q.normal.z > 0.9 else ((PAL['rock_wet'], PT['ashlar']) if q.center.z < 0.4 else (PAL['quay_dark'], PT['ashlar']))),
    family='breakwater', bevel=0.06)
obj('breakwater_parapet', para, PAL['granite_light'], PT['ashlar'], family='breakwater', bevel=0.06)
rng_bw = random.Random(5)
CIRCLES = []
for i, (p, t, nrm) in enumerate(frames[:-1]):
    for k in range(3):
        r = rng_bw.uniform(1.4, 2.5)
        off = nrm * (BWW / 2 + 1.2 + k * 1.8 + rng_bw.uniform(-0.4, 0.4)) + t * rng_bw.uniform(-1.6, 1.6)
        c = p + off
        merge(rub, bm_ico(r, (c.x, c.y, rng_bw.uniform(-0.2, 0.9) - k * 0.6), 1, (1.3, 1.0, 0.8), seed=i * 7 + k, amp=0.3))
        CIRCLES.append((c.x, c.y, r * 1.15))
obj('breakwater_rubble', rub, face=lambda q: ((PAL['rock_wet'] if q.center.z < 0.45 else (PAL['rock'] if q.normal.z < 0.6 else PAL['rock_light'])), PT['rock']),
    family='breakwater', jitter=0.08)
left = [tuple(p + nrm * (BWW / 2)) for p, t, nrm in frames]; right = [tuple(p - nrm * (BWW / 2)) for p, t, nrm in frames]
STRUCT_POLYS.append([(v[0], v[1]) for v in left + right[::-1]])
hp = BW[-1]
hl = bm_cyl(4.2, 4.2, 6.6, 20, (hp.x, hp.y, SEA_FLOOR))
obj('harbour_light_base', hl, face=lambda q: ((PAL['quay'], PT['plain']) if q.normal.z > 0.9 else (PAL['quay_dark'], PT['ashlar'])), family='breakwater', bevel=0.05)
CIRCLES.append((hp.x, hp.y, 4.4))
tw = bm_cyl(1.5, 1.2, 5.6, 12, (hp.x, hp.y, 2.6))
obj('harbour_light_tower', tw, face=lambda q: ((PAL['hull_red'] if (q.center.z % 1.8) < 0.9 else PAL['wall_white']), PT['render']), family='breakwater')
cp_ = bm_cyl(1.6, 1.6, 0.2, 12, (hp.x, hp.y, 8.2)); merge(cp_, bm_cyl(0.9, 0.12, 0.9, 12, (hp.x, hp.y, 9.6)))
obj('harbour_light_cap', cp_, PAL['iron'], PT['metal'], family='breakwater')
obj('harbour_light_lamp', bm_cyl(0.72, 0.72, 1.2, 10, (hp.x, hp.y, 8.4)), mat=M['lamp'], family='breakwater', shadow=False)
HL_POS = Vector((hp.x, hp.y, 9.0))

# ------------------------------------------------------------------ the marina's stone moles (v5): ashlar walls straight
# down to the sea floor (hulls lie bow-in along both faces), granite copings, a raised flagstone promenade down the
# middle (benches, little planted trees between the lamps), and a round pierhead bastion carrying a proper harbour
# light (green: the Grand Mole, red: the Inner) with its gallery and lantern
set_coll(collection('marina', ROOTC))
mcrest, mcop, mband, mtw = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
mprom, mbench, mplant, mleaf, mtrunk = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
MOLE_TOWERS = []
ETH_BAND = lin(CJ['pennant']['pier-ethereum'])
_mrng = random.Random(41)


def _bench(bm_, p, ang, z):
    b_ = bmesh.new()
    merge(b_, bm_box2(-0.95, -0.25, 0.42, 0.95, 0.25, 0.52)); merge(b_, bm_box2(-0.95, 0.22, 0.52, 0.95, 0.3, 0.98))
    for dx in (-0.8, 0.8):
        merge(b_, bm_box2(dx - 0.06, -0.22, 0.0, dx + 0.06, 0.28, 0.42))
    xf(b_, rz=ang); xf(b_, loc=(p.x, p.y, z)); merge(bm_, b_)


for m in CJ.get('moles', []):
    pts = [Vector(p) for p in _resample([tuple(p) for p in m['line']], 3.0, closed=False)]
    w_ = m['width']
    for a, b in zip(pts, pts[1:]):
        merge(mcrest, nl_kit.beam((a.x, a.y, (SEA_FLOOR + Z_SHORE) / 2), (b.x, b.y, (SEA_FLOOR + Z_SHORE) / 2), w_, Z_SHORE - SEA_FLOOR))
    left, right, frames_ = [], [], []
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]; b = pts[min(len(pts) - 1, i + 1)]
        t = (b - a).normalized(); nl = Vector((-t.y, t.x))
        left.append(tuple(p + nl * w_ / 2)); right.append(tuple(p - nl * w_ / 2))
        frames_.append((p, t, nl))
    coping_line(left[::-1], mcop); coping_line(right, mcop)          # stones laid on the crest side of each edge
    # the promenade: a raised flagstone walk between granite kerbs, stopping short of the pierhead bastion
    pw = w_ - 5.2
    h = Vector(m['head']); hr = m['head_r']
    walk = [f for f in frames_ if (f[0] - h).length > hr + 1.0]
    for (p, t, nl), (q, t2, n2) in zip(walk, walk[1:]):
        merge(mprom, nl_kit.beam((p.x, p.y, Z_SHORE + 0.08), (q.x, q.y, Z_SHORE + 0.08), pw, 0.24))      # its sides read as the kerbs
    # the walk's furniture by arc length: the lamps stand every 24 m (compose LAMPS), a pair of benches back to back
    # between each two, and a little planted tree in a stone tub every other gap
    Lw = polyline_len([tuple(f[0]) for f in walk]); s_ = 24.0; k_ = 0
    wl = [tuple(f[0]) for f in walk]
    while s_ < Lw - 8.0:
        p2, t2 = along(wl, s_); p2 = Vector(p2); t2 = Vector(t2); n2 = Vector((-t2.y, t2.x)); ang = math.atan2(t2.y, t2.x)
        if k_ % 2 == 0:
            for sd in (1, -1):                         # back to back, each facing its own row of hulls
                _bench(mbench, p2 + n2 * sd * 0.45 - t2 * 2.4, ang + (0 if sd < 0 else math.pi), Z_SHORE + 0.26)
                _bench(mbench, p2 + n2 * sd * 0.45 + t2 * 2.4, ang + (0 if sd < 0 else math.pi), Z_SHORE + 0.26)
        else:
            merge(mplant, bm_cyl(0.95, 0.8, 0.75, 10, (p2.x, p2.y, Z_SHORE + 0.2)))
            hh = _mrng.uniform(4.2, 5.2)
            merge(mtrunk, bm_cyl(0.16, 0.11, hh * 0.6, 5, (p2.x, p2.y, Z_SHORE + 0.8)))
            for kk in range(3):
                o = Vector((_mrng.uniform(-0.5, 0.5), _mrng.uniform(-0.5, 0.5), 0))
                merge(mleaf, bm_ico(1.25 - 0.18 * kk, (p2.x + o.x, p2.y + o.y, Z_SHORE + 0.8 + hh * (0.6 + 0.13 * kk)), 1, (1, 1, 0.85),
                                    seed=_mrng.randint(0, 99), amp=0.22))
        s_ += 24.0; k_ += 1
    # the pierhead bastion: a round drum to the sea floor, coping, Ethereum's band, benches round its rim
    merge(mcrest, bm_cyl(hr, hr, Z_SHORE - SEA_FLOOR, 28, (h.x, h.y, SEA_FLOOR)))
    merge(mcop, bm_cyl(hr + 0.2, hr + 0.2, 0.36, 28, (h.x, h.y, Z_SHORE - 0.02)))
    merge(mband, bm_cyl(hr + 0.05, hr + 0.05, 0.8, 28, (h.x, h.y, Z_SHORE - 1.25)))
    merge(mprom, bm_cyl(hr - 1.0, hr - 1.0, 0.2, 24, (h.x, h.y, Z_SHORE - 0.04)))
    t_in = (Vector(m['line'][-2]) - h).normalized()
    for k in range(5):
        a_ = math.atan2(t_in.y, t_in.x) + math.pi * (0.45 + 0.275 * k)
        pb = h + Vector((math.cos(a_), math.sin(a_))) * (hr - 2.0)
        _bench(mbench, pb, a_ - math.pi / 2, Z_SHORE + 0.16)
    STRUCT_POLYS.append(left + right[::-1])
    CIRCLES.append((h.x, h.y, hr + 0.3))
    # the light: granite plinth, a banded tower, an iron gallery with its rail, the lantern and a domed cap
    col = lin('#3E8C5C') if m['name'] == 'grand' else lin('#B8392B')
    zb = Z_SHORE + 0.16
    merge(mtw, bm_cyl(2.5, 2.5, 0.3, 14, (h.x, h.y, zb)))
    plinth = bm_cyl(2.2, 2.05, 1.3, 12, (h.x, h.y, zb + 0.3))
    obj(f'mole_light_plinth_{m["name"]}', plinth, PAL['granite_light'], PT['ashlar'], family='marina', bevel=0.04)
    tw = bmesh.new()                                 # six 1 m courses, banded colour / white
    for k in range(6):
        r0_, r1_ = 1.45 - 0.35 * k / 6, 1.45 - 0.35 * (k + 1) / 6
        merge(tw, bm_cyl(r0_, r1_, 6.2 / 6, 14, (h.x, h.y, zb + 1.6 + k * 6.2 / 6), cap=(k == 5)))
    obj(f'mole_light_tower_{m["name"]}', tw, face=lambda q, col=col, zb=zb: ((col if int((q.center.z - zb - 1.6) / (6.2 / 6)) % 2 == 1 else PAL['wall_white']), PT['render']),
        family='marina')
    zg = zb + 7.8
    merge(mtw, bm_cyl(1.9, 1.9, 0.18, 14, (h.x, h.y, zg)))                    # gallery deck
    for k in range(14):                                                     # rail stanchions + top rail
        a_ = 2 * math.pi * k / 14
        merge(mtw, bm_cyl(0.04, 0.04, 0.8, 4, (h.x + math.cos(a_) * 1.8, h.y + math.sin(a_) * 1.8, zg + 0.18), cap=False))
    merge(mtw, bm_cyl(1.82, 1.82, 0.06, 14, (h.x, h.y, zg + 0.95), cap=False))
    merge(mtw, bm_cyl(1.0, 1.0, 0.2, 10, (h.x, h.y, zg + 0.18)))
    obj(f'mole_light_lamp_{m["name"]}', bm_cyl(0.78, 0.78, 1.25, 10, (h.x, h.y, zg + 0.38)), mat=M['lamp'], family='marina', shadow=False)
    cp_ = bm_cyl(1.05, 1.05, 0.16, 12, (h.x, h.y, zg + 1.63)); merge(cp_, bm_cyl(1.0, 0.1, 0.95, 12, (h.x, h.y, zg + 1.79)))
    merge(cp_, bm_sphere(0.16, (h.x, h.y, zg + 2.85), 6, 4))
    merge(mtw, cp_)
    MOLE_TOWERS.append(Vector((h.x, h.y, zg + 1.0)))
obj('mole_crest', mcrest, face=lambda q: ((PAL['quay'], PT['ashlar']) if q.normal.z > 0.9 else ((PAL['rock_wet'], PT['ashlar']) if q.center.z < 0.4 else (PAL['quay_dark'], PT['ashlar']))),
    family='quay', bevel=0.04)
obj('mole_coping', mcop, PAL['quay'], PT['plain'], family='quay', jitter=0.08)
obj('mole_promenade', mprom, face=lambda q: ((lin('#B2AA98'), PT['ashlar']) if q.normal.z > 0.9 else (PAL['granite'], PT['ashlar'])), family='quay', jitter=0.05)
obj('mole_benches', mbench, PAL['timber'], PT['boards'], family='prop_bench')
obj('mole_planters', mplant, PAL['granite'], PT['ashlar'], family='quay', jitter=0.05)
obj('mole_tree_trunks', mtrunk, PAL['timber_dark'], PT['plain'], family='veg')
obj('mole_tree_crowns', mleaf, face=lambda q: ((lin('#7D9A4A') if q.normal.z > 0.3 else lin('#5E7D3C')), PT['leaf']), family='veg', jitter=0.08)
obj('mole_chain_band', mband, ETH_BAND, PT['plain'], family='quay', jitter=0.0)
obj('mole_light_caps', mtw, PAL['iron'], PT['metal'], family='marina')

print('LAND built')
