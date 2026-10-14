"""Sanity render of the exported island + lighthouse GLBs (raw, pre-meshopt) from a layout camera preset.
    blender -b --factory-startup -P check_glb.py -- [--cam heart] [--out path.png]"""
import bpy, sys, os, json, math
from mathutils import Vector
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
arg = lambda n, d: ARGV[ARGV.index(n) + 1] if n in ARGV else d
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
OUTD = os.path.join(ROOT, 'outputs/harbour/island')
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
for p in ('island.raw.glb', 'lighthouse.raw.glb'):
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUTD, p))
names = set()
for o in bpy.data.objects:
    if o.type == 'MESH':
        names |= {c.name for c in o.data.color_attributes}
print('COLOR ATTRS', names)
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    nt = m.node_tree; pr = nt.nodes.get('Principled BSDF')
    if pr is None:
        continue
    if m.name.startswith('hb_opaque'):
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'Color'
        nt.links.new(at.outputs['Color'], pr.inputs['Base Color'])
    pr.inputs['Roughness'].default_value = 0.85
    m.use_backface_culling = True
lay = json.load(open(os.path.join(ROOT, 'src/harbour/data/layout.json')))
pr_ = lay['camera']['presets'][arg('--cam', 'heart')]
tx, ty, tz = pr_['target']; T = Vector((tx, -tz, ty)); D = pr_['distance']
yaw, pit = math.radians(pr_['yawDeg']), math.radians(pr_['pitchDeg'])
off = Vector((math.sin(yaw) * math.cos(pit), -math.cos(yaw) * math.cos(pit), math.sin(pit)))
cd = bpy.data.cameras.new('c'); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(pr_['fovDeg']); cd.clip_end = D * 12
co = bpy.data.objects.new('c', cd); bpy.context.scene.collection.objects.link(co)
co.location = T + off * D; co.rotation_euler = (T - co.location).to_track_quat('-Z', 'Y').to_euler()
sc = bpy.context.scene; sc.camera = co
ld = bpy.data.lights.new('s', 'SUN'); ld.energy = 3.5; so = bpy.data.objects.new('s', ld); sc.collection.objects.link(so)
so.rotation_euler = Vector((0.6, 0.5, -0.62)).to_track_quat('-Z', 'Y').to_euler()
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.42, 0.5, 1)
sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = 16
sc.render.resolution_x, sc.render.resolution_y = 1600, 1000; sc.render.resolution_percentage = int(arg('--pct', '50'))
sc.view_settings.view_transform = 'AgX'
sc.render.filepath = arg('--out', os.path.join(OUTD, 'check-glb.png'))
bpy.ops.render.render(write_still=True)
