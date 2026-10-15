"""Classical town exploration - direction A "Ptolemaic Alexandria" (c. 280 BC): style frames, exploration only.

    blender -b --factory-startup -P agents/2026-10-15-classical-town/A-alexandria/frames.py -- \
        [--mode sheet|lineup|both] [--state golden|night|both] [--samples 32] [--pct 100]

Builds four subjects with the civic kit primitives (scripts/harbour/blender/civic/cv_lib.py, imported, never edited):
  houses  - two Greek courtyard / terrace houses (stucco, low terracotta roofs, antefixes, painted meander band)
  office  - the Ethereum harbour office as a small Doric stoa (crest on a painted attic under a blue pediment,
            chain-tinted striped velarium on poles = hb_cover 'awning', flag_pole_top)
  mint    - a temple-treasury precinct (hexastyle pedimented hall, arched workshop wings with press_N, domed kilns whose
            stone flues carry chimney_N, furnace_glow mouths, an undershot `wheel` on a raised stone leat)
  burn    - a bronze fire-altar on a stepped platform on a rocky islet (fire_core, fire_emitter, smoke_emitter)
and renders them with the lineup.py preview look (style C kit material, AgX, golden-hour sun) next to the real Pharos.
Blender axes: x right, y BACK (away from the water), z up; fronts face -y.
"""
import sys, os, math, random, subprocess
sys.dont_write_bytecode = True
A_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(A_DIR, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'harbour', 'blender', 'civic'))
sys.path.insert(1, os.path.join(ROOT, 'scripts', 'harbour', 'blender', 'island'))
import bpy, bmesh
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
from cv_lib import *          # Kit, PAL, primitives + hb_lib (MB, PT, box2, to_object, empty, ...)
from cv_works import rock_blob
import nl_common as ncm

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(n, d):
    return ARGV[ARGV.index(n) + 1] if n in ARGV else d


MODE = arg('--mode', 'both')
STATES = ['golden', 'night'] if arg('--state', 'golden') == 'both' else [arg('--state', 'golden')]
SAMPLES = int(arg('--samples', '32'))
PCT = int(arg('--pct', '100'))
YAW, PITCH = -24.0, 34.0
OUT = A_DIR
SCR = os.path.join(ROOT, 'outputs', 'classical-town', 'A-alexandria')
os.makedirs(SCR, exist_ok=True)
reset_scene()
scene = bpy.context.scene

# ------------------------------------------------------------------ Alexandrian palette (sits with the Pharos limestone)
AX = {k: lin(v) for k, v in {
    'st_cream': '#EADCC0', 'st_ochre': '#DDB27A', 'st_rose': '#DCAE98', 'st_white': '#EEE6D6',
    'lime': '#D8CBB0', 'lime_dark': '#B4A68C', 'marble': '#EFE9DC',
    'terra': '#A35F45', 'terra_dark': '#844832', 'terra_light': '#C27552', 'clay': '#C69B74',
    'p_red': '#A3392B', 'p_blue': '#2E4F8A', 'p_ochre': '#C9973C', 'p_black': '#2C2622',
    'olive': '#6E7D43', 'olive_dark': '#4F5E33', 'cloth': '#EFE6D2',
}.items()}
PAL.update(AX)


# ------------------------------------------------------------------ shared Hellenistic details
def antefixes(mb, a, b, n_out, step=1.15, col=None, h=0.6, w=0.42):
    """Palmette tiles standing along an eave a->b (terracotta, painted tip), facing n_out."""
    a, b = Vector(a), Vector(b)
    L = (b - a).length; t = (b - a) / L
    n = max(1, round(L / step))
    for i in range(n + 1):
        p = a + t * (L * i / n)
        poly(mb, (p - t * w / 2, p + t * w / 2, p + t * w / 4 + Vector((0, 0, h * 0.6)), p + Vector((0, 0, h)),
                  p - t * w / 4 + Vector((0, 0, h * 0.6))), col or PAL['terra_light'], 0, nrm=n_out, jitter=0.0)


def meander(mb, a, b, z, h, n_out, ground=None, key=None, unit=0.9):
    """Painted key-pattern band on a wall face from a to b (bottom at z, height h), proud of the wall."""
    a, b = Vector((a[0], a[1], z)), Vector((b[0], b[1], z))
    n = Vector(n_out).normalized()
    L = (b - a).length; t = (b - a) / L
    up = Vector((0, 0, 1))
    g, k = ground or PAL['p_red'], key or PAL['p_ochre']
    o = n * 0.05
    poly(mb, (a + o, b + o, b + o + up * h, a + o + up * h), g, 0, nrm=n, jitter=0.0)
    for zz in (0.0, h - 0.1):   # fillets
        poly(mb, (a + o * 1.4 + up * zz, b + o * 1.4 + up * zz, b + o * 1.4 + up * (zz + 0.1), a + o * 1.4 + up * (zz + 0.1)),
             PAL['p_black'], 0, nrm=n, jitter=0.0)
    m = int(L / unit)
    q = n * 0.08
    for i in range(m):       # one fret per unit: a stem + a hooked bar alternating top / bottom
        x = a + t * ((L - m * unit) / 2 + i * unit + unit * 0.2)
        bw = 0.11
        poly(mb, (x + q + up * h * 0.2, x + q + t * bw + up * h * 0.2, x + q + t * bw + up * h * 0.8, x + q + up * h * 0.8), k, 0, nrm=n, jitter=0.0)
        zb = h * (0.69 if i % 2 == 0 else 0.2)
        poly(mb, (x + q + up * zb, x + q + t * unit * 0.6 + up * zb, x + q + t * unit * 0.6 + up * (zb + bw), x + q + up * (zb + bw)),
             k, 0, nrm=n, jitter=0.0)


def frieze(mb, x0, x1, y, z, h, step=1.3, tg=None, mt=None):
    """Doric frieze on a -y face: blue triglyphs proud of red metopes."""
    poly(mb, ((x0, y - 0.02, z), (x1, y - 0.02, z), (x1, y - 0.02, z + h), (x0, y - 0.02, z + h)), mt or PAL['p_red'], 0,
         nrm=(0, -1, 0), jitter=0.0)
    n = max(2, round((x1 - x0) / step))
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        box2(mb, x - 0.26, y - 0.14, z, x + 0.26, y, z + h, tg or PAL['p_blue'], 0, skip=('+y', '-z', '+z'))


def entablature(mb, x0, x1, yf, yb, z, col, cornice=None):
    """Architrave + triglyph frieze + cornice along a front at yf (facing -y); returns the top z."""
    box2(mb, x0, yf, z, x1, yb, z + 0.75, col, 0)
    frieze(mb, x0 + 0.3, x1 - 0.3, yf, z + 0.75, 0.8)
    box2(mb, x0, yf + 0.1, z + 0.75, x1, yb, z + 1.55, col, 0, skip=('-y',))
    box2(mb, x0 - 0.35, yf - 0.35, z + 1.55, x1 + 0.35, yb, z + 1.9, cornice or col, 0)
    return z + 1.9


def lean_to(mb, x0, x1, yf, zf, yb, zb, col, ov=0.45, th=0.25):
    s = (zb - zf) / (yb - yf)
    y0, z0_ = yf - ov, zf - ov * s
    poly(mb, ((x0 - ov, y0, z0_), (x1 + ov, y0, z0_), (x1 + ov, yb, zb), (x0 - ov, yb, zb)), col, PT['tiles'], nrm=(0, -1, 1))
    poly(mb, ((x0 - ov, y0, z0_ - th), (x1 + ov, y0, z0_ - th), (x1 + ov, y0, z0_), (x0 - ov, y0, z0_)), mul(col, 0.7), 0, nrm=(0, -1, 0))
    return y0, z0_


def eave_x(y0, y1, z, rise, ov):
    """Front / back eave lines (y, z) of gable_roof(axis='x')."""
    drop = ov * rise / ((y1 - y0) / 2)
    return (y0 - ov, z - drop), (y1 + ov, z - drop)


def amphora(mb, c, s=1.0, col=None):
    c = Vector(c)
    lathe(mb, c, [(0.0, c.z), (0.12 * s, c.z + 0.05), (0.34 * s, c.z + 0.55 * s), (0.36 * s, c.z + 0.85 * s), (0.16 * s, c.z + 1.1 * s),
                  (0.1 * s, c.z + 1.35 * s), (0.14 * s, c.z + 1.42 * s)], col or PAL['terra_light'], 0, 6, smooth=True)


def olive_tree(mb, c, s=1.0):
    c = Vector(c)
    cyl(mb, c, 0.22 * s, 0.14 * s, c.z, c.z + 1.9 * s, PAL['timber_dark'], PT['boards'], 5)
    for (dx, dy, dz, r) in ((0, 0, 2.4, 1.3), (0.7, 0.3, 2.0, 0.9), (-0.6, -0.2, 2.2, 0.95)):
        sphere(mb, (c.x + dx * s, c.y + dy * s, c.z + dz * s), r * s, mix(PAL['olive'], PAL['olive_dark'], abs(dx)), 7, 4, PT['leaf'])


def win(K, c, n, w=0.7, h=0.95, frame=None):
    """Small high window: deep timber frame, no sill trim (no Georgian white)."""
    window(K, c, n, w, h, frame=frame or PAL['timber_dark'], sill=False, depth=0.06, mullion=True)


# =================================================================== 1. TOWN HOUSES (pair)
def build_houses(coll=None, variant=0):
    root = empty('houses', coll=coll)
    K = Kit(300 + variant)
    op = K.op
    P = 0.5
    wa, wb = (PAL['st_cream'], PAL['st_rose']) if variant == 0 else (PAL['st_ochre'], PAL['st_white'])
    box2(op, -15.5, -8.0, -1.5, 15.5, 8.0, P, PAL['granite'], PT['ashlar'], skip=('+z',))
    poly(op, ((-15.5, -8, P), (15.5, -8, P), (15.5, 8, P), (-15.5, 8, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))

    # ---- house A: courtyard house (inward-looking ranges around an open court, blank street wall + one door)
    X0, X1, Y0, Y1 = -14.0, -2.0, -5.5, 6.5
    YF, YB, XL = -2.6, 2.6, -10.6          # front range back face, back range front face, left range inner face
    E1, E2 = P + 4.6, P + 7.4              # single-storey ranges / two-storey back range
    soc = PAL['lime_dark']
    box2(op, X0, YB, P, X1, Y1, E2, wa, PT['render'])                     # back range (2 storeys)
    box2(op, X0, Y0, P, X1, YF, E1, wa, PT['render'])                     # front range (street)
    box2(op, X0, YF, P, XL, YB, E1, wa, PT['render'])                     # left range
    box2(op, X1 - 0.6, YF, P, X1, YB, E1 - 1.2, wa, PT['render'])         # right court wall
    box2(op, X0 - 0.12, Y0 - 0.12, P, X1 + 0.12, Y0 + 0.4, P + 0.9, soc, PT['ashlar'])
    # court: flagstones, a well head, an olive tree, a bench of amphorae
    poly(op, ((XL, YF, P + 0.05), (X1 - 0.6, YF, P + 0.05), (X1 - 0.6, YB, P + 0.05), (XL, YB, P + 0.05)), PAL['lime'], PT['cobble'], nrm=(0, 0, 1))
    cyl(op, (-7.6, 0.6), 0.6, 0.6, P, P + 0.9, PAL['marble'], 0, 8)
    olive_tree(op, (-4.3, -0.9, P), 0.95)
    for k in range(3):
        amphora(op, (-9.8 + k * 0.65, 2.0, P), 0.9)
    # roofs: low terracotta, antefixes on the street eaves
    rr = PAL['terra']
    gable_roof(op, X0, YB, X1, Y1, E2, 1.25, rr, PT['tiles'], ov=0.45, end_col=wa, end_pat=PT['render'], axis='x')
    gable_roof(op, X0, Y0, X1, YF, E1, 0.9, rr, PT['tiles'], ov=0.45, end_col=wa, end_pat=PT['render'], axis='x')
    gable_roof(op, X0, YF, XL, YB, E1, 0.8, PAL['terra_dark'], PT['tiles'], ov=0.3, end_col=wa, end_pat=PT['render'], axis='y', ends=False)
    (yfe, zfe), _ = eave_x(Y0, YF, E1, 0.9, 0.45)
    antefixes(op, (X0 - 0.4, yfe, zfe), (X1 + 0.4, yfe, zfe), (0, -1, 0))
    (yfe2, zfe2), _ = eave_x(YB, Y1, E2, 1.25, 0.45)
    antefixes(op, (X0 - 0.4, yfe2, zfe2), (X1 + 0.4, yfe2, zfe2), (0, -1, 0))
    meander(op, (X0, Y0), (X1, Y0), E1 - 1.3, 0.6, (0, -1, 0))
    meander(op, (X0, YB), (X1, YB), E2 - 1.3, 0.6, (0, -1, 0), ground=PAL['p_blue'], key=PAL['st_white'])
    # street front: one door with a stone frame, two small high windows; upper windows on the back range
    door(K, (-5.0, Y0, P), (0, -1, 0), 1.5, 2.6, col=PAL['p_blue'], frame=PAL['lime'], step=True)
    for x in (-12.0, -8.8):
        win(K, (x, Y0, P + 3.1), (0, -1, 0))
    for x in (-12.6, -9.4, -6.2, -3.4):
        win(K, (x, YB, P + 5.7), (0, -1, 0), 0.8, 1.1)
    for y in (-4.0, 4.4):
        win(K, (X0, y, P + 3.1), (-1, 0, 0))

    # ---- house B: cubic two-storey block with a flat roof terrace + pergola, a lower tiled wing
    BX0, BX1, BY0, BY1 = 1.0, 9.6, -4.6, 5.0
    EB = P + 7.8
    box2(op, BX0, BY0, P, BX1, BY1, EB, wb, PT['render'])
    box2(op, BX0 - 0.12, BY0 - 0.12, P, BX1 + 0.12, BY1 + 0.12, P + 0.9, soc, PT['ashlar'])
    box2(op, BX0 - 0.15, BY0 - 0.15, EB, BX1 + 0.15, BY1 + 0.15, EB + 0.25, PAL['lime'], 0)    # cornice
    for (a, b, c_, d) in ((BX0, BY0, BX1, BY0 + 0.3), (BX0, BY1 - 0.3, BX1, BY1), (BX0, BY0, BX0 + 0.3, BY1), (BX1 - 0.3, BY0, BX1, BY1)):
        box2(op, a, b, EB + 0.25, c_, d, EB + 1.05, wb, PT['render'], skip=('-z',))           # parapet
    poly(op, ((BX0 + 0.3, BY0 + 0.3, EB + 0.3), (BX1 - 0.3, BY0 + 0.3, EB + 0.3), (BX1 - 0.3, BY1 - 0.3, EB + 0.3), (BX0 + 0.3, BY1 - 0.3, EB + 0.3)),
         PAL['terra_light'], PT['cobble'], nrm=(0, 0, 1))
    # pergola: four posts, two beams, rafters, a vine canopy over the back half
    zp = EB + 0.3
    for (x, y) in ((BX0 + 1.0, 0.6), (BX1 - 1.0, 0.6), (BX0 + 1.0, BY1 - 0.9), (BX1 - 1.0, BY1 - 0.9)):
        box2(op, x - 0.14, y - 0.14, zp, x + 0.14, y + 0.14, zp + 2.4, PAL['timber'], PT['boards'], skip=('-z',))
    for y in (0.6, BY1 - 0.9):
        beam(op, (BX0 + 0.6, y, zp + 2.5), (BX1 - 0.6, y, zp + 2.5), 0.22, 0.22, PAL['timber_dark'])
    for k in range(6):
        x = BX0 + 1.0 + (BX1 - BX0 - 2.0) * k / 5
        beam(op, (x, 0.2, zp + 2.7), (x, BY1 - 0.5, zp + 2.7), 0.14, 0.14, PAL['timber'])
    for (x, y, r) in ((BX0 + 2.4, 2.4, 1.2), (BX0 + 5.0, 3.0, 1.4), (BX1 - 1.6, 1.6, 1.0)):
        lathe(op, (x, y), [(r, zp + 2.75), (r * 0.8, zp + 3.15), (0.0, zp + 3.3)], PAL['olive'], PT['leaf'], 7, smooth=False)
    amphora(op, (BX0 + 1.0, BY0 + 1.0, zp), 0.8); amphora(op, (BX0 + 1.6, BY0 + 0.9, zp), 0.7)
    meander(op, (BX0, BY0), (BX1, BY0), EB - 0.75, 0.5, (0, -1, 0), ground=PAL['p_blue'], key=PAL['st_white'])
    meander(op, (BX1, BY0), (BX1, BY1), EB - 0.75, 0.5, (1, 0, 0), ground=PAL['p_blue'], key=PAL['st_white'])
    door(K, (3.4, BY0, P), (0, -1, 0), 1.5, 2.7, col=PAL['p_red'], frame=PAL['lime'], step=True)
    win(K, (7.2, BY0, P + 3.0), (0, -1, 0))
    for x in (3.0, 5.4, 7.8):
        win(K, (x, BY0, P + 5.7), (0, -1, 0), 0.75, 1.1)
    for y in (-2.0, 2.6):
        win(K, (BX1, y, P + 5.7), (1, 0, 0), 0.75, 1.1)
    # wooden balcony on beams across the upper front (the one projecting element)
    box2(op, 4.6, BY0 - 1.1, P + 4.5, 8.8, BY0, P + 4.7, PAL['timber'], PT['planks_x'])
    for x in (4.8, 6.7, 8.6):
        beam(op, (x, BY0, P + 4.3), (x, BY0 - 1.1, P + 4.5), 0.18, 0.18, PAL['timber_dark'])
    rail(op, [(4.7, BY0 - 1.0, P + 4.7), (8.7, BY0 - 1.0, P + 4.7)], 0.9, PAL['timber_dark'], post_every=0.8)
    # lower tiled wing to the right
    WX0, WX1 = BX1, BX1 + 4.6
    box2(op, WX0, -2.8, P, WX1, 4.2, P + 4.2, wa, PT['render'])
    gable_roof(op, WX0, -2.8, WX1, 4.2, P + 4.2, 1.0, rr, PT['tiles'], ov=0.4, end_col=wa, end_pat=PT['render'], axis='y')
    win(K, (WX1, 0.6, P + 2.4), (1, 0, 0))
    door(K, (WX0 + 2.3, -2.8, P), (0, -1, 0), 1.3, 2.4, col=PAL['timber_dark'], frame=PAL['lime'], step=False)
    # street dressing: a stone bench, amphorae, potted shrubs
    box2(op, -1.4, -7.2, P, 0.6, -6.6, P + 0.5, PAL['lime'], PT['ashlar'])
    for (x, y) in ((11.6, -4.0), (12.3, -4.4), (-0.6, -6.0)):
        amphora(op, (x, y, P), 0.9)
    for x in (0.4, 10.6):
        cyl(op, (x, -5.6), 0.45, 0.55, P, P + 0.7, PAL['terra'], 0, 7)
        sphere(op, (x, -5.6, P + 1.2), 0.6, PAL['olive'], 7, 3, PT['leaf'])
    K.emit(root, 'houses_body', coll)
    return root


# =================================================================== 2. HARBOUR OFFICE (ethereum) - a small Doric stoa
OTHER_CHAINS = {
    'tron': 'red porphyry-ochre stoa, Doric columns painted red to mid-height, red velarium on a shorter quay front',
    'bsc': 'golden tufa + gilt acroteria; the crest on a round shield (clipeus) in the pediment, yellow velarium',
    'solana': 'black basalt Egyptianising pylon-front (cavetto cornice, battered walls) - Alexandria\'s Egyptian quarter',
    'hyperliquid-l1': 'Ionic order in white marble, two-storey stoa with a teal velarium on both floors',
    'base': 'Corinthian portico (acanthus capitals) on a tall podium, Roman-temple front, blue velarium',
    'arbitrum': 'tholos: a round colonnaded kiosk with a conical tile roof and a ring velarium',
    'polygon': 'timber-and-stucco warehouse with a loggia of square piers and a purple velarium across the court',
}


def build_office(chain='ethereum', coll=None):
    root = empty(f'harbour-office:{chain}', coll=coll)
    K = Kit(60)
    op = K.op
    P = 0.5
    box2(op, -10.0, -8.0, -1.5, 10.0, 8.0, P, PAL['granite'], PT['ashlar'], skip=('+z',))
    poly(op, ((-10, -8, P), (10, -8, P), (10, 8, P), (-10, 8, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    X0, X1 = -8.4, 8.4
    YS, YC, YW, YB = -4.6, -3.6, -0.4, 4.8      # stylobate front, column line, inner (rooms) wall, back wall
    ZS = P + 0.6
    stairs(op, X0 - 0.3, X1 + 0.3, YS - 0.9, P, ZS, 2, 0.45, PAL['lime'])
    box2(op, X0 - 0.3, YS, P, X1 + 0.3, YB + 0.3, ZS, PAL['lime'], PT['ashlar'], skip=('-z',))
    # walls: back + sides (antae run to the column line), inner wall with doors; painted dado (red below, ochre above)
    wall = PAL['st_cream']
    ZW = ZS + 5.0
    box2(op, X0, YW, ZS, X1, YB, ZW, wall, PT['render'])
    for s in (-1, 1):
        xa = X1 if s > 0 else X0
        box2(op, min(xa, xa - s * 0.8), YC - 0.4, ZS, max(xa, xa - s * 0.8), YW, ZW, PAL['lime'], PT['ashlar'])
    poly(op, ((X0 + 0.8, YW - 0.03, ZS), (X1 - 0.8, YW - 0.03, ZS), (X1 - 0.8, YW - 0.03, ZS + 1.6), (X0 + 0.8, YW - 0.03, ZS + 1.6)),
         PAL['p_red'], 0, nrm=(0, -1, 0), jitter=0.0)
    poly(op, ((X0 + 0.8, YW - 0.03, ZS + 1.6), (X1 - 0.8, YW - 0.03, ZS + 1.6), (X1 - 0.8, YW - 0.03, ZW), (X0 + 0.8, YW - 0.03, ZW)),
         PAL['st_ochre'], 0, nrm=(0, -1, 0), jitter=0.0)
    for x in (-5.0, 0.0, 5.0):
        door(K, (x, YW - 0.04, ZS), (0, -1, 0), 1.6 if x else 2.2, 2.9 if x else 3.4, col=PAL['bronze'] if not x else PAL['timber_dark'],
             frame=PAL['marble'], step=False)
    for x in (-6.8, -2.6, 2.6, 6.8):
        win(K, (x, YW - 0.04, ZS + 3.9), (0, -1, 0), 0.8, 0.8)
    for y in (0.9, 3.4):
        for s in (-1, 1):
            win(K, (s * X1, y, ZS + 3.4), (s, 0, 0), 0.8, 1.0)
    # Doric colonnade + entablature (polychrome frieze), all round the top of the walls
    xs = colonnade(op, X0 + 0.5, X1 - 0.5, YC, ZS, 5.0, 7, 0.42, PAL['marble'], cap_col=PAL['lime'])
    for x in xs:   # painted necking ring under each capital
        cyl(op, (x, YC), 0.39, 0.39, ZS + 4.35, ZS + 4.55, PAL['p_red'], 0, 8, top=False)
    zt = entablature(op, X0 - 0.2, X1 + 0.2, YC - 0.5, YB + 0.2, ZS + 5.0, PAL['lime'], cornice=PAL['marble'])
    # low gable roof, ridge along the quay, pedimented ends (stoa type); antefixes along the front eave
    RS = 1.9
    gable_roof(op, X0 - 0.2, YC - 0.5, X1 + 0.2, YB + 0.2, zt, RS, PAL['terra'], PT['tiles'], ov=0.5, end_col=PAL['marble'], end_pat=0, axis='x')
    (yfe, zfe), _ = eave_x(YC - 0.5, YB + 0.2, zt, RS, 0.5)
    antefixes(op, (X0 - 0.6, yfe, zfe), (X1 + 0.6, yfe, zfe), (0, -1, 0), step=1.2)
    for s in (-1, 1):   # blue tympana on the end pediments
        xa = s * (X1 + 0.25)
        ym = (YC - 0.5 + YB + 0.2) / 2
        poly(op, ((xa, YC + 0.2, zt + 0.05), (xa, YB - 0.5, zt + 0.05), (xa, ym, zt + RS - 0.45)), PAL['p_blue'], 0, nrm=(s, 0, 0), jitter=0.0)
    # central attic (painted frieze panel) + blue-tympanum pediment carrying the crest
    AX0, AX1, AY0, AY1, AZ1 = -2.9, 2.9, YC - 0.55, YC + 2.4, zt + 3.6
    box2(op, AX0, AY0, zt - 0.2, AX1, AY1, AZ1, PAL['st_white'], PT['render'])
    for (a, b, c_, d) in ((AX0, zt, AX1, zt + 0.3), (AX0, AZ1 - 0.3, AX1, AZ1), (AX0, zt, AX0 + 0.3, AZ1), (AX1 - 0.3, zt, AX1, AZ1)):
        poly(op, ((a, AY0 - 0.03, b), (c_, AY0 - 0.03, b), (c_, AY0 - 0.03, d), (a, AY0 - 0.03, d)), PAL['p_red'], 0, nrm=(0, -1, 0), jitter=0.0)
    cz, cs = (zt + AZ1) / 2, 2.6
    pediment(op, AX0 - 0.1, AX1 + 0.1, AY0 - 0.2, AY1, AZ1 + 0.55, 1.35, PAL['marble'], tymp=PAL['p_blue'], cornice=0.35)
    gable_roof(op, AX0 - 0.1, AY0 - 0.2, AX1 + 0.1, AY1, AZ1 + 0.55, 1.35, PAL['terra'], PT['tiles'], ov=0.0, axis='y', ends=False)
    poly(op, ((AX0 - 0.1, AY1, AZ1 + 0.55), (AX1 + 0.1, AY1, AZ1 + 0.55), (0, AY1, AZ1 + 1.9)), PAL['st_white'], PT['render'], nrm=(0, 1, 0))
    for (x, z, h) in ((0.0, AZ1 + 2.15, 1.1), (AX0 - 0.35, AZ1 + 0.5, 0.75), (AX1 + 0.35, AZ1 + 0.5, 0.75)):   # gilt acroteria
        poly(op, ((x - 0.4, AY0 - 0.45, z), (x + 0.4, AY0 - 0.45, z), (x + 0.2, AY0 - 0.45, z + h * 0.6), (x, AY0 - 0.45, z + h),
                  (x - 0.2, AY0 - 0.45, z + h * 0.6)), PAL['gilt'], 0, nrm=(0, -1, 0), jitter=0.0)
    disc(op, (0.0, AY0 - 0.05, AZ1 + 1.0), (0, -1, 0), 0.32, 0.12, PAL['gilt'], 8)
    crest_panel(K, root, (0.0, AY0 - 0.02, cz), cs, PAL['gilt'], coll)
    # velarium: two striped cloth sails (hb_cover) on timber poles over the quay, either side of the steps; low, so the
    # colonnade reads above them
    yi, yo, zi, zo = YS - 1.0, -7.7, P + 3.7, P + 3.3
    for (xa, xb) in ((X0 - 0.2, -2.0), (2.0, X1 + 0.2)):
        n = 6
        for k in range(n):
            x0_ = xa + (xb - xa) * k / n; x1_ = xa + (xb - xa) * (k + 1) / n
            sh = (1.0, 1.0, 1.0) if k % 2 == 0 else (0.72, 0.72, 0.72)
            ym, zm = (yi + yo) / 2, (zi + zo) / 2 - 0.3   # sag
            poly(K.cover, ((x0_, yi, zi), (x1_, yi, zi), (x1_, ym, zm), (x0_, ym, zm)), sh, 0, nrm=(0, -0.3, 1), jitter=0.0)
            poly(K.cover, ((x0_, ym, zm), (x1_, ym, zm), (x1_, yo, zo), (x0_, yo, zo)), sh, 0, nrm=(0, -0.2, 1), jitter=0.0)
            poly(K.cover, ((x0_, yo, zo), (x1_, yo, zo), ((x0_ + x1_) / 2, yo, zo - 0.6)), mul(sh, 0.9), 0, nrm=(0, -1, 0), jitter=0.0)  # scallop
        for x in (xa, xb):
            for y, z in ((yi, zi), (yo, zo)):
                cyl(op, (x, y), 0.11, 0.08, P, z + 0.6, PAL['timber_dark'], PT['boards'], 6)
                sphere(op, (x, y, z + 0.7), 0.16, PAL['bronze_light'], 6, 3)
    # quay dressing: bronze tripod lamps flanking the steps, amphorae, a merchant's bale
    for x in (-1.3, 1.3):
        for k in range(3):
            a = 2 * math.pi * k / 3 + 0.5
            beam(op, (x + 0.45 * math.cos(a), YS - 1.9 + 0.45 * math.sin(a), P), (x, YS - 1.9, P + 1.7), 0.08, 0.08, PAL['bronze'])
        lathe(op, (x, YS - 1.9), [(0.1, P + 1.6), (0.5, P + 1.75), (0.55, P + 2.0)], PAL['bronze_light'], PT['metal'], 8, smooth=True, cap=False)
        cyl(K.em, (x, YS - 1.9), 0.45, 0.45, P + 1.9, P + 1.95, (1.0, 0.6, 0.2), 0, 8)
    for (x, y) in ((-8.8, -6.4), (-8.2, -6.9), (-8.6, -5.7), (-7.6, -6.2)):
        amphora(op, (x, y, P), 0.95)
    crate(op, (6.4, -6.6, P), 0.9, PAL['timber'], 0.2)
    # flag: a tall timber mast with a gilt finial on a stepped marble foot
    fx, fy_ = 8.9, -7.0
    box2(op, fx - 0.6, fy_ - 0.6, P, fx + 0.6, fy_ + 0.6, P + 0.5, PAL['lime'], PT['ashlar'])
    box2(op, fx - 0.42, fy_ - 0.42, P + 0.5, fx + 0.42, fy_ + 0.42, P + 1.0, PAL['marble'], 0)
    cyl(op, (fx, fy_), 0.15, 0.08, P + 1.0, P + 15.0, PAL['timber_dark'], 0, 6)
    sphere(op, (fx, fy_, P + 15.1), 0.22, PAL['gilt'], 6, 3)
    e = empty('flag_pole_top', (fx, fy_, P + 14.8), parent=root, coll=coll)
    e['anim'] = 'chain house flag (crest on the chain colour): the runtime hangs a waving flag here'
    made = K.emit(root, 'office_body', coll)
    made['cover'].name = 'awning'
    made['cover']['anim'] = 'velarium: hb_cover, tinted by the chain colour (COLOR_0 = stripe shade)'
    return root


# =================================================================== 3. THE MINT - temple-treasury precinct
def coin_press(K, root, i, xc, yc, z0, coll=None):
    """Timber screw press (olive-press type): stone anvil block, two posts, head beam; press_N = screw + capstan bars."""
    op = K.op
    box2(op, xc - 0.9, yc - 0.7, z0, xc + 0.9, yc + 0.7, z0 + 0.9, PAL['lime'], PT['ashlar'])
    box2(op, xc - 0.4, yc - 0.4, z0 + 0.9, xc + 0.4, yc + 0.4, z0 + 1.15, PAL['bronze'], PT['metal'])
    for s in (-1, 1):
        box2(op, xc + s * 1.05 - 0.2, yc - 0.25, z0, xc + s * 1.05 + 0.2, yc + 0.25, z0 + 3.5, PAL['timber_dark'], PT['boards'])
    box2(op, xc - 1.5, yc - 0.35, z0 + 3.5, xc + 1.5, yc + 0.35, z0 + 4.1, PAL['timber_dark'], PT['boards'])
    mb = MB(100 + i)
    zf = z0 + 4.6
    cyl(mb, (xc, yc), 0.17, 0.17, z0 + 1.45, zf + 0.25, PAL['timber'], PT['boards'], 6)
    box2(mb, xc - 0.34, yc - 0.34, z0 + 1.2, xc + 0.34, yc + 0.34, z0 + 1.5, PAL['bronze_light'], PT['metal'])
    beam(mb, (xc - 1.7, yc, zf), (xc + 1.7, yc, zf), 0.16, 0.16, PAL['timber'])
    beam(mb, (xc, yc - 1.7, zf), (xc, yc + 1.7, zf), 0.16, 0.16, PAL['timber'])
    ob = to_object(mb, f'press_{i}', 'hb_opaque', parent=root, origin=(xc, yc, zf), coll=coll)
    ob['anim'] = 'screw press: rotate about local +Y (glTF) +/-0.7 rad and drop 0.3 m on each strike; rate ~ mint volume'
    return ob


def build_mint(coll=None):
    root = empty('mint', coll=coll)
    K = Kit(77)
    op = K.op
    P = 0.4
    W2, D2 = 27.0, 19.0
    box2(op, -W2, -D2, -1.5, W2, D2, P, PAL['granite'], PT['ashlar'], skip=('+z',))
    poly(op, ((-W2, -D2, P), (W2, -D2, P), (W2, D2, P), (-W2, D2, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))
    # temenos wall (back + sides), stucco with a tile coping
    for (a, b, c_, d) in ((-W2, D2 - 0.8, W2, D2), (-W2, -6.0, -W2 + 0.8, D2), (W2 - 0.8, -6.0, W2, D2)):
        box2(op, a, b, P, c_, d, P + 2.6, PAL['st_cream'], PT['render'])
        box2(op, a - 0.15, b - 0.15, P + 2.6, c_ + 0.15, d + 0.15, P + 2.95, PAL['terra'], PT['tiles'])

    # ---- the temple-treasury: crepidoma, hexastyle Doric portico, cella, blue pediment with a gilt coin
    TX0, TX1, TY0, TY1 = -8.0, 8.0, -4.2, 15.6
    ZC = P + 1.2
    for k in range(3):
        g = 0.55 * (2 - k)
        box2(op, TX0 - 0.6 - g, TY0 - 1.2 - g, P + 0.4 * k, TX1 + 0.6 + g, TY1 + 0.6 + g, P + 0.4 * (k + 1), PAL['lime'], PT['ashlar'], skip=('-z',))
    xs = colonnade(op, TX0 + 0.9, TX1 - 0.9, TY0 + 0.4, ZC, 7.4, 6, 0.62, PAL['marble'], cap_col=PAL['lime'])
    for x in xs:
        cyl(op, (x, TY0 + 0.4), 0.56, 0.56, ZC + 6.45, ZC + 6.7, PAL['p_red'], 0, 8, top=False)
    box2(op, TX0 + 0.6, TY0 + 3.2, ZC, TX1 - 0.6, TY1, ZC + 7.4, PAL['st_cream'], PT['ashlar'])         # cella
    door(K, (0.0, TY0 + 3.17, ZC), (0, -1, 0), 2.8, 4.6, col=PAL['bronze'], frame=PAL['marble'], step=False)
    for x in (-4.6, 4.6):        # painted shields on the pronaos wall
        disc(op, (x, TY0 + 3.17, ZC + 3.6), (0, -1, 0), 1.0, 0.12, PAL['gilt'], 10, col_side=PAL['bronze'])
    zt = entablature(op, TX0, TX1, TY0 - 0.2, TY1, ZC + 7.4, PAL['lime'], cornice=PAL['marble'])
    PR = 2.5
    pediment(op, TX0 - 0.1, TX1 + 0.1, TY0 - 0.55, TY1, zt + 0.55, PR, PAL['marble'], tymp=PAL['p_blue'], cornice=0.45)
    gable_roof(op, TX0 - 0.1, TY0 - 0.55, TX1 + 0.1, TY1 + 0.3, zt + 0.55, PR, PAL['terra'], PT['tiles'], ov=0.35, axis='y', ends=False)
    poly(op, ((TX0, TY1 + 0.3, zt + 0.55), (TX1, TY1 + 0.3, zt + 0.55), (0, TY1 + 0.3, zt + 0.55 + PR)), PAL['st_cream'], PT['render'], nrm=(0, 1, 0))
    for s in (-1, 1):
        antefixes(op, (s * (TX1 + 0.45), TY0, zt + 0.45), (s * (TX1 + 0.45), TY1, zt + 0.45), (s, 0, 0), step=1.4)
    disc(op, (0.0, TY0 - 0.3, zt + 1.35), (0, -1, 0), 0.85, 0.2, PAL['gold'], 12, col_side=PAL['gilt'])   # the coin in the tympanum
    for (x, z, h) in ((0.0, zt + 0.55 + PR + 0.3, 1.4), (TX0 - 0.4, zt + 0.5, 0.9), (TX1 + 0.4, zt + 0.5, 0.9)):
        poly(op, ((x - 0.5, TY0 - 1.0, z), (x + 0.5, TY0 - 1.0, z), (x + 0.25, TY0 - 1.0, z + h * 0.6), (x, TY0 - 1.0, z + h),
                  (x - 0.25, TY0 - 1.0, z + h * 0.6)), PAL['gilt'], 0, nrm=(0, -1, 0), jitter=0.0)

    # ---- workshop wings: arched bays opening on the forecourt (presses at the left bay mouths, kilns before the right)
    WZ = P + 6.4
    WY0, WY1 = 1.0, 12.0
    for (xa, xb, name) in ((-25.6, -11.0, 'L'), (11.0, 25.6, 'R')):
        box2(op, xa, WY0 + 0.6, P, xb, WY1, WZ, PAL['st_ochre'], PT['render'], skip=('-y',))
        box2(op, xa + 0.3, WY0 + 0.6, P, xb - 0.3, WY0 + 2.4, WZ - 0.4, PAL['interior'], 0, skip=('-z', '+z', '+y'))
        arcade(op, xa, xb, WY0, 0.6, P, WZ, 3, 1.1, P + 3.3, PAL['st_ochre'], PT['render'], keystone=PAL['lime'])
        box2(op, xa - 0.2, WY0 - 0.2, P, xb + 0.2, WY0 + 0.8, P + 0.6, PAL['lime_dark'], PT['ashlar'])
        gable_roof(op, xa, WY0, xb, WY1, WZ, 1.7, PAL['terra'], PT['tiles'], ov=0.45, end_col=PAL['st_ochre'], end_pat=PT['render'], axis='x')
        (yfe, zfe), _ = eave_x(WY0, WY1, WZ, 1.7, 0.45)
        antefixes(op, (xa - 0.4, yfe, zfe), (xb + 0.4, yfe, zfe), (0, -1, 0), step=1.3)
        meander(op, (xa, WY0), (xb, WY0), WZ - 0.7, 0.5, (0, -1, 0))
    bays_L = [(-25.6 + 1.1 + r + i * (1.1 + 2 * r)) for i, r in enumerate([((14.6 - 4 * 1.1) / 6)] * 3)]
    for i, xc in enumerate(bays_L):
        coin_press(K, root, i, xc, WY0 - 1.1, P, coll)
        crate(op, (xc + 1.6, WY0 - 2.3, P), 0.8, PAL['timber_dark'], 0.3)
        cyl(op, (xc + 1.6, WY0 - 2.3), 0.3, 0.12, P + 0.8, P + 1.05, PAL['gold'], PT['metal'], 6)

    # ---- three domed kilns in front of the right wing; short stone flues = chimney_N; glowing mouths = furnace_glow
    glow = MB(79)
    for i, kx in enumerate((14.0, 18.3, 22.6)):
        ky = -2.6
        lathe(op, (kx, ky), [(2.1, P), (2.15, P + 1.2), (1.85, P + 2.4), (1.2, P + 3.3), (0.6, P + 3.7)], PAL['clay'], PT['render'], 9,
              smooth=True, cap=False, colfn=lambda z: mix(PAL['clay'], PAL['soot2'], sstep(P + 1.6, P + 3.9, z)))
        box2(op, kx - 0.55, ky - 0.55, P + 3.5, kx + 0.55, ky + 0.55, P + 5.0, PAL['lime_dark'], PT['ashlar'])   # flue
        box2(op, kx - 0.7, ky - 0.7, P + 5.0, kx + 0.7, ky + 0.7, P + 5.3, PAL['soot2'], 0)
        poly(op, ((kx - 0.4, ky - 0.4, P + 5.31), (kx + 0.4, ky - 0.4, P + 5.31), (kx + 0.4, ky + 0.4, P + 5.31), (kx - 0.4, ky + 0.4, P + 5.31)),
             (0.01, 0.01, 0.01), 0, nrm=(0, 0, 1), jitter=0.0)
        e = empty(f'chimney_{i}', (kx, ky, P + 5.5), parent=root, coll=coll)
        e['anim'] = 'smoke emitter at the kiln flue; puff rate/darkness ~ mint volume'
        # stone mouth porch with an arched glowing opening facing the forecourt
        fy = ky - 2.6
        box2(op, kx - 1.0, fy, P, kx + 1.0, ky - 1.2, P + 2.1, PAL['lime'], PT['ashlar'])
        arc = [(kx + 0.55 * math.cos(math.pi * k / 6), P + 1.1 + 0.55 * math.sin(math.pi * k / 6)) for k in range(7)]
        poly(glow, [(kx - 0.55, fy - 0.03, P + 0.25), (kx + 0.55, fy - 0.03, P + 0.25)] + [(x, fy - 0.03, z) for x, z in arc],
             (1.0, 0.45, 0.12), 0, nrm=(0, -1, 0), jitter=0.0)
        box2(glow, kx - 0.5, fy - 0.9, P, kx + 0.5, fy, P + 0.15, (1.0, 0.5, 0.15), 0, skip=('-z',))   # ember spill
        crate(op, (kx + 1.4, fy - 0.6, P), 0.7, PAL['timber_dark'], 0.5)
    gl = to_object(glow, 'furnace_glow', 'hb_emissive', parent=root, coll=coll)
    gl['anim'] = 'kiln mouths + ember spills: emissive strength ~ mint volume (flicker)'

    # ---- undershot waterwheel on a raised stone leat across the front left (water flows +x -> -x to the sea)
    LY0, LY1, LZ = -14.4, -11.6, P + 1.3
    box2(op, -W2 - 2.0, LY0 - 0.6, P - 2.0, -6.0, LY0, LZ + 0.3, PAL['lime_dark'], PT['ashlar'])
    box2(op, -W2 - 2.0, LY1, P - 2.0, -6.0, LY1 + 0.6, LZ + 0.3, PAL['lime_dark'], PT['ashlar'])
    box2(op, -6.6, LY0, P, -6.0, LY1, LZ + 0.3, PAL['lime_dark'], PT['ashlar'])
    poly(op, ((-W2 - 2.0, LY0, LZ), (-6.6, LY0, LZ), (-6.6, LY1, LZ), (-W2 - 2.0, LY1, LZ)), PAL['water'], 0, nrm=(0, 0, 1))
    wheel = MB(60)
    wc = Vector((-17.0, (LY0 + LY1) / 2, LZ + 3.0))
    R_, W_ = 3.5, 2.0
    for yy in (wc.y - W_ / 2, wc.y + W_ / 2):
        for k in range(14):
            a0, a1 = 2 * math.pi * k / 14, 2 * math.pi * (k + 1) / 14
            beam(wheel, wc + Vector((R_ * math.cos(a0), yy - wc.y, R_ * math.sin(a0))), wc + Vector((R_ * math.cos(a1), yy - wc.y, R_ * math.sin(a1))),
                 0.26, 0.36, PAL['timber_dark'], up=Vector((0, 1, 0)))
        for k in range(6):
            a = 2 * math.pi * (k + 0.25) / 6
            beam(wheel, wc + Vector((0, yy - wc.y, 0)), wc + Vector((R_ * math.cos(a), yy - wc.y, R_ * math.sin(a))), 0.2, 0.2, PAL['timber'])
    for k in range(14):
        a = 2 * math.pi * (k + 0.5) / 14
        d = Vector((math.cos(a), 0, math.sin(a)))
        box(wheel, wc + d * (R_ - 0.4), (0.8, W_ + 0.2, 0.12), PAL['timber'], PT['boards'], axes=(d, Vector((0, 1, 0)), Vector((-d.z, 0, d.x))))
    rod(wheel, wc - Vector((0, W_ / 2 + 0.9, 0)), wc + Vector((0, W_ / 2 + 0.9, 0)), 0.28, PAL['bronze'], 8, cap=True)
    wob = to_object(wheel, 'wheel', 'hb_opaque', parent=root, origin=wc, coll=coll)
    wob['anim'] = 'waterwheel: rotate about local Z (glTF; the axle, Blender Y); undershot - turns with the flow; speed ~ mint volume'
    for yy in (LY0 - 0.3, LY1 + 0.3):   # stone bearing piers
        box2(op, wc.x - 0.45, yy - 0.3, LZ + 0.3, wc.x + 0.45, yy + 0.3, wc.z + 0.3, PAL['lime'], PT['ashlar'])
    # forecourt: a marble altar-table of ingots before the steps, coin chests, amphorae
    box2(op, -1.8, -9.6, P, 1.8, -8.0, P + 1.0, PAL['marble'], 0)
    for k in range(4):
        box2(op, -1.5 + k * 0.78, -9.2, P + 1.0, -0.9 + k * 0.78, -8.4, P + 1.25, PAL['gold'], PT['metal'])
    for (x, y) in ((-6.0, -7.0), (6.0, -7.0)):
        cyl(op, (x, y), 0.15, 0.1, P, P + 3.2, PAL['bronze'], 0, 6)
        lathe(op, (x, y), [(0.15, P + 3.1), (0.55, P + 3.25), (0.6, P + 3.5)], PAL['bronze_light'], PT['metal'], 8, smooth=True, cap=False)
        cyl(K.em, (x, y), 0.5, 0.5, P + 3.4, P + 3.45, (1.0, 0.6, 0.2), 0, 8)
    for (x, y) in ((9.0, -14.0), (9.7, -14.4), (9.2, -13.2), (-4.0, 6.0)):
        amphora(op, (x, y, P), 1.0)
    K.emit(root, 'mint_body', coll)
    return root


# =================================================================== 4. THE BURN - bronze fire-altar on a stepped platform, rocky islet
def build_burn(coll=None):
    root = empty('burn', coll=coll)
    K = Kit(21)
    op = K.op
    rng = random.Random(11)
    for k in range(9):
        a = 2 * math.pi * k / 9 + 0.3
        rr = 10.4 + rng.uniform(-0.6, 0.6)
        rock_blob(op, (rr * math.cos(a), rr * math.sin(a), -1.2), rng.uniform(2.6, 3.6), rng.uniform(1.4, 2.6), rng,
                  col=mix(PAL['lime_dark'], PAL['rock_dark'], rng.uniform(0.2, 0.6)))
    PZ = 0.9
    oct_ = [Vector((10.0 * math.cos(math.pi / 8 + k * math.pi / 4), 10.0 * math.sin(math.pi / 8 + k * math.pi / 4), 0)) for k in range(8)]
    for k in range(8):
        a, b = oct_[k], oct_[(k + 1) % 8]
        poly(op, ((a.x, a.y, -2.5), (b.x, b.y, -2.5), (b.x, b.y, PZ), (a.x, a.y, PZ)), PAL['lime_dark'], PT['ashlar'], nrm=a + b)
        poly(op, ((0, 0, PZ), (a.x, a.y, PZ), (b.x, b.y, PZ)), mix(PAL['quay'], PAL['soot2'], 0.25), PT['cobble'], nrm=(0, 0, 1))
    # landing stair down to the water on the front
    stairs(op, -1.8, 1.8, -12.6, -1.6, PZ, 5, 0.55, PAL['lime'])
    # stepped platform (krepis), three steps
    z = PZ
    for k, hw in enumerate((6.6, 5.6, 4.6)):
        box2(op, -hw, -hw, z, hw, hw, z + 0.5, PAL['lime'] if k % 2 == 0 else PAL['marble'], PT['ashlar'], skip=('-z',))
        z += 0.5
    ZP = z
    # the altar: moulded block, painted frieze, volute cushions (Ionic altar) at the ends
    box2(op, -3.0, -2.2, ZP, 3.0, 2.2, ZP + 0.35, PAL['marble'], 0)
    box2(op, -2.7, -1.9, ZP + 0.35, 2.7, 1.9, ZP + 1.75, PAL['marble'], PT['ashlar'])
    meander(op, (-2.7, -1.9), (2.7, -1.9), ZP + 1.05, 0.45, (0, -1, 0), unit=0.75)
    box2(op, -3.0, -2.2, ZP + 1.75, 3.0, 2.2, ZP + 2.05, PAL['marble'], 0)
    for s in (-1, 1):
        rod(op, (s * 2.75, -2.25, ZP + 2.35), (s * 2.75, 2.25, ZP + 2.35), 0.42, PAL['marble'], 8, cap=True)
        disc(op, (s * 2.75, -2.25, ZP + 2.35), (0, -1, 0), 0.3, 0.06, PAL['p_red'], 8)
    # the great bronze brazier: lion-paw tripod stand + wide bowl with a gilt rim
    BZ = ZP + 2.05
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 2
        beam(op, (2.0 * math.cos(a), 2.0 * math.sin(a) * 0.8, BZ), (0.9 * math.cos(a), 0.9 * math.sin(a) * 0.8, BZ + 1.6), 0.35, 0.35, PAL['bronze'], PT['metal'])
        sphere(op, (2.0 * math.cos(a), 2.0 * math.sin(a) * 0.8, BZ + 0.2), 0.35, PAL['bronze_light'], 6, 3)
    cyl(op, (0, 0), 0.5, 0.6, BZ, BZ + 1.6, PAL['bronze'], PT['metal'], 8)
    bz = BZ + 1.5
    lathe(op, (0, 0), [(0.6, bz), (2.2, bz + 0.35), (3.3, bz + 1.0), (3.75, bz + 1.6), (3.95, bz + 1.75)], PAL['bronze'], PT['metal'], 14, smooth=True,
          cap=False, colfn=lambda zz: mix(PAL['bronze'], PAL['bronze_light'], sstep(bz, bz + 1.7, zz)))
    lathe(op, (0, 0), [(3.95, bz + 1.75), (4.1, bz + 1.9), (3.75, bz + 1.95)], PAL['gilt'], PT['metal'], 14, smooth=True, cap=False)
    for k in range(4):   # ring handles
        a = 2 * math.pi * k / 4 + math.pi / 4
        disc(op, (3.7 * math.cos(a), 3.7 * math.sin(a), bz + 1.15), (math.cos(a), math.sin(a), 0), 0.35, 0.1, PAL['bronze_light'], 6)
    # fire_core: ember bed + tall faceted flames (origin on the bed: the runtime scales it with burn volume)
    fire = MB(71)
    fc = Vector((0, 0, bz + 1.5))
    lathe(fire, fc, [(3.6, fc.z), (2.2, fc.z + 0.5), (0.0, fc.z + 0.7)], (1.0, 0.4, 0.1), 0, 12, smooth=False)
    flames(fire, fc + Vector((0, 0, 0.4)), random.Random(5), 11, 2.7, 5.0, 9.5, col=(1.0, 0.62, 0.2))
    fob = to_object(fire, 'fire_core', 'hb_emissive', parent=root, origin=fc, coll=coll)
    fob['anim'] = 'flames: scale (y up) and emissive ~ burn volume; flicker'
    empty('fire_emitter', (0, 0, fc.z + 3.0), parent=root, coll=coll)['anim'] = 'sparks / embers / heat shimmer from the bowl'
    empty('smoke_emitter', (0, 0, fc.z + 10.0), parent=root, coll=coll)['anim'] = 'smoke column above the flames ~ burn volume'
    # four bronze torch-stands on the platform corners
    for (x, y) in ((-5.6, -5.6), (5.6, -5.6), (-5.6, 5.6), (5.6, 5.6)):
        cyl(op, (x, y), 0.14, 0.1, PZ + 0.5, PZ + 3.6, PAL['bronze'], 0, 6)
        lathe(op, (x, y), [(0.1, PZ + 3.5), (0.5, PZ + 3.7), (0.55, PZ + 3.95)], PAL['bronze_light'], PT['metal'], 7, smooth=True, cap=False)
        flames(K.em, (x, y, PZ + 3.9), random.Random(int(x * 7 + y)), 3, 0.35, 0.8, 1.4, col=(1.0, 0.6, 0.2), segs=4)
    # offering coins spilt on the top step
    for k in range(6):
        a = rng.uniform(0, 2 * math.pi)
        cyl(op, (4.3 * math.cos(a), 4.3 * math.sin(a)), 0.25, 0.25, ZP - 0.5, ZP - 0.38, PAL['gold'], PT['metal'], 7)
    K.emit(root, 'burn_body', coll)
    return root


BUILDERS = {'houses': build_houses, 'office': build_office, 'mint': build_mint, 'burn': build_burn}
LABEL = {'houses': 'Town houses (courtyard + terrace)', 'office': 'Harbour office: ethereum (stoa)',
         'mint': 'The Mint (temple-treasury)', 'burn': 'The Burn (fire-altar)'}
FOOT = {'houses': (31, 16), 'office': (20, 16), 'mint': (54, 38), 'burn': (26, 26)}

# ------------------------------------------------------------------ preview look (copied from civic/lineup.py)
node, link, sep, C, SX, mixc = ncm.node, ncm.link, ncm.sep, ncm.C, ncm.SX, ncm.mixc
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


def dress(objs, chain=None):
    for o in objs:
        if o.type != 'MESH' or not o.data.materials:
            continue
        ca = o.data.color_attributes
        if 'Col' not in ca and len(ca):
            ca[0].name = 'Col'
        nm = o.data.materials[0].name.split('.')[0]
        if nm == 'hb_window':
            o.data.materials[0] = ncm.M['window']
        elif nm in ('hb_emissive', 'hb_fire'):
            o.data.materials[0] = EM
        elif nm == 'hb_cover':
            o.data.materials[0] = COVER
            o.color = (*lin(CHAINS.get(chain, '#C2453A')), 1)
        elif nm == 'hb_crest':
            o.data.materials[0] = crest_mat(chain or 'ethereum')
        else:
            o.data.materials[0] = ncm.M['kit']


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
    win_ = ncm.M['window'].node_tree.nodes['WIN_K']; lamp = EM.node_tree.nodes['LAMP_K']
    if st == 'golden':
        sun.data.energy = 5.2; sun.data.color = lin('#FFB070'); aim(sun, YAW - 70 - 90, 16)
        fill.data.energy = 0.35; fill.data.color = lin('#7F98D6'); aim(fill, YAW + 90, 35)
        ncm.set_ramp(ramp, [(0, lin('#C9A89A')), (0.3, lin('#8C9AC0')), (1, lin('#5470A6'))]); bg.inputs['Strength'].default_value = 0.62
        win_.outputs[0].default_value = 1.2; lamp.outputs[0].default_value = 6.0
        gl.inputs['Strength'].default_value = 0.2; gl.inputs['Threshold'].default_value = 1.3
        scene.view_settings.exposure = 0.25
        for p in POINTS:
            p.data.energy = p['e'] * 0.15
    else:
        sun.data.energy = 1.1; sun.data.color = lin('#A9BCFF'); aim(sun, YAW - 70 - 90, 32)
        fill.data.energy = 0.18; fill.data.color = lin('#5A6FB0'); aim(fill, YAW + 90, 35)
        ncm.set_ramp(ramp, [(0, lin('#2C3F6E')), (0.35, lin('#1C2B55')), (1, lin('#0B1330'))]); bg.inputs['Strength'].default_value = 1.2
        win_.outputs[0].default_value = 6.0; lamp.outputs[0].default_value = 30.0
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


def finish(root, chain=None):
    """Dress materials; preview flag at flag_pole_top; point lights at fires; returns world bbox points."""
    objs = descendants(root)
    dress(objs, chain)
    bpy.context.view_layer.update()
    for o in objs:
        nm = o.name.split('.')[0]
        if nm == 'flag_pole_top':
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
        if nm in ('fire_core', 'furnace_glow'):
            c = sum((o.matrix_world @ Vector(b) for b in o.bound_box), Vector()) / 8
            L = add_light('pt_' + o.name, 'POINT', color=lin('#FF9A4A'), shadow_soft_size=2.0)
            L.location = c + Vector((0, -2.0, 1.0)); L['e'] = 30000.0 if 'fire' in nm else 12000.0
            POINTS.append(L)
    pts = []
    for o in objs:
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(b) for b in o.bound_box]
    return pts


def stage(kind, at, ground=True, **kw):
    root = BUILDERS[kind](**kw)
    root.location = at
    bpy.context.view_layer.update()
    pts = finish(root, 'ethereum' if kind == 'office' else None)
    if ground:
        w, d = FOOT[kind]
        x, y = at[0], at[1]
        if kind == 'burn':
            surface('sea_' + kind, x - 60, y - 60, x + 60, y + 60, -2.4, None, mat=SEA)
        else:
            surface('land_' + kind, x - w / 2 - 14, y - d / 2 - 4, x + w / 2 + 14, y + d / 2 + 14, -0.02, PAL['grass'], 6)
            surface('quay_' + kind, x - w / 2 - 14, y - d / 2 - 14, x + w / 2 + 14, y - d / 2 - 4, -0.02, PAL['quay'], 4)
            surface('sea_' + kind, x - w / 2 - 60, y - d / 2 - 80, x + w / 2 + 60, y - d / 2 - 14, -2.4, None, mat=SEA)
    return root, pts


def import_pharos(at):
    raw = os.path.join(ROOT, 'outputs', 'harbour', 'pharos', 'lighthouse.raw.glb')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=raw)
    new = [o for o in bpy.data.objects if o not in before]
    top = [o for o in new if o.parent is None]
    for o in top:
        o.location = Vector(at)
    dress(new)
    bpy.context.view_layer.update()
    for o in new:
        if o.name.split('.')[0] == 'fire_core':
            L = add_light('pt_pharos', 'POINT', color=lin('#FF9A4A'), shadow_soft_size=3.0)
            L.location = o.matrix_world.translation + Vector((0, -4, 2)); L['e'] = 200000.0
            POINTS.append(L)
    pts = []
    for o in new:
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(b) for b in o.bound_box]
    return new, pts


def camera(fov=24.0):
    cd = bpy.data.cameras.new('cam'); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(fov); cd.clip_start = 1; cd.clip_end = 8000
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


def clear_scene_objects(keep):
    POINTS.clear()
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)


cam = camera()
BASE = {sun, fill, cam}
from PIL import Image, ImageDraw, ImageFont
FONT = '/usr/share/fonts/noto/NotoSerif-Bold.ttf'
TRIS = {}

if MODE in ('sheet', 'both'):
    scene.render.resolution_x, scene.render.resolution_y = 960, 640
    staged = {}
    for i, k in enumerate(BUILDERS):
        staged[k] = stage(k, (i * 600.0, 0.0, 0.0))
        TRIS[k] = tri_count(descendants(staged[k][0]))
    for st in STATES:
        set_state(st)
        tiles = []
        for k in BUILDERS:
            fit(cam, staged[k][1], margin=0.06)
            p = os.path.join(SCR, f'tile-{k}-{st}.png')
            render(p)
            tiles.append((k, p))
        W_, H_ = int(960 * PCT / 100), int(640 * PCT / 100)
        sheet = Image.new('RGB', (W_ * 2, H_ * 2), (20, 24, 30))
        d = ImageDraw.Draw(sheet)
        f = ImageFont.truetype(FONT, max(14, W_ // 34))
        for j, (k, p) in enumerate(tiles):
            ox, oy = (j % 2) * W_, (j // 2) * H_
            sheet.paste(Image.open(p).convert('RGB'), (ox, oy))
            t = LABEL[k] + f'  ·  {TRIS[k]} tris'
            d.text((ox + 13, oy + 11), t, font=f, fill=(10, 14, 20))
            d.text((ox + 12, oy + 10), t, font=f, fill=(250, 242, 226))
        out = os.path.join(OUT, f'sheet-{st}.jpg')
        sheet.save(out, quality=90)
        print('SHEET', out, TRIS)
    clear_scene_objects(BASE)

if MODE in ('lineup', 'both'):
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    # the Pharos on its rock behind the harbour; the town on one quay in front; the Burn out on the water
    surface('sea', -1500, -1500, 1500, 1500, -2.4, None, mat=SEA)
    surface('land', -102, -30, 82, 36, -0.02, PAL['grass'], 6)
    surface('quay', -102, -38, 82, -30, -0.02, PAL['quay'], 4)
    rk = MB(5)
    PH = (-12.0, 112.0)
    lathe(rk, PH, [(66, -3.0), (60, 1.5), (50, 4.0), (0, 4.5)], PAL['rock'], PT['rock'], 18, smooth=False)
    lo = to_object(rk, 'pharos_rock', 'hb_opaque'); dress([lo])
    _, ppts = import_pharos((PH[0], PH[1], 4.5 + 9.0))
    allpts = list(ppts)
    for kind, at, kw in (('houses', (-82, -16, 0), dict(variant=0)), ('houses', (-82, 15, 0), dict(variant=1)),
                         ('office', (-44, -19, 0), {}), ('houses', (-46, 15, 0), dict(variant=0)),
                         ('mint', (6, -8, 0), {}), ('houses', (60, -16, 0), dict(variant=1)), ('houses', (60, 15, 0), dict(variant=0)),
                         ('burn', (-22, -64, 0), {})):
        r_, pts = stage(kind, at, ground=False, **kw)
        allpts += pts
    for st in STATES:
        set_state(st)
        fit(cam, allpts, margin=0.03)
        p = os.path.join(SCR, f'lineup-{st}.png')
        render(p)
        out = os.path.join(OUT, f'lineup-{st}.jpg')
        Image.open(p).convert('RGB').save(out, quality=90)
        print('LINEUP', out)

if '--save' in ARGV:
    bpy.ops.wm.save_as_mainfile(filepath=arg('--save', ''))
