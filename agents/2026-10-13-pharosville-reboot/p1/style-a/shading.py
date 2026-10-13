"""Style A materials. Every node graph here has a direct WebGL2 equivalent (documented in REPORT.md):

ToonLight  = lambert irradiance (sun * shadow + hemisphere ambient + point lamps) -> luminance remap
             through a 1D ramp (gentle cel step) -> keeps hue (warm sun / lavender shade) + fresnel rim.
M_toon     = vertex colour (albedo * baked AO * height gradient) x procedural pattern masks
             (_pat0: masonry, cobble, roof tile, plank; _pat1: foliage, grass, rock, emissive) -> ToonLight.
"""
import bpy, math
from lib import *

LOOK = {}   # named value/rgb nodes the state switcher drives


def build_toon_group():
    ng = bpy.data.node_groups.new('ToonLight', 'ShaderNodeTree')
    ng.interface.new_socket('Normal', in_out='INPUT', socket_type='NodeSocketVector')
    ng.interface.new_socket('Translucency', in_out='INPUT', socket_type='NodeSocketFloat')
    ng.interface.new_socket('Light', in_out='OUTPUT', socket_type='NodeSocketColor')
    ng.interface.new_socket('Rim', in_out='OUTPUT', socket_type='NodeSocketFloat')
    gi = N(ng, 'NodeGroupInput'); go = N(ng, 'NodeGroupOutput')
    d = N(ng, 'ShaderNodeBsdfDiffuse'); d.inputs['Color'].default_value = (1, 1, 1, 1)
    Lk(ng, gi.outputs['Normal'], d.inputs['Normal'])
    tr = N(ng, 'ShaderNodeBsdfTranslucent'); tr.inputs['Color'].default_value = (1, 1, 1, 1)
    Lk(ng, gi.outputs['Normal'], tr.inputs['Normal'])
    mx = N(ng, 'ShaderNodeMixShader')
    Lk(ng, fm(ng, 'MULTIPLY', gi.outputs['Translucency'], 0.5), mx.inputs[0])
    Lk(ng, d.outputs[0], mx.inputs[1]); Lk(ng, tr.outputs[0], mx.inputs[2])
    s2r = N(ng, 'ShaderNodeShaderToRGB'); Lk(ng, mx.outputs[0], s2r.inputs[0])
    I = s2r.outputs['Color']
    bw = N(ng, 'ShaderNodeRGBToBW'); Lk(ng, I, bw.inputs[0])
    lum = bw.outputs[0]
    ref = valn(ng, 2.0, 'REF')
    x = fm(ng, 'DIVIDE', lum, ref)
    ramp = N(ng, 'ShaderNodeValToRGB', name='TOON_RAMP')
    Lk(ng, fm(ng, 'DIVIDE', x, 3.0), ramp.inputs['Fac'])
    # (x, f(x)) gentle cel: shade band, a soft terminator step, a lit plateau, compressed highlights
    pts = [(0.0, 0.0), (0.22, 0.22), (0.36, 0.30), (0.50, 0.72), (0.75, 0.95), (1.2, 1.12), (3.0, 1.75)]
    set_ramp(ramp, [(a / 3.0, (b / 3.0,) * 3) for a, b in pts])
    rbw = N(ng, 'ShaderNodeRGBToBW'); Lk(ng, ramp.outputs['Color'], rbw.inputs[0])
    f = fm(ng, 'MULTIPLY', rbw.outputs[0], 3.0)
    gain = fm(ng, 'DIVIDE', f, fm(ng, 'MAXIMUM', x, 0.0005))
    soft = valn(ng, 0.75, 'CEL_MIX')        # 0 = plain lambert, 1 = full ramp
    gain = fm(ng, 'ADD', fm(ng, 'MULTIPLY', fm(ng, 'SUBTRACT', gain, 1.0), soft), 1.0)
    light = N(ng, 'ShaderNodeVectorMath', operation='SCALE')
    Lk(ng, I, light.inputs[0]); Lk(ng, gain, inp(light, 'Scale'))
    fill = N(ng, 'ShaderNodeRGB', name='FILL'); fill.outputs[0].default_value = (0.04, 0.035, 0.08, 1)
    lf = N(ng, 'ShaderNodeVectorMath', operation='ADD')
    Lk(ng, light.outputs['Vector'], lf.inputs[0]); Lk(ng, fill.outputs[0], lf.inputs[1])
    Lk(ng, lf.outputs['Vector'], go.inputs['Light'])
    lw = N(ng, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    Lk(ng, gi.outputs['Normal'], lw.inputs['Normal'])
    rim = fm(ng, 'POWER', lw.outputs['Facing'], valn(ng, 3.5, 'RIM_POW'))
    rim = fm(ng, 'MULTIPLY', rim, valn(ng, 0.25, 'RIM_K'))
    Lk(ng, rim, go.inputs['Rim'])
    LOOK['toon_group'] = ng
    return ng


def toon_light(nt, normal, transl=0.0):
    g = N(nt, 'ShaderNodeGroup'); g.node_tree = bpy.data.node_groups['ToonLight']
    Lk(nt, normal, g.inputs['Normal'])
    if isinstance(transl, (int, float)):
        g.inputs['Translucency'].default_value = transl
    else:
        Lk(nt, transl, g.inputs['Translucency'])
    return g.outputs['Light'], g.outputs['Rim']


def global_rgb(name, c):
    """A shared colour constant: a node group with one output so every material reads one value."""
    ng = bpy.data.node_groups.get('G_' + name)
    if ng is None:
        ng = bpy.data.node_groups.new('G_' + name, 'ShaderNodeTree')
        ng.interface.new_socket('C', in_out='OUTPUT', socket_type='NodeSocketColor')
        go = N(ng, 'NodeGroupOutput')
        r = N(ng, 'ShaderNodeRGB', name='C'); r.outputs[0].default_value = (*c, 1)
        Lk(ng, r.outputs[0], go.inputs[0])
    return ng


def global_val(name, v):
    ng = bpy.data.node_groups.get('G_' + name)
    if ng is None:
        ng = bpy.data.node_groups.new('G_' + name, 'ShaderNodeTree')
        ng.interface.new_socket('V', in_out='OUTPUT', socket_type='NodeSocketFloat')
        go = N(ng, 'NodeGroupOutput')
        r = N(ng, 'ShaderNodeValue', name='V'); r.outputs[0].default_value = v
        Lk(ng, r.outputs[0], go.inputs[0])
    return ng


def gref(nt, name):
    g = N(nt, 'ShaderNodeGroup'); g.node_tree = bpy.data.node_groups['G_' + name]
    return g.outputs[0]


def set_global(name, v):
    ng = bpy.data.node_groups['G_' + name]
    n = ng.nodes.get('C') or ng.nodes.get('V')
    n.outputs[0].default_value = (*v, 1) if isinstance(v, (tuple, list)) else v


def build_globals():
    global_rgb('RIM_COL', lin('#FFE2B8'))
    global_rgb('WIN_COL', lin('#FFA94D'))
    global_rgb('LAMP_COL', lin('#FFC36A'))
    global_val('WIN_K', 0.0)
    global_val('NIGHT', 0.0)


def build_toon():
    m, nt, o = new_mat('M_toon')
    geo = N(nt, 'ShaderNodeNewGeometry')
    pos, nrm = geo.outputs['Position'], geo.outputs['Normal']
    a = N(nt, 'ShaderNodeAttribute', attribute_name='Col')
    a0 = N(nt, 'ShaderNodeAttribute', attribute_name='_pat0')
    a1 = N(nt, 'ShaderNodeAttribute', attribute_name='_pat1')
    alb = a.outputs['Color']
    m_mas, m_cob, m_tile = sepc(nt, a0.outputs['Color'])
    m_plank = a0.outputs['Alpha']
    m_fol, m_grass, m_rock = sepc(nt, a1.outputs['Color'])
    m_win = a1.outputs['Alpha']
    x, y, z = sep(nt, pos)
    nx, ny, nz = sep(nt, nrm)
    useX = fm(nt, 'GREATER_THAN', fm(nt, 'ABSOLUTE', nx), fm(nt, 'ABSOLUTE', ny))
    wall = mixv(nt, useX, comb(nt, x, z, 0), comb(nt, y, z, 0))
    isTop = fm(nt, 'GREATER_THAN', fm(nt, 'ABSOLUTE', nz), 0.72)
    pl = mixv(nt, isTop, wall, comb(nt, x, y, 0))
    # plaster (mask < 0.5) shows stone only where it has 'peeled'; full stone at mask 1
    peel = mr(nt, noise_t(nt, pos, 0.55, 3.0, 0.6).outputs['Fac'], 0.60, 0.64)
    m_mas = fm(nt, 'MAXIMUM', fm(nt, 'SUBTRACT', fm(nt, 'MULTIPLY', m_mas, 2.0), 1.0, clamp=True),
               fm(nt, 'MULTIPLY', fm(nt, 'MINIMUM', fm(nt, 'MULTIPLY', m_mas, 3.0), 1.0), peel))

    # --- masonry: wobbly coursed stones, per-stone value + warm/cool drift, recessed mortar
    dn = noise_t(nt, pos, 1.1, 2.0)
    dist = vm(nt, 'SCALE', vm(nt, 'SUBTRACT', dn.outputs['Color'], (0.5, 0.5, 0.5)), scale=0.30)
    br = N(nt, 'ShaderNodeTexBrick', offset=0.5, offset_frequency=2, squash=1.0, squash_frequency=2)
    Lk(nt, vm(nt, 'ADD', pl, dist), br.inputs['Vector'])
    br.inputs['Color1'].default_value = (0, 0, 0, 1); br.inputs['Color2'].default_value = (1, 1, 1, 1)
    br.inputs['Mortar'].default_value = (0, 0, 0, 1)
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Mortar Size'].default_value = 0.03
    br.inputs['Mortar Smooth'].default_value = 0.9
    br.inputs['Bias'].default_value = 0.0
    br.inputs['Brick Width'].default_value = 0.78
    br.inputs['Row Height'].default_value = 0.40
    brw = N(nt, 'ShaderNodeRGBToBW'); Lk(nt, br.outputs['Color'], brw.inputs[0])
    brand = brw.outputs[0]
    mortar = br.outputs['Fac']
    mas_k = fm(nt, 'MULTIPLY', fm(nt, 'SUBTRACT', 1.0, fm(nt, 'MULTIPLY', mortar, 0.38)),
               fm(nt, 'ADD', 0.84, fm(nt, 'MULTIPLY', brand, 0.30)))
    # --- cobbles: voronoi cells, dark gaps, per-cobble value
    vc = voro(nt, comb(nt, x, y, 0), 2.9, 'DISTANCE_TO_EDGE', '2D')
    vc1 = voro(nt, comb(nt, x, y, 0), 2.9, 'F1', '2D')
    cr = N(nt, 'ShaderNodeRGBToBW'); Lk(nt, vc1.outputs['Color'], cr.inputs[0])
    cgap = mr(nt, vc.outputs['Distance'], 0.015, 0.09)
    cob_k = fm(nt, 'MULTIPLY', fm(nt, 'ADD', 0.5, fm(nt, 'MULTIPLY', cgap, 0.5)),
               fm(nt, 'ADD', 0.84, fm(nt, 'MULTIPLY', cr.outputs[0], 0.32)))
    # --- roof tiles from UV (u along the eave, v up the slope, metres)
    uvn = N(nt, 'ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
    tu, tv, _ = sep(nt, uvn.outputs['UV'])
    rv = fm(nt, 'DIVIDE', tv, 0.30)
    fr = fm(nt, 'FRACT', rv); row = fm(nt, 'FLOOR', rv)
    cu = fm(nt, 'ADD', fm(nt, 'DIVIDE', tu, 0.27), fm(nt, 'MULTIPLY', row, 0.5))
    fc = fm(nt, 'FRACT', cu)
    gapT = fm(nt, 'MULTIPLY', mr(nt, fc, 0.0, 0.08), mr(nt, fc, 1.0, 0.92))
    wn = N(nt, 'ShaderNodeTexWhiteNoise', noise_dimensions='2D')
    Lk(nt, comb(nt, fm(nt, 'FLOOR', cu), row, 0), wn.inputs['Vector'])
    tile_k = fm(nt, 'MULTIPLY', mr(nt, fr, 0.97, 0.55, 0.62, 1.0),
                fm(nt, 'MULTIPLY', fm(nt, 'ADD', 0.6, fm(nt, 'MULTIPLY', gapT, 0.4)),
                   fm(nt, 'ADD', 0.86, fm(nt, 'MULTIPLY', wn.outputs['Value'], 0.26))))
    # --- plank grain: streaky noise along object-space x
    pg = noise_t(nt, vm(nt, 'MULTIPLY', pos, (0.25, 6.0, 6.0)), 3.0, 3.0)
    plank_k = fm(nt, 'ADD', 0.86, fm(nt, 'MULTIPLY', pg.outputs['Fac'], 0.26))
    # --- foliage: leaf clumps
    vf = voro(nt, pos, 3.6, 'F1', '3D')
    fr_ = N(nt, 'ShaderNodeRGBToBW'); Lk(nt, vf.outputs['Color'], fr_.inputs[0])
    leaf = mr(nt, vf.outputs['Distance'], 0.85, 0.12)
    fol_k = fm(nt, 'MULTIPLY', fm(nt, 'ADD', 0.72, fm(nt, 'MULTIPLY', leaf, 0.40)),
               fm(nt, 'ADD', 0.9, fm(nt, 'MULTIPLY', fr_.outputs[0], 0.2)))
    # --- grass: big tonal patches + fine mottling
    g1 = noise_t(nt, pos, 0.09, 2.0)
    g2 = noise_t(nt, pos, 1.7, 3.0)
    patch = mr(nt, g1.outputs['Fac'], 0.38, 0.66)
    grass_k = fm(nt, 'MULTIPLY', fm(nt, 'ADD', 0.84, fm(nt, 'MULTIPLY', patch, 0.26)),
                 fm(nt, 'ADD', 0.9, fm(nt, 'MULTIPLY', g2.outputs['Fac'], 0.2)))
    # --- rock: strata + lichen
    r1 = noise_t(nt, vm(nt, 'MULTIPLY', pos, (0.7, 0.7, 2.4)), 0.9, 3.0)
    rock_k = fm(nt, 'ADD', 0.78, fm(nt, 'MULTIPLY', r1.outputs['Fac'], 0.42))

    def blend_k(k, mask):
        return fm(nt, 'ADD', 1.0, fm(nt, 'MULTIPLY', fm(nt, 'SUBTRACT', k, 1.0), mask))
    K = blend_k(mas_k, m_mas)
    pm = noise_t(nt, pos, 0.9, 3.0, 0.55)
    K = fm(nt, 'MULTIPLY', K, fm(nt, 'ADD', 0.95, fm(nt, 'MULTIPLY', pm.outputs['Fac'], 0.1)))
    for kk, mm in ((cob_k, m_cob), (tile_k, m_tile), (plank_k, m_plank), (fol_k, m_fol), (grass_k, m_grass),
                   (rock_k, m_rock)):
        K = fm(nt, 'MULTIPLY', K, blend_k(kk, mm))
    col = vm(nt, 'SCALE', alb, scale=K)
    # hue drift: warm stones / cool stones (masonry), yellow-green sunny grass patches, lichen on rock
    warm = vm(nt, 'MULTIPLY', col, (1.07, 1.0, 0.86))
    col = mixc_n(nt, fm(nt, 'MULTIPLY', fm(nt, 'MULTIPLY', brand, m_mas), 0.7), col, warm)
    col = mixc_n(nt, fm(nt, 'MULTIPLY', fm(nt, 'MULTIPLY', patch, m_grass), 0.55), col,
                 vm(nt, 'MULTIPLY', col, (1.12, 1.06, 0.72)))
    lich = mr(nt, noise_t(nt, pos, 0.75, 2.0).outputs['Fac'], 0.60, 0.66)
    col = mixc_n(nt, fm(nt, 'MULTIPLY', lich, fm(nt, 'MULTIPLY', m_rock, 0.45)), col, lin('#B8B060'))
    # aged roofs: moss patches + lichen speckles on tiles (and on cap stones via the masonry mask, lighter)
    moss_n = noise_t(nt, pos, 0.42, 3.0, 0.6)
    moss = mr(nt, moss_n.outputs['Fac'], 0.60, 0.70)
    col = mixc_n(nt, fm(nt, 'MULTIPLY', moss, fm(nt, 'ADD', fm(nt, 'MULTIPLY', m_tile, 0.24), fm(nt, 'MULTIPLY', m_mas, 0.1))), col, lin('#9AA75C'))
    lv = voro(nt, pos, 7.0, 'F1', '3D')
    lr_ = N(nt, 'ShaderNodeRGBToBW'); Lk(nt, lv.outputs['Color'], lr_.inputs[0])
    lspk = fm(nt, 'MULTIPLY', mr(nt, lv.outputs['Distance'], 0.22, 0.12), fm(nt, 'GREATER_THAN', lr_.outputs[0], 0.72))
    col = mixc_n(nt, fm(nt, 'MULTIPLY', lspk, fm(nt, 'MULTIPLY', m_tile, 0.35)), col, lin('#D9C46A'))
    col = mixc_n(nt, fm(nt, 'MULTIPLY', fm(nt, 'MULTIPLY', leaf, m_fol), 0.35), col,
                 vm(nt, 'MULTIPLY', col, (1.15, 1.12, 0.8)))
    # flowers sprinkled in the grass
    vfl = voro(nt, comb(nt, x, y, 0), 2.2, 'F1', '2D')
    flc = vfl.outputs['Color']
    fr1, fr2, _ = sepc(nt, flc)
    dot = fm(nt, 'MULTIPLY', mr(nt, vfl.outputs['Distance'], 0.10, 0.06), fm(nt, 'GREATER_THAN', fr1, 0.80))
    fl_ramp = N(nt, 'ShaderNodeValToRGB'); Lk(nt, fr2, fl_ramp.inputs['Fac'])
    set_ramp(fl_ramp, [(0.0, P('flower_white')), (0.3, P('flower_yellow')), (0.55, P('flower_pink')),
                       (0.78, P('flower_violet')), (0.92, P('flower_red'))], 'CONSTANT')
    col = mixc_n(nt, fm(nt, 'MULTIPLY', dot, m_grass), col, fl_ramp.outputs['Color'])
    # meadow clumps readable at overview zoom: sparse 0.6 m flower patches + darker clover tufts
    vpc = voro(nt, comb(nt, x, y, 0), 0.55, 'F1', '2D')
    pc1, pc2, _ = sepc(nt, vpc.outputs['Color'])
    pmask = fm(nt, 'MULTIPLY', mr(nt, vpc.outputs['Distance'], 0.32, 0.18), fm(nt, 'GREATER_THAN', pc1, 0.62))
    pmask = fm(nt, 'MULTIPLY', pmask, mr(nt, noise_t(nt, pos, 2.5, 2.0).outputs['Fac'], 0.42, 0.55))
    pr_ = N(nt, 'ShaderNodeValToRGB'); Lk(nt, pc2, pr_.inputs['Fac'])
    set_ramp(pr_, [(0.0, P('flower_white')), (0.35, P('flower_yellow')), (0.6, P('flower_violet')), (0.85, P('flower_pink'))], 'CONSTANT')
    col = mixc_n(nt, fm(nt, 'MULTIPLY', pmask, fm(nt, 'MULTIPLY', m_grass, 0.85)), col, pr_.outputs['Color'])
    tuft = mr(nt, voro(nt, comb(nt, x, y, 0), 1.3, 'F1', '2D').outputs['Distance'], 0.35, 0.15)
    col = vm(nt, 'SCALE', col, scale=fm(nt, 'SUBTRACT', 1.0, fm(nt, 'MULTIPLY', tuft, fm(nt, 'MULTIPLY', m_grass, 0.12))))

    # --- bump height
    h = fm(nt, 'MULTIPLY', fm(nt, 'SUBTRACT', 1.0, mortar), m_mas)
    h = fm(nt, 'ADD', h, fm(nt, 'MULTIPLY', mr(nt, vc.outputs['Distance'], 0.0, 0.22), m_cob))
    h = fm(nt, 'ADD', h, fm(nt, 'MULTIPLY', fm(nt, 'MULTIPLY', fm(nt, 'SUBTRACT', 1.0, fr), gapT), m_tile))
    h = fm(nt, 'ADD', h, fm(nt, 'MULTIPLY', leaf, fm(nt, 'MULTIPLY', m_fol, 0.5)))
    h = fm(nt, 'ADD', h, fm(nt, 'MULTIPLY', r1.outputs['Fac'], fm(nt, 'MULTIPLY', m_rock, 1.5)))
    bump = N(nt, 'ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.55
    bump.inputs['Distance'].default_value = 0.035
    Lk(nt, h, bump.inputs['Height']); Lk(nt, nrm, bump.inputs['Normal'])
    light, rim = toon_light(nt, bump.outputs['Normal'], fm(nt, 'MULTIPLY', m_fol, 0.5))
    lit = mixc_n(nt, 1.0, col, light, 'MULTIPLY')
    rimc = vm(nt, 'SCALE', gref(nt, 'RIM_COL'), scale=rim)
    rimc = vm(nt, 'MULTIPLY', rimc, vm(nt, 'ADD', vm(nt, 'SCALE', col, scale=0.8), (0.25, 0.25, 0.25)))
    lit = vm(nt, 'ADD', lit, rimc)
    # emissive windows (m_win ~1) and lamps (m_win >= 2)
    is_lamp = mr(nt, m_win, 1.4, 2.0)
    ecol = mixc_n(nt, is_lamp, gref(nt, 'WIN_COL'), gref(nt, 'LAMP_COL'))
    ek = fm(nt, 'MULTIPLY', fm(nt, 'MINIMUM', m_win, 1.0), gref(nt, 'WIN_K'))
    ek = fm(nt, 'MULTIPLY', ek, fm(nt, 'ADD', 1.0, fm(nt, 'MULTIPLY', is_lamp, 1.5)))
    lit = vm(nt, 'ADD', lit, vm(nt, 'SCALE', ecol, scale=ek))
    em = N(nt, 'ShaderNodeEmission'); Lk(nt, lit, em.inputs['Color'])
    Lk(nt, em.outputs[0], o.inputs['Surface'])
    MATS['toon'] = m
    return m


def build_emblem_atlas(path):
    """4x4 atlas of 256px emblem discs (coin-like, generic glyphs; no traced trademarks)."""
    from PIL import Image, ImageDraw, ImageFont
    S = 256
    img = Image.new('RGBA', (S * 4, S * 4), (0, 0, 0, 0))
    font = ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-ExtraBold.ttf', 150)
    fsm = ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-ExtraBold.ttf', 104)
    specs = [  # (disc, ring, glyph colour, glyph)
        ('#26A17B', '#F4F0E4', '#FFFFFF', 'T'),     # 0 usdt-like
        ('#2775CA', '#F4F0E4', '#FFFFFF', '$'),     # 1 usdc-like
        ('#3355C4', '#E7C65A', '#FFFFFF', '€'),     # 2 eur
        ('#D4A93A', '#7A5A1A', '#5A3E10', 'Au'),    # 3 gold
        ('#F2B034', '#F4F0E4', '#FFFFFF', '◈'),     # 4 dai-like
        ('#0B4F9C', '#F4F0E4', '#FFFFFF', 'P'),     # 5 pyusd-like
        ('#2B2B2B', '#F4F0E4', '#FFFFFF', 'e'),     # 6 usde-like
        ('#A6463A', '#F4F0E4', '#FFFFFF', '£'),     # 7 gbp
    ]
    for i, (dc, rc, gc, g) in enumerate(specs):
        ox, oy = (i % 4) * S, (i // 4) * S
        d = ImageDraw.Draw(img)
        d.ellipse((ox + 10, oy + 10, ox + S - 10, oy + S - 10), fill=rc)
        d.ellipse((ox + 24, oy + 24, ox + S - 24, oy + S - 24), fill=dc)
        f = fsm if len(g) > 1 else font
        if g == '◈':
            c = (ox + S / 2, oy + S / 2)
            d.polygon([(c[0], c[1] - 70), (c[0] + 70, c[1]), (c[0], c[1] + 70), (c[0] - 70, c[1])], fill=gc)
            d.polygon([(c[0], c[1] - 34), (c[0] + 34, c[1]), (c[0], c[1] + 34), (c[0] - 34, c[1])], fill=dc)
        else:
            bb = d.textbbox((0, 0), g, font=f)
            w, hh = bb[2] - bb[0], bb[3] - bb[1]
            d.text((ox + S / 2 - w / 2 - bb[0], oy + S / 2 - hh / 2 - bb[1]), g, font=f, fill=gc)
    img = img.transpose(Image.FLIP_TOP_BOTTOM)   # Blender image origin is bottom-left
    img.save(path)
    return path


def build_sail(atlas_path):
    """Canvas (vertex colour) + emblem from the atlas: UVMap in [0,1]^2 is the emblem slot,
    object property `emblem` picks the slot (runtime: per-instance emblemIndex)."""
    m, nt, o = new_mat('M_sail')
    a = N(nt, 'ShaderNodeAttribute', attribute_name='Col')
    ob_e = N(nt, 'ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='emblem')
    uvn = N(nt, 'ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
    u, v, _ = sep(nt, uvn.outputs['UV'])
    # sail UV runs luff->leech; the atlas reads leech->luff, so mirror u once
    u = fm(nt, 'SUBTRACT', 1.0, u)
    idx = ob_e.outputs['Fac']
    col_i = fm(nt, 'MODULO', idx, 4.0); row_i = fm(nt, 'FLOOR', fm(nt, 'DIVIDE', idx, 4.0))
    inside = fm(nt, 'MULTIPLY', fm(nt, 'MULTIPLY', fm(nt, 'GREATER_THAN', u, 0.0), fm(nt, 'LESS_THAN', u, 1.0)),
                fm(nt, 'MULTIPLY', fm(nt, 'GREATER_THAN', v, 0.0), fm(nt, 'LESS_THAN', v, 1.0)))
    au = fm(nt, 'DIVIDE', fm(nt, 'ADD', fm(nt, 'MINIMUM', fm(nt, 'MAXIMUM', u, 0.0), 1.0), col_i), 4.0)
    av = fm(nt, 'DIVIDE', fm(nt, 'ADD', fm(nt, 'MINIMUM', fm(nt, 'MAXIMUM', v, 0.0), 1.0), row_i), 4.0)
    im = N(nt, 'ShaderNodeTexImage', interpolation='Linear', extension='CLIP')
    im.image = bpy.data.images.load(atlas_path, check_existing=True)
    Lk(nt, comb(nt, au, av, 0), im.inputs['Vector'])
    has = fm(nt, 'GREATER_THAN', ob_e.outputs['Fac'], -0.5)
    k = fm(nt, 'MULTIPLY', fm(nt, 'MULTIPLY', im.outputs['Alpha'], inside), has)
    # cloth seams: faint horizontal panel lines
    geo = N(nt, 'ShaderNodeNewGeometry')
    tc = N(nt, 'ShaderNodeTexCoord')
    _, _, oz = sep(nt, tc.outputs['Object'])
    seam = mr(nt, fm(nt, 'FRACT', fm(nt, 'MULTIPLY', oz, 1.6)), 0.0, 0.06, 0.86, 1.0)
    cloth = vm(nt, 'SCALE', a.outputs['Color'], scale=seam)
    col = mixc_n(nt, k, cloth, im.outputs['Color'])
    light, rim = toon_light(nt, geo.outputs['Normal'], 0.9)
    lit = mixc_n(nt, 1.0, col, light, 'MULTIPLY')
    lit = vm(nt, 'ADD', lit, vm(nt, 'SCALE', gref(nt, 'RIM_COL'), scale=fm(nt, 'MULTIPLY', rim, 0.6)))
    em = N(nt, 'ShaderNodeEmission'); Lk(nt, lit, em.inputs['Color'])
    Lk(nt, em.outputs[0], o.inputs['Surface'])
    m.use_backface_culling = False
    MATS['sail'] = m
    return m


def build_glass():
    """Lantern-room glazing: thin, warm, emissive at night; slightly see-through look by day."""
    m, nt, o = new_mat('M_glass')
    geo = N(nt, 'ShaderNodeNewGeometry')
    lw = N(nt, 'ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.4
    base = mixc_n(nt, lw.outputs['Fresnel'], lin('#3B4A55'), lin('#C9DCE6'))
    light, rim = toon_light(nt, geo.outputs['Normal'])
    lit = mixc_n(nt, 1.0, base, light, 'MULTIPLY')
    ek = fm(nt, 'MULTIPLY', gref(nt, 'WIN_K'), 2.2)
    lit = vm(nt, 'ADD', lit, vm(nt, 'SCALE', gref(nt, 'LAMP_COL'), scale=ek))
    em = N(nt, 'ShaderNodeEmission'); Lk(nt, lit, em.inputs['Color'])
    Lk(nt, em.outputs[0], o.inputs['Surface'])
    MATS['glass'] = m
    return m


def build_brass():
    """The one metallic: brass/gilt (lantern dome, fittings, brig trim)."""
    m, nt, o = new_mat('M_brass')
    a = N(nt, 'ShaderNodeAttribute', attribute_name='Col')
    p = N(nt, 'ShaderNodeBsdfPrincipled')
    Lk(nt, a.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Metallic'].default_value = 1.0; p.inputs['Roughness'].default_value = 0.32
    Lk(nt, p.outputs[0], o.inputs['Surface'])
    MATS['brass'] = m
    return m


def build_lens():
    """Fresnel lens: glowing faceted drum (day: pale glass with gold glint; night: the lamp)."""
    m, nt, o = new_mat('M_lens')
    tc = N(nt, 'ShaderNodeTexCoord')
    _, _, z = sep(nt, tc.outputs['Object'])
    rings = mr(nt, fm(nt, 'FRACT', fm(nt, 'MULTIPLY', z, 9.0)), 0.0, 0.5, 0.55, 1.0)
    base = vm(nt, 'SCALE', lin('#FFF1C8'), scale=rings)
    k = fm(nt, 'ADD', 0.9, fm(nt, 'MULTIPLY', gref(nt, 'WIN_K'), 14.0))
    em = N(nt, 'ShaderNodeEmission'); Lk(nt, vm(nt, 'MULTIPLY', base, gref(nt, 'LAMP_COL')), em.inputs['Color'])
    Lk(nt, k, em.inputs['Strength'])
    Lk(nt, em.outputs[0], o.inputs['Surface'])
    MATS['lens'] = m
    return m


def build_all(atlas_path):
    build_globals()
    build_toon_group()
    build_toon()
    build_sail(atlas_path)
    build_glass()
    build_brass()
    build_lens()
