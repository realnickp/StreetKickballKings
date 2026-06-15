// CinematicDirector: in-play moments (homer, catch, peg, crushed kick) are
// rendered IN-ENGINE as motion-comic panels — the real play frozen and snapped
// into a 2D comic frame (ink lines, posterized color, halftone, speed lines,
// spray-paint stamp). Flat sprites read as intentional comic art, and the panel
// always matches the actual play because it IS the play. Pre-rendered Higgsfield
// VIDEO is reserved for fixed-context set pieces (splash, team intros, coin
// toss, championship) handled by the screen layer, not here.
// Every cinematic is tap-skippable ('cine:skip' on the bus).
import * as THREE from 'three';
import { BallFx } from './fx.js';

const DANCES = ['dance1', 'dance2', 'dance3', 'dance4'];

export class CinematicDirector {
  constructor({ engine, bus, hud, getBall }) {
    this.engine = engine;
    this.bus = bus;
    this.hud = hud;
    this.getBall = getBall;
    this.fx = new BallFx(engine.scene);
    this.script = null;
    this.danceIdx = Math.floor(Math.random() * 4);

    bus.on('cine:perfect', (p) => this.perfectKick(p));
    bus.on('cine:crowned', (p) => this.crowned(p));
    bus.on('cine:robbed', (p) => this.robbed(p));
    bus.on('cine:pegged', (p) => this.pegged(p));
    bus.on('cine:special', (p) => this.special(p));
    bus.on('cine:skip', () => this.skip());

    engine.onFrame((dt, rawDt) => this.update(dt, rawDt));
  }

  // ---------- script engine ----------
  run(steps, { lockCamera = true } = {}) {
    this.skip(); // end anything already running
    this.script = { steps, i: 0, t: 0, lockCamera };
    if (lockCamera) this.engine.cameraLock = true;
    this.hud.el.style.zIndex = 6;
    this.bus.emit('cine:start');
    steps[0].onStart?.();
  }

  skip() {
    if (!this.script) return;
    for (const step of this.script.steps) step.onEnd?.();
    this.finish();
  }

  /** Restore the world to normal play and release the match lock. */
  finish() {
    this.script = null;
    this.engine.cameraLock = false;
    this.engine.timeScale = 1;
    this.engine.setComic(0);
    this.engine.fx.bloomPass.strength = this.engine.baseBloom;
    if (this.engine.fx.gradePass) this.engine.fx.gradePass.uniforms.caAmount.value = 0.0004;
    const ball = this.getBall?.();
    if (ball?.mesh) ball.mesh.visible = true; // restore after any panel that hid it
    this.hud.showSpeedLines(false);
    this.bus.emit('cine:done');
  }

  update(dt, rawDt) {
    this.fx.update(rawDt);
    const s = this.script;
    if (!s) return;
    const step = s.steps[s.i];
    s.t += rawDt;
    step.onUpdate?.(Math.min(1, s.t / step.dur), rawDt);
    if (s.t >= step.dur) {
      step.onEnd?.();
      step.onEnd = null; // don't double-fire via skip()
      s.i += 1;
      s.t = 0;
      if (s.i >= s.steps.length) this.finish();
      else s.steps[s.i].onStart?.();
    }
  }

  cam(pos, look) {
    this.engine.camera.position.copy(pos);
    this.engine.camera.lookAt(look);
  }

  // ---------- moments ----------
  perfectKick({ kicker, ball }) {
    // pure FEEL, no camera cut: slow-mo ramp, bloom surge, fire+lightning ball.
    // (Camera cuts to flat sprites read badly — big moments get video cutscenes.)
    this.fx.start(ball);
    this.bus.emit('sfx', 'fireball'); // prominent whoosh+boom for the perfect kick
    this.engine.shake(0.5);

    this.run([
      {
        dur: 0.9,
        onStart: () => {
          this.engine.timeScale = 0.18;
          this.engine.fx.bloomPass.strength = 1.6;
          if (this.engine.fx.gradePass) this.engine.fx.gradePass.uniforms.caAmount.value = 0.002;
        },
        onUpdate: () => {},
      },
      {
        dur: 0.3,
        onStart: () => {
          this.engine.timeScale = 1;
          this.engine.fx.bloomPass.strength = 0.9;
          if (this.engine.fx.gradePass) this.engine.fx.gradePass.uniforms.caAmount.value = 0.0004;
        },
        onUpdate: () => {},
        onEnd: () => {
          // fire trail keeps riding the ball until it lands; stop a bit later
          setTimeout(() => this.fx.stop(), 2600);
        },
      },
    ], { lockCamera: false });
  }

  /**
   * Build a hero-shot camera framing for a subject sprite (which billboards to
   * face the camera, so any side angle reads as a clean front-on hero shot).
   * Returns an onUpdate(k) that slow-pushes in over the panel.
   */
  heroFraming(subject) {
    const p = subject.group.position.clone();
    return (k) => {
      const dist = 3.6 - k * 0.6; // gentle push-in
      this.cam(
        new THREE.Vector3(p.x + 1.3, 1.7, p.z + dist),
        new THREE.Vector3(p.x, 1.05, p.z),
      );
    };
  }

  /**
   * Snap an in-play moment into a comic panel.
   * @param {{panels: {subject, dur, freeze?, stamp?, stampKind?, anim?}[], vo?, stampKind}} cfg
   */
  comicMoment({ panels, vo, sound = 'bassdrop', hideBall = false }) {
    this.bus.emit('sfx', sound);
    if (vo) this.bus.emit('vo', vo);
    this.bus.emit('sfx', 'crowd-cheer');
    this.engine.shake(0.4);
    // a caught ball sits on the fielder's billboard and covers it — hide it for the panel
    if (hideBall) { const ball = this.getBall?.(); if (ball?.mesh) ball.mesh.visible = false; }

    const steps = panels.map((panel) => {
      const frame = this.heroFraming(panel.subject);
      return {
        dur: panel.dur,
        onStart: () => {
          this.engine.setComic(1);
          this.engine.timeScale = panel.freeze ? 0.02 : 0.55; // freeze impacts, let dances breathe
          this.engine.fx.bloomPass.strength = 0.5;
          this.hud.showSpeedLines(true, panel.stampKind);
          if (panel.anim) panel.subject.animator.play(panel.anim);
          if (panel.stamp) this.hud.stamp(panel.stamp, panel.stampKind);
        },
        onUpdate: (k) => frame(k),
      };
    });
    this.run(steps);
  }

  crowned({ kicker }) {
    const dance = DANCES[this.danceIdx % DANCES.length];
    this.danceIdx += 1;
    this.comicMoment({
      vo: { event: 'crowned', gender: kicker.gender }, // he/she-aware home-run call
      panels: [{ subject: kicker, dur: 2.4, freeze: false, anim: dance, stamp: 'CROWNED!', stampKind: 'crowned' }],
    });
  }

  robbed({ fielder, kicker }) {
    this.comicMoment({
      vo: 'robbed',
      hideBall: true,
      panels: [
        { subject: fielder, dur: 1.3, freeze: true, anim: 'catch', stamp: 'ROBBED!', stampKind: 'robbed' },
        { subject: kicker, dur: 1.3, freeze: true, anim: 'dejected', stampKind: 'robbed' },
      ],
    });
  }

  pegged({ runner }) {
    this.comicMoment({
      vo: 'pegged',
      sound: 'peg', // real ball-on-body impact
      panels: [{ subject: runner, dur: 1.6, freeze: true, anim: 'stumble', stamp: 'PEGGED!', stampKind: 'pegged' }],
    });
  }

  special({ label, kicker }) {
    this.hud.stamp(label + '!', 'crowned');
    this.bus.emit('sfx', 'bassdrop');
  }

  /**
   * Coin toss ceremony — returns a promise resolving {winner: 'home'|'away'}.
   * Captains face off at the plate, slow-mo coin, crowd swell.
   */
  coinToss({ homeCaptain, awayCaptain, call }) {
    return new Promise((resolve) => {
      const coin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.03, 24),
        new THREE.MeshStandardMaterial({ color: '#f5c842', metalness: 0.95, roughness: 0.2 }),
      );
      coin.position.set(0, 1.2, 0.6);
      this.engine.scene.add(coin);
      const win = Math.random() < 0.5 ? 'home' : 'away';

      homeCaptain.group.visible = true;
      awayCaptain.group.visible = true;
      homeCaptain.group.position.set(-0.9, 0, 1.1);
      awayCaptain.group.position.set(0.9, 0, 1.1);
      homeCaptain.group.lookAt(awayCaptain.group.position);
      awayCaptain.group.lookAt(homeCaptain.group.position);
      homeCaptain.animator.play('idle', { variant: 'tank' });
      awayCaptain.animator.play('idle');

      this.run([
        {
          // captains face off
          dur: 1.6,
          onUpdate: (k) => {
            this.cam(new THREE.Vector3(0, 1.5, 4.4 - k * 0.7), new THREE.Vector3(0, 1.2, 0.8));
          },
        },
        {
          // the flip — slow-mo at the apex
          dur: 2.4,
          onStart: () => { this.bus.emit('sfx', 'cointoss-flick'); },
          onUpdate: (k, dt) => {
            const h = 1.2 + Math.sin(k * Math.PI) * 1.5;
            coin.position.y = h;
            coin.rotation.x += dt * (k < 0.5 ? 26 : 10);
            this.engine.timeScale = k > 0.35 && k < 0.7 ? 0.25 : 1;
            this.cam(new THREE.Vector3(0.4, h * 0.7 + 0.6, 2.6), coin.position);
          },
          onEnd: () => { this.engine.timeScale = 1; },
        },
        {
          // the call
          dur: 1.6,
          onStart: () => {
            this.bus.emit('sfx', 'crowd-cheer');
            const winner = win === 'home' ? homeCaptain : awayCaptain;
            winner.animator.play(DANCES[Math.floor(Math.random() * 4)]);
            this.hud.stamp(win === call ? 'YOU KICK FIRST!' : 'THEY KICK FIRST!', win === call ? 'crowned' : 'pegged');
          },
          onUpdate: (k) => {
            this.cam(new THREE.Vector3(-0.6 + k * 1.2, 1.4, 3.6), new THREE.Vector3(0, 1.1, 0.8));
          },
          onEnd: () => {
            this.engine.scene.remove(coin);
            homeCaptain.animator.play('idle');
            awayCaptain.animator.play('idle');
            resolve({ winner: win });
          },
        },
      ]);
    });
  }
}
