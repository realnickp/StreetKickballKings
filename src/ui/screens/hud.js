// Match HUD: LED score bug, pitch readout, timing ring, pitch picker + pattern
// pad (PITCH role), run hint, throw pad, special button, graffiti stamps.
// Pure DOM; matchScene drives it.
import { PITCH_MENU } from '../../game/pitchPattern.js';

export class Hud {
  constructor(root, { homeAbbr, awayAbbr }) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="score-bug">
        <div class="team"><span class="abbr" data-abbr-away></span><span class="runs" data-away>0</span></div>
        <div class="mid">
          <span class="inning" data-inning>▲ 1</span>
          <span class="outs"><i></i><i></i><i></i></span>
          <span class="diamond"><b data-b="1"></b><b data-b="2"></b><b data-b="3"></b></span>
        </div>
        <div class="team"><span class="abbr" data-abbr-home></span><span class="runs" data-home>0</span></div>
      </div>
      <div class="pitch-readout"><span class="type"></span> <span class="mph"></span></div>
      <div class="timing-ring"><div class="ring"></div><div class="target"></div></div>
      <div class="aim-bar">
        <button data-aim="left">LEFT</button>
        <button data-aim="center" class="on">CENTER</button>
        <button data-aim="right">RIGHT</button>
        <button data-aim="bunt">BUNT</button>
      </div>
      <div class="action-hint"></div>
      <svg class="pattern-pad" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline class="pat-ref" />
        <polyline class="pat-trace" />
        <circle class="pat-start" r="3.4" />
        <circle class="pat-end" r="3.0" />
      </svg>
      <div class="pitch-select"></div>
      <div class="throw-pad">
        <button class="t-2" data-base="1"><span>2ND</span></button>
        <button class="t-3" data-base="2"><span>3RD</span></button>
        <button class="t-1" data-base="0"><span>1ST</span></button>
        <button class="t-h" data-base="3"><span>HOME</span></button>
        <button class="t-peg" data-peg><span>PEG</span></button>
      </div>
      <div class="special-btn"><div class="core">👑</div></div>
    `;
    root.appendChild(this.el);
    this.el.querySelector('[data-abbr-away]').textContent = awayAbbr;
    this.el.querySelector('[data-abbr-home]').textContent = homeAbbr;

    // comic-panel speed-line overlay (shown during in-engine comic moments)
    this.speedLines = document.createElement('div');
    this.speedLines.className = 'speed-lines';
    this.el.appendChild(this.speedLines);

    this.scoreEls = {
      away: this.el.querySelector('[data-away]'),
      home: this.el.querySelector('[data-home]'),
    };
    this.inningEl = this.el.querySelector('[data-inning]');
    this.outDots = [...this.el.querySelectorAll('.outs i')];
    this.pitchEl = this.el.querySelector('.pitch-readout');
    this.ringEl = this.el.querySelector('.timing-ring');
    this.ringInner = this.ringEl.querySelector('.ring');
    this.aimBar = this.el.querySelector('.aim-bar');
    this.aimBar.style.display = 'none'; // M1: aim comes from the kick swipe, never the buttons
    this.hintEl = this.el.querySelector('.action-hint');
    this.throwPad = this.el.querySelector('.throw-pad');
    this.specialBtn = this.el.querySelector('.special-btn');

    // pitch picker (PITCH role) — 5 colour-coded buttons built from the menu
    this.pitchSelect = this.el.querySelector('.pitch-select');
    for (const p of PITCH_MENU) {
      const b = document.createElement('button');
      b.dataset.pitch = p.id;
      b.style.setProperty('--pc', p.color);
      b.textContent = p.label;
      this.pitchSelect.appendChild(b);
    }
    // pattern pad (reference shape + live trace)
    this.patternPad = this.el.querySelector('.pattern-pad');
    this.patRef = this.patternPad.querySelector('.pat-ref');
    this.patTrace = this.patternPad.querySelector('.pat-trace');
    this.patStart = this.patternPad.querySelector('.pat-start');
    this.patEnd = this.patternPad.querySelector('.pat-end');

    this.onAim = null;
    this.onThrow = null;
    this.onSpecial = null;
    this.onPitchSelect = null;

    this.pitchSelect.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.stopPropagation();
      this.onPitchSelect?.(btn.dataset.pitch);
    });

    this.aimBar.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      this.aimBar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
      this.onAim?.(btn.dataset.aim);
      e.stopPropagation();
    });
    this.throwPad.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.stopPropagation();
      if (btn.hasAttribute('data-peg')) this.onThrow?.({ peg: true });
      else this.onThrow?.({ base: Number(btn.dataset.base) });
    });
    this.specialBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onSpecial?.();
    });
  }

  setScore(score) {
    this.scoreEls.away.textContent = score.away;
    this.scoreEls.home.textContent = score.home;
  }

  setInning(inning, half, outs) {
    this.inningEl.textContent = `${half === 'top' ? '▲' : '▼'} ${inning}`;
    this.outDots.forEach((d, i) => d.classList.toggle('on', i < outs));
  }

  /** bases: [first, second, third] — truthy = runner standing on it */
  setBases(bases) {
    for (const b of this.el.querySelectorAll('.diamond b')) {
      const i = Number(b.dataset.b) - 1;
      b.classList.toggle('on', bases[i] !== null && bases[i] !== undefined && bases[i] !== false);
    }
  }

  showPitch(pitch) {
    this.pitchEl.querySelector('.type').textContent = pitch.id.toUpperCase();
    this.pitchEl.querySelector('.mph').textContent = `${pitch.speedMph} MPH`;
    this.pitchEl.classList.add('show');
  }
  hidePitch() {
    this.pitchEl.classList.remove('show');
  }

  /** Anchor the ring at a screen point and set its closing progress 1→0. */
  ringAt(x, y, progress) {
    this.ringEl.style.left = `${x}px`;
    this.ringEl.style.top = `${y}px`;
    this.ringEl.classList.add('show');
    const scale = 0.32 + progress * 1.15;
    this.ringInner.style.transform = `scale(${scale})`;
  }
  hideRing() {
    this.ringEl.classList.remove('show');
  }

  showAim(show) {
    this.aimBar.style.display = show ? 'flex' : 'none';
  }

  hint(text) {
    if (!text) {
      this.hintEl.classList.remove('show');
      return;
    }
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
  }

  showThrowPad(show) {
    this.throwPad.classList.toggle('show', show);
    if (!show) this.highlightBestBase(null);
  }

  /** Gold-highlight the base where a throw gets a force out (null = none). */
  highlightBestBase(baseIdx) {
    this.throwPad.querySelectorAll('button[data-base]').forEach((b) => {
      b.classList.toggle('best', baseIdx != null && Number(b.dataset.base) === baseIdx);
    });
  }

  /** Live banners of what each base-runner is doing (lead/most-urgent first). */
  setRunnerAlerts(alerts) {
    let box = this.runnerAlerts;
    if (!box) { box = this.runnerAlerts = document.createElement('div'); box.className = 'runner-alerts'; this.el.appendChild(box); }
    box.replaceChildren(...alerts.map((a) => {
      const d = document.createElement('div');
      d.className = 'runner-alert' + (a.urgent ? ' urgent' : '');
      d.textContent = a.text;
      return d;
    }));
  }

  setSpecial(fill, ready, armed, label) {
    this.specialBtn.style.setProperty('--fill', Math.round(fill));
    this.specialBtn.classList.toggle('ready', ready);
    this.specialBtn.classList.toggle('armed', armed);
    if (label) this.specialBtn.title = label;
  }

  /** The crown super-kick button only belongs in the KICK role — hide it on defense. */
  showSpecial(show) {
    this.specialBtn.classList.toggle('hidden', !show);
  }

  /** Show/hide the 5-pitch picker (PITCH role). Lifts the hint above the buttons. */
  showPitchSelect(on) {
    this.pitchSelect.classList.toggle('show', !!on);
    this.hintEl.classList.toggle('above-pitch', !!on);
  }

  /**
   * Draw a reference pattern into the pad and arm it for tracing.
   * @param {{x,y}[]} points normalized, y-UP (0 = bottom/start). Flipped to the
   *   pad's 0..100 y-down space here.
   */
  showPattern(points) {
    const ref = points.map(p => `${(p.x * 100).toFixed(1)},${((1 - p.y) * 100).toFixed(1)}`).join(' ');
    this.patRef.setAttribute('points', ref);
    this.patTrace.setAttribute('points', '');
    const s = points[0], e = points[points.length - 1];
    this.patStart.setAttribute('cx', (s.x * 100).toFixed(1)); this.patStart.setAttribute('cy', ((1 - s.y) * 100).toFixed(1));
    this.patEnd.setAttribute('cx', (e.x * 100).toFixed(1));   this.patEnd.setAttribute('cy', ((1 - e.y) * 100).toFixed(1));
    this.patternPad.classList.add('show');
  }

  /** Draw the live finger trace (screen-space points) into the pad's box. */
  updateTrace(screenPoints) {
    const r = this.patternPad.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const pts = screenPoints
      .map(p => `${(((p.x - r.left) / r.width) * 100).toFixed(1)},${(((p.y - r.top) / r.height) * 100).toFixed(1)}`)
      .join(' ');
    this.patTrace.setAttribute('points', pts);
  }

  hidePattern() {
    this.patternPad.classList.remove('show');
    this.patRef.setAttribute('points', '');
    this.patTrace.setAttribute('points', '');
  }

  stamp(text, kind) {
    const s = document.createElement('div');
    s.className = `stamp ${kind}`;
    s.textContent = text;
    this.el.appendChild(s);
    requestAnimationFrame(() => s.classList.add('pop'));
    setTimeout(() => s.remove(), 1800);
  }

  /** Yank any lingering result/quality stamps off-screen (e.g. when the player
   *  takes fielding control and a center-screen stamp would block the play). */
  clearStamps() {
    this.el.querySelectorAll('.stamp').forEach((s) => s.remove());
  }

  /** Small pitch-quality badge up top (NOT the big center stamp — that covers the play). */
  pitchGrade(text, good) {
    let g = this.el.querySelector('.pitch-grade');
    if (!g) { g = document.createElement('div'); g.className = 'pitch-grade'; this.el.appendChild(g); }
    g.textContent = text;
    g.className = `pitch-grade ${good ? 'good' : 'weak'} show`;
    clearTimeout(this._pgT);
    this._pgT = setTimeout(() => g.classList.remove('show'), 1100);
  }

  /** Radial comic speed lines + panel frame around the frozen moment. */
  showSpeedLines(on, kind) {
    this.speedLines.dataset.kind = kind || '';
    this.speedLines.classList.toggle('show', !!on);
  }

  /**
   * Clean lower-third broadcast banner for cinematic replays (HOME RUN / ROBBED
   * / PEGGED). Replaces the old spiky center stamp. `kind` colours it
   * (homer = gold, robbed = teal, pegged = red).
   */
  banner(text, kind) {
    let b = this.cineBanner;
    if (!b) { b = this.cineBanner = document.createElement('div'); b.className = 'cine-banner'; this.el.appendChild(b); }
    b.textContent = text;
    b.className = `cine-banner ${kind || ''}`;
    void b.offsetWidth; // reflow so the slide-up transition re-fires each time
    b.classList.add('show');
  }
  hideBanner() {
    if (this.cineBanner) this.cineBanner.classList.remove('show');
  }

  destroy() {
    this.el.remove();
  }
}
