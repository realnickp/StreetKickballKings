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
import { pickDance } from '../game/animExtras.js';
import { FIELD_LAYOUT } from '../game/field.js';
import { clampNearHome, contactSide } from '../game/cameraDirector.js';

// caught-out one-liners — the whole "robbed screen" is now this one sweep
const CAUGHT_LINES = [
  'SNATCHED! SIT DOWN!',
  'THE GLOVE SAID NO!',
  "OUTTA THE SKY — YOU'RE OUT!",
  'ROBBED BLIND!',
  'CAUGHT IT. WALK IT OFF.',
  'THAT BALL GOT MUGGED!',
];

export class CinematicDirector {
  constructor({ engine, bus, hud, getBall, getReplay = null }) {
    this.engine = engine;
    this.bus = bus;
    this.hud = hud;
    this.getBall = getBall;
    this.getReplay = getReplay; // () => {recorder, chars, ball, player} for instant replays
    this.fx = new BallFx(engine.scene);
    this.script = null;

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

  /** `force` = internal teardown; a user tap can't skip noSkip moments.
   *  (Since the fun drop, HR and caught-out are both skippable — fast play wins.) */
  skip(force = false) {
    if (!this.script) return;
    if (this.script.noSkip && !force) return;
    for (const step of this.script.steps) step.onEnd?.();
    this.hud.clearStamps?.(); // a skipped moment must not leave its stamp over live play
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
    this.hud.hideSkipChip?.();
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
  contactKick({ kicker, ball, quality, holdS = 0 }) {
    const p = kicker.group.position.clone();
    const look = new THREE.Vector3(p.x, 0.9, p.z - 1.0);
    // How far the lens can actually stand off on the chosen side. Clamping
    // the shot alone froze the push-in whenever the fence ceiling bit for the
    // whole beat, so the move only read on one pull direction. Solve for the
    // reach ONCE and dolly from there instead: camera x = p.x + side * reach,
    // and |p.x + side * reach| <= maxX gives reach <= maxX - side * p.x for
    // both signs of side. contactSide also FLIPS the side when the kicker slid
    // that way and the fence line leaves under 2.6 m — otherwise the hero shot
    // collapses to a face close-up. (clampNearHome below stays as the safety net.)
    const { side, reach } = contactSide(p, (ball.vel?.x ?? 0) >= 0 ? -1 : 1);
    const foul = quality === 'FOUL';
    this.engine.shake(0.2);

    // the beat now starts at the TAP: `holdS` is the swing's game-time until
    // the clip's contact frame — at 0.3x that whole wind-up plays inside the
    // slow-mo, so the boot visibly ARRIVES at the ball instead of the ball
    // already flying (dev: "never really see the actual kick animation")
    const swingReal = holdS / 0.3;
    this.run([
      {
        dur: swingReal + (foul ? 0.38 : 0.5), // full swing + strike + first streak
        onStart: () => {
          this.engine.timeScale = 0.3;
          if (this.engine.fx.gradePass) this.engine.fx.gradePass.uniforms.caAmount.value = 0.0012;
        },
        // With side = +1 and the kicker right of the plate this shot used to
        // sit OUT PAST the first-base panel and film the swing through
        // chain-link (dev, 2026-08-27). The solved reach gives back the distance
        // the fence line allows (~4.4 m instead of 5.0) and the 0.5 m push-in
        // rides on top of it, so BOTH pull directions move. Side selection and
        // timing are untouched.
        onUpdate: (k) => this.cam(
          clampNearHome(new THREE.Vector3(p.x + side * (reach - k * 0.5), 0.72 + k * 0.08, p.z - 0.8)),
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

  perfectKick({ kicker, ball, holdS = 0 }) {
    // IMPACT CAM (dev ask): hard-cut to a low hero shot of the boot blasting
    // the ball while time crawls — foot-through-ball + fire igniting held in
    // slow-mo — then hold the shot as time snaps back and the fireball ROCKETS
    // out of frame, then release to the broadcast flight camera. (The old
    // "no camera cut" rule was from the flat-sprite era; the mocap 3D chars
    // read great up close.)
    // fire + boom now ignite at the CONTACT moment inside the sequence — the
    // swing plays first (a pre-launch fire trail on a held ball read wrong)
    this.engine.shake(0.5);

    // SIDE-ON shot, perpendicular to the ball's flight: the fireball streaks
    // ACROSS the frame and recedes instead of flying into the lens (a forward
    // camera whited out the whole frame — fire + bloom at 2m eats everything).
    // Shot from the side away from the pull so the body never blocks the ball.
    const p = kicker.group.position.clone();
    // portrait aspect = narrow horizontal FOV: ~5m side distance is what it
    // takes to hold the full body PLUS a lane of ball flight in frame — minus
    // whatever the fence line takes back on this side, and mirrored to the open
    // side when a slid kicker leaves this one too tight (see contactKick).
    const { side, reach } = contactSide(p, (ball.vel?.x ?? 0) >= 0 ? -1 : 1);
    const look = new THREE.Vector3(p.x, 0.9, p.z - 1.0);

    this.run([
      {
        // THE WIND-UP: the whole swing plays in slow-mo, boot arriving at the
        // ball — no fire yet (dev: the kick motion itself must read)
        dur: holdS / 0.3,
        onStart: () => {
          this.engine.timeScale = 0.3;
          if (this.engine.fx.gradePass) this.engine.fx.gradePass.uniforms.caAmount.value = 0.0012;
        },
        // same fence line as contactKick — never shoot the swing through wire
        onUpdate: (k) => this.cam(
          clampNearHome(new THREE.Vector3(p.x + side * reach, 0.72, p.z - 0.8)),
          look,
        ),
      },
      {
        dur: 0.9, // CONTACT: time crawls deeper, the ball IGNITES off the boot
        onStart: () => {
          this.engine.timeScale = 0.18;
          this.fx.start(ball);
          this.bus.emit('sfx', 'fireball'); // prominent whoosh+boom for the perfect kick
          this.engine.fx.bloomPass.strength = 1.1; // hot fire near the lens — a full surge floods the frame
          if (this.engine.fx.gradePass) this.engine.fx.gradePass.uniforms.caAmount.value = 0.002;
        },
        // the 0.6 m crawl-in rides on the solved reach too, so the fireball
        // beat pushes in on the clamped side just as it does on the open one
        onUpdate: (k) => this.cam(
          clampNearHome(new THREE.Vector3(p.x + side * (reach - k * 0.6), 0.72 + k * 0.1, p.z - 0.8)),
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

  /** HOME RUN, reworked (dev, 2026-08-03): no video card — the kicker DANCES
   *  at the plate, a different dance every time, on every single homer, no
   *  exceptions. Beat 1 watches the ball sail; beat 2 is the show: camera arcs
   *  around the dance while the crowd loses it. Tap-skippable (the old video
   *  wasn't) — finalizePlayHR's cinematicLock poll advances play either way. */
  crowned({ kicker, dance = null }) {
    // the dance skips via the CHIP only — a stray tap must not eat the payoff
    this.hud.showSkipChip?.(() => this.bus.emit('cine:skip'));
    this.bus.emit('vo', { event: 'crowned', gender: kicker.gender });
    const p = kicker.group.position.clone(); // beat 1: wherever he froze mid-trot
    const plate = FIELD_LAYOUT.home.clone(); // beat 2: the show is AT THE PLATE
    const pick = dance ?? pickDance(kicker);
    this.engine.shake(0.5);
    this.run([
      { // the ball sails — low behind the kicker, everything slows to savor it
        dur: 0.7,
        onStart: () => {
          this.engine.timeScale = 0.4;
          this.hud.stamp('CROWNED!', 'crowned');
          this.bus.emit('sfx', 'crowd-cheer');
        },
        onUpdate: (k) => this.cam(
          new THREE.Vector3(p.x - 1.4, 1.0 + k * 0.35, p.z + 2.6),
          new THREE.Vector3(p.x, 3.4, p.z - 30),
        ),
      },
      { // THE DANCE — every homer, no exceptions. The camera CUT hides the
        // teleport: he dances at home plate, because the dance IS the trot.
        dur: 3.4,
        onStart: () => {
          this.engine.timeScale = 1;
          kicker.group.position.set(plate.x, 0, plate.z);
          kicker.faceYaw = 0; // square up to the arcing camera side (+z)
          kicker.animator.play(pick);
          this.bus.emit('sfx', 'bassdrop');
        },
        onUpdate: (k) => {
          const a = (-0.55 + k * 1.1) + Math.PI; // slow arc across the camera side
          // 4.4 m orbit: phone screens are TALL — the 3.1 m arc cropped heads
          // and filled the frame with torso (dev screenshots, 2026-08-04)
          this.cam(
            new THREE.Vector3(plate.x + Math.sin(a) * 4.4, 1.6 - k * 0.25, plate.z - Math.cos(a) * 4.4),
            new THREE.Vector3(plate.x, 1.15, plate.z),
          );
        },
        onEnd: () => {
          if (kicker.animator.name === pick) kicker.animator.play('idle');
        },
      },
    ], { lockCamera: true, noSkip: false });
  }

  /** Caught out, reworked (dev, 2026-08-03): the robbed video card is GONE.
   *  THE SNAG still reads first (dev: "show the player catch the ball"), then
   *  one creative line sweeps across the screen and play cuts straight on —
   *  total blocking time ~1.4s instead of a full video. */
  robbed({ fielder }) {
    const p = fielder.group.position.clone();
    this.run([
      { // brief slow-mo hold on the fielder finishing the catch clip
        dur: 0.6,
        onStart: () => { this.engine.timeScale = 0.35; },
        // a SHALLOW catch puts this +3.0/+4.4 offset inside the V band with
        // real x on it (a fielder at x 5, z -6 lands the lens at x 8, z -1.6,
        // well past the line) — clamp it; deep catches are outside the band
        // and untouched.
        onUpdate: () => this.cam(
          clampNearHome(new THREE.Vector3(p.x + 3.0, 1.7, p.z + 4.4)),
          new THREE.Vector3(p.x, 1.05, p.z),
        ),
      },
      { // the line sweeps through; the ball is already heading back
        dur: 0.8,
        onStart: () => {
          this.engine.timeScale = 1;
          this.hud.stamp(CAUGHT_LINES[Math.floor(Math.random() * CAUGHT_LINES.length)], 'robbed');
          this.bus.emit('vo', 'robbed');
          fielder.hasBall = false; // ball heads straight back to the mound
          fielder.animator.play('idle');
          this.bus.emit('cine:returnThrow');
        },
        onUpdate: () => {},
      },
    ], { lockCamera: true, noSkip: true });
  }

  pegged({ runner }) {
    // the booth uses the pegged RUNNER'S pronouns (dev: "they say he made it to a girl")
    this.replayMoment({ focusChar: runner, seconds: 2.2, banner: 'PEGGED!', bannerKind: 'pegged', vo: { event: 'pegged', gender: runner?.gender }, sound: 'peg' });
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
            winner.animator.play(pickDance(winner));
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
