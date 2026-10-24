"""Export public/harbour/walkways.json for the decorative life layer (src/harbour/life).

Runs the island build's own land/town/dress stages (scripts/harbour/blender/island/build_island.py), so the walk
lines, stairs, benches and chimneys come from the same code that built island.glb; nothing is hand-typed.

    blender -b --factory-startup -P src/harbour/life/tools/export_walkways.py -- --stages land,town,dress

Output (glTF coords: x east, y up, z south; metres):
  paths     [{kind, w, pts:[[x,y,z]...]}]  quay promenades, terrace lanes, stairs, roads, footpaths, pier spines
  benches   [{p:[x,y,z], h}]               seat centre, h = facing heading (bow along (sin h, cos h))
  spots     [{kind, p, h}]                 'edge' = quay edge facing the water, 'square' = open square
  chimneys  [[x,y,z]]                      chimney tops
  flagpoles [{p:[x,y,z], h}]               bare poles/masts that may fly a decorative flag (top point)
  bunting   [{a, b, sag}]                  new strings the life layer hangs, lamp post to lamp post
"""
import os, sys, json, math

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
BUILD = os.path.join(ROOT, 'scripts/harbour/blender/island/build_island.py')
G = {'__file__': BUILD, '__name__': '__main__'}
exec(compile(open(BUILD).read(), BUILD, 'exec'), G)

from mathutils import Vector

Z_SHORE = G['Z_SHORE']; DECK = G['DECK']
QL = G['QL']; LANES = G['LANES']; STAIRS = G['STAIRS']; ROADS = G['ROADS']; CHIMNEYS = G['CHIMNEYS']
TOWN = G['TOWN']; RINGS = G['RINGS']; town_pt = G['town_pt']; along_line = G['along_line']; CJ = G['CJ']
H = G['H']; COAST = G['COAST']; point_in_poly = G['point_in_poly']


def gl(x, y, z):
    return [round(x, 2), round(z, 2), round(-y, 2)]


def heading(dx, dy):
    """Blender plan direction -> layout heading (bow along (sin h, cos h) in glTF x/z)."""
    return round(math.atan2(dx, -dy), 4)


paths, benches, spots, flagpoles, bunting = [], [], [], [], []

# quay promenades: a stroll line between the lamp row (1.8 m) and the crates (4.5 m); a back line on wide aprons
APRON = {'grand': 9.0, 'long': 12.0, 'tron': 6.0, 'battery': 8.0, 'wharf': 9.5}
for name, L in QL.items():
    depth = APRON.get(name, 3.0 if name.endswith(('-w', '-e')) else 7.0)
    if depth < 5:
        continue
    for inset in ((3.1, depth - 2.0) if depth >= 9 else (3.1,)):
        pts = [p for (p, t, nl) in along_line(L, 3.0, inset, start=1.0)]
        if len(pts) >= 2:
            paths.append({'kind': 'quay', 'w': 1.4, 'pts': [gl(p[0], p[1], Z_SHORE + 0.06) for p in pts]})
    for (p, t, nl) in along_line(L, 10.5, 1.15, start=6.0):
        spots.append({'kind': 'edge', 'p': gl(p[0], p[1], Z_SHORE + 0.06), 'h': heading(-nl[0], -nl[1])})

# terrace lanes (gravel, 3.2 m wide, top at z + 0.16)
for (k, pts, z) in LANES:
    paths.append({'kind': 'lane', 'w': 1.6, 'pts': [gl(p[0], p[1], z + 0.16) for p in pts]})

# stairs between the bands: foot on the lower band, head on the upper lane
for (th, band, p0, radial, run) in STAIRS:
    za = RINGS[band - 1][2]; zb = RINGS[band][2]
    a = p0 - radial * 2.5; f = p0; h = p0 + radial * run; t = p0 + radial * (run + 2.6)
    paths.append({'kind': 'stair', 'w': 1.0, 'pts': [gl(a.x, a.y, za + 0.06), gl(f.x, f.y, za + 0.06), gl(h.x, h.y, zb + 0.06), gl(t.x, t.y, zb + 0.16)]})

# roads + footpaths: on the terrain (the ribbons are laid on H)
for name, pts in ROADS.items():
    run = [p for p in pts if point_in_poly(p[0], p[1], COAST)]
    if len(run) >= 2:
        paths.append({'kind': 'road', 'w': 1.2, 'pts': [gl(p[0], p[1], H(p[0], p[1]) + 0.12) for p in run]})

# pier spines (plank decks)
for s in CJ['struct']:
    if s['kind'] != 'pier':
        continue
    a, b = Vector(s['a']), Vector(s['b'])
    paths.append({'kind': 'pier', 'w': 0.8, 'pts': [gl(a.x, a.y, s['deck'] + 0.25), gl(b.x, b.y, s['deck'] + 0.25)]})

# benches (same recipe as hb_dress.py): seat at z + 0.5, facing the amphitheatre centre's opposite (the bay)
for (th, r_, k) in ((80.0, 24.0, 0), (110.0, 24.0, 0), (126.0, 60.0, 2), (62.0, 60.0, 2), (96.0, 44.0, 1), (40.0, 30.0, 0)):
    p = Vector(town_pt(th, TOWN['r_quay'] + r_)); z = RINGS[k][2]
    fdir = (Vector(town_pt(th, 0)) - p).normalized()
    ang = math.atan2(fdir.y, fdir.x) + math.pi / 2
    # the backrest sits at local +y; the sitter faces local -y
    face = Vector((math.sin(ang), -math.cos(ang)))
    benches.append({'p': gl(p.x, p.y, z), 'h': heading(face.x, face.y)})

# the Customs square (a widening of the Vagen promenade) + the town squares: open standing ground
for th in range(80, 104, 6):
    p = town_pt(th, TOWN['r_quay'] + 18.0)
    spots.append({'kind': 'square', 'p': gl(p[0], p[1], Z_SHORE + 0.06), 'h': 0.0})
for (p, z) in G.get('SANCT_SPOTS', []):          # 08-T4: the hill sanctuary's temenos (folk climb the processional path)
    spots.append({'kind': 'square', 'p': gl(p[0], p[1], z), 'h': 0.0})
for (th, band, r_) in TOWN['squares']:
    p = town_pt(th, TOWN['r_quay'] + r_)
    spots.append({'kind': 'square', 'p': gl(p[0], p[1], RINGS[band][2] + 0.16), 'h': 0.0})

# bunting: strings hung post to post between the terrace-lane lamps (every other pair) and the lamps of the quays
# that have none baked in (the Vagen promenade and the coves carry the island's own bunting)
for (k, pts, z) in LANES:
    idx = list(range(3, len(pts) - 2, 9))                 # the lamp recipe in hb_dress.py
    for j in range(k % 2, len(idx) - 1, 2):
        a = pts[idx[j]]; b = pts[idx[j + 1]]
        bunting.append({'a': gl(a[0], a[1], z + 3.75), 'b': gl(b[0], b[1], z + 3.75), 'sag': 0.9})
for name in ('long', 'tron', 'wharf'):
    step = {'long': 26.0, 'tron': 20.0, 'wharf': 24.0}[name]
    lamps_ = [p for (p, t, nl) in along_line(QL[name], step, 1.8)]
    for j in range(0, len(lamps_) - 1, 2):
        a, b = lamps_[j], lamps_[j + 1]
        bunting.append({'a': gl(a[0], a[1], Z_SHORE + 3.8), 'b': gl(b[0], b[1], Z_SHORE + 3.8), 'sag': 1.0})

# bare flagpoles / masts on landmarks: their top
import bpy
bpy.context.view_layer.update()          # parented landmark parts: settle matrix_world first
for nm in ('customs_house_flagpole', 'harbourmaster_mast'):
    ob = bpy.data.objects.get(nm)
    if ob is None:
        continue
    ws = [ob.matrix_world @ v.co for v in ob.data.vertices]
    top = max(ws, key=lambda v: v.z)
    flagpoles.append({'p': gl(top.x, top.y, top.z - 0.35), 'h': 0.0})

# 09-L1 (prettier): the moles' flagstone promenades (between the kerbs, short of the pierhead bastion; the benches and
# planted tubs stand on the centre line, so the walkers' lanes keep to either side): the dusk promenade
_resample = G['_resample']
for m in CJ.get('moles', []):
    h_ = Vector(m['head'])
    pts = [p for p in (Vector(q) for q in _resample([tuple(p) for p in m['line']], 6.0, closed=False)) if (p - h_).length > m['head_r'] + 1.0]
    if len(pts) >= 2:
        paths.append({'kind': 'mole', 'w': 4.4, 'pts': [gl(p.x, p.y, Z_SHORE + 0.2) for p in pts]})

# 09-L1: a vendor's place at each end of a market stall's counter, just under the awning's edge, facing the front (same
# recipe as hb_dress.py STALLS: the stall is turned by ang + pi; its awning and back posts are on local -y). Behind the
# counter the awning hides a vendor from the harbour's own viewpoint.
for (th, dr) in G['STALLS']:
    p = Vector(town_pt(th, TOWN['r_quay'] + dr)); fdir = (Vector(town_pt(th, 0)) - p).normalized(); sd = Vector((-fdir.y, fdir.x))
    a_ = math.atan2(sd.y, sd.x) + math.pi
    rot = lambda v: Vector((v[0] * math.cos(a_) - v[1] * math.sin(a_), v[0] * math.sin(a_) + v[1] * math.cos(a_)))
    for lx in (-2.45, 2.45):
        q = p + rot((lx, -0.35)); f = rot((-0.35 * lx / abs(lx), 1.0))
        spots.append({'kind': 'stall', 'p': gl(q.x, q.y, Z_SHORE + 0.06), 'h': heading(f.x, f.y)})

# 09-L2: the Pharos causeway (hb_land.py P6): from the landing on the headland over the arches to the islet pavement
PHJ = CJ['pharos']; CWJ = PHJ['causeway']
CA, CB = Vector(CWJ['a']), Vector(CWJ['b']); cd_ = (CB - CA); CL = cd_.length; cd_.normalize()
deck_z = G['deck_z']
L0 = CA - cd_ * 6.0
causeway = [gl(L0.x, L0.y, H(L0.x, L0.y) + 0.05)]
for k in range(int(CL / 4.0) + 1):
    s_ = min(CL, k * 4.0); q = CA + cd_ * s_
    causeway.append(gl(q.x, q.y, deck_z(s_) + 0.02))
q = CB + cd_ * 7.0
causeway.append(gl(q.x, q.y, PHJ['z'] + 0.02))

# 09-L3: where the goats graze (plan polygons; the runtime reads the ground height and keeps them off steep or built
# ground): the open meadow on the Pharos headland between the causeway and the Burn (no field there, a soft ellipse), then
# the two terrain.FIELDS pastures nearest the west-lobe farm
terrain_ = G['terrain']
HEADLAND_MEADOW = (-204.0, 54.0, 6.5, 13.0, 0.15)         # plan centre x, y (Blender), radii, angle: the knoll above the causeway
cx_, cy_, ra_, rb_, an_ = HEADLAND_MEADOW
pastures = [[[round(cx_ + math.cos(t) * ra_ * math.cos(an_) - math.sin(t) * rb_ * math.sin(an_), 2),
              round(-(cy_ + math.cos(t) * ra_ * math.sin(an_) + math.sin(t) * rb_ * math.cos(an_)), 2)]
             for t in (2 * math.pi * k / 10 for k in range(10))]]
farm0 = Vector(CJ['farms'][0])
fields = sorted((f for f in terrain_.FIELDS if f['kind'] == 'pasture'),
                key=lambda f: (Vector((sum(x for x, _ in f['poly']) / len(f['poly']), sum(y for _, y in f['poly']) / len(f['poly']))) - farm0).length)
pastures += [[[round(x, 2), round(-y, 2)] for (x, y) in f['poly']] for f in fields[:2]]

# 08-T5 / 09-L9: the hay cart's road: the west road's run through the west lobe's farms (gl x < -70, between the
# headland and the farm bend); it never reaches a chain hamlet, the Mint or the Burn
cartway = [gl(p[0], p[1], H(p[0], p[1]) + 0.12) for p in ROADS['west'] if point_in_poly(p[0], p[1], COAST) and p[0] < -70.0 and -175.0 < p[1] < -25.0]

chim = [gl(c.x, c.y, c.z) for c in CHIMNEYS]
out = {'version': 1, 'source': 'src/harbour/life/tools/export_walkways.py', 'paths': paths, 'benches': benches,
       'spots': spots, 'chimneys': chim, 'flagpoles': flagpoles, 'bunting': bunting,
       'causeway': causeway, 'pastures': pastures, 'cartway': cartway}
dst = os.path.join(ROOT, 'public/harbour/walkways.json')
json.dump(out, open(dst, 'w'), separators=(',', ':'))
print('WALKWAYS', dst, {k: len(v) for k, v in out.items() if isinstance(v, list)})
