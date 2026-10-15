"""Classical-town kit on the island side (PLAN P1/P4): build with the civic cv_lib primitives into a cv_lib.Kit (one hb_lib
MB per material), then kit_objects() turns the Kit into island objects (M['kit'] / M['window'] / M['lamp']) carrying the
island's `family` tag, so the P4 houses share the civic vocabulary. Both kits build fronts toward -y.

    import nl_classical as cl
    K = cl.cv.Kit(seed)
    cl.cv.tiled_hip(K.op, ...); cl.cv.plain_window(K, ...); top = cl.cv.flue(K.op, ...)
    cl.kit_objects(K, name, root, family='house'); root['chimney_top'] = tuple(top)

The island export has no hb_cover / hb_crest role: cover cloth becomes kit faces (shade x `cover`), and a Kit with crest
faces is refused.
"""
import os, sys
import bmesh
from nl_common import M, obj, PAL

_CIVIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'civic')
if _CIVIC not in sys.path:
    sys.path.append(_CIVIC)     # appended: civic/ and hulls/ also hold an export.py / lineup.py
import cv_lib as cv


def _bmesh(mb):
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in mb.v]
    faces = []
    for f in mb.f:
        try:
            bm.faces.new([vs[i] for i in f['i']])
        except ValueError:      # a duplicate face: drop it, keep colours aligned
            continue
        faces.append(f)
    return bm, faces


def _make(mb, name, root, family, mat=None, shade=None):
    bm, faces = _bmesh(mb)
    cols = [((tuple(c * s for c, s in zip(f['col'], shade)) if shade else f['col']), f['pat']) for f in faces]
    return obj(name, bm, face=lambda poly: cols[poly.index], jitter=0.0, mat=mat, parent=root, family=family)


def kit_objects(K, name, root, family='house', cover=None):
    """Emit a cv_lib.Kit under root: <name>_kit (opaque), <name>_glass (hb_window, COLOR_0 = lit, warm, kind),
    <name>_lamps (glow), <name>_cloth (velaria as kit faces in `cover`, default linen)."""
    if K.crest.f:
        raise ValueError('island kit objects cannot carry hb_crest faces')
    out = {}
    if K.op.f:
        out['op'] = _make(K.op, name + '_kit', root, family)
    if K.win.f:
        out['win'] = _make(K.win, name + '_glass', root, family, M['window'])
    if K.em.f:
        out['em'] = _make(K.em, name + '_lamps', root, family, M.get('lamp', M['kit']))
    if K.cover.f:
        out['cover'] = _make(K.cover, name + '_cloth', root, family, shade=cover or PAL['linen'])
    return out
