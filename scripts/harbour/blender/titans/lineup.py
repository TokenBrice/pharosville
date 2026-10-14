"""Titan-class flagships - lookdev lineups (style C golden), next to two kit hulls at their runtime size for scale.

    blender -b --factory-startup -P scripts/harbour/blender/titans/lineup.py -- --mode sailing|docked|lod [--samples 48] [--pct 100] [--out DIR]

Reuses the hull kit's preview materials, sea and light (scripts/harbour/blender/hulls/lineup.py, imported with a mode
it does not render) and poses the ships the way the runtime does (furl morph, boom swing, jib about its stay, heel,
port tack = mirror the swinging / braced nodes).
"""
import sys, os, math, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
HULLS = os.path.join(HERE, '..', 'hulls')
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(n, d):
    return ARGV[ARGV.index(n) + 1] if n in ARGV else d


MODE = arg('--mode', 'sailing')
HEADING = float(arg('--heading', '-24'))
TAG = arg('--tag', '')
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = arg('--out', os.path.join(ROOT, 'agents', '2026-10-13-pharosville-reboot', 'p7', 'titans'))
os.makedirs(OUT, exist_ok=True)
# the kit lineup module builds its preview materials at import; a mode it does not know renders nothing
sys.argv = sys.argv[:sys.argv.index('--') + 1 if '--' in sys.argv else len(sys.argv)] + ['--mode', 'titan-import', '--samples', arg('--samples', '48'),
                                                                   '--pct', arg('--pct', '100')]
sys.path.insert(0, HULLS)
import importlib
import lineup as K; importlib.reload(K)
sys.path.insert(0, HERE)
import tt_titans as T; importlib.reload(T)
import bpy
import numpy as np
from mathutils import Vector
from hb_lib import descendants, tri_count, PAL
import hb_hulls

scene = K.scene
LOGOS = {'titan_usdt': '1-usdt.svg', 'titan_usdc': '2-usdc.svg', 'titan_usde': '146-usde.svg', 'titan_usds': '209-usds.svg',
         'usd_ship_flagship': '5-dai.svg', 'usd_schooner_large': '118-gho.svg'}
BRAND = {'titan_usdt': '#33705f', 'titan_usdc': '#274a81', 'titan_usde': '#242424', 'titan_usds': '#b5720d',
         'usd_ship_flagship': '#f5ac37', 'usd_schooner_large': '#9e85d9'}
SLOT = {k: i for i, k in enumerate(LOGOS)}


def atlas():
    from PIL import Image, ImageDraw
    S, N = 256, K.NSLOT
    im = Image.new('RGBA', (S * N, S * N), (0, 0, 0, 0))
    tmp = os.path.join(K.SCRATCH, 'titan_logo_tmp.png')
    for vid, fn in LOGOS.items():
        k = SLOT[vid]
        subprocess.run(['rsvg-convert', '-w', str(int(S * 0.74)), '-h', str(int(S * 0.74)), '--keep-aspect-ratio',
                        os.path.join(ROOT, 'public', 'logos', fn), '-o', tmp], check=True)
        lg = Image.open(tmp).convert('RGBA')
        tile = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(tile).ellipse((6, 6, S - 6, S - 6), fill=(250, 248, 242, 255))
        tile.alpha_composite(lg, ((S - lg.width) // 2, (S - lg.height) // 2))
        im.alpha_composite(tile, ((k % N) * S, (k // N) * S))
    p = os.path.join(K.SCRATCH, 'titan-atlas-preview.png')
    im.save(p)
    img = bpy.data.images.load(p, check_existing=False); img.alpha_mode = 'STRAIGHT'
    for n in K.PV['hb_sail'].node_tree.nodes:
        if n.type == 'TEX_IMAGE':
            n.image = img


atlas()


def dress(root, vid):
    K.dress(root, None, K.lin(BRAND[vid]))
    for o in descendants(root):
        if o.type == 'MESH':
            o['emblem'] = float(SLOT[vid])


MIRROR = ('boom', 'boom_2', 'yards', 'sail_extra', 'sail_jib')


def pose(root, furl, swing=0.0, heel=0.0, tack=1):
    for o in descendants(root):
        if o.type == 'MESH' and o.data.shape_keys:
            o.data.shape_keys.key_blocks['furl'].value = furl
        base = o.name.split('.')[0]
        mir = base in MIRROR or (base == 'sail_main' and o.parent and o.parent.name.split('.')[0] == '_heel')
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
    K.WAKES.append(((a.x, a.y), (a.x - d.x * R.L * 2.0, a.y - d.y * R.L * 2.0), 0.3 * R.H.B, 1.2 * R.H.B + 0.08 * R.L, 0.7))
    b = Vector(pos) + d * (R.H.bow().x - 0.1)
    K.WAKES.append(((b.x, b.y), (b.x - d.x * R.L * 0.6, b.y - d.y * R.L * 0.6), 0.2 * R.H.B, 0.6 * R.H.B, 0.55))


def place(vid, pos, hd, furl, swing=0.0, heel=0.0, tack=1, sail=False):
    if vid.startswith('titan_'):
        root, _, R = T.build(vid)
        scale = 1.0
    else:
        V = {v[0]: v for v in hb_hulls.VARIANTS}[vid]
        root, _, R = hb_hulls.build_boat(*V)
        scale = {'usd_ship_flagship': 26.0 / 30.0, 'usd_schooner_large': 1.0}[vid]
    root.location = pos; root.rotation_euler = (0, 0, math.radians(hd)); root.scale = (scale,) * 3
    dress(root, vid)
    pose(root, furl, swing, heel, tack)
    bpy.context.view_layer.update()
    K.footprint(R, root.matrix_world)
    if sail:
        wake(R, pos, hd)
    return root, R


ORDER = ['usd_schooner_large', 'titan_usde', 'titan_usds', 'usd_ship_flagship', 'titan_usdc', 'titan_usdt']
NAMES = {'titan_usdt': 'USDT · four-masted barque', 'titan_usdc': 'USDC · clipper', 'titan_usde': 'USDe · staysail schooner',
         'titan_usds': 'USDS · paddle frigate', 'usd_ship_flagship': 'kit flagship (26 m)', 'usd_schooner_large': 'kit large (18 m)'}

if MODE in ('sailing', 'docked'):
    scene.render.resolution_x, scene.render.resolution_y = 2400, 1300
    sail = MODE == 'sailing'
    roots, labels = [], []
    x = 0.0
    for k, vid in enumerate(ORDER):
        L = 18.0 if vid == 'usd_schooner_large' else 26.0 if vid == 'usd_ship_flagship' else {'titan_usdt': 32, 'titan_usdc': 30, 'titan_usde': 22, 'titan_usds': 22}[vid]
        x += L * 0.42
        pos = (x, (k % 2) * 16.0, 0.0)
        root, R = place(vid, pos, HEADING, 0.0 if sail else 1.0, swing=0.45 if sail else 0.0, heel=math.radians(9) if sail else 0.0,
                        tack=-1 if sail else 1, sail=sail)
        roots.append(root)
        tr = tri_count(descendants(root))
        labels.append((Vector((x, pos[1] - 6.0 - 0.3 * L, 0)), NAMES[vid], f'{L:g} m · {tr} tris'))
        x += L * 0.42 + 6.0
    pts = sum((K.bbox_pts(r) for r in roots), [])
    b = (min(p.x for p in pts) - 60, min(p.y for p in pts) - 60, max(p.x for p in pts) + 60, max(p.y for p in pts) + 80)
    sdf, sb = K.build_sdf(b)
    sea = K.sea_plane(b); sea.data.materials.append(K.build_sea(sdf, sb))
    K.setup_world()
    cam = K.camera(30.0, 0.0)
    K.fit(cam, pts + [p + Vector((0, -12, 0)) for p in pts if p.z < 1], margin=0.03)
    path = os.path.join(OUT, f'titans-{MODE}{TAG}.png')
    K.render(path)
    K.label(path, labels, 'Titan-class flagships · ' + ('sailing, port tack: furl 0, swing 0.45, heel 9°' if sail else 'at rest: furl 1, brand covers'))

if MODE == 'lod':
    scene.render.resolution_x, scene.render.resolution_y = 2000, 900
    roots = []
    x = 0.0
    for k, (vid, *_r) in enumerate(T.TITANS):
        for furl in (0.0, 1.0):
            root, _, R = T.build(vid)
            for o in descendants(root):
                bpy.data.objects.remove(o, do_unlink=True)
            lroot, ob, _ = T.build_titan_lod(R)
            x += R.L / 2
            lroot.location = (x, 0, 0); lroot.rotation_euler = (0, 0, math.radians(-24))
            dress(lroot, vid)
            ob.data.shape_keys.key_blocks['furl'].value = furl
            roots.append(lroot); x += R.L / 2 + 6.0
    bpy.context.view_layer.update()
    pts = sum((K.bbox_pts(r) for r in roots), [])
    b = (min(p.x for p in pts) - 60, min(p.y for p in pts) - 60, max(p.x for p in pts) + 60, max(p.y for p in pts) + 80)
    sdf, sb = K.build_sdf(b)
    sea = K.sea_plane(b); sea.data.materials.append(K.build_sea(sdf, sb))
    K.setup_world(); cam = K.camera(30.0, 0.0); K.fit(cam, pts, 0.03)
    K.render(os.path.join(OUT, 'titans-lod.png'))
print('TITANS DONE', MODE)
del np, PAL
