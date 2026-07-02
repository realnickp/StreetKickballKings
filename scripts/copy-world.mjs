// scripts/copy-world.mjs — copy the NYC pack meshes + textures the world bake
// uses into tools/world-src/ (gitignored). Textures are FLATTENED into one dir
// so FBXLoader.setResourcePath can resolve them by filename.
// Run once per machine: node scripts/copy-world.mjs
import { cpSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

const PACK = 'C:/Unity Projects/KickballGame/Assets/Assets/Gameready3D/NYC_Building';
const DST = 'tools/world-src';
const TEXDST = join(DST, 'textures');

// full buildings for the skyline + street props for the lot
const MESH_DIRS = ['Static_Meshes/Buildings', 'Static_Meshes/Props', 'Static_Meshes/Foliage'];
const TEX_ROOT = join(PACK, 'Textures');

mkdirSync(TEXDST, { recursive: true });
let fbx = 0, tex = 0;
for (const dir of MESH_DIRS) {
  const abs = join(PACK, dir);
  if (!existsSync(abs)) continue;
  for (const f of readdirSync(abs)) {
    if (extname(f).toLowerCase() === '.fbx') { cpSync(join(abs, f), join(DST, f)); fbx++; }
  }
}
// flatten every texture in the pack (recursive) into one dir
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (['.png', '.jpg', '.jpeg', '.tga'].includes(extname(f).toLowerCase())) {
      cpSync(p, join(TEXDST, basename(p)));
      tex++;
    }
  }
})(TEX_ROOT);
console.log(`copied ${fbx} FBX + ${tex} textures -> ${DST}`);
if (!fbx) process.exit(1);
