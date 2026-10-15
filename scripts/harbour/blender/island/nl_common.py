"""Northern Light (style C) - shared palette, shader-expression helper, mesh helpers, materials.

Everything here is runtime-portable by construction:
  * one opaque kit material driven by a vertex colour attribute `Col`
      RGB = albedo (per face, jittered), A = pattern id / 16
    the pattern (boards, ashlar, planks, cobbles, rock strata, grass, tiles, leaf, strakes, render)
    is computed from OBJECT-space position + normal, i.e. exactly what a GLSL/TSL fragment shader
    gets from a varying local position. No textures except a 256^2 tiling noise in the port.
  * glass/window: emissive, per-face lit factor in Col.R
    (hb_window Col.B = window kind: 0 framed + cross mullion, 1 plain lit opening; runtime materials.ts WINDOW_KIND)
  * sail: UV emblem slot from a small atlas + per-object brand colour (= per-instance attribute)
"""
import bpy, bmesh, math, random, os, sys, json
import numpy as np
from mathutils import Vector, Matrix, noise, Euler

HERE = os.path.dirname(os.path.abspath(__file__))


def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# ------------------------------------------------------------------ palette (sRGB hex, role)
HEX = {
    # sea + shore
    'sea_abyss': ('#11364D', 'deep cold sea, far'),
    'sea_deep': ('#143F55', 'deep sea in the bay'),
    'sea_mid': ('#194C5E', 'mid depth'),
    'sea_shallow': ('#21615F', 'shelf over rock'),
    'sea_shoal': ('#4F8A80', 'contact shallows'),
    'foam': ('#F6F7F2', 'crisp shore foam / wakes'),
    # rock + land
    'rock': ('#7F848A', 'granite, lit'),
    'rock_dark': ('#5C6168', 'granite, cleft'),
    'rock_light': ('#A5A7A5', 'granite, weathered top'),
    'rock_wet': ('#3A3F45', 'tide band'),
    'lichen': ('#C2A85A', 'lichen spots on rock tops'),
    'grass': ('#748F45', 'meadow'),
    'grass_light': ('#99AF56', 'sunlit meadow patch'),
    'grass_dark': ('#58723A', 'meadow shade/edge'),
    'heather': ('#76606F', 'heather clumps'),
    'earth': ('#8B7558', 'footpaths'),
    'gravel': ('#B9B09C', 'gravel lanes'),
    'cobble': ('#8F8A82', 'quay paving'),
    'quay': ('#A8A398', 'dressed quay stone'),
    'quay_dark': ('#7A756C', 'quay wall courses'),
    'stone_white': ('#E4E0D6', 'limewashed stone'),
    # timber
    'tar': ('#2A2522', 'tarred timber'),
    'timber': ('#A57B52', 'fresh timber'),
    'timber_grey': ('#8A8278', 'weathered pier timber'),
    'timber_dark': ('#5A4636', 'piles, frames'),
    # facades (Nordic pastel + falu red)
    'wall_white': ('#F0ECE3', 'whitewash'),
    'wall_falu': ('#963326', 'falu red'),
    'wall_ochre': ('#DCA548', 'ochre'),
    'wall_blue': ('#9DB8CB', 'pale blue'),
    'wall_mint': ('#ABCBB3', 'mint'),
    'wall_mustard': ('#E6BE5E', 'mustard'),
    'wall_salmon': ('#E0977A', 'salmon'),
    'wall_sage': ('#87998A', 'sage grey'),
    'trim': ('#F7F4ED', 'window/corner trim'),
    'door_green': ('#2F5A4A', 'door'),
    'door_blue': ('#2E4B6B', 'door'),
    'door_red': ('#7A2A22', 'door'),
    # roofs
    'roof_red': ('#A6492F', 'tile red'),
    'roof_ochre': ('#C17A3A', 'tile ochre'),
    'roof_slate': ('#3E464F', 'slate'),
    'roof_tar': ('#2C2D31', 'tarred board roof'),
    'turf': ('#6F8A3E', 'turf roof'),
    # lighthouse
    'granite': ('#9C9C97', 'tower stone'),
    'granite_light': ('#BDBAB2', 'dressed quoins/bands'),
    'iron': ('#1F2327', 'gallery iron, lantern frame'),
    'brass': ('#C2923F', 'dome finial, lens frame'),
    'lens': ('#E8F3EE', 'fresnel lens glass'),
    # hulls
    'hull_black': ('#1E2327', 'tarred/painted black hull'),
    'hull_white': ('#EEEBE3', 'white topsides'),
    'hull_green': ('#2D5B49', 'green topsides'),
    'hull_blue': ('#25486A', 'navy topsides'),
    'hull_red': ('#8E2F24', 'red topsides'),
    'hull_stain': ('#4A3022', 'dark stained oak (gold brig)'),
    'gilt': ('#D9A93E', 'gilded trim'),
    'antifoul': ('#7B2E25', 'bottom paint'),
    'deck': ('#C4A272', 'scrubbed deck'),
    'canvas': ('#F2ECDF', 'usd sail canvas'),
    'tanbark': ('#8C4A2C', 'eur botter sail'),
    'lug_ochre': ('#C88E3C', 'fiat lugger sail'),
    'rope': ('#CDBB92', 'manila rope'),
    # vegetation
    'spruce': ('#2F4A33', 'spruce'),
    'spruce_light': ('#456744', 'spruce lit tips'),
    'birch_leaf': ('#9DB253', 'birch crown'),
    'birch_leaf2': ('#C2C25E', 'birch crown, yellowing'),
    'birch_bark': ('#E9E6DC', 'birch trunk'),
    'rowan_berry': ('#C7432C', 'rowan berries, flowers'),
    'flower_y': ('#EDCB4F', 'flowers'),
    'flower_w': ('#F4F1E8', 'flowers'),
    'flower_p': ('#C46D94', 'flowers'),
    # brand (status / identity only)
    'brand_usdt': ('#26A17B', 'USDT-like flagship'),
    'brand_usdc': ('#2775CA', 'USDC-like'),
    'brand_dai': ('#E9A93B', 'DAI-like'),
    'brand_eur': ('#2B4FA3', 'EUR coin'),
    'brand_gold': ('#D7AE45', 'gold coin'),
    'brand_red': ('#C2453A', 'misc usd coin'),
    'brand_violet': ('#6E5BB8', 'misc usd coin'),
    # light
    'sodium': ('#FFAE57', 'windows, pier lamps'),
    'lantern': ('#FFE0A8', 'lighthouse lamp + beam'),
    'riding': ('#FFF2D6', 'masthead riding light'),
    'moon': ('#E3EBFF', 'moon'),
    # "Ptolemaic harbour" (classical-town PLAN §3.1), mirrored from civic/cv_lib.py CLASSICAL (kit_gallery.py checks it)
    'sandstone': ('#C9B48E', 'ashlar base course'),
    'lime': ('#E4DAC4', 'lime plaster, stone surrounds, flags'),
    'lime_dark': ('#B4A68C', 'lime plaster, shaded / worn'),
    'wash_white': ('#F2EEE4', 'whitewash'),
    'wash_cream': ('#EADCC0', 'cream wash'),
    'wash_ochre': ('#E0B070', 'ochre wash'),
    'wash_sienna': ('#CC8C62', 'sienna wash'),
    'wash_rose': ('#DCAE98', 'faded rose wash'),
    'wash_blue': ('#C3D3DC', 'pale blue limewash'),
    'tile_a': ('#A35F45', 'terracotta roof'),
    'tile_b': ('#93604F', 'terracotta roof, browner'),
    'tile_c': ('#B97456', 'terracotta roof, lighter; antefixes'),
    'tile_ridge': ('#6E4536', 'ridge / hip caps, roof fascia'),
    'poly_red': ('#9E3B2C', 'polychromy: red ochre band'),
    'poly_blue': ('#2E5A8A', 'polychromy: Egyptian blue band'),
    'poly_ochre': ('#C9973C', 'polychromy: ochre key'),
    'poly_black': ('#2C2622', 'polychromy: black fillet'),
    'bronze_dark': ('#6E4824', 'bronze in shade'),
    'oak_dark': ('#4A3324', 'oiled oak: doors, pergolas, cranes'),
    'linen': ('#EFE6D2', 'undyed linen'),
    'shutter_blue': ('#2F6F9A', 'board shutters / doors'),
    'shutter_green': ('#4C7A52', 'board shutters / doors'),
    'shutter_teal': ('#2F8582', 'board shutters / doors'),
    'shutter_ox': ('#7E2F24', 'board shutters / doors'),
    'clay': ('#C69B74', 'unfired clay, kilns'),
    'terracotta': ('#B9663C', 'pots, amphorae'),
    'vine': ('#5E7F35', 'vine canopy'),
    'vine_light': ('#7A9845', 'vine canopy, lit'),
    'bougain': ('#C2306E', 'bougainvillea'),
    'bougain_light': ('#DA4F8C', 'bougainvillea, lit'),
    'olive_leaf': ('#6E7D43', 'olive crown'),
    'olive_dark': ('#4F5E33', 'olive crown, shade'),
}
PAL = {k: lin(v[0]) for k, v in HEX.items()}

# 14 = leaf_evergreen (runtime materials.ts PATTERN_LEAF_EVERGREEN): leaf that never blossoms, colours or drops; snowed.
PATTERN = dict(plain=0, boards=1, ashlar=2, planks_x=3, cobble=4, rock=5, grass=6, tiles=7, leaf=8,
               strakes=9, render=10, planks_y=11, metal=12, slate=13)


# ------------------------------------------------------------------ scene utils
def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images,
                 bpy.data.node_groups, bpy.data.curves):
        for b in list(coll):
            try:
                coll.remove(b)
            except Exception:
                pass


def collection(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    par = parent or bpy.context.scene.collection
    if c.name not in [x.name for x in par.children]:
        par.children.link(c)
    return c


_ACTIVE = {'coll': None}


def set_coll(c):
    _ACTIVE['coll'] = c


def cur_coll():
    return _ACTIVE['coll'] or bpy.context.scene.collection


# ------------------------------------------------------------------ shader expression helper
class SX:
    """Tiny operator-overloaded wrapper so shaders read like GLSL."""

    def __init__(self, nt, sock):
        self.nt, self.s = nt, sock

    def _m(self, op, *xs, clamp=False):
        n = self.nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, x in enumerate((self,) + xs):
            if isinstance(x, SX):
                self.nt.links.new(x.s, n.inputs[i])
            else:
                n.inputs[i].default_value = float(x)
        return SX(self.nt, n.outputs[0])

    def __add__(s, o): return s._m('ADD', o)
    def __radd__(s, o): return s._m('ADD', o)
    def __sub__(s, o): return s._m('SUBTRACT', o)
    def __rsub__(s, o): return C(s.nt, o)._m('SUBTRACT', s)
    def __mul__(s, o): return s._m('MULTIPLY', o)
    def __rmul__(s, o): return s._m('MULTIPLY', o)
    def __truediv__(s, o): return s._m('DIVIDE', o)
    def __rtruediv__(s, o): return C(s.nt, o)._m('DIVIDE', s)
    def __neg__(s): return s._m('MULTIPLY', -1.0)
    def fract(s): return s._m('FRACT')
    def floor(s): return s._m('FLOOR')
    def abs(s): return s._m('ABSOLUTE')
    def sqrt(s): return s._m('SQRT')
    def sin(s): return s._m('SINE')
    def cos(s): return s._m('COSINE')
    def pow(s, e): return s._m('POWER', e)
    def max(s, o): return s._m('MAXIMUM', o)
    def min(s, o): return s._m('MINIMUM', o)
    def clamp(s): return s._m('ADD', 0.0, clamp=True)
    def eq(s, v, eps=0.5): return s._m('COMPARE', v, eps)
    def sstep(s, a, b, lo=0.0, hi=1.0):  # smoothstep(a, b, x) remapped into [lo, hi]
        n = s.nt.nodes.new('ShaderNodeMapRange'); n.interpolation_type = 'SMOOTHSTEP'
        s.nt.links.new(s.s, n.inputs['Value'])
        n.inputs['From Min'].default_value, n.inputs['From Max'].default_value = a, b
        n.inputs['To Min'].default_value, n.inputs['To Max'].default_value = lo, hi
        return SX(s.nt, n.outputs['Result'])

    def lmap(s, a, b, lo=0.0, hi=1.0, clamp=True):
        n = s.nt.nodes.new('ShaderNodeMapRange'); n.interpolation_type = 'LINEAR'; n.clamp = clamp
        s.nt.links.new(s.s, n.inputs['Value'])
        n.inputs['From Min'].default_value, n.inputs['From Max'].default_value = a, b
        n.inputs['To Min'].default_value, n.inputs['To Max'].default_value = lo, hi
        return SX(s.nt, n.outputs['Result'])


def C(nt, v, name=None):
    n = nt.nodes.new('ShaderNodeValue'); n.outputs[0].default_value = float(v)
    if name:
        n.name = n.label = name
    return SX(nt, n.outputs[0])


def node(nt, kind, **props):
    n = nt.nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def link(nt, a, b):
    nt.links.new(a.s if isinstance(a, SX) else a, b)


def sock(n, ident, out=False):
    for s in (n.outputs if out else n.inputs):
        if (s.identifier == ident or s.name == ident) and s.enabled:
            return s
    raise KeyError(ident)


def sep(nt, vec):
    n = nt.nodes.new('ShaderNodeSeparateXYZ'); link(nt, vec, n.inputs[0])
    return SX(nt, n.outputs[0]), SX(nt, n.outputs[1]), SX(nt, n.outputs[2])


def comb(nt, x, y, z):
    n = nt.nodes.new('ShaderNodeCombineXYZ')
    for i, v in enumerate((x, y, z)):
        if isinstance(v, SX):
            link(nt, v, n.inputs[i])
        else:
            n.inputs[i].default_value = v
    return n.outputs[0]


def rgb(nt, c, name=None):
    n = nt.nodes.new('ShaderNodeRGB'); n.outputs[0].default_value = (*c[:3], 1)
    if name:
        n.name = n.label = name
    return n.outputs[0]


def mixc(nt, fac, a, b):
    n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'
    for ident, x in (('Factor_Float', fac), ('A_Color', a), ('B_Color', b)):
        s = sock(n, ident)
        if isinstance(x, SX):
            nt.links.new(x.s, s)
        elif isinstance(x, (int, float)):
            s.default_value = x
        elif isinstance(x, tuple):
            s.default_value = (*x[:3], 1)
        else:
            nt.links.new(x, s)
    return sock(n, 'Result_Color', out=True)


def mulc(nt, col, f):
    """colour * scalar"""
    n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = 'MULTIPLY'
    sock(n, 'Factor_Float').default_value = 1.0
    if isinstance(col, tuple):
        sock(n, 'A_Color').default_value = (*col[:3], 1)
    else:
        nt.links.new(col, sock(n, 'A_Color'))
    c = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3):
        if isinstance(f, SX):
            nt.links.new(f.s, c.inputs[i])
        else:
            c.inputs[i].default_value = f
    nt.links.new(c.outputs[0], sock(n, 'B_Color'))
    return sock(n, 'Result_Color', out=True)


def addc(nt, a, b):
    n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = 'ADD'
    sock(n, 'Factor_Float').default_value = 1.0
    for ident, x in (('A_Color', a), ('B_Color', b)):
        if isinstance(x, tuple):
            sock(n, ident).default_value = (*x[:3], 1)
        else:
            nt.links.new(x, sock(n, ident))
    return sock(n, 'Result_Color', out=True)


def noise3(nt, vec, scale, detail=2.0, rough=0.5, dims='3D'):
    n = nt.nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = dims
    n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    link(nt, vec, n.inputs['Vector'])
    return SX(nt, n.outputs['Fac'])


def white(nt, vec, dims='3D'):
    n = nt.nodes.new('ShaderNodeTexWhiteNoise'); n.noise_dimensions = dims
    link(nt, vec, n.inputs['Vector'])
    return SX(nt, n.outputs['Value'])


def vscale(nt, vec, sx, sy=None, sz=None, off=(0, 0, 0)):
    n = nt.nodes.new('ShaderNodeMapping'); n.vector_type = 'POINT'
    n.inputs['Scale'].default_value = (sx, sy if sy is not None else sx, sz if sz is not None else sx)
    n.inputs['Location'].default_value = off
    link(nt, vec, n.inputs['Vector'])
    return n.outputs['Vector']


def set_ramp(ramp_node, stops):
    els = ramp_node.color_ramp.elements
    while len(els) > 2:
        els.remove(els[-1])
    for i, (p, c) in enumerate(stops):
        e = els[i] if i < 2 else els.new(p)
        e.position = p
        e.color = (*c[:3], 1)


def new_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    return m


def strip(nt):
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    return nt.nodes['Material Output']


# ------------------------------------------------------------------ materials
M = {}


def build_kit_material():
    """M_kit: the one opaque material. Port: identical maths in the fragment shader."""
    m = new_mat('M_kit'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    at = node(nt, 'ShaderNodeAttribute', attribute_name='Col')
    tc = node(nt, 'ShaderNodeTexCoord')
    geo = node(nt, 'ShaderNodeNewGeometry')
    P = tc.outputs['Object']; Nn = tc.outputs['Normal']
    px, py, pz = sep(nt, P)
    nx, ny, nz = sep(nt, Nn)
    ax, ay, az = nx.abs(), ny.abs(), nz.abs()
    pid = (SX(nt, at.outputs['Alpha']) * 16.0 + 0.5).floor()
    vert = 1.0 - az.sstep(0.55, 0.8)               # 1 on walls
    hl = (nx * nx + ny * ny).sqrt().max(0.08)
    u = (py * nx - px * ny) / hl                    # horizontal coord along a wall of any heading (runtime: dot(P.xy, t))
    one = C(nt, 1.0)

    def line(coord, period, width, soft=0.02):
        f = (coord / period).fract()
        d = (f - 0.5).abs() * 2.0                   # 1 at the seam
        return d.sstep(1.0 - width - soft, 1.0 - width)

    # 1 boards: vertical cladding, per-board tint, dark groove
    bi = (u / 0.22).floor()
    btint = white(nt, comb(nt, bi, pz * 0.0, 3.0)) * 0.12 - 0.06
    f_boards = (1.0 + btint) * (1.0 - line(u, 0.22, 0.10) * 0.38 * vert)
    # 2 ashlar: coursed stone with staggered joints and per-block tint
    row = (pz / 0.55).floor()
    su = u / 1.05 + row * 0.5
    jt = line(pz, 0.55, 0.09).max(line(su, 1.0, 0.05) * vert)
    tint = white(nt, comb(nt, row, su.floor(), 1.0)) * 0.20 - 0.10
    f_ashlar = (1.0 + tint) * (1.0 - jt * 0.42)
    # 3/11 planks: deck boards across the walk direction
    pkx = (px / 0.32).floor(); pky = (py / 0.32).floor()
    f_px = (1.0 + white(nt, comb(nt, pkx, 5.0, 0.0)) * 0.22 - 0.11) * (1.0 - line(px, 0.32, 0.09) * 0.55)
    f_py = (1.0 + white(nt, comb(nt, pky, 7.0, 0.0)) * 0.22 - 0.11) * (1.0 - line(py, 0.32, 0.09) * 0.55)
    # 4 cobbles: voronoi setts
    vo = node(nt, 'ShaderNodeTexVoronoi'); vo.feature = 'DISTANCE_TO_EDGE'; vo.inputs['Scale'].default_value = 1.7
    link(nt, P, vo.inputs['Vector'])
    vo2 = node(nt, 'ShaderNodeTexVoronoi'); vo2.inputs['Scale'].default_value = 1.7
    link(nt, P, vo2.inputs['Vector'])
    cell = SX(nt, vo2.outputs['Distance'])
    f_cob = (0.9 + cell * 0.22) * (SX(nt, vo.outputs['Distance']).sstep(0.0, 0.09, 0.55, 1.0))
    # 5 rock: strata bands + speckle
    sn = noise3(nt, vscale(nt, P, 0.12), 0.9, 2.0)
    band = ((pz * 1.1 + sn * 6.0).sin() * 0.5 + 0.5)
    f_rock = 0.86 + band * 0.2 + (noise3(nt, P, 2.6, 2.0) - 0.5) * 0.18
    # 6 grass: two-scale mottling
    g1 = noise3(nt, vscale(nt, P, 0.08), 1.0, 2.0)
    g2 = noise3(nt, P, 1.4, 1.0)
    f_grass = 0.82 + g1.sstep(0.35, 0.65) * 0.28 + (g2 - 0.5) * 0.16
    # 7 tiles: vertical joints, rows are geometry
    trow = (pz / 0.36).floor()
    f_tiles = (1.0 + white(nt, comb(nt, (u / 0.34 + trow * 0.5).floor(), trow, 2.0)) * 0.18 - 0.09) * \
        (1.0 - line(u + trow * 0.17, 0.34, 0.07) * 0.35)
    # 8 leaf: up-facing lift + clumps
    f_leaf = (0.78 + nz * 0.28) * (0.9 + noise3(nt, P, 0.9, 2.0) * 0.2)
    # 9 strakes: hull planking lines
    f_strk = 1.0 - line(pz, 0.36, 0.06) * 0.22
    # 10 render: limewash, faint vertical streaks + low-frequency blotch
    f_rend = 0.95 + noise3(nt, vscale(nt, P, 0.6, 0.6, 0.12), 1.0, 3.0) * 0.08
    # 12 metal: plain + slight noise
    f_metal = 0.95 + noise3(nt, P, 4.0, 1.0) * 0.1
    # 13 slate: small staggered slates
    srow = (pz / 0.26).floor()
    f_slate = (1.0 + white(nt, comb(nt, (u / 0.4 + srow * 0.5).floor(), srow, 4.0)) * 0.24 - 0.12) * \
        (1.0 - line(u + srow * 0.2, 0.4, 0.06) * 0.3)
    fs = {0: one, 1: f_boards, 2: f_ashlar, 3: f_px, 4: f_cob, 5: f_rock, 6: f_grass, 7: f_tiles, 8: f_leaf,
          9: f_strk, 10: f_rend, 11: f_py, 12: f_metal, 13: f_slate}
    acc = None
    for k, f in fs.items():
        t = pid.eq(k, 0.25) * f
        acc = t if acc is None else acc + t
    # world-space large breakup (cloud-like value drift) - port: 256^2 tiling noise, world xz
    W = geo.outputs['Position']
    wn = noise3(nt, vscale(nt, W, 0.035), 1.0, 3.0)
    wn2 = noise3(nt, vscale(nt, W, 0.4), 1.0, 1.0)
    fworld = 0.93 + wn * 0.14 + (wn2 - 0.5) * 0.06
    col = mulc(nt, at.outputs['Color'], acc * fworld)
    link(nt, col, p.inputs['Base Color'])
    # roughness: timber/stone matte, hull/metal satin
    rough = 0.78 - pid.eq(9, 0.25) * 0.28 - pid.eq(12, 0.25) * 0.3
    link(nt, rough, p.inputs['Roughness'])
    p.inputs['Specular IOR Level'].default_value = 0.35
    M['kit'] = m
    return m


def build_glass_material():
    """M_window: dark glass by day, sodium-warm by night. Col.R = lit factor (0 = dark room), Col.G = warmth."""
    m = new_mat('M_window'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    at = node(nt, 'ShaderNodeAttribute', attribute_name='Col')
    r, g, b = sep(nt, at.outputs['Color'])
    p.inputs['Base Color'].default_value = (*lin('#22303C'), 1)
    p.inputs['Roughness'].default_value = 0.08
    p.inputs['Specular IOR Level'].default_value = 0.9
    tc = node(nt, 'ShaderNodeTexCoord')
    _, _, oz = sep(nt, tc.outputs['Object'])
    warm = rgb(nt, PAL['sodium']); cool = rgb(nt, lin('#FFD7A0'))
    ec = mixc(nt, g, warm, cool)
    k = C(nt, 0.0, 'WIN_K')
    link(nt, ec, p.inputs['Emission Color'])
    link(nt, r * k, p.inputs['Emission Strength'])
    M['window'] = m
    return m


def build_glow_material(name, base, glow, key):
    m = new_mat(name); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*base, 1)
    p.inputs['Roughness'].default_value = 0.15
    p.inputs['Emission Color'].default_value = (*glow, 1)
    k = C(nt, 0.0, key)
    link(nt, k, p.inputs['Emission Strength'])
    M[name] = m
    return m


def build_sail_material(atlas_img, slots):
    """M_sail: canvas with seams + emblem from atlas slot (object prop 'emblem'), cloth colour from object
    colour. Port: per-instance emblemIndex + clothColour; UV -> atlas slot."""
    m = new_mat('M_sail'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    uv = node(nt, 'ShaderNodeUVMap')
    u, v, _ = sep(nt, uv.outputs['UV'])
    oi = node(nt, 'ShaderNodeObjectInfo')
    em = node(nt, 'ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='emblem')
    ek = node(nt, 'ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='emblem_on')
    idx = SX(nt, em.outputs['Fac'])
    # emblem square: centred on (EU, EV) in sail UV, size ES (UV units of the sail's 0..1 space)
    eu, ev, es = 0.5, 0.5, 0.42
    lu = (u - (eu - es / 2)) / es
    lv = (v - (ev - es / 2)) / es
    inside = lu.sstep(0.0, 0.002) * (1.0 - lu.sstep(0.998, 1.0)) * lv.sstep(0.0, 0.002) * (1.0 - lv.sstep(0.998, 1.0))
    sx = (idx - (idx / slots).floor() * slots)
    sy = (idx / slots).floor()
    au = (lu.clamp() + sx) / slots
    av = (lv.clamp() + (slots - 1.0 - sy)) / slots
    im = node(nt, 'ShaderNodeTexImage', interpolation='Linear', extension='CLIP')
    im.image = atlas_img
    link(nt, comb(nt, au, av, 0.0), im.inputs['Vector'])
    alpha = SX(nt, im.outputs['Alpha']) * inside * SX(nt, ek.outputs['Fac'])
    cloth = oi.outputs['Color']
    # panel seams across the sail + tabling darker at the leech/foot
    seam = (((v * 9.0).fract() - 0.5).abs() * 2.0).sstep(0.9, 0.97)
    edge = (1.0 - u.sstep(0.0, 0.04)).max(1.0 - v.sstep(0.0, 0.035)).max(u.sstep(0.96, 1.0))
    shade = 1.0 - seam * 0.10 - edge * 0.10
    base = mulc(nt, cloth, shade)
    col = mixc(nt, alpha, base, im.outputs['Color'])
    link(nt, col, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.85
    p.inputs['Specular IOR Level'].default_value = 0.2
    # backlit glow: thin translucency (port: wrap/transmission term on the sail shader)
    tr = node(nt, 'ShaderNodeBsdfTranslucent'); link(nt, col, tr.inputs['Color'])
    mx = node(nt, 'ShaderNodeMixShader'); mx.inputs['Fac'].default_value = 0.28
    out = nt.nodes['Material Output']
    nt.links.new(p.outputs[0], mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    m.use_backface_culling = False
    M['sail'] = m
    return m


def build_emissive_unlit(name, color, key, strength=1.0, blend=False):
    """Unlit emission (sky cards, light pillars). Port: MeshBasicMaterial / additive."""
    m = new_mat(name); nt = m.node_tree; out = strip(nt)
    e = node(nt, 'ShaderNodeEmission'); e.inputs['Color'].default_value = (*color, 1)
    k = C(nt, strength, key)
    link(nt, k, e.inputs['Strength'])
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    M[name] = m
    return m


# ------------------------------------------------------------------ mesh helpers
def bm_box(sx, sy, sz, at=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(at) @ Matrix.Diagonal((sx, sy, sz, 1)))
    return bm


def bm_box2(x0, y0, z0, x1, y1, z1):
    return bm_box(x1 - x0, y1 - y0, z1 - z0, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))


def bm_cyl(r1, r2, h, segs=16, at=(0, 0, 0), cap=True, rot=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h,
                          matrix=Matrix.Translation((at[0], at[1], at[2] + h / 2)) @ Matrix.Rotation(rot, 4, 'Z'))
    return bm


def bm_sphere(r, at=(0, 0, 0), u=8, v=5, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r,
                              matrix=Matrix.Translation(at) @ Matrix.Diagonal((*scale, 1)))
    return bm


def bm_ico(r, at=(0, 0, 0), sub=1, scale=(1, 1, 1), seed=0, amp=0.0):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        if amp:
            v.co *= 1 + amp * noise.noise(v.co * 1.3 / max(r, 1e-3) + Vector((seed * 1.7, seed * 0.3, 0)))
        v.co = Vector((v.co.x * scale[0] + at[0], v.co.y * scale[1] + at[1], v.co.z * scale[2] + at[2]))
    return bm


def bm_rod(p, q, r, segs=4):
    p, q = Vector(p), Vector(q); d = q - p
    bm = bm_cyl(r, r, d.length, segs, (0, 0, 0), cap=False)
    M_ = Matrix.Translation(p) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=M_, verts=bm.verts)
    return bm


def bm_prism(poly, z0, z1):
    """Extrude a CCW 2D polygon from z0 to z1."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in poly]
    hi = [bm.verts.new((x, y, z1)) for x, y in poly]
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(hi)
    bm.faces.new(lo[::-1])
    return bm


def xf(bm, loc=(0, 0, 0), rz=0.0, rx=0.0, ry=0.0, scale=None):
    M_ = Matrix.Translation(loc) @ Euler((rx, ry, rz), 'XYZ').to_matrix().to_4x4()
    if scale:
        M_ = M_ @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=M_, verts=bm.verts)
    return bm


def merge(dst, src):
    me = bpy.data.meshes.new('_tmp'); src.to_mesh(me); src.free()
    dst.from_mesh(me); bpy.data.meshes.remove(me)
    return dst


def merged(*bms):
    out = bmesh.new()
    for b in bms:
        merge(out, b)
    return out


def jitter_col(c, k):
    return tuple(min(1.0, max(0.0, x * k)) for x in c)


def obj(name, bm, color=None, pattern=0, face=None, jitter=0.04, seed=0, mat=None, bevel=0.0,
        bevel_angle=35.0, smooth=False, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), shadow=True, family=None,
        props=None):
    """Make an object from a bmesh. `face(poly) -> (rgb, pattern)` for per-face colour."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    cur_coll().objects.link(ob)
    ob.location = loc; ob.rotation_euler = rot
    if parent is not None:
        ob.parent = parent
    me.materials.append(mat or M['kit'])
    if (mat is None or mat in (M.get('kit'), M.get('window'))) and (color is not None or face is not None):
        rng = random.Random(seed * 7919 + len(me.polygons))
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        buf = np.zeros((len(me.loops), 4), np.float32)
        for poly in me.polygons:
            if face is not None:
                c, pt = face(poly)
            else:
                c, pt = color, pattern
            if jitter:
                c = jitter_col(c, 1 + rng.uniform(-jitter, jitter))
            buf[list(poly.loop_indices)] = (*c[:3], (pt + 0.0) / 16.0)
        attr.data.foreach_set('color', buf.ravel())
    me.polygons.foreach_set('use_smooth', [smooth] * len(me.polygons))
    if bevel:
        b = ob.modifiers.new('Bevel', 'BEVEL'); b.width = bevel; b.segments = 1
        b.limit_method = 'ANGLE'; b.angle_limit = math.radians(bevel_angle)
        b.harden_normals = False
    ob.visible_shadow = shadow
    if family:
        ob['family'] = family
    for k, v in (props or {}).items():
        ob[k] = v
    return ob


def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, family=None, size=1.0):
    e = bpy.data.objects.new(name, None)
    cur_coll().objects.link(e)
    e.location = loc; e.rotation_euler = rot; e.empty_display_size = size
    if parent is not None:
        e.parent = parent
    if family:
        e['family'] = family
    return e


def smooth_closed(pts, n_per=6):
    """Catmull-Rom through closed control points."""
    P = [Vector(p) for p in pts]
    out = []
    N = len(P)
    for i in range(N):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % N], P[(i + 2) % N]
        for k in range(n_per):
            t = k / n_per
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((q.x, q.y))
    return out


def smooth_open(pts, n_per=6):
    P = [Vector(p) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n_per):
            t = k / n_per
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append(tuple(q))
    out.append(tuple(P[-2]))
    return out


def poly_area(poly):
    a = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]; x1, y1 = poly[(i + 1) % len(poly)]
        a += x0 * y1 - x1 * y0
    return a / 2


def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def offset_poly(poly, d):
    """Naive vertex-normal offset (positive = outward for CCW)."""
    n = len(poly); out = []
    for i in range(n):
        p0 = Vector(poly[i - 1]); p1 = Vector(poly[i]); p2 = Vector(poly[(i + 1) % n])
        e0 = (p1 - p0).normalized(); e1 = (p2 - p1).normalized()
        n0 = Vector((e0.y, -e0.x)); n1 = Vector((e1.y, -e1.x))
        nn = (n0 + n1)
        if nn.length < 1e-6:
            nn = n0
        nn.normalize()
        k = 1.0 / max(0.35, nn.dot(n0))
        q = p1 + nn * d * k
        out.append((q.x, q.y))
    return out


def tri_count(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for ob in objs:
        if ob.type != 'MESH':
            continue
        ev = ob.evaluated_get(dg); me = ev.to_mesh(); me.calc_loop_triangles()
        n += len(me.loop_triangles); ev.to_mesh_clear()
    return n


def descendants(root):
    out = [root]
    for c in root.children:
        out += descendants(c)
    return out
