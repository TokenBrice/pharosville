"""The Harbour v3 - whole-island build (style C "Northern Light" + A grafts), key art and exports.

    python3 compose.py && python3 bake_sdf.py                     # plan, layout.json, sea-sdf.png
    blender -b --factory-startup -P build_island.py -- [options]
      --stages land,town,dress,boats      (default: all)
      --render  --cams heart,overview  --states golden,night,noon  --samples 64  --pct 100  --suffix _x
      --export                            island.glb + lighthouse.glb (+ window lights for layout.json)
      --save                              keep a .blend in outputs/harbour/island/
"""
import sys, os, time
sys.dont_write_bytecode = True
HERE_ = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE_)
for p in ('/home/ahirice/.local/lib/python3.14/site-packages',):
    if p not in sys.path:
        sys.path.append(p)
import importlib, json
import nl_common; importlib.reload(nl_common)
import nl_kit; importlib.reload(nl_kit)
from nl_common import *
from nl_kit import *

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


ROOT = os.path.abspath(os.path.join(HERE_, '../../../..'))
OUTD = os.path.join(ROOT, 'outputs/harbour/island')
ART = os.path.join(ROOT, 'agents/2026-10-13-pharosville-reboot/p2/island-v3')
P1C = os.path.join(ROOT, 'agents/2026-10-13-pharosville-reboot/p1/style-c')
STAGES = arg('--stages', 'land,town,dress,boats').split(',')
RENDER = '--render' in ARGV
STATES = arg('--states', 'golden').split(',')
CAMS = arg('--cams', 'heart').split(',')
SAMPLES = int(arg('--samples', '48'))
PCT = int(arg('--pct', '100'))
SUFFIX = arg('--suffix', '')
OUT = arg('--out', OUTD)
EXPORT = '--export' in ARGV
t0 = time.time()
random.seed(11)

CJ = json.load(open(os.path.join(OUTD, 'compose.json')))
CJ_LAYOUT = json.load(open(os.path.join(ROOT, 'src/harbour/data/layout.json')))
if '--probe' in ARGV:          # dev close-up camera (runtime ?cam= convention: glTF x,y,z,distance): --cams probe
    _pv = [float(v) for v in arg('--probe', '0,0,0,200').split(',')]
    CJ['presets']['probe'] = dict(target=_pv[:3], distance=_pv[3], fovDeg=25.0, pitchDeg=30.0, yawDeg=45.0)

reset_scene()
scene = bpy.context.scene
ROOTC = collection('HB')
set_coll(ROOTC)

# ------------------------------------------------------------------ materials (style C contract)
atlas = bpy.data.images.load(os.path.join(P1C, 'emblem-atlas.png'), check_existing=False)
atlas.alpha_mode = 'STRAIGHT'
NSLOT = 4
build_kit_material(); build_glass_material(); build_sail_material(atlas, float(NSLOT))
build_glow_material('lamp', lin('#3B3A33'), PAL['sodium'], 'LAMP_K')
build_glow_material('lens', PAL['lens'], PAL['lantern'], 'LENS_K')
build_glow_material('riding', lin('#DDDDDD'), PAL['riding'], 'RIDE_K')
build_glow_material('beacon_red', lin('#8E2A22'), lin('#FF5A3C'), 'BEACON_K')
m = new_mat('lantern_glass'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
p.inputs['Base Color'].default_value = (*lin('#BFD6D8'), 1); p.inputs['Roughness'].default_value = 0.05
p.inputs['Alpha'].default_value = 0.35; m.surface_render_method = 'BLENDED'; M['lantern_glass'] = m

CIRCLES_EXTRA = []
for stage in ('land', 'town', 'dress', 'boats'):
    if stage in STAGES:
        exec(open(os.path.join(HERE_, f'hb_{stage}.py')).read())
        if stage == 'land':
            CIRCLES_EXTRA += CIRCLES
print('BUILD', round(time.time() - t0, 1), 's')

if EXPORT:
    exec(open(os.path.join(HERE_, 'hb_export.py')).read())

if RENDER:
    exec(open(os.path.join(HERE_, 'hb_scene.py')).read())
    exec(open(os.path.join(HERE_, 'hb_render.py')).read())

if '--save' in ARGV:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTD, 'island.blend'), compress=True)
print('DONE', round(time.time() - t0, 1), 's')
