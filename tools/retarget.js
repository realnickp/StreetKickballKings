// tools/retarget.js — dev harness: retarget the Mixamo FBX clips onto the
// Meshy archetype skeleton, preview each clip, export animation-only mocap.glb.
// r184 SkeletonUtils.retargetClip facts (verified against the installed source):
//   - options.names maps TARGET bone name -> SOURCE bone name
//   - options.hip is the SOURCE hip bone name; its translation is scaled by options.scale
//   - options.trim = [startSec, endSec]
//   - source must expose .skeleton (SkinnedMesh) or be a THREE.Skeleton (auto-wrapped)
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import manifest from '../src/data/anims.manifest.json';

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

// ---------- target rig (Meshy archetype) ----------
const gltf = await new GLTFLoader().loadAsync('/assets/models/archetypes/arch-locs.glb');
const target = gltf.scene;

// RETARGET RIG: a detached, UNSCALED clone. Retargeting against a rig inside a
// scaled preview wrapper mixes scaled/unscaled world matrices -> exploded mesh.
// Clips bind by bone NAME, so what we bake here plays on the preview rig too.
// NOTE: do NOT call skeleton.pose() — Meshy GLBs load already in bind pose, and
// pose() rewrites bone LOCAL positions in bind/geometry units (x100 mismatch vs
// the node hierarchy) which mangles the mesh once clips animate. Learned live.
const retargetRoot = SkeletonUtils.clone(gltf.scene);
let retargetSkin = null;
retargetRoot.traverse((o) => { if (o.isSkinnedMesh && !retargetSkin) retargetSkin = o; });
retargetRoot.updateMatrixWorld(true);

let targetSkin = null;
target.traverse((o) => { if (o.isSkinnedMesh && !targetSkin) targetSkin = o; });
// normalize to ~2m so we can SEE it (Meshy native is ~0.0185 tall)
const box = new THREE.Box3().setFromObject(target);
const size = new THREE.Vector3(); box.getSize(size);
const wrapper = new THREE.Group();
wrapper.scale.setScalar(2.0 / (size.y || 1));
wrapper.add(target);
scene.add(wrapper);

// dump the REAL bone names — MESHY_TO_MIXAMO below must match this list
log('--- target bones ---');
const targetBoneNames = [];
target.traverse((o) => { if (o.isBone) { targetBoneNames.push(o.name); log('  ', o.name); } });

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
const unmapped = targetBoneNames.filter((n) => !MESHY_TO_MIXAMO[n]);
if (unmapped.length) log('UNMAPPED target bones (ok if fingers/twist helpers):', unmapped.join(', '));

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

// ---------- retarget every manifest clip ----------
const fbxLoader = new FBXLoader();
const clips = [];            // retargeted, renamed to manifest name
const fileCache = new Map(); // file -> {source, clip}

const targetHips = retargetRoot.getObjectByName('Hips');

// capture the retarget rig's rest pose ONCE (each retargetClip leaves it posed,
// which drifted the hip-height measurement clip over clip)
const rest = [];
retargetRoot.traverse((o) => {
  if (o.isBone) rest.push({ b: o, p: o.position.clone(), q: o.quaternion.clone() });
});
function restoreRest() {
  for (const r of rest) { r.b.position.copy(r.p); r.b.quaternion.copy(r.q); }
  retargetRoot.updateMatrixWorld(true);
}
retargetRoot.updateMatrixWorld(true);
const tHipY = targetHips ? targetHips.getWorldPosition(new THREE.Vector3()).y : size.y * 0.5;
log(`target hip rest worldY: ${tHipY.toExponential(3)}`);

/**
 * Rest-relative LOCAL delta retarget — the same math GlbCodeAnimator proved on
 * these exact rigs: targetLocal(t) = targetRest * (sourceRest^-1 * sourceLocal(t)).
 * SkeletonUtils.retargetClip's world-matrix transplant folded the waist/legs on
 * the A-pose(Meshy) vs T-pose(Mixamo) mismatch; local deltas can't do that.
 * Hips position: rest + (source delta * scale), horizontal zeroed for inPlace.
 */
// Bones using joint-space deltas instead of parent-space. Hips is the verified
// default (fixes the whole-body yaw offset); arms/legs read best in parent
// space. Override for A/B testing via ?jointspace=Bone,Bone.
const JOINT_SPACE_BONES = new Set(
  (new URLSearchParams(location.search).get('jointspace') ?? 'Hips').split(',').filter(Boolean),
);
// constant corrective rotations (radians, XYZ euler) applied after the delta —
// tune via ?offset=Hips:0.2:0:0,Head:-0.1:0:0
const BONE_OFFSETS = new Map();
for (const spec of (new URLSearchParams(location.search).get('offset') ?? '').split(',').filter(Boolean)) {
  const [bone, x, y, z] = spec.split(':');
  BONE_OFFSETS.set(bone, new THREE.Quaternion().setFromEuler(new THREE.Euler(+x || 0, +y || 0, +z || 0)));
}

function retargetLocalDelta(entry, src, opts) {
  const fps = 30;
  let start = 0;
  let dur = src.clip.duration;
  if (entry.trim) { start = entry.trim[0]; dur = Math.min(dur, entry.trim[1]) - start; }
  const frames = Math.max(2, Math.round(dur * fps) + 1);

  // source rig: capture rest, then sample the clip with a throwaway mixer
  const srcRoot = src.fbx;
  const sBones = {};
  srcRoot.traverse((o) => { if (o.isBone) sBones[o.name] = o; });
  const names = opts.names;
  const pairs = []; // {tBone, sBone, tRestQ, sRestQinv}
  for (const [tName, sName] of Object.entries(names)) {
    const tBone = retargetRoot.getObjectByName(tName);
    const sBone = sBones[sName];
    if (tBone && sBone) pairs.push({ tName, sBone, tRestQ: tBone.quaternion.clone(), sRestQ: src.restQ[sName].clone() });
  }
  const sHips = sBones[opts.hip];
  const tHipsBone = retargetRoot.getObjectByName('Hips');
  const sHipsRestPos = src.hipRestPos; // captured at load, before any sampling
  const tHipsRestPos = tHipsBone.position.clone();

  const mixer = new THREE.AnimationMixer(srcRoot);
  const action = mixer.clipAction(src.clip);
  action.play();
  mixer.update(start); // jump to trim start

  const times = new Float32Array(frames);
  const quatData = pairs.map(() => new Float32Array(frames * 4));
  const posData = new Float32Array(frames * 3);
  const dq = new THREE.Quaternion(), inv = new THREE.Quaternion();
  const dt = dur / (frames - 1);

  for (let f = 0; f < frames; f++) {
    times[f] = f * dt;
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      inv.copy(p.sRestQ).invert();
      if (JOINT_SPACE_BONES.has(p.tName)) {
        // (A) joint-space delta: tRest * (sRest^-1 * sLocal)
        dq.copy(inv).multiply(p.sBone.quaternion).premultiply(p.tRestQ);
      } else {
        // (B) parent-space delta (default): (sLocal * sRest^-1) * tRest —
        // transplants the absolute pose, so a T-pose source clip posing arms
        // at the sides lands arms-at-sides on the A-pose target too.
        dq.copy(p.sBone.quaternion).multiply(inv).multiply(p.tRestQ);
      }
      const off = BONE_OFFSETS.get(p.tName);
      if (off) dq.multiply(off);
      dq.toArray(quatData[i], f * 4);
    }
    if (sHips) {
      const dx = (sHips.position.x - sHipsRestPos.x) * opts.scale;
      const dy = (sHips.position.y - sHipsRestPos.y) * opts.scale;
      const dz = (sHips.position.z - sHipsRestPos.z) * opts.scale;
      const inPlace = !!entry.inPlace;
      posData[f * 3 + 0] = tHipsRestPos.x + (inPlace ? 0 : dx);
      posData[f * 3 + 1] = tHipsRestPos.y + dy;
      posData[f * 3 + 2] = tHipsRestPos.z + (inPlace ? 0 : dz);
    }
    if (f < frames - 1) mixer.update(dt);
  }
  mixer.uncacheClip(src.clip);

  const tracks = pairs.map((p, i) => new THREE.QuaternionKeyframeTrack(`${p.tName}.quaternion`, times, quatData[i]));
  if (sHips) tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, posData));
  return new THREE.AnimationClip(entry.name, dur, tracks);
}

for (const entry of manifest) {
  let src = fileCache.get(entry.file);
  if (!src) {
    const fbx = await fbxLoader.loadAsync('/tools/anims-src/' + encodeURIComponent(entry.file));
    // source for retargetClip: SkinnedMesh if the FBX has one, else a Skeleton
    // built from its bone hierarchy (armature-only clip downloads).
    let sourceObj = null;
    fbx.traverse((o) => { if (o.isSkinnedMesh && !sourceObj) sourceObj = o; });
    if (!sourceObj) {
      const bones = [];
      fbx.traverse((o) => { if (o.isBone) bones.push(o); });
      sourceObj = new THREE.Skeleton(bones);
      log(`(${entry.file}: no skin — using bare skeleton, ${bones.length} bones)`);
    }
    src = { fbx, source: sourceObj, clip: fbx.animations[0] };
    fileCache.set(entry.file, src);
    // rig detection: Mixamo vs Unreal Mannequin
    src.isUE = !fbx.getObjectByName('mixamorigHips') && !!fbx.getObjectByName('pelvis');
    src.hipName = src.isUE ? 'pelvis' : 'mixamorigHips';
    const srcHips = fbx.getObjectByName(src.hipName);
    src.hipY = srcHips ? srcHips.getWorldPosition(new THREE.Vector3()).y || srcHips.position.y : 100;
    // capture the source REST pose now — sampling poses the rig, and cached
    // files are reused for a second clip name
    src.restQ = {};
    fbx.traverse((o) => { if (o.isBone) src.restQ[o.name] = o.quaternion.clone(); });
    src.hipRestPos = srcHips ? srcHips.position.clone() : new THREE.Vector3();
    log(`loaded ${entry.file}: ${src.clip.duration.toFixed(2)}s, ${src.clip.tracks.length} tracks, hipY ${src.hipY.toFixed(1)}${src.isUE ? ' [UE rig]' : ''}`);
  }
  // hip translation scale: measured ratio of the two rigs' hip heights
  restoreRest();
  const opts = {
    hip: src.hipName,
    names: src.isUE ? MESHY_TO_UE : MESHY_TO_MIXAMO,
    scale: tHipY / (src.hipY || 100),
  };
  const retargeted = retargetLocalDelta(entry, src, opts);
  retargeted.name = entry.name;
  clips.push(retargeted);
  log(`retargeted -> ${entry.name} (hipScale ${opts.scale.toExponential(2)})`);
}
log(`DONE: ${clips.length} clips ready`);

// ---------- preview ----------
const mixer = new THREE.AnimationMixer(target);
let active = null;
function play(name) {
  const clip = clips.find((c) => c.name === name);
  const entry = manifest.find((m) => m.name === name);
  const action = mixer.clipAction(clip);
  action.reset();
  action.timeScale = entry.rate ?? 1;
  action.setLoop(entry.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = true;
  if (active && active !== action) active.crossFadeTo(action, 0.15, false);
  action.play();
  active = action;
  document.title = `retarget: ${name}`;
  log(`> ${name}`);
}
window.__play = play; // drive from the console/automation
window.__retargetRoot = retargetRoot;
window.__fileCache = fileCache;
window.__mixer = mixer;
window.__clips = clips;
window.__target = target;
/** binding diagnostics: how many tracks of a playing clip resolved to real nodes */
window.__diag = (name) => {
  play(name);
  const action = mixer._actions.find((x) => x._clip.name === name);
  const binds = action._propertyBindings.map((pb) => ({
    path: pb.binding?.path,
    node: pb.binding?.node ? pb.binding.node.name : null,
  }));
  return JSON.stringify({ total: binds.length, unbound: binds.filter((b) => !b.node).length, sample: binds.slice(0, 4) });
};

const ui = document.getElementById('ui');
for (const m of manifest) {
  const b = document.createElement('button');
  b.textContent = m.name; b.onclick = () => play(m.name);
  ui.appendChild(b);
}
const slow = document.createElement('button');
slow.textContent = 'SLOW x0.25'; let slowOn = false;
slow.onclick = () => { slowOn = !slowOn; slow.textContent = slowOn ? 'SPEED x1' : 'SLOW x0.25'; };
ui.appendChild(slow);

// ---------- export ----------
const exp = document.createElement('button');
exp.textContent = 'EXPORT mocap.glb'; exp.style.background = '#e63';
exp.onclick = () => {
  // export ONLY the bone hierarchy + clips (animation-only GLB, no mesh/textures).
  // Tracks are named "<TargetBone>.quaternion|.position" — they re-resolve by
  // node name inside the exported hierarchy.
  let rootBone = retargetSkin.skeleton.bones[0];
  while (rootBone.parent && rootBone.parent.isBone) rootBone = rootBone.parent;
  const exportRoot = new THREE.Group();
  exportRoot.name = 'mocap-rig';
  exportRoot.add(SkeletonUtils.clone(rootBone));
  new GLTFExporter().parse(
    exportRoot,
    (buf) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
      a.download = 'mocap.glb'; a.click();
      log(`exported mocap.glb (${(buf.byteLength / 1024).toFixed(0)} KB)`);
    },
    (e) => log('EXPORT ERROR', e),
    { binary: true, animations: clips },
  );
};
ui.appendChild(exp);

// ---------- loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  mixer.update(clock.getDelta() * (slowOn ? 0.25 : 1));
  renderer.render(scene, camera);
});
play('idle');
