"""The Harbour v2 - land: terrain levels, quay walls + aprons, streets, stairs, piers, breakwater, coves.
exec'd into build_island's namespace (shares CJ, M, PAL, PT, helpers)."""

SEA_FLOOR = -4.0
Q = CJ['consts']
Z_SHORE, DECK, QY, WX, SY = Q['Z_SHORE'], Q['DECK'], Q['QY'], Q['WX'], Q['SY']
COVE_BACK = Q['COVE_BACK']
COAST = [tuple(p) for p in CJ['coast']]
LEVELS = {L['name']: dict(poly=[tuple(p) for p in L['poly']], z=L['z'], edge=L['edge']) for L in CJ['levels']}
QUAYS = CJ['quays']
PILES = []          # (x, y, r) pile contact for the SDF B channel
STRUCT_POLYS = []   # structure footprints for the SDF


def on_quay(x, y, tol=0.6):
    for q in QUAYS:
        a, b = q['a'], q['b']
        if abs(a[1] - b[1]) < 0.01:      # along x
            if min(a[0], b[0]) - tol <= x <= max(a[0], b[0]) + tol and abs(y - a[1]) < tol:
                return True
        else:
            if min(a[1], b[1]) - tol <= y <= max(a[1], b[1]) + tol and abs(x - a[0]) < tol:
                return True
    return False


def rock_wall(name, poly, z0, z1, rows=4, amp=0.9, seed=0, straight=None, ashlar=None, top_color=None, lip=True,
              top_pattern=None, family='terrain', jag=0.0):
    """Faceted strata cliff around poly z0..z1 + flat top (style C). straight(x,y) keeps an exact vertical
    masonry edge (quay wall); ashlar(x,y) marks retaining-wall stretches."""
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
                    k = 0.0          # the top ring is the authored polygon (simple), so its tessellation is clean
                q = Vector((x, y)) + nr * k
                dz = noise.noise(Vector((x * 0.2, y * 0.2, seed))) * 0.3 if 0 < r < rows else 0.0
            ring.append(bm.verts.new((q.x, q.y, z + dz)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    from mathutils.geometry import tessellate_polygon
    tris = tessellate_polygon([[v.co for v in rings[-1]]])
    for (i0, i1, i2) in tris:
        try:
            f = bm.faces.new((rings[-1][i0], rings[-1][i1], rings[-1][i2]))
            if f.normal.z < 0:
                f.normal_flip()
        except ValueError:
            pass
    bm.normal_update()
    for f in bm.faces:
        if f.calc_area() > 1e-6 and abs(f.normal.z) > 0.99 and f.calc_center_median().z > z1 - 0.01 and f.normal.z < 0:
            f.normal_flip()
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
        lp = offset_poly(poly, 0.45)
        lb = bmesh.new(); m_ = len(lp)
        for i in range(m_):
            a, b = Vector(poly[i]), Vector(poly[(i + 1) % m_])
            if (straight and (straight(a.x, a.y) or straight(b.x, b.y))) or (ashlar and ashlar(a.x, a.y) and ashlar(b.x, b.y)):
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


set_coll(collection('land', ROOTC))
import terrain
from scipy.spatial import Delaunay
COVES_XH = [(c[1], c[2]) for c in CJ['coves']]


def H(x, y):
    return terrain.height(x, y, COVES_XH)


def ground_z(x, y):
    return H(x, y) if point_in_poly(x, y, COAST) else -9.0


def _resample(poly, step):
    out = []
    n = len(poly)
    for i in range(n):
        a = Vector(poly[i]); b = Vector(poly[(i + 1) % n])
        L = (b - a).length; k = max(1, int(L / step))
        for j in range(k):
            out.append(tuple(a.lerp(b, j / k)))
    return out


def build_heightfield():
    from PIL import Image, ImageDraw
    ring = _resample(COAST, 3.0)
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    X0, X1, Y0, Y1 = min(xs) - 2, max(xs) + 2, min(ys) - 2, max(ys) + 2
    S = 1.0
    W_, H_ = int((X1 - X0) / S) + 1, int((Y1 - Y0) / S) + 1
    im = Image.new('L', (W_, H_), 0)
    ImageDraw.Draw(im).polygon([((x - X0) / S, (Y1 - y) / S) for x, y in COAST], fill=255)
    mask = np.array(im) > 127
    from scipy import ndimage
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
    # finer facets on the Pharos headland table (the hero's ground)
    y = 100.0
    while y < 262.0:
        x = 176.0
        while x < 280.0:
            px, py = x + rng.uniform(-1.0, 1.0), y + rng.uniform(-1.0, 1.0)
            if math.hypot((px - 224) / 46.0, (py - 182) / 70.0) < 1.15 and inside(px, py) and dcoast(px, py) > 1.6:
                pts.append((px, py))
            x += 3.2
        y += 3.2 * 0.866
    # terrace fronts: rows of points hugging both sides so the step is a clean vertical band (behind the walls)
    for (fy, tz, x0, x1) in terrain.TERRACES:
        x = x0 - 12
        while x <= x1 + 12:
            for dy in (-0.35, 0.35):
                if inside(x, fy + dy):
                    pts.append((x, fy + dy))
            x += 2.5
    P = np.array(pts)
    tri = Delaunay(P)
    bm = bmesh.new()
    vs = [bm.verts.new((p[0], p[1], H(p[0], p[1]))) for p in pts]
    for t in tri.simplices:
        c = P[t].mean(axis=0)
        if not inside(c[0], c[1]):
            continue
        a_, b_, c_ = (vs[i] for i in t)
        try:
            f = bm.faces.new((a_, b_, c_))
        except ValueError:
            continue
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return bm


def hf_face(q):
    c = q.center; nz = q.normal.z
    nn = terrain.fbm(c.x, c.y, 0.02, 2, 11)
    if nz < 0.5:
        return ((PAL['rock_dark'] if nn > 0.58 else PAL['rock']), PT['rock'])
    if nz < 0.72:
        return ((PAL['rock'] if nn > 0.62 else PAL['grass_dark']), PT['rock'] if nn > 0.62 else PT['grass'])
    if c.z < 2.1 and c.x < -230 and c.y > 230:
        return (lin('#CDB991'), PT['plain'])                                     # Wreck Cove sand
    n2 = terrain.fbm(c.x, c.y, 0.006, 3, 5)
    hd = math.hypot((c.x - 224) / 46.0, (c.y - 182) / 70.0)
    fl = terrain.field_at(c.x, c.y)
    if fl is not None:
        fc = lin(terrain.FIELD_COL[fl['kind']])
        stripe = int((c.x * 0.7 + c.y * 0.7) / 2.6) % 2 if fl['kind'] in ('plough', 'hay') else 0
        return (jitter_col(fc, 0.93 if stripe else 1.03), PT['grass'] if fl['kind'] != 'plough' else PT['plain'])
    base = PAL['grass']
    if hd < 1.1:
        base = lin('#7E9150')                                                    # wind-cropped headland turf
    elif c.z > 27:
        base = lin('#667F41')                                                    # forest floor up on the ridge
    t = max(0.0, min(1.0, (n2 - 0.38) / 0.26))
    lo, hi = jitter_col(base, 0.9), jitter_col(base, 1.1)
    return (tuple(lo[i] + (hi[i] - lo[i]) * t for i in range(3)), PT['grass'])


HF = obj('land_terrain', build_heightfield(), face=hf_face, jitter=0.035, seed=4, family='terrain')


def coast_skirt(name, poly, ztop, straight, rows=4, amp=1.3, seed=1, jag=0.8):
    """Rock strata from the sea floor up to the heightfield rim (style C cliff), vertical masonry on quay lines."""
    bm = bmesh.new(); n = len(poly); rings = []
    tops = [ztop(x, y) for x, y in poly]
    for r in range(rows + 1):
        f = r / rows
        ring = []
        for i, (x, y) in enumerate(poly):
            z = SEA_FLOOR + (tops[i] - SEA_FLOOR) * f
            if straight(x, y) or r == rows:
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
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.normal_update()

    def fc(q):
        c = q.center
        if straight(c.x, c.y):
            return (PAL['quay_dark'], PT['ashlar'])
        if c.z < 0.6:
            return (PAL['rock_wet'], PT['rock'])
        nn = noise.noise(Vector((c.x * 0.09, c.y * 0.09, c.z * 0.4 + seed)))
        if q.normal.z > 0.45:
            return (PAL['rock_light'], PT['rock'])
        return (PAL['rock_dark'] if nn > 0.2 else PAL['rock'], PT['rock'])
    return obj(name, bm, face=fc, jitter=0.07, seed=seed, family='terrain')


coast_skirt('land_cliffs', _resample(COAST, 3.0), lambda x, y: H(x, y), on_quay)

# terrace retaining walls (ashlar, with coping) + end buttresses
tw_ = bmesh.new(); tc_ = bmesh.new()
prev = Z_SHORE
for (fy, tz, x0, x1) in terrain.TERRACES:
    merge(tw_, bm_box2(x0, fy - 0.9, prev - 0.6, x1, fy + 0.1, tz + 0.05))
    merge(tc_, bm_box2(x0 - 0.2, fy - 1.1, tz + 0.05, x1 + 0.2, fy + 0.3, tz + 0.45))
    for xb in (x0, x1):
        merge(tw_, bm_box2(xb - 0.9, fy - 1.3, prev - 0.6, xb + 0.9, fy + 0.5, tz + 0.3))
    prev = tz
obj('terrace_walls', tw_, PAL['granite'], PT['ashlar'], family='quay', bevel=0.04)
# ivy + valerian tumbling over the retaining walls (A graft: lush wall greenery)
ivy = bmesh.new(); ivyf = bmesh.new()
irng = random.Random(88)
prev = Z_SHORE
for (fy, tz, x0, x1) in terrain.TERRACES:
    x = x0 + irng.uniform(2, 8)
    while x < x1 - 3:
        w_ = irng.uniform(2.5, 6.0); h_ = (tz - prev) * irng.uniform(0.45, 0.95)
        merge(ivy, bm_ico(1.0, (x, fy - 1.05, tz - h_ / 2 + 0.2), 1, (w_ / 2, 0.55, h_ / 2), seed=irng.randint(0, 999), amp=0.25))
        if irng.random() < 0.45:
            for k in range(3):
                merge(ivyf, bm_ico(0.32, (x + irng.uniform(-w_ / 2, w_ / 2), fy - 1.5, tz - irng.uniform(0.3, h_)), 0, seed=k))
        x += w_ + irng.uniform(3.0, 14.0)
    prev = tz
obj('terrace_ivy', ivy, face=lambda q: ((lin('#4F6E37') if q.normal.z > 0.2 else lin('#3D5A30')), PT['leaf']), family='veg', jitter=0.08)
obj('terrace_ivy_flowers', ivyf, face=lambda q: ((PAL['flower_p'], PAL['flower_w'], PAL['rowan_berry'])[q.index // 20 % 3], 0), family='veg')
obj('terrace_coping', tc_, PAL['granite_light'], PT['plain'], family='quay', bevel=0.04)

# ------------------------------------------------------------------ quay aprons (cobbles), coping, water stairs
set_coll(collection('quay', ROOTC))
pav = bmesh.new(); cop = bmesh.new()


def coping_run(a, b, inward):
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0)); d = b - a; L = d.length; t = d.normalized()
    n = Vector((inward[0], inward[1], 0)).normalized()
    k = int(L / 3.0)
    for i in range(k):
        p0 = a + t * (i * L / k + 0.03); p1 = a + t * ((i + 1) * L / k - 0.03)
        c = (p0 + p1) / 2 + n * 0.45
        bx = nl_kit.obox((c.x, c.y, Z_SHORE + 0.17), t, (p1 - p0).length, 1.1, 0.34)
        bx.normal_update()
        bmesh.ops.delete(bx, geom=[f for f in bx.faces if f.normal.z < -0.9], context='FACES_ONLY')
        merge(cop, bx)


# Grand Quay apron + its coping; Customs-house square; basin apron; cove back quays
merge(pav, bm_box2(-150, QY, Z_SHORE - 0.3, 150, QY + 16.5, Z_SHORE + 0.06))
merge(pav, bm_box2(24, QY + 16, Z_SHORE - 0.3, 58, QY + 30, Z_SHORE + 0.06))
merge(pav, bm_box2(WX - 12, SY + 6, Z_SHORE - 0.3, WX, QY + 2, Z_SHORE + 0.06))
coping_run((-150, QY), (150, QY), (0, 1))
coping_run((WX, SY + 6), (WX, QY), (-1, 0))
for pid, cx, hw in CJ['coves']:
    merge(pav, bm_box2(cx - hw + 4, COVE_BACK, Z_SHORE - 0.3, cx + hw - 4, COVE_BACK + 7.5, Z_SHORE + 0.06))
    coping_run((cx - hw + 5, COVE_BACK), (cx + hw - 5, COVE_BACK), (0, 1))
obj('quay_paving', pav, PAL['cobble'], PT['cobble'], family='quay', jitter=0.0)
obj('quay_coping', cop, PAL['quay'], PT['plain'], family='quay', jitter=0.08)
# water stairs in the Grand Quay (two) and one in the basin
qs = bmesh.new()
for x0 in (-24.0, 104.0):
    for k in range(6):
        merge(qs, bm_box2(x0, QY - 2.2 + k * 0.36, -1.0, x0 + 2.6, QY, Z_SHORE - 0.4 * (5 - k)))
obj('quay_waterstairs', qs, PAL['quay'], PT['ashlar'], family='quay', bevel=0.03)

# ------------------------------------------------------------------ town streets (gravel lanes on each terrace front) + stairs
set_coll(collection('town', ROOTC))
lanes_bm = bmesh.new(); steps = bmesh.new()
for (a, b, z, w) in (((-136, 185.2), (148, 185.2), 7.0, 4.0), ((-122, 219.0), (124, 219.0), 12.0, 3.4), ((-106, 252.8), (114, 252.8), 17.0, 3.0)):
    merge(lanes_bm, nl_kit.beam((a[0], a[1], z + 0.04), (b[0], b[1], z + 0.04), w, 0.24))
obj('town_lanes', lanes_bm, PAL['gravel'], PT['cobble'], family='town', jitter=0.03)
STAIRS = [(-57.0, 182.0, Z_SHORE, 7.0), (99.5, 182.0, Z_SHORE, 7.0), (-83.0, 216.0, 7.0, 12.0), (-27.0, 216.0, 7.0, 12.0),
          (3.0, 250.0, 12.0, 17.0), (-51.0, 250.0, 12.0, 17.0)]
for (x0, fy, za, zb) in STAIRS:
    n = int((zb - za) / 0.3)
    run = n * 0.34
    for k in range(n):
        z = za + (k + 1) * (zb - za) / n
        y = fy - 0.9 - run + k * 0.34
        merge(steps, bm_box2(x0 - 1.5, y, za - 0.6, x0 + 1.5, y + 0.36, z))
    merge(steps, bm_box2(x0 - 1.8, fy - 0.9 - run - 0.1, za - 0.6, x0 - 1.5, fy - 0.9, zb + 0.9))
    merge(steps, bm_box2(x0 + 1.5, fy - 0.9 - run - 0.1, za - 0.6, x0 + 1.8, fy - 0.9, zb + 0.9))
obj('town_stairs', steps, PAL['granite_light'], PT['ashlar'], family='town', bevel=0.03)

# ------------------------------------------------------------------ piers, fingers, T-heads (style C build_pier, per pier id)
set_coll(collection('harbour', ROOTC))


def seg_rect(s):
    a, b, w = s['a'], s['b'], s['width']
    if abs(a[0] - b[0]) >= abs(a[1] - b[1]):
        return (min(a[0], b[0]), a[1] - w / 2, max(a[0], b[0]), a[1] + w / 2)
    return (a[0] - w / 2, min(a[1], b[1]), a[0] + w / 2, max(a[1], b[1]))


by_pier = {}
for s in CJ['struct']:
    if s['kind'] in ('pier', 'finger', 'thead'):
        by_pier.setdefault((s['pid'], s.get('material', 'timber'), round(s.get('deck', DECK), 2)), []).append(s)
for (pid, mat_, deck), segs in by_pier.items():
    rects = [seg_rect(s) for s in segs]
    nm = 'pier_' + pid[5:].replace('-', '_') + ('_stone' if mat_ == 'stone' else '')
    if mat_ == 'stone':
        bm = bmesh.new()
        for (x0, y0, x1, y1) in rects:
            merge(bm, bm_box2(x0, y0, SEA_FLOOR, x1, y1, deck))
        obj(nm, bm, face=lambda q: ((PAL['quay'], PT['plain']) if q.normal.z > 0.9 else ((PAL['rock_wet'], PT['ashlar']) if q.center.z < 0.5 else (PAL['quay_dark'], PT['ashlar']))),
            family='pier', bevel=0.06)
    else:
        nl_kit.build_pier(nm, rects, deck, family='pier', pile_step=3.4)
    for (x0, y0, x1, y1) in rects:
        STRUCT_POLYS.append([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
        along_x = (x1 - x0) >= (y1 - y0)
        n = max(1, round(((x1 - x0) if along_x else (y1 - y0)) / 3.4))
        for k in range(n + 1):
            if along_x:
                xx = x0 + 0.2 + k * (x1 - x0 - 0.4) / n
                PILES.extend([(xx, y0 + 0.1, 0.24), (xx, y1 - 0.1, 0.24)])
            else:
                yy = y0 + 0.2 + k * (y1 - y0 - 0.4) / n
                PILES.extend([(x0 + 0.1, yy, 0.24), (x1 - 0.1, yy, 0.24)])

# bollards (one merged object) + pier-head / quay lamps (pennant posts come with the dressing pass)
bol = bmesh.new()
for (x, y, z) in CJ['bollards']:
    nl_kit.bollard(bol, (x, y, z + (0.06 if z > 2 else 0.0)), 0.75 if z < 2 else 1.0)
obj('bollards', bol, PAL['iron'], PT['metal'], family='quay')

# ------------------------------------------------------------------ the breakwater (crown, seaward parapet, rubble apron, head light)
set_coll(collection('breakwater', ROOTC))
BW = [Vector(p) for p in CJ['bw_line']]
BWW = CJ['bw_width']
crown = bmesh.new(); para = bmesh.new(); rub = bmesh.new(); wall = bmesh.new()
pts = []
for i in range(len(BW) - 1):
    a, b = BW[i], BW[i + 1]
    n = max(1, int((b - a).length / 5.0))
    for k in range(n):
        pts.append(a.lerp(b, k / n))
pts.append(BW[-1])
frames = []
for i, p in enumerate(pts):
    a = pts[max(0, i - 1)]; b = pts[min(len(pts) - 1, i + 1)]
    t = (b - a).normalized(); nrm = Vector((t.y, -t.x))          # right of travel (root->head, i.e. north) = east = seaward
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
# breakwater head: round stone drum + the red harbour light (at the mouth)
hp = BW[-1]
hl = bm_cyl(4.2, 4.2, 6.6, 20, (hp.x, hp.y, SEA_FLOOR))
obj('harbour_light_base', hl, face=lambda q: ((PAL['quay'], PT['plain']) if q.normal.z > 0.9 else (PAL['quay_dark'], PT['ashlar'])), family='breakwater', bevel=0.05)
CIRCLES.append((hp.x, hp.y, 4.4))
tw = bm_cyl(1.5, 1.2, 5.6, 12, (hp.x, hp.y, 2.6))
obj('harbour_light_tower', tw, face=lambda q: ((PAL['hull_red'] if (q.center.z % 1.8) < 0.9 else PAL['wall_white']), PT['render']), family='breakwater')
cp_ = bm_cyl(1.6, 1.6, 0.2, 12, (hp.x, hp.y, 8.2)); merge(cp_, bm_cyl(0.9, 0.12, 0.9, 12, (hp.x, hp.y, 9.6)))
obj('harbour_light_cap', cp_, PAL['iron'], PT['metal'], family='breakwater')
obj('harbour_light_lamp', bm_cyl(0.72, 0.72, 1.2, 10, (hp.x, hp.y, 8.4)), mat=M['beacon_red'], family='breakwater', shadow=False)
HL_POS = Vector((hp.x, hp.y, 9.0))

print('LAND built')
