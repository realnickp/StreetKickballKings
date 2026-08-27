// The match conductor: binds MatchEngine (rules) + Ball (physics) + sprite
// characters + GestureInput (touch) + Hud (DOM) into a playable game.
// Real baseball-style base running: EVERY runner on base runs on contact,
// holds at a bag or keeps going, and scores at home. The engine records the
// exact field outcome via applyOutcome().
import * as THREE from 'three';
import { MatchEngine } from './matchState.js';
import { judgeKick, launchParams, powerFromError, isHrEligible, flickShape, flickSteerDeg, FLICK, aiSwingStartS, safetyLaunchDelayS, footBoneRegex } from './kickTiming.js';
import { mashSpeed, humanRunSpeed, RunnerSim } from './baseRunning.js';
import { resolveBaseThrow, resolvePeg } from './throwing.js';
import { SpecialMeter } from './specialMoves.js';
import { PowerKicks } from './powerKicks.js';
import { pickPitch, aiKickError, aiAim, aiWantsPeg, aiMashRate, aiJukes, aiThrowsFire } from './ai.js';
import { PickleDuel, shuttleDir } from './pickleDuel.js';
import { RunnerWatchdog } from './runnerWatchdog.js';
import { TrainFlyby } from './trainFlyby.js';
import { PITCH_PATTERNS, PITCH_FAMILIES, pickVariant, scoreTrace } from './pitchPattern.js';
import { igniteBall, douseBall, makeGlowTexture } from '../cinematics/fx.js';
import { ReplayRecorder } from '../cinematics/replay.js';
import { Ball } from './ball.js';
import { CityElements } from './cityElements.js';
import { CrewHeat } from './crewHeat.js';
import { CameraDirector, SHOTS } from './cameraDirector.js';
import { buildField, FIELD_LAYOUT } from './field.js';
import { pickDance, pickDances } from './animExtras.js';
import { WALKUP, walkS, pickTaunt, stealAllowed } from './walkup.js';
import { revertStealBooks } from './stealBooks.js';
import { SpeedTrail } from './fx/speedTrail.js';
import { Hud } from '../ui/screens/hud.js';
import { edgeClamp } from '../ui/runnerArrows.js';
import { gearLine } from '../meta/gearLine.js';
import { pregameTimeline } from './pregame.js';

// fallback facing for a trail update on a runner who never got a live `dir`
// this game (defensive only — every runner passes through the running branch
// at least once before it could apply); shared + read-only, never mutated.
const TRAIL_FALLBACK_DIR = new THREE.Vector3(0, 0, 1);

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

// scratch vectors for snapping a held ball into the holder's hands (no per-frame alloc)
const _ballHand = new THREE.Vector3();
const _foreL = new THREE.Vector3();
const _foreR = new THREE.Vector3();
const _boneAxis = new THREE.Vector3();
const CAM = {
  // KICK role: low behind home, the pitch rolls AT you so you read the timing
  kick: { pos: new THREE.Vector3(0, 3.4, 8.0), look: new THREE.Vector3(0, 1.2, -12) },
  // PITCH role: centered behind the mound, looking down the lane at the kicker —
  // lateral break still reads as horizontal drift from here (no need to go off-axis)
  pitch: { pos: new THREE.Vector3(0, 5.0, -19.0), look: new THREE.Vector3(0, 1.1, -1.5) },
  live: { pos: new THREE.Vector3(0, 16, 14), look: new THREE.Vector3(0, 0, -16) },
};

const LEAD_M = 1.4; // how far runners lead off their bag before the pitch
const PICKLE_SLOWMO = 0.6; // the pickle stage runs in bullet-time — readable, reactable

/** Directional stride for the kicker lining up: signed x-velocity (m/s) ->
 *  strafe clip name, or null when settled. Kicker faces the mound (-z), so
 *  +x movement is his RIGHT. Dead-zone matches the old dead-feet fix (0.6). */
export function kickerStrideAnim(vxSigned) {
  if (Math.abs(vxSigned) <= 0.6) return null;
  return vxSigned > 0 ? 'strafeR' : 'strafeL';
}

/** Which broadcast shot covers the live situation. Pure — unit-tested. */
export function chooseLiveShot({ phase, kickingIsPlayer, trailBall, deepBall, runnerHome }) {
  if (phase === 'FOUL') return 'foulTrail';
  if (kickingIsPlayer && trailBall) return deepBall ? 'crane' : 'ballFlight';
  if (kickingIsPlayer && runnerHome) return 'homeStretch'; // a run is coming in — show it
  if (kickingIsPlayer) return 'runners';
  return 'defense';
}

export class MatchScene {
  constructor({ engine, input, bus, teams, chars, fieldData, tuning, difficulty = 'Street', playerSide = 'away', firstKick = 'away', hudRoot, autoStart = true, gear = null, danceBag = null }) {
    this.engine = engine;
    this.input = input;
    this.bus = bus;
    this.teams = teams;
    this.tuning = tuning;
    this.difficulty = difficulty;
    this.playerSide = playerSide;
    // THE LOCKER: the player's equipped gear ({kick, cleats, uniform} catalog
    // entries or nulls). Only the kick slot matters in-scene — cleats/uniform
    // are applied at character build time.
    this.playerGear = gear;
    // LOCKER cleats: a real leg on the bases + a coloured trail so it's SEEN
    this.cleatSpeedMult = gear?.cleats?.speedMult ?? 1;
    this.cleatStealMult = gear?.cleats?.stealMult ?? 1;
    this.cleatHex = gear?.cleats?.hex ?? null;
    this.trailPool = this.cleatHex ? Array.from({ length: 4 }, () => new SpeedTrail(engine.scene, this.cleatHex)) : [];
    // walk-up cleat ring: a flat ring in the cleat colour under the kicker's feet
    this.cleatRing = null;
    if (this.cleatHex) {
      this.cleatRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.6, 40), new THREE.MeshBasicMaterial({ color: this.cleatHex, transparent: true, opacity: 0.85, depthWrite: false }));
      this.cleatRing.rotation.x = -Math.PI / 2; this.cleatRing.position.y = 0.02; this.cleatRing.visible = false;
      engine.scene.add(this.cleatRing);
    }
    this.walkup = null;
    this.danceBag = danceBag;
    // lifetime-career feed: per-match counters, shipped out on matchOver
    this.matchStats = { hr: 0, defOuts: 0, steals: 0, pickleEscapes: 0, perfects: 0 };

    this.match = new MatchEngine({ home: teams.home.id, away: teams.away.id }, tuning.match, { firstKick });
    this.field = buildField(fieldData, engine.scene);
    // Light the live layer BY the scene: IBL + grade tint derived from this
    // field's own backdrop art so court/players sit inside it, not on top.
    engine.setSceneEnvironment?.(fieldData.textures?.backdrop);
    this.ball = new Ball(engine.scene);
    this.fenceM = fieldData.fenceM;
    this.fenceTopY = fieldData.fenceHeightM ?? 4.5;
    this.ball.setFence(this.fenceM, this.fenceTopY);
    // City element: this field's signature modifier (Street Rules pillar 1)
    this.elements = new CityElements({ elementId: fieldData.element ?? 'sea-breeze' });
    // el-train fields get a VISIBLE train riding the painted track when the
    // rumble procs (dev: "you should absolutely see the train")
    if ((fieldData.element ?? '') === 'el-train') {
      this.trainFly = new TrainFlyby(engine.scene, fieldData.backdropGeo);
    }
    this.elementInning = 1;
    // Crew heat: per-team momentum (Street Rules pillar 2); rebuilt each startMatch
    this.heat = new CrewHeat();

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

    // instant-replay capture: the last ~6s of every character's skeleton + ball
    this.replayChars = [...this.chars.home, ...this.chars.away];
    this.replayRecorder = new ReplayRecorder({ seconds: 6, hz: 30 });
    this.replayRecorder.track(this.replayChars, this.ball);

    this.special = new SpecialMeter(teams[playerSide], tuning);
    this.power = new PowerKicks({ meter: this.special, gear: gear?.kick ?? null });

    this.aim = 'center';
    this.phase = 'IDLE';
    this.strikes = 0;
    this.timers = [];
    this.runners = [];
    this.duel = null; // THE DUEL (pickle v4) — one stage object for both sides
    this.watchdog = new RunnerWatchdog(tuning.duel.watchdogStallS);
    this.activeFielder = null;
    this.fielderTarget = null;
    this.lastDragAt = -10;
    this.camTarget = CAM.kick;
    this.camLook = CAM.kick.look.clone();
    this.camDir = new CameraDirector(engine.camera, { baseFov: engine.baseFov ?? 58 });
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

    // DUEL identity: ONE teal ring under the character you control
    {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.25, 28),
        new THREE.MeshBasicMaterial({ color: '#3ec6b5', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      engine.scene.add(ring);
      this.youRing = ring;
    }

    bus.on('cine:start', () => { this.cinematicLock = true; this.hud.hint(''); });
    bus.on('cine:done', () => { this.cinematicLock = false; this.chipSkip = false; this.hud.hideSkipChip?.(); });
    // city element chip: inning rolls set it, procs pulse it
    bus.on('element:roll', (r) => this.hud.setElement(r));
    // Play It: a proc is a telegraphed WINDOW with a decision — tell the player
    // exactly what to do while it's open, loud and center screen.
    const PROC_CALLS = {
      'el-train': "TRAIN'S ROLLING — HOLD YOUR NERVE!",
      'motorcade': "SIRENS — RUN ON 'EM!",
      'sea-breeze': 'GUST — KICK NOW!',
      'the-hawk': 'THE HAWK IS HOWLING!',
    };
    bus.on('element:proc', (p) => {
      this.hud.flashElement(p.active);
      if (p.active) {
        const line = PROC_CALLS[this.elements.id] ?? `${p.label}!`;
        this.hud.call(line, 'homer');
      }
    });
    // a cutscene's return throw: the scene flies it and the pitcher catches
    bus.on('cine:returnThrow', () => this.flyBallToPitcher(14));
    // (the crowned/caught strike-screen VIDEOS are gone — 2026-08-03 rework:
    // both moments play in-engine now and finalizePlay*'s cinematicLock polls
    // hand off to the next play when the director finishes)

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
    this.hud.onGo = () => this.sendHeldRunner();
    this.hud.onSteal = (b) => this.startSteal(b);
    this.hud.onSfx = (name) => this.bus.emit('sfx', name);
    this.hud.onDuel = () => this.onDuelButton();
    this.hud.onReverse = () => this.duelReverse();
    this.hud.onCall = () => this.onCallButton();
    this.call = null;     // open street-call window: {kind:'dive'|'rob', until?}
    this.robbing = null;  // fence-rob climb state: {fielder, phase, t, topY}
    this.stealHot = false;
    this.hud.onSpecial = () => {
      if (!this.kickingIsPlayer() || !this.power.arm()) return;
      this.bus.emit('sfx', 'crown-arm');
      this.hud.hint(`${this.power.name} ARMED — LET IT RIP`);
      this.refreshHud();
    };

    this.offFrame = engine.onFrame((dt, rawDt) => this.update(dt, rawDt));

    this.refreshHud();
    if (autoStart) this.startMatch(firstKick);
  }

  /** (Re)start a full match. Safe to call again for a rematch. */
  startMatch(firstKick) {
    this.matchStats = { hr: 0, defOuts: 0, steals: 0, pickleEscapes: 0, perfects: 0 }; // rematch reuses the scene
    this.match = new MatchEngine(
      { home: this.teams.home.id, away: this.teams.away.id },
      this.tuning.match,
      { firstKick },
    );
    this.match.bus.on('halfEnd', () => { this.halfJustEnded = true; });
    // the OFFENSE builds the crown: every run the player's side scores feeds
    // the meter (dev, 2026-08-04: "a meter... based on base hits, runs etc").
    // Registered HERE, not in the ctor: startMatch swaps in a fresh MatchEngine,
    // so a ctor-bound listener was feeding a dead bus from the first pitch on.
    this.match.bus.on('score', ({ side, runs }) => {
      if (side !== this.playerSide || runs <= 0) return;
      for (let i = 0; i < runs; i++) this.crownFeed('run');
    });
    // originalBases = "the bases when this pitch left" — restoreRunners plays
    // (strikeout / foul-out / 3rd-out catch) put runners BACK there. It must
    // track every engine base change, not just kicks (launchRunners): a
    // strikeout after a hit or a steal was stamping the PREVIOUS play's bases
    // over the live ones — runners vanished, steals silently undone.
    this.match.bus.on('play', () => { this.originalBases = [...this.match.state.bases]; });
    // element re-rolls each new inning (fixed identity, fresh strength/direction)
    this.elementInning = 1;
    this.applyElementRoll();
    // fresh momentum every match; rules-engine outcomes feed the heat meter here
    // (scene-only moments — PERFECT, robbed, peg, pickle — feed at their call sites)
    this.heat = new CrewHeat();
    this.match.bus.on('play', ({ type, side }) => {
      const def = side === 'home' ? 'away' : 'home';
      if (['double', 'triple', 'homerun', 'steal'].includes(type)) this.noteHeat(side, type);
      else if (['strikeout', 'caught-stealing'].includes(type)) this.noteHeat(def, type);
      else if (type === 'foulout') this.noteHeat(def, 'catch'); // live catches count at catchOut
      this.heat.notePlay();
      this.refreshHeatHud(true);
    });
    this.match.bus.on('halfEnd', () => {
      this.bus.emit('sfx', 'inning');
      if (this.match.state.inning !== this.elementInning) {
        this.elementInning = this.match.state.inning;
        this.applyElementRoll();
      }
    });
    this.special.value = 0;
    this.power = new PowerKicks({ meter: this.special, gear: this.playerGear?.kick ?? null }); // fresh charges every match (rematch reuses the scene)
    this._gearToasted = false; // the YOUR GEAR strip shows again at the first at-bat of a rematch
    const begin = () => {
      this.bus.emit('vo', 'playball');
      this.refreshHud();
      this.nextAtBat();
    };
    this.lineupIntro(begin);
  }

  // ---------- STARTING LINEUPS: splash cards only (dev, 2026-08-25: the
  // choreographed walkout dance number is gone — per-kicker walk-up taunts
  // replace it, a later task). STARTING LINEUPS stamp, then the away crest
  // splash, then the home crest splash, then the GAME TIME break. Tap
  // anywhere is inert here — the skip chip is the only way out (the
  // cinematicLock tap route emits cine:skip; walkoutActive gates it).
  lineupIntro(done) {
    const url = new URLSearchParams(location.search);
    if (url.has('nointro') || url.has('drill')) return done();

    this.walkoutActive = true;
    this.cinematicLock = true;
    this.engine.cameraLock = true;
    this.hud.setLetterbox(true);
    this.hud.hint('');
    // skipping the lineup is a DELIBERATE act — the chip, not any stray tap
    // coming off the coin toss (dev: "I don't always see the starting lineup")
    this.hud.showSkipChip(() => this.bus.emit('cine:skip'));
    // empty stage: everyone hides, stars appear one at a time
    for (const c of [...this.chars.home, ...this.chars.away]) c.group.visible = false;

    const cleanup = () => {
      if (!this.walkoutActive) return;
      this.walkoutActive = false;
      // back to the empty-stage invariant — nextAtBat unhides who it needs
      for (const c of [...this.chars.home, ...this.chars.away]) c.group.visible = false;
      offSkip?.();
      this.hud.walkoutHide();
      this.hud.teamSplashHide();
      this.hud.hideSkipChip();
      // ===== THE BREAK (dev, 2026-08-05: "we need some sort of break between
      // the opening dance number and the game... the music needs to change").
      // The dance ends WITH its music — scratch, one breath of crowd, GAME
      // TIME — then the game starts on its own groove (the in-match beat; the
      // city track stays the walkout's showcase).
      this.bus.emit('sfx', 'scratch');
      this.bus.emit('music', { stop: true });
      this.bus.emit('sfx', 'crowd-cheer');
      this.hud.stamp('GAME TIME!', 'crowned');
      this.bus.emit('vo', 'gametime');
      this.after(1.6, () => {
        this.hud.setLetterbox(false);
        this.cinematicLock = false;
        this.engine.cameraLock = false;
        this.bus.emit('music', { name: 'beat' });
        done();
      });
    };
    const offSkip = this.bus.on('cine:skip', cleanup);

    // full-screen crest splash introducing a side (dev: "a cool splash
    // animation in between... with the logos of the teams")
    const splash = (team, t) => {
      this.after(t, () => {
        if (!this.walkoutActive) return;
        this.hud.walkoutHide();
        this.hud.teamSplash({
          name: team.name, city: team.city, logo: team.logo,
          color: team.colors?.primary,
        }, 1.9);
      });
    };

    for (const e of pregameTimeline().events) {
      switch (e.kind) {
        case 'open': this.after(e.t, () => { if (this.walkoutActive) { this.bus.emit('vo', 'lineups'); this.hud.stamp('STARTING LINEUPS', 'crowned'); } }); break;
        case 'splash': splash(this.teams[e.side], e.t); break;
        case 'cleanup': this.after(e.t, cleanup); break;
      }
    }
  }

  /** GAME OVER hand-off, shared by every GAME_END site: wait out any running
   *  cinematic, throw the winners a ~2.8s on-field dance party (dev, 2026-08-03:
   *  dances in celebrations), then emit matchOver for the box score. */
  fireMatchOver() {
    const fire = () => {
      if (this.cinematicLock) return this.after(0.3, fire);
      this.victoryLap(() => this.bus.emit('matchOver', {
        winner: this.match.winner(), score: this.match.state.score, stats: this.matchStats,
      }));
    };
    this.after(0.6, fire);
  }

  /** The winning squad clusters at the plate, every body hitting a different
   *  dance, camera pulling wide — tap skips straight to the box score. */
  victoryLap(done) {
    const winner = this.match.winner();
    const squad = this.chars[winner] ?? [];
    if (!squad.length) return done();
    let fired = false;
    let offFrame = null;
    const finish = () => {
      if (fired) return;
      fired = true;
      offFrame?.(); // a skipped lap must stop steering the camera (it fights CameraDirector)
      offSkip?.();
      this.cinematicLock = false;
      this.engine.cameraLock = false;
      this.hud.setLetterbox(false);
      done();
    };
    this.cinematicLock = true;
    this.engine.cameraLock = true;
    this.hud.setLetterbox(true);
    const offSkip = this.bus.on('cine:skip', finish);
    const SLOTS = [[0, -3.2], [-1.5, -3.8], [1.5, -3.8], [-2.8, -4.6], [2.8, -4.6], [-0.8, -5.4], [0.8, -5.4], [0, -6.2]];
    const dances = pickDances(squad); // 8 winners, 8 DIFFERENT moves — a block party
    squad.forEach((c, i) => {
      const [x, z] = SLOTS[i % SLOTS.length];
      c.group.visible = true;
      c.group.position.set(x, 0, z);
      this.faceTo(c, new THREE.Vector3(x, 0, 8), true);
      c.animator.play(dances[i]);
    });
    this.hud.stamp(`${(this.teams[winner]?.name ?? 'WINNERS').toUpperCase()} TAKE THE BLOCK!`, 'crowned');
    this.bus.emit('sfx', 'crowd-cheer');
    this.bus.emit('sfx', 'cheer-big');
    this.bus.emit('sfx', 'bassdrop');
    this.field.crowdEnergy = 1;
    let lapT = 0;
    offFrame = this.engine.onFrame((dt) => {
      lapT += dt;
      const k = Math.min(1, lapT / 2.8);
      this.engine.camera.position.set(0, 1.5 + k * 0.8, -0.5 + k * 6.5);
      this.engine.camera.lookAt(0, 1.05, -4.2);
      if (k >= 1) { offFrame?.(); finish(); }
    });
  }

  // ---------- helpers ----------
  applyElementRoll() {
    const roll = this.elements.rollInning(this.match.state.inning);
    const w = this.elements.windAccel();
    this.ball.wind = w;
    this.ball.restitutionScale = this.elements.bounceScale();
    this.buildSteamSprites();
    this.bus.emit('element:roll', roll);
    this.bus.emit('vo', `element-${roll.id}`);
    // teach → telegraph → payoff: FIRST roll gets the full-screen teach card;
    // every later inning roll gets a compact "what changed" callout
    if (!this._elementIntroShown) {
      this._elementIntroShown = true;
      // HOLD THE GAME while the card is up — the AI was pitching behind it
      // and players ate strikes they never saw (dev report). Render keeps
      // going; gameplay (and the pitch clock) freezes until tap/timeout.
      this.engine.paused = true;
      this.hud.elementIntro(roll, () => { this.engine.paused = false; });
    } else {
      const pips = '●'.repeat(Math.max(1, Math.round(roll.intensity * 3)));
      // y 150: below the pitch-grade slot so the two never stack (overlap fix)
      this.hud.callout(`${roll.label.toUpperCase()} ${pips}`, { x: window.innerWidth / 2, y: 150, ttl: 2000, key: 'element-reroll' });
    }
  }

  /** Steam-vent visuals: a small cluster of ADDITIVE glow puffs per cloud.
   *  Additive is the recipe proven on-device by the fire FX — normal alpha
   *  blending rendered as a hard-edged white card on the dev's phone, and a
   *  single big billboard read as a flat slab from the high pitch camera. */
  buildSteamSprites() {
    this.steamSprites ??= [];
    for (const s of this.steamSprites) s.visible = false;
    if (this.elements.id !== 'steam-vents') return;
    this._steamTex ??= makeGlowTexture('rgba(235,242,247,0.8)', 'rgba(190,202,212,0.3)');
    const clouds = this.elements.steamClouds();
    const PUFFS = 3;
    const need = clouds.length * PUFFS;
    while (this.steamSprites.length < need) {
      const mat = new THREE.SpriteMaterial({
        map: this._steamTex, color: 0x9aa6ae, blending: THREE.AdditiveBlending,
        transparent: true, opacity: 0.4, depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.userData.phase = this.steamSprites.length * 1.7;
      this.engine.scene.add(sp);
      this.steamSprites.push(sp);
    }
    clouds.forEach((c, i) => {
      for (let j = 0; j < PUFFS; j++) {
        const sp = this.steamSprites[i * PUFFS + j];
        const a = (j / PUFFS) * Math.PI * 2 + i * 1.3;
        sp.position.set(c.x + Math.cos(a) * c.r * 0.35, 1.5 + j * 0.9, c.z + Math.sin(a) * c.r * 0.35);
        const sc = c.r * (1.0 + j * 0.3);
        sp.scale.set(sc, sc * 0.7, 1);
        sp.visible = true;
      }
    });
  }

  /** Element+heat-aware throw speed — use instead of raw tuning at throw sites. */
  throwSpeed() {
    return this.tuning.throwing.throwSpeedMs * this.elements.throwZipScale()
      * this.heat.throwSpeedScale(this.match.fieldingSide());
  }

  /** Feed a heat event and stage the ON FIRE moment when a bar fills. */
  noteHeat(side, evt) {
    const before = this.heat.value[side];
    const res = this.heat.add(side, evt);
    // exact applied delta (respects the 100 clamp + pegged-while-burning)
    const gained = this.heat.value[side] - before;
    if (gained > 0) this.hud.heatFloat(side, gained);
    if (res === 'ignited') {
      this.hud.call(this.teamShort(side).toUpperCase() + ' ON FIRE!', 'crowned');
      this.bus.emit('sfx', 'crowd-cheer');
      this.bus.emit('vo', 'fire'); // no-ops until a VO line exists
      this.field.crowdEnergy = 1;
    }
    this.refreshHeatHud(true);
  }

  /** Push heat values to the HUD; unforced calls are throttled to 4Hz. */
  refreshHeatHud(force = false) {
    if (!force && this.elapsed - (this._heatHudAt ?? -1) < 0.25) return;
    this._heatHudAt = this.elapsed;
    this.hud.setHeat({
      home: this.heat.value.home / 100,
      away: this.heat.value.away / 100,
      fireHome: this.heat.onFire('home'),
      fireAway: this.heat.onFire('away'),
    });
  }

  kickingIsPlayer() {
    return this.match.kickingSide() === this.playerSide;
  }
  kickingChars() {
    return this.chars[this.match.kickingSide()];
  }
  fieldingChars() {
    return this.chars[this.match.fieldingSide()];
  }
  /** Keep a caught/held ball visibly IN the holder's hands every frame — so you
   *  SEE it after a catch (gameplay AND the replay cinematic) and while a baseman
   *  holds it, instead of it sitting at the body centre. Tracks the animated
   *  forearm bones when present (so it rides the raised glove on a snag), else a
   *  facing-based offset. No-op when nobody is holding or the ball is in flight. */
  carryHeldBall() {
    const holder = this.fieldingChars().find((c) => c.hasBall);
    if (!holder || this.ball.mode === 'flying' || this.ball.mode === 'rolling-pitch') return;
    const yaw = holder.group.rotation.y;
    const R = holder.animator?.b?.RForeArm;
    const S = holder.animator?.b?.RArm;
    if (R) {
      // the ball lives in the THROWING hand (right) — it rides a raised arm in
      // the catch celebration and leaves from the same hand on the return throw.
      // Palm = elbow extended along the forearm bone, signed AWAY from the shoulder.
      R.updateWorldMatrix(true, false);
      R.getWorldPosition(_foreR);
      _boneAxis.setFromMatrixColumn(R.matrixWorld, 1).normalize().multiplyScalar(0.26);
      if (S) {
        S.updateWorldMatrix(true, false);
        S.getWorldPosition(_foreL); // scratch: shoulder position
        if (_ballHand.copy(_foreR).add(_boneAxis).distanceToSquared(_foreL) <
            _ballHand.copy(_foreR).sub(_boneAxis).distanceToSquared(_foreL)) {
          _boneAxis.negate(); // axis pointed back up the arm — flip toward the palm
        }
      }
      _ballHand.copy(_foreR).add(_boneAxis);
    } else {
      const p = holder.group.position; // fallback: right-hand offset from the body, chest height
      _ballHand.set(
        p.x + Math.sin(yaw) * 0.32 + Math.cos(yaw) * 0.16,
        1.2,
        p.z + Math.cos(yaw) * 0.32 - Math.sin(yaw) * 0.16,
      );
    }
    this.ball.mesh.position.copy(_ballHand);
    this.ball.vel.set(0, 0, 0);
    this.ball.mode = 'idle';
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
  /** like basePos but -1 = home plate (a runner's fromBase can be the plate) */
  bagPos(i) {
    return i < 0 ? FIELD_LAYOUT.home.clone() : this.basePos(Math.min(i, 3));
  }
  // yaw so a +z-forward model placed at `from` faces toward `to`
  /** plain-object context the CameraDirector shots read */
  camCtx() {
    const lead = this.leadRunner?.() ?? this.runners.find((r) => r.state === 'held');
    const homeR = this.runners.find((r) => r.state === 'running' && r.targetBase === 3);
    return {
      ball: this.ball,
      kickerPos: this.kicker?.group.position,
      leadRunnerPos: lead ? this.runnerWorldPos(lead).p : FIELD_LAYOUT.home,
      // the bag the lead runner is going for — the runners shot keeps it in frame
      targetBasePos: lead && lead.targetBase >= 0 ? this.basePos(Math.min(lead.targetBase, 3)) : FIELD_LAYOUT.first,
      activeFielderPos: (this.activeFielder ?? this.chaser ?? this.kicker)?.group.position,
      homeRunnerPos: homeR ? this.runnerWorldPos(homeR).p : null,
      pickleA: this.pickleCam ? this.bagPos(this.pickleCam.fromBase) : null,
      pickleB: this.pickleCam ? this.bagPos(this.pickleCam.targetBase) : null,
      pickleRunnerPos: this.pickleCam ? this.pickleCam.char.group.position : null,
      walkupT: this.walkup?.phase === 'taunt' ? Math.max(0, Math.min(1, 1 - (this.walkup.until - this.elapsed) / WALKUP.tauntS)) : 0,
    };
  }

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
    this.hud.setCount(s.balls);
    this.hud.showSpecial(this.kickingIsPlayer()); // crown super-kick is ONLY for when you're kicking
    this.hud.setPowerKick(this.power.hudState());
  }
  // (worldToScreen lives near the tap-picking helpers below — this class used
  // to define it TWICE; the later, null-returning version always won)
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
    for (const t of this.trailPool) { t.hide(); t.busy = false; }
    this.power.disarm(); // an armed-but-unkicked charge is refunded
    if (this.kickingIsPlayer() && this.playerGear && !this._gearToasted) {
      this._gearToasted = true;
      this.after(0.8, () => this.hud.gearToast(gearLine(this.playerGear)));
    }
    this._hopCalled = false;
    this._kickApproach = null;
    // heat-wave moment (Play It): tell the offense ONCE per half that the
    // defense is gassed — then the pulsing steal chips carry the message
    const halfKey = `${this.match.state.inning}-${this.match.state.half}`;
    if (this.elements.id === 'heat-wave' && this.match.state.inning >= 3
        && this.kickingIsPlayer() && this._gassedHalf !== halfKey) {
      this._gassedHalf = halfKey;
      this.after(1.2, () => this.hud.call("THEY'RE GASSED — TAKE OFF!", 'homer'));
    }
    this.throwing = false;
    this.ballControlled = false;
    this.playFinalized = false;
    this.pendingFlick = null;
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
    this.startWalkup();
    // broadcast lower-third: every new kicker gets the NOW KICKING card
    // (name + best stats, ~2s, non-blocking — the full walkout is match-start only)
    const kp = this.kicker.data;
    if (kp?.nick && !this.walkoutActive) {
      this.hud.walkoutShow({
        nick: kp.nick, number: kp.number ?? this.kicker.number, pos: kp.pos,
        stats: kp.stats, color: this.teams[this.match.kickingSide()].colors?.primary,
        label: 'NOW KICKING', mini: true,
        gear: this.kickingIsPlayer() ? gearLine(this.playerGear) : null,
      });
      this.after(walkS() + WALKUP.tauntS + 0.4, () => this.hud.walkoutHide());
    }

    this.baseChars = [null, null, null];
    // fresh at-bat: "time-of-pitch" bases start as the live engine bases (also
    // covers staged bases — tutorial drills — that bypass the engine's bus)
    this.originalBases = [...this.match.state.bases];
    this.stealing = null;
    this.stealDefense = null;
    this.stealResolving = false;
    this.goOffer = null;
    this.hud.hideGo();
    this.duel = null;
    this.releasePickleFreeze();
    this.restoreSpeed();
    this.hud.hideDuel();
    this.watchdog.reset();
    this.match.state.bases.forEach((occ, i) => {
      if (occ === null) return;
      const c = off[occ % off.length];
      if (c === this.kicker) return;
      c.group.visible = true;
      // runners take a LEAD off the bag toward the next base — it's a real
      // head start when the ball is kicked, and the launch point for a steal
      const bag = this.basePos(i);
      const dir = this.basePos(Math.min(i + 1, 3)).clone().sub(bag).normalize();
      c.group.position.copy(bag).addScaledVector(dir, LEAD_M);
      this.baseChars[i] = c;
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
    } else {
      this.camTarget = CAM.pitch;
      this.hud.hint('YOUR ARM — PICK A PITCH');
    }
  }

  /** Every kicker walks up to the plate and hits a taunt before the pitch;
   *  a tap skips straight to the plate. Drills skip it. */
  startWalkup() {
    const k = this.kicker;
    this.walkup = null; // a new at-bat always supersedes a live walk-up (drills bail below)
    // the WHOLE tutorial session skips the walk-up (spec: drills/tutorial skip it),
    // not just the pickle drill — tutorialQuiet is set for the run by TutorialDirector
    const drill = new URLSearchParams(location.search).has('drill') || this.tutorialNoHomer || this.tutorialQuiet;
    if (drill) { this.placeKickerAtPlate(); this.after(1.2, () => this.serve()); return; }
    const isPlayer = this.kickingIsPlayer();
    k.group.position.set(WALKUP.startX, 0, WALKUP.z);
    this.faceTo(k, new THREE.Vector3(WALKUP.plateX, 0, WALKUP.z), true);
    k.animator.play('walk', { speedFactor: 1 });
    const taunt = pickTaunt({ isPlayer, equipped: this.playerGear?.taunt ?? null });
    this.walkup = { char: k, phase: 'walk', until: this.elapsed + walkS(), taunt: k.animator.hasClip?.(taunt) ? taunt : null, isPlayer, cut: true };
    this.bus.emit('sfx', 'stomp');
    if (this.cleatRing && isPlayer) { this.cleatRing.visible = true; }
  }

  placeKickerAtPlate() {
    const k = this.kicker;
    k.group.position.set(WALKUP.plateX, 0, WALKUP.z);
    this._kickerPrevX = WALKUP.plateX; // the snap home is not a slide — no phantom strafe
    this.faceTo(k, FIELD_LAYOUT.pitcher, true);
    k.animator.play('plate');
    if (this.cleatRing) this.cleatRing.visible = false;
  }

  /** Advance the walk-up; called from update(). */
  updateWalkup(dt) {
    const w = this.walkup;
    if (!w) return;
    const k = w.char;
    if (w.phase === 'walk') {
      k.group.position.x = Math.min(WALKUP.plateX, k.group.position.x + WALKUP.mps * dt);
      if (this.cleatRing?.visible) this.cleatRing.position.set(k.group.position.x, 0.02, k.group.position.z);
      if (this.elapsed >= w.until || k.group.position.x >= WALKUP.plateX) {
        k.group.position.x = WALKUP.plateX;
        if (!w.taunt) return this.endWalkup(false);
        w.phase = 'taunt';
        w.until = this.elapsed + WALKUP.tauntS;
        w.cut = true;
        const shot = SHOTS.walkupTaunt(this.camCtx());
        k.faceYaw = this.yawTo(k.group.position, shot.pos);
        k.animator.play(w.taunt, { onDone: () => { if (this.walkup === w) this.endWalkup(false); } });
        this.bus.emit('sfx', w.isPlayer ? 'crowd-cheer' : 'boo');
        this.field.crowdEnergy = Math.max(this.field.crowdEnergy ?? 0, 0.7);
      }
    } else if (this.elapsed >= w.until) {
      this.endWalkup(false);
    }
  }

  endWalkup(skipped) {
    if (!this.walkup) return;
    this.walkup = null;
    this.placeKickerAtPlate();
    this.camDir.request(this.camTarget === CAM.pitch ? 'pitchSelect' : 'kick', this.camCtx(), { cut: true });
    this.after(skipped ? WALKUP.serveDelayS : 0.2, () => this.serve());
  }

  /** Serve the next pitch, branching on role. */
  serve() {
    if (this.match.state.phase === 'GAME_END') return;
    // stale-timer guard: never re-serve over a live pitch/trace/kick — a
    // double serve kills the ball mid-flight and eats the play silently
    if (this.phase !== 'SETUP' && this.phase !== 'PITCH_SELECT') return;
    if (this.walkup) return; // a stale timer must never serve mid-walk-up
    this.lastStealCommit = null; // a fresh pitch — the previous steal is settled
    this._gearSwing = null; // any unfinished crown swing is history now
    if (this.kickingIsPlayer()) this.startAutoPitch();
    else this.startPitchSelect();
  }

  // ---------- KICK role: AI auto-pitches a surprise, you swipe-to-kick ----------
  startAutoPitch() {
    this.phase = 'PITCH';
    this.camTarget = CAM.kick;
    this.hud.showPitchSelect(false);
    this.hud.hidePattern();
    const hasRunners = this.match.state.bases.some((b) => b !== null);
    this.hud.hint(hasRunners
      ? 'FLICK LONG = SKY BALL • CURL IT = PLACE IT'
      : 'SHORT FLICK = LINER, LONG = SKY • CURL LEFT/RIGHT = AIM');
    this.kicker.group.position.x = 0; // start centred; you slide left/right to line up
    this._kickerPrevX = 0; // reset stride tracker so the recenter isn't read as a slide
    this.pitch = pickPitch(this.tuning);
    // varied plate location so you must move the kicker to line up the incoming
    // ball (kept modest — curves already add up to ~2.2m of lateral, and the
    // kicker can slide ±3.4m, so curve + location stays reachable)
    const locX = (Math.random() - 0.5) * 1.6; // ±0.8m
    this.pitchLocX = locX;
    // The CPU may throw a FIRE pitch at the human — narrows the kick window (Step 4).
    this.pitch.fire = aiThrowsFire(this.difficulty, this.tuning);
    if (this.pitch.fire) { igniteBall(this.ball); this.hud.fireBadge(true); }
    this.servePitch(this.pitch, /*aiKicks=*/false, locX);
  }

  /** Fire pitches shrink the human's sweet zone + speed the meter sweep via one knob. */
  kickWindowScale() {
    return this.pitch?.fire ? this.tuning.pitch.fireKickWindowScale : 1;
  }

  // ---------- PITCH role: you pick a pitch + trace its pattern ----------
  startPitchSelect() {
    this.phase = 'PITCH_SELECT';
    this.kicked = false;
    this.camTarget = CAM.pitch;
    this.hud.hidePitch();
    this.hud.hideRing();
    this.hud.showPitchSelect(true);
    this.hud.hint('PICK A PITCH TYPE');
  }

  onPitchSelect(familyId) {
    if (this.phase !== 'PITCH_SELECT' || !PITCH_FAMILIES[familyId]) return;
    this.selectedPitch = pickVariant(familyId);
    this.traceBuf = [];
    this.traceExpired = false;
    this.hud.showPitchSelect(false);
    this.hud.showPattern(PITCH_PATTERNS[this.selectedPitch]);
    this.hud.updateTrace([]);
    // start the trace countdown — trace it before the bar empties or it's a wobbler
    this.traceStartedAt = this.elapsed;
    this.traceDeadline = this.elapsed + this.tuning.pitch.traceTimerMs / 1000;
    this.hud.showTraceTimer();
    this.phase = 'PITCH_TRACE';
    this.hud.hint('TRACE IT — FAST + CLEAN!');
  }

  onStroke(e) {
    if (this.phase !== 'PITCH_TRACE') return;
    this.hud.hideTraceTimer();
    const t = this.tuning.pitch.trace;
    const res = scoreTrace(e.points, PITCH_PATTERNS[this.selectedPitch], {
      tolerance: t.tolerance, durMs: e.dur, speedFastMs: t.speedFastMs, speedSlowMs: t.speedSlowMs,
    });
    this.hud.hidePattern();
    const fire = res.quality >= this.tuning.pitch.fireQualityThreshold;
    const bad = res.quality < this.tuning.pitch.badQuality;
    const label = fire ? 'NASTY!' : res.quality > 0.6 ? 'GOOD HEAT' : bad ? 'BALL?' : 'WOBBLER';
    this.hud.pitchGrade(label, res.quality > 0.6); // small top badge, not a big center stamp
    this.throwPlayerPitch(this.selectedPitch, res.quality, fire);
    if (fire) this.hud.fireBadge(true);
  }

  /** Build a quality-scaled pitch from the player's trace and serve it; AI kicks. */
  throwPlayerPitch(id, q, fire = false) {
    const def = this.tuning.pitch.types[id];
    const Q = this.tuning.pitch.quality;
    const speedMph = Math.round(def.speedMph[1] * (Q.weakSpeedFactor + (1 - Q.weakSpeedFactor) * q));
    const curveM = def.curveM * (Q.minBreakFactor + (1 - Q.minBreakFactor) * q);
    const wildX = (1 - q) * Q.maxWildM * (Math.random() - 0.5) * 2; // sloppy = off-target
    const bad = q < this.tuning.pitch.badQuality; // a BALL if the kicker lays off
    this.pitch = { id, speedMph, curveM, ease: def.ease, bounce: def.bounce, q, fire, bad }; // q drives AI kick difficulty
    this.phase = 'PITCH';
    this.hud.hint('');
    this.servePitch(this.pitch, /*aiKicks=*/true, wildX);
    if (fire) igniteBall(this.ball);
    this.maybeAiSteal(); // AI runners may take off on your pitch — be ready to throw down
  }

  /** Shared ball serve for both roles. */
  servePitch(pitch, aiKicks, wildX = 0) {
    this.hud.showPitch(pitch);
    this.bus.emit('sfx', 'pitch');

    const pitcher = this.fieldingChars()[0];

    const type = this.tuning.pitch.types[pitch.id];
    const rollSpeed = pitch.speedMph * 0.12;
    const dur = (this.tuning.pitch.plateDistanceM / rollSpeed) * (type?.durScale ?? 1);
    const plate = new THREE.Vector3(wildX, 0, 0.2);
    // the ball leaves the hand at the delivery clip's RELEASE frame (onContact),
    // not at play() — otherwise the ball rolls away mid-wind-up (dev callout).
    // The AI's swing is scheduled from the SAME moment so its timing still keys
    // off actual ball flight.
    let launched = false;
    const launch = () => {
      if (launched) return;
      launched = true;
      // the NOW KICKING card yields the screen the moment the ball is live
      if (!this.walkoutActive) this.hud.walkoutHide();
      this.ball.startPitch(FIELD_LAYOUT.pitcher.clone().setY(0.35), plate, dur, {
        bounce: pitch.bounce ?? 0, curveM: pitch.curveM ?? 0, ease: pitch.ease ?? 1,
      });
      this.pitchArrival = this.elapsed + dur;
      if (aiKicks) {
        // A sloppy trace is a BALL if taken — disciplined kickers lay off,
        // especially protecting a 3-ball count (Play Fair pillar).
        const [normal, protect] = this.tuning.pitch.layOff[this.difficulty] ?? [0.3, 0.8];
        const layChance = pitch.bad ? (this.match.state.balls >= 3 ? protect : normal) : 0;
        if (pitch.bad && Math.random() < layChance) {
          this.after(dur + 0.5, () => this.resolveBallTaken()); // he watches it roll by
        } else {
          // The full error drives the JUDGE (whiff/foul/contact). The clip is
          // BACK-TIMED by its windup so the contact frame lands on the judged
          // moment (±0.45s of arrival, clamped) — the foot meets a LIVE ball
          // instead of the ball dying at the plate mid-wind-up.
          const errMs = aiKickError(this.difficulty, this.tuning, pitch);
          const windupS = this.kicker.animator.contactDelayS?.('kick') || 0.2;
          const swing = aiSwingStartS({ pitchFlightS: dur, errMs, windupS });
          this.after(swing, () => this.attemptKick({ aim: aiAim(this.difficulty), errMs }, this.elapsed));
        }
      }
      this.stealHot = false; // ball's away — the hot-jump window closes
    };
    this.pitchArrival = Infinity; // nothing may judge arrival until the ball is live
    this.kicked = false;
    this.stealHot = true; // wind-up: a steal called NOW gets the hot jump
    pitcher.animator.play('pitch', {
      onContact: launch,
      onDone: () => pitcher.animator.play('idle'),
    });
    // safety: an animator without a contact mark must never freeze the serve
    this.after(1.2, launch);

    if (aiKicks) {
      this.kicker.group.position.x = 0; // start centred so the CPU visibly slides to line up
      this._kickerPrevX = 0; // reset stride tracker so the recenter isn't read as a slide
    }
  }

  /**
   * @param {object} aimSpec AI: `{aim}`; player swipe: `{aimDeg, bunt}`.
   * @param {number} tapTime release time in elapsed-seconds (same clock as pitchArrival).
   */
  attemptKick(aimSpec, tapTime) {
    if (this.kicked || this.phase !== 'PITCH') return;
    this.kicked = true;
    douseBall(this.ball); // contact made — clear the fire look
    this.kickWasSpecial = false;
    this.kickHrEligible = false;
    const isPlayerKick = this.kickingIsPlayer();
    // AI passes its intended errMs directly; the human's comes from release timing
    const rawErrMs = aimSpec.errMs !== undefined ? aimSpec.errMs : (tapTime - this.pitchArrival) * 1000;
    // city element timing effects: el-train rumble wobbles contact, dj-drop pays on the beat
    const elMods = this.elements.kickMods(this.elapsed);
    const errMs = rawErrMs + elMods.wobbleMs;
    // CPU kickers play their city: bias the kick downwind (home-advantage-by-skill)
    const elWind = this.elements.windAccel();
    if (aimSpec.errMs !== undefined && (elWind.x !== 0 || elWind.z !== 0)) {
      aimSpec.windBiasDeg = Math.max(-14, Math.min(14, elWind.x * 4));
    }

    // Player kick: lining the kicker up under the ball matters as much as timing.
    // Fold the lateral miss into an effective error (1m off ≈ 175ms) and let the
    // positioning bias the aim (you reach across to pull it). AI path has no align.
    let effErr = Math.abs(errMs);
    let aimDeg = aimSpec.aimDeg;
    let alignErrM = 0;
    if (aimSpec.align) {
      const alignErr = this.kicker.group.position.x - this.ball.pos.x;
      alignErrM = Math.abs(alignErr);
      effErr = Math.abs(errMs) + alignErrM * 175;
      // aim = positioning bias + the flick's deliberate sideways CURL (dev:
      // "how can we control the direction of the ball") — curl right, ball
      // goes right, all the way to the line at a full-width drift
      const spread = this.tuning.kick.aimSpreadDeg;
      aimDeg = Math.max(-spread, Math.min(spread, -alignErr * 22 + flickSteerDeg(aimSpec.flick, this.tuning)));
    }
    this.hud.hideRing();
    this.hud.hidePowerMeter();
    // Fire pitch narrows the human's window: dividing the error shrinks the sweet
    // zone and drops the power marker off faster (matches the meter-feed scaling).
    const power01 = isPlayerKick
      ? Math.min(1, powerFromError(errMs / this.kickWindowScale(), this.tuning) + elMods.beatBonus01)
      : null;

    if (effErr > this.tuning.kick.okWindowMs * 1.6) {
      // the miss must READ as a miss: the leg swings through empty air
      // (a frozen kicker was the worst "kick didn't line up" tell)
      this.kicker.animator.play('kick', {
        speed: isPlayerKick ? 1.3 : 1,
        onDone: () => {
          if (this.kicker?.animator?.name === 'kick' && this.kicker.group.visible) this.kicker.animator.play('plate');
        },
      });
      this.strike('WHIFF!');
      return;
    }
    const judged = judgeKick(Math.sign(errMs || 1) * effErr, this.tuning);

    let powerMult = 1;
    this.specialKickGear = null;
    if (this.kickingIsPlayer() && this.power.armed) {
      const sp = this.power.consume();
      if (sp) {
        powerMult = sp.powerMult;
        this.kickWasSpecial = true;
        if (sp.gear) {
          this.specialKickGear = sp.gear;
          if (sp.gear.mods?.curl) aimDeg = Math.max(-60, Math.min(60, aimDeg * sp.gear.mods.curl));
          this.hud.call(`${sp.gear.name}!`, 'crowned');
        }
        this.bus.emit('cine:special', { label: sp.label, kicker: this.kicker });
      }
    }
    // crew on fire: every kick is juiced while the bar burns
    powerMult *= this.heat.kickPowerMult(this.match.kickingSide());
    // Flick shape: loft from the flick's length, distance band from its snap
    // (dev: "more control of where the ball goes"). AI/no-metrics kicks keep
    // the quality-table loft.
    const shape = flickShape(aimSpec.flick);
    // HR gate: a player kick leaves the park on a sweet-zone meter lock AND a lined-up
    // kicker — OR a consumed crown super-kick (kept as a bonus path). A deliberate
    // LOW flick is a liner by intent — it can scream, not clear the fence.
    this.kickHrEligible = isPlayerKick && (
      isHrEligible({ power01, alignErrM }, this.tuning) || this.kickWasSpecial
    ) && (!shape || shape.loftDeg >= FLICK.hrMinLoftDeg);
    // Not every perfect is a bomb (dev): ~45% become a SCREAMING gap shot —
    // aimed at the widest hole in the defense, dying at the track instead of
    // clearing it. Crown super-kicks always leave the yard (their identity).
    if (this.kickHrEligible && !this.kickWasSpecial && Math.random() < 0.45) {
      this.kickHrEligible = false;
      aimDeg = this.widestGapDeg();
      powerMult *= 0.93;
    }
    // payoff readout: kicked ON the DJ's beat (dj-drop pays in power)
    if (isPlayerKick && elMods.beatBonus01 > 0 && judged.quality !== 'FOUL') {
      this.hud.call('ON THE BEAT! +POWER', 'homer');
    }
    // el-train moment: clean contact THROUGH the rumble = juiced + heat
    if (this.elements.id === 'el-train' && this.elements.procActive && judged.quality === 'PERFECT') {
      powerMult *= 1.15;
      this.noteHeat(this.match.kickingSide(), 'rumbleKick');
      this.hud.call('THROUGH THE RUMBLE!', 'crowned');
    }
    // A meatball kicked by the CPU gets PUNISHED (Play Fair): the kick hunts the
    // widest fielder gap and carries a bump that can genuinely leave the yard.
    if (!isPlayerKick && this.pitch?.bad && judged.quality !== 'FOUL') {
      powerMult *= 1 + this.tuning.pitch.badKickPowerBonus;
      aimDeg = this.widestGapDeg();
      if (judged.quality === 'PERFECT' || (judged.quality === 'GOOD' && Math.random() < 0.35)) {
        this.kickHrEligible = true;
        this.hud.call('MEATBALL — CRUSHED!', 'pegged');
      }
    }
    const launch = launchParams(
      judged,
      { ...aimSpec, ...(aimDeg != null ? { aimDeg } : {}), powerMult, ...(power01 != null ? { power01 } : {}), ...(shape ? { shape } : {}) },
      this.tuning,
    );
    // city air: heat carries it, harbor humidity kills it (applies to flight AND
    // the landing prediction below, so fielders and foul calls stay consistent)
    launch.speed *= this.elements.carryScale();
    // LOCKER kick flavor: liners fly flatter/faster, moonshots ride higher
    const gm = this.specialKickGear?.mods;
    if (gm?.speed) launch.speed *= gm.speed;
    if (gm?.loftDeg) launch.loftDeg = Math.max(10, Math.min(60, launch.loftDeg + gm.loftDeg));
    // CROWN GUARANTEE (dev, 2026-08-05): an armed super-kick timed inside the
    // OK window ALWAYS leaves the yard — floor the arc at a fence-clearing
    // trajectory AFTER every other modifier (humidity included) has spoken.
    if (this.kickWasSpecial && Math.abs(errMs) <= this.tuning.kick.okWindowMs) {
      this.kickHrEligible = true;
      launch.loftDeg = Math.max(launch.loftDeg, 34);
      const clearSpeed = Math.sqrt(((this.fenceM + 10) * 9.8) / Math.sin((2 * launch.loftDeg * Math.PI) / 180));
      launch.speed = Math.max(launch.speed, clearSpeed);
    }
    this.judged = judged;
    this.launchSpec = launch;

    this.phase = 'KICK_ANIM';
    // THE KICK MUST READ (dev): "we only see the ball hit the player, never
    // the actual kick." The swing is no longer cosmetic — the slow-mo beat
    // starts NOW, the pitched ball glides the last stretch into the foot, and
    // the launch fires at the clip's CONTACT FRAME (the pitcher's release-
    // frame trick, applied to the boot). The judge already ran at tap time —
    // gameplay timing is untouched, only the presentation is re-synced.
    // LOCKER special kick: the equipped move's clip carries the swing when the
    // extras pack has it; contactDelayS re-syncs the launch to ITS contact frame
    const kickClip = (this.specialKickGear && this.kicker.animator.hasClip?.(this.specialKickGear.clip))
      ? this.specialKickGear.clip : 'kick';
    // the human taps AT the ball, so his clip runs hot to tighten tap→contact;
    // the AI's clip is already back-timed to arrival and plays at full weight
    const kickSpeed = isPlayerKick ? 1.3 : 1;
    const holdS = (this.kicker.animator.contactDelayS?.(kickClip) || 0.2) / kickSpeed;
    this._kickApproach = {
      t: 0,
      dur: holdS,
      from: this.ball.pos.clone(),
      to: new THREE.Vector3(this.ball.pos.x, 0.22, this.kicker.group.position.z - 0.5),
      // capped side-step INTO the ball (visual only — the judge already ran):
      // the body and the ball close the gap together instead of a magnet ball
      stepX: Math.max(-0.45, Math.min(0.45, this.ball.pos.x - this.kicker.group.position.x)),
    };
    this.bus.emit('sfx', 'swing'); // the leg cutting air, before the thump lands
    if (judged.quality === 'PERFECT' || this.kickHrEligible) {
      this.bus.emit('cine:perfect', { kicker: this.kicker, ball: this.ball, holdS });
    } else {
      this.bus.emit('cine:contact', { kicker: this.kicker, ball: this.ball, quality: judged.quality, holdS });
    }
    let launched = false;
    const launchNow = () => {
      if (launched) return;
      launched = true;
      this._kickApproach = null;
      this.onKickContact(judged, launch);
    };
    // a crown special swing plays THROUGH its landing (the flip's second half
    // was getting stomped by 'run' at the contact frame — dev, 2026-08-05);
    // the clip's own onDone hands off to the run cycle
    this._gearSwing = this.specialKickGear ? kickClip : null;
    this.kicker.animator.play(kickClip, {
      onContact: launchNow,
      speed: kickSpeed,
      onDone: () => {
        this._gearSwing = null;
        if (this.kicker?.animator?.name === kickClip && this.kicker.group.visible
          && (this.phase === 'LIVE' || this.phase === 'KICK_ANIM')) {
          this.kicker.animator.play('run');
        }
      },
    });
    // safety: a clip without a contact mark must never stall the play — measured
    // in REAL seconds (the kick beat runs slow-mo; timers don't)
    this.after(safetyLaunchDelayS(holdS, this.engine.timeScale), launchNow);
  }

  /** The kicker laid off a sloppy pitch — a BALL. Four of them walk him. */
  resolveBallTaken() {
    if (this.playFinalized || this.phase !== 'PITCH') return;
    douseBall(this.ball);
    this.bus.emit('sfx', 'whiff');
    const res = this.match.noteBall();
    const n = this.match.state.balls;
    if (res === 'walk') return this.playWalk();
    this.hud.call(`BALL ${['', 'ONE', 'TWO', 'THREE'][n] ?? n}!`, 'robbed');
    this.hud.setCount(n);
    this.bus.emit('vo', 'ball');
    const resume = () => {
      this.phase = 'SETUP';
      this.hud.clearStamps(); // the foul call must not hang over the fresh pitch
      this.kicker.animator.play('plate');
      this.serve();
    };
    // a steal was in flight and the pitch is dead → the defense throws down
    if (this.stealing?.state === 'running') this.after(0.3, () => this.resolveStealThrowdown(resume));
    else this.after(1.0, resume);
  }

  /** Ball four: free pass. The ENGINE already moved everyone (applyWalk). */
  playWalk() {
    this.hud.call(this.kicker?.gender === 'she' ? 'WALKED HER!' : 'WALKED HIM!', 'robbed');
    this.hud.setCount(0);
    this.bus.emit('vo', { event: 'walk', gender: this.kicker?.gender });
    this.bus.emit('sfx', 'crowd-cheer');
    const k = this.kicker;
    if (k) {
      k.animator.play('run');
      const to = this.basePos(0);
      this.faceTo(k, to, true);
      this._walkJog = { char: k, to };
      this.after(1.4, () => { this._walkJog = null; });
    }
    this.after(1.6, () => this.nextAtBat());
  }

  /** Widest angular gap between fielders (deg, + = right) seen from the plate. */
  widestGapDeg() {
    const spread = this.tuning.kick.aimSpreadDeg * 0.8;
    const angles = this.fieldingChars()
      .filter((c) => c.group.visible && Math.hypot(c.group.position.x, c.group.position.z) > 6)
      .map((c) => THREE.MathUtils.radToDeg(Math.atan2(c.group.position.x, -c.group.position.z)))
      .filter((a) => Math.abs(a) < spread + 10)
      .sort((a, b) => a - b);
    let best = { mid: 0, size: -1 };
    let prev = -spread;
    for (const a of [...angles, spread]) {
      const size = a - prev;
      if (size > best.size) best = { mid: prev + size / 2, size };
      prev = a;
    }
    return best.mid;
  }

  strike(label) {
    douseBall(this.ball); // pitch dead — clear the fire look
    this.strikes += 1;
    this.bus.emit('sfx', 'whiff');
    this.hud.call(this.strikes >= 3 ? 'STRUCK OUT!' : label, 'pegged');
    if (this.strikes >= 3) {
      this.cancelSteal(); // at-bat's over anyway; restoreRunners puts him back
      this.bus.emit('sfx', 'out');
      this.bus.emit('vo', { event: 'strike', gender: this.kicker?.gender });
      if (this.kickingIsPlayer()) this.bus.emit('sfx', 'crowd-ooh'); // struck out — groan
      this.after(0.8, () => this.finalizePlay(1, 'strikeout', { restoreRunners: true }));
    } else {
      const resume = () => {
        this.phase = 'SETUP';
        this.kicker.animator.play('plate');
        this.serve();
      };
      // a steal was in flight and the pitch is dead → the defense throws down
      if (this.stealing?.state === 'running') this.after(0.3, () => this.resolveStealThrowdown(resume));
      else this.after(1.0, resume);
    }
  }

  onKickContact(judged, launch) {
    if (judged.quality === 'FOUL') {
      // weak mistimed contact dribbles foul (the contact beat began at tap)
      this.ball.launch(launch.speed * 0.5, 70, (Math.random() - 0.5) * 90);
      this.bus.emit('sfx', 'kick');
      this.phase = 'FOUL';
      this.ballCamUntil = this.elapsed + 1.0;
      this.after(0.9, () => this.foulBall('FOUL!'));
      return;
    }

    this.ball.launch(launch.speed, launch.loftDeg, launch.directionDeg);
    if (this.heat.onFire(this.match.kickingSide())) igniteBall(this.ball); // burning crew = burning ball
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

    // The impact cam + fire fire on PERFECT *or* any HR-eligible bomb: the HR
    // gate (raw meter + alignment checked separately, plus crown super-kicks)
    // is met by kicks the quality judge calls GOOD (alignment folds into its
    // error) — the dev homered with no cinematic and no fire on the ball.
    // The special-meter PERFECT reward stays PERFECT-only (meter economy).
    // (the impact/contact beat began at tap so the full swing reads in slow-mo)
    if (judged.quality === 'PERFECT') {
      if (this.kickingIsPlayer()) { this.crownFeed('PERFECT'); this.matchStats.perfects += 1; }
      this.noteHeat(this.match.kickingSide(), 'PERFECT');
    }

    this.landDist = Math.hypot(lp.x, lp.z);
    this.isFly = this.pred.apex > 2.8; // only genuine pop-ups/arcs are catch-outs; low liners play on
    this.phase = 'LIVE';
    this.liveStart = this.elapsed;
    this.hrFired = false;
    this.grdFired = false;
    this.diveUsed = false;   // one dive call per play
    this.aiCallRolled = false;
    this.ballCamUntil = this.elapsed + 1.3; // trail the ball before cutting to the infield
    this.camTarget = CAM.live;
    // broadcast CUT: 0.4s low hero cam at the moment of contact, then the
    // telephoto tracker takes over via the live-shot selection
    this.camDir.request('contact', this.camCtx(), { cut: true });
    this.after(0.4, () => {
      if (this.phase === 'LIVE') this.camDir.request('ballFlight', this.camCtx());
    });

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
    this.bus.emit('sfx', 'foul');
    this.bus.emit('vo', 'foul');
    if (this.fouls >= 4) {
      this.cancelSteal();
      if (this.lastStealCommit) {
        // the 4th foul is still a DEAD ball — a committed bag (or a stolen-home
        // run) comes back before the books close the at-bat
        const { idx, char, from, to } = this.lastStealCommit;
        this.lastStealCommit = null;
        const { bases, runsDelta } = revertStealBooks(this.match.state.bases, { idx, from, to });
        this.match.applyBaseEvent({ bases, runs: runsDelta }); // 'play' event re-snapshots originalBases
        char.group.visible = true;
        if (to >= 0 && to <= 2) this.baseChars[to] = null;
        this.baseChars[from] = char;
        char.group.position.copy(this.basePos(from));
        char.animator.play('idle');
        this.refreshHud();
      }
      this.hud.call('4 FOULS — OUT!', 'pegged');
      this.after(0.8, () => this.finalizePlay(1, 'foulout', { restoreRunners: true }));
      return;
    }
    const willScramble = this.stealing?.state === 'running' || !!this.lastStealCommit;
    if (!willScramble) this.hud.call(`${label}  ${this.fouls}/4`, 'pegged');
    const resume = () => {
      this.phase = 'SETUP';
      this.hud.clearStamps(); // the foul call must not hang over the fresh pitch
      this.kicker.animator.play('plate');
      this.serve();
    };
    // FOUL KILLS THE STEAL (dev rule, 2026-08-03): a dead ball never gifts a
    // bag. The runner reverses and must beat the throw BACK to his own base —
    // retreatRunner flips him first, so resolveStealThrowdown's race (bag,
    // timing, throw-pad highlight) targets the ORIGINAL bag automatically.
    const scrambleBack = (r) => {
      r.scramble = true;
      r.sim.human = false; // he hustles back on his own; mashing still helps
      this.hud.call(`FOUL ${this.fouls}/4 — GET BACK!`, 'pegged');
      this.hud.hint(this.kickingIsPlayer() ? 'MASH — GET BACK!' : '');
      this.bus.emit('sfx', 'juke');
      this.after(0.35, () => this.resolveStealThrowdown(resume));
    };
    if (this.stealing?.state === 'running') {
      const r = this.stealing;
      this.retreatRunner(r);
      r.officialBase = r.targetBase; // still registered at his original bag
      scrambleBack(r);
    } else if (this.lastStealCommit) {
      // he beat the foul to the bag — doesn't matter, the ball is dead: off
      // the bag and back the way he came, taggable the whole way
      const { idx, char, from, to } = this.lastStealCommit;
      this.lastStealCommit = null;
      char.group.visible = true; // a stolen-home dance may have hidden him
      if (to >= 3) {
        // he stole HOME on a dead ball — the run comes off the board NOW,
        // and he has to win the scramble back to 3rd to stay in the game
        this.match.applyBaseEvent({ runs: -1 });
        this.refreshHud();
      }
      const r = this.makeRunner(idx, char, to);
      r.stealing = true;
      r.forced = false;
      r.targetBase = from;
      // the books moved him when the steal committed; a scored run is already
      // reverted, so there's no bag to clear on a tag (-1 = off the books)
      r.officialBase = to <= 2 ? to : -1;
      r.sim.human = false;
      r.sim.progressM = 0;
      this.stealing = r;
      this.runners.push(r);
      scrambleBack(r);
    } else {
      // dead-ball breath (dev: "the pitch has already been released and you
      // have no time") — the next wind-up waits until the player can re-grip
      this.after(2.0, resume);
    }
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

    // everyone on base takes off, baseball style — a runner already STEALING
    // when the kick lands just keeps going (his progress is real)
    const stealer = this.stealing?.state === 'running' ? this.stealing : null;
    this.match.state.bases.forEach((occ, baseIdx) => {
      if (occ === null) return;
      if (stealer && stealer.idx === occ) {
        // the kick re-computes his force status: a stealer from 1st with the
        // kicker coming behind him CAN'T retreat — without this flag a beaten
        // throw to 2nd wasn't an out and the rundown retreated him INTO the
        // kicker's bag (two runners converging on one base = the steal chaos)
        stealer.forced = forced[baseIdx];
        this.runners.push(stealer);
        return;
      }
      const char = off[occ % off.length];
      char.group.visible = true;
      const r = this.makeRunner(occ, char, baseIdx);
      r.forced = forced[baseIdx];
      r.sim.progressM = LEAD_M; // the pre-pitch lead is a real head start
      this.runners.push(r);
    });
    this.stealing = null; // merged into the live play
    // and the kicker breaks for first (always forced)
    const kr = this.makeRunner(this.match.currentKickerIdx(), this.kicker, -1);
    kr.forced = true;
    this.runners.push(kr);
  }

  /** Every RunnerSim in the scene goes through here so the LOCKER cleat
   *  speedMult (player runners only) can never be dropped by a mid-run
   *  rebuild (tag-up scramble, GO FOR 2, rundown retreat, …). Pass overrides
   *  to force a specific option (e.g. `{ human: false }` for an auto-scramble)
   *  — they're spread last, so they win over the defaults but speedMult still
   *  comes from cleatSpeedMult unless explicitly overridden too. */
  newRunnerSim(overrides = {}) {
    return new RunnerSim({
      tuning: this.tuning,
      human: this.kickingIsPlayer(),
      speedMult: this.kickingIsPlayer() ? this.cleatSpeedMult : 1,
      ...overrides,
    });
  }

  makeRunner(idx, char, fromBase) {
    // don't stomp a mid-flight crown swing — its onDone starts the run itself
    if (char.animator.name !== this._gearSwing || !this._gearSwing) char.animator.play('run', { speedFactor: 1 });
    const r = {
      idx,
      char,
      fromBase, // -1 = home plate
      originBase: fromBase, // the time-of-pitch bag — where a TAG UP must return
      targetBase: fromBase + 1,
      sim: this.newRunnerSim(),
      trail: this.kickingIsPlayer() ? (this.trailPool.find((t) => !t.busy) ?? null) : null,
      state: 'running',
      decideT: 0,
      forced: false,
      aiRate: aiMashRate(this.difficulty),
    };
    if (r.trail) r.trail.busy = true;
    return r;
  }

  /** Hand a runner's trail slot back to the pool. Call this at every site that
   *  drops a runner from `this.runners` OUTSIDE nextAtBat (which already does
   *  a wholesale pool reset) — a steal resolving safe/cancelled/caught, or a
   *  watchdog force-settle — so a busy-forever slot can't starve later runners
   *  in the same at-bat. */
  releaseTrail(r) {
    if (r?.trail) { r.trail.hide(); r.trail.busy = false; r.trail = null; }
  }

  /** A runner crosses the plate: state + the score sting (silent = the homer
   *  already blasted its own horn). Stamps scoredAt for the live diamond. */
  scoreRun(r, { silent = false } = {}) {
    if (r.state === 'scored') return;
    r.state = 'scored';
    r.scoredAt = this.elapsed;
    if (silent) return;
    this.bus.emit('sfx', 'score');
    if (!this.kickingIsPlayer()) this.bus.emit('sfx', 'boo'); // they scored on YOU
  }

  leadRunner() {
    let lead = null;
    for (const r of this.runners) {
      if (r.state !== 'running') continue;
      if (!lead || r.targetBase > lead.targetBase) lead = r;
    }
    return lead;
  }

  // ---------- lead & steal ----------
  /** Send the runner on `baseIdx` stealing the next bag (pre-kick). */
  startSteal(baseIdx) {
    // one steal per pitch: a second launch after a commit would leave the foul
    // rule with two runners to un-wind and only one race to run it with.
    // Also barred during the walk-up — nobody is out there to throw the ball.
    if (!stealAllowed(this)) return;
    const occ = this.match.state.bases[baseIdx];
    const char = this.baseChars?.[baseIdx];
    if (occ === null || !char) return;
    if (baseIdx < 2 && this.match.state.bases[baseIdx + 1] !== null) return; // next bag occupied
    const r = this.makeRunner(occ, char, baseIdx);
    r.forced = false;
    r.stealing = true;
    // jump quality: called during the wind-up = HOT jump; after the ball's away = standard
    // hot jump: wind-up timing, OR the element says so (sirens up / gassed legs)
    const hot = this.stealHot || this.elementStealWindow();
    const hotMult = hot ? 1.6 : 1;
    r.sim.progressM = LEAD_M * hotMult + this.elements.stealHeadStartM(); // + night hustle
    if (hot && this.kickingIsPlayer()) this.hud.call('HOT JUMP! MONSTER LEAD', 'crowned');
    this.stealing = r;
    this.runners.push(r);
    char.animator.play('run');
    this.bus.emit('sfx', 'juke');
    if (this.kickingIsPlayer()) this.hud.hint('STEALING ' + ['2ND', '3RD', 'HOME'][baseIdx] + '!');
    else this.hud.call('RUNNER GOING!', 'pegged');
  }

  /** Pre-kick steal movement (during the pitch, before the ball is live). */
  updateStealRunner(dt) {
    const r = this.stealing;
    if (!r || r.state !== 'running') return;
    const rate = this.kickingIsPlayer()
      ? Math.max(1.6, this.input.tapRate(500, performance.now())) // a lazy steal is a DEAD steal — mash it
      : r.aiRate;
    r.sim.tick(dt, rate * (this.kickingIsPlayer() ? this.cleatStealMult : 1));
    if (r.sim.arrived && this.stealResolving) {
      r.sim.progressM = this.tuning.running.basePathM; // hold AT the bag while the throw races in
    }
    const { p, dir } = this.runnerWorldPos(r);
    r.char.group.position.set(p.x, 0, p.z);
    r.char.faceYaw = Math.atan2(dir.x, dir.z);
    r.char.animator.ctx.speedFactor = 1;
    if (r.sim.arrived && !this.stealResolving) this.commitStealArrival(r);
  }

  /** Stealer reached the bag before the pitch resolved — he's in clean. */
  commitStealArrival(r) {
    const to = r.targetBase;
    const bases = [...this.match.state.bases];
    // a scramble back from a HOME steal has fromBase = 3 — never index past
    // the 3 bags (a bases[3] write corrupts the engine's base contract)
    if (r.fromBase >= 0 && r.fromBase <= 2) {
      bases[r.fromBase] = null;
      this.baseChars[r.fromBase] = null;
    }
    if (to >= 3) {
      this.match.applyBaseEvent({ bases, runs: 1 });
      if (this.kickingIsPlayer()) { this.matchStats.steals += 1; this.crownFeed('steal'); } // stealing HOME counts too
      this.hud.call('STOLE HOME!', 'crowned');
      this.bus.emit('sfx', 'crowd-cheer');
      this.faceCam(r.char);
      r.char.animator.play(pickDance(r.char));
      this.after(1.4, () => { r.char.group.visible = false; });
      // a foul during THIS pitch un-commits even a stolen home (dead ball, street
      // rules): the run comes back and he scrambles for 3rd like any other bag
      this.lastStealCommit = { idx: r.idx, char: r.char, from: r.fromBase, to };
    } else {
      bases[to] = r.idx;
      this.match.applyBaseEvent({ bases });
      if (r.scramble) {
        this.hud.call('SAFE — BACK IN!', 'robbed');
      } else {
        if (this.kickingIsPlayer()) { this.matchStats.steals += 1; this.crownFeed('steal'); }
        this.hud.call('STOLE ' + ['2ND', '3RD'][to - 1] + '!', 'crowned');
        // a foul during THIS pitch un-commits the steal (dead ball, street
        // rules): remember it so foulBall can send him scrambling back
        this.lastStealCommit = { idx: r.idx, char: r.char, from: r.fromBase, to };
      }
      const bag = this.basePos(to);
      const dir = this.basePos(Math.min(to + 1, 3)).clone().sub(bag).normalize();
      r.char.group.position.copy(bag).addScaledVector(dir, LEAD_M); // settle into the next lead
      r.char.animator.play('idle');
      this.baseChars[to] = r.char;
    }
    r.state = 'done';
    this.runners = this.runners.filter((q) => q !== r);
    this.releaseTrail(r);
    this.stealing = null;
    this.watchdog.clear(r.idx);
    this.refreshHud();
  }

  cancelSteal() {
    const r = this.stealing;
    if (!r) return;
    this.runners = this.runners.filter((q) => q !== r);
    this.releaseTrail(r);
    this.stealing = null;
    this.watchdog.clear(r.idx);
  }

  /**
   * The pitch came back dead (strike/foul) with a steal in flight: the defense
   * throws down to the bag and the race resolves. Player defense gets a quick
   * throw window; AI defense reacts on a difficulty timer.
   */
  resolveStealThrowdown(done) {
    const r = this.stealing;
    if (!r || r.state !== 'running') { this.cancelSteal(); return done(); }
    this.stealResolving = true;
    const bag = this.basePos(r.targetBase);
    const catcher = this.fieldingChars().find((c) => c.spot?.id === 'C') ?? this.fieldingChars()[0];
    const finish = (out) => {
      this.stealResolving = false;
      this.hud.showThrowPad(false);
      this.stealDefense = null;
      this.watchdog.clear(r.idx);
      if (out) {
        // clear the bag the BOOKS have him on — his origin bag normally, but a
        // scramble-back can start from an already-committed steal (officialBase;
        // -1 = a reverted stolen-home run, no bag on the books to clear)
        const bookBase = r.officialBase ?? r.fromBase;
        const bases = [...this.match.state.bases];
        if (bookBase >= 0 && bookBase <= 2) {
          bases[bookBase] = null;
          this.baseChars[bookBase] = null;
        }
        r.state = 'done';
        this.runners = this.runners.filter((q) => q !== r);
        this.releaseTrail(r);
        this.stealing = null;
        this.outStumble(r.char);
        this.hud.call(r.scramble ? 'DEAD BALL — TAGGED OUT!' : 'CAUGHT STEALING!', 'pegged');
        this.bus.emit('sfx', 'catchpop');
        this.bus.emit('vo', { event: 'forced', gender: r.char?.gender });
        this.match.applyBaseEvent({ outsAdded: 1, bases });
        this.refreshHud();
        this.after(1.0, () => { r.char.group.visible = false; });
        // that out may have ended the half (engine resets outs/bases on endHalf)
        // — or the GAME: nextAtBat early-returns on GAME_END, so routing it
        // there stalled the match with no box score (latent P0, fixed 2026-08-03)
        if (this.match.state.phase === 'GAME_END') {
          this.fireMatchOver();
          return;
        }
        if (this.match.state.outs === 0 && this.match.state.bases.every((b) => b === null)) {
          this.halfJustEnded = true;
          this.after(1.4, () => this.nextAtBat());
          return;
        }
      } else if (r.state === 'running') {
        this.commitStealArrival(r); // beat the throw — safe
      }
      this.after(0.8, done);
    };
    const throwDown = (reactionS) => {
      const flightT = catcher.group.position.distanceTo(bag) / 24; // catchers GUN it
      this.after(Math.max(0.05, reactionS), () => {
        this.faceTo(catcher, bag);
        catcher.animator.play('throw', {
          onContact: () => this.ball.throwTo(bag.clone().setY(0.4), 24),
          onDone: () => catcher.animator.play('idle'),
        });
      });
      // verdict at BALL ARRIVAL from where the runner ACTUALLY is — a man
      // standing on his bag can never be "tagged out" by a timing formula
      // (tie goes to the runner: on the bag when the throw lands = safe)
      this.after(reactionS + flightT, () => {
        const out = !r.sim.arrived;
        this.after(0.15, () => finish(out));
      });
    };
    if (!this.kickingIsPlayer()) {
      // YOU'RE the defense: quick draw — tap the bag on the throw pad
      this.hud.hint(r.char?.gender === 'she' ? 'RUNNER GOING! OUT-DRAW HER!' : 'RUNNER GOING! OUT-DRAW HIM!');
      this.hud.showThrowPad(true);
      this.hud.highlightBestBase(r.targetBase);
      this.stealDefense = { t0: this.elapsed, throwDown };
      this.after(1.1, () => {
        if (this.stealDefense) { this.stealDefense = null; finish(false); } // froze — he's in
      });
    } else {
      // AI defense reacts on its difficulty clock
      const react = this.tuning.ai[this.difficulty].fieldReactMs / 1000 * 0.5 + 0.05 + Math.random() * 0.12;
      throwDown(react);
    }
  }

  /** On-screen banners of what each base-runner is doing (so you know where to throw). */
  updateRunnerAlerts() {
    // never on the duel stage (one button, no noise)
    if (this.duel) { this.hud.setRunnerAlerts([]); return; }
    // dead-ball scramble happens in phase FOUL — it's the one alert that matters
    if (this.stealing?.scramble && this.stealing.state === 'running') {
      this.hud.setRunnerAlerts([{ text: 'SCRAMBLING BACK!', urgent: true }]);
      return;
    }
    // otherwise only during the live play
    if (this.phase !== 'LIVE') { this.hud.setRunnerAlerts([]); return; }
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

  // ---------- GO FOR 2: the extra-base send prompt ----------
  /** The lead held runner whose next bag is open and whose send-window is live. */
  goCandidate() {
    // NOTE: a throw in flight does NOT hide the offer — taking a bag on the
    // throw to another base is the classic gamble this button exists for
    if (!this.kickingIsPlayer() || this.playFinalized || this.cinematicLock) return null;
    let best = null;
    for (const r of this.runners) {
      if (r.state !== 'held' || r.heldAt >= 3 || r.decideT <= 0) continue;
      const nextTaken = this.runners.some(o => o !== r &&
        ((o.state === 'held' && o.heldAt === r.heldAt + 1) ||
         (o.state === 'running' && o.targetBase === r.heldAt + 1)));
      if (nextTaken) continue;
      if (!best || r.heldAt > best.heldAt) best = r;
    }
    return best;
  }

  /** Seconds the runner would beat the ball to the next bag (+ = makes it).
   *  Deliberately GENEROUS: the AI needs real time to decide + transfer + wind
   *  up (~1s, matching aiThrowDelayS + the throw clip), the bag actually has
   *  to be covered, and a bad send becomes the pickle mini-game now instead of
   *  an auto-out — marginal GOs are content, not suicide. */
  goMargin(r) {
    const bag = this.basePos(r.heldAt + 1);
    const runnerT = this.tuning.running.basePathM / (this.tuning.running.maxSpeedMs * 0.88);
    const BALL_MS = 22; // matches the base-throw flight speed class
    const WINDUP = 1.0; // AI decision + ball transfer + throw clip before release
    const holder = this.fieldingChars().find((c) => c.hasBall);
    let defT;
    if (holder) {
      defT = WINDUP + holder.group.position.distanceTo(bag) / BALL_MS;
    } else {
      // ball loose: nearest fielder must reach it, secure it, then throw
      const bp = this.ball.pos;
      let near = Infinity;
      for (const c of this.fieldingChars()) near = Math.min(near, c.group.position.distanceTo(bp));
      defT = near / 6.0 + WINDUP * 0.5 + bp.distanceTo(bag) / BALL_MS;
    }
    // an uncovered bag can't take a throw — charge the cover man's travel time
    let coverD = Infinity;
    for (const c of this.fieldingChars()) {
      if (c === holder) continue;
      coverD = Math.min(coverD, c.group.position.distanceTo(bag));
    }
    if (coverD > 3) defT += (coverD - 3) / 6.0;
    return defT - runnerT;
  }

  /** Element-driven steal windows (Play It): sirens live, or gassed legs late. */
  elementStealWindow() {
    if (this.elements.id === 'motorcade') return this.elements.procActive;
    if (this.elements.id === 'heat-wave') return this.match.state.inning >= 3;
    return false;
  }

  /** Show/hide the GO button for the lead held runner (called every frame). */
  updateGoOffer() {
    const r = this.goCandidate();
    let margin = r ? this.goMargin(r) : -Infinity;
    // steam stretch (Play It): the fielder's screened — the stretch is THERE
    if (r && this.elements.id === 'steam-vents'
        && this.elements.inSteam(this.ball.pos.x, this.ball.pos.z)) {
      margin += 0.5;
      this.hud.callout('STRETCH IT!', { x: window.innerWidth / 2, y: window.innerHeight * 0.4, ttl: 900, key: 'stretch' });
    }
    // tutorialGo: the extra-bases drill always offers the button (the lesson)
    if (margin > -0.9 || (this.tutorialGo && r)) {
      // risky = a genuine race — taking it invites the throw-down / rundown
      this.goOffer = { r, risky: margin < 0.25 };
      this.hud.showGo(['GO FOR 2!', 'GO FOR 3!', 'GO HOME!'][r.heldAt], this.goOffer.risky);
    } else if (this.goOffer) {
      this.goOffer = null;
      this.hud.hideGo();
    }
  }

  /** GO button tapped — send the offered runner for the next bag (mash to run!). */
  sendHeldRunner() {
    const r = this.goOffer?.r;
    if (!r || r.state !== 'held' || this.playFinalized) return;
    this.goOffer = null;
    this.hud.hideGo();
    r.fromBase = r.heldAt;
    r.targetBase = r.heldAt + 1;
    r.forced = false;
    r.sim = this.newRunnerSim({ human: true }); // GO button = always a deliberate human send
    r.state = 'running';
    r.char.animator.play('run');
    this.bus.emit('sfx', 'juke');
    this.hud.call(['GOING FOR 2!', 'GOING FOR 3!', 'GOING HOME!'][r.fromBase], 'crowned');
  }

  updateRunners(dt) {
    const isPlayerOffense = this.kickingIsPlayer();
    // short window so the runner responds quickly to starting/stopping taps
    const rate = isPlayerOffense
      ? this.input.tapRate(500, performance.now())
      : 0;

    // A runner who crosses paths with a fielder HOLDING the ball is tagged out —
    // no throw/peg needed; running into the ball-carrier in the basepath is an out.
    const holder = this.fieldingChars().find((c) => c.hasBall);
    if (holder && !this.throwing) {
      const TAG2 = 1.35 * 1.35;
      for (const r of this.runners) {
        if (r.state !== 'running') continue;
        const dx = r.char.group.position.x - holder.group.position.x;
        const dz = r.char.group.position.z - holder.group.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= TAG2) continue;
        const duelHere = this.duel?.r === r ? this.duel : null;
        if (duelHere) {
          if (duelHere.tagCd > 0) continue; // tagger is still stumbling
          if (duelHere.brain.tagAttempt() === 'dodged') {
            // SPIN MOVE — the lunge whiffs, tagger stumbles, you get separation.
            // Quick recovery ritual (NOT a bare play): a held Defeated pose on a
            // chaser who keeps getting dragged across the court read as "half
            // his body in the ground" (dev). He falls, he gets up, he resumes.
            duelHere.tagCd = 0.9;
            holder.recovering = true;
            holder.animator.play('stumble', {
              speed: 1.5,
              onDone: () => {
                holder.recovering = false;
                if (holder.animator.name === 'stumble') holder.animator.play('run');
              },
            });
            this.bus.emit('sfx', 'dodge');
            this.hud.call('SPIN MOVE!', 'crowned');
            continue;
          }
          if (r.char.animator.name === 'slide' && d2 > 0.55) continue; // sliding low under the tag
        }
        this.runnerOut(r, 'tag');
      }
    }

    for (const r of this.runners) {
      if (r.state === 'running') {
        // THE DUEL owns its runner's speed (auto-shuttle / committed burst) —
        // taps neither steer nor pump in a pickle, on either side.
        const inDuel = this.duel?.r === r;
        // the whirl — only when the real soccerSpin clip isn't carrying the move
        if (inDuel && this.duel.brain.spinT > 0 && !this.duel.spinAnim) r.char.group.rotation.y += dt * 16;
        const useRate = inDuel ? this.duel.brain.runRate() : (isPlayerOffense ? rate : r.aiRate);
        // A human who stops tapping can hover between bags while the ball is loose
        // (that's strategic). But once the defense SECURES the ball, a stalled
        // runner must commit to a bag — otherwise the play can never end.
        if (isPlayerOffense && (this.defenseHasBall || this.ball.mode === 'idle') && !this.throwing && useRate < 0.5) {
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
        r.trailDir = dir; // remembered facing — the trail keeps fading toward it after he stops
        // 0.6: a real sprint on the phone — 0.8 was never reached in play
        r.trail?.update(p, dir, r.sim.speedMs > this.tuning.running.maxSpeedMs * 0.6, this.elapsed);
        r.char.faceYaw = Math.atan2(dir.x, dir.z); // run facing forward, never moonwalk
        r.char.animator.ctx.speedFactor = 0.7 + (mashSpeed(useRate, this.tuning) / this.tuning.running.maxSpeedMs) * 0.6;

        if (r.sim.arrived) {
          if (r.targetBase === 3) {
            // HOME — that's a run
            this.scoreRun(r);
            this.pendingRuns = (this.pendingRuns ?? 0) + 1;
            this.field.crowdEnergy = 1;
            this.bus.emit('sfx', 'crowd-cheer');
            this.hud.call('SAFE AT HOME!', 'crowned');
            this.faceCam(r.char);
            r.char.animator.play(pickDance(r.char));
            this.after(1.4, () => { if (r.state === 'scored') r.char.group.visible = false; });
          } else {
            r.state = 'held';
            r.heldAt = r.targetBase;
            r.decideT = 1.4; // window in which the GO button can send him to the next bag
            if (r.tagUp && r.heldAt !== r.originBase && r.heldAt > r.originBase) {
              // still not back to his time-of-pitch bag — keep scrambling
              r.fromBase = r.heldAt;
              r.targetBase = r.heldAt - 1;
              r.sim = this.newRunnerSim({ human: false }); // still scrambling — auto-runs, not tap-driven
              r.state = 'running';
              r.char.animator.play('run');
            } else if (r.tagUp) {
              r.tagUp = false; // safe — retouched his bag
              this.hud.call('SAFE — TAGGED UP!', 'robbed');
            }
            r.char.group.position.copy(this.basePos(r.heldAt)).add(new THREE.Vector3(0.4, 0, 0.4));
            this.faceTo(r.char, this.basePos(Math.min(r.heldAt + 1, 3))); // poised to take the next bag
            r.char.animator.play('idle');
          }
        }
      } else if (r.state === 'held' && r.heldAt < 3) {
        r.decideT -= dt;
        // keep the send-window open while the ball is loose (both sides — the
        // AI must ALSO be able to keep taking bases on a kicked-away ball)
        if (!this.ballControlled) r.decideT = this.kickingIsPlayer() ? 1.4 : Math.max(r.decideT, 0.9);
        // a teammate running into my bag forces me off it — vacate or we stack
        const mustVacate = this.runners.some(o =>
          o !== r && o.state === 'running' && o.targetBase === r.heldAt);
        // HUMAN: a held runner ONLY takes the next bag through the GO FOR 2 button
        // (sendHeldRunner) or when forced off — no accidental mash-through into a tag.
        // AI offense: risk-based — take the next bag whenever the defense clearly
        // can't deliver the ball there in time (dev: "they have to be willing to
        // take more bases" on deep/missed kicks). The old gate (aiRate > 4.2)
        // could NEVER fire: aiMashRate tops out at 4.0 on King.
        const aggressive = this.kickingIsPlayer() ? false : this.aiWantsExtraBase(r);
        const wantsGo = mustVacate || (r.decideT > 0 && aggressive);
        if (wantsGo) {
          // take the next base!
          r.fromBase = r.heldAt;
          r.targetBase = r.heldAt + 1;
          r.forced = mustVacate;
          r.sim = this.newRunnerSim();
          r.state = 'running';
          r.char.animator.play('run');
        }
      }
      // a stopped runner (held/scored) still needs his trail AGED every frame —
      // it's the fade that reads as "he sprinted, now he's stopped", not a
      // freeze-framed ribbon nailed to the bag until the pool wipes it
      if (r.trail && r.state !== 'running') {
        r.trail.update(r.char.group.position, r.trailDir ?? TRAIL_FALLBACK_DIR, false, this.elapsed);
      }
    }

    // live diamond indicator: held runners light the bags
    const liveBases = [null, null, null];
    for (const r of this.runners) {
      if (r.state === 'held' && r.heldAt < 3) liveBases[r.heldAt] = r.idx;
    }
    this.hud.setBases(liveBases);

    // GO FOR 2: offer the extra base on the lead held runner while it's live
    this.updateGoOffer();

    // play is over when nobody is running and the defense controls the ball —
    // record however many outs accrued (force/peg) once everyone has settled.
    // Don't finalize while the GO FOR 2 offer is up on a held runner — the
    // player gets that decision beat before the play locks in.
    const someoneAdvancing = this.runners.some(r =>
      r.state === 'running' ||
      (r.state === 'held' && r.heldAt < 3 && r.decideT > 0 && this.goOffer?.r === r));
    this.updateRunnerAlerts(); // keep the "runner heading home / stealing 3rd" banners live
    if (!this.playFinalized && this.ballControlled && !someoneAdvancing) {
      this.finalizePlay(this.playOuts ?? 0, this.lastOutReason);
    }

    // LAST-RESORT play watchdog: whatever state-hole we haven't met yet, a
    // settled field must ALWAYS close the play (dev froze mid-play with two
    // runners parked on a bag, 2026-08-05). Runners settled + defense owns the
    // ball (or it's dead on the turf) + no cinematic = the play ends, period.
    const everyoneSettled = !this.runners.some((r) => r.state === 'running');
    if (!this.playFinalized && !this.cinematicLock && everyoneSettled
      && (this.defenseHasBall || this.ball.mode === 'idle')) {
      this._settledT = (this._settledT ?? 0) + dt;
      if (this._settledT > 8) this.ballControlled = true;
      if (this._settledT > 12) {
        console.warn('[skk] play watchdog: force-finalizing a stuck play');
        this.finalizePlay(this.playOuts ?? 0, this.lastOutReason);
      }
    } else {
      this._settledT = 0;
    }
  }

  /** Resolve the play into exact outcome for the engine. */
  finalizePlay(outsAdded, label, { restoreRunners = false } = {}) {
    if (this.playFinalized) return;
    this.playFinalized = true;
    this.phase = 'RESOLVE';
    this.hud.setRunnerAlerts([]); // play's over — clear the runner banners
    this.goOffer = null;
    this.hud.hideGo();
    if (this.duel) { this.duel = null; this.hud.hideDuel(); this.hud.setLetterbox(false); }
    this.releasePickleFreeze();
    this.restoreSpeed();

    // nobody jogs in place once the play is dead — settle every defender
    // (updateDefense stops outside LIVE, so a looping run clip would stick)
    for (const c of this.fieldingChars()) {
      const n = c.animator.name;
      if (!c.hasBall && (n === 'run' || n === 'strafeL' || n === 'strafeR')) c.animator.play('idle');
    }

    // multi-out play — call it out big
    if (outsAdded >= 2) {
      const triple = outsAdded >= 3;
      this.hud.clearStamps();
      this.hud.call(triple ? 'TRIPLE PLAY!' : 'DOUBLE PLAY!', 'crowned');
      this.bus.emit('vo', triple ? 'tripleplay' : 'doubleplay');
      this.bus.emit('sfx', 'crowd-cheer');
      this.noteHeat(this.match.fieldingSide(), 'doubleplay');
    }

    const finalBases = [null, null, null];
    let runs = 0;
    if (restoreRunners) {
      // e.g. caught fly / strikeout: runners go back where they started
      this.originalBases?.forEach((occ, i) => { finalBases[i] = occ; });
    } else {
      for (const r of this.runners) {
        if (r.state === 'scored') runs += 1;
        else if (r.state === 'held' && r.heldAt >= 0 && r.heldAt <= 2) finalBases[r.heldAt] = r.idx; // 3-bag books only
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
    if (['single', 'double', 'triple'].includes(label)) {
      this.bus.emit('sfx', 'safe');
      this.bus.emit('vo', { event: 'safe', gender: this.kicker?.gender });
      if (this.kickingIsPlayer()) this.crownFeed('hit'); // base hits build the crown
    }
    this.pendingRuns = 0;
    this.refreshHud();

    if (this.match.state.phase === 'GAME_END') {
      this.fireMatchOver();
      return;
    }
    this.returnBallToPitcher(); // every play closes with the ball back on the mound
    const tryNext = () => {
      // never reset mid-cinematic OR while the return throw is still in the air
      if (this.cinematicLock || this.ball.mode === 'flying') return this.after(0.3, tryNext);
      this.nextAtBat();
    };
    this.after(1.2, tryNext);
  }

  /** End-of-play ritual: whoever ended up with the ball fires it back to the
   *  pitcher, who catches it clean — the ball ALWAYS returns to the mound. */
  returnBallToPitcher() {
    const fielding = this.fieldingChars();
    const pitcher = fielding.find((c) => c.spot?.id === 'P');
    const holder = fielding.find((c) => c.hasBall);
    if (!pitcher || !holder || holder === pitcher || this.throwing || this.cinematicLock) return;
    this.faceTo(holder, pitcher.group.position);
    this.faceTo(pitcher, holder.group.position);
    holder.animator.play('throw', {
      onContact: () => {
        if (!holder.hasBall) return;
        holder.hasBall = false;
        this.flyBallToPitcher();
      },
      onDone: () => { if (holder.animator.name === 'throw') holder.animator.play('idle'); },
    });
  }

  /** Fly the ball from wherever it is to the pitcher, who catches it clean. */
  flyBallToPitcher(speed = this.throwSpeed()) {
    const pitcher = this.fieldingChars().find((c) => c.spot?.id === 'P');
    if (!pitcher) return;
    const flight = this.ball.throwTo(pitcher.group.position.clone().setY(1.15), speed);
    this.after(flight, () => {
      pitcher.hasBall = true; // carryHeldBall pins it to his throwing hand
      pitcher.animator.play('catch', { onDone: () => pitcher.animator.play('idle') });
      this.ball.place(pitcher.group.position.clone().setY(1.1));
      this.ball.mode = 'idle';
      this.bus.emit('sfx', 'catchpop');
      this.faceTo(pitcher, FIELD_LAYOUT.home);
    });
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
      // YOUR fielder AUTO-CHASES from the jump (null target = pursue the ball);
      // tap/drag away from the ball to position him manually instead.
      this.hud.clearStamps(); // pitch/kick stamp must not linger over the fielding action
      this.fielderTarget = null;
      this.fielderRing.visible = true;
      this.marker.position.copy(this.pred.point).setY(0.05);
      this.marker.visible = true;
      this.lastDragAt = -10;
      this.hud.hint('DRAG = STEER • TAP TEAMMATE = SWITCH');
    }
  }

  /** Bases that need a fielder standing on them this play (force + active runners). */
  basesToCover() {
    // 1st, 2nd, 3rd AND home (catcher) are ALWAYS manned — a baseman stands on
    // each and stays there to take throws; only the chaser leaves to get the ball.
    return [0, 1, 2, 3];
  }

  fielderSpeed(char, role) {
    // city element drag: heat-wave fatigue builds by inning; steam clouds slow anyone inside.
    // A crew ON FIRE runs hotter — the scales compose.
    const el = this.elements.fielderSpeedScale(this.match.state.inning)
      * (this.elements.inSteam(char.group.position.x, char.group.position.z) ? 0.6 : 1)
      * this.heat.fielderSpeedScale(this.match.fieldingSide());
    if (this.playerControlled && role === 'chase') return this.tuning.fielding.dragSpeedMs * el;
    const speed = char.data?.stats?.speed ?? 5;
    const glove = char.data?.stats?.glove ?? 5;
    return (5.5 + speed * 0.2 + (role === 'chase' ? glove * 0.12 : 0)) * el;
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
      if (c.animator.name === 'stumble') continue; // downed — let the get-up ritual finish
      let target = f.target;

      if (f.role === 'chase') {
        if (!reacted) continue;
        if (c !== this.chaser && c !== this.activeFielder) {
          // stood down: his relay landed in a teammate's glove — jog back to
          // his spot instead of chasing the ball to the bag and jogging in
          // place next to the bag man (dev, 2026-08-04)
          target = f.target;
        } else if (this.playerControlled) {
          // AUTO-CHASE like the AI does — your defense should never stand and
          // watch (dev callout). A tap/drag OVERRIDES the auto pursuit, so you
          // keep control without babysitting every chase.
          target = this.fielderTarget ?? chaseSpot;
        } else {
          target = chaseSpot;
        }
      } else if (f.role === 'backup') {
        // converge close behind the play as a second pursuer/relay — TWO
        // fielders visibly go for the ball, like a real defense
        const bp = this.ball.pos;
        const inward = FIELD_LAYOUT.home.clone().sub(bp).setY(0);
        const len = inward.length() || 1;
        target = bp.clone().addScaledVector(inward.multiplyScalar(1 / len), 2.5).setY(0);
      }

      const d2 = new THREE.Vector2(target.x - c.group.position.x, target.z - c.group.position.z);
      const dist = d2.length();
      if (dist > 0.14) {
        const step = Math.min(dist, this.fielderSpeed(c, f.role) * dt);
        c.group.position.x += (d2.x / dist) * step;
        c.group.position.z += (d2.y / dist) * step;
        // hard court limits — nobody runs THROUGH the outfield fence or backstop
        const rr = Math.hypot(c.group.position.x, c.group.position.z);
        const maxR = this.fenceM - 0.5;
        if (rr > maxR) { c.group.position.x *= maxR / rr; c.group.position.z *= maxR / rr; }
        if (c.group.position.z > 3.0) c.group.position.z = 3.0;
        c.faceYaw = Math.atan2(d2.x, d2.y);
        if (c.animator.name !== 'run') c.animator.play('run');
        // stride reads at actual chase speed — fast chases visibly sprint
        c.animator.ctx.speedFactor = 0.7 + Math.min(1.3, (step / dt) / this.tuning.running.maxSpeedMs);
      } else if (c.animator.name === 'run' && c !== this.chaser) {
        // arrived — settle (includes a stood-down thrower back at his spot)
        c.animator.play(c.hasBall ? 'holdball' : 'crouch');
        this.faceTo(c, this.ball.pos);
      }
    }

    if (this.playerControlled && this.chaser) {
      this.fielderRing.position.copy(this.chaser.group.position).setY(0.05);
    }
    if (reacted) this.handleChaserBall();
  }

  catchRadius() {
    if (this.playerControlled) return 2.2;
    return { Rookie: 1.9, Street: 2.1, King: 2.4 }[this.difficulty] ?? 2.1;
  }

  /** Chance the AI actually SQUEEZES a reachable fly (real fielders drop some) —
   *  this is the main "not every ball is caught" lever. Player catches if they got there. */
  catchSkill() {
    if (this.playerControlled) return 1.0;
    // AI drops enough flies that putting the ball in play is worth something —
    // the player MUST be able to get on base a fair % of the time (dev)
    return { Rookie: 0.5, Street: 0.68, King: 0.85 }[this.difficulty] ?? 0.68;
  }

  /** how long the AI holds the ball before throwing — the runner's window */
  aiThrowDelayS() {
    return { Rookie: 0.7, Street: 0.55, King: 0.4 }[this.difficulty] ?? 0.55;
  }

  /** The chaser tries to catch a fly or scoop a grounder once it's on the ball. */
  handleChaserBall() {
    const c = this.chaser;
    if (!c || c.hasBall || this.throwing) return;
    const ballDist = Math.hypot(this.ball.pos.x - c.group.position.x, this.ball.pos.z - c.group.position.z);
    c.faceYaw = Math.atan2(this.ball.pos.x - c.group.position.x, this.ball.pos.z - c.group.position.z);

    if (this.isFly && this.ball.bounces === 0 && !this.ball.onGround &&
        this.ball.vel.y < 0 && this.ball.pos.y < 2.6 && ballDist < this.catchRadius()) {
      // roll the catch ONCE per fly — if the AI muffs it, the ball drops in for a hit.
      // Stretched catches (ball near the edge of reach) drop more — positioning matters.
      if (this.catchRoll === null || this.catchRoll === undefined) {
        const reach = Math.min(1, ballDist / this.catchRadius()); // 0 = right on it … 1 = at full stretch
        this.catchRoll = this.tutorialNoCatch
          ? false // drill mode: the ball ALWAYS drops — the lesson needs a live play
          : Math.random() < this.catchSkill() * (1 - 0.25 * reach);
      }
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
    // catch, then settle into the ball-in-hands stance (dev call: Goalkeeper Idle)
    c.animator.play('catch', { onDone: () => { if (c.hasBall) c.animator.play('holdball'); } });
    this.faceTo(c, FIELD_LAYOUT.home);
    this.bus.emit('sfx', 'catchpop');
    if (this.playerControlled) {
      this.marker.visible = false;
      this.hud.hint('THROW! GOLD BAG = THE OUT');
      this.hud.showThrowPad(true);
      this.hud.highlightBestBase(this.recommendedThrowBase()); // show the force-out base
      this.showBaseRings(true);
      // safety: never freeze if the player never throws
      this.after(6, () => { if (c.hasBall && !this.playFinalized && !this.throwing) this.ballControlled = true; });
    } else {
      this.after(this.aiThrowDelayS(), () => this.aiThrowDecision(c));
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

  /**
   * Which forced bag to throw to. Under 2 outs: the LEAD force (protect the
   * plate — stop the biggest damage). With 2 outs, ANY out ends the inning, so
   * take the EASIEST one: the bag with the biggest time margin between the
   * runner still getting there and the ball's flight (dev call — no more
   * hero throws home when a soft flip to first ends it).
   */
  recommendedThrowBase(fromFielder = null) {
    const forced = this.runners.filter((r) =>
      r.state === 'running' && (r.forced || r.tagUp) && r.targetBase >= 0 && r.targetBase <= 3);
    if (!forced.length) return null;
    const outsNow = (this.match?.state?.outs ?? 0) + (this.playOuts ?? 0);
    if (outsNow >= 2) {
      const from = (fromFielder ?? this.activeFielder ?? this.chaser)?.group?.position ?? this.ball.pos;
      const runSpeed = this.tuning.running.maxSpeedMs ?? 8.3;
      const BALL_MS = 22; // matches the base-throw flight speed class
      let best = null;
      let bestMargin = -Infinity;
      for (const r of forced) {
        const bag = this.basePos(r.targetBase);
        const runnerT = Math.max(0, this.tuning.running.basePathM - r.sim.progressM) / runSpeed;
        const ballT = from.distanceTo(bag) / BALL_MS;
        const margin = runnerT - ballT;
        if (margin > bestMargin) { bestMargin = margin; best = r; }
      }
      return best.targetBase;
    }
    let best = null;
    for (const r of forced) if (!best || r.targetBase > best.targetBase) best = r;
    return best.targetBase;
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

  /** Snap a stuck runner to his nearest sensible bag and let the play close.
   *  Called by the phase-independent watchdog AND the 14s live safety net. */
  forceSettleRunner(r) {
    console.warn('[skk] watchdog: force-settling stuck runner', r.idx, 'phase', this.phase);
    this.watchdog.clear(r.idx);
    if (r === this.stealing) {
      // stuck stealer: past halfway = award the bag, else send him back — then
      // clear ALL steal bookkeeping so the pitch flow can't wait on him
      if (r.sim.progressM > this.tuning.running.basePathM * 0.5) {
        this.commitStealArrival(r);
      } else {
        r.state = 'done';
        r.char.group.position.copy(this.basePos(r.fromBase)).add(new THREE.Vector3(0.4, 0, 0.4));
        r.char.animator.play('idle');
        this.baseChars[r.fromBase] = r.char;
        this.runners = this.runners.filter((q) => q !== r);
        this.releaseTrail(r);
        this.stealing = null;
        this.stealResolving = false;
        this.stealDefense = null;
      }
      return;
    }
    const past = r.sim.progressM > this.tuning.running.basePathM * 0.5;
    if (past && r.targetBase === 3) {
      this.scoreRun(r);
      this.pendingRuns = (this.pendingRuns ?? 0) + 1;
      r.char.group.visible = false;
    } else {
      r.state = 'held';
      r.heldAt = past ? Math.min(r.targetBase, 2) : Math.max(r.fromBase, 0);
      r.tagUp = false;
      r.char.group.position.copy(this.basePos(r.heldAt)).add(new THREE.Vector3(0.4, 0, 0.4));
      r.char.animator.play('idle');
    }
  }

  /** A non-forced runner caught off a base reverses toward the bag he came from. */
  retreatRunner(r) {
    if (r.fromBase < 0) return;
    const oldP = r.sim.progressM;
    const newFrom = r.targetBase;
    r.targetBase = r.fromBase;
    r.fromBase = newFrom;
    r.forced = false;
    r.sim = this.newRunnerSim();
    r.sim.progressM = Math.max(0, this.tuning.running.basePathM - oldP);
    r.char.animator.play('run');
  }

  /** Rundown: the runner reverses, the fielder at the base grabs it, you peg him.
   *  PLAYER OFFENSE: this becomes the PICKLE mini-game — back and forth, juking
   *  and spinning, until you're tagged/pegged or you slide onto a bag. */
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
    this.bus.emit('vo', { event: 'pickle', gender: runner.char?.gender });
    if (this.playerControlled) {
      // PLAYER DEFENSE: same duel — your verbs are THROW (button) and PEG (swipe)
      this.duel = {
        r: runner,
        brain: new PickleDuel({ mine: false, difficulty: this.difficulty, tuning: this.tuning }),
        backBase: runner.targetBase, // startRundown retreat-flipped him already
        forwardBase: runner.fromBase,
        throwInfo: null,
        tagCd: 0,
      };
      runner.sim.human = false;
      this.hud.setLetterbox(true);
      this.hud.showDuel('THROW!');
      this.hud.showThrowPad(false); // the duel button replaces the pad here
      this.hud.hint('');
      this.freezeForPickle();
    } else if (this.kickingIsPlayer()) {
      this.startPickle(runner); // YOUR runner is trapped — mini-game on
    } else if (catcher) {
      this.after(0.5, () => { if (catcher.hasBall && !this.playFinalized) this.throwBall(catcher, { peg: true }); });
    }
  }

  // ---------- THE DUEL (pickle v4): characters do the running, you make the calls ----------
  /** Your runner is trapped. One button: GO! (lit while the ball flies — break
   *  away from the throw). Swipe up: SPIN (i-frames — dodges tags AND pegs).
   *  Left/right swipes still juke, and a well-timed juke slips a peg too. */
  startPickle(r) {
    this.duel = {
      r,
      brain: new PickleDuel({ mine: true, difficulty: this.difficulty, tuning: this.tuning }),
      backBase: r.targetBase, // startRundown retreat-flipped him already
      forwardBase: r.fromBase,
      throwInfo: null,
      tagCd: 0,
    };
    r.sim.human = false; // the duel drives his legs — you make the calls
    this.hud.setLetterbox(true);
    this.hud.showDuel('GO!');
    this.hud.showReverse(); // v5: your runner, your juke — always available
    this.hud.hint('');
    this.freezeForPickle();
  }

  /** FREEZE the world while the camera swings to the pickle stage — the
   *  player gets a beat to read the duel and find the pad, then GO. (timeScale
   *  0 stops gameplay but the camera spring keeps flying on rawDt.) */
  freezeForPickle() {
    this.engine.timeScale = 0;
    this.pickleFreezeUntil = this.elapsed + 1.5;
    // (startRundown already slams the PICKLE! spray stamp — no double banner)
    this.bus.emit('sfx', 'bassdrop');
  }

  releasePickleFreeze() {
    if (!this.pickleFreezeUntil) return;
    this.pickleFreezeUntil = 0;
    this.engine.timeScale = this.duel ? PICKLE_SLOWMO : 1;
  }

  /** back to full speed once no pickle stage is live (never fights a cinematic) */
  restoreSpeed() {
    if (!this.cinematicLock) this.engine.timeScale = 1;
  }

  /** Duel identity: ONE teal ring under the character you control. */
  updateStageMarkers() {
    const duel = this.duel;
    const on = !!duel && duel.r.state === 'running';
    if (!on) { this.youRing.visible = false; return; }
    const holder = this.fieldingChars().find((c) => c.hasBall);
    const youChar = this.kickingIsPlayer() ? duel.r.char : holder;
    if (!youChar) { this.youRing.visible = false; return; }
    this.youRing.visible = true;
    this.youRing.position.copy(youChar.group.position).setY(0.07);
    this.youRing.scale.setScalar(1 + Math.sin(this.elapsed * 8) * 0.12);
  }

  /** THE DUEL, every frame: steer the auto-shuttle, drive the tagger, run the
   *  AI side's clocks, keep the one button honest (lit = actionable NOW). */
  updateDuel(dt) {
    const duel = this.duel;
    const r = duel.r;
    const brain = duel.brain;
    if (r.state !== 'running' || this.playFinalized) {
      return this.endDuel();
    }
    brain.tick(dt); // also runs down brain.chaserSlowT (spin penalty)
    duel.tagCd = Math.max(0, duel.tagCd - dt);
    if (duel.spinAnim && brain.spinT <= 0) duel.spinAnim = false;

    // --- lane geometry (0 = back/safety bag, 1 = forward bag) ---
    const backPt = this.bagPos(duel.backBase);
    const fwdPt = this.bagPos(duel.forwardBase);
    const axis = fwdPt.clone().sub(backPt);
    const rp = r.char.group.position;
    const runnerT = Math.max(0, Math.min(1, rp.clone().sub(backPt).dot(axis) / axis.lengthSq()));
    const ballT = Math.max(-0.06, Math.min(1.06, this.ball.pos.clone().sub(backPt).dot(axis) / axis.lengthSq()));
    const dirNow = r.targetBase === duel.forwardBase ? 1 : -1;

    // --- steer the runner: committed = locked sprint; manual = the player's own
    // juke (v5 REVERSE); else shuttle away from the ball ---
    const wantDir = brain.committed ? brain.commitDir : (brain.manualDir || shuttleDir({ runnerT, ballT }));
    if (wantDir !== dirNow && r.fromBase >= 0) {
      this.retreatRunner(r);
      r.sim.human = false;
    }
    // auto-slide: committed and closing on a bag — low under the tag, no input
    // (never mid-spin: the slide was stomping the soccerSpin clip a beat in)
    const remaining = this.tuning.running.basePathM - r.sim.progressM;
    if (brain.committed && remaining < 5.2 && !duel.spinAnim && r.char.animator.name !== 'slide') {
      r.char.animator.play('slide');
      this.bus.emit('sfx', 'slide'); // pavement scrape under the slide
    }

    const holder = this.fieldingChars().find((c) => c.hasBall);
    if (this.kickingIsPlayer()) {
      // ===== OFFENSE: the AI defense hunts; GO is lit while the ball flies =====
      this.hud.setDuelLit(brain.canGo(!!duel.throwInfo && duel.throwInfo.toEnd !== -1));
      if (holder && !this.throwing) {
        duel.throwInfo = null; // ball in a glove — the GO window is shut
        this.duelChase(holder, r, duel, dt);
        const act = brain.aiDefense(dt, {
          ballFlying: false,
          holderDist: holder.group.position.distanceTo(rp),
          runnerCommitted: brain.committed,
        });
        if (act === 'relay') this.duelRelay(holder);
        else if (act === 'peg') this.duelPegAt(holder, r);
      }
    } else {
      // ===== DEFENSE: you squeeze him; THROW is lit whenever you hold the ball =====
      this.hud.setDuelLit(!!holder && !this.throwing && brain.canThrow());
      if (holder && !this.throwing) {
        duel.throwInfo = null;
        this.duelChase(holder, r, duel, dt);
      }
      const act = brain.aiOffense(dt, {
        ballFlying: !!duel.throwInfo && duel.throwInfo.toEnd !== -1,
        flightFrac: duel.throwInfo ? Math.min(1, (this.elapsed - duel.throwInfo.t0) / duel.throwInfo.totalS) : 0,
        throwToEnd: duel.throwInfo?.toEnd === 1 ? 1 : 0,
        holderDist: holder ? holder.group.position.distanceTo(rp) : 99,
        pegIncoming: brain.pegWindupT > 0,
      });
      if (act?.type === 'go') {
        brain.go({ flightFrac: act.flightFrac, throwToEnd: act.throwToEnd });
      } else if (act?.type === 'spin') {
        if (brain.spin()) this.duelSpinFx(duel);
      } else if (act?.type === 'reverse') {
        if (brain.reverse(dirNow)) this.bus.emit('sfx', 'juke');
      }
    }
  }

  /** the ball-carrier closes on the trapped runner (both sides of the duel) */
  duelChase(holder, r, duel, dt) {
    const rp = this.runnerWorldPos(r).p;
    const hp = holder.group.position;
    hp.y = 0; // re-ground every frame (runners get this; chasers were drifting)
    const d = hp.distanceTo(rp);
    // a downed chaser stays DOWN until his recovery ritual finishes — dragging
    // him across the pavement in the fallen pose was the half-buried glide.
    // Gate on the recovery STATE, self-healing if the ritual gets superseded.
    if (holder.recovering) {
      if (holder.animator.name === 'stumble') return; // still down
      holder.recovering = false; // ritual finished or replaced — chase on
    }
    if (d > 1.05) {
      const slow = duel.tagCd > 0 ? 0.35 : duel.brain.chaserSlowT > 0 ? 0.42 : 0.74; // stumbled/juked = slowed
      const spd = this.tuning.running.maxSpeedMs * slow;
      const dir = rp.clone().sub(hp).setY(0).normalize();
      hp.addScaledVector(dir, spd * dt);
      holder.faceYaw = Math.atan2(dir.x, dir.z);
      if (holder.animator.name !== 'run') holder.animator.play('run');
    } else if (holder.animator.name === 'run') {
      holder.animator.play('holdball');
    }
  }

  /** Relay to the lane end the runner is drifting toward (cut him off). The
   *  flight is the GO window — throwInfo carries which end + the clock. */
  duelRelay(holder) {
    const duel = this.duel;
    const r = duel.r;
    const toEnd = r.targetBase === duel.forwardBase ? 1 : 0;
    const base = toEnd === 1 ? duel.forwardBase : duel.backBase;
    const basePt = this.bagPos(base);
    duel.brain.relays += 1;
    duel.throwInfo = {
      toEnd,
      t0: this.elapsed,
      totalS: 0.5 + holder.group.position.distanceTo(basePt) / this.throwSpeed(),
    };
    this.throwBall(holder, { base });
  }

  /** Telegraphed peg: a visible/audible windup beat (the SPIN window), then
   *  the kill shot. Used by the AI on your runner AND by your swipe on theirs. */
  duelPegAt(holder, r) {
    const duel = this.duel;
    if (!duel.brain.startPeg()) return;
    holder.animator.play('holdball');
    this.faceTo(holder, this.runnerWorldPos(r).p);
    this.bus.emit('sfx', 'throw'); // the audible windup IS the tell
    this.after(duel.brain.D.pegWindupS, () => {
      if (!this.duel || this.playFinalized || !holder.hasBall || this.throwing) return;
      if (this.duel.brain.pegBroken) { this.duel.brain.pegBroken = false; return; } // spin broke his timing — no throw
      this.duel.throwInfo = { toEnd: -1, t0: this.elapsed, totalS: 0.4 }; // a peg is NOT a GO window
      this.throwBall(holder, { peg: true });
    });
  }

  /** THE DUEL button: GO! on offense, THROW! on defense. Unlit = inert. */
  onDuelButton() {
    const duel = this.duel;
    if (!duel || duel.r.state !== 'running') return;
    if (this.kickingIsPlayer()) {
      const ti = duel.throwInfo;
      if (!ti || ti.toEnd === -1) return;
      const flightFrac = Math.max(0, Math.min(1, (this.elapsed - ti.t0) / ti.totalS));
      if (duel.brain.go({ flightFrac, throwToEnd: ti.toEnd })) {
        this.bus.emit('sfx', 'juke');
        this.hud.goalPop('GO!');
      }
    } else {
      const holder = this.fieldingChars().find((c) => c.hasBall);
      if (!holder || this.throwing || !duel.brain.canThrow()) return;
      this.duelRelay(holder);
    }
  }

  /** Swipe during a defense duel: PEG the runner (windup tell, dodgeable). */
  onDuelPeg() {
    const duel = this.duel;
    const holder = this.fieldingChars().find((c) => c.hasBall);
    if (!duel || !holder || this.throwing) return;
    this.duelPegAt(holder, duel.r);
  }

  /** Shared spin presentation + defense cost (player swipe AND the AI runner):
   *  the real Soccer Spin clip when the extras pack has landed (whirl-rotation
   *  fallback otherwise), the chaser loses a step, and a mid-windup peg is
   *  broken — the spin makes the thrower miss his timing. */
  duelSpinFx(duel) {
    this.bus.emit('sfx', 'juke');
    const r = duel.r;
    if (r.char.animator.hasClip?.('soccerSpin')) {
      duel.spinAnim = true;
      r.char.animator.play('soccerSpin', {
        onDone: () => {
          duel.spinAnim = false;
          if (r.state === 'running' && r.char.animator.name === 'soccerSpin') r.char.animator.play('run');
        },
      });
    }
    if (duel.brain.spinPenalty()) { // chaser falls behind; a live windup dies
      this.hud.call('SHOOK THE THROW!', 'crowned');
    }
  }

  /** Swipe up on the offense duel: SPIN (i-frames — dodges tags AND pegs). */
  duelSpin() {
    const duel = this.duel;
    if (!duel || !this.kickingIsPlayer()) return;
    if (duel.brain.spin()) this.duelSpinFx(duel);
  }

  /** v5 REVERSE button: flip YOUR trapped runner's direction on demand. */
  duelReverse() {
    const duel = this.duel;
    if (!duel || duel.r.state !== 'running' || !this.kickingIsPlayer()) return;
    const dirNow = duel.r.targetBase === duel.forwardBase ? 1 : -1;
    if (duel.brain.reverse(dirNow)) {
      this.bus.emit('sfx', 'juke');
      this.hud.callout('REVERSED!', { x: window.innerWidth / 2, y: window.innerHeight * 0.42, ttl: 700, key: 'rev' });
    }
  }

  /** The duel resolves into one of THREE outcomes: retreat-safe (small win),
   *  forward steal (JACKPOT), or out. Always releases ball control cleanly. */
  endDuel() {
    const duel = this.duel;
    if (!duel) return;
    this.duel = null;
    this.releasePickleFreeze();
    this.restoreSpeed();
    this.hud.hideDuel();
    this.hud.setLetterbox(false);
    this.hud.hint('');
    // settle the tagger — updateDefense skips ball-holders, so without this
    // he's stuck looping the run clip in place
    const holder = this.fieldingChars().find((c) => c.hasBall);
    if (holder && holder.animator.name === 'run') holder.animator.play('holdball');
    // the rundown WAS the play: once it resolves the defense controls the
    // ball, and the play must be allowed to END (dev: 'very glitchy when a
    // pickle ends — the game doesn't understand the play is over')
    if (!this.throwing && !this.runners.some((q) => q.state === 'running')) {
      this.defenseHasBall = true;
      this.ballControlled = true;
    } else if (!this.playerControlled && !this.throwing) {
      this.aiContinue(); // someone ELSE is still running — defense resumes the hunt
    }
    const r = duel.r;
    // heat: the rundown's outcome swings momentum for whoever won it
    if (r.state === 'scored' || (r.state === 'held' && r.heldAt === duel.forwardBase)) {
      this.noteHeat(this.match.kickingSide(), 'pickleEscape');
    } else if (r.state === 'out') {
      this.noteHeat(this.match.fieldingSide(), 'pickleWin');
    }
    if (this.kickingIsPlayer()) {
      if (r.state === 'scored' || (r.state === 'held' && r.heldAt === duel.forwardBase)) {
        // THE JACKPOT: stole the forward bag out of a rundown
        this.crownFeed('pickleEscape');
        this.matchStats.pickleEscapes += 1;
        this.refreshHud();
        this.field.crowdEnergy = 1;
        this.bus.emit('sfx', 'crowd-cheer');
        this.bus.emit('sfx', 'safe');
        this.bus.emit('vo', { event: 'safe', gender: r.char?.gender });
        this.hud.call('STOLE THE BAG!', 'crowned');
      } else if (r.state === 'held') {
        // the small win: worked his way back to safety — no out, he lives
        this.bus.emit('sfx', 'crowd-cheer');
        this.hud.call('SAFE!', 'crowned');
      }
      // an out already got its OUT!/PEGGED! call from runnerOut
    } else if (r.state !== 'running' && r.state !== 'held' && r.state !== 'scored') {
      // defense converted the rundown — double-play-energy celebration
      this.bus.emit('sfx', 'crowd-cheer');
      this.hud.call(r.char?.gender === 'she' ? 'GOT HER!' : 'GOT HIM!', 'pegged');
    }
  }

  /** What the AI does with the ball: force out → cut off the lead runner → peg. */
  aiThrowDecision(fielder) {
    // NOTE: RESOLVE does NOT mean the play is over — the tag-up race runs in
    // RESOLVE (catchOut) and the AI must still gun the double-off there. A
    // phase==='RESOLVE' bail here left the AI holding the ball forever on the
    // player's kicking half — runner tags up safe, play never closes (dev
    // froze twice). playFinalized is the real "play is over" signal.
    if (!fielder.hasBall || this.playFinalized) return;
    if (this.duel) return; // THE DUEL owns the defense (updateDuel)
    // 1) a force out is available → fire to the recommended bag (lead force
    //    under 2 outs; the EASIEST out with 2 outs)
    const forcedBase = this.recommendedThrowBase(fielder);
    if (forcedBase !== null && !(aiWantsPeg(this.difficulty) && this.landDist < 24)) {
      return this.throwBall(fielder, { base: forcedBase });
    }
    // 2) go after the lead runner who's STILL ADVANCING — peg him if he's close,
    //    otherwise cut him off at the bag he's headed to (he must retreat → pickle)
    const lead = this.leadRunner();
    if (lead) {
      const toRunner = fielder.group.position.distanceTo(this.runnerWorldPos(lead).p);
      // pegging is a SEEN part of this game (dev, 2026-08-05: "more of an
      // option"): point-blank is automatic; mid-range is a difficulty-scaled
      // taste for the highlight throw (the lead-the-runner aim handles range)
      const pegReach = { Rookie: 6.5, Street: 8.5, King: 10 }[this.difficulty] ?? 8;
      if (toRunner < 5.5 || (toRunner < pegReach && aiWantsPeg(this.difficulty))) return this.throwBall(fielder, { peg: true });
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
    if (this.playerControlled || this.playFinalized) return; // RESOLVE hosts the tag-up race — keep hunting
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
    // playFinalized only — RESOLVE still hosts the live tag-up race (see
    // aiThrowDecision). Bailing here never released ballControlled, so the
    // race could never finalize.
    if (this.playFinalized) return;
    if (!this.runners.some((r) => r.state === 'running')) { this.ballControlled = true; return; }
    if (this.duel && this.playerControlled) {
      // defense DUEL: the duel button owns the throws — no throw pad. Just make
      // sure somebody holds the ball so the squeeze (and THROW) can continue.
      let holder = this.fielders?.find((f) => f.char.hasBall)?.char;
      if (!holder) {
        holder = this.nearestFielderTo(this.ball.pos);
        if (!holder) { this.ballControlled = true; return; }
        holder.hasBall = true;
        this.ball.place(holder.group.position.clone().setY(1.1));
        this.ball.mode = 'idle';
      }
      this.chaser = holder;
      this.activeFielder = holder;
      this.defenseHasBall = true;
      this.ballControlled = false;
      return;
    }
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
    this.hud.hint('THROW TO THE BAG!');
    this.after(6, () => { if (holder.hasBall && !this.playFinalized && !this.throwing) this.ballControlled = true; });
  }

  showBaseRings(on) {
    for (const r of this.baseRings) r.visible = on;
  }

  /** Player throw handler (HUD throw-pad). Delegates to the shared resolver. */
  onPlayerThrow({ base, peg }) {
    // steal defense quick-draw: your reaction time IS the throw's head start
    if (this.stealDefense) {
      const sd = this.stealDefense;
      this.stealDefense = null;
      this.hud.showThrowPad(false);
      // the quick-draw is a BAG throw — mashing PEG costs the same as the wrong bag
      const wrongBag = peg === true || (base !== undefined && base !== this.stealing?.targetBase);
      sd.throwDown((this.elapsed - sd.t0) + (wrongBag ? 0.6 : 0)); // wrong bag costs you
      return;
    }
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
    this.bus.emit('sfx', 'throw');
    // face the target BEFORE the wind-up, release the BALL on the clip's
    // release frame (onContact) — the arm and the ball move together (dev
    // callout: the delayed throw had the ball leaving out of sync)
    this.faceTo(fielder, peg
      ? (this.pegTarget() ? this.runnerWorldPos(this.pegTarget()).p : this.basePos(base ?? 0))
      : this.basePos(base));
    let released = false;
    const release = () => {
      if (released || !fielder.hasBall) return;
      released = true;
      this.releaseThrow(fielder, { base, peg });
    };
    fielder.animator.play('throw', { onContact: release });
    this.after(0.5, release); // safety: an animator without contact marks never stalls
  }

  /** the ball actually leaves the hand — runs at the throw clip's release frame */
  releaseThrow(fielder, { base, peg }) {
    if (peg) {
      const lead = this.pegTarget();
      if (!lead) return this.endThrow(fielder);
      // AI runners try to dodge a peg
      if (!this.kickingIsPlayer() && aiJukes(this.difficulty, this.tuning)) {
        lead.sim.juke(Math.random() < 0.5 ? 'left' : 'right');
      }
      // LEAD the throw (dev: "looks safe, gets called out"): aim where the
      // runner will BE when the ball lands, not where he was when it left —
      // the visual flight and the call must tell the same story.
      const { p, dir } = this.runnerWorldPos(lead);
      const runRate = this.duel?.r === lead ? this.duel.brain.runRate() : (lead.aiRate ?? 4);
      const spdM = mashSpeed(runRate, this.tuning);
      const t0 = p.distanceTo(fielder.group.position) / this.throwSpeed();
      const aim = p.clone().addScaledVector(new THREE.Vector3(dir.x, 0, dir.z), spdM * t0 * 0.9);
      this.faceTo(fielder, aim);
      const flight = this.ball.throwTo(aim.clone().setY(0.9), this.throwSpeed());
      this.after(flight, () => {
        fielder.hasBall = false;
        this.throwing = false;
        this.ballControlled = true;
        let deferred = false;
        if (lead.state !== 'running') { // runner already reached a bag — no peg
          this.bus.emit('sfx', 'catchpop');
          this.hud.call('SAFE!', 'robbed');
        } else {
          const duelPeg = this.duel?.r === lead;
          const rp = this.runnerWorldPos(lead).p;
          const missM = Math.hypot(this.ball.pos.x - rp.x, this.ball.pos.z - rp.z);
          // PROXIMITY TRUTH: if the ball visibly missed, it IS a miss — what
          // the player sees is the call, no exceptions
          const freeBag = () => {
            if (!duelPeg) return;
            const duel = this.duel;
            duel.throwInfo = null;
            duel.brain.committed = true;
            duel.brain.commitDir = 1;
            duel.brain.goGrade = 1;
            this.ballControlled = false; // ball's loose — the bag is his
          };
          if (missM > 1.15) {
            this.bus.emit('sfx', 'dodge');
            this.hud.call('SAILED WIDE!', 'robbed');
            freeBag();
          } else {
            // in THE DUEL the brain resolves it: a timed SPIN or a live juke
            // slips the peg — and a dodged duel peg = loose ball = FREE BAG
            const hit = duelPeg
              ? this.duel.brain.pegImpact({ lateralM: lead.sim.lateral }) === 'hit'
              : resolvePeg({ throwDistM: 0, runnerLateralM: lead.sim.lateral }, this.tuning).hit;
            if (hit) {
              // the SMACK must read on camera: hit-stop, THEN the out call
              this.engine.shake(0.5);
              this.bus.emit('sfx', 'peg');
              if (duelPeg) {
                deferred = true;
                this.engine.timeScale = 0.25;
                this.after(0.1, () => {
                  this.engine.timeScale = 1;
                  this.runnerOut(lead, 'pegged');
                  this.afterThrow();
                });
              } else {
                this.runnerOut(lead, 'pegged');
              }
            } else {
              this.bus.emit('sfx', 'dodge');
              this.hud.call(duelPeg ? 'SPUN OUT OF IT!' : 'JUKED!', 'robbed');
              freeBag();
            }
          }
        }
        if (!deferred) this.afterThrow(); // keep the play alive if a runner is still going
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
    // TAG-UP runners are force targets too: beat them back to the bag = doubled off.
    if (victim && (victim.forced || victim.tagUp)) {
      const remaining = this.tuning.running.basePathM - victim.sim.progressM;
      const rate = this.kickingIsPlayer() ? this.input.tapRate(500, performance.now()) : victim.aiRate;
      const runnerSpeedMs = this.kickingIsPlayer() ? humanRunSpeed(rate, this.tuning) : mashSpeed(rate, this.tuning);
      res = resolveBaseThrow(
        // a motorcade-slowed throw races like a longer one — scale the distance
        { throwDistM: fielder.group.position.distanceTo(basePt) / this.elements.throwZipScale(), runnerRemainingM: remaining, runnerSpeedMs },
        this.tuning,
      );
    }
    const flight = this.ball.throwTo(basePt.clone().setY(0.9), this.throwSpeed());
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
      if (caught && live && (victim.forced || victim.tagUp) && res.out) {
        this.runnerOut(victim, 'forced');
        if (victim.tagUp) this.hud.call('DOUBLED OFF!', 'pegged');
        if (!this.tryDoublePlay(base)) this.afterThrow(); // turn two, or keep chasing the next runner
      } else if (caught && live && !victim.forced && !victim.tagUp) {
        if (this.duel?.r === victim) {
          // duel relay landed — the bag man is the tagger now; the GO window
          // just closed (updateDuel clears throwInfo when a holder appears)
          this.chaser = receiver;
          this.defenseHasBall = true;
        } else if (victim.sim.progressM >= this.tuning.running.basePathM - 0.1) {
          // he's STANDING ON the bag (send-decision window keeps him 'running')
          // — that's a HOLD, not a pickle; a throw must never trap a man who
          // never left the base (dev screenshot, 2026-08-04)
          if (victim.targetBase >= 3) {
            // standing ON HOME is a RUN, not a hold — a heldAt=3 runner poisoned
            // the books AND parked himself in the next kicker's face while the
            // GO-offer gate froze the play (dev freeze screenshot, 2026-08-05)
            this.scoreRun(victim);
            this.pendingRuns = (this.pendingRuns ?? 0) + 1;
            victim.char.group.visible = false;
            this.hud.call('SAFE AT HOME!', 'crowned');
          } else {
            victim.state = 'held';
            victim.heldAt = victim.targetBase;
            victim.char.group.position.copy(this.basePos(victim.targetBase)).add(new THREE.Vector3(0.4, 0, 0.4));
            victim.char.animator.play('idle');
            this.hud.call('HOLDS THE BAG!', 'robbed');
          }
          this.afterThrow();
        } else {
          this.startRundown(victim, base); // can't force him — trap him in a pickle
        }
      } else if (!caught) {
        // nobody covering — the throw sails to an empty bag: runner's safe, ball loose
        this.ball.place(basePt.clone().setY(0.3));
        this.ball.mode = 'idle';
        this.hud.call('NOBODY COVERING!', 'robbed');
        this.bus.emit('sfx', 'safe');
        this.bus.emit('vo', { event: 'safe', gender: victim?.char?.gender });
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

  /** Map a horizontal screen x to the kicker's lateral position (the line-up control). */
  aimKicker(screenX) {
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    const nx = rect.width ? (screenX - rect.left) / rect.width : 0.5;
    const KMAX = 3.4;
    this.kicker.group.position.x = Math.max(-KMAX, Math.min(KMAX, (nx - 0.5) * 2 * KMAX));
  }

  onDrag(e) {
    // KICK role: slide the kicker left/right to line up under the incoming ball;
    // a sharp upward flick starts the kick. TIMING is judged the instant the
    // flick trips (feel unchanged) but the launch waits for the FULL stroke —
    // its length picks the loft, its snap picks the distance band (dev: "more
    // control of where the ball goes").
    if (this.phase === 'PITCH' && this.kickingIsPlayer() && !this.kicked) {
      const now = e.t ?? performance.now();
      if (this.pendingFlick) {
        // mid-flick: keep measuring (incl. sideways CURL = steer), don't drift the kicker
        const f = this.pendingFlick;
        if (e.y < f.yMin) { f.yMin = e.y; f.tLast = now; }
        f.xLast = e.x;
        return;
      }
      if (e.dy > -16) this.aimKicker(e.x); // horizontal-ish move repositions; a sharp up move doesn't drift it
      this.flickBuf = this.flickBuf ?? [];
      this.flickBuf.push({ x: e.x, y: e.y, t: now });
      while (this.flickBuf.length && this.flickBuf[0].t < now - 160) this.flickBuf.shift();
      let maxY = -Infinity, tStart = now, xStart = e.x;
      for (const p of this.flickBuf) { if (p.y > maxY) { maxY = p.y; tStart = p.t; xStart = p.x; } }
      if (maxY - e.y > 48) {
        this.flickBuf = [];
        this.pendingFlick = { tCross: this.elapsed, y0: maxY, yMin: e.y, t0: tStart, tLast: now, x0: xStart, xLast: e.x };
      }
      return;
    }
    // PITCH role: draw the live trace as the player follows the pattern
    if (this.phase === 'PITCH_TRACE') {
      this.traceBuf.push({ x: e.x, y: e.y });
      this.hud.updateTrace(this.traceBuf);
      return;
    }
    // DEFENSE drag — steer the fielder; landing marker stays fixed
    if (this.phase === 'LIVE' && this.activeFielder && !this.activeFielder.hasBall && !this.kickingIsPlayer()) {
      this.steerFielder(e.x, e.y);
    }
  }

  /**
   * Player defense steering. Pointing at/near the ball (or its landing spot)
   * means CHASE — resume the auto pursuit, which lead-intercepts properly. An
   * airborne ball's screen position projects to a ground point way short of it,
   * which used to yank the fielder toward the camera (dev callout). Pointing
   * somewhere clearly away from the ball = manual positioning.
   */
  steerFielder(x, y) {
    const g = this.screenToGround(x, y);
    if (!g) return;
    this.lastDragAt = this.elapsed;
    const landing = (this.ball.onGround || this.ball.bounces > 0) ? this.ball.pos : this.pred.point;
    if (g.distanceTo(landing) < 5.5) {
      this.fielderTarget = null; // chase intent → auto-pursuit takes it
    } else if (this.fielderTarget) {
      this.fielderTarget.copy(g);
    } else {
      this.fielderTarget = g.clone();
    }
  }

  onSwipe(e) {
    // KICK role: an up-swipe also fires the kick (line-up = current kicker position).
    // A buffered flick is already measured — onUp fires it with full metrics.
    if (this.phase === 'PITCH' && this.kickingIsPlayer() && !this.kicked && e.dir === 'up') {
      if (this.pendingFlick) return;
      this.attemptKick({
        align: true,
        flick: { risePx: Math.max(0, -e.dy), durMs: Math.max(1, e.t - e.downT), driftPx: e.dx ?? 0 },
      }, this.elapsed);
      return;
    }
    // DUEL, offense: swipe up = SPIN (i-frames — dodges the tag AND a peg)
    if (this.duel && this.kickingIsPlayer() && e.dir === 'up') {
      this.duelSpin();
      return;
    }
    // DUEL, defense: any swipe = PEG attempt (the runner is centre frame)
    if (this.duel && !this.kickingIsPlayer()) {
      this.onDuelPeg();
      return;
    }
    // juke while running (left/right only); in a duel it's YOUR trapped runner —
    // a well-timed juke slips a peg too (pegImpact reads sim.lateral)
    if (this.phase === 'LIVE' && this.kickingIsPlayer() && (e.dir === 'left' || e.dir === 'right')) {
      const lead = this.duel?.r ?? this.leadRunner();
      if (lead && lead.sim.juke(e.dir)) this.bus.emit('sfx', 'juke');
    }
  }

  /** Fire the buffered flick: timing = the moment the flick tripped, shape =
   *  the whole stroke (rise + snap). */
  fireFlick() {
    const f = this.pendingFlick;
    if (!f) return;
    this.pendingFlick = null;
    this.attemptKick({
      align: true,
      flick: { risePx: f.y0 - f.yMin, durMs: Math.max(1, f.tLast - f.t0), driftPx: (f.xLast ?? f.x0 ?? 0) - (f.x0 ?? 0) },
    }, f.tCross);
  }

  /** Pointer release — completes a buffered flick, or acts as the backup kick
   *  trigger: a release that flicked upward kicks (a flat/horizontal release
   *  was just repositioning the kicker). */
  onUp(e) {
    if (this.pendingFlick) { this.fireFlick(); return; }
    if (this.cinematicLock) return;
    if (this.phase === 'PITCH' && this.kickingIsPlayer() && !this.kicked && e.dy < -26 && e.travel > 22) {
      this.attemptKick({
        align: true,
        flick: { risePx: Math.max(0, -e.dy), durMs: Math.max(1, e.dur), driftPx: e.dx ?? 0 },
      }, this.elapsed);
    }
  }

  onTap(e) {
    if (this.cinematicLock) {
      // the pre-game splash intro AND the crowned dance skip via their chip
      // only; caught-out and the victory lap stay tap-anywhere (they barely block)
      if (!this.walkoutActive && !this.chipSkip) this.bus.emit('cine:skip');
      return;
    }
    // walk-up: a tap skips the show and puts the kicker on the plate
    if (this.walkup) { this.endWalkup(true); return; }
    // DUEL: taps are inert — mash instinct must never fire GO by accident
    if (this.duel && this.kickingIsPlayer()) return;
    // OFFENSE, pre-kick: tap one of YOUR base runners to send him stealing
    if ((this.phase === 'PITCH' || this.phase === 'SETUP') && this.kickingIsPlayer() && !this.stealing) {
      const b = this.pickBaseRunnerAt(e.x, e.y);
      if (b !== null) { this.startSteal(b); return; }
    }
    // DEFENSE: tap ANOTHER fielder to take control of them (sports-game player
    // switching); otherwise tap/drag drives your current fielder. The teal
    // marker STAYS at the ball's landing spot (where to get to).
    if (this.phase === 'LIVE' && this.playerControlled && this.activeFielder && !this.activeFielder.hasBall) {
      const pick = this.pickFielderAt(e.x, e.y);
      if (pick) { this.switchChaser(pick); return; }
      this.steerFielder(e.x, e.y);
    }
  }

  /** Which of your base runners (if any) a pre-pitch tap landed on. */
  pickBaseRunnerAt(x, y) {
    let best = null;
    let bestD = 1e9;
    for (let b = 0; b < 3; b++) {
      const c = this.baseChars?.[b];
      if (!c) continue;
      if (b < 2 && this.match.state.bases[b + 1] !== null) continue; // nowhere to go
      const s = this.worldToScreen(c.group.position);
      if (!s) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return bestD < 54 ? best : null;
  }

  /** AI offense sometimes sends a runner on the pitch (difficulty-scaled). */
  maybeAiSteal() {
    if (this.kickingIsPlayer() || this.stealing || this.lastStealCommit || this.playFinalized) return;
    if (this.tutorialQuiet) return; // no surprise AI steals mid-lesson
    const prob = { Rookie: 0.05, Street: 0.1, King: 0.16 }[this.difficulty] ?? 0.1;
    if (Math.random() > prob) return;
    for (const b of [0, 1]) { // AI steals 2nd/3rd, never home
      if (this.match.state.bases[b] !== null && this.match.state.bases[b + 1] === null) {
        this.startSteal(b);
        return;
      }
    }
  }

  /** Screen position of a character's chest, in the same coords as pointer events. */
  worldToScreen(v) {
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    const p = v.clone();
    p.y += 1.0;
    p.project(this.engine.camera);
    if (p.z > 1) return null; // behind the camera
    return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height };
  }

  // Frame callbacks (matchScene.update() → camDir.update() → this) run BEFORE
  // composer.render() each frame (src/engine/renderer.js), and three.js only
  // recomputes camera.matrixWorldInverse during render — so a hard camera cut
  // earlier in the same update() would otherwise get projected through last
  // frame's stale pose. Force a fresh matrixWorld/matrixWorldInverse here;
  // worldToScreen() is left alone (pre-existing, not on this cut's hot path).
  projectPoint(v, rect) {
    this.engine.camera.updateMatrixWorld();
    const r = rect || this.engine.renderer.domElement.getBoundingClientRect();
    const p = v.clone(); p.y += 1.0; p.project(this.engine.camera);
    return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height, w: r.width, h: r.height, behind: p.z > 1 };
  }

  updateRunnerArrows() {
    if (this.cinematicLock || this.walkoutActive || this.walkup || this.duel) { this.hud.setRunnerArrows([]); return; }
    const live = this.runners.filter((r) => r.state === 'running' || r.state === 'held');
    if (this.stealing?.state === 'running' && !live.includes(this.stealing)) live.push(this.stealing);
    if (!live.length) { this.hud.setRunnerArrows([]); return; }
    const color = this.teams[this.match.kickingSide()].colors?.primary ?? '#3ec6b5';
    const BASE = ['1ST', '2ND', '3RD', 'HOME'];
    const out = [];
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    live.sort((a, b) => b.targetBase - a.targetBase);
    for (const r of live.slice(0, 3)) {
      const pos = r.state === 'held' ? this.basePos(r.heldAt ?? r.fromBase) : this.runnerWorldPos(r).p;
      const pr = this.projectPoint(pos, rect);
      const c = edgeClamp({ x: pr.x, y: pr.y, w: pr.w, h: pr.h, behind: pr.behind });
      if (c.visible) continue;
      out.push({ id: r.idx, x: c.x, y: c.y, angle: c.angle, number: r.char.number, color,
        label: r.state === 'held' ? `ON ${BASE[r.heldAt ?? r.fromBase]}` : `→${BASE[r.targetBase]}`,
        urgent: r.targetBase === 3 || r === this.stealing });
    }
    this.hud.setRunnerArrows(out);
  }

  updateRunnerDots() {
    const color = this.teams[this.match.kickingSide()].colors?.primary ?? '#3ec6b5';
    const dots = [];
    for (const r of this.runners) {
      if (r.state === 'running') dots.push({ id: r.idx, from: r.fromBase, to: r.targetBase, t: r.sim.progressM / this.tuning.running.basePathM, color });
      else if (r.state === 'held') dots.push({ id: r.idx, from: r.heldAt ?? r.fromBase, to: r.heldAt ?? r.fromBase, t: 0, color });
      else if (r.state === 'scored' && r.scoredAt != null && this.elapsed - r.scoredAt < 0.8) dots.push({ id: r.idx, from: 3, to: 3, t: 1, color, scored: true });
    }
    if (this.stealing?.state === 'running' && !this.runners.includes(this.stealing)) {
      const s = this.stealing;
      dots.push({ id: s.idx, from: s.fromBase, to: s.targetBase, t: s.sim.progressM / this.tuning.running.basePathM, color });
    }
    this.hud.setRunnerDots(dots);
  }

  /** The non-active fielder nearest the tap, if the tap actually lands on one. */
  pickFielderAt(x, y) {
    let best = null;
    let bestD = 1e9;
    for (const f of this.fielders ?? []) {
      if (f.char === this.chaser || f.char.hasBall) continue;
      const s = this.worldToScreen(f.char.group.position);
      if (!s) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) { bestD = d; best = f; }
    }
    return bestD < 54 ? best : null;
  }

  /** Hand control to a tapped fielder: they become the chaser, the old chaser
   *  inherits their assignment (base cover / hold) so no base goes unmanned. */
  switchChaser(fNew) {
    const fOld = this.fielders.find((q) => q.char === this.chaser);
    if (!fOld || fNew === fOld) return;
    fOld.role = fNew.role;
    fOld.baseIdx = fNew.baseIdx;
    fOld.target = fOld.role === 'cover'
      ? this.basePos(fOld.baseIdx).clone()
      : fOld.char.group.position.clone();
    fNew.role = 'chase';
    fNew.baseIdx = undefined;
    this.chaser = fNew.char;
    this.activeFielder = fNew.char;
    this.fielderTarget = null; // fresh auto-pursuit until the player steers
    fNew.char.animator.play('run');
    this.bus.emit('sfx', 'juke'); // switch blip
  }

  /** AI offense: should this held runner gamble for the next bag?
   *  Risk-based: compare how long the defense needs to DELIVER the ball to the
   *  target bag (reach it + throw it) against the runner's time to get there.
   *  Home needs a fatter safety margin than 2nd/3rd. */
  aiWantsExtraBase(r) {
    if (this.ballControlled || r.decideT <= 0) return false;
    const target = r.heldAt + 1;
    if (target > 3) return false;
    // the old spirit: a hot lead runner gambles on any genuinely deep ball
    if (r.aiRate > 2.6 && this.landDist > 20 && r.heldAt <= 1) return true;
    const bp = this.ball.pos;
    if (!bp) return false;
    const bagP = target === 3 ? FIELD_LAYOUT.home : this.basePos(target);
    const dx = bp.x - bagP.x, dz = bp.z - bagP.z;
    let defT = Math.hypot(dx, dz) / 26 + 0.9; // throw flight + pickup/transfer
    if (!this.defenseHasBall) {
      const nf = this.nearestFielderTo(bp);
      if (nf) defT += Math.hypot(nf.group.position.x - bp.x, nf.group.position.z - bp.z) / 6.5;
    }
    const runT = this.tuning.running.basePathM / (this.tuning.running.maxSpeedMs * 0.8);
    return defT > runT + (target === 3 ? 0.9 : 0.35);
  }

  /** World position of the kicker's striking foot — the ball rides into THIS
   *  so contact reads true on every clip, flips and spins included. */
  kickFootPos() {
    if (!this.kicker) return null;
    const clip = this._gearSwing ?? 'kick';
    const re = footBoneRegex(this.kicker.animator.meta?.(clip)?.foot);
    let foot = null;
    this.kicker.group.traverse((o) => { if (!foot && o.isBone && re.test(o.name)) foot = o; });
    if (!foot) this.kicker.group.traverse((o) => { if (!foot && o.isBone && /Foot/i.test(o.name)) foot = o; });
    return foot ? foot.getWorldPosition(new THREE.Vector3()) : null;
  }

  /** Crown feed: every meter gain pulses the crown button so the buildup is
   *  SEEN (dev: the meter must engage the player). */
  crownFeed(event) {
    const minted = this.power.feed(event);
    this.hud.crownPulse?.();
    if (minted) {
      this.hud.stamp('CROWN CHARGED! +1', 'crowned');
      this.hud.hint(`TAP THE 👑 — ${this.power.name} READY`);
      this.bus.emit('sfx', 'bassdrop');
    } else {
      this.bus.emit('sfx', 'crown-tick');
    }
    this.refreshHud();
  }

  /** Out ritual: hit the deck, then GET UP — a held final stumble pose reads as
   *  "buried in the floor" when its legs clip the pavement (dev, twice). */
  outStumble(char) {
    char.recovering = true;
    this.bus.emit('sfx', 'slide'); // hitting the deck scrapes too
    char.animator.play('stumble', {
      onDone: () => this.after(0.6, () => {
        char.recovering = false;
        if (char.animator.name === 'stumble' && char.group.visible) char.animator.play('idle');
      }),
    });
  }

  // ---------- outs ----------
  runnerOut(runner, reason) {
    if (runner.state === 'out') return;
    runner.state = 'out';
    this.outStumble(runner.char);
    this.faceCam(runner.char);
    this.field.crowdEnergy = 1;
    this.playOuts = (this.playOuts ?? 0) + 1;
    if (!this.kickingIsPlayer()) this.matchStats.defOuts += 1; // your glove, your credit
    else {
      // YOUR runner went down — the block reacts ONCE: a boo when the rally is
      // still alive behind him, a groan when he was the last man moving.
      const rallyLive = this.runners.some((o) => o !== runner && (o.state === 'running' || o.state === 'held'));
      this.bus.emit('sfx', rallyLive ? 'boo' : 'crowd-ooh');
    }
    this.lastOutReason = reason;
    if (reason === 'pegged') {
      this.bus.emit('cine:pegged', { runner: runner.char }); // director fires the 'pegged' call
      if (!this.kickingIsPlayer()) this.crownFeed('peg');
      this.noteHeat(this.match.fieldingSide(), 'peg');
    } else {
      this.bus.emit('sfx', reason === 'tag' ? 'tag' : 'catchpop');
      this.bus.emit('sfx', 'out');
      this.bus.emit('vo', { event: 'forced', gender: runner.char?.gender }); // out call
      this.hud.call(reason === 'tag' ? 'TAGGED OUT!' : 'OUT!', 'pegged');
    }
    // Do NOT finalize here — the kicker/other runners may still be live. The
    // natural play-end (ball controlled + nobody running) records the outs.
    // But when this out ENDS the action (nobody left running), wind the play
    // down NOW: settle every jogging defender and stop waiting on the player's
    // 6s throw-pad grace (dev: "fielders just kinda running in place a while").
    if (!this.runners.some((q) => q.state === 'running')) {
      for (const c of this.fieldingChars()) {
        const n = c.animator.name;
        if (!c.hasBall && (n === 'run' || n === 'strafeL' || n === 'strafeR')) c.animator.play('idle');
      }
      this.after(1.0, () => {
        if (!this.playFinalized && !this.throwing && this.defenseHasBall) this.ballControlled = true;
      });
    }
  }

  catchOut(fielder) {
    if (this.phase !== 'LIVE') return;
    this.phase = 'RESOLVE';
    this.ball.place(fielder.group.position.clone().setY(1.3));
    fielder.animator.play('catch');
    fielder.hasBall = true;
    if (!this.kickingIsPlayer()) this.matchStats.defOuts += 1;
    else this.bus.emit('sfx', 'crowd-ooh'); // YOUR ball died in a glove — the block groans
    this.field.crowdEnergy = 1;

    // the kicker is OUT on the catch — settle his clip too, or he keeps
    // looping 'run' frozen mid-basepath for the whole tag-up race (dev
    // clip: "players just running in place")
    const kr = this.runners.find((r) => r.char === this.kicker);
    if (kr && kr.state !== 'out') {
      kr.state = 'out';
      this.outStumble(kr.char);
    }
    this.playOuts = (this.playOuts ?? 0) + 1;
    this.lastOutReason = 'catch';
    if (!this.kickingIsPlayer()) this.crownFeed('catch');
    // heat: a deep or homer-eligible ball snagged = a ROBBERY, else a plain catch
    // (live catches count HERE, once — the finalizePlay 'catch' label is skipped)
    const heatRobbed = this.kickHrEligible || this.landDist > this.fenceM * 0.7;
    this.noteHeat(this.match.fieldingSide(), heatRobbed ? 'robbed' : 'catch');
    // payoff readout: heavy air visibly ate a would-be bomb — or the Hawk
    // blowing IN knocked it down at the track
    if (heatRobbed && this.elements.carryScale() < 0.95) {
      this.after(0.5, () => this.hud.call('HEAVY AIR ATE THAT BOMB', 'robbed'));
    } else if (heatRobbed && this.elements.id === 'the-hawk' && this.elements.windAccel().z > 1.5) {
      this.after(0.5, () => this.hud.call('THE HAWK KNOCKED IT DOWN!', 'robbed'));
    }

    // RESOLVE stops updateDefense, so any fielder caught mid-chase would keep
    // looping his run clip in place through the whole race — stand them down
    for (const c of this.fieldingChars()) {
      const n = c.animator.name;
      if (c !== fielder && (n === 'run' || n === 'strafeL' || n === 'strafeR')) c.animator.play('idle');
    }

    // 3rd out on the catch: the HALF IS OVER — no tag-up race matters. Cut
    // straight to the celebration + resolve instead of several seconds of
    // meaningless scrambling limbo (dev: "got the 3rd out", then nothing).
    if (this.match.state.outs + this.playOuts >= (this.tuning.match?.outsPerHalf ?? 3)) {
      this.bus.emit('cine:robbed', { fielder, kicker: this.kicker });
      this.after(1.1, () => this.finalizePlay(this.playOuts, 'catch', { restoreRunners: true }));
      return;
    }

    // TAG UP RACE (dev callout): on a caught fly the kicker is out and every
    // base runner must get BACK to his time-of-pitch bag — LIVE. The defense
    // can gun the bag behind him for a DOUBLE-OFF; a loose throw can spiral
    // into a rundown. No more teleport-safe.
    let racing = 0;
    for (const r of this.runners) {
      if (r.char === this.kicker) continue; // already handled above
      if (r.state === 'running' && r.fromBase >= 0) {
        const t = r.targetBase;
        r.targetBase = r.fromBase;
        r.fromBase = t;
        r.sim.progressM = Math.max(0, this.tuning.running.basePathM - r.sim.progressM);
        r.forced = false;
        r.tagUp = true;
        r.sim.human = false; // scramble auto-runs — taps boost, silence can't stall the play
        racing += 1;
      } else if (r.state === 'held' && r.heldAt !== r.originBase && r.heldAt < 3) {
        // he completed an advance while the ball hung — send him scrambling back
        r.fromBase = r.heldAt;
        r.targetBase = r.heldAt - 1;
        r.sim = this.newRunnerSim({ human: false }); // auto-scramble
        r.state = 'running';
        r.forced = false;
        r.tagUp = true;
        r.char.animator.play('run');
        racing += 1;
      }
    }

    if (racing === 0) {
      // bases empty — the catch IS the play: full celebration cinematic
      this.bus.emit('cine:robbed', { fielder, kicker: this.kicker });
      this.after(1.1, () => this.finalizePlay(this.playOuts, 'catch', { restoreRunners: true }));
      return;
    }
    // runners scrambling: no cinematic — the RACE is the drama
    this.hud.call('CAUGHT! TAG UP!', 'pegged');
    this.bus.emit('vo', 'robbed');
    this.bus.emit('sfx', 'crowd-cheer');
    if (this.kickingIsPlayer()) this.hud.hint('GET BACK! MASH!');
    if (this.playerControlled) {
      // your gun: fire behind the runner for the double-off
      this.activeFielder = fielder;
      this.chaser = fielder;
      this.defenseHasBall = true;
      this.hud.showThrowPad(true);
      this.hud.highlightBestBase(this.recommendedThrowBase(fielder));
      this.showBaseRings(true);
      this.after(6, () => { if (fielder.hasBall && !this.playFinalized && !this.throwing) this.ballControlled = true; });
    } else {
      this.chaser = fielder;
      this.defenseHasBall = true;
      this.after(this.aiThrowDelayS() + 0.25, () => {
        if (fielder.hasBall && !this.playFinalized) this.aiThrowDecision(fielder);
      });
    }
  }

  homer() {
    if (this.hrFired) return;
    if (this.tutorialNoHomer) return; // drill mode: keep it in the park
    this.hrFired = true;
    this.chipSkip = true; // the crowned dance skips via the CHIP, not any stray tap
    if (this.kickingIsPlayer()) this.matchStats.hr += 1;
    this.field.crowdEnergy = 1;
    this.bus.emit('sfx', 'homer');       // air horn + fireworks — the crown is HEARD
    this.bus.emit('sfx', 'cheer-big');
    // everyone on the basepaths trots home and scores
    let runs = 0;
    for (const r of this.runners) {
      if (r.state === 'running' || r.state === 'held') { runs += 1; this.scoreRun(r, { silent: true }); }
      r.char.group.visible = r.char === this.kicker; // kicker stays out for the dance
    }
    runs += this.pendingRuns ?? 0;
    this.pendingRuns = 0;
    // clear the plate stage for the dance — the kicker teleports HOME for the
    // show and was dancing THROUGH the catcher (dev screenshots, 2026-08-04);
    // nextAtBat re-places and unhides everyone for the next play
    for (const c of this.fieldingChars?.() ?? []) {
      if (c !== this.kicker && c.group.position.distanceTo(FIELD_LAYOUT.home) < 3.2) c.group.visible = false;
    }
    this.bus.emit('cine:crowned', { kicker: this.kicker, team: this.teams[this.match.kickingSide()].id, dance: this.danceBag?.draw(this.kicker) ?? null });
    if (this.kickingIsPlayer()) this.crownFeed('homerun');
    // payoff readout: the element carried it out (heat carry OR an outward wind)
    const hrWind = this.elements.windAccel();
    if (this.elements.carryScale() > 1.05) {
      this.after(2.2, () => this.hud.callout('THE HEAT CARRIED IT!', { x: window.innerWidth / 2, y: window.innerHeight * 0.3, ttl: 1600, key: 'carry' }));
    } else if (hrWind.z < -1.5) {
      const line = this.elements.id === 'the-hawk' ? 'THE HAWK TOOK IT OUT!' : 'THE BREEZE TOOK IT!';
      this.after(2.2, () => this.hud.callout(line, { x: window.innerWidth / 2, y: window.innerHeight * 0.3, ttl: 1600, key: 'carry' }));
    }
    this.finalizePlayHR(runs);
  }

  finalizePlayHR(runs) {
    if (this.playFinalized) return;
    this.playFinalized = true;
    this.phase = 'RESOLVE';
    this.match.applyOutcome({ outsAdded: 0, runs, finalBases: [null, null, null], label: 'homerun' });
    this.refreshHud();
    if (this.match.state.phase === 'GAME_END') {
      this.fireMatchOver();
      return;
    }
    const tryNext = () => {
      if (this.cinematicLock) return this.after(0.3, tryNext);
      this.nextAtBat();
    };
    this.after(1.2, tryNext);
  }

  // ---------- STREET CALLS: dive + fence rob (one lit button, timed windows) ----------
  /** Open/close the call windows each frame; CPU defense rolls its own calls. */
  updateCallWindows() {
    if (this.phase !== 'LIVE') { if (this.call) this.closeCall(); return; }
    const defIsPlayer = !this.kickingIsPlayer();

    // FENCE ROB: an HR-bound ball entering the final stretch to the wall
    if (!this.call && !this.robbing && this.kickHrEligible && !this.hrFired && !this.grdFired
        && this.ball.mode === 'flying' && this.ball.bounces === 0
        && this.landDist > this.fenceM - 2) {
      const d = Math.hypot(this.ball.pos.x, this.ball.pos.z);
      // heavy-air showcase (Play It): dead bombs hang at the track — the rob
      // window opens EARLY on this field
      const robBand = this.elements.id === 'heavy-air' ? 9.5 : 6.5;
      if (d > this.fenceM - robBand && d < this.fenceM) {
        if (defIsPlayer) {
          this.call = { kind: 'rob' };
          this.hud.showCall('ROB IT!');
        } else if (!this.aiCallRolled) {
          // a CPU wall-rob is a rare scream moment — Kings only
          this.aiCallRolled = true;
          if (this.difficulty === 'King' && Math.random() < 0.2) this.resolveRob();
        }
      }
    }

    // DIVE: a low liner/grounder about to shoot past the chaser
    if (!this.call && !this.diveUsed && !this.isFly && this.chaser && !this.chaser.hasBall
        && (this.ball.mode === 'flying' || this.ball.vel.lengthSq() > 36)) {
      const c = this.chaser.group.position;
      const dist = Math.hypot(this.ball.pos.x - c.x, this.ball.pos.z - c.z);
      const speed = Math.hypot(this.ball.vel.x, this.ball.vel.z);
      if (speed > 6 && dist < 5 && dist > 1.2 && this.ball.pos.y < 2.2) {
        if (defIsPlayer) {
          this.call = { kind: 'dive', until: this.elapsed + 0.55 };
          this.hud.showCall('DIVE!');
        } else if (!this.aiCallRolled) {
          this.aiCallRolled = true;
          const p = this.difficulty === 'King' ? 0.45 : this.difficulty === 'Street' ? 0.25 : 0.1;
          if (Math.random() < p) this.resolveDive();
        }
      }
    }

    // window expiry — the moment passed
    if (this.call?.kind === 'dive' && (this.elapsed > this.call.until || this.ball.vel.lengthSq() < 4)) this.closeCall();
    if (this.call?.kind === 'rob' && (this.hrFired || this.ball.mode !== 'flying'
        || Math.hypot(this.ball.pos.x, this.ball.pos.z) >= this.fenceM)) this.closeCall();
  }

  closeCall() {
    this.call = null;
    this.hud.hideCall();
  }

  onCallButton() {
    const call = this.call;
    if (!call) return;
    this.closeCall();
    if (call.kind === 'dive') this.resolveDive();
    else if (call.kind === 'rob') this.resolveRob();
  }

  /** Lay out for the ball. In reach = the snag (air = diving catch, ground =
   *  dive stop into the normal possession flow). Out of reach = he's DOWN and
   *  the ball rolls on — a failed dive is worse than no dive. */
  resolveDive() {
    const f = this.chaser;
    if (!f || f.hasBall || this.diveUsed) return;
    this.diveUsed = true;
    const lead = this.ballLeadPoint();
    const dx = lead.x - f.group.position.x, dz = lead.z - f.group.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist, nz = dz / dist;
    // code-driven lunge (the clip is inPlace): lay him out toward the lead point
    const lunge = Math.min(dist, 2.4);
    f.group.position.x += nx * lunge;
    f.group.position.z += nz * lunge;
    f.faceYaw = Math.atan2(nx, nz);
    f.animator.play('dive');
    this.bus.emit('sfx', 'slide'); // the layout scrapes the blacktop
    const reach = (this.tuning.fielding.scoopRadiusM ?? 2.6) * 1.1;
    const now = Math.hypot(this.ball.pos.x - f.group.position.x, this.ball.pos.z - f.group.position.z);
    if (now <= reach && this.ball.pos.y < 1.7) {
      // freeze the snag NOW, let the layout read for a beat, THEN resolve — an
      // immediate catchOut/possessBall stomps the dive clip with 'catch'
      this.ball.place(f.group.position.clone().setY(0.45));
      if (!this.ball.onGround && this.ball.bounces === 0) {
        this.hud.call('DIVING CATCH!', 'crowned');
        this.after(0.35, () => this.catchOut(f)); // robbed-tier heat + tag-up race flow
      } else {
        this.hud.call('DIVE STOP!', 'pegged');
        this.after(0.3, () => {
          if (this.playFinalized || this.fieldingChars().some((x) => x.hasBall)) return;
          this.possessBall(f); // canonical ground pickup (throw pad, AI decision, etc.)
          this.noteHeat(this.match.fieldingSide(), 'catch');
        });
      }
    } else {
      // whiffed: he's on the pavement while the ball rolls away — with the
      // get-up ritual, never a held face-down pose dragged around the court
      this.outStumble(f);
      this.chaseDelay = this.elapsed - this.liveStart + 0.9;
      this.hud.call('MISSED IT!', 'pegged');
    }
  }

  /** Wall climb: snap the chaser to where the ball will cross, ride him up the
   *  fence, take the homer back at the top, climb down with it. */
  resolveRob() {
    if (this.robbing || this.hrFired) return;
    const f = this.chaser ?? this.fieldingChars().find((c) => !c.hasBall);
    if (!f) return;
    // crossing point: project the ball's horizontal direction to the fence radius
    const vx = this.ball.vel.x, vz = this.ball.vel.z;
    const vlen = Math.hypot(vx, vz) || 1;
    const wx = this.ball.pos.x + (vx / vlen) * 6;
    const wz = this.ball.pos.z + (vz / vlen) * 6;
    const wlen = Math.hypot(wx, wz) || 1;
    const r = this.fenceM - 0.6;
    f.group.position.set((wx / wlen) * r, 0, (wz / wlen) * r);
    f.faceYaw = Math.atan2(wx / wlen, wz / wlen); // face the wall
    f.animator.play('climb');
    this.bus.emit('sfx', 'juke');
    this.robbing = { fielder: f, phase: 'up', t: 0, topY: Math.max(1.2, this.fenceTopY - 1.3) };
  }

  /** Frame driver for the rob climb (runs through RESOLVE — catchOut stops
   *  updateDefense, not this). */
  updateRobbing(rawDt) {
    const rob = this.robbing;
    if (!rob) return;
    const f = rob.fielder;
    rob.t += rawDt;
    if (rob.phase === 'up') {
      f.group.position.y = rob.topY * Math.min(1, rob.t / 0.45);
      if (rob.t >= 0.45) {
        rob.phase = 'hold';
        rob.t = 0;
        if (this.phase === 'LIVE' && !this.hrFired) {
          this.hud.call('ROBBED!', 'crowned');
          this.catchOut(f); // heat 'robbed' (kickHrEligible) + cine flow from the canonical path
        }
      }
    } else if (rob.phase === 'hold') {
      if (rob.t > 0.55) { rob.phase = 'down'; rob.t = 0; f.animator.play('climbDown'); }
    } else if (rob.phase === 'down') {
      f.group.position.y = rob.topY * Math.max(0, 1 - rob.t / 0.5);
      if (rob.t >= 0.5) { f.group.position.y = 0; this.robbing = null; }
    }
  }

  /** Extra Bounce payoff: a bounced ball hopped the wall — dead ball, everyone
   *  advances exactly two bases from the pitch (the standard ground rule). */
  groundRuleDouble() {
    if (this.playFinalized) return;
    this.playFinalized = true;
    this.phase = 'RESOLVE';
    this.hud.setRunnerAlerts([]);
    this.goOffer = null;
    this.hud.hideGo();
    if (this.duel) { this.duel = null; this.hud.hideDuel(); this.hud.setLetterbox(false); }
    this.releasePickleFreeze();
    this.restoreSpeed();
    for (const c of this.fieldingChars()) {
      const n = c.animator.name;
      if (!c.hasBall && (n === 'run' || n === 'strafeL' || n === 'strafeR')) c.animator.play('idle');
    }
    this.field.crowdEnergy = 1;
    this.hud.clearStamps();
    this.hud.call('GROUND RULE DOUBLE — OVER ON A HOP!', 'crowned');
    this.bus.emit('sfx', 'crowd-cheer');
    // applyPlay advances every pre-pitch runner +2 (dest past 3rd scores) — any
    // run a runner already crossed for mid-play is covered by that math, so the
    // live-play tally must be discarded, not added on top.
    this.pendingRuns = 0;
    this.match.applyPlay({ type: 'double' });
    this.refreshHud();
    if (this.match.state.phase === 'GAME_END') {
      this.fireMatchOver();
      return;
    }
    const tryNext = () => {
      if (this.cinematicLock) return this.after(0.3, tryNext);
      this.nextAtBat();
    };
    this.after(1.4, tryNext);
  }

  // ---------- frame update ----------
  update(dt, rawDt) {
    this.elapsed += rawDt;
    // pickle-stage freeze: hold the world while the camera lands, then GO
    if (this.pickleFreezeUntil && this.elapsed >= this.pickleFreezeUntil) {
      this.releasePickleFreeze();
      this.hud.goalPop('GO!');
      this.bus.emit('sfx', 'juke');
    }
    this.updateWalkup(dt);
    // a flick the player never released still fires (finger held after the snap)
    if (this.pendingFlick && this.elapsed > this.pendingFlick.tCross + 0.22) this.fireFlick();
    // city element procs (el-train pass / motorcade sweep): flash the HUD, rattle the camera
    const procEv = this.elements.update(dt);
    if (procEv) {
      this.bus.emit('element:proc', { id: this.elements.id, label: this.elements.def.label, active: procEv.proc === 'start' });
      if (procEv.proc === 'start') this.engine.shake(this.elements.id === 'el-train' ? 0.35 : 0.15);
      if (procEv.proc === 'start') this.trainFly?.start(); // the rumble HAS a train now
    }
    if (this.elements.procActive && this.elements.id === 'el-train') this.engine.shake(0.12);
    this.trainFly?.update(dt);

    this.heat.update(rawDt);
    this.refreshHeatHud();
    this.updateCallWindows();
    this.updateRobbing(rawDt);

    // steam puffs breathe + drift (reused sprites, opacity/position only)
    if (this.steamSprites?.length && this.elements.id === 'steam-vents') {
      for (let i = 0; i < this.steamSprites.length; i++) {
        const sp = this.steamSprites[i];
        if (!sp.visible) continue;
        const ph = this.elapsed * 0.5 + sp.userData.phase;
        sp.material.opacity = 0.32 + Math.sin(ph) * 0.12;
        sp.position.y += Math.sin(ph * 0.7) * 0.0025;
      }
    }

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

    // a caught/held ball rides the holder's hands (after the chars are posed)
    this.carryHeldBall();

    for (const timer of [...this.timers]) {
      // a timer that fired earlier THIS frame may have rebuilt the queue
      // (nextAtBat's clearTimers at a side switch): a de-queued timer must not
      // fire, and splicing by indexOf(-1) deletes the LAST queued timer — that
      // silently ate the fresh serve timer and froze the game at the switch
      const qi = this.timers.indexOf(timer);
      if (qi === -1) continue;
      timer.t -= rawDt;
      if (timer.t <= 0) {
        this.timers.splice(qi, 1);
        // a throwing timer (e.g. a flaky audio/announce call) must not stall the play
        try { timer.fn(); } catch (e) { console.error('[skk] timer error (recovered):', e); }
      }
    }

    // P0 watchdog: ANY runner (incl. a pre-kick stealer) stuck 'running' with
    // no progress gets settled — no phase can strand the game anymore. Runs
    // BEFORE the phase blocks on purpose: if one of them throws, the frame
    // recovers but everything after it is skipped — the watchdog must never
    // sit downstream of the very failures it guards against.
    for (const r of [...this.runners]) {
      if (this.watchdog.check(r.idx, r.sim.progressM, r.state, this.elapsed)) {
        this.forceSettleRunner(r);
        if (this.duel?.r === r) this.endDuel();
      }
    }

    if (this.phase === 'PITCH_TRACE') {
      const window = this.tuning.pitch.traceTimerMs / 1000;
      const frac = (this.traceDeadline - this.elapsed) / window;
      this.hud.setTraceTimer(Math.max(0, frac));
      // ran out of time → auto-release a fat meatball (fires once)
      if (this.elapsed > this.traceDeadline && !this.traceExpired) {
        this.traceExpired = true;
        this.hud.hidePattern();
        this.hud.hideTraceTimer();
        this.hud.pitchGrade('WOBBLER', false);
        this.throwPlayerPitch(this.selectedPitch, 0.2, /*fire=*/false);
      }
    }

    // dj-drop telegraph: the timing ring burns gold exactly while the beat
    // window is open — the pulse IS the tell (spec: beat rendered ON the kick UI)
    this.hud.setBeat(this.phase === 'PITCH' && this.kickingIsPlayer()
      && this.elements.id === 'dj-drop' && this.elements.kickMods(this.elapsed).beatBonus01 > 0);

    if (this.phase === 'PITCH' && this.kickingIsPlayer()) {
      const remain = this.pitchArrival - this.elapsed;
      const total = this.tuning.pitch.plateDistanceM / (this.pitch.speedMph * 0.12);
      const progress = Math.max(0, remain / total);
      // ring rides the incoming ball — line up + time it. worldToScreen is null
      // once the pitch slips BEHIND the camera; an unguarded read here threw
      // before the TOO LATE branch below could fire, freezing the scene update
      // in a permanent per-frame throw (real phone freeze, found 2026-08-04)
      const anchor = this.worldToScreen(this.ball.pos);
      if (anchor) this.hud.ringAt(anchor.x, anchor.y, progress);
      else this.hud.hideRing();
      if (remain < (-this.tuning.kick.okWindowMs / 1000) * 1.6 && !this.kicked) {
        this.kicked = true;
        this.strike('TOO LATE!');
        this.hud.hideRing();
        this.hud.hidePowerMeter();
      }
    }

    if (this.phase === 'PITCH' && this.kickingIsPlayer() && !this.kicked && this.pitchArrival != null) {
      // Power peaks (1.0) exactly at plate arrival, then falls — same curve the kick samples.
      const errNow = (this.elapsed - this.pitchArrival) * 1000;
      this.hud.setPowerMarker(powerFromError(errNow / this.kickWindowScale(), this.tuning));
    }

    if (this.phase === 'PITCH' && !this.kickingIsPlayer() && this.kicker && !this.kicked) {
      // CPU kicker slides toward the incoming ball to line up — just like the
      // player does — so you SEE it move into position before the kick (with lag).
      const tx = Math.max(-3.4, Math.min(3.4, this.ball.pos.x));
      const k = this.kicker.group.position;
      k.x += (tx - k.x) * Math.min(1, rawDt * 5.5);
    }

    if (this.phase === 'KICK_ANIM' && this.kicker && !this.kickingIsPlayer()) {
      // AI kicker auto-steps onto the ball so the foot meets it. The PLAYER kicker
      // stays where they lined it up — a blown line-up should look like a real miss.
      const tx = Math.max(-1.9, Math.min(1.9, this.ball.pos.x));
      const k = this.kicker.group.position;
      k.x += (tx - k.x) * Math.min(1, rawDt * 9);
    }

    // DEAD-FEET FIX: whenever the kicker is sliding to line up — player drag OR CPU
    // auto-slide — during PITCH/SETUP, drive a real stride (run clip, speed-scaled)
    // so the feet move instead of gliding on the static plate clip. Never during
    // KICK_ANIM (the kick clip is playing).
    if (this.kicker && !this.walkup && (this.phase === 'PITCH' || this.phase === 'SETUP')) {
      const kx = this.kicker.group.position.x;
      const prevX = this._kickerPrevX ?? kx;
      const vx = rawDt > 0 ? (kx - prevX) / rawDt : 0; // SIGNED — picks the strafe direction
      const anim = this.kicker.animator;
      const stride = kickerStrideAnim(vx);
      if (stride) {
        if (anim.name !== stride) anim.play(stride, { speedFactor: 0.6 + Math.min(1.4, Math.abs(vx) / 3) });
        anim.ctx.speedFactor = 0.6 + Math.min(1.4, Math.abs(vx) / 3); // stride scales with slide speed
        // half-face the strafe direction like the raw Mixamo clip (dev call):
        // base facing is the mound (-z); bias ~37 deg toward the movement side
        this.kicker.faceYaw = this.yawTo(this.kicker.group.position, FIELD_LAYOUT.pitcher)
          + (stride === 'strafeL' ? 0.65 : -0.65);
      } else if (anim.name === 'strafeL' || anim.name === 'strafeR' || anim.name === 'run') {
        anim.play('plate'); // settled — back to the batter stance
        this.faceTo(this.kicker, FIELD_LAYOUT.pitcher); // square back up to the mound
      }
      this._kickerPrevX = kx;
    } else if (this.kicker) {
      this._kickerPrevX = this.kicker.group.position.x;
    }

    // kick approach: the pitched ball glides its last stretch INTO the foot so
    // the clip's contact frame meets it exactly (attemptKick owns the launch).
    // The target tracks the LIVE kicking-foot bone — spin/flip special clips
    // put the striking foot nowhere near the plate spot (dev, 2026-08-05)
    if (this._kickApproach) {
      const a = this._kickApproach;
      a.t = Math.min(a.dur, a.t + dt);
      const k = a.dur > 0 ? a.t / a.dur : 1;
      const foot = this.kickFootPos();
      if (foot) a.to.set(foot.x, Math.max(0.2, foot.y), foot.z);
      this.ball.place(new THREE.Vector3().lerpVectors(a.from, a.to, k));
      // the KICKER closes the gap too — a capped side-step into the ball so
      // contact reads true from both bodies (dev: "line up on every kick")
      if (a.stepX) {
        this.kicker.group.position.x += a.stepX * Math.min(1, dt / Math.max(a.dur, 0.01));
      }
    }

    // the blacktop is HEARD (dev: "way more sound effects"): live hops thump,
    // the chain-link rattles. First hops only — a settling dribble isn't a drum.
    if ((this.ball.fenceHits ?? 0) > (this._prevFenceHits ?? 0)) {
      this.bus.emit('sfx', 'fence');
    }
    this._prevFenceHits = this.ball.fenceHits ?? 0;
    if (this.ball.bounces > (this._prevBounces ?? 0)) {
      if (this.phase === 'LIVE' && this.ball.bounces <= 3
          && this.elapsed - (this._lastBounceSfx ?? -9) > 0.18) {
        this.bus.emit('sfx', 'bounce');
        this._lastBounceSfx = this.elapsed;
      }
    }
    this._prevBounces = this.ball.bounces;

    // walk beat: the freshly-walked kicker jogs to 1st (cosmetic — nextAtBat
    // re-places everyone from engine state right after)
    if (this._walkJog) {
      const { char, to } = this._walkJog;
      const p = char.group.position;
      const dir = to.clone().sub(p).setY(0);
      if (dir.length() > 0.25) {
        dir.normalize();
        p.addScaledVector(dir, this.tuning.running.maxSpeedMs * 0.85 * dt);
        char.faceYaw = Math.atan2(dir.x, dir.z);
      }
    }

    if (this.phase === 'LIVE' || this.phase === 'RESOLVE') {
      this.updateRunners(dt);
      if (this.duel) this.updateDuel(dt);
      // PEG truth on the pad (dev: "more of an option"): lit while a runner is
      // actually peggable, GOLD + hint when no force is on — the peg IS the play
      if (this.playerControlled && this.activeFielder?.hasBall && !this.throwing && !this.duel) {
        const t = this.pegTarget();
        const live = !!t && t.state === 'running';
        const state = live ? (this.recommendedThrowBase() === null ? 'best' : 'ready') : 'off';
        if (state !== this._pegState) {
          this._pegState = state;
          this.hud.setPegState(state);
          if (state === 'best') this.hud.hint('NO FORCE — PEG THE RUNNER!');
        }
      } else if (this._pegState && this._pegState !== 'off') {
        this._pegState = 'off';
        this.hud.setPegState('off');
      }
    } else if (this.stealing) {
      this.updateStealRunner(dt); // pre-kick steal keeps moving during the pitch
    }
    if (this.phase === 'LIVE') {
      this.updateDefense(dt);

      const dist = Math.hypot(this.ball.pos.x, this.ball.pos.z);
      // a homer must clear the wall IN THE AIR (containment bounces shorter balls
      // back) AND be a crown super-kick — ordinary perfect contact stays in the park
      if (!this.hrFired && !this.robbing && this.kickHrEligible && dist >= this.fenceM - 0.3 && this.ball.pos.y > this.fenceTopY * 0.8 && this.ball.bounces === 0) {
        this.homer();
      }
      // extra-bounce moment (Play It): call the monster hop AS it happens
      if (!this._hopCalled && this.elements.id === 'extra-bounce'
          && this.ball.bounces > 0 && this.elements.bounceScale() > 1.35) {
        this._hopCalled = true;
        this.hud.callout('BIG HOP!', { x: window.innerWidth / 2, y: window.innerHeight * 0.35, ttl: 900, key: 'hop' });
      }
      // PHYSICS IS TRUTH (dev, 2026-08-04): a ball that clears the wall ON THE
      // FLY is a home run for ANYONE — the HR-eligibility roll shapes the
      // launch, it must never veto a flown-out ball (CPU bombs were getting
      // stamped "ground rule double" by the gate).
      if (!this.hrFired && !this.robbing && this.ball.exitedOverFence && this.ball.bounces === 0) {
        this.homer();
      }
      // extra-bounce payoff: a BOUNCED ball that hops the wall = ground rule double
      if (!this.grdFired && !this.hrFired && this.ball.exitedOverFence && this.ball.bounces > 0) {
        this.grdFired = true;
        this.groundRuleDouble();
      }
    }

    // dead-ball safety net v2: after 14s NOTHING holds the play open —
    // settle every stuck runner to his nearest bag, strike any stage,
    // unfreeze, and let the play finalize (dev hit two live stalls).
    // Covers RESOLVE too: the tag-up race runs there pre-finalize, and a
    // race that can't close must never strand the game (dev froze twice).
    if ((this.phase === 'LIVE' || this.phase === 'RESOLVE') && !this.playFinalized
        && this.elapsed - this.liveStart > 14) {
      for (const r of [...this.runners]) {
        if (r.state === 'running') this.forceSettleRunner(r);
      }
      if (this.duel) this.endDuel();
      this.releasePickleFreeze();
      this.restoreSpeed();
      this.ballControlled = true;
      this.defenseHasBall = true;
    }

    this.updateStageMarkers();

    // STEAL CHIPS: runners on 1st/3rd sit outside the kick framing — pin a
    // tappable chip per eligible runner instead (setStealChips dedupes).
    const chipsOn = (this.phase === 'SETUP' || this.phase === 'PITCH')
      && this.kickingIsPlayer() && !this.stealing && !this.cinematicLock && !this.playFinalized
      && !this.walkup; // no free bag while the kicker is still walking out
    const chips = [];
    if (chipsOn && this.baseChars) {
      for (let b = 0; b < 3; b++) {
        if (this.baseChars[b] && (b === 2 || this.match.state.bases[b + 1] === null)) chips.push(b);
      }
    }
    this.hud.setStealChips(chips);
    this.hud.setStealHot(chips.length > 0 && (this.stealHot || this.elementStealWindow()));

    // BROADCAST CAMERA: matchScene picks the shot for the situation; the
    // CameraDirector spring-damps toward it (and handles the contact CUT).
    if (!this.engine.cameraLock) {
      this.camDir.setBaseFov(this.engine.baseFov ?? 58);
      const pkR = this.duel?.r ?? null;
      this.pickleCam = (pkR && pkR.state === 'running' && (this.phase === 'LIVE' || this.phase === 'RESOLVE')) ? pkR : null;
      if (this.pickleCam) {
        this.camDir.request('pickle', this.camCtx(), { cut: !this._pkCamOn });
        this._pkCamOn = true;
      } else if (this._pkCamOn) {
        this._pkCamOn = false;
      }
      if (this.pickleCam) {
        // the PICKLE STAGE owns the lens
      } else if (this.phase === 'LIVE' || this.phase === 'RESOLVE' || this.phase === 'FOUL') {
        const trailBall = this.ball.mode === 'flying' && this.elapsed < (this.ballCamUntil ?? 0);
        const dist = Math.hypot(this.ball.pos.x, this.ball.pos.z);
        this.camDir.request(chooseLiveShot({
          phase: this.phase,
          kickingIsPlayer: this.kickingIsPlayer(),
          trailBall,
          deepBall: dist > this.fenceM * 0.55,
          runnerHome: this.runners.some((r) => r.state === 'running' && r.targetBase === 3),
        }), this.camCtx());
      } else if (this.walkup) {
        this.camDir.request(this.walkup.phase === 'taunt' ? 'walkupTaunt' : 'walkupDolly', this.camCtx(), { cut: this.walkup.cut });
        this.walkup.cut = false;
      } else if (this.camTarget === CAM.pitch) {
        this.camDir.request('pitchSelect', this.camCtx());
      } else {
        this.camDir.request('kick', this.camCtx());
      }
      this.camDir.update(rawDt, this.camCtx());
    }

    // record for instant replays — never WHILE one is playing back
    if (!this.cinematicLock) this.replayRecorder.capture(this.elapsed);

    // pulse the base target rings
    if (this.baseRings[0].visible) {
      const s = 1 + Math.sin(this.elapsed * 6) * 0.12;
      for (const r of this.baseRings) r.scale.setScalar(s);
    }

    this.updateRunnerArrows();
    this.updateRunnerDots();
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
    this.engine.scene.remove(this.field.root, this.ball.mesh);
    for (const c of [...this.chars.home, ...this.chars.away]) this.engine.scene.remove(c.group);
    // every mesh this scene OWNS: off the graph and its GPU buffers freed —
    // a rematch builds a fresh scene, so leaked geo/materials just pile up
    const drop = (m) => {
      if (!m) return;
      this.engine.scene.remove(m);
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    };
    for (const t of this.trailPool) drop(t.mesh);
    drop(this.cleatRing);
    drop(this.marker);
    drop(this.fielderRing);
    for (const r of this.baseRings ?? []) drop(r);
    drop(this.youRing);
  }
}
