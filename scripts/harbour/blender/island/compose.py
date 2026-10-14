#!/usr/bin/env python3
"""The Harbour, composition v3: the whole island laid out in plan (pure Python).

v3 is authored in SCREEN space (U right, V away from the camera, metres; the heart target at U = V = 0) and
converted to world coordinates with W(u, v). The camera never turns (yaw 45), so composing on screen is
composing the frame:

  - the Pharos stands on its headland at the upper left of the heart frame, against open sea and the sky band;
  - the harbour mouth opens toward the horizon (departing boats sail off into the sky);
  - the town is an amphitheatre round the Vagen, a curved inner bay, facing the camera and the golden sun;
  - the lagoon below holds the Ethereum fan piers and mooring drift; Tron berths under the Pharos;
  - six characterful coves on the camera-facing coasts, farm meadows + a windmill on the west lobe,
    spruce crests and rock outcrops, a winding road to the lighthouse;
  - the far coast stays inside the sky-card radius of both presets, so both frames show the horizon.

Writes (same contract as v2):
  outputs/harbour/island/compose.json   - Blender build input (Blender coords: x east, y north, z up)
  src/harbour/data/layout.json          - runtime layout v2 contract (glTF coords: x east, y up, z south)
  scripts/harbour/blender/island/legs.json - lane-graph leg lengths for occupancy.py (second pass)
  agents/.../p2/island-v3/plan.png      - plan check (screen-aligned)

    python3 compose.py [--plan-only]
"""
import json, math, os, random, sys, heapq, zlib
from collections import Counter, defaultdict
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from geom import *

ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
OUTD = os.path.join(ROOT, 'outputs/harbour/island')
ART = os.path.join(ROOT, 'agents/2026-10-13-pharosville-reboot/p2/island-v3')
os.makedirs(OUTD, exist_ok=True); os.makedirs(ART, exist_ok=True)
OCC = json.load(open(os.path.join(OUTD, 'occupancy.json')))

CLASSES = ['flagship', 'large', 'medium', 'small', 'boat', 'skiff']
LOA = dict(flagship=26.0, large=18.0, medium=13.0, small=10.0, boat=7.5, skiff=5.0)
BEAM = dict(flagship=6.6, large=5.2, medium=4.8, small=3.4, boat=3.2, skiff=2.2)
SPRIT = dict(flagship=7.3, large=5.0, medium=2.9, small=2.2, boat=0.0, skiff=0.0)   # bowsprit beyond LOA
MAST = dict(flagship=27.0, large=20.0, medium=15.0, small=13.0, boat=8.6, skiff=5.8)
ALONG = {k: LOA[k] + SPRIT[k] + 3.5 for k in CLASSES}          # alongside berth length
PITCH = dict(medium=6.0, small=4.5)                             # finger berth pitch along the main pier (beam + ~1.1 m)
FINGER = dict(medium=9.0, small=7.0)                            # finger length
CHAINS = {'pier-ethereum': 'Ethereum', 'pier-tron': 'Tron', 'pier-bsc': 'BSC', 'pier-solana': 'Solana',
          'pier-hyperliquid-l1': 'Hyperliquid L1', 'pier-base': 'Base', 'pier-arbitrum': 'Arbitrum', 'pier-polygon': 'Polygon'}
PENNANT = {'pier-ethereum': '#6F7FD8', 'pier-tron': '#D2463C', 'pier-bsc': '#F0B90B', 'pier-solana': '#9A5CF0',
           'pier-hyperliquid-l1': '#5FD3BC', 'pier-base': '#2F6BFF', 'pier-arbitrum': '#2BA3EC', 'pier-polygon': '#8A52E6'}
# the sim found overflow rafts in use 11 times: one more large berth at these four (P2 island v3 brief)
EXTRA_LARGE = {'pier-ethereum': 1, 'pier-bsc': 1, 'pier-base': 1, 'far': 1}
# the runtime sim plans with its own (longer) circuit periods; with v3 at the occupancy.py sizes its raft overflow
# showed these extra concurrent hulls (2026-10-14, live payload): give each a berth/buoy of its own
SIM_EXTRA = {('far', 'medium'): 1, ('far', 'small'): 2, ('far', 'boat'): 2, ('pier-bsc', 'small'): 1, ('pier-base', 'boat'): 3,
             ('pier-base', 'skiff'): 5, ('pier-polygon', 'skiff'): 1, ('pier-arbitrum', 'skiff'): 1}


def need(pid, cls):
    o = OCC['occupancy'][pid][cls]
    # capacity rule (occupancy.py): max(ceil(expected x 1.2), p95), + the overflow fix
    n = max(math.ceil(o['expected'] * 1.2 - 1e-9), o['p95']) if o['visitors'] else 0
    return n + (EXTRA_LARGE.get(pid, 0) if cls == 'large' else 0) + SIM_EXTRA.get((pid, cls), 0)


REQ = {pid: {k: need(pid, k) for k in CLASSES} for pid in CHAINS}
REQ_FAR = {k: need('far', k) for k in CLASSES}

Z_SHORE, DECK = 2.4, 1.2
VOFF = 80.0                          # world origin sits at screen (0, -80): the island's centre


def W(u, v):
    """Screen-plan point (U right, V away; heart target = origin) -> world (Blender x east, y north)."""
    return from_uv(u, v + VOFF)


def Wd(du, dv):
    return from_uv(du, dv)


def UV(p):
    u, v = screen_uv(*p)
    return (u, v - VOFF)


def Wl(pts):
    return [W(*p) for p in pts]


# wind from the screen-left (west-south-west, the golden-hour sun side): moored bows point into it
WIND_BOW = norm(Wd(-1.0, 0.22))

# =====================================================================================================
# 1. COAST. CCW: the Pharos tip, the far coast going left, the west flank (Wreck Cove), the camera-facing
#    south coast with its coves, the east flank, the far coast back to the battery point; then in through the
#    mouth: the battery's channel face, the Vagen, the lagoon (east shore, the Long Quay, west shore), the
#    Tron quay under the Pharos.
# =====================================================================================================
CT = (100.0, 8.0)                    # the Vagen / amphitheatre centre (screen plan)
R_QUAY = 58.0                        # Vagen quay radius


def vagen(theta_deg, r=R_QUAY):
    a = math.radians(theta_deg)
    return (CT[0] + math.cos(a) * r, CT[1] + math.sin(a) * r)


VAGEN_TH = (188.0, -24.0)            # the quay arc runs from the west tip over the top to the east tip
# the big-ship berths round the Vagen lie on straight facets of the quay (a straight hull never sits on a curved wall):
# (theta0, classes, step) - the west half from the battery side, the east half from the warehouse side
VAGEN_BERTHS = ((182.0, ['large', 'flagship', 'large'], -1), (-14.0, ['large', 'flagship', 'large'], +1))
VAGEN_GAP_DEG = 3.0


def _vagen_spans():
    spans = []
    for th0, classes, step in VAGEN_BERTHS:
        th = th0
        for cls in classes:
            dth = math.degrees(2 * math.asin(min(1.0, ALONG[cls] / 2 / R_QUAY)))
            spans.append((min(th, th + step * dth), max(th, th + step * dth)))
            th += step * (dth + VAGEN_GAP_DEG)
    return spans


VAGEN_SPANS = _vagen_spans()


def _vagen_arc():
    """The Vagen quay: an arc whose berth spans are straight chords (faceted masonry, as old harbour quays are)."""
    pts = [(th, vagen(th)) for th in [VAGEN_TH[0] - k * (VAGEN_TH[0] - VAGEN_TH[1]) / 44 for k in range(45)]
           if not any(s0 - 0.5 < th < s1 + 0.5 for s0, s1 in VAGEN_SPANS)]
    for s0, s1 in VAGEN_SPANS:
        a, b = vagen(s0), vagen(s1)
        pts += [(s0 + (s1 - s0) * k / 8, lerp(a, b, k / 8)) for k in range(9)]
    return [p for _, p in sorted(pts, key=lambda q: -q[0])]


VAGEN_ARC = _vagen_arc()

# coves (south + corner coasts): (pid, centre on the coast (U, V), outward normal (screen), half width, depth)
COVES = [
    ('pier-polygon', (-266.0, -206.0), (-0.72, -0.69), 26.0, 30.0),
    ('pier-arbitrum', (-160.0, -270.0), (-0.14, -1.0), 28.0, 32.0),
    ('pier-base', (-52.0, -290.0), (0.0, -1.0), 31.0, 32.0),
    ('pier-solana', (64.0, -290.0), (0.04, -1.0), 37.0, 32.0),
    ('pier-bsc', (172.0, -270.0), (0.1, -1.0), 37.5, 36.0),
    ('pier-hyperliquid-l1', (252.0, -192.0), (0.74, -0.67), 18.0, 24.0),
]
COVE_INFO = {}
COVE_ROCKS = []          # (x, y, r) world: rocks off the coves' arms (land in the SDF)
BEACHES = []             # natural strands (world polylines): the terrain slopes to the waterline, no quay wall
COVE_BEACH = {'pier-polygon': 'we', 'pier-arbitrum': 'we', 'pier-base': 'we', 'pier-hyperliquid-l1': 'we', 'pier-bsc': 'w', 'pier-solana': ''}
COVE_BOATHOUSE = {'pier-polygon': 'e', 'pier-arbitrum': 'w', 'pier-base': 'we', 'pier-hyperliquid-l1': 'w', 'pier-bsc': 'w', 'pier-solana': ''}
COVE_WALLED = {'pier-arbitrum': 'w', 'pier-base': 'we', 'pier-solana': 'we', 'pier-bsc': 'we'}


def cove_ctrl(pid, c, n, hw, depth):
    """A cove notch: rocky arms reaching out, side walls splayed open toward the sea (quays where the cove berths a big
    hull alongside), rounded back corners and a short back quay; the hamlet sits at the back facing out of the cove."""
    n = norm(n); t = (-n[1], n[0])           # t = along the coast in CCW travel (+U on the south coast)
    back_c = add(c, mul(n, -depth))
    qa = add(back_c, mul(t, -(hw - 9))); qb = add(back_c, mul(t, hw - 9))
    # the side shores splay open toward the sea (a bight, not a basin): only the berth's own length is masonry
    w0 = add(add(c, mul(t, -hw - 9)), mul(n, 1.0)); w1 = add(add(c, mul(t, -hw + 4)), mul(n, -depth + 5))
    e1 = add(add(c, mul(t, hw - 4)), mul(n, -depth + 5)); e0 = add(add(c, mul(t, hw + 9)), mul(n, 1.0))
    COVE_INFO[pid] = dict(c=c, n=n, t=t, hw=hw, depth=depth, back=back_c, qa=qa, qb=qb, w=(w0, w1), e=(e1, e0))
    # v4: irregular rocky arms - each a knuckled granite point reaching past the cove mouth, a few rocks off its tip
    rng = random.Random(zlib.crc32(pid.encode()) % 997)        # stable across processes (str hash() is salted per run)
    arm = lambda sgn: [add(add(c, mul(t, sgn * (hw + 23))), mul(n, 1.0)), add(add(c, mul(t, sgn * (hw + 19.5))), mul(n, 4.0 + rng.uniform(-0.8, 0.8))),
                       add(add(c, mul(t, sgn * (hw + 16.0))), mul(n, 6.2 + rng.uniform(-1.0, 0.6))),
                       add(add(c, mul(t, sgn * (hw + 12.5))), mul(n, 4.8 + rng.uniform(-0.8, 0.8))), add(add(c, mul(t, sgn * (hw + 10.5))), mul(n, 2.8))]
    for sgn in (-1, 1):              # rocks along the arm's seaward flank (never across the cove's own mouth)
        for k in range(rng.randint(2, 3)):
            q = add(add(c, mul(t, sgn * (hw + 19.5 + k * 2.6 + rng.uniform(-0.8, 0.8)))), mul(n, 6.5 + k * 1.2 + rng.uniform(-0.8, 0.8)))
            COVE_ROCKS.append((*W(*q), rng.uniform(1.0, 2.0) * (1.0 - 0.15 * k)))
    pts = arm(-1) + [w0, lerp(w0, w1, 0.25), lerp(w0, w1, 0.5), lerp(w0, w1, 0.75), w1, add(add(c, mul(t, -hw + 8)), mul(n, -depth + 1.0)),
           qa, lerp(qa, qb, 0.5), qb, add(add(c, mul(t, hw - 8)), mul(n, -depth + 1.0)), e1, lerp(e1, e0, 0.25), lerp(e1, e0, 0.5),
           lerp(e1, e0, 0.75), e0] + arm(1)[::-1]
    return pts


WRECK_BAY = [(-246.0, 2.0), (-266.0, -6.0), (-262.0, -22.0), (-254.0, -40.0), (-252.0, -60.0), (-257.0, -80.0), (-268.0, -99.0),
             (-284.0, -116.0), (-303.0, -130.0), (-322.0, -140.0), (-330.0, -152.0), (-318.0, -166.0)]
WRECK_STRAND = WRECK_BAY[2:10]           # the beach proper, cape to cape (screen plan)


def coast_ctrl():
    P = []
    # the Pharos tip + far coast west (falls away so open sea shows behind the tower)
    P += [(-50.0, 106.0), (-58.0, 114.0), (-74.0, 116.0), (-94.0, 108.0), (-116.0, 94.0), (-142.0, 78.0), (-172.0, 58.0),
          (-200.0, 36.0), (-226.0, 10.0)]
    # Wreck Cove: a broad sand-and-shingle crescent on the west flank between two rocky capes
    P += WRECK_BAY
    P += cove_ctrl(*COVES[0])
    P += [(-232.0, -246.0), (-204.0, -258.0)]
    P += cove_ctrl(*COVES[1])
    P += [(-106.0, -276.0)]
    P += cove_ctrl(*COVES[2])
    P += [(6.0, -286.0)]
    P += cove_ctrl(*COVES[3])
    P += [(116.0, -278.0)]
    P += cove_ctrl(*COVES[4])
    P += [(212.0, -246.0), (232.0, -224.0)]
    P += cove_ctrl(*COVES[5])
    # east flank up to the far coast behind the town
    P += [(270.0, -156.0), (274.0, -118.0), (270.0, -78.0), (260.0, -36.0), (246.0, 4.0), (226.0, 42.0), (200.0, 76.0),
          (170.0, 102.0), (136.0, 122.0), (98.0, 134.0), (62.0, 136.0), (34.0, 132.0), (16.0, 124.0)]
    # the battery point (mole root) and its channel face
    P += [(6.0, 116.0), (2.0, 108.0), (2.0, 94.0), (6.0, 78.0), (12.0, 60.0), (20.0, 42.0), (30.0, 26.0), (38.0, 16.0)]
    # the Vagen quay (an exact arc)
    P += VAGEN_ARC
    # lagoon east shore (warehouse row), the Long Quay (south shore, fan-pier roots), the west shore
    P += [(162.0, -22.0)] + EAST_WHARF + EAST_CORNER
    P += LONG_QUAY
    P += WEST_SHORE
    # the Tron deep-water quay: the lagoon's whole west shore (exact line), then natural rock under the headland
    P += TRON_QUAY
    P += [(-84.0, 80.0), (-70.0, 92.0), (-58.0, 98.0)]
    return P


# ---------------------------------------------------------------- v4: the Ethereum marina (Mediterranean mooring)
# Rows run ACROSS the view (screen U): hulls lie side by side, bow-in to long curved quays and moles, with generous water
# between the rows - the Long Quay (south shore), the Inner Mole (rooted on the west shore, its pierhead east) and the
# Grand Mole (rooted on the warehouse wharf, its pierhead west by the Tron quay), every row one gentle smile round a far
# centre, the big ships alongside the Grand Mole's straight outer facets. The fairways are a serpentine: in at the Grand
# Mole's head, east along the outer fairway, round the Inner Mole's head, west along the inner one.
# v5 (P5 art direction: "the moles are long straight bars cutting the bay into stripes"): a tighter common centre so
# every row is a visible smile (the ends lift ~20 m), wider moles that carry a promenade (lamps, benches) and a round
# pierhead bastion with its light, and the Grand Mole sweeping into the wharf on an S-curve instead of a knee. The rows,
# fairway widths, bow gap and lead geometry are unchanged; the old v4 centre is kept to carry the lagoon's lanes, gates
# and drifts by the same lift (_lift below), so every clearance the v4 checks proved stays as it was.
MC0, R_LQ0 = (10.0, 450.0), 662.0      # v4 (lanes/gates/drifts north of the Grand Mole were authored against this)
V_LQB = -215.0                       # the Long Quay's lowest point (v4 -212: 3 m south pays for the wider moles)
R_LQ = 370.0                         # Long Quay face
MC = (20.0, V_LQB + R_LQ)            # the rows' common centre (screen plan, north)
BOW_GAP = 0.7                        # bow to the quay face
FW1, FW2 = 27.0, 29.0                # fairway widths, stern line to stern line
W_M1, W_M2 = 11.0, 12.0              # Inner / Grand Mole widths (v4 8 / 9): a promenade between the copings
R_M1S = R_LQ - 2 * (BOW_GAP + LOA['small']) - FW1
R_M1, R_M1N = R_M1S - W_M1 / 2, R_M1S - W_M1
R_M2S = R_M1N - 2 * (BOW_GAP + LOA['medium']) - FW2
R_M2, R_M2N = R_M2S - W_M2 / 2, R_M2S - W_M2
R_F1 = R_LQ - BOW_GAP - LOA['small'] - FW1 / 2         # fairway centre lines
R_F2 = R_M1N - BOW_GAP - LOA['medium'] - FW2 / 2
_R_M2N0 = R_LQ0 - 2 * (BOW_GAP + LOA['small']) - FW1 - 8.0 - 2 * (BOW_GAP + LOA['medium']) - FW2 - 9.0
M1_U = (-128.0, 100.0)               # Inner Mole: root (inside the west shore) .. pierhead centre
M2_U = (-76.0, 150.0)                # Grand Mole: pierhead centre .. end of the arc (an S-curve root runs on into the wharf)
M2_ROOT = (197.0, -96.0)
HEAD_R = {'inner': 8.0, 'grand': 9.0}


def marc(r, u, mc=None):
    """V of the marina arc of radius r at screen U."""
    mc = mc or MC
    return mc[1] - math.sqrt(r * r - (u - mc[0]) ** 2)


def mang(u, r):
    return math.asin((u - MC[0]) / r)


def mpt(r, a):
    """Point on the marina arc of radius r at angle a (0 = due south of MC)."""
    return (MC[0] + r * math.sin(a), MC[1] - r * math.cos(a))


def arc_pts(r, u0, u1, step=6.0):
    n = max(2, int(abs(u1 - u0) / step) + 1)
    return [(u0 + (u1 - u0) * k / (n - 1), marc(r, u0 + (u1 - u0) * k / (n - 1))) for k in range(n)]


def _lift(u, v, v_free=-12.0, v_full=-62.0):
    """A v4 point north of the Grand Mole carried up by the mole's own lift at that U (full at the mole, none by the
    Vagen's mouth), so its clearance to the mole's outer face is what v4 had."""
    du = marc(R_M2N, min(max(u, -90.0), 150.0)) - marc(_R_M2N0, min(max(u, -90.0), 150.0), MC0)
    k = min(1.0, max(0.0, (v - v_free) / (v_full - v_free)))
    return (u, v + du * k)


LONG_QUAY = arc_pts(R_LQ, 150.0, -114.0, 9.0)          # east -> west
_LQW, _LQE = LONG_QUAY[-1][1], LONG_QUAY[0][1]
WEST_SHORE = [(-118.5, _LQW + 3.3), (-121.0, _LQW + 10.3)] + [p for p in ((-122.0, -160.0), (-123.0, -134.0), (-124.0, -120.0)) if p[1] > _LQW + 18.0]
EAST_CORNER = [p for p in ((185.0, -140.0), (178.0, -160.0), (168.0, -178.0), (158.0, -192.0)) if p[1] > _LQE + 4.0]
EAST_WHARF = [(167.0, -30.0), (179.0, -50.0), (186.0, -74.0), (188.0, -98.0), (188.0, -118.0)]
TRON_QUAY = [(-125.0, -114.0), (-127.0, -82.0), (-126.0, -44.0), (-121.0, -6.0), (-113.0, 28.0), (-101.0, 56.0), (-93.0, 68.0)]   # Tron: ~29 % of supply
def _snap(poly, lines, tol=1.6):
    out = []
    for p in poly:
        best = None
        for L in lines:
            for a, b in zip(L, L[1:]):
                ab = sub(b, a); t = max(0.0, min(1.0, dot(sub(p, a), ab) / (dot(ab, ab) or 1e-9)))
                q = add(a, mul(ab, t)); d = length(sub(p, q))
                if d < tol and (best is None or d < best[0]):
                    best = (d, q)
        out.append(best[1] if best else p)
    return out


def _rocky(poly_uv, seed=5):
    """Small rocky irregularity on natural shores (quays untouched)."""
    rng = random.Random(seed); out = []
    n = len(poly_uv)
    for i, p in enumerate(poly_uv):
        a = poly_uv[i - 1]; b = poly_uv[(i + 1) % n]
        t = norm(sub(b, a)); nn = (t[1], -t[0])
        k = 0.0 if _near_quay_uv(p) else (math.sin(i * 1.7) * 0.9 + rng.uniform(-1.2, 1.2))
        out.append(add(p, mul(nn, k)))
    return out


def _near_quay_uv(p, tol=6.0):
    for L in _QUV:
        if poly_dist(p, L, closed=False) < tol:
            return True
    return False


_cc = coast_ctrl()
QUAY_LINES = {          # name -> world polyline (vertical masonry on the coast)
    'grand': Wl(VAGEN_ARC), 'long': Wl(LONG_QUAY), 'tron': Wl(TRON_QUAY),
    'battery': Wl([(2.0, 108.0), (2.0, 94.0), (6.0, 78.0), (12.0, 60.0)]), 'wharf': Wl(EAST_WHARF),
    'west': Wl([LONG_QUAY[-1]] + WEST_SHORE), 'ecorner': Wl([EAST_WHARF[-1]] + EAST_CORNER + [LONG_QUAY[0]]),
}
def _wall_piece(a, b, L):
    """The masonry piece of a cove side: just the alongside berth's length (+ a little), centred on the side."""
    m = lerp(a, b, 0.5); dd = norm(sub(b, a)); h = min(length(sub(b, a)), L) / 2
    return [add(m, mul(dd, -h)), add(m, mul(dd, h))]


for pid, info in COVE_INFO.items():
    # the back of each cove: a pebble beach where no big hull lies alongside, the stone quay only where one does
    _bs = COVE_BEACH[pid]
    if not _bs:
        QUAY_LINES['cove-' + pid] = Wl([info['qa'], info['qb']])
    elif _bs == 'w':
        QUAY_LINES['cove-' + pid] = Wl([lerp(info['qa'], info['qb'], 0.42), info['qb']])
    for _sd in _bs:
        _sg = -1 if _sd == 'w' else 1
        BEACHES.append(dict(name='cove-' + pid + '-' + _sd, kind='pebble', depth=9.0,
                            line=Wl([add(info['back'], mul(info['t'], _sg * 3.0)), add(info['back'], mul(info['t'], _sg * (info['hw'] - 8.5)))])))
    for sd in COVE_WALLED.get(pid, ''):
        QUAY_LINES[f'cove-{pid}-{sd}'] = Wl(_wall_piece(*info[sd], ALONG['large'] + 3.0))


_QUV = [VAGEN_ARC, LONG_QUAY, TRON_QUAY, EAST_WHARF, [(2.0, 108.0), (2.0, 94.0), (6.0, 78.0), (12.0, 60.0)],
        [LONG_QUAY[-1]] + WEST_SHORE, [EAST_WHARF[-1]] + EAST_CORNER + [LONG_QUAY[0]]] + \
       [[i['qa'], i['qb']] for i in COVE_INFO.values()] + \
       [_wall_piece(*COVE_INFO[p][sd], ALONG['large'] + 3.0) for p, sds in COVE_WALLED.items() for sd in sds]


COAST_UV = _rocky(catmull(_cc, 4))
COAST = _snap(Wl(COAST_UV), list(QUAY_LINES.values()))
COAST = ccw(_snap(COAST, [L for k, L in QUAY_LINES.items() if k.endswith(('-w', '-e'))], tol=6.5))     # cove walls: dead straight
LEVELS = []          # v3: the terrain function carries the landform; no stepped levels in compose

# =====================================================================================================
# 2. HARBOUR STRUCTURES + BERTHS
# =====================================================================================================
PIERS = {pid: dict(id=pid, chain=CHAINS[pid], kind='', gate=None, segments=[], berths=[], counts=Counter()) for pid in CHAINS}
STRUCT = []
FOOT = []
LAMPS = []           # (x, y, z, kind, color)
BOLLARDS = []
PIER_ENDS = {}       # gate -> [(end point, direction)]
PIER_FRAMES = []     # one per finger_pier call: root, direction (the builder lays its planks across this axis)


def foot(center, d, cls, sprit=True):
    L = LOA[cls] + (SPRIT[cls] if sprit else 0.0)
    c = add(center, mul(d, (SPRIT[cls] if sprit else 0.0) / 2))
    return rect(c, d, L, BEAM[cls])


def add_berth(pid, cls, center, d, approach, gate, mode):
    P = PIERS[pid]
    P['counts'][cls] += 1
    bid = f"{pid}/{cls}/{P['counts'][cls]:03d}"
    P['berths'].append(dict(id=bid, cls=cls, pos=center, d=d, approach=approach, gate=gate, mode=mode))
    FOOT.append((foot(center, d, cls, sprit=(mode != 'finger')), bid))
    return bid


def alongside_line(pid, a, b, face_n, cls, gate, bow, zdeck=Z_SHORE, fender=0.8, swing_in=1.0, lead=None, off_k=None, direct=False):
    """One alongside berth on the chord a-b of a quay (world). face_n points into the water; `lead` = waypoints
    that bring the hull round obstacles before the standard come-alongside."""
    d = norm(sub(b, a)); face_n = norm(face_n)
    mid = lerp(a, b, 0.5)
    c = add(mid, mul(face_n, BEAM[cls] / 2 + fender))
    dd = mul(d, bow)
    Lb = length(sub(b, a))
    off = BEAM[cls] * 2.2 + 6
    if off_k is not None:
        off = BEAM[cls] * off_k + 3.0
    if direct:      # no room astern (a back quay): come in from the lead, square off the berth, slide alongside
        app = list(lead or []) + [add(c, add(mul(face_n, BEAM[cls] + 3.0), mul(d, -bow * Lb * 0.2))), c]
    else:
        app = list(lead or []) + [add(mid, add(mul(face_n, off + 14 * swing_in), mul(d, -bow * (Lb * 0.9)))),
                                  add(mid, add(mul(face_n, off), mul(d, -bow * Lb * 0.35))), c]
    add_berth(pid, cls, c, dd, app, gate, 'alongside')
    for k in (-0.36, 0.36):
        BOLLARDS.append((*add(mid, mul(d, Lb * k)), zdeck))


def alongside_run(pid, start, direction, face_n, classes, gate, bow=+1, gap=1.0, zdeck=Z_SHORE, fender=0.8, lead=None):
    direction = norm(direction); face_n = norm(face_n)
    s = gap
    for cls in classes:
        Lb = ALONG[cls]
        a = add(start, mul(direction, s)); b = add(start, mul(direction, s + Lb))
        alongside_line(pid, a, b, face_n, cls, gate, bow, zdeck, fender, swing_in=0.5, lead=lead)
        s += Lb
    return s + gap


def arc_alongside(pid, theta0, classes, gate, gap_deg=2.0, r=R_QUAY, step=-1, fender=0.8):
    """Alongside berths round the Vagen arc (screen degrees), each on its chord; returns the end angle."""
    th = theta0
    for cls in classes:
        Lb = ALONG[cls]
        dth = math.degrees(2 * math.asin(min(1.0, Lb / 2 / r)))
        a = W(*vagen(th)); b = W(*vagen(th + step * dth))
        mid = lerp(a, b, 0.5)
        n = norm(sub(W(*CT), mid))                   # into the water (toward the centre)
        alongside_line(pid, a, b, n, cls, gate, bow=+1 if step < 0 else -1, fender=fender)     # the quay is the chord here
        th += step * (dth + gap_deg)
    return th


def finger_pier(pid, root, direction, width, left, right, head=None, gate=None, lamp=True, first=4.0,
                outer_left=(), outer_right=(), deck=DECK, material='timber', fair=(None, None), first_lr=None):
    """Main pier from `root` along `direction` (world); left/right = finger-berth class sequences from the root
    outward; outer_* = alongside berths beyond the fingers; head = (length, [classes]) T-head. Boats lie
    perpendicular to the pier, bow-in."""
    direction = norm(direction)
    n_l = perp(direction)
    lens = {}
    fingers = []
    pi = len(PIER_FRAMES)
    PIER_FRAMES.append(dict(pid=pid, root=root, dir=direction, width=width, deck=deck, material=material))
    # pier length first (the fairway entrance sits beyond the head)
    fl_, fr_ = first_lr or (first, first)

    def side_len(seq, outer, f0):
        t = f0; prev = None
        for cls in seq:
            if prev is not None and prev != cls:
                t += 0.8
            t += PITCH[cls]; prev = cls
        return t + 1.0 + sum(ALONG[c] for c in outer)
    L0 = max(side_len(left, outer_left, fl_), side_len(right, outer_right, fr_)) + 1.0
    tip0 = L0 + ((6.0 + max(BEAM[c] for c in head[1]) + 1.6) if head else 0.0)
    for s, seq, outer, fr, f0 in ((+1, left, outer_left, fair[0], fl_), (-1, right, outer_right, fair[1], fr_)):
        n = mul(n_l, s)
        t = f0; prev = None; pair = 0
        hh = (head[0] / 2 + 5.0) if head else 0.0
        for cls in seq:
            pitch = PITCH[cls]
            if prev is not None and prev != cls:
                t += 0.8
            base = add(root, mul(direction, t + pitch / 2))
            c = add(base, mul(n, width / 2 + 0.7 + LOA[cls] / 2))
            fw = fr if fr is not None else width / 2 + LOA[cls] + 14.0
            # approach: beyond the head, round the T-head, into the fairway (halfway between this pier's sterns and
            # the next pier's), down it, then square in to the slot
            if hh > fw:
                app = [add(add(root, mul(direction, tip0 + 10.0)), mul(n, hh)), add(add(root, mul(direction, L0 - 3.0)), mul(n, hh)),
                       add(add(root, mul(direction, L0 - 3.0)), mul(n, fw))]
            else:
                app = [add(add(root, mul(direction, tip0 + 10.0)), mul(n, fw))]
            app += [add(base, mul(n, fw)), add(base, mul(n, width / 2 + LOA[cls] + 1.5)), c]
            add_berth(pid, cls, c, mul(n, -1), app, gate, 'finger')
            if pair % 2 == 0:
                fingers.append((add(root, mul(direction, t + pitch)), n, FINGER[cls]))
            pair += 1; t += pitch; prev = cls
        if seq and pair % 2 == 1:
            fingers.append((add(root, mul(direction, t)), n, FINGER[prev]))
        t += 1.0
        for cls in outer:
            Lb = ALONG[cls]
            a = add(add(root, mul(direction, t)), mul(n, width / 2))
            b = add(add(root, mul(direction, t + Lb)), mul(n, width / 2))
            side_off = max(hh, width / 2 + BEAM[cls] * 2.2 + 6 + 14)
            alongside_line(pid, a, b, n, cls, gate, -1, deck, 0.8,
                           lead=[add(add(root, mul(direction, tip0 + 10.0)), mul(n, side_off))])
            t += Lb
        lens[s] = t
    L = max(lens.values()) + 1.0
    end = add(root, mul(direction, L))
    P = PIERS[pid]
    P['segments'].append(dict(kind='arm', a=root, b=end, width=width))
    STRUCT.append(dict(kind='pier', pid=pid, pi=pi, a=root, b=end, width=width, deck=deck, material=material))
    for (p, n, fl) in fingers:
        a = add(p, mul(n, width / 2 - 0.2)); b = add(p, mul(n, width / 2 + fl))
        P['segments'].append(dict(kind='finger', a=a, b=b, width=0.9))
        STRUCT.append(dict(kind='finger', pid=pid, pi=pi, a=a, b=b, width=0.9, deck=deck, material=material))
    tip = L
    if head:
        hl, hcls = head
        tw = 6.0
        hc = add(end, mul(direction, tw / 2))
        a = add(hc, mul(n_l, hl / 2)); b = add(hc, mul(n_l, -hl / 2))
        P['segments'].append(dict(kind='thead', a=a, b=b, width=tw))
        STRUCT.append(dict(kind='thead', pid=pid, pi=pi, a=a, b=b, width=tw, deck=deck, material=material))
        face0 = add(add(hc, mul(direction, tw / 2)), mul(n_l, hl / 2))
        alongside_run(pid, face0, mul(n_l, -1), direction, hcls, gate, bow=+1, zdeck=deck,
                      gap=(hl - sum(ALONG[c] for c in hcls)) / 2,
                      lead=[add(add(root, mul(direction, tip0 + 14.0)), mul(n_l, hl / 2 + 14.0))])
        for k in (-1, 1):
            LAMPS.append((*add(add(hc, mul(direction, -tw / 2 + 0.6)), mul(n_l, k * (hl / 2 - 0.8))), deck, 'pierhead', PENNANT.get(pid)))
        tip = L + tw + max(BEAM[c] for c in hcls) + 1.6
    elif lamp:
        LAMPS.append((*add(end, mul(direction, -0.8)), deck, 'pierhead', PENNANT.get(pid)))
    PIER_ENDS.setdefault(gate, []).append((add(root, mul(direction, tip)), direction))
    return tip, end


# ---------------------------------------------------------------- the Vagen (Ethereum Grand Quay): the big ships round the arc
M, S_ = 'medium', 'small'
PIERS['pier-ethereum']['kind'] = 'grand'
# the Grand Quay as its berth facets (segments lie ON the quay line: never a chord across the Vagen's water)
def _inland(a, b, water_pt, k=1.0):
    """Segment a-b moved k m inland (away from water_pt): a 2 m quay strip whose water edge is the wall face."""
    nn = perp(norm(sub(b, a)))
    if dot(nn, sub(water_pt, lerp(a, b, 0.5))) > 0:
        nn = mul(nn, -1)
    return add(a, mul(nn, k)), add(b, mul(nn, k))


for _s0, _s1 in VAGEN_SPANS:
    _a, _b = _inland(W(*vagen(_s1)), W(*vagen(_s0)), W(*CT))
    PIERS['pier-ethereum']['segments'].append(dict(kind='quay', a=_a, b=_b, width=2.0))
# west half (flagship, large, large) from the battery side, east half (large, flagship, large) from the warehouse side
_th = arc_alongside('pier-ethereum', VAGEN_BERTHS[0][0], VAGEN_BERTHS[0][1], 'g-eth-vagen', step=-1, gap_deg=VAGEN_GAP_DEG, fender=1.0)
_th2 = arc_alongside('pier-ethereum', VAGEN_BERTHS[1][0], VAGEN_BERTHS[1][1], 'g-eth-vagen', step=+1, gap_deg=VAGEN_GAP_DEG, fender=1.0)
assert _th2 - VAGEN_GAP_DEG < _th + VAGEN_GAP_DEG, ('Vagen berths overlap', _th, _th2)

# ---------------------------------------------------------------- the Ethereum marina: moles + Mediterranean rows
MOLES = []             # world: the stone moles (centre line root -> head, width, round pierhead)


def _bezier(p0, p1, p2, p3, n):
    out = []
    for k in range(n + 1):
        t = k / n; m = 1 - t
        out.append(tuple(m ** 3 * p0[i] + 3 * m * m * t * p1[i] + 3 * m * t * t * p2[i] + t ** 3 * p3[i] for i in range(2)))
    return out


def m2_root_curve(r):
    """The Grand Mole's root (screen plan): from the wharf, an S-curve that meets the arc of radius r tangentially at
    M2_U[1] (no knee) - root first, arc end last."""
    ua = M2_U[1]; A = (ua, marc(r, ua))
    sl = (ua - MC[0]) / math.sqrt(r * r - (ua - MC[0]) ** 2)          # dV/dU of the arc at A
    tA = norm((-1.0, -sl))                                              # travel root -> head at A
    R0 = M2_ROOT; t0 = norm((-1.0, 0.3))                                # leaving the wharf heading (nearly) west
    k = length(sub(A, R0)) * 0.42
    return _bezier(R0, add(R0, mul(t0, k)), sub(A, mul(tA, k)), A, 10)


def mole(name, r, u_root, u_head, width, root=False):
    pts = arc_pts(r, u_root, u_head, 6.0)
    if root:
        pts = m2_root_curve(r)[:-1] + pts
    line = Wl(pts)
    MOLES.append(dict(name=name, line=line, width=width, head=line[-1], head_r=HEAD_R[name], r=r))
    # the pier's own segments (sim obstacle stamping + where mooring lines make fast): the mole's crest in ~12 m pieces
    for a_, b_ in zip(line[::2], line[2::2] + ([line[-1]] if len(line) % 2 == 0 else [])):
        PIERS['pier-ethereum']['segments'].append(dict(kind='mole', a=a_, b=b_, width=width))
    hc = line[-1]
    PIERS['pier-ethereum']['segments'].append(dict(kind='mole', a=add(hc, (-0.5, 0.0)), b=add(hc, (0.5, 0.0)), width=2 * HEAD_R[name]))


def mole_polys():
    out = []
    for m in MOLES:
        L = m['line']
        out.append(offset(L, m['width'] / 2, closed=False) + offset(L, -m['width'] / 2, closed=False)[::-1])
        c = m['head']
        out.append([add(c, (math.cos(k * math.pi / 10) * m['head_r'], math.sin(k * math.pi / 10) * m['head_r'])) for k in range(20)])
    return out


mole('inner', R_M1, M1_U[0], M1_U[1], W_M1)
mole('grand', R_M2, M2_U[1], M2_U[0], W_M2, root=True)
for _L in (LONG_QUAY, [LONG_QUAY[-1]] + WEST_SHORE):     # the Long Quay + west shore as quay segments (mooring lines)
    _Lw = Wl(_L)
    for _a, _b in zip(_Lw, _Lw[1:]):
        _a, _b = _inland(_a, _b, W(10.0, -150.0))
        PIERS['pier-ethereum']['segments'].append(dict(kind='quay', a=_a, b=_b, width=2.0))

MOUTH = [(-100.0, marc(R_F2, -100.0))]                               # into the outer fairway past the Grand Mole's head


def lead_f2(u):
    return MOUTH + [(uu, marc(R_F2, uu)) for uu in range(-80, int(u) - 10, 22)]


TURN = [(158.0, marc(R_F2 + 15.4, 158.0)), (161.0, marc(R_M1 + 5.2, 161.0)), (154.0, marc(R_F1 - 5.2, 154.0))]   # round the Inner Mole's head into the inner fairway


def lead_f1(u):
    return lead_f2(152.0) + TURN + [(uu, marc(R_F1, uu)) for uu in range(138, int(u) + 10, -22)]


def med_row(pid, r_face, side, u_from, u_to, seq, gate, lead, fair_r, skip=()):
    """Bow-in (Mediterranean) berths side by side along the marina arc r_face, from screen U u_from toward u_to; side +1:
    the hulls lie on the centre's side of the face (north), -1 the far side. seq = classes laid in order while the arc
    lasts; skip = U intervals left free (water stairs, a crane). lead(u) = fairway waypoints (screen) from the gate.
    Each hull's last run is straight down its own axis from the fairway centre line (the sim docks bow-first)."""
    sgn = 1 if u_to > u_from else -1
    a = mang(u_from, r_face); a_end = mang(u_to, r_face)
    prev = None; out = []; i = 0
    while i < len(seq):
        cls = seq[i]
        pitch = PITCH[cls] + (0.8 if prev and prev != cls else 0.0)
        if (a + sgn * pitch / r_face - a_end) * sgn > 0:
            break
        F = mpt(r_face, a + sgn * pitch / 2 / r_face)
        if any(lo <= F[0] <= hi for lo, hi in skip):
            a += sgn * 1.0 / r_face; prev = None
            continue
        toc = norm(sub(MC, F)); n_in = toc if side > 0 else mul(toc, -1)
        c = add(F, mul(n_in, BOW_GAP + LOA[cls] / 2))
        w = add(F, mul(n_in, abs(r_face - fair_r)))
        al = add(F, mul(n_in, BOW_GAP + LOA[cls] + 1.5))
        add_berth(pid, cls, W(*c), Wd(*mul(n_in, -1)), Wl(lead(F[0]) + [w, al, c]), gate, 'finger')
        BOLLARDS.append((*W(*add(F, mul(n_in, -0.6))), Z_SHORE))
        out.append(cls); a += sgn * pitch / r_face; prev = cls; i += 1
    return out


_NM = REQ['pier-ethereum']['medium']; _NS = REQ['pier-ethereum']['small']
_rows = {}
# the Grand Mole's inner face: the mediums, root (east) to head (west)
_rows['m2s'] = med_row('pier-ethereum', R_M2S, -1, 146.0, -68.0, [M] * 60, 'g-eth-marina', lead_f2, R_F2)
_nm = _NM - _rows['m2s'].count(M)
# the Inner Mole's north face: the rest of the mediums from the root, then smalls; its south face and the Long Quay: smalls
_rows['m1n'] = med_row('pier-ethereum', R_M1N, +1, -114.0, 91.0, [M] * max(0, _nm) + [S_] * 60, 'g-eth-marina', lead_f2, R_F2)
_rows['m1s'] = med_row('pier-ethereum', R_M1S, -1, -111.0, 91.0, [S_] * 60, 'g-eth-marina', lead_f1, R_F1)
_ns = _NS - _rows['m1n'].count(S_) - _rows['m1s'].count(S_)
_rows['lq'] = med_row('pier-ethereum', R_LQ, +1, -110.0, 124.0, [S_] * max(0, _ns + 4), 'g-eth-marina', lead_f1, R_F1, skip=((10.0, 26.0),))
MARINA_ROWS = {k: len(v) for k, v in _rows.items()}

# the big ships alongside the Grand Mole's outer face, each on a straight facet (chord) of the arc, bows east
_a0 = mang(-68.0, R_M2N)
for _k in range(7):
    _da = ALONG['large'] / R_M2N
    _pa, _pb = W(*mpt(R_M2N, _a0)), W(*mpt(R_M2N, _a0 + _da))
    _n = norm(sub(W(*MC), lerp(_pa, _pb, 0.5)))
    alongside_line('pier-ethereum', _pa, _pb, _n, 'large', 'g-eth-mole', +1, fender=0.9)
    _a0 += _da + 1.6 / R_M2N
# ... and one more: on the arc if it still has room, else on the root's chord where the S-curve runs into the wharf
if mpt(R_M2N, _a0 + ALONG['large'] / R_M2N)[0] <= M2_U[1] + 1.0:
    _pa, _pb = W(*mpt(R_M2N, _a0)), W(*mpt(R_M2N, _a0 + ALONG['large'] / R_M2N))
    alongside_line('pier-ethereum', _pa, _pb, norm(sub(W(*MC), lerp(_pa, _pb, 0.5))), 'large', 'g-eth-mole', +1, fender=0.9)
else:
    _rc = Wl(m2_root_curve(R_M2))
    _rp = [_rc[1], along(_rc, ALONG['large'] + 6.0)[0]]
    _rd = norm(sub(_rp[0], _rp[1])); _rn = perp(_rd)
    if dot(_rn, sub(W(150.0, -40.0), _rp[1])) < 0:
        _rn = mul(_rn, -1)
    _ra = add(add(_rp[1], mul(_rn, W_M2 / 2 + 0.4)), mul(_rd, 3.0))
    alongside_line('pier-ethereum', _ra, add(_ra, mul(_rd, ALONG['large'])), _rn, 'large', 'g-eth-mole', +1, fender=0.9)
# the warehouse wharf (lagoon east shore, Bryggen): one big hull alongside under the gable fronts
_ew = Wl(EAST_WHARF)
_s = 1.0
for cls in ('large',):
    a_, _ = along(_ew, _s); b_, _ = along(_ew, _s + ALONG[cls])
    nrm = perp(norm(sub(b_, a_)))
    if dot(nrm, sub(W(120.0, -70.0), a_)) < 0:
        nrm = mul(nrm, -1)
    alongside_line('pier-ethereum', a_, b_, nrm, cls, 'g-eth-wharf', +1, fender=0.9)
    _s += ALONG[cls] + 1.5

# ---------------------------------------------------------------- Tron: under the Pharos, alongside the stone quay
PIERS['pier-tron']['kind'] = 'deepwater-quay'
TQ = Wl(TRON_QUAY)
for _a, _b in zip(TQ, TQ[1:]):                 # the quay's own polyline (a chord would cut across the berths' water)
    _a, _b = _inland(_a, _b, W(-60.0, -20.0))
    PIERS['pier-tron']['segments'].append(dict(kind='quay', a=_a, b=_b, width=2.0))
# the quay is sized from Tron's supply share (D10 / PLAN 4.2), the berths from its occupancy: big hulls alongside from the
# north end, the rest of the frontage is bollards and empty slots (a deep-water quay waiting for its fleet)
_tq = TQ[::-1]
_s = 2.0
for cls in ('flagship', 'large', 'medium', 'medium', 'small', 'small', 'boat', 'boat', 'skiff', 'skiff'):
    a_, _ = along(_tq, _s); b_, _ = along(_tq, _s + ALONG[cls])
    nrm = perp(norm(sub(b_, a_)))
    if dot(nrm, sub(W(-60.0, -20.0), a_)) < 0:
        nrm = mul(nrm, -1)
    alongside_line('pier-tron', a_, b_, nrm, cls, 'g-tron', +1, fender=1.0)
    _s += ALONG[cls] + 1.2
TRON_FREE = (_s, polyline_len(_tq))          # the empty frontage (bollards + painted slots, dressed by the builder)
STORM = W(2.0, 112.0)                    # storm-signal mast on the battery tip, at the mouth

# the breakwater: a long mole off the battery tip running out to sea along the mouth's east side (red light at its head);
# it shelters the outer roads behind it and carries the sky card out past the Shoals (the frames see the reef)
BW_W = 8.0
BW_LINE = Wl([(8.0, 112.0), (11.0, 126.0), (15.0, 142.0), (18.0, 158.0), (17.0, 174.0)])
HARBOUR_LIGHTS = [(BW_LINE[-1], 'red')]
for _m in MOLES:          # the marina: a light on each pierhead (green to starboard coming in, red to port) + crest lamps
    HARBOUR_LIGHTS.append((_m['head'], 'green' if _m['name'] == 'grand' else 'red', Z_SHORE + 8.95))
    _tot = polyline_len(_m['line']); _s = 12.0
    while _s < _tot - _m['head_r'] - 8.0:
        _p, _t = along(_m['line'], _s)
        LAMPS.append((_p[0], _p[1], Z_SHORE, 'lamp', None)); _s += 24.0
    _p, _t = along(_m['line'], _tot - _m['head_r'] - 2.5)
    LAMPS.append((_p[0], _p[1], Z_SHORE, 'pierhead', PENNANT['pier-ethereum']))

# ---------------------------------------------------------------- the six coves: a pier out of each cove, sheds at the back
COVE_PIERS = {     # (fingers west, fingers east, side-quay alongside west, east, T-head)  (west/east = along -t/+t)
    'pier-hyperliquid-l1': ([], [], (), (), (40.0, ['flagship'])),
    'pier-polygon': ([S_, S_, M], [S_, S_, M], (), (), (26.0, ['large'])),
    'pier-arbitrum': ([M, M, S_, S_, S_], [M, M, S_, S_], ('large',), (), (26.0, ['large'])),
    'pier-base': ([M, M, S_, S_, S_, S_, S_], [M, M, S_, S_, S_, S_], ('large',), ('large',), (40.0, ['flagship'])),
    'pier-solana': ([M, M, M, S_, S_, S_, S_], [M, M, M, S_, S_, S_], ('large',), ('large',), (40.0, ['flagship'])),
    'pier-bsc': ([M, M, S_, S_, S_, S_, S_], [M, M, S_, S_, S_, S_, S_], ('large',), ('large',), (28.0, ['large'])),
}
COVE_BACK = {'pier-solana': 'we', 'pier-bsc': 'e'}      # a big hull alongside the back quay (that half of it)
COVE_CHARACTER = {   # what makes each hamlet itself (the Blender builder dresses by this)
    'pier-hyperliquid-l1': 'deepwater stone jetty, beacon tower, mint-green doors',
    'pier-polygon': 'boatyard: a hull on stocks, timber stacks, violet shutters',
    'pier-arbitrum': 'rope-walk + chandlery, blue-painted sheds, coiled rope',
    'pier-base': 'fishing hamlet: hjell drying racks, net lofts, blue trim',
    'pier-solana': 'merchant wharf: crane, warehouse, purple awnings',
    'pier-bsc': 'timber wharf: lumber stacks, gold-ochre sheds, hand crane',
}
for pid, c, n, hw, depth in COVES:
    I = COVE_INFO[pid]
    Ls, Rs, sW, sE, head = COVE_PIERS[pid]
    PIERS[pid]['kind'] = 'cove'
    qa, qb = W(*I['qa']), W(*I['qb'])
    PIERS[pid]['segments'].append(dict(kind='quay', a=qa, b=qb, width=8.0))
    g = 'g-' + pid[5:]
    root = W(*I['back']); dirw = Wd(*I['n'])
    hw_free = hw - (6.5 if (sW or sE) else 1.0)
    if pid == 'pier-hyperliquid-l1':
        finger_pier(pid, root, dirw, 4.2, [], [], head=head, gate=g, deck=Z_SHORE, material='stone', first=24.0)
    else:
        fr = (hw_free + 15.0) / 2 + 0.5 if (sW or sE) else (hw - 7.0 + 13.0) / 2
        finger_pier(pid, root, dirw, 2.6, Rs, Ls, head=head, gate=g, first=9.0 if pid in COVE_BACK else 5.0, fair=(fr, fr))
    for sd in COVE_BACK.get(pid, ''):
        sgn = -1 if sd == 'w' else 1
        qa_ = W(*add(I['back'], mul(I['t'], sgn * (hw - 7.5))))
        qb_ = W(*add(I['back'], mul(I['t'], sgn * (hw - 7.5 - ALONG['large']))))
        lead = [W(*add(add(c, mul(I['n'], 24.0)), mul(I['t'], sgn * (hw - 9.0)))), W(*add(add(I['back'], mul(I['n'], 16.0)), mul(I['t'], sgn * (hw - 9.0))))]
        alongside_line(pid, qa_, qb_, Wd(*I['n']), 'large', g, +1, fender=1.3, lead=lead, direct=True)
    # side-wall quays: one big hull alongside each wall that needs it, bow in
    for side, cls_list, (pa, pb) in (('w', sW, I['w']), ('e', sE, I['e'][::-1])):
        if not cls_list:
            continue
        a_, b_ = W(*pa), W(*pb)
        dw = norm(sub(b_, a_)); mid_ = lerp(a_, b_, 0.5)
        L_ = min(length(sub(b_, a_)), ALONG[cls_list[0]])
        a_ = add(mid_, mul(dw, -L_ / 2)); b_ = add(mid_, mul(dw, L_ / 2))          # centred on the wall
        inward = perp(dw)
        if dot(inward, Wd(*(I['t'] if side == 'w' else mul(I['t'], -1)))) < 0:
            inward = mul(inward, -1)
        sgn = -1 if side == 'w' else 1
        lead = [W(*add(add(c, mul(I['n'], 22.0)), mul(I['t'], sgn * (hw - 7.0))))]
        alongside_line(pid, a_, b_, inward, cls_list[0], g, +1, fender=1.2,
                       swing_in=0.0, lead=lead, off_k=1.0)

# =====================================================================================================
# 4. LANE GRAPH. The lagoon loop (one way: in under the Pharos, round past the pier heads, out by the battery),
#    the mouth toward the horizon, the outer ring round the island past every cove, the Far Ports, the Shoals.
# =====================================================================================================
NODES = {}
EDGES = []


def node(nid, p):
    NODES[nid] = p
    return nid


def chain_edges(ids, closed=False):
    for a, b in zip(ids, ids[1:] + ([ids[0]] if closed else [])):
        EDGES.append((a, b))


LOOP = [('L-m', (-34.0, 96.0)), ('L-t1', (-46.0, 62.0)), ('L-t2', (-66.0, 32.0)), ('L-w1', (-84.0, 6.0)),
        ('L-w2', (-90.0, -34.0)), ('L-w3', _lift(-96.0, -64.0)), ('L-s1', _lift(-50.0, -62.0)), ('L-s2', _lift(10.0, -64.0)),
        ('L-s3', _lift(70.0, -60.0)), ('L-s4', _lift(124.0, -54.0)), ('L-e1', _lift(154.0, -50.0)), ('L-e2', (152.0, -30.0)),
        ('L-v1', (128.0, -22.0)), ('L-v2', (70.0, -21.0)), ('L-v3', (28.0, -14.0)), ('L-c1', (8.0, 18.0)), ('L-c2', (-6.0, 52.0)),
        ('L-c3', (-16.0, 86.0))]
for nid, p in LOOP:
    node(nid, W(*p))
chain_edges([n for n, _ in LOOP], closed=True)
# out of the mouth north past the breakwater head, east round the outer roads; in from the west north of the Shoals
OUTER = [('M-in', (-44.0, 136.0)), ('M-out', (-20.0, 146.0)), ('M-out2', (-4.0, 162.0)), ('O-1', (-2.0, 236.0)), ('O-2', (130.0, 238.0)),
         ('O-3', (250.0, 150.0)), ('FP-gate', (292.0, 64.0)), ('O-4', (310.0, -10.0)), ('O-5', (306.0, -112.0)), ('C-0', (296.0, -200.0)),
         ('C-r1', (196.0, -348.0)), ('C-r2', (40.0, -360.0)), ('C-r3', (-140.0, -350.0)), ('C-w', (-306.0, -246.0)),
         ('O-6', (-338.0, -150.0)), ('O-7', (-262.0, 80.0)), ('O-8', (-200.0, 112.0)), ('O-9', (-150.0, 196.0)), ('SH-gate', (-104.0, 180.0))]
for nid, p in OUTER:
    node(nid, W(*p))
EDGES += [('L-c3', 'M-out'), ('M-out', 'M-out2'), ('M-out2', 'O-1'), ('O-1', 'O-2'), ('O-2', 'O-3'), ('O-3', 'FP-gate'), ('FP-gate', 'O-4'), ('O-4', 'O-5'),
          ('O-5', 'C-0'), ('C-0', 'C-r1'), ('C-r1', 'C-r2'), ('C-r2', 'C-r3'), ('C-r3', 'C-w'), ('C-w', 'O-6'), ('O-6', 'O-7'),
          ('O-7', 'O-8'), ('O-8', 'O-9'), ('O-9', 'SH-gate'), ('SH-gate', 'M-in'), ('M-in', 'L-m')]
# cove lane: one node off each cove mouth, spliced into the south ring (east -> west)
coast_ids = ['C-0']
for pid, c, n, hw, depth in sorted(COVES, key=lambda cv: -cv[1][0]):
    nid = 'C-' + pid[5:]
    node(nid, W(*add(c, mul(n, {'pier-hyperliquid-l1': 88.0, 'pier-polygon': 80.0, 'pier-bsc': 112.0}.get(pid, 92.0)))))
    coast_ids.append(nid)
# rebuild the south ring through the cove nodes, ordered east -> west
EDGES = [e for e in EDGES if e not in (('C-0', 'C-r1'), ('C-r1', 'C-r2'), ('C-r2', 'C-r3'), ('C-r3', 'C-w'))]
_south = ['C-0'] + [n for n in coast_ids[1:]] + ['C-w']
for k in ('C-r1', 'C-r2', 'C-r3'):
    del NODES[k]
chain_edges(_south)
coast_ids = _south

# =====================================================================================================
# 3. MOORINGS (skiff + boat): organic drifts, every bow into the wind
# =====================================================================================================
SWING = {'boat': LOA['boat'] + 2.5, 'skiff': LOA['skiff'] + 2.0}
MOORINGS = []
_WC = perp(WIND_BOW)


def _mooring_clear(p, cls, k_sp):
    """Wind-frame spacing between buoys (every hull lies to the same wind): bow-to-stern >= LOA + 3.5 m, abeam >= beam
    + 4 m (room for the swing), each scaled by the larger of the two buoys' own 1.0-1.45 spacing jitter."""
    for m in MOORINGS:
        q = m['buoy']
        dx, dy = p[0] - q[0], p[1] - q[1]
        if abs(dx) > 40 or abs(dy) > 40:
            continue
        a = dx * WIND_BOW[0] + dy * WIND_BOW[1]; c = dx * _WC[0] + dy * _WC[1]
        k = max(k_sp, m['k'])
        A = (max(LOA[cls], LOA[m['cls']]) + 3.5) * k
        C = ((BEAM[cls] + BEAM[m['cls']]) / 2 + 4.0) * k
        if (a / A) ** 2 + (c / C) ** 2 < 1.0:
            return False
    return True


_SEA_D = None


def sea_clear(p):
    """Metres from p to the nearest land or structure (1 m raster, built once; > 0 in open water, 0 on land)."""
    global _SEA_D
    if _SEA_D is None:
        import numpy as np
        from PIL import Image, ImageDraw
        from scipy import ndimage
        xs = [q[0] for q in COAST]; ys = [q[1] for q in COAST]
        x0, y1 = min(xs) - 300, max(ys) + 300
        nx, ny = int(max(xs) + 300 - x0), int(y1 - (min(ys) - 300))
        im = Image.new('L', (nx, ny), 0); dr = ImageDraw.Draw(im)
        dr.polygon([(q[0] - x0, y1 - q[1]) for q in COAST], fill=1)
        for poly in structure_polys() + [sk_['poly'] for sk_ in SKERRIES]:
            dr.polygon([(q[0] - x0, y1 - q[1]) for q in poly], fill=1)
        _SEA_D = (x0, y1, ndimage.distance_transform_edt(np.array(im) == 0))
    x0, y1, D = _SEA_D
    i, j = int(y1 - p[1]), int(p[0] - x0)
    return float(D[i, j]) if 0 <= i < D.shape[0] and 0 <= j < D.shape[1] else 1e3


def drift(pid, blobs, counts, seed, outer=False, avoid=None, loose=(1.0, 1.3, 1.7), gates=None, lane_clear=7.0):
    """Organic mooring clusters. blobs = [(centre uv, radius u, radius v, angle, weight)]: buoys are dart-thrown from
    truncated gaussians (dense cores, loose fringes), so the field reads as drifts and clusters with water between,
    never a lattice. `outer` = outside the lagoon (gate from the outer ring)."""
    rng = random.Random(seed)
    berths = [(b['pos'], LOA[b['cls']] / 2 + SPRIT[b['cls']] + 6.0) for P in PIERS.values() for b in P['berths']]

    def bad(p, cls):
        """Checks the whole swinging hull (buoy -> stern, lying downwind), not just the buoy."""
        if avoid and avoid(p):
            return True
        hull = [add(p, mul(WIND_BOW, -k * (LOA[cls] + 1.2))) for k in (0.0, 0.5, 1.0)]
        if any(sea_clear(q) < 11.0 for q in hull):
            return True
        # the sim brings the hull up from downwind (LOA x 2.2 + 10 m astern of the buoy): that run must be open water
        ap = add(p, mul(WIND_BOW, -(LOA[cls] * 2.2 + 10.0)))
        if any(sea_clear(add(p, mul(WIND_BOW, -k * (LOA[cls] * 2.2 + 10.0)))) < 5.0 for k in (0.4, 0.7, 1.0)):
            return True
        if gates:          # ... and so must the run in from the gate node it will be given
            g = min(gates, key=lambda n: length(sub(NODES[n], p)))
            if any(sea_clear(lerp(NODES[g], ap, k / 12)) < 4.0 for k in range(13)):
                return True
            if any(seg_dist((x, y), NODES[g], ap) < r + 3.0 for x, y, r in COVE_ROCKS + SHOALS_ROCKS):     # rocks are not in sea_clear
                return True
        if any(abs(q[0] - b_[0]) < rr and abs(q[1] - b_[1]) < rr and length(sub(q, b_)) < rr for q in hull for b_, rr in berths):
            return True
        if any(seg_dist(q, NODES[a_], NODES[b_]) < lane_clear for q in hull for a_, b_ in EDGES):
            return True
        return any(length(sub(q, (x, y))) < r + 12.0 for q in hull for x, y, r in SHOALS_ROCKS + COVE_ROCKS)
    order = ['boat'] * counts.get('boat', 0) + ['skiff'] * counts.get('skiff', 0)
    rng.shuffle(order)
    wsum = sum(b[4] for b in blobs)
    i = tries = 0
    while i < len(order) and tries < 60000:
        tries += 1
        cls = order[i]
        r_ = rng.uniform(0, wsum)
        for b in blobs:
            r_ -= b[4]
            if r_ <= 0:
                break
        (cu, cv), ru, rv, ang, _w = b
        x, y = rng.gauss(0, 0.55), rng.gauss(0, 0.55)
        if x * x + y * y > 1.0:
            continue
        p = W(*add((cu, cv), rot((x * ru, y * rv), ang)))
        k_sp = rng.uniform(loose[0], loose[1]) if rng.random() < 0.7 else rng.uniform(loose[1], loose[2])
        if bad(p, cls) or not _mooring_clear(p, cls, k_sp):
            continue
        d = rot(WIND_BOW, rng.uniform(-0.12, 0.12))
        c = add(p, mul(d, -(LOA[cls] / 2 + 1.2)))
        k = sum(1 for m in MOORINGS if m['pid'] == pid and m['cls'] == cls) + 1
        MOORINGS.append(dict(id=f'{pid}/m-{cls}/{k:03d}', chain=CHAINS[pid], pid=pid, cls=cls, buoy=p, center=c, d=d, swing=SWING[cls],
                             k=k_sp, outer=outer))
        FOOT.append((foot(c, d, cls), MOORINGS[-1]['id']))
        i += 1
    if i < len(order):
        print(f'WARN drift {pid}: placed {i} of {len(order)}')


def structure_polys(kinds=False):
    out = []
    for s in STRUCT:
        if s['kind'] in ('pier', 'thead', 'finger'):
            a, b, w = s['a'], s['b'], s['width']
            d = norm(sub(b, a)); n = perp(d)
            out.append(([add(a, mul(n, w / 2)), add(b, mul(n, w / 2)), add(b, mul(n, -w / 2)), add(a, mul(n, -w / 2))], s['kind']))
    L = BW_LINE
    out.append((offset(L, BW_W / 2, closed=False) + offset(L, -BW_W / 2, closed=False)[::-1], 'breakwater'))
    out += [(p_, 'mole') for p_ in mole_polys()]
    return out if kinds else [p for p, _ in out]


def occ(pid, cls):
    return REQ[pid][cls]


# the Shoals: a reef just outside the mouth off the Pharos' cliff point, inside the beam's sweep (off peg = left the
# safe harbour); placed here so the moorings keep clear of its rocks
rng = random.Random(7)
SH_C = W(-42.0, 172.0)
SH_ANG = 0.785                        # world-plan angle of the reef's long axis (= screen U: across the mouth's sightline)
SHOALS_POLY = ccw(blob(SH_C, 29, 10, rng, 18, 0.2, ang=SH_ANG))
SHOALS_ROCKS = []
for k in range(18):
    a = rng.uniform(0, 6.28); r = math.sqrt(rng.uniform(0.05, 1))
    p = add(SH_C, rot((math.cos(a) * 24 * r, math.sin(a) * 7 * r), SH_ANG))
    SHOALS_ROCKS.append((p[0], p[1], rng.uniform(1.1, 2.6) * (1.35 - r * 0.5)))
# anchorages over and round the reef: a swinging hull's ends clear every rock
SHOAL_SLOTS = poisson(ccw(blob(SH_C, 44, 19, random.Random(17), 18, 0.12, ang=SH_ANG)), lambda p: 10.0, random.Random(8), max_n=900,
                      avoid=lambda p: any(length(sub(p, (x, y))) < r + 6.5 for x, y, r in SHOALS_ROCKS) or
                      any(seg_dist(p, NODES[a], NODES[b]) < 16.0 for a, b in EDGES))[:30]
SHOAL_BUOYS = [add(SH_C, rot((math.cos(a) * 40, math.sin(a) * 15), SH_ANG)) for a in [i * 2 * math.pi / 4 + 0.6 for i in range(4)]]

_srng = random.Random(31)
SKERRIES = [dict(poly=ccw(blob(W(*c_), rx, ry, _srng, 14, 0.24, ang=a_)), top=t_, grass=g_)
            for (c_, rx, ry, a_, t_, g_) in (((-352.0, -96.0), 20.0, 11.0, 0.5, 4.5, True), ((-300.0, 104.0), 12.0, 7.0, -0.3, 3.0, False),
                                              ((352.0, -170.0), 15.0, 9.0, 0.2, 3.2, True),
                                              ((316.0, 128.0), 16.0, 9.0, 1.2, 3.4, True), ((-300.0, -300.0), 9.0, 6.0, 0.4, 2.2, False))]
DRIFTS = {k: [] for k in CHAINS}
_eb, _es = occ('pier-ethereum', 'boat'), occ('pier-ethereum', 'skiff')
# Ethereum: about half the swing fleet rides in the lagoon in loose drifts east of the hero sightline (camera -> mouth /
# Pharos stays open water, and so does the water in front of the town); the rest lies in the outer roads behind the
# breakwater, beyond the town (masts on the horizon). Bays between the drifts keep the fairways and pier heads clear.
_in_b, _in_s = 12, 12
drift('pier-ethereum', [(_lift(102.0, -40.0), 34.0, 10.0, 0.06, 1.0), (_lift(44.0, -40.0), 26.0, 10.0, -0.06, 0.8), (_lift(-14.0, -34.0), 22.0, 14.0, 0.2, 0.6)],
      {'boat': _in_b, 'skiff': _in_s}, 11, lane_clear=6.0)
drift('pier-ethereum', [((112.0, 186.0), 66.0, 38.0, -0.08, 1.0), ((196.0, 140.0), 44.0, 30.0, -0.6, 0.9), ((238.0, 90.0), 20.0, 30.0, -0.9, 0.5),
                        ((66.0, 212.0), 26.0, 14.0, 0.1, 0.5), ((200.0, 200.0), 30.0, 18.0, -0.3, 0.45)],
      {'boat': _eb - _in_b, 'skiff': _es - _in_s}, 12, outer=True, loose=(1.0, 1.08, 1.3), lane_clear=11.0, gates=['O-1', 'O-2', 'O-3'],
      avoid=lambda p: UV(p)[0] < 74.0 and UV(p)[1] < 204.0)     # clear of the mouth: legs out past the breakwater head cut that corner
COVE_DRIFT = {     # drift centre (screen) per hamlet: in the water between the coves, clear of every T-head
    'pier-polygon': ((-338.0, -206.0), 0.8), 'pier-arbitrum': ((-230.0, -284.0), 0.6), 'pier-base': ((-108.0, -320.0), 0.0),
    'pier-solana': ((8.0, -328.0), 0.0), 'pier-bsc': ((116.0, -318.0), -0.15), 'pier-hyperliquid-l1': ((306.0, -128.0), -1.3)}
for i, (pid, c, n, hw, depth) in enumerate(COVES):
    cnt = {'boat': occ(pid, 'boat'), 'skiff': occ(pid, 'skiff')}
    N_ = sum(cnt.values())
    o, ang = COVE_DRIFT[pid]
    sz = math.sqrt(N_ * 300.0)
    blobs = [(o, sz * 0.75, sz * 0.5, ang, 1.0), (add(o, rot((sz * 0.7, sz * 0.25), ang)), sz * 0.4, sz * 0.3, ang, 0.45)]
    drift(pid, blobs, cnt, 20 + i, outer=True, gates=coast_ids, lane_clear=10.0)     # the sim's lanes keep 7.5 m + a hull off moored boats

GATE_ON = {'g-eth-wharf': 'L-s4', 'g-eth-vagen': 'L-v1', 'g-eth-marina': 'L-w2', 'g-eth-mole': 'L-s1', 'g-tron': 'L-w1'}
for pid, c, n, hw, depth in COVES:
    GATE_ON['g-' + pid[5:]] = 'C-' + pid[5:]
GATES = {}
loop_ids = [n for n, _ in LOOP]
GATE_POS = {'g-eth-marina': W(-106.0, marc(R_F2 - 13.4, -106.0)), 'g-eth-mole': W(*_lift(-32.0, -70.0)),
            'g-eth-wharf': W(*_lift(160.0, -62.0)), 'g-eth-vagen': W(100.0, -8.0), 'g-tron': W(-90.0, -16.0)}
for g, on in GATE_ON.items():
    gid = 'gate-' + g[2:]
    if g in GATE_POS:
        p = GATE_POS[g]
    elif g in PIER_ENDS:
        (e, dd) = PIER_ENDS[g][0]
        p = add(e, mul(dd, 9.0))
    else:
        p = NODES[on]
    node(gid, p)
    seq = loop_ids if on in loop_ids else coast_ids
    nxt = seq[(seq.index(on) + 1) % len(seq)]
    EDGES.append((on, gid)); EDGES.append((gid, nxt))
    GATES[g] = gid
# the marina's fairways as a one-way spur off its gate (a dead end: no through route uses it): it marks the serpentine as
# a lane, so nothing is ever parked in it (overflow rafts keep clear of lanes) and the debug overlay shows the way in
_mf = [(-78.0, marc(R_F2, -78.0)), (20.0, marc(R_F2, 20.0)), (118.0, marc(R_F2, 118.0)), TURN[1], (118.0, marc(R_F1, 118.0)),
       (10.0, marc(R_F1, 10.0)), (-92.0, marc(R_F1, -92.0))]
_prev = GATES['g-eth-marina']
for _i, _p in enumerate(_mf):
    node(f'MF-{_i + 1}', W(*_p)); EDGES.append((_prev, f'MF-{_i + 1}')); _prev = f'MF-{_i + 1}'
for pid, P in PIERS.items():
    for b in P['berths']:
        b['gate'] = GATES[b['gate']]
    gs = [b['gate'] for b in P['berths']]
    P['gate'] = NODES[Counter(gs).most_common(1)[0][0]] if gs else None
COVE_ROCKS[:] = [rk for rk in COVE_ROCKS if all(seg_dist(rk[:2], NODES[a], NODES[b]) > rk[2] + 9.0 for a, b in EDGES)]   # off the lanes
ROADS_IDS = ['O-1', 'O-2', 'O-3']
for m in MOORINGS:
    cand = (ROADS_IDS if m['pid'] == 'pier-ethereum' else coast_ids) if m['outer'] else loop_ids
    m['gate'] = min(cand, key=lambda n: length(sub(NODES[n], m['buoy'])))


# =====================================================================================================
# 5. ZONES: the Shoals off the west flank, Wreck Cove's bight, the Far Ports off the east flank, skerries
# =====================================================================================================
def mainland_coast():
    pts = []
    for k in range(0, 91):
        u = -1100 + k * 26.0
        v = 520 + 26 * math.sin(u / 160.0) + 14 * math.sin(u / 57.0 + 1.3)
        pts.append(W(u, v))
    return pts


MAINLAND_COAST = mainland_coast()
MAINLAND_POLY = MAINLAND_COAST + [W(1300, 1500), W(-1300, 1500)]
# the strand (world): a smooth line along the beach's waterline, and the zone polygon: the beach + its shallows
_strand = catmull(WRECK_STRAND, 8, closed=False)
_sn = []
for _i, _p in enumerate(_strand):
    _a = _strand[max(0, _i - 1)]; _b = _strand[min(len(_strand) - 1, _i + 1)]
    _sn.append(perp(norm(sub(_b, _a))))          # left of travel (southward) = inland (east)
WRECK_POLY = Wl([add(p_, mul(n_, -10.0)) for p_, n_ in zip(_strand, _sn)] + [add(p_, mul(n_, 52.0)) for p_, n_ in zip(_strand, _sn)][::-1])
BEACHES.append(dict(name='wreck', line=Wl(_strand), depth=46.0, kind='sand'))
WRECK_SLOTS = []                        # (centre, bow direction, class): filled once the terrain is known (section 6)

# slipway: the boatyard at the lagoon's east corner, launching west into open lagoon water
SLIP = dict(top=W(138.0, marc(R_LQ, 138.0) - 10.0), bottom=W(137.0, marc(R_LQ, 137.0) + 12.0), width=7.0)     # the boatyard at the Long Quay's open east end

FAR_C = W(452.0, 30.0)                 # east of the outer ring: the whole raft field lies beyond its lane and gate
FAR_ROWS = []
FAR_RAFTS = []
_frng = random.Random(10)
# Rafts for the long tail of minor chains. Every hull lies to the wind from its slot (the sim swings it there), so each
# raft is a pontoon line ACROSS the wind with the hulls hanging off its lee side, side by side at beam + 1.8 m; rows are
# spaced 1.1 LOA + 14 m along the wind, leaving a fairway between one row's sterns and the next pontoon, open at both ends.
_rows = []
for cls in CLASSES:
    n = REQ_FAR[cls]
    per = {'flagship': 1, 'large': 4, 'medium': 12, 'small': 22, 'boat': 24, 'skiff': 32}[cls]
    k = max(1, math.ceil(n / per)) if n else 0
    for j in range(k):
        _rows.append((cls, n // k + (1 if j < n % k else 0)))
_rw = perp(WIND_BOW)                                   # along the pontoon (across the wind)
if dot(_rw, Wd(0.0, 1.0)) < 0:
    _rw = mul(_rw, -1)
_ru = _rw
_rv = mul(WIND_BOW, -1)                                # downwind (rows stack this way)
_rows.sort(key=lambda r: -LOA[r[0]])
_span = sum(1.1 * LOA[c] + 14.0 for c, _ in _rows)
off = -_span / 2
for i, (cls, m) in enumerate(_rows):
    pitch = BEAM[cls] + 1.8
    L = m * pitch
    s0 = -L / 2 + _frng.uniform(-8, 8)
    base = add(FAR_C, mul(_rv, off))
    raft_a, raft_b = add(add(base, mul(_rw, s0 - 2.5)), mul(WIND_BOW, 1.4)), add(add(base, mul(_rw, s0 + L + 2.5)), mul(WIND_BOW, 1.4))
    FAR_RAFTS.append((raft_a, raft_b))
    FAR_ROWS.append(dict(cls=cls, line=[raft_a, raft_b], slots=[add(base, mul(_rw, s0 + (j + 0.5) * pitch)) for j in range(m)]))
    off += 1.1 * LOA[cls] + 14.0

# =====================================================================================================
# 6. LANDMARKS, TOWN (the amphitheatre round the Vagen), farms
# =====================================================================================================
import terrain as _T
_T.init(COAST, QUAY_LINES, BEACHES)


def _sat_overlap(a, b):
    for poly in (a, b):
        for i in range(len(poly)):
            e = sub(poly[(i + 1) % len(poly)], poly[i]); ax = (-e[1], e[0])
            pa = [dot(q, ax) for q in a]; pb = [dot(q, ax) for q in b]
            if max(pa) < min(pb) or max(pb) < min(pa):
                return False
    return True


def _wreck_slots(n_want=88):
    """The dead, hauled up the strand side by side like a breaker's beach: the heavy hulls at the waterline, smalls up the
    sand, boats and skiffs under the dunes; bows up the beach give or take, the odd one slewed across."""
    rng = random.Random(9)
    Lw = Wl(_strand); tot = polyline_len(Lw)
    rows = [(1.2, ['large', 'medium', 'small', 'medium', 'small', 'large', 'medium', 'small', 'medium', 'small']),
            (20.0, ['small', 'boat', 'small', 'boat', 'small', 'boat']),
            (30.5, ['boat', 'skiff', 'boat', 'skiff', 'skiff', 'boat']),
            (38.5, ['skiff', 'boat', 'skiff', 'skiff'])]
    out = []
    for d0, pat in rows:
        s_ = rng.uniform(2.0, 5.0); i = 0
        while s_ < tot - 3.0:
            cls = pat[i % len(pat)]; i += 1
            p, t = along(Lw, s_)
            n = perp(t)
            slew = rng.uniform(-0.28, 0.28) if rng.random() > 0.14 else rng.choice((-1, 1)) * rng.uniform(0.55, 0.9)
            d = rot(n, slew)
            along_n = LOA[cls] / 2 * abs(math.cos(slew)) + BEAM[cls] / 2 * abs(math.sin(slew))
            c = add(p, mul(n, d0 + along_n))
            fp = rect(c, d, LOA[cls] + 0.6, BEAM[cls] + 0.9)
            if _T.dcoast(*c) > 0.4 and not any(_sat_overlap(fp, q[4]) for q in out[-40:]):
                out.append((c, d, cls, round(_T.height(*c), 2), fp))
                s_ += BEAM[cls] * abs(math.cos(slew)) + LOA[cls] * abs(math.sin(slew)) + rng.uniform(0.9, 1.9)
            else:
                s_ += 1.0
    # trim to the dead's count, keeping the heavy waterline row whole: drop from the dune row's ends first
    while len(out) > n_want:
        dune = [k for k, o in enumerate(out) if o[2] in ('boat', 'skiff')]
        out.pop(dune[0] if len(dune) % 2 else dune[-1])
    return out


WRECK_SLOTS[:] = _wreck_slots()
print('wreck slots', len(WRECK_SLOTS), Counter(o[2] for o in WRECK_SLOTS))


def face_to(p_uv, target_uv):
    return norm(Wd(*sub(target_uv, p_uv)))


PHAROS_UV = _T.PHAROS_TOWER                             # on the headland's summit knoll, above the cliff point
LH = W(*PHAROS_UV)
PHAROS_FACE = norm(Wd(0.25, -1.0))                       # door toward the camera / the Tron quay
LANDMARKS = dict(
    pharos=dict(name='The Pharos', p=LH, z=0.0, fp=16, face=(-0.70710678, -0.70710678)),     # headingRad -pi/4 = lighthouse.glb yaw
    keepers_cottage=dict(name="Keeper's Cottage", p=W(-110.0, 80.0), z=0.0, fp=14, face=norm(Wd(0.1, -1.0))),
    oil_store=dict(name='Oil Store', p=W(-98.0, 96.0), z=0.0, fp=6, face=norm(Wd(0.1, -1.0))),
    customs_house=dict(name='Customs House', p=W(*vagen(90, R_QUAY + 27.0)), z=8.0, fp=24, face=norm(Wd(0.0, -1.0))),
    tide_board=dict(name='Tide Board', p=W(*vagen(90, R_QUAY + 7.0)), z=Z_SHORE, fp=36, face=norm(Wd(0.0, -1.0))),
    tide_gauge=dict(name='Tide Gauge', p=W(*vagen(83.9, R_QUAY - 0.5)), z=0.0, fp=3, face=norm(Wd(*sub(CT, vagen(83.9))))),
    harbourmaster=dict(name="Harbourmaster's Office", p=W(16.0, 92.0), z=Z_SHORE, fp=16, face=norm(Wd(-1.0, -0.35))),
    registry=dict(name='The Registry', p=W(*vagen(118, R_QUAY + 47.0)), z=13.5, fp=20, face=face_to(vagen(118, R_QUAY + 47.0), CT)),
    storm_mast=dict(name='Storm-signal Mast', p=STORM, z=Z_SHORE, fp=6, face=norm(Wd(-0.6, 1.0))),
    slipway=dict(name='The Slipway', p=SLIP['top'], z=Z_SHORE, fp=10, face=norm(sub(SLIP['bottom'], SLIP['top']))),
    church=dict(name="Seamen's Church", p=W(*vagen(58, R_QUAY + 47.0)), z=13.5, fp=18, face=face_to(vagen(58, R_QUAY + 47.0), CT)),
    warehouse=dict(name='Bonded Warehouse', p=W(204.0, -104.0), z=Z_SHORE, fp=22, face=norm(Wd(-1.0, -0.08))),
    breakwater=dict(name='The Breakwater', p=BW_LINE[1], z=3.0, fp=30, face=norm(Wd(0.0, 1.0))),
    shoals=dict(name='The Shoals', p=SH_C, z=0.0, fp=60, face=norm(Wd(-1.0, 0.0))),
    wreck_cove=dict(name='Wreck Cove', p=W(-272.0, -62.0), z=0.0, fp=50, face=norm(Wd(-1.0, 0.0))),
    far_ports=dict(name='Far Ports', p=FAR_C, z=0.0, fp=80, face=norm(Wd(1.0, 0.0))),
)
for _k in ('pharos', 'keepers_cottage', 'oil_store'):
    LANDMARKS[_k]['z'] = round(_T.height(*LANDMARKS[_k]['p']), 2)
# the keeper's cottage sits on its uphill corner (a stone foundation steps down the slope under it: never overhanging)
_kp, _kf = LANDMARKS['keepers_cottage']['p'], LANDMARKS['keepers_cottage']['face']
LANDMARKS['keepers_cottage']['z'] = round(max(_T.height(*q) for q in rect(_kp, perp(_kf), 11.0, 7.4)), 2)
# the Pharos' platform is levelled at the knoll's top (its retaining wall runs down the slope, never buried)
_pp = LANDMARKS['pharos']['p']
LANDMARKS['pharos']['z'] = round(max(_T.height(_pp[0] + r_ * math.cos(a_), _pp[1] + r_ * math.sin(a_))
                                     for r_ in (0.0, 4.0, 8.0) for a_ in [k_ * math.pi / 6 for k_ in range(12)]) + 0.1, 2)
for pid, c, n, hw, depth in COVES:
    I = COVE_INFO[pid]
    LANDMARKS['hamlet_' + pid[5:].replace('-', '_')] = dict(name=CHAINS[pid] + ' Cove', p=W(*add(I['back'], mul(I['n'], -8.0))), z=Z_SHORE,
                                                          fp=40, face=norm(Wd(*I['n'])), pid=pid)

LOTS = []
_RES_K = ('customs_house', 'harbourmaster', 'registry', 'church', 'warehouse', 'keepers_cottage', 'oil_store', 'pharos', 'storm_mast')
_RES = [(LANDMARKS[k]['p'], LANDMARKS[k]['fp'] / 2 + 2.5) for k in _RES_K]


def free_lot(p, w):
    if any(length(sub(p, q)) < r + w / 2 for q, r in _RES):
        return False
    return all(length(sub(p, l['c'])) > (w + l['w']) / 2 * 0.92 for l in LOTS[-40:])


def lot(c, w, d, z, face, style, **kw):
    if z is None:      # on the natural slope: sit on the lowest corner (the plinth runs into the hill)
        z = round(min(_T.height(*q) for q in rect(c, perp(face), w, d)), 2)
    LOTS.append(dict(c=c, w=w - 0.12, d=d, z=z, face=face, style=style, **kw))


TOWN_ROWS = []       # (r_centre, z, th0, th1, depth, style)  - the amphitheatre: front row on the quay, three terraces up
RINGS = [            # radial bands (screen metres from CT): (r0, r1, z) - terrace pads; walls at each r0
    (R_QUAY, R_QUAY + 18.0, Z_SHORE),
    (R_QUAY + 19.0, R_QUAY + 34.0, 8.0),
    (R_QUAY + 35.0, R_QUAY + 50.0, 13.5),
    (R_QUAY + 51.0, R_QUAY + 66.0, 19.0),
]
TOWN_TH = [(168.0, 12.0), (160.0, 20.0), (150.0, 30.0), (140.0, 40.0)]   # angular extent per band (screen degrees)
STAIR_TH = [(124.0, 1), (68.0, 1), (148.0, 2), (102.0, 2), (52.0, 2), (112.0, 3), (66.0, 3)]   # (theta, band below the stair's top)
SQUARES = [(90.0, 0, 50.0), (118.0, 2, 24.0), (58.0, 2, 22.0)]     # (theta, band, width in metres): Customs square, Registry, church
trng = random.Random(42)


def ring_row(band, rc, depth, style, rng, block=(3, 6), alley=(2.0, 3.6), p_gap=0.22, gap=(6.0, 12.0), w_rng=(6.8, 9.4),
             jit_r=1.2, jit_rot=4.0, cluster_rot=7.0, shop=False):
    """Houses along an arc, clustered: each block of 3-6 shares a small yaw twist (Bryggen / Alesund), alleys between,
    the odd garden gap; stairs and squares leave openings."""
    th0, th1 = TOWN_TH[band]
    z = RINGS[band][2]
    s = th0
    while s > th1:
        n = rng.randint(*block)
        twist = rng.uniform(-cluster_rot, cluster_rot)
        rr = rc + rng.uniform(-jit_r, jit_r)
        for i in range(n):
            w = rng.uniform(*w_rng)
            dth = math.degrees(w / rr)
            if s - dth < th1:
                break
            th = s - dth / 2
            blocked = any(abs(th - st) < math.degrees(5.5 / rr) for st, b in STAIR_TH if b == band) or \
                any(abs(th - sq) < math.degrees(wq / 2 / rr) for sq, b, wq in SQUARES if b == band)
            if not blocked:
                p_uv = vagen(th, rr + rng.uniform(-0.4, 0.4))
                fdir = rot(norm(sub(CT, p_uv)), math.radians(twist + rng.uniform(-jit_rot, jit_rot)))
                p = W(*p_uv)
                if free_lot(p, w):
                    lot(p, w, depth * rng.uniform(0.9, 1.08), z, norm(Wd(*fdir)), style, shop=shop and rng.random() < 0.75, band=band)
            s -= dth + rng.uniform(0.0, 0.15)
        s -= math.degrees(rng.uniform(*gap) / rr) if rng.random() < p_gap else math.degrees(rng.uniform(*alley) / rr)


# front row on the quay apron (shops + awnings), three terraces up the amphitheatre, cottages on the top band
ring_row(0, R_QUAY + 13.0, 9.6, 'terrace', trng, p_gap=0.12, gap=(5.0, 9.0), shop=True)
ring_row(1, R_QUAY + 28.0, 9.0, 'terrace', trng, p_gap=0.3, gap=(8.0, 14.0))
ring_row(2, R_QUAY + 44.0, 8.8, 'terrace', trng, p_gap=0.4, gap=(9.0, 16.0))
ring_row(3, R_QUAY + 60.0, 8.4, 'cottage', trng, block=(1, 3), alley=(5.0, 9.0), p_gap=0.5, gap=(10.0, 18.0), w_rng=(7.0, 9.0), jit_r=2.0)

# the warehouse row (Bryggen): tall gable-fronted stores along the lagoon's east shore, gables to the water
WH_ROW = [((172.0, -40.0), (-0.86, -0.5)), ((184.0, -52.0), (-0.92, -0.38)), ((190.0, -126.0), (-0.95, 0.1)), ((186.0, -146.0), (-0.9, 0.35))]
for (p_uv, f_uv) in WH_ROW:
    p_uv = add(p_uv, mul(norm(f_uv), -9.0))
    lot(W(*p_uv), 9.5, 15.0, Z_SHORE, norm(Wd(*f_uv)), 'warehouse')
# the battery strip: a short terrace climbing toward the harbourmaster, fronts to the channel
for k, (p_uv, f_uv) in enumerate((((26.0, 52.0), (-0.9, -0.35)), ((22.0, 64.0), (-0.92, -0.3)), ((18.0, 76.0), (-0.95, -0.25)),
                                   ((34.0, 74.0), (-0.6, -0.8)), ((40.0, 86.0), (-0.5, -0.86)))):
    lot(W(*p_uv), trng.uniform(7.0, 8.6), 9.0, Z_SHORE if k < 3 else 8.0, norm(Wd(*f_uv)), 'terrace', band=0 if k < 3 else 1)
# cove hamlets: sheds round the back quay facing out of the cove, a gable-ended net loft by the pier root
for pid, c, n, hw, depth in COVES:
    I = COVE_INFO[pid]
    t_ = I['t']; nn = I['n']
    xs = [-hw + 7.0, hw - 7.0] if hw < 30 else [-hw + 7.0, -hw + 15.0, hw - 15.0, hw - 7.0]
    bh = COVE_BOATHOUSE[pid]
    for x in xs:
        if bh and any(abs(x - sg * (hw - 15.0)) < 0.1 or (hw < 30 and abs(x - sg * (hw - 7.0)) < 0.1) for sg in [(-1 if sd == 'w' else 1) for sd in bh]):
            continue                 # a boathouse stands on that side instead
        p_uv = add(add(I['back'], mul(t_, x)), mul(nn, -(12.0 + trng.uniform(-1.0, 1.0))))
        lot(W(*p_uv), trng.uniform(6.4, 8.0), 8.0, None if COVE_BEACH[pid] else Z_SHORE, norm(Wd(*nn)), 'hamlet', pid=pid)
    for sd in bh:                    # the boathouse: gable to the water at the head of the beach, its doors on the pebbles
        sg = -1 if sd == 'w' else 1
        x = sg * (min(hw - 14.0, hw * 0.55))
        p_uv = add(add(I['back'], mul(t_, x)), mul(nn, -6.2))
        lot(W(*p_uv), 6.6, 9.6, None, norm(Wd(*rot(nn, sg * 0.08))), 'boathouse', pid=pid)
    side = 1 if trng.random() < 0.5 else -1
    p_uv = add(add(I['back'], mul(t_, side * (hw + 6.0))), mul(nn, 2.0))
    lot(W(*p_uv), 7.0, 9.5, Z_SHORE, norm(Wd(*rot(nn, -side * 0.5))), 'loft', pid=pid)
    # two cottages up the slope behind (a hamlet, not a shed row)
    for k in range(2):
        p_uv = add(add(I['back'], mul(t_, trng.uniform(-hw * 0.7, hw * 0.7))), mul(nn, -(26.0 + k * 11.0)))
        lot(W(*p_uv), trng.uniform(7.0, 8.4), 7.4, None, norm(Wd(*rot(nn, trng.uniform(-0.3, 0.3)))), 'cottage', pid=pid)
# farmsteads on the west meadows: a farmhouse + a barn round a yard, each a slightly different heading
FARMS = [((-206.0, -122.0), 0.25), ((-178.0, -194.0), -0.2), ((196.0, -190.0), 0.15)]
for (p_uv, a) in FARMS:
    f = rot((0.0, -1.0), a)
    lot(W(*p_uv), 10.0, 7.2, None, norm(Wd(*f)), 'farmhouse')
    q = add(p_uv, rot((15.0, 7.0), a))
    lot(W(*q), 14.0, 9.0, None, norm(Wd(*rot(f, 1.57))), 'barn')
WINDMILL = W(-226.0, -168.0)
print('buildings', len(LOTS), '+ landmarks')

# =====================================================================================================
# 7. CAMERA PRESETS (runtime convention: yaw 45 puts the camera at +x, +z (glTF) of the target)
# =====================================================================================================
def preset(target_uv, dist, ty=0.0, pitch=35.0):
    tx, tyb = W(*target_uv)
    return dict(target=[round(tx, 2), round(ty, 2), round(-tyb, 2)], distance=round(dist, 1), fovDeg=25.0, pitchDeg=pitch, yawDeg=45.0)


PRESETS = {
    # heart: the Pharos, the mouth (with the Shoals outside it) and the town amphitheatre in one triangle, the lagoon's
    # drifts and the Vagen's big ships below; overview: the whole bay, the Pharos still a landmark, the Far Ports' rafts at the edge
    'heart': preset((-4.0, 30.0), 420.0, 4.0, pitch=30.0),
    'overview': preset((32.0, -8.0), 630.0, 0.0, pitch=30.0),
}

# =====================================================================================================
# VALIDATION
# =====================================================================================================
def counts_by(pid):
    c = Counter(b['cls'] for b in PIERS[pid]['berths'])
    for m in MOORINGS:
        if m['pid'] == pid:
            c[m['cls']] += 1
    return c


def check_capacity():
    rows = []
    ok = True
    for pid in CHAINS:
        have = counts_by(pid)
        for k in CLASSES:
            r = REQ[pid][k]
            h = have.get(k, 0)
            if h < r:
                ok = False
            rows.append((pid, k, OCC['occupancy'][pid][k]['expected'], OCC['occupancy'][pid][k]['p95'], r, h))
    far = Counter()
    for row in FAR_ROWS:
        far[row['cls']] += len(row['slots'])
    for k in CLASSES:
        rows.append(('far', k, OCC['occupancy']['far'][k]['expected'], OCC['occupancy']['far'][k]['p95'], REQ_FAR[k], far.get(k, 0)))
        ok = ok and far.get(k, 0) >= REQ_FAR[k]
    return ok, rows


# ------------------------------------------------------------------ raster obstacle model (0.5 m): land + every structure
class Raster:
    def __init__(self, S=0.5, pad=60.0):
        from PIL import Image, ImageDraw
        import numpy as np
        from scipy import ndimage
        xs = [p[0] for p in COAST]; ys = [p[1] for p in COAST]
        self.S = S; self.X0 = min(xs) - pad - 120; self.Y1 = max(ys) + pad + 120
        X1 = max(xs) + pad + 120; Y0 = min(ys) - pad - 120
        self.W, self.H = int((X1 - self.X0) / S), int((self.Y1 - Y0) / S)
        to = self.to
        land = Image.new('L', (self.W, self.H), 0); dl = ImageDraw.Draw(land)
        dl.polygon([to(p) for p in COAST], fill=1)
        for sk in SKERRIES:
            dl.polygon([to(p) for p in sk['poly']], fill=1)
        st = Image.new('L', (self.W, self.H), 0); ds = ImageDraw.Draw(st)
        fg = Image.new('L', (self.W, self.H), 0); dfg = ImageDraw.Draw(fg)
        for q, kind in structure_polys(kinds=True):
            (dfg if kind == 'finger' else ds).polygon([to(p) for p in q], fill=1)
        for (x, y, r) in SHOALS_ROCKS + COVE_ROCKS + [(BW_LINE[-1][0], BW_LINE[-1][1], 4.4)]:
            cx, cy = to((x, y)); ds.ellipse((cx - r / S, cy - r / S, cx + r / S, cy + r / S), fill=1)
        self.land = np.array(land) > 0
        self.fg = np.array(fg) > 0
        self.st = (np.array(st) > 0) | self.fg
        self.st_nf = np.array(st) > 0
        solid = self.land | self.st
        self.clear = ndimage.distance_transform_edt(~solid) * S       # metres to the nearest solid
        self.np = np

    def to(self, p):
        return ((p[0] - self.X0) / self.S, (self.Y1 - p[1]) / self.S)

    def clr(self, p):
        x, y = self.to(p)
        i, j = int(y), int(x)
        if not (0 <= i < self.H and 0 <= j < self.W):
            return 1e3
        return float(self.clear[i, j])


def check_overlaps(R):
    """Hull footprints against each other, the land and the structures (0.5 m raster)."""
    from PIL import Image, ImageDraw
    np = R.np
    acc = np.zeros((R.H, R.W), np.uint16)
    crops = []
    for poly, bid in FOOT:
        im = Image.new('L', (R.W, R.H), 0)
        xs = [R.to(p) for p in poly]
        c0 = max(0, int(min(x for x, _ in xs)) - 2); c1 = min(R.W, int(max(x for x, _ in xs)) + 3)
        r0 = max(0, int(min(y for _, y in xs)) - 2); r1 = min(R.H, int(max(y for _, y in xs)) + 3)
        sub_ = Image.new('L', (c1 - c0, r1 - r0), 0)
        ImageDraw.Draw(sub_).polygon([(x - c0, y - r0) for x, y in xs], fill=1)
        m = np.array(sub_, bool)
        acc[r0:r1, c0:c1] += m
        crops.append((m, r0, c0, bid))
    solid = R.land | R.st
    solid_nf = R.land | R.st_nf
    mode_of = {b['id']: b['mode'] for P in PIERS.values() for b in P['berths']}
    bad = []
    S2 = R.S * R.S
    for m, r0, c0, bid in crops:
        sol = solid_nf if mode_of.get(bid) == 'finger' else solid
        sa = acc[r0:r0 + m.shape[0], c0:c0 + m.shape[1]]; sl = sol[r0:r0 + m.shape[0], c0:c0 + m.shape[1]]
        a1 = (m & (sa > 1)).sum() * S2; a2 = (m & sl).sum() * S2
        if a1 > 0.8 or a2 > 0.5:
            bad.append((bid, round(float(a1), 1), round(float(a2), 1)))
    return float((acc > 1).sum() * S2), bad


def check_paths(R):
    """Every berth approach (gate node -> approach points -> berth) and every lane edge must stay in clear water.
    Clearance: lanes >= 7 m, approaches >= 2.5 m until the last leg (into the slot), the slot leg >= 0.4 m.
    Returns a list of (what, worst clearance, where)."""
    bad = []

    def walk(pts, need, tail_need=None, tail_from=None):
        worst = (1e9, None)
        for i, (a, b) in enumerate(zip(pts, pts[1:])):
            L = length(sub(b, a)); n = max(2, int(L / 1.0))
            nd = tail_need if (tail_from is not None and i >= tail_from) else need
            for k in range(n + 1):
                p = lerp(a, b, k / n)
                c = R.clr(p)
                if c - nd < worst[0]:
                    worst = (c - nd, p)
        return worst
    for a, b in EDGES:
        w = walk([NODES[a], NODES[b]], 5.0)
        if w[0] < 0:
            bad.append((f'lane {a}->{b}', round(w[0], 1), [round(v) for v in UV(w[1])]))
    for pid, P in PIERS.items():
        for bt in P['berths']:
            pts = [NODES[bt['gate']]] + list(bt['approach'])
            tail = len(pts) - 2          # the last segment slides into the slot
            w = walk(pts[:-1], 2.0)
            w2 = walk(pts[-2:], 0.3)
            if w[0] < 0:
                bad.append((f"approach {bt['id']}", round(w[0], 1), [round(v) for v in UV(w[1])]))
            elif w2[0] < 0:
                bad.append((f"slot {bt['id']}", round(w2[0], 1), [round(v) for v in UV(w2[1])]))
    for m in MOORINGS:
        ap = add(m['buoy'], mul(m['d'], -(LOA[m['cls']] * 2.2 + 10)))
        w = walk([NODES[m['gate']], ap, m['center']], 1.0)
        if w[0] < 0:
            bad.append((f"mooring {m['id']}", round(w[0], 1), [round(v) for v in UV(w[1])]))
    return bad


# ------------------------------------------------------------------ camera projection (runtime-identical)
def cam_basis(pr):
    tx, ty_, tz = pr['target']; T = (tx, -tz, ty_)
    D = pr['distance']; yaw = math.radians(pr['yawDeg']); pit = math.radians(pr['pitchDeg'])
    cp = math.cos(pit)
    off = (math.sin(yaw) * cp, -math.cos(yaw) * cp, math.sin(pit))
    cam = tuple(T[i] + off[i] * D for i in range(3))
    f = tuple(-o for o in off)
    r = (f[1], -f[0], 0.0); rl = math.hypot(r[0], r[1]); r = (r[0] / rl, r[1] / rl, 0.0)
    u = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])
    return cam, f, r, u


def sky_radius(pr, land_pts):
    """Mirror of SkySystem: the card radius (horizontal, from the camera) - 20 % band unless land pushes it out."""
    cam, f, r, u = cam_basis(pr)
    vfov = math.radians(pr['fovDeg']); pitch = math.radians(pr['pitchDeg'])
    R0 = cam[2] / math.tan(max(0.05, pitch - vfov / 2 + 0.2 * vfov))
    halfH = math.atan(math.tan(vfov / 2) * 1.6); span = halfH + 0.25
    fl = math.hypot(f[0], f[1])
    far = 0.0
    for p in land_pts:
        dx, dy = p[0] - cam[0], p[1] - cam[1]; d = math.hypot(dx, dy)
        if (dx * f[0] + dy * f[1]) / (d * fl) < math.cos(span):
            continue
        far = max(far, d)
    R = max(R0, far + 14) if far > 0 else R0
    depr = math.atan(cam[2] / R)
    band = (depr - (pitch - vfov / 2)) / vfov
    return R, band


def project(pr, p, W_=1600, H_=1000):
    cam, f, r, u = cam_basis(pr)
    d = tuple(p[i] - cam[i] for i in range(3))
    z = sum(d[i] * f[i] for i in range(3))
    if z <= 1e-3:
        return None
    th = math.tan(math.radians(pr['fovDeg']) / 2)
    x = sum(d[i] * r[i] for i in range(3)) / z / th / (W_ / H_)
    y = sum(d[i] * u[i] for i in range(3)) / z / th
    return ((x + 1) * W_ / 2, (1 - y) * H_ / 2)


def hull_px(pr, center, d, cls):
    a = project(pr, (center[0] + d[0] * LOA[cls] / 2, center[1] + d[1] * LOA[cls] / 2, 1.0))
    b = project(pr, (center[0] - d[0] * LOA[cls] / 2, center[1] - d[1] * LOA[cls] / 2, 1.0))
    if not a or not b:
        return None, None
    mid = lerp(a, b, 0.5)
    vis = 0 <= mid[0] <= 1600 and 0 <= mid[1] <= 1000
    return length(sub(a, b)), vis


def frame_report():
    rep = {}
    landpts = COAST + BW_LINE
    for name, pr in PRESETS.items():
        per = defaultdict(list)
        for P in PIERS.values():
            for b in P['berths']:
                px, vis = hull_px(pr, b['pos'], b['d'], b['cls'])
                if vis:
                    per[b['cls']].append(px)
        for m in MOORINGS:
            px, vis = hull_px(pr, m['center'], m['d'], m['cls'])
            if vis:
                per[m['cls']].append(px)
        rep[name] = {k: dict(n=len(v), min=round(min(v)), med=round(sorted(v)[len(v) // 2])) for k, v in per.items() if v}
        lm = {}
        for k in ('pharos', 'customs_house', 'storm_mast', 'church', 'registry', 'harbourmaster', 'shoals', 'wreck_cove', 'far_ports'):
            q = project(pr, (*LANDMARKS[k]['p'], LANDMARKS[k]['z']))
            lm[k] = [round(q[0]), round(q[1])] if q and 0 <= q[0] <= 1600 and 0 <= q[1] <= 1000 else 'out'
        q = project(pr, (*LANDMARKS['pharos']['p'], LANDMARKS['pharos']['z'] + 38.0))
        lm['pharos_lantern'] = [round(q[0]), round(q[1])] if q else None
        rep[name]['landmarks'] = lm
        R, band = sky_radius(pr, landpts)
        rep[name]['sky'] = dict(R=round(R), band=round(band, 3))
    return rep


def land_fill(pr, step=8, harbour=False):
    """Fraction of the 1600x1000 frame whose view ray hits island land (terrain height) before the sea or the sky card;
    harbour=True also counts piers, decks and hull footprints (what the frame shows that is not open water)."""
    cam, f, r, u = cam_basis(pr)
    th = math.tan(math.radians(pr['fovDeg']) / 2)
    R, band = sky_radius(pr, COAST + BW_LINE)
    hit = tot = 0
    for py in range(step // 2, 1000, step):
        for px in range(step // 2, 1600, step):
            x = (px / 800 - 1) * th * 1.6; y = (1 - py / 500) * th
            d = tuple(f[i] + r[i] * x + u[i] * y for i in range(3))
            tot += 1
            if d[2] >= 0:
                continue
            t = (Z_SHORE - cam[2]) / d[2]
            q = (cam[0] + d[0] * t, cam[1] + d[1] * t)
            if math.hypot(q[0] - cam[0], q[1] - cam[1]) > R:
                continue
            h = pip(q[0], q[1], COAST)
            if not h and harbour:
                h = any(pip(q[0], q[1], poly) for poly in _HPOLYS if abs(q[0] - poly[0][0]) < 60 and abs(q[1] - poly[0][1]) < 60)
            hit += h
    return hit / tot


_HPOLYS = []


def dijkstra(src):
    adj = defaultdict(list)
    for a, b in EDGES:
        adj[a].append((b, length(sub(NODES[a], NODES[b]))))
    dist = {src: 0.0}; pq = [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, 1e18):
            continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd; heapq.heappush(pq, (nd, v))
    return dist


def leg_lengths():
    gate_of = {pid: Counter(b['gate'] for b in P['berths']).most_common(1)[0][0] for pid, P in PIERS.items() if P['berths']}
    gate_of['far'] = 'FP-gate'
    legs = {}
    for a, ga in gate_of.items():
        D = dijkstra(ga)
        for b, gb in gate_of.items():
            if a != b and gb in D:
                legs[f'{a}->{b}'] = round(D[gb] + 60.0, 1)     # + berth approach / departure
    return legs


# =====================================================================================================
# PLAN RENDER (screen-aligned: U right, V up)
# =====================================================================================================
def frame_footprint(pr, aspect=1.6):
    cam, f, r, u = cam_basis(pr)
    th = math.tan(math.radians(pr['fovDeg']) / 2)
    out = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        d = tuple(f[i] + r[i] * sx * th * aspect + u[i] * sy * th for i in range(3))
        t = min(-cam[2] / d[2] if d[2] < -1e-4 else 2500.0, 2500.0)
        out.append((cam[0] + d[0] * t, cam[1] + d[1] * t))
    return out


def render_plan(path, S=0.5):
    from PIL import Image, ImageDraw
    U0, U1, V0, V1 = -440, 440, -420, 230
    Wp, Hp = int((U1 - U0) / S), int((V1 - V0) / S)
    im = Image.new('RGB', (Wp, Hp), (24, 70, 92)); d = ImageDraw.Draw(im)

    def to(p):
        u, v = UV(p)
        return ((u - U0) / S, (V1 - v) / S)
    # terrain shading (height) on a coarse grid
    import terrain as T_
    step = 4.0
    v = V0
    while v < V1:
        u = U0
        while u < U1:
            p = W(u, v)
            if pip(p[0], p[1], COAST):
                z = T_.height(*p)
                col = (int(80 + z * 4.5), int(118 + z * 3.2), int(64 + z * 2.0))
                x0, y0 = (u - U0) / S, (V1 - v) / S
                d.rectangle((x0, y0 - step / S, x0 + step / S, y0), fill=col)
            u += step
        v += step
    for sk in SKERRIES:
        d.polygon([to(p) for p in sk['poly']], fill=(130, 130, 110))
    d.polygon([to(p) for p in SHOALS_POLY], outline=(200, 200, 120))
    for x, y, r in SHOALS_ROCKS:
        cx, cy = to((x, y)); d.ellipse((cx - r / S, cy - r / S, cx + r / S, cy + r / S), fill=(110, 110, 110))
    d.polygon([to(p) for p in WRECK_POLY], outline=(220, 200, 150))
    for _c, _d, _cls, _z, _fp in WRECK_SLOTS:
        d.polygon([to(p) for p in rect(_c, _d, LOA[_cls], BEAM[_cls])], fill=(120, 116, 110), outline=(60, 60, 60))
    for L in QUAY_LINES.values():
        d.line([to(p) for p in L], fill=(230, 220, 200), width=3)
    for s in STRUCT:
        if s['kind'] in ('pier', 'thead', 'finger'):
            d.line([to(s['a']), to(s['b'])], fill=(170, 140, 100), width=max(1, int(s['width'] / S)))
    d.line([to(p) for p in BW_LINE], fill=(160, 160, 150), width=int(BW_W / S))
    for mp in mole_polys():
        d.polygon([to(p) for p in mp], fill=(196, 188, 170))
    for a, b in FAR_RAFTS:
        d.line([to(a), to(b)], fill=(170, 140, 100), width=3)
    col = dict(flagship=(255, 80, 80), large=(255, 160, 60), medium=(240, 230, 90), small=(120, 230, 120), boat=(120, 200, 255), skiff=(220, 160, 255))
    for poly, bid in FOOT:
        cls = bid.split('/')[1].replace('m-', '')
        d.polygon([to(p) for p in poly], fill=col.get(cls, (255, 255, 255)))
    for row_ in FAR_ROWS:
        for c in row_['slots']:
            d.polygon([to(p) for p in rect(add(c, mul(_rv, 0.6 * LOA[row_['cls']])), _rv, LOA[row_['cls']], BEAM[row_['cls']])], fill=col[row_['cls']])
    for lot_ in LOTS:
        q = rect(lot_['c'], perp(lot_['face']), lot_['w'], lot_['d'])
        d.polygon([to(p) for p in q], fill=(200, 110, 90) if lot_['style'] not in ('warehouse', 'barn') else (150, 90, 70), outline=(60, 40, 30))
        fp = add(lot_['c'], mul(lot_['face'], lot_['d'] / 2))
        d.line([to(lot_['c']), to(fp)], fill=(255, 255, 255), width=1)
    for k, L in LANDMARKS.items():
        cx, cy = to(L['p']); r = 4
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255)); d.text((cx + 5, cy - 5), k, fill=(255, 255, 255))
    for a, b in EDGES:
        pa, pb = to(NODES[a]), to(NODES[b])
        d.line([pa, pb], fill=(255, 255, 255), width=1)
        m = lerp(pa, pb, 0.6); dd = norm(sub(pb, pa)); n = perp(dd)
        d.polygon([add(m, mul(dd, 5)), add(m, add(mul(dd, -3), mul(n, 3))), add(m, add(mul(dd, -3), mul(n, -3)))], fill=(255, 255, 255))
    for name, pr in PRESETS.items():
        fp = frame_footprint(pr)
        colr = (255, 255, 0) if name == 'heart' else (255, 0, 255)
        d.line([to(p) for p in fp + fp[:1]], fill=colr, width=2)
        cam, f, r, u = cam_basis(pr)
        R, band = sky_radius(pr, COAST + BW_LINE)
        az0 = math.atan2(f[0], f[1])
        arc = [(cam[0] + R * math.sin(az0 + a), cam[1] + R * math.cos(az0 + a)) for a in [math.radians(x) for x in range(-34, 35, 2)]]
        d.line([to(p) for p in arc], fill=colr, width=1)
    im.save(path)


# =====================================================================================================
# OUTPUT
# =====================================================================================================
def r2(p):
    return [round(p[0], 2), round(p[1], 2)]


def gl2(p):          # Blender (x, y) -> glTF ground (x, z)
    return [round(p[0], 2), round(-p[1], 2)]


def gl3(p, y=0.0):
    return [round(p[0], 2), round(y, 2), round(-p[1], 2)]


def lights_list():
    out = []
    for x, y, z, kind, col in LAMPS:
        out.append(dict(kind='pierhead' if kind == 'pierhead' else 'lamp', p=(x, y), z=z + 3.2, color=col or '#FFB15C'))
    for hl in HARBOUR_LIGHTS:
        out.append(dict(kind='harbourlight', p=hl[0], z=hl[2] if len(hl) > 2 else 9.6, color='#FF4A36' if hl[1] == 'red' else '#3CFF8A'))
    return out


BAY_UV = [(0.0, 112.0), (2.0, 94.0), (12.0, 60.0), (38.0, 12.0)] + VAGEN_ARC[::4] + \
         [(182.0, -50.0), (192.0, -116.0), (186.0, -150.0), (164.0, _LQE + 11.0)] + LONG_QUAY[::3] + [(-124.0, _LQW + 4.0), (-128.0, -120.0), (-146.0, -106.0), (-160.0, -40.0), (-132.0, 22.0)] + \
         TRON_QUAY + [(-58.0, 98.0), (-52.0, 104.0)]


def write_compose(extra_lights):
    quays = [dict(kind=k.split('-')[0], name=k, pid=(k[5:] if k.startswith('cove-') else None), line=[r2(p) for p in L])
             for k, L in QUAY_LINES.items()]
    berths = []
    for pid, P in PIERS.items():
        for b in P['berths']:
            berths.append(dict(id=b['id'], pid=pid, cls=b['cls'], pos=r2(b['pos']), d=r2(b['d']), mode=b['mode']))
    coves = [dict(pid=pid, c=r2(W(*COVE_INFO[pid]['c'])), n=r2(Wd(*COVE_INFO[pid]['n'])), t=r2(Wd(*COVE_INFO[pid]['t'])),
                  back=r2(W(*COVE_INFO[pid]['back'])), qa=r2(W(*COVE_INFO[pid]['qa'])), qb=r2(W(*COVE_INFO[pid]['qb'])),
                  hw=COVE_INFO[pid]['hw'], depth=COVE_INFO[pid]['depth']) for pid, *_ in COVES]
    data = dict(
        version=3, coast=[r2(p) for p in COAST], levels=[], quays=quays, struct=STRUCT, berths=berths,
        moorings=[dict(id=m['id'], pid=m['pid'], cls=m['cls'], buoy=r2(m['buoy']), center=r2(m['center']), d=r2(m['d'])) for m in MOORINGS],
        lamps=LAMPS, bollards=BOLLARDS, lots=LOTS, landmarks=LANDMARKS, coves=coves, cove_character=COVE_CHARACTER,
        pennant=PENNANT, chains=CHAINS, harbour_lights=HARBOUR_LIGHTS, storm=STORM, bw_line=BW_LINE, bw_width=BW_W,
        shoals=dict(poly=SHOALS_POLY, rocks=SHOALS_ROCKS, slots=SHOAL_SLOTS, buoys=SHOAL_BUOYS), skerries=SKERRIES, cove_rocks=COVE_ROCKS,
        cove_beach=COVE_BEACH, cove_boathouse=COVE_BOATHOUSE,
        mainland=dict(coast=MAINLAND_COAST, poly=MAINLAND_POLY),
        wreck=dict(poly=WRECK_POLY, slots=[[r2(c), round(math.atan2(d[1], d[0]), 4), cls, z] for c, d, cls, z, _f in WRECK_SLOTS],
                   strand=Wl(_strand)), beaches=BEACHES, slip=SLIP, far=dict(rafts=FAR_RAFTS, rows=FAR_ROWS, c=FAR_C, row_dir=_ru, bow=WIND_BOW, swing_k=0.6),
        presets=PRESETS, consts=dict(Z_SHORE=Z_SHORE, DECK=DECK, VOFF=VOFF), pier_frames=PIER_FRAMES, lanes=dict(nodes=NODES, edges=EDGES),
        moles=MOLES, marina=dict(mc=W(*MC), rows=MARINA_ROWS),
        loop=[n for n, _ in LOOP], vagen_arc=Wl(VAGEN_ARC), long_quay=Wl(LONG_QUAY), tron_quay=Wl(TRON_QUAY), wharf=Wl(EAST_WHARF),
        town=dict(ct=r2(W(*CT)), ct_uv=CT, r_quay=R_QUAY, rings=RINGS, th=TOWN_TH, stairs=STAIR_TH, squares=SQUARES),
        bay=[r2(W(*p)) for p in BAY_UV], windmill=r2(WINDMILL), farms=[r2(W(*p)) for p, a in FARMS],
        hull=dict(loa=LOA, beam=BEAM, sprit=SPRIT), wind_bow=WIND_BOW, extra_lights=extra_lights, sea_bounds=sea_bounds(),
    )
    json.dump(data, open(os.path.join(OUTD, 'compose.json'), 'w'))


def pier_label_at(pid):
    """Chain labels sit on the chain's own stonework (the quay the piers root on), never out in the water."""
    if pid == 'pier-ethereum':
        return along(Wl(LONG_QUAY), polyline_len(Wl(LONG_QUAY)) * 0.45)[0]
    q = [sg for sg in PIERS[pid]['segments'] if sg['kind'] == 'quay']
    if q:
        a, b = q[0]['a'], q[0]['b']
        return along(TQ, polyline_len(TQ) * 0.5)[0] if pid == 'pier-tron' else lerp(a, b, 0.5)
    return PIERS[pid]['segments'][0]['a']


def write_layout(window_lights, sea_bounds):
    piers = []
    for pid, P in PIERS.items():
        piers.append(dict(
            id=pid, chain=P['chain'], kind=P['kind'], gate=gl2(P['gate']) if P['gate'] else None,
            pennant=PENNANT[pid],
            segments=[dict(kind=sg['kind'], a=gl2(sg['a']), b=gl2(sg['b']), width=sg['width']) for sg in P['segments']],
            berths=[dict(id=b['id'], **{'class': b['cls']}, position=gl3(b['pos']), headingRad=round(heading_rad(b['d']), 4),
                         gate=b['gate'], approach=[gl2(q) for q in b['approach']], mode=b['mode']) for b in P['berths']],
            berthCounts=dict(Counter(b['cls'] for b in P['berths'])),
        ))
    moorings = [dict(id=m['id'], chain=m['chain'], **{'class': m['cls']}, position=gl3(m['buoy']), swingRadius=round(m['swing'], 2),
                     headingRad=round(heading_rad(m['d']), 4), boatCenter=gl3(m['center']), gate=m['gate'],
                     approach=[gl2(add(m['buoy'], mul(m['d'], -(LOA[m['cls']] * 2.2 + 10)))), gl2(m['center'])])
                for m in MOORINGS]
    lanes = dict(oneWay=True, nodes=[dict(id=k, position=gl3(p)) for k, p in NODES.items()],
                 edges=[{'from': a, 'to': b} for a, b in EDGES])
    landmarks = [dict(id=k.replace('_', '-'), name=L['name'], position=gl3(L['p'], L['z']), footprint=L['fp'],
                      headingRad=round(heading_rad(L['face']), 4), **({'chain': CHAINS[L['pid']]} if 'pid' in L else {}))
                 for k, L in LANDMARKS.items()]
    zones = dict(
        shoals=dict(polygon=[gl2(p) for p in SHOALS_POLY], slots=[gl3(p) for p in SHOAL_SLOTS], buoys=[gl3(p) for p in SHOAL_BUOYS],
                    rocks=[[round(x, 2), round(-y, 2), round(r, 2)] for x, y, r in SHOALS_ROCKS], gate='SH-gate'),
        wreckCove=dict(polygon=[gl2(p) for p in WRECK_POLY],
                       slots=[dict(id=f'wreck-{i + 1:02d}', **{'class': cls}, position=gl3(c, z), headingRad=round(heading_rad(d), 4))
                              for i, (c, d, cls, z, _f) in enumerate(WRECK_SLOTS)]),
        slipway=dict(polygon=[gl2(p) for p in rect(lerp(SLIP['top'], SLIP['bottom'], 0.5), norm(sub(SLIP['bottom'], SLIP['top'])),
                                                    length(sub(SLIP['top'], SLIP['bottom'])), SLIP['width'])],
                     slots=[gl3(lerp(SLIP['top'], SLIP['bottom'], 0.25), Z_SHORE)],
                     launchPath=[gl2(SLIP['top']), gl2(SLIP['bottom']), gl2(W(140.0, marc(R_LQ, 140.0) + 28.0)), gl2(W(156.0, marc(R_LQ, 156.0) + 50.0))]),
        farPorts=dict(polygon=[gl2(p) for p in blob(add(FAR_C, mul(_rv, 6.0)), max(polyline_len(r_['line']) for r_ in FAR_ROWS) / 2 + 14, _span / 2 + 16,
                                                     random.Random(3), 12, 0.05, ang=math.atan2(_ru[1], _ru[0]))],
                      rows=[dict(cls=r_['cls'], line=[gl2(p) for p in r_['line']], slots=[gl3(p) for p in r_['slots']]) for r_ in FAR_ROWS],
                      gate='FP-gate'),
        hamlets={pid: dict(name=CHAINS[pid] + ' Cove', character=COVE_CHARACTER[pid], centre=gl2(W(*COVE_INFO[pid]['c'])),
                           halfWidth=COVE_INFO[pid]['hw']) for pid, *_ in COVES},
    )
    labels = [dict(id=k.replace('_', '-'), text=L['name'], anchor=gl3(L['p'], L['z'] + (40 if k == 'pharos' else 14)), kind='landmark')
              for k, L in LANDMARKS.items() if k not in ('tide_board', 'tide_gauge')]
    labels += [dict(id='label-' + pid, text=CHAINS[pid], anchor=gl3(pier_label_at(pid), 6.0), kind='pier') for pid, P in PIERS.items() if P['gate']]
    xs = [p[0] for p in COAST]; ys = [p[1] for p in COAST]
    if window_lights:
        lights = window_lights + [dict(kind=l['kind'], position=gl3(l['p'], l['z']), color=l['color'])
                                  for l in lights_list() if l['kind'] == 'harbourlight']
    else:
        lights = [dict(kind=l['kind'], position=gl3(l['p'], l['z']), color=l['color']) for l in lights_list()]
    assert len(lights) <= 400, len(lights)
    # pan clamp: the island's screen extent (world box of the UV rectangle)
    cxs = [W(u, v) for u in (-330.0, 330.0) for v in (-330.0, 150.0)]
    layout = dict(
        version=2, units='m',
        axes='glTF Y-up: x east (screen down-right at yaw 45), y up, z south (toward viewer); headingRad h: bow along (sin h, 0, cos h)',
        seaLevel=0.0, deckY=DECK, quayY=Z_SHORE,
        bounds=dict(min=[round(min(xs) - 60, 1), -6.0, round(-max(ys) - 60, 1)], max=[round(max(xs) + 60, 1), 60.0, round(-min(ys) + 60, 1)]),
        camera=dict(presets=PRESETS, panClamp=dict(min=[round(min(p[0] for p in cxs), 1), round(min(-p[1] for p in cxs), 1)],
                                                   max=[round(max(p[0] for p in cxs), 1), round(max(-p[1] for p in cxs), 1)]),
                    minDistance=90.0, maxDistance=1150.0),
        hull=dict(classes=CLASSES, loa=LOA, beam=BEAM, mastAboveDeck=MAST,
                  mooring=dict(flagship='alongside', large='alongside', medium='finger', small='finger', boat='swing', skiff='swing')),
        island=dict(coast=[gl2(p) for p in COAST], bay=[gl2(W(*p)) for p in BAY_UV],
                    breakwater=[gl2(p) for p in BW_LINE], mole=[gl2(p) for p in BW_LINE[-3:]]),
        piers=piers, moorings=moorings, lanes=lanes, landmarks=landmarks, zones=zones, lights=lights, labels=labels,
        sea=dict(sdf='/harbour/sea-sdf.png', bounds=sea_bounds),
        wind=dict(bowHeadingRad=round(heading_rad(WIND_BOW), 4), note='moored bows point into the wind'),
        capacity={pid: {k: dict(need=REQ[pid][k], have=counts_by(pid).get(k, 0)) for k in CLASSES if REQ[pid][k] or counts_by(pid).get(k, 0)}
                  for pid in CHAINS},
    )
    path = os.path.join(ROOT, 'src/harbour/data/layout.json')
    json.dump(layout, open(path, 'w'), separators=(',', ':'))
    return path


def sea_bounds():
    """Square SDF window (glTF [minX, minZ, maxX, maxZ]) round everything that floats or stands."""
    pts = list(COAST) + [p for r_ in FAR_ROWS for p in r_['slots']] + list(SHOALS_POLY) + [m['buoy'] for m in MOORINGS] + \
        [p for sk in SKERRIES for p in sk['poly']] + list(NODES.values())
    xs = [p[0] for p in pts]; zs = [-p[1] for p in pts]
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    h = max(max(xs) - min(xs), max(zs) - min(zs)) / 2 + 60
    h = math.ceil(h / 10) * 10
    return [round(cx - h, 1), round(cz - h, 1), round(cx + h, 1), round(cz + h, 1)]


# =====================================================================================================
if __name__ == '__main__':
    ok, rows = check_capacity()
    print(f"{'chain':22s}{'class':9s}{'E':>7s}{'p95':>5s}{'need':>6s}{'have':>6s}")
    for pid, k, E, p95, r, h in rows:
        if r or h:
            print(f"{pid:22s}{k:9s}{E:7.1f}{p95:5d}{r:6d}{h:6d}{'' if h >= r else '  <-- SHORT'}{'  (+%d)' % (h - r) if h > r else ''}")
    print('capacity OK' if ok else 'CAPACITY SHORT')
    print(json.dumps(frame_report(), indent=None))
    _HPOLYS[:] = [p for p, _ in FOOT] + structure_polys() + [rect(add(c, mul(_rv, 0.6 * LOA[r_['cls']])), _rv, LOA[r_['cls']], BEAM[r_['cls']] + 1.2) for r_ in FAR_ROWS for c in r_['slots']]
    for name, pr in PRESETS.items():
        print(name, 'land fill', round(land_fill(pr), 3), 'with harbour', round(land_fill(pr, 10, True), 3))
    if '--sweep' in sys.argv:
        for pit in (36.0, 38.0, 40.0):
            for D in (820.0, 880.0, 940.0):
                for tv in (-100.0, -112.0, -124.0):
                    pr = preset((6.0, tv), D, 0.0, pit)
                    rep = sky_radius(pr, COAST + BW_LINE)
                    print('  sweep', pit, D, tv, 'band', round(rep[1], 3), 'fill', round(land_fill(pr, 12), 3), round(land_fill(pr, 14, True), 3))
    R = Raster()
    over, bad = check_overlaps(R)
    print(f'footprint overlap {over:.1f} m2, bad berths {len(bad)}')
    for b in bad[:30]:
        print('  ', b)
    pb = check_paths(R)
    print('path problems', len(pb))
    for b in pb[:40]:
        print('  ', b)
    legs = leg_lengths()
    json.dump({'legLengths': legs}, open(os.path.join(HERE, 'legs.json'), 'w'), indent=1)
    print('moorings', len(MOORINGS), 'berths', sum(len(P['berths']) for P in PIERS.values()), 'lots', len(LOTS))
    render_plan(os.path.join(ART, 'plan.png'))
    print('plan written')
    if '--plan-only' not in sys.argv:
        wl = os.path.join(OUTD, 'window_lights.json')       # written by the Blender build (per-building window groups)
        win = json.load(open(wl)) if os.path.exists(wl) and '--no-lights' not in sys.argv else []
        write_compose([])
        sb = sea_bounds()
        print('sea bounds', sb)
        if '--layout' in sys.argv:       # the runtime layout ships with the matching island.glb: write it on purpose
            print('layout ->', write_layout(win, sb), 'lights', len(win) + len(lights_list()))
