// src/game/world/blacktop.js — the Blacktop's true-3D NYC surroundings, built
// from Higgsfield image->3D meshes (the SAME pipeline that made the players, so
// the style matches by construction). A living city, not a backdrop:
//   - real 3D buildings 360° around the lot (shared geometry per archetype)
//   - a full dusk sky panorama dome with drifting clouds (slow rotation)
//   - an elevated subway line behind the outfield with a train that actually
//     crosses every ~30s
//   - rooftop steam plumes
// Fail-safe by design: callers keep the legacy backdrop until this loads.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const ASSET_DIR = '/assets/world/hf/';
const SKY_URL = '/assets/world/sky-dusk.png';

// ---------------------------------------------------------------------------
// LAYOUT — field center is the origin, outfield is -z, home plate ~z=0..+2.
// Fence ring is 42m; the streets start past it. targetH is real-world meters.
// rotY turns each building's photographed three-quarter face toward the lot.
const B = (file, x, z, rotY, targetH) => ({ file, x, z, rotY, targetH });
const LAYOUT = [
  // ---- outfield street (front row, past the fence) ----
  B('warehouse', -42, -54, 0.55, 26),
  B('brownstone', -17, -60, 0.15, 16),
  B('bodega', 8, -60, -0.1, 18),
  B('brownstone', 31, -56, -2.6, 16), // spun for silhouette variety
  B('warehouse', 54, -42, -0.9, 24),
  // ---- foul-line flanks ----
  B('bodega', -56, -10, 1.35, 18),
  B('brownstone', -54, 14, 1.9, 16),
  B('brownstone', 56, -8, -1.35, 16),
  B('bodega', 54, 16, -1.9, 18),
  // ---- BEHIND HOME (the pitcher's view) — dense block, no gaps ----
  B('brownstone', -44, 28, 2.3, 16),
  B('bodega', -30, 38, 2.7, 18),
  B('brownstone', -15, 44, 2.95, 16),
  B('tower', 0, 50, 3.14, 40),
  B('brownstone', 16, 44, -2.95, 16),
  B('bodega', 30, 38, -2.7, 18),
  B('brownstone', 44, 28, -2.3, 16),
  // second row behind home (skyline depth over the roofline)
  B('tower', -28, 62, 2.9, 34),
  B('warehouse', 28, 64, -2.9, 26),
  // ---- back-row skyline (full height, past the el line) ----
  B('tower', -58, -88, 0.5, 38),
  B('tower', -20, -98, 0.1, 44),
  B('warehouse', 12, -95, 0.0, 30),
  B('tower', 46, -90, -0.4, 40),
  B('tower', 78, -72, -0.8, 36),
];

// Elevated subway line: straight run behind the outfield fence.
const EL_Z = -74;          // world z of the track centerline
const EL_SPAN = 110;       // track extends x = -SPAN..+SPAN
const EL_DECK_H = 9.0;     // meters to the top of the track bed
const TRAIN_PERIOD = 30;   // seconds between crossings
const TRAIN_CROSS_S = 11;  // seconds a crossing takes

// ---------------------------------------------------------------------------
let worldPromise = null;
/** resolves to { group, update(elapsedSeconds) }; rejects if assets missing */
export function loadBlacktopWorld(dir = ASSET_DIR) {
  if (!worldPromise) {
    worldPromise = buildWorld(dir).catch((e) => { worldPromise = null; throw e; });
  }
  return worldPromise;
}

async function buildWorld(dir) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const names = ['brownstone', 'bodega', 'warehouse', 'tower', 'train', 'track'];
  const loaded = await Promise.all(names.map((n) => loader.loadAsync(dir + n + '.glb')));
  const src = Object.fromEntries(names.map((n, i) => [n, prepSource(loaded[i].scene)]));

  const group = new THREE.Group();
  group.name = 'blacktop-world';

  // --- streets: one big asphalt disc under everything past the fence --------
  const street = new THREE.Mesh(
    new THREE.CircleGeometry(320, 48),
    new THREE.MeshStandardMaterial({ color: '#383b40', roughness: 1, metalness: 0 }),
  );
  street.rotation.x = -Math.PI / 2;
  street.position.y = -0.06; // under the court so there's no z-fight
  street.receiveShadow = false;
  group.add(street);

  // --- buildings -------------------------------------------------------------
  for (const item of LAYOUT) {
    const inst = placeInstance(src[item.file], item.targetH);
    inst.position.set(item.x, inst.position.y, item.z);
    inst.rotation.y = item.rotY;
    inst.updateMatrixWorld(true);
    freeze(inst);
    group.add(inst);
  }

  // --- elevated track: stretched clones lined up along x ---------------------
  const elGroup = new THREE.Group();
  const trackProto = placeInstance(src.track, EL_DECK_H);
  const trackW = measure(trackProto).x || 10;
  const stretch = 2.0; // riveted girders read fine stretched at this distance
  const step = trackW * stretch * 0.98; // slight overlap hides joins
  for (let x = -EL_SPAN; x <= EL_SPAN; x += step) {
    const seg = trackProto.clone();
    seg.position.set(x, trackProto.position.y, EL_Z);
    seg.scale.x *= stretch;
    seg.updateMatrixWorld(true);
    freeze(seg);
    elGroup.add(seg);
  }
  group.add(elGroup);

  // --- the train --------------------------------------------------------------
  const train = placeInstance(src.train, 3.4);
  const trainLen = measure(train).x || 18;
  train.position.y += EL_DECK_H - 0.25; // wheels on the track bed
  train.position.z = EL_Z;
  train.visible = false;
  train.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  group.add(train);

  // --- rooftop steam plumes ----------------------------------------------------
  const steam = [];
  const puffTex = makePuffTexture();
  for (const [ex, ey, ez] of [[-42, 26.5, -54], [54, 24.5, -42], [12, 30.5, -95]]) {
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffTex, color: '#d8cfc4', transparent: true, opacity: 0, depthWrite: false, fog: false,
      }));
      s.center.set(0.5, 0.1);
      s.position.set(ex, ey, ez);
      s.userData = { ex, ey, ez, phase: i / 5 };
      group.add(s);
      steam.push(s);
    }
  }

  // --- full dusk sky panorama dome (drifting clouds via slow rotation) --------
  // Sits INSIDE the field's gradient dome (r=240), so below the horizon and on
  // texture failure the existing sky still fills in behind it.
  const skyDome = new THREE.Mesh(
    // hemisphere + a small dip below the horizon so the pano meets the streets
    new THREE.SphereGeometry(232, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2 + 0.1),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, transparent: true, opacity: 0 }),
  );
  group.add(skyDome);
  loadSeamlessPano(SKY_URL).then((tex) => {
    skyDome.material.map = tex;
    skyDome.material.opacity = 1;
    skyDome.material.transparent = false;
    skyDome.material.needsUpdate = true;
  }).catch(() => { /* gradient dome behind stays */ });

  // --- animation ---------------------------------------------------------------
  const update = (elapsed) => {
    // clouds drift: one slow revolution every ~20 minutes
    skyDome.rotation.y = elapsed * 0.005;

    // the el train crosses on a schedule, alternating direction
    const cycle = Math.floor(elapsed / TRAIN_PERIOD);
    const t = (elapsed % TRAIN_PERIOD) / TRAIN_CROSS_S;
    if (t <= 1) {
      const dir = cycle % 2 === 0 ? 1 : -1;
      const from = -dir * (EL_SPAN + trainLen);
      const to = dir * (EL_SPAN + trainLen);
      train.visible = true;
      train.position.x = from + (to - from) * t;
      train.rotation.y = dir > 0 ? 0 : Math.PI;
      // faint rail rumble bob
      train.position.y = train.userData.baseY + Math.sin(elapsed * 31) * 0.02;
    } else {
      train.visible = false;
    }

    // steam puffs: rise, swell, fade, recycle
    for (const s of steam) {
      const k = ((elapsed * 0.16) + s.userData.phase) % 1;
      s.position.set(
        s.userData.ex + Math.sin((k * 4) + s.userData.phase * 9) * (1.2 + k * 2.5),
        s.userData.ey + k * 7,
        s.userData.ez + Math.cos((k * 3) + s.userData.phase * 7) * (0.8 + k * 2),
      );
      const grow = 1.8 + k * 5.5;
      s.scale.set(grow, grow, 1);
      s.material.opacity = 0.22 * Math.sin(Math.PI * k);
    }
  };
  train.userData.baseY = train.position.y;

  return { group, update };
}

// ---------------------------------------------------------------------------
/** static set dressing: no shadow pass, frozen matrices */
function freeze(objRoot) {
  objRoot.traverse((o) => {
    if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
    o.matrixAutoUpdate = false;
  });
}

/** one-time cleanup of a loaded GLB scene (source for clones) */
function prepSource(scene) {
  scene.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material.metalness = Math.min(o.material.metalness ?? 0, 0.35);
      o.material.roughness = Math.max(o.material.roughness ?? 0.9, 0.55);
    }
  });
  return scene;
}

/** clone a source, normalize height to targetH meters, feet on the ground */
function placeInstance(source, targetH) {
  const inst = source.clone(true);
  const wrap = new THREE.Group();
  wrap.add(inst);
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const size = new THREE.Vector3(); box.getSize(size);
  wrap.scale.setScalar(targetH / (size.y || 1));
  wrap.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(wrap);
  const c = new THREE.Vector3(); box2.getCenter(c);
  wrap.position.set(-c.x, -box2.min.y, -c.z); // centered, grounded
  const outer = new THREE.Group();
  outer.add(wrap);
  return outer;
}

/** world-space size of a placed instance */
function measure(placed) {
  placed.updateMatrixWorld(true);
  const s = new THREE.Vector3();
  new THREE.Box3().setFromObject(placed).getSize(s);
  return s;
}

/** soft round puff sprite for the steam plumes */
function makePuffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/**
 * Load the dusk panorama and blend its left/right edges into each other on a
 * canvas so the cylinder wrap point has NO seam — one continuous sky, one sun.
 */
function loadSeamlessPano(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.width, h = img.height;
        const blend = Math.floor(w * 0.1); // fade band at each side of the seam
        const half = Math.floor(w / 2);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        // Near the wrap point, fade in a HALF-SHIFTED copy of the sky. The copy
        // is continuous across the wrap (its own seam lands at w/2, where its
        // weight is zero), so columns w-1 -> 0 become img(half-1) -> img(half):
        // no seam anywhere, still one sun.
        for (let i = 0; i < blend; i++) {
          g.globalAlpha = 1 - i / blend; // strongest at the very edge
          g.drawImage(img, (i + half) % w, 0, 1, h, i, 0, 1, h);
          g.drawImage(img, (half - 1 - i + w) % w, 0, 1, h, w - 1 - i, 0, 1, h);
        }
        g.globalAlpha = 1;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        resolve(tex);
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = url;
  });
}
