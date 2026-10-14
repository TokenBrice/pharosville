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

chim = [gl(c.x, c.y, c.z) for c in CHIMNEYS]
out = {'version': 1, 'source': 'src/harbour/life/tools/export_walkways.py', 'paths': paths, 'benches': benches,
       'spots': spots, 'chimneys': chim, 'flagpoles': flagpoles, 'bunting': bunting}
dst = os.path.join(ROOT, 'public/harbour/walkways.json')
json.dump(out, open(dst, 'w'), separators=(',', ':'))
print('WALKWAYS', dst, {k: len(v) for k, v in out.items() if isinstance(v, list)})
