"""Style B "Living Sea Chart" -- shared helpers (palette, node helpers, mesh kit builder).

Everything that ends up on screen is built from these primitives so the same rules
(per-face vertex colour, metre-scale UVs, named material slots) hold for every asset
family and survive the GLB export unchanged.
"""
import bpy, bmesh, math, random, json, os
from mathutils import Vector, Matrix, noise

HERE = os.path.dirname(os.path.abspath(__file__))


# ------------------------------------------------------------------ colour
def lin1(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(h):
    h = h.lstrip('#')
    return tuple(lin1(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


with open(os.path.join(HERE, 'palette.json')) as f:
    PALETTE = json.load(f)
P = {k: lin(v['hex']) for k, v in PALETTE['colours'].items()}


def shade(c, k):
    return tuple(min(1.0, x * k) for x in c)


def mixc(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


# ------------------------------------------------------------------ node helpers
def N(nt, kind, **props):
    n = nt.nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def L(nt, a, b):
    nt.links.new(a, b)


def sock(node, ident, out=False):
    for s in (node.outputs if out else node.inputs):
        if (s.identifier == ident or s.name == ident) and s.enabled:
            return s
    raise KeyError(ident)


def V(nt, x):
    if isinstance(x, (int, float)):
        n = N(nt, 'ShaderNodeValue')
        n.outputs[0].default_value = x
        return n.outputs[0]
    return x


def math_(nt, op, a, b=None, c=None, clamp=False):
    n = N(nt, 'ShaderNodeMath', operation=op, use_clamp=clamp)
    for i, x in enumerate((a, b, c)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            L(nt, x, n.inputs[i])
    return n.outputs[0]


def add(nt, a, b): return math_(nt, 'ADD', a, b)
def sub(nt, a, b): return math_(nt, 'SUBTRACT', a, b)
def mul(nt, a, b): return math_(nt, 'MULTIPLY', a, b)


def mrange(nt, x, a, b, c=0.0, d=1.0, smooth=True, clamp=True):
    n = N(nt, 'ShaderNodeMapRange', interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR', clamp=clamp)
    L(nt, x, n.inputs['Value'])
    for k, v in (('From Min', a), ('From Max', b), ('To Min', c), ('To Max', d)):
        if isinstance(v, (int, float)):
            n.inputs[k].default_value = v
        else:
            L(nt, v, n.inputs[k])
    return n.outputs['Result']


def mix(nt, fac, a, b, blend='MIX'):
    n = N(nt, 'ShaderNodeMix', data_type='RGBA', blend_type=blend)
    for ident, x in (('Factor_Float', fac), ('A_Color', a), ('B_Color', b)):
        s = sock(n, ident)
        if isinstance(x, (int, float)):
            s.default_value = x
        elif isinstance(x, tuple):
            s.default_value = (*x[:3], 1)
        else:
            L(nt, x, s)
    return sock(n, 'Result_Color', out=True)


def vmath(nt, op, a, b=None, scale=None):
    n = N(nt, 'ShaderNodeVectorMath', operation=op)
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (tuple, list)):
            n.inputs[i].default_value = x
        else:
            L(nt, x, n.inputs[i])
    if scale is not None:
        if isinstance(scale, (int, float)):
            n.inputs['Scale'].default_value = scale
        else:
            L(nt, scale, n.inputs['Scale'])
    out = 'Value' if op in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else 'Vector'
    return sock(n, out, out=True)


def rgb(nt, c, name=None):
    n = N(nt, 'ShaderNodeRGB')
    n.outputs[0].default_value = (*c[:3], 1)
    if name:
        n.name = name
        n.label = name
    return n.outputs[0]


def value(nt, v, name):
    n = N(nt, 'ShaderNodeValue')
    n.outputs[0].default_value = v
    n.name = name
    n.label = name
    return n.outputs[0]


def noise_tex(nt, vec, scale, detail=2.0, rough=0.5, dim='3D', w=None, out='Fac'):
    n = N(nt, 'ShaderNodeTexNoise')
    n.noise_dimensions = dim
    if w is not None:
        n.inputs['W'].default_value = w
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    if vec is not None:
        L(nt, vec, n.inputs['Vector'])
    return n.outputs[out]


def set_ramp(ramp_node, stops, interp='LINEAR'):
    ramp_node.color_ramp.interpolation = interp
    els = ramp_node.color_ramp.elements
    while len(els) > 1:
        els.remove(els[-1])
    for i, (p, c) in enumerate(stops):
        e = els[0] if i == 0 else els.new(p)
        e.position = p
        e.color = (*c[:3], 1) if len(c) == 3 else tuple(c)


def ramp(nt, fac, stops, name=None, interp='LINEAR'):
    r = N(nt, 'ShaderNodeValToRGB')
    if name:
        r.name = name
        r.label = name
    L(nt, fac, r.inputs['Fac'])
    set_ramp(r, stops, interp)
    return r.outputs['Color']


def sep_xyz(nt, v):
    n = N(nt, 'ShaderNodeSeparateXYZ')
    L(nt, v, n.inputs[0])
    return n.outputs['X'], n.outputs['Y'], n.outputs['Z']


def comb_xyz(nt, x, y, z):
    n = N(nt, 'ShaderNodeCombineXYZ')
    for i, s in enumerate((x, y, z)):
        if isinstance(s, (int, float)):
            n.inputs[i].default_value = s
        else:
            L(nt, s, n.inputs[i])
    return n.outputs[0]


def new_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = N(nt, 'ShaderNodeOutputMaterial')
    return m, nt, out


# ------------------------------------------------------------------ mesh kit builder
class Kit:
    """Accumulates geometry into one bmesh with per-corner colour 'Col' (alpha 0 = brand slot),
    metre-scale box UVs and named material slots. finish() -> object."""

    def __init__(self, name, seed=0):
        self.name = name
        self.bm = bmesh.new()
        self.cl = self.bm.loops.layers.float_color.new('Col')
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.mats = []
        self.smooth = set()
        self.rng = random.Random(hash(name) & 0xffff ^ seed)

    def mat(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    # --- colouring of freshly made faces
    def paint(self, faces, color, mat='wash', jitter=0.04, uv='box', smooth=False, brand=False, uvscale=1.0,
              face_color=None):
        mi = self.mat(mat)
        for f in faces:
            f.material_index = mi
            c = face_color(f) if face_color else color
            if jitter:
                k = 1 + self.rng.uniform(-jitter, jitter)
                c = tuple(min(1.0, x * k) for x in c)
            a = 0.0 if brand else 1.0
            for lp in f.loops:
                lp[self.cl] = (*c[:3], a)
            if smooth:
                self.smooth.add(f)
            if uv == 'box':
                n = f.normal
                ax = max(range(3), key=lambda i: abs(n[i]))
                for lp in f.loops:
                    co = lp.vert.co
                    if ax == 2:
                        u, v = co.x, co.y
                    else:
                        # horizontal tangent of this face, so courses run level
                        t = Vector((-n.y, n.x, 0)).normalized() if Vector((n.x, n.y, 0)).length > 1e-4 else Vector((1, 0, 0))
                        u, v = co.dot(t), co.z
                    lp[self.uv].uv = (u * uvscale, v * uvscale)
            elif uv == 'cyl':
                for lp in f.loops:
                    co = lp.vert.co
                    r = math.hypot(co.x, co.y)
                    lp[self.uv].uv = (math.atan2(co.y, co.x) * max(r, 0.3) * uvscale, co.z * uvscale)
            elif uv is None:
                pass
        return faces

    @staticmethod
    def faces_of(verts):
        fs = set()
        for v in verts:
            fs.update(v.link_faces)
        return list(fs)

    # --- primitives (all take a 4x4 matrix)
    def box(self, size, at=(0, 0, 0), color=(1, 1, 1), mat='wash', rz=0.0, M=None, **kw):
        m = Matrix.Translation(at) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Diagonal((*size, 1))
        if M is not None:
            m = M @ m
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        fs = self.faces_of(r['verts'])
        self.bm.normal_update()
        return self.paint(fs, color, mat, **kw)

    def cyl(self, r1, r2, h, segs=12, at=(0, 0, 0), color=(1, 1, 1), mat='wash', cap=True, M=None, rot=0.0, **kw):
        m = Matrix.Translation((at[0], at[1], at[2] + h / 2)) @ Matrix.Rotation(rot, 4, 'Z')
        if M is not None:
            m = M @ m
        r = bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r1, radius2=r2,
                                  depth=h, matrix=m)
        fs = self.faces_of(r['verts'])
        self.bm.normal_update()
        kw.setdefault('uv', 'cyl')
        return self.paint(fs, color, mat, **kw)

    def rod(self, p, q, r, color, mat='wash', segs=5, r2=None, **kw):
        p, q = Vector(p), Vector(q)
        d = q - p
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        m = Matrix.Translation(p) @ rot
        res = bmesh.ops.create_cone(self.bm, cap_ends=False, cap_tris=False, segments=segs, radius1=r,
                                    radius2=r if r2 is None else r2, depth=d.length,
                                    matrix=m @ Matrix.Translation((0, 0, d.length / 2)))
        fs = self.faces_of(res['verts'])
        self.bm.normal_update()
        kw.setdefault('uv', None)
        return self.paint(fs, color, mat, **kw)

    def sphere(self, r, at=(0, 0, 0), color=(1, 1, 1), mat='wash', u=8, v=5, scale=(1, 1, 1), M=None, **kw):
        m = Matrix.Translation(at) @ Matrix.Diagonal((*scale, 1))
        if M is not None:
            m = M @ m
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=r, matrix=m)
        fs = self.faces_of(res['verts'])
        self.bm.normal_update()
        kw.setdefault('smooth', True)
        return self.paint(fs, color, mat, **kw)

    def ico(self, r, at=(0, 0, 0), color=(1, 1, 1), mat='wash', sub=1, scale=(1, 1, 1), seed=0, amp=0.25, M=None, **kw):
        m = Matrix.Translation(at) @ Matrix.Diagonal((*scale, 1))
        if M is not None:
            m = M @ m
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=Matrix.Identity(4))
        for vv in res['verts']:
            n = noise.noise(vv.co * (1.7 / max(r, 0.01)) + Vector((seed * 3.1, seed * 1.3, 0)))
            vv.co *= 1 + amp * n
            vv.co = m @ vv.co
        fs = self.faces_of(res['verts'])
        self.bm.normal_update()
        return self.paint(fs, color, mat, **kw)

    def poly_prism(self, pts, z0, z1, color, mat='wash', top_color=None, top_mat=None, cap_bottom=False, **kw):
        """Extrude a closed CCW polygon (list of (x,y)) from z0 to z1."""
        lo = [self.bm.verts.new((x, y, z0)) for x, y in pts]
        hi = [self.bm.verts.new((x, y, z1)) for x, y in pts]
        n = len(pts)
        sides = [self.bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i])) for i in range(n)]
        top = self.bm.faces.new(hi)
        fs = sides + [top]
        if cap_bottom:
            fs.append(self.bm.faces.new(lo[::-1]))
        self.bm.normal_update()
        self.paint(sides, color, mat, **kw)
        self.paint([top], top_color or color, top_mat or mat, **{k: v for k, v in kw.items() if k != 'smooth'})
        return fs

    def quad_strip(self, rows, color, mat='wash', closed=False, **kw):
        """rows: list of lists of 3D points (same length). Builds a grid surface."""
        vs = [[self.bm.verts.new(p) for p in row] for row in rows]
        fs = []
        for a, b in zip(vs, vs[1:]):
            m = len(a)
            for j in range(m - 1 + (1 if closed else 0)):
                j2 = (j + 1) % m
                fs.append(self.bm.faces.new((a[j], a[j2], b[j2], b[j])))
        self.bm.normal_update()
        return self.paint(fs, color, mat, **kw), vs

    def tri_fan(self, center, ring, color, mat='wash', **kw):
        c = self.bm.verts.new(center)
        rv = [self.bm.verts.new(p) for p in ring]
        fs = [self.bm.faces.new((c, rv[i], rv[(i + 1) % len(rv)])) for i in range(len(rv))]
        self.bm.normal_update()
        return self.paint(fs, color, mat, **kw)

    def transform_faces(self, faces, M):
        vs = set()
        for f in faces:
            vs.update(f.verts)
        bmesh.ops.transform(self.bm, matrix=M, verts=list(vs))

    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def finish(self, coll=None, loc=(0, 0, 0), rz=0.0, parent=None, outline=True):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=0.0005)
        for f in self.bm.faces:
            f.smooth = f in self.smooth
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        (coll or bpy.context.scene.collection).objects.link(ob)
        ob.location = loc
        ob.rotation_euler.z = rz
        if parent:
            ob.parent = parent
        import mats
        for mname in self.mats:
            me.materials.append(mats.get(mname))
        ob['outline'] = 1 if outline else 0
        return ob


def link_dup(src, name, loc, rz=0.0, coll=None, parent=None, scale=1.0):
    """Linked duplicate of an object hierarchy (instancing, like the runtime)."""
    ob = bpy.data.objects.new(name, src.data)
    (coll or bpy.context.scene.collection).objects.link(ob)
    ob.location = loc
    ob.rotation_euler.z = rz
    ob.scale = (scale, scale, scale)
    for k in src.keys():
        ob[k] = src[k]
    if parent:
        ob.parent = parent
    for ch in src.children:
        c2 = link_dup(ch, name + '_' + ch.name.split('.')[0], ch.location.copy(), ch.rotation_euler.z, coll, ob)
        c2.rotation_euler = ch.rotation_euler.copy()
        c2.scale = ch.scale.copy()
        c2.color = ch.color
    ob.color = src.color
    return ob


def empty(name, loc=(0, 0, 0), rz=0.0, coll=None, parent=None):
    e = bpy.data.objects.new(name, None)
    (coll or bpy.context.scene.collection).objects.link(e)
    e.location = loc
    e.rotation_euler.z = rz
    if parent:
        e.parent = parent
    return e
