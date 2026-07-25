// City Elements: each field's signature gameplay modifier (Street Rules pillar 1).
// Headless + seedable — matchScene queries modifiers, this file never renders.

// Teach text rule (dev: "some explanations make 0 sense"): plain words only.
// blurb = what changes, tip = exactly what YOU do — name the thing on screen
// (the flash, the arrow, the sirens), never game jargon.
export const ELEMENTS = {
  'el-train':     { label: 'El Train Rumble', kind: 'proc',
    blurb: 'Sometimes a train passes by and the whole screen shakes.',
    tip: 'Kicking is harder while it shakes — but a PERFECT kick during the shake gets a big power bonus.' },
  'steam-vents':  { label: 'Steam Vents', kind: 'steam',
    blurb: 'See the white steam clouds in the outfield? Fielders inside them can barely see or move.',
    tip: 'Kick the ball toward the steam, then keep running — they will be slow to grab it.' },
  'dj-drop':      { label: 'DJ Drop', kind: 'beat',
    blurb: 'A DJ is playing music. The circle around the ball flashes GOLD in time with his beat.',
    tip: 'Kick exactly when it flashes gold and your kick gets extra power.' },
  'night-hustle': { label: 'Night Hustle', kind: 'steal',
    blurb: 'At this field it is easier to steal bases — all game long.',
    tip: 'When the STEAL button glows gold, tap it — your runner gets a super fast head start.' },
  'sea-breeze':   { label: 'Sea Breeze', kind: 'wind',
    blurb: 'The wind blows out toward the ocean, so far kicks fly even farther.',
    tip: 'When the word GUST appears, kick right away — that kick might clear the fence.' },
  'motorcade':    { label: 'Motorcade', kind: 'proc',
    blurb: 'Sometimes police cars with sirens drive by behind the fence. While the sirens are on, the other team throws weak.',
    tip: 'Hear sirens? Run! Steal bases — their throws cannot get you in time.' },
  'extra-bounce': { label: 'Extra Bounce', kind: 'bounce',
    blurb: 'This ground is made of rubber, so the ball bounces super high.',
    tip: 'If the ball bounces over the fence, you automatically get two bases.' },
  'the-hawk':     { label: 'The Hawk', kind: 'wind',
    blurb: 'It is VERY windy here. The arrow on screen shows which way the wind pushes the ball.',
    tip: 'Kick the same way the arrow points. Kicking against it kills your kick.' },
  'heat-wave':    { label: 'Heat Wave', kind: 'carry',
    blurb: 'It is super hot. The ball flies farther, and the other team gets more tired as the game goes on.',
    tip: 'Late in the game their fielders move slow — keep running and take the extra base.' },
  'heavy-air':    { label: 'Heavy Air', kind: 'carry',
    blurb: 'The air here is thick and heavy. Long kicks fall short of the fence.',
    tip: 'Do not try for home runs. Kick low, aim for open space, and run fast.' },
};

// ---- engine ----------------------------------------------------------------
// Timed-proc elements (el-train, motorcade) cycle: quiet gap → active window.
const PROC = { gapMinS: 14, gapMaxS: 34, activeS: 4.5 };
const BEAT_S = 0.6;          // dj-drop: 100 BPM
const BEAT_WINDOW_S = 0.07;  // ±70ms counts as "on the beat"
const BEAT_BONUS = 0.08;

export class CityElements {
  constructor({ elementId, rng = Math.random }) {
    this.id = elementId;
    this.def = ELEMENTS[elementId];
    this.rng = rng;
    this._intensity = 0;
    this.windDirDeg = 180; // default: blowing out (toward −z)
    this._procActive = false;
    this._procT = 0;
    this._nextProcAt = 0;
    this._clouds = [];
  }

  get intensity() { return this._intensity; }
  get procActive() { return this._procActive; }

  rollInning(inning) {
    this._intensity = 0.3 + this.rng() * 0.7;
    if (this.id === 'the-hawk') this.windDirDeg = Math.floor(this.rng() * 360);
    if (this.id === 'sea-breeze') this.windDirDeg = 180;
    if (this.id === 'steam-vents') {
      this._clouds = [0, 1].map(() => ({
        x: (this.rng() - 0.5) * 36,          // across the outfield
        z: -14 - this.rng() * 14,            // outfield band, −14…−28
        r: 7,
      }));
    }
    this._procActive = false;
    this._procT = 0;
    this._nextProcAt = PROC.gapMinS + this.rng() * (PROC.gapMaxS - PROC.gapMinS);
    return { id: this.id, label: this.def.label, blurb: this.def.blurb, tip: this.def.tip, intensity: this._intensity, windDirDeg: this.windDirDeg };
  }

  /** Advance proc clock. Returns {proc:'start'|'end'} on transitions, else null.
   *  Wind elements gust (Play It): same clock, the window doubles the blow. */
  update(dt) {
    if (this.def.kind !== 'proc' && this.def.kind !== 'wind') return null;
    this._procT += dt;
    if (!this._procActive && this._procT >= this._nextProcAt) {
      this._procActive = true;
      this._procT = 0;
      return { proc: 'start' };
    }
    if (this._procActive && this._procT >= PROC.activeS) {
      this._procActive = false;
      this._procT = 0;
      this._nextProcAt = PROC.gapMinS + this.rng() * (PROC.gapMaxS - PROC.gapMinS);
      return { proc: 'end' };
    }
    return null;
  }

  /** Wind acceleration on a flying ball, m/s². windDirDeg = direction it blows TOWARD (0 = +z, 180 = −z/outfield). */
  windAccel() {
    if (this.def.kind !== 'wind' || this._intensity === 0) return { x: 0, z: 0 };
    // arcade-loud retune (Know It): a full-strength Hawk visibly BENDS a kick.
    // GUST window (Play It): kick NOW and the wind carries nearly double.
    const gust = this._procActive ? 1.8 : 1;
    const mag = (this.id === 'the-hawk' ? 4.6 : 3.0) * this._intensity * gust;
    const rad = (this.windDirDeg * Math.PI) / 180;
    return { x: Math.sin(rad) * mag, z: Math.cos(rad) * mag };
  }

  carryScale() {
    // arcade-loud: heat visibly launches balls; heavy air visibly eats them
    if (this.id === 'heat-wave') return 1 + 0.2 * this._intensity;
    if (this.id === 'heavy-air') return 1 - 0.22 * this._intensity;
    return 1;
  }

  bounceScale() {
    return this.id === 'extra-bounce' ? 1.15 + 0.3 * this._intensity : 1;
  }

  fielderSpeedScale(inning) {
    if (this.id !== 'heat-wave') return 1;
    return Math.max(0.82, 1 - 0.05 * this._intensity * (inning - 1));
  }

  throwZipScale() {
    return this.id === 'motorcade' && this._procActive ? 0.7 : 1;
  }

  stealHeadStartM() {
    return this.id === 'night-hustle' ? 2.2 * this._intensity : 0;
  }

  /** Timing effects on the kick. nowS = scene clock seconds. */
  kickMods(nowS) {
    let wobbleMs = 0;
    let beatBonus01 = 0;
    if (this.id === 'el-train' && this._procActive) {
      wobbleMs = Math.sin(nowS * 9) * 60 * this._intensity;
    }
    if (this.id === 'dj-drop') {
      const off = Math.abs(nowS % BEAT_S);
      const toBeat = Math.min(off, BEAT_S - off);
      if (toBeat <= BEAT_WINDOW_S) beatBonus01 = BEAT_BONUS;
    }
    return { wobbleMs, beatBonus01 };
  }

  steamClouds() { return this._clouds; }

  inSteam(x, z) {
    for (const c of this._clouds) {
      if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) <= c.r * c.r) return true;
    }
    return false;
  }
}
