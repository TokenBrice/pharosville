"""Export a hand-editable PharosVille .blend to a raw GLB.

    blender -b --factory-startup -noaudio <source.blend> \
      --python scripts/pharosville/blender/export-glb.py -- <out.glb>

The .blend is the source of truth and is never modified or saved here. Only
the objects in its collection named "Export" are written. Images are embedded
as JPEG; meshopt compression and budgets are applied by compile-garden-assets.
"""
import sys
import bpy

out = sys.argv[sys.argv.index("--") + 1]
collection = bpy.data.collections.get("Export")
if collection is None:
    raise SystemExit("Source .blend has no collection named 'Export'.")
missing = []
for image in bpy.data.images:
    if image.users and image.source == "FILE" and not image.packed_file:
        image.reload()
        if image.size[0] == 0:
            missing.append(image.filepath)
if missing:
    raise SystemExit(f"Unresolved images (run `node scripts/pharosville/fetch-kit.mjs`?): {sorted(set(missing))}")
bpy.ops.object.select_all(action="DESELECT")
for obj in collection.all_objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_extras=True,
    export_image_format="JPEG",
    export_jpeg_quality=90,
    export_tangents=True,
    export_cameras=False,
    export_lights=False,
    export_animations=False,
    export_skins=False,
    export_morph=False,
)
