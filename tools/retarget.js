// tools/retarget.js — dev harness: retarget the Mixamo/UE FBX clips onto EVERY
// Meshy archetype skeleton (each has its OWN rest pose — one bake per archetype,
// a single shared bake distorts the other five), preview per archetype, export
// one animation-only mocap-<arch>.glb per archetype.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import manifest from '../src/data/anims.manifest.json';

const ARCHS = ['locs', 'durag', 'braids', 'bald', 'afro', 'twists'];

const logEl = document.getElementById('log');
const log = (...a) => { logEl.textContent += a.join(' ') + '\n'; logEl.scrollTop = logEl.scrollHeight; console.log(...a); };

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#223');
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(3, 6, 4); scene.add(sun);
scene.add(new THREE.GridHelper(10, 20, 0x445566, 0x334455));
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 3.2); camera.lookAt(0, 1.0, 0);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// Meshy standard rig -> Mixamo source bone names (target -> source).
// NOTE the Meshy spine chain is INVERTED vs Mixamo: Hips -> Spine02 -> Spine01
// -> Spine (chest). Verified from the live bone dump. And 'neck' is lowercase.
const MESHY_TO_MIXAMO = {
  Hips: 'mixamorigHips',
  Spine02: 'mixamorigSpine',
  Spine01: 'mixamorigSpine1',
  Spine: 'mixamorigSpine2',
  neck: 'mixamorigNeck',
  Head: 'mixamorigHead',
  LeftShoulder: 'mixamorigLeftShoulder',
  LeftArm: 'mixamorigLeftArm',
  LeftForeArm: 'mixamorigLeftForeArm',
  LeftHand: 'mixamorigLeftHand',
  RightShoulder: 'mixamorigRightShoulder',
  RightArm: 'mixamorigRightArm',
  RightForeArm: 'mixamorigRightForeArm',
  RightHand: 'mixamorigRightHand',
  LeftUpLeg: 'mixamorigLeftUpLeg',
  LeftLeg: 'mixamorigLeftLeg',
  LeftFoot: 'mixamorigLeftFoot',
  LeftToeBase: 'mixamorigLeftToeBase',
  RightUpLeg: 'mixamorigRightUpLeg',
  RightLeg: 'mixamorigRightLeg',
  RightFoot: 'mixamorigRightFoot',
  RightToeBase: 'mixamorigRightToeBase',
};

// Idle.fbx + SwaggerWalk.fbx in the pack are UNREAL MANNEQUIN rigs (root/pelvis/
// spine_01/clavicle_l), not Mixamo. Same retarget, different name map + hip.
const MESHY_TO_UE = {
  Hips: 'pelvis',
  Spine02: 'spine_01',
  Spine01: 'spine_02',
  Spine: 'spine_03',
  neck: 'neck_01',
  Head: 'head',
  LeftShoulder: 'clavicle_l',
  LeftArm: 'upperarm_l',
  LeftForeArm: 'lowerarm_l',
  LeftHand: 'hand_l',
  RightShoulder: 'clavicle_r',
  RightArm: 'upperarm_r',
  RightForeArm: 'lowerarm_r',
  RightHand: 'hand_r',
  LeftUpLeg: 'thigh_l',
  LeftLeg: 'calf_l',
  LeftFoot: 'foot_l',
  LeftToeBase: 'ball_l',
  RightUpLeg: 'thigh_r',
  RightLeg: 'calf_r',
  RightFoot: 'foot_r',
  RightToeBase: 'ball_r',
};

// child bone used to measure each bone's rest world DIRECTION (for the A/T
// rest alignment). Leaf/ambiguous bones (Hips, Head, hands, toes) stay
// delta-based — their parents carry the big correction.
const CHILD_FOR_DIR = {
  Spine02: 'Spine01', Spine01: 'Spine', Spine: 'neck', neck: 'Head',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
};

// constant corrective rotations (radians, XYZ euler) applied after the delta —
// tune via ?offset=Hips:0.2:0:0,Head:-0.1:0:0
const BONE_OFFSETS = new Map();
for (const spec of (new URLSearchParams(location.search).get('offset') ?? '').split(',').filter(Boolean)) {
  const [bone, x, y, z] = spec.split(':');
  BONE_OFFSETS.set(bone, new THREE.Quaternion().setFromEuler(new THREE.Euler(+x || 0, +y || 0, +z || 0)));
}

// ---------- load FBX sources once (shared across all archetype bakes) ----------
const fbxLoader = new FBXLoader();
const fileCache = new Map();
async function loadSource(file) {
  let src = fileCache.get(file);
  if (src) return src;
  const fbx = await fbxLoader.loadAsync('/tools/anims-src/' + encodeURIComponent(file));
  src = { fbx, clip: fbx.animations[0] };
  fileCache.set(file, src);
  src.isUE = !fbx.getObjectByName('mixamorigHips') && !!fbx.getObjectByName('pelvis');
  src.hipName = src.isUE ? 'pelvis' : 'mixamorigHips';
  const srcHips = fbx.getObjectByName(src.hipName);
  src.hipY = srcHips ? srcHips.getWorldPosition(new THREE.Vector3()).y || srcHips.position.y : 100;
  // capture the source REST pose now — sampling poses the rig, and cached
  // files are reused for a second clip name
  src.restQ = {};
  src.restWorldQ = {};
  src.restWorldPos = {};
  fbx.updateMatrixWorld(true);
  fbx.traverse((o) => {
    if (o.isBone) {
      src.restQ[o.name] = o.quaternion.clone();
      src.restWorldQ[o.name] = o.getWorldQuaternion(new THREE.Quaternion());
      src.restWorldPos[o.name] = o.getWorldPosition(new THREE.Vector3());
    }
  });
  src.hipRestPos = srcHips ? srcHips.position.clone() : new THREE.Vector3();
  log(`loaded ${file}: ${src.clip.duration.toFixed(2)}s, hipY ${src.hipY.toFixed(1)}${src.isUE ? ' [UE rig]' : ''}`);
  return src;
}

/**
 * WORLD-orientation retarget with per-bone rest compensation — the standard
 * approach: C = sRestWorld^-1 * tRestWorld per bone; each frame the target
 * bone's world orientation = sourceWorld(t) * C (rest maps exactly to rest,
 * world motion maps to world motion), converted to target-local by walking the
 * target hierarchy top-down. Fixes the arms-trailing/lean-back artifacts the
 * local-delta transplant produced on mismatched shoulder/spine frames.
 * Hips position: tRest + (source delta * hip-height ratio), horizontal zeroed
 * for inPlace clips (the GAME moves characters).
 */
function retargetWorld(entry, src, rig) {
  const fps = 30;
  let start = 0;
  let dur = src.clip.duration;
  if (entry.trim) { start = entry.trim[0]; dur = Math.min(dur, entry.trim[1]) - start; }
  const frames = Math.max(2, Math.round(dur * fps) + 1);

  const names = src.isUE ? MESHY_TO_UE : MESHY_TO_MIXAMO;
  const sBones = {};
  src.fbx.traverse((o) => { if (o.isBone) sBones[o.name] = o; });

  // per mapped target bone: the rest-frame conversion
  //   C = sRestW^-1 * R * tRestW, with R aligning the TARGET bone's rest world
  // DIRECTION onto the SOURCE's (A-pose arm -> T-pose arm). Without R the copy
  // is delta-based and the A/T arm difference over-rotates arms into the body.
  const conv = new Map(); // tName -> {sBone, C}
  for (const [tName, sName] of Object.entries(names)) {
    const sBone = sBones[sName];
    const sRestW = src.restWorldQ[sName];
    const tRestW = rig.restWorldQ[tName];
    if (!sBone || !sRestW || !tRestW) continue;
    const R = new THREE.Quaternion();
    const tChild = CHILD_FOR_DIR[tName];
    const sChild = tChild ? names[tChild] : null;
    if (tChild && sChild && rig.restWorldPos[tChild] && src.restWorldPos[sChild]) {
      const tDir = rig.restWorldPos[tChild].clone().sub(rig.restWorldPos[tName]).normalize();
      const sDir = src.restWorldPos[sChild].clone().sub(src.restWorldPos[sName]).normalize();
      if (tDir.lengthSq() > 0.5 && sDir.lengthSq() > 0.5) R.setFromUnitVectors(tDir, sDir);
    }
    const C = sRestW.clone().invert().multiply(R).multiply(tRestW);
    conv.set(tName, { sBone, C });
  }
  const sHips = sBones[src.hipName];
  const scale = rig.hipY / (src.hipY || 100);

  const mixer = new THREE.AnimationMixer(src.fbx);
  const action = mixer.clipAction(src.clip);
  action.play();
  mixer.update(start); // jump to trim start

  const times = new Float32Array(frames);
  const trackIdx = new Map([...conv.keys()].map((n, i) => [n, i]));
  const quatData = [...conv.keys()].map(() => new Float32Array(frames * 4));
  const posData = new Float32Array(frames * 3);
  const dt = dur / (frames - 1);
  const sW = new THREE.Quaternion(), tW = new THREE.Quaternion(),
    local = new THREE.Quaternion(), parentInv = new THREE.Quaternion();
  const worldQ = new Map(); // this frame's target world quats, by bone name

  for (let f = 0; f < frames; f++) {
    times[f] = f * dt;
    src.fbx.updateMatrixWorld(true); // mixer wrote locals; refresh world matrices

    // walk the target skeleton top-down (rig.order is parents-first)
    worldQ.clear();
    for (const b of rig.order) {
      const parentW = worldQ.get(b.parentName) ?? b.parentRestW; // Armature etc: rest
      const c = conv.get(b.name);
      if (c) {
        c.sBone.getWorldQuaternion(sW);
        tW.copy(sW).multiply(c.C);
        local.copy(parentInv.copy(parentW).invert()).multiply(tW);
        const off = BONE_OFFSETS.get(b.name);
        if (off) local.multiply(off);
        local.toArray(quatData[trackIdx.get(b.name)], f * 4);
        worldQ.set(b.name, tW.clone());
      } else {
        worldQ.set(b.name, parentW.clone().multiply(b.restLocalQ));
      }
    }

    if (sHips) {
      const dx = (sHips.position.x - src.hipRestPos.x) * scale;
      const dy = (sHips.position.y - src.hipRestPos.y) * scale;
      const dz = (sHips.position.z - src.hipRestPos.z) * scale;
      const inPlace = !!entry.inPlace;
      posData[f * 3 + 0] = rig.hipRestPos.x + (inPlace ? 0 : dx);
      posData[f * 3 + 1] = rig.hipRestPos.y + dy;
      posData[f * 3 + 2] = rig.hipRestPos.z + (inPlace ? 0 : dz);
    }
    if (f < frames - 1) mixer.update(dt);
  }
  mixer.uncacheClip(src.clip);

  const tracks = [...conv.keys()].map((n) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, quatData[trackIdx.get(n)]));
  if (sHips) tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, posData));
  return new THREE.AnimationClip(entry.name, dur, tracks);
}

// ---------- bake every archetype ----------
const rigs = new Map();      // arch -> {gltf, restQ, hipY, hipRestPos, clips}
for (const arch of ARCHS) {
  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(`/assets/models/archetypes/arch-${arch}.glb`);
  } catch (e) {
    log(`SKIP arch-${arch}: ${e.message ?? e}`);
    continue;
  }
  const rig = { gltf, restQ: {}, restWorldQ: {}, restWorldPos: {}, order: [], hipRestPos: new THREE.Vector3(), clips: [] };
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isBone) return;
    rig.restQ[o.name] = o.quaternion.clone();
    rig.restWorldQ[o.name] = o.getWorldQuaternion(new THREE.Quaternion());
    rig.restWorldPos[o.name] = o.getWorldPosition(new THREE.Vector3());
    // hierarchy walk data: traverse() is DFS, so parents always precede children
    rig.order.push({
      name: o.name,
      parentName: o.parent?.isBone ? o.parent.name : null,
      // non-bone parents (Armature) never animate — use their rest world quat
      parentRestW: o.parent?.isBone ? null : o.parent.getWorldQuaternion(new THREE.Quaternion()),
      restLocalQ: o.quaternion.clone(),
    });
  });
  const hips = gltf.scene.getObjectByName('Hips');
  rig.hipRestPos.copy(hips.position);
  rig.hipY = hips.getWorldPosition(new THREE.Vector3()).y;
  for (const entry of manifest) {
    const src = await loadSource(entry.file);
    rig.clips.push(retargetWorld(entry, src, rig));
  }
  rigs.set(arch, rig);
  log(`baked ${rig.clips.length} clips for arch-${arch} (hip restY ${rig.hipY.toExponential(2)})`);
}
log(`DONE: ${rigs.size} archetypes baked`);

// ---------- preview (one archetype at a time; ARCH buttons swap the model) ----------
let previewArch = null, target = null, wrapper = null, mixer = null, active = null;
function showArch(arch) {
  const rig = rigs.get(arch);
  if (!rig) return;
  if (wrapper) scene.remove(wrapper);
  previewArch = arch;
  target = rig.gltf.scene;
  const box = new THREE.Box3().setFromObject(target);
  const size = new THREE.Vector3(); box.getSize(size);
  wrapper = new THREE.Group();
  wrapper.scale.setScalar(2.0 / (size.y || 1));
  wrapper.add(target);
  scene.add(wrapper);
  mixer = new THREE.AnimationMixer(target);
  active = null;
  document.title = `retarget: ${arch}`;
}
function play(name) {
  const rig = rigs.get(previewArch);
  const clip = rig.clips.find((c) => c.name === name);
  const entry = manifest.find((m) => m.name === name);
  const action = mixer.clipAction(clip);
  action.reset();
  action.timeScale = entry.rate ?? 1;
  action.setLoop(entry.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = true;
  if (active && active !== action) active.crossFadeTo(action, 0.15, false);
  action.play();
  active = action;
  document.title = `retarget: ${previewArch} ${name}`;
}
window.__play = play;
window.__showArch = showArch;
window.__rigs = rigs;

const ui = document.getElementById('ui');
for (const arch of rigs.keys()) {
  const b = document.createElement('button');
  b.textContent = arch.toUpperCase(); b.style.background = '#36c';
  b.onclick = () => { showArch(arch); play('idle'); };
  ui.appendChild(b);
}
ui.appendChild(document.createElement('br'));
for (const m of manifest) {
  const b = document.createElement('button');
  b.textContent = m.name; b.onclick = () => play(m.name);
  ui.appendChild(b);
}
const slow = document.createElement('button');
slow.textContent = 'SLOW x0.25'; let slowOn = false;
slow.onclick = () => { slowOn = !slowOn; slow.textContent = slowOn ? 'SPEED x1' : 'SLOW x0.25'; };
ui.appendChild(slow);

// ---------- export: one animation-only GLB per archetype ----------
function exportArch(arch) {
  return new Promise((resolve) => {
    const rig = rigs.get(arch);
    let skin = null;
    rig.gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !skin) skin = o; });
    let rootBone = skin.skeleton.bones[0];
    while (rootBone.parent && rootBone.parent.isBone) rootBone = rootBone.parent;
    // restore rest before cloning so the exported skeleton carries the rest pose
    rig.gltf.scene.traverse((o) => {
      if (o.isBone && rig.restQ[o.name]) o.quaternion.copy(rig.restQ[o.name]);
    });
    const exportRoot = new THREE.Group();
    exportRoot.name = `mocap-rig-${arch}`;
    exportRoot.add(SkeletonUtils.clone(rootBone));
    new GLTFExporter().parse(
      exportRoot,
      async (buf) => {
        // POST to the dev sink (node scripts/anim-upload-server.mjs) — Chrome
        // silently blocks repeated automatic downloads, uploads are reliable.
        try {
          const r = await fetch(`http://localhost:5199/save?name=mocap-${arch}.glb`, { method: 'POST', body: buf });
          log(`saved mocap-${arch}.glb (${(buf.byteLength / 1024).toFixed(0)} KB) -> ${await r.text()}`);
        } catch (e) {
          log(`UPLOAD FAILED ${arch} (is the sink running?):`, e.message ?? e);
        }
        resolve();
      },
      (e) => { log('EXPORT ERROR', arch, e); resolve(); },
      { binary: true, animations: rig.clips },
    );
  });
}
// one export button per archetype — Chrome blocks automatic multi-downloads,
// so each needs its own user gesture
for (const arch of rigs.keys()) {
  const b = document.createElement('button');
  b.textContent = `EXPORT ${arch}`; b.style.background = '#e63';
  b.onclick = () => exportArch(arch);
  ui.appendChild(b);
}

// ---------- loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  if (mixer) mixer.update(clock.getDelta() * (slowOn ? 0.25 : 1));
  renderer.render(scene, camera);
});
showArch(rigs.keys().next().value);
play('idle');
