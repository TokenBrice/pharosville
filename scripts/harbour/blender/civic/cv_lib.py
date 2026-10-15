"""Harbour civic kit - palette + architectural primitives on top of the hull MB builder (style C contract).

Blender axes while building: x = right, y = BACK (away from the water), z = up; the plot centre is the origin and
the FRONT (water / camera side) faces -y. glTF export: +x right, +y up, +z front (Blender -y).

Materials (by name, swapped at runtime by src/harbour/world/materials.ts):
  hb_opaque    COLOR_0 rgb = albedo, a = pattern id / 16
  hb_window    COLOR_0 r = lit (0 dark room .. 1), g = warmth, b = window kind (0 framed: the shader draws frame +
               mullion; 1 plain: a deep-set opening, no drawn frame); one connected piece = one pane
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
    'hull_red': '#8E2F24', 'hull_black': '#1E2327', 'antifoul': '#7B2E25', 'deck': '#C4A272', 'cone': '#1A1D20', 'flag_green': '#2F8A45',
}
# "Ptolemaic harbour" palette (classical-town PLAN §3.1); mirrored in island/nl_common.py HEX. The older keys above stay
# until the P2-P4 rebuilds stop using them.
CLASSICAL = {
    # stone: limestone keeps `stone` / `stone_light`; marble (`marble`) for orders and trim; sandstone ashlar base course
    'sandstone': '#C9B48E', 'lime': '#E4DAC4', 'lime_dark': '#B4A68C',
    # wall washes (C): one per few lots, never adjacent twins
    'wash_white': '#F2EEE4', 'wash_cream': '#EADCC0', 'wash_ochre': '#E0B070', 'wash_sienna': '#CC8C62',
    'wash_rose': '#DCAE98', 'wash_blue': '#C3D3DC',
    # terracotta roof, three desaturated tints + ridge / hip caps
    'tile_a': '#9A6A58', 'tile_b': '#8A6A60', 'tile_c': '#A97B66', 'tile_ridge': '#6A4D42',
    # Greek polychromy, thin bands only
    'poly_red': '#9E3B2C', 'poly_blue': '#2E5A8A', 'poly_ochre': '#C9973C', 'poly_black': '#2C2622',
    # metal (bronze / bronze_light / gilt / gold above), timber (oak_dark oiled oak; timber_grey sheds), cloth
    'bronze_dark': '#6E4824', 'oak_dark': '#4A3324', 'linen': '#EFE6D2',
    # painted board shutters and doors
    'shutter_blue': '#2F6F9A', 'shutter_green': '#4C7A52', 'shutter_teal': '#2F8582', 'shutter_ox': '#7E2F24',
    # pottery and garden greens (pergola canopies, pots)
    'clay': '#C69B74', 'terracotta': '#B9663C', 'vine': '#5E7F35', 'vine_light': '#7A9845',
    'bougain': '#C2306E', 'bougain_light': '#DA4F8C', 'olive_leaf': '#6E7D43', 'olive_dark': '#4F5E33',
}
HEX.update(CLASSICAL)
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
WIN_FRAMED, WIN_PLAIN = 0.0, 1.0    # hb_window COLOR_0.b


def window(K, c, n, w, h, frame=None, arch=False, sill=True, lit=None, warm=None, shutters=None, depth=0.08, mullion=False,
           head=None, kind=WIN_FRAMED):
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
    poly(K.win, pts, (lit, warm, kind), 0, nrm=n, jitter=0.0)


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


# =================================================================== "Ptolemaic harbour" kit (classical-town PLAN §3.2)
# Low terracotta roofs with ridge caps and antefixes, painted bands, orders with entablatures, deep-set plain openings
# with board shutters, velaria on free poles, roof terraces with pergolas, exedra, tholos. Harvested from the concept
# boards agents/2026-10-15-classical-town/{A-alexandria,C-vernacular}/frames.py. Fronts face -y unless n is given.
def _span(a, b):
    """(a, unit tangent, length) of the horizontal segment a -> b (z dropped)."""
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    L = (b - a).length
    return a, (b - a) / L, L


def rise_for(span, pitch):
    """Roof rise for a half-span at a pitch in degrees (the kit keeps 18-24 deg; nothing over 30)."""
    return span * math.tan(math.radians(pitch))


def ridge_cap(mb, p, q, col=None):
    """Rounded-tile ridge / hip cap along p -> q."""
    beam(mb, p, q, 0.34, 0.24, col or PAL['tile_ridge'], PT['tiles'])


def antefix_row(mb, a, b, n_out, step=1.15, col=None, h=0.48, w=0.4):
    """Palmette antefixes standing along an eave a -> b (3D points on the eave line), faces toward n_out."""
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    t = (b - a) / L
    n = max(1, round(L / step))
    for i in range(n + 1):
        antefix(mb, a + t * (L * i / n), t, n_out, col, h, w)


def antefix(mb, p, t, n_out, col=None, h=0.48, w=0.4):
    """One palmette antefix standing on the eave point p, its face across t toward n_out."""
    p, t, up = Vector(p), Vector(t), Vector((0, 0, 1))
    poly(mb, (p - t * w / 2, p + t * w / 2, p + t * w / 4 + up * h * 0.6, p + up * h, p - t * w / 4 + up * h * 0.6),
         col or PAL['tile_c'], 0, nrm=n_out, jitter=0.0)


def eave_x(y0, y1, z, rise, ov):
    """Front / back eave lines (y, z) of gable_roof(axis='x') / tiled_gable(axis='x')."""
    drop = ov * rise / ((y1 - y0) / 2)
    return (y0 - ov, z - drop), (y1 + ov, z - drop)


def tiled_gable(mb, x0, y0, x1, y1, z, pitch=21.0, col=None, axis='x', ov=0.45, end_col=None, end_pat=PT['render'],
                ends=True, antefix='front', ridge=True):
    """Low terracotta gable: tiles, ridge cap, antefixes ('front' = the -y eave, 'both', None; axis 'y' puts them on
    both side eaves). Returns the rise."""
    col = col or PAL['tile_a']
    half = ((y1 - y0) if axis == 'x' else (x1 - x0)) / 2
    rise = rise_for(half, pitch)
    gable_roof(mb, x0, y0, x1, y1, z, rise, col, PT['tiles'], ov=ov, end_col=end_col, end_pat=end_pat, axis=axis, ends=ends,
               th=0.22, fascia=PAL['tile_ridge'])
    drop = ov * rise / half
    if axis == 'x':
        ym = (y0 + y1) / 2
        if ridge:
            ridge_cap(mb, (x0 - ov, ym, z + rise + 0.04), (x1 + ov, ym, z + rise + 0.04))
        eaves = [((x0 - ov + 0.2, y0 - ov, z - drop), (x1 + ov - 0.2, y0 - ov, z - drop), (0, -1, 0))]
        if antefix == 'both':
            eaves.append(((x0 - ov + 0.2, y1 + ov, z - drop), (x1 + ov - 0.2, y1 + ov, z - drop), (0, 1, 0)))
    else:
        xm = (x0 + x1) / 2
        if ridge:
            ridge_cap(mb, (xm, y0 - ov, z + rise + 0.04), (xm, y1 + ov, z + rise + 0.04))
        eaves = [((x0 - ov, y0 - ov + 0.2, z - drop), (x0 - ov, y1 + ov - 0.2, z - drop), (-1, 0, 0)),
                 ((x1 + ov, y0 - ov + 0.2, z - drop), (x1 + ov, y1 + ov - 0.2, z - drop), (1, 0, 0))]
    if antefix:
        for a, b, n in eaves:
            antefix_row(mb, a, b, n)
    return rise


def tiled_hip(mb, x0, y0, x1, y1, z, pitch=22.0, col=None, ov=0.45, antefix='front'):
    """Low terracotta hip roof with ridge + hip caps; antefixes on the -y eave ('front'), all four ('all') or none.
    Returns the rise."""
    col = col or PAL['tile_a']
    rise = rise_for(min(x1 - x0, y1 - y0) / 2, pitch)
    hip_roof(mb, x0, y0, x1, y1, z, rise, col, PT['tiles'], ov=ov, th=0.22, fascia=PAL['tile_ridge'])
    X0, Y0, X1, Y1 = x0 - ov, y0 - ov, x1 + ov, y1 + ov
    w, d = X1 - X0, Y1 - Y0
    zo = z - ov * rise / (min(w, d) / 2)
    zr = z + rise + 0.04
    if w >= d:
        a, b = Vector((X0 + d / 2, (Y0 + Y1) / 2, zr)), Vector((X1 - d / 2, (Y0 + Y1) / 2, zr))
    else:
        a, b = Vector(((X0 + X1) / 2, Y0 + w / 2, zr)), Vector(((X0 + X1) / 2, Y1 - w / 2, zr))
    if (a - b).length > 0.1:
        ridge_cap(mb, a, b)
    for cx, cy in ((X0, Y0), (X0, Y1), (X1, Y0), (X1, Y1)):
        e = (a if cx == X0 else b) if w >= d else (a if cy == Y0 else b)
        ridge_cap(mb, (cx, cy, zo + 0.05), e)
    if antefix:
        sides = [((X0 + 0.5, Y0, zo), (X1 - 0.5, Y0, zo), (0, -1, 0))]
        if antefix == 'all':
            sides += [((X0 + 0.5, Y1, zo), (X1 - 0.5, Y1, zo), (0, 1, 0)), ((X0, Y0 + 0.5, zo), (X0, Y1 - 0.5, zo), (-1, 0, 0)),
                      ((X1, Y0 + 0.5, zo), (X1, Y1 - 0.5, zo), (1, 0, 0))]
        for p, q, n in sides:
            antefix_row(mb, p, q, n)
    return rise


def lean_to(mb, x0, x1, yf, zf, yb, zb, col=None, ov=0.45, th=0.22, antefix=True):
    """Single-pitch stoa roof from the front eave (yf, zf) up to (yb, zb) against a wall. Returns the eave (y, z)."""
    col = col or PAL['tile_a']
    s = (zb - zf) / (yb - yf)
    y0, z0 = yf - ov, zf - ov * s
    poly(mb, ((x0 - ov, y0, z0), (x1 + ov, y0, z0), (x1 + ov, yb, zb), (x0 - ov, yb, zb)), col, PT['tiles'], nrm=(0, -1, 1))
    poly(mb, ((x0 - ov, y0, z0 - th), (x1 + ov, y0, z0 - th), (x1 + ov, y0, z0), (x0 - ov, y0, z0)), PAL['tile_ridge'], 0, nrm=(0, -1, 0))
    for xe, s_ in ((x0 - ov, -1), (x1 + ov, 1)):
        poly(mb, ((xe, y0, z0 - th), (xe, y0, z0), (xe, yb, zb), (xe, yb, zb - th)), PAL['tile_ridge'], 0, nrm=(s_, 0, 0))
    if antefix:
        antefix_row(mb, (x0 - ov + 0.2, y0, z0), (x1 + ov - 0.2, y0, z0), (0, -1, 0))
    return y0, z0


# ------------------------------------------------------------------ painted bands + orders
def meander(mb, a, b, z, h, n_out, ground=None, key=None, unit=0.9):
    """Painted key-pattern (meander) band on a wall face a -> b, bottom at z, height h, just proud of the wall."""
    a, t, L = _span(a, b)
    a.z = z
    n = Vector(n_out).normalized()
    up = Vector((0, 0, 1))
    b = a + t * L
    g, k = ground or PAL['poly_red'], key or PAL['poly_ochre']
    o = n * 0.05
    poly(mb, (a + o, b + o, b + o + up * h, a + o + up * h), g, 0, nrm=n, jitter=0.0)
    for zz in (0.0, h - 0.1):   # black fillets
        poly(mb, (a + o * 1.4 + up * zz, b + o * 1.4 + up * zz, b + o * 1.4 + up * (zz + 0.1), a + o * 1.4 + up * (zz + 0.1)),
             PAL['poly_black'], 0, nrm=n, jitter=0.0)
    m = int(L / unit)
    q = n * 0.08
    bw = 0.11
    for i in range(m):          # one fret per unit: a stem + a hooked bar alternating top / bottom
        x = a + t * ((L - m * unit) / 2 + i * unit + unit * 0.2)
        poly(mb, (x + q + up * h * 0.2, x + q + t * bw + up * h * 0.2, x + q + t * bw + up * h * 0.8, x + q + up * h * 0.8), k, 0,
             nrm=n, jitter=0.0)
        zb = h * (0.69 if i % 2 == 0 else 0.2)
        poly(mb, (x + q + up * zb, x + q + t * unit * 0.6 + up * zb, x + q + t * unit * 0.6 + up * (zb + bw), x + q + up * (zb + bw)),
             k, 0, nrm=n, jitter=0.0)


def triglyph_band(mb, a, b, z, h, n_out, step=1.3, tg=None, mt=None):
    """Doric frieze on a wall face a -> b: triglyphs (blue) proud of the metopes (red)."""
    a, t, L = _span(a, b)
    n = Vector(n_out).normalized()
    up = Vector((0, 0, 1))
    a.z = z
    poly(mb, (a + n * 0.02, a + t * L + n * 0.02, a + t * L + n * 0.02 + up * h, a + n * 0.02 + up * h), mt or PAL['poly_red'], 0,
         nrm=n, jitter=0.0)
    k = max(2, round(L / step))
    for i in range(k + 1):
        obox(mb, a + t * (L * i / k) + n * 0.07 + up * (h / 2), t, n, 0.52, 0.14, h, tg or PAL['poly_blue'], 0, skip=('-y', '-z', '+z'),
             jitter=0.0)


def frieze(mb, a, b, z, h, n_out, kind='meander', **kw):
    """The painted band under the eaves: kind 'meander' (key pattern; houses, civic walls) or 'triglyph' (Doric)."""
    (meander if kind == 'meander' else triglyph_band)(mb, a, b, z, h, n_out, **kw)


def entablature(mb, x0, x1, yf, yb, z, col=None, cornice=None, kind='triglyph'):
    """Architrave + painted frieze + projecting cornice over a colonnade front at yf (facing -y). Returns the top z."""
    col = col or PAL['lime']
    box2(mb, x0, yf, z, x1, yb, z + 0.75, col, 0)
    box2(mb, x0, yf + 0.1, z + 0.75, x1, yb, z + 1.55, col, 0, skip=('-z',))
    frieze(mb, (x0 + 0.3, yf + 0.1), (x1 - 0.3, yf + 0.1), z + 0.75, 0.8, (0, -1, 0), kind)
    box2(mb, x0 - 0.35, yf - 0.35, z + 1.55, x1 + 0.35, yb, z + 1.9, cornice or PAL['marble'], 0)
    return z + 1.9


def ionic_colonnade(mb, x0, x1, y, z0, h, n, r, col=None, cap_col=None, segs=8):
    """Ionic columns (the senior order): a moulded base, a slender shaft and a cushion capital whose volutes are short
    cylinders along y either side of the abacus, so the scrolls read from the front. Returns the x positions."""
    col, cap_col = col or PAL['marble'], cap_col or PAL['lime']
    xs = [x0 + (x1 - x0) * i / (n - 1) for i in range(n)]
    for x in xs:
        cyl(mb, (x, y), r * 1.35, r * 1.35, z0, z0 + r * 0.45, col, 0, segs)
        cyl(mb, (x, y), r * 1.15, r * 1.0, z0 + r * 0.45, z0 + r * 0.8, col, 0, segs, top=False)
        cyl(mb, (x, y), r, r * 0.88, z0 + r * 0.8, z0 + h - r * 0.75, col, 0, segs, top=False, smooth=True, rot=math.pi / segs)
        cyl(mb, (x, y), r * 0.92, r * 1.1, z0 + h - r * 0.75, z0 + h - r * 0.4, cap_col, 0, segs, top=False)
        box2(mb, x - r * 1.25, y - r * 0.95, z0 + h - r * 0.4, x + r * 1.25, y + r * 0.95, z0 + h - r * 0.05, cap_col, 0)
        for s in (-1, 1):
            disc(mb, (x + s * r * 1.12, y + r * 0.95, z0 + h - r * 0.42), (0, -1, 0), r * 0.42, r * 1.9, cap_col, 8)
        box2(mb, x - r * 1.3, y - r * 1.3, z0 + h - r * 0.05, x + r * 1.3, y + r * 1.3, z0 + h, cap_col, 0)
    return xs


def socle(mb, x0, y0, x1, y1, z, h=0.9, col=None, proud=0.12):
    """Sandstone ashlar base course round a block."""
    box2(mb, x0 - proud, y0 - proud, z, x1 + proud, y1 + proud, z + h, col or PAL['sandstone'], PT['ashlar'], skip=('-z',))


# ------------------------------------------------------------------ openings
def lit_opening(K, pts, n, lit=None, warm=None, kind=WIN_PLAIN):
    """One hb_window piece through pts (a pane, a shop mouth, a fanlight): COLOR_0 = (lit, warm, kind)."""
    if lit is None:
        lit = K.rng.uniform(0.55, 1.0) if K.rng.random() < K.lit_p else 0.0
    if warm is None:
        warm = K.rng.uniform(0.0, 0.6)
    poly(K.win, pts, (lit, warm, kind), 0, nrm=n, jitter=0.0)


def shutters(mb, c, n, w, h, col=None, closed=False, gap=0.12):
    """Painted board shutters for an opening of w x h centred at c (wall surface) facing n: folded open flat against
    the wall either side, or closed across the opening."""
    t, n, up = frame3(n)
    c = Vector(c)
    col = col or PAL['shutter_blue']
    for s in (-1, 1):
        off = t * s * (w / 4 if closed else w / 2 + gap + w / 4)
        obox(mb, c + n * (0.33 if closed else 0.06) + off, t, n, w / 2 - 0.03, 0.07, h + 0.08, col, PT['boards'], skip=('-y',))


def plain_window(K, c, n, w=0.8, h=1.1, wall=None, arch=False, shutter=None, closed=False, sill=True, reveal=0.28, lit=None,
                 warm=None):
    """Small deep-set opening: reveals in the wall colour (no white trim, no mullion), a stone sill, optional board
    shutters; the pane is kind WIN_PLAIN so the runtime draws no frame or cross."""
    wall = wall or PAL['wash_cream']
    window(K, c, n, w, h, frame=mul(wall, 0.84), arch=arch, sill=sill, lit=lit, warm=warm, depth=reveal, kind=WIN_PLAIN)
    if shutter is not None:
        shutters(K.op, Vector(c) + frame3(n)[1] * (reveal - 0.05 if not closed else 0.0), n, w + 0.1, h, shutter, closed)


def arch_door(K, c, n, w, h, col=None, frame=None, step=True, fanlight=False):
    """Round-headed painted door in a stone surround (jambs, voussoir ring, keystone); h = springing + w/2."""
    t, n, up = frame3(n)
    c = Vector(c)
    op = K.op
    col = col or PAL['shutter_blue']
    frame = frame or PAL['lime']
    hs = h - w / 2
    g = c + n * 0.06
    poly(op, [g - t * w / 2, g + t * w / 2, g + t * w / 2 + up * hs, g - t * w / 2 + up * hs], col, PT['boards'], nrm=n)
    head = [g + up * hs + t * (w / 2 * math.cos(math.pi * k / 6)) + up * (w / 2 * math.sin(math.pi * k / 6)) for k in range(7)]
    if fanlight:
        lit_opening(K, [p + n * 0.02 for p in head], n)
    else:
        poly(op, head, col, PT['boards'], nrm=n)
    fw = 0.32
    for s in (-1, 1):
        obox(op, c + n * 0.1 + t * s * (w / 2 + fw / 2) + up * (hs / 2), t, n, fw, 0.2, hs, frame, skip=('-y',))
    R = w / 2 + fw / 2
    pts = [c + n * 0.1 + up * hs + t * (R * math.cos(math.pi * k / 6)) + up * (R * math.sin(math.pi * k / 6)) for k in range(7)]
    for a, b in zip(pts[:-1], pts[1:]):
        beam(op, a, b, 0.2, fw, frame, up=n)
    obox(op, c + n * 0.14 + up * (hs + R + 0.05), t, n, 0.36, 0.26, 0.5, frame, skip=('-y',))   # keystone
    if step:
        obox(op, c + n * 0.4 + up * 0.08, t, n, w + 0.9, 0.8, 0.16, PAL['lime'], PT['ashlar'])


# ------------------------------------------------------------------ cloth
def velarium(K, a, b, depth, z_in, z_out=None, n_out=None, ground=0.0, panels=6, sag=0.3, scallop=0.55, poles=True,
             pole_col=None):
    """Cloth canopy (hb_cover, striped shade; the runtime tints it with the chain colour) on four free-standing poles:
    the inner edge runs a -> b at z_in, the outer edge `depth` out along n_out (default: the -y side when a -> b runs +x)
    at z_out, sagging in the middle, with a scalloped valance. Keep it off the facade and split it around the central bay
    (PLAN §3.2)."""
    a, t, L = _span(a, b)
    n = Vector(n_out).normalized() if n_out is not None else Vector((t.y, -t.x, 0))
    z_out = z_in - 0.4 if z_out is None else z_out
    up = Vector((0, 0, 1))
    for k in range(panels):
        p0, p1 = a + t * (L * k / panels), a + t * (L * (k + 1) / panels)
        sh = (1.0, 1.0, 1.0) if k % 2 == 0 else (0.72, 0.72, 0.72)
        zm = (z_in + z_out) / 2 - sag
        I0, I1 = p0 + up * z_in, p1 + up * z_in
        M0, M1 = p0 + n * depth / 2 + up * zm, p1 + n * depth / 2 + up * zm
        O0, O1 = p0 + n * depth + up * z_out, p1 + n * depth + up * z_out
        poly(K.cover, (I0, I1, M1, M0), sh, 0, nrm=up + n * 0.3, jitter=0.0)
        poly(K.cover, (M0, M1, O1, O0), sh, 0, nrm=up + n * 0.2, jitter=0.0)
        poly(K.cover, (O0, O1, (O0 + O1) / 2 - up * scallop), mul(sh, 0.9), 0, nrm=n, jitter=0.0)
    if poles:
        for p in (a, a + t * L):
            for q, z in ((p, z_in), (p + n * depth, z_out)):
                cyl(K.op, (q.x, q.y), 0.11, 0.08, ground, z + 0.6, pole_col or PAL['oak_dark'], PT['boards'], 6)
                sphere(K.op, (q.x, q.y, z + 0.7), 0.16, PAL['bronze_light'], 6, 3)


# ------------------------------------------------------------------ roofs you stand on
def parapet(mb, x0, y0, x1, y1, z, h, th, col, pat=PT['render']):
    for (a0, b0, a1, b1) in ((x0, y0, x1, y0 + th), (x0, y1 - th, x1, y1), (x0, y0 + th, x0 + th, y1 - th), (x1 - th, y0 + th, x1, y1 - th)):
        box2(mb, a0, b0, z, a1, b1, z + h, col, pat, skip=('-z',))


LEAF_EVERGREEN = 14    # leaf pattern id the seasonal shader never strips (olive, cypress, pine, maquis); PT['leaf'] = 8 is deciduous


def foliage(mb, rng, c, r, cols, n=3, squash=0.7, pat=PT['leaf']):
    """A clump of faceted leaf blobs (vine, bougainvillea, pot shrubs); pat = PT['leaf'] (deciduous) or LEAF_EVERGREEN."""
    c = Vector(c)
    for k in range(n):
        o = Vector((rng.uniform(-r, r), rng.uniform(-r, r) * 0.6, rng.uniform(-r, r) * 0.3)) * 0.6
        rr = r * rng.uniform(0.55, 0.9)
        prof = ([(0.0, c.z + o.z - rr * squash)] + [(rr * math.sin(math.pi * i / 3), c.z + o.z - rr * squash * math.cos(math.pi * i / 3))
                                                      for i in (1, 2)] + [(0.0, c.z + o.z + rr * squash)])
        lathe(mb, (c.x + o.x, c.y + o.y), prof, rng.choice(cols), pat, 6, smooth=False, cap=False, rot=rng.uniform(0, 1))


# canopy -> (palette keys, leaf pattern): vines are deciduous (the autumn band), bougainvillea and olive evergreen
CANOPY = {'vine': (('vine', 'vine_light', 'olive_leaf'), PT['leaf']), 'bougain': (('bougain', 'bougain_light', 'vine'), LEAF_EVERGREEN),
          'olive': (('olive_leaf', 'olive_dark'), LEAF_EVERGREEN)}


def pergola(mb, x0, y0, x1, y1, z, h=2.4, post=None, rng=None, canopy='vine', rafters=6, clumps=3):
    """Pergola: four piers, two beams along x, rafters along y, and vine / bougainvillea clumps on top."""
    rng = rng or random.Random(0)
    post = post or PAL['oak_dark']
    for x, y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        box2(mb, x - 0.16, y - 0.16, z, x + 0.16, y + 0.16, z + h, post, PT['boards'] if post == PAL['oak_dark'] else PT['render'], skip=('-z',))
    for y in (y0, y1):
        box2(mb, x0 - 0.35, y - 0.11, z + h, x1 + 0.35, y + 0.11, z + h + 0.22, PAL['oak_dark'], 0)
    for k in range(rafters):
        x = x0 + (x1 - x0) * k / (rafters - 1)
        box2(mb, x - 0.06, y0 - 0.45, z + h + 0.22, x + 0.06, y1 + 0.45, z + h + 0.36, PAL['timber'], 0)
    if canopy:
        keys, pat = CANOPY[canopy]
        cols = [PAL[k] for k in keys]
        for k in range(clumps):
            u = (k + 0.5) / clumps
            foliage(mb, rng, (x0 + (x1 - x0) * u + rng.uniform(-0.4, 0.4), y0 + (y1 - y0) * rng.uniform(0.3, 0.7), z + h + 0.55),
                    min(1.3, (x1 - x0) / clumps * 0.7), cols, 3, 0.45, pat)


def roof_terrace(mb, x0, y0, x1, y1, z, wall=None, parapet_h=0.8, th=0.3, floor=None, cornice=None, pergola_canopy=None, rng=None):
    """Flat roof terrace over the block (x0..x1, y0..y1) whose walls stop at z: a cornice band, a parapet in the wall
    colour and a tile floor; an optional pergola ('vine' / 'bougain' / 'bare') over the back half. Returns the floor z."""
    wall = wall or PAL['wash_white']
    box2(mb, x0 - 0.15, y0 - 0.15, z, x1 + 0.15, y1 + 0.15, z + 0.22, cornice or PAL['lime'], 0, skip=('-z',))
    parapet(mb, x0, y0, x1, y1, z + 0.22, parapet_h, th, wall)
    zf = z + 0.24
    poly(mb, ((x0 + th, y0 + th, zf), (x1 - th, y0 + th, zf), (x1 - th, y1 - th, zf), (x0 + th, y1 - th, zf)), floor or PAL['tile_c'],
         PT['cobble'], nrm=(0, 0, 1))
    if pergola_canopy:
        ym = (y0 + y1) / 2
        pergola(mb, x0 + th + 0.5, ym, x1 - th - 0.5, y1 - th - 0.4, zf, 2.3, rng=rng,
                canopy=None if pergola_canopy == 'bare' else pergola_canopy, rafters=max(4, int((x1 - x0) / 1.1)))
    return zf


def outside_stair(mb, x, y0, z0, z1, steps=8, run=0.52, width=1.3, side=-1, col=None, landing=1.6):
    """External stair climbing +y along a wall whose face is at x (the stair stands on the `side` of it), with a
    landing and a solid parapet. Returns the landing centre (door position on the wall)."""
    col = col or PAL['wash_white']
    xa, xb = (x - width, x) if side < 0 else (x, x + width)
    stairs(mb, xa, xb, y0, z0, z1, steps, run, col, PT['ashlar'], ny=-1)
    ytop = y0 + steps * run
    box2(mb, xa, ytop, z0, xb, ytop + landing, z1, col, PT['render'], skip=('-z',))
    xo = xa + 0.05 if side < 0 else xb - 0.05
    beam(mb, (xo, y0, z0 + 0.6), (xo, ytop, z1 + 0.6), 0.2, 0.5, col)
    box2(mb, xo - 0.15, ytop, z1, xo + 0.15, ytop + landing, z1 + 0.8, col, PT['render'])
    return Vector((x, ytop + landing / 2, z1))


def flue(mb, x, y, z, h=1.3, col=None, cap=None):
    """Short kitchen flue with a little tiled cowl (the classical house's `chimney_top`). Returns the smoke point."""
    col = col or PAL['wash_white']
    box2(mb, x - 0.4, y - 0.4, z - 0.5, x + 0.4, y + 0.4, z + h, col, PT['render'], skip=('-z',))
    for s in (-1, 1):   # smoke holes under the cowl: two dark slots
        poly(mb, ((x - 0.25, y + s * 0.41, z + h - 0.45), (x + 0.25, y + s * 0.41, z + h - 0.45), (x + 0.25, y + s * 0.41, z + h - 0.1),
                  (x - 0.25, y + s * 0.41, z + h - 0.1)), PAL['soot'], 0, nrm=(0, s, 0), jitter=0.0)
    gable_roof(mb, x - 0.4, y - 0.4, x + 0.4, y + 0.4, z + h + 0.05, 0.3, cap or PAL['tile_a'], PT['tiles'], ov=0.15, ends=False, th=0.1)
    return Vector((x, y, z + h + 0.4))


# ------------------------------------------------------------------ round buildings
def _ring(c, r, z, segs, a0=0.0, a1=2 * math.pi, closed=True):
    k = segs if closed else segs + 1
    return [Vector((c[0] + r * math.cos(a0 + (a1 - a0) * i / segs), c[1] + r * math.sin(a0 + (a1 - a0) * i / segs), z)) for i in range(k)]


def _band(mb, c, r0, r1, z0, z1, col, segs, a0, a1, closed, pat=0, outer=True, inner=False, top=True):
    """Curved slab between radii r0 < r1 from z0 to z1 over the arc a0 -> a1."""
    O0, O1 = _ring(c, r1, z0, segs, a0, a1, closed), _ring(c, r1, z1, segs, a0, a1, closed)
    I0, I1 = _ring(c, r0, z0, segs, a0, a1, closed), _ring(c, r0, z1, segs, a0, a1, closed)
    cc = Vector((c[0], c[1], 0))
    for i in range(segs):
        j = (i + 1) % len(O0)
        mid = (O0[i] + O0[j]) / 2 - cc
        mid.z = 0
        if outer:
            poly(mb, (O0[i], O0[j], O1[j], O1[i]), col, pat, nrm=mid)
        if inner:
            poly(mb, (I0[i], I0[j], I1[j], I1[i]), col, pat, nrm=-mid)
        if top:
            poly(mb, (I1[i], O1[j], O1[i]) if r0 < 1e-4 else (I1[i], I1[j], O1[j], O1[i]), col, pat, nrm=(0, 0, 1))
    if not closed:
        for P0, P1, Q0, Q1, s in ((O0[0], O1[0], I0[0], I1[0], 0), (O0[-1], O1[-1], I0[-1], I1[-1], 1)):
            d = (P0 - Q0).cross(Vector((0, 0, 1)))
            poly(mb, (P0, P1, Q1, Q0), col, pat, nrm=-d if s else d)


def exedra(mb, c, r, z0, h=4.2, n=7, facing=-math.pi / 2, span=math.pi, col=None, cap_col=None, wall=None, roof=None,
           podium=0.9, bench=True):
    """Semicircular colonnade (the Museum's star terrace): a podium with steps on the open side, n columns on the arc,
    a curved entablature, a curved back wall, a lean-to tile roof between them and a stone bench round the inside.
    The open side faces `facing` (radians, -pi/2 = -y). Returns the top z of the entablature."""
    col, cap_col, wall, roof = col or PAL['marble'], cap_col or PAL['lime'], wall or PAL['wash_cream'], roof or PAL['tile_a']
    segs = max(6, 2 * (n - 1))
    a0, a1 = facing + math.pi - span / 2, facing + math.pi + span / 2
    rw = r + 1.6
    zp = z0 + podium
    # podium: the arc slab, two steps down on the open side
    _band(mb, c, 0.0, rw + 0.6, z0 - 1.0, zp, PAL['lime'], segs, a0, a1, False, PT['ashlar'])
    f = Vector((math.cos(facing), math.sin(facing), 0))
    tt = Vector((-f.y, f.x, 0))
    cc = Vector((c[0], c[1], 0))
    for d, hh in ((0.25, podium * 2 / 3), (0.75, podium / 3)):
        obox(mb, cc + f * d + Vector((0, 0, z0 - 1.0 + (hh + 1.0) / 2)), tt, f, 2 * (rw + 0.6), 0.5, hh + 1.0, PAL['lime'], PT['ashlar'],
             skip=('-z',))
    # back wall (painted inside), columns, curved entablature, lean-to roof
    zi, zo = zp + h + 1.35, zp + h + 1.35 + 1.0
    _band(mb, c, rw, rw + 0.5, zp, zo - 0.02, wall, segs, a0, a1, False, PT['render'], inner=True)
    for i in range(n):
        a = a0 + (a1 - a0) * i / (n - 1)
        column(mb, c[0] + r * math.cos(a), c[1] + r * math.sin(a), zp, h, 0.38, col, 8, cap_col)
    _band(mb, c, r - 0.5, r + 0.5, zp + h, zp + h + 0.6, cap_col, segs, a0, a1, False, inner=True)
    _band(mb, c, r - 0.52, r + 0.52, zp + h + 0.6, zp + h + 1.1, PAL['poly_red'], segs, a0, a1, False, inner=True, top=False)
    _band(mb, c, r - 0.7, r + 0.7, zp + h + 1.1, zp + h + 1.35, PAL['marble'], segs, a0, a1, False, inner=True)
    ri, ro = r - 0.9, rw + 0.7
    I, O = _ring(c, ri, zi, segs, a0, a1, False), _ring(c, ro, zo + 0.1, segs, a0, a1, False)
    for i in range(segs):
        poly(mb, (I[i], I[i + 1], O[i + 1], O[i]), roof, PT['tiles'], nrm=(0, 0, 1))
    for k, s_ in ((0, 1), (segs, -1)):   # close the roof ends over the end columns
        a = a0 if k == 0 else a1
        tn = Vector((math.sin(a), -math.cos(a), 0)) * s_
        Ie, Oe = _ring(c, ri, zi - 0.6, segs, a0, a1, False)[k], _ring(c, ro, zi - 0.6, segs, a0, a1, False)[k]
        poly(mb, (Ie, Oe, O[k], I[k]), wall, PT['render'], nrm=tn)
    for i in range(segs + 1):     # antefixes on the inner eave, facing the centre
        a = a0 + (a1 - a0) * i / segs
        antefix(mb, I[i], (-math.sin(a), math.cos(a), 0), (-math.cos(a), -math.sin(a), 0), h=0.5)
    if bench:
        _band(mb, c, rw - 0.7, rw, zp, zp + 0.5, PAL['lime'], segs, a0, a1, False, PT['ashlar'], outer=False, inner=True)
    return zp + h + 1.35


def tholos(mb, c, r, z0, h=4.0, n=8, col=None, cap_col=None, roof=None, cella=None, steps=2, finial=None):
    """Round temple: stepped round base, a ring of n columns, a ring entablature with a painted band, a low cone of
    tiles with a ridge ring and a bronze finial; `cella` = (radius, wall colour) for a closed core. Returns the apex z."""
    col, cap_col, roof = col or PAL['marble'], cap_col or PAL['lime'], roof or PAL['tile_a']
    segs = 2 * n
    z = z0
    for k in range(steps):
        cyl(mb, c, r + 1.0 + 0.5 * (steps - k), r + 1.0 + 0.5 * (steps - k), z, z + 0.4, PAL['lime'], PT['ashlar'], segs)
        z += 0.4
    if cella:
        cyl(mb, c, cella[0], cella[0], z, z + h, cella[1], PT['render'], segs, top=False)
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        column(mb, c[0] + r * math.cos(a), c[1] + r * math.sin(a), z, h, 0.36, col, 8, cap_col)
    zt = z + h
    cyl(mb, c, r + 0.55, r + 0.55, zt, zt + 0.6, cap_col, 0, segs, top=False)
    cyl(mb, c, r + 0.57, r + 0.57, zt + 0.6, zt + 1.1, PAL['poly_red'], 0, segs, top=False)
    cyl(mb, c, r + 0.8, r + 0.8, zt + 1.1, zt + 1.35, PAL['marble'], 0, segs, top=False)
    zr = zt + 1.35
    rise = rise_for(r + 0.8, 24.0)
    lathe(mb, c, [(r + 1.1, zr - 0.1), (r * 0.25, zr + rise * 0.8), (0.0, zr + rise)], roof, PT['tiles'], segs, smooth=False)
    cyl(mb, c, 0.32, 0.18, zr + rise - 0.1, zr + rise + 0.5, finial or PAL['bronze'], PT['metal'], 6)
    sphere(mb, (c[0], c[1], zr + rise + 0.75), 0.3, finial or PAL['bronze_light'], 6, 3)
    return zr + rise + 1.05


# ------------------------------------------------------------------ small things
def amphora(mb, c, s=1.0, col=None):
    c = Vector(c)
    lathe(mb, c, [(0.0, c.z), (0.12 * s, c.z + 0.05), (0.34 * s, c.z + 0.55 * s), (0.36 * s, c.z + 0.85 * s), (0.16 * s, c.z + 1.1 * s),
                  (0.1 * s, c.z + 1.35 * s), (0.14 * s, c.z + 1.42 * s)], col or PAL['terracotta'], 0, 6, smooth=True)


def pot_plant(mb, rng, c, canopy='vine'):
    c = Vector(c)
    cyl(mb, c, 0.32, 0.42, c.z, c.z + 0.6, PAL['terracotta'], 0, 6)
    keys, pat = CANOPY[canopy]
    foliage(mb, rng, (c.x, c.y, c.z + 1.0), 0.6, [PAL[k] for k in keys], 2, pat=pat)


def tripod_lamp(K, c, h=1.7):
    """Bronze tripod with an oil-lamp bowl (hb_emissive flame disc): the classical quay / portico lamp."""
    c = Vector(c)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        beam(K.op, c + Vector((0.45 * math.cos(a), 0.45 * math.sin(a), 0)), c + Vector((0, 0, h)), 0.08, 0.08, PAL['bronze'])
    lathe(K.op, c, [(0.1, c.z + h - 0.1), (0.5, c.z + h + 0.05), (0.55, c.z + h + 0.3)], PAL['bronze_light'], PT['metal'], 8, smooth=True,
          cap=False)
    cyl(K.em, c, 0.45, 0.45, c.z + h + 0.2, c.z + h + 0.25, (1.0, 0.6, 0.2), 0, 8)
