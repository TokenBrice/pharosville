"""Town kit: houses (parametric variants), trees, hedges, small props. Local origin = ground centre,
front facade faces -Y (camera-visible), gable ends on +-X for ridge='x'."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise
from lib import *

MAS = (1, 0, 0, 0)          # masonry pattern
MAS_SOFT = (0.35, 0, 0, 0)   # plaster over stone
COB = (0, 1, 0, 0)
TILE = (0, 0, 1, 0)
PLANK = (0, 0, 0, 1)
FOL = (1, 0, 0, 0)          # (pat1)
GRASS = (0, 1, 0, 0)
ROCK = (0, 0, 1, 0)
NONE = (0, 0, 0, 0)


def WIN(on):
    return (0, 0, 0, 1.0 if on else 0.0)


LAMP1 = (0, 0, 0, 2.5)


def blob_cluster(part, center, radius, n, seed, color, sub=1, squash=0.85, spread=0.55, pat1=(1, 0, 0, 0), spheres=None,
                 drift=0.06, top_bias=0.3):
    """Fluffy canopy: n overlapping lumpy spheres. Records spheres for foliage normals."""
    rng = random.Random(seed)
    cx, cy, cz = center
    for i in range(n):
        if i == 0:
            off = Vector((0, 0, 0)); r = radius
        else:
            a = rng.uniform(0, 2 * math.pi); e = rng.uniform(-0.3, 0.9)
            off = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e) * top_bias + 0.1)) * radius * spread
            r = radius * rng.uniform(0.55, 0.8)
        c = Vector((cx, cy, cz)) + off
        bm = bm_rock(r, seed * 13 + i, sub=sub, squash=squash, amp=0.12, at=c)
        part.add(bm, tint(color, rng.uniform(0.92, 1.08), rng.uniform(-0.4, 0.6)), pat1=pat1, smooth=True, drift=drift)
        if spheres is not None:
            spheres.append((tuple(c), r))


# ------------------------------------------------------------------ house
def house(name, coll_, w=6.0, d=5.0, h=5.5, roof='terracotta', wall='plaster_cream', stone=False, ridge='x',
          pitch=38, chimneys=((0.3, 0.25),), shutters='shutter_sage', boxes=True, seed=1, door_x=0.0, lean_to=False,
          dormer=False, ivy=False, lantern=False, floors=2, win_on=0.7, half_timber=False, balcony=False):
    rng = random.Random(seed)
    p = Part(name, seed)
    wc = P(wall)
    sk = 'stone_honey'
    # plinth (sinks into ground for terraces / slopes)
    p.add(bm_box(w + 0.3, d + 0.3, 1.25, (0, 0, -0.18), bevel=0.08, seg=1), P('stone_honey_dk'), MAS)
    # wall body (soft rounded corners), slight lean / irregularity
    body = bm_box(w, d, h, (0, 0, h / 2 + 0.3), bevel=0.10, seg=2)
    for v in body.verts:
        if v.co.z > h * 0.5:
            v.co.x += 0.04 * (v.co.z - h * 0.5) / h * (1 if seed % 2 else -1)
    p.add(body, wc if not stone else P(sk), MAS if stone else MAS_SOFT, drift=0.02)
    top = h + 0.3
    if half_timber and not stone:
        # dark timber posts + rail on the upper floor (front + side)
        z1 = top - h * 0.45
        for sx in (-1, 1):
            p.add(bm_box(0.16, 0.08, h * 0.45, (sx * (w / 2 - 0.12), -d / 2 - 0.03, z1 + h * 0.225)), P('timber_dk'))
        p.add(bm_box(w - 0.1, 0.08, 0.16, (0, -d / 2 - 0.03, z1)), P('timber_dk'))
        for i in range(1, 4):
            xx = -w / 2 + i * w / 4
            p.add(bm_box(0.14, 0.07, h * 0.45, (xx, -d / 2 - 0.03, z1 + h * 0.225)), P('timber_dk'))
    # quoins (corner stones) on stone + some plaster houses
    if True:
        zz = 0.5
        k = 0
        while zz < top - 0.2:
            L_ = 0.55 if k % 2 == 0 else 0.34
            for sx in (-1, 1):
                for sy in (-1,):
                    ax = (L_, 0.34) if k % 2 == 0 else (0.34, L_)
                    p.add(bm_box(ax[0], ax[1] if True else 0.34, 0.27,
                                 (sx * (w / 2 - ax[0] / 2 + 0.05), sy * (d / 2 - ax[1] / 2 + 0.05), zz)),
                          P('stone_honey_lt'), MAS_SOFT, drift=0.08)
            zz += max(0.42, top / 12.0); k += 1
    # ---------------- roof
    run, length = (d, w) if ridge == 'x' else (w, d)
    ov_e, ov_g, th = 0.55, 0.42, 0.26
    pr = math.radians(pitch)
    half = run / 2 + ov_e
    rise = (run / 2) * math.tan(pr)
    slope_len = half / math.cos(pr)
    rows = max(4, int(slope_len / 0.7))
    roof_c = P('roof_terracotta') if roof == 'terracotta' else P('roof_slate')
    ridge_c = P('roof_terra_dk') if roof == 'terracotta' else P('roof_slate_dk')
    z_eave = top - ov_e * math.tan(pr)

    def roof_uv(co, f):
        along = co.x if ridge == 'x' else co.y
        across = abs(co.y if ridge == 'x' else co.x)
        return (along, (half - across) / math.cos(pr))
    for side in (-1, 1):
        for r in range(rows):
            t0 = r / rows; t1 = (r + 1.12) / rows
            t1 = min(t1, 1.0)
            a0 = half * (1 - t0); a1 = half * (1 - t1)
            z0 = z_eave + (half - a0) * math.tan(pr); z1 = z_eave + (half - a1) * math.tan(pr)
            bm = bmesh.new()
            L2 = length / 2 + ov_g
            # a shingle course: slab with its lower edge proud (stepped silhouette)
            q = [(-L2, a0, z0 - 0.02), (L2, a0, z0 - 0.02), (L2, a1, z1), (-L2, a1, z1)]
            vs_lo = [bm.verts.new((x, side * y, z)) for x, y, z in q]
            vs_hi = [bm.verts.new((x, side * (y + 0.0), z + th + (0.05 if i < 2 else 0))) for i, (x, y, z) in enumerate(q)]
            if side < 0:
                vs_lo = vs_lo[::-1]; vs_hi = vs_hi[::-1]
            n = 4
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((vs_lo[i], vs_lo[j], vs_hi[j], vs_hi[i]))
            bm.faces.new(vs_hi); bm.faces.new(vs_lo[::-1])
            if ridge == 'y':
                xform(bm, rz=math.pi / 2)
            # gentle sag + jitter
            for v in bm.verts:
                al = v.co.x if ridge == 'x' else v.co.y
                v.co.z -= 0.07 * (1 - (2 * al / max(length, 1)) ** 2)
            jitter(bm, 0.025, seed + r * 7 + side)
            p.add(bm, tint(roof_c, rng.uniform(0.94, 1.06), rng.uniform(-0.3, 0.3)), TILE, drift=0.03, uv=roof_uv)
    # ridge tiles (half-round)
    zr = z_eave + half * math.tan(pr) + th
    rb = bm_cyl(0.24, 0.24, length + 2 * ov_g + 0.1, 8, (0, 0, 0))
    xform(rb, loc=(-(length / 2 + ov_g + 0.05), 0, zr - 0.04), ry=math.pi / 2)
    if ridge == 'y':
        xform(rb, rz=math.pi / 2)
    p.add(rb, ridge_c, smooth=True)
    # gable triangles
    for sgn in (-1, 1):
        bm = bmesh.new()
        e = length / 2 * sgn
        pts = [(-run / 2, top), (run / 2, top), (0, top + rise)]
        lo = [bm.verts.new((e, y, z)) for y, z in pts]
        hi = [bm.verts.new((e - sgn * 0.3, y, z)) for y, z in pts]
        bm.faces.new(lo if sgn > 0 else lo[::-1]); bm.faces.new(hi[::-1] if sgn > 0 else hi)
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new((lo[i], lo[j], hi[j], hi[i]) if sgn < 0 else (lo[j], lo[i], hi[i], hi[j]))
        if ridge == 'y':
            xform(bm, rz=math.pi / 2)
        p.add(bm, wc if not stone else P(sk), MAS if stone else MAS_SOFT, drift=0.02)
    # chimneys (crooked)
    ridge_top = zr + 0.1
    for (cx, cy) in chimneys:
        px = cx * length / 2; py = cy * run / 2
        if ridge == 'y':
            px, py = py, px
        ch_h = ridge_top - top + 1.3
        bm = bm_box(0.72, 0.72, ch_h, (0, 0, ch_h / 2), bevel=0.05, seg=1)
        bm2 = bm_box(0.9, 0.9, 0.16, (0, 0, ch_h + 0.02), bevel=0.04, seg=1)
        xform(bm, loc=(px, py, top - 0.2), rx=rng.uniform(-0.06, 0.06), ry=rng.uniform(-0.06, 0.06))
        xform(bm2, loc=(px, py, top - 0.2), rx=rng.uniform(-0.05, 0.05), ry=rng.uniform(-0.05, 0.05))
        p.add(bm, P('stone_honey'), MAS, drift=0.05)
        p.add(bm2, P('stone_honey_lt'), drift=0.04)
        for k in range(rng.choice((1, 2))):
            pot = bm_cyl(0.13, 0.10, 0.42, 7, (px + (k - 0.5) * 0.3 * (k > 0 or True) * 0.6, py, top - 0.2 + ch_h + 0.08))
            p.add(pot, P('roof_terracotta', 0.95), smooth=True)
    # ---------------- windows / door
    sh = P(shutters)

    def window(cx, cz, face, ww=0.9, wh=1.2, shut=True, box=False, on=True):
        # face: '-y' front, '-x' side, '+x', '+y'
        parts = []
        parts.append((bm_box(ww + 0.18, 0.12, wh + 0.18, (0, 0, 0)), P('frame_white'), NONE, NONE))
        parts.append((bm_box(ww - 0.06, 0.06, wh - 0.06, (0, -0.05, 0)), lin('#2C3644'), NONE, WIN(on)))
        parts.append((bm_box(0.07, 0.05, wh - 0.1, (0, -0.08, 0)), P('frame_white'), NONE, NONE))
        parts.append((bm_box(ww - 0.1, 0.05, 0.07, (0, -0.08, wh * 0.12)), P('frame_white'), NONE, NONE))
        parts.append((bm_box(ww + 0.36, 0.26, 0.1, (0, -0.1, -wh / 2 - 0.1)), P('stone_honey_lt'), NONE, NONE))
        if shut:
            for s in (-1, 1):
                parts.append((bm_box(ww * 0.5, 0.06, wh, (s * (ww * 0.75 + 0.12), -0.02, 0)), sh, NONE, NONE))
        if box:
            parts.append((bm_box(ww + 0.2, 0.3, 0.24, (0, -0.24, -wh / 2 - 0.26)), P('timber'), NONE, NONE))
        for bm, c, a0, a1 in parts:
            xform(bm, loc=(cx, 0, cz))
            if face == '-y':
                xform(bm, loc=(0, -d / 2 - 0.02, 0))
            elif face == '+y':
                xform(bm, rz=math.pi); xform(bm, loc=(0, d / 2 + 0.02, 0))
            elif face == '-x':
                xform(bm, rz=-math.pi / 2); xform(bm, loc=(-w / 2 - 0.02, 0, 0))
            elif face == '+x':
                xform(bm, rz=math.pi / 2); xform(bm, loc=(w / 2 + 0.02, 0, 0))
            p.add(bm, c, a0, a1, drift=0.03)
        if box:
            # geraniums: a few lumps in the box
            for k in range(2):
                fx = cx + (k - 0.5) * ww * 0.45
                c = (fx, -0.3, cz - wh / 2 - 0.08)
                bm = bm_rock(0.2, seed * 7 + k + int(cz * 10), sub=1, squash=0.7, amp=0.2, at=(0, 0, 0))
                xform(bm, loc=c)
                if face == '-y':
                    xform(bm, loc=(0, -d / 2 - 0.02, 0))
                elif face == '+y':
                    xform(bm, rz=math.pi); xform(bm, loc=(0, d / 2 + 0.02, 0))
                elif face == '-x':
                    xform(bm, rz=-math.pi / 2); xform(bm, loc=(-w / 2 - 0.02, 0, 0))
                elif face == '+x':
                    xform(bm, rz=math.pi / 2); xform(bm, loc=(w / 2 + 0.02, 0, 0))
                fc = rng.choice(('flower_red', 'flower_red', 'flower_pink', 'flower_white', 'flower_yellow'))
                p.add(bm, P(fc), smooth=True, drift=0.05)

    fl_h = (h - 0.4) / floors
    # front windows
    nwin_f = max(1, int((w - 1.0) / 1.9))
    for fl in range(floors):
        cz = 0.3 + fl_h * fl + fl_h * 0.55
        for i in range(nwin_f):
            cx = -w / 2 + (i + 0.5) * w / nwin_f
            if fl == 0 and abs(cx - door_x) < 1.0:
                continue
            window(cx, cz, '-y', shut=shutters is not None and (seed + i) % 3 != 0,
                   box=boxes and fl >= 1 and (i + seed) % 2 == 0, on=rng.random() < win_on)
    # side windows (both sides, kit is rotatable)
    nwin_s = max(1, int((d - 1.2) / 2.2))
    for fl in range(floors):
        cz = 0.3 + fl_h * fl + fl_h * 0.55
        for i in range(nwin_s):
            cy = -d / 2 + (i + 0.5) * d / nwin_s
            for face in ('-x', '+x'):
                ww_ = 0.8
                if face == '-x':
                    window(cy, cz, face, ww=ww_, shut=(seed + i + fl) % 2 == 0, box=boxes and fl == floors - 1 and i == 0,
                           on=rng.random() < win_on)
                elif fl == floors - 1:
                    window(-cy, cz, face, ww=ww_, shut=False, on=rng.random() < win_on * 0.7)
    # back windows (fewer)
    window(0.0, 0.3 + fl_h * (floors - 1) + fl_h * 0.55, '+y', shut=False, on=rng.random() < win_on * 0.6)
    # gable window
    window(0, top + rise * 0.38, '-x' if ridge == 'x' else '-y', ww=0.6, wh=0.7, shut=False, on=rng.random() < 0.6)
    # door: stone surround, coloured door, step, optional wall lantern
    dz = 0.3
    door = [(bm_box(1.5, 0.18, 2.5, (door_x, -d / 2 - 0.04, dz + 1.15)), P('stone_honey_lt'), MAS_SOFT),
            (bm_box(1.05, 0.1, 2.1, (door_x, -d / 2 - 0.11, dz + 1.0)), P(rng.choice(('shutter_teal', 'shutter_blue', 'shutter_red', 'door_green' if False else 'shutter_sage'))), NONE),
            (bm_box(1.6, 0.7, 0.24, (door_x, -d / 2 - 0.36, dz - 0.05), bevel=0.04, seg=1), P('stone_honey_lt'), MAS_SOFT)]
    for bm, c, pt in door:
        p.add(bm, c, pt, drift=0.03)
    if lantern:
        p.add(bm_box(0.08, 0.35, 0.08, (door_x + 1.0, -d / 2 - 0.2, dz + 2.45)), P('iron'))
        p.add(bm_box(0.24, 0.24, 0.34, (door_x + 1.0, -d / 2 - 0.36, dz + 2.25)), P('lamp_gold'), NONE, LAMP1)
        p.add(bm_cyl(0.2, 0.02, 0.16, 6, (door_x + 1.0, -d / 2 - 0.36, dz + 2.42)), P('iron'))
    # potted plants at the door
    for s in (-1, 1):
        if rng.random() < 0.7:
            px = door_x + s * 1.05
            p.add(bm_cyl(0.2, 0.26, 0.38, 7, (px, -d / 2 - 0.5, 0.18)), P('roof_terracotta', 1.05), smooth=True)
            blob_cluster(p, (px, -d / 2 - 0.5, 0.78), 0.32, 2, seed * 5 + s, P('leaf_lt'), sub=1)
    if lean_to:
        lw_, ld_ = min(3.2, d * 0.6), d * 0.7
        lx = w / 2 + lw_ / 2
        p.add(bm_box(lw_, ld_, 2.6, (lx, d * 0.1, 1.3 + 0.1), bevel=0.06, seg=1), P('stone_honey'), MAS)
        bm = bm_box(lw_ + 0.6, ld_ + 0.6, 0.14, (0, 0, 0))
        xform(bm, loc=(lx + 0.1, d * 0.1, 2.95), ry=-math.radians(16))
        p.add(bm, roof_c, TILE, uv=lambda co, f: (co.y, co.x))
        p.add(bm_box(0.9, 0.08, 1.8, (lx, d * 0.1 - ld_ / 2 - 0.03, 1.0)), P('timber'), PLANK)
    if dormer and ridge == 'x':
        dz0 = z_eave + half * 0.45 * math.tan(pr)
        p.add(bm_box(1.3, 1.6, 1.3, (0.5, -half * 0.42, dz0 + 0.4)), wc, MAS_SOFT)
        bm = bmesh.new()
        for sgn in (-1, 1):
            s = bm_box(0.9, 1.9, 0.12, (0, 0, 0)); xform(s, loc=(0.5 + sgn * 0.4, -half * 0.42 - 0.15, dz0 + 1.25), ry=sgn * math.radians(-35))
            p.add(s, roof_c, TILE, uv=lambda co, f: (co.y, co.x))
        window(0.5, dz0 + 0.45, '-y', ww=0.7, wh=0.8, shut=False, on=True)
    if balcony:
        bz = 0.3 + fl_h + 0.1
        p.add(bm_box(w * 0.5, 0.9, 0.14, (0, -d / 2 - 0.45, bz)), P('timber_dk'), PLANK)
        for i in range(4):
            xx = -w * 0.25 + i * w * 0.5 / 3
            p.add(bm_box(0.05, 0.05, 0.85, (xx, -d / 2 - 0.86, bz + 0.45)), P('iron'))
        p.add(bm_box(w * 0.5, 0.06, 0.05, (0, -d / 2 - 0.86, bz + 0.9)), P('iron'))
    if ivy:
        # ivy climbing the front-left corner
        for k in range(7):
            t = k / 6
            cz = 0.6 + t * (top - 0.8)
            c = (-w / 2 + 0.15 + 0.5 * math.sin(k * 1.7) * 0.3, -d / 2 - 0.05, cz)
            bm = bm_rock(0.55 - 0.25 * t, seed * 11 + k, sub=1, squash=1.0, amp=0.25)
            xform(bm, loc=c, s=(1.0, 0.45, 1.0))
            p.add(bm, P('leaf_dk', 1.1), pat1=FOL, smooth=True, drift=0.08)
    return p


# ------------------------------------------------------------------ vegetation
def tree(name, kind='round', h=6.0, seed=0, r=None):
    p = Part(name, seed)
    rng = random.Random(seed)
    spheres = []
    if kind == 'round':
        r = r or h * 0.32
        tz = h - r * 0.9
        # trunk with a slight bend
        bend = Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0))
        pts = [Vector((0, 0, -0.2)), Vector((0, 0, tz * 0.5)) + bend * 0.5, Vector((0, 0, tz + r * 0.3)) + bend]
        for a, b, r0, r1 in ((pts[0], pts[1], h * 0.045, h * 0.035), (pts[1], pts[2], h * 0.035, h * 0.022)):
            bm = bmesh.new(); d = b - a
            bmesh.ops.create_cone(bm, cap_ends=False, segments=6, radius1=r0, radius2=r1, depth=d.length,
                                  matrix=Matrix.Translation((a + b) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
            p.add(bm, P('bark'), smooth=True)
        c = pts[2]
        col = P(rng.choice(('leaf', 'leaf', 'leaf_olive', 'leaf_lt')))
        blob_cluster(p, (c.x, c.y, c.z), r, 4, seed, col, sub=2, spheres=spheres, spread=0.58)
    elif kind == 'cypress':
        r = r or h * 0.16
        p.add(bm_cyl(0.12, 0.08, 1.0, 5, (0, 0, -0.2)), P('bark'))
        for i in range(4):
            t = i / 3
            rr = r * (1.0 - 0.55 * t)
            c = (0, 0, 0.8 + t * (h - 1.6) + rr * 0.5)
            bm = bm_rock(rr, seed * 5 + i, sub=2, squash=1.0, amp=0.1, at=c, stretch=(1, 1, 1.5))
            p.add(bm, tint(P('leaf_dk'), rng.uniform(0.95, 1.1)), pat1=FOL, smooth=True)
            spheres.append((c, rr * 1.2))
    elif kind == 'pine':
        # Mediterranean umbrella pine: leaning bare trunk, flat layered crown
        r = r or h * 0.42
        lean = Vector((rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8), 0))
        a, b = Vector((0, 0, -0.2)), Vector((0, 0, h * 0.82)) + lean
        bm = bmesh.new(); d = b - a
        bmesh.ops.create_cone(bm, cap_ends=False, segments=6, radius1=h * 0.04, radius2=h * 0.025, depth=d.length,
                              matrix=Matrix.Translation((a + b) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
        p.add(bm, P('bark', 0.9), smooth=True)
        for i in range(4):
            ang = rng.uniform(0, 6.28); off = Vector((math.cos(ang), math.sin(ang), 0)) * r * (0.0 if i == 0 else 0.5)
            c = b + off + Vector((0, 0, rng.uniform(-0.2, 0.3)))
            rr = r * (0.75 if i == 0 else rng.uniform(0.45, 0.6))
            bm = bm_rock(rr, seed * 9 + i, sub=2, squash=0.5, amp=0.12, at=tuple(c))
            p.add(bm, tint(P('leaf'), rng.uniform(0.85, 1.0), 0.2), pat1=(1, 0, 0, 0), smooth=True)
            spheres.append((tuple(c), rr * 0.7))
    elif kind == 'bush':
        r = r or 0.8
        blob_cluster(p, (0, 0, r * 0.6), r, 3, seed, P(rng.choice(('leaf', 'leaf_dk', 'leaf_olive'))), sub=2,
                     spheres=spheres, spread=0.7, top_bias=0.1)
        if rng.random() < 0.6:
            fc = P(rng.choice(('flower_pink', 'flower_white', 'flower_violet', 'flower_yellow')))
            for k in range(5):
                a = rng.uniform(0, 6.28)
                bm = bm_sphere(0.11, 0, at=(math.cos(a) * r * 0.7, math.sin(a) * r * 0.7, r * rng.uniform(0.5, 1.1)))
                p.add(bm, fc, smooth=True)
    return p, spheres


def hedge(name, length, width=0.9, height=1.1, seed=0, color='leaf_dk'):
    p = Part(name, seed)
    rng = random.Random(seed)
    n = max(1, int(length / 1.1))
    spheres = []
    for i in range(n):
        x = -length / 2 + (i + 0.5) * length / n
        r = height * 0.62
        c = (x, 0, height * 0.5)
        bm = bm_rock(r, seed * 3 + i, sub=2, squash=1.0, amp=0.14, at=c, stretch=(1.2 * length / n / (2 * r) + 0.4, width / (2 * r) + 0.15, 1.0))
        p.add(bm, tint(P(color), rng.uniform(0.92, 1.1)), pat1=FOL, smooth=True)
        spheres.append((c, r))
    return p, spheres


# ------------------------------------------------------------------ props
def barrel(p, at, seed=0, rz=0.0, lying=False):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=0.3, radius2=0.3, depth=0.85)
    for v in bm.verts:
        v.co.x *= 1.0; v.co.y *= 1.0
    # bulge
    bm2 = bm_cyl(0.3, 0.3, 0.86, 8)
    for v in bm2.verts:
        k = 1 + 0.12 * (1 - (2 * v.co.z / 0.86 - 1) ** 2)
        v.co.x *= k; v.co.y *= k
    bm.free()
    if lying:
        xform(bm2, loc=(0, 0, -0.43)); xform(bm2, ry=math.pi / 2); xform(bm2, loc=(0, 0, 0.32))
    xform(bm2, loc=at, rz=rz)
    p.add(bm2, P('timber'), PLANK, smooth=True, drift=0.08)
    for zz in (0.18, 0.68):
        hb = bm_cyl(0.325, 0.325, 0.05, 8, (0, 0, zz))
        if lying:
            xform(hb, loc=(0, 0, -0.43)); xform(hb, ry=math.pi / 2); xform(hb, loc=(0, 0, 0.32))
        xform(hb, loc=at, rz=rz)
        p.add(hb, P('iron', 1.3), smooth=True)


def crate(p, at, s=0.6, rz=0.0, seed=0):
    bm = bm_box(s, s, s, (0, 0, s / 2), bevel=0.03, seg=1)
    xform(bm, loc=at, rz=rz)
    p.add(bm, P(random.Random(seed).choice(('plank', 'timber', 'plank_grey'))), PLANK, drift=0.08)


def lamp_post(p, at, h=3.4):
    x, y, z = at
    p.add(bm_cyl(0.16, 0.13, 0.4, 8, (x, y, z)), P('iron'), smooth=True)
    p.add(bm_cyl(0.06, 0.05, h, 6, (x, y, z)), P('iron'), smooth=True)
    p.add(bm_box(0.36, 0.36, 0.06, (x, y, z + h)), P('iron'))
    p.add(bm_box(0.3, 0.3, 0.42, (x, y, z + h + 0.24)), P('lamp_gold'), NONE, LAMP1)
    p.add(bm_cyl(0.3, 0.04, 0.24, 4, (x, y, z + h + 0.45)), P('iron'))
    p.add(bm_sphere(0.05, 0, at=(x, y, z + h + 0.72)), P('iron'))


def bench(p, at, rz=0.0):
    for dx in (-0.6, 0.6):
        bm = bm_box(0.08, 0.45, 0.45, (dx, 0, 0.22)); xform(bm, loc=at, rz=rz); p.add(bm, P('iron'))
    bm = bm_box(1.5, 0.45, 0.06, (0, 0, 0.45)); xform(bm, loc=at, rz=rz); p.add(bm, P('timber'), PLANK)
    bm = bm_box(1.5, 0.06, 0.35, (0, 0.22, 0.72)); xform(bm, loc=at, rz=rz); p.add(bm, P('timber'), PLANK)


def net_rack(p, at, rz=0.0, seed=0):
    rng = random.Random(seed)
    for dx in (-1.2, 1.2):
        bm = bm_box(0.12, 0.12, 2.0, (dx, 0, 1.0)); xform(bm, loc=at, rz=rz); p.add(bm, P('timber_dk'))
    bm = bm_cyl(0.05, 0.05, 2.6, 6, (0, 0, 0)); xform(bm, loc=(-1.3, 0, 0), ry=math.pi / 2); xform(bm, loc=(0, 0, 1.95))
    xform(bm, loc=at, rz=rz); p.add(bm, P('timber_dk'), smooth=True)
    # draped net: a sagging sheet with folds
    bm = bmesh.new(); nx, nz = 8, 4; vs = []
    for i in range(nx + 1):
        row = []
        for j in range(nz + 1):
            u = i / nx; t = j / nz
            row.append(bm.verts.new((-1.15 + 2.3 * u, 0.1 * math.sin(u * 19 + seed) * t, 1.95 - 1.5 * t - 0.25 * t * math.sin(u * 3.14))))
        vs.append(row)
    for i in range(nx):
        for j in range(nz):
            bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
    xform(bm, loc=at, rz=rz)
    p.add(bm, lin(rng.choice(('#5E7F86', '#7A5E4A', '#6C7A52'))), (0.5, 0, 0, 0), smooth=True)
    # cork floats
    for k in range(6):
        bm = bm_sphere(0.09, 0, at=(-1.1 + k * 0.44, 0.0, 1.88)); xform(bm, loc=at, rz=rz)
        p.add(bm, P('flower_yellow' if k % 2 else 'shutter_red'), smooth=True)


def lobster_pots(p, at, n=3, seed=0, rz=0.0):
    rng = random.Random(seed)
    for k in range(n):
        x = (k % 2) * 0.7; z = (k // 2) * 0.5
        bm = bm_box(0.65, 0.45, 0.45, (x, 0, z + 0.22), bevel=0.15, seg=2)
        xform(bm, loc=at, rz=rz + rng.uniform(-0.2, 0.2))
        p.add(bm, P('timber', 0.95), (0.7, 0, 0, 0), smooth=True)


def rowboat(p, at, rz=0.0, color='shutter_teal', seed=0, upside=False):
    """A small dinghy (beached on the slipway)."""
    bm = bmesh.new(); secs = []
    n = 6; Lh, B, D = 3.6, 1.3, 0.5
    for i in range(n + 1):
        u = -1 + 2 * i / n
        w = B / 2 * (1 - abs(u) ** 2.4) ** 0.6 if u > 0 else B / 2 * (1 - 0.35 * u * u)
        w = max(w, 0.03)
        zt = D * (1 + 0.25 * u * u)
        prof = [(w, zt), (w * 0.85, D * 0.3), (0, 0.0)]
        pts = prof + [(-yy, zz) for yy, zz in reversed(prof[:-1])]
        secs.append([bm.verts.new((u * Lh / 2, yy, zz)) for yy, zz in pts])
    for a, b in zip(secs, secs[1:]):
        for j in range(len(a) - 1):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
    bm.faces.new(secs[0][::-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    sol = bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.05)
    if upside:
        xform(bm, rx=math.pi); xform(bm, loc=(0, 0, D * 1.2))
    xform(bm, loc=at, rz=rz, rx=0.08)
    p.add(bm, P(color), smooth=True)
    if not upside:
        th = bm_box(0.25, B * 0.85, 0.06, (0, 0, D * 0.75)); xform(th, loc=at, rz=rz)
        p.add(th, P('plank'), PLANK)
