"""The Harbour v2 - key-art stage: sea (SDF-driven, style C), sky backdrop, cumulus, lights, runtime-identical
cameras, time-of-day states, compositor. exec'd into build_island's namespace. Nothing here is exported."""

# view frame: the runtime camera (yaw 45) looks north-west from the south-east
FWD = Vector((-1.0, 1.0, 0.0)).normalized()          # into the screen
SIDE = Vector((1.0, 1.0, 0.0)).normalized()          # screen right
SC = Vector((0.0, 90.0, 0.0))                        # island centre (for radial sky maths)
V_BACK = 600.0                                       # backdrop wall: V (screen depth) of the sky card
SEA_B = CJ['sea_bounds']                             # glTF [minX, minZ, maxX, maxZ] (v3 compose; = layout.sea.bounds)


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


# ------------------------------------------------------------------ sky backdrop, shakkei, cumulus (v3: camera-relative, like the runtime)
# The runtime paints its sky on a cylinder round the camera at the sky radius R (horizon a fixed fraction of the frame
# below the top). The key art does the same per camera: backdrop, hills and cloud banks are authored in degrees.
SKY_MATS = []


def sky_radius(pr):
    """Mirror of SkySystem.update: R from the frame (20 % band), pushed past the farthest land point in the view arc."""
    tx, ty, tz = pr['target']; T = Vector((tx, -tz, ty))
    D = pr['distance']; yaw = math.radians(pr['yawDeg']); pit = math.radians(pr['pitchDeg'])
    cp = math.cos(pit)
    cam = T + Vector((math.sin(yaw) * cp, -math.cos(yaw) * cp, math.sin(pit))) * D
    vfov = math.radians(pr['fovDeg'])
    R = cam.z / math.tan(max(0.05, pit - vfov / 2 + 0.2 * vfov))
    span = math.atan(math.tan(vfov / 2) * 1.6) + 0.25
    far = 0.0
    for p in [tuple(q) for q in CJ['coast']] + [tuple(q) for q in CJ['bw_line']]:
        d = Vector((p[0] - cam.x, p[1] - cam.y))
        if d.length < 1e-3 or d.normalized().dot(FWD.to_2d()) < math.cos(span):
            continue
        far = max(far, d.length)
    return (max(R, far + 14) if far else R), cam


def build_backdrop_mat(name, cam):
    m = new_mat(name); nt = m.node_tree; out = strip(nt)
    geo = node(nt, 'ShaderNodeNewGeometry')
    wx, wy, wz = sep(nt, geo.outputs['Position'])
    dxs = wx - cam.x; dys = wy - cam.y
    rr = (dxs * dxs + dys * dys).sqrt()
    fw = dxs * FWD.x + dys * FWD.y; ss = dxs * SIDE.x + dys * SIDE.y
    az = ss._m('ARCTAN2', fw) * 57.29578
    el = wz._m('ARCTAN2', rr) * 57.29578
    sx_ = C(nt, 0, 'SUN_X'); sy_ = C(nt, 1, 'SUN_Y')
    cosang = (dxs * sx_ + dys * sy_) / rr
    h = (el / 14.0).clamp()
    ramp = node(nt, 'ShaderNodeValToRGB', name='SKY_RAMP'); link(nt, h, ramp.inputs['Fac'])
    ramp.color_ramp.interpolation = 'EASE'
    glow = cosang.clamp().pow(4.0) * (1.0 - h.sstep(0.0, 0.55)) * C(nt, 0.5, 'GLOW_K')
    gcol = rgb(nt, (1, 0.8, 0.6), 'GLOW_COL')
    col = mixc(nt, glow.clamp(), ramp.outputs['Color'], gcol)
    st_n = noise3(nt, comb(nt, az * 0.05, el * 0.9, 0.0), 1.0, 3.0, 0.6)
    streak = st_n.sstep(0.56, 0.7) * el.sstep(1.6, 2.6) * (1.0 - el.sstep(5.0, 8.0)) * C(nt, 0.0, 'STRATUS_K')
    col = mixc(nt, streak, col, rgb(nt, (1, 0.8, 0.7), 'STRATUS_COL'))
    dk = C(nt, 0.0, 'DISC_K'); daz = C(nt, -12.0, 'DISC_AZ'); delv = C(nt, 3.0, 'DISC_EL')
    dd = ((az - daz) * (az - daz) + (el - delv) * (el - delv)).sqrt()
    disc = (1.0 - dd.sstep(1.25, 1.45)) * dk
    halo = (1.0 - dd.sstep(1.3, 16.0)).pow(2.5) * dk * 0.45
    col = mixc(nt, (disc + halo).clamp(), col, rgb(nt, PAL['moon'], 'DISC_COL'))
    vo = node(nt, 'ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 1.0
    link(nt, comb(nt, az * 1.4, el * 1.4, 0.0), vo.inputs['Vector'])
    star = (1.0 - SX(nt, vo.outputs['Distance']).sstep(0.03, 0.07)) * C(nt, 0.0, 'STAR_K') * el.sstep(1.0, 4.0)
    col = addc(nt, col, mulc(nt, (1, 1, 1), star))
    e = node(nt, 'ShaderNodeEmission'); link(nt, col, e.inputs['Color'])
    link(nt, C(nt, 1.0, 'SKY_E'), e.inputs['Strength'])
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    SKY_MATS.append(m)
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


def mountain_range(name, cam, R, az0, az1, emax, seed, mat, n=220, lift=-6.0):
    """A hill silhouette on an arc of radius R round the camera, heights in degrees of elevation."""
    bm = bmesh.new()
    base, peaks = [], []
    fa = math.atan2(FWD.y, FWD.x)
    for k in range(n + 1):
        t = k / n
        az = az0 + (az1 - az0) * t
        s = az * R * 0.0175
        h = 0.0; amp = 1.0; f = 1.0
        for o in range(4):
            r_ = 1.0 - abs(noise.noise(Vector((s * 0.004 * f + seed * 3.3, seed, o * 1.7))))
            h += amp * r_ ** 2.2; amp *= 0.5; f *= 2.1
        env = max(0.0, noise.noise(Vector((s * 0.0022 + seed, 0.5, 0.0))) + 0.22) / 0.7
        h = R * math.tan(math.radians(emax)) * h * 0.55 * min(1.0, env) ** 0.8
        a = fa - math.radians(az)
        p = Vector((cam.x + math.cos(a) * R, cam.y + math.sin(a) * R, 0))
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


def cumulus(name, centre, width, height, seed, side=None, fwd=None):
    """Sculpted cumulus bank: flat base, cauliflower tiers, soft edges."""
    rng_ = random.Random(seed)
    bm = bmesh.new()
    cx, cy, cz = centre
    side = side or SIDE; fwd = fwd or FWD
    for ti in range(4):
        f = ti / 3
        tw = width * (1.0 - 0.6 * f) * rng_.uniform(0.9, 1.05)
        zc = cz + height * (0.1 + 0.6 * f)
        off = (rng_.uniform(-0.12, 0.12) + (0.1 if ti % 2 else -0.06)) * width
        nb = max(2, int(7 - ti * 1.4))
        for j in range(nb):
            t = (j + 0.5) / nb - 0.5
            r = tw / nb * rng_.uniform(0.66, 1.0) * (1.25 if abs(t) < 0.2 else 1.0)
            p = Vector((cx, cy, 0)) + side * (off + t * tw * 0.85) + fwd * rng_.uniform(-0.2, 0.2) * r
            merge(bm, bm_ico(r, (p.x, p.y, zc + rng_.uniform(-0.1, 0.25) * r), 3, (1.0, 0.8, 0.82), seed=seed * 31 + ti * 7 + j, amp=0.18))
    for v in bm.verts:
        if v.co.z < cz:
            v.co.z = cz + (v.co.z - cz) * 0.06
    ob = obj(name, bm, mat=M['cloud'], shadow=False, smooth=True, family='sky')
    ob.visible_diffuse = False; ob.visible_glossy = False
    CLOUDS.append(ob)
    return ob


SKY_SETS = {}


def build_sky():
    """One sky set per key-art camera (shown only for that camera)."""
    for nm, hf, sz in (('M_mount_far', 150.0, 9999.0), ('M_mount_mid', 100.0, 9999.0), ('M_mount_near', 60.0, 9999.0)):
        build_mountain_mat(nm, hf, sz)
    build_cloud_mat()
    for cam_name, pr in CJ['presets'].items():
        coll = collection('sky_' + cam_name, ROOTC); set_coll(coll)
        R, cam = sky_radius(pr)
        fa = math.atan2(FWD.y, FWD.x)
        m = build_backdrop_mat('M_backdrop_' + cam_name, cam)
        bd = bmesh.new()
        n = 72; top = R * math.tan(math.radians(22))
        ring = []
        for k in range(n + 1):
            a = fa + math.radians(-42 + 84 * k / n)
            p = (cam.x + math.cos(a) * R, cam.y + math.sin(a) * R)
            ring.append((bd.verts.new((p[0], p[1], -12.0)), bd.verts.new((p[0], p[1], top))))
        for (a0, a1), (b0, b1) in zip(ring, ring[1:]):
            bd.faces.new((a0, b0, b1, a1))
        b = obj('sky_backdrop_' + cam_name, bd, mat=m, shadow=False, family='sky')
        b.visible_diffuse = False; b.visible_glossy = True
        mountain_range('shakkei_far_' + cam_name, cam, R - 6, -40, 40, 2.4, 3, M['M_mount_far'])
        mountain_range('shakkei_mid_' + cam_name, cam, R - 12, -12, 30, 1.4, 11, M['M_mount_mid'])
        for i, (az, el, w, h) in enumerate(()):        # v3: no 3D cumulus (the runtime paints its banks on the card)
            a = fa - math.radians(az); Rc = R - 4
            c = Vector((cam.x + math.cos(a) * Rc, cam.y + math.sin(a) * Rc, 0))
            side = Vector((math.sin(a), -math.cos(a), 0)); fw_ = Vector((math.cos(a), math.sin(a), 0))
            cumulus(f'cloud_{cam_name}_{i}', (c.x, c.y, Rc * math.tan(math.radians(el))), Rc * math.radians(w), Rc * math.radians(h), 40 + i,
                    side=side, fwd=fw_)
        SKY_SETS[cam_name] = coll


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
