"""Harbour hulls - lookdev renders: lineup sheets (docked / sailing), a game-scale check and a harbour vignette.

    blender -b --factory-startup -P scripts/harbour/blender/hulls/lineup.py -- --mode docked|sailing|game|vignette|lod
        [--samples 48] [--pct 100] [--out DIR]

Boats are built in-scene by the same builder the GLB export uses (hb_hulls.build_boat), then posed exactly the
way the runtime will pose them (furl morph, boom swing, jib about its stay, heel pivot). Style C materials are
reused from agents/.../p1/style-c (kit pattern shader, lighting state) for the preview only.
"""
import sys, os, math, random, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
STYLE_C = os.path.join(ROOT, 'agents', '2026-10-13-pharosville-reboot', 'p1', 'style-c')
sys.path.insert(0, HERE)
sys.path.insert(1, STYLE_C)
for p in ('/home/ahirice/.local/lib/python3.14/site-packages',):
    if p not in sys.path:
        sys.path.append(p)
import importlib
import hb_lib; importlib.reload(hb_lib)
import hb_hulls; importlib.reload(hb_hulls)
import nl_common as ncm; importlib.reload(ncm)
import nl_kit as nk; importlib.reload(nk)
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
from hb_lib import PAL, lin, descendants, tri_count, reset_scene
from hb_hulls import VARIANTS, build_boat, build_lod, build_buoy, build_dinghy, build_wreck, CLASS_LOA

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(n, d):
    return ARGV[ARGV.index(n) + 1] if n in ARGV else d


MODE = arg('--mode', 'docked')
SAMPLES = int(arg('--samples', '48'))
PCT = int(arg('--pct', '100'))
OUT = arg('--out', os.path.join(ROOT, 'agents', '2026-10-13-pharosville-reboot', 'p2', 'hulls'))
SCRATCH = os.path.join(ROOT, 'outputs', 'harbour', 'hulls')
os.makedirs(OUT, exist_ok=True); os.makedirs(SCRATCH, exist_ok=True)
random.seed(5)
reset_scene()
scene = bpy.context.scene

# ------------------------------------------------------------------ emblem atlas from the real logos
COINS = {
    'usd_cat_skiff': ('8-lusd.svg', 'LUSD'), 'usd_sloop_boat': ('15-dola.svg', 'DOLA'), 'usd_sloop_small': ('118-gho.svg', 'GHO'),
    'usd_cutter_medium': ('5-dai.svg', 'DAI'), 'usd_schooner_large': ('2-usdc.svg', 'USDC'), 'usd_ship_flagship': ('1-usdt.svg', 'USDT'),
    'eur_botter_boat': ('55-eura.svg', 'EURA'), 'eur_botter_small': ('51-eurs.svg', 'EURS'), 'eur_botter_medium': ('101-eure.svg', 'EURe'),
    'eur_botter_large': ('50-eurc.svg', 'EURC'), 'gold_brig_medium': ('gold-paxg.svg', 'PAXG'), 'gold_brig_large': ('gold-xaut.svg', 'XAUT'),
    'fiat_lugger_boat': ('289-xsgd.svg', 'XSGD'), 'fiat_lugger_small': ('122-gyen.svg', 'GYEN'), 'fiat_lugger_medium': ('140-egbp.svg', 'eGBP'),
    'other_work_skiff': ('93-djed.svg', 'DJED'), 'other_work_boat': ('84-bob.svg', 'BOB'), 'other_work_small': ('10-mim.svg', 'MIM'),
}
NSLOT = 5


def build_atlas():
    from PIL import Image, ImageDraw
    S = 256
    atlas = Image.new('RGBA', (S * NSLOT, S * NSLOT), (0, 0, 0, 0))
    brands = {}
    tmp = os.path.join(SCRATCH, 'logo_tmp.png')
    for k, (vid, (fn, _)) in enumerate(COINS.items()):
        src = os.path.join(ROOT, 'public', 'logos', fn)
        subprocess.run(['rsvg-convert', '-w', str(int(S * 0.74)), '-h', str(int(S * 0.74)), '--keep-aspect-ratio', src, '-o', tmp], check=True)
        lg = Image.open(tmp).convert('RGBA')
        a = np.asarray(lg).astype(np.float32) / 255
        m = (a[..., 3] > 0.6)
        rgb = a[..., :3][m]
        if len(rgb):
            mx_, mn_ = rgb.max(1), rgb.min(1)
            sat = (mx_ - mn_) / np.maximum(mx_, 1e-3)
            pick = rgb[(sat > 0.35) & (mx_ > 0.2)]
            c = (pick.mean(0) if len(pick) > 20 else rgb.mean(0))
        else:
            c = np.array([0.5, 0.5, 0.6])
        brands[vid] = tuple(float(((x + 0.055) / 1.055) ** 2.4) for x in c)
        tile = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(tile)
        d.ellipse((6, 6, S - 6, S - 6), fill=(250, 248, 242, 255))
        tile.alpha_composite(lg, ((S - lg.width) // 2, (S - lg.height) // 2))
        atlas.alpha_composite(tile, ((k % NSLOT) * S, (k // NSLOT) * S))
    path = os.path.join(SCRATCH, 'emblem-atlas-preview.png')
    atlas.save(path)
    img = bpy.data.images.load(path, check_existing=False); img.alpha_mode = 'STRAIGHT'
    return img, brands, {vid: k for k, vid in enumerate(COINS)}


ATLAS, BRAND, SLOT = build_atlas()

# ------------------------------------------------------------------ preview materials (runtime contract, Blender maths)
SX, C, sep, comb, node, link, rgb, mixc, mulc, addc, noise3, vscale, sock = (ncm.SX, ncm.C, ncm.sep, ncm.comb, ncm.node, ncm.link,
                                                                          ncm.rgb, ncm.mixc, ncm.mulc, ncm.addc, ncm.noise3, ncm.vscale, ncm.sock)
ncm.build_kit_material()
ncm.build_glow_material('lamp', lin('#3B3A33'), PAL['brass'], 'LAMP_K')


def pv_opaque():
    m = ncm.M['kit'].copy(); m.name = 'PV_opaque'
    nt = m.node_tree
    at = [n for n in nt.nodes if n.type == 'ATTRIBUTE' and n.attribute_name == 'Col'][0]
    outs = [l.to_socket for l in nt.links if l.from_socket == at.outputs['Color']]
    for l in [l for l in nt.links if l.from_socket == at.outputs['Color']]:
        nt.links.remove(l)
    br = node(nt, 'ShaderNodeAttribute', attribute_name='_BRAND')
    oi = node(nt, 'ShaderNodeObjectInfo')
    res = mixc(nt, SX(nt, br.outputs['Fac']), at.outputs['Color'], oi.outputs['Color'])
    for s in outs:
        nt.links.new(res, s)
    return m


def pv_sail():
    m = ncm.new_mat('PV_sail'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    at = node(nt, 'ShaderNodeAttribute', attribute_name='Col')
    uv0 = node(nt, 'ShaderNodeUVMap'); uv0.uv_map = 'UVMap'
    uv1 = node(nt, 'ShaderNodeUVMap'); uv1.uv_map = 'UVEmblem'
    geo = node(nt, 'ShaderNodeNewGeometry')
    u, v, _ = sep(nt, uv0.outputs['UV'])
    eu, ev, _ = sep(nt, uv1.outputs['UV'])
    mi = node(nt, 'ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='mirror')
    bf = (SX(nt, geo.outputs['Backfacing']) - SX(nt, mi.outputs['Fac'])).abs()   # flip if back face XOR mirrored
    eu = eu + bf * (1.0 - eu * 2.0)
    inside = eu.sstep(0.0, 0.003) * (1.0 - eu.sstep(0.997, 1.0)) * ev.sstep(0.0, 0.003) * (1.0 - ev.sstep(0.997, 1.0))
    em = node(nt, 'ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='emblem')
    idx = SX(nt, em.outputs['Fac'])
    sx = idx - (idx / NSLOT).floor() * NSLOT
    sy = (idx / NSLOT).floor()
    au = (eu.clamp() + sx) / NSLOT
    av = (ev.clamp() + (NSLOT - 1.0 - sy)) / NSLOT
    im = node(nt, 'ShaderNodeTexImage', interpolation='Linear', extension='CLIP'); im.image = ATLAS
    link(nt, comb(nt, au, av, 0.0), im.inputs['Vector'])
    alpha = SX(nt, im.outputs['Alpha']) * inside
    seam = (((v * 7.0).fract() - 0.5).abs() * 2.0).sstep(0.9, 0.97)
    edge = (1.0 - u.sstep(0.0, 0.035)).max(1.0 - v.sstep(0.0, 0.03)).max(u.sstep(0.965, 1.0))
    shade = 1.0 - seam * 0.08 - edge * 0.12
    base = mulc(nt, at.outputs['Color'], shade)
    col = mixc(nt, alpha, base, im.outputs['Color'])
    link(nt, col, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.85
    p.inputs['Specular IOR Level'].default_value = 0.2
    tr = node(nt, 'ShaderNodeBsdfTranslucent'); link(nt, col, tr.inputs['Color'])
    mx = node(nt, 'ShaderNodeMixShader'); mx.inputs['Fac'].default_value = 0.25
    out = nt.nodes['Material Output']
    nt.links.new(p.outputs[0], mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    m.use_backface_culling = False
    return m


def pv_cover():
    m = ncm.new_mat('PV_cover'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    at = node(nt, 'ShaderNodeAttribute', attribute_name='Col')
    oi = node(nt, 'ShaderNodeObjectInfo')
    mm = node(nt, 'ShaderNodeMix'); mm.data_type = 'RGBA'; mm.blend_type = 'MULTIPLY'
    sock(mm, 'Factor_Float').default_value = 1.0
    nt.links.new(at.outputs['Color'], sock(mm, 'A_Color')); nt.links.new(oi.outputs['Color'], sock(mm, 'B_Color'))
    nt.links.new(sock(mm, 'Result_Color', out=True), p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.7
    return m


PV = {'hb_opaque': pv_opaque(), 'hb_sail': pv_sail(), 'hb_cover': pv_cover()}


def dress(root, vid=None, brand=None):
    """Assign preview materials by contract name; per-instance brand + emblem as object colour/prop."""
    brand = brand or BRAND.get(vid, PAL['brand_default'])
    for o in descendants(root):
        if o.type != 'MESH':
            continue
        nm = o.data.materials[0].name if o.data.materials else ''
        if nm in PV:
            o.data.materials[0] = PV[nm]
        elif nm == 'M_kit':
            pass
        o.color = (*brand, 1.0)
        o['emblem'] = float(SLOT.get(vid, 0))


MIRROR = ('boom', 'boom_2', 'yards', 'sail_extra', 'sail_jib')


def pose(root, furl, swing=0.0, heel=0.0, tack=1):
    """Runtime pose. tack=1: wind from starboard (as modelled); tack=-1: port tack = mirror the swinging/braced
    nodes about the centreline (scale y=-1 here, scale.z=-1 in glTF) and swing/heel the other way."""
    square = any(o.name.split('.')[0] == 'yards' for o in descendants(root))
    for o in descendants(root):
        if o.type == 'MESH' and o.data.shape_keys:
            o.data.shape_keys.key_blocks['furl'].value = furl
        base = o.name.split('.')[0]
        mir = base in MIRROR or (square and base == 'sail_main')
        if mir:
            o.scale.y = 1 if tack > 0 else -1
        if base in ('boom', 'boom_2'):
            o.rotation_euler.z = -swing * tack
        if base == 'sail_jib':
            ax = o['stay_axis']
            o.rotation_mode = 'AXIS_ANGLE'
            o.rotation_axis_angle = (-0.6 * swing * tack, ax[0], -ax[2], ax[1])
        if base == '_heel':
            o.rotation_euler.x = -heel * tack
    # preview of the shader rule: an object is mirrored if its world matrix has det < 0
    bpy.context.view_layer.update()
    for o in descendants(root):
        if o.type == 'MESH':
            o['mirror'] = 1.0 if o.matrix_world.determinant() < 0 else 0.0


# ------------------------------------------------------------------ sea (style C maths, own distance field)
FOOT, WAKES, PILES = [], [], []


def footprint(R, M_):
    H = R.H
    pts = []
    for i in range(25):
        u = -1 + 2 * i / 24
        pts.append((H.x(u, 0.0), H.w(u) * 0.93))
    poly = [M_ @ Vector((x, y, 0)) for x, y in pts] + [M_ @ Vector((x, -y, 0)) for x, y in reversed(pts)]
    FOOT.append([(p.x, p.y) for p in poly])


def build_sdf(bounds, N=1536):
    from PIL import Image, ImageDraw
    from scipy import ndimage
    x0, y0, x1, y1 = bounds
    px = max(x1 - x0, y1 - y0) / N

    def P(p):
        return ((p[0] - x0) / px, (y1 - p[1]) / px)
    im = Image.new('L', (N, N), 0); d = ImageDraw.Draw(im)
    for poly in FOOT:
        d.polygon([P(p) for p in poly], fill=255)
    for (x, y, r) in PILES:
        cx, cy = P((x, y)); rr = r / px
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=255)
    A = np.array(im) > 127
    dist = ndimage.distance_transform_edt(~A) * px
    xs = x0 + (np.arange(N) + 0.5) * px; ys = y1 - (np.arange(N) + 0.5) * px
    X, Y = np.meshgrid(xs, ys)
    G = np.zeros((N, N), np.float32)
    for (a, b, w0, w1, k) in WAKES:
        a = np.array(a, np.float32); b = np.array(b, np.float32); ab = b - a
        t = np.clip(((X - a[0]) * ab[0] + (Y - a[1]) * ab[1]) / (ab @ ab), 0, 1)
        # Kelvin-ish: two arms diverging + a centre trail
        dd = np.hypot(X - (a[0] + t * ab[0]), Y - (a[1] + t * ab[1]))
        w = w0 + (w1 - w0) * t
        arms = np.exp(-((dd - w * 0.8) / (0.18 * w + 0.15)) ** 2)
        G = np.maximum(G, k * (np.exp(-(dd / (0.45 * w)) ** 2) * 0.8 + arms * 0.9) * (1 - t) ** 1.4)
    img = np.zeros((N, N, 4), np.float32)
    img[..., 0] = np.clip(dist / 20.0, 0, 1); img[..., 1] = G; img[..., 3] = 1
    b = bpy.data.images.new('sea_sdf', N, N, float_buffer=True, alpha=True)
    b.pixels.foreach_set(img[::-1].ravel())
    b.filepath_raw = os.path.join(SCRATCH, f'sea-sdf-{MODE}.exr'); b.file_format = 'OPEN_EXR'; b.save()
    b.colorspace_settings.name = 'Non-Color'
    return b, (x0, y1 - N * px, x0 + N * px, y1)


def build_sea(sdf, b):
    m = ncm.new_mat('M_sea'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    geo = node(nt, 'ShaderNodeNewGeometry'); W = geo.outputs['Position']
    wx, wy, _ = sep(nt, W)
    uvx = (wx - b[0]) / (b[2] - b[0]); uvy = (wy - b[1]) / (b[3] - b[1])
    im = node(nt, 'ShaderNodeTexImage', interpolation='Cubic', extension='EXTEND'); im.image = sdf
    link(nt, comb(nt, uvx, uvy, 0.0), im.inputs['Vector'])
    sc = node(nt, 'ShaderNodeSeparateColor'); link(nt, im.outputs['Color'], sc.inputs[0])
    dh = SX(nt, sc.outputs['Red']) * 20.0
    wake = SX(nt, sc.outputs['Green'])
    n1 = noise3(nt, vscale(nt, W, 0.05), 1.0, 2.0)
    n2 = noise3(nt, vscale(nt, W, 0.45), 1.0, 1.0)
    n3 = noise3(nt, vscale(nt, W, 1.1), 1.0, 1.0)
    deep = rgb(nt, PAL_SEA['deep']); mid = rgb(nt, PAL_SEA['mid'])
    sea = mixc(nt, n1.sstep(0.35, 0.7), deep, mid)
    # contact foam ring (crisp) + broken second ring + wakes
    f_hull = (1.0 - (dh + (n3 - 0.5) * 0.35).sstep(0.12, 0.38)) * 0.92
    ring2 = (1.0 - ((dh - 1.1).abs()).sstep(0.12, 0.3)) * n2.sstep(0.48, 0.6) * 0.5
    f_wake = (wake * 1.15 - (1.0 - n3) * 0.6 - (1.0 - n2) * 0.25).sstep(0.08, 0.26) * wake.sstep(0.04, 0.16)
    foam = f_hull.max(ring2).max(f_wake)
    fc = rgb(nt, lin('#FFF6EA'))
    link(nt, mixc(nt, foam, mulc(nt, sea, 0.18), fc), p.inputs['Base Color'])
    emis = addc(nt, mulc(nt, sea, (1.0 - foam) * C(nt, 0.85, 'SEA_E')), mulc(nt, fc, foam * 0.45))
    link(nt, emis, p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = 1.0
    link(nt, foam.lmap(0, 1, 0.05, 0.85), p.inputs['Roughness'])
    p.inputs['Specular IOR Level'].default_value = 1.0; p.inputs['IOR'].default_value = 1.33
    mp = node(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.35, 1.0, 1.0)
    mp.inputs['Rotation'].default_value = (0, 0, math.radians(40)); link(nt, W, mp.inputs['Vector'])
    r1 = noise3(nt, mp.outputs['Vector'], 0.55, 3.0, 0.55); r2 = noise3(nt, W, 2.2, 2.0)
    bump = node(nt, 'ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.32; bump.inputs['Distance'].default_value = 0.12
    link(nt, (r1 * 0.8 + r2 * 0.25) * (1.0 - foam * 0.6), bump.inputs['Height'])
    link(nt, bump.outputs['Normal'], p.inputs['Normal'])
    return m


PAL_SEA = dict(deep=lin('#143F55'), mid=lin('#194C5E'))

# ------------------------------------------------------------------ light + camera + grade (style C golden)
def add_light(name, kind, **kw):
    ld = bpy.data.lights.new(name, kind); ob = bpy.data.objects.new(name, ld); scene.collection.objects.link(ob)
    for k, v in kw.items():
        setattr(ld, k, v)
    return ob


def aim(ob, az, el):
    az, el = math.radians(az), math.radians(el)
    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    ob.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


def setup_world(sun_az=330.0, sun_el=13.0):
    sun = add_light('sun', 'SUN', angle=math.radians(0.8), energy=5.2, color=lin('#FFB070'))
    aim(sun, sun_az, sun_el)
    fill = add_light('fill', 'SUN', angle=math.radians(10), energy=0.35, color=lin('#7F98D6'))
    fill.data.use_shadow = False
    fill.data.specular_factor = 0.0
    aim(fill, sun_az + 180, 35)
    wt = bpy.data.worlds.new('W'); scene.world = wt
    try:
        wt.use_nodes = True
    except Exception:
        pass
    wnt = wt.node_tree; bg = wnt.nodes['Background']
    tc = node(wnt, 'ShaderNodeTexCoord'); _, _, wz = sep(wnt, tc.outputs['Generated'])
    ramp = node(wnt, 'ShaderNodeValToRGB'); link(wnt, wz.lmap(-0.1, 0.9, 0, 1), ramp.inputs['Fac'])
    ncm.set_ramp(ramp, [(0, lin('#C9A89A')), (0.3, lin('#8C9AC0')), (1, lin('#5470A6'))])
    link(wnt, ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.62
    scene.render.engine = 'BLENDER_EEVEE'
    ee = scene.eevee
    ee.taa_render_samples = SAMPLES; ee.use_raytracing = True; ee.ray_tracing_method = 'SCREEN'
    ee.use_shadows = True; ee.shadow_ray_count = 2; ee.shadow_step_count = 10; ee.use_fast_gi = True; ee.fast_gi_distance = 8.0
    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    scene.view_settings.exposure = 0.3
    cng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree'); scene.compositing_node_group = cng
    cng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = cng.nodes.new('CompositorNodeRLayers')
    gl = cng.nodes.new('CompositorNodeGlare'); gl.inputs['Type'].default_value = 'Bloom'
    gl.inputs['Strength'].default_value = 0.2; gl.inputs['Threshold'].default_value = 1.3
    hs = cng.nodes.new('CompositorNodeHueSat'); hs.inputs['Saturation'].default_value = 1.1
    go = cng.nodes.new('NodeGroupOutput')
    cng.links.new(rl.outputs['Image'], gl.inputs['Image']); cng.links.new(gl.outputs['Image'], hs.inputs['Image'])
    cng.links.new(hs.outputs['Image'], go.inputs[0])
    scene.render.use_compositing = True
    return sun


def camera(pitch=35.0, yaw=0.0, fov=25.0):
    cd = bpy.data.cameras.new('cam'); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(fov); cd.clip_start = 1; cd.clip_end = 4000
    co = bpy.data.objects.new('cam', cd); scene.collection.objects.link(co); scene.camera = co
    co.rotation_euler = (math.radians(90 - pitch), 0, math.radians(yaw))
    return co


def fit(cam, pts, margin=0.06, iters=8):
    fwd = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    c = sum(pts, Vector()) / len(pts)
    dist = 200.0
    for _ in range(iters):
        cam.location = c - fwd * dist
        bpy.context.view_layer.update()
        q = [world_to_camera_view(scene, cam, p) for p in pts]
        xs = [p.x for p in q]; ys = [p.y for p in q]
        w = max(xs) - min(xs); h = max(ys) - min(ys)
        k = max(w / (1 - 2 * margin), h / (1 - 2 * margin))
        mx = (max(xs) + min(xs)) / 2 - 0.5; my = (max(ys) + min(ys)) / 2 - 0.5
        aspect = scene.render.resolution_x / scene.render.resolution_y
        right = cam.rotation_euler.to_matrix() @ Vector((1, 0, 0)); up = cam.rotation_euler.to_matrix() @ Vector((0, 1, 0))
        half_h = math.tan(cam.data.angle_y / 2) * dist
        c = c + right * mx * 2 * half_h * aspect + up * my * 2 * half_h
        dist *= k
    cam.location = c - fwd * dist


def bbox_pts(root):
    pts = []
    for o in descendants(root):
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(b) for b in o.bound_box]
    return pts


def sea_plane(b, z=0.0):
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
    for v in bm.verts:
        v.co.x = b[0] + (v.co.x + 1) / 2 * (b[2] - b[0]); v.co.y = b[1] + (v.co.y + 1) / 2 * (b[3] - b[1]); v.co.z = z
    me = bpy.data.meshes.new('sea'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('sea', me); scene.collection.objects.link(ob)
    return ob


def place(vid, fam, rig, cls, sch, pos, heading_deg, furl, swing=0.0, heel=0.0, wake=False, seed=0, tack=1):
    n_sec = hb_hulls.SECTIONS[cls]
    while True:   # same budget guard as export.py
        root, objs, R = build_boat(vid, fam, rig, cls, sch, seed=seed, n_sec=n_sec)
        if tri_count(descendants(root)) <= hb_hulls.BUDGET[cls] or n_sec <= 5:
            break
        for o in descendants(root):
            bpy.data.objects.remove(o, do_unlink=True)
        n_sec -= 1
    root.location = pos; root.rotation_euler = (0, 0, math.radians(heading_deg))
    dress(root, vid)
    pose(root, furl, swing, heel, tack)
    bpy.context.view_layer.update()
    footprint(R, root.matrix_world)
    if wake:
        d = Vector((math.cos(math.radians(heading_deg)), math.sin(math.radians(heading_deg)), 0))
        a = Vector(pos) + d * (R.H.stern().x + 0.3)
        WAKES.append(((a.x, a.y), (a.x - d.x * R.L * 2.0, a.y - d.y * R.L * 2.0), 0.3 * R.H.B, 1.2 * R.H.B + 0.08 * R.L, 0.7))
        # bow wave
        bwp = Vector(pos) + d * (R.H.bow().x - 0.1)
        WAKES.append(((bwp.x, bwp.y), (bwp.x - d.x * R.L * 0.6, bwp.y - d.y * R.L * 0.6), 0.2 * R.H.B, 0.6 * R.H.B, 0.55))
    return root, R


def render(path):
    scene.render.resolution_percentage = PCT
    scene.render.filepath = path
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)


def label(path, items, title=None):
    from PIL import Image, ImageDraw, ImageFont
    im = Image.open(path).convert('RGB'); d = ImageDraw.Draw(im, 'RGBA')
    W, Hh = im.size
    f = ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-Regular.ttf', max(12, int(W * 0.0085)))
    fb = ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-Bold.ttf', max(13, int(W * 0.0095)))
    for (p, l1, l2) in items:
        q = world_to_camera_view(scene, scene.camera, p)
        x, y = q.x * W, (1 - q.y) * Hh
        for t, ff, dy in ((l1, fb, 0), (l2, f, int(W * 0.011))):
            tw = d.textlength(t, font=ff)
            d.text((x - tw / 2 + 1, y + dy + 1), t, font=ff, fill=(10, 20, 30, 160))
            d.text((x - tw / 2, y + dy), t, font=ff, fill=(246, 238, 222, 255))
    if title:
        tf = ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-Bold.ttf', max(16, int(W * 0.014)))
        d.text((int(W * 0.02) + 1, int(Hh * 0.025) + 1), title, font=tf, fill=(10, 20, 30, 180))
        d.text((int(W * 0.02), int(Hh * 0.025)), title, font=tf, fill=(250, 240, 220, 255))
    im.save(path)


# ================================================================== scenes
V = {v[0]: v for v in VARIANTS}
ROWS = [
    ['usd_cat_skiff', 'usd_sloop_boat', 'usd_sloop_small', 'usd_cutter_medium', 'usd_schooner_large', 'usd_ship_flagship'],
    ['eur_botter_boat', 'eur_botter_small', 'eur_botter_medium', 'eur_botter_large', 'gold_brig_medium', 'gold_brig_large'],
    ['other_work_skiff', 'other_work_boat', 'other_work_small', 'fiat_lugger_boat', 'fiat_lugger_small', 'fiat_lugger_medium'],
]

if MODE in ('docked', 'sailing', 'game'):
    scene.render.resolution_x, scene.render.resolution_y = (2200, 1300) if MODE != 'game' else (1600, 1000)
    sail = MODE == 'sailing'
    labels = []
    roots = []
    row_y = [62.0, 30.0, 0.0]
    for r, row in enumerate(ROWS):
        x = 0.0
        for k, vid in enumerate(row):
            _, fam, rig, cls, sch = V[vid]
            L = CLASS_LOA[cls]
            x += max(L, 11.0) / 2
            pos = (x, row_y[r], 0.0)
            hd = -24.0
            sail = MODE == 'sailing' or (MODE == 'game' and r != 1)
            root, R = place(vid, fam, rig, cls, sch, pos, hd, 0.0 if sail else 1.0,
                            swing=0.45 if sail else 0.0, heel=math.radians(11) if sail else 0.0, wake=sail, seed=k,
                            tack=-1 if sail else 1)
            roots.append(root)
            labels.append((Vector((x, row_y[r] - 3.0 - 0.3 * L, 0)), vid.split('_')[0] + ' ' + rig + ' · ' + cls,
                           f'{L:g} m · {tri_count(descendants(root))} tris · {COINS[vid][1]}'))
            x += max(L, 11.0) / 2 + 5.0
    pts = sum((bbox_pts(r) for r in roots), [])
    b = (min(p.x for p in pts) - 60, min(p.y for p in pts) - 60, max(p.x for p in pts) + 60, max(p.y for p in pts) + 80)
    sdf, sb = build_sdf(b)
    sea = sea_plane(b); sea.data.materials.append(build_sea(sdf, sb))
    setup_world()
    cam = camera(35.0, 0.0)
    if MODE == 'game':
        # true harbour-zoom scale: P1 harbour camera distance (165 m) at 1600x1000
        c = sum(pts, Vector()) / len(pts)
        cam.location = c - (cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))) * 165.0
    else:
        fit(cam, pts + [p + Vector((0, -10, 0)) for p in pts if p.z < 1], margin=0.03)
    path = os.path.join(OUT, f'lineup-{MODE}.png')
    render(path)
    if MODE != 'game':
        label(path, labels, 'The Harbour fleet · ' + ('docked: furl 1, brand covers' if not sail else 'sailing, port tack: furl 0, swing 0.45, heel 11°, mirrored rig'))

if MODE == 'lod':
    scene.render.resolution_x, scene.render.resolution_y = 2200, 1300
    roots = []
    row_y = [62.0, 30.0, 0.0]
    for r, row in enumerate(ROWS):
        x = 0.0
        for k, vid in enumerate(row):
            _, fam, rig, cls, sch = V[vid]
            L = CLASS_LOA[cls]; x += L / 2
            root, ob, t = build_lod(vid, fam, rig, cls, sch)
            root.location = (x, row_y[r], 0); root.rotation_euler = (0, 0, math.radians(-24))
            dress(root, vid)
            ob.data.shape_keys.key_blocks['furl'].value = 1.0 if (k % 2) else 0.0
            if not (k % 2):          # sailing LODs on port tack: mirror the whole LOD (hull is symmetric)
                root.scale.y = -1
            roots.append(root); x += L / 2 + 6.0
    bpy.context.view_layer.update()
    pts = sum((bbox_pts(r) for r in roots), [])
    b = (min(p.x for p in pts) - 60, min(p.y for p in pts) - 60, max(p.x for p in pts) + 60, max(p.y for p in pts) + 80)
    sdf, sb = build_sdf(b)
    sea = sea_plane(b); sea.data.materials.append(build_sea(sdf, sb))
    setup_world(); cam = camera(35.0, 0.0); fit(cam, pts, 0.03)
    render(os.path.join(OUT, 'lineup-lod.png'))

if MODE == 'vignette':
    scene.render.resolution_x, scene.render.resolution_y = 1800, 1100
    # a stone quay along y = 22 and a finger pier running out along -y, boats alongside both sides
    QZ = 1.6
    ncm.set_coll(scene.collection)
    pier = nk.build_pier('pier', [(-1.0, -30.0, 1.0, 20.0)], 1.2, pile_step=3.4)
    for yy in (-28.0, -14.0, 0.0, 14.0):
        nk.lamp_post(f'lamp_{yy}', (0.0, yy, 1.2), 3.0)
    for yy in range(-28, 20, 3):
        PILES.append((0.9, yy + 0.3, 0.25)); PILES.append((-0.9, yy + 0.3, 0.25))
    qb = ncm.bm_box2(-60, 20.0, -4.0, 60, 23.0, QZ)
    ncm.obj('quay_wall', qb, PAL['timber_grey'] if False else lin('#7A756C'), ncm.PATTERN['ashlar'])
    ncm.obj('quay_top', ncm.bm_box2(-60, 23.0, QZ - 0.2, 60, 40.0, QZ + 0.05), lin('#8F8A82'), ncm.PATTERN['cobble'])
    FOOT.append([(-60, 20.0), (60, 20.0), (60, 40.0), (-60, 40.0)])
    bl = bmesh.new()
    for xx in range(-50, 55, 9):
        nk.bollard(bl, (xx, 21.0, QZ))
    for yy in (-26, -18, -10, -2, 6, 14):
        nk.bollard(bl, (1.3, yy, 1.2)); nk.bollard(bl, (-1.3, yy, 1.2))
    ncm.obj('bollards', bl, lin('#1F2327'), ncm.PATTERN['metal'])
    # crates + barrels on the quay for scale
    cb = bmesh.new()
    for (xx, yy) in ((-8, 26), (-6.8, 25.6), (9, 27)):
        nk.crate(cb, (xx, yy, QZ), 1.0, random.uniform(-0.3, 0.3))
    ncm.obj('crates', cb, lin('#A57B52'), ncm.PATTERN['boards'], jitter=0.12)
    lines = []

    def moor_lines(root, R, pier_side_y=None, to_pts=()):
        bpy.context.view_layer.update()
        for nm, tgt in to_pts:
            e = [o for o in descendants(root) if o.name.split('.')[0] == nm][0]
            a = e.matrix_world.translation
            b_ = Vector(tgt)
            bm = bmesh.new()
            pts_ = [a.lerp(b_, t) - Vector((0, 0, 0.35 * 4 * t * (1 - t))) for t in (0, 0.25, 0.5, 0.75, 1)]
            for p0, p1 in zip(pts_, pts_[1:]):
                ncm.merge(bm, ncm.bm_rod(p0, p1, 0.035, 4))
            ncm.obj('line', bm, lin('#CDBB92'), 0)
    # alongside the pier (bows toward the quay): east side
    cat = place('usd_schooner_large', *V['usd_schooner_large'][1:], (5.4, -12.0, 0), 90.0, 1.0)
    moor_lines(*cat, to_pts=[('bow_cleat', (1.3, -2.0, 1.75)), ('stern_cleat', (1.3, -26.0, 1.75))])
    b2 = place('usd_sloop_small', *V['usd_sloop_small'][1:], (4.2, 10.0, 0), 90.0, 1.0, seed=2)
    moor_lines(*b2, to_pts=[('bow_cleat', (1.3, 14.0, 1.75)), ('stern_cleat', (1.3, 6.0, 1.75))])
    # west side
    b3 = place('eur_botter_medium', *V['eur_botter_medium'][1:], (-5.6, -14.0, 0), 90.0, 1.0, seed=3)
    moor_lines(*b3, to_pts=[('bow_cleat', (-1.3, -10.0, 1.75)), ('stern_cleat', (-1.3, -18.0, 1.75))])
    b4 = place('usd_cutter_medium', *V['usd_cutter_medium'][1:], (-4.9, 6.0, 0), 90.0, 1.0, seed=4)
    moor_lines(*b4, to_pts=[('bow_cleat', (-1.3, 14.0, 1.75)), ('stern_cleat', (-1.3, -2.0, 1.75))])
    # against the quay wall, the flagship
    b5 = place('usd_ship_flagship', *V['usd_ship_flagship'][1:], (-24.0, 15.6, 0), 0.0, 1.0, seed=5)
    moor_lines(*b5, to_pts=[('bow_cleat', (-4.0, 21.0, QZ + 0.5)), ('stern_cleat', (-44.0, 21.0, QZ + 0.5))])
    # swinging moorings: skiffs/boats bows into the wind (wind from -x, +y)
    buoys = []
    for k, (vid, xy) in enumerate((('usd_cat_skiff', (22.0, -6.0)), ('other_work_boat', (30.0, 6.0)), ('fiat_lugger_boat', (36.0, -10.0)),
                                    ('usd_sloop_boat', (20.0, -22.0)), ('other_work_skiff', (-22.0, -4.0)))):
        hd = 150.0 + random.uniform(-8, 8)
        d = Vector((math.cos(math.radians(hd)), math.sin(math.radians(hd)), 0))
        bpos = Vector((*xy, 0)) + d * (CLASS_LOA[V[vid][3]] / 2 + 3.0)
        bro, _ = build_buoy(); bro.location = bpos; dress(bro, None, PAL['flag_red'])
        PILES.append((bpos.x, bpos.y, 0.55))
        r_, R_ = place(vid, *V[vid][1:], (*xy, 0), hd, 1.0, seed=10 + k)
        moor_lines(r_, R_, to_pts=[('bow_cleat', bpos + Vector((0, 0, 0.9)))])
    # style C houses on the quay (P1 kit GLBs), for scale and charm
    hv = ['house_a_falu_gable', 'house_c_white_render', 'house_b_ochre_slate_tall', 'house_d_blue_tar', 'house_f_warehouse',
          'house_c_white_render', 'house_a_falu_gable', 'house_e_turf_cottage']
    hx = -52.0
    for k, hn in enumerate(hv):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(STYLE_C, 'glb', hn + '.glb'))
        new = [o for o in bpy.data.objects if o not in before]
        w = 13.0 if 'warehouse' in hn else 9.0
        for o in new:
            if o.parent is None:
                o.location = (hx + w / 2, 33.0, QZ); o.rotation_euler = (0, 0, 0)
            if o.type == 'MESH':
                if o.data.color_attributes:
                    o.data.color_attributes[0].name = 'Col'
                for i, m in enumerate(o.data.materials):
                    if m and m.name.startswith('M_kit'):
                        o.data.materials[i] = ncm.M['kit']
        hx += w + 1.5
    # a dinghy at the pier stairs
    dg, _ = build_dinghy(); dg.location = (2.6, 17.0, 0); dg.rotation_euler = (0, 0, math.radians(80)); dress(dg, None, BRAND['usd_sloop_small'])
    FOOT.append([(2.6 + x, 17 + y) for x, y in ((-0.6, -1.7), (0.6, -1.7), (0.6, 1.7), (-0.6, 1.7))])
    # boats under way: entering and leaving
    place('gold_brig_large', *V['gold_brig_large'][1:], (26.0, -30.0, 0), 128.0, 0.35, swing=0.2, heel=math.radians(4), wake=True, tack=-1)
    place('fiat_lugger_medium', *V['fiat_lugger_medium'][1:], (-34.0, -26.0, 0), 18.0, 0.0, swing=0.55, heel=math.radians(12), wake=True)
    place('eur_botter_small', *V['eur_botter_small'][1:], (-8.0, -44.0, 0), -12.0, 0.0, swing=0.35, heel=math.radians(9), wake=True, tack=-1)
    bpy.context.view_layer.update()
    b = (-120, -120, 120, 90)
    sdf, sb = build_sdf(b, 2048)
    sea = sea_plane((-500, -500, 500, 500)); sea.data.materials.append(build_sea(sdf, sb))
    for o in scene.objects:
        if o.type == 'MESH' and o.data.materials and o.data.materials[0].name in ('M_kit',):
            pass
    setup_world(sun_az=320.0, sun_el=12.0)
    cam = camera(35.0, 18.0)
    tgt = Vector((-1.0, -9.0, 4.0))
    fwd = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    cam.location = tgt - fwd * 150.0
    render(os.path.join(OUT, 'vignette-harbour.png'))
if MODE == 'props':
    scene.render.resolution_x, scene.render.resolution_y = 1800, 1000
    # a shingle beach for Wreck Cove: sloping plane rising out of the sea toward +y
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
    for v in bm.verts:
        v.co.x *= 90; v.co.y = 14 + v.co.y * 16; v.co.z = (v.co.y - 6) * 0.16
    me = bpy.data.meshes.new('beach'); bm.to_mesh(me); bm.free()
    beach = bpy.data.objects.new('beach', me); scene.collection.objects.link(beach)
    mt = ncm.new_mat('M_sand'); mt.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*lin('#B9B09C'), 1)
    beach.data.materials.append(mt)
    FOOT.append([(-90, 6), (90, 6), (90, 40), (-90, 40)])
    roots = []
    for k, (kind, pos, rz) in enumerate((('a', (-30, 8.5, 0.6), 20), ('b', (0, -4, 0), -15), ('c', (26, 4, 0.2), 35))):
        r, t = build_wreck(kind); r.location = pos; r.rotation_euler = (0, 0, math.radians(rz)); dress(r); roots.append(r)
    for k, p in enumerate(((12, -22), (20, -18), (28, -24))):
        r, _ = build_buoy(); r.location = (*p, 0); dress(r, None, PAL['flag_red']); roots.append(r); PILES.append((*p, 0.6))
    r, _ = build_dinghy(); r.location = (-8, -20, 0); r.rotation_euler = (0, 0, 0.6); dress(r, None, BRAND['usd_cutter_medium']); roots.append(r)
    FOOT.append([(-8 + x * math.cos(0.6) - y * math.sin(0.6), -20 + x * math.sin(0.6) + y * math.cos(0.6)) for x, y in ((-1.6, -0.55), (1.6, -0.55), (1.6, 0.55), (-1.6, 0.55))])
    bpy.context.view_layer.update()
    sdf, sb = build_sdf((-100, -60, 100, 60))
    sea = sea_plane((-500, -500, 500, 500)); sea.data.materials.append(build_sea(sdf, sb))
    setup_world(); cam = camera(35.0, 0.0)
    pts = sum((bbox_pts(r) for r in roots), [])
    fit(cam, pts, 0.08)
    render(os.path.join(OUT, 'props-wrecks-buoy-dinghy.png'))
print('DONE', MODE)
