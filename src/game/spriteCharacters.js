// Higgsfield-rendered sprite characters: 4x4 pose sheets on chroma green,
// keyed out at load, billboarded in the 3D world. Replaces the procedural
// primitive characters as the canonical player visual.
import * as THREE from 'three';

// (col, row) in the 4x4 sheet — row 0 is the TOP row of the image
export const FRAMES = {
  idleF: [0, 0], runF1: [1, 0], runF2: [2, 0], catch: [3, 0],
  throw: [0, 1], stumble: [1, 1], dance: [2, 1], dejected: [3, 1],
  plate: [0, 2], windup: [1, 2], contact: [2, 2], follow: [3, 2],
  runB1: [0, 3], runB2: [1, 3], point: [2, 3], crouch: [3, 3],
};

const sheetCache = new Map();

/** Load a sheet and chroma-key the green background to transparency. */
export function loadSheet(url) {
  if (sheetCache.has(url)) return sheetCache.get(url);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        if (g > 80 && g > r * 1.25 && g > b * 1.25) {
          px[i + 3] = 0; // key out
        } else if (g > Math.max(r, b)) {
          // despill green fringe
          px[i + 1] = Math.max(r, b);
        }
      }
      ctx.putImageData(data, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      resolve(tex);
    };
    img.onerror = reject;
    img.src = url;
  });
  sheetCache.set(url, promise);
  return promise;
}

export class SpriteCharacter {
  constructor(sheetTex, engine, { heightM = 2.05, runTex = null } = {}) {
    this.engine = engine;
    this.group = new THREE.Group();

    const tex = sheetTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1 / 4, 1 / 4);
    this.tex = tex;

    // optional dedicated 16-frame sprint cycle sheet (8 front + 8 back)
    if (runTex) {
      this.runTex = runTex.clone();
      this.runTex.needsUpdate = true;
      this.runTex.repeat.set(1 / 4, 1 / 4);
    }

    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(heightM, heightM),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }),
    );
    this.plane.position.y = heightM / 2 - 0.06; // feet on the ground
    this.group.add(this.plane);

    // blob shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 20),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.group.add(shadow);

    this.setFrame('idleF');
    this.animator = new SpriteAnimator(this);
    this.lastPos = new THREE.Vector3();
  }

  setFrame(name) {
    if (this.plane.material.map !== this.tex) {
      this.plane.material.map = this.tex;
      this.plane.material.needsUpdate = true;
    }
    const f = FRAMES[name] ?? FRAMES.idleF;
    this.tex.offset.set(f[0] / 4, 1 - (f[1] + 1) / 4);
  }

  /** i in 0..7 on the sprint sheet; away = back-view rows. */
  setRunFrame(i, away) {
    if (!this.runTex) return false;
    if (this.plane.material.map !== this.runTex) {
      this.plane.material.map = this.runTex;
      this.plane.material.needsUpdate = true;
    }
    const col = i % 4;
    const row = Math.floor(i / 4) + (away ? 2 : 0);
    this.runTex.offset.set(col / 4, 1 - (row + 1) / 4);
    return true;
  }

  /** kick up a little asphalt while sprinting */
  spawnDust() {
    if (!this.dust) {
      this.dust = [];
      for (let i = 0; i < 6; i++) {
        const d = new THREE.Mesh(
          new THREE.CircleGeometry(0.16, 8),
          new THREE.MeshBasicMaterial({ color: '#9b958c', transparent: true, opacity: 0, depthWrite: false }),
        );
        d.rotation.x = -Math.PI / 2;
        d.userData.life = 0;
        this.engine.scene.add(d);
        this.dust.push(d);
      }
      this.dustIdx = 0;
    }
    const d = this.dust[this.dustIdx];
    this.dustIdx = (this.dustIdx + 1) % this.dust.length;
    d.position.copy(this.group.position).setY(0.04);
    d.position.x += (Math.random() - 0.5) * 0.3;
    d.position.z += (Math.random() - 0.5) * 0.3;
    d.scale.setScalar(0.6 + Math.random() * 0.5);
    d.userData.life = 1;
  }

  updateDust(dt) {
    if (!this.dust) return;
    for (const d of this.dust) {
      if (d.userData.life <= 0) continue;
      d.userData.life -= dt * 2.6;
      d.material.opacity = Math.max(0, d.userData.life) * 0.4;
      d.scale.multiplyScalar(1 + dt * 1.8);
    }
  }

  /** Y-axis billboard + track movement direction for run frame picking. */
  billboard() {
    const cam = this.engine.camera.position;
    this.plane.parent.rotation.y = Math.atan2(cam.x - this.group.position.x, cam.z - this.group.position.z);
  }
}

const DANCE_CYCLE = ['dance', 'point'];

class SpriteAnimator {
  constructor(char) {
    this.char = char;
    this.ctx = { speedFactor: 1 };
    this.t = 0;
    this.name = 'idle';
    this.onContact = null;
    this.onDone = null;
    this.contactFired = false;
    this.movingAway = false;
  }

  play(name, { onContact = null, onDone = null, speedFactor = 1 } = {}) {
    this.name = name;
    this.t = 0;
    this.onContact = onContact;
    this.onDone = onDone;
    this.contactFired = false;
    this.ctx.speedFactor = speedFactor;
  }

  update(dt) {
    const c = this.char;
    this.t += dt;
    const t = this.t;
    const p = c.plane;

    // subtle life: bob/squash so stills never feel frozen
    let bob = 0;
    let squash = 1;

    switch (this.name) {
      case 'run': {
        const away = this.movingAwayFromCamera();
        if (c.runTex) {
          // true 8-frame sprint cycle at ~13fps, scaled by speed
          const rate = 0.075 / Math.max(0.55, this.ctx.speedFactor);
          c.setRunFrame(Math.floor(t / rate) % 8, away);
        } else {
          const rate = 0.16 / Math.max(0.5, this.ctx.speedFactor);
          const frame = Math.floor(t / rate) % 2;
          c.setFrame(away ? (frame ? 'runB2' : 'runB1') : (frame ? 'runF2' : 'runF1'));
        }
        bob = Math.abs(Math.sin(t * 18)) * 0.035;
        this.dustTimer = (this.dustTimer ?? 0) - dt;
        if (this.dustTimer <= 0) {
          this.dustTimer = 0.09;
          c.spawnDust();
        }
        break;
      }
      case 'kick': {
        const k = t / 0.7;
        if (k < 0.3) c.setFrame('plate');
        else if (k < 0.5) c.setFrame('windup');
        else {
          if (!this.contactFired) {
            this.contactFired = true;
            this.onContact?.();
          }
          c.setFrame(k < 0.72 ? 'contact' : 'follow');
        }
        if (k >= 1 && this.onDone) { const d = this.onDone; this.onDone = null; d(); }
        break;
      }
      case 'throw': {
        const k = t / 0.5;
        c.setFrame('throw');
        if (k >= 0.45 && !this.contactFired) {
          this.contactFired = true;
          this.onContact?.();
        }
        if (k >= 1 && this.onDone) { const d = this.onDone; this.onDone = null; d(); }
        break;
      }
      case 'catch':
        c.setFrame('catch');
        break;
      case 'stumble':
        c.setFrame('stumble');
        squash = 1 - Math.sin(Math.min(1, t / 1.1) * Math.PI) * 0.12;
        if (t >= 1.1 && this.onDone) { const d = this.onDone; this.onDone = null; d(); }
        break;
      case 'dance1':
      case 'dance2':
      case 'dance3':
      case 'dance4': {
        const frame = Math.floor(t / 0.38) % DANCE_CYCLE.length;
        c.setFrame(DANCE_CYCLE[frame]);
        bob = Math.abs(Math.sin(t * 8.2)) * 0.1;
        squash = 1 + Math.sin(t * 8.2) * 0.05;
        break;
      }
      case 'dejected':
        c.setFrame('dejected');
        bob = Math.sin(t * 1.6) * 0.012;
        break;
      case 'plate':
        c.setFrame('plate');
        squash = 1 + Math.sin(t * 3.2) * 0.012;
        break;
      case 'crouch':
        c.setFrame('crouch');
        squash = 1 + Math.sin(t * 3.2) * 0.015;
        break;
      case 'idle':
      default:
        c.setFrame('idleF');
        squash = 1 + Math.sin(t * 2.4) * 0.012;
        break;
    }

    p.position.y = p.geometry.parameters.height / 2 - 0.06 + bob;
    p.scale.y = squash;
    c.billboard();
    c.updateDust(dt);
    c.lastPos.copy(c.group.position);
  }

  movingAwayFromCamera() {
    const c = this.char;
    const moved = c.group.position.clone().sub(c.lastPos);
    if (moved.lengthSq() < 1e-8) return this.movingAway;
    const toCam = this.char.engine.camera.position.clone().sub(c.group.position);
    this.movingAway = moved.dot(toCam) < 0;
    return this.movingAway;
  }
}

/** Build the character set for one team from its sheet URLs. */
export async function buildTeamSprites(team, engine) {
  const sheets = await Promise.all((team.sprites ?? []).map(loadSheet));
  const runSheets = await Promise.all((team.runSprites ?? []).map(loadSheet));
  return team.roster.map((p, i) => {
    const char = new SpriteCharacter(sheets[i % sheets.length], engine, {
      runTex: runSheets.length ? runSheets[i % runSheets.length] : null,
    });
    char.data = p;
    return char;
  });
}
