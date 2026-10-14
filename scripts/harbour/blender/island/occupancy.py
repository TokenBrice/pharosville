#!/usr/bin/env python3
"""PharosVille harbour occupancy model (copied from the P1 grey-box; v2 reads lane legs from legs.json).

Reads the live snapshot (outputs/harbour/data/*.json) and computes, per D10:
  hull class, rig family, circuit stops, dwell, expected + p95 docked occupancy
  per pier per class, boats under way, dockings per minute, and one
  representative instant used by build_greybox.py.

Usage: python3 occupancy.py [--root <worktree>] [--out occupancy.json] [--t <unix>]
Pure stdlib; deterministic (FNV-1a hash of coin id + UTC).
"""
import argparse, json, math, os, sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--root', default=os.path.abspath(os.path.join(HERE, '../../../..')))
ap.add_argument('--out', default=os.path.abspath(os.path.join(HERE, '../../../../outputs/harbour/island/occupancy.json')))
ap.add_argument('--legs', default=os.path.join(HERE, 'legs.json'), help='{legLengths: {a->b: metres}} from compose.py')
ap.add_argument('--t', type=float, default=None, help='representative instant (unix s)')
args = ap.parse_args()

DATA = os.path.join(args.root, 'outputs/harbour/data')
coins = json.load(open(os.path.join(DATA, 'stablecoins.json')))['peggedAssets']
meta = json.load(open(os.path.join(DATA, 'stablecoins.json')))['_meta']
peg = json.load(open(os.path.join(DATA, 'peg-summary.json')))
dead_path = os.path.join(args.root, 'shared/data/dead-stablecoins.json')
dead = json.load(open(dead_path)) if os.path.exists(dead_path) else []

# ------------------------------------------------------------------ tuning (calm, not data)
CLASSES = ['flagship', 'large', 'medium', 'small', 'boat', 'skiff']
LOA = dict(flagship=30, large=18, medium=13, small=10, boat=7.5, skiff=5)
PERIOD_MIN = dict(flagship=25, large=30, medium=40, small=60, boat=60, skiff=60)
# Leg time = lane distance / class speed. Little's law: under way = dockings/min x mean leg (min),
# so 25-40 under way at 4-8 dockings/min needs ~4-5 min legs, not 40-90 s. Lanes are one-way loops
# round the bay (~250-450 m) and Far Ports legs exit the mouth; speeds 1.2-1.8 m/s give these ranges.
LEG_S = dict(flagship=(150, 240), large=(180, 300), medium=(200, 330), small=(200, 330),
             boat=(200, 330), skiff=(200, 330))
# When scene.json (written by layout_core) exists, leg times come from the authored lane graph:
# leg = lane distance / class speed + MANOEUVRE_S (unberthing + berthing). Speeds are calm (5-6 kn).
SPEED = dict(flagship=2.4, large=2.7, medium=3.0, small=3.0, boat=2.8, skiff=2.6)    # m/s (4.7-5.8 kn)
MANOEUVRE_S = 40.0
_scene = args.legs
LANE_M = json.load(open(_scene)).get('legLengths', {}) if os.path.exists(_scene) else {}
MAX_SAIL_FRAC = 0.30       # flagship USDC (5 stops) stretches to ~50 min; most circuits keep the class period
MIN_STOP = 0.05             # a stop below 5 % share is folded into the others (dwell < ~1.5 min)
MAX_PIER_STOPS = 4
N_PIERS = 8
HEADROOM = 1.2

def hull_class(usd):
    return ('flagship' if usd >= 1e10 else 'large' if usd >= 1e9 else 'medium' if usd >= 1e8
            else 'small' if usd >= 1e7 else 'boat' if usd >= 1e6 else 'skiff')

def rig(peg_type):
    p = peg_type.replace('pegged', '')
    if p == 'USD': return 'usd'
    if p == 'EUR': return 'eur'
    if p in ('GOLD', 'SILVER'): return 'gold'
    if p == 'VAR': return 'other'
    return 'fiat'

def fnv(s):
    h = 0x811c9dc5
    for ch in s.encode():
        h = ((h ^ ch) * 0x01000193) & 0xffffffff
    return h

def u01(s):
    return fnv(s) / 2**32

# ------------------------------------------------------------------ chains -> piers
chain_tot = Counter()
for a in coins:
    for c, v in (a.get('chainCirculating') or {}).items():
        chain_tot[c] += (v or {}).get('current') or 0
grand = sum(chain_tot.values())
pier_chains = [c for c, _ in chain_tot.most_common(N_PIERS)]
PIER_ID = {c: 'pier-' + c.lower().replace(' ', '-').replace('l1', 'l1') for c in pier_chains}

depeg_ids = {c['id'] for c in peg['coins'] if c.get('activeDepeg')}

# ------------------------------------------------------------------ coins -> circuits
boats = []
for a in coins:
    usd = sum(a['circulating'].values())
    k = hull_class(usd)
    cc = {c: (v or {}).get('current') or 0 for c, v in (a.get('chainCirculating') or {}).items()}
    cc = {c: v for c, v in cc.items() if v > 0}
    tot = max(usd, sum(cc.values()))
    b = dict(id=a['id'], symbol=a['symbol'], usd=usd, cls=k, rig=rig(a['pegType']),
             nChains=len(cc))
    if a['id'] in depeg_ids:
        b.update(zone='shoals', stops=[], static=True)
        boats.append(b); continue
    if not cc:      # no chain breakdown (zero supply etc.): home = first listed chain
        home = next((c for c in (a.get('chains') or []) if c in PIER_ID), None)
        b.update(zone='pier' if home else 'farPorts', stops=[(PIER_ID[home] if home else 'far', 1.0)], static=True)
        boats.append(b); continue
    shares = {c: v / tot for c, v in cc.items()}
    pier_sh = sorted(((PIER_ID[c], s) for c, s in shares.items() if c in PIER_ID), key=lambda x: -x[1])
    kept = [p for p in pier_sh[:MAX_PIER_STOPS] if p[1] >= MIN_STOP]
    far = 1.0 - sum(s for _, s in kept)
    cand = kept + ([('far', far)] if far >= MIN_STOP else [])
    if not cand:    # every share tiny: dock at the largest one
        cand = [pier_sh[0]] if pier_sh else [('far', 1.0)]
    z = sum(s for _, s in cand)
    stops = [(p, s / z) for p, s in cand]
    b.update(zone='pier' if any(p != 'far' for p, _ in stops) else 'farPorts',
             stops=stops, static=len(stops) == 1)
    boats.append(b)

def schedule(b):
    """Return (T seconds, list of segments [(kind, where, t0, t1)]) for a circuit boat."""
    n = len(b['stops'])
    lo, hi = LEG_S[b['cls']]
    legs = []
    for i in range(n):
        a, c = b['stops'][i][0], b['stops'][(i + 1) % n][0]
        L = LANE_M.get(f'{a}->{c}')
        if L:       # real lane-graph distance (from layout_core) at a calm class speed, plus manoeuvring
            legs.append(L / SPEED[b['cls']] + MANOEUVRE_S)
        else:
            legs.append(lo + (hi - lo) * u01(f"{b['id']}#leg{i}"))
    # a boat may spend at most MAX_SAIL_FRAC of its circuit under way: long circuits stretch the period
    T = max(PERIOD_MIN[b['cls']] * 60.0, sum(legs) / MAX_SAIL_FRAC)
    dock_time = T - sum(legs)
    segs, t = [], 0.0
    for i, (p, s) in enumerate(b['stops']):
        d = s * dock_time
        segs.append(('dock', p, t, t + d)); t += d
        nxt = b['stops'][(i + 1) % n][0]
        segs.append(('sail', (p, nxt), t, t + legs[i])); t += legs[i]
    return T, segs

def state_at(b, t):
    if b['static']:
        return ('dock', b['stops'][0][0] if b['stops'] else b['zone'], 0.0)
    T, segs = b['_sched']
    ph = (t + u01(b['id']) * T) % T
    for kind, where, a0, a1 in segs:
        if a0 <= ph < a1:
            return (kind, where, (ph - a0) / max(a1 - a0, 1e-9))
    kind, where, a0, a1 = segs[-1]
    return (kind, where, 1.0)

for b in boats:
    if not b['static']:
        b['_sched'] = schedule(b)

# ------------------------------------------------------------------ expected + p95 (Poisson-binomial)
def pb_quantile(ps, q):
    dist = [1.0]
    for p in ps:
        nd = [0.0] * (len(dist) + 1)
        for i, v in enumerate(dist):
            nd[i] += v * (1 - p); nd[i + 1] += v * p
        dist = nd
    c = 0.0
    for i, v in enumerate(dist):
        c += v
        if c >= q: return i
    return len(dist) - 1

where_ids = [PIER_ID[c] for c in pier_chains] + ['far']
prob = defaultdict(list)          # (where, cls) -> list of p
under_way_E = 0.0
dock_rate = 0.0                   # dockings per minute
for b in boats:
    if b['zone'] == 'shoals': continue
    if b['static']:
        prob[(b['stops'][0][0], b['cls'])].append(1.0); continue
    T, segs = b['_sched']
    for kind, where, a0, a1 in segs:
        if kind == 'dock': prob[(where, b['cls'])].append((a1 - a0) / T)
        else: under_way_E += (a1 - a0) / T
    dock_rate += len(b['stops']) / (T / 60.0)

# empirical over 24 h of the deterministic schedule (10 s steps)
t_base = args.t if args.t is not None else float(meta.get('updatedAt', 0))
emp_max = defaultdict(int); uw_series = []; dk_series = []
prev = {}
STEP = 10
for i in range(0, 86400, STEP):
    t = t_base + i
    occ = Counter(); uw = 0; dk = 0
    for b in boats:
        if b['zone'] == 'shoals': continue
        k, w, _ = state_at(b, t)
        if k == 'dock':
            occ[(w, b['cls'])] += 1
            if prev.get(b['id']) == 'sail': dk += 1
        else: uw += 1
        prev[b['id']] = k
    for key, v in occ.items(): emp_max[key] = max(emp_max[key], v)
    uw_series.append(uw); dk_series.append(dk)
dk_per_min = [sum(dk_series[j:j + 6]) for j in range(6, len(dk_series) - 6, 6)]

def pct(xs, q):
    s = sorted(xs); return s[min(len(s) - 1, int(q * len(s)))]

table = {}
for w in where_ids:
    row = {}
    for k in CLASSES:
        ps = prob.get((w, k), [])
        E = sum(ps)
        p95 = pb_quantile(ps, 0.95) if ps else 0
        mx = emp_max.get((w, k), 0)
        berths = max(math.ceil(E * HEADROOM - 1e-9), p95) if ps else 0      # rare excess -> overflow (T-head, quay wall, raft)
        row[k] = dict(visitors=len(ps), static=sum(1 for p in ps if p == 1.0), expected=round(E, 2),
                      p95=p95, max24h=mx, berths=berths)
    table[w] = row

# ------------------------------------------------------------------ representative instant
inst = []
for b in boats:
    k, w, f = state_at(b, t_base)
    inst.append(dict(id=b['id'], symbol=b['symbol'], cls=b['cls'], rig=b['rig'],
                     zone=b['zone'], static=b['static'], state=k,
                     at=w if k == 'dock' else None, leg=list(w) if k == 'sail' else None,
                     progress=round(f, 3), stops=[[p, round(s, 4)] for p, s in b['stops']]))

out = dict(
    snapshotAt=meta.get('updatedAt'), instant=t_base,
    tuning=dict(periodMin=PERIOD_MIN, maxSailFrac=MAX_SAIL_FRAC, legSeconds=LEG_S, speedMps=SPEED, manoeuvreS=MANOEUVRE_S, laneLegs=bool(LANE_M), minStop=MIN_STOP, maxPierStops=MAX_PIER_STOPS,
                headroom=HEADROOM, loa=LOA),
    piers=[dict(id=PIER_ID[c], chain=c, share=round(chain_tot[c] / grand, 4)) for c in pier_chains],
    farShare=round(1 - sum(chain_tot[c] for c in pier_chains) / grand, 4),
    classCounts=Counter(b['cls'] for b in boats),
    rigCounts=Counter(b['rig'] for b in boats),
    shoals=sorted(b['id'] for b in boats if b['zone'] == 'shoals'),
    shoalsByClass=Counter(b['cls'] for b in boats if b['zone'] == 'shoals'),
    wreckCove=len(dead),
    circuitBoats=sum(1 for b in boats if not b['static']),
    staticBoats=sum(1 for b in boats if b['static'] and b['zone'] != 'shoals'),
    underWay=dict(expected=round(under_way_E, 1), min=min(uw_series), p50=pct(uw_series, .5),
                  p95=pct(uw_series, .95), max=max(uw_series)),
    dockingsPerMin=dict(expected=round(dock_rate, 2), p50=pct(dk_per_min, .5), p95=pct(dk_per_min, .95),
                        min=min(dk_per_min), max=max(dk_per_min)),
    occupancy=table,
    boats=inst,
)
json.dump(out, open(args.out, 'w'), indent=1)

# ------------------------------------------------------------------ console report
print(f"piers: " + ', '.join(f"{c} {100*chain_tot[c]/grand:.1f}%" for c in pier_chains))
print(f"classes {dict(out['classCounts'])}  rigs {dict(out['rigCounts'])}")
print(f"circuit boats {out['circuitBoats']}  static {out['staticBoats']}  shoals {len(out['shoals'])} "
      f"{dict(out['shoalsByClass'])}  wrecks {out['wreckCove']}")
print(f"under way {out['underWay']}")
per = defaultdict(list)
for b in boats:
    if not b['static']: per[b['cls']].append(b['_sched'][0] / 60)
print('periods (min) per class: ' + ', '.join(f"{k} n={len(v)} med={sorted(v)[len(v)//2]:.0f} max={max(v):.0f}" for k, v in per.items()))
print(f"dockings/min {out['dockingsPerMin']}")
print(f"{'where':22s}" + ''.join(f"{k:>18s}" for k in CLASSES) + '   total(E/berths)')
for w in where_ids:
    r = table[w]
    print(f"{w:22s}" + ''.join(f"{r[k]['expected']:6.1f}/{r[k]['p95']:3d}/{r[k]['berths']:3d}   " for k in CLASSES)
          + f"  {sum(r[k]['expected'] for k in CLASSES):6.1f}/{sum(r[k]['berths'] for k in CLASSES)}")
st = Counter((b['state'], b['cls']) for b in inst)
print('instant:', {f"{s}:{k}": v for (s, k), v in sorted(st.items())})
