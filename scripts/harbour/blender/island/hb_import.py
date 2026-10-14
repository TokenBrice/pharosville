"""The Harbour P6 - key art only: stand the other builders' models where the runtime stands them.

  - the Pharos of Alexandria (outputs/harbour/pharos/lighthouse.raw.glb, else public/harbour/lighthouse.glb's raw twin)
    at layout.pharos (platform centre, pavement level, rotationY);
  - every civic model (outputs/harbour/civic/raw/<kind>.glb) on its layout.civic plot;
  - a few pre-launch hulls (hull-stages.glb) on the Shipyard's slips and building berths (decorative, key art).

The raw (un-meshopt) exports are used because Blender's glTF importer does not decode EXT_meshopt_compression. Their
hb_* materials are swapped for the key-art materials (same COLOR_0 contract as the island kit). Nothing here is exported.
exec'd into build_island's namespace (after the island stages, before hb_scene)."""
import glob

RAW_CIVIC = os.path.join(ROOT, 'outputs/harbour/civic/raw')
RAW_PHAROS = os.path.join(ROOT, 'outputs/harbour/pharos/lighthouse.raw.glb')
set_coll(collection('imported', ROOTC))
IMPORTED = {}
_cover_mats = {}


def _cover_mat(hexcol):
    """Chain-coloured awnings / crest panels: the vertex shade times the chain colour."""
    if hexcol in _cover_mats:
        return _cover_mats[hexcol]
    m = new_mat('M_cover_' + hexcol.strip('#')); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'Col'
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
    mx.inputs['Factor'].default_value = 1.0
    nt.links.new(at.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = (*lin(hexcol), 1)
    nt.links.new(mx.outputs[2], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.85
    _cover_mats[hexcol] = m
    return m


def _swap_materials(objs, chain_col=None):
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        ca = me.color_attributes
        if 'Col' not in ca and len(ca):
            ca[0].name = 'Col'
        for i, m in enumerate(me.materials):
            n = (m.name if m else 'hb_opaque').split('.')[0]
            if n in ('hb_window',):
                me.materials[i] = M['window']
            elif n in ('hb_emissive', 'hb_fire'):
                me.materials[i] = M['lamp']
            elif n == 'hb_glass':
                me.materials[i] = M['lantern_glass']
            elif n in ('hb_cover', 'hb_crest'):
                me.materials[i] = _cover_mat(chain_col or '#C9B98F')
            else:                                   # hb_opaque, hb_mirror, anything else: the kit (COLOR_0 albedo + pattern)
                me.materials[i] = M['kit']


def import_glb(path, name, loc, rot_y, chain_col=None):
    """Import a glTF at (Blender x, y, z) turned by the runtime's rotationY (three.js yaw = Blender z rotation)."""
    if not os.path.exists(path):
        print('IMPORT missing', path)
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:                                    # the importer links into the active collection; keep ours tidy
        for c in list(o.users_collection):
            c.objects.unlink(o)
        cur_coll().objects.link(o)
    root = empty(name, loc, (0.0, 0.0, rot_y), family='keyart')
    for o in new:
        if o.parent is None:
            o.parent = root
        o['family'] = 'keyart'
    _swap_materials(new, chain_col)
    IMPORTED[name] = (root, new)
    return root


PHJ_ = CJ['pharos']
_ph = import_glb(RAW_PHAROS, 'pharos_keyart', (PHJ_['p'][0], PHJ_['p'][1], PHJ_['z']), PHJ_.get('rot', 0.0))
if _ph is not None:
    bpy.context.view_layer.update()
    _ln = next((o for o in IMPORTED['pharos_keyart'][1] if o.name.split('.')[0] in ('lantern', 'fire_emitter')), None)
    if _ln is not None:
        LH_LAMP = _ln.matrix_world.translation.copy()
_chain_hex = {v.lower().replace(' ', '-'): CJ['pennant'][k] for k, v in CJ['chains'].items()}
_chain_hex['hyperliquid-l1'] = CJ['pennant']['pier-hyperliquid-l1']
for cv in CJ.get('civic', []):
    kind = cv['kind']
    fname = kind.replace(':', '-') + '.glb'
    col = _chain_hex.get(kind.split(':')[1]) if ':' in kind else None
    rot = math.atan2(cv['face'][0], -cv['face'][1])
    import_glb(os.path.join(RAW_CIVIC, fname), 'civic_' + cv['id'], (cv['c'][0], cv['c'][1], cv['z']), rot, col)

# pre-launch hulls on the yard (key art: about the registry's 43 tracked launches, a few at each stage)
_hs = os.path.join(RAW_CIVIC, 'hull-stages.glb')
_yd = CJ.get('yard')
if os.path.exists(_hs) and _yd and 'civic_shipyard' in IMPORTED:
    _yroot, _yobjs = IMPORTED['civic_shipyard']
    bpy.context.view_layer.update()
    _slots = sorted([o for o in _yobjs if o.type == 'EMPTY' and o.name.split('.')[0].startswith(('slip_', 'berth_'))], key=lambda o: o.name)
    _stages = ('keel_only', 'ribs', 'planked', 'painted')
    _hrng = random.Random(43)
    for k, e in enumerate(_slots):
        if _hrng.random() < 0.2:
            continue
        st = _stages[k % 4] if not e.name.startswith('slip_') else _hrng.choice(('planked', 'painted'))
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=_hs)
        new = [o for o in bpy.data.objects if o not in before]
        keep = [o for o in new if o.name.split('.')[0] == st]
        for o in new:
            if o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        for o in keep:
            for c in list(o.users_collection):
                c.objects.unlink(o)
            cur_coll().objects.link(o)
            o.parent = None
            sc_ = 1.0 if e.name.startswith('slip_') else 0.8           # building berths take keels to ~10.5 m
            o.matrix_world = e.matrix_world @ Matrix.Translation((0.0, 0.0, 1.25 * sc_)) @ Matrix.Scale(sc_, 4)
            o['family'] = 'keyart'
        _swap_materials(keep)
print('IMPORTED', len(IMPORTED), 'models', 'pharos' if _ph is not None else 'no pharos')
