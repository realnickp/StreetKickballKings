// tools/worldbake.js — assemble the Blacktop's NYC surroundings offline from
// the pack's REAL meshes (converted FBX -> glTF by scripts/convert-world-fbx.mjs;
// assimp preserves the multi-UV channels FBXLoader mangled). Full 360 surround.
// Preview with orbit -> EXPORT one merged glb to the sink (:5199).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
scene.add(new THREE.HemisphereLight(0xffd9b0, 0x2e3a55, 0.9));
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
scene.add(new THREE.GridHelper(180, 36, 0x334455, 0x223344));

// ---------- LAYOUT: full 360 surround (field center=origin, outfield=-z,
// home plate ~z=0..+2, camera behind home looks toward -z). ------------------
const B = (file, x, z, rotY = 0, targetH = 18) => ({ file, x, z, rotY, targetH });
const P = (file, x, z, rotY = 0, targetH = 1.4) => ({ file, x, z, rotY, targetH });
const LAYOUT = [
  // ---- outfield arc (front row) ----
  B('SM_Building_A', -38, -54, 0.6, 18),
  B('SM_Building_B', -14, -60, 0.12, 22),
  B('SM_Building_C', 11, -60, -0.1, 17),
  B('SM_Building_D', 35, -54, -0.55, 20),
  B('SM_Building_E', -58, -32, 1.0, 16),
  B('SM_Building_F', 58, -32, -1.0, 17),
  // ---- second row (parallax) ----
  B('SM_Building_G_V1', -30, -82, 0.3, 26),
  B('SM_Building_E_V2', 2, -86, 0, 24),
  B('SM_Building_F_V2', 33, -82, -0.3, 28),
  B('SM_Building_A', -62, -62, 0.7, 24),
  B('SM_Building_G_V2', 62, -62, -0.7, 23),
  // ---- foul-line flanks ----
  B('SM_Building_C', -54, 2, 1.35, 13),
  B('SM_Building_B', 54, 2, -1.35, 14),
  // ---- BEHIND HOME (the pitcher's view!) ----
  B('SM_Building_D', -26, 34, 2.6, 15),
  B('SM_Building_A', 2, 40, 3.14, 17),
  B('SM_Building_E', 28, 34, -2.6, 14),
  // ---- street props ----
  P('SM_Dumpster_V1', -30, -39, 0.4, 1.5),
  P('SM_Dumpster_V2', 33, -37, -0.7, 1.5),
  P('SM_Fire_Hydrant', -13.5, 4, 0, 0.9),
  P('SM_Mailbox', 14.5, 3.5, -0.4, 1.3),
  P('SM_Cardboardboxes', -36, -20, 0.9, 1.0),
  P('SM_Barricade_Fence', 29, -20, 1.2, 1.1),
  P('SM_Big_BillBoard_A', 0, -70, 0, 12),
  P('SM_Traffic_Lights', -44, -12, 0.8, 5.5),
  P('SM_Tree_A', -46, -22, 0, 7) ,
  P('SM_Tree_A', 47, -24, 1.2, 6.5),
];

// ---------- load + place ----------
const loader = new GLTFLoader();
const cache = new Map();
const placed = new THREE.Group();
scene.add(placed);

// Blender GLBs carry correct geometry/UVs but no textures (the FBX texture
// paths never existed on disk). Rebind by material name: M_Walls_A pairs with
// T_Walls_A_BaseMap.png. Stragglers with quirky names get explicit aliases.
const TEX_ALIASES = {
  M_pipe: 'T_Pipes_A',
  M_Window_Ac_C: 'T_AC_C',
  M_Door_Window_D: 'T_Door_&_Window_D',
  M_Roof_D: 'T_Roof_C',
  M_Dumpster_V1: 'T_Dumpster_V1_A',
  M_Dumpster_V2: 'T_Dumpster_V2_A',
  M_Big_Billboard: 'T_BillBoard_A',
};
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
async function facadeTexture(matName) {
  const stem = TEX_ALIASES[matName] ?? matName.replace(/^M_/, 'T_');
  if (texCache.has(stem)) return texCache.get(stem);
  let found = null;
  for (const file of [`${stem}_BaseMap.png`, `${stem}_BaseColor.png`, `${stem}_Color.png`, `${stem}.png`]) {
    try {
      const t = await texLoader.loadAsync('/tools/world-src/textures/' + encodeURIComponent(file));
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.flipY = false; // glTF convention (geometry UVs are glTF-style)
      found = t;
      break;
    } catch { /* try next */ }
  }
  texCache.set(stem, found);
  return found;
}

/** downscale any texture image to <=1024 so the export stays phone-sized */
function shrinkTexture(tex) {
  const img = tex.image;
  if (!img || !img.width || Math.max(img.width, img.height) <= 1024) return;
  const s = 1024 / Math.max(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  tex.image = c;
  tex.needsUpdate = true;
}

for (const item of LAYOUT) {
  let base = cache.get(item.file);
  if (!base) {
    try {
      base = (await loader.loadAsync(`/tools/world-src/glb/${item.file}.glb`)).scene;
      // rebuild every material as albedo-only with the rebound pack texture;
      // glass panes go translucent-tinted
      const jobs = [];
      base.traverse((o) => {
        if (!o.isMesh) return;
        for (const a of ['color', 'tangent']) o.geometry.deleteAttribute(a);
        const src = o.material;
        if (/glass/i.test(src.name)) {
          o.material = new THREE.MeshStandardMaterial({
            name: src.name, color: '#6c86a8', transparent: true, opacity: 0.5,
            metalness: 0.2, roughness: 0.2,
          });
          return;
        }
        const m = new THREE.MeshStandardMaterial({
          name: src.name, color: '#ffffff', metalness: 0, roughness: 0.9,
        });
        jobs.push(facadeTexture(src.name).then((t) => {
          if (t) { m.map = t; m.needsUpdate = true; }
          else { m.color.set('#8a8078'); log(`NO TEXTURE for ${src.name}`); }
        }));
        o.material = m;
      });
      await Promise.all(jobs);
      cache.set(item.file, base);
      log(`loaded ${item.file}`);
    } catch (e) { log(`SKIP ${item.file}: ${e.message ?? e}`); continue; }
  }
  const src = base.clone(true);
  // stand up Z-up exports if needed, then normalize to real-world height
  let box = new THREE.Box3().setFromObject(src);
  let size = new THREE.Vector3(); box.getSize(size);
  const inst = new THREE.Group();
  if (size.z > size.y * 1.4) src.rotation.x = -Math.PI / 2;
  inst.add(src);
  inst.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(inst);
  box.getSize(size);
  inst.scale.setScalar(item.targetH / (size.y || 1));
  inst.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(inst);
  inst.position.set(item.x, -box2.min.y, item.z);
  inst.rotation.y = item.rotY;
  placed.add(inst);
}
placed.updateMatrixWorld(true);

// texture shrink + material sanity + collect geometry by material
const byMaterial = new Map(); // material.uuid -> {material, geoms: []}
placed.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  if (m.map) { shrinkTexture(m.map); m.map.colorSpace = THREE.SRGBColorSpace; }
  m.metalness = Math.min(m.metalness ?? 0, 0.2);
  m.roughness = Math.max(m.roughness ?? 0.9, 0.6);
  const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
  // dedupe by material NAME + texture source (Building_A and _B both carry
  // an M_Walls_A instance of the same png -> one draw call, not two)
  const key = `${m.name}|${m.map?.image?.src ?? m.map?.image?.currentSrc ?? 'flat'}|${'#' + m.color.getHexString()}`;
  if (!byMaterial.has(key)) byMaterial.set(key, { material: m, geoms: [] });
  byMaterial.get(key).geoms.push(g);
});
log(`unique materials: ${byMaterial.size}`);

function buildMerged() {
  const out = new THREE.Group();
  out.name = 'blacktop-world';
  let calls = 0;
  for (const { material, geoms } of byMaterial.values()) {
    let merged = null;
    try { merged = BufferGeometryUtils.mergeGeometries(geoms, false); } catch { /* mixed attrs */ }
    if (merged) { out.add(new THREE.Mesh(merged, material)); calls++; }
    else for (const g of geoms) { out.add(new THREE.Mesh(g, material)); calls++; }
  }
  log(`merged draw calls: ${calls}`);
  return out;
}
const preview = buildMerged();
scene.add(preview);
placed.visible = false; // preview EXACTLY what exports

// ---------- export ----------
const ui = document.getElementById('ui');
const exp = document.createElement('button');
exp.textContent = 'EXPORT world-blacktop.glb'; exp.style.background = '#e63';
exp.onclick = () => {
  new GLTFExporter().parse(
    preview,
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
const pitcherPov = document.createElement('button');
pitcherPov.textContent = 'PITCHER VIEW';
pitcherPov.onclick = () => { camera.position.set(0, 5, -19); controls.target.set(0, 4, 30); };
ui.appendChild(pitcherPov);

window.__scene = scene;
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
