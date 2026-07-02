// src/cinematics/replay.js — instant-replay capture/playback.
// ReplayRecorder ring-buffers the last N seconds of every tracked character's
// SKELETON pose (bone quats + positions), group transform, and the ball.
// Playback re-drives those transforms directly — the replay IS the real play,
// not a canned animation. ~6s x 30hz x 16 chars x 24 bones ~= 1MB. Cheap.
import * as THREE from 'three';

export class ReplayRecorder {
  constructor({ seconds = 6, hz = 30 } = {}) {
    this.maxFrames = Math.ceil(seconds * hz);
    this.interval = 1 / hz;
    this.frames = [];
    this.lastT = -Infinity;
    this.chars = [];
    this.ball = null;
    this.bonesPerChar = [];
  }

  /** call once when the match builds its characters */
  track(chars, ball) {
    this.chars = chars;
    this.ball = ball;
    this.bonesPerChar = chars.map((c) => {
      const bones = [];
      c.group.traverse((o) => { if (o.isBone) bones.push(o); });
      return bones;
    });
  }

  capture(elapsed) {
    // fixed-cadence accumulator: advancing lastT by interval (not to `elapsed`)
    // keeps a true hz rate from any frame rate; clamp if we fell far behind
    if (elapsed - this.lastT < this.interval * 0.999) return;
    this.lastT = (elapsed - this.lastT > this.interval * 3) ? elapsed : this.lastT + this.interval;
    const chars = this.chars.map((c, i) => {
      const bones = this.bonesPerChar[i];
      const data = new Float32Array(bones.length * 7);
      for (let b = 0; b < bones.length; b++) {
        bones[b].quaternion.toArray(data, b * 7);
        bones[b].position.toArray(data, b * 7 + 4);
      }
      return { px: c.group.position.x, py: c.group.position.y, pz: c.group.position.z, ry: c.group.rotation.y, bones: data };
    });
    this.frames.push({
      t: elapsed,
      ball: { x: this.ball.pos.x, y: this.ball.pos.y, z: this.ball.pos.z, visible: this.ball.mesh?.visible ?? true },
      chars,
    });
    if (this.frames.length > this.maxFrames) this.frames.shift();
  }

  /** last N seconds of frames, oldest first; null if not enough recorded */
  clipLast(seconds) {
    if (this.frames.length < 2) return null;
    const end = this.frames[this.frames.length - 1].t;
    const clip = this.frames.filter((f) => f.t >= end - seconds);
    if (clip.length < 2 || end - clip[0].t < seconds * 0.6) return null;
    return clip;
  }
}

/** write one recorded frame back onto the live objects */
export function applyFrame(frame, chars, ball, bonesPerChar = null) {
  for (let i = 0; i < frame.chars.length && i < chars.length; i++) {
    const fc = frame.chars[i];
    const c = chars[i];
    c.group.position.set(fc.px, fc.py, fc.pz);
    c.group.rotation.y = fc.ry;
    let bones = bonesPerChar?.[i];
    if (!bones) {
      bones = [];
      c.group.traverse((o) => { if (o.isBone) bones.push(o); });
    }
    for (let b = 0; b < bones.length && b * 7 + 7 <= fc.bones.length; b++) {
      bones[b].quaternion.fromArray(fc.bones, b * 7);
      bones[b].position.fromArray(fc.bones, b * 7 + 4);
    }
  }
  if (ball) {
    ball.pos.set(frame.ball.x, frame.ball.y, frame.ball.z);
    if (ball.mesh) {
      ball.mesh.position.copy(ball.pos);
      ball.mesh.visible = frame.ball.visible;
    }
  }
}

/**
 * Plays a recorded clip back in slow motion from a fresh broadcast angle:
 * snapshot live state -> letterbox + banner -> step recorded frames at `speed`
 * with a low telephoto arc around the focus subject -> restore -> onDone.
 * Emits cine:start/cine:done so matchScene's cinematicLock gates gameplay.
 */
export class ReplayPlayer {
  constructor({ engine, hud, bus }) {
    this.engine = engine;
    this.hud = hud;
    this.bus = bus;
    this.active = null;
    bus.on?.('cine:skip', () => this.finish());
    engine.onFrame((dt, rawDt) => this.update(rawDt));
  }

  play({ clip, chars, ball, focusIndex = 0, banner, bannerKind, vo, sound, speed = 0.4, onDone }) {
    if (!clip) { onDone?.(); return; }
    // snapshot the LIVE state so the world resumes exactly where it was
    const rec = new ReplayRecorder({ seconds: 1, hz: 240 });
    rec.track(chars, ball);
    rec.capture(0);
    const liveSnapshot = rec.frames[0];

    if (vo) this.bus.emit('vo', vo);
    if (sound) this.bus.emit('sfx', sound);
    this.bus.emit('sfx', 'crowd-cheer');
    if (banner) this.hud.banner(banner, bannerKind);
    this.hud.setLetterbox(true);
    this.engine.cameraLock = true;
    this.bus.emit('cine:start');

    const prevFov = this.engine.camera.fov;
    this.active = {
      clip, chars, ball, focusIndex, speed, onDone, liveSnapshot, prevFov,
      t: clip[0].t, end: clip[clip.length - 1].t,
      bonesPerChar: chars.map((c) => { const b = []; c.group.traverse((o) => { if (o.isBone) b.push(o); }); return b; }),
    };
    this.engine.camera.fov = (this.engine.baseFov ?? 58) * 0.6; // telephoto replay lens
    this.engine.camera.updateProjectionMatrix();
  }

  update(rawDt) {
    const a = this.active;
    if (!a) return;
    a.t += rawDt * a.speed;
    if (a.t >= a.end) return this.finish();

    // find the frame at replay-time t (frames are oldest-first)
    let f = a.clip[0];
    for (const fr of a.clip) { if (fr.t <= a.t) f = fr; else break; }
    applyFrame(f, a.chars, a.ball, a.bonesPerChar);

    // low telephoto arc around the focus subject's recorded position
    const fc = f.chars[a.focusIndex] ?? f.chars[0];
    const k = (a.t - a.clip[0].t) / (a.end - a.clip[0].t);
    const ang = -0.5 + k * 0.75; // slow orbital drift across the replay
    const cx = fc.px + Math.sin(ang) * 6.5;
    const cz = fc.pz + Math.cos(ang) * 6.5;
    this.engine.camera.position.set(cx, 1.4, cz);
    this.engine.camera.lookAt(fc.px, 1.1, fc.pz);
  }

  finish() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    applyFrame(a.liveSnapshot, a.chars, a.ball, a.bonesPerChar); // world back to live
    this.engine.camera.fov = a.prevFov;
    this.engine.camera.updateProjectionMatrix();
    this.engine.cameraLock = false;
    this.hud.setLetterbox(false);
    this.hud.hideBanner();
    this.bus.emit('cine:done');
    a.onDone?.();
  }
}
