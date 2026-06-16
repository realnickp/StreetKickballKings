// The match conductor: binds MatchEngine (rules) + Ball (physics) + sprite
// characters + GestureInput (touch) + Hud (DOM) into a playable game.
// Real baseball-style base running: EVERY runner on base runs on contact,
// holds at a bag or keeps going, and scores at home. The engine records the
// exact field outcome via applyOutcome().
import * as THREE from 'three';
import { MatchEngine } from './matchState.js';
import { judgeKick, launchParams } from './kickTiming.js';
import { mashSpeed, humanRunSpeed, RunnerSim } from './baseRunning.js';
import { resolveBaseThrow, resolvePeg } from './throwing.js';
import { SpecialMeter } from './specialMoves.js';
import { pickPitch, aiKickError, aiAim, aiWantsPeg, aiMashRate, aiJukes } from './ai.js';
import { PITCH_PATTERNS, scoreTrace } from './pitchPattern.js';
import { Ball } from './ball.js';
import { buildField, FIELD_LAYOUT } from './field.js';
import { Hud } from '../ui/screens/hud.js';

const DEFENSE_SPOTS = [
  { id: 'P', pos: new THREE.Vector3(0, 0, -12) },
  { id: 'C', pos: new THREE.Vector3(1.9, 0, 2.8) },
  { id: '1B', pos: new THREE.Vector3(9, 0, -9) },
  { id: '2B', pos: new THREE.Vector3(4.5, 0, -16.5) },
  { id: 'SS', pos: new THREE.Vector3(-4.5, 0, -16.5) },
  { id: '3B', pos: new THREE.Vector3(-9, 0, -9) },
  { id: 'LF', pos: new THREE.Vector3(-9, 0, -27) },
  { id: 'RF', pos: new THREE.Vector3(9, 0, -27) },
];

// base index: 0=1st, 1=2nd, 2=3rd, 3=home
const BASE_KEYS = ['first', 'second', 'third', 'home'];
const CAM = {
  // KICK role: low behind home, the pitch rolls AT you so you read the timing
  kick: { pos: new THREE.Vector3(0, 3.4, 8.0), look: new THREE.Vector3(0, 1.2, -12) },
  // PITCH role: centered behind the mound, looking down the lane at the kicker —
  // lateral break still reads as horizontal drift from here (no need to go off-axis)
  pitch: { pos: new THREE.Vector3(0, 5.0, -19.0), look: new THREE.Vector3(0, 1.1, -1.5) },
  live: { pos: new THREE.Vector3(0, 16, 14), look: new THREE.Vector3(0, 0, -16) },
};

const CONTINUE_RATE = 3.5; // taps/sec needed to run through a bag

export class MatchScene {
  constructor({ engine, input, bus, teams, chars, fieldData, tuning, difficulty = 'Street', playerSide = 'away', firstKick = 'away', hudRoot, autoStart = true }) {
    this.engine = engine;
    this.input = input;
    this.bus = bus;
    this.teams = teams;
    this.tuning = tuning;
    this.difficulty = difficulty;
    this.playerSide = playerSide;

    this.match = new MatchEngine({ home: teams.home.id, away: teams.away.id }, tuning.match, { firstKick });
    this.field = buildField(fieldData, engine.scene);
    this.ball = new Ball(engine.scene);
    this.fenceM = fieldData.fenceM;
    this.fenceTopY = fieldData.fenceHeightM ?? 4.5;
    this.ball.setFence(this.fenceM, this.fenceTopY);

    this.hud = new Hud(hudRoot, {
      homeAbbr: teams.home.name.split(' ').pop().slice(0, 4).toUpperCase(),
      awayAbbr: teams.away.name.split(' ').pop().slice(0, 4).toUpperCase(),
    });

    this.chars = chars;
    for (const side of ['home', 'away']) {
      for (const c of this.chars[side]) {
        c.group.visible = false;
        engine.scene.add(c.group);
      }
    }

    this.special = new SpecialMeter(teams[playerSide], tuning);
    this.specialArmed = false;

    this.aim = 'center';
    this.phase = 'IDLE';
    this.strikes = 0;
    this.timers = [];
    this.runners = [];
    this.activeFielder = null;
    this.fielderTarget = null;
    this.lastDragAt = -10;
    this.camTarget = CAM.kick;
    this.camLook = CAM.kick.look.clone();
    this.elapsed = 0;
    this.cinematicLock = false;

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.66, 24),
      new THREE.MeshBasicMaterial({ color: '#3ec6b5', transparent: true, opacity: 0.9 }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    engine.scene.add(this.marker);
    this.fielderRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.66, 24),
      new THREE.MeshBasicMaterial({ color: '#f07f1d', transparent: true, opacity: 0.9 }),
    );
    this.fielderRing.rotation.x = -Math.PI / 2;
    this.fielderRing.visible = false;
    engine.scene.add(this.fielderRing);

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // pulsing rings on the bases — throw targets while your fielder holds the ball
    this.baseRings = [0, 1, 2, 3].map((i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1.05, 28),
        new THREE.MeshBasicMaterial({ color: i === 3 ? '#f5b312' : '#3ec6b5', transparent: true, opacity: 0.9, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(this.basePos(i)).setY(0.06);
      ring.visible = false;
      engine.scene.add(ring);
      return ring;
    });

    bus.on('cine:start', () => { this.cinematicLock = true; this.hud.hint(''); });
    bus.on('cine:done', () => { this.cinematicLock = false; });

    this.offTap = input.on('tap', (e) => this.onTap(e));
    this.offSwipe = input.on('swipe', (e) => this.onSwipe(e));
    this.offDrag = input.on('drag', (e) => this.onDrag(e));
    this.offUp = input.on('up', (e) => this.onUp(e));        // swipe-to-kick release
    this.offStroke = input.on('stroke', (e) => this.onStroke(e)); // pitch-pattern trace

    this.traceBuf = [];
    this.selectedPitch = null;

    this.hud.onAim = (aim) => { this.aim = aim; };
    this.hud.onPitchSelect = (id) => this.onPitchSelect(id);
    this.hud.onThrow = (t) => this.onPlayerThrow(t);
    this.hud.onSpecial = () => {
      if (this.special.ready && this.kickingIsPlayer()) {
        this.specialArmed = true;
        this.hud.setSpecial(this.special.value, true, true, this.teams[this.playerSide].special.label);
      }
    };

    this.offFrame = engine.onFrame((dt, rawDt) => this.update(dt, rawDt));

    this.refreshHud();
    if (autoStart) this.startMatch(firstKick);
  }

  /** (Re)start a full match. Safe to call again for a rematch. */
  startMatch(firstKick) {
    this.match = new MatchEngine(
      { home: this.teams.home.id, away: this.teams.away.id },
      this.tuning.match,
      { firstKick },
    );
    this.match.bus.on('halfEnd', () => { this.halfJustEnded = true; });
    this.special.value = 0;
    this.specialArmed = false;
    this.bus.emit('vo', 'playball');
    this.refreshHud();
    this.nextAtBat();
  }

  // ---------- helpers ----------
  kickingIsPlayer() {
    return this.match.kickingSide() === this.playerSide;
  }
  kickingChars() {
    return this.chars[this.match.kickingSide()];
  }
  fieldingChars() {
    return this.chars[this.match.fieldingSide()];
  }
  teamShort(side) {
    return this.teams[side].name.split(' ').pop();
  }
  after(seconds, fn) {
    this.timers.push({ t: seconds, fn });
  }
  clearTimers() {
    this.timers.length = 0;
  }
  basePos(i) {
    return FIELD_LAYOUT[BASE_KEYS[i]].clone();
  }
  // yaw so a +z-forward model placed at `from` faces toward `to`
  yawTo(from, to) {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }
  // set a character's facing target (the update loop lerps toward it)
  faceTo(char, to, snap = false) {
    char.faceYaw = this.yawTo(char.group.position, to);
    if (snap) char.group.rotation.y = char.faceYaw;
  }
  faceCam(char) {
    char.faceYaw = this.yawTo(char.group.position, this.engine.camera.position);
  }
  refreshHud() {
    const s = this.match.state;
    this.hud.setScore(s.score);
    this.hud.setInning(s.inning, s.half, s.outs);
    this.hud.setBases(s.bases);
    this.hud.showSpecial(this.kickingIsPlayer()); // crown super-kick is ONLY for when you're kicking
    this.hud.setSpecial(this.special.value, this.special.ready, this.specialArmed, this.teams[this.playerSide].special.label);
  }
  worldToScreen(v) {
    // coords are relative to the canvas/phone-frame (the HUD lives inside it)
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    const p = v.clone().project(this.engine.camera);
    return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height };
  }
  screenToGround(x, y) {
    // pointer x/y are window-relative — map into the canvas rect (offset on desktop)
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.engine.camera);
    const out = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, out);
    return out;
  }

  // ---------- at-bat setup ----------
  nextAtBat() {
    if (this.match.state.phase === 'GAME_END') return;
    // defensive: never proceed with an empty roster (would crash kicker/pitcher/fielder setup)
    if (!this.kickingChars().length || !this.fieldingChars().length) {
      console.warn('SKK: a team has no players — cannot start at-bat');
      return;
    }
    this.clearTimers();
    this.phase = 'SETUP';
    this.strikes = 0;
    this.fouls = 0;
    this.runners = [];
    this.throwing = false;
    this.ballControlled = false;
    this.playFinalized = false;
    this.activeFielder = null;
    this.marker.visible = false;
    this.fielderRing.visible = false;
    this.hud.showThrowPad(false);
    this.showBaseRings(false);
    this.hud.hideRing();
    this.hud.hidePitch();
    this.hud.hint('');
    this.camTarget = CAM.kick;

    // defense takes the field
    const def = this.fieldingChars();
    def.forEach((c, i) => {
      const spot = DEFENSE_SPOTS[i % DEFENSE_SPOTS.length];
      c.group.visible = true;
      c.group.position.copy(spot.pos);
      c.spot = spot;
      c.hasBall = false;
      c.role = null;
      this.faceTo(c, FIELD_LAYOUT.home, true); // look in toward the plate
      c.animator.play(spot.id === 'P' || spot.id === 'C' ? 'idle' : 'crouch');
    });

    // kicking side: hide everyone, then kicker at the plate + runners on their bases
    const off = this.kickingChars();
    off.forEach(c => { c.group.visible = false; });
    const kickerIdx = this.match.currentKickerIdx();
    this.kicker = off[kickerIdx % off.length];
    this.kicker.group.visible = true;
    this.kicker.group.position.set(-0.9, 0, 0.4);
    this.faceTo(this.kicker, FIELD_LAYOUT.pitcher, true); // square up to the mound
    this.kicker.animator.play('plate');

    this.match.state.bases.forEach((occ, i) => {
      if (occ === null) return;
      const c = off[occ % off.length];
      if (c === this.kicker) return;
      c.group.visible = true;
      c.group.position.copy(this.basePos(i)).add(new THREE.Vector3(0.5, 0, 0.5));
      this.faceTo(c, this.basePos(Math.min(i + 1, 3)), true); // lead toward next bag
      c.animator.play('idle');
    });

    this.refreshHud();

    if (this.halfJustEnded) {
      this.halfJustEnded = false;
      const fielding = !this.kickingIsPlayer();
      this.hud.stamp(fielding ? 'SWITCH! GLOVE UP!' : "SWITCH! YOU'RE UP!", fielding ? 'robbed' : 'crowned');
      this.bus.emit('sfx', 'scratch');
    }

    // PA announcer calls out the kicking team whenever the side changes
    if (this._lastKickSide !== this.match.kickingSide()) {
      this._lastKickSide = this.match.kickingSide();
      const side = this.match.kickingSide();
      this.after(0.6, () => this.bus.emit('vo', { event: 'nowkicking', team: this.teams[side].id }));
    }

    this.hud.showAim(false); // M1: aim comes from the kick swipe, not buttons

    if (this.kickingIsPlayer()) {
      this.camTarget = CAM.kick;
      this.hud.hint('GET READY…');
      this.after(1.4, () => this.serve());
    } else {
      this.camTarget = CAM.pitch;
      this.hud.hint('YOUR ARM — PICK A PITCH');
      this.after(1.2, () => this.serve());
    }
  }

  /** Serve the next pitch, branching on role. */
  serve() {
    if (this.match.state.phase === 'GAME_END') return;
    if (this.kickingIsPlayer()) this.startAutoPitch();
    else this.startPitchSelect();
  }

  // ---------- KICK role: AI auto-pitches a surprise, you swipe-to-kick ----------
  startAutoPitch() {
    this.phase = 'PITCH';
    this.camTarget = CAM.kick;
    this.hud.showPitchSelect(false);
    this.hud.hidePattern();
    this.hud.hint('SWIPE UP TO KICK!');
    this.pitch = pickPitch(this.tuning);
    this.servePitch(this.pitch, /*aiKicks=*/false);
  }

  // ---------- PITCH role: you pick a pitch + trace its pattern ----------
  startPitchSelect() {
    this.phase = 'PITCH_SELECT';
    this.kicked = false;
    this.camTarget = CAM.pitch;
    this.hud.hidePitch();
    this.hud.hideRing();
    this.hud.showPitchSelect(true);
    this.hud.hint('PICK YOUR PITCH');
  }

  onPitchSelect(id) {
    if (this.phase !== 'PITCH_SELECT' || !PITCH_PATTERNS[id]) return;
    this.selectedPitch = id;
    this.traceBuf = [];
    this.hud.showPitchSelect(false);
    this.hud.showPattern(PITCH_PATTERNS[id]);
    this.hud.updateTrace([]);
    this.phase = 'PITCH_TRACE';
    this.hud.hint('TRACE IT!');
  }

  onStroke(e) {
    if (this.phase !== 'PITCH_TRACE') return;
    const t = this.tuning.pitch.trace;
    const res = scoreTrace(e.points, PITCH_PATTERNS[this.selectedPitch], {
      tolerance: t.tolerance, durMs: e.dur, speedFastMs: t.speedFastMs, speedSlowMs: t.speedSlowMs,
    });
    this.hud.hidePattern();
    const label = res.quality > 0.85 ? 'NASTY!' : res.quality > 0.6 ? 'GOOD HEAT' : 'WOBBLER';
    this.hud.pitchGrade(label, res.quality > 0.6); // small top badge, not a big center stamp
    this.throwPlayerPitch(this.selectedPitch, res.quality);
  }

  /** Build a quality-scaled pitch from the player's trace and serve it; AI kicks. */
  throwPlayerPitch(id, q) {
    const def = this.tuning.pitch.types[id];
    const Q = this.tuning.pitch.quality;
    const speedMph = Math.round(def.speedMph[1] * (Q.weakSpeedFactor + (1 - Q.weakSpeedFactor) * q));
    const curveM = def.curveM * (Q.minBreakFactor + (1 - Q.minBreakFactor) * q);
    const wildX = (1 - q) * Q.maxWildM * (Math.random() - 0.5) * 2; // sloppy = off-target
    this.pitch = { id, speedMph, curveM, ease: def.ease, bounce: def.bounce };
    this.phase = 'PITCH';
    this.hud.hint('');
    this.servePitch(this.pitch, /*aiKicks=*/true, wildX);
  }

  /** Shared ball serve for both roles. */
  servePitch(pitch, aiKicks, wildX = 0) {
    this.hud.showPitch(pitch);
    this.bus.emit('sfx', 'pitch');

    const pitcher = this.fieldingChars()[0];
    pitcher.animator.play('throw', { onDone: () => pitcher.animator.play('idle') });

    const type = this.tuning.pitch.types[pitch.id];
    const rollSpeed = pitch.speedMph * 0.12;
    const dur = (this.tuning.pitch.plateDistanceM / rollSpeed) * (type?.durScale ?? 1);
    const plate = new THREE.Vector3(wildX, 0, 0.2);
    this.ball.startPitch(FIELD_LAYOUT.pitcher.clone().setY(0.35), plate, dur, {
      bounce: pitch.bounce ?? 0, curveM: pitch.curveM ?? 0, ease: pitch.ease ?? 1,
    });
    this.pitchArrival = this.elapsed + dur;
    this.kicked = false;

    if (aiKicks) {
      // The full error drives the JUDGE (whiff/foul/contact). But cap WHEN the AI
      // actually swings to ±0.45s of arrival so a big miss never leaves the ball
      // just sitting there (which reads as "frozen"). NaN-guarded so it can't hang.
      const errMs = aiKickError(this.difficulty, this.tuning, pitch);
      const swing = dur + Math.max(-0.25, Math.min(0.45, (Number.isFinite(errMs) ? errMs : 0) / 1000));
      this.after(swing, () => this.attemptKick({ aim: aiAim(this.difficulty), errMs }, this.elapsed));
    }
  }

  /**
   * @param {object} aimSpec AI: `{aim}`; player swipe: `{aimDeg, bunt}`.
   * @param {number} tapTime release time in elapsed-seconds (same clock as pitchArrival).
   */
  attemptKick(aimSpec, tapTime) {
    if (this.kicked || this.phase !== 'PITCH') return;
    this.kicked = true;
    this.kickWasSpecial = false; // only a consumed crown kick may leave the park
    // AI passes its intended errMs directly; the human's comes from release timing
    const errMs = aimSpec.errMs !== undefined ? aimSpec.errMs : (tapTime - this.pitchArrival) * 1000;
    const judged = judgeKick(errMs, this.tuning);
    this.hud.hideRing();

    if (Math.abs(errMs) > this.tuning.kick.okWindowMs * 1.6) {
      this.strike('WHIFF!');
      return;
    }

    let powerMult = 1;
    if (this.kickingIsPlayer() && this.specialArmed) {
      const sp = this.special.consume();
      if (sp) {
        powerMult = sp.powerMult;
        this.kickWasSpecial = true; // armed full meter consumed → this kick can be a homer
        this.bus.emit('cine:special', { label: sp.label, kicker: this.kicker });
      }
      this.specialArmed = false;
    }
    const launch = launchParams(judged, { ...aimSpec, powerMult }, this.tuning);
    this.judged = judged;
    this.launchSpec = launch;

    this.phase = 'KICK_ANIM';
    // Launch the instant contact is made (no freeze) — the pitch flows straight
    // into the kick. The swing animation plays cosmetically around it.
    this.kicker.animator.play('kick');
    this.onKickContact(judged, launch);
  }

  strike(label) {
    this.strikes += 1;
    this.bus.emit('sfx', 'whiff');
    this.hud.stamp(this.strikes >= 3 ? 'STRUCK OUT!' : label, 'pegged');
    if (this.strikes >= 3) {
      this.bus.emit('vo', 'strike');
      this.after(0.8, () => this.finalizePlay(1, 'strikeout', { restoreRunners: true }));
    } else {
      this.after(1.0, () => {
        this.phase = 'SETUP';
        this.kicker.animator.play('plate');
        this.serve();
      });
    }
  }

  onKickContact(judged, launch) {
    if (judged.quality === 'FOUL') {
      // weak mistimed contact dribbles foul
      this.ball.launch(launch.speed * 0.5, 70, (Math.random() - 0.5) * 90);
      this.bus.emit('sfx', 'kick');
      this.phase = 'FOUL';
      this.ballCamUntil = this.elapsed + 1.0;
      this.after(0.9, () => this.foulBall('FOUL!'));
      return;
    }

    this.ball.launch(launch.speed, launch.loftDeg, launch.directionDeg);
    this.engine.shake(judged.quality === 'PERFECT' ? 0.55 : 0.25);
    this.bus.emit('sfx', judged.quality === 'PERFECT' ? 'crush' : 'kick');
    this.field.crowdEnergy = judged.quality === 'PERFECT' ? 1 : 0.5;

    this.pred = Ball.predictLanding(this.ball.pos.clone(), launch.speed, launch.loftDeg, launch.directionDeg);
    const lp = this.pred.point;
    // REAL foul: lands behind home, or outside the 45° foul lines (|x| > -z)
    if (lp.z > -1.0 || Math.abs(lp.x) > -lp.z + 1.0) {
      this.phase = 'FOUL';
      this.ballCamUntil = this.elapsed + 1.4;
      this.after(Math.min(1.4, Math.max(0.5, this.pred.t * 0.85)), () => this.foulBall('FOUL BALL!'));
      return;
    }

    if (judged.quality === 'PERFECT') {
      this.bus.emit('cine:perfect', { kicker: this.kicker, ball: this.ball });
      if (this.kickingIsPlayer()) this.special.add('PERFECT');
    }

    this.landDist = Math.hypot(lp.x, lp.z);
    this.isFly = this.pred.apex > 2.8; // only genuine pop-ups/arcs are catch-outs; low liners play on
    this.phase = 'LIVE';
    this.liveStart = this.elapsed;
    this.hrFired = false;
    this.ballCamUntil = this.elapsed + 1.3; // trail the ball before cutting to the infield
    this.camTarget = CAM.live;

    // ball is LIVE: force every pitch-phase overlay off-screen so nothing ever
    // covers the field or eats fielding taps (belt-and-suspenders vs any stray path)
    this.hud.showPitchSelect(false);
    this.hud.hidePattern();
    this.hud.hideRing();

    this.launchRunners();

    if (this.kickingIsPlayer()) {
      this.assignDefense({ playerControlled: false }); // you kicked → AI fields
      this.hud.hint('TAP TAP TAP TO RUN!');
    } else {
      this.assignDefense({ playerControlled: true });  // you're in the field → YOU field
    }
    this.refreshHud();
  }

  /** A foul ball: counts toward the 4-foul out, never a third strike. */
  foulBall(label) {
    if (this.playFinalized) return;
    this.fouls = (this.fouls ?? 0) + 1;
    this.bus.emit('sfx', 'whiff');
    this.bus.emit('vo', 'foul');
    if (this.fouls >= 4) {
      this.hud.stamp('4 FOULS — OUT!', 'pegged');
      this.after(0.8, () => this.finalizePlay(1, 'foulout', { restoreRunners: true }));
      return;
    }
    this.hud.stamp(`${label}  ${this.fouls}/4`, 'pegged');
    this.after(1.0, () => {
      this.phase = 'SETUP';
      this.kicker.animator.play('plate');
      this.serve();
    });
  }

  // ---------- multi-runner base running ----------
  launchRunners() {
    const off = this.kickingChars();
    this.runners = [];
    this.originalBases = [...this.match.state.bases];
    this.playOuts = 0;
    this.lastOutReason = null;

    // FORCE chain: the kicker is forced to 1st; a runner is forced to advance
    // only if every base behind them back to home is occupied (a contiguous
    // run from the plate). e.g. men on 1st & 2nd → both forced; man on 2nd
    // only → not forced. This is what makes "1st→2nd pushes 2nd→3rd" real.
    const occupied = this.match.state.bases.map(b => b !== null);
    const forced = [false, false, false];
    let chain = true; // the kicker always advances, forcing 1st
    for (let i = 0; i < 3; i++) {
      if (chain && occupied[i]) forced[i] = true; else chain = false;
    }

    // everyone on base takes off, baseball style
    this.match.state.bases.forEach((occ, baseIdx) => {
      if (occ === null) return;
      const char = off[occ % off.length];
      char.group.visible = true;
      const r = this.makeRunner(occ, char, baseIdx);
      r.forced = forced[baseIdx];
      this.runners.push(r);
    });
    // and the kicker breaks for first (always forced)
    const kr = this.makeRunner(this.match.currentKickerIdx(), this.kicker, -1);
    kr.forced = true;
    this.runners.push(kr);
  }

  makeRunner(idx, char, fromBase) {
    char.animator.play('run', { speedFactor: 1 });
    return {
      idx,
      char,
      fromBase, // -1 = home plate
      targetBase: fromBase + 1,
      sim: new RunnerSim({ tuning: this.tuning, human: this.kickingIsPlayer() }),
      state: 'running',
      decideT: 0,
      forced: false,
      aiRate: aiMashRate(this.difficulty),
    };
  }

  leadRunner() {
    let lead = null;
    for (const r of this.runners) {
      if (r.state !== 'running') continue;
      if (!lead || r.targetBase > lead.targetBase) lead = r;
    }
    return lead;
  }

  /** On-screen banners of what each base-runner is doing (so you know where to throw). */
  updateRunnerAlerts() {
    if (this.phase !== 'LIVE') { this.hud.setRunnerAlerts([]); return; } // only during the live play
    const running = this.runners.filter((r) => r.state === 'running' && r.targetBase >= 0 && r.targetBase <= 3);
    if (!running.length) { this.hud.setRunnerAlerts([]); return; }
    running.sort((a, b) => (b.targetBase - a.targetBase) || (b.sim.progressM - a.sim.progressM));
    const SAY = {
      0: 'RUNNER TO 1ST',
      1: 'RUNNER STEALING 2ND',
      2: 'RUNNER STEALING 3RD',
      3: 'RUNNER HEADING HOME!',
    };
    const alerts = running.slice(0, 3).map((r) => ({ text: SAY[r.targetBase], urgent: r.targetBase === 3 }));
    this.hud.setRunnerAlerts(alerts);
  }

  runnerWorldPos(r) {
    const from = r.fromBase === -1 ? FIELD_LAYOUT.home : this.basePos(r.fromBase);
    const to = this.basePos(r.targetBase);
    const k = Math.min(1, r.sim.progressM / this.tuning.running.basePathM);
    const dir = to.clone().sub(from).normalize();
    const p = from.clone().lerp(to, k);
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    p.addScaledVector(perp, r.sim.lateral);
    return { p, dir, to };
  }

  updateRunners(dt) {
    const isPlayerOffense = this.kickingIsPlayer();
    // short window so the runner responds quickly to starting/stopping taps
    const rate = isPlayerOffense
      ? this.input.tapRate(500, performance.now())
      : 0;

    for (const r of this.runners) {
      if (r.state === 'running') {
        const useRate = isPlayerOffense ? rate : r.aiRate;
        // A human who stops tapping can hover between bags while the ball is loose
        // (that's strategic). But once the defense SECURES the ball, a stalled
        // runner must commit to a bag — otherwise the play can never end.
        if (isPlayerOffense && this.defenseHasBall && !this.throwing && useRate < 0.5) {
          r.stallT = (r.stallT ?? 0) + dt;
          if (r.stallT > 0.7) {
            const half = this.tuning.running.basePathM * 0.5;
            if (r.sim.progressM >= half || r.fromBase < 0) {
              r.sim.progressM = this.tuning.running.basePathM;
              r.sim.arrived = true; // resolves to held/scored just below
            } else {
              r.state = 'held';
              r.heldAt = r.fromBase;
              r.decideT = 0;
              r.char.group.position.copy(this.basePos(r.heldAt)).add(new THREE.Vector3(0.4, 0, 0.4));
              r.char.animator.play('idle');
              continue;
            }
          }
        } else {
          r.stallT = 0;
        }
        r.sim.tick(dt, useRate);
        const { p, dir } = this.runnerWorldPos(r);
        r.char.group.position.set(p.x, 0, p.z);
        r.char.faceYaw = Math.atan2(dir.x, dir.z); // run facing forward, never moonwalk
        r.char.animator.ctx.speedFactor = 0.7 + (mashSpeed(useRate, this.tuning) / this.tuning.running.maxSpeedMs) * 0.6;

        if (r.sim.arrived) {
          if (r.targetBase === 3) {
            // HOME — that's a run
            r.state = 'scored';
            this.pendingRuns = (this.pendingRuns ?? 0) + 1;
            this.field.crowdEnergy = 1;
            this.bus.emit('sfx', 'crowd-cheer');
            this.hud.stamp('SAFE AT HOME!', 'crowned');
            this.faceCam(r.char);
            r.char.animator.play('dance' + (1 + Math.floor(Math.random() * 4)));
            this.after(1.4, () => { if (r.state === 'scored') r.char.group.visible = false; });
          } else {
            r.state = 'held';
            r.heldAt = r.targetBase;
            r.decideT = 0.9; // window to run THROUGH the bag (human reaction + render latency)
            r.char.group.position.copy(this.basePos(r.heldAt)).add(new THREE.Vector3(0.4, 0, 0.4));
            this.faceTo(r.char, this.basePos(Math.min(r.heldAt + 1, 3))); // poised to take the next bag
            r.char.animator.play('idle');
          }
        }
      } else if (r.state === 'held' && r.heldAt < 3) {
        r.decideT -= dt;
        // a teammate running into my bag forces me off it — vacate or we stack
        const mustVacate = this.runners.some(o =>
          o !== r && o.state === 'running' && o.targetBase === r.heldAt);
        // HUMAN offense: keep pushing as long as the ball isn't thrown / the play
        // isn't dead, so a hard-tapping runner can chain 1st→2nd→3rd→home on a live ball.
        // AI offense: a bold lead runner (1st/2nd) will gamble for the next bag right
        // after the D secures it (until the ball is fully controlled) — that's what
        // creates a pickle the human defender can throw on; otherwise the AI holds.
        const aggressive = this.kickingIsPlayer()
          ? (rate > CONTINUE_RATE && !this.throwing && !this.playFinalized)
          : (!this.ballControlled && r.aiRate > 4.2 && this.landDist > 24 && r.heldAt <= 1);
        const wantsGo = mustVacate || (r.decideT > 0 && aggressive);
        if (wantsGo) {
          // take the next base!
          r.fromBase = r.heldAt;
          r.targetBase = r.heldAt + 1;
          r.forced = mustVacate;
          r.sim = new RunnerSim({ tuning: this.tuning, human: this.kickingIsPlayer() });
          r.state = 'running';
          r.char.animator.play('run');
        }
      }
    }

    // live diamond indicator: held runners light the bags
    const liveBases = [null, null, null];
    for (const r of this.runners) {
      if (r.state === 'held' && r.heldAt < 3) liveBases[r.heldAt] = r.idx;
    }
    this.hud.setBases(liveBases);

    // play is over when nobody is running and the defense controls the ball —
    // record however many outs accrued (force/peg) once everyone has settled.
    // Don't finalize while a held runner is still actively pushing for the next
    // bag (human mashing, ball not thrown) — that would freeze them at 2nd early.
    const stillPushing = isPlayerOffense && rate > CONTINUE_RATE && !this.throwing && !this.playFinalized;
    const someoneAdvancing = this.runners.some(r =>
      r.state === 'running' ||
      (r.state === 'held' && r.heldAt < 3 && r.decideT > 0 && stillPushing));
    this.updateRunnerAlerts(); // keep the "runner heading home / stealing 3rd" banners live
    if (!this.playFinalized && this.ballControlled && !someoneAdvancing) {
      this.finalizePlay(this.playOuts ?? 0, this.lastOutReason);
    }
  }

  /** Resolve the play into exact outcome for the engine. */
  finalizePlay(outsAdded, label, { restoreRunners = false } = {}) {
    if (this.playFinalized) return;
    this.playFinalized = true;
    this.phase = 'RESOLVE';
    this.hud.setRunnerAlerts([]); // play's over — clear the runner banners

    // multi-out play — call it out big
    if (outsAdded >= 2) {
      const triple = outsAdded >= 3;
      this.hud.clearStamps();
      this.hud.stamp(triple ? 'TRIPLE PLAY!' : 'DOUBLE PLAY!', 'crowned');
      this.bus.emit('vo', triple ? 'tripleplay' : 'doubleplay');
      this.bus.emit('sfx', 'crowd-cheer');
    }

    const finalBases = [null, null, null];
    let runs = 0;
    if (restoreRunners) {
      // e.g. caught fly / strikeout: runners go back where they started
      this.originalBases?.forEach((occ, i) => { finalBases[i] = occ; });
    } else {
      for (const r of this.runners) {
        if (r.state === 'scored') runs += 1;
        else if (r.state === 'held') finalBases[r.heldAt] = r.idx;
        else if (r.state === 'running') {
          // settled mid-leg: a runner past halfway is credited the base they're
          // headed to (the kicker beats it out to first); otherwise hold the last bag
          if (r.sim.progressM > this.tuning.running.basePathM * 0.5 && r.targetBase <= 2) {
            finalBases[r.targetBase] = r.idx;
          } else if (r.fromBase >= 0) {
            finalBases[r.fromBase] = r.idx;
          }
        }
        // 'out' runners are just gone
      }
    }

    if (!label) {
      const kickerRunner = this.runners.find(r => r.char === this.kicker);
      const kb = kickerRunner?.state === 'scored' ? 4 : kickerRunner?.state === 'held' ? kickerRunner.heldAt + 1 : 0;
      label = kb >= 4 ? 'homerun' : kb === 3 ? 'triple' : kb === 2 ? 'double' : 'single';
    }

    this.match.applyOutcome({ outsAdded, runs, finalBases, label });
    if (['single', 'double', 'triple'].includes(label)) this.bus.emit('vo', 'safe');
    this.pendingRuns = 0;
    this.refreshHud();

    if (this.match.state.phase === 'GAME_END') {
      const fireOver = () => {
        if (this.cinematicLock) return this.after(0.3, fireOver);
        this.bus.emit('matchOver', { winner: this.match.winner(), score: this.match.state.score });
      };
      this.after(0.6, fireOver);
      return;
    }
    const tryNext = () => {
      if (this.cinematicLock) return this.after(0.3, tryNext);
      this.nextAtBat();
    };
    this.after(1.2, tryNext);
  }

  // ---------- defense (shared: AI fields when you kick, YOU field otherwise) ----------
  /**
   * Stand up the whole defense for a live ball: the closest fielder chases, the
   * next-closest backs up, and the rest break to cover the bases where a play
   * can happen. `playerControlled` decides who steers the chaser.
   */
  assignDefense({ playerControlled }) {
    const def = this.fieldingChars();
    this.playerControlled = playerControlled;
    this.throwing = false;
    this.ballControlled = false;
    this.defenseHasBall = false; // flips true once a fielder secures the ball
    this.catchRoll = null;       // fresh catch-skill roll for this batted ball

    const ranked = [...def].sort((a, b) =>
      a.group.position.distanceTo(this.pred.point) - b.group.position.distanceTo(this.pred.point));
    const chaser = ranked[0];
    const backup = ranked[1] ?? null;

    const roleOf = new Map();
    roleOf.set(chaser, { role: 'chase' });
    if (backup) roleOf.set(backup, { role: 'backup' });

    // cover the bases a runner is advancing to (plus first — the kicker is live)
    for (const baseIdx of this.basesToCover()) {
      const basePt = this.basePos(baseIdx);
      let best = null;
      let bestD = 1e9;
      for (const c of ranked) {
        if (roleOf.has(c)) continue;
        const d = c.group.position.distanceTo(basePt);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) roleOf.set(best, { role: 'cover', baseIdx });
    }
    for (const c of ranked) if (!roleOf.has(c)) roleOf.set(c, { role: 'hold' });

    this.fielders = ranked.map((c) => {
      const r = roleOf.get(c);
      c.hasBall = false;
      const target = r.role === 'cover'
        ? this.basePos(r.baseIdx).clone()
        : c.group.position.clone();
      return { char: c, role: r.role, baseIdx: r.baseIdx, target };
    });
    this.chaser = chaser;
    this.activeFielder = playerControlled ? chaser : null;
    this.chaseDelay = playerControlled ? 0 : this.tuning.ai[this.difficulty].fieldReactMs / 1000;
    chaser.animator.play('run');

    if (playerControlled) {
      // YOU control the fielder — it does NOT auto-run. Start it where it stands;
      // the teal marker shows where the ball will land — tap there to send it.
      this.hud.clearStamps(); // pitch/kick stamp must not linger over the fielding action
      this.fielderTarget = chaser.group.position.clone();
      this.fielderRing.visible = true;
      this.marker.position.copy(this.pred.point).setY(0.05);
      this.marker.visible = true;
      this.lastDragAt = -10;
      this.hud.hint('TAP WHERE THE BALL LANDS!');
    }
  }

  /** Bases that need a fielder standing on them this play (force + active runners). */
  basesToCover() {
    // 1st, 2nd, 3rd AND home (catcher) are ALWAYS manned — a baseman stands on
    // each and stays there to take throws; only the chaser leaves to get the ball.
    return [0, 1, 2, 3];
  }

  fielderSpeed(char, role) {
    if (this.playerControlled && role === 'chase') return this.tuning.fielding.dragSpeedMs;
    const speed = char.data?.stats?.speed ?? 5;
    const glove = char.data?.stats?.glove ?? 5;
    return 5.5 + speed * 0.2 + (role === 'chase' ? glove * 0.12 : 0);
  }

  /** Where a fielder should run to cut the ball off (lead a moving ball). */
  ballLeadPoint() {
    const lead = this.tuning.fielding.leadTimeS ?? 0.28;
    return new THREE.Vector3(
      this.ball.pos.x + this.ball.vel.x * lead,
      0,
      this.ball.pos.z + this.ball.vel.z * lead,
    );
  }

  updateDefense(dt) {
    if (this.phase !== 'LIVE' || !this.fielders) return;
    const reacted = this.elapsed - this.liveStart >= this.chaseDelay;
    const ballLive = this.ball.onGround || this.ball.bounces > 0 || this.ball.pos.y < 2.6;
    const chaseSpot = ballLive ? this.ballLeadPoint() : this.pred.point;

    for (const f of this.fielders) {
      const c = f.char;
      if (c.hasBall) continue;
      let target = f.target;

      if (f.role === 'chase') {
        if (!reacted) continue;
        if (this.playerControlled) {
          // NO auto-chase: the fielder only goes where the player has tapped/dragged
          target = this.fielderTarget;
        } else {
          target = chaseSpot;
        }
      } else if (f.role === 'backup') {
        // sit a few metres infield of the ball as a relay
        const bp = this.ball.pos;
        const inward = FIELD_LAYOUT.home.clone().sub(bp).setY(0);
        const len = inward.length() || 1;
        target = bp.clone().addScaledVector(inward.multiplyScalar(1 / len), 4.5).setY(0);
      }

      const d2 = new THREE.Vector2(target.x - c.group.position.x, target.z - c.group.position.z);
      const dist = d2.length();
      if (dist > 0.14) {
        const step = Math.min(dist, this.fielderSpeed(c, f.role) * dt);
        c.group.position.x += (d2.x / dist) * step;
        c.group.position.z += (d2.y / dist) * step;
        c.faceYaw = Math.atan2(d2.x, d2.y);
        if (c.animator.name !== 'run') c.animator.play('run');
      } else if (c.animator.name === 'run' && f.role !== 'chase') {
        c.animator.play('crouch');
        this.faceTo(c, this.ball.pos);
      }
    }

    if (this.playerControlled && this.chaser) {
      this.fielderRing.position.copy(this.chaser.group.position).setY(0.05);
    }
    if (reacted) this.handleChaserBall();
  }

  catchRadius() {
    if (this.playerControlled) return 2.0;
    return { Rookie: 1.5, Street: 1.7, King: 2.0 }[this.difficulty] ?? 1.7;
  }

  /** Chance the AI actually SQUEEZES a reachable fly (real fielders drop some) —
   *  this is the main "not every ball is caught" lever. Player catches if they got there. */
  catchSkill() {
    if (this.playerControlled) return 1.0;
    return { Rookie: 0.6, Street: 0.78, King: 0.9 }[this.difficulty] ?? 0.78;
  }

  /** The chaser tries to catch a fly or scoop a grounder once it's on the ball. */
  handleChaserBall() {
    const c = this.chaser;
    if (!c || c.hasBall || this.throwing) return;
    const ballDist = Math.hypot(this.ball.pos.x - c.group.position.x, this.ball.pos.z - c.group.position.z);
    c.faceYaw = Math.atan2(this.ball.pos.x - c.group.position.x, this.ball.pos.z - c.group.position.z);

    if (this.isFly && this.ball.bounces === 0 && !this.ball.onGround &&
        this.ball.vel.y < 0 && this.ball.pos.y < 2.6 && ballDist < this.catchRadius()) {
      // roll the catch ONCE per fly — if the AI muffs it, the ball drops in for a hit
      if (this.catchRoll === null || this.catchRoll === undefined) this.catchRoll = Math.random() < this.catchSkill();
      if (this.catchRoll) { c.animator.play('catch'); return this.catchOut(c); }
      // muffed: fall through, let it drop and play on as a grounder
    }
    if ((this.ball.onGround || this.ball.bounces > 0) && ballDist < (this.tuning.fielding.scoopRadiusM ?? 2.0)) {
      this.possessBall(c);
    }
  }

  possessBall(c) {
    c.hasBall = true;
    this.defenseHasBall = true; // the infield has it now — runners turn cautious
    this.ball.place(c.group.position.clone().setY(1.1));
    this.ball.mode = 'idle';
    c.animator.play('catch');
    this.faceTo(c, FIELD_LAYOUT.home);
    this.bus.emit('sfx', 'catchpop');
    if (this.playerControlled) {
      this.marker.visible = false;
      this.hud.hint('THROW IT! GOLD BASE = OUT, OR PEG');
      this.hud.showThrowPad(true);
      this.hud.highlightBestBase(this.recommendedThrowBase()); // show the force-out base
      this.showBaseRings(true);
      // safety: never freeze if the player never throws
      this.after(6, () => { if (c.hasBall && !this.playFinalized && !this.throwing) this.ballControlled = true; });
    } else {
      this.after(0.4, () => this.aiThrowDecision(c));
    }
  }

  /**
   * After a force out at `base`, hand the ball to the cover man there and relay
   * to the NEXT force base to turn two (or three). AI defense only — a human
   * turns their own double play by tapping the next base on the throw pad.
   * Returns true if a relay throw was started (so the play stays live).
   */
  tryDoublePlay(base) {
    if (this.kickingIsPlayer() || this.playFinalized) return false;
    const nextForce = this.recommendedThrowBase();
    if (nextForce === null || nextForce === base) return false; // no other force runner in flight
    const relay = this.coverFielderAt(base) ?? this.nearestFielderTo(this.basePos(base));
    if (!relay) return false;
    relay.hasBall = true;
    this.chaser = relay;
    this.ball.place(relay.group.position.clone().setY(1.1));
    this.ball.mode = 'idle';
    this.faceTo(relay, this.basePos(nextForce));
    this.bus.emit('sfx', 'catchpop');
    this.after(0.4, () => { if (relay.hasBall && !this.playFinalized) this.throwBall(relay, { base: nextForce }); });
    return true; // turning two — keep the play live
  }

  /** The lead FORCED runner's target base — the only base where a throw gets an out. */
  recommendedThrowBase() {
    let best = null;
    for (const r of this.runners) {
      if (r.state === 'running' && r.forced && r.targetBase >= 0 && r.targetBase <= 3) {
        if (!best || r.targetBase > best.targetBase) best = r;
      }
    }
    return best ? best.targetBase : null;
  }

  /** Peg targets the running runner closest to the fielder holding the ball (good for rundowns). */
  pegTarget() {
    const c = this.activeFielder ?? this.chaser;
    const live = this.runners.filter(r => r.state === 'running');
    if (!c || !live.length) return live[0] ?? null;
    let best = null, bestD = 1e9;
    for (const r of live) {
      const d = c.group.position.distanceTo(this.runnerWorldPos(r).p);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  coverFielderAt(baseIdx) {
    return this.fielders?.find(f => f.role === 'cover' && f.baseIdx === baseIdx)?.char ?? null;
  }
  nearestFielderTo(pt) {
    let best = null, bestD = 1e9;
    for (const f of this.fielders ?? []) {
      const d = f.char.group.position.distanceTo(pt);
      if (d < bestD) { bestD = d; best = f.char; }
    }
    return best;
  }

  /** A non-forced runner caught off a base reverses toward the bag he came from. */
  retreatRunner(r) {
    if (r.fromBase < 0) return;
    const oldP = r.sim.progressM;
    const newFrom = r.targetBase;
    r.targetBase = r.fromBase;
    r.fromBase = newFrom;
    r.forced = false;
    r.sim = new RunnerSim({ tuning: this.tuning, human: this.kickingIsPlayer() });
    r.sim.progressM = Math.max(0, this.tuning.running.basePathM - oldP);
    r.char.animator.play('run');
  }

  /** Rundown: the runner reverses, the fielder at the base grabs it, you peg him. */
  startRundown(runner, ballBase) {
    this.retreatRunner(runner);
    const catcher = this.coverFielderAt(ballBase) ?? this.nearestFielderTo(this.basePos(ballBase));
    if (catcher) {
      catcher.hasBall = true;
      this.chaser = catcher;
      this.activeFielder = this.playerControlled ? catcher : null;
      this.ball.place(catcher.group.position.clone().setY(1.1));
      this.ball.mode = 'idle';
      this.faceTo(catcher, this.runnerWorldPos(runner).p);
    }
    this.defenseHasBall = true;
    this.hud.stamp('PICKLE!', 'robbed');
    this.bus.emit('vo', 'pickle');
    if (this.playerControlled) {
      this.hud.hint('RUNDOWN! PEG HIM!');
      this.hud.showThrowPad(true);
      this.hud.highlightBestBase(null);
      this.showBaseRings(true);
      this.after(6, () => { if (!this.playFinalized && !this.throwing) this.ballControlled = true; });
    } else if (catcher) {
      this.after(0.5, () => { if (catcher.hasBall && !this.playFinalized) this.throwBall(catcher, { peg: true }); });
    }
  }

  /** What the AI does with the ball: force out → cut off the lead runner → peg. */
  aiThrowDecision(fielder) {
    if (!fielder.hasBall || this.playFinalized || this.phase === 'RESOLVE') return;
    // 1) a force out is available → fire to the lead forced bag
    const forcedBase = this.recommendedThrowBase();
    if (forcedBase !== null && !(aiWantsPeg(this.difficulty) && this.landDist < 24)) {
      return this.throwBall(fielder, { base: forcedBase });
    }
    // 2) go after the lead runner who's STILL ADVANCING — peg him if he's close,
    //    otherwise cut him off at the bag he's headed to (he must retreat → pickle)
    const lead = this.leadRunner();
    if (lead) {
      const toRunner = fielder.group.position.distanceTo(this.runnerWorldPos(lead).p);
      if (toRunner < 5.5) return this.throwBall(fielder, { peg: true });
      return this.throwBall(fielder, { base: lead.targetBase });
    }
    return this.throwBall(fielder, { base: 0 }); // nobody live — flip to first to end it
  }

  /**
   * AI defense FINISHES the play. After every throw resolves, if a runner is still
   * advancing, keep making plays — re-field a loose ball, throw to cut off the lead
   * runner, work the rundown — until everyone is OUT or HELD. (No more strolling home.)
   */
  aiContinue() {
    if (this.playerControlled || this.playFinalized || this.phase === 'RESOLVE') return;
    if (!this.runners.some((r) => r.state === 'running')) { this.ballControlled = true; return; }
    let holder = this.fielders?.find((f) => f.char.hasBall)?.char;
    if (!holder) {
      // ball got loose (e.g. a missed peg) — the nearest fielder backs it up
      holder = this.nearestFielderTo(this.ball.pos);
      if (!holder) { this.ballControlled = true; return; }
      holder.hasBall = true;
      this.ball.place(holder.group.position.clone().setY(1.1));
      this.ball.mode = 'idle';
    }
    this.chaser = holder;
    this.defenseHasBall = true;
    this.ballControlled = false;
    this.after(0.55, () => { if (holder.hasBall && !this.playFinalized) this.aiThrowDecision(holder); });
  }

  /**
   * After EVERY throw resolves: if a runner is still advancing, keep the play
   * alive. AI pursues itself; the PLAYER gets the throw pad back (controlling
   * whoever now has the ball) so you can keep gunning runners down until the
   * play is truly over. If nobody's advancing, settle so the play finalizes.
   */
  afterThrow() {
    if (this.playFinalized || this.phase === 'RESOLVE') return;
    if (!this.runners.some((r) => r.state === 'running')) { this.ballControlled = true; return; }
    if (!this.playerControlled) return this.aiContinue();
    // PLAYER defense: make sure a fielder has the ball, then re-arm the throw pad
    let holder = this.fielders?.find((f) => f.char.hasBall)?.char;
    if (!holder) {
      holder = this.nearestFielderTo(this.ball.pos);
      if (!holder) { this.ballControlled = true; return; }
      holder.hasBall = true;
      this.ball.place(holder.group.position.clone().setY(1.1));
      this.ball.mode = 'idle';
    }
    this.activeFielder = holder;
    this.chaser = holder;
    this.defenseHasBall = true;
    this.ballControlled = false;
    this.marker.visible = false;
    this.hud.showThrowPad(true);
    this.hud.highlightBestBase(this.recommendedThrowBase());
    this.showBaseRings(true);
    this.hud.hint('THROW TO THE BAG TO GET HIM!');
    this.after(6, () => { if (holder.hasBall && !this.playFinalized && !this.throwing) this.ballControlled = true; });
  }

  showBaseRings(on) {
    for (const r of this.baseRings) r.visible = on;
  }

  /** Player throw handler (HUD throw-pad). Delegates to the shared resolver. */
  onPlayerThrow({ base, peg }) {
    const c = this.activeFielder;
    if (!c?.hasBall || this.throwing) return;
    this.throwBall(c, { base, peg });
  }

  /**
   * Resolve a throw: peg the lead runner, or fire to a base and race the runner
   * heading there. Works for both AI and player throws.
   */
  throwBall(fielder, { base, peg }) {
    if (!fielder.hasBall) return;
    this.throwing = true;
    this.hud.showThrowPad(false);
    this.showBaseRings(false);
    this.hud.hint('');
    fielder.animator.play('throw');
    this.bus.emit('sfx', 'throw');

    if (peg) {
      const lead = this.pegTarget();
      if (!lead) return this.endThrow(fielder);
      // AI runners try to dodge a peg
      if (!this.kickingIsPlayer() && aiJukes(this.difficulty, this.tuning)) {
        lead.sim.juke(Math.random() < 0.5 ? 'left' : 'right');
      }
      const { p } = this.runnerWorldPos(lead);
      this.faceTo(fielder, p);
      const flight = this.ball.throwTo(p.clone().setY(0.9), this.tuning.throwing.throwSpeedMs);
      this.after(flight, () => {
        fielder.hasBall = false;
        this.throwing = false;
        this.ballControlled = true;
        if (lead.state !== 'running') { // runner already reached a bag — no peg
          this.bus.emit('sfx', 'catchpop');
          this.hud.stamp('SAFE!', 'robbed');
        } else {
          const hit = resolvePeg({ throwDistM: 0, runnerLateralM: lead.sim.lateral }, this.tuning).hit;
          if (hit) this.runnerOut(lead, 'pegged');
          else { this.bus.emit('sfx', 'dodge'); this.hud.stamp('JUKED!', 'robbed'); }
        }
        this.afterThrow(); // keep the play alive if a runner is still going
      });
      return;
    }

    const basePt = this.basePos(base);
    this.faceTo(fielder, basePt);
    const victim = this.runners.find(r => r.state === 'running' && r.targetBase === base);
    // SOMEONE has to be covering the bag to take the throw — pick the cover man (or
    // whoever is nearest). If nobody's there when the ball arrives, it's not an out.
    const receiver = this.coverFielderAt(base) ?? this.nearestFielderTo(basePt);
    let res = { out: false };
    // Only a FORCED runner can be thrown out at a base (he MUST go there). A
    // non-forced runner heading there can always retreat — no force out.
    if (victim && victim.forced) {
      const remaining = this.tuning.running.basePathM - victim.sim.progressM;
      const rate = this.kickingIsPlayer() ? this.input.tapRate(500, performance.now()) : victim.aiRate;
      const runnerSpeedMs = this.kickingIsPlayer() ? humanRunSpeed(rate, this.tuning) : mashSpeed(rate, this.tuning);
      res = resolveBaseThrow(
        { throwDistM: fielder.group.position.distanceTo(basePt), runnerRemainingM: remaining, runnerSpeedMs },
        this.tuning,
      );
    }
    const flight = this.ball.throwTo(basePt.clone().setY(0.9), this.tuning.throwing.throwSpeedMs);
    this.after(flight, () => {
      fielder.hasBall = false;
      this.throwing = false;
      const live = victim && victim.state === 'running' && victim.targetBase === base;
      // the throw only counts if a fielder is actually at the bag to CATCH it
      const caught = receiver && receiver.group.position.distanceTo(basePt) < (this.tuning.fielding.coverCatchRadiusM ?? 4.5);
      if (caught) {
        receiver.hasBall = true;
        receiver.animator.play('catch');
        this.ball.place(receiver.group.position.clone().setY(1.1));
        this.faceTo(receiver, FIELD_LAYOUT.home);
        this.bus.emit('sfx', 'catch'); // glove pop at the bag
        this.chaser = receiver; // the ball is with the bag man now (for relays/next throw)
      }
      if (caught && live && victim.forced && res.out) {
        this.runnerOut(victim, 'forced');
        if (!this.tryDoublePlay(base)) this.afterThrow(); // turn two, or keep chasing the next runner
      } else if (caught && live && !victim.forced) {
        this.startRundown(victim, base); // can't force him — trap him in a pickle
      } else if (!caught) {
        // nobody covering — the throw sails to an empty bag: runner's safe, ball loose
        this.ball.place(basePt.clone().setY(0.3));
        this.ball.mode = 'idle';
        this.hud.stamp('NOBODY COVERING!', 'robbed');
        this.bus.emit('vo', 'safe');
        this.afterThrow();
      } else {
        this.afterThrow(); // caught but safe — still go after any OTHER advancing runner
      }
    });
  }

  endThrow(fielder) {
    if (fielder) fielder.hasBall = false;
    this.throwing = false;
    this.ballControlled = true;
  }

  onDrag(e) {
    // PITCH role: draw the live trace as the player follows the pattern
    if (this.phase === 'PITCH_TRACE') {
      this.traceBuf.push({ x: e.x, y: e.y });
      this.hud.updateTrace(this.traceBuf);
      return;
    }
    // DEFENSE drag — steer the fielder; landing marker stays fixed
    if (this.phase === 'LIVE' && this.activeFielder && !this.activeFielder.hasBall && !this.kickingIsPlayer()) {
      const g = this.screenToGround(e.x, e.y);
      if (g) {
        this.lastDragAt = this.elapsed;
        this.fielderTarget.copy(g);
      }
    }
  }

  onSwipe(e) {
    // juke while running (left/right only)
    if (this.phase === 'LIVE' && this.kickingIsPlayer() && (e.dir === 'left' || e.dir === 'right')) {
      const lead = this.leadRunner();
      if (lead && lead.sim.juke(e.dir)) this.bus.emit('sfx', 'juke');
    }
  }

  /** Pointer release — the swipe-to-kick trigger (a pure tap = straight, center). */
  onUp(e) {
    if (this.cinematicLock) return;
    if (this.phase === 'PITCH' && this.kickingIsPlayer() && !this.kicked) {
      let aimDeg = 0;
      let bunt = false;
      if (e.travel > 18) {
        aimDeg = Math.atan2(e.dx, -e.dy) * 180 / Math.PI; // 0 = up, + = right field
        if (e.dy > 24) bunt = true;                        // a downward flick bunts
      }
      this.attemptKick({ aimDeg, bunt }, this.elapsed);
    }
  }

  onTap(e) {
    if (this.cinematicLock) { this.bus.emit('cine:skip'); return; }
    // DEFENSE: tap/drag to drive your fielder. The teal marker STAYS at the ball's
    // landing spot (where to get to); only the fielder moves.
    if (this.phase === 'LIVE' && this.playerControlled && this.activeFielder && !this.activeFielder.hasBall) {
      const g = this.screenToGround(e.x, e.y);
      if (g) {
        this.lastDragAt = this.elapsed;
        this.fielderTarget.copy(g);
      }
    }
  }

  // ---------- outs ----------
  runnerOut(runner, reason) {
    if (runner.state === 'out') return;
    runner.state = 'out';
    runner.char.animator.play('stumble');
    this.faceCam(runner.char);
    this.field.crowdEnergy = 1;
    this.playOuts = (this.playOuts ?? 0) + 1;
    this.lastOutReason = reason;
    if (reason === 'pegged') {
      this.bus.emit('cine:pegged', { runner: runner.char }); // director fires the 'pegged' call
      if (!this.kickingIsPlayer()) this.special.add('peg');
    } else {
      this.bus.emit('sfx', 'catchpop');
      this.bus.emit('vo', 'forced'); // out at the bag
      this.hud.stamp('OUT!', 'pegged');
    }
    // Do NOT finalize here — the kicker/other runners may still be live. The
    // natural play-end (ball controlled + nobody running) records the outs.
  }

  catchOut(fielder) {
    if (this.phase !== 'LIVE') return;
    this.phase = 'RESOLVE';
    this.ball.place(fielder.group.position.clone().setY(1.3));
    fielder.animator.play('catch');
    fielder.hasBall = true;
    this.field.crowdEnergy = 1;
    this.bus.emit('cine:robbed', { fielder, kicker: this.kicker });
    if (!this.kickingIsPlayer()) this.special.add('catch');
    this.after(0.2, () => this.finalizePlay(1, 'catch', { restoreRunners: true }));
  }

  homer() {
    if (this.hrFired) return;
    this.hrFired = true;
    this.field.crowdEnergy = 1;
    // everyone on the basepaths trots home and scores
    let runs = 0;
    for (const r of this.runners) {
      if (r.state === 'running' || r.state === 'held' || r.state === 'scored') {
        if (r.state !== 'scored') runs += 1;
        r.state = 'scored';
      }
      r.char.group.visible = r.char === this.kicker; // kicker stays out for the dance
    }
    runs += this.pendingRuns ?? 0;
    this.pendingRuns = 0;
    this.bus.emit('cine:crowned', { kicker: this.kicker, team: this.teams[this.match.kickingSide()].id });
    if (this.kickingIsPlayer()) this.special.add('homerun');
    this.finalizePlayHR(runs);
  }

  finalizePlayHR(runs) {
    if (this.playFinalized) return;
    this.playFinalized = true;
    this.phase = 'RESOLVE';
    this.match.applyOutcome({ outsAdded: 0, runs, finalBases: [null, null, null], label: 'homerun' });
    this.refreshHud();
    if (this.match.state.phase === 'GAME_END') {
      const fireOver = () => {
        if (this.cinematicLock) return this.after(0.3, fireOver);
        this.bus.emit('matchOver', { winner: this.match.winner(), score: this.match.state.score });
      };
      this.after(0.6, fireOver);
      return;
    }
    const tryNext = () => {
      if (this.cinematicLock) return this.after(0.3, tryNext);
      this.nextAtBat();
    };
    this.after(1.2, tryNext);
  }

  // ---------- frame update ----------
  update(dt, rawDt) {
    this.elapsed += rawDt;
    this.ball.update(dt);
    this.field.updateCrowd(this.elapsed);
    this.field.crowdEnergy = Math.max(0, this.field.crowdEnergy - rawDt * 0.25);

    for (const c of [...this.chars.home, ...this.chars.away]) {
      if (!c.group.visible) continue;
      c.animator.update(dt);
      // procedural players have a real front — smoothly turn them to face their
      // intent (run direction / the ball / the camera) so nobody moonwalks.
      if (c.faceYaw != null) {
        let d = c.faceYaw - c.group.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        c.group.rotation.y += d * Math.min(1, rawDt * 11);
      }
    }

    for (const timer of [...this.timers]) {
      timer.t -= rawDt;
      if (timer.t <= 0) {
        this.timers.splice(this.timers.indexOf(timer), 1);
        // a throwing timer (e.g. a flaky audio/announce call) must not stall the play
        try { timer.fn(); } catch (e) { console.error('[skk] timer error (recovered):', e); }
      }
    }

    if (this.phase === 'PITCH' && this.kickingIsPlayer()) {
      const remain = this.pitchArrival - this.elapsed;
      const total = this.tuning.pitch.plateDistanceM / (this.pitch.speedMph * 0.12);
      const progress = Math.max(0, remain / total);
      const anchor = this.worldToScreen(new THREE.Vector3(0, 0.5, 0.2));
      this.hud.ringAt(anchor.x, anchor.y, progress);
      if (remain < (-this.tuning.kick.okWindowMs / 1000) * 1.6 && !this.kicked) {
        this.kicked = true;
        this.strike('TOO LATE!');
        this.hud.hideRing();
      }
    }

    if (this.phase === 'KICK_ANIM' && this.kicker) {
      // step the kicker toward the incoming ball so the foot actually meets it
      const tx = Math.max(-1.9, Math.min(1.9, this.ball.pos.x));
      const k = this.kicker.group.position;
      k.x += (tx - k.x) * Math.min(1, rawDt * 9);
    }

    if (this.phase === 'LIVE' || this.phase === 'RESOLVE') {
      this.updateRunners(dt);
    }
    if (this.phase === 'LIVE') {
      this.updateDefense(dt);

      const dist = Math.hypot(this.ball.pos.x, this.ball.pos.z);
      // a homer must clear the wall IN THE AIR (containment bounces shorter balls
      // back) AND be a crown super-kick — ordinary perfect contact stays in the park
      if (!this.hrFired && this.kickWasSpecial && dist >= this.fenceM - 0.3 && this.ball.pos.y > this.fenceTopY * 0.8 && this.ball.bounces === 0) {
        this.homer();
      }
      // dead-ball safety net
      if (this.elapsed - this.liveStart > 14 && !this.playFinalized) {
        this.ballControlled = true;
      }
    }

    if (!this.engine.cameraLock) {
      if (this.phase === 'LIVE' || this.phase === 'RESOLVE' || this.phase === 'FOUL') {
        this.liveCam = this.liveCam ?? { pos: CAM.live.pos.clone(), look: CAM.live.look.clone() };
        const trailBall = this.ball.mode === 'flying' && this.elapsed < (this.ballCamUntil ?? 0);
        if (this.phase === 'FOUL' || (this.kickingIsPlayer() && trailBall)) {
          // trail the kicked ball so you SEE where it went (left / right / deep / foul)
          const b = this.ball.pos;
          this.liveCam.pos.set(b.x * 0.7, Math.max(6.5, b.y * 0.45 + 7.5), b.z + 11.5);
          this.liveCam.look.set(b.x, Math.max(0.6, b.y * 0.5), b.z);
        } else if (this.kickingIsPlayer()) {
          // OFFENSE: tight infield view so you SEE the bags and your runner while you tap to run
          const lead = this.leadRunner() ?? this.runners.find(r => r.state === 'held');
          const rp = lead ? this.runnerWorldPos(lead).p : FIELD_LAYOUT.home;
          const fx = rp.x * 0.5;
          this.liveCam.pos.set(fx, 12.5, 6.5);
          this.liveCam.look.set(fx, 0.7, -10.5);
        } else {
          // DEFENSE: frame YOUR fielder + the ball so you can drag and make the play
          const a = (this.activeFielder ?? this.chaser ?? this.kicker).group.position;
          const b = this.ball.pos;
          const mid = a.clone().add(b).multiplyScalar(0.5);
          const sep = Math.min(30, a.distanceTo(b));
          this.liveCam.pos.set(mid.x * 0.5, Math.min(15, 8 + sep * 0.25), mid.z + 9 + sep * 0.25);
          this.liveCam.look.set(mid.x, 0.5, mid.z);
        }
        this.camTarget = this.liveCam;
      }
      const cam = this.engine.camera;
      cam.position.lerp(this.camTarget.pos, Math.min(1, rawDt * 3));
      this.camLook.lerp(this.camTarget.look, Math.min(1, rawDt * 3));
      cam.lookAt(this.camLook);
    }

    // pulse the base target rings
    if (this.baseRings[0].visible) {
      const s = 1 + Math.sin(this.elapsed * 6) * 0.12;
      for (const r of this.baseRings) r.scale.setScalar(s);
    }
  }

  destroy() {
    this.offTap?.();
    this.offSwipe?.();
    this.offDrag?.();
    this.offUp?.();
    this.offStroke?.();
    this.offFrame?.();
    this.clearTimers();
    this.hud.destroy();
    this.engine.scene.remove(this.field.root, this.ball.mesh, this.marker, this.fielderRing);
    for (const c of [...this.chars.home, ...this.chars.away]) this.engine.scene.remove(c.group);
  }
}
