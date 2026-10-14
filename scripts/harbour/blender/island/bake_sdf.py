#!/usr/bin/env python3
"""Sea distance field for The Harbour (pure Python: numpy + scipy + PIL).

public/harbour/sea-sdf.png, RGBA8 2048^2 over layout.sea.bounds = [minX, minZ, maxX, maxZ] (glTF metres):
  R = clamp(0.5 + coastSignedDistance / 128, 0, 1)   (> 0.5 = sea; land = island, breakwater, stone jetty, rocks)
  G = clamp(depth / 40, 0, 1)                        (stylised bathymetry: dredged bay, shelving coast, shoal reef)
  B = clamp(distanceToStructure / 16, 0, 1)          (piles, pier decks, quay walls, breakwater, buoys)
  A = 1
Sampling: u = (x - minX) / (maxX - minX), v = (z - minZ) / (maxZ - minZ) with three.js' default flipY, i.e. the PNG's
top row is z = maxZ (south, nearest the default camera).

    python3 bake_sdf.py            (reads outputs/harbour/island/compose.json)
The Blender key-art build imports bake() to add a hull-contact + wake layer of its own.
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
N = 2048


def _grid(bounds, n):
    minX, minZ, maxX, maxZ = bounds
    xs = minX + (np.arange(n) + 0.5) * (maxX - minX) / n           # column -> glTF x (= Blender x)
    zs = maxZ - (np.arange(n) + 0.5) * (maxZ - minZ) / n           # row 0 = maxZ (PNG top row)
    return xs, zs


def _raster(polys, circles, bounds, n):
    from PIL import Image, ImageDraw
    minX, minZ, maxX, maxZ = bounds
    sx = n / (maxX - minX); sz = n / (maxZ - minZ)
    im = Image.new('L', (n, n), 0); d = ImageDraw.Draw(im)
    # Blender (x, y) -> glTF z = -y -> row = (maxZ - z) * sz = (maxZ + y) * sz
    to = lambda p: ((p[0] - minX) * sx, (maxZ + p[1]) * sz)
    for poly in polys:
        if len(poly) >= 3:
            d.polygon([to(p) for p in poly], fill=255)
    for (x, y, r) in circles:
        cx, cy = to((x, y))
        d.ellipse((cx - r * sx, cy - r * sz, cx + r * sx, cy + r * sz), fill=255)
    return np.array(im) > 127


def _seg_polys(a, b, w):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / L * w / 2, dx / L * w / 2
    return [(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)]


def _offset_line(line, d):
    out = []
    n = len(line)
    for i in range(n):
        a = line[max(0, i - 1)]; b = line[min(n - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]; L = math.hypot(tx, ty) or 1.0
        out.append((line[i][0] + ty / L * d, line[i][1] - tx / L * d))
    return out


def bake(cj, bounds, n=N, contact_polys=(), wakes=(), extra_land=(), extra_circles=(), buoys=True):
    from scipy import ndimage
    minX, minZ, maxX, maxZ = bounds
    px = (maxX - minX) / n
    coast = [tuple(p) for p in cj['coast']]
    bw = [tuple(p) for p in cj['bw_line']]
    bw_poly = _offset_line(bw, cj['bw_width'] / 2) + _offset_line(bw, -cj['bw_width'] / 2)[::-1]
    land_polys = [coast, bw_poly] + [[tuple(p) for p in s['poly']] for s in cj.get('skerries', [])] + list(extra_land)
    if cj.get('mainland'):
        land_polys.append([tuple(p) for p in cj['mainland']['poly']])
    circles = [tuple(c) for c in cj['shoals']['rocks']] + [(bw[-1][0], bw[-1][1], 4.4)] + list(extra_circles)
    struct_polys = [bw_poly]
    for s in cj['struct']:
        if s['kind'] in ('pier', 'finger', 'thead'):
            struct_polys.append(_seg_polys(s['a'], s['b'], s['width']))
            if s.get('material') == 'stone':
                land_polys.append(_seg_polys(s['a'], s['b'], s['width']))
    land = _raster(land_polys, circles, bounds, n)
    xs, zs = _grid(bounds, n)
    X, Z = np.meshgrid(xs, zs)
    Yb = -Z
    d_out = ndimage.distance_transform_edt(~land) * px
    d_in = ndimage.distance_transform_edt(land) * px
    sd = np.where(land, -d_in, d_out)
    # structures: pier decks, piles (implicit in decks), quay walls (= coast within 1 px of a quay line), buoys
    qmask = _raster([_seg_polys(a, b, 1.2) for q in cj['quays'] for a, b in zip(q['line'], q['line'][1:])], [], bounds, n)
    buoys = [(m['buoy'][0], m['buoy'][1], 0.35) for m in cj['moorings']] if buoys else []
    st = _raster(struct_polys, buoys, bounds, n) | qmask
    ds = ndimage.distance_transform_edt(~st) * px
    # bathymetry (stylised): shelving coast, a dredged bay, shallow coves, a shoal reef just outside the mouth
    depth = 1.2 + 38.0 * (1.0 - np.exp(-np.maximum(sd, 0) / 55.0))
    bay = _raster([[tuple(p) for p in cj['bay']]], [], bounds, n)
    bay = ndimage.gaussian_filter(bay.astype(np.float32), 18.0 / px)
    depth = depth * (1 - bay) + np.minimum(depth, 3.0 + 7.5 * (1 - np.exp(-np.maximum(sd, 0) / 14.0))) * bay
    reef = _raster([[tuple(p) for p in cj['shoals']['poly']]], [], bounds, n)
    dr = ndimage.distance_transform_edt(~reef) * px
    depth = np.minimum(depth, 0.8 + dr * 0.22)
    rng = np.random.default_rng(3)
    lf = ndimage.gaussian_filter(rng.standard_normal((n // 8, n // 8)).astype(np.float32), 3.0)
    lf = np.kron(lf / (np.abs(lf).max() + 1e-6), np.ones((8, 8), np.float32))
    depth = np.clip(depth * (1.0 + 0.12 * lf), 0.3, 60)
    depth[land] = 0.0
    out = dict(sd=sd.astype(np.float32), depth=depth.astype(np.float32), ds=ds.astype(np.float32))
    if contact_polys or wakes:
        con = _raster(list(contact_polys), [], bounds, n)
        out['dh'] = (ndimage.distance_transform_edt(~con) * px).astype(np.float32)
        G = np.zeros((n, n), np.float32)
        for (a, b, w0, w1, k) in wakes:
            a = np.array(a, np.float32); b = np.array(b, np.float32); ab = b - a
            if float(ab @ ab) < 1e-4:
                continue
            t = np.clip(((X - a[0]) * ab[0] + (Yb - a[1]) * ab[1]) / float(ab @ ab), 0, 1)
            dd = np.hypot(X - (a[0] + t * ab[0]), Yb - (a[1] + t * ab[1]))
            w = w0 + (w1 - w0) * t
            G = np.maximum(G, k * np.exp(-(dd / w) ** 2) * (1 - t) ** 1.3)
        out['wake'] = G
    return out


def write_png(arr, path):
    from PIL import Image
    img = np.zeros(arr['sd'].shape + (4,), np.uint8)
    img[..., 0] = np.clip((0.5 + arr['sd'] / 128.0) * 255 + 0.5, 0, 255).astype(np.uint8)
    img[..., 1] = np.clip(arr['depth'] / 40.0 * 255 + 0.5, 0, 255).astype(np.uint8)
    img[..., 2] = np.clip(arr['ds'] / 16.0 * 255 + 0.5, 0, 255).astype(np.uint8)
    img[..., 3] = 255
    Image.fromarray(img, 'RGBA').save(path, optimize=True)


if __name__ == '__main__':
    cj = json.load(open(os.path.join(ROOT, 'outputs/harbour/island/compose.json')))
    bounds = cj['sea_bounds']                 # == layout.sea.bounds (compose.py writes both)
    # layout bounds are glTF [minX, minZ, maxX, maxZ]
    arr = bake(cj, bounds)
    out = os.path.join(ROOT, 'public/harbour/sea-sdf.png')
    write_png(arr, out)
    print('sea-sdf ->', out, os.path.getsize(out) // 1024, 'KB', 'land frac', float((arr['sd'] < 0).mean()))
