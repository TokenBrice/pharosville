"""Classical-town exploration, direction C - "Timeless Mediterranean vernacular" style frames (exploration only).

    blender -b --factory-startup -P agents/2026-10-15-classical-town/C-vernacular/frames.py -- \
        [--mode sheet|lineup|both] [--state golden|night|both] [--samples 32] [--pct 100]

Builds four subjects with the civic kit primitives (scripts/harbour/blender/civic/cv_lib.py) and renders them with the
preview look of scripts/harbour/blender/civic/lineup.py (style C kit material, AgX, golden-hour sun):
  houses  - a pair of stucco town houses (whitewash cube with roof terrace + pergola, ochre house with a Roman-tile hip roof)
  office  - the Ethereum harbour office as a three-arched quay loggia (crest in a carved frame, chain-coloured velarium)
  mint    - a fortified arsenal / khan: crenellated walls, domed hall, arched forge bays, domed flues, waterwheel
  burn    - a round stone beacon tower on its islet with an open iron fire basket
Nothing under scripts/ or src/ is modified; the kit modules are only imported.
"""
import sys, os, math, random, subprocess
sys.dont_write_bytecode = True
CDIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(CDIR, '..', '..', '..'))
CIVIC = os.path.join(ROOT, 'scripts', 'harbour', 'blender', 'civic')
sys.path.insert(0, CIVIC)
sys.path.insert(1, os.path.join(CIVIC, '..', 'island'))
import bpy, bmesh
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
from cv_lib import *
from cv_works import press_frame, press_ram, ingot_stack, coin_crate, rock_blob
import nl_common as ncm

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(n, d):
    return ARGV[ARGV.index(n) + 1] if n in ARGV else d


MODE = arg('--mode', 'both')
STATES = ['golden', 'night'] if arg('--state', 'golden') == 'both' else [arg('--state', 'golden')]
SAMPLES = int(arg('--samples', '32'))
PCT = int(arg('--pct', '100'))
YAW, PITCH = float(arg('--yaw', '-24')), float(arg('--pitch', '34'))
ONLY = [k for k in arg('--only', '').split(',') if k]
OUT = CDIR
SCR = os.path.join(ROOT, 'outputs', 'classical-town', 'C')
os.makedirs(SCR, exist_ok=True)
PHAROS = os.path.join(ROOT, 'outputs', 'harbour', 'pharos', 'lighthouse.raw.glb')

# ------------------------------------------------------------------ vernacular palette (on top of the civic PAL)
for k, v in {
    'wash': '#F2EEE4', 'wash_shade': '#E2DCCF', 'ochre_wash': '#E2B068', 'sienna': '#C07548', 'rose': '#DDA595',
    'tile': '#8F6050', 'tile_dark': '#6B4538', 'tile_light': '#BC7451', 'lime': '#E9E1CF', 'tufa': '#D7C29A',
    'sh_blue': '#2F6F9A', 'sh_green': '#4C7A52', 'sh_teal': '#2F8582', 'sh_ox': '#7E2F24',
    'bougain': '#C2306E', 'bougain2': '#DA4F8C', 'vine': '#5E7F35', 'vine2': '#7A9845', 'terracotta': '#B9663C',
    'plaster_dome': '#EDE6D6', 'basalt': '#5D5753',
}.items():
    PAL[k] = lin(v)

P = 0.5     # plot ground of houses / office (matches today's offices)


# ------------------------------------------------------------------ vernacular parts
def arch_door(K, c, n, w, h, col, frame, step=True):
    """Arched doorway: a round-headed painted door in a stone surround (voussoirs + jambs), h = springing + w/2."""
    t, n, up = frame3(n)
    c = Vector(c)
    op = K.op
    hs = h - w / 2
    g = c + n * 0.06
    poly(op, [g - t * w / 2, g + t * w / 2, g + t * w / 2 + up * hs, g - t * w / 2 + up * hs], col, PT['boards'], nrm=n)
    poly(op, [g + up * hs + t * (w / 2 * math.cos(math.pi * k / 6)) + up * (w / 2 * math.sin(math.pi * k / 6)) for k in range(7)],
         col, PT['boards'], nrm=n)
    fw = 0.32
    for s in (-1, 1):
        obox(op, c + n * 0.1 + t * s * (w / 2 + fw / 2) + up * (hs / 2), t, n, fw, 0.2, hs, frame, skip=('-y',))
    R = w / 2 + fw / 2
    pts = [c + n * 0.1 + up * hs + t * (R * math.cos(math.pi * k / 6)) + up * (R * math.sin(math.pi * k / 6)) for k in range(7)]
    for a, b in zip(pts[:-1], pts[1:]):
        beam(op, a, b, 0.2, fw, frame, up=n)
    obox(op, c + n * 0.14 + up * (hs + R + 0.05), t, n, 0.36, 0.26, 0.5, frame, skip=('-y',))   # keystone
    if step:
        obox(op, c + n * 0.4 + up * 0.08, t, n, w + 0.9, 0.8, 0.16, PAL['stone_light'], PT['ashlar'])


def deep_window(K, c, n, w, h, wall, shut=None, arch=False):
    """Small deep-set window: the reveal is the wall colour (no white trim), stone sill, painted board shutters."""
    window(K, c, n, w, h, frame=mul(wall, 0.84), arch=arch, sill=True, shutters=shut, depth=0.3)


def ridge(mb, p, q, col=None):
    beam(mb, p, q, 0.34, 0.26, col or PAL['tile_dark'], PT['tiles'])


def tiled_hip(mb, x0, y0, x1, y1, z, rise, col=None, ov=0.45):
    """Low Roman-tile hip roof + ridge / hip caps."""
    col = col or PAL['tile']
    hip_roof(mb, x0, y0, x1, y1, z, rise, col, PT['tiles'], ov=ov, th=0.22, fascia=PAL['tile_dark'])
    X0, Y0, X1, Y1 = x0 - ov, y0 - ov, x1 + ov, y1 + ov
    w, d = X1 - X0, Y1 - Y0
    zo = z - ov * rise / (min(w, d) / 2)
    zr = z + rise + 0.05
    if w >= d:
        a, b = Vector((X0 + d / 2, (Y0 + Y1) / 2, zr)), Vector((X1 - d / 2, (Y0 + Y1) / 2, zr))
    else:
        a, b = Vector(((X0 + X1) / 2, Y0 + w / 2, zr)), Vector(((X0 + X1) / 2, Y1 - w / 2, zr))
    if (a - b).length > 0.1:
        ridge(mb, a, b)
    for (cx, cy), e in (((X0, Y0), a), ((X0, Y1), a), ((X1, Y0), b), ((X1, Y1), b)):
        if w < d:
            e = a if cy == Y0 else b
        ridge(mb, (cx, cy, zo + 0.05), e)


def parapet(mb, x0, y0, x1, y1, z, h, th, col, pat=PT['render']):
    for (a0, b0, a1, b1) in ((x0, y0, x1, y0 + th), (x0, y1 - th, x1, y1), (x0, y0 + th, x0 + th, y1 - th), (x1 - th, y0 + th, x1, y1 - th)):
        box2(mb, a0, b0, z, a1, b1, z + h, col, pat, skip=('-z',))


def merlons(mb, p0, p1, z, th, col, w=1.0, step=2.6, h=1.0):
    """Square merlons along an axis-aligned wall top from p0 to p1 (wall thickness th)."""
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    L = (p1 - p0).length
    n = max(1, int(L / step))
    d = (p1 - p0) / L
    for k in range(n + 1):
        c = p0 + d * (L * k / n)
        if abs(d.x) > 0.5:
            box2(mb, c.x - w / 2, c.y - th / 2, z, c.x + w / 2, c.y + th / 2, z + h, col, PT['ashlar'], skip=('-z',))
        else:
            box2(mb, c.x - th / 2, c.y - w / 2, z, c.x + th / 2, c.y + w / 2, z + h, col, PT['ashlar'], skip=('-z',))


def foliage(mb, rng, c, r, cols, n=3, squash=0.7):
    c = Vector(c)
    for k in range(n):
        o = Vector((rng.uniform(-r, r), rng.uniform(-r, r) * 0.6, rng.uniform(-r, r) * 0.3)) * 0.6
        rr = r * rng.uniform(0.55, 0.9)
        prof = [(0.0, c.z + o.z - rr * squash)] + [(rr * math.sin(math.pi * i / 3), c.z + o.z - rr * squash * math.cos(math.pi * i / 3)) for i in (1, 2)] + [(0.0, c.z + o.z + rr * squash)]
        lathe(mb, (c.x + o.x, c.y + o.y), prof, rng.choice(cols), PT['leaf'], 6, smooth=False, cap=False, rot=rng.uniform(0, 1))


def amphora(mb, c, s=1.0, col=None):
    c = Vector(c)
    lathe(mb, c, [(0.0, c.z), (0.18 * s, c.z + 0.1 * s), (0.42 * s, c.z + 0.6 * s), (0.4 * s, c.z + 0.95 * s), (0.16 * s, c.z + 1.2 * s),
                  (0.2 * s, c.z + 1.35 * s)], col or PAL['terracotta'], 0, 7, smooth=True, cap=False)


def pot_plant(mb, rng, c, cols):
    c = Vector(c)
    cyl(mb, c, 0.32, 0.42, c.z, c.z + 0.6, PAL['terracotta'], 0, 6)
    foliage(mb, rng, (c.x, c.y, c.z + 1.0), 0.6, cols, 2)


def lantern(K, c, n):
    t, n, up = frame3(n)
    c = Vector(c)
    beam(K.op, c, c + n * 0.7, 0.08, 0.08, PAL['iron'])
    obox(K.em, c + n * 0.7 - up * 0.35, t, n, 0.3, 0.3, 0.45, PAL['iron'])
    obox(K.op, c + n * 0.7 - up * 0.06, t, n, 0.42, 0.42, 0.1, PAL['iron'])


# =================================================================== TOWN HOUSES  (pair on a 28 x 16 plot)
def build_houses(coll=None):
    root = empty('houses', coll=coll)
    K = Kit(301)
    op = K.op
    rng = random.Random(7)
    box2(op, -14, -8, -1.5, 14, 8, P, PAL['granite'], PT['ashlar'], skip=('+z',))
    poly(op, ((-14, -8, P), (14, -8, P), (14, 8, P), (-14, 8, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    # ---- house A: whitewashed cube, flat roof terrace + bougainvillea pergola, external stair (2 storeys, ~7 m + pergola)
    wash = PAL['wash']
    AX0, AX1, AY0, AY1, AZ = -11.0, -2.6, -4.2, 4.4, P + 6.2
    box2(op, AX0, AY0, P, AX1, AY1, AZ, wash, PT['render'])
    box2(op, AX0 - 0.1, AY0 - 0.1, P, AX1 + 0.1, AY1 + 0.1, P + 0.5, PAL['sh_blue'], 0)   # painted dado
    poly(op, ((AX0, AY0, AZ), (AX1, AY0, AZ), (AX1, AY1, AZ), (AX0, AY1, AZ)), PAL['lime'], PT['cobble'], nrm=(0, 0, 1))
    parapet(op, AX0 - 0.1, AY0 - 0.1, AX1 + 0.1, AY1 + 0.1, AZ, 0.7, 0.3, wash)
    arch_door(K, (-6.8, AY0, P), (0, -1, 0), 1.3, 2.7, PAL['sh_blue'], PAL['wash_shade'])
    for x in (-9.3, -4.3):
        deep_window(K, (x, AY0, P + 2.0), (0, -1, 0), 0.8, 1.1, wash, PAL['sh_blue'])
    for x in (-9.3, -6.8, -4.3):
        deep_window(K, (x, AY0, P + 4.6), (0, -1, 0), 0.8, 1.1, wash, PAL['sh_blue'], arch=(x == -6.8))
    deep_window(K, (AX1, 0.8, P + 4.6), (1, 0, 0), 0.8, 1.1, wash, PAL['sh_blue'])
    # external stair up the left flank to a first-floor door
    stairs(op, AX0 - 1.3, AX0, AY0 + 0.6, P, P + 3.4, 9, 0.52, PAL['wash_shade'], PT['ashlar'], ny=-1)
    ytop = AY0 + 0.6 + 9 * 0.52
    box2(op, AX0 - 1.3, ytop, P, AX0, ytop + 1.6, P + 3.4, PAL['wash_shade'], PT['render'], skip=('-z',))
    beam(op, (AX0 - 1.25, AY0 + 0.6, P + 0.6), (AX0 - 1.25, ytop, P + 4.0), 0.2, 0.5, wash)     # stair parapet
    box2(op, AX0 - 1.4, ytop, P + 3.4, AX0 - 1.1, ytop + 1.6, P + 4.2, wash, PT['render'])
    arch_door(K, (AX0, ytop + 0.8, P + 3.4), (-1, 0, 0), 0.95, 2.2, PAL['sh_blue'], PAL['wash_shade'], step=False)
    pot_plant(op, rng, (AX0 - 0.7, AY0 + 0.1, P), [PAL['vine'], PAL['bougain']])
    # stair-head cubicle + tiny vault on the terrace
    box2(op, AX0 + 0.3, AY1 - 3.0, AZ, AX0 + 3.0, AY1 - 0.3, AZ + 2.3, wash, PT['render'])
    extrude_roof(op, AX0 + 0.15, AX0 + 3.15, [(AY1 - 3.15, AZ + 2.3), (AY1 - 2.4, AZ + 2.75), (AY1 - 1.65, AZ + 2.9), (AY1 - 0.9, AZ + 2.75), (AY1 - 0.15, AZ + 2.3)],
                 wash, PT['render'], end_col=wash, end_pat=PT['render'])
    arch_door(K, (AX0 + 1.65, AY1 - 3.0, AZ), (0, -1, 0), 0.8, 1.9, PAL['sh_blue'], PAL['wash_shade'], step=False)
    # pergola: whitewashed piers, timber joists, bougainvillea + vine canopy spilling over the front parapet
    for (x, y) in ((-7.6, -3.6), (-3.2, -3.6), (-7.6, 0.2), (-3.2, 0.2)):
        box2(op, x - 0.22, y - 0.22, AZ, x + 0.22, y + 0.22, AZ + 2.4, wash, PT['render'])
    for y in (-3.6, 0.2):
        box2(op, -8.0, y - 0.12, AZ + 2.4, -2.8, y + 0.12, AZ + 2.62, PAL['timber_dark'], 0)
    for k in range(6):
        x = -7.8 + k * 0.9
        box2(op, x - 0.06, -4.1, AZ + 2.62, x + 0.06, 0.6, AZ + 2.76, PAL['timber'], 0)
    for (x, y, r, cols) in ((-6.9, -2.6, 1.2, (PAL['bougain'], PAL['bougain2'], PAL['vine'])), (-4.1, -1.2, 1.3, (PAL['vine'], PAL['bougain'], PAL['vine2'])),
                            (-5.2, -3.4, 1.0, (PAL['bougain2'], PAL['bougain']))):
        foliage(op, rng, (x, y, AZ + 2.9), r, cols, 3, 0.45)
    for (x, z) in ((-3.3, AZ - 0.4), (-3.1, AZ - 1.6), (-3.6, AZ - 2.6)):   # cascade down the front corner
        foliage(op, rng, (x, AY0 - 0.25, z), 0.7, (PAL['bougain'], PAL['bougain2'], PAL['vine']), 2, 0.8)
    pot_plant(op, rng, (-8.6, -3.4, AZ), [PAL['vine2']])

    # ---- courtyard wall + arched gate between the houses
    box2(op, AX1, AY0 + 0.6, P, 1.0, AY0 + 1.0, P + 2.6, PAL['rose'], PT['render'])
    box2(op, AX1, AY0 + 0.5, P + 2.6, 1.0, AY0 + 1.1, P + 2.8, PAL['tile_dark'], PT['tiles'])
    foliage(op, rng, (-0.2, AY0 + 1.6, P + 2.9), 0.9, (PAL['vine'], PAL['vine2']), 3, 0.6)

    # ---- house B: ochre stucco, three storeys, low Roman-tile hip roof, stone balcony, rose lean-to (~10.5 m)
    och = PAL['ochre_wash']
    BX0, BX1, BY0, BY1, BE = 1.0, 9.8, -4.6, 4.6, P + 8.4
    box2(op, BX0, BY0, P, BX1, BY1, BE, och, PT['render'])
    box2(op, BX0 - 0.12, BY0 - 0.12, P, BX1 + 0.12, BY1 + 0.12, P + 0.8, PAL['stone_dark'], PT['ashlar'])
    box2(op, BX0 - 0.25, BY0 - 0.25, BE - 0.25, BX1 + 0.25, BY1 + 0.25, BE, PAL['lime'], 0)    # plain cornice band
    tiled_hip(op, BX0, BY0, BX1, BY1, BE, 1.6, ov=0.5)
    box2(op, 6.8, 1.6, BE, 7.8, 2.6, BE + 3.0, och, PT['render'])                                  # domestic stack + tile cap
    gable_roof(op, 6.65, 1.45, 7.95, 2.75, BE + 3.25, 0.35, PAL['tile'], PT['tiles'], ov=0.1, ends=False)
    arch_door(K, (5.4, BY0, P), (0, -1, 0), 1.5, 3.0, PAL['sh_green'], PAL['stone_light'])
    for x in (2.8, 8.0):
        deep_window(K, (x, BY0, P + 2.1), (0, -1, 0), 0.8, 1.0, och, PAL['sh_green'])
    for x in (2.8, 8.0):
        deep_window(K, (x, BY0, P + 4.7), (0, -1, 0), 0.85, 1.3, och, PAL['sh_green'])
    deep_window(K, (5.4, BY0, P + 4.95), (0, -1, 0), 1.0, 1.9, och, PAL['sh_green'])              # balcony door
    for x in (2.8, 5.4, 8.0):
        deep_window(K, (x, BY0, P + 7.15), (0, -1, 0), 0.7, 0.75, och, PAL['sh_green'])
    for y in (-1.8, 2.0):
        deep_window(K, (BX0, y, P + 4.7), (-1, 0, 0), 0.8, 1.2, och, PAL['sh_green'])
    # stone balcony on corbels with an iron rail + potted geraniums
    box2(op, 4.1, BY0 - 1.1, P + 3.7, 6.7, BY0, P + 3.95, PAL['stone_light'], PT['ashlar'])
    for x in (4.4, 6.4):
        beam(op, (x, BY0, P + 3.0), (x, BY0 - 0.9, P + 3.7), 0.22, 0.3, PAL['stone_light'])
    rail(op, [(4.15, BY0 - 1.05, P + 3.95), (6.65, BY0 - 1.05, P + 3.95)], 0.9, PAL['iron'], 0.5, 0.03)
    for x in (4.5, 6.3):
        rail(op, [(x, BY0 - 1.05, P + 3.95), (x, BY0, P + 3.95)], 0.9, PAL['iron'], 0.6, 0.03)
    foliage(op, rng, (4.7, BY0 - 0.8, P + 4.35), 0.35, (PAL['flag_red'], PAL['vine']), 2, 0.8)
    # rose lean-to on the right with a single-pitch tile roof
    LX1 = 12.6
    box2(op, BX1, -2.6, P, LX1, 4.0, P + 3.6, PAL['rose'], PT['render'])
    extrude_y(op, -3.1, 4.5, [(BX1 - 0.05, P + 4.7), (LX1 + 0.5, P + 3.5)], PAL['tile'], PT['tiles'], ends=False)
    box2(op, BX1, -3.1, P + 3.6, LX1 + 0.5, 4.5, P + 3.7, PAL['tile_dark'], 0)
    arch_door(K, (11.2, -2.6, P), (0, -1, 0), 1.1, 2.4, PAL['sh_ox'], PAL['stone_light'])
    # quay dressing: amphorae, a bench, pots
    for (x, y, s) in ((-12.6, -6.4, 1.0), (-12.0, -6.9, 0.85), (12.4, -5.8, 1.0)):
        amphora(op, (x, y, P), s)
    box2(op, 7.0, -6.2, P + 0.45, 9.4, -5.6, P + 0.6, PAL['timber'], PT['planks_x'])
    for x in (7.2, 9.2):
        box2(op, x - 0.15, -6.1, P, x + 0.15, -5.7, P + 0.45, PAL['stone_light'], 0)
    pot_plant(op, rng, (3.4, BY0 - 0.6, P), [PAL['vine'], PAL['flag_red']])
    lantern(K, (6.6, BY0, P + 3.1), (0, -1, 0))
    K.emit(root, 'houses_body', coll)
    return root, {}


# =================================================================== HARBOUR OFFICE (ethereum)  20 x 16 - quay loggia
def build_office(chain='ethereum', coll=None):
    root = empty(f'harbour-office:{chain}', coll=coll)
    K = Kit(361)
    op = K.op
    rng = random.Random(5)
    acc = lin(CHAINS[chain])
    st, stl, std = PAL['stone'], PAL['stone_light'], PAL['stone_dark']
    wall = PAL['ochre_wash']
    box2(op, -10.0, -8.0, -1.5, 10.0, 8.0, P, PAL['granite'], PT['ashlar'], skip=('+z',))
    poly(op, ((-10, -8, P), (10, -8, P), (10, 8, P), (-10, 8, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    X0, X1, Y0, Y1 = -7.4, 7.4, -3.0, 6.6
    T, ZL, E = 0.9, P + 5.4, P + 9.4
    YB = Y0 + 3.2    # loggia back wall
    # ground storey: an ashlar loggia of three round arches (rusticated piers + keystones)
    arcade(op, X0, X1, Y0, T, P, ZL, 3, 1.5, P + 2.7, st, PT['ashlar'], intr=std, keystone=stl)
    box2(op, X0, Y0 + T, P, X0 + T, YB, ZL, st, PT['ashlar'])
    box2(op, X1 - T, Y0 + T, P, X1, YB, ZL, st, PT['ashlar'])
    box2(op, X0, YB, P, X1, Y1, ZL, st, PT['ashlar'])
    poly(op, ((X0 + T, Y0, P + 0.02), (X1 - T, Y0, P + 0.02), (X1 - T, YB, P + 0.02), (X0 + T, YB, P + 0.02)), PAL['interior2'], PT['cobble'], nrm=(0, 0, 1))
    for x in (-4.6, 0.0, 4.6):
        arch_door(K, (x, YB, P), (0, -1, 0), 1.4, 3.0, acc, stl, step=False)
    # piano nobile: ochre stucco, string course, shuttered arched windows in the chain colour
    box2(op, X0, Y0, ZL, X1, Y1, E, wall, PT['render'])
    box2(op, X0 - 0.2, Y0 - 0.25, ZL - 0.1, X1 + 0.2, Y1 + 0.2, ZL + 0.3, stl, 0)
    for x in (-5.0, 5.0):
        deep_window(K, (x, Y0, ZL + 2.0), (0, -1, 0), 1.0, 1.6, wall, acc, arch=True)
    for y in (0.0, 4.0):
        for s in (-1, 1):
            deep_window(K, (s * X1, y, ZL + 2.0), (s, 0, 0), 0.9, 1.4, wall, acc, arch=True)
            deep_window(K, (s * X1, y, P + 2.4), (s, 0, 0), 0.8, 1.1, st, None)
    box2(op, X0 - 0.35, Y0 - 0.4, E - 0.1, X1 + 0.35, Y1 + 0.35, E + 0.25, stl, 0)   # eave cornice
    tiled_hip(op, X0, Y0, X1, Y1, E + 0.25, 2.0, ov=0.55)
    # the crest over the central arch, in a carved stone frame: bracket below, hood cornice + scroll ears
    cz, cs = ZL + 1.85, 2.4
    crest_panel(K, root, (0.0, Y0 - 0.2, cz), cs, stl, coll)
    box2(op, -1.9, Y0 - 0.75, cz + cs / 2 + 0.2, 1.9, Y0, cz + cs / 2 + 0.55, stl, 0)
    pediment(op, -1.7, 1.7, Y0 - 0.65, Y0 - 0.1, cz + cs / 2 + 0.55, 0.65, stl, tymp=stl, cornice=0.15)
    box2(op, -0.9, Y0 - 0.55, cz - cs / 2 - 0.55, 0.9, Y0, cz - cs / 2 - 0.15, stl, 0)
    for s in (-1, 1):
        disc(op, (s * (cs / 2 + 0.55), Y0 - 0.1, cz - 0.6), (0, -1, 0), 0.32, 0.3, stl, 8)
    # two chain-coloured velaria on timber poles over the outer arches (the central arch + crest stay open):
    # sagging cloth panels + scalloped hem; guy ropes to pegs
    zb, zf, yf, sag = ZL - 0.55, P + 3.5, Y0 - 3.8, 0.3
    spans = [(-7.1, -2.4), (2.4, 7.1)]
    xs = [x for sp in spans for x in sp]
    nu, nv = 3, 3
    for pi_, (xa, xb) in enumerate(spans):
        shade = (1.0, 1.0, 1.0)
        def pt(u, v):
            x = xa + (xb - xa) * u
            y = Y0 + (yf - Y0) * v
            z = zb + (zf - zb) * v - sag * math.sin(math.pi * u) * (0.4 + 0.6 * v) - 0.15 * math.sin(math.pi * v)
            return (x, y - 0.12, z)
        for i in range(nu):
            for j in range(nv):
                poly(K.cover, (pt(i / nu, j / nv), pt((i + 1) / nu, j / nv), pt((i + 1) / nu, (j + 1) / nv), pt(i / nu, (j + 1) / nv)),
                     mul(shade, 0.97 if (i + j) % 2 else 1.0), 0, nrm=(0, -0.3, 1), jitter=0.0)
        for i in range(nu * 2):      # scalloped valance
            a, b = pt(i / (2 * nu), 1.0), pt((i + 1) / (2 * nu), 1.0)
            m = ((a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2 - 0.5)
            poly(K.cover, (a, b, m), mul(shade, 0.9), 0, nrm=(0, -1, 0), jitter=0.0)
    for x in xs:
        cyl(op, (x, yf - 0.12), 0.11, 0.09, P, zf + 0.8, PAL['timber_dark'], 0, 6)
        sphere(op, (x, yf - 0.12, zf + 0.9), 0.16, PAL['gilt'], 6, 3, PT['metal'])
        if True:
            peg = (x + (1.2 if x in (-2.4, 7.1) else -1.2), yf - 1.5, P)
            beam(op, (x, yf - 0.12, zf + 0.7), peg, 0.04, 0.04, PAL['rope'])
            box2(op, peg[0] - 0.12, peg[1] - 0.12, P, peg[0] + 0.12, peg[1] + 0.12, P + 0.3, PAL['timber_dark'], 0)
    # flag mast on a bronze pedestal (Venetian piazza standard)
    fx, fy_ = 8.7, -6.6
    lathe(op, (fx, fy_), [(0.85, P), (0.85, P + 0.5), (0.6, P + 0.7), (0.5, P + 1.4), (0.62, P + 1.6), (0.3, P + 1.8)], PAL['bronze'], PT['metal'], 8, smooth=False)
    cyl(op, (fx, fy_), 0.15, 0.08, P + 1.8, P + 15.0, PAL['timber_fresh'], 0, 6)
    sphere(op, (fx, fy_, P + 15.1), 0.22, PAL['gilt'], 6, 3, PT['metal'])
    e = empty('flag_pole_top', (fx, fy_, P + 14.8), parent=root, coll=coll)
    e['anim'] = 'chain house flag (crest on the chain colour): the runtime hangs a waving flag here'
    # quay dressing: stone bollards with chain caps, amphorae, crates, a lantern on the corner pier
    for x in (-8.6, -4.0):
        cyl(op, (x, -7.3), 0.32, 0.26, P, P + 0.8, PAL['stone_light'], PT['ashlar'], 7)
        cyl(op, (x, -7.3), 0.3, 0.22, P + 0.8, P + 1.05, acc, 0, 7)
    for (x, y, s) in ((-8.9, -5.2, 1.0), (-8.3, -4.6, 0.9), (-9.1, -4.3, 0.8)):
        amphora(op, (x, y, P), s)
    crate(op, (8.2, -4.2, P), 0.9, PAL['timber'], 0.2)
    lantern(K, (X1 + 0.05, Y0 + 0.4, P + 3.6), (1, 0, 0))
    lantern(K, (X0 - 0.05, Y0 + 0.4, P + 3.6), (-1, 0, 0))
    made = K.emit(root, 'office_body', coll)
    made['cover'].name = 'awning'
    made['cover']['anim'] = 'velarium: hb_cover, tinted by the chain colour (COLOR_0 = panel shade)'
    return root, dict(chain=chain)


# =================================================================== THE MINT  64 x 44 - fortified arsenal / khan
def build_mint(coll=None):
    Z0 = 0.4
    root = empty('mint', coll=coll)
    K = Kit(411)
    op, em = K.op, K.em
    rng = random.Random(4)
    st, stl, std = PAL['tufa'], PAL['stone_light'], PAL['stone_dark']
    box2(op, -32, -22, Z0 - 2.6, 32, 22, Z0, PAL['granite'], PT['ashlar'], skip=('+z', '-z'))
    RY0, RY1, RZ = 1.6, 4.8, Z0 - 1.6
    for (x0, y0, x1, y1) in ((-32, -22, 9.4, 22), (9.4, -22, 32, RY0), (9.4, RY1, 32, 22)):
        poly(op, ((x0, y0, Z0), (x1, y0, Z0), (x1, y1, Z0), (x0, y1, Z0)), PAL['cobble'], PT['cobble'], nrm=(0, 0, 1))
    # ---- mill race (as today) running out through the east wall
    for y, n in ((RY0, (0, 1, 0)), (RY1, (0, -1, 0))):
        poly(op, ((9.4, y, RZ - 0.4), (32, y, RZ - 0.4), (32, y, Z0), (9.4, y, Z0)), PAL['granite_light'], PT['ashlar'], nrm=n)
    poly(op, ((9.4, RY0, RZ - 0.4), (9.4, RY1, RZ - 0.4), (9.4, RY1, Z0), (9.4, RY0, Z0)), PAL['granite_light'], PT['ashlar'], nrm=(1, 0, 0))
    poly(op, ((9.4, RY0, RZ), (32.0, RY0, RZ), (32.0, RY1, RZ), (9.4, RY1, RZ)), PAL['water'], 0, nrm=(0, 0, 1), jitter=0.0)
    for y in (RY0 - 0.35, RY1 + 0.35):
        box2(op, 9.4, y - 0.35, Z0, 30.8, y + 0.35, Z0 + 0.35, stl, PT['ashlar'])
    # ---- curtain walls (crenellated) + corner towers; front wall kept low so the yard reads from the camera
    WT, WH, FH = 1.2, Z0 + 6.0, Z0 + 4.4
    GX = -2.0
    for (a, b) in ((-32, GX - 4.5), (GX + 4.5, 32)):
        box2(op, a, -22, Z0, b, -22 + WT, FH, st, PT['ashlar'])
        merlons(op, (a + 0.6, -22 + WT / 2), (b - 0.6, -22 + WT / 2), FH, WT, st)
    box2(op, -32, 22 - WT, Z0, 32, 22, WH, st, PT['ashlar'])
    merlons(op, (-31.4, 22 - WT / 2), (31.4, 22 - WT / 2), WH, WT, st)
    box2(op, -32, -22 + WT, Z0, -32 + WT, 22 - WT, WH, st, PT['ashlar'])
    merlons(op, (-32 + WT / 2, -21.4), (-32 + WT / 2, 21.4), WH, WT, st)
    for (a, b) in ((-22 + WT, RY0 - 0.7), (RY1 + 0.7, 22 - WT)):      # east wall with a water arch over the race
        box2(op, 32 - WT, a, Z0, 32, b, WH, st, PT['ashlar'])
        merlons(op, (32 - WT / 2, a + 0.6), (32 - WT / 2, b - 0.6), WH, WT, st)
    box2(op, 32 - WT, RY0 - 0.7, Z0 + 2.4, 32, RY1 + 0.7, WH, st, PT['ashlar'])
    for (cx, cy, h) in ((-29.5, -19.5, Z0 + 8.5), (29.5, -19.5, Z0 + 8.5), (-29.5, 19.5, Z0 + 9.5), (29.5, 19.5, Z0 + 9.5)):
        box2(op, cx - 3.0, cy - 3.0, Z0, cx + 3.0, cy + 3.0, h, st, PT['ashlar'])
        box2(op, cx - 3.25, cy - 3.25, Z0, cx + 3.25, cy + 3.25, Z0 + 1.8, std, PT['ashlar'])     # battered base
        box2(op, cx - 3.3, cy - 3.3, h - 0.5, cx + 3.3, cy + 3.3, h, stl, 0)                     # corbel course
        for (p0, p1) in (((cx - 3.0, cy - 2.9), (cx + 3.0, cy - 2.9)), ((cx - 3.0, cy + 2.9), (cx + 3.0, cy + 2.9))):
            merlons(op, p0, p1, h, 0.6, st, 0.9, 1.5)
        for (p0, p1) in (((cx - 2.9, cy - 1.5), (cx - 2.9, cy + 1.5)), ((cx + 2.9, cy - 1.5), (cx + 2.9, cy + 1.5))):
            merlons(op, p0, p1, h, 0.6, st, 0.9, 1.5)
        window(K, (cx, cy - 3.0, h - 2.6), (0, -1, 0), 0.35, 1.2, frame=std, sill=False, lit=0.0)
    # ---- monumental gate: rusticated arch between two square towers, the gilded coin over the arch
    for s in (-1, 1):
        x = GX + s * 4.6
        box2(op, x - 1.9, -23.0, Z0, x + 1.9, -19.2, Z0 + 9.5, st, PT['ashlar'])
        box2(op, x - 2.05, -23.15, Z0 + 9.0, x + 2.05, -19.05, Z0 + 9.5, stl, 0)
        merlons(op, (x - 1.5, -22.85), (x + 1.5, -22.85), Z0 + 9.5, 0.5, st, 0.8, 1.5)
        window(K, (x, -23.0, Z0 + 6.8), (0, -1, 0), 0.45, 1.3, frame=std, sill=False, lit=0.0)
    arcade(op, GX - 2.7, GX + 2.7, -22.6, 2.4, Z0, Z0 + 8.0, 1, 0.4, Z0 + 4.2, st, PT['ashlar'], intr=std, keystone=stl)
    box2(op, GX - 2.9, -22.9, Z0 + 8.0, GX + 2.9, -20.0, Z0 + 8.4, stl, 0)
    mcz = Z0 + 7.0
    disc(op, (GX, -22.65, mcz), (0, -1, 0), 1.05, 0.3, PAL['gold'], 16, PT['metal'])
    disc(op, (GX, -22.95, mcz), (0, -1, 0), 0.8, 0.06, PAL['gilt'], 16, PT['metal'])
    for s in (-1, 1):    # timber gate leaves swung open
        box2(op, GX + s * 2.3 - 0.1, -20.4, Z0, GX + s * 2.3 + 0.1, -18.2, Z0 + 4.4, PAL['oak'], PT['boards'])
    # ---- the domed hall (khan): ashlar block, flat terrace roof, central drum + plastered dome, arched forge bays
    HX0, HX1, HY0, HY1, HZ = -28.0, -4.0, 0.0, 18.0, Z0 + 8.6
    T = 1.2
    bays = arcade(op, HX0, HX1, HY0, T, Z0, HZ, 4, 1.7, Z0 + 3.4, st, PT['ashlar'], intr=std, keystone=stl)
    box2(op, HX0, HY0 + T, Z0, HX0 + T, HY1, HZ, st, PT['ashlar'])
    box2(op, HX1 - T, HY0 + T, Z0, HX1, HY1, HZ, st, PT['ashlar'])
    box2(op, HX0, HY1 - T, Z0, HX1, HY1, HZ, st, PT['ashlar'])
    poly(op, ((HX0, HY0, HZ), (HX1, HY0, HZ), (HX1, HY1, HZ), (HX0, HY1, HZ)), PAL['lime'], PT['cobble'], nrm=(0, 0, 1))
    box2(op, HX0 - 0.3, HY0 - 0.35, HZ - 0.5, HX1 + 0.3, HY1 + 0.3, HZ, stl, 0)
    parapet(op, HX0 - 0.3, HY0 - 0.35, HX1 + 0.3, HY1 + 0.3, HZ, 0.8, 0.5, st, PT['ashlar'])
    for (xc, r) in bays:
        window(K, (xc, HY0, HZ - 1.9), (0, -1, 0), 0.9, 1.2, frame=std, arch=True, sill=False)
    dcx, dcy = (HX0 + HX1) / 2, 11.0
    cyl(op, (dcx, dcy), 6.2, 6.2, HZ, HZ + 2.2, stl, PT['ashlar'], 16, top=False)
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        window(K, (dcx + 6.2 * math.cos(a), dcy + 6.2 * math.sin(a), HZ + 1.15), (math.cos(a), math.sin(a), 0), 0.6, 1.0, frame=stl, arch=True, sill=False, lit=0.7)
    dome(op, (dcx, dcy), HZ + 2.2, 6.4, 5.4, PAL['plaster_dome'], 0, 16, 5, smooth=True)
    cyl(op, (dcx, dcy), 0.9, 0.9, HZ + 7.4, HZ + 8.4, stl, 0, 8, top=False)
    dome(op, (dcx, dcy), HZ + 8.4, 1.1, 0.9, PAL['lead'], PT['metal'], 8, 2)
    cyl(op, (dcx, dcy), 0.08, 0.05, HZ + 9.2, HZ + 10.3, PAL['gilt'], PT['metal'], 4)
    sphere(op, (dcx, dcy, HZ + 10.4), 0.32, PAL['gold'], 8, 4, PT['metal'])
    # forge bays: in each bay a stone furnace with an arched glowing mouth; short domed flues on the terrace above
    glow = MB(50)
    FY = HY0 + T
    for i, (xc, r) in enumerate(bays):
        box2(op, xc - r, FY, Z0, xc + r, FY + 2.6, Z0 + 3.4, std, PT['ashlar'], skip=('-z',))
        mw, mh = 1.7, 1.5
        seg = 6
        pts = [(xc - mw / 2, FY - 0.02, Z0 + 0.6), (xc + mw / 2, FY - 0.02, Z0 + 0.6)] + \
              [(xc + mw / 2 * math.cos(math.pi * k / seg), FY - 0.02, Z0 + 0.6 + mh + mw / 2 * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
        poly(glow, pts, (1.0, 0.45, 0.12), 0, nrm=(0, -1, 0), jitter=0)
        box2(glow, xc - mw / 2, FY - 0.9, Z0, xc + mw / 2, FY, Z0 + 0.25, (1.0, 0.5, 0.15), 0, skip=('-z',))     # spilled coal bed
        # flue on the terrace: a drum with a little dome and open vents; chimney_i at its crown
        fx, fy = xc, HY0 + 2.6
        cyl(op, (fx, fy), 1.25, 1.1, HZ, HZ + 2.0, stl, PT['ashlar'], 8, top=False)
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            box2(op, fx + 0.85 * math.cos(a) - 0.25, fy + 0.85 * math.sin(a) - 0.25, HZ + 2.0, fx + 0.85 * math.cos(a) + 0.25, fy + 0.85 * math.sin(a) + 0.25, HZ + 2.8,
                 stl, 0, skip=('-z', '+z'))
        poly(op, [(fx + 1.0 * math.cos(2 * math.pi * k / 8), fy + 1.0 * math.sin(2 * math.pi * k / 8), HZ + 2.02) for k in range(8)], PAL['soot'], 0, nrm=(0, 0, 1), jitter=0)
        cyl(op, (fx, fy), 1.25, 1.25, HZ + 2.8, HZ + 3.0, stl, 0, 8, top=False)
        dome(op, (fx, fy), HZ + 3.0, 1.25, 1.0, mix(PAL['soot2'], stl, 0.55), 0, 8, 2, smooth=False)
        e = empty(f'chimney_{i}', (fx, fy, HZ + 2.5), parent=root, coll=coll)
        e['anim'] = 'smoke emitter in the domed flue vents; puff rate/darkness ~ mint volume'
    gl = to_object(glow, 'furnace_glow', 'hb_emissive', parent=root, coll=coll)
    gl['anim'] = 'furnace mouths + coal beds: emissive strength ~ mint volume (flicker)'
    # presses in the yard in front of the first three bays (open-air coining floor), coin trays beside them
    for i in range(3):
        xc, yc = bays[i][0], HY0 - 4.2
        press_frame(op, xc, yc)
        press_ram(K, root, i, xc, yc, coll)
        box2(op, xc + 1.6, yc - 0.7, Z0, xc + 3.0, yc + 0.7, Z0 + 1.0, PAL['timber_dark'], PT['planks_x'])
        cyl(op, (xc + 2.3, yc), 0.55, 0.55, Z0 + 1.0, Z0 + 1.25, PAL['gold'], PT['metal'], 8)
    xc = bays[3][0]
    ingot_stack(op, (xc, HY0 - 4.5, Z0), 4, 3, 3)
    # ---- treasury keep (back centre): tall crenellated square tower, the town's 'strong room'
    KX, KY = 4.0, 13.0
    box2(op, KX - 4.0, KY - 4.0, Z0, KX + 4.0, KY + 4.0, Z0 + 15.0, st, PT['ashlar'])
    box2(op, KX - 4.3, KY - 4.3, Z0, KX + 4.3, KY + 4.3, Z0 + 2.4, std, PT['ashlar'])
    box2(op, KX - 4.35, KY - 4.35, Z0 + 14.4, KX + 4.35, KY + 4.35, Z0 + 15.0, stl, 0)
    for (p0, p1) in (((KX - 4.0, KY - 3.8), (KX + 4.0, KY - 3.8)), ((KX - 4.0, KY + 3.8), (KX + 4.0, KY + 3.8)),
                     ((KX - 3.8, KY - 2.4), (KX - 3.8, KY + 2.4)), ((KX + 3.8, KY - 2.4), (KX + 3.8, KY + 2.4))):
        merlons(op, p0, p1, Z0 + 15.0, 0.6, st, 1.0, 2.0, 1.2)
    for z in (Z0 + 6.0, Z0 + 10.5):
        window(K, (KX, KY - 4.0, z), (0, -1, 0), 0.6, 1.4, frame=std, arch=True, sill=False)
    arch_door(K, (KX, KY - 4.0, Z0), (0, -1, 0), 1.8, 3.2, PAL['oak'], stl, step=True)
    # ---- mill house + undershot waterwheel on the race (back right), Roman-tile gable roof
    WX0, WX1, WY0, WY1 = 12.0, 30.8, 6.0, 20.8
    box2(op, WX0, WY0, Z0, WX1, WY1, Z0 + 6.6, PAL['wash_shade'], PT['render'])
    box2(op, WX0 - 0.2, WY0 - 0.2, Z0, WX1 + 0.2, WY1 + 0.2, Z0 + 1.4, std, PT['ashlar'])
    gable_roof(op, WX0, WY0, WX1, WY1, Z0 + 6.6, 3.0, PAL['tile'], PT['tiles'], ov=0.5, end_col=PAL['wash_shade'], end_pat=PT['render'])
    ridge(op, (WX0 - 0.5, (WY0 + WY1) / 2, Z0 + 9.65), (WX1 + 0.5, (WY0 + WY1) / 2, Z0 + 9.65))
    for x in (14.5, 17.5, 24.5, 27.5):
        deep_window(K, (x, WY0, Z0 + 4.2), (0, -1, 0), 0.9, 1.2, PAL['wash_shade'], PAL['sh_green'])
    arch_door(K, (21.0, WY0, Z0), (0, -1, 0), 2.0, 3.4, PAL['oak'], stl, step=False)
    wheel = MB(60)
    wc = Vector((21.0, (RY0 + RY1) / 2, Z0 + 1.6))
    R_, W_ = 4.4, 2.4
    for yy in (wc.y - W_ / 2, wc.y + W_ / 2):
        for k in range(16):
            a0, a1 = 2 * math.pi * k / 16, 2 * math.pi * (k + 1) / 16
            beam(wheel, wc + Vector((R_ * math.cos(a0), yy - wc.y, R_ * math.sin(a0))), wc + Vector((R_ * math.cos(a1), yy - wc.y, R_ * math.sin(a1))),
                 0.28, 0.4, PAL['timber_dark'], up=Vector((0, 1, 0)))
        for k in range(8):
            a = 2 * math.pi * (k + 0.25) / 8
            beam(wheel, wc + Vector((0, yy - wc.y, 0)), wc + Vector((R_ * math.cos(a), yy - wc.y, R_ * math.sin(a))), 0.22, 0.22, PAL['timber'])
    for k in range(16):
        a = 2 * math.pi * (k + 0.5) / 16
        d = Vector((math.cos(a), 0, math.sin(a)))
        box(wheel, wc + d * (R_ - 0.45), (0.85, W_ + 0.2, 0.12), PAL['timber'], PT['boards'], axes=(d, Vector((0, 1, 0)), Vector((-d.z, 0, d.x))))
    rod(wheel, wc - Vector((0, W_ / 2 + 0.6, 0)), wc + Vector((0, W_ / 2 + 1.2, 0)), 0.32, PAL['iron'], 8, cap=True)
    wob = to_object(wheel, 'wheel', 'hb_opaque', parent=root, origin=wc, coll=coll)
    wob['anim'] = 'waterwheel: rotate about the axle; undershot - turns with the flow; speed ~ mint volume'
    for yy in (RY0 - 0.35, RY1 + 0.35):
        box2(op, 20.4, yy - 0.35, Z0, 21.6, yy + 0.35, Z0 + 1.4, PAL['timber_dark'], PT['boards'])
    # ---- yard dressing: ingots, coin crates, amphorae, cresset lamps on the walls
    ingot_stack(op, (14.5, -15.0, Z0), 4, 3, 3)
    ingot_stack(op, (14.5, -9.5, Z0), 3, 3, 3)
    # ---- arsenal shed ('tesa') along the east wall: open stone piers under a long Roman-tile roof, coin crates beneath
    SX0, SX1, SY0, SY1, SZ = 22.6, 30.8, -19.0, -3.0, Z0 + 4.8
    for y in (SY0, SY0 + 4.0, SY0 + 8.0, SY0 + 12.0, SY1):
        for x in (SX0, SX1 - 0.9):
            box2(op, x, y - 0.45, Z0, x + 0.9, y + 0.45, SZ, st, PT['ashlar'])
    box2(op, SX0, SY0 - 0.45, SZ - 0.7, SX1, SY1 + 0.45, SZ, stl, 0)
    gable_roof(op, SX0, SY0 - 0.45, SX1, SY1 + 0.45, SZ, 2.2, PAL['tile'], PT['tiles'], ov=0.45, axis='y', end_col=st, end_pat=PT['ashlar'])
    ridge(op, ((SX0 + SX1) / 2, SY0 - 0.9, SZ + 2.25), ((SX0 + SX1) / 2, SY1 + 0.9, SZ + 2.25))
    for k, (x, y) in enumerate(((17.0, -2.6), (18.3, -2.6), (19.6, -2.6), (17.6, -1.2), (18.9, -1.2))):
        coin_crate(op, (x, y, Z0), rz=0.05 * (k % 3))
    for (x, y, s) in ((27.5, -14.0, 1.1), (28.3, -13.2, 1.0), (27.2, -12.6, 0.9)):
        amphora(op, (x, y, Z0), s)
    for (x, y) in ((GX - 7.0, -21.0), (GX + 7.0, -21.0), (10.4, -1.0)):
        cyl(op, (x, y), 0.12, 0.1, Z0, Z0 + 3.0, PAL['iron'], PT['metal'], 5)
        lathe(em, (x, y), [(0.15, Z0 + 3.0), (0.45, Z0 + 3.5), (0.5, Z0 + 3.7)], PAL['iron'], 0, 6, smooth=False)
    K.emit(root, 'mint_body', coll)
    return root, {}


# =================================================================== THE BURN  30 x 30 - beacon tower on its islet
def build_burn(coll=None):
    root = empty('burn', coll=coll)
    K = Kit(521)
    op, em = K.op, K.em
    rng = random.Random(9)
    PZ = 0.9
    st, stl, std = PAL['tufa'], PAL['stone_light'], PAL['stone_dark']
    for k in range(11):
        a = 2 * math.pi * k / 11 + 0.2
        rr = 11.0 + rng.uniform(-0.6, 0.5)
        rock_blob(op, (rr * math.cos(a), rr * math.sin(a), -1.2), rng.uniform(2.6, 3.6), rng.uniform(1.6, 3.0), rng,
                  col=mix(PAL['rock_light'], PAL['rock'], rng.uniform(0, 0.6)))
    # round dressed platform + landing steps on the quay side
    cyl(op, (0, 0), 10.0, 9.6, -2.5, PZ, PAL['granite'], PT['ashlar'], 16, top=False)
    poly(op, [(9.6 * math.cos(2 * math.pi * k / 16), 9.6 * math.sin(2 * math.pi * k / 16), PZ) for k in range(16)], mix(PAL['quay'], PAL['soot2'], 0.25), PT['cobble'], nrm=(0, 0, 1))
    stairs(op, -2.0, 2.0, -12.4, -2.4, PZ, 6, 0.5, PAL['granite_light'], PT['ashlar'], ny=-1)
    # the tower: battered round drum, string courses, corbelled (machicolated) crown, open fire basket on top
    TC = (2.0, 3.0)
    prof = [(5.0, PZ), (4.6, PZ + 2.0), (4.3, PZ + 11.5)]
    lathe(op, TC, prof, st, PT['ashlar'], 14, smooth=True, cap=False,
          colfn=lambda z: mix(st, PAL['soot2'], sstep(PZ + 6.0, PZ + 12.0, z) * 0.55))
    for z, r in ((PZ + 2.0, 4.72), (PZ + 7.0, 4.5)):
        cyl(op, TC, r, r, z, z + 0.35, stl, 0, 14, top=False)
    lathe(op, TC, [(4.3, PZ + 11.5), (5.2, PZ + 12.6), (5.2, PZ + 13.3)], std, PT['ashlar'], 14, smooth=False, cap=False)
    poly(op, [(TC[0] + 5.2 * math.cos(2 * math.pi * k / 14), TC[1] + 5.2 * math.sin(2 * math.pi * k / 14), PZ + 13.3) for k in range(14)], PAL['soot2'], PT['cobble'], nrm=(0, 0, 1))
    for k in range(12):   # merlons around the crown
        a = 2 * math.pi * k / 12
        obox(op, Vector((TC[0] + 4.85 * math.cos(a), TC[1] + 4.85 * math.sin(a), PZ + 13.85)), (-math.sin(a), math.cos(a), 0), (math.cos(a), math.sin(a), 0),
             1.3, 0.6, 1.1, st, PT['ashlar'])
    arch_door(K, (TC[0], TC[1] - 4.9, PZ), (0, -1, 0), 1.6, 3.0, PAL['oak'], stl)
    grate = MB(70)
    for k, (a, z) in enumerate(((-math.pi / 2 - 0.7, PZ + 5.2), (-math.pi / 2 + 0.6, PZ + 9.0), (math.pi, PZ + 7.5))):   # glowing slit windows
        r = 4.45 if z > PZ + 6 else 4.6
        n = Vector((math.cos(a), math.sin(a), 0))
        t = Vector((-n.y, n.x, 0))
        c = Vector((TC[0], TC[1], z)) + n * (r + 0.03)
        poly(grate, (c - t * 0.25 - Vector((0, 0, 0.75)), c + t * 0.25 - Vector((0, 0, 0.75)), c + t * 0.25 + Vector((0, 0, 0.75)), c - t * 0.25 + Vector((0, 0, 0.75))),
             (1.0, 0.45, 0.1), 0, nrm=n, jitter=0)
    # fire basket: iron cresset of hoops + staves on a short stone pedestal
    bz = PZ + 13.3
    cyl(op, TC, 1.6, 1.8, bz, bz + 1.0, std, PT['ashlar'], 10, top=True, col_top=PAL['soot'])
    zb = bz + 1.0
    lathe(op, TC, [(1.4, zb), (2.6, zb + 0.6), (3.3, zb + 1.8), (3.5, zb + 2.3)], PAL['iron'], PT['metal'], 12, smooth=True, cap=False)
    for k in range(12):
        a = 2 * math.pi * k / 12
        beam(op, (TC[0] + 1.4 * math.cos(a), TC[1] + 1.4 * math.sin(a), zb), (TC[0] + 3.7 * math.cos(a), TC[1] + 3.7 * math.sin(a), zb + 2.9), 0.18, 0.18, PAL['iron'])
    lathe(op, TC, [(3.55, zb + 2.25), (3.65, zb + 2.55)], PAL['bronze'], PT['metal'], 12, smooth=True, cap=False)
    fire = MB(71)
    fc = Vector((TC[0], TC[1], zb + 1.4))
    lathe(fire, fc, [(3.2, fc.z + 0.6), (1.8, fc.z + 1.0), (0.0, fc.z + 1.15)], (1.0, 0.4, 0.1), 0, 10, smooth=False)
    flames(fire, fc + Vector((0, 0, 0.7)), random.Random(3), 11, 2.7, 5.5, 9.5, col=(1.0, 0.62, 0.2))
    fob = to_object(fire, 'fire_core', 'hb_emissive', parent=root, origin=fc, coll=coll)
    fob['anim'] = 'flames: scale (y up) and emissive ~ burn volume; flicker'
    e = empty('fire_emitter', (fc.x, fc.y, fc.z + 3.0), parent=root, coll=coll)
    e['anim'] = 'sparks / embers / heat shimmer from the basket'
    e = empty('smoke_emitter', (fc.x, fc.y, fc.z + 9.0), parent=root, coll=coll)
    e['anim'] = 'smoke column above the flame; height/darkness ~ burn volume'
    to_object(grate, 'grate_glow', 'hb_emissive', parent=root, coll=coll)['anim'] = 'slit windows glow ~ burn volume'
    # coin hoist: a timber gallows on the crown; coins rise in a basket and tip into the basket of fire
    hx, hy = TC[0] - 3.6, TC[1] - 3.6
    beam(op, (hx, hy, bz), (hx, hy, bz + 4.2), 0.3, 0.3, PAL['timber_dark'])
    beam(op, (hx, hy, bz + 4.0), (hx - 2.4, hy - 2.4, bz + 4.0), 0.3, 0.3, PAL['timber_dark'])
    beam(op, (hx, hy, bz + 2.6), (hx - 1.4, hy - 1.4, bz + 4.0), 0.18, 0.18, PAL['timber_dark'])
    beam(op, (hx - 2.3, hy - 2.3, bz + 3.9), (hx - 2.3, hy - 2.3, PZ + 2.2), 0.05, 0.05, PAL['rope'])
    cyl(op, (hx - 2.3, hy - 2.3), 0.55, 0.65, PZ + 1.4, PZ + 2.2, PAL['timber'], PT['boards'], 7, col_top=PAL['gold'])
    e = empty('coin_chute', (hx - 2.3, hy - 2.3, PZ + 2.4), parent=root, coll=coll)
    e['anim'] = 'coins are hoisted from here up the rope to coin_chute_end; rate ~ burn volume'
    e = empty('coin_chute_end', (hx - 0.4, hy - 0.4, bz + 3.6), parent=root, coll=coll)
    e['anim'] = 'coins tip from here into the fire basket'
    # dressing: coin crates on the landing, ash heaps, a moored skiff ring
    lathe(op, (-5.5, -4.5), [(1.8, PZ), (1.1, PZ + 0.6), (0.0, PZ + 0.9)], PAL['gold'], PT['metal'], 9, smooth=False)
    coin_crate(op, (-3.8, -6.8, PZ)); coin_crate(op, (-6.8, -2.6, PZ), 0.3)
    for (x, y, r) in ((7.5, -1.0, 1.4), (5.6, 7.5, 1.1)):
        lathe(op, (x, y), [(r, PZ), (r * 0.5, PZ + r * 0.35), (0.0, PZ + r * 0.45)], PAL['ash'], PT['rock'], 7, smooth=False)
    for (x, y) in ((-2.6, -9.0), (2.6, -9.0)):
        cyl(op, (x, y), 0.12, 0.1, PZ, PZ + 2.6, PAL['iron'], PT['metal'], 5)
        lathe(em, (x, y), [(0.15, PZ + 2.6), (0.4, PZ + 3.0), (0.45, PZ + 3.2)], PAL['iron'], 0, 6, smooth=False)
    K.emit(root, 'burn_body', coll)
    return root, {}


SUBJECTS = [  # kind, builder, footprint (w, d), label
    ('houses', build_houses, (28, 16), 'Town houses (pair)'),
    ('harbour-office:ethereum', build_office, (20, 16), 'Harbour office: ethereum'),
    ('mint', build_mint, (64, 44), 'The Mint (arsenal)'),
    ('burn', build_burn, (30, 30), 'The Burn (beacon)'),
]
if ONLY:
    SUBJECTS = [s for s in SUBJECTS if s[0].split(':')[0] in ONLY]

# ------------------------------------------------------------------ preview look (minimal copy of civic/lineup.py)
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
CREST = {}


def crest_mat(chain):
    if chain in CREST:
        return CREST[chain]
    from PIL import Image
    png = os.path.join(SCR, f'crest-{chain}.png')
    subprocess.run(['rsvg-convert', '-w', '384', '-h', '384', '--keep-aspect-ratio', os.path.join(ROOT, 'public', 'chains', f'{chain}.svg'),
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
        nm = o.data.materials[0].name.split('.')[0]
        if nm in ('hb_opaque', 'hb_mirror'):
            o.data.materials[0] = ncm.M['kit']
        elif nm == 'hb_window':
            o.data.materials[0] = ncm.M['window']
        elif nm in ('hb_emissive', 'hb_fire'):
            o.data.materials[0] = EM
        elif nm == 'hb_cover':
            o.data.materials[0] = COVER
            o.color = (*lin(CHAINS.get(chain, '#C2453A')), 1)
        elif nm == 'hb_crest':
            o.data.materials[0] = crest_mat(chain or 'ethereum')


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


def stage(kind, builder, foot, at, ground=True):
    root, _ = builder()
    root.location = at
    chain = kind.split(':')[1] if ':' in kind else None
    dress(root, chain)
    w, d = foot
    x, y = at[0], at[1]
    if ground:
        if kind == 'burn':
            surface('sea_' + kind, x - 60, y - 60, x + 60, y + 60, -2.4, None, mat=SEA)
        else:
            surface('land_' + kind, x - w / 2 - 14, y - d / 2 - 4, x + w / 2 + 14, y + d / 2 + 14, -0.02, PAL['grass'], 6)
            surface('quay_' + kind, x - w / 2 - 14, y - d / 2 - 14, x + w / 2 + 14, y - d / 2 - 4, -0.02, PAL['quay'], 4)
            surface('sea_' + kind, x - w / 2 - 60, y - d / 2 - 80, x + w / 2 + 60, y - d / 2 - 14, -2.4, None, mat=SEA)
    bpy.context.view_layer.update()
    for o in descendants(root):   # preview-only flag at the flag_pole_top (runtime owns the real one)
        if o.name.split('.')[0] == 'flag_pole_top':
            p0 = o.matrix_world.translation
            bm = bmesh.new()
            vs = [bm.verts.new(p0 + Vector(v)) for v in ((0, 0, 0), (3.6, 0.3, -0.1), (3.6, 0.3, -2.5), (0, 0, -2.4))]
            f = bm.faces.new(vs)
            uvl = bm.loops.layers.uv.new('UVMap')
            for lp, uv in zip(f.loops, ((0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0))):
                lp[uvl].uv = uv
            me = bpy.data.meshes.new('pv_flag'); bm.to_mesh(me); bm.free()
            fo = bpy.data.objects.new('pv_flag', me); scene.collection.objects.link(fo)
            me.materials.append(crest_mat(chain or 'ethereum'))
    for o in descendants(root):
        if o.name.split('.')[0] in ('fire_core', 'furnace_glow', 'grate_glow'):
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


def import_pharos(at):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=PHAROS)
    new = [o for o in bpy.data.objects if o not in before]
    top = empty('pharos', at)
    for o in new:
        if o.parent is None:
            o.parent = top
        if o.type == 'MESH':
            ca = o.data.color_attributes
            if 'Col' not in ca and len(ca):
                ca[0].name = 'Col'
    dress(top)
    bpy.context.view_layer.update()
    pts = []
    for o in descendants(top):
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(b) for b in o.bound_box]
        if o.name.split('.')[0] == 'fire_core':
            c = o.matrix_world.translation
            L = add_light('pt_pharos', 'POINT', color=lin('#FF9A4A'), shadow_soft_size=3.0)
            L.location = c; L['e'] = 400000.0
            POINTS.append(L)
    return top, pts


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
        R = cam.rotation_euler.to_matrix()
        half_h = math.tan(cam.data.angle_y / 2) * dist
        c = c + (R @ Vector((1, 0, 0))) * mx * 2 * half_h * aspect + (R @ Vector((0, 1, 0))) * my * 2 * half_h
        dist *= k
    cam.location = c - fwd * dist


def render(path):
    scene.render.resolution_percentage = PCT
    scene.render.filepath = path
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)


cam = camera()
from PIL import Image, ImageDraw, ImageFont
if MODE in ('sheet', 'both'):
    scene.render.resolution_x, scene.render.resolution_y = 960, 640
    staged = []
    for i, (k, b, foot, lab) in enumerate(SUBJECTS):
        staged.append((k, lab) + stage(k, b, foot, (2000.0 + i * 600.0, 0.0, 0.0)))
    for st in STATES:
        set_state(st)
        tiles = []
        for (k, lab, root, pts) in staged:
            fit(cam, pts, margin=0.06)
            p = os.path.join(SCR, f'tile-{k.replace(":", "-")}-{st}.png')
            render(p)
            tiles.append((lab + f'  ·  {tri_count(descendants(root))} tris', p))
            print('TRIS', k, tri_count(descendants(root)))
        cols = 2 if len(tiles) > 1 else 1
        rows = (len(tiles) + cols - 1) // cols
        W_, H_ = int(960 * PCT / 100), int(640 * PCT / 100)
        sheet = Image.new('RGB', (W_ * cols, H_ * rows), (20, 24, 30))
        d = ImageDraw.Draw(sheet)
        f = ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-Bold.ttf', max(14, W_ // 34))
        for j, (t, p) in enumerate(tiles):
            ox, oy = (j % cols) * W_, (j // cols) * H_
            sheet.paste(Image.open(p).convert('RGB'), (ox, oy))
            d.text((ox + 13, oy + 11), t, font=f, fill=(10, 14, 20))
            d.text((ox + 12, oy + 10), t, font=f, fill=(250, 242, 226))
        out = os.path.join(OUT, f'sheet-{st}.jpg')
        sheet.save(out, quality=90)
        print('SHEET', out)
if MODE in ('lineup', 'both'):
    # one quay: houses, office, mint along the waterfront, the burn on its islet off the end, the Pharos behind at true scale
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    QY = -14.0                      # quay edge (front of every plot)
    sea = surface('sea_all', -400, -260, 400, 400, -2.4, None, mat=SEA)
    surface('land_all', -112, QY, 52, 40, -0.03, PAL['grass'], 6)
    surface('quay_all', -112, QY - 9, 52, QY, -0.02, PAL['quay'], 4)
    allpts = []
    layout = {'houses': (-88.0, QY + 8.0), 'harbour-office:ethereum': (-60.0, QY + 8.0), 'mint': (-10.0, QY + 22.0), 'burn': (68.0, -36.0)}
    for (k, b, foot, lab) in SUBJECTS:
        r_, pts = stage(k, b, foot, (*layout[k], 0.0), ground=False)
        allpts += pts
    ph, ppts = import_pharos((-24.0, 80.0, 0.0))
    allpts += ppts
    for st in STATES:
        set_state(st)
        fit(cam, allpts, margin=0.03)
        p = os.path.join(SCR, f'lineup-{st}.png')
        render(p)
        out = os.path.join(OUT, f'lineup-{st}.jpg')
        Image.open(p).convert('RGB').save(out, quality=90)
        print('LINEUP', out)
