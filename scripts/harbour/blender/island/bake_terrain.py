#!/usr/bin/env python3
"""Deterministic island terrain data-map baker for PharosVille (hb_terrain).

Runnable standalone via Python 3 (numpy + scipy + PIL) or inside Blender
(adding 16-ray BVHTree bare-terrain hemisphere AO from the live scene or island.glb):

    python3 scripts/harbour/blender/island/bake_terrain.py
    blender -b --factory-startup -P scripts/harbour/blender/island/bake_terrain.py -- --glb public/harbour/island.glb

Outputs (covering layout.json bounds [minX, minZ, maxX, maxZ] in glTF Y-up metres):
  assets/harbour/terrain-splat.png -> public/harbour/terrain-splat.webp  (1024x1024 RGBA8, lossless -exact)
    R: Path, verge & worked-earth wear (roads, lanes, quay back-edges, yards, terraces, vineyard; 64 steps)
    G: Canopy humus & pine-needle duff (trees + maquis clusters, 4 m noise feathered; 64 steps)
    B: High-res contact AO & grounding skirt (full 8-bit, 255 = unoccluded; * BVHTree bare AO in Blender)
    A: Karst limestone outcrop & aridity mask (outcrops, headland, cliff rim, slope, strata fBM; 64 steps)
  assets/harbour/terrain-topo.png  -> public/harbour/terrain-topo.webp   (512x512 RGBA8, lossless -exact)
    RG: Analytic bare-terrain smooth normal (nx, nz) in glTF Y-up space (+/-0.75 m central diff, 0.5 + 0.5*n)
    B:  Multi-scale bare-terrain curvature / Laplacian (3 m + 9 m blend, >0.5 convex ridge, <0.5 hollow)
    A:  Exact coast distance clamp(dcoast / 24.0, 0, 1) (0 at shoreline/water, 1 inland >= 24 m)

UV convention (matches Three.js default flipY=true with uTerrainBounds = (minX, maxZ, 1/sizeX, 1/sizeZ)):
  PNG top row (row 0)    = z = minZ (North, Blender y = -minZ)  -> WebGL v = 1
  PNG bottom row (H - 1) = z = maxZ (South, Blender y = -maxZ)  -> WebGL v = 0
  PNG left col (col 0)   = x = minX (West,  Blender x = minX)   -> WebGL u = 0
  GLSL: uv = vec2((W.x - uTerrainBounds.x) * uTerrainBounds.z, (uTerrainBounds.y - W.z) * uTerrainBounds.w)
"""
import json
import math
import os
import random
import site
import struct
import subprocess
import sys
import time

sys.dont_write_bytecode = True
for _sp in (site.getusersitepackages(), '/home/ahirice/.local/lib/python3.14/site-packages'):
    if _sp and os.path.isdir(_sp) and _sp not in sys.path:
        sys.path.append(_sp)

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import geom
import terrain

SPLAT_N = 1024
TOPO_N = 512

# Shared dressing constants mirrored from hb_dress.py / hb_land.py (read-only contract).
APRON = {'grand': 9.0, 'long': 12.0, 'tron': 11.0, 'westq': 6.0, 'battery': 8.0, 'wharf': 9.5}
ROAD_WEST_UV = [
    (-131.0, -178.0), (-140.0, -152.0), (-160.0, -146.0), (-186.0, -132.0), (-200.0, -110.0),
    (-206.0, -80.0), (-196.0, -50.0), (-176.0, -20.0), (-152.0, 4.0), (-134.0, 22.0), (-118.0, 22.0),
]
ROAD_SOUTH_UV = [
    (200.0, -196.0), (176.0, -214.0), (130.0, -230.0), (80.0, -238.0), (20.0, -240.0), (-40.0, -236.0),
    (-100.0, -232.0), (-150.0, -222.0), (-196.0, -206.0), (-222.0, -186.0), (-216.0, -160.0), (-190.0, -146.0),
]
ROAD_EAST_UV = [(176.0, -150.0), (196.0, -172.0), (200.0, -196.0), (214.0, -180.0), (232.0, -170.0)]
ROAD_SHRINE_UV = [(-176.8, -21.0), (-170.0, -24.6), (-162.6, -25.6), (-155.0, -24.2)]
FOOTPATHS_UV = [
    [(96.0, 128.0), (108.0, 140.0), (130.0, 146.0)],
    [(-206.0, -80.0), (-218.0, -110.0), (-226.0, -150.0), (-224.0, -162.0)],
    [(-196.0, -50.0), (-214.0, -54.0), (-226.0, -58.0)],
]
OUTCROPS_UV = list(terrain.OUTCROPS_UV)
COPSES_UV = [
    ((-150.0, -40.0), 10.0, 14), ((-180.0, 20.0), 12.0, 16), ((-250.0, -190.0), 12.0, 14),
    ((-90.0, -250.0), 9.0, 8), ((100.0, -250.0), 9.0, 8), ((226.0, -52.0), 9.0, 14),
    ((214.0, 22.0), 10.0, 12), ((-60.0, 120.0), 7.0, 5), ((-150.0, 60.0), 9.0, 7),
    ((150.0, -210.0), 8.0, 8),
]
CREST_GAPS = ((82.0, 100.0), (106.0, 112.0))

# Static cove & Wreck Cove definitions from compose.py (used when compose.json is absent).
_COVES_SPEC = [
    ('pier-polygon', (-266.0, -206.0), (-0.72, -0.69), 26.0, 30.0),
    ('pier-arbitrum', (-160.0, -270.0), (-0.14, -1.0), 28.0, 32.0),
    ('pier-base', (-52.0, -290.0), (0.0, -1.0), 31.0, 32.0),
    ('pier-solana', (64.0, -290.0), (0.04, -1.0), 37.0, 32.0),
    ('pier-bsc', (172.0, -270.0), (0.1, -1.0), 37.5, 36.0),
    ('pier-hyperliquid-l1', (252.0, -192.0), (0.74, -0.67), 18.0, 24.0),
]
_COVE_BEACH = {
    'pier-polygon': 'we', 'pier-arbitrum': 'we', 'pier-base': 'we',
    'pier-hyperliquid-l1': 'we', 'pier-bsc': 'w', 'pier-solana': '',
}
_COVE_BOATHOUSE = {
    'pier-polygon': 'e', 'pier-arbitrum': 'w', 'pier-base': 'we',
    'pier-hyperliquid-l1': 'w', 'pier-bsc': 'w', 'pier-solana': '',
}
_WRECK_STRAND_UV = [
    (-262.0, -22.0), (-254.0, -40.0), (-252.0, -60.0), (-257.0, -80.0),
    (-268.0, -99.0), (-284.0, -116.0), (-303.0, -130.0), (-322.0, -140.0),
]


def _sstep_np(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _hash_np(ix, iy, s=0):
    h = (ix.astype(np.uint64) * np.uint64(374761393)
         + iy.astype(np.uint64) * np.uint64(668265263)
         + np.uint64(s) * np.uint64(2147483647)) & np.uint64(0xffffffff)
    h = ((h ^ (h >> np.uint64(13))) * np.uint64(1274126177)) & np.uint64(0xffffffff)
    return ((h ^ (h >> np.uint64(16))).astype(np.float64)) / 4294967295.0


def _vnoise_np(x, y, f, s=0):
    xf = x * f
    yf = y * f
    ix = np.floor(xf).astype(np.int64)
    iy = np.floor(yf).astype(np.int64)
    fx = xf - ix
    fy = yf - iy
    ux = fx * fx * (3.0 - 2.0 * fx)
    uy = fy * fy * (3.0 - 2.0 * fy)
    a = _hash_np(ix, iy, s)
    b = _hash_np(ix + 1, iy, s)
    c = _hash_np(ix, iy + 1, s)
    d = _hash_np(ix + 1, iy + 1, s)
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy


def _fbm_np(x, y, f, octaves=3, s=0):
    t = np.zeros_like(x, dtype=np.float64)
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        t += amp * _vnoise_np(x, y, f * (2 ** o), s + o)
        norm += amp
        amp *= 0.5
    return t / norm


def _ridge_noise_np(x, y, f, octaves=3, s=0):
    t = np.zeros_like(x, dtype=np.float64)
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        v = 1.0 - np.abs(2.0 * _vnoise_np(x, y, f * (2 ** o), s + o) - 1.0)
        t += amp * (v * v)
        norm += amp
        amp *= 0.5
    return t / norm


def _strata_quantize_np(h, step, riser=0.25):
    k = h / step
    fk = k - np.floor(k)
    return (np.floor(k) + _sstep_np(1.0 - riser, 1.0, fk)) * step


def _gauss_np(u, v, cu, cv, su, sv, ang=0.0):
    c, s = math.cos(ang), math.sin(ang)
    du, dv = u - cu, v - cv
    a = (du * c + dv * s) / su
    b = (-du * s + dv * c) / sv
    return np.exp(-(a * a + b * b))


def _quantize_step(arr, step, snap_top=True):
    """Bit-aligned quantization onto exact multiples of `step` (preserving exact 0 and 128).

    Bit-aligned steps keep VP8L spatial-predictor residuals sparse (0 or ±step), cutting lossless WebP
    size significantly compared to irrational 255/63 spacing while hardware linear filtering reconstructs
    smooth sub-step gradients on the GPU.
    """
    x = np.clip(arr, 0.0, 1.0)
    q = np.rint((x * 255.0) / step) * step
    if snap_top:
        q = np.where(x >= 0.992, 255.0, q)
    return np.clip(q, 0, 255).astype(np.uint8)


def _grid(bounds_xz, n):
    """Return 2D (X_B, Y_B) Blender-space coordinates for an NxN north-up PNG grid.

    Row 0 = glTF minZ (North, Blender y = -minZ); row N-1 = glTF maxZ (South, Blender y = -maxZ).
    Column 0 = glTF minX (West); column N-1 = glTF maxX (East).
    """
    min_x, min_z, max_x, max_z = bounds_xz
    xs = min_x + (np.arange(n, dtype=np.float64) + 0.5) * (max_x - min_x) / n
    zs = min_z + (np.arange(n, dtype=np.float64) + 0.5) * (max_z - min_z) / n
    x_b, z_w = np.meshgrid(xs, zs)
    y_b = -z_w
    return x_b, y_b


def _to_px_fn(bounds_xz, n):
    min_x, min_z, max_x, max_z = bounds_xz
    sx = n / (max_x - min_x)
    sz = n / (max_z - min_z)

    def to_px(p):
        # Blender (x, y) -> glTF z = -y -> row = (z - minZ) * sz = (-y - minZ) * sz
        return ((p[0] - min_x) * sx - 0.5, (-p[1] - min_z) * sz - 0.5)

    return to_px, (max_x - min_x) / n, (max_z - min_z) / n


def _raster_polys(polys, circles, lines, bounds_xz, n):
    """Rasterize Blender-space polygons, circles (x, y, r), and thick polylines (pts, width_m)."""
    to_px, dx, dy = _to_px_fn(bounds_xz, n)
    px_m = 0.5 * (dx + dy)
    im = Image.new('L', (n, n), 0)
    dr = ImageDraw.Draw(im)
    for poly in polys:
        if len(poly) >= 3:
            dr.polygon([to_px(p) for p in poly], fill=255)
    for (x, y, r) in circles:
        cx, cy = to_px((x, y))
        rx = r / dx
        ry = r / dy
        dr.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    for (pts, width_m) in lines:
        if len(pts) < 2:
            continue
        w_px = max(1, int(round(width_m / px_m)))
        px_pts = [to_px(p) for p in pts]
        dr.line(px_pts, fill=255, width=w_px)
        r_px = width_m * 0.5 / px_m
        if r_px >= 0.75:
            for cx, cy in px_pts:
                dr.ellipse((cx - r_px, cy - r_px, cx + r_px, cy + r_px), fill=255)
    return np.array(im) > 127


def _edt_m(mask, bounds_xz):
    min_x, min_z, max_x, max_z = bounds_xz
    n = mask.shape[0]
    sampling = ((max_z - min_z) / n, (max_x - min_x) / n)
    return ndimage.distance_transform_edt(~mask, sampling=sampling)


def _plot_rect(cv, grow=0.0):
    cx, cy = cv['c']
    fx, fy = cv['face']
    tx, ty = -fy, fx
    hw = cv['w'] * 0.5 + grow
    hd = cv['d'] * 0.5 + grow
    return [(cx + tx * a + fx * b, cy + ty * a + fy * b)
            for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]


def _lot_rect(lot, pad_w=0.0, pad_d=0.0):
    cx, cy = lot['c']
    fx, fy = lot['face']
    tx, ty = -fy, fx
    hw = lot['w'] * 0.5 + pad_w
    hd = lot['d'] * 0.5 + pad_d
    return [(cx + tx * a + fx * b, cy + ty * a + fy * b)
            for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]


def _town_pt(ct_uv, th_deg, r):
    a = math.radians(th_deg)
    return terrain.from_uv(ct_uv[0] + math.cos(a) * r, ct_uv[1] + math.sin(a) * r)


def _hull_2d(pts):
    pts_s = sorted(set(pts))
    lo, hi = [], []
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    for q in pts_s:
        while len(lo) > 1 and cr(lo[-2], lo[-1], q) <= 0:
            lo.pop()
        lo.append(q)
    for q in reversed(pts_s):
        while len(hi) > 1 and cr(hi[-2], hi[-1], q) <= 0:
            hi.pop()
        hi.append(q)
    return lo[:-1] + hi[:-1]


def _cj_from_layout(layout):
    """Build a compatible compose-like dict from committed layout.json when compose.json is absent."""
    coast = [(p[0], -p[1]) for p in layout['island']['coast']]
    islets = layout['island'].get('islets', [])
    islet = [(p[0], -p[1]) for p in islets[0]] if islets else []
    ph_pos = layout['pharos']['position']
    ph_half = layout['pharos']['platformSize'] * 0.5

    civic = []
    for cv in layout.get('civic', []):
        h = cv['rotationY']
        fx, fy = math.sin(h), -math.cos(h)
        c = (cv['position'][0], -cv['position'][2])
        w, d = cv['footprint']
        z = cv['position'][1]
        poly = geom.rect(c, (fx, fy), d, w)
        civic.append(dict(id=cv['id'], kind=cv['kind'], c=c, face=(fx, fy), w=w, d=d, z=z, poly=poly))

    # Reconstruct quay polylines from layout pier segments
    quays = []
    for pier in layout.get('piers', []):
        qsegs = [sg for sg in pier.get('segments', []) if sg.get('kind') == 'quay']
        if not qsegs:
            continue
        chains = []
        for sg in qsegs:
            a = (sg['a'][0], -sg['a'][1])
            b = (sg['b'][0], -sg['b'][1])
            if chains and math.hypot(chains[-1][-1][0] - a[0], chains[-1][-1][1] - a[1]) < 4.0:
                chains[-1].append(b)
            else:
                chains.append([a, b])
        for idx, ch in enumerate(chains):
            name = f"{pier['id']}_{idx}"
            if pier['id'] == 'pier-tron':
                name = 'tron'
            elif pier['id'] == 'pier-ethereum' and idx == 0:
                name = 'grand'
            quays.append(dict(kind='quay', name=name, pid=pier['id'], line=ch))

    # Beaches: Wreck Cove + cove beaches (matching compose.py)
    strand_uv = geom.catmull(_WRECK_STRAND_UV, 8, closed=False)
    beaches = [dict(name='wreck', line=[terrain.from_uv(*p) for p in strand_uv], depth=46.0, kind='sand')]
    coves = []
    for pid, c_uv, n_uv, hw, depth in _COVES_SPEC:
        nn = geom.norm(n_uv)
        tt = (-nn[1], nn[0])
        back_uv = geom.add(c_uv, geom.mul(nn, -depth))
        qa_uv = geom.add(back_uv, geom.mul(tt, -(hw - 9.0)))
        qb_uv = geom.add(back_uv, geom.mul(tt, hw - 9.0))
        coves.append(dict(
            pid=pid, c=terrain.from_uv(*c_uv), n=geom.from_uv(*nn), t=geom.from_uv(*tt),
            back=terrain.from_uv(*back_uv), qa=terrain.from_uv(*qa_uv), qb=terrain.from_uv(*qb_uv),
            hw=hw, depth=depth,
        ))
        cb = _COVE_BEACH.get(pid, '')
        if 'w' in cb:
            b0 = geom.add(geom.add(c_uv, geom.mul(tt, -hw - 4.0)), geom.mul(nn, -4.0))
            b1 = geom.add(geom.add(c_uv, geom.mul(tt, -hw + 5.0)), geom.mul(nn, -depth + 4.0))
            beaches.append(dict(name=pid + '-w', line=[terrain.from_uv(*b0), terrain.from_uv(*b1)], depth=14.0, kind='pebble'))
        if 'e' in cb:
            b0 = geom.add(geom.add(c_uv, geom.mul(tt, hw - 5.0)), geom.mul(nn, -depth + 4.0))
            b1 = geom.add(geom.add(c_uv, geom.mul(tt, hw + 4.0)), geom.mul(nn, -4.0))
            beaches.append(dict(name=pid + '-e', line=[terrain.from_uv(*b0), terrain.from_uv(*b1)], depth=14.0, kind='pebble'))

    # Battery flat (same convex hull formula as compose.py:1337-1358)
    civic_by = {c['id']: c for c in civic}
    flats = []
    if 'harbourmaster' in civic_by and 'stormstation' in civic_by:
        hm, ss = civic_by['harbourmaster'], civic_by['stormstation']
        bpts = (
            geom.rect(hm['c'], hm['face'], hm['d'] + 4.0, hm['w'] + 4.0)
            + geom.rect(ss['c'], ss['face'], ss['d'] + 4.0, ss['w'] + 4.0)
            + geom.rect(geom.add(hm['c'], geom.mul(hm['face'], 9.0)), hm['face'], hm['d'], hm['w'])
            + geom.rect(geom.add(hm['c'], (7.0, -7.0)), (math.sqrt(0.5), -math.sqrt(0.5)), 20.0, 18.0)
        )
        bf = [(round(q[0], 2), round(q[1], 2)) for q in _hull_2d([tuple(q) for q in bpts])]
        bc = (sum(q[0] for q in bf) / len(bf), sum(q[1] for q in bf) / len(bf))
        edges = []
        for i in range(len(bf)):
            a, b = bf[i], bf[(i + 1) % len(bf)]
            t = geom.norm(geom.sub(b, a))
            n = (t[1], -t[0])
            if geom.dot(n, geom.sub(bc, a)) > 0:
                n = (-n[0], -n[1])
            if n[1] > 0.6:
                edges.append(i)
        flats.append(dict(
            poly=bf, z=terrain.Z_SHORE, blend=2.5,
            terrace=dict(edges=edges, courses=[(3.4, 5.55), (6.8, 11.1)], slope=1.0),
        ))

    landmarks = {}
    for lm in layout.get('landmarks', []):
        key = lm['id'].replace('-', '_')
        h = lm['headingRad']
        landmarks[key] = dict(
            p=(lm['position'][0], -lm['position'][2]), z=lm['position'][1],
            fp=lm['footprint'], face=(math.sin(h), -math.cos(h)),
        )

    # Reconstruct town/hamlet/farm lots deterministically (mirrors compose.py:1622-1748)
    lots = _synthesize_lots(civic, landmarks, coves)

    bw = layout.get('wind', {}).get('bowHeadingRad', 0.0)
    return dict(
        coast=coast, quays=quays, beaches=beaches, coves=coves,
        civic=civic, flats=flats, lots=lots, landmarks=landmarks,
        pharos=dict(p=(ph_pos[0], -ph_pos[2]), z=ph_pos[1], half=ph_half, islet=islet),
        town=dict(ct=terrain.from_uv(*terrain.CT), ct_uv=list(terrain.CT),
                  r_quay=terrain.R_QUAY, rings=list(terrain.RINGS), th=list(terrain.TOWN_TH)),
        wind_bow=(math.sin(bw), -math.cos(bw)),
    )


def _sat_overlap(a, b):
    for poly in (a, b):
        for i in range(len(poly)):
            e = geom.sub(poly[(i + 1) % len(poly)], poly[i])
            ax = (-e[1], e[0])
            pa = [geom.dot(q, ax) for q in a]
            pb = [geom.dot(q, ax) for q in b]
            if max(pa) < min(pb) or max(pb) < min(pa):
                return False
    return True


def _synthesize_lots(civic, landmarks, coves):
    plot_keep = [geom.rect(cv['c'], cv['face'], cv['d'] + 7.0, cv['w'] + 7.0) for cv in civic]
    res = [(landmarks[k]['p'], landmarks[k]['fp'] * 0.5 + 2.5)
           for k in ('warehouse', 'storm_mast') if k in landmarks]
    lots = []
    stair_th = [(124.0, 1), (68.0, 1), (148.0, 2), (102.0, 2), (52.0, 2), (112.0, 3), (66.0, 3)]
    squares = [(90.0, 0, 50.0), (118.0, 2, 24.0), (58.0, 2, 22.0)]
    trng = random.Random(42)

    def vagen(th_deg, r):
        a = math.radians(th_deg)
        return (terrain.CT[0] + math.cos(a) * r, terrain.CT[1] + math.sin(a) * r)

    def free_lot(p, w):
        if any(geom.length(geom.sub(p, q)) < r + w * 0.5 for q, r in res):
            return False
        return all(geom.length(geom.sub(p, l['c'])) > (w + l['w']) * 0.46 for l in lots[-40:])

    def add_lot(c, w, d, z, face, style):
        if any(_sat_overlap(geom.rect(c, face, d, w), q) for q in plot_keep):
            return
        lots.append(dict(c=c, w=w - 0.12, d=d, z=z or terrain.Z_SHORE, face=face, style=style))

    def ring_row(band, rc, depth, style, block=(3, 6), alley=(2.0, 3.6), p_gap=0.22,
                 gap=(6.0, 12.0), w_rng=(6.8, 9.4), jit_r=1.2, jit_rot=4.0, cluster_rot=7.0, shop=False):
        th0, th1 = terrain.TOWN_TH[band]
        z = terrain.RINGS[band][2]
        s = th0
        while s > th1:
            n = trng.randint(*block)
            twist = trng.uniform(-cluster_rot, cluster_rot)
            rr = rc + trng.uniform(-jit_r, jit_r)
            for _ in range(n):
                w = trng.uniform(*w_rng)
                dth = math.degrees(w / rr)
                if s - dth < th1:
                    break
                th = s - dth * 0.5
                blocked = (any(abs(th - st) < math.degrees(5.5 / rr) for st, b in stair_th if b == band)
                           or any(abs(th - sq) < math.degrees(wq * 0.5 / rr) for sq, b, wq in squares if b == band))
                if not blocked:
                    p_uv = vagen(th, rr + trng.uniform(-0.4, 0.4))
                    fdir = geom.rot(geom.norm(geom.sub(terrain.CT, p_uv)), math.radians(twist + trng.uniform(-jit_rot, jit_rot)))
                    p = terrain.from_uv(*p_uv)
                    if free_lot(p, w):
                        add_lot(p, w, depth * trng.uniform(0.9, 1.08), z, geom.norm(geom.from_uv(*fdir)), style)
                        if shop:
                            trng.random()
                s -= dth + trng.uniform(0.0, 0.15)
            s -= math.degrees(trng.uniform(*gap) / rr) if trng.random() < p_gap else math.degrees(trng.uniform(*alley) / rr)

    rq = terrain.R_QUAY
    ring_row(0, rq + 13.0, 9.6, 'terrace', p_gap=0.12, gap=(5.0, 9.0), shop=True)
    ring_row(1, rq + 28.0, 9.0, 'terrace', p_gap=0.3, gap=(8.0, 14.0))
    ring_row(2, rq + 44.0, 8.8, 'terrace', p_gap=0.4, gap=(9.0, 16.0))
    ring_row(3, rq + 60.0, 8.4, 'cottage', block=(1, 3), alley=(5.0, 9.0), p_gap=0.5, gap=(10.0, 18.0), w_rng=(7.0, 9.0), jit_r=2.0)

    for (p_uv, f_uv) in [((172.0, -40.0), (-0.86, -0.5)), ((184.0, -52.0), (-0.92, -0.38)),
                         ((190.0, -126.0), (-0.95, 0.1)), ((186.0, -146.0), (-0.9, 0.35))]:
        p_uv = geom.add(p_uv, geom.mul(geom.norm(f_uv), -9.0))
        add_lot(terrain.from_uv(*p_uv), 9.5, 15.0, terrain.Z_SHORE, geom.norm(geom.from_uv(*f_uv)), 'warehouse')
    for k, (p_uv, f_uv) in enumerate((((26.0, 52.0), (-0.9, -0.35)), ((22.0, 64.0), (-0.92, -0.3)),
                                      ((18.0, 76.0), (-0.95, -0.25)), ((34.0, 74.0), (-0.6, -0.8)),
                                      ((40.0, 86.0), (-0.5, -0.86)))):
        add_lot(terrain.from_uv(*p_uv), trng.uniform(7.0, 8.6), 9.0, terrain.Z_SHORE if k < 3 else 8.0,
                geom.norm(geom.from_uv(*f_uv)), 'terrace')
    for cv in coves:
        pid, hw = cv['pid'], cv['hw']
        t_, nn = cv['t'], cv['n']
        back = cv['back']
        xs = [-hw + 7.0, hw - 7.0] if hw < 30 else [-hw + 7.0, -hw + 15.0, hw - 15.0, hw - 7.0]
        bh = _COVE_BOATHOUSE.get(pid, '')
        for x in xs:
            if bh and any(abs(x - sg * (hw - 15.0)) < 0.1 or (hw < 30 and abs(x - sg * (hw - 7.0)) < 0.1)
                          for sg in [(-1 if sd == 'w' else 1) for sd in bh]):
                continue
            p = geom.add(geom.add(back, geom.mul(t_, x)), geom.mul(nn, -(12.0 + trng.uniform(-1.0, 1.0))))
            add_lot(p, trng.uniform(6.4, 8.0), 8.0, terrain.Z_SHORE, geom.norm(nn), 'hamlet')
        for sd in bh:
            sg = -1 if sd == 'w' else 1
            x = sg * min(hw - 14.0, hw * 0.55)
            p = geom.add(geom.add(back, geom.mul(t_, x)), geom.mul(nn, -6.2))
            add_lot(p, 6.6, 9.6, terrain.Z_SHORE, geom.norm(geom.rot(nn, sg * 0.08)), 'boathouse')
        side = 1 if trng.random() < 0.5 else -1
        p = geom.add(geom.add(back, geom.mul(t_, side * (hw + 6.0))), geom.mul(nn, 2.0))
        add_lot(p, 7.0, 9.5, terrain.Z_SHORE, geom.norm(geom.rot(nn, -side * 0.5)), 'loft')
        for k in range(2):
            p = geom.add(geom.add(back, geom.mul(t_, trng.uniform(-hw * 0.7, hw * 0.7))), geom.mul(nn, -(26.0 + k * 11.0)))
            add_lot(p, trng.uniform(7.0, 8.4), 7.4, terrain.Z_SHORE, geom.norm(geom.rot(nn, trng.uniform(-0.3, 0.3))), 'cottage')
    for (p_uv, a) in [((-206.0, -122.0), 0.25), ((-178.0, -194.0), -0.2), ((196.0, -190.0), 0.15)]:
        f = geom.rot((0.0, -1.0), a)
        add_lot(terrain.from_uv(*p_uv), 10.0, 7.2, terrain.Z_SHORE, geom.norm(geom.from_uv(*f)), 'farmhouse')
        q = geom.add(p_uv, geom.rot((15.0, 7.0), a))
        add_lot(terrain.from_uv(*q), 14.0, 9.0, terrain.Z_SHORE, geom.norm(geom.from_uv(*geom.rot(f, 1.57))), 'barn')
    return lots


def _init_terrain(cj):
    coast = [tuple(p) for p in cj['coast']]
    ql = {q['name']: [tuple(p) for p in q['line']] for q in cj.get('quays', [])}
    terrain.init(coast, ql, cj.get('beaches', []))
    terrain.set_flats(cj.get('flats', []))
    terrain.set_pads([dict(c=cv['c'], face=cv['face'], w=cv['w'], d=cv['d'], z=cv['z'], blend=2.5)
                      for cv in cj.get('civic', [])])
    return coast, ql


def _seg_dist_grid(px, py, pts):
    """Vectorized minimum distance from 2D arrays (px, py) to an open polyline pts."""
    best = np.full_like(px, 1e9, dtype=np.float64)
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        abx, aby = bx - ax, by - ay
        denom = abx * abx + aby * aby + 1e-9
        t = np.clip(((px - ax) * abx + (py - ay) * aby) / denom, 0.0, 1.0)
        d = np.hypot(px - (ax + abx * t), py - (ay + aby * t))
        np.minimum(best, d, out=best)
    return best


def _eval_height_grid(x_b, y_b, land_mask, cj):
    """Exact vectorized evaluation of terrain.height(x, y) over (x_b, y_b), plus Pharos islet cap."""
    h = np.full(x_b.shape, terrain.Z_SHORE - 1.4, dtype=np.float64)
    idx = np.nonzero(land_mask)
    if len(idx[0]) == 0:
        return h

    x = x_b[idx]
    y = y_b[idx]

    # Bilinear terrain.dcoast(x, y) from terrain._grid
    x0, y1, nx, ny, dgrid = terrain._grid
    fx = (x - x0) / terrain._S
    fy = (y1 - y) / terrain._S
    ji = np.floor(fx).astype(np.int64)
    ii = np.floor(fy).astype(np.int64)
    ok = (ii >= 0) & (ii < ny - 1) & (ji >= 0) & (ji < nx - 1)
    dc = np.zeros_like(x)
    if np.any(ok):
        i0, j0 = ii[ok], ji[ok]
        tx = fx[ok] - j0
        ty = fy[ok] - i0
        dc[ok] = (dgrid[i0, j0] * (1 - tx) * (1 - ty)
                  + dgrid[i0, j0 + 1] * tx * (1 - ty)
                  + dgrid[i0 + 1, j0] * (1 - tx) * ty
                  + dgrid[i0 + 1, j0 + 1] * tx * ty)

    u = (x + y) / terrain.SQ2
    v = (y - x) / terrain.SQ2 - terrain.VOFF

    # _pharos_keep_mask(u, v)
    pk = np.ones_like(u)
    for (cu, cv, r0, r1) in terrain._PHAROS_KEEP:
        dpk = np.hypot(u - cu, v - cv)
        pk = np.minimum(pk, _sstep_np(r0, r1, dpk))

    # natural(u, v) — exact Phase 3 mirror
    hv = terrain.Z_SHORE - 0.4 + 7.5 * (1.0 - np.exp(-dc / 34.0))
    du = u - terrain.CT[0]
    dv = v - terrain.CT[1]
    r = np.hypot(du, dv)
    th = np.degrees(np.arctan2(dv, du))
    th_w = np.where(th < -90.0, th + 360.0, th)

    def ang_in(th0, th1, soft=6.0):
        return _sstep_np(th1 - soft, th1, th_w) * (1.0 - _sstep_np(th0, th0 + soft, th_w))

    bowl = ang_in(186.0, -4.0, 20.0) * (1.0 - _sstep_np(128.0, 150.0, r))
    hb = terrain.Z_SHORE + (r - terrain.R_QUAY) * 0.33 + 3.0 * _sstep_np(115.0, 132.0, r)
    hv = np.where((bowl > 0) & (r > terrain.R_QUAY), hv * (1.0 - bowl) + np.maximum(hv, hb) * bowl, hv)

    hd = np.hypot((u - terrain.HEAD_C[0]) / terrain.HEAD_R[0], (v - terrain.HEAD_C[1]) / terrain.HEAD_R[1])
    hv = np.maximum(hv, terrain.Z_SHORE + terrain.HEAD_H * (1.0 - _sstep_np(0.7, 1.25, hd))
                    + 1.0 * (1.0 - _sstep_np(0.0, 0.7, hd)))

    d_west = _seg_dist_grid(u, v, terrain.WEST_SPINE)
    d_east = _seg_dist_grid(u, v, terrain.EAST_SPINE)
    d_south = _seg_dist_grid(u, v, terrain.SOUTH_RIDGE)
    w_dc = _sstep_np(4.0, 30.0, dc) + pk * (_sstep_np(2.0, 20.0, dc) - _sstep_np(4.0, 30.0, dc)) * _sstep_np(70.0, 20.0, v)
    hv += 11.0 * np.exp(-((d_west / 42.0) ** 2)) * w_dc
    hv += 7.0 * _gauss_np(u, v, terrain.WINDMILL_UV[0], terrain.WINDMILL_UV[1], 26.0, 22.0)
    hv += 3.0 * (_fbm_np(u, v, 0.011, 2, 9) - 0.4) * _sstep_np(10.0, 40.0, dc)

    # Asymmetric East Headland karst cuesta + 3 SW escarpment benches
    asym = np.where(u < 235.0, 30.0, 36.0)
    cuesta_core = np.exp(-((d_east / asym) ** 2)) * _sstep_np(2.0, 20.0, dc)
    rn_e = _ridge_noise_np(u, v, 0.018, 3, 19)
    hv += (12.8 + 2.4 * (rn_e - 0.35)) * cuesta_core
    hv += 5.4 * _gauss_np(u, v, 229.0, -96.0, 23.0, 40.0, -0.15)
    esc_mask = (u > 182.0) & (u < 240.0) & (v > -148.0) & (v < -36.0)
    if np.any(esc_mask):
        w_esc = (
            _sstep_np(186.0, 198.0, u[esc_mask]) * (1.0 - _sstep_np(228.0, 238.0, u[esc_mask]))
            * _sstep_np(-144.0, -130.0, v[esc_mask]) * (1.0 - _sstep_np(-52.0, -38.0, v[esc_mask]))
            * _sstep_np(12.0, 24.0, dc[esc_mask])
        )
        hq_e = _strata_quantize_np(hv[esc_mask], 4.4, 0.28)
        hv[esc_mask] = hv[esc_mask] + (hq_e - hv[esc_mask]) * (0.62 * w_esc)

    # South ridge + facets + karst ridge modulation
    hv += 5.5 * np.exp(-((d_south / 26.0) ** 2)) * (0.75 + 0.5 * _fbm_np(u, v, 0.014, 2, 7))
    calm = 1.0 - 0.75 * (1.0 - _sstep_np(0.75, 1.2, hd))
    hv += (_fbm_np(u, v, 0.02, 3, 3) - 0.5) * 3.0 * calm
    kr_sel = (pk > 0.0) & (dc > 4.0) & ((u > 175.0) | (u < -175.0) | (v < -200.0)) & ~((u < -150.0) & (v > -160.0) & (v < -102.0))
    if np.any(kr_sel):
        kr = (_ridge_noise_np(u[kr_sel], v[kr_sel], 0.026, 2, 27) - 0.45) * 1.30 * pk[kr_sel] * _sstep_np(4.0, 18.0, dc[kr_sel])
        hv[kr_sel] += kr

    # coastal_headland_lift(u, v, dc)
    shore_band = 1.0 - _sstep_np(14.0, 32.0, dc)
    lift = np.zeros_like(hv)
    m_e = (u > 225.0) & (u < 285.0) & (v > -178.0) & (v < -84.0)
    if np.any(m_e):
        w_e = _sstep_np(236.0, 248.0, u[m_e]) * (1.0 - _sstep_np(276.0, 286.0, u[m_e])) * _sstep_np(-172.0, -155.0, v[m_e]) * (1.0 - _sstep_np(-112.0, -92.0, v[m_e]))
        n_e = 0.72 + 0.56 * _ridge_noise_np(u[m_e], v[m_e], 0.028, 2, 101)
        lift[m_e] = np.maximum(lift[m_e], (4.8 + 3.2 * n_e) * w_e * (0.45 + 0.55 * shore_band[m_e]))
    m_ne = (u > 178.0) & (u < 224.0) & (v > 64.0) & (v < 102.0)
    if np.any(m_ne):
        w_ne = _sstep_np(186.0, 198.0, u[m_ne]) * (1.0 - _sstep_np(214.0, 224.0, u[m_ne])) * _sstep_np(68.0, 76.0, v[m_ne]) * (1.0 - _sstep_np(92.0, 100.0, v[m_ne]))
        n_ne = 0.7 + 0.5 * _ridge_noise_np(u[m_ne], v[m_ne], 0.032, 2, 103)
        lift[m_ne] = np.maximum(lift[m_ne], (4.2 + 2.6 * n_ne) * w_ne * (0.45 + 0.55 * shore_band[m_ne]))
    m_ph = (u > -158.0) & (u < -44.0) & (v > 96.0) & (v < 122.0) & (pk > 0.0)
    if np.any(m_ph):
        w_ph = _sstep_np(-154.0, -140.0, u[m_ph]) * (1.0 - _sstep_np(-56.0, -44.0, u[m_ph])) * _sstep_np(101.0, 108.0, v[m_ph]) * (1.0 - _sstep_np(115.0, 122.0, v[m_ph]))
        rim_b = 1.0 - _sstep_np(6.0, 15.0, dc[m_ph])
        n_ph = 0.65 + 0.55 * _ridge_noise_np(u[m_ph], v[m_ph], 0.036, 2, 107)
        lift[m_ph] = np.maximum(lift[m_ph], (2.2 + 2.4 * n_ph) * w_ph * pk[m_ph] * rim_b)
    m_wn = (u > -280.0) & (u < -234.0) & (v > -18.0) & (v < 22.0)
    if np.any(m_wn):
        w_wn = _gauss_np(u[m_wn], v[m_wn], -258.0, -2.0, 15.0, 13.0)
        lift[m_wn] = np.maximum(lift[m_wn], np.where(w_wn > 0.01, (4.3 + 1.3 * _ridge_noise_np(u[m_wn], v[m_wn], 0.04, 2, 109)) * w_wn, 0.0))
    m_ws = (u > -350.0) & (u < -304.0) & (v > -178.0) & (v < -134.0)
    if np.any(m_ws):
        w_ws = _gauss_np(u[m_ws], v[m_ws], -330.0, -154.0, 18.0, 15.0)
        lift[m_ws] = np.maximum(lift[m_ws], np.where(w_ws > 0.01, (3.4 + 1.3 * _ridge_noise_np(u[m_ws], v[m_ws], 0.038, 2, 111)) * w_ws, 0.0))
    for (cu, cv), su, sv, amp in terrain.SOUTH_KNUCKLES:
        mk = (v < -145.0) & (np.abs(u - cu) < su * 2.5) & (np.abs(v - cv) < sv * 2.5)
        if np.any(mk):
            wk = _gauss_np(u[mk], v[mk], cu, cv, su, sv)
            n_k = 0.8 + 0.4 * _ridge_noise_np(u[mk], v[mk], 0.035, 2, 113)
            lift[mk] = np.maximum(lift[mk], np.where(wk > 0.01, amp * n_k * wk * (0.45 + 0.55 * shore_band[mk]), 0.0))
    hv += lift

    # Hard sightline & elevation guards
    m_tr = (u > 236.0) & (v > -118.0) & (v < -44.0)
    if np.any(m_tr):
        al = np.maximum(0.0, -63.2 - v[m_tr])
        scap = 3.2 + 0.44 * np.maximum(0.0, al - 10.0)
        w_tr = _sstep_np(236.0, 244.0, u[m_tr]) * _sstep_np(-118.0, -102.0, v[m_tr]) * (1.0 - _sstep_np(-52.0, -44.0, v[m_tr]))
        hv[m_tr] = np.where((w_tr > 0.0) & (hv[m_tr] > scap), hv[m_tr] * (1.0 - w_tr) + scap * w_tr, hv[m_tr])
    m_ec = (u > 165.0) & (hv > 31.5)
    if np.any(m_ec):
        hv[m_ec] = 31.5 + 2.1 * np.tanh((hv[m_ec] - 31.5) / 2.6)
    m_sc = (v < -205.0) & (u > -160.0) & (u < 180.0) & (hv > 15.8)
    if np.any(m_sc):
        hv[m_sc] = 15.8 + 1.7 * np.tanh((hv[m_sc] - 15.8) / 2.2)

    # town_step(u, v)
    ts_z = np.zeros_like(hv)
    ts_w = np.zeros_like(hv)
    matched = np.zeros(hv.shape, dtype=bool)
    for (r0, r1, z_ring), (th0, th1) in zip(terrain.RINGS, terrain.TOWN_TH):
        w_ring = ang_in(th0 + 4.0, th1 - 4.0, 8.0)
        sel = (~matched) & (r >= r0) & (r < r1 + 1.0) & (w_ring > 0.0)
        ts_z[sel] = z_ring
        ts_w[sel] = w_ring[sel]
        matched |= sel
    hv = np.where(matched, hv * (1.0 - ts_w) + ts_z * ts_w, hv)

    # terraces (with exact field/warehouse margin attenuation)
    tw = np.zeros_like(hv)
    for (c, ru, rv, a) in terrain.TERRACES:
        du_t, dv_t = u - c[0], v - c[1]
        ca, sa = math.cos(a), math.sin(a)
        dt = np.hypot((du_t * ca + dv_t * sa) / ru, (-du_t * sa + dv_t * ca) / rv)
        tw = np.maximum(tw, np.where(dt < 1.0, 1.0 - _sstep_np(0.72, 1.0, dt), 0.0))
    tw_pos = np.nonzero(tw > 0.0)[0]
    if len(tw_pos) > 0:
        # Exact scalar _in_field_margin_uv only on pixels near fields or Bonded Warehouse
        for j in tw_pos:
            uj, vj = float(u[j]), float(v[j])
            tw[j] *= terrain._in_field_margin_uv(uj, vj)
        q_t = _strata_quantize_np(hv[tw_pos], terrain.TERRACE_STEP, terrain.TERRACE_RISER)
        hv[tw_pos] = hv[tw_pos] + (q_t - hv[tw_pos]) * tw[tw_pos]

    # contour vineyard
    du_v, dv_v = u - terrain.VINE_UV[0], v - terrain.VINE_UV[1]
    ca_v, sa_v = math.cos(terrain.VINE_ANG), math.sin(terrain.VINE_ANG)
    d_v = np.hypot((du_v * ca_v + dv_v * sa_v) / terrain.VINE_RU, (-du_v * sa_v + dv_v * ca_v) / terrain.VINE_RV)
    vw = np.where(d_v < 1.0, 1.0 - _sstep_np(0.76, 1.0, d_v), 0.0)
    vsel = vw > 0.0
    if np.any(vsel):
        qv = _strata_quantize_np(hv[vsel], terrain.VINE_STEP, terrain.VINE_RISER)
        hv[vsel] = hv[vsel] + (qv - hv[vsel]) * vw[vsel]

    # ancient stepped limestone quarry
    du_q, dv_q = u - terrain.QUARRY_UV[0], v - terrain.QUARRY_UV[1]
    ca_q, sa_q = math.cos(terrain.QUARRY_ANG), math.sin(terrain.QUARRY_ANG)
    d_q = np.hypot((du_q * ca_q + dv_q * sa_q) / terrain.QUARRY_RU, (-du_q * sa_q + dv_q * ca_q) / terrain.QUARRY_RV)
    qw = np.where(d_q < 1.0, 1.0 - _sstep_np(0.68, 1.0, d_q), 0.0)
    qw = np.where(u < 188.0, qw * _sstep_np(184.0, 189.0, u), qw)
    qsel_q = qw > 0.0
    if np.any(qsel_q):
        q_base = np.minimum(hv[qsel_q], 17.6)
        qq = _strata_quantize_np(q_base, terrain.QUARRY_STEP, terrain.QUARRY_RISER)
        hv[qsel_q] = hv[qsel_q] + (qq - hv[qsel_q]) * qw[qsel_q]

    # furrow micro-undulation inside plough/hay fields (small bboxes -> exact scalar)
    for fl in terrain.FIELDS:
        if fl['kind'] not in ('plough', 'hay'):
            continue
        bb = fl['bb']
        fsel = (x >= bb[0]) & (x <= bb[2]) & (y >= bb[1]) & (y <= bb[3])
        for j in np.nonzero(fsel)[0]:
            hv[j] += terrain._furrow_delta(float(x[j]), float(y[j]), float(u[j]), float(v[j]))

    # discs
    for (cx, cy, rd, bd, zd) in terrain._disc_list():
        dd = np.hypot(x - cx, y - cy)
        sel = dd < rd + bd
        if np.any(sel):
            wd = 1.0 - _sstep_np(rd, rd + bd, dd[sel])
            hv[sel] = hv[sel] * (1.0 - wd) + zd * wd

    # quay aprons (matching updated _quay_flat with narrow cove flank aprons)
    best_d = np.full_like(hv, 1e9)
    best_ap = np.zeros_like(hv)
    best_bl = np.full_like(hv, 14.0)
    for name, pts in terrain._quays.items():
        if name in ('long', 'grand', 'tron'):
            ap, bl = 13.0, 14.0
        elif name.endswith(('-w', '-e')):
            ap, bl = 3.5, 6.5
        elif name.startswith('cove'):
            ap, bl = 8.0, 14.0
        else:
            ap, bl = 9.0, 14.0
        dq = _seg_dist_grid(x, y, pts)
        better = dq < best_d
        best_d[better] = dq[better]
        best_ap[better] = ap
        best_bl[better] = bl
    qsel = best_d < best_ap + best_bl
    if np.any(qsel):
        kq = 1.0 - _sstep_np(best_ap[qsel], best_ap[qsel] + best_bl[qsel], best_d[qsel])
        keep_t = matched[qsel] & (ts_w[qsel] > 0.5) & (hv[qsel] > terrain.Z_SHORE + 0.5) & (best_d[qsel] > best_ap[qsel])
        kq = np.where(keep_t, 0.0, kq)
        hv[qsel] = hv[qsel] * (1.0 - kq) + terrain.Z_SHORE * kq
    hv = np.maximum(hv, terrain.Z_SHORE - 1.4)

    # Universal road & footpath bench grading (exact O(1) hash-grid query only on pixels in road cells)
    if terrain._roads:
        cell_keys = terrain._road_grid.keys()
        rmask = np.zeros(hv.shape, dtype=bool)
        for (_rn, _rk, _dn, _zr, _hw, _cm, bb) in terrain._roads:
            rmask |= (u >= bb[0]) & (u <= bb[2]) & (v >= bb[1]) & (v <= bb[3])
        for j in np.nonzero(rmask)[0]:
            rq = terrain.road_query_uv(float(u[j]), float(v[j]))
            if rq is not None:
                dd_r, bz_r, hw_r, cut_r, _kd, rname_r, _tuv, _gr = rq
                inner = hw_r + (0.6 if rname_r == 'pharos' else 0.45)
                outer = hw_r + cut_r + (1.0 if rname_r == 'pharos' else 0.45)
                kr = 1.0 - terrain.sstep(inner, outer, dd_r)
                if kr > 0.0:
                    hv[j] = hv[j] * (1.0 - kr) + bz_r * kr

    # beaches (with exact same_shore + end_w taper)
    best_kb = np.zeros_like(hv)
    is_sand = np.zeros(hv.shape, dtype=bool)
    for line, depth, kind, box, ends in terrain._beaches:
        bsel = (x >= box[0]) & (x <= box[2]) & (y >= box[1]) & (y <= box[3])
        if not np.any(bsel):
            continue
        xb, yb, dcb = x[bsel], y[bsel], dc[bsel]
        dl = _seg_dist_grid(xb, yb, line)
        same_shore = 1.0 - _sstep_np(22.0, 42.0, dl - dcb)
        (t0x, t0y), (t1x, t1y) = ends
        p0 = (xb - line[0][0]) * t0x + (yb - line[0][1]) * t0y
        p1 = (xb - line[-1][0]) * t1x + (yb - line[-1][1]) * t1y
        end_w = 1.0 - _sstep_np(2.0, 12.0, np.maximum(0.0, np.maximum(p0, p1)))
        kb = (1.0 - _sstep_np(depth * 0.85, depth + 14.0, dcb)) * (1.0 - _sstep_np(depth + 6.0, depth + 26.0, dl)) * end_w * same_shore
        kb = np.where(dl > depth + 30.0, 0.0, kb)
        bt = kb > best_kb[bsel]
        sub_idx = np.nonzero(bsel)[0][bt]
        best_kb[sub_idx] = kb[bt]
        is_sand[sub_idx] = (kind == 'sand')
    bs_any = best_kb > 0.0
    if np.any(bs_any):
        slope_b = np.where(is_sand[bs_any], 0.072, 0.11)
        hv[bs_any] = hv[bs_any] * (1.0 - best_kb[bs_any]) + np.minimum(hv[bs_any], 0.22 + dc[bs_any] * slope_b) * best_kb[bs_any]
        dune = bs_any & is_sand & (dc > 36.0)
        if np.any(dune):
            hv[dune] += best_kb[dune] * _sstep_np(36.0, 44.0, dc[dune]) * (
                0.8 + 4.2 * np.maximum(0.0, _fbm_np(x[dune], y[dune], 0.055, 2, 21) - 0.25))

    # gentle goat pasture smoothing (union of 3 small ellipses -> call _pasture_smooth ONCE per pixel)
    pmask_p = np.zeros(hv.shape, dtype=bool)
    for (c_p, ru_p, rv_p, _a_p) in terrain._PASTURE_GENTLE:
        rad_p = ru_p + rv_p + 12.0
        pmask_p |= (np.abs(u - c_p[0]) <= rad_p) & (np.abs(v - c_p[1]) <= rad_p)
    for j in np.nonzero(pmask_p)[0]:
        hv[j] = terrain._pasture_smooth(float(x[j]), float(y[j]), float(u[j]), float(v[j]), float(hv[j]), float(dc[j]), float(best_kb[j]))

    # flats & pads (small bboxes -> exact scalar calls only on affected pixels)
    for (poly, zf, bf, bb, te) in terrain._flats:
        fsel = (x >= bb[0]) & (x <= bb[2]) & (y >= bb[1]) & (y <= bb[3])
        if np.any(fsel):
            f_idx = np.nonzero(fsel)[0]
            for j in f_idx:
                fl = terrain._flat_at(float(x[j]), float(y[j]))
                if fl is not None and fl[3] is not None:
                    hv[j] = min(hv[j], fl[0] + 0.08 + terrain.terrace_cap(fl[3], fl[1]))
                elif fl is not None:
                    kf = 1.0 - terrain.sstep(0.0, fl[2], fl[1])
                    hv[j] = hv[j] * (1.0 - kf) + fl[0] * kf

    if terrain._pads:
        for (cx, cy, fx_p, fy_p, hw, hd_p, zp, bp, bb) in terrain._pads:
            psel = (x >= bb[0] - 4.0) & (x <= bb[2] + 4.0) & (y >= bb[1] - 4.0) & (y <= bb[3] + 4.0)
            if not np.any(psel):
                continue
            dx_p = x[psel] - cx
            dy_p = y[psel] - cy
            ly = dx_p * fx_p + dy_p * fy_p
            lx = dx_p * (-fy_p) + dy_p * fx_p
            ox = np.maximum(np.abs(lx) - hw, 0.0)
            oy = np.maximum(np.abs(ly) - hd_p, 0.0)
            dp = np.hypot(ox, oy)
            in_p = dp <= 4.0
            if np.any(in_p):
                p_idx = np.nonzero(psel)[0][in_p]
                kp = 1.0 - _sstep_np(0.0, bp, dp[in_p])
                hv[p_idx] = hv[p_idx] * (1.0 - kp) + zp * kp

    h[idx] = hv

    # Pharos islet height cap (from hb_land.py)
    ph = cj.get('pharos')
    if ph and ph.get('islet'):
        isl = [tuple(p) for p in ph['islet']]
        pz = ph.get('z', 6.0)
        xs_i = [p[0] for p in isl]
        ys_i = [p[1] for p in isl]
        bb_i = (x_b >= min(xs_i) - 4.0) & (x_b <= max(xs_i) + 4.0) & (y_b >= min(ys_i) - 4.0) & (y_b <= max(ys_i) + 4.0)
        if np.any(bb_i):
            ix_i, iy_i = np.nonzero(bb_i)
            xi, yi = x_b[ix_i, iy_i], y_b[ix_i, iy_i]
            de = _seg_dist_grid(xi, yi, isl + [isl[0]])
            rim = 3.1 + 1.5 * _fbm_np(xi, yi, 0.045, 2, 71)
            ih = np.minimum(pz - 1.0, rim + 1.2 * _sstep_np(0.0, 9.0, de) + 0.5 * (_fbm_np(xi, yi, 0.12, 2, 72) - 0.5))
            in_isl = np.array([geom.pip(float(a), float(b), isl) for a, b in zip(xi, yi)])
            h[ix_i[in_isl], iy_i[in_isl]] = ih[in_isl]

    return h


def _verify_vectorized_height(x_b, y_b, h_vec, land_mask):
    """Sanity-check vectorized height against scalar terrain.height() on 120 deterministic land probes."""
    idx = np.nonzero(land_mask)
    if len(idx[0]) == 0:
        return
    rng = random.Random(1337)
    max_err = 0.0
    n_pts = len(idx[0])
    for _ in range(min(120, n_pts)):
        k = rng.randrange(n_pts)
        r, c = int(idx[0][k]), int(idx[1][k])
        xv, yv = float(x_b[r, c]), float(y_b[r, c])
        # Skip Pharos islet probes (scalar terrain.height is main island only)
        if terrain.dcoast(xv, yv) < 3.0:
            continue
        err = abs(float(h_vec[r, c]) - terrain.height(xv, yv))
        if err > max_err:
            max_err = err
    if max_err > 0.02:
        raise RuntimeError(f'Vectorized terrain height diverged from terrain.height(): max_err={max_err:.4f} m')


def _build_roads(cj, coast):
    """Read canonical road & path polylines directly from terrain._roads (single source of truth)."""
    roads = {}
    paths = []
    for (rname, rkind, dense_uv, _zs, hw, _cut_m, _bb) in terrain._roads:
        pts = [terrain.from_uv(*p) for p in dense_uv]
        pts = [p for p in pts if geom.pip(p[0], p[1], coast)]
        if len(pts) < 2:
            continue
        if rname in ('pharos', 'west', 'south', 'east', 'shrine'):
            roads[rname] = pts
        else:
            paths.append((pts, hw * 2.0))
    return roads, paths


# Exact HBVG v1 protoId -> (canopy_radius_m, duff_weight); protoId 16..17 are vineyard rows (skipped for canopy humus!)
_HBVG_CANOPY = (
    (6.2, 0.88),  # 0: pine_broad
    (6.0, 0.88),  # 1: pine_tiered
    (5.2, 0.84),  # 2: pine_sheared
    (4.0, 0.72),  # 3: pine_young
    (2.7, 0.78),  # 4: cypress_tall
    (2.3, 0.74),  # 5: cypress_column
    (2.9, 0.82),  # 6: cypress_sanctuary
    (4.4, 0.64),  # 7: olive_ancient
    (3.7, 0.58),  # 8: olive_terrace
    (3.0, 0.52),  # 9: olive_young
    (6.0, 0.70),  # 10: plane_tall
    (5.6, 0.68),  # 11: plane_broad
    (4.1, 0.58),  # 12: almond_spread
    (3.2, 0.52),  # 13: almond_young
    (4.3, 0.62),  # 14: fig_broad
    (3.1, 0.54),  # 15: pomegranate_multi
)


def _try_load_veg_instances():
    """Read public/harbour/flora/vegetation-instances.bin (HBVG v1) if present; return [(x_B, y_B, radius_m, duff_w)] or None."""
    bin_path = os.path.join(ROOT, 'public/harbour/flora/vegetation-instances.bin')
    if not os.path.exists(bin_path):
        return None
    try:
        raw = open(bin_path, 'rb').read()
        if len(raw) >= 16 and raw[:4] == b'HBVG':
            ver, proto_count, count, _flags = struct.unpack_from('<HHII', raw, 4)
            if ver == 1 and count > 0 and 16 + count * 20 <= len(raw):
                out = []
                for i in range(count):
                    gx, _gy, gz, _yaw_u16, sxz_u8, _sy_u8, proto_id, _seed, _luma, _sway = struct.unpack_from(
                        '<3fH6B', raw, 16 + i * 20
                    )
                    # Skip modular vineyard rows (proto_id >= 16) so canopy humus & forest groundcover stay off the vineyard
                    if proto_id >= len(_HBVG_CANOPY):
                        continue
                    base_r, duff_w = _HBVG_CANOPY[proto_id]
                    scale_xz = 0.35 + (sxz_u8 / 255.0) * 1.45
                    out.append((float(gx), -float(gz), max(1.8, min(8.5, base_r * scale_xz)), duff_w))
                if out:
                    return out
    except Exception:
        pass
    # Legacy JSON companion fallback if present
    json_path = os.path.join(ROOT, 'public/harbour/flora/vegetation-instances.json')
    if os.path.exists(json_path):
        try:
            meta = json.load(open(json_path))
            items = meta if isinstance(meta, list) else meta.get('instances', [])
            out = []
            for it in items:
                p = it.get('position') or it.get('pos')
                if not p or len(p) < 3:
                    continue
                sp = str(it.get('species', 'pine')).lower()
                if 'vine' in sp:
                    continue
                sc = float(it.get('scale', 1.0))
                r = (6.0 if 'pine' in sp else 2.6 if 'cypress' in sp else 4.2) * sc
                w = 0.85 if ('pine' in sp or 'cypress' in sp) else 0.62
                out.append((float(p[0]), -float(p[2]), r, w))
            if out:
                return out
        except Exception:
            pass
    return None


def _fallback_tree_placements(cj, coast, ql, roads):
    """Deterministic mirror of hb_dress.py tree & grove placement when vegetation-instances.bin is absent."""
    xs = [p[0] for p in coast]
    ys = [p[1] for p in coast]
    ox0, oy0, ox1, oy1 = min(xs) - 10.0, min(ys) - 10.0, max(xs) + 10.0, max(ys) + 10.0
    ow, oh = int(ox1 - ox0), int(oy1 - oy0)
    o_to = lambda x, y: (x - ox0, oy1 - y)
    occ_im = Image.new('L', (ow, oh), 0)
    od = ImageDraw.Draw(occ_im)
    for lot in cj.get('lots', []):
        od.polygon([o_to(*p) for p in _lot_rect(lot, 1.5, 2.0)], fill=255)
    for k, lm in cj.get('landmarks', {}).items():
        if k in ('shoals', 'wreck_cove', 'far_ports', 'breakwater') or k.startswith('hamlet'):
            continue
        r = lm['fp'] * 0.5 + 3.0
        px, py = lm['p']
        od.polygon([o_to(px - r, py - r), o_to(px + r, py - r), o_to(px + r, py + r), o_to(px - r, py + r)], fill=255)
    for cv in cj.get('civic', []):
        od.polygon([o_to(*p) for p in _plot_rect(cv, 2.5)], fill=255)
    for fl in cj.get('flats', []):
        od.polygon([o_to(*p) for p in fl['poly']], fill=255)
    for name, line in ql.items():
        depth = APRON.get(name, 3.0 if name.endswith(('-w', '-e')) else 7.0) + 1.5
        for a, b in zip(line, line[1:]):
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy)
            if L < 1e-3:
                continue
            nl = (-dy / L * depth, dx / L * depth)
            od.polygon([o_to(*a), o_to(*b), o_to(b[0] + nl[0], b[1] + nl[1]), o_to(a[0] + nl[0], a[1] + nl[1])], fill=255)
    for pts in roads.values():
        if len(pts) >= 2:
            od.line([o_to(*p) for p in pts], fill=255, width=5)
    land_im = Image.new('L', (ow, oh), 0)
    ImageDraw.Draw(land_im).polygon([o_to(*p) for p in coast], fill=255)
    occ = np.array(occ_im) > 0
    land_r = np.array(land_im) > 127

    def occupied(x, y):
        i, j = int(oy1 - y), int(x - ox0)
        return not (0 <= i < oh and 0 <= j < ow) or bool(occ[i, j])

    def on_land(x, y):
        i, j = int(oy1 - y), int(x - ox0)
        return 0 <= i < oh and 0 <= j < ow and bool(land_r[i, j]) and not bool(occ[i, j])

    def in_crop(x, y):
        f = terrain.field_at(x, y)
        if f is not None and f['kind'] in ('hay', 'plough'):
            return True
        if terrain.terrace_w(*terrain.to_uv(x, y)) > 0.25:
            return True
        return terrain.in_vineyard(x, y)

    drng = random.Random(909)
    srng = random.Random(4404)
    tree_grid = {}
    trees = []  # (x_B, y_B, canopy_radius_m, duff_weight)

    def add_tree(x, y, sp, min_d):
        key = (int(x // 10.0), int(y // 10.0))
        tree_grid.setdefault(key, []).append((x, y, min_d))
        if sp == 'pine':
            trees.append((x, y, 6.4, 0.88))
        elif sp == 'cypress':
            trees.append((x, y, 2.7, 0.78))
        elif sp == 'plane':
            trees.append((x, y, 5.8, 0.68))
        else:
            trees.append((x, y, 3.8, 0.60))

    # Sanctuary cypress ring
    for i in range(17):
        a = -math.pi * 0.5 + math.radians(36) + i * math.radians(288) / 16.0
        rr = 10.6 if i % 2 == 0 else 12.3
        p = terrain.from_uv(terrain.SANCTUARY_UV[0] + math.cos(a) * rr + srng.uniform(-0.4, 0.4),
                            terrain.SANCTUARY_UV[1] + math.sin(a) * rr + srng.uniform(-0.4, 0.4))
        add_tree(p[0], p[1], 'cypress', 3.0)

    # Olive terrace rows
    for (c_uv, ru, rv, _a) in terrain.TERRACES:
        rr = max(ru, rv) + 1.0
        v_cur = c_uv[1] - rr
        while v_cur < c_uv[1] + rr:
            u_cur = c_uv[0] - rr
            while u_cur < c_uv[0] + rr:
                if terrain.terrace_w(u_cur, v_cur) > 0.65:
                    p = terrain.from_uv(u_cur, v_cur)
                    if on_land(*p):
                        add_tree(p[0], p[1], 'olive', 5.2)
                u_cur += 6.2
            v_cur += 5.4

    def scatter(n, sampler, sp, min_d, max_try=None):
        placed = 0
        tries = 0
        lim = max_try or n * 30
        while placed < n and tries < lim:
            tries += 1
            p = sampler(drng)
            if p is None or not on_land(*p) or in_crop(*p) or terrain.beach_k(*p)[0] > 0.25:
                continue
            key = (int(p[0] // 10.0), int(p[1] // 10.0))
            ok = True
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    for q in tree_grid.get((key[0] + di, key[1] + dj), ()):
                        d = (min_d + q[2]) * 0.5
                        if (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 < d * d:
                            ok = False
                            break
            if not ok:
                continue
            if sp == 'crest_pine':
                u, v = terrain.to_uv(*p)
                a = math.degrees(math.atan2(v - terrain.CT[1], u - terrain.CT[0]))
                if any(lo <= a <= hi for lo, hi in CREST_GAPS):
                    placed += 1
                    continue
                add_tree(p[0], p[1], 'pine', min_d)
            else:
                add_tree(p[0], p[1], sp, min_d)
            placed += 1

    def line_sampler(pts_uv, spread):
        def s(rng):
            i = rng.randrange(len(pts_uv) - 1)
            a, b = pts_uv[i], pts_uv[i + 1]
            t = rng.random()
            return terrain.from_uv(a[0] + (b[0] - a[0]) * t + rng.gauss(0, spread),
                                   a[1] + (b[1] - a[1]) * t + rng.gauss(0, spread))
        return s

    def crown_clear(sampler, r):
        def s(rng):
            p = sampler(rng)
            if p is None or any(occupied(p[0] + dx * r, p[1] + dy * r) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                return None
            return p
        return s

    def grove(sampler, lo=0.5):
        def s(rng):
            p = sampler(rng)
            if p is None or terrain.fbm(p[0], p[1], 0.018, 2, 71) < lo:
                return None
            return p
        return s

    def roadside(names, off):
        segs = [(nm, i) for nm in names if len(roads.get(nm, ())) >= 2 for i in range(len(roads[nm]) - 1)]

        def s(rng):
            if not segs:
                return None
            nm, i = segs[rng.randrange(len(segs))]
            a, b = roads[nm][i], roads[nm][i + 1]
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy)
            if L < 1e-3:
                return None
            t = rng.random()
            sd = rng.choice((-1, 1))
            return (a[0] + dx * t - dy / L * off * sd, a[1] + dy * t + dx / L * off * sd)
        return s

    # Town gardens
    town_spots = []
    for k, (r0, r1, _z) in enumerate(terrain.RINGS):
        th0, th1 = terrain.TOWN_TH[k]
        for _ in range(240):
            town_spots.append(_town_pt(terrain.CT, drng.uniform(th1, th0), drng.uniform(r0 + 2, r1 + 1)))
    scatter(130, lambda r: town_spots[r.randrange(len(town_spots))], 'olive', 6.0, max_try=5000)

    # Crest & spines & copses
    crest = [(terrain.CT[0] + math.cos(math.radians(a)) * 133.0, terrain.CT[1] + math.sin(math.radians(a)) * 133.0)
             for a in range(166, 8, -6)]
    scatter(120, crown_clear(line_sampler(crest, 7.5), 1.5), 'crest_pine', 4.6, max_try=8000)
    scatter(40, line_sampler(crest, 9.0), 'cypress', 3.4, max_try=2000)
    scatter(80, crown_clear(line_sampler(terrain.WEST_SPINE, 9.0), 2.0), 'pine', 4.6, max_try=8000)
    scatter(70, crown_clear(line_sampler(terrain.EAST_SPINE, 8.5), 3.5), 'pine', 5.2, max_try=5000)
    for (c_uv, sp_r, n) in COPSES_UV:
        scatter((n * 2) // 3, lambda r, c=c_uv, s=sp_r: terrain.from_uv(c[0] + r.gauss(0, s), c[1] + r.gauss(0, s)),
                'pine', 5.4, max_try=n * 30)
    scatter(36, roadside(['pharos'], 4.2), 'cypress', 6.0, max_try=2000)
    scatter(40, roadside(['west', 'south', 'east'], 3.8), 'cypress', 7.0, max_try=3000)
    r_edge = terrain.RINGS[-1][1]
    scatter(30, lambda r: _town_pt(terrain.CT, r.uniform(terrain.TOWN_TH[-1][1], terrain.TOWN_TH[-1][0]),
                                   r_edge + r.uniform(6.0, 16.0)), 'cypress', 5.0, max_try=1500)
    scatter(44, grove(lambda r: terrain.from_uv(r.uniform(-200, 220), r.uniform(-250, -200))), 'olive', 7.0, max_try=4000)
    scatter(16, grove(lambda r: terrain.from_uv(r.uniform(-240, -150), r.uniform(-200, -40))), 'olive', 7.0, max_try=3000)
    scatter(28, grove(line_sampler(terrain.WEST_SPINE + [(-150.0, 40.0)], 40.0)), 'olive', 7.0, max_try=5000)
    scatter(48, grove(line_sampler(terrain.EAST_SPINE, 34.0)), 'plane', 7.5, max_try=4000)
    scatter(24, crown_clear(line_sampler(crest, 16.0), 2.0), 'plane', 8.0, max_try=2000)
    return trees


def _decode_meshopt_glb_via_node(glb_path):
    """Decode an EXT_meshopt_compression / KHR_mesh_quantization GLB into Blender Z-up non-foliage triangles.

    Used as a transparent fallback when Arch/system Blender lacks libbf_intern_meshopt_bridge.so.
    Returns (verts_np_f32_Nx3, tris_np_u32_Mx3) or None if node / meshoptimizer is unavailable.
    """
    import tempfile
    script = r"""
const fs = require('fs');
const path = require('path');
const { MeshoptDecoder } = require(path.join(process.cwd(), 'node_modules/meshoptimizer'));
(async () => {
  await MeshoptDecoder.ready;
  const glb = fs.readFileSync(process.argv[1]);
  const outPath = process.argv[2];
  const jsonLen = glb.readUInt32LE(12);
  const j = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const binOff = 20 + jsonLen + 8;
  const bin = glb.subarray(binOff);
  const decodedViews = new Map();

  function getView(vi) {
    if (decodedViews.has(vi)) return decodedViews.get(vi);
    const bv = j.bufferViews[vi];
    const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
    let out;
    if (ext) {
      const src = new Uint8Array(bin.buffer, bin.byteOffset + (ext.byteOffset || 0), ext.byteLength);
      out = new Uint8Array(ext.count * ext.byteStride);
      MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter || 'NONE');
    } else {
      out = new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
    }
    decodedViews.set(vi, out);
    return out;
  }

  function readAccessor(ai) {
    const acc = j.accessors[ai];
    const bv = j.bufferViews[acc.bufferView];
    const raw = getView(acc.bufferView);
    const comps = acc.type === 'SCALAR' ? 1 : acc.type === 'VEC2' ? 2 : acc.type === 'VEC3' ? 3 : 4;
    const stride = bv.byteStride || (comps * (acc.componentType === 5126 || acc.componentType === 5125 ? 4 : acc.componentType === 5122 || acc.componentType === 5123 ? 2 : 1));
    const base = acc.byteOffset || 0;
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const out = new Float32Array(acc.count * comps);
    const norm = !!acc.normalized;
    for (let i = 0; i < acc.count; i++) {
      const o = base + i * stride;
      for (let c = 0; c < comps; c++) {
        let v;
        if (acc.componentType === 5126) v = dv.getFloat32(o + c * 4, true);
        else if (acc.componentType === 5125) v = dv.getUint32(o + c * 4, true);
        else if (acc.componentType === 5123) v = dv.getUint16(o + c * 2, true) / (norm ? 65535 : 1);
        else if (acc.componentType === 5122) v = Math.max(-1, dv.getInt16(o + c * 2, true) / (norm ? 32767 : 1));
        else if (acc.componentType === 5121) v = dv.getUint8(o + c) / (norm ? 255 : 1);
        else if (acc.componentType === 5120) v = Math.max(-1, dv.getInt8(o + c) / (norm ? 127 : 1));
        else v = 0;
        out[i * comps + c] = v;
      }
    }
    return out;
  }

  function mulMat(a, b) {
    const r = new Float64Array(16);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[col * 4 + k];
        r[col * 4 + row] = s;
      }
    }
    return r;
  }

  function nodeLocal(n) {
    if (n.matrix) return Float64Array.from(n.matrix);
    const [tx, ty, tz] = n.translation || [0, 0, 0];
    const [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1];
    const [sx, sy, sz] = n.scale || [1, 1, 1];
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2;
    const yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;
    return Float64Array.from([
      (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
      (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
      (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
      tx, ty, tz, 1,
    ]);
  }

  const parents = new Int32Array((j.nodes || []).length).fill(-1);
  (j.nodes || []).forEach((n, i) => (n.children || []).forEach((c) => { parents[c] = i; }));
  function nodeWorld(i) {
    let m = nodeLocal(j.nodes[i]);
    let p = parents[i];
    while (p >= 0) { m = mulMat(nodeLocal(j.nodes[p]), m); p = parents[p]; }
    return m;
  }

  const skipTok = ['shakkei', 'sea', 'sky', 'leaf', 'canopy', 'crown'];
  const verts = [];
  const tris = [];
  let vOff = 0;

  (j.nodes || []).forEach((n, ni) => {
    if (n.mesh === undefined) return;
    const nm = String(n.name || '').toLowerCase();
    if (skipTok.some((t) => nm.includes(t))) return;
    const m = nodeWorld(ni);
    const mesh = j.meshes[n.mesh];
    for (const prim of mesh.primitives || []) {
      if (prim.attributes.POSITION === undefined) continue;
      const pos = readAccessor(prim.attributes.POSITION);
      const col = prim.attributes.COLOR_0 !== undefined ? readAccessor(prim.attributes.COLOR_0) : null;
      const idx = prim.indices !== undefined ? readAccessor(prim.indices) : null;
      const nv = pos.length / 3;
      for (let i = 0; i < nv; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        // glTF Y-up -> Blender Z-up: (x_B, y_B, z_B) = (wx, -wz, wy)
        verts.push(wx, -wz, wy);
      }
      const nIdx = idx ? idx.length : nv;
      for (let t = 0; t + 2 < nIdx; t += 3) {
        const a = idx ? (idx[t] | 0) : t;
        const b = idx ? (idx[t + 1] | 0) : t + 1;
        const c = idx ? (idx[t + 2] | 0) : t + 2;
        if (col) {
          const pid = Math.round(col[a * 4 + 3] * 16);
          // Skip terrain surfaces (0=sand, 5=rock/cliff, 6=grass) and canopies (8, 14) so BVH casts structural & trunk AO only.
          if (pid === 0 || pid === 5 || pid === 6 || pid === 8 || pid === 14) continue;
        }
        tris.push(vOff + a, vOff + b, vOff + c);
      }
      vOff += nv;
    }
  });

  const nV = verts.length / 3, nT = tris.length / 3;
  const hdr = Buffer.alloc(8);
  hdr.writeUInt32LE(nV, 0);
  hdr.writeUInt32LE(nT, 4);
  const vBuf = Buffer.from(new Float32Array(verts).buffer);
  const tBuf = Buffer.from(new Uint32Array(tris).buffer);
  fs.writeFileSync(outPath, Buffer.concat([hdr, vBuf, tBuf]));
})().catch((err) => { console.error(err); process.exit(1); });
"""
    fd, tmp_path = tempfile.mkstemp(prefix='pharos_bvh_', suffix='.bin')
    os.close(fd)
    try:
        res = subprocess.run(
            ['node', '-e', script, glb_path, tmp_path],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            print(f'bake_terrain: node meshopt decode failed ({res.stderr.strip()}); falling back to analytic AO')
            return None
        raw = open(tmp_path, 'rb').read()
        if len(raw) < 8:
            return None
        n_v, n_t = struct.unpack_from('<II', raw, 0)
        if n_v == 0 or n_t == 0:
            return None
        v_bytes = n_v * 3 * 4
        verts_np = np.frombuffer(raw, dtype=np.float32, count=n_v * 3, offset=8).reshape(n_v, 3).copy()
        tris_np = np.frombuffer(raw, dtype=np.uint32, count=n_t * 3, offset=8 + v_bytes).reshape(n_t, 3).copy()
        return verts_np, tris_np
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _blender_bvh_ao(x_b, y_b, h_grid, nx_b, ny_b, nz_b, land_mask, glb_path=None):
    """Cast 16 cosine-weighted hemisphere rays (max_dist=4.5 m) using Blender BVHTree on non-foliage geometry.

    Evaluated at 512x512 on active land pixels (~100k rays*16 = ~1.6M rays) and smoothly upsampled to match
    x_b's shape, giving soft 4.5 m structural bounce AO without foliage canopy contamination.
    """
    try:
        import bpy
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree
    except ImportError:
        return None

    t0 = time.time()
    skip_families = {'keyart', 'life_keyart', 'sky', 'sea', 'fx', 'beam', 'life', 'shakkei', 'mooring'}
    verts = []
    polys = []

    # If the live Blender scene already contains island meshes (e.g. called from build_island.py),
    # raycast them directly without importing an external GLB.
    live_meshes = [
        o for o in bpy.context.scene.objects
        if o.type == 'MESH' and not o.hide_render and o.name not in ('Cube', 'Plane', 'Camera', 'Light')
    ]
    imported_objs = []
    used_node_decode = False

    if not live_meshes and glb_path and os.path.exists(glb_path):
        before = set(bpy.data.objects)
        try:
            bpy.ops.import_scene.gltf(filepath=glb_path)
            imported_objs = [o for o in bpy.data.objects if o not in before]
        except RuntimeError as exc:
            if 'Meshopt' in str(exc) or 'meshopt' in str(exc):
                decoded = _decode_meshopt_glb_via_node(glb_path)
                if decoded is not None:
                    v_np, t_np = decoded
                    verts = [Vector((float(p[0]), float(p[1]), float(p[2]))) for p in v_np]
                    polys = [(int(t[0]), int(t[1]), int(t[2])) for t in t_np]
                    used_node_decode = True
            else:
                print(f'bake_terrain: glTF import warning ({exc}); falling back to analytic AO')
                return None

    if not used_node_decode:
        v_off = 0
        depsgraph = bpy.context.evaluated_depsgraph_get()
        for ob in bpy.context.scene.objects:
            if ob.type != 'MESH' or ob.hide_render:
                continue
            fam = ob.get('family', '')
            if fam in skip_families or fam.startswith('tree'):
                continue
            if any(tok in ob.name.lower() for tok in ('shakkei', 'sea', 'sky', 'leaf', 'canopy', 'crown')):
                continue
            ev = ob.evaluated_get(depsgraph)
            me = ev.to_mesh()
            if not me or len(me.polygons) == 0:
                ev.to_mesh_clear()
                continue
            me.calc_loop_triangles()
            col_attr = me.color_attributes.get('Col') or (me.color_attributes[0] if len(me.color_attributes) else None)
            loop_alpha = None
            if col_attr is not None and col_attr.domain == 'CORNER':
                buf = np.zeros(len(me.loops) * 4, np.float32)
                col_attr.data.foreach_get('color', buf)
                loop_alpha = buf.reshape(-1, 4)[:, 3]

            mat_w = ob.matrix_world
            n_v = len(me.vertices)
            co = np.empty(n_v * 3, np.float32)
            me.vertices.foreach_get('co', co)
            co = co.reshape(-1, 3)
            m_np = np.array(mat_w, dtype=np.float64)
            co_w = co @ m_np[:3, :3].T + m_np[:3, 3]
            verts.extend([Vector((float(p[0]), float(p[1]), float(p[2]))) for p in co_w])

            for tri in me.loop_triangles:
                if loop_alpha is not None:
                    pid = int(round(float(loop_alpha[tri.loops[0]]) * 16.0))
                    # Exclude terrain surfaces (0, 5, 6) and foliage canopies (8, 14) so BVH casts structural & trunk AO only.
                    if pid in (0, 5, 6, 8, 14):
                        continue
                v0, v1, v2 = tri.vertices
                polys.append((v_off + v0, v_off + v1, v_off + v2))
            v_off += n_v
            ev.to_mesh_clear()

    if imported_objs:
        for o in imported_objs:
            bpy.data.objects.remove(o, do_unlink=True)

    if not polys:
        return None

    bvh = BVHTree.FromPolygons(verts, polys)

    # 16 stratified cosine-weighted hemisphere directions (golden-angle Fibonacci hemisphere)
    dirs_local = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for k in range(16):
        u = (k + 0.5) / 16.0
        r = math.sqrt(u)
        phi = k * golden
        z = math.sqrt(max(0.0, 1.0 - u))
        # Tilt slightly away from pure horizon to prevent grazing ground self-hits
        z = max(z, 0.22)
        l = math.hypot(r * math.cos(phi), r * math.sin(phi), z)
        dirs_local.append((r * math.cos(phi) / l, r * math.sin(phi) / l, z / l))

    # Trace at 512x512 (or target size if <= 512) and upsample cleanly
    n = x_b.shape[0]
    step = max(1, n // 512)
    xs_s = x_b[::step, ::step]
    ys_s = y_b[::step, ::step]
    hs_s = h_grid[::step, ::step]
    nxs = nx_b[::step, ::step]
    nys = ny_b[::step, ::step]
    nzs = nz_b[::step, ::step]
    lm_s = land_mask[::step, ::step]
    ao_s = np.ones(xs_s.shape, dtype=np.float32)

    rows, cols = np.nonzero(lm_s)
    max_dist = 4.5
    for idx_i in range(len(rows)):
        r, c = int(rows[idx_i]), int(cols[idx_i])
        nx, ny, nz = float(nxs[r, c]), float(nys[r, c]), float(nzs[r, c])
        # Build tangent frame around bare normal (nx, ny, nz)
        if abs(nz) < 0.99:
            tx, ty, tz = -ny, nx, 0.0
            tl = math.hypot(tx, ty) or 1.0
            tx /= tl
            ty /= tl
        else:
            tx, ty, tz = 1.0, 0.0, 0.0
        bx = ny * tz - nz * ty
        by = nz * tx - nx * tz
        bz = nx * ty - ny * tx

        orig = Vector((float(xs_s[r, c]) + nx * 0.32, float(ys_s[r, c]) + ny * 0.32, float(hs_s[r, c]) + nz * 0.32))
        occ = 0.0
        for (lx, ly, lz) in dirs_local:
            d = Vector((tx * lx + bx * ly + nx * lz, ty * lx + by * ly + ny * lz, tz * lx + bz * ly + nz * lz))
            _loc, _nrm, _face, dist = bvh.ray_cast(orig, d, max_dist)
            if dist is not None and dist > 0.18:
                occ += (1.0 - dist / max_dist)
        ao_s[r, c] = max(0.38, 1.0 - (occ / 16.0) * 0.72)

    # Smooth 16-ray hemisphere bounce AO at 512^2 so Monte Carlo stratification never creates speckle
    # (crisp 0.4-1.8 m wall/building/trunk contact occlusion is preserved at full 1024^2 by the analytic collar).
    ao_s = ndimage.gaussian_filter(ao_s, sigma=2.15)
    ao_s = np.where(ao_s > 0.945, 1.0, ao_s)
    if step > 1:
        ao_full = ndimage.zoom(ao_s, step, order=1)
        ao_full = np.clip(ao_full[:n, :n], 0.42, 1.0)
    else:
        ao_full = np.clip(ao_s, 0.42, 1.0)
    print(f'BVHTree bare-terrain hemisphere AO ({len(polys)} tris, {len(rows)} texels): {time.time() - t0:.2f}s')
    return ao_full


def bake(cj, bounds_xz, use_blender_bvh=True, glb_path=None):
    """Bake terrain_splat (1024^2 RGBA8) and terrain_topo (512^2 RGBA8) arrays."""
    t0 = time.time()
    coast, ql = _init_terrain(cj)
    ph = cj.get('pharos')
    islet = [tuple(p) for p in ph['islet']] if ph and ph.get('islet') else []
    land_polys = [coast] + ([islet] if islet else [])

    # =========================================================================
    # 1. TERRAIN-TOPO (512 x 512 RGBA8): pure bare-terrain analytic geometry
    # =========================================================================
    xt, yt = _grid(bounds_xz, TOPO_N)
    land_t = _raster_polys(land_polys, [], [], bounds_xz, TOPO_N)
    min_x, min_z, max_x, max_z = bounds_xz
    samp_t = ((max_z - min_z) / TOPO_N, (max_x - min_x) / TOPO_N)
    d_in_t = ndimage.distance_transform_edt(land_t, sampling=samp_t)
    d_out_t = ndimage.distance_transform_edt(~land_t, sampling=samp_t)
    sd_t = np.where(land_t, d_in_t, -d_out_t)  # positive inland, negative in water

    active_t = sd_t > -14.0
    h0 = _eval_height_grid(xt, yt, active_t, cj)
    _verify_vectorized_height(xt, yt, h0, land_t)

    # Analytic +/-0.75 m central differences in glTF Y-up space:
    #   dh/dx_W = dh/dx_B;  dh/dz_W = -dh/dy_B
    #   upward normal = (-dh/dx_B, 1, +dh/dy_B) / L
    eps = 0.75
    hx_p = _eval_height_grid(xt + eps, yt, active_t, cj)
    hx_m = _eval_height_grid(xt - eps, yt, active_t, cj)
    hy_p = _eval_height_grid(xt, yt + eps, active_t, cj)
    hy_m = _eval_height_grid(xt, yt - eps, active_t, cj)
    dh_dx = (hx_p - hx_m) / (2.0 * eps)
    dh_dy = (hy_p - hy_m) / (2.0 * eps)
    nx_w = -dh_dx
    nz_w = dh_dy
    inv_l = 1.0 / np.sqrt(nx_w * nx_w + 1.0 + nz_w * nz_w)
    nx_w *= inv_l
    ny_w = inv_l
    nz_w *= inv_l

    # Fade normals smoothly to flat (0, 1, 0) just offshore (-4..0 m) so seabed stays crisp constant
    w_fade = _sstep_np(-4.0, 0.0, sd_t)
    nx_w *= w_fade
    nz_w *= w_fade

    # Multi-scale curvature / Laplacian (3 m + 9 m blend)
    h3_xp = _eval_height_grid(xt + 3.0, yt, active_t, cj)
    h3_xm = _eval_height_grid(xt - 3.0, yt, active_t, cj)
    h3_yp = _eval_height_grid(xt, yt + 3.0, active_t, cj)
    h3_ym = _eval_height_grid(xt, yt - 3.0, active_t, cj)
    lap3 = h0 - 0.25 * (h3_xp + h3_xm + h3_yp + h3_ym)

    h9_xp = _eval_height_grid(xt + 9.0, yt, active_t, cj)
    h9_xm = _eval_height_grid(xt - 9.0, yt, active_t, cj)
    h9_yp = _eval_height_grid(xt, yt + 9.0, active_t, cj)
    h9_ym = _eval_height_grid(xt, yt - 9.0, active_t, cj)
    lap9 = h0 - 0.25 * (h9_xp + h9_xm + h9_yp + h9_ym)

    curv = np.clip((lap3 * 0.28 + lap9 * 0.14) * w_fade, -0.5, 0.5)
    coast_a = np.clip(np.maximum(sd_t, 0.0) / 24.0, 0.0, 1.0)

    # Nyquist pre-filter at ~1.35 m/texel so terrace risers never alias and VP8L compresses cleanly
    nx_s = ndimage.gaussian_filter(nx_w, sigma=1.1)
    nz_s = ndimage.gaussian_filter(nz_w, sigma=1.1)
    ny_s_topo = np.sqrt(np.clip(1.0 - nx_s * nx_s - nz_s * nz_s, 0.0, 1.0))
    curv_s_topo = ndimage.gaussian_filter(curv, sigma=1.1)
    curv_s_topo = np.where(np.abs(curv_s_topo) < 0.014, 0.0, curv_s_topo)

    topo = np.zeros((TOPO_N, TOPO_N, 4), dtype=np.uint8)
    topo[..., 0] = _quantize_step(nx_s * 0.5 + 0.5, 4, snap_top=False)
    topo[..., 1] = _quantize_step(nz_s * 0.5 + 0.5, 4, snap_top=False)
    topo[..., 2] = _quantize_step(0.5 + curv_s_topo, 8, snap_top=False)
    topo[..., 3] = _quantize_step(coast_a, 4, snap_top=True)
    water_t = sd_t < -4.0
    topo[water_t] = (128, 128, 128, 0)

    # =========================================================================
    # 2. TERRAIN-SPLAT (1024 x 1024 RGBA8): wear, humus, contact AO, karst
    # =========================================================================
    xs, ys = _grid(bounds_xz, SPLAT_N)
    land_s = _raster_polys(land_polys, [], [], bounds_xz, SPLAT_N)
    samp_s = ((max_z - min_z) / SPLAT_N, (max_x - min_x) / SPLAT_N)
    d_in_s = ndimage.distance_transform_edt(land_s, sampling=samp_s)
    d_out_s = ndimage.distance_transform_edt(~land_s, sampling=samp_s)
    sd_s = np.where(land_s, d_in_s, -d_out_s)
    water_s = sd_s < -4.0

    # Smooth domain-warp & canopy-feather noise (sub-2m micro-detail comes from uTerrainDetail on the GPU)
    warp_fbm = (_fbm_np(xs, ys, 0.042, 2, 17) - 0.5) * 1.45
    drip_noise = _fbm_np(xs, ys, 0.07, 2, 29)
    karst_fbm = _fbm_np(xs, ys, 0.022, 2, 53)

    # Build roads, lanes, quay back-edges, yards, walls
    roads, paths = _build_roads(cj, coast)
    ct_uv = tuple(cj.get('town', {}).get('ct_uv', terrain.CT))
    rings = cj.get('town', {}).get('rings', terrain.RINGS)
    town_th = cj.get('town', {}).get('th', terrain.TOWN_TH)

    # Lanes & Customs square
    lane_lines = []
    terrace_wall_lines = []
    for k in range(1, len(rings)):
        r0 = rings[k][0]
        th0, th1 = town_th[k]
        n_seg = max(8, int(math.radians(th0 - th1) * r0 / 3.0))
        pts_l = [_town_pt(ct_uv, th0 - (th0 - th1) * i / n_seg, r0 + 1.8) for i in range(n_seg + 1)]
        lane_lines.append((pts_l, 3.2))
        th0_w, th1_w = th0 + 4.0, th1 - 4.0
        n_w = max(8, int(math.radians(th0_w - th1_w) * r0 / 3.0))
        pts_w = [_town_pt(ct_uv, th0_w - (th0_w - th1_w) * i / n_w, r0 - 0.45) for i in range(n_w + 1)]
        terrace_wall_lines.append((pts_w, 1.0))

    customs_sq = []
    rq = terrain.R_QUAY
    for i in range(16):
        tha = 111.0 - 42.0 * i / 16.0
        thb = 111.0 - 42.0 * (i + 1) / 16.0
        customs_sq.append([_town_pt(ct_uv, tha, rq + 8.5), _town_pt(ct_uv, thb, rq + 8.5),
                           _town_pt(ct_uv, thb, rq + 18.4), _town_pt(ct_uv, tha, rq + 18.4)])

    # Quay back-edges (offset inland by APRON depth)
    quay_back_lines = []
    for name, line in ql.items():
        if name == 'yard' or len(line) < 2:
            continue
        depth = APRON.get(name, 3.0 if name.endswith(('-w', '-e')) else 7.0)
        off_pts = []
        for i, p in enumerate(line):
            a = line[max(0, i - 1)]
            b = line[min(len(line) - 1, i + 1)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy) or 1.0
            off_pts.append((p[0] - dy / L * depth, p[1] + dx / L * depth))
        quay_back_lines.append((off_pts, 1.2))

    # --- Channel R: Path, Verge & Worked-Earth Wear ---
    road_lines = [
        (roads['pharos'], terrain.ROAD_CUT_W), (roads['west'], 3.0),
        (roads['south'], 3.0), (roads['east'], 2.6), (roads['shrine'], 1.5),
    ] + [(p, w) for (p, w) in paths if len(p) >= 2] + lane_lines + quay_back_lines
    road_mask = _raster_polys(customs_sq, [], road_lines, bounds_xz, SPLAT_N)
    d_road = _edt_m(road_mask, bounds_xz)
    wear_road = 1.0 - _sstep_np(0.8, 3.4, d_road + warp_fbm)

    yard_polys = [_plot_rect(cv, 0.8) for cv in cj.get('civic', [])] + [_lot_rect(l, 0.6, 0.8) for l in cj.get('lots', [])]
    yard_mask = _raster_polys(yard_polys, [], [], bounds_xz, SPLAT_N)
    d_yard = _edt_m(yard_mask, bounds_xz)
    wear_yard = (1.0 - _sstep_np(0.8, 3.5, d_yard + warp_fbm)) * 0.82

    # Olive terrace treads, vineyard, ancient quarry dust, threshing floor & sanctuary fringes
    u_s = (xs + ys) / terrain.SQ2
    v_s = (ys - xs) / terrain.SQ2 - terrain.VOFF
    tw_s = np.zeros_like(xs)
    for (c, ru, rv, a) in terrain.TERRACES:
        du_t, dv_t = u_s - c[0], v_s - c[1]
        ca, sa = math.cos(a), math.sin(a)
        dt = np.hypot((du_t * ca + dv_t * sa) / ru, (-du_t * sa + dv_t * ca) / rv)
        tw_s = np.maximum(tw_s, np.where(dt < 1.0, 1.0 - _sstep_np(0.68, 1.0, dt), 0.0))
    wear_terrace = tw_s * (0.66 + 0.08 * drip_noise)

    du_qs, dv_qs = u_s - terrain.QUARRY_UV[0], v_s - terrain.QUARRY_UV[1]
    ca_qs, sa_qs = math.cos(terrain.QUARRY_ANG), math.sin(terrain.QUARRY_ANG)
    dq_s = np.hypot((du_qs * ca_qs + dv_qs * sa_qs) / terrain.QUARRY_RU, (-du_qs * sa_qs + dv_qs * ca_qs) / terrain.QUARRY_RV)
    qw_s = np.where(dq_s < 1.0, 1.0 - _sstep_np(0.68, 1.0, dq_s), 0.0)
    qw_s = np.where(u_s < 188.0, qw_s * _sstep_np(184.0, 189.0, u_s), qw_s)
    wear_quarry = qw_s * 0.72

    _vc, _vd, _va, vine_poly = terrain.vineyard()
    vine_mask = _raster_polys([vine_poly], [], [], bounds_xz, SPLAT_N)
    d_vine = _edt_m(vine_mask, bounds_xz)
    wear_vine = (1.0 - _sstep_np(0.0, 2.4, d_vine + warp_fbm * 0.6)) * 0.78

    tcx, tcy = terrain.from_uv(*terrain.THRESHING_UV)
    d_thr = np.hypot(xs - tcx, ys - tcy)
    wear_thr = (1.0 - _sstep_np(terrain.THRESHING_R - 0.5, terrain.THRESHING_R + 3.4, d_thr + warp_fbm * 0.7)) * 0.75

    scx, scy = terrain.from_uv(*terrain.SANCTUARY_UV)
    d_san = np.hypot(xs - scx, ys - scy)
    wear_san = (1.0 - _sstep_np(terrain.SANCTUARY_R - 2.0, terrain.SANCTUARY_R + 3.0, d_san + warp_fbm * 0.7)) * 0.58

    ch_r = np.maximum.reduce([wear_road, wear_yard, wear_terrace, wear_quarry, wear_vine, wear_thr, wear_san])
    ch_r = np.clip(ch_r * _sstep_np(-1.0, 2.0, sd_s), 0.0, 1.0)

    # --- Channel G: Canopy Humus & Pine-Needle Duff ---
    trees = _try_load_veg_instances()
    tree_source = 'vegetation-instances.bin'
    if trees is None:
        trees = _fallback_tree_placements(cj, coast, ql, roads)
        tree_source = 'hb_dress fallback'

    to_px_s, dx_s, dy_s = _to_px_fn(bounds_xz, SPLAT_N)
    humus = np.zeros((SPLAT_N, SPLAT_N), dtype=np.float32)
    for (tx, ty, rad, wt) in trees:
        cx, cy = to_px_s((tx, ty))
        rx = int(math.ceil(rad * 2.2 / dx_s))
        ry = int(math.ceil(rad * 2.2 / dy_s))
        j0, j1 = max(0, int(cx) - rx), min(SPLAT_N, int(cx) + rx + 1)
        i0, i1 = max(0, int(cy) - ry), min(SPLAT_N, int(cy) + ry + 1)
        if i0 >= i1 or j0 >= j1:
            continue
        gx = xs[i0:i1, j0:j1] - tx
        gy = ys[i0:i1, j0:j1] - ty
        g_splat = wt * np.exp(-(gx * gx + gy * gy) / (rad * rad * 0.55))
        humus[i0:i1, j0:j1] = 1.0 - (1.0 - humus[i0:i1, j0:j1]) * (1.0 - g_splat)

    # Maquis clusters on steep flanks & near outcrops
    outcrops_w = [terrain.from_uv(*p) for p in OUTCROPS_UV]
    outcrop_mask = _raster_polys([], [(ox, oy, 3.8) for ox, oy in outcrops_w], [], bounds_xz, SPLAT_N)
    d_outcrop = _edt_m(outcrop_mask, bounds_xz)
    maquis_drift = _sstep_np(0.42, 0.68, _fbm_np(xs, ys, 0.026, 2, 63)) * (1.0 - _sstep_np(4.0, 16.0, d_outcrop)) * 0.35
    ch_g = np.clip((humus + maquis_drift) * (0.78 + 0.40 * drip_noise) * _sstep_np(0.5, 4.0, sd_s), 0.0, 1.0)

    # --- Channel B: High-Res Contact AO & Grounding Skirt (full 8-bit) ---
    bldg_polys = [_plot_rect(cv, 0.0) for cv in cj.get('civic', [])] + [_lot_rect(l, 0.0, 0.0) for l in cj.get('lots', [])]
    bldg_circles = [(scx, scy, 3.6)]  # Sanctuary tholos base
    for k, lm in cj.get('landmarks', {}).items():
        if k in ('shoals', 'wreck_cove', 'far_ports', 'breakwater') or k.startswith('hamlet'):
            continue
        bldg_circles.append((lm['p'][0], lm['p'][1], max(2.0, lm['fp'] * 0.35)))
    bldg_mask = _raster_polys(bldg_polys, bldg_circles, [], bounds_xz, SPLAT_N)
    d_bldg = _edt_m(bldg_mask, bounds_xz)
    # Tight contact collar: 0.48 at wall edge, recovering smoothly over 0.4..1.8 m
    ao_bldg = 0.48 + 0.52 * _sstep_np(0.2, 1.85, d_bldg)

    # Retaining walls (terrace_walls, civic_pad_walls, flats edges, field_walls)
    wall_lines = list(terrace_wall_lines)
    for cv in cj.get('civic', []):
        ring = _plot_rect(cv, 0.45)
        wall_lines.append((ring + [ring[0]], 0.9))
    for fl in cj.get('flats', []):
        ring = [tuple(p) for p in fl['poly']]
        wall_lines.append((ring + [ring[0]], 0.9))
    for f in terrain.FIELDS:
        ring = [tuple(p) for p in f['poly']]
        wall_lines.append((ring + [ring[0]], 0.65))
    wall_mask = _raster_polys([], [], wall_lines, bounds_xz, SPLAT_N)
    d_wall = _edt_m(wall_mask, bounds_xz)
    ao_wall = 0.54 + 0.46 * _sstep_np(0.25, 1.65, d_wall)

    # Quay back-edge & rock outcrops & tree trunks
    quay_mask = _raster_polys([], [], quay_back_lines, bounds_xz, SPLAT_N)
    ao_quay = 0.68 + 0.32 * _sstep_np(0.2, 1.5, _edt_m(quay_mask, bounds_xz))
    ao_rock = 0.56 + 0.44 * _sstep_np(0.3, 2.2, d_outcrop)

    # Tree trunk grounding skirts for mature canopy trees (rad >= 3.6 m); smooth slightly to remove 1 px VP8L noise
    trunk_mask = _raster_polys([], [(tx, ty, 0.75) for (tx, ty, rad, _w) in trees if rad >= 3.6], [], bounds_xz, SPLAT_N)
    ao_trunk = 0.68 + 0.32 * _sstep_np(0.30, 1.60, _edt_m(trunk_mask, bounds_xz))

    contact_ao = np.minimum.reduce([ao_bldg, ao_wall, ao_quay, ao_rock, ao_trunk])

    # Optional Blender 16-ray BVHTree bare-terrain hemisphere AO
    if use_blender_bvh:
        # Upsample bare height & Blender-space normal from 512x512 topo grid
        h_s = ndimage.zoom(h0, SPLAT_N // TOPO_N, order=1)[:SPLAT_N, :SPLAT_N]
        # Convert glTF normal (nx_w, ny_w, nz_w) -> Blender normal (nx_w, -nz_w, ny_w)
        nxb = ndimage.zoom(nx_w, SPLAT_N // TOPO_N, order=1)[:SPLAT_N, :SPLAT_N]
        nyb = ndimage.zoom(-nz_w, SPLAT_N // TOPO_N, order=1)[:SPLAT_N, :SPLAT_N]
        nzb = ndimage.zoom(ny_w, SPLAT_N // TOPO_N, order=1)[:SPLAT_N, :SPLAT_N]
        bvh_ao = _blender_bvh_ao(xs, ys, h_s, nxb, nyb, nzb, sd_s > -2.0, glb_path=glb_path)
        if bvh_ao is not None:
            contact_ao = np.clip(contact_ao * bvh_ao, 0.25, 1.0)

    # Keep open water & unoccluded open ground crisp white (255)
    contact_ao = np.where((sd_s < -4.0) | (contact_ao > 0.94), 1.0, contact_ao)

    # --- Channel A: Karst Limestone Outcrop & Aridity Mask ---
    # 1. Outcrop & talus skirts
    k_outcrop = (1.0 - _sstep_np(1.5, 11.5, d_outcrop + warp_fbm * 1.4)) * 0.92
    # 2. Rocky headland (head_d < 1.15) & Pharos islet
    hd_s = np.hypot((u_s - terrain.HEAD_C[0]) / terrain.HEAD_R[0], (v_s - terrain.HEAD_C[1]) / terrain.HEAD_R[1])
    k_head = (1.0 - _sstep_np(0.75, 1.18, hd_s)) * (0.44 + 0.32 * karst_fbm)
    islet_mask = _raster_polys([islet], [], [], bounds_xz, SPLAT_N) if islet else np.zeros((SPLAT_N, SPLAT_N), bool)
    k_islet = np.where(islet_mask, 0.85, 0.0)
    # 3. Coastal cliff rim (dcoast < 10 m outside beaches)
    beach_lines = [(b['line'], b['depth'] * 1.4) for b in cj.get('beaches', []) if len(b.get('line', ())) >= 2]
    beach_mask = _raster_polys([], [], beach_lines, bounds_xz, SPLAT_N) if beach_lines else np.zeros((SPLAT_N, SPLAT_N), bool)
    d_beach = _edt_m(beach_mask, bounds_xz) if np.any(beach_mask) else np.full((SPLAT_N, SPLAT_N), 999.0)
    non_beach = _sstep_np(2.0, 12.0, d_beach)
    k_cliff = (1.0 - _sstep_np(2.0, 10.0, np.maximum(sd_s, 0.0))) * _sstep_np(-1.0, 0.5, sd_s) * non_beach * 0.78
    # 4. Steep analytic slope boost (upsampled from smooth bare topo ny_s_topo)
    ny_s = ndimage.zoom(ny_s_topo, SPLAT_N // TOPO_N, order=1)[:SPLAT_N, :SPLAT_N]
    slope_s = 1.0 - np.clip(ny_s, 0.0, 1.0)
    k_slope = _sstep_np(0.16, 0.44, slope_s) * 0.85
    # 5. Low-frequency karst strata fBM (arid convex ridge crests) + exposed East limestone quarry
    curv_s = ndimage.zoom(curv_s_topo, SPLAT_N // TOPO_N, order=1)[:SPLAT_N, :SPLAT_N]
    k_strata = _sstep_np(0.58, 0.80, karst_fbm) * _sstep_np(0.06, 0.28, curv_s) * 0.65
    k_quarry = qw_s * 0.95

    ch_a = np.clip(np.maximum.reduce([k_outcrop, k_head, k_islet, k_cliff, k_slope, k_strata, k_quarry]), 0.0, 1.0)
    ch_a = np.where(sd_s < -2.0, 0.0, ch_a)

    # Gently band-limit splat channels R/G/A and snap faint tails cleanly to 0 for crisp lossless WebP compression
    # (uTerrainSplat uses hardware linear filtering + GPU micro-detail height blending, so smooth quantized masks stay banding-free).
    ch_r = ndimage.gaussian_filter(ch_r, sigma=1.8)
    ch_g = ndimage.gaussian_filter(ch_g, sigma=2.8)
    ch_a = ndimage.gaussian_filter(ch_a, sigma=2.8)
    ch_r = np.where(ch_r < 0.09, 0.0, ch_r)
    ch_g = np.where(ch_g < 0.11, 0.0, ch_g)
    ch_a = np.where(ch_a < 0.12, 0.0, ch_a)

    splat = np.zeros((SPLAT_N, SPLAT_N, 4), dtype=np.uint8)
    splat[..., 0] = _quantize_step(ch_r, 32, snap_top=True)
    splat[..., 1] = _quantize_step(ch_g, 32, snap_top=True)
    # Channel B: 32-step bit-aligned contact AO (step=8, exact 255 in open ground) — hardware linear filtering
    # reconstructs continuous occlusion while keeping 1024^2 lossless WebP comfortably under 100 KB even with BVHTree AO.
    splat[..., 2] = _quantize_step(contact_ao, 8, snap_top=True)
    splat[..., 3] = _quantize_step(ch_a, 32, snap_top=True)
    splat[water_s] = (0, 0, 255, 0)

    print(f'bake_terrain: trees={len(trees)} ({tree_source}), elapsed={time.time() - t0:.2f}s')
    return splat, topo


def write_maps(splat, topo, encode_webp=True):
    assets_dir = os.path.join(ROOT, 'assets/harbour')
    pub_dir = os.path.join(ROOT, 'public/harbour')
    os.makedirs(assets_dir, exist_ok=True)
    os.makedirs(pub_dir, exist_ok=True)

    outputs = [
        ('terrain-splat', splat),
        ('terrain-topo', topo),
    ]
    paths = {}
    for stem, arr in outputs:
        png_path = os.path.join(assets_dir, f'{stem}.png')
        webp_path = os.path.join(pub_dir, f'{stem}.webp')
        Image.fromarray(arr, 'RGBA').save(png_path, optimize=True)
        paths[f'{stem}.png'] = png_path
        if encode_webp:
            subprocess.run(
                ['cwebp', '-quiet', '-lossless', '-exact', '-z', '9', '-metadata', 'none', png_path, '-o', webp_path],
                check=True,
            )
            # Pixel-exact roundtrip verification
            decoded = np.array(Image.open(webp_path).convert('RGBA'))
            if decoded.shape != arr.shape or not np.array_equal(decoded, arr):
                raise RuntimeError(f'{webp_path} failed pixel-exact verification against {png_path}')
            paths[f'{stem}.webp'] = webp_path
            print(f'  {stem}: png={os.path.getsize(png_path) / 1024:.1f} KB, webp={os.path.getsize(webp_path) / 1024:.1f} KB (pixel-exact)')
    return paths


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    arg = lambda name, default=None: argv[argv.index(name) + 1] if name in argv else default

    layout_path = os.path.join(ROOT, 'src/harbour/data/layout.json')
    layout = json.load(open(layout_path))
    b = layout['bounds']
    bounds_xz = [float(b['min'][0]), float(b['min'][2]), float(b['max'][0]), float(b['max'][2])]

    compose_path = arg('--compose', os.path.join(ROOT, 'outputs/harbour/island/compose.json'))
    if os.path.exists(compose_path):
        cj = json.load(open(compose_path))
        print(f'Using compose.json: {compose_path}')
    else:
        cj = _cj_from_layout(layout)
        print(f'compose.json absent; reconstructed island layout from {layout_path}')

    glb_path = arg('--glb', os.path.join(ROOT, 'public/harbour/island.glb'))
    use_bvh = '--no-bvh' not in argv
    splat, topo = bake(cj, bounds_xz, use_blender_bvh=use_bvh, glb_path=glb_path)
    write_maps(splat, topo, encode_webp='--no-webp' not in argv)


if __name__ == '__main__':
    main()
