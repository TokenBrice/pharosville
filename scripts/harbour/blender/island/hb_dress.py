"""The Harbour v3 - dressing: roads (the winding road to the Pharos, the coast road over the south ridge), walled
meadows and vine rows, vegetation (umbrella pines and cypresses on the spines and behind the amphitheatre, olives, figs
and pomegranates in the town gardens, planes and almonds, maquis + headland garrigue, rock outcrops), quay life along the curved quays (lamps, bunting, stalls,
crates, nets, cranes), hamlet characters, skerries, the Shoals, buoys, the Far Ports rafts, folk, gulls, the mainland.
exec'd into build_island's namespace (after land + town)."""
import struct
from PIL import Image, ImageDraw

DRNG = random.Random(909)
set_coll(collection('dress', ROOTC))
COVES = {c['pid']: c for c in CJ['coves']}

# ------------------------------------------------------------------ Exact HBVG v1 vegetation instance binary contract
# Header (16 B): struct.pack('<4sHHII', b'HBVG', 1, 18, len(records), 0)
# Record (20 B, glTF Y-up: x_g=x_bl, y_g=z_bl, z_g=-y_bl):
#   struct.pack('<3fH6B', x_g, y_g, z_g, yaw_u16, scaleXZ_u8, scaleY_u8, proto_id, seed_u8, luma_u8, sway_u8)
VEG_PROTOS = (
    ('pine_broad',        10.6),  # 0
    ('pine_tiered',       11.2),  # 1
    ('pine_sheared',       9.2),  # 2
    ('pine_young',         6.5),  # 3
    ('cypress_tall',      11.8),  # 4
    ('cypress_column',     9.6),  # 5
    ('cypress_sanctuary', 12.4),  # 6
    ('olive_ancient',      5.3),  # 7
    ('olive_terrace',      4.3),  # 8
    ('olive_young',        3.6),  # 9
    ('plane_tall',        12.7),  # 10
    ('plane_broad',       10.4),  # 11
    ('almond_spread',      6.5),  # 12
    ('almond_young',       4.8),  # 13
    ('fig_broad',          5.1),  # 14
    ('pomegranate_multi',  4.2),  # 15
    ('vine_row_short',     1.6),  # 16 (2.4 m modular length)
    ('vine_row_long',      1.6),  # 17 (4.8 m modular length)
)
VEG_PROTO_ID = {nm: idx for idx, (nm, _h) in enumerate(VEG_PROTOS)}
VEG_NOM_H = {nm: h for nm, h in VEG_PROTOS}
VEG_INSTANCES = []          # [(proto_id, x_bl, y_bl, z_bl, yaw_rad, scale_xz, scale_y, seed_u8, luma_u8, sway_u8)]
VEG_COUNTS = {nm: 0 for nm, _h in VEG_PROTOS}


def _enc_scale_u8(s):
    return max(0, min(255, int(round((s - 0.35) / 1.45 * 255.0))))


def emit_veg(proto_name, x, y, z, yaw_rad, scale_xz, scale_y, rng, luma_sigma=26.0):
    pid = VEG_PROTO_ID[proto_name]
    sxz = max(0.35, min(1.80, float(scale_xz)))
    sy = max(0.35, min(1.80, float(scale_y)))
    seed_u8 = int(terrain._hash(int(round(x * 13.0)), int(round(y * 13.0)), pid + 17) * 255.0) & 0xFF
    luma_u8 = max(46, min(210, int(round(128.0 + rng.gauss(0.0, luma_sigma)))))
    sway_u8 = max(88, min(168, int(round(128.0 + rng.gauss(0.0, 18.0)))))
    VEG_INSTANCES.append((pid, float(x), float(y), float(z), float(yaw_rad), sxz, sy, seed_u8, luma_u8, sway_u8))
    VEG_COUNTS[proto_name] += 1


def write_veg_instances_bin():
    out_dir = os.path.join(ROOT, 'public/harbour/flora')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'vegetation-instances.bin')
    two_pi = 2.0 * math.pi
    buf = bytearray(struct.pack('<4sHHII', b'HBVG', 1, 18, len(VEG_INSTANCES), 0))
    for (pid, x_bl, y_bl, z_bl, yaw_rad, sxz, sy, seed_u8, luma_u8, sway_u8) in VEG_INSTANCES:
        yaw_u16 = int(((yaw_rad % two_pi) / two_pi) * 65535.0) & 0xFFFF
        buf.extend(struct.pack(
            '<3fH6B',
            x_bl, z_bl, -y_bl,
            yaw_u16, _enc_scale_u8(sxz), _enc_scale_u8(sy),
            pid, seed_u8, luma_u8, sway_u8,
        ))
    with open(out_path, 'wb') as fh:
        fh.write(buf)
    print(f'HBVG v1 written: {out_path} ({len(VEG_INSTANCES)} instances, {len(buf)} bytes)')
    print('HBVG per-proto:', {k: v for k, v in VEG_COUNTS.items() if v > 0})
    return out_path

# ------------------------------------------------------------------ occupancy raster (1 m): where nothing may grow
_xs = [p[0] for p in COAST]; _ys = [p[1] for p in COAST]
OX0, OY0, OX1, OY1 = min(_xs) - 10, min(_ys) - 10, max(_xs) + 10, max(_ys) + 10
OS = 1.0
OW, OH = int((OX1 - OX0) / OS), int((OY1 - OY0) / OS)
occ_im = Image.new('L', (OW, OH), 0); od = ImageDraw.Draw(occ_im)
o_to = lambda x, y: ((x - OX0) / OS, (OY1 - y) / OS)


def occ_poly(poly):
    od.polygon([o_to(*p) for p in poly], fill=255)


def lot_rect(lot, pad_w=1.5, pad_d=2.0):
    f = Vector((lot['face'][0], lot['face'][1])); s_ = Vector((-f.y, f.x)); c = Vector(lot['c'])
    w, d = lot['w'] / 2 + pad_w, lot['d'] / 2 + pad_d
    return [tuple(c + s_ * a + f * b) for a, b in ((-w, -d), (w, -d), (w, d + 0.6), (-w, d + 0.6))]


for lot in CJ['lots']:
    occ_poly(lot_rect(lot))
for k, L in CJ['landmarks'].items():
    if k in ('shoals', 'wreck_cove', 'far_ports', 'breakwater') or k.startswith('hamlet'):
        continue
    r = L['fp'] / 2 + 3
    occ_poly([(L['p'][0] - r, L['p'][1] - r), (L['p'][0] + r, L['p'][1] - r), (L['p'][0] + r, L['p'][1] + r), (L['p'][0] - r, L['p'][1] + r)])
for cv in CJ.get('civic', []):                                 # P6: the civic plots (+ a lane round each) stay clear
    occ_poly(plot_rect(cv, 2.5))
for fl in CJ.get('flats', []):                                 # integration G2: the battery platform
    occ_poly(fl['poly'])
# integration G2: buildings that must read from the runtime views (all presets look from yaw 45 at ~26 deg pitch) keep a
# forecourt, and no tree on the camera side may stand tall enough (~14 m crown top) to cover the building's middle
_CAMD = Vector((math.sqrt(0.5), -math.sqrt(0.5)))
for cv in CJ.get('civic', []):
    if cv['id'] not in ('harbour-office-tron', 'harbourmaster', 'stormstation'):
        continue
    c_ = Vector(cv['c']); f_ = Vector(cv['face']); half = max(cv['w'], cv['d']) / 2
    occ_poly([tuple(c_ + Vector((-f_.y, f_.x)) * a + f_ * b) for a, b in ((-cv['w'] / 2, cv['d'] / 2), (cv['w'] / 2, cv['d'] / 2),
                                                                         (cv['w'] / 2, cv['d'] / 2 + 12.0), (-cv['w'] / 2, cv['d'] / 2 + 12.0))])
    for yy in np.arange(c_.y - 80.0, c_.y + 10.0, OS):
        for xx in np.arange(c_.x - 10.0, c_.x + 80.0, OS):
            v_ = Vector((xx, yy)) - c_
            al = v_.dot(_CAMD); lat = abs(v_.x * _CAMD.y - v_.y * _CAMD.x)
            if 0.0 < al < 85.0 and lat < half + 4.0 and terrain.height(xx, yy) + 14.0 > cv['z'] + 3.0 + 0.49 * max(0.0, al - half):
                od.point(o_to(xx, yy), fill=255)
for name, L in QL.items():                                     # quay aprons
    depth = APRON.get(name, 3.0 if name.endswith(('-w', '-e')) else 7.0) + 1.5
    for a, b in zip(L, L[1:]):
        t = Vector(b) - Vector(a)
        if t.length < 1e-3:
            continue
        t.normalize(); nl = Vector((-t.y, t.x))
        occ_poly([a, b, tuple(Vector(b) + nl * depth), tuple(Vector(a) + nl * depth)])
for (k, pts, z) in LANES:                                       # terrace lanes + walls
    for a, b in zip(pts, pts[1:]):
        od.line([o_to(*a), o_to(*b)], fill=255, width=7)
for (th, band, p0, radial, run) in STAIRS:
    a = p0 - radial * 1.0; b = p0 + radial * (run + 2.0)
    od.line([o_to(a.x, a.y), o_to(b.x, b.y)], fill=255, width=5)
# the Customs square
for th in range(70, 112, 3):
    od.line([o_to(*town_pt(th, TOWN['r_quay'] + 6)), o_to(*town_pt(th, TOWN['r_quay'] + 31))], fill=255, width=5)
# the strands stay open (no trees, walls or meadow clutter on a beach)
for _b in CJ.get('beaches', []):
    _bx = [p[0] for p in _b['line']]; _by = [p[1] for p in _b['line']]; _m = _b['depth'] + 20.0
    for _yy in np.arange(min(_by) - _m, max(_by) + _m, 1.0):
        for _xx in np.arange(min(_bx) - _m, max(_bx) + _m, 1.0):
            if terrain.beach_k(_xx, _yy)[0] > 0.3:
                od.point(o_to(_xx, _yy), fill=255)
OCC = np.array(occ_im) > 0


def occupied(x, y):
    i, j = int((OY1 - y) / OS), int((x - OX0) / OS)
    if not (0 <= i < OH and 0 <= j < OW):
        return True
    return bool(OCC[i, j])


def on_land(x, y):
    return point_in_poly(x, y, COAST) and not occupied(x, y)


AGRI = []           # 08-T1: extra cultivated plots (world polygons): the vineyard, the threshing floor, the temenos


def in_crop(x, y):
    f = terrain.field_at(x, y)
    if f is not None and f['kind'] in ('hay', 'plough'):
        return True
    if terrain.terrace_w(*uvp(x, y)) > 0.25:
        return True
    return any(point_in_poly(x, y, P_) for P_ in AGRI)


def refresh_occ():
    global OCC
    OCC = np.array(occ_im) > 0


# ------------------------------------------------------------------ ROADS: flush in land_terrain (no floating ribbon slabs!)
import geom as _G
catmull = _G.catmull
ROADS = {}
for (_rname, _rkind, _dense_uv, _zs, _hw, _cut_m, _bb) in terrain._roads:
    _pts_w = [wpt(*p) for p in _dense_uv]
    _run = []
    _out = []
    for _i, _p in enumerate(_pts_w):
        if point_in_poly(*_p, COAST):
            _run.append(_p)
            if len(_run) > 1:
                od.line([o_to(*_run[-2]), o_to(*_run[-1])], fill=255, width=max(3, int(round(_hw * 2.0 + 2.6))))
            if _i % 2 == 0:
                _out.append(_p)
        else:
            _run = []
    if _rname in ('pharos', 'west', 'south', 'east', 'shrine', 'quarry', 'east_ridge') and len(_out) >= 2:
        ROADS[_rname] = _out
# Stamp ancient stepped limestone quarry floor & cut benches into occupancy so trees never sprout inside quarry faces
for _qv in np.arange(terrain.QUARRY_UV[1] - terrain.QUARRY_RV - 2.0, terrain.QUARRY_UV[1] + terrain.QUARRY_RV + 2.0, 1.0):
    for _qu in np.arange(terrain.QUARRY_UV[0] - terrain.QUARRY_RU - 2.0, terrain.QUARRY_UV[0] + terrain.QUARRY_RU + 2.0, 1.0):
        if terrain.quarry_w(float(_qu), float(_qv)) > 0.35:
            od.point(o_to(*wpt(float(_qu), float(_qv))), fill=255)
refresh_occ()

# ------------------------------------------------------------------ Phase 3: Cultivated Ptolemaic Hinterland
# Continuous chained battered dry-stone olive terraces + built stone terrace stair flights across West, East & South;
# curved contour vineyard emitting modular HBVG vine_row_short / vine_row_long + perimeter wall & oak-limestone pergola;
# cohesive Windmill & Threshing Floor (aloni) apron with limestone cistern; restrained Ptolemaic micro-storytelling.
T1RNG = random.Random(4108)
lips = bmesh.new()          # battered dry-stone terrace retaining walls
lips_cope = bmesh.new()     # pale Alexandrian limestone coping cap along terrace walls
t_stairs = bmesh.new()      # built 1.8 m stone stair flights climbing through terrace tiers


def iso_segments_fn(cuv, rr, weight_fn, level_of, levels, step=1.4, wmin=0.55):
    """Marching squares over a contoured hillside (natural heights): [(level index, (x0, y0), (x1, y1))]."""
    corners = [wpt(cuv[0] + a * rr, cuv[1] + b * rr) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    X0, X1 = min(c[0] for c in corners), max(c[0] for c in corners)
    Y0, Y1 = min(c[1] for c in corners), max(c[1] for c in corners)
    nx_, ny_ = int((X1 - X0) / step) + 2, int((Y1 - Y0) / step) + 2
    G = np.zeros((ny_, nx_)); IN = np.zeros((ny_, nx_), bool)
    for j in range(ny_):
        for i in range(nx_):
            x, y = X0 + i * step, Y0 + j * step
            IN[j, i] = weight_fn(*uvp(x, y)) > 0.0
            G[j, i] = terrain.height(x, y, terraces=False, roads=False) if IN[j, i] else -99.0
    out = []
    for j in range(ny_ - 1):
        for i in range(nx_ - 1):
            if not (IN[j, i] and IN[j, i + 1] and IN[j + 1, i] and IN[j + 1, i + 1]):
                continue
            c4 = [(X0 + i * step, Y0 + j * step, G[j, i]), (X0 + (i + 1) * step, Y0 + j * step, G[j, i + 1]),
                  (X0 + (i + 1) * step, Y0 + (j + 1) * step, G[j + 1, i + 1]), (X0 + i * step, Y0 + (j + 1) * step, G[j + 1, i])]
            lo_, hi_ = min(q[2] for q in c4), max(q[2] for q in c4)
            for k in levels:
                L = level_of(k)
                if not (lo_ < L < hi_):
                    continue
                cr = []
                for a, b in zip(c4, c4[1:] + c4[:1]):
                    if (a[2] - L) * (b[2] - L) < 0:
                        t = (L - a[2]) / (b[2] - a[2])
                        cr.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
                for q in range(0, len(cr) - 1, 2):
                    m = ((cr[q][0] + cr[q + 1][0]) / 2, (cr[q][1] + cr[q + 1][1]) / 2)
                    if weight_fn(*uvp(*m)) >= wmin:
                        out.append((k, cr[q], cr[q + 1]))
    return out


def iso_segments(cuv, rr, level_of, levels, step=1.4, wmin=0.55):
    return iso_segments_fn(cuv, rr, terrain.terrace_w, level_of, levels, step=step, wmin=wmin)


def _chain_iso_segments(segs, snap=0.14):
    """Chain unordered marching-squares (k, a, b) segments into smooth continuous contour polylines [(k, pts)]."""
    by_k = {}
    for (k, a, b) in segs:
        if (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 > 1e-4:
            by_k.setdefault(k, []).append((a, b))
    chains = []
    for k, seg_list in by_k.items():
        # Quantized adjacency map for O(N) chaining
        qpt = lambda p: (int(round(p[0] / snap)), int(round(p[1] / snap)))
        adj = {}
        for idx, (a, b) in enumerate(seg_list):
            adj.setdefault(qpt(a), []).append((idx, 0))
            adj.setdefault(qpt(b), []).append((idx, 1))
        used = [False] * len(seg_list)
        for idx in range(len(seg_list)):
            if used[idx]:
                continue
            used[idx] = True
            a0, b0 = seg_list[idx]
            poly = [a0, b0]
            # Extend forward from poly[-1], then backward from poly[0]
            for rev in (False, True):
                if rev:
                    poly.reverse()
                while True:
                    tip = poly[-1]
                    qt = qpt(tip)
                    nxt = None
                    for di in (-1, 0, 1):
                        for dj in (-1, 0, 1):
                            for (si, end_i) in adj.get((qt[0] + di, qt[1] + dj), ()):
                                if used[si]:
                                    continue
                                sa, sb = seg_list[si]
                                cand = sa if end_i == 0 else sb
                                if (cand[0] - tip[0]) ** 2 + (cand[1] - tip[1]) ** 2 <= (snap * 1.5) ** 2:
                                    nxt = (si, sb if end_i == 0 else sa)
                                    break
                            if nxt is not None:
                                break
                        if nxt is not None:
                            break
                    if nxt is None:
                        break
                    used[nxt[0]] = True
                    poly.append(nxt[1])
            if len(poly) >= 2:
                # One light smoothing pass keeping endpoints intact, then resample to ~2.1 m steps
                if len(poly) >= 3:
                    sm = [poly[0]]
                    for i_ in range(1, len(poly) - 1):
                        sm.append((
                            0.25 * poly[i_ - 1][0] + 0.5 * poly[i_][0] + 0.25 * poly[i_ + 1][0],
                            0.25 * poly[i_ - 1][1] + 0.5 * poly[i_][1] + 0.25 * poly[i_ + 1][1],
                        ))
                    sm.append(poly[-1])
                    poly = sm
                res = [poly[0]]
                acc = 0.0
                for i_ in range(1, len(poly)):
                    ax, ay = res[-1]; bx, by = poly[i_]
                    d_ = math.hypot(bx - ax, by - ay)
                    if d_ >= 2.0 or i_ == len(poly) - 1:
                        if d_ >= 0.45:
                            res.append((bx, by))
                if len(res) >= 2:
                    chains.append((k, res))
    return chains


def bm_battered_wall(bm_wall, bm_cope, pts, w_bot=0.76, w_top=0.45, h_above=0.22, sink=0.55, max_exposed=1.55):
    """Extrude a continuous battered dry-stone retaining wall + pale limestone coping cap along contour polyline `pts`."""
    n_p = len(pts)
    if n_p < 2:
        return
    # Consistent downhill normal across the whole polyline run
    mid = pts[n_p // 2]
    a_m, b_m = pts[max(0, n_p // 2 - 1)], pts[min(n_p - 1, n_p // 2 + 1)]
    tx, ty = b_m[0] - a_m[0], b_m[1] - a_m[1]
    tl = math.hypot(tx, ty) or 1.0
    dn_sign = 1.0 if H(mid[0] - ty / tl * 1.2, mid[1] + tx / tl * 1.2) < H(mid[0] + ty / tl * 1.2, mid[1] - tx / tl * 1.2) else -1.0

    rings = []
    cope_rings = []
    for i, p in enumerate(pts):
        pa = pts[max(0, i - 1)]; pb = pts[min(n_p - 1, i + 1)]
        dx, dy = pb[0] - pa[0], pb[1] - pa[1]
        dl = math.hypot(dx, dy) or 1.0
        nx, ny = (-dy / dl) * dn_sign, (dx / dl) * dn_sign    # points downhill
        zc = H(p[0], p[1])
        z_up = H(p[0] - nx * 0.65, p[1] - ny * 0.65)
        z_dn = H(p[0] + nx * 0.75, p[1] + ny * 0.75)
        z_top = max(zc, z_up) + h_above
        z_bot = min(zc, z_dn) - sink
        if z_top - z_dn > max_exposed:
            z_top = z_dn + max_exposed
        if z_top - z_bot < 0.75:
            z_top = z_bot + 0.75
        hb, ht = w_bot * 0.5, w_top * 0.5
        # 4 cross-section vertices: front-bot, front-top, back-top, back-bot
        v0 = bm_wall.verts.new((p[0] + nx * hb, p[1] + ny * hb, z_bot))
        v1 = bm_wall.verts.new((p[0] + nx * ht, p[1] + ny * ht, z_top))
        v2 = bm_wall.verts.new((p[0] - nx * ht, p[1] - ny * ht, z_top))
        v3 = bm_wall.verts.new((p[0] - nx * hb, p[1] - ny * hb, z_bot))
        rings.append((v0, v1, v2, v3))
        if bm_cope is not None:
            hc = max(ht + 0.075, 0.30)      # widened 0.58-0.60 m limestone coping flag
            c0 = bm_cope.verts.new((p[0] + nx * hc, p[1] + ny * hc, z_top - 0.02))
            c1 = bm_cope.verts.new((p[0] + nx * hc, p[1] + ny * hc, z_top + 0.15))
            c2 = bm_cope.verts.new((p[0] - nx * hc, p[1] - ny * hc, z_top + 0.15))
            c3 = bm_cope.verts.new((p[0] - nx * hc, p[1] - ny * hc, z_top - 0.02))
            cope_rings.append((c0, c1, c2, c3))
    for i in range(n_p - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(4):
            sn = (s + 1) % 4
            bm_wall.faces.new((r0[s], r1[s], r1[sn], r0[sn]))
        if bm_cope is not None:
            c0, c1 = cope_rings[i], cope_rings[i + 1]
            for s in range(4):
                sn = (s + 1) % 4
                bm_cope.faces.new((c0[s], c1[s], c1[sn], c0[sn]))
    # Cap both ends cleanly
    bm_wall.faces.new((rings[0][3], rings[0][2], rings[0][1], rings[0][0]))
    bm_wall.faces.new((rings[-1][0], rings[-1][1], rings[-1][2], rings[-1][3]))
    if bm_cope is not None:
        bm_cope.faces.new((cope_rings[0][3], cope_rings[0][2], cope_rings[0][1], cope_rings[0][0]))
        bm_cope.faces.new((cope_rings[-1][0], cope_rings[-1][1], cope_rings[-1][2], cope_rings[-1][3]))


# Built 1.8 m limestone stair flights climbing through the West & East olive terrace tiers
TERRACE_STAIR_CORRIDORS = []
TERRACE_STAIR_HEADS = []        # [(head_xy, dir_xy, side_xy)] for flanking cypress_column accents
for (_st_uv, _st_len) in (((-156.0, -98.0), 22.0), ((-164.0, -48.0), 20.0), ((205.0, -126.0), 19.0)):
    _sx, _sy = wpt(*_st_uv)
    # Climb straight uphill along local natural gradient
    _gx = terrain.height(_sx + 2.0, _sy, terraces=False, roads=False) - terrain.height(_sx - 2.0, _sy, terraces=False, roads=False)
    _gy = terrain.height(_sx, _sy + 2.0, terraces=False, roads=False) - terrain.height(_sx, _sy - 2.0, terraces=False, roads=False)
    _gl = math.hypot(_gx, _gy)
    if _gl < 0.15:
        continue
    _dir = Vector((_gx / _gl, _gy / _gl))
    _side = Vector((-_dir.y, _dir.x))
    _p0 = Vector((_sx, _sy)) - _dir * (_st_len * 0.5)
    _p1 = Vector((_sx, _sy)) + _dir * (_st_len * 0.5)
    _n_steps = max(8, int(_st_len / 0.42))
    _cor_pts = []
    for _k in range(_n_steps):
        _q = _p0.lerp(_p1, (_k + 0.5) / _n_steps)
        if not point_in_poly(_q.x, _q.y, COAST) or occupied(_q.x, _q.y):
            continue
        _zq = H(_q.x, _q.y)
        merge(t_stairs, nl_kit.obox((_q.x, _q.y, _zq - 0.12), (_dir.x, _dir.y, 0.0), 0.46, 1.85, 0.34))
        for _sgn in (-1.0, 1.0):
            _ck = _q + _side * _sgn * 1.04
            merge(t_stairs, nl_kit.obox((_ck.x, _ck.y, _zq + 0.05), (_dir.x, _dir.y, 0.0), 0.48, 0.24, 0.58))
        _cor_pts.append((_q.x, _q.y))
    if len(_cor_pts) >= 4:
        TERRACE_STAIR_CORRIDORS.append((_cor_pts[0], _cor_pts[-1]))
        TERRACE_STAIR_HEADS.append((_cor_pts[-1], (_dir.x, _dir.y), (_side.x, _side.y)))
        od.line([o_to(*_cor_pts[0]), o_to(*_cor_pts[-1])], fill=255, width=4)


def _near_terrace_stair(x, y):
    for (a, b) in TERRACE_STAIR_CORRIDORS:
        if seg_d((x, y), a, b) < 2.6:
            return True
    return False


TERRACE_OLIVES = []             # [(x, y, k, is_end)]
_wall_runs = 0
for _ti, (c_, ru_, rv_, a_) in enumerate(terrain.TERRACES):
    rr_ = max(ru_, rv_) + 1.0
    ks = range(int(1.5 / terrain.TERRACE_STEP), int(30.0 / terrain.TERRACE_STEP))
    risers_ = iso_segments(c_, rr_, lambda k: k * terrain.TERRACE_STEP, ks, step=1.4, wmin=0.48)
    # Curated Aegean orchard: plant olives on EVERY OTHER bench (alternating parity per zone),
    # 8.5 m in-row contour spacing +/- 1.0 m jitter, quincunx half-step offset between planted rows,
    # and skip 15-20% of slots where low-frequency noise > 0.62 to open sunlit grass clearings!
    ks_planted = [k for k in ks if (k % 2) == (_ti % 2)]
    bench_segs = iso_segments(c_, rr_, lambda k: (k + 0.48) * terrain.TERRACE_STEP, ks_planted, step=1.4, wmin=0.50)
    for (k, chain) in _chain_iso_segments(bench_segs, snap=0.14):
        cum_ = [0.0]
        for i_ in range(len(chain) - 1):
            cum_.append(cum_[-1] + math.hypot(chain[i_ + 1][0] - chain[i_][0], chain[i_ + 1][1] - chain[i_][1]))
        L_ch = cum_[-1]
        if L_ch < 3.6:
            continue

        def _sample_ch(s_):
            for i_ in range(len(cum_) - 1):
                if cum_[i_ + 1] >= s_ or i_ == len(cum_) - 2:
                    dl_ = max(1e-6, cum_[i_ + 1] - cum_[i_])
                    t_ = max(0.0, min(1.0, (s_ - cum_[i_]) / dl_))
                    return (
                        chain[i_][0] + (chain[i_ + 1][0] - chain[i_][0]) * t_,
                        chain[i_][1] + (chain[i_ + 1][1] - chain[i_][1]) * t_,
                    )
            return chain[-1]

        row_idx = (k - (_ti % 2)) // 2
        spacing_ = 8.5
        s_cur = 1.6 + (spacing_ * 0.5 if (row_idx % 2 == 1) else 0.0)
        if s_cur > L_ch - 1.5:
            s_cur = L_ch * 0.5
        row_pts = []
        while s_cur <= L_ch - 1.2:
            s_jit = max(0.8, min(L_ch - 0.8, s_cur + T1RNG.uniform(-1.0, 1.0)))
            x, y = _sample_ch(s_jit)
            s_cur += spacing_
            # Low-frequency clearing noise (> 0.62 skips ~15-20% of slots for natural sunlit clearings)
            clear_n = terrain.fbm(x, y, 0.022, 2, 83) * 0.55 + terrain.vnoise(x, y, 0.016, 91) * 0.45
            if clear_n > 0.62:
                continue
            rq_o = terrain.road_info(x, y)
            if (not on_land(x, y) or _near_terrace_stair(x, y)
                    or (rq_o is not None and rq_o[0] < rq_o[1] + 2.2)
                    or any((x - q[0]) ** 2 + (y - q[1]) ** 2 < (8.2 if k == q[2] else 5.0) ** 2 for q in TERRACE_OLIVES)):
                continue
            row_pts.append([x, y, k, False])
        if row_pts:
            row_pts[0][3] = True
            if len(row_pts) >= 2:
                row_pts[-1][3] = True
            TERRACE_OLIVES.extend(tuple(r_) for r_ in row_pts)
    # Continuous chained battered dry-stone retaining walls along every riser contour (broken cleanly at roads/olives/stairs)
    for (k, chain) in _chain_iso_segments(risers_):
        sub = []
        for p_ in chain:
            rq_ = terrain.road_info(p_[0], p_[1])
            near_road = rq_ is not None and rq_[0] < rq_[1] + 2.2
            near_olive = any((p_[0] - q[0]) ** 2 + (p_[1] - q[1]) ** 2 < 1.40 ** 2 for q in TERRACE_OLIVES)
            ok_ = on_land(*p_) and not near_road and not near_olive and not _near_terrace_stair(*p_)
            if ok_:
                sub.append(p_)
            else:
                if len(sub) >= 2:
                    bm_battered_wall(lips, lips_cope, sub)
                    od.line([o_to(*q) for q in sub], fill=255, width=2)
                    _wall_runs += 1
                sub = []
        if len(sub) >= 2:
            bm_battered_wall(lips, lips_cope, sub)
            od.line([o_to(*q) for q in sub], fill=255, width=2)
            _wall_runs += 1
print('TERRACES wall runs', _wall_runs, 'olive spots', len(TERRACE_OLIVES))

# Reworked curved contour vineyard: emit modular vine_row_long (4.8 m) & vine_row_short (2.4 m) into HBVG v1!
vc_, VD, VA, VINEYARD = terrain.vineyard()
VD, VA = Vector(VD), Vector(VA)
VINE_HALF = terrain.VINE_HALF
pergola_stone, pergola_wood = bmesh.new(), bmesh.new()

# Rustic oak-and-limestone pergola arbor (4.5 x 3.5 m, h = 2.6 m) at the uphill edge of the vineyard
_perg_c = Vector(vc_) - VD * (terrain.VINE_RU * 0.62) + VA * 4.0
if point_in_poly(_perg_c.x, _perg_c.y, COAST) and not occupied(_perg_c.x, _perg_c.y):
    _pz = H(_perg_c.x, _perg_c.y)
    _pang = math.atan2(VA.y, VA.x)
    _ps, _pw = bmesh.new(), bmesh.new()
    for _lx in (-2.1, 0.0, 2.1):
        for _ly in (-1.6, 1.6):
            merge(_ps, bm_box2(_lx - 0.24, _ly - 0.24, -0.5, _lx + 0.24, _ly + 0.24, 0.45))
            merge(_pw, bm_box2(_lx - 0.09, _ly - 0.09, 0.42, _lx + 0.09, _ly + 0.09, 2.48))
    for _ly in (-1.6, 1.6):
        merge(_pw, bm_box2(-2.35, _ly - 0.11, 2.42, 2.35, _ly + 0.11, 2.60))
    for _k in range(7):
        _rx = -2.2 + _k * (4.4 / 6.0)
        merge(_pw, bm_box2(_rx - 0.06, -1.85, 2.52, _rx + 0.06, 1.85, 2.64))
    xf(_ps, rz=_pang); xf(_ps, loc=(_perg_c.x, _perg_c.y, _pz))
    xf(_pw, rz=_pang); xf(_pw, loc=(_perg_c.x, _perg_c.y, _pz))
    merge(pergola_stone, _ps); merge(pergola_wood, _pw)
    _p_poly = [tuple(_perg_c + VA * a + VD * b) for a, b in ((-2.8, -2.2), (2.8, -2.2), (2.8, 2.2), (-2.8, 2.2))]
    occ_poly(_p_poly)

# Low dry-stone perimeter wall framing the curved vineyard (leaving an uphill gateway beside the pergola)
_vw_pts = VINEYARD + VINEYARD[:1]
for _ei, (_a, _b) in enumerate(zip(_vw_pts, _vw_pts[1:])):
    _pm = ((_a[0] + _b[0]) * 0.5, (_a[1] + _b[1]) * 0.5)
    if math.hypot(_pm[0] - _perg_c.x, _pm[1] - _perg_c.y) < 5.2:
        continue
    if on_land(*_a) and on_land(*_b):
        bm_battered_wall(lips, lips_cope, [_a, _b], w_bot=0.62, w_top=0.40, h_above=0.58, sink=0.45, max_exposed=0.95)
        od.line([o_to(*_a), o_to(*_b)], fill=255, width=2)

# Contour vineyard benches: chain parallel contour rows per bench and emit modular vine_row_long (4.8 m) + vine_row_short (2.4 m)
_vrr = max(terrain.VINE_RU, terrain.VINE_RV) + 1.0
_vks = range(int(1.5 / terrain.VINE_STEP), int(26.0 / terrain.VINE_STEP))
_vine_chains = []
for _fi, _frac in enumerate((0.15, 0.40, 0.65, 0.88)):
    _segs_f = iso_segments_fn(terrain.VINE_UV, _vrr, terrain.vine_w,
                              lambda k, f=_frac: (k + f) * terrain.VINE_STEP, _vks, step=1.0, wmin=0.25)
    for (_vk, _vpoly) in _chain_iso_segments(_segs_f, snap=0.14):
        _vine_chains.append((_vk * 4 + _fi, _vpoly))
_vine_placed = []
_vine_samples = []          # (x, y, row_id) to guarantee clean cross-row spacing without blocking adjacent segments on the same row
_nvine_rows = 0
for _row_id, (_vk, _vpoly) in enumerate(_vine_chains):
    _runs = []
    _cur = []
    for _p in _vpoly:
        _rq_v = terrain.road_info(*_p)
        _on_rd = _rq_v is not None and _rq_v[0] < _rq_v[1] + 1.5
        _ok = (point_in_poly(*_p, COAST) and not _on_rd
               and terrain.in_vineyard(*_p, grow=-0.1)
               and terrain.field_at(*_p) is None
               and math.hypot(_p[0] - _perg_c.x, _p[1] - _perg_c.y) > 3.4)
        if _ok:
            _cur.append(_p)
        else:
            if len(_cur) >= 2:
                _runs.append(_cur)
            _cur = []
    if len(_cur) >= 2:
        _runs.append(_cur)
    for _run in _runs:
        _cum = [0.0]
        for _i in range(len(_run) - 1):
            _cum.append(_cum[-1] + math.hypot(_run[_i + 1][0] - _run[_i][0], _run[_i + 1][1] - _run[_i][1]))
        _Ltot = _cum[-1]
        if _Ltot < 2.0:
            continue

        def _at_s(s_):
            for _i in range(len(_cum) - 1):
                if _cum[_i + 1] >= s_ or _i == len(_cum) - 2:
                    dl = max(1e-6, _cum[_i + 1] - _cum[_i])
                    t_ = max(0.0, min(1.0, (s_ - _cum[_i]) / dl))
                    return (_run[_i][0] + (_run[_i + 1][0] - _run[_i][0]) * t_,
                            _run[_i][1] + (_run[_i + 1][1] - _run[_i][1]) * t_)
            return _run[-1]

        _s = 0.15
        _row_hit = False
        while _s + 2.0 <= _Ltot:
            _rem = _Ltot - _s
            if _rem >= 4.5:
                _seg_len = 4.8; _proto = 'vine_row_long'; _nom_len = 4.8
            else:
                _seg_len = min(2.4, _rem); _proto = 'vine_row_short'; _nom_len = 2.4
            _p0 = _at_s(_s)
            _p1 = _at_s(min(_Ltot, _s + _seg_len))
            _pm = (0.5 * (_p0[0] + _p1[0]), 0.5 * (_p0[1] + _p1[1]))
            _actual_l = math.hypot(_p1[0] - _p0[0], _p1[1] - _p0[1])
            _clear_other = all(
                (_pm[0] - q[0]) ** 2 + (_pm[1] - q[1]) ** 2 >= 1.25 ** 2
                for q in _vine_samples if q[2] != _row_id
            )
            if _actual_l >= 1.7 and _clear_other:
                _yaw = math.atan2(_p1[1] - _p0[1], _p1[0] - _p0[0])
                _sxz = max(0.82, min(1.12, _actual_l / _nom_len))
                _sy = T1RNG.uniform(0.92, 1.08)
                emit_veg(_proto, _pm[0], _pm[1], H(*_pm) - 0.04, _yaw, _sxz, _sy, T1RNG)
                _vine_placed.append(_pm)
                _vine_samples.extend(((_p0[0], _p0[1], _row_id), (_pm[0], _pm[1], _row_id), (_p1[0], _p1[1], _row_id)))
                od.line([o_to(*_p0), o_to(*_p1)], fill=255, width=3)
                _row_hit = True
            _s += _seg_len + 0.08
        if _row_hit:
            _nvine_rows += 1
AGRI.append(VINEYARD)
print('VINEYARD contour rows', _nvine_rows, 'modular segments', len(_vine_placed))

# Cohesive Windmill & Threshing Floor (aloni) paved apron + circular limestone cistern/wellhead (<= 2.2 m)
thr = bmesh.new()
tcx, tcy = wpt(*terrain.THRESHING_UV)
tz = terrain.disc_at(tcx, tcy)[0]
_ring = [(tcx + math.cos(2 * math.pi * i / 18) * terrain.THRESHING_R, tcy + math.sin(2 * math.pi * i / 18) * terrain.THRESHING_R) for i in range(18)]
merge(thr, bm_prism(_ring, tz - 0.35, tz + 0.08))
# Connect threshing floor to Windmill yard with a warm stepped limestone flagstone walkway
_wmx, _wmy = CJ['windmill'][0], CJ['windmill'][1]
_wv = Vector((_wmx - tcx, _wmy - tcy)); _wl = _wv.length
if _wl > 1.0:
    _wt = _wv / _wl; _wn = Vector((-_wt.y, _wt.x))
    _n_st = max(4, int((_wl - terrain.THRESHING_R) / 2.0))
    for _k in range(_n_st):
        _s0 = terrain.THRESHING_R - 0.6 + (_wl - terrain.THRESHING_R + 0.2) * _k / _n_st
        _s1 = terrain.THRESHING_R - 0.6 + (_wl - terrain.THRESHING_R + 0.2) * (_k + 1) / _n_st
        _pa = Vector((tcx, tcy)) + _wt * _s0; _pb = Vector((tcx, tcy)) + _wt * _s1
        _za, _zb = H(_pa.x, _pa.y), H(_pb.x, _pb.y)
        merge(thr, nl_kit.beam((_pa.x, _pa.y, _za - 0.14), (_pb.x, _pb.y, _zb - 0.14), 2.8, 0.36))
    od.line([o_to(tcx, tcy), o_to(_wmx, _wmy)], fill=255, width=4)
for a, b in zip(_ring, _ring[1:] + _ring[:1]):
    # Leave an entry gap toward the windmill
    _pm = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)
    if _wl > 1.0 and Vector((_pm[0] - tcx, _pm[1] - tcy)).normalized().dot(_wt) > 0.85:
        continue
    merge(lips, nl_kit.beam((a[0], a[1], tz + 0.18), (b[0], b[1], tz + 0.18), 0.44, 0.36))
occ_poly(_ring)
AGRI.append(_ring)

# ------------------------------------------------------------------ Restrained Ptolemaic Micro-Storytelling (<= 2.5 m, unlit, limestone/oak)
micro_stone, micro_wood, micro_quarry = bmesh.new(), bmesh.new(), bmesh.new()


def _wellhead(cx_, cy_, yaw=0.0):
    """Carved circular Alexandrian limestone cistern/wellhead (r=0.95 m, h=0.95 m) + oak yoke (h=2.15 m)."""
    if not point_in_poly(cx_, cy_, COAST):
        return
    z0 = H(cx_, cy_)
    merge(micro_stone, bm_cyl(1.15, 1.10, 0.24, 12, (cx_, cy_, z0 - 0.14)))
    merge(micro_stone, bm_cyl(0.88, 0.85, 0.92, 12, (cx_, cy_, z0 + 0.08)))
    merge(micro_stone, bm_cyl(0.96, 0.96, 0.14, 12, (cx_, cy_, z0 + 0.96)))
    w_ = bmesh.new()
    for sx in (-0.82, 0.82):
        merge(w_, bm_box2(sx - 0.07, -0.07, 0.98, sx + 0.07, 0.07, 2.08))
    merge(w_, bm_box2(-0.95, -0.09, 2.02, 0.95, 0.09, 2.16))
    xf(w_, rz=yaw); xf(w_, loc=(cx_, cy_, z0))
    merge(micro_wood, w_)
    occ_poly([(cx_ + math.cos(2 * math.pi * k / 8) * 1.9, cy_ + math.sin(2 * math.pi * k / 8) * 1.9) for k in range(8)])


# 1. Aloni / Windmill circular limestone cistern
_cis_x, _cis_y = wpt(terrain.THRESHING_UV[0] - 6.8, terrain.THRESHING_UV[1] + 2.2)
_wellhead(_cis_x, _cis_y, yaw=0.4)

# 2. East Headland crest ruined dry-stone watch-foundation + circular cistern (uv=(231, -68), <= 2.1 m, clear of Tron sightline)
_ex, _ey = wpt(231.0, -68.0)
if point_in_poly(_ex, _ey, COAST) and not occupied(_ex, _ey):
    _ez = min(H(_ex + dx, _ey + dy) for dx in (-2.4, 0, 2.4) for dy in (-2.0, 0, 2.0))
    _er = bmesh.new()
    # Low staggered ruined ashlar perimeter walls (5.4 x 4.4 m, heights 0.7..1.85 m, open SE doorway)
    _segs_ruin = (
        ((-2.7, -2.2), ( 2.7, -2.2), 1.45),
        (( 2.7, -2.2), ( 2.7,  2.2), 1.85),
        (( 2.7,  2.2), (-2.7,  2.2), 1.65),
        ((-2.7,  2.2), (-2.7,  0.5), 1.25),
        ((-2.7, -0.8), (-2.7, -2.2), 0.95),
    )
    for (p0, p1, rh) in _segs_ruin:
        merge(_er, nl_kit.beam((p0[0], p0[1], -0.45 + (rh + 0.45) * 0.5), (p1[0], p1[1], -0.45 + (rh + 0.45) * 0.5), 0.58, rh + 0.45))
    # Adjacent circular limestone cistern (r = 1.35 m, rim 0.85 m)
    merge(_er, bm_cyl(1.42, 1.35, 1.25, 14, (4.3, 0.2, -0.45)))
    merge(_er, bm_cyl(1.52, 1.52, 0.16, 14, (4.3, 0.2, 0.76)))
    xf(_er, rz=0.32); xf(_er, loc=(_ex, _ey, _ez))
    merge(micro_stone, _er)
    occ_poly([(_ex + math.cos(2 * math.pi * k / 10) * 6.4, _ey + math.sin(2 * math.pi * k / 10) * 6.4) for k in range(10)])

# 3. 7 rough-hewn split cream Alexandrian limestone blocks (#D8CAA9) + 2 oak rollers on the 3 East Quarry benches
_q_blocks_uv = (
    (194.5, 42.5, 0.22, 2.2, 1.2, 0.95),
    (197.8, 45.2, 0.30, 1.8, 1.1, 0.90),
    (201.5, 48.0, 0.18, 2.4, 1.3, 1.05),
    (200.2, 52.5, 0.35, 1.7, 1.0, 0.85),
    (204.0, 50.8, 0.25, 2.1, 1.2, 0.98),
    (196.2, 55.2, 0.12, 1.9, 1.1, 0.88),
    (202.8, 41.2, 0.40, 1.6, 1.0, 0.82),
)
for (_qu, _qv, _qa, _ql, _qw, _qh) in _q_blocks_uv:
    _qx, _qy = wpt(_qu, _qv)
    if not point_in_poly(_qx, _qy, COAST) or in_pad(_qx, _qy, 3.0):
        continue
    _qz = H(_qx, _qy) - 0.08
    _qb = bm_box2(-_ql * 0.5, -_qw * 0.5, 0.0, _ql * 0.5, _qw * 0.5, _qh)
    xf(_qb, rz=_qa + math.pi * 0.25); xf(_qb, loc=(_qx, _qy, _qz))
    merge(micro_quarry, _qb)
for (_qu, _qv, _qa) in ((196.0, 44.0, 0.25), (202.2, 49.4, 0.30)):
    _qx, _qy = wpt(_qu, _qv)
    if point_in_poly(_qx, _qy, COAST):
        _qz = H(_qx, _qy)
        _rb = bm_cyl(0.14, 0.14, 2.1, 6, (0, 0, -1.05))
        xf(_rb, ry=math.pi * 0.5, rz=_qa); xf(_rb, loc=(_qx, _qy, _qz + 0.12))
        merge(micro_wood, _rb)

# 4. Weathered Hellenistic ruin footings + 3 fallen fluted limestone column drums below West Sanctuary (uv=(-174, -48))
_rx, _ry = wpt(-174.0, -48.0)
if point_in_poly(_rx, _ry, COAST) and not occupied(_rx, _ry):
    _rz = min(H(_rx + dx, _ry + dy) for dx in (-2.0, 0, 2.0) for dy in (-1.6, 0, 1.6))
    _hr = bmesh.new()
    merge(_hr, bm_box2(-2.4, -1.7, -0.45, 2.4, 1.7, 0.42))
    merge(_hr, bm_box2(-2.0, -1.3, 0.40, 2.0, 1.3, 0.78))
    merge(_hr, bm_box2(-1.9, -1.2, 0.76, -0.4, -0.65, 1.35))
    merge(_hr, bm_box2(0.8, 0.55, 0.76, 1.85, 1.15, 1.28))
    # 3 fallen fluted limestone column drums (10-sided) resting on the hillside beside the stylobate
    for (_dx, _dy, _da) in ((-2.8, 1.4, 0.35), (2.7, -1.2, 1.15), (1.1, -2.5, -0.45)):
        _dr = bm_cyl(0.42, 0.40, 1.18, 10, (0, 0, -0.59))
        xf(_dr, ry=math.pi * 0.5, rz=_da); xf(_dr, loc=(_dx, _dy, 0.34))
        merge(_hr, _dr)
    xf(_hr, rz=-0.38); xf(_hr, loc=(_rx, _ry, _rz))
    merge(micro_stone, _hr)
    occ_poly([(_rx + math.cos(2 * math.pi * k / 10) * 5.2, _ry + math.sin(2 * math.pi * k / 10) * 5.2) for k in range(10)])

# 5. Two-tier planted limestone garden ledges behind the Acropolis/Mint wall (uv=(174, 52), clear of Mint pad + 3.5 m)
_MINT_LEDGES = []
for _tier, _du in enumerate((0.0, 3.2)):
    _lpts = []
    for _k in range(7):
        _p = wpt(173.5 + _du + math.sin(_k * 0.45) * 1.4, 46.0 + _k * 2.4)
        if point_in_poly(*_p, COAST) and not in_pad(*_p, 3.6) and not occupied(*_p):
            _lpts.append(_p)
    if len(_lpts) >= 3:
        bm_battered_wall(micro_stone, lips_cope, _lpts, w_bot=0.66, w_top=0.44, h_above=0.48 + _tier * 0.14, sink=0.45, max_exposed=1.25)
        od.line([o_to(*q) for q in _lpts], fill=255, width=3)
        _MINT_LEDGES.extend(_lpts)

# 6. Two village limestone wellheads (upper town square & South Road cove hamlet junction)
for (_wx, _wy, _wyaw) in (
    (*town_pt(118.0, TOWN['r_quay'] + 54.0), 0.7),
    (*wpt(-46.0, -230.0), -0.3),
):
    if point_in_poly(_wx, _wy, COAST) and not in_pad(_wx, _wy, 2.5):
        _rq = terrain.road_info(_wx, _wy)
        if _rq is None or _rq[0] > _rq[1] + 1.4:
            _wellhead(_wx, _wy, yaw=_wyaw)

refresh_occ()
obj('land_threshing', thr, face=lambda q: ((lin('#D0C3A4') if q.normal.z > 0.5 else lin('#B4A486')), PT['cobble']), family='terrain', jitter=0.05)
if len(t_stairs.faces):
    obj('terrace_stairs', t_stairs, LIMESTONE, PT['ashlar'], family='quay', jitter=0.05)
else:
    t_stairs.free()
if len(pergola_stone.faces):
    obj('vineyard_pergola_stone', pergola_stone, LIMESTONE, PT['ashlar'], family='prop_wall', jitter=0.04)
else:
    pergola_stone.free()
if len(pergola_wood.faces):
    obj('vineyard_pergola_wood', pergola_wood, PAL['timber_dark'], PT['boards'], family='prop_wall', jitter=0.05)
else:
    pergola_wood.free()
if len(micro_stone.faces):
    obj('micro_limestone', micro_stone, LIMESTONE, PT['ashlar'], family='prop_wall', jitter=0.07)
else:
    micro_stone.free()
if len(micro_quarry.faces):
    obj('micro_quarry_blocks', micro_quarry, lin('#D8CAA9'), PT['ashlar'], family='prop_wall', jitter=0.05)
else:
    micro_quarry.free()
if len(micro_wood.faces):
    obj('micro_wood', micro_wood, PAL['timber_dark'], PT['boards'], family='prop_wall', jitter=0.05)
else:
    micro_wood.free()

# ------------------------------------------------------------------ 08-T4 (prettier): a small hill sanctuary on the west spine
# The harbour's own sanctuary, generic and votive (no name, no statue, no colossus; R3/D3): a temenos levelled on the
# spine's north knoll (terrain.SANCTUARY_*), a tholos under 7 m, an altar and two stelae on the approach, a ring of
# cypresses with its gap toward the town, a processional path from the west road, one lamp at dusk.
SRNG = random.Random(4404)
s_st, s_wall, s_roof, s_pave = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
scx, scy = wpt(*terrain.SANCTUARY_UV)
sz = terrain.disc_at(scx, scy)[0]
_su = lambda du, dv: wpt(terrain.SANCTUARY_UV[0] + du, terrain.SANCTUARY_UV[1] + dv)    # screen-plan offsets from its centre
SANCT_RING = [(scx + math.cos(2 * math.pi * i / 20) * (terrain.SANCTUARY_R - 0.6), scy + math.sin(2 * math.pi * i / 20) * (terrain.SANCTUARY_R - 0.6)) for i in range(20)]
tx_, ty_ = _su(0.0, 1.8)                       # the tholos stands toward the back; the altar before it, on the camera side
_pc = _su(0.0, -1.6)                           # a modest paved court round the tholos and the altar; the rest stays turf
merge(s_pave, bm_prism([(_pc[0] + math.cos(2 * math.pi * i / 16) * 5.4, _pc[1] + math.sin(2 * math.pi * i / 16) * 5.4) for i in range(16)], sz - 0.4, sz + 0.07))
for k, (r_, h_) in enumerate(((3.6, 0.26), (3.25, 0.26), (2.9, 0.26))):
    merge(s_st, bm_cyl(r_, r_, h_, 14, (tx_, ty_, sz + 0.07 + k * 0.26)))
zc_ = sz + 0.07 + 3 * 0.26
merge(s_wall, bm_cyl(1.75, 1.75, 3.0, 12, (tx_, ty_, zc_), cap=False))          # the cella
for i in range(8):
    a = 2 * math.pi * i / 8 + 0.2
    merge(s_st, bm_cyl(0.19, 0.16, 3.0, 6, (tx_ + math.cos(a) * 2.5, ty_ + math.sin(a) * 2.5, zc_)))
merge(s_st, bm_cyl(2.8, 2.8, 0.42, 14, (tx_, ty_, zc_ + 3.0)))                   # the entablature ring
merge(s_roof, bm_cyl(3.05, 0.25, 1.45, 14, (tx_, ty_, zc_ + 3.42), cap=False))  # a low tiled cone
merge(s_st, bm_cyl(0.25, 0.05, 0.45, 6, (tx_, ty_, zc_ + 4.87)))                # finial (top ~6.6 m above the knoll)
ax_, ay_ = _su(0.0, -4.2)
merge(s_st, bm_box2(ax_ - 0.75, ay_ - 0.5, sz + 0.07, ax_ + 0.75, ay_ + 0.5, sz + 1.0))   # the altar
merge(s_st, bm_box2(ax_ - 0.9, ay_ - 0.62, sz + 0.95, ax_ + 0.9, ay_ + 0.62, sz + 1.1))
for du in (-2.6, 2.6):                          # two stelae flanking the approach
    ex_, ey_ = _su(du, -6.6)
    merge(s_st, xf(bm_box(0.5, 0.18, 1.5), loc=(ex_, ey_, sz + 0.82), rz=SRNG.uniform(-0.2, 0.2)))
occ_poly([(scx + math.cos(2 * math.pi * i / 16) * (terrain.SANCTUARY_R + 2.5), scy + math.sin(2 * math.pi * i / 16) * (terrain.SANCTUARY_R + 2.5)) for i in range(16)])
AGRI.append(SANCT_RING)
SANCT_CYPRESS = []
for i in range(17):                             # the cypress ring, open to the south (the approach, toward the town);
    a = -math.pi / 2 + math.radians(36) + i * math.radians(288) / 16      # REVIEW #9: a dense, staggered double rank
    rr_ = 10.6 if i % 2 == 0 else 12.3
    du, dv = math.cos(a) * rr_, math.sin(a) * rr_
    SANCT_CYPRESS.append(_su(du + SRNG.uniform(-0.4, 0.4), dv + SRNG.uniform(-0.4, 0.4)))
# Processional path already lives flush in land_terrain (terrain.SHRINE_PATH) & ROADS['shrine']
SANCT_LAMP = (_su(1.6, -4.6), sz + 0.07)
SANCT_SPOTS = [(_su(0.0, -6.0), sz + 0.07), (_su(-2.0, -1.5), sz + 0.07)]
refresh_occ()
obj('sanctuary_stone', s_st, CP['marble'], PT['ashlar'], family='landmark', jitter=0.03, bevel=0.02)
obj('sanctuary_cella', s_wall, CP['wash_cream'], PT['render'], family='landmark', jitter=0.02)
obj('sanctuary_roof', s_roof, lin('#8C4F39'), PT['tiles'], family='landmark', jitter=0.04)
obj('sanctuary_paving', s_pave, face=lambda q: ((CP['lime_dark'] if q.normal.z > 0.5 else CP['lime_dark']), PT['cobble']), family='terrain', jitter=0.05)
print('SANCTUARY z', round(sz, 1), 'top', round(zc_ + 5.32, 1))

# ------------------------------------------------------------------ Arable lynchets & airy rustic pasture boundaries (FIELDS)
# Downhill battered dry-stone limestone lynchet walls + uphill low grassy boulder curbs + open gateways (no "sunken brown ponds"!)
walls = bmesh.new(); sheep = bmesh.new(); sheep_h = bmesh.new()
for fi, f in enumerate(terrain.FIELDS):
    poly_f = f['poly']
    fcx = sum(q[0] for q in poly_f) / len(poly_f)
    fcy = sum(q[1] for q in poly_f) / len(poly_f)
    z_cent = H(fcx, fcy)
    # Pick the edge closest to any main road as the open field gateway
    road_pts_ref = ROADS.get('west', []) + ROADS.get('south', []) + ROADS.get('east', [])
    gw_ei = 0
    if road_pts_ref:
        best_gd = 1e18
        for ei in range(len(poly_f)):
            a, b = poly_f[ei], poly_f[(ei + 1) % len(poly_f)]
            mx, my = (a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5
            gd = min((mx - rp[0]) ** 2 + (my - rp[1]) ** 2 for rp in road_pts_ref[::3])
            if gd < best_gd:
                best_gd = gd; gw_ei = ei
    p = poly_f + poly_f[:1]
    is_arable = f['kind'] in ('plough', 'hay')
    for ei, (a, b) in enumerate(zip(p, p[1:])):
        L_e = math.hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(L_e / 3.0))
        zm_e = 0.5 * (H(*a) + H(*b))
        is_downhill = zm_e < z_cent + 0.15
        for k in range(n):
            # Open 4 m gateway gap near the center of the gateway edge
            if ei == gw_ei and abs((k + 0.5) / n - 0.5) * L_e < 2.1:
                continue
            q0 = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)
            q1 = (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)
            if not on_land(*q0) or not on_land(*q1):
                continue
            if is_arable and is_downhill:
                # Downhill battered dry-stone limestone lynchet retaining wall
                bm_battered_wall(walls, lips_cope, [q0, q1], w_bot=0.68, w_top=0.44, h_above=0.45, sink=0.45, max_exposed=1.05)
                od.line([o_to(*q0), o_to(*q1)], fill=255, width=2)
            elif is_arable:
                # Uphill low grassy limestone boulder bank (open sightlines, no dark enclosing wall)
                if DRNG.random() < 0.62:
                    qm = ((q0[0] + q1[0]) * 0.5, (q0[1] + q1[1]) * 0.5)
                    ang = math.atan2(q1[1] - q0[1], q1[0] - q0[0])
                    merge(walls, xf(bm_box2(-1.05, -0.34, -0.25, 1.05, 0.34, DRNG.uniform(0.28, 0.48)),
                                    rz=ang + DRNG.uniform(-0.12, 0.12), loc=(qm[0], qm[1], H(*qm))))
                    od.line([o_to(*q0), o_to(*q1)], fill=255, width=2)
            else:
                # Open pastures: low sparse rustic dry-stone boundary with airy gaps
                if DRNG.random() < 0.22:
                    continue
                merge(walls, nl_kit.beam((q0[0], q0[1], H(*q0) + 0.16), (q1[0], q1[1], H(*q1) + 0.16), 0.54, 0.64))
                od.line([o_to(*q0), o_to(*q1)], fill=255, width=2)
    if f['kind'] == 'pasture':           # a small flock grazing (decorative)
        xs_ = [q[0] for q in f['poly']]; ys_ = [q[1] for q in f['poly']]
        cx_, cy_ = sum(xs_) / len(xs_), sum(ys_) / len(ys_)
        for k in range(DRNG.randint(5, 9)):
            q = (cx_ + DRNG.gauss(0, 5.0), cy_ + DRNG.gauss(0, 4.0))
            if not point_in_poly(q[0], q[1], f['poly']):
                continue
            a_ = DRNG.uniform(0, 6.28); z_ = H(*q)
            merge(sheep, bm_ico(0.55, (q[0], q[1], z_ + 0.62), 1, (1.35, 0.85, 0.8), seed=DRNG.randint(0, 999), amp=0.12))
            merge(sheep_h, bm_pebble(0.24, (q[0] + math.cos(a_) * 0.75, q[1] + math.sin(a_) * 0.75, z_ + 0.72), (1.2, 1.0, 1.0), seed=k))
            for lx in (-0.3, 0.3):
                merge(sheep_h, bm_cyl(0.07, 0.07, 0.4, 4, (q[0] + lx * math.cos(a_), q[1] + lx * math.sin(a_), z_)))
refresh_occ()
obj('field_walls', walls, lin('#C0AE8E'), PT['rock'], family='prop_wall', jitter=0.09)
obj('terrace_lips', lips, lin('#C2B292'), PT['rock'], family='prop_wall', jitter=0.07)
if len(lips_cope.faces):
    obj('terrace_coping_rural', lips_cope, lin('#D5C9AE'), PT['plain'], family='prop_wall', jitter=0.04)
else:
    lips_cope.free()
obj('field_sheep', sheep, lin('#EEE9DD'), PT['plain'], family='veg', jitter=0.04)
obj('field_sheep_heads', sheep_h, lin('#2E2B29'), PT['plain'], family='veg')

# ------------------------------------------------------------------ VEGETATION -> HBVG v1 instanced hero trees
# All hero trees & modular vineyard rows are emitted to public/harbour/flora/vegetation-instances.bin (HBVG v1)
# and NEVER baked into island.glb! Phase 4C groundcover.bin now owns all grass tufts, ferns, wildflowers, maquis,
# lavender, garrigue, dune marram, scattered boulders & shore pebbles (stripped from island.glb).
SPECIES = ('pine', 'cypress', 'olive', 'fig', 'pomegranate', 'plane', 'almond')
lich = bmesh.new()
TREES = dict.fromkeys(SPECIES, 0)
TREE_GRID = {}              # every tree so far, (x, y, spacing) in 10 m cells: separate scatters keep apart
PINE_CROWN_R = {'pine_broad': 6.2, 'pine_tiered': 6.0, 'pine_sheared': 5.2, 'pine_young': 4.0}
PLACED_PINES = []           # [(x, y, r_crown_eff)] for strict cypress-pine separation
PLACED_CYPRESSES = []       # [(x, y)]


def _cypress_clear_of_pines(x, y):
    for (px, py, r_eff) in PLACED_PINES:
        req = 0.75 * (r_eff + 1.4)
        if (x - px) ** 2 + (y - py) ** 2 < req * req:
            return False
    return True


def _pine_clear_of_cypresses(x, y, r_eff):
    req = 0.75 * (r_eff + 1.4)
    req2 = req * req
    for (cx, cy) in PLACED_CYPRESSES:
        if (x - cx) ** 2 + (y - cy) ** 2 < req2:
            return False
    return True


def pine_clear_for_cypress(sampler):
    """Filter cypress candidates so zero cypress spires pierce any placed umbrella pine crown."""
    def s(rng):
        p = sampler(rng)
        if p is None or not _cypress_clear_of_pines(p[0], p[1]):
            return None
        return p
    return s


def cypress_clear_for_pine(sampler, max_r=6.8):
    """Filter pine candidates clear of already-placed cypresses (e.g. Sanctuary ring, stair accents)."""
    req2 = (0.75 * (max_r + 1.4)) ** 2

    def s(rng):
        p = sampler(rng)
        if p is None:
            return None
        for (cx, cy) in PLACED_CYPRESSES:
            if (p[0] - cx) ** 2 + (p[1] - cy) ** 2 < req2:
                return None
        return p
    return s


def scatter(n, sampler, place, min_d, rng, max_try=None, allow_crop=False, grid=None, skip_flag_meadow=False):
    """grid: a shared {cell: [(x, y, d)]} (10 m cells); two points keep apart by the mean of their spacings."""
    placed = []
    tries = 0
    own = grid is None
    grid = {} if own else grid
    cell = max(min_d, 1.0) if own else 10.0
    while len(placed) < n and tries < (max_try or n * 30):
        tries += 1
        p = sampler(rng)
        if p is None or not on_land(*p) or (not allow_crop and in_crop(*p)):
            continue
        if skip_flag_meadow and _in_flag_meadow(p):
            continue
        key = (int(p[0] // cell), int(p[1] // cell))
        ok = True
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for q in grid.get((key[0] + i, key[1] + j), ()):
                    d = (min_d + q[2]) / 2
                    if (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 < d * d:
                        ok = False; break
        if not ok:
            continue
        grid.setdefault(key, []).append((p[0], p[1], min_d))
        placed.append(p)
        place(p, rng)
    return placed


def line_sampler(pts_uv, spread):
    def s(rng):
        i = rng.randrange(len(pts_uv) - 1)
        a, b = pts_uv[i], pts_uv[i + 1]
        t = rng.random()
        u = a[0] + (b[0] - a[0]) * t + rng.gauss(0, spread); v = a[1] + (b[1] - a[1]) * t + rng.gauss(0, spread)
        return wpt(u, v)
    return s


def crown_clear(sampler, r):
    """A big crown must not overhang a roof, a lane or a quay: its rim stays off the occupancy raster."""
    def s(rng):
        p = sampler(rng)
        if p is None or any(occupied(p[0] + dx * r, p[1] + dy * r) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            return None
        return p
    return s


def roadside(names, off):
    """A point beside one of the ROADS, `off` metres from its centre line (cypress rows)."""
    pts = [(nm, i) for nm in names if nm in ROADS for i in range(len(ROADS[nm]) - 1)]

    def s(rng):
        nm, i = pts[rng.randrange(len(pts))]
        a, b = Vector(ROADS[nm][i]), Vector(ROADS[nm][i + 1])
        t = (b - a)
        if t.length < 1e-3:
            return None
        t.normalize()
        q = a + (b - a) * rng.random() + Vector((-t.y, t.x)) * off * rng.choice((-1, 1))
        return (q.x, q.y)
    return s


# East-coast chain-flag backdrop calm meadow (*ma*) & evergreen preference near chain flags
_EAST_FLAGS = [p_ for (pid, p_) in FLAG_AT if pid in ('pier-tron', 'pier-hyperliquid-l1')]
_ALL_FLAGS = [p_ for (_pid, p_) in FLAG_AT]


def _in_flag_meadow(p):
    """Keep calm open sun-cured meadow (*ma*) behind right-coast chain flags (Tron & Hyperliquid)."""
    u, v = uvp(p[0], p[1])
    if u > 238.0 and -48.0 < v < 46.0:
        return True
    return any((p[0] - fp.x) ** 2 + (p[1] - fp.y) ** 2 < 22.0 ** 2 for fp in _EAST_FLAGS)


def _near_chain_flag(p):
    return any((p[0] - fp.x) ** 2 + (p[1] - fp.y) ** 2 < 30.0 ** 2 for fp in _ALL_FLAGS)


HEIGHT = dict(olive=(3.8, 5.8), fig=(4.2, 5.8), pomegranate=(3.4, 4.7), plane=(9.4, 13.0), almond=(4.4, 6.6))

_bw = CJ_LAYOUT.get('wind', {}).get('bowHeadingRad', 0.0)
WIND_TO = Vector((-math.sin(_bw), math.cos(_bw)))          # downwind on Blender XY plane
WIND_YAW = math.atan2(WIND_TO.y, WIND_TO.x)                # matches pine_sheared (+X local lean) in glTF Y-up too!
PINE_VARIANTS = dict(broad=0, tiered=0, sheared=0, young=0)


def pine_variant(p, z):
    hsh = terrain._hash(int(p[0] * 5), int(p[1] * 5), 41)
    if terrain.dcoast(*p) < 16.0 or (z > 21.0 and hsh > 0.56):
        return 'sheared'
    if hsh < 0.25:
        return 'young'
    return 'broad' if hsh < 0.64 else 'tiered'


def place_pine(p, rng, keep=True, force_proto=None):
    if _in_flag_meadow(p):
        return
    z = H(*p)
    target_h = rng.uniform(8.6, 12.6) * (1.0 if z > 12.0 else 0.85)
    var = pine_variant(p, z) if force_proto is None else force_proto
    if not keep:
        return
    proto = 'pine_' + var
    if var == 'young':
        target_h = rng.uniform(5.2, 7.6)
    elif var == 'sheared':
        target_h = rng.uniform(7.6, 10.6)
    sy = target_h / VEG_NOM_H[proto]
    sxz = sy * rng.uniform(0.92, 1.12)
    r_eff = PINE_CROWN_R[proto] * sxz
    if not _pine_clear_of_cypresses(p[0], p[1], r_eff):
        return
    yaw = (WIND_YAW + rng.uniform(-0.22, 0.22)) if var == 'sheared' else rng.uniform(0.0, 2.0 * math.pi)
    emit_veg(proto, p[0], p[1], z - 0.15, yaw, sxz, sy, rng)
    PLACED_PINES.append((float(p[0]), float(p[1]), float(r_eff)))
    PINE_VARIANTS[var] += 1
    TREES['pine'] += 1


CREST_GAPS = ((82.0, 100.0), (106.0, 112.0))


def place_crest_pine(p, rng):
    u, v = uvp(*p)
    a = math.degrees(math.atan2(v - CT_UV[1], u - CT_UV[0]))
    place_pine(p, rng, keep=not any(lo <= a <= hi for lo, hi in CREST_GAPS))


def place_cypress(p, rng, variant=None):
    if _in_flag_meadow(p) and variant != 'sanctuary':
        return
    if variant != 'sanctuary' and not _cypress_clear_of_pines(p[0], p[1]):
        return
    z = H(*p)
    if variant == 'sanctuary':
        proto = 'cypress_sanctuary'
        target_h = rng.uniform(10.5, 13.4)
    elif variant == 'column':
        proto = 'cypress_column'
        target_h = rng.uniform(7.8, 10.6)
    elif variant == 'tall':
        proto = 'cypress_tall'
        target_h = rng.uniform(9.8, 12.8)
    else:
        proto = 'cypress_tall' if rng.random() < 0.55 else 'cypress_column'
        target_h = rng.uniform(8.4, 12.0)
    sy = target_h / VEG_NOM_H[proto]
    sxz = sy * rng.uniform(0.88, 1.10)
    emit_veg(proto, p[0], p[1], z - 0.15, rng.uniform(0.0, 2.0 * math.pi), sxz, sy, rng)
    PLACED_CYPRESSES.append((float(p[0]), float(p[1])))
    TREES['cypress'] += 1


def _pick_species_proto(sp, rng, terrace=False):
    r = rng.random()
    if sp == 'olive':
        if terrace:
            return 'olive_terrace' if r < 0.72 else ('olive_young' if r < 0.88 else 'olive_ancient')
        return 'olive_ancient' if r < 0.45 else ('olive_terrace' if r < 0.85 else 'olive_young')
    if sp == 'plane':
        return 'plane_tall' if r < 0.55 else 'plane_broad'
    if sp == 'almond':
        return 'almond_spread' if r < 0.65 else 'almond_young'
    if sp == 'fig':
        return 'fig_broad'
    return 'pomegranate_multi'


def placer(*mix):
    """place(p, rng) for a species mix emitting HBVG v1 records; stays evergreen near chain flags & clear of east-flag meadow."""
    def place(p, rng):
        if _in_flag_meadow(p):
            return
        k, acc = rng.random(), 0.0
        for sp, w in mix:
            acc += w
            if k < acc:
                break
        # Near chain flags, stay evergreen (olive) so deciduous blossom/autumn hues never clash with chain pennants
        if sp in ('almond', 'plane', 'fig', 'pomegranate') and _near_chain_flag(p):
            sp = 'olive'
        proto = _pick_species_proto(sp, rng)
        target_h = rng.uniform(*HEIGHT[sp])
        sy = target_h / VEG_NOM_H[proto]
        sxz = sy * rng.uniform(0.90, 1.12)
        emit_veg(proto, p[0], p[1], H(*p) - 0.12, rng.uniform(0.0, 2.0 * math.pi), sxz, sy, rng)
        TREES[sp] += 1
    return place


# 1. Sanctuary sacred cypress ring (cypress_sanctuary) + graceful cypress_column accents flanking built terrace stair heads
for (x, y) in SANCT_CYPRESS:
    place_cypress((x, y), SRNG, variant='sanctuary')
    TREE_GRID.setdefault((int(x // 10.0), int(y // 10.0)), []).append((x, y, 3.0))

for (_head_xy, _sdir, _sside) in TERRACE_STAIR_HEADS:
    for _sgn in (-1.0, 1.0):
        _cx = _head_xy[0] + _sside[0] * _sgn * 2.8 + _sdir[0] * 0.6
        _cy = _head_xy[1] + _sside[1] * _sgn * 2.8 + _sdir[1] * 0.6
        if on_land(_cx, _cy) and _cypress_clear_of_pines(_cx, _cy):
            place_cypress((_cx, _cy), T1RNG, variant='column')
            TREE_GRID.setdefault((int(_cx // 10.0), int(_cy // 10.0)), []).append((_cx, _cy, 3.6))

# 2. Curated Aegean olive terrace rows (West, East & South terraces!)
# Place 1 gnarled olive_ancient per ~12 trees at bench ends; widen heights to 3.0-5.6 m and width scale to 0.85-1.20.
_end_idxs = [idx for idx, (_x, _y, _k, is_end) in enumerate(TERRACE_OLIVES) if is_end]
_n_ancient_tgt = max(1, round(len(TERRACE_OLIVES) / 12.0)) if TERRACE_OLIVES else 0
_ancient_set = set()
if _end_idxs and _n_ancient_tgt > 0:
    _step_a = max(1.0, len(_end_idxs) / float(_n_ancient_tgt))
    for _ai in range(min(_n_ancient_tgt, len(_end_idxs))):
        _ancient_set.add(_end_idxs[min(len(_end_idxs) - 1, int(round(_ai * _step_a)))])

for _oi, (x, y, k, _is_end) in enumerate(TERRACE_OLIVES):
    _r_ol = T1RNG.random()
    if _oi in _ancient_set or _r_ol < 0.08:
        proto = 'olive_ancient'
        target_h = T1RNG.uniform(4.5, 5.9)
        sy = target_h / VEG_NOM_H[proto]
        sxz = sy * T1RNG.uniform(0.92, 1.24)
    elif _r_ol < 0.32:
        proto = 'olive_young'
        target_h = T1RNG.uniform(2.6, 4.0)
        sy = target_h / VEG_NOM_H[proto]
        sxz = sy * T1RNG.uniform(0.80, 1.18)
    else:
        proto = 'olive_terrace'
        target_h = T1RNG.uniform(3.0, 5.4)
        sy = target_h / VEG_NOM_H[proto]
        sxz = sy * T1RNG.uniform(0.82, 1.24)
    emit_veg(proto, x, y, H(x, y) - 0.12, T1RNG.uniform(0.0, 2.0 * math.pi), sxz, sy, T1RNG, luma_sigma=40.0)
    TREES['olive'] += 1
    TREE_GRID.setdefault((int(x // 10.0), int(y // 10.0)), []).append((x, y, 4.8))

# 3. Town gardens & cove hamlet orchards
TOWN_SPOTS = []
for k, (r0, r1, z) in enumerate(RINGS):
    th0, th1 = TOWN_TH[k]
    for i in range(320):
        TOWN_SPOTS.append(town_pt(DRNG.uniform(th1, th0), DRNG.uniform(r0 + 2, r1 + 1)))
scatter(175, lambda r: TOWN_SPOTS[r.randrange(len(TOWN_SPOTS))], placer(('olive', 0.46), ('fig', 0.24), ('pomegranate', 0.20), ('plane', 0.10)),
        5.2, DRNG, max_try=7000, grid=TREE_GRID, skip_flag_meadow=True)
for pid, cv in COVES.items():
    b = Vector(cv['back']); n_ = Vector(cv['n']); t_ = Vector(cv['t'])
    scatter(9, lambda r, b=b, n_=n_, t_=t_, hw=cv['hw']: tuple(b - n_ * r.uniform(13, 38) + t_ * r.uniform(-hw - 12, hw + 12)),
            placer(('olive', 0.58), ('fig', 0.28), ('pomegranate', 0.14)), 5.8, DRNG, max_try=450, grid=TREE_GRID, skip_flag_meadow=True)

# 4. Town amphitheatre skyline crest, West spine, East Headland crest & copses:
#    Place ALL umbrella pines first (respecting Sanctuary/stair cypresses), then frame groves with cypresses
#    enforcing strict >= 0.75 * (r_crown_pine * scale + 1.4) clearance so zero cypresses pierce pine crowns!
CREST = [(CT_UV[0] + math.cos(math.radians(a)) * 133.0, CT_UV[1] + math.sin(math.radians(a)) * 133.0) for a in range(166, 8, -6)]
EAST_CREST_CORE = [(226.0, 10.0), (232.0, -34.0), (234.0, -76.0), (230.0, -124.0)]
COPSES = [((-150.0, -40.0), 11, 16), ((-180.0, 20.0), 12, 18), ((-250.0, -190.0), 13, 18), ((-90.0, -250.0), 10, 12), ((100.0, -250.0), 10, 12),
          ((226.0, -52.0), 10, 18), ((212.0, 22.0), 11, 16), ((-60.0, 120.0), 8, 8), ((-150.0, 60.0), 10, 10), ((150.0, -210.0), 10, 12)]

scatter(160, cypress_clear_for_pine(crown_clear(line_sampler(CREST, 8.5), 1.4)), place_crest_pine, 4.2, DRNG, max_try=9000, grid=TREE_GRID, skip_flag_meadow=True)
scatter(125, cypress_clear_for_pine(crown_clear(line_sampler(terrain.WEST_SPINE, 11.0), 1.8)), place_pine, 4.2, DRNG, max_try=9000, grid=TREE_GRID, skip_flag_meadow=True)
scatter(105, cypress_clear_for_pine(crown_clear(line_sampler(EAST_CREST_CORE, 8.5), 2.4)), place_pine, 4.3, DRNG, max_try=7000, grid=TREE_GRID, skip_flag_meadow=True)
for (c, sp, n) in COPSES:
    scatter(n, cypress_clear_for_pine(lambda r, c=c, sp=sp: wpt(c[0] + r.gauss(0, sp), c[1] + r.gauss(0, sp))), place_pine, 4.8, DRNG, max_try=n * 45, grid=TREE_GRID, skip_flag_meadow=True)
# Coastal headland wind-sheared pines on non-quay outer bluffs & rocky knuckles (clear of pastures, pads & flag meadow)
scatter(34, cypress_clear_for_pine(lambda r: wpt(r.uniform(-290, 250), r.uniform(-280, -150)), max_r=5.6),
        lambda p, r: place_pine(p, r, force_proto='sheared') if terrain.dcoast(*p) < 26.0 else place_pine(p, r), 6.2, DRNG, max_try=5000, grid=TREE_GRID, skip_flag_meadow=True)

# 5. Crest/headland framing cypresses, roadside cypress avenues & town outer rim (strict pine-crown clearance!)
scatter(56, pine_clear_for_cypress(line_sampler(CREST, 11.0)), place_cypress, 3.4, DRNG, max_try=4500, grid=TREE_GRID, skip_flag_meadow=True)
scatter(32, pine_clear_for_cypress(line_sampler(EAST_CREST_CORE, 11.0)), lambda p, r: place_cypress(p, r, variant='tall'), 3.8, DRNG, max_try=4000, grid=TREE_GRID, skip_flag_meadow=True)
scatter(46, pine_clear_for_cypress(roadside(['pharos'], 4.2)), lambda p, r: place_cypress(p, r, variant='tall'), 5.2, DRNG, max_try=3200, grid=TREE_GRID, skip_flag_meadow=True)
scatter(68, pine_clear_for_cypress(roadside(['west', 'south', 'east', 'east_ridge'], 3.8)), place_cypress, 5.8, DRNG, max_try=5500, grid=TREE_GRID, skip_flag_meadow=True)
_R_EDGE = RINGS[-1][1]
scatter(44, pine_clear_for_cypress(lambda r: town_pt(r.uniform(TOWN_TH[-1][1], TOWN_TH[-1][0]), _R_EDGE + r.uniform(6.0, 16.0))),
        lambda p, r: place_cypress(p, r, variant='column'), 4.4, DRNG, max_try=3200, grid=TREE_GRID, skip_flag_meadow=True)

# 6. Clustered hillside groves (clear ground between groves; East groves stay inland of right-coast flag meadow)
def grove(sampler, lo=0.45):
    def s(rng):
        p = sampler(rng)
        if p is None or terrain.fbm(p[0], p[1], 0.018, 2, 71) < lo:
            return None
        return p
    return s


scatter(90, grove(lambda r: wpt(r.uniform(-220, 230), r.uniform(-260, -195))), placer(('almond', 0.65), ('olive', 0.25), ('plane', 0.10)), 5.6, DRNG, max_try=7000, grid=TREE_GRID, skip_flag_meadow=True)
scatter(42, grove(lambda r: wpt(r.uniform(-250, -145), r.uniform(-210, -30))), placer(('olive', 0.65), ('fig', 0.20), ('pomegranate', 0.15)), 5.6, DRNG, max_try=5500, grid=TREE_GRID, skip_flag_meadow=True)
scatter(68, grove(line_sampler(terrain.WEST_SPINE + [(-150.0, 40.0)], 44.0)), placer(('almond', 0.55), ('olive', 0.25), ('plane', 0.12), ('pomegranate', 0.08)), 5.6, DRNG, max_try=7500, grid=TREE_GRID, skip_flag_meadow=True)
scatter(74, grove(line_sampler(EAST_CREST_CORE, 32.0)), placer(('olive', 0.36), ('plane', 0.42), ('almond', 0.22)), 5.8, DRNG, max_try=7500, grid=TREE_GRID, skip_flag_meadow=True)
scatter(56, crown_clear(line_sampler(CREST, 22.0), 1.6), placer(('plane', 0.78), ('almond', 0.22)), 6.0, DRNG, max_try=5000, grid=TREE_GRID, skip_flag_meadow=True)
print('TREES (HBVG)', TREES, 'pines', PINE_VARIANTS)


# Phase 4C handover: grass tufts, wildflowers, garrigue, maquis/lavender cushions, and scattered hillside boulders
# are now rendered by the instanced GroundCoverSystem (`public/harbour/groundcover.bin`) and stripped from island.glb.
# Retain OCC_D / LAND_R / OUTCROPS / strata_outcrops / land_lichen + battery terrace cypresses (HBVG v1).
OUTCROPS = list(terrain.OUTCROPS_UV)
from scipy import ndimage as _nd
OCC_D = _nd.distance_transform_edt(~OCC) * OS          # metres to the nearest road, lot, wall or quay apron
_LAND_IM = Image.new('L', (OW, OH), 0); ImageDraw.Draw(_LAND_IM).polygon([o_to(*p) for p in COAST], fill=255)
LAND_R = np.array(_LAND_IM) > 127
OUTCROP_W = [wpt(u, v) for (u, v) in OUTCROPS]

# Sculpted tabular karst limestone outcrops (2-4 stacked tilted strata slabs + angular talus wedges, hb_terrain role)
# Nudge up to 9 m in a deterministic spiral if a candidate site hits a terrace wall, path, or pad margin, and export
# exact placed world coordinates to `outcrops_placed.json` so bake_terrain.py & hb_groundcover.py match 100%!
strata_bm = bmesh.new()
PLACED_OUTCROPS = []
_NUDGE_OFFS = [(0.0, 0.0)] + [
    (r_ * math.cos(a_), r_ * math.sin(a_))
    for r_ in (3.0, 6.0, 9.0) for a_ in (0.0, 0.785, 1.571, 2.356, 3.142, 3.927, 4.712, 5.498)
]
for _oi, (u, v) in enumerate(OUTCROPS):
    placed_xy = None
    placed_uv = None
    for (du_, dv_) in _NUDGE_OFFS:
        cx, cy = wpt(u + du_, v + dv_)
        if not point_in_poly(cx, cy, COAST) or occupied(cx, cy) or in_pad(cx, cy, 3.5):
            continue
        if terrain.field_at(cx, cy) is not None or terrain.in_vineyard(cx, cy) or terrain.beach_k(cx, cy)[0] > 0.2:
            continue
        placed_xy = (cx, cy)
        placed_uv = (u + du_, v + dv_)
        break
    if placed_xy is None:
        continue
    _rad = DRNG.uniform(3.1, 5.2)
    _yaw = DRNG.uniform(0.0, 2.0 * math.pi)
    strata_outcrop(strata_bm, lich, placed_xy[0], placed_xy[1], _rad, _yaw, 700 + _oi * 19)
    PLACED_OUTCROPS.append(dict(x=round(placed_xy[0], 3), y=round(placed_xy[1], 3),
                                u=round(placed_uv[0], 2), v=round(placed_uv[1], 2), r=round(_rad, 2)))
if len(strata_bm.faces):
    obj('strata_outcrops', strata_bm, face=strata_outcrop_face, family='terrain', jitter=0.06, seed=11)
else:
    strata_bm.free()
OUTCROP_W[:] = [(o_['x'], o_['y']) for o_ in PLACED_OUTCROPS]
os.makedirs(OUTD, exist_ok=True)
json.dump(PLACED_OUTCROPS, open(os.path.join(OUTD, 'outcrops_placed.json'), 'w'), indent=1)
print('STRATA_OUTCROPS placed', len(PLACED_OUTCROPS), 'of', len(OUTCROPS))

# P8: the battery's terraced back wall — keep HBVG v1 column cypress accents (ledge maquis handled by groundcover.bin)
_TRNG = random.Random(808)
for _fl in CJ.get('flats', []):
    _te = _fl.get('terrace')
    if not _te:
        continue
    _ring = [Vector(q) for q in _fl['poly']]
    _cen = sum(_ring, Vector((0.0, 0.0))) / len(_ring)
    for _i in _te['edges']:
        _a, _b = _ring[_i], _ring[(_i + 1) % len(_ring)]
        _t = (_b - _a); _L = _t.length; _t.normalize()
        _n = Vector((_t.y, -_t.x))
        if (_cen - _a).dot(_n) > 0:
            _n = -_n
        for _k, ((_d0, _r0), (_d1, _r1)) in enumerate(zip([(0.0, 0.0)] + [tuple(c) for c in _te['courses']], _te['courses'])):
            _mid = (_d0 + 0.9 + _d1) / 2
            _s = 1.3
            while _s < _L - 1.3:
                _p = _a + _t * (_s + _TRNG.uniform(-0.4, 0.4)) + _n * (_mid + _TRNG.uniform(-0.5, 0.5))
                if abs(H(_p.x, _p.y) - (_fl['z'] + _r1)) < 0.3:
                    if _k == 1 and _TRNG.random() < 0.3:
                        place_cypress((_p.x, _p.y), _TRNG, variant='column')
                    else:
                        _TRNG.randrange(4); _TRNG.uniform(1.0, 1.4); _TRNG.randint(0, 999)
                _s += _TRNG.uniform(1.4, 2.0)

if len(lich.faces):
    obj('land_lichen', lich, PAL['lichen'], PT['rock'], family='rock', jitter=0.1)
else:
    lich.free()
print('VEGTRIS', sum(sum(len(p_.vertices) - 2 for p_ in o_.data.polygons) for o_ in bpy.data.objects if o_.type == 'MESH' and o_.name.startswith(('veg_', 'land_boulders', 'land_lichen', 'strata_outcrops'))))
DRNG.seed(9090)          # P5: what follows no longer shifts whenever the vegetation above draws differently

# ------------------------------------------------------------------ QUAY LIFE
LAMP_PTS = []
LAMP_LIGHTS = []         # (x, y, z, kind, colour) -> layout lights
lampb = bmesh.new(); lstone = bmesh.new(); lglass = bmesh.new(); pennb = bmesh.new()
PENN_COLS = []


def lamp(p, z, h=3.6, pennant=None, kind='lamp', stand='tripod'):
    """A bronze tripod lamp stand on the quays and piers, a stone lamp pillar on the lanes and moles: a bronze oil bowl
    with its flame (hb_emissive) at the same height as the old lantern (the `lamps` light contract)."""
    x, y = p
    if stand == 'pillar':
        merge(lstone, bm_box2(x - 0.34, y - 0.34, z, x + 0.34, y + 0.34, z + 0.4))
        merge(lstone, bm_box2(x - 0.22, y - 0.22, z + 0.4, x + 0.22, y + 0.22, z + h + 0.05))
    else:
        for k in range(3):
            a = 2 * math.pi * k / 3 + 0.4
            merge(lampb, nl_kit.beam((x + 0.55 * math.cos(a), y + 0.55 * math.sin(a), z), (x, y, z + h * 0.62), 0.07, 0.07))
        merge(lampb, bm_cyl(0.07, 0.05, h * 0.38 + 0.05, 4, (x, y, z + h * 0.62), cap=False))
    merge(lampb, bm_cyl(0.1, 0.42, 0.3, 6, (x, y, z + h + 0.05), cap=False))
    merge(lglass, bm_cyl(0.3, 0.06, 0.62, 5, (x, y, z + h + 0.22), cap=False))
    LAMP_PTS.append(Vector((x, y, z + h + 0.45)))
    LAMP_LIGHTS.append((x, y, z + h + 0.45, kind, pennant))
    if pennant:      # the chain pennant on its own staff beside the flame
        x += 0.45
        merge(lampb, bm_cyl(0.04, 0.03, 2.6, 4, (x, y, z + h + 0.2)))
        f = bmesh.new()
        vs = [f.verts.new(v) for v in ((x, y, z + h + 2.7), (x + 1.3, y + 0.2, z + h + 2.55), (x + 0.95, y + 0.15, z + h + 2.38),
                                        (x + 1.3, y + 0.2, z + h + 2.2), (x, y, z + h + 2.1))]
        f.faces.new(vs)
        n0 = len(pennb.faces)
        merge(pennb, f)
        PENN_COLS.append((n0, len(pennb.faces), lin(pennant)))


def along_line(line, step, inset, start=None):
    """Points every `step` m along a quay line, `inset` m to its land side, with the tangent."""
    out = []
    Lw = polyline_len(line)
    s = start if start is not None else step / 2
    while s < Lw:
        p, t = along(line, s)
        nl = (-t[1], t[0])
        out.append(((p[0] + nl[0] * inset, p[1] + nl[1] * inset), t, nl))
        s += step
    return out


for name, L in QL.items():
    if name.endswith(('-w', '-e')) or name == 'yard':
        continue
    step = {'grand': 21.0, 'long': 26.0, 'tron': 20.0, 'wharf': 24.0, 'battery': 18.0}.get(name, 22.0)
    for (p, t, nl) in along_line(L, step, 1.8):
        lamp(p, Z_SHORE + 0.06)
for (k, pts, z) in LANES:
    for i in range(3, len(pts) - 2, 9):
        if not in_pad(*pts[i], 1.5):
            lamp(pts[i], z + 0.04, stand='pillar')
for (x, y, z, kind, col) in CJ['lamps']:      # piers: tripods; the moles' and the causeway's crest lamps: stone pillars
    lamp((x, y), z, 3.0 if z < 2 else 3.4, pennant=col if kind == 'pierhead' else None, kind=kind,
         stand='pillar' if kind == 'lamp' and z >= Z_SHORE - 0.01 else 'tripod')
def hearth_lamp(p, z, h=1.7):
    """08-T4/T9: a small bronze fire-bowl on a tripod: a hinterland 'hearth' light (dim layout kind)."""
    x, y = p
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.4
        merge(lampb, nl_kit.beam((x + 0.35 * math.cos(a), y + 0.35 * math.sin(a), z), (x, y, z + h), 0.05, 0.05))
    merge(lampb, bm_cyl(0.08, 0.3, 0.2, 6, (x, y, z + h), cap=False))
    # no flame mesh: the shared lamp emissive would glow at the town's level; the dim 'hearth' sprite is the fire
    LAMP_LIGHTS.append((x, y, z + h + 0.3, 'hearth', None))


hearth_lamp(SANCT_LAMP[0], SANCT_LAMP[1])      # 08-T4: the sanctuary's one lamp at dusk
# 08-T9 (prettier): hinterland hearths - a dim warm point at each farmstead door, the windmill's door, and a wayside
# lantern at two forks of the west road (layout kind 'hearth': under the town lamps, far under the beam)
HEARTHS = 0
for lot in CJ['lots']:
    if lot['style'] in ('farmhouse', 'barn'):
        f_ = Vector(lot['face']); c_ = Vector(lot['c']) + f_ * (lot['d'] / 2 + 0.9)
        LAMP_LIGHTS.append((c_.x, c_.y, lot['z'] + 2.1, 'hearth', None)); HEARTHS += 1
_wf = Vector((-0.34, -0.94)).normalized()
_wd = Vector(CJ['windmill']) + _wf * 4.4
LAMP_LIGHTS.append((_wd.x, _wd.y, H(_wd.x, _wd.y) + 1.9, 'hearth', None)); HEARTHS += 1
for (u_, v_) in ((-202.0, -78.0), (-186.0, -149.0)):          # beside the forks (the footpath to the coast; the south road)
    q_ = wpt(u_, v_)
    hearth_lamp(q_, H(*q_)); HEARTHS += 1
print('HEARTHS', HEARTHS + 1)
obj('lamps_posts', lampb, CP['bronze'], PT['metal'], family='prop_lamp')
obj('lamps_pillars', lstone, CP['lime'], PT['ashlar'], family='prop_lamp', bevel=0.03)
obj('lamps_glass', lglass, mat=M['lamp'], family='prop_lamp', shadow=False)
if len(pennb.faces):
    obj('lamps_pennants', pennb, face=lambda q: (next((c for (a, b, c) in PENN_COLS if a <= q.index < b), PAL['trim']), PT['plain']), family='prop_lamp', jitter=0.0)
else:
    pennb.free()

# festival strings (A graft) along the Vagen promenade and across the hamlet coves: long pennants in the
# polychromy colours on a hemp line, a laurel knot every fifth place
bunt_line = bmesh.new(); bunt = bmesh.new(); bunt_gar = bmesh.new()
BCOLS = [CP['poly_red'], CP['linen'], CP['poly_ochre'], CP['poly_blue'], CP['linen'], CP['shutter_green']]


def bunting(a, b, sag):
    pts = nl_kit.catenary(a, b, sag, 10)
    for p, q in zip(pts, pts[1:]):
        merge(bunt_line, nl_kit.line3(p, q, 0.02))
    n = int((b - a).length / 1.0)
    t = (b - a).normalized()
    for k in range(1, n):
        u_ = k / n
        p = a.lerp(b, u_); p.z -= sag * 4 * u_ * (1 - u_)
        if k % 5 == 0:      # a laurel knot: a little double cone
            merge(bunt_gar, bm_cyl(0.0, 0.3, 0.3, 4, (p.x, p.y, p.z - 0.65))); merge(bunt_gar, bm_cyl(0.3, 0.0, 0.3, 4, (p.x, p.y, p.z - 0.35)))
            continue
        f = bmesh.new()      # a long pennant
        vs = [f.verts.new(v) for v in (tuple(p - t * 0.2), tuple(p + t * 0.2), (p.x, p.y, p.z - 1.0))]
        f.faces.new(vs)
        merge(bunt, f)


gp = along_line(QL['grand'], 21.0, 1.8)
for (p0, _, _), (p1, _, _) in zip(gp, gp[1:]):
    bunting(Vector((p0[0], p0[1], Z_SHORE + 4.3)), Vector((p1[0], p1[1], Z_SHORE + 4.3)), 1.1)
for pid, cv in COVES.items():
    qa, qb = Vector(cv['qa']), Vector(cv['qb']); n_ = Vector(cv['n'])
    a = qa - n_ * 1.6; b = qb - n_ * 1.6
    bunting(Vector((a.x, a.y, Z_SHORE + 4.0)), Vector((b.x, b.y, Z_SHORE + 4.0)), 1.2)
obj('bunting_lines', bunt_line, PAL['rope'], PT['plain'], family='prop_bunting')
obj('bunting_flags', bunt, face=lambda q: (BCOLS[q.index % len(BCOLS)], PT['plain']), family='prop_bunting', jitter=0.0)
obj('bunting_garlands', bunt_gar, face=lambda q: ((CP['olive_leaf'] if q.normal.z > 0.2 else CP['olive_dark']), CV.LEAF_EVERGREEN),
    family='prop_bunting', jitter=0.08)

# market stalls with striped awnings on the Customs square + the promenade (A graft) + fish boxes
stall = bmesh.new(); awn = bmesh.new(); awn_cols = []; boxes = bmesh.new()
STALLS = [(128.0, 13.0), (100.0, 13.0), (144.0, 12.5), (84.0, 13.0)]
for i, (th, dr) in enumerate(STALLS):
    p = Vector(town_pt(th, TOWN['r_quay'] + dr)); fdir = (Vector(town_pt(th, 0)) - p).normalized(); sd = Vector((-fdir.y, fdir.x))
    ang = math.atan2(sd.y, sd.x)
    sb = bmesh.new()
    merge(sb, bm_box2(-2.0, -0.6, Z_SHORE, 2.0, 0.6, Z_SHORE + 1.0))
    for dx in (-1.9, 1.9):
        for dy in (-1.3, 0.5):
            merge(sb, bm_box2(dx - 0.06, dy - 0.06, Z_SHORE, dx + 0.06, dy + 0.06, Z_SHORE + 2.6))
    xf(sb, rz=ang + math.pi); xf(sb, loc=(p.x, p.y, 0)); merge(stall, sb)
    col = (CP['poly_red'], CP['poly_blue'], CP['shutter_green'], CP['poly_ochre'], CP['poly_red'])[i % 5]     # linen + one dyed panel
    for k in range(8):
        x0 = -2.2 + k * 0.55
        b = bm_box2(x0, -1.7, -0.03, x0 + 0.55, 0.7, 0.03)
        for v in b.verts:
            v.co.z += Z_SHORE + 2.6 + (v.co.y - 0.7) * -0.35
        xf(b, rz=ang + math.pi); xf(b, loc=(p.x, p.y, 0))
        n0 = len(awn.faces); merge(awn, b)
        awn_cols.append((n0, len(awn.faces), col if k % 2 == 0 else CP['linen']))
    bx = bmesh.new()
    for k in range(6):
        merge(bx, bm_box2(-1.8 + k * 0.62, -0.5, Z_SHORE + 1.0, -1.25 + k * 0.62, 0.5, Z_SHORE + 1.25))
    xf(bx, rz=ang + math.pi); xf(bx, loc=(p.x, p.y, 0)); merge(boxes, bx)
obj('quay_stalls', stall, PAL['timber'], PT['boards'], family='prop_stall')
obj('quay_awnings', awn, face=lambda q: (next((c for (a, b, c) in awn_cols if a <= q.index < b), PAL['trim']), PT['plain']), family='prop_stall', jitter=0.0)
obj('quay_fishboxes', boxes, face=lambda q: ((CP['timber_grey'] if int(q.center.x * 10) % 3 else CP['clay']), PT['boards']), family='prop_stall')

# crates, barrels, nets, coils along the aprons
cr, br, nets, corks, coils = (bmesh.new() for _ in range(5))
CLUTTER = []
for name, L in QL.items():
    if name.endswith(('-w', '-e')) or name == 'yard':
        continue
    for (p, t, nl) in along_line(L, {'grand': 34.0, 'long': 30.0, 'wharf': 18.0}.get(name, 26.0), 4.5, start=9.0):
        if not in_pad(*p, 2.0):
            CLUTTER.append((p, t, DRNG.randint(3, 6)))
for (p, t, n) in CLUTTER:
    tv = Vector((t[0], t[1])); nv = Vector((-t[1], t[0])); c0 = Vector(p)
    ang = math.atan2(t[1], t[0])
    for k in range(n):
        q = c0 + tv * ((k % 3) * 1.1) + nv * ((k // 3) * 0.9)
        nl_kit.crate(cr, (q.x, q.y, Z_SHORE + 0.06 + (0.75 if k == n - 1 and n > 3 else 0)), DRNG.uniform(0.8, 1.0), ang + DRNG.uniform(-0.2, 0.2))
    for k in range(DRNG.randint(1, 3)):
        q = c0 + tv * (4.0 + k * 0.85)
        nl_kit.barrel(br, (q.x, q.y, Z_SHORE + 0.06), DRNG.uniform(0.9, 1.05))
    if DRNG.random() < 0.6:
        r = DRNG.uniform(0.9, 1.4); q = c0 - tv * 2.5
        merge(nets, bm_ico(r, (q.x, q.y, Z_SHORE + 0.15), 2, (1.3, 1.0, 0.42), seed=int(abs(q.x)), amp=0.25))
        for k in range(5):
            a = DRNG.uniform(0, 6.28)
            merge(corks, bm_pebble(0.17, (q.x + math.cos(a) * r, q.y + math.sin(a) * r * 0.8, Z_SHORE + 0.45), seed=k))
for (x, y, z) in CJ['bollards'][::7]:
    t = bm_cyl(0.5, 0.5, 0.18, 10, (x + 1.2, y, z)); merge(t, bm_cyl(0.32, 0.32, 0.2, 10, (x + 1.2, y, z + 0.18)))
    merge(coils, t)
obj('props_crates', cr, PAL['timber'], PT['boards'], family='prop_crate', jitter=0.14, bevel=0.03)
obj('props_barrels', br, face=lambda q: ((PAL['timber_dark'] if (q.center.z % 0.45) < 0.08 else PAL['timber']), PT['boards']), family='prop_barrel', jitter=0.05)
obj('props_nets', nets, lin('#596B52'), PT['leaf'], family='prop_nets', jitter=0.1, smooth=True)
obj('props_corks', corks, face=lambda q: ((PAL['wall_ochre'] if q.index % 40 < 20 else PAL['brand_red']), 0), family='prop_nets')
obj('props_coils', coils, PAL['rope'], PT['plain'], family='prop_rope', jitter=0.05)

# benches on the squares + lanes: stone exedra seats (a slab on two blocks, a low back)
bench = bmesh.new()
for (th, r_, k) in ((126.0, 60.0, 2), (62.0, 60.0, 2), (134.0, 14.0, 0)):
    p = Vector(town_pt(th, TOWN['r_quay'] + r_)); z = RINGS[k][2]
    fdir = (Vector(town_pt(th, 0)) - p).normalized(); ang = math.atan2(fdir.y, fdir.x) + math.pi / 2
    b = bmesh.new()
    merge(b, bm_box2(-1.1, -0.3, 0.38, 1.1, 0.3, 0.52)); merge(b, bm_box2(-1.1, 0.22, 0.52, 1.1, 0.42, 0.95))
    for dx in (-0.8, 0.8):
        merge(b, bm_box2(dx - 0.2, -0.25, 0, dx + 0.2, 0.25, 0.38))
    xf(b, rz=ang); xf(b, loc=(p.x, p.y, z)); merge(bench, b)
obj('props_benches', bench, CP['lime'], PT['ashlar'], family='prop_bench', bevel=0.03)


def hand_crane(name, cx_, cy_, z, rz=0.0, col='hull_red'):
    """A timber A-frame derrick on a stone sill: two raked legs leaning out over the water (local -y), a back-stay to a
    stone anchor, a windlass between the feet, the fall and its block; a pennant in `col` at the head."""
    tim, stn, rope, pen = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    apex = (0.0, -3.6, 7.2)
    merge(stn, bm_box2(-1.7, -0.6, 0, 1.7, 0.9, 0.45)); merge(stn, bm_box2(-0.5, 3.6, 0, 0.5, 4.4, 0.8))
    for s in (-1, 1):
        merge(tim, nl_kit.beam((s * 1.35, 0.15, 0.45), apex, 0.26, 0.26))
    merge(tim, nl_kit.beam((-1.15, 0.15, 1.05), (1.15, 0.15, 1.05), 0.36, 0.36))             # the windlass drum
    for s in (-1, 1):
        merge(tim, nl_kit.beam((s * 1.2, 0.15, 1.05), (s * 1.2, 0.15 + 0.5, 1.55), 0.08, 0.08))  # its handspikes
    merge(tim, nl_kit.beam((-0.9, -1.9, 4.0), (0.9, -1.9, 4.0), 0.14, 0.14))                # the cross-tie
    merge(rope, nl_kit.line3(apex, (0.0, 4.0, 0.8), 0.04))
    merge(rope, nl_kit.line3(apex, (0.0, -3.6, 2.4), 0.035))
    merge(rope, nl_kit.line3((0.0, 0.15, 1.05), apex, 0.03))
    merge(tim, bm_box2(-0.25, -3.85, 1.9, 0.25, -3.35, 2.45))
    vs = [pen.verts.new(v) for v in ((0.0, -3.6, 7.3), (0.0, -3.6, 8.3), (1.4, -3.5, 7.95), (0.0, -3.6, 7.65))]
    pen.faces.new(vs)
    merge(tim, bm_cyl(0.04, 0.04, 1.1, 4, apex))
    for bm_ in (tim, stn, rope, pen):
        xf(bm_, rz=rz); xf(bm_, loc=(cx_, cy_, z))
    obj(name, tim, CP['oak_dark'], PT['boards'], family='prop_crane')
    obj(name + '_sill', stn, CP['lime'], PT['ashlar'], family='prop_crane')
    obj(name + '_rope', rope, PAL['rope'], PT['plain'], family='prop_crane')
    obj(name + '_pennant', pen, PAL[col] if col in PAL else CP[col], PT['plain'], family='prop_crane', jitter=0.0)


def crane_on(line, s_, name, col='hull_red'):
    p, t = along(line, polyline_len(line) * s_)
    nl = (-t[1], t[0])
    c = (p[0] + nl[0] * 2.0, p[1] + nl[1] * 2.0)
    hand_crane(name, c[0], c[1], Z_SHORE, rz=math.atan2(-nl[0], nl[1]), col=col)      # jib (local -y) out over the water


crane_on(QL['grand'], 0.82, 'crane_vagen', 'poly_red')
crane_on(QL['wharf'], 0.55, 'crane_wharf', 'wall_ochre')
crane_on(QL['long'], 0.15, 'crane_longquay', 'poly_blue')

# ------------------------------------------------------------------ HAMLET CHARACTERS (in each cove's own frame)
def cove_pt(cv, along_t, out_n):
    return tuple(Vector(cv['back']) + Vector(cv['t']) * along_t + Vector(cv['n']) * out_n)


def cove_rz(cv):
    n_ = cv['n']
    return math.atan2(n_[0], -n_[1])


cv = COVES['pier-hyperliquid-l1']; p = cove_pt(cv, cv['hw'] - 3, -3)
beacon_column('hamlet_hyper_beacon', p, Z_SHORE, Z_SHORE + 3.4, lin('#5FD3BC'), 'hamlet', base_r=1.7, flame=lin('#5FD3BC'))  # sea-green: the chain
LAMP_PTS.append(Vector((p[0], p[1], Z_SHORE + 3.9))); LAMP_LIGHTS.append((p[0], p[1], Z_SHORE + 3.9, 'pierhead', '#5FD3BC'))
# Polygon: boatyard - a hull on stocks + timber stacks
cv = COVES['pier-polygon']
P_ = dict(br=0.3, fb=0.11, dr=0.06, bow=2.2, stern=0.6, sheer=(0.3, 0.15), bulwark=0.2)
hc = dict(top=PAL['timber'], band=PAL['timber'], stripe=PAL['timber'], rail=PAL['timber_dark'], boot=PAL['timber'], bottom=PAL['antifoul'],
          deck=PAL['timber'], deck_in=PAL['timber'], transom=PAL['timber'])
hb_, names, D_ = nl_kit.hull_mesh(12.0, P_, hc, n=10)
lay = hb_.faces.layers.int.get('seg'); segs = {f.index: names[f[lay]] for f in hb_.faces}
p = cove_pt(cv, -cv['hw'] - 12, -10)
xf(hb_, loc=(p[0], p[1], H(*p) + 1.6), rz=cove_rz(cv) + math.radians(90))
obj('hamlet_polygon_hull_on_stocks', hb_, face=lambda q: ((PAL['antifoul'] if segs.get(q.index) == 'bottom' else PAL['timber']), PT['strakes']), family='hamlet')
stk = bmesh.new()
for k in range(5):
    q = cove_pt(cv, -cv['hw'] - 16 + k * 2.4, -14)
    merge(stk, nl_kit.obox((q[0], q[1], H(*q) + 0.6), tuple(cv['n']) + (0,), 4.0, 0.6, 1.2 + (0.4 if k in (1, 3) else 0)))
obj('hamlet_polygon_stocks', stk, PAL['timber_dark'], PT['boards'], family='hamlet')
# Arbitrum: rope-walk - a long low shed + coils
cv = COVES['pier-arbitrum']
p = cove_pt(cv, 0, -30); rz_ = cove_rz(cv); zr = H(*p)
rw = bm_box2(-14, -2.25, -1.5, 14, 2.25, 2.6); xf(rw, rz=rz_); xf(rw, loc=(p[0], p[1], zr))
obj('hamlet_arbitrum_ropewalk', rw, CV.mix(CP['wash_white'], PAL['wall_blue'], 0.6), PT['render'], family='hamlet', bevel=0.04)
rr_ = bmesh.new()
vs = [rr_.verts.new(v) for v in ((-14.3, -2.65, 2.6), (14.3, -2.65, 2.6), (14.3, 0, 3.8), (-14.3, 0, 3.8), (-14.3, 2.65, 2.6), (14.3, 2.65, 2.6))]
rr_.faces.new((vs[0], vs[1], vs[2], vs[3])); rr_.faces.new((vs[3], vs[2], vs[5], vs[4]))
xf(rr_, rz=rz_); xf(rr_, loc=(p[0], p[1], zr))
obj('hamlet_arbitrum_ropewalk_roof', rr_, CP['tile_b'], PT['tiles'], family='hamlet')
coils2 = bmesh.new()
for k in range(5):
    q = cove_pt(cv, -10 + k * 4.5, -24)
    merge(coils2, bm_cyl(0.7, 0.7, 0.35, 12, (q[0], q[1], H(*q)))); merge(coils2, bm_cyl(0.45, 0.45, 0.38, 12, (q[0], q[1], H(*q) + 0.35)))
obj('hamlet_arbitrum_coils', coils2, PAL['rope'], PT['plain'], family='hamlet')
# Base: hjell drying racks of stockfish
cv = COVES['pier-base']
racks = bmesh.new(); fish = bmesh.new()
for (at, an) in ((-cv['hw'] - 10, -16), (cv['hw'] + 8, -18)):
    o = Vector(cove_pt(cv, at, an)); tt = Vector(cv['t']); nn_ = Vector(cv['n'])
    z = H(o.x, o.y)
    L_ = 9.0
    for k in range(3):
        yy = o - nn_ * (k * L_ / 2)
        for s in (-1, 1):
            merge(racks, nl_kit.beam((yy.x, yy.y, z), (yy.x + tt.x * s * 0.9, yy.y + tt.y * s * 0.9, z + 2.6), 0.14, 0.14))
    e = o - nn_ * L_
    merge(racks, nl_kit.beam((o.x, o.y, z + 2.45), (e.x, e.y, z + 2.45), 0.14, 0.14))
    for s in (-0.5, 0.5):
        a_ = o + tt * s; b_ = e + tt * s
        merge(racks, nl_kit.beam((a_.x, a_.y, z + 1.6), (b_.x, b_.y, z + 1.6), 0.1, 0.1))
    for k in range(20):
        yy = o - nn_ * (0.2 + k * (L_ - 0.4) / 19)
        for off_, zz in ((-0.5, z + 1.6), (0.5, z + 1.6), (0.0, z + 2.45)):
            q = yy + tt * off_
            merge(fish, bm_box(0.14, 0.12, 0.7, (q.x, q.y, zz - 0.4)))
obj('hamlet_base_hjell', racks, PAL['timber_grey'], PT['plain'], family='hamlet')
obj('hamlet_base_stockfish', fish, lin('#B8A07A'), PT['plain'], family='hamlet', jitter=0.15)
# Solana: merchant wharf crane; BSC: lumber stacks + an ochre crane
cv = COVES['pier-solana']
p = cove_pt(cv, -cv['hw'] + 4, -4); hand_crane('hamlet_solana_crane', p[0], p[1], Z_SHORE, rz=cove_rz(cv) + 0.3, col='brand_violet')
cv = COVES['pier-bsc']
lum = bmesh.new()
for k in range(3):
    q = cove_pt(cv, -cv['hw'] + 6 + k * 3.6, -5)
    for j in range(4):
        merge(lum, nl_kit.obox((q[0], q[1], H(*q) + j * 0.42 + 0.19), tuple(cv['n']) + (0,), 4.5, 2.8, 0.38))
obj('hamlet_bsc_lumber', lum, PAL['timber'], PT['plain'], family='hamlet', jitter=0.1)
p = cove_pt(cv, cv['hw'] - 4, -4); hand_crane('hamlet_bsc_crane', p[0], p[1], Z_SHORE, rz=cove_rz(cv) - 0.3, col='wall_ochre')

# ------------------------------------------------------------------ STRANDS (v4): Wreck Cove's driftwood & stakes, cove dinghies & net posts, cove rocks
# Phase 4C handover: tiny shore `strand_pebbles` and dune `strand_marram` are stripped from island.glb
# (covered cleanly by hb_terrain coastal shingle + Phase 4C groundcover.bin dune grass/coastal archetypes).
drift_w, stakes, dinghy, dinghy_in, crock = (bmesh.new() for _ in range(5))
SRNG = random.Random(4242)


def strand_pts(line, step, inland0, inland1, rng):
    out = []
    Ls = polyline_len(line); s_ = rng.uniform(0, step)
    while s_ < Ls:
        p, t = along(line, s_)
        nl = Vector((-t[1], t[0]))
        q = Vector(p) + nl * rng.uniform(inland0, inland1) + Vector(t) * rng.uniform(-step * 0.4, step * 0.4)
        out.append((q, Vector(t), nl))
        s_ += step * rng.uniform(0.6, 1.4)
    return out


for b in CJ.get('beaches', []):
    line = [tuple(p) for p in b['line']]
    if b['kind'] == 'sand':
        for (q, t, nl) in strand_pts(line, 4.2, 41.0, 46.0, SRNG):               # driftwood under the dunes
            if not point_in_poly(q.x, q.y, COAST):
                continue
            a_ = math.atan2(t.y, t.x) + SRNG.uniform(-0.6, 0.6); L_ = SRNG.uniform(2.8, 7.5); r_ = SRNG.uniform(0.16, 0.34)
            d_ = Vector((math.cos(a_), math.sin(a_)))
            pa, pb = q - d_ * L_ / 2, q + d_ * L_ / 2
            merge(drift_w, nl_kit.beam((pa.x, pa.y, H(pa.x, pa.y) + r_ * 0.7), (pb.x, pb.y, H(pb.x, pb.y) + r_ * 0.7), r_ * 2, r_ * 1.7))
            if SRNG.random() < 0.4:                                               # a root boss
                merge(drift_w, bm_ico(r_ * 1.9, (pa.x, pa.y, H(pa.x, pa.y) + r_), 1, (1.0, 1.0, 0.8), seed=SRNG.randint(0, 99), amp=0.4))
        for (q, t, nl) in strand_pts(line, 13.0, -9.0, -3.0, SRNG):              # old stakes in the shallows, leaning
            lean = SRNG.uniform(-0.25, 0.25)
            top = q + nl * lean * 2.0
            merge(stakes, nl_kit.beam((q.x, q.y, -1.6), (top.x, top.y, SRNG.uniform(1.2, 2.4)), 0.28, 0.28))
    else:
        n_d = SRNG.randint(1, 2)
        for k in range(n_d):                                                      # dinghies drawn up, keel to the sky
            p, t = along(line, polyline_len(line) * SRNG.uniform(0.25, 0.85))
            nl = Vector((-t[1], t[0])); q = Vector(p) + nl * SRNG.uniform(3.0, 5.5)
            hb_, _nm, _D = nl_kit.hull_mesh(4.2, dict(br=0.36, fb=0.14, dr=0.05, bow=2.0, stern=0.7, sheer=(0.3, 0.15), bulwark=0.1), {}, n=8)
            xf(hb_, rx=math.pi, rz=math.atan2(nl.y, nl.x) + SRNG.uniform(-0.5, 0.5))
            xf(hb_, loc=(q.x, q.y, H(q.x, q.y) + 0.62))
            merge(dinghy if k % 2 == 0 else dinghy_in, hb_)
        for (q, t, nl) in strand_pts(line, 6.0, 7.0, 8.5, SRNG):                 # net posts + a line between
            z0 = H(q.x, q.y)
            merge(stakes, bm_cyl(0.09, 0.07, 2.1, 5, (q.x, q.y, z0 - 0.2)))
for (x, y, r) in CJ.get('cove_rocks', []):
    merge(crock, bm_ico(r, (x, y, SRNG.uniform(-0.4, 0.2)), 1, (1.25, 1.0, 0.8), seed=int(abs(x * 3 + y)), amp=0.35))
    if SRNG.random() < 0.5:
        merge(crock, bm_ico(r * 0.55, (x + r * 0.9, y - r * 0.4, -0.3), 1, (1.2, 1.0, 0.7), seed=int(abs(x + y * 3)), amp=0.3))
obj('strand_driftwood', drift_w, face=lambda q: ((lin('#C9BCA6') if q.normal.z > 0.3 else lin('#9C8F7C')), PT['plain']), family='prop_crate', jitter=0.08)
obj('strand_stakes', stakes, lin('#5A4B3E'), PT['plain'], family='prop_crate', jitter=0.1)
obj('strand_dinghies', dinghy, face=lambda q: ((PAL['hull_blue'] if q.normal.z > -0.3 else PAL['hull_white']), PT['strakes']), family='prop_crate', jitter=0.05)
obj('strand_dinghies_red', dinghy_in, face=lambda q: ((PAL['hull_red'] if q.normal.z > -0.3 else PAL['hull_white']), PT['strakes']), family='prop_crate', jitter=0.05)
obj('cove_rocks', crock, face=lambda q: ((PAL['rock_wet'] if q.center.z < 0.35 else (PAL['rock_light'] if q.normal.z > 0.5 else PAL['rock'])), PT['rock']), family='rock', jitter=0.08)

# ------------------------------------------------------------------ SKERRIES: limestone humps, a grass cap, wind-sheared pines (HBVG v1)
from mathutils.geometry import tessellate_polygon
for i, sk in enumerate(CJ['skerries']):
    poly = [tuple(p) for p in sk['poly']]
    cx_ = sum(p[0] for p in poly) / len(poly); cy_ = sum(p[1] for p in poly) / len(poly)
    top = sk['top']
    coast_skirt(f'skerry_{i}', poly, lambda x, y, top=top: top * 0.55, lambda x, y: False, rows=3, amp=1.4, seed=40 + i, jag=1.2)
    capb = bmesh.new(); rings = []
    for r_, z_ in ((1.0, top * 0.55), (0.72, top * 0.85), (0.4, top)):
        rings.append([capb.verts.new((cx_ + (x - cx_) * r_, cy_ + (y - cy_) * r_, z_ + noise.noise(Vector((x * 0.2, y * 0.2, r_))) * 0.3)) for x, y in poly])
    for a_, b_ in zip(rings, rings[1:]):
        for k in range(len(poly)):
            j = (k + 1) % len(poly)
            capb.faces.new((a_[k], a_[j], b_[j], b_[k]))
    for (i0, i1, i2) in tessellate_polygon([[v.co for v in rings[-1]]]):
        try:
            capb.faces.new((rings[-1][i0], rings[-1][i1], rings[-1][i2]))
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(capb, faces=capb.faces)
    g_ = sk['grass']
    obj(f'skerry_{i}_cap', capb, face=lambda q, g_=g_: ((PAL['grass_dark'] if (g_ and q.normal.z > 0.75) else (PAL['rock_light'] if q.normal.z > 0.5 else PAL['rock'])),
                                                       PT['grass'] if (g_ and q.normal.z > 0.75) else PT['rock']), family='rock', jitter=0.06)
    if g_:
        for k in range(3):
            sp = (cx_ + DRNG.uniform(-5, 5), cy_ + DRNG.uniform(-3, 3))
            _skrng = random.Random(i * 31 + k)
            _th = DRNG.uniform(5.2, 7.8)
            _sy = _th / VEG_NOM_H['pine_sheared']
            emit_veg('pine_sheared', sp[0], sp[1], top - 0.35, WIND_YAW + _skrng.uniform(-0.22, 0.22), _sy * _skrng.uniform(0.92, 1.10), _sy, _skrng)
            TREES['pine'] += 1
    CIRCLES_EXTRA.append((cx_, cy_, 1.0))

# Write final HBVG v1 vegetation instance binary (hero trees + modular contour vineyard rows + skerry pines)
write_veg_instances_bin()

# ------------------------------------------------------------------ SHOALS reef: rocks + cardinal buoys; MOORING buoys; FAR PORTS rafts
rk = bmesh.new()
for (x, y, r) in CJ['shoals']['rocks']:
    merge(rk, bm_ico(r, (x, y, DRNG.uniform(-0.5, 0.4)), 1, (1.3, 1.0, 0.7), seed=int(x * 7 + y), amp=0.35))
obj('shoals_rocks', rk, face=lambda q: ((PAL['rock_wet'] if q.center.z < 0.35 else PAL['rock']), PT['rock']), family='shoals', jitter=0.08)
cb = bmesh.new()
for (x, y) in CJ['shoals']['buoys']:
    merge(cb, bm_cyl(0.75, 0.85, 1.2, 8, (x, y, -0.3)))
    merge(cb, bm_cyl(0.12, 0.12, 3.0, 6, (x, y, 0.9)))
    merge(cb, bm_cyl(0.0, 0.55, 0.8, 8, (x, y, 3.7)))
    merge(cb, bm_cyl(0.55, 0.0, 0.8, 8, (x, y, 4.5)))
obj('shoals_buoys', cb, face=lambda q: ((PAL['hull_red'] if int((q.center.z + 0.3) / 0.75) % 2 == 0 else PAL['wall_white']), PT['plain']), family='shoals')
# P6 (D18): the reef beacon - classical-town Q6 / integration G3: a squat stone daymark on the reef's biggest rock, a
# broad drum painted in red and white bands (the hazard colours stay), a bronze fire-bowl on top burning red
_bc = CJ['shoals']['beacon']
bb_, bt_, bm_, bf_ = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
merge(bb_, bm_cyl(3.6, 3.0, 2.2, 14, (_bc[0], _bc[1], -1.5)))
for k in range(4):         # the lowest band sits in the reef rocks; three read above them
    merge(bt_, bm_cyl(2.2 - 0.12 * k, 2.2 - 0.12 * (k + 1), 0.9, 10, (_bc[0], _bc[1], 0.7 + k * 0.9), cap=(k == 3), rot=math.pi / 10))
merge(bm_, bm_cyl(1.9, 1.9, 0.2, 10, (_bc[0], _bc[1], 4.3), rot=math.pi / 10))
merge(bm_, bm_cyl(0.32, 0.38, 0.3, 8, (_bc[0], _bc[1], 4.5)))
merge(bm_, bm_cyl(0.42, 1.38, 0.62, 12, (_bc[0], _bc[1], 4.75)))
for k in range(5):
    a_ = 2 * math.pi * k / 5 + 0.3
    merge(bf_, bm_cyl(0.34, 0.0, 0.95 + 0.25 * (k % 2), 5, (_bc[0] + math.cos(a_) * 0.62, _bc[1] + math.sin(a_) * 0.62, 5.33)))
obj('shoals_beacon_base', bb_, face=lambda q: ((PAL['rock_wet'] if q.center.z < 0.3 else PAL['granite']), PT['rock']), family='shoals', jitter=0.06)
obj('shoals_beacon_tower', bt_, face=lambda q: ((PAL['hull_red'] if int((q.center.z - 0.7) / 0.9) % 2 == 1 else PAL['wall_white']), PT['render']), family='shoals', bevel=0.03)
obj('shoals_beacon_daymark', bm_, CP['bronze'], PT['metal'], family='shoals')
obj('shoals_beacon_flame', bf_, lin('#E8432C'), PT['plain'], family='shoals', jitter=0.0, shadow=False)
obj('shoals_beacon_lamp', bm_cyl(0.8, 0.06, 1.5, 7, (_bc[0], _bc[1], 5.25)), mat=M['beacon_red'], family='shoals', shadow=False)
LAMP_PTS.append(Vector((_bc[0], _bc[1], 5.95)))
mb = bmesh.new()
for m_ in CJ['moorings']:
    x, y = m_['buoy']
    merge(mb, bm_cyl(0.45, 0.2, 0.55, 5, (x, y, -0.15)))
obj('mooring_buoys', mb, face=lambda q: ((PAL['hull_red'] if q.normal.z > 0.5 else lin('#E8E2D6')), PT['plain']), family='mooring')
fr, fpile, ffloat = bmesh.new(), bmesh.new(), bmesh.new()
for (a, b) in CJ['far']['rafts']:
    L_ = math.hypot(b[0] - a[0], b[1] - a[1])
    dx, dy = (b[0] - a[0]) / L_, (b[1] - a[1]) / L_
    # plank deck in short sections (a slight stagger reads as separate floating pontoon units), drum floats below
    n_sec = max(1, int(L_ / 7.5))
    for k in range(n_sec):
        t0, t1 = k * L_ / n_sec + 0.15, (k + 1) * L_ / n_sec - 0.15
        za = 0.32 + 0.04 * math.sin(k * 1.7)
        merge(fr, nl_kit.beam((a[0] + dx * t0, a[1] + dy * t0, za), (a[0] + dx * t1, a[1] + dy * t1, za), 2.2, 0.22))
        for t in (t0 + 1.2, t1 - 1.2):
            merge(ffloat, nl_kit.beam((a[0] + dx * t - dy * 0.7, a[1] + dy * t + dx * 0.7, 0.02), (a[0] + dx * t + dy * 0.7, a[1] + dy * t - dx * 0.7, 0.02), 1.0, 0.4))
    # mooring piles standing proud of the deck every other section, a cleat between
    for k in range(int(L_ / 9) + 1):
        t = min(L_, k * 9.0)
        for sd in (-1.25, 1.25):
            q = (a[0] + dx * t - dy * sd, a[1] + dy * t + dx * sd)
            merge(fpile, bm_cyl(0.24, 0.22, 3.6, 7, (q[0], q[1], -1.6)))
            merge(fpile, bm_cyl(0.27, 0.0, 0.25, 7, (q[0], q[1], 2.0)))
# P6 (D18): the buoyed anchorage - a marker-light post at each raft's head and tail (amber), yellow buoys round the field
fpost, flamp, fbuoy = bmesh.new(), bmesh.new(), bmesh.new()
for (a, b) in CJ['far']['rafts']:
    L_ = math.hypot(b[0] - a[0], b[1] - a[1]); dx, dy = (b[0] - a[0]) / L_, (b[1] - a[1]) / L_
    for (q, sg) in ((a, -1), (b, 1)):
        p_ = (q[0] + dx * sg * 1.6, q[1] + dy * sg * 1.6)
        merge(fpost, bm_cyl(0.32, 0.26, 7.4, 8, (p_[0], p_[1], -2.4)))
        merge(fpost, bm_cyl(0.55, 0.55, 0.16, 8, (p_[0], p_[1], 4.9)))
        merge(fpost, bm_cyl(0.5, 0.0, 0.5, 8, (p_[0], p_[1], 5.9)))
        merge(flamp, bm_cyl(0.36, 0.36, 0.8, 8, (p_[0], p_[1], 5.05)))
        LAMP_PTS.append(Vector((p_[0], p_[1], 5.45))); LAMP_LIGHTS.append((p_[0], p_[1], 5.45, 'pierhead', '#FFB347'))
# P7 (acceptance #6): the Far Ports are a buoyed anchorage (every hull on its own swinging mooring; the runtime draws those
# buoys). Round it, lit special-mark pillar buoys: a yellow float, a short lattice pillar, an X topmark, an amber light.
# Derive the 9 perimeter marks from the committed layout.json Far Ports moorings (CJ_LAYOUT) so an untracked local
# compose.json with fewer far moorings can never shrink the marker ring inside the active fleet.
def _far_marks_from_layout(layout_dict):
    far_m = [m for m in (layout_dict or {}).get('moorings', []) if str(m.get('id', '')).startswith('far/')]
    if not far_m:
        return list(CJ['far'].get('buoys', []))
    from scipy.spatial import ConvexHull
    pts = []
    for m in far_m:
        bx, _by, bz = m['position']
        cx, _cy, cz = m['boatCenter']
        p0 = (float(bx), float(-bz))
        # Stern lies roughly at buoy + 2 * (boatCenter - buoy); also include swing circle envelope (+12 m clearance)
        p1 = (float(2.0 * cx - bx), float(-(2.0 * cz - bz)))
        for q in (p0, p1):
            for k in range(12):
                ang = 2.0 * math.pi * k / 12.0
                pts.append((q[0] + 12.0 * math.cos(ang), q[1] + 12.0 * math.sin(ang)))
    h = ConvexHull(pts)
    poly = [tuple(pts[i]) for i in h.vertices]
    # Ensure counter-clockwise winding matching compose.py:ccw()
    area2 = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    if area2 < 0:
        poly.reverse()
    ring = poly + poly[:1]
    segs = [math.hypot(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1]) for i in range(len(poly))]
    total_l = sum(segs)
    out = []
    for k in range(9):
        target = total_l * (k + 0.5) / 9.0
        acc = 0.0
        for i, dl in enumerate(segs):
            if acc + dl >= target or i == len(segs) - 1:
                t = max(0.0, min(1.0, (target - acc) / max(dl, 1e-9)))
                out.append((ring[i][0] + (ring[i + 1][0] - ring[i][0]) * t, ring[i][1] + (ring[i + 1][1] - ring[i][1]) * t))
                break
            acc += dl
    return out


_FAR_BUOYS = _far_marks_from_layout(globals().get('CJ_LAYOUT'))
for p_ in _FAR_BUOYS:
    x, y = p_
    merge(fbuoy, bm_cyl(1.0, 1.15, 1.3, 10, (x, y, -0.45)))
    merge(fbuoy, bm_cyl(0.75, 0.55, 0.35, 10, (x, y, 0.85)))
    for k in range(3):
        a_ = 2 * math.pi * k / 3
        merge(fpost, nl_kit.beam((x + math.cos(a_) * 0.55, y + math.sin(a_) * 0.55, 1.1), (x + math.cos(a_) * 0.18, y + math.sin(a_) * 0.18, 3.6), 0.09, 0.09))
    for sg in (-1, 1):                                       # the X topmark (special mark), faced to the default camera
        merge(fbuoy, nl_kit.beam((x - 0.55, y - 0.55 * sg, 4.1 - 0.45), (x + 0.55, y + 0.55 * sg, 4.1 + 0.45), 0.16, 0.12))
    merge(flamp, bm_cyl(0.2, 0.2, 0.42, 8, (x, y, 3.55)))
    LAMP_PTS.append(Vector((x, y, 3.8))); LAMP_LIGHTS.append((x, y, 3.8, 'pierhead', '#FFB347'))
for _nm, _bm, _kw in (('far_ports_marker_posts', fpost, dict(color=PAL['iron'], pattern=PT['metal'], jitter=0.05)),
                      ('far_ports_marker_lamps', flamp, dict(mat=M['lamp'], shadow=False)),
                      ('far_ports_buoys', fbuoy, dict(color=lin('#E8C33A'), pattern=PT['plain'], jitter=0.05)),
                      ('far_ports_rafts', fr, dict(color=PAL['timber_grey'], pattern=PT['plain'], jitter=0.08)),
                      ('far_ports_piles', fpile, dict(color=PAL['timber_dark'], pattern=PT['plain'], jitter=0.06)),
                      ('far_ports_floats', ffloat, dict(color=lin('#3A3F42'), pattern=PT['plain'], jitter=0.04))):
    if len(_bm.faces):
        obj(_nm, _bm, family='far_ports', **_kw)
    else:
        _bm.free()

# ------------------------------------------------------------------ P7 (operator c): Wreck Cove dressed from the wreck kit v2
# The 88 dead are the runtime's (layout zones.wreckCove: slots + the memorial arc). Here, the cove itself: its static props
# (compose.py WRECK_PROPS, imported from the wreck builder's raw GLBs and baked into island.glb), boulders among the small
# wrecks, a dark wrack line of weed and drift above the tide, shingle bands at the waterline, marram grass on the dunes.
WK_RAW = os.path.join(ROOT, 'outputs/harbour/wrecks/raw')
_WK_MAT = {'hb_window': 'window', 'hb_emissive': 'lamp', 'hb_fire': 'lamp', 'hb_glass': 'lantern_glass'}


def _wk_col(me):
    """The kit's COLOR_0 (rgb albedo, a = pattern id / 16) as the island's 'Col' (FLOAT_COLOR, CORNER)."""
    ca = me.color_attributes
    n = len(me.loops)
    buf = np.ones((n, 4), np.float32)
    src = ca.get('Color') or (ca[0] if len(ca) else None)
    if src is not None:
        if src.domain == 'CORNER':
            tmp = np.zeros(n * 4, np.float32); src.data.foreach_get('color', tmp); buf = tmp.reshape(-1, 4)
        else:
            tmp = np.zeros(len(me.vertices) * 4, np.float32); src.data.foreach_get('color', tmp); tmp = tmp.reshape(-1, 4)
            li = np.zeros(n, np.int64); me.loops.foreach_get('vertex_index', li); buf = tmp[li]
    for nm_ in [a.name for a in ca]:
        ca.remove(ca[nm_])
    col = ca.new('Col', 'FLOAT_COLOR', 'CORNER'); col.data.foreach_set('color', buf.ravel())


def wk_import(kit, c, bow, k, z):
    path = os.path.join(WK_RAW, kit + '.glb')
    if not os.path.exists(path):
        print('WRECK KIT missing', path)
        return []
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for cl in list(o.users_collection):
            cl.objects.unlink(o)
        cur_coll().objects.link(o)
    root = empty('wk_' + kit, (c[0], c[1], z), (0.0, 0.0, math.atan2(bow[1], bow[0])), family='wreck')
    root.scale = (k, k, k)
    for o in new:
        if o.parent is None:
            o.parent = root
        o['family'] = 'wreck'
        if o.type == 'MESH':
            _wk_col(o.data)
            for i, m in enumerate(o.data.materials):
                nm = (m.name if m else 'hb_opaque').split('.')[0]
                o.data.materials[i] = M[_WK_MAT.get(nm, 'kit')]
    bpy.context.view_layer.update()
    for o in new:                                            # the hut's and the station's lanterns light at night
        if o.type == 'EMPTY' and o.name.split('.')[0] == 'lamp_light':
            p = o.matrix_world.translation
            LAMP_PTS.append(p.copy()); LAMP_LIGHTS.append((p.x, p.y, p.z, 'lamp', '#FFB15C'))
    return new


_WK = CJ['wreck']
for pr_ in _WK.get('props', []):
    wk_import(pr_['kit'], pr_['c'], pr_['bow'], pr_['scale'], pr_['z'])
print('WRECK COVE props', len(_WK.get('props', [])))
_wrng = random.Random(1313)
_strand = [tuple(p) for p in _WK['strand']]
_Ls = polyline_len(_strand)
wrock, wweed, wpeb = bmesh.new(), bmesh.new(), bmesh.new()
for (x, y, r) in _WK.get('rocks', []):                       # boulders: low granite lumps, half sunk in the sand
    zr = H(x, y) if point_in_poly(x, y, COAST) else -0.4
    merge(wrock, bm_ico(r, (x, y, zr - r * 0.35), 1, (1.0, 0.85, 0.62), seed=int(x * 7 + y * 13) % 97, amp=0.22))
# the wrack line: a broken, wandering line of small flat weed clumps along the high-tide mark (two lines in places), the
# odd bleached stick caught in it. P8: clumps, not a ribbon, on a smooth line, and never over a terrain vertex (the ground
# is 5 m facets with baked AO: a covered vertex goes black across all its facets and reads as a dark jagged seam)
from mathutils import kdtree as _kdtree
_hfv = HF.data.vertices
_hkd = _kdtree.KDTree(len(_hfv))
for _v in _hfv:
    _hkd.insert((_v.co.x, _v.co.y, 0.0), _v.index)
_hkd.balance()


def _bare(x, y, r):
    """No terrain vertex under a flat piece of radius r at (x, y)."""
    return _hkd.find((x, y, 0.0))[2] > r + 0.35


def _clump(bm_, x, y, r, seed):
    """A flat, ragged weed clump draped on the sand (a fan of 7 triangles, each rim vertex on the ground)."""
    rg_ = random.Random(seed)
    c0 = bm_.verts.new((x, y, H(x, y) + 0.035))
    a0 = rg_.uniform(0, 6.28); sq = rg_.uniform(0.55, 0.9)
    rim = []
    for k in range(7):
        a = a0 + 2 * math.pi * k / 7
        rr = r * rg_.uniform(0.7, 1.15)
        px, py = x + math.cos(a) * rr, y + math.sin(a) * rr * sq
        rim.append(bm_.verts.new((px, py, H(px, py) + 0.025)))
    for k in range(7):
        bm_.faces.new((c0, rim[k], rim[(k + 1) % 7]))


for _band, _dd, _keep in ((0, 24.0, 0.8), (1, 21.5, 0.32)):
    _s = 1.5
    while _s < _Ls - 1.5:
        p, t = along(_strand, _s)
        t = Vector(t); nl = Vector((-t.y, t.x))
        d_ = _dd + 2.0 * math.sin(_s * 0.06 + _band) + 0.9 * math.sin(_s * 0.21 + 2.0 * _band)
        gap = math.sin(_s * 0.11 + 1.7 * _band) + 0.6 * math.sin(_s * 0.37 + _band)     # runs of weed, runs of bare sand
        if gap > -0.55 and _wrng.random() < _keep:
            for _k in range(1 if _wrng.random() < 0.6 else 2):
                q = Vector(p) + nl * (d_ + _wrng.uniform(-0.35, 0.35)) + t * _wrng.uniform(-0.4, 0.4)
                r_ = _wrng.uniform(0.16, 0.38) * (1.0 if _band == 0 else 0.75)
                if point_in_poly(q.x, q.y, COAST) and _bare(q.x, q.y, r_ * 1.15):
                    _clump(wweed, q.x, q.y, r_, int(_s * 31) + _k)
            if _wrng.random() < 0.06:
                a2 = t.copy(); a2.rotate(Matrix.Rotation(_wrng.uniform(-1.2, 1.2), 2)); L2 = _wrng.uniform(1.2, 2.4)
                q = Vector(p) + nl * d_
                e0, e1 = q - a2 * (L2 / 2), q + a2 * (L2 / 2)
                if all(_bare(e.x, e.y, 0.1) for e in (e0, q, e1)):
                    zb = H(q.x, q.y)
                    merge(wpeb, nl_kit.beam((e0.x, e0.y, zb + 0.06), (e1.x, e1.y, zb + 0.1), 0.13, 0.13))
        _s += _wrng.uniform(0.8, 1.5)
_s = 1.0
while _s < _Ls - 1.0:                                        # shingle at the waterline: banks of grey pebbles
    p, t = along(_strand, _s)
    t = Vector(t); nl = Vector((-t.y, t.x))
    for _k in range(3):
        q = Vector(p) + nl * _wrng.uniform(-0.6, 3.2) + t * _wrng.uniform(-1.2, 1.2)
        r_ = _wrng.uniform(0.16, 0.34)
        if point_in_poly(q.x, q.y, COAST) and _bare(q.x, q.y, r_):
            merge(wpeb, bm_pebble(r_, (q.x, q.y, H(q.x, q.y) + 0.02), (1.0, 0.8, 0.45), seed=int(abs(q.x * 37.0 + q.y * 11.0))))
    _s += _wrng.uniform(1.4, 2.6)
# Phase 4C handover: Wreck Cove dune marram tussocks now come from groundcover.bin (`gc-grass` / `gc-coastal`)
for _k in range(30):                                         # bleached driftwood strewn over the upper beach
    p, t = along(_strand, _wrng.uniform(0.04, 0.96) * _Ls)
    t = Vector(t); nl = Vector((-t.y, t.x))
    q = Vector(p) + nl * _wrng.uniform(12.0, 44.0)
    if not point_in_poly(q.x, q.y, COAST):
        continue
    a2 = t.copy(); a2.rotate(Matrix.Rotation(_wrng.uniform(-3.1, 3.1), 2)); L2 = _wrng.uniform(1.6, 4.2); zq = H(q.x, q.y)
    if not all(_bare(e.x, e.y, 0.15) for e in (q - a2 * (L2 / 2), q - a2 * (L2 / 4), q, q + a2 * (L2 / 4), q + a2 * (L2 / 2))):
        continue
    merge(wpeb, nl_kit.beam((q.x - a2.x * L2 / 2, q.y - a2.y * L2 / 2, zq + 0.1), (q.x + a2.x * L2 / 2, q.y + a2.y * L2 / 2, zq + 0.16), 0.22, 0.2))
obj('wreck_cove_boulders', wrock, face=lambda q: ((PAL['rock_light'] if q.normal.z > 0.5 else PAL['rock']), PT['rock']), family='wreck', jitter=0.08)
obj('wreck_cove_wrack', wweed, face=lambda q: ((lin('#8A7F5C') if q.index % 3 else lin('#7C7452')), PT['plain']), family='wreck', jitter=0.08)
obj('wreck_cove_shingle', wpeb, face=lambda q: ((lin('#9A968C') if q.normal.z > 0.3 else lin('#6F6C66')), PT['plain']), family='wreck', jitter=0.15)

# ------------------------------------------------------------------ folk + gulls (decorative)
dark, coats, heads = bmesh.new(), bmesh.new(), bmesh.new(); coat_ranges = []
FOLK = []
gpts = along_line(QL['grand'], 3.0, 5.5)
for k in range(64):
    if k < 30:
        (p, t, nl) = gpts[DRNG.randrange(len(gpts))]
        p = (p[0] + nl[0] * DRNG.uniform(-3, 3), p[1] + nl[1] * DRNG.uniform(-3, 3)); z = Z_SHORE
    elif k < 44:
        (band, pts, zb) = LANES[k % len(LANES)]; p = pts[DRNG.randrange(len(pts))]; z = zb
        if in_pad(*p, 1.0):
            continue
    elif k < 52:
        lp = along_line(QL['long'], 3.0, 5.0); (p, t, nl) = lp[DRNG.randrange(len(lp))]; z = Z_SHORE
    else:
        cv = list(COVES.values())[k % len(COVES)]
        p = cove_pt(cv, DRNG.uniform(-cv['hw'] + 6, cv['hw'] - 6), -DRNG.uniform(1.5, 6.0)); z = H(*p)
    c = DRNG.choice(('#2E4B6B', '#A84A33', '#D9A441', '#2F5A4A', '#7A2A22', '#E9E4DE', '#C2453A', '#AB9BC4', '#E39A7E'))
    rz_ = DRNG.uniform(0, 6.28)
    d_ = bm_box2(-0.22, -0.16, 0, 0.22, 0.16, 0.85); merge(d_, bm_cyl(0.2, 0.15, 0.14, 8, (0, 0, 1.78)))
    xf(d_, rz=rz_); xf(d_, loc=(p[0], p[1], z)); merge(dark, d_)
    c_ = bm_box2(-0.27, -0.19, 0.85, 0.27, 0.19, 1.5); xf(c_, rz=rz_); xf(c_, loc=(p[0], p[1], z))
    n0 = len(coats.faces); merge(coats, c_); coat_ranges.append((n0, len(coats.faces), lin(c)))
    merge(heads, bm_sphere(0.17, (p[0], p[1], z + 1.68), 8, 5))
obj('folk_dark', dark, lin('#2B2E36'), PT['plain'], family='life')
obj('folk_coats', coats, face=lambda q: (next(cc for (a0, a1, cc) in coat_ranges if a0 <= q.index < a1), 0), family='life', jitter=0.0)
obj('folk_heads', heads, lin('#E3BE9E'), PT['plain'], family='life', smooth=True)
gb = bmesh.new()
for k in range(24):
    x, y = wpt(DRNG.uniform(-120, 160), DRNG.uniform(-100, 110)); z = DRNG.uniform(14, 34)
    yaw = DRNG.uniform(0, 6.28); flap = DRNG.uniform(0.15, 0.45); s = DRNG.uniform(1.0, 1.4)
    g = bmesh.new()
    for side in (-1, 1):
        vs = [g.verts.new((0.15 * s, 0, 0)), g.verts.new((-0.25 * s, 0, 0)), g.verts.new((-0.35 * s, side * 1.15 * s, flap * s)),
              g.verts.new((0.05 * s, side * 1.2 * s, flap * s))]
        g.faces.new(vs if side > 0 else vs[::-1])
        tip = [g.verts.new((-0.35 * s, side * 1.15 * s, flap * s)), g.verts.new((0.05 * s, side * 1.2 * s, flap * s)),
               g.verts.new((-0.25 * s, side * 1.7 * s, flap * s * 0.4))]
        g.faces.new(tip if side > 0 else tip[::-1])
    merge(g, bm_box(0.7 * s, 0.18 * s, 0.16 * s))
    xf(g, rz=yaw); xf(g, loc=(x, y, z))
    merge(gb, g)
obj('gulls', gb, face=lambda q: ((lin('#3A3F45') if q.area < 0.25 and abs(q.normal.z) > 0.2 else PAL['trim']), 0), family='life_keyart')

# chimney smoke (key art only)
m_s = new_mat('M_smoke'); nts = m_s.node_tree; ps = nts.nodes['Principled BSDF']
ps.inputs['Base Color'].default_value = (*lin('#E9E4DE'), 1); ps.inputs['Roughness'].default_value = 1.0
ps.inputs['Alpha'].default_value = 0.22; m_s.surface_render_method = 'BLENDED'; M['smoke'] = m_s
sm = bmesh.new()
for c in CHIMNEYS[::4]:
    for k in range(6):
        r = 0.22 + k * 0.14
        p = c + Vector((0.8 * k + DRNG.uniform(-0.2, 0.2), 0.55 * k, 0.7 + k * 0.95))
        merge(sm, bm_ico(r, tuple(p), 2, (1.2, 1.0, 0.9), seed=k, amp=0.15))
obj('chimney_smoke', sm, mat=M['smoke'], smooth=True, shadow=False, family='life_keyart')

# key-art window spill lights: one in front of each building's facade
for (nm, pts) in WINDOW_GROUPS:
    c = sum(pts, Vector()) / len(pts)
    WIN_SPILL.append(c + Vector((0, -2.6, -0.6)))
print('DRESS built; lamps', len(LAMP_PTS))

# ------------------------------------------------------------------ THE MAINLAND across the northern sound (shakkei): forested hills
set_coll(collection('shakkei', ROOTC))
SQ2 = math.sqrt(2.0)
to_xy = lambda u, v: ((u - v) / SQ2, (u + v) / SQ2)
MC = [tuple(p) for p in CJ['mainland']['coast']]
MCUV = sorted(((p[0] + p[1]) / SQ2, (p[1] - p[0]) / SQ2) for p in MC)


def coast_v(u):
    for (u0, v0), (u1, v1) in zip(MCUV, MCUV[1:]):
        if u0 <= u <= u1:
            return v0 + (v1 - v0) * (u - u0) / max(1e-6, u1 - u0)
    return MCUV[0][1] if u < MCUV[0][0] else MCUV[-1][1]


def mainland_h(u, v):
    d = v - coast_v(u)
    if d <= 0:
        return 0.0
    h = 3.0 + min(d, 140) * 0.42 + max(0.0, d - 140) * 0.9
    h += 40.0 * terrain.fbm(u, v, 0.006, 3, 61) * min(1.0, d / 90.0)
    h += (terrain.fbm(u, v, 0.03, 2, 62) - 0.5) * 6.0
    return h


mrng = random.Random(64)
mpts = []
u0_, u1_ = MCUV[0][0], MCUV[-1][0]
for v in np.arange(min(p[1] for p in MCUV) - 10, min(p[1] for p in MCUV) + 360.0, 20.0):
    for u in np.arange(u0_, u1_, 20.0):
        uu, vv = u + mrng.uniform(-6, 6), v + mrng.uniform(-6, 6)
        if vv > coast_v(uu) + 1.5:
            mpts.append((uu, vv))
mpts += [(u, coast_v(u)) for u in np.arange(u0_, u1_, 10.0)]
MP = np.array(mpts)
mtri = Delaunay(MP)
mbm = bmesh.new()
mvs = [mbm.verts.new((*to_xy(u, v), mainland_h(u, v))) for u, v in mpts]
for t in mtri.simplices:
    c_ = MP[t].mean(axis=0)
    if c_[1] < coast_v(c_[0]) + 0.5:
        continue
    try:
        mbm.faces.new([mvs[i] for i in t])
    except ValueError:
        continue
mbm.normal_update()
for f in mbm.faces:
    if f.normal.z < 0:
        f.normal_flip()


def mland_face(q):
    c = q.center; nz = q.normal.z
    nn = terrain.fbm(c.x, c.y, 0.01, 2, 63)
    if nz < 0.6:
        return (PAL['rock_dark'] if nn > 0.5 else PAL['rock'], PT['rock'])
    if c.z < 8 and nn > 0.62:
        return (PAL['grass'], PT['grass'])
    return (lin('#3F5A3C') if nn > 0.45 else lin('#4B6741'), PT['leaf'])


obj('shakkei_land', mbm, face=mland_face, jitter=0.05, family='shakkei')
print('MAINLAND built')
