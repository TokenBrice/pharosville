"""E15 for the Pharos: ambient occlusion baked into the kit's vertex colour (COLOR_0 rgb), the island's method
(island/hb_export.py bake_ao) on the tower's opaque meshes only. COLOR_0 alpha (the pattern id) is preserved; the
windows, the fire, the mirror (it turns) and anything not hb_opaque are excluded. Zero runtime cost.

Cycles on the CPU by default: the GPU is shared with the real-GPU capture browser, and a ~20k-triangle bake is a
few seconds of CPU.
"""
import bpy
import numpy as np


def bake_ao(objs, distance=5.0, samples=48, strength=0.65, device='CPU', max_area=8.0, max_edge=6.0, metal=0.5):
    """Multiply each object's 'Col' rgb by 1 - strength * (1 - occlusion) within `distance` m. Returns
    {name: mean occlusion}.

    Per-corner AO only reads where the mesh is dense enough to carry it: on a big flat polygon (a floor, a 30 m wall
    piece, a long reveal) the four corners' occlusion would be smeared across the whole face as blotches. So the
    sculpted scale gets the bake (figures, mouldings, dentils, quoins, columns, sills, the dome) and polygons over
    `max_area` m2 or with an edge over `max_edge` m keep their authored value (the colour ladder carries them).
    Metal (pattern 12: bronze, gilt) takes `metal` x the strength: it catches the light rather than holding shade."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = device
    if device == 'CPU':
        try:
            bpy.context.preferences.addons['cycles'].preferences.compute_device_type = 'NONE'
        except Exception:
            pass
    scene.cycles.samples = samples
    if scene.world is None:
        scene.world = bpy.data.worlds.new('bakeW')
    scene.world.light_settings.distance = distance
    out = {}
    for o in objs:
        me = o.data
        if not len(me.polygons):
            continue
        ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = ao
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', margin=0)
        n = len(me.loops)
        a = np.zeros(n * 4, np.float32)
        ao.data.foreach_get('color', a)
        a = a.reshape(-1, 4)
        c = np.zeros(n * 4, np.float32)
        col = me.color_attributes['Col']
        col.data.foreach_get('color', c)
        c = c.reshape(-1, 4)
        occ = np.clip(a[:, 0], 0, 1)
        if not occ.any():
            raise RuntimeError(f'AO bake returned nothing for {o.name}')
        for poly in me.polygons:
            vs = [me.vertices[i].co for i in poly.vertices]
            edge = max((vs[i] - vs[i - 1]).length for i in range(len(vs)))
            if poly.area > max_area or edge > max_edge:
                occ[list(poly.loop_indices)] = 1.0
        k = np.where(np.abs(c[:, 3] * 16.0 - 12.0) < 0.25, strength * metal, strength)
        c[:, :3] *= (1.0 - k * (1.0 - occ))[:, None]
        col.data.foreach_set('color', c.ravel())
        me.color_attributes.remove(me.color_attributes['AO'])
        me.color_attributes.active_color = me.color_attributes['Col']
        out[o.name] = round(float(occ.mean()), 3)
    return out
