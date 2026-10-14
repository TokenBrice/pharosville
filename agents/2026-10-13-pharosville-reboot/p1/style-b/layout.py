"""Layout of the style block: places kit pieces, registers lights, contacts (foam) and wakes.

World: camera yaw 45 looks toward +X+Y. Quay runs along world +Y at x = quay_x; the pier group projects
toward -X into the basin; town terraces climb toward +X; headland + lighthouse at screen-left.
"""
import bpy, bmesh, math, random, os
from mathutils import Vector, Matrix
from lib import *
import kit, hulls
import numpy as np
from terrain import uv2w, w2uv

R90 = math.pi / 2
BRAND = {k: lin(v['hex']) for k, v in PALETTE['brand'].items()}
EMB = {k: v['emblem'] for k, v in PALETTE['brand'].items()}


def place(ob, loc, rz=0.0):
    ob.location = loc
    ob.rotation_euler.z = rz
    return ob


def populate(W):
    L = W.L
    rng = random.Random(21)
    gz = W.ground_z
    qx = L['quay_x']
    land = W.land
    from terrain import signed_dist
    import numpy as np

    def sd(x, y):
        return float(signed_dist(np.array([[x, y]], np.float32), land.poly)[0])

    W.hull_polys = []
    # ------------------------------------------------------------------ lighthouse compound (headland)
    lhx, lhy = -33.0, 79.0
    lz = gz(lhx, lhy)
    lh = place(kit.lighthouse(), (lhx, lhy, lz))
    W.lighthouse = lh
    W.lamp_pos = Vector((lhx, lhy, lz + lh['lamp_z']))
    W.lamps.append((W.lamp_pos.copy(), 'lantern'))
    cot = place(kit.keeper_cottage(), (-22.0, 66.5, gz(-22.0, 66.5)), 0.0)
    W.lamps.append((Vector((-23.2, 62.4, gz(-22, 66.5) + 2.0)), 'window'))
    place(kit.oil_store(), (-43.5, 70.5, gz(-43.5, 70.5)), -R90)
    place(kit.signal_mast(), (-19.0, 83.0, gz(-19.0, 83.0)), math.radians(20))
    # compound wall + garden
    k = Kit('compound')
    pts = [(-46, 62), (-14, 56), (-8, 76), (-16, 92), (-44, 94), (-50, 80)]
    for a, b in zip(pts, pts[1:] + pts[:1]):
        a, b = Vector(a), Vector(b)
        d = b - a
        n = max(1, int(d.length / 3))
        for i in range(n):
            if a == Vector((-14, 56)) and i in (2, 3):
                continue                                        # gate toward the path
            p = a + d * ((i + 0.5) / n)
            z = gz(p.x, p.y)
            k.box((d.length / n + 0.1, 0.7, 1.1), (0, 0, z + 0.35), P['stone'], 'stone', jitter=0.05,
                  M=Matrix.Translation((p.x, p.y, 0)) @ Matrix.Rotation(math.atan2(d.y, d.x), 4, 'Z'))
    # keeper's vegetable plot
    for r in range(4):
        for c in range(6):
            x, y = -16.5 + c * 1.1, 72.0 + r * 1.3
            k.ico(0.42, (x, y, gz(x, y) + 0.25), P['foliage_lit'] if (r + c) % 2 else P['foliage'], 'foliage', sub=1,
                  scale=(1, 1, 0.7), seed=r * 7 + c, amp=0.3)
    ob = k.finish(); ob['family'] = 'props'
    # ------------------------------------------------------------------ breakwater + beacon
    bw_uv = [(-60, 4), (-55, -10), (-46, -25), (-33, -38)]
    bw = [Vector((*uv2w(*p), 0)) for p in bw_uv]
    pts = []
    for i in range(len(bw) - 1):
        for t in np.linspace(0, 1, 6, endpoint=False):
            pts.append(bw[i].lerp(bw[i + 1], t))
    pts.append(bw[-1])
    k = Kit('breakwater')
    left, right = [], []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        n = Vector((-d.y, d.x, 0))
        left.append(p + n * 2.6)
        right.append(p - n * 2.6)
    crest_z = 3.0
    poly = [tuple(v)[:2] for v in left] + [tuple(v)[:2] for v in reversed(right)]
    k.poly_prism(poly, -2.0, crest_z, P['stone_dark'], 'stone', top_color=P['cobble'], top_mat='stone', jitter=0.03)
    # seaward parapet (n side faces screen-left / outer sea)
    for i in range(len(left) - 1):
        a, b = left[i], left[i + 1]
        d = b - a
        c = (a + b) / 2 - Vector((-d.y, d.x, 0)).normalized() * 0.5
        k.box((d.length + 0.05, 0.9, 1.3), (c.x, c.y, crest_z + 0.65), P['stone'], 'stone', jitter=0.04, rz=math.atan2(d.y, d.x))
    # armour rocks on both flanks
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        n = Vector((-d.y, d.x, 0))
        for side in (-1, 1):
            for j in range(2):
                off = side * rng.uniform(3.4, 6.2)
                q = p + n * off + d * rng.uniform(-1.5, 1.5)
                r = rng.uniform(1.1, 2.0)
                k.ico(r, (q.x, q.y, rng.uniform(-0.2, 0.9)), P['rock'], 'stone', sub=1, scale=(1.2, 1, 0.75), seed=i * 13 + j * 3 + side,
                      amp=0.32, uv='box', face_color=lambda f: P['rock_wet'] if f.calc_center_median().z < 0.3 else (P['rock'] if f.normal.z > 0.35 else P['rock_dark']))
                W.contacts.append((q.x, q.y, r * 1.05))
    head = pts[-1]
    k.cyl(6.0, 6.2, 5.0, 16, (head.x, head.y, -2.0), P['stone_dark'], 'stone', uv='box', jitter=0.03)
    for i in range(12):
        a = 2 * math.pi * i / 12
        q = head + Vector((math.cos(a), math.sin(a), 0)) * 7.2
        k.ico(rng.uniform(1.3, 1.9), (q.x, q.y, rng.uniform(-0.3, 0.6)), P['rock'], 'stone', sub=1, scale=(1.2, 1, 0.75),
              seed=200 + i, amp=0.3, uv='box', face_color=lambda f: P['rock_wet'] if f.calc_center_median().z < 0.3 else P['rock'])
        W.contacts.append((q.x, q.y, 1.8))
    ob = k.finish(); ob['family'] = 'breakwater'
    bc = place(kit.beacon(), (head.x, head.y, crest_z), math.radians(225) - R90)
    W.lamps.append((Vector((head.x, head.y, crest_z + bc['light_z'])), 'lamp'))
    W.pillar_srcs = [(Vector((head.x, head.y, crest_z + bc['light_z'])), 1.6, 'beacon')]
    mound = [tuple(p + Vector((-((pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()).y,
                                ((pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()).x, 0)) * 6.0)[:2] for i, p in enumerate(pts)]
    mound2 = [tuple(p - Vector((-((pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()).y,
                                 ((pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()).x, 0)) * 6.0)[:2] for i, p in enumerate(pts)]
    W.contact_polys.append(mound + mound2[::-1])
    W.contact_polys.append([(head.x + 7.0 * math.cos(a), head.y + 7.0 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 16, endpoint=False)])

    # ------------------------------------------------------------------ quay
    y0, y1 = L['quay_y']
    k = Kit('quay')
    zb, top = -2.0, 2.2
    k.box((5.0, y1 - y0 + 4.0, top - zb), (qx + 2.5, (y0 + y1) / 2 + 1.0, zb + (top - zb) / 2), P['stone'], 'stone', jitter=0.02)
    k.box((0.14, y1 - y0 + 4.0, 1.3), (qx - 0.02, (y0 + y1) / 2 + 1.0, -0.2), P['rock_wet'], 'stone')
    n = int((y1 - y0 + 4) / 1.4)
    for i in range(n):
        y = y0 - 1.0 + (i + 0.5) * (y1 - y0 + 4) / n
        k.box((1.0, (y1 - y0 + 4) / n - 0.08, 0.3), (qx + 0.42, y, top + 0.15), P['stone_warm'], 'stone', jitter=0.06)
    # quay steps down to the water (along the face, near the pier root)
    for i in range(8):
        z = top - 0.32 * (i + 1)
        k.box((0.45 * (8 - i) * 0 + 1.4, 0.42, 0.32), (qx - 0.7, -20.0 - i * 0.42, z + 0.16), P['stone_dark'], 'stone', jitter=0.05)
    # back-shore quay return
    k.box((10.0, 4.0, top - zb), (qx - 5.0, y1 + 2.0, zb + (top - zb) / 2), P['stone'], 'stone', jitter=0.02)
    ob = k.finish(); ob['family'] = 'quay'
    bol = kit.bollard('bollard')
    nb = 0
    for y in np.arange(y0 + 2, y1 - 1, 6.0):
        if -16 < y < -8:
            continue
        b = bol if nb == 0 else bpy.data.objects.new(f'bollard_{nb}', bol.data)
        if nb:
            bpy.context.scene.collection.objects.link(b); b['outline'] = 1; b['family'] = 'quay'
        place(b, (qx + 0.5, y, top + 0.3))
        nb += 1
    lamp = kit.lamp_post('lamp_post')
    lamp_xy = [(qx + 1.6, -36.0), (qx + 1.6, -19.0), (qx + 1.6, -5.0), (qx + 1.6, 12.0),
               (-21.0, -27.2), (-21.0, 3.2), (3.0, -14.2), (-21.0, -12.0 + 0.0)]
    for i, (x, y) in enumerate(lamp_xy):
        z = top + 0.3 if x > qx else 1.2
        if i == 7:
            continue
        o = lamp if i == 0 else bpy.data.objects.new(f'lamp_post_{i}', lamp.data)
        if i:
            bpy.context.scene.collection.objects.link(o); o['outline'] = 1; o['family'] = 'props'
        place(o, (x, y, z))
        lp = Vector((x, y, z + lamp['light_z']))
        W.lamps.append((lp, 'lamp'))
        W.pillar_srcs.append((lp, 1.0, 'lamp'))

    # ------------------------------------------------------------------ pier group (modules on piles)
    proto = {
        'main': kit.pier_module('pier_main_4m', 5.0, 4.0, seed=1),
        'head': kit.pier_module('pier_head_4m', 6.0, 4.0, seed=2),
        'finger': kit.pier_module('pier_finger_4m', 1.8, 4.0, brace=False, seed=3),
    }
    used = {k_: 0 for k_ in proto}

    def module(kind, x, y, rz):
        src = proto[kind]
        if used[kind] == 0:
            ob = src
        else:
            ob = bpy.data.objects.new(f'{src.name}.{used[kind]:03d}', src.data)
            bpy.context.scene.collection.objects.link(ob)
            ob['outline'] = 1; ob['family'] = 'pier'
        used[kind] += 1
        place(ob, (x, y, 0), rz)
        for (px, py) in src['piles']:
            c, s = math.cos(rz), math.sin(rz)
            W.contacts.append((x + px * c - py * s, y + px * s + py * c, 0.22))
        return ob
    pier_y = -12.0
    for i in range(11):
        module('main', qx - 2.0 - i * 4.0, pier_y, 0.0)                # x from qx-0 down to -18
    head_x = qx - 2.0 - 10 * 4.0 - 2.0 - 3.0                           # = -21.5
    for i in range(8):
        module('head', head_x, pier_y - 14.0 + i * 4.0, R90)
    fingers = [11.0, -3.0]
    for fx in fingers:
        for i in range(4):
            module('finger', fx, pier_y - 2.5 - 2.0 - i * 4.0, R90)
            module('finger', fx, pier_y + 2.5 + 2.0 + i * 4.0, R90)
    W.harbour_target = Vector((-2.0, -10.0, 2.0))
    # pier furniture: cleats, crates, a ladder, lifebuoy post
    k = Kit('pier_props')
    for fx in fingers:
        for yy in (pier_y - 6, pier_y - 14, pier_y - 18.5, pier_y + 6, pier_y + 14, pier_y + 18.5):
            kit.cleat(k, (fx - 0.65, yy, 1.2), R90)
    for yy in (-26, -18, -6, 2):
        kit.cleat(k, (head_x - 2.6, yy, 1.2), R90)
    for (x, y, s_) in ((head_x + 1.5, pier_y - 9.0, 1.0), (head_x + 1.2, pier_y - 7.7, 0.8), (head_x + 1.8, pier_y + 8, 1.0),
                       (qx - 4.0, pier_y + 1.4, 0.9), (qx - 5.3, pier_y + 1.6, 0.7)):
        k.box((1.0 * s_, 0.8 * s_, 0.7 * s_), (x, y, 1.2 + 0.35 * s_), P['wood'], 'wood', jitter=0.06, rz=rng.uniform(-0.3, 0.3))
    for (x, y) in ((head_x + 2.0, pier_y - 5.5), (head_x + 1.4, pier_y - 4.8), (qx - 7.0, pier_y - 1.6)):
        fs = kit.lathe(k, [(0.3, 1.2), (0.37, 1.45), (0.38, 1.65), (0.36, 1.85), (0.3, 2.1)], 8, P['wood_dark'], 'wood', cap_top=True)
        k.transform_faces(Kit.faces_of(set(v for f in fs for v in f.verts)), Matrix.Translation((x, y, 0)))
    # lifebuoy post on the T-head
    k.rod((head_x - 2.2, pier_y + 15.0, 1.2), (head_x - 2.2, pier_y + 15.0, 2.6), 0.07, P['wood_dark'], 'wood', segs=5)
    fs = kit.ring_tube(k, 0.38, 0.11, 0.0, lin('#C9584A'), 'wash', segs=10, rsegs=4)
    k.transform_faces(fs, Matrix.Translation((head_x - 2.32, pier_y + 15.0, 2.2)) @ Matrix.Rotation(R90, 4, 'Y'))
    ob = k.finish(); ob['family'] = 'pier'

    # ------------------------------------------------------------------ hulls: 6 docked, 2 sailing
    moor = Kit('moorings')
    docked = [
        # name, family, L, x, y, brand, side of pier (+1 = pier at +X of hull)
        ('hull_flagship_usdt', 'ship', 26.0, head_x - 3.0 - 0.6 - 3.25, pier_y, 'usdt_like'),
        ('hull_schooner_usdc', 'schooner', 18.0, 11.0 - 0.9 - 0.5 - 2.45, pier_y - 2.5 - 10.5, 'usdc_like'),
        ('hull_brig_gold', 'brig', 18.0, 11.0 - 0.9 - 0.5 - 2.6, pier_y + 2.5 + 9.0, 'gold_like'),
        ('hull_botter_eur', 'botter', 13.0, -3.0 - 0.9 - 0.5 - 2.6, pier_y - 2.5 - 8.0, 'eur_like'),
        ('hull_sloop_dai', 'sloop', 10.0, -3.0 - 0.9 - 0.5 - 1.7, pier_y + 2.5 + 6.0, 'dai_like'),
        ('hull_sloop_pyusd', 'sloop', 7.5, qx - 0.6 - 1.3, 9.5, 'pyusd_like'),
    ]
    W.hull_obs = []
    for i, (nm, fam, Lh, x, y, br) in enumerate(docked):
        h = hulls.hull(nm, fam, Lh, True, BRAND[br], EMB[br], seed=i, tack=1)
        place(h, (x, y, 0.0), R90)
        W.hull_obs.append(h)
        W.hull_polys.append(hulls.waterline_poly(Lh, h['B'], fam, (x, y), R90))
        for t in h['lights']:
            p = Vector((x - t[1], y + t[0], t[2]))
            W.lamps.append((p, 'riding'))
        # mooring lines: bow + stern + springs to the pier edge on +X side
        B = h['B']
        fbz = h['fb'] * 0.95
        px_ = x + B / 2 + 0.5 + 0.2
        for (ly, py) in ((Lh * 0.42, Lh * 0.5 + 1.5), (-Lh * 0.44, -Lh * 0.5 - 1.5), (Lh * 0.1, -Lh * 0.15), (-Lh * 0.1, Lh * 0.12)):
            a = Vector((x + B * 0.25, y + ly, fbz))
            b = Vector((px_, y + py, 1.4))
            hulls.line(moor, a, b, r=0.035, sag=0.35, n=3, col=P['rope'])
        for fy in (-0.25, 0.15):
            moor.cyl(0.2, 0.2, 0.7, 8, (x + B / 2 + 0.12, y + fy * Lh, 0.35), P['hull_cream'], 'wash', smooth=True)
    # the small sloop moors to the quay wall
    sailing = [
        ('hull_sloop_usde', 'sloop', 13.0, uv2w(12, -50), math.radians(108), -1, 'usde_like'),
        ('hull_botter_eure', 'botter', 10.0, uv2w(-70, -48), math.radians(-28), 1, 'eure_like'),
    ]
    for i, (nm, fam, Lh, (x, y), hd, tack, br) in enumerate(sailing):
        h = hulls.hull(nm, fam, Lh, False, BRAND[br], EMB[br], seed=10 + i, tack=tack)
        h.location = (x, y, -0.15)
        h.rotation_euler = (math.radians(9) * tack, 0, hd)
        W.hull_obs.append(h)
        W.hull_polys.append(hulls.waterline_poly(Lh, h['B'], fam, (x, y), hd))
        c, s = math.cos(hd), math.sin(hd)
        stern = Vector((x, y)) - Vector((c, s)) * Lh * 0.5
        back = -Vector((c, s))
        for sg in (-1, 1):
            arm = back.copy(); arm.rotate(Matrix.Rotation(sg * math.radians(19.5), 2))
            W.wakes.append((tuple(stern), tuple(stern + arm * Lh * 2.0), 0.2, 0.7, 0.4))
        W.wakes.append((tuple(stern), tuple(stern + back * Lh * 1.4), 0.45, 1.1, 0.45))
        bow = Vector((x, y)) + Vector((c, s)) * Lh * 0.48
        W.wakes.append((tuple(bow - Vector((c, s)) * 1.0), tuple(bow - Vector((c, s)) * Lh * 0.6), 0.5, 1.2, 0.55))
        for t in h['lights']:
            W.lamps.append((h.matrix_world @ Vector(t) if False else Vector((x, y, t[2])), 'riding'))
    ob = moor.finish(outline=False); ob['family'] = 'hulls'

    # ------------------------------------------------------------------ town: terraces, walls, stairs, houses
    x0, tw, th = L['terrace_x0'], L['terrace_w'], L['terrace_h']
    steps_x = [x0 + i * tw for i in range(L['terraces'])]
    stair_y = -17.0
    k = Kit('terrace_walls')
    for i, sx in enumerate(steps_x):
        zl = 2.2 + i * th
        zu = zl + th
        ys = [y for y in np.arange(-70, 80, 1.0) if sd(sx + 3.0, y) > 2.5 and sd(sx - 3.0, y) > 2.5]
        if not ys:
            continue
        # contiguous runs, with a gap at the public stair
        runs, cur = [], [ys[0]]
        for y in ys[1:]:
            if y - cur[-1] > 1.01 or abs(y - stair_y) < 1.3:
                runs.append(cur); cur = [y]
            else:
                cur.append(y)
        runs.append(cur)
        for r_ in runs:
            r_ = [y for y in r_ if abs(y - stair_y) >= 1.3]
            if len(r_) < 2:
                continue
            ya, yb = r_[0] - 0.5, r_[-1] + 0.5
            k.box((1.2, yb - ya, zu - zl + 1.4), (sx - 0.9, (ya + yb) / 2, zl - 0.6 + (zu - zl + 1.4) / 2), mixc(P['stone_dark'], P['rock'], 0.4), 'stone', jitter=0.05)
            k.box((1.4, yb - ya, 0.2), (sx - 0.9, (ya + yb) / 2, zu + 0.9), P['stone_warm'], 'stone')
            # parapet on top
            k.box((0.45, yb - ya, 0.75), (sx - 0.5, (ya + yb) / 2, zu + 0.42), P['stone'], 'stone', jitter=0.03)
        # stair flight up this wall (rising +X)
        for j in range(12):
            z = zl + 0.3 * (j + 1)
            xs = sx - 4.4 + j * 0.37
            k.box((0.4, 2.4, z - zl + 0.6), (xs, stair_y, zl - 0.6 + (z - zl + 0.6) / 2), P['stone_warm'], 'stone', jitter=0.04)
        for s_ in (-1, 1):
            k.box((4.6, 0.35, 0.9), (sx - 2.4, stair_y + s_ * 1.37, zl + th * 0.5 + 0.2), P['stone'], 'stone',
                  M=Matrix.Translation((sx - 2.4, stair_y + s_ * 1.37, zl + th * 0.5 + 0.2)) @ Matrix.Rotation(-math.atan2(th, 4.4), 4, 'Y')
                  @ Matrix.Translation((-(sx - 2.4), -(stair_y + s_ * 1.37), -(zl + th * 0.5 + 0.2))))
    ob = k.finish(); ob['family'] = 'town'

    walls = [P['plaster_cream'], P['plaster_ochre'], P['plaster_rose'], P['plaster_blue'], P['plaster_straw']]
    roofs = [P['roof_terra'], P['roof_rust'], P['roof_slate'], P['roof_ochre']]
    shuts = [P['shutter_sage'], P['shutter_blue'], P['shutter_ox']]
    H = [
        # row, y, w, d, floors, roof, wall, roof, shutters, extras
        (0, -36.0, 8.0, 7.0, 2, 'gable', 1, 0, 1, dict(awning=lin('#6F8F86'), lamp=True)),
        (0, -25.5, 6.5, 7.0, 3, 'gable', 0, 1, 0, dict(balcony=True)),
        (0, 5.5, 9.0, 7.0, 2, 'hip', 2, 0, 2, dict(lamp=True, awning=lin('#9A5A48'))),
        (1, -37.0, 7.0, 6.5, 2, 'gable', 3, 2, 0, dict(ext_stair=True)),
        (1, -27.0, 6.5, 7.0, 2, 'gable', 4, 3, 1, dict(dormer=True)),
        (1, -6.0, 7.5, 7.0, 3, 'gable', 0, 0, 2, dict(quoins=True)),
        (1, 7.5, 6.5, 6.5, 2, 'hip', 1, 1, 0, dict(lean_to=True)),
        (2, -31.0, 7.0, 6.5, 2, 'gable', 2, 0, 1, dict()),
        (2, -6.0, 6.0, 6.5, 2, 'gable', 0, 2, 0, dict(balcony=True)),
        (2, 9.0, 8.0, 7.0, 2, 'hip', 4, 0, 2, dict()),
        (2, 22.0, 7.0, 6.5, 3, 'gable', 3, 1, 0, dict(quoins=True)),
        (3, -22.0, 7.0, 6.5, 2, 'gable', 1, 0, 1, dict(dormer=True)),
        (3, -5.0, 8.5, 7.0, 2, 'gable', 0, 2, 2, dict(lean_to=True)),
        (3, 12.0, 6.5, 6.5, 2, 'hip', 2, 3, 0, dict()),
    ]
    W.houses = []
    W.trees_extra = []
    for i, (row, y, w, d, fl, roof, wi, ri, si, ex) in enumerate(H):
        xf = (qx + 5.8) if row == 0 else (steps_x[row - 1] + 2.8)
        x = xf + d / 2
        z = 2.2 + row * th
        if sd(x, y) < 4:
            print('skip house', i)
            continue
        h = kit.house(f'house_{i:02d}', w, d, fl, roof, walls[wi], roofs[ri], shuts[si], seed=100 + i, **ex)
        place(h, (x, y, z - 0.05), -R90)
        W.houses.append(h)
        if rng.random() < 0.8:
            W.lamps.append((Vector((xf - 1.4, y + rng.uniform(-1.5, 1.5), z + 2.4)), 'window'))
    gardens(W, steps_x, stair_y, sd, rng)
    cliff_rocks(W, rng)
    # ------------------------------------------------------------------ slipway + back shore
    sa = Vector((-1.0, 35.0)); sb = Vector((-10.0, 24.0))
    k = Kit('slipway')
    dvec = (sb - sa)
    ang = math.atan2(dvec.y, dvec.x)
    for s_ in (-1, 1):
        off = Vector((-dvec.y, dvec.x)).normalized() * 1.1 * s_
        hulls.line(k, Vector((*(sa + off), 2.25)), Vector((*(sb + off), -1.0)), r=0.12, col=P['wood_dark'])
    ob = k.finish(); ob['family'] = 'props'
    for i, (t, col) in enumerate(((0.25, P['hull_green']), (0.55, lin('#8C4A3E')))):
        p = sa.lerp(sb, t)
        dg = kit.dinghy(f'dinghy_{i}', 4.6 - i * 0.6, col)
        place(dg, (p.x, p.y, gz(p.x, p.y) + 0.45), ang + (0.15 if i else -0.1))
        dg.rotation_euler.y = math.atan2(3.2, dvec.length) * (1 if math.cos(ang) > 0 else -1) * 0.0
    dg = kit.dinghy('dinghy_up', 3.8, P['shutter_blue'], upside=True)
    place(dg, (5.0, 40.0, gz(5.0, 40.0) + 0.55), 0.6)
    nr = kit.net_rack('net_rack', 6.0)
    place(nr, (8.0, 31.0, gz(8.0, 31.0)), math.radians(-20))
    nr2 = bpy.data.objects.new('net_rack_2', nr.data); bpy.context.scene.collection.objects.link(nr2)
    nr2['outline'] = 1; nr2['family'] = 'props'
    place(nr2, (qx + 3.4, -9.0, 2.2), R90)
    pots = kit.lobster_pots('pots', 6, 1); place(pots, (2.0, 33.0, gz(2.0, 33.0)))
    pots2 = kit.lobster_pots('pots_quay', 5, 2); place(pots2, (qx + 3.0, -30.5, 2.2))
    for i, (x, y) in enumerate(((qx + 2.6, -33.0), (qx + 3.4, -13.6), (qx + 2.2, 15.0), (-4.0, 38.0))):
        c = kit.crate(f'crate_{i}'); place(c, (x, y, gz(x, y) if x < qx else 2.2), rng.uniform(0, 1))
    for i, (x, y) in enumerate(((qx + 2.0, -31.8), (qx + 3.8, -2.0), (qx + 2.8, -1.2), (-2.5, 37.0))):
        b = kit.barrel(f'barrel_{i}'); place(b, (x, y, gz(x, y) if x < qx else 2.2))
    be = kit.bench('bench'); place(be, (qx + 4.4, -16.0, 2.2), R90)
    # ------------------------------------------------------------------ trees + shrubs + rocks
    trees = []
    rng2 = random.Random(5)
    # orchard on the back meadow, cypress walk along the keeper's path
    for i in range(160):
        x, y = rng2.uniform(-14, 75), rng2.uniform(24, 80)
        if sd(x, y) < 5:
            continue
        if any((x - t[0]) ** 2 + (y - t[1]) ** 2 < 22 for t in trees) or _seg_d(x, y, KEEPER_PATH) < 3:
            continue
        if x > qx - 2 and y < 32 and x < 82:
            continue
        trees.append((x, y, 'round', rng2.uniform(1.15, 1.6)))
    for i, t in enumerate(np.linspace(0, 1, 7)):
        p = Vector((-10.0, 52.0)).lerp(Vector((14.0, 40.0)), t)
        trees.append((p.x - 2.5, p.y - 2.5, 'cypress', rng2.uniform(0.85, 1.1)))
    # upper terraces: gardens with trees
    for i in range(40):
        x, y = rng2.uniform(qx + 6, 100), rng2.uniform(-60, 40)
        if sd(x, y) < 4:
            continue
        if any(abs(x - (h.location.x)) < 6.5 and abs(y - h.location.y) < 6.0 for h in W.houses):
            continue
        if any(a <= x <= b and c <= y <= d for (a, b, c, d, _) in W.garden_blocks):
            continue
        if abs(y - stair_y) < 2.5 or any(abs(x - sx) < 3.5 for sx in steps_x) or x < qx + 6.5:
            continue
        if any((x - t[0]) ** 2 + (y - t[1]) ** 2 < 26 for t in trees):
            continue
        trees.append((x, y, 'cypress' if rng2.random() < 0.35 else 'round', rng2.uniform(0.95, 1.35)))
    # headland: a few windswept shrubs and pines around the compound
    for (x, y, kind, s_) in ((-52, 60, 'round', 0.8), (-10, 90, 'cypress', 0.9), (-12, 94, 'cypress', 0.8),
                             (-48, 92, 'round', 0.7), (-6, 64, 'round', 0.9)):
        if sd(x, y) > 3:
            trees.append((x, y, kind, s_))
    trees += W.trees_extra
    protos = {}
    for i, (x, y, kind, s_) in enumerate(trees):
        key = (kind, i % 4)
        if key not in protos:
            protos[key] = (kit.tree_round if kind == 'round' else kit.tree_cypress)(f'{kind}_{i % 4}', 1.0, 40 + i % 4)
            ob = protos[key]
        else:
            ob = bpy.data.objects.new(f'{kind}_{i}', protos[key].data)
            bpy.context.scene.collection.objects.link(ob); ob['outline'] = 1; ob['family'] = 'trees'
        place(ob, (x, y, gz(x, y) - 0.1), rng2.uniform(0, 6.28))
        ob.scale = (s_, s_, s_ * rng2.uniform(0.9, 1.1))
    W.trees = trees
    # shore boulders along the headland cliffs and the town front
    k = Kit('shore_rocks')
    poly = land.poly
    for i in range(0, len(poly), 2):
        x, y = poly[i]
        if x > qx - 1 and -44 < y < 19 and x < 27:
            continue
        if -12 < x < 26 and 16 < y < 40:
            continue                                            # keep the slipway beach clear
        u, v = w2uv(x, y)
        for j in range(rng.randint(0, 2)):
            ox, oy = rng.uniform(-3, 3), rng.uniform(-3, 3)
            r = rng.uniform(0.9, 2.2)
            k.ico(r, (x + ox, y + oy, rng.uniform(-0.6, 0.4)), P['rock'], 'stone', sub=1, scale=(1.2, 1, 0.7), seed=i * 5 + j,
                  amp=0.3, uv='box', face_color=lambda f: P['rock_wet'] if f.calc_center_median().z < 0.35 else (P['rock'] if f.normal.z > 0.35 else P['rock_dark']))
            W.contacts.append((x + ox, y + oy, r * 1.1))
    ob = k.finish(); ob['family'] = 'rocks'

    # ------------------------------------------------------------------ night: beams + light pillars
    W.beams = []
    bm_mat = None
    import mats
    for j, az in enumerate((math.radians(-98), math.radians(82))):
        k = Kit(f'beam_{j}')
        Lb = 150.0
        rows = []
        for t in np.linspace(0, 1, 6):
            r = 0.5 + t * Lb * math.tan(math.radians(2.4))
            rows.append([(t * Lb, r * math.cos(2 * math.pi * i / 16), r * math.sin(2 * math.pi * i / 16) * 0.75) for i in range(16)])
        k.quad_strip(rows, (1, 1, 1), 'beam', closed=True, uv=None, smooth=True)
        ob = k.finish(outline=False)
        ob.location = W.lamp_pos
        ob.rotation_euler = (0, math.radians(3.0), az)
        ob.scale = (1, 1, 1)
        ob['family'] = 'fx'
        ob.visible_shadow = False
        for t in range(6):
            pass
        W.beams.append(ob)
    # tag beam object coords: material uses Object x in [0,1] -> scale x by 1/Lb in the shader via mesh scale
    for b in W.beams:
        for v in b.data.vertices:
            v.co.x /= 150.0
        b.scale = (150.0, 1, 1)
        bpy.context.view_layer.update()
        e = b.matrix_world @ Vector((1, 0, 0))
        print('BEAM', b.name, tuple(round(c, 1) for c in b.matrix_world.translation), '->', tuple(round(c, 1) for c in e), 'uv', w2uv(e.x, e.y))
    W.pillar_obs = []
    k = Kit('pillars')
    toward = -Vector((1, 1, 0)).normalized()
    srcs = list(W.pillar_srcs)
    for (p, kind) in W.lamps:
        if kind == 'riding':
            srcs.append((p, 0.6, 'riding'))
    for (p, wdt, kind) in srcs:
        base = Vector((p.x, p.y, 0.05))
        if W.ground_z(p.x, p.y) > -0.3 and kind != 'riding':
            base = base + toward * 3.5
        Lp = min(4 + p.z * 1.6, 26)
        side = Vector((-toward.y, toward.x, 0))
        wdt = wdt * 1.6
        quad = [base - side * wdt, base + side * wdt, base + side * wdt * 1.6 + toward * Lp, base - side * wdt * 1.6 + toward * Lp]
        vs = [k.bm.verts.new(q) for q in quad]
        f = k.bm.faces.new(vs)
        k.bm.normal_update()
        k.paint([f], (1, 1, 1) if kind != 'riding' else (1, 0.95, 0.85), 'pillar', uv=None)
        for lp_, uvv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            lp_[k.uv].uv = uvv
    ob = k.finish(outline=False); ob['family'] = 'fx'; ob.visible_shadow = False
    W.pillar_obs.append(ob)
    # cloud shadows: a shadow-only layer high above the block (runtime: a cookie texture, no geometry)
    # gulls: two-stroke ink glyphs (runtime: camera-facing sprites)
    W.gulls = []
    k = Kit('gulls')
    for i, (u_, v_, z_, s_) in enumerate(((-30, 10, 42, 1.0), (-22, 16, 46, 0.8), (40, -30, 30, 0.9), (52, -26, 34, 0.7),
                                          (18, 40, 55, 0.8), (-60, -40, 26, 1.0), (70, 40, 60, 0.7))):
        c = Vector((*uv2w(u_, v_), z_))
        side = Vector((1, -1, 0)).normalized()
        sp = 4.2 * s_
        for sg in (-1, 1):
            p0 = c
            p1 = c + side * sg * sp * 0.5 + Vector((0, 0, 1.0 * s_))
            p2 = c + side * sg * sp + Vector((0, 0, 0.05 * s_))
            for a, b in ((p0, p1), (p1, p2)):
                k.rod(a, b, 0.15 * s_, P['ink'], 'iron', segs=3)
    ob = k.finish(outline=False); ob['family'] = 'fx'; ob.visible_shadow = False
    W.gulls.append(ob)


def export(W, outdir):
    import export_glb
    export_glb.run(W, outdir)


KEEPER_PATH = [(-13.0, 57.0), (-9.0, 50.0), (-6.0, 44.0), (-2.0, 38.0)]


def _seg_d(x, y, pts):
    best = 1e9
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        vx, vy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)))
        best = min(best, math.hypot(x - ax - t * vx, y - ay - t * vy))
    return best


def zone(L, x, y, z):
    """Terrain paint zones (lanes, quay cobbles, paths) -> colour or None."""
    qx = L['quay_x']
    y0, y1 = L['quay_y']
    if qx - 0.5 <= x <= qx + 5.6 and y0 - 2 <= y <= y1 + 2 and z > 1.5:
        return P['cobble']
    if x > qx and z > 3.0:
        for i in range(L['terraces']):
            sx = L['terrace_x0'] + i * L['terrace_w']
            if sx - 0.4 <= x <= sx + 2.7 and abs(z - (2.2 + (i + 1) * L['terrace_h'])) < 1.0:
                return P['path']
    if abs(y + 17.0) < 1.6 and qx < x < 92 and z > 1.5:
        return P['path']
    if _seg_d(x, y, KEEPER_PATH) < 1.3 and z > 1.0:
        return P['path']
    if -14 < x < 10 and 20 < y < 42 and z < 2.6:
        return P['sand']
    return None


SOIL = lin('#8A6A4C')
FLOWERS = [lin('#C9584A'), lin('#E7C66A'), lin('#F2EEE2'), lin('#D98AA0'), lin('#9C7BB5')]
LINEN = [lin('#F3EEE2'), lin('#E7C66A'), lin('#9DB6C9'), lin('#E1BCA5'), lin('#F3EEE2')]


def fence(k, a, b, picket=True):
    a, b = Vector(a), Vector(b)
    d = b - a
    n = max(2, int(d.length / (0.55 if picket else 1.6)))
    for i in range(n + 1):
        p = a.lerp(b, i / n)
        if picket:
            k.box((0.09, 0.09, 1.0), (p.x, p.y, p.z + 0.5), P['frame'], 'wash', jitter=0.05)
        else:
            pass
    if picket:
        for zz in (0.35, 0.8):
            c = (a + b) / 2
            k.box((d.length, 0.06, 0.08), (c.x, c.y, c.z + zz), P['frame'], 'wash', rz=math.atan2(d.y, d.x))
    else:
        c = (a + b) / 2
        k.box((d.length, 0.55, 0.9), (c.x, c.y, c.z + 0.35), P['stone'], 'stone', jitter=0.06, rz=math.atan2(d.y, d.x))


def gardens(W, steps_x, stair_y, sd, rng):
    L = W.L
    qx = L['quay_x']
    th = L['terrace_h']
    k = Kit('gardens')
    kl = Kit('garden_lines')
    W.garden_blocks = []
    for r in range(L['terraces'] + 1):
        x_lo = (qx + 5.8) if r == 0 else steps_x[r - 1] + 2.9
        x_hi = (steps_x[0] - 1.7) if r == 0 else (steps_x[r] - 1.7 if r < L['terraces'] else x_lo + 13.0)
        z = 2.2 + r * th
        free = []
        for y in np.arange(-64, 64, 1.0):
            if sd(x_lo + 0.5, y) < 2.5 or sd(x_hi - 0.5, y) < 2.5:
                continue
            if abs(y - stair_y) < 2.4:
                continue
            if any(abs(h.location.y - y) < h.dimensions.x / 2 + 1.4 and x_lo - 1 < h.location.x < x_hi + 6 for h in W.houses):
                continue
            free.append(float(y))
        if not free:
            continue
        runs, cur = [], [free[0]]
        for y in free[1:]:
            if y - cur[-1] > 1.01:
                runs.append(cur); cur = [y]
            else:
                cur.append(y)
        runs.append(cur)
        for run in runs:
            ya, yb = run[0] - 0.5, run[-1] + 0.5
            y = ya
            while yb - y > 3.0:
                ln = min(yb - y, rng.uniform(4.5, 7.5))
                y0, y1 = y, y + ln
                y = y1
                kind = rng.choices(['veg', 'flowers', 'orchard', 'shed', 'laundry', 'well', 'vines'], [3, 1.5, 2.2, 1.2, 1.4, 0.4, 1.5])[0]
                xm = (x_lo + x_hi) / 2
                ym = (y0 + y1) / 2
                W.garden_blocks.append((x_lo, x_hi, y0, y1, kind))
                # boundary: picket fence or dry-stone wall along the plot's lower-y edge
                fence(k, (x_lo + 0.3, y0 + 0.2, z), (x_hi - 0.3, y0 + 0.2, z), picket=rng.random() < 0.55)
                if kind == 'veg':
                    k.box((x_hi - x_lo - 1.2, ln - 1.2, 0.14), (xm, ym, z + 0.04), SOIL, 'wash', jitter=0.04)
                    nrow = int((ln - 1.6) / 0.9)
                    for a_ in range(max(nrow, 1)):
                        yy = y0 + 0.9 + a_ * 0.9
                        for b_ in range(int((x_hi - x_lo - 1.6) / 0.75)):
                            xx = x_lo + 0.9 + b_ * 0.75
                            c = P['foliage_lit'] if a_ % 2 else mixc(P['foliage'], P['grass'], 0.4)
                            k.ico(0.3, (xx, yy, z + 0.3), c, 'foliage', sub=1, scale=(1, 1, 0.8), seed=int(xx * 7 + yy * 3), amp=0.25)
                elif kind == 'flowers':
                    k.box((x_hi - x_lo - 1.4, ln - 1.4, 0.12), (xm, ym, z + 0.04), lin('#7A6A4C'), 'wash')
                    for i in range(int(ln * (x_hi - x_lo) / 1.6)):
                        xx, yy = rng.uniform(x_lo + 0.9, x_hi - 0.9), rng.uniform(y0 + 0.9, y1 - 0.9)
                        k.ico(0.26, (xx, yy, z + 0.28), rng.choice(FLOWERS + [P['foliage_lit']]), 'foliage', sub=1, seed=i, amp=0.3)
                elif kind == 'orchard':
                    for i in range(2):
                        W.trees_extra.append((rng.uniform(x_lo + 1.5, x_hi - 1.5), y0 + ln * (0.3 + 0.4 * i), 'round', rng.uniform(0.75, 0.95)))
                elif kind == 'vines':
                    for a_ in range(int((x_hi - x_lo - 1.0) / 1.5)):
                        xx = x_lo + 1.0 + a_ * 1.5
                        k.box((0.35, ln - 1.2, 1.1), (xx, ym, z + 0.6), mixc(P['foliage'], P['foliage_lit'], 0.4), 'foliage', jitter=0.08)
                elif kind == 'shed':
                    sx_, sy_ = rng.uniform(x_lo + 1.8, x_hi - 1.8), ym
                    k.box((2.4, 2.0, 2.1), (sx_, sy_, z + 1.05), P['wood'], 'wood', jitter=0.06)
                    k.box((2.9, 2.5, 0.12), (sx_, sy_, z + 2.3), P['roof_slate'] if rng.random() < 0.5 else P['roof_rust'], 'roof',
                          M=Matrix.Translation((sx_, sy_, z + 2.3)) @ Matrix.Rotation(0.25, 4, 'Y') @ Matrix.Translation((-sx_, -sy_, -(z + 2.3))))
                    for i in range(6):                                                    # wood pile
                        k.rod((sx_ - 1.0 + (i % 3) * 0.0, sy_ + 1.4 + (i % 3) * 0.32, z + 0.18 + (i // 3) * 0.3),
                              (sx_ + 0.6, sy_ + 1.4 + (i % 3) * 0.32, z + 0.18 + (i // 3) * 0.3), 0.15, P['wood_pale'], 'wood', segs=5)
                elif kind == 'laundry':
                    xa, xb = x_lo + 1.0, x_hi - 1.0
                    for xx in (xa, xb):
                        k.rod((xx, ym, z), (xx, ym, z + 2.2), 0.06, P['wood_dark'], 'wood', segs=4)
                    kl.rod((xa, ym, z + 2.15), (xb, ym, z + 2.05), 0.02, P['rope'], 'iron', segs=3)
                    nn = int((xb - xa) / 0.95)
                    for i in range(nn):
                        xx = xa + 0.5 + i * (xb - xa - 0.6) / max(nn, 1)
                        hgt = rng.uniform(0.6, 1.0)
                        k.box((0.75, 0.04, hgt), (xx, ym, z + 2.1 - hgt / 2), rng.choice(LINEN), 'canvas', jitter=0.03)
                elif kind == 'well':
                    k.cyl(0.8, 0.8, 0.9, 10, (xm, ym, z), P['stone'], 'stone')
                    for s_ in (-1, 1):
                        k.rod((xm + s_ * 0.7, ym, z + 0.9), (xm + s_ * 0.7, ym, z + 2.2), 0.06, P['wood_dark'], 'wood', segs=4)
                    k.box((2.0, 1.4, 0.1), (xm, ym, z + 2.35), P['roof_terra'], 'roof')
    ob = k.finish(); ob['family'] = 'town'
    if kl.bm.faces:
        ob2 = kl.finish(outline=False); ob2['family'] = 'town'


def cliff_rocks(W, rng):
    """Rock buttresses on steep terrain (breaks the heightfield facets, reads as engraved crags)."""
    k = Kit('cliff_rocks')
    H, xs, ys = W.H, W.xs, W.ys
    dzx = np.gradient(H, xs, axis=1)
    dzy = np.gradient(H, ys, axis=0)
    slope = np.sqrt(dzx ** 2 + dzy ** 2)
    jj, ii = np.where((slope > 1.6) & (H > 1.0))
    idx = list(range(len(jj)))
    rng.shuffle(idx)
    placed = []
    for t in idx:
        j, i = jj[t], ii[t]
        x, y, z = xs[i], ys[j], H[j, i]
        if x > W.L['quay_x'] - 2:
            continue                                    # town side uses retaining walls
        if any((x - a) ** 2 + (y - b) ** 2 < 30 for a, b in placed):
            continue
        placed.append((x, y))
        r = rng.uniform(1.4, 2.6)
        k.ico(r * 1.2, (x, y, z - 0.6), P['rock'], 'stone', sub=2, scale=(1.25, 1.1, 0.95), seed=int(x * 13 + y * 7) % 997, amp=0.4,
              uv='box', face_color=lambda f: P['rock_dark'] if f.normal.z < -0.1 else (mixc(P['rock'], P['stone_warm'], 0.35) if f.normal.z > 0.5 else P['rock']))
        if len(placed) > 38:
            break
    ob = k.finish(); ob['family'] = 'rocks'
