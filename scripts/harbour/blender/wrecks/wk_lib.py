"""Wreck Cove kit v2 - shared palette, weathering and wreck-carpentry primitives (style C crafted miniature).

Built on the hull kit's MB face builder (../hulls/hb_lib.py) and its Hull forms (../hulls/hb_hulls.py).
Blender frame: x = bow, y = port, z = up. Origin = the sand (or sea) surface under the wreck's middle:
z = 0 is where the runtime's ground is; anything below is buried (faces wholly under BURY are culled).
glTF export: +x bow, +y up, +z = Blender -y = the wreck's FRONT (seaward / camera side; the epitaph faces it).

Weathering is per CORNER colour (COLOR_0 is a corner attribute): sun bleach toward silvered timber, a salt
tide mark, a weed / kelp line where the sea or the sand meets the hull, damp sand at the contact - all from the
POSED position, so every pose gets its own waterline. Faces carry 'wk' (0 = no weathering .. 1 full).
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'hulls'))
import bpy
from mathutils import Vector, Matrix
import hb_lib
from hb_lib import MB, PT, lin, box, box2, rod, patch, empty, descendants, tri_count, reset_scene, basis, smoothstep
from hb_hulls import Hull, FORMS

HEX = {
    'bleach': '#B5AD9F', 'bleach_light': '#D2CCBE', 'drift': '#C4BBAA', 'drift_dark': '#8F8576', 'timber_wet': '#5E5244',
    'salt': '#E2DDD0', 'weed': '#4A5634', 'weed_dark': '#323C24', 'kelp': '#6E6A36', 'kelp_dark': '#3E3A1E',
    'rust': '#8C4A2A', 'rust_dark': '#5A3020', 'char': '#1E1B1A', 'char2': '#2D2826', 'ember': '#55301F', 'ash': '#5F5B57',
    'barnacle': '#DAD4C6', 'verdigris': '#5E9C88', 'copper': '#B5683C', 'copper_dark': '#7E4528',
    'sand': '#D3BF96', 'sand_dry': '#DCCBA6', 'sand_wet': '#9E8D6E', 'shingle': '#A49E90',
    'rock': '#857F78', 'rock_dark': '#5E5A55', 'rock_light': '#A8A29A', 'lichen': '#C2A85A', 'pool': '#24434E',
    'paint_black': '#2A2D30', 'paint_red': '#7E3A2E', 'paint_teal': '#3E6466', 'paint_blue': '#3A5874', 'paint_green': '#3E5E4C',
    'paint_white': '#D9D4C8', 'paint_ochre': '#B08A45', 'gilt_old': '#B8964A', 'window_dark': '#1A1A1C',
    'pennant_red': '#A4483A', 'pennant_blue': '#3F5F8A', 'pennant_ochre': '#C59A45', 'pennant_white': '#E6E0D2',
    'gull': '#EEEDE8', 'gull_grey': '#9AA0A6', 'beak': '#D9A13E', 'lamp_glass': '#F2C47A', 'hut_wall': '#9C9284',
    'roof_tar': '#33302D', 'roof_turf': '#6B7444', 'lifeboat_blue': '#2C4E7A', 'lifeboat_white': '#E8E4DA',
    'interior': '#2B2421', 'bronze': '#9A6430', 'timber_fresh': '#C9A271',
    'board': '#CDC4AE',     # epitaph nameboard ground (weathered cream; the runtime letters it dark)
}
PAL = dict(hb_lib.PAL)
PAL.update({k: lin(v) for k, v in HEX.items()})
BURY = -0.7          # faces wholly below this are culled (the runtime buries the keel ~0.2-0.5 m)


def mix(a, b, t):
    t = min(1.0, max(0.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def mul(a, k):
    return tuple(min(1.0, x * k) for x in a)


# ------------------------------------------------------------------ value noise (deterministic, pure python)
def _h(i, j, k, s):
    n = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791) ^ (s * 2654435761)
    n &= 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffff) / 65535.0


def vnoise(p, f=1.0, s=0):
    x, y, z = p[0] * f, p[1] * f, p[2] * f
    i, j, k = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - i, y - j, z - k
    ux, uy, uz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    acc = 0.0
    for di in (0, 1):
        for dj in (0, 1):
            for dk in (0, 1):
                w = (ux if di else 1 - ux) * (uy if dj else 1 - uy) * (uz if dk else 1 - uz)
                acc += w * _h(i + di, j + dj, k + dk, s)
    return acc


def fbm(p, f=1.0, s=0):
    return 0.62 * vnoise(p, f, s) + 0.38 * vnoise(p, f * 2.7, s + 11)


# ------------------------------------------------------------------ weathering (per corner, posed position)
def weather(base, p, n, k=1.0, seed=0, salt=True, wl0=0.62):
    if k <= 0:
        return base
    nz = fbm(p, 0.45, seed)
    up = max(0.0, n.z)
    c = mix(base, PAL['bleach'], k * min(0.6, 0.12 + 0.3 * nz + 0.22 * up))
    z = p.z
    if salt:   # salt tide mark: a pale band a little above the weed line
        tm = wl0 + 0.45 + 0.5 * (fbm(p, 0.3, seed + 5) - 0.5) * wl0
        c = mix(c, PAL['salt'], 0.5 * k * (1 - smoothstep(0.0, 0.2, abs(z - tm))))
    wl = wl0 + 0.8 * wl0 * (fbm(p, 0.9, seed + 3) - 0.5)
    w = smoothstep(wl, wl - 0.25 - 0.25 * wl0, z)
    weedc = PAL['weed'] if vnoise(p, 0.7, seed + 9) > 0.45 else PAL['kelp']
    c = mix(c, weedc, 0.88 * w * k)
    c = mix(c, PAL['weed_dark'], smoothstep(0.1, -0.3, z) * 0.55 * k)
    return c


def tag(mb, start, **kw):
    """Set keys on faces created since `start` (wk: weathering strength; uv_out: mark for UV = outside)."""
    for f in mb.f[start:]:
        f.update(kw)


def xform(mb, M, start_v=0):
    for i in range(start_v, len(mb.v)):
        mb.v[i] = M @ mb.v[i]
        mb.vf[i] = mb.v[i].copy()


def sub(fn, seed=0):
    """Build into a temp MB with fn(mb), return it (transform it, then mb.extend)."""
    t = MB(seed)
    fn(t)
    return t


def cull_compact(mb, zmin=BURY):
    """Drop faces wholly below zmin and the vertices nothing uses."""
    keep = [f for f in mb.f if max(mb.v[i].z for i in f['i']) > zmin]
    used = sorted({i for f in keep for i in f['i']})
    remap = {o: n for n, o in enumerate(used)}
    mb.v = [mb.v[i] for i in used]; mb.vf = [mb.vf[i] for i in used]
    for f in keep:
        f['i'] = [remap[i] for i in f['i']]
    mb.f = keep


def newell(pts):
    n = Vector()
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y)
    return n.normalized() if n.length > 1e-9 else Vector((0, 0, 1))


def finish(mb, name, mat, parent, seed=0, origin=(0, 0, 0), coll=None, props=None, uv=False, wl=0.62):
    """MB -> object; then per-corner weathered colours from the posed geometry; optional UV (outside = -4)."""
    if uv:
        for f in mb.f:
            if not f.get('uv_in'):
                f['uv'] = [(-4.0, -4.0)] * len(f['i'])
    ob = hb_lib.to_object(mb, name, mat, parent=parent, origin=origin, coll=coll, props=props)
    me = ob.data
    cbuf = [0.0] * (len(me.loops) * 4)
    for poly, f in zip(me.polygons, mb.f):
        pts = [mb.v[i] for i in f['i']]
        nrm = newell(pts)
        k = f.get('wk', 1.0)
        a = f['pat'] / 16.0
        for li, p in zip(poly.loop_indices, pts):
            c = weather(f['col'], p, nrm, k, seed, f.get('salt', True), wl) if k > 0 else f['col']
            cbuf[li * 4:li * 4 + 4] = (*c, a)
    me.color_attributes['Col'].data.foreach_set('color', cbuf)
    return ob


# ------------------------------------------------------------------ hull carpentry
def shell(mb, H, u0, u1, nu, nt, colf, hole=None, sides=(1, -1), t1=1.0, smooth=True, tumble=0.05, warp=None):
    """Planked skin between stations u0..u1 (u: -1 stern .. 1 bow), t: 0 keel .. t1 sheer.
    colf(u, t, side) -> (col, pat); hole(u, t, side) -> True drops the plank. Returns P(u, t, side)."""
    def P(u, t, sd):
        zk, zt = H.zk(u), H.zt(u)
        z = zk + t * (zt - zk)
        tt = min(1.0, max(0.0, t))
        s = (1 - (1 - tt) ** 2.4) * (1 - tumble * smoothstep(0.7, 1.0, tt)) * (1 - 0.35 * max(0.0, t - 1.0))
        p = Vector((H.x(u, min(z, zt)), sd * H.w(u) * s, z))
        return warp(p, u, t, sd) if warp else p
    for sd in sides:
        grid = [[mb.vert(P(u0 + (u1 - u0) * i / nu, t1 * j / nt, sd)) for j in range(nt + 1)] for i in range(nu + 1)]
        for i in range(nu):
            for j in range(nt):
                um = u0 + (u1 - u0) * (i + 0.5) / nu; tm = t1 * (j + 0.5) / nt
                if hole and hole(um, tm, sd):
                    continue
                col, pat = colf(um, tm, sd)
                q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
                if sd > 0:
                    q = q[::-1]
                mb.face(q, col, pat, smooth=smooth)
    return P


def inset(P, d):
    """P moved d toward the centreline (ribs sit inside the planking)."""
    def Q(u, t, sd):
        p = P(u, t, sd)
        return Vector((p.x, p.y - sd * d, p.z + d * 0.3))
    return Q


def rib(mb, P, u, sd, t0, t1, r, col, n=3, segs=3, wobble=0.0, rng=None):
    pts = [P(u, t0 + (t1 - t0) * k / n, sd) for k in range(n + 1)]
    if wobble and rng:
        pts[-1] = pts[-1] + Vector((rng.uniform(-1, 1) * wobble, 0, rng.uniform(-1, 0.3) * wobble))
    for a, b in zip(pts, pts[1:]):
        rod(mb, a, b, r, col, segs, smooth=False)
    return pts


def deck_strip(mb, H, P, u0, u1, n, col, hole=None, drop=0.0):
    """Deck planking just under the sheer, stations u0..u1."""
    rows = []
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        zd = H.zt(u) - max(H.bh, 0.12) - drop
        t = (zd - H.zk(u)) / max(1e-4, H.zt(u) - H.zk(u))
        a, b = P(u, t, 1), P(u, t, -1)
        rows.append((mb.vert(a), mb.vert(b)))
    for i in range(n):
        um = u0 + (u1 - u0) * (i + 0.5) / n
        if hole and hole(um):
            continue
        (a0, b0), (a1, b1) = rows[i], rows[i + 1]
        mb.face((b0, b1, a1, a0), col, PT['planks_y'])


def splinters(mb, p, axis, r, h, col, rng, n=4):
    """Jagged broken end: n thin spikes around a stump top."""
    u, w = basis(axis)
    axis = Vector(axis).normalized()
    for k in range(n):
        a = 2 * math.pi * (k + rng.uniform(-0.2, 0.2)) / n
        base = p + (math.cos(a) * u + math.sin(a) * w) * r * 0.55
        tip = base + axis * h * rng.uniform(0.4, 1.0) + (math.cos(a) * u + math.sin(a) * w) * r * 0.2
        o = [base + (math.cos(a + d) * u + math.sin(a + d) * w) * r * 0.45 for d in (-0.9, 0.9)]
        i0, i1, i2, it = mb.vert(o[0]), mb.vert(o[1]), mb.vert(base - axis * 0.05), mb.vert(tip)
        mb.face((i0, i1, it), col, PT['boards'])
        mb.face((i1, i2, it), col, PT['boards'])
        mb.face((i2, i0, it), col, PT['boards'])


def sag_line(mb, a, b, sag, r, col=None, n=3, floor=None):
    """Slack rope a->b with a parabolic sag (3-sided prism per segment). floor: clamp z (rope lying on sand)."""
    a, b = Vector(a), Vector(b)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = a.lerp(b, t) - Vector((0, 0, sag * 4 * t * (1 - t)))
        if floor is not None:
            p.z = max(p.z, floor)
        pts.append(p)
    for p, q in zip(pts, pts[1:]):
        rod(mb, p, q, r, col or PAL['tar'], 3, smooth=False)


def hang_line(mb, a, length, r, rng, col=None, lie=1.2):
    """Rope hanging from a and coiling onto the sand."""
    a = Vector(a)
    b = Vector((a.x + rng.uniform(-0.3, 0.3), a.y + rng.uniform(-0.3, 0.3), max(0.03, a.z - length)))
    rod(mb, a, b, r, col or PAL['rope'], 3, smooth=False)
    if b.z < 0.1:
        d = rng.uniform(0, 6.28)
        c = b + Vector((math.cos(d) * lie, math.sin(d) * lie, 0.0))
        rod(mb, b, c, r, col or PAL['rope'], 3, smooth=False)


def drift(mb, c, rx, ry, h, rot=0.0, nseg=10, skew=(0.0, 0.0), col=None, seed=0):
    """A sand drift: low elliptical dome (smooth), peak pushed by skew (piled against a hull), skirt under 0."""
    rng = random.Random(seed)
    c = Vector(c)
    R = Matrix.Rotation(rot, 3, 'Z')
    rings = [(1.0, -0.12), (0.7, 0.24), (0.38, 0.6)]
    idx = []
    for (f, zz) in rings:
        row = []
        for k in range(nseg):
            a = 2 * math.pi * k / nseg
            j = 1 + rng.uniform(-0.12, 0.12)
            p = Vector((math.cos(a) * rx * f * j + skew[0] * (1 - f), math.sin(a) * ry * f * j + skew[1] * (1 - f), zz * h))
            row.append(mb.vert(c + R @ p))
        idx.append(row)
    top = mb.vert(c + R @ Vector((skew[0], skew[1], h * 0.8)))
    cs = col or mix(PAL['sand'], PAL['sand_wet'], 0.45)
    s0 = len(mb.f)
    for r0, r1 in zip(idx, idx[1:]):
        for k in range(nseg):
            k2 = (k + 1) % nseg
            mb.face((r0[k], r0[k2], r1[k2], r1[k]), cs, 0, smooth=True, jitter=0.01)
    for k in range(nseg):
        mb.face((idx[-1][k], idx[-1][(k + 1) % nseg], top), cs, 0, smooth=True, jitter=0.01)
    tag(mb, s0, wk=0.0)


def barnacles(mb, pts_nrm, rng, r=0.09, col=None):
    """Tiny 3-sided cones on a surface: [(p, n), ...]."""
    for p, n in pts_nrm:
        n = Vector(n).normalized()
        u, w = basis(n)
        rr = r * rng.uniform(0.6, 1.3)
        base = [p + (math.cos(a) * u + math.sin(a) * w) * rr for a in (0.3, 2.4, 4.5)]
        tip = mb.vert(p + n * rr * 0.9)
        b = [mb.vert(x) for x in base]
        s0 = len(mb.f)
        for k in range(3):
            mb.face((b[k], b[(k + 1) % 3], tip), col or PAL['barnacle'], 0, jitter=0.08)
        tag(mb, s0, wk=0.0)


def kelp(mb, p0, d, length, w, rng, z=0.03, col=None):
    """A strand of kelp lying on the sand: 3 wavy quads."""
    p0 = Vector(p0); d = Vector((d[0], d[1], 0)).normalized()
    side = Vector((-d.y, d.x, 0))
    prev = None
    s0 = len(mb.f)
    for k in range(4):
        t = k / 3
        c = p0 + d * length * t + side * math.sin(t * 5 + rng.uniform(0, 1)) * 0.25
        ww = w * (1 - 0.6 * t)
        a, b = mb.vert(c + side * ww + Vector((0, 0, z))), mb.vert(c - side * ww + Vector((0, 0, z)))
        if prev:
            mb.face((prev[1], b, a, prev[0]), col or (PAL['kelp'] if rng.random() < 0.6 else PAL['weed']), 0, jitter=0.1)
        prev = (a, b)
    tag(mb, s0, wk=0.0)


def rag(mb, top, drop, nv, rng, col=None, holes=0.18, billow=(0.0, 0.0), ragged=0.55, fixed_bottom=None):
    """A tattered sail hanging from the polyline `top` (list of points): straight down (world z) with a billow,
    ragged foot (random column lengths), torn holes. Two-sided (backface)."""
    s0 = len(mb.f)
    cols = []
    nu = len(top) - 1
    for j, a in enumerate(top):
        a = Vector(a)
        L = drop * (1 - ragged * rng.random()) if 0 < j < nu else drop * (0.55 + 0.3 * rng.random())
        col_ = []
        for i in range(nv + 1):
            t = i / nv
            bl = math.sin(math.pi * t) * (1 - abs(j / nu - 0.5) * 1.2)
            p = a + Vector((billow[0] * bl, billow[1] * bl, -L * t))
            p.z = max(p.z, 0.04)
            col_.append(mb.vert(p))
        cols.append(col_)
    c = col or PAL['canvas_old']
    for j in range(nu):
        for i in range(nv):
            if i > 0 and rng.random() < holes:
                continue
            mb.face((cols[j][i], cols[j + 1][i], cols[j + 1][i + 1], cols[j][i + 1]), c, 0, jitter=0.06)
    tag(mb, s0, wk=0.35, salt=False)
    mb.backface(s0, dark=0.85)


def rust_streak(mb, p, n, length, w=0.07):
    """A rust run down a plank face from a fitting at p (surface normal n): a tapering decal quad, lifted 2 cm."""
    n = Vector(n).normalized()
    down = Vector((0, 0, -1))
    down = (down - n * down.dot(n)).normalized() if abs(n.z) < 0.95 else Vector((1, 0, 0))
    side = n.cross(down).normalized()
    o = p + n * 0.02
    a, b = mb.vert(o + side * w), mb.vert(o - side * w)
    c, d = mb.vert(o + down * length - side * w * 0.25), mb.vert(o + down * length + side * w * 0.25)
    s0 = len(mb.f)
    q = (a, b, c, d)
    if newell([mb.v[i] for i in q]).dot(n) < 0:
        q = q[::-1]
    mb.face(q, PAL['rust'], 0, jitter=0.08)
    tag(mb, s0, wk=0.0)


def rock(mb, c, r, rng, squash=0.6, col=None, weed=0.0, segs=6, pat=PT['rock']):
    """Faceted boulder: two rings + top/bottom, jittered; weed paints the low ring."""
    c = Vector(c)
    rot = rng.uniform(0, 6.28)
    rings = []
    for (f, zz) in ((1.0, -0.25), (0.92, 0.35), (0.5, 0.85)):
        row = []
        for k in range(segs):
            a = rot + 2 * math.pi * k / segs + rng.uniform(-0.2, 0.2)
            j = rng.uniform(0.82, 1.15)
            row.append(mb.vert(c + Vector((math.cos(a) * r * f * j, math.sin(a) * r * f * j * rng.uniform(0.8, 1.0), zz * r * squash * j))))
        rings.append(row)
    top = mb.vert(c + Vector((rng.uniform(-0.15, 0.15) * r, rng.uniform(-0.15, 0.15) * r, r * squash * rng.uniform(0.95, 1.1))))
    base = col or PAL['rock']
    s0 = len(mb.f)
    for ri, (r0, r1) in enumerate(zip(rings, rings[1:])):
        for k in range(segs):
            k2 = (k + 1) % segs
            cc = mix(base, PAL['weed'], weed * (1.0 if ri == 0 else 0.25)) if weed else base
            mb.face((r0[k], r0[k2], r1[k2], r1[k]), cc, pat, jitter=0.07)
    for k in range(segs):
        mb.face((rings[-1][k], rings[-1][(k + 1) % segs], top), mix(base, PAL['lichen'], 0.25 * rng.random()), pat, jitter=0.07)
    tag(mb, s0, wk=0.0)


def gull(mb, p, heading, rng, sit=True):
    """A gull, ~0.55 m: diamond body + folded wings + beak (about 14 tris)."""
    p = Vector(p); R = Matrix.Rotation(heading, 3, 'Z')

    def V(x, y, z):
        return mb.vert(p + R @ Vector((x, y, z)))
    nose, tail = V(0.2, 0, 0.17), V(-0.3, 0, 0.14)
    top, bot, l, r_ = V(0, 0, 0.27), V(0, 0, 0.05), V(0, 0.09, 0.15), V(0, -0.09, 0.15)
    head = V(0.17, 0, 0.3)
    s0 = len(mb.f)
    W, G = PAL['gull'], PAL['gull_grey']
    for a, b, cc in ((top, l, W), (l, bot, W), (bot, r_, W), (r_, top, W)):
        mb.face((nose, a, b), cc, 0)
        mb.face((tail, b, a), G if a == top or b == top else W, 0)
    mb.face((nose, head, l), W, 0); mb.face((nose, r_, head), W, 0); mb.face((head, r_, l), W, 0)
    bk = V(0.3, 0, 0.27)
    mb.face((head, bk, nose), PAL['beak'], 0)
    for sd in (1, -1):    # folded wing
        a, b, c = V(0.08, sd * 0.1, 0.22), V(-0.36, sd * 0.06, 0.2), V(-0.05, sd * 0.11, 0.12)
        mb.face((a, b, c) if sd > 0 else (a, c, b), G, 0)
    tag(mb, s0, wk=0.0)


# ------------------------------------------------------------------ epitaph marker (node 'epitaph')
BOARD_W, BOARD_H = 1.1, 0.34


def epitaph(seed=0, lean=0.05):
    """Weathered driftwood post + nameboard + lantern hook. Local frame: origin at the post base on the sand,
    the board's FRONT faces -y (glTF +z). Returns (post MB, lamp MB, board centre, lamp centre).
    The board's front face carries TEXCOORD_0 = name region [0,1]^2 (u left->right, v bottom->top as read
    from the front); every other face is UV (-4, -4) = outside."""
    rng = random.Random(seed)
    mb, lamp = MB(seed), MB(seed + 1)
    top = Vector((rng.uniform(-1, 1) * lean, -lean * 0.5, 2.05))
    rod(mb, (0, 0, -0.35), top, 0.085, PAL['drift'], 5, r2=0.06, smooth=False)
    splinters(mb, top, top.normalized(), 0.07, 0.14, PAL['drift'], rng, 3)
    # nameboard nailed across the post, a little askew
    tilt = rng.uniform(-0.05, 0.05)
    bc = Vector((top.x * 0.62, -0.1, 1.32))
    ax = (Vector((math.cos(tilt), 0, math.sin(tilt))), Vector((0, 1, 0)), Vector((-math.sin(tilt), 0, math.cos(tilt))))
    s0 = len(mb.f)
    box(mb, bc, (BOARD_W, 0.05, BOARD_H), PAL['board'], PT['boards'], axes=ax, skip=('-y',), jitter=0.02)
    tag(mb, s0, wk=0.25, salt=False)
    # the front face (-y) with the name UVs
    cs = [bc + ax[0] * sx * BOARD_W / 2 + ax[1] * -0.025 + ax[2] * sz * BOARD_H / 2 for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    ids = [mb.vert(p) for p in cs]
    mb.face(ids, PAL['board'], 0, uv=[(0, 0), (1, 0), (1, 1), (0, 1)], jitter=0.0)
    mb.f[-1]['uv_in'] = True; mb.f[-1]['wk'] = 0.0
    # rope lashing + two iron nails' rust
    rod(mb, bc + Vector((0.0, 0.03, BOARD_H * 0.5 + 0.06)), bc + Vector((0.0, 0.03, -BOARD_H * 0.5 - 0.06)), 0.03, PAL['rope'], 3)
    for sx in (-0.42, 0.42):
        rust_streak(mb, bc + ax[0] * sx + ax[2] * 0.08 + Vector((0, -0.026, 0)), Vector((0, -1, 0)), 0.14, 0.018)
    # lantern hook: iron arm off the post top, a small lantern hanging from it
    arm0 = top + Vector((0, 0, -0.18))
    arm1 = arm0 + Vector((0.42, -0.06, 0.04))
    rod(mb, arm0, arm1, 0.018, PAL['iron'], 3, smooth=False)
    rod(mb, arm1, arm1 + Vector((0, 0, -0.14)), 0.01, PAL['iron'], 3, smooth=False)
    lc = arm1 + Vector((0, 0, -0.34))
    s0 = len(mb.f)
    box(mb, lc + Vector((0, 0, 0.13)), (0.2, 0.2, 0.05), PAL['iron'], PT['metal'], skip=('-z',))
    box(mb, lc + Vector((0, 0, -0.13)), (0.2, 0.2, 0.04), PAL['iron'], PT['metal'])
    box(mb, lc + Vector((0, 0, 0.18)), (0.09, 0.09, 0.06), PAL['iron'], PT['metal'], skip=('-z',))
    tag(mb, s0, wk=0.0)
    box(lamp, lc, (0.15, 0.15, 0.22), PAL['lamp_glass'], 0, skip=())
    # a little cairn of beach stones at the foot
    for k in range(3):
        a = k * 2.1 + rng.uniform(0, 0.5)
        rock(mb, (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.02), 0.13, rng, squash=0.7, segs=4)
    return mb, lamp, bc, lc


def attach_epitaph(root, at, seed, coll=None):
    """Node 'epitaph' (hb_opaque, origin at the post base) + child 'epitaph_lamp' (hb_emissive) + empty 'epitaph_light'."""
    mb, lamp, bc, lc = epitaph(seed)
    at = Vector(at)
    for m in (mb, lamp):
        xform(m, Matrix.Translation(at))
    ob = finish(mb, 'epitaph', 'hb_opaque', root, seed, origin=at, coll=coll, uv=True, wl=0.12)
    lo = hb_lib.to_object(lamp, 'epitaph_lamp', 'hb_emissive', parent=ob, origin=at, coll=coll)
    lo.location = (0, 0, 0)
    empty('epitaph_light', tuple(lc), parent=ob, coll=coll)
    return ob, mb.tris() + lamp.tris()


def ensure_materials():
    hb_lib.ensure_export_materials()
    for nm, col, em in (('hb_window', (0.13, 0.19, 0.24), (1.0, 0.68, 0.34)), ('hb_emissive', (0.3, 0.3, 0.28), (1.0, 0.6, 0.25))):
        m = bpy.data.materials.get(nm) or bpy.data.materials.new(nm)
        try:
            m.use_nodes = True
        except Exception:
            pass
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (*col, 1)
        p.inputs['Emission Color'].default_value = (*em, 1); p.inputs['Emission Strength'].default_value = 1.0
