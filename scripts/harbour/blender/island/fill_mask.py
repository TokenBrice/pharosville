"""Land-fill measurement for a camera preset: everything that is not sea or sky renders white.
    blender -b --factory-startup -P build_island.py -P fill_mask.py -- --stages land,town,dress,boats --cam overview"""
import bpy, math, json, os, sys
import numpy as np
from mathutils import Vector
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
cam = ARGV[ARGV.index('--cam') + 1] if '--cam' in ARGV else 'overview'
sc = bpy.context.scene
HERE = os.path.dirname(os.path.abspath(__file__)); OUTD = os.path.abspath(os.path.join(HERE, '../../../../outputs/harbour/island'))
CJ = json.load(open(os.path.join(OUTD, 'compose.json')))
white = bpy.data.materials.new('mask_w'); white.use_nodes = True
nt = white.node_tree; [nt.nodes.remove(n) for n in list(nt.nodes) if n.type != 'OUTPUT_MATERIAL']
em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.0
nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
vl = sc.view_layers[0]; vl.material_override = white
pr = CJ['presets'][cam]
tx, ty, tz = pr['target']; T = Vector((tx, -tz, ty)); D = pr['distance']
yaw, pit = math.radians(pr['yawDeg']), math.radians(pr['pitchDeg'])
off = Vector((math.sin(yaw) * math.cos(pit), -math.cos(yaw) * math.cos(pit), math.sin(pit)))
cd = bpy.data.cameras.new('mc'); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(pr['fovDeg']); cd.clip_end = D * 12
co = bpy.data.objects.new('mc', cd); sc.collection.objects.link(co)
co.location = T + off * D; co.rotation_euler = (T - co.location).to_track_quat('-Z', 'Y').to_euler()
sc.camera = co
sc.world = bpy.data.worlds.new('mw'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = 1
sc.render.resolution_x, sc.render.resolution_y = 400, 250; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'
out = os.path.join(OUTD, f'mask-{cam}.png'); sc.render.filepath = out
bpy.ops.render.render(write_still=True)
img = bpy.data.images.load(out); px = np.array(img.pixels[:]).reshape(250, 400, 4)
print('LANDFILL', cam, round(float((px[..., 0] > 0.5).mean()), 3))
