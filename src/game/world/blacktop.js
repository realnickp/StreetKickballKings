// src/game/world/blacktop.js — the Blacktop's true-3D NYC surroundings.
// Loads the offline-baked, pre-merged world GLB (~5 draw calls: textured-box
// brownstones built from the owned Gameready3D facade atlases). Fail-safe by
// design: callers keep the legacy backdrop until the world actually loads.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let worldPromise = null;
/** resolves to a ready-to-add Group; rejects if the GLB is missing/broken */
export function loadBlacktopWorld(url = '/assets/world/world-blacktop.glb') {
  if (!worldPromise) {
    worldPromise = new GLTFLoader().loadAsync(url).then((g) => {
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;   // static set dressing: skip the shadow pass
          o.receiveShadow = false;
          o.matrixAutoUpdate = false;
          if (o.material) o.material.fog = false; // reads as horizon, not midground
        }
      });
      return g.scene;
    }).catch((e) => { worldPromise = null; throw e; });
  }
  return worldPromise;
}
