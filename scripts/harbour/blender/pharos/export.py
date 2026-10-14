"""The Pharos of Alexandria - build + export public/harbour/lighthouse.glb (meshopt) and its .gz twin.

    blender -b --factory-startup -P scripts/harbour/blender/pharos/export.py [-- --no-compress]

Raw GLB -> outputs/harbour/pharos/lighthouse.raw.glb (scratch, also used by render.py --glb)
Runtime -> public/harbour/lighthouse.glb (EXT_meshopt_compression) + lighthouse.glb.gz (gzip -9 -n)
The GLB is authored at the platform centre, unrotated; the runtime stands it at layout.pharos (or the
'pharos' landmark) and turns it by that rotationY / headingRad. Nodes: see pharos_geo.py.
"""
import sys, os, json, subprocess, gzip
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
sys.path.insert(0, os.path.join(HERE, '..', 'hulls'))
sys.path.insert(0, HERE)
import bpy
import hb_lib
import pharos_geo
from hb_lib import reset_scene, descendants

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RAW = os.path.join(ROOT, 'outputs', 'harbour', 'pharos')
PUB = os.path.join(ROOT, 'public', 'harbour')
os.makedirs(RAW, exist_ok=True)


def gl(v):
    """Blender (x, y, z) -> glTF (x, z, -y)"""
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


reset_scene()
root, info = pharos_geo.build()
root['runtime'] = ('pharos: rotate node "mirror" about up (beam along its +Z); "lantern" = fire height (beam origin); '
                   'fire_core = ember bed (hb_fire); mirror_disc = polished face (hb_mirror)')
bpy.context.view_layer.update()
objs = descendants(root)
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = root
raw = os.path.join(RAW, 'lighthouse.raw.glb')
bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', use_selection=True, export_apply=False,
                          export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
                          export_attributes=False, export_extras=True, export_yup=True, export_morph=False,
                          export_materials='EXPORT', export_normals=True, export_texcoords=True,
                          export_image_format='NONE', export_animations=False)
st = pharos_geo.stats(root)
nodes = {o.name: gl(o.matrix_world.translation) for o in objs if o.type == 'EMPTY'}
out = os.path.join(PUB, 'lighthouse.glb')
r = subprocess.run(['npx', '--yes', '@gltf-transform/cli@4.1.1', 'meshopt', raw, out], capture_output=True, text=True, timeout=600, cwd=ROOT)
if r.returncode != 0:
    print('MESHOPT failed', r.stderr[-800:])
    import shutil; shutil.copy(raw, out)
if '--no-compress' not in ARGV:
    data = open(out, 'rb').read()
    with open(out + '.gz', 'wb') as fh:
        fh.write(gzip.compress(data, 9, mtime=0))
report = dict(tris=st, nodes=nodes, info={k: round(v, 2) for k, v in info.items()},
              kb=round(os.path.getsize(out) / 1024, 1), kb_raw=round(os.path.getsize(raw) / 1024, 1))
json.dump(report, open(os.path.join(RAW, 'export.json'), 'w'), indent=1)
print('PHAROS_EXPORT', json.dumps(report))
