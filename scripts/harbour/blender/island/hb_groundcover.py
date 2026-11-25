#!/usr/bin/env python3
"""Phase 4A — Ecological Ground-Cover & Biome Ecosystem Exporter (HBGC v1).

Emits `public/harbour/groundcover.bin` (~6,950 anchors -> ~10,900 runtime instances after
tangent-plane micro-cluster expansion; ~32-42 KB Brotli-11).

Supports BOTH execution modes:
  1. Exec'd stage inside `build_island.py` (reads live `HF`, `TREE_GRID`, `OCC`, `OCC_D`,
     `ROADS`, `TERRACES`, `FIELDS`, `OUTCROPS`, `CJ`, `terrain`, `ROOT` directly from globals).
  2. Standalone invocation via Blender or Python 3:
       blender -b --factory-startup -P scripts/harbour/blender/island/hb_groundcover.py [-- --out path]
       python3 scripts/harbour/blender/island/hb_groundcover.py [-- --out path]
     (reconstructs bare terrain, occupancy, roads, terraces, fields, outcrops, and reads
     `public/harbour/flora/vegetation-instances.bin` if present).

Binary format `HBGC` v1 (little-endian, glTF Y-up: x_g = x_bl, y_g = z_bl, z_g = -y_bl):
  - Header (32 B): magic b"HBGC" | version u16=1 | archetypeCount u16=7 |
                   minX, minY, minZ, scaleX, scaleY, scaleZ (6 x f32)
  - Archetype table (7 x 4 x u16 = 56 B): cumulative anchor counts [rescue, low, medium, high]
      0=grass, 1=understory, 2=maquis, 3=flowers, 4=rocks, 5=coastal, 6=urban
  - Per-archetype Morton-sorted SoA streams (12 B/anchor):
      dx_lo, dx_hi, dz_lo, dz_hi, dy_lo, dy_hi (delta-coded u16)
      rgb565_lo, rgb565_hi                     (delta-coded u16 linear terrain RGB565)
      nx, nz                                   (delta-coded i8 mod 256, glTF Y-up normal)
      props_lo, props_hi                       (u16: yaw 6b | scale 4b | variant 4b | clusterCount 2b)
"""
import json
import math
import os
import random
import site
import struct
import sys
import time

sys.dont_write_bytecode = True
for _sp in (site.getusersitepackages(), '/home/ahirice/.local/lib/python3.14/site-packages'):
    if _sp and os.path.isdir(_sp) and _sp not in sys.path:
        sys.path.append(_sp)

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

_THIS_FILE = globals().get('__file__')
_HERE = os.path.dirname(os.path.abspath(_THIS_FILE)) if _THIS_FILE else globals().get('HERE_', os.getcwd())
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
_ROOT = globals().get('ROOT') or os.path.abspath(os.path.join(_HERE, '../../../..'))

ARCH_GRASS = 0
ARCH_UNDERSTORY = 1
ARCH_MAQUIS = 2
ARCH_FLOWERS = 3
ARCH_ROCKS = 4
ARCH_COASTAL = 5
ARCH_URBAN = 6
ARCH_COUNT = 7
ARCH_NAMES = ('grass', 'understory', 'maquis', 'flowers', 'rocks', 'coastal', 'urban')

HBGC_MAGIC = b'HBGC'
HBGC_VERSION = 1
MIN_SCALE = 0.65
MAX_SCALE = 1.45

# Progressive stratum cumulative fractions per archetype:
#   rescue (~9% overall): rocks, maquis, urban ONLY
#   low    (~35% overall)
#   medium (~65% overall)
#   high   (100%)
STRATUM_FRACTIONS = {
    ARCH_GRASS:      (0.00, 0.30, 0.62, 1.00),
    ARCH_UNDERSTORY: (0.00, 0.35, 0.66, 1.00),
    ARCH_MAQUIS:     (0.22, 0.45, 0.72, 1.00),
    ARCH_FLOWERS:    (0.00, 0.25, 0.60, 1.00),
    ARCH_ROCKS:      (0.45, 0.65, 0.82, 1.00),
    ARCH_COASTAL:    (0.00, 0.35, 0.68, 1.00),
    ARCH_URBAN:      (0.38, 0.58, 0.78, 1.00),
}

# Target anchor counts (~6,950 anchors -> ~10,900 runtime instances after micro-cluster expansion)
ANCHOR_BUDGET = {
    ARCH_GRASS:      2600,
    ARCH_UNDERSTORY: 1150,
    ARCH_MAQUIS:      950,
    ARCH_FLOWERS:     850,
    ARCH_ROCKS:       650,
    ARCH_COASTAL:     420,
    ARCH_URBAN:       330,
}


def _srgb_hex_to_lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def _clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)


def _morton2d(x, z):
    a = x & 0xffff
    b = z & 0xffff
    a = (a | (a << 8)) & 0x00ff00ff
    a = (a | (a << 4)) & 0x0f0f0f0f
    a = (a | (a << 2)) & 0x33333333
    a = (a | (a << 1)) & 0x55555555
    b = (b | (b << 8)) & 0x00ff00ff
    b = (b | (b << 4)) & 0x0f0f0f0f
    b = (b | (b << 2)) & 0x33333333
    b = (b | (b << 1)) & 0x55555555
    return a | (b << 1)


def _zigzag16(delta_mod):
    s = ((delta_mod + 32768) & 0xffff) - 32768
    return ((s << 1) ^ (s >> 15)) & 0xffff


def _zigzag8(delta_mod):
    s = ((delta_mod + 128) & 0xff) - 128
    return ((s << 1) ^ (s >> 7)) & 0xff


def _pack_rgb565(r, g, b):
    r5 = int(_clamp(round(r * 31.0), 0, 31))
    g6 = int(_clamp(round(g * 63.0), 0, 63))
    b5 = int(_clamp(round(b * 31.0), 0, 31))
    return (r5 << 11) | (g6 << 5) | b5


def _pack_props(yaw, scale, variant, cluster_count):
    yaw_n = yaw % (math.pi * 2.0)
    yaw_q = int(round((yaw_n / (math.pi * 2.0)) * 64.0)) & 0x3f
    sc_t = (scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)
    sc_q = int(_clamp(round(sc_t * 15.0), 0, 15))
    var_q = int(_clamp(variant, 0, 15))
    cl_q = int(_clamp(cluster_count, 1, 3))
    return (yaw_q & 0x3f) | ((sc_q & 0x0f) << 6) | ((var_q & 0x0f) << 10) | ((cl_q & 0x03) << 14)


def _seg_dist(px, py, a, b):
    abx, aby = b[0] - a[0], b[1] - a[1]
    t = _clamp(((px - a[0]) * abx + (py - a[1]) * aby) / (abx * abx + aby * aby + 1e-9), 0.0, 1.0)
    return math.hypot(px - (a[0] + abx * t), py - (a[1] + aby * t))


def _poly_min_dist(px, py, pts, closed=False):
    if len(pts) < 2:
        return 1e9
    best = 1e9
    n = len(pts) if closed else len(pts) - 1
    for i in range(n):
        d = _seg_dist(px, py, pts[i], pts[(i + 1) % len(pts)])
        if d < best:
            best = d
    return best


def _point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _barycentric_2d(px, py, ax, ay, bx, by, cx, cy):
    v0x, v0y = bx - ax, by - ay
    v1x, v1y = cx - ax, cy - ay
    v2x, v2y = px - ax, py - ay
    denom = v0x * v1y - v1x * v0y
    if abs(denom) < 1e-12:
        return (1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0)
    inv = 1.0 / denom
    v = (v2x * v1y - v1x * v2y) * inv
    w = (v0x * v2y - v2x * v0y) * inv
    u = 1.0 - v - w
    return (u, v, w)


class _BareTerrainSampler:
    """Samples bare-terrain height, smooth normal, and linear RGB beneath any Blender (x, y) point.

    Uses live Blender `HF` BVHTree triangle interpolation when invoked from `build_island.py`,
    falling back seamlessly to exact analytic `terrain.height` + `hf_face`/`_terrain_paint` parity standalone.
    """

    def __init__(self, terrain_mod, hf_obj=None):
        self.terrain = terrain_mod
        self._bvh = None
        self._tris = None
        self._verts = None
        self._vnorms = None
        self._tri_cols = None
        self._pal_grass = _srgb_hex_to_lin('#748F45')
        self._pal_grass_dark = _srgb_hex_to_lin('#58723A')
        self._pal_rock = _srgb_hex_to_lin('#7F848A')
        self._pal_sand = _srgb_hex_to_lin('#D3BF96')
        self._pal_shingle = _srgb_hex_to_lin('#A49E90')
        self._pal_pebble = _srgb_hex_to_lin('#AFA593')
        self._pal_head = _srgb_hex_to_lin('#7E9150')
        self._pal_forest = _srgb_hex_to_lin('#667F41')
        self._pal_dry = _srgb_hex_to_lin('#B2A866')
        self._pal_moss = _srgb_hex_to_lin('#5D7A3C')
        self._pal_heath = _srgb_hex_to_lin('#8A7090')
        self._pal_tread = tuple(
            a * 0.6 + b * 0.4 for a, b in zip(_srgb_hex_to_lin('#93975A'), _srgb_hex_to_lin('#8B7558'))
        )
        self._pal_riser = _srgb_hex_to_lin('#9C9672')
        self._pal_vine = _srgb_hex_to_lin('#8C7457')
        self._pal_cobble = _srgb_hex_to_lin('#8F8A82')
        self._field_cols = {k: _srgb_hex_to_lin(v) for k, v in getattr(terrain_mod, 'FIELD_COL', {}).items()}

        if hf_obj is not None:
            self._init_hf_bvh(hf_obj)

    def _init_hf_bvh(self, hf_obj):
        try:
            import bpy
            from mathutils import Vector
            from mathutils.bvhtree import BVHTree
        except ImportError:
            return
        try:
            dg = bpy.context.evaluated_depsgraph_get()
            ev = hf_obj.evaluated_get(dg)
            me = ev.to_mesh()
            if not me or len(me.polygons) == 0:
                ev.to_mesh_clear()
                return
            me.calc_loop_triangles()
            mat_w = hf_obj.matrix_world
            rot_w = mat_w.to_3x3()
            n_v = len(me.vertices)
            verts = [mat_w @ v.co for v in me.vertices]
            vnorms = [(rot_w @ v.normal).normalized() for v in me.vertices]

            col_attr = me.color_attributes.get('Col') or (me.color_attributes[0] if len(me.color_attributes) else None)
            loop_rgb = None
            if col_attr is not None and col_attr.domain == 'CORNER':
                buf = np.zeros(len(me.loops) * 4, np.float32)
                col_attr.data.foreach_get('color', buf)
                loop_rgb = buf.reshape(-1, 4)[:, :3]

            tris = []
            tri_cols = []
            for lt in me.loop_triangles:
                v0, v1, v2 = lt.vertices
                tris.append((v0, v1, v2))
                if loop_rgb is not None:
                    l0, l1, l2 = lt.loops
                    tri_cols.append((
                        (float(loop_rgb[l0, 0]), float(loop_rgb[l0, 1]), float(loop_rgb[l0, 2])),
                        (float(loop_rgb[l1, 0]), float(loop_rgb[l1, 1]), float(loop_rgb[l1, 2])),
                        (float(loop_rgb[l2, 0]), float(loop_rgb[l2, 1]), float(loop_rgb[l2, 2])),
                    ))
                else:
                    tri_cols.append(None)

            self._bvh = BVHTree.FromPolygons(verts, tris)
            self._verts = [(float(v.x), float(v.y), float(v.z)) for v in verts]
            self._vnorms = [(float(n.x), float(n.y), float(n.z)) for n in vnorms]
            self._tris = tris
            self._tri_cols = tri_cols
            ev.to_mesh_clear()
        except Exception as exc:
            print(f'hb_groundcover: HF BVH init warning ({exc}); using analytic terrain sampler')
            self._bvh = None

    def _analytic_color(self, x, y, z, nz):
        t = self.terrain
        u, v = t.to_uv(x, y)
        if t.pad_at(x, y, 0.0) is not None and nz > 0.9:
            return self._pal_cobble
        nn = t.fbm(x, y, 0.02, 2, 11)
        tw, tf = t.terrace_info(x, y)
        if tw > 0.45:
            if (tf > 1.0 - t.TERRACE_RISER - 0.03 or tf < 0.03) and nz < 0.97:
                c = self._pal_riser
            else:
                c = self._pal_tread
            k = 0.94 + 0.12 * nn
            c = (c[0] * k, c[1] * k, c[2] * k)
        elif nz < 0.34:
            c = self._pal_rock
        elif nz < 0.72:
            c = self._pal_rock if nn > 0.66 else self._pal_grass_dark
        else:
            kb, kind = t.beach_k(x, y)
            if kb > 0.45:
                dc = t.dcoast(x, y)
                if kind == 'sand':
                    c = self._pal_shingle if dc < 3.5 else (self._pal_sand if dc < 42.0 else _srgb_hex_to_lin('#B9B07A'))
                else:
                    c = self._pal_pebble if dc < 7.5 else _srgb_hex_to_lin('#A6A77A')
            elif t.in_vineyard(x, y):
                c = self._pal_vine
            else:
                fl = t.field_at(x, y)
                if fl is not None:
                    c = self._field_cols.get(fl['kind'], self._pal_grass)
                else:
                    hd = t.head_d(u, v)
                    if hd < 1.1:
                        base = self._pal_head
                    elif (z > 17.0 or t.line_d(u, v, t.WEST_SPINE) < 24.0
                          or t.line_d(u, v, t.EAST_SPINE) < 24.0):
                        base = self._pal_forest
                    else:
                        base = self._pal_grass
                    n2 = t.fbm(x, y, 0.006, 3, 5)
                    tk = _clamp((n2 - 0.38) / 0.26, 0.0, 1.0)
                    scale = 0.9 + 0.2 * tk
                    c = (base[0] * scale, base[1] * scale, base[2] * scale)

        # Mirror hb_land._terrain_paint dry/moss/heath drift modulation
        if nz > 0.72 and t.field_at(x, y) is None and not t.in_vineyard(x, y):
            n1 = t.fbm(x, y, 0.016, 3, 31)
            n2 = t.fbm(x, y, 0.07, 2, 37)
            k_dry = _clamp((n1 - 0.55) / 0.12, 0.0, 1.0) * 0.42
            k_moss = _clamp((0.42 - n1) / 0.10, 0.0, 1.0) * 0.35
            r, g, b = c
            r = r + (self._pal_dry[0] - r) * k_dry
            g = g + (self._pal_dry[1] - g) * k_dry
            b = b + (self._pal_dry[2] - b) * k_dry
            r = r + (self._pal_moss[0] - r) * k_moss
            g = g + (self._pal_moss[1] - g) * k_moss
            b = b + (self._pal_moss[2] - b) * k_moss
            if t.head_d(u, v) < 1.15 and n2 > 0.58:
                kh = 0.35 * min(1.0, (n2 - 0.58) / 0.10)
                r = r + (self._pal_heath[0] - r) * kh
                g = g + (self._pal_heath[1] - g) * kh
                b = b + (self._pal_heath[2] - b) * kh
            mod = 0.92 + 0.16 * n2
            c = (_clamp(r * mod, 0.0, 1.0), _clamp(g * mod, 0.0, 1.0), _clamp(b * mod, 0.0, 1.0))
        return c

    def sample(self, x, y):
        """Return (z_bl, (nx_bl, ny_bl, nz_bl), (r_lin, g_lin, b_lin)) at Blender (x, y)."""
        if self._bvh is not None:
            from mathutils import Vector
            loc, f_nrm, tri_idx, _dist = self._bvh.ray_cast(Vector((x, y, 120.0)), Vector((0.0, 0.0, -1.0)), 180.0)
            if loc is not None and tri_idx is not None:
                v0, v1, v2 = self._tris[tri_idx]
                p0, p1, p2 = self._verts[v0], self._verts[v1], self._verts[v2]
                u, v, w = _barycentric_2d(loc.x, loc.y, p0[0], p0[1], p1[0], p1[1], p2[0], p2[1])
                u = _clamp(u, 0.0, 1.0)
                v = _clamp(v, 0.0, 1.0)
                w = _clamp(1.0 - u - v, 0.0, 1.0)
                s = u + v + w
                if s > 1e-6:
                    u /= s; v /= s; w /= s
                n0, n1, n2 = self._vnorms[v0], self._vnorms[v1], self._vnorms[v2]
                nx = n0[0] * u + n1[0] * v + n2[0] * w
                ny = n0[1] * u + n1[1] * v + n2[1] * w
                nz = n0[2] * u + n1[2] * v + n2[2] * w
                nl = math.hypot(nx, ny, nz)
                if nl > 1e-5 and nz > 0.0:
                    nrm = (nx / nl, ny / nl, nz / nl)
                else:
                    nrm = (float(f_nrm.x), float(f_nrm.y), max(0.05, float(f_nrm.z)))
                tc = self._tri_cols[tri_idx]
                if tc is not None:
                    c0, c1, c2 = tc
                    col = (
                        _clamp(c0[0] * u + c1[0] * v + c2[0] * w, 0.0, 1.0),
                        _clamp(c0[1] * u + c1[1] * v + c2[1] * w, 0.0, 1.0),
                        _clamp(c0[2] * u + c1[2] * v + c2[2] * w, 0.0, 1.0),
                    )
                else:
                    col = self._analytic_color(x, y, float(loc.z), nrm[2])
                return float(loc.z), nrm, col

        # Analytic fallback (exact terrain.py surface)
        t = self.terrain
        z = t.height(x, y)
        d = 0.75
        hx = (t.height(x + d, y) - t.height(x - d, y)) / (2.0 * d)
        hy = (t.height(x, y + d) - t.height(x, y - d)) / (2.0 * d)
        nx, ny, nz = -hx, -hy, 1.0
        nl = math.hypot(nx, ny, nz) or 1.0
        nrm = (nx / nl, ny / nl, nz / nl)
        col = self._analytic_color(x, y, z, nrm[2])
        return z, nrm, col


def _load_standalone_context(root_dir):
    """Build full island context cleanly when executed standalone outside `build_island.py`."""
    import bake_terrain
    import terrain as terrain_mod

    compose_path = os.path.join(root_dir, 'outputs/harbour/island/compose.json')
    layout_path = os.path.join(root_dir, 'src/harbour/data/layout.json')
    layout = json.load(open(layout_path))
    if os.path.exists(compose_path):
        cj = json.load(open(compose_path))
    else:
        cj = bake_terrain._cj_from_layout(layout)

    coast, ql = bake_terrain._init_terrain(cj)
    roads, paths = bake_terrain._build_roads(cj, coast)
    all_roads = dict(roads)
    for idx, ppts in enumerate(paths):
        all_roads[f'path_{idx}'] = ppts

    # Build 1 m occupancy raster mirroring hb_dress.py (lots, civic, flats, quays, lanes, stairs, beaches, roads)
    xs = [p[0] for p in coast]
    ys = [p[1] for p in coast]
    ox0, oy0, ox1, oy1 = min(xs) - 10.0, min(ys) - 10.0, max(xs) + 10.0, max(ys) + 10.0
    ow, oh = int(ox1 - ox0), int(oy1 - oy0)
    o_to = lambda x, y: (x - ox0, oy1 - y)

    occ_im = Image.new('L', (ow, oh), 0)
    od = ImageDraw.Draw(occ_im)
    for lot in cj.get('lots', []):
        od.polygon([o_to(*p) for p in bake_terrain._lot_rect(lot, 1.5, 2.0)], fill=255)
    for k, lm in cj.get('landmarks', {}).items():
        if k in ('shoals', 'wreck_cove', 'far_ports', 'breakwater') or k.startswith('hamlet'):
            continue
        r = lm['fp'] * 0.5 + 3.0
        px, py = lm['p']
        od.polygon([o_to(px - r, py - r), o_to(px + r, py - r), o_to(px + r, py + r), o_to(px - r, py + r)], fill=255)
    for cv in cj.get('civic', []):
        od.polygon([o_to(*p) for p in bake_terrain._plot_rect(cv, 2.5)], fill=255)
    for fl in cj.get('flats', []):
        od.polygon([o_to(*p) for p in fl['poly']], fill=255)
    for name, line in ql.items():
        depth = bake_terrain.APRON.get(name, 3.0 if name.endswith(('-w', '-e')) else 7.0) + 1.5
        for a, b in zip(line, line[1:]):
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy)
            if L < 1e-3:
                continue
            nl = (-dy / L * depth, dx / L * depth)
            od.polygon([o_to(*a), o_to(*b), o_to(b[0] + nl[0], b[1] + nl[1]), o_to(a[0] + nl[0], a[1] + nl[1])], fill=255)
    # Amphitheatre terrace lanes & Customs square
    town = cj.get('town', {})
    ct_uv = tuple(town.get('ct_uv', terrain_mod.CT))
    rings = town.get('rings', terrain_mod.RINGS)
    town_th = town.get('th', terrain_mod.TOWN_TH)
    for k in range(1, len(rings)):
        r0 = rings[k][0]
        th0, th1 = town_th[k]
        pts_lane = [bake_terrain._town_pt(ct_uv, th1 + (th0 - th1) * i / 28.0, r0 + 2.4) for i in range(29)]
        od.line([o_to(*p) for p in pts_lane], fill=255, width=7)
    for th in range(70, 112, 3):
        od.line(
            [o_to(*bake_terrain._town_pt(ct_uv, th, terrain_mod.R_QUAY + 6)),
             o_to(*bake_terrain._town_pt(ct_uv, th, terrain_mod.R_QUAY + 31))],
            fill=255, width=5,
        )
    for pts in all_roads.values():
        if len(pts) >= 2:
            od.line([o_to(*p) for p in pts], fill=255, width=5)

    land_im = Image.new('L', (ow, oh), 0)
    ImageDraw.Draw(land_im).polygon([o_to(*p) for p in coast], fill=255)
    occ = np.array(occ_im) > 0
    land_r = np.array(land_im) > 127
    occ_d = ndimage.distance_transform_edt(~occ)

    # Read vegetation-instances.bin if present (Phase 1B), else fallback deterministic tree scatter
    veg_trees = bake_terrain._try_load_veg_instances()
    if veg_trees is None:
        veg_trees = bake_terrain._fallback_tree_placements(cj, coast, ql, roads)
    tree_pts = [(float(tx), float(ty), float(tr)) for (tx, ty, tr, _tw) in veg_trees]

    heart_t = layout.get('camera', {}).get('presets', {}).get('heart', {}).get('target', [0.0, 0.0, 0.0])
    heart_bl = (float(heart_t[0]), -float(heart_t[2]))

    return dict(
        cj=cj,
        terrain=terrain_mod,
        coast=coast,
        roads=all_roads,
        occ=occ,
        occ_d=occ_d,
        land_r=land_r,
        ox0=ox0,
        oy0=oy0,
        ox1=ox1,
        oy1=oy1,
        os_step=1.0,
        tree_pts=tree_pts,
        outcrops_uv=list(bake_terrain.OUTCROPS_UV),
        hf_obj=None,
        heart_bl=heart_bl,
    )


def _extract_exec_context(ns):
    """Extract live island globals when exec'd from `build_island.py`."""
    terrain_mod = ns['terrain']
    cj = ns['CJ']
    coast = [tuple(p) for p in cj['coast']]
    occ = ns['OCC']
    occ_d = ns['OCC_D']
    land_r = ns.get('LAND_R')
    ox0, oy0, ox1, oy1 = float(ns['OX0']), float(ns['OY0']), float(ns['OX1']), float(ns['OY1'])
    os_step = float(ns.get('OS', 1.0))
    if land_r is None:
        oh, ow = occ.shape
        im = Image.new('L', (ow, oh), 0)
        ImageDraw.Draw(im).polygon([((p[0] - ox0) / os_step, (oy1 - p[1]) / os_step) for p in coast], fill=255)
        land_r = np.array(im) > 127

    # Collect trunk positions from TREE_GRID, supplemented by vegetation-instances.bin if present
    tree_pts = []
    tree_grid = ns.get('TREE_GRID') or {}
    for entries in tree_grid.values():
        for (tx, ty, sp_d) in entries:
            tree_pts.append((float(tx), float(ty), float(sp_d)))
    if not tree_pts:
        try:
            import bake_terrain
            vt = bake_terrain._try_load_veg_instances()
            if vt:
                tree_pts = [(float(tx), float(ty), float(tr)) for (tx, ty, tr, _tw) in vt]
        except Exception:
            pass

    cj_layout = ns.get('CJ_LAYOUT') or {}
    heart_t = cj_layout.get('camera', {}).get('presets', {}).get('heart', {}).get('target', [0.0, 0.0, 0.0])
    heart_bl = (float(heart_t[0]), -float(heart_t[2]))

    return dict(
        cj=cj,
        terrain=terrain_mod,
        coast=coast,
        roads=dict(ns.get('ROADS') or {}),
        occ=occ,
        occ_d=occ_d,
        land_r=land_r,
        ox0=ox0,
        oy0=oy0,
        ox1=ox1,
        oy1=oy1,
        os_step=os_step,
        tree_pts=tree_pts,
        outcrops_uv=list(ns.get('OUTCROPS') or []),
        hf_obj=ns.get('HF'),
        heart_bl=heart_bl,
    )


def _build_road_dist_grid(roads, ox0, oy1, ow, oh, os_step):
    """Rasterize road & footpath centrelines into a fast 1 m distance field (metres)."""
    im = Image.new('L', (ow, oh), 0)
    dr = ImageDraw.Draw(im)
    for pts in roads.values():
        if len(pts) >= 2:
            px_pts = [((p[0] - ox0) / os_step, (oy1 - p[1]) / os_step) for p in pts]
            dr.line(px_pts, fill=255, width=2)
    mask = np.array(im) > 0
    if not np.any(mask):
        return np.full((oh, ow), 999.0, dtype=np.float32)
    return (ndimage.distance_transform_edt(~mask) * os_step).astype(np.float32)


def _in_protected_crop(x, y, terrain_mod):
    """True inside arable crop fields (hay/plough), vineyard rows, threshing floor, or sanctuary paving."""
    fl = terrain_mod.field_at(x, y)
    if fl is not None and fl['kind'] in ('hay', 'plough'):
        return True
    if terrain_mod.in_vineyard(x, y, grow=0.8):
        return True
    # Threshing floor (aloni) and hill sanctuary temenos
    tcx, tcy = terrain_mod.from_uv(*terrain_mod.THRESHING_UV)
    if (x - tcx) ** 2 + (y - tcy) ** 2 < (terrain_mod.THRESHING_R + 1.4) ** 2:
        return True
    scx, scy = terrain_mod.from_uv(*terrain_mod.SANCTUARY_UV)
    if (x - scx) ** 2 + (y - scy) ** 2 < (terrain_mod.SANCTUARY_R + 0.6) ** 2:
        return True
    return False


def generate_groundcover_anchors(ctx, seed=4041):
    """Generate ~6,950 ecologically placed anchors across all 7 archetypes."""
    rng = random.Random(seed)
    t = ctx['terrain']
    cj = ctx['cj']
    occ = ctx['occ']
    occ_d = ctx['occ_d']
    land_r = ctx['land_r']
    ox0, oy0, ox1, oy1 = ctx['ox0'], ctx['oy0'], ctx['ox1'], ctx['oy1']
    os_step = ctx['os_step']
    oh, ow = occ.shape
    sampler = _BareTerrainSampler(t, ctx.get('hf_obj'))
    road_d = _build_road_dist_grid(ctx['roads'], ox0, oy1, ow, oh, os_step)
    heart_x, heart_y = ctx['heart_bl']

    outcrops_w = [t.from_uv(u, v) for (u, v) in ctx['outcrops_uv']]

    def grid_ij(x, y):
        i = int((oy1 - y) / os_step)
        j = int((x - ox0) / os_step)
        if 0 <= i < oh and 0 <= j < ow:
            return i, j
        return None

    def is_land(x, y):
        ij = grid_ij(x, y)
        return ij is not None and bool(land_r[ij[0], ij[1]])

    def is_open(x, y, allow_road_verge=False):
        ij = grid_ij(x, y)
        if ij is None or not land_r[ij[0], ij[1]]:
            return False
        rd = float(road_d[ij[0], ij[1]])
        if rd < 1.35:
            return False  # strictly outside ±1.2 m walked roadbed
        if occ[ij[0], ij[1]]:
            if allow_road_verge and 1.4 <= rd <= 2.9:
                # Permit shoulder tufts inside road's occupancy halo while still excluding buildings/pads/quays
                if t.pad_at(x, y, 0.8) is not None:
                    return False
                return True
            return False
        return True

    def occ_dist(x, y):
        ij = grid_ij(x, y)
        return float(occ_d[ij[0], ij[1]]) if ij is not None else 0.0

    def road_dist(x, y):
        ij = grid_ij(x, y)
        return float(road_d[ij[0], ij[1]]) if ij is not None else 999.0

    # Spatial hash per archetype to prevent overlapping clumps
    grids = [{} for _ in range(ARCH_COUNT)]
    anchors = [[] for _ in range(ARCH_COUNT)]

    def try_add(arch, x, y, min_d, scale, variant, cluster_count, importance,
                allow_road_verge=False, allow_urban_edge=False, max_slope=0.58):
        if len(anchors[arch]) >= ANCHOR_BUDGET[arch]:
            return False
        if not is_land(x, y):
            return False
        if not allow_urban_edge and not is_open(x, y, allow_road_verge=allow_road_verge):
            return False
        if allow_urban_edge and road_dist(x, y) < 1.45:
            return False
        if _in_protected_crop(x, y, t):
            return False

        # Never plant on wet beach sand (allow upper dune rim beach_k in (0.05, 0.45) for grass/coastal/rocks)
        kb, _kind = t.beach_k(x, y)
        if kb > 0.45:
            return False
        if arch in (ARCH_UNDERSTORY, ARCH_FLOWERS, ARCH_URBAN) and kb > 0.15:
            return False

        dc = t.dcoast(x, y)
        if dc < 1.2:
            return False

        z_bl, nrm_bl, col = sampler.sample(x, y)
        if z_bl < 0.75:
            return False
        slope = 1.0 - nrm_bl[2]
        if slope > max_slope:
            return False

        cell = max(min_d, 1.0)
        key = (int(math.floor(x / cell)), int(math.floor(y / cell)))
        g = grids[arch]
        md2 = min_d * min_d
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for (qx, qy) in g.get((key[0] + di, key[1] + dj), ()):
                    if (x - qx) ** 2 + (y - qy) ** 2 < md2:
                        return False
        g.setdefault(key, []).append((x, y))

        # Convert Blender Z-up -> glTF Y-up: (x, z, -y)
        gx, gy, gz = x, z_bl, -y
        gnx, gny, gnz = nrm_bl[0], nrm_bl[2], -nrm_bl[1]
        if gny < 0.05:
            nl = math.hypot(gnx, 0.05, gnz)
            gnx, gny, gnz = gnx / nl, 0.05 / nl, gnz / nl

        # Importance score combining ecological weight, heart-view prominence, scale, and blue-noise jitter
        d_heart = math.hypot(x - heart_x, y - heart_y)
        heart_boost = max(0.0, 1.0 - d_heart / 420.0) * 0.35
        score = importance + heart_boost + (scale - 1.0) * 0.25 + rng.uniform(-0.22, 0.22)
        anchors[arch].append(dict(
            x=gx, y=gy, z=gz,
            r=col[0], g=col[1], b=col[2],
            nx=gnx, nz=gnz,
            yaw=rng.uniform(0.0, math.pi * 2.0),
            scale=_clamp(scale, MIN_SCALE, MAX_SCALE),
            variant=int(variant) & 0x0f,
            cluster=int(_clamp(cluster_count, 1, 3)),
            score=score,
        ))
        return True

    # ---- 1. PINE-WOODLAND & OLIVE/CYPRESS UNDERSTORY (0.5 - 2.8 m around trunks) ----
    # Directly grounds every bare trunk with pine-needle mounds, arching fern fans, shade rosemary,
    # and downhill mossy limestone rocks.
    trees = list(ctx['tree_pts'])
    rng.shuffle(trees)
    for (tx, ty, _sp_d) in trees:
        n_ring = rng.randint(2, 3)
        base_ang = rng.uniform(0.0, math.pi * 2.0)
        for k in range(n_ring):
            ang = base_ang + k * (math.pi * 2.0 / n_ring) + rng.uniform(-0.45, 0.45)
            rad = rng.uniform(0.55, 2.75)
            px, py = tx + math.cos(ang) * rad, ty + math.sin(ang) * rad
            if try_add(
                ARCH_UNDERSTORY, px, py, 1.25,
                rng.uniform(0.82, 1.32), rng.randrange(16),
                2 if rng.random() < 0.55 else 1,
                importance=1.15, max_slope=0.52,
            ):
                pass
        # Downhill mossy limestone rock tucked near woodland trunks
        if rng.random() < 0.32 and len(anchors[ARCH_ROCKS]) < int(ANCHOR_BUDGET[ARCH_ROCKS] * 0.30):
            gx_h = t.height(tx + 1.0, ty) - t.height(tx - 1.0, ty)
            gy_h = t.height(tx, ty + 1.0) - t.height(tx, ty - 1.0)
            gl = math.hypot(gx_h, gy_h)
            dx_d, dy_d = (-gx_h / gl, -gy_h / gl) if gl > 1e-3 else (math.cos(base_ang), math.sin(base_ang))
            rad = rng.uniform(1.1, 2.6)
            try_add(
                ARCH_ROCKS, tx + dx_d * rad, ty + dy_d * rad, 2.4,
                rng.uniform(0.75, 1.22), rng.randrange(16), 1,
                importance=1.05, max_slope=0.62,
            )

    # ---- 2. ROAD-VERGE GRASS TUFTS (1.4 - 2.8 m hugging road shoulders, zero roadbed intrusion) ----
    road_target = int(ANCHOR_BUDGET[ARCH_GRASS] * 0.28)
    for pts in ctx['roads'].values():
        if len(pts) < 2:
            continue
        for a, b in zip(pts, pts[1:]):
            seg_len = math.hypot(b[0] - a[0], b[1] - a[1])
            if seg_len < 0.5:
                continue
            tx_v, ty_v = (b[0] - a[0]) / seg_len, (b[1] - a[1]) / seg_len
            nx_v, ny_v = -ty_v, tx_v
            steps = max(1, int(seg_len / 2.2))
            for s in range(steps):
                if len(anchors[ARCH_GRASS]) >= road_target:
                    break
                frac = (s + rng.random()) / steps
                side = rng.choice((-1.0, 1.0))
                off = rng.uniform(1.45, 2.75) * side
                px = a[0] + (b[0] - a[0]) * frac + nx_v * off
                py = a[1] + (b[1] - a[1]) * frac + ny_v * off
                try_add(
                    ARCH_GRASS, px, py, 1.15,
                    rng.uniform(0.76, 1.24), rng.randrange(16),
                    rng.choice((1, 2, 2)),
                    importance=1.10, allow_road_verge=True, max_slope=0.52,
                )

    # ---- 3. TERRACE RISERS, DRY-STONE FIELD WALLS & OUTCROP FEET ----
    # Hugging risers, walls & outcrops with wildflower clusters, grass drifts, and maquis cushions
    for (c_uv, ru, rv, _ang) in getattr(t, 'TERRACES', ()):
        rr = max(ru, rv) + 2.0
        for _ in range(900):
            uu = c_uv[0] + rng.uniform(-rr, rr)
            vv = c_uv[1] + rng.uniform(-rr, rr)
            if t.terrace_w(uu, vv) < 0.35:
                continue
            px, py = t.from_uv(uu, vv)
            _tw, tf = t.terrace_info(px, py)
            near_riser = (tf > 1.0 - t.TERRACE_RISER - 0.14) or (tf < 0.14)
            if near_riser:
                r_pick = rng.random()
                if r_pick < 0.44:
                    try_add(ARCH_GRASS, px, py, 1.35, rng.uniform(0.80, 1.30), rng.randrange(16),
                            rng.choice((2, 3)), importance=1.08, max_slope=0.55)
                elif r_pick < 0.78:
                    try_add(ARCH_FLOWERS, px, py, 1.55, rng.uniform(0.78, 1.28), rng.randrange(16),
                            rng.choice((1, 2, 3)), importance=1.05, max_slope=0.50)
                else:
                    try_add(ARCH_MAQUIS, px, py, 2.1, rng.uniform(0.75, 1.18), rng.randrange(16),
                            1, importance=1.00, max_slope=0.55)
            elif rng.random() < 0.25:
                try_add(ARCH_GRASS, px, py, 2.0, rng.uniform(0.72, 1.12), rng.randrange(16),
                        rng.choice((1, 2)), importance=0.82, max_slope=0.45)

    # Field walls (strictly outside arable crop interiors)
    for fl in getattr(t, 'FIELDS', ()):
        poly = fl['poly']
        cx_f = sum(q[0] for q in poly) / len(poly)
        cy_f = sum(q[1] for q in poly) / len(poly)
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            seg_len = math.hypot(b[0] - a[0], b[1] - a[1])
            if seg_len < 1.0:
                continue
            tx_v, ty_v = (b[0] - a[0]) / seg_len, (b[1] - a[1]) / seg_len
            nx_v, ny_v = -ty_v, tx_v
            # Point outward from field center
            mx, my = (a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5
            if (mx - cx_f) * nx_v + (my - cy_f) * ny_v < 0:
                nx_v, ny_v = -nx_v, -ny_v
            steps = max(1, int(seg_len / 2.4))
            for s in range(steps):
                frac = (s + rng.random()) / steps
                off = rng.uniform(0.7, 2.3)
                px = a[0] + (b[0] - a[0]) * frac + nx_v * off
                py = a[1] + (b[1] - a[1]) * frac + ny_v * off
                r_pick = rng.random()
                if r_pick < 0.45:
                    try_add(ARCH_FLOWERS, px, py, 1.5, rng.uniform(0.80, 1.25), rng.randrange(16),
                            rng.choice((1, 2, 2)), importance=1.02)
                elif r_pick < 0.80:
                    try_add(ARCH_GRASS, px, py, 1.4, rng.uniform(0.80, 1.30), rng.randrange(16),
                            rng.choice((2, 3)), importance=0.98)
                else:
                    try_add(ARCH_MAQUIS, px, py, 2.0, rng.uniform(0.75, 1.22), rng.randrange(16),
                            1, importance=0.95)

    # Outcrop feet (scree rocks + maquis + wildflowers)
    for (ox, oy) in outcrops_w:
        for _ in range(36):
            ang = rng.uniform(0.0, math.pi * 2.0)
            rad = rng.uniform(2.2, 10.5)
            px, py = ox + math.cos(ang) * rad, oy + math.sin(ang) * rad
            r_pick = rng.random()
            if r_pick < 0.36:
                try_add(ARCH_ROCKS, px, py, 2.0, rng.uniform(0.85, 1.42), rng.randrange(16),
                        1, importance=1.20, max_slope=0.65)
            elif r_pick < 0.68:
                try_add(ARCH_MAQUIS, px, py, 2.0, rng.uniform(0.82, 1.30), rng.randrange(16),
                        rng.choice((1, 2)), importance=1.08, max_slope=0.60)
            else:
                try_add(ARCH_GRASS, px, py, 1.4, rng.uniform(0.78, 1.25), rng.randrange(16),
                        rng.choice((1, 2)), importance=0.92, max_slope=0.58)

    # ---- 4. TOWN / QUAY / WALL EDGES (0.4 - 2.2 m outside retaining walls, civic-pad walls, terrace corners) ----
    # Terracotta planters, curb rosemary, and subtle cascading bougainvillea accents, excluding walked lanes/stairs.
    urban_candidates = []
    # Civic-pad walls
    for cv in cj.get('civic', []):
        cx, cy = cv['c']
        fx, fy = cv['face']
        tx_v, ty_v = -fy, fx
        hw, hd = cv['w'] * 0.5, cv['d'] * 0.5
        corners = [
            (cx + tx_v * a + fx * b, cy + ty_v * a + fy * b)
            for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))
        ]
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 1.0:
                continue
            ex, ey = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            nx_v, ny_v = -ey, ex
            mx, my = (a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5
            if (mx - cx) * nx_v + (my - cy) * ny_v < 0:
                nx_v, ny_v = -nx_v, -ny_v
            for k in range(max(2, int(L / 3.2))):
                frac = (k + 0.35 + rng.random() * 0.3) / max(2, int(L / 3.2))
                off = rng.uniform(0.55, 2.0)
                urban_candidates.append((a[0] + (b[0] - a[0]) * frac + nx_v * off,
                                         a[1] + (b[1] - a[1]) * frac + ny_v * off, 1.25))

    # Amphitheatre retaining wall rims & lot corners
    town = cj.get('town', {})
    ct_uv = tuple(town.get('ct_uv', t.CT))
    rings = town.get('rings', t.RINGS)
    town_th = town.get('th', t.TOWN_TH)
    for k in range(1, len(rings)):
        r0 = rings[k][0]
        th0, th1 = town_th[k]
        n_arc = max(12, int(abs(th0 - th1) * 0.9))
        for i in range(n_arc):
            th = th1 + (th0 - th1) * ((i + rng.random()) / n_arc)
            a_rad = math.radians(th)
            # Outer lip / foot hugging retaining wall (0.5 - 1.8 m clear of lane center)
            rad_off = r0 - rng.uniform(0.6, 1.9)
            px, py = t.from_uv(ct_uv[0] + math.cos(a_rad) * rad_off, ct_uv[1] + math.sin(a_rad) * rad_off)
            urban_candidates.append((px, py, 1.18))

    for lot in cj.get('lots', []):
        cx, cy = lot['c']
        fx, fy = lot['face']
        tx_v, ty_v = -fy, fx
        hw, hd = lot['w'] * 0.5, lot['d'] * 0.5
        for sa, sb in ((-1, 1), (1, 1), (-1, -1), (1, -1)):
            off_w = hw + rng.uniform(0.45, 1.65)
            off_d = hd + rng.uniform(0.45, 1.65)
            px = cx + tx_v * sa * off_w + fx * sb * off_d
            py = cy + ty_v * sa * off_w + fy * sb * off_d
            urban_candidates.append((px, py, 1.05))

    rng.shuffle(urban_candidates)
    for (px, py, imp) in urban_candidates:
        if len(anchors[ARCH_URBAN]) >= ANCHOR_BUDGET[ARCH_URBAN]:
            break
        # Require proximity to town/built walls while staying outside walked stairs/lanes/roads
        if occ_dist(px, py) > 3.2:
            continue
        try_add(
            ARCH_URBAN, px, py, 2.2,
            rng.uniform(0.78, 1.24), rng.randrange(16), 1,
            importance=imp, allow_urban_edge=True, max_slope=0.32,
        )

    # ---- 5. ISLAND-WIDE ECOLOGICAL BIOME SCATTER ----
    # Coastal wind-sheared garrigue (dcoast < 22 m, head_d < 1.15, upper dune rim beach_k in (0.05, 0.45)),
    # woodland understory fill, hillside golden-olive meadow drifts, wildflower meadows, limestone scree.
    max_iters = 240000
    for _ in range(max_iters):
        if all(len(anchors[a]) >= ANCHOR_BUDGET[a] for a in range(ARCH_COUNT)):
            break
        x = rng.uniform(ox0, ox1)
        y = rng.uniform(oy0, oy1)
        ij = grid_ij(x, y)
        if ij is None or not land_r[ij[0], ij[1]] or occ[ij[0], ij[1]]:
            continue
        if _in_protected_crop(x, y, t):
            continue

        u, v = t.to_uv(x, y)
        dc = t.dcoast(x, y)
        hd = t.head_d(u, v)
        kb, _kind = t.beach_k(x, y)
        if kb > 0.45 or dc < 1.5:
            continue

        # Natural drift clustering (meadow drifts with open ground between)
        drift = t.fbm(x, y, 0.026, 2, 63)
        if rng.random() > 0.14 + 0.86 * t.sstep(0.36, 0.64, drift):
            continue

        is_dune_rim = 0.05 < kb <= 0.45
        is_coastal = (dc < 22.0) or (hd < 1.15) or is_dune_rim

        if is_coastal:
            pick = rng.random()
            if pick < 0.28 and len(anchors[ARCH_COASTAL]) < ANCHOR_BUDGET[ARCH_COASTAL]:
                # Sea-sage agave rosette on headland, coastal rim & dune rim
                try_add(ARCH_COASTAL, x, y, 2.4, rng.uniform(0.76, 1.32), rng.randrange(16),
                        2 if rng.random() < 0.18 else 1, importance=1.12, max_slope=0.58)
            elif pick < 0.56 and len(anchors[ARCH_MAQUIS]) < ANCHOR_BUDGET[ARCH_MAQUIS]:
                # Wind-sheared coastal garrigue cushions
                try_add(ARCH_MAQUIS, x, y, 2.1, rng.uniform(0.72, 1.24), rng.randrange(16),
                        2 if rng.random() < 0.35 else 1, importance=1.08, max_slope=0.58)
            elif pick < 0.78 and len(anchors[ARCH_ROCKS]) < ANCHOR_BUDGET[ARCH_ROCKS]:
                # Coastal limestone scree
                try_add(ARCH_ROCKS, x, y, 2.5, rng.uniform(0.75, 1.36), rng.randrange(16),
                        1, importance=1.14, max_slope=0.65)
            elif len(anchors[ARCH_GRASS]) < ANCHOR_BUDGET[ARCH_GRASS]:
                # Golden coastal & dune marram tussocks
                try_add(ARCH_GRASS, x, y, 1.45, rng.uniform(0.78, 1.34), rng.randrange(16),
                        rng.choice((1, 2, 3)), importance=1.02, max_slope=0.55)
            continue

        # Inland slopes, ridges, meadows & shaded woodland flanks
        z_h = t.height(x, y)
        gx_h = (t.height(x + 1.5, y) - t.height(x - 1.5, y)) / 3.0
        gy_h = (t.height(x, y + 1.5) - t.height(x, y - 1.5)) / 3.0
        slope_est = math.hypot(gx_h, gy_h)
        near_spine = min(t.line_d(u, v, t.WEST_SPINE), t.line_d(u, v, t.EAST_SPINE)) < 26.0
        north_facing = gy_h < -0.14  # Blender +y is glTF -z (north); sloping down to north

        if (north_facing or near_spine) and len(anchors[ARCH_UNDERSTORY]) < ANCHOR_BUDGET[ARCH_UNDERSTORY] and rng.random() < 0.36:
            try_add(ARCH_UNDERSTORY, x, y, 1.9, rng.uniform(0.80, 1.28), rng.randrange(16),
                    2 if rng.random() < 0.45 else 1, importance=0.95, max_slope=0.55)
        elif slope_est > 0.24 and len(anchors[ARCH_ROCKS]) < ANCHOR_BUDGET[ARCH_ROCKS] and rng.random() < 0.34:
            try_add(ARCH_ROCKS, x, y, 2.6, rng.uniform(0.74, 1.35), rng.randrange(16),
                    1, importance=1.02, max_slope=0.66)
        elif (z_h > 14.0 or slope_est > 0.20) and len(anchors[ARCH_MAQUIS]) < ANCHOR_BUDGET[ARCH_MAQUIS] and rng.random() < 0.40:
            try_add(ARCH_MAQUIS, x, y, 2.2, rng.uniform(0.78, 1.32), rng.randrange(16),
                    2 if rng.random() < 0.35 else 1, importance=0.98, max_slope=0.58)
        elif slope_est > 0.16 and len(anchors[ARCH_COASTAL]) < ANCHOR_BUDGET[ARCH_COASTAL] and rng.random() < 0.16:
            # Sun-baked south-facing rocky ledges
            try_add(ARCH_COASTAL, x, y, 2.8, rng.uniform(0.75, 1.25), rng.randrange(16),
                    1, importance=0.90, max_slope=0.58)
        elif len(anchors[ARCH_FLOWERS]) < ANCHOR_BUDGET[ARCH_FLOWERS] and rng.random() < 0.34:
            try_add(ARCH_FLOWERS, x, y, 1.75, rng.uniform(0.78, 1.30), rng.randrange(16),
                    rng.choice((1, 2, 2, 3)), importance=0.90, max_slope=0.45)
        elif len(anchors[ARCH_GRASS]) < ANCHOR_BUDGET[ARCH_GRASS]:
            try_add(ARCH_GRASS, x, y, 1.55, rng.uniform(0.74, 1.36), rng.randrange(16),
                    rng.choice((1, 2, 2, 3)), importance=0.88, max_slope=0.52)

    return anchors


def encode_hbgc_v1(anchors_by_arch):
    """Stratify anchors into [rescue, low, medium, high], Morton-sort each stratum, and encode HBGC v1 bytes."""
    if len(anchors_by_arch) != ARCH_COUNT:
        raise ValueError(f'Expected {ARCH_COUNT} archetype lists, got {len(anchors_by_arch)}')

    all_pts = [a for lst in anchors_by_arch for a in lst]
    if all_pts:
        min_x = min(a['x'] for a in all_pts)
        min_y = min(a['y'] for a in all_pts)
        min_z = min(a['z'] for a in all_pts)
        max_x = max(a['x'] for a in all_pts)
        max_y = max(a['y'] for a in all_pts)
        max_z = max(a['z'] for a in all_pts)
        scale_x = max(max_x - min_x, 1e-3)
        scale_y = max(max_y - min_y, 1e-3)
        scale_z = max(max_z - min_z, 1e-3)
    else:
        min_x = min_y = min_z = 0.0
        scale_x = scale_y = scale_z = 1.0

    def q16(v, lo, sc):
        return int(_clamp(round(((v - lo) / sc) * 65535.0), 0, 65535))

    cum_table = []
    ordered_by_arch = []

    for ai in range(ARCH_COUNT):
        raw_list = list(anchors_by_arch[ai])
        # Higher importance anchors enter earlier strata (rescue -> low -> medium -> high)
        raw_list.sort(key=lambda a: a['score'], reverse=True)
        n = len(raw_list)
        f0, f1, f2, _f3 = STRATUM_FRACTIONS[ai]
        c0 = int(round(n * f0))
        c1 = max(c0, int(round(n * f1)))
        c2 = max(c1, int(round(n * f2)))
        c3 = n
        cum_table.append((c0, c1, c2, c3))

        slices = (raw_list[0:c0], raw_list[c0:c1], raw_list[c1:c2], raw_list[c2:c3])
        ordered = []
        for sl in slices:
            quantized = []
            for a in sl:
                qx = q16(a['x'], min_x, scale_x)
                qy = q16(a['y'], min_y, scale_y)
                qz = q16(a['z'], min_z, scale_z)
                quantized.append((
                    _morton2d(qx, qz),
                    qx, qy, qz,
                    _pack_rgb565(a['r'], a['g'], a['b']),
                    int(_clamp(round(a['nx'] * 127.0), -127, 127)) & 0xff,
                    int(_clamp(round(a['nz'] * 127.0), -127, 127)) & 0xff,
                    _pack_props(a['yaw'], a['scale'], a['variant'], a['cluster']),
                ))
            quantized.sort(key=lambda item: item[0])
            ordered.extend(quantized)
        ordered_by_arch.append(ordered)

    # Assemble header (32 B) + archetype cumulative table (56 B) + planar SoA streams (12 B/anchor)
    chunks = [
        struct.pack(
            '<4sHH6f',
            HBGC_MAGIC, HBGC_VERSION, ARCH_COUNT,
            min_x, min_y, min_z, scale_x, scale_y, scale_z,
        )
    ]
    for (c0, c1, c2, c3) in cum_table:
        chunks.append(struct.pack('<4H', c0, c1, c2, c3))

    for ordered in ordered_by_arch:
        n = len(ordered)
        if n == 0:
            continue
        dx_lo = bytearray(n); dx_hi = bytearray(n)
        dz_lo = bytearray(n); dz_hi = bytearray(n)
        dy_lo = bytearray(n); dy_hi = bytearray(n)
        rgb_lo = bytearray(n); rgb_hi = bytearray(n)
        nx_s = bytearray(n); nz_s = bytearray(n)
        pr_lo = bytearray(n); pr_hi = bytearray(n)

        px = pz = py = prgb = pnx = pnz = 0
        for i, (_m, qx, qy, qz, rgb565, nx_b, nz_b, props) in enumerate(ordered):
            dx = _zigzag16((qx - px) & 0xffff); px = qx
            dz = _zigzag16((qz - pz) & 0xffff); pz = qz
            dy = _zigzag16((qy - py) & 0xffff); py = qy
            dr = _zigzag16((rgb565 - prgb) & 0xffff); prgb = rgb565
            dnx = _zigzag8((nx_b - pnx) & 0xff); pnx = nx_b
            dnz = _zigzag8((nz_b - pnz) & 0xff); pnz = nz_b

            dx_lo[i] = dx & 0xff; dx_hi[i] = (dx >> 8) & 0xff
            dz_lo[i] = dz & 0xff; dz_hi[i] = (dz >> 8) & 0xff
            dy_lo[i] = dy & 0xff; dy_hi[i] = (dy >> 8) & 0xff
            rgb_lo[i] = dr & 0xff; rgb_hi[i] = (dr >> 8) & 0xff
            nx_s[i] = dnx
            nz_s[i] = dnz
            pr_lo[i] = props & 0xff; pr_hi[i] = (props >> 8) & 0xff

        chunks.extend((dx_lo, dx_hi, dz_lo, dz_hi, dy_lo, dy_hi, rgb_lo, rgb_hi, nx_s, nz_s, pr_lo, pr_hi))

    return b''.join(chunks), cum_table


def export_groundcover(out_path=None, exec_globals=None, seed=4041):
    """Run ecological ground-cover placement and write `groundcover.bin`."""
    t0 = time.time()
    out_file = out_path or os.path.join(_ROOT, 'public/harbour/groundcover.bin')
    os.makedirs(os.path.dirname(os.path.abspath(out_file)), exist_ok=True)

    if exec_globals is not None and 'OCC' in exec_globals and 'CJ' in exec_globals and 'terrain' in exec_globals:
        ctx = _extract_exec_context(exec_globals)
        mode = 'build_island'
    else:
        ctx = _load_standalone_context(_ROOT)
        mode = 'standalone'

    anchors = generate_groundcover_anchors(ctx, seed=seed)
    payload, cum_table = encode_hbgc_v1(anchors)
    with open(out_file, 'wb') as f:
        f.write(payload)

    total_anchors = sum(len(lst) for lst in anchors)
    total_expanded = sum(a['cluster'] for lst in anchors for a in lst)
    rescue_a = sum(c[0] for c in cum_table)
    low_a = sum(c[1] for c in cum_table)
    med_a = sum(c[2] for c in cum_table)
    counts_str = ', '.join(f'{ARCH_NAMES[i]}={len(anchors[i])}' for i in range(ARCH_COUNT))
    print(
        f'GROUNDCOVER ({mode}) -> {out_file} ({len(payload)} B raw, '
        f'{total_anchors} anchors -> {total_expanded} insts, '
        f'strata {rescue_a}/{low_a}/{med_a}/{total_anchors}, '
        f'{round(time.time() - t0, 2)} s) [{counts_str}]'
    )
    return out_file, payload, cum_table


def _parse_cli_out(argv):
    args = argv[argv.index('--') + 1:] if '--' in argv else argv[1:]
    if '--out' in args:
        idx = args.index('--out')
        if idx + 1 < len(args):
            return args[idx + 1]
    return None


# Support BOTH exec() inside build_island.py and direct CLI execution via Blender or Python 3
if 'OCC' in globals() and 'CJ' in globals() and 'terrain' in globals() and 'ROOT' in globals():
    export_groundcover(out_path=os.path.join(globals()['ROOT'], 'public/harbour/groundcover.bin'), exec_globals=globals())
elif __name__ == '__main__':
    export_groundcover(out_path=_parse_cli_out(sys.argv))
