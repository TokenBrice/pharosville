"""Wreck Cove kit v2 - build and export every wreck + cove prop GLB, meshopt them, merge the manifest.

    blender -b --factory-startup -P scripts/harbour/blender/wrecks/export.py [-- --only great_hulk,cove_bell] [--no-compress]
    npm run harbour:compress        # then: .glb -> .glb.gz next to each file

Raw GLBs -> outputs/harbour/wrecks/raw/ (scratch)
Runtime  -> public/harbour/kit/wreck_<id>.glb (EXT_meshopt_compression)
Manifest -> public/harbour/kit/manifest.json, key "wreck_kit" ONLY (hulls/lods/props are left untouched; note that
            scripts/harbour/blender/hulls/export.py rewrites the whole manifest - re-run this after it).
"""
import sys, os, json, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import wk_lib
from wk_lib import descendants, tri_count, reset_scene, BOARD_W, BOARD_H
import wk_wrecks, wk_props

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'outputs', 'harbour', 'wrecks', 'raw')
KIT = os.path.join(ROOT, 'public', 'harbour', 'kit')
os.makedirs(RAW, exist_ok=True)
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = set(ARGV[ARGV.index('--only') + 1].split(',')) if '--only' in ARGV else None
COMPRESS = '--no-compress' not in ARGV
PROP_BUDGET = 600


def gl(v):
    """Blender (x, y, z) -> glTF (x, z, -y)"""
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


def export(root, fname):
    objs = descendants(root)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    path = os.path.join(RAW, fname)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=False,
                              export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
                              export_attributes=True, export_extras=True, export_yup=True, export_morph=False,
                              export_materials='EXPORT', export_normals=True, export_image_format='NONE', export_animations=False)
    return path, tri_count(objs)


ANIM = {
    'rag': 'tattered canvas, two-sided: optional flutter (sway grows with depth below its top edge; gentle, wind-driven)',
    'epitaph': 'driftwood post + nameboard; TEXCOORD_0 [0,1]^2 on the board front = the coin-name region, (-4,-4) elsewhere',
    'epitaph_lamp': 'hb_emissive lantern glass: lit at dusk/night (emissive x uLamp), optional slow flicker',
    'epitaph_light': 'lantern centre: point light / glow sprite',
    'lamp_light': 'lantern centre: point light / glow sprite',
    'hut_lamp': 'hb_emissive door lantern: lit at dusk/night',
    'station_lamp': 'hb_emissive door lantern: lit at dusk/night',
    'hut_windows': 'hb_window panes (r = lit, g = warmth)',
    'station_windows': 'hb_window panes (r = lit, g = warmth)',
    'chimney': 'smoke emitter (thin, the warden is in)',
    'slip_foot': 'foot of the slipway (about 1.6 m below the boathouse floor): place it at or below sea level',
    'bell': 'swings about its origin (the headstock) around local glTF +x: toll +/-0.5 rad when a coin is wrecked',
}


def node_info(root):
    out = []
    for o in descendants(root)[1:]:
        base = o.name.split('.')[0]
        e = dict(name=base, parent=o.parent.name.split('.')[0], origin=gl(o.location))
        if o.type == 'MESH':
            e['material'] = o.data.materials[0].name
            e['tris'] = tri_count([o])
            if o.data.uv_layers:
                e['uv'] = 'TEXCOORD_0'
        else:
            e['empty'] = True
        if base in ANIM:
            e['anim'] = ANIM[base]
        if base.startswith('pennant_'):
            e['anim'] = 'pennant: origin at the hoist, fly along local +x; flutter = sway growing with x'
        out.append(e)
    return out


def compress(src, dst):
    cmd = ['npx', '-y', '@gltf-transform/cli@4.1.1', 'meshopt', src, dst, '--level', 'medium']
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        print('COMPRESS FAIL', dst, r.stderr[-800:])
        raise SystemExit(1)


SIZE = {  # size class, tier note
    'great_hulk': ('great', 2500), 'schooner_sunk': ('large', 1200), 'stern_section': ('large', 1200),
    'capsized': ('medium', 1200), 'burned': ('medium', 1200), 'rib_cage': ('medium', 1200),
    'mast_stump': ('small', 1200), 'skiff': ('small', 1200), 'dinghy': ('tiny', 1200),
}
entries, report = [], []
for wid, fn, cls, budget in wk_wrecks.WRECKS:
    if ONLY and wid not in ONLY:
        continue
    reset_scene(); wk_lib.ensure_materials()
    root, info = fn()
    fname = f'wreck_{wid}.glb'
    _, tris = export(root, fname)
    entries.append(dict(id='wreck_' + wid, file=fname, kind='wreck', size_class=cls, loa_m=root['loa_m'], sits=root['sits'],
                        tris=tris, tris_epitaph=info['tris_epitaph'], budget=budget, nodes=node_info(root)))
    report.append((fname, tris, budget))
for pid, fn in wk_props.PROPS:
    if ONLY and pid not in ONLY:
        continue
    reset_scene(); wk_lib.ensure_materials()
    root, info = fn()
    fname = f'wreck_{pid}.glb'
    _, tris = export(root, fname)
    entries.append(dict(id='wreck_' + pid, file=fname, kind='cove', size_class=root['class'], tris=tris, budget=PROP_BUDGET,
                        nodes=node_info(root)))
    report.append((fname, tris, PROP_BUDGET))

for r in report:
    print(f'EXPORT {r[0]:36s} tris={r[1]:5d} budget={r[2]:5d} {"OVER" if r[1] > r[2] else "ok"}')
print('OVER BUDGET:', [r for r in report if r[1] > r[2]])
if COMPRESS:
    for e in entries:
        compress(os.path.join(RAW, e['file']), os.path.join(KIT, e['file']))
        e['kb'] = round(os.path.getsize(os.path.join(KIT, e['file'])) / 1024, 1)

if not ONLY and COMPRESS:
    mpath = os.path.join(KIT, 'manifest.json')
    with open(mpath) as f:
        M = json.load(f)
    M['wreck_kit'] = dict(
        version=2,
        generator='scripts/harbour/blender/wrecks/export.py (lookdev: scripts/harbour/blender/wrecks/render.py)',
        status='new kit, not yet wired: the runtime still places wreck_a/b/c from "props"',
        axes='glTF: +x bow, +y up, +z FRONT (seaward / camera side; the epitaph board faces +z). Origin = the ground '
             'under the wreck: y = 0 is the sand surface ("sits": sand) or the sea surface ("sits": water). Pose is BAKED '
             '(heel, pitch, burial, broken back): place at ground height, yaw only, do not heel again. Geometry below '
             'y = -0.7 is culled (keel buried); allow up to ~0.5 m of terrain unevenness.',
        materials=dict(
            hb_opaque='COLOR_0.rgb = albedo with the weathering baked PER CORNER (sun bleach, salt tide mark, weed/kelp line, '
                      'damp contact), COLOR_0.a = pattern id / 16 (style C table). No _BRAND / _PAINT: wrecks are never liveried.',
            hb_emissive='lantern glass: emissive x uLamp (same contract as the civic kit)',
            hb_window='hut / station panes: COLOR_0.r = lit, .g = warmth (civic contract)'),
        epitaph=dict(node='epitaph', board_m=[BOARD_W, BOARD_H], uv='TEXCOORD_0', rect=[0, 0, 1, 1],
                     reads_from='+z (front)', text='coin name (u left->right, v bottom->top); keep a 6% margin; dark ink on '
                     'the weathered cream board (COLOR_0 ~ #CDC4AE)',
                     note='every wreck carries one, beside it on its front side; hide it to use the standalone '
                          'wreck_cove_epitaph posts in the memorial row instead (recommended scale 2-2.5x at harbour zoom)'),
        two_sided='hb_opaque parts that are seen from both sides (holed hulls, rags, pennants) carry duplicated reversed '
                  'faces: keep backface culling ON.',
        items=entries,
    )
    with open(mpath, 'w') as f:
        json.dump(M, f, indent=1)
    print('manifest merged', mpath)
