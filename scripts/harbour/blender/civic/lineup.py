"""Harbour civic kit - lookdev renders (golden / night) of every civic GLB builder, built in-scene by the export builders.

    blender -b --factory-startup -P scripts/harbour/blender/civic/lineup.py -- [--only mint,burn] [--state golden|night|both]
        [--mode sheet|lineup] [--samples 32] [--pct 100] [--yaw -24] [--out DIR]

sheet:  one framed render per building, tiled into civic-sheet-<state>.jpg with labels
lineup: every building on one quay in a single golden/night frame (civic-lineup-<state>.jpg)
Preview materials reproduce the runtime contract (style C kit shader from the island scripts).
"""
import sys, os, math, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(1, os.path.join(HERE, '..', 'island'))
import importlib
import bpy, bmesh
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
import cv_lib; importlib.reload(cv_lib)
import cv_works; importlib.reload(cv_works)
import cv_yard; importlib.reload(cv_yard)
import cv_civic; importlib.reload(cv_civic)
import nl_common as ncm
from cv_lib import PAL, lin, CHAINS, descendants, tri_count, reset_scene
from cv_build import BUILDERS, FOOT

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(n, d):
    return ARGV[ARGV.index(n) + 1] if n in ARGV else d


ONLY = arg('--only', '')
STATES = ['golden', 'night'] if arg('--state', 'golden') == 'both' else [arg('--state', 'golden')]
MODE = arg('--mode', 'sheet')
SAMPLES = int(arg('--samples', '32'))
PCT = int(arg('--pct', '100'))
YAW = float(arg('--yaw', '-24'))
PITCH = float(arg('--pitch', '34'))
FOCUS = [float(v) for v in arg('--focus', '').split(',')] if '--focus' in ARGV else None
OUT = arg('--out', os.path.join(ROOT, 'agents', '2026-10-13-pharosville-reboot', 'p6', 'civic'))
SCR = os.path.join(ROOT, 'outputs', 'harbour', 'civic')
os.makedirs(OUT, exist_ok=True); os.makedirs(SCR, exist_ok=True)
reset_scene()
scene = bpy.context.scene

KINDS = [k for k in BUILDERS if not ONLY or k in ONLY.split(',')]

# ------------------------------------------------------------------ preview materials
node, link, sep, C, SX, mixc = ncm.node, ncm.link, ncm.sep, ncm.C, ncm.SX, ncm.mixc
ncm.build_kit_material(); ncm.build_glass_material()
EM = ncm.build_glow_material('PV_em', lin('#3B3A33'), lin('#FF9A40'), 'LAMP_K')


def pv_cover():
    m = ncm.new_mat('PV_cover'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    at = node(nt, 'ShaderNodeAttribute', attribute_name='Col'); oi = node(nt, 'ShaderNodeObjectInfo')
    mm = node(nt, 'ShaderNodeMix'); mm.data_type = 'RGBA'; mm.blend_type = 'MULTIPLY'
    ncm.sock(mm, 'Factor_Float').default_value = 1.0
    nt.links.new(at.outputs['Color'], ncm.sock(mm, 'A_Color')); nt.links.new(oi.outputs['Color'], ncm.sock(mm, 'B_Color'))
    nt.links.new(ncm.sock(mm, 'Result_Color', out=True), p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.8
    m.use_backface_culling = False
    return m


COVER = pv_cover()
FLAG = ncm.new_mat('PV_flag'); FLAG.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*lin('#2A4A86'), 1)
CREST = {}


def crest_mat(chain):
    if chain in CREST:
        return CREST[chain]
    from PIL import Image
    png = os.path.join(SCR, f'crest-{chain}.png')
    subprocess.run(['rsvg-convert', '-w', '384', '-h', '384', '--keep-aspect-ratio', os.path.join(ROOT, 'public', 'chains', f'{chain}.svg'),
                    '-o', png], check=True)
    im = Image.open(png).convert('RGBA')
    cc = tuple(int(round(255 * (x ** (1 / 2.2)))) for x in lin(CHAINS[chain]))
    bg = Image.new('RGBA', (448, 448), (*cc, 255))
    bg.alpha_composite(im, ((448 - im.width) // 2, (448 - im.height) // 2))
    bg.save(png)
    m = ncm.new_mat('PV_crest_' + chain); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tex = node(nt, 'ShaderNodeTexImage'); tex.image = bpy.data.images.load(png); tex.extension = 'CLIP'
    nt.links.new(tex.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = 0.6
    CREST[chain] = m
    return m


def dress(root, chain=None):
    for o in descendants(root):
        if o.type != 'MESH' or not o.data.materials:
            continue
        nm = o.data.materials[0].name.split('.')[0]
        if nm == 'hb_opaque':
            o.data.materials[0] = ncm.M['kit']
        elif nm == 'hb_window':
            o.data.materials[0] = ncm.M['window']
        elif nm == 'hb_emissive':
            o.data.materials[0] = EM
        elif nm == 'hb_cover':
            o.data.materials[0] = COVER
            o.color = (*lin(CHAINS.get(chain, '#C2453A')), 1)
        elif nm == 'hb_crest':
            o.data.materials[0] = crest_mat(chain or 'ethereum')


# ------------------------------------------------------------------ world
def add_light(name, kind, **kw):
    ld = bpy.data.lights.new(name, kind); ob = bpy.data.objects.new(name, ld); scene.collection.objects.link(ob)
    for k, v in kw.items():
        setattr(ld, k, v)
    return ob


def aim(ob, az, el):
    az, el = math.radians(az), math.radians(el)
    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    ob.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


sun = add_light('sun', 'SUN', angle=math.radians(0.8))
fill = add_light('fill', 'SUN', angle=math.radians(10)); fill.data.use_shadow = False; fill.data.specular_factor = 0.0
wt = bpy.data.worlds.new('W'); scene.world = wt
try:
    wt.use_nodes = True
except Exception:
    pass
wnt = wt.node_tree; bg = wnt.nodes['Background']
tc = node(wnt, 'ShaderNodeTexCoord'); _, _, wz = sep(wnt, tc.outputs['Generated'])
ramp = node(wnt, 'ShaderNodeValToRGB'); link(wnt, wz.lmap(-0.1, 0.9, 0, 1), ramp.inputs['Fac'])
link(wnt, ramp.outputs['Color'], bg.inputs['Color'])
scene.render.engine = 'BLENDER_EEVEE'
ee = scene.eevee
ee.taa_render_samples = SAMPLES; ee.use_raytracing = True; ee.ray_tracing_method = 'SCREEN'
ee.use_shadows = True; ee.shadow_ray_count = 2; ee.shadow_step_count = 10; ee.use_fast_gi = True; ee.fast_gi_distance = 10.0
scene.view_settings.view_transform = 'AgX'
try:
    scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass
cng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree'); scene.compositing_node_group = cng
cng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
rl = cng.nodes.new('CompositorNodeRLayers')
gl = cng.nodes.new('CompositorNodeGlare'); gl.inputs['Type'].default_value = 'Bloom'
hs = cng.nodes.new('CompositorNodeHueSat'); hs.inputs['Saturation'].default_value = 1.08
go = cng.nodes.new('NodeGroupOutput')
cng.links.new(rl.outputs['Image'], gl.inputs['Image']); cng.links.new(gl.outputs['Image'], hs.inputs['Image'])
cng.links.new(hs.outputs['Image'], go.inputs[0])
scene.render.use_compositing = True
POINTS = []


def set_state(st):
    win = ncm.M['window'].node_tree.nodes['WIN_K']; lamp = EM.node_tree.nodes['LAMP_K']
    if st == 'golden':
        sun.data.energy = 5.2; sun.data.color = lin('#FFB070'); aim(sun, YAW - 70 - 90, 16)
        fill.data.energy = 0.35; fill.data.color = lin('#7F98D6'); aim(fill, YAW + 90, 35)
        ncm.set_ramp(ramp, [(0, lin('#C9A89A')), (0.3, lin('#8C9AC0')), (1, lin('#5470A6'))]); bg.inputs['Strength'].default_value = 0.62
        win.outputs[0].default_value = 1.2; lamp.outputs[0].default_value = 6.0
        gl.inputs['Strength'].default_value = 0.2; gl.inputs['Threshold'].default_value = 1.3
        scene.view_settings.exposure = 0.25
        for p in POINTS:
            p.data.energy = p['e'] * 0.15
    else:
        sun.data.energy = 1.1; sun.data.color = lin('#A9BCFF'); aim(sun, YAW - 70 - 90, 32)
        fill.data.energy = 0.18; fill.data.color = lin('#5A6FB0'); aim(fill, YAW + 90, 35)
        ncm.set_ramp(ramp, [(0, lin('#2C3F6E')), (0.35, lin('#1C2B55')), (1, lin('#0B1330'))]); bg.inputs['Strength'].default_value = 1.2
        win.outputs[0].default_value = 6.0; lamp.outputs[0].default_value = 30.0
        gl.inputs['Strength'].default_value = 0.6; gl.inputs['Threshold'].default_value = 0.8
        scene.view_settings.exposure = 0.35
        for p in POINTS:
            p.data.energy = p['e']


def surface(name, x0, y0, x1, y1, z, col, pat=6, mat=None):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))]
    bm.faces.new(vs)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    if mat is None:
        a = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        for d in a.data:
            d.color = (*col, pat / 16)
        me.materials.append(ncm.M['kit'])
    else:
        me.materials.append(mat)
    return ob


SEA = ncm.new_mat('PV_sea'); _p = SEA.node_tree.nodes['Principled BSDF']
_p.inputs['Base Color'].default_value = (*lin('#1F5566'), 1); _p.inputs['Roughness'].default_value = 0.12


def stage(kind, at):
    """Build one kind at `at` with its ground; returns (root, pts for framing)."""
    root, info = BUILDERS[kind]()
    root.location = at
    if kind == 'hull-stages':   # the four stages side by side (they share one origin in the GLB)
        for k, ch in enumerate(sorted(root.children, key=lambda o: ['keel_only', 'ribs', 'planked', 'painted'].index(o.name.split('.')[0]))):
            ch.location = (0.0, (k - 1.5) * 9.0, 1.0)
    chain = kind.split(':')[1] if ':' in kind else None
    dress(root, chain)
    w, d = FOOT[kind]
    x, y = at[0], at[1]
    water_front = kind in ('shipyard', 'burn', 'hull-stages')
    if kind == 'burn':
        surface('sea_' + kind, x - 60, y - 60, x + 60, y + 60, -2.4, None, mat=SEA)
    elif water_front:
        surface('land_' + kind, x - w / 2 - 30, y + d / 2, x + w / 2 + 30, y + d / 2 + 40, -0.02, PAL['grass'], 6)
        surface('landl_' + kind, x - w / 2 - 30, y - d / 2, x - w / 2, y + d / 2, -0.02, PAL['grass'], 6)
        surface('landr_' + kind, x + w / 2, y - d / 2, x + w / 2 + 30, y + d / 2, -0.02, PAL['grass'], 6)
        surface('sea_' + kind, x - w / 2 - 60, y - d / 2 - 70, x + w / 2 + 60, y - d / 2, -2.4, None, mat=SEA)
    else:
        surface('land_' + kind, x - w / 2 - 14, y - d / 2 - 4, x + w / 2 + 14, y + d / 2 + 14, -0.02, PAL['grass'], 6)
        surface('quay_' + kind, x - w / 2 - 14, y - d / 2 - 14, x + w / 2 + 14, y - d / 2 - 4, -0.02, PAL['quay'], 4)
        surface('sea_' + kind, x - w / 2 - 60, y - d / 2 - 80, x + w / 2 + 60, y - d / 2 - 14, -2.4, None, mat=SEA)
    if kind == 'shipyard':   # preview the runtime contract: hull stages on the slip / berth nodes, stern toward the water
        import random as _r
        from mathutils import Matrix
        hroot, hinfo = BUILDERS['hull-stages']()
        dress(hroot)
        stages = {o.name.split('.')[0]: o for o in hroot.children}
        keel = -hinfo['keel_bottom_y']
        rr = _r.Random(3)
        bpy.context.view_layer.update()
        for o in descendants(root):
            nm = o.name.split('.')[0]
            if not (nm.startswith('slip_') or nm.startswith('berth_')):
                continue
            slip = nm.startswith('slip_')
            if not slip and rr.random() < 0.35:
                continue
            sc = (1.4 + 0.18 * int(nm[5:])) if slip else rr.uniform(0.6, 0.78)
            st = rr.choice(['keel_only', 'ribs', 'planked', 'painted', 'ribs', 'planked'])
            ob = stages[st].copy(); scene.collection.objects.link(ob); ob.parent = None
            ob.matrix_world = o.matrix_world @ Matrix.Translation((0, 0, keel * sc)) @ Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Scale(sc, 4)
        for o in descendants(hroot):
            bpy.data.objects.remove(o, do_unlink=True)
    for o in descendants(root):   # preview-only flag at every flag_pole_top (runtime owns the real one)
        if o.name.split('.')[0] == 'flag_pole_top':
            bpy.context.view_layer.update()
            p0 = o.matrix_world.translation
            bm = bmesh.new()
            vs = [bm.verts.new(p0 + Vector(v)) for v in ((0, 0, 0), (3.6, 0.3, -0.1), (3.6, 0.3, -2.5), (0, 0, -2.4))]
            f = bm.faces.new(vs)
            uvl = bm.loops.layers.uv.new('UVMap')
            for lp, uv in zip(f.loops, ((0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0))):
                lp[uvl].uv = uv
            me = bpy.data.meshes.new('pv_flag'); bm.to_mesh(me); bm.free()
            fo = bpy.data.objects.new('pv_flag', me); scene.collection.objects.link(fo)
            me.materials.append(crest_mat(chain) if chain else FLAG)
    for o in descendants(root):   # local lights at fires so the night frame reads like the runtime glow
        if o.name.split('.')[0] in ('fire_core', 'furnace_glow', 'grate_glow'):
            bpy.context.view_layer.update()
            c = sum((o.matrix_world @ Vector(b) for b in o.bound_box), Vector()) / 8
            L = add_light('pt_' + o.name, 'POINT', color=lin('#FF9A4A'), shadow_soft_size=2.0)
            L.location = c + Vector((0, -2.0, 1.0)); L['e'] = 30000.0 if 'fire' in o.name else 12000.0
            POINTS.append(L)
    bpy.context.view_layer.update()
    pts = []
    for o in descendants(root):
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(b) for b in o.bound_box]
    return root, pts


def camera(fov=24.0):
    cd = bpy.data.cameras.new('cam'); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(fov); cd.clip_start = 1; cd.clip_end = 6000
    co = bpy.data.objects.new('cam', cd); scene.collection.objects.link(co); scene.camera = co
    co.rotation_euler = (math.radians(90 - PITCH), 0, math.radians(YAW))
    return co


def fit(cam, pts, margin=0.05, iters=10):
    fwd = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    c = sum(pts, Vector()) / len(pts)
    dist = 300.0
    for _ in range(iters):
        cam.location = c - fwd * dist
        bpy.context.view_layer.update()
        q = [world_to_camera_view(scene, cam, p) for p in pts]
        xs = [p.x for p in q]; ys = [p.y for p in q]
        k = max((max(xs) - min(xs)) / (1 - 2 * margin), (max(ys) - min(ys)) / (1 - 2 * margin))
        mx = (max(xs) + min(xs)) / 2 - 0.5; my = (max(ys) + min(ys)) / 2 - 0.5
        aspect = scene.render.resolution_x / scene.render.resolution_y
        R = cam.rotation_euler.to_matrix()
        half_h = math.tan(cam.data.angle_y / 2) * dist
        c = c + (R @ Vector((1, 0, 0))) * mx * 2 * half_h * aspect + (R @ Vector((0, 1, 0))) * my * 2 * half_h
        dist *= k
    cam.location = c - fwd * dist


def render(path):
    scene.render.resolution_percentage = PCT
    scene.render.filepath = path
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)


LABEL = {'mint': 'The Mint', 'burn': 'The Burn', 'shipyard': 'The Shipyard', 'customs': 'Customs House', 'registry': 'The Registry',
         'chartroom': 'Chart Room', 'stormstation': 'Storm Station', 'harbourmaster': 'Harbourmaster', 'keeperslog': "Keeper's Log",
         'hull-stages': 'Hull stages'}


def label_of(k):
    if k.startswith('harbour-office:'):
        return 'Office: ' + k.split(':')[1]
    return LABEL.get(k, k)


cam = camera()
if MODE == 'sheet':
    from PIL import Image, ImageDraw, ImageFont
    scene.render.resolution_x, scene.render.resolution_y = 960, 640
    staged = {}
    for i, k in enumerate(KINDS):
        staged[k] = stage(k, (i * 600.0, 0.0, 0.0))
    for st in STATES:
        set_state(st)
        tiles = []
        for k in KINDS:
            pts_ = staged[k][1]
            if FOCUS:
                pts_ = [Vector((FOCUS[0], FOCUS[1], 0)), Vector((FOCUS[2], FOCUS[3], 0)), Vector((FOCUS[0], FOCUS[3], 8)), Vector((FOCUS[2], FOCUS[1], 8))]
            fit(cam, pts_, margin=0.06)
            p = os.path.join(SCR, f'tile-{k.replace(":", "-")}-{st}.png')
            render(p)
            tiles.append((k, p))
        cols = 3 if len(tiles) > 4 else len(tiles)
        rows = (len(tiles) + cols - 1) // cols
        W_, H_ = int(960 * PCT / 100), int(640 * PCT / 100)
        sheet = Image.new('RGB', (W_ * cols, H_ * rows), (20, 24, 30))
        d = ImageDraw.Draw(sheet)
        f = ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-Bold.ttf', max(14, W_ // 34))
        for j, (k, p) in enumerate(tiles):
            im = Image.open(p).convert('RGB')
            ox, oy = (j % cols) * W_, (j // cols) * H_
            sheet.paste(im, (ox, oy))
            t = label_of(k) + f'  ·  {tri_count(descendants(staged[k][0]))} tris'
            d.text((ox + 13, oy + 11), t, font=f, fill=(10, 14, 20))
            d.text((ox + 12, oy + 10), t, font=f, fill=(250, 242, 226))
        name = f'civic-sheet-{st}' + (('-' + ONLY.replace(',', '_').replace(':', '-')) if ONLY and len(KINDS) < 6 else '') + '.jpg'
        sheet.save(os.path.join(OUT, name), quality=90)
        print('SHEET', os.path.join(OUT, name))
else:
    # one quay: everything side by side (front row: offices; back row: big works)
    scene.render.resolution_x, scene.render.resolution_y = 2200, 1200
    allpts = []
    rows = [[k for k in KINDS if k in ('mint', 'burn', 'shipyard', 'customs')],
            [k for k in KINDS if k not in ('mint', 'burn', 'shipyard', 'customs', 'hull-stages')]]
    for r, row in enumerate(rows):
        x = 0.0
        tot = sum(FOOT[k][0] + 10 for k in row)
        for k in row:
            w, d = FOOT[k]
            r_, pts = stage(k, (x + w / 2 - tot / 2, r * 95.0 + (0 if r == 0 else -FOOT[k][1] / 2 + 8), 0.0))
            allpts += pts
            x += w + 10
    for st in STATES:
        set_state(st)
        fit(cam, allpts, margin=0.03)
        p = os.path.join(SCR, f'lineup-{st}.png')
        render(p)
        from PIL import Image
        Image.open(p).convert('RGB').save(os.path.join(OUT, f'civic-lineup-{st}.jpg'), quality=90)
        print('LINEUP', os.path.join(OUT, f'civic-lineup-{st}.jpg'))

if '--save' in ARGV:
    bpy.ops.wm.save_as_mainfile(filepath=arg('--save', ''))
