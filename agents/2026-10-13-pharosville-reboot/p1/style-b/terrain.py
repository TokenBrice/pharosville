"""Terrain + coastline for the style block (numpy heightfield -> one mesh with per-face colours).

World frame: Blender +Z up, metres, sea level 0. Camera yaw 45 deg looks toward +X+Y, so screen-right
is (1,-1)/sqrt2 and screen-far is (1,1)/sqrt2. The block is composed in screen coords (u, v) and
converted with uv2w(); terraces follow the world grid (the iso diagonal on screen).
"""
import math
import numpy as np
from mathutils import Vector, noise
from lib import *

S2 = math.sqrt(2.0)


def uv2w(u, v):
    return ((u + v) / S2, (v - u) / S2)


def w2uv(x, y):
    return ((x - y) / S2, (x + y) / S2)


# ---------------------------------------------------------------- land outline (screen u,v), CCW
OUTLINE_UV = [
    # headland (left): compact cliffy promontory
    (-56, 8), (-68, 0), (-84, 4), (-96, 18), (-100, 34), (-94, 50), (-80, 60), (-64, 62),
    # back shore toward the town
    (-48, 68), (-30, 78), (-10, 86), (12, 92), (32, 92), (50, 86),
    # town right flank
    (66, 74), (78, 56), (84, 36), (82, 16), (74, 0), (64, -12), (56, -18), (50, -16),
    (48, -12),
]
QUAY_X = None   # filled in build: world x of the quay line


def catmull(pts, n=6, closed=True):
    out = []
    m = len(pts)
    for i in range(m if closed else m - 1):
        p0, p1, p2, p3 = (np.array(pts[(i + k) % m]) for k in (-1, 0, 1, 2))
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return out


def seg_dist(P, A, B, chunk=16384):
    AB = B - A
    L2 = (AB ** 2).sum(1) + 1e-12
    out = np.empty(len(P), np.float32)
    for s in range(0, len(P), chunk):
        p = P[s:s + chunk]
        AP = p[:, None, :] - A[None]
        t = np.clip((AP * AB[None]).sum(2) / L2[None], 0, 1)
        D = AP - t[..., None] * AB[None]
        out[s:s + chunk] = np.sqrt((D ** 2).sum(2)).min(1)
    return out


def inside_poly(P, poly):
    x, y = P[:, 0], P[:, 1]
    inside = np.zeros(len(P), bool)
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        cond = ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1)
        inside ^= cond
    return inside


def signed_dist(P, poly):
    A = np.array(poly, np.float32)
    B = np.roll(A, -1, 0)
    d = seg_dist(P, A, B)
    return np.where(inside_poly(P, poly), d, -d)


class Land:
    def __init__(self, layout):
        self.L = layout
        outer = [uv2w(*p) for p in catmull(OUTLINE_UV, 5, closed=False)] + [uv2w(*OUTLINE_UV[-1])]
        qx = layout['quay_x']
        y0, y1 = layout['quay_y']
        quay = [(qx, y0), (qx, y1), (qx - 10, y1)]
        back = [uv2w(*p) for p in catmull([(-6, 19), (-16, 17), (-28, 13), (-40, 10), (-50, 8), (-56, 8)], 5, closed=False)]
        self.poly = [tuple(map(float, p)) for p in outer + quay + back]
        self.poly_np = np.array(self.poly, np.float32)

    def height(self, X, Y):
        """Vectorised heightfield."""
        L = self.L
        P = np.stack([X.ravel(), Y.ravel()], 1).astype(np.float32)
        sd = signed_dist(P, self.poly).reshape(X.shape)          # + inside land
        nz = np.vectorize(lambda x, y: noise.noise(Vector((x * 0.045, y * 0.045, 1.7))))(X, Y)
        nz2 = np.vectorize(lambda x, y: noise.noise(Vector((x * 0.16, y * 0.16, 5.3))))(X, Y)
        # base land: rises quickly from the shore to ~2.2 m (quay level), cliffs where noted
        base = 2.4 * np.clip(sd / 3.0, -1, 1)
        h = base.copy()
        # headland dome (screen-left), cliffy toward the sea
        hx, hy = uv2w(*L['headland_uv'])
        dh = np.sqrt(((X - hx) / 30) ** 2 + ((Y - hy) / 30) ** 2)
        dome = 19.0 * np.clip(1.3 - dh, 0, 1) ** 0.45
        cliff = np.clip(sd / 7.0, 0, 1) ** 0.6
        h = np.maximum(h, dome * cliff + nz2 * 0.6 * cliff)
        # town terraces: world x steps behind the quay
        qx = L['quay_x']
        k = np.clip(np.floor((X - L['terrace_x0']) / L['terrace_w']) + 1, 0, L['terraces'])
        terr = 2.2 + k * L['terrace_h']
        town = (X > qx - 1) & (sd > 0)
        # the terraces only exist inside the town band, they fall off with distance to coast
        tw = np.clip(sd / 6.0, 0, 1)
        h = np.where(town, np.maximum(h, 2.2 + (terr - 2.2) * tw), h)
        # back meadow saddle between the headland and the town: gentle rise
        mx, my = uv2w(-10, 70)
        dm = np.sqrt(((X - mx) / 50) ** 2 + ((Y - my) / 30) ** 2)
        meadow = 8.0 * np.clip(1.2 - dm, 0, 1) ** 0.8 * np.clip(sd / 6.0, 0, 1)
        h = np.where(town, h, np.maximum(h, meadow + nz * 1.2 * np.clip(sd / 8, 0, 1)))
        # levelled pads (lighthouse compound, house plots off-terrace, slipway head)
        for (px_, py_, r_, z_) in L.get('pads', []):
            dd = np.sqrt((X - px_) ** 2 + (Y - py_) ** 2)
            w_ = np.clip((1.6 * r_ - dd) / (0.6 * r_), 0, 1)
            w_ = w_ * w_ * (3 - 2 * w_)
            h = np.where(sd > 0, h * (1 - w_) + z_ * w_, h)
        # slipway ramp: linear ramp into the water
        for (ax, ay, bx, by, wdt, za, zb) in L.get('ramps', []):
            vx, vy = bx - ax, by - ay
            ll = math.hypot(vx, vy)
            tt = ((X - ax) * vx + (Y - ay) * vy) / (ll * ll)
            dl = np.abs((X - ax) * vy - (Y - ay) * vx) / ll
            m_ = (tt > -0.1) & (tt < 1.2) & (dl < wdt / 2 + 3)
            zr = za + (zb - za) * np.clip(tt, 0, 1)
            k_ = np.clip((wdt / 2 + 3 - dl) / 3, 0, 1) * m_
            h = h * (1 - k_) + zr * k_
        # seabed outside
        h = np.where(sd < 0, -0.4 * np.minimum(-sd, 20) - 0.8 + 0.0 * nz, h)
        self.sd = sd
        return h
