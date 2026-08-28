import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  PREWARM, charList, charTextures, decalsReady, prewarmCharacters, warmNow,
} from '../src/game/prewarm.js';

// ---------------------------------------------------------------- fixtures
const tex = (name) => { const t = new THREE.Texture(); t.name = name; return t; };

/** A character the way glbCharacters builds one: a group holding a skinned body
 *  with a recoloured atlas (re-used as its own emissive map), two skinned decal
 *  patches with their own canvases, and a band. */
function fakeChar(name, { decals = true, ready = Promise.resolve() } = {}) {
  const group = new THREE.Group();
  group.name = name;
  const atlas = tex(`${name}-atlas`);
  const body = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas }));
  body.isSkinnedMesh = true;
  body.skeleton = { boneTexture: null }; // three creates this at FIRST DRAW
  group.add(body);
  const char = { group, body };
  if (decals) {
    const front = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: tex(`${name}-front`) }));
    const back = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: tex(`${name}-back`) }));
    group.add(front, back);
    char.decals = { front, back, ready };
  }
  const band = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map: tex(`${name}-band`) }));
  group.add(band);
  char.accessories = { meshes: [band] };
  return char;
}

/** A renderer stub that records the ORDER of everything and, like the real one,
 *  only grows a skeleton's bone texture when a draw actually happens. */
function fakeEngine({ throwOnCompile = false } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const target = { isWebGLRenderTarget: true, name: 'composer-rt1' };
  const log = [];
  let current = null;
  const info = { memory: { textures: 0, geometries: 0 }, programs: [] };
  const renderer = {
    info,
    initTexture(t) { log.push(['initTexture', t.name]); info.memory.textures += 1; },
    getRenderTarget() { return current; },
    setRenderTarget(rt) { current = rt; log.push(['setRenderTarget', rt ? rt.name : null]); },
    compile(sc, cam) {
      if (throwOnCompile) throw new Error('no GL');
      log.push(['compile', sc === scene, cam === camera, current ? current.name : null]);
      info.programs.push({ id: info.programs.length });
    },
    render(sc, cam) {
      log.push(['render', sc === scene, cam === camera, current ? current.name : null,
        // what the draw would actually SEE
        sc.children.filter((o) => o.visible).length]);
      sc.traverse((o) => {
        if (o.isSkinnedMesh && o.skeleton && !o.skeleton.boneTexture) o.skeleton.boneTexture = tex(`${o.parent?.name}-bones`);
      });
    },
  };
  return { engine: { renderer, scene, camera, composer: { renderTarget1: target } }, log, target };
}

const names = (log, op) => log.filter((r) => r[0] === op).map((r) => r[1]);

// ---------------------------------------------------------------- charList
describe('charList', () => {
  it('flattens a {home,away} cast and a flat array the same way', () => {
    const h = [fakeChar('h0'), fakeChar('h1')];
    const a = [fakeChar('a0')];
    expect(charList({ home: h, away: a }).map((c) => c.group.name)).toEqual(['h0', 'h1', 'a0']);
    expect(charList([...h, ...a]).map((c) => c.group.name)).toEqual(['h0', 'h1', 'a0']);
  });
  it('drops nulls and bodiless entries, and survives nothing at all', () => {
    expect(charList(null)).toEqual([]);
    expect(charList([null, {}, fakeChar('x')]).length).toBe(1);
    expect(charList({ home: [fakeChar('h')] }).length).toBe(1);
  });
});

// ------------------------------------------------------------ charTextures
describe('charTextures', () => {
  it('finds every map a character carries and dedupes the shared ones by uuid', () => {
    const c = fakeChar('p');
    const found = [...charTextures([c]).values()].map((t) => t.name).sort();
    // atlas is BOTH map and emissiveMap on the body — one texture, one entry
    expect(found).toEqual(['p-atlas', 'p-back', 'p-band', 'p-front']);
  });

  it('picks up the skeleton bone texture once the first draw has made it', () => {
    const c = fakeChar('p');
    expect([...charTextures([c]).values()].some((t) => /bones/.test(t.name))).toBe(false);
    c.body.skeleton.boneTexture = tex('p-bones');
    expect([...charTextures([c]).values()].some((t) => t.name === 'p-bones')).toBe(true);
  });

  it('accumulates a whole cast into one map', () => {
    const cast = { home: [fakeChar('h0'), fakeChar('h1')], away: [fakeChar('a0')] };
    expect(charTextures(cast).size).toBe(3 * 4);
  });
});

// ------------------------------------------------------------- decalsReady
describe('decalsReady', () => {
  it('waits for every print and counts them', async () => {
    let paintA; let paintB;
    const a = fakeChar('a', { ready: new Promise((r) => { paintA = r; }) });
    const b = fakeChar('b', { ready: new Promise((r) => { paintB = r; }) });
    let done = false;
    const p = decalsReady([a, b]).then((n) => { done = true; return n; });
    await Promise.resolve();
    expect(done).toBe(false);
    paintA(); await Promise.resolve();
    expect(done).toBe(false);   // one vest printed is not the crew printed
    paintB();
    expect(await p).toBe(2);
    expect(done).toBe(true);
  });

  it('a print that FAILS never blocks the crew', async () => {
    const bad = fakeChar('bad', { ready: Promise.reject(new Error('no logo')) });
    await expect(decalsReady([bad, fakeChar('ok')])).resolves.toBe(2);
  });

  it('a print that never lands times out instead of holding the match', async () => {
    vi.useFakeTimers();
    try {
      const stuck = fakeChar('stuck', { ready: new Promise(() => {}) });
      const p = decalsReady([stuck], 50);
      vi.advanceTimersByTime(60);
      await expect(p).resolves.toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it('a crew with no decals at all resolves immediately', async () => {
    await expect(decalsReady([fakeChar('bare', { decals: false })])).resolves.toBe(0);
  });

  it('ships a timeout so a hung print can never hold the show', () => {
    expect(PREWARM.decalTimeoutMs).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------- prewarmCharacters
describe('prewarmCharacters', () => {
  it('paints, uploads, compiles and DRAWS before it resolves', async () => {
    const { engine, log, target } = fakeEngine();
    const cast = { home: [fakeChar('h0'), fakeChar('h1')], away: [fakeChar('a0')] };
    for (const c of charList(cast)) engine.scene.add(c.group);
    const stats = await prewarmCharacters(engine, cast);

    // every map uploaded up front, every bone texture uploaded after the draw
    const uploads = names(log, 'initTexture');
    expect(uploads.filter((n) => /atlas|front|back|band/.test(n)).length).toBe(3 * 4);
    expect(uploads.filter((n) => /bones/.test(n)).length).toBe(3);
    expect(log.findIndex((r) => r[0] === 'render')).toBeLessThan(log.findIndex((r) => /bones/.test(r[1] ?? '')));

    // the programs are linked against the COMPOSER's target, not the screen —
    // three keys a program on toneMapping, which only applies when the target
    // is null, so warming to the screen links the wrong variant
    const compiled = log.find((r) => r[0] === 'compile');
    const drawn = log.find((r) => r[0] === 'render');
    expect(compiled).toEqual(['compile', true, true, target.name]);
    expect(drawn.slice(0, 4)).toEqual(['render', true, true, target.name]);
    expect(engine.renderer.getRenderTarget()).toBe(null); // and handed back

    expect(stats.players).toBe(3);
    expect(stats.compiled).toBe(true);
    expect(stats.textures.warmed).toBe(3 * 5);      // 4 maps + 1 bone texture each
    expect(stats.programs.after).toBeGreaterThan(stats.programs.before);
    expect(engine.prewarmed).toBe(true);
    expect(engine.prewarmStats).toBe(stats);
    expect(engine.prewarmMs).toBeGreaterThanOrEqual(0);
  });

  it('shows the whole cast to the draw, then puts every body back as it was', async () => {
    const { engine, log } = fakeEngine();
    const cast = [fakeChar('c0'), fakeChar('c1')];
    for (const c of cast) { engine.scene.add(c.group); c.group.visible = false; } // lineupIntro's empty stage
    await prewarmCharacters(engine, cast);
    const drawn = log.find((r) => r[0] === 'render');
    expect(drawn[4]).toBe(2);                          // both were visible FOR the draw
    expect(cast.every((c) => c.group.visible === false)).toBe(true); // and hidden again after
  });

  it('stages a cast that is not on the graph yet and leaves it off again', async () => {
    const { engine } = fakeEngine();
    const cast = [fakeChar('orphan')];
    expect(cast[0].group.parent).toBe(null);
    await prewarmCharacters(engine, cast);
    expect(cast[0].group.parent).toBe(null);
    expect(engine.scene.children).toHaveLength(0);
  });

  it('the show cannot start before the print lands', async () => {
    const { engine } = fakeEngine();
    let paint;
    const cast = [fakeChar('slow', { ready: new Promise((r) => { paint = r; }) })];
    const p = prewarmCharacters(engine, cast);
    await Promise.resolve(); await Promise.resolve();
    expect(engine.prewarmed).toBeUndefined();
    paint();
    await p;
    expect(engine.prewarmed).toBe(true);
  });

  it('{compile:false} is the paint-and-upload pass — no draw, and it does not clear the gate', async () => {
    const { engine, log } = fakeEngine();
    const cast = [fakeChar('v0'), fakeChar('v1')];
    const stats = await prewarmCharacters(engine, cast, { compile: false });
    expect(log.some((r) => r[0] === 'compile' || r[0] === 'render')).toBe(false);
    expect(names(log, 'initTexture')).toHaveLength(2 * 4);
    expect(stats.compiled).toBe(false);
    expect(engine.prewarmed).toBeUndefined(); // only a LIT warm may open the gate
  });

  it('never rejects, and a broken warm still opens the gate', async () => {
    const { engine } = fakeEngine({ throwOnCompile: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(prewarmCharacters(engine, [fakeChar('c')])).resolves.toBeTruthy();
      expect(engine.prewarmed).toBe(true);
    } finally { warn.mockRestore(); }
  });

  it('hands the promise to the engine so the scene can gate on it', async () => {
    const { engine } = fakeEngine();
    const p = prewarmCharacters(engine, [fakeChar('c')]);
    expect(engine.prewarmPromise).toBe(p);
    await p;
  });

  it('a renderer-less engine is a no-op, not a crash', async () => {
    await expect(prewarmCharacters({}, [fakeChar('c')])).resolves.toBeTruthy();
    expect(warmNow({}, [fakeChar('c')])).toBe(null);
  });
});
