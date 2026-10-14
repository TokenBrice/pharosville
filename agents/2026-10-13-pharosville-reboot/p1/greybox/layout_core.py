"""PharosVille harbour layout core (P1 grey-box). Pure Python (+ PIL for the plan view).

Coordinates: metres, glTF Y-up. World x = east (screen down-right at yaw 45), z = south (toward the
viewer's left), y = up. The overview camera sits at yaw 45 deg (south-east), so world axes read as
isometric diagonals. Composition is authored in a screen-aligned frame (u = screen right,
v = toward the camera / screen down) and converted with W(u, v).

Hull orientation: headingRad h means the bow points along (sin h, 0, cos h) in (x, y, z), i.e. a glTF
node whose model faces +Z gets rotation about +Y by h.

Run standalone:  python3 layout_core.py   -> layout.json, scene.json, plan.png
"""
import json, math, os, heapq
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SQ = math.sqrt(0.5)

def W(u, v):            # screen-aligned (u right, v toward camera) -> world (x, z)
    return (SQ * (u + v), SQ * (v - u))

def UV(x, z):
    return (SQ * (x - z), SQ * (x + z))

def add(a, b, s=1.0): return (a[0] + b[0] * s, a[1] + b[1] * s)
def sub(a, b): return (a[0] - b[0], a[1] - b[1])
def mul(a, s): return (a[0] * s, a[1] * s)
def dot(a, b): return a[0] * b[0] + a[1] * b[1]
def nrm(a):
    l = math.hypot(*a); return (a[0] / l, a[1] / l)
def perp(a): return (-a[1], a[0])
def heading_of(d): return math.atan2(d[0], d[1])     # bow dir (x, z) -> h
def r2(p): return [round(p[0], 2), round(p[1], 2)]
def r3(p, y=0.0): return [round(p[0], 2), round(y, 2), round(p[1], 2)]

EX, EZ = (1.0, 0.0), (0.0, 1.0)          # world east (screen down-right), world south (screen down-left)
NX, NZ = (-1.0, 0.0), (0.0, -1.0)        # west (screen up-left), north (screen up-right)

# ------------------------------------------------------------------ scale ladder
CLASSES = ['flagship', 'large', 'medium', 'small', 'boat', 'skiff']
LOA = dict(flagship=30.0, large=18.0, medium=13.0, small=10.0, boat=7.5, skiff=5.0)
BEAM = {k: round(0.32 * v, 2) for k, v in LOA.items()}
MAST = dict(flagship=28.0, large=19.0, medium=14.0, small=11.0, boat=8.0, skiff=5.0)   # above deck
MOOR = dict(flagship='alongside', large='alongside', medium='finger', small='finger', boat='med', skiff='med')
FINGER_W, ARM_W, GRAND_W, QUAY_W = 1.8, 3.0, 7.0, 10.0
DECK_Y = 1.2
FAIRWAY = 1.0      # x LOA between facing slip rows (stylised; real marinas use ~1.5)

def pitch(k):       # spacing along an arm, per berth
    if MOOR[k] == 'finger': return BEAM[k] + 0.5 + FINGER_W / 2
    if MOOR[k] == 'med': return BEAM[k] + 0.45
    return LOA[k] + 3.0
def slip_depth(k): return LOA[k] + 1.0

# ------------------------------------------------------------------ occupancy
OCC = json.load(open(os.path.join(HERE, 'occupancy.json')))
BERTHS = {w: {k: OCC['occupancy'][w][k]['berths'] for k in CLASSES} for w in OCC['occupancy']}

# ------------------------------------------------------------------ island (authored in u, v)
# The bay is a shield: a V-shaped town quay at the bottom (two straight quays on the world axes meeting
# at the town square, nearest the camera) and a rounded upper bowl closing to the mouth at the top.
VERT_UV = (0.0, 160.0)
QUAY_LEN, QUAY_LEN_W = 290.0, 330.0
VERT = W(*VERT_UV)
Q_RIGHT_END = add(VERT, NZ, QUAY_LEN)        # Ethereum quay (screen up-right from the square)
Q_LEFT_END = add(VERT, NX, QUAY_LEN_W)       # west quay (screen up-left from the square)
BAY_UV = [VERT_UV, UV(*Q_LEFT_END), (-244, -110), (-222, -146), (-182, -172), (-124, -190), (-104, -244),
          (140, -244), (136, -196), (188, -176), (218, -138), (228, -92), UV(*Q_RIGHT_END)]
ISLAND_UV = [(-112, -236), (-128, -262), (-176, -272), (-228, -248), (-276, -204), (-306, -134), (-322, -44),
             (-320, 56), (-306, 150), (-270, 236), (-206, 296), (-112, 334), (0, 350), (112, 336), (204, 296),
             (264, 236), (302, 150), (322, 52), (324, -48), (308, -140), (272, -202), (224, -236), (172, -240),
             (140, -220)]

BAY = [W(*p) for p in BAY_UV]
ISLAND = [W(*p) for p in ISLAND_UV]

def inside(pt, poly):
    x, y = pt; c = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c

def seg_dist(p, a, b):
    ab = sub(b, a); t = max(0.0, min(1.0, dot(sub(p, a), ab) / max(dot(ab, ab), 1e-9)))
    q = add(a, ab, t); return math.hypot(p[0] - q[0], p[1] - q[1])

def poly_dist(p, poly):
    return min(seg_dist(p, poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))

def is_water(p):
    return (not inside(p, ISLAND)) or inside(p, BAY)

# ------------------------------------------------------------------ piers
piers, structures, hull_rects = [], [], []

def rect(c, d, L, B):
    n = perp(d)
    return [add(add(c, d, s * L / 2), n, t * B / 2) for s, t in ((1, 1), (1, -1), (-1, -1), (-1, 1))]

def struct(kind, a, b, width, pier=None, y=DECK_Y):
    d = nrm(sub(b, a)); L = math.hypot(*sub(b, a))
    structures.append(dict(kind=kind, pier=pier, a=a, b=b, width=width, y=y,
                           poly=rect(mul(add(a, b), 0.5), d, L, width)))

class Pier:
    def __init__(self, pid, chain, kind):
        self.id, self.chain, self.kind = pid, chain, kind
        self.berths, self.segments, self.gate = [], [], None
        self.counter = Counter(); self.tips = []
    def berth(self, k, pos, bow, approach):
        self.counter[k] += 1
        bid = f"{self.id}/{k}/{self.counter[k]:03d}"
        self.berths.append(dict(id=bid, cls=k, position=pos, heading=heading_of(bow), approach=approach))
        hull_rects.append((bid, rect(pos, bow, LOA[k], BEAM[k])))
    def seg(self, kind, a, b, width):
        self.segments.append(dict(kind=kind, a=r2(a), b=r2(b), width=width))
        struct(kind, a, b, width, self.id)

def side_len(content):
    L = 0.0
    for k, n in content:
        L += n * ((LOA[k] + 3.0) if MOOR[k] == 'alongside' else pitch(k)) + (2.0 if n else 0)
    return L

def side_depth(content):
    return max([(BEAM[k] + 0.8) if MOOR[k] == 'alongside' else slip_depth(k) for k, n in content if n] or [0.0])

def side_loa(content):
    return max([LOA[k] for k, n in content if n] or [0.0])

def place_side(P, root, ad, L, w, n_side, content, tip_fair):
    """Fill one face of an arm: alongside classes from the tip inward, slip classes after them."""
    t = L - 2.0
    for k, n in content:
        for i in range(n):
            if MOOR[k] == 'alongside':
                t -= LOA[k] / 2 + 1.5
                c = add(add(root, ad, t), n_side, w / 2 + BEAM[k] / 2 + 0.8)
                bow = ad if i % 2 == 0 else mul(ad, -1)
                P.berth(k, c, bow, [r2(tip_fair), r2(add(c, n_side, BEAM[k] + LOA[k] * 0.5 + 4)), r2(c)])
                t -= LOA[k] / 2 + 1.5
            else:
                p = pitch(k); t -= p / 2
                base = add(root, ad, t)
                c = add(base, n_side, w / 2 + 0.6 + LOA[k] / 2)
                fair = add(base, n_side, w / 2 + slip_depth(k) + FAIRWAY * LOA[k] / 2)
                P.berth(k, c, mul(n_side, -1), [r2(tip_fair), r2(fair), r2(add(c, n_side, LOA[k] * 0.5 + 1.5)), r2(c)])
                if MOOR[k] == 'finger' and i % 2 == 0:
                    fb = add(add(root, ad, t + p / 2), n_side, w / 2)
                    fe = add(fb, n_side, LOA[k] * 0.62)
                    P.segments.append(dict(kind='finger', a=r2(fb), b=r2(fe), width=FINGER_W))
                    struct('finger', fb, fe, FINGER_W, P.id)
                t -= p / 2
        t -= 2.0
    assert t > -0.5, (P.id, 'side overflow', t)

def quay_comb(q0, qd, ad, offset, specs, w=ARM_W, uniform=False):
    """Arms along ad rooted on the quay line q0 + s*qd, stacked along qd from `offset`.
    spec: dict(pier, near=[(k,n)], far=[(k,n)], kind='arm'|'grand', width, minlen, thead=[(k,n)])
    near faces the previous arm (-qd side), far faces the next (+qd side). Returns the end offset."""
    s_far = 1 if dot(perp(ad), qd) > 0 else -1
    n_far, n_near = mul(perp(ad), s_far), mul(perp(ad), -s_far)
    pos = offset; prev_far = None
    if uniform:     # one arm length for the whole comb: calm rhythm, aligned heads; spare length = empty slots
        Lu = max(max(side_len(sp.get('near', [])), side_len(sp.get('far', []))) for sp in specs)
        for sp in specs: sp['minlen'] = max(sp.get('minlen', 0), Lu)
    for sp in specs:
        P = sp['pier']; aw = sp.get('width', w)
        near, far = sp.get('near', []), sp.get('far', [])
        if prev_far is not None:
            fw = FAIRWAY * max(side_loa(prev_far[0]), side_loa(near)) if (side_depth(prev_far[0]) or side_depth(near)) else 0
            pos += prev_far[1] / 2 + side_depth(prev_far[0]) + fw + side_depth(near) + aw / 2 + sp.get('gap', 0)
        L = max(side_len(near), side_len(far), sp.get('minlen', 0)) + 6.0
        root = add(q0, qd, pos)
        tip = add(root, ad, L)
        if not hasattr(P, 'root'): P.root = root
        P.seg(sp.get('kind', 'arm'), root, tip, aw)
        tip_fair = add(tip, ad, 14)
        place_side(P, add(root, ad, 0), ad, L, aw, n_near, near, tip_fair)
        place_side(P, add(root, ad, 0), ad, L, aw, n_far, far, tip_fair)
        P.tips.append(tip)
        th = sp.get('thead')
        if th:      # T-head across the tip: big hulls alongside its outer face, centred
            half = sum((LOA[k] + 3.0) * n for k, n in th) / 2 + 2.0
            a, b = add(tip, n_near, half), add(tip, n_far, half)
            P.seg('thead', a, b, 5.0)
            t = -half + 1.0
            for k, n in th:
                for i in range(n):
                    t += LOA[k] / 2 + 1.5
                    c = add(add(tip, ad, 2.5 + BEAM[k] / 2 + 0.8), n_far, t)
                    bow = n_far if i % 2 == 0 else n_near
                    P.berth(k, c, bow, [r2(add(c, ad, 30)), r2(add(c, ad, BEAM[k] + 6)), r2(c)])
                    t += LOA[k] / 2 + 1.5
            P.tips[-1] = add(tip, ad, 4 + BEAM[th[0][0]])
            P.thead_half = half
        prev_far = (far, aw)
    return pos

def split(n, parts):
    return [n // parts + (1 if i < n % parts else 0) for i in range(parts)]

# ---------------------------------------------------------------- ETHEREUM: quay comb + Grand Pier
ETH = Pier('pier-ethereum', 'Ethereum', 'grand'); B = BERTHS['pier-ethereum']
def eth_specs():
    sp = []
    def two(k, n, arms):
        for part in split(n, arms):
            a, b = split(part, 2)
            sp.append(dict(pier=ETH, near=[(k, a)], far=[(k, b)]))
    two('skiff', B['skiff'], 1)
    two('boat', B['boat'], 1)
    two('small', B['small'], 3)
    two('medium', B['medium'], 2)
    a, b = split(B['large'], 2)
    sp.append(dict(pier=ETH, kind='grand', width=GRAND_W, near=[('large', a)], far=[('large', b)], minlen=120,
                   thead=[('flagship', B['flagship'])]))
    return sp
ETH_END = quay_comb(VERT, NZ, NX, 14.0, eth_specs())
ETH.gate = add(ETH.tips[-1], NX, 26)
piers.append(ETH)

# ---------------------------------------------------------------- the other seven
def pier_specs(P, arms, big_on='thead'):
    """Distribute a small pier's classes over `arms` arms: flagship/large on a T-head of the first arm,
    medium..skiff split over the arm faces, larger classes nearer the tips."""
    Bp = dict(BERTHS[P.id]); sp = []
    th = [(k, Bp[k]) for k in ('flagship',) if Bp[k]]
    faces = [[] for _ in range(2 * arms)]
    if Bp['large']:
        for i, part in enumerate(split(Bp['large'], 2)):
            if part: faces[i].append(('large', part))
    for k in ('medium', 'small', 'boat', 'skiff'):
        if not Bp[k]: continue
        # keep one class per face where possible: give each class whole faces when it is big enough
        lens = [side_len(f) for f in faces]
        if Bp[k] >= 12:
            order = sorted(range(len(faces)), key=lambda i: lens[i])[:2]
            for i, part in zip(order, split(Bp[k], 2)): faces[i].append((k, part))
        else:
            i = min(range(len(faces)), key=lambda i: lens[i]); faces[i].append((k, Bp[k]))
    for a in range(arms):
        d = dict(pier=P, near=faces[2 * a], far=faces[2 * a + 1])
        if a == 0 and th: d['thead'] = th
        sp.append(d)
    return sp

SOL = Pier('pier-solana', 'Solana', 'pontoon'); BSC = Pier('pier-bsc', 'BSC', 'pontoon')
BASE = Pier('pier-base', 'Base', 'pontoon'); ARB = Pier('pier-arbitrum', 'Arbitrum', 'pontoon')
POLY = Pier('pier-polygon', 'Polygon', 'pontoon'); HYP = Pier('pier-hyperliquid-l1', 'Hyperliquid L1', 'pontoon')
TRON = Pier('pier-tron', 'Tron', 'deepwater-quay')

# West quay (screen up-left from the square): arms run north (screen up-right)
west_specs = []
for P, n in ((BSC, 1), (SOL, 2), (BASE, 1), (ARB, 1)):
    west_specs += pier_specs(P, n)
quay_comb(VERT, NX, NZ, 162.0, west_specs, uniform=True)

# Right bowl: Polygon and Hyperliquid, single arms running west (screen up-left) off the right shore
quay_comb(W(214, -118), NZ, NX, 0.0, pier_specs(POLY, 1))

# TRON and HYPERLIQUID: deepwater berths on the inner faces of the breakwater (under the Pharos) and the
# mole (by the Customs House). Big hulls lie alongside; small craft moor bow-in to the stone face.
def quay_face(P, a, b, toward, content, width=QUAY_W):
    d = nrm(sub(b, a)); n = perp(d)
    if dot(n, sub(toward, a)) < 0: n = mul(n, -1)
    L = math.hypot(*sub(b, a))
    need = side_len(content) + 4
    assert need <= L, (P.id, 'quay face too short', need, L)
    place_side(P, add(a, d, (L - need) / 2), d, need + (L - need) / 2, width, n, content, add(add(a, n, 40), d, L / 2))
    P.gate = add(add(a, d, L / 2), n, 34)
    P.face = (a, b, n)
def content_of(pid):
    Bp = BERTHS[pid]
    return [(k, Bp[k]) for k in CLASSES if Bp[k]]
BREAKWATER_UV = [(-122, -232), (-76, -230), (-6, -224)]
MOLE_UV = [(146, -220), (110, -222), (66, -222)]
TRON.seg('breakwater', W(*BREAKWATER_UV[0]), W(*BREAKWATER_UV[-1]), QUAY_W)
quay_face(TRON, W(*BREAKWATER_UV[0]), W(*BREAKWATER_UV[-1]), W(0, 0), content_of('pier-tron'))
HYP.kind = 'deepwater-quay'
HYP.seg('mole', W(*MOLE_UV[0]), W(*MOLE_UV[-1]), QUAY_W)
quay_face(HYP, W(*MOLE_UV[0]), W(*MOLE_UV[-1]), W(0, 0), content_of('pier-hyperliquid-l1'))
for P in (BSC, SOL, BASE, ARB, POLY):
    P.gate = add(P.tips[0], (NZ if P in (BSC, SOL, BASE, ARB) else NX), 22)
piers += [TRON, SOL, BSC, BASE, ARB, POLY, HYP]

# ------------------------------------------------------------------ zones
def ring(center, rx, ry, n, phase=0.0):
    return [W(center[0] + rx * math.cos(phase + 2 * math.pi * i / n), center[1] + ry * math.sin(phase + 2 * math.pi * i / n)) for i in range(n)]

def grid_slots(origin_uv, cols, rows, du, dv, jitter=0.0, seed=1):
    import random
    rnd = random.Random(seed); out = []
    for r in range(rows):
        for c in range(cols):
            out.append(W(origin_uv[0] + c * du + rnd.uniform(-jitter, jitter) + (du / 2 if r % 2 else 0),
                         origin_uv[1] + r * dv + rnd.uniform(-jitter, jitter)))
    return out

SHOALS_C = (10, -300)
shoals_poly = ring(SHOALS_C, 70, 26, 14)
shoals_slots = [W(SHOALS_C[0] + 62 * math.cos(a) * (0.55 + 0.45 * (i % 2)), SHOALS_C[1] + 22 * math.sin(a) * (0.55 + 0.45 * (i % 2)))
                for i, a in enumerate([2 * math.pi * j / 32 for j in range(32)])]

# Far Ports: rafted rows on mooring lines outside the right arm (top right, beyond the mole).
# Each line runs north (screen up-right); hulls lie east-west rafted abreast; lines step east.
FAR_ORIGIN = (112, -300)
FAR_LINE = 64.0
far_slots = []
def far_rows():
    """Rafted rows: each mooring line runs east (screen down-right); hulls lie north-south, sterns to
    the line, rafted abreast; successive lines step north (screen up-right), away from the island."""
    B = dict(BERTHS['far']); rows = []
    cur = W(*FAR_ORIGIN)
    groups = [['flagship', 'large'], ['medium'], ['small'], ['boat'], ['skiff']]
    for g in groups:
        queue = [k for k in g for _ in range(B[k])]
        while queue:
            used, pts = 0.0, []
            while queue and used + BEAM[queue[0]] + 0.35 <= FAR_LINE:
                k = queue.pop(0)
                c = add(add(cur, EX, used + BEAM[k] / 2), NZ, LOA[k] / 2)
                pts.append((k, c)); used += BEAM[k] + 0.35
            depth = max(LOA[k] for k, _ in pts)
            rows.append(dict(cls=g[0], line=[r2(cur), r2(add(cur, EX, used))], slots=pts))
            cur = add(cur, NZ, depth + 6.0)
            if len(rows) % 3 == 0:          # a new raft: open water between rafts, staggered
                cur = add(add(cur, NZ, 16.0), EX, 14.0 if (len(rows) // 3) % 2 else -14.0)
    return rows
FAR_ROWS = far_rows()
for r in FAR_ROWS:
    for k, c in r['slots']:
        far_slots.append((k, c)); hull_rects.append(('far', rect(c, EZ, LOA[k], BEAM[k])))
far_pts = [c for _, c in far_slots]
xs, zs = [p[0] for p in far_pts], [p[1] for p in far_pts]
far_poly = [(min(xs) - 8, min(zs) - 8), (max(xs) + 8, min(zs) - 8), (max(xs) + 8, max(zs) + 8), (min(xs) - 8, max(zs) + 8)]

# Wreck Cove: beach in the back-left cove, hulks sized by peak cap
WRECK_C = (-258, -214)
dead = json.load(open(os.path.join(HERE, '../../../../shared/data/dead-stablecoins.json')))
wreck_slots = []
import random
_rnd = random.Random(7)
for i, dco in enumerate(sorted(dead, key=lambda d: -(d.get('peakMcap') or 0))):
    a = 2.39996 * i; r = 3.2 * math.sqrt(i + 1)
    u, v = WRECK_C[0] + r * math.cos(a) * 1.1, WRECK_C[1] + r * math.sin(a) * 0.8
    pk = dco.get('peakMcap') or 0
    k = 'flagship' if pk >= 1e10 else 'large' if pk >= 1e9 else 'medium' if pk >= 1e8 else 'small' if pk >= 1e7 else 'boat' if pk >= 1e6 else 'skiff'
    wreck_slots.append(dict(id=dco['id'], cls=k, position=W(u, v), heading=_rnd.uniform(0, 2 * math.pi)))
wreck_poly = ring(WRECK_C, 40, 32, 16)

SLIPWAY = dict(a=add(VERT, NX, 130), b=add(add(VERT, NX, 130), NZ, 24))
skiff_basins = []
for P in piers:
    pts = [b['position'] for b in P.berths if b['cls'] == 'skiff']
    if pts:
        xs, zs = [p[0] for p in pts], [p[1] for p in pts]
        skiff_basins.append(dict(pier=P.id, polygon=[r2(p) for p in [(min(xs) - 4, min(zs) - 4), (max(xs) + 4, min(zs) - 4),
                                                                  (max(xs) + 4, max(zs) + 4), (min(xs) - 4, max(zs) + 4)]],
                                 slots=[b['id'] for b in P.berths if b['cls'] == 'skiff']))

# ------------------------------------------------------------------ landmarks
LM = [
    ('pharos', 'The Pharos', (-138, -250), 16, 8.0),
    ('keepers-cottage', "Keeper's Cottage", (-190, -226), 14, 7.0),
    ('breakwater', 'Breakwater', (-70, -228), 80, 2.5),
    ('mole', 'The Mole', (100, -222), 84, 2.5),
    ('storm-mast', 'Storm-signal Mast', (60, -222), 6, 2.5),
    ('customs-house', 'Customs House', (202, -206), 24, 6.0),
    ('tide-board', 'Tide Board', (176, -192), 14, 3.0),
    ('harbourmaster', "Harbourmaster's Office", (-26, 186), 20, 3.0),
    ('registry', 'The Registry', (30, 190), 22, 3.0),
    ('tide-gauge', 'Tide Gauge', (0, 166), 4, 2.2),
    ('keepers-log', "Keeper's Log", (214, 236), 14, 8.0),
    ('slipway', 'The Slipway', UV(*add(VERT, NX, 130)), 10, 2.0),
]
def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

def terrain_h(u, v, p=None):
    """Ground height above sea, authored in (u, v): quay level along the bay, an amphitheatre hill town
    rising away from the water (terraced in 3 m steps), cliffs on the outer coast, the Pharos knoll."""
    p = p or W(u, v)
    if not inside(p, ISLAND) or inside(p, BAY): return 0.0
    d_bay = poly_dist(p, BAY); d_sea = poly_dist(p, ISLAND)
    h = 2.3 + 38.0 * smooth(16, 200, d_bay) * (0.55 + 0.45 * smooth(-60, 160, v))
    if h > 5: h = 5 + round((h - 5) / 4.0) * 4.0 * 0.85 + (h - 5) * 0.15     # terraces
    h *= 0.35 + 0.65 * smooth(0, 22, d_sea)                                   # coastal cliff edge
    hp = math.exp(-(((u + 146) / 58) ** 2 + ((v + 244) / 44) ** 2))          # Pharos knoll
    h = h * (1 - hp) + 28.0 * hp
    wc = math.exp(-(((u + 262) / 46) ** 2 + ((v + 214) / 40) ** 2))           # Wreck Cove beach
    h = h * (1 - wc) + 1.0 * wc
    return h

landmarks = [dict(id=i, name=n, position=r3(W(*uv), terrain_h(*uv) if i not in ('breakwater', 'mole', 'storm-mast') else 2.5),
                  footprint=fp) for i, n, uv, fp, _ in LM]

# ------------------------------------------------------------------ lane graph (one-way)
nodes, edges = {}, []
def node(nid, p): nodes[nid] = p; return nid
def chain_edges(ids, closed=False):
    for a, b in zip(ids, ids[1:] + ([ids[0]] if closed else [])):
        edges.append((a, b))

# Bay loop: one clockwise loop (on screen). From the mouth it visits the right-bowl pocket, rounds the
# Grand Pier T-head, runs down the Ethereum Row (the fairway along the Ethereum arm tips), turns at
# the slipway, returns up the BSC side, follows the west pier heads past Tron and closes at the mouth.
eth_tips = ETH.tips[:-1]                     # arm tips from the square outward (grand pier excluded)
g_tip = ETH.tips[-1]                          # beyond the T-head's outer face (x) on the grand centreline (z)
gx, gz = g_tip[0], g_tip[1]
TH_HALF = ETH.thead_half
poly_z = POLY.root[1]
pk_in, pk_out = poly_z + 16.0, gz - TH_HALF - 12.0        # pocket lanes (world z), between Polygon and the T-head end
shore_x = Q_RIGHT_END[0] - 30.0
row_dn = [add(t, NX, 10) for t in reversed(eth_tips)]
bsc_x = add(VERT, NX, 162)[0]
row_up = [(bsc_x + 26, add(VERT, NX, 130)[1] - 40), (bsc_x + 24, BSC.tips[0][1] - 24)]
west_piers = [SOL, BASE, ARB]
west = [add(t, NZ, 20) for P in west_piers for t in P.tips]
MOUTH_IN = W(30, -196)
LOOP = ([MOUTH_IN, W(84, -182), W(134, -168), W(196, -104), W(168, -92), (gx + 14, gz - TH_HALF - 14),
         (gx - 24, gz - TH_HALF - 10), (gx - 26, gz + TH_HALF + 8), add(eth_tips[-1], NX, 18)] +
        row_dn[1:] + [add(add(VERT, NX, 104), NZ, 12)] + row_up + west + [W(-206, -150), W(-112, -184)])
loop_ids = [node(f'loop-{i:02d}', p) for i, p in enumerate(LOOP)]
chain_edges(loop_ids, closed=True)
# Cross-bay chord: from the Grand Pier T-head straight across the open bay to the west pier heads, so
# big hulls (and anyone bound west) never thread the dead-end Ethereum Row. It lies inside the loop,
# so it meets the loop only at its two ends (no crossings).
_t_dl = LOOP.index((gx - 26, gz + TH_HALF + 8))
_w_hi = len(LOOP) - 2 - len(west) - 1      # top of the BSC side, where the west pier heads begin
edges.append((loop_ids[_t_dl], loop_ids[_w_hi]))
# Mouth: inbound on the right of the channel, outbound on the left
mo_in = [node('mouth-in-0', W(44, -258)), node('mouth-in-1', W(40, -222))]
mo_out = [node('mouth-out-0', W(12, -212)), node('mouth-out-1', W(8, -256))]
edges += [(mo_in[0], mo_in[1]), (mo_in[1], 'loop-00'), (loop_ids[-1], mo_out[0]), (mo_out[0], mo_out[1])]
# Outer passage: a clockwise loop outside the mouth linking the Shoals and the Far Ports
outer = [node('outer-00', W(-30, -292)), node('outer-01', W(-90, -330)), node('outer-02', W(10, -380)),
         node('outer-03', W(80, -372)), node('outer-04', W(76, -312)), node('outer-05', W(56, -284))]
edges += [(mo_out[1], 'outer-00'), ('outer-00', 'outer-01'), ('outer-01', 'outer-02'), ('outer-02', 'outer-03'),
          ('outer-03', 'outer-04'), ('outer-04', 'outer-05'), ('outer-05', mo_in[0])]
node('gate-in:far', W(96, -366)); node('gate-out:far', W(92, -322))
edges += [('outer-03', 'gate-in:far'), ('gate-out:far', 'outer-04')]
node('gate-in:shoals', W(-60, -320)); node('gate-out:shoals', W(60, -330))
edges += [('outer-01', 'gate-in:shoals'), ('gate-out:shoals', 'outer-03')]

def nearest_loop(p, exclude=()):
    return min((i for i in loop_ids if i not in exclude), key=lambda i: math.hypot(*sub(nodes[i], p)))
def seg_clear(a, b):
    steps = max(2, int(math.hypot(*sub(b, a)) / 1.5))
    pts = [add(a, sub(b, a), i / steps) for i in range(steps + 1)]
    for st in structures:
        if any(inside(p, st['poly']) for p in pts): return False
    for bid, R in hull_rects:
        if any(inside(p, R) for p in pts): return False
    return all(is_water(p) for p in pts)
for P in piers:
    g = P.gate
    gi = node(f'gate-in:{P.id}', add(g, (3, 3)))
    go = node(f'gate-out:{P.id}', add(g, (-3, -3)))
    j = loop_ids.index(nearest_loop(g)); n = len(loop_ids)
    src = next((loop_ids[(j - d) % n] for d in range(0, 4) if seg_clear(nodes[loop_ids[(j - d) % n]], nodes[gi])), loop_ids[j])
    dst = next((loop_ids[(j + d) % n] for d in range(1, 5) if seg_clear(nodes[go], nodes[loop_ids[(j + d) % n]])), loop_ids[(j + 1) % n])
    edges += [(src, gi), (go, dst)]

# per-berth gate: the loop node where the berth's approach polyline begins
for P in piers:
    for b in P.berths:
        g = nearest_loop(tuple(b['approach'][0]))
        b['gate'] = g
        b['approach'] = [r2(nodes[g])] + b['approach']

def build_graph():
    g = defaultdict(list)
    for a, b in edges:
        g[a].append((b, math.hypot(*sub(nodes[b], nodes[a]))))
    return g
GRAPH = build_graph()

def route(a, b):
    dist = {a: 0.0}; prev = {}; pq = [(0.0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == b: break
        if d > dist.get(u, 1e18): continue
        for v, w in GRAPH[u]:
            nd = d + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    if b not in dist: return None, None
    path = [b]
    while path[-1] != a: path.append(prev[path[-1]])
    return [nodes[i] for i in reversed(path)], dist[b]

def where_gates(w):
    if w == 'far': return 'gate-in:far', 'gate-out:far'
    return f'gate-in:{w}', f'gate-out:{w}'

# ------------------------------------------------------------------ representative instant
pier_by_id = {P.id: P for P in piers}
free = {P.id: defaultdict(list) for P in piers}
for P in piers:
    for b in P.berths:
        free[P.id][b['cls']].append(b)
far_free = defaultdict(list)
for k, c in far_slots: far_free[k].append(c)
for k in far_free: far_free[k].reverse()

def take_berth(where, k):
    """First free berth of class k (or the nearest larger class) at `where`."""
    ladder = CLASSES[CLASSES.index(k)::-1]
    for kk in [k] + [c for c in ladder if c != k]:
        if where == 'far':
            if far_free[kk]: return dict(position=far_free[kk].pop(), heading=heading_of(EZ), berth=None, cls=kk)
        elif free[where][kk]:
            b = free[where][kk].pop(0); return dict(position=b['position'], heading=b['heading'], berth=b['id'], cls=kk)
    raise RuntimeError(f'no berth for {k} at {where}')

boats_out, leg_lengths = [], []
rnd = random.Random(3)
shoal_i = 0
for b in OCC['boats']:
    k = b['cls']
    if b['zone'] == 'shoals':
        p = shoals_slots[shoal_i]; shoal_i += 1
        boats_out.append(dict(id=b['id'], symbol=b['symbol'], cls=k, rig=b['rig'], state='shoals', position=p,
                              heading=rnd.uniform(0, 6.28), heel=0.3)); continue
    if b['state'] == 'dock':
        bb = take_berth(b['at'], k)
        boats_out.append(dict(id=b['id'], symbol=b['symbol'], cls=k, rig=b['rig'], state='docked', at=b['at'],
                              berth=bb['berth'], position=bb['position'], heading=bb['heading']))
    else:
        a, c = b['leg']
        path, L = route(where_gates(a)[1], where_gates(c)[0])
        leg_lengths.append(L)
        # position along the path at progress
        s = b['progress'] * L; acc = 0.0; pos, hd = path[0], 0.0
        for p0, p1 in zip(path, path[1:]):
            seg = math.hypot(*sub(p1, p0))
            if acc + seg >= s:
                t = (s - acc) / max(seg, 1e-9); pos = add(p0, sub(p1, p0), t); hd = heading_of(nrm(sub(p1, p0))); break
            acc += seg
        boats_out.append(dict(id=b['id'], symbol=b['symbol'], cls=k, rig=b['rig'], state='sailing', leg=[a, c],
                              position=pos, heading=hd, progress=b['progress']))

# all-pairs leg lengths (for the leg-time check)
all_legs = {}
wheres = [P.id for P in piers] + ['far']
for a in wheres:
    for c in wheres:
        if a != c:
            path, L = route(where_gates(a)[1], where_gates(c)[0])
            all_legs[f'{a}->{c}'] = round(L, 1) if L else None

# ------------------------------------------------------------------ cameras
def cam(target, dist, pitch=35.0, yaw=45.0, fov=25.0, y=0.0):
    return dict(target=r3(target, y), distance=dist, fovDeg=fov, pitchDeg=pitch, yawDeg=yaw)

def centroid(pts):
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

CAM = dict(overview=cam(W(-8, -6), 720.0))
for P in piers:
    pts = [b['position'] for b in P.berths]
    span = max(math.hypot(*sub(p, q)) for p in pts for q in pts[:: max(1, len(pts) // 20)]) if len(pts) > 1 else 40
    c = centroid(pts); c = add(c, sub(W(0, -60), c), 0.12)          # lean toward open water
    CAM[f'harbour:{P.id}'] = cam(c, max(170.0, min(400.0, span * 1.25)))
eth_flag = [b for b in pier_by_id['pier-ethereum'].berths if b['cls'] == 'medium'][4]
CAM['close'] = cam(eth_flag['position'], 75.0, pitch=30.0)

# ------------------------------------------------------------------ checks
def sat_overlap(A, Bq):
    for poly in (A, Bq):
        for i in range(4):
            e = sub(poly[(i + 1) % 4], poly[i]); ax = perp(e)
            pa = [dot(p, ax) for p in A]; pb = [dot(p, ax) for p in Bq]
            if max(pa) <= min(pb) or max(pb) <= min(pa): return False
    return True

def checks():
    issues = []
    cell = defaultdict(list)
    for bid, R in hull_rects:
        cx, cz = centroid(R)
        cell[(int(cx // 20), int(cz // 20))].append((bid, R))
        for p in R:
            if not is_water(p): issues.append(f'hull on land: {bid}'); break
    seen = 0
    for (cx, cz), items in cell.items():
        neigh = []
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                neigh += cell.get((cx + dx, cz + dz), [])
        for i, (b1, R1) in enumerate(items):
            for b2, R2 in neigh:
                if b1 < b2 and sat_overlap(R1, R2):
                    issues.append(f'overlap {b1} {b2}'); seen += 1
    def seg_hits_poly(a, b, poly):
        steps = max(2, int(math.hypot(*sub(b, a)) / 1.5))
        for i in range(steps + 1):
            p = add(a, sub(b, a), i / steps)
            if inside(p, poly): return True
        return False
    for a, b in edges:
        pa, pb = nodes[a], nodes[b]
        for st in structures:
            if seg_hits_poly(pa, pb, st['poly']): issues.append(f'lane {a}->{b} crosses {st["pier"]}:{st["kind"]}'); break
        else:
            for bid, R in hull_rects:
                if seg_hits_poly(pa, pb, R): issues.append(f'lane {a}->{b} crosses hull {bid}'); break
        steps = max(2, int(math.hypot(*sub(pb, pa)) / 4))
        if any(not is_water(add(pa, sub(pb, pa), i / steps)) for i in range(steps + 1)):
            issues.append(f'lane {a}->{b} crosses land')
    return issues

# ------------------------------------------------------------------ export
def export():
    issues = checks()
    xs = [p[0] for p in ISLAND] + [p[0] for p in far_poly] + [p[0] for p in shoals_poly]
    zs = [p[1] for p in ISLAND] + [p[1] for p in far_poly] + [p[1] for p in shoals_poly]
    layout = dict(
        units='m', axes='glTF Y-up: x east (screen down-right at yaw 45), y up, z south (toward viewer); '
                    'headingRad h: bow along (sin h, 0, cos h)',
        seaLevel=0.0, deckY=DECK_Y,
        bounds=dict(min=[round(min(xs) - 40, 1), -6.0, round(min(zs) - 40, 1)], max=[round(max(xs) + 40, 1), 60.0, round(max(zs) + 40, 1)]),
        camera=dict(presets=CAM, panClamp=dict(min=r2((min(xs), min(zs))), max=r2((max(xs), max(zs))))),
        hull=dict(classes=CLASSES, loa=LOA, beam=BEAM, mastAboveDeck=MAST, mooring=MOOR),
        island=dict(coast=[r2(p) for p in ISLAND], bay=[r2(p) for p in BAY],
                    breakwater=[r2(W(*p)) for p in BREAKWATER_UV], mole=[r2(W(*p)) for p in MOLE_UV]),
        piers=[dict(id=P.id, chain=P.chain, kind=P.kind, gate=r2(P.gate), segments=P.segments,
                    berths=[dict(id=b['id'], **{'class': b['cls']}, position=r3(b['position'], DECK_Y * 0 + 0.0),
                                 headingRad=round(b['heading'], 4), gate=b['gate'], approach=b['approach']) for b in P.berths],
                    berthCounts=dict(Counter(b['cls'] for b in P.berths))) for P in piers],
        lanes=dict(oneWay=True, nodes=[dict(id=i, position=r3(p)) for i, p in nodes.items()],
                   edges=[dict(**{'from': a, 'to': b}) for a, b in edges]),
        landmarks=landmarks,
        zones=dict(
            shoals=dict(polygon=[r2(p) for p in shoals_poly], slots=[r3(p) for p in shoals_slots]),
            wreckCove=dict(polygon=[r2(p) for p in wreck_poly],
                           slots=[dict(id=w['id'], **{'class': w['cls']}, position=r3(w['position']), headingRad=round(w['heading'], 3)) for w in wreck_slots]),
            slipway=dict(polygon=[r2(p) for p in rect(mul(add(SLIPWAY['a'], SLIPWAY['b']), 0.5), nrm(sub(SLIPWAY['b'], SLIPWAY['a'])), 30, 8)],
                         slots=[r3(SLIPWAY['b'])], launchPath=[r2(SLIPWAY['a']), r2(SLIPWAY['b']), r2(add(SLIPWAY['b'], NZ, 60))]),
            farPorts=dict(polygon=[r2(p) for p in far_poly], rows=[dict(cls=r['cls'], line=r['line'], slots=[r3(c) for _, c in r['slots']]) for r in FAR_ROWS]),
            skiffBasins=skiff_basins,
        ),
    )
    scene = dict(boats=[dict(b, position=r3(b['position']), heading=round(b['heading'], 4)) for b in boats_out],
                 wrecks=[dict(w, position=r3(w['position'])) for w in wreck_slots],
                 structures=[dict(kind=s['kind'], pier=s['pier'], poly=[r2(p) for p in s['poly']], y=s['y']) for s in structures],
                 legLengths=all_legs, issues=issues)
    json.dump(layout, open(os.path.join(HERE, 'layout.json'), 'w'), indent=1)
    json.dump(scene, open(os.path.join(HERE, 'scene.json'), 'w'))
    return layout, scene, issues

# ------------------------------------------------------------------ plan view (PIL, screen-aligned)
CLS_RGB = dict(flagship=(255, 196, 40), large=(230, 70, 50), medium=(60, 120, 230), small=(60, 180, 90),
               boat=(170, 90, 200), skiff=(245, 245, 245))
def plan(path, scale=1.6, box=(-360, -400, 360, 380), labels=False):
    from PIL import Image, ImageDraw
    U0, V0, U1, V1 = box
    Wd, Ht = int((U1 - U0) * scale), int((V1 - V0) * scale)
    im = Image.new('RGB', (Wd, Ht), (28, 70, 88)); dr = ImageDraw.Draw(im)
    def S(p):
        u, v = UV(*p); return ((u - U0) * scale, (v - V0) * scale)
    dr.polygon([S(p) for p in ISLAND], fill=(196, 186, 160))
    dr.polygon([S(p) for p in BAY], fill=(40, 96, 116))
    for poly in (shoals_poly, wreck_poly, far_poly):
        dr.polygon([S(p) for p in poly], outline=(255, 255, 255))
    for line in (BREAKWATER_UV, MOLE_UV):
        dr.line([S(W(*p)) for p in line], fill=(120, 120, 120), width=int(6 * scale))
    for s in structures:
        dr.polygon([S(p) for p in s['poly']], fill=(150, 110, 70) if s['kind'] != 'grand' else (170, 160, 150))
    for a, b in edges:
        dr.line([S(nodes[a]), S(nodes[b])], fill=(120, 200, 255), width=1)
    for b in boats_out:
        R = rect(b['position'], (math.sin(b['heading']), math.cos(b['heading'])), LOA[b['cls']], BEAM[b['cls']])
        dr.polygon([S(p) for p in R], fill=CLS_RGB[b['cls']] if b['state'] != 'sailing' else (255, 60, 200))
    for w in wreck_slots:
        R = rect(w['position'], (math.sin(w['heading']), math.cos(w['heading'])), LOA[w['cls']] * 0.8, BEAM[w['cls']])
        dr.polygon([S(p) for p in R], fill=(90, 90, 90))
    for l in landmarks:
        x, y = S((l['position'][0], l['position'][2]))
        r = l['footprint'] * scale / 2
        dr.rectangle([x - r, y - r, x + r, y + r], outline=(200, 40, 40), width=2)
    if labels:
        for g in range(-400, 401, 50):
            x = (g - U0) * scale; y = (g - V0) * scale
            dr.line([(x, 0), (x, Ht)], fill=(70, 70, 70)); dr.line([(0, y), (Wd, y)], fill=(70, 70, 70))
            dr.text((x + 2, 2), str(g), fill=(255, 255, 0)); dr.text((2, y + 2), str(g), fill=(255, 255, 0))
        for i, p in nodes.items():
            x, y = S(p); dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 0))
            dr.text((x + 4, y - 4), i.replace('loop-', 'L').replace('gate-', 'g').replace('pier-', ''), fill=(255, 255, 160))
    im.save(path)

if __name__ == '__main__':
    layout, scene, issues = export()
    plan(os.path.join(HERE, 'plan.png'))
    plan(os.path.join(HERE, 'plan-bay.png'), scale=3.0, box=(-250, -280, 250, 180), labels=True)
    bc = Counter(); [bc.update(p['berthCounts']) for p in layout['piers']]
    print('berths', sum(bc.values()), dict(bc), ' far slots', len(far_slots))
    print('boats', Counter(b['state'] for b in boats_out))
    print('issues', len(issues), issues[:12])
    ll = [v for v in all_legs.values() if v]
    print('legs m: min %.0f mean %.0f max %.0f' % (min(ll), sum(ll) / len(ll), max(ll)))
