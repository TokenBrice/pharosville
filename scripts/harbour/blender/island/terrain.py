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
PHAROS = (-72.0, 96.0)          # the headland reference (table centre = PHAROS - (16, 4)); the tower itself stands on the knoll
PHAROS_TOWER = (-80.0, 100.0)

_S = 2.0
_grid = None          # (x0, y1, nx, ny, dist array) inside-distance to the coast (m)
_quays = {}
_beaches = []         # [(world polyline, depth m, kind)] - natural strands: the land slopes down to the waterline


def to_uv(x, y):
    return ((x + y) / SQ2, (y - x) / SQ2 - VOFF)


# the winding road to the Pharos (screen plan): the dresser lays it, the terrain cuts its bench into the headland's flank
PHAROS_ROAD = [(-118.0, 22.0), (-132.0, 34.0), (-124.0, 52.0), (-142.0, 60.0), (-134.0, 76.0), (-112.0, 84.0), (-96.0, 92.0),
               (-84.0, 96.0)]
ROAD_CUT_W = 3.0
_road = None          # (dense uv polyline, graded z per point, bbox)


def init(coast, quay_lines=None, beaches=None):
    """Rasterise the coast (world coords) into a distance-inside field; remember the quay lines and beaches (world)."""
    global _grid, _quays, _beaches, _road
    _beaches = []
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
    # the Pharos headland: a heather table at ~15 m
    hd = math.hypot((u - PHAROS[0] + 16) / 50.0, (v - PHAROS[1] + 4) / 28.0)
    h = max(h, Z_SHORE + 15.0 * (1 - sstep(0.7, 1.25, hd)) + 1.4 * (1 - sstep(0.0, 0.7, hd)))
    # the summit knoll the Pharos stands on (its plinth is levelled by the builder)
    h += 3.2 * gauss(u, v, PHAROS_TOWER[0], PHAROS_TOWER[1], 16.0, 13.0)
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


def _quay_flat(x, y):
    """Distance (m) to the nearest quay line and its apron depth, for the shore-level flats."""
    best = (1e9, 0.0)
    for name, L in _quays.items():
        ap = 13.0 if name in ('long', 'grand') else (8.0 if name.startswith('cove') else 9.0)
        for a, b in zip(L, L[1:]):
            d = seg_d(x, y, a, b)
            if d < best[0]:
                best = (d, ap)
    return best


def height(x, y, coves=()):
    u, v = to_uv(x, y)
    n = natural(u, v)
    z, w = town_step(u, v)
    h = n if z is None else n * (1 - w) + z * w
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
FIELD_COL = {'hay': '#B9B262', 'pasture': '#87A457', 'plough': '#8E7556'}


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
