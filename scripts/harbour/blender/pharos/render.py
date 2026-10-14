"""The Pharos of Alexandria - Blender beauty stills (golden hour + night), Cycles GPU.

    blender -b --factory-startup -P scripts/harbour/blender/pharos/render.py -- [--only golden|night] [--samples 96]
            [--out agents/2026-10-13-pharosville-reboot/p6/pharos] [--res 1200x1500]

Look-dev only (no data): the style C kit material (nl_common.build_kit_material, the same maths as the runtime
port), a simple islet + sea, the fire as emissive flame cards with a warm point light, the mirror's beam as a
spot light through a thin mist volume.
"""
import sys, os, math, random
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
sys.path.insert(0, os.path.join(HERE, '..', 'hulls'))
sys.path.insert(0, os.path.join(HERE, '..', 'island'))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector, Euler
import nl_common as nl
import hb_lib
import pharos_geo
from hb_lib import reset_scene, descendants, lin

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
arg = lambda k, d: ARGV[ARGV.index(k) + 1] if k in ARGV else d
ONLY = arg('--only', None)
SAMPLES = int(arg('--samples', '96'))
OUT = os.path.join(ROOT, arg('--out', 'agents/2026-10-13-pharosville-reboot/p6/pharos'))
RES = [int(x) for x in arg('--res', '1200x1500').split('x')]
os.makedirs(OUT, exist_ok=True)

reset_scene()
root, info = pharos_geo.build()
scene = bpy.context.scene

# ------------------------------------------------------------------ materials
kit = nl.build_kit_material()
win = nl.build_glass_material()


def emis(name, col, strength):
    m = nl.new_mat(name); nt = m.node_tree; out = nl.strip(nt)
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (*col, 1); e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    return m


def flame_mat():
    """Flame card: emission from a vertical gradient * noise, transparent edges."""
    m = nl.new_mat('M_flame'); nt = m.node_tree; out = nl.strip(nt)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['UV'], sep.inputs[0])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 4.0; nz.inputs['Detail'].default_value = 3.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    # shape: a tongue = 1 - |u-0.5|*2 / (1 - v), noise-eroded
    sub = nt.nodes.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = 0.5
    nt.links.new(sep.outputs['X'], sub.inputs[0])
    ab = nt.nodes.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; nt.links.new(sub.outputs[0], ab.inputs[0])
    w = nt.nodes.new('ShaderNodeMath'); w.operation = 'MULTIPLY'; w.inputs[1].default_value = 2.0; nt.links.new(ab.outputs[0], w.inputs[0])
    onev = nt.nodes.new('ShaderNodeMath'); onev.operation = 'SUBTRACT'; onev.inputs[0].default_value = 1.02; nt.links.new(sep.outputs['Y'], onev.inputs[1])
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 0.8; nt.links.new(onev.outputs[0], pw.inputs[0])
    dv = nt.nodes.new('ShaderNodeMath'); dv.operation = 'DIVIDE'; nt.links.new(w.outputs[0], dv.inputs[0]); nt.links.new(pw.outputs[0], dv.inputs[1])
    sh = nt.nodes.new('ShaderNodeMath'); sh.operation = 'SUBTRACT'; sh.inputs[0].default_value = 1.0; nt.links.new(dv.outputs[0], sh.inputs[1])
    er = nt.nodes.new('ShaderNodeMath'); er.operation = 'MULTIPLY'; nt.links.new(sh.outputs[0], er.inputs[0]); nt.links.new(nz.outputs['Fac'], er.inputs[1])
    a = nt.nodes.new('ShaderNodeMapRange'); a.inputs['From Min'].default_value = 0.12; a.inputs['From Max'].default_value = 0.45
    nt.links.new(er.outputs[0], a.inputs['Value'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*lin('#FF3A08'), 1); ramp.color_ramp.elements[1].color = (*lin('#FFF0B0'), 1)
    nt.links.new(a.outputs['Result'], ramp.inputs['Fac'])
    e = nt.nodes.new('ShaderNodeEmission'); nt.links.new(ramp.outputs['Color'], e.inputs['Color'])
    st = nt.nodes.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = 60.0; nt.links.new(a.outputs['Result'], st.inputs[0])
    nt.links.new(st.outputs[0], e.inputs['Strength'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(a.outputs['Result'], mx.inputs['Fac']); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(e.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'; m.use_backface_culling = False
    return m


def mirror_mat():
    m = nl.new_mat('M_mirror'); p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*lin('#E7B565'), 1); p.inputs['Metallic'].default_value = 1.0
    p.inputs['Roughness'].default_value = 0.16
    return m


fire = emis('M_ember', lin('#FF8A2A'), 30.0)
mirror = mirror_mat()
for o in descendants(root):
    if o.type != 'MESH':
        continue
    nm = o.data.materials[0].name
    o.data.materials[0] = {'hb_opaque': kit, 'hb_window': win, 'hb_fire': fire, 'hb_mirror': mirror}.get(nm, kit)

# flames: crossed cards over the brazier
fl_mat = flame_mat()
zb = info['Z_GAL'] + 2.3
rng = random.Random(3)
for i in range(7):
    bm = bmesh.new()
    h = 3.4 + rng.random() * 1.8; w = 1.3 + rng.random() * 0.9
    v = [bm.verts.new(p) for p in ((-w / 2, 0, 0), (w / 2, 0, 0), (w / 2, 0, h), (-w / 2, 0, h))]
    f = bm.faces.new(v)
    uv = bm.loops.layers.uv.new()
    for l, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[uv].uv = c
    a = i / 7 * math.pi
    o = nl.obj(f'flame_{i}', bm, mat=fl_mat, loc=(rng.uniform(-0.7, 0.7), rng.uniform(-0.7, 0.7), zb - 0.3), rot=(0, 0, a), shadow=False)

# ------------------------------------------------------------------ islet + sea + world
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=60, y_segments=60, size=70)
for v in bm.verts:
    r = math.hypot(v.co.x * 0.9, v.co.y)
    n = 0.5 + 0.5 * math.sin(math.atan2(v.co.y, v.co.x) * 5 + 1.3) * 0.3
    h = 6.0 * (1 - (r / (62 + 8 * n)) ** 2.5) - 1.0
    v.co.z = max(-6.0, min(h - 9.0 + 9.0, h)) - 9.0 + (0.6 * math.sin(v.co.x * 0.3) * math.cos(v.co.y * 0.27))
islet = nl.obj('islet', bm, color=lin('#A88A62'), pattern=5, mat=kit)
sea_m = nl.new_mat('M_sea'); p = sea_m.node_tree.nodes['Principled BSDF']
p.inputs['Base Color'].default_value = (*lin('#23707E'), 1); p.inputs['Roughness'].default_value = 0.18
p.inputs['Specular IOR Level'].default_value = 0.6
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60000)
sea = nl.obj('sea', bm, mat=sea_m)
sea.location.z = -7.4
# causeway stub (arched) toward the camera side
for i in range(6):
    y = -40 - i * 9.0
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    nl.obj(f'cw_pier_{i}', bm, color=lin('#D9CDB2'), pattern=2, mat=kit, loc=(0, y, -4.2)).scale = (7.0, 2.6, 6.8)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    nl.obj(f'cw_deck_{i}', bm, color=lin('#E2D7BE'), pattern=2, mat=kit, loc=(0, y - 4.5, -0.3)).scale = (7.6, 9.2, 1.4)

world = bpy.data.worlds.new('W'); scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
wt = world.node_tree
tcw = wt.nodes.new('ShaderNodeTexCoord')
sepw = wt.nodes.new('ShaderNodeSeparateXYZ')
mrw = wt.nodes.new('ShaderNodeMapRange'); mrw.inputs['From Min'].default_value = -1.0; mrw.inputs['From Max'].default_value = 1.0
nrm = wt.nodes.new('ShaderNodeVectorMath'); nrm.operation = 'NORMALIZE'; wt.links.new(tcw.outputs['Generated'], nrm.inputs[0])
wt.links.new(nrm.outputs[0], sepw.inputs[0])
wt.links.new(sepw.outputs['Z'], mrw.inputs['Value'])
rampw = wt.nodes.new('ShaderNodeValToRGB'); wt.links.new(mrw.outputs['Result'], rampw.inputs['Fac'])
wt.links.new(rampw.outputs['Color'], bg.inputs['Color'])


def sky_grad(stops):
    els = rampw.color_ramp.elements
    while len(els) > 1:
        els.remove(els[-1])
    els[0].position = stops[0][0]; els[0].color = (*lin(stops[0][1]), 1)
    for pos, col in stops[1:]:
        e = els.new(pos); e.color = (*lin(col), 1)


cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); scene.collection.objects.link(cam); scene.camera = cam
cam_d.lens_unit = 'FOV'


def aim(target, dist, yaw_deg, pitch_deg, fov):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = Vector(target) + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam_d.angle = math.radians(fov)


scene.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dev_type in ('OPTIX', 'CUDA'):
        prefs.compute_device_type = dev_type
        prefs.get_devices()
        if any(d.type == dev_type for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == dev_type
            scene.cycles.device = 'GPU'
            break
except Exception as e:
    print('cycles prefs', e)
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = RES
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'

sun_d = bpy.data.lights.new('sun', 'SUN'); sun = bpy.data.objects.new('sun', sun_d); scene.collection.objects.link(sun)
fire_d = bpy.data.lights.new('firelight', 'POINT'); firel = bpy.data.objects.new('firelight', fire_d); scene.collection.objects.link(firel)
firel.location = (0, 0, info['Z_GAL'] + 5.0); fire_d.color = lin('#FF9A40'); fire_d.shadow_soft_size = 1.6
spot_d = bpy.data.lights.new('beam', 'SPOT'); spot = bpy.data.objects.new('beam', spot_d); scene.collection.objects.link(spot)
spot.location = (0, 0.5, pharos_geo.MIRROR_Z)
spot_d.spot_size = math.radians(7); spot_d.spot_blend = 0.6; spot_d.color = lin('#FFC774'); spot_d.shadow_soft_size = 1.2
BEAM_AZ = math.radians(-128)          # beam heading in the frame (toward screen-left, out to sea)
spot.rotation_euler = Euler((math.radians(90 - 2.0), 0, BEAM_AZ))
mist_m = nl.new_mat('M_mist'); nt = mist_m.node_tree; out = nl.strip(nt)
vol = nt.nodes.new('ShaderNodeVolumePrincipled'); vol.inputs['Density'].default_value = 0.0
nt.links.new(vol.outputs[0], out.inputs['Volume'])
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
mist = nl.obj('mist', bm, mat=mist_m, shadow=False); mist.scale = (900, 900, 220); mist.location = (0, 0, 100)

SHOTS = {
    'golden': dict(sun=(11.0, 250.0), sun_col='#FFB878', sun_k=5.5, sky=[(0.0, '#C9B6A6'), (0.5, '#F3C9A2'), (0.56, '#E9C3A8'), (0.75, '#9FB3CF'), (1.0, '#6F8FBF')], sky_k=0.8, fire=9e4, spot=0, mist=0.0, win=0.0,
                   cam=((0, -10, 46), 270, 32, 18, 30)),
    'night': dict(sun=(34.0, 120.0), sun_col='#9DB4E8', sun_k=1.2, sky=[(0.0, '#0A1222'), (0.5, '#22345A'), (0.6, '#142443'), (1.0, '#060B18')], sky_k=0.5, fire=3.5e5, spot=5e7, mist=0.00035, win=2.0,
                  cam=((0, -10, 46), 270, 32, 18, 30)),
    # look-dev close-ups (only with --only)
    'statue': dict(sun=(18.0, 250.0), sun_col='#FFC890', sun_k=5.0, sky=[(0.0, '#C9B6A6'), (0.5, '#F3C9A2'), (0.75, '#9FB3CF'), (1.0, '#6F8FBF')], sky_k=0.35, fire=9e4, spot=0, mist=0.0, win=0.0,
                   cam=((0, 0, 99), 40, 32, 12, 30)),
    'base': dict(sun=(18.0, 250.0), sun_col='#FFC890', sun_k=5.0, sky=[(0.0, '#C9B6A6'), (0.5, '#F3C9A2'), (0.75, '#9FB3CF'), (1.0, '#6F8FBF')], sky_k=0.8, fire=9e4, spot=0, mist=0.0, win=0.0,
                 cam=((0, -26, 8), 70, 25, 18, 30)),
    'lantern': dict(sun=(34.0, 120.0), sun_col='#9DB4E8', sun_k=1.2, sky=[(0.0, '#0A1222'), (0.5, '#22345A'), (1.0, '#060B18')], sky_k=0.5, fire=3.5e5, spot=0, mist=0.0, win=2.0,
                    cam=((0, 0, 92), 60, 32, 14, 30)),
}
for name, s in SHOTS.items():
    if (ONLY and name not in ONLY.split(',')) or (not ONLY and name in ('statue', 'lantern', 'base')):
        continue
    el, az = math.radians(s['sun'][0]), math.radians(s['sun'][1])
    sun.rotation_euler = Vector((-math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), -math.sin(el))).to_track_quat('-Z', 'Y').to_euler()
    sun_d.color = lin(s['sun_col']); sun_d.energy = s['sun_k']; sun_d.angle = math.radians(1.0)
    sky_grad(s['sky'])
    bg.inputs['Strength'].default_value = s['sky_k']
    fire_d.energy = s['fire']
    spot_d.energy = s['spot']; spot.hide_render = s['spot'] == 0
    vol.inputs['Density'].default_value = s['mist']; mist.hide_render = s['mist'] == 0
    vol.inputs['Color'].default_value = (*lin('#C9D4E6'), 1)
    nodes = win.node_tree.nodes
    for n in nodes:
        if n.label == 'WIN_K':
            n.outputs[0].default_value = s['win']
    aim(*s['cam'])
    scene.cycles.samples = SAMPLES
    scene.render.filepath = os.path.join(OUT, f'pharos-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', scene.render.filepath)
