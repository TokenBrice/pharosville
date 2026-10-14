"""PharosVille reboot look-dev diorama (2026-10-13). Reproducible, headless.

    blender -b --factory-startup -P build_lookdev.py -- \
        [--states golden,night] [--cams iso,hero] [--engine eevee|cycles] \
        [--samples 64] [--save] [--suffix _x]

Builds a rocky islet with a classic lighthouse, keeper's cottage, jetty,
three sail boats, a stylized SDF-driven sea (shore foam, wakes) and a sky
backdrop, then renders 1600x1000 PNGs next to this file.

Runtime-representative choices (on purpose):
  * one shared vertex-colour "palette" material for all opaque props
  * sea = one plane + one baked distance-field texture (R = coast distance,
    G = wake intensity) -- exactly what a three.js shader would sample
  * sail emblem colour comes from per-object colour (= per-instance attribute)
"""
import bpy, bmesh, math, random, os, sys, json, time
import numpy as np
from mathutils import Vector, Matrix, noise

ART = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


STATES = arg('--states', 'golden,night').split(',')
CAMS = arg('--cams', 'iso').split(',')
ENGINE = arg('--engine', 'eevee')
SAMPLES = int(arg('--samples', '64'))
SUFFIX = arg('--suffix', '')
SAVE = '--save' in ARGV
RES = (1600, 1000)
random.seed(7)

# ---------------------------------------------------------------- reset
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes):
    bpy.data.meshes.remove(m)
scene = bpy.context.scene
COLL = scene.collection


def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


PAL = {k: lin(v) for k, v in dict(
    rock='#8E857A', grass_lo='#8DA559', grass_hi='#A0B463', flower1='#E8C35A', flower2='#D9887A', flower3='#F3EEE2', soil='#7A5B40', rock_dark='#6B655D', rock_wet='#4F4C49', grass='#97AB5E', grass_side='#6E8546',
    stone='#D2C9B8', stone_dark='#A79E8F', white='#F0EADC', red='#B4493B', iron='#2B3036',
    slate='#4C5F7C', slate_dark='#3A4962', wall='#EDE4D2', timber='#7E5D3E', timber_dark='#56412D',
    door='#5C3E29', leaf='#5E8044', leaf2='#73934C', trunk='#6A4E35', sand='#D9C59C',
    hull_navy='#2E4A68', hull_red='#A9473B', hull_teal='#2D6E69', hull_cream='#ECE3CF',
    antifoul='#5B2F2A', deck='#B89566', cloud='#F6EFE6', brass='#B08A4A',
).items()}

# ---------------------------------------------------------------- node helpers


def new_mat(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    return m


def N(nt, kind, **props):
    n = nt.nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def L(nt, a, b):
    nt.links.new(a, b)


def sock(node, ident, out=False):
    for s in (node.outputs if out else node.inputs):
        if s.identifier == ident or s.name == ident:
            if s.enabled:
                return s
    raise KeyError(ident)


def val(nt, x):
    if isinstance(x, (int, float)):
        n = N(nt, 'ShaderNodeValue')
        n.outputs[0].default_value = x
        return n.outputs[0]
    return x


def math_(nt, op, a, b=None, clamp=False):
    n = N(nt, 'ShaderNodeMath', operation=op, use_clamp=clamp)
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            L(nt, x, n.inputs[i])
    return n.outputs[0]


def mrange(nt, x, a, b, c=0.0, d=1.0, smooth=True):
    n = N(nt, 'ShaderNodeMapRange', interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR')
    L(nt, x, n.inputs['Value'])
    n.inputs['From Min'].default_value = a
    n.inputs['From Max'].default_value = b
    n.inputs['To Min'].default_value = c
    n.inputs['To Max'].default_value = d
    return n.outputs['Result']


def mix(nt, fac, a, b):
    n = N(nt, 'ShaderNodeMix', data_type='RGBA')
    for ident, x in (('Factor_Float', fac), ('A_Color', a), ('B_Color', b)):
        s = sock(n, ident)
        if isinstance(x, (int, float)):
            s.default_value = x
        elif isinstance(x, tuple):
            s.default_value = (*x[:3], 1)
        else:
            L(nt, x, s)
    return sock(n, 'Result_Color', out=True)


def rgb(nt, c, name=None):
    n = N(nt, 'ShaderNodeRGB')
    n.outputs[0].default_value = (*c[:3], 1)
    if name:
        n.name = name
    return n


def noise_tex(nt, vec, scale, detail=2.0, rough=0.5, w=None):
    n = N(nt, 'ShaderNodeTexNoise')
    if w is not None:
        n.noise_dimensions = '4D'
        n.inputs['W'].default_value = w
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    L(nt, vec, n.inputs['Vector'])
    return n.outputs['Fac']


def set_ramp(ramp, stops):
    els = ramp.color_ramp.elements
    while len(els) > 2:
        els.remove(els[-1])
    for i, (p, c) in enumerate(stops):
        e = els[i] if i < 2 else els.new(p)
        e.position = p
        e.color = (*c[:3], 1)


# ---------------------------------------------------------------- materials
M = {}


def build_palette():
    m = new_mat('M_palette'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    a = N(nt, 'ShaderNodeAttribute', attribute_name='Col')
    L(nt, a.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.8
    p.inputs['Specular IOR Level'].default_value = 0.3
    M['palette'] = m


def build_glow(name, base, glow):
    m = new_mat(name); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*base, 1)
    p.inputs['Roughness'].default_value = 0.12
    p.inputs['Emission Color'].default_value = (*glow, 1)
    p.inputs['Emission Strength'].default_value = 0.0
    M[name] = m


def build_sail():
    m = new_mat('M_sail'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    uv = N(nt, 'ShaderNodeUVMap')
    ln = N(nt, 'ShaderNodeVectorMath', operation='LENGTH')
    L(nt, uv.outputs['UV'], ln.inputs[0])
    r = sock(ln, 'Value', out=True)
    disc = mrange(nt, r, 0.118, 0.11)               # inner coin
    ring = math_(nt, 'MULTIPLY', mrange(nt, r, 0.13, 0.137), mrange(nt, r, 0.165, 0.158))
    mask = math_(nt, 'ADD', disc, ring, clamp=True)
    oi = N(nt, 'ShaderNodeObjectInfo')
    cloth = rgb(nt, lin('#F1EADB')).outputs[0]
    L(nt, mix(nt, mask, cloth, oi.outputs['Color']), p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.9
    p.inputs['Specular IOR Level'].default_value = 0.15
    M['sail'] = m


def build_beam():
    m = new_mat('M_beam'); nt = m.node_tree
    for n in list(nt.nodes):
        if n.type == 'BSDF_PRINCIPLED':
            nt.nodes.remove(n)
    out = nt.nodes['Material Output']
    tc = N(nt, 'ShaderNodeTexCoord')
    sx = N(nt, 'ShaderNodeSeparateXYZ'); L(nt, tc.outputs['Object'], sx.inputs[0])
    along = mrange(nt, sx.outputs['X'], 0.0, 18.0, 1.0, 0.0, smooth=False)
    along = math_(nt, 'POWER', along, 1.8)
    lw = N(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    edge = math_(nt, 'POWER', math_(nt, 'SUBTRACT', 1.0, lw.outputs['Facing']), 2.5)
    k = N(nt, 'ShaderNodeValue', name='BEAM_STRENGTH'); k.outputs[0].default_value = 0.0
    s = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', along, edge), k.outputs[0])
    em = N(nt, 'ShaderNodeEmission'); em.inputs['Color'].default_value = (*lin('#FFD9A0'), 1)
    L(nt, s, em.inputs['Strength'])
    tr = N(nt, 'ShaderNodeBsdfTransparent')
    add = N(nt, 'ShaderNodeAddShader')
    L(nt, tr.outputs[0], add.inputs[0]); L(nt, em.outputs[0], add.inputs[1])
    L(nt, add.outputs[0], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'
    m.use_backface_culling = False
    M['beam'] = m


def build_sky_card():
    m = new_mat('M_sky'); nt = m.node_tree
    for n in list(nt.nodes):
        if n.type == 'BSDF_PRINCIPLED':
            nt.nodes.remove(n)
    out = nt.nodes['Material Output']
    tc = N(nt, 'ShaderNodeTexCoord')
    sx = N(nt, 'ShaderNodeSeparateXYZ'); L(nt, tc.outputs['Object'], sx.inputs[0])
    h = mrange(nt, sx.outputs['Z'], 0.0, 9.0, 0.0, 1.0, smooth=False)
    ramp = N(nt, 'ShaderNodeValToRGB', name='SKY_RAMP'); L(nt, h, ramp.inputs['Fac'])
    # sun / moon glow centred at (GLOW_X, GLOW_Z) in card space
    gx = N(nt, 'ShaderNodeValue', name='GLOW_X'); gz = N(nt, 'ShaderNodeValue', name='GLOW_Z')
    dx = math_(nt, 'SUBTRACT', sx.outputs['X'], gx.outputs[0])
    dz = math_(nt, 'SUBTRACT', sx.outputs['Z'], gz.outputs[0])
    d = math_(nt, 'SQRT', math_(nt, 'ADD', math_(nt, 'MULTIPLY', dx, dx), math_(nt, 'MULTIPLY', dz, dz)))
    halo = math_(nt, 'POWER', mrange(nt, d, 9.0, 0.0, 0.0, 1.0, smooth=False), 2.0)
    disc = mrange(nt, d, 0.62, 0.56)
    gcol = rgb(nt, (1, 1, 1), 'GLOW_COL').outputs[0]
    gk = N(nt, 'ShaderNodeValue', name='GLOW_K')
    glow = math_(nt, 'MULTIPLY', math_(nt, 'ADD', math_(nt, 'MULTIPLY', halo, 0.55), disc), gk.outputs[0])
    col = mix(nt, math_(nt, 'MINIMUM', glow, 1.0), ramp.outputs['Color'], gcol)
    # stars (night only via STAR_K)
    vor = N(nt, 'ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 2.2
    L(nt, tc.outputs['Object'], vor.inputs['Vector'])
    star = mrange(nt, vor.outputs['Distance'], 0.06, 0.03)
    sk = N(nt, 'ShaderNodeValue', name='STAR_K')
    star = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', star, sk.outputs[0]), mrange(nt, sx.outputs['Z'], 1.5, 4.0))
    col = mix(nt, star, col, (1, 1, 1))
    em = N(nt, 'ShaderNodeEmission'); L(nt, col, em.inputs['Color'])
    L(nt, em.outputs[0], out.inputs['Surface'])
    M['sky'] = m


def build_water(sdf_img, fwd, d_card, t_center):
    m = new_mat('M_water'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = N(nt, 'ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    mp = N(nt, 'ShaderNodeMapping', vector_type='POINT')
    mp.inputs['Scale'].default_value = (1 / SDF_SPAN, 1 / SDF_SPAN, 1)
    mp.inputs['Location'].default_value = (0.5, 0.5, 0)
    L(nt, obj, mp.inputs['Vector'])
    im = N(nt, 'ShaderNodeTexImage', interpolation='Linear', extension='EXTEND')
    im.image = sdf_img
    L(nt, mp.outputs['Vector'], im.inputs['Vector'])
    sep = N(nt, 'ShaderNodeSeparateColor'); L(nt, im.outputs['Color'], sep.inputs[0])
    d = math_(nt, 'MULTIPLY', sep.outputs['Red'], SDF_DMAX)
    wake = sep.outputs['Green']
    n1 = noise_tex(nt, obj, 1.6, 2.0)
    n2 = noise_tex(nt, obj, 4.5, 1.0)
    n3 = noise_tex(nt, obj, 9.0, 1.0)
    dn = math_(nt, 'ADD', d, math_(nt, 'MULTIPLY', math_(nt, 'SUBTRACT', n1, 0.5), 0.28))
    foam_a = mrange(nt, dn, 0.17, 0.10)                                     # contact band
    band = mrange(nt, math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', dn, 0.40)), 0.05, 0.025)
    foam_b = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', band, mrange(nt, n2, 0.47, 0.55)), 0.9)
    foam_w = math_(nt, 'MULTIPLY', wake, mrange(nt, n3, 0.38, 0.6))
    # sparse wind crests offshore (anisotropic noise)
    mp2 = N(nt, 'ShaderNodeMapping', vector_type='POINT')
    mp2.inputs['Scale'].default_value = (0.5, 2.6, 1)
    mp2.inputs['Rotation'].default_value = (0, 0, math.radians(35))
    L(nt, obj, mp2.inputs['Vector'])
    n4 = noise_tex(nt, mp2.outputs['Vector'], 1.4, 1.0)
    crest = math_(nt, 'MULTIPLY', mrange(nt, n4, 0.735, 0.75), mrange(nt, d, 1.6, 3.2))
    foam = math_(nt, 'MAXIMUM', math_(nt, 'MAXIMUM', foam_a, foam_b), foam_w)
    ramp = N(nt, 'ShaderNodeValToRGB'); L(nt, sep.outputs['Red'], ramp.inputs['Fac'])
    set_ramp(ramp, [(0.0, lin('#9FDCCB')), (0.05, lin('#79C7BC')), (0.16, lin('#3E9FAC')),
                    (0.42, lin('#28799A')), (0.9, lin('#1D5878'))])
    # horizon haze by ground distance along camera forward
    dot = N(nt, 'ShaderNodeVectorMath', operation='DOT_PRODUCT')
    L(nt, obj, dot.inputs[0]); dot.inputs[1].default_value = (fwd.x, fwd.y, 0)
    proj0 = t_center.x * fwd.x + t_center.y * fwd.y
    haze = mrange(nt, sock(dot, 'Value', out=True), proj0 + 4.5, proj0 + d_card, 0.0, 0.9)
    hz = rgb(nt, (0.5, 0.5, 0.5), 'HAZE').outputs[0]
    water = mix(nt, haze, ramp.outputs['Color'], hz)
    fc = rgb(nt, lin('#F3F0E8'), 'FOAM').outputs[0]
    water = mix(nt, math_(nt, 'MULTIPLY', crest, 0.22), water, fc)      # faint wind streaks, not foam
    L(nt, mix(nt, foam, water, fc), p.inputs['Base Color'])
    L(nt, mrange(nt, foam, 0, 1, 0.14, 0.9, smooth=False), p.inputs['Roughness'])
    p.inputs['Specular IOR Level'].default_value = 0.5
    bump = N(nt, 'ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.10
    bump.inputs['Distance'].default_value = 0.05
    L(nt, noise_tex(nt, obj, 2.4, 3.0), bump.inputs['Height'])
    L(nt, bump.outputs['Normal'], p.inputs['Normal'])
    M['water'] = m


# ---------------------------------------------------------------- mesh helpers


def to_obj(name, bm, mat=None, color=None, face_color=None, jitter=0.0, smooth=False, seed=0,
           loc=(0, 0, 0), rz=0.0, bevel=0.0, parent=None, shadow=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); COLL.objects.link(ob)
    ob.location = loc; ob.rotation_euler.z = rz
    if parent:
        ob.parent = parent
    me.materials.append(mat or M['palette'])
    if (mat is None or mat == M['palette']) and (color or face_color):
        rng = random.Random(seed)
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        buf = np.zeros((len(me.loops), 4), np.float32)
        for poly in me.polygons:
            c = face_color(poly) if face_color else color
            if jitter:
                k = 1 + rng.uniform(-jitter, jitter)
                c = tuple(min(1.0, x * k) for x in c)
            buf[list(poly.loop_indices)] = (*c, 1)
        attr.data.foreach_set('color', buf.ravel())
    me.polygons.foreach_set('use_smooth', [smooth] * len(me.polygons))
    if bevel:
        b = ob.modifiers.new('Bevel', 'BEVEL'); b.width = bevel; b.segments = 2
        b.limit_method = 'ANGLE'; b.harden_normals = False
    ob.visible_shadow = shadow
    return ob


def bm_box(sx, sy, sz, at=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(at) @ Matrix.Diagonal((sx, sy, sz, 1)))
    return bm


def bm_cyl(r1, r2, h, segs=24, at=(0, 0, 0), cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r1, radius2=r2,
                          depth=h, matrix=Matrix.Translation((at[0], at[1], at[2] + h / 2)))
    return bm


def bm_torus(R, r, segs=32, rsegs=6, z=0.0):
    bm = bmesh.new(); rings = []
    for i in range(segs):
        a = 2 * math.pi * i / segs; ring = []
        for j in range(rsegs):
            b = 2 * math.pi * j / rsegs
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z + r * math.sin(b))))
        rings.append(ring)
    for i in range(segs):
        for j in range(rsegs):
            a, b = rings[i], rings[(i + 1) % segs]
            bm.faces.new((a[j], b[j], b[(j + 1) % rsegs], a[(j + 1) % rsegs]))
    return bm


def bm_rock(r, seed, sub=1, squash=0.7):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        n = noise.noise(v.co * 1.7 + Vector((seed * 3.1, seed, 0)))
        v.co *= 1 + 0.28 * n
        v.co.z *= squash
    return bm


def add_bm(dst, src):
    me = bpy.data.meshes.new('tmp'); src.to_mesh(me); src.free()
    dst.from_mesh(me); bpy.data.meshes.remove(me)


# ---------------------------------------------------------------- island
def island_r(t):
    return 4.4 * (1 + 0.14 * math.sin(2 * t + 0.6) + 0.08 * math.sin(3 * t + 1.9)
                  + 0.05 * math.sin(5 * t + 0.4) + 0.02 * math.sin(9 * t + 2.0))


def prism(name, center, rfun, levels, segs, top_color, seed, cap=True):
    """Faceted rock prism. levels = [(z, scale, noise_amp)], bottom->top. Returns (obj, waterline poly)."""
    cx, cy = center
    bm = bmesh.new(); rings = []
    for li, (z, s, amp) in enumerate(levels):
        ring = []
        for i in range(segs):
            t = 2 * math.pi * i / segs
            r = rfun(t) * s
            x, y = math.cos(t) * r * 1.12, math.sin(t) * r
            nv = noise.noise(Vector((x * 0.55 + seed, y * 0.55, z * 1.4)))
            r2 = 1 + amp * nv / max(1.0, rfun(t))
            ring.append(bm.verts.new((cx + x * r2, cy + y * r2, z + 0.06 * amp * noise.noise(Vector((x, y, seed))))))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    if cap:
        ztop = levels[-1][0]
        c = bm.verts.new((cx, cy, ztop))
        top = rings[-1]
        for i in range(segs):
            bm.faces.new((c, top[i], top[(i + 1) % segs]))
    # waterline polygon from the actual noisy rings
    wl = []
    for i in range(segs):
        for a, b in zip(rings, rings[1:]):
            za, zb = a[i].co.z, b[i].co.z
            if za <= 0 <= zb:
                f = (0 - za) / (zb - za)
                p = a[i].co.lerp(b[i].co, f)
                wl.append((p.x, p.y)); break
    ztop = levels[-1][0]

    def fc(poly):
        if poly.normal.z > 0.85 and poly.center.z > ztop - 0.02:
            return top_color
        z = poly.center.z
        if z < 0.06:
            return PAL['rock_wet']
        n = noise.noise(Vector((poly.center.x * 0.7, poly.center.y * 0.7, z * 3.0 + seed)))
        return PAL['rock_dark'] if n > 0.18 else PAL['rock']
    ob = to_obj(name, bm, face_color=fc, jitter=0.07, seed=seed)
    return ob, wl


def turf(name, center, rfun, z, segs, seed, inset=0.965, thick=0.12):
    cx, cy = center
    bm = bmesh.new(); lo, hi = [], []
    for i in range(segs):
        t = 2 * math.pi * i / segs
        r = rfun(t)
        x, y = math.cos(t) * r * 1.12, math.sin(t) * r
        nv = noise.noise(Vector((x * 0.55 + seed, y * 0.55, z * 1.4)))
        k = inset * (1 + 0.05 * nv / max(1.0, r))
        lo.append(bm.verts.new((cx + x * k, cy + y * k, z - 0.04)))
        hi.append(bm.verts.new((cx + x * k * 0.985, cy + y * k * 0.985, z + thick)))
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    # concentric rings (not a fan) so the lawn can carry mottled tone patches
    prev = hi
    for k, f in enumerate((0.86, 0.7, 0.52, 0.34, 0.17)):
        ring = []
        for i in range(segs):
            v0 = hi[i].co
            x, y = cx + (v0.x - cx) * f, cy + (v0.y - cy) * f
            ring.append(bm.verts.new((x, y, z + thick + 0.018 * (1 + noise.noise(Vector((x * 0.6, y * 0.6, seed)))) * min(1, 3 * (1 - f)))))
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((prev[i], prev[j], ring[j], ring[i]))
        prev = ring
    c = bm.verts.new((cx, cy, z + thick + 0.05))
    for i in range(segs):
        bm.faces.new((c, prev[i], prev[(i + 1) % segs]))

    def fc(p):
        if p.normal.z < 0.7:
            return PAL['grass_side']
        n = noise.noise(Vector((p.center.x * 0.9, p.center.y * 0.9, seed + 0.5)))
        return PAL['grass_lo'] if n < -0.3 else (PAL['grass_hi'] if n > 0.35 else PAL['grass'])
    return to_obj(name, bm, face_color=fc, jitter=0.03, seed=seed)


# ---------------------------------------------------------------- props
def lighthouse(base):
    bx, by, bz = base
    face = math.radians(225)
    parts = []
    parts.append(to_obj('lh_plinth', bm_cyl(0.82, 0.78, 0.32, 8, (bx, by, bz - 0.05)), color=PAL['stone'], bevel=0.02))
    parts.append(to_obj('lh_plinth_cap', bm_cyl(0.84, 0.84, 0.06, 8, (bx, by, bz + 0.27)), color=PAL['stone_dark'], bevel=0.01))
    z0, H, r0, r1 = bz + 0.33, 3.7, 0.56, 0.36
    bands = [(0.0, 0.22, 'white'), (0.22, 0.40, 'red'), (0.40, 0.62, 'white'), (0.62, 0.80, 'red'), (0.80, 1.0, 'white')]
    for i, (a, b, c) in enumerate(bands):
        ra, rb = r0 + (r1 - r0) * a, r0 + (r1 - r0) * b
        parts.append(to_obj(f'lh_tower{i}', bm_cyl(ra, rb, H * (b - a), 40, (bx, by, z0 + H * a)), color=PAL[c], smooth=True))
    zt = z0 + H
    parts.append(to_obj('lh_corbel', bm_cyl(r1, 0.6, 0.2, 40, (bx, by, zt)), color=PAL['white'], smooth=True))
    parts.append(to_obj('lh_gallery', bm_cyl(0.66, 0.66, 0.07, 40, (bx, by, zt + 0.2)), color=PAL['iron'], bevel=0.01))
    zg = zt + 0.27
    rail = bm_torus(0.63, 0.014, 40, 5, zg + 0.3)
    add_bm(rail, bm_torus(0.63, 0.01, 40, 5, zg + 0.16))
    for i in range(20):
        a = 2 * math.pi * i / 20
        add_bm(rail, bm_cyl(0.012, 0.012, 0.3, 5, (bx * 0 + 0.63 * math.cos(a), 0.63 * math.sin(a), zg)))
    r_ob = to_obj('lh_rail', rail, color=PAL['iron'], loc=(bx, by, 0))
    parts.append(r_ob)
    parts.append(to_obj('lh_lantern_wall', bm_cyl(0.33, 0.33, 0.16, 16, (bx, by, zg)), color=PAL['red'], bevel=0.01))
    zl = zg + 0.16
    glass = to_obj('lh_glass', bm_cyl(0.3, 0.3, 0.46, 16, (bx, by, zl), cap=False), mat=M['M_lamp'])
    mull = bmesh.new()
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8
        add_bm(mull, bm_box(0.03, 0.03, 0.46, (0.305 * math.cos(a), 0.305 * math.sin(a), zl + 0.23)))
    add_bm(mull, bm_torus(0.31, 0.018, 24, 4, zl + 0.46))
    parts.append(to_obj('lh_mullions', mull, color=PAL['iron'], loc=(bx, by, 0)))
    zr = zl + 0.46
    parts.append(to_obj('lh_roof', bm_cyl(0.42, 0.04, 0.36, 24, (bx, by, zr)), color=PAL['red'], smooth=True))
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.06,
                                                 matrix=Matrix.Translation((bx, by, zr + 0.4)))
    add_bm(bm, bm_cyl(0.012, 0.012, 0.3, 5, (bx, by, zr + 0.4)))
    parts.append(to_obj('lh_finial', bm, color=PAL['brass'], smooth=True))
    # door + small windows facing camera
    ux, uy = math.cos(face), math.sin(face)
    door = bm_box(0.08, 0.34, 0.56, (0, 0, 0.28))
    parts.append(to_obj('lh_door', door, color=PAL['door'], loc=(bx + ux * 0.54, by + uy * 0.54, z0), rz=face))
    parts.append(to_obj('lh_door_hood', bm_box(0.18, 0.46, 0.06, (0, 0, 0)), color=PAL['white'],
                        loc=(bx + ux * 0.56, by + uy * 0.56, z0 + 0.62), rz=face, bevel=0.01))
    wins = []
    for k, (h, da) in enumerate([(1.3, 0.0), (2.2, 0.6), (3.0, -0.5)]):
        a = face + da
        rr = r0 + (r1 - r0) * (h / H) + 0.005
        wins.append(to_obj(f'lh_win{k}', bm_box(0.05, 0.13, 0.2), mat=M['M_window'],
                           loc=(bx + math.cos(a) * rr, by + math.sin(a) * rr, z0 + h), rz=a))
    return (bx, by, zl + 0.23), glass


def cottage(c, rz):
    cx, cy, cz = c
    W, D, Hh = 1.9, 1.15, 0.85
    obs = []
    obs.append(to_obj('cot_found', bm_box(W + 0.08, D + 0.08, 0.14, (0, 0, 0.07)), color=PAL['stone_dark'], bevel=0.015,
                      loc=c, rz=rz))
    body = bm_box(W, D, Hh, (0, 0, 0.14 + Hh / 2))
    # gable triangles on the short ends
    gh = 0.55
    for s in (-1, 1):
        x = s * W / 2
        vs = [body.verts.new((x, -D / 2, 0.14 + Hh)), body.verts.new((x, D / 2, 0.14 + Hh)), body.verts.new((x, 0, 0.14 + Hh + gh))]
        body.faces.new(vs if s > 0 else vs[::-1])
    obs.append(to_obj('cot_body', body, color=PAL['wall'], loc=c, rz=rz, bevel=0.012))
    pitch = math.atan2(gh, D / 2)
    slope = math.hypot(gh, D / 2) + 0.16
    for s in (-1, 1):
        bm = bm_box(W + 0.3, slope, 0.07)
        m = Matrix.Translation((0, s * (D / 4 + 0.03), 0.14 + Hh + gh / 2 + 0.02)) @ Matrix.Rotation(-s * pitch, 4, 'X')
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
        obs.append(to_obj(f'cot_roof{s}', bm, color=PAL['slate'], loc=c, rz=rz, bevel=0.012))
    obs.append(to_obj('cot_ridge', bm_box(W + 0.34, 0.1, 0.06, (0, 0, 0.14 + Hh + gh + 0.05)), color=PAL['slate_dark'],
                      loc=c, rz=rz, bevel=0.01))
    obs.append(to_obj('cot_chimney', bm_box(0.24, 0.24, 0.75, (W * 0.3, 0.18, 0.14 + Hh + 0.42)), color=PAL['stone'],
                      loc=c, rz=rz, bevel=0.012))
    obs.append(to_obj('cot_chimcap', bm_box(0.3, 0.3, 0.05, (W * 0.3, 0.18, 0.14 + Hh + 0.82)), color=PAL['stone_dark'],
                      loc=c, rz=rz))
    # door on the front long side (-y), windows
    obs.append(to_obj('cot_door', bm_box(0.3, 0.06, 0.52, (-0.35, -D / 2 - 0.01, 0.14 + 0.26)), color=PAL['door'],
                      loc=c, rz=rz))
    for k, x in enumerate((0.25, 0.68, -0.75)):
        obs.append(to_obj(f'cot_win{k}', bm_box(0.24, 0.05, 0.3, (x, -D / 2 - 0.01, 0.14 + 0.5)), mat=M['M_window'],
                          loc=c, rz=rz))
        obs.append(to_obj(f'cot_sill{k}', bm_box(0.3, 0.09, 0.04, (x, -D / 2 - 0.02, 0.14 + 0.33)), color=PAL['white'],
                          loc=c, rz=rz))
    obs.append(to_obj('cot_win_gable', bm_box(0.05, 0.22, 0.26, (-W / 2 - 0.01, 0, 0.14 + 0.5)), mat=M['M_window'], loc=c, rz=rz))
    # lean-to shed
    sh = bm_box(0.7, 0.8, 0.55, (W / 2 + 0.36, 0.05, 0.14 + 0.275))
    obs.append(to_obj('cot_shed', sh, color=PAL['timber'], loc=c, rz=rz, bevel=0.01))
    bm = bm_box(0.86, 0.96, 0.06)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((W / 2 + 0.38, 0.05, 0.14 + 0.62)) @ Matrix.Rotation(-0.35, 4, 'Y'),
                        verts=bm.verts)
    obs.append(to_obj('cot_shed_roof', bm, color=PAL['slate_dark'], loc=c, rz=rz, bevel=0.01))
    return obs


def crown(p, s, seed):
    x, y, z = p
    to_obj(f'trunk{seed}', bm_cyl(0.06 * s, 0.045 * s, 0.55 * s, 6, (0, 0, 0)), color=PAL['trunk'], loc=(x, y, z))
    rng = random.Random(seed)
    bm = bmesh.new()
    for k in range(3):
        lobe = bm_rock((0.42 - 0.09 * k) * s, seed * 5 + k, 1, 0.85)
        o = Vector((rng.uniform(-0.15, 0.15) * s, rng.uniform(-0.15, 0.15) * s, (0.62 + 0.25 * k) * s))
        bmesh.ops.translate(lobe, vec=o, verts=lobe.verts)
        add_bm(bm, lobe)
    to_obj(f'crown{seed}', bm, face_color=lambda q: PAL['leaf2'] if q.normal.z > 0.35 else PAL['leaf'], jitter=0.08,
           seed=seed, loc=(x, y, z))


def hull_mesh(Lh, B, fb, dr, color, n=16):
    """Hull along +x (bow at +x), waterline z=0. Returns (bmesh, waterline poly local)."""
    bm = bmesh.new(); secs = []; wl_port, wl_stbd = [], []
    for i in range(n + 1):
        u = -1 + 2 * i / n
        x = u * Lh / 2
        w = B / 2 * ((1 - max(u, 0) ** 2.2) ** 0.55 if u >= 0 else (1 - 0.3 * u * u))
        w = max(w, 0.004)
        zt = fb * (1 + 0.35 * max(u, 0) ** 2 + 0.08 * u * u)
        zb = -dr * (1 - max(u, 0) ** 3) * (1 - 0.25 * u * u)
        prof = [(w, zt), (w * 0.995, zt - 0.045), (w * 0.94, 0.0), (w * 0.62, zb * 0.82), (0, zb)]
        pts = prof + [(-yy, zz) for yy, zz in reversed(prof[:-1])]
        secs.append([bm.verts.new((x, yy, zz)) for yy, zz in pts])
        wl_port.append((x, w * 0.94)); wl_stbd.append((x, -w * 0.94))
    for a, b in zip(secs, secs[1:]):
        for j in range(len(a) - 1):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
        bm.faces.new((a[-1], b[-1], b[0], a[0]))   # deck strip (gunwale to gunwale)
    bm.faces.new(secs[0][::-1])                    # transom
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.006)

    def fc(p):
        if p.normal.z > 0.8:
            return PAL['deck']
        z = p.center.z
        if z < -0.005:
            return PAL['antifoul']
        if z > fb * 0.82:
            return PAL['hull_cream']
        return color
    return bm, fc, wl_port + wl_stbd[::-1]


def sail_bm(foot, H, z0, belly, emblem=True, n=8, m=6):
    """Main sail in local xz plane: luff along mast (x=0), clew at x=-foot."""
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); rows = []
    for i in range(n + 1):
        v = i / n
        row = []
        for j in range(m + 1):
            s = j / m
            x = -foot * (1 - v) * s
            z = z0 + H * v + 0.06 * s * (1 - v)
            y = belly * math.sin(math.pi * s) * (1 - v) ** 0.6
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    cx, cz = -foot * 0.36, z0 + H * 0.33
    for i in range(n):
        for j in range(m):
            f = bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
            for lp in f.loops:
                co = lp.vert.co
                lp[uvl].uv = (((-co.x) - (-cx)) / H, (co.z - cz) / H) if emblem else (5, 5)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
    return bm


def jib_bm(p_head, p_tack, p_clew, belly):
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    n = 6; rows = []
    a, b, c = Vector(p_head), Vector(p_tack), Vector(p_clew)
    for i in range(n + 1):
        v = i / n
        l, r = b.lerp(a, v), c.lerp(a, v)
        row = []
        for j in range(5):
            s = j / 4
            p = l.lerp(r, s); p.y += belly * math.sin(math.pi * s) * (1 - v)
            row.append(bm.verts.new(p))
        rows.append(row)
    for i in range(n):
        for j in range(4):
            f = bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
            for lp in f.loops:
                lp[uvl].uv = (5, 5)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
    return bm


def boat(name, pos, heading, Lh, B, hull_col, emblem_col, heel=0.0, mast_h=None, cabin=False, jib=True, tack=1, furled=False):
    root = bpy.data.objects.new(name, None); COLL.objects.link(root)
    root.location = (pos[0], pos[1], 0.0)
    root.rotation_euler = (heel * tack, 0, heading)
    fb, dr = 0.17 * Lh / 1.8 + 0.04, 0.14 * Lh / 1.8
    bm, fc, wl = hull_mesh(Lh, B, fb, dr, hull_col)
    to_obj(name + '_hull', bm, face_color=fc, jitter=0.0, parent=root, smooth=False)
    mh = mast_h or Lh * 1.25
    mx = Lh * 0.12
    deck_z = fb * 0.95
    if cabin:
        to_obj(name + '_cabin', bm_box(Lh * 0.28, B * 0.5, 0.13, (-Lh * 0.05, 0, deck_z + 0.065)), color=PAL['hull_cream'],
               parent=root, bevel=0.012)
    to_obj(name + '_mast', bm_cyl(0.022, 0.016, mh, 6, (mx, 0, deck_z)), color=PAL['timber_dark'], parent=root)
    foot = Lh * 0.55
    boom_ang = 0.0 if furled else 0.35 * tack
    bmb = bm_cyl(0.016, 0.016, foot, 6, (0, 0, 0))
    bmesh.ops.transform(bmb, matrix=Matrix.Rotation(-math.pi / 2, 4, 'Y'), verts=bmb.verts)
    boom = to_obj(name + '_boom', bmb, color=PAL['timber_dark'], parent=root, loc=(mx, 0, deck_z + 0.2))
    boom.rotation_euler.z = boom_ang
    if furled:
        # sail flaked on the boom under a cover in the brand colour; jib rolled on the forestay
        cv = bm_cyl(0.075, 0.05, foot * 0.92, 10, (0, 0, 0))
        bmesh.ops.transform(cv, matrix=Matrix.Rotation(-math.pi / 2, 4, 'Y'), verts=cv.verts)
        to_obj(name + '_cover', cv, color=emblem_col, parent=root, loc=(mx - 0.03, 0, deck_z + 0.25), smooth=True)
        if jib:
            fs = bm_cyl(0.028, 0.008, 1.0, 6, (0, 0, 0))
            top, tk = Vector((mx + 0.02, 0, deck_z + mh * 0.85)), Vector((Lh / 2 - 0.04, 0, fb * 1.3))
            d = top - tk
            bmesh.ops.transform(fs, matrix=Matrix.Translation(tk) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
                                @ Matrix.Diagonal((1, 1, d.length, 1)), verts=fs.verts)
            to_obj(name + '_jibroll', fs, color=PAL['hull_cream'], parent=root, smooth=True)
        jib = False
    else:
        sl = to_obj(name + '_sail', sail_bm(foot, mh - 0.3, 0.0, 0.1 * tack, True), mat=M['sail'], parent=root,
                    loc=(mx, 0, deck_z + 0.22))
        sl.rotation_euler.z = boom_ang
        sl.color = (*emblem_col, 1)
    if jib:
        js = to_obj(name + '_jib', jib_bm((mx + 0.02, 0, deck_z + mh * 0.85), (Lh / 2 - 0.02, 0, fb * 1.3),
                                          (mx - 0.05, -0.12 * tack, deck_z + 0.18), 0.06 * tack), mat=M['sail'], parent=root)
        js.color = (1, 1, 1, 1)
    # masthead light
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=0.035,
                                                 matrix=Matrix.Translation((mx, 0, deck_z + mh + 0.02)))
    to_obj(name + '_light', bm, mat=M['M_lamp'], parent=root)
    # world-space waterline polygon (ignore heel)
    ch, sh_ = math.cos(heading), math.sin(heading)
    wpoly = [(pos[0] + x * ch - y * sh_, pos[1] + x * sh_ + y * ch) for x, y in wl]
    stern = Vector((pos[0] - Lh / 2 * ch, pos[1] - Lh / 2 * sh_))
    return root, wpoly, stern


# ---------------------------------------------------------------- SDF
SDF_N, SDF_SPAN, SDF_DMAX = 1024, 30.0, 6.0


def seg_min_dist(P, A, B, chunk=8192):
    AB = B - A; L2 = (AB ** 2).sum(1) + 1e-12
    out = np.empty(len(P), np.float32)
    for s in range(0, len(P), chunk):
        p = P[s:s + chunk]
        AP = p[:, None, :] - A[None]
        t = np.clip((AP * AB[None]).sum(2) / L2[None], 0, 1)
        D = AP - t[..., None] * AB[None]
        out[s:s + chunk] = np.sqrt((D ** 2).sum(2)).min(1)
    return out


def build_sdf(polys, circles, wakes):
    xs = (np.arange(SDF_N) + 0.5) / SDF_N * SDF_SPAN - SDF_SPAN / 2
    X, Y = np.meshgrid(xs, xs)
    P = np.stack([X.ravel(), Y.ravel()], 1).astype(np.float32)
    A, B = [], []
    for poly in polys:
        q = np.array(poly, np.float32)
        A.append(q); B.append(np.roll(q, -1, 0))
    d = seg_min_dist(P, np.concatenate(A), np.concatenate(B))
    for (cx, cy, r) in circles:
        d = np.minimum(d, np.maximum(0, np.hypot(P[:, 0] - cx, P[:, 1] - cy) - r))
    g = np.zeros(len(P), np.float32)
    for (a, b, w0, w1, k) in wakes:
        a = np.array(a, np.float32); b = np.array(b, np.float32); ab = b - a
        t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        dd = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        w = w0 + (w1 - w0) * t
        g = np.maximum(g, k * np.exp(-(dd / w) ** 2) * (1 - t) ** 1.4)
    print('SDF d range', float(d.min()), float(d.max()), 'foam frac', float((d < 0.17).mean()), 'wake max', float(g.max()))
    img = bpy.data.images.new('sea_sdf', SDF_N, SDF_N, float_buffer=True, alpha=False)
    px = np.zeros((SDF_N * SDF_N, 4), np.float32)
    px[:, 0] = np.clip(d / SDF_DMAX, 0, 1); px[:, 1] = g; px[:, 3] = 1
    img.pixels.foreach_set(px.ravel())
    path = os.path.join(ART, 'sea-sdf.png')     # R = coast distance / SDF_DMAX, G = wake
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    return img


# ================================================================ BUILD
t0 = time.time()
build_palette(); build_sail(); build_beam(); build_sky_card()
build_glow('M_lamp', lin('#3A4650'), lin('#FFD089'))
build_glow('M_window', lin('#2E3742'), lin('#FFB45E'))
M['cloud'] = new_mat('M_cloud'); M['cloud'].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0

polys, circles, wakes = [], [], []

isl, wl = prism('island_rock', (0, 0), island_r,
                [(-1.6, 1.13, 0.6), (-0.6, 1.08, 0.8), (0.0, 1.04, 0.7), (0.35, 1.01, 0.6), (0.65, 0.99, 0.45), (0.9, 0.975, 0.15)],
                72, PAL['grass'], seed=1, cap=True)
polys.append(wl)
turf('island_turf', (0, 0), island_r, 0.9, 72, seed=1)

K = (-1.2, 2.3)


def knoll_r(t):
    return 1.75 * (1 + 0.1 * math.sin(3 * t + 0.4) + 0.06 * math.sin(5 * t + 1.1))


_, kwl = prism('knoll_rock', K, knoll_r, [(-1.4, 1.14, 0.4), (-0.3, 1.09, 0.45), (0.6, 1.05, 0.35), (1.3, 1.01, 0.3), (1.8, 0.97, 0.12)],
               40, PAL['grass'], seed=4)
if kwl:
    polys.append(kwl)


def inside(x, y, m=0.86):
    t = math.atan2(y, x / 1.12)
    return math.hypot(x / 1.12, y) < island_r(t) * m
turf('knoll_turf', K, knoll_r, 1.8, 40, seed=4)

lamp_pos, glass_ob = lighthouse((K[0] + 0.05, K[1] + 0.1, 1.92))

cottage((1.25, 0.55, 1.02), math.radians(-35))

TREES = [((2.7, 1.8), 1.0), ((3.2, 1.0), 0.8), ((2.2, 2.5), 0.85), ((3.4, 2.0), 0.7), ((-2.6, -0.5), 1.05),
         ((-3.1, 0.4), 0.85), ((-2.2, -1.3), 0.7), ((0.6, 2.7), 0.9), ((-1.2, -2.4), 0.75), ((-0.4, -2.9), 0.6)]
for i, ((x, y), sc) in enumerate(TREES):
    if inside(x, y):
        crown((x, y, 1.0), sc, 30 + i)
for i, (x, y) in enumerate([(2.2, -1.6), (-0.6, -1.2), (-2.4, 1.0), (3.5, -0.3), (1.7, 2.6), (-3.4, -1.2), (0.2, -2.2), (3.0, 0.3)]):
    if not inside(x, y):
        continue
    to_obj(f'shrub{i}', bm_rock(0.22, 60 + i, 1, 0.7), face_color=lambda q: PAL['leaf2'] if q.normal.z > 0.4 else PAL['leaf'],
           jitter=0.08, seed=60 + i, loc=(x, y, 1.0))
# stepping-stone path: lighthouse door -> cottage -> jetty head
path = [(-1.0, 1.3), (-0.6, 0.75), (-0.15, 0.25), (0.4, -0.3), (0.95, -0.85), (1.45, -1.45), (1.9, -2.1)]
for i, (x, y) in enumerate(path):
    to_obj(f'step{i}', bm_cyl(0.14, 0.16, 0.05, 7, (0, 0, 0)), color=PAL['stone_dark'], jitter=0.06, seed=i,
           loc=(x, y, 1.02), rz=i * 0.7)

# set dressing: picket fence + vegetable plot by the cottage, flowers, flagpole
fen = bmesh.new()
f0, f1 = Vector((2.3, -0.55)), Vector((0.9, -1.45))
for k in range(12):
    p = f0.lerp(f1, k / 11)
    add_bm(fen, bm_box(0.04, 0.04, 0.26, (p.x, p.y, 1.02 + 0.13)))
for zz in (1.1, 1.22):
    d = f1 - f0; mid = (f0 + f1) / 2
    rb = bm_box(d.length, 0.025, 0.03)
    bmesh.ops.transform(rb, matrix=Matrix.Translation((mid.x, mid.y, zz)) @ Matrix.Rotation(math.atan2(d.y, d.x), 4, 'Z'), verts=rb.verts)
    add_bm(fen, rb)
to_obj('fence', fen, color=PAL['white'])
to_obj('plot', bm_box(1.0, 0.7, 0.06, (0, 0, 0.03)), color=PAL['soil'], loc=(2.3, -1.0, 1.0), rz=math.atan2(f1.y - f0.y, f1.x - f0.x))
veg = bmesh.new()
for r_ in range(3):
    for k in range(5):
        lp_ = Vector((-0.38 + k * 0.19, -0.2 + r_ * 0.2, 0))
        lp_.rotate(Matrix.Rotation(math.atan2(f1.y - f0.y, f1.x - f0.x), 3, 'Z'))
        add_bm(veg, bm_rock(0.07, 200 + r_ * 5 + k, 1, 0.8))
        bmesh.ops.translate(veg, vec=Vector((2.3 + lp_.x, -1.0 + lp_.y, 1.1)), verts=veg.verts[-12:])
to_obj('veg', veg, color=PAL['leaf2'], jitter=0.1, seed=3)
fl = bmesh.new(); rng = random.Random(11); fcols = []
for (cx_, cy_) in ((-1.9, 0.2), (0.3, 1.9), (-0.2, -2.2), (2.8, 1.2)):
    for k in range(9):
        b_ = bm_rock(0.045, rng.randint(0, 999), 1, 0.9)
        bmesh.ops.translate(b_, vec=Vector((cx_ + rng.uniform(-0.35, 0.35), cy_ + rng.uniform(-0.35, 0.35), 1.03)), verts=b_.verts)
        add_bm(fl, b_)
to_obj('flowers', fl, face_color=lambda q: (PAL['flower1'], PAL['flower2'], PAL['flower3'])[(q.index // 20) % 3])
to_obj('flagpole', bm_cyl(0.025, 0.018, 1.6, 6, (0, 0, 0)), color=PAL['white'], loc=(0.35, 2.25, 1.0))
fg = bm_box(0.5, 0.012, 0.3, (0.25, 0, 0))
to_obj('flag', fg, color=PAL['red'], loc=(0.35, 2.25, 2.4), rz=math.radians(160))

# boulders in the surf
for i, (x, y, r) in enumerate([(-5.4, -1.0, 0.55), (-4.8, -2.3, 0.35), (4.7, 3.2, 0.5), (-3.4, 4.6, 0.45),
                               (5.6, 1.0, 0.3), (-3.9, -3.5, 0.42), (0.6, 5.1, 0.38)]):
    to_obj(f'boulder{i}', bm_rock(r, 80 + i, 2, 0.75), face_color=lambda q: PAL['rock'] if q.center.z > 0.05 else PAL['rock_wet'],
           jitter=0.08, seed=80 + i, loc=(x, y, 0.0))
    circles.append((x, y, r * 0.95))

# ---- harbour: stone quay + open main pier + finger piers (berths face the camera)
tj = math.radians(-62)
dj = Vector((math.cos(tj), math.sin(tj), 0))          # pier axis, out to sea
ej = Vector((-dj.y, dj.x, 0))                          # lateral; berths sit on -ej (camera side)
S = Vector((island_r(tj) * math.cos(tj) * 1.12, island_r(tj) * math.sin(tj), 0)) * 0.93
deck_z, JL = 0.62, 5.6


def HW(a, b, z=0.0):
    """harbour-local (a along pier, b lateral, z) -> world"""
    p = S + dj * a + ej * b
    return Vector((p.x, p.y, z))


def box_into(dst, size, a, b, z, rz=0.0):
    bx = bm_box(*size)
    c = HW(a, b, z)
    bmesh.ops.transform(bx, matrix=Matrix.Translation(c) @ Matrix.Rotation(tj + rz, 4, 'Z'), verts=bx.verts)
    add_bm(dst, bx)


def rod(name, p, q, r, color):
    p, q = Vector(p), Vector(q); d = q - p
    bm = bm_cyl(r, r, d.length, 5, (0, 0, 0))
    ob = to_obj(name, bm, color=color, loc=p)
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return ob


planks, posts, beams = bmesh.new(), bmesh.new(), bmesh.new()
# main pier
for k in range(int(JL / 0.19)):
    box_into(planks, (0.17, 0.95, 0.05), 0.1 + k * 0.19, 0, deck_z)
for s in (-1, 1):
    box_into(beams, (JL, 0.08, 0.1), JL / 2, s * 0.42, deck_z - 0.08)
pile_ab = [(0.6 + k * (JL - 0.7) / 5, s * 0.44) for k in range(6) for s in (-1, 1)]
# finger piers on the camera side
FINGERS, FL, FW = (2.0, 4.3), 2.1, 0.45
for fa in FINGERS:
    for k in range(int(FL / 0.19)):
        box_into(planks, (0.17, FW, 0.05), fa, -0.5 - 0.1 - k * 0.19, deck_z, rz=math.pi / 2)
    for s in (-1, 1):
        box_into(beams, (0.08, FL, 0.1), fa + s * 0.19, -0.47 - FL / 2, deck_z - 0.08)
    pile_ab += [(fa + s * 0.21, -0.47 - FL * t) for t in (0.5, 1.0) for s in (-1, 1)]
for (a, b) in pile_ab:
    c = HW(a, b)
    add_bm(posts, bm_cyl(0.065, 0.06, deck_z + 1.02, 8, (c.x, c.y, -1.0)))
    circles.append((c.x, c.y, 0.07))
to_obj('pier_planks', planks, face_color=lambda q: PAL['timber'], jitter=0.12, seed=5)
to_obj('pier_piles', posts, color=PAL['timber_dark'])
to_obj('pier_beams', beams, color=PAL['timber_dark'])
# stone quay wall at the pier root, with bollards along its edge
qa0, qa1, qb0, qb1, qz = -0.7, 0.5, -1.7, 1.1, 0.76
q = bmesh.new(); box_into(q, (qa1 - qa0, qb1 - qb0, qz + 1.2), (qa0 + qa1) / 2, (qb0 + qb1) / 2, (qz - 1.2) / 2)
to_obj('quay_wall', q, color=PAL['stone_dark'], jitter=0.04, bevel=0.02)
q = bmesh.new(); box_into(q, (0.22, qb1 - qb0 + 0.1, 0.06), qa1 - 0.08, (qb0 + qb1) / 2, qz + 0.03)
to_obj('quay_coping', q, color=PAL['stone'], bevel=0.01)
polys.append([tuple(HW(a, b))[:2] for a, b in ((qa0, qb0), (qa1, qb0), (qa1, qb1), (qa0, qb1))])
q = bmesh.new(); box_into(q, (0.5, 1.0, 0.18), -0.95, -0.2, 0.9)
to_obj('quay_step', q, color=PAL['stone'], bevel=0.015)
BOLLARDS = [(qa1 - 0.12, -1.45, qz + 0.06), (qa1 - 0.12, 0.85, qz + 0.06)]
BOLLARDS += [(fa, -0.47 - FL + 0.12, deck_z + 0.025) for fa in FINGERS]
BOLLARDS += [(fa + s * 0.12, -1.3, deck_z + 0.025) for fa in FINGERS for s in (1,)]
BOLLARDS += [(JL - 0.12, s * 0.36, deck_z + 0.025) for s in (-1, 1)]
bol = bmesh.new()
for (a, b, z) in BOLLARDS:
    c = HW(a, b, z)
    add_bm(bol, bm_cyl(0.05, 0.045, 0.13, 10, tuple(c)))
    add_bm(bol, bm_cyl(0.068, 0.068, 0.03, 10, (c.x, c.y, c.z + 0.13)))
to_obj('bollards', bol, color=PAL['iron'], smooth=True)
# pier-head lamp + cargo
lp = HW(JL - 0.2, 0.36)
to_obj('pier_lamp_pole', bm_cyl(0.035, 0.03, 1.15, 6, (0, 0, 0)), color=PAL['iron'], loc=(lp.x, lp.y, deck_z))
to_obj('pier_lamp', bm_box(0.13, 0.13, 0.18), mat=M['M_lamp'], loc=(lp.x, lp.y, deck_z + 1.24))
to_obj('pier_lamp_cap', bm_cyl(0.12, 0.02, 0.1, 4, (0, 0, 0)), color=PAL['iron'], loc=(lp.x, lp.y, deck_z + 1.33))
jlamp_pos = Vector((lp.x, lp.y, deck_z + 1.24))
for i, a in enumerate((1.2, 3.3)):
    c = HW(a, 0.3)
    to_obj(f'crate{i}', bm_box(0.22, 0.22, 0.2, (0, 0, 0.1)), color=PAL['timber'], loc=(c.x, c.y, deck_z + 0.025), rz=tj + 0.3 * i, bevel=0.01)
c = HW(3.0, 0.32)
to_obj('barrel', bm_cyl(0.1, 0.1, 0.24, 10, (0, 0, 0)), color=PAL['red'], loc=(c.x, c.y, deck_z + 0.025), smooth=True)

# ---- boats: two moored in berths (sails furled, cover in brand colour), one under way
heading_in = math.atan2(ej.y, ej.x)          # bow toward the main pier
BERTHS = [  # (finger a, side, hull length, beam, hull colour, brand colour, name)
    (FINGERS[0], +1, 1.7, 0.6, PAL['hull_navy'], lin('#C9A44A'), 'boat_sloop'),
    (FINGERS[1], +1, 1.4, 0.55, PAL['hull_teal'], lin('#3AA675'), 'boat_cat'),
]
for (fa, side, Lh, Bm, hc, bc, nm) in BERTHS:
    a = fa + side * (FW / 2 + Bm / 2 + 0.05)
    b = -0.47 - 0.12 - Lh / 2
    c = HW(a, b)
    _, wp, _ = boat(nm, (c.x, c.y), heading_in, Lh, Bm, hc, bc, furled=True, jib=nm != 'boat_cat')
    polys.append(wp)
    fb = 0.17 * Lh / 1.8 + 0.04
    # fenders between hull and finger, mooring lines bow/stern to finger bollard + pier
    for t in (0.3, -0.25):
        fc_ = HW(fa + side * (FW / 2 + 0.03), b + t * Lh)
        to_obj(f'{nm}_fender{t}', bm_cyl(0.035, 0.035, 0.16, 8, (0, 0, 0)), color=PAL['hull_cream'], loc=(fc_.x, fc_.y, deck_z - 0.25), smooth=True)
    bow = HW(a - side * 0.05, b + Lh / 2 - 0.08, fb + 0.05)
    stern = HW(a - side * 0.1, b - Lh / 2 + 0.12, fb)
    rod(f'{nm}_line_bow', bow, HW(fa + side * 0.12, -1.3, deck_z + 0.14), 0.008, PAL['sand'])
    rod(f'{nm}_line_stern', stern, HW(fa, -0.47 - FL + 0.12, deck_z + 0.14), 0.008, PAL['sand'])
bpos = (-8.4, -2.6); bh = math.radians(12)
_, wp, st = boat('boat_cutter', bpos, bh, 2.3, 0.78, PAL['hull_red'], lin('#2F6FA8'), heel=math.radians(9), cabin=True, tack=-1)
polys.append(wp)
for stern, h, Lh in ((st, bh, 2.3),):
    back = Vector((-math.cos(h), -math.sin(h)))
    for sgn in (-1, 1):
        arm = back.copy(); arm.rotate(Matrix.Rotation(sgn * math.radians(19.5), 2))
        wakes.append((tuple(stern), tuple(stern + arm * Lh * 3.2), 0.05, 0.22, 0.95))
    wakes.append((tuple(stern), tuple(stern + back * Lh * 2.4), 0.10, 0.35, 0.8))

sdf = build_sdf(polys, circles, wakes)

# ---------------------------------------------------------------- camera & sea & sky
AZ = math.radians(225)
fwd = Vector((-math.cos(AZ), -math.sin(AZ), 0)).normalized()     # camera looks toward +x+y
T = Vector((0.6, -1.0, 0.9))                                     # framing target
D_CARD = 10.5
build_water(sdf, fwd, D_CARD, T)
bmw = bmesh.new(); bmesh.ops.create_grid(bmw, x_segments=1, y_segments=1, size=60)
to_obj('sea', bmw, mat=M['water'], shadow=False)
card_c = T + fwd * D_CARD
bmc = bmesh.new(); bmesh.ops.create_grid(bmc, x_segments=1, y_segments=1, size=40,
                                          matrix=Matrix.Translation((0, 0, 20)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
card = to_obj('sky_card', bmc, mat=M['sky'], shadow=False, loc=(card_c.x, card_c.y, -0.5))
card.rotation_euler.z = AZ + math.pi / 2 + math.pi
card.visible_diffuse = False
# clouds in front of the card
for i, (lat, z, s) in enumerate([(-10.5, 2.2, 0.55), (-4.0, 3.1, 0.4), (5.5, 2.6, 0.6), (11.5, 3.3, 0.45)]):
    side = Vector((-fwd.y, fwd.x, 0))
    c = card_c - fwd * 1.5 + side * lat
    bm = bmesh.new(); rng = random.Random(90 + i)
    for k in range(7):
        lobe = bm_rock(rng.uniform(0.35, 0.7) * s, 90 + i * 7 + k, 2, 0.5)
        bmesh.ops.scale(lobe, vec=(3.2, 1.0, 0.42), verts=lobe.verts)
        bmesh.ops.translate(lobe, vec=Vector((rng.uniform(-3.5, 3.5) * s, rng.uniform(-0.3, 0.3), rng.uniform(-0.1, 0.25) * s)), verts=lobe.verts)
        add_bm(bm, lobe)
    cl = to_obj(f'cloud{i}', bm, mat=M['cloud'], loc=(c.x, c.y, z), rz=AZ + math.pi / 2, shadow=False, smooth=True)

# beams + lights
beams_obs = []
for k, a in enumerate((math.radians(150), math.radians(330))):
    bm = bm_cyl(0.1, 1.5, 24.0, 32, (0, 0, -12.0), cap=False)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((12.0, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'), verts=bm.verts)
    b = to_obj(f'beam{k}', bm, mat=M['beam'], loc=lamp_pos, shadow=False, smooth=True)
    b.rotation_euler = (0, math.radians(4), a)
    beams_obs.append(b)


def add_light(name, kind, **kw):
    ld = bpy.data.lights.new(name, kind)
    ob = bpy.data.objects.new(name, ld); COLL.objects.link(ob)
    for k, v in kw.items():
        if k == 'loc':
            ob.location = v
        else:
            setattr(ld, k, v)
    return ob


sun = add_light('key', 'SUN', angle=math.radians(1.5))
lamp_light = add_light('lamp', 'POINT', loc=lamp_pos, shadow_soft_size=0.08, color=lin('#FFD089'))
jetty_light = add_light('jetty_lamp_l', 'POINT', loc=jlamp_pos - Vector((0, 0, 0.12)), shadow_soft_size=0.05, color=lin('#FFB45E'))
cot_light = add_light('cottage_l', 'POINT', loc=(1.25, 0.55, 1.55), shadow_soft_size=0.3, color=lin('#FFB45E'))


def aim_sun(az, el):
    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


# world
wt = bpy.data.worlds.new('W'); scene.world = wt
try:
    wt.use_nodes = True
except Exception:
    pass
wnt = wt.node_tree
wbg = wnt.nodes['Background']
wtc = N(wnt, 'ShaderNodeTexCoord'); wsx = N(wnt, 'ShaderNodeSeparateXYZ')
L(wnt, wtc.outputs['Generated'], wsx.inputs[0])
wramp = N(wnt, 'ShaderNodeValToRGB'); L(wnt, mrange(wnt, wsx.outputs['Z'], -0.1, 0.8, 0, 1, smooth=False), wramp.inputs['Fac'])
L(wnt, wramp.outputs['Color'], wbg.inputs['Color'])

# cameras
cams = {}
cd = bpy.data.cameras.new('iso'); cd.type = 'ORTHO'; cd.ortho_scale = 21.5; cd.clip_end = 400
ci = bpy.data.objects.new('cam_iso', cd); COLL.objects.link(ci)
el = math.radians(30)
back = Vector((math.cos(AZ) * math.cos(el), math.sin(AZ) * math.cos(el), math.sin(el)))
ci.location = T + back * 60
ci.rotation_euler = (-back).to_track_quat('-Z', 'Y').to_euler()
cd.shift_y = 0.05
cams['iso'] = ci
ch = bpy.data.cameras.new('hero'); ch.lens = 50; ch.clip_end = 400
co = bpy.data.objects.new('cam_hero', ch); COLL.objects.link(co)
el2 = math.radians(24)
back2 = Vector((math.cos(AZ) * math.cos(el2), math.sin(AZ) * math.cos(el2), math.sin(el2)))
co.location = T + Vector((0, 0, 0.6)) + back2 * 30
co.rotation_euler = (-back2).to_track_quat('-Z', 'Y').to_euler()
cams['hero'] = co

# ---------------------------------------------------------------- render setup
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
if ENGINE == 'cycles':
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dev in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = dev; prefs.get_devices()
            for d_ in prefs.devices:
                d_.use = True
            scene.cycles.device = 'GPU'; break
        except Exception:
            continue
    scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True
else:
    scene.render.engine = 'BLENDER_EEVEE'
    ee = scene.eevee
    ee.taa_render_samples = SAMPLES
    ee.use_raytracing = True
    ee.ray_tracing_method = 'SCREEN'
    ee.use_shadows = True
    ee.shadow_ray_count = 2
    ee.shadow_step_count = 8
    ee.use_fast_gi = True
try:
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception as e:
    print('colour mgmt:', e)

# compositor: bloom
cng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree')
scene.compositing_node_group = cng
cng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
rl = cng.nodes.new('CompositorNodeRLayers'); gl = cng.nodes.new('CompositorNodeGlare'); go = cng.nodes.new('NodeGroupOutput')
gl.inputs['Type'].default_value = 'Bloom'
try:
    gl.inputs['Quality'].default_value = 'High'
except Exception:
    pass
cng.links.new(rl.outputs['Image'], gl.inputs['Image']); cng.links.new(gl.outputs['Image'], go.inputs[0])
scene.render.use_compositing = True

sky = M['sky'].node_tree.nodes
wat = M['water'].node_tree.nodes
beamk = M['beam'].node_tree.nodes['BEAM_STRENGTH']


def card_glow_xz(world_dir_az, height):
    # position of the sun/moon glow in card object space (x along card width)
    side = Vector((-fwd.y, fwd.x, 0))
    d = Vector((math.cos(world_dir_az), math.sin(world_dir_az), 0))
    return -d.dot(side) * 14.0, height


def apply_state(st):
    if st == 'golden':
        aim_sun(math.radians(128), math.radians(22)); sun.data.energy = 4.0; sun.data.color = lin('#FFC08A')
        set_ramp(wramp, [(0, lin('#E9B48C')), (0.25, lin('#C9B3B0')), (1.0, lin('#7E9BC2'))]); wbg.inputs['Strength'].default_value = 0.9
        set_ramp(sky['SKY_RAMP'], [(0.0, lin('#F4C38E')), (0.18, lin('#EBB9A0')), (0.5, lin('#B7AFC3')), (1.0, lin('#7F9CC6'))])
        gx, gz = card_glow_xz(math.radians(128), 2.2)
        sky['GLOW_X'].outputs[0].default_value = gx; sky['GLOW_Z'].outputs[0].default_value = gz
        sky['GLOW_COL'].outputs[0].default_value = (*lin('#FFE2B0'), 1); sky['GLOW_K'].outputs[0].default_value = 0.9
        sky['STAR_K'].outputs[0].default_value = 0.0
        wat['HAZE'].outputs[0].default_value = (*lin('#D8B8A6'), 1)
        wat['FOAM'].outputs[0].default_value = (*lin('#FBF1E2'), 1)
        lamp_e, win_e, beam_e = 0.15, 0.0, 0.0
        cloud_c = lin('#F7EADF')
        lamp_light.data.energy = 0; jetty_light.data.energy = 0; cot_light.data.energy = 0
        gl.inputs['Strength'].default_value = 0.25; gl.inputs['Threshold'].default_value = 1.2
    else:
        aim_sun(math.radians(128), math.radians(38)); sun.data.energy = 1.1; sun.data.color = lin('#9DB4FF')
        set_ramp(wramp, [(0, lin('#3A4C78')), (0.3, lin('#26355C')), (1.0, lin('#141C38'))]); wbg.inputs['Strength'].default_value = 1.0
        set_ramp(sky['SKY_RAMP'], [(0.0, lin('#2B3B5E')), (0.2, lin('#1B2747')), (0.6, lin('#0E1530')), (1.0, lin('#080C1E'))])
        gx, gz = card_glow_xz(math.radians(128), 6.0)
        sky['GLOW_X'].outputs[0].default_value = gx; sky['GLOW_Z'].outputs[0].default_value = gz
        sky['GLOW_COL'].outputs[0].default_value = (*lin('#DDE6FF'), 1); sky['GLOW_K'].outputs[0].default_value = 0.6
        sky['STAR_K'].outputs[0].default_value = 0.8
        wat['HAZE'].outputs[0].default_value = (*lin('#22304F'), 1)
        wat['FOAM'].outputs[0].default_value = (*lin('#C9D6EA'), 1)
        lamp_e, win_e, beam_e = 40.0, 6.0, 0.45
        cloud_c = lin('#4A5778')
        lamp_light.data.energy = 220; jetty_light.data.energy = 25; cot_light.data.energy = 30
        gl.inputs['Strength'].default_value = 0.6; gl.inputs['Threshold'].default_value = 0.8
    M['M_lamp'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = lamp_e
    M['M_window'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = win_e
    beamk.outputs[0].default_value = beam_e
    M['cloud'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*cloud_c, 1)
    for b in beams_obs:
        b.hide_render = beam_e == 0


# ---------------------------------------------------------------- stats
dg = bpy.context.evaluated_depsgraph_get()
tris, by_group, mats = 0, {}, set()
for ob in scene.objects:
    if ob.type != 'MESH':
        continue
    ev = ob.evaluated_get(dg); me = ev.to_mesh(); me.calc_loop_triangles()
    n = len(me.loop_triangles); tris += n
    g = ob.name.split('_')[0].rstrip('0123456789')
    by_group[g] = by_group.get(g, 0) + n
    for s in ob.material_slots:
        if s.material:
            mats.add(s.material.name)
    ev.to_mesh_clear()
stats = dict(triangles=tris, materials=sorted(mats), material_count=len(mats),
             mesh_objects=sum(1 for o in scene.objects if o.type == 'MESH'),
             triangles_by_group=dict(sorted(by_group.items(), key=lambda kv: -kv[1])), build_s=round(time.time() - t0, 1))
print('STATS', json.dumps(stats))
with open(os.path.join(ART, 'lookdev-stats.json'), 'w') as f:
    json.dump(stats, f, indent=1)

if SAVE:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ART, 'lookdev.blend'), compress=True)

for cam in CAMS:
    scene.camera = cams[cam]
    for st in STATES:
        apply_state(st)
        out = os.path.join(ART, f'lookdev-{cam}-{st}{"-cycles" if ENGINE == "cycles" else ""}{SUFFIX}.png')
        scene.render.filepath = out
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print('RENDERED', out, round(time.time() - t1, 1), 's')
