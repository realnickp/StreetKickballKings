// PLAYABLE TUTORIAL — a skill-drill gauntlet on the real engine (no fake sim).
// One skill at a time, each with a GOAL the player must hit before advancing:
// kick fair balls, beat out a single, steal second, take the extra base and
// survive the pickle, trace clean pitches, field for an out. The director
// watches the live MatchScene every frame, scores goal progress, re-arms the
// scenario after failed attempts, and force-stages the moments that RNG can't
// guarantee (the GO offer, the rundown). Skippable per-drill and entirely.

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// A drill = { id, title, goal, target, setup?, ensure?, tick }.
// tick(scene, st) returns true each time the player scores ONE goal unit.
// `st` is per-drill scratch state (reset when the drill starts).
// setup runs once at a settle point; ensure re-runs at every new at-bat.
export const DRILLS = [
  {
    id: 'kick',
    title: 'KICKING',
    goal: 'Slide to line up — FLICK UP at the meter peak. Kick 2 fair balls.',
    target: 2,
    tick(s, st) {
      if (s.phase === 'LIVE') {
        if (!st.counted) { st.counted = true; return true; }
      } else if (s.phase !== 'RESOLVE') {
        st.counted = false;
      }
      return false;
    },
  },
  {
    id: 'run',
    title: 'RUNNING',
    goal: 'Kick, then MASH-TAP to sprint. Beat the throw to first!',
    target: 1,
    tick(s) {
      const kr = s.runners.find((r) => r.char === s.kicker);
      return !!kr && (kr.state === 'held' || kr.state === 'scored');
    },
  },
  {
    id: 'steal',
    title: 'STEALING',
    goal: 'You have a man on first. TAP HIM during the pitch — steal second!',
    target: 1,
    setup(s) { ensureRunnerOn(s, 0); },
    // idempotent — re-arms after a caught-stealing wipes the runner
    ensure(s) { if (!s.stealing && !s.stealResolving) ensureRunnerOn(s, 0); },
    tick(s, st) {
      if (s.stealing) st.started = true;
      if (st.started && !s.stealing && !s.stealResolving) {
        if (s.match.state.bases[1] !== null) return true; // he's standing on 2nd
        st.started = false; // thrown out — reset and go again
      }
      return false;
    },
  },
  {
    id: 'go',
    title: 'EXTRA BASES & THE PICKLE',
    goal: 'Kick, take first, then hit GO FOR 2! You WILL get hung up — spin, reverse, SLIDE, survive.',
    target: 1,
    setup(s) {
      s.match.state.bases = [null, null, null]; // clean diamond for the lesson
      s.tutorialGo = true;                      // the GO button always offers here
      s.nextAtBat();                            // clear any leftover base runner chars
    },
    teardown(s) { s.tutorialGo = false; },
    tick(s, st) {
      if (st.goSentFlag?.()) st.sent = true;
      if (st.sent && !st.trapped) {
        // stage the rundown mid-leg so the pickle ALWAYS happens (the lesson)
        const r = s.runners.find((x) => x.state === 'running' && x.fromBase >= 0 && !x.forced);
        if (r && r.sim.progressM > s.tuning.running.basePathM * 0.3 && !s.pickle) {
          s.startRundown(r, r.targetBase);
          st.trapped = true;
        }
      }
      if (st.trapped) {
        if (st.sawPickle && !s.pickle) {
          const r = s.runners.find((x) => x.state === 'held' || x.state === 'scored');
          if (r) return true;            // escaped — safe on a bag
          st.sent = st.trapped = st.sawPickle = false; // tagged — run it back
        }
        if (s.pickle) st.sawPickle = true;
      }
      return false;
    },
  },
  {
    id: 'pitch',
    title: 'PITCHING',
    goal: 'Your arm now. Pick a pitch, then TRACE the pattern — fast and clean. Deliver 2.',
    target: 2,
    setup(s) { flipToDefense(s); },
    tick(s, st) {
      if (s.phase === 'PITCH' && !s.kickingIsPlayer()) {
        if (!st.counted) { st.counted = true; return true; }
      } else if (s.phase === 'PITCH_SELECT' || s.phase === 'SETUP') {
        st.counted = false;
      }
      return false;
    },
  },
  {
    id: 'field',
    title: 'FIELDING',
    goal: 'He kicks — DRAG your glowing fielder, TAP teammates to switch, throw the GOLD bag. Get an out!',
    target: 1,
    setup(s, st) { st.base = outsNow(s); },
    tick(s, st) {
      const cur = outsNow(s);
      if (cur > (st.base ?? 0)) { st.base = cur; return true; }
      st.base = Math.min(st.base ?? 0, cur); // outs reset (half rolled) — track down too
      return false;
    },
  },
];

const outsNow = (s) => (s.match?.state?.outs ?? 0) + (s.playOuts ?? 0);

function ensureRunnerOn(s, bag) {
  if (s.match.state.bases[bag] !== null) return;
  s.match.state.bases[bag] = (s.match.currentKickerIdx() + 7) % 8; // a teammate, not the kicker
  s.nextAtBat(); // re-place base chars with the runner standing out there
}

function flipToDefense(s) {
  if (!s.kickingIsPlayer()) return;
  s.match.endHalf(); // flips the half, zeroes outs, clears bases
  s.nextAtBat();
}

// phases where it's safe to mutate match state / advance drills
const SETTLED = new Set(['SETUP', 'PITCH', 'PITCH_SELECT', 'IDLE']);

export class TutorialDirector {
  constructor({ scene, engine, bus, save, onExit }) {
    this.scene = scene;
    this.bus = bus;
    this.save = save;
    this.onExit = onExit;
    this.idx = -1;
    this.progress = 0;
    this.st = {};
    this.pendingSetup = false;
    this.advanceAt = 0;
    this.elapsed = 0;
    this.finished = false;

    // flag GO presses for the extra-bases drill without touching scene code
    this.goSent = false;
    this.origSend = scene.sendHeldRunner.bind(scene);
    scene.sendHeldRunner = () => {
      const had = scene.goOffer?.r;
      this.origSend();
      if (had) this.goSent = true;
    };
    scene.tutorialQuiet = true; // no surprise AI steals mid-lesson

    this.root = el(`
      <div class="drill-layer">
        <div class="drill-card">
          <b class="drill-title"></b>
          <span class="drill-goal"></span>
          <div class="drill-pips"></div>
        </div>
        <div class="drill-actions">
          <button class="drill-skip">SKIP DRILL ›</button>
          <button class="drill-exit">✕ EXIT TUTORIAL</button>
        </div>
      </div>`);
    scene.hud.el.appendChild(this.root);
    this.root.querySelector('.drill-skip').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.completeDrill(true);
    });
    this.root.querySelector('.drill-exit').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.exit();
    });

    this.offFrame = engine.onFrame((dt) => this.update(dt));
    this.nextDrill();
  }

  drill() { return DRILLS[this.idx]; }

  nextDrill() {
    this.drill()?.teardown?.(this.scene);
    this.idx += 1;
    if (this.idx >= DRILLS.length) return this.finish();
    this.progress = 0;
    this.st = { goSentFlag: () => { const v = this.goSent; this.goSent = false; return v; } };
    this.pendingSetup = !!this.drill().setup;
    this.lastKickerIdx = null;
    this.render();
    this.bus.emit('sfx', 'scratch');
  }

  render() {
    const d = this.drill();
    if (!d) return;
    this.root.querySelector('.drill-title').textContent = `DRILL ${this.idx + 1}/${DRILLS.length} — ${d.title}`;
    this.root.querySelector('.drill-goal').textContent = d.goal;
    this.root.querySelector('.drill-pips').innerHTML =
      Array.from({ length: d.target }, (_, i) => `<i class="${i < this.progress ? 'on' : ''}"></i>`).join('');
  }

  completeDrill(skipped = false) {
    if (this.finished) return;
    if (!skipped) {
      this.scene.hud.call('DRILL COMPLETE!', 'crowned');
      this.bus.emit('sfx', 'crowd-cheer');
    }
    this.nextDrill();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.save.set('tutorialPlayed', true);
    this.scene.hud.banner('YOU’RE READY. RUN THE STREETS 👑', 'homer', { autoHideMs: 2400 });
    this.bus.emit('sfx', 'crowd-cheer');
    this.advanceAt = this.elapsed + 2.6;
  }

  exit() {
    this.save.set('tutorialPlayed', true); // skipping counts as seen — never force again
    this.destroy();
    this.onExit?.();
  }

  update(dt) {
    this.elapsed += dt;
    const s = this.scene;
    if (this.finished) {
      if (this.elapsed >= this.advanceAt) { this.destroy(); this.onExit?.(); }
      return;
    }
    const d = this.drill();
    if (!d) return;

    const settled = SETTLED.has(s.phase) && !s.cinematicLock && !s.playFinalized;
    if (this.pendingSetup) {
      if (!settled) return;
      d.setup?.(s, this.st);
      this.pendingSetup = false;
      this.render();
      return;
    }
    // re-arm scenario preconditions whenever the field is settled (retry loops);
    // ensure() implementations are idempotent so this is safe every frame
    if (d.ensure && settled) d.ensure(s, this.st);

    if (d.tick(s, this.st)) {
      this.progress += 1;
      this.render();
      if (this.progress >= d.target) {
        this.completeDrill();
      } else {
        s.hud.call('✓ ONE MORE!', 'robbed');
        this.bus.emit('sfx', 'catchpop');
      }
    }
  }

  destroy() {
    this.offFrame?.();
    this.offFrame = null;
    this.scene.sendHeldRunner = this.origSend;
    this.scene.tutorialGo = false;
    this.scene.tutorialQuiet = false;
    this.root.remove();
  }
}
