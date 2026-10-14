"""The Harbour v2 - terrain height function (pure Python; shared by compose.py and the Blender build).

height(x, y) in Blender coords (x east, y north) -> z metres, for points on the island. The town keeps stepped
terraces (flat pads, ashlar fronts); everything else is a designed natural landform: a spruce ridge behind the
town, a west highland, the Pharos headland plateau, a low ridge along the south arm, beaches at Wreck Cove.
"""
import math

Z_SHORE = 2.4
QY, WX, SY = 150.0, -150.0, -112.0
COVE_BACK = -226.0

# terraces: (front y, z, x0, x1) - pad from its front up to the next front
TERRACES = [(182.0, 7.0, -138.0, 150.0), (216.0, 12.0, -124.0, 126.0), (250.0, 17.0, -108.0, 116.0)]
TOWN_TOP = 286.0          # above this the hill is natural again


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


def gauss(x, y, cx, cy, sx, sy, ang=0.0):
    c, s = math.cos(ang), math.sin(ang)
    dx, dy = x - cx, y - cy
    u = (dx * c + dy * s) / sx; v = (-dx * s + dy * c) / sy
    return math.exp(-(u * u + v * v))


def seg_dist(px, py, ax, ay, bx, by):
    abx, aby = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby + 1e-9)))
    return math.hypot(px - ax - abx * t, py - ay - aby * t)


RIDGE = [(-258, 168), (-216, 250), (-170, 320), (-110, 352), (-10, 366), (90, 352), (170, 322), (226, 270)]   # spruce crest spine


def ridge_d(x, y):
    return min(seg_dist(x, y, *RIDGE[i], *RIDGE[i + 1]) for i in range(len(RIDGE) - 1))


def natural(x, y):
    h = Z_SHORE
    # north hill + ridge (behind the town) - rises with y, crest along RIDGE
    h += min(22.0, max(0.0, (y - 160.0)) * 0.10) * sstep(-262.0, -190.0, x)
    h += 14.0 * math.exp(-(ridge_d(x, y) / 46.0) ** 2)
    # west highland (Ethereum basin hinterland)
    h += 19.0 * gauss(x, y, -248, 30, 54, 124, 0.08)
    h += 7.0 * gauss(x, y, -212, -96, 40, 34)
    # the Pharos headland plateau (a crisp table with cliffs)
    hd = math.hypot((x - 224) / 46.0, (y - 182) / 70.0)
    h = max(h, Z_SHORE + 15.8 * (1 - sstep(1.0, 1.3, hd)) + 1.2 * (1 - sstep(0.0, 0.8, hd)))
    # south arm: a low rolling ridge between the bay and the hamlets
    sd = seg_dist(x, y, -206, -168, 150, -164)
    h += 8.5 * math.exp(-(sd / 26.0) ** 2) * (0.75 + 0.5 * fbm(x, y, 0.012, 2, 7))
    # NE town land falls gently to the north-east coast
    h += 6.0 * gauss(x, y, 190, 300, 50, 40)
    # facets: low-frequency undulation (crisp low-poly light catch), calmer on the headland table
    calm = 1.0 - 0.75 * (1 - sstep(0.9, 1.25, hd))
    h += (fbm(x, y, 0.018, 3, 3) - 0.5) * 3.2 * calm
    # Wreck Cove: a low beach shelf in the north-west bight
    k = gauss(x, y, -280, 290, 40, 30)
    return h * (1 - k) + 1.4 * k


def town_step(x, y):
    """Stepped town terrace height or None outside the terraced core."""
    if y < 160.0 or y > TOWN_TOP:
        return None
    z = Z_SHORE if (y < TERRACES[0][0] and TERRACES[0][2] <= x <= TERRACES[0][3]) else None
    for (fy, tz, x0, x1) in TERRACES:
        if y >= fy and x0 <= x <= x1:
            z = tz
    if z is None:
        return None
    # beyond the last terrace the core blends into the natural slope
    return z


def flats():
    """Areas that must be exactly at shore level: quay aprons, cove backs, the basin apron (centre, half sizes)."""
    out = [((0.0, QY + 9.0), (156.0, 9.5)),               # Grand Quay apron + front row
           ((WX - 14.0, 20.0), (16.0, 136.0)),            # Ethereum basin apron / warehouses
           ((172.0, 148.0), (10.0, 6.0))]                 # NE quay corner
    return out


def height(x, y, coves=()):
    t = town_step(x, y)
    n = natural(x, y)
    if t is not None:
        h = t
    else:
        h = n
        # around the terraced core, blend the natural slope toward the terrace levels (no towering banks)
        if 160 < y < TOWN_TOP + 30 and -170 < x < 180:
            ref = Z_SHORE
            for (fy, tz, x0, x1) in TERRACES:
                if y >= fy:
                    ref = tz
            k = sstep(46.0, 0.0, max(0.0, max(TERRACES[0][2] - x, x - TERRACES[0][3])))
            h = h * (1 - k * 0.85) + ref * k * 0.85
    # shore-level flats (aprons, the Grand Quay front row)
    for (c, hs) in flats():
        dx = max(0.0, abs(x - c[0]) - hs[0]); dy = max(0.0, abs(y - c[1]) - hs[1])
        d = math.hypot(dx, dy)
        if d < 14.0:
            k = sstep(14.0, 0.0, d)
            h = h * (1 - k) + Z_SHORE * k
    for (cx, hw) in coves:
        dx = max(0.0, abs(x - cx) - hw - 14); dy = max(0.0, y - (COVE_BACK + 22.0))
        d = math.hypot(dx, dy) if y > COVE_BACK - 30 else 99
        if d < 12.0:
            k = sstep(12.0, 0.0, d)
            h = h * (1 - k) + Z_SHORE * k
    return max(h, Z_SHORE - 1.2)


# ------------------------------------------------------------------ fields: a patchwork on the south arm, the west slope, the NE land
def _fields():
    import random as _r
    rng = _r.Random(57)
    out = []

    def grid(xs, ys, skip=()):
        for i in range(len(xs) - 1):
            for j in range(len(ys) - 1):
                if (i, j) in skip:
                    continue
                x0, x1, y0, y1 = xs[i], xs[i + 1], ys[j], ys[j + 1]
                g = 2.2
                poly = [(x0 + g + rng.uniform(-2, 2), y0 + g + rng.uniform(-2, 2)), (x1 - g + rng.uniform(-2, 2), y0 + g + rng.uniform(-2, 2)),
                        (x1 - g + rng.uniform(-2, 2), y1 - g + rng.uniform(-2, 2)), (x0 + g + rng.uniform(-2, 2), y1 - g + rng.uniform(-2, 2))]
                r = rng.random()
                kind = 'hay' if r < 0.38 else ('pasture' if r < 0.78 else 'plough')
                out.append(dict(poly=poly, kind=kind))
    grid([-196, -158, -118, -76, -34, 8, 50, 92, 134], [-202, -168, -132], skip=((0, 1), (8, 0)))
    grid([-212, -180], [-110, -76, -40, -4, 32, 70, 108], skip=())
    grid([-262, -232, -212], [-118, -84, -52], skip=())
    grid([150, 186, 222], [236, 268, 300], skip=((1, 1),))
    return out


FIELDS = _fields()
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
