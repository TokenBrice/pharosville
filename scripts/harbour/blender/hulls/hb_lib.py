"""Harbour hulls - shared palette + a tiny mesh builder with a furled twin.

Style C "Northern Light" contract (see agents/.../p1/style-c/palette.json):
  hb_opaque  COLOR_0 rgb = albedo (per face, +/-3% jitter), COLOR_0 alpha = pattern id / 16
             optional corner attribute _BRAND (1 = paint this corner with the instance brand colour;
             COLOR_0 then holds a fallback brand colour so an unaware shader still looks right)
  hb_sail    COLOR_0 rgb = cloth colour; TEXCOORD_0 = sail space (u: luff->leech, v: foot->head);
             TEXCOORD_1 = emblem space: the emblem square is exactly [0,1]^2 (outside = no emblem).
             It reads correctly from the sail's starboard face; flip u on the other face.
  hb_cover   COLOR_0 rgb = shade multiplier (near white); runtime multiplies by the instance brand colour.

Every mesh whose geometry changes between "set" (0) and "furled" (1) carries ONE shape key / glTF
morph target named "furl". Blender: x = bow, y = port, z = up; glTF: x = bow, y = up, z = starboard.
"""
import bpy, math, random
from mathutils import Vector, Matrix


def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    # style C hulls_and_sails (palette.json) ...
    'hull_black': '#1E2327', 'hull_white': '#EEEBE3', 'hull_green': '#2D5B49', 'hull_blue': '#25486A',
    'hull_red': '#8E2F24', 'hull_stain': '#4A3022', 'gilt': '#D9A93E', 'antifoul': '#7B2E25', 'deck': '#C4A272',
    'canvas': '#F2ECDF', 'tanbark': '#8C4A2C', 'lug_ochre': '#C88E3C', 'rope': '#CDBB92',
    'tar': '#2A2522', 'timber': '#A57B52', 'timber_grey': '#8A8278', 'timber_dark': '#5A4636',
    'iron': '#1F2327', 'brass': '#C2923F', 'trim': '#F7F4ED', 'door_green': '#2F5A4A', 'door_blue': '#2E4B6B',
    'wall_ochre': '#DCA548', 'roof_red': '#A6492F',
    # ... plus the naval additions (same restrained range; saturated hue stays on brand/status)
    'varnish': '#B9834A',          # varnished brightwork (rails, spars on small craft)
    'copper': '#B5683C',           # gold brig: coppered bottom
    'cream': '#E7DCC2',            # cabin sides, ship's boats
    'canvas_old': '#DCD2BC',
    'tanbark_sail': '#A65B37',     # eur botter sail cloth (tanbark lifted so it reads in shade)
    'oak': '#6E4A2E',              # oiled oak topsides (botter)       # 'other' workboat: weathered canvas
    'hull_teal': '#2E5E63',        # 'other' workboat topsides
    'hull_ochre': '#B9862F',       # fiat lugger strake
    'bottom_green': '#3F5B45',     # schooner bottom
    'wreck': '#7E8488', 'wreck_dark': '#53595E', 'wreck_light': '#A2A6A7', 'weed': '#4E5A3A',
    'flag_red': '#B23A30', 'flag_blue': '#2A4A86', 'flag_white': '#F2EFE8', 'flag_gold': '#E1B649',
    'brand_default': '#C2453A',
}
PAL = {k: lin(v) for k, v in HEX.items()}

PATTERN = dict(plain=0, boards=1, ashlar=2, planks_x=3, cobble=4, rock=5, grass=6, tiles=7, leaf=8,
               strakes=9, render=10, planks_y=11, metal=12, slate=13)
PT = PATTERN


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


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def basis(d):
    """Two unit vectors perpendicular to d."""
    d = Vector(d).normalized()
    up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u = d.cross(up).normalized()
    return u, d.cross(u).normalized()


# ------------------------------------------------------------------ mesh builder
class MB:
    """Faces with per-face colour/pattern/brand + per-corner UVs, and a furled twin of every vertex."""

    def __init__(self, seed=0):
        self.v, self.vf, self.f = [], [], []
        self.rng = random.Random(seed)

    def vert(self, p, pf=None):
        self.v.append(Vector(p))
        self.vf.append(Vector(pf if pf is not None else p))
        return len(self.v) - 1

    def face(self, idx, col, pat=0, brand=0.0, uv=None, uv2=None, smooth=False, jitter=0.03):
        out, uo, u2o = [], [], []
        for k, i in enumerate(idx):
            if i in out:
                continue
            out.append(i)
            uo.append(uv[k] if uv else (0.0, 0.0))
            u2o.append(uv2[k] if uv2 else (-4.0, -4.0))
        if len(out) < 3:
            return
        j = 1 + self.rng.uniform(-jitter, jitter)
        c = tuple(min(1.0, max(0.0, x * j)) for x in col[:3])
        self.f.append(dict(i=out, col=c, pat=pat, brand=brand, uv=uo, uv2=u2o, smooth=smooth))

    def tris(self):
        return sum(len(f['i']) - 2 for f in self.f)

    def has_furl(self):
        return any((a - b).length > 1e-5 for a, b in zip(self.v, self.vf))

    def backface(self, start=0, col=None, dark=1.0, brand=None):
        """Duplicate faces from `start` with their own vertices and reversed winding (two-sided parts)."""
        for f in list(self.f[start:]):
            m = {i: self.vert(self.v[i], self.vf[i]) for i in f['i']}
            g = dict(f); g['i'] = [m[i] for i in f['i']][::-1]; g['uv'] = f['uv'][::-1]; g['uv2'] = f['uv2'][::-1]
            g['col'] = tuple(x * dark for x in (col or f['col']))
            if brand is not None:
                g['brand'] = brand
            self.f.append(g)

    def extend(self, other):
        off = len(self.v)
        self.v += other.v; self.vf += other.vf
        for f in other.f:
            g = dict(f); g['i'] = [i + off for i in f['i']]
            self.f.append(g)


def rod(mb, p, q, r, col, segs=5, pf=None, qf=None, r2=None, cap=False, pat=0, smooth=True, brand=0.0, twist=0.0):
    """Tapered tube p->q (radius r -> r2). pf/qf = furled endpoints (same topology)."""
    r2 = r if r2 is None else r2
    p, q = Vector(p), Vector(q)
    pf = p if pf is None else Vector(pf)
    qf = q if qf is None else Vector(qf)

    def ring(a, b, rr, at):
        u, w = basis(b - a)
        return [at + rr * (math.cos(twist + 2 * math.pi * k / segs) * u + math.sin(twist + 2 * math.pi * k / segs) * w)
                for k in range(segs)]
    A = [mb.vert(x, y) for x, y in zip(ring(p, q, r, p), ring(pf, qf, r, pf))]
    B = [mb.vert(x, y) for x, y in zip(ring(p, q, r2, q), ring(pf, qf, r2, qf))]
    for k in range(segs):
        k2 = (k + 1) % segs
        mb.face((A[k], A[k2], B[k2], B[k]), col, pat, brand, smooth=smooth)
    if cap:
        mb.face(B, col, pat, brand)
        mb.face(A[::-1], col, pat, brand)


def line(mb, p, q, r, col=None, pf=None, qf=None):
    """Rigging line: 3-sided open prism (6 tris)."""
    rod(mb, p, q, r, col or PAL['tar'], 3, pf=pf, qf=qf, smooth=False)


def box(mb, c, size, col, pat=0, axes=None, brand=0.0, skip=(), smooth=False, jitter=0.03, fn=None):
    """Oriented box at c with half-extents size/2 along axes (x, y, z). skip: face keys to drop
    ('-x','+x','-y','+y','-z','+z'). fn(p) -> furled position (optional)."""
    ax = axes or (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
    c = Vector(c); hx, hy, hz = (s / 2 for s in size)
    idx = {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                p = c + ax[0] * sx * hx + ax[1] * sy * hy + ax[2] * sz * hz
                idx[(sx, sy, sz)] = mb.vert(p, fn(p) if fn else None)
    F = {'-x': [(-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)], '+x': [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)],
         '-y': [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)], '+y': [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)],
         '-z': [(-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)], '+z': [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]}
    for k, vs in F.items():
        if k in skip:
            continue
        mb.face([idx[v] for v in vs], col, pat, brand, smooth=smooth, jitter=jitter)


def box2(mb, x0, y0, z0, x1, y1, z1, col, pat=0, **kw):
    box(mb, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), col, pat, **kw)


def patch(mb, nu, nv, P, Pf, col, uv=None, uv2=None, smooth=True, pat=0, brand=0.0, jitter=0.0, tri_head=False):
    """Grid patch. P(u, v) set position, Pf(u, v) furled position. tri_head collapses v=1 to one vertex."""
    grid = []
    for i in range(nv + 1):
        v = i / nv
        if tri_head and i == nv:
            k = mb.vert(P(0.5, 1.0), Pf(0.5, 1.0))
            grid.append([k] * (nu + 1))
            continue
        grid.append([mb.vert(P(j / nu, v), Pf(j / nu, v)) for j in range(nu + 1)])
    for i in range(nv):
        for j in range(nu):
            q = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
            uvs = [uv(jj / nu, ii / nv) for ii, jj in q] if uv else None
            uv2s = [uv2(jj / nu, ii / nv) for ii, jj in q] if uv2 else None
            mb.face([grid[ii][jj] for ii, jj in q], col, pat, brand, uv=uvs, uv2=uv2s, smooth=smooth, jitter=jitter)
    return grid


# ------------------------------------------------------------------ objects
def material(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    return m


def ensure_export_materials():
    """Plain stand-ins; the runtime replaces them by name. Vertex colours carry the look."""
    for nm, rough, double in (('hb_opaque', 0.75, False), ('hb_sail', 0.85, True), ('hb_cover', 0.8, False)):
        m = material(nm)
        try:
            m.use_nodes = True
        except Exception:
            pass
        nt = m.node_tree
        p = nt.nodes.get('Principled BSDF')
        if p is not None and not any(n.type == 'ATTRIBUTE' for n in nt.nodes):
            a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = 'Col'
            nt.links.new(a.outputs['Color'], p.inputs['Base Color'])
            p.inputs['Roughness'].default_value = rough
        m.use_backface_culling = not double


def to_object(mb, name, mat, parent=None, origin=(0, 0, 0), coll=None, props=None):
    origin = Vector(origin)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p - origin) for p in mb.v], [], [f['i'] for f in mb.f])
    me.update()
    n_loops = len(me.loops)
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cbuf = [0.0] * (n_loops * 4)
    want_brand = any(f['brand'] for f in mb.f)
    bbuf = [0.0] * n_loops
    want_uv = mat == 'hb_sail' or any(any(x != (0.0, 0.0) for x in f['uv']) for f in mb.f)
    want_uv2 = mat == 'hb_sail'
    ubuf = [0.0] * (n_loops * 2); u2buf = [0.0] * (n_loops * 2)
    smooth = []
    for poly, f in zip(me.polygons, mb.f):
        a = f['pat'] / 16.0
        for k, li in enumerate(poly.loop_indices):
            cbuf[li * 4:li * 4 + 4] = (*f['col'], a)
            bbuf[li] = f['brand']
            ubuf[li * 2:li * 2 + 2] = f['uv'][k]
            u2buf[li * 2:li * 2 + 2] = f['uv2'][k]
        smooth.append(f['smooth'])
    col.data.foreach_set('color', cbuf)
    if want_brand:
        br = me.attributes.new('_BRAND', 'FLOAT', 'CORNER')
        br.data.foreach_set('value', bbuf)
    if want_uv:
        uvl = me.uv_layers.new(name='UVMap'); uvl.data.foreach_set('uv', ubuf)
    if want_uv2:
        uvl2 = me.uv_layers.new(name='UVEmblem'); uvl2.data.foreach_set('uv', u2buf)
    me.polygons.foreach_set('use_smooth', smooth)
    me.materials.append(material(mat))
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    ob.location = origin
    if parent is not None:
        ob.parent = parent
    if mb.has_furl():
        ob.shape_key_add(name='Basis', from_mix=False)
        k = ob.shape_key_add(name='furl', from_mix=False)
        k.data.foreach_set('co', [c for p in mb.vf for c in (p - origin)])
        k.value = 0.0
    for kk, vv in (props or {}).items():
        ob[kk] = vv
    return ob


def empty(name, loc=(0, 0, 0), parent=None, coll=None, rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    (coll or bpy.context.scene.collection).objects.link(e)
    e.location = loc; e.rotation_euler = rot; e.empty_display_size = 0.5
    if parent is not None:
        e.parent = parent
    return e


def descendants(root):
    out = [root]
    for c in root.children:
        out += descendants(c)
    return out


def tri_count(objs):
    n = 0
    for ob in objs:
        if ob.type == 'MESH':
            ob.data.calc_loop_triangles(); n += len(ob.data.loop_triangles)
    return n
