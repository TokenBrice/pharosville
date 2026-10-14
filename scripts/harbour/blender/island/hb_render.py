"""The Harbour v2 - key-art render pass (exec'd after hb_scene). Golden / night / noon x heart / overview."""
set_coll(ROOTC)
BOAT_CONTACT = globals().get('BOAT_CONTACT', [])
WAKES = globals().get('WAKES', [])
SDF_IMG = build_sea_image(BOAT_CONTACT, WAKES)
build_water(SDF_IMG)
sea = obj('sea', (lambda b: (bmesh.ops.create_grid(b, x_segments=1, y_segments=1, size=2600), b)[1])(bmesh.new()),
          mat=M['sea'], shadow=False, family='sea')
build_sky()
set_coll(ROOTC)

# ------------------------------------------------------------------ lights
sun = add_light('key_sun', 'SUN', angle=math.radians(0.6))
fill = add_light('fill_sun', 'SUN', angle=math.radians(10)); fill.data.use_shadow = False
LAMP_PTS = globals().get('LAMP_PTS', [])
lamp_lights = [add_light(f'lamp_light_{i}', 'POINT', loc=tuple(p), shadow_soft_size=0.15, color=PAL['sodium']) for i, p in enumerate(LAMP_PTS)]
WIN_SPILL = globals().get('WIN_SPILL', [])
win_lights = [add_light(f'win_{i}', 'POINT', loc=tuple(p), shadow_soft_size=0.8, color=PAL['sodium']) for i, p in enumerate(WIN_SPILL)]
LH_LAMP = globals().get('LH_LAMP', Vector((214, 150, 44)))
lh_light = add_light('pharos_light', 'POINT', loc=LH_LAMP, shadow_soft_size=0.3, color=PAL['lantern'])
hl_light = add_light('harbour_light', 'POINT', loc=HL_POS, shadow_soft_size=0.2, color=lin('#FF5A3C'))


def build_beam_mat():
    m = new_mat('M_beam'); nt = m.node_tree; out = strip(nt)
    tc = node(nt, 'ShaderNodeTexCoord'); geo = node(nt, 'ShaderNodeNewGeometry')
    ox, oy, oz = sep(nt, tc.outputs['Object'])
    along = (1.0 - (ox / 420.0).clamp()).pow(1.5)
    near = ox.sstep(1.0, 12.0)
    lw = node(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    fac = 1.0 - SX(nt, lw.outputs['Facing'])
    core = fac.pow(6.0) * 0.75 + fac.pow(2.0) * 0.25
    mist = noise3(nt, vscale(nt, geo.outputs['Position'], 0.03, 0.03, 0.08), 1.0, 3.0).sstep(0.3, 0.75) * 0.7 + 0.45
    s = along * near * core * mist * C(nt, 0.0, 'BEAM_K')
    e = node(nt, 'ShaderNodeEmission'); e.inputs['Color'].default_value = (*PAL['lantern'], 1)
    link(nt, s, e.inputs['Strength'])
    tr = node(nt, 'ShaderNodeBsdfTransparent'); ad = node(nt, 'ShaderNodeAddShader')
    nt.links.new(tr.outputs[0], ad.inputs[0]); nt.links.new(e.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'; m.use_backface_culling = False
    M['beam'] = m
    m = new_mat('M_halo'); nt = m.node_tree; out = strip(nt)
    lw = node(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    g = (1.0 - SX(nt, lw.outputs['Facing'])).pow(4.0)
    e = node(nt, 'ShaderNodeEmission'); e.inputs['Color'].default_value = (*PAL['lantern'], 1)
    link(nt, g * C(nt, 0.0, 'HALO_K'), e.inputs['Strength'])
    tr = node(nt, 'ShaderNodeBsdfTransparent'); ad = node(nt, 'ShaderNodeAddShader')
    nt.links.new(tr.outputs[0], ad.inputs[0]); nt.links.new(e.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'
    M['halo'] = m


build_beam_mat()
BEAMS = []
BEAM_AZ = (math.radians(196), math.radians(16))         # one panel sweeping the bay toward the camera, one out to sea
for k, a in enumerate(BEAM_AZ):
    bm = bm_cyl(0.7, 20.0, 420.0, 32, (0, 0, 0), cap=False)
    xf(bm, ry=math.pi / 2)
    b = obj(f'pharos_beam_{k}', bm, mat=M['beam'], loc=tuple(LH_LAMP), rot=(0, math.radians(2.6), a), shadow=False, family='beam')
    b.visible_diffuse = False
    BEAMS.append(b)
halo = obj('pharos_halo', bm_sphere(3.0, tuple(LH_LAMP), 24, 12), mat=M['halo'], shadow=False, smooth=True, family='beam')
halo.visible_diffuse = False
BEAMS.append(halo)


def build_pillar_mat():
    m = new_mat('M_pillar'); nt = m.node_tree; out = strip(nt)
    uv = node(nt, 'ShaderNodeUVMap')
    u, v, _ = sep(nt, uv.outputs['UV'])
    geo = node(nt, 'ShaderNodeNewGeometry')
    br = noise3(nt, vscale(nt, geo.outputs['Position'], 1.2, 1.2, 1.0), 1.0, 2.0).sstep(0.45, 0.62)
    across = 1.0 - ((u - 0.5).abs() * 2.0).sstep(0.2, 1.0)
    fall = (1.0 - v).pow(1.5)
    s = across * fall * br * C(nt, 0.0, 'PILLAR_K')
    e = node(nt, 'ShaderNodeEmission'); e.inputs['Color'].default_value = (*PAL['sodium'], 1)
    link(nt, s, e.inputs['Strength'])
    tr = node(nt, 'ShaderNodeBsdfTransparent'); ad = node(nt, 'ShaderNodeAddShader')
    nt.links.new(tr.outputs[0], ad.inputs[0]); nt.links.new(e.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'
    M['pillar'] = m


build_pillar_mat()
PILLARS = []


def pillar(name, src, length_, width):
    d = -FWD; side = Vector((-d.y, d.x, 0))
    p0 = Vector((src[0], src[1], 0.05))
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(p0 - side * width / 2), bm.verts.new(p0 + side * width / 2),
          bm.verts.new(p0 + side * width / 2 + d * length_), bm.verts.new(p0 - side * width / 2 + d * length_)]
    f = bm.faces.new(vs)
    for lp, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        lp[uvl].uv = uv
    ob = obj(name, bm, mat=M['pillar'], shadow=False, family='fx')
    ob.visible_diffuse = False
    PILLARS.append(ob)


for i, p in enumerate(LAMP_PTS):
    if globals().get('ground_z') and ground_z(p[0] + 4, p[1] - 4) < 0:      # only lamps standing over water / at the edge
        pillar(f'pillar_{i}', p, 14.0, 1.4)
pillar('pillar_harbour_light', HL_POS, 22.0, 2.4)

mm = new_mat('M_mist'); ntm = mm.node_tree; outm = strip(ntm)
gm = node(ntm, 'ShaderNodeNewGeometry')
_, _, mz_ = sep(ntm, gm.outputs['Position'])
mn = noise3(ntm, vscale(ntm, gm.outputs['Position'], 0.02, 0.02, 0.06), 1.0, 2.0)
dens = (1.0 - mz_.sstep(0.0, 40.0)) * (mn.sstep(0.35, 0.7) * 0.7 + 0.3) * C(ntm, 0.0, 'MIST_K')
pv = node(ntm, 'ShaderNodeVolumePrincipled'); pv.inputs['Color'].default_value = (*lin('#9FB0D8'), 1)
pv.inputs['Anisotropy'].default_value = 0.55
link(ntm, dens, pv.inputs['Density'])
ntm.links.new(pv.outputs[0], outm.inputs['Volume'])
M['mist'] = mm
_cx = [p[0] for p in CJ['coast']]; _cy = [p[1] for p in CJ['coast']]
mist_box = obj('sea_mist', bm_box2(min(_cx) - 120, min(_cy) - 120, -0.5, max(_cx) + 120, max(_cy) + 120, 70), mat=mm, shadow=False, family='fx')
spot = add_light('pharos_spot', 'SPOT', loc=tuple(LH_LAMP), color=PAL['lantern'], spot_size=math.radians(5.5), spot_blend=0.6,
                 shadow_soft_size=0.2)
_bz = BEAM_AZ[0]
_bd = Vector((math.cos(_bz) * math.cos(math.radians(2.6)), math.sin(_bz) * math.cos(math.radians(2.6)), -math.sin(math.radians(2.6))))
spot.rotation_euler = _bd.to_track_quat('-Z', 'Y').to_euler()
spot.data.use_shadow = False; spot.data.volume_factor = 1.0; spot.data.diffuse_factor = 0.0; spot.data.specular_factor = 0.0

CAMS_OB = {name: make_cam(name, pr) for name, pr in CJ['presets'].items()}

# key art: the mainland across the sound sits in aerial perspective (the runtime's fog does this for the exported node)
shk = M['kit'].copy(); shk.name = 'M_shakkei'; M['shakkei'] = shk
snt = shk.node_tree; sp_ = snt.nodes['Principled BSDF']
src = sp_.inputs['Base Color'].links[0].from_socket
hzn = snt.nodes.new('ShaderNodeRGB'); hzn.name = 'SHK_HAZE'
kn = snt.nodes.new('ShaderNodeValue'); kn.name = 'SHK_K'; kn.outputs[0].default_value = 0.55
mx_ = snt.nodes.new('ShaderNodeMix'); mx_.data_type = 'RGBA'
snt.links.new(kn.outputs[0], sock(mx_, 'Factor_Float')); snt.links.new(src, sock(mx_, 'A_Color')); snt.links.new(hzn.outputs[0], sock(mx_, 'B_Color'))
snt.links.new(sock(mx_, 'Result_Color', out=True), sp_.inputs['Base Color'])
snt.links.new(hzn.outputs[0], sp_.inputs['Emission Color'])
ek = snt.nodes.new('ShaderNodeValue'); ek.name = 'SHK_E'; ek.outputs[0].default_value = 0.35
snt.links.new(ek.outputs[0], sp_.inputs['Emission Strength'])
for ob in bpy.data.collections['shakkei'].objects if 'shakkei' in bpy.data.collections else []:
    if ob.type == 'MESH':
        ob.data.materials.clear(); ob.data.materials.append(shk)

# ------------------------------------------------------------------ world, render settings, compositor
wt = bpy.data.worlds.new('W'); scene.world = wt
try:
    wt.use_nodes = True
except Exception:
    pass
wnt = wt.node_tree; wbg = wnt.nodes['Background']
wtc = node(wnt, 'ShaderNodeTexCoord')
_, _, wz_ = sep(wnt, wtc.outputs['Generated'])
wramp = node(wnt, 'ShaderNodeValToRGB', name='WORLD_RAMP'); link(wnt, wz_.lmap(-0.1, 0.9, 0, 1), wramp.inputs['Fac'])
link(wnt, wramp.outputs['Color'], wbg.inputs['Color'])
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.render.resolution_percentage = PCT
scene.render.engine = 'BLENDER_EEVEE'
ee = scene.eevee
ee.taa_render_samples = SAMPLES
ee.use_raytracing = True; ee.ray_tracing_method = 'SCREEN'
ee.use_shadows = True; ee.shadow_ray_count = 2; ee.shadow_step_count = 10
ee.use_fast_gi = True; ee.fast_gi_distance = 14.0
ee.volumetric_end = 1600.0; ee.volumetric_tile_size = '4'; ee.volumetric_samples = 96; ee.use_volumetric_shadows = False
ee.shadow_resolution_scale = 1.0
try:
    ee.shadow_pool_size = '1024'
except Exception:
    pass
try:
    ee.ray_tracing_options.resolution_scale = '1'; ee.ray_tracing_options.screen_trace_quality = 0.6
except Exception:
    pass
scene.view_settings.view_transform = 'AgX'
try:
    scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass
cng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree')
scene.compositing_node_group = cng
cng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
rl = cng.nodes.new('CompositorNodeRLayers')
gl = cng.nodes.new('CompositorNodeGlare'); gl.inputs['Type'].default_value = 'Bloom'
try:
    gl.inputs['Quality'].default_value = 'High'
except Exception:
    pass
cb = cng.nodes.new('CompositorNodeColorBalance')
try:
    cb.inputs['Type'].default_value = 'Lift/Gamma/Gain'
except Exception:
    pass
em = cng.nodes.new('CompositorNodeEllipseMask'); em.inputs['Size'].default_value = (0.94, 0.9)
bl = cng.nodes.new('CompositorNodeBlur'); bl.inputs['Size'].default_value = (260, 260)
vmix = cng.nodes.new('ShaderNodeMix'); vmix.data_type = 'RGBA'
go = cng.nodes.new('NodeGroupOutput')
hs = cng.nodes.new('CompositorNodeHueSat'); hs.inputs['Saturation'].default_value = 1.1
# aerial perspective: mist pass -> haze colour (per state), before the grade
scene.view_layers[0].use_pass_mist = True
wt.mist_settings.falloff = 'QUADRATIC'
mr_ = cng.nodes.new('ShaderNodeMapRange'); mr_.inputs['To Max'].default_value = 0.3
hz_mix = cng.nodes.new('ShaderNodeMix'); hz_mix.data_type = 'RGBA'
cng.links.new(rl.outputs['Mist'], mr_.inputs['Value'])
cng.links.new(mr_.outputs['Result'], sock(hz_mix, 'Factor_Float'))
cng.links.new(rl.outputs['Image'], sock(hz_mix, 'A_Color'))
cng.links.new(sock(hz_mix, 'Result_Color', out=True), gl.inputs['Image'])
cng.links.new(gl.outputs['Image'], hs.inputs['Image'])
cng.links.new(hs.outputs['Image'], cb.inputs['Image'])
cng.links.new(em.outputs['Mask'], bl.inputs['Image'])
vm_ = cng.nodes.new('ShaderNodeMapRange'); vm_.inputs['To Min'].default_value = 0.86
cng.links.new(bl.outputs['Image'], vm_.inputs['Value'])
sock(vmix, 'A_Color').default_value = (0.0, 0.0, 0.0, 1.0)
cng.links.new(cb.outputs['Image'], sock(vmix, 'B_Color'))
cng.links.new(vm_.outputs['Result'], sock(vmix, 'Factor_Float'))
cng.links.new(sock(vmix, 'Result_Color', out=True), go.inputs[0])
scene.render.use_compositing = True


def set_cb(lift, gamma, gain):
    for nm_, v in (('Lift', lift), ('Gamma', gamma), ('Gain', gain)):
        for s in cb.inputs:
            if s.name == nm_ and s.enabled and s.type == 'RGBA':
                s.default_value = (*v, 1)


def setv(mat, key, v):
    mm = M.get(mat) or bpy.data.materials.get(mat)
    n = mm.node_tree.nodes.get(key) if mm is not None else None
    if n is None:
        return
    if n.type == 'VALUE':
        n.outputs[0].default_value = v
    elif n.type == 'RGB':
        n.outputs[0].default_value = (*v[:3], 1)


def aim_dir(ob, d):
    ob.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


HOURS = dict(golden=18.5, night=22.0, noon=12.0)
STATE = {
    'golden': dict(sun=(5.4, '#FFA257'), min_el=8.0, fill=(0.3, '#7F98D6'), world=[(0, '#C9A89A'), (0.3, '#8C9AC0'), (1, '#5470A6')], world_k=0.62,
                   sky=[(0, '#D8B5A6'), (0.03, '#FFE3B8'), (0.09, '#FFC892'), (0.24, '#EBA88E'), (0.48, '#B98F9E'), (0.78, '#7C82B0'), (1, '#55689C')],
                   glow=('#FFD39A', 1.0), disc=0.0, stars=0.0, haze='#D2B2A6', haze_max=0.88, foam='#FFF6EA',
                   mount_top='#857C9C', mount_bot='#CDB0A6', mount_lit='#D3A48C', mount_lit_k=0.55, snow=0.0,
                   cloud_light='#FFDCB0', cloud_mid='#E8A493', cloud_shade='#7D739C', cloud_rim='#FFAA62', rim_k=1.0, cloud_e=1.0,
                   lamp=4.0, win=1.4, lens=10.0, beam=0.0, ride=2.0, pillar=0.0, lamp_w=30.0, lh_w=500.0, winl=0.0, beacon=4.0,
                   sea_e=0.8, sheen_k=0.55, sheen_col='#FFB27A', stratus_k=0.55, stratus_col='#FFC8A0', exposure=0.2, foam_e=0.5,
                   glare=(0.22, 1.3), cb=((0.99, 1.0, 1.04), (1.0, 1.0, 1.0), (1.05, 1.0, 0.94)), aerial=0.42, haze_e=1.0, shk_k=0.58, shk_e=0.3),
    'noon': dict(sun=(4.3, '#FFF4E4'), min_el=0.0, fill=(0.4, '#A9C4EE'), world=[(0, '#C3D3DC'), (0.3, '#8AAED2'), (1, '#4C7FBE')], world_k=0.62,
                 sky=[(0, '#C2D6E0'), (0.04, '#E8F1F4'), (0.18, '#C8DFEE'), (0.5, '#93BEE2'), (1, '#5A8FCC')], glow=('#FFFFFF', 0.25),
                 disc=0.0, stars=0.0, haze='#BCD3DF', haze_max=0.7, foam='#FFFFFF', mount_top='#8FA8C2', mount_bot='#C7DCE6',
                 mount_lit='#B9C9D8', mount_lit_k=0.5, snow=1.0, cloud_light='#FFFFFF', cloud_mid='#E3EAF3', cloud_shade='#A2B3CC',
                 cloud_rim='#FFFFFF', rim_k=0.4, cloud_e=1.0, lamp=0.4, win=0.0, lens=5.0, beam=0.0, ride=0.0, pillar=0.0,
                 lamp_w=0.0, lh_w=0.0, winl=0.0, beacon=0.6, stratus_k=0.35, stratus_col='#FFFFFF', exposure=0.0, foam_e=0.4,
                 glare=(0.1, 2.0), cb=((1.0, 1.0, 1.01), (1.0, 1.0, 1.0), (1.0, 1.0, 1.0)), aerial=0.3, haze_e=1.0, shk_k=0.42, shk_e=0.06),
    'night': dict(sun=(1.25, '#A9BCFF'), min_el=22.0, fill=(0.2, '#5A6FB0'), world=[(0, '#2C3F6E'), (0.35, '#1C2B55'), (1, '#0B1330')], world_k=1.25,
                  sky=[(0, '#20304F'), (0.03, '#3A4E80'), (0.12, '#26385F'), (0.45, '#131D3F'), (1, '#080D22')], glow=('#6C82C0', 0.55),
                  disc=1.0, stars=1.0, haze='#1E2C50', haze_max=0.7, foam='#B9C8E6', mount_top='#1A2443', mount_bot='#24345C',
                  mount_lit='#3A4C78', mount_lit_k=0.4, snow=0.5, cloud_light='#7C8DB6', cloud_mid='#3A4878', cloud_shade='#1C2548',
                  cloud_rim='#D3DEFF', rim_k=1.0, cloud_e=1.0, lamp=40.0, win=6.0, lens=80.0, beam=0.75, ride=70.0, pillar=1.8,
                  lamp_w=190.0, lh_w=9000.0, winl=300.0, beacon=40.0, sea_e=0.5, exposure=0.3, foam_e=0.14, mist_k=0.004,
                  spot_w=900000.0, sheen_k=0.25, sheen_col='#8FA6E0', stratus_k=0.35, stratus_col='#5E6F9E', disc_az=-13.0, disc_el=2.6,
                  glare=(0.7, 0.7), cb=((0.98, 0.99, 1.05), (0.98, 1.0, 1.03), (1.03, 1.0, 0.98)), aerial=0.22, haze_e=0.8, shk_k=0.5, shk_e=0.6),
}


def apply_state(st):
    S = STATE[st]
    d = runtime_sun(HOURS[st])
    if math.degrees(math.asin(max(-1, min(1, d.z)))) < S['min_el']:
        el = math.radians(S['min_el']); hzd = Vector((d.x, d.y, 0)).normalized()
        d = Vector((hzd.x * math.cos(el), hzd.y * math.cos(el), math.sin(el)))
    aim_dir(sun, d); sun.data.energy = S['sun'][0]; sun.data.color = lin(S['sun'][1])
    fd = Vector((-d.x, -d.y, 0.8)).normalized()
    aim_dir(fill, fd); fill.data.energy = S['fill'][0]; fill.data.color = lin(S['fill'][1])
    set_ramp(wramp, [(p, lin(h)) for p, h in S['world']]); wbg.inputs['Strength'].default_value = S['world_k']
    for sm_ in SKY_MATS:
        set_ramp(sm_.node_tree.nodes['SKY_RAMP'], [(p, lin(h)) for p, h in S['sky']])
    hzd = Vector((d.x, d.y, 0)).normalized()
    for mat in [m_.name for m_ in SKY_MATS] + ['M_mount_far', 'M_mount_mid', 'M_mount_near', 'cloud', 'sea']:
        setv(mat, 'SUN_X', hzd.x); setv(mat, 'SUN_Y', hzd.y)
    setv('cloud', 'SUN_Z', d.z)
    for bk in [m_.name for m_ in SKY_MATS]:
        setv(bk, 'GLOW_COL', lin(S['glow'][0])); setv(bk, 'GLOW_K', S['glow'][1])
        setv(bk, 'STRATUS_K', S.get('stratus_k', 0.0)); setv(bk, 'STRATUS_COL', lin(S.get('stratus_col', '#FFFFFF')))
        setv(bk, 'DISC_K', S['disc']); setv(bk, 'STAR_K', S['stars'])
        setv(bk, 'DISC_AZ', S.get('disc_az', -12.0)); setv(bk, 'DISC_EL', S.get('disc_el', 3.0))
    setv('sea', 'SHEEN_K', S.get('sheen_k', 0.0)); setv('sea', 'SHEEN_COL', lin(S.get('sheen_col', '#FFFFFF')))
    setv('sea', 'HAZE_MAX', S.get('haze_max', 0.75)); setv('sea', 'HAZE', lin(S['haze'])); setv('sea', 'FOAM', lin(S['foam']))
    setv('sea', 'SEA_E', S.get('sea_e', 1.0)); setv('sea', 'FOAM_E', S.get('foam_e', 0.5))
    for mm_, k in (('M_mount_far', 0.4), ('M_mount_mid', 0.68), ('M_mount_near', 1.0)):
        top = lin(S['mount_top']); bot = lin(S['mount_bot'])
        top = tuple(a * k + b * (1 - k) for a, b in zip(top, bot))
        setv(mm_, 'TOP', top); setv(mm_, 'BOT', bot); setv(mm_, 'LIT', lin(S['mount_lit'])); setv(mm_, 'LIT_K', S['mount_lit_k'] * k)
        setv(mm_, 'SNOW_K', S['snow'])
    for k_, v_ in (('MID', 'cloud_mid'), ('LIGHT', 'cloud_light'), ('SHADE', 'cloud_shade'), ('RIM', 'cloud_rim')):
        setv('cloud', k_, lin(S[v_]))
    setv('cloud', 'RIM_K', S['rim_k']); setv('cloud', 'CLOUD_E', S['cloud_e'])
    setv('lamp', 'LAMP_K', S['lamp']); setv('window', 'WIN_K', S['win']); setv('lens', 'LENS_K', S['lens'])
    setv('riding', 'RIDE_K', S['ride']); setv('beam', 'BEAM_K', S['beam']); setv('halo', 'HALO_K', S['beam'] * 1.4)
    setv('pillar', 'PILLAR_K', S['pillar']); setv('beacon_red', 'BEACON_K', S['beacon'])
    for b in BEAMS:
        b.hide_render = S['beam'] == 0
    for p_ in PILLARS:
        p_.hide_render = S['pillar'] == 0
    for l in lamp_lights:
        l.data.energy = S['lamp_w']
    lh_light.data.energy = S['lh_w']; hl_light.data.energy = S['lamp_w'] * 2
    for l in win_lights:
        l.data.energy = S['winl']
    setv('mist', 'MIST_K', S.get('mist_k', 0.0)); mist_box.hide_render = S.get('mist_k', 0.0) == 0
    spot.data.energy = S.get('spot_w', 0.0)
    gl.inputs['Strength'].default_value = S['glare'][0]; gl.inputs['Threshold'].default_value = S['glare'][1]
    scene.view_settings.exposure = S.get('exposure', 0.0)
    set_cb(*S['cb'])
    shn = M['shakkei'].node_tree.nodes
    shn['SHK_HAZE'].outputs[0].default_value = (*lin(S['haze']), 1)
    shn['SHK_K'].outputs[0].default_value = S.get('shk_k', 0.55); shn['SHK_E'].outputs[0].default_value = S.get('shk_e', 0.35)
    hz = lin(S['haze']); sock(hz_mix, 'B_Color').default_value = (hz[0] * S.get('haze_e', 1.0), hz[1] * S.get('haze_e', 1.0), hz[2] * S.get('haze_e', 1.0), 1)
    mr_.inputs['To Max'].default_value = S.get('aerial', 0.3)
    for f in globals().get('STATE_HOOKS', []):
        f(st, S)


os.makedirs(OUT, exist_ok=True)
for cam in CAMS:
    scene.camera = CAMS_OB[cam]
    for nm_, coll_ in SKY_SETS.items():
        coll_.hide_render = nm_ != cam
    Dc = CJ['presets'][cam]['distance']
    wt.mist_settings.start = Dc * 0.72; wt.mist_settings.depth = Dc * 1.25
    for st in STATES:
        apply_state(st)
        out = os.path.join(OUT, f'key-{cam}-{st}{SUFFIX}.png')
        scene.render.filepath = out
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print('RENDERED', out, round(time.time() - t1, 1), 's')
