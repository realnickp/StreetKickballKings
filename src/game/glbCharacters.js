// Real detailed 3D characters (Higgsfield/Meshy GLB) animated ENTIRELY in code.
// We do NOT use the models' baked clips — those are authored for a different
// rest pose and fling the mesh off-screen (the "giant feet at the top" bug).
// Instead we capture the model's own rest pose and add joint ROTATIONS relative
// to it each frame, exactly like the procedural Animator — so it can never
// pitch/fling, and the same code drives any standard humanoid Meshy rig.
//
// Surface matches SpriteCharacter/procedural: { group, animator.play(name,opts),
// animator.update(dt), animator.ctx.speedFactor, animator.name } so matchScene
// needs zero changes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { MocapAnimator, loadMocapClips } from './mocapAnimator.js';

const loader = new GLTFLoader();
const gltfCache = new Map();

function hexToRgb(h) { const n = parseInt(h.replace('#', ''), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }

/**
 * Recolor an archetype's neutral-grey kit to a team colour. Targets only
 * low-saturation, mid/high-brightness pixels (the grey tank + light sneaker
 * accents) and tints them by the team primary, preserving the baked shading.
 * Skin (saturated), shorts (dark), and hair (dark) are left untouched.
 * @returns {THREE.CanvasTexture} a NEW texture (caller owns it)
 */
function recolorKitTexture(srcTex, primaryHex) {
  const img = srcTex.image;
  if (!img || !img.width) return srcTex;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const prim = hexToRgb(primaryHex);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const v = mx / 255;
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    if (s < 0.17 && v > 0.52) { // grey/white kit pixel → team-coloured, shaded
      const k = Math.min(1.0, v * 1.12);
      px[i] = prim.r * k; px[i + 1] = prim.g * k; px[i + 2] = prim.b * k;
    }
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srcTex.colorSpace;
  tex.flipY = srcTex.flipY;
  tex.wrapS = srcTex.wrapS; tex.wrapT = srcTex.wrapT;
  tex.needsUpdate = true;
  return tex;
}

export function loadGltf(url) {
  if (gltfCache.has(url)) return gltfCache.get(url);
  const p = new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject))
    .catch((e) => { gltfCache.delete(url); throw e; }); // don't poison the cache on failure
  gltfCache.set(url, p);
  return p;
}

// Standard humanoid bones we drive. Meshy/Mixamo naming varies a little, so each
// logical joint lists candidate names; we bind whatever the rig actually has.
const BONE_ALIASES = {
  Hips: ['Hips', 'hips', 'mixamorig:Hips', 'pelvis'],
  Spine: ['Spine', 'spine', 'mixamorig:Spine'],
  Spine1: ['Spine01', 'Spine1', 'spine01', 'mixamorig:Spine1'],
  Head: ['Head', 'head', 'mixamorig:Head'],
  LUpLeg: ['LeftUpLeg', 'LeftUpperLeg', 'mixamorig:LeftUpLeg', 'thigh.L'],
  LLeg: ['LeftLeg', 'LeftLowerLeg', 'mixamorig:LeftLeg', 'shin.L'],
  RUpLeg: ['RightUpLeg', 'RightUpperLeg', 'mixamorig:RightUpLeg', 'thigh.R'],
  RLeg: ['RightLeg', 'RightLowerLeg', 'mixamorig:RightLeg', 'shin.R'],
  LArm: ['LeftArm', 'LeftUpperArm', 'mixamorig:LeftArm', 'upper_arm.L'],
  LForeArm: ['LeftForeArm', 'LeftLowerArm', 'mixamorig:LeftForeArm', 'forearm.L'],
  RArm: ['RightArm', 'RightUpperArm', 'mixamorig:RightArm', 'upper_arm.R'],
  RForeArm: ['RightForeArm', 'RightLowerArm', 'mixamorig:RightForeArm', 'forearm.R'],
};

const TAU = Math.PI * 2;

// Each clip is fn(A, t, ctx): A.r(joint,x,y,z) adds a rest-relative euler rotation;
// A.hipsY(units) bobs the hips (units are model-native, scaled by A.bob).
const CLIPS = {
  idle: { loop: true, dur: 2.6, fn(A, t) {
    const s = Math.sin(t * TAU);
    A.r('Spine', 0.03 + s * 0.015, 0, 0);
    A.r('LArm', 0.05, 0, 0.05); A.r('RArm', 0.05, 0, -0.05);
    A.r('Head', s * 0.03, 0, 0);
    A.hipsY(Math.abs(s) * 0.3);
  } },
  plate: { loop: true, dur: 2.0, fn(A, t) {
    const s = Math.sin(t * TAU);
    A.r('Spine', 0.14 + s * 0.02, -0.12, 0);
    A.r('LUpLeg', 0.18, 0, 0.05); A.r('RUpLeg', -0.14, 0, -0.05);
    A.r('LLeg', 0.14, 0, 0); A.r('RLeg', 0.10, 0, 0);
    A.r('LArm', -0.25, 0, 0.25); A.r('RArm', -0.30 + s * 0.04, 0, -0.25);
    A.r('LForeArm', -0.5, 0, 0); A.r('RForeArm', -0.55, 0, 0);
    A.hipsY(-0.6);
  } },
  crouch: { loop: true, dur: 2.2, fn(A, t) {
    const s = Math.sin(t * TAU);
    A.r('Spine', 0.42, 0, 0);
    A.r('LUpLeg', 0.32, 0, 0.14); A.r('RUpLeg', 0.32, 0, -0.14);
    A.r('LLeg', 0.55, 0, 0); A.r('RLeg', 0.55, 0, 0);
    A.r('LArm', 0.5, 0, 0.2); A.r('RArm', 0.5, 0, -0.2);
    A.r('LForeArm', -0.3, 0, 0); A.r('RForeArm', -0.3, 0, 0);
    A.r('Head', -0.32, 0, 0);
    A.hipsY(-2.4 + Math.abs(s) * 0.2);
  } },
  run: { loop: true, dur: 0.62, fn(A, t) {
    const a = Math.sin(t * TAU), b = Math.sin(t * TAU + Math.PI);
    A.r('Spine', 0.22, 0, 0);
    A.r('LUpLeg', a * 0.85, 0, 0); A.r('RUpLeg', b * 0.85, 0, 0);
    A.r('LLeg', Math.max(0, -a) * 1.3, 0, 0); A.r('RLeg', Math.max(0, -b) * 1.3, 0, 0);
    A.r('LArm', b * 0.85, 0, 0); A.r('RArm', a * 0.85, 0, 0);
    A.r('LForeArm', -0.85, 0, 0); A.r('RForeArm', -0.85, 0, 0);
    A.hipsY(Math.abs(Math.sin(t * TAU * 2)) * 0.8);
  } },
  kick: { loop: false, dur: 0.5, contactAt: 0.34, fn(A, t) {
    if (t < 0.3) { const k = t / 0.3;                  // WIND: snap the kicking leg back
      A.r('Spine', 0.1, -k * 0.3, 0);
      A.r('RUpLeg', -k * 0.7, 0, 0); A.r('RLeg', k * 0.5, 0, 0);
      A.r('LUpLeg', k * 0.2, 0, 0);
      A.r('LArm', -k * 0.5, 0, 0.2); A.r('RArm', k * 0.4, 0, -0.2);
    } else if (t < 0.55) { const k = (t - 0.3) / 0.25;  // CONTACT: explosive swing-through
      A.r('Spine', 0.1, -0.3 + k * 0.5, 0);
      A.r('RUpLeg', -0.7 + k * 2.4, 0, 0); A.r('RLeg', 0.5 - k * 0.5, 0, 0);
      A.r('LUpLeg', 0.2 - k * 0.1, 0, 0);
      A.r('LArm', -0.5 + k * 0.8, 0, 0.2); A.r('RArm', 0.4 - k * 0.6, 0, -0.2);
    } else { const k = (t - 0.55) / 0.45;               // FOLLOW: high finish, settle down
      A.r('Spine', 0.1, 0.2, 0);
      A.r('RUpLeg', 1.7 - k * 1.4, 0, 0);
      A.r('LArm', 0.3, 0, 0.2); A.r('RArm', -0.2, 0, -0.2);
    }
  } },
  throw: { loop: false, dur: 0.5, contactAt: 0.45, fn(A, t) {
    if (t < 0.35) { const k = t / 0.35;
      A.r('Spine', 0.05, -k * 0.4, 0);
      A.r('RArm', -k * 2.2, 0, -0.2); A.r('RForeArm', -k * 0.6, 0, 0);
    } else { const k = (t - 0.35) / 0.65;
      A.r('Spine', 0.05, -0.4 + k * 0.7, 0);
      A.r('RArm', -2.2 + k * 3.0, 0, -0.2); A.r('RForeArm', -0.6 + k * 0.5, 0, 0);
      A.r('LArm', 0.2, 0, 0.2);
    }
  } },
  catch: { loop: false, dur: 0.45, fn(A, t) {
    const k = Math.min(1, t / 0.4);
    A.r('Spine', 0.12 - k * 0.18, 0, 0);
    A.r('LArm', -k * 1.7, 0, 0.25); A.r('RArm', -k * 1.7, 0, -0.25);
    A.r('LForeArm', -k * 0.6, 0, 0); A.r('RForeArm', -k * 0.6, 0, 0);
    A.r('Head', -k * 0.2, 0, 0);
  } },
  stumble: { loop: false, dur: 1.1, fn(A, t) {
    if (t < 0.3) { const k = t / 0.3;
      A.r('Spine', k * 0.7, 0, 0);
      A.r('LArm', -k * 2.0, 0, 0.6); A.r('RArm', -k * 1.7, 0, -0.5);
      A.r('LUpLeg', k * 0.4, 0, 0);
      A.hipsY(-k * 2);
    } else if (t < 0.7) { const k = (t - 0.3) / 0.4;
      A.r('Spine', 0.7 + Math.sin(k * Math.PI) * 0.2, 0, Math.sin(k * TAU) * 0.2);
      A.r('LArm', -2.0, 0, 0.6); A.r('RArm', -1.7, 0, -0.5);
      A.hipsY(-(2 + k * 2));
    } else { const k = (t - 0.7) / 0.3;
      A.r('Spine', 0.7 - k * 0.6, 0, 0);
      A.r('LArm', -2.0 + k * 2, 0, 0.6 - k * 0.6); A.r('RArm', -1.7 + k * 1.7, 0, -0.5 + k * 0.5);
      A.hipsY(-(4 - k * 4));
    }
  } },
  dance1: { loop: true, dur: 0.8, fn(A, t) {
    const s = Math.sin(t * TAU);
    A.r('RArm', s * 1.6 - 0.6, 0, -0.3); A.r('RForeArm', -1.0, 0, 0);
    A.r('LArm', -0.3, 0, 0.4);
    A.r('LUpLeg', Math.max(0, s) * 0.6, 0, 0); A.r('LLeg', Math.max(0, s) * 0.5, 0, 0);
    A.hipsY(Math.abs(Math.cos(t * TAU)) * 1.2);
  } },
  dance2: { loop: true, dur: 1.0, fn(A, t) {
    const s = Math.sin(t * TAU);
    A.r('Spine', 0.05, s * 0.18, s * 0.1);
    A.r('LArm', -1.0 + Math.sin(t * TAU * 3) * 0.5, 0, 0.3); A.r('RArm', -1.0 + Math.cos(t * TAU * 3) * 0.5, 0, -0.3);
    A.r('LForeArm', -1.2, 0, 0); A.r('RForeArm', -1.2, 0, 0);
    A.hipsX(s * 1.5); A.hipsY(Math.abs(Math.cos(t * TAU)) * 0.7);
  } },
  dance3: { loop: true, dur: 1.4, fn(A, t) {
    const k = Math.sin(t * Math.PI);
    A.r('LArm', -2.5, 0, 0.3); A.r('RArm', -2.5, 0, -0.3);
    A.r('Spine', 0, Math.sin(t * TAU) * 0.4, 0);
    A.r('Head', -0.2, 0, 0);
    A.hipsY(k * 1.2);
  } },
  dance4: { loop: true, dur: 0.9, fn(A, t) {
    const s = Math.sin(t * TAU);
    A.r('LArm', -2.5, 0, 0.4 + s * 0.4); A.r('RArm', -2.5, 0, -0.4 + s * 0.4);
    A.r('Spine', 0.06, 0, 0);
    A.r('LUpLeg', Math.abs(s) * 0.2, 0, 0); A.r('RUpLeg', Math.abs(s) * 0.2, 0, 0);
    A.hipsY(Math.abs(s) * 1.1);
  } },
};
// celebration aliases the dance picker may ask for
CLIPS.dejected = CLIPS.idle;
// mocap-era names -> nearest legacy clips, so the ?codeanim fallback stays sane
CLIPS.pitch = CLIPS.throw;
CLIPS.holdball = CLIPS.idle;
CLIPS.strafeL = CLIPS.run;
CLIPS.strafeR = CLIPS.run;

class GlbCodeAnimator {
  constructor(bones) {
    // bind logical joints to actual bones via aliases
    this.b = {};
    for (const [logical, names] of Object.entries(BONE_ALIASES)) {
      for (const n of names) if (bones[n]) { this.b[logical] = bones[n]; break; }
    }
    this.rest = {};
    for (const k in this.b) this.rest[k] = this.b[k].quaternion.clone();
    this.restHips = this.b.Hips ? this.b.Hips.position.clone() : new THREE.Vector3();
    // a hip "unit" of bob, scaled to the rig's native size (~2% of hip height)
    this.bob = Math.max(0.02, Math.abs(this.restHips.y) * 0.02);
    this.ctx = { speedFactor: 1 };
    this.name = 'idle';
    this.t = 0; this.speed = 1;
    this.onContact = null; this.onDone = null;
    this.contactFired = false; this.doneFired = false;
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._hipDX = 0; this._hipDY = 0;
  }

  play(name, { onContact = null, onDone = null, speedFactor = 1, speed = 1 } = {}) {
    this.name = CLIPS[name] ? name : 'idle';
    this.t = 0; this.speed = speed;
    this.onContact = onContact; this.onDone = onDone;
    this.contactFired = false; this.doneFired = false;
    this.ctx.speedFactor = speedFactor;
  }

  // rest-relative euler rotation on a logical joint
  r(joint, x, y, z) {
    const bn = this.b[joint]; if (!bn) return;
    this._e.set(x || 0, y || 0, z || 0);
    bn.quaternion.copy(this.rest[joint]).multiply(this._q.setFromEuler(this._e));
  }
  hipsY(units) { this._hipDY = units; }
  hipsX(units) { this._hipDX = units; }

  update(dt) {
    const clip = CLIPS[this.name] ?? CLIPS.idle;
    // looping clips run faster with speedFactor (the run cycle); one-shots play at base
    const rate = clip.loop ? Math.max(0.35, this.ctx.speedFactor) : 1;
    this.t += dt * this.speed * rate;
    let nt = this.t / clip.dur;
    if (clip.loop) nt = nt - Math.floor(nt); else nt = Math.min(1, nt);

    if (clip.contactAt != null && !this.contactFired && nt >= clip.contactAt) {
      this.contactFired = true; this.onContact?.();
    }

    // reset every driven bone to rest, then apply the clip (no stale pose carryover)
    for (const k in this.b) this.b[k].quaternion.copy(this.rest[k]);
    this._hipDX = 0; this._hipDY = 0;
    clip.fn(this, nt, this.ctx);
    if (this.b.Hips) {
      this.b.Hips.position.set(
        this.restHips.x + this._hipDX * this.bob,
        this.restHips.y + this._hipDY * this.bob,
        this.restHips.z,
      );
    }

    if (!clip.loop && nt >= 1 && !this.doneFired) {
      this.doneFired = true; const d = this.onDone; this.onDone = null; d?.();
    }
  }
}

/** Which animator a character gets. Pure — unit-tested. */
export function chooseAnimator({ clips, forceCode }) {
  return clips && !forceCode ? 'mocap' : 'code';
}

/**
 * Load + clone a GLB into a matchScene-ready character. With `clips` (the
 * shared retargeted mocap set) the character gets a MocapAnimator; without,
 * the legacy code animator (also forced by ?codeanim=1 via def.forceCode).
 * @param {{model:string, faceOffset?:number, teamColor?:string, forceCode?:boolean}} def
 */
export async function buildGlbCharacter(def, { heightM = 2.05, clips = null } = {}) {
  const base = await loadGltf(def.model);
  const root = skeletonClone(base.scene);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false;
      if (o.material) {
        // clone the material per character so recolor/changes don't leak to other clones
        o.material = o.material.clone();
        o.material.side = THREE.FrontSide;
        // Meshy exports metalness=1 (which hides the albedo/base-colour map) plus a
        // white emissiveMap (the surface self-illuminates with the ORIGINAL texture,
        // overriding any recolour). Make it cloth/skin-like so the base colour shows,
        // and aim the self-illumination at the same (recoloured) texture.
        o.material.metalness = 0.0;
        o.material.roughness = 0.85;
        if (def.teamColor && o.material.map) {
          const recol = recolorKitTexture(o.material.map, def.teamColor);
          o.material.map = recol;
          if (o.material.emissiveMap) o.material.emissiveMap = recol;
          o.material.emissiveIntensity = 0.55;
        } else {
          o.material.emissiveIntensity = 0.6;
        }
        o.material.needsUpdate = true;
      }
    }
    // Legacy code-animator path only: skeleton.pose() rewrites bone LOCAL
    // positions in bind/geometry units (x100 vs the node hierarchy), which
    // mangles the mesh once mocap clips animate a subset of bones. The GLB
    // already loads in bind pose — mocap needs the loaded locals untouched.
    if (o.isSkinnedMesh && !clips) o.skeleton.pose();
  });

  // The mesh already faces +z (same convention as the procedural rig), which is
  // what matchScene's yaw math expects — so no facing offset by default.
  const inner = new THREE.Group();
  inner.rotation.y = def.faceOffset ?? 0;
  inner.add(root);

  if (clips) {
    // MOCAP path: size from the HIPS BONE, not a Box3. The clips drive
    // Hips.position in the rig's native node units (~0.98 world after the
    // armature scale); a Box3-derived scale can disagree with those units by
    // 100x (skinned-bounds vs node-hierarchy quirk) and launch the skeleton
    // 100m up. Hips sit at ~51% of standing height on this rig.
    root.updateMatrixWorld(true);
    const hips = root.getObjectByName('Hips');
    const hipsY = hips ? hips.getWorldPosition(new THREE.Vector3()).y : 1;
    inner.scale.setScalar((heightM * 0.51) / (hipsY || 1));
  } else {
    // legacy code-animator path: scale to target height + drop feet to y=0
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3(); box.getSize(size);
    inner.scale.setScalar(heightM / (size.y || 1));
    const box2 = new THREE.Box3().setFromObject(inner);
    inner.position.y -= box2.min.y;
  }

  const group = new THREE.Group();
  group.add(inner);

  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });

  const which = chooseAnimator({ clips, forceCode: def.forceCode ?? false });
  const animator = which === 'mocap'
    ? new MocapAnimator(root, clips)
    : new GlbCodeAnimator(bones);
  return { group, animator };
}

const JERSEY_NUMBERS = [23, 7, 3, 44, 11, 5, 88, 1, 32, 9, 21, 0];

// Diverse detailed archetypes (Higgsfield → image_to_3d, neutral-grey kit that
// recolors per team). All share the same 24-bone humanoid skeleton, so the code
// animator drives them all. Cycled across each roster.
const ARCHETYPES = [
  '/assets/models/archetypes/arch-locs.glb',
  '/assets/models/archetypes/arch-durag.glb',
  '/assets/models/archetypes/arch-braids.glb',
  '/assets/models/archetypes/arch-bald.glb',
  '/assets/models/archetypes/arch-afro.glb',
  '/assets/models/archetypes/arch-twists.glb',
];
const FALLBACK_MODEL = '/assets/models/monarchs-23.glb';
const FEMALE_ARCHETYPES = new Set([2, 5]); // arch-braids, arch-twists

/** Build a full team of detailed GLB characters, recolored to a uniform colour
 *  (defaults to the team's primary; pass `uniformColor` for a light/dark kit so
 *  two teams don't clash). */
export async function buildTeamCharsGlb(team, uniformColor) {
  const roster = team.roster ?? [];
  const primary = uniformColor ?? team.colors?.primary;
  // Per-archetype mocap clips (each Meshy rig has its own rest pose, so each
  // gets its own bake); loadMocapClips caches per URL — 6 fetches total across
  // ALL teams. Missing bakes (or ?codeanim=1) fall back to the legacy code
  // animator — never a blank screen.
  const forceCode = new URLSearchParams(location.search).has('codeanim');
  const clipsFor = async (archIdx) => {
    if (forceCode) return null;
    const key = ARCHETYPES[archIdx].match(/arch-(\w+)\.glb/)?.[1];
    try { return await loadMocapClips(`/assets/anims/mocap-${key}.glb`); }
    catch (e) { console.warn(`[skk] mocap-${key}.glb unavailable, using code animator:`, e); return null; }
  };
  const out = [];
  for (let i = 0; i < roster.length; i++) {
    const p = roster[i];
    const archIdx = (p.archetype ?? i) % ARCHETYPES.length;
    const clips = await clipsFor(archIdx);
    let char;
    try {
      char = await buildGlbCharacter({ model: ARCHETYPES[archIdx], teamColor: primary }, { heightM: 2.05, clips });
    } catch {
      // fallback model has a DIFFERENT rig — no baked set; use the code animator
      char = await buildGlbCharacter({ model: FALLBACK_MODEL }, { heightM: 2.05, clips: null });
    }
    char.data = p;
    char.number = p.number ?? JERSEY_NUMBERS[i % JERSEY_NUMBERS.length];
    char.gender = FEMALE_ARCHETYPES.has(archIdx) ? 'she' : 'he'; // for the announcer's he/she calls
    char.hasBall = false;
    out.push(char);
  }
  return out;
}
