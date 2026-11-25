"""Export all 18 PharosVille vegetation prototypes to meshopt-compressed GLB and verify contract.

Usage:
    blender -b --factory-startup -P scripts/harbour/blender/vegetation/export.py

Outputs:
    outputs/terrain-veg-overhaul/vegetation.raw.glb      (uncompressed Blender export)
    outputs/terrain-veg-overhaul/vegetation.preview.glb  (meshopt-compressed GLB)
    outputs/terrain-veg-overhaul/vegetation-stats.json   (per-prototype & wire byte stats)
"""
import gzip
import json
import os
import shutil
import struct
import subprocess
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT_DIR = os.path.join(ROOT, 'outputs', 'terrain-veg-overhaul')
sys.path.insert(0, HERE)

import bpy
import veg_prototypes as vp


def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for b in list(coll):
            try:
                coll.remove(b)
            except Exception:
                pass


def export_raw_glb(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.hide_render = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=False,
        export_vertex_color='NAME',
        export_vertex_color_name='Col',
        export_all_vertex_colors=False,
        export_extras=True,
        export_yup=True,
        export_materials='EXPORT',
        export_normals=True,
        export_image_format='NONE',
        export_texcoords=False,
        export_attributes=True,
    )


def run_meshopt(src, dst):
    cmd = ['npx', '-y', '@gltf-transform/cli@4.1.1', 'meshopt', src, dst, '--level', 'medium']
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        print('MESHOPT FAILED:', r.stderr[-800:])
        raise SystemExit(1)
    if r.stdout.strip():
        print(r.stdout.strip())


def parse_glb_summary(path, read_raw_sway=False):
    with open(path, 'rb') as f:
        magic, ver, length = struct.unpack('<4sII', f.read(12))
        assert magic == b'glTF'
        clen, ctype = struct.unpack('<I4s', f.read(8))
        assert ctype == b'JSON'
        gltf = json.loads(f.read(clen))
        bin_data = None
        if read_raw_sway:
            blen, btype = struct.unpack('<I4s', f.read(8))
            assert btype == b'BIN\x00'
            bin_data = f.read(blen)
    meshes = {}
    for m in gltf.get('meshes', []):
        name = m['name']
        p = m['primitives'][0]
        attrs = p['attributes']
        pos_acc = gltf['accessors'][attrs['POSITION']]
        nrm_acc = gltf['accessors'][attrs['NORMAL']] if 'NORMAL' in attrs else None
        col_acc = gltf['accessors'][attrs['COLOR_0']] if 'COLOR_0' in attrs else None
        sw_acc = gltf['accessors'][attrs['_SWAY']] if '_SWAY' in attrs else None
        idx_acc = gltf['accessors'][p['indices']]
        sw_range = None
        if read_raw_sway and sw_acc is not None and bin_data is not None:
            bv = gltf['bufferViews'][sw_acc['bufferView']]
            off = bv.get('byteOffset', 0) + sw_acc.get('byteOffset', 0)
            stride = bv.get('byteStride', 4 if sw_acc['componentType'] == 5126 else 1)
            cnt = sw_acc['count']
            fmt = '<f' if sw_acc['componentType'] == 5126 else '<b'
            vals = [struct.unpack_from(fmt, bin_data, off + i * stride)[0] for i in range(cnt)]
            sw_range = (round(float(min(vals)), 1), round(float(max(vals)), 1))
        meshes[name] = dict(
            glb_verts=pos_acc['count'],
            glb_tris=idx_acc['count'] // 3,
            attrs=sorted(attrs.keys()),
            has_normal=nrm_acc is not None,
            color_type=col_acc['componentType'] if col_acc else None,
            color_norm=col_acc.get('normalized', False) if col_acc else False,
            sway_type=sw_acc['componentType'] if sw_acc else None,
            sway_norm=sw_acc.get('normalized', False) if sw_acc else False,
            sway_range=sw_range,
            mat=gltf['materials'][p['material']]['name'] if 'material' in p else None,
        )
    return dict(
        extensions_used=gltf.get('extensionsUsed', []),
        materials=[m['name'] for m in gltf.get('materials', [])],
        nodes=[n['name'] for n in gltf.get('nodes', [])],
        meshes=meshes,
    )


def compressed_sizes(path):
    data = open(path, 'rb').read()
    gz = len(gzip.compress(data, compresslevel=9))
    if shutil.which('brotli'):
        r = subprocess.run(['brotli', '-q', '11', '-c', path], capture_output=True, check=True)
        br = len(r.stdout)
    else:
        r = subprocess.run(
            ['node', '-e',
             f'const fs=require("fs"),z=require("zlib");'
             f'const b=z.brotliCompressSync(fs.readFileSync({json.dumps(path)}),{{params:{{[z.constants.BROTLI_PARAM_QUALITY]:11}}}});'
             f'console.log(b.length);'],
            capture_output=True, text=True, check=True,
        )
        br = int(r.stdout.strip())
    return dict(raw=len(data), gzip9=gz, brotli11=br)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    reset_scene()
    mat = vp.ensure_export_material()
    objs = vp.build_all(mat=mat, include_lod=True)
    bpy.context.view_layer.update()

    bl_stats = {o.name: vp.compute_stats(o) for o in objs}

    raw_glb = os.path.join(OUT_DIR, 'vegetation.raw.glb')
    preview_glb = os.path.join(OUT_DIR, 'vegetation.preview.glb')
    export_raw_glb(objs, raw_glb)
    run_meshopt(raw_glb, preview_glb)

    raw_info = parse_glb_summary(raw_glb, read_raw_sway=True)
    glb_info = parse_glb_summary(preview_glb, read_raw_sway=False)
    raw_bytes = os.path.getsize(raw_glb)
    wire = compressed_sizes(preview_glb)

    print('\n' + '=' * 138)
    print('PHAROSVILLE HERO BOTANICAL PROTOTYPE KIT — VERIFICATION TABLE (18 LOD0 + 18 LOD1)')
    print('=' * 138)
    hdr = (
        f"{'Prototype':<22} {'BlV':>5} {'GlbV':>5} {'Tris':>5} {'LOD1T':>5} {'Ratio':>6} {'v/t':>5} "
        f"{'H(m)':>5} {'R(m)':>5} {'D/W':>5} {'BndE':>4} {'Sway':>8} {'PIDs (0/8/14)':>15} {'Smooth':>6}"
    )
    print(hdr)
    print('-' * 138)

    tot_bl_v = tot_glb_v = tot_tris = 0
    tot_lod_bl_v = tot_lod_glb_v = tot_lod_tris = 0
    rows = []

    def assert_mesh_contract(mesh_name, base_name):
        s = bl_stats[mesh_name]
        g = glb_info['meshes'].get(mesh_name, {})
        rg = raw_info['meshes'].get(mesh_name, {})
        glb_v = g.get('glb_verts', -1)
        glb_t = g.get('glb_tris', -1)
        vt = glb_v / max(glb_t, 1) if glb_v > 0 else s['v_per_t']

        assert g.get('has_normal'), f'{mesh_name}: missing NORMAL in GLB'
        assert g.get('color_type') == 5121 and g.get('color_norm'), f'{mesh_name}: COLOR_0 not RGBA8 normalized ({g})'
        assert '_SWAY' in g.get('attrs', []), f'{mesh_name}: missing _SWAY in GLB'
        assert not g.get('sway_norm'), f'{mesh_name}: _SWAY must NOT be normalized (sway.ts divides raw [0..100] by 100)'
        assert rg.get('sway_range') == (s['sway_min'], s['sway_max']), (
            f"{mesh_name}: raw GLB _SWAY range {rg.get('sway_range')} != Blender {(s['sway_min'], s['sway_max'])}"
        )
        assert g.get('mat') == 'hb_opaque', f'{mesh_name}: wrong material {g.get("mat")}'
        assert s['all_smooth'], f'{mesh_name}: flat-shaded polygon detected!'
        assert s['pid_clean'], f'{mesh_name}: unexpected PID cross-contamination ({s["pids"]})'
        assert s['boundary_edges'] == 0, f'{mesh_name}: non-watertight mesh ({s["boundary_edges"]} boundary edges)!'
        assert s['signed_vol'] > 0.0, f'{mesh_name}: inverted normals (signed_vol={s["signed_vol"]})!'
        assert vt <= 0.78, f'{mesh_name}: v/t={vt:.3f} exceeds 0.78 budget!'
        if base_name not in vp.VINEYARD_PROTOTYPES:
            assert glb_v == s['verts'], f'{mesh_name}: tree vertex split detected (bl={s["verts"]}, glb={glb_v})!'
        else:
            assert s['sway_max'] <= 32.0, f'{mesh_name}: vineyard _SWAY max {s["sway_max"]} exceeds 32!'
            assert s['vine_skirt_sway_max'] == 0.0, f'{mesh_name}: vineyard lower skirt (z<=0.55) sway={s["vine_skirt_sway_max"]} != 0!'
            expected_len = 2.4 if base_name == 'vine_row_short' else 4.8
            assert abs(s['x_span'] - expected_len) < 0.01, f'{mesh_name}: x_span={s["x_span"]} != {expected_len}'
        return s, g, glb_v, glb_t, vt

    for name in vp.PROTOTYPE_NAMES:
        s, g, glb_v, glb_t, vt = assert_mesh_contract(name, name)
        lod_name = f'{name}_lod'
        sl, gl, lod_glb_v, lod_glb_t, lod_vt = assert_mesh_contract(lod_name, name)
        ratio = sl['tris'] / max(s['tris'], 1)
        assert 0.30 <= ratio <= 0.65, f'{lod_name}: tri ratio {ratio:.2f} outside [0.30, 0.65] (lod0={s["tris"]}, lod1={sl["tris"]})'
        if name in ('pine_broad', 'pine_tiered'):
            assert s['crown_depth_ratio'] is not None and s['crown_depth_ratio'] <= 0.30, (
                f"{name}: crown depth/width ratio {s['crown_depth_ratio']} exceeds 0.30!"
            )

        tot_bl_v += s['verts']
        tot_glb_v += max(glb_v, 0)
        tot_tris += s['tris']
        tot_lod_bl_v += sl['verts']
        tot_lod_glb_v += max(lod_glb_v, 0)
        tot_lod_tris += sl['tris']

        p0 = s['pids'].get(0, 0)
        p8 = s['pids'].get(8, 0)
        p14 = s['pids'].get(14, 0)
        pid_str = f"{p0}/{p8}/{p14}"
        sw_str = f"{s['sway_min']:.0f}..{s['sway_max']:.0f}"
        dw_str = f"{s['crown_depth_ratio']:.2f}" if s['crown_depth_ratio'] is not None else '  -  '
        print(
            f"{name:<22} {s['verts']:>5d} {glb_v:>5d} {s['tris']:>5d} {sl['tris']:>5d} {ratio:>5.1%} {vt:>5.2f} "
            f"{s['height']:>5.2f} {s['radius']:>5.2f} {dw_str:>5} {s['boundary_edges']:>4d} {sw_str:>8} {pid_str:>15} {'YES' if s['all_smooth'] else 'NO':>6}"
        )

        rows.append({
            **s,
            'glb_verts': glb_v,
            'glb_tris': glb_t,
            'glb_v_per_t': round(vt, 3),
            'sway_component_type': g.get('sway_type'),
            'lod1': {
                **sl,
                'glb_verts': lod_glb_v,
                'glb_tris': lod_glb_t,
                'glb_v_per_t': round(lod_vt, 3),
                'tri_ratio': round(ratio, 3),
            },
        })

    print('-' * 138)
    print(
        f"{'TOTAL LOD0 (18)':<22} {tot_bl_v:>5d} {tot_glb_v:>5d} {tot_tris:>5d} {tot_lod_tris:>5d} "
        f"{(tot_lod_tris / max(tot_tris, 1)):>5.1%} {(tot_glb_v / max(tot_tris, 1)):>5.2f} "
        f"{'':>5} {'':>5} {'':>5} {'0':>4} {'':>8} {'':>15} {'ALL':>6}"
    )
    print(
        f"{'TOTAL LOD1 (18)':<22} {tot_lod_bl_v:>5d} {tot_lod_glb_v:>5d} {tot_lod_tris:>5d} {'':>5} "
        f"{'':>6} {(tot_lod_glb_v / max(tot_lod_tris, 1)):>5.2f}"
    )
    print(f"{'TOTAL ALL (36 meshes)':<22} {tot_bl_v + tot_lod_bl_v:>5d} {tot_glb_v + tot_lod_glb_v:>5d} {tot_tris + tot_lod_tris:>5d}")
    print('=' * 138)
    sw_types = sorted({g.get('sway_type') for g in glb_info['meshes'].values()})
    print(f"GLB Materials : {glb_info['materials']}")
    print(f"GLB Extensions: {glb_info['extensions_used']}")
    print(f"_SWAY Accessor: componentType={sw_types} (5126=FLOAT32 lossless [0..100] matching sway.ts * 0.01)")
    print(
        f"Wire Sizes    : raw_unopt={raw_bytes:,} B ({raw_bytes / 1024:.1f} KB) | "
        f"meshopt={wire['raw']:,} B ({wire['raw'] / 1024:.1f} KB) | "
        f"gzip-9={wire['gzip9']:,} B ({wire['gzip9'] / 1024:.1f} KB) | "
        f"brotli-11={wire['brotli11']:,} B ({wire['brotli11'] / 1024:.1f} KB)"
    )
    budget_ok = wire['brotli11'] <= 185 * 1024
    print(f"Brotli-11 Budget (<= 185.0 KB): {'PASS' if budget_ok else 'OVER BUDGET'} ({wire['brotli11'] / 1024:.1f} KB)")
    print('=' * 138 + '\n')
    assert budget_ok, f"Brotli-11 size {wire['brotli11'] / 1024:.1f} KB exceeds 185.0 KB budget!"

    # Publish to public/harbour/flora/vegetation.glb (+ deterministic gzip -9 -n sibling)
    pub_dir = os.path.join(ROOT, 'public', 'harbour', 'flora')
    os.makedirs(pub_dir, exist_ok=True)
    pub_glb = os.path.join(pub_dir, 'vegetation.glb')
    pub_gz = os.path.join(pub_dir, 'vegetation.glb.gz')
    shutil.copyfile(preview_glb, pub_glb)
    with open(pub_glb, 'rb') as fin, open(pub_gz, 'wb') as fout:
        r_gz = subprocess.run(['gzip', '-9', '-n', '-c', pub_glb], capture_output=True, check=True)
        fout.write(r_gz.stdout)
    print(f"Published: {pub_glb} ({os.path.getsize(pub_glb):,} B) & {pub_gz} ({os.path.getsize(pub_gz):,} B)")

    stats_out = dict(
        prototypes=rows,
        totals=dict(
            lod0_bl_verts=tot_bl_v,
            lod0_glb_verts=tot_glb_v,
            lod0_tris=tot_tris,
            lod1_bl_verts=tot_lod_bl_v,
            lod1_glb_verts=tot_lod_glb_v,
            lod1_tris=tot_lod_tris,
            total_tris=tot_tris + tot_lod_tris,
            lod1_ratio=round(tot_lod_tris / max(tot_tris, 1), 3),
            v_per_t=round((tot_glb_v + tot_lod_glb_v) / max(tot_tris + tot_lod_tris, 1), 3),
        ),
        glb_extensions=glb_info['extensions_used'],
        glb_materials=glb_info['materials'],
        sway_component_types=sw_types,
        bytes=dict(raw_unopt=raw_bytes, meshopt=wire['raw'], gzip9=wire['gzip9'], brotli11=wire['brotli11']),
    )
    with open(os.path.join(OUT_DIR, 'vegetation-stats.json'), 'w') as f:
        json.dump(stats_out, f, indent=2)


if __name__ == '__main__':
    main()
