// The Locker turntable owns its own WebGL context. destroy() hands that
// context back with forceContextLoss() — which fires 'webglcontextlost' on the
// canvas. That self-inflicted loss must NOT look like a phone dropping the
// context: the screen's onLost rebuild would mount a brand-new renderer + a
// full captain on a detached canvas, rendering forever under the match (the
// iPhone reload, 2026-09-28).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  class Obj { constructor() { this.position = { set() {} }; } add() {} remove() {} lookAt() {} updateProjectionMatrix() {} }
  class WebGLRenderer {
    constructor({ canvas }) { this.canvas = canvas; }
    setPixelRatio() {} setSize() {} render() {} dispose() {}
    forceContextLoss() { this.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); }
  }
  class Clock { getDelta() { return 0.016; } }
  return { WebGLRenderer, Scene: Obj, HemisphereLight: Obj, DirectionalLight: Obj, PerspectiveCamera: Obj, Clock, ACESFilmicToneMapping: 4 };
});
vi.mock('../src/game/glbCharacters.js', () => ({ buildCaptainPreview: vi.fn(), disposeCharacter: vi.fn() }));

const { LockerPreview } = await import('../src/ui/lockerPreview.js');

const fakeCanvas = () => Object.assign(new EventTarget(), { clientWidth: 200, clientHeight: 260 });

beforeEach(() => {
  globalThis.location = { search: '' };
  globalThis.window = { devicePixelRatio: 2 };
  globalThis.requestAnimationFrame = () => 0; // one frame is enough
});

describe('LockerPreview context loss', () => {
  it('destroy() does not report its own forceContextLoss as a lost context', () => {
    const canvas = fakeCanvas();
    const preview = new LockerPreview(canvas);
    const onLost = vi.fn();
    preview.onLost = onLost;
    preview.destroy();
    expect(onLost).not.toHaveBeenCalled();
  });

  it('a real context loss while running still asks the screen to rebuild', () => {
    const canvas = fakeCanvas();
    const preview = new LockerPreview(canvas);
    const onLost = vi.fn();
    preview.onLost = onLost;
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(preview.running).toBe(false);
  });
});
