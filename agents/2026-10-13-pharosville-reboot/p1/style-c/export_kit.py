"""Northern Light (style C) - kit export. Builds every asset family at the origin from the same builders the
style block uses, checks triangle budgets, writes GLBs (named nodes, COLOR_0 = Col, extras = emblem props).

    blender -b --factory-startup -P export_kit.py
"""
import sys, os, json
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib
import nl_common; importlib.reload(nl_common)
import nl_kit; importlib.reload(nl_kit)
from nl_common import *
from nl_kit import *

OUT = os.path.join(HERE, 'glb')
os.makedirs(OUT, exist_ok=True)
reset_scene()
scene = bpy.context.scene
C0 = collection('KIT')
set_coll(C0)

atlas = bpy.data.images.load(os.path.join(HERE, 'emblem-atlas.png'), check_existing=False)
build_kit_material(); build_glass_material(); build_sail_material(atlas, 4.0)
build_glow_material('lamp', lin('#3B3A33'), PAL['sodium'], 'LAMP_K')
build_glow_material('lens', PAL['lens'], PAL['lantern'], 'LENS_K')
build_glow_material('riding', lin('#DDDDDD'), PAL['riding'], 'RIDE_K')
m = new_mat('lantern_glass'); m.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.35; M['lantern_glass'] = m

BUDGET = dict(lighthouse=15000, house=2500, hull=900, flagship=2500)
REPORT = {}


def export(root, fname, budget=None, family=None):
    objs = descendants(root)
    n = tri_count(objs)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    path = os.path.join(OUT, fname)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
                              export_extras=True, export_yup=True, export_materials='EXPORT', export_normals=True,
                              export_image_format='NONE')
    ok = budget is None or n <= budget
    REPORT[fname] = dict(tris=n, budget=budget, ok=ok, family=family, nodes=len(objs), kb=round(os.path.getsize(path) / 1024, 1))
    print(f'EXPORT {fname:34s} tris={n:6d} budget={budget} {"OK" if ok else "OVER"}')
    # move it out of the way so the next asset exports alone
    for o in objs:
        o.hide_set(True)
        o.select_set(False)
    return n


# ---------------------------------------------------------------- lighthouse group (D8)
r, _ = build_lighthouse('pharos', (0, 0, 0))
export(r, 'lighthouse_pharos.glb', BUDGET['lighthouse'], 'lighthouse')
r = build_house('keeper_cottage', dict(w=10.0, d=6.4, floors=1, fh=3.0, base=0.6, ridge='x', pitch=44, wall=PAL['wall_white'],
                                       wall_pat='render', roof=PAL['roof_red'], roof_style='tiles', door='-y', win_pitch=2.4,
                                       flowers=True, chimney=True), (0, 0, 0), seed=41, family='lighthouse')
export(r, 'lighthouse_keeper_cottage.glb', BUDGET['house'], 'lighthouse')
export(build_oil_store('oil_store', (0, 0, 0)), 'lighthouse_oil_store.glb', 2500, 'lighthouse')
export(build_signal_mast('signal_mast', (0, 0, 0)), 'lighthouse_signal_mast.glb', 2500, 'lighthouse')

# ---------------------------------------------------------------- houses (6 variants, windows on all four faces)
HV = {
    'house_a_falu_gable': dict(w=7.0, d=9.0, floors=2, wall=PAL['wall_falu'], wall_pat='boards', roof=PAL['roof_red'], roof_style='tiles', ridge='y', pitch=47, flowers=True),
    'house_b_ochre_slate_tall': dict(w=7.2, d=9.4, floors=3, fh=2.6, wall=PAL['wall_ochre'], wall_pat='boards', roof=PAL['roof_slate'], roof_style='slate', ridge='y', pitch=50, shutters=True, shutter_col=PAL['door_blue']),
    'house_c_white_render': dict(w=7.6, d=9.0, floors=2, wall=PAL['wall_white'], wall_pat='render', roof=PAL['roof_red'], roof_style='tiles', ridge='y', pitch=45, flowers=True, door_col=PAL['door_red']),
    'house_d_blue_tar': dict(w=8.0, d=9.4, floors=2, wall=PAL['wall_blue'], wall_pat='boards', roof=PAL['roof_tar'], roof_style='tar', ridge='y', pitch=42, door_col=PAL['door_red']),
    'house_e_turf_cottage': dict(w=9.0, d=6.8, floors=1, fh=3.0, wall=PAL['wall_white'], wall_pat='render', roof=PAL['turf'], roof_style='turf', ridge='x', pitch=32, flowers=True),
    'house_f_warehouse': dict(w=12.0, d=8.6, floors=2, fh=3.0, wall=PAL['wall_falu'], wall_pat='boards', roof=PAL['roof_tar'], roof_style='tar', ridge='x', pitch=38, win_pitch=3.0),
}
for i, (nm, P_) in enumerate(HV.items()):
    P_ = dict(P_); P_.setdefault('door', '-y'); P_['win_faces'] = ['-y', '-x', '+x']   # runtime houses face the fixed-yaw camera; the back stays blind
    export(build_house(nm, P_, (0, 0, 0), seed=200 + i, family='house'), nm + '.glb', BUDGET['house'], 'house')

# ---------------------------------------------------------------- harbour modules
export(build_pier('pier_main_10m', [(0, -2.5, 10, 2.5)], 1.2, family='pier'), 'pier_main_10m.glb', None, 'pier')
export(build_pier('pier_finger_16m', [(0, -0.9, 16, 0.9)], 1.2, family='pier', pile_step=3.4), 'pier_finger_16m.glb', None, 'pier')
export(build_pier('pier_thead_20m', [(0, -2.5, 20, 2.5)], 1.2, family='pier'), 'pier_thead_20m.glb', None, 'pier')
root = empty('quay_wall_10m', family='quay')
obj('quay_wall_10m_wall', bm_box2(0, -1.0, -4.0, 10, 0, 2.4), PAL['quay_dark'], PATTERN['ashlar'], parent=root, family='quay')
cp = bmesh.new()
for k in range(5):
    merge(cp, bm_box2(k * 2.0 + 0.03, -0.2, 2.4, k * 2.0 + 1.97, 0.9, 2.74))
obj('quay_wall_10m_coping', cp, PAL['quay'], PATTERN['plain'], parent=root, family='quay', bevel=0.06)
obj('quay_wall_10m_paving', bm_box2(0, 0.9, 2.1, 10, 9.0, 2.46), PAL['cobble'], PATTERN['cobble'], parent=root, family='quay')
bl = bmesh.new(); bollard(bl, (5.0, 0.8, 2.7))
obj('quay_wall_10m_bollard', bl, PAL['iron'], PATTERN['metal'], parent=root, family='quay')
empty('quay_wall_10m_bow_bollard', (5.0, 0.8, 3.15), parent=root)
export(root, 'quay_wall_10m.glb', None, 'quay')
root = empty('bollard', family='quay'); bl = bmesh.new(); bollard(bl, (0, 0, 0)); obj('bollard_iron', bl, PAL['iron'], PATTERN['metal'], parent=root)
export(root, 'quay_bollard.glb', None, 'quay')
export(lamp_post('lamp_post', (0, 0, 0)), 'prop_lamp_post.glb', None, 'prop')

# ---------------------------------------------------------------- hulls: every rig family/class used, docked + sailing
HULLS = [
    ('ship', 'flagship', PAL['brand_usdt'], 0, dict(top=PAL['hull_black'], band=PAL['hull_white'], stripe=PAL['brand_usdt'], rail=PAL['hull_black'], boot=PAL['brand_usdt'], deck_in=PAL['hull_white'], transom=PAL['hull_black'], house=PAL['timber']), None),
    ('brig', 'large', PAL['brand_gold'], 4, dict(top=PAL['hull_stain'], band=PAL['hull_stain'], stripe=PAL['gilt'], rail=PAL['gilt'], boot=PAL['gilt'], deck_in=PAL['hull_stain'], transom=PAL['gilt'], house=PAL['hull_stain']), None),
    ('schooner', 'large', PAL['brand_usdc'], 1, dict(top=PAL['hull_white'], stripe=PAL['brand_usdc'], rail=PAL['timber'], boot=PAL['hull_green'], bottom=PAL['hull_green'], house=PAL['timber']), None),
    ('sloop', 'small', PAL['brand_dai'], 2, dict(top=PAL['hull_blue'], band=PAL['hull_blue'], stripe=PAL['hull_white'], rail=PAL['timber']), None),
    ('sloop', 'medium', PAL['brand_violet'], 6, dict(top=PAL['hull_red'], band=PAL['hull_red'], stripe=PAL['hull_white'], rail=PAL['timber']), None),
    ('botter', 'medium', PAL['brand_eur'], 3, dict(top=PAL['tar'], band=PAL['tar'], stripe=PAL['hull_green'], rail=PAL['hull_green'], boot=PAL['tar'], bottom=PAL['tar'], deck_in=PAL['hull_green'], transom=PAL['tar'], house=PAL['timber']), PAL['tanbark']),
    ('cat', 'boat', PAL['brand_red'], 5, dict(stripe=PAL['brand_red'], rail=PAL['timber'], boot=PAL['brand_red'], deck_in=PAL['timber'], transom=PAL['timber'], house=PAL['timber']), None),
]
for (rig, cls, brand, em, hc, cloth) in HULLS:
    for state in ('docked', 'sailing'):
        nm = f'hull_{rig}_{cls}_{state}'
        root, info = build_boat(nm, rig, cls, brand, state, math.radians(9) if state == 'sailing' else 0.0, 1, em, hc, cloth=cloth,
                                family=f'hull_{rig}_{cls}')
        budget = BUDGET['flagship'] if cls == 'flagship' else BUDGET['hull']
        export(root, nm + '.glb', budget, 'hull')

# ---------------------------------------------------------------- props + vegetation
def prop(name, fn, family='prop'):
    root = empty(name, family=family)
    fn(root)
    return export(root, name + '.glb', None, family)


def _crates(r):
    b = bmesh.new(); crate(b, (0, 0, 0)); crate(b, (1.1, 0.1, 0), 0.9, 0.2); crate(b, (0.5, 0.05, 0.75), 0.85, -0.15)
    obj('crates_timber', b, PAL['timber'], PATTERN['boards'], parent=r, bevel=0.03, jitter=0.12)


def _barrels(r):
    b = bmesh.new(); barrel(b, (0, 0, 0)); barrel(b, (0.85, 0.2, 0))
    obj('barrels_oak', b, PAL['timber'], PATTERN['boards'], parent=r)


def _nets(r):
    obj('nets_pile', bm_ico(1.3, (0, 0, 0.1), 2, (1.3, 1.0, 0.42), seed=3, amp=0.25), lin('#596B52'), PATTERN['leaf'], parent=r, smooth=True)
    c = bmesh.new()
    for k in range(6):
        a = k * 1.05
        merge(c, bm_ico(0.17, (math.cos(a) * 1.3, math.sin(a) * 1.0, 0.35), 1, seed=k))
    obj('nets_corks', c, PAL['wall_ochre'], 0, parent=r)


def _spruce(r):
    l, t = bmesh.new(), bmesh.new(); spruce(l, t, (0, 0, 0), 8.0, random.Random(1))
    obj('spruce_crown', l, face=lambda q: ((PAL['spruce_light'] if q.normal.z > 0.35 else PAL['spruce']), PATTERN['leaf']), parent=r, jitter=0.1)
    obj('spruce_trunk', t, PAL['timber_dark'], 0, parent=r)


def _birch(r):
    l, t = bmesh.new(), bmesh.new(); birch(l, t, (0, 0, 0), 7.0, random.Random(2))
    obj('birch_crown', l, PAL['birch_leaf'], PATTERN['leaf'], parent=r, jitter=0.08)
    obj('birch_trunk', t, PAL['birch_bark'], 0, parent=r)


def _fence(r):
    b = bmesh.new()
    for k in range(11):
        merge(b, bm_box(0.1, 0.1, 1.0, (k * 0.4, 0, 0.5)))
    for zz in (0.35, 0.75):
        merge(b, bm_box(4.0, 0.06, 0.1, (2.0, 0, zz)))
    obj('fence_picket_4m', b, PAL['trim'], 0, parent=r)


def _rack(r):
    b = bmesh.new(); f = bmesh.new()
    for k in range(3):
        for s in (-1, 1):
            merge(b, nl_kit.beam((0, k * 3.5, 0), (s * 0.9, k * 3.5, 2.6), 0.14, 0.14))
    merge(b, nl_kit.beam((0, 0, 2.45), (0, 7.0, 2.45), 0.14, 0.14))
    for k in range(18):
        merge(f, bm_box(0.14, 0.12, 0.7, (0, 0.2 + k * 0.38, 2.05)))
    obj('hjell_frame', b, PAL['timber_grey'], 0, parent=r)
    obj('hjell_stockfish', f, lin('#B8A07A'), 0, parent=r, jitter=0.15)


def _buoy(r):
    b = bm_cyl(0.8, 0.9, 1.4, 8, (0, 0, -0.3)); merge(b, bm_cyl(0.55, 0.55, 1.3, 8, (0, 0, 1.1)))
    obj('buoy_can_red', b, PAL['hull_red'], 0, parent=r)


def _crane(r):
    cn = bmesh.new()
    merge(cn, bm_box2(-0.8, -0.8, 0, 0.8, 0.8, 0.6)); merge(cn, bm_cyl(0.28, 0.22, 5.5, 8, (0, 0, 0.6)))
    merge(cn, nl_kit.beam((0, 0, 1.8), (-1.0, -5.0, 6.6), 0.3, 0.3)); merge(cn, nl_kit.beam((0, 0, 6.1), (-1.0, -5.0, 6.6), 0.16, 0.16))
    obj('hand_crane', cn, PAL['hull_red'], PATTERN['metal'], parent=r)


prop('prop_crates', _crates); prop('prop_barrels', _barrels); prop('prop_nets', _nets)
prop('tree_spruce', _spruce, 'veg'); prop('tree_birch', _birch, 'veg'); prop('prop_fence_picket', _fence)
prop('prop_hjell_rack', _rack); prop('prop_buoy', _buoy); prop('prop_hand_crane', _crane)
export(dinghy('prop_dinghy', (0, 0, 0), 0.0, 4.0, PAL['hull_green']), 'prop_dinghy.glb', None, 'prop')

with open(os.path.join(HERE, 'kit-stats.json'), 'w') as f:
    json.dump(REPORT, f, indent=1)
over = {k: v for k, v in REPORT.items() if not v['ok']}
print('OVER BUDGET:', json.dumps(over))
