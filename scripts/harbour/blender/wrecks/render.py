"""Wreck Cove kit v2 - lookdev renders: wreck lineup, prop lineup, mock cove composition.

    blender -b --factory-startup -P scripts/harbour/blender/wrecks/render.py -- --mode wrecks|props|cove|hero
        [--time golden|dusk|night] [--samples 32] [--pct 100] [--out DIR]

Everything is built in-scene by the same builders the export uses, shaded with the style C kit material
(pattern shader + per-corner weathering colours), lanterns on hb_emissive, windows on hb_window.
"""
import sys, os, math, random
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
STYLE_C = os.path.join(ROOT, 'agents', '2026-10-13-pharosville-reboot', 'p1', 'style-c')
sys.path.insert(0, HERE)
sys.path.insert(1, STYLE_C)
for p in ('/home/ahirice/.local/lib/python3.14/site-packages',):
    if p not in sys.path:
        sys.path.append(p)
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
import nl_common as ncm
import wk_lib
from wk_lib import PAL, lin, descendants, tri_count, reset_scene, fbm, vnoise, mix, smoothstep
import wk_wrecks, wk_props

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(n, d):
    return ARGV[ARGV.index(n) + 1] if n in ARGV else d


MODE = arg('--mode', 'wrecks')
TIME = arg('--time', 'golden')
SAMPLES = int(arg('--samples', '32'))
PCT = int(arg('--pct', '100'))
OUT = arg('--out', os.path.join(ROOT, 'agents', '2026-10-13-pharosville-reboot', 'p6', 'wrecks'))
SCRATCH = os.path.join(ROOT, 'outputs', 'harbour', 'wrecks')
os.makedirs(OUT, exist_ok=True); os.makedirs(SCRATCH, exist_ok=True)
reset_scene()
wk_lib.ensure_materials()
scene = bpy.context.scene
SX, C, sep, comb, node, link, rgb, mixc, mulc, addc, noise3, vscale = (ncm.SX, ncm.C, ncm.sep, ncm.comb, ncm.node, ncm.link,
                                                                     ncm.rgb, ncm.mixc, ncm.mulc, ncm.addc, ncm.noise3, ncm.vscale)
ncm.build_kit_material()
NIGHT = TIME == 'night'
DUSK = TIME == 'dusk'
LAMP_K = 14.0 if NIGHT else (6.0 if DUSK else 0.6)

NAMES = [('TerraUSD', 'UST · 2020 - 2022'), ('Iron', 'IRON · 2021'), ('Basis Cash', 'BAC · 2020 - 2021'), ('Empty Set Dollar', 'ESD · 2020 - 2021'),
         ('Fei USD', 'FEI · 2021 - 2022'), ('Neutrino USD', 'USDN · 2019 - 2023'), ('HUSD', '2019 - 2022'), ('Beanstalk', 'BEAN · 2021 - 2022'),
         ('Dynamic Set', 'DSD · 2020 - 2021'), ('Mithril Cash', 'MIC · 2021'), ('Titan', 'TITAN · 2021'), ('USDK', '2019 - 2021'),
         ('Basis', '2018'), ('NuBits', 'USNBT · 2014 - 2018'), ('Steem Dollars', 'SBD · 2016 - 2020'), ('bitUSD', '2014 - 2019'),
         ('Carbon', '2018'), ('Havven nUSD', '2018 - 2019'), ('Ampleforth?', 'never quite'), ('Seigniorage', '2017 - 2018')]
_name_i = [0]


# ------------------------------------------------------------------ preview materials
def emissive_mat():
    m = ncm.new_mat('PV_emissive'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*lin('#F2C47A'), 1)
    p.inputs['Emission Color'].default_value = (*lin('#FFB45A'), 1)
    p.inputs['Emission Strength'].default_value = LAMP_K
    return m


def window_mat():
    m = ncm.new_mat('PV_window'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    at = node(nt, 'ShaderNodeAttribute', attribute_name='Col')
    r, g, _ = sep(nt, at.outputs['Color'])
    lit = r
    warm = rgb(nt, lin('#FFB868'))
    link(nt, rgb(nt, lin('#1F2A33')), p.inputs['Base Color'])
    link(nt, warm, p.inputs['Emission Color'])
    link(nt, lit * (LAMP_K * 0.5), p.inputs['Emission Strength'])
    p.inputs['Roughness'].default_value = 0.2
    return m


EMIS, WIN = emissive_mat(), window_mat()


def board_image(name, sub):
    from PIL import Image, ImageDraw, ImageFont
    W, H = 704, 218
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f = ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-Bold.ttf', 84 if len(name) < 12 else 64)
    fs = ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-Italic.ttf', 40)
    tw = d.textlength(name, font=f)
    d.text(((W - tw) / 2, 22), name, font=f, fill=(46, 34, 26, 235))
    tw = d.textlength(sub, font=fs)
    d.text(((W - tw) / 2, 140), sub, font=fs, fill=(70, 52, 38, 210))
    path = os.path.join(SCRATCH, f'board_{_name_i[0]}.png')
    im.save(path)
    img = bpy.data.images.load(path, check_existing=False); img.alpha_mode = 'STRAIGHT'
    return img


def epitaph_mat():
    name, sub = NAMES[_name_i[0] % len(NAMES)]
    img = board_image(name, sub)
    _name_i[0] += 1
    m = ncm.M['kit'].copy(); m.name = 'PV_epitaph'
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    lk = [l for l in nt.links if l.to_socket == p.inputs['Base Color']][0]
    src = lk.from_socket; nt.links.remove(lk)
    uv = node(nt, 'ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    im = node(nt, 'ShaderNodeTexImage', interpolation='Linear', extension='CLIP'); im.image = img
    link(nt, uv.outputs['UV'], im.inputs['Vector'])
    res = mixc(nt, SX(nt, im.outputs['Alpha']), src, im.outputs['Color'])
    nt.links.new(res, p.inputs['Base Color'])
    return m


def dress(root):
    for o in descendants(root):
        if o.type != 'MESH' or not o.data.materials:
            continue
        nm = o.data.materials[0].name
        if o.name.split('.')[0] == 'epitaph':
            o.data.materials[0] = epitaph_mat()
        elif nm == 'hb_opaque':
            o.data.materials[0] = ncm.M['kit']
        elif nm == 'hb_emissive':
            o.data.materials[0] = EMIS
        elif nm == 'hb_window':
            o.data.materials[0] = WIN


LIGHTS = []


def lamps(root, names=('epitaph_light', 'lamp_light'), k=1.0):
    if LAMP_K < 2:
        return
    bpy.context.view_layer.update()
    for o in descendants(root):
        if o.name.split('.')[0] in names:
            ld = bpy.data.lights.new('lamp', 'POINT'); ld.energy = (60.0 if NIGHT else 25.0) * k; ld.color = lin('#FFB360'); ld.shadow_soft_size = 0.08
            ob = bpy.data.objects.new('lamp', ld); scene.collection.objects.link(ob)
            ob.location = o.matrix_world.translation
            LIGHTS.append(ob)


def place(builder, pos, heading_deg, scale=1.0, epitaph=True, lit=True, z=None):
    root, info = builder()
    root.location = (pos[0], pos[1], pos[2] if z is None else z)
    root.rotation_euler = (0, 0, math.radians(heading_deg)); root.scale = (scale,) * 3
    for o in descendants(root):
        if o.name.split('.')[0] == 'epitaph' and scale < 2.0 and MODE in ('cove', 'hero'):
            o.scale = (2.2 / scale,) * 3
    if not epitaph:
        for o in list(descendants(root)):
            if o.name.split('.')[0].startswith('epitaph'):
                bpy.data.objects.remove(o, do_unlink=True)
    dress(root)
    if lit:
        lamps(root)
    return root, info


# ------------------------------------------------------------------ world / light / camera
def add_light(name, kind, **kw):
    ld = bpy.data.lights.new(name, kind); ob = bpy.data.objects.new(name, ld); scene.collection.objects.link(ob)
    for k, v in kw.items():
        setattr(ld, k, v)
    return ob


def aim(ob, az, el):
    az, el = math.radians(az), math.radians(el)
    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    ob.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


def setup_world(sun_az=330.0):
    if NIGHT:
        sun = add_light('moon', 'SUN', angle=math.radians(1.5), energy=0.55, color=lin('#9DB4E8')); aim(sun, sun_az + 40, 34)
        sky = [(0, lin('#1A2134')), (0.3, lin('#121A2E')), (1, lin('#0A1022'))]; ks = 0.35; expo = 0.6
        fill_e, fill_c = 0.08, lin('#5A6FA8')
    elif DUSK:
        sun = add_light('sun', 'SUN', angle=math.radians(1.2), energy=2.6, color=lin('#FF9050')); aim(sun, sun_az, 5)
        sky = [(0, lin('#D9906E')), (0.3, lin('#7D6E98')), (1, lin('#34406E'))]; ks = 0.42; expo = 0.35
        fill_e, fill_c = 0.25, lin('#6A7EC0')
    elif TIME == 'day':
        sun = add_light('sun', 'SUN', angle=math.radians(0.8), energy=4.2, color=lin('#FFE6C8')); aim(sun, sun_az, 42)
        sky = [(0, lin('#C9D2DA')), (0.3, lin('#9DB2CF')), (1, lin('#6F8FC0'))]; ks = 0.75; expo = 0.15
        fill_e, fill_c = 0.3, lin('#8FA6D8')
    else:
        sun = add_light('sun', 'SUN', angle=math.radians(0.8), energy=5.0, color=lin('#FFB070')); aim(sun, sun_az, 14)
        sky = [(0, lin('#C9A89A')), (0.3, lin('#8C9AC0')), (1, lin('#5470A6'))]; ks = 0.62; expo = 0.3
        fill_e, fill_c = 0.35, lin('#7F98D6')
    fill = add_light('fill', 'SUN', angle=math.radians(10), energy=fill_e, color=fill_c)
    fill.data.use_shadow = False; fill.data.specular_factor = 0.0
    aim(fill, sun_az + 180, 35)
    wt = bpy.data.worlds.new('W'); scene.world = wt
    try:
        wt.use_nodes = True
    except Exception:
        pass
    wnt = wt.node_tree; bg = wnt.nodes['Background']
    tc = node(wnt, 'ShaderNodeTexCoord'); _, _, wz = sep(wnt, tc.outputs['Generated'])
    ramp = node(wnt, 'ShaderNodeValToRGB'); link(wnt, wz.lmap(-0.1, 0.9, 0, 1), ramp.inputs['Fac'])
    ncm.set_ramp(ramp, sky)
    link(wnt, ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = ks
    scene.render.engine = 'BLENDER_EEVEE'
    ee = scene.eevee
    ee.taa_render_samples = SAMPLES; ee.use_raytracing = True; ee.ray_tracing_method = 'SCREEN'
    ee.use_shadows = True; ee.shadow_ray_count = 2; ee.shadow_step_count = 10; ee.use_fast_gi = True; ee.fast_gi_distance = 8.0
    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    scene.view_settings.exposure = expo
    cng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree'); scene.compositing_node_group = cng
    cng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = cng.nodes.new('CompositorNodeRLayers')
    gl = cng.nodes.new('CompositorNodeGlare'); gl.inputs['Type'].default_value = 'Bloom'
    gl.inputs['Strength'].default_value = 0.45 if (NIGHT or DUSK) else 0.2; gl.inputs['Threshold'].default_value = 0.9 if NIGHT else 1.3
    hs = cng.nodes.new('CompositorNodeHueSat'); hs.inputs['Saturation'].default_value = 1.08
    go = cng.nodes.new('NodeGroupOutput')
    cng.links.new(rl.outputs['Image'], gl.inputs['Image']); cng.links.new(gl.outputs['Image'], hs.inputs['Image'])
    cng.links.new(hs.outputs['Image'], go.inputs[0])
    scene.render.use_compositing = True
    return sun


def camera(pitch=35.0, yaw=0.0, fov=25.0):
    cd = bpy.data.cameras.new('cam'); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(fov); cd.clip_start = 1; cd.clip_end = 5000
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


# ------------------------------------------------------------------ ground + sea
def ground(hfn, cfn, b, step=1.0):
    """Heightfield mesh with per-vertex Col (rgb + pattern alpha) on the kit material."""
    x0, y0, x1, y1 = b
    nx, ny = int((x1 - x0) / step), int((y1 - y0) / step)
    bm = bmesh.new()
    verts = [[bm.verts.new((x0 + i * step, y0 + j * step, hfn(x0 + i * step, y0 + j * step))) for i in range(nx + 1)] for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    me = bpy.data.meshes.new('ground'); bm.to_mesh(me); bm.free()
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    buf = []
    for v in me.vertices:
        c, pat = cfn(v.co.x, v.co.y, v.co.z)
        buf += [*c, 0.0]   # plain: per-vertex pattern ids would interpolate into stray patterns
    col.data.foreach_set('color', buf)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    ob = bpy.data.objects.new('ground', me); scene.collection.objects.link(ob)
    me.materials.append(ncm.M['kit'])
    return ob


def build_sea(hfn, b, N=1024, extra=()):
    from scipy import ndimage
    x0, y0, x1, y1 = b
    px = max(x1 - x0, y1 - y0) / N
    xs = x0 + (np.arange(N) + 0.5) * px; ys = y1 - (np.arange(N) + 0.5) * px
    X, Y = np.meshgrid(xs, ys)
    hv = np.vectorize(hfn)
    Hm = hv(X, Y)
    A = Hm > -0.1
    for (cx, cy, r) in extra:
        A |= (X - cx) ** 2 + (Y - cy) ** 2 < r * r
    dist = ndimage.distance_transform_edt(~A) * px
    img = np.zeros((N, N, 4), np.float32)
    img[..., 0] = np.clip(dist / 20.0, 0, 1); img[..., 3] = 1
    im = bpy.data.images.new('sea_sdf', N, N, float_buffer=True, alpha=True)
    im.pixels.foreach_set(img[::-1].ravel())
    im.filepath_raw = os.path.join(SCRATCH, f'sea-sdf-{MODE}.exr'); im.file_format = 'OPEN_EXR'; im.save()
    im.colorspace_settings.name = 'Non-Color'
    bb = (x0, y1 - N * px, x0 + N * px, y1)
    m = ncm.new_mat('M_sea'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    geo = node(nt, 'ShaderNodeNewGeometry'); W = geo.outputs['Position']
    wx, wy, _ = sep(nt, W)
    uvx = (wx - bb[0]) / (bb[2] - bb[0]); uvy = (wy - bb[1]) / (bb[3] - bb[1])
    tx = node(nt, 'ShaderNodeTexImage', interpolation='Cubic', extension='EXTEND'); tx.image = im
    link(nt, comb(nt, uvx, uvy, 0.0), tx.inputs['Vector'])
    sc = node(nt, 'ShaderNodeSeparateColor'); link(nt, tx.outputs['Color'], sc.inputs[0])
    dh = SX(nt, sc.outputs['Red']) * 20.0
    n1 = noise3(nt, vscale(nt, W, 0.05), 1.0, 2.0)
    n2 = noise3(nt, vscale(nt, W, 0.45), 1.0, 1.0)
    n3 = noise3(nt, vscale(nt, W, 1.1), 1.0, 1.0)
    deep = rgb(nt, lin('#143F55')); mid = rgb(nt, lin('#194C5E')); shal = rgb(nt, lin('#2E7A7A'))
    sea = mixc(nt, n1.sstep(0.35, 0.7), deep, mid)
    sea = mixc(nt, (1.0 - dh.sstep(0.5, 9.0)) * 0.75, sea, shal)
    f_hull = (1.0 - (dh + (n3 - 0.5) * 0.5).sstep(0.15, 0.6)) * 0.92
    ring2 = (1.0 - ((dh - 2.2).abs()).sstep(0.2, 0.5)) * n2.sstep(0.45, 0.6) * 0.55
    foam = f_hull.max(ring2)
    fc = rgb(nt, lin('#FFF6EA'))
    k_e = 0.12 if NIGHT else (0.4 if DUSK else 0.85)
    link(nt, mixc(nt, foam, mulc(nt, sea, 0.18), fc), p.inputs['Base Color'])
    emis = addc(nt, mulc(nt, sea, (1.0 - foam) * k_e), mulc(nt, fc, foam * (0.45 if not NIGHT else 0.06)))
    link(nt, emis, p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = 1.0
    link(nt, foam.lmap(0, 1, 0.05, 0.85), p.inputs['Roughness'])
    p.inputs['Specular IOR Level'].default_value = 1.0; p.inputs['IOR'].default_value = 1.33
    mp = node(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.35, 1.0, 1.0)
    mp.inputs['Rotation'].default_value = (0, 0, math.radians(40)); link(nt, W, mp.inputs['Vector'])
    r1 = noise3(nt, mp.outputs['Vector'], 0.55, 3.0, 0.55); r2 = noise3(nt, W, 2.2, 2.0)
    bump = node(nt, 'ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.32; bump.inputs['Distance'].default_value = 0.12
    link(nt, (r1 * 0.8 + r2 * 0.25) * (1.0 - foam * 0.6), bump.inputs['Height'])
    link(nt, bump.outputs['Normal'], p.inputs['Normal'])
    bmx = bmesh.new(); bmesh.ops.create_grid(bmx, x_segments=1, y_segments=1, size=1.0)
    for v in bmx.verts:
        v.co.x *= 1500; v.co.y *= 1500; v.co.z = -0.15
    me = bpy.data.meshes.new('sea'); bmx.to_mesh(me); bmx.free()
    ob = bpy.data.objects.new('sea', me); scene.collection.objects.link(ob)
    me.materials.append(m)
    return ob


def render(path):
    scene.render.resolution_percentage = PCT
    scene.render.filepath = path
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    print('RENDERED', path)


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
            d.text((x - tw / 2 + 1, y + dy + 1), t, font=ff, fill=(10, 20, 30, 170))
            d.text((x - tw / 2, y + dy), t, font=ff, fill=(246, 238, 222, 255))
    if title:
        tf = ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-Bold.ttf', max(16, int(W * 0.014)))
        d.text((int(W * 0.02) + 1, int(Hh * 0.025) + 1), title, font=tf, fill=(10, 20, 30, 180))
        d.text((int(W * 0.02), int(Hh * 0.025)), title, font=tf, fill=(250, 240, 220, 255))
    im.save(path)


def sand_col(x, y, z, shore=0.0):
    """Beach colouring by height above the sea: wet sand, a wrack line of weed, dry sand, dune grass."""
    p = (x, y, 0.0)
    n = fbm(p, 0.08, 1)
    if z < -0.05:
        return mix(lin('#8A7A5E'), lin('#6E6450'), smoothstep(-0.05, -2.0, z)), 0
    if z < 0.22:
        return lin('#9E8D6E'), 0
    if z < 0.42 + 0.1 * n:     # the wrack line: weed and kelp thrown up by the last spring tide
        return mix(lin('#A8987A'), PAL['kelp'], 0.55 * smoothstep(0.35, 0.65, vnoise(p, 0.9, 4))), 0
    c = mix(lin('#D3BF96'), lin('#DCCBA6'), smoothstep(1.0, 2.6, z))
    c = mix(c, lin('#C7B18A'), 0.4 * n)
    if z > 2.9 + 0.8 * n:
        g = smoothstep(2.9, 3.9, z - 0.8 * n)
        return mix(c, mix(lin('#748F45'), lin('#8E9A58'), n), g), (6 if g > 0.5 else 0)
    return c, 0


# ================================================================== scenes
if MODE == 'wrecks':
    scene.render.resolution_x, scene.render.resolution_y = 2200, 1300
    lay = [  # builder, (x, y), heading
        (wk_wrecks.great_hulk, (-2, 34), 12), (wk_wrecks.stern_section, (30, 36), 70), (wk_wrecks.capsized, (52, 34), -15),
        (wk_wrecks.burned, (-8, 10), 8), (wk_wrecks.rib_cage, (16, 10), -10), (wk_wrecks.mast_stump, (38, 10), 0),
        (wk_wrecks.skiff, (-6, -6), 20), (wk_wrecks.dinghy, (4, -6), -10), (wk_props.epitaph_post, (12, -6), 0),
        (wk_wrecks.schooner_sunk, (42, -18), 120),
    ]
    hf = lambda x, y: 0.0 if y > -9 else max(-3.5, (y + 9) * 0.25)
    roots, labels = [], []
    for fn, (x, y), hd in lay:
        r, inf = place(fn, (x, y, 0.0), hd)
        roots.append(r)
        labels.append((Vector((x, y - 9.0 if inf['tris'] > 800 else y - 4.0, 0)), r.name.replace('wreck_', '').replace('_', ' '),
                       f"{r.get('loa_m', 0):g} m · {inf['tris']} tris"))
    b = (-60, -80, 110, 80)
    ground(hf, lambda x, y, z: sand_col(x, y, z + 0.6), b, 1.0)
    build_sea(hf, b)
    setup_world()
    cam = camera(35.0, 0.0)
    tgt = Vector((22.0, 12.0, 0.0))
    cam.location = tgt - (cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))) * 135.0
    path = os.path.join(OUT, f'lineup-wrecks-{TIME}.png')
    render(path)
    label(path, labels, f'Wreck Cove kit v2 · wrecks · {TIME}')

if MODE == 'props':
    scene.render.resolution_x, scene.render.resolution_y = 2200, 1200
    lay = [(wk_props.warden_hut, (-12, 14), 0), (wk_props.lifeboat_station, (8, 16), 0), (wk_props.wreck_bell, (24, 14), 0),
           (wk_props.pennants, (34, 14), 0), (wk_props.driftwood, (-14, 0), 0), (wk_props.lobster_pots, (-4, 0), 0),
           (wk_props.flotsam, (6, 0), 0), (wk_props.anchor_chain, (16, 0), 0), (wk_props.tidepool, (27, 0), 0),
           (wk_props.gull_perches, (38, 0), 0), (wk_props.epitaph_post, (46, 1), 0)]
    hf = lambda x, y: 0.0 if y > -4 else max(-3.0, (y + 4) * 0.2)
    roots, labels = [], []
    for fn, (x, y), hd in lay:
        r, inf = place(fn, (x, y, 0.0), hd)
        roots.append(r)
        labels.append((Vector((x, y - 3.2, 0)), r.name.replace('wreck_cove_', '').replace('_', ' '), f"{inf['tris']} tris"))
    b = (-40, -40, 70, 50)
    ground(hf, lambda x, y, z: sand_col(x, y, z + 0.6), b, 1.0)
    build_sea(hf, b)
    setup_world()
    cam = camera(35.0, 0.0)
    tgt = Vector((16.0, 6.0, 0.0))
    cam.location = tgt - (cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))) * 120.0
    path = os.path.join(OUT, f'lineup-props-{TIME}.png')
    render(path)
    label(path, labels, f'Wreck Cove kit v2 · cove dressing · {TIME}')

if MODE == 'detail':
    from PIL import Image
    items = [wk_wrecks.great_hulk, wk_wrecks.schooner_sunk, wk_wrecks.stern_section, wk_wrecks.capsized, wk_wrecks.burned,
             wk_wrecks.rib_cage, wk_wrecks.mast_stump, wk_wrecks.skiff, wk_wrecks.dinghy]
    only = arg('--only', None)
    if only:
        items = [f for f in items if f.__name__ in only.split(',')]
    scene.render.resolution_x, scene.render.resolution_y = 1000, 700
    setup_world(sun_az=arg_az if (arg_az := float(arg('--az', '300'))) else 300)
    tiles = []
    for i, fn in enumerate(items):
        x0 = i * 220.0
        water = fn.__name__ == 'schooner_sunk'
        y0 = -16.0 if water else 0.0
        r, inf = place(fn, (x0, y0, 0.0), {'stern_section': 110.0, 'schooner_sunk': 150.0}.get(fn.__name__, -20.0))
        hf = lambda x, y, x0=x0: 0.05 if y > -9 else max(-3.5, (y + 9) * 0.25)
        ground(hf, lambda x, y, z: sand_col(x, y, z + 0.6), (x0 - 45, -50, x0 + 45, 40), 1.0)
        tiles.append((fn.__name__, r, inf))
    build_sea(lambda x, y: 0.05 if y > -9 else max(-3.5, (y + 9) * 0.25), (-60, -60, len(items) * 220.0, 60), 2048)
    cam = camera(28.0, -28.0, 30.0)
    paths = []
    for i, (nm, r, inf) in enumerate(tiles):
        L = r.get('loa_m', 4.0)
        tgt = Vector((i * 220.0, -16.0 if nm == 'schooner_sunk' else 0.0, 2.0 + 0.08 * L))
        cam.location = tgt - (cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))) * (L * 2.3 + 14.0)
        pth = os.path.join(SCRATCH, f'detail-{nm}-{TIME}.png')
        render(pth)
        label(pth, [], f"{nm.replace('_', ' ')} · {inf['tris']} tris")
        paths.append(pth)
    ims = [Image.open(p) for p in paths]
    cols = 3; rows = (len(ims) + cols - 1) // cols
    w, h = ims[0].size
    sheet = Image.new('RGB', (w * cols, h * rows), (20, 20, 20))
    for k, im in enumerate(ims):
        sheet.paste(im, ((k % cols) * w, (k // cols) * h))
    sheet.save(os.path.join(OUT, f'detail-wrecks-{TIME}.png'))
    print('RENDERED sheet')

if MODE in ('cove', 'hero'):
    # a sand bight between two rocky horns; sea toward -y
    def shore(x):
        return 6.0 - 17.0 * (x / 80.0) ** 2

    def horn(x, y):
        """Two rounded headlands closing the bight: grassy tops, rock flanks."""
        best = 0.0
        for sx in (-1, 1):
            cx, cy = sx * 96.0, -2.0
            r = math.hypot((x - cx) / 34.0, (y - cy) / 40.0)
            best = max(best, 10.0 * smoothstep(1.05, 0.3, r + 0.18 * (fbm((x, y, 0), 0.05, 7) - 0.5)))
        return best

    def H(x, y):
        d = y - shore(x)
        h = 0.068 * d if d >= 0 else max(-4.0, 0.16 * d)
        if d > 36:
            h += 0.14 * (d - 36) + 0.8 * fbm((x, y, 0), 0.05, 2)
        h += 0.15 * (fbm((x, y, 0), 0.04, 3) - 0.5)
        return max(h, horn(x, y) - 1.2)

    def colf(x, y, z):
        e = 0.7
        g = math.hypot(H(x + e, y) - H(x - e, y), H(x, y + e) - H(x, y - e)) / (2 * e)
        n = fbm((x, y, z), 0.2, 5)
        if g > 0.42 and z > 0.3:
            return mix(PAL['rock'], PAL['rock_dark'], n), 5
        if z < 0.6 and horn(x, y) > 1.0:
            return mix(PAL['rock_dark'], PAL['weed'], 0.6), 5
        if z > 3.2 and horn(x, y) > 1.0:
            return mix(lin('#748F45'), lin('#8E9A58'), n), 6
        return sand_col(x, y, z)
    b = (-150, -90, 150, 150)
    rng = random.Random(7)
    roots = []

    def P(x, d, hd, fn, s=1.0, ep=False, lit=True, water=False):
        y = shore(x) + d
        z = 0.0 if water else H(x, y)
        r, _ = place(fn, (x, y, z), hd, s, epitaph=ep, lit=lit)
        roots.append(r)
        return r
    W = wk_wrecks; Pp = wk_props
    # heroes at the tide line
    P(-14, 5.0, 28, W.great_hulk, ep=True)
    P(24, 7.0, 74, W.stern_section, ep=True)
    P(6, -17.0, 128, W.schooner_sunk, water=True)
    P(-42, 6.0, -18, W.capsized)
    P(44, 4.5, 14, W.burned)
    P(-60, 2.0, 0, W.mast_stump)
    # the lesser dead among the rocks of the horns
    P(58, 9.0, 66, W.rib_cage, 0.85)
    P(66, 3.0, 100, W.skiff); P(70, 7.0, 30, W.dinghy); P(62, 14.0, -40, W.skiff, 0.9)
    P(-66, 6.0, 140, W.dinghy); P(-70, 11.0, 60, W.skiff); P(-30, 13.0, 160, W.dinghy)
    P(-52, 14.0, 20, W.burned, 0.55); P(36, 15.0, -30, W.capsized, 0.55); P(10, 12.0, 200, W.rib_cage, 0.5)
    # the memorial: a gentle arc of epitaph posts above the wrack line, the bell at its middle, pennants at its ends
    for k in range(17):
        x = -40 + 5.0 * k
        d = 27.0 + 2.2 * math.cos((k - 8) / 8 * 1.2)
        P(x, d, -(x / 80.0) * 12, Pp.epitaph_post, 2.2, ep=True)
    P(0, 31.5, 0, Pp.wreck_bell)
    P(-46, 28.0, 0, Pp.pennants); P(46, 28.0, 10, Pp.pennants)
    # the warden's hut on the dune with its pots and driftwood, the lifeboat station on the west horn
    P(-36, 44.0, 8, Pp.warden_hut)
    P(-41, 41.0, 20, Pp.lobster_pots); P(-29, 42.5, -30, Pp.driftwood)
    P(-76, -1.0, 6, Pp.lifeboat_station)
    P(72, -2.0, 0, Pp.tidepool); P(-62, -3.0, 40, Pp.tidepool, 0.8); P(52, 0.5, 70, Pp.tidepool, 0.7)
    P(12, 11.0, 30, Pp.anchor_chain)
    P(-24, 2.5, 40, Pp.flotsam); P(32, 1.5, -60, Pp.flotsam, 0.9)
    P(-2, -3.0, 0, Pp.gull_perches); P(48, -2.0, 50, Pp.gull_perches)
    P(16, 22.0, 10, Pp.driftwood); P(-8, 19.0, -70, Pp.driftwood, 0.8)
    ground(H, colf, b, 1.0)
    build_sea(H, b, 1536)
    for k in range(18):       # loose boulders on the horns
        sx = rng.choice((-1, 1)); x = sx * rng.uniform(64, 84); y = rng.uniform(-22, 10)
        mb = wk_lib.MB(k)
        wk_lib.rock(mb, (0, 0, 0), rng.uniform(1.2, 3.2), rng, squash=0.7, weed=0.6 if y < shore(x) + 4 else 0.0)
        r = wk_lib.empty('boulder'); r.location = (x, y, max(H(x, y), -0.6) - 0.3)
        wk_lib.finish(mb, 'rock', 'hb_opaque', r, k); dress(r)
    setup_world(sun_az=300.0 if not NIGHT else 300.0)
    if MODE == 'cove':
        scene.render.resolution_x, scene.render.resolution_y = 2000, 1250
        cam = camera(35.0, 0.0, 25.0)
        tgt = Vector((-2.0, 10.0, 0.0))
        fwd = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
        cam.location = tgt - fwd * 245.0
        render(os.path.join(OUT, f'cove-{TIME}.png'))
    else:
        scene.render.resolution_x, scene.render.resolution_y = 2000, 1150
        cam = camera(21.0, -14.0, 30.0)
        tgt = Vector((-8.0, 16.0, 1.0))
        fwd = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
        cam.location = tgt - fwd * 105.0
        render(os.path.join(OUT, f'cove-hero-{TIME}.png'))
print('DONE', MODE, TIME)
