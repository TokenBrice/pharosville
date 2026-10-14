"""Style B "Living Sea Chart" -- reproducible build + render.

    blender -b --factory-startup -P build.py -- [--states golden,night,noon] [--cams overview,harbour]
        [--samples 32] [--pct 100] [--grey] [--glb] [--save] [--tag progress-01]

Renders multilayer EXR passes to work/, then post.py turns them into the final PNGs.
"""
import bpy, bmesh, math, random, os, sys, json, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
for m in ('lib', 'mats', 'terrain', 'kit', 'hulls', 'world'):
    sys.modules.pop(m, None)
from mathutils import Vector, Matrix, noise
import lib
from lib import *
import mats
import terrain
from terrain import uv2w, w2uv

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


STATES = arg('--states', 'golden').split(',')
CAMS = arg('--cams', 'overview').split(',')
SAMPLES = int(arg('--samples', '32'))
PCT = int(arg('--pct', '100'))
GREY = '--grey' in ARGV
TAG = arg('--tag', '')
WORK = os.path.join(HERE, 'work')
os.makedirs(WORK, exist_ok=True)
t0 = time.time()

# ---------------------------------------------------------------- reset
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.node_groups, bpy.data.lights, bpy.data.cameras):
    for d in list(coll):
        coll.remove(d)
scene = bpy.context.scene
SC = scene.collection

LAYOUT = dict(
    quay_x=25.5, quay_y=(-42.4, 18.0),
    terrace_x0=42.0, terrace_w=12.0, terrace_h=3.6, terraces=4,
    headland_uv=(-78, 32), back_x0=0.0,
    pads=[(-31.0, 76.0, 17.0, 18.5)],
    ramps=[(-1.0, 35.0, -10.0, 24.0, 5.0, 2.1, -1.2)],
)
import world
W = world.World(LAYOUT, grey=GREY)
W.build()

# ---------------------------------------------------------------- render setup
scene.render.engine = 'BLENDER_EEVEE'
ee = scene.eevee
ee.taa_render_samples = SAMPLES
ee.use_raytracing = True
ee.ray_tracing_method = 'SCREEN'
ee.use_shadows = True
ee.shadow_ray_count = 2
ee.shadow_step_count = 10
ee.use_fast_gi = True
ee.fast_gi_distance = 6.0
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.render.resolution_percentage = PCT
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
vl = scene.view_layers[0]
vl.use_pass_z = True
vl.use_pass_normal = True
aov = vl.aovs.add(); aov.name = 'inkmask'; aov.type = 'VALUE'
scene.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'
scene.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
scene.render.image_settings.color_depth = '16'
scene.render.image_settings.exr_codec = 'ZIP'
scene.render.use_compositing = False

stats = W.stats()
print('STATS', json.dumps(stats))
with open(os.path.join(WORK, 'stats.json'), 'w') as f:
    json.dump(stats, f, indent=1)
if '--save' in ARGV:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'style_b.blend'), compress=True)
if '--glb' in ARGV:
    W.export_glbs(os.path.join(HERE, 'glb'))

for cam in ([] if '--norender' in ARGV else CAMS):
    W.use_camera(cam)
    for st in STATES:
        W.apply_state(st, cam)
        out = os.path.join(WORK, f'{cam}-{st}{TAG}.exr')
        scene.render.filepath = out
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print('RENDERED', out, round(time.time() - t1, 1), 's')
print('TOTAL', round(time.time() - t0, 1))
