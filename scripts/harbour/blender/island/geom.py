"""Small 2D geometry kit for the island composer (pure Python, no Blender)."""
import math, random

SQ2 = math.sqrt(2.0)


def screen_uv(x, y):
    """World (Blender x east, y north) -> screen-aligned plan (U right, V away) for the yaw-45 runtime camera."""
    return ((x + y) / SQ2, (y - x) / SQ2)


def from_uv(u, v):
    return ((u - v) / SQ2, (u + v) / SQ2)


def add(a, b): return (a[0] + b[0], a[1] + b[1])
def sub(a, b): return (a[0] - b[0], a[1] - b[1])
def mul(a, k): return (a[0] * k, a[1] * k)
def dot(a, b): return a[0] * b[0] + a[1] * b[1]
def length(a): return math.hypot(a[0], a[1])


def norm(a):
    l = length(a) or 1.0
    return (a[0] / l, a[1] / l)


def perp(a):           # left normal
    return (-a[1], a[0])


def lerp(a, b, t): return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def rot(a, ang):
    c, s = math.cos(ang), math.sin(ang)
    return (a[0] * c - a[1] * s, a[0] * s + a[1] * c)


def heading_rad(d):
    """Layout heading (glTF): bow along (sin h, 0, cos h); Blender bow dir (dx, dy) -> glTF (dx, -dy)."""
    return math.atan2(d[0], -d[1])


def poly_area(p):
    a = 0.0
    for i in range(len(p)):
        x0, y0 = p[i]; x1, y1 = p[(i + 1) % len(p)]
        a += x0 * y1 - x1 * y0
    return a / 2


def ccw(p):
    return p if poly_area(p) > 0 else p[::-1]


def pip(x, y, poly):
    inside = False
    n = len(poly); j = n - 1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def seg_dist(p, a, b):
    ab = sub(b, a); t = max(0.0, min(1.0, dot(sub(p, a), ab) / (dot(ab, ab) or 1e-9)))
    return length(sub(p, add(a, mul(ab, t))))


def poly_dist(p, poly, closed=True):
    n = len(poly)
    m = n if closed else n - 1
    return min(seg_dist(p, poly[i], poly[(i + 1) % n]) for i in range(m))


def seg_intersect(p1, p2, p3, p4):
    d1 = sub(p2, p1); d2 = sub(p4, p3)
    den = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(den) < 1e-12:
        return False
    t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den
    u = ((p3[0] - p1[0]) * d1[1] - (p3[1] - p1[1]) * d1[0]) / den
    return 0 < t < 1 and 0 < u < 1


def catmull(pts, n_per=6, closed=True):
    P = list(pts)
    out = []
    N = len(P)
    if not closed:
        P = [sub(mul(P[0], 2), P[1])] + P + [sub(mul(P[-1], 2), P[-2])]
        rng = range(1, len(P) - 2)
    else:
        rng = range(N)
    for i in rng:
        if closed:
            p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % N], P[(i + 2) % N]
        else:
            p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n_per):
            t = k / n_per; t2 = t * t; t3 = t2 * t
            q = tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                             + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(2))
            out.append(q)
    if not closed:
        out.append(P[-2])
    return out


def resample(poly, step, closed=True):
    """Even spacing along a polyline."""
    pts = poly + ([poly[0]] if closed else [])
    out = [pts[0]]; carry = 0.0
    for a, b in zip(pts, pts[1:]):
        L = length(sub(b, a)); d = step - carry
        while d <= L:
            out.append(lerp(a, b, d / L)); d += step
        carry = L - (d - step)
    if closed and length(sub(out[-1], out[0])) < step * 0.5:
        out.pop()
    return out


def offset(poly, d, closed=True):
    n = len(poly); out = []
    for i in range(n):
        if not closed and i == 0:
            e = norm(sub(poly[1], poly[0])); nn = (e[1], -e[0]); out.append(add(poly[0], mul(nn, d))); continue
        if not closed and i == n - 1:
            e = norm(sub(poly[-1], poly[-2])); nn = (e[1], -e[0]); out.append(add(poly[-1], mul(nn, d))); continue
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        e0 = norm(sub(p1, p0)); e1 = norm(sub(p2, p1))
        n0 = (e0[1], -e0[0]); n1 = (e1[1], -e1[0])
        nn = norm(add(n0, n1))
        k = 1.0 / max(0.35, dot(nn, n0))
        out.append(add(p1, mul(nn, d * k)))
    return out


def polyline_len(pts):
    return sum(length(sub(b, a)) for a, b in zip(pts, pts[1:]))


def along(pts, s):
    """Point + unit tangent at arc length s on an open polyline."""
    for a, b in zip(pts, pts[1:]):
        L = length(sub(b, a))
        if s <= L:
            return lerp(a, b, s / max(L, 1e-9)), norm(sub(b, a))
        s -= L
    return pts[-1], norm(sub(pts[-1], pts[-2]))


def rect(center, d, L, W):
    """Oriented rectangle corners: d = unit long axis."""
    n = perp(d); hl, hw = L / 2, W / 2
    c = center
    return [add(add(c, mul(d, hl)), mul(n, hw)), add(add(c, mul(d, -hl)), mul(n, hw)),
            add(add(c, mul(d, -hl)), mul(n, -hw)), add(add(c, mul(d, hl)), mul(n, -hw))]


def poisson(poly, rmin_fn, rng, k=30, seeds=None, avoid=None, max_n=10_000):
    """Bridson-ish dart throwing inside poly with variable radius rmin_fn(p)."""
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    pts = list(seeds or [])
    tries = 0
    while tries < max_n and len(pts) < max_n:
        tries += 1
        p = (rng.uniform(x0, x1), rng.uniform(y0, y1))
        if not pip(p[0], p[1], poly):
            continue
        if avoid and avoid(p):
            continue
        r = rmin_fn(p)
        if all(length(sub(p, q)) >= max(r, rmin_fn(q)) for q in pts):
            pts.append(p); tries = 0 if len(pts) < 5 else tries
    return pts


def blob(center, rx, ry, rng, n=14, wob=0.18, ang=0.0):
    out = []
    ph = rng.uniform(0, 6.28)
    for k in range(n):
        a = 2 * math.pi * k / n
        r = 1 + wob * math.sin(3 * a + ph) + wob * 0.6 * math.sin(5 * a + ph * 1.7)
        p = (math.cos(a) * rx * r, math.sin(a) * ry * r)
        out.append(add(center, rot(p, ang)))
    return out
