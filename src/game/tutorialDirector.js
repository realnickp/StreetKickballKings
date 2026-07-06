// PLAYABLE TUTORIAL — a skill-drill gauntlet on the real engine (no fake sim).
// One skill at a time, each with a GOAL the player must hit before advancing.
// UX: every drill opens with a full-screen INTRO SLAM (big title + one clear
// sentence), a slim objective RIBBON with progress pips rides under the score
// bug during play, and animated COACH CALLOUTS pop at the exact moment and
// PLACE a control matters (over the meter, on the GO button, at your runner).
// Skippable per-drill and entirely.

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// A drill = { id, title, objective (ribbon), detail (intro sentence), target,
// setup?, ensure?, teardown?, tick(scene, st) -> true per goal unit,
// coach?(scene, st, say) -> fire contextual callouts (say(text, opts)) }.
export const DRILLS = [
  {
    id: 'kick',
    demo: `
      <div class="tut-stage di-demo">
        <div class="tut-meter"><i class="tut-meter-sweet"></i><i class="tut-meter-fill"></i></div>
        <div class="dm-finger dm-slideflick">👆</div>
      </div>`,
    title: 'KICKING',
    objective: 'KICK 2 FAIR BALLS',
    detail: 'Slide left or right to line up. FLICK UP right as the meter peaks — perfect timing is 🔥.',
    target: 2,
    tick(s, st) {
      if (s.phase === 'LIVE') {
        if (!st.counted) { st.counted = true; return true; }
      } else if (s.phase !== 'RESOLVE') {
        st.counted = false;
      }
      return false;
    },
    coach(s, st, say) {
      if (s.phase === 'PITCH' && s.hud.powerMeter.classList.contains('show')) {
        say('FLICK UP AT THE PEAK!', { el: s.hud.powerMeter, dir: 'down', key: 'kick-flick', ttl: 1500 });
      }
    },
  },
  {
    id: 'run',
    demo: `
      <div class="tut-stage di-demo">
        <div class="tut-diamond"><i class="d1"></i><i class="d2"></i><i class="d3"></i><i class="dh"></i></div>
        <div class="dm-finger dm-mash">👇<span></span></div>
      </div>`,
    title: 'RUNNING',
    objective: 'BEAT THE THROW TO FIRST',
    detail: 'The second you kick it — MASH-TAP anywhere to sprint. No taps, no legs.',
    target: 1,
    setup(s) { s.tutorialNoCatch = true; },   // a catch bypasses the lesson
    teardown(s) { s.tutorialNoCatch = false; },
    tick(s) {
      const kr = s.runners.find((r) => r.char === s.kicker);
      return !!kr && (kr.state === 'held' || kr.state === 'scored');
    },
    coach(s, st, say) {
      if (s.phase === 'LIVE') {
        const H = s.hud.el.getBoundingClientRect();
        say('MASH! TAP TAP TAP!', { x: H.left + H.width / 2, y: H.top + H.height * 0.62, dir: 'down', key: 'run-mash', ttl: 1600 });
      }
    },
  },
  {
    id: 'steal',
    demo: `
      <div class="tut-stage di-demo">
        <button class="tut-pill teal dm-chip">🏃 STEAL 2ND</button>
        <div class="dm-finger dm-tap-go">👆</div>
      </div>`,
    title: 'STEALING',
    objective: 'STEAL SECOND BASE',
    detail: 'You’ve got a man on first. TAP the STEAL 2ND chip while the pitch rolls in — then mash.',
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
    coach(s, st, say) {
      if (s.stealing || s.phase === 'LIVE') return;
      const chip = s.hud.el.querySelector('.steal-chip');
      if (chip) say('TAP TO STEAL!', { el: chip, dir: 'down', key: 'steal-tap', ttl: 1500 });
    },
  },
  {
    id: 'go',
    demo: `
      <div class="tut-stage di-demo">
        <button class="tut-pill teal dm-go">GO FOR 2!</button>
        <button class="tut-pill amber small">GO!</button>
        <div class="dm-finger dm-tap-go">👆</div>
      </div>`,
    title: 'EXTRA BASES & THE DUEL',
    objective: 'SURVIVE THE PICKLE — SMASH GO!',
    detail: 'Kick, take first, hit GO FOR 2! You WILL get trapped — the DUEL starts. Your man runs HIMSELF. When the ball flies between fielders, SMASH the gold GO! button. Tagger lunges or winds up a peg? SWIPE UP to spin.',
    target: 1,
    setup(s) {
      s.match.state.bases = [null, null, null]; // clean diamond for the lesson
      s.tutorialGo = true;                      // the GO button always offers here
      s.tutorialNoCatch = true;                 // no catches and no homers —
      s.tutorialNoHomer = true;                 // we're here to do the damn pickle
      s.nextAtBat();                            // clear any leftover base runner chars
    },
    teardown(s) { s.tutorialGo = false; s.tutorialNoCatch = false; s.tutorialNoHomer = false; },
    tick(s, st) {
      if (st.goSentFlag?.()) st.sent = true;
      if (st.sent && !st.trapped) {
        // stage the rundown mid-leg so the duel ALWAYS happens (the lesson)
        const r = s.runners.find((x) => x.state === 'running' && x.fromBase >= 0 && !x.forced);
        if (r && r.sim.progressM > s.tuning.running.basePathM * 0.3 && !s.duel) {
          s.startRundown(r, r.targetBase);
          st.trapped = true;
        }
      }
      if (st.trapped) {
        if (st.sawDuel && !s.duel) {
          const r = s.runners.find((x) => x.state === 'held' || x.state === 'scored');
          if (r) return true;            // escaped — safe on a bag
          st.sent = st.trapped = st.sawDuel = st.taughtGo = st.taughtSpin = false; // tagged — run it back
        }
        if (s.duel) st.sawDuel = true;
      }
      return false;
    },
    coach(s, st, say) {
      if (s.goOffer && !st.sent) {
        say('HIT IT!', { el: s.hud.goBtn, dir: 'down', key: 'go-hit', ttl: 1400 });
      }
      if (s.duel && s.kickingIsPlayer()) {
        // teach each verb AT its moment — never all at once
        if (s.duel.throwInfo && s.duel.throwInfo.toEnd !== -1 && !st.taughtGo) {
          st.taughtGo = true;
          say("BALL'S UP — HIT GO!", { el: s.hud.duelBtn, dir: 'up', key: 'duel-go', ttl: 2200 });
        }
        const holder = s.fieldingChars().find((c) => c.hasBall);
        const close = holder && s.duel.r?.char && holder.group.position.distanceTo(s.duel.r.char.group.position) < 3.0;
        if ((s.duel.brain.pegWindupT > 0 || close) && !st.taughtSpin) {
          st.taughtSpin = true;
          say('SWIPE UP — SPIN!', { x: centerX(s), y: midY(s), dir: 'down', key: 'duel-spin', ttl: 2200 });
        }
      }
    },
  },
  {
    id: 'pitch',
    demo: `
      <div class="tut-stage di-demo">
        <svg class="tut-trace" viewBox="0 0 100 44"><polyline points="6,38 30,10 52,34 74,8 94,30" /></svg>
        <div class="dm-finger dm-trace">👆</div>
      </div>`,
    title: 'PITCHING',
    objective: 'DELIVER 2 PITCHES',
    detail: 'Your arm now. Pick a pitch, then TRACE the pattern — fast, tight strokes. Sloppy = meatball.',
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
    coach(s, st, say) {
      if (s.phase === 'PITCH_SELECT') say('PICK ONE', { el: s.hud.pitchSelect, dir: 'down', key: 'pt-pick', ttl: 1500 });
      if (s.phase === 'PITCH_TRACE') say('TRACE IT — FAST!', { el: s.hud.patternPad, dir: 'down', key: 'pt-trace', ttl: 1500 });
    },
  },
  {
    id: 'field',
    demo: `
      <div class="tut-stage di-demo">
        <div class="tut-pad">
          <b class="p2"><span>2ND</span></b><b class="p3"><span>3RD</span></b><b class="p1"><span>1ST</span></b><b class="ph"><span>HOME</span></b><b class="peg"><span>PEG</span></b>
        </div>
        <div class="dm-finger dm-tap-gold">👆</div>
      </div>`,
    title: 'FIELDING',
    objective: 'GET AN OUT',
    detail: 'DRAG steers your glowing fielder, TAP a teammate to switch. Ball in hand → hit the GOLD bag. Trap a runner between bags and the DUEL flips: time THROW! to catch him leaning — or SWIPE at him to PEG.',
    target: 1,
    setup(s, st) { st.base = outsNow(s); },
    tick(s, st) {
      const cur = outsNow(s);
      if (cur > (st.base ?? 0)) { st.base = cur; return true; }
      st.base = Math.min(st.base ?? 0, cur); // outs reset (half rolled) — track down too
      return false;
    },
    coach(s, st, say) {
      if (s.phase === 'LIVE' && !s.defenseHasBall) {
        const H = s.hud.el.getBoundingClientRect();
        say('DRAG TO STEER!', { x: H.left + H.width / 2, y: H.top + H.height * 0.6, dir: 'down', key: 'fd-drag', ttl: 1600 });
      }
      if (s.hud.throwPad.classList.contains('show')) {
        say('GOLD BAG = THE OUT', { el: s.hud.throwPad, dir: 'down', key: 'fd-gold', ttl: 1600 });
      }
      if (s.duel && !s.kickingIsPlayer() && !st.taughtThrow) {
        st.taughtThrow = true; // opportunistic — defense pickles are organic
        say('HE BREAKS — THROW!', { el: s.hud.duelBtn, dir: 'up', key: 'duel-throw', ttl: 2200 });
      }
    },
  },
];

const outsNow = (s) => (s.match?.state?.outs ?? 0) + (s.playOuts ?? 0);
const centerX = (s) => { const H = s.hud.el.getBoundingClientRect(); return H.left + H.width / 2; };
const midY = (s) => { const H = s.hud.el.getBoundingClientRect(); return H.top + H.height * 0.46; };

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
const SETTLED = new Set(['SETUP', 'PITCH_SELECT', 'IDLE']); // never mutate mid-pitch — a half-flip during a rolling serve strands it

export class TutorialDirector {
  constructor({ scene, engine, bus, save, onExit }) {
    this.scene = scene;
    this.engine = engine;
    this.bus = bus;
    this.save = save;
    this.onExit = onExit;
    this.idx = -1;
    this.progress = 0;
    this.st = {};
    this.pendingSetup = false;
    this.introUp = false;
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
        <div class="drill-ribbon">
          <b class="drill-no"></b>
          <span class="drill-obj"></span>
          <div class="drill-pips"></div>
        </div>
        <div class="drill-actions">
          <button class="drill-skip">SKIP DRILL ›</button>
          <button class="drill-exit">✕ EXIT</button>
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
    // a SKIPPED drill still owes its world transition (e.g. PITCHING flips
    // the half) — run the pending setup before moving on or later drills
    // inherit a stranded world
    if (this.pendingSetup) {
      this.drill()?.setup?.(this.scene, this.st);
      this.pendingSetup = false;
    }
    this.drill()?.teardown?.(this.scene);
    this.scene.hud.clearCallouts();
    this.idx += 1;
    if (this.idx >= DRILLS.length) return this.finish();
    this.progress = 0;
    this.awaiting = false;
    this.completeAt = 0;
    this.nextAt = 0;
    this.st = { goSentFlag: () => { const v = this.goSent; this.goSent = false; return v; } };
    this.pendingSetup = !!this.drill().setup;
    this.render();
    this.showIntro(this.drill());
    this.bus.emit('sfx', 'scratch');
  }

  /** Full-screen INTRO GATE: world FROZEN behind the blur, the gesture demo
   *  loops, and NOTHING starts until the player presses START. */
  showIntro(d) {
    this.intro?.remove();
    this.introUp = true;
    this.engine.paused = true; // freeze gameplay — rendering keeps going
    const box = el(`
      <div class="drill-intro">
        <div class="di-card">
          <small>DRILL ${this.idx + 1} OF ${DRILLS.length}</small>
          <h2>${d.title}</h2>
          ${d.demo ?? ''}
          <p>${d.detail}</p>
          <button class="di-start">▶ START</button>
          <div class="di-links">
            <button class="di-skip">skip drill ›</button>
            <button class="di-exit">✕ exit tutorial</button>
          </div>
        </div>
      </div>`);
    this.scene.hud.el.appendChild(box);
    this.intro = box;
    const dismiss = () => {
      if (!this.introUp) return;
      this.introUp = false;
      this.engine.paused = false; // play ball
      box.classList.add('bye');
      setTimeout(() => box.remove(), 320);
    };
    box.querySelector('.di-start').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.bus.emit('sfx', 'scratch');
      dismiss();
    });
    box.querySelector('.di-skip').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.completeDrill(true); // next intro takes over (stays paused)
    });
    box.querySelector('.di-exit').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.exit();
    });
  }

  render() {
    const d = this.drill();
    if (!d) return;
    this.root.querySelector('.drill-no').textContent = `${this.idx + 1}/${DRILLS.length}`;
    this.root.querySelector('.drill-obj').textContent = d.objective;
    this.root.querySelector('.drill-pips').innerHTML =
      Array.from({ length: d.target }, (_, i) => `<i class="${i < this.progress ? 'on' : ''}"></i>`).join('');
  }

  completeDrill(skipped = false) {
    if (this.finished) return;
    if (skipped) return this.nextDrill(); // intro card handles the transition
    this.scene.hud.call('DRILL COMPLETE!', 'crowned');
    this.bus.emit('sfx', 'crowd-cheer');
    this.nextAt = this.elapsed + 1.4; // soak the moment before the next intro
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    // finishing from a skip cascade happens UNDER an intro card — unfreeze,
    // or the frame loop (and our own auto-exit timer) never runs again
    this.intro?.remove();
    this.introUp = false;
    this.engine.paused = false;
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
    if (!d || this.introUp) return; // read first, play after

    const settled = SETTLED.has(s.phase) && !s.cinematicLock && !s.playFinalized;

    // goal reached: wait for the play to fully resolve, breathe, THEN wrap
    if (this.awaiting || this.nextAt) {
      if (this.nextAt) {
        if (this.elapsed >= this.nextAt) { this.nextAt = 0; this.nextDrill(); }
        return;
      }
      if (settled) {
        if (!this.completeAt) this.completeAt = this.elapsed + 0.8;
        if (this.elapsed >= this.completeAt) {
          this.awaiting = false;
          this.completeAt = 0;
          this.completeDrill();
        }
      } else {
        this.completeAt = 0;
      }
      return;
    }
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

    // contextual coach callouts — the right words at the right place & moment
    if (!s.cinematicLock) d.coach?.(s, this.st, (text, opts) => s.hud.callout(text, opts));

    if (d.tick(s, this.st)) {
      this.progress += 1;
      this.render();
      this.bus.emit('sfx', 'catchpop');
      if (this.progress >= d.target) {
        s.hud.goalPop('GOAL ✓');
        this.awaiting = true; // let the play FINISH — no abrupt cut to the next drill
      } else {
        s.hud.goalPop(`✓ ${this.progress}/${d.target}`);
      }
    }
  }

  destroy() {
    this.engine.paused = false; // never leave the world frozen
    this.offFrame?.();
    this.offFrame = null;
    this.scene.sendHeldRunner = this.origSend;
    this.scene.tutorialGo = false;
    this.scene.tutorialQuiet = false;
    this.scene.tutorialNoCatch = false;
    this.scene.tutorialNoHomer = false;
    this.scene.hud.clearCallouts?.();
    this.intro?.remove();
    this.root.remove();
  }
}
