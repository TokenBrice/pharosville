"""Export the style-B kit as GLBs (named nodes, vertex colours 'Col' -> COLOR_0, UVMap, material slot names).

Outline shells are a runtime pass (inverted hull in the vertex shader), so the solidify modifier is disabled
for export. Each asset is exported at the origin; children keep their names (e.g. lighthouse/lens).
"""
import bpy, os, json
from mathutils import Matrix


def tris(ob):
    me = ob.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def export_one(ob, path):
    bpy.ops.object.select_all(action='DESELECT')
    stack = [ob]
    sel = []
    while stack:
        o = stack.pop()
        sel.append(o)
        stack.extend(o.children)
    saved = (ob.location.copy(), ob.rotation_euler.copy(), ob.scale.copy(), ob.parent)
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    ob.scale = (1, 1, 1)
    mods = []
    for o in sel:
        o.select_set(True)
        for m in o.modifiers:
            if m.name == 'ink':
                mods.append((m, m.show_viewport, m.show_render))
                m.show_viewport = False
                m.show_render = False
    bpy.context.view_layer.objects.active = ob
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
                              export_extras=True, export_materials='EXPORT')
    for m, v, r in mods:
        m.show_viewport, m.show_render = v, r
    ob.location, ob.rotation_euler, ob.scale = saved[0], saved[1], saved[2]
    return sum(tris(o) for o in sel if o.type == 'MESH')


def run(W, outdir):
    os.makedirs(outdir, exist_ok=True)
    S = bpy.context.scene.objects
    import kit
    picks = {
        'lighthouse': 'lighthouse', 'keepers_cottage': 'keepers_cottage', 'oil_store': 'oil_store',
        'signal_mast': 'signal_mast', 'beacon': 'beacon',
        'pier_main_4m': 'pier_main_4m', 'pier_head_4m': 'pier_head_4m', 'pier_finger_4m': 'pier_finger_4m',
        'bollard': 'bollard', 'lamp_post': 'lamp_post',
        'crate': 'crate_0', 'barrel': 'barrel_0', 'net_rack': 'net_rack', 'dinghy': 'dinghy_0', 'bench': 'bench',
        'lobster_pots': 'pots', 'tree_round': 'round_0', 'tree_cypress': 'cypress_1',
    }
    for h in W.houses:
        picks[h.name] = h.name
    for h in W.hull_obs:
        picks[h.name] = h.name
    # standalone quay pieces (the scene quay is one continuous run built from the same recipe)
    q1 = kit.quay_block('quay_straight_8m', 8.0, 5.0)
    q2 = kit.quay_block('quay_steps_8m', 8.0, 5.0, steps=True)
    picks['quay_straight_8m'] = q1.name
    picks['quay_steps_8m'] = q2.name
    manifest = {}
    for name, obname in picks.items():
        ob = S.get(obname)
        if ob is None:
            print('EXPORT missing', obname)
            continue
        n = export_one(ob, os.path.join(outdir, name + '.glb'))
        manifest[name] = dict(triangles=n, family=ob.get('family', ''), file=name + '.glb')
        print('EXPORT', name, n)
    for o in (q1, q2):
        bpy.data.objects.remove(o, do_unlink=True)
    with open(os.path.join(outdir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
