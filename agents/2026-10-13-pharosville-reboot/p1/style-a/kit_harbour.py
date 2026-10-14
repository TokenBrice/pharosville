"""Harbour kit: the Pharos lighthouse (D8), oil store, signal mast, quay pieces, pier modules, mole.
All builders take a Part and an offset so the same code makes the GLB kit (at origin) and the scene."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise
from lib import *
from kit_town import MAS, MAS_SOFT, COB, TILE, PLANK, FOL, GRASS, ROCK, NONE, WIN, LAMP1, blob_cluster

LIGHT_POS = {}   # named emitters for the scene (lamp light positions)


def _ring_poly(r, n, z, rot=0.0):
    return [(r * math.cos(rot + 2 * math.pi * i / n), r * math.sin(rot + 2 * math.pi * i / n), z) for i in range(n)]


def loft(rings, cap_top=False, cap_bot=False):
    """rings: list of [(x,y,z)...] with equal counts."""
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_top:
        bm.faces.new(vs[-1])
    if cap_bot:
        bm.faces.new(vs[0][::-1])
    return bm


# ------------------------------------------------------------------ lighthouse
def lighthouse(p, at=(0, 0, 0), stair=True, lens=None):
    """Grey-stone Pharos. Square base 0-4.6, octagonal shaft to 14.6, round shaft to 19.6,
    corbelled gallery, glazed lantern with Fresnel lens, brass dome. Front (-y)."""
    ox, oy, oz = at
    O = Vector(at)
    g, glt, gdk = P('stone_grey'), P('stone_grey_lt'), P('stone_grey_dk')
    rng = random.Random(11)

    def A(bm, c, pat=MAS, pat1=NONE, mat='toon', smooth=False, drift=0.04, uv=None):
        xform(bm, loc=O)
        p.add(bm, c, pat, pat1, mat=mat, smooth=smooth, drift=drift, uv=uv)
    # --- plinth + square base (battered: slightly wider at the foot)
    A(bm_box(9.0, 9.0, 1.2, (0, 0, -0.4), bevel=0.1, seg=1), gdk, MAS)
    base = loft([[(sx * 3.9, sy * 3.9, 0.2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))],
                 [(sx * 3.6, sy * 3.6, 4.4) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]], cap_top=True)
    A(base, g, MAS, drift=0.02)
    # quoins on the base corners
    for k in range(9):
        z = 0.45 + k * 0.45
        t = (z - 0.2) / 4.2
        hw = 3.9 - 0.3 * t
        Lq = 0.75 if k % 2 == 0 else 0.45
        for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            A(bm_box(Lq if k % 2 == 0 else 0.45, 0.45 if k % 2 == 0 else Lq, 0.4,
                     (sx * (hw - (Lq if k % 2 == 0 else 0.45) / 2 + 0.06), sy * (hw - (0.45 if k % 2 == 0 else Lq) / 2 + 0.06), z),
                     bevel=0.04, seg=1), glt, MAS_SOFT, drift=0.07)
    # cornice
    A(bm_box(7.7, 7.7, 0.35, (0, 0, 4.5), bevel=0.08, seg=1), glt, NONE)
    A(bm_box(7.3, 7.3, 0.25, (0, 0, 4.8)), gdk, NONE)
    # door (front) with arched stone surround, up a keeper's stair along the front face
    dz = 1.9
    A(bm_box(1.7, 0.3, 2.6, (-1.2, -3.72, dz + 1.25)), glt, MAS_SOFT)
    arch = bm_cyl(0.85, 0.85, 0.3, 10, (0, 0, 0)); xform(arch, rx=math.pi / 2); xform(arch, loc=(-1.2, -3.57 + 0.0, dz + 2.45))
    A(arch, glt, NONE)
    A(bm_box(1.1, 0.12, 2.1, (-1.2, -3.9, dz + 1.05)), P('shutter_teal'), NONE)
    if stair:
        # landing + steps descending toward +x along the front face, with a parapet
        A(bm_box(2.4, 1.5, 0.3, (-1.2, -4.5, dz - 0.15)), glt, MAS_SOFT)
        A(bm_box(2.4, 1.5, dz - 0.3, (-1.2, -4.5, (dz - 0.3) / 2)), g, MAS)
        n = 7
        for i in range(n):
            zt = dz - (i + 1) * dz / (n + 1)
            x0 = 0.0 + i * 0.42
            A(bm_box(0.44, 1.4, zt, (x0 + 0.2, -4.45, zt / 2)), glt if True else g, MAS_SOFT, drift=0.06)
        # parapet along the outer edge of the stair
        A(bm_box(3.6, 0.28, 0.65, (1.25, -5.1, dz * 0.55 + 0.1), bevel=0.05, seg=1), g, MAS)
        A(bm_box(0.3, 1.4, 0.65, (-2.45, -4.5, dz + 0.3), bevel=0.05, seg=1), g, MAS)
        LIGHT_POS.setdefault('door', []).append((O + Vector((-0.2, -4.4, dz + 2.6))))
        # door lantern
        A(bm_box(0.26, 0.26, 0.38, (-0.1, -4.0, dz + 2.7)), P('lamp_gold'), NONE, LAMP1)
        A(bm_cyl(0.24, 0.03, 0.2, 4, (-0.1, -4.0, dz + 2.9)), P('iron'), NONE)
    # small barred windows in the base
    for (x, y, rz) in ((1.6, -3.66, 0), (-3.66, 0.6, -math.pi / 2), (-3.66, -1.8, -math.pi / 2)):
        for bm, c, pt1 in ((bm_box(0.8, 0.14, 1.0, (0, 0, 0)), glt, NONE), (bm_box(0.56, 0.1, 0.76, (0, -0.06, 0)), lin('#2C3644'), WIN(True))):
            xform(bm, rz=rz); xform(bm, loc=(x, y, 2.6)); A(bm, c, NONE, pt1)
    # --- octagonal shaft 4.9 -> 14.6, gently tapered, with bevelled arrises
    rings = []
    for z, r in ((4.9, 3.05), (14.6, 2.55)):
        rings.append(_ring_poly(r, 8, z, math.pi / 8))
    sh = loft(rings)
    A(sh, g, MAS, drift=0.02)
    # arris stones (protruding corner strips) on the octagon
    for i in range(8):
        a = math.pi / 8 + 2 * math.pi * i / 8
        for k in range(16):
            z = 5.1 + k * 0.6
            t = (z - 4.9) / 9.7
            r = 3.05 - 0.5 * t + 0.03
            bm = bm_box(0.42 if k % 2 == 0 else 0.3, 0.32, 0.28, (0, 0, 0), bevel=0.03, seg=1)
            xform(bm, rz=a); xform(bm, loc=(r * math.cos(a), r * math.sin(a), z))
            A(bm, glt, MAS_SOFT, drift=0.06)
    # string courses
    for z, r in ((9.8, 2.88), (14.6, 2.62)):
        bm = loft([_ring_poly(r + 0.12, 8, z - 0.15, math.pi / 8), _ring_poly(r + 0.12, 8, z + 0.15, math.pi / 8)], True, True)
        A(bm, glt, NONE)
    # slit windows spiralling up (front + side faces)
    for k, (z, fi) in enumerate(((6.4, 6), (8.4, 5), (11.2, 6), (13.0, 4), (7.6, 4), (12.2, 5))):
        a = 2 * math.pi * fi / 8 + math.pi / 8 * 0 + math.pi / 8 - math.pi / 8
        a = 2 * math.pi * fi / 8
        t = (z - 4.9) / 9.7
        r = (3.05 - 0.5 * t) * math.cos(math.pi / 8) + 0.02
        for bm, c, pt1 in ((bm_box(0.18, 0.62, 1.15, (0, 0, 0)), glt, NONE), (bm_box(0.1, 0.36, 0.9, (0.05, 0, 0)), lin('#2C3644'), WIN(True))):
            xform(bm, rz=a); xform(bm, loc=(r * math.cos(a), r * math.sin(a), z)); A(bm, c, NONE, pt1)
    # --- round upper shaft 14.75 -> 19.6
    rings = [_ring_poly(2.45, 24, 14.75), _ring_poly(2.25, 24, 19.6)]
    A(loft(rings), g, MAS, smooth=True, drift=0.02)
    A(loft([_ring_poly(2.5, 24, 17.2), _ring_poly(2.5, 24, 17.45)], True, True), glt, NONE, smooth=True)
    # two small windows in the round shaft
    for a, z in ((-math.pi / 2, 16.2), (math.pi, 18.3)):
        for bm, c, pt1 in ((bm_box(0.2, 0.7, 1.0, (0, 0, 0)), glt, NONE), (bm_box(0.1, 0.46, 0.76, (0.06, 0, 0)), lin('#2C3644'), WIN(True))):
            xform(bm, rz=a); xform(bm, loc=(2.37 * math.cos(a), 2.37 * math.sin(a), z)); A(bm, c, NONE, pt1)
    # --- corbels + gallery
    for i in range(16):
        a = 2 * math.pi * i / 16
        bm = bm_box(0.9, 0.36, 0.5, (0, 0, 0), bevel=0.04, seg=1)
        for v in bm.verts:
            if v.co.z < 0 and v.co.x > 0:
                v.co.x -= 0.45
        xform(bm, rz=a); xform(bm, loc=(2.55 * math.cos(a), 2.55 * math.sin(a), 19.35))
        A(bm, glt, NONE, drift=0.05)
    gal = loft([_ring_poly(3.15, 24, 19.6), _ring_poly(3.15, 24, 19.92)], True, True)
    A(gal, glt, NONE, smooth=False)
    # railing: posts + two rails (iron)
    for i in range(24):
        a = 2 * math.pi * i / 24
        A(bm_box(0.06, 0.06, 1.05, (3.0 * math.cos(a), 3.0 * math.sin(a), 20.45)), P('iron'), NONE)
    for z in (20.55, 20.98):
        pts = [(3.0 * math.cos(2 * math.pi * i / 24), 3.0 * math.sin(2 * math.pi * i / 24), z) for i in range(25)]
        A(bm_tube(pts, 0.045, 4), P('iron'), NONE)
    # --- lantern room: low iron parapet, glazing, mullions, lens, dome
    A(loft([_ring_poly(1.85, 12, 19.92), _ring_poly(1.85, 12, 20.7)], True, False), P('iron'), NONE)
    A(loft([_ring_poly(1.92, 12, 20.65), _ring_poly(1.92, 12, 20.8)], True, True), P('iron', 1.4), NONE)
    glaze = loft([_ring_poly(1.72, 12, 20.8), _ring_poly(1.72, 12, 22.75)])
    A(glaze, lin('#8FA7B5'), NONE, mat='glass')
    for i in range(12):
        a = 2 * math.pi * i / 12
        A(bm_box(0.07, 0.07, 2.0, (1.74 * math.cos(a), 1.74 * math.sin(a), 21.78)), P('iron'), NONE)
    A(loft([_ring_poly(1.76, 12, 21.72), _ring_poly(1.76, 12, 21.8)]), P('iron'), NONE)
    # Fresnel lens: stacked prism rings (lens material)
    lens_rings = []
    for k, (z, r) in enumerate(((20.9, 0.55), (21.15, 0.82), (21.5, 0.95), (21.8, 0.95), (22.15, 0.82), (22.45, 0.5))):
        lens_rings.append(_ring_poly(r, 12, z))
    lb = loft(lens_rings, True, True); xform(lb, loc=O)
    (lens or p).add(lb, (1, 1, 1), NONE, mat='lens', smooth=True)
    A(bm_cyl(0.5, 0.6, 0.3, 8, (0, 0, 20.7)), P('brass'), NONE, mat='brass')
    LIGHT_POS['lantern'] = O + Vector((0, 0, 21.7))
    # cornice ring + brass dome + ventilator + finial + vane
    A(loft([_ring_poly(2.0, 16, 22.75), _ring_poly(2.05, 16, 22.95)], True, True), P('iron'), NONE)
    dome = []
    for k in range(7):
        t = k / 6
        r = 2.0 * math.cos(t * math.pi / 2) ** 0.9 + 0.02
        dome.append(_ring_poly(max(r, 0.18), 16, 22.95 + 1.35 * math.sin(t * math.pi / 2)))
    A(loft(dome, True, False), P('brass'), NONE, mat='brass', smooth=True)
    A(bm_uvsphere(0.32, 10, 6, at=(0, 0, 24.5)), P('brass'), NONE, mat='brass', smooth=True)
    A(bm_cyl(0.04, 0.02, 1.2, 5, (0, 0, 24.7)), P('iron'), NONE)
    vane = bm_box(0.7, 0.04, 0.25, (0.2, 0, 25.6)); A(vane, P('iron'), NONE)
    return p


# ------------------------------------------------------------------ oil store + signal mast
def oil_store(p, at=(0, 0, 0), rz=0.0):
    O = Vector(at)

    def A(bm, c, pat=MAS, pat1=NONE, smooth=False, uv=None, mat='toon'):
        xform(bm, rz=rz); xform(bm, loc=O)
        p.add(bm, c, pat, pat1, smooth=smooth, uv=uv, mat=mat)
    A(bm_box(4.4, 3.4, 0.6, (0, 0, -0.1), bevel=0.05, seg=1), P('stone_grey_dk'))
    A(bm_box(4.0, 3.0, 2.6, (0, 0, 1.4), bevel=0.08, seg=2), P('stone_grey'), MAS)
    # barrel-vault roof, slate
    vault = bmesh.new()
    n = 8; rings = []
    for x in (-2.3, 2.3):
        ring = []
        for i in range(n + 1):
            a = math.pi * i / n
            ring.append(vault.verts.new((x, 1.75 * math.cos(a), 2.6 + 1.0 * math.sin(a))))
        rings.append(ring)
    for i in range(n):
        vault.faces.new((rings[0][i], rings[0][i + 1], rings[1][i + 1], rings[1][i]))
    bmesh.ops.solidify(vault, geom=list(vault.faces), thickness=-0.18)
    A(vault, P('roof_slate'), TILE, smooth=True, uv=lambda co, f: (co.x, abs(math.atan2(co.z - 2.6, co.y)) * 1.8))
    for sx in (-1, 1):
        g = bmesh.new()
        pts = [(sx * 2.0, 1.5 * math.cos(math.pi * i / n), 2.6 + 0.85 * math.sin(math.pi * i / n)) for i in range(n + 1)]
        vs = [g.verts.new(q) for q in pts]
        g.faces.new(vs if sx > 0 else vs[::-1])
        A(g, P('stone_grey'), MAS)
    A(bm_box(0.12, 1.1, 1.9, (-2.05, 0, 1.15)), P('iron', 1.2), NONE)        # iron door on the -x end
    A(bm_box(0.2, 1.4, 0.2, (-2.07, 0, 2.2)), P('stone_grey_lt'), NONE)
    from kit_town import barrel
    for k, (x, y) in enumerate(((-2.8, 1.0), (-2.9, 1.7), (-2.5, -1.3))):
        q = Part('_tmp'); barrel(q, (0, 0, 0), seed=k)
        bm = q.bm
        # barrels are added directly into p (keep colours): re-add with transform
        xform(bm, loc=(x, y, 0)); xform(bm, rz=rz); xform(bm, loc=O)
        me = bpy.data.meshes.new('_b'); bm.to_mesh(me); bm.free()
        nb = bmesh.new(); nb.from_mesh(me); bpy.data.meshes.remove(me)
        p.add(nb, P('timber', 0.9), PLANK, smooth=True)
    return p


def signal_mast(p, at=(0, 0, 0), h=13.0, cones=1):
    O = Vector(at)

    def A(bm, c, pat=NONE, pat1=NONE, smooth=False):
        xform(bm, loc=O); p.add(bm, c, pat, pat1, smooth=smooth)
    A(bm_box(1.6, 1.6, 0.5, (0, 0, 0.0), bevel=0.06, seg=1), P('stone_grey_lt'), MAS_SOFT)
    A(bm_cyl(0.2, 0.1, h, 8, (0, 0, 0.2)), P('frame_white'), smooth=True)
    yard = bm_cyl(0.07, 0.07, 6.0, 6); xform(yard, loc=(0, 0, -3.0)); xform(yard, rx=math.pi / 2); xform(yard, loc=(0, 0, h * 0.72))
    A(yard, P('frame_white'), smooth=True)
    gaff = bm_cyl(0.05, 0.05, 3.2, 6); xform(gaff, ry=math.radians(60)); xform(gaff, loc=(0, 0, h * 0.55))
    A(gaff, P('timber_dk'), smooth=True)
    A(bm_uvsphere(0.22, 8, 5, at=(0, 0, h + 0.3)), P('brass'), smooth=True)
    # stays to the ground
    for a in (0.6, 2.7, 4.6):
        A(bm_rod((0, 0, h * 0.9), (6 * math.cos(a), 6 * math.sin(a), 0.1), 0.025, 4), P('iron', 1.3))
    # storm cones (black) on the yard arm + a string of signal flags
    for k in range(cones):
        c = bm_cyl(0.55, 0.0, 0.9, 8, (0, 0, 0)); xform(c, loc=(0, 2.4, h * 0.72 - 1.3 - k * 1.1))
        A(c, P('hull_black'), NONE, smooth=False)
    flags = [('shutter_red', 'flower_yellow'), ('shutter_blue', 'frame_white'), ('flower_yellow', 'shutter_red'), ('frame_white', 'shutter_blue')]
    for k, (c1, c2) in enumerate(flags):
        t = (k + 0.5) / len(flags)
        pz = h * 0.72 - 0.2 - t * (h * 0.72 - 1.5)
        py = -2.8 + t * 1.2
        bm = bm_box(0.04, 0.7, 0.5, (0, py, pz)); A(bm, P(c1))
        bm = bm_box(0.05, 0.35, 0.25, (0.01, py - 0.17, pz + 0.12)); A(bm, P(c2))
    A(bm_tube(catenary((0, -2.95, h * 0.72), (0, -1.0, 1.0), 0.3, 6), 0.015, 3), P('iron', 1.3))
    return p


# ------------------------------------------------------------------ quay
def quay_wall(p, x0, x1, y, top=1.8, base=-3.0, face=-1, rng=None, bollard_every=7.0, cap=True):
    """Stone quay wall along x at y, face toward `face`*y. Masonry face, big cap stones, wet band."""
    rng = rng or random.Random(int(x0 * 7 + y))
    L = x1 - x0
    t = 1.2
    yc = y - face * t / 2
    p.add(bm_box(L, t, top - base, ((x0 + x1) / 2, yc, (top + base) / 2)), P('stone_honey'), MAS, drift=0.02)
    # cap stones
    x = x0
    while cap and x < x1 - 0.05:
        w = min(rng.uniform(1.1, 1.8), x1 - x)
        bm = bm_box(w - 0.04, 1.0, 0.36, (x + w / 2, y - face * 0.42, top + 0.1), bevel=0.07, seg=1)
        jitter(bm, 0.02, int(x * 3))
        p.add(bm, P('stone_honey_lt'), MAS_SOFT, smooth=True, drift=0.07)
        x += w
    # bollards (iron, mushroom) + mooring rings
    x = x0 + bollard_every / 2
    while x < x1:
        bollard(p, (x, y - face * 0.55, top + 0.28))
        x += bollard_every


def bollard(p, at):
    x, y, z = at
    p.add(bm_cyl(0.22, 0.17, 0.5, 10, (x, y, z)), P('iron'), smooth=True)
    p.add(bm_cyl(0.28, 0.28, 0.1, 10, (x, y, z + 0.48)), P('iron'), smooth=True)
    p.add(bm_uvsphere(0.2, 10, 4, at=(x, y, z + 0.58), scale=(1, 1, 0.5)), P('iron'), smooth=True)


def quay_stairs(p, x, y, top=1.8, face=-1, width=1.6, along=1):
    """Steps descending along the wall face to the water (run along x)."""
    n = 8
    for i in range(n):
        zt = top - (i + 1) * (top + 0.4) / n
        x0 = x + along * i * 0.45
        p.add(bm_box(0.47, width, zt + 3.0, (x0 + along * 0.22, y + face * width / 2, (zt - 3.0) / 2)), P('stone_honey_lt'), MAS_SOFT, drift=0.06)


# ------------------------------------------------------------------ piers
def pile(p, x, y, top, base=-3.0, r=0.2):
    bm = bm_cyl(r, r * 0.95, top - base, 7, (x, y, base))
    jitter(bm, 0.02, int(x * 13 + y * 7))
    # vertex-colour band: dark weed below 0.35, timber above (via face colour)
    p.add(bm, None, face_color=lambda f: P('weed') if f.calc_center_median().z < 0.25 else P('pile'), smooth=True)
    p.add(bm_cyl(r * 1.05, r * 0.6, 0.12, 7, (x, y, top)), P('pile', 0.85), smooth=True)


def deck_planks(p, cx, cy, length, width, z, axis='y', seed=0, color='plank', gap=0.04, pw=0.42):
    """Planks laid across the walking direction. axis = walking direction."""
    rng = random.Random(seed)
    n = int(length / pw)
    for i in range(n):
        s = -length / 2 + (i + 0.5) * length / n
        ww = width + rng.uniform(-0.12, 0.12)
        off = rng.uniform(-0.08, 0.08)
        th = 0.09
        if axis == 'y':
            bm = bm_box(ww, length / n - gap, th, (cx + off, cy + s, z + rng.uniform(-0.015, 0.015)))
        else:
            bm = bm_box(length / n - gap, ww, th, (cx + s, cy + off, z + rng.uniform(-0.015, 0.015)))
        xform(bm, loc=(0, 0, 0))
        c = P(color) if rng.random() > 0.25 else P('plank_grey')
        p.add(bm, tint(c, rng.uniform(0.88, 1.08), rng.uniform(-0.5, 0.5)), PLANK, drift=0.02)


def pier_run(p, x0, y0, x1, y1, width, z=1.2, pile_step=3.2, seed=0, piles_both=True, bracing=True, color='plank'):
    """A straight pier from (x0,y0) to (x1,y1) (axis aligned), deck top at z."""
    axis = 'y' if abs(x1 - x0) < 1e-3 else 'x'
    L = abs((y1 - y0) if axis == 'y' else (x1 - x0))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    # stringers
    for s in (-1, 1):
        o = s * (width / 2 - 0.25)
        if axis == 'y':
            p.add(bm_box(0.22, L, 0.3, (cx + o, cy, z - 0.25)), P('timber_dk'))
        else:
            p.add(bm_box(L, 0.22, 0.3, (cx, cy + o, z - 0.25)), P('timber_dk'))
    n = max(1, int(round(L / pile_step)))
    for i in range(n + 1):
        t = -L / 2 + i * L / n
        for s in (-1, 1):
            o = s * (width / 2 + 0.05)
            px, py = (cx + o, cy + t) if axis == 'y' else (cx + t, cy + o)
            pile(p, px, py, z + 0.5 if (i % 2 == 0) else z - 0.05)
        # bearer
        if axis == 'y':
            p.add(bm_box(width + 0.5, 0.26, 0.26, (cx, cy + t, z - 0.48)), P('timber_dk'))
        else:
            p.add(bm_box(0.26, width + 0.5, 0.26, (cx + t, cy, z - 0.48)), P('timber_dk'))
        if bracing and i < n:
            t2 = -L / 2 + (i + 1) * L / n
            for s in (-1, 1):
                o = s * (width / 2 + 0.05)
                if axis == 'y':
                    a, b = (cx + o, cy + t, z - 0.5), (cx + o, cy + t2, -0.6)
                else:
                    a, b = (cx + t, cy + o, z - 0.5), (cx + t2, cy + o, -0.6)
                p.add(bm_rod(a, b, 0.07, 4), P('timber_dk', 0.9))
    deck_planks(p, cx, cy, L, width, z - 0.04, axis=axis, seed=seed, color=color)


def pier_lamp(p, at, h=3.0):
    x, y, z = at
    p.add(bm_box(0.22, 0.22, h, (x, y, z + h / 2)), P('timber_dk'))
    arm = bm_box(0.7, 0.1, 0.1, (x + 0.3, y, z + h - 0.1)); p.add(arm, P('iron'))
    p.add(bm_box(0.34, 0.34, 0.46, (x + 0.6, y, z + h - 0.45)), P('lamp_gold'), NONE, LAMP1)
    p.add(bm_cyl(0.32, 0.04, 0.24, 4, (x + 0.6, y, z + h - 0.22)), P('iron'))
    LIGHT_POS.setdefault('pier', []).append(Vector((x + 0.6, y, z + h - 0.5)))


def cleat(p, at, rz=0.0):
    bm = bm_box(0.5, 0.12, 0.1, (0, 0, 0.14)); xform(bm, loc=at, rz=rz); p.add(bm, P('iron'))
    bm = bm_box(0.12, 0.12, 0.14, (0, 0, 0.05)); xform(bm, loc=at, rz=rz); p.add(bm, P('iron'))


def coil(p, at, r=0.35):
    pts = []
    for i in range(25):
        a = i / 24 * 2 * math.pi * 2.0
        rr = r * (1 - 0.18 * i / 24)
        pts.append((at[0] + rr * math.cos(a), at[1] + rr * math.sin(a), at[2] + 0.04 + 0.03 * i / 24))
    p.add(bm_tube(pts, 0.05, 4), lin('#C9B48A'), smooth=True)


def life_ring(p, at, rz=0.0):
    x, y, z = at
    p.add(bm_box(0.12, 0.12, 1.4, (x, y, z + 0.7)), P('timber_dk'))
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, segments=12, radius=0.35)
    ring = bm_tube([(0.35 * math.cos(a), 0, 0.35 * math.sin(a)) for a in [2 * math.pi * i / 12 for i in range(13)]], 0.09, 5)
    bm.free()
    xform(ring, loc=(0, -0.1, 1.05)); xform(ring, rz=rz); xform(ring, loc=(x, y, z))
    p.add(ring, None, face_color=lambda f: P('shutter_red') if (math.atan2(f.calc_center_median().z - z - 1.05, (f.calc_center_median().x - x) + 1e-6) * 2 / math.pi) % 1 > 0.5 else P('frame_white'), smooth=True)


# ------------------------------------------------------------------ mole / breakwater
def mole(p, path, width=5.0, top=2.6, seed=0):
    """Breakwater along a polyline: masonry wall + walkway + parapet on the sea side + armour stones."""
    rng = random.Random(seed)
    for (a, b) in zip(path, path[1:]):
        a, b = Vector((*a, 0)), Vector((*b, 0))
        d = b - a; L = d.length; t = d.normalized(); n = Vector((-t.y, t.x, 0))
        ang = math.atan2(t.y, t.x)
        mid = (a + b) / 2
        bm = bm_box(L + width * 0.5, width, top + 3.0, (0, 0, (top - 3.0) / 2))
        xform(bm, rz=ang); xform(bm, loc=mid)
        p.add(bm, P('stone_honey'), MAS, drift=0.02)
        # walkway paving
        bm = bm_box(L + width * 0.5, width - 1.0, 0.12, (0, 0.2, top + 0.06)); xform(bm, rz=ang); xform(bm, loc=mid)
        p.add(bm, P('cobble'), COB, drift=0.02)
        # parapet on the seaward side (n side negative = outward, decided by caller ordering)
        bm = bm_box(L + width * 0.5, 0.8, 1.0, (0, -width / 2 + 0.4, top + 0.5), bevel=0.08, seg=1); xform(bm, rz=ang); xform(bm, loc=mid)
        p.add(bm, P('stone_honey'), MAS, drift=0.02)
        bm = bm_box(L + width * 0.5, 0.95, 0.2, (0, -width / 2 + 0.4, top + 1.08), bevel=0.06, seg=1); xform(bm, rz=ang); xform(bm, loc=mid)
        p.add(bm, P('stone_honey_lt'), MAS_SOFT, drift=0.02)
        # armour stones along the seaward foot
        k = int(L / 2.2)
        for i in range(k):
            s = (i + rng.uniform(0.1, 0.9)) / k
            c = a.lerp(b, s) - n * (width / 2 + rng.uniform(0.6, 1.8))
            r = rng.uniform(0.9, 1.5)
            bm = bm_rock(r, seed * 31 + i, sub=2, squash=0.5, amp=0.18, at=(0, 0, 0), stretch=(1.3, 1.0, 1.0))
            xform(bm, loc=(c.x, c.y, rng.uniform(0.0, 0.6)), rz=rng.uniform(0, 6.28), rx=rng.uniform(-0.25, 0.25))
            p.add(bm, P(rng.choice(('stone_grey', 'stone_grey_lt', 'rock_lt', 'stone_honey_dk'))), pat1=ROCK, smooth=True, drift=0.08)


def mole_head(p, at, top=2.6, r=4.0):
    x, y = at
    p.add(bm_cyl(r, r, top + 3.0, 20, (x, y, -3.0)), P('stone_honey'), MAS, smooth=True, drift=0.02)
    p.add(bm_cyl(r + 0.15, r + 0.15, 0.3, 20, (x, y, top - 0.1)), P('stone_honey_lt'), MAS_SOFT, smooth=True)
    # little harbour light: white tower, red cap
    p.add(bm_cyl(1.1, 0.85, 4.6, 12, (x, y, top + 0.2)), P('frame_white'), smooth=True)
    p.add(bm_cyl(0.95, 0.95, 0.5, 12, (x, y, top + 2.0)), P('shutter_red'), smooth=True)
    p.add(bm_cyl(1.25, 1.25, 0.14, 12, (x, y, top + 4.8)), P('iron'), smooth=True)
    p.add(bm_cyl(0.5, 0.5, 0.75, 8, (x, y, top + 4.94)), P('lamp_gold'), NONE, (0, 0, 0, 2.5), smooth=True)
    p.add(bm_cyl(0.7, 0.05, 0.6, 8, (x, y, top + 5.69)), P('shutter_red'), smooth=True)
    LIGHT_POS['mole_light'] = Vector((x, y, top + 5.3))
