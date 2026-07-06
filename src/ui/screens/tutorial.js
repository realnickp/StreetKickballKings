// HOW TO PLAY — swipeable card carousel teaching every control with CSS-drawn
// demos that mimic the real HUD (meter, GO/SLIDE pills, throw pad). Auto-shown
// once before the first match (save key 'tutorialSeen'); always reachable from
// the menu. Pure DOM — no assets, no engine.

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Each page: title, a CSS demo block, and short punchy lines. Demos reuse the
// game's visual language so the real HUD feels familiar on first contact.
export const TUTORIAL_PAGES = [
  {
    title: 'KICKING',
    demo: `
      <div class="tut-stage">
        <div class="tut-meter"><i class="tut-meter-sweet"></i><i class="tut-meter-fill"></i></div>
        <div class="tut-gesture tut-flick">👆</div>
      </div>`,
    lines: [
      '<b>SLIDE</b> your kicker left or right to line up under the pitch.',
      'Watch the meter climb — <b>FLICK UP</b> right as it peaks. Perfect timing = 🔥 off the foot.',
      'Angle your flick to place the ball. Short and low works too — bunt life.',
    ],
  },
  {
    title: 'RUNNING',
    demo: `
      <div class="tut-stage">
        <div class="tut-diamond"><i class="d1"></i><i class="d2"></i><i class="d3"></i><i class="dh"></i></div>
        <div class="tut-gesture tut-mash">👇<span></span></div>
      </div>`,
    lines: [
      '<b>MASH-TAP</b> anywhere to sprint. No taps, no legs — he stops.',
      'Runners hold at the bag on their own.',
      'Mid-run, <b>swipe left / right</b> to JUKE an incoming peg.',
    ],
  },
  {
    title: 'EXTRA BASES',
    demo: `
      <div class="tut-stage">
        <button class="tut-pill teal">GO FOR 2!</button>
        <button class="tut-pill amber small">GO FOR 3!</button>
      </div>`,
    lines: [
      'When the next bag is takeable, the <b>GO</b> button pops. No button? Don’t even think about it.',
      '<b>TEAL</b> = clean take. <b>AMBER</b> = it’s a race… and races end in pickles.',
      'Before the pitch, <b>tap one of your runners</b> to send him STEALING.',
    ],
  },
  {
    title: 'THE PICKLE — THE DUEL',
    demo: `
      <div class="tut-stage">
        <button class="tut-pill amber">GO!</button>
        <div class="tut-arrows"><span class="up">⤒</span></div>
      </div>`,
    lines: [
      'Trapped between bags? Your man runs <b>himself</b> — you make the calls.',
      '<b>Ball in the air → smash GO!</b> He breaks the right way automatically.',
      'Tagger lunges or winds up a peg? <b>SWIPE UP = SPIN.</b> Escape forward = JACKPOT.',
    ],
  },
  {
    title: 'FIELDING',
    demo: `
      <div class="tut-stage">
        <div class="tut-pad">
          <b class="p2"><span>2ND</span></b><b class="p3"><span>3RD</span></b><b class="p1"><span>1ST</span></b><b class="ph"><span>HOME</span></b><b class="peg"><span>PEG</span></b>
        </div>
      </div>`,
    lines: [
      'Your glowing fielder <b>auto-chases</b>. DRAG to steer him. <b>TAP a teammate</b> to take over.',
      'Ball secured → the throw pad. The <b>GOLD bag</b> is the force out. <b>PEG</b> smokes the lead runner.',
      'Trap a runner and the DUEL flips: <b>THROW!</b> catches him leaning, <b>SWIPE at him</b> = PEG.',
    ],
  },
  {
    title: 'PITCH & THE CROWN',
    demo: `
      <div class="tut-stage">
        <svg class="tut-trace" viewBox="0 0 100 44"><polyline points="6,38 30,10 52,34 74,8 94,30" /></svg>
        <div class="tut-crown">👑</div>
      </div>`,
    lines: [
      'On the mound: pick a pitch, then <b>TRACE the pattern</b> — fast, clean strokes.',
      'A sloppy trace is a meatball floating over the plate.',
      'Big plays fill the 👑 meter. Arm it and your next clean kick is a <b>CROWNED super-shot</b>.',
    ],
  },
];

export function TutorialScreen(ctx) {
  let cleanup = null;
  return {
    mount(root, params = {}) {
      const next = params.next ?? null; // route to continue to (first-run flow)
      let page = 0;

      const s = el(`
        <div class="screen tutorial-screen">
          <div class="tut-top">
            <h2>HOW TO PLAY</h2>
            <button class="tut-skip">${next ? 'SKIP' : 'CLOSE'}</button>
          </div>
          <div class="tut-card">
            <h3 class="tut-title"></h3>
            <div class="tut-demo"></div>
            <div class="tut-lines"></div>
          </div>
          <div class="tut-dots">${TUTORIAL_PAGES.map(() => '<i></i>').join('')}</div>
          <div class="tut-nav">
            <button class="tut-prev">‹ BACK</button>
            <button class="tut-next">NEXT ›</button>
          </div>
        </div>`);
      root.appendChild(s);

      const titleEl = s.querySelector('.tut-title');
      const demoEl = s.querySelector('.tut-demo');
      const linesEl = s.querySelector('.tut-lines');
      const dots = [...s.querySelectorAll('.tut-dots i')];
      const prevBtn = s.querySelector('.tut-prev');
      const nextBtn = s.querySelector('.tut-next');
      const card = s.querySelector('.tut-card');

      const done = () => {
        ctx.save.set('tutorialSeen', true);
        ctx.bus.emit('sfx', 'scratch');
        ctx.router.go(next ?? 'menu');
      };

      const render = () => {
        const p = TUTORIAL_PAGES[page];
        titleEl.textContent = p.title;
        demoEl.innerHTML = p.demo;
        linesEl.innerHTML = p.lines.map((l) => `<p>${l}</p>`).join('');
        dots.forEach((d, i) => d.classList.toggle('on', i === page));
        prevBtn.style.visibility = page === 0 ? 'hidden' : 'visible';
        nextBtn.textContent = page === TUTORIAL_PAGES.length - 1 ? (next ? 'LET’S PLAY ▶' : 'DONE ✓') : 'NEXT ›';
        card.classList.remove('slide-in');
        void card.offsetWidth; // re-fire the entrance animation
        card.classList.add('slide-in');
      };

      const go = (d) => {
        const to = page + d;
        if (to < 0) return;
        if (to >= TUTORIAL_PAGES.length) return done();
        page = to;
        ctx.bus.emit('sfx', 'juke');
        render();
      };

      nextBtn.addEventListener('pointerdown', () => go(1));
      prevBtn.addEventListener('pointerdown', () => go(-1));
      s.querySelector('.tut-skip').addEventListener('pointerdown', done);

      // swipe between cards (the gesture the whole game runs on)
      let downX = null;
      const onDown = (e) => { downX = e.clientX; };
      const onUp = (e) => {
        if (downX === null) return;
        const dx = e.clientX - downX;
        downX = null;
        if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
      };
      card.addEventListener('pointerdown', onDown);
      card.addEventListener('pointerup', onUp);
      cleanup = () => {
        card.removeEventListener('pointerdown', onDown);
        card.removeEventListener('pointerup', onUp);
      };

      render();
    },
    unmount() {
      cleanup?.();
    },
  };
}
