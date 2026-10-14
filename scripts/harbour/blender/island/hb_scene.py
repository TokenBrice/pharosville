"""The Harbour v2 - key-art stage: sea (SDF-driven, style C), sky backdrop, cumulus, lights, runtime-identical
cameras, time-of-day states, compositor. exec'd into build_island's namespace. Nothing here is exported."""

# view frame: the runtime camera (yaw 45) looks north-west from the south-east
FWD = Vector((-1.0, 1.0, 0.0)).normalized()          # into the screen
SIDE = Vector((1.0, 1.0, 0.0)).normalized()          # screen right
SC = Vector((0.0, 90.0, 0.0))                        # island centre (for radial sky maths)
V_BACK = 600.0                                       # backdrop wall: V (screen depth) of the sky card
SEA_B = CJ_LAYOUT['sea']['bounds']                   # glTF [minX, minZ, maxX, maxZ]


def V_of(x, y):
    return (y - x) / math.sqrt(2.0)


# ------------------------------------------------------------------ sea image (key art: + hull contact + wakes)
def build_sea_image(contact, wakes):
    import bake_sdf
    arr = bake_sdf.bake(CJ, SEA_B, n=2048, contact_polys=contact, wakes=wakes,
                        extra_circles=[tuple(c) for c in CIRCLES_EXTRA], buoys=False)
    n = arr['sd'].shape[0]
    img = np.zeros((n, n, 4), np.float32)
    img[..., 0] = np.clip(arr['sd'] / 80.0, 0, 1)
    img[..., 1] = arr.get('wake', np.zeros((n, n), np.float32))
    img[..., 2] = np.clip(np.minimum(arr['ds'], arr.get('dh', arr['ds'])) / 8.0, 0, 1)
    img[..., 3] = np.clip(arr['depth'] / 40.0, 0, 1)
    bimg = bpy.data.images.new('sea_sdf', n, n, float_buffer=True, alpha=True)
    bimg.colorspace_settings.name = 'Non-Color'     # set BEFORE the pixels: changing it reloads the buffer
    bimg.alpha_mode = 'CHANNEL_PACKED'
    bimg.pixels.foreach_set(img.ravel())            # row 0 = min Blender y = image bottom
    bimg.update()
    return bimg


def build_water(sdf_img):
    m = new_mat('M_sea'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    geo = node(nt, 'ShaderNodeNewGeometry')
    W = geo.outputs['Position']
    wx, wy, wz = sep(nt, W)
    minX, minZ, maxX, maxZ = SEA_B
    uvx = (wx - minX) / (maxX - minX)
    uvy = (wy + maxZ) / (maxZ - minZ)
    im = node(nt, 'ShaderNodeTexImage', interpolation='Cubic', extension='EXTEND'); im.image = sdf_img
    link(nt, comb(nt, uvx, uvy, 0.0), im.inputs['Vector'])
    sc = node(nt, 'ShaderNodeSeparateColor'); link(nt, im.outputs['Color'], sc.inputs[0])
    d = SX(nt, sc.outputs['Red']) * 80.0
    wake = SX(nt, sc.outputs['Green'])
    dh = SX(nt, sc.outputs['Blue']) * 8.0
    dep = SX(nt, im.outputs['Alpha'])
    n1 = noise3(nt, vscale(nt, W, 0.09), 1.0, 2.0)
    n2 = noise3(nt, vscale(nt, W, 0.45), 1.0, 1.0)
    n3 = noise3(nt, vscale(nt, W, 1.1), 1.0, 1.0)
    dn = d + (n1 - 0.5) * 1.6
    ramp = node(nt, 'ShaderNodeValToRGB', name='DEPTH_RAMP'); ramp.color_ramp.interpolation = 'EASE'
    link(nt, (dep * 1.0).clamp(), ramp.inputs['Fac'])
    set_ramp(ramp, [(0.0, PAL['sea_shoal']), (0.05, PAL['sea_shallow']), (0.16, PAL['sea_mid']), (0.42, PAL['sea_deep']), (1.0, PAL['sea_abyss'])])
    f_contact = 1.0 - dn.sstep(0.55, 0.95)
    band2 = 1.0 - ((dn - 3.2).abs()).sstep(0.25, 0.5)
    brk2 = n2.sstep(0.45, 0.55)
    band3 = (1.0 - ((dn - 7.5).abs()).sstep(0.2, 0.45)) * n3.sstep(0.5, 0.6) * 0.45
    f_hull = (1.0 - (dh + (n3 - 0.5) * 0.4).sstep(0.14, 0.38)) * 0.8
    f_wake = (wake * 1.1 - (1.0 - n3) * 0.7 - (1.0 - n2) * 0.25).sstep(0.1, 0.28) * wake.sstep(0.05, 0.2)
    foam = f_contact.max(band2 * brk2 * 0.9).max(band3).max(f_hull).max(f_wake)
    foam = foam * C(nt, 1.0, 'FOAM_K')
    # far haze toward the backdrop (screen depth V)
    vv = (wy - wx) * 0.70710678
    hraw = vv.sstep(380.0, 560.0)
    haze = vv.sstep(420.0, 600.0).pow(1.4) * C(nt, 0.75, 'HAZE_MAX')
    hz = rgb(nt, (0.5, 0.5, 0.5), 'HAZE')
    sea = mixc(nt, haze, ramp.outputs['Color'], hz)
    fc = rgb(nt, PAL['foam'], 'FOAM')
    fo = (foam * (1.0 - haze)).clamp()
    link(nt, mixc(nt, fo, mulc(nt, sea, 0.18), fc), p.inputs['Base Color'])
    dxw = wx - SC.x; dyw = wy - SC.y
    rr_ = (dxw * dxw + dyw * dyw).sqrt() + 0.001
    sd_ = ((dxw * C(nt, 0.0, 'SUN_X') + dyw * C(nt, 1.0, 'SUN_Y')) / rr_).clamp()
    sheen = sd_.pow(3.0) * hraw.pow(1.2) * C(nt, 0.0, 'SHEEN_K')
    emis = addc(nt, mulc(nt, sea, (1.0 - fo) * C(nt, 1.0, 'SEA_E')), mulc(nt, fc, fo * C(nt, 0.5, 'FOAM_E')))
    emis = addc(nt, emis, mulc(nt, rgb(nt, (1.0, 0.7, 0.45), 'SHEEN_COL'), sheen))
    link(nt, emis, p.inputs['Emission Color'])
    p.inputs['Emission Strength'].default_value = 1.0
    paws = noise3(nt, vscale(nt, W, 0.02, 0.04, 1.0), 1.0, 2.0).sstep(0.42, 0.62)
    link(nt, fo.lmap(0, 1, 0.05, 0.85) + hraw * 0.45 + paws * 0.12, p.inputs['Roughness'])
    p.inputs['Specular IOR Level'].default_value = 1.0
    p.inputs['IOR'].default_value = 1.33
    mp = node(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.35, 1.0, 1.0)
    mp.inputs['Rotation'].default_value = (0, 0, math.radians(-50)); link(nt, W, mp.inputs['Vector'])
    r1 = noise3(nt, mp.outputs['Vector'], 0.55, 3.0, 0.55)
    r2 = noise3(nt, W, 2.2, 2.0)
    bump = node(nt, 'ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.32; bump.inputs['Distance'].default_value = 0.12
    link(nt, (r1 * 0.8 + r2 * 0.25) * (1.0 - haze * 0.7) * (1.0 - foam * 0.6), bump.inputs['Height'])
    link(nt, bump.outputs['Normal'], p.inputs['Normal'])
    M['sea'] = m
    return m


# ------------------------------------------------------------------ sky backdrop, shakkei, cumulus
def build_backdrop_mat():
    m = new_mat('M_backdrop'); nt = m.node_tree; out = strip(nt)
    geo = node(nt, 'ShaderNodeNewGeometry')
    wx, wy, wz = sep(nt, geo.outputs['Position'])
    dxs = wx - SC.x; dys = wy - SC.y
    rr = (dxs * dxs + dys * dys).sqrt()
    sx_ = C(nt, 0, 'SUN_X'); sy_ = C(nt, 1, 'SUN_Y')
    cosang = (dxs * sx_ + dys * sy_) / rr
    h = (wz / 260.0).clamp()
    ramp = node(nt, 'ShaderNodeValToRGB', name='SKY_RAMP'); link(nt, h, ramp.inputs['Fac'])
    ramp.color_ramp.interpolation = 'EASE'
    glow = cosang.clamp().pow(4.0) * (1.0 - h.sstep(0.0, 0.55)) * C(nt, 0.5, 'GLOW_K')
    gcol = rgb(nt, (1, 0.8, 0.6), 'GLOW_COL')
    col = mixc(nt, glow.clamp(), ramp.outputs['Color'], gcol)
    sp = vscale(nt, geo.outputs['Position'], 0.0016, 0.0016, 0.03)
    st_n = noise3(nt, sp, 1.0, 3.0, 0.6)
    streak = st_n.sstep(0.56, 0.7) * wz.sstep(30.0, 50.0) * (1.0 - wz.sstep(110.0, 170.0)) * C(nt, 0.0, 'STRATUS_K')
    col = mixc(nt, streak, col, rgb(nt, (1, 0.8, 0.7), 'STRATUS_COL'))
    mz = C(nt, 200.0, 'DISC_Z'); dk = C(nt, 0.0, 'DISC_K'); ms = C(nt, 0.0, 'DISC_S')
    ss = dxs * SIDE.x + dys * SIDE.y
    dd = ((ss - ms) * (ss - ms) + (wz - mz) * (wz - mz)).sqrt()
    disc = (1.0 - dd.sstep(19.0, 21.5)) * dk
    halo = (1.0 - dd.sstep(20.0, 260.0)).pow(2.5) * dk * 0.45
    col = mixc(nt, (disc + halo).clamp(), col, rgb(nt, PAL['moon'], 'DISC_COL'))
    vo = node(nt, 'ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 0.09
    link(nt, geo.outputs['Position'], vo.inputs['Vector'])
    star = (1.0 - SX(nt, vo.outputs['Distance']).sstep(0.02, 0.06)) * C(nt, 0.0, 'STAR_K') * h.sstep(0.12, 0.4)
    col = addc(nt, col, mulc(nt, (1, 1, 1), star))
    e = node(nt, 'ShaderNodeEmission'); link(nt, col, e.inputs['Color'])
    link(nt, C(nt, 1.0, 'SKY_E'), e.inputs['Strength'])
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    M['backdrop'] = m
    return m


def build_mountain_mat(name, hfade=70.0, snow_z=64.0):
    """Shakkei: distant land in aerial perspective - lit/shade split by facing, fading into haze at the base."""
    m = new_mat(name); nt = m.node_tree; out = strip(nt)
    geo = node(nt, 'ShaderNodeNewGeometry')
    _, _, wz = sep(nt, geo.outputs['Position'])
    nz = sep(nt, geo.outputs['Normal'])
    top = rgb(nt, (0.5, 0.5, 0.6), 'TOP'); bot = rgb(nt, (0.6, 0.6, 0.7), 'BOT')
    lit = rgb(nt, (0.7, 0.6, 0.6), 'LIT')
    sxn = C(nt, 0, 'SUN_X'); syn = C(nt, 1, 'SUN_Y')
    ndl = (nz[0] * sxn + nz[1] * syn).sstep(-0.1, 0.4)
    c = mixc(nt, ndl * C(nt, 0.5, 'LIT_K'), top, lit)
    c = mixc(nt, (wz / hfade).clamp().pow(0.7).lmap(0, 1, 1, 0), c, bot)
    snow = (wz.sstep(snow_z, snow_z + 10.0)) * C(nt, 0.0, 'SNOW_K')
    c = mixc(nt, snow, c, rgb(nt, (0.9, 0.9, 0.95), 'SNOW'))
    e = node(nt, 'ShaderNodeEmission'); link(nt, c, e.inputs['Color'])
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    M[name] = m
    return m


def mountain_range(name, v, s0, s1, hmax, seed, mat, n=220, lift=-6.0):
    bm = bmesh.new()
    base, peaks = [], []
    c0 = SC + FWD * (v - V_of(SC.x, SC.y))
    for k in range(n + 1):
        t = k / n
        s = s0 + (s1 - s0) * t
        h = 0.0; amp = 1.0; f = 1.0
        for o in range(4):
            r_ = 1.0 - abs(noise.noise(Vector((s * 0.004 * f + seed * 3.3, seed, o * 1.7))))
            h += amp * r_ ** 2.2; amp *= 0.5; f *= 2.1
        env = max(0.0, noise.noise(Vector((s * 0.0022 + seed, 0.5, 0.0))) + 0.22) / 0.7
        h = hmax * h * 0.55 * min(1.0, env) ** 0.8
        p = c0 + SIDE * s
        base.append(bm.verts.new((p.x, p.y, lift)))
        peaks.append(bm.verts.new((p.x, p.y, max(h, lift + 1.0))))
    for k in range(n):
        bm.faces.new((base[k], base[k + 1], peaks[k + 1], peaks[k]))
    ob = obj(name, bm, mat=mat, shadow=False, family='sky')
    ob.visible_diffuse = False; ob.visible_glossy = False
    return ob


def build_cloud_mat():
    m = new_mat('M_cloud'); nt = m.node_tree; out = strip(nt)
    geo = node(nt, 'ShaderNodeNewGeometry')
    nx_, ny_, nz_ = sep(nt, geo.outputs['Normal'])
    _, _, wz = sep(nt, geo.outputs['Position'])
    sx_ = C(nt, 0, 'SUN_X'); sy_ = C(nt, 1, 'SUN_Y'); sz_ = C(nt, 0.3, 'SUN_Z')
    ndl = nx_ * sx_ + ny_ * sy_ + nz_ * sz_
    lit = ndl.sstep(-0.25, 0.35)
    lit = lit * 0.75 + (ndl * 0.5 + 0.5) * 0.25
    shade = rgb(nt, (0.5, 0.5, 0.6), 'SHADE'); light = rgb(nt, (1, 0.9, 0.8), 'LIGHT'); rimc = rgb(nt, (1, 0.8, 0.6), 'RIM')
    mid = rgb(nt, (0.8, 0.6, 0.55), 'MID')
    c = mixc(nt, lit.sstep(0.0, 0.6), shade, mid)
    c = mixc(nt, lit.sstep(0.5, 1.0), c, light)
    lw = node(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    rim = SX(nt, lw.outputs['Facing']).sstep(0.7, 0.95) * (ndl * 0.5 + 0.5).sstep(0.25, 0.6) * C(nt, 0.6, 'RIM_K')
    c = mixc(nt, rim.clamp(), c, rimc)
    base_dark = 1.0 - (wz - C(nt, 0.0, 'BASE_Z')).sstep(14.0, 40.0)
    c = mixc(nt, base_dark * 0.35 * (1.0 - nz_.sstep(0.2, 0.8)), c, shade)
    # painterly breakup: soft value noise across the surface (no CG-smooth puffs)
    bn = noise3(nt, vscale(nt, geo.outputs['Position'], 0.05), 1.0, 3.0, 0.6)
    c = mulc(nt, c, bn.lmap(0.3, 0.7, 0.93, 1.05))
    e = node(nt, 'ShaderNodeEmission'); link(nt, c, e.inputs['Color'])
    link(nt, C(nt, 1.0, 'CLOUD_E'), e.inputs['Strength'])
    tr = node(nt, 'ShaderNodeBsdfTransparent')
    lwf = node(nt, 'ShaderNodeLayerWeight'); lwf.inputs['Blend'].default_value = 0.2
    alpha = 1.0 - SX(nt, lwf.outputs['Fresnel']).sstep(0.55, 0.98) * 0.85
    mx = node(nt, 'ShaderNodeMixShader'); link(nt, alpha, mx.inputs['Fac'])
    nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(e.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'
    M['cloud'] = m
    return m


CLOUDS = []


def cumulus(name, centre, width, height, seed):
    """Sculpted cumulus bank: flat base, cauliflower tiers, soft edges."""
    rng_ = random.Random(seed)
    bm = bmesh.new()
    cx, cy, cz = centre
    for ti in range(4):
        f = ti / 3
        tw = width * (1.0 - 0.6 * f) * rng_.uniform(0.9, 1.05)
        zc = cz + height * (0.1 + 0.6 * f)
        off = (rng_.uniform(-0.12, 0.12) + (0.1 if ti % 2 else -0.06)) * width
        nb = max(2, int(7 - ti * 1.4))
        for j in range(nb):
            t = (j + 0.5) / nb - 0.5
            r = tw / nb * rng_.uniform(0.66, 1.0) * (1.25 if abs(t) < 0.2 else 1.0)
            p = Vector((cx, cy, 0)) + SIDE * (off + t * tw * 0.85) + FWD * rng_.uniform(-0.2, 0.2) * r
            merge(bm, bm_ico(r, (p.x, p.y, zc + rng_.uniform(-0.1, 0.25) * r), 3, (1.0, 0.8, 0.82), seed=seed * 31 + ti * 7 + j, amp=0.18))
    for v in bm.verts:
        if v.co.z < cz:
            v.co.z = cz + (v.co.z - cz) * 0.06
    ob = obj(name, bm, mat=M['cloud'], shadow=False, smooth=True, family='sky')
    ob.visible_diffuse = False; ob.visible_glossy = False
    CLOUDS.append(ob)
    return ob


def build_sky():
    set_coll(collection('sky', ROOTC))
    build_backdrop_mat()
    cbd = SC + FWD * (V_BACK - V_of(SC.x, SC.y))
    bd = bmesh.new()
    vs = [bd.verts.new(cbd + SIDE * s + Vector((0, 0, z))) for s, z in ((-1600, -12), (1600, -12), (1600, 900), (-1600, 900))]
    bd.faces.new(vs)
    b = obj('sky_backdrop', bd, mat=M['backdrop'], shadow=False, family='sky')
    b.visible_diffuse = False; b.visible_glossy = True
    for nm, hf, sz in (('M_mount_far', 150.0, 128.0), ('M_mount_mid', 100.0, 88.0), ('M_mount_near', 60.0, 400.0)):
        build_mountain_mat(nm, hf, sz)
    mountain_range('shakkei_far', V_BACK - 14, -1500, 1500, 170, 3, M['M_mount_far'])
    mountain_range('shakkei_mid', V_BACK - 34, -1100, 900, 110, 11, M['M_mount_mid'])
    mountain_range('shakkei_near', V_BACK - 60, -900, 160, 60, 8, M['M_mount_near'])
    build_cloud_mat()
    for i, (s, z, w, h) in enumerate(((-620, 70, 220, 80), (180, 60, 260, 96), (760, 80, 200, 70), (-180, 120, 120, 40), (520, 150, 90, 30))):
        c = SC + FWD * (V_BACK - 20 - V_of(SC.x, SC.y)) + SIDE * s
        cumulus(f'cloud_{i}', (c.x, c.y, z), w, h, 40 + i)


# ------------------------------------------------------------------ lights
def add_light(name, kind, loc=(0, 0, 0), **kw):
    ld = bpy.data.lights.new(name, kind)
    ob = bpy.data.objects.new(name, ld); ROOTC.objects.link(ob)
    ob.location = loc
    for k, v in kw.items():
        setattr(ld, k, v)
    return ob


# ------------------------------------------------------------------ cameras: identical maths to src/harbour/engine/camera-rig.ts
def make_cam(name, pr):
    tx, ty, tz = pr['target']; T = Vector((tx, -tz, ty))
    D = pr['distance']; yaw = math.radians(pr['yawDeg']); pit = math.radians(pr['pitchDeg'])
    cp = math.cos(pit)
    off = Vector((math.sin(yaw) * cp, -math.cos(yaw) * cp, math.sin(pit)))
    cd = bpy.data.cameras.new(name); cd.type = 'PERSP'; cd.sensor_fit = 'VERTICAL'
    cd.angle_y = math.radians(pr['fovDeg']); cd.clip_start = max(1.0, D * 0.05); cd.clip_end = D * 12
    co = bpy.data.objects.new('cam_' + name, cd); ROOTC.objects.link(co)
    co.location = T + off * D
    co.rotation_euler = (T - co.location).to_track_quat('-Z', 'Y').to_euler()
    return co


def runtime_sun(hour):
    """Mirror of TimeOfDay (src/harbour/engine/time-of-day.ts): glTF dir -> Blender dir (x, -z, y)."""
    day = ((hour - 6) / 13) * math.pi
    up = math.sin(day)
    if up > -0.05:
        g = Vector((math.cos(day) * 0.8, max(0.06, up * 0.9), 0.45)).normalized()
    else:
        mp = ((hour + 24 - 19) % 24) / 11 * math.pi
        g = Vector((-math.cos(mp) * 0.6, max(0.25, math.sin(mp) * 0.8), -0.35)).normalized()
    return Vector((g.x, -g.z, g.y))


print('SCENE module loaded')
