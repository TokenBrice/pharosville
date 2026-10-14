"""Harbour civic kit - palette + architectural primitives on top of the hull MB builder (style C contract).

Blender axes while building: x = right, y = BACK (away from the water), z = up; the plot centre is the origin and
the FRONT (water / camera side) faces -y. glTF export: +x right, +y up, +z front (Blender -y).

Materials (by name, swapped at runtime by src/harbour/world/materials.ts):
  hb_opaque    COLOR_0 rgb = albedo, a = pattern id / 16
  hb_window    COLOR_0 r = lit (0 dark room .. 1), g = warmth; one connected piece = one pane
  hb_emissive  glows sodium-warm x uLamp (fire, furnace mouths, lamps)
  hb_cover     COLOR_0 rgb = shade; final = chain colour x shade (awnings)
  hb_crest     TEXCOORD_0 = crest square [0,1]^2 (the chain crest texture goes here); COLOR_0 = cream ground
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'hulls'))
import bpy
from mathutils import Vector, Matrix
import hb_lib
from hb_lib import MB, PT, lin, box, box2, rod, to_object, empty, descendants, tri_count, reset_scene, basis

HEX = {
    # stone (warm Alexandrian limestone bridges the Nordic town and the Pharos)
    'stone': '#D8CDB5', 'stone_light': '#E8E0CC', 'stone_dark': '#A99D86', 'marble': '#EFEAE0', 'stone_rose': '#D9B9A0',
    'granite': '#9C9C97', 'granite_light': '#BDBAB2', 'quay': '#A8A398', 'quay_dark': '#7A756C', 'cobble': '#8F8A82',
    'brick': '#9C4A33', 'brick_dark': '#74372A', 'brick_light': '#B5634A', 'soot': '#2D2A29', 'soot2': '#4A4541', 'ash': '#8D8984',
    'slate': '#3E464F', 'roof_red': '#A6492F', 'roof_ochre': '#C17A3A', 'copper': '#5E9C88', 'copper_dark': '#3F7565', 'lead': '#6F767C',
    'timber': '#A57B52', 'timber_fresh': '#C9A271', 'timber_grey': '#8A8278', 'timber_dark': '#5A4636', 'tar': '#2A2522', 'oak': '#6E4A2E',
    'iron': '#25292D', 'brass': '#C2923F', 'gilt': '#D9A93E', 'gold': '#F0C14E', 'bronze': '#9A6430', 'bronze_light': '#C08A4A',
    'trim': '#F7F4ED', 'wall_white': '#F0ECE3', 'wall_ochre': '#DCA548', 'wall_falu': '#963326', 'cream': '#E9DDBF',
    'wall_blue': '#9DB8CB', 'wall_mint': '#ABCBB3', 'wall_sage': '#87998A', 'wall_salmon': '#E0977A', 'wall_mustard': '#E6BE5E',
    'interior': '#2B2421', 'interior2': '#3D312A', 'water': '#2C6170', 'water_dark': '#1E4A57',
    'rock': '#857F78', 'rock_dark': '#5E5A55', 'rock_light': '#A8A29A', 'lichen': '#C2A85A', 'grass': '#748F45',
    'canvas': '#F2ECDF', 'rope': '#CDBB92', 'door_green': '#2F5A4A', 'door_blue': '#2E4B6B', 'door_red': '#7A2A22',
    'flag_red': '#B23A30', 'flag_blue': '#2A4A86', 'flag_white': '#F2EFE8', 'flag_gold': '#E1B649', 'clock': '#F4EEDC',
    'hull_red': '#8E2F24', 'hull_black': '#1E2327', 'antifoul': '#7B2E25', 'deck': '#C4A272', 'cone': '#1A1D20',
}
PAL = {k: lin(v) for k, v in HEX.items()}
PAL.update({k: v for k, v in hb_lib.PAL.items() if k not in PAL})

# chain accents (identity only; the runtime tints hb_cover with the same hue)
CHAINS = {
    'ethereum': '#627EEA', 'tron': '#D8322B', 'bsc': '#F0B90B', 'solana': '#9945FF',
    'hyperliquid-l1': '#3FC1AE', 'base': '#0052FF', 'arbitrum': '#28A0F0', 'polygon': '#8247E5',
}


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def mul(a, k):
    return tuple(min(1.0, x * k) for x in a)


def sstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ kit (one MB per material)
class Kit:
    def __init__(s, seed=0):
        s.op, s.win, s.em, s.cover, s.crest = MB(seed), MB(seed + 1), MB(seed + 2), MB(seed + 3), MB(seed + 4)
        s.rng = random.Random(seed)
        s.lit_p = 0.72

    def emit(s, root, name, coll=None):
        """Static meshes of this kit under root: <name> (opaque), <name>_windows, <name>_lamps, <name>_awning, crest_panel."""
        out = {}
        for attr, suffix, mat in (('op', '', 'hb_opaque'), ('win', '_windows', 'hb_window'), ('em', '_lamps', 'hb_emissive'),
                                  ('cover', '_awning', 'hb_cover'), ('crest', '_crest', 'hb_crest')):
            mb = getattr(s, attr)
            if mb.f:
                out[attr] = to_object(mb, name + suffix, mat, parent=root, coll=coll)
        return out


def obj(mb, name, mat, root, origin=(0, 0, 0), coll=None, props=None):
    return to_object(mb, name, mat, parent=root, origin=origin, coll=coll, props=props)


# ------------------------------------------------------------------ polygons
def newell(pts):
    n = Vector()
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y)
    return n


def poly(mb, pts, col, pat=0, nrm=None, uv=None, jitter=0.03, smooth=False, brand=0.0):
    """One face through pts; flipped to face nrm when given."""
    pts = [Vector(p) for p in pts]
    if nrm is not None and newell(pts).dot(Vector(nrm)) < 0:
        pts = pts[::-1]
        uv = uv[::-1] if uv else None
    mb.face([mb.vert(p) for p in pts], col, pat, brand, uv=uv, jitter=jitter, smooth=smooth)


def fan(mb, apex, pts, col, pat=0, nrm=None, jitter=0.03):
    for a, b in zip(pts[:-1], pts[1:]):
        poly(mb, (apex, a, b), col, pat, nrm, jitter=jitter)


def frame3(n):
    """(t, n, up) for a vertical wall with outward normal n (t = right when looking at the wall)."""
    n = Vector(n).normalized()
    up = Vector((0, 0, 1))
    t = up.cross(n).normalized()
    return t, n, up


def obox(mb, c, t, n, sx, sn, sz, col, pat=0, skip=(), jitter=0.03):
    """Box centred at c with half-axes along t (width sx), n (depth sn), up (height sz)."""
    box(mb, c, (sx, sn, sz), col, pat, axes=(Vector(t), Vector(n), Vector((0, 0, 1))), skip=skip, jitter=jitter)


def beam(mb, p, q, w, h, col, pat=0, up=Vector((0, 0, 1)), skip=()):
    """Rectangular timber between p and q (w across, h in the up-ish direction)."""
    p, q = Vector(p), Vector(q)
    d = q - p
    L = d.length
    if L < 1e-6:
        return
    a = d / L
    u = up if abs(a.dot(up)) < 0.95 else Vector((1, 0, 0))
    s_ = a.cross(u).normalized()
    v = s_.cross(a).normalized()
    box(mb, (p + q) / 2, (L, w, h), col, pat, axes=(a, s_, v), skip=skip)


def cyl(mb, c, r0, r1, z0, z1, col, pat=0, segs=10, top=True, bottom=False, smooth=False, rot=0.0, col_top=None, pat_top=None):
    c = Vector((c[0], c[1], 0))
    A = [mb.vert(c + Vector((r0 * math.cos(rot + 2 * math.pi * k / segs), r0 * math.sin(rot + 2 * math.pi * k / segs), z0))) for k in range(segs)]
    B = [mb.vert(c + Vector((r1 * math.cos(rot + 2 * math.pi * k / segs), r1 * math.sin(rot + 2 * math.pi * k / segs), z1))) for k in range(segs)]
    for k in range(segs):
        k2 = (k + 1) % segs
        mb.face((A[k], A[k2], B[k2], B[k]), col, pat, smooth=smooth)
    if top and r1 > 1e-4:
        mb.face(B, col_top or col, pat_top if pat_top is not None else pat)
    if bottom and r0 > 1e-4:
        mb.face(A[::-1], col, pat)


def lathe(mb, c, prof, col, pat=0, segs=12, smooth=True, colfn=None, cap=True, rot=0.0):
    """Surface of revolution: prof = [(r, z), ...] bottom -> top. colfn(z) -> colour per ring band."""
    c = Vector((c[0], c[1], 0))
    rings = []
    for (r, z) in prof:
        if r < 1e-4:
            rings.append([mb.vert(c + Vector((0, 0, z)))] * segs)
        else:
            rings.append([mb.vert(c + Vector((r * math.cos(rot + 2 * math.pi * k / segs), r * math.sin(rot + 2 * math.pi * k / segs), z)))
                          for k in range(segs)])
    for i in range(len(rings) - 1):
        zc = (prof[i][1] + prof[i + 1][1]) / 2
        cc = colfn(zc) if colfn else col
        for k in range(segs):
            k2 = (k + 1) % segs
            mb.face((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]), cc, pat, smooth=smooth)
    if cap and prof[-1][0] > 1e-4:
        mb.face(rings[-1], colfn(prof[-1][1]) if colfn else col, pat)


def dome(mb, c, z, r, h, col, pat=0, segs=14, rings=5, smooth=True, drum=None, finial=None, ribs=None):
    prof = [(r * math.cos(0.5 * math.pi * i / rings), z + h * math.sin(0.5 * math.pi * i / rings)) for i in range(rings + 1)]
    prof[-1] = (0.0, z + h)
    lathe(mb, c, prof, col, pat, segs, smooth)
    if ribs:
        for k in range(segs):
            a = 2 * math.pi * (k + 0.5) / segs
            pts = [Vector((c[0] + (rr + 0.06) * math.cos(a), c[1] + (rr + 0.06) * math.sin(a), zz)) for rr, zz in prof[:-1]]
            for p, q in zip(pts[:-1], pts[1:]):
                beam(mb, p, q, 0.22, 0.12, ribs)


# ------------------------------------------------------------------ classical parts
def column(mb, x, y, z0, h, r, col, segs=8, cap_col=None, base=True):
    if base:
        box2(mb, x - r * 1.4, y - r * 1.4, z0, x + r * 1.4, y + r * 1.4, z0 + r * 0.7, col, 0)
        cyl(mb, (x, y), r * 1.18, r * 1.0, z0 + r * 0.7, z0 + r * 1.1, col, 0, segs, top=False)
    zb = z0 + (r * 1.1 if base else 0)
    cyl(mb, (x, y), r, r * 0.86, zb, z0 + h - r * 0.8, col, 0, segs, top=False, smooth=True, rot=math.pi / segs)
    cyl(mb, (x, y), r * 0.9, r * 1.3, z0 + h - r * 0.8, z0 + h - r * 0.45, cap_col or col, 0, segs, top=False)
    box2(mb, x - r * 1.45, y - r * 1.45, z0 + h - r * 0.45, x + r * 1.45, y + r * 1.45, z0 + h, cap_col or col, 0)


def colonnade(mb, x0, x1, y, z0, h, n, r, col, cap_col=None):
    xs = [x0 + (x1 - x0) * i / (n - 1) for i in range(n)]
    for x in xs:
        column(mb, x, y, z0, h, r, col, cap_col=cap_col)
    return xs


def pediment(mb, x0, x1, yf, yb, z, rise, col, tymp=None, cornice=0.45, pat=0):
    """Triangular gable front at yf (facing -y) running back to yb, with a projecting raking cornice."""
    xm = (x0 + x1) / 2
    tp = tymp or col
    # tympanum (recessed) + roof slopes
    poly(mb, ((x0, yf + 0.25, z), (x1, yf + 0.25, z), (xm, yf + 0.25, z + rise)), tp, pat, nrm=(0, -1, 0))
    # raking cornices (front)
    for (xa, za), (xb, zb) in (((x0 - cornice, z - 0.1), (xm, z + rise + cornice * 0.45)), ((xm, z + rise + cornice * 0.45), (x1 + cornice, z - 0.1))):
        beam(mb, (xa, yf, za), (xb, yf, zb), 0.7, 0.5, col)
    box2(mb, x0 - cornice, yf - 0.1, z - 0.55, x1 + cornice, yb, z, col, 0)    # horizontal cornice


def gable_roof(mb, x0, y0, x1, y1, z, rise, col, pat=PT['tiles'], ov=0.6, end_col=None, end_pat=PT['ashlar'], axis='x',
               ends=True, th=0.28, fascia=None):
    """Pitched roof over the rectangle; ridge along `axis`. Gable ends filled in end_col."""
    if axis == 'x':
        ym = (y0 + y1) / 2; half = (y1 - y0) / 2
        drop = ov * rise / half
        for s, ye in ((-1, y0 - ov), (1, y1 + ov)):
            pts = ((x0 - ov, ye, z - drop), (x1 + ov, ye, z - drop), (x1 + ov, ym, z + rise), (x0 - ov, ym, z + rise))
            poly(mb, pts, col, pat, nrm=(0, s, 1))
            poly(mb, ((x0 - ov, ye, z - drop - th), (x1 + ov, ye, z - drop - th), (x1 + ov, ye, z - drop), (x0 - ov, ye, z - drop)),
                 fascia or mul(col, 0.7), 0, nrm=(0, s, 0))
        for s, xe in ((-1, x0 - ov), (1, x1 + ov)):   # verge edges
            for ye in (y0 - ov, y1 + ov):
                poly(mb, ((xe, ye, z - drop - th), (xe, ye, z - drop), (xe, ym, z + rise), (xe, ym, z + rise - th)),
                     fascia or mul(col, 0.7), 0, nrm=(s, 0, 0))
        if ends:
            for s, xe in ((-1, x0), (1, x1)):
                poly(mb, ((xe, y0, z), (xe, y1, z), (xe, ym, z + rise)), end_col or col, end_pat, nrm=(s, 0, 0))
    else:
        xm = (x0 + x1) / 2; half = (x1 - x0) / 2
        drop = ov * rise / half
        for s, xe in ((-1, x0 - ov), (1, x1 + ov)):
            pts = ((xe, y0 - ov, z - drop), (xe, y1 + ov, z - drop), (xm, y1 + ov, z + rise), (xm, y0 - ov, z + rise))
            poly(mb, pts, col, pat, nrm=(s, 0, 1))
            poly(mb, ((xe, y0 - ov, z - drop - th), (xe, y1 + ov, z - drop - th), (xe, y1 + ov, z - drop), (xe, y0 - ov, z - drop)),
                 fascia or mul(col, 0.7), 0, nrm=(s, 0, 0))
        for s, ye in ((-1, y0 - ov), (1, y1 + ov)):
            for xe in (x0 - ov, x1 + ov):
                poly(mb, ((xe, ye, z - drop - th), (xe, ye, z - drop), (xm, ye, z + rise), (xm, ye, z + rise - th)),
                     fascia or mul(col, 0.7), 0, nrm=(0, s, 0))
        if ends:
            for s, ye in ((-1, y0), (1, y1)):
                poly(mb, ((x0, ye, z), (x1, ye, z), (xm, ye, z + rise)), end_col or col, end_pat, nrm=(0, s, 0))


def hip_roof(mb, x0, y0, x1, y1, z, rise, col, pat=PT['slate'], ov=0.5, th=0.3, fascia=None):
    X0, Y0, X1, Y1 = x0 - ov, y0 - ov, x1 + ov, y1 + ov
    w, d = X1 - X0, Y1 - Y0
    zr = z + rise
    if w >= d:
        a = (X0 + d / 2, (Y0 + Y1) / 2, zr); b = (X1 - d / 2, (Y0 + Y1) / 2, zr)
    else:
        a = ((X0 + X1) / 2, Y0 + w / 2, zr); b = ((X0 + X1) / 2, Y1 - w / 2, zr)
    zo = z - ov * rise / (min(w, d) / 2)
    c00, c10, c11, c01 = (X0, Y0, zo), (X1, Y0, zo), (X1, Y1, zo), (X0, Y1, zo)
    if w >= d:
        poly(mb, (c00, c10, b, a), col, pat, nrm=(0, -1, 1)); poly(mb, (c11, c01, a, b), col, pat, nrm=(0, 1, 1))
        poly(mb, (c01, c00, a), col, pat, nrm=(-1, 0, 1)); poly(mb, (c10, c11, b), col, pat, nrm=(1, 0, 1))
    else:
        poly(mb, (c00, c10, a), col, pat, nrm=(0, -1, 1)); poly(mb, (c11, c01, b), col, pat, nrm=(0, 1, 1))
        poly(mb, (c01, c00, a, b), col, pat, nrm=(-1, 0, 1)); poly(mb, (c10, c11, b, a), col, pat, nrm=(1, 0, 1))
    fc = fascia or mul(col, 0.7)
    for p, q, n in ((c00, c10, (0, -1, 0)), (c10, c11, (1, 0, 0)), (c11, c01, (0, 1, 0)), (c01, c00, (-1, 0, 0))):
        poly(mb, (p, q, (q[0], q[1], q[2] - th), (p[0], p[1], p[2] - th)), fc, 0, nrm=n)


def pyramid_roof(mb, cx, cy, half, z, rise, col, pat=PT['slate'], ov=0.3, segs=4, rot=math.pi / 4):
    r = (half + ov) / math.cos(math.pi / segs)
    pts = [Vector((cx + r * math.cos(rot + 2 * math.pi * k / segs), cy + r * math.sin(rot + 2 * math.pi * k / segs), z - ov * 0.4))
           for k in range(segs)]
    ap = Vector((cx, cy, z + rise))
    for k in range(segs):
        poly(mb, (pts[k], pts[(k + 1) % segs], ap), col, pat, nrm=(0, 0, 1))


def extrude_roof(mb, x0, x1, prof, col, pat=PT['slate'], end_col=None, end_pat=PT['ashlar'], ends=True, cols=None):
    """Roof from a cross-section prof = [(y, z), ...] (front eave -> back eave) extruded along x; convex profile."""
    for i in range(len(prof) - 1):
        (ya, za), (yb, zb) = prof[i], prof[i + 1]
        n = Vector((0, -(zb - za), (yb - ya))).normalized()
        if n.z < 0:
            n = -n
        poly(mb, ((x0, ya, za), (x1, ya, za), (x1, yb, zb), (x0, yb, zb)), (cols[i] if cols else col), pat, nrm=n)
    if ends:
        for s, xe in ((-1, x0), (1, x1)):
            poly(mb, [(xe, y, z) for y, z in prof], end_col or col, end_pat, nrm=(s, 0, 0))


def arcade(mb, x0, x1, yf, thick, z0, ztop, nb, pier, spring, col, pat=PT['ashlar'], intr=None, back=False, seg=8, keystone=None):
    """Wall along x with nb round-arched openings (front face at yf facing -y). Returns [(xc, r)]."""
    r = ((x1 - x0) - (nb + 1) * pier) / (2 * nb)
    out = []
    intr = intr or mul(col, 0.8)
    for i in range(nb + 1):     # piers
        px0 = x0 + i * (pier + 2 * r)
        box2(mb, px0, yf, z0, px0 + pier, yf + thick, ztop, col, pat, skip=('+z', '-z') if not back else ('-z',))
    faces_y = (yf,) if not back else (yf, yf + thick)
    for i in range(nb):
        xc = x0 + pier + r + i * (pier + 2 * r)
        arc = [Vector((xc + r * math.cos(math.pi * (1 - k / seg)), 0, spring + r * math.sin(math.pi * (1 - k / seg)))) for k in range(seg + 1)]
        for y, n in zip(faces_y, ((0, -1, 0), (0, 1, 0))):
            TL = Vector((xc - r, y, ztop)); TR = Vector((xc + r, y, ztop))
            A = [Vector((p.x, y, p.z)) for p in arc]
            h = seg // 2
            fan(mb, TL, A[:h + 1], col, pat, nrm=n)
            fan(mb, TR, A[h:], col, pat, nrm=n)
            poly(mb, (TL, A[h], TR), col, pat, nrm=n)
        for a, b in zip(arc[:-1], arc[1:]):    # soffit
            m = (a + b) / 2
            nn = Vector((xc - m.x, 0, spring - m.z))
            poly(mb, ((a.x, yf, a.z), (b.x, yf, b.z), (b.x, yf + thick, b.z), (a.x, yf + thick, a.z)), intr, 0, nrm=nn)
        if keystone:
            box2(mb, xc - 0.35, yf - 0.12, spring + r - 0.25, xc + 0.35, yf + 0.3, spring + r + 0.55, keystone, 0)
        out.append((xc, r))
    # top of the wall
    poly(mb, ((x0, yf, ztop), (x1, yf, ztop), (x1, yf + thick, ztop), (x0, yf + thick, ztop)), col, 0, nrm=(0, 0, 1))
    return out


# ------------------------------------------------------------------ openings
def window(K, c, n, w, h, frame=None, arch=False, sill=True, lit=None, warm=None, shutters=None, depth=0.08, mullion=False,
           head=None):
    """Glass pane on a wall at c (wall surface) facing n + a frame/sill/head in the opaque kit."""
    t, n, up = frame3(n)
    c = Vector(c)
    fr = frame or PAL['trim']
    fw = max(0.1, w * 0.1)
    op = K.op
    # frame (four bars), proud of the wall
    obox(op, c + n * depth / 2 - up * (h / 2 + fw / 2), t, n, w + 2 * fw, depth, fw, fr, skip=('-y',))
    for s in (-1, 1):
        obox(op, c + n * depth / 2 + t * s * (w / 2 + fw / 2), t, n, fw, depth, h, fr, skip=('-y', '-z', '+z'))
    if not arch:
        obox(op, c + n * depth / 2 + up * (h / 2 + fw / 2), t, n, w + 2 * fw, depth, fw, fr, skip=('-y',))
    else:
        seg = 6
        R = w / 2 + fw / 2
        pts = [c + n * depth / 2 + up * (h / 2) + t * (R * math.cos(math.pi * k / seg)) + up * (R * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
        for a, b in zip(pts[:-1], pts[1:]):
            beam(op, a, b, depth, fw, fr, up=n)
    if head:
        obox(op, c + n * (depth + 0.05) + up * (h / 2 + fw + 0.12 + (w / 2 if arch else 0)), t, n, w + 2 * fw + 0.4, 0.22, 0.24, head, skip=('-y',))
    if sill:
        obox(op, c + n * 0.12 - up * (h / 2 + fw + 0.04), t, n, w + 2 * fw + 0.3, 0.24, 0.12, fr, skip=('-y',))
    if mullion:
        obox(op, c + n * 0.05, t, n, 0.08, 0.06, h, fr)
    if shutters is not None:
        for s in (-1, 1):
            obox(op, c + n * 0.06 + t * s * (w / 2 + fw + w * 0.27), t, n, w * 0.5, 0.06, h + 0.1, shutters, PT['boards'], skip=('-y', '-z'))
    # glass
    if lit is None:
        lit = K.rng.uniform(0.55, 1.0) if K.rng.random() < K.lit_p else 0.0
    if warm is None:
        warm = K.rng.uniform(0.0, 0.6)
    g = c + n * 0.03
    pts = [g - t * w / 2 - up * h / 2, g + t * w / 2 - up * h / 2]
    if arch:
        seg = 6
        pts += [g + up * (h / 2) + t * (w / 2 * math.cos(math.pi * k / seg)) + up * (w / 2 * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    else:
        pts += [g + t * w / 2 + up * h / 2, g - t * w / 2 + up * h / 2]
    poly(K.win, pts, (lit, warm, 0.0), 0, nrm=n, jitter=0.0)


def windows_along(K, a, b, z, n, count, w, h, **kw):
    """count windows evenly between points a and b (on the wall surface) at height z (centre)."""
    a, b = Vector(a), Vector(b)
    for i in range(count):
        p = a.lerp(b, (i + 0.5) / count)
        window(K, (p.x, p.y, z), n, w, h, **kw)


def door(K, c, n, w, h, col=None, frame=None, arch=False, step=True, lamp=False):
    t, n, up = frame3(n)
    c = Vector(c)
    op = K.op
    col = col or PAL['door_green']
    fr = frame or PAL['trim']
    obox(op, c + n * 0.05 + up * (h / 2), t, n, w, 0.1, h, col, PT['boards'])
    obox(op, c + n * 0.08 + up * (h + 0.15), t, n, w + 0.5, 0.18, 0.3, fr)
    for s in (-1, 1):
        obox(op, c + n * 0.08 + t * s * (w / 2 + 0.12) + up * (h / 2), t, n, 0.24, 0.16, h, fr)
    if arch:
        poly(K.win, [c + n * 0.13 + up * (h + 0.3) + t * (w / 2 * math.cos(math.pi * k / 6)) + up * (w / 2 * 0.7 * math.sin(math.pi * k / 6))
                     for k in range(7)], (K.rng.uniform(0.6, 1.0), 0.3, 0), 0, nrm=n, jitter=0)
    if step:
        obox(op, c + n * 0.45 + up * 0.08 - up * 0.08, t, n, w + 0.8, 0.9, 0.3, PAL['granite_light'], PT['ashlar'])
    if lamp:
        for s in (-1, 1):
            p = c + n * 0.35 + t * s * (w / 2 + 0.55) + up * (h * 0.85)
            obox(op, p + up * 0.32, t, n, 0.3, 0.3, 0.08, PAL['iron'])
            obox(K.em, p, t, n, 0.24, 0.24, 0.4, PAL['iron'])


def stairs(mb, x0, x1, y_front, z0, z1, n, depth, col, pat=PT['ashlar'], ny=-1):
    """n steps rising from z0 at y_front to z1, each `depth` deep, going +y (ny=-1 means facing -y)."""
    for i in range(n):
        za = z0 + (z1 - z0) * (i + 1) / n
        ya = y_front - ny * i * depth
        yb = y_front - ny * n * depth
        lo, hi = min(ya, yb), max(ya, yb)
        box2(mb, x0, lo, z0, x1, hi, za, col, pat, skip=('-z',))


def rail(mb, pts, h, col, post_every=1.6, r=0.06):
    pts = [Vector(p) for p in pts]
    for a, b in zip(pts[:-1], pts[1:]):
        beam(mb, a + Vector((0, 0, h)), b + Vector((0, 0, h)), 0.12, 0.1, col)
        n = max(1, int((b - a).length / post_every))
        for k in range(n + 1):
            p = a.lerp(b, k / n)
            box2(mb, p.x - r, p.y - r, p.z, p.x + r, p.y + r, p.z + h, col, 0, skip=('-z', '+z'))


def flag_mesh(mb, p, w, h, col, stripes=None, n=4, wave=0.35):
    """Waving flag in the x-z plane from the pole at p (hoist side) flying +x."""
    p = Vector(p)
    for i in range(n):
        u0, u1 = i / n, (i + 1) / n
        y0 = math.sin(u0 * 3.0) * wave * u0; y1 = math.sin(u1 * 3.0) * wave * u1
        for j, (va, vb) in enumerate(((0, 0.5), (0.5, 1))) if stripes else enumerate(((0, 1),)):
            c = stripes[j] if stripes else col
            pts = (p + Vector((u0 * w, y0, -va * h)), p + Vector((u1 * w, y1, -va * h)), p + Vector((u1 * w, y1, -vb * h)), p + Vector((u0 * w, y0, -vb * h)))
            poly(mb, pts, c, 0, nrm=(0, -1, 0))
            poly(mb, pts, mul(c, 0.85), 0, nrm=(0, 1, 0))


def pole(mb, p, h, r, col, top_ball=None):
    cyl(mb, p, r, r * 0.6, p[2] if len(p) > 2 else 0.0, (p[2] if len(p) > 2 else 0.0) + h, col, 0, 6)
    if top_ball:
        cyl(mb, p, r * 1.6, r * 1.6, (p[2] if len(p) > 2 else 0.0) + h, (p[2] if len(p) > 2 else 0.0) + h + r * 2.4, top_ball, 0, 6)


def plinth(mb, x0, y0, x1, y1, z, col=None, top=None, pat_top=PT['cobble'], skirt=2.0):
    """Plot base: top surface at z, ashlar sides down to z - skirt (sits into uneven terrain)."""
    box2(mb, x0, y0, z - skirt, x1, y1, z, col or PAL['granite'], PT['ashlar'], skip=('+z', '-z'))
    poly(mb, ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)), top or PAL['cobble'], pat_top, nrm=(0, 0, 1))


def crate(mb, c, s, col=None, rz=0.0):
    t = Vector((math.cos(rz), math.sin(rz), 0)); n = Vector((-math.sin(rz), math.cos(rz), 0))
    obox(mb, Vector(c) + Vector((0, 0, s / 2)), t, n, s, s, s, col or PAL['timber'], PT['boards'], skip=('-z',))


def barrel(mb, c, r=0.45, h=1.0, col=None):
    lathe(mb, c, [(r * 0.85, c[2]), (r, c[2] + h / 2), (r * 0.85, c[2] + h)], col or PAL['oak'], PT['boards'], 7, smooth=True)


def set_props(ob, **kw):
    for k, v in kw.items():
        ob[k] = v
    return ob


def disc(mb, c, n, r, depth, col, segs=16, pat=0, col_side=None, rot=0.0):
    """Medallion: a short cylinder whose axis is the (horizontal) normal n; front face at c + n*depth."""
    t, n, up = frame3(n)
    c = Vector(c)
    ring = [(t * math.cos(rot + 2 * math.pi * k / segs) + up * math.sin(rot + 2 * math.pi * k / segs)) * r for k in range(segs)]
    F = [mb.vert(c + n * depth + v) for v in ring]
    B = [mb.vert(c + v) for v in ring]
    for k in range(segs):
        k2 = (k + 1) % segs
        pts = [mb.v[i] for i in (B[k], B[k2], F[k2], F[k])]
        poly(mb, pts, col_side or mul(col, 0.8), 0, nrm=(pts[0] + pts[1]) / 2 - c - n * depth / 2)
    poly(mb, [mb.v[i] for i in F], col, pat, nrm=n)


def sphere(mb, c, r, col, segs=8, rings=4, pat=0, smooth=True):
    prof = [(r * math.sin(math.pi * i / rings), c[2] - r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    prof[0] = (0.0, c[2] - r); prof[-1] = (0.0, c[2] + r)
    lathe(mb, c, prof, col, pat, segs, smooth, cap=False)


def flames(mb, c, rng, n, r, h0, h1, col=(1.0, 0.55, 0.15), twist=0.4, segs=5):
    """Cluster of faceted flame tongues (cones) rising from the disc (c, r)."""
    c = Vector(c)
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.3, 0.3)
        rr = r * (0.0 if i == 0 else rng.uniform(0.35, 0.95))
        p = c + Vector((math.cos(a) * rr, math.sin(a) * rr, 0))
        h = rng.uniform(h0, h1) * (1.0 if i == 0 else 1.0 - 0.45 * rr / max(r, 1e-3))
        w = rng.uniform(0.55, 0.9) * (h * 0.3 + 0.4)
        lean = Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 0)) * h
        base = [p + Vector((math.cos(twist * k + 2 * math.pi * k / segs) * w, math.sin(2 * math.pi * k / segs) * w, 0)) for k in range(segs)]
        mid = [p + (b - p) * 0.75 + Vector((0, 0, h * 0.35)) + lean * 0.35 for b in base]
        tip = p + Vector((0, 0, h)) + lean
        B = [mb.vert(q) for q in base]; M = [mb.vert(q) for q in mid]; T = mb.vert(tip)
        for k in range(segs):
            k2 = (k + 1) % segs
            mb.face((B[k], B[k2], M[k2], M[k]), col, 0, jitter=0.0)
            mb.face((M[k], M[k2], T), col, 0, jitter=0.0)


def extrude_y(mb, y0, y1, prof, col, pat=PT['slate'], end_col=None, end_pat=PT['ashlar'], ends=True):
    """Roof from a cross-section prof = [(x, z), ...] (left eave -> right eave) extruded along y (ridge front-back)."""
    for i in range(len(prof) - 1):
        (xa, za), (xb, zb) = prof[i], prof[i + 1]
        n = Vector((-(zb - za), 0, (xb - xa))).normalized()
        if n.z < 0:
            n = -n
        poly(mb, ((xa, y0, za), (xb, y0, zb), (xb, y1, zb), (xa, y1, za)), col, pat, nrm=n)
    if ends:
        for s, ye in ((-1, y0), (1, y1)):
            poly(mb, [(x, ye, z) for x, z in prof], end_col or col, end_pat, nrm=(0, s, 0))


def wall_poly(mb, y, pts2, col, pat=PT['ashlar'], ny=-1, centre=None):
    """Fill a star-shaped outline [(x, z)...] on the plane y (facing ny) by a fan from `centre`."""
    cx = centre[0] if centre else sum(p[0] for p in pts2) / len(pts2)
    cz = centre[1] if centre else sum(p[1] for p in pts2) / len(pts2)
    ring = pts2 + [pts2[0]]
    for a, b in zip(ring[:-1], ring[1:]):
        poly(mb, ((cx, y, cz), (a[0], y, a[1]), (b[0], y, b[1])), col, pat, nrm=(0, ny, 0))


def crest_panel(K, root, c, size, frame_col, coll=None, n=(0, -1, 0)):
    """The chain crest square (hb_crest, TEXCOORD_0 = [0,1]^2 upright) inside a moulded frame; its own node crest_panel."""
    t, n, up = frame3(n)
    c = Vector(c)
    fw = size * 0.09
    for (dx, dz, w, h) in ((0, -(size / 2 + fw / 2), size + 2 * fw, fw), (0, size / 2 + fw / 2, size + 2 * fw, fw),
                           (-(size / 2 + fw / 2), 0, fw, size), (size / 2 + fw / 2, 0, fw, size)):
        obox(K.op, c + t * dx + up * dz + n * 0.12, t, n, w, 0.3, h, frame_col)
    obox(K.op, c - n * 0.05 + n * 0.05, t, n, size + 2 * fw + 0.3, 0.1, size + 2 * fw + 0.3, mul(frame_col, 0.8))
    mb = MB(900)
    g = c + n * 0.1
    pts = [g - t * size / 2 - up * size / 2, g + t * size / 2 - up * size / 2, g + t * size / 2 + up * size / 2, g - t * size / 2 + up * size / 2]
    mb.face([mb.vert(p) for p in pts], PAL['cream'], 0, uv=[(0, 0), (1, 0), (1, 1), (0, 1)], jitter=0.0)
    ob = to_object(mb, 'crest_panel', 'hb_crest', parent=root, coll=coll)
    ob['crest'] = 'TEXCOORD_0 = crest square [0,1]^2, upright, readable from the front; size_m=%.2f' % size
    return ob
