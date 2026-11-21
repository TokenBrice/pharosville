"""Top-10 Major Titans - build and export all 10 classical hero flagships (+ LODs), meshopt + gzip, merge manifest.

    blender -b --factory-startup -P scripts/harbour/blender/titans/export.py [-- --only titan_usdt,...] [--no-compress]

Raw GLBs -> outputs/harbour/titans/raw/
Runtime  -> public/harbour/kit/titan_<coin>.glb (+ _lod) with EXT_meshopt_compression, and their .glb.gz twins
Manifest -> public/harbour/kit/manifest.json (merged locally; Wave 3 integration regenerates the committed manifest & packs).
"""
import sys
import os
import json
import struct
import subprocess
import importlib

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
HULLS_DIR = os.path.abspath(os.path.join(HERE, '..', 'hulls'))
for p in (HERE, HULLS_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

import bpy  # noqa: E402
import tt_bake  # noqa: E402
import tt_common  # noqa: E402
import tt_lod  # noqa: E402
import tt_majors_a  # noqa: E402
import tt_majors_b  # noqa: E402
import tt_titans  # noqa: E402
for _m in (tt_bake, tt_common, tt_lod, tt_majors_a, tt_majors_b, tt_titans):
    importlib.reload(_m)

from hb_lib import reset_scene, descendants, tri_count  # noqa: E402
from tt_common import ensure_titan_materials  # noqa: E402
from tt_titans import (  # noqa: E402
    TITANS, build, build_titan_lod, BUDGET_BY_CLASS, LOD_BUDGET_BY_CLASS, MAX_DIMS_BY_CLASS,
)

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'outputs', 'harbour', 'titans', 'raw')
KIT = os.path.join(ROOT, 'public', 'harbour', 'kit')
os.makedirs(RAW, exist_ok=True)
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = set(ARGV[ARGV.index('--only') + 1].split(',')) if '--only' in ARGV else None
COMPRESS = '--no-compress' not in ARGV


def gl(v):
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


def export_glb(root, fname):
    objs = descendants(root)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    path = os.path.join(RAW, fname)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=False,
        export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
        export_attributes=True, export_extras=True, export_yup=True, export_morph=True,
        export_morph_normal=True, export_materials='EXPORT', export_normals=True,
        export_image_format='NONE', export_animations=False,
    )
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
            if '_AO' in o.data.attributes:
                e['ao_attr'] = True
            if 'stay_axis' in o.keys():
                e['stay_axis'] = [round(x, 4) for x in o['stay_axis']]
        else:
            e['empty'] = True
        out.append(e)
    return out


def fresh():
    reset_scene()
    ensure_titan_materials()


def compress(src, dst):
    r = subprocess.run(
        ['npx', '-y', '@gltf-transform/cli@4.1.1', 'meshopt', src, dst, '--level', 'medium'],
        cwd=ROOT, capture_output=True, text=True,
    )
    if r.returncode != 0:
        print('COMPRESS FAIL', dst, r.stderr[-800:])
        raise SystemExit(1)
    with open(dst + '.gz', 'wb') as f:
        f.write(subprocess.run(['gzip', '-9', '-n', '-c', dst], check=True, capture_output=True).stdout)


def verify_glb_ao(path):
    """Read GLB JSON chunk and return list of mesh names that carry `_AO`."""
    with open(path, 'rb') as f:
        data = f.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    g = json.loads(data[20:20 + jlen].decode('utf-8'))
    has_ao = []
    for m in g.get('meshes', []):
        if any('_AO' in p.get('attributes', {}) for p in m.get('primitives', [])):
            has_ao.append(m.get('name', '?'))
    return has_ao


hulls, lods, report, dim_errors = [], [], [], []
for vid, coin, cls, _, desc in TITANS:
    if ONLY and vid not in ONLY:
        continue
    full_budget = BUDGET_BY_CLASS[cls]
    lod_budget = LOD_BUDGET_BY_CLASS[cls]
    max_loa, max_beam = MAX_DIMS_BY_CLASS[cls]

    fresh()
    root, objs, R = build(vid, bake_ao=True)
    fname = f'{vid}.glb'
    raw_path, tris = export_glb(root, fname)
    loa = round(R.L, 2)
    beam = round(R.H.B, 2)
    if loa > max_loa + 1e-6 or beam > max_beam + 1e-6:
        dim_errors.append((vid, cls, loa, beam, max_loa, max_beam))

    em = None
    if R.emblem:
        c, sz = R.emblem
        main = objs.get('sail_main')
        em = dict(
            node='sail_main', uv='TEXCOORD_1', rect=[0, 0, 1, 1], centre_m=gl(c), size_m=round(sz, 3),
            reads_from='ahead' if main is not None and main.parent.name == '_heel' else 'starboard',
        )
    e = dict(
        id=vid, file=fname, family='titan', rig=R.rig, loa_m=loa, beam_m=beam,
        freeboard_m=round(R.H.fb, 2), tris=tris, budget=full_budget, emblem=em,
        nodes=node_info(root), coin=coin, look=desc,
    )
    e['class'] = cls
    report.append((fname, cls, loa, beam, tris, full_budget))

    # Build LOD from a fresh non-AO build (same rig record, lightweight)
    fresh()
    root2, _objs2, R2 = build(vid, bake_ao=False)
    for o in descendants(root2):
        bpy.data.objects.remove(o, do_unlink=True)
    lroot, _, _ = build_titan_lod(R2)
    lname = f'{vid}_lod.glb'
    _, ltris = export_glb(lroot, lname)
    e['lod'] = lname
    report.append((lname, cls, loa, beam, ltris, lod_budget))
    hulls.append(e)
    lods.append(dict(id=vid, file=lname, tris=ltris, budget=lod_budget))

print('\n--- TITAN EXPORT SUMMARY ---')
for fname, cls, loa, beam, tr, bdg in report:
    tag = 'OVER' if tr > bdg else 'ok'
    print(f'EXPORT {fname:26s} [{cls:8s}] {loa:5.2f}x{beam:4.2f}m  tris={tr:5d}/{bdg:5d}  {tag}')

over = [r for r in report if r[4] > r[5]]
print('OVER BUDGET:', over)
print('DIM ERRORS:', dim_errors)

if COMPRESS:
    ao_missing = []
    for fname, *_ in report:
        src = os.path.join(RAW, fname)
        dst = os.path.join(KIT, fname)
        compress(src, dst)
        if not fname.endswith('_lod.glb'):
            ao_meshes = verify_glb_ao(dst)
            if not {'hull', 'deck', 'mast'}.issubset(set(ao_meshes)):
                ao_missing.append((fname, ao_meshes))
    for e in hulls + lods:
        e['kb'] = round(os.path.getsize(os.path.join(KIT, e['file'])) / 1024, 1)
    tot_glb = sum(os.path.getsize(os.path.join(KIT, e['file'])) for e in hulls + lods)
    tot_gz = sum(os.path.getsize(os.path.join(KIT, e['file'] + '.gz')) for e in hulls + lods)
    print(f'COMPRESSED TOTAL ({len(hulls)} full + {len(lods)} LOD): {tot_glb / 1024:.1f} KB meshopt GLB | {tot_gz / 1024:.1f} KB .glb.gz')
    print('AO VERIFICATION (missing hull/deck/mast _AO in meshopt GLB):', ao_missing)

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
        note='Top-10 classical hero ships for the majors, appended to "hulls"/"lods" with family "titan" (never picked '
             'by a peg family). Same node/morph/material contract as the kit hulls, built at runtime size (draw at scale 1). '
             'They keep their own paint: no _PAINT regions and a painted (not _BRAND) boot-top; pennants and sail '
             'covers still take the brand colour; static hull/deck/mast carry E15 BVHTree _AO. Runtime map: src/harbour/fleet/titans.ts.',
        coins=T,
    )
    with open(mpath, 'w') as f:
        json.dump(M, f, indent=1)
    print('manifest merged', mpath)
    if ao_missing:
        raise SystemExit(2)

if over or dim_errors:
    raise SystemExit(1)
