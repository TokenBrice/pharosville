"""Export the Style A kit as GLBs (named nodes, COLOR_0 = albedo*AO*gradient, _PAT0/_PAT1 pattern masks).

    blender -b --factory-startup -P export.py

Each asset is built at the origin by the same builders the style block uses, then exported alone.
Writes glb/*.glb and glb/kit-stats.json (triangles per asset)."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from lib import *
import shading
import kit_town as KT
import kit_harbour as KH
import kit_boats as KB

reset()
atlas = os.path.join(HERE, 'glb', 'emblem-atlas.png')
shading.build_emblem_atlas(atlas)
shading.build_all(atlas)
C = coll('kit')
OUT = os.path.join(HERE, 'glb')
STATS = {}


def tri_count(objs):
    n = 0
    for o in objs:
        if o.type == 'MESH':
            o.data.calc_loop_triangles(); n += len(o.data.loop_triangles)
    return n


def export(name, objs, family):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_attributes=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_apply=True, export_extras=True,
                              export_normals=True, export_tangents=False)
    STATS[name] = dict(family=family, triangles=tri_count(objs), bytes=os.path.getsize(path))
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)


def root(name):
    return empty(name, C)


# ---------------- lighthouse group (D8)
r = root('lighthouse')
p = Part('lighthouse_tower'); lens = Part('lens')
KH.lighthouse(p, (0, 0, 0), lens=lens)
o1 = p.finish(C, ao=0.8, ao_dist=2.0, ground=0.0, grad=(0, 20, 0.82, 1.06, 1.0), parent=r)
o2 = lens.finish(C, parent=r)
lan = empty('lantern_light', C, loc=KH.LIGHT_POS['lantern'], parent=r)
door = empty('door_lamp', C, loc=KH.LIGHT_POS['door'][0], parent=r)
export('lighthouse', [r, o1, o2, lan, door], 'lighthouse')
r = root('keepers_cottage')
kc = KT.house('keepers_cottage_mesh', C, w=7.4, d=5.2, h=4.4, wall='plaster_white', roof='slate', seed=21, floors=1,
              shutters='shutter_teal', lean_to=True, lantern=True, chimneys=((-0.55, 0.0), (0.6, 0.0)), boxes=True)
export('keepers_cottage', [r, kc.finish(C, ao=0.8, ground=0.0, grad=(0, 7, 0.86, 1.05, 1.0), parent=r)], 'lighthouse')
r = root('oil_store'); p = Part('oil_store_mesh'); KH.oil_store(p)
export('oil_store', [r, p.finish(C, ao=0.7, ground=0.0, grad=(0, 4, 0.86, 1.04, 1.0), parent=r)], 'lighthouse')
r = root('signal_mast'); p = Part('signal_mast_mesh'); KH.signal_mast(p, h=12.0, cones=2)
export('signal_mast', [r, p.finish(C, ao=0.4, ground=0.0, parent=r)], 'lighthouse')

# ---------------- houses: six variants
HV = [
    ('house_a', dict(w=6.4, d=8.0, h=6.4, wall='plaster_cream', roof='terracotta', seed=1, lantern=True, ivy=True)),
    ('house_b', dict(w=5.0, d=8.0, h=8.4, wall='plaster_rose', roof='slate', ridge='y', seed=2, floors=3, shutters='shutter_teal', balcony=True)),
    ('house_c', dict(w=7.0, d=7.6, h=5.6, stone=True, roof='terracotta', seed=3, shutters='shutter_blue', dormer=True)),
    ('house_d', dict(w=5.2, d=8.0, h=7.6, wall='plaster_sky', roof='terracotta', seed=4, ridge='y', shutters='shutter_red', lantern=True)),
    ('house_e', dict(w=5.8, d=7.6, h=6.2, wall='plaster_peach', roof='terracotta', seed=5, shutters='shutter_sage', half_timber=True)),
    ('house_f', dict(w=7.4, d=7.0, h=5.6, wall='plaster_cream', roof='terracotta', seed=10, shutters='shutter_teal', lean_to=True, ivy=True)),
]
for nm, kw in HV:
    r = root(nm)
    h = KT.house(nm + '_mesh', C, **kw)
    export(nm, [r, h.finish(C, ao=0.8, ao_dist=1.6, ground=0.0, grad=(0, kw['h'] + 4, 0.84, 1.05, 1.0), parent=r)], 'house')

# ---------------- pier modules
r = root('pier_span_5m'); p = Part('pier_span_5m_mesh')
KH.pier_run(p, 0, 1.6, 0, -1.6, 5.0, z=1.2, pile_step=3.2, seed=1)
lo = p.finish(C, ao=0.55, ao_dist=1.2, grad=(-1.0, 1.4, 0.7, 1.02, 1.0), parent=r)
export('pier_span_5m', [r, lo], 'pier')
r = root('finger_span_1m8'); p = Part('finger_span_mesh')
KH.pier_run(p, -1.65, 0, 1.65, 0, 1.8, z=1.15, pile_step=3.3, seed=2, bracing=False, color='plank_grey')
export('finger_span_1m8', [r, p.finish(C, ao=0.55, ao_dist=1.2, grad=(-1.0, 1.4, 0.7, 1.02, 1.0), parent=r)], 'pier')
r = root('thead_span_4m2'); p = Part('thead_span_mesh')
KH.pier_run(p, -1.6, 0, 1.6, 0, 4.2, z=1.2, pile_step=3.2, seed=3)
export('thead_span_4m2', [r, p.finish(C, ao=0.55, ao_dist=1.2, grad=(-1.0, 1.4, 0.7, 1.02, 1.0), parent=r)], 'pier')
r = root('pier_lamp'); p = Part('pier_lamp_mesh'); KH.LIGHT_POS['pier'] = []
KH.pier_lamp(p, (0, 0, 0))
lamp_e = empty('lamp_light', C, loc=KH.LIGHT_POS['pier'][0], parent=r)
export('pier_lamp', [r, p.finish(C, ao=0.3, parent=r), lamp_e], 'pier')

# ---------------- quay pieces
r = root('quay_segment_6m5'); p = Part('quay_segment_mesh')
KH.quay_wall(p, -3.25, 3.25, 0.0, top=1.9, face=-1, bollard_every=6.5)
export('quay_segment_6m5', [r, p.finish(C, ao=0.6, ao_dist=1.5, grad=(-0.6, 2.2, 0.55, 1.03, 1.0), parent=r)], 'quay')
r = root('quay_stairs'); p = Part('quay_stairs_mesh'); KH.quay_stairs(p, 0.0, 0.0, top=1.9, face=-1, along=1)
export('quay_stairs', [r, p.finish(C, ao=0.6, ao_dist=1.5, grad=(-0.6, 2.2, 0.55, 1.03, 1.0), parent=r)], 'quay')
r = root('bollard'); p = Part('bollard_mesh'); KH.bollard(p, (0, 0, 0))
export('bollard', [r, p.finish(C, ao=0.3, parent=r)], 'quay')
r = root('lamp_post'); p = Part('lamp_post_mesh'); KT.lamp_post(p, (0, 0, 0))
export('lamp_post', [r, p.finish(C, ao=0.3, parent=r), empty('lamp_light', C, loc=(0, 0, 3.7), parent=r)], 'quay')
r = root('mole_segment_10m'); p = Part('mole_segment_mesh'); KH.mole(p, [(-5.0, 0.0), (5.0, 0.0)], width=5.0, top=2.6, seed=3)
export('mole_segment_10m', [r, p.finish(C, ao=0.5, ao_dist=1.5, grad=(-0.8, 3.0, 0.6, 1.03, 1.0), parent=r)], 'quay')
r = root('mole_head'); p = Part('mole_head_mesh'); KH.mole_head(p, (0.0, 0.0), top=2.6, r=4.2)
export('mole_head', [r, p.finish(C, ao=0.5, ao_dist=1.5, grad=(-0.8, 3.0, 0.6, 1.03, 1.0), parent=r),
                     empty('harbour_light', C, loc=KH.LIGHT_POS['mole_light'], parent=r)], 'quay')

# ---------------- hulls (family x class x state); node contract: hull_rig, sails, empties
HULLS = [('usd_sloop', 'small', 'brand_usdc', 1), ('usd_sloop', 'boat', 'brand_pyusd', 5), ('usd_schooner', 'medium', 'brand_dai', 4),
         ('usd_ship', 'flagship', 'brand_usdt', 0), ('eur_botter', 'medium', 'brand_eurc', 2), ('gold_brig', 'large', 'brand_gold', 3)]
for fam, cls, brand, emb in HULLS:
    for st in ('docked', 'sailing'):
        nm = f'hull_{fam}_{cls}_{st}'
        r = root(nm)
        p, sails, info = KB.boat(nm + '_hull_rig', fam, cls, st, brand=P(brand), emblem=emb, seed=7, tack=1)
        if st == 'docked':
            KB.fenders(p, info['Lh'], info['B'], info['fb'], side=1, n=3)
            KB.fenders(p, info['Lh'], info['B'], info['fb'], side=-1, n=3)
        objs = [r, p.finish(C, ao=0.5, ao_dist=1.0, parent=r, wn='angle')]
        if sails:
            so = sails.finish(C, parent=r); so['emblem'] = float(emb); objs.append(so)
        for k, (kind, lp_) in enumerate(info['lights']):
            objs.append(empty(f'{kind}_light_{k}', C, loc=lp_, parent=r))
        for k, c in enumerate(info['cleats']):
            objs.append(empty(('bow' if c.x > 0 else 'stern') + '_cleat', C, loc=c, parent=r))
        objs.append(empty('wake_origin', C, loc=(-info['Lh'] * 0.45, 0, 0), parent=r))
        r['loa_m'] = info['Lh']; r['beam_m'] = info['B']; r['family'] = fam; r['class'] = cls
        export(nm, objs, 'hull')

# ---------------- props + vegetation
def prop(nm, fn, family='prop', **fin):
    r = root(nm); p = Part(nm + '_mesh'); extra = fn(p)
    kw = dict(ao=0.4, parent=r); kw.update(fin)
    export(nm, [r, p.finish(C, **kw)], family)


prop('barrel', lambda p: KT.barrel(p, (0, 0, 0)))
prop('crate', lambda p: KT.crate(p, (0, 0, 0)))
prop('net_rack', lambda p: KT.net_rack(p, (0, 0, 0), seed=1))
prop('lobster_pots', lambda p: KT.lobster_pots(p, (0, 0, 0), n=3))
prop('rowboat', lambda p: KT.rowboat(p, (0, 0, 0)))
prop('bench', lambda p: KT.bench(p, (0, 0, 0)))
for nm, kind, h in (('tree_round', 'round', 6.5), ('tree_cypress', 'cypress', 8.0), ('bush', 'bush', 1.0)):
    r = root(nm); tp, sph = KT.tree(nm + '_mesh', kind, h=h, seed=3)
    export(nm, [r, tp.finish(C, sphere_normals=sph, ao=0.5, ground=0.0, parent=r)], 'vegetation')
r = root('hedge_6m'); hp, sph = KT.hedge('hedge_mesh', 6.0, seed=2)
export('hedge_6m', [r, hp.finish(C, sphere_normals=sph, ao=0.4, ground=0.0, parent=r)], 'vegetation')

json.dump(STATS, open(os.path.join(OUT, 'kit-stats.json'), 'w'), indent=1)
fam = {}
for k, v in STATS.items():
    fam.setdefault(v['family'], []).append((k, v['triangles']))
for f, items in fam.items():
    print('KIT', f, items)
