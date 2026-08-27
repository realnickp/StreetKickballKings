// Locker turntable: the player's captain, the real match GLB, in the equipped
// kit + cleats — a kit or cleat change must be SEEN the second it's tapped
// (dev, 2026-08-25). Own tiny renderer: screens sit on an opaque background,
// so the main engine canvas can't show through.
import * as THREE from 'three';
import { buildCaptainPreview } from '../game/glbCharacters.js';

export class LockerPreview {
  constructor(canvas) {
    this.canvas = canvas;
    // preserveDrawingBuffer: the e2e pass reads pixels back off this canvas.
    // It costs a full-canvas copy every frame, so it's ON ONLY under ?e2e —
    // real phones get the cheap path.
    const e2e = new URLSearchParams(location.search).has('e2e');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: e2e });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth || 220, canvas.clientHeight || 260, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.35;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#6a6058', 1.6));
    const key = new THREE.DirectionalLight('#fff4e0', 2.2); key.position.set(2, 4, 3); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9fd0ff', 0.8); rim.position.set(-3, 3, -3); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(30, (canvas.clientWidth || 220) / (canvas.clientHeight || 260), 0.1, 50);
    this.camera.position.set(0, 1.15, 4.2); this.camera.lookAt(0, 1.0, 0);
    this.char = null; this.token = 0; this.clock = new THREE.Clock(); this.running = true;
    this.spinning = true; // false while a tapped move plays, so it faces the lens
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (this.char) {
        if (this.spinning) this.char.group.rotation.y += dt * 0.6;
        this.char.animator?.update?.(dt);
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  async show({ team, uniformHex, gear }) {
    const token = ++this.token;
    const next = await buildCaptainPreview(team, uniformHex, gear);
    if (token !== this.token) return; // a newer equip won the race
    if (!this.running) return;        // ...or the screen unmounted while it loaded
    if (this.char) this.scene.remove(this.char.group);
    this.char = next;
    this.char.group.position.set(0, 0, 0);
    this.char.animator?.play?.('idle');
    this.spinning = true; // a rebuild always goes back to the turntable
    this.scene.add(this.char.group);
  }

  /** Play an owned kick/taunt on the turntable (one-shot → back to idle).
   *  Returns false when the clip isn't loaded yet (the extras packs stream in
   *  behind the model) so the caller can fall back to a plain rebuild.
   *  Squares the captain up at yaw 0 — the character's forward is +z (see
   *  matchScene's `faceYaw = atan2(dir.x, dir.z)`) and the camera sits at
   *  +z 4.2 — so the move is performed INTO the lens, not away from it. */
  playMove(clip) {
    if (!this.running) return false; // torn down — nothing to play on
    const a = this.char?.animator;
    if (!a?.hasClip?.(clip)) return false;
    this.spinning = false;
    this.char.group.rotation.y = 0;
    a.play(clip, { onDone: () => { if (this.char?.animator === a) { a.play('idle'); this.spinning = true; } } });
    return true;
  }

  // dispose() frees three's resources but leaves the GL context alive until GC.
  // Contexts pile up and Chrome evicts the oldest to stay under its per-page cap
  // — which is the MAIN game canvas. Verified 2026-08-25, back when the Locker
  // re-mounted on every equip tap: ~15 taps and #game-canvas went dead. Equips
  // no longer remount (2026-08-27), but menu→Locker→menu round trips still would,
  // so forceContextLoss() hands this one back immediately.
  destroy() {
    // bump the token FIRST: a buildCaptainPreview() still in flight resolves
    // after this and would otherwise pass the race guard and add a fully-loaded
    // character to a scene nobody renders — orphaning its GPU buffers.
    this.token += 1;
    this.running = false;
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}
