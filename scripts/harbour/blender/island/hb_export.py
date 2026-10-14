"""The Harbour v2 - exports (exec'd after land/town/dress; boats/sky/sea are never exported).

public/harbour/island.glb
  - static island merged per material into a few spatial chunks: hb_opaque / hb_window / hb_emissive
    (COLOR_0: rgb = albedo x baked AO, a = pattern id / 16, style C contract)
  - named runtime nodes kept separate: tide_board (flat board, UV u = hour 0..24, v = up), storm_mast (+ empties
    storm_mast_cone_n0..4 / _s0..4), tide_gauge (+ tide_gauge_level), slipway, shakkei (distant hills)
public/harbour/lighthouse.glb
  - pharos (tower, hb_opaque/hb_window/hb_glass), lens (rotating node: hb_emissive + brass), lantern (empty)
outputs/harbour/island/window_lights.json  - layout lights (windows grouped per building + lamps)
"""
import subprocess
EXPORT_NORMALS = '--no-normals' not in ARGV    # the runtime material port reads NORMAL (patterns + lighting)
EXPORT_SKIP_FAMILIES = {'keyart', 'life_keyart', 'sky', 'sea', 'fx', 'beam', 'life'}
OUT_PUB = os.path.join(ROOT, 'public/harbour')
os.makedirs(OUT_PUB, exist_ok=True)
t_exp = time.time()
bpy.context.view_layer.update()
# free the runtime names: the scene's source objects step aside so export nodes get the exact names
for _n in ('tide_board', 'tide_board_frame', 'storm_mast', 'tide_gauge', 'slipway', 'pharos', 'shakkei', 'pharos_lamp', 'lantern', 'lens'):
    _o = bpy.data.objects.get(_n)
    if _o is not None:
        _o.name = _n + '_src'


def is_pharos(ob):
    p = ob
    while p is not None:
        if p.name in ('pharos', 'pharos_src'):
            return True
        p = p.parent
    return False


def is_named(ob):
    p = ob
    while p is not None:
        if p.name.replace('_src', '') in ('tide_board', 'tide_board_frame', 'storm_mast', 'tide_gauge', 'slipway'):
            return p.name.replace('_src', '')
        p = p.parent
    return None


def mat_role(m):
    if m is None:
        return 'hb_opaque'
    n = m.name
    if n == 'M_window':
        return 'hb_window'
    if n in ('lamp', 'beacon_red', 'lens', 'riding'):
        return 'hb_emissive'
    if n == 'lantern_glass':
        return 'hb_glass'
    if n == 'M_kit':
        return 'hb_opaque'
    return None


def family_of(ob):
    p = ob
    while p is not None:
        if 'family' in p:
            return p['family']
        p = p.parent
    return None


# ------------------------------------------------------------------ export materials (simple, named per contract)
EXP_MAT = {}
for nm, col, em in (('hb_opaque', (1, 1, 1), None), ('hb_window', (0.13, 0.19, 0.24), PAL['sodium']), ('hb_emissive', (0.3, 0.3, 0.28), PAL['sodium']),
                    ('hb_glass', (0.75, 0.84, 0.85), None)):
    m = bpy.data.materials.new(nm)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*col, 1)
    p.inputs['Roughness'].default_value = 0.8 if nm == 'hb_opaque' else 0.1
    if nm == 'hb_opaque':
        at = m.node_tree.nodes.new('ShaderNodeVertexColor'); at.layer_name = 'Col'
        m.node_tree.links.new(at.outputs['Color'], p.inputs['Base Color'])
    if em:
        p.inputs['Emission Color'].default_value = (*em, 1); p.inputs['Emission Strength'].default_value = 1.0
    if nm == 'hb_glass':
        p.inputs['Alpha'].default_value = 0.35
    EXP_MAT[nm] = m

EXC = bpy.data.collections.new('EXPORT'); scene.collection.children.link(EXC)
dg = bpy.context.evaluated_depsgraph_get()


def baked_copy(ob, name, local_to=None):
    """Evaluated (modifiers applied) mesh copy in world space (or relative to `local_to` matrix)."""
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    M_ = ob.matrix_world if local_to is None else local_to.inverted() @ ob.matrix_world
    me.transform(M_)
    if M_.is_negative:
        me.flip_normals()
    o = bpy.data.objects.new(name, me)
    EXC.objects.link(o)
    return o


def ensure_col(me):
    if me.color_attributes.get('Col') is None:
        a = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        buf = np.ones(len(me.loops) * 4, np.float32)
        a.data.foreach_set('color', buf)
    else:
        a = me.color_attributes['Col']
        if a.domain != 'CORNER' or a.data_type != 'FLOAT_COLOR':
            # convert by sampling
            pass
    for extra in [c.name for c in me.color_attributes if c.name != 'Col']:
        me.color_attributes.remove(me.color_attributes[extra])
    for uv in list(me.uv_layers):
        me.uv_layers.remove(uv)


def single_material(o, mat):
    """One slot, every face on it (one primitive = one draw)."""
    me = o.data
    me.polygons.foreach_set('material_index', [0] * len(me.polygons))
    me.materials.clear()
    me.materials.append(mat)


def join(objs, name):
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name; o.data.name = name
    return o


# ------------------------------------------------------------------ gather the static island
CHUNK = lambda x, y: ('w' if x < 0 else 'e') + ('s' if y < 60 else 'n')
groups = {}
named_parts = {}
src_count = 0
for ob in list(scene.objects):
    if ob.type != 'MESH' or ob.users_collection[0] == EXC or ob.hide_render:
        continue
    if ob.instance_type == 'COLLECTION':
        continue
    fam = family_of(ob)
    if fam in EXPORT_SKIP_FAMILIES or is_pharos(ob):
        continue
    if any(c.name in ('sky',) for c in ob.users_collection):
        continue
    role = mat_role(ob.data.materials[0] if ob.data.materials else None)
    if role is None:
        continue
    nm = is_named(ob) or ('shakkei' if fam == 'shakkei' else None)
    o = baked_copy(ob, ob.name + '_x')
    ensure_col(o.data)
    if nm:
        if ob.name == 'tide_board_src':
            named_parts.setdefault('tide_board', []).append((role, o, ob))
        else:
            named_parts.setdefault(nm, []).append((role, o, ob))
        continue
    c = ob.matrix_world.translation
    if ob.name.startswith(('land_terrain', 'land_cliffs', 'trees_', 'veg_', 'land_', 'field_walls')):
        # big multi-region meshes: split by chunk via bmesh after the join
        key = ('split', role)
    else:
        bb = [ob.matrix_world @ Vector(v) for v in ob.bound_box]
        cx_ = sum(v.x for v in bb) / 8; cy_ = sum(v.y for v in bb) / 8
        key = (CHUNK(cx_, cy_), role)
    groups.setdefault(key, []).append(o)
    src_count += 1
print('EXPORT gathered', src_count, 'objects')


def split_by_chunk(o, role):
    """Split a joined mesh by face-centre chunk into 4 objects."""
    me = o.data
    out = {}
    for ck in ('ws', 'wn', 'es', 'en'):
        bm = bmesh.new(); bm.from_mesh(me)
        dead = [f for f in bm.faces if CHUNK(f.calc_center_median().x, f.calc_center_median().y) != ck]
        bmesh.ops.delete(bm, geom=dead, context='FACES')
        if len(bm.faces) == 0:
            bm.free(); continue
        m2 = bpy.data.meshes.new(f'{o.name}_{ck}')
        bm.to_mesh(m2); bm.free()
        o2 = bpy.data.objects.new(m2.name, m2); EXC.objects.link(o2)
        out[ck] = o2
    bpy.data.objects.remove(o, do_unlink=True)
    return out


final = {}
split_roles = {}
for key, objs in groups.items():
    if key[0] == 'split':
        j = join(objs, f'split_{key[1]}')
        for ck, o2 in split_by_chunk(j, key[1]).items():
            final.setdefault((ck, key[1]), []).append(o2)
    else:
        final.setdefault(key, []).extend(objs)
CHUNK_OBJS = []
for (ck, role), objs in sorted(final.items()):
    o = join(objs, f'island_{ck}_{role[3:]}')
    single_material(o, EXP_MAT[role])
    o['role'] = role
    CHUNK_OBJS.append(o)

# named runtime nodes: one mesh each (+ their empties re-created under an export root)
NAMED_OUT = []
for nm, parts in named_parts.items():
    by_role = {}
    for role, o, src in parts:
        by_role.setdefault(role, []).append(o)
    for role, objs in by_role.items():
        o = join(objs, f'{nm}_mesh' if len(by_role) == 1 else f'{nm}_{role[3:]}')
        single_material(o, EXP_MAT[role])
        NAMED_OUT.append(o)
# tide_board keeps its UVs (u = hour, v = up): rebuild it straight from the source
tb_src = bpy.data.objects.get('tide_board_src')
if tb_src is not None:
    keep = []
    for o in NAMED_OUT:
        if o.name == 'tide_board_mesh':
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            keep.append(o)
    NAMED_OUT = keep
    me = tb_src.data.copy(); me.transform(tb_src.matrix_world)
    tbo = bpy.data.objects.new('tide_board', me); EXC.objects.link(tbo)
    me.materials.clear(); me.materials.append(EXP_MAT['hb_opaque'])
    tbo['runtime'] = 'tide board: 24 hourly bars drawn on UV (u = hour 0..24 left->right, v = up)'
    NAMED_OUT.append(tbo)
# empties: storm-mast cone stations, tide-gauge level, named roots
for src_root in ('storm_mast', 'tide_gauge', 'slipway'):
    r = bpy.data.objects.get(src_root + '_src')
    if r is None:
        continue
    e = bpy.data.objects.new(src_root + '_node', None); EXC.objects.link(e)
    e.matrix_world = r.matrix_world.copy()
    e['runtime'] = {'storm_mast': 'hoist cones at storm_mast_cone_n0..4 / _s0..4 (top -> down)',
                    'tide_gauge': 'tide_gauge_level marks mean sea level on the gauge board',
                    'slipway': 'launch cradle origin; launchPath in layout.zones.slipway'}[src_root]
    for ch in r.children:
        if ch.type == 'EMPTY':
            e2 = bpy.data.objects.new(ch.name, None); EXC.objects.link(e2)
            e2.parent = e; e2.matrix_world = ch.matrix_world.copy()
    for o in NAMED_OUT:
        if o.name.startswith(src_root) and o.parent is None:
            mw = o.matrix_world.copy(); o.parent = e; o.matrix_world = mw
    NAMED_OUT.append(e)
    # the runtime looks the node up by its plain name
    e.name = src_root

# shakkei: the mainland across the northern sound is its own node (render it with fog, no shadows needed)
for o in NAMED_OUT:
    if o.name.startswith('shakkei'):
        o.name = 'shakkei'; o.data.name = 'shakkei'
        o['runtime'] = 'mainland across the northern sound (shakkei): kit material + strong fog; cast no shadows'

# ------------------------------------------------------------------ baked AO -> vertex colour (Cycles, GPU when available)
def bake_ao(objs, distance=7.0, samples=48, strength=0.8):
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for dev_type in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = dev_type
                prefs.get_devices()
                if any(d.type == dev_type for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == dev_type
                    scene.cycles.device = 'GPU'
                    break
            except Exception:
                continue
    except Exception as e:
        print('cycles prefs', e)
    scene.cycles.samples = samples
    if scene.world is None:
        scene.world = bpy.data.worlds.new('bakeW')
    scene.world.light_settings.distance = distance
    # occluders: every chunk + named node is in EXC (visible); hide the source scene so nothing double-occludes
    for ob in scene.objects:
        if ob.users_collection and ob.users_collection[0] != EXC:
            ob.hide_render = True
    for o in objs:
        me = o.data
        if not len(me.polygons):
            continue
        ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = ao
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True); bpy.context.view_layer.objects.active = o
        try:
            bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', margin=0)
        except Exception as e:
            print('AO bake failed on', o.name, e)
            me.color_attributes.remove(ao)
            continue
        n = len(me.loops)
        a = np.zeros(n * 4, np.float32); ao.data.foreach_get('color', a); a = a.reshape(-1, 4)
        c = np.zeros(n * 4, np.float32); col = me.color_attributes['Col']; col.data.foreach_get('color', c); c = c.reshape(-1, 4)
        occ = np.clip(a[:, 0], 0, 1)
        k = 1.0 - strength * (1.0 - occ)
        c[:, :3] *= k[:, None]
        col.data.foreach_set('color', c.ravel())
        me.color_attributes.remove(me.color_attributes['AO'])
        me.color_attributes.active_color = me.color_attributes['Col']
        print('AO baked', o.name, round(float(occ.mean()), 3))


opaque = [o for o in CHUNK_OBJS if o.get('role') == 'hb_opaque'] + [o for o in NAMED_OUT if o.type == 'MESH' and not o.name.startswith('shakkei')
                                                                       and o.data.materials and o.data.materials[0] == EXP_MAT['hb_opaque']]
if '--no-ao' not in ARGV:
    bake_ao(opaque)


# ------------------------------------------------------------------ fixed-camera back-face cull (D1: yaw 45 / pitch 35, pan + zoom only)
# A face whose normal points away from every possible view ray (view vector within ~25 deg of V) is never seen.
V_CAM = Vector((math.sin(math.radians(45)) * math.cos(math.radians(35)), -math.cos(math.radians(45)) * math.cos(math.radians(35)),
                math.sin(math.radians(35)))).normalized()
CULL_DOT = -0.45


def cull_hidden(o):
    if '--keep-backfaces' in ARGV or o.type != 'MESH':
        return 0
    bm = bmesh.new(); bm.from_mesh(o.data)
    bm.normal_update()
    dead = [f for f in bm.faces if f.normal.length > 0.5 and f.normal.dot(V_CAM) < CULL_DOT]
    n = len(dead)
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(o.data); bm.free()
    return n


culled = sum(cull_hidden(o) for o in CHUNK_OBJS + [o for o in NAMED_OUT if o.name != 'tide_board'])
print('CULLED faces', culled)

# ------------------------------------------------------------------ write island.glb
def tri_count_of(objs):
    n = 0
    for o in objs:
        if o.type == 'MESH':
            o.data.calc_loop_triangles(); n += len(o.data.loop_triangles)
    return n


def export_glb(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.hide_render = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
                              export_extras=True, export_yup=True, export_materials='EXPORT', export_normals=EXPORT_NORMALS,
                              export_image_format='NONE', export_texcoords=True)


island_objs = CHUNK_OBJS + NAMED_OUT
for o in island_objs:
    for ch in o.children:
        if ch not in island_objs:
            island_objs.append(ch)
raw = os.path.join(OUTD, 'island.raw.glb')
export_glb(island_objs, raw)
STATS = dict(island=dict(tris=tri_count_of(island_objs), meshes=sum(1 for o in island_objs if o.type == 'MESH'),
                         primitives={o.name: o.data.materials[0].name if o.type == 'MESH' and o.data.materials else None for o in island_objs},
                         per_mesh={o.name: tri_count_of([o]) for o in island_objs if o.type == 'MESH'}))

# ------------------------------------------------------------------ lighthouse.glb: tower + rotating lens + lantern empty
PH = bpy.data.objects['pharos_src']
# lighthouse.glb is authored at the origin, scale baked in, unrotated: the runtime places it at the 'pharos'
# landmark position and turns it by that landmark's headingRad (= the -45 deg used here).
PH_FRAME = Matrix.Translation(PH.matrix_world.translation) @ PH.matrix_world.to_quaternion().to_matrix().to_4x4()
lh_parts = {}
lens_parts = []
lantern_empty = None
for ob in descendants(PH):
    if ob.type == 'EMPTY':
        if ob.name.startswith('pharos_lamp'):
            lantern_empty = ob
        continue
    if ob.type != 'MESH':
        continue
    o = baked_copy(ob, ob.name + '_lx', local_to=PH_FRAME)
    ensure_col(o.data)
    if ob.name in ('pharos_lens', 'pharos_lensframe'):
        lens_parts.append(o)
        continue
    role = mat_role(ob.data.materials[0] if ob.data.materials else None) or 'hb_opaque'
    lh_parts.setdefault(role, []).append(o)
lroot = bpy.data.objects.new('pharos', None); EXC.objects.link(lroot)
lroot['runtime'] = 'lighthouse: rotate node "lens" about its local up axis; "lantern" = light origin (beam, halo)'
LH_OBJS = [lroot]
for role, objs in lh_parts.items():
    o = join(objs, f'tower_{role[3:]}')
    single_material(o, EXP_MAT[role])
    o.parent = lroot; o.matrix_parent_inverse.identity()
    LH_OBJS.append(o)
lens = join(lens_parts, 'lens')
for i, m in enumerate(lens.data.materials):
    lens.data.materials[i] = EXP_MAT['hb_emissive'] if (m and m.name == 'lens') else EXP_MAT['hb_opaque']
lens.parent = lroot; lens.matrix_parent_inverse.identity()
LH_OBJS.append(lens)
le = bpy.data.objects.new('lantern', None); EXC.objects.link(le)
le.parent = lroot; le.matrix_parent_inverse.identity()
le.location = PH_FRAME.inverted() @ lantern_empty.matrix_world.translation
LH_OBJS.append(le)
le2 = bpy.data.objects.new('pharos_lamp', None); EXC.objects.link(le2)        # alias the lighthouse system looks up
le2.parent = lroot; le2.matrix_parent_inverse.identity(); le2.location = le.location.copy()
LH_OBJS.append(le2)
if '--no-ao' not in ARGV:
    bake_ao([o for o in LH_OBJS if o.type == 'MESH' and o.data.materials and o.data.materials[0] == EXP_MAT['hb_opaque']], distance=4.0)
for o in LH_OBJS:
    if o.type == 'MESH' and o.name.startswith('tower_'):
        # the tower is drawn from the same fixed camera; cull in world orientation
        mw = PH_FRAME.to_3x3()
        bm = bmesh.new(); bm.from_mesh(o.data); bm.normal_update()
        dead = [f for f in bm.faces if (mw @ f.normal).normalized().dot(V_CAM) < CULL_DOT]
        bmesh.ops.delete(bm, geom=dead, context='FACES'); bm.to_mesh(o.data); bm.free()
lraw = os.path.join(OUTD, 'lighthouse.raw.glb')
export_glb(LH_OBJS, lraw)
STATS['lighthouse'] = dict(tris=tri_count_of(LH_OBJS), lantern_world=list(le.matrix_world.translation), meshes=[o.name for o in LH_OBJS])


# ------------------------------------------------------------------ meshopt (gltf-transform)
def meshopt(src, dst):
    cmd = ['npx', '--yes', '@gltf-transform/cli@4.1.1', 'meshopt', src, dst]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        print('MESHOPT failed', r.stderr[-600:]); import shutil; shutil.copy(src, dst)


meshopt(raw, os.path.join(OUT_PUB, 'island.glb'))
meshopt(lraw, os.path.join(OUT_PUB, 'lighthouse.glb'))
for k, p in (('island', 'island.glb'), ('lighthouse', 'lighthouse.glb')):
    STATS[k]['kb_raw'] = round(os.path.getsize(os.path.join(OUTD, p.replace('.glb', '.raw.glb'))) / 1024, 1)
    STATS[k]['kb'] = round(os.path.getsize(os.path.join(OUT_PUB, p)) / 1024, 1)

# ------------------------------------------------------------------ lights for layout.json (glTF coords)
gl3 = lambda v: [round(v[0], 2), round(v[2], 2), round(-v[1], 2)]
LIGHTS = []
for (nm, pts) in WINDOW_GROUPS:
    c = sum(pts, Vector()) / len(pts)
    LIGHTS.append(dict(kind='window', position=gl3(c), color='#FFAE57', building=nm, windows=len(pts)))
for (x, y, z, kind, col) in LAMP_LIGHTS:
    LIGHTS.append(dict(kind='pierhead' if kind == 'pierhead' else 'lamp', position=gl3((x, y, z)), color=col or '#FFB15C'))
json.dump(LIGHTS, open(os.path.join(OUTD, 'window_lights.json'), 'w'))
STATS['lights'] = len(LIGHTS)
json.dump(STATS, open(os.path.join(OUTD, 'export-stats.json'), 'w'), indent=1)
print('EXPORT done', round(time.time() - t_exp, 1), 's', json.dumps({k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk in ('tris', 'kb', 'kb_raw', 'meshes')}) for k, v in STATS.items()}))
scene.render.engine = 'BLENDER_EEVEE'
for ob in scene.objects:
    ob.hide_render = False
for o in list(EXC.objects):
    o.hide_render = True
