"""The Harbour v4 (Phase 3 Rich Ptolemaic Working Landscape) - terrain height function.

Pure Python + numpy/scipy; shared by compose.py, the Blender build, export_walkways.py,
hb_groundcover.py, and bake_terrain.py.

init(coast, quay_lines, beaches) once (world coords), then height(x, y) -> z metres on the island.
Authored in SCREEN space (U right, V away from the camera; heart target at the origin;
world = from_uv(u, v + VOFF)) like compose.py:

  - town amphitheatre: stepped terrace pads in radial bands round the Vagen (CT);
  - Pharos headland: weathered karst table with dramatic N/NE limestone sea cliffs;
  - west lobe: sweeping amphitheatre of contour olive terraces, stepped contour vineyard,
    arable fields with subtle furrow micro-relief, smooth goat pastures, and Wreck Cove capes;
  - east lobe: asymmetric karst cuesta (<= 34 m) with 3 SW escarpment benches, ancient stepped
    limestone quarry amphitheatre behind the Mint, and 2 sweeping East terrace zones;
  - south strip: low ridge (<= 18 m) with pocket back-garden terraces and 7 rocky promontory
    knuckles between the 6 south coves;
  - universal road & footpath bench grading so rural roads sit flush inside the terrain.
"""
import math

Z_SHORE = 2.4
VOFF = 80.0
SQ2 = math.sqrt(2.0)
CT = (100.0, 8.0)
R_QUAY = 58.0
# radial terrace bands round CT (screen metres) and their angular extents (screen degrees, th0 > th1)
RINGS = [
    (R_QUAY, R_QUAY + 18.0, Z_SHORE),
    (R_QUAY + 19.0, R_QUAY + 34.0, 8.0),
    (R_QUAY + 35.0, R_QUAY + 50.0, 13.5),
    (R_QUAY + 51.0, R_QUAY + 66.0, 19.0),
]
TOWN_TH = [(168.0, 12.0), (160.0, 20.0), (150.0, 30.0), (140.0, 40.0)]
PHAROS = (-72.0, 96.0)
HEAD_C, HEAD_R, HEAD_H = (-102.0, 94.0), (40.0, 20.0), 8.0

_S = 2.0
_grid = None          # (x0, y1, nx, ny, dist array) inside-distance to the coast (m)
_quays = {}
_beaches = []         # [(world polyline, depth m, kind, box, end_tangents)]


def to_uv(x, y):
    return ((x + y) / SQ2, (y - x) / SQ2 - VOFF)


def from_uv(u, v):
    v = v + VOFF
    return ((u - v) / SQ2, (u + v) / SQ2)


# ------------------------------------------------------------------ Canonical road & footpath polylines (screen UV)
PHAROS_ROAD = [(-97.0, 70.0), (-104.0, 82.0), (-122.0, 88.0), (-140.0, 98.0), (-150.0, 108.0), (-156.0, 116.0)]
WEST_ROAD = [
    (-131.0, -178.0), (-140.0, -152.0), (-160.0, -146.0), (-186.0, -132.0), (-200.0, -110.0),
    (-206.0, -80.0), (-196.0, -50.0), (-176.0, -20.0), (-152.0, 4.0), (-134.0, 22.0), (-118.0, 22.0),
]
SOUTH_ROAD = [
    (200.0, -196.0), (176.0, -214.0), (130.0, -230.0), (80.0, -238.0), (20.0, -240.0), (-40.0, -236.0),
    (-100.0, -232.0), (-150.0, -222.0), (-196.0, -206.0), (-222.0, -186.0), (-216.0, -160.0), (-190.0, -146.0),
]
EAST_ROAD = [(176.0, -150.0), (196.0, -172.0), (200.0, -196.0), (214.0, -180.0), (232.0, -170.0)]
SHRINE_PATH = [(-176.8, -21.0), (-170.0, -24.6), (-162.6, -25.6), (-155.0, -24.2)]
QUARRY_PATH = [(194.0, 44.0), (190.0, 32.0), (186.0, 18.0), (183.0, 2.0), (182.0, -14.0)]
EAST_RIDGE_PATH = [(200.0, -196.0), (214.0, -154.0), (222.0, -118.0), (228.0, -82.0), (226.0, -44.0), (212.0, -12.0)]
FOOTPATHS = [
    [(96.0, 128.0), (108.0, 140.0), (130.0, 146.0)],
    [(-206.0, -80.0), (-218.0, -110.0), (-226.0, -150.0), (-224.0, -162.0)],
    [(-196.0, -50.0), (-214.0, -54.0), (-226.0, -58.0)],
    QUARRY_PATH,
    EAST_RIDGE_PATH,
]

# Fixed cove back coordinates (from compose.py) for deterministic cove-spur road benches
_COVE_BACKS_UV = (
    ('pier-polygon', (-244.3, -185.2), (-0.72, -0.69)),
    ('pier-arbitrum', (-155.6, -238.3), (-0.14, -1.0)),
    ('pier-base', (-52.0, -258.0), (0.0, -1.0)),
    ('pier-solana', (62.7, -258.0), (0.04, -1.0)),
    ('pier-bsc', (168.4, -234.2), (0.1, -1.0)),
    ('pier-hyperliquid-l1', (234.2, -175.9), (0.74, -0.67)),
)

ROAD_CUT_W = 3.0
_road = None          # legacy alias kept for backwards compatibility (pharos road tuple)
_roads = []           # list of (name, kind, dense_uv, zs, half_w, cut_m, bb_uv)
_road_grid = {}       # (iu, iv) -> [(ri, seg_i)] at 16 m UV cells for O(1) lookup
_ROAD_CELL = 16.0
_flats = []           # level aprons shared by civic plots [(poly, z, blend, bbox, terrace)] (world)
_pads = []            # civic plots: level pads [(cx, cy, fx, fy, hw, hd, z, blend, bbox)] (world)
_lots = []            # building lots: level pads [(cx, cy, fx, fy, hw, hd, z, blend, bbox)] (world)


def set_pads(pads):
    """Level pads (world): dict(c, face, w, d, z, blend). Inside the rectangle the ground is exactly z - 0.08."""
    global _pads
    _pads = []
    for p in pads:
        cx, cy = p['c']; fx, fy = p['face']; hw, hd = p['w'] / 2, p['d'] / 2; b = p.get('blend', 2.5)
        r = math.hypot(hw, hd) + b
        _pads.append((cx, cy, fx, fy, hw, hd, p['z'] - 0.08, b, (cx - r, cy - r, cx + r, cy + r)))


def set_lots(lots, flat_margin=1.5, blend=2.5):
    """Level pads for rural/cove/warehouse/farmhouse building lots (band is None).

    Flattens terrain cleanly inside every lot footprint + `flat_margin` m to `lot['z'] - 0.08`
    with a smooth `blend` m ramp margin AFTER escarpment/karst/ridge-noise/terrace steps,
    while civic pads (`_pads`) and battery flat (`_flats`) still apply authoritatively last.
    """
    global _lots
    _lots = []
    for l in (lots or ()):
        if l.get('band') is not None:
            continue
        cx, cy = l['c']; fx, fy = l['face']
        hw = l['w'] * 0.5 + flat_margin
        hd = l['d'] * 0.5 + flat_margin
        r = math.hypot(hw, hd) + blend
        _lots.append((cx, cy, fx, fy, hw, hd, l['z'] - 0.08, blend, (cx - r, cy - r, cx + r, cy + r)))


def _apply_lots(x, y, h):
    """Smoothly flatten terrain onto every non-ring building lot pad (+1.5 m flat + 2.5 m ramp)."""
    if not _lots:
        return h
    in_sum = 0.0
    in_cnt = 0
    w_sum = 0.0
    z_sum = 0.0
    w_max = 0.0
    for (cx, cy, fx, fy, hw, hd, zl, b, bb) in _lots:
        if not (bb[0] <= x <= bb[2] and bb[1] <= y <= bb[3]):
            continue
        dx, dy = x - cx, y - cy
        ly = dx * fx + dy * fy
        lx = dx * -fy + dy * fx
        ox = max(abs(lx) - hw, 0.0)
        oy = max(abs(ly) - hd, 0.0)
        d = math.hypot(ox, oy)
        if d <= 0.0:
            in_sum += zl
            in_cnt += 1
        elif d < b:
            w = 1.0 - sstep(0.0, b, d)
            if w > w_max:
                w_max = w
            w_sum += w
            z_sum += w * zl
    if in_cnt > 0:
        return in_sum / in_cnt
    if w_max <= 0.0:
        return h
    return h * (1.0 - w_max) + (z_sum / w_sum) * w_max


def set_flats(flats):
    """Level aprons (world): dict(poly, z, blend, terrace?)."""
    global _flats
    _flats = []
    for f in flats:
        P = [tuple(q) for q in f['poly']]; b = f.get('blend', 2.5)
        te = f.get('terrace')
        r = max(b, te['courses'][-1][0] + 24.0) if te else b
        _flats.append((
            P, f['z'] - 0.08, b,
            (min(q[0] for q in P) - r, min(q[1] for q in P) - r, max(q[0] for q in P) + r, max(q[1] for q in P) + r),
            te,
        ))


def terrace_cap(te, d):
    """Highest ground (above the flat) a terrace allows at outer distance d."""
    for d_end, rise in te['courses']:
        if d < d_end:
            return rise
    d_end, rise = te['courses'][-1]
    return rise + te['slope'] * (d - d_end)


def _flat_at(x, y):
    for (P, z, b, bb, te) in _flats:
        if not (bb[0] <= x <= bb[2] and bb[1] <= y <= bb[3]):
            continue
        n = len(P); inside = False; d = 1e9; ei = -1
        for i in range(n):
            (ax, ay), (bx, by) = P[i], P[(i + 1) % n]
            if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay + 1e-12) + ax:
                inside = not inside
            di = _segd(x, y, (ax, ay), (bx, by))
            if di < d:
                d, ei = di, i
        if inside:
            return (z, 0.0, b, None)
        if te and ei in te['edges']:
            return (z, d, b, te)
        if d <= b:
            return (z, d, b, None)
    return None


def pad_at(x, y, margin=0.0):
    """(z, outside distance, blend) of the pad covering (x, y) within `margin` m of its edge, else None."""
    best = None
    for (cx, cy, fx, fy, hw, hd, z, b, bb) in _pads:
        if not (bb[0] - margin <= x <= bb[2] + margin and bb[1] - margin <= y <= bb[3] + margin):
            continue
        dx, dy = x - cx, y - cy
        ly = dx * fx + dy * fy; lx = dx * -fy + dy * fx
        ox, oy = max(abs(lx) - hw, 0.0), max(abs(ly) - hd, 0.0)
        d = math.hypot(ox, oy)
        if d <= margin and (best is None or d < best[1]):
            best = (z, d, b)
    return best


def head_d(u, v):
    """Normalised distance from the headland table's centre (screen plan): < 1 on the table."""
    return math.hypot((u - HEAD_C[0]) / HEAD_R[0], (v - HEAD_C[1]) / HEAD_R[1])


def _dense_uv(ctrl_uv, smooth=True, step=1.5):
    from geom import catmull
    pts = catmull(ctrl_uv, 6, closed=False) if (smooth and len(ctrl_uv) >= 3) else list(ctrl_uv)
    dense = []
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for k in range(n):
            dense.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    if pts:
        dense.append(pts[-1])
    return dense


def _default_road_specs():
    """Return canonical [(name, kind, ctrl_uv, width, smooth)] list including cove spurs."""
    specs = [
        ('pharos', 'road', PHAROS_ROAD, ROAD_CUT_W, True),
        ('west', 'road', WEST_ROAD, 3.0, True),
        ('south', 'road', SOUTH_ROAD, 3.0, True),
        ('east', 'road', EAST_ROAD, 2.6, True),
        ('shrine', 'path', SHRINE_PATH, 1.5, False),
    ]
    for idx, fp in enumerate(FOOTPATHS):
        nm = 'quarry' if fp is QUARRY_PATH else ('east_ridge' if fp is EAST_RIDGE_PATH else f'foot_{idx}')
        w = 2.2 if nm == 'quarry' else 1.8
        specs.append((nm, 'path', fp, w, True))
    # Cove spurs linking each cove back to the nearest main road (matching hb_dress.py)
    main_uv = []
    for nm in ('south', 'west', 'east'):
        ctrl = {'south': SOUTH_ROAD, 'west': WEST_ROAD, 'east': EAST_ROAD}[nm]
        main_uv.extend(_dense_uv(ctrl, True, 3.0))
    for pid, back_uv, n_uv in _COVE_BACKS_UV:
        nl = math.hypot(n_uv[0], n_uv[1]) or 1.0
        a_uv = (back_uv[0] - n_uv[0] / nl * 6.0, back_uv[1] - n_uv[1] / nl * 6.0)
        tgt = min(main_uv, key=lambda p: (p[0] - a_uv[0]) ** 2 + (p[1] - a_uv[1]) ** 2)
        mid = ((a_uv[0] + tgt[0]) * 0.5 + 6.0, (a_uv[1] + tgt[1]) * 0.5)
        specs.append(('cove_' + pid, 'path', [a_uv, mid, tgt], 2.2, True))
    return specs


def set_roads(specs=None):
    """Build universal graded road & footpath benches from [(name, kind, ctrl_uv, width, smooth)].

    Computes smoothed bench elevation along every road/footpath so rural roads sit flush inside
    the terrain mesh (never floating above 5 m triangles). Indexes all segments into a 16 m UV
    hash grid so terrain.height() and road_info() remain O(1).
    """
    global _road, _roads, _road_grid
    _road = None
    _roads = []
    _road_grid = {}
    if specs is None:
        specs = _default_road_specs()
    built = []
    for (name, kind, ctrl_uv, width, smooth) in specs:
        dense = _dense_uv(ctrl_uv, smooth=smooth, step=1.5)
        if len(dense) < 2:
            continue
        z0 = [height(*from_uv(*p), roads=False) for p in dense]
        n_d = len(dense)
        if name == 'pharos':
            # Keep exact baseline 1-pass smoothing on PHAROS_ROAD so CW_DECK_A stays exact (2.88 m)
            zs = [sum(z0[max(0, i - 10):min(n_d, i + 11)]) / (min(n_d, i + 11) - max(0, i - 10)) for i in range(n_d)]
        else:
            win = 9 if kind == 'road' else 3
            zs = list(z0)
            # Three tapered smoothing passes on roads: window shrinks smoothly to 0 at endpoints
            for _pass in range(3 if kind == 'road' else 2):
                nxt = []
                for i in range(n_d):
                    wi = min(win, i, n_d - 1 - i)
                    lo = i - wi; hi = i + wi + 1
                    avg = sum(zs[lo:hi]) / (hi - lo)
                    if kind == 'path':
                        # Keep footpaths hugging natural slope tightly (never carve steep trenches in pastures)
                        avg = max(z0[i] - 0.55, min(z0[i] + 0.55, avg))
                    wx, wy = from_uv(*dense[i])
                    dq, ap, _bl = _quay_flat(wx, wy)
                    kq = 1.0 - sstep(max(0.0, ap - 1.0), ap + 8.0, dq)
                    nxt.append(avg * (1.0 - kq) + z0[i] * kq)
                zs = nxt
        hw = width * 0.5
        cut_m = 5.5 if name == 'pharos' else (4.2 if kind == 'road' else 3.2)
        pad_m = hw + cut_m + 1.0
        bb = (
            min(p[0] for p in dense) - pad_m, min(p[1] for p in dense) - pad_m,
            max(p[0] for p in dense) + pad_m, max(p[1] for p in dense) + pad_m,
        )
        built.append((name, kind, dense, zs, hw, cut_m, bb))
    _roads = built
    for ri, (name, kind, dense, zs, hw, cut_m, bb) in enumerate(_roads):
        if name == 'pharos':
            _road = (dense, zs, bb)
        reach = hw + cut_m + 1.0
        for i in range(len(dense) - 1):
            a, b = dense[i], dense[i + 1]
            u0 = int(math.floor((min(a[0], b[0]) - reach) / _ROAD_CELL))
            u1 = int(math.floor((max(a[0], b[0]) + reach) / _ROAD_CELL))
            v0 = int(math.floor((min(a[1], b[1]) - reach) / _ROAD_CELL))
            v1 = int(math.floor((max(a[1], b[1]) + reach) / _ROAD_CELL))
            for iu in range(u0, u1 + 1):
                for iv in range(v0, v1 + 1):
                    _road_grid.setdefault((iu, iv), []).append((ri, i))


def road_query_uv(u, v):
    """Query nearest road/footpath at screen (u, v).
    Returns (dist, bench_z, half_w, cut_m, kind, name, tangent_uv, grade) or None.
    """
    cands = _road_grid.get((int(math.floor(u / _ROAD_CELL)), int(math.floor(v / _ROAD_CELL))))
    if not cands:
        return None
    best = None
    for (ri, i) in cands:
        name, kind, dense, zs, hw, cut_m, bb = _roads[ri]
        a, b = dense[i], dense[i + 1]
        abx, aby = b[0] - a[0], b[1] - a[1]
        l2 = abx * abx + aby * aby + 1e-9
        t = max(0.0, min(1.0, ((u - a[0]) * abx + (v - a[1]) * aby) / l2))
        dd = math.hypot(u - a[0] - abx * t, v - a[1] - aby * t)
        if dd > hw + cut_m + 0.6:
            continue
        score = dd - (0.35 if kind == 'road' else 0.0)
        if best is None or score < best[0]:
            seg_len = math.sqrt(l2)
            bz = zs[i] + (zs[i + 1] - zs[i]) * t
            grade = abs(zs[i + 1] - zs[i]) / max(seg_len, 1e-3)
            best = (score, dd, bz, hw, cut_m, kind, name, (abx / seg_len, aby / seg_len), grade)
    if best is None:
        return None
    return best[1:]


def road_info(x, y):
    """Query road/footpath at world (x, y): returns (dist, half_w, kind, name, grade) or None."""
    u, v = to_uv(x, y)
    q = road_query_uv(u, v)
    if q is None:
        return None
    dd, _bz, hw, _cut_m, kind, name, _tuv, grade = q
    return (dd, hw, kind, name, grade)


def init(coast, quay_lines=None, beaches=None):
    """Rasterise the coast (world coords) into a distance-inside field; remember quays, beaches, and build road benches."""
    global _grid, _quays, _beaches, _road, _roads, _road_grid, _discs, _vine
    _beaches = []
    _discs = None; _vine = None
    _road = None; _roads = []; _road_grid = {}
    for b in (beaches or []):
        L = list(map(tuple, b['line'])); m = b['depth'] + 30.0
        box = (min(p[0] for p in L) - m, min(p[1] for p in L) - m, max(p[0] for p in L) + m, max(p[1] for p in L) + m)
        # End outward tangents along shore so beach flattening stays strictly on the strand and doesn't flatten bracketing capes
        t0x, t0y = L[0][0] - L[1][0], L[0][1] - L[1][1]
        l0 = math.hypot(t0x, t0y) or 1.0
        t1x, t1y = L[-1][0] - L[-2][0], L[-1][1] - L[-2][1]
        l1 = math.hypot(t1x, t1y) or 1.0
        ends = ((t0x / l0, t0y / l0), (t1x / l1, t1y / l1))
        _beaches.append((L, b['depth'], b.get('kind', 'sand'), box, ends))
    import numpy as np
    from PIL import Image, ImageDraw
    from scipy import ndimage
    xs = [p[0] for p in coast]; ys = [p[1] for p in coast]
    x0, x1, y0, y1 = min(xs) - 8, max(xs) + 8, min(ys) - 8, max(ys) + 8
    nx, ny = int((x1 - x0) / _S) + 1, int((y1 - y0) / _S) + 1
    im = Image.new('L', (nx, ny), 0)
    ImageDraw.Draw(im).polygon([((x - x0) / _S, (y1 - y) / _S) for x, y in coast], fill=255)
    m = np.array(im) > 127
    d = ndimage.distance_transform_edt(m) * _S
    _grid = (x0, y1, nx, ny, d)
    _quays = dict(quay_lines or {})
    set_roads()


def dcoast(x, y):
    x0, y1, nx, ny, d = _grid
    fx, fy = (x - x0) / _S, (y1 - y) / _S
    i, j = int(fy), int(fx)
    if not (0 <= i < ny - 1 and 0 <= j < nx - 1):
        return 0.0
    tx, ty = fx - j, fy - i
    return float(
        d[i, j] * (1 - tx) * (1 - ty)
        + d[i, j + 1] * tx * (1 - ty)
        + d[i + 1, j] * (1 - tx) * ty
        + d[i + 1, j + 1] * tx * ty
    )


def _hash(ix, iy, s=0):
    h = (ix * 374761393 + iy * 668265263 + s * 2147483647) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return (h ^ (h >> 16)) / 4294967295.0


def vnoise(x, y, f, s=0):
    x *= f; y *= f
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = _hash(ix, iy, s); b = _hash(ix + 1, iy, s); c = _hash(ix, iy + 1, s); d = _hash(ix + 1, iy + 1, s)
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy


def fbm(x, y, f, octaves=3, s=0):
    t, amp, n = 0.0, 1.0, 0.0
    for o in range(octaves):
        t += amp * vnoise(x, y, f * (2 ** o), s + o)
        n += amp; amp *= 0.5
    return t / n


def ridge_noise(x, y, f, octaves=3, s=0):
    """Deterministic ridged multifractal noise in [0, 1] for crisp stepped Mediterranean karst ridges."""
    t, amp, n = 0.0, 1.0, 0.0
    for o in range(octaves):
        v = 1.0 - abs(2.0 * vnoise(x, y, f * (2 ** o), s + o) - 1.0)
        t += amp * (v * v)
        n += amp; amp *= 0.5
    return t / n


def strata_quantize(h, step, riser=0.25):
    """Smooth stepped limestone strata quantization: level benches `step` m apart with crisp risers."""
    k = h / step
    f = k - math.floor(k)
    return (math.floor(k) + sstep(1.0 - riser, 1.0, f)) * step


def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def gauss(u, v, cu, cv, su, sv, ang=0.0):
    c, s = math.cos(ang), math.sin(ang)
    du, dv = u - cu, v - cv
    a = (du * c + dv * s) / su; b = (-du * s + dv * c) / sv
    return math.exp(-(a * a + b * b))


def seg_d(pu, pv, a, b):
    abx, aby = b[0] - a[0], b[1] - a[1]
    t = max(0.0, min(1.0, ((pu - a[0]) * abx + (pv - a[1]) * aby) / (abx * abx + aby * aby + 1e-9)))
    return math.hypot(pu - a[0] - abx * t, pv - a[1] - aby * t)


def line_d(u, v, pts):
    return min(seg_d(u, v, pts[i], pts[i + 1]) for i in range(len(pts) - 1))


# spines (screen plan): limestone ridges & pine crests the dresser also reads
WEST_SPINE = [(-186.0, 20.0), (-204.0, -30.0), (-222.0, -116.0), (-250.0, -186.0)]
EAST_SPINE = [(228.0, 14.0), (235.0, -34.0), (236.0, -96.0), (232.0, -148.0), (214.0, -198.0)]
SOUTH_RIDGE = [(-130.0, -230.0), (-40.0, -238.0), (60.0, -240.0), (150.0, -228.0)]
WINDMILL_UV = (-226.0, -168.0)

# 7 South Cove rocky promontory knuckles between (and flanking) the 6 south coves
SOUTH_KNUCKLES = (
    ((-304.0, -172.0), 15.0, 14.0, 4.6),   # 1. West of Polygon / South Wreck cape junction
    ((-218.0, -252.0), 17.0, 14.0, 4.8),   # 2. Polygon - Arbitrum
    ((-106.0, -276.0), 17.0, 14.0, 4.8),   # 3. Arbitrum - Base
    ((   6.0, -286.0), 17.0, 14.0, 5.2),   # 4. Base - Solana
    (( 116.0, -278.0), 17.0, 14.0, 5.4),   # 5. Solana - BSC
    (( 222.0, -236.0), 17.0, 14.0, 4.8),   # 6. BSC - Hyperliquid
    (( 268.0, -162.0), 14.0, 14.0, 4.2),   # 7. East of Hyperliquid -> East outer coast
)

# Protected headland zones where natural() MUST stay exact for auto-levelled civic pads, causeway abutment & goat pasture
_PHAROS_KEEP = (
    (-118.0,  98.0, 15.0, 22.0),   # chartroom pad (18x14, z=10.83)
    (-149.2, 108.8, 12.0, 18.0),   # keeperslog pad (12x10, z=4.01)
    (-161.2, 122.8, 12.0, 18.0),   # CW_A causeway landing (CW_DECK_A=2.88)
    (-106.1, 102.4, 13.0, 19.0),   # HEADLAND_MEADOW goat pasture
)


def _pharos_keep_mask(u, v):
    """0 inside protected headland pads/abutment/pasture, smoothly 1 outside."""
    k = 1.0
    for (cu, cv, r0, r1) in _PHAROS_KEEP:
        d = math.hypot(u - cu, v - cv)
        if d < r1:
            k = min(k, sstep(r0, r1, d))
    return k


def coastal_headland_lift(u, v, dc):
    """Lift non-quay, non-beach outer capes right to the shoreline (dc = 0) so coastal sea cliffs form cleanly.

    Preserves Tron's SE sightline cone (u > 245, v > -96), Wreck Strand, and all Pharos headland pads.
    """
    shore_band = 1.0 - sstep(14.0, 32.0, dc)
    lift = 0.0

    # 1. East Headland outer coast (u = 240..274, v = -165..-95), keeping u > 245, v > -96 low for Tron sightline
    if 225.0 < u < 285.0 and -178.0 < v < -84.0:
        w_e = sstep(236.0, 248.0, u) * (1.0 - sstep(276.0, 286.0, u)) * sstep(-172.0, -155.0, v) * (1.0 - sstep(-112.0, -92.0, v))
        if w_e > 0.0:
            n_e = 0.72 + 0.56 * ridge_noise(u, v, 0.028, 2, 101)
            lift = max(lift, (4.8 + 3.2 * n_e) * w_e * (0.45 + 0.55 * shore_band))

    # 2. East Headland NE point (u = 185..215, v = 68..95), clear of Mint pad, RINGS[3] & Tron quay apron
    if 178.0 < u < 224.0 and 64.0 < v < 102.0:
        w_ne = sstep(186.0, 198.0, u) * (1.0 - sstep(214.0, 224.0, u)) * sstep(68.0, 76.0, v) * (1.0 - sstep(92.0, 100.0, v))
        if w_ne > 0.0:
            n_ne = 0.7 + 0.5 * ridge_noise(u, v, 0.032, 2, 103)
            lift = max(lift, (4.2 + 2.6 * n_ne) * w_ne * (0.45 + 0.55 * shore_band))

    # 3. Pharos North/NE rim (u = -155..-50, v = 98..116), strictly outside chartroom / keeperslog / CW_A / meadow
    if -158.0 < u < -44.0 and 96.0 < v < 122.0:
        w_ph = sstep(-154.0, -140.0, u) * (1.0 - sstep(-56.0, -44.0, u)) * sstep(101.0, 108.0, v) * (1.0 - sstep(115.0, 122.0, v))
        if w_ph > 0.0:
            pk = _pharos_keep_mask(u, v)
            if pk > 0.0:
                rim_band = 1.0 - sstep(6.0, 15.0, dc)
                n_ph = 0.65 + 0.55 * ridge_noise(u, v, 0.036, 2, 107)
                lift = max(lift, (2.2 + 2.4 * n_ph) * w_ph * pk * rim_band)

    # 4. Wreck Cove bracketing capes: North knuckle (-255..-242, -8..12) & South Lifeboat cape (-340..-312, -170..-140)
    if -280.0 < u < -234.0 and -18.0 < v < 22.0:
        w_wn = gauss(u, v, -258.0, -2.0, 15.0, 13.0)
        if w_wn > 0.01:
            lift = max(lift, (4.3 + 1.3 * ridge_noise(u, v, 0.04, 2, 109)) * w_wn)
    if -350.0 < u < -304.0 and -178.0 < v < -134.0:
        w_ws = gauss(u, v, -330.0, -154.0, 18.0, 15.0)
        if w_ws > 0.01:
            lift = max(lift, (3.4 + 1.3 * ridge_noise(u, v, 0.038, 2, 111)) * w_ws)

    # 5. 7 South Cove rocky promontory knuckles sitting strictly between the 6 south coves
    if v < -145.0:
        for (cu, cv), su, sv, amp in SOUTH_KNUCKLES:
            if abs(u - cu) < su * 2.5 and abs(v - cv) < sv * 2.5:
                wk = gauss(u, v, cu, cv, su, sv)
                if wk > 0.01:
                    n_k = 0.8 + 0.4 * ridge_noise(u, v, 0.035, 2, 113)
                    lift = max(lift, amp * n_k * wk * (0.45 + 0.55 * shore_band))

    return lift


# ------------------------------------------------------------------ Ancient Stepped Limestone Quarry (behind Mint)
QUARRY_UV = (199.5, 48.0)
QUARRY_RU, QUARRY_RV, QUARRY_ANG = 14.5, 19.5, 0.24
QUARRY_STEP, QUARRY_RISER = 2.2, 0.20


def quarry_w(u, v):
    """0..1 weight inside the ancient stepped limestone quarry amphitheatre behind the Mint (u=185..218, v=32..74)."""
    du, dv = u - QUARRY_UV[0], v - QUARRY_UV[1]
    ca, sa = math.cos(QUARRY_ANG), math.sin(QUARRY_ANG)
    d = math.hypot((du * ca + dv * sa) / QUARRY_RU, (-du * sa + dv * ca) / QUARRY_RV)
    if d >= 1.0:
        return 0.0
    w = 1.0 - sstep(0.68, 1.0, d)
    if u < 188.0:
        w *= sstep(184.0, 189.0, u)
    return w


def quarry_info(x, y):
    """(weight, bench_fraction) inside the stepped quarry; fraction > 1 - QUARRY_RISER is a cut limestone face."""
    u, v = to_uv(x, y)
    w = quarry_w(u, v)
    if w <= 0.0:
        return 0.0, 0.0
    if pad_at(x, y, 3.0) is not None:
        return 0.0, 0.0
    h = height(x, y, terraces=False, roads=False)
    k = h / QUARRY_STEP
    return w, k - math.floor(k)


def town_polar(u, v):
    du, dv = u - CT[0], v - CT[1]
    return math.hypot(du, dv), math.degrees(math.atan2(dv, du))


def _ang_in(th, th0, th1, soft=6.0):
    """1 inside [th1, th0] (degrees, th0 > th1, theta in -180..180 with the arc wrapping past 180), soft edges."""
    if th < -90:
        th += 360.0
    return sstep(th1 - soft, th1, th) * (1 - sstep(th0, th0 + soft, th))


def natural(u, v):
    wx, wy = from_uv(u, v)
    dc = dcoast(wx, wy)
    pk = _pharos_keep_mask(u, v)
    # shore rise: everything climbs a little inland
    h = Z_SHORE - 0.4 + 7.5 * (1 - math.exp(-dc / 34.0))
    # the amphitheatre bowl round the Vagen (the terraces are carved into it)
    r, th = town_polar(u, v)
    bowl = _ang_in(th, 186.0, -4.0, 20.0) * (1 - sstep(128.0, 150.0, r))
    if bowl > 0 and r > R_QUAY:
        hb = Z_SHORE + (r - R_QUAY) * 0.33 + 3.0 * sstep(115.0, 132.0, r)
        h = h * (1 - bowl) + max(h, hb) * bowl
    # the headland: a low karst table (P6: the tower stands on its islet; the Burn on the NE point)
    hd = head_d(u, v)
    h = max(h, Z_SHORE + HEAD_H * (1 - sstep(0.7, 1.25, hd)) + 1.0 * (1 - sstep(0.0, 0.7, hd)))
    # west lobe: spine + windmill knoll above rolling meadows (protected headland pads & SW Polygon wall keep gentle falloff)
    sw_wall_calm = (1.0 - sstep(-205.0, -185.0, u)) * (1.0 - sstep(-152.0, -138.0, v))
    w_dc = sstep(4.0, 30.0, dc) + pk * (1.0 - sw_wall_calm) * (sstep(2.0, 20.0, dc) - sstep(4.0, 30.0, dc)) * sstep(70.0, 20.0, v)
    h += 11.0 * math.exp(-(line_d(u, v, WEST_SPINE) / 42.0) ** 2) * w_dc
    h += 7.0 * gauss(u, v, *WINDMILL_UV, 26.0, 22.0)
    # Ease the steep NW shoulder pressing against the SW Polygon retaining wall ends (u=-248..-220, v=-176..-154)
    h -= 3.2 * gauss(u, v, -238.0, -165.0, 12.0, 10.0)
    h += 3.0 * (fbm(u, v, 0.011, 2, 9) - 0.4) * sstep(10.0, 40.0, dc)

    # east lobe: asymmetric Mediterranean karst cuesta (u=228..246, v=-135..25, crest 26-33 m <= 34 m)
    # Asymmetric cross-section: steeper camera-facing SW escarpment (u < 235), gentler NE dip slope
    d_es = line_d(u, v, EAST_SPINE)
    asym = 30.0 if u < 235.0 else 36.0
    cuesta_core = math.exp(-(d_es / asym) ** 2) * sstep(2.0, 20.0, dc)
    rn_e = ridge_noise(u, v, 0.018, 3, 19)
    h += (12.8 + 2.4 * (rn_e - 0.35)) * cuesta_core
    h += 5.4 * gauss(u, v, 229.0, -96.0, 23.0, 40.0, -0.15)
    # 3 stepped limestone escarpment benches on the camera-facing SW/S flank of the East cuesta (u=188..235, v=-140..-45)
    if 182.0 < u < 240.0 and -148.0 < v < -36.0:
        w_esc = (
            sstep(186.0, 198.0, u) * (1.0 - sstep(228.0, 238.0, u))
            * sstep(-144.0, -130.0, v) * (1.0 - sstep(-52.0, -38.0, v))
            * sstep(12.0, 24.0, dc)
        )
        if w_esc > 0.0:
            hq_e = strata_quantize(h, 4.4, riser=0.28)
            h = h + (hq_e - h) * (0.62 * w_esc)

    # south strip's low limestone ridge between the lagoon and the coves (kept cleanly <= 18 m)
    h += 5.5 * math.exp(-(line_d(u, v, SOUTH_RIDGE) / 26.0) ** 2) * (0.75 + 0.5 * fbm(u, v, 0.014, 2, 7))
    # facets + subtle karst ridge modulation (zero inside protected Pharos pads and goat pastures)
    calm = 1.0 - 0.75 * (1 - sstep(0.75, 1.2, hd))
    h += (fbm(u, v, 0.02, 3, 3) - 0.5) * 3.0 * calm
    if pk > 0.0 and dc > 4.0 and (u > 175.0 or u < -175.0 or v < -200.0):
        kr = (ridge_noise(u, v, 0.026, 2, 27) - 0.45) * 1.30 * pk * sstep(4.0, 18.0, dc)
        # Keep west goat pastures, West farmhouse lot, and SW Polygon wall shoulders smooth
        if u < -150.0 and -192.0 < v < -102.0:
            kr = 0.0
        h += kr

    # Coastal headland lift: lifts non-quay, non-beach outer capes right to dc = 0
    h += coastal_headland_lift(u, v, dc)

    # Hard sightline & elevation guards:
    # 1. Strictly low SE of harbour-office-tron (uv=(263.8, -63.2), z=2.40; camera along -V at 26 deg pitch)
    if u > 236.0 and -118.0 < v < -44.0:
        al = max(0.0, -63.2 - v)
        sight_cap = 3.2 + 0.44 * max(0.0, al - 10.0)
        w_tr = sstep(236.0, 244.0, u) * sstep(-118.0, -102.0, v) * (1.0 - sstep(-52.0, -44.0, v))
        if w_tr > 0.0 and h > sight_cap:
            h = h * (1.0 - w_tr) + sight_cap * w_tr
    # 2. East Headland crest cleanly <= 34.0 m (soft asymptotic cap from 31.5 m -> 33.6 m)
    if u > 165.0 and h > 31.5:
        h = 31.5 + 2.1 * math.tanh((h - 31.5) / 2.6)
    # 3. South Rim cleanly <= 18.0 m (soft cap from 15.8 m -> 17.5 m)
    if v < -205.0 and -160.0 < u < 180.0 and h > 15.8:
        h = 15.8 + 1.7 * math.tanh((h - 15.8) / 2.2)

    return h


def town_step(u, v):
    """Stepped terrace height (z, weight) round the Vagen, or (None, 0) outside the amphitheatre."""
    r, th = town_polar(u, v)
    for (r0, r1, z), (th0, th1) in zip(RINGS, TOWN_TH):
        if r0 <= r < r1 + 1.0:
            w = _ang_in(th, th0 + 4.0, th1 - 4.0, 8.0)
            if w > 0:
                return z, w
    return None, 0.0


# ------------------------------------------------------------------ Cultivated terraces: West, East, Vineyard & South pockets
# Sweeping West hillside amphitheatre (u = -215..-132, v = -145..5) stepping down toward West Quay & framing Sanctuary
WEST_TERRACES = [
    ((-164.0, -106.0), 33.0, 34.0, 0.22),
    ((-164.0,  -56.0), 34.0, 34.0, 0.18),
    ((-178.0,  -16.0), 30.0, 22.0, 0.26),
]
# 2 sweeping East terrace zones (SW mid-slope u=186..232, v=-155..-85 & NW shoulder u=172..218, v=-40..30)
EAST_TERRACES = [
    (( 212.0, -124.0), 22.0, 29.0, -0.22),
    (( 196.0,   -4.0), 21.0, 31.0,  0.12),
]
# Pocket back-garden terraces along SOUTH_RIDGE behind the cove hamlets
SOUTH_TERRACES = [
    (( -80.0, -238.0), 14.0,  8.5,  0.05),
    ((   8.0, -242.0), 15.0,  8.5, -0.04),
    (( 116.0, -236.0), 14.0,  8.5, -0.10),
]
# Combined list exported as TERRACES so hb_land.py, hb_dress.py, bake_terrain.py & hb_groundcover.py all cover them!
TERRACES = WEST_TERRACES + EAST_TERRACES + SOUTH_TERRACES
TERRACE_STEP, TERRACE_RISER = 1.6, 0.28

# Level discs (screen plan centre, radius, blend): threshing floor (aloni) by windmill & hill sanctuary temenos
THRESHING_UV, THRESHING_R = (-196.0, -186.0), 5.2
SANCTUARY_UV, SANCTUARY_R = (-155.0, -15.0), 9.5
_discs = None

# Contour terraced vineyard (u = -182..-138, v = -185..-142): 3-4 curved stepped contour benches
VINE_UV = (-160.0, -164.0)
VINE_RU, VINE_RV, VINE_ANG = 20.5, 18.5, 0.22
VINE_HALF = (19.5, 17.5)      # backwards-compatible half-size tuple
VINE_STEP, VINE_RISER = 1.55, 0.24
_vine = None


def vine_w(u, v):
    """0..1 weight inside the stepped contour vineyard (u=-182..-138, v=-185..-142)."""
    du, dv = u - VINE_UV[0], v - VINE_UV[1]
    ca, sa = math.cos(VINE_ANG), math.sin(VINE_ANG)
    d = math.hypot((du * ca + dv * sa) / VINE_RU, (-du * sa + dv * ca) / VINE_RV)
    if d >= 1.0:
        return 0.0
    return 1.0 - sstep(0.76, 1.0, d)


def vineyard():
    """(centre, fall-line unit vector, across unit vector, world polygon) of the contour vineyard (world coords)."""
    global _vine
    if _vine is None:
        cx, cy = from_uv(*VINE_UV)
        gx = (height(cx + 2, cy, terraces=False, roads=False) - height(cx - 2, cy, terraces=False, roads=False)) / 4.0
        gy = (height(cx, cy + 2, terraces=False, roads=False) - height(cx, cy - 2, terraces=False, roads=False)) / 4.0
        gl = math.hypot(gx, gy)
        d = (-gx / gl, -gy / gl) if gl > 1e-4 else (1.0, 0.0)
        a = (-d[1], d[0])
        ca, sa = math.cos(VINE_ANG), math.sin(VINE_ANG)
        poly = []
        for k in range(16):
            t = 2.0 * math.pi * k / 16
            lu, lv = math.cos(t) * VINE_RU * 0.94, math.sin(t) * VINE_RV * 0.94
            poly.append(from_uv(VINE_UV[0] + lu * ca - lv * sa, VINE_UV[1] + lu * sa + lv * ca))
        _vine = ((cx, cy), d, a, poly)
    return _vine


def in_vineyard(x, y, grow=0.0):
    u, v = to_uv(x, y)
    du, dv = u - VINE_UV[0], v - VINE_UV[1]
    ca, sa = math.cos(VINE_ANG), math.sin(VINE_ANG)
    d = math.hypot((du * ca + dv * sa) / (VINE_RU + grow), (-du * sa + dv * ca) / (VINE_RV + grow))
    return d < 0.94


def _in_field_margin_uv(u, v):
    """Smooth attenuation 0..1 keeping FIELDS (pastures/hay/plough) and Bonded Warehouse smoothly clear of terrace risers."""
    wx, wy = from_uv(u, v)
    k = 1.0
    # Smoothly feather terrace weight to 0 over 8 m outside every field polygon (never a hard step!)
    for f in FIELDS:
        bb = f['bb']
        if not (bb[0] - 9.0 <= wx <= bb[2] + 9.0 and bb[1] - 9.0 <= wy <= bb[3] + 9.0):
            continue
        p = f['poly']
        inside = False
        j = len(p) - 1
        d_edge = 1e9
        for i in range(len(p)):
            xi, yi = p[i]; xj, yj = p[j]
            if ((yi > wy) != (yj > wy)) and (wx < (xj - xi) * (wy - yi) / (yj - yi + 1e-12) + xi):
                inside = not inside
            di = _segd(wx, wy, p[i], p[j])
            if di < d_edge:
                d_edge = di
            j = i
        if inside:
            return 0.0
        if d_edge < 8.5:
            k = min(k, sstep(1.0, 8.5, d_edge))
    # Keep Bonded Warehouse yard at uv=(204, -104) clear of East SW terrace risers
    dw = math.hypot(u - 204.0, v + 104.0)
    if dw < 19.0:
        k = min(k, sstep(13.0, 19.0, dw))
    return k


def terrace_w(u, v):
    """0..1 terrace weight at a screen-plan point (1 inside a terraced hillside, soft at its rim)."""
    w = 0.0
    for (c, ru, rv, a) in TERRACES:
        du, dv = u - c[0], v - c[1]
        if abs(du) > ru + rv or abs(dv) > ru + rv:
            continue
        ca, sa = math.cos(a), math.sin(a)
        d = math.hypot((du * ca + dv * sa) / ru, (-du * sa + dv * ca) / rv)
        if d < 1.0:
            w = max(w, 1.0 - sstep(0.72, 1.0, d))
    if w > 0.0:
        w *= _in_field_margin_uv(u, v)
    return w


def terraced(h, w):
    """Quantise a natural height into benches + risers, weighted by w."""
    if w <= 0.0:
        return h
    q = strata_quantize(h, TERRACE_STEP, TERRACE_RISER)
    return h + (q - h) * w


def terrace_info(x, y):
    """(weight, step fraction of the natural height) at a world point: fraction > 1 - RISER is a riser face."""
    u, v = to_uv(x, y)
    w = terrace_w(u, v)
    if w > 0.0:
        h = height(x, y, terraces=False, roads=False)
        k = h / TERRACE_STEP
        return w, k - math.floor(k)
    vw = vine_w(u, v)
    if vw > 0.0:
        h = height(x, y, terraces=False, roads=False)
        k = h / VINE_STEP
        return vw * 0.85, k - math.floor(k)
    return 0.0, 0.0


def _disc_list():
    global _discs
    if _discs is None:
        _discs = []
        for (cuv, r, b) in ((THRESHING_UV, THRESHING_R, 3.0), (SANCTUARY_UV, SANCTUARY_R, 4.0)):
            x, y = from_uv(*cuv)
            _discs = _discs + [(x, y, r, b, None)]
        _discs = [(x, y, r, b, height(x, y, discs=False, roads=False)) for (x, y, r, b, _z) in _discs]
    return _discs


def disc_at(x, y):
    """(z, weight) of a level disc covering (x, y), else None."""
    for (cx, cy, r, b, z) in _disc_list():
        d = math.hypot(x - cx, y - cy)
        if d < r + b:
            return z, 1.0 - sstep(r, r + b, d)
    return None


def _quay_flat(x, y):
    """(distance m, apron depth m, outer blend m) to the nearest quay line, for the shore-level flats."""
    best = (1e9, 0.0, 14.0)
    for name, L in _quays.items():
        if name in ('long', 'grand', 'tron'):
            ap, bl = 13.0, 14.0
        elif name.endswith(('-w', '-e')):
            ap, bl = 3.5, 6.5       # narrow cove flank aprons (3.0 m paved) keep inter-cove rocky knuckles crisp
        elif name.startswith('cove'):
            ap, bl = 8.0, 14.0
        else:
            ap, bl = 9.0, 14.0
        for a, b in zip(L, L[1:]):
            d = seg_d(x, y, a, b)
            if d < best[0]:
                best = (d, ap, bl)
    return best


def _furrow_delta(x, y, u, v):
    """Subtle +/-0.14 m 3D directional furrow micro-undulation inside plough/hay fields (0 in pastures)."""
    fl = field_at(x, y)
    if fl is None or fl['kind'] not in ('plough', 'hay'):
        return 0.0
    p = fl['poly']
    d_edge = min(_segd(x, y, p[i], p[(i + 1) % len(p)]) for i in range(len(p)))
    edge_w = sstep(0.4, 2.8, d_edge)
    if edge_w <= 0.0:
        return 0.0
    amp = 0.14 if fl['kind'] == 'plough' else 0.09
    return amp * edge_w * math.sin((u * 0.9 + v * 0.3) * (2.0 * math.pi / 3.4))


# Curated karst limestone outcrop crags (valid open-land sites; exact placed coords also exported by hb_dress.py)
OUTCROPS_UV = (
    # East cuesta SW escarpment, crest & outer coastal headlands
    ( 240.0, -108.0), ( 234.0,  -84.0), ( 236.0,  -52.0), ( 222.0,  -16.0),
    ( 218.0,   28.0), ( 200.0,   72.0), ( 246.0, -142.0), ( 232.0, -138.0),
    ( 224.0, -148.0),
    # West terraces, West spine, Sanctuary rim & Pharos headland karst table
    (-170.0,  -70.0), (-178.0,  -64.0), (-196.0,  -26.0), (-186.0,  -68.0),
    (-134.0,   86.0), ( -78.0,  108.0), (-192.0,  -14.0), (-272.0, -172.0),
    (-332.0, -154.0),
    # South ridge & inter-cove rocky knuckles
    (-218.0, -244.0), (-108.0, -264.0), ( -20.0, -226.0), (  10.0, -274.0),
    (  61.0, -220.0), ( 120.0, -228.0), ( 120.0, -268.0), ( 220.0, -228.0),
    (-178.0, -218.0),
    # Upper amphitheatre rim crags
    (  60.0,  132.0), ( 136.0,  108.0), (-100.0,  108.0),
)

# Smooth goat pasture relaxation specs: (centre_uv, ru, rv, ang)
_PASTURE_GENTLE = (
    ((-106.1,  102.4), 10.5, 13.5, 0.15),   # HEADLAND_MEADOW (world (-204, 54), ra=6.5, rb=13)
    ((-178.0, -128.0), 19.0, 14.0, -0.20),  # Farm pasture 1 (FIELDS[1])
    ((-232.0, -132.0), 18.0, 15.0, 0.90),   # Farm pasture 2 (FIELDS[2])
)


def _wreck_strand_dist(x, y):
    """Distance (m) to Wreck Strand waterline (first sand beach), or 999 if none."""
    for line, _depth, kind, box, _ends in _beaches:
        if kind != 'sand':
            continue
        if not (box[0] <= x <= box[2] and box[1] <= y <= box[3]):
            return 999.0
        return min(_segd(x, y, a, b) for a, b in zip(line, line[1:]))
    return 999.0


def _pasture_smooth(x, y, u, v, h, dc, kb):
    """Gently ease steep undulations inside the 3 goat pastures (strictly outside WRECK_STRAND dl < 44 m)."""
    for idx, (c, ru, rv, a) in enumerate(_PASTURE_GENTLE):
        du, dv = u - c[0], v - c[1]
        if abs(du) > ru + rv + 12.0 or abs(dv) > ru + rv + 12.0:
            continue
        ca, sa = math.cos(a), math.sin(a)
        d = math.hypot((du * ca + dv * sa) / (ru + 6.0), (-du * sa + dv * ca) / (rv + 6.0))
        if d < 1.0:
            w = 1.0 - sstep(0.68 if idx == 0 else 0.55, 1.0, d)
            if idx == 0:
                h_tgt = 10.25 + (u + 106.1) * 0.025 + (v - 102.4) * (-0.04)
                h = h * (1.0 - 0.88 * w) + h_tgt * (0.88 * w)
            elif idx == 1:
                h_avg = 0.25 * (
                    natural(u + 7.0, v) + natural(u - 7.0, v) + natural(u, v + 7.0) + natural(u, v - 7.0)
                )
                h = h * (1.0 - 0.70 * w) + h_avg * (0.70 * w)
            else:
                # Farm pasture 2 sits inland of Wreck Strand (dl >= 44 m); strictly untouched for dl < 44 m
                dl_w = _wreck_strand_dist(x, y)
                w *= sstep(44.2, 54.0, dl_w)
                if w > 0.0:
                    # Smooth ramp starting seamlessly from back-of-dune height at dl_w=44 (<= 0.30 m/m)
                    h_tgt = 5.4 + 0.28 * max(0.0, dl_w - 44.0)
                    h = h * (1.0 - 0.86 * w) + h_tgt * (0.86 * w)
    return h


def height(x, y, coves=(), pads=True, flats=True, terraces=True, discs=True, roads=True, lots=True):
    u, v = to_uv(x, y)
    n = natural(u, v)
    z, w = town_step(u, v)
    h = n if z is None else n * (1 - w) + z * w
    if terraces and _grid is not None:
        tw = terrace_w(u, v)
        if tw > 0.0:
            h = terraced(h, tw)
        vw = vine_w(u, v)
        if vw > 0.0:
            qv = strata_quantize(h, VINE_STEP, VINE_RISER)
            h = h + (qv - h) * vw
        qw = quarry_w(u, v)
        if qw > 0.0:
            q_base = min(h, 17.6)
            qq = strata_quantize(q_base, QUARRY_STEP, QUARRY_RISER)
            h = h + (qq - h) * qw
        h += _furrow_delta(x, y, u, v)
    if discs and _grid is not None:
        dk = disc_at(x, y)
        if dk is not None:
            h = h * (1 - dk[1]) + dk[0] * dk[1]
    # quay aprons: exactly at quay level, easing into the slope behind
    d, ap, bl = _quay_flat(x, y)
    if d < ap + bl:
        k = 1.0 - sstep(ap, ap + bl, d)
        if z is not None and w > 0.5 and h > Z_SHORE + 0.5 and d > ap:
            k = 0.0            # never pull the town terraces down
        h = h * (1 - k) + Z_SHORE * k
    h = max(h, Z_SHORE - 1.4)
    # Universal road & footpath bench grading (all roads & paths sit flush inside the terrain)
    if roads and _roads:
        rq = road_query_uv(u, v)
        if rq is not None:
            dd, bz, hw, cut_m, _kind, rname, _tuv, _grade = rq
            inner = hw + (0.6 if rname == 'pharos' else 0.45)
            outer = hw + cut_m + (1.0 if rname == 'pharos' else 0.45)
            k = 1.0 - sstep(inner, outer, dd)
            if k > 0.0:
                h = h * (1 - k) + bz * k
    kb, _kind = beach_k(x, y)
    dc_b = dcoast(x, y) if _grid is not None else 0.0
    if kb > 0:                       # a strand: sand from the waterline up, easing into the land behind
        h = h * (1 - kb) + min(h, 0.22 + dc_b * (0.072 if _kind == 'sand' else 0.11)) * kb
        if _kind == 'sand' and dc_b > 36.0:          # P7: dune hummocks behind Wreck Cove's strand
            h += kb * sstep(36.0, 44.0, dc_b) * (0.8 + 4.2 * max(0.0, fbm(x, y, 0.055, 2, 21) - 0.25))
    if terraces and _grid is not None:
        h = _pasture_smooth(x, y, u, v, h, dc_b, kb)
    if _lots and lots:               # Building lots: +1.5 m flat pad + 2.5 m smooth ramp AFTER escarpment/karst/noise
        h = _apply_lots(x, y, h)
    if _flats and flats:
        fl = _flat_at(x, y)
        if fl is not None and fl[3] is not None:      # a terraced edge: level ledges and a cut slope
            h = min(h, fl[0] + 0.08 + terrace_cap(fl[3], fl[1]))
        elif fl is not None:
            k = 1.0 - sstep(0.0, fl[2], fl[1])
            h = h * (1 - k) + fl[0] * k
    if _pads and pads:               # P6 civic pads: dead level inside, a short easing outside (walled by hb_land)
        pd = pad_at(x, y, 4.0)
        if pd is not None:
            zp, d, b = pd
            k = 1.0 - sstep(0.0, b, d)
            h = h * (1 - k) + zp * k
    return h


def beach_k(x, y):
    """(weight, kind) of the nearest strand at (x, y): 1 on the beach, fading out behind it and past strand ends."""
    best = (0.0, None)
    dc = dcoast(x, y) if _grid is not None else 0.0
    for line, depth, kind, box, ends in _beaches:
        if not (box[0] <= x <= box[2] and box[1] <= y <= box[3]):
            continue
        dl = min(_segd(x, y, a, b) for a, b in zip(line, line[1:]))
        if dl > depth + 30.0:
            continue
        # Only flatten the beach's own shore (not the opposite side of a narrow peninsula where dl >> dc)
        same_shore = 1.0 - sstep(22.0, 42.0, dl - dc)
        if same_shore <= 0.0:
            continue
        (t0x, t0y), (t1x, t1y) = ends
        p0 = (x - line[0][0]) * t0x + (y - line[0][1]) * t0y
        p1 = (x - line[-1][0]) * t1x + (y - line[-1][1]) * t1y
        past_end = max(0.0, p0, p1)
        end_w = 1.0 - sstep(2.0, 12.0, past_end)
        if end_w <= 0.0:
            continue
        k = (1.0 - sstep(depth * 0.85, depth + 14.0, dc)) * (1.0 - sstep(depth + 6.0, depth + 26.0, dl)) * end_w * same_shore
        if k > best[0]:
            best = (k, kind)
    return best


def _segd(px, py, a, b):
    abx, aby = b[0] - a[0], b[1] - a[1]
    t = max(0.0, min(1.0, ((px - a[0]) * abx + (py - a[1]) * aby) / (abx * abx + aby * aby + 1e-9)))
    return math.hypot(px - a[0] - abx * t, py - a[1] - aby * t)


# ------------------------------------------------------------------ meadows: irregular walled fields that follow the land
def _meadows():
    import random as _r
    rng = _r.Random(57)
    out = []
    # (centre uv, radius u, radius v, angle, kind)
    spec = [
        ((-206.0, -96.0), 22, 15, 0.4, 'hay'),
        ((-178.0, -128.0), 18, 13, -0.2, 'pasture'),
        ((-232.0, -132.0), 15, 12, 0.9, 'pasture'),
        ((-200.0, -160.0), 16, 11, 0.2, 'plough'),
        ((-150.0, -196.0), 20, 12, -0.15, 'hay'),
        ((-214.0, -214.0), 14, 10, 0.5, 'pasture'),
        ((206.0, -186.0), 18, 12, -0.4, 'hay'),
        ((182.0, -232.0), 14, 10, 0.1, 'pasture'),
        ((-110.0, -226.0), 16, 10, 0.05, 'pasture'),
    ]
    for (c, ru, rv, a, kind) in spec:
        pts = []
        ph = rng.uniform(0, 6.28)
        for k in range(9):
            t = 2 * math.pi * k / 9
            rr = 1 + 0.16 * math.sin(2 * t + ph) + 0.08 * math.sin(3 * t + ph * 1.7)
            pu, pv = math.cos(t) * ru * rr, math.sin(t) * rv * rr
            cu, cv = c[0] + pu * math.cos(a) - pv * math.sin(a), c[1] + pu * math.sin(a) + pv * math.cos(a)
            pts.append(from_uv(cu, cv))
        bb = (min(q[0] for q in pts), min(q[1] for q in pts), max(q[0] for q in pts), max(q[1] for q in pts))
        out.append(dict(poly=pts, kind=kind, bb=bb))
    return out


FIELDS = _meadows()
FIELD_COL = {'hay': '#C6B256', 'pasture': '#7C9C4C', 'plough': '#7D6247'}


def field_at(x, y):
    for f in FIELDS:
        bb = f['bb']
        if not (bb[0] <= x <= bb[2] and bb[1] <= y <= bb[3]):
            continue
        p = f['poly']
        inside = False
        j = len(p) - 1
        for i in range(len(p)):
            xi, yi = p[i]; xj, yj = p[j]
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
                inside = not inside
            j = i
        if inside:
            return f
    return None
