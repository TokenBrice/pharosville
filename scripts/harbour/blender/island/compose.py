#!/usr/bin/env python3
"""The Harbour, composition v2: the whole island laid out in plan (pure Python).

Reads the berth requirement table (occupancy.py output) and authors the world: land levels, quays, piers,
berths, swinging moorings, lane graph, zones, landmarks, town lots, vegetation scatter, lights, labels and
camera presets. Writes
  outputs/harbour/island/compose.json   - Blender build input (Blender coords: x east, y north, z up)
  src/harbour/data/layout.json          - runtime layout v2 (glTF coords: x east, y up, z south)
  scripts/harbour/blender/island/legs.json - lane-graph leg lengths for occupancy.py (second pass)
  agents/.../p2/island/plan.png         - plan check (screen-aligned: up = away from the camera)

    python3 compose.py [--plan-only]
"""
import json, math, os, random, sys, heapq
from collections import Counter, defaultdict
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from geom import *

ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
OUTD = os.path.join(ROOT, 'outputs/harbour/island')
ART = os.path.join(ROOT, 'agents/2026-10-13-pharosville-reboot/p2/island')
os.makedirs(OUTD, exist_ok=True); os.makedirs(ART, exist_ok=True)
OCC = json.load(open(os.path.join(OUTD, 'occupancy.json')))

CLASSES = ['flagship', 'large', 'medium', 'small', 'boat', 'skiff']
LOA = dict(flagship=26.0, large=18.0, medium=13.0, small=10.0, boat=7.5, skiff=5.0)
BEAM = dict(flagship=6.6, large=5.2, medium=4.8, small=3.4, boat=3.2, skiff=2.2)
SPRIT = dict(flagship=7.3, large=5.0, medium=2.9, small=2.2, boat=0.0, skiff=0.0)   # bowsprit beyond LOA
MAST = dict(flagship=27.0, large=20.0, medium=15.0, small=13.0, boat=8.6, skiff=5.8)
ALONG = {k: LOA[k] + SPRIT[k] + 3.5 for k in CLASSES}          # alongside berth length
PITCH = dict(medium=6.0, small=4.8)                             # finger berth pitch along the main pier
FINGER = dict(medium=9.0, small=7.0)                            # finger length
CHAINS = {'pier-ethereum': 'Ethereum', 'pier-tron': 'Tron', 'pier-bsc': 'BSC', 'pier-solana': 'Solana',
          'pier-hyperliquid-l1': 'Hyperliquid L1', 'pier-base': 'Base', 'pier-arbitrum': 'Arbitrum', 'pier-polygon': 'Polygon'}
PENNANT = {'pier-ethereum': '#6F7FD8', 'pier-tron': '#D2463C', 'pier-bsc': '#F0B90B', 'pier-solana': '#9A5CF0',
           'pier-hyperliquid-l1': '#5FD3BC', 'pier-base': '#2F6BFF', 'pier-arbitrum': '#2BA3EC', 'pier-polygon': '#8A52E6'}


def need(pid, cls):
    return OCC['occupancy'][pid][cls]['berths']


REQ = {pid: {k: need(pid, k) for k in CLASSES} for pid in CHAINS}
REQ_FAR = {k: need('far', k) for k in CLASSES}

Z_SHORE, DECK = 2.4, 1.2
WIND_BOW = norm((-1.0, -0.62))       # moored bows point into a south-westerly (screen left)

# =====================================================================================================
# 1. BAY + LAND (world coords, metres)
#    The bay is a diamond on screen. North shore = Grand Quay + the town rising behind it; west shore = the
#    Ethereum basin; east side = the breakwater (Tron alongside) closed by the south arm; the mouth opens at
#    the NE corner right under the Pharos, so every boat in or out passes the lighthouse in the heart view.
#    The six small chains each own a cove hamlet on the south coast, which faces the camera.
# =====================================================================================================
QY = 150.0           # Grand Quay face (north shore)
WX = -150.0          # west shore (Ethereum basin root)
SY = -112.0          # bay south shore
BW_W = 9.0
BW_LINE = [(170, -116), (170, -40), (170, 20), (170, 74), (167, 84)]       # breakwater crown centreline, root -> head
BWX = 165.5          # breakwater inner face (approx.)
SC_Y = -256.0        # south coast baseline
COVE_BACK = -226.0   # cove back-quay line

COVES = [('pier-hyperliquid-l1', -184.0, 16.0), ('pier-polygon', -136.0, 20.0), ('pier-arbitrum', -78.0, 26.0),
         ('pier-base', -12.0, 28.0), ('pier-solana', 70.0, 42.0), ('pier-bsc', 152.0, 28.0)]

STRAIGHT = [((-140, QY), (150, QY), 2.5), ((WX, SY + 4), (WX, 145), 2.5), ((-146, SY), (160, SY), 2.0)]


def coast_ctrl():
    pts = []
    pts += [(162, SY), (120, SY), (80, SY), (40, SY), (0, SY), (-40, SY), (-80, SY), (-120, SY), (WX, SY)]
    pts += [(WX, -80), (WX, -40), (WX, 0), (WX, 40), (WX, 80), (WX, 120), (WX, QY)]
    pts += [(-110, QY), (-60, QY), (-10, QY), (40, QY), (90, QY), (140, QY), (150, QY)]
    # NE corner: quay corner + stair up to the headland, the headland's SW tip faces the mouth
    pts += [(158, 147), (168, 141), (178, 133), (188, 122), (202, 112), (224, 106), (248, 112), (268, 132), (278, 166),
            (276, 206), (262, 242), (242, 274)]
    pts += [(262, 306), (236, 346), (190, 382), (130, 404), (66, 414), (0, 418), (-60, 414)]
    pts += [(-118, 398), (-166, 380), (-204, 354), (-226, 330), (-238, 306), (-256, 292), (-276, 286), (-290, 268), (-294, 240),
            (-292, 210)]
    pts += [(-318, 176), (-334, 110), (-338, 50), (-330, -10), (-314, -70), (-290, -128), (-256, -176), (-224, -214), (-206, -244)]
    for pid, cx, hw in COVES:
        pts += [(cx - hw - 6, SC_Y + 1), (cx - hw - 1, SC_Y + 7), (cx - hw + 1, COVE_BACK - 6), (cx - hw + 5, COVE_BACK),
                (cx, COVE_BACK), (cx + hw - 5, COVE_BACK), (cx + hw - 1, COVE_BACK - 6), (cx + hw + 1, SC_Y + 7),
                (cx + hw + 6, SC_Y + 1)]
        STRAIGHT.append(((cx - hw + 5, COVE_BACK), (cx + hw - 5, COVE_BACK), 2.0))
    pts += [(198, -252), (210, -226), (208, -190), (196, -152), (186, -128), (176, -118)]
    return pts


def fix_lines(poly):
    out = []
    for p in poly:
        q = p
        for a, b, tol in STRAIGHT:
            ab = sub(b, a); t = dot(sub(p, a), ab) / dot(ab, ab)
            if -0.02 <= t <= 1.02:
                proj = add(a, mul(ab, max(0, min(1, t))))
                if length(sub(p, proj)) < tol:
                    q = proj
        out.append(q)
    return out


COAST = ccw(fix_lines(catmull(coast_ctrl(), 4)))
LEVELS = []


def level(name, ctrl, z, edge='cliff', n=4):
    p = ccw(catmull(ctrl, n)); LEVELS.append(dict(name=name, poly=p, z=z, edge=edge)); return p


T1 = level('t1', [(-134, 182), (-60, 182), (20, 182), (100, 182), (140, 184), (164, 206), (190, 240), (196, 282), (170, 326),
                  (110, 360), (0, 382), (-100, 380), (-170, 360), (-206, 330), (-230, 290), (-236, 240), (-210, 200), (-170, 186)], 7.0, 'ashlar')
T2 = level('t2', [(-120, 216), (-40, 216), (40, 216), (118, 216), (146, 230), (162, 266), (150, 308), (110, 340), (40, 360),
                  (-60, 362), (-150, 342), (-200, 306), (-212, 262), (-190, 230), (-160, 220)], 12.0, 'ashlar')
T3 = level('t3', [(-104, 250), (-20, 250), (60, 250), (112, 254), (128, 282), (118, 316), (76, 340), (0, 350), (-90, 346),
                  (-160, 324), (-190, 292), (-178, 264), (-144, 254)], 17.0, 'ashlar')
H1 = level('h1', [(-150, 288), (-60, 284), (30, 288), (92, 302), (104, 326), (70, 342), (0, 346), (-90, 344), (-158, 326), (-178, 304)], 23.0)
H2 = level('h2', [(-136, 310), (-50, 306), (40, 312), (78, 330), (40, 340), (-40, 342), (-120, 336), (-156, 322)], 28.0)
HEAD = level('head', [(196, 124), (214, 116), (236, 116), (256, 130), (266, 156), (266, 190), (256, 224), (236, 250), (212, 254),
                      (196, 238), (188, 206), (186, 170), (188, 140)], 16.0)
W1 = level('w1', [(-172, 150), (-172, 80), (-172, 0), (-174, -60), (-182, -100), (-206, -124), (-240, -126), (-262, -80),
                  (-270, 0), (-272, 90), (-268, 160), (-256, 214), (-232, 230), (-200, 200)], 7.0)
W2 = level('w2', [(-202, 130), (-200, 50), (-206, -30), (-222, -86), (-246, -92), (-256, -40), (-260, 40), (-256, 120), (-242, 170), (-220, 170)], 13.0)
W3 = level('w3', [(-228, 90), (-228, 20), (-236, -36), (-250, -32), (-252, 30), (-246, 100), (-238, 124)], 19.0)
S1 = level('s1', [(150, -130), (100, -128), (40, -128), (-20, -130), (-80, -130), (-130, -134), (-180, -140), (-222, -156),
                  (-232, -190), (-200, -204), (-140, -204), (-80, -204), (-20, -204), (40, -204), (100, -204), (160, -202),
                  (196, -190), (204, -160), (186, -138)], 6.0)
S2 = level('s2', [(110, -150), (40, -150), (-30, -152), (-100, -156), (-170, -164), (-206, -178), (-180, -190), (-110, -188),
                  (-40, -186), (30, -186), (100, -184), (140, -172), (146, -158)], 10.0)

# =====================================================================================================
# 2. HARBOUR STRUCTURES + BERTHS
# =====================================================================================================
PIERS = {pid: dict(id=pid, chain=CHAINS[pid], kind='', gate=None, segments=[], berths=[], counts=Counter()) for pid in CHAINS}
STRUCT = []
FOOT = []
LAMPS = []           # (x, y, z, kind, color)
BOLLARDS = []
PIER_ENDS = {}       # pid -> (end point, direction) for gates


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


def alongside_run(pid, start, direction, face_n, classes, gate, bow=+1, gap=1.0, zdeck=Z_SHORE, fender=0.8):
    direction = norm(direction); face_n = norm(face_n)
    s = gap
    for cls in classes:
        Lb = ALONG[cls]
        mid = add(start, mul(direction, s + Lb / 2))
        c = add(mid, mul(face_n, BEAM[cls] / 2 + fender))
        d = mul(direction, bow)
        off = BEAM[cls] * 2.2 + 6
        app = [add(mid, add(mul(face_n, off + 14), mul(direction, -bow * (Lb * 0.9)))),
               add(mid, add(mul(face_n, off), mul(direction, -bow * Lb * 0.35))), c]
        add_berth(pid, cls, c, d, app, gate, 'alongside')
        for k in (-0.36, 0.36):
            BOLLARDS.append((*add(mid, mul(direction, Lb * k)), zdeck))
        s += Lb
    return s + gap


def finger_pier(pid, root, direction, width, left, right, head=None, gate=None, lamp=True, first=4.0,
                outer_left=(), outer_right=(), deck=DECK, material='timber'):
    """Main pier from `root` along `direction`; left/right = finger-berth class sequences from the root outward
    (left = left of `direction`); outer_* = alongside berths beyond the fingers; head = (length, [classes]) T-head.
    Boats lie perpendicular to the pier, bow-in."""
    direction = norm(direction)
    n_l = perp(direction)
    lens = {}
    fingers = []
    for s, seq, outer in ((+1, left, outer_left), (-1, right, outer_right)):
        n = mul(n_l, s)
        t = first; prev = None; pair = 0
        for cls in seq:
            pitch = PITCH[cls]
            if prev is not None and prev != cls:
                t += 0.8
            base = add(root, mul(direction, t + pitch / 2))
            c = add(base, mul(n, width / 2 + 0.7 + LOA[cls] / 2))
            fw = width / 2 + LOA[cls] + 8.0
            app = [add(base, mul(n, fw + 8)), add(base, mul(n, fw)), add(base, mul(n, width / 2 + LOA[cls] + 1.5)), c]
            add_berth(pid, cls, c, mul(n, -1), app, gate, 'finger')
            if pair % 2 == 0:
                fingers.append((add(root, mul(direction, t + pitch)), n, FINGER[cls]))
            pair += 1; t += pitch; prev = cls
        if seq and pair % 2 == 1:
            fingers.append((add(root, mul(direction, t)), n, FINGER[prev]))
        t += 1.0
        for cls in outer:
            Lb = ALONG[cls]
            mid = add(root, mul(direction, t + Lb / 2))
            c = add(mid, mul(n, width / 2 + BEAM[cls] / 2 + 0.8))
            app = [add(mid, add(mul(n, BEAM[cls] * 2.2 + 18), mul(direction, -Lb * 0.9))),
                   add(mid, add(mul(n, BEAM[cls] * 2.2 + 5), mul(direction, -Lb * 0.35))), c]
            add_berth(pid, cls, c, direction, app, gate, 'alongside')
            for k in (-0.36, 0.36):
                BOLLARDS.append((*add(add(mid, mul(direction, Lb * k)), mul(n, width / 2 - 0.3)), deck))
            t += Lb
        lens[s] = t
    L = max(lens.values()) + 1.0
    end = add(root, mul(direction, L))
    P = PIERS[pid]
    P['segments'].append(dict(kind='arm', a=root, b=end, width=width))
    STRUCT.append(dict(kind='pier', pid=pid, a=root, b=end, width=width, deck=deck, material=material))
    for (p, n, fl) in fingers:
        a = add(p, mul(n, width / 2 - 0.2)); b = add(p, mul(n, width / 2 + fl))
        P['segments'].append(dict(kind='finger', a=a, b=b, width=0.9))
        STRUCT.append(dict(kind='finger', pid=pid, a=a, b=b, width=0.9, deck=deck, material=material))
    if head:
        hl, hcls = head
        tw = 6.0
        hc = add(end, mul(direction, tw / 2))
        a = add(hc, mul(n_l, hl / 2)); b = add(hc, mul(n_l, -hl / 2))
        P['segments'].append(dict(kind='thead', a=a, b=b, width=tw))
        STRUCT.append(dict(kind='thead', pid=pid, a=a, b=b, width=tw, deck=deck, material=material))
        face0 = add(add(hc, mul(direction, tw / 2)), mul(n_l, hl / 2))
        alongside_run(pid, face0, mul(n_l, -1), direction, hcls, gate, bow=+1, zdeck=deck,
                      gap=(hl - sum(ALONG[c] for c in hcls)) / 2)
        L += tw
        end = add(root, mul(direction, L))
        for k in (-1, 1):
            LAMPS.append((*add(add(hc, mul(direction, -tw / 2 + 0.6)), mul(n_l, k * (hl / 2 - 0.8))), deck, 'pierhead', PENNANT.get(pid)))
        L += max(BEAM[c] for c in hcls) + 1.6
    elif lamp:
        LAMPS.append((*add(end, mul(direction, -0.8)), deck, 'pierhead', PENNANT.get(pid)))
    PIER_ENDS.setdefault(gate, []).append((add(root, mul(direction, L)), direction))
    return L, end


# ---------------------------------------------------------------- Grand Quay (Ethereum): the big ships alongside the town
PIERS['pier-ethereum']['kind'] = 'grand'
PIERS['pier-ethereum']['segments'].append(dict(kind='quay', a=(-150.0, QY), b=(150.0, QY), width=14.0))
alongside_run('pier-ethereum', (-48.0, QY), (1, 0), (0, -1), ['large', 'large', 'large', 'flagship', 'flagship', 'large'],
              'g-eth-quay', bow=-1, gap=3.0)

# ---------------------------------------------------------------- Ethereum basin: six finger piers from the west shore
M, S_ = 'medium', 'small'
ETH_PIERS = [
    # y root, north-side seq, south-side seq, outer N, outer S, head
    (124.0, [M] * 10, [M] * 10, (), (), (26.0, ['large'])),
    (82.0, [M] * 11, [M] * 11, ('large',), ('large',), None),
    (38.0, [M] * 9, [M] * 9, (), (), (26.0, ['large'])),
    (-2.0, [S_] * 20, [S_] * 19, (), ('large',), (26.0, ['large'])),
    (-40.0, [S_] * 18, [S_] * 18, (), (), (26.0, ['large'])),
    (-76.0, [S_] * 17, [S_] * 17, (), (), (26.0, ['large'])),
]
for i, (y, L_, R_, oL, oR, head) in enumerate(ETH_PIERS):
    finger_pier('pier-ethereum', (WX, y), (1, 0), 3.0, L_, R_, head=head, gate=f'g-eth-{i}', outer_left=oL, outer_right=oR)

# ---------------------------------------------------------------- the breakwater: Tron alongside, USDT right under the Pharos
STRUCT.append(dict(kind='breakwater', line=BW_LINE, width=BW_W))
PIERS['pier-tron']['kind'] = 'deepwater-quay'
PIERS['pier-tron']['segments'].append(dict(kind='breakwater', a=(BWX, 78), b=(BWX, -30), width=BW_W))
alongside_run('pier-tron', (BWX, 78.0), (0, -1), (-1, 0), ['flagship', 'large'], 'g-tron', bow=+1, gap=1.0)
finger_pier('pier-tron', (BWX, -22.0), (-1, 0), 2.6, [M, S_], [M, S_], gate='g-tron', lamp=False)
LAMPS.append((BW_X + 0.0 if False else 168.0, -20.0, 3.6, 'pierhead', PENNANT['pier-tron']))
HARBOUR_LIGHTS = [((167.0, 84.0), 'red')]              # breakwater head at the mouth
STORM = (184.0, 134.0)

# ---------------------------------------------------------------- the six cove hamlets (south coast)
COVE_PIERS = {
    'pier-hyperliquid-l1': ([], [], (), (), (40.0, ['flagship'])),
    'pier-polygon': ([M, S_, S_], [M, S_, S_], (), (), (26.0, ['large'])),
    'pier-arbitrum': ([M, M, S_, S_, S_], [M, M, S_, S_], (), ('large',), (26.0, ['large'])),
    'pier-base': ([M, M, S_, S_, S_, S_, S_], [M, M, S_, S_, S_, S_], ('large',), (), (40.0, ['flagship'])),
    'pier-solana': ([M, M, M, S_, S_, S_, S_], [M, M, M, S_, S_, S_, S_], ('large',), ('large',), (40.0, ['flagship'])),
    'pier-bsc': ([M, M, S_, S_, S_, S_, S_], [M, M, S_, S_, S_, S_, S_], ('large',), ('large',), (26.0, ['large'])),
}
COVE_EXTRA = {'pier-solana': (['large'], ['large'])}
COVE_FIRST = {'pier-solana': 11.0}
COVE_CHARACTER = {   # what makes each hamlet itself (the Blender builder dresses by this)
    'pier-hyperliquid-l1': 'deepwater stone jetty, beacon tower, mint-green doors',
    'pier-polygon': 'boatyard: a hull on stocks, timber stacks, violet shutters',
    'pier-arbitrum': 'rope-walk + chandlery, blue-painted sheds, coiled rope',
    'pier-base': 'fishing hamlet: hjell drying racks, net lofts, blue trim',
    'pier-solana': 'merchant wharf: crane, warehouse, purple awnings',
    'pier-bsc': 'timber wharf: lumber stacks, gold-ochre sheds, hand crane',
}
for pid, cx, hw in COVES:
    Ls, Rs, oW, oE, head = COVE_PIERS[pid]
    PIERS[pid]['kind'] = 'cove'
    PIERS[pid]['segments'].append(dict(kind='quay', a=(cx - hw + 5, COVE_BACK), b=(cx + hw - 5, COVE_BACK), width=8.0))
    g = 'g-' + pid[5:]
    if pid == 'pier-hyperliquid-l1':
        finger_pier(pid, (cx, COVE_BACK), (0, -1), 4.2, [], [], head=head, gate=g, deck=Z_SHORE, material='stone', first=34.0)
    else:
        finger_pier(pid, (cx, COVE_BACK), (0, -1), 2.6, Rs, Ls, head=head, gate=g, outer_left=oE, outer_right=oW,
                    first=COVE_FIRST.get(pid, 4.0))
    ex = COVE_EXTRA.get(pid)
    if ex:
        w_, e_ = ex
        if w_:
            alongside_run(pid, (cx - hw + 5.5, COVE_BACK), (1, 0), (0, -1), w_, g, bow=+1, gap=0.3, fender=0.6)
        if e_:
            alongside_run(pid, (cx + hw - 5.5, COVE_BACK), (-1, 0), (0, -1), e_, g, bow=+1, gap=0.3, fender=0.6)

# =====================================================================================================
# 3. MOORINGS (skiff + boat): organic drifts, every bow into the south-westerly
# =====================================================================================================
SWING = {'boat': LOA['boat'] + 2.5, 'skiff': LOA['skiff'] + 2.0}
MOORINGS = []


def drift(pid, ctrl, counts, seed, r=9.6, avoid=None):
    rng = random.Random(seed)
    poly = ccw(catmull(ctrl, 5))
    n_total = sum(counts.values())
    taken = [m['buoy'] for m in MOORINGS]
    berths = [(b['pos'], LOA[b['cls']] / 2 + SPRIT[b['cls']] + 9.0) for P in PIERS.values() for b in P['berths']]
    av = lambda p: ((avoid and avoid(p)) or any(abs(p[0] - q[0]) < r and abs(p[1] - q[1]) < r and length(sub(p, q)) < r for q in taken)
                    or any(abs(p[0] - q[0]) < rr and abs(p[1] - q[1]) < rr and length(sub(p, q)) < rr for q, rr in berths))
    pts = poisson(poly, lambda p: r, rng, max_n=6000, avoid=av)
    cx = sum(p[0] for p in poly) / len(poly); cy = sum(p[1] for p in poly) / len(poly)
    pts.sort(key=lambda p: math.hypot(p[0] - cx, (p[1] - cy) * 1.2) + rng.uniform(0, 16))
    if len(pts) < n_total:
        print(f'WARN drift {pid}: {len(pts)} spots < {n_total}')
    pts = pts[:n_total]
    order = ['boat'] * counts.get('boat', 0) + ['skiff'] * counts.get('skiff', 0)
    for i, (p, cls) in enumerate(zip(pts, order)):
        d = rot(WIND_BOW, rng.uniform(-0.1, 0.1))
        c = add(p, mul(d, -(LOA[cls] / 2 + 1.2)))
        k = sum(1 for m in MOORINGS if m['pid'] == pid and m['cls'] == cls) + 1
        MOORINGS.append(dict(id=f'{pid}/m-{cls}/{k:03d}', chain=CHAINS[pid], pid=pid, cls=cls, buoy=p, center=c, d=d, swing=SWING[cls]))
        FOOT.append((foot(c, d, cls), MOORINGS[-1]['id']))
    return poly


DRIFTS = {k: [] for k in CHAINS}
DRIFTS['pier-ethereum'] += [
    drift('pier-ethereum', [(16, 106), (64, 112), (112, 106), (138, 76), (134, 34), (104, 14), (60, 10), (22, 24), (6, 60)],
          {'boat': 36, 'skiff': 46}, 11, r=9.2),
    drift('pier-ethereum', [(14, -10), (60, -6), (110, -14), (136, -40), (124, -78), (78, -88), (28, -84), (8, -52)],
          {'boat': 28, 'skiff': 36}, 12, r=9.2),
]
DRIFTS['pier-tron'] += [drift('pier-tron', [(126, -46), (150, -46), (152, -66), (128, -68)], {'boat': 2, 'skiff': 2}, 13, r=8.0)]
HAMLET_DRIFT = {'pier-hyperliquid-l1': {'boat': 5, 'skiff': 6}, 'pier-polygon': {'boat': 5, 'skiff': 16},
                'pier-arbitrum': {'boat': 5, 'skiff': 16}, 'pier-base': {'boat': 7, 'skiff': 18},
                'pier-solana': {'boat': 13, 'skiff': 9}, 'pier-bsc': {'boat': 9, 'skiff': 8}}
for i, (pid, cx, hw) in enumerate(COVES):
    n = sum(HAMLET_DRIFT[pid].values())
    w = 18 + n * 1.05
    y0 = -320
    cx_ = cx + 8.0
    DRIFTS[pid].append(drift(pid, [(cx_ - w, y0), (cx_ - w * 0.3, y0 + 3), (cx_ + w * 0.4, y0 + 2), (cx_ + w, y0 - 4), (cx_ + w * 0.9, y0 - 30),
                                   (cx_ + w * 0.2, y0 - 36), (cx_ - w * 0.5, y0 - 34), (cx_ - w * 0.95, y0 - 26)], HAMLET_DRIFT[pid], 20 + i, r=8.4))

# =====================================================================================================
# 4. LANE GRAPH. Inner loop (one way, anticlockwise on screen) round the bay; the mouth under the Pharos;
#    the coastal loop past the hamlet piers (westbound inside, eastbound outside the drifts); the outer
#    passage north round the island to the Far Ports; the Shoals spur outside the mouth.
# =====================================================================================================
NODES = {}
EDGES = []


def node(nid, p):
    NODES[nid] = p
    return nid


def chain_edges(ids, closed=False):
    for a, b in zip(ids, ids[1:] + ([ids[0]] if closed else [])):
        EDGES.append((a, b))


LOOP = [('L-ne', (150, 118)), ('L-n1', (100, 126)), ('L-n2', (40, 127)), ('L-n3', (-20, 126)), ('L-nw', (-12, 104)),
        ('L-w1', (-8, 62)), ('L-w2', (-8, 20)), ('L-w3', (-10, -20)), ('L-w4', (-12, -58)), ('L-sw', (-6, -98)),
        ('L-s1', (50, -100)), ('L-s2', (110, -98)), ('L-se', (146, -84)), ('L-e1', (148, -36)), ('L-e2', (144, 10)),
        ('L-e3', (142, 60)), ('L-e4', (146, 96))]
for nid, p in LOOP:
    node(nid, p)
chain_edges([n for n, _ in LOOP], closed=True)
OUTER = [('M-in', (196, 96)), ('M-out', (184, 82)), ('Q-1', (196, 40)), ('Q-2', (198, -60)), ('Q-3', (228, -170)), ('Q-4', (238, -280)),
         ('C-0', (208, -312)), ('C-w', (-236, -318)), ('C-r1', (-236, -372)), ('C-r2', (-60, -374)), ('C-r3', (120, -372)),
         ('C-r4', (262, -320)), ('Q-5', (286, -180)), ('Q-6', (264, -40)), ('Q-7', (244, 70)), ('SH-gate', (262, 52)),
         ('N-1', (300, 150)), ('N-2', (318, 300)), ('N-3', (210, 420)), ('N-4', (40, 470)), ('N-5', (-140, 500)), ('F-gate', (-300, 560)),
         ('N-6', (-160, 540)), ('N-7', (40, 512)), ('N-8', (240, 460)), ('N-9', (356, 300)), ('N-10', (340, 130))]
for nid, p in OUTER:
    node(nid, p)
EDGES += [('L-e4', 'M-out'), ('M-out', 'Q-1'), ('Q-1', 'Q-2'), ('Q-2', 'Q-3'), ('Q-3', 'Q-4'), ('Q-4', 'C-0'),
          ('C-r1', 'C-r2'), ('C-r2', 'C-r3'), ('C-r3', 'C-r4'), ('C-r4', 'Q-5'), ('Q-5', 'Q-6'), ('Q-6', 'Q-7'), ('Q-7', 'M-in'),
          ('M-in', 'L-ne'), ('Q-6', 'SH-gate'), ('SH-gate', 'Q-7'),
          ('M-out', 'N-1'), ('N-1', 'N-2'), ('N-2', 'N-3'), ('N-3', 'N-4'), ('N-4', 'N-5'), ('N-5', 'F-gate'), ('F-gate', 'N-6'),
          ('N-6', 'N-7'), ('N-7', 'N-8'), ('N-8', 'N-9'), ('N-9', 'N-10'), ('N-10', 'M-in')]
# the coastal (westbound) lane: one node per hamlet pier head
coast_ids = ['C-0']
for pid, cx, hw in sorted(COVES, key=lambda c: -c[1]):
    nid = 'C-' + pid[5:]
    node(nid, (cx + hw + 4, -312))
    coast_ids.append(nid)
coast_ids.append('C-w')
chain_edges(coast_ids)
EDGES.append(('C-w', 'C-r1'))

GATE_ON = {'g-eth-quay': 'L-n2', 'g-eth-0': 'L-nw', 'g-eth-1': 'L-w1', 'g-eth-2': 'L-w1', 'g-eth-3': 'L-w2', 'g-eth-4': 'L-w3',
           'g-eth-5': 'L-w4', 'g-tron': 'L-e1'}
for pid, cx, hw in COVES:
    GATE_ON['g-' + pid[5:]] = 'C-' + pid[5:]
GATES = {}
loop_ids = [n for n, _ in LOOP]
for g, on in GATE_ON.items():
    gid = 'gate-' + g[2:]
    if g in PIER_ENDS:
        (e, dd) = PIER_ENDS[g][0]
        p = add(e, mul(dd, 8.0))
    elif g == 'g-eth-quay':
        p = (40.0, 132.0)
    else:
        p = NODES[on]
    node(gid, p)
    seq = loop_ids if on in loop_ids else coast_ids
    nxt = seq[(seq.index(on) + 1) % len(seq)]
    EDGES.append((on, gid)); EDGES.append((gid, nxt))
    GATES[g] = gid
for pid, P in PIERS.items():
    for b in P['berths']:
        b['gate'] = GATES[b['gate']]
    gs = [b['gate'] for b in P['berths']]
    P['gate'] = NODES[Counter(gs).most_common(1)[0][0]] if gs else None
for m in MOORINGS:
    cand = loop_ids if m['pid'] in ('pier-ethereum', 'pier-tron') else ['C-r1', 'C-r2', 'C-r3'] + coast_ids
    m['gate'] = min(cand, key=lambda n: length(sub(NODES[n], m['buoy'])))

# =====================================================================================================
# 5. ZONES
# =====================================================================================================
rng = random.Random(7)
SH_C = (282.0, 4.0)
SHOALS_POLY = ccw(blob(SH_C, 46, 24, rng, 18, 0.2, ang=1.2))
SHOALS_ROCKS = []
for k in range(16):
    a = rng.uniform(0, 6.28); r = math.sqrt(rng.uniform(0.05, 1))
    p = add(SH_C, rot((math.cos(a) * 40 * r, math.sin(a) * 18 * r), 1.2))
    SHOALS_ROCKS.append((p[0], p[1], rng.uniform(0.9, 2.4) * (1.4 - r * 0.6)))
SHOAL_SLOTS = poisson(SHOALS_POLY, lambda p: 10.5, random.Random(8), max_n=900,
                      avoid=lambda p: any(length(sub(p, (x, y))) < r + 3.5 for x, y, r in SHOALS_ROCKS))[:30]
SHOAL_BUOYS = [add(SH_C, rot((math.cos(a) * 58, math.sin(a) * 32), 1.2)) for a in [i * 2 * math.pi / 6 + 0.3 for i in range(6)]]

# the mainland across the northern sound (shakkei): coast line in screen space V = const-ish, hills beyond
def mainland_coast():
    pts = []
    for k in range(0, 91):
        u = -1000 + k * 25.0
        v = 482 + 26 * math.sin(u / 160.0) + 14 * math.sin(u / 57.0 + 1.3)
        pts.append(from_uv(u, v))
    return pts


MAINLAND_COAST = mainland_coast()
MAINLAND_POLY = MAINLAND_COAST + [from_uv(1250, 1400), from_uv(-1250, 1400)]
# skerries off the west coast: breathing water with points of interest (land in the SDF)
_srng = random.Random(31)
SKERRIES = [dict(poly=ccw(blob(c_, rx, ry, _srng, 14, 0.24, ang=a_)), top=t_, grass=g_)
            for (c_, rx, ry, a_, t_, g_) in (((-414.0, -30.0), 44.0, 24.0, 0.5, 7.5, True), ((-430.0, -136.0), 22.0, 13.0, -0.3, 4.2, True),
                                              ((-350.0, -214.0), 12.0, 8.0, 0.9, 2.6, False), ((-440.0, 76.0), 20.0, 12.0, 0.2, 4.0, True),
                                              ((-380.0, 146.0), 9.0, 6.0, 1.2, 2.2, False), ((-476.0, 40.0), 12.0, 8.0, 0.4, 2.8, False),
                                              ((-380.0, -300.0), 16.0, 10.0, -0.6, 3.0, True), ((396.0, -46.0), 30.0, 16.0, 0.9, 5.0, True),
                                              ((360.0, -150.0), 12.0, 8.0, 0.3, 2.6, False), ((430.0, 70.0), 14.0, 9.0, -0.4, 3.0, False))]
WRECK_POLY = ccw([(-226, 330), (-246, 302), (-272, 290), (-292, 270), (-298, 236), (-296, 208), (-336, 210), (-330, 300), (-270, 340)])
_wr = random.Random(9)
WRECK_SLOTS = [(p, _wr.uniform(0, 6.28)) for p in poisson(ccw([(-232, 318), (-252, 300), (-276, 292), (-292, 268), (-296, 236),
                                                                 (-312, 240), (-306, 296), (-260, 320)]), lambda p: 11.0, _wr, max_n=800)[:28]]

SLIP = dict(top=(-128.0, QY + 12.0), bottom=(-128.0, QY - 22.0), width=7.0)

FAR_C = (84.0, 584.0)
FAR_ROWS = []
FAR_RAFTS = []
_frng = random.Random(10)
_rows = []
for cls in CLASSES:
    n = REQ_FAR[cls]
    per = {'flagship': 1, 'large': 3, 'medium': 10, 'small': 42, 'boat': 47, 'skiff': 48}[cls]
    while n > 0:
        _rows.append((cls, min(per, n))); n -= per
y = FAR_C[1] - sum(LOA[c] + SPRIT[c] + 7.0 for c, _ in _rows) / 2
for i, (cls, m) in enumerate(_rows):
    pitch = BEAM[cls] + 1.7
    L = m * pitch
    x0 = FAR_C[0] - L / 2 + _frng.uniform(-14, 14) + (i % 2) * 9
    raft_a, raft_b = (x0 - 2, y), (x0 + L + 2, y)
    FAR_RAFTS.append((raft_a, raft_b))
    FAR_ROWS.append(dict(cls=cls, line=[raft_a, raft_b], slots=[(x0 + (j + 0.5) * pitch, y + 1.6 + LOA[cls] / 2) for j in range(m)]))
    y += LOA[cls] + SPRIT[cls] + 7.0

# =====================================================================================================
# 6. LANDMARKS, TOWN LOTS
# =====================================================================================================
LH = (200.0, 130.0)           # the Pharos: on the headland's shoulder right over the mouth and USDT's berth
LANDMARKS = dict(
    pharos=dict(name='The Pharos', p=LH, z=16.0, fp=16, face=(-0.70710678, -0.70710678)),     # headingRad = -pi/4 = lighthouse.glb yaw
    keepers_cottage=dict(name="Keeper's Cottage", p=(230.0, 164.0), z=16.0, fp=14, face=(-0.7, -0.7)),
    oil_store=dict(name='Oil Store', p=(222.0, 140.0), z=16.0, fp=6, face=(-0.7, -0.7)),
    customs_house=dict(name='Customs House', p=(64.0, 174.0), z=Z_SHORE, fp=24, face=(0, -1)),
    tide_board=dict(name='Tide Board', p=(64.0, 160.6), z=Z_SHORE, fp=14, face=(0, -1)),
    tide_gauge=dict(name='Tide Gauge', p=(46.0, QY - 0.5), z=0.0, fp=3, face=(0, -1)),
    harbourmaster=dict(name="Harbourmaster's Office", p=(-104.0, 170.0), z=Z_SHORE, fp=16, face=(0, -1)),
    registry=dict(name='The Registry', p=(60.0, 230.0), z=12.0, fp=20, face=(0, -1)),
    storm_mast=dict(name='Storm-signal Mast', p=STORM, z=Z_SHORE, fp=6, face=(1, -1)),
    slipway=dict(name='The Slipway', p=SLIP['top'], z=Z_SHORE, fp=10, face=(0, -1)),
    church=dict(name="Seamen's Church", p=(84.0, 270.0), z=17.0, fp=18, face=(0, -1)),
    warehouse=dict(name='Bonded Warehouse', p=(-170.0, 124.0), z=Z_SHORE, fp=22, face=(1, 0)),
    breakwater=dict(name='The Breakwater', p=(170.0, 0.0), z=3.0, fp=80, face=(-1, 0)),
    shoals=dict(name='The Shoals', p=SH_C, z=0.0, fp=60, face=(0, -1)),
    wreck_cove=dict(name='Wreck Cove', p=(-280.0, 300.0), z=0.0, fp=50, face=(1, -1)),
    far_ports=dict(name='Far Ports', p=FAR_C, z=0.0, fp=80, face=(0, -1)),
)
import terrain as _T
for _k in ('pharos', 'keepers_cottage', 'oil_store'):
    LANDMARKS[_k]['z'] = round(_T.height(*LANDMARKS[_k]['p']), 2)
for pid, cx, hw in COVES:
    LANDMARKS['hamlet_' + pid[5:].replace('-', '_')] = dict(name=CHAINS[pid] + ' Cove', p=(cx, COVE_BACK - 8.0), z=Z_SHORE, fp=40,
                                                          face=(0, -1), pid=pid)

LOTS = []
_RES = [(L['p'], L['fp'] / 2 + 3.0) for k, L in LANDMARKS.items() if k in ('customs_house', 'harbourmaster', 'registry', 'church', 'warehouse')]


def free_lot(cx, cy, w):
    return all(abs(cx - p[0]) > r + w / 2 or abs(cy - p[1]) > r + 6 for p, r in _RES)


def blocks(x0, x1, y, z, depth, rng, style='terrace', block=(3, 6), alley=(2.5, 4.5), garden=(9.0, 16.0), p_garden=0.25,
           w_rng=(7.0, 9.6), face=(0, -1), jy=1.3, skip=()):
    """Organic terraced blocks: 3-6 houses with jittered setbacks, alleys between blocks, the odd garden gap."""
    x = x0
    while x < x1:
        n = rng.randint(*block)
        for i in range(n):
            w = rng.uniform(*w_rng)
            if x + w > x1:
                break
            cx = x + w / 2
            if not any(a <= cx <= b for a, b in skip) and free_lot(cx, y, w):
                LOTS.append(dict(c=(cx, y + rng.uniform(-jy, jy)), w=w - 0.12, d=depth * rng.uniform(0.86, 1.1), z=z, rot=0.0,
                                 style=style, face=face))
            x += w + rng.uniform(0.0, 0.25)
        x += rng.uniform(*garden) if rng.random() < p_garden else rng.uniform(*alley)


trng = random.Random(42)
blocks(-90, 146, 174.0, Z_SHORE, 10.5, trng, skip=((-60, -52), (96, 104)), p_garden=0.12, garden=(8.0, 12.0))
blocks(-112, 142, 195.0, 7.0, 9.0, trng, skip=((-90, -76), (-34, -20), (92, 106)), p_garden=0.5, garden=(14.0, 22.0))
blocks(-100, 120, 229.0, 12.0, 8.8, trng, skip=((-58, -44), (-4, 10)), p_garden=0.55, garden=(12.0, 22.0))
blocks(-84, 108, 264.0, 17.0, 8.5, trng, style='cottage', block=(1, 2), alley=(8.0, 14.0), garden=(16.0, 26.0), p_garden=0.6)
# cove hamlets: a short terrace of sheds behind the back quay, one gable-ended net loft by the pier root
for pid, cx, hw in COVES:
    k = 0
    xs = [cx - hw + 7.0, cx + hw - 7.0] if hw < 30 else [cx - hw + 7.0, cx - hw + 15.0, cx + hw - 15.0, cx + hw - 7.0]
    for x in xs:
        LOTS.append(dict(c=(x, COVE_BACK + 13.0 + trng.uniform(-1.0, 1.0)), w=trng.uniform(6.4, 8.0), d=8.0, z=Z_SHORE, rot=0.0,
                         style='hamlet', face=(0, -1)))
    LOTS.append(dict(c=(cx + (hw + 9.0) * (1 if trng.random() < 0.5 else -1), COVE_BACK + 4.0), w=7.0, d=9.5, z=Z_SHORE, rot=0.0,
                     style='loft', face=(0, -1)))
for y in (70.0, 10.0, -50.0):
    LOTS.append(dict(c=(-168.0, y), w=11.0, d=16.0, z=Z_SHORE, rot=0.0, style='warehouse', face=(1, 0)))
print('buildings', len(LOTS), '+ landmarks')

# =====================================================================================================
# 7. CAMERA PRESETS (runtime convention: yaw 45 puts the camera at +x, +z (glTF) of the target)
# =====================================================================================================
def preset(target_xy, dist, ty=0.0):
    tx, tyb = target_xy
    return dict(target=[round(tx, 2), round(ty, 2), round(-tyb, 2)], distance=round(dist, 1), fovDeg=25.0, pitchDeg=35.0, yawDeg=45.0)


PRESETS = {
    'heart': preset((128.0, 154.0), 355.0, 6.0),
    'overview': preset((20.0, -22.0), 990.0, 0.0),
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
    return ok, rows


def _raster_poly(poly, S, X0, Y1):
    """Rasterise a polygon into its own bbox crop: (mask, row0, col0)."""
    from PIL import Image, ImageDraw
    import numpy as np
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    c0 = int((min(xs) - X0) / S) - 1; c1 = int((max(xs) - X0) / S) + 2
    r0 = int((Y1 - max(ys)) / S) - 1; r1 = int((Y1 - min(ys)) / S) + 2
    im = Image.new('L', (c1 - c0, r1 - r0), 0)
    ImageDraw.Draw(im).polygon([((p[0] - X0) / S - c0, (Y1 - p[1]) / S - r0) for p in poly], fill=1)
    return np.array(im, bool), r0, c0


def structure_polys():
    out = []
    for s in STRUCT:
        if s['kind'] in ('pier', 'thead', 'finger'):
            a, b, w = s['a'], s['b'], s['width']
            d = norm(sub(b, a)); n = perp(d)
            out.append([add(a, mul(n, w / 2)), add(b, mul(n, w / 2)), add(b, mul(n, -w / 2)), add(a, mul(n, -w / 2))])
        if s['kind'] == 'breakwater':
            L = s['line']
            out.append(offset(L, s['width'] / 2, closed=False) + offset(L, -s['width'] / 2, closed=False)[::-1])
    return out


def check_overlaps():
    """Raster check (0.25 m) of hull footprints against each other, the land and the structures."""
    from PIL import Image, ImageDraw
    import numpy as np
    S = 0.25; X0, Y0, X1, Y1 = -330, -420, 300, 200
    W, H = int((X1 - X0) / S), int((Y1 - Y0) / S)
    acc = np.zeros((H, W), np.uint16)
    crops = []
    for poly, bid in FOOT:
        m, r0, c0 = _raster_poly(poly, S, X0, Y1)
        acc[r0:r0 + m.shape[0], c0:c0 + m.shape[1]] += m
        crops.append((m, r0, c0, bid))
    land = Image.new('L', (W, H), 0); dl = ImageDraw.Draw(land)
    to = lambda p: ((p[0] - X0) / S, (Y1 - p[1]) / S)
    dl.polygon([to(p) for p in COAST], fill=1)
    for q in structure_polys():
        dl.polygon([to(p) for p in q], fill=1)
    land = np.array(land) > 0
    bad = []
    for m, r0, c0, bid in crops:
        sa = acc[r0:r0 + m.shape[0], c0:c0 + m.shape[1]]; sl = land[r0:r0 + m.shape[0], c0:c0 + m.shape[1]]
        a1 = (m & (sa > 1)).sum() * S * S; a2 = (m & sl).sum() * S * S
        if a1 > 0.8 or a2 > 1.2:
            bad.append((bid, round(float(a1), 1), round(float(a2), 1)))
    return float((acc > 1).sum() * S * S), float(((acc > 0) & land).sum() * S * S), bad


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


def project(pr, p, W=1600, H=1000):
    cam, f, r, u = cam_basis(pr)
    d = tuple(p[i] - cam[i] for i in range(3))
    z = sum(d[i] * f[i] for i in range(3))
    if z <= 1e-3:
        return None
    th = math.tan(math.radians(pr['fovDeg']) / 2)
    x = sum(d[i] * r[i] for i in range(3)) / z / th / (W / H)
    y = sum(d[i] * u[i] for i in range(3)) / z / th
    return ((x + 1) * W / 2, (1 - y) * H / 2)


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
            lm[k] = 'in' if q and 0 <= q[0] <= 1600 and 0 <= q[1] <= 1000 else 'out'
        rep[name]['landmarks'] = lm
    return rep


def land_fill(pr, step=8):
    """Fraction of the 1600x1000 frame whose view ray hits island land (levels at their z) before the sea."""
    cam, f, r, u = cam_basis(pr)
    th = math.tan(math.radians(pr['fovDeg']) / 2)
    polys = [(L['poly'], L['z']) for L in LEVELS] + [(COAST, Z_SHORE)]
    hit = tot = 0
    for py in range(step // 2, 1000, step):
        for px in range(step // 2, 1600, step):
            x = (px / 800 - 1) * th * 1.6; y = (1 - py / 500) * th
            d = tuple(f[i] + r[i] * x + u[i] * y for i in range(3))
            tot += 1
            if d[2] >= 0:
                continue
            land = False
            for poly, z in sorted(polys, key=lambda t: -t[1]):
                t = (z - cam[2]) / d[2]
                q = (cam[0] + d[0] * t, cam[1] + d[1] * t)
                if pip(q[0], q[1], poly):
                    land = True; break
            hit += land
    return hit / tot


def lane_pier_crossings():
    zones = []
    for s in STRUCT:
        if s['kind'] in ('pier', 'thead', 'finger'):
            zones.append((s['a'], s['b']))
    hits = []
    for a, b in EDGES:
        pa, pb = NODES[a], NODES[b]
        for (q0, q1) in zones:
            if seg_intersect(pa, pb, q0, q1):
                hits.append((a, b)); break
    return hits


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
    gate_of['far'] = 'F-gate'
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
    """Ground (z=0) quad seen by a preset (Blender coords)."""
    tx, ty_, tz = pr['target']; T = (tx, -tz, ty_)
    D = pr['distance']; yaw = math.radians(pr['yawDeg']); pit = math.radians(pr['pitchDeg'])
    cp = math.cos(pit)
    off = (math.sin(yaw) * cp, -math.cos(yaw) * cp, math.sin(pit))
    cam = tuple(T[i] + off[i] * D for i in range(3))
    f = tuple(-o for o in off)
    up0 = (0, 0, 1)
    r = (f[1] * up0[2] - f[2] * up0[1], f[2] * up0[0] - f[0] * up0[2], f[0] * up0[1] - f[1] * up0[0])
    rl = math.sqrt(sum(x * x for x in r)); r = tuple(x / rl for x in r)
    u = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])
    th = math.tan(math.radians(pr['fovDeg']) / 2)
    out = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        d = tuple(f[i] + r[i] * sx * th * aspect + u[i] * sy * th for i in range(3))
        if d[2] >= -1e-4:
            t = 2500.0
        else:
            t = -cam[2] / d[2]
        t = min(t, 2500.0)
        out.append((cam[0] + d[0] * t, cam[1] + d[1] * t))
    return out


def render_plan(path, S=0.6):
    from PIL import Image, ImageDraw
    U0, U1, V0, V1 = -520, 560, -420, 760
    W, H = int((U1 - U0) / S), int((V1 - V0) / S)
    im = Image.new('RGB', (W, H), (24, 70, 92)); d = ImageDraw.Draw(im)

    def to(p):
        u, v = screen_uv(*p)
        return ((u - U0) / S, (V1 - v) / S)

    zc = lambda z: (int(90 + z * 4), int(130 + z * 3), int(70 + z * 2))
    d.polygon([to(p) for p in COAST], fill=(120, 140, 80))
    for L in LEVELS:
        d.polygon([to(p) for p in L['poly']], fill=zc(L['z']), outline=(60, 60, 60) if L['edge'] == 'ashlar' else None)
    d.polygon([to(p) for p in SHOALS_POLY], outline=(200, 200, 120))
    for x, y, r in SHOALS_ROCKS:
        cx, cy = to((x, y)); d.ellipse((cx - r / S, cy - r / S, cx + r / S, cy + r / S), fill=(110, 110, 110))
    d.polygon([to(p) for p in WRECK_POLY], outline=(220, 200, 150))
    for s in STRUCT:
        if s['kind'] in ('pier', 'thead', 'finger'):
            d.line([to(s['a']), to(s['b'])], fill=(170, 140, 100), width=max(1, int(s['width'] / S)))
        if s['kind'] == 'breakwater':
            d.line([to(p) for p in s['line']], fill=(160, 160, 150), width=int(s['width'] / S))
    for a, b in FAR_RAFTS:
        d.line([to(a), to(b)], fill=(170, 140, 100), width=3)
    col = dict(flagship=(255, 80, 80), large=(255, 160, 60), medium=(240, 230, 90), small=(120, 230, 120), boat=(120, 200, 255), skiff=(220, 160, 255))
    for poly, bid in FOOT:
        cls = bid.split('/')[1].replace('m-', '')
        d.polygon([to(p) for p in poly], fill=col.get(cls, (255, 255, 255)))
    for row_ in FAR_ROWS:
        for c in row_['slots']:
            d.polygon([to(p) for p in rect(c, (0, 1), LOA[row_['cls']], BEAM[row_['cls']])], fill=col[row_['cls']])
    for m in MOORINGS:
        cx, cy = to(m['buoy']); d.ellipse((cx - 1.5, cy - 1.5, cx + 1.5, cy + 1.5), fill=(255, 90, 40))
    for lot in LOTS:
        q = rect(lot['c'], (1, 0), lot['w'], lot['d'])
        d.polygon([to(p) for p in q], fill=(200, 110, 90) if lot['style'] != 'warehouse' else (150, 90, 70), outline=(60, 40, 30))
    for k, L in LANDMARKS.items():
        cx, cy = to(L['p']); r = 4
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255)); d.text((cx + 5, cy - 5), k, fill=(255, 255, 255))
    for a, b in EDGES:
        d.line([to(NODES[a]), to(NODES[b])], fill=(255, 255, 255), width=1)
        pa, pb = to(NODES[a]), to(NODES[b]); m = lerp(pa, pb, 0.6)
        dd = norm(sub(pb, pa)); n = perp(dd)
        d.polygon([add(m, mul(dd, 5)), add(m, add(mul(dd, -3), mul(n, 3))), add(m, add(mul(dd, -3), mul(n, -3)))], fill=(255, 255, 255))
    for name, pr in PRESETS.items():
        fp = frame_footprint(pr)
        d.line([to(p) for p in fp + fp[:1]], fill=(255, 255, 0) if name == 'heart' else (255, 0, 255), width=2)
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
    for (p, c) in HARBOUR_LIGHTS:
        out.append(dict(kind='harbourlight', p=p, z=9.6, color='#FF4A36' if c == 'red' else '#3CFF8A'))
    return out


def write_compose(extra_lights):
    quays = [dict(kind='grand', a=(-150.0, QY), b=(150.0, QY)), dict(kind='basin', a=(WX, SY), b=(WX, QY))]
    for pid, cx, hw in COVES:
        quays.append(dict(kind='cove', pid=pid, a=(cx - hw + 5, COVE_BACK), b=(cx + hw - 5, COVE_BACK)))
    berths = []
    for pid, P in PIERS.items():
        for b in P['berths']:
            berths.append(dict(id=b['id'], pid=pid, cls=b['cls'], pos=r2(b['pos']), d=r2(b['d']), mode=b['mode']))
    data = dict(
        coast=[r2(p) for p in COAST], levels=[dict(name=L['name'], poly=[r2(p) for p in L['poly']], z=L['z'], edge=L['edge']) for L in LEVELS],
        quays=quays, struct=STRUCT, berths=berths,
        moorings=[dict(id=m['id'], pid=m['pid'], cls=m['cls'], buoy=r2(m['buoy']), center=r2(m['center']), d=r2(m['d'])) for m in MOORINGS],
        lamps=LAMPS, bollards=BOLLARDS, lots=LOTS, landmarks=LANDMARKS, coves=COVES, cove_character=COVE_CHARACTER,
        pennant=PENNANT, chains=CHAINS, harbour_lights=HARBOUR_LIGHTS, storm=STORM, bw_line=BW_LINE, bw_width=BW_W,
        shoals=dict(poly=SHOALS_POLY, rocks=SHOALS_ROCKS, slots=SHOAL_SLOTS, buoys=SHOAL_BUOYS), skerries=SKERRIES,
        mainland=dict(coast=MAINLAND_COAST, poly=MAINLAND_POLY),
        wreck=dict(poly=WRECK_POLY, slots=WRECK_SLOTS), slip=SLIP, far=dict(rafts=FAR_RAFTS, rows=FAR_ROWS, c=FAR_C),
        presets=PRESETS, consts=dict(QY=QY, WX=WX, SY=SY, Z_SHORE=Z_SHORE, DECK=DECK, SC_Y=SC_Y, COVE_BACK=COVE_BACK, BWX=BWX),
        hull=dict(loa=LOA, beam=BEAM, sprit=SPRIT), wind_bow=WIND_BOW, extra_lights=extra_lights,
    )
    json.dump(data, open(os.path.join(OUTD, 'compose.json'), 'w'))


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
                    rocks=[[round(x, 2), round(-y, 2), round(r, 2)] for x, y, r in SHOALS_ROCKS]),
        wreckCove=dict(polygon=[gl2(p) for p in WRECK_POLY],
                       slots=[dict(id=f'wreck-{i + 1:02d}', **{'class': ('large' if i % 5 == 0 else 'medium' if i % 2 else 'small')},
                                   position=gl3(p), headingRad=round(a, 4)) for i, (p, a) in enumerate(WRECK_SLOTS)]),
        slipway=dict(polygon=[gl2(p) for p in rect(lerp(SLIP['top'], SLIP['bottom'], 0.5), (0, -1), length(sub(SLIP['top'], SLIP['bottom'])), SLIP['width'])],
                     slots=[gl3(lerp(SLIP['top'], SLIP['bottom'], 0.25), Z_SHORE)], launchPath=[gl2(SLIP['top']), gl2(SLIP['bottom']), gl2((-60.0, 112.0))]),
        farPorts=dict(polygon=[gl2(p) for p in blob(FAR_C, 90, 80, random.Random(3), 12, 0.05)],
                      rows=[dict(cls=r_['cls'], line=[gl2(p) for p in r_['line']], slots=[gl3(p) for p in r_['slots']]) for r_ in FAR_ROWS],
                      gate='F-gate'),
        hamlets={pid: dict(name=CHAINS[pid] + ' Cove', character=COVE_CHARACTER[pid], centre=gl2((cx, COVE_BACK - 20)), halfWidth=hw)
                 for pid, cx, hw in COVES},
    )
    labels = [dict(id=k.replace('_', '-'), text=L['name'], anchor=gl3(L['p'], L['z'] + (40 if k == 'pharos' else 14)), kind='landmark')
              for k, L in LANDMARKS.items() if k not in ('tide_board', 'tide_gauge')]
    labels += [dict(id='label-' + pid, text=CHAINS[pid], anchor=gl3(P['gate'], 6.0), kind='pier') for pid, P in PIERS.items() if P['gate']]
    xs = [p[0] for p in COAST]; ys = [p[1] for p in COAST]
    if window_lights:     # the Blender build wrote every lamp + window group; add the harbour light(s)
        lights = window_lights + [dict(kind=l['kind'], position=gl3(l['p'], l['z']), color=l['color'])
                                  for l in lights_list() if l['kind'] == 'harbourlight']
    else:
        lights = [dict(kind=l['kind'], position=gl3(l['p'], l['z']), color=l['color']) for l in lights_list()]
    assert len(lights) <= 400, len(lights)
    layout = dict(
        version=2, units='m',
        axes='glTF Y-up: x east (screen down-right at yaw 45), y up, z south (toward viewer); headingRad h: bow along (sin h, 0, cos h)',
        seaLevel=0.0, deckY=DECK, quayY=Z_SHORE,
        bounds=dict(min=[round(min(xs) - 40, 1), -6.0, round(-max(ys) - 60, 1)], max=[round(max(xs) + 60, 1), 60.0, round(-min(ys) + 140, 1)]),
        camera=dict(presets=PRESETS, panClamp=dict(min=[-420.0, -620.0], max=[420.0, 440.0]), minDistance=90.0, maxDistance=1250.0),
        hull=dict(classes=CLASSES, loa=LOA, beam=BEAM, mastAboveDeck=MAST,
                  mooring=dict(flagship='alongside', large='alongside', medium='finger', small='finger', boat='swing', skiff='swing')),
        island=dict(coast=[gl2(p) for p in COAST], bay=[gl2(p) for p in [(WX, SY), (BWX, SY), (BWX, 80), (150, QY), (WX, QY)]],
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


SEA_BOUNDS = [-600.0, -700.0, 560.0, 460.0]     # glTF [minX, minZ, maxX, maxZ] (covers the island, the hamlet drifts, the Far Ports)

# =====================================================================================================
if __name__ == '__main__':
    ok, rows = check_capacity()
    print(f"{'chain':22s}{'class':9s}{'E':>7s}{'p95':>5s}{'need':>6s}{'have':>6s}")
    for pid, k, E, p95, r, h in rows:
        if r or h:
            print(f"{pid:22s}{k:9s}{E:7.1f}{p95:5d}{r:6d}{h:6d}{'' if h >= r else '  <-- SHORT'}{'  (+%d)' % (h - r) if h > r else ''}")
    print('capacity OK' if ok else 'CAPACITY SHORT')
    print(json.dumps(frame_report(), indent=None))
    for name, pr in PRESETS.items():
        print(name, 'land fill', round(land_fill(pr), 3))
    over, on_land, bad = check_overlaps()
    print(f'footprint overlap {over:.1f} m2, on land {on_land:.1f} m2, bad berths {len(bad)}')
    for b in bad[:30]:
        print('  ', b)
    hits = lane_pier_crossings()
    print('lane/pier crossings:', hits)
    legs = leg_lengths()
    json.dump({'legLengths': legs}, open(os.path.join(HERE, 'legs.json'), 'w'), indent=1)
    print('moorings', len(MOORINGS), 'berths', sum(len(P['berths']) for P in PIERS.values()), 'lots', len(LOTS))
    render_plan(os.path.join(ART, 'plan.png'))
    print('plan written')
    if '--plan-only' not in sys.argv:
        wl = os.path.join(OUTD, 'window_lights.json')       # written by the Blender build (per-building window groups)
        win = json.load(open(wl)) if os.path.exists(wl) else []
        write_compose([])
        print('layout ->', write_layout(win, SEA_BOUNDS), 'lights', len(win) + len(lights_list()))
