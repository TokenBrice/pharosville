"""The Pharos of Alexandria - build + export public/harbour/lighthouse.glb (meshopt) and its .gz twin.

    blender -b --factory-startup -P scripts/harbour/blender/pharos/export.py [-- --v1] [--no-compress] [--no-ao]

Default: the v2 tower (pharos_v2.py, E18 Pharos proportions + E15 baked AO). --v1 rebuilds the v1 tower
(pharos_geo.py) byte for byte, so either can ship (E18 is gated on art-director approval).
Raw GLB -> outputs/harbour/pharos/lighthouse.raw.glb (scratch, also used by render.py --glb)
Runtime -> public/harbour/lighthouse.glb (EXT_meshopt_compression) + lighthouse.glb.gz (gzip -9 -n). The committed .gz is
           zopfli: export with --no-compress, then `npm run harbour:compress` writes the missing sibling.
The GLB is authored at the platform centre, unrotated; the runtime stands it at layout.pharos (or the
'pharos' landmark) and turns it by that rotationY / headingRad. Nodes: see pharos_geo.py.
Every export asserts the anchors the runtime reads (contract() below) before it writes anything public.
"""
import sys, os, json, subprocess, gzip
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
sys.path.insert(0, os.path.join(HERE, '..', 'hulls'))
sys.path.insert(0, HERE)
import bpy
import hb_lib
from hb_lib import reset_scene, descendants

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
V1 = '--v1' in ARGV
geo = __import__('pharos_geo' if V1 else 'pharos_v2')
RAW = os.path.join(ROOT, 'outputs', 'harbour', 'pharos')
PUB = os.path.join(ROOT, 'public', 'harbour')
os.makedirs(RAW, exist_ok=True)
TRI_CEILING = 8179 + 14000          # v1's tower + E18's allowance (PLAN section 7: +~14k tris, one draw)


def gl(v):
    """Blender (x, y, z) -> glTF (x, z, -y)"""
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


def contract(root, info, st):
    """The anchors the runtime reads by node name (world/lighthouse-system.ts: the beam pivot, the lantern = beam
    origin, the emitters for the fire, the plume and the statue's firelight; beam/beam-light-glsl.ts: the tritons'
    flare band) and E18's budget. A moved pivot must move its runtime constant in the same change: fail here."""
    objs = {o.name: o for o in descendants(root)}
    need = {'pharos': None, 'tower': 'hb_opaque', 'tower_windows': 'hb_window', 'statue': 'hb_opaque',
            'fire_core': 'hb_fire', 'mirror': None, 'mirror_disc': 'hb_mirror', 'mirror_frame': 'hb_opaque',
            'fire_emitter': None, 'lantern': None, 'smoke_emitter': None, 'door': None, 'causeway_gate': None}
    for name, mat in need.items():
        o = objs.get(name)
        assert o is not None, f'missing node {name}'
        assert mat is None or (o.type == 'MESH' and o.data.materials[0].name == mat), f'{name} must be {mat}'
    at = lambda n: objs[n].matrix_world.translation
    near = lambda n, xyz: all(abs(a - b) < 1e-3 for a, b in zip(at(n), xyz))
    assert near('lantern', (0, 0, 88.2)), 'lantern (FIRE_Z, the beam origin) moved'
    assert near('mirror', (0, 0, 87.4)), 'mirror (the beam pivot) moved'
    assert near('fire_emitter', (0, 0, 87.55)), 'fire_emitter moved'
    assert near('smoke_emitter', (0, 0, 96.35)), 'smoke_emitter (plume, statue light) moved'
    assert tuple(objs['mirror'].rotation_euler) == (0.0, 0.0, 0.0), 'the mirror carries no authored tilt'
    assert abs(info['Z_GAL'] - 85.0) < 1e-6, 'gallery floor moved'
    top = max((objs['statue'].matrix_world @ v.co).z for v in objs['statue'].data.vertices)
    assert abs(top - 108.225) < 0.05, f'statue top {top} left the envelope'
    assert st['total'] <= TRI_CEILING, f"{st['total']} triangles > {TRI_CEILING}"
    # the turning mirror stays inside the tholos, level and banked (lighthouse-system.ts tilts it 0.3 rad about glTF x,
    # which is Blender x: the axis map is a proper rotation): under the coffered ceiling (91.65 m), the yoke resting on
    # the pivot ring at the floor (85.0 m)
    from mathutils import Matrix
    for tilt in (0.0, 0.3):
        m = objs['mirror'].matrix_world @ Matrix.Rotation(tilt, 4, 'X')
        for part in ('mirror_disc', 'mirror_frame'):
            o = objs[part]
            zs = [(m @ (o.matrix_local @ v.co)).z for v in o.data.vertices]
            assert max(zs) < 91.6 and min(zs) > 84.75, f'{part} leaves the lantern at tilt {tilt}: {min(zs):.2f}..{max(zs):.2f}'
    if 'triton_z' in info:
        base, shoulders, crown = info['triton_z']
        # hbPharosFire lights the tritons at 55..64 m above the foot (53.5/66 m feathers): keep the figures in it
        assert 55.0 <= shoulders and crown <= 64.0, f'tritons {info["triton_z"]} outside the flare band'


reset_scene()
root, info = geo.build()
root['runtime'] = ('pharos: rotate node "mirror" about up (beam along its +Z); "lantern" = fire height (beam origin); '
                   'fire_core = ember bed (hb_fire); mirror_disc = polished face (hb_mirror)')
bpy.context.view_layer.update()
objs = descendants(root)
st = geo.stats(root)
contract(root, info, st)
ao = {}
if not V1 and '--no-ao' not in ARGV:
    import pharos_bake
    ao = pharos_bake.bake_ao([o for o in objs if o.name == 'tower'])     # the gilt Helios stays bright (no AO)
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
report = dict(version=1 if V1 else 2, tris=st, nodes=nodes, ao=ao,
              info={k: (round(v, 2) if isinstance(v, float) else v) for k, v in info.items()},
              kb=round(os.path.getsize(out) / 1024, 1), kb_raw=round(os.path.getsize(raw) / 1024, 1))
json.dump(report, open(os.path.join(RAW, 'export.json'), 'w'), indent=1)
print('PHAROS_EXPORT', json.dumps(report))
