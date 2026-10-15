"""Ancient fleet (P7a) lookdev: per-family sheets, the all-fleet lineup beside the Pharos at true scale, the LOD sheet.

    blender -b --factory-startup -P scripts/harbour/blender/hulls/lineup_ancient.py -- --mode none \
        --sheet family --fam usd|eur|gold|fiat|other|titan | --sheet fleet | --sheet lod  [--samples 48] [--pct 100] [--out DIR]

Reuses lineup.py (golden world, preview materials, emblem atlas from the real logos, sea SDF); `--mode none` keeps
lineup.py from rendering its own scenes. Logos: each new variant shows the coin of the kit variant it replaces.
"""
import sys, os, math, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import lineup as LU
import hb_ancient as HA; importlib.reload(HA)
import bpy
from mathutils import Vector
from hb_lib import descendants, tri_count, PAL
from hb_hulls import CLASS_LOA

ARGV = LU.ARGV
SHEET = LU.arg('--sheet', 'family')
FAM = LU.arg('--fam', 'usd')
OUT = LU.arg('--out', os.path.join(LU.ROOT, 'agents', '2026-10-15-classical-town', 'p7a'))
os.makedirs(OUT, exist_ok=True)
scene = LU.scene
V = {v[0]: v for v in HA.ANCIENT_VARIANTS}
LOGO = dict(HA.REPLACES, titan_syracusia='usd_ship_flagship')
MIRROR = ('boom', 'boom_2', 'yards', 'sail_extra', 'sail_jib')
HEEL_MIRROR = ('sail_main', 'sail_cover')       # square rigs: hang from _heel, braced with the yard -> mirrored too
REPORT = {}


def pose(root, furl, swing=0.0, heel=0.0, tack=1):
    for o in descendants(root):
        if o.type == 'MESH' and o.data.shape_keys:
            o.data.shape_keys.key_blocks['furl'].value = furl
        base = o.name.split('.')[0]
        par = o.parent.name.split('.')[0] if o.parent else ''
        if base in MIRROR or (base in HEEL_MIRROR and par == '_heel'):
            o.scale.y = 1 if tack > 0 else -1
        if base in ('boom', 'boom_2'):
            o.rotation_euler.z = -swing * tack
        if base == '_heel':
            o.rotation_euler.x = -heel * tack
    bpy.context.view_layer.update()
    for o in descendants(root):
        if o.type == 'MESH':
            o['mirror'] = 1.0 if o.matrix_world.determinant() < 0 else 0.0


def kill(o):
    bpy.data.objects.remove(o, do_unlink=True)


def place(var, pos, hd, furl, swing=0.0, heel=0.0, wake=False, tack=1, seed=0):
    vid, fam, rig, cls, sch = var
    titan = fam == 'titan'
    n_sec = 13 if titan else HA.SECTIONS[cls]
    budget = 3000 if titan else HA.BUDGET[cls]
    while True:
        root, objs, R = HA.build_ancient(vid, fam, rig, cls, sch, seed=seed, n_sec=n_sec, L=HA.TITAN_L if titan else None)
        t = tri_count(descendants(root))
        if t <= budget or n_sec <= 5:
            break
        for o in descendants(root):
            kill(o)
        n_sec -= 1
    REPORT[vid] = dict(tris=t, budget=budget, sections=n_sec, loa=R.L,
                       nodes=sorted({o.name.split('.')[0] for o in descendants(root)} - {vid}))
    root.location = pos; root.rotation_euler = (0, 0, math.radians(hd))
    LU.dress(root, LOGO.get(vid))
    pose(root, furl, swing, heel, tack)
    bpy.context.view_layer.update()
    LU.footprint(R, root.matrix_world)
    if wake:
        d = Vector((math.cos(math.radians(hd)), math.sin(math.radians(hd)), 0))
        a = Vector(pos) + d * (R.H.stern().x + 0.3)
        LU.WAKES.append(((a.x, a.y), (a.x - d.x * R.L * 2.0, a.y - d.y * R.L * 2.0), 0.3 * R.H.B, 1.2 * R.H.B + 0.08 * R.L, 0.7))
        b = Vector(pos) + d * (R.H.bow().x - 0.1)
        LU.WAKES.append(((b.x, b.y), (b.x - d.x * R.L * 0.6, b.y - d.y * R.L * 0.6), 0.2 * R.H.B, 0.6 * R.H.B, 0.55))
    return root, R, t


def pharos(pos):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(LU.ROOT, 'outputs', 'harbour', 'pharos', 'lighthouse.raw.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location = pos
        if o.type == 'MESH':
            if o.data.color_attributes:
                o.data.color_attributes[0].name = 'Col'
            o.data.materials.clear(); o.data.materials.append(LU.PV['hb_opaque'])
            o.color = (*PAL['brand_default'], 1.0)
    bpy.context.view_layer.update()
    return [o for o in new if o.type == 'MESH']


def label_of(var, t, R):
    vid, fam, rig, cls, _ = var
    coin = LU.COINS[LOGO[vid]][1]
    return (vid.replace('_', ' ', 1).replace('_', ' · '), f'{R.L:g} m · {t} tris · {coin}')


def finish(roots, extra_pts=(), margin=0.03, pad=60):
    pts = sum((LU.bbox_pts(r) for r in roots), []) + list(extra_pts)
    b = (min(p.x for p in pts) - pad, min(p.y for p in pts) - pad, max(p.x for p in pts) + pad, max(p.y for p in pts) + pad + 20)
    sdf, sb = LU.build_sdf(b)
    sea = LU.sea_plane(b); sea.data.materials.append(LU.build_sea(sdf, sb))
    LU.setup_world()
    cam = LU.camera(35.0, 0.0)
    LU.fit(cam, pts + [p + Vector((0, -10, 0)) for p in pts if p.z < 1], margin=margin)
    return cam


FAMS = {f: [v for v in HA.ANCIENT_VARIANTS if v[1] == f] for f in ('usd', 'eur', 'gold', 'fiat', 'other')}
FAMS['titan'] = [HA.TITAN_STUDY]
TITLES = dict(usd='usd · fishing boat › coaster › corbita › merchantman › Alexandrian grain ship',
              eur='eur · Greek merchantman: painted eyes, tanbark sail', gold='gold · galleys: bireme and trireme, bronze ram, gilt aphlaston',
              fiat='fiat · Phoenician hippos: horse-head prow, ochre sail', other='other · sprit-rigged work boat',
              titan='titan study · Syracusia-class grain giant: towers, shields, siparum, artemon')

if SHEET == 'family':
    scene.render.resolution_x, scene.render.resolution_y = 2200, 1300
    roots, labels = [], []
    rows = [(0.0, 1.0, False), (40.0 if FAM != 'titan' else 60.0, 0.0, True)]   # front: docked; back: sailing (port tack)
    for ry, furl, sail in rows:
        x = 0.0
        for k, var in enumerate(FAMS[FAM]):
            L = HA.TITAN_L if var[1] == 'titan' else CLASS_LOA[var[3]]
            x += max(L, 15.0) / 2
            root, R, t = place(var, (x, ry, 0.0), -24.0 if sail else -55.0, furl, swing=0.45 if sail else 0.0, heel=math.radians(9) if sail else 0.0,
                               wake=sail, tack=-1 if sail else 1, seed=k)
            roots.append(root)
            l1, l2 = label_of(var, t, R)
            labels.append((Vector((x, ry - 3.0 - 0.3 * L, 0)), l1 + (' · sailing' if sail else ' · docked'), l2))
            x += max(L, 15.0) / 2 + 8.0
    finish(roots, pad=120)
    path = os.path.join(OUT, f'family-{FAM}.png')
    LU.render(path)
    LU.label(path, labels, TITLES[FAM] + '   (front: docked, brailed cover · back: sailing, port tack)')

if SHEET == 'fleet':
    scene.render.resolution_x, scene.render.resolution_y = 2600, 1500
    roots, labels = [], []
    ph = pharos((-62.0, 70.0, 0.0))
    LU.FOOT.append([(-62 + 34 * math.cos(a), 70 + 34 * math.sin(a)) for a in [2 * math.pi * k / 24 for k in range(24)]])
    order = [['usd_fisher_skiff', 'usd_coaster_boat', 'usd_coaster_small', 'usd_corbita_medium', 'usd_merchant_large', 'usd_grain_flagship'],
             ['eur_greek_boat', 'eur_greek_small', 'eur_greek_medium', 'eur_greek_large', 'gold_bireme_medium', 'gold_trireme_large'],
             ['other_sprit_skiff', 'other_sprit_boat', 'other_sprit_small', 'fiat_hippos_boat', 'fiat_hippos_small', 'fiat_hippos_medium',
              'titan_syracusia']]
    row_y = [66.0, 34.0, 2.0]
    for r, row in enumerate(order):
        x = -14.0
        for k, vid in enumerate(row):
            var = HA.TITAN_STUDY if vid == 'titan_syracusia' else V[vid]
            L = HA.TITAN_L if vid == 'titan_syracusia' else CLASS_LOA[var[3]]
            x += max(L, 10.0) / 2
            root, R, t = place(var, (x, row_y[r], 0.0), -24.0, 0.0, swing=0.4, heel=math.radians(8), wake=True, tack=-1 if (k % 2) else 1, seed=k)
            roots.append(root)
            l1, l2 = label_of(var, t, R)
            labels.append((Vector((x, row_y[r] - 3.0 - 0.3 * L, 0)), l1, l2))
            x += max(L, 10.0) / 2 + 4.5
    pts = [o.matrix_world @ Vector(c) for o in ph for c in o.bound_box]
    finish(roots, pts, margin=0.03)
    path = os.path.join(OUT, 'fleet-pharos.png')
    LU.render(path)
    LU.label(path, [], 'The ancient fleet, sailing, beside the Pharos at true scale (108 m to the statue\'s hand) · rows: usd · eur + gold · other + fiat + titan study')

if SHEET == 'one':    # close-up of one variant, sailing (port tack) beside docked, camera from the bow quarter
    vid = LU.arg('--vid', 'usd_grain_flagship')
    var = HA.TITAN_STUDY if vid == 'titan_syracusia' else V[vid]
    L = HA.TITAN_L if vid == 'titan_syracusia' else CLASS_LOA[var[3]]
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    r1, _, _ = place(var, (0, 0, 0), -24.0, 1.0)
    r2, _, _ = place(var, (L * 1.25, L * 0.5, 0), -24.0, 0.0, swing=0.45, heel=math.radians(9), wake=True, tack=-1)
    finish([r1, r2], margin=0.05, pad=40)
    cam = scene.camera
    cam.rotation_euler = (math.radians(90 - 32), 0, math.radians(float(LU.arg('--yaw', '35'))))
    LU.fit(cam, LU.bbox_pts(r1) + LU.bbox_pts(r2), margin=0.05)
    LU.render(os.path.join(OUT, f'one-{vid}.png'))

if SHEET == 'lod':
    scene.render.resolution_x, scene.render.resolution_y = 2200, 1300
    roots, labels = [], []
    allv = HA.ANCIENT_VARIANTS + [HA.TITAN_STUDY]
    rows = [allv[0:6], allv[6:12], allv[12:19]]
    for r, row in enumerate(rows):
        x = 0.0
        for k, var in enumerate(row):
            vid, fam, rig, cls, sch = var
            titan = fam == 'titan'
            root, objs, R = HA.build_ancient(vid, fam, rig, cls, sch, L=HA.TITAN_L if titan else None)
            for o in descendants(root):
                kill(o)
            lroot, lob, lt = HA.build_ancient_lod(R)
            REPORT[vid + '_lod'] = dict(tris=lt, budget=220 if titan else 150)
            L = R.L; x += L / 2
            lroot.location = (x, [62.0, 30.0, 0.0][r], 0); lroot.rotation_euler = (0, 0, math.radians(-24))
            LU.dress(lroot, LOGO.get(vid))
            lob.data.shape_keys.key_blocks['furl'].value = 1.0 if (k % 2) else 0.0
            if not (k % 2):
                lroot.scale.y = -1
            roots.append(lroot)
            labels.append((Vector((x, [62.0, 30.0, 0.0][r] - 3.0 - 0.3 * L, 0)), vid + ' LOD', f'{lt} tris · ' + ('furled' if k % 2 else 'set')))
            x += L / 2 + 6.0
    bpy.context.view_layer.update()
    finish(roots)
    path = os.path.join(OUT, 'lineup-lod.png')
    LU.render(path)
    LU.label(path, labels, 'Ancient fleet LODs (single mesh, furl morph) · alternating set / furled')

with open(os.path.join(OUT, f'tris-{SHEET}{"-" + FAM if SHEET == "family" else ""}.json'), 'w') as f:
    json.dump(REPORT, f, indent=1)
print('ANCIENT DONE', SHEET, FAM, json.dumps({k: (v['tris'], v['budget']) for k, v in REPORT.items()}))
