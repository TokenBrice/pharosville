"""Life beasts kit (09-L3 goats, 09-L7 cats, 08-T5/09-L9 the donkey and its hay cart) - headless Blender build + export.

    blender -b --factory-startup -P scripts/harbour/blender/life/beasts.py [-- --no-compress]
    npm run harbour:compress        # then: .glb -> .glb.gz

Runtime -> public/harbour/kit/life_beasts.glb (EXT_meshopt_compression), read by src/harbour/life/herds.ts.

Declared decorative. Tiny flat-shaded animals in the island's low-poly language. One root per beast ('goat', 'cat',
'donkey' - the donkey carries its hay cart), all at the origin, one child object per posable PART, named
'<beast>.<part>', with the object's ORIGIN AT THE PART'S PIVOT (hip, neck, tail root, axle), also written to the node's
extras as 'pivot' (glTF coords: meshopt quantization folds a dequantization offset into the node transform); the
runtime poses each part about it in the vertex shader. Facing: -Y in Blender (= +Z in glTF, the runtime's forward).
Colour: corner colour 'Col'; ALPHA 1 = coat (the runtime tints it per animal), 0 = fixed (horns, hooves, wood, hay).
The cart carries hay only: never crates or amphorae (cargo would read as the Mint / the Burn).
Budgets (tris): goat <= 130, cat <= 70, donkey + cart <= 220.
"""
import os, sys, math, subprocess
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'outputs', 'harbour', 'life')
DST = os.path.join(ROOT, 'public', 'harbour', 'kit', 'life_beasts.glb')
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
COMPRESS = '--no-compress' not in ARGV
BUDGET = {'goat': 130, 'cat': 70, 'donkey': 220}
os.makedirs(RAW, exist_ok=True)


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


class Part:
    """Faces in Blender coordinates (relative to the beast's origin) with a colour + coat flag per face."""

    def __init__(self):
        self.v, self.f = [], []

    def face(self, pts, col, coat):
        i0 = len(self.v)
        self.v += [Vector(p) for p in pts]
        self.f.append((list(range(i0, i0 + len(pts))), srgb(col), 1.0 if coat else 0.0))

    def box(self, c, s, col, coat=True, taper=(1.0, 1.0), caps=True):
        """Box centred c, size s; `taper` scales the -y (front) and +y (back) end faces in x/z."""
        (cx, cy, cz), (sx, sy, sz) = c, s
        def corner(ix, iy, iz):
            t = taper[0] if iy < 0 else taper[1]
            return (cx + ix * sx / 2 * t, cy + iy * sy / 2, cz + iz * sz / 2 * t)
        P = {(i, j, k): corner(i, j, k) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)}
        quads = [((-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)), ((1, 1, -1), (-1, 1, -1), (-1, 1, 1), (1, 1, 1)),
                 ((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)), ((-1, 1, -1), (-1, -1, -1), (-1, -1, 1), (-1, 1, 1))]
        if caps:
            quads += [((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)), ((-1, 1, -1), (1, 1, -1), (1, -1, -1), (-1, -1, -1))]
        for q in quads:
            self.face([P[k] for k in q], col, coat)

    def tri(self, a, b, c, col, coat=False, both=True):
        self.face([a, b, c], col, coat)
        if both:
            self.face([a, c, b], col, coat)

    def ring(self, c, r, w, n, col, coat=False):
        """A wheel: an n-gon prism round the x axis, centre c, radius r, width w."""
        cx, cy, cz = c
        ang = [2 * math.pi * k / n for k in range(n)]
        L = [(cx - w / 2, cy + math.cos(a) * r, cz + math.sin(a) * r) for a in ang]
        R = [(cx + w / 2, cy + math.cos(a) * r, cz + math.sin(a) * r) for a in ang]
        for k in range(n):
            j = (k + 1) % n
            self.face([L[k], L[j], R[j], R[k]], col, coat)
        self.face(R, col, coat)
        self.face(L[::-1], col, coat)


def to_object(name, part, pivot, parent):
    me = bpy.data.meshes.new(name)
    pv = Vector(pivot)
    me.from_pydata([tuple(v - pv) for v in part.v], [], [f[0] for f in part.f])
    me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    buf = [0.0] * (len(me.loops) * 4)
    for poly, f in zip(me.polygons, part.f):
        for li in poly.loop_indices:
            buf[li * 4:li * 4 + 4] = (*f[1], f[2])
    col.data.foreach_set('color', buf)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = pv
    ob['pivot'] = [round(pv.x, 4), round(pv.z, 4), round(-pv.y, 4)]     # glTF coords; survives meshopt quantization
    return ob


def beast(name, parts):
    """parts: [(part name, Part, pivot)] -> root empty + children."""
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    tris = 0
    for (pn, part, pivot) in parts:
        to_object(f'{name}.{pn}', part, pivot, root)
        tris += sum(len(f[0]) - 2 for f in part.f)
    return root, tris


# NB: tri() writes both windings (thin fins, ears): the runtime material is front-sided.
COAT = '#FFFFFF'
HORN, HOOF, NOSE = '#5A4E40', '#3A332C', '#3E3530'


def goat():
    body = Part(); body.box((0, 0, 0.56), (0.3, 0.74, 0.32), COAT, taper=(0.92, 0.86))
    body.tri((0, 0.37, 0.66), (0, 0.42, 0.78), (0, 0.33, 0.7), COAT, coat=True)              # a little upright tail
    head = Part()
    head.box((0, -0.43, 0.74), (0.13, 0.18, 0.22), COAT, taper=(0.8, 1.0))                      # neck
    head.box((0, -0.56, 0.86), (0.15, 0.26, 0.15), COAT, taper=(0.62, 1.0))                     # head, the snout tapering
    for s in (-1, 1):
        head.tri((s * 0.04, -0.5, 0.93), (s * 0.06, -0.44, 0.95), (s * 0.1, -0.36, 1.08), HORN)    # swept-back horns
        head.tri((s * 0.07, -0.49, 0.9), (s * 0.07, -0.45, 0.92), (s * 0.19, -0.47, 0.86), COAT, coat=True)   # ears
    head.tri((-0.02, -0.64, 0.79), (0.02, -0.64, 0.79), (0, -0.62, 0.69), COAT, coat=True)    # beard
    parts = [('body', body, (0, 0, 0)), ('head', head, (0, -0.33, 0.66))]
    for (pn, x, y) in (('leg_fl', -0.09, -0.27), ('leg_fr', 0.09, -0.27), ('leg_hl', -0.09, 0.27), ('leg_hr', 0.09, 0.27)):
        leg = Part(); leg.box((x, y, 0.23), (0.07, 0.07, 0.42), COAT, caps=False)
        leg.box((x, y, 0.025), (0.075, 0.08, 0.05), HOOF, coat=False, caps=False)
        parts.append((pn, leg, (x, y, 0.44)))
    return beast('goat', parts)


def cat():
    body = Part()
    body.box((0, 0.02, 0.13), (0.17, 0.3, 0.2), COAT, taper=(0.95, 0.85))                      # a loaf on the coping
    body.box((0, -0.11, 0.21), (0.15, 0.12, 0.16), COAT, taper=(0.9, 1.0))                       # chest, sitting up
    head = Part()
    head.box((0, -0.17, 0.33), (0.13, 0.11, 0.11), COAT, taper=(0.8, 1.0))
    for s in (-1, 1):
        head.tri((s * 0.02, -0.17, 0.38), (s * 0.06, -0.15, 0.38), (s * 0.045, -0.17, 0.45), COAT, coat=True)
    tail = Part()
    tail.box((0, 0.2, 0.26), (0.04, 0.04, 0.3), COAT, caps=False)                                # the tail, up behind
    tail.box((0, 0.17, 0.43), (0.04, 0.09, 0.04), COAT)                                          # …its tip hooked forward
    return beast('cat', [('body', body, (0, 0, 0)), ('head', head, (0, -0.13, 0.27)), ('tail', tail, (0, 0.18, 0.12))])


def donkey():
    body = Part(); body.box((0, 0, 0.86), (0.38, 1.02, 0.42), COAT, taper=(0.92, 0.88))
    body.tri((0, 0.5, 0.95), (0.03, 0.53, 0.62), (-0.03, 0.53, 0.62), COAT, coat=True)        # tail
    head = Part()
    head.box((0, -0.6, 1.08), (0.16, 0.26, 0.3), COAT, taper=(0.85, 1.0))                       # neck
    head.box((0, -0.78, 1.2), (0.17, 0.4, 0.19), COAT, taper=(0.7, 1.0))
    head.box((0, -0.97, 1.17), (0.12, 0.05, 0.12), NOSE, coat=False, caps=False)                # the pale-dark muzzle
    for s in (-1, 1):
        head.tri((s * 0.05, -0.66, 1.28), (s * 0.06, -0.6, 1.28), (s * 0.12, -0.6, 1.58), COAT, coat=True)   # long ears
    parts = [('body', body, (0, 0, 0)), ('head', head, (0, -0.46, 0.98))]
    for (pn, x, y) in (('leg_fl', -0.12, -0.38), ('leg_fr', 0.12, -0.38), ('leg_hl', -0.12, 0.38), ('leg_hr', 0.12, 0.38)):
        leg = Part(); leg.box((x, y, 0.33), (0.09, 0.09, 0.64), COAT, caps=False)
        leg.box((x, y, 0.03), (0.095, 0.1, 0.06), HOOF, coat=False, caps=False)
        parts.append((pn, leg, (x, y, 0.66)))
    # the cart behind: two shafts to the harness, a plank bed, hay heaped on it, two spoked-looking wheels
    WOOD, WOOD_D, HAY = '#7A5A3A', '#5A4330', '#D6BC6A'
    cart = Part()
    for s in (-1, 1):
        cart.box((s * 0.3, 0.62, 0.86), (0.05, 1.3, 0.05), WOOD_D, coat=False, caps=False)
    cart.box((0, 1.75, 0.78), (1.0, 1.25, 0.12), WOOD, coat=False)
    for s in (-1, 1):
        cart.box((s * 0.5, 1.75, 0.94), (0.05, 1.25, 0.22), WOOD, coat=False, caps=False)
    cart.box((0, 1.78, 1.12), (0.9, 1.1, 0.42), HAY, coat=False, taper=(0.8, 0.85))
    wheels = Part()
    for s in (-1, 1):
        wheels.ring((s * 0.6, 1.75, 0.46), 0.46, 0.07, 7, WOOD_D)
    parts += [('cart', cart, (0, 0, 0)), ('wheels', wheels, (0, 1.75, 0.46))]
    return beast('donkey', parts)


bpy.ops.wm.read_factory_settings(use_empty=True)
report = {}
roots = []
for fn in (goat, cat, donkey):
    root, tris = fn()
    report[root.name] = tris
    roots.append(root)
    assert tris <= BUDGET[root.name], (root.name, tris)
print('BEASTS tris', report)

bpy.ops.object.select_all(action='SELECT')
raw = os.path.join(RAW, 'life_beasts.raw.glb')
bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', use_selection=True, export_apply=False,
                          export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
                          export_attributes=True, export_extras=True, export_yup=True, export_morph=False,
                          export_materials='NONE', export_normals=True, export_image_format='NONE', export_animations=False)
if COMPRESS:
    r = subprocess.run(['npx', '-y', '@gltf-transform/cli@4.1.1', 'meshopt', raw, DST, '--level', 'medium'], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        print('COMPRESS FAIL', r.stderr[-800:])
        raise SystemExit(1)
else:
    import shutil
    shutil.copy(raw, DST)
print('BEASTS ->', DST, os.path.getsize(DST), 'bytes')
