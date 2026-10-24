"""The Harbour v3 - dressing: roads (the winding road to the Pharos, the coast road over the south ridge), walled
meadows and vine rows, vegetation (umbrella pines and cypresses on the spines and behind the amphitheatre, olives, figs
and pomegranates in the town gardens, planes and almonds, maquis + headland garrigue, rock outcrops), quay life along the curved quays (lamps, bunting, stalls,
crates, nets, cranes), hamlet characters, skerries, the Shoals, buoys, the Far Ports rafts, folk, gulls, the mainland.
exec'd into build_island's namespace (after land + town)."""
from PIL import Image, ImageDraw

DRNG = random.Random(909)
set_coll(collection('dress', ROOTC))
COVES = {c['pid']: c for c in CJ['coves']}

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


# ------------------------------------------------------------------ ROADS: the winding road to the Pharos, the coast road
def road(ctrl_uv, width, col, name, bm, step=3.5, smooth=True, mark=True):
    pts = [wpt(*p) for p in (catmull(ctrl_uv, 6, closed=False) if smooth else ctrl_uv)]
    out = []
    dense = []
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5))
        for k in range(n):
            dense.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    dense.append(pts[-1])
    run = []
    for i, p in enumerate(dense):
        if point_in_poly(*p, COAST):
            run.append(p)
            if mark and run and len(run) > 1:
                od.line([o_to(*run[-2]), o_to(*run[-1])], fill=255, width=int(width + 2))
            if i % 2 == 0:
                out.append(p)
        else:
            ribbon(bm, run, width); run = []
    ribbon(bm, run, width)
    return out


import geom as _G
catmull = _G.catmull
ROADS = {}
road_bm = bmesh.new(); path_bm = bmesh.new()
# the winding road: Tron quay -> switchbacks up the headland's flank -> the Pharos; a spur to the keeper's cottage
ROADS['pharos'] = road(terrain.PHAROS_ROAD, terrain.ROAD_CUT_W, PAL['gravel'], 'road_pharos', road_bm)     # on its own bench (terrain.py)
# the west road: Long Quay west end -> the farms -> the windmill -> up the spine to the headland road
ROADS["west"] = road([(-131.0, -178.0), (-140.0, -152.0), (-160.0, -146.0), (-186.0, -132.0), (-200.0, -110.0), (-206.0, -80.0),
                      (-196.0, -50.0), (-176.0, -20.0), (-152.0, 4.0), (-134.0, 22.0), (-118.0, 22.0)], 3.0, PAL['gravel'], 'road_west', road_bm)
# the coast road over the south ridge, east to west, with spurs down to each hamlet
ROADS['south'] = road([(200.0, -196.0), (176.0, -214.0), (130.0, -230.0), (80.0, -238.0), (20.0, -240.0), (-40.0, -236.0),
                       (-100.0, -232.0), (-150.0, -222.0), (-196.0, -206.0), (-222.0, -186.0), (-216.0, -160.0), (-190.0, -146.0)],
                      3.0, PAL['gravel'], 'road_south', road_bm)
ROADS['east'] = road([(176.0, -150.0), (196.0, -172.0), (200.0, -196.0), (214.0, -180.0), (232.0, -170.0)], 2.6, PAL['gravel'], 'road_east', road_bm)
for pid, cv in COVES.items():
    b = Vector(cv['back']); n_ = Vector(cv['n'])
    a = b - n_ * 6.0
    u0, v0 = uvp(a.x, a.y)
    tgt = min(ROADS['south'] + ROADS['west'] + ROADS['east'], key=lambda p: (p[0] - a.x) ** 2 + (p[1] - a.y) ** 2)
    u1, v1 = uvp(*tgt)
    mid = ((u0 + u1) / 2 + 6.0, (v0 + v1) / 2)
    road([(u0, v0), mid, (u1, v1)], 2.2, PAL['earth'], 'path_' + pid, path_bm)
# footpaths: the town top to the crest; the windmill; Wreck Cove
for ctrl in ([(96.0, 128.0), (108.0, 140.0), (130.0, 146.0)], [(-206.0, -80.0), (-218.0, -110.0), (-226.0, -150.0), (-224.0, -162.0)],
             [(-196.0, -50.0), (-214.0, -54.0), (-226.0, -58.0)]):
    road(ctrl, 1.8, PAL['earth'], 'path', path_bm)
refresh_occ()
obj('land_roads', road_bm, PAL['gravel'], PT['cobble'], family='terrain', jitter=0.04)
obj('land_paths', path_bm, PAL['earth'], PT['cobble'], family='terrain', jitter=0.05)

# ------------------------------------------------------------------ 08-T1 (prettier): the cultivated hinterland
# contour olive terraces (terrain.TERRACES: the ground is cut in benches), a dry-stone coping on every riser top, olives in
# rows along each bench; one trellised vineyard down the fall line; a paved threshing floor (aloni) by the windmill.
T1RNG = random.Random(4108)        # own stream: the island's other scatters are unaffected by these counts
lips = bmesh.new()


def iso_segments(cuv, rr, level_of, levels, step=1.4, wmin=0.55):
    """Marching squares over a terraced hillside (natural heights): [(level index, (x0, y0), (x1, y1))] segments of the
    contour h = level_of(k) for k in levels, inside the hillside (terrace weight >= wmin at the segment's middle)."""
    x0, y0 = wpt(cuv[0] - rr, cuv[1]); xs_ = []
    corners = [wpt(cuv[0] + a * rr, cuv[1] + b * rr) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    X0, X1 = min(c[0] for c in corners), max(c[0] for c in corners)
    Y0, Y1 = min(c[1] for c in corners), max(c[1] for c in corners)
    nx_, ny_ = int((X1 - X0) / step) + 2, int((Y1 - Y0) / step) + 2
    G = np.zeros((ny_, nx_)); IN = np.zeros((ny_, nx_), bool)
    for j in range(ny_):
        for i in range(nx_):
            x, y = X0 + i * step, Y0 + j * step
            IN[j, i] = terrain.terrace_w(*uvp(x, y)) > 0.0
            G[j, i] = terrain.height(x, y, terraces=False) if IN[j, i] else -99.0
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
                    if terrain.terrace_w(*uvp(*m)) >= wmin:
                        out.append((k, cr[q], cr[q + 1]))
    return out


TERRACE_OLIVES = []
for (c_, ru_, rv_, a_) in terrain.TERRACES:
    rr_ = max(ru_, rv_) + 1.0
    ks = range(int(1.5 / terrain.TERRACE_STEP), int(26 / terrain.TERRACE_STEP))
    for (k, a, b) in iso_segments(c_, rr_, lambda k: k * terrain.TERRACE_STEP, ks):
        if not (on_land(*a) and on_land(*b)):
            continue
        za, zb = H(*a), H(*b)
        merge(lips, nl_kit.beam((a[0], a[1], za + 0.14), (b[0], b[1], zb + 0.14), 0.5, 0.42))
    # bench middles: the olive rows (quincunx-ish: greedy spacing along each contour, rows offset by the land)
    cand = [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, k) for (k, a, b) in
            iso_segments(c_, rr_, lambda k: (k + 0.44) * terrain.TERRACE_STEP, ks, wmin=0.7)]
    cand.sort(key=lambda q: (q[2], q[0] + q[1] * 0.37))
    for (x, y, k) in cand:
        if not on_land(x, y) or any((x - q[0]) ** 2 + (y - q[1]) ** 2 < (6.6 if k == q[2] else 4.2) ** 2 for q in TERRACE_OLIVES):
            continue
        TERRACE_OLIVES.append((x, y, k))
print('TERRACES lips', len(lips.faces) // 6, 'olive spots', len(TERRACE_OLIVES))

# the vineyard: rows straight down the fall line - a post every 2.4 m, a vine stock between, each a lumpy canopy
vc_, VD, VA, VINEYARD = terrain.vineyard()
VD, VA = Vector(VD), Vector(VA)
VINE_HALF = terrain.VINE_HALF
vine_posts, vine_leaf = bmesh.new(), bmesh.new()
_nrow = 0
for r_ in range(int(2 * VINE_HALF[1] / 2.5) + 1):
    off = -VINE_HALF[1] + 0.5 + r_ * 2.5
    run_ = []
    for s_ in range(int(2 * VINE_HALF[0] / 1.2) + 2):
        q = Vector(vc_) + VA * off + VD * (-VINE_HALF[0] + 0.6 + s_ * 1.2)
        ok_ = s_ * 1.2 < 2 * VINE_HALF[0] - 1.0 and on_land(q.x, q.y) and terrain.field_at(q.x, q.y) is None
        if ok_:
            run_.append((q.x, q.y)); continue
        if len(run_) >= 4:
            _nrow += 1
            for i_, q2 in enumerate(run_):
                z2 = H(*q2)
                if i_ % 2 == 0:
                    merge(vine_posts, bm_rod((q2[0], q2[1], z2 - 0.1), (q2[0], q2[1], z2 + 1.35), 0.055, 3))
                else:
                    rr = T1RNG.uniform(0.5, 0.62)
                    merge(vine_leaf, xf(bm_ico(rr, (0, 0, 0), 0, (1.0, 0.62, 0.7), seed=T1RNG.randint(0, 999), amp=0.35),
                                        loc=(q2[0], q2[1], z2 + 0.95), rz=math.atan2(VD.y, VD.x) + T1RNG.uniform(-0.2, 0.2)))
                    merge(vine_posts, bm_rod((q2[0], q2[1], z2 - 0.05), (q2[0] + T1RNG.uniform(-0.1, 0.1), q2[1], z2 + 0.7), 0.07, 3))
            od.line([o_to(*run_[0]), o_to(*run_[-1])], fill=255, width=3)
        run_ = []
AGRI.append(VINEYARD)
print('VINEYARD rows', _nrow)

# the threshing floor (aloni): a round stone floor with a kerb, dead level beside the windmill
thr = bmesh.new()
tcx, tcy = wpt(*terrain.THRESHING_UV)
tz = terrain.disc_at(tcx, tcy)[0]
_ring = [(tcx + math.cos(2 * math.pi * i / 18) * terrain.THRESHING_R, tcy + math.sin(2 * math.pi * i / 18) * terrain.THRESHING_R) for i in range(18)]
merge(thr, bm_prism(_ring, tz - 0.3, tz + 0.08))
for a, b in zip(_ring, _ring[1:] + _ring[:1]):
    merge(lips, nl_kit.beam((a[0], a[1], tz + 0.2), (b[0], b[1], tz + 0.2), 0.42, 0.34))
occ_poly(_ring)
AGRI.append(_ring)
refresh_occ()
obj('land_threshing', thr, face=lambda q: ((lin('#CDBFA0') if q.normal.z > 0.5 else lin('#A99C82')), PT['cobble']), family='terrain', jitter=0.05)
obj('vine_posts', vine_posts, lin('#7A6248'), PT['plain'], family='veg', jitter=0.06)
obj('vine_canopy', vine_leaf, face=lambda q: ((PAL['vine_light'] if q.normal.z > 0.3 else PAL['vine']), PT['leaf']), family='veg', jitter=0.1,
    props=dict(sway=0.55, sway_mode='ground', sway_span=1.6))

# ------------------------------------------------------------------ 08-T4 (prettier): a small hill sanctuary on the west spine
# The harbour's own sanctuary, generic and votive (no name, no statue, no colossus; R3/D3): a temenos levelled on the
# spine's north knoll (terrain.SANCTUARY_*), a tholos under 7 m, an altar and two stelae on the approach, a ring of
# cypresses with its gap toward the town, a zig-zag processional path up from the west road, one lamp at dusk.
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
for i in range(11):                             # the cypress ring, open to the south (the approach, toward the town)
    a = -math.pi / 2 + math.radians(40) + i * math.radians(280) / 10
    du, dv = math.cos(a) * 11.0, math.sin(a) * 11.0
    SANCT_CYPRESS.append(_su(du + SRNG.uniform(-0.6, 0.6), dv + SRNG.uniform(-0.6, 0.6)))
# the processional path: up from the west road in three short zig-zags to the temenos gap
shrine_bm = bmesh.new()
ROADS['shrine'] = road([(-178.6, -23.9), (-185.5, -23.4), (-181.0, -21.0), (-187.2, -19.6), (-188.0, -16.6)], 1.5, PAL['earth'], 'path_shrine',
                       shrine_bm, smooth=False)
obj('land_paths_shrine', shrine_bm, PAL['earth'], PT['cobble'], family='terrain', jitter=0.05)
SANCT_LAMP = (_su(1.6, -4.6), sz + 0.07)
SANCT_SPOTS = [(_su(0.0, -6.0), sz + 0.07), (_su(-2.0, -1.5), sz + 0.07)]
refresh_occ()
obj('sanctuary_stone', s_st, CP['marble'], PT['ashlar'], family='landmark', jitter=0.03, bevel=0.02)
obj('sanctuary_cella', s_wall, CP['wash_cream'], PT['render'], family='landmark', jitter=0.02)
obj('sanctuary_roof', s_roof, lin('#8C4F39'), PT['tiles'], family='landmark', jitter=0.04)
obj('sanctuary_paving', s_pave, face=lambda q: ((CP['lime_dark'] if q.normal.z > 0.5 else CP['lime_dark']), PT['cobble']), family='terrain', jitter=0.05)
print('SANCTUARY z', round(sz, 1), 'top', round(zc_ + 5.32, 1))

# ------------------------------------------------------------------ dry-stone walls round the meadows (they follow the land)
walls = bmesh.new(); hedge = bmesh.new(); sheep = bmesh.new(); sheep_h = bmesh.new()
for fi, f in enumerate(terrain.FIELDS):
    p = f['poly'] + f['poly'][:1]
    for ei, (a, b) in enumerate(zip(p, p[1:])):
        # pastures and hay fields have vine rows along some sides (P5: they replace the hedgerows), dry-stone walls on the rest
        is_hedge = False                 # 08-T1: the vineyard's trellised rows replace the vine-row blobs
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / (1.6 if is_hedge else 3.0)))
        if is_hedge:                     # two rows, set into the field parallel to its side
            ang = math.atan2(b[1] - a[1], b[0] - a[0])
            nin = Vector((-math.sin(ang), math.cos(ang)))
            fc = Vector((sum(q[0] for q in f['poly']) / len(f['poly']), sum(q[1] for q in f['poly']) / len(f['poly'])))
            if nin.dot(fc - Vector(a)) < 0:
                nin = -nin
        for k in range(n):
            q0 = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)
            q1 = (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)
            if not on_land(*q0) or not on_land(*q1) or DRNG.random() < 0.06:
                continue
            if is_hedge:
                for inset in (1.4, 3.6):
                    v = Vector(q0) + nin * inset
                    if not point_in_poly(v.x, v.y, f['poly']) or not on_land(v.x, v.y):
                        continue
                    vb = bm_ico(0.55, (0, 0, 0), 1, (1.45, 0.55, 0.75), seed=DRNG.randint(0, 999), amp=0.25)
                    merge(hedge, xf(vb, loc=(v.x, v.y, H(v.x, v.y) + 0.5), rz=ang))
                    od.point(o_to(v.x, v.y), fill=255)
            else:
                merge(walls, nl_kit.beam((q0[0], q0[1], H(*q0) + 0.32), (q1[0], q1[1], H(*q1) + 0.32), 0.6, 0.85))
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
            merge(sheep_h, bm_ico(0.24, (q[0] + math.cos(a_) * 0.75, q[1] + math.sin(a_) * 0.75, z_ + 0.72), 0, (1.2, 1.0, 1.0), seed=k))
            for lx in (-0.3, 0.3):
                merge(sheep_h, bm_cyl(0.07, 0.07, 0.4, 4, (q[0] + lx * math.cos(a_), q[1] + lx * math.sin(a_), z_)))
refresh_occ()
merge(walls, lips)                   # 08-T1: terrace copings + the threshing-floor kerb, the same dry stone
obj('field_walls', walls, PAL['rock'], PT['ashlar'], family='prop_wall', jitter=0.12)
obj('field_vines', hedge, face=lambda q: ((PAL['vine_light'] if q.normal.z > 0.3 else PAL['vine']), PT['leaf']), family='veg', jitter=0.1)
obj('field_sheep', sheep, lin('#EEE9DD'), PT['plain'], family='veg', jitter=0.04)
obj('field_sheep_heads', sheep_h, lin('#2E2B29'), PT['plain'], family='veg')

# ------------------------------------------------------------------ VEGETATION (classical-town P5, PLAN §4.6)
# Umbrella pines and cypresses on the crest and spines, cypress rows along the roads and the town edge, olives, figs
# and pomegranates in the gardens and coves, planes and almonds on the slopes. Evergreens are painted leaf_evergreen
# (never blossom, colour or drop; snowed on their flat crowns); the deciduous minority keeps pattern leaf in the
# deciduous colour band (materials.ts hbConifer), so it blossoms, colours and goes bare.
SPECIES = ('pine', 'cypress', 'olive', 'fig', 'pomegranate', 'plane', 'almond')
LEAF = {k: bmesh.new() for k in SPECIES}
TRUNK = {k: bmesh.new() for k in SPECIES}
tuft, flw, heath, bould, lich = (bmesh.new() for _ in range(5))
MAQUIS = ('lavender', 'rosemary', 'broom', 'oleander', 'acanthus', 'agave')
MQ = {k: bmesh.new() for k in MAQUIS}
TREES = dict.fromkeys(SPECIES, 0)
TREE_GRID = {}              # every tree so far, (x, y, spacing) in 10 m cells: separate scatters keep apart


def scatter(n, sampler, place, min_d, rng, max_try=None, allow_crop=False, grid=None):
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
    pts = [(nm, i) for nm in names for i in range(len(ROADS[nm]) - 1)]

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


BUILD = dict(olive=nl_kit.olive, fig=nl_kit.fig, pomegranate=nl_kit.pomegranate, plane=nl_kit.plane_tree, almond=nl_kit.almond)
HEIGHT = dict(olive=(4.5, 6.5), fig=(4.0, 5.8), pomegranate=(3.4, 4.6), plane=(9.0, 12.0), almond=(4.2, 6.0))


# 08-T2 (prettier): three umbrella-pine crowns, chosen by exposure (a position hash, so the scatter's draws are unchanged):
# 'tiered' (the kit's flat pads), 'sheared' (on the crests and by the sea: leaning and streamed downwind), 'young' (low,
# rounder, a third of the sheltered ones)
_bw = CJ_LAYOUT.get('wind', {}).get('bowHeadingRad', 0.0)
WIND_TO = Vector((-math.sin(_bw), math.cos(_bw)))          # downwind on the Blender ground plane (hulls lie bow to wind)
PINE_VARIANTS = dict(tiered=0, sheared=0, young=0)


def pine_variant(p, z):
    hsh = terrain._hash(int(p[0] * 5), int(p[1] * 5), 41)
    if terrain.dcoast(*p) < 16.0 or (z > 19.0 and hsh > 0.55):
        return 'sheared'
    return 'young' if hsh < 0.3 else 'tiered'


def place_pine(p, rng):
    z = H(*p)
    lb, tb = bmesh.new(), bmesh.new()
    z0 = z - 0.3
    nl_kit.umbrella_pine(lb, tb, (p[0], p[1], z0), rng.uniform(8.5, 12.5) * (1.0 if z > 12 else 0.85), rng)
    var = pine_variant(p, z)
    PINE_VARIANTS[var] += 1
    if var == 'sheared':             # crown streamed downwind and pressed flat, the trunk leaning after it
        zs = [v.co.z for v in lb.verts]; zc = (min(zs) + max(zs)) / 2
        for b_ in (lb, tb):
            for v in b_.verts:
                hgt = max(0.0, v.co.z - z0)
                v.co.x += WIND_TO.x * hgt * 0.16; v.co.y += WIND_TO.y * hgt * 0.16
        for v in lb.verts:
            d = Vector((v.co.x - p[0], v.co.y - p[1]))
            v.co.x += WIND_TO.x * d.dot(WIND_TO) * 0.3; v.co.y += WIND_TO.y * d.dot(WIND_TO) * 0.3
            v.co.z = zc + (v.co.z - zc) * 0.78
    elif var == 'young':             # a young pine: lower, its single crown rounder
        zs = [v.co.z for v in lb.verts]; zc = (min(zs) + max(zs)) / 2
        for v in lb.verts:
            v.co.z = zc + (v.co.z - zc) * 1.5
        for b_ in (lb, tb):
            for v in b_.verts:
                v.co.x = p[0] + (v.co.x - p[0]) * 0.62; v.co.y = p[1] + (v.co.y - p[1]) * 0.62; v.co.z = z0 + (v.co.z - z0) * 0.62
    merge(LEAF['pine'], lb); merge(TRUNK['pine'], tb)
    TREES['pine'] += 1


def place_cypress(p, rng):
    nl_kit.cypress(LEAF['cypress'], (p[0], p[1], H(*p) - 0.3), rng.uniform(7.0, 11.0), rng)
    TREES['cypress'] += 1


def placer(*mix):
    """place(p, rng) for a species mix: placer(('olive', 0.6), ('fig', 0.4))."""
    def place(p, rng):
        k, acc = rng.random(), 0.0
        for sp, w in mix:
            acc += w
            if k < acc:
                break
        BUILD[sp](LEAF[sp], TRUNK[sp], (p[0], p[1], H(*p) - 0.2), rng.uniform(*HEIGHT[sp]), rng)
        TREES[sp] += 1
    return place


# 08-T4: the sanctuary's cypress ring
for (x, y) in SANCT_CYPRESS:
    nl_kit.cypress(LEAF['cypress'], (x, y, H(x, y) - 0.3), SRNG.uniform(7.5, 9.5), SRNG)
    TREES['cypress'] += 1
    TREE_GRID.setdefault((int(x // 10.0), int(y // 10.0)), []).append((x, y, 3.0))
# 08-T1: the terrace olives first (their rows are fixed), so every other scatter keeps clear of them
for (x, y, k) in TERRACE_OLIVES:
    nl_kit.olive(LEAF['olive'], TRUNK['olive'], (x, y, H(x, y) - 0.15), T1RNG.uniform(3.6, 4.6), T1RNG)
    TREES['olive'] += 1
    TREE_GRID.setdefault((int(x // 10.0), int(y // 10.0)), []).append((x, y, 4.5))
# the town gardens: olives between and behind the terrace houses, figs and pomegranates in the courtyards, a few planes
TOWN_SPOTS = []
for k, (r0, r1, z) in enumerate(RINGS):
    th0, th1 = TOWN_TH[k]
    for i in range(240):                 # dense candidates: the courtyard lots leave only small gardens free
        TOWN_SPOTS.append(town_pt(DRNG.uniform(th1, th0), DRNG.uniform(r0 + 2, r1 + 1)))
scatter(130, lambda r: TOWN_SPOTS[r.randrange(len(TOWN_SPOTS))], placer(('olive', 0.5), ('fig', 0.22), ('pomegranate', 0.18), ('plane', 0.1)),
        6.0, DRNG, max_try=5000, grid=TREE_GRID)
for pid, cv in COVES.items():
    b = Vector(cv['back']); n_ = Vector(cv['n']); t_ = Vector(cv['t'])
    scatter(5, lambda r, b=b, n_=n_, t_=t_, hw=cv['hw']: tuple(b - n_ * r.uniform(14, 34) + t_ * r.uniform(-hw - 10, hw + 10)),
            placer(('olive', 0.7), ('fig', 0.3)), 7.0, DRNG, max_try=300, grid=TREE_GRID)
# the crest behind the amphitheatre: a band of umbrella pines against the sky, cypress spires among them
CREST = [(CT_UV[0] + math.cos(math.radians(a)) * 133.0, CT_UV[1] + math.sin(math.radians(a)) * 133.0) for a in range(166, 8, -6)]
scatter(120, crown_clear(line_sampler(CREST, 7.5), 1.5), place_pine, 4.6, DRNG, max_try=8000, grid=TREE_GRID)
scatter(40, line_sampler(CREST, 9.0), place_cypress, 3.4, DRNG, max_try=2000, grid=TREE_GRID)
scatter(80, crown_clear(line_sampler(terrain.WEST_SPINE, 9.0), 2.0), place_pine, 4.6, DRNG, max_try=8000, grid=TREE_GRID)
scatter(70, crown_clear(line_sampler(terrain.EAST_SPINE, 8.5), 3.5), place_pine, 5.2, DRNG, max_try=5000, grid=TREE_GRID)
COPSES = [((-150.0, -40.0), 10, 14), ((-180.0, 20.0), 12, 16), ((-250.0, -190.0), 12, 14), ((-90.0, -250.0), 9, 8), ((100.0, -250.0), 9, 8),
          ((230.0, -40.0), 10, 12), ((210.0, 40.0), 12, 14), ((-60.0, 120.0), 7, 5), ((-150.0, 60.0), 9, 7), ((150.0, -210.0), 8, 8)]
for (c, sp, n) in COPSES:
    scatter((n * 2) // 3, lambda r, c=c, sp=sp: wpt(c[0] + r.gauss(0, sp), c[1] + r.gauss(0, sp)), place_pine, 5.4, DRNG, max_try=n * 30, grid=TREE_GRID)
# cypress rows along the roads (the Pharos road first) and round the town's outer edge
scatter(36, roadside(['pharos'], 4.2), place_cypress, 6.0, DRNG, max_try=2000, grid=TREE_GRID)
scatter(40, roadside(['west', 'south', 'east'], 3.8), place_cypress, 7.0, DRNG, max_try=3000, grid=TREE_GRID)
_R_EDGE = RINGS[-1][1]
scatter(30, lambda r: town_pt(r.uniform(TOWN_TH[-1][1], TOWN_TH[-1][0]), _R_EDGE + r.uniform(6.0, 16.0)), place_cypress, 5.0, DRNG,
        max_try=1500, grid=TREE_GRID)
# 08-T2: the open-ground trees stand in groves with clear ground between (not an even sprinkle across the lawns)
def grove(sampler, lo=0.5):
    def s(rng):
        p = sampler(rng)
        if p is None or terrain.fbm(p[0], p[1], 0.018, 2, 71) < lo:
            return None
        return p
    return s


scatter(44, grove(lambda r: wpt(r.uniform(-200, 220), r.uniform(-250, -200))), placer(('almond', 1.0)), 7.0, DRNG, max_try=4000, grid=TREE_GRID)   # the south slopes
scatter(16, grove(lambda r: wpt(r.uniform(-240, -150), r.uniform(-200, -40))), placer(('olive', 1.0)), 7.0, DRNG, max_try=3000, grid=TREE_GRID)   # the west grove
scatter(28, grove(line_sampler(terrain.WEST_SPINE + [(-150.0, 40.0)], 40.0)), placer(('almond', 0.75), ('olive', 0.25)), 7.0, DRNG, max_try=5000, grid=TREE_GRID)
scatter(48, grove(line_sampler(terrain.EAST_SPINE, 34.0)), placer(('almond', 0.4), ('plane', 0.6)), 7.5, DRNG, max_try=4000, grid=TREE_GRID)
scatter(24, crown_clear(line_sampler(CREST, 16.0), 2.0), placer(('plane', 1.0)), 8.0, DRNG, max_try=2000, grid=TREE_GRID)
print('TREES', TREES, 'pines', PINE_VARIANTS)


# ground dressing: shrubs, tufts, flowers, heather on the headland, boulders + lichen
def seat_z(p, r):
    """Lowest ground under a round prop of radius r: seated there it never floats off the downhill side."""
    return min(H(p[0] + dx, p[1] + dy) for dx, dy in ((0, 0), (r, 0), (-r, 0), (0, r), (0, -r)))


MQ_MIX = (('lavender', 0.25), ('rosemary', 0.25), ('broom', 0.15), ('oleander', 0.15), ('acanthus', 0.2))
MQ_SHAPE = dict(lavender=(0.6, (1.4, 1.1, 0.55)), rosemary=(0.7, (1.25, 1.0, 0.7)), broom=(0.75, (1.0, 1.0, 1.15)),
                oleander=(0.9, (1.1, 1.0, 1.05)), acanthus=(0.6, (1.35, 1.25, 0.45)))


def place_meadow(p, rng):
    z = H(*p)
    u, v = uvp(*p)
    kind = rng.random()
    hd = terrain.head_d(u, v)
    if hd < 1.05:
        if terrain.fbm(p[0], p[1], 0.045, 2, 21) < 0.56:
            return
        for k_ in range(rng.randint(2, 4)):
            q = (p[0] + rng.uniform(-2.2, 2.2), p[1] + rng.uniform(-2.2, 2.2))
            rh = rng.uniform(0.6, 1.1)
            merge(heath, bm_ico(rh, (q[0], q[1], seat_z(q, rh * 1.3) + 0.05), 1, (1.4, 1.0, 0.45), seed=rng.randint(0, 999), amp=0.3))
        if hd > 0.8 and rng.random() < 0.5:
            rr = rng.uniform(0.8, 1.8)
            merge(bould, bm_ico(rr, (p[0], p[1], seat_z(p, rr * 1.2) + 0.05), 1, (1.25, 1.0, 0.7), seed=rng.randint(0, 999), amp=0.35))
        return
    if kind < 0.3:                       # maquis (P5): lavender, rosemary, broom, oleander and acanthus clumps
        k_, acc = rng.random(), 0.0
        for sp, w in MQ_MIX:
            acc += w
            if k_ < acc:
                break
        r0, sc = MQ_SHAPE[sp]
        rr = r0 * rng.uniform(0.8, 1.25)
        merge(MQ[sp], bm_ico(rr, (p[0], p[1], seat_z(p, rr) + rr * sc[2] * 0.55), 1, sc, seed=rng.randint(0, 999), amp=0.3))
    elif kind < 0.4:                     # an agave: a rosette of stiff, splayed blades
        a0 = rng.uniform(0, 6.28); s_ = rng.uniform(0.8, 1.2)
        for k_ in range(4):
            merge(MQ['agave'], xf(bm_cyl(0.14 * s_, 0.0, 0.8 * s_, 3), loc=(p[0], p[1], z - 0.05), rz=a0 + k_ * 1.57, rx=0.7))
    elif kind < 0.62:
        for q in range(3):
            a = rng.uniform(0, 6.28); h = rng.uniform(0.5, 1.0)
            merge(tuft, bm_cyl(0.14, 0.0, h, 3, (p[0] + math.cos(a) * 0.25, p[1] + math.sin(a) * 0.25, z), rot=a))
    elif kind < 0.86:
        for q in range(3):
            merge(flw, bm_cyl(0.18, 0.0, 0.34, 3, (p[0] + rng.uniform(-0.9, 0.9), p[1] + rng.uniform(-0.9, 0.9), z + 0.05), rot=rng.random()))
    else:
        rr = rng.uniform(0.6, 1.8)
        z = seat_z(p, rr * 1.2)
        merge(bould, bm_ico(rr, (p[0], p[1], z + 0.05), 1, (1.25, 1.0, 0.7), seed=rng.randint(0, 999), amp=0.35))
        if rng.random() < 0.6:
            merge(lich, bm_ico(rr * 0.5, (p[0] + rr * 0.1, p[1], z + 0.1 + rr * 0.55), 0, (1.3, 1.0, 0.25), seed=rng.randint(0, 99)))


# rock outcrops: clustered granite tors on the slopes (charm + breakup of the green)
OUTCROPS = [(-170.0, -70.0), (-240.0, -120.0), (-158.0, 52.0), (250.0, -90.0), (230.0, -150.0), (-30.0, -232.0), (120.0, -226.0),
            (-270.0, -170.0), (220.0, 20.0), (-200.0, 10.0), (60.0, 132.0), (-160.0, -200.0)]
# 08-T2 (prettier): an ecological density mask instead of a uniform 1,680-point sprinkle - maquis thickets on the steep
# flanks and round the tors, garrigue on the ridges, open turf by the roads, fields and houses, and the rest clustered
# in drifts (about 40 % fewer clumps than before; the headland heath keeps its own rule)
from scipy import ndimage as _nd
OCC_D = _nd.distance_transform_edt(~OCC) * OS          # metres to the nearest road, lot, wall or quay apron
_LAND_IM = Image.new('L', (OW, OH), 0); ImageDraw.Draw(_LAND_IM).polygon([o_to(*p) for p in COAST], fill=255)
LAND_R = np.array(_LAND_IM) > 127
OUTCROP_W = []
ECO = dict(maquis=0, garrigue=0, turf=0, meadow=0, headland=0)


def _occ_d(x, y):
    i, j = int((OY1 - y) / OS), int((x - OX0) / OS)
    return float(OCC_D[i, j]) if 0 <= i < OH and 0 <= j < OW else 0.0


def eco_zone(p):
    x, y = p
    u, v = uvp(x, y)
    if terrain.head_d(u, v) < 1.05:
        return 'headland'
    z = H(x, y)
    g = math.hypot(H(x + 1.5, y) - H(x - 1.5, y), H(x, y + 1.5) - H(x, y - 1.5)) / 3.0
    if g > 0.3 or any((x - ox) ** 2 + (y - oy) ** 2 < 15.0 ** 2 for ox, oy in OUTCROP_W):
        return 'maquis'
    if z > 16.0 or min(terrain.line_d(u, v, terrain.WEST_SPINE), terrain.line_d(u, v, terrain.EAST_SPINE)) < 14.0:
        return 'garrigue'
    if _occ_d(x, y) < 7.0 or any(in_crop(x + dx, y + dy) or terrain.field_at(x + dx, y + dy) for dx, dy in ((6, 0), (-6, 0), (0, 6), (0, -6))):
        return 'turf'
    return 'meadow'


ECO_DENSITY = dict(maquis=0.3, garrigue=0.5, turf=0.12, meadow=0.5, headland=1.0)


def eco_sampler(rng):
    x, y = rng.uniform(OX0, OX1), rng.uniform(OY0, OY1)
    i, j = int((OY1 - y) / OS), int((x - OX0) / OS)
    if not (0 <= i < OH and 0 <= j < OW) or not LAND_R[i, j] or OCC[i, j]:
        return None
    cl = terrain.sstep(0.4, 0.62, terrain.fbm(x, y, 0.026, 2, 63))          # drifts: clustered, with open ground between
    if rng.random() > 0.1 + 0.9 * cl:
        return None
    if rng.random() > ECO_DENSITY[eco_zone((x, y))]:
        return None
    return (x, y)


def place_eco(p, rng):
    zone = eco_zone(p)
    ECO[zone] += 1
    if zone == 'headland':
        place_meadow(p, rng); return
    z = H(*p)
    k = rng.random()
    if zone == 'garrigue':               # low, grey-violet cushions (thyme, lavender, heath), a stone now and then
        for k_ in range(rng.randint(1, 3)):
            q = (p[0] + rng.uniform(-1.6, 1.6), p[1] + rng.uniform(-1.6, 1.6))
            rh = rng.uniform(0.45, 0.85)
            merge(heath, bm_ico(rh, (q[0], q[1], seat_z(q, rh * 1.3) + 0.05), 0, (1.4, 1.0, 0.45), seed=rng.randint(0, 999), amp=0.3))
        if k < 0.18:
            rr = rng.uniform(0.5, 1.2)
            merge(bould, bm_ico(rr, (p[0], p[1], seat_z(p, rr * 1.2) + 0.05), 1, (1.25, 1.0, 0.7), seed=rng.randint(0, 999), amp=0.35))
        return
    if zone == 'turf':                   # open, grazed turf: a tuft or a few flowers, no more
        if k < 0.6:
            for q in range(2):
                a = rng.uniform(0, 6.28); h = rng.uniform(0.4, 0.8)
                merge(tuft, bm_cyl(0.14, 0.0, h, 3, (p[0] + math.cos(a) * 0.25, p[1] + math.sin(a) * 0.25, z), rot=a))
        else:
            for q in range(3):
                merge(flw, bm_cyl(0.18, 0.0, 0.34, 3, (p[0] + rng.uniform(-0.9, 0.9), p[1] + rng.uniform(-0.9, 0.9), z + 0.05), rot=rng.random()))
        return
    if zone == 'maquis' or k < 0.25:     # thickets: two or three clumps knit together, an agave on the dry slopes
        if zone == 'maquis' and k < 0.08:
            a0 = rng.uniform(0, 6.28); s_ = rng.uniform(0.8, 1.2)
            for k_ in range(4):
                merge(MQ['agave'], xf(bm_cyl(0.14 * s_, 0.0, 0.8 * s_, 3), loc=(p[0], p[1], z - 0.05), rz=a0 + k_ * 1.57, rx=0.7))
            return
        for c_ in range(1 if zone != 'maquis' else rng.randint(1, 3)):
            q = p if c_ == 0 else (p[0] + rng.uniform(-1.4, 1.4), p[1] + rng.uniform(-1.4, 1.4))
            k_, acc = rng.random(), 0.0
            for sp, w in MQ_MIX:
                acc += w
                if k_ < acc:
                    break
            r0, sc = MQ_SHAPE[sp]
            rr = r0 * rng.uniform(0.8, 1.25) * (1.0 if c_ == 0 else 0.75)
            sub_ = 1 if (c_ == 0 and rr > 0.8) else 0           # small satellites stay coarse (budget)
            merge(MQ[sp], bm_ico(rr, (q[0], q[1], seat_z(q, rr) + rr * sc[2] * 0.55), sub_, sc, seed=rng.randint(0, 999), amp=0.3))
        return
    if k < 0.6:                          # the open meadow: tufts and flower drifts, the odd stone
        for q in range(3):
            a = rng.uniform(0, 6.28); h = rng.uniform(0.5, 1.0)
            merge(tuft, bm_cyl(0.14, 0.0, h, 3, (p[0] + math.cos(a) * 0.25, p[1] + math.sin(a) * 0.25, z), rot=a))
    elif k < 0.9:
        for q in range(3):
            merge(flw, bm_cyl(0.18, 0.0, 0.34, 3, (p[0] + rng.uniform(-0.9, 0.9), p[1] + rng.uniform(-0.9, 0.9), z + 0.05), rot=rng.random()))
    else:
        rr = rng.uniform(0.6, 1.5)
        zb = seat_z(p, rr * 1.2)
        merge(bould, bm_ico(rr, (p[0], p[1], zb + 0.05), 1, (1.25, 1.0, 0.7), seed=rng.randint(0, 999), amp=0.35))


OUTCROP_W[:] = [wpt(u, v) for (u, v) in OUTCROPS]
scatter(640, eco_sampler, place_eco, 3.2, DRNG, max_try=400000)
print('ECO', ECO)

for (u, v) in OUTCROPS:
    cx, cy = wpt(u, v)
    if not point_in_poly(cx, cy, COAST):
        continue
    for k in range(DRNG.randint(4, 8)):
        q = (cx + DRNG.gauss(0, 3.2), cy + DRNG.gauss(0, 3.2))
        if not on_land(*q):
            continue
        rr = DRNG.uniform(1.2, 3.4) * (1.3 if k == 0 else 1.0)
        zq = seat_z(q, rr * 1.1)
        merge(bould, bm_ico(rr, (q[0], q[1], zq + rr * 0.1), 1, (1.2, 1.0, 0.85 + DRNG.random() * 0.4), seed=DRNG.randint(0, 999), amp=0.32))
        if DRNG.random() < 0.7:
            merge(lich, bm_ico(rr * 0.45, (q[0], q[1], zq + rr * 0.9), 0, (1.3, 1.0, 0.25), seed=DRNG.randint(0, 99)))
# P8: the battery's terraced back wall - a planted ledge (oleander, rosemary, lavender) on each course and a cypress row
# on the upper ledge, so the cut reads as garden terraces rather than a stone mass (own rng: the island's scatter is kept)
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
            _mid = (_d0 + 0.9 + _d1) / 2                  # the ledge between this course's wall and the next one's
            _s = 1.3
            while _s < _L - 1.3:
                _p = _a + _t * (_s + _TRNG.uniform(-0.4, 0.4)) + _n * (_mid + _TRNG.uniform(-0.5, 0.5))
                if abs(H(_p.x, _p.y) - (_fl['z'] + _r1)) < 0.3:       # only where the ledge is cut (the hill stood above it)
                    if _k == 1 and _TRNG.random() < 0.3:
                        place_cypress((_p.x, _p.y), _TRNG)
                    else:
                        _sp = ('oleander', 'rosemary', 'lavender', 'oleander')[_TRNG.randrange(4)]
                        _r, _sc = MQ_SHAPE[_sp]; _r *= _TRNG.uniform(1.0, 1.4)
                        merge(MQ[_sp], bm_ico(_r, (_p.x, _p.y, H(_p.x, _p.y) + _r * _sc[2] * 0.55), 1, _sc, seed=_TRNG.randint(0, 999), amp=0.3))
                _s += _TRNG.uniform(1.4, 2.0)
LEAF_COL = dict(pine=('#45612C', '#2F4824'), cypress=('#3E5530', '#2C4024'), fig=('#7FA046', '#5F8236'),
                pomegranate=('#6E9638', '#527A2E'), plane=('#86A84C', '#6A8E3C'), almond=('#93AE58', '#77924A'))
BARK = dict(pine='#7A5038', olive='#7E7568', fig='#8E8A80', pomegranate='#6A5640', plane='#B5AA90', almond='#4E3E30')
EVERGREEN = ('pine', 'cypress', 'olive')


def _olive_face(q):        # silver-grey and olive-green leaf, by patch; shaded undersides
    if q.normal.z < 0.3:
        return (PAL['olive_dark'], PT['leaf_evergreen'])
    return ((lin('#8A9470') if noise.noise(q.center * 0.4) > 0.0 else PAL['olive_leaf']), PT['leaf_evergreen'])


for sp in SPECIES:
    pt_ = PT['leaf_evergreen'] if sp in EVERGREEN else PT['leaf']
    if sp == 'olive':
        face_ = _olive_face
    else:
        face_ = lambda q, c=LEAF_COL[sp], pt_=pt_: ((lin(c[0]) if q.normal.z > 0.35 else lin(c[1])), pt_)
    obj('trees_' + sp, LEAF[sp], face=face_, family='tree_' + sp, jitter=0.08, seed=3)
    if sp in BARK:
        obj('trees_' + sp + '_trunk', TRUNK[sp], lin(BARK[sp]), PT['plain'], family='tree_' + sp)
    else:
        TRUNK[sp].free()
MQ_COL = dict(lavender=('#8F84AE', '#6E7A5C'), rosemary=('#6F7F5A', '#4F5E42'), acanthus=('#4E7036', '#3C5A2C'), agave=('#8AA39A', '#6C8880'))


def _mq_face(sp):
    if sp == 'broom':            # yellow flowering tips over olive-green
        return lambda q: ((lin('#D2B640') if q.normal.z > 0.3 and q.index % 3 == 0 else lin('#6E8236')), PT['leaf_evergreen'])
    if sp == 'oleander':         # pink flowers in dark leaf
        return lambda q: ((lin('#D46A8C') if q.index % 4 == 0 else lin('#4F6E36') if q.normal.z > 0.3 else lin('#3E5A2C')), PT['leaf_evergreen'])
    c = MQ_COL[sp]
    return lambda q: ((lin(c[0]) if q.normal.z > 0.3 else lin(c[1])), PT['leaf_evergreen'])


for sp in MAQUIS:
    obj('veg_maquis_' + sp, MQ[sp], face=_mq_face(sp), family='veg', jitter=0.08)
obj('veg_tufts', tuft, face=lambda q: ((PAL['grass_light'] if q.index % 3 == 0 else PAL['grass_dark']), PT['leaf']), family='veg', jitter=0.1)
obj('veg_flowers', flw, face=lambda q: ((PAL['flower_y'], PAL['flower_w'], PAL['flower_p'], PAL['rowan_berry'])[(q.index // 25) % 4], 0), family='veg')
obj('veg_garrigue', heath, face=lambda q: ((lin('#8A80A0') if q.normal.z > 0.3 else lin('#5E6650')), PT['leaf_evergreen']), family='veg', jitter=0.1)
obj('land_boulders', bould, face=lambda q: ((PAL['rock_light'] if q.normal.z > 0.5 else PAL['rock']), PT['rock']), family='rock', jitter=0.08)
obj('land_lichen', lich, PAL['lichen'], PT['rock'], family='rock', jitter=0.1)
print('VEGTRIS', sum(sum(len(p_.vertices) - 2 for p_ in o_.data.polygons) for o_ in bpy.data.objects if o_.type == 'MESH' and o_.name.startswith(('veg_', 'land_boulders', 'land_lichen'))))
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
    """08-T4/T9: a small bronze fire-bowl on a tripod with a low flame: a hinterland 'hearth' light (dim layout kind)."""
    x, y = p
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.4
        merge(lampb, nl_kit.beam((x + 0.35 * math.cos(a), y + 0.35 * math.sin(a), z), (x, y, z + h), 0.05, 0.05))
    merge(lampb, bm_cyl(0.08, 0.3, 0.2, 6, (x, y, z + h), cap=False))
    merge(lglass, bm_cyl(0.16, 0.03, 0.32, 5, (x, y, z + h + 0.12), cap=False))
    LAMP_LIGHTS.append((x, y, z + h + 0.3, 'hearth', None))


hearth_lamp(SANCT_LAMP[0], SANCT_LAMP[1])      # 08-T4: the sanctuary's one lamp at dusk
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
            merge(corks, bm_ico(0.17, (q.x + math.cos(a) * r, q.y + math.sin(a) * r * 0.8, Z_SHORE + 0.45), 0, seed=k))
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

# ------------------------------------------------------------------ STRANDS (v4): Wreck Cove's sand and shingle, the coves' pebble beaches
# shingle along the waterline, driftwood under the dunes, old stakes in the shallows; pebbles, upturned dinghies and
# net posts on the cove beaches; granite rocks off every cove's arms
peb, drift_w, stakes, dinghy, dinghy_in, crock, marram = (bmesh.new() for _ in range(7))
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
        for (q, t, nl) in strand_pts(line, 0.9, -0.5, 3.6, SRNG):                 # the shingle band
            if point_in_poly(q.x, q.y, COAST) or SRNG.random() < 0.5:
                r_ = SRNG.uniform(0.18, 0.42)
                merge(peb, bm_ico(r_, (q.x, q.y, max(H(q.x, q.y), 0.05) + r_ * 0.25), 0, (1.3, 1.0, 0.6), seed=SRNG.randint(0, 99)))
        for (q, t, nl) in strand_pts(line, 4.2, 41.0, 46.0, SRNG):               # driftwood under the dunes
            if not point_in_poly(q.x, q.y, COAST):
                continue
            a_ = math.atan2(t.y, t.x) + SRNG.uniform(-0.6, 0.6); L_ = SRNG.uniform(2.8, 7.5); r_ = SRNG.uniform(0.16, 0.34)
            d_ = Vector((math.cos(a_), math.sin(a_)))
            pa, pb = q - d_ * L_ / 2, q + d_ * L_ / 2
            merge(drift_w, nl_kit.beam((pa.x, pa.y, H(pa.x, pa.y) + r_ * 0.7), (pb.x, pb.y, H(pb.x, pb.y) + r_ * 0.7), r_ * 2, r_ * 1.7))
            if SRNG.random() < 0.4:                                               # a root boss
                merge(drift_w, bm_ico(r_ * 1.9, (pa.x, pa.y, H(pa.x, pa.y) + r_), 1, (1.0, 1.0, 0.8), seed=SRNG.randint(0, 99), amp=0.4))
        for (q, t, nl) in strand_pts(line, 2.2, 37.0, 47.0, SRNG):               # marram tufts on the dune foot
            if SRNG.random() < 0.55:
                continue
            z0 = H(q.x, q.y)
            for k_ in range(SRNG.randint(3, 6)):
                a_ = SRNG.uniform(0, 6.28); h_ = SRNG.uniform(0.45, 0.95)
                merge(marram, bm_cyl(0.12, 0.0, h_, 3, (q.x + math.cos(a_) * 0.35, q.y + math.sin(a_) * 0.35, z0 - 0.05), rot=a_))
        for (q, t, nl) in strand_pts(line, 13.0, -9.0, -3.0, SRNG):              # old stakes in the shallows, leaning
            lean = SRNG.uniform(-0.25, 0.25)
            top = q + nl * lean * 2.0
            merge(stakes, nl_kit.beam((q.x, q.y, -1.6), (top.x, top.y, SRNG.uniform(1.2, 2.4)), 0.28, 0.28))
    else:
        for (q, t, nl) in strand_pts(line, 0.55, -0.3, 6.5, SRNG):                # the pebbles
            r_ = SRNG.uniform(0.12, 0.34)
            merge(peb, bm_ico(r_, (q.x, q.y, max(H(q.x, q.y), 0.05) + r_ * 0.2), 0, (1.25, 1.0, 0.65), seed=SRNG.randint(0, 99)))
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
obj('strand_pebbles', peb, face=lambda q: ((lin('#B3AC9D'), lin('#8E887E'), lin('#C7B79A'), lin('#77746F'))[q.index // 7 % 4], PT['plain']), family='rock', jitter=0.1)
obj('strand_driftwood', drift_w, face=lambda q: ((lin('#C9BCA6') if q.normal.z > 0.3 else lin('#9C8F7C')), PT['plain']), family='prop_crate', jitter=0.08)
obj('strand_stakes', stakes, lin('#5A4B3E'), PT['plain'], family='prop_crate', jitter=0.1)
obj('strand_dinghies', dinghy, face=lambda q: ((PAL['hull_blue'] if q.normal.z > -0.3 else PAL['hull_white']), PT['strakes']), family='prop_crate', jitter=0.05)
obj('strand_dinghies_red', dinghy_in, face=lambda q: ((PAL['hull_red'] if q.normal.z > -0.3 else PAL['hull_white']), PT['strakes']), family='prop_crate', jitter=0.05)
obj('strand_marram', marram, face=lambda q: ((lin('#A7A65A') if q.index % 3 else lin('#7F8C47')), PT['leaf']), family='veg', jitter=0.1)
obj('cove_rocks', crock, face=lambda q: ((PAL['rock_wet'] if q.center.z < 0.35 else (PAL['rock_light'] if q.normal.z > 0.5 else PAL['rock'])), PT['rock']), family='rock', jitter=0.08)

# ------------------------------------------------------------------ SKERRIES: granite humps, a grass cap, a few wind-bent pines
from mathutils.geometry import tessellate_polygon
skL, skT = bmesh.new(), bmesh.new()
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
            nl_kit.umbrella_pine(skL, skT, (sp[0], sp[1], top - 0.4), DRNG.uniform(5.0, 7.5), random.Random(i * 31 + k))
    CIRCLES_EXTRA.append((cx_, cy_, 1.0))
obj('skerry_pine', skL, face=lambda q: ((lin(LEAF_COL['pine'][0]) if q.normal.z > 0.35 else lin(LEAF_COL['pine'][1])), PT['leaf_evergreen']), family='tree_pine', jitter=0.1)
obj('skerry_pine_trunk', skT, lin(BARK['pine']), PT['plain'], family='tree_pine')

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
for p_ in CJ['far'].get('buoys', []):
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
wrock, wweed, wpeb, wgrass = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
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
            merge(wpeb, bm_ico(r_, (q.x, q.y, H(q.x, q.y) + 0.02), 1, (1.0, 0.8, 0.45), seed=_k, amp=0.2))
    _s += _wrng.uniform(1.4, 2.6)
_s = 1.5
while _s < _Ls - 1.5:                                        # marram grass in tussocks on the dunes behind the memorial
    p, t = along(_strand, _s)
    t = Vector(t); nl = Vector((-t.y, t.x))
    q = Vector(p) + nl * _wrng.uniform(38.0, 64.0) + t * _wrng.uniform(-1.5, 1.5)
    if point_in_poly(q.x, q.y, COAST) and (terrain.beach_k(q.x, q.y)[0] > 0.2 or not occupied(q.x, q.y)) and terrain.pad_at(q.x, q.y, 1.0) is None:
        zq = H(q.x, q.y)
        for _b in range(_wrng.randint(10, 16)):
            a_ = _wrng.uniform(0, 6.28); lean = _wrng.uniform(0.2, 0.6); hh = _wrng.uniform(0.9, 1.6)
            b0 = (q.x + math.cos(a_) * 0.15, q.y + math.sin(a_) * 0.15, zq)
            b1 = (b0[0] + math.cos(a_) * hh * lean, b0[1] + math.sin(a_) * hh * lean, zq + hh)
            merge(wgrass, nl_kit.beam(b0, b1, 0.1, 0.04))
    _s += _wrng.uniform(0.9, 1.8)
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
obj('wreck_cove_marram', wgrass, face=lambda q: ((lin('#B7B583') if q.index % 2 else lin('#97A06A')), PT['plain']), family='wreck', jitter=0.1)

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
