"""Parametric hull + rig builder (one stylistic family, late-19th-c. working sail).
Bow along +X, waterline z=0, origin amidships. state = 'docked' (sails furled under brand covers)
or 'sailing' (sails set, emblem on the main). Nodes in the GLB carry the runtime contract."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
from lib import *
from kit_town import PLANK, NONE, LAMP1

CLASS_LOA = dict(flagship=26.0, large=18.0, medium=13.0, small=10.0, boat=7.5, skiff=5.0)

FAMILY = {
    # rig, beam ratio, freeboard ratio, draft ratio, hull colour, strake colour, sail colour
    'usd_sloop':    dict(rig='sloop', beam=0.33, fb=0.11, dr=0.12, hull='hull_navy', strake='hull_white', sail='canvas'),
    'usd_schooner': dict(rig='schooner', beam=0.27, fb=0.10, dr=0.11, hull='hull_white', strake='hull_green', sail='canvas'),
    'usd_ship':     dict(rig='ship', beam=0.23, fb=0.11, dr=0.11, hull='hull_black', strake='frame_white', sail='canvas'),
    'eur_botter':   dict(rig='botter', beam=0.36, fb=0.09, dr=0.07, hull='hull_eur', strake='timber', sail='canvas_tanbark'),
    'gold_brig':    dict(rig='brig', beam=0.27, fb=0.075, dr=0.12, hull='hull_tar', strake='gilt', sail='canvas'),
}


def hull_bm(Lh, B, fb, dr, kind='usd', n=12):
    bm = bmesh.new(); secs = []
    for i in range(n + 1):
        u = -1 + 2 * i / n
        x = u * Lh / 2
        if kind == 'botter':
            w = B / 2 * ((1 - max(u, 0) ** 5) ** 0.38 if u >= 0 else (1 - 0.32 * u ** 4))
            zt = fb * (1 + 0.15 * u * u + 1.4 * max(u, 0) ** 4 + 0.25 * max(-u, 0) ** 2)
            zb = -dr * (1 - max(u, 0) ** 4) * (1 - 0.2 * u * u)
        else:
            w = B / 2 * ((1 - max(u, 0) ** 2.1) ** 0.55 if u >= 0 else (1 - 0.32 * u * u))
            zt = fb * (1 + 0.22 * u * u + 0.35 * max(u, 0) ** 2)
            zb = -dr * (1 - max(u, 0) ** 3) * (1 - 0.3 * u * u)
        w = max(w, 0.02)
        zd = zt - min(0.35, fb * 0.25)
        bw = min(0.12, w * 0.2)
        prof = [(w - bw, zd), (w - bw, zt), (w, zt), (w * 0.995, zt * 0.55), (w * 0.95, 0.0),
                (w * 0.74, zb * 0.6), (w * 0.34, zb * 0.95), (0, zb)]
        pts = prof + [(-yy, zz) for yy, zz in reversed(prof[:-1])]
        secs.append([bm.verts.new((x, yy, zz)) for yy, zz in pts])
    m = len(secs[0])
    for a, b in zip(secs, secs[1:]):
        for j in range(m - 1):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
        bm.faces.new((a[-1], b[-1], b[0], a[0]))   # deck strip
    bm.faces.new(secs[0])                        # transom
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.004)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def sail_quad(tack, throat, peak, clew, belly, nu=5, nv=5, emblem=None):
    """Gaff/lug/square sail as a bilinear patch tack->clew (foot), throat->peak (head).
    emblem = (centre_uv, size_uv) -> UVMap in [0,1]^2 over that region."""
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    T, Th, Pk, C = map(Vector, (tack, throat, peak, clew))
    rows = []
    nrm = (C - T).cross(Th - T).normalized()
    for i in range(nv + 1):
        v = i / nv
        a, b = T.lerp(Th, v), C.lerp(Pk, v)
        row = []
        for j in range(nu + 1):
            s = j / nu
            q = a.lerp(b, s) + nrm * belly * math.sin(math.pi * s) * (0.35 + 0.65 * math.sin(math.pi * min(1, v * 0.9 + 0.1)))
            row.append((bm.verts.new(q), s, v))
        rows.append(row)
    for i in range(nv):
        for j in range(nu):
            f = bm.faces.new((rows[i][j][0], rows[i][j + 1][0], rows[i + 1][j + 1][0], rows[i + 1][j][0]))
            for lp, (ii, jj) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
                s, v = rows[ii][jj][1], rows[ii][jj][2]
                if emblem:
                    (cu, cv), sz = emblem
                    lp[uvl].uv = ((s - cu) / sz[0] + 0.5, (v - cv) / sz[1] + 0.5)
                else:
                    lp[uvl].uv = (-5, -5)
    return bm


def sail_tri(head, tack, clew, belly, n=5):
    return sail_quad(tack, head, head, clew, belly, nu=4, nv=n)


def spar(p, a, b, r, c='timber_dk', segs=5):
    p.add(bm_rod(a, b, r, segs), P(c), smooth=True)


def furl(p, a, b, r, color, segs=5):
    """Furled sail under a cover: fat tapered roll between a and b."""
    a, b = Vector(a), Vector(b)
    pts = [a.lerp(b, t) for t in (0, 0.1, 0.5, 0.9, 1.0)]
    bm = bmesh.new()
    rr = (r * 0.45, r * 0.9, r, r * 0.85, r * 0.4)
    d = (b - a).normalized()
    up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u_ = d.cross(up).normalized(); w_ = d.cross(u_)
    rings = []
    for q, r0 in zip(pts, rr):
        rings.append([bm.verts.new(q + r0 * (math.cos(2 * math.pi * k / segs) * u_ + 1.15 * math.sin(2 * math.pi * k / segs) * w_))
                      for k in range(segs)])
    for A_, B_ in zip(rings, rings[1:]):
        for k in range(segs):
            bm.faces.new((A_[k], A_[(k + 1) % segs], B_[(k + 1) % segs], B_[k]))
    p.add(bm, color, smooth=True)


def boat(name, family, cls, state='docked', brand=(0.15, 0.6, 0.45), emblem=1, seed=0, tack=1):
    """Returns (Part hull+rig, Part sails or None, info dict with light/cleat positions)."""
    F = FAMILY[family]
    Lh = CLASS_LOA[cls]
    B = Lh * F['beam']; fb = Lh * F['fb']; dr = Lh * F['dr']
    kind = 'botter' if F['rig'] == 'botter' else 'usd'
    rng = random.Random(seed)
    p = Part(name, seed)
    sails = Part(name + '_sails', seed)
    info = dict(lights=[], cleats=[], fenders=[], Lh=Lh, B=B, fb=fb)
    hc, sc = P(F['hull']), P(F['strake'])
    zt_mid = fb
    n = {'flagship': 16, 'large': 10}.get(cls, 10)

    def hcol(f):
        z = f.calc_center_median().z
        nz = f.normal.z
        if abs(nz) > 0.85 and z > fb * 0.5:
            return P('deck')
        if z < -0.05:
            return P('antifoul')
        if z < 0.12 and family != 'gold_brig':
            return P('hull_white') if family != 'usd_schooner' else P('hull_green')
        x = f.calc_center_median().x
        zt_here = fb * (1 + 0.22 * (2 * x / Lh) ** 2)
        if z > zt_here - (0.32 if cls in ('flagship', 'large') else 0.2):
            return sc
        if family == 'usd_ship' and z > zt_here - 1.15 and z < zt_here - 0.55:
            return brand        # brand band along the flagship's topsides
        return hc
    bm = hull_bm(Lh, B, fb, dr, kind, n)
    p.add(bm, None, face_color=hcol, smooth=True)
    zd = fb - min(0.35, fb * 0.25)
    # planked deck overlay (inside the bulwarks)
    dk = bmesh.new(); ring = []
    for side in (1, -1):
        rng_u = [(-1 + 2 * i / n) for i in range(n + 1)]
        if side < 0:
            rng_u = rng_u[::-1]
        for u in rng_u:
            if kind == 'botter':
                w = B / 2 * ((1 - max(u, 0) ** 5) ** 0.38 if u >= 0 else (1 - 0.32 * u ** 4))
                zt = fb * (1 + 0.15 * u * u + 1.4 * max(u, 0) ** 4 + 0.25 * max(-u, 0) ** 2)
            else:
                w = B / 2 * ((1 - max(u, 0) ** 2.1) ** 0.55 if u >= 0 else (1 - 0.32 * u * u))
                zt = fb * (1 + 0.22 * u * u + 0.35 * max(u, 0) ** 2)
            bw = min(0.12, max(w, 0.02) * 0.2)
            zdd = zt - min(0.35, fb * 0.25) + 0.03
            ring.append(dk.verts.new((u * Lh / 2 * 0.995, side * max(0.0, w - bw - 0.01), zdd)))
    bmesh.ops.remove_doubles(dk, verts=dk.verts, dist=0.01)
    try:
        dk.faces.new(dk.verts)
        bmesh.ops.triangulate(dk, faces=dk.faces[:])
    except Exception:
        pass
    p.add(dk, P('deck'), PLANK, drift=0.02)
    # chequered painted ports on the ship / brig band
    if family in ('usd_ship',):
        k = 9
        for i in range(k):
            x = -Lh * 0.36 + i * Lh * 0.72 / (k - 1)
            u = 2 * x / Lh
            w = B / 2 * ((1 - max(u, 0) ** 2.1) ** 0.55 if u >= 0 else (1 - 0.32 * u * u))
            zz = fb * (1 + 0.22 * u * u) - (0.85 if family == 'usd_ship' else 0.5)
            for s in (-1, 1):
                p.add(bm_box(0.55, 0.06, 0.38, (x, s * (w * 0.995 + 0.01), zz)), P('hull_black') if family == 'usd_ship' else P('gilt'))
    # deck furniture
    if family in ('usd_sloop',):
        p.add(bm_box(Lh * 0.26, B * 0.5, fb * 0.5, (-Lh * 0.04, 0, zd + fb * 0.22), bevel=0.06, seg=1), P('hull_white'))
        p.add(bm_box(Lh * 0.2, B * 0.42, 0.06, (-Lh * 0.04, 0, zd + fb * 0.48)), P('timber'), PLANK)
    elif family == 'usd_schooner':
        p.add(bm_box(Lh * 0.16, B * 0.42, 0.55, (-Lh * 0.14, 0, zd + 0.25), bevel=0.06, seg=1), P('hull_white'))
        p.add(bm_box(Lh * 0.17, B * 0.46, 0.07, (-Lh * 0.14, 0, zd + 0.55)), P('timber'), PLANK)
    elif family == 'usd_ship':
        p.add(bm_box(Lh * 0.11, B * 0.55, 1.2, (-Lh * 0.37, 0, zd + 0.6), bevel=0.06, seg=1), P('hull_white'))  # deckhouse
        p.add(bm_box(Lh * 0.12, B * 0.6, 0.1, (-Lh * 0.37, 0, zd + 1.25)), P('timber_dk'))
        p.add(bm_box(Lh * 0.07, B * 0.4, 0.35, (Lh * 0.1, 0, zd + 0.17), bevel=0.04, seg=1), P('timber'), PLANK)
        # ship's boat on chocks
        from kit_town import rowboat
        q = Part('_rb'); rowboat(q, (0, 0, 0), color='frame_white', seed=3)
        bm2 = q.bm; xform(bm2, s=1.0); xform(bm2, loc=(-Lh * 0.15, 0, zd + 0.4))
        me = bpy.data.meshes.new('_x'); bm2.to_mesh(me); bm2.free(); nb = bmesh.new(); nb.from_mesh(me); bpy.data.meshes.remove(me)
        p.add(nb, P('frame_white'), smooth=True)
    elif family == 'gold_brig':
        p.add(bm_box(Lh * 0.12, B * 0.55, 0.9, (-Lh * 0.33, 0, zd + 0.4)), P('hull_white'))
        p.add(bm_box(Lh * 0.13, B * 0.6, 0.08, (-Lh * 0.33, 0, zd + 0.88)), P('gilt'))
        p.add(bm_box(Lh * 0.1, B * 0.4, 0.3, (Lh * 0.05, 0, zd + 0.15)), P('timber'), PLANK)
        # gilded stern panel
        p.add(bm_box(0.12, B * 0.6, 0.7, (-Lh / 2 + 0.05, 0, fb * 1.0)), P('gilt'), mat='brass')
    elif family == 'eur_botter':
        p.add(bm_box(Lh * 0.16, B * 0.4, 0.5, (-Lh * 0.18, 0, zd + 0.22), bevel=0.08, seg=2), P('timber'), PLANK, smooth=True)
        # leeboards: fan shapes hinged at the gunwale, raised
        for s in (-1, 1):
            bm = bmesh.new()
            u0 = 0.05
            w = B / 2 + 0.06
            pts = [(Lh * 0.12, s * w, fb * 1.1), (Lh * 0.0, s * w, fb * 1.1), (-Lh * 0.02, s * (w + 0.1), -dr * 0.1 if state == 'sailing' and s == -tack else fb * 0.15),
                   (Lh * 0.17, s * (w + 0.1), -dr * 0.5 if state == 'sailing' and s == -tack else fb * 0.0)]
            vs = [bm.verts.new(q) for q in pts]
            f = bm.faces.new(vs)
            bmesh.ops.solidify(bm, geom=[f], thickness=0.08)
            p.add(bm, P('hull_eur', 1.15))
        # big rudder
        p.add(bm_box(0.12, 1.0, fb * 1.8 + dr, (-Lh / 2 - 0.35, 0, (fb * 1.6 - dr) / 2)), P('hull_eur', 1.1))
    # rig
    rig = F['rig']
    canvas = P(F['sail'])
    cover = brand
    mast_r = 0.06 + Lh * 0.0042

    def light(at, k='mast'):
        p.add(bm_sphere(0.08 + Lh * 0.002, 1, at=at), P('lamp_gold'), NONE, (0, 0, 0, 2.5), smooth=True)
        info['lights'].append((k, Vector(at)))

    def fwd_stay(top, bow):
        spar(p, top, bow, 0.025, 'iron', 4)

    def pennant(top, c, L=1.4):
        bm = bmesh.new()
        vs = [bm.verts.new(q) for q in ((top[0], top[1], top[2]), (top[0] - L, top[1] + 0.05, top[2] - 0.1),
                                       (top[0], top[1], top[2] - 0.32))]
        bm.faces.new(vs)
        p.add(bm, c)

    if rig in ('sloop', 'botter'):
        mh = Lh * (1.25 if rig == 'sloop' else 1.0)
        mx = Lh * (0.12 if rig == 'sloop' else 0.2)
        spar(p, (mx, 0, zd - 0.2), (mx, 0, zd + mh), mast_r)
        boom_len = Lh * (0.55 if rig == 'sloop' else 0.5)
        boom_z = zd + 1.0 + Lh * 0.02
        boom_ang = 0.0 if state == 'docked' else 0.42 * tack
        bend = Vector((-math.cos(boom_ang), -math.sin(boom_ang), 0))
        boom_end = Vector((mx, 0, boom_z)) + bend * boom_len
        spar(p, (mx, 0, boom_z), boom_end, mast_r * 0.75)
        gaff_len = Lh * (0.38 if rig == 'sloop' else 0.18)
        throat = Vector((mx, 0, zd + mh * (0.78 if rig == 'sloop' else 0.82)))
        bowx = Lh / 2 + (Lh * 0.15 if rig == 'sloop' else 0.0)
        if rig == 'sloop':
            spar(p, (Lh * 0.4, 0, fb * 1.25), (bowx, 0, fb * 1.3), mast_r * 0.7)   # bowsprit
        fwd_stay((mx, 0, zd + mh * 0.92), (bowx, 0, fb * 1.3))
        for s in (-1, 1):
            spar(p, (mx, 0, zd + mh * 0.9), (mx - 0.3, s * (B / 2 - 0.05), zd + 0.1), 0.02, 'iron', 3)
        light((mx, 0, zd + mh + 0.12))
        light((-Lh / 2 + 0.2, 0, fb * 1.4), 'stern')
        pennant((mx, 0, zd + mh + 0.05), brand)
        if state == 'docked':
            gaff_end = throat + Vector((-gaff_len * 0.98, 0, -0.1))
            throat_d = Vector((mx, 0, boom_z + 0.45))
            spar(p, throat_d, throat_d + Vector((-gaff_len, 0, 0.05)), mast_r * 0.6)
            furl(p, (mx - 0.2, 0, boom_z + 0.25), boom_end + Vector((0.3, 0, 0.18)), 0.2 + Lh * 0.012, cover)
            # jib rolled on the forestay

        else:
            ga = boom_ang * 0.85
            gdir = Vector((-math.cos(ga) * math.cos(0.5), -math.sin(ga) * math.cos(0.5), math.sin(0.5 if rig == 'sloop' else 0.25)))
            peak = throat + gdir * gaff_len
            spar(p, throat, peak, mast_r * 0.6)
            tackp = Vector((mx - 0.15, 0, boom_z + 0.05))
            sails.add(sail_quad(tackp, throat, peak, boom_end + Vector((0.1, 0, 0.05)), -0.5 * tack * Lh / 13,
                                emblem=((0.42, 0.42), (0.62, 0.62 * (boom_len / (mh * 0.7))))), canvas, mat='sail', smooth=True)
            head = Vector((mx + 0.05, 0, zd + mh * 0.82))
            clewj = Vector((mx - Lh * 0.12, -tack * B * 0.45, zd + 1.1))
            sails.add(sail_tri(head, Vector((bowx - 0.15, 0, fb * 1.35)), clewj, -0.35 * tack), canvas, mat='sail', smooth=True)
        if rig == 'botter':
            # curved gaff look: second short spar kink
            pass
    elif rig in ('schooner',):
        masts = [(Lh * 0.18, Lh * 1.05), (-Lh * 0.1, Lh * 1.15)]
        bowx = Lh / 2 + Lh * 0.18
        spar(p, (Lh * 0.42, 0, fb * 1.3), (bowx, 0, fb * 1.4), mast_r * 0.75)
        for k, (mx, mh) in enumerate(masts):
            spar(p, (mx, 0, zd - 0.2), (mx, 0, zd + mh), mast_r)
            for s in (-1, 1):
                spar(p, (mx, 0, zd + mh * 0.85), (mx - 0.3, s * (B / 2 - 0.05), zd + 0.1), 0.02, 'iron', 3)
            if k == 1:
                light((mx, 0, zd + mh + 0.12))
            pennant((mx, 0, zd + mh + 0.05), brand if k == 1 else P('frame_white'))
        fwd_stay((masts[0][0], 0, zd + masts[0][1] * 0.9), (bowx, 0, fb * 1.4))
        spar(p, (masts[0][0], 0, zd + masts[0][1] * 0.95), (masts[1][0], 0, zd + masts[1][1] * 0.8), 0.02, 'iron', 3)
        light((-Lh / 2 + 0.2, 0, fb * 1.4), 'stern')
        for k, (mx, mh) in enumerate(masts):
            boom_len = (masts[0][0] - masts[1][0]) * 0.92 if k == 0 else Lh * 0.42
            boom_z = zd + 1.1
            ang = 0.0 if state == 'docked' else 0.38 * tack
            be = Vector((mx, 0, boom_z)) + Vector((-math.cos(ang), -math.sin(ang), 0)) * boom_len
            spar(p, (mx, 0, boom_z), be, mast_r * 0.7)
            throat = Vector((mx, 0, zd + mh * 0.8))
            gl = boom_len * 0.6
            if state == 'docked':
                spar(p, (mx, 0, boom_z + 0.5), (mx - gl, 0, boom_z + 0.55), mast_r * 0.55)
                furl(p, (mx - 0.2, 0, boom_z + 0.28), be + Vector((0.3, 0, 0.2)), 0.22 + Lh * 0.01, cover)
            else:
                gdir = Vector((-math.cos(ang * 0.85) * 0.88, -math.sin(ang * 0.85) * 0.88, 0.45))
                peak = throat + gdir * gl
                spar(p, throat, peak, mast_r * 0.55)
                sails.add(sail_quad((mx - 0.15, 0, boom_z + 0.05), throat, peak, be + Vector((0.1, 0, 0.05)), -0.45 * tack,
                                    emblem=((0.45, 0.4), (0.6, 0.7)) if k == 1 else None), canvas, mat='sail', smooth=True)
        if state != 'docked':
            head = Vector((masts[0][0] + 0.05, 0, zd + masts[0][1] * 0.85))
            sails.add(sail_tri(head, Vector((bowx - 0.15, 0, fb * 1.4)), Vector((masts[0][0] - 1.0, -tack * B * 0.4, zd + 1.2)), -0.3 * tack),
                      canvas, mat='sail', smooth=True)
    elif rig in ('ship', 'brig'):
        if rig == 'ship':
            masts = [(Lh * 0.27, Lh * 0.82), (0.0, Lh * 0.88), (-Lh * 0.25, Lh * 0.72)]
        else:
            masts = [(Lh * 0.2, Lh * 0.95), (-Lh * 0.12, Lh * 1.0)]
        bowx = Lh / 2 + Lh * 0.2
        spar(p, (Lh * 0.42, 0, fb * 1.3), (bowx, 0, fb * 1.7), mast_r * 1.1)
        yard_ang = 0.0 if state == 'docked' else 0.32 * tack
        for k, (mx, mh) in enumerate(masts):
            spar(p, (mx, 0, zd - 0.2), (mx, 0, zd + mh * 0.62), mast_r * 1.1)
            spar(p, (mx, 0, zd + mh * 0.58), (mx, 0, zd + mh), mast_r * 0.7)
            # tops
            if rig == 'ship':
                p.add(bm_box(1.2, 1.6, 0.12, (mx, 0, zd + mh * 0.6)), P('timber_dk'))
            # shrouds
            for s in (-1, 1):
                spar(p, (mx, 0, zd + mh * 0.6), (mx - 0.4, s * (B / 2 + 0.1), zd + 0.1), 0.03, 'iron', 3)
            if k == 1:
                light((mx, 0, zd + mh + 0.15))
            pennant((mx, 0, zd + mh + 0.1), brand if k == 1 else P('frame_white'), L=2.4 if rig == 'ship' else 1.8)
            is_spanker_mast = (k == len(masts) - 1)
            nyards = 3 if rig == 'ship' else 2
            if rig == 'ship' and is_spanker_mast:
                nyards = 2
            yspan = [B * 1.25, B * 1.0, B * 0.75]
            yz = [0.38, 0.62, 0.84]
            for yi in range(nyards):
                half = yspan[yi] / 2
                zc = zd + mh * yz[yi]
                d = Vector((math.sin(yard_ang), math.cos(yard_ang), 0))
                a = Vector((mx, 0, zc)) - d * half; b = Vector((mx, 0, zc)) + d * half
                spar(p, a, b, mast_r * 0.55, segs=4)
                if state == 'docked':
                    furl(p, a.lerp(b, 0.08) + Vector((0, 0, 0.1)), a.lerp(b, 0.92) + Vector((0, 0, 0.1)), 0.13 + Lh * 0.003, cover, segs=4 if rig == 'brig' else 5)
                else:
                    # square sail hanging to the yard below
                    zb = zd + mh * (yz[yi - 1] if yi > 0 else 0.12) + (0.15 if yi > 0 else 0.6)
                    hb = (yspan[yi - 1] / 2 if yi > 0 else half * 1.05)
                    a2 = Vector((mx, 0, zb)) - d * hb; b2 = Vector((mx, 0, zb)) + d * hb
                    emb = ((0.5, 0.45), (0.55, 0.75)) if (k == 1 and yi == 0) or (rig == 'brig' and k == 0 and yi == 0) else None
                    sails.add(sail_quad(a2, a, b, b2, 0.55 * Lh / 18, nu=5, nv=4, emblem=emb), canvas, mat='sail', smooth=True)
            if is_spanker_mast:
                boom_len = Lh * 0.3
                ang = 0.0 if state == 'docked' else 0.3 * tack
                be = Vector((mx, 0, zd + 1.6)) + Vector((-math.cos(ang), -math.sin(ang), 0)) * boom_len
                spar(p, (mx, 0, zd + 1.6), be, mast_r * 0.6)
                th = Vector((mx, 0, zd + mh * 0.55))
                if state == 'docked':
                    furl(p, (mx - 0.2, 0, zd + 1.85), be + Vector((0.3, 0, 0.2)), 0.25, cover)
                    spar(p, (mx, 0, zd + 2.1), (mx - boom_len * 0.6, 0, zd + 2.2), mast_r * 0.5)
                else:
                    gdir = Vector((-math.cos(ang) * 0.85, -math.sin(ang) * 0.85, 0.5))
                    pk = th + gdir * boom_len * 0.65
                    spar(p, th, pk, mast_r * 0.5)
                    sails.add(sail_quad((mx - 0.15, 0, zd + 1.7), th, pk, be, -0.35 * tack), canvas, mat='sail', smooth=True)
        # jibs / headstays
        fm_, fh = masts[0]
        for j in range(2 if rig == 'ship' else 1):
            top = Vector((fm_, 0, zd + fh * (0.62 + 0.18 * j)))
            bow = Vector((bowx - j * 1.5, 0, fb * 1.7))
            fwd_stay(top, bow)
            if state != 'docked':
                sails.add(sail_tri(top + Vector((0.2, 0, 0)), bow, Vector((fm_ + 1.0, -tack * B * 0.3, zd + 2.0 + j)), -0.3 * tack),
                          canvas, mat='sail', smooth=True)
        light((-Lh / 2 + 0.3, 0, fb * 1.5), 'stern')
        # ensign staff at the stern
    # ensign (currency flag) on a staff at the stern
    st = Vector((-Lh / 2 + 0.15, 0, fb * 1.2))
    spar(p, st, st + Vector((-0.4, 0, 1.4 + Lh * 0.03)), 0.03, 'timber_dk', 4)
    flag_c = {'usd_sloop': ('hull_navy', 'frame_white'), 'usd_schooner': ('hull_navy', 'frame_white'),
              'usd_ship': ('hull_navy', 'frame_white'), 'eur_botter': ('brand_eurc', 'gilt'), 'gold_brig': ('hull_black', 'gilt')}[family]
    fz = st.z + 1.0 + Lh * 0.03
    fw = 0.9 + Lh * 0.03
    p.add(bm_box(fw, 0.04, fw * 0.62, (st.x - 0.42 - fw / 2, 0, fz)), P(flag_c[0]))
    p.add(bm_box(fw * 0.4, 0.05, fw * 0.3, (st.x - 0.42 - fw * 0.22, 0, fz + fw * 0.12)), P(flag_c[1]))
    # cleats + fender positions (for mooring lines)
    for xx in (Lh * 0.4, -Lh * 0.4):
        u = 2 * xx / Lh
        info['cleats'].append(Vector((xx, 0, fb * (1 + 0.22 * u * u + 0.35 * max(u, 0) ** 2))))
    return p, (sails if sails.tris() > 0 else None), info


def fenders(p, Lh, B, fb, side=-1, n=2):
    for i in range(n):
        x = -Lh * 0.25 + i * Lh * 0.5 / max(1, n - 1)
        u = 2 * x / Lh
        w = B / 2 * ((1 - max(u, 0) ** 2.1) ** 0.55 if u >= 0 else (1 - 0.32 * u * u))
        y = side * (w + 0.14)
        p.add(bm_cyl(0.13, 0.13, 0.6, 6, (x, y, fb * 0.35), cap=False), P('frame_white', 0.95), smooth=True)
        p.add(bm_rod((x, y, fb * 0.35 + 0.6), (x, side * (w - 0.05), fb * 1.05), 0.015, 3), lin('#CDBB92'))
