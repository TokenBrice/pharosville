"""Titan-class flagships - build and export the four hero ships (+ LODs), meshopt + gzip them, merge the manifest.

    blender -b --factory-startup -P scripts/harbour/blender/titans/export.py [-- --only titan_usdt,...] [--no-compress]

Raw GLBs -> outputs/harbour/titans/raw/
Runtime  -> public/harbour/kit/titan_<coin>.glb (+ _lod) with EXT_meshopt_compression, and their .glb.gz twins
Manifest -> public/harbour/kit/manifest.json: the titan entries are (re)appended to "hulls" and "lods" (family "titan",
            so no peg family ever picks them) plus a "titans" note (coin -> variant, runtime LOA). Everything else in
            the manifest is left untouched. scripts/harbour/blender/hulls/export.py rewrites the whole manifest: re-run
            this after it. The runtime (src/harbour/fleet/titans.ts) falls back to the kit hulls when they are missing.
"""
import sys, os, json, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import tt_titans; importlib.reload(tt_titans)
import bpy
from hb_lib import reset_scene, ensure_export_materials, descendants, tri_count
from tt_titans import TITANS, build, build_titan_lod, BUDGET, LOD_BUDGET

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'outputs', 'harbour', 'titans', 'raw')
KIT = os.path.join(ROOT, 'public', 'harbour', 'kit')
os.makedirs(RAW, exist_ok=True)
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = set(ARGV[ARGV.index('--only') + 1].split(',')) if '--only' in ARGV else None
COMPRESS = '--no-compress' not in ARGV


def gl(v):
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
                              export_attributes=True, export_extras=True, export_yup=True, export_morph=True,
                              export_morph_normal=True, export_materials='EXPORT', export_normals=True,
                              export_image_format='NONE', export_animations=False)
    return path, tri_count(objs)


def node_info(root):
    out = []
    for o in descendants(root)[1:]:
        e = dict(name=o.name, parent=o.parent.name, origin=gl(o.location))
        if o.type == 'MESH':
            e['material'] = o.data.materials[0].name
            e['tris'] = tri_count([o])
            if o.data.shape_keys:
                e['morphs'] = [k.name for k in o.data.shape_keys.key_blocks[1:]]
            if '_BRAND' in o.data.attributes:
                e['brand_attr'] = True
            if 'stay_axis' in o.keys():
                e['stay_axis'] = [round(x, 4) for x in o['stay_axis']]
        else:
            e['empty'] = True
        out.append(e)
    return out


def fresh():
    reset_scene()
    ensure_export_materials()


def compress(src, dst):
    r = subprocess.run(['npx', '-y', '@gltf-transform/cli@4.1.1', 'meshopt', src, dst, '--level', 'medium'], cwd=ROOT,
                       capture_output=True, text=True)
    if r.returncode != 0:
        print('COMPRESS FAIL', dst, r.stderr[-800:])
        raise SystemExit(1)
    with open(dst + '.gz', 'wb') as f:      # deterministic twin, as scripts/harbour/compress-assets.mjs makes it
        f.write(subprocess.run(['gzip', '-9', '-n', '-c', dst], check=True, capture_output=True).stdout)


hulls, lods, report = [], [], []
for vid, coin, _, desc in TITANS:
    if ONLY and vid not in ONLY:
        continue
    fresh()
    root, objs, R = build(vid)
    fname = f'{vid}.glb'
    _, tris = export(root, fname)
    em = None
    if R.emblem:
        c, sz = R.emblem
        main = objs.get('sail_main')
        em = dict(node='sail_main', uv='TEXCOORD_1', rect=[0, 0, 1, 1], centre_m=gl(c), size_m=round(sz, 3),
                  reads_from='ahead' if main is not None and main.parent.name == '_heel' else 'starboard')
    e = dict(id=vid, file=fname, hull_sections=None, family='titan', rig=R.rig, loa_m=R.L, beam_m=round(R.H.B, 2),
             freeboard_m=round(R.H.fb, 2), tris=tris, budget=BUDGET, emblem=em, nodes=node_info(root), coin=coin, look=desc)
    e['class'] = 'flagship'
    del e['hull_sections']
    report.append((fname, tris, BUDGET))
    fresh()
    root2, objs2, R2 = build(vid)            # the LOD reads the rig record of a fresh build
    for o in descendants(root2):
        bpy.data.objects.remove(o, do_unlink=True)
    lroot, _, _ = build_titan_lod(R2)
    lname = f'{vid}_lod.glb'
    _, ltris = export(lroot, lname)
    e['lod'] = lname
    report.append((lname, ltris, LOD_BUDGET))
    hulls.append(e)
    lods.append(dict(id=vid, file=lname, tris=ltris, budget=LOD_BUDGET))

for r in report:
    print(f'EXPORT {r[0]:28s} tris={r[1]:5d} budget={r[2]:5d} {"OVER" if r[1] > r[2] else "ok"}')
print('OVER BUDGET:', [r for r in report if r[1] > r[2]])

if COMPRESS:
    for r in report:
        compress(os.path.join(RAW, r[0]), os.path.join(KIT, r[0]))
    for e in hulls + lods:
        e['kb'] = round(os.path.getsize(os.path.join(KIT, e['file'])) / 1024, 1)
    mpath = os.path.join(KIT, 'manifest.json')
    with open(mpath) as f:
        M = json.load(f)
    done = {e['id'] for e in hulls}
    M['hulls'] = [h for h in M.get('hulls', []) if h['id'] not in done] + hulls
    M['lods'] = [h for h in M.get('lods', []) if h['id'] not in done] + lods
    T = M.get('titans', {}).get('coins', {})
    T.update({e['coin']: e['id'] for e in hulls})
    M['titans'] = dict(
        generator='scripts/harbour/blender/titans/export.py (lookdev: scripts/harbour/blender/titans/lineup.py)',
        note='Unique hero ships for the majors, appended to "hulls"/"lods" with family "titan" (never picked by a peg '
             'family). Same node/morph/material contract as the kit hulls, built at runtime size (draw at scale 1). '
             'They keep their own paint: no _PAINT regions and a painted (not _BRAND) boot-top; pennants and sail '
             'covers still take the brand colour. The runtime map is src/harbour/fleet/titans.ts.',
        coins=T)
    with open(mpath, 'w') as f:
        json.dump(M, f, indent=1)
    print('manifest merged', mpath)
