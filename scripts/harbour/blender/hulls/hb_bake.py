"""BVHTree E15 per-corner ambient occlusion baker for harbour hulls and props (Seam S-5).

Casts cosine-weighted hemisphere rays strictly against static boat geometry (hull, deck, mast — or buoy
for mooring buoys), excluding moving sails, yards, oars, flags, rigging, lanterns, windows, and mutually
exclusive docked-diversity modules (_PAINT >= 19.5). Exports a per-corner FLOAT attribute named `_AO` in
[0.35, 1.0] WITHOUT modifying COLOR_0.rgb (keeps livery repainting, _BRAND and PBR metal classification pure).
"""
import math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

STATIC_OCCLUDERS = frozenset({'hull', 'deck', 'mast', 'buoy'})
AO_TARGETS = frozenset({'hull', 'deck', 'mast', 'buoy'})


def _cosine_hemisphere(samples):
    """Deterministic stratified Fibonacci cosine-weighted unit hemisphere directions (+Z up)."""
    phi = math.pi * (3.0 - math.sqrt(5.0))
    dirs = []
    for i in range(samples):
        u = (i + 0.5) / samples
        r = math.sqrt(u)
        z = math.sqrt(max(0.0, 1.0 - u))
        a = phi * i
        dirs.append((r * math.cos(a), r * math.sin(a), z))
    return dirs


_DIRS_CACHE = {}


def _get_dirs(samples):
    d = _DIRS_CACHE.get(samples)
    if d is None:
        d = _cosine_hemisphere(samples)
        _DIRS_CACHE[samples] = d
    return d


def _base_name(ob):
    return ob.name.split('.')[0]


def _local_to_root(ob, root):
    """Transform from ob's local space to root's local space (handles _heel parent)."""
    m = Matrix.Identity(4)
    cur = ob
    while cur is not None and cur != root:
        m = cur.matrix_local @ m
        cur = cur.parent
    return m


def _descendants(root):
    out = [root]
    for c in root.children:
        out.extend(_descendants(c))
    return out


def _build_bvh(root):
    """Build one triangulated BVHTree over static hull/deck/mast faces, skipping _PAINT >= 19.5 modules."""
    verts = []
    tris = []
    for ob in _descendants(root):
        if ob.type != 'MESH' or _base_name(ob) not in STATIC_OCCLUDERS:
            continue
        me = ob.data
        m = _local_to_root(ob, root)
        paint_attr = me.attributes.get('_PAINT')
        paint_vals = None
        if paint_attr is not None and paint_attr.domain == 'CORNER':
            paint_vals = [0.0] * len(me.loops)
            paint_attr.data.foreach_get('value', paint_vals)

        base = len(verts)
        for v in me.vertices:
            verts.append(m @ v.co)
        me.calc_loop_triangles()
        for lt in me.loop_triangles:
            if paint_vals is not None:
                # Mutually-exclusive docked diversity modules (_PAINT 20/21/22) must not cast shadows
                # onto the shared deck or onto each other.
                if any(paint_vals[li] >= 19.5 for li in lt.loops):
                    continue
            tris.append((base + lt.vertices[0], base + lt.vertices[1], base + lt.vertices[2]))
    if not tris:
        return None
    return BVHTree.FromPolygons(verts, tris, all_triangles=True)


def _tangent_basis(n):
    up = Vector((0.0, 0.0, 1.0)) if abs(n.z) < 0.9 else Vector((1.0, 0.0, 0.0))
    t = up.cross(n).normalized()
    b = n.cross(t)
    return t, b


def bake_boat_ao(root, samples=48, distance=3.5, offset=0.02, ao_min=0.35):
    """Bake E15 per-corner `_AO` in [ao_min, 1.0] onto static hull/deck/mast meshes under `root`."""
    bvh = _build_bvh(root)
    if bvh is None:
        return {}
    dirs = _get_dirs(samples)
    inv_n = 1.0 / samples
    inv_d = 1.0 / max(distance, 1e-4)
    ao_span = 1.0 - ao_min
    ray_cast = bvh.ray_cast
    stats = {}

    for ob in _descendants(root):
        if ob.type != 'MESH' or _base_name(ob) not in AO_TARGETS:
            continue
        me = ob.data
        n_loops = len(me.loops)
        if n_loops == 0:
            continue
        m = _local_to_root(ob, root)
        m3 = m.to_3x3()
        v_world = [m @ v.co for v in me.vertices]
        vn_world = [(m3 @ v.normal).normalized() for v in me.vertices]

        # Cache raycasts by quantized (origin, normal) so shared smooth corners cast once
        cache = {}
        ao_buf = [1.0] * n_loops
        lo_v, hi_v, acc_v = 1.0, 0.0, 0.0

        for poly in me.polygons:
            p_nrm = (m3 @ poly.normal)
            if p_nrm.length_squared < 1e-12:
                continue
            p_nrm.normalize()
            verts_p = [v_world[me.loops[li].vertex_index] for li in poly.loop_indices]
            center = sum(verts_p, Vector()) / len(verts_p)
            use_smooth = poly.use_smooth

            for li, vp in zip(poly.loop_indices, verts_p):
                if use_smooth:
                    n = vn_world[me.loops[li].vertex_index]
                    if n.dot(p_nrm) < 0.2:
                        n = p_nrm
                    # Pull slightly toward polygon center so crease corners don't self-hit adjacent walls
                    org = vp.lerp(center, 0.08) + n * offset
                else:
                    n = p_nrm
                    org = vp.lerp(center, 0.14) + n * offset

                key = (round(org.x * 100), round(org.y * 100), round(org.z * 100),
                       round(n.x * 20), round(n.y * 20), round(n.z * 20))
                val = cache.get(key)
                if val is None:
                    t, b = _tangent_basis(n)
                    tx, ty, tz = t.x, t.y, t.z
                    bx, by, bz = b.x, b.y, b.z
                    nx, ny, nz = n.x, n.y, n.z
                    occ = 0.0
                    for dx, dy, dz in dirs:
                        rd = Vector((tx * dx + bx * dy + nx * dz,
                                     ty * dx + by * dy + ny * dz,
                                     tz * dx + bz * dy + nz * dz))
                        loc, _hn, _hi, dist = ray_cast(org, rd, distance)
                        if loc is not None:
                            u = dist * inv_d
                            occ += 1.0 - u * u
                    raw = max(ao_min, min(1.0, 1.0 - ao_span * occ * inv_n))
                    # Quantize gently to 1/64 steps (0.0156): visually identical, compresses ~2x tighter in meshopt+Brotli
                    val = max(ao_min, min(1.0, round(raw * 64.0) / 64.0))
                    cache[key] = val
                ao_buf[li] = val
                if val < lo_v:
                    lo_v = val
                if val > hi_v:
                    hi_v = val
                acc_v += val

        attr = me.attributes.get('_AO')
        if attr is None:
            attr = me.attributes.new('_AO', 'FLOAT', 'CORNER')
        attr.data.foreach_set('value', ao_buf)
        stats[_base_name(ob)] = (round(lo_v, 3), round(acc_v / n_loops, 3), round(hi_v, 3))
    return stats
