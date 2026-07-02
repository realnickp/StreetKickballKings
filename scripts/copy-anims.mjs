// scripts/copy-anims.mjs — copy the 17 Mixamo FBX from the Unity project into
// tools/anims-src/ (gitignored) so the Vite dev server can serve them to the
// retarget harness. Run once per machine: node scripts/copy-anims.mjs
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'C:/Unity Projects/KickballGame/Assets/GangsPack01/Animations';
const DST = 'tools/anims-src';
const FILES = [
  'Breathing Idle.fbx', 'Idle.fbx', 'Goalkeeper Idle.fbx', 'Running.fbx',
  'Jog Strafe Left.fbx', 'Jog Strafe Right.fbx', 'Strike Foward Jog.fbx',
  'Throwing.fbx', 'Goalie Throw.fbx', 'Baseball Catcher.fbx',
  'Running Slide.fbx', 'Left Strafe.fbx', 'Defeated.fbx',
  'Walking.fbx', 'SwaggerWalk.fbx',
  'Hip Hop Dancing.fbx', 'Hip Hop Dancing (1).fbx', 'Victory.fbx',
];

mkdirSync(DST, { recursive: true });
let ok = 0;
for (const f of FILES) {
  const src = join(SRC, f);
  if (!existsSync(src)) { console.error(`MISSING: ${src}`); continue; }
  cpSync(src, join(DST, f));
  ok++;
}
console.log(`copied ${ok}/${FILES.length} clips -> ${DST}`);
if (ok !== FILES.length) process.exit(1);
