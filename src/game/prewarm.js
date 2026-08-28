// PRE-WARM — every player is compiled, uploaded and printed BEFORE the show.
//
// Dev, on his phone, 2026-08-28: "when the team walks out ... they don't appear
// or render all at once. you need to fix that, it really looks bad, all
// characters should render before we see them."
//
// The last round already put all eight bodies on screen from t = 0 (walkoutShow
// queues the whole file outside the gate and the e2e proves `visible` is 8 at
// t 0.1 s). What the dev is still watching is not visibility — it is the GPU
// meeting each character for the FIRST time, one at a time, on the frame he is
// first drawn:
//
//   * SHADER VARIANTS. Every character owns CLONED materials (glbCharacters
//     clones per body so a recolour can't leak), plus two skinned jersey-patch
//     materials and a band material with their own `onBeforeCompile`. three
//     links a program the first time a material is drawn with a given set of
//     lights/skinning/shadow flags — a compile + link is milliseconds to tens
//     of milliseconds on a phone, and there are dozens of them.
//   * TEXTURE UPLOADS. Each body carries its own RECOLOURED atlas canvas, the
//     decals carry two 512² canvases, the band its own strip — and three
//     creates the SKELETON's bone texture lazily inside `setProgram`, so every
//     one of the sixteen also uploads a bone texture on its first draw.
//   * THE PRINT ITSELF. `attachJerseyDecals` paints the crest + number only
//     after the mark image AND the display webfont have landed (`decals.ready`)
//     — a vest that goes from blank to printed mid-walk is the same "renders
//     one by one" symptom wearing a different hat.
//
// So: do all of it up front, behind something the player is already looking at
// (the intro videos, the coin toss), and don't let the walk-out start until it
// is done.
//
// HOW THE WARM IS DONE, and why it is a RENDER and not just `compile()`:
//   - `renderer.compile(scene, camera)` walks the scene (traverse, not
//     traverseVisible — hidden characters are compiled too) and links a program
//     for every material, SkinnedMesh included. It is the cheap, thorough half.
//   - but it does NOT create skeleton bone textures (three does that inside
//     `setProgram`, i.e. at draw time) and it does NOT compile the shadow-depth
//     variants, and the sun casts shadows off every player. Only a real draw
//     does those. So we also render ONE frame.
//   - that frame goes to the COMPOSER'S OWN render target, never to the screen.
//     Two reasons. (1) No flash: the visible framebuffer is untouched and the
//     staging is synchronous, so the rAF loop cannot see the characters we
//     briefly un-hide. (2) three keys a program on `toneMapping`, and it only
//     applies tone mapping when the render target is NULL — the game renders
//     through an EffectComposer, so its scene pass is a RENDER-TARGET pass.
//     Warming to the screen would link the WRONG program variant and every
//     material would compile a second time on the first real frame, which is
//     exactly the bug we came to kill.
//
// LIGHTS ARE PART OF THE KEY. three's own note on `compile()`: "the (target)
// scene's lighting and environment must be configured before calling this
// method" — the program is keyed on the light counts. A warm run before the
// field exists would link 0-light programs and every one of them would be
// thrown away. That is why the call that GATES the show is the one MatchScene
// makes (field built, sun + hemi + ambient in the scene); the earlier call
// behind the intro videos runs `{ compile: false }` and does the part that is
// light-independent and expensive in bytes: the decal paint and the uploads.

export const PREWARM = {
  /** A logo that never loads (or a font that never lands) must not hold the
   *  match hostage — the print is cosmetic, the game is not. */
  decalTimeoutMs: 8000,
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** `{home:[],away:[]}` or a flat array -> one flat list of characters. */
export function charList(chars) {
  if (!chars) return [];
  const flat = Array.isArray(chars) ? chars : [...(chars.home ?? []), ...(chars.away ?? [])];
  return flat.filter((c) => c && c.group);
}

/** Every material texture slot three can sample. Explicit rather than a blind
 *  key sweep so a deprecated accessor can never be touched — the sweep below
 *  still catches anything custom on top of this list. */
const TEX_SLOTS = [
  'map', 'emissiveMap', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap',
  'aoMap', 'alphaMap', 'lightMap', 'displacementMap', 'envMap', 'specularMap',
  'specularIntensityMap', 'specularColorMap', 'clearcoatMap', 'clearcoatNormalMap',
  'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap',
  'anisotropyMap', 'gradientMap', 'matcap',
];

const materialsOf = (o) => (Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []));

/**
 * Every texture the GPU will have to hold for these characters, deduped by
 * uuid: material maps (the recoloured atlas AND the emissive copy of it), the
 * two decal canvases, the band strip — and the skeleton's bone texture, which
 * only EXISTS after a first draw, so this is worth re-running afterwards.
 * @param {Array|Object} chars
 * @param {Map<string,THREE.Texture>} [out]
 */
export function charTextures(chars, out = new Map()) {
  for (const c of charList(chars)) {
    c.group.traverse?.((o) => {
      for (const m of materialsOf(o)) {
        if (!m) continue;
        for (const k of TEX_SLOTS) { const t = m[k]; if (t && t.isTexture) out.set(t.uuid, t); }
        // anything a custom material hangs on itself (never re-reads a slot
        // above — the Map dedupes by uuid)
        for (const k of Object.keys(m)) { const t = m[k]; if (t && t.isTexture) out.set(t.uuid, t); }
      }
      const bone = o.isSkinnedMesh ? o.skeleton?.boneTexture : null;
      if (bone && bone.isTexture) out.set(bone.uuid, bone);
    });
  }
  return out;
}

/** Resolve when every character's crest + number is PAINTED (or the wait times
 *  out — the print is cosmetic and must never hold the match). */
export function decalsReady(chars, timeoutMs = PREWARM.decalTimeoutMs) {
  const waits = charList(chars)
    .map((c) => c.decals?.ready)
    .filter((p) => p && typeof p.then === 'function');
  if (!waits.length) return Promise.resolve(0);
  const all = Promise.all(waits.map((p) => Promise.resolve(p).catch(() => null)));
  if (!(timeoutMs > 0)) return all.then(() => waits.length);
  return Promise.race([
    all,
    new Promise((res) => setTimeout(res, timeoutMs)),
  ]).then(() => waits.length);
}

/** Is `obj` already hanging under `root`? */
function inTree(obj, root) {
  for (let p = obj; p; p = p.parent) if (p === root) return true;
  return false;
}

/**
 * The synchronous half: stage all sixteen, upload, compile, draw one offscreen
 * frame, put everything back exactly as it was. No `await` anywhere inside, so
 * the frame loop cannot land in the middle and show a staged character.
 */
function warmNow(engine, list, opts = {}) {
  const renderer = engine?.renderer;
  const scene = engine?.scene;
  const camera = engine?.camera;
  if (!renderer || !scene || !camera) return null;
  const t0 = now();
  const info = renderer.info ?? {};
  const before = {
    textures: info.memory?.textures ?? 0,
    programs: info.programs?.length ?? 0,
  };

  // ---- stage: everyone visible, everyone on the graph
  const staged = [];
  for (const c of list) {
    const g = c.group;
    staged.push({ g, visible: g.visible, parent: g.parent });
    g.visible = true;
    if (!inTree(g, scene)) scene.add(g);
  }

  // ---- the uploads. Do them BEFORE the draw so the draw itself is a pure
  // compile/link pass and the two costs are measured apart.
  const texes = charTextures(list);
  let uploaded = 0;
  for (const t of texes.values()) {
    try { renderer.initTexture(t); uploaded += 1; } catch { /* a dead texture must not stop the rest */ }
  }

  // ---- the programs. Both halves, against the composer's own target so the
  // toneMapping/outputColorSpace half of the program key matches the real
  // scene pass exactly (see the header).
  let prevTarget = null;
  try { prevTarget = renderer.getRenderTarget?.() ?? null; } catch { prevTarget = null; }
  const target = opts.target !== undefined ? opts.target : (engine.composer?.renderTarget1 ?? null);
  try {
    renderer.setRenderTarget?.(target);
    try { renderer.compile?.(scene, camera); } catch (e) { console.warn('[skk] prewarm compile:', e); }
    // the draw is what CREATES the bone textures and links the shadow-depth
    // variants; character meshes are built `frustumCulled = false`, so the
    // live camera draws every one of them wherever they happen to stand
    try { renderer.render?.(scene, camera); } catch (e) { console.warn('[skk] prewarm draw:', e); }
  } finally {
    try { renderer.setRenderTarget?.(prevTarget); } catch { /* nothing to restore to */ }
  }

  // ---- second upload wave: the bone textures only exist now
  const after = charTextures(list);
  for (const t of after.values()) {
    if (texes.has(t.uuid)) continue;
    try { renderer.initTexture(t); uploaded += 1; } catch { /* cosmetic */ }
  }

  // ---- unstage, exactly as found
  for (const s of staged) {
    s.g.visible = s.visible;
    if (!s.parent) s.g.removeFromParent?.();
    else if (s.g.parent !== s.parent) s.parent.add(s.g);
  }

  return {
    players: list.length,
    textures: { before: before.textures, after: info.memory?.textures ?? 0, warmed: uploaded },
    programs: { before: before.programs, after: info.programs?.length ?? 0 },
    warmMs: +(now() - t0).toFixed(1),
  };
}

/**
 * Warm a whole cast so its first frame on screen costs what its hundredth does.
 *
 * Sets `engine.prewarmed = true` and leaves the numbers on `engine.prewarmStats`
 * (the e2e reads both). Never rejects: a warm that cannot run is a warm that
 * did nothing, not a match that doesn't start.
 *
 * @param {Object} engine the renderer wrapper (`renderer`, `scene`, `camera`, `composer`)
 * @param {Array|{home:Array,away:Array}} chars
 * @param {{compile?:boolean, decalTimeoutMs?:number, target?:*}} [opts]
 *   `compile:false` does the PAINT + the uploads only — for the pass that runs
 *   before the field (and therefore the lights) exists.
 * @returns {Promise<Object|null>} the stats, also on `engine.prewarmStats`
 */
export function prewarmCharacters(engine, chars, opts = {}) {
  const list = charList(chars);
  const t0 = now();
  const run = (async () => {
    const printed = await decalsReady(list, opts.decalTimeoutMs ?? PREWARM.decalTimeoutMs);
    const decalMs = +(now() - t0).toFixed(1);
    let stats = null;
    if (opts.compile === false) {
      // paint + uploads only: no scene render, because the program key needs
      // lights this scene may not have yet
      const renderer = engine?.renderer;
      let uploaded = 0;
      if (renderer?.initTexture) {
        for (const t of charTextures(list).values()) {
          try { renderer.initTexture(t); uploaded += 1; } catch { /* cosmetic */ }
        }
      }
      stats = {
        players: list.length,
        textures: { before: null, after: renderer?.info?.memory?.textures ?? 0, warmed: uploaded },
        programs: { before: null, after: renderer?.info?.programs?.length ?? 0 },
        warmMs: +(now() - t0 - decalMs).toFixed(1),
      };
    } else {
      stats = warmNow(engine, list, opts);
    }
    const out = {
      ...(stats ?? { players: list.length }),
      printed,
      decalMs,
      compiled: opts.compile !== false,
      totalMs: +(now() - t0).toFixed(1),
    };
    if (engine) {
      engine.prewarmStats = out;
      engine.prewarmMs = out.totalMs;
      // `prewarmed` means "the last warm finished", and only a warm that
      // actually linked programs may claim the show is safe to start.
      if (out.compiled) engine.prewarmed = true;
    }
    return out;
  })().catch((e) => {
    console.warn('[skk] prewarm skipped:', e);
    if (engine && opts.compile !== false) engine.prewarmed = true; // never gate the game on a warm that broke
    return null;
  });
  if (engine) engine.prewarmPromise = run;
  return run;
}

// test-only: the staging half, so the restore contract can be asserted without
// standing up a real WebGL context
export { warmNow };
