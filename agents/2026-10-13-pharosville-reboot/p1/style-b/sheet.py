"""Asset review sheet: kit pieces on a turf/sea board, same camera pitch/yaw + materials as the block.

    blender -b --factory-startup -P sheet.py -- [--set land|hulls] [--state golden|night]
"""
import bpy, bmesh, math, os, sys, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
for m in ('lib', 'mats', 'kit', 'hulls', 'states'):
    sys.modules.pop(m, None)
from mathutils import Vector, Matrix
from lib import *
import mats, kit, hulls

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SET = ARGV[ARGV.index('--set') + 1] if '--set' in ARGV else 'land'
STATE = ARGV[ARGV.index('--state') + 1] if '--state' in ARGV else 'golden'
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene

# board: turf on the left half, sea on the right
k = Kit('board')
k.box((90, 140, 1.0), (-30, 0, -0.5), P['grass'], 'ground', uv=None)
board = k.finish(outline=False)
sea = Kit('seaboard')
sea.box((140, 140, 0.2), (45, 0, -0.1), lin('#5F8FA6'), 'wash', uv=None)
sea.finish(outline=False)

obs = []
if SET == 'land':
    lh = kit.lighthouse(); lh.location = (-40, 20, 0); obs.append(lh)
    c = kit.keeper_cottage(); c.location = (-38, -2, 0)
    o = kit.oil_store(); o.location = (-52, 2, 0)
    m = kit.signal_mast(); m.location = (-25, 22, 0)
    for i, (w, d, fl, roof, wall, rc, sh, ex) in enumerate([
            (7.5, 6.5, 2, 'gable', P['plaster_cream'], P['roof_terra'], P['shutter_sage'], dict(balcony=True)),
            (6.0, 7.0, 3, 'gable', P['plaster_ochre'], P['roof_rust'], P['shutter_blue'], dict(quoins=True, dormer=True)),
            (9.0, 6.5, 2, 'hip', P['plaster_rose'], P['roof_terra'], P['shutter_ox'], dict(awning=lin('#7C9A8E'))),
            (7.0, 5.5, 1, 'gable', P['plaster_blue'], P['roof_slate'], P['shutter_sage'], dict(lean_to=True)),
            (6.5, 6.0, 2, 'gable', P['plaster_straw'], P['roof_ochre'], P['shutter_blue'], dict(ext_stair=True))]):
        h = kit.house(f'house_{i}', w, d, fl, roof, wall, rc, sh, seed=i, **ex)
        h.location = (-12 + (i % 3) * 13, -30 + (i // 3) * 16, 0)
    t = kit.tree_round('tree', 1.0, 3); t.location = (-50, -25, 0)
    t = kit.tree_cypress('cyp', 1.0, 4); t.location = (-45, -32, 0)
    s = kit.shrub('shrub', 1.0, 5); s.location = (-52, -34, 0)
    lp = kit.lamp_post(); lp.location = (-30, -20, 0)
    b = kit.beacon(); b.location = (25, 30, 0)
    q = kit.quay_block('quay', 16, 5, steps=True); q.location = (10, -10, 0); q.rotation_euler.z = math.pi / 2
    pm = kit.pier_module('pier_main', 5, 6); pm.location = (22, -10, 0)
    pf = kit.pier_module('pier_finger', 1.8, 6, brace=False); pf.location = (28, -10, 0)
    for i in range(3):
        bo = kit.bollard(); bo.location = (12.5, -16 + i * 4, 2.2)
    cr = kit.crate(); cr.location = (-30, -14, 0)
    ba = kit.barrel(); ba.location = (-28, -15, 0)
    nr = kit.net_rack(); nr.location = (-34, -10, 0)
    dg = kit.dinghy(); dg.location = (-38, -16, 0.3)
    target = Vector((-18, -4, 6)); dist = 135
else:
    specs = [('ship', 26, True, lin('#26A17B'), 0), ('schooner', 18, True, lin('#2775CA'), 1),
             ('brig', 18, True, lin('#C8A24A'), 4), ('botter', 13, True, lin('#3B5BA9'), 3),
             ('sloop', 10, True, lin('#E9A23B'), 2), ('sloop', 13, False, lin('#2B2B2B'), 6),
             ('botter', 10, False, lin('#4B6CB7'), 5)]
    for i, (fam, L_, dock, br, em) in enumerate(specs):
        h = hulls.hull(f'{fam}_{i}', fam, L_, dock, br, em, seed=i, tack=1)
        h.location = (20 + (i % 4) * 0 + (i // 4) * 34, -55 + (i % 4) * 30 + (i // 4) * 12, 0)
        h.rotation_euler.z = math.radians(90)
        if not dock:
            h.rotation_euler = (math.radians(9), 0, math.radians(70))
        print(fam, L_, 'tris', sum(len(p.vertices) - 2 for p in h.data.polygons))
    target = Vector((36, -10, 5)); dist = 150

# outlines
ink = mats.get('ink')
for ob in scene.objects:
    if ob.type == 'MESH' and ob.get('outline', 0):
        me = ob.data
        if ink.name not in [m.name for m in me.materials]:
            me.materials.append(ink)
        idx = [m.name for m in me.materials].index(ink.name)
        mod = ob.modifiers.new('ink', 'SOLIDIFY')
        mod.thickness = -2 * math.tan(math.radians(12.5)) * dist / 1000 * 1.15
        mod.offset = -1; mod.use_flip_normals = True; mod.use_rim = False; mod.material_offset = idx
mpp = 2 * math.tan(math.radians(12.5)) * dist / 1000

# light + world
ld = bpy.data.lights.new('sun', 'SUN'); sun = bpy.data.objects.new('sun', ld); scene.collection.objects.link(sun)
import states
if STATE == 'golden':
    L = states.sun_vec(-38, 13); ld.energy = 4.2; ld.color = lin('#FFC690'); ld.angle = math.radians(3)
    mats.set_state(shadow_tint=lin('#8E86B4'), ramp_lo=0.16, ramp_hi=0.5, lvl_shadow=0.62, lvl_lit=1.02, lin_k=0.08,
                   hatch_k=0.32, gran_k=0.32, pool_k=0.35, sun_dir=tuple(L), spec_col=lin('#FFE2B0'),
                   lantern_e=2.0, hatch_sp=mpp * 4.2, detail=1.0)
    amb = lin('#9C9BB8')
else:
    L = states.sun_vec(-40, 40); ld.energy = 0.9; ld.color = lin('#9DB0F0')
    mats.set_state(shadow_tint=lin('#3C4380'), ink=lin('#1B1930'), ramp_lo=0.05, ramp_hi=0.22, lvl_shadow=0.22, lvl_lit=0.45,
                   lin_k=0.25, hatch_k=0.2, win_e=9.0, lamp_e=18.0, lantern_e=40.0, riding_e=30.0, sun_dir=tuple(L),
                   hatch_sp=mpp * 4.2, detail=1.0, cover_tone=0.85)
    amb = lin('#2E3768')
sun.rotation_euler = (-L).to_track_quat('-Z', 'Y').to_euler()
wt = bpy.data.worlds.new('W'); scene.world = wt
wt.use_nodes = True
wt.node_tree.nodes['Background'].inputs['Color'].default_value = (*amb, 1)

cd = bpy.data.cameras.new('c'); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(25); cd.clip_end = 3000
cam = bpy.data.objects.new('cam', cd); scene.collection.objects.link(cam)
fwd = Vector((1, 1, 0)).normalized(); P35 = math.radians(35)
back = Vector((-fwd.x * math.cos(P35), -fwd.y * math.cos(P35), math.sin(P35)))
cam.location = target + back * dist
cam.rotation_euler = (-back).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.taa_render_samples = 32
scene.eevee.use_shadows = True; scene.eevee.use_raytracing = True; scene.eevee.use_fast_gi = True
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.view_settings.view_transform = 'Standard'
vl = scene.view_layers[0]; vl.use_pass_z = True; vl.use_pass_normal = True
a = vl.aovs.add(); a.name = 'inkmask'; a.type = 'VALUE'
scene.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'
scene.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
scene.render.image_settings.color_depth = '16'
out = os.path.join(HERE, 'work', f'sheet-{SET}-{STATE}.exr')
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print('SHEET', out)
