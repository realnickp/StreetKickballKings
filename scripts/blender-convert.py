# scripts/blender-convert.py — headless Blender: convert every pack FBX in
# tools/world-src/ to a GLB with correct geometry + UVs (Blender's FBX importer
# is the reliable path for these UE-authored meshes; browser-side loaders and
# assimp both mangled them). Textures aren't embedded (the FBX reference paths
# don't exist) — the worldbake harness rebinds them by material name.
# Run: blender --background --python scripts/blender-convert.py
import bpy
import glob
import os
import sys

SRC = os.path.abspath('tools/world-src')
OUT = os.path.join(SRC, 'glb')
os.makedirs(OUT, exist_ok=True)

fbx_files = sorted(glob.glob(os.path.join(SRC, '*.fbx')))
ok, fail = 0, 0
for path in fbx_files:
    name = os.path.splitext(os.path.basename(path))[0]
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=path)
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(OUT, name + '.glb'),
            export_format='GLB',
            export_yup=True,
            export_apply=True,   # apply transforms/modifiers
            export_animations=False,
            export_skins=False,
            export_morph=False,
        )
        ok += 1
        print(f'ok   {name}')
    except Exception as e:  # noqa: BLE001 - report and continue
        fail += 1
        print(f'FAIL {name}: {e}', file=sys.stderr)

print(f'converted {ok}, failed {fail} -> {OUT}')
