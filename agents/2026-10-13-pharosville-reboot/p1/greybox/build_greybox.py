"""PharosVille P1 true-scale grey-box: Blender builder + renderer.

blender -b --factory-startup --python build_greybox.py -- [--shots overview,harbour-eth,harbour-small,close]
        [--proj persp,ortho] [--notan] [--lanes] [--samples 24] [--tag ""]

Imports layout_core (pure Python) for the layout, exports layout.json (the runtime contract), builds the
grey-box at true scale (1 unit = 1 m, Blender Z-up; glTF (x, y, z) = Blender (x, -z, y)), renders the
camera presets and writes metrics.json (projected px per hull class, land fill, notan).
"""
import bpy, bmesh, math, os, sys, json, random
from mathutils import Vector, Matrix, Quaternion
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import layout_core as LC

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
SHOTS = arg('--shots', 'overview,harbour-eth,harbour-small,close').split(',')
PROJ = arg('--proj', 'persp,ortho').split(',')
SAMPLES = int(arg('--samples', '24'))
TAG = arg('--tag', '')
NOTAN = '--notan' in argv
LANES = '--lanes' in argv
RES = (1600, 1000)

layout, scene_data, issues = LC.export()
assert not issues, issues[:10]

def B(p, y=0.0):            # glTF-plane (x, z) + height -> Blender Vector
    return Vector((p[0], -p[1], y))

# ------------------------------------------------------------------ reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COLL = scene.collection

# ------------------------------------------------------------------ materials
HAZE = (0.80, 0.83, 0.86)
HAZE_NEAR, HAZE_FAR = float(arg('--haze-near', '400')), float(arg('--haze-far', '600'))
def lin(c): return tuple(x ** 2.2 for x in c)
PAL = dict(
    water=(0.13, 0.33, 0.38), water_deep=(0.08, 0.22, 0.28), land=(0.74, 0.70, 0.60), land_hi=(0.66, 0.66, 0.52),
    cliff=(0.55, 0.50, 0.44), beach=(0.84, 0.78, 0.62), stone=(0.66, 0.64, 0.60), quay=(0.70, 0.67, 0.61),
    timber=(0.46, 0.34, 0.23), wall=(0.88, 0.84, 0.76), roof=(0.66, 0.40, 0.31), roof2=(0.42, 0.44, 0.50),
    tree=(0.34, 0.44, 0.30), mast=(0.25, 0.20, 0.16), deck=(0.72, 0.62, 0.48), sail=(0.96, 0.95, 0.90),
    cover=(0.82, 0.76, 0.62), hulk=(0.28, 0.27, 0.26), tower=(0.82, 0.81, 0.78), lamp=(1.0, 0.78, 0.40),
    reef=(0.42, 0.40, 0.36), lane=(1.0, 0.25, 0.75), meadow=(0.58, 0.62, 0.44),
    flagship=(0.96, 0.70, 0.12), large=(0.86, 0.24, 0.17), medium=(0.20, 0.42, 0.86),
    small=(0.24, 0.66, 0.36), boat=(0.60, 0.34, 0.76), skiff=(0.95, 0.95, 0.93),
)
MATS = {}

def haze_mix(nt, color_socket):
    """Distance haze toward HAZE (view distance), so the far sea becomes a sky band."""
    # world-radial haze: the sea fades to the sky colour beyond the island ring ("edge of the world");
    # camera-independent, so it works identically in perspective and ortho and ports to a WebGL fog.
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Position'], sep.inputs[0])
    cmb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(sep.outputs[0], cmb.inputs[0]); nt.links.new(sep.outputs[1], cmb.inputs[1])
    ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; nt.links.new(cmb.outputs[0], ln.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs[1].default_value = HAZE_NEAR; mr.inputs[2].default_value = HAZE_FAR
    mr.interpolation_type = 'SMOOTHSTEP'
    nt.links.new(ln.outputs['Value'], mr.inputs[0])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    nt.links.new(mr.outputs[0], mx.inputs['Factor'])
    nt.links.new(color_socket, mx.inputs['A'])
    mx.inputs['B'].default_value = (*lin(HAZE), 1)
    return mx.outputs['Result'], mr.outputs[0]

def mat(name, rgb, emit=0.0, rough=0.8, notan=None):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    if NOTAN:
        em = nt.nodes.new('ShaderNodeEmission')
        v = 1.0 if notan is None else notan
        rgbn = nt.nodes.new('ShaderNodeRGB'); rgbn.outputs[0].default_value = (v, v, v, 1)
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
        _, fac = haze_mix(nt, rgbn.outputs[0])
        nt.links.new(fac, mx.inputs['Factor']); nt.links.new(rgbn.outputs[0], mx.inputs['A'])
        mx.inputs['B'].default_value = (0.5, 0.5, 0.5, 1)
        nt.links.new(mx.outputs['Result'], em.inputs['Color'])
        nt.links.new(em.outputs[0], out.inputs[0])
    else:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        rgbn = nt.nodes.new('ShaderNodeRGB'); rgbn.outputs[0].default_value = (*lin(rgb), 1)
        col, fac = haze_mix(nt, rgbn.outputs[0])
        nt.links.new(col, bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = rough
        if emit:
            bsdf.inputs['Emission Color'].default_value = (*lin(rgb), 1)
            bsdf.inputs['Emission Strength'].default_value = emit
        # fade toward pure haze emission at range so the far sea reads as sky
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*lin(HAZE), 1)
        mixs = nt.nodes.new('ShaderNodeMixShader')
        fac2 = nt.nodes.new('ShaderNodeMath'); fac2.operation = 'POWER'; fac2.inputs[1].default_value = 1.5
        nt.links.new(fac, fac2.inputs[0])
        nt.links.new(fac2.outputs[0], mixs.inputs[0])
        nt.links.new(bsdf.outputs[0], mixs.inputs[1]); nt.links.new(em.outputs[0], mixs.inputs[2])
        nt.links.new(mixs.outputs[0], out.inputs[0])
    MATS[name] = m
    return m

def obj_from_bm(name, bm, material, parent=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); COLL.objects.link(ob)
    if isinstance(material, list):
        for m in material: me.materials.append(m)
    else:
        me.materials.append(material)
    return ob

# ------------------------------------------------------------------ bmesh helpers (build into a shared bm)
def box(bm, c, size, rot=0.0, mi=0):
    m = Matrix.Translation(c) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((*size, 1))
    r = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = mi
    return r

def cyl(bm, p0, p1, r0, r1=None, segs=8, mi=0, cap=True):
    r1 = r0 if r1 is None else r1
    d = p1 - p0; L = d.length
    q = d.to_track_quat('Z', 'Y')
    m = Matrix.Translation(p0) @ q.to_matrix().to_4x4()
    r = bmesh.ops.create_cone(bm, cap_ends=cap, segments=segs, radius1=r0, radius2=r1, depth=L,
                              matrix=m @ Matrix.Translation((0, 0, L / 2)))
    for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = mi
    return r

def prism(bm, pts2d, z0, z1, mi=0, top_mi=None):
    """Vertical extrusion of a 2D polygon (Blender xy) from z0 to z1."""
    bot = [bm.verts.new((x, y, z0)) for x, y in pts2d]
    top = [bm.verts.new((x, y, z1)) for x, y in pts2d]
    n = len(pts2d); fs = []
    for i in range(n):
        f = bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i])); f.material_index = mi; fs.append(f)
    ft = bm.faces.new(top); ft.material_index = mi if top_mi is None else top_mi
    fb = bm.faces.new(list(reversed(bot))); fb.material_index = mi
    bmesh.ops.recalc_face_normals(bm, faces=fs + [ft, fb])
    return top

def tri(bm, a, b, c, mi=0):
    f = bm.faces.new((bm.verts.new(a), bm.verts.new(b), bm.verts.new(c))); f.material_index = mi
    return f

# ------------------------------------------------------------------ sea + world
world = bpy.data.worlds.new('W'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (*lin(HAZE), 1) if not NOTAN else (0.5, 0.5, 0.5, 1)
bg.inputs[1].default_value = 1.0 if not NOTAN else 1.0

bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6000)
sea = obj_from_bm('sea', bm, mat('sea', PAL['water'], rough=0.35, notan=0.0))

# ------------------------------------------------------------------ terrain heightfield
def ZONE(x, z, h):
    d_bay = LC.poly_dist((x, z), LC.BAY)
    u, v = LC.UV(x, z)
    if math.exp(-(((u + 262) / 46) ** 2 + ((v + 214) / 40) ** 2)) > 0.35: return 5      # Wreck Cove beach
    if d_bay < 16: return 3                                                             # quay apron
    if TOWN_R(u, v, d_bay): return 0                                                    # town ground
    return 4                                                                            # meadow / scrub

def TOWN_R(u, v, d_bay):
    """Hill town: a wedge climbing behind the town square (bottom centre), waterfront rows along the
    V quays that thin out toward the arms; the arms stay green headlands."""
    core = math.exp(-((u / 140) ** 2)) * LC.smooth(30, 120, v)
    front = LC.smooth(-150, 40, v) * 40.0                          # waterfront depth, fading up the arms
    return d_bay < front + 150 * core

def build_terrain():
    xs = [p[0] for p in LC.ISLAND]; zs = [p[1] for p in LC.ISLAND]
    x0, x1, z0, z1 = min(xs) - 12, max(xs) + 12, min(zs) - 12, max(zs) + 12
    step = 3.0
    nx, nz = int((x1 - x0) / step) + 1, int((z1 - z0) / step) + 1
    H = {}
    for i in range(nx):
        for j in range(nz):
            x, z = x0 + i * step, z0 + j * step
            land = LC.inside((x, z), LC.ISLAND) and not LC.inside((x, z), LC.BAY)
            if land:
                u, v = LC.UV(x, z)
                H[(i, j)] = LC.terrain_h(u, v)
            else:
                H[(i, j)] = None
    bm = bmesh.new(); V = {}
    def vert(i, j):
        if (i, j) not in V:
            h = H[(i, j)]
            if h is None:
                # coast skirt: drop below the sea next to land
                h = -4.0
            V[(i, j)] = bm.verts.new((x0 + i * step, -(z0 + j * step), h))
        return V[(i, j)]
    for i in range(nx - 1):
        for j in range(nz - 1):
            q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            if all(H[k] is None for k in q): continue
            f = bm.faces.new([vert(*k) for k in reversed(q)])
            hs = [H[k] for k in q if H[k] is not None]
            if len(hs) < 4 or max(hs) - min(hs) > 2.6:
                f.material_index = 2                                   # cliff / coast edge
            else:
                x, z = x0 + (i + 0.5) * step, z0 + (j + 0.5) * step
                f.material_index = ZONE(x, z, sum(hs) / 4)
    
    bm.normal_update()
    return obj_from_bm('terrain', bm, [mat('land', PAL['land'], notan=1.0), mat('land_hi', PAL['land_hi'], notan=1.0),
                                        mat('cliff', PAL['cliff'], notan=1.0), mat('apron', PAL['quay'], notan=1.0),
                                        mat('meadow', PAL['meadow'], notan=1.0), mat('beach', PAL['beach'], notan=1.0)])
build_terrain()

# quay walls along the V and the town square apron
bm = bmesh.new()
for a, b in ((LC.VERT, LC.Q_RIGHT_END), (LC.VERT, LC.Q_LEFT_END)):
    d = LC.nrm(LC.sub(b, a)); L = math.hypot(*LC.sub(b, a))
    n = LC.perp(d)
    if LC.inside(LC.add(LC.mul(LC.add(a, b), 0.5), n, 8), LC.BAY): n = LC.mul(n, -1)     # n points to land
    poly = [LC.add(a, n, -0.5), LC.add(b, n, -0.5), LC.add(b, n, 9), LC.add(a, n, 9)]
    prism(bm, [(p[0], -p[1]) for p in poly], -3, 2.3, mi=0)
obj_from_bm('quaywalls', bm, mat('quay', PAL['quay'], notan=1.0))

# ------------------------------------------------------------------ pier structures
bm = bmesh.new()
STONE = {'grand', 'quay', 'breakwater', 'mole', 'thead'}
for s in scene_data['structures']:
    poly = [(p[0], -p[1]) for p in s['poly']]
    stone = s['kind'] in STONE
    top = 2.4 if s['kind'] in ('breakwater', 'mole') else (1.6 if s['kind'] == 'grand' else s['y'])
    prism(bm, poly, -2.0 if stone else top - 0.35, top, mi=0 if stone else 1)
    if not stone and s['kind'] != 'finger':
        # piles every ~6 m along the long edges
        p0, p1, p2, p3 = s['poly']
        L = math.hypot(*LC.sub(p1, p0)); n = max(2, int(L / 6))
        for e0, e1 in ((p0, p1), (p3, p2)):
            for k in range(n + 1):
                q = LC.add(e0, LC.sub(e1, e0), k / n)
                cyl(bm, Vector((q[0], -q[1], -1.5)), Vector((q[0], -q[1], top + 0.5)), 0.22, segs=6, mi=1)
obj_from_bm('piers', bm, [mat('stone', PAL['stone'], notan=1.0), mat('timber', PAL['timber'], notan=1.0)])

# ------------------------------------------------------------------ boats
HULL_FB = {k: 0.085 * L + 0.45 for k, L in LC.LOA.items()}
MASTS = dict(flagship=3, large=2, medium=1, small=1, boat=1, skiff=1)
CLS_MATS = [mat('h_' + k, PAL[k], notan=1.0) for k in LC.CLASSES]
PARTS = [mat('deck', PAL['deck'], notan=1.0), mat('mast', PAL['mast'], notan=1.0), mat('sail', PAL['sail'], notan=1.0),
         mat('cover', PAL['cover'], notan=1.0), mat('hulk', PAL['hulk'], notan=1.0)]
MI = {k: i for i, k in enumerate(LC.CLASSES)}
MI.update(deck=6, mast=7, sail=8, cover=9, hulk=10)

def hull_outline(L, Bm):
    return [(-Bm / 2, -L / 2), (Bm / 2, -L / 2), (Bm / 2, 0.12 * L), (Bm * 0.32, 0.36 * L), (0, L / 2),
            (-Bm * 0.32, 0.36 * L), (-Bm / 2, 0.12 * L)]

_TMP_ME = bpy.data.meshes.new('_tmp_boat')
def add_boat(bm_out, k, pos, heading, state, heel=0.0, hulk=False):
    """pos glTF (x, z); heading h -> bow along (sin h, cos h) in (x, z). Local frame: bow +Y.
    Each boat is built in its own bmesh, transformed whole, then appended (robust vertex bookkeeping)."""
    L, Bm = LC.LOA[k], LC.BEAM[k]
    fb = HULL_FB[k]
    ang = math.atan2(-math.cos(heading), math.sin(heading)) - math.pi / 2
    M = Matrix.Translation(B(pos)) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(heel, 4, 'Y')
    if hulk:
        M = M @ Matrix.Translation((0, 0, 0.2)) @ Matrix.Rotation(0.35, 4, 'Y')
    bm = bmesh.new()
    pts = hull_outline(L, Bm)
    bot = [bm.verts.new((x * 0.7, y * 0.9, -0.5)) for x, y in pts]
    top = [bm.verts.new((x, y, fb)) for x, y in pts]
    n = len(pts)
    mi = MI['hulk'] if hulk else MI[k]
    for i in range(n):
        bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i])).material_index = mi
    bm.faces.new(top).material_index = mi
    bm.faces.new(list(reversed(bot))).material_index = mi
    if not hulk:
        if k in ('flagship', 'large', 'medium'):
            box(bm, Vector((0, -0.18 * L, fb + 0.9)), (Bm * 0.55, L * 0.22, 1.8), mi=MI['deck'])
        mh = LC.MAST[k]; nm = MASTS[k]
        for m in range(nm):
            y = (0.18 - 0.36 * m / max(1, nm - 1)) * L if nm > 1 else 0.12 * L
            h = mh * (1.0 if m == 0 or nm == 1 else (0.92 if m == 1 else 0.82))
            cyl(bm, Vector((0, y, fb)), Vector((0, y, fb + h)), 0.06 + 0.012 * L, 0.04 + 0.006 * L, segs=6, mi=MI['mast'])
            foot = L * (0.5 if nm == 1 else 0.36)
            if state == 'sailing':
                ys = y - foot
                tri(bm, (0, y, fb + 1.6), (0, y, fb + h * 0.95), (0.25 * foot, ys, fb + 1.8), mi=MI['sail'])
                if m == 0:
                    tri(bm, (0, y, fb + h * 0.85), (0, 0.5 * L, fb + 0.6), (0.15 * foot, y - 0.1 * L, fb + 1.2), mi=MI['sail'])
            else:
                cyl(bm, Vector((0, y, fb + 2.0)), Vector((0.001, y - foot, fb + 1.8)), 0.22 + 0.012 * L, segs=6, mi=MI['cover'])
    bmesh.ops.transform(bm, matrix=M, verts=list(bm.verts))
    bm.to_mesh(_TMP_ME); bm.free()
    bm_out.from_mesh(_TMP_ME)

boat_bm = bmesh.new()
for b in scene_data['boats']:
    st = b['state']
    add_boat(boat_bm, b['cls'], (b['position'][0], b['position'][2]), b['heading'],
             'sailing' if st in ('sailing',) else 'docked', heel=(0.28 if st == 'shoals' else (0.12 if st == 'sailing' else 0.0)))
for w in scene_data['wrecks']:
    add_boat(boat_bm, w['cls'], (w['position'][0], w['position'][2]), w['heading'], 'docked', hulk=True)
obj_from_bm('boats', boat_bm, CLS_MATS + PARTS)

# ------------------------------------------------------------------ reef (Shoals)
bm = bmesh.new(); rnd = random.Random(11)
sh = layout['zones']['shoals']
for i in range(26):
    p = sh['polygon'][i % len(sh['polygon'])]
    c = LC.mul(LC.add(tuple(p), tuple(LC.centroid([tuple(q) for q in sh['polygon']]))), 0.5)
    c = LC.add(c, (rnd.uniform(-18, 18), rnd.uniform(-18, 18)))
    r = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=rnd.uniform(2.0, 5.0),
                                   matrix=Matrix.Translation(B(c, -0.6)) @ Matrix.Diagonal((1.6, 1.2, 0.45, 1)))
obj_from_bm('reef', bm, mat('reef', PAL['reef'], notan=1.0))

# ------------------------------------------------------------------ town + landmarks
rnd = random.Random(5)
LMPOS = {l['id']: l for l in layout['landmarks']}
avoid = [(tuple((l['position'][0], l['position'][2])), l['footprint'] * 0.8 + 6) for l in layout['landmarks']]
def town_ok(x, z):
    if not LC.inside((x, z), LC.ISLAND) or LC.inside((x, z), LC.BAY): return False
    for c, r in avoid:
        if math.hypot(x - c[0], z - c[1]) < r: return False
    return True

house_bm = bmesh.new(); tree_bm = bmesh.new()
wc = layout['zones']['wreckCove']['polygon']
def house(x, z, w, d, eave, roof, rot, mi_wall=0, mi_roof=1):
    u, v = LC.UV(x, z); g = LC.terrain_h(u, v)
    base = g - 1.2
    r = box(house_bm, Vector((x, -z, base + eave / 2)), (w, d, eave), rot=rot, mi=mi_wall)
    # gable roof: ridge along w
    c, s = math.cos(rot), math.sin(rot)
    def P(lx, ly, lz): return (x + lx * c - ly * s, -z + lx * s + ly * c, lz)
    zt = base + eave
    a, b_, cc, dd = P(-w / 2 - 0.4, -d / 2 - 0.4, zt), P(w / 2 + 0.4, -d / 2 - 0.4, zt), P(w / 2 + 0.4, d / 2 + 0.4, zt), P(-w / 2 - 0.4, d / 2 + 0.4, zt)
    r1, r2 = P(-w / 2 - 0.4, 0, zt + roof), P(w / 2 + 0.4, 0, zt + roof)
    vs = [house_bm.verts.new(p) for p in (a, b_, cc, dd, r1, r2)]
    for f in ((vs[0], vs[1], vs[5], vs[4]), (vs[2], vs[3], vs[4], vs[5]), (vs[0], vs[4], vs[3]), (vs[1], vs[2], vs[5])):
        house_bm.faces.new(f).material_index = mi_roof

STEP_X, STEP_Z = 13.0, 11.0
xs = [p[0] for p in LC.ISLAND]; zs = [p[1] for p in LC.ISLAND]
n_house = 0; n_tree = 0
for i in range(int((max(xs) - min(xs)) / STEP_X) + 1):
    for j in range(int((max(zs) - min(zs)) / STEP_Z) + 1):
        if i % 5 == 4 or j % 4 == 3: continue                 # streets on the world grid
        x = min(xs) + i * STEP_X + rnd.uniform(-1.5, 1.5); z = min(zs) + j * STEP_Z + rnd.uniform(-1.5, 1.5)
        if not town_ok(x, z): continue
        u, v = LC.UV(x, z)
        dbay = LC.poly_dist((x, z), LC.BAY); dsea = LC.poly_dist((x, z), LC.ISLAND)
        if dbay < 14 or dsea < 10: continue
        hp = math.exp(-(((u + 150) / 60) ** 2 + ((v + 236) / 44) ** 2))
        if hp > 0.3: continue
        town = TOWN_R(u, v, dbay) and rnd.random() < 0.94
        if town:
            w, d = rnd.uniform(9, 12), rnd.uniform(7, 9.5)
            house(x, z, w, d, rnd.uniform(4.8, 7.0), rnd.uniform(2.6, 3.8), rnd.choice((0, math.pi / 2)),
                  mi_roof=1 if rnd.random() < 0.8 else 2)
            n_house += 1
        elif rnd.random() < 0.8:
            g = LC.terrain_h(u, v)
            for t in range(rnd.randint(1, 4)):
                tx, tz = x + rnd.uniform(-5, 5), z + rnd.uniform(-5, 5)
                rr = rnd.uniform(2.6, 4.6)
                bmesh.ops.create_icosphere(tree_bm, subdivisions=1, radius=rr,
                                           matrix=Matrix.Translation((tx, -tz, g + rr * 1.1)) @ Matrix.Diagonal((1, 1, 1.15, 1)))
                n_tree += 1
obj_from_bm('town', house_bm, [mat('wall', PAL['wall'], notan=1.0), mat('roof', PAL['roof'], notan=1.0), mat('roof2', PAL['roof2'], notan=1.0)])
obj_from_bm('trees', tree_bm, mat('tree', PAL['tree'], notan=1.0))

# landmarks (grey-box massing)
lm_bm = bmesh.new()
def lmp(i):
    l = LMPOS[i]; return (l['position'][0], l['position'][2]), l['position'][1]
p, g = lmp('pharos')
cx, cz = p
# square base (door + keeper's stair), octagonal shaft, round upper shaft, gallery, lantern, dome: 34 m
box(lm_bm, Vector((cx, -cz, g + 3.5)), (12, 12, 7), mi=0)
cyl(lm_bm, Vector((cx, -cz, g + 7)), Vector((cx, -cz, g + 23)), 4.6, 3.8, segs=8, mi=0)
cyl(lm_bm, Vector((cx, -cz, g + 23)), Vector((cx, -cz, g + 28.5)), 3.4, 3.2, segs=16, mi=0)
cyl(lm_bm, Vector((cx, -cz, g + 28.5)), Vector((cx, -cz, g + 29.2)), 4.6, 4.6, segs=16, mi=1)
cyl(lm_bm, Vector((cx, -cz, g + 29.2)), Vector((cx, -cz, g + 32.2)), 2.5, 2.5, segs=12, mi=2)
cyl(lm_bm, Vector((cx, -cz, g + 32.2)), Vector((cx, -cz, g + 34.0)), 2.8, 0.3, segs=12, mi=1)
LH_TOP = Vector((cx, -cz, g + 32.6))
p, g = lmp('tide-board')
box(lm_bm, Vector((p[0], -p[1], g + 4)), (12, 0.6, 5), rot=math.pi / 4, mi=1)
p, g = lmp('storm-mast')
cyl(lm_bm, Vector((p[0], -p[1], 2.4)), Vector((p[0], -p[1], 24)), 0.35, 0.2, segs=6, mi=1)
cyl(lm_bm, Vector((p[0] - 4, -p[1], 20)), Vector((p[0] + 4, -p[1], 20)), 0.15, segs=6, mi=1)
p, g = lmp('tide-gauge')
cyl(lm_bm, Vector((p[0], -p[1], -1)), Vector((p[0], -p[1], 7)), 0.5, segs=6, mi=1)
sw = layout['zones']['slipway']['polygon']
prism(lm_bm, [(q[0], -q[1]) for q in sw], -1.0, 0.8, mi=0)
obj_from_bm('landmarks', lm_bm, [mat('tower', PAL['tower'], notan=1.0), mat('ironwork', PAL['mast'], notan=1.0),
                                  mat('lantern', PAL['lamp'], emit=4.0, notan=1.0)])
# re-link house() output for landmark buildings (house() writes into house_bm, already converted): rebuild
lm2 = bmesh.new()
_hb = house_bm
house_bm = lm2
for nme, w, d, e, rm in (('keepers-cottage', 12, 8, 4.5, 1), ('customs-house', 22, 13, 8.5, 2), ('harbourmaster', 16, 12, 8.0, 2),
                         ('registry', 22, 16, 10.0, 2), ('keepers-log', 10, 8, 6.0, 2)):
    p, g = lmp(nme); house(p[0], p[1], w, d, e, 4.0, 0.0, mi_roof=rm)
p, g = lmp('harbourmaster')         # clock tower over the square: the town's vertical accent (lower than the Pharos)
box(house_bm, Vector((p[0] + 9, -p[1], g + 8)), (5, 5, 17), mi=0)
cyl(house_bm, Vector((p[0] + 9, -p[1], g + 16.5)), Vector((p[0] + 9, -p[1], g + 21)), 3.4, 0.2, segs=4, mi=2)
obj_from_bm('landmark_buildings', lm2, [mat('wall', PAL['wall'], notan=1.0), mat('roof', PAL['roof'], notan=1.0), mat('roof2', PAL['roof2'], notan=1.0)])

# optional lane overlay
if LANES:
    bm = bmesh.new()
    nodes = {n['id']: n['position'] for n in layout['lanes']['nodes']}
    for e in layout['lanes']['edges']:
        a, b = nodes[e['from']], nodes[e['to']]
        cyl(bm, Vector((a[0], -a[2], 0.6)), Vector((b[0], -b[2], 0.6)), 0.6, segs=4, mi=0, cap=False)
    obj_from_bm('lanes', bm, mat('lane', PAL['lane'], emit=2.0, notan=0.5))

# ------------------------------------------------------------------ lights + render settings
if not NOTAN:
    sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 4.2; sun_d.color = (1.0, 0.93, 0.82); sun_d.angle = math.radians(2.0)
    sun = bpy.data.objects.new('sun', sun_d); COLL.objects.link(sun)
    # light from the west-south-west, low: shadows fall toward screen right
    az, el = math.radians(200), math.radians(32)
    dirv = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    sun.rotation_euler = (-dirv).to_track_quat('-Z', 'Y').to_euler()
    bg.inputs[1].default_value = 0.9

scene.render.engine = 'BLENDER_EEVEE'
try:
    scene.eevee.taa_render_samples = SAMPLES
    scene.eevee.use_shadows = True
except Exception:
    pass
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'Standard' if NOTAN else 'AgX'
scene.render.film_transparent = False

# ------------------------------------------------------------------ cameras
def make_cam(name, preset, ortho=False):
    t = preset['target']; d = preset['distance']
    p, yw = math.radians(preset['pitchDeg']), math.radians(preset['yawDeg'])
    off = (d * math.cos(p) * math.sin(yw), d * math.sin(p), d * math.cos(p) * math.cos(yw))   # glTF
    pos_g = (t[0] + off[0], t[1] + off[1], t[2] + off[2])
    cd = bpy.data.cameras.new(name); cd.clip_start = 2.0; cd.clip_end = 12000
    if ortho:
        cd.type = 'ORTHO'; cd.sensor_fit = 'VERTICAL'
        cd.ortho_scale = 2 * d * math.tan(math.radians(preset['fovDeg']) / 2)
    else:
        cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(preset['fovDeg'])
    ob = bpy.data.objects.new(name, cd); COLL.objects.link(ob)
    ob.location = Vector((pos_g[0], -pos_g[2], pos_g[1]))
    tgt = Vector((t[0], -t[2], t[1]))
    ob.rotation_euler = (tgt - ob.location).to_track_quat('-Z', 'Y').to_euler()
    return ob

PRESETS = layout['camera']['presets']
SHOT_PRESET = {'overview': 'overview', 'harbour-eth': 'harbour:pier-ethereum', 'harbour-small': 'harbour:pier-base',
               'close': 'close'}

# ------------------------------------------------------------------ metrics: projected px per class
boats = scene_data['boats']
def px_metrics(cam):
    bpy.context.view_layer.update()
    W_, H_ = RES; res = {}
    berths = [(bb['class'], bb['position'][0], bb['position'][2], bb['headingRad'])
              for P in layout['piers'] for bb in P['berths']]
    for r in layout['zones']['farPorts']['rows']:
        for p in r['slots']:
            berths.append((None, p[0], p[2], 0.0))
    for k in LC.CLASSES:
        Ls, Hs = [], []
        for (kk, x, z, h) in berths:
            if kk != k: continue
            bow = (x + math.sin(h) * LC.LOA[k] / 2, z + math.cos(h) * LC.LOA[k] / 2)
            stn = (x - math.sin(h) * LC.LOA[k] / 2, z - math.cos(h) * LC.LOA[k] / 2)
            pts = [world_to_camera_view(scene, cam, B(q, HULL_FB[k])) for q in (bow, stn)]
            if not all(0 <= p.x <= 1 and 0 <= p.y <= 1 and p.z > 0 for p in pts): continue
            Ls.append(math.hypot((pts[0].x - pts[1].x) * W_, (pts[0].y - pts[1].y) * H_))
            top = world_to_camera_view(scene, cam, B((x, z), HULL_FB[k] + LC.MAST[k]))
            Hs.append(abs(top.y - pts[0].y) * H_)
        if Ls:
            Ls.sort(); Hs.sort()
            res[k] = dict(n=len(Ls), hull_px_median=round(Ls[len(Ls) // 2], 1), hull_px_min=round(Ls[0], 1),
                          hull_px_max=round(Ls[-1], 1), mast_px_median=round(Hs[len(Hs) // 2], 1))
    return res

OUT = HERE
metrics_path = os.path.join(OUT, 'metrics.json')
metrics = json.load(open(metrics_path)) if os.path.exists(metrics_path) else {}
for shot in SHOTS:
    preset = PRESETS[SHOT_PRESET[shot]]
    for proj in PROJ:
        cam = make_cam(f'{shot}-{proj}', preset, ortho=(proj == 'ortho'))
        scene.camera = cam
        key = f'{shot}-{proj}'
        if not NOTAN:
            metrics[key] = dict(preset=SHOT_PRESET[shot], px=px_metrics(cam))
        name = f'render-{shot}-{proj}{TAG}.png' if not NOTAN else f'render-{shot}-{proj}-notan{TAG}.png'
        scene.render.filepath = os.path.join(OUT, name)
        bpy.ops.render.render(write_still=True)
        if NOTAN:
            import numpy as np
            img = bpy.data.images.load(scene.render.filepath)
            a = np.array(img.pixels[:]).reshape(RES[1], RES[0], 4)[:, :, 0]
            land = float((a > 0.75).mean()); haze = float(((a > 0.25) & (a <= 0.75)).mean())
            metrics.setdefault(key, {})['fill'] = dict(land_piers_boats=round(land, 3), haze_band=round(haze, 3),
                                                       water=round(1 - land - haze, 3))
json.dump(metrics, open(metrics_path, 'w'), indent=1)
print('DONE', SHOTS, PROJ, 'houses', n_house, 'trees', n_tree)
