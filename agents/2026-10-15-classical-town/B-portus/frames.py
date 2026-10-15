"""Classical town exploration, direction B - "Roman Portus / Ostia" style frames (exploration only, no production use).

    blender -b --factory-startup -P agents/2026-10-15-classical-town/B-portus/frames.py -- [--mode sheet|lineup|both]
        [--state golden|night|both] [--samples 32] [--pct 100]

Builds four subjects with the civic kit primitives (scripts/harbour/blender/civic/cv_lib.py) and renders them with the
lineup.py preview look (style C kit material, AgX, golden-hour sun):
  houses  - an insula (brick, arched tabernae, timber maenianum) + a rendered domus with a roof loggia
  office  - Ethereum harbour office as a horrea front: travertine portal + crest, velaria (hb_cover), amphorae, flag pole
  mint    - officina monetaria: Juno Moneta temple front, brick arcade hall with presses, beehive kilns, overshot wheel
  burn    - a two-tier brick fire tower on the islet with a bronze brazier (fire_core)
Writes sheet-golden.jpg / lineup-golden.jpg (+ night) next to this file; scratch PNGs in outputs/classical-town/B-portus.
"""
import sys, os, math, random, subprocess
sys.dont_write_bytecode = True
_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.abspath(os.path.join(_DIR, '..', '..', '..'))
_CIVIC = os.path.join(_ROOT, 'scripts', 'harbour', 'blender', 'civic')
sys.path.insert(0, _CIVIC)
sys.path.insert(1, os.path.join(_CIVIC, '..', 'island'))
import bpy, bmesh
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
from cv_lib import *
import nl_common as ncm

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(n, d):
    return ARGV[ARGV.index(n) + 1] if n in ARGV else d


MODE = arg('--mode', 'both')
STATES = ['golden', 'night'] if arg('--state', 'golden') == 'both' else [arg('--state', 'golden')]
SAMPLES = int(arg('--samples', '32'))
PCT = int(arg('--pct', '100'))
YAW, PITCH = -24.0, 34.0
OUT = _DIR
SCR = os.path.join(_ROOT, 'outputs', 'classical-town', 'B-portus')
os.makedirs(SCR, exist_ok=True)
PHAROS = os.path.join(_ROOT, 'outputs', 'harbour', 'pharos', 'lighthouse.raw.glb')   # uncompressed twin of public/harbour/lighthouse.glb

# ------------------------------------------------------------------ Portus palette
R = {k: lin(v) for k, v in {
    'brick': '#B4694B', 'brick_dk': '#8C4B35', 'brick_lt': '#C98361',          # opus latericium
    'trav': '#E4D8BD', 'trav_dk': '#C4B392', 'marble': '#EEE8DC',               # travertine bands, portals, columns
    'stucco': '#E0B173', 'rose': '#D9967A', 'lime': '#ECE2CC', 'red_ochre': '#9E3B2C',
    'tile': '#BF5E3B', 'tile_dk': '#93432C',                                    # tegulae / imbrices
    'oak': '#76502F', 'shutter': '#5A3A25', 'bronze': '#A8713A', 'gilt': '#D9A93E',
    'amph': '#C9855A', 'amph_dk': '#A86440', 'basalt': '#5E5B57', 'pave': '#B7AC97',
    'water': '#2F6878', 'water_lt': '#9CCAD0', 'rock': '#8A8178', 'rock_dk': '#655E57', 'soot': '#2D2A29', 'iron': '#2A2B2D',
}.items()}
UP = Vector((0, 0, 1))
FRONT = (0, -1, 0)


# ------------------------------------------------------------------ Roman parts
def arch_ring(mb, xc, y, spring, r, col, w=0.42, d=0.28, seg=6):
    """Travertine voussoir ring proud of a wall plane y (facing -y)."""
    pts = [Vector((xc + (r + w / 2) * math.cos(math.pi * k / seg), y - d / 2, spring + (r + w / 2) * math.sin(math.pi * k / seg)))
           for k in range(seg + 1)]
    for a, b in zip(pts[:-1], pts[1:]):
        beam(mb, a, b, w, d, col, up=Vector((0, -1, 0)))


def arch_outline(xc, r, z0, spring, seg=6):
    return [(xc - r, z0), (xc + r, z0)] + [(xc + r * math.cos(math.pi * k / seg), spring + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]


def taberna(K, xc, r, yb, z0, spring, shop=False):
    """Fill one arched opening at plane yb: shut timber shutters, or an open shop (travertine counter + lit room)."""
    if not shop:
        wall_poly(K.op, yb, arch_outline(xc, r, z0, spring), R['shutter'], PT['boards'], centre=(xc, (z0 + spring) / 2))
        box2(K.op, xc - 0.05, yb - 0.08, z0, xc + 0.05, yb, spring + r * 0.9, R['oak'])
        return
    box2(K.op, xc - r, yb - 0.7, z0, xc + r, yb, z0 + 1.05, R['trav'], PT['ashlar'])
    pts = [(xc - r, yb, z0 + 1.05), (xc + r, yb, z0 + 1.05)] + \
          [(xc + r * math.cos(math.pi * k / 6), yb, spring + r * math.sin(math.pi * k / 6)) for k in range(7)]
    poly(K.win, pts, (K.rng.uniform(0.7, 1.0), 0.15, 0.0), 0, nrm=FRONT, jitter=0.0)


def rwin(K, c, w, h, arch=False, n=FRONT, shutters=True):
    window(K, c, n, w, h, frame=R['trav'], arch=arch, sill=True, shutters=R['shutter'] if shutters else None, depth=0.1)


def course(mb, x0, y0, x1, y1, z, col=None, proud=0.14, h=0.26):
    box2(mb, x0 - proud, y0 - proud, z - h / 2, x1 + proud, y1 + proud, z + h / 2, col or R['trav'])


def troof_hip(mb, x0, y0, x1, y1, z, pitch=0.36, ov=0.55):
    """Low-pitch terracotta hip roof (~20 deg) with a travertine eaves cornice."""
    course(mb, x0, y0, x1, y1, z - 0.18, R['trav'], 0.22, 0.36)
    hip_roof(mb, x0, y0, x1, y1, z, pitch * min(x1 - x0, y1 - y0) / 2, R['tile'], PT['tiles'], ov=ov, th=0.22, fascia=R['tile_dk'])


def maenianum(K, xa, xb, yf, zb, dep=1.3, roof_h=0.0):
    """Projecting timber balcony on oak joists, boarded parapet, posts carrying a tiled pentice."""
    op = K.op
    n = max(2, int((xb - xa) / 1.3) + 1)
    for i in range(n):
        x = xa + 0.15 + (xb - xa - 0.3) * i / (n - 1)
        box2(op, x - 0.12, yf - dep - 0.2, zb - 0.34, x + 0.12, yf, zb - 0.08, R['oak'])
    box2(op, xa, yf - dep, zb - 0.08, xb, yf, zb + 0.06, R['oak'], PT['planks_x'])
    box2(op, xa, yf - dep, zb + 0.06, xb, yf - dep + 0.08, zb + 0.95, R['oak'], PT['boards'])
    for x in (xa, xb - 0.08):
        box2(op, x, yf - dep, zb + 0.06, x + 0.08, yf, zb + 0.95, R['oak'], PT['boards'])
    if roof_h:   # optional tiled pentice on posts (hides the shop arcade from the high camera: off by default)
        for i in range(n):
            x = xa + 0.15 + (xb - xa - 0.3) * i / (n - 1)
            box2(op, x - 0.09, yf - dep + 0.02, zb + 0.06, x + 0.09, yf - dep + 0.2, zb + roof_h, R['oak'], skip=('-z', '+z'))
        zt, zl = zb + roof_h + 0.55, zb + roof_h - 0.05
        poly(op, ((xa - 0.3, yf, zt), (xb + 0.3, yf, zt), (xb + 0.3, yf - dep - 0.45, zl), (xa - 0.3, yf - dep - 0.45, zl)),
             R['tile'], PT['tiles'], nrm=(0, -1, 1))


def lathe_ax(mb, base, d, prof, col, segs=6, pat=0):
    """Surface of revolution along an arbitrary axis d: prof = [(r, t), ...]."""
    d = Vector(d).normalized()
    u, w = basis(d)
    rings = []
    for r, t in prof:
        p = Vector(base) + d * t
        rings.append([mb.vert(p)] * segs if r < 1e-4 else
                     [mb.vert(p + (u * math.cos(2 * math.pi * k / segs) + w * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)])
    for i in range(len(rings) - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            mb.face((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]), col, pat, smooth=True)


AMPH = [(0.0, 0.0), (0.07, 0.05), (0.22, 0.28), (0.25, 0.5), (0.19, 0.76), (0.08, 0.88), (0.075, 1.04), (0.11, 1.1), (0.0, 1.12)]


def amphora(mb, base, d, s=1.0, col=None):
    lathe_ax(mb, base, d, [(r * s, t * s) for r, t in AMPH], col or R['amph'], 6)


def amphora_stack(mb, x, y, z, rng, rows=(3, 2, 1)):
    """Amphorae lying toe-to-mouth in a pyramid on a timber cradle (axis along y)."""
    box2(mb, x - 1.0, y - 0.7, z, x + 1.0, y + 0.7, z + 0.15, R['oak'], PT['planks_x'])
    for j, n in enumerate(rows):
        for i in range(n):
            px = x + (i - (n - 1) / 2) * 0.52
            amphora(mb, (px, y - 0.6 + (0.1 if (i + j) % 2 else 0), z + 0.4 + j * 0.42), (0, 1, 0), 1.1,
                    R['amph'] if rng.random() < 0.6 else R['amph_dk'])


def cypress(mb, x, y, z, h):
    cyl(mb, (x, y), 0.18, 0.14, z, z + 0.8, PAL['timber_dark'], 0, 5)
    lathe(mb, (x, y), [(0.55, z + 0.6), (0.95, z + h * 0.3), (0.8, z + h * 0.65), (0.35, z + h * 0.9), (0.0, z + h)], lin('#3C5634'), PT['leaf'], 7,
          smooth=False)


def stone_pine(mb, x, y, z, h, rng):
    """Umbrella pine: a leaning bare trunk and a flat dark canopy."""
    lean = Vector((rng.uniform(-1.2, 1.2), rng.uniform(-1.2, 1.2), 0))
    top = Vector((x, y, z + h)) + lean
    rod(mb, (x, y, z), top, 0.32, lin('#6B5240'), 5, r2=0.2)
    r = h * 0.55
    lathe(mb, (top.x, top.y), [(r * 0.55, top.z - 0.6), (r, top.z + 0.2), (r * 0.85, top.z + 1.3), (r * 0.4, top.z + 2.0), (0.0, top.z + 2.2)],
          lin('#4C6A3A'), PT['leaf'], 9, smooth=False)


def plot_base(K, x0, y0, x1, y1, P, top=None):
    box2(K.op, x0, y0, -1.5, x1, y1, P, R['basalt'], PT['ashlar'], skip=('+z',))
    poly(K.op, ((x0, y0, P), (x1, y0, P), (x1, y1, P), (x0, y1, P)), top or R['pave'], PT['cobble'], nrm=(0, 0, 1))


# =================================================================== 1. TOWN HOUSES (pair)
def build_houses(alt=False):
    """alt: the insula's upper floors in ochre render and a limewashed domus (variety for the quarter)."""
    root = empty('houses')
    K = Kit(11 + alt)
    up, upp = (R['stucco'], PT['render']) if alt else (R['brick'], PT['ashlar'])
    dom = R['lime'] if alt else R['rose']
    op = K.op
    P = 0.5
    plot_base(K, -13.5, -8.0, 13.5, 7.0, P)
    # basalt street kerb in front
    box2(op, -13.5, -8.0, P, 13.5, -7.2, P + 0.25, R['trav_dk'], PT['ashlar'])

    # ---- A: insula, three storeys, brick with travertine courses, arched tabernae, timber maenianum
    X0, X1, Y0, Y1 = -12.4, -1.2, -4.6, 5.6
    G, F2, E = P + 3.9, P + 6.9, P + 9.6
    arcs = arcade(op, X0, X1, Y0, 0.6, P, G, 3, 0.95, P + 2.25, R['brick'], PT['ashlar'], intr=R['brick_dk'], keystone=None)
    for i, (xc, r) in enumerate(arcs):
        arch_ring(op, xc, Y0, P + 2.25, r, R['trav'], 0.3, 0.2, 6)
        taberna(K, xc, r, Y0 + 0.45, P, P + 2.25, shop=(i == 1))
    box2(op, X0, Y0 + 0.6, P, X1, Y1, G, R['brick'], PT['ashlar'], skip=('-y',))
    box2(op, X0, Y0, G, X1, Y1, E, up, upp)
    for z in (G, F2):
        course(op, X0, Y0, X1, Y1, z)
    box2(op, X0, Y0 - 0.05, P, X1, Y0 + 0.6, P + 0.4, R['trav'], PT['ashlar'])   # socle
    for xc, r in arcs:
        rwin(K, (xc, Y0, P + 5.4), 0.95, 1.25, arch=True)
        rwin(K, (xc, Y0, P + 8.2), 0.85, 0.95)
    for yc in (-1.0, 2.6):   # flank (-x) windows
        rwin(K, (X0, yc, P + 5.4), 0.9, 1.2, arch=True, n=(-1, 0, 0))
        rwin(K, (X0, yc, P + 8.2), 0.8, 0.9, n=(-1, 0, 0))
    maenianum(K, X0 + 0.5, X1 - 0.5, Y0, G + 0.15, 1.2)
    troof_hip(op, X0, Y0, X1, Y1, E + 0.18)

    # ---- B: domus front, rose render over a travertine socle, central door, two tabernae, roof loggia
    X0, X1, Y0, Y1 = 0.6, 12.6, -4.2, 5.6
    G, E = P + 3.7, P + 6.8
    box2(op, X0, Y0, P, X1, Y1, E, dom, PT['render'])
    box2(op, X0 - 0.05, Y0 - 0.06, P, X1 + 0.05, Y1, P + 0.6, R['trav'], PT['ashlar'])
    course(op, X0, Y0, X1, Y1, G, h=0.22, proud=0.1)
    xd = 4.0
    door(K, (xd, Y0, P), FRONT, 1.5, 2.7, col=R['bronze'], frame=R['trav'], step=True)
    for k, xc in enumerate((1.9, 6.6)):
        sh = k == 1
        box2(op, xc - 1.1, Y0 - 0.25, P + 2.55, xc + 1.1, Y0 + 0.05, P + 2.9, R['oak'])            # timber lintel
        if sh:
            box2(op, xc - 1.0, Y0 - 0.65, P, xc + 1.0, Y0 - 0.02, P + 1.0, R['trav'], PT['ashlar'])
            poly(K.win, ((xc - 1.0, Y0 - 0.02, P + 1.0), (xc + 1.0, Y0 - 0.02, P + 1.0), (xc + 1.0, Y0 - 0.02, P + 2.55),
                         (xc - 1.0, Y0 - 0.02, P + 2.55)), (0.85, 0.2, 0.0), 0, nrm=FRONT, jitter=0.0)
        else:
            box2(op, xc - 1.0, Y0 - 0.07, P + 0.6, xc + 1.0, Y0, P + 2.55, R['shutter'], PT['boards'])
    for xc in (2.0, 5.2, 8.6, 11.2):
        rwin(K, (xc, Y0, P + 5.2), 0.75, 0.95, shutters=xc < 9)
    rwin(K, (X0, 0.6, P + 5.2), 0.75, 0.95, n=(-1, 0, 0))
    rwin(K, (X0, 3.4, P + 2.0), 0.6, 0.6, n=(-1, 0, 0), shutters=False)
    # street-facing low gable over the left half (pedimented end), roof terrace + loggia over the right
    course(op, X0, Y0, 7.4, Y1, E - 0.12, R['trav'], 0.16, 0.3)
    gable_roof(op, X0, Y0, 7.4, Y1, E, 1.75, R['tile'], PT['tiles'], ov=0.45, axis='y', end_col=dom, end_pat=PT['render'],
               fascia=R['tile_dk'])
    box2(op, 7.4, Y0, E, X1, Y0 + 0.3, E + 0.85, dom, PT['render'])          # terrace parapet
    box2(op, 7.4, Y0 - 0.06, E + 0.85, X1 + 0.06, Y0 + 0.36, E + 1.0, R['trav'])
    box2(op, X1 - 0.3, Y0, E, X1, Y1, E + 0.85, dom, PT['render'])
    LX0, LX1, LY0, LY1 = 7.9, 12.1, -1.6, 5.1
    box2(op, LX0, LY1 - 1.2, E, LX1, LY1, E + 2.6, dom, PT['render'])
    colonnade(op, LX0 + 0.3, LX1 - 0.3, LY0 + 0.3, E, 2.6, 3, 0.2, R['lime'], cap_col=R['trav'])
    troof_hip(op, LX0, LY0, LX1, LY1, E + 2.75, 0.34, 0.4)
    # a vine-pergola + planters on the open terrace (from above it reads as "garden")
    for x in (8.4, 11.6):
        cyl(op, (x, -3.3), 0.42, 0.5, E, E + 0.5, R['amph_dk'], 0, 6)
        sphere(op, (x, -3.3, E + 0.95), 0.55, PAL['grass'], 6, 3, PT['leaf'])
    K.emit(root, 'houses_body')
    return root


# =================================================================== 2. HARBOUR OFFICE (horrea front)
def build_office(chain='ethereum'):
    root = empty(f'harbour-office:{chain}')
    K = Kit(60)
    op = K.op
    acc = lin(CHAINS[chain])
    P = 0.5
    X0, X1, Y0, Y1 = -7.8, 7.8, -4.6, 6.8
    G, E = P + 4.4, P + 8.0
    plot_base(K, -10.0, -8.0, 10.0, 8.0, P)
    # flanks: two brick tabernae each side, a travertine socle and string course, horrea slit windows above
    PX = 2.6
    for xa, xb in ((X0, -PX), (PX, X1)):
        arcs = arcade(op, xa, xb, Y0, 0.6, P, G, 2, 0.62, P + 2.1, R['brick'], PT['ashlar'], intr=R['brick_dk'])
        for i, (xc, r) in enumerate(arcs):
            arch_ring(op, xc, Y0, P + 2.1, r, R['trav'], 0.26, 0.18, 6)
            taberna(K, xc, r, Y0 + 0.45, P, P + 2.1, shop=(i == (0 if xa < 0 else 1)))
            rwin(K, (xc, Y0, G + 1.85), 0.5, 1.15, shutters=False)
    box2(op, X0, Y0 + 0.6, P, X1, Y1, G, R['brick'], PT['ashlar'], skip=('-y',))
    box2(op, X0, Y0, G, X1, Y1, E, R['brick'], PT['ashlar'])
    course(op, X0, Y0, X1, Y1, G)
    for xa, xb in ((X0, -PX), (PX, X1)):
        box2(op, xa, Y0 - 0.05, P, xb, Y0 + 0.6, P + 0.45, R['trav'], PT['ashlar'])
    for yc in (-1.2, 2.2, 5.0):
        rwin(K, (X0, yc, G + 1.85), 0.5, 1.15, n=(-1, 0, 0), shutters=False)
    troof_hip(op, X0, Y0, X1, Y1, E + 0.18, 0.36, 0.5)

    # the portal: projecting travertine gate (Horrea Epagathiana): arch + engaged columns + entablature,
    # an attic carrying the chain crest above the keystone, a small pediment on top
    pf = Y0 - 0.7
    a = arcade(op, -PX, PX, pf, 1.3, P, P + 6.2, 1, 1.05, P + 3.6, R['trav'], PT['ashlar'], intr=R['trav_dk'], keystone=R['trav_dk'])
    xc, r = a[0]
    wall_poly(op, Y0 + 0.5, arch_outline(xc, r, P, P + 3.6), R['oak'], PT['boards'], centre=(xc, P + 2.4))   # double doors
    box2(op, -0.05, Y0 + 0.4, P, 0.05, Y0 + 0.5, P + 3.6 + r * 0.9, R['bronze'])
    for s in (-1, 1):
        disc(op, (s * 0.35, Y0 + 0.5, P + 1.6), FRONT, 0.13, 0.06, R['bronze'], 6)
        column(op, s * 2.05, pf - 0.2, P, 5.6, 0.32, R['marble'], cap_col=R['trav'])
    box2(op, -3.0, pf - 0.7, P + 5.6, 3.0, Y0 + 0.2, P + 6.25, R['trav'])                     # entablature
    box2(op, -2.95, pf - 0.72, P + 5.78, 2.95, pf - 0.66, P + 6.05, R['red_ochre'])           # painted frieze
    box2(op, -2.6, pf, P + 6.25, 2.6, Y0 + 1.4, P + 9.7, R['trav'], PT['ashlar'])             # attic
    crest_panel(K, root, (0.0, pf, P + 8.0), 2.5, R['trav_dk'])
    gable_roof(op, -2.6, pf - 0.2, 2.6, Y0 + 1.4, P + 10.2, 1.25, R['tile'], PT['tiles'], ov=0.3, axis='y', end_col=R['trav'],
               end_pat=0, fascia=R['tile_dk'])
    pediment(op, -2.6, 2.6, pf - 0.45, Y0 + 1.4, P + 10.2, 1.25, R['trav'], cornice=0.35)
    sphere(op, (0.0, pf - 0.45, P + 11.95), 0.28, R['gilt'], 6, 3, PT['metal'])
    for s in (-1, 1):   # bronze lamps on brackets either side of the gate
        box2(op, s * 3.25 - 0.08, pf - 0.4, P + 3.4, s * 3.25 + 0.08, Y0, P + 3.55, R['bronze'])
        box2(K.em, s * 3.25 - 0.18, pf - 0.55, P + 2.95, s * 3.25 + 0.18, pf - 0.2, P + 3.4, R['bronze'])

    # velaria: chain-coloured cloth on timber poles over the tabernae, sagging, with a scalloped hem (hb_cover)
    vz, vd = P + 3.9, 3.4
    for xa, xb in ((X0 + 0.3, -PX - 0.6), (PX + 0.6, X1 - 0.3)):
        nx, ny = 6, 4
        ya, yb = Y0 - 0.35, Y0 - 0.35 - vd

        def vp(i, j):
            u, v = i / nx, j / ny
            sag = 0.75 * math.sin(math.pi * u) * math.sin(math.pi * v) + 0.12 * math.sin(math.pi * u) + 0.12 * math.sin(math.pi * v)
            return Vector((xa + (xb - xa) * u, ya + (yb - ya) * v, vz - sag))
        for i in range(nx):
            sh = (1.0, 1.0, 1.0) if i % 2 == 0 else (0.8, 0.8, 0.8)
            for j in range(ny):
                poly(K.cover, (vp(i, j), vp(i + 1, j), vp(i + 1, j + 1), vp(i, j + 1)), sh, 0, nrm=(0, 0, 1), jitter=0.0)
            for jj in (0, ny):   # scalloped hems front and back
                pa, pb = vp(i, jj), vp(i + 1, jj)
                poly(K.cover, (pa, pb, (pa + pb) / 2 - Vector((0, 0, 0.5))), mul(sh, 0.9), 0, nrm=FRONT, jitter=0.0)
        for x in (xa, xb):
            for y in (ya, yb):
                cyl(op, (x, y), 0.11, 0.08, P, vz + 0.45, R['oak'], 0, 5)
                sphere(op, (x, y, vz + 0.55), 0.13, R['bronze'], 5, 2)
            rod(op, (x, yb, vz + 0.3), (x + (0.6 if x == xb else -0.6), yb - 1.4, P), 0.03, PAL['rope'], 3, smooth=False)
    # forecourt: amphora stack + standing amphorae, travertine bollards with chain-colour caps, the flag pole
    amphora_stack(op, -8.4, -6.6, P, K.rng)
    for k, (x, y) in enumerate(((-6.9, -7.1), (-6.4, -6.4), (-7.0, -5.9))):
        amphora(op, (x, y, P), (0.08 * (k - 1), 0.05, 1), 1.15, R['amph_dk'] if k == 1 else R['amph'])
    for x in (-2.0, 2.0):
        cyl(op, (x, -7.4), 0.3, 0.26, P, P + 0.8, R['trav'], PT['ashlar'], 7)
        cyl(op, (x, -7.4), 0.3, 0.18, P + 0.8, P + 1.0, acc, 0, 7)
    fx, fy_ = 8.9, -7.0
    box2(op, fx - 0.6, fy_ - 0.6, P, fx + 0.6, fy_ + 0.6, P + 0.8, R['trav'], PT['ashlar'])
    cyl(op, (fx, fy_), 0.15, 0.08, P + 0.8, P + 15.0, R['oak'], 0, 6)
    for z in (P + 9.0, P + 10.2, P + 11.4):   # vexillum phalerae
        disc(op, (fx, fy_ - 0.1, z), FRONT, 0.32, 0.08, R['gilt'], 8, PT['metal'])
    sphere(op, (fx, fy_, P + 15.15), 0.24, R['gilt'], 6, 3, PT['metal'])
    e = empty('flag_pole_top', (fx, fy_, P + 14.8), parent=root)
    e['anim'] = 'chain house flag: the runtime hangs a waving flag here'
    made = K.emit(root, 'office_body')
    made['cover'].name = 'awning'
    made['cover']['anim'] = 'velaria: hb_cover, tinted by the chain colour (COLOR_0 = stripe shade)'
    return root


# =================================================================== 3. MINT (officina monetaria)
def press(K, root, i, xc, yc, z0):
    op = K.op
    box2(op, xc - 0.75, yc - 0.75, z0, xc + 0.75, yc + 0.75, z0 + 0.9, R['trav'], PT['ashlar'])
    for s in (-1, 1):
        box2(op, xc + s * 0.8 - 0.2, yc - 0.28, z0, xc + s * 0.8 + 0.2, yc + 0.28, z0 + 4.2, R['oak'], PT['boards'])
    box2(op, xc - 1.15, yc - 0.38, z0 + 4.2, xc + 1.15, yc + 0.38, z0 + 4.8, R['oak'], PT['boards'])
    box2(op, xc - 0.38, yc - 0.38, z0 + 0.9, xc + 0.38, yc + 0.38, z0 + 1.2, R['bronze'], PT['metal'])
    mb = MB(100 + i)
    zf = z0 + 5.25
    cyl(mb, (xc, yc), 0.17, 0.17, z0 + 1.5, zf + 0.6, R['bronze'], PT['metal'], 6)
    box2(mb, xc - 0.34, yc - 0.34, z0 + 1.3, xc + 0.34, yc + 0.34, z0 + 1.7, R['iron'], PT['metal'])
    beam(mb, (xc - 1.7, yc, zf), (xc + 1.7, yc, zf), 0.17, 0.17, R['iron'], PT['metal'])
    for s in (-1, 1):
        sphere(mb, (xc + s * 1.85, yc, zf), 0.36, R['bronze'], 6, 3, PT['metal'])
    ob = to_object(mb, f'press_{i}', 'hb_opaque', parent=root, origin=(xc, yc, zf))
    ob['anim'] = 'screw press: rotate about local +Y (glTF) +/-0.7 rad and drop 0.3 m on each strike; rate ~ mint volume'
    return ob


def kiln(K, glow, root, i, x, y, z0):
    """Beehive brick kiln, squat flue with the smoke emitter, arched fire-mouth on a stoke-hole box."""
    op = K.op
    r = 2.25
    cyl(op, (x, y), r + 0.2, r, z0, z0 + 2.4, R['brick'], PT['ashlar'], 10, top=False)
    cyl(op, (x, y), r + 0.14, r + 0.14, z0 + 2.2, z0 + 2.55, R['trav'], 0, 10, top=False)
    dome(op, (x, y), z0 + 2.55, r + 0.05, 1.75, R['brick_dk'], PT['ashlar'], segs=10, rings=3)
    cyl(op, (x, y), 0.78, 0.62, z0 + 3.9, z0 + 5.15, R['brick'], PT['ashlar'], 8, top=False)
    cyl(op, (x, y), 0.82, 0.82, z0 + 5.15, z0 + 5.45, R['trav'], 0, 8, top=False)
    cyl(op, (x, y), 0.6, 0.6, z0 + 5.2, z0 + 5.43, R['soot'], 0, 8)
    e = empty(f'chimney_{i}', (x, y, z0 + 5.6), parent=root)
    e['anim'] = 'smoke emitter at the kiln flue; puff rate/darkness ~ mint volume'
    fy = y - r - 0.75
    box2(op, x - 1.25, fy, z0, x + 1.25, y - r + 0.9, z0 + 2.15, R['brick'], PT['ashlar'])
    box2(op, x - 1.4, fy - 0.12, z0 + 2.15, x + 1.4, y - r + 1.0, z0 + 2.4, R['trav'])
    mw, ms = 0.62, z0 + 0.95
    pts = [(x - mw, fy - 0.02, z0 + 0.2), (x + mw, fy - 0.02, z0 + 0.2)] + \
          [(x + mw * math.cos(math.pi * k / 6), fy - 0.02, ms + mw * math.sin(math.pi * k / 6)) for k in range(7)]
    poly(glow, pts, (1.0, 0.45, 0.12), 0, nrm=FRONT, jitter=0.0)
    arch_ring(op, x, fy, ms, mw, R['trav'], 0.24, 0.16, 5)
    box2(glow, x - 0.55, fy - 0.8, z0, x + 0.55, fy, z0 + 0.16, (1.0, 0.5, 0.15), 0, skip=('-z',))


def build_mint():
    root = empty('mint')
    K = Kit(30)
    op = K.op
    glow = MB(31)
    Z0 = 0.5
    X0, X1, Y0, Y1 = -31.0, 40.0, -25.0, 8.0
    plot_base(K, X0, Y0, X1, Y1, Z0)
    rng = random.Random(4)

    # ---- temple of Juno Moneta: the street face (tetrastyle prostyle on a podium; gilt coin in the pediment)
    TX0, TX1, TY0, TY1 = -29.5, -17.5, -20.0, -4.0
    txm = (TX0 + TX1) / 2
    PZ = Z0 + 2.2
    box2(op, TX0, TY0, Z0, TX1, TY1, PZ, R['trav'], PT['ashlar'])
    box2(op, TX0 - 0.2, TY0 - 0.2, PZ - 0.3, TX1 + 0.2, TY1 + 0.2, PZ, R['trav_dk'])
    stairs(op, TX0 + 1.6, TX1 - 1.6, TY0 - 2.8, Z0, PZ, 7, 0.4, R['trav'])
    for s in (-1, 1):   # stair cheeks with bronze tripods
        box2(op, (TX0 if s < 0 else TX1 - 1.6), TY0 - 2.8, Z0, (TX0 + 1.6 if s < 0 else TX1), TY0, PZ, R['trav'], PT['ashlar'])
    colonnade(op, TX0 + 1.1, TX1 - 1.1, TY0 + 1.0, PZ, 6.6, 4, 0.46, R['marble'], cap_col=R['trav'])
    for x in (TX0 + 1.1, TX1 - 1.1):
        column(op, x, TY0 + 3.8, PZ, 6.6, 0.46, R['marble'], cap_col=R['trav'])
    box2(op, TX0 + 0.6, TY0 + 5.6, PZ, TX1 - 0.6, TY1 - 0.4, PZ + 6.6, R['lime'], PT['render'])
    door(K, (txm, TY0 + 5.6, PZ), FRONT, 2.0, 4.2, col=R['bronze'], frame=R['trav'], step=False)
    EZ = PZ + 6.6
    box2(op, TX0 + 0.3, TY0 + 0.3, EZ, TX1 - 0.3, TY1, EZ + 1.0, R['trav'])
    box2(op, TX0 + 0.25, TY0 + 0.25, EZ + 0.3, TX1 - 0.25, TY1 + 0.05, EZ + 0.7, R['red_ochre'])   # painted frieze
    gable_roof(op, TX0 + 0.3, TY0 + 0.3, TX1 - 0.3, TY1, EZ + 1.0, 2.3, R['tile'], PT['tiles'], ov=0.35, axis='y', end_col=R['lime'],
               end_pat=PT['render'], fascia=R['tile_dk'])
    pediment(op, TX0 + 0.3, TX1 - 0.3, TY0 + 0.05, TY1, EZ + 1.0, 2.3, R['trav'], cornice=0.4)
    disc(op, (txm, TY0 + 0.2, EZ + 1.85), FRONT, 0.75, 0.18, R['gilt'], 12, PT['metal'])
    for p in ((txm, TY0 - 0.2, EZ + 3.8), (TX0 + 0.1, TY0 - 0.2, EZ + 1.2), (TX1 - 0.1, TY0 - 0.2, EZ + 1.2)):
        sphere(op, p, 0.42, R['gilt'], 6, 3, PT['metal'])

    # ---- officina: brick hall, travertine-ringed arcade, a press in each of three arches, a strongroom in the fourth
    HX0, HX1, HY0, HY1 = -13.0, 15.0, -14.0, -1.0
    SP, HT = Z0 + 4.3, Z0 + 9.4
    arcs = arcade(op, HX0, HX1, HY0, 1.0, Z0, HT, 4, 1.7, SP, R['brick'], PT['ashlar'], intr=R['brick_dk'])
    for xc, r in arcs:
        arch_ring(op, xc, HY0, SP, r, R['trav'], 0.5, 0.3, 7)
        rwin(K, (xc, HY0, Z0 + 8.4), 0.75, 0.8, arch=True, shutters=False)
    for k in range(5):   # travertine imposts on the piers
        px = HX0 + k * (1.7 + 2 * arcs[0][1])
        box2(op, px - 0.08, HY0 - 0.18, SP - 0.3, px + 1.78, HY0 + 0.2, SP, R['trav'])
    course(op, HX0, HY0, HX1, HY1, Z0 + 7.4)
    box2(op, HX0, HY0 + 1.0, Z0, HX1, HY1, HT, R['brick'], PT['ashlar'], skip=('-y',))
    poly(op, ((HX0, HY1 - 0.4, Z0), (HX1, HY1 - 0.4, Z0), (HX1, HY1 - 0.4, HT), (HX0, HY1 - 0.4, HT)), R['brick_dk'], PT['ashlar'], nrm=FRONT)
    poly(op, ((HX0, HY0, Z0 + 0.01), (HX1, HY0, Z0 + 0.01), (HX1, HY1, Z0 + 0.01), (HX0, HY1, Z0 + 0.01)), mul(R['basalt'], 0.7),
         PT['cobble'], nrm=(0, 0, 1))
    gable_roof(op, HX0, HY0, HX1, HY1, HT, 2.4, R['tile'], PT['tiles'], ov=0.6, axis='x', end_col=R['brick'], end_pat=PT['ashlar'],
               fascia=R['tile_dk'])
    for i in range(3):
        xc = arcs[i][0]
        press(K, root, i, xc, HY0 + 0.55, Z0)
        box2(op, xc + 1.3, HY0 + 1.6, Z0, xc + 2.3, HY0 + 3.0, Z0 + 0.9, R['oak'], PT['planks_x'])
        cyl(op, (xc + 1.8, HY0 + 2.3), 0.4, 0.4, Z0 + 0.9, Z0 + 1.15, R['gilt'], PT['metal'], 7)
    for xc, r in arcs:   # oil lamps hung in the vaults
        box2(K.em, xc - 0.16, HY0 + 1.6, SP + r - 1.4, xc + 0.16, HY0 + 1.92, SP + r - 1.0, R['bronze'])
    xc = arcs[3][0]
    box2(op, xc - 1.6, HY0 + 1.5, Z0, xc + 1.6, HY0 + 3.3, Z0 + 1.6, R['bronze'], PT['metal'])   # strong chest
    for k in range(4):
        cyl(op, (xc - 1.2 + k * 0.8, HY0 + 2.4), 0.3, 0.3, Z0 + 1.6, Z0 + 1.9 + 0.12 * k, R['gilt'], PT['metal'], 7)
    # forecourt: coin crates, amphorae, a bronze statue of Moneta on a base
    for k, (x, y) in enumerate(((-9.0, -18.0), (-7.6, -18.4), (6.0, -18.2))):
        crate(op, (x, y, Z0), 1.0, R['oak'], 0.2 * k)
    amphora_stack(op, 2.0, -18.6, Z0, rng, (3, 2))
    box2(op, -14.0, -21.0, Z0, -12.4, -19.4, Z0 + 1.8, R['trav'], PT['ashlar'])
    lathe(op, (-13.2, -20.2), [(0.45, Z0 + 1.8), (0.5, Z0 + 2.6), (0.32, Z0 + 3.6), (0.22, Z0 + 3.9), (0.0, Z0 + 4.2)], R['bronze'], PT['metal'], 7)

    # ---- kiln yard: three beehive kilns with squat flues (smoke) and glowing mouths (furnace_glow)
    for i, x in enumerate((18.0, 23.6, 29.2)):
        kiln(K, glow, root, i, x, -17.5, Z0)
    for k in range(7):   # cordwood stack
        y = -11.0 + (k % 4) * 0.5 + (0.25 if k >= 4 else 0)
        z = Z0 + 0.25 + (0.45 if k >= 4 else 0)
        rod(op, (17.5, y, z), (21.5, y, z), 0.24, PAL['timber'], 5, cap=True)
    gl = to_object(glow, 'furnace_glow', 'hb_emissive', parent=root)
    gl['anim'] = 'kiln mouths + coal beds: emissive strength ~ mint volume (flicker)'

    # ---- Barbegal-style overshot wheel fed by a short aqueduct (axle along Blender Y like today's contract)
    wc = Vector((31.5, -6.0, Z0 + 3.9))
    R_, W_ = 3.6, 1.3
    wheel = MB(60)
    n = 16
    for yy in (wc.y - W_ / 2, wc.y + W_ / 2):
        rim = [wc + Vector((R_ * math.cos(2 * math.pi * k / n), yy - wc.y, R_ * math.sin(2 * math.pi * k / n))) for k in range(n)]
        for k in range(n):
            beam(wheel, rim[k], rim[(k + 1) % n], 0.24, 0.3, R['oak'], up=Vector((0, 1, 0)))
        for k in range(0, n, 2):
            beam(wheel, Vector((wc.x, yy, wc.z)), rim[k], 0.2, 0.2, PAL['timber'], up=Vector((0, 1, 0)))
    for k in range(n):
        a = 2 * math.pi * (k + 0.5) / n
        d = Vector((math.cos(a), 0, math.sin(a)))
        t_ = Vector((-math.sin(a), 0, math.cos(a)))
        box(wheel, wc + d * (R_ - 0.35), (0.75, W_, 0.1), PAL['timber'], PT['boards'], axes=(d, Vector((0, 1, 0)), t_))
    rod(wheel, wc - Vector((0, W_ / 2 + 0.7, 0)), wc + Vector((0, W_ / 2 + 1.6, 0)), 0.3, R['iron'], 8, cap=True)
    wob = to_object(wheel, 'wheel', 'hb_opaque', parent=root, origin=wc)
    wob['anim'] = 'waterwheel: rotate about local Z (glTF; the axle, Blender Y); overshot - turns with the flume; speed ~ mint volume'
    for s in (-1, 1):   # axle bearings
        box2(op, wc.x - 0.6, wc.y + s * (W_ / 2 + 0.55) - 0.35, Z0, wc.x + 0.6, wc.y + s * (W_ / 2 + 0.55) + 0.35, wc.z - 0.25,
             R['trav'], PT['ashlar'])
    # wheel pit + tailrace (water in a travertine trough, running left under the yard)
    box2(op, wc.x - 4.6, wc.y - 1.3, Z0, wc.x + 4.2, wc.y - 1.05, Z0 + 0.45, R['trav'])
    box2(op, wc.x - 4.6, wc.y + 1.05, Z0, wc.x + 4.2, wc.y + 1.3, Z0 + 0.45, R['trav'])
    poly(op, ((wc.x - 4.6, wc.y - 1.05, Z0 + 0.2), (wc.x + 4.2, wc.y - 1.05, Z0 + 0.2), (wc.x + 4.2, wc.y + 1.05, Z0 + 0.2),
              (wc.x - 4.6, wc.y + 1.05, Z0 + 0.2)), R['water'], 0, nrm=(0, 0, 1), jitter=0.0)
    # aqueduct: brick arches with travertine imposts carrying the flume onto the wheel's crown
    AX0, AX1, AZ = wc.x + 0.9, X1, Z0 + 8.0
    arcade(op, AX0, AX1, wc.y - 0.65, 1.3, Z0, AZ, 2, 1.1, Z0 + 4.2, R['brick'], PT['ashlar'], intr=R['brick_dk'], back=True,
           keystone=R['trav'])
    for yy in (wc.y - 0.65, wc.y + 0.45):
        box2(op, AX0 - 0.6, yy, AZ, AX1, yy + 0.2, AZ + 0.6, R['trav'])
    poly(op, ((AX0 - 0.6, wc.y - 0.45, AZ + 0.4), (AX1, wc.y - 0.45, AZ + 0.4), (AX1, wc.y + 0.45, AZ + 0.4), (AX0 - 0.6, wc.y + 0.45, AZ + 0.4)),
         R['water'], 0, nrm=(0, 0, 1), jitter=0.0)
    poly(op, ((AX0 - 0.6, wc.y - 0.42, AZ + 0.42), (AX0 - 0.6, wc.y + 0.42, AZ + 0.42), (wc.x + 0.1, wc.y + 0.42, wc.z + R_ + 0.1),
              (wc.x + 0.1, wc.y - 0.42, wc.z + R_ + 0.1)), R['water_lt'], 0, nrm=(1, 0, 1), jitter=0.0)
    # mill house behind the wheel (gearing to the presses)
    box2(op, 25.5, -2.6, Z0, 38.5, 5.0, Z0 + 6.0, R['brick'], PT['ashlar'])
    course(op, 25.5, -2.6, 38.5, 5.0, Z0 + 3.2, h=0.22, proud=0.1)
    for x in (27.0, 36.5):
        rwin(K, (x, -2.6, Z0 + 4.4), 0.7, 0.8, arch=True, shutters=False)
    gable_roof(op, 25.5, -2.6, 38.5, 5.0, Z0 + 6.0, 1.6, R['tile'], PT['tiles'], ov=0.5, axis='x', end_col=R['brick'], fascia=R['tile_dk'])
    # precinct wall on the land sides
    for x in (TX0 - 1.4, TX1 + 1.4):   # cypresses flanking the temple
        cypress(op, x, TY1 - 2.0, Z0, 7.5)
    for (a, b) in (((X0, Y1 - 0.6), (X1, Y1)), ((X0, Y0 + 4.0), (X0 + 0.6, Y1))):
        box2(op, a[0], a[1], Z0, b[0], b[1], Z0 + 1.6, R['brick'], PT['ashlar'])
        box2(op, a[0] - 0.1, a[1] - 0.1, Z0 + 1.6, b[0] + 0.1, b[1] + 0.1, Z0 + 1.85, R['trav'])
    K.emit(root, 'mint_body')
    return root


# =================================================================== 4. BURN (fire tower on the islet)
def build_burn():
    root = empty('burn')
    K = Kit(70)
    op = K.op
    rng = random.Random(7)
    # islet: a low rock table with tumbled boulders
    cyl(op, (0, 0), 9.6, 8.2, -2.6, 0.6, R['rock'], PT['rock'], 11, rot=0.2)
    for k in range(11):
        a = 2 * math.pi * k / 11 + rng.uniform(-0.2, 0.2)
        rr = rng.uniform(8.0, 9.6)
        c = (rr * math.cos(a), rr * math.sin(a))
        s = rng.uniform(1.3, 2.4)
        lathe(op, c, [(s, -2.4), (s * 1.05, -0.4 + rng.uniform(0, 0.6)), (s * 0.6, 0.4 + rng.uniform(0, 0.8)), (0.0, 0.8 + rng.uniform(0, 0.8))],
              R['rock_dk'] if k % 3 == 0 else R['rock'], PT['rock'], 6, smooth=False, rot=rng.uniform(0, 1))
    # stepped travertine crepidoma + landing stair to the sea on the front
    box2(op, -6.4, -6.4, 0.6, 6.4, 6.4, 1.3, R['trav'], PT['ashlar'])
    box2(op, -5.6, -5.6, 1.3, 5.6, 5.6, 2.0, R['trav'], PT['ashlar'])
    stairs(op, -1.6, 1.6, -9.2, -0.6, 0.6, 4, 0.7, R['trav'])
    # two-tier brick fire tower (a little pharos): travertine courses, a gallery, arched lit windows
    cyl(op, (0, 0), 4.2, 3.9, 2.0, 7.2, R['trav'], PT['ashlar'], 16, top=False)
    cyl(op, (0, 0), 4.3, 4.3, 2.0, 2.7, R['trav_dk'], PT['ashlar'], 16, top=False)
    cyl(op, (0, 0), 4.0, 4.6, 7.0, 7.6, R['trav'], 0, 16)
    cyl(op, (0, 0), 3.2, 3.0, 7.6, 11.6, R['brick'], PT['ashlar'], 14, top=False)
    cyl(op, (0, 0), 3.0, 3.8, 11.4, 12.1, R['trav'], 0, 14)
    for k in range(16):   # gallery parapet posts
        a = 2 * math.pi * (k + 0.5) / 16
        box2(op, 4.35 * math.cos(a) - 0.1, 4.35 * math.sin(a) - 0.1, 7.6, 4.35 * math.cos(a) + 0.1, 4.35 * math.sin(a) + 0.1, 8.4, R['trav'],
             skip=('-z',))
    door(K, (0.0, -4.05, 2.0), FRONT, 1.4, 2.5, col=R['bronze'], frame=R['trav'], step=False)
    for k in range(6):
        a = -math.pi / 2 + 2 * math.pi * (k + 0.5) / 6
        rwin(K, (3.92 * math.cos(a), 3.92 * math.sin(a), 5.0), 0.75, 1.1, arch=True, n=(math.cos(a), math.sin(a), 0), shutters=False)
        a2 = a + math.pi / 6
        window(K, (3.05 * math.cos(a2), 3.05 * math.sin(a2), 9.4), (math.cos(a2), math.sin(a2), 0), 0.6, 0.95, frame=R['trav'], arch=True,
               lit=0.9, warm=0.9, sill=False)
    # bronze brazier on a drum: wide bowl, rim lugs, four bronze brackets
    cyl(op, (0, 0), 2.2, 2.0, 12.1, 13.0, R['bronze'], PT['metal'], 12, top=False)
    bz = 13.0
    lathe(op, (0, 0), [(1.6, bz), (3.4, bz + 0.5), (4.5, bz + 1.4), (4.8, bz + 2.0), (4.8, bz + 2.3), (4.35, bz + 2.35), (3.0, bz + 1.8),
                       (0.0, bz + 1.6)], R['bronze'], PT['metal'], 16, smooth=True, cap=False)
    for k in range(4):
        a = 2 * math.pi * k / 4 + math.pi / 4
        beam(op, (3.3 * math.cos(a), 3.3 * math.sin(a), 11.9), (4.4 * math.cos(a), 4.4 * math.sin(a), bz + 1.7), 0.35, 0.35, R['bronze'], PT['metal'])
        sphere(op, (4.7 * math.cos(a), 4.7 * math.sin(a), bz + 2.45), 0.3, R['gilt'], 6, 3, PT['metal'])
    fire = MB(71)
    fc = Vector((0, 0, bz + 1.6))
    lathe(fire, fc, [(3.9, fc.z + 0.35), (2.2, fc.z + 0.85), (0.0, fc.z + 1.0)], (1.0, 0.4, 0.1), 0, 12, smooth=False)
    flames(fire, fc + Vector((0, 0, 0.6)), random.Random(3), 11, 3.0, 4.6, 9.0, col=(1.0, 0.62, 0.2))
    fob = to_object(fire, 'fire_core', 'hb_emissive', parent=root, origin=fc)
    fob['anim'] = 'flames: scale (y up) and emissive ~ burn volume; flicker'
    empty('fire_emitter', (fc.x, fc.y, fc.z + 2.6), parent=root)['anim'] = 'sparks / embers from the brazier'
    empty('smoke_emitter', (fc.x, fc.y, fc.z + 9.0), parent=root)['anim'] = 'smoke column above the flames'
    # bronze mooring rings + a votive altar at the landing
    box2(op, 3.0, -7.4, 0.6, 4.6, -6.0, 1.9, R['trav'], PT['ashlar'])
    box2(op, 2.85, -7.55, 1.9, 4.75, -5.85, 2.15, R['trav_dk'])
    K.emit(root, 'burn_body')
    return root


# ------------------------------------------------------------------ preview materials (from lineup.py)
reset_scene()
scene = bpy.context.scene
node, link, sep = ncm.node, ncm.link, ncm.sep
ncm.build_kit_material(); ncm.build_glass_material()
EM = ncm.build_glow_material('PV_em', lin('#3B3A33'), lin('#FF9A40'), 'LAMP_K')


def pv_cover():
    m = ncm.new_mat('PV_cover'); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    at = node(nt, 'ShaderNodeAttribute', attribute_name='Col'); oi = node(nt, 'ShaderNodeObjectInfo')
    mm = node(nt, 'ShaderNodeMix'); mm.data_type = 'RGBA'; mm.blend_type = 'MULTIPLY'
    ncm.sock(mm, 'Factor_Float').default_value = 1.0
    nt.links.new(at.outputs['Color'], ncm.sock(mm, 'A_Color')); nt.links.new(oi.outputs['Color'], ncm.sock(mm, 'B_Color'))
    nt.links.new(ncm.sock(mm, 'Result_Color', out=True), p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.8
    m.use_backface_culling = False
    return m


COVER = pv_cover()
MIRROR = ncm.new_mat('PV_mirror'); _mp = MIRROR.node_tree.nodes['Principled BSDF']
_mp.inputs['Base Color'].default_value = (*R['bronze'], 1); _mp.inputs['Metallic'].default_value = 0.9; _mp.inputs['Roughness'].default_value = 0.25
CREST = {}


def crest_mat(chain):
    if chain in CREST:
        return CREST[chain]
    from PIL import Image
    png = os.path.join(SCR, f'crest-{chain}.png')
    subprocess.run(['rsvg-convert', '-w', '384', '-h', '384', '--keep-aspect-ratio', os.path.join(_ROOT, 'public', 'chains', f'{chain}.svg'),
                    '-o', png], check=True)
    im = Image.open(png).convert('RGBA')
    cc = tuple(int(round(255 * (x ** (1 / 2.2)))) for x in lin(CHAINS[chain]))
    bg = Image.new('RGBA', (448, 448), (*cc, 255))
    bg.alpha_composite(im, ((448 - im.width) // 2, (448 - im.height) // 2))
    bg.save(png)
    m = ncm.new_mat('PV_crest_' + chain); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tex = node(nt, 'ShaderNodeTexImage'); tex.image = bpy.data.images.load(png); tex.extension = 'CLIP'
    nt.links.new(tex.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = 0.6
    CREST[chain] = m
    return m


def dress(root, chain=None):
    for o in descendants(root):
        if o.type != 'MESH' or not o.data.materials:
            continue
        if 'Color' in o.data.color_attributes and 'Col' not in o.data.color_attributes:   # glTF import names COLOR_0 "Color"
            o.data.color_attributes['Color'].name = 'Col'
        nm = o.data.materials[0].name.split('.')[0]
        if nm == 'hb_opaque':
            o.data.materials[0] = ncm.M['kit']
        elif nm == 'hb_window':
            o.data.materials[0] = ncm.M['window']
        elif nm in ('hb_emissive', 'hb_fire'):
            o.data.materials[0] = EM
        elif nm == 'hb_mirror':
            o.data.materials[0] = MIRROR
        elif nm == 'hb_cover':
            o.data.materials[0] = COVER
            o.color = (*lin(CHAINS.get(chain, '#C2453A')), 1)
        elif nm == 'hb_crest':
            o.data.materials[0] = crest_mat(chain or 'ethereum')


# ------------------------------------------------------------------ world (from lineup.py)
def add_light(name, kind, **kw):
    ld = bpy.data.lights.new(name, kind); ob = bpy.data.objects.new(name, ld); scene.collection.objects.link(ob)
    for k, v in kw.items():
        setattr(ld, k, v)
    return ob


def aim(ob, az, el):
    az, el = math.radians(az), math.radians(el)
    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    ob.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


sun = add_light('sun', 'SUN', angle=math.radians(0.8))
fill = add_light('fill', 'SUN', angle=math.radians(10)); fill.data.use_shadow = False; fill.data.specular_factor = 0.0
wt = bpy.data.worlds.new('W'); scene.world = wt
try:
    wt.use_nodes = True
except Exception:
    pass
wnt = wt.node_tree; bg = wnt.nodes['Background']
tc = node(wnt, 'ShaderNodeTexCoord'); _, _, wz = sep(wnt, tc.outputs['Generated'])
ramp = node(wnt, 'ShaderNodeValToRGB'); link(wnt, wz.lmap(-0.1, 0.9, 0, 1), ramp.inputs['Fac'])
link(wnt, ramp.outputs['Color'], bg.inputs['Color'])
scene.render.engine = 'BLENDER_EEVEE'
ee = scene.eevee
ee.taa_render_samples = SAMPLES; ee.use_raytracing = True; ee.ray_tracing_method = 'SCREEN'
ee.use_shadows = True; ee.shadow_ray_count = 2; ee.shadow_step_count = 10; ee.use_fast_gi = True; ee.fast_gi_distance = 10.0
scene.view_settings.view_transform = 'AgX'
try:
    scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass
cng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree'); scene.compositing_node_group = cng
cng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
rl = cng.nodes.new('CompositorNodeRLayers')
gl = cng.nodes.new('CompositorNodeGlare'); gl.inputs['Type'].default_value = 'Bloom'
hs = cng.nodes.new('CompositorNodeHueSat'); hs.inputs['Saturation'].default_value = 1.08
go = cng.nodes.new('NodeGroupOutput')
cng.links.new(rl.outputs['Image'], gl.inputs['Image']); cng.links.new(gl.outputs['Image'], hs.inputs['Image'])
cng.links.new(hs.outputs['Image'], go.inputs[0])
scene.render.use_compositing = True
POINTS = []


def set_state(st):
    win = ncm.M['window'].node_tree.nodes['WIN_K']; lamp = EM.node_tree.nodes['LAMP_K']
    if st == 'golden':
        sun.data.energy = 5.2; sun.data.color = lin('#FFB070'); aim(sun, YAW - 70 - 90, 16)
        fill.data.energy = 0.35; fill.data.color = lin('#7F98D6'); aim(fill, YAW + 90, 35)
        ncm.set_ramp(ramp, [(0, lin('#C9A89A')), (0.3, lin('#8C9AC0')), (1, lin('#5470A6'))]); bg.inputs['Strength'].default_value = 0.62
        win.outputs[0].default_value = 1.2; lamp.outputs[0].default_value = 6.0
        gl.inputs['Strength'].default_value = 0.2; gl.inputs['Threshold'].default_value = 1.3
        scene.view_settings.exposure = 0.25
        for p in POINTS:
            p.data.energy = p['e'] * 0.15
    else:
        sun.data.energy = 1.1; sun.data.color = lin('#A9BCFF'); aim(sun, YAW - 70 - 90, 32)
        fill.data.energy = 0.18; fill.data.color = lin('#5A6FB0'); aim(fill, YAW + 90, 35)
        ncm.set_ramp(ramp, [(0, lin('#2C3F6E')), (0.35, lin('#1C2B55')), (1, lin('#0B1330'))]); bg.inputs['Strength'].default_value = 1.2
        win.outputs[0].default_value = 6.0; lamp.outputs[0].default_value = 30.0
        gl.inputs['Strength'].default_value = 0.6; gl.inputs['Threshold'].default_value = 0.8
        scene.view_settings.exposure = 0.35
        for p in POINTS:
            p.data.energy = p['e']


def surface(name, x0, y0, x1, y1, z, col, pat=6, mat=None):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))]
    bm.faces.new(vs)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    if mat is None:
        a = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        for d in a.data:
            d.color = (*col, pat / 16)
        me.materials.append(ncm.M['kit'])
    else:
        me.materials.append(mat)
    return ob


SEA = ncm.new_mat('PV_sea'); _p = SEA.node_tree.nodes['Principled BSDF']
_p.inputs['Base Color'].default_value = (*lin('#1F5566'), 1); _p.inputs['Roughness'].default_value = 0.12

BUILD = {'houses': build_houses, 'houses2': lambda: build_houses(True), 'office': build_office, 'mint': build_mint, 'burn': build_burn}
FOOT = {'houses': (27, 15), 'houses2': (27, 15), 'office': (20, 16), 'mint': (71, 33), 'burn': (22, 22)}
LABEL = {'houses': 'Town houses: insula + domus', 'office': 'Harbour office: Ethereum (horrea)', 'mint': 'The Mint: officina monetaria',
         'burn': 'The Burn: fire tower'}


def stage(kind, at, ground=True):
    root = BUILD[kind]()
    root.location = at
    dress(root, 'ethereum' if kind == 'office' else None)
    x, y = at[0], at[1]
    w, d = FOOT[kind]
    if ground:
        if kind == 'burn':
            surface('sea_' + kind, x - 60, y - 60, x + 60, y + 60, -2.4, None, mat=SEA)
        else:
            surface('land_' + kind, x - w / 2 - 14, y - d / 2 - 4, x + w / 2 + 14, y + d / 2 + 14, -0.02, PAL['grass'], 6)
            surface('quay_' + kind, x - w / 2 - 14, y - d / 2 - 14, x + w / 2 + 14, y - d / 2 - 4, -0.02, PAL['quay'], 4)
            surface('sea_' + kind, x - w / 2 - 60, y - d / 2 - 80, x + w / 2 + 60, y - d / 2 - 14, -2.4, None, mat=SEA)
    for o in descendants(root):   # preview flag at flag_pole_top
        if o.name.split('.')[0] == 'flag_pole_top':
            bpy.context.view_layer.update()
            p0 = o.matrix_world.translation
            bm = bmesh.new()
            vs = [bm.verts.new(p0 + Vector(v)) for v in ((0, 0, 0), (3.6, 0.3, -0.1), (3.6, 0.3, -2.5), (0, 0, -2.4))]
            f = bm.faces.new(vs)
            uvl = bm.loops.layers.uv.new('UVMap')
            for lp, uv in zip(f.loops, ((0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0))):
                lp[uvl].uv = uv
            me = bpy.data.meshes.new('pv_flag'); bm.to_mesh(me); bm.free()
            fo = bpy.data.objects.new('pv_flag', me); scene.collection.objects.link(fo)
            me.materials.append(crest_mat('ethereum'))
    for o in descendants(root):   # local lights at fires for the night frame
        if o.name.split('.')[0] in ('fire_core', 'furnace_glow'):
            bpy.context.view_layer.update()
            c = sum((o.matrix_world @ Vector(b) for b in o.bound_box), Vector()) / 8
            L = add_light('pt_' + o.name, 'POINT', color=lin('#FF9A4A'), shadow_soft_size=2.0)
            L.location = c + Vector((0, -2.0, 1.0)); L['e'] = 30000.0 if 'fire' in o.name else 12000.0
            POINTS.append(L)
    bpy.context.view_layer.update()
    pts = []
    for o in descendants(root):
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(b) for b in o.bound_box]
    return root, pts


def camera(fov=24.0):
    cd = bpy.data.cameras.new('cam'); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(fov); cd.clip_start = 1; cd.clip_end = 6000
    co = bpy.data.objects.new('cam', cd); scene.collection.objects.link(co); scene.camera = co
    co.rotation_euler = (math.radians(90 - PITCH), 0, math.radians(YAW))
    return co


def fit(cam, pts, margin=0.05, iters=10):
    fwd = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    c = sum(pts, Vector()) / len(pts)
    dist = 300.0
    for _ in range(iters):
        cam.location = c - fwd * dist
        bpy.context.view_layer.update()
        q = [world_to_camera_view(scene, cam, p) for p in pts]
        xs = [p.x for p in q]; ys = [p.y for p in q]
        k = max((max(xs) - min(xs)) / (1 - 2 * margin), (max(ys) - min(ys)) / (1 - 2 * margin))
        mx = (max(xs) + min(xs)) / 2 - 0.5; my = (max(ys) + min(ys)) / 2 - 0.5
        aspect = scene.render.resolution_x / scene.render.resolution_y
        Rm = cam.rotation_euler.to_matrix()
        half_h = math.tan(cam.data.angle_y / 2) * dist
        c = c + (Rm @ Vector((1, 0, 0))) * mx * 2 * half_h * aspect + (Rm @ Vector((0, 1, 0))) * my * 2 * half_h
        dist *= k
    cam.location = c - fwd * dist


def render(path):
    scene.render.resolution_percentage = PCT
    scene.render.filepath = path
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)


def clear_all():
    for o in list(bpy.data.objects):
        if o.type != 'LIGHT' or o.name.startswith('pt_'):
            bpy.data.objects.remove(o, do_unlink=True)
    POINTS.clear()


from PIL import Image, ImageDraw, ImageFont
FONT = '/usr/share/fonts/noto/NotoSerif-Bold.ttf'
KINDS = ['houses', 'office', 'mint', 'burn']

if MODE in ('sheet', 'both'):
    clear_all()
    cam = camera()
    scene.render.resolution_x, scene.render.resolution_y = 800, 500
    staged = {k: stage(k, (i * 600.0, 0.0, 0.0)) for i, k in enumerate(KINDS)}
    for st in STATES:
        set_state(st)
        W_, H_ = int(800 * PCT / 100), int(500 * PCT / 100)
        sheet = Image.new('RGB', (W_ * 2, H_ * 2), (20, 24, 30))
        d = ImageDraw.Draw(sheet)
        f = ImageFont.truetype(FONT, max(14, W_ // 34))
        for j, k in enumerate(KINDS):
            fit(cam, staged[k][1], margin=0.06)
            p = os.path.join(SCR, f'tile-{k}-{st}.png')
            render(p)
            ox, oy = (j % 2) * W_, (j // 2) * H_
            sheet.paste(Image.open(p).convert('RGB'), (ox, oy))
            t = LABEL[k] + f'  ·  {tri_count(descendants(staged[k][0]))} tris'
            d.text((ox + 13, oy + 11), t, font=f, fill=(10, 14, 20))
            d.text((ox + 12, oy + 10), t, font=f, fill=(250, 242, 226))
        sheet.save(os.path.join(OUT, f'sheet-{st}.jpg'), quality=90)
        print('SHEET', os.path.join(OUT, f'sheet-{st}.jpg'))
    for k in KINDS:
        print('TRIS', k, tri_count(descendants(staged[k][0])))

if MODE in ('lineup', 'both'):
    clear_all()
    cam = camera()
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    # the Pharos at true scale on its headland, the town on the quay in front, the Burn on its islet off the quay
    bpy.ops.import_scene.gltf(filepath=PHAROS)
    ph = [o for o in scene.objects if o.parent is None and o.type in ('EMPTY', 'MESH') and not o.name.startswith('cam')]
    proot = bpy.data.objects.new('pharos', None); scene.collection.objects.link(proot)
    for o in ph:
        o.parent = proot
    proot.location = (118.0, 44.0, 0.0)
    dress(proot)
    allpts = []
    for o in descendants(proot):
        if o.type == 'MESH':
            bpy.context.view_layer.update()
            allpts += [o.matrix_world @ Vector(b) for b in o.bound_box]
    # Pharos island off the town's right, joined by a causeway (a nod to the Heptastadion)
    surface('pharos_isle', 72, -2, 164, 90, 0.0, R['pave'], 4)
    surface('causeway', 90, 32, 101, 40, 0.02, PAL['quay'], 4)
    surface('land', -400, -30, 90, 400, -0.02, PAL['grass'], 6)
    surface('quay', -400, -42, 90, -30, -0.02, PAL['quay'], 4)
    surface('quay_r', 90, -42, 101, 32, -0.02, PAL['quay'], 4)
    surface('sea', -400, -400, 400, -42, -2.4, None, mat=SEA)
    surface('sea_r', 101, -42, 400, 400, -2.4, None, mat=SEA)
    for k, at in (('mint', (-52.0, -9.0, 0.0)), ('office', (2.0, -21.0, 0.0)), ('houses', (30.0, -21.0, 0.0)), ('burn', (40.0, -66.0, 0.0)),
                  ('houses2', (59.0, -21.0, 0.0)), ('houses2', (3.0, -2.0, 0.0)), ('houses', (32.0, -2.0, 0.0)), ('houses2', (61.0, -2.0, 0.0))):
        pts = stage(k, at, ground=False)[1]
        if k in ('mint', 'office', 'burn'):
            allpts += pts
    for j, y in enumerate((19.0, 39.0, 59.0)):   # the residential quarter climbing behind the quay
        for i, x in enumerate((-76.0, -47.0, -18.0, 11.0, 40.0, 69.0)):
            if y > 19.0 and x > 60.0:
                continue
            stage('houses2' if (i + j) % 2 else 'houses', (x + (j % 2) * 6.0, y, 0.0), ground=False)
    trees = MB(5)
    rng = random.Random(9)
    for k in range(14):
        stone_pine(trees, rng.uniform(-90, 60), rng.uniform(28, 70), 0.0, rng.uniform(8.0, 11.0), rng)
    for (x, y) in ((17.0, -13.0), (46.0, 9.0), (75.0, -14.0), (16.0, 14.0), (-4.0, 12.0), (79.0, 8.0), (-8.0, -12.0)):
        stone_pine(trees, x, y, 0.0, rng.uniform(8.0, 11.0), rng)
    for x in (88.0, 90.5, 93.0):
        cypress(trees, x, -12.0, 0.0, 9.0)
    dress(to_object(trees, 'trees', 'hb_opaque'))
    for st in STATES:
        set_state(st)
        fit(cam, allpts, margin=0.04)
        p = os.path.join(SCR, f'lineup-{st}.png')
        render(p)
        Image.open(p).convert('RGB').save(os.path.join(OUT, f'lineup-{st}.jpg'), quality=90)
        print('LINEUP', os.path.join(OUT, f'lineup-{st}.jpg'))
