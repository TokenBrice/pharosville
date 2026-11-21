"""Seam S-5: fast BVHTree cosine-hemisphere E15 _AO bake for Titan flagships.

Strictly bakes static hull/deck/mast meshes (excluding moving sails, yards, oars, flags,
rigging, booms, gaffs, windows, lamps) into a per-corner FLOAT attribute named `_AO` in
[0.35, 1.0] WITHOUT touching `Col` (`COLOR_0.rgb`), preserving PBR gilt/silver/bronze
detection in `metal.ts` and livery compatibility.
"""
import math
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from hb_lib import descendants

STATIC_AO_NODES = frozenset({'hull', 'deck', 'mast'})


def _hemisphere_rays(samples):
    """Cosine-weighted Fibonacci hemisphere directions in tangent space (+z = normal)."""
    ga = math.pi * (3.0 - math.sqrt(5.0))
    rays = []
    for i in range(samples):
        u = (i + 0.5) / samples
        r = math.sqrt(u)
        th = i * ga
        rays.append(Vector((r * math.cos(th), r * math.sin(th), math.sqrt(max(0.0, 1.0 - u)))))
    return rays


def bake_titan_ao(root, samples=48, distance=3.5, offset=0.02, min_ao=0.35, verbose=False):
    """Raycast cosine-hemisphere AO over static hull/deck/mast and write corner attribute `_AO`.

    Quantizes `_AO` to 1/32 steps so open exterior faces stay welded (ao == 1.0) and meshopt +
    Brotli compress the attribute cleanly. Never alters `Col` (`COLOR_0`).
    """
    bpy.context.view_layer.update()
    static_objs = []
    for o in descendants(root):
        if o.type != 'MESH':
            continue
        base = o.name.split('.')[0]
        if base in STATIC_AO_NODES and o.data.materials and o.data.materials[0].name == 'hb_opaque':
            if len(o.data.polygons) > 0:
                static_objs.append(o)
    if not static_objs:
        return {}

    # Build one world-space BVHTree strictly from static hull/deck/mast geometry.
    allbm = bmesh.new()
    for o in static_objs:
        m_ = o.data.copy()
        m_.transform(o.matrix_world)
        allbm.from_mesh(m_)
        bpy.data.meshes.remove(m_)
    bvh = BVHTree.FromBMesh(allbm)
    allbm.free()

    hemi = _hemisphere_rays(samples)
    strength = 1.0 - min_ao
    inv_samples = 1.0 / samples
    stats = {}

    for o in static_objs:
        me = o.data
        mw = o.matrix_world
        nm = mw.to_3x3().inverted_safe().transposed()
        ao_loops = np.ones(len(me.loops), dtype=np.float32)
        face_aos = []
        for poly in me.polygons:
            n = nm @ poly.normal
            if n.length < 1e-4:
                ao = 1.0
            else:
                n.normalize()
                p0 = mw @ poly.center + n * offset
                t = n.orthogonal().normalized()
                b = n.cross(t)
                hits = 0
                for d in hemi:
                    rd = t * d.x + b * d.y + n * d.z
                    if bvh.ray_cast(p0, rd, distance)[0] is not None:
                        hits += 1
                occ = hits * inv_samples
                ao = max(min_ao, min(1.0, 1.0 - strength * occ))
                # Quantize to 1/32 steps (keeps open 1.0 faces unified for meshopt/Brotli).
                ao = round(ao * 32.0) / 32.0
                ao = max(min_ao, min(1.0, ao))
            face_aos.append(ao)
            ao_loops[list(poly.loop_indices)] = ao

        if '_AO' in me.attributes:
            me.attributes.remove(me.attributes['_AO'])
        attr = me.attributes.new('_AO', 'FLOAT', 'CORNER')
        attr.data.foreach_set('value', ao_loops)
        mean_ao = float(np.mean(face_aos)) if face_aos else 1.0
        min_v = float(np.min(face_aos)) if face_aos else 1.0
        stats[o.name] = (round(mean_ao, 3), round(min_v, 3))
        if verbose:
            print(f'  AO {root.name}/{o.name}: mean={mean_ao:.3f} min={min_v:.3f}')

    return stats
