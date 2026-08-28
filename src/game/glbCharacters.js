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
// no cycle: animExtras imports mocapAnimator only, never this module
import { loadExtrasFor } from './animExtras.js';
// leaf modules: jerseyDecals imports three + kits, kits imports nothing
import { attachJerseyDecals } from './jerseyDecals.js';
import { inkFor, logoFor } from './kits.js';
// leaf modules: skinTint is pure maths, accessories imports three and nothing else
import { recolorPixels, kitTintPixel, inkKitPanels, rasterizeUvMask, dilateMask } from './skinTint.js';
import { attachAccessory } from './accessories.js';
import castsData from '../data/casts.json';

const loader = new GLTFLoader();
const gltfCache = new Map();

/**
 * Recolor an archetype's atlas: the neutral-grey kit takes the crew's colour,
 * and — when the cast asks for one — the baked skin moves to this player's
 * tone. Both rules live in skinTint.js and are unit-tested there; `recolorPixels`
 * is their allocation-free form (the pure pair costs 4.1 s on a 2048² atlas,
 * this costs ~80 ms). Shorts, hair and any authored colour are left alone.
 *
 * The SKIN pass is what stops arch-shaggy and arch-stache walking out looking
 * like chalk statues (their baked skin is near-white; the kit under it always
 * recoloured fine — casts/probe-white-jersey.mjs, turntable-arch12/19-*.png).
 *
 * LOCKER cleats are tinted separately by GEOMETRY (applyCleatVertexTint) —
 * texel-space painting bled across shared UV islands.
 * @returns {THREE.CanvasTexture} a NEW texture (caller owns it)
 */
function recolorKitTexture(srcTex, primaryHex, { skinTone = null, mesh = null } = {}) {
  const img = srcTex.image;
  if (!img || !img.width) return srcTex;
  const key = `${srcTex.uuid}|${primaryHex}|${skinTone ?? ''}`;
  const hit = recolorCache.get(key);
  if (hit) { recolorCache.delete(key); recolorCache.set(key, hit); return hit; } // LRU touch
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  // width/height let the pass hand the anti-aliased kit/skin seam back to the
  // kit — without them it left a warm speckled outline round every neckline.
  const { mask } = recolorPixels(data.data, {
    kit: primaryHex, tone: skinTone, width: c.width, height: c.height,
  });
  // Carry the colour past the kit rule's brightness cliff: the dark plate baked
  // behind the number, and the shaded middle of the shorts. It runs on the mask
  // the recolour measured on the ORIGINAL atlas (rebuilding it here reads a
  // buffer with no neutral kit left in it), fenced off the hair and the shoes
  // by the MESH — see inkKitPanels and hairShoeFence.
  //
  // NO FENCE, NO PASS. Without the mesh's fence the flood walks straight off the
  // vest onto the hair — that is the white wig, measured at 71 892 texels on
  // arch-locs — so a rig the fence cannot be drawn for (an unskinned mesh, or a
  // geometry that throws) gets the recolour alone rather than a coloured scalp.
  const fence = hairShoeFence(mesh, c.width, c.height);
  if (fence) {
    inkKitPanels(data.data, {
      width: c.width, height: c.height, kit: primaryHex, mask, forbid: fence,
    });
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srcTex.colorSpace;
  tex.flipY = srcTex.flipY;
  tex.wrapS = srcTex.wrapS; tex.wrapT = srcTex.wrapT;
  tex.needsUpdate = true;
  // NOT userData.owned: the cache SHARES this texture with every character in
  // the same kit and tone, so disposeCharacter() must leave it alone. (The
  // early-out above hands back the shared gltf texture, also never tagged.)
  recolorCache.set(key, tex);
  while (recolorCache.size > RECOLOR_CACHE_MAX) {
    const oldest = recolorCache.keys().next().value;
    const dead = recolorCache.get(oldest);
    recolorCache.delete(oldest);
    try { dead?.dispose?.(); } catch { /* already gone */ }
  }
  return tex;
}

// ---- the recolour cache ---------------------------------------------------
// A 2048² atlas costs 130-400 ms to walk (recolour + seam sweep + panel pass),
// and the LOCKER rebuilds the captain on EVERY equip — a tap used to buy a
// second of pixel work on the phone for a texture identical to the one just
// thrown away. Keyed on what the result depends on and nothing else: the source
// texture, the crew hex and the skin tone. Bounded, LRU, disposed on eviction.
//
// WHY FOUR AND NOT MORE: an entry is a live 2048² canvas — 16 MB of CPU pixels
// plus its GPU copy — and six of the nineteen archetypes are that size, so the
// bound is retained memory on a phone, and this project's iOS rules do not have
// 100 MB spare. Four is more than the only pattern that actually repeats: the
// Locker asks for the SAME key on every cleat/taunt/kick equip and one more per
// kit toggle. A MATCH is the opposite — sixteen players, sixteen different
// archetypes, sixteen keys, nothing reused — so a bigger bound would buy that
// path nothing and cost it a fortune.
const RECOLOR_CACHE_MAX = 4;
const recolorCache = new Map();

// ---- the hair/shoe fence --------------------------------------------------
// The panel pass claims dark texels NEXT TO the kit. On these atlases nothing
// in texel space separates the vest island from the hair: triangles cover only
// 55-69 % of the sheet and every gap is OPAQUE padding, so a dilation walks
// straight across it (casts/probe-atlasmap.mjs). Only the mesh knows which
// texels the hair and the shoes sample, so the mesh draws the fence — the same
// move applyCleatVertexTint makes for the boots, one dimension down.
//
// THE BOOTS ARE IN THE SET, and until fix round 2 they were not: the bone test
// read `/Head|Neck/` while three comments claimed it fenced the shoes too, and
// the flood re-inked 63 077 shoe texels on arch-bald (the monarchs captain's
// sneakers came out gold, casts/back-monarchs-light.png). The cleats carry the
// LOCKER's own colour through applyCleatVertexTint, so the flood must leave
// them alone.
//
// Cached per (archetype geometry, atlas size): SkeletonUtils.clone SHARES the
// geometry, so this is measured once per archetype, not once per character.
// Held as a BITSET — a 2048² mask is 4 MB as bytes and a match fields sixteen
// archetypes, so the byte form would retain 16-30 MB for nothing. LRU-bounded
// like the recolour cache.
const fenceCache = new Map();
const FENCE_CACHE_MAX = 8;
const packBits = (m) => {
  const out = new Uint8Array((m.length + 7) >> 3);
  for (let i = 0; i < m.length; i++) if (m[i]) out[i >> 3] |= 1 << (i & 7);
  return out;
};
const unpackBits = (bits, n) => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (bits[i >> 3] >> (i & 7)) & 1;
  return out;
};
// The fence is grown by ONE texel so an island's own colour bleed goes with it,
// and no further: it is subtracted again wherever the body samples (dilated to
// match), because on these atlases a shorts triangle and a shoe triangle can
// land on the SAME texels, and a fence that wins those ties leaves a grey patch
// on the front of the shorts (casts/dump-waves-final.png).
const FENCE_DILATE_PX = 1;
// ...and the body's claim is grown by three, because a triangle smaller than a
// texel still SAMPLES the atlas while covering no texel centre, so a body claim
// rasterized 1:1 has pinholes in it. The fence loses every tie.
const BODY_REACH_PX = 3;
function hairShoeFence(mesh, width, height) {
  if (!mesh?.isSkinnedMesh || !mesh.geometry || !mesh.skeleton) return null;
  const key = `${mesh.geometry.uuid}|${width}x${height}`;
  const hit = fenceCache.get(key);
  if (hit) { fenceCache.delete(key); fenceCache.set(key, hit); return unpackBits(hit, width * height); }
  let fence = null;
  try {
    const geo = mesh.geometry;
    const uvAttr = geo.getAttribute('uv');
    const ji = geo.getAttribute('skinIndex');
    const sw = geo.getAttribute('skinWeight');
    if (uvAttr && ji && sw) {
      const bones = mesh.skeleton.bones;
      const off = new Set(bones.map((b, i) => (/Head|Neck|Foot|ToeBase/i.test(b.name) ? i : -1)).filter((i) => i >= 0));
      if (off.size) {
        const keep = new Uint8Array(uvAttr.count);
        const rest = new Uint8Array(uvAttr.count);
        for (let v = 0; v < uvAttr.count; v++) {
          let best = -1, bw = -1;
          for (let k = 0; k < 4; k++) {
            const w = sw.getComponent(v, k);
            if (w > bw) { bw = w; best = ji.getComponent(v, k); }
          }
          keep[v] = off.has(best) ? 1 : 0;   // the bone that OWNS the vertex
          rest[v] = keep[v] ? 0 : 1;
        }
        // PACK the UVs: these attributes are interleaved on most archetypes,
        // so `uvAttr.array` is the whole vertex buffer, not a u,v list.
        const uv = new Float32Array(uvAttr.count * 2);
        for (let v = 0; v < uvAttr.count; v++) { uv[v * 2] = uvAttr.getX(v); uv[v * 2 + 1] = uvAttr.getY(v); }
        const index = geo.index?.array ?? null;
        const raw = rasterizeUvMask({ uv, index, keep, count: uvAttr.count, width, height });
        // ...and what the REST of the body samples. The fence must never cover
        // one of those: these atlases re-use texels across UV islands (3-14 %
        // of the hair/shoe mask is also body), and the 3-texel bleed reaches
        // further still, so an unsubtracted fence left a white patch on the
        // front of every monarchs captain's shorts.
        const bodyMask = rasterizeUvMask({ uv, index, keep: rest, count: uvAttr.count, width, height });
        const bodyNear = dilateMask(bodyMask, width, height, BODY_REACH_PX);
        fence = dilateMask(raw, width, height, FENCE_DILATE_PX);
        for (let i = 0; i < fence.length; i++) if (bodyNear[i]) fence[i] = 0;
      }
    }
  } catch { return null; /* NOT cached: a throw is a one-off, and a cached null
                            would disable the fence for this rig for good */ }
  if (!fence) return null;
  fenceCache.set(key, packBits(fence));
  while (fenceCache.size > FENCE_CACHE_MAX) fenceCache.delete(fenceCache.keys().next().value);
  return fence;
}

// ---- LOCKER cleats: tint the FOOT GEOMETRY --------------------------------
// The archetypes are one skinned mesh + one atlas with texels RE-USED across
// UV islands — a texel-space mask splatters the cleat colour onto every part
// sampling those texels. A per-vertex MASK selects the exact foot-weighted
// vertices instead (≥0.55 to Foot/ToeBase).
//
// The mask carries no colour: multiplying the cleat hex over the baked shoe
// can only SUBTRACT channels from a warm brown-orange boot, so ICE #7fe7ff
// came out swamp-green ≈(159,154,27) and BLACKOUTS ≈(70,41,0) rust (review,
// 2026-08-27). We COLORIZE BY LUMINANCE instead: keep the baked shading as a
// brightness curve and paint it in the gear's own colour, diffuse + emissive.
// The colour rides a UNIFORM, so three's program cache (keyed on the shader
// string) hands every cleat the SAME compiled program.
export const CLEAT_BOOST = 1.6;
function applyCleatVertexTint(mesh, cleatHex) {
  try {
    const src = mesh.geometry;
    const ji = src.getAttribute('skinIndex');
    const w = src.getAttribute('skinWeight');
    const bones = mesh.skeleton.bones;
    const footIdx = new Set(bones.map((b, i) => (/Foot|ToeBase/i.test(b.name) ? i : -1)).filter((i) => i >= 0));
    if (!ji || !w || !footIdx.size) return;
    const n = src.getAttribute('position').count;
    const mask = new Float32Array(n);
    let hits = 0;
    for (let vi = 0; vi < n; vi++) {
      let fw = 0;
      for (let k = 0; k < 4; k++) if (footIdx.has(ji.getComponent(vi, k))) fw += w.getComponent(vi, k);
      if (fw < 0.55) continue;
      mask[vi] = 1;
      hits += 1;
    }
    if (!hits) return;
    const geo = src.clone(); // instances share geometry — never tint the shared copy
    geo.userData.owned = true; // per-character clone: disposeCharacter() frees it
    geo.setAttribute('aCleat', new THREE.BufferAttribute(mask, 1));
    mesh.geometry = geo;
    mesh.material.vertexColors = false;
    const uCleat = new THREE.Color(cleatHex).convertSRGBToLinear();
    mesh.material.onBeforeCompile = (shader) => {
      shader.uniforms.uCleat = { value: uCleat };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCleat;\nvarying float vCleat;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCleat = aCleat;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uCleat;\nvarying float vCleat;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n\tif (vCleat > 0.5) {\n\t\tfloat l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n\t\tdiffuseColor.rgb = uCleat * clamp(l * 1.6 + 0.10, 0.06, 1.0);\n\t}')
        // the shoe self-illuminates with the baked map — recolour that term too
        // or the original boot washes the tint straight back out
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\tif (vCleat > 0.5) {\n\t\tfloat le = dot(totalEmissiveRadiance, vec3(0.2126, 0.7152, 0.0722));\n\t\ttotalEmissiveRadiance = uCleat * le;\n\t}');
    };
    // one key for every cleat colour (the hue is a uniform, not a #define) and
    // never shared with the untinted materials on the rest of the body
    mesh.material.customProgramCacheKey = () => 'cleat';
  } catch { /* cosmetic only — never block a character build */ }
}

/**
 * Free everything a character build ALLOCATED — and nothing it borrowed.
 * buildGlbCharacter clones the material per character and clones the geometry
 * for cleats; the GLTF's own geometry/textures are SHARED by every clone and
 * must survive, and so is the recoloured atlas, which now lives in
 * `recolorCache` and is handed to every character in the same kit and tone.
 * `userData.owned` is the tag the builder leaves on what it made — the
 * recoloured texture deliberately does NOT carry it.
 */
export function disposeCharacter(char) {
  // The jersey decals own two plane geometries + two materials per character
  // and BORROW their texture from the shared decal cache — their own dispose()
  // knows the difference, so let it go first (the traverse below would free the
  // same geometry/material anyway, but never the rig group's parenting).
  try { char?.decals?.dispose?.(); } catch { /* cosmetic */ }
  // the headband / wristbands / shades own their geometry + material and hang
  // off a rig group on a bone — same deal, let them let go first
  try { char?.accessories?.dispose?.(); } catch { /* cosmetic */ }
  char?.group?.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (o.geometry?.userData?.owned) o.geometry.dispose();
    if (o.material.map?.userData?.owned) o.material.map.dispose();
    o.material.dispose(); // always a per-character clone
    // SkeletonUtils.clone() builds a FRESH Skeleton per character, and three
    // uploads its bone matrices as a DataTexture — one more GPU texture per
    // captain that no material references. (Measured: the turntable grew a
    // texture per equip until this line existed.)
    if (o.isSkinnedMesh) o.skeleton?.dispose?.();
  });
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
// walkout strut: slow confident walk (the mocap set calls it swagger)
CLIPS.walk = { loop: true, dur: 1.05, fn(A, t) {
  const a = Math.sin(t * TAU), b = Math.sin(t * TAU + Math.PI);
  A.r('Spine', 0.08, a * 0.08, a * 0.04);
  A.r('LUpLeg', a * 0.45, 0, 0); A.r('RUpLeg', b * 0.45, 0, 0);
  A.r('LLeg', Math.max(0, -a) * 0.6, 0, 0); A.r('RLeg', Math.max(0, -b) * 0.6, 0, 0);
  A.r('LArm', b * 0.35, 0, 0.08); A.r('RArm', a * 0.35, 0, -0.08);
  A.r('LForeArm', -0.25, 0, 0); A.r('RForeArm', -0.25, 0, 0);
  A.r('Head', 0, a * 0.06, 0);
  A.hipsY(Math.abs(Math.sin(t * TAU * 2)) * 0.45);
} };
CLIPS.swagger = CLIPS.walk;
// celebration bounce so dances never statue on the fallback animator
CLIPS.dance1 = { loop: true, dur: 0.95, fn(A, t) {
  const s = Math.sin(t * TAU);
  A.r('Spine', 0.06, s * 0.14, 0);
  A.r('LArm', -2.5 + s * 0.35, 0, 0.5); A.r('RArm', -2.5 - s * 0.35, 0, -0.5);
  A.r('LForeArm', -0.4, 0, 0); A.r('RForeArm', -0.4, 0, 0);
  A.r('Head', s * 0.08, 0, 0);
  A.hipsY(Math.abs(s) * 1.2);
} };
CLIPS.dance2 = CLIPS.dance1; CLIPS.dance3 = CLIPS.dance1; CLIPS.dance4 = CLIPS.dance1;
CLIPS.juke = CLIPS.run;
CLIPS.slide = CLIPS.stumble;
CLIPS.dive = CLIPS.stumble;
CLIPS.climb = CLIPS.idle;
CLIPS.climbDown = CLIPS.idle;
// extras packs (mocap-<pack>-*, lazy: x = dances/special kicks, k = kicks/taunts)
// -> nearest legacy clips so the ?codeanim
// fallback never statues on the new names
CLIPS.thriller1 = CLIPS.dance1; CLIPS.thriller2 = CLIPS.dance1;
CLIPS.thriller3 = CLIPS.dance1; CLIPS.thriller4 = CLIPS.dance1;
CLIPS.danceLock = CLIPS.dance1; CLIPS.danceTut = CLIPS.dance1;
CLIPS.danceWave = CLIPS.dance1; CLIPS.danceChicken = CLIPS.dance1;
CLIPS.danceStep = CLIPS.dance1; CLIPS.danceSilly = CLIPS.dance1;
CLIPS.soccerSpin = CLIPS.juke;
CLIPS.kickFlair = CLIPS.kick; CLIPS.kickHurricane = CLIPS.kick;
CLIPS.kickSpinFlip = CLIPS.kick; CLIPS.kickCrescent = CLIPS.kick;
CLIPS.kickBlast = CLIPS.kick; CLIPS.kickMeia = CLIPS.kick;
CLIPS.kickMeiaBack = CLIPS.kick; CLIPS.kickSweep = CLIPS.kick;
// pack k (mocap-k-*, lazy): seven more special kicks + the taunt pool
for (const n of ['kickMartelo', 'kickArmada', 'kickScissor', 'kickPunt', 'kickFlip', 'kickBicycle', 'kickKipUp']) CLIPS[n] = CLIPS.kick;
for (const n of ['tauntPoint', 'tauntCry', 'tauntChest', 'tauntGesture', 'tauntLoser']) CLIPS[n] = CLIPS.idle;

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

  /** Game-time seconds from play(name) until the clip's contact mark. */
  contactDelayS(name) {
    const clip = CLIPS[name];
    if (!clip || clip.contactAt == null) return 0;
    return clip.dur * clip.contactAt; // contactAt is normalized here
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

/** Lateral (x/z) bone scales for a cast slot's `build`. See the call site for
 *  why lateral-only is the safe axis on these rigs, and why the SPINE is not
 *  on this list. */
function applyBuildScale(bones, build) {
  if (!build || build === 1) return;
  const lateral = (re, k) => {
    for (const name in bones) {
      if (!re.test(name)) continue;
      bones[name].scale.x *= k;
      bones[name].scale.z *= k;
    }
  };
  // shoulders carry the whole arm chain, so the arms thicken with them (scaling
  // both would square the effect); the up-legs carry the whole leg
  lateral(/^(mixamorig:)?(Left|Right)Shoulder$/i, build);
  lateral(/^(mixamorig:)?(Left|Right)Up(per)?Leg$|^thigh\.[lr]$/i, build);
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
        o.material.roughness = 0.7;
        const skinTone = def.cast?.skin ?? null;
        if (def.teamColor && o.material.map) {
          const recol = recolorKitTexture(o.material.map, def.teamColor, { skinTone, mesh: o });
          o.material.map = recol;
          if (o.material.emissiveMap) o.material.emissiveMap = recol;
          o.material.emissiveIntensity = 0.4;
        } else {
          // No map to paint. Every archetype and the fallback model DO have one
          // (casts/probe-white-jersey.mjs checked all 20), but a bare material
          // would otherwise take the field in whatever colour it was authored,
          // so put the same kit rule over its flat colour.
          if (def.teamColor && !o.material.map && o.material.color) {
            const c = o.material.color;
            const tinted = kitTintPixel(
              [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)],
              def.teamColor,
            );
            c.setRGB(tinted[0] / 255, tinted[1] / 255, tinted[2] / 255);
          }
          o.material.emissiveIntensity = 0.4;
        }
        // LOCKER cleats tint by GEOMETRY, not texels: the atlases re-use
        // texels across UV islands, so painting "shoe texels" splattered the
        // cleat colour over jerseys and skin (the orange-specks bug,
        // 2026-08-04). Vertex colours hit the exact foot-weighted vertices.
        if (def.cleatHex && o.isSkinnedMesh) applyCleatVertexTint(o, def.cleatHex);
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

  // CAST (spec §4): this player's own frame. HEIGHT rides the character root,
  // which scales about the FEET — they stay on the ground and every world
  // position the match reads off this rig (kickFootPos above all) stays true.
  const castH = def.cast?.height ?? 1;

  if (clips) {
    // MOCAP path: size from the HIPS BONE, not a Box3. The clips drive
    // Hips.position in the rig's native node units (~0.98 world after the
    // armature scale); a Box3-derived scale can disagree with those units by
    // 100x (skinned-bounds vs node-hierarchy quirk) and launch the skeleton
    // 100m up. Hips sit at ~51% of standing height on this rig.
    root.updateMatrixWorld(true);
    const hips = root.getObjectByName('Hips');
    const hipsY = hips ? hips.getWorldPosition(new THREE.Vector3()).y : 1;
    inner.scale.setScalar((heightM * castH * 0.51) / (hipsY || 1));
  } else {
    // legacy code-animator path: scale to target height + drop feet to y=0
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3(); box.getSize(size);
    inner.scale.setScalar((heightM * castH) / (size.y || 1));
    const box2 = new THREE.Box3().setFromObject(inner);
    inner.position.y -= box2.min.y;
  }

  const group = new THREE.Group();
  group.add(inner);

  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });

  // BUILD: a LATERAL scale, never a uniform one. Every bone on these rigs runs
  // along its own local Y (measured, casts/probe-bones.mjs: each child sits at
  // (0, +len, 0)), so scaling x/z thickens the limb and moves NO joint — the
  // knee, the striking foot and the hands stay exactly where the animator put
  // them (the harness's striking-foot assertion is the guard).
  //
  // The SPINE is deliberately not on the list. A lateral spine scale is the
  // strongest build signal there is — it widens the torso and swings the whole
  // arm chain out with it — but it also makes the chest bone's world scale
  // ANISOTROPIC (x,z scaled, y not), and the jersey decal hangs off that bone
  // through a rig that cancels it with ONE uniform factor. Widening the torso
  // therefore drags the crew mark up the shirt and squashes it. Shoulders and
  // up-legs buy most of the look and leave the decal's maths untouched.
  applyBuildScale(bones, def.cast?.build ?? 1);

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
  // batch-1 diversity roll-out (all 16 designs dev-approved 2026-07-25;
  // 14 converted — 05/07 dropped at random to fit the credit balance).
  // INTERLEAVED men/women so the roster cycle mixes builds, ages and
  // skin tones instead of clustering.
  '/assets/models/archetypes/arch-pilot.glb',    // 6  M locs athletic (01)
  '/assets/models/archetypes/arch-sprint.glb',   // 7  F long braids, tall sprinter (02)
  '/assets/models/archetypes/arch-stocky.glb',   // 8  M stocky Latino, beard (03)
  '/assets/models/archetypes/arch-pony.glb',     // 9  F East Asian, high ponytail (04)
  '/assets/models/archetypes/arch-waves.glb',    // 10 M South Asian, cropped waves (06)
  '/assets/models/archetypes/arch-puff.glb',     // 11 F Latina, afro-puff (08)
  '/assets/models/archetypes/arch-shaggy.glb',   // 12 M East Asian, shaggy (10)
  '/assets/models/archetypes/arch-bun.glb',      // 13 F stocky blonde bun (09)
  '/assets/models/archetypes/arch-curls.glb',    // 14 M Middle Eastern, curls (12)
  '/assets/models/archetypes/arch-fro.glb',      // 15 F short afro, compact (11)
  '/assets/models/archetypes/arch-vet.glb',      // 16 M 40s veteran, greying (13)
  '/assets/models/archetypes/arch-band.glb',     // 17 F ponytail + headband (16) — BENCHED: Higgsfield rigged the skeleton but never skinned the mesh (no JOINTS_0/WEIGHTS_0), renders as a statue; re-convert (~35cr) before un-benching
  '/assets/models/archetypes/arch-longhair.glb', // 18 M Native, long tied-back (14)
  '/assets/models/archetypes/arch-stache.glb',   // 19 M heavyset, mustache (15)
];
const FALLBACK_MODEL = '/assets/models/monarchs-23.glb';
const FEMALE_ARCHETYPES = new Set([2, 5, 7, 9, 11, 13, 15, 17]);

// archetypes whose GLB can't animate (see the BENCHED note above) — remap to
// a working body so no cast or hash-fallback pick ever fields a statue
const BENCHED = new Map([[17, 5]]);

/** Which archetype roster slot `i` of `team` wears. Per-team offset into the
 *  archetype pool: rosters are ~8 deep and plain cycling would give every team
 *  the SAME first eight faces. Hashing the team id slides each crew to its own
 *  slice, so Philly's people aren't Brooklyn's people. Deterministic — a team
 *  always fields the same folks. Shared by the match roster and the Locker
 *  preview, so the captain you dress IS the captain you field.
 *
 *  casts.json comes FIRST: every crew was cast off its own intro video, and
 *  that casting is what stops two squads walking out as each other's twins
 *  (8 different archetypes per crew, and no two crews sharing one in the same
 *  slot — tests/casts.test.js). The roster's own `archetype` and the id-hash
 *  stay as the fallbacks for anything the cast doesn't name. */
function archIdxFor(team, i) {
  const teamOffset = [...(team.id ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0) % ARCHETYPES.length;
  const cast = castSlotFor(team, i);
  const archIdx = (cast?.archetype ?? team.roster?.[i]?.archetype ?? (teamOffset + i)) % ARCHETYPES.length;
  return BENCHED.get(archIdx) ?? archIdx;
}

/** This crew's cast for roster slot `i` — `{archetype, skin, height, build,
 *  accessory}` — or null for a crew nobody cast. */
export function castSlotFor(team, i) {
  return castsData.casts?.[team?.id ?? '']?.[i] ?? null;
}

/** The kit a colour belongs to — the crew's own data when the hex IS one of
 *  their two kits, derived the same way kits.js derives it otherwise (a Locker
 *  BLACKOUT/GOLD is a loose colour with no kit block of its own). Gives the
 *  decals the right ink and the right mark variant without a call-site change. */
function kitOf(team, hex) {
  const k = team?.kits;
  if (hex && k?.dark?.hex === hex) return k.dark;
  if (hex && k?.light?.hex === hex) return k.light;
  const h = hex ?? team?.colors?.primary ?? '#8a8a92';
  return { hex: h, ink: inkFor(h), logo: logoFor(team ?? { id: '' }, h) };
}

const logoUrlFor = (kit) => (kit?.logo ? `/assets/logos/${kit.logo}.png` : '');

/** Build a full team of detailed GLB characters, recolored to a uniform colour
 *  (defaults to the team's primary; pass `uniformColor` for a light/dark kit so
 *  two teams don't clash). `gear` (THE LOCKER, player team only) applies the
 *  equipped cleats' foot tint — the uniform override happens at the call site
 *  by passing its hex as `uniformColor`. `opts.kit` is the dressed kit from
 *  kits.js (`{ hex, ink, logo, img }`): it decides the jersey decals' ink and
 *  which mark variant goes on the shirt. */
export async function buildTeamCharsGlb(team, uniformColor, gear = null, opts = {}) {
  const roster = team.roster ?? [];
  const primary = uniformColor ?? team.colors?.primary;
  const cleatHex = gear?.cleats?.hex ?? null;
  const kit = opts.kit ?? kitOf(team, primary);
  const logoUrl = logoUrlFor(kit);
  // Per-archetype mocap clips (each Meshy rig has its own rest pose, so each
  // gets its own bake); loadMocapClips caches per URL — 6 fetches total across
  // ALL teams. Missing bakes (or ?codeanim=1) fall back to the legacy code
  // animator — never a blank screen.
  const forceCode = new URLSearchParams(location.search).has('codeanim');
  const archKeyOf = (archIdx) => ARCHETYPES[archIdx].match(/arch-(\w+)\.glb/)?.[1];
  const clipsFor = async (archIdx) => {
    if (forceCode) return null;
    const key = archKeyOf(archIdx);
    try { return await loadMocapClips(`/assets/anims/mocap-${key}.glb`); }
    catch (e) { console.warn(`[skk] mocap-${key}.glb unavailable, using code animator:`, e); return null; }
  };
  const out = [];
  for (let i = 0; i < roster.length; i++) {
    const p = roster[i];
    const archIdx = archIdxFor(team, i); // shared with the Locker preview
    const cast = castSlotFor(team, i);
    const clips = await clipsFor(archIdx);
    let char;
    try {
      char = await buildGlbCharacter({ model: ARCHETYPES[archIdx], teamColor: primary, cleatHex, cast }, { heightM: 2.05, clips });
    } catch {
      // fallback model has a DIFFERENT rig — no baked set; use the code animator
      char = await buildGlbCharacter({ model: FALLBACK_MODEL }, { heightM: 2.05, clips: null });
    }
    char.cast = cast;
    // headband / wristbands / shades in the crew's accent, scaled with the body
    char.accessories = attachAccessory(char, cast?.accessory, team.colors?.accent, { scale: cast?.height ?? 1 });
    char.data = p;
    char.number = p.number ?? JERSEY_NUMBERS[i % JERSEY_NUMBERS.length];
    char.gender = FEMALE_ARCHETYPES.has(archIdx) ? 'she' : 'he'; // for the announcer's he/she calls
    char.hasBall = false;
    char.archKey = clips ? archKeyOf(archIdx) : null; // which extras packs (mocap-<pack>-*) fit this rig
    // crew mark front and back + this player's number (spec §2). Never awaited:
    // the mark streams in behind the character, which is on the field either way.
    char.decals = attachJerseyDecals(char, { logoUrl, number: char.number, ink: kit.ink });
    out.push(char);
  }
  return out;
}

/** The captain (roster[0]) alone, wearing a kit colour + cleats — the Locker
 *  preview. Same model/recolour/tint path as the match so what you see is
 *  what you field. */
export async function buildCaptainPreview(team, uniformHex, gear = null) {
  const idx = archIdxFor(team, 0);
  const cast = castSlotFor(team, 0);
  const archKey = ARCHETYPES[idx].match(/arch-(\w+)\.glb/)?.[1];
  let clips = null;
  try { clips = await loadMocapClips(`/assets/anims/mocap-${archKey}.glb`); } catch { clips = null; }
  const char = await buildGlbCharacter({ model: ARCHETYPES[idx], teamColor: uniformHex ?? team.colors?.primary, cleatHex: gear?.cleats?.hex ?? null, cast }, { heightM: 2.05, clips });
  char.cast = cast;
  // the turntable is where the dev SEES the crew — so the captain wears the
  // frame, the tone and the gear he takes onto the field
  char.accessories = attachAccessory(char, cast?.accessory, team.colors?.accent, { scale: cast?.height ?? 1 });
  char.data = team.roster?.[0] ?? null;
  char.number = char.data?.number ?? JERSEY_NUMBERS[0];
  // The turntable is where the dev SEES the kit, so the captain wears the same
  // mark and number he takes out there. The equipped Locker uniform arrives as
  // a hex (lockerScreen resolves it through dressTeams/resolveGearKit), so the
  // ink + mark variant are recovered from the crew's own kit data.
  const kit = kitOf(team, uniformHex ?? team.colors?.primary);
  char.decals = attachJerseyDecals(char, { logoUrl: logoUrlFor(kit), number: char.number, ink: kit.ink });
  // The Locker plays the EQUIPPED kick/taunt on the turntable, and those clips
  // live in the extras packs (x, k) — not the base bake. Fire-and-forget so the
  // captain is on screen immediately; hasClip() gates playback until they land.
  char.archKey = clips ? archKey : null;
  if (char.archKey) loadExtrasFor([char]);
  return char;
}

// test-only exports: the fence bitset + the fence builder (round 4 re-review)
export { packBits, unpackBits, hairShoeFence };
