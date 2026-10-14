"""Style B land kit: parametric builders. Each returns a finished object (local origin at ground, +Z up,
front facade on local -Y). Children are named nodes the runtime can address (lens, light empties)."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise
from lib import *

TAU = 2 * math.pi


def lathe(k, prof, segs, color, mat='wash', smooth=True, cap_top=False, rot=0.0, uv='cyl', **kw):
    rows = []
    for (r, z) in prof:
        rows.append([(r * math.cos(rot + TAU * i / segs), r * math.sin(rot + TAU * i / segs), z) for i in range(segs)])
    fs, vs = k.quad_strip(rows, color, mat, closed=True, smooth=smooth, uv=uv, **kw)
    if cap_top:
        k.tri_fan((0, 0, prof[-1][1]), rows[-1], color, mat, uv=uv)
    return fs


def ring_tube(k, R, r, z, color, mat='iron', segs=32, rsegs=4):
    rows = []
    for i in range(segs + 1):
        a = TAU * i / segs
        rows.append([((R + r * math.cos(TAU * j / rsegs)) * math.cos(a), (R + r * math.cos(TAU * j / rsegs)) * math.sin(a),
                      z + r * math.sin(TAU * j / rsegs)) for j in range(rsegs)])
    return k.quad_strip(rows, color, mat, closed=True, uv=None)[0]


def window(k, c, n, w=0.8, h=1.2, frame=None, shutters=None, sill=True, cross=True, glow=1.0, mat_frame='wash',
           box_flowers=None, arch=False):
    """Window on a wall whose outward normal is n (unit, horizontal), centred at c (on the wall surface)."""
    frame = frame or P['frame']
    n = Vector(n).normalized()
    t = Vector((-n.y, n.x, 0))
    rz = math.atan2(n.y, n.x) - math.pi / 2
    R = Matrix.Rotation(rz, 4, 'Z')

    def B(size, off_t, off_n, off_z, col, mat, **kw):
        p = Vector(c) + t * off_t + n * off_n + Vector((0, 0, off_z))
        return k.box(size, (0, 0, 0), col, mat, M=Matrix.Translation(p) @ R, **kw)
    B((w + 0.22, 0.1, h + 0.22), 0, 0.03, 0, frame, mat_frame, jitter=0.02)
    gl = B((w, 0.06, h), 0, 0.07, 0, (1, 1, 1), 'window', jitter=0.0)
    for f in gl:
        a = random.random()
        warm = random.choice(((1, 1, 1), (1, 0.92, 0.8), (1, 0.85, 0.7)))
        for lp in f.loops:
            lp[k.cl] = (*warm, a)
    if cross:
        B((0.06, 0.1, h), 0, 0.09, 0, frame, mat_frame, jitter=0.0)
        B((w, 0.1, 0.06), 0, 0.09, h * 0.12, frame, mat_frame, jitter=0.0)
    if sill:
        B((w + 0.36, 0.26, 0.1), 0, 0.12, -h / 2 - 0.13, P['stone_warm'], 'wash')
    if shutters:
        for s in (-1, 1):
            B((w * 0.52, 0.06, h + 0.05), s * (w / 2 + 0.11 + w * 0.26), 0.06, 0, shutters, 'wash', jitter=0.05)
    if box_flowers:
        B((w + 0.2, 0.32, 0.26), 0, 0.2, -h / 2 - 0.36, P['wood_dark'], 'wash')
        for i in range(4):
            p = Vector(c) + t * ((i - 1.5) * (w + 0.1) / 4) + n * 0.24 + Vector((0, 0, -h / 2 - 0.12))
            col = random.choice(box_flowers)
            k.ico(0.17, tuple(p), col, 'foliage', sub=1, scale=(1.2, 1.0, 0.8), seed=random.randint(0, 99), amp=0.3, jitter=0.08)


def door(k, c, n, w=1.1, h=2.2, col=None, step=True, fan=False):
    col = col or P['shutter_ox']
    n = Vector(n).normalized()
    t = Vector((-n.y, n.x, 0))
    rz = math.atan2(n.y, n.x) - math.pi / 2
    R = Matrix.Rotation(rz, 4, 'Z')

    def B(size, off_t, off_n, off_z, cc, mat, **kw):
        p = Vector(c) + t * off_t + n * off_n + Vector((0, 0, off_z))
        return k.box(size, (0, 0, 0), cc, mat, M=Matrix.Translation(p) @ R, **kw)
    B((w + 0.4, 0.1, h + 0.25), 0, 0.03, h / 2 + 0.1, P['stone_warm'], 'stone')
    B((w, 0.08, h), 0, 0.06, h / 2, col, 'wood', jitter=0.03)
    if fan:
        gl = B((w * 0.8, 0.07, 0.35), 0, 0.08, h - 0.25, (1, 1, 1), 'window', jitter=0.0)
    if step:
        B((w + 0.6, 0.7, 0.18), 0, 0.35, 0.09, P['stone_dark'], 'stone')


# ======================================================================== lighthouse (D8)
def lighthouse(name='lighthouse'):
    k = Kit(name)
    st, stw, std = P['stone'], P['stone_warm'], P['stone_dark']
    # podium / square masonry base (battered), corner turned to the camera
    hs = 3.8
    k.cyl(hs * math.sqrt(2) + 0.25, hs * math.sqrt(2) + 0.25, 0.5, 4, (0, 0, -0.3), std, 'stone', rot=math.pi / 4, uv='box')
    k.cyl(hs * math.sqrt(2), (hs - 0.3) * math.sqrt(2), 5.2, 4, (0, 0, 0.2), st, 'stone', rot=math.pi / 4, uv='box', jitter=0.03)
    # quoins
    for sx in (-1, 1):
        for sy in (-1, 1):
            for i in range(7):
                z = 0.45 + i * 0.7
                inset = 0.3 * (z / 5.2)
                big = i % 2 == 0
                c = (sx * (hs - inset - (0.35 if big else 0.25) + 0.36), sy * (hs - inset - (0.25 if big else 0.35) + 0.36), z)
                k.box((0.8 if big else 0.55, 0.55 if big else 0.8, 0.62), c, stw, 'stone', jitter=0.05)
    # cornice + parapet
    k.cyl((hs + 0.25) * math.sqrt(2), (hs + 0.25) * math.sqrt(2), 0.4, 4, (0, 0, 5.3), std, 'stone', rot=math.pi / 4, uv='box')
    for (cx, cy, sx, sy) in ((0, -hs, 2 * hs + 0.5, 0.35), (0, hs, 2 * hs + 0.5, 0.35), (-hs, 0, 0.35, 2 * hs + 0.5), (hs, 0, 0.35, 2 * hs + 0.5)):
        k.box((sx, sy, 0.75), (cx, cy, 5.7 + 0.375), st, 'stone', jitter=0.03)
        k.box((sx + 0.1, sy + 0.1, 0.12), (cx, cy, 6.45 + 0.06), stw, 'stone')
    # door (raised) on -Y with keeper's stair along the face
    door(k, (-0.6, -hs + 0.02, 1.5), (0, -1, 0), w=1.2, h=2.3, col=P['shutter_ox'], step=False, fan=True)
    k.box((2.2, 1.4, 1.5), (-0.6, -hs - 0.7, 0.75), std, 'stone', jitter=0.03)          # landing
    for i in range(6):
        k.box((0.36, 1.2, 0.25 * (i + 1)), (0.7 + 0.36 * (5 - i) + 0.18, -hs - 0.6, 0.125 * (i + 1)), st, 'stone', jitter=0.04)
    k.box((2.6, 0.22, 0.6), (1.6, -hs - 1.32, 0.3 + 0.6 * 0.5 + 0.25), stw, 'stone')    # stair parapet
    # small windows in base
    window(k, (2.0, -hs - 0.0, 3.6), (0, -1, 0), 0.55, 0.9, shutters=None, cross=True)
    window(k, (-hs - 0.0, 0.8, 3.4), (-1, 0, 0), 0.55, 0.9, shutters=None, cross=True)
    # octagonal shaft
    z0, z1 = 6.5, 19.5
    r0, r1 = 2.95, 2.5
    k.cyl(r0 + 0.25, r0 + 0.2, 0.5, 8, (0, 0, z0 - 0.3), std, 'stone', rot=math.pi / 8, uv='box')
    k.cyl(r0, r1, z1 - z0, 8, (0, 0, z0), st, 'stone', rot=math.pi / 8, uv='box', jitter=0.025)
    for zz in (11.0, 15.4):
        f = (zz - z0) / (z1 - z0)
        rr = r0 + (r1 - r0) * f
        k.cyl(rr + 0.14, rr + 0.14, 0.32, 8, (0, 0, zz), std, 'stone', rot=math.pi / 8, uv='box')
    for (zz, ang) in ((8.6, 225), (13.1, 180), (13.1, 270), (17.4, 225)):
        f = (zz - z0) / (z1 - z0)
        rr = (r0 + (r1 - r0) * f) * math.cos(math.pi / 8)
        a = math.radians(ang)
        window(k, (math.cos(a) * rr, math.sin(a) * rr, zz), (math.cos(a), math.sin(a), 0), 0.6, 1.15, sill=True, cross=True)
    # round upper shaft
    z2 = 25.0
    k.cyl(r1 + 0.1, r1 + 0.1, 0.4, 24, (0, 0, z1), std, 'stone', smooth=True)
    k.cyl(2.3, 2.12, z2 - z1 - 0.4, 24, (0, 0, z1 + 0.4), stw, 'stone', smooth=True, jitter=0.0)
    window(k, (math.cos(math.radians(225)) * 2.22, math.sin(math.radians(225)) * 2.22, 22.4), (-1, -1, 0), 0.55, 1.0, sill=True)
    # corbels
    for i in range(16):
        a = TAU * (i + 0.5) / 16
        M = Matrix.Rotation(a, 4, 'Z')
        k.box((0.85, 0.36, 0.5), (2.5, 0, z2 - 0.25), std, 'stone', M=M, jitter=0.03)
        k.box((0.5, 0.36, 0.4), (2.35, 0, z2 - 0.7), std, 'stone', M=M, jitter=0.03)
    # gallery deck + railing
    k.cyl(3.15, 3.15, 0.35, 24, (0, 0, z2), std, 'stone', smooth=False)
    zg = z2 + 0.35
    for i in range(24):
        a = TAU * i / 24
        k.rod((3.0 * math.cos(a), 3.0 * math.sin(a), zg), (3.0 * math.cos(a), 3.0 * math.sin(a), zg + 1.05), 0.035, P['iron'], 'iron', segs=4)
    ring_tube(k, 3.0, 0.05, zg + 1.05, P['iron'], segs=32, rsegs=4)
    ring_tube(k, 3.0, 0.03, zg + 0.55, P['iron'], segs=32, rsegs=3)
    # lantern room
    k.cyl(1.9, 1.9, 0.9, 12, (0, 0, zg), P['iron'], 'iron', uv='cyl')
    zl = zg + 0.9
    k.cyl(1.78, 1.78, 2.6, 12, (0, 0, zl), (1, 1, 1), 'lantern_glass', cap=False)
    for i in range(12):
        a = TAU * i / 12
        k.rod((1.8 * math.cos(a), 1.8 * math.sin(a), zl), (1.8 * math.cos(a), 1.8 * math.sin(a), zl + 2.6), 0.05, P['iron'], 'iron', segs=4)
    ring_tube(k, 1.8, 0.05, zl + 1.3, P['iron'], segs=24, rsegs=3)
    k.cyl(2.0, 2.0, 0.22, 24, (0, 0, zl + 2.6), P['iron'], 'iron')
    zd = zl + 2.82
    lathe(k, [(2.0, zd), (1.9, zd + 0.25), (1.6, zd + 0.7), (1.15, zd + 1.1), (0.6, zd + 1.38), (0.3, zd + 1.48)], 24,
          P['hull_black'], 'brass', smooth=True, cap_top=True)
    k.sphere(0.36, (0, 0, zd + 1.8), P['brass'], 'brass', u=10, v=6)
    k.rod((0, 0, zd + 2.1), (0, 0, zd + 3.2), 0.05, P['brass'], 'brass', segs=4)
    k.box((0.9, 0.05, 0.18), (0.1, 0, zd + 2.95), P['iron'], 'iron')                    # wind vane
    ob = k.finish()
    ob['family'] = 'lighthouse'
    # lens (rotating child)
    kl = Kit(name + '_lens')
    kl.cyl(0.5, 0.5, 0.5, 10, (0, 0, zl), P['brass'], 'brass')
    lathe(kl, [(0.55, zl + 0.5), (0.85, zl + 0.8), (0.98, zl + 1.4), (0.85, zl + 2.0), (0.45, zl + 2.3)], 14, (1, 1, 1), 'lens', smooth=True, cap_top=True)
    lens = kl.finish(parent=ob, outline=False)
    lens.name = 'lens'
    lens['family'] = 'lighthouse'
    ob['lamp_z'] = zl + 1.4
    ob['top_z'] = zd + 3.2
    return ob


# ======================================================================== houses
def gable_roof(k, w, d, z, pitch, over, col, mat='roof', chimney=None, ridge_col=None):
    rise = (d / 2 + over) * math.tan(pitch)
    slope = math.hypot(d / 2 + over, rise)
    th = 0.2
    for s in (-1, 1):
        # slab from eave (y = s*(d/2+over), z) to ridge (y=0, z+rise), thickness th, length w + 2 over
        e0 = Vector((-(w / 2 + over), s * (d / 2 + over), z - over * math.tan(pitch) * 0.0))
        rows = []
        pts = [Vector((x, s * (d / 2 + over), z)) for x in (-(w / 2 + over), (w / 2 + over))]
        top = [Vector((x, 0, z + rise)) for x in (-(w / 2 + over), (w / 2 + over))]
        a, b = pts
        c_, d_ = top
        nrm = Vector((0, s * math.sin(pitch), math.cos(pitch)))
        down = -nrm * th
        V = [k.bm.verts.new(p) for p in (a, b, d_, c_, a + down, b + down, d_ + down, c_ + down)]
        fs = []
        quads = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (3, 2, 6, 7), (0, 3, 7, 4)]
        if s < 0:
            quads = [q[::-1] for q in quads]
        for q in quads:
            fs.append(k.bm.faces.new([V[i] for i in q]))
        k.bm.normal_update()
        k.paint(fs, col, mat, uv=None, jitter=0.04)
        for f in fs:
            for lp in f.loops:
                co = lp.vert.co
                lp[k.uv].uv = (co.x, (s * (d / 2 + over) - co.y) * s / math.cos(pitch))
    k.box((w + 2 * over + 0.1, 0.3, 0.22), (0, 0, z + rise + 0.05), ridge_col or shade(col, 0.82), 'roof', jitter=0.02)
    return rise


def hip_roof(k, w, d, z, pitch, over, col, mat='roof'):
    W2, D2 = w / 2 + over, d / 2 + over
    rise = D2 * math.tan(pitch)
    rl = max(W2 - D2, 0.05)
    th = 0.2
    base = [Vector((-W2, -D2, z)), Vector((W2, -D2, z)), Vector((W2, D2, z)), Vector((-W2, D2, z))]
    r0, r1 = Vector((-rl, 0, z + rise)), Vector((rl, 0, z + rise))
    bv = [k.bm.verts.new(p) for p in base]
    lv = [k.bm.verts.new(p - Vector((0, 0, th))) for p in base]
    rv = [k.bm.verts.new(r0), k.bm.verts.new(r1)]
    fs = [k.bm.faces.new((bv[0], bv[1], rv[1], rv[0])), k.bm.faces.new((bv[1], bv[2], rv[1])),
          k.bm.faces.new((bv[2], bv[3], rv[0], rv[1])), k.bm.faces.new((bv[3], bv[0], rv[0]))]
    for i in range(4):
        fs.append(k.bm.faces.new((lv[i], lv[(i + 1) % 4], bv[(i + 1) % 4], bv[i])))
    fs.append(k.bm.faces.new(lv[::-1]))
    k.bm.normal_update()
    k.paint(fs, col, mat, uv=None, jitter=0.04)
    for f in fs:
        n = f.normal
        hn = Vector((n.x, n.y, 0))
        hn = hn.normalized() if hn.length > 1e-3 else Vector((0, -1, 0))
        tt = Vector((-hn.y, hn.x, 0))
        for lp in f.loops:
            co = lp.vert.co
            lp[k.uv].uv = (co.dot(tt), -co.dot(hn) / math.cos(pitch))
    return rise


def house(name, w=7.0, d=6.0, floors=2, roof='gable', wall=None, roof_col=None, shut=None, seed=0, chimney=1,
          quoins=False, string=True, balcony=False, ext_stair=False, lean_to=False, flowers=True, dormer=False,
          awning=None, lamp=False, door_side=-1, win_glow=0.75):
    random.seed(seed)
    k = Kit(name, seed)
    wall = wall or P['plaster_cream']
    roof_col = roof_col or P['roof_terra']
    shut = shut or P['shutter_sage']
    fh = 3.0
    H = floors * fh + 0.4
    k.box((w + 0.16, d + 0.16, 0.6), (0, 0, 0.3 - 0.2), P['stone_dark'], 'stone', jitter=0.03)
    k.box((w, d, H), (0, 0, H / 2), wall, 'plaster', jitter=0.03)
    if quoins:
        # front corners only, alternating long/short blocks every 1.2 m (budget: <= 2.5k tris per house)
        for sx in (-1, 1):
            for i in range(int(H / 1.2)):
                big = i % 2 == 0
                k.box((0.7 if big else 0.4, 0.4 if big else 0.7, 0.56),
                      (sx * (w / 2 - (0.32 if big else 0.17) + 0.03), -(d / 2 - (0.17 if big else 0.32) + 0.03), 0.9 + i * 1.2),
                      P['stone_warm'], 'stone', jitter=0.05)
    if string and floors > 1:
        for f in range(1, floors):
            k.box((w + 0.12, d + 0.12, 0.16), (0, 0, f * fh + 0.25), P['frame'], 'wash')
    k.box((w + 0.3, d + 0.3, 0.22), (0, 0, H - 0.05), P['frame'], 'wash')
    # windows on all four facades; front (-Y) gets the door
    flower_cols = [lin('#C9584A'), lin('#E7C66A'), lin('#F2EEE2'), lin('#D98AA0'), P['foliage_lit']]
    for side, (nx, ny), length in ((-1, (0, -1), w), (1, (0, 1), w), (-2, (-1, 0), d), (2, (1, 0), d)):
        nwin = max(1, int((length - 0.6) / 2.3))
        for fl in range(floors):
            zc = fl * fh + 1.75
            for i in range(nwin):
                off = (i - (nwin - 1) / 2) * (length / nwin)
                c = Vector((off if abs(side) == 1 else nx * d / 2 * 0 + nx * w / 2,
                            ny * d / 2 if abs(side) == 1 else off, zc))
                if abs(side) == 1:
                    c = Vector((off, ny * d / 2, zc))
                else:
                    c = Vector((nx * w / 2, off, zc))
                if side == door_side and fl == 0 and i == (nwin // 2):
                    door(k, (c.x, c.y, 0.2), (nx, ny, 0), col=shut if random.random() < 0.5 else P['shutter_ox'], fan=floors > 1)
                    if lamp:
                        k.box((0.18, 0.18, 0.3), (c.x + 0.95, c.y + ny * 0.25, 2.5), P['iron'], 'iron')
                        k.box((0.14, 0.14, 0.2), (c.x + 0.95, c.y + ny * 0.25, 2.3), (1, 1, 1), 'lamp')
                    continue
                if side in (2, 1) and random.random() < 0.35:
                    continue                                  # some blank walls at the back
                if side == 1 and floors >= 3 and fl < floors - 1:
                    continue                                  # tall houses: back facade lit only at the top
                fb = flower_cols if (flowers and fl > 0 and random.random() < 0.45) else None
                window(k, tuple(c), (nx, ny, 0), 0.82, 1.3 if fl > 0 else 1.2, shutters=shut if random.random() < 0.8 else None,
                       box_flowers=fb, glow=win_glow)
    # roof
    if roof == 'gable':
        rise = gable_roof(k, w, d, H + 0.05, math.radians(33), 0.45, roof_col)
        # gable end triangles
        for s in (-1, 1):
            x = s * w / 2
            vs = [k.bm.verts.new((x, -d / 2, H)), k.bm.verts.new((x, d / 2, H)), k.bm.verts.new((x, 0, H + (d / 2) * math.tan(math.radians(33))))]
            f = k.bm.faces.new(vs if s > 0 else vs[::-1])
            k.bm.normal_update()
            k.paint([f], wall, 'plaster', jitter=0.02)
        if floors > 1 and random.random() < 0.7:
            window(k, (-w / 2, 0, H + 0.9), (-1, 0, 0), 0.6, 0.7, sill=False, glow=win_glow * 0.7)
    else:
        rise = hip_roof(k, w, d, H + 0.05, math.radians(30), 0.45, roof_col)
    if dormer and roof == 'gable':
        dz = H + 0.6
        k.box((1.6, 1.4, 1.4), (0.8, -d / 2 + 0.9, dz + 0.7), wall, 'plaster')
        window(k, (0.8, -d / 2 + 0.2, dz + 0.75), (0, -1, 0), 0.7, 0.8, sill=False, glow=win_glow)
        kk = 0
        for s in (-1, 1):
            k.box((0.95, 1.8, 0.14), (0.8 + s * 0.42, -d / 2 + 0.85, dz + 1.62), roof_col, 'roof', M=Matrix.Translation((0.8 + s * 0.42, 0, dz + 1.62)) @ Matrix.Rotation(s * -0.62, 4, 'Y') @ Matrix.Translation((-(0.8 + s * 0.42), 0, -(dz + 1.62))))
    for ci in range(chimney):
        cx = (w / 2 - 1.0) * (1 if ci == 0 else -1)
        cy = d * 0.18
        ch = rise + 1.4
        k.box((0.75, 0.75, ch), (cx, cy, H + ch / 2), P['stone_warm'] if random.random() < 0.5 else wall, 'stone', jitter=0.04)
        k.box((0.95, 0.95, 0.14), (cx, cy, H + ch + 0.07), P['stone_dark'], 'stone')
        for p in range(random.choice((1, 2))):
            k.cyl(0.11, 0.09, 0.42, 6, (cx - 0.15 + p * 0.3, cy, H + ch + 0.14), lin('#A9583F'), 'wash')
    if balcony:
        bz = fh + 0.25
        k.box((2.6, 1.1, 0.16), (-w * 0.15, -d / 2 - 0.55, bz), P['stone_warm'], 'stone')
        for i in range(9):
            k.box((0.04, 0.04, 0.95), (-w * 0.15 - 1.25 + i * 0.3125, -d / 2 - 1.05, bz + 0.55), P['iron'], 'iron')
        k.box((2.6, 0.06, 0.06), (-w * 0.15, -d / 2 - 1.05, bz + 1.02), P['iron'], 'iron')
        for i in range(3):
            k.ico(0.22, (-w * 0.15 - 0.9 + i * 0.9, -d / 2 - 0.7, bz + 0.3), random.choice(flower_cols), 'foliage', sub=1, seed=seed + i)
    if ext_stair:
        for i in range(10):
            k.box((0.32, 1.1, 0.3 * (i + 1)), (w / 2 + 0.55, d / 2 - 0.4 - i * 0.32, 0.15 * (i + 1)), P['stone'], 'stone', jitter=0.04)
        k.box((1.2, 1.4, 0.2), (w / 2 + 0.6, -d / 2 + 0.6 + 0.0, 3.1), P['stone'], 'stone')
    if lean_to:
        lw, ld, lh = 2.6, d * 0.7, 2.6
        k.box((lw, ld, lh), (w / 2 + lw / 2, d * 0.1, lh / 2), P['wood'], 'wood', jitter=0.05)
        k.box((lw + 0.4, ld + 0.4, 0.14), (w / 2 + lw / 2, d * 0.1, lh + 0.3), P['roof_slate'], 'roof',
              M=Matrix.Translation((w / 2 + lw / 2, 0, lh + 0.3)) @ Matrix.Rotation(0.3, 4, 'Y') @ Matrix.Translation((-(w / 2 + lw / 2), 0, -(lh + 0.3))))
    if awning:
        ax = 0.0
        for i in range(6):
            cc = awning if i % 2 == 0 else P['canvas']
            k.box((w * 0.75 / 6, 1.4, 0.06), (-w * 0.375 + w * 0.75 / 12 + i * w * 0.75 / 6, -d / 2 - 0.7, 2.95), cc, 'canvas',
                  M=Matrix.Translation((0, -d / 2, 3.3)) @ Matrix.Rotation(0.32, 4, 'X') @ Matrix.Translation((0, d / 2, -3.3)))
    ob = k.finish()
    ob['family'] = 'house'
    return ob


# ======================================================================== keeper's cottage, oil store, signal mast
def keeper_cottage(name='keepers_cottage'):
    random.seed(11)
    k = Kit(name, 11)
    w, d, H = 9.0, 5.6, 3.6
    k.box((w + 0.2, d + 0.2, 0.6), (0, 0, 0.1), P['stone_dark'], 'stone')
    k.box((w, d, H), (0, 0, H / 2), P['stone'], 'stone', jitter=0.03)
    k.box((w + 0.3, d + 0.3, 0.2), (0, 0, H - 0.05), P['stone_warm'], 'stone')
    rise = gable_roof(k, w, d, H + 0.05, math.radians(36), 0.4, P['roof_slate'])
    for s in (-1, 1):
        x = s * w / 2
        vs = [k.bm.verts.new((x, -d / 2, H)), k.bm.verts.new((x, d / 2, H)), k.bm.verts.new((x, 0, H + (d / 2) * math.tan(math.radians(36))))]
        f = k.bm.faces.new(vs if s > 0 else vs[::-1]); k.bm.normal_update(); k.paint([f], P['stone'], 'stone')
        k.box((0.9, 0.9, rise + 1.6), (s * (w / 2 - 0.45), 0, H + (rise + 1.6) / 2), P['stone_warm'], 'stone')
        k.box((1.1, 1.1, 0.15), (s * (w / 2 - 0.45), 0, H + rise + 1.65), P['stone_dark'], 'stone')
        k.cyl(0.12, 0.1, 0.45, 6, (s * (w / 2 - 0.45), 0, H + rise + 1.72), lin('#A9583F'))
    door(k, (-1.2, -d / 2, 0.2), (0, -1, 0), col=P['shutter_blue'])
    for x in (-3.4, 1.2, 3.3):
        window(k, (x, -d / 2, 1.9), (0, -1, 0), 0.9, 1.2, shutters=P['shutter_blue'], glow=1.0)
    window(k, (-w / 2, -0.8, 1.9), (-1, 0, 0), 0.9, 1.2, shutters=P['shutter_blue'], glow=1.0)
    window(k, (-w / 2, 0, H + 1.0), (-1, 0, 0), 0.6, 0.7, sill=False, glow=0.8)
    # porch hood over the door
    k.box((1.9, 1.1, 0.12), (-1.2, -d / 2 - 0.55, 2.75), P['roof_slate'], 'roof',
          M=Matrix.Translation((-1.2, -d / 2, 2.9)) @ Matrix.Rotation(0.35, 4, 'X') @ Matrix.Translation((1.2, d / 2, -2.9)))
    # lean-to wash house
    k.box((3.0, 3.4, 2.6), (w / 2 + 1.5, 0.6, 1.3), P['stone_warm'], 'stone')
    k.box((3.5, 3.9, 0.14), (w / 2 + 1.6, 0.6, 2.85), P['roof_slate'], 'roof',
          M=Matrix.Translation((w / 2 + 1.6, 0, 2.85)) @ Matrix.Rotation(0.28, 4, 'Y') @ Matrix.Translation((-(w / 2 + 1.6), 0, -2.85)))
    ob = k.finish()
    ob['family'] = 'lighthouse'
    return ob


def oil_store(name='oil_store'):
    k = Kit(name, 5)
    w, d, H = 4.6, 3.4, 2.4
    k.box((w + 0.2, d + 0.2, 0.4), (0, 0, 0.0), P['stone_dark'], 'stone')
    k.box((w, d, H), (0, 0, H / 2), P['stone'], 'stone', jitter=0.03)
    # barrel vault roof along x
    rows = []
    segs = 8
    for x in (-w / 2 - 0.25, w / 2 + 0.25):
        rows.append([(x, (d / 2 + 0.2) * math.cos(math.pi * i / segs), H + 1.0 * math.sin(math.pi * i / segs)) for i in range(segs + 1)])
    fs, vs = k.quad_strip(rows, P['roof_slate'], 'roof', smooth=True, uv=None)
    for f in fs:
        for lp in f.loops:
            co = lp.vert.co
            lp[k.uv].uv = (co.x, math.atan2(co.z - H, co.y) * 1.8)
    for s in (-1, 1):
        x = s * w / 2
        ring = [(x, (d / 2) * math.cos(math.pi * i / segs), H + 0.95 * math.sin(math.pi * i / segs)) for i in range(segs + 1)]
        k.tri_fan((x, 0, H), ring if s > 0 else ring[::-1], P['stone'], 'stone')
    door(k, (0, -d / 2, 0.2), (0, -1, 0), w=1.0, h=1.9, col=P['iron'], step=False)
    k.box((0.5, 0.5, 0.25), (0.0, 0, H + 1.05), P['iron'], 'iron')
    ob = k.finish()
    ob['family'] = 'lighthouse'
    return ob


def signal_mast(name='signal_mast'):
    k = Kit(name, 9)
    k.box((1.2, 1.2, 0.5), (0, 0, 0.0), P['stone_dark'], 'stone')
    k.rod((0, 0, 0.2), (0, 0, 11.0), 0.16, P['wood_dark'], 'wood', segs=6, r2=0.11)
    k.rod((0, 0, 10.6), (0, 0, 14.0), 0.09, P['frame'], 'wood', segs=5, r2=0.06)
    k.sphere(0.16, (0, 0, 14.1), P['brass'], 'brass', u=6, v=4)
    k.rod((-2.6, 0, 9.4), (2.6, 0, 9.4), 0.07, P['wood_dark'], 'wood', segs=4)       # yard
    k.rod((0, 0, 7.0), (0, 3.2, 8.2), 0.07, P['wood_dark'], 'wood', segs=4)          # gaff
    for (x, y) in ((2.6, 2.6), (-2.6, -2.6)):
        k.rod((0, 0, 9.8), (x, y, 0.1), 0.02, P['ink'], 'iron', segs=3)
        k.box((0.3, 0.3, 0.3), (x, y, 0.1), P['stone_dark'], 'stone')
    # signal flags (muted): a triangle pennant and two square flags on the yard halyards
    flags = [(-2.2, 8.4, lin('#B5483B'), 'sq'), (-1.6, 7.2, lin('#E1B751'), 'tri'), (2.2, 8.4, lin('#3F5E8C'), 'sq'),
             (2.0, 7.3, P['paper'], 'sq')]
    for (x, z, c, kind) in flags:
        k.rod((x, 0, 9.4), (x, 0, z - 0.6), 0.012, P['ink'], 'iron', segs=3)
        if kind == 'sq':
            k.box((0.03, 0.9, 0.7), (x, 0.45, z), c, 'canvas')
        else:
            v = [k.bm.verts.new(p) for p in ((x, 0, z + 0.35), (x, 0, z - 0.35), (x, 1.3, z))]
            f = k.bm.faces.new(v); k.bm.normal_update(); k.paint([f], c, 'canvas')
    ob = k.finish()
    ob['family'] = 'lighthouse'
    return ob


# ======================================================================== harbour structures
def quay_block(name, length, depth, top=2.2, steps=False):
    """Stone quay: battered face on local -Y (sea side), apron on top, coping stones."""
    k = Kit(name, 3)
    zb = -2.0
    hh = top - zb
    k.box((length, depth, hh), (0, depth / 2, zb + hh / 2), P['stone'], 'stone', jitter=0.03)
    # algae / tide band
    k.box((length + 0.02, 0.12, 1.2), (0, -0.0, -0.1), P['rock_wet'], 'stone')
    n = int(length / 1.3)
    for i in range(n):
        x = -length / 2 + (i + 0.5) * length / n
        k.box((length / n - 0.08, 1.0, 0.32), (x, 0.42, top + 0.16), P['stone_warm'], 'stone', jitter=0.06)
    if steps:
        for i in range(8):
            z = top - 0.3 * (i + 1)
            k.box((1.6, 0.4, 0.3), (length / 2 - 1.0 - i * 0.4, -0.22, z + 0.15), P['stone_dark'], 'stone', jitter=0.05)
    ob = k.finish()
    ob['family'] = 'quay'
    return ob


def bollard(name='bollard'):
    k = Kit(name, 2)
    lathe(k, [(0.2, 0.0), (0.22, 0.08), (0.17, 0.12), (0.15, 0.45), (0.2, 0.55), (0.2, 0.62), (0.12, 0.66)], 10, P['iron'], 'iron', cap_top=True)
    ob = k.finish()
    ob['family'] = 'quay'
    return ob


def lamp_post(name='lamp_post', h=4.2):
    k = Kit(name, 4)
    k.cyl(0.22, 0.2, 0.5, 8, (0, 0, 0), P['iron'], 'iron')
    k.rod((0, 0, 0.5), (0, 0, h), 0.07, P['iron'], 'iron', segs=6, r2=0.05)
    k.rod((0, 0, h - 0.5), (0.35, 0, h - 0.2), 0.03, P['iron'], 'iron', segs=4)
    k.cyl(0.24, 0.24, 0.08, 8, (0, 0, h), P['iron'], 'iron')
    k.cyl(0.2, 0.26, 0.55, 6, (0, 0, h + 0.08), (1, 1, 1), 'lamp')
    lathe(k, [(0.34, h + 0.63), (0.22, h + 0.8), (0.05, h + 0.95)], 6, P['iron'], 'iron', cap_top=True, smooth=False)
    ob = k.finish()
    ob['family'] = 'props'
    ob['light_z'] = h + 0.35
    return ob


def pier_module(name, width, length, deck=1.2, bent=3.0, pile_r=0.17, kerb=True, brace=True, seed=0):
    """Open pier on piles. Local X along the pier, deck top at `deck`."""
    rng = random.Random(seed)
    k = Kit(name, seed)
    th = 0.16
    k.box((length, width, th), (0, 0, deck - th / 2), mixc(P['wood'], P['wood_pale'], 0.45), 'wood', jitter=0.0, uv=None)
    # plank UVs: v across planks along X (planks run across the width)
    for f in k.bm.faces:
        for lp in f.loops:
            co = lp.vert.co
            lp[k.uv].uv = (co.y, co.x + seed * 7.13)
    for s in (-1, 1):
        k.box((length, 0.26, 0.4), (0, s * (width / 2 - 0.35), deck - th - 0.2), P['wood_dark'], 'wood')
        if kerb:
            k.box((length, 0.2, 0.2), (0, s * (width / 2 - 0.1), deck + 0.1), P['wood'], 'wood')
    nb = int(round(length / bent))
    for i in range(nb):
        x = -length / 2 + (i + 0.5) * length / nb
        k.box((0.3, width + 0.3, 0.3), (x, 0, deck - th - 0.55), P['wood_dark'], 'wood')
        for s in (-1, 1):
            y = s * (width / 2 - 0.15)
            k.cyl(pile_r * 0.95, pile_r, 0.6, 6, (x, y, -0.45), P['rock_wet'], 'wood')
            k.cyl(pile_r, pile_r * 0.95, deck - th - 0.6 + 0.45 + 0.05, 6, (x, y, 0.15), P['wood_dark'], 'wood')
        if brace and width > 2.5:
            k.rod((x, -width / 2 + 0.15, 0.2), (x, width / 2 - 0.15, deck - th - 0.6), 0.07, P['wood_dark'], 'wood', segs=4)
    ob = k.finish()
    ob['family'] = 'pier'
    ob['piles'] = [(-length / 2 + (i + 0.5) * length / nb, s * (width / 2 - 0.15)) for i in range(nb) for s in (-1, 1)]
    return ob


def cleat(k, p, rz=0.0):
    M = Matrix.Translation(p) @ Matrix.Rotation(rz, 4, 'Z')
    k.box((0.5, 0.12, 0.08), (0, 0, 0.16), P['iron'], 'iron', M=M)
    k.box((0.12, 0.12, 0.16), (0, 0, 0.08), P['iron'], 'iron', M=M)


def ladder(k, p, n, h):
    pass


# ======================================================================== breakwater + beacon
def beacon(name='beacon'):
    k = Kit(name, 6)
    k.cyl(2.2, 2.0, 1.2, 12, (0, 0, 0), P['stone_dark'], 'stone')
    k.cyl(1.6, 1.25, 6.0, 12, (0, 0, 1.2), P['stone'], 'stone', jitter=0.02)
    for zz in (2.9, 4.8):
        k.cyl(1.5, 1.45, 0.45, 12, (0, 0, zz), lin('#B5483B'), 'wash')
    k.cyl(1.5, 1.5, 0.25, 12, (0, 0, 7.2), P['stone_dark'], 'stone')
    k.cyl(0.55, 0.55, 0.9, 8, (0, 0, 7.45), (1, 1, 1), 'lamp')
    lathe(k, [(0.75, 8.35), (0.45, 8.7), (0.1, 8.95)], 8, P['iron'], 'iron', cap_top=True, smooth=False)
    for i in range(10):
        a = TAU * i / 10
        k.rod((1.4 * math.cos(a), 1.4 * math.sin(a), 7.45), (1.4 * math.cos(a), 1.4 * math.sin(a), 8.15), 0.03, P['iron'], 'iron', segs=3)
    ring_tube(k, 1.4, 0.035, 8.15, P['iron'], segs=20, rsegs=3)
    door(k, (0, -1.47, 1.2), (0, -1, 0), w=0.8, h=1.7, col=P['shutter_blue'], step=False)
    ob = k.finish()
    ob['family'] = 'breakwater'
    ob['light_z'] = 7.9
    return ob


# ======================================================================== nature
def tree_round(name, s=1.0, seed=0, col=None, lit=None):
    rng = random.Random(seed)
    k = Kit(name, seed)
    k.cyl(0.22 * s, 0.14 * s, 2.6 * s, 6, (0, 0, -0.2), P['wood_dark'], 'wood')
    col = col or P['foliage']
    lit = lit or P['foliage_lit']
    for i in range(4):
        r = (1.6 - 0.18 * i) * s * rng.uniform(0.85, 1.1)
        o = (rng.uniform(-0.8, 0.8) * s, rng.uniform(-0.8, 0.8) * s, (2.9 + 0.75 * i) * s)
        k.ico(r, o, col, 'foliage', sub=2, scale=(1, 1, 0.82), seed=seed * 7 + i, amp=0.32, smooth=True, jitter=0.0,
              face_color=lambda f, c=col, l=lit: mixc(c, l, max(0.0, min(1.0, f.normal.z * 0.8 + 0.25 + 0.3 * f.normal.dot(Vector((-0.5, -0.5, 0)))))))
    ob = k.finish()
    ob['family'] = 'trees'
    return ob


def tree_cypress(name, s=1.0, seed=0):
    k = Kit(name, seed)
    k.cyl(0.14 * s, 0.1 * s, 1.0 * s, 5, (0, 0, -0.2), P['wood_dark'], 'wood')
    k.ico(1.0 * s, (0, 0, 4.2 * s), P['cypress'], 'foliage', sub=2, scale=(1, 1, 4.0), seed=seed, amp=0.18, smooth=True,
          face_color=lambda f: mixc(P['cypress'], P['foliage'], max(0.0, min(1.0, 0.25 + 0.5 * f.normal.dot(Vector((-0.6, -0.6, 0.4)))))))
    ob = k.finish()
    ob['family'] = 'trees'
    return ob


def shrub(name, s=1.0, seed=0, col=None):
    k = Kit(name, seed)
    col = col or P['foliage']
    k.ico(0.9 * s, (0, 0, 0.45 * s), col, 'foliage', sub=1, scale=(1.2, 1.0, 0.7), seed=seed, amp=0.35, smooth=True,
          face_color=lambda f: mixc(col, P['foliage_lit'], max(0.0, min(1.0, f.normal.z))))
    ob = k.finish()
    ob['family'] = 'trees'
    return ob


def rock(name, r=1.0, seed=0, squash=0.7):
    k = Kit(name, seed)
    k.ico(r, (0, 0, 0), P['rock'], 'stone', sub=1, scale=(1, 1, squash), seed=seed, amp=0.3, smooth=False, uv='box',
          face_color=lambda f: P['rock_wet'] if f.calc_center_median().z < 0.25 * r * 0 + 0.0 else (P['rock'] if f.normal.z > 0.3 else P['rock_dark']))
    ob = k.finish()
    ob['family'] = 'rocks'
    return ob


# ======================================================================== props
def crate(name='crate', s=1.0):
    k = Kit(name, 1)
    k.box((1.0 * s, 0.8 * s, 0.7 * s), (0, 0, 0.35 * s), P['wood'], 'wood', jitter=0.05)
    k.box((1.04 * s, 0.84 * s, 0.1 * s), (0, 0, 0.62 * s), P['wood_dark'], 'wood')
    ob = k.finish(); ob['family'] = 'props'
    return ob


def barrel(name='barrel', s=1.0):
    k = Kit(name, 2)
    lathe(k, [(0.3 * s, 0), (0.36 * s, 0.25 * s), (0.38 * s, 0.45 * s), (0.36 * s, 0.65 * s), (0.3 * s, 0.9 * s)], 8, P['wood'], 'wood', cap_top=True)
    for z in (0.15, 0.75):
        ring_tube(k, 0.35 * s, 0.025, z * s, P['iron'], segs=8, rsegs=3)
    ob = k.finish(); ob['family'] = 'props'
    return ob


def net_rack(name='net_rack', L=5.0):
    k = Kit(name, 3)
    for x in (-L / 2, L / 2):
        k.rod((x, 0, 0), (x, 0, 2.2), 0.06, P['wood_dark'], 'wood', segs=4)
    k.rod((-L / 2, 0, 2.15), (L / 2, 0, 2.15), 0.05, P['wood_dark'], 'wood', segs=4)
    rows = []
    for i in range(7):
        t = i / 6
        x = -L / 2 + t * L
        sag = 0.25 * math.sin(math.pi * t)
        rows.append([(x, 0.05 * math.sin(i * 1.3) + dz * 0.04, 2.1 - dz - sag * (1 - dz / 1.9)) for dz in (0.0, 0.6, 1.2, 1.9)])
    k.quad_strip(rows, P['rope'], 'canvas', uv=None)
    for f in list(k.bm.faces)[-18:]:
        pass
    ob = k.finish(); ob['family'] = 'props'
    k2 = None
    return ob


def dinghy(name='dinghy', L=4.2, col=None, upside=False):
    k = Kit(name, 4)
    col = col or P['hull_green']
    B = L * 0.36
    rows = []
    n = 8
    for i in range(n + 1):
        u = -1 + 2 * i / n
        x = u * L / 2
        w = B / 2 * ((1 - max(u, 0) ** 2) ** 0.6 if u >= 0 else (1 - 0.25 * u * u))
        zt = 0.55 + 0.15 * u * u
        rows.append([(x, w, zt), (x, w * 0.8, 0.12), (x, 0, -0.05), (x, -w * 0.8, 0.12), (x, -w, zt)])
    fs, vs = k.quad_strip(rows, col, 'hull', uv=None, smooth=True)
    k.paint(fs, col, 'hull', uv=None, face_color=lambda f: col if f.calc_center_median().z > 0.3 else P['hull_cream'])
    k.box((L * 0.12, B * 0.85, 0.06), (0, 0, 0.42), P['wood_pale'], 'wood')
    ob = k.finish()
    if upside:
        ob.rotation_euler.x = math.pi
    ob['family'] = 'props'
    return ob


def bench(name='bench'):
    k = Kit(name, 5)
    k.box((1.8, 0.45, 0.08), (0, 0, 0.45), P['wood'], 'wood')
    k.box((1.8, 0.06, 0.4), (0, 0.22, 0.75), P['wood'], 'wood')
    for x in (-0.75, 0.75):
        k.box((0.08, 0.45, 0.45), (x, 0, 0.22), P['iron'], 'iron')
    ob = k.finish(); ob['family'] = 'props'
    return ob


def lobster_pots(name='pots', n=5, seed=0):
    rng = random.Random(seed)
    k = Kit(name, seed)
    for i in range(n):
        x, y = rng.uniform(-1.2, 1.2), rng.uniform(-0.8, 0.8)
        z = 0.0 if i < 3 else 0.55
        k.cyl(0.32, 0.3, 0.5, 8, (x, y, z), P['rope'], 'canvas', jitter=0.08)
    ob = k.finish(); ob['family'] = 'props'
    return ob


def rope_coil(k, p, r=0.35):
    ring_tube(k, r, 0.07, 0.07, P['rope'], segs=10, rsegs=3)
