"""Time-of-day states (golden / noon / night). Every value here is a uniform in the runtime."""
import bpy, math
from mathutils import Vector
from lib import lin, mixc
import mats

FWD_AZ = math.atan2(1, 1)


def sun_vec(az_deg_rel, el_deg):
    """az relative to camera forward (deg, + = to the right on screen), elevation (deg)."""
    az = FWD_AZ - math.radians(az_deg_rel)
    el = math.radians(el_deg)
    return Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))


def sky_dir(az_deg_rel, el_deg):
    return sun_vec(az_deg_rel, el_deg)


def _sd(sky, v):
    for i in range(3):
        sky['SUNDIR'].inputs[i].default_value = v[i]


def set_ramp(node, stops):
    from lib import set_ramp as sr
    sr(node, stops)


def apply(W, st, cam):
    sky = W.sky_nodes
    sea = W.sea_nodes
    sun = W.sun
    g = bpy.data.node_groups['CloudState'].nodes

    def cloud(lit, shade, ink, ink_k=0.7, alpha_k=1.0):
        g['lit'].outputs[0].default_value = (*lit, 1)
        g['shade'].outputs[0].default_value = (*shade, 1)
        g['ink'].outputs[0].default_value = (*ink, 1)
        g['ink_k'].outputs[0].default_value = ink_k
        g['alpha_k'].outputs[0].default_value = alpha_k

    def aim(vec):
        sun.rotation_euler = (-vec).to_track_quat('-Z', 'Y').to_euler()

    def pl(kind, energy):
        for ob in W.point_lights:
            if ob['kind'] == kind:
                ob.data.energy = energy

    if st == 'golden':
        L = sun_vec(-74, 14)                     # low, from the far-left: lights the camera-facing -X facades
        aim(L)
        sun.data.energy = 4.6
        sun.data.color = lin('#FFBE7E')
        sun.data.angle = math.radians(3.0)
        mats.set_state(shadow_tint=lin('#857AB8'), ink=lin('#3B2A1F'), ramp_lo=0.16, ramp_hi=0.5,
                       lvl_shadow=0.5, lvl_lit=1.02, lin_k=0.08, hatch_k=0.32, gran_k=0.32, pool_k=0.35,
                       win_e=2.2, lamp_e=1.5, lantern_e=8.0, riding_e=2.0, win_frac=0.22, sun_dir=tuple(L), spec_dir=tuple(sun_vec(-11.5, 27)),
                       spec_col=lin('#FFE2B0'), night=0.0, contour_k=0.22, cover_tone=1.0)
        set_ramp(sky['SKY_RAMP'], [(0.0, lin('#FBE3B4')), (0.12, lin('#F6CF9C')), (0.4, lin('#EDB7A0')),
                                   (0.75, lin('#C9A9B6')), (1.0, lin('#9FA4C4'))])
        _sd(sky, sky_dir(-11.5, math.degrees(W.e_h) + 1.0))
        sky['GLOW_COL'].outputs[0].default_value = (*lin('#FFE6B8'), 1)
        sky['GLOW_K'].outputs[0].default_value = 0.9
        sky['DISC_COL'].outputs[0].default_value = (*lin('#FFF4DA'), 1)
        sky['DISC_K'].outputs[0].default_value = 1.0
        sky['DISC_R'].outputs[0].default_value = 0.0062
        sky['DISC_R2'].outputs[0].default_value = 0.0062
        sky['RAY_K'].outputs[0].default_value = 0.5
        sky['MOON_K'].outputs[0].default_value = 0.0
        sky['STAR_K'].outputs[0].default_value = 0.0
        sky['AMBIENT'].outputs[0].default_value = (*lin('#9C9BB8'), 1)
        set_ramp(sea['SEA_RAMP'], [(0.0, lin('#D3DCC2')), (0.05, lin('#B3CBC2')), (0.16, lin('#8FB2B5')),
                                   (0.38, lin('#6E95A8')), (0.75, lin('#527C93')), (1.0, lin('#466F8A'))])
        sea['SEA_INK'].outputs[0].default_value = (*lin('#2F4659'), 1)
        sea['SEA_INK_K'].outputs[0].default_value = 1.0
        sea['SEA_SKY'].outputs[0].default_value = (*lin('#F2C9A4'), 1)
        sea['SEA_SKY_K'].outputs[0].default_value = 0.55
        sea['SEA_GLINT_K'].outputs[0].default_value = 1.2
        sea['SEA_SH_K'].outputs[0].default_value = 0.12
        sea['SEA_FG'].outputs[0].default_value = (*lin('#2B5470'), 1)
        sea['SEA_FG_K'].outputs[0].default_value = 0.5
        sea['SEA_LVL'].outputs[0].default_value = 1.0
        sea['SEA_LAMP_K'].outputs[0].default_value = 0.0
        sea['HAZE'].outputs[0].default_value = (*lin('#F6DCB8'), 1)
        sea['HAZE_K'].outputs[0].default_value = 1.0
        if 'OVERLAY_K' in sea:
            sea['OVERLAY_K'].outputs[0].default_value = 0.3
        cloud(lin('#FFEBD2'), lin('#D9AAA8'), lin('#8A6050'), 0.26, 0.92)
        for k, e in (('lamp', 0), ('window', 0), ('lantern', 0), ('riding', 0)):
            pl(k, e)
    elif st == 'noon':
        L = sun_vec(-100, 55)
        aim(L)
        sun.data.energy = 4.6
        sun.data.color = lin('#FFF4E2')
        sun.data.angle = math.radians(2.0)
        mats.set_state(shadow_tint=lin('#8D9BB4'), ink=lin('#3B2A1F'), ramp_lo=0.18, ramp_hi=0.52,
                       lvl_shadow=0.66, lvl_lit=1.0, lin_k=0.06, hatch_k=0.28, gran_k=0.28, pool_k=0.3,
                       win_e=0.0, lamp_e=0.0, lantern_e=0.8, riding_e=0.0, win_frac=0.0, sun_dir=tuple(L), spec_dir=tuple(sun_vec(20, 40)),
                       spec_col=lin('#FFF6E0'), night=0.0, contour_k=0.22, cover_tone=1.0)
        set_ramp(sky['SKY_RAMP'], [(0.0, lin('#F2EEDF')), (0.2, lin('#E1E6E0')), (0.55, lin('#BCD0DA')),
                                   (1.0, lin('#93B3CB'))])
        _sd(sky, sky_dir(30, math.degrees(W.e_h) + 6))
        sky['GLOW_COL'].outputs[0].default_value = (*lin('#FFFBEF'), 1)
        sky['GLOW_K'].outputs[0].default_value = 0.0
        sky['DISC_K'].outputs[0].default_value = 0.0
        sky['RAY_K'].outputs[0].default_value = 0.0
        sky['MOON_K'].outputs[0].default_value = 0.0
        sky['STAR_K'].outputs[0].default_value = 0.0
        sky['AMBIENT'].outputs[0].default_value = (*lin('#AEBCCB'), 1)
        set_ramp(sea['SEA_RAMP'], [(0.0, lin('#D8E2CC')), (0.05, lin('#B5D2CB')), (0.16, lin('#8CBAC0')),
                                   (0.38, lin('#6699B0')), (0.75, lin('#4B7B98')), (1.0, lin('#41708F'))])
        sea['SEA_INK'].outputs[0].default_value = (*lin('#2C4A60'), 1)
        sea['SEA_INK_K'].outputs[0].default_value = 1.0
        sea['SEA_SKY'].outputs[0].default_value = (*lin('#DCE6E4'), 1)
        sea['SEA_SKY_K'].outputs[0].default_value = 0.45
        sea['SEA_GLINT_K'].outputs[0].default_value = 0.0
        sea['SEA_SH_K'].outputs[0].default_value = 0.15
        sea['SEA_FG'].outputs[0].default_value = (*lin('#2C5C7E'), 1)
        sea['SEA_FG_K'].outputs[0].default_value = 0.4
        sea['SEA_LVL'].outputs[0].default_value = 1.0
        sea['SEA_LAMP_K'].outputs[0].default_value = 0.0
        sea['HAZE'].outputs[0].default_value = (*lin('#E9EADF'), 1)
        sea['HAZE_K'].outputs[0].default_value = 0.9
        if 'OVERLAY_K' in sea:
            sea['OVERLAY_K'].outputs[0].default_value = 0.3
        cloud(lin('#FFFDF6'), lin('#C3CCD6'), lin('#6D6055'), 0.26, 0.95)
        for k, e in (('lamp', 0), ('window', 0), ('lantern', 0), ('riding', 0)):
            pl(k, e)
    else:  # night
        L = sun_vec(-78, 38)
        aim(L)
        sun.data.energy = 0.9
        sun.data.color = lin('#9DB0F0')
        sun.data.angle = math.radians(1.5)
        mats.set_state(shadow_tint=lin('#3C4380'), ink=lin('#1B1930'), ramp_lo=0.05, ramp_hi=0.22,
                       lvl_shadow=0.22, lvl_lit=0.45, lin_k=0.25, hatch_k=0.2, gran_k=0.25, pool_k=0.3,
                       win_e=9.0, lamp_e=18.0, lantern_e=40.0, riding_e=30.0, win_frac=0.72, sun_dir=tuple(L), spec_dir=tuple(sun_vec(-13, 27)),
                       spec_col=lin('#E6ECFF'), night=1.0, contour_k=0.12, cover_tone=0.85)
        set_ramp(sky['SKY_RAMP'], [(0.0, lin('#4C4D86')), (0.15, lin('#36396E')), (0.5, lin('#242853')),
                                   (1.0, lin('#151838'))])
        _sd(sky, sky_dir(-13, math.degrees(W.e_h) + 2.4))
        sky['GLOW_COL'].outputs[0].default_value = (*lin('#9FB0E8'), 1)
        sky['GLOW_K'].outputs[0].default_value = 0.55
        sky['DISC_COL'].outputs[0].default_value = (*lin('#F6EED6'), 1)
        sky['DISC_K'].outputs[0].default_value = 1.0
        sky['DISC_R'].outputs[0].default_value = 0.0055
        sky['DISC_R2'].outputs[0].default_value = 0.0055
        sky['RAY_K'].outputs[0].default_value = 0.0
        sky['MOON_K'].outputs[0].default_value = 1.0
        sky['STAR_K'].outputs[0].default_value = 1.0
        sky['AMBIENT'].outputs[0].default_value = (*lin('#2E3768'), 1)
        set_ramp(sea['SEA_RAMP'], [(0.0, lin('#34477A')), (0.06, lin('#283B6C')), (0.25, lin('#1D2E5C')),
                                   (1.0, lin('#141F48'))])
        sea['SEA_INK'].outputs[0].default_value = (*lin('#5A6BA8'), 1)
        sea['SEA_INK_K'].outputs[0].default_value = 0.55
        sea['SEA_SKY'].outputs[0].default_value = (*lin('#3A3F78'), 1)
        sea['SEA_SKY_K'].outputs[0].default_value = 0.45
        sea['SEA_GLINT_K'].outputs[0].default_value = 1.4
        sea['SEA_SH_K'].outputs[0].default_value = 0.2
        sea['SEA_FG'].outputs[0].default_value = (*lin('#0E1638'), 1)
        sea['SEA_FG_K'].outputs[0].default_value = 0.55
        sea['SEA_LVL'].outputs[0].default_value = 1.0
        sea['SEA_LAMP_K'].outputs[0].default_value = 0.12
        sea['HAZE'].outputs[0].default_value = (*lin('#353A70'), 1)
        sea['HAZE_K'].outputs[0].default_value = 0.85
        if 'OVERLAY_K' in sea:
            sea['OVERLAY_K'].outputs[0].default_value = 0.45
        cloud(lin('#7C83B8'), lin('#2A2E5A'), lin('#121330'), 0.45, 0.9)
        for k, e in (('lamp', 600), ('window', 220), ('lantern', 30000), ('riding', 25)):
            pl(k, e)
    for b in getattr(W, 'beams', []):
        b.hide_render = st != 'night'
    for p in getattr(W, 'pillar_obs', []):
        p.hide_render = st != 'night'
    mats.set_state(cloud_cov={'noon': 0.06, 'golden': -0.04, 'night': -1.0}[st])
    for g in getattr(W, 'gulls', []):
        g.hide_render = st == 'night' or cam == 'harbour'
