"""Harbour civic kit - "office-works": building works dressed beside a harbour office (data cue T6: a chain whose 30-day
stablecoin supply grew >= 8 % gets works next to its office). Classical-era site: timber pole scaffolding with three
lifts against the office's flank wall, a Roman treadwheel crane (magna rota) with its jib over the scaffold and an ashlar
block on the rope, stacks of dressed lime ashlar, and a half-built extension bay with ragged stepped walls.

Kit frame (glTF): origin on the ground where the kit stands against the flank wall; +x ALONG the wall, +z AWAY from the
wall (the wall is the plane z = 0 behind the kit), +y up. Blender while building: x along, -y out, z up.
The kit is long and shallow (~9.6 m along x by ~6.3 m out) because every office fills its 20 x 16 plot to within
~1-2 m of the side edges: the scaffold (z 0..1.6) stays on the plot, the crane and stacks stand on the land beside it.
anchors.flank.<chain> = {pos, rotY}: the kit origin and yaw (about glTF +Y, applied before pos) in that office's plot
frame, derived by ray-casting the built office (never guessed).
"""
import math
import bpy
from mathutils import Vector
from cv_lib import *
import cv_civic

P = 0.5   # office plot ground (office_ground plinth top)


def O(x, out, h):
    """kit coords (along, out, up) -> Blender"""
    return Vector((x, -out, h))


def bx(mb, x0, o0, h0, x1, o1, h1, col, pat=0, skip=('-z',)):
    box2(mb, x0, -o1, h0, x1, -o0, h1, col, pat, skip=skip)


def bm(mb, a, b, w, col, pat=0, h=None):
    beam(mb, O(*a), O(*b), w, h or w, col, pat, skip=('-x', '+x'))


def rope(mb, a, b, r=0.035):
    rod(mb, O(*a), O(*b), r, PAL['rope'], 3, smooth=False)


# ------------------------------------------------------------------ parts
def scaffold(op, x0=-4.8, x1=0.6):
    """Pole scaffold: two rows of standards, ledgers and putlogs (into the wall) at three lifts, plank decks, a raker
    brace and a ladder."""
    pole, plank, put = PAL['timber_grey'], PAL['timber_fresh'], PAL['timber']
    xs = [x0 + (x1 - x0) * k / 3 for k in range(4)]
    rows = (0.3, 1.5)
    lifts = (2.8, 5.4, 8.0)
    for x in xs:
        for o in rows:
            rod(op, O(x, o, 0.0), O(x, o, 9.0), 0.085, pole, 5, smooth=False, r2=0.07)
    for z in lifts:
        for o in rows:
            bm(op, (x0 - 0.25, o, z - 0.12), (x1 + 0.25, o, z - 0.12), 0.11, pole)
        for x in xs:
            bm(op, (x + 0.12, -0.15, z), (x + 0.12, 1.75, z), 0.1, put)
        bx(op, x0 - 0.1, 0.22, z + 0.05, x1 + 0.1, 1.58, z + 0.13, plank, PT['planks_x'], skip=())
    # a raker on the outer face, a ledger rail on the top lift
    bm(op, (xs[0], 1.62, 0.2), (xs[2], 1.62, 7.8), 0.09, pole)
    bm(op, (x0 - 0.2, 1.5, 9.0), (x1 + 0.2, 1.5, 9.0), 0.09, pole)
    # ladder up the outer face of the first bay
    lx = (xs[1] + xs[2]) / 2
    for s in (-0.25, 0.25):
        bm(op, (lx + s, 2.35, 0.0), (lx + s, 1.65, lifts[0] + 0.9), 0.08, put)
    for k in range(1, 5):
        t = k / 5
        bm(op, (lx - 0.25, 2.35 - 0.7 * t, (lifts[0] + 0.9) * t), (lx + 0.25, 2.35 - 0.7 * t, (lifts[0] + 0.9) * t), 0.05, put)
    # mortar tub on the second lift
    bx(op, x0 + 0.6, 0.5, lifts[1] + 0.13, x0 + 1.3, 1.1, lifts[1] + 0.5, PAL['oak'], PT['boards'])
    return lifts


def ashlar(op, x, o, h, w=0.9, d=0.6, t=0.5, k=0):
    cols = (PAL['lime'], PAL['stone_light'], PAL['stone'], PAL['sandstone'])
    bx(op, x - w / 2, o - d / 2, h, x + w / 2, o + d / 2, h + t, mul(cols[k % 4], 1.0 + 0.04 * ((k * 7) % 3 - 1)), PT['ashlar'])


def stack(op, x, o, layers, k0=0):
    """Dressed blocks on two timber skids; layers = blocks per layer (long axis along x)."""
    for s in (-0.25, 0.25):
        bx(op, x - 1.0, o + s - 0.07, 0.0, x + 1.0, o + s + 0.07, 0.12, PAL['timber_dark'])
    h = 0.12
    k = k0
    for n in layers:
        for i in range(n):
            ashlar(op, x + (i - (n - 1) / 2) * 0.94, o, h, k=k)
            k += 1
        h += 0.5


def extension(op, x0=1.1, x1=4.7, depth=3.6, th=0.55):
    """Half-built bay: two side walls out from the office wall and a front wall, each a row of block strips whose
    course counts step down (ragged tops); a column drum on the front corner, another lying in the bay."""
    c = 0.5   # course height
    walls = (  # (axis, fixed, a0, a1, courses)
        ('o', x0, 0.0, depth, (6, 6, 5, 4)),
        ('o', x1 - th, 0.0, depth, (5, 5, 4, 3)),
        ('x', depth - th, x0 + th, x1 - th, (3, 4, 3, 3)),
    )
    for wi, (ax, f, a0, a1, cs) in enumerate(walls):
        n = len(cs)
        for i, nc in enumerate(cs):
            b0, b1 = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n
            col = mul(PAL['lime'] if (i + wi) % 2 else PAL['stone_light'], 1.0 - 0.03 * (i % 2))
            if ax == 'o':
                bx(op, f, b0, 0.0, f + th, b1, nc * c, col, PT['ashlar'])
            else:
                bx(op, b0, f, 0.0, b1, f + th, nc * c, col, PT['ashlar'])
    # a course being laid: one block set proud on the tallest wall
    bx(op, x0 - 0.04, 0.4, 3.0, x0 + th + 0.04, 1.2, 3.45, PAL['stone'], PT['ashlar'])
    cyl(op, (x1 + 0.45, -(depth + 0.4)), 0.42, 0.42, 0.0, 0.9, PAL['marble'], 0, 8)
    v = O((x0 + x1) / 2 + 0.3, depth * 0.45, 0.42)
    rod(op, v + Vector((-0.45, 0, 0)), v + Vector((0.45, 0, 0)), 0.42, PAL['marble'], 8, cap=True, smooth=False)


def crane(op, cx=-3.0, co=4.4):
    """Treadwheel crane: two A-frames carrying the axle, shear-leg jib leaning over the scaffold, back-stay and hoist rope.
    Returns (wheel mesh builder, axle point, jib tip) in Blender coords."""
    R, hz, half = 1.6, 1.85, 0.5           # wheel radius, axle height, half drum width
    ax_ = O(cx, co, hz)
    frame = PAL['oak']
    apex = hz + 0.15
    for s in (-1, 1):
        x = cx + s * (half + 0.28)
        for d in (-1, 1):
            bm(op, (x, co + d * 1.25, 0.0), (x, co + d * 0.08, apex + 0.1), 0.16, frame)
        bm(op, (x, co - 0.8, 0.7), (x, co + 0.8, 0.7), 0.1, frame)
        bx(op, x - 0.12, co - 1.4, 0.0, x + 0.12, co + 1.4, 0.16, PAL['timber_dark'], skip=('-z',))
    # jib: two legs from the frame tops to the tip, a crossbar; tip just clear of the scaffold's outer row
    tip_o, tip_h = 2.15, 9.7
    for s in (-1, 1):
        bm(op, (cx + s * (half + 0.28), co + 0.1, apex), (cx + s * 0.12, tip_o, tip_h), 0.15, frame)
    bm(op, (cx - 0.55, 3.3, 6.0), (cx + 0.55, 3.3, 6.0), 0.1, frame)
    tip = O(cx, tip_o, tip_h)
    bx(op, cx - 0.2, tip_o - 0.15, tip_h - 0.35, cx + 0.2, tip_o + 0.15, tip_h + 0.05, PAL['timber_dark'], skip=())   # pulley block
    rope(op, (cx, tip_o + 0.1, tip_h), (cx, 6.6, 0.3))                       # back-stay to a stake
    bx(op, cx - 0.1, 6.5, 0.0, cx + 0.1, 6.7, 0.45, PAL['timber_dark'])
    rope(op, (cx, tip_o + 0.1, tip_h - 0.2), (cx, co, hz + 0.2))             # hoist rope onto the axle
    # the wheel (its own node): drum band of 12 boarded segments, three through-spokes a side, the axle
    w = MB(7)
    segs = 12
    for k in range(segs):
        a0, a1 = 2 * math.pi * k / segs, 2 * math.pi * (k + 1) / segs
        p0 = ax_ + Vector((0, math.cos(a0) * R, math.sin(a0) * R))
        p1 = ax_ + Vector((0, math.cos(a1) * R, math.sin(a1) * R))
        beam(w, p0, p1, 0.16, 2 * half, PAL['timber'], PT['boards'], up=Vector((1, 0, 0)), skip=('-x', '+x'))
    for s in (-1, 1):
        for k in range(3):
            a = math.pi * k / 3 + (0.0 if s < 0 else math.pi / 6)
            d = Vector((0, math.cos(a), math.sin(a))) * (R - 0.05)
            c = ax_ + Vector((s * (half - 0.06), 0, 0))
            beam(w, c - d, c + d, 0.1, 0.1, PAL['oak'], 0, skip=('-x', '+x'))
    rod(w, ax_ + Vector((-(half + 0.4), 0, 0)), ax_ + Vector((half + 0.4, 0, 0)), 0.11, PAL['timber_dark'], 6, smooth=False, cap=True)
    return w, ax_, tip


# ------------------------------------------------------------------ anchors (ray-cast every office)
# the flank that faces the default cameras (plot frame), so the works never hide behind the office
# exceptions (keep +x): tron's -x end wall carries its second crest (the scaffold would cover it), the loading hoist with
# its bale, crates and the flag, leaving < 9 m of clear wall; hyperliquid's -x flank is the fountain house, which the
# scaffold would screen (only ~1.6-1.9 m of plain wall either side of it)
SIDE = {'ethereum': -1, 'tron': 1, 'solana': -1, 'bsc': -1, 'hyperliquid-l1': 1, 'polygon': 1, 'arbitrum': 1, 'base': 1}
# along-wall nudges (plot y, Blender): clear ethereum's flag base (front corner) and arbitrum's back amphorae
SHIFT = {'ethereum': 0.7, 'arbitrum': -1.0}
ALONG = (-4.9, 4.9)        # kit extent along x (metres)
SCAFF = (-4.8, 0.6)        # scaffold span along x


def _office_flank(chain):
    """Build the office, ray-cast its flank, return (side, plane |x|, centre y (Blender), notes); then delete it."""
    before = set(bpy.data.objects)
    root, info = cv_civic.build_office(chain)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    sc = bpy.context.scene
    fx, _, fz_front = info['anchors']['flag_pole_top']
    side = SIDE[chain]

    def hit(y, z):
        ok, loc, *_ = sc.ray_cast(dg, Vector((side * 12.0, y, z)), Vector((-side, 0, 0)))
        return abs(loc.x) if ok and abs(loc.x) < 9.99 else None

    # the flank wall run: contiguous y samples (mid-wall height) within 0.5 m of the wall hit at y = 1 (mid-depth)
    ref = hit(1.0, P + 2.5)
    run = [1.0]
    for step in (-0.25, 0.25):
        y = 1.0
        while abs(y + step) <= 7.5 and (h := hit(y + step, P + 2.5)) is not None and abs(h - ref) < 0.5:
            y += step; run.append(y)
    yw = (min(run) + max(run)) / 2
    # centre the scaffold on that run; on the +x flank kit +x points to the plot back (+y Blender), on -x to the front
    yc = yw - side * (SCAFF[0] + SCAFF[1]) / 2
    yc = min(max(yc, -8.0 - ALONG[0]), 8.0 - ALONG[1])     # keep the kit's ends on the plot depth
    yc += SHIFT.get(chain, 0.0)
    s0, s1 = sorted((yc + side * SCAFF[0], yc + side * SCAFF[1]))
    plane = 0.0
    for y in [s0 + (s1 - s0) * k / 24 for k in range(25)]:
        for z in [P + 0.05 + 0.25 * k for k in range(37)]:
            h = hit(y, z)
            if h is not None:
                plane = max(plane, h)
    # anything of the office standing in the kit's volume (beyond the plane, inside its along-wall span)
    k0, k1 = sorted((yc + side * ALONG[0], yc + side * ALONG[1]))
    clash = [o.matrix_world @ v.co for o in bpy.data.objects if o not in before and o.type == 'MESH' for v in o.data.vertices]
    clash = [v for v in clash if side * v.x > plane + 0.1 and k0 <= v.y <= k1 and v.z > P + 0.05]
    if clash:
        print(f'office-works {chain}: {len(clash)} office verts in the kit volume, x {min(v.x for v in clash):.1f}..{max(v.x for v in clash):.1f} '
              f'y {min(v.y for v in clash):.1f}..{max(v.y for v in clash):.1f} z {min(v.z for v in clash):.1f}..{max(v.z for v in clash):.1f}')
    for o in [o for o in bpy.data.objects if o not in before]:
        bpy.data.objects.remove(o, do_unlink=True)
    for m in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(m)
    # flag clearance from the kit's along-wall span (in plot y)
    fy = -fz_front
    gap = 0.0 if k0 <= fy <= k1 else min(abs(fy - k0), abs(fy - k1))
    if (fx > 0) == (side > 0):
        print(f'office-works {chain}: flank on the flag side, flag {gap:.1f} m beyond the kit span')
    return side, plane + 0.05, yc, (round(min(run), 2), round(max(run), 2))



def flank_anchors():
    out = {}
    for chain in cv_civic.OFFICE_CHAINS:
        side, plane, yc, main = _office_flank(chain)
        out[chain] = dict(pos=[round(side * plane, 2), P, round(-yc, 2)], rotY=round(side * math.pi / 2, 4))
        print(f'office-works {chain}: side {"+x" if side > 0 else "-x"} plane {plane:.2f} (wall run y {main}) centre y {yc:.2f}')
    return out


# ------------------------------------------------------------------ builder
def build_office_works(coll=None):
    flank = flank_anchors()
    root = empty('office-works', coll=coll)
    op = MB(71)
    scaffold(op)
    extension(op)
    stack(op, -0.6, 3.7, (3, 2, 1), 0)
    stack(op, 3.0, 5.2, (2, 1), 3)
    stack(op, -0.3, 5.6, (2,), 5)
    w, ax_, tip = crane(op)
    to_object(op, 'works_body', 'hb_opaque', parent=root, coll=coll)
    wheel = to_object(w, 'works_wheel', 'hb_opaque', parent=root, origin=tuple(ax_), coll=coll)
    wheel['anim'] = ('treadwheel: rotate about the axle = glTF local +X (the node origin is the axle centre); '
                     'turns while works_block rises')
    # the hanging block: rope from the hook down to a sling and an ashlar block; origin at the rope top (= the hook) so a
    # pendulum sway or a lift moves rope and block together
    b = MB(72)
    bh = 6.9
    rod(b, tip + Vector((0, 0, -0.35)), Vector((tip.x, tip.y, bh + 0.75)), 0.035, PAL['rope'], 3, smooth=False)
    for s in (-1, 1):
        rod(b, Vector((tip.x, tip.y, bh + 0.75)), Vector((tip.x + s * 0.4, tip.y, bh + 0.5)), 0.03, PAL['rope'], 3, smooth=False)
    box2(b, tip.x - 0.45, tip.y - 0.3, bh, tip.x + 0.45, tip.y + 0.3, bh + 0.5, PAL['lime'], PT['ashlar'])
    blk = to_object(b, 'works_block', 'hb_opaque', parent=root, origin=tuple(tip + Vector((0, 0, -0.35))), coll=coll)
    blk['anim'] = 'hanging block: origin = rope top under the hook; sway about the origin, or raise/lower with the wheel'
    hk = empty('works_hook', tuple(tip + Vector((0, 0, -0.35))), parent=root, coll=coll)
    hk['anim'] = 'jib tip pulley (the rope top)'
    return root, dict(anchors=dict(flank=flank),
                      note='kit frame: +x along the flank wall, +z out from it, origin on the ground at the wall; '
                           'flank.<chain> = kit origin + yaw (about +Y, applied first) in that office plot frame')
