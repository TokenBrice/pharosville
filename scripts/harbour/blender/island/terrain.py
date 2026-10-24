"""The Harbour v3 - terrain height function (pure Python + numpy/scipy; shared by compose.py and the Blender build).

init(coast, quay_lines) once (world coords), then height(x, y) -> z metres on the island. Authored in SCREEN space
(U right, V away from the camera; heart target at the origin; world = from_uv(u, v + VOFF)) like compose.py:

  - the town amphitheatre: stepped terrace pads in radial bands round the Vagen (CT), carved into a natural bowl;
  - the Pharos headland: a rocky table at ~15 m, cliffs to the open sea;
  - the west lobe: rolling meadows (farmsteads, the windmill knoll) under a spruce spine;
  - the east lobe: a forested hill with a spruce crest and rock outcrops;
  - the south strip: a low ridge between the lagoon and the coves, the coves cut down to their quays;
  - quay aprons are exactly at quay level; Wreck Cove is a sand bight.
"""
import math

Z_SHORE = 2.4
VOFF = 80.0
SQ2 = math.sqrt(2.0)
CT = (100.0, 8.0)
R_QUAY = 58.0
# radial terrace bands round CT (screen metres) and their angular extents (screen degrees, th0 > th1)
RINGS = [(R_QUAY, R_QUAY + 18.0, Z_SHORE), (R_QUAY + 19.0, R_QUAY + 34.0, 8.0), (R_QUAY + 35.0, R_QUAY + 50.0, 13.5),
         (R_QUAY + 51.0, R_QUAY + 66.0, 19.0)]
TOWN_TH = [(168.0, 12.0), (160.0, 20.0), (150.0, 30.0), (140.0, 40.0)]
PHAROS = (-72.0, 96.0)          # legacy reference (P5 headland); P6 headland table: HEAD_C / HEAD_R
HEAD_C, HEAD_R, HEAD_H = (-102.0, 94.0), (40.0, 20.0), 8.0      # P6: a lower rocky table under the Burn, the road, the abutment

_S = 2.0
_grid = None          # (x0, y1, nx, ny, dist array) inside-distance to the coast (m)
_quays = {}
_beaches = []         # [(world polyline, depth m, kind)] - natural strands: the land slopes down to the waterline


def to_uv(x, y):
    return ((x + y) / SQ2, (y - x) / SQ2 - VOFF)


# the winding road to the Pharos (screen plan): the dresser lays it, the terrain cuts its bench into the headland's flank
PHAROS_ROAD = [(-97.0, 70.0), (-104.0, 82.0), (-122.0, 88.0), (-140.0, 98.0), (-150.0, 108.0), (-156.0, 116.0)]   # P6: the Tron
# quay's north end -> up the headland past the Chart Room and the Keeper's Log -> the causeway abutment
ROAD_CUT_W = 3.0
_road = None          # (dense uv polyline, graded z per point, bbox)
_flats = []           # integration G2: level aprons shared by civic plots [(poly, z, blend, bbox, terrace)] (world)
_pads = []            # P6 civic plots: level pads [(cx, cy, fx, fy, hw, hd, z, blend, bbox)] (world)


def set_pads(pads):
    """Level pads (world): dict(c, face, w, d, z, blend). Inside the rectangle the ground is exactly z; it eases back to
    the land over `blend` metres outside (hb_land walls every edge where the two differ)."""
    global _pads
    _pads = []
    for p in pads:
        cx, cy = p['c']; fx, fy = p['face']; hw, hd = p['w'] / 2, p['d'] / 2; b = p.get('blend', 2.5)
        r = math.hypot(hw, hd) + b
        # the ground sits 8 cm under the pad level: the civic model's own ground (at the pad level) never z-fights it
        _pads.append((cx, cy, fx, fy, hw, hd, p['z'] - 0.08, b, (cx - r, cy - r, cx + r, cy + r)))


def set_flats(flats):
    """Level aprons (world): dict(poly, z, blend) - a convex platform shared by neighbouring civic plots (the battery), so
    no strip of hill stands walled between them; it eases back to the land over `blend` m (hb_land walls its edges).
    Optional terrace=dict(edges, courses, slope) (P8): behind those edges the hill is cut in steps instead of one tall
    wall - courses [(outer distance, rise above z)], each a level ledge, then a `slope` cut up to the hill."""
    global _flats
    _flats = []
    for f in flats:
        P = [tuple(q) for q in f['poly']]; b = f.get('blend', 2.5)
        te = f.get('terrace')
        r = max(b, te['courses'][-1][0] + 24.0) if te else b
        _flats.append((P, f['z'] - 0.08, b, (min(q[0] for q in P) - r, min(q[1] for q in P) - r, max(q[0] for q in P) + r, max(q[1] for q in P) + r), te))


def terrace_cap(te, d):
    """Highest ground (above the flat) a terrace allows at outer distance d."""
    for d_end, rise in te['courses']:
        if d < d_end:
            return rise
    d_end, rise = te['courses'][-1]
    return rise + te['slope'] * (d - d_end)


def _flat_at(x, y):
    """(z, outside distance, blend, terrace or None) of the flat covering (x, y), within its blend or (on a terraced edge)
    within its terrace reach, else None."""
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
    """(z, outside distance) of the pad covering (x, y) within `margin` m of its edge, else None."""
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


def init(coast, quay_lines=None, beaches=None):
    """Rasterise the coast (world coords) into a distance-inside field; remember the quay lines and beaches (world)."""
    global _grid, _quays, _beaches, _road, _discs, _vine
    _beaches = []
    _discs = None; _vine = None
    for b in (beaches or []):
        L = list(map(tuple, b['line'])); m = b['depth'] + 30.0
        box = (min(p[0] for p in L) - m, min(p[1] for p in L) - m, max(p[0] for p in L) + m, max(p[1] for p in L) + m)
        _beaches.append((L, b['depth'], b.get('kind', 'sand'), box))
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
    # the road's bench: the ground's own height along the road, smoothed into an even grade (a cut on the climbs, a
    # little fill in the hollows), so the road lies ON a terrace instead of skidding across the slope
    _road = None
    from geom import catmull
    pts = catmull(PHAROS_ROAD, 6, closed=False)
    dense = []
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5))
        dense += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n)]
    dense.append(pts[-1])
    z0 = [height(*from_uv(*p)) for p in dense]
    zs = []
    for i in range(len(dense)):
        w = [z0[j] for j in range(max(0, i - 10), min(len(dense), i + 11))]
        zs.append(sum(w) / len(w))
    zs[0] = z0[0]; zs[-1] = z0[-1]
    m = ROAD_CUT_W / 2 + 7.0
    _road = (dense, zs, (min(p[0] for p in dense) - m, min(p[1] for p in dense) - m, max(p[0] for p in dense) + m, max(p[1] for p in dense) + m))


def dcoast(x, y):
    x0, y1, nx, ny, d = _grid
    fx, fy = (x - x0) / _S, (y1 - y) / _S
    i, j = int(fy), int(fx)
    if not (0 <= i < ny - 1 and 0 <= j < nx - 1):
        return 0.0
    tx, ty = fx - j, fy - i
    return float(d[i, j] * (1 - tx) * (1 - ty) + d[i, j + 1] * tx * (1 - ty) + d[i + 1, j] * (1 - tx) * ty + d[i + 1, j + 1] * tx * ty)


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


# spines (screen plan): spruce crests the dresser also reads
WEST_SPINE = [(-186.0, 20.0), (-204.0, -30.0), (-222.0, -116.0), (-250.0, -186.0)]
EAST_SPINE = [(232.0, -10.0), (244.0, -70.0), (240.0, -140.0), (214.0, -200.0)]
SOUTH_RIDGE = [(-130.0, -230.0), (-40.0, -238.0), (60.0, -240.0), (150.0, -228.0)]
WINDMILL_UV = (-226.0, -168.0)


def town_polar(u, v):
    du, dv = u - CT[0], v - CT[1]
    return math.hypot(du, dv), math.degrees(math.atan2(dv, du))


def _ang_in(th, th0, th1, soft=6.0):
    """1 inside [th1, th0] (degrees, th0 > th1, theta in -180..180 with the arc wrapping past 180), soft edges."""
    if th < -90:
        th += 360.0
    return sstep(th1 - soft, th1, th) * (1 - sstep(th0, th0 + soft, th))


def natural(u, v):
    dc = dcoast(*from_uv(u, v))
    # shore rise: everything climbs a little inland
    h = Z_SHORE - 0.4 + 7.5 * (1 - math.exp(-dc / 34.0))
    # the amphitheatre bowl round the Vagen (the terraces are carved into it)
    r, th = town_polar(u, v)
    bowl = _ang_in(th, 186.0, -4.0, 20.0) * (1 - sstep(128.0, 150.0, r))
    if bowl > 0 and r > R_QUAY:
        hb = Z_SHORE + (r - R_QUAY) * 0.33 + 3.0 * sstep(115.0, 132.0, r)
        h = h * (1 - bowl) + max(h, hb) * bowl
    # the headland: a low heather table (P6: the tower moved out to its islet; the Burn stands on the NE point)
    hd = head_d(u, v)
    h = max(h, Z_SHORE + HEAD_H * (1 - sstep(0.7, 1.25, hd)) + 1.0 * (1 - sstep(0.0, 0.7, hd)))
    # west lobe: the spruce spine and the windmill knoll above rolling meadows
    h += 11.0 * math.exp(-(line_d(u, v, WEST_SPINE) / 42.0) ** 2) * sstep(4.0, 30.0, dc)
    h += 7.0 * gauss(u, v, *WINDMILL_UV, 26.0, 22.0)
    h += 3.0 * (fbm(u, v, 0.011, 2, 9) - 0.4) * sstep(10.0, 40.0, dc)
    # east lobe: a forested hill
    h += 13.0 * math.exp(-(line_d(u, v, EAST_SPINE) / 38.0) ** 2) * sstep(4.0, 30.0, dc)
    h += 5.0 * gauss(u, v, 222.0, -104.0, 28.0, 38.0)
    # the south strip's low ridge between the lagoon and the coves
    h += 5.5 * math.exp(-(line_d(u, v, SOUTH_RIDGE) / 26.0) ** 2) * (0.75 + 0.5 * fbm(u, v, 0.014, 2, 7))
    # facets: low-frequency undulation (crisp low-poly light catch), calmer on the headland table
    calm = 1.0 - 0.75 * (1 - sstep(0.75, 1.2, hd))
    h += (fbm(u, v, 0.02, 3, 3) - 0.5) * 3.0 * calm
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


# ------------------------------------------------------------------ 08-T1/T4 (prettier): the cultivated west lobe
# Contour olive terraces on the spine's east flank (screen plan: centre, radii u/v, angle; soft-edged blobs). The ground is
# quantised into level benches TERRACE_STEP apart with a steep dry-stone riser (the top TERRACE_RISER share of each step's
# natural rise), so the benches follow the land's own contours; hb_land rows the mesh there, hb_dress lips + plants them.
TERRACES = [((-163.0, -90.0), 21.0, 15.0, 0.25), ((-160.0, -47.0), 19.0, 14.0, 0.2)]
TERRACE_STEP, TERRACE_RISER = 1.6, 0.16
# level discs (screen plan centre, radius, blend): the threshing floor by the windmill; the hill sanctuary's temenos on the
# spine's north knoll (z = the knoll's own height at the centre)
THRESHING_UV, THRESHING_R = (-196.0, -186.0), 5.2
SANCTUARY_UV, SANCTUARY_R = (-188.0, -8.0), 9.5
_discs = None      # [(x, y, r, blend, z)] world, built on first use
# the vineyard (screen plan centre; half-size along the fall line, across): its rows run straight down the slope
VINE_UV, VINE_HALF = (-162.0, -165.0), (12.0, 11.0)
_vine = None


def vineyard():
    """(centre, fall-line unit vector, across unit vector, world polygon) of the vineyard (world coords)."""
    global _vine
    if _vine is None:
        cx, cy = from_uv(*VINE_UV)
        gx = (height(cx + 2, cy) - height(cx - 2, cy)) / 4; gy = (height(cx, cy + 2) - height(cx, cy - 2)) / 4
        gl = math.hypot(gx, gy)
        d = (-gx / gl, -gy / gl) if gl > 1e-4 else (1.0, 0.0)
        a = (-d[1], d[0])
        poly = [(cx + d[0] * i * VINE_HALF[0] + a[0] * j * VINE_HALF[1], cy + d[1] * i * VINE_HALF[0] + a[1] * j * VINE_HALF[1])
                for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        _vine = ((cx, cy), d, a, poly)
    return _vine


def in_vineyard(x, y, grow=0.0):
    (cx, cy), d, a, _p = vineyard()
    dx, dy = x - cx, y - cy
    return abs(dx * d[0] + dy * d[1]) < VINE_HALF[0] + grow and abs(dx * a[0] + dy * a[1]) < VINE_HALF[1] + grow


def terrace_w(u, v):
    """0..1 terrace weight at a screen-plan point (1 inside a terraced hillside, soft at its rim)."""
    w = 0.0
    for (c, ru, rv, a) in TERRACES:
        du, dv = u - c[0], v - c[1]
        ca, sa = math.cos(a), math.sin(a)
        d = math.hypot((du * ca + dv * sa) / ru, (-du * sa + dv * ca) / rv)
        if d < 1.0:
            w = max(w, 1.0 - sstep(0.72, 1.0, d))
    return w


def terraced(h, w):
    """Quantise a natural height into benches + risers, weighted by w."""
    if w <= 0.0:
        return h
    k = h / TERRACE_STEP
    f = k - math.floor(k)
    q = (math.floor(k) + sstep(1.0 - TERRACE_RISER, 1.0, f)) * TERRACE_STEP
    return h + (q - h) * w


def terrace_info(x, y):
    """(weight, step fraction of the natural height) at a world point: fraction > 1 - RISER is a riser face."""
    u, v = to_uv(x, y)
    w = terrace_w(u, v)
    if w <= 0.0:
        return 0.0, 0.0
    h = height(x, y, terraces=False)
    k = h / TERRACE_STEP
    return w, k - math.floor(k)


def _disc_list():
    global _discs
    if _discs is None:
        _discs = []
        for (cuv, r, b) in ((THRESHING_UV, THRESHING_R, 3.0), (SANCTUARY_UV, SANCTUARY_R, 4.0)):
            x, y = from_uv(*cuv)
            _discs = _discs + [(x, y, r, b, None)]
        _discs = [(x, y, r, b, height(x, y, discs=False)) for (x, y, r, b, _z) in _discs]
    return _discs


def disc_at(x, y):
    """(z, weight) of a level disc covering (x, y), else None."""
    for (cx, cy, r, b, z) in _disc_list():
        d = math.hypot(x - cx, y - cy)
        if d < r + b:
            return z, 1.0 - sstep(r, r + b, d)
    return None


def _quay_flat(x, y):
    """Distance (m) to the nearest quay line and its apron depth, for the shore-level flats."""
    best = (1e9, 0.0)
    for name, L in _quays.items():
        ap = 13.0 if name in ('long', 'grand', 'tron') else (8.0 if name.startswith('cove') else 9.0)
        for a, b in zip(L, L[1:]):
            d = seg_d(x, y, a, b)
            if d < best[0]:
                best = (d, ap)
    return best


def height(x, y, coves=(), pads=True, flats=True, terraces=True, discs=True):
    u, v = to_uv(x, y)
    n = natural(u, v)
    z, w = town_step(u, v)
    h = n if z is None else n * (1 - w) + z * w
    if terraces and _grid is not None:
        h = terraced(h, terrace_w(u, v))
    if discs and _grid is not None:
        dk = disc_at(x, y)
        if dk is not None:
            h = h * (1 - dk[1]) + dk[0] * dk[1]
    # quay aprons: exactly at quay level, easing into the slope behind
    d, ap = _quay_flat(x, y)
    if d < ap + 14.0:
        k = 1.0 - sstep(ap, ap + 14.0, d)
        if z is not None and w > 0.5 and h > Z_SHORE + 0.5 and d > ap:
            k = 0.0            # never pull the terraces down
        h = h * (1 - k) + Z_SHORE * k
    h = max(h, Z_SHORE - 1.4)
    if _road is not None:
        dense, zs, bb = _road
        if bb[0] <= u <= bb[2] and bb[1] <= v <= bb[3]:
            best = (1e9, 0.0)
            for i in range(len(dense) - 1):
                a, b = dense[i], dense[i + 1]
                abx, aby = b[0] - a[0], b[1] - a[1]
                t = max(0.0, min(1.0, ((u - a[0]) * abx + (v - a[1]) * aby) / (abx * abx + aby * aby + 1e-9)))
                dd = math.hypot(u - a[0] - abx * t, v - a[1] - aby * t)
                if dd < best[0]:
                    best = (dd, zs[i] + (zs[i + 1] - zs[i]) * t)
            k = 1.0 - sstep(ROAD_CUT_W / 2 + 0.6, ROAD_CUT_W / 2 + 6.5, best[0])
            if k > 0:
                h = h * (1 - k) + best[1] * k
    kb, _kind = beach_k(x, y)
    if kb > 0:                       # a strand: sand from the waterline up, easing into the land behind
        dc = dcoast(x, y)
        h = h * (1 - kb) + min(h, 0.22 + dc * (0.072 if _kind == 'sand' else 0.11)) * kb
        if _kind == 'sand' and dc > 36.0:          # P7: dune hummocks behind Wreck Cove's strand (marram grass on them)
            h += kb * sstep(36.0, 44.0, dc) * (0.8 + 4.2 * max(0.0, fbm(x, y, 0.055, 2, 21) - 0.25))
    if _flats and flats:
        fl = _flat_at(x, y)
        if fl is not None and fl[3] is not None:      # a terraced edge: level ledges and a cut slope, walled by hb_land
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
    """(weight, kind) of the nearest strand at (x, y): 1 on the beach, fading out behind it and along the shore."""
    best = (0.0, None)
    for line, depth, kind, box in _beaches:
        if not (box[0] <= x <= box[2] and box[1] <= y <= box[3]):
            continue
        dl = min(_segd(x, y, a, b) for a, b in zip(line, line[1:]))
        if dl > depth + 30.0:
            continue
        # along-shore ends fade (the strand's own distance), inland the depth fades
        k = (1.0 - sstep(depth * 0.85, depth + 14.0, dcoast(x, y))) * (1.0 - sstep(depth + 6.0, depth + 26.0, dl))
        if k > best[0]:
            best = (k, kind)
    return best


def _segd(px, py, a, b):
    abx, aby = b[0] - a[0], b[1] - a[1]
    t = max(0.0, min(1.0, ((px - a[0]) * abx + (py - a[1]) * aby) / (abx * abx + aby * aby + 1e-9)))
    return math.hypot(px - a[0] - abx * t, py - a[1] - aby * t)


def from_uv(u, v):
    v = v + VOFF
    return ((u - v) / SQ2, (u + v) / SQ2)


# ------------------------------------------------------------------ meadows: irregular walled fields that follow the land
def _meadows():
    import random as _r
    rng = _r.Random(57)
    out = []
    # (centre uv, radius u, radius v, angle, kind)
    spec = [((-206.0, -96.0), 22, 15, 0.4, 'hay'), ((-178.0, -128.0), 18, 13, -0.2, 'pasture'), ((-232.0, -132.0), 15, 12, 0.9, 'pasture'),
            ((-200.0, -160.0), 16, 11, 0.2, 'plough'), ((-150.0, -196.0), 20, 12, -0.15, 'hay'), ((-214.0, -214.0), 14, 10, 0.5, 'pasture'),
            ((206.0, -186.0), 18, 12, -0.4, 'hay'), ((182.0, -232.0), 14, 10, 0.1, 'pasture'), ((-110.0, -226.0), 16, 10, 0.05, 'pasture')]
    for (c, ru, rv, a, kind) in spec:
        pts = []
        ph = rng.uniform(0, 6.28)
        for k in range(9):
            t = 2 * math.pi * k / 9
            rr = 1 + 0.16 * math.sin(2 * t + ph) + 0.08 * math.sin(3 * t + ph * 1.7)
            pu, pv = math.cos(t) * ru * rr, math.sin(t) * rv * rr
            cu, cv = c[0] + pu * math.cos(a) - pv * math.sin(a), c[1] + pu * math.sin(a) + pv * math.cos(a)
            pts.append(from_uv(cu, cv))
        out.append(dict(poly=pts, kind=kind))
    return out


FIELDS = _meadows()
FIELD_COL = {'hay': '#C6B256', 'pasture': '#7C9C4C', 'plough': '#7D6247'}     # 08-T1: stronger tonal contrast


def field_at(x, y):
    for f in FIELDS:
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
