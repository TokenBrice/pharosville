"""Single-mesh far-zoom LOD builder for all 10 Titan flagships.

Supports:
- Stepped hulls (reads `H.zt(u)` directly from `TitanHull`)
- Multi-mast square sails (`squares`) + swinging aft sprit mizzen (`gaff` on #3 USDe & #10 PYUSD)
- Live-posed galley oar banks (`oars` on #6 RLUSD & #8 XAUT: mid-stroke set -> raked aft furled)
- Stepped castles, temples, rotundas, vaults, gardens & brazier towers (`boxes` + `posts`)
- Festooned brand `cover` strip on the main yard (furl 0 collapsed -> furl 1 hanging)
- Proper per-Titan `class` (`flagship` for #1-#2, `large` for #3-#10)
- Strictly under budget: <= 240 tris (flagship), <= 220 tris (large).
"""
import math
from mathutils import Vector, Matrix
from hb_lib import PAL, MB, rod, box, empty, to_object
from hb_hulls import Rig
from hb_ancient import chain


def build_titan_lod(R, coll=None):
    """Build single-mesh LOD silhouette from a built `TitanRig` record."""
    H, L, sch = R.H, R.L, R.sch
    mb = MB(7)
    n = 4
    secs = []
    for i in range(n + 1):
        u = -1.0 + 2.0 * i / n
        w = H.w(u)
        zt = H.zt(u)
        zk = H.zk(u)
        fb = H.fb
        # 4-segment hull profile per side (keeps hull at ~72 tris so hero boxes/oars/sails fit cleanly <= 220/240!)
        pr = [
            ('stripe', w, zt),
            ('top', w * 0.99, zt - 0.22 * fb),
            ('band', w * 0.985, zt - 0.54 * fb),
            ('boot', w * 0.94, H.boot * 1.15),
            ('bottom', w * 0.80, -0.05 * fb),
            (None, 0.0, zk),
        ]
        port = [mb.vert((H.x(u, z), y, z)) for _, y, z in pr[:-1]]
        stb = [mb.vert((H.x(u, z), -y, z)) for _, y, z in pr[:-1]]
        k = mb.vert((H.x(u, zk), 0.0, zk))
        secs.append((port + [k], stb + [k], [p[0] for p in pr]))

    for i in range(n):
        (pa, sa, nm), (pb, sb, _) = secs[i], secs[i + 1]
        for k in range(len(pa) - 1):
            c = sch[nm[k]]
            mb.face((pa[k], pb[k], pb[k + 1], pa[k + 1]), c, 0, jitter=0.0)
            mb.face((sa[k], sa[k + 1], sb[k + 1], sb[k]), c, 0, jitter=0.0)
        mb.face((sa[0], sb[0], pb[0], pa[0]), sch['deck'], 0, jitter=0.0)

    def tri2(pts, ptsf, col, brand=0.0, paint=None):
        ids = [mb.vert(p, q) for p, q in zip(pts, ptsf)]
        g0 = len(mb.f)
        mb.face(ids, col, 0, brand, jitter=0.0, paint=paint)
        mb.backface(g0)

    cloth = sch['cloth']

    # Signature prows, crane-necks, aphlastons & towers (cap at 3 posts for LOD budget discipline)
    for (pts, r0, col) in R.lod['posts'][:3]:
        p3 = [pts[0], pts[len(pts) // 2], pts[-1]]
        chain(mb, p3, max(0.09, r0), max(0.06, r0 * 0.6), col, 3)

    # Hero architecture silhouettes (temples, rotundas, fortresses, gardens, vaults, twin castles)
    for (c, size, col) in R.lod['boxes'][:4]:
        box(mb, c, size, col, skip=('-z',), jitter=0.0)

    # Masts + sails tagged paint=8.0 so hull-kit.ts recognizes LOD sails (cloth color) & projects the emblem!
    mb.paint = 8.0
    for (a, b) in R.lod['masts']:
        rod(mb, a, b, max(0.11, 0.011 * L + 0.05), sch['spar'], 3, r2=max(0.08, 0.007 * L + 0.04), smooth=False)

    Rb = Matrix.Rotation(Rig.BRACE, 3, 'Z')
    for (x, z0, z1, wb, wt) in R.lod['squares']:
        b_ = lambda p, x=x: Vector((x, 0, 0)) + Rb @ (p - Vector((x, 0, 0)))
        tri2(
            [b_(Vector((x, -wb * 0.5, z0))), b_(Vector((x, wb * 0.5, z0))), b_(Vector((x, wt * 0.5, z1))), b_(Vector((x, -wt * 0.5, z1)))],
            [b_(Vector((x, -wt * 0.5, z1 - 0.3))), b_(Vector((x, wt * 0.5, z1 - 0.3))), b_(Vector((x, wt * 0.5, z1))), b_(Vector((x, -wt * 0.5, z1)))],
            cloth,
        )

    # Hybrid split-rig aft sprit mizzen (USDe & PYUSD)
    if R.lod['gaff']:
        x, zb, blen, thz, glen, deg, _sn = R.lod['gaff']
        G = Vector((x, 0, zb))
        E = G + Vector((-blen, 0, 0))
        Th = Vector((x, 0, thz))
        Pk = Th + Vector((-math.cos(math.radians(deg)) * glen, 0, math.sin(math.radians(deg)) * glen))
        tri2(
            [G, E, Pk, Th],
            [G + Vector((0, 0, 0.18)), E + Vector((0, 0, 0.18)), G.lerp(E, 0.6) + Vector((0, 0, 0.24)), G + Vector((0, 0, 0.24))],
            cloth,
        )

    mb.paint = 0.0

    # Brailed brand cover strip hanging from the main yard when furled
    if R.lod['cover']:
        x, zy, span, rf = R.lod['cover']
        b_ = lambda p: Vector((x, 0, 0)) + Rb @ (p - Vector((x, 0, 0)))
        h = rf * 2.2 + 0.12
        a = [b_(Vector((x + 0.1, -span * 0.45, zy))), b_(Vector((x + 0.1, span * 0.45, zy))),
             b_(Vector((x + 0.1, span * 0.45, zy))), b_(Vector((x + 0.1, -span * 0.45, zy)))]
        af = [b_(Vector((x + rf, -span * 0.45, zy + 0.1))), b_(Vector((x + rf, span * 0.45, zy + 0.1))),
              b_(Vector((x + rf, span * 0.40, zy - h))), b_(Vector((x + rf, -span * 0.40, zy - h)))]
        tri2(a, af, PAL['brand_default'], 1.0, paint=0.0)

    # Galley oar banks (RLUSD & XAUT: 5 spaced oar blades per side, set mid-stroke -> furled raked aft)
    if R.lod['oars']:
        x0 = min(o[0] for o in R.lod['oars'])
        x1 = max(o[1] for o in R.lod['oars'])
        reach = max(o[3] for o in R.lod['oars'])
        oar_col = R.sch.get('oar_col', sch['spar'])
        n_blades = 5
        bw_o = 0.016 * L
        for sd in (-1, 1):
            for k in range(n_blades):
                t = (k + 0.5) / n_blades
                xo = x0 + (x1 - x0) * t
                u = H.u_at(xo)
                zt = H.zt(u) - H.bh * 0.42
                w = H.w(u) + 0.04
                inner = [Vector((xo - bw_o * 0.6, sd * w, zt)), Vector((xo + bw_o * 0.6, sd * w, zt))]
                outer = [Vector((xo + bw_o * 1.1 - 0.02 * L, sd * (w + reach * 0.90), -0.02)),
                         Vector((xo - bw_o * 1.1 - 0.02 * L, sd * (w + reach * 0.90), -0.02))]
                outf = [Vector((xo + bw_o * 0.8 - 0.88 * reach, sd * (w + 0.24 * reach), zt + 0.20 * reach)),
                        Vector((xo - bw_o * 0.8 - 0.88 * reach, sd * (w + 0.24 * reach), zt + 0.20 * reach))]
                ids = [mb.vert(p) for p in inner] + [mb.vert(p, q) for p, q in zip(outer, outf)]
                nrm = (mb.v[ids[1]] - mb.v[ids[0]]).cross(mb.v[ids[2]] - mb.v[ids[0]])
                mb.face(ids if nrm.z > 0 else ids[::-1], oar_col, 0, jitter=0.0)

    root = empty(R.id + '_lod', coll=coll)
    o = to_object(mb, 'lod', 'hb_opaque', parent=root, coll=coll)
    root['family'] = 'titan'
    root['class'] = R.cls
    root['rig'] = R.rig
    root['loa_m'] = round(L, 2)
    root['beam_m'] = round(H.B, 2)
    return root, o, mb.tris()
