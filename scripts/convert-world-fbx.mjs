// scripts/convert-world-fbx.mjs — convert the NYC pack FBX meshes to glTF2
// with assimp (WASM). FBXLoader in the browser mangles these UE-authored
// meshes' UVs; assimp decodes them correctly. Output: tools/world-src/glb/*.gltf
// Run: node scripts/convert-world-fbx.mjs [file.fbx ...] (default: a test set)
import assimpjs from 'assimpjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const SRC = 'tools/world-src';
const OUT = join(SRC, 'glb');
mkdirSync(OUT, { recursive: true });

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.fbx'));

const ajs = await assimpjs();
let ok = 0, fail = 0;
for (const f of files) {
  try {
    const fileList = new ajs.FileList();
    fileList.AddFile(f, readFileSync(join(SRC, f)));
    const result = ajs.ConvertFileList(fileList, 'gltf2');
    if (!result.IsSuccess() || result.FileCount() === 0) {
      console.error(`FAIL ${f}: ${result.GetErrorCode?.() ?? 'no output'}`);
      fail++;
      continue;
    }
    for (let i = 0; i < result.FileCount(); i++) {
      const rf = result.GetFile(i);
      const name = basename(rf.GetPath());
      const target = name.replace(/\.fbx/i, '').includes(f.replace(/\.fbx$/i, ''))
        ? name
        : `${f.replace(/\.fbx$/i, '')}.${name.split('.').pop()}`;
      let content = Buffer.from(rf.GetContent());
      if (target.endsWith('.gltf')) {
        const json = JSON.parse(content.toString('utf8'));
        // rewrite pack-relative texture URIs to our flattened textures dir
        for (const img of json.images ?? []) {
          if (img.uri) img.uri = '../textures/' + basename(img.uri.replace(/\\/g, '/'));
        }
        // assimp writes buffers as result.bin — we rename per-model, so point
        // the gltf at the renamed buffer
        for (const buf of json.buffers ?? []) {
          if (buf.uri) buf.uri = `${f.replace(/\.fbx$/i, '')}.bin`;
        }
        content = Buffer.from(JSON.stringify(json));
      }
      writeFileSync(join(OUT, target), content);
    }
    console.log(`ok   ${f}`);
    ok++;
  } catch (e) {
    console.error(`FAIL ${f}: ${e.message}`);
    fail++;
  }
}
console.log(`converted ${ok}, failed ${fail} -> ${OUT}`);
