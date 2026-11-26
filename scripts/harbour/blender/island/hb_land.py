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
terrain.set_flats(CJ.get('flats', []))      # integration G2: the battery platform
terrain.set_pads([dict(c=cv['c'], face=cv['face'], w=cv['w'], d=cv['d'], z=cv['z'], blend=2.5) for cv in CJ.get('civic', [])])   # P6 civic pads
terrain.set_lots(CJ.get('lots', []))        # Level building lot pads (+1.5 m flat + 2.5 m ramp)
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


def plot_rect(cv, grow=0.0):
    """A civic plot's rectangle (world), grown by `grow` metres on every side."""
    c = Vector(cv['c']); f = Vector(cv['face']); t = Vector((-f.y, f.x))
    hw, hd = cv['w'] / 2 + grow, cv['d'] / 2 + grow
    return [tuple(c + t * a + f * b) for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]


def in_pad(x, y, margin=0.0):
    return terrain.pad_at(x, y, margin) is not None


# ------------------------------------------------------------------ heightfield (Phase 3 adaptive breakline Delaunay)
def build_heightfield():
    from PIL import Image, ImageDraw
    from scipy import ndimage
    ring = _resample(COAST, 2.8)
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

    # Spatial deduplication grid (0.58 m minimum interior spacing; coast boundary always kept exact)
    DEDUP = 0.58
    DEDUP2 = DEDUP * DEDUP
    cell_map = {}
    pts = list(ring)
    for (px, py) in ring:
        cell_map.setdefault((int(math.floor(px / DEDUP)), int(math.floor(py / DEDUP))), []).append((px, py))

    def add_pt(px, py, min_coast=1.2):
        if not inside(px, py) or dcoast(px, py) <= min_coast:
            return
        cx, cy = int(math.floor(px / DEDUP)), int(math.floor(py / DEDUP))
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for (qx, qy) in cell_map.get((cx + di, cy + dj), ()):
                    if (px - qx) ** 2 + (py - qy) ** 2 < DEDUP2:
                        return
        cell_map.setdefault((cx, cy), []).append((px, py))
        pts.append((px, py))

    # 1. Base jittered hex grid (5.5 m) across flat/gentle terrain
    step = 5.5
    y = Y0
    while y < Y1:
        x = X0
        while x < X1:
            px, py = x + rng.uniform(-1.5, 1.5), y + rng.uniform(-1.5, 1.5)
            add_pt(px, py, 2.2)
            x += step
        y += step * 0.866

    # 2. Adaptive slope-driven refinement (2.4 m where local slope grad > 0.34: cliffs, cuesta scarps, ridges)
    s_steep = 2.4
    y = Y0
    while y < Y1:
        x = X0
        while x < X1:
            px, py = x + rng.uniform(-0.55, 0.55), y + rng.uniform(-0.55, 0.55)
            if inside(px, py) and dcoast(px, py) > 1.5:
                gx = (H(px + 1.2, py) - H(px - 1.2, py)) / 2.4
                gy = (H(px, py + 1.2) - H(px, py - 1.2)) / 2.4
                if gx * gx + gy * gy > 0.34 * 0.34:
                    add_pt(px, py, 1.5)
            x += s_steep
        y += s_steep * 0.866

    # 3. Finer facets on the Pharos headland and town bowl
    for (cu, cv, ru, rv, st) in ((terrain.HEAD_C[0], terrain.HEAD_C[1], 60, 34, 3.2), (CT_UV[0], CT_UV[1] + 60, 150, 90, 3.6)):
        v = cv - rv
        while v < cv + rv:
            u = cu - ru
            while u < cu + ru:
                px, py = wpt(u + rng.uniform(-0.8, 0.8), v + rng.uniform(-0.8, 0.8))
                add_pt(px, py, 1.6)
                u += st
            v += st * 0.866

    # 4. Coastal cliff rim breakline row (~1.6 m inland along non-quay, non-beach cliff rims >= 2.8 m)
    n_ring = len(ring)
    for i in range(n_ring):
        a = Vector(ring[(i - 1) % n_ring]); p = Vector(ring[i]); b = Vector(ring[(i + 1) % n_ring])
        if on_quay(p.x, p.y, 1.4) or terrain.beach_k(p.x, p.y)[0] > 0.35:
            continue
        if H(p.x, p.y) >= 2.6:
            tng = (b - a).normalized()
            nin = Vector((-tng.y, tng.x))
            if not inside(p.x + nin.x * 1.6, p.y + nin.y * 1.6):
                nin = -nin
            add_pt(p.x + nin.x * 1.6, p.y + nin.y * 1.6, 0.9)

    # 5. Universal flush road & footpath breakline rows (every road/path in terrain._roads)
    for (_rname, _rkind, dense_uv, _zs, hw, _cut_m, _bb) in terrain._roads:
        n_d = len(dense_uv)
        offs = (-hw - 0.55, -hw, 0.0, hw, hw + 0.55) if _rkind == 'road' else (-hw - 0.4, -hw, hw, hw + 0.4)
        for i in range(0, n_d, 1):
            u0, v0 = dense_uv[max(0, i - 1)]
            u1, v1 = dense_uv[min(n_d - 1, i + 1)]
            tu, tv = u1 - u0, v1 - v0
            tl = math.hypot(tu, tv) or 1.0
            nu, nv = -tv / tl, tu / tl
            cu, cv = dense_uv[i]
            for off in offs:
                px, py = wpt(cu + nu * off, cv + nv * off)
                add_pt(px, py, 1.1)

    # 6. Cultivated olive terraces (West, East, South): bench grid + contour riser top/foot breaklines
    def _contour_breaklines(c_uv, rr, weight_fn, step_h, riser_f, g=1.4, wmin=0.05):
        n_ = int(2 * rr / g) + 1
        grid_ = {}
        for i in range(n_):
            for j in range(n_):
                uu, vv = c_uv[0] - rr + i * g, c_uv[1] - rr + j * g
                if weight_fn(uu, vv) > wmin:
                    grid_[(i, j)] = terrain.height(*wpt(uu, vv), terraces=False, roads=False) / step_h
        for (i, j), k0 in grid_.items():
            for (di, dj) in ((1, 0), (0, 1)):
                k1 = grid_.get((i + di, j + dj))
                if k1 is None:
                    continue
                lo_, hi_ = min(k0, k1), max(k0, k1)
                for L in range(int(math.floor(lo_)) - 1, int(math.ceil(hi_)) + 1):
                    for lev in (L, L - riser_f):
                        if lo_ < lev < hi_:
                            t = (lev - k0) / (k1 - k0)
                            px, py = wpt(c_uv[0] - rr + (i + di * t) * g, c_uv[1] - rr + (j + dj * t) * g)
                            add_pt(px, py, 2.0)

    for (c, ru, rv, a) in terrain.TERRACES:
        rr = max(ru, rv) + 1.0
        v = c[1] - rr
        while v < c[1] + rr:
            u = c[0] - rr
            while u < c[0] + rr:
                uu, vv = u + rng.uniform(-0.35, 0.35), v + rng.uniform(-0.35, 0.35)
                if terrain.terrace_w(uu, vv) > 0.02:
                    px, py = wpt(uu, vv)
                    add_pt(px, py, 2.0)
                u += 2.4
            v += 2.4 * 0.866
        _contour_breaklines(c, rr, terrain.terrace_w, terrain.TERRACE_STEP, terrain.TERRACE_RISER, g=1.5)

    # 7. Stepped contour vineyard + ancient stepped limestone quarry breaklines
    vrr = max(terrain.VINE_RU, terrain.VINE_RV) + 1.0
    _contour_breaklines(terrain.VINE_UV, vrr, terrain.vine_w, terrain.VINE_STEP, terrain.VINE_RISER, g=1.3)
    qrr = max(terrain.QUARRY_RU, terrain.QUARRY_RV) + 1.5
    v = terrain.QUARRY_UV[1] - qrr
    while v < terrain.QUARRY_UV[1] + qrr:
        u = terrain.QUARRY_UV[0] - qrr
        while u < terrain.QUARRY_UV[0] + qrr:
            if terrain.quarry_w(u, v) > 0.02:
                add_pt(*wpt(u, v), 1.8)
            u += 1.9
        v += 1.9 * 0.866
    _contour_breaklines(terrain.QUARRY_UV, qrr, terrain.quarry_w, terrain.QUARRY_STEP, terrain.QUARRY_RISER, g=1.2)

    # 8. Vineyard + arable fields: crisp outline rows + 2.8 m interior grid in plough/hay for 3D furrow relief
    for _poly in [terrain.vineyard()[3]] + [f['poly'] for f in terrain.FIELDS]:
        for off in (-0.45, 0.45):
            for p in _resample(offset_poly(_poly, off), 1.9):
                add_pt(p[0], p[1], 2.0)
    for fl in terrain.FIELDS:
        if fl['kind'] not in ('plough', 'hay'):
            continue
        bb = fl['bb']
        fy = bb[1]
        while fy <= bb[3]:
            fx = bb[0]
            while fx <= bb[2]:
                if point_in_poly(fx, fy, fl['poly']):
                    add_pt(fx, fy, 2.2)
                fx += 2.8
            fy += 2.8 * 0.866

    # 9. Level discs (threshing floor, sanctuary temenos)
    for (cuv, r, b) in ((terrain.THRESHING_UV, terrain.THRESHING_R, 3.0), (terrain.SANCTUARY_UV, terrain.SANCTUARY_R, 4.0)):
        cx_, cy_ = wpt(*cuv)
        for k in range(int((r + b) / 1.8) + 1):
            rr = k * 1.8
            n = max(1, int(2 * math.pi * rr / 1.8))
            for i in range(n):
                add_pt(cx_ + math.cos(2 * math.pi * i / n) * rr, cy_ + math.sin(2 * math.pi * i / n) * rr, 2.0)

    # 10. Town terrace fronts, civic pads, and battery terrace courses
    for k in range(1, len(RINGS)):
        r0 = RINGS[k][0]
        th0, th1 = TOWN_TH[k]
        for rr in (r0 - 1.4, r0 - 0.35, r0 + 0.35):
            n = int(math.radians(th0 - th1 + 16) * rr / 2.2)
            for i in range(n + 1):
                th = th1 - 8 + (th0 - th1 + 16) * i / n
                add_pt(*town_pt(th, rr), 0.5)
    for cv in CJ.get('civic', []):
        for off in (-0.45, 0.45, 2.6):
            for p in _resample(plot_rect(cv, off), 2.2):
                add_pt(p[0], p[1], 1.0)
    # Building lot pad breaklines (+1.5 m flat pad + 2.5 m smooth ramp) so mesh conforms cleanly around every farmhouse/cottage/warehouse
    for _lot in CJ.get('lots', []):
        if _lot.get('band') is not None:
            continue
        _lc = Vector(_lot['c']); _lf = Vector(_lot['face']); _lt = Vector((-_lf.y, _lf.x))
        for off in (1.5, 4.0):
            _hw, _hd = _lot['w'] * 0.5 + off, _lot['d'] * 0.5 + off
            _lpoly = [tuple(_lc + _lt * a + _lf * b) for a, b in ((-_hw, -_hd), (_hw, -_hd), (_hw, _hd), (-_hw, _hd))]
            for p in _resample(_lpoly, 3.2):
                add_pt(p[0], p[1], 1.2)
    for fl in CJ.get('flats', []):
        te = fl.get('terrace')
        if not te:
            continue
        ring_f = [Vector(q) for q in fl['poly']]
        cen = sum(ring_f, Vector((0.0, 0.0))) / len(ring_f)
        for i in te['edges']:
            a, b = ring_f[i], ring_f[(i + 1) % len(ring_f)]
            t = (b - a).normalized(); nout = Vector((t.y, -t.x))
            if (cen - a).dot(nout) > 0:
                nout = -nout
            offs = [0.95] + [o for d_end, _ in te['courses'] for o in (d_end - 0.2, d_end + 0.95)] + [te['courses'][-1][0] + 3.5]
            for off in offs:
                for p in _resample([tuple(a + nout * off), tuple(b + nout * off)], 2.0, closed=False):
                    add_pt(p[0], p[1], 1.0)

    P = np.array(pts)
    tri = Delaunay(P)
    bm = bmesh.new()
    vs = [bm.verts.new((p[0], p[1], H(p[0], p[1]))) for p in pts]
    for t in tri.simplices:
        c = P[t].mean(axis=0)
        if not inside(c[0], c[1]):
            continue
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
    print(f'HEIGHTFIELD verts={len(bm.verts)} tris={len(bm.faces)}')
    return bm


PAD_COL = {'shipyard': (lin('#A79E89'), 'cobble'), 'burn': (lin('#8F8A80'), 'cobble')}
# Warm Mediterranean sunlit turf terrace tread & crushed limestone roadbeds (Alexandrian limestone family)
TREAD = tuple(a * 0.72 + b * 0.28 for a, b in zip(lin('#7E934A'), lin('#A48D6A')))
ROAD_COL = lin('#C7B99B')
PATH_COL = lin('#B69F7D')
QUARRY_CUT = lin('#D8CAA9')
QUARRY_FLOOR = lin('#CBBBA0')
RISER_LIME_A = lin('#C2B394')
RISER_LIME_B = lin('#B4A383')
SCREE_LIME = lin('#BFA988')


def hf_face(q):
    c = q.center; nz = q.normal.z
    u, v = uvp(c.x, c.y)
    pd = terrain.pad_at(c.x, c.y, 0.0)
    if pd is not None and nz > 0.9:                 # P6 civic pads: paved (the building's own model stands on it)
        return (jitter_col(PAL['cobble'], 0.96 + 0.08 * terrain.fbm(c.x, c.y, 0.05, 2, 13)), PT['cobble'])
    nn = terrain.fbm(c.x, c.y, 0.02, 2, 11)
    kb, kind = terrain.beach_k(c.x, c.y)

    # Flush painted rural roads & footpaths (PT['grass'] so hb_terrain blends seamlessly with terrain-splat.R)
    rq = terrain.road_info(c.x, c.y)
    if rq is not None and rq[0] <= rq[1] + 0.35 and nz > 0.72 and kb < 0.4:
        dd, hw, rkind, _rname, _grade = rq
        base_r = ROAD_COL if rkind == 'road' else PATH_COL
        verge = terrain.sstep(max(0.0, hw - 0.35), hw + 0.35, dd)
        col_r = tuple(base_r[i] * (1.0 - 0.22 * verge) + PAL['earth'][i] * (0.22 * verge) for i in range(3))
        return (jitter_col(col_r, 0.95 + 0.10 * nn), PT['grass'])

    # Ancient stepped limestone quarry behind the Mint: freshly-cut cream Alexandrian limestone (PT['rock'])
    qw, qf = terrain.quarry_info(c.x, c.y)
    if qw > 0.35:
        is_cut = (qf > 1.0 - terrain.QUARRY_RISER - 0.08 or qf < 0.05 or nz < 0.86)
        col_q = QUARRY_CUT if is_cut else QUARRY_FLOOR
        return (jitter_col(col_q, 0.95 + 0.10 * nn), PT['rock'])

    # Cultivated olive terraces & stepped contour vineyard: warm limestone risers (PT['rock']), worked-earth treads
    tw, tf = terrain.terrace_info(c.x, c.y)
    if tw > 0.40:
        is_riser = (tf > 1.0 - terrain.TERRACE_RISER - 0.04 or tf < 0.04) and nz < 0.96
        if is_riser:
            col_tr = RISER_LIME_A if nn > 0.48 else RISER_LIME_B
            return (jitter_col(col_tr, 0.94 + 0.12 * nn), PT['rock'])
        if terrain.in_vineyard(c.x, c.y):
            return (jitter_col(lin('#9A7D5B'), 0.94 + 0.12 * nn), PT['grass'])
        return (jitter_col(TREAD, 0.94 + 0.12 * nn), PT['grass'])

    # Steep karst limestone cliffs (warm Alexandrian limestone, PT['rock'] triggers biplanar strata);
    # moderate slopes (0.54 <= nz < 0.78) stay PT['grass'] so terrain.ts blends slope-rock smoothly per-pixel!
    if nz < 0.54:
        rn = terrain.ridge_noise(c.x, c.y, 0.032, 2, 17)
        col_k = PAL['rock_light'] if (nz > 0.38 and rn > 0.52) else (PAL['rock'] if nn > 0.42 else PAL['rock_dark'])
        return (jitter_col(col_k, 0.94 + 0.12 * nn), PT['rock'])
    if nz < 0.78:
        return (jitter_col(lin('#758848'), 0.94 + 0.12 * nn), PT['grass'])

    # Strands: sand / shingle / pebbles (Layer 4 in hb_terrain)
    if kb > 0.45:
        dc = terrain.dcoast(c.x, c.y)
        if kind == 'sand':
            col = SHINGLE if dc < 3.5 else (SAND if dc < 42 else lin('#B9B07A'))
            pn = terrain.fbm(c.x, c.y, 0.035, 2, 77)
            if 5.5 < dc < 8.0 and nn > 0.46:
                col = SHINGLE
            elif 9.0 < dc < 36.0 and pn > 0.64:
                col = tuple(SAND[i] * 0.55 + SHINGLE[i] * 0.45 for i in range(3))
            elif 9.0 < dc < 36.0 and pn < 0.32:
                col = tuple(v * 0.9 for v in SAND)
            elif 22.0 < dc < 26.0:
                col = tuple(SAND[i] * 0.72 + lin('#A79A78')[i] * 0.28 for i in range(3))
            elif dc > 38.0 and nn > 0.55:
                col = lin('#A9A779')
        else:
            col = PEBBLE if dc < 7.5 else lin('#A6A77A')
        return (jitter_col(col, 0.95 + 0.1 * nn), PT['plain'])

    if terrain.in_vineyard(c.x, c.y):
        return (jitter_col(lin('#9A7D5B'), 0.94 + 0.12 * nn), PT['grass'])

    fl = terrain.field_at(c.x, c.y)
    if fl is not None:
        fc = lin(terrain.FIELD_COL[fl['kind']])
        if fl['kind'] in ('plough', 'hay'):
            phase = math.sin((u * 0.9 + v * 0.3) * (2.0 * math.pi / 3.4))
            return (jitter_col(fc, 0.98 + 0.065 * phase), PT['crop'])
        return (jitter_col(fc, 0.96 + 0.08 * nn), PT['grass'])

    base = PAL['grass']
    hd = terrain.head_d(u, v)
    if hd < 1.1:
        base = lin('#869458')                                                    # sun-warmed wind-cropped headland turf
    elif c.z > 18 or terrain.line_d(u, v, terrain.WEST_SPINE) < 22 or terrain.line_d(u, v, terrain.EAST_SPINE) < 22:
        base = lin('#6A7E44')                                                    # Mediterranean pine-slope floor
    n2 = terrain.fbm(c.x, c.y, 0.006, 3, 5)
    t = max(0.0, min(1.0, (n2 - 0.38) / 0.26))
    lo, hi = jitter_col(base, 0.91), jitter_col(base, 1.09)
    return (tuple(lo[i] + (hi[i] - lo[i]) * t for i in range(3)), PT['grass'])


HF = obj('land_terrain', build_heightfield(), face=hf_face, jitter=0.0, seed=4, family='terrain', smooth=True)


class _VQ:          # a vertex dressed as a face for hf_face (centre + normal)
    __slots__ = ('center', 'normal')


def _terrain_paint(me):
    """Smooth-shaded ground with painterly per-vertex colour: hf_face's ground type at each vertex (pattern id
    stays per face), broken up by sun-cured Mediterranean dry-grass & garrigue drifts on open turf only."""
    me.calc_normals_split() if hasattr(me, 'calc_normals_split') else None
    vcol = np.zeros((len(me.vertices), 3), np.float32)
    dry, moss, heath_ = lin('#C0B272'), lin('#657D40'), lin('#927D94')
    q = _VQ()
    for v in me.vertices:
        q.center = v.co; q.normal = v.normal
        c, _pt = hf_face(q)
        c = Vector(c[:3])
        x, y = v.co.x, v.co.y
        u_, v_ = uvp(x, y)
        rq = terrain.road_info(x, y)
        on_road = rq is not None and rq[0] <= rq[1] + 0.55
        in_quarry = terrain.quarry_w(u_, v_) > 0.25
        on_beach = terrain.beach_k(x, y)[0] > 0.35
        if (v.normal.z > 0.78 and not on_road and not in_quarry and not on_beach
                and terrain.field_at(x, y) is None and not terrain.in_vineyard(x, y)
                and terrain.pad_at(x, y, 0.5) is None):
            n1 = terrain.fbm(x, y, 0.016, 3, 31)          # meadow drifts (tens of metres)
            n2 = terrain.fbm(x, y, 0.07, 2, 37)           # patches (a few metres)
            k_dry = max(0.0, min(1.0, (n1 - 0.54) / 0.12)) * 0.42
            k_moss = max(0.0, min(1.0, (0.41 - n1) / 0.1)) * 0.30
            c = c.lerp(dry, k_dry).lerp(moss, k_moss)
            hd = terrain.head_d(u_, v_)
            if hd < 1.15 and n2 > 0.58:
                c = c.lerp(heath_, 0.32 * min(1.0, (n2 - 0.58) / 0.1))
            c = c * (0.93 + 0.14 * n2)
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

# ------------------------------------------------------------------ E20 (O6-I7): warm built land
# The retaining walls are Alexandrian limestone on a sandstone foot under a pale dressed coping (they were the Northern
# 'granite' tower stone, which read as concrete). Same wall geometry; colour only.
LIMESTONE, COPING_STONE, FOOT_STONE = lin('#BDAE8C'), lin('#D8CCB0'), lin('#A8956F')


def foot_gradient(ob, foot=FOOT_STONE, top=LIMESTONE):
    """E20: each wall face darkens to the sandstone foot at its lowest corners (the GPU blends it up the face); the
    authored jitter and the pattern id (alpha) are kept."""
    me = ob.data
    col = me.color_attributes['Col']
    n = len(me.loops)
    buf = np.zeros(n * 4, np.float32); col.data.foreach_get('color', buf); buf = buf.reshape(-1, 4)
    co = np.zeros(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    li = np.zeros(n, np.int64); me.loops.foreach_get('vertex_index', li)
    k = np.array([foot[i] / max(top[i], 1e-6) for i in range(3)], np.float32)
    for poly in me.polygons:
        ls = np.array(poly.loop_indices)
        zs = co[li[ls], 2]
        if zs.max() - zs.min() < 0.05:
            continue
        t = (zs - zs.min()) / (zs.max() - zs.min())
        buf[ls, :3] *= k[None, :] + (1.0 - k[None, :]) * t[:, None]
    col.data.foreach_set('color', buf.ravel())
    return ob


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
        if in_pad(*town_pt((a_ + b_) / 2, r0), 1.2):
            continue
        merge(tw_, nl_kit.beam((pa[0], pa[1], (zb - 0.8 + z + 0.05) / 2), (pb[0], pb[1], (zb - 0.8 + z + 0.05) / 2), 1.0, z + 0.85 - zb))
        ca, cb = town_pt(a_, r0 - 0.4), town_pt(b_, r0 - 0.4)
        merge(tc_, nl_kit.beam((ca[0], ca[1], z + 0.25), (cb[0], cb[1], z + 0.25), 1.35, 0.4))
    for th in (th0, th1):
        p = town_pt(th, r0 - 0.5)
        if in_pad(*p, 1.5):
            continue
        merge(tw_, bm_box(2.0, 2.0, z + 0.3 - zb + 0.8, (p[0], p[1], zb - 0.8 + (z + 0.3 - zb + 0.8) / 2)))
    # ivy + valerian tumbling over the walls (A graft)
    th = th0 - irng.uniform(1, 4)
    while th > th1 + 2:
        w_ = irng.uniform(2.5, 6.0); h_ = (z - zb) * irng.uniform(0.45, 0.95)
        p = town_pt(th, r0 - 1.0)
        tn = Vector(town_pt(th - 1, r0)) - Vector(town_pt(th + 1, r0)); ang = math.atan2(tn.y, tn.x)
        b = bm_ico(1.0, (0, 0, 0), 1, (w_ / 2, 0.36, h_ / 2), seed=irng.randint(0, 999), amp=0.18)
        p = town_pt(th, r0 - 0.75)                   # hugging the wall face (never a dark spike standing off it)
        if in_pad(*p, 2.0):
            th -= math.degrees((w_ + irng.uniform(3.0, 14.0)) / r0); b.free()
            continue
        xf(b, rz=ang); xf(b, loc=(p[0], p[1], z - h_ / 2 + 0.15))
        merge(ivy, b)
        if irng.random() < 0.45:
            for kk in range(3):
                q = town_pt(th + irng.uniform(-1.2, 1.2), r0 - 1.5)
                merge(ivyf, bm_pebble(0.32, (q[0], q[1], z - irng.uniform(0.3, h_)), seed=kk))
        th -= math.degrees((w_ + irng.uniform(3.0, 14.0)) / r0)
foot_gradient(obj('terrace_walls', tw_, LIMESTONE, PT['ashlar'], family='quay', bevel=0.04))
obj('terrace_coping', tc_, COPING_STONE, PT['plain'], family='quay', bevel=0.04)
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
        if in_pad((a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2, 1.0):
            continue
        merge(lanes_bm, nl_kit.beam((a_[0], a_[1], z + 0.04), (b_[0], b_[1], z + 0.04), 3.2, 0.24))
obj('town_lanes', lanes_bm, PAL['gravel'], PT['cobble'], family='town', jitter=0.03)
STAIRS = []


def stair_clear(th, band):
    """A flight at theta climbing onto `band` stays on both bands' arcs, off the civic pads and clear of every lot."""
    r0 = RINGS[band][0]; za = RINGS[band - 1][2]; zb = RINGS[band][2]
    if any(not (TOWN_TH[k][1] + 2.0 < th < TOWN_TH[k][0] - 2.0) for k in (band - 1, band)):
        return False
    if in_pad(*town_pt(th, r0 - 2.0), 3.0) or in_pad(*town_pt(th, r0 + 1.0), 3.0):
        return False
    run = int((zb - za) / 0.3) * 0.34
    for i in range(int((run + 5.1) / 0.5) + 1):            # the walked corridor: foot landing to head landing, 3.8 m wide
        r = r0 - 3.4 - run + i * 0.5
        for s in (-1.9, 0.0, 1.9):
            x, y = town_pt(th + math.degrees(s / r), r)
            for l in CJ['lots']:
                fx, fy = l['face']; dx, dy = x - l['c'][0], y - l['c'][1]
                if abs(dx * fx + dy * fy) < l['d'] / 2 + 0.2 and abs(dy * fx - dx * fy) < l['w'] / 2 + 0.2:
                    return False
    return True


# P6 put civic plots over most of compose's stair thetas (and the battery strip over one): each flight slides to the
# nearest clear theta (<= 30 deg, 10 deg from its band's other flights) so the terraces stay tied to the quays
STAIR_AT = []
for (th, band) in TOWN['stairs']:
    for dth in [0.0] + [s * j * 0.5 for j in range(1, 61) for s in (1, -1)]:
        if all(abs(th + dth - t) > 10.0 for t, b in STAIR_AT if b == band) and stair_clear(th + dth, band):
            STAIR_AT.append((th + dth, band))
            break
for (th, band) in STAIR_AT:
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
APRON = {'grand': 9.0, 'long': 12.0, 'tron': 11.0, 'westq': 6.0, 'battery': 8.0, 'wharf': 9.5}


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
    if name == 'yard':
        continue
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

# ------------------------------------------------------------------ Phase 3 road/path/quay masonry details
# 1. Quay-back limestone toe walls (0.8-1.8 m) along long, westq, wharf seams where ground rises behind apron
qtoe, qtoe_c = bmesh.new(), bmesh.new()
for _qname in ('long', 'westq', 'wharf'):
    if _qname not in QL:
        continue
    _qpts = _resample(QL[_qname], 2.4, closed=False)
    _qd = APRON.get(_qname, 8.0)
    for i in range(len(_qpts) - 1):
        a = Vector(_qpts[i]); b = Vector(_qpts[i + 1])
        t = (b - a)
        if t.length < 0.3:
            continue
        t.normalize(); nl = Vector((-t.y, t.x))
        p0 = a + nl * (_qd + 0.45); p1 = b + nl * (_qd + 0.45)
        pm = (p0 + p1) * 0.5
        if not point_in_poly(pm.x, pm.y, COAST) or in_pad(pm.x, pm.y, 2.2):
            continue
        rq_ = terrain.road_info(pm.x, pm.y)
        if rq_ is not None and rq_[0] < rq_[1] + 2.2:
            continue
        # Skip if any town lot overlaps this seam
        lot_hit = False
        for _l in CJ['lots']:
            fx, fy = _l['face']; dx, dy = pm.x - _l['c'][0], pm.y - _l['c'][1]
            if abs(dx * fx + dy * fy) < _l['d'] * 0.5 + 1.8 and abs(dy * fx - dx * fy) < _l['w'] * 0.5 + 1.8:
                lot_hit = True; break
        if lot_hit:
            continue
        # Check hill rise 2.0 m behind the apron seam
        p_in = pm + nl * 2.0
        if not point_in_poly(p_in.x, p_in.y, COAST):
            continue
        zh = H(p_in.x, p_in.y)
        if zh - Z_SHORE < 0.72:
            continue
        top_z = Z_SHORE + min(1.80, max(0.80, (zh - Z_SHORE) * 0.92 + 0.15))
        lo_z = Z_SHORE - 0.55
        merge(qtoe, nl_kit.beam((p0.x, p0.y, (lo_z + top_z) * 0.5), (p1.x, p1.y, (lo_z + top_z) * 0.5), 0.72, top_z - lo_z))
        merge(qtoe_c, nl_kit.beam((p0.x, p0.y, top_z + 0.08), (p1.x, p1.y, top_z + 0.08), 0.88, 0.18))
if len(qtoe.faces):
    foot_gradient(obj('quay_toe_walls', qtoe, LIMESTONE, PT['ashlar'], family='quay', bevel=0.03))
    obj('quay_toe_coping', qtoe_c, COPING_STONE, PT['plain'], family='quay', jitter=0.05)
else:
    qtoe.free(); qtoe_c.free()

# 2. Built dressed limestone stone steps on steep rural footpaths (grade > 15 deg = 0.268)
# 3. Low dressed limestone downhill kerbs (0.35-0.85 m) on steep rural road cross-slopes (> 0.25)
psteps, rkerbs, rkerbs_c = bmesh.new(), bmesh.new(), bmesh.new()
for (_rname, _rkind, dense_uv, zs_r, hw, _cut_m, _bb) in terrain._roads:
    n_d = len(dense_uv)
    if _rkind == 'path':
        for i in range(n_d - 1):
            a_uv, b_uv = dense_uv[i], dense_uv[i + 1]
            pa = Vector(wpt(*a_uv)); pb = Vector(wpt(*b_uv))
            seg = pb - pa; seg_l = seg.length
            if seg_l < 0.4 or not point_in_poly(pa.x, pa.y, COAST) or not point_in_poly(pb.x, pb.y, COAST):
                continue
            za, zb = H(pa.x, pa.y), H(pb.x, pb.y)
            grade = abs(zb - za) / seg_l
            if grade <= 0.268:
                continue
            pm = (pa + pb) * 0.5
            if in_pad(pm.x, pm.y, 1.8) or terrain.beach_k(pm.x, pm.y)[0] > 0.35 or on_quay(pm.x, pm.y, 3.0):
                continue
            dir_v = seg.normalized()
            n_st = max(2, int(round(seg_l / 0.42)))
            st_w = min(2.0, hw * 1.75)
            for k in range(n_st):
                t0 = (k + 0.5) / n_st
                q_ = pa.lerp(pb, t0)
                zq = za + (zb - za) * t0
                merge(psteps, nl_kit.obox((q_.x, q_.y, zq - 0.10), (dir_v.x, dir_v.y, 0.0), 0.44, st_w, 0.32))
    elif _rkind == 'road':
        for i in range(0, n_d - 1, 2):
            j = min(n_d - 1, i + 2)
            pa = Vector(wpt(*dense_uv[i])); pb = Vector(wpt(*dense_uv[j]))
            seg = pb - pa; seg_l = seg.length
            if seg_l < 0.8:
                continue
            pm = (pa + pb) * 0.5
            if not point_in_poly(pm.x, pm.y, COAST) or in_pad(pm.x, pm.y, 2.2) or terrain.beach_k(pm.x, pm.y)[0] > 0.35 or on_quay(pm.x, pm.y, 4.0):
                continue
            t = seg.normalized(); nl = Vector((-t.y, t.x))
            zm = H(pm.x, pm.y)
            # Test both sides of the road 2.4 m outside road edge for steep downhill drop
            for sgn in (-1.0, 1.0):
                p_out = pm + nl * sgn * (hw + 2.4)
                if not point_in_poly(p_out.x, p_out.y, COAST):
                    continue
                drop = zm - H(p_out.x, p_out.y)
                if drop > 0.62:  # cross-slope > 0.25 over 2.4 m
                    kh = min(0.85, max(0.35, drop * 0.45))
                    k0 = pa + nl * sgn * (hw + 0.15)
                    k1 = pb + nl * sgn * (hw + 0.15)
                    z0 = H(k0.x, k0.y); z1 = H(k1.x, k1.y)
                    zc = 0.5 * (z0 + z1)
                    merge(rkerbs, nl_kit.beam((k0.x, k0.y, z0 - 0.35), (k1.x, k1.y, z1 - 0.35), 0.42, kh + 0.70))
                    merge(rkerbs_c, nl_kit.beam((k0.x, k0.y, z0 + kh * 0.5 + 0.04), (k1.x, k1.y, z1 + kh * 0.5 + 0.04), 0.50, 0.12))
if len(psteps.faces):
    obj('land_path_steps', psteps, LIMESTONE, PT['ashlar'], family='quay', jitter=0.05)
else:
    psteps.free()
if len(rkerbs.faces):
    obj('land_road_kerbs', rkerbs, LIMESTONE, PT['ashlar'], family='quay', jitter=0.06)
    obj('land_road_kerb_coping', rkerbs_c, COPING_STONE, PT['plain'], family='quay', jitter=0.04)
else:
    rkerbs.free(); rkerbs_c.free()

# ------------------------------------------------------------------ piers: plank decks laid across each pier's own axis
set_coll(collection('harbour', ROOTC))
by_pi = {}
for s in CJ['struct']:
    if s['kind'] in ('pier', 'finger', 'thead'):
        by_pi.setdefault(s['pi'], []).append(s)
dk_slab, dk_plank, dk_frame, dk_piles, dk_rail, stone, stone_pave, stone_cope = (bmesh.new() for _ in range(8))
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
        # P7: dressed stone jetties (Tron's deep-water harbour, the Hyperliquid jetty): ashlar walls, a paving of ~2.2 m
        # flags (fine enough that the baked AO stays local), a raised granite coping round every edge
        bm = bmesh.new(); pv_ = bmesh.new(); cp_ = bmesh.new()
        for (x0, y0, x1, y1, _) in rects:
            merge(bm, bm_box2(x0, y0, SEA_FLOOR, x1, y1, deck - 0.03))
            nx_ = max(1, round((x1 - x0) / 2.2)); ny_ = max(1, round((y1 - y0) / 2.2))
            for i_ in range(nx_):
                for j_ in range(ny_):
                    a0 = x0 + (x1 - x0) * i_ / nx_; a1 = x0 + (x1 - x0) * (i_ + 1) / nx_
                    b0 = y0 + (y1 - y0) * j_ / ny_; b1 = y0 + (y1 - y0) * (j_ + 1) / ny_
                    pv_.faces.new([pv_.verts.new(p) for p in ((a0, b0, deck), (a1, b0, deck), (a1, b1, deck), (a0, b1, deck))])
            cw_ = 0.55
            for (c0, c1, c2, c3) in ((x0, y0, x1, y0 + cw_), (x0, y1 - cw_, x1, y1), (x0, y0, x0 + cw_, y1), (x1 - cw_, y0, x1, y1)):
                merge(cp_, bm_box2(c0, c1, deck - 0.05, c2, c3, deck + 0.16))
        for b_ in (bm, pv_, cp_):
            xf(b_, rz=ang); xf(b_, loc=(root.x, root.y, 0))
        merge(stone, bm); merge(stone_pave, pv_); merge(stone_cope, cp_)
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
    obj('pier_stone_paving', stone_pave, face=lambda q: (jitter_col(PAL['quay'], 0.9 + 0.2 * ((q.index * 2654435761) % 997) / 997.0), PT['cobble']),
        family='pier', jitter=0.0)
    obj('pier_stone_coping', stone_cope, PAL['granite_light'], PT['ashlar'], family='pier', jitter=0.05, bevel=0.04)
else:
    stone.free(); stone_pave.free(); stone_cope.free()

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
for (x, y, z) in CJ['bollards']:      # B24: five sides (a 0.5 m iron post is a few pixels even at the closest zoom)
    nl_kit.bollard(bol, (x, y, z + (0.06 if z > 2 else 0.0)), 0.75 if z < 2 else 1.0, segs=5)
obj('bollards', bol, PAL['iron'], PT['metal'], family='quay')

# ------------------------------------------------------------------ beacon columns (classical-town Q6): the harbour lights
BEACON_RED, BEACON_GREEN = lin('#B8392B'), lin('#3E8C5C')
FLAME_RED, FLAME_GREEN = lin('#E8432C'), lin('#3FCB66')


def beacon_column(name, c, z0, z_fire, band, family, base_r=2.0, flame=None):
    """A squat stone fire-beacon (integration G3: nothing but the Pharos may read as a lighthouse): a stepped plinth
    whose lower course carries the painted band in `band` (port red / starboard green / a chain colour), a low square
    altar pedestal with a moulded cornice, and a wide bronze fire-bowl whose flame (hb_emissive core + tongues in the
    light's own colour) burns round z_fire."""
    x, y = c
    st, bd, br, fl = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    merge(st, bm_cyl(base_r, base_r, 0.4, 12, (x, y, z0)))
    merge(bd, bm_cyl(base_r * 0.74, base_r * 0.74, 0.45, 12, (x, y, z0 + 0.4)))          # the painted course
    zp0, zp1 = z0 + 0.85, z_fire - 0.95
    merge(st, bm_cyl(1.2, 1.2, 0.22, 4, (x, y, zp0), rot=math.pi / 4))
    merge(st, bm_cyl(0.98, 0.98, zp1 - zp0 - 0.22, 4, (x, y, zp0 + 0.22), rot=math.pi / 4))
    merge(st, bm_cyl(1.05, 1.28, 0.26, 4, (x, y, zp1 - 0.26), rot=math.pi / 4))
    merge(br, bm_cyl(0.32, 0.38, 0.3, 8, (x, y, zp1)))
    merge(br, bm_cyl(0.42, 1.38, 0.62, 12, (x, y, zp1 + 0.28)))
    for k in range(5):
        a_ = 2 * math.pi * k / 5 + 0.3
        merge(fl, bm_cyl(0.34, 0.0, 0.95 + 0.25 * (k % 2), 5, (x + math.cos(a_) * 0.62, y + math.sin(a_) * 0.62, z_fire - 0.12)))
    obj(name + '_column', st, PAL['lime'], PT['ashlar'], family=family, bevel=0.03)
    obj(name + '_bands', bd, band, PT['render'], family=family, jitter=0.0)
    obj(name + '_bowl', br, lin('#9A6430'), PT['metal'], family=family)
    obj(name + '_flame', fl, flame or band, PT['plain'], family=family, jitter=0.0, shadow=False)
    obj(name + '_lamp', bm_cyl(0.8, 0.06, 1.5, 7, (x, y, z_fire - 0.2)), mat=M['lamp'], family=family, shadow=False)


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
        z_top = rng_bw.uniform(0.35, 1.45) - k * 0.48
        yaw_bw = math.atan2(t.y, t.x) + rng_bw.uniform(-0.6, 0.6)
        reef_outcrop(rub, c.x, c.y, r, z_top, yaw_bw, seed=i * 19 + k + 501, n_slabs=(2 if k == 0 else 1), z_bot=-3.0)
        CIRCLES.append((c.x, c.y, r * 1.15))
obj('breakwater_rubble', rub, face=reef_rock_face, family='breakwater', jitter=0.06)

# Angular limestone riprap armour blocks at breakwater root (outer sea side) & mole roots (landward of all berths)
riprap = bmesh.new()
_rr_rng = random.Random(314)
if len(frames) >= 4:
    for fi in range(min(6, len(frames) - 1)):
        p, t, nrm = frames[fi]
        for k in range(3):
            c = p + nrm * (BWW * 0.5 + 1.0 + k * 1.45) + t * _rr_rng.uniform(-1.2, 1.2)
            bw_b = bm_box(_rr_rng.uniform(1.1, 1.9), _rr_rng.uniform(0.9, 1.6), _rr_rng.uniform(0.8, 1.4))
            xf(bw_b, rx=_rr_rng.uniform(-0.35, 0.35), ry=_rr_rng.uniform(-0.35, 0.35), rz=_rr_rng.uniform(0, 6.28),
               loc=(c.x, c.y, _rr_rng.uniform(0.15, 1.15) - k * 0.35))
            merge(riprap, bw_b)
for _m in CJ.get('moles', []):
    _mpts = [Vector(p) for p in _m['line']]
    if len(_mpts) < 2:
        continue
    _root = _mpts[0]; _mt = (_mpts[1] - _mpts[0]).normalized(); _mn = Vector((-_mt.y, _mt.x))
    _mw = _m['width']
    for sgn in (-1.0, 1.0):
        for k in range(4):
            c = _root + _mt * (0.4 + k * 1.15) + _mn * sgn * (_mw * 0.5 + 0.65 + (k % 2) * 0.45)
            mb_ = bm_box(_rr_rng.uniform(0.95, 1.55), _rr_rng.uniform(0.8, 1.35), _rr_rng.uniform(0.7, 1.25))
            xf(mb_, rx=_rr_rng.uniform(-0.3, 0.3), ry=_rr_rng.uniform(-0.3, 0.3), rz=_rr_rng.uniform(0, 6.28),
               loc=(c.x, c.y, _rr_rng.uniform(0.15, 0.95)))
            merge(riprap, mb_)
if len(riprap.faces):
    obj('breakwater_riprap', riprap, face=lambda q: ((PAL['rock_wet'] if q.center.z < 0.42 else (PAL['rock_light'] if q.normal.z > 0.55 else PAL['rock'])), PT['rock']),
        family='breakwater', jitter=0.07)
else:
    riprap.free()
left = [tuple(p + nrm * (BWW / 2)) for p, t, nrm in frames]; right = [tuple(p - nrm * (BWW / 2)) for p, t, nrm in frames]
STRUCT_POLYS.append([(v[0], v[1]) for v in left + right[::-1]])
hp = BW[-1]
hl = bm_cyl(4.2, 4.2, 6.6, 20, (hp.x, hp.y, SEA_FLOOR))
obj('harbour_light_base', hl, face=lambda q: ((PAL['quay'], PT['plain']) if q.normal.z > 0.9 else (PAL['quay_dark'], PT['ashlar'])), family='breakwater', bevel=0.05)
CIRCLES.append((hp.x, hp.y, 4.4))
beacon_column('harbour_light', (hp.x, hp.y), 2.6, 6.0, BEACON_RED, 'breakwater', flame=FLAME_RED)
HL_POS = Vector((hp.x, hp.y, 6.5))

# ------------------------------------------------------------------ the marina's stone moles (v5): ashlar walls straight
# down to the sea floor (hulls lie bow-in along both faces), granite copings, a raised flagstone promenade down the
# middle (benches, little planted trees between the lamps), and a round pierhead bastion carrying a proper harbour
# light (green: the Grand Mole, red: the Inner) with its gallery and lantern
set_coll(collection('marina', ROOTC))
mcrest, mcop, mband = bmesh.new(), bmesh.new(), bmesh.new()
mprom, mbench, mplant = bmesh.new(), bmesh.new(), bmesh.new()
MOLE_TOWERS = []
MOLE_TREE_SITES = []
mopus, mamph, mrope, mcap, mexed, mbronze = (bmesh.new() for _ in range(6))     # 08-T7 (prettier): the mole's rhythm
_t7 = random.Random(707)


def _amphora(bm_, x, y, z, s=1.0, lean=0.0, rz=0.0):
    a_ = bm_cyl(0.06 * s, 0.19 * s, 0.32 * s, 6, (0, 0, 0.0)); merge(a_, bm_cyl(0.19 * s, 0.05 * s, 0.3 * s, 6, (0, 0, 0.32 * s)))
    merge(a_, bm_cyl(0.05 * s, 0.07 * s, 0.1 * s, 5, (0, 0, 0.62 * s)))
    merge(bm_, xf(a_, loc=(x, y, z), rx=lean, rz=rz))


def _berth_props(p, t, n, z):
    """An amphora stack, a coiled hawser or a capstan (all under 1 m), by turns, at a promenade edge."""
    kind = _t7.randrange(3)
    if kind == 0:
        for j in range(_t7.randint(3, 5)):
            q = p + t * _t7.uniform(-0.7, 0.7) + n * _t7.uniform(-0.3, 0.3)
            _amphora(mamph, q.x, q.y, z, _t7.uniform(0.85, 1.05), lean=(0.35 if j == 0 else 0.0), rz=_t7.uniform(0, 6.28))
    elif kind == 1:
        for j in range(_t7.randint(1, 2)):
            q = p + t * (j * 1.15 - 0.5)
            merge(mrope, bm_cyl(0.5, 0.5, 0.16, 10, (q.x, q.y, z))); merge(mrope, bm_cyl(0.34, 0.34, 0.17, 10, (q.x, q.y, z + 0.16)))
    else:
        merge(mcap, bm_cyl(0.28, 0.24, 0.62, 8, (p.x, p.y, z))); merge(mcap, bm_cyl(0.38, 0.38, 0.12, 8, (p.x, p.y, z + 0.62)))
        a0 = _t7.uniform(0, 3.14)
        for a_ in (a0, a0 + math.pi / 2):
            d_ = Vector((math.cos(a_), math.sin(a_))) * 0.8
            merge(mcap, nl_kit.beam((p.x - d_.x, p.y - d_.y, z + 0.55), (p.x + d_.x, p.y + d_.y, z + 0.55), 0.07, 0.07))


ETH_BAND = lin(CJ['pennant']['pier-ethereum'])
_mrng = random.Random(41)


def _bench(bm_, p, ang, z):
    b_ = bmesh.new()
    merge(b_, bm_box2(-0.95, -0.28, 0.38, 0.95, 0.28, 0.52)); merge(b_, bm_box2(-0.95, 0.2, 0.52, 0.95, 0.38, 0.92))   # a stone seat
    for dx in (-0.7, 0.7):
        merge(b_, bm_box2(dx - 0.18, -0.24, 0.0, dx + 0.18, 0.3, 0.38))
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
    # the walk's furniture by arc length: the lamps stand on its 24 m stations (compose LAMPS; E09: at the root, the
    # exedra and the head only), a pair of benches back to back between each two, and a little planted tree in a stone
    # tub every other gap
    Lw = polyline_len([tuple(f[0]) for f in walk]); s_ = 24.0; k_ = 0
    wl = [tuple(f[0]) for f in walk]
    # 08-T7: a darker opus band across the walk under every lamp (12 + 24k), berth gear at a walk edge between (18 + 24k,
    # alternate sides; nothing on the boat-side aprons), and a stone exedra with an empty plinth at mid-length
    s_mid = 24.0 * max(1, round(Lw / 48.0))
    sb = 12.0
    while sb < Lw - 4.0:
        pb_, tb_ = along(wl, sb); pb_ = Vector(pb_); tb_ = Vector(tb_)
        merge(mopus, nl_kit.beam(tuple(pb_ - tb_ * 0.8) + (Z_SHORE + 0.215,), tuple(pb_ + tb_ * 0.8) + (Z_SHORE + 0.215,), pw - 0.5, 0.03))
        if sb + 6.0 < Lw - 8.0 and abs(sb + 6.0 - s_mid) > 6.0:
            pp_, tp_ = along(wl, sb + 6.0); pp_ = Vector(pp_); tp_ = Vector(tp_); np_ = Vector((-tp_.y, tp_.x))
            _berth_props(pp_ + np_ * (pw / 2 - 0.75) * (1 if int(sb / 24.0) % 2 else -1), tp_, np_, Z_SHORE + 0.2)
        sb += 24.0
    pe_, te_ = along(wl, s_mid); pe_ = Vector(pe_); te_ = Vector(te_); ne_ = Vector((-te_.y, te_.x))
    ce_ = pe_ + ne_ * (pw / 2 - 0.3)                   # the exedra's back on the walk's edge, open to the walk
    a0_ = math.atan2(-ne_.y, -ne_.x)
    for j in range(7):
        a1 = a0_ - math.pi / 2 + math.pi * j / 7; a2 = a0_ - math.pi / 2 + math.pi * (j + 1) / 7
        q1 = ce_ + Vector((math.cos(a1), math.sin(a1))) * 1.7; q2 = ce_ + Vector((math.cos(a2), math.sin(a2))) * 1.7
        merge(mexed, nl_kit.beam((q1.x, q1.y, Z_SHORE + 0.42), (q2.x, q2.y, Z_SHORE + 0.42), 0.5, 0.42))        # the curved seat
        r1 = ce_ + (q1 - ce_) * 1.2; r2 = ce_ + (q2 - ce_) * 1.2
        merge(mexed, nl_kit.beam((r1.x, r1.y, Z_SHORE + 0.65), (r2.x, r2.y, Z_SHORE + 0.65), 0.2, 0.9))          # its back
    pl_ = ce_ - ne_ * 0.6
    merge(mexed, bm_box2(pl_.x - 0.4, pl_.y - 0.4, Z_SHORE + 0.2, pl_.x + 0.4, pl_.y + 0.4, Z_SHORE + 1.05))      # the plinth (anonymous)
    merge(mexed, bm_box2(pl_.x - 0.48, pl_.y - 0.48, Z_SHORE + 1.0, pl_.x + 0.48, pl_.y + 0.48, Z_SHORE + 1.12))
    merge(mbronze, bm_cyl(0.12, 0.34, 0.22, 8, (pl_.x, pl_.y, Z_SHORE + 1.12), cap=False))                   # a bronze offering bowl
    while s_ < Lw - 8.0:
        p2, t2 = along(wl, s_); p2 = Vector(p2); t2 = Vector(t2); n2 = Vector((-t2.y, t2.x)); ang = math.atan2(t2.y, t2.x)
        if abs(s_ - s_mid) < 1.0:
            s_ += 24.0; k_ += 1
            continue
        if k_ % 2 == 0:
            for sd in (1, -1):                         # back to back, each facing its own row of hulls
                _bench(mbench, p2 + n2 * sd * 0.45 - t2 * 2.4, ang + (0 if sd < 0 else math.pi), Z_SHORE + 0.26)
                _bench(mbench, p2 + n2 * sd * 0.45 + t2 * 2.4, ang + (0 if sd < 0 else math.pi), Z_SHORE + 0.26)
        else:
            merge(mplant, bm_cyl(0.95, 0.8, 0.75, 10, (p2.x, p2.y, Z_SHORE + 0.2)))
            hh = _mrng.uniform(3.9, 4.9)
            MOLE_TREE_SITES.append((p2.x, p2.y, Z_SHORE + 0.78, hh, ang + _mrng.uniform(-0.5, 0.5)))
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
    # the light: a squat fire-beacon (green: the Grand Mole, red: the Inner)
    zb = Z_SHORE + 0.16
    zg = zb + 3.4
    beacon_column(f'mole_light_{m["name"]}', (h.x, h.y), zb, zg, BEACON_GREEN if m['name'] == 'grand' else BEACON_RED, 'marina',
                  base_r=2.5, flame=FLAME_GREEN if m['name'] == 'grand' else FLAME_RED)
    MOLE_TOWERS.append(Vector((h.x, h.y, zg + 0.5)))
obj('mole_crest', mcrest, face=lambda q: ((PAL['quay'], PT['ashlar']) if q.normal.z > 0.9 else ((PAL['rock_wet'], PT['ashlar']) if q.center.z < 0.4 else (PAL['quay_dark'], PT['ashlar']))),
    family='quay', bevel=0.04)
obj('mole_coping', mcop, PAL['quay'], PT['plain'], family='quay', jitter=0.08)
obj('mole_promenade', mprom, face=lambda q: ((lin('#B2AA98'), PT['ashlar']) if q.normal.z > 0.9 else (PAL['granite'], PT['ashlar'])), family='quay', jitter=0.05)
obj('mole_benches', mbench, PAL['lime'], PT['ashlar'], family='prop_bench', bevel=0.03)
obj('mole_planters', mplant, PAL['granite'], PT['ashlar'], family='quay', jitter=0.05)
obj('mole_chain_band', mband, ETH_BAND, PT['plain'], family='quay', jitter=0.0)
obj('mole_opus_bands', mopus, lin('#8F8676'), PT['cobble'], family='quay', jitter=0.05)
obj('mole_amphorae', mamph, face=lambda q: ((lin('#B0663E') if q.index % 5 else lin('#C69B74')), PT['plain']), family='prop_crate', jitter=0.08)
obj('mole_hawsers', mrope, PAL['rope'], PT['plain'], family='prop_rope', jitter=0.05)
obj('mole_capstans', mcap, PAL['timber_dark'], PT['planks_y'], family='prop_crate', jitter=0.05)
obj('mole_exedrae', mexed, PAL['lime'], PT['ashlar'], family='prop_bench', jitter=0.03, bevel=0.02)
obj('mole_bronze', mbronze, lin('#9A6430'), PT['metal'], family='prop_bench')

# ------------------------------------------------------------------ P6: civic pads - granite retaining walls / parapets on every edge
# where the level pad and the land beside it differ (the civic models stand on the pads; the walls make them read as
# terraces cut into the hill rather than ground smeared flat)
set_coll(collection('civic_pads', ROOTC))
pw_, pc_ = bmesh.new(), bmesh.new()
for cv in CJ.get('civic', []):
    zp = cv['z']
    ring = plot_rect(cv, 0.0)
    for i in range(4):
        a, b = Vector(ring[i]), Vector(ring[(i + 1) % 4])
        t = (b - a); L_ = t.length; t.normalize()
        nout = Vector((t.y, -t.x))
        if (Vector(cv['c']) - a).dot(nout) > 0:
            nout = -nout
        n_ = max(1, int(L_ / 1.6))
        for k in range(n_):
            p0 = a + t * (L_ * k / n_); p1 = a + t * (L_ * (k + 1) / n_)
            zo = [terrain.height(*(q + nout * 1.7), pads=False) if point_in_poly(*(q + nout * 1.7), COAST) else -1.5 for q in (p0, p1, (p0 + p1) / 2)]
            dz = max(abs(z_ - zp) for z_ in zo)
            if dz < 0.55:
                continue
            lo = min(min(zo), zp) - 0.7; hi = max(zp + (0.55 if min(zo) < zp - 0.4 else 0.0), max(zo) + 0.15)
            q0 = p0 + nout * 0.45; q1 = p1 + nout * 0.45
            merge(pw_, nl_kit.beam((q0.x, q0.y, (lo + hi) / 2), (q1.x, q1.y, (lo + hi) / 2), 0.9, hi - lo))
            merge(pc_, nl_kit.beam((q0.x, q0.y, hi + 0.12), (q1.x, q1.y, hi + 0.12), 1.15, 0.26))
for fl in CJ.get('flats', []):           # integration G2: the battery platform's edges hold back the hill behind it
    zp = fl['z']; ring = [Vector(q) for q in fl['poly']]
    cen = sum(ring, Vector((0.0, 0.0))) / len(ring)
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        t = (b - a); L_ = t.length; t.normalize()
        nout = Vector((t.y, -t.x))
        if (cen - a).dot(nout) > 0:
            nout = -nout
        n_ = max(1, int(L_ / 1.6))
        te = fl.get('terrace') if i in (fl.get('terrace') or {}).get('edges', ()) else None
        # P8: a terraced edge gets one course per ledge, each set back to its ledge's front and only as tall as its step
        steps = [(0.0, 0.0, None)] if te is None else [(d0, r0, r1) for (d0, r0), (_, r1) in zip([(0.0, 0.0)] + te['courses'], te['courses'])]
        for k in range(n_):
            p0 = a + t * (L_ * k / n_); p1 = a + t * (L_ * (k + 1) / n_)
            for (d0, r0, r1) in steps:
                zo = [terrain.height(*(q + nout * (d0 + 1.7)), pads=False, flats=False) if point_in_poly(*(q + nout * (d0 + 1.7)), COAST) else -1.5
                      for q in (p0, p1, (p0 + p1) / 2)]
                if min(zo) < zp + r0 + 0.55:     # only where the hill stands above the platform / ledge (the sea side stays open)
                    break
                lo = zp + r0 - 0.7; hi = max(zo) + 0.15 if r1 is None else min(max(zo) + 0.15, zp + r1 + 0.15)
                q0 = p0 + nout * (d0 + 0.45); q1 = p1 + nout * (d0 + 0.45)
                merge(pw_, nl_kit.beam((q0.x, q0.y, (lo + hi) / 2), (q1.x, q1.y, (lo + hi) / 2), 0.9, hi - lo))
                merge(pc_, nl_kit.beam((q0.x, q0.y, hi + 0.12), (q1.x, q1.y, hi + 0.12), 1.15, 0.26))
    te = fl.get('terrace')
    for i in (te or {}).get('edges', ()):       # P8: close each course round the corner between two terraced edges
        j = (i + 1) % len(ring)
        if j not in te['edges']:
            continue
        ns = []
        for e in (i, j):
            a, b = ring[e], ring[(e + 1) % len(ring)]
            t = (b - a).normalized(); n_ = Vector((t.y, -t.x))
            ns.append(-n_ if (cen - a).dot(n_) > 0 else n_)
        v = ring[j]; nm = (ns[0] + ns[1]).normalized()
        for (d0, r0), (_, r1) in zip([(0.0, 0.0)] + te['courses'], te['courses']):
            zh = terrain.height(*(v + nm * (d0 + 1.7)), pads=False, flats=False)
            if zh < zp + r0 + 0.55:
                break
            lo = zp + r0 - 0.7; hi = min(zh + 0.15, zp + r1 + 0.15)
            q0 = v + ns[0] * (d0 + 0.45); q1 = v + ns[1] * (d0 + 0.45)
            merge(pw_, nl_kit.beam((q0.x, q0.y, (lo + hi) / 2), (q1.x, q1.y, (lo + hi) / 2), 0.9, hi - lo))
            merge(pc_, nl_kit.beam((q0.x, q0.y, hi + 0.12), (q1.x, q1.y, hi + 0.12), 1.15, 0.26))
if len(pw_.faces):
    foot_gradient(obj('civic_pad_walls', pw_, LIMESTONE, PT['ashlar'], family='quay', bevel=0.03))
    obj('civic_pad_coping', pc_, COPING_STONE, PT['plain'], family='quay', jitter=0.06)
else:
    pw_.free(); pc_.free()

# ------------------------------------------------------------------ P6 (D15): the Pharos islet + the arched causeway
# The rock: crafted strata cliffs to a weathered granite cap that rises to the podium (lighthouse.glb carries the 64 m
# podium + pavement + tower). The causeway: pale limestone like the Pharos, five arches over the channel to the headland.
set_coll(collection('pharos_islet', ROOTC))
PHJ = CJ['pharos']
ISL = [tuple(p) for p in PHJ['islet']]
PCN = Vector(PHJ['p']); PZ = PHJ['z']; PHALF = PHJ['half']
LIME, LIME_D, LIME_L = lin('#D9CDB2'), lin('#BBAE92'), lin('#E8DEC8')


def _isl_edge_d(x, y):
    return min(seg_d((x, y), ISL[i], ISL[(i + 1) % len(ISL)]) for i in range(len(ISL)))


def islet_h(x, y):
    """Rock height on the islet: a 3-4.6 m rim of cliff, rising to ~4.9 m against the podium."""
    de = _isl_edge_d(x, y)
    rim = 3.1 + 1.5 * terrain.fbm(x, y, 0.045, 2, 71)
    return min(PZ - 1.0, rim + 1.2 * terrain.sstep(0.0, 9.0, de) + 0.5 * (terrain.fbm(x, y, 0.12, 2, 72) - 0.5))


_ib = bmesh.new()
_ipts = list(_resample(ISL, 1.8))
_sq = [(PCN.x + sx * (PHALF - 0.8), PCN.y + sy * (PHALF - 0.8)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
_ipts += _resample(_sq, 2.5)
_rr = random.Random(73)
_xs = [p[0] for p in ISL]; _ys = [p[1] for p in ISL]
_y = min(_ys)
while _y < max(_ys):
    _x = min(_xs)
    while _x < max(_xs):
        q = (_x + _rr.uniform(-0.8, 0.8), _y + _rr.uniform(-0.8, 0.8))
        if point_in_poly(*q, ISL) and _isl_edge_d(*q) > 1.0 and not (abs(q[0] - PCN.x) < PHALF - 0.4 and abs(q[1] - PCN.y) < PHALF - 0.4):
            _ipts.append(q)
        _x += 2.6
    _y += 2.6 * 0.866
_IP = np.array(_ipts)
_itri = Delaunay(_IP)
_iv = [_ib.verts.new((p[0], p[1], islet_h(*p) if _isl_edge_d(*p) > 0.2 else islet_h(*p) - 0.1)) for p in _ipts]
for t_ in _itri.simplices:
    c_ = _IP[t_].mean(axis=0)
    if not point_in_poly(c_[0], c_[1], ISL) or (abs(c_[0] - PCN.x) < PHALF - 1.0 and abs(c_[1] - PCN.y) < PHALF - 1.0):
        continue
    try:
        _ib.faces.new([_iv[i] for i in t_])
    except ValueError:
        pass
_ib.normal_update()
for f_ in _ib.faces:
    if f_.normal.z < 0:
        f_.normal_flip()


ISLET_ROCK = [lin('#C3AA82'), lin('#B59B74'), lin('#CDB893'), lin('#A88F6C')]      # warm Alexandrian limestone


def _islet_face(q):
    c = q.center; nn = terrain.fbm(c.x, c.y, 0.08, 2, 74)
    if q.normal.z < 0.55:
        return (ISLET_ROCK[int(abs(c.x * 3 + c.y)) % len(ISLET_ROCK)], PT['rock'])
    if nn > 0.64:
        return (lin('#7E8B57'), PT['grass'])              # thrift and sea-grass in the hollows
    return ((LICHEN if nn < 0.22 else ISLET_ROCK[int(nn * 9) % len(ISLET_ROCK)]), PT['rock'])


obj('pharos_islet_cap', _ib, face=_islet_face, jitter=0.06, seed=75, family='terrain')
# the islet's own crafted cliff: strata_cliff reads H (column tops) and COAST (which side is land) - lend it the islet's
_H_land, _C_land = H, COAST
H = lambda x, y: islet_h(x, y)
COAST = ISL
_ic, _il, _if = strata_cliff(ISL + [ISL[0]], 77)
H, COAST = _H_land, _C_land
obj('pharos_islet_cliffs', _ic, face=cliff_face, jitter=0.06, seed=78, family='terrain')
_ibl = bmesh.new()
for k, (p, nr, t, _o) in enumerate(_if):                    # boulders and surf rocks round the foot (<= 1.25 m seaward)
    if _crng.random() < 0.5:
        r = _crng.uniform(0.75, 1.85)
        c = p + nr * min(1.22, r * 0.45 + _crng.uniform(0.0, 0.75))
        merge(_ibl, bm_ico(r, (c.x, c.y, _crng.uniform(-0.6, 0.3)), 1 if r > 1.3 else 0, (1.3, 1.0, 0.8), seed=500 + k, amp=0.3))
obj('pharos_islet_boulders', _ibl, face=lambda q: ((WET if q.center.z < 0.35 else (WEATHER if q.normal.z > 0.55 else GRANITE[q.index % 3])), PT['rock']),
    family='terrain', jitter=0.08)
STRUCT_POLYS.append(ISL)

CWJ = PHJ['causeway']
CA, CB = Vector(CWJ['a']), Vector(CWJ['b']); CWW = CWJ['width']; ZA = CWJ['za']
cd_ = (CB - CA); CL = cd_.length; cd_.normalize(); cn_ = Vector((-cd_.y, cd_.x))
s_ramp = CL * 0.32


def deck_z(s):
    return ZA + (PZ - ZA) * terrain.sstep(0.0, s_ramp, s)


_wet = [s_ for s_ in np.arange(0.0, CL, 0.5) if not point_in_poly(*(CA + cd_ * s_), COAST) and not point_in_poly(*(CA + cd_ * s_), ISL)]
SW0, SW1 = (min(_wet) - 1.0, max(_wet) + 1.0) if _wet else (CL * 0.3, CL * 0.7)
cw_deck, cw_side, cw_par, cw_cop, cw_pier, cw_sof = (bmesh.new() for _ in range(6))
# the landing: the deck runs on 7 m up the headland, easing down into the ground
_L0 = CA - cd_ * 7.0
_zg = H(*_L0)
merge(cw_deck, nl_kit.beam((_L0.x, _L0.y, _zg - 0.45), (CA.x, CA.y, deck_z(0.0) - 0.45), CWW, 0.9))
for sd in (-1, 1):
    o = cn_ * sd * (CWW / 2 - 0.3)
    merge(cw_par, nl_kit.beam((_L0.x + o.x, _L0.y + o.y, _zg + 0.2), (CA.x + o.x, CA.y + o.y, deck_z(0.0) + 0.5), 0.6, 1.0))
    merge(cw_par, nl_kit.obox((_L0.x + o.x, _L0.y + o.y, _zg + 0.4), (cd_.x, cd_.y, 0), 1.0, 1.0, 1.6))      # gate piers
# the deck slab + paving, parapets with coping, in 1 m pieces along the run
n_ = int(CL)
for k in range(n_):
    s0, s1 = CL * k / n_, CL * (k + 1) / n_
    a, b = CA + cd_ * s0, CA + cd_ * s1
    za, zb = deck_z(s0), deck_z(s1)
    merge(cw_deck, nl_kit.beam((a.x, a.y, za - 0.5), (b.x, b.y, zb - 0.5), CWW, 1.0))
    for sd in (-1, 1):
        o = cn_ * sd * (CWW / 2 - 0.3)
        merge(cw_par, nl_kit.beam((a.x + o.x, a.y + o.y, za + 0.5), (b.x + o.x, b.y + o.y, zb + 0.5), 0.6, 1.0))
        merge(cw_cop, nl_kit.beam((a.x + o.x, a.y + o.y, za + 1.08), (b.x + o.x, b.y + o.y, zb + 1.08), 0.78, 0.18))
# solid abutment masonry on the headland and on the islet (to the sea floor), under the deck
for (s0, s1) in ((0.0, SW0), (SW1, CL)):
    if s1 - s0 < 0.5:
        continue
    for k in range(max(1, int(s1 - s0))):
        q0, q1 = s0 + (s1 - s0) * k / max(1, int(s1 - s0)), s0 + (s1 - s0) * (k + 1) / max(1, int(s1 - s0))
        a, b = CA + cd_ * q0, CA + cd_ * q1
        zt = min(deck_z(q0), deck_z(q1)) - 0.9
        merge(cw_side, nl_kit.beam((a.x, a.y, (zt + SEA_FLOOR) / 2), (b.x, b.y, (zt + SEA_FLOOR) / 2), CWW - 0.1, zt - SEA_FLOOR))
# the arches over the channel: piers with cutwaters, spandrel faces, barrel soffits
NB = max(3, round((SW1 - SW0) / 7.4))
PIER = 1.7
bay = (SW1 - SW0) / NB
ZSPR = 0.45
for i in range(NB + 1):                                      # piers (the end ones are half-buried in the abutments)
    sc = SW0 + i * bay
    c = CA + cd_ * sc
    zt = deck_z(sc) - 0.9
    merge(cw_pier, nl_kit.obox((c.x, c.y, (SEA_FLOOR + ZSPR) / 2), (cd_.x, cd_.y, 0), PIER, CWW, ZSPR - SEA_FLOOR))
    for sd in (-1, 1):                                       # pointed cutwaters both sides, to the springing
        tip = c + cn_ * sd * (CWW / 2 + 1.6)
        bmc = bmesh.new()
        v0 = [bmc.verts.new((*(c + cn_ * sd * CWW / 2 + cd_ * (PIER / 2)), z_)) for z_ in (SEA_FLOOR, ZSPR + 0.3)]
        v1 = [bmc.verts.new((*(c + cn_ * sd * CWW / 2 - cd_ * (PIER / 2)), z_)) for z_ in (SEA_FLOOR, ZSPR + 0.3)]
        v2 = [bmc.verts.new((tip.x, tip.y, z_)) for z_ in (SEA_FLOOR, ZSPR - 0.2)]
        bmc.faces.new((v0[0], v2[0], v2[1], v0[1])); bmc.faces.new((v2[0], v1[0], v1[1], v2[1])); bmc.faces.new((v0[1], v2[1], v1[1]))
        bmesh.ops.recalc_face_normals(bmc, faces=bmc.faces)
        merge(cw_pier, bmc)
for i in range(NB):                                          # spandrels + soffits, one bay at a time
    s0, s1 = SW0 + i * bay + PIER / 2, SW0 + (i + 1) * bay - PIER / 2
    span = s1 - s0; sc = (s0 + s1) / 2
    z_under = min(deck_z(s0), deck_z(s1)) - 1.0
    rise = max(0.6, min(span / 2, z_under - ZSPR - 0.35))
    m = 14
    arch = [(s0 + span * j / m, ZSPR + rise * math.sqrt(max(0.0, 1.0 - ((s0 + span * j / m - sc) / (span / 2)) ** 2))) for j in range(m + 1)]
    for sd in (-1, 1):
        o = cn_ * sd * (CWW / 2)
        for j in range(m):
            (sa, za_), (sb, zb_) = arch[j], arch[j + 1]
            pa, pb = CA + cd_ * sa + o, CA + cd_ * sb + o
            ta, tb = deck_z(sa) - 1.0, deck_z(sb) - 1.0
            vs = [cw_side.verts.new(v) for v in ((pa.x, pa.y, za_), (pb.x, pb.y, zb_), (pb.x, pb.y, tb + 0.02), (pa.x, pa.y, ta + 0.02))]
            cw_side.faces.new(vs if sd < 0 else vs[::-1])
        # the voussoir ring: a slightly proud band round the arch on each face
        for j in range(m):
            (sa, za_), (sb, zb_) = arch[j], arch[j + 1]
            pa, pb = CA + cd_ * sa + o * 1.03, CA + cd_ * sb + o * 1.03
            merge(cw_cop, nl_kit.beam((pa.x, pa.y, za_ + 0.28), (pb.x, pb.y, zb_ + 0.28), 0.3, 0.6))
    for j in range(m):                                       # soffit (barrel)
        (sa, za_), (sb, zb_) = arch[j], arch[j + 1]
        L0, L1 = CA + cd_ * sa - cn_ * (CWW / 2), CA + cd_ * sb - cn_ * (CWW / 2)
        R0, R1 = CA + cd_ * sa + cn_ * (CWW / 2), CA + cd_ * sb + cn_ * (CWW / 2)
        vs = [cw_sof.verts.new(v) for v in ((L0.x, L0.y, za_), (R0.x, R0.y, za_), (R1.x, R1.y, zb_), (L1.x, L1.y, zb_))]
        cw_sof.faces.new(vs)
    # the spandrel fill between the faces above the barrel (a solid wedge so no gap shows from any side)
    for j in range(m):
        (sa, za_), (sb, zb_) = arch[j], arch[j + 1]
        pa, pb = CA + cd_ * sa, CA + cd_ * sb
        ztop = min(deck_z(sa), deck_z(sb)) - 1.0
        zm = max(za_, zb_)
        if ztop - zm > 0.1:
            merge(cw_side, nl_kit.beam((pa.x, pa.y, (zm + ztop) / 2), (pb.x, pb.y, (zm + ztop) / 2), CWW - 0.04, ztop - zm))
obj('causeway_deck', cw_deck, face=lambda q: ((lin('#CBBE9F'), PT['ashlar']) if q.normal.z > 0.9 else (LIME_D, PT['ashlar'])), family='quay', jitter=0.05)
obj('causeway_spandrels', cw_side, LIME, PT['ashlar'], family='quay', jitter=0.05)
obj('causeway_soffits', cw_sof, lin('#8F8572'), PT['ashlar'], family='quay', jitter=0.04)
obj('causeway_parapets', cw_par, LIME, PT['ashlar'], family='quay', jitter=0.05, bevel=0.03)
obj('causeway_coping', cw_cop, LIME_L, PT['plain'], family='quay', jitter=0.04)
obj('causeway_piers', cw_pier, face=lambda q: ((WET, PT['rock']) if q.center.z < 0.4 else (LIME_D, PT['ashlar'])), family='quay', jitter=0.05)
STRUCT_POLYS.append([tuple(CA - cn_ * CWW / 2), tuple(CB - cn_ * CWW / 2), tuple(CB + cn_ * CWW / 2), tuple(CA + cn_ * CWW / 2)])

print('LAND built')
