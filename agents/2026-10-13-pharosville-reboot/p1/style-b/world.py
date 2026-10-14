"""World assembly: terrain, layout of kit pieces, sea (SDF + chart ink), sky, lights, cameras, states."""
import bpy, bmesh, math, random, os, json
import numpy as np
from mathutils import Vector, Matrix, noise
from lib import *
import lib
import mats
import terrain
from terrain import uv2w, w2uv

PITCH = math.radians(35.0)
FOV = math.radians(25.0)
FWD = Vector((1, 1, 0)).normalized()      # camera forward on the ground (yaw 45)
RIGHT = Vector((1, -1, 0)).normalized()
BEND_S0, BEND_R = 105.0, 100.0
OV_DIST = 335.0
HZ_FRAC = 0.855
SDF_N, SDF_SPAN = 1024, 420.0             # sea SDF texture covers SDF_SPAN metres around SDF_C
SDF_DMAX = 60.0


def W3(u, v, z=0.0):
    x, y = uv2w(u, v)
    return Vector((x, y, z))


class World:
    def __init__(self, layout, grey=False):
        self.L = layout
        self.grey = grey
        self.land = terrain.Land(layout)
        self.cams = {}
        self.lights = {}
        self.objs = []
        self.contacts = []     # (x, y, r) circles for contact foam (piles, rocks)
        self.contact_polys = []
        self.wakes = []        # (a, b, w0, w1, k)
        self.lamps = []        # (pos Vector, kind)
        self.pillars = []
        self.windows_lights = []
        self.ov_target = W3(4, 24, 4.0)
        self.solve_bend()
        self.SDF_C = Vector((self.ov_target.x, self.ov_target.y))

    def solve_bend(self):
        """Pick the bend radius so the horizon sits at HZ_FRAC of the overview frame (runtime: one uniform)."""
        global BEND_R
        H = OV_DIST * math.sin(PITCH) + self.ov_target.z
        X = OV_DIST * math.cos(PITCH)
        want = PITCH - math.atan((HZ_FRAC - 0.5) * 2 * math.tan(FOV / 2))
        def hz(R):
            return min(math.atan2(H + max(0, s - BEND_S0) ** 2 / (2 * R), X + s) for s in np.arange(0, 1500, 0.5))
        lo, hi = 5.0, 3000.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if hz(mid) > want:
                lo = mid
            else:
                hi = mid
        BEND_R = (lo + hi) / 2
        self.e_h = -hz(BEND_R)
        self.e_top = -(PITCH - FOV / 2)
        print('BEND_R', round(BEND_R, 1), 'horizon el', round(math.degrees(self.e_h), 2))

    # ------------------------------------------------------------ build
    def build(self):
        self.build_terrain()
        import layout
        layout.populate(self)
        self.build_sdf()
        self.build_overlay()
        self.build_sea()
        self.build_sky()
        self.build_lights()
        self.build_cameras()
        self.outline_pass()

    def build_terrain(self):
        L = self.L
        step = 1.5
        xs = np.arange(-110, 150 + step, step)
        ys = np.arange(-100, 150 + step, step)
        X, Y = np.meshgrid(xs, ys)
        H = self.land.height(X, Y)
        self.H, self.xs, self.ys = H, xs, ys
        sd = self.land.sd
        kit = Kit('terrain')
        bm = kit.bm
        ny, nx = H.shape
        keep = np.zeros_like(H, bool)
        vid = {}
        verts = {}
        for j in range(ny - 1):
            for i in range(nx - 1):
                hs = (H[j, i], H[j, i + 1], H[j + 1, i + 1], H[j + 1, i])
                if max(hs) < -1.2:
                    continue
                q = []
                for (jj, ii) in ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)):
                    k = (jj, ii)
                    if k not in verts:
                        verts[k] = bm.verts.new((xs[ii], ys[jj], H[jj, ii]))
                    q.append(verts[k])
                # split along the shorter diagonal-ish (consistent)
                f1 = bm.faces.new((q[0], q[1], q[2]))
                f2 = bm.faces.new((q[0], q[2], q[3]))
        bm.normal_update()
        P = PALETTE
        rng = random.Random(3)
        qx = L['quay_x']

        import layout as _lay

        def vcol(v):
            c = v.co
            n = v.normal
            z = c.z
            slope = 1 - n.z
            nb = noise.noise(Vector((c.x * 0.05, c.y * 0.05, 0.3)))
            nf = noise.noise(Vector((c.x * 0.12, c.y * 0.12, 2.1)))
            g = lib.P['grass']
            g = mixc(g, lib.P['grass_dry'], max(0.0, min(1.0, (nb - 0.1) * 2.5)))
            g = mixc(g, lib.P['grass_deep'], max(0.0, min(1.0, (-nb - 0.2) * 2.5)))
            zc = _lay.zone(L, c.x, c.y, z)
            if zc is not None:
                g = mixc(g, zc, 0.9)
            band = math.sin(z * 1.7 + nf * 2.0)
            rk = mixc(lib.P['rock'], lib.P['rock_dark'], max(0.0, min(1.0, band * 1.6)))
            rk = mixc(rk, mixc(lib.P['rock'], lib.P['stone_warm'], 0.45), max(0.0, min(1.0, -band * 1.4 - 0.4)))
            rk = mixc(rk, lib.P['rock_wet'], max(0.0, min(1.0, (0.9 - z) / 0.9)))
            t_rock = max(0.0, min(1.0, (slope - 0.3) / 0.18))
            if z < 1.6 and zc is None:
                t_rock = max(t_rock, max(0.0, min(1.0, (slope - 0.08) / 0.1)))
            col = mixc(g, rk, t_rock)
            if zc is None:
                t_sand = max(0.0, min(1.0, (1.4 - z) / 0.6)) * (1 - t_rock)
                col = mixc(col, lib.P['sand'], t_sand)
            return col
        cmap = {v: vcol(v) for v in bm.verts}
        mi = kit.mat('ground')
        for f in bm.faces:
            f.material_index = mi
            f.smooth = True
            for lp in f.loops:
                lp[kit.cl] = (*cmap[lp.vert], 1.0)
            kit.smooth.add(f)
        ob = kit.finish(outline=False)
        ob['family'] = 'terrain'
        ob['inkmask'] = 0.35
        self.terrain_ob = ob
        self.objs.append(ob)

    def ground_z(self, x, y):
        """Bilinear sample of the heightfield."""
        xs, ys, H = self.xs, self.ys, self.H
        fx = (x - xs[0]) / (xs[1] - xs[0])
        fy = (y - ys[0]) / (ys[1] - ys[0])
        i, j = int(math.floor(fx)), int(math.floor(fy))
        i = min(max(i, 0), len(xs) - 2)
        j = min(max(j, 0), len(ys) - 2)
        tx, ty = fx - i, fy - j
        h = (H[j, i] * (1 - tx) * (1 - ty) + H[j, i + 1] * tx * (1 - ty) + H[j + 1, i] * (1 - tx) * ty + H[j + 1, i + 1] * tx * ty)
        return float(h)

    # ------------------------------------------------------------ SDF
    def build_sdf(self):
        n, span = SDF_N, SDF_SPAN
        c = self.SDF_C
        g = (np.arange(n) + 0.5) / n * span - span / 2
        X, Y = np.meshgrid(g + c.x, g + c.y)
        P = np.stack([X.ravel(), Y.ravel()], 1).astype(np.float32)
        sd = terrain.signed_dist(P, self.land.poly)
        d_coast = np.maximum(-sd, 0)
        # contacts: breakwater + structure polygons + circles
        d_ct = d_coast.copy()
        for poly in self.contact_polys:
            s2 = terrain.signed_dist(P, poly)
            d_coast = np.minimum(d_coast, np.maximum(-s2, 0))
            d_ct = np.minimum(d_ct, np.maximum(-s2, 0))
        for poly in getattr(self, 'hull_polys', []):
            s2 = terrain.signed_dist(P, poly)
            d_ct = np.minimum(d_ct, np.maximum(-s2, 0))
        for (x, y, r) in self.contacts:
            m = (np.abs(P[:, 0] - x) < 12) & (np.abs(P[:, 1] - y) < 12)
            dd = np.maximum(np.hypot(P[m, 0] - x, P[m, 1] - y) - r, 0)
            d_ct[m] = np.minimum(d_ct[m], dd)
        wk = np.zeros(len(P), np.float32)
        for (a, b, w0, w1, k) in self.wakes:
            a = np.array(a, np.float32); b = np.array(b, np.float32); ab = b - a
            t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
            dd = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
            w = w0 + (w1 - w0) * t
            wk = np.maximum(wk, k * np.exp(-(dd / w) ** 2) * (1 - t) ** 1.3)
        img = bpy.data.images.new('sea_sdf', n, n, float_buffer=True, alpha=False)
        px = np.zeros((n * n, 4), np.float32)
        px[:, 0] = np.clip(d_coast / SDF_DMAX, 0, 1)
        px[:, 1] = np.clip(d_ct / 12.0, 0, 1)
        px[:, 2] = wk
        px[:, 3] = 1
        img.pixels.foreach_set(px.ravel())
        path = os.path.join(HERE, 'tex', 'sea_sdf.exr')
        img.filepath_raw = path
        img.file_format = 'OPEN_EXR'
        img.save()
        bpy.data.images.remove(img)
        self.sdf_img = bpy.data.images.load(path, check_existing=False)
        self.sdf_img.colorspace_settings.name = 'Non-Color'
        print('SDF ok', float(d_coast.max()))

    # ------------------------------------------------------------ chart overlay (rhumb lines + compass rose)
    def build_overlay(self):
        from PIL import Image, ImageDraw
        N_, span = 3072, 640.0
        ox, oy = self.SDF_C.x - span / 2, self.SDF_C.y - span / 2
        self.overlay_origin = (ox, oy, span)
        SS = 2
        im = Image.new('L', (N_ * SS, N_ * SS), 0)
        d = ImageDraw.Draw(im)
        def px(x, y):
            return ((x - ox) / span * N_ * SS, (1 - (y - oy) / span) * N_ * SS)
        roses = [(uv2w(80, -52), 17.0, True), (uv2w(-190, -10), 0.0, False)]
        for (cx, cy), R, draw_rose in roses:
            for i in range(32):
                if i % 2 == 1:
                    continue
                a = 2 * math.pi * i / 32 + math.radians(45)
                wdt = 3 if i % 4 == 0 else 2
                x1, y1 = cx + math.cos(a) * (R * 1.05 if draw_rose else 0), cy + math.sin(a) * (R * 1.05 if draw_rose else 0)
                x2, y2 = cx + math.cos(a) * 900, cy + math.sin(a) * 900
                # dashed lines for the minor winds (chart convention)
                if i % 2 == 1:
                    L_ = 900 - (R * 1.05 if draw_rose else 0)
                    nd = int(L_ / 6)
                    for j in range(0, nd, 2):
                        t0, t1 = j / nd, (j + 1) / nd
                        d.line([px(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0), px(x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1)], fill=150, width=wdt)
                else:
                    d.line([px(x1, y1), px(x2, y2)], fill=200 if i % 4 == 0 else 170, width=wdt)
            if draw_rose:
                for rr, wd in ((R, 4), (R * 1.05, 2), (R * 0.62, 2), (R * 0.2, 2)):
                    x0_, y0_ = px(cx - rr, cy + rr); x1_, y1_ = px(cx + rr, cy - rr)
                    d.ellipse((x0_, y0_, x1_, y1_), outline=255, width=wd)
                # 16-point star: alternating long/short points, half-filled (engraved)
                for i in range(16):
                    a = 2 * math.pi * i / 16 + math.radians(45)
                    lng = R * (0.98 if i % 4 == 0 else (0.72 if i % 2 == 0 else 0.5))
                    wa = math.radians(11.25 if i % 4 == 0 else 9)
                    tip = (cx + math.cos(a) * lng, cy + math.sin(a) * lng)
                    l_ = (cx + math.cos(a + wa) * lng * 0.22, cy + math.sin(a + wa) * lng * 0.22)
                    r_ = (cx + math.cos(a - wa) * lng * 0.22, cy + math.sin(a - wa) * lng * 0.22)
                    d.polygon([px(*tip), px(*l_), px(cx, cy)], fill=235)
                    d.polygon([px(*tip), px(*r_), px(cx, cy)], outline=255, width=2)
                # north marker (fleur stand-in: a small triangle beyond the ring) toward map-north = screen up
                a = math.radians(45)
                t0 = (cx + math.cos(a) * R * 1.32, cy + math.sin(a) * R * 1.32)
                d.polygon([px(*t0), px(cx + math.cos(a + 0.12) * R * 1.08, cy + math.sin(a + 0.12) * R * 1.08),
                           px(cx + math.cos(a - 0.12) * R * 1.08, cy + math.sin(a - 0.12) * R * 1.08)], fill=255)
        im = im.resize((N_, N_), Image.LANCZOS)
        rgba = Image.merge('RGBA', (im, im, im, im))
        path = os.path.join(HERE, 'tex', 'chart_overlay.png')
        rgba.save(path)
        img = bpy.data.images.load(path, check_existing=False)
        img.name = 'chart_overlay.png'
        img.colorspace_settings.name = 'Non-Color'

    # ------------------------------------------------------------ sea
    def build_sea(self):
        T = self.ov_target
        lat = np.arange(-460, 461, 20.0)
        s_near = np.arange(-420, BEND_S0, 20.0)
        s_far = np.arange(BEND_S0, BEND_S0 + 420, 2.5)
        ss = np.concatenate([s_near, s_far])
        bm = bmesh.new()
        rows = []
        for s in ss:
            drop = max(0.0, s - BEND_S0) ** 2 / (2 * BEND_R)
            row = []
            for l in lat:
                p = Vector((T.x, T.y, 0)) + FWD * s + RIGHT * l
                row.append(bm.verts.new((p.x, p.y, -drop)))
            rows.append(row)
        for a, b in zip(rows, rows[1:]):
            for j in range(len(a) - 1):
                bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
        me = bpy.data.meshes.new('sea')
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new('sea', me)
        bpy.context.scene.collection.objects.link(ob)
        me.materials.append(self.sea_mat())
        ob.visible_shadow = False
        ob['family'] = 'sea'
        self.sea_ob = ob

    def sea_mat(self):
        m, nt, out = new_mat('sea')
        s = mats.S(nt)
        geo = N(nt, 'ShaderNodeNewGeometry')
        P = geo.outputs['Position']
        px, py, pz = sep_xyz(nt, P)
        c = self.SDF_C
        uvx = add(nt, math_(nt, 'DIVIDE', sub(nt, px, c.x), SDF_SPAN), 0.5)
        uvy = add(nt, math_(nt, 'DIVIDE', sub(nt, py, c.y), SDF_SPAN), 0.5)
        tex = N(nt, 'ShaderNodeTexImage', interpolation='Linear', extension='EXTEND')
        tex.image = self.sdf_img
        L(nt, comb_xyz(nt, uvx, uvy, 0), tex.inputs['Vector'])
        sp = N(nt, 'ShaderNodeSeparateColor'); L(nt, tex.outputs['Color'], sp.inputs[0])
        d = mul(nt, sp.outputs['Red'], SDF_DMAX)
        dc = mul(nt, sp.outputs['Green'], 12.0)
        wake = sp.outputs['Blue']
        n1 = noise_tex(nt, vmath(nt, 'SCALE', P, scale=0.08), 1.0, 2.0, 0.5)
        n2 = noise_tex(nt, vmath(nt, 'SCALE', P, scale=0.5), 1.0, 2.0, 0.5)
        n3 = noise_tex(nt, vmath(nt, 'SCALE', P, scale=1.6), 1.0, 1.0, 0.5)
        dn = add(nt, d, mul(nt, sub(nt, n1, 0.5), 3.0))
        # forward distance (for haze + bend awareness)
        T = self.ov_target
        sfw = vmath(nt, 'DOT_PRODUCT', vmath(nt, 'SUBTRACT', P, (T.x, T.y, 0.0)), (FWD.x, FWD.y, 0.0))
        # depth wash
        col = ramp(nt, mrange(nt, dn, 0.0, 45.0, smooth=False), [
            (0.0, lin('#C9DACB')), (0.05, lin('#A9C8C6')), (0.16, lin('#86B0B9')), (0.38, lin('#6795AB')),
            (0.75, lin('#4A7894')), (1.0, lin('#3F6A88'))], name='SEA_RAMP')
        fgk = mul(nt, mrange(nt, sfw, -40.0, -190.0), value(nt, 0.0, 'SEA_FG_K'))
        col = mix(nt, mul(nt, fgk, mrange(nt, dn, 2.0, 14.0)), col, rgb(nt, (0.1, 0.2, 0.3), 'SEA_FG'))
        # waterlining: engraved lines parallel to the coast, spacing grows offshore
        wl = math_(nt, 'SQRT', math_(nt, 'MAXIMUM', sub(nt, dn, 1.2), 0.0))
        wf = math_(nt, 'FRACT', mul(nt, wl, 1.05))
        wline = mrange(nt, math_(nt, 'MINIMUM', wf, sub(nt, 1.0, wf)), 0.07, 0.025)
        wfade = mul(nt, mrange(nt, dn, 30.0, 4.0), mrange(nt, dn, 1.0, 2.2))
        inkc = value(nt, 0.0, 'SEA_INK_K')
        sea_ink = rgb(nt, lin('#2E4B60'), 'SEA_INK')
        col = mix(nt, mul(nt, mul(nt, wline, wfade), mul(nt, inkc, 0.55)), col, sea_ink)
        # hatched shallows
        hd = vmath(nt, 'DOT_PRODUCT', P, (0.71, 0.71, 0.0))
        hh = math_(nt, 'SINE', mul(nt, math_(nt, 'DIVIDE', hd, mul(nt, s('hatch_sp'), 1.1)), 2 * math.pi))
        hl = mul(nt, mrange(nt, hh, 0.55, 0.9), mrange(nt, dn, 9.0, 2.0))
        col = mix(nt, mul(nt, hl, mul(nt, inkc, 0.30)), col, sea_ink)
        # engraved swell strokes offshore (calm: sparse dashes)
        q = add(nt, vmath(nt, 'DOT_PRODUCT', P, (0.28, 0.96, 0.0)),
                mul(nt, math_(nt, 'SINE', mul(nt, vmath(nt, 'DOT_PRODUCT', P, (0.96, -0.28, 0.0)), 0.045)), 2.5))
        qf = math_(nt, 'FRACT', math_(nt, 'DIVIDE', q, 5.5))
        sline = mrange(nt, math_(nt, 'MINIMUM', qf, sub(nt, 1.0, qf)), 0.06, 0.015)
        dash = mrange(nt, noise_tex(nt, comb_xyz(nt, mul(nt, vmath(nt, 'DOT_PRODUCT', P, (0.96, -0.28, 0.0)), 0.05),
                                                   mul(nt, q, 0.18), 0.0), 1.0, 1.0, 0.5), 0.52, 0.62)
        sfade = mul(nt, mrange(nt, dn, 12.0, 26.0), mrange(nt, sfw, BEND_S0 + 30, BEND_S0 - 40))
        col = mix(nt, mul(nt, mul(nt, mul(nt, sline, dash), sfade), mul(nt, inkc, 0.45)), col, sea_ink)
        # chart overlay (rhumb lines + compass rose)
        ov = bpy.data.images.get('chart_overlay.png')
        if ov is not None:
            o0 = self.overlay_origin
            otx = N(nt, 'ShaderNodeTexImage', interpolation='Linear', extension='CLIP'); otx.image = ov
            L(nt, comb_xyz(nt, math_(nt, 'DIVIDE', sub(nt, px, o0[0]), o0[2]), math_(nt, 'DIVIDE', sub(nt, py, o0[1]), o0[2]), 0), otx.inputs['Vector'])
            ovk = value(nt, 0.0, 'OVERLAY_K')
            col = mix(nt, mul(nt, mul(nt, otx.outputs['Alpha'], ovk), mrange(nt, dn, 3.0, 8.0)), col, sea_ink)
        # lighting: shadows + lamp pools via the same irradiance probe as the wash
        dif = N(nt, 'ShaderNodeBsdfDiffuse'); dif.inputs['Color'].default_value = (1, 1, 1, 1)
        s2r = N(nt, 'ShaderNodeShaderToRGB'); L(nt, dif.outputs[0], s2r.inputs[0])
        bw = N(nt, 'ShaderNodeRGBToBW'); L(nt, s2r.outputs[0], bw.inputs[0])
        lum = bw.outputs[0]
        tl = mrange(nt, lum, s('ramp_lo'), s('ramp_hi'))
        lvl = value(nt, 1.0, 'SEA_LVL')
        shadowed = mix(nt, 1.0, col, mix(nt, value(nt, 0.3, 'SEA_SH_K'), s('shadow_tint'), (1.0, 1.0, 1.0)), blend='MULTIPLY')
        col = mix(nt, tl, shadowed, col)
        col = vmath(nt, 'SCALE', col, scale=lvl)
        # warm lamp pools on the water at night: add hue of point-light irradiance
        hue_add = vmath(nt, 'SCALE', s2r.outputs[0], scale=value(nt, 0.0, 'SEA_LAMP_K'))
        col = mix(nt, 1.0, col, hue_add, blend='ADD')
        # sky reflection at grazing angles + sun/moon glitter (procedural normal)
        V = vmath(nt, 'NORMALIZE', geo.outputs['Incoming'])
        _, _, vz = sep_xyz(nt, V)
        fres = math_(nt, 'POWER', sub(nt, 1.0, math_(nt, 'ABSOLUTE', vz)), 4.0)
        skyc = rgb(nt, (0.8, 0.7, 0.6), 'SEA_SKY')
        col = mix(nt, mul(nt, fres, value(nt, 0.6, 'SEA_SKY_K')), col, skyc)
        # foam: shore band, contact rings, wakes
        fn = sub(nt, n2, 0.5)
        f_shore = mrange(nt, add(nt, d, mul(nt, fn, 1.2)), 0.9, 0.35)
        f_ring = mul(nt, mrange(nt, math_(nt, 'ABSOLUTE', sub(nt, add(nt, d, mul(nt, fn, 1.6)), 2.3)), 0.28, 0.08), mrange(nt, n3, 0.42, 0.55))
        f_ct = mrange(nt, add(nt, dc, mul(nt, fn, 0.5)), 0.42, 0.12)
        f_ct2 = mul(nt, mrange(nt, math_(nt, 'ABSOLUTE', sub(nt, dc, 1.0)), 0.18, 0.05), mrange(nt, n3, 0.45, 0.6))
        f_wk = mul(nt, wake, mrange(nt, n3, 0.25, 0.6))
        foam = math_(nt, 'MAXIMUM', math_(nt, 'MAXIMUM', f_shore, mul(nt, f_ring, 0.8)), math_(nt, 'MAXIMUM', f_ct, math_(nt, 'MAXIMUM', mul(nt, f_ct2, 0.7), f_wk)))
        fcol = rgb(nt, lin('#F7F1E3'), 'FOAM')
        fcol = vmath(nt, 'SCALE', fcol, scale=add(nt, 0.55, mul(nt, tl, 0.45)))
        col = mix(nt, foam, col, fcol)
        _, _, lz_ = sep_xyz(nt, s('sun_dir'))
        ck = mrange(nt, noise_tex(nt, vmath(nt, 'SCALE', P, scale=0.011), 1.0, 3.0, 0.55), sub(nt, 0.6, s('cloud_cov')), sub(nt, 0.7, s('cloud_cov')))
        col = vmath(nt, 'SCALE', col, scale=sub(nt, 1.0, mul(nt, ck, 0.22)))
        # horizon haze (bent world): fade to horizon colour, fully closed at the tangent line
        hz = rgb(nt, (0.8, 0.7, 0.6), 'HAZE')
        hk = mrange(nt, sfw, BEND_S0 - 50, BEND_S0 + 45)
        col = mix(nt, mul(nt, hk, value(nt, 0.9, 'HAZE_K')), col, hz)
        # anisotropic micro-slopes: long along camera-forward (stretches the path toward the viewer), tight across
        n_f = sub(nt, noise_tex(nt, comb_xyz(nt, mul(nt, vmath(nt, 'DOT_PRODUCT', P, (FWD.x, FWD.y, 0.0)), 1.7),
                                              mul(nt, vmath(nt, 'DOT_PRODUCT', P, (RIGHT.x, RIGHT.y, 0.0)), 0.55), 0.0), 1.0, 2.0, 0.6), 0.5)
        n_r = sub(nt, noise_tex(nt, comb_xyz(nt, mul(nt, vmath(nt, 'DOT_PRODUCT', P, (FWD.x, FWD.y, 0.0)), 2.4),
                                              mul(nt, vmath(nt, 'DOT_PRODUCT', P, (RIGHT.x, RIGHT.y, 0.0)), 0.8), 3.0), 1.0, 2.0, 0.6), 0.5)
        tilt = vmath(nt, 'ADD', vmath(nt, 'SCALE', (FWD.x, FWD.y, 0.0), scale=mul(nt, n_f, 0.6)),
                     vmath(nt, 'SCALE', (RIGHT.x, RIGHT.y, 0.0), scale=mul(nt, n_r, 0.06)))
        nn = vmath(nt, 'NORMALIZE', vmath(nt, 'ADD', tilt, (0.0, 0.0, 1.0)))
        R = vmath(nt, 'REFLECT', vmath(nt, 'SCALE', V, scale=-1.0), nn)
        g = math_(nt, 'MAXIMUM', vmath(nt, 'DOT_PRODUCT', R, s('spec_dir')), 0.0)
        glow = math_(nt, 'POWER', g, 380.0)
        spark = mrange(nt, math_(nt, 'POWER', g, 2600.0), 0.3, 0.8)
        gk = value(nt, 0.0, 'SEA_GLINT_K')
        col = mix(nt, mul(nt, add(nt, mul(nt, glow, 0.55), mul(nt, spark, 0.9)), gk), col, s('spec_col'), blend='ADD')
        em = N(nt, 'ShaderNodeEmission'); L(nt, col, em.inputs['Color'])
        L(nt, em.outputs[0], out.inputs['Surface'])
        aov = N(nt, 'ShaderNodeOutputAOV'); aov.aov_name = 'inkmask'; aov.inputs['Value'].default_value = 0.0
        self.sea_nodes = nt.nodes
        return m

    # ------------------------------------------------------------ sky
    def build_sky(self):
        wt = bpy.data.worlds.new('W')
        bpy.context.scene.world = wt
        try:
            wt.use_nodes = True
        except Exception:
            pass
        nt = wt.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = N(nt, 'ShaderNodeOutputWorld')
        tc = N(nt, 'ShaderNodeTexCoord')
        D = vmath(nt, 'NORMALIZE', tc.outputs['Generated'])
        dx, dy, dz = sep_xyz(nt, D)
        el = math_(nt, 'ARCSINE', dz)
        eh = value(nt, self.e_h, 'EL_H')
        et = value(nt, self.e_top, 'EL_TOP')
        t = math_(nt, 'DIVIDE', sub(nt, el, eh), sub(nt, et, eh))
        col = ramp(nt, math_(nt, 'MAXIMUM', t, 0.0), [(0, (1, 1, 1)), (1, (0, 0, 0))], name='SKY_RAMP')
        # paper wash mottling in the sky
        nb = noise_tex(nt, vmath(nt, 'SCALE', D, scale=9.0), 1.0, 3.0, 0.55)
        col = vmath(nt, 'SCALE', col, scale=add(nt, 0.97, mul(nt, nb, 0.06)))
        # sun / moon disc + halo
        sdn = N(nt, 'ShaderNodeCombineXYZ'); sdn.name = 'SUNDIR'; sdn.inputs[2].default_value = 1.0
        sd = sdn.outputs[0]
        cosang = vmath(nt, 'DOT_PRODUCT', D, sd)
        ang = math_(nt, 'ARCCOSINE', math_(nt, 'MINIMUM', cosang, 1.0))
        disc = mrange(nt, ang, value(nt, 0.0105, 'DISC_R'), mul(nt, value(nt, 0.0105, 'DISC_R2'), 0.85))
        halo = math_(nt, 'EXPONENT', mul(nt, ang, -18.0))
        halo2 = math_(nt, 'EXPONENT', mul(nt, ang, -4.0))
        # engraved rays around the sun (chart sun)
        upv = vmath(nt, 'NORMALIZE', vmath(nt, 'CROSS_PRODUCT', sd, (0, 0, 1)))
        upv2 = vmath(nt, 'CROSS_PRODUCT', upv, sd)
        ax = vmath(nt, 'DOT_PRODUCT', D, upv)
        ay = vmath(nt, 'DOT_PRODUCT', D, upv2)
        th = math_(nt, 'ARCTAN2', ay, ax)
        rays = mrange(nt, math_(nt, 'COSINE', mul(nt, th, 24.0)), 0.8, 0.985)
        rayk = mul(nt, mul(nt, rays, mrange(nt, ang, 0.011, 0.02)), mrange(nt, ang, 0.042, 0.016))
        gcol = rgb(nt, (1, 1, 1), 'GLOW_COL')
        gk = value(nt, 1.0, 'GLOW_K')
        rk = value(nt, 0.0, 'RAY_K')
        col = mix(nt, mul(nt, mul(nt, halo2, 0.35), gk), col, gcol, blend='ADD')
        col = mix(nt, mul(nt, mul(nt, halo, 0.6), gk), col, gcol, blend='ADD')
        col = mix(nt, mul(nt, rayk, rk), col, gcol, blend='ADD')
        dcol = rgb(nt, (1, 1, 1), 'DISC_COL')
        col = mix(nt, mul(nt, disc, value(nt, 1.0, 'DISC_K')), col, dcol)
        # moon crescent shading (night): darken one side of the disc
        moon_sh = mul(nt, mul(nt, disc, mrange(nt, add(nt, ax, mul(nt, ang, 0.0)), -0.004, 0.009)), value(nt, 0.0, 'MOON_K'))
        col = mix(nt, mul(nt, moon_sh, 0.75), col, rgb(nt, (0.2, 0.22, 0.4), 'MOON_SH'))
        # ink stars: voronoi cells, 4-point astroid glyph
        vor = N(nt, 'ShaderNodeTexVoronoi'); vor.voronoi_dimensions = '3D'
        vor.inputs['Scale'].default_value = 140.0
        L(nt, D, vor.inputs['Vector'])
        loc = vmath(nt, 'SCALE', vmath(nt, 'SUBTRACT', D, vor.outputs['Position']), scale=140.0)
        lx = vmath(nt, 'DOT_PRODUCT', loc, upv)
        ly = vmath(nt, 'DOT_PRODUCT', loc, upv2)
        ast = add(nt, math_(nt, 'SQRT', math_(nt, 'ABSOLUTE', lx)), math_(nt, 'SQRT', math_(nt, 'ABSOLUTE', ly)))
        sep = N(nt, 'ShaderNodeSeparateColor'); L(nt, vor.outputs['Color'], sep.inputs[0])
        rnd = sep.outputs['Red']
        big = mrange(nt, rnd, 0.93, 0.995)
        rad = add(nt, 0.18, mul(nt, big, 0.35))
        star = mul(nt, mrange(nt, ast, rad, mul(nt, rad, 0.6)), mrange(nt, rnd, 0.55, 0.75))
        sk = value(nt, 0.0, 'STAR_K')
        star = mul(nt, mul(nt, star, sk), mrange(nt, t, 0.05, 0.35))
        col = mix(nt, star, col, rgb(nt, lin('#F4E3B5'), 'STAR_COL'))
        # lighting for objects (non-camera rays): flat ambient colour
        lp = N(nt, 'ShaderNodeLightPath')
        amb = rgb(nt, (0.5, 0.5, 0.5), 'AMBIENT')
        fin = mix(nt, lp.outputs['Is Camera Ray'], amb, col)
        bg = N(nt, 'ShaderNodeBackground'); L(nt, fin, bg.inputs['Color'])
        L(nt, bg.outputs[0], out.inputs['Surface'])
        self.sky_nodes = nt.nodes
        # cloud banks (sprites beyond the horizon)
        self.clouds = []
        cm = self.cloud_mat()
        eh = math.degrees(self.e_h)
        for i, (az, de, w_, k) in enumerate([(-22.0, 0.55, 95, 2), (-1.5, -0.3, 165, 0), (13.0, 0.2, 120, 1),
                                            (22.5, 1.6, 80, 3), (5.5, 2.3, 50, 3), (-9.0, 2.6, 38, 1),
                                            (-16.0, -0.05, 170, 4), (17.0, 0.45, 190, 5), (-3.0, 1.35, 120, 5)]):
            self.clouds.append(self.cloud_card(f'cloud{i}', az, eh + de, w_, k, cm))

    def cloud_mat(self):
        mt = {}
        for k in range(6):
            m, nt, out = new_mat(f'cloud{k}')
            img = bpy.data.images.load(os.path.join(HERE, 'tex', f'cloud_{k}.png'), check_existing=True)
            img.colorspace_settings.name = 'Non-Color'
            u = N(nt, 'ShaderNodeUVMap')
            tx = N(nt, 'ShaderNodeTexImage', interpolation='Linear', extension='CLIP'); tx.image = img
            L(nt, u.outputs['UV'], tx.inputs['Vector'])
            sp = N(nt, 'ShaderNodeSeparateColor'); L(nt, tx.outputs['Color'], sp.inputs[0])
            g = bpy.data.node_groups.get('CloudState')
            if g is None:
                g = bpy.data.node_groups.new('CloudState', 'ShaderNodeTree')
                go = g.nodes.new('NodeGroupOutput')
                for nm, d in (('lit', (1, 0.9, 0.8)), ('shade', (0.6, 0.55, 0.7)), ('ink', (0.1, 0.07, 0.05))):
                    g.interface.new_socket(nm, in_out='OUTPUT', socket_type='NodeSocketColor')
                    n = g.nodes.new('ShaderNodeRGB'); n.name = nm; n.outputs[0].default_value = (*d, 1)
                    g.links.new(n.outputs[0], go.inputs[nm])
                for nm, d in (('ink_k', 0.7), ('alpha_k', 1.0)):
                    g.interface.new_socket(nm, in_out='OUTPUT', socket_type='NodeSocketFloat')
                    n = g.nodes.new('ShaderNodeValue'); n.name = nm; n.outputs[0].default_value = d
                    g.links.new(n.outputs[0], go.inputs[nm])
            cs = N(nt, 'ShaderNodeGroup'); cs.node_tree = g
            col = mix(nt, sp.outputs['Red'], cs.outputs['shade'], cs.outputs['lit'])
            col = mix(nt, mul(nt, sp.outputs['Blue'], 0.35), col, cs.outputs['ink'])
            col = mix(nt, mul(nt, sp.outputs['Green'], cs.outputs['ink_k']), col, cs.outputs['ink'])
            em = N(nt, 'ShaderNodeEmission'); L(nt, col, em.inputs['Color'])
            tr = N(nt, 'ShaderNodeBsdfTransparent')
            mx = N(nt, 'ShaderNodeMixShader')
            L(nt, mul(nt, tx.outputs['Alpha'], cs.outputs['alpha_k']), mx.inputs[0])
            L(nt, tr.outputs[0], mx.inputs[1]); L(nt, em.outputs[0], mx.inputs[2])
            L(nt, mx.outputs[0], out.inputs['Surface'])
            aov = N(nt, 'ShaderNodeOutputAOV'); aov.aov_name = 'inkmask'; aov.inputs['Value'].default_value = 0.0
            m.surface_render_method = 'BLENDED'
            mt[k] = m
        return mt

    def cloud_card(self, name, az_deg, el_deg, width, k, cm):
        cam = self.cam_pose('overview')
        loc, rot = cam
        az0 = math.atan2(FWD.y, FWD.x)
        az = az0 - math.radians(az_deg)
        el = math.radians(el_deg)
        dist = 1400.0
        d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
        c = loc + d * dist
        w = width / 420.0 * dist * 0.62
        h = w * 384 / 1024
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new('UVMap')
        side = Vector((-d.y, d.x, 0)).normalized()
        up = Vector((0, 0, 1))
        vs = [bm.verts.new(c + side * (-w / 2) + up * (-h * 0.2)), bm.verts.new(c + side * (w / 2) + up * (-h * 0.2)),
              bm.verts.new(c + side * (w / 2) + up * (h * 0.8)), bm.verts.new(c + side * (-w / 2) + up * (h * 0.8))]
        f = bm.faces.new(vs)
        for lp, uv in zip(f.loops, ((1, 0), (0, 0), (0, 1), (1, 1))):
            lp[uvl].uv = uv
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        me.materials.append(cm[k])
        ob.visible_shadow = False
        ob['family'] = 'sky'
        return ob

    # ------------------------------------------------------------ lights / cameras
    def build_lights(self):
        def add_light(name, kind, **kw):
            ld = bpy.data.lights.new(name, kind)
            ob = bpy.data.objects.new(name, ld)
            bpy.context.scene.collection.objects.link(ob)
            for k, v in kw.items():
                if k == 'loc':
                    ob.location = v
                else:
                    setattr(ld, k, v)
            return ob
        self.sun = add_light('sun', 'SUN', angle=math.radians(2.5))
        self.point_lights = []
        for i, (p, kind) in enumerate(self.lamps):
            col = {'lamp': lin('#FFB868'), 'window': lin('#FFA850'), 'lantern': lin('#FFD49A'),
                   'riding': lin('#FFE0A8')}[kind]
            r = {'lamp': 0.12, 'window': 0.6, 'lantern': 0.5, 'riding': 0.05}[kind]
            ob = add_light(f'pl_{kind}_{i}', 'POINT', loc=p, color=col, shadow_soft_size=r)
            ob.data.use_soft_falloff = False
            ob['kind'] = kind
            if kind == 'window':
                ob.data.use_shadow = False
            self.point_lights.append(ob)

    def cam_pose(self, name):
        if name == 'overview':
            T, D = self.ov_target, OV_DIST
        else:
            T, D = self.harbour_target, 150.0
        back = Vector((-FWD.x * math.cos(PITCH), -FWD.y * math.cos(PITCH), math.sin(PITCH)))
        loc = T + back * D
        rot = (-back).to_track_quat('-Z', 'Y').to_euler()
        return loc, rot

    def build_cameras(self):
        for name in ('overview', 'harbour'):
            cd = bpy.data.cameras.new(name)
            cd.sensor_fit = 'VERTICAL'
            cd.angle_y = FOV
            cd.clip_start = 1.0
            cd.clip_end = 5000
            ob = bpy.data.objects.new('cam_' + name, cd)
            bpy.context.scene.collection.objects.link(ob)
            loc, rot = self.cam_pose(name)
            ob.location = loc
            ob.rotation_euler = rot
            self.cams[name] = ob

    def use_camera(self, name):
        bpy.context.scene.camera = self.cams[name]
        self.cur_cam = name
        # outline + hatch spacing track screen scale (runtime: clip-space width)
        dist = OV_DIST if name == 'overview' else 150.0
        mpp = 2 * math.tan(FOV / 2) * dist / 1000.0           # metres per pixel at the target
        for ob, mod in self.outlines:
            mod.thickness = -mpp * ob.get('outline_px', 1.15)
        mats.set_state(hatch_sp=mpp * 4.2, detail=0.0 if name == 'overview' else 1.0)
        self.mpp = mpp

    # ------------------------------------------------------------ outline pass (inverted hull)
    def outline_pass(self):
        ink = mats.get('ink')
        self.outlines = []
        for ob in bpy.context.scene.objects:
            if ob.type != 'MESH' or not ob.get('outline', 0):
                continue
            me = ob.data
            if ink.name not in [m.name for m in me.materials if m]:
                me.materials.append(ink)
            idx = [m.name for m in me.materials].index(ink.name)
            mod = ob.modifiers.new('ink', 'SOLIDIFY')
            mod.thickness = -0.15
            mod.offset = -1.0
            mod.use_flip_normals = True
            mod.use_rim = False
            mod.use_even_offset = False
            mod.use_quality_normals = True
            mod.material_offset = idx
            mod.material_offset_rim = idx
            self.outlines.append((ob, mod))

    # ------------------------------------------------------------ states
    def apply_state(self, st, cam):
        import states
        states.apply(self, st, cam)

    def stats(self):
        dg = bpy.context.evaluated_depsgraph_get()
        fam = {}
        total = 0
        for ob in bpy.context.scene.objects:
            if ob.type != 'MESH':
                continue
            f = ob.get('family', 'misc')
            if f in ('sea', 'sky'):
                continue
            me = ob.data
            me.calc_loop_triangles()
            n = len(me.loop_triangles)       # base mesh, outline shell excluded
            fam[f] = fam.get(f, 0) + n
            total += n
        return dict(triangles_block=total, by_family=dict(sorted(fam.items(), key=lambda kv: -kv[1])))

    def export_glbs(self, outdir):
        import layout
        layout.export(self, outdir)
