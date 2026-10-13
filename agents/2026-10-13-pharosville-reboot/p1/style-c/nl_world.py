"""Northern Light (style C) - the style block: headland + Pharos, breakwater, quay + finger-pier group,
8 hulls, hill-town slice, sea (SDF-driven), sky backdrop. Renders overview/harbour x golden/night/noon.

    blender -b --factory-startup -P nl_world.py -- [--states golden,night,noon] [--cams overview,harbour]
        [--samples 64] [--pct 100] [--suffix _x] [--out DIR] [--save]
"""
import sys, os, time
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for p in ('/home/ahirice/.local/lib/python3.14/site-packages',):
    if p not in sys.path:
        sys.path.append(p)
import importlib
import nl_common; importlib.reload(nl_common)
import nl_kit; importlib.reload(nl_kit)
from nl_common import *
from nl_kit import *

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


STATES = arg('--states', 'golden').split(',')
CAMS = arg('--cams', 'overview').split(',')
SAMPLES = int(arg('--samples', '64'))
PCT = int(arg('--pct', '100'))
SUFFIX = arg('--suffix', '')
OUT = arg('--out', HERE)
SAVE = '--save' in ARGV
t0 = time.time()
random.seed(11)

reset_scene()
scene = bpy.context.scene
ROOTC = collection('NL')
set_coll(ROOTC)

# ------------------------------------------------------------------ emblem atlas (4x4 slots, 256 px)
def build_atlas():
    from PIL import Image, ImageDraw, ImageFont
    S, N = 256, 4
    big = Image.new('RGBA', (S * N * 2, S * N * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    fnt = lambda sz: ImageFont.truetype('/usr/share/fonts/noto/NotoSans-Black.ttf', sz)
    fser = lambda sz: ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-Black.ttf', sz)
    specs = [  # (disc, ring, glyph, glyph colour, font)
        ('#26A17B', None, 'T', '#FFFFFF', fnt), ('#2775CA', '#FFFFFF', '$', '#FFFFFF', fnt),
        ('#E9A93B', None, 'D', '#FFFFFF', fnt), ('#2B4FA3', '#E8C64A', '€', '#FFFFFF', fnt),
        ('#D7AE45', '#8A6417', 'Au', '#6B4A0E', fser), ('#C2453A', '#FFFFFF', '$', '#FFFFFF', fnt),
        ('#6E5BB8', None, 'U', '#FFFFFF', fnt), ('#FFFFFF', '#2B4FA3', '€', '#2B4FA3', fnt),
    ]
    for i, (disc, ring, gl, gc, ff) in enumerate(specs):
        cx = (i % N) * S * 2 + S; cy = (i // N) * S * 2 + S
        R = int(S * 0.92)
        d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=disc)
        if ring:
            r2 = int(R * 0.82); d.ellipse((cx - r2, cy - r2, cx + r2, cy + r2), outline=ring, width=int(S * 0.07))
        if i == 3:  # ring of stars
            for k in range(12):
                a = 2 * math.pi * k / 12
                x, y = cx + math.cos(a) * R * 0.66, cy + math.sin(a) * R * 0.66
                d.ellipse((x - 12, y - 12, x + 12, y + 12), fill='#E8C64A')
        f = ff(int(S * (1.05 if len(gl) == 1 else 0.8)))
        if i == 0:  # T with a bar (generic, not traced)
            w = int(S * 0.62); h = int(S * 0.14)
            d.rectangle((cx - w, cy - int(S * 0.5), cx + w, cy - int(S * 0.5) + h * 2), fill=gc)
            d.rectangle((cx - int(S * 0.13), cy - int(S * 0.5), cx + int(S * 0.13), cy + int(S * 0.62)), fill=gc)
            d.ellipse((cx - int(S * 0.5), cy - int(S * 0.08), cx + int(S * 0.5), cy + int(S * 0.12)), outline=gc, width=int(S * 0.06))
        else:
            d.text((cx, cy + int(S * 0.02)), gl, font=f, fill=gc, anchor='mm')
    im = big.resize((S * N, S * N), Image.LANCZOS)
    path = os.path.join(HERE, 'emblem-atlas.png')
    im.save(path)
    img = bpy.data.images.load(path, check_existing=False)
    img.alpha_mode = 'STRAIGHT'
    return img, N


atlas, NSLOT = build_atlas()

# ------------------------------------------------------------------ materials
build_kit_material(); build_glass_material(); build_sail_material(atlas, float(NSLOT))
build_glow_material('lamp', lin('#3B3A33'), PAL['sodium'], 'LAMP_K')
build_glow_material('lens', PAL['lens'], PAL['lantern'], 'LENS_K')
build_glow_material('riding', lin('#DDDDDD'), PAL['riding'], 'RIDE_K')
build_glow_material('beacon_red', lin('#8E2A22'), lin('#FF5A3C'), 'BEACON_K')
m = new_mat('lantern_glass'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
p.inputs['Base Color'].default_value = (*lin('#BFD6D8'), 1); p.inputs['Roughness'].default_value = 0.05
p.inputs['Alpha'].default_value = 0.35; m.surface_render_method = 'BLENDED'; M['lantern_glass'] = m

exec(open(os.path.join(HERE, 'nl_land.py')).read())

# ------------------------------------------------------------------ FLEET
set_coll(collection('fleet', ROOTC))
FLEET = []


def moor(name, rig, cls, brand, pos, heading, emblem, hull_cols, lines_to, cloth=None, fenders_side=None, seed=0):
    root, info = build_boat(name, rig, cls, brand, 'docked', 0.0, 1, emblem, hull_cols, cloth=cloth,
                            loc=(pos[0], pos[1], 0.0), heading=heading, seed=seed)
    L, B = info['L'], info['B']
    ch, sh_ = math.cos(heading), math.sin(heading)
    W = lambda lx, ly, lz: Vector((pos[0] + lx * ch - ly * sh_, pos[1] + lx * sh_ + ly * ch, lz))
    ln = bmesh.new()
    for (lx, target) in lines_to:
        a = W(lx, 0, info['fb'] * 1.1)
        pts = catenary(a, BOLL[target], 0.35)
        for p, q in zip(pts, pts[1:]):
            merge(ln, line3(p, q, 0.045))
    obj(name + '_mooring', ln, PAL['rope'], PT['plain'], family='mooring')
    if fenders_side:
        fd = bmesh.new()
        for t in (-0.25, 0.05, 0.3):
            c = W(L * t, fenders_side * (B / 2 + 0.05), info['fb'] * 0.5)
            merge(fd, bm_cyl(0.22, 0.22, 0.8, 8, (c.x, c.y, c.z - 0.4)))
        obj(name + '_fenders', fd, PAL['hull_white'] if seed % 2 else PAL['brand_usdc'], PT['plain'], family='mooring', smooth=True)
    # waterline polygon
    wl = []
    for k in range(17):
        u = -1 + 2 * k / 16
        P_ = FAMILY[rig]
        w = B / 2 * (max(0.0, 1 - u ** P_['bow']) ** 0.5 if u >= 0 else 1 - (1 - P_['stern']) * u * u) * 0.9
        wl.append(W(u * L / 2, w, 0)[:2])
    for k in range(16, -1, -1):
        u = -1 + 2 * k / 16
        P_ = FAMILY[rig]
        w = B / 2 * (max(0.0, 1 - u ** P_['bow']) ** 0.5 if u >= 0 else 1 - (1 - P_['stern']) * u * u) * 0.9
        wl.append(W(u * L / 2, -w, 0)[:2])
    CONTACT.append([tuple(p) for p in wl])
    FLEET.append((name, info))
    return root, info


# flagship: full-rigged ship, USDT-like, at the T-head
moor('ship_usdt', 'ship', 'flagship', PAL['brand_usdt'], (10.0, -46.7), math.pi, 0,
     dict(top=PAL['hull_black'], band=PAL['hull_white'], stripe=PAL['brand_usdt'], rail=PAL['hull_black'], boot=PAL['brand_usdt'],
          deck_in=PAL['hull_white'], transom=PAL['hull_black'], house=PAL['timber']),
     [(11, 't2'), (-11, 't4'), (4, 't3')], fenders_side=-1, seed=1)
# gold brig along the quay wall
moor('brig_gold', 'brig', 'large', PAL['brand_gold'], (-42.0, -3.0), 0.0, 4,
     dict(top=PAL['hull_stain'], band=PAL['hull_stain'], stripe=PAL['gilt'], rail=PAL['gilt'], boot=PAL['gilt'],
          deck_in=PAL['hull_stain'], transom=PAL['gilt'], house=PAL['hull_stain']),
     [(7.5, 'q-36'), (-7.5, 'q-50')], fenders_side=1, seed=2)
# usd schooner along the quay
moor('schooner_usd', 'schooner', 'large', PAL['brand_usdc'], (-18.0, -2.6), math.pi, 1,
     dict(top=PAL['hull_white'], band=PAL['hull_white'], stripe=PAL['brand_usdc'], rail=PAL['timber'], boot=PAL['hull_green'],
          bottom=PAL['hull_green'], deck_in=PAL['hull_white'], transom=PAL['hull_white'], house=PAL['timber']),
     [(-7.5, 'q-4'), (7.5, 'q-26')], fenders_side=-1, seed=3)
# usd sloop, eur botter, usd catboat on the fingers
moor('sloop_usd', 'sloop', 'small', PAL['brand_dai'], (2.5, -9.1), 0.0, 2,
     dict(top=PAL['hull_blue'], band=PAL['hull_blue'], stripe=PAL['hull_white'], rail=PAL['timber'], boot=PAL['hull_white'],
          deck_in=PAL['hull_white'], transom=PAL['timber'], house=PAL['hull_white']),
     [(4.6, 'sp1'), (-4.5, 'f1m')], fenders_side=-1, seed=4)
moor('botter_eur', 'botter', 'medium', PAL['brand_eur'], (1.0, -15.7), 0.0, 3,
     dict(top=PAL['tar'], band=PAL['tar'], stripe=PAL['hull_green'], rail=PAL['hull_green'], boot=PAL['tar'], bottom=PAL['tar'],
          deck_in=PAL['hull_green'], transom=PAL['tar'], house=PAL['timber']),
     [(6.0, 'sp2'), (-6.0, 'f1e')], cloth=PAL['tanbark'], fenders_side=1, seed=5)
moor('cat_usd', 'cat', 'boat', PAL['brand_red'], (3.75, -23.1), 0.0, 5,
     dict(top=PAL['hull_white'], band=PAL['hull_white'], stripe=PAL['brand_red'], rail=PAL['timber'], boot=PAL['brand_red'],
          deck_in=PAL['timber'], transom=PAL['timber'], house=PAL['timber']),
     [(3.4, 'sp3'), (-3.4, 'f2m')], fenders_side=-1, seed=6)

# sailing hulls
WAKES = []


def sail(name, rig, cls, brand, pos, heading, heel, tack, emblem, hull_cols, cloth=None, seed=0):
    root, info = build_boat(name, rig, cls, brand, 'sailing', math.radians(heel), tack, emblem, hull_cols, cloth=cloth,
                            loc=(pos[0], pos[1], 0.0), heading=heading, seed=seed)
    L = info['L']
    back = Vector((-math.cos(heading), -math.sin(heading)))
    st = Vector(pos) + back * L * 0.5
    bw = Vector(pos) - back * L * 0.48
    for sgn in (-1, 1):
        arm = back.copy(); arm.rotate(Matrix.Rotation(sgn * math.radians(19.5), 2))
        WAKES.append((tuple(st), tuple(st + arm * L * 1.5), 0.15, 0.55, 0.7))
        arm2 = back.copy(); arm2.rotate(Matrix.Rotation(sgn * math.radians(32), 2))
        WAKES.append((tuple(bw), tuple(bw + arm2 * L * 0.55), 0.15, 0.4, 0.7))
    WAKES.append((tuple(st), tuple(st + back * L * 1.0), 0.45, 1.1, 0.6))
    CONTACT.append([tuple(Vector(pos) + Vector((math.cos(heading + a) * L * 0.48 * abs(math.cos(a)) + 0.0, math.sin(heading + a) * L * 0.48 * abs(math.cos(a)))))
                    for a in np.linspace(0, 2 * math.pi, 24, endpoint=False)])
    FLEET.append((name, info))
    return root, info


sail('sloop_sailing', 'sloop', 'medium', PAL['brand_violet'], (-30.0, -33.0), math.radians(-28), 11, 1, 6,
     dict(top=PAL['hull_red'], band=PAL['hull_red'], stripe=PAL['hull_white'], rail=PAL['timber'], boot=PAL['hull_white'],
          deck_in=PAL['hull_white'], transom=PAL['timber'], house=PAL['hull_white']), seed=7)
sail('botter_sailing', 'botter', 'medium', PAL['brand_eur'], (80.0, -50.0), math.radians(-62), 9, -1, 7,
     dict(top=PAL['tar'], band=PAL['tar'], stripe=PAL['wall_ochre'], rail=PAL['wall_ochre'], boot=PAL['tar'], bottom=PAL['tar'],
          deck_in=PAL['hull_green'], transom=PAL['tar'], house=PAL['timber']), cloth=PAL['tanbark'], seed=8)

# ------------------------------------------------------------------ LIFE: gulls + chimney smoke (decorative)
set_coll(collection('life', ROOTC))
gb = bmesh.new()
rng = random.Random(404)
GULLS = [(-12, -20, 18), (-4, -24, 22), (22, -30, 16), (30, -56, 12), (-30, -50, 24), (40, -10, 26), (-46, -14, 14),
         (54, -40, 20), (6, -60, 15), (60, 12, 30), (-20, 4, 20), (-60, -26, 10)]
for (x, y, z) in GULLS:
    yaw = rng.uniform(0, 6.28); flap = rng.uniform(0.15, 0.45); s = rng.uniform(0.9, 1.25)
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
obj('gulls', gb, face=lambda q: ((lin('#3A3F45') if q.area < 0.25 and abs(q.normal.z) > 0.2 else PAL['trim']), 0), family='life', shadow=True)
folk = bmesh.new()
FOLK = [(-44, 3.0, Z_QUAY, '#2E4B6B'), (-43.2, 3.6, Z_QUAY, '#A84A33'), (-19, 5.2, Z_QUAY, '#D9A441'), (-6.0, 2.6, Z_QUAY, '#2F5A4A'),
        (2.0, 5.5, Z_QUAY, '#7A2A22'), (22.5, 3.0, Z_QUAY, '#E9E4DE'), (28.0, 4.6, Z_QUAY, '#2E4B6B'), (-23, 8.6, Z_QUAY, '#C2453A'),
        (10.5, -14.0, DECK, '#D9A441'), (11.0, -31.0, DECK, '#2E4B6B'), (4.0, -40.0, DECK, '#7A2A22'), (24.0, -40.5, DECK, '#E9E4DE'),
        (-2.5, -25.6, DECK, '#2F5A4A'), (57.0, 4.0, Z_HEAD, '#2E4B6B'), (10.0, -66.5, 4.0, '#C2453A'), (-30.0, 24.5, Z_T1, '#AB9BC4'),
        (-12.0, 43.5, Z_T2, '#D9A441'), (-50.5, 25.5, Z_T1, '#E39A7E')]
dark = bmesh.new(); coats = bmesh.new(); heads = bmesh.new(); coat_ranges = []
for i, (x, y, z, c) in enumerate(FOLK):
    rz_ = rng.uniform(0, 6.28)
    d_ = bm_box2(-0.22, -0.16, 0, 0.22, 0.16, 0.85); merge(d_, bm_cyl(0.2, 0.15, 0.14, 8, (0, 0, 1.78)))
    xf(d_, rz=rz_); xf(d_, loc=(x, y, z)); merge(dark, d_)
    c_ = bm_box2(-0.27, -0.19, 0.85, 0.27, 0.19, 1.5); xf(c_, rz=rz_); xf(c_, loc=(x, y, z))
    n0 = len(coats.faces); merge(coats, c_); coat_ranges.append((n0, len(coats.faces), lin(c)))
    h_ = bm_sphere(0.17, (x, y, z + 1.68), 8, 5); merge(heads, h_)
obj('folk_dark', dark, lin('#2B2E36'), PT['plain'], family='life')
obj('folk_coats', coats, face=lambda q: (next(cc for (a0, a1, cc) in coat_ranges if a0 <= q.index < a1), 0), family='life', jitter=0.0)
obj('folk_heads', heads, lin('#E3BE9E'), PT['plain'], family='life', smooth=True)
SMOKE = []
m_s = new_mat('M_smoke'); nts = m_s.node_tree; ps = nts.nodes['Principled BSDF']
ps.inputs['Base Color'].default_value = (*lin('#E9E4DE'), 1); ps.inputs['Roughness'].default_value = 1.0
ps.inputs['Alpha'].default_value = 0.22; m_s.surface_render_method = 'BLENDED'; M['smoke'] = m_s
sm = bmesh.new()
for nm in ('h02', 'h09', 'h13', 'keeper_cottage'):
    ro = bpy.data.objects.get(nm)
    if ro is None or 'chimney_top' not in ro:
        continue
    c = ro.matrix_world @ Vector(ro['chimney_top'])
    for k in range(6):
        r = 0.22 + k * 0.13
        p = c + Vector((0.75 * k + rng.uniform(-0.2, 0.2), -0.25 * k, 0.7 + k * 0.95))
        merge(sm, bm_ico(r, tuple(p), 2, (1.2, 1.0, 0.9), seed=k + len(nm), amp=0.15))
smoke = obj('chimney_smoke', sm, mat=M['smoke'], smooth=True, shadow=False, family='life')

print('BUILD', round(time.time() - t0, 1), 's')

# ------------------------------------------------------------------ SEA (distance field)
SDF_N, SDF_SPAN, SDF_C = 2048, 560.0, (0.0, -10.0)
SDF_DMAX = 80.0


def build_sdf():
    from PIL import Image, ImageDraw
    from scipy import ndimage
    N = SDF_N; px = SDF_SPAN / N
    def to_px(p):
        return ((p[0] - SDF_C[0] + SDF_SPAN / 2) / px, (SDF_SPAN / 2 - (p[1] - SDF_C[1])) / px)
    land = Image.new('L', (N, N), 0); dl = ImageDraw.Draw(land)
    for poly in COAST:
        dl.polygon([to_px(p) for p in poly], fill=255)
    for (x, y, r) in CIRCLES:
        cx, cy = to_px((x, y)); rr = r / px
        dl.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=255)
    con = Image.new('L', (N, N), 0); dc = ImageDraw.Draw(con)
    for poly in CONTACT:
        dc.polygon([to_px(p) for p in poly], fill=255)
    for (x, y, r) in PILES:
        cx, cy = to_px((x, y)); rr = r / px
        dc.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=255)
    A = np.array(land) > 127
    Bm = np.array(con) > 127
    d = ndimage.distance_transform_edt(~A) * px
    dh = ndimage.distance_transform_edt(~Bm) * px
    # wakes
    xs = (np.arange(N) + 0.5) * px - SDF_SPAN / 2 + SDF_C[0]
    ys = SDF_SPAN / 2 - (np.arange(N) + 0.5) * px + SDF_C[1]
    X, Y = np.meshgrid(xs, ys)
    G = np.zeros((N, N), np.float32)
    for (a, b, w0, w1, k) in WAKES:
        a = np.array(a, np.float32); b = np.array(b, np.float32); ab = b - a
        t = np.clip(((X - a[0]) * ab[0] + (Y - a[1]) * ab[1]) / (ab @ ab), 0, 1)
        dd = np.hypot(X - (a[0] + t * ab[0]), Y - (a[1] + t * ab[1]))
        w = w0 + (w1 - w0) * t
        G = np.maximum(G, k * np.exp(-(dd / w) ** 2) * (1 - t) ** 1.3)
    img = np.zeros((N, N, 4), np.float32)
    img[..., 0] = np.clip(d / SDF_DMAX, 0, 1)
    img[..., 1] = G
    img[..., 2] = np.clip(dh / 8.0, 0, 1)
    img[..., 3] = 1
    flip = img[::-1].copy()      # Blender image rows go bottom-up
    bimg = bpy.data.images.new('sea_sdf', N, N, float_buffer=True, alpha=True)
    bimg.pixels.foreach_set(flip.ravel())
    scratch = os.path.join(os.path.dirname(HERE), '..', '..', '..', 'outputs', 'harbour', 'style-c')
    os.makedirs(scratch, exist_ok=True)
    path = os.path.join(scratch, 'sea-sdf.exr')     # scratch (gitignored); runtime bakes its own
    bimg.filepath_raw = path; bimg.file_format = 'OPEN_EXR'; bimg.save()
    bimg.colorspace_settings.name = 'Non-Color'
    print('SDF built; land frac', float(A.mean()))
    return bimg


SDF_IMG = build_sdf()
set_coll(ROOTC)


def build_water():
    m = new_mat('M_sea'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    geo = node(nt, 'ShaderNodeNewGeometry')
    W = geo.outputs['Position']
    wx, wy, wz = sep(nt, W)
    uvx = (wx - SDF_C[0] + SDF_SPAN / 2) / SDF_SPAN
    uvy = (wy - SDF_C[1] + SDF_SPAN / 2) / SDF_SPAN
    im = node(nt, 'ShaderNodeTexImage', interpolation='Cubic', extension='EXTEND'); im.image = SDF_IMG
    link(nt, comb(nt, uvx, uvy, 0.0), im.inputs['Vector'])
    sc = node(nt, 'ShaderNodeSeparateColor'); link(nt, im.outputs['Color'], sc.inputs[0])
    d = SX(nt, sc.outputs['Red']) * SDF_DMAX
    wake = SX(nt, sc.outputs['Green'])
    dh = SX(nt, sc.outputs['Blue']) * 8.0
    T = C(nt, 0.0, 'TIME')
    n1 = noise3(nt, vscale(nt, W, 0.09), 1.0, 2.0)
    n2 = noise3(nt, vscale(nt, W, 0.45), 1.0, 1.0)
    n3 = noise3(nt, vscale(nt, W, 1.1), 1.0, 1.0)
    dn = d + (n1 - 0.5) * 1.6
    # depth tint (cold): shoal -> shallow -> mid -> deep -> abyss
    ramp = node(nt, 'ShaderNodeValToRGB', name='DEPTH_RAMP'); ramp.color_ramp.interpolation = 'EASE'
    link(nt, (d / SDF_DMAX).clamp(), ramp.inputs['Fac'])
    set_ramp(ramp, [(0.0, PAL['sea_shoal']), (0.03, PAL['sea_shallow']), (0.12, PAL['sea_mid']), (0.35, PAL['sea_deep']), (1.0, PAL['sea_abyss'])])
    # foam: crisp contact line + dashed second line + faint third
    f_contact = 1.0 - dn.sstep(0.55, 0.95)
    band2 = 1.0 - ((dn - 3.2).abs()).sstep(0.25, 0.5)
    brk2 = n2.sstep(0.45, 0.55)
    band3 = (1.0 - ((dn - 7.5).abs()).sstep(0.2, 0.45)) * n3.sstep(0.5, 0.6) * 0.45
    f_hull = (1.0 - (dh + (n3 - 0.5) * 0.4).sstep(0.18, 0.42)) * 0.85
    f_wake = (wake * 1.1 - (1.0 - n3) * 0.7 - (1.0 - n2) * 0.25).sstep(0.1, 0.28) * wake.sstep(0.05, 0.2)
    foam = f_contact.max(band2 * brk2 * 0.9).max(band3).max(f_hull).max(f_wake)
    foam = foam * C(nt, 1.0, 'FOAM_K')
    # far haze toward the backdrop
    dfw = (wx - 12.0) * 0.70710678 + (wy - 14.0) * 0.70710678
    hraw = dfw.sstep(40.0, 120.0)
    haze = dfw.sstep(70.0, 131.0).pow(1.6) * C(nt, 0.75, 'HAZE_MAX')
    hz = rgb(nt, (0.5, 0.5, 0.5), 'HAZE')
    sea = mixc(nt, haze, ramp.outputs['Color'], hz)
    fc = rgb(nt, PAL['foam'], 'FOAM')
    fo = (foam * (1.0 - haze)).clamp()
    # stylised water: the depth tint is unlit (emission) - a low sun must not darken the sea; the surface on
    # top is a dark glossy dielectric that only adds sky/scene reflections + sun glints. Foam is lit.
    link(nt, mixc(nt, fo, mulc(nt, sea, 0.18), fc), p.inputs['Base Color'])
    # low-sun sheen on the far sea (dot of the horizontal view-out direction with the sun azimuth)
    dxw = wx - 12.0; dyw = wy - 14.0
    rr_ = (dxw * dxw + dyw * dyw).sqrt() + 0.001
    sd_ = ((dxw * C(nt, 0.0, 'SUN_X') + dyw * C(nt, 1.0, 'SUN_Y')) / rr_).clamp()
    sheen = sd_.pow(3.0) * hraw.pow(1.4) * C(nt, 0.0, 'SHEEN_K')
    emis = addc(nt, mulc(nt, sea, (1.0 - fo) * C(nt, 1.0, 'SEA_E')), mulc(nt, fc, fo * C(nt, 0.5, 'FOAM_E')))
    emis = addc(nt, emis, mulc(nt, rgb(nt, (1.0, 0.7, 0.45), 'SHEEN_COL'), sheen))
    link(nt, emis, p.inputs['Emission Color'])
    p.inputs['Emission Strength'].default_value = 1.0
    paws = noise3(nt, vscale(nt, W, 0.025, 0.05, 1.0), 1.0, 2.0).sstep(0.42, 0.62)
    link(nt, fo.lmap(0, 1, 0.04, 0.85) + hraw * 0.55 + paws * 0.12, p.inputs['Roughness'])
    p.inputs['Specular IOR Level'].default_value = 1.0
    p.inputs['IOR'].default_value = 1.33
    # ripples (port: 2 scrolling normal maps + gerstner)
    mp = node(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.35, 1.0, 1.0)
    mp.inputs['Rotation'].default_value = (0, 0, math.radians(40)); link(nt, W, mp.inputs['Vector'])
    r1 = noise3(nt, mp.outputs['Vector'], 0.55, 3.0, 0.55)
    r2 = noise3(nt, W, 2.2, 2.0)
    bump = node(nt, 'ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.34; bump.inputs['Distance'].default_value = 0.12
    link(nt, (r1 * 0.8 + r2 * 0.25) * (1.0 - haze * 0.7) * (1.0 - foam * 0.6), bump.inputs['Height'])
    bump.name = 'BUMP'
    link(nt, bump.outputs['Normal'], p.inputs['Normal'])
    M['sea'] = m
    return m


build_water()
sea = obj('sea', xf(bmesh.new(), loc=(0, 0, 0)) if False else (lambda: (lambda b: (bmesh.ops.create_grid(b, x_segments=1, y_segments=1, size=900), b)[1])(bmesh.new()))(),
          mat=M['sea'], shadow=False, family='sea')

# ------------------------------------------------------------------ SKY: backdrop arc, mountains, cumulus
AZ_CAM = math.radians(225)                       # camera sits toward -x -y
FWD = Vector((math.cos(AZ_CAM + math.pi), math.sin(AZ_CAM + math.pi), 0))   # (+x +y)/sqrt2
SC = Vector((12.0, 14.0, 0.0))                   # scene centre
R_BACK = 132.0


def build_backdrop_mat():
    m = new_mat('M_backdrop'); nt = m.node_tree; out = strip(nt)
    geo = node(nt, 'ShaderNodeNewGeometry')
    wx, wy, wz = sep(nt, geo.outputs['Position'])
    dxs = wx - SC.x; dys = wy - SC.y
    rr = (dxs * dxs + dys * dys).sqrt()
    sx_ = C(nt, 0, 'SUN_X'); sy_ = C(nt, 1, 'SUN_Y')
    cosang = (dxs * sx_ + dys * sy_) / rr                      # horizontal alignment with sun/moon azimuth
    h = (wz / 60.0).clamp()
    ramp = node(nt, 'ShaderNodeValToRGB', name='SKY_RAMP'); link(nt, h, ramp.inputs['Fac'])
    ramp.color_ramp.interpolation = 'EASE'
    glow = cosang.clamp().pow(6.0) * (1.0 - h.sstep(0.0, 0.6)) * C(nt, 0.5, 'GLOW_K')
    gcol = rgb(nt, (1, 0.8, 0.6), 'GLOW_COL')
    col = mixc(nt, glow.clamp(), ramp.outputs['Color'], gcol)
    # painted stratus streaks (thin, horizontal, brighter toward the sun)
    sp = vscale(nt, geo.outputs['Position'], 0.004, 0.004, 0.09)
    st_n = noise3(nt, sp, 1.0, 3.0, 0.6)
    streak = st_n.sstep(0.56, 0.7) * wz.sstep(6.0, 12.0) * (1.0 - wz.sstep(26.0, 40.0)) * C(nt, 0.0, 'STRATUS_K')
    col = mixc(nt, streak, col, rgb(nt, (1, 0.8, 0.7), 'STRATUS_COL'))
    # moon / sun disc painted on the band
    mz = C(nt, 60.0, 'DISC_Z'); dk = C(nt, 0.0, 'DISC_K'); ms = C(nt, 0.0, 'DISC_S')
    ss = dxs * (-FWD.y) + dys * FWD.x
    dd = ((ss - ms) * (ss - ms) + (wz - mz) * (wz - mz)).sqrt()
    disc = (1.0 - dd.sstep(5.2, 5.9)) * dk
    halo = (1.0 - dd.sstep(5.5, 70.0)).pow(2.5) * dk * 0.45
    col = mixc(nt, (disc + halo).clamp(), col, rgb(nt, PAL['moon'], 'DISC_COL'))
    # stars
    vo = node(nt, 'ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 0.35
    link(nt, geo.outputs['Position'], vo.inputs['Vector'])
    star = (1.0 - SX(nt, vo.outputs['Distance']).sstep(0.02, 0.06)) * C(nt, 0.0, 'STAR_K') * h.sstep(0.1, 0.4)
    col = addc(nt, col, mulc(nt, (1, 1, 1), star))
    e = node(nt, 'ShaderNodeEmission'); link(nt, col, e.inputs['Color'])
    link(nt, C(nt, 1.0, 'SKY_E'), e.inputs['Strength'])
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    M['backdrop'] = m
    return m


build_backdrop_mat()
SIDE = Vector((-FWD.y, FWD.x, 0))
bd = bmesh.new()
cbd = SC + FWD * R_BACK
vs = [bd.verts.new(cbd + SIDE * s + Vector((0, 0, z))) for s, z in ((-420, -6), (420, -6), (420, 300), (-420, 300))]
bd.faces.new(vs)
backdrop = obj('sky_backdrop', bd, mat=M['backdrop'], shadow=False, family='sky')
backdrop.visible_diffuse = False; backdrop.visible_glossy = True



def build_mountain_mat(name):
    m = new_mat(name); nt = m.node_tree; out = strip(nt)
    geo = node(nt, 'ShaderNodeNewGeometry')
    _, _, wz = sep(nt, geo.outputs['Position'])
    nz = sep(nt, geo.outputs['Normal'])
    top = rgb(nt, (0.5, 0.5, 0.6), 'TOP'); bot = rgb(nt, (0.6, 0.6, 0.7), 'BOT')
    lit = rgb(nt, (0.7, 0.6, 0.6), 'LIT')
    # simple lit side vs shade side from the slope facing the sun (x of normal dotted with sun dir)
    sxn = C(nt, 0, 'SUN_X'); syn = C(nt, 1, 'SUN_Y')
    ndl = (nz[0] * sxn + nz[1] * syn).sstep(-0.1, 0.4)
    c = mixc(nt, ndl * C(nt, 0.5, 'LIT_K'), top, lit)
    c = mixc(nt, (wz / 18.0).clamp().pow(0.7).lmap(0, 1, 1, 0), c, bot)   # fades into haze at the base
    snow = (wz.sstep(16.0, 19.0)) * C(nt, 0.0, 'SNOW_K')
    c = mixc(nt, snow, c, rgb(nt, (0.9, 0.9, 0.95), 'SNOW'))
    e = node(nt, 'ShaderNodeEmission'); link(nt, c, e.inputs['Color'])
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    M[name] = m
    return m


def mountain_range(name, dist, s0, s1, hmax, seed, mat, n=160):
    """Ridged-noise silhouette on a line perpendicular to the view, with gaps of open horizon."""
    bm = bmesh.new()
    base, peaks = [], []
    c0 = SC + FWD * dist
    for k in range(n + 1):
        t = k / n
        s = s0 + (s1 - s0) * t
        h = 0.0; amp = 1.0; f = 1.0
        for o in range(4):
            r_ = 1.0 - abs(noise.noise(Vector((s * 0.012 * f + seed * 3.3, seed, o * 1.7))))
            h += amp * r_ ** 2.2; amp *= 0.5; f *= 2.1
        env = max(0.0, noise.noise(Vector((s * 0.006 + seed, 0.5, 0.0))) + 0.18) / 0.7
        h = hmax * h * 0.55 * min(1.0, env) ** 0.8
        p = c0 + SIDE * s
        base.append(bm.verts.new((p.x, p.y, -5)))
        peaks.append(bm.verts.new((p.x, p.y, max(h, -1.0))))
    for k in range(n):
        bm.faces.new((base[k], base[k + 1], peaks[k + 1], peaks[k]))
    ob = obj(name, bm, mat=mat, shadow=False, family='sky')
    ob.visible_diffuse = False; ob.visible_glossy = False
    return ob


build_mountain_mat('M_mount_far'); build_mountain_mat('M_mount_mid'); build_mountain_mat('M_mount_near')
mountain_range('mountains_far', R_BACK - 4, -380, 380, 22, 3, M['M_mount_far'])
mountain_range('mountains_mid', R_BACK - 9, -300, 260, 14, 11, M['M_mount_mid'])
mountain_range('mountains_near', R_BACK - 14, -200, 60, 8, 8, M['M_mount_near'])


def build_cloud_mat():
    """Sculpted cumulus: half-lambert ramp + rim + base darkening. Port: unlit mesh shader, same maths."""
    m = new_mat('M_cloud'); nt = m.node_tree; out = strip(nt)
    geo = node(nt, 'ShaderNodeNewGeometry')
    nx_, ny_, nz_ = sep(nt, geo.outputs['Normal'])
    _, _, wz = sep(nt, geo.outputs['Position'])
    sx_ = C(nt, 0, 'SUN_X'); sy_ = C(nt, 1, 'SUN_Y'); sz_ = C(nt, 0.3, 'SUN_Z')
    ndl = nx_ * sx_ + ny_ * sy_ + nz_ * sz_
    lit = ndl.sstep(-0.12, 0.12)
    lit = lit * 0.82 + (ndl * 0.5 + 0.5) * 0.18
    shade = rgb(nt, (0.5, 0.5, 0.6), 'SHADE'); light = rgb(nt, (1, 0.9, 0.8), 'LIGHT'); rimc = rgb(nt, (1, 0.8, 0.6), 'RIM')
    mid = rgb(nt, (0.8, 0.6, 0.55), 'MID')
    c = mixc(nt, lit.sstep(0.0, 0.55), shade, mid)
    c = mixc(nt, lit.sstep(0.45, 1.0), c, light)
    lw = node(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    rim = SX(nt, lw.outputs['Facing']).sstep(0.7, 0.95) * (ndl * 0.5 + 0.5).sstep(0.25, 0.6) * C(nt, 0.6, 'RIM_K')
    c = mixc(nt, rim.clamp(), c, rimc)
    base_dark = 1.0 - (wz - C(nt, 0.0, 'BASE_Z')).sstep(7.0, 13.0)
    c = mixc(nt, base_dark * 0.4 * (1.0 - nz_.sstep(0.2, 0.8)), c, shade)
    e = node(nt, 'ShaderNodeEmission'); link(nt, c, e.inputs['Color'])
    link(nt, C(nt, 1.0, 'CLOUD_E'), e.inputs['Strength'])
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    M['cloud'] = m
    return m


build_cloud_mat()
CLOUDS = []


def cumulus(name, centre, width, height, seed, flat_base=True):
    """Sculpted cumulus: a flat-based tiered stack - wide base tier, narrowing cauliflower tiers, crown."""
    rng_ = random.Random(seed)
    bm = bmesh.new()
    cx, cy, cz = centre
    tiers = 4
    for ti in range(tiers):
        f = ti / (tiers - 1)
        tw = width * (1.0 - 0.62 * f) * rng_.uniform(0.9, 1.05)
        zc = cz + height * (0.12 + 0.62 * f)
        off = (rng_.uniform(-0.12, 0.12) + (0.1 if ti % 2 else -0.06)) * width
        n = max(2, int(6 - ti * 1.2))
        for j in range(n):
            t = (j + 0.5) / n - 0.5
            r = tw / n * rng_.uniform(0.62, 0.95) * (1.25 if abs(t) < 0.2 else 1.0)
            p = Vector((cx, cy, 0)) + SIDE * (off + t * tw * 0.85) + FWD * rng_.uniform(-0.15, 0.15) * r
            merge(bm, bm_ico(r, (p.x, p.y, zc + rng_.uniform(-0.1, 0.25) * r), 3, (1.0, 1.0, 0.86), seed=seed * 31 + ti * 7 + j, amp=0.16))
    if flat_base:
        for v in bm.verts:
            if v.co.z < cz:
                v.co.z = cz + (v.co.z - cz) * 0.08
    ob = obj(name, bm, mat=M['cloud'], shadow=False, smooth=True, family='sky')
    ob.visible_diffuse = False; ob.visible_glossy = False
    CLOUDS.append(ob)
    return ob


for i, (s, z, wdt, hgt) in enumerate(((-165, 10, 46, 21), (50, 8, 56, 24), (195, 11, 40, 17), (-62, 15, 22, 9))):
    c = SC + FWD * (R_BACK - 3) + SIDE * s
    cumulus(f'cloud_{i}', (c.x, c.y, z), wdt, hgt, 40 + i)

# ------------------------------------------------------------------ LIGHTS
def add_light(name, kind, loc=(0, 0, 0), **kw):
    ld = bpy.data.lights.new(name, kind)
    ob = bpy.data.objects.new(name, ld); ROOTC.objects.link(ob)
    ob.location = loc
    for k, v in kw.items():
        setattr(ld, k, v)
    return ob


sun = add_light('key_sun', 'SUN', angle=math.radians(0.6))
fill = add_light('fill_sun', 'SUN', angle=math.radians(10))
fill.data.use_shadow = False
lamp_lights = []
for i, p in enumerate(LAMPS):
    l = add_light(f'lamp_light_{i}', 'POINT', loc=p - Vector((0, 0, 0.1)), shadow_soft_size=0.15, color=PAL['sodium'])
    lamp_lights.append(l)
lh_light = add_light('pharos_light', 'POINT', loc=LAMP, shadow_soft_size=0.3, color=PAL['lantern'])
hl_light = add_light('harbour_light', 'POINT', loc=HL_POS, shadow_soft_size=0.2, color=lin('#FF5A3C'))
# window spill lights (a handful, per lit house)
win_lights = []
for (nm, x, y, z, P_) in HOUSES:
    l = add_light(f'win_{nm}', 'POINT', loc=(x, y - P_['d'] / 2 - 1.6, z + 2.2), shadow_soft_size=0.6, color=PAL['sodium'])
    win_lights.append(l)
win_lights.append(add_light('win_keeper', 'POINT', loc=(62, 22 - 3.3 - 1.6, 14.2), shadow_soft_size=0.6, color=PAL['sodium']))
riding = []
for nm, info in FLEET:
    if info['tops']:
        t = max(info['tops'], key=lambda v: v.z)
        mw = info['heel_root'].matrix_world if False else None
        ro = bmesh.new(); merge(ro, bm_sphere(0.15, (t.x, t.y, t.z + 0.3), 8, 5))
        obj(nm + '_riding_light', ro, mat=M['riding'], parent=info['heel_root'], shadow=False, family='mooring')

# beam (cone mesh, WebGL2 path) - two opposite panels
def build_beam_mat():
    """Cone-mesh beam (WebGL2 path): additive, core = facing^k, length falloff, world-space mist noise."""
    m = new_mat('M_beam'); nt = m.node_tree; out = strip(nt)
    tc = node(nt, 'ShaderNodeTexCoord')
    geo = node(nt, 'ShaderNodeNewGeometry')
    ox, oy, oz = sep(nt, tc.outputs['Object'])
    along = (1.0 - (ox / 220.0).clamp()).pow(1.5)
    near = ox.sstep(1.0, 9.0)
    lw = node(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    fac = 1.0 - SX(nt, lw.outputs['Facing'])          # 1 = looking straight through the axis
    core = fac.pow(6.0) * 0.75 + fac.pow(2.0) * 0.25
    mist = noise3(nt, vscale(nt, geo.outputs['Position'], 0.05, 0.05, 0.12), 1.0, 3.0).sstep(0.3, 0.75) * 0.7 + 0.45
    s = along * near * core * mist * C(nt, 0.0, 'BEAM_K')
    e = node(nt, 'ShaderNodeEmission'); e.inputs['Color'].default_value = (*PAL['lantern'], 1)
    link(nt, s, e.inputs['Strength'])
    tr = node(nt, 'ShaderNodeBsdfTransparent')
    ad = node(nt, 'ShaderNodeAddShader')
    nt.links.new(tr.outputs[0], ad.inputs[0]); nt.links.new(e.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'; m.use_backface_culling = False
    M['beam'] = m
    # lantern halo sprite (additive radial glow)
    m = new_mat('M_halo'); nt = m.node_tree; out = strip(nt)
    lw = node(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    g = (1.0 - SX(nt, lw.outputs['Facing'])).pow(4.0)
    e = node(nt, 'ShaderNodeEmission'); e.inputs['Color'].default_value = (*PAL['lantern'], 1)
    link(nt, g * C(nt, 0.0, 'HALO_K'), e.inputs['Strength'])
    tr = node(nt, 'ShaderNodeBsdfTransparent'); ad = node(nt, 'ShaderNodeAddShader')
    nt.links.new(tr.outputs[0], ad.inputs[0]); nt.links.new(e.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'
    M['halo'] = m


build_beam_mat()
BEAMS = []
for k, a in enumerate((math.radians(203), math.radians(23))):
    bm = bm_cyl(0.6, 11.0, 220.0, 32, (0, 0, 0), cap=False)
    xf(bm, ry=math.pi / 2)
    b = obj(f'pharos_beam_{k}', bm, mat=M['beam'], loc=tuple(LAMP), rot=(0, math.radians(2.0), a), shadow=False, family='beam')
    b.visible_diffuse = False
    BEAMS.append(b)

halo = obj('pharos_halo', bm_sphere(2.5, tuple(LAMP), 24, 12), mat=M['halo'], shadow=False, smooth=True, family='beam')
halo.visible_diffuse = False
BEAMS.append(halo)

# light pillars on the water under lamps (night) - additive strips toward the camera
def build_pillar_mat():
    m = new_mat('M_pillar'); nt = m.node_tree; out = strip(nt)
    uv = node(nt, 'ShaderNodeUVMap')
    u, v, _ = sep(nt, uv.outputs['UV'])
    geo = node(nt, 'ShaderNodeNewGeometry')
    W = geo.outputs['Position']
    br = noise3(nt, vscale(nt, W, 1.2, 1.2, 1.0), 1.0, 2.0).sstep(0.45, 0.62)
    across = 1.0 - ((u - 0.5).abs() * 2.0).sstep(0.2, 1.0)
    fall = (1.0 - v).pow(1.5)
    s = across * fall * br * C(nt, 0.0, 'PILLAR_K')
    e = node(nt, 'ShaderNodeEmission'); e.inputs['Color'].default_value = (*PAL['sodium'], 1)
    link(nt, s, e.inputs['Strength'])
    tr = node(nt, 'ShaderNodeBsdfTransparent'); ad = node(nt, 'ShaderNodeAddShader')
    nt.links.new(tr.outputs[0], ad.inputs[0]); nt.links.new(e.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'
    M['pillar'] = m


build_pillar_mat()
PILLARS = []


def pillar(name, src, length, width, col=None):
    """Strip lying on the water from below the source toward the camera."""
    d = -FWD
    side = Vector((-d.y, d.x, 0))
    p0 = Vector((src.x, src.y, 0.04))
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(p0 - side * width / 2), bm.verts.new(p0 + side * width / 2),
          bm.verts.new(p0 + side * width / 2 + d * length), bm.verts.new(p0 - side * width / 2 + d * length)]
    f = bm.faces.new(vs)
    for lp, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        lp[uvl].uv = uv
    ob = obj(name, bm, mat=M['pillar'], shadow=False, family='fx')
    ob.visible_diffuse = False
    PILLARS.append(ob)
    return ob


for i, p in enumerate(LAMPS):
    if p.y < 6:
        pillar(f'pillar_lamp_{i}', p, 12.0 if p.z > 4 else 9.0, 1.4)
pillar('pillar_harbour_light', HL_POS, 16.0, 2.2)

mm = new_mat('M_mist'); ntm = mm.node_tree; outm = strip(ntm)
gm = node(ntm, 'ShaderNodeNewGeometry')
_, _, mz_ = sep(ntm, gm.outputs['Position'])
mn = noise3(ntm, vscale(ntm, gm.outputs['Position'], 0.03, 0.03, 0.08), 1.0, 2.0)
dens = (1.0 - mz_.sstep(0.0, 22.0)) * (mn.sstep(0.35, 0.7) * 0.7 + 0.3) * C(ntm, 0.0, 'MIST_K')
pv = node(ntm, 'ShaderNodeVolumePrincipled'); pv.inputs['Color'].default_value = (*lin('#9FB0D8'), 1)
pv.inputs['Anisotropy'].default_value = 0.55
link(ntm, dens, pv.inputs['Density'])
ntm.links.new(pv.outputs[0], outm.inputs['Volume'])
M['mist'] = mm
mist_box = obj('sea_mist', bm_box2(-140, -130, -0.5, 170, 150, 45), mat=mm, shadow=False, family='fx')
spot = add_light('pharos_spot', 'SPOT', loc=tuple(LAMP), color=PAL['lantern'], spot_size=math.radians(6.5), spot_blend=0.6,
                 shadow_soft_size=0.2)
_bz = BEAMS[0].rotation_euler.z
_bd = Vector((math.cos(_bz) * math.cos(math.radians(2)), math.sin(_bz) * math.cos(math.radians(2)), -math.sin(math.radians(2))))
spot.rotation_euler = _bd.to_track_quat('-Z', 'Y').to_euler()
spot.data.use_shadow = False
spot.data.volume_factor = 1.0
spot.data.diffuse_factor = 0.0; spot.data.specular_factor = 0.0
print('SCENE', round(time.time() - t0, 1), 's')

# ------------------------------------------------------------------ CAMERAS (brief: persp, 25 deg vFOV, 35 deg pitch, 45 deg yaw)
def make_cam(name, target, dist, shift_y=0.0):
    cd = bpy.data.cameras.new(name); cd.type = 'PERSP'; cd.sensor_fit = 'VERTICAL'
    cd.angle_y = math.radians(25.0); cd.clip_start = 1.0; cd.clip_end = 3000; cd.shift_y = shift_y
    co = bpy.data.objects.new('cam_' + name, cd); ROOTC.objects.link(co)
    pitch = math.radians(35)
    back = Vector((-FWD.x * math.cos(pitch), -FWD.y * math.cos(pitch), math.sin(pitch)))
    co.location = Vector(target) + back * dist
    co.rotation_euler = (math.radians(90 - 35), 0, math.radians(-45))
    return co


CAMS_OB = {
    'overview': make_cam('overview', (16.0, 4.0, 5.0), 318.0, 0.035),
    'harbour': make_cam('harbour', (2.0, -18.0, 3.0), 165.0, 0.0),
    'pharos': make_cam('pharos', (66.0, -3.0, 24.0), 95.0, 0.0),
    'fleet': make_cam('fleet', (10.0, -30.0, 6.0), 90.0, 0.0),
}

# ------------------------------------------------------------------ WORLD (ambient + reflections)
wt = bpy.data.worlds.new('W'); scene.world = wt
try:
    wt.use_nodes = True
except Exception:
    pass
wnt = wt.node_tree
wbg = wnt.nodes['Background']
wtc = node(wnt, 'ShaderNodeTexCoord')
_, _, wz_ = sep(wnt, wtc.outputs['Generated'])
wramp = node(wnt, 'ShaderNodeValToRGB', name='WORLD_RAMP'); link(wnt, wz_.lmap(-0.1, 0.9, 0, 1), wramp.inputs['Fac'])
link(wnt, wramp.outputs['Color'], wbg.inputs['Color'])

# ------------------------------------------------------------------ RENDER SETTINGS + COMPOSITOR
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.render.resolution_percentage = PCT
scene.render.engine = 'BLENDER_EEVEE'
ee = scene.eevee
ee.taa_render_samples = SAMPLES
ee.use_raytracing = True
ee.ray_tracing_method = 'SCREEN'
ee.use_shadows = True
ee.shadow_ray_count = 2; ee.shadow_step_count = 10
ee.use_fast_gi = True
ee.volumetric_end = 900.0; ee.volumetric_tile_size = '4'; ee.volumetric_samples = 96; ee.use_volumetric_shadows = False
ee.fast_gi_distance = 12.0
ee.shadow_resolution_scale = 1.0
try:
    ee.ray_tracing_options.resolution_scale = '1'; ee.ray_tracing_options.screen_trace_quality = 0.6
except Exception:
    pass
scene.view_settings.view_transform = 'AgX'
try:
    scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    try:
        scene.view_settings.look = 'Punchy'
    except Exception as e:
        print('look', e)
scene.view_layers[0].use_pass_mist = True
wt.mist_settings.start = 300; wt.mist_settings.depth = 500; wt.mist_settings.falloff = 'QUADRATIC'

cng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree')
scene.compositing_node_group = cng
cng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
rl = cng.nodes.new('CompositorNodeRLayers')
gl = cng.nodes.new('CompositorNodeGlare'); gl.inputs['Type'].default_value = 'Bloom'
try:
    gl.inputs['Quality'].default_value = 'High'
except Exception:
    pass
cb = cng.nodes.new('CompositorNodeColorBalance')
try:
    cb.inputs['Type'].default_value = 'Lift/Gamma/Gain'
except Exception:
    pass
# vignette
em = cng.nodes.new('CompositorNodeEllipseMask')
em.inputs['Size'].default_value = (0.92, 0.88)
bl = cng.nodes.new('CompositorNodeBlur'); bl.inputs['Size'].default_value = (260, 260)
try:
    bl.inputs['Type'].default_value = 'Gaussian'
except Exception:
    pass
vmix = cng.nodes.new('ShaderNodeMix'); vmix.data_type = 'RGBA'
go = cng.nodes.new('NodeGroupOutput')
cng.links.new(rl.outputs['Image'], gl.inputs['Image'])
hs = cng.nodes.new('CompositorNodeHueSat'); hs.inputs['Saturation'].default_value = 1.12
cng.links.new(gl.outputs['Image'], hs.inputs['Image'])
cng.links.new(hs.outputs['Image'], cb.inputs['Image'])
cng.links.new(em.outputs['Mask'], bl.inputs['Image'])
vm_ = cng.nodes.new('ShaderNodeMapRange'); vm_.inputs['To Min'].default_value = 0.84
cng.links.new(bl.outputs['Image'], vm_.inputs['Value'])
sock(vmix, 'A_Color').default_value = (0.0, 0.0, 0.0, 1.0)
cng.links.new(cb.outputs['Image'], sock(vmix, 'B_Color'))
cng.links.new(vm_.outputs['Result'], sock(vmix, 'Factor_Float'))
cng.links.new(sock(vmix, 'Result_Color', out=True), go.inputs[0])
scene.render.use_compositing = True


def set_cb(lift, gamma, gain):
    def put(name, v):
        for s in cb.inputs:
            if s.name == name and s.enabled and s.type == 'RGBA':
                s.default_value = (*v, 1)
    put('Lift', lift); put('Gamma', gamma); put('Gain', gain)


# ------------------------------------------------------------------ STATES
def nodes_of(name):
    return M[name].node_tree.nodes


def setv(mat, key, v):
    n = M[mat].node_tree.nodes.get(key)
    if n is None:
        return
    if n.type == 'VALUE':
        n.outputs[0].default_value = v
    elif n.type == 'RGB':
        n.outputs[0].default_value = (*v[:3], 1)


def aim(ob, az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    ob.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    return d


STATE = {
    'golden': dict(sun=(288, 9, 5.6, '#FFA257'), fill=(110, 35, 0.3, '#7F98D6'), world=[(0, '#C9A89A'), (0.3, '#8C9AC0'), (1, '#5470A6')], world_k=0.6,
                   sky=[(0, '#D2B2A6'), (0.025, '#FFE6BC'), (0.07, '#FFCB94'), (0.22, '#EBA88E'), (0.45, '#B98F9E'), (0.75, '#7C82B0'), (1, '#55689C')], glow=('#FFD39A', 1.0), disc=0.0,
                   stars=0.0, haze='#D2B2A6', haze_max=0.9, foam='#FFF6EA', mount_top='#7F7F9E', mount_bot='#C7AFA8', mount_lit='#C9A089', mount_lit_k=0.6, snow=0.0,
                   cloud_light='#FFDCB0', cloud_mid='#E8A493', cloud_shade='#77719C', cloud_rim='#FFAA62', rim_k=1.0, cloud_e=1.0, lamp=4.0, win=1.2, lens=10.0, beam=0.0,
                   ride=2.0, pillar=0.0, lamp_w=25.0, lh_w=300.0, winl=0.0, beacon=4.0, sea_e=0.8, sheen_k=0.55, sheen_col='#FFB27A', stratus_k=0.55, stratus_col='#FFC8A0', exposure=0.25, foam_e=0.5, glare=(0.22, 1.3),
                   cb=((0.99, 1.0, 1.04), (1.0, 1.0, 1.0), (1.05, 1.0, 0.94)), mist=('#C7AFA8',)),
    'noon': dict(sun=(160, 58, 4.3, '#FFF4E4'), fill=(30, 40, 0.4, '#A9C4EE'), world=[(0, '#C3D3DC'), (0.3, '#8AAED2'), (1, '#4C7FBE')], world_k=0.62,
                 sky=[(0, '#BCD3DF'), (0.03, '#E8F1F4'), (0.15, '#C8DFEE'), (0.5, '#93BEE2'), (1, '#5A8FCC')], glow=('#FFFFFF', 0.25), disc=0.0, stars=0.0,
                 haze='#BCD3DF', haze_max=0.7, foam='#FFFFFF', mount_top='#8FA8C2', mount_bot='#C7DCE6', mount_lit='#B9C9D8', mount_lit_k=0.5, snow=1.0,
                 cloud_light='#FFFFFF', cloud_mid='#E3EAF3', cloud_shade='#A2B3CC', cloud_rim='#FFFFFF', rim_k=0.4, cloud_e=1.0, lamp=0.4, win=0.0, lens=5.0, beam=0.0,
                 ride=0.0, pillar=0.0, lamp_w=0.0, lh_w=0.0, winl=0.0, beacon=0.6, stratus_k=0.35, stratus_col='#FFFFFF', exposure=0.0, foam_e=0.4, glare=(0.1, 2.0), cb=((1.0, 1.0, 1.01), (1.0, 1.0, 1.0), (1.0, 1.0, 1.0)),
                 mist=('#C7DCE6',)),
    'night': dict(sun=(50, 26, 1.25, '#A9BCFF'), fill=(230, 40, 0.2, '#5A6FB0'), world=[(0, '#2C3F6E'), (0.35, '#1C2B55'), (1, '#0B1330')], world_k=1.25,
                  sky=[(0, '#1E2C50'), (0.03, '#3A4E80'), (0.12, '#26385F'), (0.45, '#131D3F'), (1, '#080D22')], glow=('#6C82C0', 0.55), disc=1.0,
                  stars=1.0, haze='#1E2C50', haze_max=0.7, foam='#B9C8E6', mount_top='#1A2443', mount_bot='#24345C', mount_lit='#3A4C78', mount_lit_k=0.4, snow=0.5,
                  cloud_light='#7C8DB6', cloud_mid='#3A4878', cloud_shade='#1C2548', cloud_rim='#D3DEFF', rim_k=1.0, cloud_e=1.0, lamp=40.0, win=6.0, lens=80.0, beam=0.7,
                  ride=70.0, pillar=1.8, lamp_w=170.0, lh_w=6000.0, winl=240.0, beacon=40.0, sea_e=0.5, exposure=0.3, foam_e=0.14, mist_k=0.006, spot_w=320000.0, sheen_k=0.25, sheen_col='#8FA6E0', stratus_k=0.35, stratus_col='#5E6F9E', disc_s=-46.0, disc_z=23.0,
                  glare=(0.7, 0.7), cb=((0.98, 0.99, 1.05), (0.98, 1.0, 1.03), (1.03, 1.0, 0.98)), mist=('#1E2C50',)),
}


def apply_state(st):
    S = STATE[st]
    az, el, e, c = S['sun']
    sd = aim(sun, az, el); sun.data.energy = e; sun.data.color = lin(c)
    fd = aim(fill, *S['fill'][:2]); fill.data.energy = S['fill'][2]; fill.data.color = lin(S['fill'][3])
    set_ramp(wramp, [(p, lin(h)) for p, h in S['world']]); wbg.inputs['Strength'].default_value = S['world_k']
    bn = M['backdrop'].node_tree.nodes
    set_ramp(bn['SKY_RAMP'], [(p, lin(h)) for p, h in S['sky']])
    hd = Vector((sd.x, sd.y, 0)).normalized()
    for mat in ('backdrop', 'M_mount_far', 'M_mount_mid', 'M_mount_near', 'cloud', 'sea'):
        setv(mat, 'SUN_X', hd.x); setv(mat, 'SUN_Y', hd.y)
    setv('cloud', 'SUN_Z', sd.z)
    setv('backdrop', 'GLOW_COL', lin(S['glow'][0])); setv('backdrop', 'GLOW_K', S['glow'][1])
    setv('backdrop', 'STRATUS_K', S.get('stratus_k', 0.0)); setv('backdrop', 'STRATUS_COL', lin(S.get('stratus_col', '#FFFFFF')))
    setv('backdrop', 'DISC_K', S['disc']); setv('backdrop', 'STAR_K', S['stars'])
    setv('backdrop', 'DISC_Z', S.get('disc_z', 70.0))
    setv('sea', 'SHEEN_K', S.get('sheen_k', 0.0)); setv('sea', 'SHEEN_COL', lin(S.get('sheen_col', '#FFFFFF')))
    setv('sea', 'HAZE_MAX', S.get('haze_max', 0.75)); setv('sea', 'HAZE', lin(S['haze'])); setv('sea', 'FOAM', lin(S['foam'])); setv('sea', 'SEA_E', S.get('sea_e', 1.0))
    for mm, k in (('M_mount_far', 0.45), ('M_mount_mid', 0.72), ('M_mount_near', 1.0)):
        top = lin(S['mount_top']); bot = lin(S['mount_bot'])
        top = tuple(a * k + b * (1 - k) for a, b in zip(top, bot))
        setv(mm, 'TOP', top); setv(mm, 'BOT', bot); setv(mm, 'LIT', lin(S['mount_lit'])); setv(mm, 'LIT_K', S['mount_lit_k'])
        setv(mm, 'SNOW_K', S['snow'])
    setv('cloud', 'MID', lin(S['cloud_mid'])); setv('cloud', 'LIGHT', lin(S['cloud_light'])); setv('cloud', 'SHADE', lin(S['cloud_shade'])); setv('cloud', 'RIM', lin(S['cloud_rim']))
    setv('cloud', 'RIM_K', S['rim_k']); setv('cloud', 'CLOUD_E', S['cloud_e'])
    setv('lamp', 'LAMP_K', S['lamp']); setv('window', 'WIN_K', S['win']); setv('lens', 'LENS_K', S['lens'])
    setv('riding', 'RIDE_K', S['ride']); setv('beam', 'BEAM_K', S['beam']); setv('halo', 'HALO_K', S['beam'] * 1.4); setv('pillar', 'PILLAR_K', S['pillar'])
    setv('beacon_red', 'BEACON_K', S['beacon'])
    for b in BEAMS:
        b.hide_render = S['beam'] == 0
    for p_ in PILLARS:
        p_.hide_render = S['pillar'] == 0
    for l in lamp_lights:
        l.data.energy = S['lamp_w']
    lh_light.data.energy = S['lh_w']; hl_light.data.energy = S['lamp_w'] * 2
    for l in win_lights:
        l.data.energy = S['winl']
    setv('mist', 'MIST_K', S.get('mist_k', 0.0)); mist_box.hide_render = S.get('mist_k', 0.0) == 0
    spot.data.energy = S.get('spot_w', 0.0)
    gl.inputs['Strength'].default_value = S['glare'][0]; gl.inputs['Threshold'].default_value = S['glare'][1]
    scene.view_settings.exposure = S.get('exposure', 0.0)
    setv('sea', 'FOAM_E', S.get('foam_e', 0.5))
    setv('backdrop', 'DISC_S', S.get('disc_s', 0.0))
    set_cb(*S['cb'])


# ------------------------------------------------------------------ STATS
fams = {}
dg = bpy.context.evaluated_depsgraph_get()
total = 0
for ob in scene.objects:
    if ob.type != 'MESH':
        continue
    f = ob.get('family', 'misc')
    if f in ('sky', 'sea', 'fx', 'beam'):
        continue
    ev = ob.evaluated_get(dg); me = ev.to_mesh(); me.calc_loop_triangles()
    n = len(me.loop_triangles); ev.to_mesh_clear()
    fams[f] = fams.get(f, 0) + n; total += n
stats = dict(total_block_tris=total, by_family=dict(sorted(fams.items(), key=lambda kv: -kv[1])),
             objects=sum(1 for o in scene.objects if o.type == 'MESH'), build_s=round(time.time() - t0, 1))
print('STATS', json.dumps(stats))
with open(os.path.join(HERE, 'block-stats.json'), 'w') as fh:
    json.dump(stats, fh, indent=1)

if SAVE:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'style-c.blend'), compress=True)

for cam in CAMS:
    scene.camera = CAMS_OB[cam]
    for st in STATES:
        apply_state(st)
        out = os.path.join(OUT, f'render-{cam}-{st}{SUFFIX}.png')
        scene.render.filepath = out
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print('RENDERED', out, round(time.time() - t1, 1), 's')
