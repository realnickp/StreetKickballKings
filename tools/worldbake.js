// tools/worldbake.js — assemble the Blacktop's NYC surroundings offline.
// Buildings are TEXTURED BOXES using the pack's real facade atlases (the
// pack's FBX meshes decode with broken UVs in FBXLoader — the textures are the
// valuable part, and boxes give us full UV control + ~6 draw calls total).
// Preview with orbit -> EXPORT one merged glb to the sink (:5199).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const logEl = document.getElementById('log');
const log = (...a) => { logEl.textContent += a.join(' ') + '\n'; logEl.scrollTop = logEl.scrollHeight; console.log(...a); };

// ---------- scene + dusk preview lighting ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2b3350');
scene.add(new THREE.HemisphereLight(0xffd9b0, 0x2e3a55, 0.75));
const sun = new THREE.DirectionalLight(0xffB070, 1.6);
sun.position.set(-40, 18, 30);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 30, 90);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 8, -40);
// field footprint reference: fence ring at 42m
const ring = new THREE.Mesh(new THREE.TorusGeometry(42, 0.15, 6, 64), new THREE.MeshBasicMaterial({ color: '#3ec6b5' }));
ring.rotation.x = Math.PI / 2;
scene.add(ring);
scene.add(new THREE.GridHelper(160, 32, 0x334455, 0x223344));

// ---------- facade materials from the pack's atlases ----------
const texLoader = new THREE.TextureLoader();
async function facade(file, tint = '#ffffff') {
  const t = await texLoader.loadAsync('/tools/world-src/textures/' + file);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, color: tint, metalness: 0, roughness: 0.92 });
}
// each entry: material + how many meters one texture repeat covers (w, h).
// Window-grid atlases only — they read as REAL buildings; the plain-wall
// atlases tile like wallpaper. Tints vary the same atlas between buildings.
const FACADES = {
  windowA: { mat: await facade('T_WindowWall_A_BaseMap.png'), tileW: 7, tileH: 7 },
  windowA2: { mat: await facade('T_WindowWall_A_BaseMap.png', '#d8a082'), tileW: 7, tileH: 7 },
  windowB: { mat: await facade('T_WindowWall_B_BaseMap.png'), tileW: 8, tileH: 8 },
  windowB2: { mat: await facade('T_WindowWall_B_BaseMap.png', '#c0b8a8'), tileW: 8, tileH: 8 },
  windowC: { mat: await facade('T_WindowWall_C_BaseMap.png'), tileW: 7.5, tileH: 7.5 },
  windowC2: { mat: await facade('T_WindowWall_C_BaseMap.png', '#e0b890'), tileW: 7.5, tileH: 7.5 },
};
const ROOF = new THREE.MeshStandardMaterial({ color: '#3a3632', metalness: 0, roughness: 1 });
log('facade atlases loaded');

// ---------- building layout: arc behind the fence (outfield = -z) ----------
// {x, z, rotY, w, d, h, f: facade key}
const BUILDINGS = [
  // front row
  { x: -38, z: -54, rotY: 0.6, w: 20, d: 14, h: 18, f: 'windowA' },
  { x: -15, z: -60, rotY: 0.12, w: 22, d: 15, h: 23, f: 'windowA2' },
  { x: 10, z: -61, rotY: -0.08, w: 20, d: 14, h: 17, f: 'windowB' },
  { x: 34, z: -55, rotY: -0.55, w: 21, d: 15, h: 21, f: 'windowB2' },
  { x: -57, z: -33, rotY: 1.0, w: 18, d: 13, h: 15, f: 'windowB2' },
  { x: 57, z: -33, rotY: -1.0, w: 18, d: 13, h: 16, f: 'windowA2' },
  // second row (taller, peeking over for parallax)
  { x: -30, z: -80, rotY: 0.3, w: 26, d: 16, h: 30, f: 'windowB' },
  { x: 2, z: -84, rotY: 0, w: 24, d: 16, h: 26, f: 'windowA2' },
  { x: 32, z: -80, rotY: -0.3, w: 25, d: 16, h: 32, f: 'windowA' },
  { x: -62, z: -62, rotY: 0.7, w: 22, d: 15, h: 24, f: 'windowA' },
  { x: 62, z: -62, rotY: -0.7, w: 22, d: 15, h: 22, f: 'windowB2' },
  // side streets (foul-line flanks, closer + lower)
  { x: -52, z: -6, rotY: 1.35, w: 16, d: 12, h: 12, f: 'windowA2' },
  { x: 52, z: -6, rotY: -1.35, w: 16, d: 12, h: 13, f: 'windowB' },
];

/** box with per-face UVs scaled so the facade tiles at real-world size */
function buildingGeometry(w, d, h, tileW, tileH) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x -x (d,h) | +y -y (w,d roof) | +z -z (w,h)
  const scales = [
    [d / tileW, h / tileH], [d / tileW, h / tileH],
    [w / 8, d / 8], [w / 8, d / 8],
    [w / tileW, h / tileH], [w / tileW, h / tileH],
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = scales[face];
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  return g;
}

// place: collect geoms per material (sides) + roof geoms
const byMaterial = new Map(); // key -> {material, geoms: []}
function push(key, material, geom) {
  if (!byMaterial.has(key)) byMaterial.set(key, { material, geoms: [] });
  byMaterial.get(key).geoms.push(geom);
}
const preview = new THREE.Group();
scene.add(preview);

for (const b of BUILDINGS) {
  const spec = FACADES[b.f];
  const g = buildingGeometry(b.w, b.d, b.h, spec.tileW, spec.tileH);
  const m4 = new THREE.Matrix4()
    .makeRotationY(b.rotY)
    .setPosition(b.x, b.h / 2, b.z);
  g.applyMatrix4(m4);
  // split side faces vs roof faces into separate geoms (merge by material)
  const side = g.clone(); side.clearGroups(); // whole box under facade material
  push(b.f, spec.mat, side);
  // roof cap: a thin dark box lid so the stretched facade top never shows
  const lid = new THREE.BoxGeometry(b.w + 0.4, 0.5, b.d + 0.4);
  lid.applyMatrix4(new THREE.Matrix4().makeRotationY(b.rotY).setPosition(b.x, b.h + 0.2, b.z));
  push('roof', ROOF, lid);
}

// preview the merged result exactly as it will export
function buildMerged() {
  const out = new THREE.Group();
  out.name = 'blacktop-world';
  for (const { material, geoms } of byMaterial.values()) {
    const merged = BufferGeometryUtils.mergeGeometries(geoms.map((g) => g.clone()), false);
    if (!merged) continue;
    out.add(new THREE.Mesh(merged, material));
  }
  return out;
}
preview.add(buildMerged());
log(`buildings: ${BUILDINGS.length}, draw calls: ${byMaterial.size}`);

// ---------- export ----------
const ui = document.getElementById('ui');
const exp = document.createElement('button');
exp.textContent = 'EXPORT world-blacktop.glb'; exp.style.background = '#e63';
exp.onclick = () => {
  new GLTFExporter().parse(
    buildMerged(),
    async (buf) => {
      try {
        const r = await fetch('http://localhost:5199/save?name=world-blacktop.glb', { method: 'POST', body: buf });
        log(`saved world-blacktop.glb (${(buf.byteLength / 1048576).toFixed(1)} MB) -> ${await r.text()}`);
      } catch (e) { log('UPLOAD FAILED (is the sink running?):', e.message ?? e); }
    },
    (e) => log('EXPORT ERROR', e),
    { binary: true, maxTextureSize: 1024 },
  );
};
ui.appendChild(exp);

const pov = document.createElement('button');
pov.textContent = 'HOME PLATE VIEW';
pov.onclick = () => { camera.position.set(0, 3, 8); controls.target.set(0, 8, -42); };
ui.appendChild(pov);

window.__scene = scene;
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
