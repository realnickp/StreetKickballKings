// Locker turntable: the player's captain, the real match GLB, in the equipped
// kit + cleats — a kit or cleat change must be SEEN the second it's tapped
// (dev, 2026-08-25). Own tiny renderer: screens sit on an opaque background,
// so the main engine canvas can't show through.
import * as THREE from 'three';
import { buildCaptainPreview } from '../game/glbCharacters.js';

export class LockerPreview {
  constructor(canvas) {
    this.canvas = canvas;
    // preserveDrawingBuffer: the e2e pass reads pixels back off this canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
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
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (this.char) { this.char.group.rotation.y += dt * 0.6; this.char.animator?.update?.(dt); }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  async show({ team, uniformHex, gear }) {
    const token = ++this.token;
    const next = await buildCaptainPreview(team, uniformHex, gear);
    if (token !== this.token) return; // a newer equip won the race
    if (this.char) this.scene.remove(this.char.group);
    this.char = next;
    this.char.group.position.set(0, 0, 0);
    this.char.animator?.play?.('idle');
    this.scene.add(this.char.group);
  }

  // dispose() frees three's resources but leaves the GL context alive until GC.
  // The Locker re-mounts on EVERY equip tap, so those pile up and Chrome evicts
  // the oldest context to stay under its per-page cap — which is the MAIN game
  // canvas. Verified 2026-08-25: ~15 equip taps and #game-canvas went dead.
  // forceContextLoss() hands this one back immediately.
  destroy() {
    this.running = false;
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}
