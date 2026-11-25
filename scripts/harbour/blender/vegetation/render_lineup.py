"""Render diagnostic 1920x1080 lineup and close-up grove PNGs for the 18 vegetation prototypes.

Usage:
    blender -b --factory-startup -P scripts/harbour/blender/vegetation/render_lineup.py

Outputs:
    outputs/terrain-veg-overhaul/veg-lineup.png   (1920x1080, all 18 prototypes in labeled rows)
    outputs/terrain-veg-overhaul/veg-closeup.png  (1920x1080, close-up sunlit grove at ~28 deg pitch)
"""
import math
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT_DIR = os.path.join(ROOT, 'outputs', 'terrain-veg-overhaul')
sys.path.insert(0, HERE)

import bpy
import bmesh
from mathutils import Vector, Euler, noise
from bpy_extras.object_utils import world_to_camera_view
from PIL import Image, ImageDraw, ImageFont

import veg_prototypes as vp


def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images, bpy.data.worlds):
        for b in list(coll):
            try:
                coll.remove(b)
            except Exception:
                pass


def build_preview_material():
    """Faithful PharosVille Mediterranean vegetation preview material driven by vertex `Col` + custom normals."""
    m = bpy.data.materials.new('M_veg_preview')
    if m.node_tree is None:
        m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']

    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 'Col'
    geo = nt.nodes.new('ShaderNodeNewGeometry')

    tex_n = nt.nodes.new('ShaderNodeTexNoise')
    tex_n.inputs['Scale'].default_value = 0.85
    tex_n.inputs['Detail'].default_value = 2.0
    nt.links.new(geo.outputs['Position'], tex_n.inputs['Vector'])

    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.2
    mr.inputs['From Max'].default_value = 0.8
    mr.inputs['To Min'].default_value = 0.94
    mr.inputs['To Max'].default_value = 1.06
    nt.links.new(tex_n.outputs['Fac'], mr.inputs['Value'])

    comb = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3):
        nt.links.new(mr.outputs['Result'], comb.inputs[i])

    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    nt.links.new(at.outputs['Color'], mul.inputs['A'])
    nt.links.new(comb.outputs[0], mul.inputs['B'])

    nt.links.new(mul.outputs['Result'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.82
    bsdf.inputs['Specular IOR Level'].default_value = 0.22
    return m


def build_ground_material(col_a='#C8B894', col_b='#A79D78', scale=0.08):
    """Warm sunlit Mediterranean dry limestone-meadow ground plane."""
    m = bpy.data.materials.new('M_ground')
    if m.node_tree is None:
        m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    n1 = nt.nodes.new('ShaderNodeTexNoise')
    n1.inputs['Scale'].default_value = scale
    n1.inputs['Detail'].default_value = 3.0
    nt.links.new(geo.outputs['Position'], n1.inputs['Vector'])

    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (*vp.srgb_to_lin(col_a), 1.0)
    mix.inputs['B'].default_value = (*vp.srgb_to_lin(col_b), 1.0)
    nt.links.new(n1.outputs['Fac'], mix.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.90
    bsdf.inputs['Specular IOR Level'].default_value = 0.12
    return m


def add_ground_plane(size_x=220.0, size_y=220.0, z=0.0, gentle_hill=False, mat=None):
    bm = bmesh.new()
    nx, ny = (36, 36) if gentle_hill else (4, 4)
    verts = []
    for iy in range(ny + 1):
        row = []
        y = -size_y * 0.5 + size_y * iy / ny
        for ix in range(nx + 1):
            x = -size_x * 0.5 + size_x * ix / nx
            zz = z
            if gentle_hill:
                r = math.hypot(x, y)
                edge_k = vp.smoothstep(8.5, 24.0, r)
                zz += edge_k * (0.60 * noise.noise(Vector((x * 0.06, y * 0.06, 1.2))) + max(0.0, (y - 6.0) * 0.05))
            row.append(bm.verts.new((x, y, zz)))
        verts.append(row)
    for iy in range(ny):
        for ix in range(nx):
            bm.faces.new((verts[iy][ix], verts[iy][ix + 1], verts[iy + 1][ix + 1], verts[iy + 1][ix]))
    me = bpy.data.meshes.new('ground')
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.materials.append(mat or build_ground_material())
    ob = bpy.data.objects.new('ground', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def setup_mediterranean_daylight(scene, sun_az=-46.0, sun_el=34.0, samples=64):
    """Warm Mediterranean daylight sun + cool Aegean sky dome + soft bounce fill (EEVEE + AgX)."""
    scene.render.engine = 'BLENDER_EEVEE'
    ee = scene.eevee
    ee.taa_render_samples = samples
    ee.use_raytracing = True
    ee.ray_tracing_method = 'SCREEN'
    ee.use_shadows = True
    ee.shadow_ray_count = 3
    ee.shadow_step_count = 12
    ee.use_fast_gi = True
    ee.fast_gi_distance = 12.0

    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    scene.view_settings.exposure = 0.05

    def add_sun(name, energy, hex_col, az_deg, el_deg, angle_deg, shadow=True, spec=1.0):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.energy = energy
        ld.color = tuple(vp.srgb_to_lin(hex_col))
        ld.angle = math.radians(angle_deg)
        ld.use_shadow = shadow
        ld.specular_factor = spec
        ob = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(ob)
        az, el = math.radians(az_deg), math.radians(el_deg)
        d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
        ob.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        return ob

    add_sun('sun_key', 4.6, '#FFE3BC', sun_az, sun_el, 1.4, shadow=True, spec=0.6)
    add_sun('sun_sky_fill', 0.55, '#89B2E6', sun_az + 165.0, 46.0, 22.0, shadow=False, spec=0.0)
    add_sun('sun_bounce', 0.24, '#DEC89E', sun_az + 20.0, -25.0, 35.0, shadow=False, spec=0.0)

    wt = bpy.data.worlds.new('MedSky')
    scene.world = wt
    if wt.node_tree is None:
        wt.use_nodes = True
    wnt = wt.node_tree
    bg = wnt.nodes['Background']
    tc = wnt.nodes.new('ShaderNodeTexCoord')
    sep = wnt.nodes.new('ShaderNodeSeparateXYZ')
    wnt.links.new(tc.outputs['Generated'], sep.inputs[0])
    mr = wnt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.0
    mr.inputs['From Max'].default_value = 0.65
    wnt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    ramp = wnt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position = 0.0
    els[0].color = (*vp.srgb_to_lin('#DCE4EA'), 1.0)
    els[1].position = 1.0
    els[1].color = (*vp.srgb_to_lin('#6894C8'), 1.0)
    mid_e = els.new(0.28)
    mid_e.color = (*vp.srgb_to_lin('#B3CBE0'), 1.0)
    wnt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    wnt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.82


def setup_camera(scene, location, target, fov_y_deg=22.0):
    cd = bpy.data.cameras.new('cam')
    cd.sensor_fit = 'VERTICAL'
    cd.angle_y = math.radians(fov_y_deg)
    cd.clip_start = 0.5
    cd.clip_end = 2000.0
    cam = bpy.data.objects.new('cam', cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = Vector(location)
    direction = (Vector(target) - Vector(location)).normalized()
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    return cam


def load_font(size):
    for p in (
        '/usr/share/fonts/noto/NotoSans-Bold.ttf',
        '/usr/share/fonts/noto/NotoSerif-Bold.ttf',
        '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    ):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def render_to_png(scene, path, w=1920, h=1080):
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)


# ==================================================================
# RENDER 1: ALL 18 PROTOTYPES LINEUP (1920x1080, cleanly labeled rows)
# ==================================================================
def render_lineup():
    reset_scene()
    scene = bpy.context.scene
    mat = build_preview_material()
    setup_mediterranean_daylight(scene, sun_az=-50.0, sun_el=34.0, samples=64)
    add_ground_plane(size_x=260.0, size_y=260.0, z=0.0, gentle_hill=False, mat=build_ground_material('#D0C3A4', '#B9AE8C', 0.05))

    # Generous row separation (dy = 33m back->mid, dy = 21m mid->front) so ZERO trees or labels collide!
    layout = [
        # Back row (y=+33.5): Stone Pines (left) + Italian Cypresses (right)
        ('pine_broad',        (-26.5, 33.5, 0.0),  0.15),
        ('pine_tiered',       (-16.0, 33.5, 0.0), -0.35),
        ('pine_sheared',      ( -5.2, 33.5, 0.0),  0.0),
        ('pine_young',        (  4.2, 33.5, 0.0),  0.40),
        ('cypress_tall',      ( 13.0, 33.5, 0.0),  0.20),
        ('cypress_column',    ( 21.4, 33.5, 0.0), -0.30),
        ('cypress_sanctuary', ( 29.8, 33.5, 0.0),  0.10),

        # Middle row (y=+0.5): Deciduous Mediterranean Trees (6 across)
        ('plane_tall',        (-23.5,  0.5, 0.0),  0.25),
        ('plane_broad',       (-12.0,  0.5, 0.0), -0.20),
        ('almond_spread',     ( -1.5,  0.5, 0.0),  0.30),
        ('almond_young',      (  6.8,  0.5, 0.0), -0.40),
        ('fig_broad',         ( 14.8,  0.5, 0.0),  0.20),
        ('pomegranate_multi', ( 23.2,  0.5, 0.0), -0.25),

        # Front row (y=-20.5): Gnarled Olives (left) + Modular Vineyard Hedges (right)
        ('olive_ancient',     (-17.5, -20.5, 0.0),  0.25),
        ('olive_terrace',     ( -8.5, -20.5, 0.0), -0.20),
        ('olive_young',       ( -0.8, -20.5, 0.0),  0.35),
        ('vine_row_short',    (  8.2, -20.5, 0.0), -0.22),
        ('vine_row_long',     ( 16.8, -20.5, 0.0), -0.22),
    ]

    placed = []
    for name, loc, rz in layout:
        ob = vp.build_prototype(name, mat=mat)
        ob.location = Vector(loc)
        ob.rotation_euler = Euler((0.0, 0.0, rz), 'XYZ')
        stats = vp.compute_stats(ob)
        placed.append((ob, stats))

    # Elevated architectural telephoto camera (~27.5 deg pitch, full generous margin around all 18 prototypes)
    cam = setup_camera(scene, location=(1.0, -89.0, 48.5), target=(1.0, 5.5, 3.2), fov_y_deg=24.0)
    bpy.context.view_layer.update()

    raw_path = os.path.join(OUT_DIR, 'veg-lineup.png')
    render_to_png(scene, raw_path, 1920, 1080)

    im = Image.open(raw_path).convert('RGBA')
    overlay = Image.new('RGBA', im.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    f_title = load_font(25)
    f_group = load_font(16)
    f_item = load_font(13)

    draw.rectangle((0, 0, 1920, 48), fill=(18, 24, 28, 185))
    tot_t = sum(s['tris'] for _, s in placed)
    draw.text(
        (24, 10),
        f"PharosVille Hero Botanical Kit — 18 Smooth-Indexed Prototypes (Transferred Dome Normals + E15 BVHTree Self-AO, {tot_t:,} total tris)",
        font=f_title,
        fill=(248, 244, 232, 255),
    )

    W, H = im.size
    for ob, st in placed:
        co_2d = world_to_camera_view(scene, cam, ob.location + Vector((0.0, -0.8, 0.0)))
        px = int(co_2d.x * W)
        py = int((1.0 - co_2d.y) * H) + 8
        label = f"{st['name']} ({st['tris']}t)"
        bbox = draw.textbbox((0, 0), label, font=f_item)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        bx0 = max(6, min(W - tw - 14, px - tw // 2 - 6))
        by0 = max(54, min(H - th - 10, py))
        draw.rounded_rectangle((bx0, by0, bx0 + tw + 12, by0 + th + 6), radius=5, fill=(18, 24, 28, 190))
        draw.text((bx0 + 6, by0 + 2), label, font=f_item, fill=(246, 242, 230, 255))

    # Crisp group headers anchored cleanly in empty space above/beside each group
    groups_anchor = [
        ('STONE PINES (pid 14)', (-11.0, 33.5, 13.8)),
        ('ITALIAN CYPRESSES (pid 14)', (21.4, 33.5, 14.5)),
        ('DECIDUOUS MEDITERRANEAN (pid 8 + winter skeletons)', (10.5, 0.5, 7.6)),
        ('GNARLED OLIVES (pid 14)', (-9.0, -20.5, 7.2)),
        ('TRELLISED VINEYARDS (pid 8)', (12.8, -20.5, 3.6)),
    ]
    for g_text, wp in groups_anchor:
        co_2d = world_to_camera_view(scene, cam, Vector(wp))
        px = int(co_2d.x * W)
        py = int((1.0 - co_2d.y) * H)
        bbox = draw.textbbox((0, 0), g_text, font=f_group)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        bx0 = max(12, min(W - tw - 20, px - tw // 2 - 8))
        by0 = max(54, min(H - th - 12, py - th - 8))
        draw.rounded_rectangle((bx0, by0, bx0 + tw + 16, by0 + th + 8), radius=6, fill=(32, 46, 36, 210))
        draw.text((bx0 + 8, by0 + 3), g_text, font=f_group, fill=(238, 244, 220, 255))

    out = Image.alpha_composite(im, overlay).convert('RGB')
    out.save(raw_path)
    print('RENDERED LINEUP:', raw_path)


# ==================================================================
# RENDER 2: CLOSE-UP HERO GROVE (1920x1080, ~28 deg camera pitch)
# ==================================================================
def render_closeup():
    reset_scene()
    scene = bpy.context.scene
    mat = build_preview_material()
    setup_mediterranean_daylight(scene, sun_az=-42.0, sun_el=28.0, samples=96)
    add_ground_plane(size_x=150.0, size_y=150.0, z=0.0, gentle_hill=True, mat=build_ground_material('#BEB284', '#92995E', 0.10))

    # Mini grove: pine_broad, pine_tiered, olive_ancient, cypress_tall, almond_spread (fully framed root to crown!)
    grove = [
        ('pine_broad',    (-2.8,  1.2, 0.0),  0.42),
        ('pine_tiered',   ( 4.6,  4.8, 0.0), -0.60),
        ('cypress_tall',  ( 8.8,  1.6, 0.0),  0.25),
        ('olive_ancient', (-6.5, -2.8, 0.0),  0.55),
        ('almond_spread', ( 3.4, -3.5, 0.0), -0.40),
    ]
    for name, loc, rz in grove:
        ob = vp.build_prototype(name, mat=mat)
        ob.location = Vector(loc)
        ob.rotation_euler = Euler((0.0, 0.0, rz), 'XYZ')

    target = Vector((0.8, 0.4, 5.2))
    pitch = math.radians(28.0)
    dist = 33.5
    yaw = math.radians(-10.0)
    cam_pos = target + Vector((
        math.sin(yaw) * math.cos(pitch) * dist,
        -math.cos(yaw) * math.cos(pitch) * dist,
        math.sin(pitch) * dist,
    ))
    setup_camera(scene, location=cam_pos, target=target, fov_y_deg=29.0)
    bpy.context.view_layer.update()

    out_path = os.path.join(OUT_DIR, 'veg-closeup.png')
    render_to_png(scene, out_path, 1920, 1080)
    print('RENDERED CLOSEUP:', out_path)


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    render_lineup()
    render_closeup()
