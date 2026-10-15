"""Harbour civic kit - build and export every civic GLB (+ hull construction stages), meshopt them, write the manifest.

    blender -b --factory-startup -P scripts/harbour/blender/civic/export.py [-- --only mint,burn] [--no-compress]
    npm run harbour:compress        # then: .glb -> .glb.gz next to each file

Raw GLBs -> outputs/harbour/civic/raw/ (scratch)
Runtime  -> public/harbour/civic/<file>.glb (EXT_meshopt_compression) + public/harbour/civic/manifest.json
"""
import sys, os, json, math, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import cv_lib
from cv_lib import descendants, tri_count, reset_scene, CHAINS
import hb_lib
from cv_build import BUILDERS, FOOT

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'outputs', 'harbour', 'civic', 'raw')
OUT = os.path.join(ROOT, 'public', 'harbour', 'civic')
os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = set(ARGV[ARGV.index('--only') + 1].split(',')) if '--only' in ARGV else None
COMPRESS = '--no-compress' not in ARGV
BUDGET = {'mint': 12000, 'shipyard': 20000, 'hull-stages': 6000}


def gl(v):
    """Blender (x, y, z) -> glTF (x, z, -y)"""
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


def fname(kind):
    return kind.replace(':', '-') + '.glb'


def ensure_materials():
    hb_lib.ensure_export_materials()
    for nm, col, em in (('hb_window', (0.13, 0.19, 0.24), (1.0, 0.68, 0.34)), ('hb_emissive', (0.3, 0.3, 0.28), (1.0, 0.6, 0.25)),
                        ('hb_crest', (0.94, 0.91, 0.84), None)):
        m = bpy.data.materials.get(nm) or bpy.data.materials.new(nm)
        try:
            m.use_nodes = True
        except Exception:
            pass
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (*col, 1)
        p.inputs['Roughness'].default_value = 0.6
        if em:
            p.inputs['Emission Color'].default_value = (*em, 1); p.inputs['Emission Strength'].default_value = 1.0


def export(root, name):
    objs = descendants(root)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    path = os.path.join(RAW, name)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=False,
                              export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
                              export_attributes=True, export_extras=True, export_yup=True, export_morph=False,
                              export_materials='EXPORT', export_normals=True, export_image_format='NONE', export_animations=False)
    return path, tri_count(objs)


def node_info(root):
    out = []
    for o in descendants(root)[1:]:
        e = dict(name=o.name, origin=gl(o.matrix_world.translation))
        if o.parent is not root:
            e['parent'] = o.parent.name
        if any(abs(a) > 1e-6 for a in o.rotation_euler):
            e['rotation_x_rad_gltf'] = round(o.rotation_euler.x, 4)   # +x rotation pitches local +Z (glTF) downward
        if o.type == 'MESH':
            e['material'] = o.data.materials[0].name if o.data.materials else None
            e['tris'] = tri_count([o])
        else:
            e['empty'] = True
        for k in ('anim', 'crest', 'toe_gltf', 'points_gltf', 'span_slips'):
            if k in o.keys():
                v = o[k]
                e[k] = list(v) if hasattr(v, '__len__') and not isinstance(v, str) else v
        out.append(e)
    return out


def compress(src, dst):
    cmd = ['npx', '-y', '@gltf-transform/cli@4.1.1', 'meshopt', src, dst, '--level', 'medium']
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        print('COMPRESS FAIL', dst, r.stderr[-800:])
        raise SystemExit(1)


MAN_PATH = os.path.join(OUT, 'manifest.json')
MANIFEST = json.load(open(MAN_PATH)) if (ONLY and os.path.exists(MAN_PATH)) else dict(
    version=1,
    style='Classical harbour - civic kit (Ptolemaic Alexandria: stoas, temple fronts, terracotta, painted polychromy, bronze)',
    generator='scripts/harbour/blender/civic/export.py (lookdev: scripts/harbour/blender/civic/lineup.py)',
    axes='glTF: +x right, +y up, +z FRONT (the water / camera side); origin at the plot centre on the plot ground (y = 0 is the '
         'terrain the plot sits on; each plot has a 1.5-2.6 m ashlar skirt below y = 0 for uneven ground); metres. '
         'Waterfront plots (shipyard, burn) assume sea level y = -2.4 (layout quayY 2.4).',
    materials=dict(
        hb_opaque='COLOR_0.rgb = albedo, COLOR_0.a = pattern id / 16 (style C table, same as the kit).',
        hb_window='COLOR_0.r = lit (0 dark room .. 1), COLOR_0.g = warmth; one connected piece = one pane (prepareWindowGeometry).',
        hb_emissive='Fire, furnace mouths, coal beds, lamps: emissive x uLamp (sodium/fire orange). Animated glow nodes are named.',
        hb_cover='Awnings: COLOR_0.rgb = shade (alternating 1.0 / 0.78 stripes); final colour = chain colour x shade.',
        hb_crest='crest_panel only: TEXCOORD_0 = the crest square [0,1]^2, upright and readable from the front (+z). Many '
                 'public/chains/*.svg are white-on-transparent: composite them on the chain colour.'),
    chains={k: v for k, v in CHAINS.items()},
    kinds={},
)

report = []
for kind, fn in BUILDERS.items():
    if ONLY and kind not in ONLY:
        continue
    reset_scene(); ensure_materials()
    root, info = fn()
    name = fname(kind)
    path, tris = export(root, name)
    budget = BUDGET.get(kind, 6000)
    e = dict(file=name, footprint=list(FOOT[kind]) if kind != 'hull-stages' else None, tris=tris, budget=budget,
             nodes=node_info(root))
    e.update(info)
    MANIFEST['kinds'][kind] = e
    report.append((name, tris, budget))

for r in report:
    print(f'EXPORT {r[0]:36s} tris={r[1]:6d} budget={r[2]:6d} {"OVER" if r[1] > r[2] else "ok"}')
if COMPRESS:
    for r in report:
        compress(os.path.join(RAW, r[0]), os.path.join(OUT, r[0]))
    for k, e in MANIFEST['kinds'].items():
        p = os.path.join(OUT, e['file'])
        if os.path.exists(p):
            e['kb'] = round(os.path.getsize(p) / 1024, 1)
with open(MAN_PATH, 'w') as f:
    json.dump(MANIFEST, f, indent=1)
print('manifest written', MAN_PATH)
