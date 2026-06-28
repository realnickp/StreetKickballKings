// Three.js engine wrapper: portrait camera, post-FX chain, frame loop with
// time scaling (cinematic slow-mo), and camera shake. The cinematic director
// reaches into `fx` to spike bloom/vignette/CA during big moments.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// Combined vignette + chromatic aberration grade. Cheap single pass.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.3 },
    caAmount: { value: 0.0004 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float caAmount;
    varying vec2 vUv;
    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center);
      vec2 dir = normalize(center + 1e-6) * dist * dist;
      float r = texture2D(tDiffuse, vUv + dir * caAmount * 12.0).r;
      vec2 gb = texture2D(tDiffuse, vUv - dir * caAmount * 12.0).gb;
      vec3 col = vec3(r, gb);
      col *= 1.0 - vignette * smoothstep(0.35, 0.85, dist);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// Comic-book pass: bold ink outlines (Sobel), posterized flat color, halftone
// shadow dots, punchy saturation. The cinematic director ramps `amount` 0→1 to
// snap an in-play moment into a 2D comic panel — flatness becomes the style.
const ComicShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform vec2 resolution;
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    void main() {
      vec3 src = texture2D(tDiffuse, vUv).rgb;
      if (amount < 0.001) { gl_FragColor = vec4(src, 1.0); return; }

      vec2 texel = 1.0 / resolution;
      // Sobel edge detection on luma -> ink lines
      float tl = luma(texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).rgb);
      float tm = luma(texture2D(tDiffuse, vUv + texel * vec2( 0.0, -1.0)).rgb);
      float tr = luma(texture2D(tDiffuse, vUv + texel * vec2( 1.0, -1.0)).rgb);
      float ml = luma(texture2D(tDiffuse, vUv + texel * vec2(-1.0,  0.0)).rgb);
      float mr = luma(texture2D(tDiffuse, vUv + texel * vec2( 1.0,  0.0)).rgb);
      float bl = luma(texture2D(tDiffuse, vUv + texel * vec2(-1.0,  1.0)).rgb);
      float bm = luma(texture2D(tDiffuse, vUv + texel * vec2( 0.0,  1.0)).rgb);
      float br = luma(texture2D(tDiffuse, vUv + texel * vec2( 1.0,  1.0)).rgb);
      float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
      float gy = -tl - 2.0 * tm - tr + bl + 2.0 * bm + br;
      float edge = sqrt(gx * gx + gy * gy);
      float ink = 1.0 - smoothstep(0.18, 0.55, edge);

      // posterize + saturation boost
      vec3 poster = floor(src * 5.0 + 0.5) / 5.0;
      float l = luma(poster);
      poster = clamp(mix(vec3(l), poster, 1.45), 0.0, 1.0);

      // halftone dots concentrated in shadows
      vec2 dotUv = vUv * resolution / 4.0;
      float d = length(fract(dotUv) - 0.5);
      float dotMask = smoothstep(0.30, 0.34, d + l * 0.55);
      float shade = mix(0.78, 1.0, dotMask);

      vec3 comic = poster * shade * ink;
      gl_FragColor = vec4(mix(src, comic, amount), 1.0);
    }
  `,
};

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();

  // Neutral image-based lighting (IBL): a PMREM-filtered RoomEnvironment gives every
  // MeshStandardMaterial real reflectance/specular so surfaces stop reading flat. This
  // is the cheapest material-quality win. Wrapped because a missing/renamed addon must
  // NEVER blank the screen — on failure we just skip the env map and keep rendering.
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  } catch (e) {
    console.warn('[skk] env map (RoomEnvironment/PMREM) unavailable, skipping:', e);
  }

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  camera.position.set(0, 6.5, 8.5);
  camera.lookAt(0, 1, -12);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.4, 0.9);
  const gradePass = new ShaderPass(GradeShader);
  const comicPass = new ShaderPass(ComicShader);
  const outputPass = new OutputPass();

  // Ambient occlusion (high quality only): subtle contact darkening where players,
  // ball and props meet the ground so nothing floats. GTAO renders its own depth/
  // normal buffer. Wrapped so a missing/renamed addon degrades to "no AO" instead of
  // blanking the screen. Tuned conservatively — a light contact shade, not a grey halo.
  let aoPass = null;
  try {
    aoPass = new GTAOPass(scene, camera, 1, 1); // sized in resize()
    aoPass.output = GTAOPass.OUTPUT.Default; // scene blended with AO, not the raw AO buffer
    aoPass.blendIntensity = 0.55;            // hold the occlusion back so it stays subtle
    aoPass.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1.0, scale: 1.0, samples: 16 });
  } catch (e) {
    console.warn('[skk] GTAOPass unavailable, skipping AO:', e);
    aoPass = null;
  }

  let quality = 'high';
  function rebuildChain() {
    composer.passes.length = 0;
    composer.addPass(renderPass);
    // AO sits right after the scene render, before bloom — high quality only (mobile skips)
    if (quality === 'high' && aoPass) composer.addPass(aoPass);
    composer.addPass(bloomPass);
    if (quality === 'high') composer.addPass(gradePass);
    composer.addPass(comicPass); // cheap when amount=0; director ramps it
    composer.addPass(outputPass);
  }
  rebuildChain();

  const frameCbs = new Set();
  const engine = {
    THREE,
    renderer,
    scene,
    camera,
    composer,
    timeScale: 1,
    paused: false, // when true the frame callbacks (gameplay) freeze but we keep rendering
    fx: { bloomPass, gradePass, comicPass },
    baseBloom: 0.35,
    onFrame(cb) {
      frameCbs.add(cb);
      return () => frameCbs.delete(cb);
    },
    setQuality(q) {
      quality = q;
      rebuildChain();
    },
    /** 0 = normal 3D, 1 = full comic panel. */
    setComic(amount) {
      comicPass.uniforms.amount.value = amount;
    },
    shakeAmt: 0,
    shake(intensity = 0.4) {
      engine.shakeAmt = Math.max(engine.shakeAmt, intensity);
    },
  };

  function resize() {
    // size to the CANVAS (the portrait phone frame), not the whole window — on
    // desktop the frame is a centered column, so window dims would be too wide.
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false); // false = don't touch CSS; the frame already sizes the canvas
    composer.setSize(w, h);
    if (aoPass) aoPass.setSize(w, h);
    comicPass.uniforms.resolution.value.set(w, h);
    camera.aspect = w / h;
    // keep the field framed in narrow portrait by widening FOV as aspect shrinks
    camera.fov = w / h < 0.65 ? 74 : 58;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  // re-measure once layout settles (the frame's size depends on CSS being applied)
  requestAnimationFrame(resize);
  resize();

  const clock = new THREE.Clock();
  const shakeOffset = new THREE.Vector3();
  let running = true;

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const rawDt = Math.min(clock.getDelta(), 0.05);
    const dt = rawDt * engine.timeScale;

    // a throwing frame callback must NEVER freeze the whole game (skip render /
    // other callbacks). Isolate each one so the loop always survives + renders.
    // When paused, skip gameplay callbacks entirely but keep rendering the scene.
    if (!engine.paused) {
      for (const cb of [...frameCbs]) {
        try { cb(dt, rawDt); } catch (e) { console.error('[skk] frame callback error (recovered):', e); }
      }
    }

    if (engine.shakeAmt > 0.001) {
      camera.position.sub(shakeOffset);
      shakeOffset.set(
        (Math.random() - 0.5) * engine.shakeAmt,
        (Math.random() - 0.5) * engine.shakeAmt,
        0,
      );
      camera.position.add(shakeOffset);
      engine.shakeAmt *= Math.pow(0.0001, rawDt); // fast decay
    } else if (shakeOffset.lengthSq() > 0) {
      camera.position.sub(shakeOffset);
      shakeOffset.set(0, 0, 0);
    }

    composer.render();
  }
  loop();

  engine.dispose = () => {
    running = false;
  };
  return engine;
}
