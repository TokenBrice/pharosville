#!/usr/bin/env python3
"""Fast composition preview (pure Python, ~5 s): projects the composed island through the runtime cameras with flat
colours - terrain quads (painter's order), lot boxes, piers, hulls, the Pharos, the sky card - so frame composition
can be judged before the Blender build.   python3 preview.py [heart|overview ...] (reads compose.json)"""
import json, math, os, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from geom import *
import terrain as T
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
OUTD = os.path.join(ROOT, 'outputs/harbour/island')
CJ = json.load(open(os.path.join(OUTD, 'compose.json')))
COAST = [tuple(p) for p in CJ['coast']]
T.init(COAST, {q['name']: [tuple(p) for p in q['line']] for q in CJ['quays']})
Wd_, Hd_ = 800, 500


def basis(pr):
    tx, ty, tz = pr['target']; Tt = (tx, -tz, ty)
    D = pr['distance']; yaw = math.radians(pr['yawDeg']); pit = math.radians(pr['pitchDeg'])
    cp = math.cos(pit)
    off = (math.sin(yaw) * cp, -math.cos(yaw) * cp, math.sin(pit))
    cam = tuple(Tt[i] + off[i] * D for i in range(3))
    f = tuple(-o for o in off)
    r = (f[1], -f[0], 0.0); rl = math.hypot(r[0], r[1]); r = (r[0] / rl, r[1] / rl, 0.0)
    u = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])
    return cam, f, r, u


def render(name):
    pr = CJ['presets'][name]
    cam, f, r, u = basis(pr)
    th = math.tan(math.radians(pr['fovDeg']) / 2)

    def P(p):
        d = (p[0] - cam[0], p[1] - cam[1], p[2] - cam[2])
        z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2]
        if z < 1:
            return None
        x = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / z / th / 1.6
        y = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / z / th
        return ((x + 1) * Wd_ / 2, (1 - y) * Hd_ / 2), z
    # sky card radius (mirror of the runtime)
    vfov = math.radians(pr['fovDeg']); pitch = math.radians(pr['pitchDeg'])
    R = cam[2] / math.tan(pitch - vfov / 2 + 0.2 * vfov)
    span = math.atan(th * 1.6) + 0.25
    fl = math.hypot(f[0], f[1])
    far = 0
    for p in COAST + [tuple(q) for q in CJ['bw_line']]:
        dx, dy = p[0] - cam[0], p[1] - cam[1]; d = math.hypot(dx, dy)
        if (dx * f[0] + dy * f[1]) / (d * fl) >= math.cos(span):
            far = max(far, d)
    if far:
        R = max(R, far + 14)
    hy = P((cam[0] + f[0] / fl * R, cam[1] + f[1] / fl * R, 0.0))[0][1]
    im = Image.new('RGB', (Wd_, Hd_), (36, 92, 118)); d = ImageDraw.Draw(im)
    for yy in range(0, int(hy)):
        k = yy / max(1, hy)
        d.line([(0, yy), (Wd_, yy)], fill=(int(120 + 110 * k), int(150 + 70 * k), int(200 - 10 * k)))
    items = []          # (depth, polygon, colour)
    # terrain quads
    xs = [p[0] for p in COAST]; ys = [p[1] for p in COAST]
    S = 5.0
    Hc = {}

    def hz(i, j):
        k = (i, j)
        if k not in Hc:
            x, y = min(xs) + i * S, min(ys) + j * S
            Hc[k] = T.height(x, y) if pip(x, y, COAST) else -3.0
        return Hc[k]
    ni, nj = int((max(xs) - min(xs)) / S) + 1, int((max(ys) - min(ys)) / S) + 1
    for i in range(ni):
        for j in range(nj):
            x, y = min(xs) + i * S, min(ys) + j * S
            c = (x + S / 2, y + S / 2)
            if not pip(c[0], c[1], COAST):
                continue
            q = [(x, y, hz(i, j)), (x + S, y, hz(i + 1, j)), (x + S, y + S, hz(i + 1, j + 1)), (x, y + S, hz(i, j + 1))]
            q = [(a, b, max(z, 0.0)) for a, b, z in q]
            pp = [P(v) for v in q]
            if any(v is None for v in pp):
                continue
            if math.hypot(c[0] - cam[0], c[1] - cam[1]) > R:
                continue
            zc = sum(v[2] for v in q) / 4
            # lambert with a golden sun from screen-left
            nx = (q[0][2] - q[1][2]) / S; ny = (q[0][2] - q[3][2]) / S
            n = (nx, ny, 1.0); nl = math.sqrt(sum(a * a for a in n)); n = tuple(a / nl for a in n)
            sun = (-0.79, -0.45, 0.42); sl = math.sqrt(sum(a * a for a in sun)); sun = tuple(a / sl for a in sun)
            lam = max(0.0, sum(n[k] * sun[k] for k in range(3)))
            fld = T.field_at(*c)
            base = (100, 140, 70) if fld is None else {'hay': (185, 178, 98), 'pasture': (135, 164, 87), 'plough': (142, 117, 86)}[fld['kind']]
            if zc > 20:
                base = (80, 110, 60)
            k = 0.55 + 0.6 * lam
            col = tuple(min(255, int(b * k)) for b in base)
            items.append((sum(v[1] for v in pp) / 4, [v[0] for v in pp], col))
    # lots: boxes (walls + roof)
    for L in CJ['lots']:
        c = L['c']; fdir = tuple(L['face']); t = perp(fdir)
        w, dd = L['w'], L['d']
        h = {'terrace': 8.0, 'cottage': 4.5, 'hamlet': 5.0, 'loft': 7.0, 'warehouse': 11.0, 'farmhouse': 5.5, 'barn': 6.0}.get(L['style'], 6)
        z0 = L['z']
        corners = [add(add(c, mul(fdir, dd / 2 * sx)), mul(t, w / 2 * sy)) for sx, sy in ((1, 1), (1, -1), (-1, -1), (-1, 1))]
        hue = [(200, 90, 70), (220, 200, 160), (90, 120, 160), (210, 160, 70), (160, 60, 50)][int(abs(c[0] * 7 + c[1] * 3)) % 5]
        roof = (60, 60, 70) if int(abs(c[0])) % 3 else (150, 60, 45)
        for a, b in zip(corners, corners[1:] + corners[:1]):
            q = [(*a, z0), (*b, z0), (*b, z0 + h), (*a, z0 + h)]
            pp = [P(v) for v in q]
            if any(v is None for v in pp):
                continue
            mid = lerp(a, b, 0.5); nrm = norm(sub(mid, c))
            lam = max(0.0, -0.79 * nrm[0] - 0.45 * nrm[1])
            fcol = tuple(int(x * (0.6 + 0.5 * lam)) for x in hue)
            items.append((sum(v[1] for v in pp) / 4 - 0.5, [v[0] for v in pp], fcol))
        top = [P((*a, z0 + h + 2.5)) for a in corners]
        if all(top):
            items.append((sum(v[1] for v in top) / 4 - 1.0, [v[0] for v in top], roof))
    # piers + hulls + the Pharos + breakwater
    for s in CJ['struct']:
        if s['kind'] in ('pier', 'finger', 'thead'):
            a, b, w = tuple(s['a']), tuple(s['b']), s['width']
            dd = norm(sub(b, a)); n = perp(dd)
            q = [add(a, mul(n, w / 2)), add(b, mul(n, w / 2)), add(b, mul(n, -w / 2)), add(a, mul(n, -w / 2))]
            pp = [P((*v, s.get('deck', 1.2))) for v in q]
            if all(pp):
                items.append((sum(v[1] for v in pp) / 4, [v[0] for v in pp], (150, 120, 90)))
    for b in CJ['berths'] + CJ['moorings']:
        c = tuple(b['pos'] if 'pos' in b else b['center']); dd = tuple(b['d']); cls = b['cls']
        L = CJ['hull']['loa'][cls]; Bm = CJ['hull']['beam'][cls]
        q = rect(c, dd, L, Bm)
        pp = [P((*v, 0.8)) for v in q]
        if all(pp):
            items.append((sum(v[1] for v in pp) / 4 - 0.3, [v[0] for v in pp], (235, 230, 215)))
            m = P((*c, {'flagship': 30, 'large': 22, 'medium': 16, 'small': 13, 'boat': 9, 'skiff': 6}[cls]))
            if m:
                items.append((m[1] - 0.6, [pp[0][0], m[0], pp[2][0]], (240, 236, 225)))
    lh = CJ['landmarks']['pharos']; p0 = lh['p']; z0 = lh['z']
    for k in range(10):
        a = P((p0[0] - 3, p0[1], z0 + k * 3.6)); b = P((p0[0] + 3, p0[1], z0 + k * 3.6 + 3.6))
    tw = [P((p0[0] + dx, p0[1] + dy, z)) for dx, dy, z in ((-4, 4, z0), (4, -4, z0), (2.6, -2.6, z0 + 34), (-2.6, 2.6, z0 + 34))]
    if all(tw):
        items.append((tw[0][1] - 8, [v[0] for v in tw], (225, 225, 220)))
        top = P((p0[0], p0[1], z0 + 35))
        items.append((tw[0][1] - 9, [(top[0][0] - 3, top[0][1] - 3), (top[0][0] + 3, top[0][1] - 3), (top[0][0] + 3, top[0][1] + 3), (top[0][0] - 3, top[0][1] + 3)], (255, 200, 90)))
    bw = [tuple(p) for p in CJ['bw_line']]
    for a, b in zip(bw, bw[1:]):
        dd = norm(sub(b, a)); n = perp(dd); w = CJ['bw_width']
        q = [add(a, mul(n, w / 2)), add(b, mul(n, w / 2)), add(b, mul(n, -w / 2)), add(a, mul(n, -w / 2))]
        pp = [P((*v, 3.2)) for v in q]
        if all(pp):
            items.append((sum(v[1] for v in pp) / 4, [v[0] for v in pp], (170, 165, 155)))
    items.sort(key=lambda t: -t[0])
    for _, poly, col in items:
        d.polygon(poly, fill=col)
    d.line([(0, hy), (Wd_, hy)], fill=(200, 200, 230))
    d.text((6, 6), f'{name}: band {hy / Hd_:.2f}', fill=(255, 255, 255))
    return im


if __name__ == '__main__':
    names = sys.argv[1:] or ['heart', 'overview']
    ims = [render(n) for n in names]
    out = Image.new('RGB', (Wd_, Hd_ * len(ims)))
    for i, im in enumerate(ims):
        out.paste(im, (0, i * Hd_))
    p = os.path.join(OUTD, 'preview.png')
    out.save(p)
    print(p)
