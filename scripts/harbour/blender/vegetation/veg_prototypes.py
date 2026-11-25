"""PharosVille Hero Botanical Prototype Kit (Phase 1A — Opus Audit Polished) — Blender 5.2.3 LTS.

Builds 18 sculpted, smooth-indexed Mediterranean tree & vineyard prototypes at origin (0, 0, 0)
with ground at z = 0 (+Z up in Blender -> +Y up in glTF):

  Stone Pines (4, evergreen pid=14):
    pine_broad, pine_tiered, pine_sheared, pine_young
  Italian Cypresses (3, evergreen pid=14):
    cypress_tall, cypress_column, cypress_sanctuary
  Gnarled Olives (3, evergreen pid=14):
    olive_ancient, olive_terrace, olive_young
  Deciduous Mediterranean Trees (6, deciduous pid=8, full sunlit winter skeletons):
    plane_tall, plane_broad, almond_spread, almond_young, fig_broad, pomegranate_multi
  Modular Trellised Vineyard Hedges (2, deciduous pid=8 + wood pid=0, flush-tiling 1.00x length):
    vine_row_short (2.4 m), vine_row_long (4.8 m)

Shading & runtime contracts (matching hb_export.py, materials.ts, season.ts, sway.ts):
  * Single material `hb_opaque` (Principled BSDF driven by POINT `Col` vertex color).
  * 100% smooth shading (`use_smooth = True` on every polygon), zero vertex splits on all 16 trees.
  * Transferred dome / spherical-radial custom vertex normals on foliage (`normals_split_custom_set`),
    true smooth cylindrical normals on wood trunks/branches (crisp caps only on cut vineyard posts).
  * Dual E15 BVHTree self-AO (32 cosine-weighted hemisphere rays per vertex):
      - Foliage (pid 8/14): baked against FULL canopy+wood for rich interior crown occlusion.
      - Wood (pid 0): baked against WOOD GEOMETRY ONLY + gentle upward sky bias [0.62..1.0],
        so winter `HB_BARE` branch skeletons reveal crisp, sunlit sculpted limbs.
  * `Col.a = pid / 16.0` (0 wood, 8 deciduous foliage, 14 evergreen foliage).
    Phase 1B classifies evergreen vs deciduous strictly by `pid == 14` vs `pid == 8`
    under `#ifdef HB_VEG_INSTANCED` (no acid-lime `hbConifer` blue clamp!).
  * Per-vertex `_sway` attribute (`0..100`, matching `sway.ts` `_sway * 0.01`).
"""
import math
import random
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix, Euler, noise
from mathutils.bvhtree import BVHTree

# ------------------------------------------------------------------ constants & palette helpers
PID_WOOD = 0
PID_DECIDUOUS = 8
PID_EVERGREEN = 14

PROTOTYPE_NAMES = (
    # Stone pines (4)
    'pine_broad',
    'pine_tiered',
    'pine_sheared',
    'pine_young',
    # Italian cypresses (3)
    'cypress_tall',
    'cypress_column',
    'cypress_sanctuary',
    # Gnarled olives (3)
    'olive_ancient',
    'olive_terrace',
    'olive_young',
    # Deciduous Mediterranean trees (6)
    'plane_tall',
    'plane_broad',
    'almond_spread',
    'almond_young',
    'fig_broad',
    'pomegranate_multi',
    # Vineyard hedges (2)
    'vine_row_short',
    'vine_row_long',
)

EVERGREEN_PROTOTYPES = {
    'pine_broad', 'pine_tiered', 'pine_sheared', 'pine_young',
    'cypress_tall', 'cypress_column', 'cypress_sanctuary',
    'olive_ancient', 'olive_terrace', 'olive_young',
}

DECIDUOUS_PROTOTYPES = {
    'plane_tall', 'plane_broad', 'almond_spread', 'almond_young',
    'fig_broad', 'pomegranate_multi', 'vine_row_short', 'vine_row_long',
}

VINEYARD_PROTOTYPES = {'vine_row_short', 'vine_row_long'}

SPECIES_GROUPS = (
    ('Stone Pines', ('pine_broad', 'pine_tiered', 'pine_sheared', 'pine_young')),
    ('Italian Cypresses', ('cypress_tall', 'cypress_column', 'cypress_sanctuary')),
    ('Gnarled Olives', ('olive_ancient', 'olive_terrace', 'olive_young')),
    ('Deciduous Trees', ('plane_tall', 'plane_broad', 'almond_spread', 'almond_young', 'fig_broad', 'pomegranate_multi')),
    ('Vineyards', ('vine_row_short', 'vine_row_long')),
)


def srgb_to_lin(hex_str):
    h = hex_str.lstrip('#')
    vals = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return Vector([
        x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
        for x in vals
    ])


def mix_v(a, b, t):
    t = max(0.0, min(1.0, t))
    return a * (1.0 - t) + b * t


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / max(e1 - e0, 1e-6)))
    return t * t * (3.0 - 2.0 * t)


def ensure_export_material():
    """Single hb_opaque material matching hb_export.py contract."""
    m = bpy.data.materials.get('hb_opaque')
    if m is not None:
        return m
    m = bpy.data.materials.new('hb_opaque')
    if m.node_tree is None:
        m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    p.inputs['Roughness'].default_value = 0.8
    at = nt.nodes.new('ShaderNodeVertexColor')
    at.layer_name = 'Col'
    nt.links.new(at.outputs['Color'], p.inputs['Base Color'])
    return m


# ------------------------------------------------------------------ prototype bmesh context
class ProtoBuilder:
    """Accumulates smooth wood + foliage sub-meshes with per-vertex shading metadata."""

    def __init__(self, name, nominal_h, seed=1, lod=0):
        self.base_name = name
        self.lod = int(lod)
        self.name = f"{name}_lod" if self.lod > 0 else name
        self.nominal_h = float(nominal_h)
        self.rng = random.Random(seed)
        self.bm = bmesh.new()
        self.l_pid = self.bm.verts.layers.int.new('pid')
        self.l_col = self.bm.verts.layers.float_vector.new('base_col')
        self.l_dome = self.bm.verts.layers.float_vector.new('dome_nrm')
        self.l_dome_w = self.bm.verts.layers.float.new('dome_w')
        self.l_sway = self.bm.verts.layers.float.new('sway_k')
        self.l_flat_cap = self.bm.faces.layers.int.new('flat_cap')
        self.wood_tips = []
        self.foliage_volumes = []

    def _set_vert(self, v, pid, col, dome_nrm, dome_w, sway_k):
        v[self.l_pid] = int(pid)
        v[self.l_col] = col
        v[self.l_dome] = dome_nrm
        v[self.l_dome_w] = float(dome_w)
        v[self.l_sway] = float(sway_k)

    # -------------------------------------------------------------- curved tapered tubular limb
    def add_limb(
        self,
        pts,
        radii,
        segs=7,
        col_bot=None,
        col_top=None,
        flute_amp=0.0,
        flute_n=4,
        flute_reach=0.32,
        twist=0.0,
        wobble=0.04,
        knot_amp=0.0,
        knot_freq=2.1,
        hollow_amp=0.0,
        hollow_ang=0.8,
        cap_bot=True,
        cap_top=True,
        flat_top=False,
        sway_base=0.0,
        sway_tip=30.0,
        mottle_col=None,
        mottle_col2=None,
        mottle_scale=1.9,
        mottle_strength=0.42,
        mottle_sharp=False,
        noise_seed=0.0,
        track_tip=False,
    ):
        """Build a smooth curved organic trunk or branch along `pts` using parallel-transport frames."""
        pts = [Vector(p) for p in pts]
        radii = list(radii)
        if self.lod > 0:
            segs = 5 if segs >= 9 else (4 if segs >= 6 else 3)
            if len(pts) >= 7:
                pick = [0, 1, 3, len(pts) - 1]
                pts = [pts[k] for k in pick]
                radii = [radii[k] for k in pick]
            elif len(pts) == 6:
                pick = [0, 1, 3, 5]
                pts = [pts[k] for k in pick]
                radii = [radii[k] for k in pick]
            elif len(pts) == 5:
                pick = [0, 2, 4]
                pts = [pts[k] for k in pick]
                radii = [radii[k] for k in pick]
            elif len(pts) == 4:
                pick = [0, 1, 3]
                pts = [pts[k] for k in pick]
                radii = [radii[k] for k in pick]
        n_rings = len(pts)
        assert n_rings == len(radii) and n_rings >= 2
        if col_bot is None:
            col_bot = srgb_to_lin('#5E4638')
        if col_top is None:
            col_top = srgb_to_lin('#866048')

        tans = []
        for i in range(n_rings):
            if i == 0:
                t = pts[1] - pts[0]
            elif i == n_rings - 1:
                t = pts[-1] - pts[-2]
            else:
                t = pts[i + 1] - pts[i - 1]
            if t.length < 1e-6:
                t = Vector((0.0, 0.0, 1.0))
            tans.append(t.normalized())

        ref = Vector((1.0, 0.0, 0.0)) if abs(tans[0].x) < 0.85 else Vector((0.0, 1.0, 0.0))
        u_vec = (ref - tans[0] * ref.dot(tans[0])).normalized()
        v_vec = tans[0].cross(u_vec).normalized()
        frames = [(u_vec, v_vec)]
        for i in range(1, n_rings):
            t_prev, t_cur = tans[i - 1], tans[i]
            axis = t_prev.cross(t_cur)
            if axis.length > 1e-6:
                ang = math.acos(max(-1.0, min(1.0, t_prev.dot(t_cur))))
                rot = Matrix.Rotation(ang, 3, axis.normalized())
                u_vec = (rot @ u_vec).normalized()
            u_vec = (u_vec - t_cur * u_vec.dot(t_cur)).normalized()
            v_vec = t_cur.cross(u_vec).normalized()
            frames.append((u_vec, v_vec))

        rings = []
        for i in range(n_rings):
            frac = i / max(n_rings - 1, 1)
            c = pts[i]
            r = radii[i]
            u, v = frames[i]
            flute_k = flute_amp * (1.0 - smoothstep(0.0, flute_reach, frac)) if flute_reach < 0.99 else flute_amp
            ring = []
            for j in range(segs):
                theta = 2.0 * math.pi * j / segs + twist * frac
                flute_wave = 0.72 * math.cos(flute_n * theta + 0.35 * math.sin(theta * 2.0)) + 0.28 * math.sin((flute_n - 1) * theta - 0.8 * frac)
                flute = 1.0 + flute_k * flute_wave
                wob = 1.0 + wobble * noise.noise(c * 0.90 + Vector((math.cos(theta) * 0.7, math.sin(theta) * 0.7, noise_seed)))
                knot = 1.0
                if knot_amp > 0.0:
                    kn = noise.noise(Vector((math.cos(theta) * 1.1, math.sin(theta) * 1.1, frac * knot_freq + noise_seed)))
                    # Asymmetric flared burl knots (stronger outward bulges, recessed gnarly hollows)
                    knot = 1.0 + knot_amp * (max(0.0, kn) ** 1.25 - 0.55 * max(0.0, -kn))
                hollow = 1.0
                hollow_shade = 1.0
                if hollow_amp > 0.0:
                    # Deep spiraling ancient olive hollow cleft carved along one flank of the gnarled trunk
                    d_ang = math.atan2(math.sin(theta - hollow_ang), math.cos(theta - hollow_ang))
                    cleft = math.exp(-((d_ang / 0.52) ** 2)) * math.sin(math.pi * max(0.0, min(1.0, (frac - 0.08) / 0.86)))
                    hollow = 1.0 - hollow_amp * cleft
                    hollow_shade = 1.0 - 0.34 * cleft
                rr = max(0.008, r * flute * wob * knot * hollow)
                radial = u * math.cos(theta) + v * math.sin(theta)
                pos = c + radial * rr

                nv = noise.noise(pos * 1.3 + Vector((noise_seed, 3.1, 0.0)))
                bark_t = max(0.0, min(1.0, frac * 0.78 + nv * 0.26 + 0.08))
                col = mix_v(col_bot, col_top, bark_t)
                e0, e1 = (0.44, 0.60) if mottle_sharp else (0.36, 0.72)
                if mottle_col is not None:
                    mt = smoothstep(e0, e1, 0.5 + 0.5 * noise.noise(pos * mottle_scale + Vector((noise_seed * 1.7, 7.1, 2.3))))
                    col = mix_v(col, mottle_col, mt * mottle_strength)
                if mottle_col2 is not None:
                    mt2 = smoothstep(e0 + 0.04, e1 + 0.04, 0.5 + 0.5 * noise.noise(pos * (mottle_scale * 1.35) + Vector((noise_seed * 0.9 + 5.2, 2.7, 8.1))))
                    col = mix_v(col, mottle_col2, mt2 * (mottle_strength * 0.92))
                if flute_k > 0.02 and flute < 1.0:
                    col = col * (0.76 + 0.24 * max(0.0, (flute - (1.0 - flute_k)) / max(flute_k, 1e-4)))
                col = col * hollow_shade

                if pos.z <= 0.4:
                    sw = 0.0
                else:
                    zh = max(0.0, min(1.0, (pos.z - 0.4) / max(self.nominal_h - 0.4, 1.0)))
                    sw = sway_base + (sway_tip - sway_base) * (zh ** 1.5)
                vert = self.bm.verts.new(pos)
                self._set_vert(vert, PID_WOOD, col, Vector((0.0, 0.0, 1.0)), 0.0, sw)
                ring.append(vert)
            rings.append(ring)

        for i in range(n_rings - 1):
            r0, r1 = rings[i], rings[i + 1]
            for j in range(segs):
                jn = (j + 1) % segs
                f = self.bm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
                f[self.l_flat_cap] = 0

        if cap_bot and radii[0] > 0.01:
            f = self.bm.faces.new(rings[0][::-1])
            f[self.l_flat_cap] = 1 if flat_top else 0
        if cap_top and radii[-1] > 0.005:
            if flat_top:
                f = self.bm.faces.new(rings[-1])
                f[self.l_flat_cap] = 1
            else:
                tip_pos = pts[-1] + tans[-1] * (radii[-1] * 0.75)
                tip_v = self.bm.verts.new(tip_pos)
                zh = max(0.0, min(1.0, (tip_pos.z - 0.4) / max(self.nominal_h - 0.4, 1.0))) if tip_pos.z > 0.4 else 0.0
                sw = sway_base + (sway_tip - sway_base) * (zh ** 1.5) if tip_pos.z > 0.4 else 0.0
                self._set_vert(tip_v, PID_WOOD, col_top, Vector((0.0, 0.0, 1.0)), 0.0, sw)
                for j in range(segs):
                    jn = (j + 1) % segs
                    f = self.bm.faces.new((rings[-1][j], rings[-1][jn], tip_v))
                    f[self.l_flat_cap] = 0

        if track_tip:
            self.wood_tips.append(pts[-1].copy())
        return pts[-1]

    # -------------------------------------------------------------- smooth scalloped/tufted botanical foliage puff
    def add_foliage_puff(
        self,
        center,
        rx,
        ry,
        rz_top,
        rz_bot,
        pid,
        col_top,
        col_mid,
        col_bot,
        u_segs=12,
        v_rings=3,
        rim_lobes=4,
        rim_wave=0.085,
        crinkle_amp=0.0,
        crinkle_lobes=5,
        noise_amp=0.08,
        noise_freq=1.25,
        top_pow=0.86,
        bot_pow=0.92,
        tilt=(0.0, 0.0, 0.0),
        dome_w=0.68,
        dome_up=0.26,
        sway_min=45.0,
        sway_max=90.0,
        mottle_col=None,
        mottle_strength=0.0,
        wind_shear=(0.0, 0.0),
        seed=0,
    ):
        """Smooth sculpted botanical foliage cluster with optional tufted radial crinkling.

        v_rings=2, u_segs=8  -> 18 verts, 32 tris  (small outer pine/olive tufts)
        v_rings=2, u_segs=10 -> 22 verts, 40 tris  (crisp outer rim tufts)
        v_rings=3, u_segs=10 -> 32 verts, 60 tris  (medium clusters)
        v_rings=3, u_segs=12 -> 38 verts, 72 tris  (hero clusters)
        v_rings=4, u_segs=14 -> 58 verts, 112 tris (broad tufted pine/plane crown dome)
        """
        center = Vector(center)
        self.foliage_volumes.append((center.copy(), rx, ry, rz_top, rz_bot))
        if self.lod > 0:
            if v_rings <= 2:
                u_segs = 5 if u_segs <= 10 else 6
                v_rings = 2
            else:
                u_segs = 5 if u_segs <= 8 else (6 if u_segs <= 10 else (7 if u_segs <= 12 else 8))
                v_rings = 2 if v_rings == 3 else 3
        rot_m = Euler(tilt, 'XYZ').to_matrix()
        phase = (seed * 1.6180339) % (2.0 * math.pi)
        n_off = Vector((seed * 2.31, seed * 0.77, seed * 1.13))

        if v_rings == 2:
            lats = (-0.54, 0.56)
        elif v_rings == 3:
            lats = (-0.72, 0.02, 0.72)
        elif v_rings == 4:
            lats = (-0.86, -0.16, 0.42, 0.98)
        else:
            lats = [(-0.5 + (i + 1) / (v_rings + 1)) * math.pi for i in range(v_rings)]

        def eval_point(u_dir):
            ang = math.atan2(u_dir.y, u_dir.x)
            eq = math.sqrt(max(0.0, 1.0 - u_dir.z * u_dir.z))
            lobe_mod = 1.0 + rim_wave * (eq ** 1.15) * (
                0.68 * math.sin(rim_lobes * ang + phase)
                + 0.32 * math.cos(max(2, rim_lobes - 1) * ang - phase * 1.25)
            )
            n1 = noise.noise(u_dir * noise_freq + n_off)
            n2 = noise.noise(u_dir * (noise_freq * 2.05) - n_off * 0.45)
            disp = 1.0 + noise_amp * (0.70 * n1 + 0.30 * n2)

            crinkle_c = 0.0
            if crinkle_amp > 0.0:
                # Rounded tufted scallops (abs-sin arches form plump botanical sub-clusters, never pointy spikes)
                tuft_r = abs(math.sin(0.5 * crinkle_lobes * ang + phase * 0.7 + 0.55 * n1))
                tuft_z = abs(math.cos(0.5 * max(3, crinkle_lobes - 1) * ang - phase * 0.5 + 1.2 * u_dir.z))
                crinkle_val = (0.62 * tuft_r + 0.38 * tuft_z) * 2.0 - 1.0  # [-1..+1]
                rim_mask = (eq ** 0.85) * (0.65 + 0.35 * max(0.0, u_dir.z + 0.25))
                disp *= 1.0 + crinkle_amp * rim_mask * crinkle_val
                crinkle_c = crinkle_val * rim_mask

            lx = u_dir.x * rx * lobe_mod * disp
            ly = u_dir.y * ry * lobe_mod * disp
            if u_dir.z >= 0.0:
                lz = (u_dir.z ** top_pow) * rz_top * (1.0 + 0.52 * noise_amp * n1 + 0.38 * crinkle_amp * max(-0.5, crinkle_c))
            else:
                lz = -((-u_dir.z) ** bot_pow) * rz_bot * (1.0 + 0.28 * noise_amp * n1)

            if wind_shear[0] or wind_shear[1]:
                up_k = max(0.0, u_dir.z + 0.35)
                lx += wind_shear[0] * up_k * rx
                ly += wind_shear[1] * up_k * ry

            local_p = rot_m @ Vector((lx, ly, lz))
            pos = center + local_p

            local_n = Vector((
                lx / max(rx, 0.1),
                ly / max(ry, 0.1),
                lz / max(rz_top if lz >= 0 else rz_bot, 0.1),
            ))
            local_n = (rot_m @ local_n).normalized()
            local_n = (local_n + Vector((0.0, 0.0, dome_up))).normalized()

            h_grad = (u_dir.z + 1.0) * 0.5
            n_col = 0.5 + 0.5 * noise.noise(pos * 0.72 + n_off * 0.25)
            h_eff = max(0.0, min(1.0, h_grad * 0.80 + n_col * 0.22 + 0.10 * crinkle_c - 0.04))
            if h_eff >= 0.50:
                col = mix_v(col_mid, col_top, (h_eff - 0.50) / 0.50)
            else:
                col = mix_v(col_bot, col_mid, h_eff / 0.50)
            # Subtle shading inside scalloped tuft crevices for crisp botanical readability
            if crinkle_c < 0.0:
                col = col * (1.0 + 0.14 * crinkle_c)
            if mottle_col is not None and mottle_strength > 0.0:
                mt = smoothstep(0.42, 0.82, 0.5 + 0.5 * noise.noise(pos * 1.05 + Vector((seed * 0.7, 5.2, 1.4))))
                col = mix_v(col, mottle_col, mt * mottle_strength * (0.42 + 0.58 * max(0.0, u_dir.z)))

            zh = max(0.0, min(1.0, (pos.z - 0.4) / max(self.nominal_h - 0.4, 1.0))) if pos.z > 0.4 else 0.0
            rad_boost = eq * 0.28 + max(0.0, u_dir.z) * 0.18
            sw = sway_min + (sway_max - sway_min) * max(0.0, min(1.0, (zh ** 1.35) * 0.72 + rad_boost))
            v = self.bm.verts.new(pos)
            self._set_vert(v, pid, col, local_n, dome_w, sw)
            return v

        v_bot = eval_point(Vector((0.0, 0.0, -1.0)))
        v_top = eval_point(Vector((0.0, 0.0, 1.0)))

        rings = []
        for ri, lat in enumerate(lats):
            cl = math.cos(lat)
            sl = math.sin(lat)
            ring = []
            ang_off = (math.pi / u_segs) * (ri % 2)
            for j in range(u_segs):
                a = 2.0 * math.pi * j / u_segs + ang_off
                ring.append(eval_point(Vector((cl * math.cos(a), cl * math.sin(a), sl))))
            rings.append(ring)

        for j in range(u_segs):
            jn = (j + 1) % u_segs
            f = self.bm.faces.new((v_bot, rings[0][jn], rings[0][j]))
            f[self.l_flat_cap] = 0
        for ri in range(len(rings) - 1):
            r0, r1 = rings[ri], rings[ri + 1]
            for j in range(u_segs):
                jn = (j + 1) % u_segs
                if ri % 2 == 0:
                    f1 = self.bm.faces.new((r0[j], r0[jn], r1[j]))
                    f2 = self.bm.faces.new((r0[jn], r1[jn], r1[j]))
                else:
                    f1 = self.bm.faces.new((r0[j], r0[jn], r1[jn]))
                    f2 = self.bm.faces.new((r0[j], r1[jn], r1[j]))
                f1[self.l_flat_cap] = 0
                f2[self.l_flat_cap] = 0
        for j in range(u_segs):
            jn = (j + 1) % u_segs
            f = self.bm.faces.new((rings[-1][j], rings[-1][jn], v_top))
            f[self.l_flat_cap] = 0

    # -------------------------------------------------------------- continuous flame/column/sanctuary spire (Cypress)
    def add_cypress_core(
        self,
        z_bot,
        height,
        max_r,
        pid,
        col_top,
        col_mid,
        col_bot,
        segs=10,
        n_rings=9,
        flute_n=5,
        flute_amp=0.12,
        env_fn=None,
        base_xy=Vector((0.0, 0.0)),
        nod_vec=Vector((0.0, 0.0, 0.0)),
        nod_exp=2.3,
        dome_w=0.68,
        sway_min=10.0,
        sway_max=98.0,
        seed=0,
    ):
        """Continuous sculpted Italian Cypress spire body driven by species-specific silhouette profile `env_fn(t)`."""
        if self.lod > 0:
            segs = max(5, int(round(segs * 0.60)))
            n_rings = max(4, int(round(n_rings * 0.62)))
        n_off = Vector((seed * 1.4, seed * 0.7, 0.5))
        phase = (seed * 1.9) % (2.0 * math.pi)
        ts = [0.05 + 0.89 * (i / max(n_rings - 1, 1)) for i in range(n_rings)]
        if env_fn is None:
            def env_fn(t):
                rise = smoothstep(0.0, 0.32, t)
                taper = (1.0 - max(0.0, (t - 0.32) / 0.68)) ** 0.88 if t > 0.32 else 1.0
                return (0.28 + 0.72 * rise) * taper

        rings = []
        for idx, t in enumerate(ts):
            z = z_bot + height * t
            c = Vector((base_xy.x, base_xy.y, z)) + nod_vec * (t ** nod_exp)
            r_t = max_r * env_fn(t)
            ring = []
            for j in range(segs):
                ang = 2.0 * math.pi * j / segs + 0.07 * idx
                flute = 1.0 + flute_amp * (
                    0.66 * math.sin(flute_n * ang + phase + t * 2.2)
                    + 0.34 * math.cos(max(2, flute_n - 2) * ang - phase + t * 3.0)
                )
                n_val = noise.noise(Vector((math.cos(ang), math.sin(ang), t * 3.8)) * 0.95 + n_off)
                rr = max(0.04, r_t * flute * (1.0 + 0.09 * n_val))
                pos = c + Vector((math.cos(ang) * rr, math.sin(ang) * rr, 0.0))

                dn = Vector((math.cos(ang), math.sin(ang), 0.24 + 0.54 * t)).normalized()
                ridge = (flute - 1.0) / max(flute_amp, 0.04)
                h_eff = max(0.0, min(1.0, 0.20 + 0.62 * t + 0.18 * ridge + 0.12 * n_val))
                col = mix_v(col_mid, col_top, (h_eff - 0.50) / 0.50) if h_eff >= 0.50 else mix_v(col_bot, col_mid, h_eff / 0.50)

                zh = max(0.0, min(1.0, (pos.z - 0.4) / max(self.nominal_h - 0.4, 1.0))) if pos.z > 0.4 else 0.0
                sw = sway_min + (sway_max - sway_min) * (zh ** 1.5)
                v = self.bm.verts.new(pos)
                self._set_vert(v, pid, col, dn, dome_w, sw)
                ring.append(v)
            rings.append(ring)

        v_bot = self.bm.verts.new(Vector((base_xy.x, base_xy.y, z_bot)))
        zh_b = max(0.0, min(1.0, (z_bot - 0.4) / max(self.nominal_h - 0.4, 1.0))) if z_bot > 0.4 else 0.0
        self._set_vert(v_bot, pid, col_bot, Vector((0.0, 0.0, -0.7)).normalized(), dome_w, sway_min + (sway_max - sway_min) * (zh_b ** 1.5))

        top_pos = Vector((base_xy.x, base_xy.y, z_bot + height)) + nod_vec
        v_top = self.bm.verts.new(top_pos)
        zh_t = max(0.0, min(1.0, (top_pos.z - 0.4) / max(self.nominal_h - 0.4, 1.0))) if top_pos.z > 0.4 else 0.0
        self._set_vert(v_top, pid, col_top, Vector((0.0, 0.0, 1.0)), dome_w, sway_min + (sway_max - sway_min) * (zh_t ** 1.5))

        for j in range(segs):
            jn = (j + 1) % segs
            f = self.bm.faces.new((v_bot, rings[0][jn], rings[0][j]))
            f[self.l_flat_cap] = 0
        for i in range(len(rings) - 1):
            r0, r1 = rings[i], rings[i + 1]
            for j in range(segs):
                jn = (j + 1) % segs
                f = self.bm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
                f[self.l_flat_cap] = 0
        for j in range(segs):
            jn = (j + 1) % segs
            f = self.bm.faces.new((rings[-1][j], rings[-1][jn], v_top))
            f[self.l_flat_cap] = 0

    def add_cypress_plume(
        self,
        base_pt,
        height,
        radius,
        pid,
        col_top,
        col_mid,
        col_bot,
        segs=6,
        tilt_out=Vector((0.0, 0.0, 0.0)),
        tip_lean=Vector((0.0, 0.0, 0.0)),
        dome_w=0.66,
        sway_min=14.0,
        sway_max=96.0,
        seed=0,
    ):
        """Ascending cypress feather-tuft breaking the spire contour."""
        base_pt = Vector(base_pt)
        n_off = Vector((seed * 1.9, seed * 0.6, 0.3))
        if self.lod > 0:
            segs = max(4, segs - 2)
            ts = (0.18, 0.48, 0.80)
            rs = (0.74, 1.0, 0.54)
        else:
            ts = (0.14, 0.38, 0.64, 0.85)
            rs = (0.68, 1.0, 0.82, 0.44)
        rings = []
        for idx, (t, rk) in enumerate(zip(ts, rs)):
            c = base_pt + Vector((0.0, 0.0, height * t)) + tilt_out * math.sin(math.pi * (t ** 0.72)) + tip_lean * (t ** 1.8)
            ring = []
            for j in range(segs):
                ang = 2.0 * math.pi * j / segs + 0.28 * idx
                nv = noise.noise(Vector((math.cos(ang), math.sin(ang), t * 2.2)) + n_off)
                rr = max(0.03, radius * rk * (1.0 + 0.16 * nv))
                pos = c + Vector((math.cos(ang) * rr, math.sin(ang) * rr, 0.0))
                dn = Vector((math.cos(ang), math.sin(ang), 0.34 + 0.44 * t)).normalized()
                h_eff = max(0.0, min(1.0, 0.24 + 0.62 * t + 0.16 * nv))
                col = mix_v(col_mid, col_top, (h_eff - 0.50) / 0.50) if h_eff >= 0.50 else mix_v(col_bot, col_mid, h_eff / 0.50)
                zh = max(0.0, min(1.0, (pos.z - 0.4) / max(self.nominal_h - 0.4, 1.0))) if pos.z > 0.4 else 0.0
                sw = sway_min + (sway_max - sway_min) * (zh ** 1.5)
                v = self.bm.verts.new(pos)
                self._set_vert(v, pid, col, dn, dome_w, sw)
                ring.append(v)
            rings.append(ring)

        v_bot = self.bm.verts.new(base_pt)
        zh_b = max(0.0, min(1.0, (base_pt.z - 0.4) / max(self.nominal_h - 0.4, 1.0))) if base_pt.z > 0.4 else 0.0
        self._set_vert(v_bot, pid, col_bot, Vector((0.0, 0.0, -0.5)).normalized(), dome_w, sway_min + (sway_max - sway_min) * (zh_b ** 1.5))

        top_pos = base_pt + Vector((0.0, 0.0, height)) + tilt_out * 0.22 + tip_lean
        v_top = self.bm.verts.new(top_pos)
        zh_t = max(0.0, min(1.0, (top_pos.z - 0.4) / max(self.nominal_h - 0.4, 1.0))) if top_pos.z > 0.4 else 0.0
        self._set_vert(v_top, pid, col_top, Vector((0.0, 0.0, 1.0)), dome_w, sway_min + (sway_max - sway_min) * (zh_t ** 1.5))

        for j in range(segs):
            jn = (j + 1) % segs
            f = self.bm.faces.new((v_bot, rings[0][jn], rings[0][j]))
            f[self.l_flat_cap] = 0
        for i in range(len(rings) - 1):
            r0, r1 = rings[i], rings[i + 1]
            for j in range(segs):
                jn = (j + 1) % segs
                f = self.bm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
                f[self.l_flat_cap] = 0
        for j in range(segs):
            jn = (j + 1) % segs
            f = self.bm.faces.new((rings[-1][j], rings[-1][jn], v_top))
            f[self.l_flat_cap] = 0

    # -------------------------------------------------------------- flush-tiling scalloped vineyard wall
    def add_vine_hedge(
        self,
        length,
        z_bot=0.45,
        z_top=1.54,
        half_w=0.38,
        col_top=None,
        col_mid=None,
        col_bot=None,
        n_len=11,
        n_ring=10,
        seed=0,
    ):
        """Flush-tiling (1.00 x length) scalloped VSP grapevine wall with periodic ends & gale-safe _SWAY.

        Uses exact 2.4 m periodicity along X so `vine_row_short` (2.4 m) and `vine_row_long` (4.8 m)
        keep full height & width right to x = +/- length/2 and tile flush with zero end-pinch or gap.
        """
        tile_period = 2.4
        if self.lod > 0:
            n_len = max(5, int(round(length / 0.4)) + 1)
            n_ring = 6
        z_mid = 0.5 * (z_bot + z_top)
        hz = 0.5 * (z_top - z_bot)
        xs = [-length * 0.5 + length * i / (n_len - 1) for i in range(n_len)]
        rings = []

        for x in xs:
            # Periodic phase modulo 2.4 m so endpoints x=-L/2 and x=+L/2 match 100% identically
            u_per = ((x + length * 0.5) % tile_period) / tile_period
            ang_x = 2.0 * math.pi * u_per
            px_c, px_s = math.cos(ang_x), math.sin(ang_x)

            # Organic multi-cluster vine leaf swells along the row (full height & width everywhere!)
            # Shift phase by +pi/2 so tile boundaries u_per=0/1 sit cleanly at a neutral saddle (no corner 'ears'!)
            crest_wave = 0.068 * math.sin(2.0 * ang_x) + 0.042 * math.sin(4.0 * ang_x)
            width_wave = 1.0 + 0.14 * math.sin(2.0 * ang_x + 0.4) + 0.09 * math.sin(4.0 * ang_x - 0.5)

            ring = []
            for j in range(n_ring):
                ang = 2.0 * math.pi * j / n_ring
                cy = math.cos(ang)
                cz = math.sin(ang)

                # VSP vineyard wall profile: lush leafy shoulders, scalloped overhanging leaf clusters (NOT a smooth tube!)
                sy = math.copysign(abs(cy) ** 0.78, cy)
                sz = math.copysign(abs(cz) ** 0.86, cz)
                shoulder_k = 1.08 if (cz > -0.15 and cz < 0.72) else (0.90 if cz <= -0.15 else 0.94)

                # Periodic 3D noise on circular X embedding -> seamless tiling across segments!
                p_n1 = Vector((px_c * 1.35 + 3.1, px_s * 1.35 + 1.7, cy * 1.25 + cz * 1.10 + 0.4))
                p_n2 = Vector((px_c * 2.55 - 1.4, px_s * 2.55 + 4.3, cy * 2.05 - cz * 1.85 + 2.1))
                n1 = noise.noise(p_n1)
                n2 = noise.noise(p_n2)

                # Rich scalloped leafy billows along sides & crest (clamped inward so no sharp concave dimple!)
                side_billow = 0.12 * math.sin(3.0 * ang_x + 1.4 * cz + (0.9 if cy >= 0 else -0.7)) * abs(cy)
                ruffle = max(-0.14, min(0.24, 0.18 * (0.65 * n1 + 0.35 * n2) + side_billow))
                py = sy * half_w * width_wave * shoulder_k * (1.0 + ruffle)

                z_local = z_mid + sz * hz * (1.0 + 0.10 * n1)
                if cz > 0.10:
                    # Scalloped sunlit vine crest rising cleanly over the 1.30 m stakes to ~1.54 m
                    z_local += crest_wave * (0.45 + 0.55 * cz) + 0.065 * cz * n2
                elif cz < -0.25:
                    # Gently rippled lower leaf skirt hanging around z = 0.45 m above the 0.40 m trellis rail
                    z_local += 0.032 * math.sin(3.0 * ang_x + cy) * abs(cz)
                pz = max(z_bot - 0.02, min(z_top + 0.08, z_local))

                pos = Vector((x, py, pz))
                # Strictly perpendicular to X (nx=0) so adjacent tiled segments shade seamlessly across the seam!
                dn = Vector((0.0, sy * 0.88, sz * 0.72 + 0.30)).normalized()
                h_eff = max(0.0, min(1.0, (pz - z_bot) / max(z_top - z_bot, 0.2) * 0.78 + 0.22 * (0.5 + 0.5 * n1) + 0.06 * side_billow))
                col = mix_v(col_mid, col_top, (h_eff - 0.50) / 0.50) if h_eff >= 0.50 else mix_v(col_bot, col_mid, h_eff / 0.50)

                # Realistic gale-safe _SWAY: strictly 0 at z <= 0.55 m, gently capped at 28..32 at top crest
                sw_k = smoothstep(0.55, 1.48, pz)
                sw = 31.0 * sw_k * (0.86 + 0.14 * abs(cy))
                sw = max(0.0, min(32.0, sw))
                v = self.bm.verts.new(pos)
                self._set_vert(v, PID_DECIDUOUS, col, dn, 0.54, sw)
                ring.append(v)
            rings.append(ring)

        for i in range(n_len - 1):
            r0, r1 = rings[i], rings[i + 1]
            for j in range(n_ring):
                jn = (j + 1) % n_ring
                f = self.bm.faces.new((r0[j], r1[j], r1[jn], r0[jn]))
                f[self.l_flat_cap] = 0

        # Flush vertical end foliage faces right at x = -length/2 and x = +length/2 (ZERO protrusion, ZERO pinch!)
        for side_idx, sign in ((0, -1.0), (-1, 1.0)):
            x_end = xs[side_idx]
            sw_cap = 31.0 * smoothstep(0.55, 1.48, z_mid) * 0.85
            v_cap = self.bm.verts.new(Vector((x_end, 0.0, z_mid)))
            self._set_vert(v_cap, PID_DECIDUOUS, col_mid, Vector((sign * 0.85, 0.0, 0.32)).normalized(), 0.54, sw_cap)
            ring = rings[side_idx]
            for j in range(n_ring):
                jn = (j + 1) % n_ring
                f = self.bm.faces.new((v_cap, ring[j], ring[jn]) if sign < 0 else (v_cap, ring[jn], ring[j]))
                f[self.l_flat_cap] = 0

    # -------------------------------------------------------------- finalize: normals, dual E15 BVH AO, Col, _sway
    def finalize(
        self,
        mat,
        macro_dome_mix=0.48,
        macro_up_bias=0.22,
        ao_samples=32,
        ao_strength=0.60,
        ao_min=0.38,
        ao_dist=None,
        under_ao_boost=0.0,
    ):
        """Bake dual E15 BVHTree self-AO (wood-only for wood, full for foliage), custom normals, POINT Col, _sway."""
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        bm.verts.index_update()
        bm.faces.index_update()
        bm.normal_update()

        n_verts = len(bm.verts)
        fol_pts = [v.co for v in bm.verts if v[self.l_pid] in (PID_DECIDUOUS, PID_EVERGREEN)]
        if fol_pts:
            f_min = Vector((min(p.x for p in fol_pts), min(p.y for p in fol_pts), min(p.z for p in fol_pts)))
            f_max = Vector((max(p.x for p in fol_pts), max(p.y for p in fol_pts), max(p.z for p in fol_pts)))
            macro_c = Vector((
                0.5 * (f_min.x + f_max.x),
                0.5 * (f_min.y + f_max.y),
                f_min.z + 0.36 * (f_max.z - f_min.z),
            ))
            macro_scale = Vector((
                max(0.5 * (f_max.x - f_min.x), 0.35),
                max(0.5 * (f_max.y - f_min.y), 0.35),
                max(0.5 * (f_max.z - f_min.z), 0.35),
            ))
        else:
            macro_c = Vector((0.0, 0.0, self.nominal_h * 0.6))
            macro_scale = Vector((1.0, 1.0, 1.0))

        # Full-geometry BVHTree for foliage self-occlusion (deep rich interior canopy AO)
        bvh_full_bm = bm.copy()
        bmesh.ops.triangulate(bvh_full_bm, faces=bvh_full_bm.faces)
        bvh_full = BVHTree.FromBMesh(bvh_full_bm)
        bvh_full_bm.free()

        # Wood-only BVHTree for trunk & branch self-AO (excludes leaf puffs -> sunlit crisp winter skeletons!)
        bvh_wood_bm = bm.copy()
        l_pid_w = bvh_wood_bm.verts.layers.int.get('pid')
        non_wood_faces = [f for f in bvh_wood_bm.faces if any(v[l_pid_w] != PID_WOOD for v in f.verts)]
        if non_wood_faces:
            bmesh.ops.delete(bvh_wood_bm, geom=non_wood_faces, context='FACES')
        if len(bvh_wood_bm.faces) > 0:
            bmesh.ops.triangulate(bvh_wood_bm, faces=bvh_wood_bm.faces)
            bvh_wood = BVHTree.FromBMesh(bvh_wood_bm)
        else:
            bvh_wood = None
        bvh_wood_bm.free()

        ga = math.pi * (3.0 - math.sqrt(5.0))
        hemi = [
            (
                math.sqrt((i + 0.5) / ao_samples) * math.cos(i * ga),
                math.sqrt((i + 0.5) / ao_samples) * math.sin(i * ga),
                math.sqrt(1.0 - (i + 0.5) / ao_samples),
            )
            for i in range(ao_samples)
        ]

        dist = ao_dist if ao_dist is not None else max(1.8, min(5.5, self.nominal_h * 0.45))
        inv_d = 1.0 / max(dist, 1e-4)
        wood_dist = max(0.8, min(2.6, self.nominal_h * 0.25))
        inv_wd = 1.0 / max(wood_dist, 1e-4)
        inv_s = 1.0 / ao_samples
        ray_full = bvh_full.ray_cast
        ray_wood = bvh_wood.ray_cast if bvh_wood is not None else None

        col_buf = np.zeros((n_verts, 4), np.float32)
        sway_buf = np.zeros(n_verts, np.int32)
        custom_vn = [Vector((0.0, 0.0, 1.0))] * n_verts

        for v in bm.verts:
            idx = v.index
            pid = v[self.l_pid]
            base_c = Vector(v[self.l_col])
            geo_n = v.normal.normalized() if v.normal.length > 1e-6 else Vector((0.0, 0.0, 1.0))

            org = v.co + geo_n * 0.03
            up_ref = Vector((0.0, 0.0, 1.0)) if abs(geo_n.z) < 0.9 else Vector((1.0, 0.0, 0.0))
            t_vec = up_ref.cross(geo_n).normalized()
            b_vec = geo_n.cross(t_vec)

            if pid == PID_WOOD:
                occ = 0.0
                if ray_wood is not None:
                    for dx, dy, dz in hemi:
                        rd = t_vec * dx + b_vec * dy + geo_n * dz
                        hit_loc, _hn, _hi, hit_d = ray_wood(org, rd, wood_dist)
                        if hit_loc is not None:
                            u = hit_d * inv_wd
                            occ += 1.0 - u * u
                occ_norm = occ * inv_s
                # Gentle upward sky bias + wood-only crevice AO strictly within [0.62..1.0]
                sky_bias = 0.84 + 0.16 * geo_n.z
                ao_raw = max(0.62, min(1.0, (1.0 - 0.36 * occ_norm) * sky_bias))
                ao = max(0.62, min(1.0, round(ao_raw * 64.0) / 64.0))
            else:
                # For flush-tiling vineyard wall end-ring vertices, center AO hemisphere & normal cleanly in Y-Z plane
                # so adjacent modular vineyard segments meet with zero normal/AO seam!
                is_vine_seam = (
                    self.base_name in VINEYARD_PROTOTYPES
                    and abs(abs(v.co.x) - (1.2 if self.base_name == 'vine_row_short' else 2.4)) < 0.02
                    and (abs(v.co.y) > 0.08 or abs(v.co.z - 0.995) > 0.08)
                )
                ao_n = Vector(v[self.l_dome]).normalized() if is_vine_seam else geo_n
                ao_org = v.co + ao_n * 0.03
                u_r = Vector((0.0, 0.0, 1.0)) if abs(ao_n.z) < 0.9 else Vector((1.0, 0.0, 0.0))
                t_a = u_r.cross(ao_n).normalized()
                b_a = ao_n.cross(t_a)
                occ = 0.0
                for dx, dy, dz in hemi:
                    rd = t_a * dx + b_a * dy + ao_n * dz
                    hit_loc, _hn, _hi, hit_d = ray_full(ao_org, rd, dist)
                    if hit_loc is not None:
                        u = hit_d * inv_d
                        occ += 1.0 - u * u
                occ_norm = occ * inv_s
                ao_raw = max(ao_min, min(1.0, 1.0 - ao_strength * occ_norm))
                if under_ao_boost > 0.0 and fol_pts:
                    under_n = 1.0 - smoothstep(-0.55, 0.22, geo_n.z)
                    h_rel = (v.co.z - f_min.z) / max(f_max.z - f_min.z, 0.4)
                    low_k = 1.0 - smoothstep(0.08, 0.58, h_rel)
                    under_mask = max(under_n, low_k * (1.0 - smoothstep(-0.10, 0.48, geo_n.z)))
                    ao_raw = max(ao_min * 0.58, ao_raw * (1.0 - under_ao_boost * under_mask))
                ao = max(ao_min * 0.55 if under_ao_boost > 0.0 else ao_min, min(1.0, round(ao_raw * 64.0) / 64.0))

            # Full un-flattened E15 AO (NO acid-lime deciduous blue clamp!)
            final_c = base_c * ao

            col_buf[idx, 0] = max(0.0, min(1.0, final_c.x))
            col_buf[idx, 1] = max(0.0, min(1.0, final_c.y))
            col_buf[idx, 2] = max(0.0, min(1.0, final_c.z))
            col_buf[idx, 3] = pid / 16.0

            sw_val = int(round(max(0.0, min(100.0, float(v[self.l_sway])))))
            sway_buf[idx] = sw_val

            dw = float(v[self.l_dome_w])
            if dw > 1e-4 and pid in (PID_DECIDUOUS, PID_EVERGREEN):
                local_dn = Vector(v[self.l_dome])
                local_dn = local_dn.normalized() if local_dn.length > 1e-6 else geo_n
                rel = v.co - macro_c
                macro_dn = Vector((
                    0.0 if self.base_name in VINEYARD_PROTOTYPES else rel.x / macro_scale.x,
                    rel.y / macro_scale.y,
                    rel.z / macro_scale.z + macro_up_bias,
                ))
                macro_dn = macro_dn.normalized() if macro_dn.length > 1e-6 else Vector((0.0, 0.0, 1.0))
                dome_combo = local_dn * (1.0 - macro_dome_mix) + macro_dn * macro_dome_mix
                dome_combo = dome_combo.normalized() if dome_combo.length > 1e-6 else macro_dn
                geo_eff = Vector((0.0, geo_n.y, geo_n.z)).normalized() if (is_vine_seam and math.hypot(geo_n.y, geo_n.z) > 1e-4) else geo_n
                blended = geo_eff * (1.0 - dw) + dome_combo * dw
                if is_vine_seam:
                    blended.x = 0.0
                custom_vn[idx] = blended.normalized() if blended.length > 1e-6 else dome_combo
            else:
                custom_vn[idx] = geo_n

        flat_cap_faces = [f[self.l_flat_cap] == 1 for f in bm.faces]
        flat_cap_nrms = [f.normal.normalized() if f.normal.length > 1e-6 else Vector((0.0, 0.0, 1.0)) for f in bm.faces]

        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()

        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))

        for a_name in [a.name for a in me.attributes if a.name in ('pid', 'base_col', 'dome_nrm', 'dome_w', 'sway_k', 'flat_cap')]:
            me.attributes.remove(me.attributes[a_name])

        col_attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        col_attr.data.foreach_set('color', col_buf.ravel())

        # INT8 matches hb_export.py convention (0..100 integer weights, exported lossless by Blender 5.2 glTF)
        sway_attr = me.attributes.new('_sway', 'INT8', 'POINT')
        sway_attr.data.foreach_set('value', sway_buf)

        loop_nrms = [None] * len(me.loops)
        for pi, poly in enumerate(me.polygons):
            is_cap = flat_cap_faces[pi]
            cap_n = flat_cap_nrms[pi]
            for li in poly.loop_indices:
                loop_nrms[li] = cap_n if is_cap else custom_vn[me.loops[li].vertex_index]
        me.normals_split_custom_set(loop_nrms)
        me.update()

        me.materials.append(mat)
        ob = bpy.data.objects.new(self.name, me)
        ob.location = (0.0, 0.0, 0.0)
        return ob


# ------------------------------------------------------------------ shared spline helpers
def sample_curve(ctrl_pts, n_samples):
    P = [Vector(p) for p in ctrl_pts]
    if len(P) == 2:
        return [P[0].lerp(P[1], i / (n_samples - 1)) for i in range(n_samples)]
    if len(P) == 3:
        out = []
        for i in range(n_samples):
            t = i / (n_samples - 1)
            mt = 1.0 - t
            out.append(P[0] * (mt * mt) + P[1] * (2.0 * mt * t) + P[2] * (t * t))
        return out
    if len(P) == 4:
        out = []
        for i in range(n_samples):
            t = i / (n_samples - 1)
            mt = 1.0 - t
            out.append(
                P[0] * (mt ** 3)
                + P[1] * (3.0 * mt * mt * t)
                + P[2] * (3.0 * mt * t * t)
                + P[3] * (t ** 3)
            )
        return out
    P_ext = [P[0] * 2.0 - P[1]] + P + [P[-1] * 2.0 - P[-2]]
    n_seg = len(P) - 1
    out = []
    for i in range(n_samples):
        u = (i / (n_samples - 1)) * n_seg
        seg = min(n_seg - 1, int(u))
        t = u - seg
        p0, p1, p2, p3 = P_ext[seg], P_ext[seg + 1], P_ext[seg + 2], P_ext[seg + 3]
        t2, t3 = t * t, t * t * t
        q = 0.5 * (
            (2.0 * p1)
            + (-p0 + p2) * t
            + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
            + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
        )
        out.append(q)
    return out


def taper_radii(r0, r1, n, flare=0.0, exp=0.85):
    out = []
    for i in range(n):
        t = i / max(n - 1, 1)
        base_r = r0 * ((1.0 - t) ** exp) + r1 * (1.0 - (1.0 - t) ** exp)
        fl = flare * ((1.0 - smoothstep(0.0, 0.28, t)) ** 1.6)
        out.append(base_r + fl)
    return out


# ==================================================================
# GROUP 1: 4x UMBRELLA STONE PINES (Pinus pinea, evergreen pid=14)
# ==================================================================
PINE_BARK_BOT = srgb_to_lin('#5E4638')
PINE_BARK_TOP = srgb_to_lin('#886147')
PINE_BARK_PLATE = srgb_to_lin('#9A6F52')
PINE_FOL_TOP = srgb_to_lin('#567142')
PINE_FOL_MID = srgb_to_lin('#3B5432')
PINE_FOL_BOT = srgb_to_lin('#213626')


def build_pine_broad(mat, lod=0):
    """Broad Roman-villa Umbrella Stone Pine (~10.7 m, flat 2-tier Pinus pinea parasol <=0.30 depth/width, deep underside AO)."""
    pb = ProtoBuilder('pine_broad', 10.8, seed=101, lod=lod)
    trunk_pts = sample_curve([
        (0.0, 0.0, -0.80),
        (0.14, -0.06, 2.0),
        (0.42, 0.16, 5.1),
        (0.32, 0.14, 7.80),
    ], 7)
    trunk_r = taper_radii(0.38, 0.23, 7, flare=0.19, exp=0.72)
    pb.add_limb(
        trunk_pts, trunk_r, segs=7, col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        flute_amp=0.22, flute_n=4, flute_reach=0.38, wobble=0.05, cap_top=True,
        mottle_col=PINE_BARK_PLATE, sway_base=0.0, sway_tip=34.0, noise_seed=1.1,
    )
    fork = trunk_pts[-1]
    lower_fork = trunk_pts[-2]

    # 11 sculpted flat parasol lobes in a 2:1 size spread (rx 2.34 -> 1.12) across 2 flat-topped tiers (depth <= 0.30 * width)
    # Main flat umbrella perimeter lobes: (ang_deg, dist_r, pz, rx, ry, rzt, rzb, tilt)
    perim_pads = [
        ( 14.0, 2.28, 9.42, 1.92, 1.70, 0.58, 0.26, ( 0.02,  0.04, 0.2)),
        ( 86.0, 2.18, 9.50, 1.86, 1.66, 0.56, 0.25, (-0.03,  0.03, 0.7)),
        (158.0, 2.32, 9.38, 1.90, 1.68, 0.58, 0.26, ( 0.02, -0.03, 1.4)),
        (228.0, 2.22, 9.36, 1.88, 1.66, 0.56, 0.25, (-0.03, -0.03, 2.1)),
        (304.0, 2.14, 9.46, 1.82, 1.62, 0.56, 0.25, ( 0.03, -0.02, 2.8)),
    ]
    # 4 smaller outer rim needle cushions breaking the flat umbrella silhouette (2:1 size contrast)
    outer_tufts = [
        ( 50.0, 3.04, 9.52, 1.18, 1.04, 0.42, 0.20, ( 0.03,  0.04, 0.5)),
        (124.0, 2.98, 9.56, 1.14, 1.00, 0.40, 0.20, (-0.04,  0.03, 1.3)),
        (194.0, 3.10, 9.46, 1.20, 1.06, 0.42, 0.20, ( 0.04, -0.04, 2.2)),
        (274.0, 2.96, 9.50, 1.12, 0.98, 0.40, 0.20, (-0.03, -0.04, 3.1)),
    ]

    # 4 primary candelabra boughs + 4 secondary forks targeting pad undersides cleanly (embedded 0.36-0.42 m inside solid pads)
    bough_targets = [
        (perim_pads[0], outer_tufts[0], 0.175),
        (perim_pads[1], outer_tufts[1], 0.168),
        (perim_pads[2], outer_tufts[2], 0.175),
        (perim_pads[4], outer_tufts[3], 0.168),
    ]
    for k, (p_pad, s_pad, r0) in enumerate(bough_targets):
        ad, dist_r, pz, _rx, _ry, _rzt, rzb, _tilt = p_pad
        a = math.radians(ad)
        dir_xy = Vector((math.cos(a), math.sin(a), 0.0))
        start = lower_fork.lerp(fork, 0.48 + 0.14 * (k % 2))
        tip = Vector((fork.x + math.cos(a) * (dist_r * 0.84), fork.y + math.sin(a) * (dist_r * 0.84), pz - rzb + 0.38))
        elbow = start.lerp(tip, 0.52) + dir_xy * 0.24 + Vector((0.0, 0.0, -0.32))
        b_pts = sample_curve([start, elbow, tip], 5)
        pb.add_limb(
            b_pts, taper_radii(r0, r0 * 0.40, 5, exp=0.78), segs=5,
            col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
            mottle_col=PINE_BARK_PLATE, sway_base=16.0, sway_tip=48.0, noise_seed=2.0 + k, track_tip=True,
        )
        sad, sdr, spz, _srx, _sry, _srzt, srzb, _stilt = s_pad
        sa = math.radians(sad)
        s_start = b_pts[2]
        s_tip = Vector((fork.x + math.cos(sa) * (sdr * 0.78), fork.y + math.sin(sa) * (sdr * 0.78), spz - srzb + 0.32))
        s_mid = s_start.lerp(s_tip, 0.52) + Vector((0.0, 0.0, -0.14))
        pb.add_limb(
            sample_curve([s_start, s_mid, s_tip], 3),
            taper_radii(r0 * 0.52, r0 * 0.24, 3), segs=4,
            col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
            sway_base=22.0, sway_tip=54.0, noise_seed=6.0 + k, track_tip=True,
        )

    # 5th primary candelabra bough entering perim_pads[3] (angle 228 deg)
    ad3, dr3, pz3, _, _, _, rzb3, _ = perim_pads[3]
    a3 = math.radians(ad3)
    st3 = lower_fork.lerp(fork, 0.62)
    tp3 = Vector((fork.x + math.cos(a3) * (dr3 * 0.84), fork.y + math.sin(a3) * (dr3 * 0.84), pz3 - rzb3 + 0.38))
    el3 = st3.lerp(tp3, 0.50) + Vector((math.cos(a3) * 0.20, math.sin(a3) * 0.20, -0.28))
    pb.add_limb(
        sample_curve([st3, el3, tp3], 4), taper_radii(0.160, 0.065, 4), segs=5,
        col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        mottle_col=PINE_BARK_PLATE, sway_base=18.0, sway_tip=48.0, noise_seed=10.5, track_tip=True,
    )

    # Central continuation leader rising cleanly into flat parasol core
    pb.add_limb(
        sample_curve([fork, fork + Vector((0.08, -0.05, 0.95)), fork + Vector((-0.04, 0.06, 1.85))], 3),
        taper_radii(0.16, 0.065, 3), segs=5,
        col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        sway_base=22.0, sway_tip=52.0, noise_seed=11.0, track_tip=True,
    )

    # Tier 1: Broad flat-topped central parasol table
    pb.add_foliage_puff(
        Vector((fork.x + 0.06, fork.y + 0.02, 9.60)), 2.34, 2.18, 0.78, 0.28, PID_EVERGREEN,
        PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
        u_segs=14, v_rings=4, rim_lobes=5, rim_wave=0.09, crinkle_amp=0.10, crinkle_lobes=6,
        noise_amp=0.08, top_pow=0.62, bot_pow=0.74,
        dome_w=0.66, dome_up=0.38, sway_min=54.0, sway_max=82.0, seed=11,
    )
    # Tier 2: Subtle wide flat-topped upper parasol cap (authentic Pinus pinea flat shelf, NOT oak cumulus!)
    pb.add_foliage_puff(
        Vector((fork.x + 0.34, fork.y + 0.18, 9.94)), 1.66, 1.50, 0.54, 0.22, PID_EVERGREEN,
        PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
        u_segs=12, v_rings=3, rim_lobes=5, rim_wave=0.09, crinkle_amp=0.10, crinkle_lobes=5,
        noise_amp=0.08, top_pow=0.62, bot_pow=0.76,
        dome_w=0.66, dome_up=0.36, sway_min=58.0, sway_max=86.0, seed=115,
    )
    for i, (ad, dist_r, pz, rx, ry, rzt, rzb, tilt) in enumerate(perim_pads):
        a = math.radians(ad)
        pos = Vector((fork.x + math.cos(a) * dist_r, fork.y + math.sin(a) * dist_r, pz))
        pb.add_foliage_puff(
            pos, rx, ry, rzt, rzb, PID_EVERGREEN,
            PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
            u_segs=10, v_rings=3, rim_lobes=5, rim_wave=0.095, crinkle_amp=0.10, crinkle_lobes=5,
            noise_amp=0.085, top_pow=0.64, bot_pow=0.76, tilt=tilt,
            dome_w=0.66, dome_up=0.34, sway_min=58.0, sway_max=86.0, seed=20 + i,
        )
    for i, (ad, dist_r, pz, rx, ry, rzt, rzb, tilt) in enumerate(outer_tufts):
        a = math.radians(ad)
        pos = Vector((fork.x + math.cos(a) * dist_r, fork.y + math.sin(a) * dist_r, pz))
        pb.add_foliage_puff(
            pos, rx, ry, rzt, rzb, PID_EVERGREEN,
            PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
            u_segs=8, v_rings=3, rim_lobes=4, rim_wave=0.095, crinkle_amp=0.10, crinkle_lobes=5,
            noise_amp=0.085, top_pow=0.66, bot_pow=0.78, tilt=tilt,
            dome_w=0.65, dome_up=0.32, sway_min=60.0, sway_max=88.0, seed=140 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.46, macro_up_bias=0.38, ao_strength=0.62, ao_min=0.36, under_ao_boost=0.35)


def build_pine_tiered(mat, lod=0):
    """Tall architectural double-tiered Stone Pine (~10.9 m, 11 flat lobes on 2 flat-topped tiers <=0.30 depth/width, deep underside AO)."""
    pb = ProtoBuilder('pine_tiered', 11.2, seed=102, lod=lod)
    trunk_pts = sample_curve([
        (0.0, 0.0, -0.80),
        (-0.18, 0.08, 2.3),
        (0.28, -0.10, 5.6),
        (0.04, 0.08, 8.55),
    ], 7)
    trunk_r = taper_radii(0.38, 0.21, 7, flare=0.19, exp=0.74)
    pb.add_limb(
        trunk_pts, trunk_r, segs=7, col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        flute_amp=0.21, flute_n=4, flute_reach=0.36, wobble=0.05, cap_top=True,
        mottle_col=PINE_BARK_PLATE, sway_base=0.0, sway_tip=36.0, noise_seed=12.3,
    )

    # Lower subordinate flat parasol tier (3 sculpted flat lobes at z ~ 8.75..9.35 m)
    low_start = trunk_pts[4].lerp(trunk_pts[5], 0.35)
    low_dir = Vector((math.cos(math.radians(24.0)), math.sin(math.radians(24.0)), 0.0))
    low_s_dir = Vector((math.cos(math.radians(-22.0)), math.sin(math.radians(-22.0)), 0.0))
    low_pad_a = Vector((low_start.x + low_dir.x * 2.25, low_start.y + low_dir.y * 2.25, 8.94))
    low_pad_b = Vector((low_start.x + low_dir.x * 1.15 + low_s_dir.x * 1.05, low_start.y + low_dir.y * 1.15 + low_s_dir.y * 1.05, 8.82))

    low_tip = low_pad_a + Vector((-0.14, 0.04, 0.12))
    low_elbow = low_start.lerp(low_tip, 0.52) + Vector((0.0, 0.0, -0.26))
    low_pts = sample_curve([low_start, low_elbow, low_tip], 5)
    pb.add_limb(
        low_pts, taper_radii(0.165, 0.064, 5), segs=5,
        col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        mottle_col=PINE_BARK_PLATE, sway_base=14.0, sway_tip=46.0, noise_seed=14.0, track_tip=True,
    )
    low_s_tip = low_pad_b + Vector((-0.05, 0.02, 0.12))
    low_s_mid = low_pts[2].lerp(low_s_tip, 0.52) + Vector((0.0, 0.0, -0.14))
    pb.add_limb(
        sample_curve([low_pts[2], low_s_mid, low_s_tip], 3),
        taper_radii(0.096, 0.040, 3), segs=4,
        col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        sway_base=18.0, sway_tip=48.0, noise_seed=15.0, track_tip=True,
    )

    # Upper lofty main umbrella tier (8 sculpted flat lobes: 1 central table + 4 wide perimeter + 3 outer rim cushions)
    fork = trunk_pts[-1]
    upper_pads = [
        (132.0, 2.08, 10.04, 1.84, 1.64, 0.52, 0.24),
        (214.0, 2.16, 9.98, 1.86, 1.66, 0.50, 0.24),
        (292.0, 2.02, 10.02, 1.76, 1.58, 0.50, 0.24),
        ( 18.0, 1.86, 10.10, 1.70, 1.54, 0.48, 0.22),
    ]
    upper_outer = [
        (172.0, 2.82, 10.14, 1.12, 0.98, 0.38, 0.18),
        (254.0, 2.74, 10.16, 1.08, 0.96, 0.38, 0.18),
        ( 86.0, 2.66, 10.20, 1.04, 0.92, 0.36, 0.18),
    ]

    for k, (p_pad, s_pad, r0) in enumerate((
        (upper_pads[0], upper_outer[0], 0.160),
        (upper_pads[1], upper_outer[1], 0.164),
        (upper_pads[2], upper_outer[2], 0.155),
    )):
        ad, dr, pz, _rx, _ry, _rzt, rzb = p_pad
        a = math.radians(ad)
        dxy = Vector((math.cos(a), math.sin(a), 0.0))
        st = trunk_pts[-2].lerp(fork, 0.52 + 0.16 * k / 2.0)
        tp = Vector((fork.x + math.cos(a) * (dr * 0.84), fork.y + math.sin(a) * (dr * 0.84), pz - rzb + 0.36))
        el = st.lerp(tp, 0.50) + dxy * 0.22 + Vector((0.0, 0.0, -0.26))
        b_pts = sample_curve([st, el, tp], 5)
        pb.add_limb(
            b_pts, taper_radii(r0, r0 * 0.40, 5), segs=5,
            col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
            mottle_col=PINE_BARK_PLATE, sway_base=20.0, sway_tip=50.0, noise_seed=16.0 + k, track_tip=True,
        )
        sad, sdr, spz, _, _, _, srzb = s_pad
        sa = math.radians(sad)
        s_tip = Vector((fork.x + math.cos(sa) * (sdr * 0.78), fork.y + math.sin(sa) * (sdr * 0.78), spz - srzb + 0.30))
        s_mid = b_pts[2].lerp(s_tip, 0.52) + Vector((0.0, 0.0, -0.14))
        pb.add_limb(
            sample_curve([b_pts[2], s_mid, s_tip], 3),
            taper_radii(r0 * 0.50, r0 * 0.24, 3), segs=4,
            col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
            sway_base=24.0, sway_tip=56.0, noise_seed=20.0 + k, track_tip=True,
        )

    # 4th upper bough supporting upper_pads[3] + central leader into flat top table
    ad4, dr4, pz4, _, _, _, rzb4 = upper_pads[3]
    a4 = math.radians(ad4)
    st4 = trunk_pts[-2].lerp(fork, 0.72)
    tp4 = Vector((fork.x + math.cos(a4) * (dr4 * 0.82), fork.y + math.sin(a4) * (dr4 * 0.82), pz4 - rzb4 + 0.34))
    el4 = st4.lerp(tp4, 0.50) + Vector((math.cos(a4) * 0.16, math.sin(a4) * 0.16, -0.22))
    pb.add_limb(
        sample_curve([st4, el4, tp4], 4), taper_radii(0.145, 0.058, 4), segs=5,
        col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        mottle_col=PINE_BARK_PLATE, sway_base=22.0, sway_tip=52.0, noise_seed=23.5, track_tip=True,
    )
    pb.add_limb(
        sample_curve([fork, fork + Vector((-0.05, 0.04, 0.90)), fork + Vector((-0.10, 0.05, 1.72))], 3),
        taper_radii(0.15, 0.06, 3), segs=5,
        col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        sway_base=24.0, sway_tip=54.0, noise_seed=24.0, track_tip=True,
    )

    # Tier 1 (lower subordinate flat shelf: 3 lobes)
    pb.add_foliage_puff(
        low_pad_a, 1.80, 1.56, 0.46, 0.22, PID_EVERGREEN,
        PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
        u_segs=10, v_rings=3, rim_lobes=5, rim_wave=0.09, crinkle_amp=0.10, crinkle_lobes=5,
        noise_amp=0.085, top_pow=0.64, bot_pow=0.76, tilt=(0.02, 0.03, 0.3),
        dome_w=0.66, dome_up=0.34, sway_min=46.0, sway_max=74.0, seed=41,
    )
    pb.add_foliage_puff(
        low_pad_b, 1.34, 1.18, 0.40, 0.20, PID_EVERGREEN,
        PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
        u_segs=8, v_rings=3, rim_lobes=4, rim_wave=0.09, crinkle_amp=0.10, crinkle_lobes=5,
        noise_amp=0.085, top_pow=0.66, bot_pow=0.78,
        dome_w=0.66, dome_up=0.32, sway_min=44.0, sway_max=70.0, seed=42,
    )
    pb.add_foliage_puff(
        low_pad_a + low_dir * 0.88 + Vector((0.0, 0.28, 0.14)), 1.02, 0.90, 0.34, 0.18, PID_EVERGREEN,
        PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
        u_segs=8, v_rings=3, rim_lobes=4, rim_wave=0.095, crinkle_amp=0.10, crinkle_lobes=5,
        noise_amp=0.085, top_pow=0.68, bot_pow=0.80,
        dome_w=0.65, dome_up=0.32, sway_min=48.0, sway_max=76.0, seed=421,
    )

    # Tier 2 (upper lofty flat umbrella table: 1 central table + 4 perimeter + 3 outer rim cushions = 11 total)
    pb.add_foliage_puff(
        Vector((fork.x - 0.10, fork.y + 0.05, 10.22)), 2.14, 1.98, 0.56, 0.24, PID_EVERGREEN,
        PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
        u_segs=14, v_rings=4, rim_lobes=5, rim_wave=0.09, crinkle_amp=0.10, crinkle_lobes=6,
        noise_amp=0.08, top_pow=0.60, bot_pow=0.72,
        dome_w=0.66, dome_up=0.38, sway_min=60.0, sway_max=86.0, seed=43,
    )
    for i, (ad, dr, pz, rx, ry, rzt, rzb) in enumerate(upper_pads):
        a = math.radians(ad)
        pos = Vector((fork.x + math.cos(a) * dr, fork.y + math.sin(a) * dr, pz))
        pb.add_foliage_puff(
            pos, rx, ry, rzt, rzb, PID_EVERGREEN,
            PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
            u_segs=10, v_rings=3, rim_lobes=5, rim_wave=0.095, crinkle_amp=0.10, crinkle_lobes=5,
            noise_amp=0.085, top_pow=0.64, bot_pow=0.76,
            dome_w=0.66, dome_up=0.34, sway_min=60.0, sway_max=88.0, seed=50 + i,
        )
    for i, (ad, dr, pz, rx, ry, rzt, rzb) in enumerate(upper_outer):
        a = math.radians(ad)
        pos = Vector((fork.x + math.cos(a) * dr, fork.y + math.sin(a) * dr, pz))
        pb.add_foliage_puff(
            pos, rx, ry, rzt, rzb, PID_EVERGREEN,
            PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
            u_segs=8, v_rings=3, rim_lobes=4, rim_wave=0.095, crinkle_amp=0.10, crinkle_lobes=5,
            noise_amp=0.085, top_pow=0.66, bot_pow=0.78,
            dome_w=0.65, dome_up=0.32, sway_min=62.0, sway_max=88.0, seed=150 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.44, macro_up_bias=0.38, ao_strength=0.62, ao_min=0.36, under_ao_boost=0.35)


def build_pine_sheared(mat, lod=0):
    """Wind-sculpted coastal Stone Pine (~9.5 m, embedded meltemi boughs + tufted wind-streamed parasol)."""
    pb = ProtoBuilder('pine_sheared', 9.5, seed=103, lod=lod)
    trunk_pts = sample_curve([
        (0.0, 0.0, -0.80),
        (0.32, 0.04, 1.65),
        (1.12, 0.14, 4.35),
        (1.92, 0.20, 6.72),
    ], 7)
    trunk_r = taper_radii(0.36, 0.20, 7, flare=0.18, exp=0.75)
    pb.add_limb(
        trunk_pts, trunk_r, segs=7, col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        flute_amp=0.22, flute_n=4, flute_reach=0.38, wobble=0.05, cap_top=True,
        mottle_col=PINE_BARK_PLATE, sway_base=0.0, sway_tip=36.0, noise_seed=21.0,
    )
    fork = trunk_pts[-1]

    # Define streamed parasol pads first -> embed every bough tip 0.45-0.55 m UP INTO solid pad interiors!
    pads = [
        # (dx, dy, pz, rx, ry, rzt, rzb, tilt, us, vr)
        ( 0.55,  0.05, 8.42, 2.18, 1.72, 0.84, 0.34, ( 0.02, 0.08,  0.05), 12, 4),  # 0: core
        ( 2.38, -0.22, 8.18, 1.94, 1.54, 0.70, 0.28, (-0.03, 0.11, -0.08), 10, 3),  # 1: leeward lead
        ( 1.62,  1.40, 8.28, 1.76, 1.44, 0.68, 0.28, ( 0.04, 0.09,  0.25), 10, 3),  # 2: north flank
        ( 1.52, -1.42, 8.22, 1.74, 1.42, 0.66, 0.28, (-0.04, 0.09, -0.22), 10, 3),  # 3: south flank
        (-0.98,  0.12, 8.32, 1.46, 1.36, 0.66, 0.28, ( 0.02, 0.05,  0.00),  8, 3),  # 4: windward cap
        ( 3.35,  0.42, 7.90, 1.40, 1.18, 0.56, 0.24, ( 0.04, 0.13,  0.10),  8, 3),  # 5: leeward tail
        ( 0.42, -1.10, 7.82, 1.28, 1.12, 0.54, 0.24, (-0.04, 0.08, -0.15),  8, 3),  # 6: lower south
        ( 0.52,  1.12, 7.88, 1.24, 1.08, 0.52, 0.24, ( 0.04, 0.08,  0.15),  8, 3),  # 7: lower north
        ( 2.95, -0.96, 8.12, 1.08, 0.92, 0.46, 0.22, (-0.03, 0.12, -0.20),  8, 3),  # 8: outer tuft
        ( 2.48,  1.32, 8.30, 1.06, 0.90, 0.46, 0.22, ( 0.04, 0.11,  0.22),  8, 3),  # 9: outer tuft
        (-0.42, -1.08, 8.36, 0.98, 0.88, 0.44, 0.22, (-0.02, 0.06, -0.10),  8, 3),  # 10: windward tuft
        ( 1.25,  0.32, 8.66, 1.38, 1.16, 0.58, 0.24, ( 0.02, 0.10,  0.08),  8, 3),  # 11: stepped upper crest mound
    ]

    # 4 primary boughs + 4 secondary forks targeting pad interiors (0.45-0.55 m UP INTO underside!)
    bough_map = [
        (1, 5, 0.160),
        (2, 7, 0.150),
        (3, 6, 0.148),
        (4, 0, 0.130),
    ]
    for k, (p_idx, s_idx, r0) in enumerate(bough_map):
        dx, dy, pz, _rx, _ry, _rzt, rzb, *_ = pads[p_idx]
        st = trunk_pts[-2].lerp(fork, 0.46 + 0.16 * (k % 3))
        tp = Vector((fork.x + dx * 0.85, fork.y + dy * 0.85, pz - rzb + 0.48))
        el = st.lerp(tp, 0.52) + Vector((0.20, 0.0, -0.22))
        b_pts = sample_curve([st, el, tp], 5)
        pb.add_limb(
            b_pts, taper_radii(r0, r0 * 0.40, 5), segs=5,
            col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
            mottle_col=PINE_BARK_PLATE, sway_base=18.0, sway_tip=50.0, noise_seed=25.0 + k, track_tip=True,
        )
        sdx, sdy, spz, _, _, _, srzb, *_ = pads[s_idx]
        s_tip = Vector((fork.x + sdx * 0.84, fork.y + sdy * 0.84, spz - srzb + 0.46))
        s_mid = b_pts[2].lerp(s_tip, 0.52) + Vector((0.12, 0.0, -0.14))
        pb.add_limb(
            sample_curve([b_pts[2], s_mid, s_tip], 3),
            taper_radii(r0 * 0.50, r0 * 0.24, 3), segs=4,
            col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
            sway_base=24.0, sway_tip=56.0, noise_seed=30.0 + k, track_tip=True,
        )

    for i, (dx, dy, pz, rx, ry, rzt, rzb, tilt, us, vr) in enumerate(pads):
        pb.add_foliage_puff(
            Vector((fork.x + dx, fork.y + dy, pz)), rx, ry, rzt, rzb, PID_EVERGREEN,
            PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
            u_segs=us, v_rings=vr, rim_lobes=5 if us >= 12 else 4, rim_wave=0.095,
            crinkle_amp=0.11, crinkle_lobes=5, noise_amp=0.09, top_pow=0.78, bot_pow=0.82,
            tilt=tilt, dome_w=0.66, dome_up=0.30, sway_min=56.0, sway_max=88.0,
            wind_shear=(0.24, 0.03), seed=60 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.46, macro_up_bias=0.36, ao_strength=0.62, ao_min=0.36, under_ao_boost=0.28)


def build_pine_young(mat, lod=0):
    """Youthful coastal Stone Pine (~6.6 m, curved leaning trunk, lower branch stub, asymmetric two-step crown)."""
    pb = ProtoBuilder('pine_young', 6.6, seed=104, lod=lod)
    # Noticeably curved, coastal-leaning trunk (de-lollipopped!)
    trunk_pts = sample_curve([
        (0.0, 0.0, -0.80),
        (0.18, -0.07, 1.05),
        (0.46, 0.04, 2.60),
        (0.34, 0.14, 4.18),
    ], 6)
    trunk_r = taper_radii(0.26, 0.14, 6, flare=0.12, exp=0.76)
    pb.add_limb(
        trunk_pts, trunk_r, segs=6, col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        flute_amp=0.17, flute_n=4, flute_reach=0.38, wobble=0.06, cap_top=True,
        mottle_col=PINE_BARK_PLATE, sway_base=0.0, sway_tip=30.0, noise_seed=31.0,
    )
    fork = trunk_pts[-1]

    # Subtle weathered lower branch stub on the coastal-lean flank (iconic self-pruning young pine character!)
    stub_st = trunk_pts[2].lerp(trunk_pts[3], 0.42)
    stub_dir = Vector((-0.82, -0.57, 0.0))
    stub_pts = sample_curve([
        stub_st,
        stub_st + stub_dir * 0.28 + Vector((0.0, 0.0, 0.10)),
        stub_st + stub_dir * 0.54 + Vector((0.0, 0.0, 0.26)),
    ], 3)
    pb.add_limb(
        stub_pts, taper_radii(0.068, 0.024, 3), segs=4,
        col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        wobble=0.08, sway_base=8.0, sway_tip=18.0, noise_seed=32.5,
    )

    # Asymmetric two-step young crown:
    # Step 1 (lower side shoulder on +X/-Y flank, z ~ 4.0-4.7 m)
    low_step_pads = [
        (fork.x + 1.28, fork.y - 0.52, 4.38, 1.12, 0.98, 0.62, 0.28, 10, 3),
        (fork.x + 1.82, fork.y - 0.18, 4.54, 0.84, 0.76, 0.48, 0.23,  8, 3),
        (fork.x + 0.86, fork.y - 1.12, 4.24, 0.86, 0.78, 0.48, 0.23,  8, 3),
    ]
    # Step 2 (higher offset main tufted crown crowning at ~6.55 m, leaned slightly -X/+Y)
    upper_crown_pads = [
        (fork.x - 0.16, fork.y + 0.12, 5.54, 1.48, 1.36, 0.96, 0.36, 10, 4),  # apex core
        (fork.x - 1.24, fork.y + 0.42, 5.04, 1.20, 1.08, 0.68, 0.30,  8, 3),  # west lobe
        (fork.x + 0.32, fork.y + 1.18, 5.18, 1.18, 1.06, 0.68, 0.30,  8, 3),  # north lobe
        (fork.x - 0.58, fork.y - 0.98, 4.92, 1.12, 1.02, 0.64, 0.28,  8, 3),  # south-west lobe
        (fork.x + 0.92, fork.y + 0.68, 5.36, 1.04, 0.94, 0.58, 0.26,  8, 3),  # east-north crest
        (fork.x - 1.38, fork.y - 0.36, 5.30, 0.92, 0.84, 0.52, 0.24,  8, 3),  # outer rim tuft
        (fork.x + 0.18, fork.y + 1.48, 5.50, 0.86, 0.78, 0.48, 0.23,  8, 3),  # upper outer tuft
    ]

    # Lower step bough + fork embedded 0.45 m UP INTO lower step pads
    ls_st = trunk_pts[-2].lerp(fork, 0.32)
    lp0 = low_step_pads[0]
    ls_tip = Vector((lp0[0] - 0.08, lp0[1] + 0.04, lp0[2] - lp0[6] + 0.45))
    ls_el = ls_st.lerp(ls_tip, 0.50) + Vector((0.12, -0.06, -0.14))
    ls_pts = sample_curve([ls_st, ls_el, ls_tip], 4)
    pb.add_limb(
        ls_pts, taper_radii(0.105, 0.040, 4), segs=5,
        col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        sway_base=14.0, sway_tip=42.0, noise_seed=33.5, track_tip=True,
    )
    lp2 = low_step_pads[2]
    ls2_tip = Vector((lp2[0] - 0.04, lp2[1] + 0.04, lp2[2] - lp2[6] + 0.42))
    pb.add_limb(
        sample_curve([ls_pts[2], ls_pts[2].lerp(ls2_tip, 0.5) + Vector((0.0, 0.0, -0.08)), ls2_tip], 3),
        taper_radii(0.058, 0.024, 3), segs=4,
        col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        sway_base=18.0, sway_tip=46.0, noise_seed=34.0, track_tip=True,
    )

    # 3 upper step boughs + leader embedded 0.46-0.54 m UP INTO upper crown pads
    for k, pad in enumerate((upper_crown_pads[1], upper_crown_pads[2], upper_crown_pads[3])):
        st = trunk_pts[-2].lerp(fork, 0.62 + 0.16 * k)
        tp = Vector((pad[0] * 0.88 + fork.x * 0.12, pad[1] * 0.88 + fork.y * 0.12, pad[2] - pad[6] + 0.48))
        el = st.lerp(tp, 0.50) + Vector((0.0, 0.0, -0.18))
        pb.add_limb(
            sample_curve([st, el, tp], 4), taper_radii(0.110, 0.042, 4), segs=5,
            col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
            sway_base=16.0, sway_tip=46.0, noise_seed=35.0 + k, track_tip=True,
        )
    pb.add_limb(
        sample_curve([fork, fork + Vector((-0.08, 0.06, 0.72)), Vector((fork.x - 0.16, fork.y + 0.12, 5.65))], 3),
        taper_radii(0.115, 0.045, 3), segs=5,
        col_bot=PINE_BARK_BOT, col_top=PINE_BARK_TOP,
        sway_base=20.0, sway_tip=48.0, noise_seed=39.0, track_tip=True,
    )

    for i, (px, py, pz, rx, ry, rzt, rzb, us, vr) in enumerate(low_step_pads + upper_crown_pads):
        pb.add_foliage_puff(
            Vector((px, py, pz)), rx, ry, rzt, rzb, PID_EVERGREEN,
            PINE_FOL_TOP, PINE_FOL_MID, PINE_FOL_BOT,
            u_segs=us, v_rings=vr, rim_lobes=4, rim_wave=0.095, crinkle_amp=0.11, crinkle_lobes=5,
            noise_amp=0.09, top_pow=0.80, bot_pow=0.84,
            dome_w=0.66, dome_up=0.28, sway_min=48.0, sway_max=82.0, seed=72 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.46, macro_up_bias=0.30, ao_strength=0.58, ao_min=0.38)


# ==================================================================
# GROUP 2: 3x ITALIAN CYPRESSES (Cupressus sempervirens, pid=14)
# Distinct silhouette, profile, and topology for each of the 3 variants!
# ==================================================================
CYP_BARK_BOT = srgb_to_lin('#3A2F26')
CYP_BARK_TOP = srgb_to_lin('#4C3E32')
CYP_FOL_TOP = srgb_to_lin('#415A3C')
CYP_FOL_MID = srgb_to_lin('#2D4430')
CYP_FOL_BOT = srgb_to_lin('#1C2D24')

COL_FOL_TOP = srgb_to_lin('#49633F')
COL_FOL_MID = srgb_to_lin('#324B31')
COL_FOL_BOT = srgb_to_lin('#1F3325')

SANCT_FOL_TOP = srgb_to_lin('#314D3B')
SANCT_FOL_MID = srgb_to_lin('#1F382E')
SANCT_FOL_BOT = srgb_to_lin('#132421')


def build_cypress_tall(mat, lod=0):
    """Tall slender wind-nodding flame Cypress (~11.8 m, widest ~32% height + 9 prominent breaking plumes)."""
    nominal_h = 11.8
    max_r = 1.14
    z_start = 0.82
    h_core = nominal_h - z_start
    nod_vec = Vector((0.52, 0.22, 0.0))
    pb = ProtoBuilder('cypress_tall', nominal_h, seed=201, lod=lod)

    stem_pts = sample_curve([(0.0, 0.0, -0.60), (0.02, -0.01, 0.65), (0.04, 0.02, 2.25)], 4)
    pb.add_limb(
        stem_pts, taper_radii(0.22, 0.13, 4, flare=0.06), segs=6,
        col_bot=CYP_BARK_BOT, col_top=CYP_BARK_TOP,
        flute_amp=0.14, flute_n=4, flute_reach=0.55, cap_top=True,
        sway_base=0.0, sway_tip=16.0, noise_seed=60.1,
    )

    # Flame spindle: sleek narrow rise -> widest at t = 0.32 -> graceful slender flame spire
    def flame_env(t):
        if t < 0.32:
            return 0.24 + 0.76 * smoothstep(0.0, 0.32, t) ** 0.85
        u = (t - 0.32) / 0.68
        return max(0.04, (1.0 - u) ** 0.92)

    pb.add_cypress_core(
        z_bot=z_start, height=h_core, max_r=max_r, pid=PID_EVERGREEN,
        col_top=CYP_FOL_TOP, col_mid=CYP_FOL_MID, col_bot=CYP_FOL_BOT,
        segs=10, n_rings=9, flute_n=5, flute_amp=0.12, env_fn=flame_env,
        nod_vec=nod_vec, nod_exp=2.25, dome_w=0.66, sway_min=10.0, sway_max=98.0, seed=201,
    )

    # 9 prominent staggered ascending feather plumes genuinely breaking the flame silhouette!
    # (z_frac, h_frac, r_rel, ang_deg, off_rel, flare_k)
    plumes = [
        (0.08, 0.30, 0.46,  18.0, 0.48, 0.24),
        (0.13, 0.32, 0.50, 146.0, 0.52, 0.26),
        (0.17, 0.34, 0.48, 266.0, 0.50, 0.25),
        (0.25, 0.32, 0.50,  78.0, 0.54, 0.28),
        (0.32, 0.32, 0.48, 206.0, 0.54, 0.28),
        (0.41, 0.28, 0.44, 326.0, 0.50, 0.24),
        (0.50, 0.26, 0.40, 118.0, 0.48, 0.22),
        (0.60, 0.24, 0.34, 248.0, 0.42, 0.20),
        (0.70, 0.20, 0.26,  42.0, 0.34, 0.16),
    ]
    for idx, (zf, hf, r_rel, ad, off_rel, flare_k) in enumerate(plumes):
        a = math.radians(ad)
        z0 = z_start + h_core * zf
        lh = h_core * hf
        t_mid = min(0.95, zf + hf * 0.42)
        spine_off = nod_vec * (t_mid ** 2.25)
        r_here = max_r * flame_env(t_mid)
        base_pt = Vector((math.cos(a) * r_here * off_rel, math.sin(a) * r_here * off_rel, z0)) + spine_off * 0.85
        tilt_out = Vector((math.cos(a) * max_r * flare_k, math.sin(a) * max_r * flare_k, 0.0))
        tip_lean = nod_vec * ((min(1.0, zf + hf) ** 2.25) - (zf ** 2.25)) * 0.85
        pb.add_cypress_plume(
            base_pt, lh, max_r * r_rel, PID_EVERGREEN,
            CYP_FOL_TOP, CYP_FOL_MID, CYP_FOL_BOT,
            segs=6, tilt_out=tilt_out, tip_lean=tip_lean, dome_w=0.65,
            sway_min=14.0, sway_max=96.0, seed=210 + idx * 11,
        )

    return pb.finalize(mat, macro_dome_mix=0.54, macro_up_bias=0.16, ao_strength=0.56, ao_min=0.40, ao_dist=2.8)


def build_cypress_column(mat, lod=0):
    """Architectural fluted garden Column Cypress (~9.6 m, NARROW tapered base, widest ~38% height, zero teardrop bulge!)."""
    nominal_h = 9.6
    max_r = 1.12
    z_start = 0.88
    h_core = nominal_h - z_start
    nod_vec = Vector((-0.09, 0.06, 0.0))
    pb = ProtoBuilder('cypress_column', nominal_h, seed=202, lod=lod)

    stem_pts = sample_curve([(0.0, 0.0, -0.60), (-0.01, 0.01, 0.65), (-0.02, 0.01, 2.05)], 4)
    pb.add_limb(
        stem_pts, taper_radii(0.21, 0.13, 4, flare=0.05), segs=6,
        col_bot=CYP_BARK_BOT, col_top=CYP_BARK_TOP,
        flute_amp=0.12, flute_n=4, flute_reach=0.55, cap_top=True,
        sway_base=0.0, sway_tip=12.0, noise_seed=61.2,
    )

    # Architectural fluted column profile:
    # Slim clean base (NO bottom bulge!) -> widest at 36-42% height -> steady fluted architectural column through 68% -> crisp finial taper
    def column_env(t):
        if t < 0.36:
            return 0.20 + 0.80 * (smoothstep(0.0, 0.36, t) ** 1.18)
        elif t < 0.70:
            u = (t - 0.36) / 0.34
            return 1.0 - 0.10 * (u ** 1.3)
        else:
            u = (t - 0.70) / 0.30
            return max(0.04, 0.90 * ((1.0 - u) ** 0.84))

    pb.add_cypress_core(
        z_bot=z_start, height=h_core, max_r=max_r, pid=PID_EVERGREEN,
        col_top=COL_FOL_TOP, col_mid=COL_FOL_MID, col_bot=COL_FOL_BOT,
        segs=12, n_rings=9, flute_n=6, flute_amp=0.17, env_fn=column_env,
        nod_vec=nod_vec, nod_exp=2.4, dome_w=0.64, sway_min=8.0, sway_max=88.0, seed=202,
    )

    # 6 bold architectural vertical fluted ribs strictly ABOVE the narrow base (z_frac >= 0.20 -> ZERO bottom bulge!)
    plumes = [
        (0.20, 0.42, 0.44,  15.0, 0.56, 0.14),
        (0.24, 0.40, 0.44, 135.0, 0.56, 0.14),
        (0.22, 0.42, 0.44, 255.0, 0.56, 0.14),
        (0.38, 0.38, 0.40,  75.0, 0.54, 0.14),
        (0.42, 0.36, 0.38, 195.0, 0.54, 0.14),
        (0.45, 0.34, 0.36, 315.0, 0.52, 0.13),
    ]
    for idx, (zf, hf, r_rel, ad, off_rel, flare_k) in enumerate(plumes):
        a = math.radians(ad)
        z0 = z_start + h_core * zf
        lh = h_core * hf
        t_mid = min(0.92, zf + hf * 0.45)
        r_here = max_r * column_env(t_mid)
        base_pt = Vector((math.cos(a) * r_here * off_rel, math.sin(a) * r_here * off_rel, z0)) + nod_vec * (t_mid ** 2.4)
        tilt_out = Vector((math.cos(a) * max_r * flare_k, math.sin(a) * max_r * flare_k, 0.0))
        pb.add_cypress_plume(
            base_pt, lh, max_r * r_rel, PID_EVERGREEN,
            COL_FOL_TOP, COL_FOL_MID, COL_FOL_BOT,
            segs=6, tilt_out=tilt_out, dome_w=0.66,
            sway_min=10.0, sway_max=86.0, seed=250 + idx * 13,
        )

    return pb.finalize(mat, macro_dome_mix=0.52, macro_up_bias=0.14, ao_strength=0.58, ao_min=0.38, ao_dist=2.6)


def build_cypress_sanctuary(mat, lod=0):
    """Ancient stately DOUBLE-CRESTED, deeply fluted dark emerald-slate Sanctuary Cypress (~12.4 m)."""
    nominal_h = 12.4
    max_r = 1.08
    z_start = 0.86
    h_core = nominal_h - z_start
    nod_vec = Vector((0.26, -0.14, 0.0))
    pb = ProtoBuilder('cypress_sanctuary', nominal_h, seed=203, lod=lod)

    # Gnarled fluted ancient dark woody base stem
    stem_pts = sample_curve([(0.0, 0.0, -0.65), (-0.04, 0.02, 0.70), (0.03, -0.02, 2.40)], 4)
    pb.add_limb(
        stem_pts, taper_radii(0.28, 0.16, 4, flare=0.10), segs=7,
        col_bot=CYP_BARK_BOT, col_top=CYP_BARK_TOP,
        flute_amp=0.22, flute_n=5, flute_reach=0.75, twist=0.45, cap_top=True,
        sway_base=0.0, sway_tip=14.0, noise_seed=62.3,
    )

    # Austere ancient deeply fluted primary spire (narrower, taller, regal verticality)
    def sanct_env(t):
        if t < 0.28:
            return 0.28 + 0.72 * smoothstep(0.0, 0.28, t) ** 0.90
        u = (t - 0.28) / 0.72
        return max(0.04, (1.0 - u) ** 0.96)

    pb.add_cypress_core(
        z_bot=z_start, height=h_core, max_r=max_r, pid=PID_EVERGREEN,
        col_top=SANCT_FOL_TOP, col_mid=SANCT_FOL_MID, col_bot=SANCT_FOL_BOT,
        segs=12, n_rings=10, flute_n=5, flute_amp=0.17, env_fn=sanct_env,
        nod_vec=nod_vec, nod_exp=2.3, dome_w=0.64, sway_min=10.0, sway_max=98.0, seed=203,
    )

    # SIGNATURE ANCIENT DOUBLE CREST: secondary forked sanctuary spire rising cleanly beside the upper crown!
    crest_ang = math.radians(152.0)
    crest_base_xy = Vector((math.cos(crest_ang) * 0.44, math.sin(crest_ang) * 0.44))
    crest_z0 = 5.45
    crest_h = 5.25  # reaches z = 10.70 m beside the 12.4 m primary leader!

    def twin_crest_env(t):
        if t < 0.24:
            return 0.45 + 0.55 * smoothstep(0.0, 0.24, t)
        u = (t - 0.24) / 0.76
        return max(0.05, (1.0 - u) ** 0.88)

    pb.add_cypress_core(
        z_bot=crest_z0, height=crest_h, max_r=0.46, pid=PID_EVERGREEN,
        col_top=SANCT_FOL_TOP, col_mid=SANCT_FOL_MID, col_bot=SANCT_FOL_BOT,
        segs=8, n_rings=6, flute_n=4, flute_amp=0.14, env_fn=twin_crest_env,
        base_xy=crest_base_xy,
        nod_vec=Vector((math.cos(crest_ang) * 0.28 + 0.14, math.sin(crest_ang) * 0.28 - 0.08, 0.0)),
        nod_exp=1.6, dome_w=0.64, sway_min=42.0, sway_max=94.0, seed=299,
    )

    # 8 deep-fluted ancient sanctuary flank plumes breaking lower & mid profile
    plumes = [
        (0.07, 0.30, 0.48,  26.0, 0.46, 0.20),
        (0.12, 0.34, 0.52, 148.0, 0.50, 0.24),
        (0.16, 0.32, 0.48, 274.0, 0.48, 0.22),
        (0.28, 0.32, 0.46,  86.0, 0.48, 0.22),
        (0.36, 0.32, 0.44, 214.0, 0.46, 0.20),
        (0.46, 0.28, 0.40, 336.0, 0.44, 0.20),
        (0.56, 0.24, 0.34,  58.0, 0.40, 0.18),
        (0.66, 0.22, 0.28, 294.0, 0.34, 0.16),
    ]
    for idx, (zf, hf, r_rel, ad, off_rel, flare_k) in enumerate(plumes):
        a = math.radians(ad)
        z0 = z_start + h_core * zf
        lh = h_core * hf
        t_mid = min(0.94, zf + hf * 0.45)
        r_here = max_r * sanct_env(t_mid)
        base_pt = Vector((math.cos(a) * r_here * off_rel, math.sin(a) * r_here * off_rel, z0)) + nod_vec * (t_mid ** 2.3)
        tilt_out = Vector((math.cos(a) * max_r * flare_k, math.sin(a) * max_r * flare_k, 0.0))
        pb.add_cypress_plume(
            base_pt, lh, max_r * r_rel, PID_EVERGREEN,
            SANCT_FOL_TOP, SANCT_FOL_MID, SANCT_FOL_BOT,
            segs=6, tilt_out=tilt_out, dome_w=0.64,
            sway_min=14.0, sway_max=96.0, seed=280 + idx * 11,
        )

    return pb.finalize(mat, macro_dome_mix=0.50, macro_up_bias=0.14, ao_strength=0.60, ao_min=0.36, ao_dist=3.0)


# ==================================================================
# GROUP 3: 3x GNARLED OLIVES (Olea europaea, evergreen pid=14)
# Twisted fluted hollow-feeling grey trunks + lower, spreading, broken,
# airy crowns with sunlit gaps & horizontally flattened silver-sage sprays!
# ==================================================================
OLIVE_BARK_BOT = srgb_to_lin('#554E46')
OLIVE_BARK_TOP = srgb_to_lin('#888074')
OLIVE_BARK_BLEACH = srgb_to_lin('#A69E92')
# Authentic Olea europaea sage-olive foliage: deep Mediterranean olive-sage crown with subtle sunlit silver-leaf shimmer
# and rich volumetric top-to-underside shading (kept well below chalk-white so aerial rows never read as cotton puffs)
OLIVE_FOL_TOP = Vector((0.125, 0.165, 0.095))
OLIVE_FOL_MID = Vector((0.145, 0.180, 0.125))
OLIVE_FOL_BOT = Vector((0.100, 0.126, 0.092))
OLIVE_SILVER = Vector((0.215, 0.245, 0.188))


def build_olive_ancient(mat, lod=0):
    """Centuries-old gnarled patriarch Olive (~5.5 m, massive twisted fluted hollow-cleft trunk + airy horizontal bi-colour sprays)."""
    pb = ProtoBuilder('olive_ancient', 5.5, seed=301, lod=lod)

    # Unified massive twisted, deeply-fluted, knotted, hollow-clefted ancient trunk (NO detached spaghetti legs!)
    main_trunk = sample_curve([
        (0.0, 0.0, -0.70),
        (0.16, -0.10, 0.34),
        (-0.10, 0.14, 1.12),
        (0.08, 0.04, 1.82),
    ], 7)
    pb.add_limb(
        main_trunk, taper_radii(0.48, 0.34, 7, flare=0.24, exp=0.58), segs=10,
        col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP,
        mottle_col=OLIVE_BARK_BLEACH, mottle_strength=0.46,
        flute_amp=0.30, flute_n=5, flute_reach=1.0, twist=1.95, wobble=0.08,
        knot_amp=0.22, knot_freq=2.8, hollow_amp=0.34, hollow_ang=0.75,
        cap_top=True, sway_base=0.0, sway_tip=14.0, noise_seed=41.0,
    )
    # 2 thick fused spiraling root-buttress cords hugging tightly into the trunk body (sculpting a real hollow cleft!)
    cord_tips = []
    for ci, a0 in enumerate((math.radians(-35.0), math.radians(155.0))):
        pts = sample_curve([
            (math.cos(a0) * 0.34, math.sin(a0) * 0.34, -0.68),
            (0.12 + math.cos(a0 + 0.65) * 0.22, -0.06 + math.sin(a0 + 0.65) * 0.22, 0.35),
            (-0.06 + math.cos(a0 + 1.35) * 0.20, 0.10 + math.sin(a0 + 1.35) * 0.20, 1.10),
            (0.06 + math.cos(a0 + 1.95) * 0.22, 0.04 + math.sin(a0 + 1.95) * 0.22, 1.72),
        ], 6)
        pb.add_limb(
            pts, taper_radii(0.24, 0.14, 6, flare=0.10, exp=0.70), segs=6,
            col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP,
            mottle_col=OLIVE_BARK_BLEACH, mottle_strength=0.50,
            flute_amp=0.18, flute_n=3, flute_reach=1.0, twist=1.20, wobble=0.08, knot_amp=0.16,
            cap_top=True, sway_base=0.0, sway_tip=14.0, noise_seed=42.5 + ci * 3.1,
        )
        cord_tips.append(pts[-1])
    cord_tips.append(main_trunk[-1])

    # 4 crooked, elbowed, wide-spreading gnarled primary limbs + crooked secondary forks
    limb_specs = [
        # (cord_i, ang_d, reach, dz, r0, elbow_perp, sub_off, sub_reach, sub_dz)
        (0,  12.0, 2.52, 1.72, 0.180,  0.46, -42.0, 1.15, 0.92),
        (1, 108.0, 2.38, 1.96, 0.172, -0.44,  38.0, 1.08, 0.88),
        (2, 196.0, 2.64, 1.64, 0.180,  0.48, -38.0, 1.16, 0.86),
        (2, 294.0, 2.30, 1.88, 0.166, -0.42,  40.0, 1.04, 0.94),
    ]
    spray_clusters = []
    for k, (ci, ad, reach, dz, r0, ep, sub_off, sr, sdz) in enumerate(limb_specs):
        a = math.radians(ad)
        dxy = Vector((math.cos(a), math.sin(a), 0.0))
        perp = Vector((-math.sin(a), math.cos(a), 0.0))
        st = main_trunk[-2].lerp(cord_tips[ci], 0.72)
        k1 = st + dxy * (reach * 0.36) + perp * ep + Vector((0.0, 0.0, dz * 0.62))
        k2 = st + dxy * (reach * 0.72) - perp * (ep * 0.35) + Vector((0.0, 0.0, dz * 0.80))
        tip = st + dxy * reach + perp * (ep * 0.15) + Vector((0.0, 0.0, dz))
        b_pts = sample_curve([st, k1, k2, tip], 5)
        pb.add_limb(
            b_pts, taper_radii(r0, r0 * 0.32, 5, exp=0.78), segs=5,
            col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP, mottle_col=OLIVE_BARK_BLEACH,
            flute_amp=0.18, flute_n=3, flute_reach=0.90, twist=0.90, wobble=0.09, knot_amp=0.14,
            sway_base=8.0, sway_tip=40.0, noise_seed=44.0 + k,
        )
        # Wide, flat, airy horizontal spray per primary limb (no dense cotton-ball clusters!)
        spray_clusters.append((tip + Vector((0.0, 0.0, 0.20)), 1.44, 1.18, 0.42, 0.18, (0.06 * (1 if k % 2 == 0 else -1), 0.06, a), 10, 3))

        # Crooked ascending secondary fork lifting a higher broken crown spray
        sa = math.radians(ad + sub_off)
        sd = Vector((math.cos(sa), math.sin(sa), 0.0))
        s0 = b_pts[2]
        s1 = s0 + sd * (sr * 0.50) + Vector((0.0, 0.0, sdz * 0.62))
        s2 = s0 + sd * sr + Vector((0.0, 0.0, sdz))
        pb.add_limb(
            sample_curve([s0, s1, s2], 4),
            taper_radii(r0 * 0.46, r0 * 0.20, 4), segs=4,
            col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP, mottle_col=OLIVE_BARK_BLEACH,
            wobble=0.08, sway_base=14.0, sway_tip=46.0, noise_seed=49.0 + k,
        )
        if k != 1:
            spray_clusters.append((s2 + Vector((0.0, 0.0, 0.18)), 1.14, 0.96, 0.38, 0.16, (-0.05, 0.05, sa), 8, 3))

    # Central crooked ascending bough carrying 2 offset airy upper horizontal sprays (leaving crisp open sky gaps!)
    c_tip = Vector((0.28, -0.18, 4.48))
    pb.add_limb(
        sample_curve([main_trunk[-1], Vector((-0.18, 0.14, 2.95)), Vector((0.16, -0.12, 3.85)), c_tip], 4),
        taper_radii(0.13, 0.042, 4), segs=4,
        col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP, mottle_col=OLIVE_BARK_BLEACH,
        wobble=0.08, sway_base=12.0, sway_tip=44.0, noise_seed=53.0,
    )
    spray_clusters.append((c_tip + Vector((0.22, -0.14, 0.24)), 1.42, 1.16, 0.44, 0.18, (0.04, -0.05, 0.4), 10, 3))
    spray_clusters.append((Vector((-0.96, 0.72, 4.52)), 1.12, 0.94, 0.38, 0.16, (-0.05, 0.06, 1.9), 8, 3))

    for i, (pos, rx, ry, rzt, rzb, tilt, us, vr) in enumerate(spray_clusters):
        pb.add_foliage_puff(
            pos, rx, ry, rzt, rzb, PID_EVERGREEN,
            OLIVE_FOL_TOP, OLIVE_FOL_MID, OLIVE_FOL_BOT,
            u_segs=us, v_rings=vr, rim_lobes=4, rim_wave=0.11, crinkle_amp=0.10, crinkle_lobes=5,
            noise_amp=0.09, top_pow=0.70, bot_pow=0.74, tilt=tilt,
            dome_w=0.62, dome_up=0.22, sway_min=44.0, sway_max=82.0,
            mottle_col=OLIVE_SILVER, mottle_strength=0.22, seed=310 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.38, macro_up_bias=0.20, ao_strength=0.60, ao_min=0.36, under_ao_boost=0.26)


def build_olive_terrace(mat, lod=0):
    """Hillside terrace Olive (~4.4 m, unified leaning twisted hollow-fluted grey trunk + airy horizontal bi-colour sprays)."""
    pb = ProtoBuilder('olive_terrace', 4.4, seed=302, lod=lod)

    # Unified sinuous leaning deeply-fluted twisted trunk + 1 fused spiraling buttress rib (NO crossed pipes!)
    trunk_pts = sample_curve([
        (0.0, 0.0, -0.62),
        (0.16, -0.06, 0.44),
        (0.32,  0.05, 1.08),
        (0.40,  0.02, 1.60),
    ], 6)
    pb.add_limb(
        trunk_pts, taper_radii(0.34, 0.23, 6, flare=0.16, exp=0.66), segs=9,
        col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP, mottle_col=OLIVE_BARK_BLEACH,
        flute_amp=0.28, flute_n=4, flute_reach=1.0, twist=1.60, wobble=0.08,
        knot_amp=0.18, knot_freq=2.5, hollow_amp=0.24, hollow_ang=-0.65,
        cap_top=True, sway_base=0.0, sway_tip=14.0, noise_seed=51.0,
    )
    # Fused downhill spiraling buttress root hugging tightly into trunk
    buttress = sample_curve([
        (-0.22, 0.14, -0.60),
        ( 0.04, 0.12,  0.34),
        ( 0.24, 0.14,  0.96),
        ( 0.34, 0.06,  1.48),
    ], 5)
    pb.add_limb(
        buttress, taper_radii(0.18, 0.09, 5, flare=0.07), segs=5,
        col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP, mottle_col=OLIVE_BARK_BLEACH,
        flute_amp=0.14, flute_n=3, twist=0.85, wobble=0.08, cap_top=True,
        sway_base=0.0, sway_tip=12.0, noise_seed=52.5,
    )
    fork = trunk_pts[-1]

    # 3 crooked wide-spreading orchard limbs pruned in open-vase olive architecture (7 airy horizontal lobes)
    sprays = []
    for k, (ad, reach, dz, sa_off) in enumerate((
        ( 24.0, 1.82, 1.48,  42.0),
        (142.0, 1.90, 1.42, -38.0),
        (264.0, 1.72, 1.54,  38.0),
    )):
        a = math.radians(ad)
        dxy = Vector((math.cos(a), math.sin(a), 0.0))
        perp = Vector((-math.sin(a), math.cos(a), 0.0)) * (0.30 if k % 2 == 0 else -0.28)
        st = trunk_pts[-2].lerp(fork, 0.62 + 0.14 * (k % 2))
        knee = st + dxy * (reach * 0.48) + perp + Vector((0.0, 0.0, dz * 0.56))
        tip = st + dxy * reach + Vector((0.0, 0.0, dz))
        b_pts = sample_curve([st, knee, tip], 4)
        pb.add_limb(
            b_pts, taper_radii(0.14, 0.046, 4), segs=5,
            col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP, mottle_col=OLIVE_BARK_BLEACH,
            flute_amp=0.14, flute_n=3, twist=0.70, wobble=0.08, knot_amp=0.10,
            sway_base=8.0, sway_tip=38.0, noise_seed=54.0 + k,
        )
        sprays.append((tip + Vector((0.0, 0.0, 0.18)), 1.24, 1.02, 0.38, 0.17, (0.05, -0.05, a), 10, 3))

        sa = math.radians(ad + sa_off)
        sd = Vector((math.cos(sa), math.sin(sa), 0.0))
        s0 = b_pts[2]
        s2 = s0 + sd * 0.92 + Vector((0.0, 0.0, 0.74))
        pb.add_limb(
            sample_curve([s0, s0 + sd * 0.46 + Vector((0.0, 0.0, 0.46)), s2], 3),
            taper_radii(0.072, 0.028, 3), segs=4,
            col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP,
            wobble=0.07, sway_base=14.0, sway_tip=44.0, noise_seed=58.0 + k,
        )
        if k != 2:
            sprays.append((s2 + Vector((0.0, 0.0, 0.16)), 0.98, 0.84, 0.35, 0.15, (0.04, 0.05, sa), 8, 3))

    # Two asymmetric upper flattened pads framing an airy sunlit open-vase center!
    sprays.append((Vector((0.72, 0.38, 3.82)), 1.12, 0.94, 0.38, 0.16, (0.05, -0.04, 0.3), 8, 3))
    sprays.append((Vector((-0.38, -0.48, 3.72)), 1.02, 0.88, 0.36, 0.16, (-0.05, 0.05, 1.8), 8, 3))

    for i, (pos, rx, ry, rzt, rzb, tilt, us, vr) in enumerate(sprays):
        pb.add_foliage_puff(
            pos, rx, ry, rzt, rzb, PID_EVERGREEN,
            OLIVE_FOL_TOP, OLIVE_FOL_MID, OLIVE_FOL_BOT,
            u_segs=us, v_rings=vr, rim_lobes=4, rim_wave=0.11, crinkle_amp=0.10, crinkle_lobes=5,
            noise_amp=0.09, top_pow=0.70, bot_pow=0.74, tilt=tilt,
            dome_w=0.62, dome_up=0.22, sway_min=42.0, sway_max=80.0,
            mottle_col=OLIVE_SILVER, mottle_strength=0.22, seed=320 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.38, macro_up_bias=0.20, ao_strength=0.60, ao_min=0.36, under_ao_boost=0.26)


def build_olive_young(mat, lod=0):
    """Young courtyard Olive (~3.6 m, crooked twisting fluted stem + 6 airy horizontal bi-colour sprays)."""
    pb = ProtoBuilder('olive_young', 3.6, seed=303, lod=lod)
    trunk_pts = sample_curve([
        (0.0, 0.0, -0.60),
        (0.14, 0.06, 0.45),
        (-0.08, 0.10, 0.98),
        (0.06, -0.04, 1.38),
    ], 5)
    pb.add_limb(
        trunk_pts, taper_radii(0.20, 0.125, 5, flare=0.08, exp=0.72), segs=6,
        col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP, mottle_col=OLIVE_BARK_BLEACH,
        flute_amp=0.22, flute_n=4, flute_reach=0.90, twist=1.10, wobble=0.07, knot_amp=0.14,
        cap_top=True, sway_base=0.0, sway_tip=16.0, noise_seed=61.0,
    )
    fork = trunk_pts[-1]

    sprays = []
    for k, (ad, reach, dz) in enumerate(((12.0, 1.18, 1.15), (132.0, 1.24, 1.08), (254.0, 1.10, 1.20))):
        a = math.radians(ad)
        dxy = Vector((math.cos(a), math.sin(a), 0.0))
        perp = Vector((-math.sin(a), math.cos(a), 0.0)) * (0.18 if k % 2 == 0 else -0.18)
        st = trunk_pts[-2].lerp(fork, 0.55 + 0.15 * (k % 2))
        knee = st + dxy * (reach * 0.48) + perp + Vector((0.0, 0.0, dz * 0.56))
        tip = st + dxy * reach + Vector((0.0, 0.0, dz))
        b_pts = sample_curve([st, knee, tip], 4)
        pb.add_limb(
            b_pts, taper_radii(0.092, 0.034, 4), segs=5,
            col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP, mottle_col=OLIVE_BARK_BLEACH,
            wobble=0.07, sway_base=10.0, sway_tip=40.0, noise_seed=64.0 + k,
        )
        sprays.append((tip + Vector((0.0, 0.0, 0.16)), 0.92, 0.78, 0.32, 0.14, (0.05, -0.04, a), 8, 3))

        sa = math.radians(ad - 40.0)
        sd = Vector((math.cos(sa), math.sin(sa), 0.0))
        s2 = b_pts[2] + sd * 0.66 + Vector((0.0, 0.0, 0.58))
        pb.add_limb(
            sample_curve([b_pts[2], b_pts[2] + sd * 0.36 + Vector((0.0, 0.0, 0.34)), s2], 3),
            taper_radii(0.048, 0.020, 3), segs=4,
            col_bot=OLIVE_BARK_BOT, col_top=OLIVE_BARK_TOP,
            sway_base=16.0, sway_tip=44.0, noise_seed=68.0 + k,
        )
        if k == 0:
            sprays.append((s2 + Vector((0.0, 0.0, 0.14)), 0.78, 0.68, 0.28, 0.13, (-0.04, 0.06, sa), 8, 3))

    # Two light offset horizontal upper sprays
    sprays.append((Vector((0.26, 0.18, 3.16)), 0.96, 0.82, 0.34, 0.15, (0.04, -0.05, 0.5), 10, 3))
    sprays.append((Vector((-0.44, -0.28, 2.94)), 0.80, 0.68, 0.30, 0.14, (-0.05, 0.04, 2.1), 8, 3))

    for i, (pos, rx, ry, rzt, rzb, tilt, us, vr) in enumerate(sprays):
        pb.add_foliage_puff(
            pos, rx, ry, rzt, rzb, PID_EVERGREEN,
            OLIVE_FOL_TOP, OLIVE_FOL_MID, OLIVE_FOL_BOT,
            u_segs=us, v_rings=vr, rim_lobes=4, rim_wave=0.11, crinkle_amp=0.10, crinkle_lobes=5,
            noise_amp=0.09, top_pow=0.70, bot_pow=0.74, tilt=tilt,
            dome_w=0.62, dome_up=0.22, sway_min=40.0, sway_max=76.0,
            mottle_col=OLIVE_SILVER, mottle_strength=0.20, seed=330 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.38, macro_up_bias=0.20, ao_strength=0.58, ao_min=0.38, under_ao_boost=0.24)


# ==================================================================
# GROUP 4: 6x DECIDUOUS MEDITERRANEAN TREES (pid=8, sunlit winter skeletons!)
# ZERO acid-lime blue clamp! Rich natural Mediterranean greens (lin b/g ~ 0.30-0.38)
# with FULL un-flattened E15 canopy AO and distinct species silhouettes!
# ==================================================================
# Platanus orientalis: authentic grey-olive camouflaged peeling bark (NO birch-white!)
PLANE_BARK_BASE = srgb_to_lin('#8F8A77')
PLANE_BARK_DARK = srgb_to_lin('#5E5C4D')
PLANE_BARK_PALE = srgb_to_lin('#A89F88')
PLANE_FOL_TOP = srgb_to_lin('#547342')   # natural sunlit mid-green (lin b/g ~ 0.31)
PLANE_FOL_MID = srgb_to_lin('#3A562F')   # rich natural mid-green   (lin b/g ~ 0.31)
PLANE_FOL_BOT = srgb_to_lin('#243A20')   # deep lush canopy core    (lin b/g ~ 0.33)

ALMOND_BARK_BOT = srgb_to_lin('#493B2F')
ALMOND_BARK_TOP = srgb_to_lin('#665445')
ALMOND_FOL_TOP = srgb_to_lin('#6E8250')  # airy lighter grey-green  (lin b/g ~ 0.36)
ALMOND_FOL_MID = srgb_to_lin('#50643C')  # mid grey-green           (lin b/g ~ 0.35)
ALMOND_FOL_BOT = srgb_to_lin('#35462A')  # interior core            (lin b/g ~ 0.36)

FIG_BARK_BOT = srgb_to_lin('#6A6258')
FIG_BARK_TOP = srgb_to_lin('#8E867A')
FIG_BARK_MOTTLE = srgb_to_lin('#A0978A')
FIG_FOL_TOP = srgb_to_lin('#3F5E34')     # deep lush fig green      (lin b/g ~ 0.31)
FIG_FOL_MID = srgb_to_lin('#2D4827')     # deep mid fig green       (lin b/g ~ 0.32)
FIG_FOL_BOT = srgb_to_lin('#1E341C')     # deep shadowed fig core   (lin b/g ~ 0.34)

POM_BARK_BOT = srgb_to_lin('#524234')
POM_BARK_TOP = srgb_to_lin('#705C4A')
POM_FOL_TOP = srgb_to_lin('#567642')     # lively warm olive-green  (lin b/g ~ 0.31)
POM_FOL_MID = srgb_to_lin('#3B552E')     # warm mid orchard green   (lin b/g ~ 0.31)
POM_FOL_BOT = srgb_to_lin('#243A1F')     # deep interior green      (lin b/g ~ 0.33)


def build_plane_tall(mat, lod=0):
    """Lofty Platanus orientalis (~12.6 m, grey-olive patched bark, gracefully arched S-curved limbs, tall billowing cathedral crown)."""
    pb = ProtoBuilder('plane_tall', 12.6, seed=401, lod=lod)
    trunk_pts = sample_curve([
        (0.0, 0.0, -0.80),
        (0.18, -0.08, 1.65),
        (-0.14, 0.10, 3.65),
        (0.06, 0.02, 5.10),
    ], 7)
    pb.add_limb(
        trunk_pts, taper_radii(0.47, 0.28, 7, flare=0.22, exp=0.76), segs=7,
        col_bot=PLANE_BARK_DARK, col_top=PLANE_BARK_BASE,
        mottle_col=PLANE_BARK_DARK, mottle_col2=PLANE_BARK_PALE, mottle_scale=1.35, mottle_strength=0.72, mottle_sharp=True,
        flute_amp=0.22, flute_n=5, flute_reach=0.38, wobble=0.06,
        cap_top=True, sway_base=0.0, sway_tip=26.0, noise_seed=71.0,
    )
    fork = trunk_pts[-1]

    # Sinuous soaring cathedral central leader reaching high into the cathedral apex
    leader_pts = sample_curve([
        fork,
        fork + Vector((-0.36, 0.22, 1.85)),
        fork + Vector((0.32, -0.18, 3.85)),
        fork + Vector((-0.08, 0.10, 5.65)),
    ], 5)
    pb.add_limb(
        leader_pts, taper_radii(0.22, 0.040, 5, exp=0.88), segs=5,
        col_bot=PLANE_BARK_BASE, col_top=PLANE_BARK_BASE,
        mottle_col=PLANE_BARK_DARK, mottle_col2=PLANE_BARK_PALE, mottle_scale=1.45, mottle_strength=0.68, mottle_sharp=True,
        sway_base=14.0, sway_tip=56.0, noise_seed=72.0,
    )

    # 4 boldly arched, gracefully S-curved, strongly tapered primary boughs (sweeping wide then arcing up!)
    prim_specs = [
        ( 22.0, 3.25, 4.35, 0.195,  0.58,  46.0, -44.0),
        (114.0, 3.05, 4.55, 0.190, -0.54,  44.0, -46.0),
        (205.0, 3.35, 4.15, 0.195,  0.60,  46.0, -42.0),
        (296.0, 2.98, 4.45, 0.185, -0.52,  42.0, -44.0),
    ]
    for k, (ad, reach, dz, r0, curve_lat, s1_off, s2_off) in enumerate(prim_specs):
        a = math.radians(ad)
        dxy = Vector((math.cos(a), math.sin(a), 0.0))
        perp = Vector((-math.sin(a), math.cos(a), 0.0))
        st = trunk_pts[-2].lerp(fork, 0.44 + 0.18 * (k % 2))
        # Authentic Platanus sweep: spreads boldly outward low first (0.18*dz), then sweeps up in a graceful parabolic arch!
        c1 = st + dxy * (reach * 0.42) + perp * (curve_lat * 0.85) + Vector((0.0, 0.0, dz * 0.18))
        c2 = st + dxy * (reach * 0.82) - perp * (curve_lat * 0.35) + Vector((0.0, 0.0, dz * 0.56))
        tip = st + dxy * reach + perp * (curve_lat * 0.18) + Vector((0.0, 0.0, dz))
        b_pts = sample_curve([st, c1, c2, tip], 5)
        pb.add_limb(
            b_pts, taper_radii(r0, 0.032, 5, exp=0.94), segs=5,
            col_bot=PLANE_BARK_BASE, col_top=PLANE_BARK_BASE,
            mottle_col=PLANE_BARK_DARK, mottle_col2=PLANE_BARK_PALE, mottle_scale=1.50, mottle_strength=0.68, mottle_sharp=True,
            wobble=0.05, sway_base=14.0, sway_tip=56.0, noise_seed=74.0 + k,
        )
        for si, (soff, sr, sdz, t_idx) in enumerate(((s1_off, 1.65, 1.35, 2), (s2_off, 1.38, 1.15, 3))):
            sa = math.radians(ad + soff)
            sd = Vector((math.cos(sa), math.sin(sa), 0.0))
            s0 = b_pts[t_idx]
            s1 = s0 + sd * (sr * 0.58) + Vector((0.0, 0.0, sdz * 0.28))
            s2 = s0 + sd * sr + Vector((0.0, 0.0, sdz))
            pb.add_limb(
                sample_curve([s0, s1, s2], 3),
                taper_radii(r0 * (0.44 if si == 0 else 0.32), 0.020, 3, exp=0.92), segs=4,
                col_bot=PLANE_BARK_BASE, col_top=PLANE_BARK_PALE, mottle_col=PLANE_BARK_DARK, mottle_strength=0.52, mottle_sharp=True,
                sway_base=22.0, sway_tip=62.0, noise_seed=80.0 + k * 2 + si,
            )

    # Tall billowing CATHEDRAL crown: soaring tiered central billows + stepped mid-shoulders + lower bough billows!
    lobes = [
        # (x, y, z, rx, ry, rzt, rzb, us, vr)
        ( 0.08, -0.06, 10.95, 2.15, 2.02, 1.72, 0.72, 14, 4),  # soaring cathedral apex dome
        ( 0.96,  0.74, 10.35, 1.62, 1.50, 1.38, 0.56, 12, 3),  # upper east spire-billow
        (-1.02, -0.58, 10.18, 1.60, 1.48, 1.34, 0.54, 12, 3),  # upper west spire-billow
        ( 2.38,  0.90,  8.75, 1.88, 1.72, 1.36, 0.58, 12, 3),  # mid billowing flank
        (-1.12,  2.22,  9.05, 1.84, 1.70, 1.38, 0.58, 12, 3),
        (-2.42, -1.04,  8.52, 1.92, 1.74, 1.34, 0.60, 12, 3),
        ( 1.18, -2.20,  8.86, 1.82, 1.68, 1.32, 0.56, 12, 3),
        ( 1.62,  1.88,  9.48, 1.48, 1.38, 1.12, 0.48, 10, 3),  # upper-mid transition billows
        (-1.68,  1.42,  9.36, 1.46, 1.36, 1.10, 0.48, 10, 3),
        (-1.32, -1.86,  9.22, 1.42, 1.32, 1.06, 0.46, 10, 3),
        ( 1.88, -1.24,  9.30, 1.40, 1.30, 1.04, 0.46, 10, 3),
        ( 2.45, -0.45,  7.55, 1.38, 1.26, 0.92, 0.46, 10, 2),  # lower overhanging cathedral boughs
        (-2.22,  0.96,  7.42, 1.36, 1.24, 0.90, 0.46, 10, 2),
    ]
    for i, (x, y, z, rx, ry, rzt, rzb, us, vr) in enumerate(lobes):
        pb.add_foliage_puff(
            Vector((x, y, z)), rx, ry, rzt, rzb, PID_DECIDUOUS,
            PLANE_FOL_TOP, PLANE_FOL_MID, PLANE_FOL_BOT,
            u_segs=us, v_rings=vr, rim_lobes=4, rim_wave=0.09, crinkle_amp=0.11, crinkle_lobes=5,
            noise_amp=0.09, dome_w=0.66, dome_up=0.26, sway_min=50.0, sway_max=90.0, seed=410 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.48, macro_up_bias=0.26, ao_strength=0.62, ao_min=0.36)


def build_plane_broad(mat, lod=0):
    """Broad agora shade Plane tree (~10.4 m, grey-olive mottled bark, 5 gracefully sweeping tapered arches, grand shade pavilion)."""
    pb = ProtoBuilder('plane_broad', 10.4, seed=402, lod=lod)
    trunk_pts = sample_curve([
        (0.0, 0.0, -0.80),
        (-0.14, 0.06, 1.35),
        (0.06, -0.05, 3.40),
    ], 6)
    pb.add_limb(
        trunk_pts, taper_radii(0.50, 0.30, 6, flare=0.22, exp=0.72), segs=7,
        col_bot=PLANE_BARK_DARK, col_top=PLANE_BARK_BASE,
        mottle_col=PLANE_BARK_DARK, mottle_col2=PLANE_BARK_PALE, mottle_scale=1.35, mottle_strength=0.72, mottle_sharp=True,
        flute_amp=0.22, flute_n=5, flute_reach=0.46, wobble=0.06,
        cap_top=True, sway_base=0.0, sway_tip=22.0, noise_seed=91.0,
    )
    fork = trunk_pts[-1]

    # 5 gracefully sweeping, boldly arched S-curved primary limbs spanning wide village shade
    for k, (ad, reach, dz, lat, sa_off) in enumerate((
        ( 10.0, 3.72, 3.45,  0.54,  44.0),
        ( 82.0, 3.48, 3.70, -0.50, -46.0),
        (154.0, 3.76, 3.35,  0.56,  42.0),
        (226.0, 3.54, 3.55, -0.52, -44.0),
        (298.0, 3.44, 3.45,  0.50,  46.0),
    )):
        a = math.radians(ad)
        dxy = Vector((math.cos(a), math.sin(a), 0.0))
        perp = Vector((-math.sin(a), math.cos(a), 0.0))
        st = trunk_pts[-2].lerp(fork, 0.54 + 0.14 * (k % 2))
        c1 = st + dxy * (reach * 0.42) + perp * (lat * 0.85) + Vector((0.0, 0.0, dz * 0.22))
        c2 = st + dxy * (reach * 0.82) - perp * (lat * 0.35) + Vector((0.0, 0.0, dz * 0.62))
        tip = st + dxy * reach + Vector((0.0, 0.0, dz))
        b_pts = sample_curve([st, c1, c2, tip], 5)
        pb.add_limb(
            b_pts, taper_radii(0.195, 0.032, 5, exp=0.94), segs=5,
            col_bot=PLANE_BARK_BASE, col_top=PLANE_BARK_BASE,
            mottle_col=PLANE_BARK_DARK, mottle_col2=PLANE_BARK_PALE, mottle_scale=1.50, mottle_strength=0.68, mottle_sharp=True,
            wobble=0.05, sway_base=12.0, sway_tip=52.0, noise_seed=93.0 + k,
        )
        sa = math.radians(ad + sa_off)
        sd = Vector((math.cos(sa), math.sin(sa), 0.0))
        s0 = b_pts[2]
        pb.add_limb(
            sample_curve([s0, s0 + sd * 0.92 + Vector((0.0, 0.0, 0.42)), s0 + sd * 1.62 + Vector((0.0, 0.0, 1.32))], 3),
            taper_radii(0.084, 0.020, 3, exp=0.92), segs=4,
            col_bot=PLANE_BARK_BASE, col_top=PLANE_BARK_PALE, mottle_col=PLANE_BARK_DARK, mottle_strength=0.52, mottle_sharp=True,
            sway_base=20.0, sway_tip=58.0, noise_seed=99.0 + k,
        )

    pb.add_limb(
        sample_curve([fork, fork + Vector((0.20, -0.14, 1.95)), fork + Vector((-0.14, 0.12, 4.15))], 4),
        taper_radii(0.19, 0.038, 4, exp=0.88), segs=5,
        col_bot=PLANE_BARK_BASE, col_top=PLANE_BARK_BASE,
        mottle_col=PLANE_BARK_DARK, mottle_col2=PLANE_BARK_PALE, mottle_strength=0.65, mottle_sharp=True,
        sway_base=14.0, sway_tip=50.0, noise_seed=106.0,
    )

    # Grand sprawling billowing village-square pavilion crown
    lobes = [
        ( 0.02,  0.04, 8.85, 2.48, 2.36, 1.52, 0.60, 14, 4),
        ( 2.95,  0.54, 7.28, 2.02, 1.84, 1.18, 0.50, 12, 3),
        ( 0.44,  2.85, 7.45, 1.98, 1.82, 1.16, 0.48, 12, 3),
        (-2.78,  1.28, 7.18, 2.04, 1.86, 1.18, 0.50, 12, 3),
        (-2.22, -2.14, 7.32, 1.96, 1.80, 1.14, 0.48, 12, 3),
        ( 1.76, -2.52, 7.22, 1.94, 1.78, 1.14, 0.48, 12, 3),
        ( 1.54,  1.82, 8.26, 1.58, 1.48, 1.02, 0.44, 10, 3),
        (-1.52,  1.84, 8.16, 1.54, 1.44, 1.00, 0.44, 10, 3),
        (-0.26, -2.36, 8.10, 1.52, 1.42, 0.98, 0.42, 10, 3),
        ( 2.18, -1.16, 8.05, 1.46, 1.36, 0.94, 0.42, 10, 2),
        (-2.45, -0.52, 6.45, 1.38, 1.24, 0.80, 0.44, 10, 2),  # low shade pavilion skirt
        ( 2.52,  1.58, 6.52, 1.34, 1.22, 0.78, 0.42, 10, 2),
    ]
    for i, (x, y, z, rx, ry, rzt, rzb, us, vr) in enumerate(lobes):
        pb.add_foliage_puff(
            Vector((x, y, z)), rx, ry, rzt, rzb, PID_DECIDUOUS,
            PLANE_FOL_TOP, PLANE_FOL_MID, PLANE_FOL_BOT,
            u_segs=us, v_rings=vr, rim_lobes=4, rim_wave=0.09, crinkle_amp=0.11, crinkle_lobes=5,
            noise_amp=0.09, dome_w=0.66, dome_up=0.28, sway_min=48.0, sway_max=88.0, seed=420 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.48, macro_up_bias=0.28, ao_strength=0.62, ao_min=0.36)


def build_almond_spread(mat, lod=0):
    """Mature spreading Almond (~6.5 m, dark delicate goblet branches + light, open, irregular airy grey-green crown)."""
    pb = ProtoBuilder('almond_spread', 6.5, seed=403, lod=lod)
    trunk_pts = sample_curve([
        (0.0, 0.0, -0.65),
        (0.12, -0.06, 0.78),
        (-0.06, 0.07, 2.02),
    ], 5)
    pb.add_limb(
        trunk_pts, taper_radii(0.27, 0.17, 5, flare=0.10, exp=0.78), segs=6,
        col_bot=ALMOND_BARK_BOT, col_top=ALMOND_BARK_TOP,
        flute_amp=0.14, flute_n=4, flute_reach=0.48, wobble=0.06,
        cap_top=True, sway_base=0.0, sway_tip=20.0, noise_seed=111.0,
    )
    fork = trunk_pts[-1]

    # Delicate open goblet branching — clearly visible through the airy irregular crown & crisp in winter!
    tufts = []
    for k, (ad, reach, dz, sa1, sa2) in enumerate((
        ( 16.0, 2.48, 2.68,  44.0, -36.0),
        (106.0, 2.34, 2.95, -42.0,  38.0),
        (202.0, 2.52, 2.52,  40.0, -40.0),
        (292.0, 2.24, 2.82, -38.0,  36.0),
    )):
        a = math.radians(ad)
        dxy = Vector((math.cos(a), math.sin(a), 0.0))
        perp = Vector((-math.sin(a), math.cos(a), 0.0)) * (0.34 if k % 2 == 0 else -0.34)
        st = trunk_pts[-2].lerp(fork, 0.50 + 0.16 * (k % 2))
        mid = st + dxy * (reach * 0.54) + perp + Vector((0.0, 0.0, dz * 0.34))
        tip = st + dxy * reach + Vector((0.0, 0.0, dz))
        b_pts = sample_curve([st, mid, tip], 4)
        pb.add_limb(
            b_pts, taper_radii(0.115, 0.026, 4, exp=0.92), segs=5,
            col_bot=ALMOND_BARK_BOT, col_top=ALMOND_BARK_TOP,
            wobble=0.06, sway_base=10.0, sway_tip=50.0, noise_seed=114.0 + k,
        )
        # Lush yet airy irregular leaf cluster perched delicately around the branch tip
        tufts.append((tip + Vector((0.0, 0.0, 0.18)), 1.24, 1.10, 0.72, 0.32, (0.05, -0.04, a), 10, 3))

        for si, soff in enumerate((sa1, sa2)):
            sa = math.radians(ad + soff)
            sd = Vector((math.cos(sa), math.sin(sa), 0.0))
            s0 = b_pts[1 + si]
            sr = 1.15 if si == 0 else 0.94
            sdz = 1.18 if si == 0 else 0.98
            s2 = s0 + sd * sr + Vector((0.0, 0.0, sdz))
            pb.add_limb(
                sample_curve([s0, s0 + sd * (sr * 0.58) + Vector((0.0, 0.0, sdz * 0.38)), s2], 3),
                taper_radii(0.054 if si == 0 else 0.042, 0.015, 3, exp=0.92), segs=4,
                col_bot=ALMOND_BARK_BOT, col_top=ALMOND_BARK_TOP,
                sway_base=18.0, sway_tip=56.0, noise_seed=120.0 + k * 2 + si,
            )
            tufts.append((s2 + Vector((0.0, 0.0, 0.16)), 1.06 if si == 0 else 0.94, 0.96 if si == 0 else 0.86, 0.62, 0.28, (-0.04, 0.05, sa), 8, 3))

    # Asymmetric airy upper crown tufts (open lacy Mediterranean almond silhouette!)
    tufts.append((Vector((0.28, 0.34, 5.74)), 1.36, 1.22, 0.80, 0.34, (0.04, -0.05, 0.4), 10, 3))
    tufts.append((Vector((-0.82, -0.42, 5.52)), 1.18, 1.06, 0.72, 0.30, (-0.05, 0.04, 1.7), 8, 3))

    for i, (pos, rx, ry, rzt, rzb, tilt, us, vr) in enumerate(tufts):
        pb.add_foliage_puff(
            pos, rx, ry, rzt, rzb, PID_DECIDUOUS,
            ALMOND_FOL_TOP, ALMOND_FOL_MID, ALMOND_FOL_BOT,
            u_segs=us, v_rings=vr, rim_lobes=4, rim_wave=0.10, crinkle_amp=0.11, crinkle_lobes=5,
            noise_amp=0.095, tilt=tilt,
            dome_w=0.64, dome_up=0.24, sway_min=46.0, sway_max=88.0, seed=430 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.38, macro_up_bias=0.22, ao_strength=0.58, ao_min=0.38)


def build_almond_young(mat, lod=0):
    """Young orchard Almond (~4.7 m, slender dark delicate branches + open light irregular grey-green crown)."""
    pb = ProtoBuilder('almond_young', 4.7, seed=404, lod=lod)
    trunk_pts = sample_curve([
        (0.0, 0.0, -0.60),
        (-0.10, 0.04, 0.65),
        (0.06, 0.05, 1.58),
    ], 5)
    pb.add_limb(
        trunk_pts, taper_radii(0.185, 0.115, 5, flare=0.07, exp=0.78), segs=6,
        col_bot=ALMOND_BARK_BOT, col_top=ALMOND_BARK_TOP,
        flute_amp=0.10, flute_n=4, wobble=0.05,
        cap_top=True, sway_base=0.0, sway_tip=22.0, noise_seed=131.0,
    )
    fork = trunk_pts[-1]

    tufts = []
    for k, (ad, reach, dz) in enumerate(((28.0, 1.52, 2.02), (148.0, 1.56, 1.88), (272.0, 1.44, 2.12))):
        a = math.radians(ad)
        dxy = Vector((math.cos(a), math.sin(a), 0.0))
        st = trunk_pts[-2].lerp(fork, 0.50 + 0.18 * (k % 2))
        mid = st + dxy * (reach * 0.48) + Vector((0.0, 0.0, dz * 0.52))
        tip = st + dxy * reach + Vector((0.0, 0.0, dz))
        b_pts = sample_curve([st, mid, tip], 4)
        pb.add_limb(
            b_pts, taper_radii(0.082, 0.022, 4, exp=0.90), segs=5,
            col_bot=ALMOND_BARK_BOT, col_top=ALMOND_BARK_TOP,
            wobble=0.05, sway_base=12.0, sway_tip=50.0, noise_seed=134.0 + k,
        )
        tufts.append((tip + Vector((0.0, 0.0, 0.16)), 0.98, 0.88, 0.58, 0.25, (0.04, -0.05, a), 10, 3))
        for si, soff in enumerate((42.0, -38.0)):
            sa = math.radians(ad + soff)
            sd = Vector((math.cos(sa), math.sin(sa), 0.0))
            s0 = b_pts[1 + si]
            s2 = s0 + sd * 0.82 + Vector((0.0, 0.0, 0.80 if si == 0 else 0.70))
            pb.add_limb(
                sample_curve([s0, s0 + sd * 0.46 + Vector((0.0, 0.0, 0.34)), s2], 3),
                taper_radii(0.044, 0.015, 3, exp=0.92), segs=4,
                col_bot=ALMOND_BARK_BOT, col_top=ALMOND_BARK_TOP,
                sway_base=18.0, sway_tip=56.0, noise_seed=140.0 + k * 2 + si,
            )
            tufts.append((s2 + Vector((0.0, 0.0, 0.14)), 0.86, 0.78, 0.52, 0.22, (-0.04, 0.05, sa), 8, 3))

    tufts.append((Vector((-0.14, 0.22, 4.18)), 1.04, 0.96, 0.64, 0.26, (0.04, 0.04, 0.8), 10, 3))

    for i, (pos, rx, ry, rzt, rzb, tilt, us, vr) in enumerate(tufts):
        pb.add_foliage_puff(
            pos, rx, ry, rzt, rzb, PID_DECIDUOUS,
            ALMOND_FOL_TOP, ALMOND_FOL_MID, ALMOND_FOL_BOT,
            u_segs=us, v_rings=vr, rim_lobes=4, rim_wave=0.10, crinkle_amp=0.11, crinkle_lobes=5,
            noise_amp=0.095, tilt=tilt,
            dome_w=0.64, dome_up=0.24, sway_min=44.0, sway_max=86.0, seed=440 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.40, macro_up_bias=0.22, ao_strength=0.56, ao_min=0.38)


def build_fig_broad(mat, lod=0):
    """Low, wide sprawling Mediterranean Fig (~5.1 m tall, ~4.0 m wide, pale grey-brown twisting limbs + lush low overhanging dome)."""
    pb = ProtoBuilder('fig_broad', 5.1, seed=405, lod=lod)
    trunk_pts = sample_curve([
        (0.0, 0.0, -0.65),
        (0.08, 0.02, 0.28),
        (-0.02, 0.05, 0.96),
    ], 4)
    pb.add_limb(
        trunk_pts, taper_radii(0.38, 0.28, 4, flare=0.16, exp=0.70), segs=7,
        col_bot=FIG_BARK_BOT, col_top=FIG_BARK_TOP, mottle_col=FIG_BARK_MOTTLE, mottle_strength=0.36,
        flute_amp=0.16, flute_n=4, flute_reach=0.68, wobble=0.05,
        cap_top=True, sway_base=0.0, sway_tip=12.0, noise_seed=151.0,
    )
    fork = trunk_pts[-1]

    # 5 twisting, wide-sprawling, swooping pale grey-brown Ficus carica limbs (arching out low and wide!)
    for k, (ad, reach, dz, lat, sa_off) in enumerate((
        (  8.0, 2.85, 1.98,  0.34,  34.0),
        ( 80.0, 2.75, 2.12, -0.32, -32.0),
        (152.0, 2.92, 1.92,  0.36,  30.0),
        (224.0, 2.78, 2.04, -0.34, -34.0),
        (296.0, 2.68, 2.02,  0.30,  32.0),
    )):
        a = math.radians(ad)
        dxy = Vector((math.cos(a), math.sin(a), 0.0))
        perp = Vector((-math.sin(a), math.cos(a), 0.0))
        st = trunk_pts[-2].lerp(fork, 0.52 + 0.16 * (k % 2))
        # Iconic fig swoop: rises boldly from low fork, swoops outward horizontally, curls gently up at outer crown!
        arch = st + dxy * (reach * 0.42) + perp * lat + Vector((0.0, 0.0, dz * 0.72))
        dip = st + dxy * (reach * 0.78) - perp * (lat * 0.35) + Vector((0.0, 0.0, dz * 0.80))
        tip = st + dxy * reach + Vector((0.0, 0.0, dz))
        b_pts = sample_curve([st, arch, dip, tip], 5)
        pb.add_limb(
            b_pts, taper_radii(0.165, 0.044, 5, exp=0.86), segs=5,
            col_bot=FIG_BARK_BOT, col_top=FIG_BARK_TOP, mottle_col=FIG_BARK_MOTTLE, mottle_strength=0.35,
            twist=0.55, wobble=0.05, sway_base=8.0, sway_tip=42.0, noise_seed=154.0 + k,
        )
        sa = math.radians(ad + sa_off)
        sd = Vector((math.cos(sa), math.sin(sa), 0.0))
        pb.add_limb(
            sample_curve([b_pts[2], b_pts[2] + sd * 0.62 + Vector((0.0, 0.0, 0.56)), b_pts[2] + sd * 1.15 + Vector((0.0, 0.0, 0.96))], 3),
            taper_radii(0.082, 0.026, 3, exp=0.88), segs=4,
            col_bot=FIG_BARK_BOT, col_top=FIG_BARK_TOP,
            sway_base=14.0, sway_tip=46.0, noise_seed=160.0 + k,
        )

    pb.add_limb(
        sample_curve([fork, fork + Vector((0.10, -0.08, 1.30)), fork + Vector((-0.08, 0.10, 2.52))], 3),
        taper_radii(0.145, 0.045, 3), segs=5,
        col_bot=FIG_BARK_BOT, col_top=FIG_BARK_TOP,
        sway_base=10.0, sway_tip=40.0, noise_seed=166.0,
    )

    # Low, wide, heavy lush overhanging UMBRELLA-SPRAWL DOME (distinctly broader & lower than almond/plane!)
    lobes = [
        ( 0.04,  0.02, 4.02, 2.28, 2.16, 1.08, 0.52, 14, 4),  # wide low lush crown cap
        ( 2.42,  0.34, 2.94, 1.66, 1.54, 0.88, 0.54, 12, 3),  # heavy drooping low perimeter skirts!
        ( 0.42,  2.38, 3.04, 1.64, 1.52, 0.86, 0.52, 12, 3),
        (-2.22,  1.10, 2.90, 1.68, 1.54, 0.88, 0.54, 12, 3),
        (-1.82, -1.78, 2.98, 1.62, 1.50, 0.86, 0.52, 12, 3),
        ( 1.38, -2.06, 2.92, 1.60, 1.48, 0.84, 0.52, 12, 3),
        ( 1.56,  1.44, 3.58, 1.36, 1.28, 0.74, 0.38, 10, 2),  # mid-dome blending shoulders
        (-1.46,  1.42, 3.52, 1.34, 1.26, 0.72, 0.38, 10, 2),
        (-1.38, -1.40, 3.48, 1.32, 1.24, 0.72, 0.38, 10, 2),
        ( 1.48, -1.24, 3.50, 1.30, 1.22, 0.70, 0.36, 10, 2),
    ]
    for i, (x, y, z, rx, ry, rzt, rzb, us, vr) in enumerate(lobes):
        pb.add_foliage_puff(
            Vector((x, y, z)), rx, ry, rzt, rzb, PID_DECIDUOUS,
            FIG_FOL_TOP, FIG_FOL_MID, FIG_FOL_BOT,
            u_segs=us, v_rings=vr, rim_lobes=4, rim_wave=0.085, crinkle_amp=0.10, crinkle_lobes=5,
            noise_amp=0.085, top_pow=0.82, bot_pow=0.88,
            dome_w=0.68, dome_up=0.26, sway_min=40.0, sway_max=80.0, seed=450 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.52, macro_up_bias=0.28, ao_strength=0.64, ao_min=0.34)


def build_pomegranate_multi(mat, lod=0):
    """Multi-stemmed courtyard Pomegranate (~4.2 m, 4 sinuous fountain stems + lively warm olive-green orchard clusters)."""
    pb = ProtoBuilder('pomegranate_multi', 4.2, seed=406, lod=lod)
    stems = [
        ( 15.0, 0.92, 2.38, 0.095,  36.0, -32.0),
        (108.0, 0.96, 2.18, 0.088, -36.0,  30.0),
        (202.0, 0.90, 2.48, 0.092,  32.0, -34.0),
        (296.0, 0.84, 2.28, 0.086, -30.0,  34.0),
    ]
    tufts = []
    for k, (ad, reach, dz, r0, s1_off, s2_off) in enumerate(stems):
        a = math.radians(ad)
        dxy = Vector((math.cos(a), math.sin(a), 0.0))
        perp = Vector((-math.sin(a), math.cos(a), 0.0)) * (0.16 if k % 2 == 0 else -0.16)
        base = dxy * 0.08 + Vector((0.0, 0.0, -0.55))
        p1 = dxy * (reach * 0.34) + perp * 0.7 + Vector((0.0, 0.0, dz * 0.36))
        p2 = dxy * (reach * 0.76) - perp * 0.4 + Vector((0.0, 0.0, dz * 0.74))
        p3 = dxy * reach + Vector((0.0, 0.0, dz))
        b_pts = sample_curve([base, p1, p2, p3], 5)
        pb.add_limb(
            b_pts, taper_radii(r0, r0 * 0.28, 5, flare=0.03, exp=0.88), segs=5,
            col_bot=POM_BARK_BOT, col_top=POM_BARK_TOP,
            wobble=0.06, sway_base=0.0, sway_tip=44.0, noise_seed=171.0 + k,
        )
        tufts.append((p3 + dxy * 0.14 + Vector((0.0, 0.0, 0.38)), 0.82, 0.74, 0.64, 0.28, (0.06, -0.05, a), 10, 2))
        for si, soff in enumerate((s1_off, s2_off)):
            sa = math.radians(ad + soff)
            sd = Vector((math.cos(sa), math.sin(sa), 0.0))
            s0 = b_pts[2 + si]
            s2 = s0 + sd * (0.64 if si == 0 else 0.56) + Vector((0.0, 0.0, 0.96 if si == 0 else 0.84))
            pb.add_limb(
                sample_curve([s0, s0 + sd * 0.34 + Vector((0.0, 0.0, 0.48)), s2], 3),
                taper_radii(r0 * 0.46, 0.015, 3, exp=0.90), segs=4,
                col_bot=POM_BARK_BOT, col_top=POM_BARK_TOP,
                sway_base=18.0, sway_tip=56.0, noise_seed=176.0 + k * 2 + si,
            )
            if si == 0:
                tufts.append((s2 + Vector((0.0, 0.0, 0.16)), 0.76, 0.70, 0.56, 0.24, (-0.05, 0.05, sa), 10, 2))

    # Lively upright orchard fountain crest tufts
    tufts.append((Vector((0.10, -0.06, 3.52)), 0.94, 0.88, 0.72, 0.30, (0.04, -0.04, 0.3), 10, 3))
    tufts.append((Vector((-0.44, 0.32, 3.24)), 0.76, 0.70, 0.56, 0.24, (-0.04, 0.05, 1.5), 10, 2))
    tufts.append((Vector((0.36, 0.42, 3.16)), 0.72, 0.66, 0.54, 0.24, (0.05, 0.04, 2.6), 10, 2))

    for i, (pos, rx, ry, rzt, rzb, tilt, us, vr) in enumerate(tufts):
        pb.add_foliage_puff(
            pos, rx, ry, rzt, rzb, PID_DECIDUOUS,
            POM_FOL_TOP, POM_FOL_MID, POM_FOL_BOT,
            u_segs=us, v_rings=vr, rim_lobes=4, rim_wave=0.11, crinkle_amp=0.14, crinkle_lobes=5,
            noise_amp=0.10, tilt=tilt,
            dome_w=0.60, dome_up=0.22, sway_min=44.0, sway_max=88.0, seed=460 + i,
        )

    return pb.finalize(mat, macro_dome_mix=0.40, macro_up_bias=0.22, ao_strength=0.58, ao_min=0.38)


# ==================================================================
# GROUP 5: 2x MODULAR TRELLISED VINEYARD HEDGE SEGMENTS (rebuilt from scratch!)
# * Exact 1.00 x length flush modular ends (NO 0.94 shortening, NO 46% end-pinch!)
# * Stakes topped at 1.30 m cleanly INSIDE the 1.54 m leafy crest
# * Sturdy trellis cordon rail (z=0.40 m) & gnarled woody stocks clearly visible
#   beneath the z=0.45 m lower leaf skirt (+ upper training rail at z=0.94 m)
# * Gale-safe _SWAY: 0 at z <= 0.55 m, capped cleanly at 28..32 at canopy crest
# ==================================================================
VINE_WOOD_BOT = srgb_to_lin('#544130')
VINE_WOOD_TOP = srgb_to_lin('#735A43')
VINE_STOCK_BOT = srgb_to_lin('#483729')
VINE_STOCK_TOP = srgb_to_lin('#614B38')
VINE_FOL_TOP = srgb_to_lin('#557543')    # sunlit grapevine leaf green (lin b/g ~ 0.31)
VINE_FOL_MID = srgb_to_lin('#3B582F')    # lush mid vineyard leaf wall (lin b/g ~ 0.32)
VINE_FOL_BOT = srgb_to_lin('#233A1F')    # deep shaded lower leaf skirt (lin b/g ~ 0.33)


def _build_vineyard(name, length, stake_xs, stock_xs, n_len, seed, mat, lod=0):
    pb = ProtoBuilder(name, 1.56, seed=seed, lod=lod)

    # Weathered timber vineyard stakes: sunk -0.35 m, topped at 1.30 m cleanly INSIDE the 1.54 m leafy crest!
    for i, sx in enumerate(stake_xs):
        lean_x = 0.015 * math.sin(seed + i * 1.9)
        lean_y = 0.014 * math.cos(seed + i * 2.3)
        pb.add_limb(
            [(sx, 0.0, -0.35), (sx + lean_x * 0.5, lean_y * 0.5, 0.45), (sx + lean_x, lean_y, 1.30)],
            [0.056, 0.050, 0.044], segs=5,
            col_bot=VINE_WOOD_BOT, col_top=VINE_WOOD_TOP,
            wobble=0.04, cap_bot=True, cap_top=True, flat_top=True,
            sway_base=0.0, sway_tip=0.0, noise_seed=200.0 + i,
        )

    # Horizontal trellis rails spanning exact 1.00 x length [-L/2, +L/2] (flush modular tiling!)
    # Lower cordon rail at z = 0.40 m clearly visible beneath the z = 0.45 m lower leaf skirt;
    # upper training rail at z = 0.94 m inside the foliage (revealed crisply in winter HB_BARE!).
    x0, x1 = -length * 0.5, length * 0.5
    for ri, (rz, rad) in enumerate(((0.40, 0.028), (0.94, 0.022))):
        r_pts = [(x0, 0.0, rz), (0.0, 0.008 * (1 if ri == 0 else -1), rz + 0.005), (x1, 0.0, rz)]
        pb.add_limb(
            r_pts, [rad, rad * 0.96, rad], segs=4,
            col_bot=VINE_WOOD_BOT, col_top=VINE_WOOD_TOP,
            wobble=0.03, cap_bot=True, cap_top=True, flat_top=True,
            sway_base=0.0, sway_tip=0.0, noise_seed=210.0 + ri,
        )

    # Gnarled woody vine stocks rising from soil up to the z = 0.40 m cordon rail + short woody cordon spurs
    for i, vx in enumerate(stock_xs):
        sy = 0.042 * (1.0 if i % 2 == 0 else -1.0)
        pb.add_limb(
            [(vx, 0.0, -0.30), (vx + 0.035, sy, 0.16), (vx - 0.02, -sy * 0.35, 0.46)],
            [0.050, 0.040, 0.030], segs=4,
            col_bot=VINE_STOCK_BOT, col_top=VINE_STOCK_TOP,
            wobble=0.08, cap_top=True,
            sway_base=0.0, sway_tip=0.0, noise_seed=220.0 + i,
        )
        # Bilateral gnarled horizontal cordon arms hugging the 0.40 m rail beneath the leaf skirt
        for side in (-1.0, 1.0):
            pb.add_limb(
                [
                    (vx, 0.0, 0.42),
                    (vx + side * 0.16, sy * 0.35, 0.44),
                    (vx + side * 0.32, -sy * 0.25, 0.50),
                ],
                [0.028, 0.022, 0.015], segs=4,
                col_bot=VINE_STOCK_BOT, col_top=VINE_STOCK_TOP,
                wobble=0.06, cap_top=True,
                sway_base=0.0, sway_tip=0.0, noise_seed=230.0 + i * 2 + (0 if side < 0 else 1),
            )

    # Flush-tiling (1.00 x length) scalloped VSP grapevine leaf wall (z = 0.45..1.54 m, full width to both ends!)
    pb.add_vine_hedge(
        length=length, z_bot=0.45, z_top=1.54, half_w=0.38,
        col_top=VINE_FOL_TOP, col_mid=VINE_FOL_MID, col_bot=VINE_FOL_BOT,
        n_len=n_len, n_ring=10, seed=seed,
    )

    return pb.finalize(mat, macro_dome_mix=0.34, macro_up_bias=0.28, ao_strength=0.52, ao_min=0.40, ao_dist=1.8)


def build_vine_row_short(mat, lod=0):
    """2.4 m flush-tiling modular trellised vineyard hedge segment."""
    return _build_vineyard(
        'vine_row_short', length=2.4,
        stake_xs=(-0.98, 0.98),
        stock_xs=(-0.48, 0.48),
        n_len=13, seed=501, mat=mat, lod=lod,
    )


def build_vine_row_long(mat, lod=0):
    """4.8 m flush-tiling modular trellised vineyard hedge segment."""
    return _build_vineyard(
        'vine_row_long', length=4.8,
        stake_xs=(-2.18, 0.0, 2.18),
        stock_xs=(-1.60, -0.54, 0.54, 1.60),
        n_len=23, seed=502, mat=mat, lod=lod,
    )


# ------------------------------------------------------------------ registry & inspection
BUILDERS = {
    'pine_broad': build_pine_broad,
    'pine_tiered': build_pine_tiered,
    'pine_sheared': build_pine_sheared,
    'pine_young': build_pine_young,
    'cypress_tall': build_cypress_tall,
    'cypress_column': build_cypress_column,
    'cypress_sanctuary': build_cypress_sanctuary,
    'olive_ancient': build_olive_ancient,
    'olive_terrace': build_olive_terrace,
    'olive_young': build_olive_young,
    'plane_tall': build_plane_tall,
    'plane_broad': build_plane_broad,
    'almond_spread': build_almond_spread,
    'almond_young': build_almond_young,
    'fig_broad': build_fig_broad,
    'pomegranate_multi': build_pomegranate_multi,
    'vine_row_short': build_vine_row_short,
    'vine_row_long': build_vine_row_long,
}


def build_prototype(name, mat=None, collection=None, lod=0):
    mat = mat or ensure_export_material()
    ob = BUILDERS[name](mat, lod=lod)
    coll = collection or bpy.context.scene.collection
    coll.objects.link(ob)
    return ob


def build_all(mat=None, collection=None, include_lod=False):
    mat = mat or ensure_export_material()
    objs = [build_prototype(name, mat=mat, collection=collection, lod=0) for name in PROTOTYPE_NAMES]
    if include_lod:
        objs.extend(build_prototype(name, mat=mat, collection=collection, lod=1) for name in PROTOTYPE_NAMES)
    return objs


def compute_stats(ob):
    me = ob.data
    me.calc_loop_triangles()
    n_v = len(me.vertices)
    n_t = len(me.loop_triangles)
    base_name = ob.name[:-4] if ob.name.endswith('_lod') else ob.name
    co = np.zeros(n_v * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    z_max = float(co[:, 2].max())
    z_min = float(co[:, 2].min())
    x_span = float(co[:, 0].max() - co[:, 0].min())
    rad = float(np.sqrt(co[:, 0] ** 2 + co[:, 1] ** 2).max())

    col = np.zeros(n_v * 4, np.float32)
    me.color_attributes['Col'].data.foreach_get('color', col)
    col = col.reshape(-1, 4)
    pids = np.rint(col[:, 3] * 16.0).astype(int)
    pid_counts = {int(k): int((pids == k).sum()) for k in sorted(set(pids.tolist()))}

    sw_attr = me.attributes['_sway']
    if sw_attr.data_type == 'INT8':
        sw = np.zeros(n_v, np.int32)
        sw_attr.data.foreach_get('value', sw)
        sw = sw.astype(np.float32)
    else:
        sw = np.zeros(n_v, np.float32)
        sw_attr.data.foreach_get('value', sw)

    # Check PID cleanliness (strict pid == 14 evergreen vs pid == 8 deciduous, plus pid == 0 wood)
    expected_fol_pid = PID_EVERGREEN if base_name in EVERGREEN_PROTOTYPES else PID_DECIDUOUS
    unexpected_pids = [p for p in pid_counts.keys() if p not in (PID_WOOD, expected_fol_pid)]

    # Measure natural linear b/g ratio on deciduous foliage (verifies acid-lime blue clamp is GONE)
    dec_mask = pids == PID_DECIDUOUS
    dec_bg_mean = None
    if dec_mask.any():
        dg = np.maximum(col[dec_mask, 1], 1e-4)
        db = col[dec_mask, 2]
        dec_bg_mean = round(float((db / dg).mean()), 3)

    # Measure lower-skirt sway safety on vineyards (z <= 0.55 m must have sway == 0)
    vine_skirt_sway_max = 0.0
    if base_name in VINEYARD_PROTOTYPES:
        low_mask = co[:, 2] <= 0.55
        if low_mask.any():
            vine_skirt_sway_max = round(float(sw[low_mask].max()), 1)

    # Measure wood luminance min/max to confirm winter skeletons are never pitch-black
    wood_mask = pids == PID_WOOD
    wood_luma_min = None
    if wood_mask.any():
        wl = 0.2126 * col[wood_mask, 0] + 0.7152 * col[wood_mask, 1] + 0.0722 * col[wood_mask, 2]
        wood_luma_min = round(float(wl.min()), 3)

    # Measure foliage crown depth / width ratio (for stone pine parasol audit)
    fol_mask = pids == expected_fol_pid
    crown_depth_ratio = None
    if fol_mask.any():
        fco = co[fol_mask]
        c_depth = float(fco[:, 2].max() - fco[:, 2].min())
        c_width = float(max(fco[:, 0].max() - fco[:, 0].min(), fco[:, 1].max() - fco[:, 1].min()))
        crown_depth_ratio = round(c_depth / max(c_width, 1e-4), 3)

    # Verify closed watertight topology (0 boundary edges + positive signed volume)
    chk_bm = bmesh.new()
    chk_bm.from_mesh(me)
    boundary_edges = sum(1 for e in chk_bm.edges if e.is_boundary)
    signed_vol = round(float(chk_bm.calc_volume(signed=True)), 3)
    chk_bm.free()

    all_smooth = all(p.use_smooth for p in me.polygons)
    return dict(
        name=ob.name,
        verts=n_v,
        tris=n_t,
        v_per_t=round(n_v / max(n_t, 1), 3),
        height=round(z_max, 2),
        z_min=round(z_min, 2),
        x_span=round(x_span, 2),
        radius=round(rad, 2),
        crown_depth_ratio=crown_depth_ratio,
        boundary_edges=boundary_edges,
        signed_vol=signed_vol,
        sway_min=round(float(sw.min()), 1),
        sway_max=round(float(sw.max()), 1),
        vine_skirt_sway_max=vine_skirt_sway_max,
        pids=pid_counts,
        pid_clean=len(unexpected_pids) == 0,
        dec_bg_mean=dec_bg_mean,
        wood_luma_min=wood_luma_min,
        all_smooth=all_smooth,
    )


if __name__ == '__main__':
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    objs = build_all()
    for o in objs:
        s = compute_stats(o)
        print(f"{s['name']:18s} v={s['verts']:4d} t={s['tris']:4d} v/t={s['v_per_t']:.2f} "
              f"h={s['height']:5.2f} r={s['radius']:4.2f} sway={s['sway_min']:.0f}..{s['sway_max']:.0f} "
              f"pids={s['pids']} bg={s['dec_bg_mean']} wLmin={s['wood_luma_min']} smooth={s['all_smooth']}")
