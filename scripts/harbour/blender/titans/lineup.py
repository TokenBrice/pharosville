"""Top-10 Major Titans - lookdev lineups (style C golden), reading live data/logos.json & data/brand-colors.json.

    blender -b --factory-startup -P scripts/harbour/blender/titans/lineup.py -- \
        --mode board|sailing|docked|lod|closeup_a|closeup_b|one [--vid titan_usdt] [--samples 48] [--pct 100] [--out DIR]

Reuses the hull kit's preview materials, sea and light (scripts/harbour/blender/hulls/lineup.py), enhances
hb_opaque to visualize E15 `_AO` and adds preview materials for `hb_fleet_window` and `hb_emissive`.
"""
import sys
import os
import json
import math
import subprocess
import importlib

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
HULLS = os.path.abspath(os.path.join(HERE, '..', 'hulls'))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(n, d):
    return ARGV[ARGV.index(n) + 1] if n in ARGV else d


MODE = arg('--mode', 'board')
HEADING = float(arg('--heading', '-24'))
TAG = arg('--tag', '')
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = arg('--out', os.path.join(ROOT, 'outputs', 'wb-w4-lineup'))
os.makedirs(OUT, exist_ok=True)

# Import kit lineup for preview materials, sea, sky & camera helpers (unknown mode renders nothing)
sys.argv = sys.argv[:sys.argv.index('--') + 1 if '--' in sys.argv else len(sys.argv)] + [
    '--mode', 'titan-import', '--samples', arg('--samples', '48'), '--pct', arg('--pct', '100'),
]
if HULLS not in sys.path:
    sys.path.insert(0, HULLS)
import lineup as K  # noqa: E402
importlib.reload(K)
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import tt_bake  # noqa: E402
import tt_common  # noqa: E402
import tt_lod  # noqa: E402
import tt_majors_a  # noqa: E402
import tt_majors_b  # noqa: E402
import tt_titans as T  # noqa: E402
for _m in (tt_bake, tt_common, tt_lod, tt_majors_a, tt_majors_b, T):
    importlib.reload(_m)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from hb_lib import descendants, tri_count, PAL, lin  # noqa: E402
import hb_hulls  # noqa: E402

scene = K.scene

# Read live data/logos.json & data/brand-colors.json (fixes stale 233-usds.svg, supports .svg / .png / .webp!)
with open(os.path.join(ROOT, 'data', 'logos.json')) as _f:
    _LIVE_LOGOS = json.load(_f)
with open(os.path.join(ROOT, 'data', 'brand-colors.json')) as _f:
    _LIVE_COLORS = json.load(_f)

COIN_FOR_VID = {vid: coin for vid, coin, *_ in T.TITANS}
COIN_FOR_VID.update({'usd_ship_flagship': 'dai-makerdao', 'usd_schooner_large': 'gho-aave'})


def _brand_hex(coin_id):
    raw = _LIVE_COLORS.get(coin_id, '#886644')
    return raw.split('|')[0].strip()


LOGOS = {}
BRAND = {}
for vid, coin in COIN_FOR_VID.items():
    lp = _LIVE_LOGOS.get(coin, '')
    LOGOS[vid] = lp.lstrip('/') if lp else ''
    BRAND[vid] = _brand_hex(coin)
SLOT = {k: i for i, k in enumerate(LOGOS)}

TITAN_VIDS = [t[0] for t in T.TITANS]
SHORT_NAME = {
    'titan_usdt': '#1 USDT · Syracusia Temple',
    'titan_usdc': '#2 USDC · Deceres Astrolabe',
    'titan_usde': '#3 USDe · Pentere Garden',
    'titan_dai': '#4 DAI · Doric Citadel',
    'titan_usds': '#5 USDS · Thalamegos Palace',
    'titan_rlusd': '#6 RLUSD · Trireme 48-Oar',
    'titan_usd1': '#7 USD1 · Imperial Eagle',
    'titan_xaut': '#8 XAUT · Bullion Galley',
    'titan_usdg': '#9 USDG · Twin-Castle Naus',
    'titan_pyusd': '#10 PYUSD · Clipper Lembos',
    'usd_ship_flagship': 'kit flagship (26 m)',
    'usd_schooner_large': 'kit large (18 m)',
}


def build_titan_atlas():
    from PIL import Image, ImageDraw
    S, N = 256, K.NSLOT
    im = Image.new('RGBA', (S * N, S * N), (0, 0, 0, 0))
    tmp = os.path.join(K.SCRATCH, 'titan_logo_tmp.png')
    sz = int(S * 0.72)
    for vid, relpath in LOGOS.items():
        k = SLOT[vid]
        src = os.path.join(ROOT, 'public', relpath) if relpath else ''
        lg = None
        if src and os.path.exists(src):
            if src.lower().endswith('.svg'):
                subprocess.run(['rsvg-convert', '-w', str(sz), '-h', str(sz), '--keep-aspect-ratio', src, '-o', tmp], check=True)
                lg = Image.open(tmp).convert('RGBA')
            else:
                lg = Image.open(src).convert('RGBA')
                lg.thumbnail((sz, sz), Image.LANCZOS)
        tile = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(tile).ellipse((8, 8, S - 8, S - 8), fill=(250, 248, 242, 255))
        if lg is not None:
            tile.alpha_composite(lg, ((S - lg.width) // 2, (S - lg.height) // 2))
        im.alpha_composite(tile, ((k % N) * S, (k // N) * S))
    p = os.path.join(K.SCRATCH, 'titan-atlas-preview.png')
    im.save(p)
    img = bpy.data.images.load(p, check_existing=False)
    img.alpha_mode = 'STRAIGHT'
    for n in K.PV['hb_sail'].node_tree.nodes:
        if n.type == 'TEX_IMAGE':
            n.image = img


def setup_extra_preview_materials():
    """Add warm preview materials for `hb_fleet_window` and `hb_emissive`."""
    for name, emit_col, emit_str in (
        ('hb_fleet_window', lin('#FFB44C'), 1.8),
        ('hb_emissive', lin('#FF9A36'), 3.0),
    ):
        m = bpy.data.materials.new('PV_' + name)
        if not m.node_tree:
            m.use_nodes = True
        nt = m.node_tree
        p = nt.nodes.get('Principled BSDF')
        at = nt.nodes.new('ShaderNodeAttribute')
        at.attribute_name = 'Col'
        nt.links.new(at.outputs['Color'], p.inputs['Base Color'])
        p.inputs['Roughness'].default_value = 0.35
        if 'Emission Color' in p.inputs:
            p.inputs['Emission Color'].default_value = (*emit_col, 1.0)
            p.inputs['Emission Strength'].default_value = emit_str
        K.PV[name] = m


build_titan_atlas()
setup_extra_preview_materials()


def dress(root, vid):
    K.dress(root, None, K.lin(BRAND[vid]))
    for o in descendants(root):
        if o.type == 'MESH':
            o['emblem'] = float(SLOT[vid])
            # Style-C preview shader (`nl_common.py`) predates pid=14 (PATTERN_LEAF_EVERGREEN);
            # remap alpha 14/16 -> 8/16 (leaf) in Blender preview ONLY so evergreen foliage renders lush green!
            ca = o.data.color_attributes.get('Col')
            if ca is not None and len(ca.data):
                buf = np.zeros(len(ca.data) * 4, dtype=np.float32)
                ca.data.foreach_get('color', buf)
                a = buf[3::4]
                mask = np.abs(a - (14.0 / 16.0)) < 0.02
                if np.any(mask):
                    a[mask] = 8.0 / 16.0
                    ca.data.foreach_set('color', buf)


MIRROR = ('boom', 'boom_2', 'yards', 'sail_extra', 'sail_jib')


def pose(root, furl, swing=0.0, heel=0.0, tack=1):
    for o in descendants(root):
        if o.type == 'MESH' and o.data.shape_keys and 'furl' in o.data.shape_keys.key_blocks:
            o.data.shape_keys.key_blocks['furl'].value = furl
        base = o.name.split('.')[0]
        mir = base in MIRROR or (base in ('sail_main', 'sail_cover') and o.parent and o.parent.name.split('.')[0] == '_heel')
        if mir:
            o.scale.y = 1 if tack > 0 else -1
        if base in ('boom', 'boom_2'):
            o.rotation_euler.z = -swing * tack
        if base == 'sail_jib':
            ax = o['stay_axis']
            o.rotation_mode = 'AXIS_ANGLE'
            o.rotation_axis_angle = (-0.6 * swing * tack, ax[0], -ax[2], ax[1])
        if base == '_heel':
            o.rotation_euler.x = -heel * tack
    bpy.context.view_layer.update()
    for o in descendants(root):
        if o.type == 'MESH':
            o['mirror'] = 1.0 if o.matrix_world.determinant() < 0 else 0.0


def wake(R, pos, hd):
    d = Vector((math.cos(math.radians(hd)), math.sin(math.radians(hd)), 0))
    a = Vector(pos) + d * (R.H.stern().x + 0.3)
    K.WAKES.append(((a.x, a.y), (a.x - d.x * R.L * 1.8, a.y - d.y * R.L * 1.8), 0.3 * R.H.B, 1.1 * R.H.B + 0.08 * R.L, 0.7))
    b = Vector(pos) + d * (R.H.bow().x - 0.1)
    K.WAKES.append(((b.x, b.y), (b.x - d.x * R.L * 0.55, b.y - d.y * R.L * 0.55), 0.2 * R.H.B, 0.55 * R.H.B, 0.55))


def place(vid, pos, hd, furl, swing=0.0, heel=0.0, tack=1, sail=False):
    if vid.startswith('titan_'):
        root, _, R = T.build(vid, bake_ao=False)
        scale = 1.0
    else:
        V = {v[0]: v for v in hb_hulls.VARIANTS}[vid]
        root, _, R = hb_hulls.build_boat(*V)
        scale = {'usd_ship_flagship': 26.0 / 30.0, 'usd_schooner_large': 1.0}[vid]
    root.location = pos
    root.rotation_euler = (0, 0, math.radians(hd))
    root.scale = (scale,) * 3
    dress(root, vid)
    pose(root, furl, swing, heel, tack)
    bpy.context.view_layer.update()
    K.footprint(R, root.matrix_world)
    if sail:
        wake(R, pos, hd)
    return root, R


def render_grid(vids, out_name, title, res=(2800, 1700), pitch=30.0, yaw=0.0, include_docked=True, heading=HEADING):
    """Render a crisp 2-row (sailing top, docked bottom) or 5-col lineup board."""
    scene.render.resolution_x, scene.render.resolution_y = res
    roots, labels = [], []
    if include_docked:
        rows = [(48.0, True), (0.0, False)]
    else:
        rows = [(0.0, True)]
    for ry, sail in rows:
        x = 0.0
        for vid in vids:
            x += 17.5
            root, R = place(
                vid, (x, ry, 0.0), heading, 0.0 if sail else 1.0,
                swing=0.42 if sail else 0.0, heel=math.radians(8) if sail else 0.0,
                tack=-1 if sail else 1, sail=sail,
            )
            roots.append(root)
            tr = tri_count(descendants(root))
            mode_lbl = 'sailing' if sail else 'docked'
            labels.append((
                Vector((x, ry - 4.2 - 0.28 * R.L, 0)),
                SHORT_NAME[vid],
                f'{R.L:.1f}x{R.H.B:.2f}m · {tr}t · {mode_lbl}',
            ))
            x += 17.5 + 4.5
    bpy.context.view_layer.update()
    pts = sum((K.bbox_pts(r) for r in roots), [])
    b = (min(p.x for p in pts) - 55, min(p.y for p in pts) - 55, max(p.x for p in pts) + 55, max(p.y for p in pts) + 75)
    sdf, sb = K.build_sdf(b)
    sea = K.sea_plane(b)
    sea.data.materials.append(K.build_sea(sdf, sb))
    K.setup_world()
    cam = K.camera(pitch, yaw)
    K.fit(cam, pts + [p + Vector((0, -10, 0)) for p in pts if p.z < 1], margin=0.03)
    path = os.path.join(OUT, out_name)
    K.render(path)
    K.label(path, labels, title)
    return path


if MODE == 'board':
    # All 10 Titans in 2 rows of 5 (top row: #1-#5, bottom row: #6-#10), sailing port tack
    scene.render.resolution_x, scene.render.resolution_y = 2800, 1750
    roots, labels = [], []
    groups = [(56.0, TITAN_VIDS[:5]), (0.0, TITAN_VIDS[5:])]
    for ry, vids in groups:
        x = 0.0
        for vid in vids:
            x += 18.0
            root, R = place(vid, (x, ry, 0.0), HEADING, 0.0, swing=0.42, heel=math.radians(8), tack=-1, sail=True)
            roots.append(root)
            tr = tri_count(descendants(root))
            labels.append((Vector((x, ry - 4.5 - 0.28 * R.L, 0)), SHORT_NAME[vid], f'{R.L:.1f}x{R.H.B:.2f}m · {R.cls} · {tr} tris'))
            x += 18.0 + 4.0
    bpy.context.view_layer.update()
    pts = sum((K.bbox_pts(r) for r in roots), [])
    b = (min(p.x for p in pts) - 60, min(p.y for p in pts) - 60, max(p.x for p in pts) + 60, max(p.y for p in pts) + 80)
    sdf, sb = K.build_sdf(b)
    sea = K.sea_plane(b)
    sea.data.materials.append(K.build_sea(sdf, sb))
    K.setup_world()
    cam = K.camera(30.0, 0.0)
    K.fit(cam, pts + [p + Vector((0, -11, 0)) for p in pts if p.z < 1], margin=0.03)
    path = os.path.join(OUT, f'titans-10-sailing{TAG}.png')
    K.render(path)
    K.label(path, labels, 'Top-10 Classical Hero Titans · Sailing (port tack, furl 0, live oars & split-rig mizzens)')

elif MODE == 'docked':
    # All 10 Titans in 2 rows of 5, docked (furl 1: architecture & deck monuments unobstructed!)
    scene.render.resolution_x, scene.render.resolution_y = 2800, 1750
    roots, labels = [], []
    groups = [(46.0, TITAN_VIDS[:5]), (0.0, TITAN_VIDS[5:])]
    for ry, vids in groups:
        x = 0.0
        for vid in vids:
            x += 18.0
            root, R = place(vid, (x, ry, 0.0), HEADING, 1.0, swing=0.0, heel=0.0, tack=1, sail=False)
            roots.append(root)
            tr = tri_count(descendants(root))
            labels.append((Vector((x, ry - 4.5 - 0.26 * R.L, 0)), SHORT_NAME[vid], f'{R.L:.1f}x{R.H.B:.2f}m · {R.cls} · {tr} tris'))
            x += 18.0 + 4.0
    bpy.context.view_layer.update()
    pts = sum((K.bbox_pts(r) for r in roots), [])
    b = (min(p.x for p in pts) - 60, min(p.y for p in pts) - 60, max(p.x for p in pts) + 60, max(p.y for p in pts) + 80)
    sdf, sb = K.build_sdf(b)
    sea = K.sea_plane(b)
    sea.data.materials.append(K.build_sea(sdf, sb))
    K.setup_world()
    cam = K.camera(32.0, 0.0)
    K.fit(cam, pts + [p + Vector((0, -10, 0)) for p in pts if p.z < 1], margin=0.03)
    path = os.path.join(OUT, f'titans-10-docked{TAG}.png')
    K.render(path)
    K.label(path, labels, 'Top-10 Classical Hero Titans · Docked (furl 1: decks, temples, rotundas, gardens, vaults & raked oars)')

elif MODE == 'closeup_a':
    render_grid(TITAN_VIDS[:5], f'titans-a-1to5{TAG}.png', 'Top-10 Titans #1-#5 (USDT, USDC, USDe, DAI, USDS) · Sailing & Docked')

elif MODE == 'closeup_b':
    render_grid(TITAN_VIDS[5:], f'titans-b-6to10{TAG}.png', 'Top-10 Titans #6-#10 (RLUSD, USD1, XAUT, USDG, PYUSD) · Sailing & Docked')

elif MODE == 'lod':
    scene.render.resolution_x, scene.render.resolution_y = 2600, 1500
    roots, labels = [], []
    groups = [(48.0, TITAN_VIDS[:5]), (0.0, TITAN_VIDS[5:])]
    for ry, vids in groups:
        x = 0.0
        for vid in vids:
            x += 18.0
            root, _, R = T.build(vid, bake_ao=False)
            for o in descendants(root):
                bpy.data.objects.remove(o, do_unlink=True)
            lroot, ob, ltr = T.build_titan_lod(R)
            lroot.location = (x, ry, 0.0)
            lroot.rotation_euler = (0, 0, math.radians(HEADING))
            dress(lroot, vid)
            ob.data.shape_keys.key_blocks['furl'].value = 0.0
            roots.append(lroot)
            labels.append((Vector((x, ry - 4.0 - 0.25 * R.L, 0)), SHORT_NAME[vid], f'LOD · {ltr} tris'))
            x += 18.0 + 4.0
    bpy.context.view_layer.update()
    pts = sum((K.bbox_pts(r) for r in roots), [])
    b = (min(p.x for p in pts) - 60, min(p.y for p in pts) - 60, max(p.x for p in pts) + 60, max(p.y for p in pts) + 80)
    sdf, sb = K.build_sdf(b)
    sea = K.sea_plane(b)
    sea.data.materials.append(K.build_sea(sdf, sb))
    K.setup_world()
    cam = K.camera(30.0, 0.0)
    K.fit(cam, pts + [p + Vector((0, -10, 0)) for p in pts if p.z < 1], margin=0.03)
    path = os.path.join(OUT, f'titans-10-lod{TAG}.png')
    K.render(path)
    K.label(path, labels, 'Top-10 Classical Hero Titans · Far-Zoom LODs (furl 0)')

elif MODE == 'one':
    vid = arg('--vid', 'titan_usdt')
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    r1, R = place(vid, (0, 0, 0), HEADING, 1.0)
    r2, _ = place(vid, (R.L * 1.25, R.L * 0.45, 0), HEADING, 0.0, swing=0.42, heel=math.radians(8), tack=-1, sail=True)
    pts = K.bbox_pts(r1) + K.bbox_pts(r2)
    b = (min(p.x for p in pts) - 40, min(p.y for p in pts) - 40, max(p.x for p in pts) + 40, max(p.y for p in pts) + 60)
    sdf, sb = K.build_sdf(b)
    sea = K.sea_plane(b)
    sea.data.materials.append(K.build_sea(sdf, sb))
    K.setup_world()
    cam = K.camera(float(arg('--pitch', '28')), float(arg('--yaw', '20')))
    K.fit(cam, pts, margin=0.05)
    K.render(os.path.join(OUT, f'one-{vid}{TAG}.png'))

print('TITANS DONE', MODE)
del np, PAL
