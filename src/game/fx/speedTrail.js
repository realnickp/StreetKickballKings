// Cleat speed trail: a short additive ribbon in the cleat colour behind a
// sprinting runner's feet — the LOCKER cleats must be SEEN doing something.
import * as THREE from 'three';
const N = 10, WIDTH = 0.28, LIFE_S = 0.32;
export class SpeedTrail {
  constructor(scene, hex) {
    this.samples = []; this.busy = false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.color = new THREE.Color(hex);
    scene.add(this.mesh);
  }
  update(pos, dir, active, nowS) {
    if (active) this.samples.unshift({ p: pos.clone().setY(0.12), t: nowS });
    while (this.samples.length > N || (this.samples.length && nowS - this.samples[this.samples.length - 1].t > LIFE_S)) this.samples.pop();
    if (this.samples.length < 2) { this.mesh.visible = false; return; }
    const pos3 = this.mesh.geometry.getAttribute('position'), col = this.mesh.geometry.getAttribute('color');
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let i = 0; i < N; i++) {
      const s = this.samples[Math.min(i, this.samples.length - 1)];
      const k = 1 - i / (N - 1), w = WIDTH * k, a = k * k;
      pos3.setXYZ(i * 2, s.p.x + perp.x * w, s.p.y, s.p.z + perp.z * w);
      pos3.setXYZ(i * 2 + 1, s.p.x - perp.x * w, s.p.y, s.p.z - perp.z * w);
      col.setXYZ(i * 2, this.color.r * a, this.color.g * a, this.color.b * a);
      col.setXYZ(i * 2 + 1, this.color.r * a, this.color.g * a, this.color.b * a);
    }
    pos3.needsUpdate = true; col.needsUpdate = true; this.mesh.visible = true;
  }
  hide() { this.samples.length = 0; this.mesh.visible = false; }
}
