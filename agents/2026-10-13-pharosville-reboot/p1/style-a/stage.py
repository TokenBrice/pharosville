"""World (sky + ambient), lights, camera rig, render + compositor, time-of-day states."""
import bpy, math
from mathutils import Vector
from lib import *
from shading import set_global, LOOK

YAW = math.radians(45)     # camera looks toward +x+y
PITCH = math.radians(35)
VFOV = math.radians(25)
FWD = Vector((math.cos(YAW), math.sin(YAW), 0))


def camera(name, target, dist, coll_, shift_y=0.0, dof=None):
    cd = bpy.data.cameras.new(name)
    cd.sensor_fit = 'VERTICAL'; cd.angle = VFOV
    cd.clip_start = 0.5; cd.clip_end = 5000
    cd.shift_y = shift_y
    ob = bpy.data.objects.new(name, cd); coll_.objects.link(ob)
    back = Vector((-math.cos(PITCH) * FWD.x, -math.cos(PITCH) * FWD.y, math.sin(PITCH)))
    ob.location = Vector(target) + back * dist
    ob.rotation_euler = (-back).to_track_quat('-Z', 'Y').to_euler()
    if dof:
        cd.dof.use_dof = True
        cd.dof.focus_distance = dist
        cd.dof.aperture_fstop = dof
    return ob


def build_world():
    wt = bpy.data.worlds.new('W'); bpy.context.scene.world = wt
    try:
        wt.use_nodes = True
    except Exception:
        pass
    nt = wt.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_WORLD':
            nt.nodes.remove(n)
    o = nt.nodes['World Output']
    tc = N(nt, 'ShaderNodeTexCoord')
    D = vm(nt, 'NORMALIZE', tc.outputs['Generated'])
    dx, dy, dz = sep(nt, D)
    # ---- lighting dome (what surfaces see): sky-ambient above, warm bounce below
    up = mr(nt, dz, -0.3, 0.6)
    amb = mixc_n(nt, up, rgbn(nt, (0.5, 0.4, 0.3), 'AMB_GROUND'), rgbn(nt, (0.6, 0.6, 0.9), 'AMB_SKY'))
    ambk = valn(nt, 1.0, 'AMB_K')
    amb = vm(nt, 'SCALE', amb, scale=ambk)
    # ---- painted sky (what the camera sees past the curved sea edge): keyed to elevation band
    elev = fm(nt, 'ARCSINE', dz)
    lo = valn(nt, math.radians(-26), 'E_LO'); hi = valn(nt, math.radians(-8), 'E_HI')
    t = mr(nt, elev, lo, hi, 0.0, 1.0, smooth=False)
    ramp = N(nt, 'ShaderNodeValToRGB', name='SKY_RAMP'); Lk(nt, t, ramp.inputs['Fac'])
    sky = ramp.outputs['Color']
    # sun / moon glow
    gd = N(nt, 'ShaderNodeCombineXYZ', name='GLOW_DIR'); gd.inputs[0].default_value = 1.0
    cosang = vm(nt, 'DOT_PRODUCT', D, vm(nt, 'NORMALIZE', gd.outputs[0]))
    ang = fm(nt, 'ARCCOSINE', fm(nt, 'MINIMUM', cosang, 1.0))
    halo = fm(nt, 'POWER', mr(nt, ang, valn(nt, 0.5, 'HALO_R'), 0.0, 0.0, 1.0, smooth=False), 2.2)
    disc = mr(nt, ang, valn(nt, 0.016, 'DISC_R'), fm(nt, 'MULTIPLY', valn(nt, 0.016, 'DISC_R2'), 0.8))
    gcol = rgbn(nt, (1, 0.9, 0.7), 'GLOW_COL')
    gk = valn(nt, 1.0, 'GLOW_K'); dk = valn(nt, 3.0, 'DISC_K')
    sky = vm(nt, 'ADD', sky, vm(nt, 'SCALE', gcol, scale=fm(nt, 'ADD', fm(nt, 'MULTIPLY', halo, gk), fm(nt, 'MULTIPLY', disc, dk))))
    # stars (night), twinkle density rising with elevation band
    vs = voro(nt, vm(nt, 'SCALE', D, scale=380.0), 1.0, 'F1', '3D')
    star = fm(nt, 'MULTIPLY', mr(nt, vs.outputs['Distance'], 0.07, 0.02), mr(nt, t, 0.15, 0.8))
    sc_ = N(nt, 'ShaderNodeRGBToBW'); Lk(nt, vs.outputs['Color'], sc_.inputs[0])
    star = fm(nt, 'MULTIPLY', star, fm(nt, 'GREATER_THAN', sc_.outputs[0], 0.55))
    star = fm(nt, 'MULTIPLY', star, valn(nt, 0.0, 'STAR_K'))
    sky = vm(nt, 'ADD', sky, vm(nt, 'SCALE', (1.0, 0.95, 0.85), scale=star))
    # soft painted cloud wisps (high cirrus band)
    cn = noise_t(nt, vm(nt, 'MULTIPLY', D, (3.0, 3.0, 14.0)), 2.2, 4.0, 0.55)
    wisp = fm(nt, 'MULTIPLY', mr(nt, cn.outputs['Fac'], 0.52, 0.72), mr(nt, t, 0.25, 0.9))
    wisp = fm(nt, 'MULTIPLY', wisp, valn(nt, 0.0, 'WISP_K'))
    sky = mixc_n(nt, wisp, sky, rgbn(nt, (1, 0.9, 0.85), 'WISP_COL'))
    lp = N(nt, 'ShaderNodeLightPath')
    col = mixc_n(nt, lp.outputs['Is Camera Ray'], amb, sky)
    bg = N(nt, 'ShaderNodeBackground'); Lk(nt, col, bg.inputs['Color'])
    Lk(nt, bg.outputs[0], o.inputs['Surface'])
    LOOK['world'] = nt
    return nt


def add_light(name, kind, coll_, loc=(0, 0, 0), **kw):
    ld = bpy.data.lights.new(name, kind)
    for k, v in kw.items():
        setattr(ld, k, v)
    ob = bpy.data.objects.new(name, ld); coll_.objects.link(ob)
    ob.location = loc
    return ob


def aim(ob, az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    ob.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    return d


def render_setup(res=(1600, 1000), samples=64):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.engine = 'BLENDER_EEVEE'
    ee = sc.eevee
    ee.taa_render_samples = samples
    ee.use_raytracing = True
    ee.ray_tracing_method = 'SCREEN'
    ee.use_shadows = True
    ee.shadow_ray_count = 2
    ee.shadow_step_count = 10
    ee.shadow_resolution_scale = 1.0
    ee.use_fast_gi = True
    try:
        ee.shadow_pool_size = '1024'
    except Exception:
        pass
    sc.render.film_transparent = False
    sc.render.filter_size = 1.2
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Punchy'
    sc.view_settings.exposure = 0.0
    # compositor: bloom + gentle vignette + split-tone grade (all LUT/post-portable)
    cng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree')
    sc.compositing_node_group = cng
    cng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = cng.nodes.new('CompositorNodeRLayers')
    gl = cng.nodes.new('CompositorNodeGlare'); gl.name = 'BLOOM'
    gl.inputs['Type'].default_value = 'Bloom'
    try:
        gl.inputs['Quality'].default_value = 'High'
    except Exception:
        pass
    go = cng.nodes.new('NodeGroupOutput')
    bpy.context.view_layer.use_pass_z = True
    # depth fog (aerial perspective), sky excluded
    mrn = cng.nodes.new('ShaderNodeMapRange'); mrn.clamp = True; mrn.name = 'FOG_RANGE'
    mrn.inputs['From Min'].default_value = 230.0; mrn.inputs['From Max'].default_value = 600.0
    cng.links.new(rl.outputs['Depth'], mrn.inputs['Value'])
    sky = cng.nodes.new('ShaderNodeMath'); sky.operation = 'LESS_THAN'; sky.inputs[1].default_value = 4000.0
    cng.links.new(rl.outputs['Depth'], sky.inputs[0])
    f1 = cng.nodes.new('ShaderNodeMath'); f1.operation = 'MULTIPLY'
    cng.links.new(mrn.outputs['Result'], f1.inputs[0]); cng.links.new(sky.outputs[0], f1.inputs[1])
    fk = cng.nodes.new('ShaderNodeMath'); fk.operation = 'MULTIPLY'; fk.name = 'FOG_K'; fk.inputs[1].default_value = 0.0
    cng.links.new(f1.outputs[0], fk.inputs[0])
    fogc = cng.nodes.new('CompositorNodeRGB'); fogc.name = 'FOG_COL'
    mx = cng.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    cng.links.new(fk.outputs[0], mx.inputs[0]); cng.links.new(rl.outputs['Image'], mx.inputs[6]); cng.links.new(fogc.outputs[0], mx.inputs[7])
    cng.links.new(mx.outputs[2], gl.inputs['Image'])
    # split-tone grade (lift cool / gain warm): a 3D LUT at runtime
    cb = cng.nodes.new('CompositorNodeColorBalance'); cb.name = 'GRADE'
    cng.links.new(gl.outputs['Image'], cb.inputs['Image'])
    # soft vignette
    em = cng.nodes.new('CompositorNodeEllipseMask')
    em.inputs['Size'].default_value = (0.92, 0.88)
    bl = cng.nodes.new('CompositorNodeBlur'); bl.inputs['Size'].default_value = (220, 220)
    cng.links.new(em.outputs['Mask'], bl.inputs['Image'])
    vg = cng.nodes.new('ShaderNodeMix'); vg.data_type = 'RGBA'; vg.blend_type = 'MULTIPLY'; vg.name = 'VIGNETTE'
    vg.inputs[0].default_value = 0.0
    vmr = cng.nodes.new('ShaderNodeMapRange'); vmr.inputs['To Min'].default_value = 0.78; vmr.inputs['To Max'].default_value = 1.0
    cng.links.new(bl.outputs['Image'], vmr.inputs['Value'])
    cmb = cng.nodes.new('CompositorNodeCombineColor') if hasattr(bpy.types, 'CompositorNodeCombineColor') else None
    cng.links.new(cb.outputs['Image'], vg.inputs[6])
    if cmb:
        for i in range(3):
            cng.links.new(vmr.outputs['Result'], cmb.inputs[i])
        cng.links.new(cmb.outputs[0], vg.inputs[7])
        vg.inputs[0].default_value = 1.0
    cng.links.new(vg.outputs[2], go.inputs[0])
    LOOK['comp'] = cng
    sc.render.use_compositing = True
    LOOK['bloom'] = gl
    return sc
