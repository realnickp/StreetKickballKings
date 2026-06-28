// Ball FX for crushed kicks: fire trail (additive sprite particles) +
// crackling lightning bolts that regenerate every few frames.
import * as THREE from 'three';

function makeGlowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Lightweight, crash-safe "fire pitch" look on the in-flight ball ---
// Emissive-orange tint on the ball material + an additive glow sprite riding it.
// Purely visual; never throws into gameplay (callers also wrap in try/catch).
let _fireGlowTex = null;
function fireGlowTex() {
  if (!_fireGlowTex) _fireGlowTex = makeGlowTexture('rgba(255,210,130,0.95)', 'rgba(255,90,20,0.6)');
  return _fireGlowTex;
}

export function igniteBall(ball) {
  try {
    const mesh = ball?.mesh;
    if (!mesh) return;
    const mat = mesh.material;
    if (mat && mat.emissive) {
      if (ball._fireSaved === undefined) {
        ball._fireSaved = { hex: mat.emissive.getHex(), intensity: mat.emissiveIntensity ?? 1 };
      }
      mat.emissive.set('#ff5a1e');
      mat.emissiveIntensity = 1.7;
    }
    if (!ball._fireGlow) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: fireGlowTex(),
        color: '#ff7a2a',
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }));
      glow.scale.set(1.5, 1.5, 1);
      mesh.add(glow);
      ball._fireGlow = glow;
    }
    ball._fireGlow.visible = true;
  } catch (e) {
    console.error('[skk] igniteBall (recovered):', e);
  }
}

export function douseBall(ball) {
  try {
    const mesh = ball?.mesh;
    if (!mesh) return;
    const mat = mesh.material;
    if (mat && mat.emissive && ball._fireSaved !== undefined) {
      mat.emissive.setHex(ball._fireSaved.hex);
      mat.emissiveIntensity = ball._fireSaved.intensity;
      ball._fireSaved = undefined;
    }
    if (ball._fireGlow) ball._fireGlow.visible = false;
  } catch (e) {
    console.error('[skk] douseBall (recovered):', e);
  }
}

export class BallFx {
  constructor(scene) {
    this.scene = scene;
    this.active = false;

    // fire: a pool of sprites cycling from ball position outward/up
    this.fireTex = makeGlowTexture('rgba(255,240,180,1)', 'rgba(255,196,0,0.85)');
    this.fireCount = 36;
    this.fire = [];
    for (let i = 0; i < this.fireCount; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.fireTex,
        color: i % 3 === 0 ? '#ff5722' : i % 3 === 1 ? '#ffac1c' : '#ffe27a',
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }));
      s.visible = false;
      s.userData = { life: 0, vel: new THREE.Vector3() };
      scene.add(s);
      this.fire.push(s);
    }
    this.fireIdx = 0;

    // lightning: jagged line segments around the ball
    this.boltMat = new THREE.LineBasicMaterial({
      color: '#9ad8ff',
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bolts = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      const line = new THREE.Line(geo, this.boltMat);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.bolts.push(line);
    }
    this.boltTimer = 0;

    // glow sprite riding the ball
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,200,120,0.95)', 'rgba(255,90,30,0.55)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.glow.scale.set(2.4, 2.4, 1);
    this.glow.visible = false;
    scene.add(this.glow);
  }

  start(ball) {
    this.ball = ball;
    this.active = true;
    this.glow.visible = true;
  }

  stop() {
    this.active = false;
    this.glow.visible = false;
    for (const b of this.bolts) b.visible = false;
    // fire sprites burn out on their own
  }

  /** dt = real (unscaled) seconds so FX stay lively during slow-mo */
  update(dt) {
    // decay live fire
    for (const s of this.fire) {
      if (!s.visible) continue;
      s.userData.life -= dt * 2.2;
      if (s.userData.life <= 0) {
        s.visible = false;
        continue;
      }
      s.position.addScaledVector(s.userData.vel, dt);
      const k = s.userData.life;
      s.scale.setScalar(0.35 + (1 - k) * 0.9);
      s.material.opacity = k;
    }

    if (!this.active || !this.ball) return;
    const p = this.ball.pos;
    this.glow.position.copy(p);

    // spawn fire at the ball
    for (let n = 0; n < 3; n++) {
      const s = this.fire[this.fireIdx];
      this.fireIdx = (this.fireIdx + 1) % this.fireCount;
      s.visible = true;
      s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
      s.userData.life = 1;
      s.userData.vel.set((Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2);
      s.scale.setScalar(0.4);
      s.material.opacity = 1;
    }

    // lightning crackle
    this.boltTimer -= dt;
    if (this.boltTimer <= 0) {
      this.boltTimer = 0.05;
      for (const bolt of this.bolts) {
        bolt.visible = true;
        const pos = bolt.geometry.attributes.position;
        let dir = new THREE.Vector3().randomDirection();
        let cur = p.clone().addScaledVector(dir, 0.3);
        for (let i = 0; i < 8; i++) {
          pos.setXYZ(i, cur.x, cur.y, cur.z);
          cur = cur.add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
          )).addScaledVector(dir, 0.18);
        }
        pos.needsUpdate = true;
      }
    }
  }
}
