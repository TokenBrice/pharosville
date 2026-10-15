"""Harbour hulls - build and export every runtime boat GLB + LODs + wrecks/buoy/dinghy, then meshopt them.
The fleet is the classical one (hb_ancient.ANCIENT_VARIANTS, restyle P7b); hb_hulls.VARIANTS stays for the old lookdev.

    blender -b --factory-startup -P scripts/harbour/blender/hulls/export.py [-- --only usd_fisher_skiff,...] [--no-compress]

Raw GLBs  -> outputs/harbour/hulls/raw/   (scratch, also used by the lineup renders)
Runtime   -> public/harbour/kit/<file>.glb (EXT_meshopt_compression) + public/harbour/kit/manifest.json
"""
import sys, os, json, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import hb_lib; importlib.reload(hb_lib)
import hb_hulls; importlib.reload(hb_hulls)
import hb_ancient; importlib.reload(hb_ancient)
from hb_lib import *
from hb_hulls import *
from hb_ancient import ANCIENT_VARIANTS, build_ancient_budget, build_ancient_lod

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'outputs', 'harbour', 'hulls', 'raw')
KIT = os.path.join(ROOT, 'public', 'harbour', 'kit')
os.makedirs(RAW, exist_ok=True); os.makedirs(KIT, exist_ok=True)
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = set(ARGV[ARGV.index('--only') + 1].split(',')) if '--only' in ARGV else None
COMPRESS = '--no-compress' not in ARGV


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


MANIFEST = dict(
    version=1,
    style='Classical (ancient fleet, restyle P7b)',
    generator='scripts/harbour/blender/hulls/export.py',
    axes='glTF: +x bow, +y up, +z starboard, origin midships on the waterline (sea level y = 0); metres',
    materials=dict(
        hb_opaque='COLOR_0.rgb = albedo, COLOR_0.a = pattern id / 16 (style C table). Optional float attribute _BRAND '
                  '(per corner): 1 = replace rgb with the instance brand colour (boot-top stripe, pennants, ship\'s-boat bottom). '
                  'COLOR_0 holds a fallback red there.',
        hb_sail='Double-sided. COLOR_0.rgb = cloth colour. TEXCOORD_0 = sail space (u luff->leech, v foot->head; seams/tabling). '
                'TEXCOORD_1 = emblem space: the emblem square is exactly [0,1]^2 (outside = plain cloth). It reads correctly on the '
                'FRONT face (fore-and-aft sails: starboard face; square sails: forward face); flip u on back faces '
                'For mirrored nodes (port tack, det < 0) the rule generalises to: if (gl_FrontFacing == isMirrored) uv1.x = 1.0 - uv1.x. '
                'Only sail_main has emblem UVs inside [0,1].',
        hb_cover='COLOR_0.rgb = shade (near white, darker underneath); final colour = instance brand colour * COLOR_0.rgb. '
                 'Under a boom group: the sail cover on the boom. Child of _heel (square rigs): the BRAILED-SAIL bundle on '
                 'the main yard (furl 0 = inside the yard, 1 = festoons hanging from it), braced with the yard.'),
    morphs=dict(
        furl='Every mesh with a morph target named "furl": weight 0 = sail set / spar aloft / cover collapsed inside the boom, '
             '1 = sail furled (flaked on the boom, rolled on the yard or the stay) / gaff+yard lowered / brand cover on. '
             'Drive all of them from one per-boat value. Default weight 0. oars (galleys): 0 = out mid-stroke, 1 = raked up.'),
    pose=dict(
        set_shape='Set sails are modelled for wind from STARBOARD: camber to port (-z), jib clew slightly to port.',
        starboard_tack='wind from starboard: boom and boom_2 rotation.y = -swing (boom out to port), sail_jib rotates -0.6*swing about '
                       'its stay_axis, _heel.rotation.x = -heel (heel to port).',
        port_tack='wind from port: scale.z = -1 on every node listed in mirror_nodes (mirrors camber and yard bracing about the '
                  'centreline), boom and boom_2 rotation.y = +swing, jib +0.6*swing about its stay_axis, _heel.rotation.x = +heel. '
                  'LOD: scale.z = -1 on the whole lod root.',
        mirror_nodes=['boom', 'boom_2', 'yards', 'sail_extra', 'sail_jib', 'oars',
                      'sail_main and sail_cover (only when their parent is _heel: the square rigs, braced with the yard)'],
        ranges='swing 0.25..0.9 rad (close-hauled..running), heel 0.08..0.2 rad. Docked: furl 1, swing 0, heel 0. '
               'Square sails (sail_main on the ship, sail_extra) do not swing: yards are braced 30 deg in the model.',
        groups='boom (boom_spar, gaff, sail_main|sail_spanker, sail_cover) and boom_2 (boom_2_spar, gaff_2, sail_2, sail_cover_2) '
               'are empty pivots at the gooseneck; rotate/mirror the pivot, never the children.'),
    anchors='bow_cleat / stern_cleat: mooring-line ends; masthead_light: riding light; wake_origin: stern on the waterline '
            '(not heeled); mooring_buoy.ring: buoy line end; dinghy.bow_cleat: painter.',
    lod='<id>_lod.glb: single mesh "lod" (hb_opaque, _BRAND boot + cover strip, morph furl collapses the sails), <= 150 tris.',
    hulls=[], lods=[], props=[],
)


def compress(src, dst):
    cmd = ['npx', '-y', '@gltf-transform/cli@4.1.1', 'meshopt', src, dst, '--level', 'medium']
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        print('COMPRESS FAIL', dst, r.stderr[-800:])
        raise SystemExit(1)


report = []
for (vid, fam, rig, cls, sch) in ANCIENT_VARIANTS:
    if ONLY and vid not in ONLY:
        continue
    fresh()
    # budget guard: drop hull sections until the boat fits its class budget
    root, objs, R, _, n_sec = build_ancient_budget(vid, fam, rig, cls, sch, remove=lambda o: bpy.data.objects.remove(o, do_unlink=True))
    fname = f'hull_{vid}.glb'
    path, tris = export(root, fname)
    budget = BUDGET[cls]
    em = None
    if R.emblem:
        c, sz = R.emblem
        em = dict(node='sail_main', uv='TEXCOORD_1', rect=[0, 0, 1, 1], centre_m=gl(c), size_m=round(sz, 3),
                  reads_from='starboard' if rig == 'sprit' else 'ahead')
    e = dict(id=vid, file=fname, hull_sections=n_sec, family=fam, rig=rig, cls=cls, loa_m=R.L, beam_m=round(R.H.B, 2),
             freeboard_m=round(R.H.fb, 2), tris=tris, budget=budget, emblem=em, nodes=node_info(root))
    e['class'] = e.pop('cls')
    MANIFEST['hulls'].append(e)
    report.append((fname, tris, budget))
    # LOD
    fresh()
    lroot, lob, lt = build_ancient_lod(R)
    lname = f'hull_{vid}_lod.glb'
    _, ltris = export(lroot, lname)
    MANIFEST['lods'].append(dict(id=vid, file=lname, tris=ltris, budget=150))
    e['lod'] = lname
    report.append((lname, ltris, 150))

if not ONLY:
    for kind in ('a', 'b', 'c'):
        fresh()
        root, t = build_wreck(kind)
        fname = f'wreck_{kind}.glb'
        _, tris = export(root, fname)
        MANIFEST['props'].append(dict(id='wreck_' + kind, file=fname, family='wreck', tris=tris,
                                      pose={'a': 'beached on her side, bow up', 'b': 'sunk by the stern', 'c': 'old ribs, deck awash'}[kind],
                                      loa_m=root['loa_m'], nodes=node_info(root)))
        report.append((fname, tris, 900))
    fresh(); root, t = build_buoy(); _, tris = export(root, 'mooring_buoy.glb')
    MANIFEST['props'].append(dict(id='mooring_buoy', file='mooring_buoy.glb', family='prop', tris=tris, nodes=node_info(root)))
    report.append(('mooring_buoy.glb', tris, 150))
    fresh(); root, t = build_dinghy(); _, tris = export(root, 'dinghy.glb')
    MANIFEST['props'].append(dict(id='dinghy', file='dinghy.glb', family='prop', tris=tris, loa_m=root['loa_m'], nodes=node_info(root)))
    report.append(('dinghy.glb', tris, 500))

over = [r for r in report if r[1] > r[2]]
for r in report:
    print(f'EXPORT {r[0]:36s} tris={r[1]:5d} budget={r[2]:5d} {"OVER" if r[1] > r[2] else "ok"}')
print('OVER BUDGET:', over)

if COMPRESS:
    for r in report:
        compress(os.path.join(RAW, r[0]), os.path.join(KIT, r[0]))
    for sec in ('hulls', 'lods', 'props'):
        for e in MANIFEST[sec]:
            e['kb'] = round(os.path.getsize(os.path.join(KIT, e['file'])) / 1024, 1)
if not ONLY:
    with open(os.path.join(KIT, 'manifest.json'), 'w') as f:
        json.dump(MANIFEST, f, indent=1)
    print('manifest written', os.path.join(KIT, 'manifest.json'))
