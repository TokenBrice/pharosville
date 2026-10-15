"""Classical-town kit gallery (PLAN P1 gate): every "Ptolemaic harbour" primitive of cv_lib, plus one sample A+C town
house and one sample stoa office built only from the kit, rendered with the lineup.py preview look.

    blender -b --factory-startup -P scripts/harbour/blender/civic/kit_gallery.py -- [--state golden|night|both]
        [--only roofs,house,...] [--samples 32] [--pct 100]

Writes agents/2026-10-15-classical-town/p1/kit-gallery-<state>.jpg (3 x 3 tiles, labelled with triangle counts).
"""
import sys, os, math, random, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(1, os.path.join(HERE, '..', 'island'))
import bpy, bmesh
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
from cv_lib import *
import cv_lib
import nl_common as ncm

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(n, d):
    return ARGV[ARGV.index(n) + 1] if n in ARGV else d


STATES = ['golden', 'night'] if arg('--state', 'both') == 'both' else [arg('--state', 'both')]
SAMPLES = int(arg('--samples', '32'))
PCT = int(arg('--pct', '100'))
ONLY = [k for k in arg('--only', '').split(',') if k]
YAW, PITCH = -24.0, 34.0
OUT = os.path.join(ROOT, 'agents', '2026-10-15-classical-town', 'p1')
SCR = os.path.join(ROOT, 'outputs', 'classical-town', 'p1')
os.makedirs(OUT, exist_ok=True); os.makedirs(SCR, exist_ok=True)
reset_scene()
scene = bpy.context.scene
P = 0.5     # plot ground

# the palette is mirrored in the island kit: fail loudly when the two drift
for k, v in cv_lib.CLASSICAL.items():
    assert ncm.HEX[k][0].upper() == v.upper(), f'nl_common.HEX[{k!r}] != cv_lib.CLASSICAL[{k!r}]'


def ground(op, x0, y0, x1, y1):
    box2(op, x0, y0, -1.5, x1, y1, P, PAL['granite'], PT['ashlar'], skip=('+z',))
    poly(op, ((x0, y0, P), (x1, y0, P), (x1, y1, P), (x0, y1, P)), PAL['quay'], PT['cobble'], nrm=(0, 0, 1))


def block(op, x0, y0, x1, y1, z0, z1, col, pat=PT['render']):
    box2(op, x0, y0, z0, x1, y1, z1, col, pat)


# =================================================================== primitive tiles
def g_roofs(coll=None):
    root = empty('roofs', coll=coll); K = Kit(1); op = K.op
    ground(op, -14, -6, 14, 6)
    w = PAL['wash_cream']
    block(op, -12.5, -3.5, -5.5, 3.5, P, P + 4.0, w); socle(op, -12.5, -3.5, -5.5, 3.5, P, 0.6)
    tiled_gable(op, -12.5, -3.5, -5.5, 3.5, P + 4.0, 21.0, PAL['tile_a'], 'x', end_col=w)
    meander(op, (-12.5, -3.5), (-5.5, -3.5), P + 2.7, 0.5, (0, -1, 0))
    block(op, -3.5, -3.5, 3.5, 3.5, P, P + 4.0, PAL['wash_ochre']); socle(op, -3.5, -3.5, 3.5, 3.5, P, 0.6)
    tiled_hip(op, -3.5, -3.5, 3.5, 3.5, P + 4.0, 22.0, PAL['tile_b'], antefix='all')
    flue(op, 1.6, 1.4, P + 5.5, col=PAL['wash_ochre'])
    block(op, 5.5, 1.5, 12.5, 3.5, P, P + 5.2, PAL['wash_white'])
    for x in (6.2, 9.0, 11.8):
        column(op, x, -2.6, P, 3.2, 0.3, PAL['marble'], 8, PAL['lime'])
    box2(op, 5.6, -3.1, P + 3.2, 12.4, -2.1, P + 3.6, PAL['lime'], 0)
    lean_to(op, 5.6, 12.4, -2.6, P + 3.65, 1.5, P + 4.7, PAL['tile_c'])
    K.emit(root, 'roofs_body', coll)
    return root


def g_order(coll=None):
    root = empty('order', coll=coll); K = Kit(2); op = K.op
    ground(op, -10, -6, 10, 6)
    stairs(op, -8.3, 8.3, -4.4, P, P + 0.6, 2, 0.4, PAL['lime'])
    box2(op, -8.3, -3.6, P, 8.3, 4.0, P + 0.6, PAL['lime'], PT['ashlar'], skip=('-z',))
    ZS = P + 0.6
    block(op, -7.6, 0.0, 7.6, 3.6, ZS, ZS + 4.6, PAL['wash_cream'])
    xs = colonnade(op, -7.0, 7.0, -2.2, ZS, 4.6, 5, 0.4, PAL['marble'], cap_col=PAL['lime'])
    for x in xs:
        cyl(op, (x, -2.2), 0.37, 0.37, ZS + 4.0, ZS + 4.2, PAL['poly_red'], 0, 8, top=False)
    zt = entablature(op, -7.8, 7.8, -2.7, 3.8, ZS + 4.6, kind='triglyph')
    rise = tiled_gable(op, -7.8, -2.7, 7.8, 3.8, zt, 20.0, PAL['tile_a'], 'y', ov=0.35, ends=False)
    pediment(op, -7.9, 7.9, -3.05, 3.8, zt + 0.45, rise - 0.3, PAL['marble'], tymp=PAL['poly_blue'], cornice=0.4)
    disc(op, (0.0, -2.85, zt + 1.4), (0, -1, 0), 0.55, 0.15, PAL['gilt'], 10, col_side=PAL['bronze'])
    meander(op, (-7.6, 0.0), (7.6, 0.0), ZS + 3.5, 0.55, (0, -1, 0), ground=PAL['poly_blue'], key=PAL['wash_white'])
    K.emit(root, 'order_body', coll)
    return root


def g_openings(coll=None):
    root = empty('openings', coll=coll); K = Kit(3); op = K.op
    K.lit_p = 1.0
    ground(op, -11, -5, 11, 5)
    wo, ww = PAL['wash_ochre'], PAL['wash_white']
    block(op, -10, -1.0, 0, 2.5, P, P + 6.4, wo); socle(op, -10, -1.0, 0, 2.5, P, 0.7)
    plain_window(K, (-7.8, -1.0, P + 4.6), (0, -1, 0), 0.85, 1.25, wo, shutter=PAL['shutter_green'])
    plain_window(K, (-5.0, -1.0, P + 4.6), (0, -1, 0), 0.85, 1.25, wo, shutter=PAL['shutter_green'], closed=True, lit=0.0)
    plain_window(K, (-2.2, -1.0, P + 4.6), (0, -1, 0), 0.85, 1.3, wo, arch=True)
    arch_door(K, (-5.0, -1.0, P), (0, -1, 0), 1.5, 3.0, PAL['shutter_green'], PAL['lime'], fanlight=True)
    plain_window(K, (-8.0, -1.0, P + 2.0), (0, -1, 0), 0.7, 0.9, wo)
    plain_window(K, (-2.0, -1.0, P + 2.0), (0, -1, 0), 0.7, 0.9, wo, shutter=PAL['shutter_ox'])
    block(op, 1.5, -1.0, 10, 2.5, P, P + 4.6, ww)
    box2(op, 1.4, -1.1, P, 10.1, 2.6, P + 0.45, PAL['shutter_blue'], 0)
    arch_door(K, (4.0, -1.0, P), (0, -1, 0), 1.3, 2.7, PAL['shutter_blue'], PAL['wash_white'])
    for x in (6.6, 8.6):
        plain_window(K, (x, -1.0, P + 2.6), (0, -1, 0), 0.8, 1.1, ww, shutter=PAL['shutter_blue'])
    # an open taberna (shop mouth) on the side: an arched opening that glows at night
    lit_opening(K, [(10.03, -0.4, P + 0.1), (10.03, 1.9, P + 0.1), (10.03, 1.9, P + 2.2), (10.03, -0.4, P + 2.2)], (1, 0, 0), lit=1.0, warm=0.5)
    K.emit(root, 'openings_body', coll)
    return root


def g_velarium(coll=None):
    root = empty('velarium', coll=coll); K = Kit(4); op = K.op
    ground(op, -10, -8, 10, 4)
    block(op, -8.5, 0.0, 8.5, 3.5, P, P + 5.0, PAL['wash_cream'])
    socle(op, -8.5, 0.0, 8.5, 3.5, P, 0.7)
    for x in (-5.0, 0.0, 5.0):
        arch_door(K, (x, 0.0, P), (0, -1, 0), 1.6, 3.0, PAL['oak_dark'], PAL['lime'], step=False, fanlight=True)
    meander(op, (-8.5, 0.0), (8.5, 0.0), P + 4.0, 0.55, (0, -1, 0))
    tiled_gable(op, -8.5, 0.0, 8.5, 3.5, P + 5.0, 20.0, PAL['tile_a'], 'x', end_col=PAL['wash_cream'])
    velarium(K, (-8.4, -1.4), (-2.0, -1.4), 5.6, P + 3.7, P + 3.3, ground=P)
    velarium(K, (2.0, -1.4), (8.4, -1.4), 5.6, P + 3.7, P + 3.3, ground=P)
    for x in (-1.2, 1.2):
        tripod_lamp(K, (x, -3.0, P))
    for (x, y) in ((-8.8, -7.4), (-8.2, -7.0), (-7.6, -7.5)):
        amphora(op, (x, y, P))
    K.emit(root, 'velarium_body', coll)
    return root


def g_terrace(coll=None):
    root = empty('terrace', coll=coll); K = Kit(5); op = K.op
    rng = random.Random(5)
    ground(op, -12, -6, 12, 6)
    ww = PAL['wash_white']
    block(op, -6.5, -4.0, 1.5, 4.0, P, P + 6.0, ww)
    box2(op, -6.6, -4.1, P, 1.6, 4.1, P + 0.45, PAL['shutter_blue'], 0)
    zf = roof_terrace(op, -6.5, -4.0, 1.5, 4.0, P + 6.0, ww, pergola_canopy='bougain', rng=rng)
    d = outside_stair(op, -6.5, -3.2, P, P + 3.2, 8, 0.5, side=-1, col=ww)
    arch_door(K, (d.x, d.y, d.z), (-1, 0, 0), 0.95, 2.2, PAL['shutter_blue'], PAL['wash_white'], step=False)
    arch_door(K, (-2.5, -4.0, P), (0, -1, 0), 1.3, 2.7, PAL['shutter_blue'], PAL['wash_white'])
    for x in (-5.0, 0.0):
        plain_window(K, (x, -4.0, P + 2.0), (0, -1, 0), 0.8, 1.1, ww, shutter=PAL['shutter_blue'])
        plain_window(K, (x, -4.0, P + 4.6), (0, -1, 0), 0.8, 1.1, ww, shutter=PAL['shutter_blue'])
    for (x, z) in ((1.3, zf - 0.4), (1.5, zf - 1.6)):
        foliage(op, rng, (x, -4.2, z), 0.7, [PAL['bougain'], PAL['bougain_light'], PAL['vine']], 2, 0.8, LEAF_EVERGREEN)
    wr = PAL['wash_rose']
    block(op, 3.5, -2.5, 10.5, 4.0, P, P + 4.4, wr)
    roof_terrace(op, 3.5, -2.5, 10.5, 4.0, P + 4.4, wr, parapet_h=0.6, pergola_canopy='vine', rng=rng)
    flue(op, 9.4, -1.4, P + 4.6, col=wr)
    plain_window(K, (5.5, -2.5, P + 2.4), (0, -1, 0), 0.8, 1.1, wr, shutter=PAL['shutter_teal'])
    arch_door(K, (8.2, -2.5, P), (0, -1, 0), 1.2, 2.6, PAL['shutter_teal'], PAL['lime'])
    pot_plant(op, rng, (2.4, -4.8, P), 'bougain')
    K.emit(root, 'terrace_body', coll)
    return root


def g_exedra(coll=None):
    root = empty('exedra', coll=coll); K = Kit(6); op = K.op
    ground(op, -11, -6, 11, 11)
    exedra(op, (0.0, 1.0), 6.5, P, 4.2, 7)
    # the armillary on a pedestal at the centre
    cyl(op, (0.0, 1.0), 0.6, 0.5, P + 0.9, P + 2.0, PAL['marble'], 0, 8)
    for k in range(3):
        a = math.pi * k / 3
        rr = 1.1
        pts = [Vector((math.cos(u) * rr * math.cos(a), 1.0 + math.cos(u) * rr * math.sin(a), P + 3.2 + math.sin(u) * rr))
               for u in [2 * math.pi * i / 12 for i in range(13)]]
        for p, q in zip(pts[:-1], pts[1:]):
            beam(op, p, q, 0.08, 0.08, PAL['bronze'])
    K.emit(root, 'exedra_body', coll)
    return root


def g_tholos(coll=None):
    root = empty('tholos', coll=coll); K = Kit(7); op = K.op
    ground(op, -9, -9, 9, 9)
    tholos(op, (0.0, 0.0), 4.4, P, 4.2, 8, cella=(2.6, PAL['wash_cream']))
    arch_door(K, (0.0, -2.6, P + 0.8), (0, -1, 0), 1.2, 2.6, PAL['bronze'], PAL['marble'], step=False)
    K.emit(root, 'tholos_body', coll)
    return root


# =================================================================== sample buildings
def g_house(coll=None):
    """A + C town house: a three-storey ochre house under a low tiled hip (painted band, shutters, flue), a whitewashed
    wing with a roof terrace + bougainvillea pergola and an outside stair, a court wall with a vine."""
    root = empty('town_house', coll=coll); K = Kit(8); op = K.op
    rng = random.Random(8)
    ground(op, -12, -7, 12, 7)
    wo, ww = PAL['wash_ochre'], PAL['wash_white']
    # main house
    X0, X1, Y0, Y1, E = -9.5, -0.5, -4.5, 4.5, P + 8.6
    block(op, X0, Y0, X1, Y1, P, E, wo)
    socle(op, X0, Y0, X1, Y1, P, 0.8)
    box2(op, X0 - 0.2, Y0 - 0.2, E - 0.25, X1 + 0.2, Y1 + 0.2, E, PAL['lime'], 0)
    meander(op, (X0, Y0), (X1, Y0), E - 1.0, 0.55, (0, -1, 0))
    meander(op, (X0, Y0), (X0, Y1), E - 1.0, 0.55, (-1, 0, 0))
    tiled_hip(op, X0, Y0, X1, Y1, E, 22.0, PAL['tile_a'])
    top = flue(op, -2.6, 2.0, E + 1.2, col=wo)
    root['chimney_top'] = tuple(top)
    arch_door(K, (-5.0, Y0, P), (0, -1, 0), 1.5, 3.0, PAL['shutter_green'], PAL['lime'])
    for x in (-7.8, -2.2):
        plain_window(K, (x, Y0, P + 2.1), (0, -1, 0), 0.8, 1.0, wo, shutter=PAL['shutter_green'])
    for x in (-7.8, -5.0, -2.2):
        plain_window(K, (x, Y0, P + 4.7), (0, -1, 0), 0.85, 1.25, wo, shutter=PAL['shutter_green'], closed=(x == -2.2))
        plain_window(K, (x, Y0, P + 6.9), (0, -1, 0), 0.7, 0.75, wo)
    for y in (-2.0, 2.0):
        plain_window(K, (X0, y, P + 4.7), (-1, 0, 0), 0.8, 1.2, wo, shutter=PAL['shutter_green'])
    # a timber balcony on beams across the first floor centre
    box2(op, -6.3, Y0 - 1.0, P + 3.6, -3.7, Y0, P + 3.8, PAL['oak_dark'], PT['planks_x'])
    for x in (-6.1, -3.9):
        beam(op, (x, Y0, P + 3.2), (x, Y0 - 0.9, P + 3.6), 0.18, 0.2, PAL['oak_dark'])
    rail(op, [(-6.25, Y0 - 0.95, P + 3.8), (-3.75, Y0 - 0.95, P + 3.8)], 0.9, PAL['oak_dark'], post_every=0.5, r=0.04)
    # whitewashed wing with a roof terrace, pergola, outside stair
    WX0, WX1, WY0, WY1, WE = 1.5, 8.5, -3.0, 4.0, P + 5.6
    block(op, WX0, WY0, WX1, WY1, P, WE, ww)
    box2(op, WX0 - 0.1, WY0 - 0.1, P, WX1 + 0.1, WY1 + 0.1, P + 0.45, PAL['shutter_blue'], 0)
    zf = roof_terrace(op, WX0, WY0, WX1, WY1, WE, ww, pergola_canopy='bougain', rng=rng)
    d = outside_stair(op, WX1, WY0 + 0.4, P, P + 3.0, 7, 0.5, side=1, col=ww)
    arch_door(K, (d.x, d.y, d.z), (1, 0, 0), 0.95, 2.2, PAL['shutter_blue'], ww, step=False)
    arch_door(K, (4.0, WY0, P), (0, -1, 0), 1.3, 2.6, PAL['shutter_blue'], ww)
    for x in (2.6, 6.6):
        plain_window(K, (x, WY0, P + 2.0), (0, -1, 0), 0.75, 1.0, ww, shutter=PAL['shutter_blue'])
    for x in (2.6, 4.6, 6.6):
        plain_window(K, (x, WY0, P + 4.2), (0, -1, 0), 0.75, 1.0, ww, shutter=PAL['shutter_blue'], arch=(x == 4.6))
    for (x, z) in ((WX1 - 0.2, zf - 0.3), (WX1 - 0.1, zf - 1.5)):
        foliage(op, rng, (x, WY0 - 0.25, z), 0.7, [PAL['bougain'], PAL['bougain_light'], PAL['vine']], 2, 0.8, LEAF_EVERGREEN)
    amphora(op, (WX0 + 1.0, WY0 + 1.0, zf), 0.75)
    # court wall with tile coping + vine, behind the gap
    box2(op, X1, 1.6, P, WX0, 2.0, P + 2.6, PAL['wash_rose'], PT['render'])
    box2(op, X1, 1.5, P + 2.6, WX0, 2.1, P + 2.8, PAL['tile_ridge'], PT['tiles'])
    foliage(op, rng, (0.5, 1.4, P + 2.9), 0.8, [PAL['vine'], PAL['vine_light']], 3, 0.6)
    # street dressing
    for (x, y, s) in ((-10.8, -6.0, 1.0), (-10.2, -6.4, 0.85), (10.5, -5.0, 1.0)):
        amphora(op, (x, y, P), s)
    pot_plant(op, rng, (-1.2, -5.4, P), 'vine')
    pot_plant(op, rng, (9.4, -4.6, P), 'bougain')
    box2(op, -8.6, -6.2, P + 0.45, -6.4, -5.6, P + 0.6, PAL['lime'], PT['ashlar'])
    K.emit(root, 'house_body', coll)
    return root


def g_stoa(coll=None, chain='ethereum'):
    """A harbour office from the kit alone: a Doric stoa (concept A's Ethereum office) with the crest on a painted attic
    under a blue pediment, two velaria split around the steps, tripod lamps and a flag mast."""
    root = empty(f'harbour-office:{chain}', coll=coll); K = Kit(60); op = K.op
    ground(op, -10, -8, 10, 8)
    X0, X1 = -8.4, 8.4
    YS, YC, YW, YB = -4.6, -3.6, -0.4, 4.8
    ZS = P + 0.6
    stairs(op, X0 - 0.3, X1 + 0.3, YS - 0.9, P, ZS, 2, 0.45, PAL['lime'])
    box2(op, X0 - 0.3, YS, P, X1 + 0.3, YB + 0.3, ZS, PAL['lime'], PT['ashlar'], skip=('-z',))
    ZW = ZS + 5.0
    block(op, X0, YW, X1, YB, ZS, ZW, PAL['wash_cream'])
    for s in (-1, 1):   # antae
        xa = X1 if s > 0 else X0
        box2(op, min(xa, xa - s * 0.8), YC - 0.4, ZS, max(xa, xa - s * 0.8), YW, ZW, PAL['lime'], 0)
    poly(op, ((X0 + 0.8, YW - 0.03, ZS), (X1 - 0.8, YW - 0.03, ZS), (X1 - 0.8, YW - 0.03, ZS + 1.6), (X0 + 0.8, YW - 0.03, ZS + 1.6)),
         PAL['poly_red'], 0, nrm=(0, -1, 0), jitter=0.0)
    for x in (-5.0, 0.0, 5.0):
        arch_door(K, (x, YW - 0.04, ZS), (0, -1, 0), 1.6 if x else 2.2, 3.2 if x else 3.8, PAL['bronze'] if not x else PAL['oak_dark'],
                  PAL['marble'], step=False, fanlight=bool(x))
    for x in (-6.8, -2.6, 2.6, 6.8):
        plain_window(K, (x, YW - 0.04, ZS + 3.9), (0, -1, 0), 0.75, 0.75, PAL['wash_cream'], sill=False)
    for y in (0.9, 3.4):
        for s in (-1, 1):
            plain_window(K, (s * X1, y, ZS + 3.4), (s, 0, 0), 0.8, 1.0, PAL['wash_cream'])
    xs = colonnade(op, X0 + 0.5, X1 - 0.5, YC, ZS, 5.0, 7, 0.42, PAL['marble'], cap_col=PAL['lime'])
    for x in xs:
        cyl(op, (x, YC), 0.39, 0.39, ZS + 4.35, ZS + 4.55, PAL['poly_red'], 0, 8, top=False)
    zt = entablature(op, X0 - 0.2, X1 + 0.2, YC - 0.5, YB + 0.2, ZS + 5.0)
    RS = tiled_gable(op, X0 - 0.2, YC - 0.5, X1 + 0.2, YB + 0.2, zt, 21.0, PAL['tile_a'], 'x', ov=0.5, end_col=PAL['marble'], end_pat=0)
    ym = (YC - 0.5 + YB + 0.2) / 2
    for s in (-1, 1):   # blue tympana on the end pediments
        xa = s * (X1 + 0.25)
        poly(op, ((xa, YC + 0.2, zt + 0.05), (xa, YB - 0.5, zt + 0.05), (xa, ym, zt + RS - 0.45)), PAL['poly_blue'], 0, nrm=(s, 0, 0), jitter=0.0)
    # central attic + pediment carrying the crest
    AX0, AX1, AY0, AY1, AZ1 = -2.9, 2.9, YC - 0.55, YC + 2.4, zt + 3.6
    block(op, AX0, AY0, AX1, AY1, zt - 0.2, AZ1, PAL['wash_white'])
    for (a, b, c_, d) in ((AX0, zt, AX1, zt + 0.3), (AX0, AZ1 - 0.3, AX1, AZ1), (AX0, zt, AX0 + 0.3, AZ1), (AX1 - 0.3, zt, AX1, AZ1)):
        poly(op, ((a, AY0 - 0.03, b), (c_, AY0 - 0.03, b), (c_, AY0 - 0.03, d), (a, AY0 - 0.03, d)), PAL['poly_red'], 0, nrm=(0, -1, 0), jitter=0.0)
    pr = rise_for((AX1 - AX0) / 2 + 0.1, 24.0)
    pediment(op, AX0 - 0.1, AX1 + 0.1, AY0 - 0.2, AY1, AZ1 + 0.55, pr, PAL['marble'], tymp=PAL['poly_blue'], cornice=0.35)
    gable_roof(op, AX0 - 0.1, AY0 - 0.2, AX1 + 0.1, AY1, AZ1 + 0.55, pr, PAL['tile_a'], PT['tiles'], ov=0.0, axis='y', ends=False,
               th=0.2, fascia=PAL['tile_ridge'])
    ridge_cap(op, (0.0, AY0 - 0.2, AZ1 + 0.6 + pr), (0.0, AY1, AZ1 + 0.6 + pr))
    poly(op, ((AX0 - 0.1, AY1, AZ1 + 0.55), (AX1 + 0.1, AY1, AZ1 + 0.55), (0, AY1, AZ1 + 0.55 + pr)), PAL['wash_white'], PT['render'], nrm=(0, 1, 0))
    for (x, z, h) in ((0.0, AZ1 + 0.6 + pr + 0.2, 1.1), (AX0 - 0.35, AZ1 + 0.5, 0.75), (AX1 + 0.35, AZ1 + 0.5, 0.75)):   # gilt acroteria
        poly(op, ((x - 0.4, AY0 - 0.45, z), (x + 0.4, AY0 - 0.45, z), (x + 0.2, AY0 - 0.45, z + h * 0.6), (x, AY0 - 0.45, z + h),
                  (x - 0.2, AY0 - 0.45, z + h * 0.6)), PAL['gilt'], 0, nrm=(0, -1, 0), jitter=0.0)
    crest_panel(K, root, (0.0, AY0 - 0.02, (zt + AZ1) / 2), 2.6, PAL['gilt'], coll)
    velarium(K, (X0 - 0.2, YS - 1.0), (-2.0, YS - 1.0), 2.7, P + 3.7, P + 3.3, ground=P)
    velarium(K, (2.0, YS - 1.0), (X1 + 0.2, YS - 1.0), 2.7, P + 3.7, P + 3.3, ground=P)
    for x in (-1.3, 1.3):
        tripod_lamp(K, (x, YS - 1.9, P))
    for (x, y) in ((-8.8, -6.4), (-8.2, -6.9), (-8.6, -5.7)):
        amphora(op, (x, y, P), 0.95)
    fx, fy = 8.9, -7.0
    box2(op, fx - 0.6, fy - 0.6, P, fx + 0.6, fy + 0.6, P + 0.5, PAL['lime'], PT['ashlar'])
    box2(op, fx - 0.42, fy - 0.42, P + 0.5, fx + 0.42, fy + 0.42, P + 1.0, PAL['bronze'], PT['metal'])
    cyl(op, (fx, fy), 0.15, 0.08, P + 1.0, P + 15.0, PAL['oak_dark'], 0, 6)
    sphere(op, (fx, fy, P + 15.1), 0.22, PAL['gilt'], 6, 3)
    empty('flag_pole_top', (fx, fy, P + 14.8), parent=root, coll=coll)
    made = K.emit(root, 'office_body', coll)
    made['cover'].name = 'awning'
    return root


TILES = [('roofs', g_roofs, 'Roofs: tiled_gable · tiled_hip · lean_to · flue'),
         ('order', g_order, 'Orders: entablature · frieze · pediment · meander'),
         ('openings', g_openings, 'Openings: plain_window · shutters · arch_door · lit_opening'),
         ('velarium', g_velarium, 'velarium (split) · tripod_lamp'),
         ('terrace', g_terrace, 'roof_terrace · pergola · outside_stair'),
         ('exedra', g_exedra, 'exedra'),
         ('tholos', g_tholos, 'tholos'),
         ('house', g_house, 'Sample: A+C town house'),
         ('stoa', g_stoa, 'Sample: stoa office (ethereum)')]
TILES = [t for t in TILES if not ONLY or t[0] in ONLY]

# ------------------------------------------------------------------ preview look (as civic/lineup.py + the concept frames)
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
_CREST = {}


def crest_mat(chain):
    if chain in _CREST:
        return _CREST[chain]
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
    _CREST[chain] = m
    return m


def dress(objs, chain='ethereum'):
    for o in objs:
        if o.type != 'MESH' or not o.data.materials:
            continue
        nm = o.data.materials[0].name.split('.')[0]
        if nm == 'hb_window':
            o.data.materials[0] = ncm.M['window']
        elif nm in ('hb_emissive', 'hb_fire'):
            o.data.materials[0] = EM
        elif nm == 'hb_cover':
            o.data.materials[0] = COVER
            o.color = (*lin(CHAINS[chain]), 1)
        elif nm == 'hb_crest':
            o.data.materials[0] = crest_mat(chain)
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


def set_state(st):
    win_ = ncm.M['window'].node_tree.nodes['WIN_K']; lamp = EM.node_tree.nodes['LAMP_K']
    if st == 'golden':
        sun.data.energy = 5.2; sun.data.color = lin('#FFB070'); aim(sun, YAW - 70 - 90, 16)
        fill.data.energy = 0.35; fill.data.color = lin('#7F98D6'); aim(fill, YAW + 90, 35)
        ncm.set_ramp(ramp, [(0, lin('#C9A89A')), (0.3, lin('#8C9AC0')), (1, lin('#5470A6'))]); bg.inputs['Strength'].default_value = 0.62
        win_.outputs[0].default_value = 1.2; lamp.outputs[0].default_value = 6.0
        gl.inputs['Strength'].default_value = 0.2; gl.inputs['Threshold'].default_value = 1.3
        scene.view_settings.exposure = 0.25
    else:
        sun.data.energy = 1.1; sun.data.color = lin('#A9BCFF'); aim(sun, YAW - 70 - 90, 32)
        fill.data.energy = 0.18; fill.data.color = lin('#5A6FB0'); aim(fill, YAW + 90, 35)
        ncm.set_ramp(ramp, [(0, lin('#2C3F6E')), (0.35, lin('#1C2B55')), (1, lin('#0B1330'))]); bg.inputs['Strength'].default_value = 1.2
        win_.outputs[0].default_value = 6.0; lamp.outputs[0].default_value = 30.0
        gl.inputs['Strength'].default_value = 0.6; gl.inputs['Threshold'].default_value = 0.8
        scene.view_settings.exposure = 0.35


def surface(name, x0, y0, x1, y1, z, col, pat=6):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))]
    bm.faces.new(vs)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    a = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for d in a.data:
        d.color = (*col, pat / 16)
    me.materials.append(ncm.M['kit'])
    return ob


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


cam = camera()
scene.render.resolution_x, scene.render.resolution_y = 960, 640
staged, TRIS = [], {}
for i, (key, fn, label) in enumerate(TILES):
    at = Vector((i * 400.0, 0.0, 0.0))
    root = fn()
    root.location = at
    bpy.context.view_layer.update()
    objs = descendants(root)
    TRIS[key] = tri_count(objs)
    dress(objs)
    pts = [o.matrix_world @ Vector(b) for o in objs if o.type == 'MESH' for b in o.bound_box]
    surface('land_' + key, at.x - 40, at.y - 12, at.x + 40, at.y + 40, -0.02, PAL['grass'], 6)
    surface('quay_' + key, at.x - 40, at.y - 40, at.x + 40, at.y - 12, -0.02, PAL['quay'], 4)
    staged.append((key, label, pts))

from PIL import Image, ImageDraw, ImageFont
FONT = '/usr/share/fonts/noto/NotoSerif-Bold.ttf'
for st in STATES:
    set_state(st)
    W_, H_ = int(960 * PCT / 100), int(640 * PCT / 100)
    cols = 3 if len(staged) > 2 else len(staged)
    rows = (len(staged) + cols - 1) // cols
    sheet = Image.new('RGB', (W_ * cols, H_ * rows), (20, 24, 30))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT, max(14, W_ // 40))
    for j, (key, label, pts) in enumerate(staged):
        fit(cam, pts, margin=0.06)
        p = os.path.join(SCR, f'tile-{key}-{st}.png')
        scene.render.resolution_percentage = PCT
        scene.render.filepath = p
        scene.render.image_settings.file_format = 'PNG'
        bpy.ops.render.render(write_still=True)
        ox, oy = (j % cols) * W_, (j // cols) * H_
        sheet.paste(Image.open(p).convert('RGB'), (ox, oy))
        t = f'{label}  ·  {TRIS[key]} tris'
        d.text((ox + 13, oy + 11), t, font=f, fill=(10, 14, 20))
        d.text((ox + 12, oy + 10), t, font=f, fill=(250, 242, 226))
    out = os.path.join(OUT, f'kit-gallery-{st}.jpg' if not ONLY else f'kit-gallery-{"-".join(ONLY)}-{st}.jpg')
    sheet.save(out, quality=90)
    print('GALLERY', out, TRIS)
