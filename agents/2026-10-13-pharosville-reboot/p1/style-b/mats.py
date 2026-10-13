"""Style B materials. Every lit surface goes through the WashCore group:

    irr   = lighting (sun + shadows + sky + point lights)        [ShaderToRGB of a white Diffuse]
    t     = smoothstep(lo, hi, lum(irr) * (1 + jitter))          [soft 2-tone watercolour ramp]
    col   = albedo * hue(irr) * level(t) * mix(shadowTint, 1, t)
    col  *= wash blotches, granulation (shadow side), pigment pooling (fresnel), ink lines, hatching
    out   = Emission(col)                                         [the ramp IS the lighting model]

WebGL2 port: one uber fragment shader. irr = N.L * shadowmap + hemisphere ambient + clustered point
lights; the ramp is a 1D LUT; blotch/granulation sample one tiling noise texture (paper.png channels);
hatch + course lines are world/UV-space sin() bands. All the knobs below live in one UBO ("State").
"""
import bpy, os, math
from lib import *

TEX = os.path.join(HERE, 'tex')
_REG = {}

STATE_DEFAULTS = {
    # name: (type, default)
    'shadow_tint': ('C', (0.55, 0.55, 0.72)),
    'ink': ('C', lin('#3B2A1F')),
    'ramp_lo': ('F', 0.18), 'ramp_hi': ('F', 0.42),
    'lvl_shadow': ('F', 0.55), 'lvl_lit': ('F', 1.0), 'lin_k': ('F', 0.25),
    'hatch_k': ('F', 0.35), 'hatch_sp': ('F', 0.6),
    'gran_k': ('F', 0.25), 'pool_k': ('F', 0.35), 'detail': ('F', 1.0), 'contour_k': ('F', 0.3),
    'win_e': ('F', 0.0), 'lamp_e': ('F', 0.0), 'lantern_e': ('F', 0.0), 'riding_e': ('F', 0.0),
    'sun_dir': ('V', (0.0, 0.0, 1.0)), 'spec_dir': ('V', (0.0, 0.0, 1.0)), 'spec_col': ('C', (1, 0.9, 0.7)), 'night': ('F', 0.0),
    'cover_tone': ('F', 1.0), 'win_frac': ('F', 1.0), 'cloud_cov': ('F', -1.0),
}


def state_group():
    g = bpy.data.node_groups.get('State')
    if g:
        return g
    g = bpy.data.node_groups.new('State', 'ShaderNodeTree')
    out = g.nodes.new('NodeGroupOutput')
    for k, (t, d) in STATE_DEFAULTS.items():
        st = {'C': 'NodeSocketColor', 'F': 'NodeSocketFloat', 'V': 'NodeSocketVector'}[t]
        g.interface.new_socket(k, in_out='OUTPUT', socket_type=st)
        if t == 'C':
            n = g.nodes.new('ShaderNodeRGB'); n.outputs[0].default_value = (*d, 1)
        elif t == 'F':
            n = g.nodes.new('ShaderNodeValue'); n.outputs[0].default_value = d
        else:
            n = g.nodes.new('ShaderNodeCombineXYZ')
            for i in range(3):
                n.inputs[i].default_value = d[i]
        n.name = k; n.label = k
        g.links.new(n.outputs[0], out.inputs[k])
    return g


def set_state(**kw):
    g = state_group()
    for k, v in kw.items():
        n = g.nodes[k]
        t = STATE_DEFAULTS[k][0]
        if t == 'C':
            n.outputs[0].default_value = (*v[:3], 1)
        elif t == 'F':
            n.outputs[0].default_value = v
        else:
            for i in range(3):
                n.inputs[i].default_value = v[i]


def S(nt):
    """State group node inside a tree; returns output accessor."""
    n = nt.nodes.get('__state')
    if n is None:
        n = nt.nodes.new('ShaderNodeGroup'); n.node_tree = state_group(); n.name = '__state'
    return lambda k: n.outputs[k]


def wash_core():
    g = bpy.data.node_groups.get('WashCore')
    if g:
        return g
    g = bpy.data.node_groups.new('WashCore', 'ShaderNodeTree')
    for name, st in (('Base', 'NodeSocketColor'), ('Lines', 'NodeSocketFloat'), ('Gran', 'NodeSocketFloat'),
                     ('Pool', 'NodeSocketFloat'), ('Hatch', 'NodeSocketFloat'), ('Blotch', 'NodeSocketFloat'),
                     ('Trans', 'NodeSocketFloat'), ('Spec', 'NodeSocketFloat')):
        g.interface.new_socket(name, in_out='INPUT', socket_type=st)
    g.interface.new_socket('Color', in_out='OUTPUT', socket_type='NodeSocketColor')
    g.interface.new_socket('Lit', in_out='OUTPUT', socket_type='NodeSocketFloat')
    nt = g
    gi = nt.nodes.new('NodeGroupInput'); go = nt.nodes.new('NodeGroupOutput')
    s = S(nt)
    geo = N(nt, 'ShaderNodeNewGeometry')
    P = geo.outputs['Position']
    # lighting
    dif = N(nt, 'ShaderNodeBsdfDiffuse'); dif.inputs['Color'].default_value = (1, 1, 1, 1)
    s2r = N(nt, 'ShaderNodeShaderToRGB'); L(nt, dif.outputs[0], s2r.inputs[0])
    irr = s2r.outputs['Color']
    # backlit translucency (sails, foliage)
    tr = N(nt, 'ShaderNodeBsdfTranslucent'); tr.inputs['Color'].default_value = (1, 1, 1, 1)
    s2r2 = N(nt, 'ShaderNodeShaderToRGB'); L(nt, tr.outputs[0], s2r2.inputs[0])
    irr = mix(nt, gi.outputs['Trans'], irr, s2r2.outputs['Color'], blend='ADD')
    # drifting cloud shadows: cookie noise projected along the sun onto z=0 (runtime: cookie texture)
    _, _, pz = sep_xyz(nt, P)
    _, _, lz = sep_xyz(nt, s('sun_dir'))
    P0 = vmath(nt, 'SUBTRACT', P, vmath(nt, 'SCALE', s('sun_dir'), scale=math_(nt, 'DIVIDE', pz, math_(nt, 'MAXIMUM', lz, 0.05))))
    ck = mrange(nt, noise_tex(nt, vmath(nt, 'SCALE', P0, scale=0.011), 1.0, 3.0, 0.55), sub(nt, 0.6, s('cloud_cov')), sub(nt, 0.7, s('cloud_cov')))
    irr = vmath(nt, 'SCALE', irr, scale=sub(nt, 1.0, mul(nt, ck, 0.55)))
    bw = N(nt, 'ShaderNodeRGBToBW'); L(nt, irr, bw.inputs[0])
    lum = bw.outputs[0]
    # watercolour edge jitter of the light/shadow boundary
    n_mid = noise_tex(nt, vmath(nt, 'SCALE', P, scale=0.55), 1.0, 3.0, 0.6)
    n_big = noise_tex(nt, vmath(nt, 'SCALE', P, scale=0.06), 1.0, 2.0, 0.5)
    lj = mul(nt, lum, add(nt, 1.0, mul(nt, sub(nt, n_mid, 0.5), 0.55)))
    t = mrange(nt, lj, s('ramp_lo'), s('ramp_hi'))
    # light hue (keeps lamp gold / moon blue), compressed level
    hue = vmath(nt, 'DIVIDE', irr, comb_xyz(nt, math_(nt, 'MAXIMUM', lum, 0.002), math_(nt, 'MAXIMUM', lum, 0.002),
                                                   math_(nt, 'MAXIMUM', lum, 0.002)))
    lvl = add(nt, add(nt, s('lvl_shadow'), mul(nt, sub(nt, s('lvl_lit'), s('lvl_shadow')), t)), mul(nt, lum, s('lin_k')))
    tint = mix(nt, t, s('shadow_tint'), (1, 1, 1))
    col = mix(nt, 1.0, gi.outputs['Base'], vmath(nt, 'SCALE', hue, scale=lvl), blend='MULTIPLY')
    col = mix(nt, 1.0, col, tint, blend='MULTIPLY')
    # wash blotches (low frequency value + slight hue drift)
    bl = add(nt, 1.0, mul(nt, mul(nt, sub(nt, n_big, 0.5), 0.5), gi.outputs['Blotch']))
    col = vmath(nt, 'SCALE', col, scale=bl)
    # granulation, mostly in the shadow side
    n_gr = noise_tex(nt, vmath(nt, 'SCALE', P, scale=2.2), 1.0, 8.0, 0.75)
    gr = mul(nt, mul(nt, mrange(nt, n_gr, 0.45, 0.75), gi.outputs['Gran']), mul(nt, s('gran_k'), add(nt, 0.35, mul(nt, sub(nt, 1.0, t), 0.65))))
    col = vmath(nt, 'SCALE', col, scale=sub(nt, 1.0, gr))
    # pigment pooling at silhouettes (fresnel)
    lw = N(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    fres = math_(nt, 'POWER', lw.outputs['Facing'], 1.6)
    pool = mul(nt, mul(nt, fres, gi.outputs['Pool']), s('pool_k'))
    pooled = mix(nt, 1.0, col, col, blend='MULTIPLY')        # deeper, more saturated pigment
    col = mix(nt, pool, col, pooled)
    # ink course lines (stone/tile/plank), faded by detail level
    lk = mul(nt, mul(nt, gi.outputs['Lines'], s('detail')), 0.55)
    col = mix(nt, lk, col, mix(nt, 0.6, s('ink'), col))
    # hatching on the shadow side: world-space diagonal planes
    hd = vmath(nt, 'DOT_PRODUCT', P, (0.62, -0.48, 0.62))
    hw = math_(nt, 'SINE', mul(nt, math_(nt, 'DIVIDE', hd, s('hatch_sp')), 2 * math.pi))
    hl = mrange(nt, hw, 0.45, 0.85)
    hm = mul(nt, mul(nt, hl, mrange(nt, t, 0.55, 0.05)), mul(nt, s('hatch_k'), gi.outputs['Hatch']))
    col = mix(nt, hm, col, mix(nt, 0.5, s('ink'), col))
    # tiny sheen (brass, wet stone): spec from the sun direction
    vdir = vmath(nt, 'NORMALIZE', geo.outputs['Incoming'])
    hv = vmath(nt, 'NORMALIZE', vmath(nt, 'ADD', vdir, s('sun_dir')))
    sp = math_(nt, 'POWER', math_(nt, 'MAXIMUM', vmath(nt, 'DOT_PRODUCT', geo.outputs['Normal'], hv), 0.0), 40.0)
    sp = mul(nt, mul(nt, sp, gi.outputs['Spec']), t)
    col = mix(nt, sp, col, s('spec_col'), blend='ADD')
    L(nt, col, go.inputs['Color'])
    L(nt, t, go.inputs['Lit'])
    return g


def _base_color(nt):
    """Vertex colour; alpha 0 marks the brand slot -> object colour (per-instance brandColor)."""
    a = N(nt, 'ShaderNodeAttribute', attribute_name='Col')
    oi = N(nt, 'ShaderNodeObjectInfo')
    s = S(nt)
    brand = mix(nt, s('cover_tone'), mix(nt, 0.0, oi.outputs['Color'], (0, 0, 0)), oi.outputs['Color'])
    return mix(nt, a.outputs['Alpha'], brand, a.outputs['Color']), a


def _emit_out(nt, out, col, ink_aov=1.0):
    em = N(nt, 'ShaderNodeEmission'); L(nt, col, em.inputs['Color'])
    L(nt, em.outputs[0], out.inputs['Surface'])
    aov = N(nt, 'ShaderNodeOutputAOV'); aov.aov_name = 'inkmask'
    oa = N(nt, 'ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='inkmask')
    # objects without the property read 0 -> treat as 1
    gt = math_(nt, 'GREATER_THAN', oa.outputs['Fac'], 0.0)
    L(nt, mul(nt, add(nt, oa.outputs['Fac'], sub(nt, 1.0, gt)), ink_aov), aov.inputs['Value'])
    return em


def wash(name, lines=None, gran=1.0, pool=1.0, hatch=1.0, blotch=1.0, trans=0.0, spec=0.0):
    m, nt, out = new_mat(name)
    base, attr = _base_color(nt)
    wc = N(nt, 'ShaderNodeGroup'); wc.node_tree = wash_core()
    L(nt, base, wc.inputs['Base'])
    for k, v in (('Gran', gran), ('Pool', pool), ('Hatch', hatch), ('Blotch', blotch), ('Trans', trans), ('Spec', spec)):
        wc.inputs[k].default_value = v
    if lines is not None:
        L(nt, lines(nt), wc.inputs['Lines'])
    _emit_out(nt, out, wc.outputs['Color'])
    return m


def _uv(nt):
    u = N(nt, 'ShaderNodeUVMap'); u.uv_map = 'UVMap'
    return sep_xyz(nt, u.outputs['UV'])


def band(nt, x, period, width):
    """1 on thin lines every `period`, 0 elsewhere."""
    f = math_(nt, 'FRACT', math_(nt, 'DIVIDE', x, period))
    d = math_(nt, 'MINIMUM', f, sub(nt, 1.0, f))
    return mrange(nt, d, width / period, width / period * 0.3)


def stone_lines(nt):
    u, v, _ = _uv(nt)
    row = math_(nt, 'FLOOR', math_(nt, 'DIVIDE', v, 0.55))
    off = mul(nt, math_(nt, 'MODULO', row, 2.0), 0.5)
    h = band(nt, v, 0.55, 0.035)
    vj = band(nt, add(nt, math_(nt, 'DIVIDE', u, 1.0), off), 1.0, 0.03)
    return mul(nt, math_(nt, 'MAXIMUM', h, mul(nt, vj, 0.8)), 0.9)


def roof_lines(nt):
    u, v, _ = _uv(nt)
    row = math_(nt, 'FLOOR', math_(nt, 'DIVIDE', v, 0.38))
    off = mul(nt, math_(nt, 'MODULO', row, 2.0), 0.5)
    h = band(nt, v, 0.38, 0.05)
    vj = band(nt, add(nt, math_(nt, 'DIVIDE', u, 0.3), off), 1.0, 0.05)
    return math_(nt, 'MAXIMUM', h, mul(nt, vj, 0.45))


def plank_lines(nt):
    u, v, _ = _uv(nt)
    return mul(nt, band(nt, v, 0.28, 0.02), 0.8)


def ground_mat():
    """Terrain: vertex-colour albedo + contour lines every 2 m of height (topographic chart ink)."""
    m, nt, out = new_mat('ground')
    base, attr = _base_color(nt)
    wc = N(nt, 'ShaderNodeGroup'); wc.node_tree = wash_core()
    L(nt, base, wc.inputs['Base'])
    for k, v in (('Gran', 1.2), ('Pool', 0.0), ('Hatch', 0.8), ('Blotch', 1.4), ('Trans', 0.0), ('Spec', 0.0)):
        wc.inputs[k].default_value = v
    s = S(nt)
    geo = N(nt, 'ShaderNodeNewGeometry')
    _, _, z = sep_xyz(nt, geo.outputs['Position'])
    _, _, nz = sep_xyz(nt, geo.outputs['Normal'])
    slope = math_(nt, 'DIVIDE', math_(nt, 'SQRT', math_(nt, 'MAXIMUM', sub(nt, 1.0, mul(nt, nz, nz)), 0.0)),
                  math_(nt, 'MAXIMUM', nz, 0.15))
    f = math_(nt, 'FRACT', math_(nt, 'DIVIDE', z, 2.0))
    d = mul(nt, math_(nt, 'MINIMUM', f, sub(nt, 1.0, f)), 2.0)                     # metres off the contour
    w = mul(nt, math_(nt, 'MAXIMUM', slope, 0.02), 0.09)                            # ~constant ground width
    c = mul(nt, mrange(nt, d, w, mul(nt, w, 0.2)), mrange(nt, slope, 0.06, 0.25))
    L(nt, mul(nt, c, mul(nt, s('contour_k'), 3.0)), wc.inputs['Lines'])
    _emit_out(nt, out, wc.outputs['Color'])
    return m


def ink_mat():
    m, nt, out = new_mat('ink')
    s = S(nt)
    em = N(nt, 'ShaderNodeEmission'); L(nt, s('ink'), em.inputs['Color'])
    lp = N(nt, 'ShaderNodeLightPath'); tr = N(nt, 'ShaderNodeBsdfTransparent')
    mx = N(nt, 'ShaderNodeMixShader')
    L(nt, math_(nt, 'MAXIMUM', lp.outputs['Is Shadow Ray'], lp.outputs['Is Diffuse Ray']), mx.inputs[0])
    L(nt, em.outputs[0], mx.inputs[1]); L(nt, tr.outputs[0], mx.inputs[2])
    L(nt, mx.outputs[0], out.inputs['Surface'])
    aov = N(nt, 'ShaderNodeOutputAOV'); aov.aov_name = 'inkmask'; aov.inputs['Value'].default_value = 1.0
    m.use_backface_culling = True
    m.use_backface_culling_shadow = True
    return m


def glow_mat(name, day_col, glow_col, key, day_k=0.0):
    """Windows / lamps: day = dark glass wash, night = emissive * vertex alpha (on/off per window)."""
    m, nt, out = new_mat(name)
    s = S(nt)
    a = N(nt, 'ShaderNodeAttribute', attribute_name='Col')
    wc = N(nt, 'ShaderNodeGroup'); wc.node_tree = wash_core()
    wc.inputs['Base'].default_value = (*day_col, 1)
    for k, v in (('Gran', 0.3), ('Pool', 0.0), ('Hatch', 0.0), ('Blotch', 0.3), ('Trans', 0.0), ('Spec', 1.5)):
        wc.inputs[k].default_value = v
    # per-face warmth variation from vertex colour (white by default)
    gcol = mix(nt, 1.0, (*glow_col,), a.outputs['Color'], blend='MULTIPLY')
    on = mrange(nt, a.outputs['Alpha'], sub(nt, 1.0, s('win_frac')), add(nt, sub(nt, 1.0, s('win_frac')), 0.04))
    k = mul(nt, add(nt, s(key), day_k), on)
    col = mix(nt, 1.0, wc.outputs['Color'], vmath(nt, 'SCALE', gcol, scale=k), blend='ADD')
    _emit_out(nt, out, col, 0.6)
    return m


def sail_mat():
    """Canvas wash + coin emblem from the atlas (per-object 'emblem' index -> 4x4 slot)."""
    m, nt, out = new_mat('sail')
    base, attr = _base_color(nt)
    img = bpy.data.images.load(os.path.join(TEX, 'emblems.png'), check_existing=True)
    u, v, _ = _uv(nt)
    em = N(nt, 'ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='emblem')
    idx = em.outputs['Fac']
    sx = math_(nt, 'MODULO', idx, 4.0)
    sy = sub(nt, 3.0, math_(nt, 'FLOOR', math_(nt, 'DIVIDE', idx, 4.0)))
    inside = mul(nt, mul(nt, math_(nt, 'GREATER_THAN', u, 0.0), math_(nt, 'LESS_THAN', u, 1.0)),
                 mul(nt, math_(nt, 'GREATER_THAN', v, 0.0), math_(nt, 'LESS_THAN', v, 1.0)))
    geo = N(nt, 'ShaderNodeNewGeometry')
    uf = mix(nt, geo.outputs['Backfacing'], comb_xyz(nt, u, 0, 0), comb_xyz(nt, sub(nt, 1.0, u), 0, 0))
    u = sep_xyz(nt, uf)[0]
    inside = mul(nt, mul(nt, math_(nt, 'GREATER_THAN', u, 0.0), math_(nt, 'LESS_THAN', u, 1.0)),
                 mul(nt, math_(nt, 'GREATER_THAN', v, 0.0), math_(nt, 'LESS_THAN', v, 1.0)))
    au = math_(nt, 'DIVIDE', add(nt, sx, math_(nt, 'MINIMUM', math_(nt, 'MAXIMUM', u, 0.0), 1.0)), 4.0)
    av = math_(nt, 'DIVIDE', add(nt, sy, math_(nt, 'MINIMUM', math_(nt, 'MAXIMUM', v, 0.0), 1.0)), 4.0)
    tex = N(nt, 'ShaderNodeTexImage', interpolation='Linear', extension='CLIP'); tex.image = img
    L(nt, comb_xyz(nt, au, av, 0.0), tex.inputs['Vector'])
    has = N(nt, 'ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='has_emblem')
    ea = mul(nt, mul(nt, tex.outputs['Alpha'], inside), has.outputs['Fac'])
    albedo = mix(nt, ea, base, tex.outputs['Color'])
    wc = N(nt, 'ShaderNodeGroup'); wc.node_tree = wash_core()
    L(nt, albedo, wc.inputs['Base'])
    for k, v in (('Gran', 0.15), ('Pool', 0.6), ('Hatch', 0.6), ('Blotch', 0.25), ('Trans', 0.35), ('Spec', 0.0)):
        wc.inputs[k].default_value = v
    # seams: faint horizontal cloth panels
    L(nt, mul(nt, band(nt, v, 0.18, 0.004), 0.15), wc.inputs['Lines'])
    _emit_out(nt, out, wc.outputs['Color'])
    m.use_backface_culling = False
    return m


def lens_mat():
    """Fresnel lens: amber glass bands; emissive with lantern_e."""
    m, nt, out = new_mat('lens')
    s = S(nt)
    geo = N(nt, 'ShaderNodeNewGeometry')
    _, _, z = sep_xyz(nt, geo.outputs['Position'])
    rings = mul(nt, math_(nt, 'SINE', mul(nt, z, 40.0)), 0.5)
    base = mix(nt, add(nt, rings, 0.5), lin('#C9A55A'), lin('#F4E2A8'))
    k = add(nt, s('lantern_e'), 0.0)
    col = mix(nt, 1.0, base, vmath(nt, 'SCALE', rgb(nt, lin('#FFD99A')), scale=k), blend='ADD')
    _emit_out(nt, out, col, 0.3)
    return m


def lantern_glass_mat():
    m, nt, out = new_mat('lantern_glass')
    s = S(nt)
    lw = N(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.4
    base = mix(nt, lw.outputs['Facing'], lin('#9FB3B8'), lin('#3C4C55'))
    col = mix(nt, 1.0, base, vmath(nt, 'SCALE', rgb(nt, lin('#FFD08A')), scale=mul(nt, s('lantern_e'), 0.35)), blend='ADD')
    em = N(nt, 'ShaderNodeEmission'); L(nt, col, em.inputs['Color'])
    tr = N(nt, 'ShaderNodeBsdfTransparent')
    mx = N(nt, 'ShaderNodeMixShader'); mx.inputs[0].default_value = 0.55
    L(nt, em.outputs[0], mx.inputs[1]); L(nt, tr.outputs[0], mx.inputs[2])
    L(nt, mx.outputs[0], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'
    return m


def beam_mat():
    """Lighthouse beam: additive cone, bright core along the axis, fades with distance (WebGL2: same mesh)."""
    m, nt, out = new_mat('beam')
    s = S(nt)
    tc = N(nt, 'ShaderNodeTexCoord')
    x, y, z = sep_xyz(nt, tc.outputs['Object'])
    along = math_(nt, 'POWER', mrange(nt, x, 0.0, 1.0, 1.0, 0.0, smooth=False), 2.4)
    lw = N(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    core = math_(nt, 'POWER', sub(nt, 1.0, lw.outputs['Facing']), 2.5)
    k = mul(nt, mul(nt, along, core), mul(nt, s('lantern_e'), 0.016))
    em = N(nt, 'ShaderNodeEmission'); em.inputs['Color'].default_value = (*lin('#FFE6BC'), 1)
    L(nt, k, em.inputs['Strength'])
    tr = N(nt, 'ShaderNodeBsdfTransparent')
    ad = N(nt, 'ShaderNodeAddShader'); L(nt, tr.outputs[0], ad.inputs[0]); L(nt, em.outputs[0], ad.inputs[1])
    L(nt, ad.outputs[0], out.inputs['Surface'])
    aov = N(nt, 'ShaderNodeOutputAOV'); aov.aov_name = 'inkmask'; aov.inputs['Value'].default_value = 0.0
    m.surface_render_method = 'BLENDED'
    m.use_backface_culling = False
    return m


def pillar_mat():
    """Light pillar on the water under a lamp: broken engraved shimmer strokes (WebGL2: additive quad, UV math)."""
    m, nt, out = new_mat('pillar')
    s = S(nt)
    u, v, _ = _uv(nt)
    width = add(nt, 0.18, mul(nt, v, 0.32))                      # widens away from the lamp
    across = mrange(nt, math_(nt, 'ABSOLUTE', sub(nt, u, 0.5)), width, mul(nt, width, 0.15))
    along = mul(nt, mrange(nt, v, 0.0, 0.08), math_(nt, 'POWER', mrange(nt, v, 1.0, 0.0, smooth=False), 1.4))
    jit = noise_tex(nt, comb_xyz(nt, mul(nt, u, 3.0), mul(nt, v, 9.0), 0.0), 1.0, 2.0, 0.5)
    dash = mrange(nt, math_(nt, 'SINE', add(nt, mul(nt, v, 95.0), mul(nt, jit, 9.0))), 0.1, 0.65)
    brk = mrange(nt, noise_tex(nt, comb_xyz(nt, mul(nt, u, 5.0), mul(nt, v, 30.0), 1.0), 1.0, 1.0, 0.5), 0.35, 0.6)
    k = mul(nt, mul(nt, mul(nt, across, along), mul(nt, dash, brk)), mul(nt, s('lamp_e'), 0.3))
    a = N(nt, 'ShaderNodeAttribute', attribute_name='Col')
    em = N(nt, 'ShaderNodeEmission'); L(nt, mix(nt, 1.0, lin('#FFC783'), a.outputs['Color'], blend='MULTIPLY'), em.inputs['Color'])
    L(nt, k, em.inputs['Strength'])
    tr = N(nt, 'ShaderNodeBsdfTransparent')
    ad = N(nt, 'ShaderNodeAddShader'); L(nt, tr.outputs[0], ad.inputs[0]); L(nt, em.outputs[0], ad.inputs[1])
    L(nt, ad.outputs[0], out.inputs['Surface'])
    aov = N(nt, 'ShaderNodeOutputAOV'); aov.aov_name = 'inkmask'; aov.inputs['Value'].default_value = 0.0
    m.surface_render_method = 'BLENDED'
    return m


def cloudshadow_mat():
    m, nt, out = new_mat('cloudshadow')
    geo = N(nt, 'ShaderNodeNewGeometry')
    P_ = geo.outputs['Position']
    n = noise_tex(nt, vmath(nt, 'SCALE', P_, scale=0.012), 1.0, 3.0, 0.55)
    cov = value(nt, 0.0, 'CLOUD_COVER')
    opa = mrange(nt, n, sub(nt, 0.62, cov), sub(nt, 0.7, cov))
    lp = N(nt, 'ShaderNodeLightPath')
    # camera never sees it; shadow rays see the clouds
    a = mul(nt, opa, lp.outputs['Is Shadow Ray'])
    tr = N(nt, 'ShaderNodeBsdfTransparent')
    df = N(nt, 'ShaderNodeBsdfDiffuse')
    mx = N(nt, 'ShaderNodeMixShader')
    L(nt, a, mx.inputs[0]); L(nt, tr.outputs[0], mx.inputs[1]); L(nt, df.outputs[0], mx.inputs[2])
    L(nt, mx.outputs[0], out.inputs['Surface'])
    m.surface_render_method = 'DITHERED'
    m.use_transparent_shadow = True
    return m


BUILDERS = {
    'cloudshadow': cloudshadow_mat,
    'wash': lambda: wash('wash'),
    'stone': lambda: wash('stone', lines=stone_lines, gran=1.2, blotch=1.3),
    'roof': lambda: wash('roof', lines=roof_lines, gran=1.0, blotch=1.2),
    'wood': lambda: wash('wood', lines=plank_lines, gran=1.0, blotch=1.0),
    'plaster': lambda: wash('plaster', gran=0.8, blotch=1.6),
    'foliage': lambda: wash('foliage', gran=1.5, pool=1.4, hatch=1.2, blotch=1.6, trans=0.25),
    'canvas': lambda: wash('canvas', gran=0.6, pool=0.8, blotch=0.8, trans=0.2),
    'hull': lambda: wash('hull', gran=0.7, pool=1.0, blotch=0.7, spec=0.4),
    'brass': lambda: wash('brass', gran=0.3, pool=1.2, hatch=0.4, blotch=0.4, spec=3.0),
    'iron': lambda: wash('iron', gran=0.2, pool=0.5, hatch=0.0, blotch=0.3, spec=1.0),
    'ground': ground_mat,
    'ink': ink_mat,
    'window': lambda: glow_mat('window', lin('#4A5662'), lin('#FFB65C'), 'win_e'),
    'lamp': lambda: glow_mat('lamp', lin('#E8D9B0'), lin('#FFC66E'), 'lamp_e', 0.0),
    'riding': lambda: glow_mat('riding', lin('#E8D9B0'), lin('#FFE6B0'), 'riding_e', 0.0),
    'sail': sail_mat,
    'lens': lens_mat,
    'lantern_glass': lantern_glass_mat,
    'beam': beam_mat,
    'pillar': pillar_mat,
}


def get(name):
    if name in _REG:
        return _REG[name]
    m = BUILDERS[name]()
    _REG[name] = m
    return m
