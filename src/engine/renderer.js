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

// Combined vignette + chromatic aberration + scene tint + film grain grade.
// Cheap single pass. Tint and grain exist to marry the clean 3D layer to the
// AI-rendered backdrop videos: tint pulls the live layer toward the scene's
// palette, grain matches the videos' noise floor so the two stop reading as
// separate media (dev bar: "the field and players need to match it").
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.3 },
    caAmount: { value: 0.0004 },
    sat: { value: 1.12 },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    grain: { value: 0.028 },
    time: { value: 0 },
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
    uniform float sat;
    uniform vec3 tint;
    uniform float grain;
    uniform float time;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center);
      vec2 dir = normalize(center + 1e-6) * dist * dist;
      float r = texture2D(tDiffuse, vUv + dir * caAmount * 12.0).r;
      vec2 gb = texture2D(tDiffuse, vUv - dir * caAmount * 12.0).gb;
      vec3 col = vec3(r, gb);
      col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, sat);
      col *= tint;
      col += (hash(vUv * 719.0 + fract(time) * 61.0) - 0.5) * grain;
      col *= 1.0 - vignette * smoothstep(0.35, 0.85, dist);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // ACES at default exposure reads muddy on phones — lift the whole image.
  // Dev directive 2026-07-21: "the graphics need to be brighter."
  renderer.toneMappingExposure = 1.22;

  const scene = new THREE.Scene();

  // Neutral image-based lighting (IBL): a PMREM-filtered RoomEnvironment gives every
  // MeshStandardMaterial real reflectance/specular so surfaces stop reading flat. This
  // is the cheapest material-quality win. Wrapped because a missing/renamed addon must
  // NEVER blank the screen — on failure we just skip the env map and keep rendering.
  let pmrem = null;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    // Hold the IBL well back: full-strength RoomEnvironment + the bright per-sky
    // lights blew every surface past the bloom threshold (everything glowed). This
    // keeps the material reflectance cue without lifting overall scene brightness.
    scene.environmentIntensity = 0.3;
  } catch (e) {
    console.warn('[skk] env map (RoomEnvironment/PMREM) unavailable, skipping:', e);
  }

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  camera.position.set(0, 6.5, 8.5);
  camera.lookAt(0, 1, -12);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  // threshold 1.0 (was .95): the exposure lift above would otherwise push
  // ordinary surfaces over the bloom cutoff and everything would glow
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.4, 1.0);
  const gradePass = new ShaderPass(GradeShader);
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
    // AO disabled: GTAO produced big dark halo-discs under players and a black box
    // around the fast-moving ball. The env map + sun shadows already ground the scene;
    // revisit with a properly tuned (much smaller radius) pass later.
    // if (quality === 'high' && aoPass) composer.addPass(aoPass);
    composer.addPass(bloomPass);
    if (quality === 'high') composer.addPass(gradePass);
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
    fx: { bloomPass, gradePass },
    baseBloom: 0.18,
    onFrame(cb) {
      frameCbs.add(cb);
      return () => frameCbs.delete(cb);
    },
    setQuality(q) {
      quality = q;
      rebuildChain();
    },
    /** Scene-matched image-based lighting: build the environment map FROM the
     *  field's own backdrop art so the court and players are lit by the scene's
     *  actual colors (warm dusk wall glow from the sides, sky tone from above)
     *  instead of a neutral white room. Also nudges the grade tint toward the
     *  scene palette. Fire-and-forget; any failure keeps the neutral IBL. */
    setSceneEnvironment(url) {
      if (!url || !pmrem) return;
      new THREE.ImageLoader().load(url, (img) => {
        try {
          // Equirect approximation of standing inside the scene: the backdrop
          // fills a horizon band, its top rows smear up to the zenith and its
          // bottom rows smear down to the nadir. Coarse on purpose — PMREM
          // blurs it into diffuse ambience; only the color distribution matters.
          const W = 256, H = 128;
          const c = document.createElement('canvas');
          c.width = W; c.height = H;
          const ctx = c.getContext('2d');
          const bandTop = Math.round(H * 0.18), bandH = Math.round(H * 0.55);
          ctx.drawImage(img, 0, 0, img.width, 1, 0, 0, W, bandTop);               // zenith = top row smear
          ctx.drawImage(img, 0, 0, img.width, img.height, 0, bandTop, W, bandH);  // horizon band = the scene
          ctx.drawImage(img, 0, img.height - 1, img.width, 1, 0, bandTop + bandH, W, H - bandTop - bandH); // nadir
          const tex = new THREE.CanvasTexture(c);
          tex.mapping = THREE.EquirectangularReflectionMapping;
          tex.colorSpace = THREE.SRGBColorSpace;
          const envRT = pmrem.fromEquirectangular(tex);
          tex.dispose();
          scene.environment = envRT.texture;
          scene.environmentIntensity = 0.55; // scene maps are darker than the white room
          // subtle grade pull toward the scene's average hue (never brightness)
          const d = ctx.getImageData(0, bandTop, W, bandH).data;
          let ar = 0, ag = 0, ab = 0;
          for (let i = 0; i < d.length; i += 4) { ar += d[i]; ag += d[i + 1]; ab += d[i + 2]; }
          const n = d.length / 4, luma = (0.2126 * ar + 0.7152 * ag + 0.0722 * ab) / n || 1;
          const mixAmt = 0.10;
          gradePass.uniforms.tint.value.set(
            1 + mixAmt * (ar / n / luma - 1),
            1 + mixAmt * (ag / n / luma - 1),
            1 + mixAmt * (ab / n / luma - 1),
          );
        } catch (e) {
          console.warn('[skk] scene environment failed, keeping neutral IBL:', e);
        }
      });
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
    camera.aspect = w / h;
    // keep the field framed in narrow portrait by widening FOV as aspect shrinks
    camera.fov = w / h < 0.65 ? 74 : 58;
    engine.baseFov = camera.fov; // CameraDirector multiplies shot fovScale onto this
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  // re-measure once layout settles (the frame's size depends on CSS being applied)
  requestAnimationFrame(resize);
  resize();

  const clock = new THREE.Clock();
  const shakeOffset = new THREE.Vector3();
  let running = true;
  let lastFrameAt = performance.now();
  let lastTs = -1;

  function loop(ts) {
    if (!running) return;
    if (ts !== undefined) {
      if (ts === lastTs) return; // duplicate callback this frame (safety pump raced rAF) — drop this chain
      lastTs = ts;
    }
    requestAnimationFrame(loop);
    lastFrameAt = performance.now();
    const rawDt = Math.min(clock.getDelta(), 0.05);
    const dt = rawDt * engine.timeScale;
    gradePass.uniforms.time.value = clock.elapsedTime; // animates the film grain

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

  // rAF SAFETY PUMP: the loop only re-arms from inside itself, so ONE dropped
  // rAF callback (WebKit does this — seen freezing the game mid-celebration on
  // device and in headless WebKit) kills the game forever with no error. If
  // frames stop while we should be running, re-arm; the timestamp dedupe above
  // collapses things back to a single chain if the original callback also
  // shows up late (e.g. returning from a backgrounded tab).
  const pump = setInterval(() => {
    if (running && performance.now() - lastFrameAt > 1200) {
      lastFrameAt = performance.now(); // one re-arm per stall
      requestAnimationFrame(loop);
    }
  }, 600);

  engine.dispose = () => {
    running = false;
    clearInterval(pump);
  };
  return engine;
}
