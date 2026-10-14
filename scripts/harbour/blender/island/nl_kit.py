"""Northern Light (style C) - kit builders. Every asset is a root empty + named children, built at the
origin in local space (x = length/width, y = depth, z up; houses face -y; hulls bow +x).
"""
from nl_common import *

PT = PATTERN


def obox(center, t, sx, sy, sz, up=Vector((0, 0, 1))):
    """Oriented box: sx along t (horizontal), sy along n = up x t, sz along up."""
    t = Vector(t).normalized(); n = up.cross(t).normalized(); u = t.cross(n)
    bm = bm_box(sx, sy, sz)
    M_ = Matrix(((t.x, n.x, u.x, center[0]), (t.y, n.y, u.y, center[1]), (t.z, n.z, u.z, center[2]), (0, 0, 0, 1)))
    bmesh.ops.transform(bm, matrix=M_, verts=bm.verts)
    return bm


def plaque(center, t, n, sx, sy, sz):
    """obox without the face that touches the wall (normal -n): 10 tris."""
    bm = obox(center, t, sx, sy, sz)
    n = Vector(n).normalized()
    bm.normal_update()
    dead = [f for f in bm.faces if f.normal.dot(n) < -0.9]
    bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
    return bm


def beam(p, q, w, h, up=Vector((0, 0, 1))):
    """Box from p to q with cross-section w (horizontal) x h."""
    p, q = Vector(p), Vector(q); d = q - p
    x = d.normalized()
    y = up.cross(x)
    if y.length < 1e-4:
        y = Vector((0, 1, 0)).cross(x)
    y.normalize(); z = x.cross(y)
    bm = bm_box(d.length, w, h)
    c = (p + q) / 2
    M_ = Matrix(((x.x, y.x, z.x, c.x), (x.y, y.y, z.y, c.y), (x.z, y.z, z.z, c.z), (0, 0, 0, 1)))
    bmesh.ops.transform(bm, matrix=M_, verts=bm.verts)
    return bm


def quad(center, t, sx, sz, n=None):
    """Single front-facing quad (2 tris) on a wall plane: t = horizontal tangent, n = outward normal."""
    t = Vector(t).normalized(); up = Vector((0, 0, 1))
    bm = bmesh.new()
    c = Vector(center)
    vs = [bm.verts.new(c + t * dx * sx / 2 + up * dz * sz / 2) for dx, dz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    n_ = Vector(n).normalized() if n is not None else t.cross(up)
    bm.normal_update()
    if f.normal.dot(n_) < 0:
        f.normal_flip()
    return bm


def line3(p, q, r=0.03):
    """Rigging line: 3-sided open prism (6 tris)."""
    return bm_rod(p, q, r, 3)


def catenary(p, q, sag, n=4):
    p, q = Vector(p), Vector(q); pts = []
    for i in range(n + 1):
        t = i / n
        v = p.lerp(q, t); v.z -= sag * 4 * t * (1 - t)
        pts.append(v)
    return pts


# =================================================================== WINDOWS / DOORS
def add_window(trim, glass, c, t, n, ww=0.8, wh=1.1, mull=True, sill=True, rng=None, lit_p=0.68, box=None,
               shutters=None, gl_list=None):
    """Window on a wall plane: frame plaque + proud glass + mullion cross + sill (all open-backed)."""
    t = Vector(t).normalized(); n = Vector(n).normalized(); c = Vector(c)
    fw = 0.12
    merge(trim, plaque(c + n * 0.03, t, n, ww + 2 * fw, 0.06, wh + 2 * fw))
    if mull:
        merge(trim, quad(c + n * 0.085, t, 0.07, wh, n))
        merge(trim, quad(c + n * 0.086 + Vector((0, 0, wh * 0.12)), t, ww, 0.07, n))
    if sill:
        merge(trim, plaque(c + n * 0.1 - Vector((0, 0, wh / 2 + fw + 0.03)), t, n, ww + 0.36, 0.2, 0.08))
    g = quad(c + n * 0.065, t, ww, wh, n)
    lit = 0.0
    if rng is not None and rng.random() < lit_p:
        lit = rng.uniform(0.55, 1.0)
    warm = rng.uniform(0.0, 0.6) if rng is not None else 0.2
    if gl_list is not None:
        gl_list.append((len(glass.faces), lit, warm))
    merge(glass, g)
    if box is not None:  # flower box under the window
        bx_, fl_ = box
        merge(bx_, plaque(c + n * 0.2 - Vector((0, 0, wh / 2 + fw + 0.22)), t, n, ww + 0.2, 0.3, 0.26))
        for k_ in (0, 2):
            q = c + n * 0.26 - Vector((0, 0, wh / 2 + fw - 0.05)) + t * ((k_ - 1) * (ww * 0.36))
            merge(fl_, bm_cyl(0.2, 0.06, 0.3, 4, tuple(q - Vector((0, 0, 0.15))), rot=k_))
    if shutters is not None:
        for s in (-1, 1):
            merge(shutters, plaque(c + n * 0.04 + t * s * (ww / 2 + fw + 0.24), t, n, 0.42, 0.05, wh + 0.1))
    return lit


def glass_obj(name, glass, gl_list, parent, family):
    """Glass object: Col.R lit factor, Col.G warmth, assigned per window (faces recorded at creation)."""
    nf = len(glass.faces)
    marks = sorted(gl_list) + [(nf, 0, 0)]
    vals = []
    for i in range(len(marks) - 1):
        vals += [(marks[i][1], marks[i][2])] * (marks[i + 1][0] - marks[i][0])
    it = iter(vals)
    lut = {}

    def fc(poly):
        lit, warm = vals[poly.index] if poly.index < len(vals) else (0, 0)
        return ((lit, warm, 0.0), 0)
    return obj(name, glass, face=fc, mat=M['window'], jitter=0, parent=parent, family=family)


# =================================================================== HOUSE
def build_house(name, P, loc=(0, 0, 0), rz=0.0, seed=0, family='house'):
    rng = random.Random(seed)
    root = empty(name, loc, (0, 0, rz), family=family)
    w, d = P['w'], P['d']
    floors, fh = P.get('floors', 2), P.get('fh', 2.7)
    base = P.get('base', 0.8)
    H = base + floors * fh
    ridge = P.get('ridge', 'x')
    pitch = math.radians(P.get('pitch', 42))
    wall = P['wall']; wpat = PT[P.get('wall_pat', 'boards')]
    trim_c = P.get('trim', PAL['trim'])
    ov = 0.35; gov = 0.3
    # --- plinth (goes 2 m into the ground to sit on slopes)
    pl = bm_box2(-w / 2 - 0.08, -d / 2 - 0.08, -2.0, w / 2 + 0.08, d / 2 + 0.08, base)
    obj(name + '_plinth', pl, PAL['granite'] if P.get('stone_base', True) else PAL['tar'], PT['ashlar'],
        parent=root, bevel=0.05, family=family, seed=seed)
    # --- walls + gables
    span = d if ridge == 'x' else w
    rise = span / 2 * math.tan(pitch)
    body = bm_box2(-w / 2, -d / 2, base, w / 2, d / 2, H)
    tri = bmesh.new()
    if ridge == 'x':
        for s in (-1, 1):
            pass
        vs = [tri.verts.new(v) for v in ((-w / 2, -d / 2, H), (-w / 2, d / 2, H), (-w / 2, 0, H + rise),
                                          (w / 2, -d / 2, H), (w / 2, d / 2, H), (w / 2, 0, H + rise))]
    else:
        vs = [tri.verts.new(v) for v in ((-w / 2, -d / 2, H), (w / 2, -d / 2, H), (0, -d / 2, H + rise),
                                          (-w / 2, d / 2, H), (w / 2, d / 2, H), (0, d / 2, H + rise))]
    tri.faces.new((vs[0], vs[2], vs[1])); tri.faces.new((vs[3], vs[4], vs[5]))
    tri.faces.new((vs[0], vs[1], vs[4], vs[3])); tri.faces.new((vs[1], vs[2], vs[5], vs[4]))
    tri.faces.new((vs[2], vs[0], vs[3], vs[5]))
    bmesh.ops.recalc_face_normals(tri, faces=tri.faces)
    merge(body, tri)
    obj(name + '_walls', body, wall, wpat, parent=root, bevel=0.04, family=family, seed=seed + 1, jitter=0.02)
    # --- roof
    style = P.get('roof_style', 'tiles')
    rc = P['roof']
    roof = bmesh.new()
    if ridge == 'x':
        L_along, half = w + 2 * gov, d / 2 + ov
    else:
        L_along, half = d + 2 * gov, w / 2 + ov
    Ls = half / math.cos(pitch)
    zr = H + rise
    if style in ('tiles', 'slate'):
        rl = 0.72 if style == 'tiles' else 0.56
        n = max(4, round(Ls / rl)); rl = Ls / n
        for s in (-1, 1):
            for k in range(n):
                dist = Ls - (k + 0.5) * rl
                a = pitch - 0.06
                yy = s * math.cos(pitch) * dist
                zz = zr - math.sin(pitch) * dist + 0.09
                b = bm_box(L_along, rl * 1.18, 0.1)
                b.normal_update()
                bmesh.ops.delete(b, geom=[f for f in b.faces if f.normal.z < -0.9], context='FACES_ONLY')
                xf(b, rx=-s * a)
                xf(b, loc=(0, yy, zz))
                if ridge == 'y':
                    xf(b, rz=math.pi / 2)
                merge(roof, b)
        pat = PT['tiles'] if style == 'tiles' else PT['slate']
        obj(name + '_roof', roof, rc, pat, parent=root, family=family, seed=seed + 2, jitter=0.05)
        ridge_bm = bm_box(L_along + 0.04, 0.32, 0.22, (0, 0, zr + 0.12))
        if ridge == 'y':
            xf(ridge_bm, rz=math.pi / 2)
        obj(name + '_ridge', ridge_bm, jitter_col(rc, 0.8), PT['plain'], parent=root, family=family, bevel=0.03)
    else:
        th = 0.34 if style == 'turf' else 0.14
        for s in (-1, 1):
            b = bm_box(L_along, Ls + 0.05, th)
            xf(b, rx=-s * pitch)
            xf(b, loc=(0, s * math.cos(pitch) * Ls / 2, zr - math.sin(pitch) * Ls / 2 + th / 2 + 0.02))
            if ridge == 'y':
                xf(b, rz=math.pi / 2)
            merge(roof, b)
        if style == 'turf':
            obj(name + '_roof', roof, PAL['turf'], PT['grass'], parent=root, family=family, bevel=0.12, seed=seed + 2)
            # wildflower dots on the turf
            fl = bmesh.new()
            for k in range(10):
                s = rng.choice((-1, 1)); dist = rng.uniform(0.4, Ls - 0.4); a = rng.uniform(-L_along / 2 + 0.4, L_along / 2 - 0.4)
                yy = s * math.cos(pitch) * dist; zz = zr - math.sin(pitch) * dist + th + 0.05
                p = (a, yy, zz) if ridge == 'x' else (yy, a, zz)
                merge(fl, bm_ico(0.12, p, 1, (1, 1, 0.7), seed=k))
            obj(name + '_turfflowers', fl, face=lambda q: (rng.choice((PAL['flower_y'], PAL['flower_w'], PAL['flower_p'])), 0),
                parent=root, family=family)
        else:
            obj(name + '_roof', roof, rc, PT['boards'], parent=root, family=family, seed=seed + 2)
    # --- trim: barge boards, corner boards, fascia
    trim = bmesh.new()
    if ridge == 'x':
        for sx in (-1, 1):
            x = sx * (w / 2 + gov - 0.04)
            for s in (-1, 1):
                p0 = Vector((x, s * (d / 2 + ov), H - ov * math.tan(pitch) + 0.05))
                p1 = Vector((x, 0, zr + 0.16))
                merge(trim, beam(p0, p1, 0.1, 0.3))
    else:
        for sy in (-1, 1):
            y = sy * (d / 2 + gov - 0.04)
            for s in (-1, 1):
                p0 = Vector((s * (w / 2 + ov), y, H - ov * math.tan(pitch) + 0.05))
                p1 = Vector((0, y, zr + 0.16))
                merge(trim, beam(p0, p1, 0.1, 0.3))
    if wpat == PT['boards']:
        for sx in (-1, 1):
            for sy in (-1, 1):
                merge(trim, bm_box2(sx * w / 2 - 0.1, sy * d / 2 - 0.1, base, sx * w / 2 + 0.1, sy * d / 2 + 0.1, H))
    # string course between floors
    for f in range(1, floors):
        z = base + f * fh
        merge(trim, bm_box2(-w / 2 - 0.05, -d / 2 - 0.05, z - 0.06, w / 2 + 0.05, d / 2 + 0.05, z + 0.06))
    # --- windows & door
    glass = bmesh.new(); gl = []
    bx_, fl_ = bmesh.new(), bmesh.new()
    shut = bmesh.new() if P.get('shutters') else None
    door_face = P.get('door', '-y')
    faces = {'-y': (Vector((0, -d / 2, 0)), Vector((1, 0, 0)), Vector((0, -1, 0)), w),
             '+y': (Vector((0, d / 2, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), w),
             '-x': (Vector((-w / 2, 0, 0)), Vector((0, -1, 0)), Vector((-1, 0, 0)), d),
             '+x': (Vector((w / 2, 0, 0)), Vector((0, 1, 0)), Vector((1, 0, 0)), d)}
    win_faces = P.get('win_faces', ['-y', '-x', '+x', '+y'])
    door_bm = bmesh.new()
    for fk in win_faces:
        c0, t, nrm, L_ = faces[fk]
        nwin = max(1, int((L_ - 0.6) / (P.get('win_pitch', 2.2) * (1.2 if floors >= 3 and fk in ('-x', '+x') else 1.0))))
        xs = [(i + 0.5) / nwin * L_ - L_ / 2 for i in range(nwin)]
        for f in range(floors):
            zc = base + f * fh + fh * 0.55
            for i, xo in enumerate(xs):
                if f == 0 and fk == door_face and i == P.get('door_slot', nwin // 2):
                    # door
                    dc = c0 + t * xo
                    dw, dh = 1.05, 2.15
                    zb = base
                    merge(door_bm, obox(dc + nrm * 0.02 + Vector((0, 0, zb + dh / 2)), t, dw, 0.08, dh))
                    merge(trim, obox(dc + nrm * 0.06 + Vector((0, 0, zb + dh + 0.08)), t, dw + 0.36, 0.16, 0.16))
                    merge(trim, obox(dc + nrm * 0.06 + t * (dw / 2 + 0.08) + Vector((0, 0, zb + dh / 2)), t, 0.14, 0.14, dh))
                    merge(trim, obox(dc + nrm * 0.06 - t * (dw / 2 + 0.08) + Vector((0, 0, zb + dh / 2)), t, 0.14, 0.14, dh))
                    # step stones
                    merge(door_bm, obox(dc + nrm * 0.45 + Vector((0, 0, base - 0.18)), t, dw + 0.6, 0.8, 0.36))
                    merge(door_bm, obox(dc + nrm * 0.75 + Vector((0, 0, base - 0.45)), t, dw + 0.9, 0.9, 0.4))
                    # transom light
                    add_window(trim, glass, dc + Vector((0, 0, zb + dh + 0.42)), t, nrm, dw * 0.8, 0.34, mull=False,
                               sill=False, rng=rng, lit_p=0.8, gl_list=gl)
                    continue
                box = (bx_, fl_) if (P.get('flowers') and rng.random() < 0.55 and f <= 1) else None
                add_window(trim, glass, c0 + t * xo + Vector((0, 0, zc)), t, nrm, P.get('ww', 0.8), P.get('wh', 1.1),
                           rng=rng, box=box, shutters=shut if fk in ('-y', '+y') else None, gl_list=gl)
        # gable window
        gable_faces = ('-x', '+x') if ridge == 'x' else ('-y', '+y')
        if fk in gable_faces and rise > 1.6:
            add_window(trim, glass, c0 + Vector((0, 0, H + rise * 0.36)), t, nrm, 0.62, 0.8, rng=rng, gl_list=gl)
    obj(name + '_trim', trim, trim_c, PT['plain'], parent=root, family=family, jitter=0.0)
    glass_obj(name + '_glass', glass, gl, root, family)
    dc_ = P.get('door_col', PAL['door_green'])
    obj(name + '_door', door_bm, face=lambda q: ((dc_, PT['boards']) if q.center.z > base - 0.01 else (PAL['granite_light'], PT['plain'])),
        parent=root, family=family)
    if len(bx_.faces):
        obj(name + '_fbox', bx_, PAL['tar'] if rng.random() < 0.5 else PAL['door_green'], PT['boards'], parent=root, family=family)
        obj(name + '_fflowers', fl_, face=lambda q: (random.Random(q.index // 20 + seed).choice(
            (PAL['rowan_berry'], PAL['flower_y'], PAL['flower_w'], PAL['flower_p'])), 0), parent=root, family=family)
    else:
        bx_.free(); fl_.free()
    if shut is not None:
        obj(name + '_shutters', shut, P.get('shutter_col', PAL['door_green']), PT['boards'], parent=root, family=family)
    # --- chimney
    if P.get('chimney', True):
        cx = (w / 2 - 0.9) * P.get('chim_side', 1) if ridge == 'x' else 0.6
        cy = 0.5 if ridge == 'x' else (d / 2 - 0.9) * P.get('chim_side', 1)
        ch = bm_box2(cx - 0.35, cy - 0.35, H, cx + 0.35, cy + 0.35, zr + 0.9)
        merge(ch, bm_box2(cx - 0.45, cy - 0.45, zr + 0.9, cx + 0.45, cy + 0.45, zr + 1.05))
        obj(name + '_chimney', ch, PAL['granite_light'] if rng.random() < 0.5 else PAL['wall_white'], PT['ashlar'],
            parent=root, family=family)
        root['chimney_top'] = (cx, cy, zr + 1.1)
    return root


# =================================================================== LIGHTHOUSE (D8)
def _rings(bm, step=1.1):
    """Cut long vertical edges into ~step m pieces: AO is baked per vertex, and a tall face with only its end
    vertices takes the dark of its two concave corners over its whole height (the old 'charcoal chimney')."""
    edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > step * 1.5
             and abs((e.verts[0].co.xy - e.verts[1].co.xy).length) < abs(e.verts[0].co.z - e.verts[1].co.z)]
    for e in edges:
        n = int(abs(e.verts[0].co.z - e.verts[1].co.z) / step)
        bmesh.ops.subdivide_edges(bm, edges=[e], cuts=n, use_grid_fill=False)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    return bm


def build_lighthouse(name='lighthouse', loc=(0, 0, 0), rz=0.0, family='lighthouse'):
    root = empty(name, loc, (0, 0, rz), family=family)
    # the hero's own stone: light warm granite ashlar that catches the golden light, paler dressed quoins and bands;
    # a white-painted lantern under a black iron dome with brass trim (the lamp is the only saturated light up here)
    g, gl_ = lin('#D6CAB2'), lin('#EDE5D3')
    paint, dome_c = lin('#F4F1EA'), lin('#23282B')
    # --- stone platform the tower stands on (its retaining wall runs down into the knoll)
    pl = bm_cyl(7.3 / math.cos(math.pi / 8), 7.3 / math.cos(math.pi / 8), 4.2, 8, (0, 0, -4.0), rot=math.pi / 8)
    obj(name + '_platform', _rings(pl), lin('#C9BDA5'), PT['ashlar'], parent=root, family=family, seed=2)
    pc = bm_cyl(7.55 / math.cos(math.pi / 8), 7.55 / math.cos(math.pi / 8), 0.32, 8, (0, 0, 0.0), rot=math.pi / 8)
    obj(name + '_platform_coping', pc, gl_, PT['plain'], parent=root, bevel=0.04, family=family)
    # --- square masonry base
    B, HB = 8.6, 5.2
    stone = bm_box2(-B / 2, -B / 2, -1.5, B / 2, B / 2, HB)
    obj(name + '_base', _rings(stone), g, PT['ashlar'], parent=root, bevel=0.06, family=family)
    q = bm_box2(-B / 2 - 0.25, -B / 2 - 0.25, -1.5, B / 2 + 0.25, B / 2 + 0.25, 0.7)  # plinth
    merge(q, bm_box2(-B / 2 - 0.3, -B / 2 - 0.3, HB - 0.1, B / 2 + 0.3, B / 2 + 0.3, HB + 0.55))  # cornice
    for sx in (-1, 1):
        for sy in (-1, 1):
            for k in range(5):  # alternating long/short quoins
                z0 = 0.7 + k * 0.9
                ax, ay = (1.1, 0.7) if k % 2 == 0 else (0.7, 1.1)
                xa, xb = sorted((sx * (B / 2 - ax), sx * (B / 2 + 0.08)))
                ya, yb = sorted((sy * (B / 2 - ay), sy * (B / 2 + 0.08)))
                merge(q, bm_box2(xa, ya, z0, xb, yb, z0 + 0.82))
    obj(name + '_dressings', q, gl_, PT['ashlar'], parent=root, bevel=0.04, family=family, seed=3)
    # door (raised) on -y face + keeper's stair along the face
    zd = 2.4
    dr = bmesh.new()
    merge(dr, bm_box2(-1.6, -B / 2 - 0.06, zd, -0.4, -B / 2 + 0.05, zd + 2.3))
    obj(name + '_door', dr, PAL['door_green'], PT['boards'], parent=root, family=family)
    fr = bmesh.new()
    merge(fr, bm_box2(-1.95, -B / 2 - 0.2, zd + 2.3, -0.05, -B / 2 + 0.05, zd + 2.75))
    for x in (-1.85, -0.15):
        merge(fr, bm_box2(x - 0.17, -B / 2 - 0.16, zd, x + 0.17, -B / 2 + 0.05, zd + 2.3))
    st = bmesh.new()
    merge(st, bm_box2(-2.2, -B / 2 - 1.5, zd - 0.25, 0.2, -B / 2, zd))  # landing
    nst = 8
    for k in range(nst):
        x0 = 0.2 + k * 0.42
        ztop = zd - (k + 1) * (zd / (nst + 0.5))
        merge(st, bm_box2(x0, -B / 2 - 1.5, -1.0, x0 + 0.42, -B / 2, ztop + zd / (nst + 0.5)))
    obj(name + '_stair', st, gl_, PT['ashlar'], parent=root, bevel=0.03, family=family, seed=5)
    obj(name + '_doorframe', fr, gl_, PT['plain'], parent=root, bevel=0.03, family=family)
    rail = bmesh.new()
    pts = [Vector((-2.2, -B / 2 - 1.45, zd)), Vector((0.2, -B / 2 - 1.45, zd)), Vector((0.2 + nst * 0.42, -B / 2 - 1.45, 0.05))]
    for a_, b_ in zip(pts, pts[1:]):
        merge(rail, line3(a_ + Vector((0, 0, 1.0)), b_ + Vector((0, 0, 1.0)), 0.04))
        for t in (0.0, 0.5, 1.0):
            p = a_.lerp(b_, t)
            merge(rail, line3(p, p + Vector((0, 0, 1.0)), 0.035))
    obj(name + '_stairrail', rail, PAL['iron'], PT['metal'], parent=root, family=family)
    # --- octagonal middle shaft
    z0, z1 = HB + 0.55, 19.5
    oc = bm_cyl(3.25 / math.cos(math.pi / 8), 2.75 / math.cos(math.pi / 8), z1 - z0, 8, (0, 0, z0), rot=math.pi / 8)
    obj(name + '_shaft_oct', _rings(oc), g, PT['ashlar'], parent=root, bevel=0.07, bevel_angle=30, family=family, seed=7)
    bands = bmesh.new()
    for zb, rr in ((z0, 3.45), (12.3, 3.15), (z1 - 0.35, 2.95)):
        merge(bands, bm_cyl(rr / math.cos(math.pi / 8), rr / math.cos(math.pi / 8), 0.4, 8, (0, 0, zb), rot=math.pi / 8))
    obj(name + '_bands', bands, gl_, PT['plain'], parent=root, bevel=0.04, family=family)
    # windows on the octagon (faces normal along axes/diagonals)
    glass = bmesh.new(); gls = []; trim = bmesh.new()
    for zc, ang in ((8.6, 0), (11.4, 315), (14.6, 45), (17.2, 0)):
        a = math.radians(ang)
        r = 3.25 + (2.75 - 3.25) * (zc - z0) / (z1 - z0)
        nrm = Vector((math.cos(a), math.sin(a), 0)); t = Vector((-nrm.y, nrm.x, 0))
        add_window(trim, glass, nrm * r + Vector((0, 0, zc)), t, nrm, 0.55, 1.2, mull=False, sill=True,
                   rng=random.Random(int(zc * 10)), lit_p=0.9, gl_list=gls)
    # --- round upper shaft
    z2 = 25.0
    rs = bm_cyl(2.55, 2.35, z2 - z1, 24, (0, 0, z1))
    obj(name + '_shaft_round', _rings(rs), g, PT['ashlar'], parent=root, smooth=True, family=family, seed=9)
    for zc, ang in ((22.0, 0),):
        a = math.radians(ang); nrm = Vector((math.cos(a), math.sin(a), 0)); t = Vector((-nrm.y, nrm.x, 0))
        add_window(trim, glass, nrm * 2.43 + Vector((0, 0, zc)), t, nrm, 0.5, 1.0, mull=False, rng=random.Random(4),
                   lit_p=1.0, gl_list=gls)
    obj(name + '_wintrim', trim, gl_, PT['plain'], parent=root, family=family)
    glass_obj(name + '_glass', glass, gls, root, family)
    # --- corbelled gallery
    cb = bmesh.new()
    merge(cb, bm_cyl(2.62, 2.62, 0.4, 24, (0, 0, z2)))
    merge(cb, bm_cyl(2.9, 2.9, 0.35, 24, (0, 0, z2 + 0.4)))
    for k in range(16):
        a = 2 * math.pi * k / 16
        merge(cb, obox((math.cos(a) * 2.75, math.sin(a) * 2.75, z2 + 0.15), (-math.sin(a), math.cos(a), 0), 0.42, 0.7, 0.9))
    obj(name + '_corbels', cb, g, PT['ashlar'], parent=root, family=family, seed=11)
    zg = z2 + 0.75
    slab = bm_cyl(3.45, 3.45, 0.46, 24, (0, 0, zg))
    obj(name + '_gallery', slab, paint, PT['plain'], parent=root, bevel=0.05, family=family)
    zg += 0.42
    rl = bmesh.new()
    for k in range(24):
        a = 2 * math.pi * k / 24
        p = Vector((math.cos(a) * 3.25, math.sin(a) * 3.25, zg))
        merge(rl, line3(p, p + Vector((0, 0, 1.1)), 0.065))
    for zz, rr in ((zg + 1.1, 0.095), (zg + 0.58, 0.06)):
        ring = [Vector((math.cos(2 * math.pi * k / 24) * 3.25, math.sin(2 * math.pi * k / 24) * 3.25, zz)) for k in range(25)]
        for a_, b_ in zip(ring, ring[1:]):
            merge(rl, bm_rod(a_, b_, rr, 4))
    obj(name + '_railing', rl, PAL['iron'], PT['metal'], parent=root, family=family)
    # --- lantern room
    zl = zg
    ped = bm_cyl(1.95, 1.95, 0.9, 16, (0, 0, zl))
    obj(name + '_lantern_base', ped, paint, PT['metal'], parent=root, family=family, bevel=0.03)
    zl += 0.9
    gh = 2.1
    lg = bm_cyl(1.82, 1.82, gh, 16, (0, 0, zl), cap=False)
    obj(name + '_lantern_glass', lg, mat=M['lantern_glass'], parent=root, family=family, shadow=False)
    mu = bmesh.new()
    for k in range(16):
        a = 2 * math.pi * (k + 0.5) / 16
        merge(mu, obox((math.cos(a) * 1.84, math.sin(a) * 1.84, zl + gh / 2), (-math.sin(a), math.cos(a), 0), 0.07, 0.07, gh))
    for zz in (zl + 0.04, zl + gh * 0.5, zl + gh - 0.04):
        merge(mu, bm_cyl(1.88, 1.88, 0.08, 16, (0, 0, zz - 0.04)))
    obj(name + '_astragals', mu, paint, PT['metal'], parent=root, family=family)
    # Fresnel lens: stacked prism rings, brass frame
    lens = bmesh.new()
    zc = zl + 0.15
    for k, (ra, rb, hh) in enumerate(((0.55, 0.85, 0.3), (0.85, 0.95, 0.35), (0.95, 0.95, 0.5), (0.95, 0.85, 0.35), (0.85, 0.5, 0.3))):
        merge(lens, bm_cyl(ra, rb, hh, 16, (0, 0, zc)))
        zc += hh
    obj(name + '_lens', lens, mat=M['lens'], parent=root, family=family, smooth=False, shadow=False)
    lf = bmesh.new()
    for zz in (zl + 0.15, zl + 0.8, zl + 1.3, zl + 1.95):
        merge(lf, bm_cyl(0.99, 0.99, 0.05, 16, (0, 0, zz)))
    merge(lf, bm_cyl(0.25, 0.25, 0.15, 8, (0, 0, zl)))
    obj(name + '_lensframe', lf, PAL['brass'], PT['metal'], parent=root, family=family)
    zl += gh
    cor = bm_cyl(2.12, 2.12, 0.28, 16, (0, 0, zl))
    obj(name + '_dome_ring', cor, PAL['brass'], PT['metal'], parent=root, family=family)
    dome = bm_cyl(2.02, 1.55, 0.55, 16, (0, 0, zl + 0.28))
    merge(dome, bm_cyl(1.55, 0.35, 0.95, 16, (0, 0, zl + 0.83)))
    obj(name + '_dome', dome, dome_c, PT['metal'], parent=root, family=family, smooth=False)
    top = bm_sphere(0.38, (0, 0, zl + 2.0), 10, 6)
    merge(top, bm_cyl(0.06, 0.03, 1.4, 6, (0, 0, zl + 2.2)))
    merge(top, obox((0.25, 0, zl + 3.0), (1, 0, 0), 0.9, 0.04, 0.2))  # vane
    obj(name + '_finial', top, PAL['brass'], PT['metal'], parent=root, family=family, smooth=True)
    lamp = empty(name + '_lamp', (0, 0, zl - gh / 2), parent=root, family=family)
    return root, Vector(loc) + Vector((0, 0, zl - gh / 2))


def build_oil_store(name, loc, rz=0.0, family='lighthouse'):
    root = empty(name, loc, (0, 0, rz), family=family)
    w, d, h = 4.2, 3.2, 2.6
    obj(name + '_walls', bm_box2(-w / 2, -d / 2, -1.5, w / 2, d / 2, h), PAL['stone_white'], PT['render'], parent=root,
        bevel=0.05, family=family)
    # barrel vault roof (half cylinder along x)
    v = bm_cyl(d / 2 + 0.25, d / 2 + 0.25, w + 0.4, 12, (0, 0, -(w + 0.4) / 2), cap=True)
    xf(v, ry=math.pi / 2); xf(v, loc=(0, 0, h))
    bmesh.ops.bisect_plane(v, geom=v.verts[:] + v.edges[:] + v.faces[:], plane_co=(0, 0, h), plane_no=(0, 0, 1), clear_inner=True)
    bmesh.ops.contextual_create(v, geom=[e for e in v.edges if e.is_boundary])
    obj(name + '_roof', v, PAL['roof_slate'], PT['slate'], parent=root, family=family)
    dr = bm_box2(-0.5, -d / 2 - 0.06, 0, 0.5, -d / 2 + 0.02, 1.9)
    obj(name + '_door', dr, PAL['iron'], PT['metal'], parent=root, family=family)
    return root


def build_signal_mast(name, loc, family='lighthouse'):
    root = empty(name, loc, family=family)
    bm = bm_cyl(0.22, 0.12, 15.0, 8, (0, 0, 0))
    obj(name + '_pole', bm, PAL['wall_white'], PT['plain'], parent=root, family=family)
    y = beam((0, -3.2, 11.2), (0, 3.2, 11.2), 0.14, 0.14)
    merge(y, beam((0, 0, 8.0), (-2.6, 0, 9.4), 0.12, 0.12))
    obj(name + '_yard', y, PAL['tar'], PT['plain'], parent=root, family=family)
    base = bm_box2(-0.9, -0.9, -1, 0.9, 0.9, 0.5)
    obj(name + '_foot', base, PAL['granite_light'], PT['ashlar'], parent=root, family=family, bevel=0.04)
    ln = bmesh.new()
    for p in ((4.5, 0, 0), (-3.2, 3.2, 0), (-3.2, -3.2, 0)):
        merge(ln, line3((0, 0, 13.5), p, 0.025))
    merge(ln, line3((0, -3.0, 11.2), (0, -3.0, 7.0), 0.02))
    merge(ln, line3((0, 3.0, 11.2), (0, 3.0, 8.6), 0.02))
    obj(name + '_lines', ln, PAL['tar'], PT['plain'], parent=root, family=family)
    # storm cone (point down) + signal flags
    cone = bm_cyl(0.0, 0.7, 1.2, 10, (0, -3.0, 5.8))
    obj(name + '_cone', cone, PAL['iron'], PT['plain'], parent=root, family=family)
    fl = bmesh.new()
    for k, (zz, c) in enumerate(((8.6, PAL['brand_red']), (7.5, PAL['wall_ochre']))):
        merge(fl, bm_box2(-0.02, 3.0, zz - 0.9, 0.02, 4.2, zz))
    obj(name + '_flags', fl, face=lambda q: ((PAL['brand_red'] if q.center.z > 7.7 else PAL['flower_w']), 0), parent=root,
        family=family)
    return root


# =================================================================== HULLS + RIGS
CLASS_LOA = dict(flagship=26.0, large=18.0, medium=13.0, small=10.0, boat=7.5, skiff=5.0)

FAMILY = {
    # beam ratio, freeboard ratio, draft ratio, bow fullness exp, stern width, sheer (bow, stern)
    'ship': dict(br=0.255, fb=0.115, dr=0.07, bow=2.2, stern=0.62, sheer=(0.35, 0.18), bulwark=0.9),
    'brig': dict(br=0.29, fb=0.12, dr=0.075, bow=2.6, stern=0.66, sheer=(0.3, 0.2), bulwark=0.8),
    'schooner': dict(br=0.245, fb=0.095, dr=0.06, bow=2.0, stern=0.5, sheer=(0.3, 0.15), bulwark=0.5),
    'sloop': dict(br=0.31, fb=0.1, dr=0.06, bow=2.0, stern=0.55, sheer=(0.25, 0.12), bulwark=0.2),
    'cat': dict(br=0.42, fb=0.11, dr=0.05, bow=3.0, stern=0.8, sheer=(0.2, 0.1), bulwark=0.12),
    'botter': dict(br=0.37, fb=0.12, dr=0.05, bow=6.0, stern=0.7, sheer=(0.75, 0.3), bulwark=0.25),
    'lugger': dict(br=0.33, fb=0.11, dr=0.06, bow=2.5, stern=0.55, sheer=(0.3, 0.15), bulwark=0.2),
}


def hull_mesh(L, P, cols, n=10):
    """Lofted hull, bow +x, waterline z=0. cols = dict(top, band, stripe, low, boot, bottom, deck, rail)."""
    B = L * P['br']; fb = L * P['fb']; dr = L * P['dr']; bh = min(P['bulwark'], fb * 0.45)
    bm = bmesh.new(); secs = []
    # (y-frac of w, z) profile points from inner-deck to keel; seg colours keyed by index
    for i in range(n + 1):
        u = -1 + 2 * i / n
        if u >= 0:
            w = B / 2 * max(0.0, 1 - u ** P['bow']) ** 0.5
        else:
            w = B / 2 * (1 - (1 - P['stern']) * u ** 2)
        if i == n:
            w = 0.03
        sb, ss = P['sheer']
        zt = fb * (1 + (sb if u > 0 else ss) * u * u)
        zk = -dr * (1 - abs(u) ** 3 * 0.6)
        prof = [(w - 0.12 - bh * 0.15, zt - bh), (w - 0.12, zt), (w, zt), (w * 0.995, zt - fb * 0.16),
                (w * 0.985, zt - fb * 0.34), (w * 0.965, zt - fb * 0.48), (w * 0.93, fb * 0.13), (w * 0.9, 0.0),
                (w * 0.62, zk * 0.7), (0.0, zk)]
        ring = [bm.verts.new((u * L / 2, y, z)) for y, z in prof]
        ring_s = [bm.verts.new((u * L / 2, -y, z)) for y, z in prof[:-1]]
        secs.append((ring, ring_s))
    names = ['deck_in', 'rail', 'top', 'band', 'stripe', 'boot', 'bottom', 'deck', 'transom']
    segc = ['deck_in', 'rail', 'top', 'band', 'stripe', 'top', 'boot', 'bottom', 'bottom']
    tags = bm.faces.layers.int.new('seg')
    for (ra, sa), (rb, sb_) in zip(secs, secs[1:]):
        for j in range(len(ra) - 1):
            a1, a2 = ra[j], ra[j + 1]; b1, b2 = rb[j], rb[j + 1]
            f = bm.faces.new((a1, b1, b2, a2)); f[tags] = names.index(segc[j])
            sa1 = sa[j]; sb1 = sb_[j]
            sa2 = sa[j + 1] if j + 1 < len(sa) else ra[-1]
            sb2 = sb_[j + 1] if j + 1 < len(sb_) else rb[-1]
            f2 = bm.faces.new((sa1, sa2, sb2, sb1)); f2[tags] = names.index(segc[j])
        fd = bm.faces.new((ra[0], sa[0], sb_[0], rb[0])); fd[tags] = names.index('deck')
    r0, s0 = secs[0]
    ft = bm.faces.new(r0 + s0[::-1]); ft[tags] = names.index('transom')
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.02)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.faces.index_update()
    return bm, names, dict(B=B, fb=fb, dr=dr, bh=bh)


def build_boat(name, rig, cls, brand, state='docked', heel=0.0, tack=1, emblem=0, hull_cols=None, cloth=None,
               loc=(0, 0, 0), heading=0.0, family=None, seed=0):
    """rig in {'ship','brig','schooner','sloop','cat','botter','lugger'}; state 'docked'|'sailing'."""
    fam = family or ('hull_' + rig + '_' + cls)
    rng = random.Random(seed)
    L = CLASS_LOA[cls]
    P = FAMILY[rig]
    root = empty(name, loc, (0, 0, heading), family=fam)
    rootH = empty(name + '_heel', (0, 0, 0), (heel * tack, 0, 0), parent=root, family=fam)
    hc = dict(top=PAL['hull_white'], band=PAL['hull_white'], stripe=brand, rail=PAL['tar'], boot=PAL['hull_white'],
              bottom=PAL['antifoul'], deck=PAL['deck'], deck_in=PAL['hull_white'], transom=PAL['hull_white'])
    hc.update(hull_cols or {})
    bm, names, D = hull_mesh(L, P, hc, n=14 if cls == 'flagship' else 10)
    lay = bm.faces.layers.int.get('seg')
    segs = {f.index: names[f[lay]] for f in bm.faces}
    pats = dict(deck=PT['planks_y'], deck_in=PT['boards'], top=PT['strakes'], band=PT['strakes'], bottom=PT['plain'])

    def fc(poly):
        k = segs.get(poly.index, 'top')
        return hc[k], pats.get(k, PT['plain'])
    hull = obj(name + '_hull', bm, face=fc, parent=rootH, family=fam, jitter=0.015, seed=seed)
    fb, B = D['fb'], D['B']
    zd = fb - D['bh']          # deck level
    deck = bmesh.new()
    S = L / 13.0  # scale relative to a 13 m hull
    # deckhouse / hatch
    if rig in ('ship', 'brig'):
        merge(deck, bm_box2(-L * 0.36, -B * 0.22, zd, -L * 0.2, B * 0.22, zd + 1.5 * S))
        merge(deck, bm_box2(L * 0.02, -B * 0.14, zd, L * 0.12, B * 0.14, zd + 0.6 * S))
    elif rig in ('schooner', 'sloop', 'lugger'):
        merge(deck, bm_box2(-L * 0.22, -B * 0.24, zd, L * 0.02, B * 0.24, zd + 0.85 * S))
    elif rig == 'botter':
        merge(deck, bm_box2(-L * 0.3, -B * 0.2, zd, -L * 0.12, B * 0.2, zd + 0.7 * S))
    elif rig == 'cat':
        merge(deck, bm_box2(-L * 0.1, -B * 0.26, zd, L * 0.12, B * 0.26, zd + 0.55 * S))
    if rig in ('ship', 'brig', 'schooner'):
        dk2 = bmesh.new()
        for xh in ((-0.06, 0.1) if rig != 'schooner' else (0.12,)):
            merge(dk2, bm_box2(L * xh - 0.9 * S, -B * 0.12, zd, L * xh + 0.9 * S, B * 0.12, zd + 0.35 * S))
        merge(dk2, bm_cyl(0.35 * S, 0.3 * S, 0.6 * S, 8, (L * 0.2, 0, zd)))
        merge(dk2, bm_box2(-L * 0.42, -0.25 * S, zd, -L * 0.4, 0.25 * S, zd + 0.9 * S))
        obj(name + '_deckgear', dk2, PAL['timber'], PT['boards'], parent=rootH, family=fam)
        if rig == 'ship':
            bt = bmesh.new()
            merge(bt, bm_cyl(0.55 * S, 0.45 * S, 0.5 * S, 8, (0, 0, -0.25 * S)))
            xf(bt, scale=(2.6, 1.0, 1.0)); xf(bt, loc=(-L * 0.08, B * 0.18, zd + 0.62 * S))
            obj(name + '_shipsboat', bt, PAL['hull_white'], PT['strakes'], parent=rootH, family=fam)
    obj(name + '_deck', deck, hc.get('house', PAL['hull_white']), PT['boards'], parent=rootH, family=fam)
    # portholes / cabin windows (night warmth)
    gls = bmesh.new(); gl = []
    if rig in ('schooner', 'sloop', 'cat', 'lugger', 'botter', 'ship', 'brig'):
        for k in range(2 if L < 12 else 3):
            x = -L * 0.18 + k * L * 0.07 if rig != 'ship' else -L * 0.33 + k * L * 0.05
            for s in (-1, 1):
                yy = s * (B * (0.245 if rig not in ('ship', 'brig') else 0.225) + 0.01)
                if rig == 'cat':
                    yy = s * (B * 0.265 + 0.01)
                    x = -L * 0.05 + k * L * 0.08
                zc = zd + (0.45 if rig not in ('ship', 'brig') else 0.8) * S
                merge(gls, bm_box2(x - 0.18 * S, yy - 0.02, zc - 0.13 * S, x + 0.18 * S, yy + 0.02, zc + 0.13 * S))
                gl.append((len(gls.faces) - 6, 1.0 if rng.random() < 0.7 else 0.0, 0.3))
    if len(gls.faces):
        glass_obj(name + '_ports', gls, gl, rootH, fam)
    # gunport chequer on ships
    if rig == 'ship':
        gp = bmesh.new()
        npt = 9 if rig == 'ship' else 4
        for k in range(npt):
            x = -L * 0.32 + k * (L * 0.64) / (npt - 1)
            u = 2 * x / L
            w = B / 2 * (max(0.0, 1 - u ** P['bow']) ** 0.5 if u >= 0 else (1 - (1 - P['stern']) * u * u))
            zc = fb * (1 + (P['sheer'][0] if u > 0 else P['sheer'][1]) * u * u) - fb * 0.25
            for s in (-1, 1):
                merge(gp, plaque((x, s * w * 0.995, zc), (1, 0, 0), (0, s, 0), 0.7 * S, 0.1, 0.44 * S))
        obj(name + '_gunports', gp, PAL['hull_black'], PT['plain'], parent=rootH, family=fam)
    # ------------------------------------------------ rig
    spar = bmesh.new(); lines = bmesh.new(); furl = bmesh.new(); cover = bmesh.new()
    boomb = bmesh.new(); boomcov = bmesh.new(); boom_info = None
    sails = []
    rope_r = 0.035 * max(0.7, S)
    bow = Vector((L / 2, 0, fb * (1 + P['sheer'][0])))
    stern = Vector((-L / 2, 0, fb * (1 + P['sheer'][1])))
    masts = []
    if rig == 'ship':
        masts = [(L * 0.28, 1.0 * L * 1.02, 'sq'), (-L * 0.02, 1.12 * L * 1.02, 'sq'), (-L * 0.3, 0.86 * L * 1.02, 'sq')]
    elif rig == 'brig':
        masts = [(L * 0.22, 1.05 * L, 'sq'), (-L * 0.12, 1.15 * L, 'sq+gaff')]
    elif rig == 'schooner':
        masts = [(L * 0.16, 1.0 * L, 'gaff'), (-L * 0.1, 1.12 * L, 'gaff')]
    elif rig in ('sloop',):
        masts = [(L * 0.1, 1.3 * L, 'gaff_bm')]
    elif rig == 'cat':
        masts = [(L * 0.33, 1.15 * L, 'gaff_cat')]
    elif rig == 'botter':
        masts = [(L * 0.15, 0.95 * L, 'botter')]
    elif rig == 'lugger':
        masts = [(L * 0.28, 0.85 * L, 'lug'), (-L * 0.15, 0.7 * L, 'lug')]
    bowsprit = 0.0
    if rig in ('ship', 'brig', 'schooner', 'sloop', 'lugger'):
        bowsprit = L * (0.28 if rig in ('ship', 'brig') else 0.22)
        bs_end = bow + Vector((bowsprit, 0, bowsprit * 0.22))
        merge(spar, bm_rod(bow - Vector((1.0 * S, 0, 0.25 * S)), bs_end, 0.09 * S, 6))
    tops = []
    main_k = max(range(len(masts)), key=lambda k: masts[k][1]) if masts else 0
    for mk, (mx, mh, kind) in enumerate(masts):
        r0 = 0.03 * L * 0.55 if L > 12 else 0.022 * L * 0.7
        r0 = max(0.09, min(0.32, r0))
        top = Vector((mx, 0, zd + mh))
        mesh = bm_cyl(r0, r0 * 0.55, mh, 6, (mx, 0, zd - 0.2))
        if rig == 'botter':  # slight forward rake
            xf(mesh, loc=(-mx, 0, -zd), ry=0.0); xf(mesh, ry=math.radians(-4)); xf(mesh, loc=(mx, 0, zd))
        merge(spar, mesh)
        tops.append(top)
        if mk == main_k:
            ml = empty(name + '_masthead_light', (mx, 0, zd + mh + 0.15), parent=rootH, family=fam)
        # shrouds (2 per side) to the chainplates
        for s in (-1, 1):
            for dx in ((-0.6 * S, 0.5 * S) if rig != 'brig' else (-0.1 * S,)):
                merge(lines, line3((mx + dx, s * B * 0.47, fb * 0.95), (mx, 0, zd + mh * (0.62 if 'sq' in kind else 0.86)), rope_r))
        if kind.startswith('sq'):
            ny = 3 if rig == 'ship' else 3
            for yk in range(ny):
                f = 0.42 + yk * 0.2
                span = B * (1.55 - yk * 0.33) * (1.0 if mk == main_k else 0.92)
                zy = zd + mh * f
                merge(spar, bm_rod((mx, -span / 2, zy), (mx, span / 2, zy), 0.065 * S, 5))
                if state == 'docked':
                    merge(furl, bm_rod((mx + 0.08 * S, -span * 0.44, zy - 0.08 * S), (mx + 0.08 * S, span * 0.44, zy - 0.08 * S), 0.12 * S, 6))
                else:
                    zb = zd + mh * (f - 0.19) if yk > 0 else zd + mh * 0.2
                    sails.append(('sq', (mx, span, zy, zb, yk == 0 and mk == main_k)))
            # crosstrees/top
            merge(spar, bm_cyl(0.6 * S, 0.6 * S, 0.12 * S, 4, (mx, 0, zd + mh * 0.6), cap=False))
        if 'gaff' in kind or kind in ('botter',):
            blen = (L * 0.42 if kind == 'gaff_bm' else L * 0.32 if kind == 'gaff' else L * 0.55 if kind == 'gaff_cat'
                    else L * 0.36 if kind == 'sq+gaff' else L * 0.42)
            if kind == 'gaff' and mk == 0:
                blen = abs(masts[0][0] - masts[1][0]) * 0.92
            zb = zd + 1.1 * S
            ang = 0.0 if state == 'docked' else 0.42 * -tack
            bend = Vector((-math.cos(ang) * blen, -math.sin(ang) * blen, 0.15 * S))
            if mk == main_k and boom_info is None:
                boom_info = (Vector((mx, 0, zb)), ang)
                merge(boomb, bm_rod((0, 0, 0), bend, 0.09 * S, 6))
            else:
                merge(spar, bm_rod((mx, 0, zb), Vector((mx, 0, zb)) + bend, 0.09 * S, 6))
            gaff_len = blen * (0.62 if kind != 'botter' else 0.42)
            if state == 'docked':
                # gaff lowered on the boom, sail flaked under a brand cover
                cv = bm_cyl(0.28 * S, 0.17 * S, blen * 0.9, 8, (0, 0, 0))
                xf(cv, ry=-math.pi / 2)
                if boom_info is not None and boom_info[0].x == mx:
                    xf(cv, loc=(-0.1 * S, 0, 0.27 * S)); merge(boomcov, cv)
                else:
                    xf(cv, loc=(mx - 0.1 * S, 0, zb + 0.27 * S)); merge(cover, cv)
                merge(spar, bm_rod((mx, 0, zb + 0.55 * S), (mx - gaff_len, 0, zb + 0.6 * S), 0.07 * S, 5))
            else:
                hz = zd + mh * (0.86 if kind != 'sq+gaff' else 0.78)
                peak_up = math.radians(38 if kind != 'botter' else 55)
                gend = Vector((mx, 0, hz)) + Vector((-math.cos(ang) * gaff_len * math.cos(peak_up),
                                                      -math.sin(ang) * gaff_len * math.cos(peak_up), gaff_len * math.sin(peak_up)))
                merge(spar, bm_rod((mx, 0, hz), gend, 0.07 * S, 5))
                sails.append(('gaff', (Vector((mx, 0, zb + 0.15)), Vector((mx, 0, hz)), gend, Vector((mx, 0, zb + 0.15)) + bend,
                                       mk == main_k)))
            # topping lift
            merge(lines, line3(top, Vector((mx, 0, zb)) + bend * 0.97, rope_r * 0.8))
        if kind == 'lug':
            yl = L * 0.4
            if state == 'sailing':
                hz = zd + mh * 0.92
                ya = Vector((mx + yl * 0.25, 0, hz - yl * 0.2)); yb = Vector((mx - yl * 0.75, 0, hz + yl * 0.35))
                merge(spar, bm_rod(ya, yb, 0.07 * S, 5))
                sails.append(('lug', (ya, yb, Vector((mx - yl * 0.8, -0.3 * tack, zd + 0.6)), Vector((mx + yl * 0.2, 0, zd + 0.6)), mk == 0)))
            else:
                cv = bm_cyl(0.22 * S, 0.15 * S, yl, 8, (0, 0, 0)); xf(cv, ry=-math.pi / 2); xf(cv, loc=(mx + yl * 0.3, 0, zd + 0.5))
                merge(cover, cv)
    # stays: forestay to bowsprit/bow, backstay, springs between masts
    if tops:
        fore = tops[0]
        tgt = bow + Vector((bowsprit, 0, bowsprit * 0.22)) if bowsprit else bow
        merge(lines, line3(fore - Vector((0, 0, 0.3)), tgt, rope_r))
        if bowsprit and rig in ('ship', 'brig', 'schooner'):
            merge(lines, line3(fore - Vector((0, 0, (fore.z - zd) * 0.3)), bow + Vector((bowsprit * 0.6, 0, bowsprit * 0.13)), rope_r))
        for a_, b_ in zip(tops, tops[1:]):
            merge(lines, line3(b_ - Vector((0, 0, 0.4)), a_ - Vector((0, 0, (a_.z - zd) * 0.12)), rope_r))
        if rig not in ('cat', 'botter'):
            merge(lines, line3(tops[-1], stern + Vector((0.4, 0, 0)), rope_r))
        # jib(s)
        if rig in ('sloop', 'schooner', 'ship', 'brig', 'botter'):
            if state == 'sailing':
                sails.append(('jib', (fore - Vector((0, 0, 0.5 * S)), tgt, Vector((fore.x + 0.4 * S, -tack * B * 0.3, zd + 0.7 * S)))))
            else:
                if rig in ('ship', 'brig'):
                    merge(furl, bm_rod(bow + Vector((0.5 * S, 0, 0.3 * S)), tgt - Vector((bowsprit * 0.15, 0, bowsprit * 0.0)), 0.1 * S, 6))
                else:
                    merge(furl, bm_rod(fore.lerp(tgt, 0.25), fore.lerp(tgt, 0.92), 0.075 * S, 6))
    # ------------------------------------------------ sails (set)
    sail_objs = []
    for si, (kind, prm) in enumerate(sails):
        sb = bmesh.new(); uvl = sb.loops.layers.uv.new('UVMap')
        if kind in ('gaff', 'lug'):
            tack_p, throat, peak, clew, is_main = prm
            quad = (tack_p, clew, peak, throat)      # foot (tack->clew), leech (clew->peak), head (peak->throat)
            nu, nv = 4, 4
            grid = []
            for i in range(nv + 1):
                v_ = i / nv; row = []
                for j in range(nu + 1):
                    u_ = j / nu
                    a_ = tack_p.lerp(throat, v_); b_ = clew.lerp(peak, v_)
                    p = a_.lerp(b_, u_)
                    p.y += -tack * 0.07 * L * math.sin(math.pi * u_) * (0.35 + 0.65 * (1 - v_))
                    row.append((sb.verts.new(p), (u_, v_)))
                grid.append(row)
        elif kind == 'jib':
            head, tk, clw = prm; is_main = False
            nu, nv = 3, 4; grid = []
            for i in range(nv + 1):
                v_ = i / nv; row = []
                for j in range(nu + 1):
                    u_ = j / nu
                    p = tk.lerp(clw, u_).lerp(head, v_)
                    p.y += -tack * 0.05 * L * math.sin(math.pi * u_) * (1 - v_)
                    row.append((sb.verts.new(p), (u_, v_)))
                grid.append(row)
        else:  # square
            mx, span, zy, zb, is_main = prm
            nu, nv = 3, 2; grid = []
            for i in range(nv + 1):
                v_ = i / nv; row = []
                for j in range(nu + 1):
                    u_ = j / nu
                    wdt = span * (0.9 + 0.12 * (1 - v_))
                    y = -wdt / 2 + wdt * u_
                    z = zb + (zy - zb) * v_
                    x = mx + 0.25 * S + 0.06 * L * math.sin(math.pi * u_) * math.sin(math.pi * (0.15 + 0.85 * (1 - v_)) / 1.0) * 0.6
                    row.append((sb.verts.new((x, y, z)), (u_, v_)))
                grid.append(row)
        for i in range(len(grid) - 1):
            for j in range(len(grid[0]) - 1):
                vs = [grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]]
                f = sb.faces.new([q[0] for q in vs])
                for lp, q in zip(f.loops, vs):
                    lp[uvl].uv = q[1]
        bmesh.ops.remove_doubles(sb, verts=sb.verts, dist=0.001)
        nm = name + ('_sail_main' if is_main else ('_sail_jib' if kind == 'jib' else f'_sail_{si}'))
        so = obj(nm, sb, mat=M['sail'], parent=rootH, family=fam, smooth=True,
                 props={'emblem': float(emblem), 'emblem_on': 1.0 if is_main else 0.0})
        so.color = (*(cloth or PAL['canvas']), 1)
        sail_objs.append(so)
    if len(spar.faces):
        obj(name + '_mast', spar, PAL['timber'] if rig not in ('ship', 'brig') else PAL['timber_dark'], PT['plain'],
            parent=rootH, family=fam, smooth=True)
    if len(lines.faces):
        obj(name + '_rigging', lines, PAL['tar'], PT['plain'], parent=rootH, family=fam, shadow=True)
    if len(furl.faces):
        fc_ = cloth if (cloth and rig in ('botter', 'lugger')) else PAL['canvas']
        obj(name + '_sail_furled', furl, fc_, PT['plain'], parent=rootH, family=fam, smooth=True, jitter=0.03)
    if boom_info is not None:
        bo = obj(name + '_boom', boomb, PAL['timber'], PT['plain'], parent=rootH, family=fam, smooth=True, loc=tuple(boom_info[0]))
        if len(boomcov.faces):
            obj(name + '_sail_cover', boomcov, brand, PT['plain'], parent=bo, family=fam, smooth=True)
        else:
            boomcov.free()
    else:
        boomb.free(); boomcov.free()
    if len(cover.faces):
        obj(name + '_sail_cover_fore', cover, brand, PT['plain'], parent=rootH, family=fam, smooth=True)
    else:
        cover.free()
    # botter leeboards (fan boards hung on both sides)
    if rig == 'botter':
        for s in (-1, 1):
            lb = bmesh.new()
            down = (s == tack and state == 'sailing')
            ln_ = L * 0.3
            pts = [Vector((0.6, 0, 0)), Vector((-0.6, 0, 0)), Vector((-ln_ * 0.45, 0, -ln_)), Vector((ln_ * 0.25, 0, -ln_ * 0.95))]
            if not down:
                pts = [Vector((p.x, 0, p.z * 0.45)) if i > 1 else p for i, p in enumerate(pts)]
                pts = [Vector((p.x - (p.z * 0.9 if i > 1 else 0), 0, p.z * (0.7 if i > 1 else 1))) for i, p in enumerate(pts)]
            vs = [lb.verts.new(p) for p in pts]
            lb.faces.new(vs)
            bmesh.ops.solidify(lb, geom=lb.faces[:], thickness=0.12)
            xf(lb, loc=(L * 0.08, s * (B / 2 + 0.05), fb * 1.05))
            obj(name + f'_leeboard{s}', lb, PAL['tar'], PT['boards'], parent=rootH, family=fam)
    # ensign / house flag at the main truck (emblem filled)
    if tops:
        tp = tops[main_k]
        fl = bmesh.new(); uvl = fl.loops.layers.uv.new('UVMap')
        fw_, fh_ = 1.6 * S, 1.1 * S
        vs = [fl.verts.new(v) for v in ((tp.x, 0, tp.z + 0.1), (tp.x - fw_, 0.05, tp.z + 0.1),
                                          (tp.x - fw_, 0.05, tp.z + 0.1 + fh_), (tp.x, 0, tp.z + 0.1 + fh_))]
        f = fl.faces.new(vs)
        for lp, uv in zip(f.loops, ((0.29, 0.29), (0.71, 0.29), (0.71, 0.71), (0.29, 0.71))):
            lp[uvl].uv = uv
        fo = obj(name + '_flag', fl, mat=M['sail'], parent=rootH, family=fam, props={'emblem': float(emblem), 'emblem_on': 1.0})
        fo.color = (*brand, 1)
    # cleats / light / wake empties (node contract)
    empty(name + '_bow_cleat', (L / 2 - 0.8 * S, 0, fb * (1 + P['sheer'][0] * 0.8)), parent=rootH, family=fam)
    empty(name + '_stern_cleat', (-L / 2 + 0.6 * S, 0, fb * (1 + P['sheer'][1] * 0.9)), parent=rootH, family=fam)
    empty(name + '_wake_origin', (-L / 2, 0, 0), parent=root, family=fam)
    info = dict(L=L, B=B, fb=fb, tops=tops, root=root, heel_root=rootH, sails=sail_objs)
    return root, info


# =================================================================== HARBOUR PIECES
def bollard(bm, p, s=1.0):
    x, y, z = p
    merge(bm, bm_cyl(0.2 * s, 0.17 * s, 0.55 * s, 8, (x, y, z)))
    merge(bm, bm_cyl(0.27 * s, 0.27 * s, 0.1 * s, 8, (x, y, z + 0.5 * s)))


def lamp_post(name, p, h=3.6, parent=None, family='prop_lamp', lamps=None):
    root = empty(name, p, parent=parent, family=family)
    bm = bm_cyl(0.18, 0.18, 0.5, 8, (0, 0, 0))
    merge(bm, bm_cyl(0.09, 0.06, h, 6, (0, 0, 0.4)))
    merge(bm, bm_cyl(0.32, 0.05, 0.3, 6, (0, 0, h + 0.75)))           # cap
    merge(bm, bm_cyl(0.08, 0.08, 0.2, 6, (0, 0, h + 1.02)))
    obj(name + '_post', bm, PAL['iron'], PT['metal'], parent=root, family=family)
    gl = bm_cyl(0.2, 0.26, 0.55, 6, (0, 0, h + 0.2))
    obj(name + '_glass', gl, mat=M['lamp'], parent=root, family=family, shadow=False)
    if lamps is not None:
        lamps.append(Vector(p) + Vector((0, 0, h + 0.45)))
    return root


def build_pier(name, segs, deck_z=1.2, family='pier', parent=None, lamps=None, pile_step=3.2):
    """segs: list of (x0, y0, x1, y1) axis-aligned deck rectangles (world/local). Planks run across the long axis."""
    root = empty(name, (0, 0, 0), parent=parent, family=family)
    dx_, dy_ = bmesh.new(), bmesh.new()
    under = bmesh.new(); piles = bmesh.new(); rails = bmesh.new()
    for (x0, y0, x1, y1) in segs:
        along_x = (x1 - x0) >= (y1 - y0)
        b = bm_box2(x0, y0, deck_z - 0.18, x1, y1, deck_z)
        merge(dx_ if along_x else dy_, b)
        # stringers + edge rub rails
        if along_x:
            for yy in (y0 + 0.15, y1 - 0.15):
                merge(under, bm_box2(x0, yy - 0.12, deck_z - 0.5, x1, yy + 0.12, deck_z - 0.18))
            for yy in (y0 - 0.05, y1 + 0.05):
                merge(rails, bm_box2(x0, yy - 0.07, deck_z - 0.38, x1, yy + 0.07, deck_z + 0.04))
            n = max(1, round((x1 - x0) / pile_step))
            for k in range(n + 1):
                xx = x0 + 0.2 + k * (x1 - x0 - 0.4) / n
                for yy in (y0 + 0.1, y1 - 0.1):
                    merge(piles, bm_cyl(0.22, 0.2, deck_z + 2.6 + 0.25, 4, (xx, yy, -2.6), cap=False, rot=0.785))
                merge(under, bm_box2(xx - 0.1, y0, deck_z - 0.62, xx + 0.1, y1, deck_z - 0.4))
                if k < n and (y1 - y0) > 2.5 and k % 2 == 0:
                    xn = x0 + 0.2 + (k + 1) * (x1 - x0 - 0.4) / n
                    merge(under, beam((xx, y0 + 0.05, deck_z - 0.5), (xn, y0 + 0.05, -0.3), 0.12, 0.14))
        else:
            for xx in (x0 + 0.15, x1 - 0.15):
                merge(under, bm_box2(xx - 0.12, y0, deck_z - 0.5, xx + 0.12, y1, deck_z - 0.18))
            for xx in (x0 - 0.05, x1 + 0.05):
                merge(rails, bm_box2(xx - 0.07, y0, deck_z - 0.38, xx + 0.07, y1, deck_z + 0.04))
            n = max(1, round((y1 - y0) / pile_step))
            for k in range(n + 1):
                yy = y0 + 0.2 + k * (y1 - y0 - 0.4) / n
                for xx in (x0 + 0.1, x1 - 0.1):
                    merge(piles, bm_cyl(0.22, 0.2, deck_z + 2.6 + 0.25, 4, (xx, yy, -2.6), cap=False, rot=0.785))
                merge(under, bm_box2(x0, yy - 0.1, deck_z - 0.62, x1, yy + 0.1, deck_z - 0.4))
                if k < n and (x1 - x0) > 2.5 and k % 2 == 0:
                    yn = y0 + 0.2 + (k + 1) * (y1 - y0 - 0.4) / n
                    merge(under, beam((x0 + 0.05, yy, deck_z - 0.5), (x0 + 0.05, yn, -0.3), 0.12, 0.14))
    if len(dx_.faces):
        obj(name + '_deck_x', dx_, PAL['timber_grey'], PT['planks_x'], parent=root, family=family, jitter=0.03)
    else:
        dx_.free()
    if len(dy_.faces):
        obj(name + '_deck_y', dy_, PAL['timber_grey'], PT['planks_y'], parent=root, family=family, jitter=0.03)
    else:
        dy_.free()
    obj(name + '_frame', under, PAL['timber_dark'], PT['plain'], parent=root, family=family)
    obj(name + '_rubrail', rails, PAL['timber'], PT['plain'], parent=root, family=family, jitter=0.06)
    obj(name + '_piles', piles, PAL['tar'], PT['plain'], parent=root, family=family, smooth=False)
    return root


# =================================================================== VEGETATION / PROPS
def spruce(bm_leaf, bm_trunk, p, h, rng):
    x, y, z = p
    merge(bm_trunk, bm_cyl(0.16 * h / 6, 0.1 * h / 6, h * 0.3, 3, (x, y, z), cap=False))
    tiers = 4 if h > 8 else 3
    for k in range(tiers):
        f = k / tiers
        r = h * 0.24 * (1 - f * 0.72)
        z0 = z + h * (0.16 + f * 0.62)
        th = h * 0.36 * (1 - f * 0.3)
        c = bm_cyl(r, 0.0, th, 7, (x, y, z0), rot=rng.uniform(0, 1), cap=False)
        for v in c.verts:
            if v.co.z < z0 + 0.05:
                v.co.z -= rng.uniform(0, 0.25) * h / 6
        merge(bm_leaf, c)


def birch(bm_leaf, bm_trunk, p, h, rng):
    x, y, z = p
    merge(bm_trunk, bm_cyl(0.14 * h / 7, 0.08 * h / 7, h * 0.75, 5, (x, y, z)))
    for k in range(3):
        o = Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 0)) * h / 7
        r = h * (0.24 - 0.04 * k)
        merge(bm_leaf, bm_ico(r, (x + o.x, y + o.y, z + h * (0.55 + 0.16 * k)), 1, (1, 1, 1.25), seed=rng.randint(0, 99), amp=0.25))


def crate(bm, p, s=1.0, rz=0.0):
    b = bm_box(1.0 * s, 0.8 * s, 0.75 * s, (0, 0, 0.375 * s)); xf(b, loc=p, rz=rz); merge(bm, b)


def barrel(bm, p, s=1.0):
    x, y, z = p
    merge(bm, bm_cyl(0.33 * s, 0.38 * s, 0.45 * s, 8, (x, y, z)))
    merge(bm, bm_cyl(0.38 * s, 0.33 * s, 0.45 * s, 8, (x, y, z + 0.45 * s)))


def dinghy(name, p, rz, L=4.0, col=None, upturned=False, family='prop_dinghy'):
    """Small rowboat (also the slipway boats)."""
    P = dict(br=0.36, fb=0.12, dr=0.04, bow=2.4, stern=0.7, sheer=(0.35, 0.12), bulwark=0.1)
    hc = dict(top=col or PAL['hull_white'], band=col or PAL['hull_white'], stripe=PAL['hull_white'], rail=PAL['timber'],
              boot=PAL['hull_white'], bottom=PAL['antifoul'], deck=PAL['timber'], deck_in=PAL['timber'], transom=col or PAL['hull_white'])
    bm, names, D = hull_mesh(L, P, hc, n=8)
    lay = bm.faces.layers.int.get('seg')
    segs = {f.index: names[f[lay]] for f in bm.faces}
    root = empty(name, p, (math.pi if upturned else 0, 0, rz), family=family)
    obj(name + '_hull', bm, face=lambda q: (hc[segs.get(q.index, 'top')], PT['strakes'] if segs.get(q.index) in ('top', 'band') else PT['plain']),
        parent=root, family=family)
    return root
