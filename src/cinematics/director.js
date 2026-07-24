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
import { playVideo } from './videoPlayer.js';

const DANCES = ['dance1', 'dance2', 'dance3', 'dance4'];

export class CinematicDirector {
  constructor({ engine, bus, hud, getBall, getReplay = null }) {
    this.engine = engine;
    this.bus = bus;
    this.hud = hud;
    this.getBall = getBall;
    this.getReplay = getReplay; // () => {recorder, chars, ball, player} for instant replays
    this.fx = new BallFx(engine.scene);
    this.script = null;
    this.danceIdx = Math.floor(Math.random() * 4);

    bus.on('cine:perfect', (p) => this.perfectKick(p));
    bus.on('cine:contact', (p) => this.contactKick(p));
    bus.on('cine:crowned', (p) => this.crowned(p));
    bus.on('cine:robbed', (p) => this.robbed(p));
    bus.on('cine:pegged', (p) => this.pegged(p));
    bus.on('cine:special', (p) => this.special(p));
    bus.on('cine:skip', () => this.skip());

    engine.onFrame((dt, rawDt) => this.update(dt, rawDt));
  }

  // ---------- script engine ----------
  run(steps, { lockCamera = true, noSkip = false } = {}) {
    this.skip(true); // end anything already running (internal — always allowed)
    this.script = { steps, i: 0, t: 0, lockCamera, noSkip };
    if (lockCamera) this.engine.cameraLock = true;
    this.hud.el.style.zIndex = 6;
    this.bus.emit('cine:start');
    steps[0].onStart?.();
  }

  /** `force` = internal teardown; a user tap can't skip noSkip moments
   *  (catches / home runs play out in full — dev call). */
  skip(force = false) {
    if (!this.script) return;
    if (this.script.noSkip && !force) return;
    for (const step of this.script.steps) step.onEnd?.();
    this.finish();
  }

  /** Restore the world to normal play and release the match lock. */
  finish() {
    this.script = null;
    this.engine.cameraLock = false;
    this.engine.timeScale = 1;
    this.engine.fx.bloomPass.strength = this.engine.baseBloom;
    if (this.engine.fx.gradePass) this.engine.fx.gradePass.uniforms.caAmount.value = 0.0004;
    const ball = this.getBall?.();
    if (ball?.mesh) ball.mesh.visible = true; // restore after any panel that hid it
    this.hud.hideBanner();
    this.hud.setLetterbox?.(false);
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
  /**
   * CONTACT CAM (dev ask: "you can never actually see the ball being kicked"):
   * EVERY contact — both sides, fouls included — gets a quick beat of the
   * perfect-kick hero shot: hard cut to the low side-on angle, brief slow-mo
   * as the boot goes through the ball, snap back, release to the flight cam.
   * No fire, no bloom surge — the perfect kick stays the big brother.
   * Same shot rules as perfectKick: side-on perpendicular to flight (never in
   * front), ~5m side distance for the portrait FOV, shot from the side away
   * from the pull so the body never blocks the ball.
   */
  contactKick({ kicker, ball, quality }) {
    const p = kicker.group.position.clone();
    const side = (ball.vel?.x ?? 0) >= 0 ? -1 : 1;
    const look = new THREE.Vector3(p.x, 0.9, p.z - 1.0);
    const foul = quality === 'FOUL';
    this.engine.shake(0.2);

    this.run([
      {
        dur: foul ? 0.38 : 0.5, // a shank gets a quicker beat than a clean strike
        onStart: () => {
          this.engine.timeScale = 0.3;
          if (this.engine.fx.gradePass) this.engine.fx.gradePass.uniforms.caAmount.value = 0.0012;
        },
        onUpdate: (k) => this.cam(
          new THREE.Vector3(p.x + side * (5.0 - k * 0.5), 0.72 + k * 0.08, p.z - 0.8),
          look,
        ),
      },
      {
        dur: 0.18, // time snaps back, shot holds a blink — the ball streaks off
        onStart: () => {
          this.engine.timeScale = 1;
          if (this.engine.fx.gradePass) this.engine.fx.gradePass.uniforms.caAmount.value = 0.0004;
        },
        onUpdate: () => {},
      },
      // noSkip: mash-to-run taps during the beat must not strike the moment
    ], { lockCamera: true, noSkip: true });
  }

  perfectKick({ kicker, ball }) {
    // IMPACT CAM (dev ask): hard-cut to a low hero shot of the boot blasting
    // the ball while time crawls — foot-through-ball + fire igniting held in
    // slow-mo — then hold the shot as time snaps back and the fireball ROCKETS
    // out of frame, then release to the broadcast flight camera. (The old
    // "no camera cut" rule was from the flat-sprite era; the mocap 3D chars
    // read great up close.)
    this.fx.start(ball);
    this.bus.emit('sfx', 'fireball'); // prominent whoosh+boom for the perfect kick
    this.engine.shake(0.5);

    // SIDE-ON shot, perpendicular to the ball's flight: the fireball streaks
    // ACROSS the frame and recedes instead of flying into the lens (a forward
    // camera whited out the whole frame — fire + bloom at 2m eats everything).
    // Shot from the side away from the pull so the body never blocks the ball.
    const p = kicker.group.position.clone();
    const side = (ball.vel?.x ?? 0) >= 0 ? -1 : 1;
    // portrait aspect = narrow horizontal FOV: ~5m side distance is what it
    // takes to hold the full body PLUS a lane of ball flight in frame
    const look = new THREE.Vector3(p.x, 0.9, p.z - 1.0);

    this.run([
      {
        dur: 0.9,
        onStart: () => {
          this.engine.timeScale = 0.18;
          this.engine.fx.bloomPass.strength = 1.1; // hot fire near the lens — a full surge floods the frame
          if (this.engine.fx.gradePass) this.engine.fx.gradePass.uniforms.caAmount.value = 0.002;
        },
        onUpdate: (k) => this.cam(
          new THREE.Vector3(p.x + side * (5.0 - k * 0.6), 0.72 + k * 0.1, p.z - 0.8),
          look,
        ),
      },
      {
        dur: 0.35, // time snaps back, shot holds — the fireball streaks off
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
      // noSkip: mash-to-run taps during the beat must not strike the moment
      // (GestureInput still counts them, so runner speed builds through it)
    ], { lockCamera: true, noSkip: true });
  }

  /**
   * TRUE INSTANT REPLAY: re-play the recorded last seconds of the ACTUAL play
   * in slow motion from a fresh broadcast angle (ReplayPlayer). Skips
   * gracefully when nothing is recorded yet — never a broken cinematic.
   */
  replayMoment({ focusChar, seconds, banner, bannerKind, vo, sound, noSkip = false }) {
    const r = this.getReplay?.();
    if (!r?.player) return;
    this.engine.shake(0.3);
    r.player.play({
      clip: r.recorder.clipLast(seconds),
      chars: r.chars, ball: r.ball,
      focusIndex: Math.max(0, r.chars.indexOf(focusChar)),
      banner, bannerKind, vo, sound,
      speed: 0.45,
      noSkip,
    });
  }

  crowned({ kicker }) {
    // Higgsfield set piece (dev: "redo the cinematics"): the generic crowned
    // video IS the homer moment now. Plays in full per the standing no-skip
    // home-run call; the announcer + banner ride over the return to the game.
    this.bus.emit('vo', { event: 'crowned', gender: kicker.gender });
    this.engine.paused = true; // freeze play under the set piece; render continues
    playVideo('assets/video/cut-crowned.mp4', { skippable: false }).then(() => {
      this.engine.paused = false;
      this.hud.banner('HOME RUN!', 'homer');
      setTimeout(() => this.hud.hideBanner(), 1600);
    });
  }

  /**
   * Catch celebration (dev-directed): NOT a raw replay — the fielder stands
   * there WITH the ball (carryHeldBall keeps it in his hands), soaks it in,
   * celebrates, then throws the ball back into play. Camera holds a low 3/4.
   */
  robbed({ fielder }) {
    // Higgsfield set piece first (tap-skippable), then the dev-directed
    // in-engine celebration — it owns gameplay continuity (ball throwback).
    // Gameplay freezes under the video (render continues) so the celebration
    // plays AFTER it instead of invisibly underneath.
    this.engine.paused = true;
    playVideo('assets/video/cut-caught.mp4', { skippable: true }).then(() => { this.engine.paused = false; });
    this.bus.emit('vo', 'robbed');
    this.bus.emit('sfx', 'crowd-cheer');
    this.hud.setLetterbox(true);
    this.hud.banner('ROBBED!', 'robbed');
    // face the camera NOW — the faceYaw lerp is gated during the cinematic,
    // so rotate the body directly (camera sits +x/+z; yaw = atan2(dx, dz))
    const yaw = Math.atan2(3.0, 4.4);
    fielder.faceYaw = yaw;
    fielder.group.rotation.y = yaw;
    const p = fielder.group.position;
    const shot = (offX, offZ) => this.cam(
      new THREE.Vector3(p.x + offX, 1.7, p.z + offZ),
      new THREE.Vector3(p.x, 1.05, p.z),
    );
    this.run([
      { // THE SNAG plays out first — starting 'holdball' here stomped the
        // 'catch' clip on its very first frame (dev: "didn't trigger the
        // catch animation"). Hold the shot; the catch clip finishes itself.
        dur: 0.55,
        onUpdate: () => shot(3.0, 4.4),
      },
      { // then standing tall, ball in hands, full body in frame
        dur: 1.1,
        onStart: () => fielder.animator.play('holdball'),
        onUpdate: (k) => shot(3.0 - k * 0.4, 4.4 - k * 0.6), // slow push-in
      },
      { // soak it in
        dur: 1.3,
        onStart: () => fielder.animator.play('dance3'),
        onUpdate: (k) => shot(2.6 + k * 0.5, 3.8),
      },
      { // fire it back to the MOUND — the scene flies it and the pitcher catches
        dur: 0.9,
        onStart: () => fielder.animator.play('throw', {
          onContact: () => {
            fielder.hasBall = false; // stop pinning the ball to his hands
            this.bus.emit('cine:returnThrow');
          },
          onDone: () => fielder.animator.play('idle'),
        }),
        onUpdate: (k) => shot(3.1, 3.8 + k * 1.0), // ease back out
      },
    ], { noSkip: true }); // the catch celebration always plays out in full
  }

  pegged({ runner }) {
    this.replayMoment({ focusChar: runner, seconds: 2.2, banner: 'PEGGED!', bannerKind: 'pegged', vo: 'pegged', sound: 'peg' });
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
