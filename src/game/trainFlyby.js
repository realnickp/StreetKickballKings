// Visible el-train for the El Train Rumble proc (dev: "whenever it rumbles
// like that, you should absolutely see the train"). A code-built graffiti
// train slides along the painted track line above the backdrop wall while the
// element is active, synced to the same 4.5s proc window that shakes the
// camera. Everything is primitives + one canvas texture, matching the
// procedural-diorama approach of field.js.
import * as THREE from 'three';

const CAR_LEN = 7.2;
const CAR_H = 2.5;
const CAR_W = 1.6;
const CAR_GAP = 0.5;
const CARS = 4;

/** One shared canvas texture: silver car body, lit window strip, graffiti. */
function makeCarTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#9aa0a8';                       // stainless body
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#6d7278';                       // roofline + skirt
  g.fillRect(0, 0, 256, 10);
  g.fillRect(0, 78, 256, 18);
  // graffiti color blocks along the lower body
  const spray = ['#d84f9c', '#3fb2d9', '#e8c33a', '#7bc95f', '#e06238'];
  for (let i = 0; i < 7; i++) {
    g.fillStyle = spray[i % spray.length];
    const w = 18 + ((i * 37) % 30);
    g.globalAlpha = 0.85;
    g.fillRect((i * 41) % 238, 48 + ((i * 13) % 22), w, 16);
  }
  g.globalAlpha = 1;
  // lit window band
  for (let i = 0; i < 8; i++) {
    g.fillStyle = '#ffd98a';
    g.fillRect(10 + i * 31, 18, 22, 20);
    g.fillStyle = '#4a4e54';
    g.fillRect(10 + i * 31 + 22, 18, 9, 20);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class TrainFlyby {
  /**
   * @param {THREE.Scene} scene
   * @param {{r:number,h:number,bottom:number}} geo backdrop ring geometry —
   *   the track paints at ~71% up the blacktop wall band (grid-measured).
   */
  constructor(scene, geo = {}) {
    this.radius = (geo.r ?? 49) - 1.5;             // just inside the painted wall
    this.trackY = (geo.bottom ?? 0.3) + (geo.h ?? 17) * 0.71;
    this.activeS = 4.5;                            // matches CityElements PROC.activeS
    this.spanRad = (200 * Math.PI) / 180;          // enter/exit beyond the foul poles
    this.t = -1;                                   // <0 = parked offscreen
    this.dir = 1;

    this.group = new THREE.Group();
    this.group.visible = false;
    const tex = makeCarTexture();
    const bodyMat = new THREE.MeshBasicMaterial({ map: tex }); // self-lit, night-proof
    this.cars = [];
    for (let i = 0; i < CARS; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(CAR_LEN, CAR_H, CAR_W), bodyMat);
      this.group.add(car);
      this.cars.push(car);
    }
    scene.add(this.group);
  }

  /** Kick off one pass (called on the element's proc-start). */
  start() {
    this.t = 0;
    this.dir = this.dir === 1 ? -1 : 1; // alternate direction each rumble
    this.group.visible = true;
  }

  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    const k = this.t / this.activeS;               // 0..1 over the proc window
    if (k >= 1) { this.t = -1; this.group.visible = false; return; }
    // head azimuth sweeps the outfield arc; 0 = dead centerfield (−Z)
    const azHead = this.dir * (this.spanRad / 2 - k * this.spanRad);
    const spacing = (CAR_LEN + CAR_GAP) / this.radius; // rad between car centers
    for (let i = 0; i < this.cars.length; i++) {
      const az = azHead + this.dir * i * spacing;
      const car = this.cars[i];
      car.position.set(
        Math.sin(az) * this.radius,
        this.trackY + Math.sin((this.t + i) * 14) * 0.05, // clatter bob
        -Math.cos(az) * this.radius,
      );
      car.rotation.y = -az; // box length (X) runs tangent to the ring
    }
  }
}
