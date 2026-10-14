"""Style A "Lantern Miniature" -- shared helpers (palette, mesh parts, AO bake, materials).

Every asset is a `Part`: a bmesh that accumulates primitives. Each primitive gets ONE colour
(with a small random hue/value drift, i.e. per-stone variation) and pattern masks:
    _pat0 = (masonry, cobble, roof tile, plank grain)
    _pat1 = (foliage, grass, rock, emissive-window)
`finish()` turns it into an object, bakes self-AO + a height gradient into the `Col` corner colour,
so the GLB carries everything the WebGL2 shader needs (COLOR_0 + two custom attributes).
"""
import bpy, bmesh, math, random, json, os, colorsys
import numpy as np
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))


def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


PALJ = json.load(open(os.path.join(HERE, 'palette.json')))
PAL = {k: lin(v['hex']) for k, v in PALJ['colors'].items()}


def P(name, k=1.0):
    c = PAL[name]
    return tuple(min(1.0, x * k) for x in c)


def tint(c, k=1.0, warm=0.0):
    """value scale k; warm>0 pushes toward honey, warm<0 toward lavender."""
    r, g, b = c
    if warm > 0:
        r, g, b = r * (1 + 0.10 * warm), g * (1 + 0.03 * warm), b * (1 - 0.12 * warm)
    elif warm < 0:
        w = -warm
        r, g, b = r * (1 - 0.06 * w), g * (1 - 0.04 * w), b * (1 + 0.10 * w)
    return (min(1, r * k), min(1, g * k), min(1, b * k))


def mixc(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


# ------------------------------------------------------------------ collections
def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for d in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.node_groups, bpy.data.lights,
              bpy.data.cameras, bpy.data.curves):
        for x in list(d):
            try:
                d.remove(x)
            except Exception:
                pass
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


# ------------------------------------------------------------------ primitives (bmesh)
def bm_box(sx, sy, sz, at=(0, 0, 0), bevel=0.0, seg=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(at) @ Matrix.Diagonal((sx, sy, sz, 1)))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, 0.49 * min(sx, sy, sz)), segments=seg,
                        profile=0.5, affect='EDGES', clamp_overlap=True)
    return bm


def bm_cyl(r1, r2, h, segs=12, at=(0, 0, 0), cap=True, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r1, radius2=r2,
                          depth=h, matrix=Matrix.Translation((at[0], at[1], at[2] + h / 2)))
    if bevel > 0 and cap:
        edges = [e for e in bm.edges if len(e.link_faces) == 2 and
                 abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, profile=0.5, affect='EDGES', clamp_overlap=True)
    return bm


def bm_sphere(r, sub=1, at=(0, 0, 0), scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r,
                               matrix=Matrix.Translation(at) @ Matrix.Diagonal((*scale, 1)))
    return bm


def bm_uvsphere(r, u=8, v=5, at=(0, 0, 0), scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r,
                              matrix=Matrix.Translation(at) @ Matrix.Diagonal((*scale, 1)))
    return bm


def bm_rock(r, seed, sub=1, squash=0.7, amp=0.28, at=(0, 0, 0), stretch=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    off = Vector((seed * 3.17, seed * 1.31, seed * 0.71))
    for v in bm.verts:
        n = noise.noise(v.co * (1.6 / max(r, 0.2)) + off)
        v.co *= 1 + amp * n
        v.co.z *= squash
        v.co.x *= stretch[0]; v.co.y *= stretch[1]; v.co.z *= stretch[2]
        v.co += Vector(at)
    return bm


def bm_prism(poly, z0, z1, cap_top=True, cap_bot=False):
    """Extrude a 2D polygon (ccw list of (x,y)) from z0 to z1."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in poly]
    hi = [bm.verts.new((x, y, z1)) for x, y in poly]
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    if cap_top:
        bm.faces.new(hi)
    if cap_bot:
        bm.faces.new(lo[::-1])
    return bm


def bm_rod(p, q, r, segs=6, cap=False):
    """Cylinder from p to q."""
    p, q = Vector(p), Vector(q)
    d = q - p
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r, radius2=r, depth=d.length,
                          matrix=Matrix.Translation((p + q) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    return bm


def bm_tube(pts, r, segs=5, closed=False):
    """Tube along a polyline (ropes, railings)."""
    bm = bmesh.new()
    pts = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == len(pts) - 1:
            t = pts[-1] - pts[-2]
        else:
            t = pts[i + 1] - pts[i - 1]
        t.normalize()
        a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        u = t.cross(a).normalized(); w = t.cross(u).normalized()
        rings.append([bm.verts.new(p + r * (math.cos(2 * math.pi * k / segs) * u + math.sin(2 * math.pi * k / segs) * w))
                      for k in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for k in range(segs):
            bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
    return bm


def catenary(p, q, sag, n=8):
    p, q = Vector(p), Vector(q)
    return [p.lerp(q, i / n) - Vector((0, 0, sag * 4 * (i / n) * (1 - i / n))) for i in range(n + 1)]


def xform(bm, loc=(0, 0, 0), rz=0.0, rx=0.0, ry=0.0, s=None):
    m = Matrix.Translation(loc) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X')
    if s is not None:
        m = m @ Matrix.Diagonal((*s, 1) if isinstance(s, (tuple, list)) else (s, s, s, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def jitter(bm, amp, seed=0, scale=1.3):
    off = Vector((seed * 1.7, seed * 2.3, seed * 0.9))
    for v in bm.verts:
        v.co += amp * Vector((noise.noise(v.co * scale + off), noise.noise(v.co * scale + off + Vector((5, 0, 0))),
                              0.5 * noise.noise(v.co * scale + off + Vector((0, 9, 0)))))
    return bm


# ------------------------------------------------------------------ Part builder
MATS = {}


class Part:
    def __init__(self, name, seed=0):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.p0 = self.bm.loops.layers.float_color.new('_pat0')
        self.p1 = self.bm.loops.layers.float_color.new('_pat1')
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.mats = []
        self.rng = random.Random(hash(name) % 100000 + seed)

    def mat_index(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def add(self, src, color, pat0=(0, 0, 0, 0), pat1=(0, 0, 0, 0), drift=0.05, mat='toon', smooth=False,
            uv=None, face_color=None):
        """Merge bmesh `src` (consumed). One colour per call (+drift), or face_color(face)->rgb."""
        me = bpy.data.meshes.new('_tmp')
        src.to_mesh(me); src.free()
        n0 = len(self.bm.faces)
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        self.bm.faces.ensure_lookup_table()
        k = 1 + self.rng.uniform(-drift, drift)
        hshift = self.rng.uniform(-drift, drift) * 0.6
        base = tint(color, k, hshift * 2) if color is not None else None
        mi = self.mat_index(mat)
        for f in self.bm.faces[n0:]:
            c = face_color(f) if face_color else base
            for lp in f.loops:
                lp[self.col] = (*c, 1.0)
                lp[self.p0] = pat0
                lp[self.p1] = pat1
                if uv is not None:
                    lp[self.uv].uv = uv(lp.vert.co, f)
            f.smooth = smooth
            f.material_index = mi
        return self

    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def finish(self, collection, ao=0.0, ao_dist=1.5, ground=None, grad=None, wn=True, loc=(0, 0, 0), rz=0.0,
               parent=None, shadow=True, sphere_normals=None, ao_extra=None, sphere_glob=None):
        """Create the object. ao = strength (0 off). grad = (z0, z1, k0, k1) value ramp by local z.
        sphere_normals = list of (center, radius) -> foliage normals pointing out of blobs."""
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(self.name, me)
        collection.objects.link(ob)
        for m in self.mats:
            me.materials.append(MATS[m])
        ob.location = loc; ob.rotation_euler.z = rz
        if parent:
            ob.parent = parent
        ob.visible_shadow = shadow
        if 'Col' in me.color_attributes:
            me.color_attributes.active_color = me.color_attributes['Col']
            me.color_attributes.render_color_index = me.color_attributes.find('Col')
        # normals: weighted (hard-ish flats, soft bevels) unless all smooth organic
        if sphere_normals:
            set_sphere_normals(me, sphere_normals, sphere_glob)
        elif wn == 'angle':
            me.set_sharp_from_angle(angle=math.radians(48))
        elif wn:
            weighted_normals(me)
        if ao > 0 or grad:
            bake_vertex_shading(ob, ao, ao_dist, ground, grad, ao_extra)
        return ob


def weighted_normals(me):
    """Face-area^2 weighted vertex normals (cheap 'harden normals'), written as custom split normals,
    only for smooth faces; flat faces keep their face normal."""
    me.update()
    nv = len(me.vertices)
    acc = np.zeros((nv, 3))
    for p in me.polygons:
        if not p.use_smooth:
            continue
        w = max(p.area, 1e-6) ** 2
        for vi in p.vertices:
            acc[vi] += np.array(p.normal) * w
    norms = []
    for p in me.polygons:
        for li in p.loop_indices:
            if p.use_smooth:
                v = acc[me.loops[li].vertex_index]
                l = np.linalg.norm(v)
                norms.append(tuple(v / l) if l > 0 else tuple(p.normal))
            else:
                norms.append(tuple(p.normal))
    me.normals_split_custom_set(norms)


def set_sphere_normals(me, spheres, glob=None):
    """Each vertex takes the normal of the blob it is closest to the surface of (soft foliage shading).
    glob = (centre, radii xyz, weight): blend toward one ellipsoid normal (soft cloud masses)."""
    norms = []
    C = np.array([s[0] for s in spheres]); R = np.array([s[1] for s in spheres])
    co = np.array([v.co for v in me.vertices])
    vn = []
    for v in co:
        d = np.linalg.norm(C - v, axis=1) / R
        i = int(np.argmin(np.abs(d - 1.0)))
        n = Vector(v - C[i]).normalized()
        if glob is not None:
            gc, gr, gw = glob
            g = Vector(((v[0] - gc[0]) / gr[0] ** 2, (v[1] - gc[1]) / gr[1] ** 2, (v[2] - gc[2]) / gr[2] ** 2)).normalized()
            n = (n * (1 - gw) + g * gw).normalized()
        else:
            n = (n + Vector((0, 0, 0.25))).normalized()
        vn.append(n)
    for p in me.polygons:
        p.use_smooth = True
        for li in p.loop_indices:
            norms.append(tuple(vn[me.loops[li].vertex_index]))
    me.normals_split_custom_set(norms)


_SAMPLES = None


def hemi_samples(n=20):
    global _SAMPLES
    if _SAMPLES is None or len(_SAMPLES) != n:
        rng = random.Random(3)
        s = []
        for i in range(n):
            u, v = (i + rng.random()) / n, rng.random()
            r = math.sqrt(u); t = 2 * math.pi * v
            s.append(Vector((r * math.cos(t), r * math.sin(t), math.sqrt(max(0, 1 - u)))))
        _SAMPLES = s
    return _SAMPLES


def bake_vertex_shading(ob, ao, dist, ground, grad, extra=None):
    """Self-AO (+ optional ground plane at z=ground, + extra BVH) and a height gradient, multiplied into Col."""
    me = ob.data
    me.update()
    verts = [v.co.copy() for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    if ground is not None:
        b = len(verts)
        G = 400.0
        verts += [Vector((-G, -G, ground)), Vector((G, -G, ground)), Vector((G, G, ground)), Vector((-G, G, ground))]
        polys.append((b, b + 1, b + 2, b + 3))
    bvh = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    trees = [bvh] + (extra or [])
    nv = len(me.vertices)
    occ = np.ones(nv)
    if ao > 0:
        # vertex normals from custom split normals average
        vn = [Vector((0, 0, 0)) for _ in range(nv)]
        try:
            for lp in me.loops:
                vn[lp.vertex_index] += lp.normal
        except Exception:
            for v in me.vertices:
                vn[v.index] = v.normal.copy()
        S = hemi_samples(18)
        for i, v in enumerate(me.vertices):
            n = vn[i].normalized() if vn[i].length > 0 else Vector((0, 0, 1))
            a = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
            t = n.cross(a).normalized(); b = n.cross(t)
            o = v.co + n * 0.02
            hit = 0.0
            for s in S:
                d = t * s.x + b * s.y + n * s.z
                for tr in trees:
                    loc, _, _, h = tr.ray_cast(o, d, dist)
                    if loc is not None:
                        hit += (1.0 - h / dist) ** 0.7
                        break
            occ[i] = 1.0 - ao * hit / len(S)
    col = me.color_attributes['Col']
    buf = np.zeros(len(me.loops) * 4, np.float32)
    col.data.foreach_get('color', buf)
    buf = buf.reshape(-1, 4)
    vidx = np.zeros(len(me.loops), np.int64)
    me.loops.foreach_get('vertex_index', vidx)
    k = occ[vidx]
    if grad:
        z0, z1, k0, k1 = grad[:4]
        cool = grad[4] if len(grad) > 4 else 0.0
        zz = np.array([verts[i].z for i in range(nv)])[vidx]
        t = np.clip((zz - z0) / max(1e-6, z1 - z0), 0, 1)
        t = t * t * (3 - 2 * t)
        gk = k0 + (k1 - k0) * t
        k = k * gk
        if cool:
            # cooler (lavender) toward the base
            c = (1 - t) * cool
            buf[:, 0] *= (1 - 0.05 * c); buf[:, 2] *= (1 + 0.08 * c)
    buf[:, :3] *= k[:, None]
    col.data.foreach_set('color', np.clip(buf, 0, 1).ravel())


def bvh_of(objs):
    verts, polys = [], []
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in objs:
        if ob.type != 'MESH':
            continue
        mw = ob.matrix_world
        b = len(verts)
        verts += [mw @ v.co for v in ob.data.vertices]
        polys += [tuple(b + i for i in p.vertices) for p in ob.data.polygons]
    return BVHTree.FromPolygons(verts, polys, epsilon=0.0)


def empty(name, collection, loc=(0, 0, 0), parent=None, size=0.3):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    collection.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
    return e


# ------------------------------------------------------------------ node helpers
def N(nt, kind, **props):
    n = nt.nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def Lk(nt, a, b):
    nt.links.new(a, b)


def out(node, name):
    for s in node.outputs:
        if (s.identifier == name or s.name == name) and s.enabled:
            return s
    raise KeyError(name)


def inp(node, name):
    for s in node.inputs:
        if (s.identifier == name or s.name == name) and s.enabled:
            return s
    raise KeyError(name)


def setin(nt, node, name, x):
    s = inp(node, name)
    if isinstance(x, (int, float, tuple, list)):
        s.default_value = x
    else:
        Lk(nt, x, s)


def fm(nt, op, a, b=None, c=None, clamp=False):
    n = N(nt, 'ShaderNodeMath', operation=op, use_clamp=clamp)
    for i, x in enumerate((a, b, c)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            Lk(nt, x, n.inputs[i])
    return n.outputs[0]


def vm(nt, op, a, b=None, scale=None):
    n = N(nt, 'ShaderNodeVectorMath', operation=op)
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (tuple, list)):
            n.inputs[i].default_value = x
        else:
            Lk(nt, x, n.inputs[i])
    if scale is not None:
        if isinstance(scale, (int, float)):
            inp(n, 'Scale').default_value = scale
        else:
            Lk(nt, scale, inp(n, 'Scale'))
    return n.outputs['Value'] if op in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else n.outputs['Vector']


def mr(nt, x, a, b, c=0.0, d=1.0, smooth=True, clamp=True):
    n = N(nt, 'ShaderNodeMapRange', interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR', clamp=clamp)
    Lk(nt, x, n.inputs['Value'])
    for nm, v in (('From Min', a), ('From Max', b), ('To Min', c), ('To Max', d)):
        if isinstance(v, (int, float)):
            n.inputs[nm].default_value = v
        else:
            Lk(nt, v, n.inputs[nm])
    return n.outputs['Result']


def mixc_n(nt, fac, a, b, blend='MIX'):
    n = N(nt, 'ShaderNodeMix', data_type='RGBA', blend_type=blend, clamp_factor=True)
    for s, x in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
        if isinstance(x, (int, float)):
            s.default_value = x
        elif isinstance(x, (tuple, list)):
            s.default_value = (*x[:3], 1) if len(x) == 3 else x
        else:
            Lk(nt, x, s)
    return n.outputs[2]


def mixv(nt, fac, a, b):
    n = N(nt, 'ShaderNodeMix', data_type='VECTOR', clamp_factor=True)
    for s, x in ((n.inputs[0], fac), (n.inputs[4], a), (n.inputs[5], b)):
        if isinstance(x, (int, float, tuple, list)):
            s.default_value = x
        else:
            Lk(nt, x, s)
    return n.outputs[1]


def rgbn(nt, c, name=None):
    n = N(nt, 'ShaderNodeRGB')
    n.outputs[0].default_value = (*c[:3], 1)
    if name:
        n.name = name; n.label = name
    return n.outputs[0]


def valn(nt, x, name=None):
    n = N(nt, 'ShaderNodeValue')
    n.outputs[0].default_value = x
    if name:
        n.name = name; n.label = name
    return n.outputs[0]


def comb(nt, x, y, z):
    n = N(nt, 'ShaderNodeCombineXYZ')
    for i, v in enumerate((x, y, z)):
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            Lk(nt, v, n.inputs[i])
    return n.outputs[0]


def sep(nt, v):
    n = N(nt, 'ShaderNodeSeparateXYZ'); Lk(nt, v, n.inputs[0])
    return n.outputs['X'], n.outputs['Y'], n.outputs['Z']


def sepc(nt, c):
    n = N(nt, 'ShaderNodeSeparateColor'); Lk(nt, c, n.inputs[0])
    return n.outputs[0], n.outputs[1], n.outputs[2]


def noise_t(nt, vec, scale, detail=2.0, rough=0.5, dim='3D', w=None, distort=0.0):
    n = N(nt, 'ShaderNodeTexNoise', noise_dimensions=dim)
    if vec is not None:
        Lk(nt, vec, n.inputs['Vector'])
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    n.inputs['Distortion'].default_value = distort
    return n


def voro(nt, vec, scale, feature='F1', dim='3D', rand=1.0):
    n = N(nt, 'ShaderNodeTexVoronoi', feature=feature, voronoi_dimensions=dim)
    Lk(nt, vec, n.inputs['Vector'])
    n.inputs['Scale'].default_value = scale
    n.inputs['Randomness'].default_value = rand
    return n


def set_ramp(ramp, stops, interp='LINEAR'):
    cr = ramp.color_ramp
    cr.interpolation = interp
    while len(cr.elements) > 1:
        cr.elements.remove(cr.elements[-1])
    cr.elements[0].position = stops[0][0]
    cr.elements[0].color = (*stops[0][1][:3], 1)
    for p, c in stops[1:]:
        e = cr.elements.new(p); e.color = (*c[:3], 1)


def new_mat(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    return m, nt, nt.nodes['Material Output']
