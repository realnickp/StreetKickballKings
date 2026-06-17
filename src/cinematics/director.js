// CinematicDirector: in-play moments (homer, catch, peg, crushed kick) play as
// clean broadcast REPLAYS — the real 3D play in slow motion, cut to a front-on
// hero angle with a gentle dolly-in, a soft bloom/grade lift, and a single
// lower-third broadcast banner ("HOME RUN!", "ROBBED!", "PEGGED!"). No comic
// shader, no halftone, no spray-paint stamp — the moment IS the play, framed
// like a highlight reel. Pre-rendered Higgsfield VIDEO is reserved for
// fixed-context set pieces (splash, team intros, coin toss, championship)
// handled by the screen layer, not here.
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
    this.hud.hideBanner();
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
   * Frame a subject for a front-on hero replay: drop the camera in FRONT of the
   * subject (home-plate / +z side) at eye level, turn the subject to face the
   * lens (procedural chars have a real front), and slow-dolly in over the panel.
   * Returns an onUpdate(k) that runs the push-in.
   */
  cineFraming(subject) {
    const p = subject.group.position.clone();
    const offX = 1.1; // a touch off-axis so it reads as a camera angle, not a mugshot
    // turn the subject to face where the camera will sit (yawTo convention: atan2(dx,dz))
    subject.faceYaw = Math.atan2(offX, 4.0);
    return (k) => {
      const dist = 4.0 - k * 0.9; // gentle dolly-in across the panel
      this.cam(
        new THREE.Vector3(p.x + offX, 1.75, p.z + dist),
        new THREE.Vector3(p.x, 1.15, p.z),
      );
    };
  }

  /**
   * Play an in-play moment as a clean slow-motion broadcast replay.
   * @param {{panels: {subject, dur, freeze?, anim?, banner?, bannerKind?}[],
   *          vo?, sound?, banner?, bannerKind?, hideBall?}} cfg
   */
  cinematicMoment({ panels, vo, sound, banner, bannerKind, hideBall = false }) {
    if (sound) this.bus.emit('sfx', sound);
    if (vo) this.bus.emit('vo', vo);
    this.bus.emit('sfx', 'crowd-cheer');
    this.engine.shake(0.3);
    // a caught ball sits on the fielder and covers them — hide it for the replay
    if (hideBall) { const ball = this.getBall?.(); if (ball?.mesh) ball.mesh.visible = false; }

    const steps = panels.map((panel, idx) => {
      const frame = this.cineFraming(panel.subject);
      return {
        dur: panel.dur,
        onStart: () => {
          // true slow-mo (not a hard freeze) + a soft cinematic grade — no comic shader
          this.engine.timeScale = panel.freeze ? 0.32 : 0.6;
          this.engine.fx.bloomPass.strength = 0.78;
          if (this.engine.fx.gradePass) this.engine.fx.gradePass.uniforms.caAmount.value = 0.0012;
          if (panel.anim) panel.subject.animator.play(panel.anim);
          const b = panel.banner ?? (idx === 0 ? banner : null);
          if (b) this.hud.banner(b, panel.bannerKind ?? bannerKind);
        },
        onUpdate: (k) => frame(k),
      };
    });
    this.run(steps);
  }

  crowned({ kicker }) {
    const dance = DANCES[this.danceIdx % DANCES.length];
    this.danceIdx += 1;
    this.cinematicMoment({
      vo: { event: 'crowned', gender: kicker.gender }, // he/she-aware home-run call
      banner: 'HOME RUN!', bannerKind: 'homer',
      panels: [{ subject: kicker, dur: 2.6, freeze: false, anim: dance }],
    });
  }

  robbed({ fielder, kicker }) {
    // ball stays VISIBLE — matchScene.carryHeldBall() keeps it in the fielder's
    // glove, so the snag reads as a real catch (was hidden because it used to sit
    // at the body centre and cover them).
    this.cinematicMoment({
      vo: 'robbed',
      banner: 'ROBBED!', bannerKind: 'robbed',
      panels: [
        { subject: fielder, dur: 1.5, freeze: true, anim: 'catch' },   // the snag, frozen at full reach
        { subject: kicker, dur: 1.1, freeze: false, anim: 'dejected' }, // cut to the gutted kicker
      ],
    });
  }

  pegged({ runner }) {
    this.cinematicMoment({
      vo: 'pegged',
      sound: 'peg', // real ball-on-body impact
      banner: 'PEGGED!', bannerKind: 'pegged',
      panels: [{ subject: runner, dur: 1.6, freeze: true, anim: 'stumble' }],
    });
  }

  special() {
    // The crown super-kick flows straight into live play — keep it to FEEL
    // (boom + shake). perfectKick() carries the fire/slow-mo; the homer replay,
    // if it clears, owns the banner. No lingering overlay to fight those.
    this.bus.emit('sfx', 'bassdrop');
    this.engine.shake(0.4);
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
