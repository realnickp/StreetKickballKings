// City Elements: each field's signature gameplay modifier (Street Rules pillar 1).
// Headless + seedable — matchScene queries modifiers, this file never renders.

export const ELEMENTS = {
  'el-train':     { label: 'El Train Rumble', kind: 'proc',
    blurb: 'The el roars past — timing wobbles while it rumbles.' },
  'steam-vents':  { label: 'Steam Vents', kind: 'steam',
    blurb: 'Outfield steam screens the fielders.' },
  'dj-drop':      { label: 'DJ Drop', kind: 'beat',
    blurb: 'Kick ON the beat for bonus power.' },
  'night-hustle': { label: 'Night Hustle', kind: 'steal',
    blurb: 'Runners get hot jumps under the neon.' },
  'sea-breeze':   { label: 'Sea Breeze', kind: 'wind',
    blurb: 'Onshore wind carries deep kicks out.' },
  'motorcade':    { label: 'Motorcade', kind: 'proc',
    blurb: 'Sirens sweep past — throws lose zip.' },
  'extra-bounce': { label: 'Extra Bounce', kind: 'bounce',
    blurb: 'Rubber ground: wild hops, bounce-out doubles.' },
  'the-hawk':     { label: 'The Hawk', kind: 'wind',
    blurb: 'Chicago wind bends every deep kick.' },
  'heat-wave':    { label: 'Heat Wave', kind: 'carry',
    blurb: 'Ball flies farther; fielders tire late.' },
  'heavy-air':    { label: 'Heavy Air', kind: 'carry',
    blurb: 'Harbor humidity kills deep kicks at the track.' },
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
    return { id: this.id, label: this.def.label, intensity: this._intensity, windDirDeg: this.windDirDeg };
  }

  /** Advance proc clock. Returns {proc:'start'|'end'} on transitions, else null. */
  update(dt) {
    if (this.def.kind !== 'proc') return null;
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
    const mag = (this.id === 'the-hawk' ? 3.4 : 2.2) * this._intensity;
    const rad = (this.windDirDeg * Math.PI) / 180;
    return { x: Math.sin(rad) * mag, z: Math.cos(rad) * mag };
  }

  carryScale() {
    if (this.id === 'heat-wave') return 1 + 0.08 * this._intensity;
    if (this.id === 'heavy-air') return 1 - 0.09 * this._intensity;
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
    return this.id === 'motorcade' && this._procActive ? 0.78 : 1;
  }

  stealHeadStartM() {
    return this.id === 'night-hustle' ? 1.5 * this._intensity : 0;
  }

  /** Timing effects on the kick. nowS = scene clock seconds. */
  kickMods(nowS) {
    let wobbleMs = 0;
    let beatBonus01 = 0;
    if (this.id === 'el-train' && this._procActive) {
      wobbleMs = Math.sin(nowS * 9) * 45 * this._intensity;
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
