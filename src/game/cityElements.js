// City Elements: each field's signature gameplay modifier (Street Rules pillar 1).
// Headless + seedable — matchScene queries modifiers, this file never renders.

// Teach text rule (dev: "some explanations make 0 sense"): plain words only.
// blurb = what changes, tip = exactly what YOU do — name the thing on screen
// (the flash, the arrow, the sirens), never game jargon.
export const ELEMENTS = {
  'el-train':     { label: 'El Train Rumble', kind: 'proc',
    blurb: 'When the train passes, the screen shakes and kicks are harder to time.',
    tip: 'Kick during the shake anyway — nail it and it hits EXTRA hard.' },
  'steam-vents':  { label: 'Steam Vents', kind: 'steam',
    blurb: 'Steam clouds in the outfield make their catchers slow and blind.',
    tip: 'Kick at the steam. If it lands there, keep running.' },
  'dj-drop':      { label: 'DJ Drop', kind: 'beat',
    blurb: 'The kick ring flashes GOLD on the DJ’s beat.',
    tip: 'Kick the moment it flashes = extra power.' },
  'night-hustle': { label: 'Night Hustle', kind: 'steal',
    blurb: 'Stealing bases is easier here all night long.',
    tip: 'When a steal chip glows gold, tap it — your runner takes off flying.' },
  'sea-breeze':   { label: 'Sea Breeze', kind: 'wind',
    blurb: 'The wind blows toward the ocean — deep kicks fly farther.',
    tip: 'When you see GUST — KICK NOW, that kick can leave the park.' },
  'motorcade':    { label: 'Motorcade', kind: 'proc',
    blurb: 'When sirens pass behind the fence, their throws go weak.',
    tip: 'Sirens on? Steal and take extra bases — they can’t throw you out.' },
  'extra-bounce': { label: 'Extra Bounce', kind: 'bounce',
    blurb: 'Rubber ground — the ball takes big crazy hops.',
    tip: 'A huge hop over the fence is a FREE double.' },
  'the-hawk':     { label: 'The Hawk', kind: 'wind',
    blurb: 'Strong wind bends every deep kick. The arrow shows where it blows.',
    tip: 'Kick the same direction as the arrow — never against it.' },
  'heat-wave':    { label: 'Heat Wave', kind: 'carry',
    blurb: 'The ball flies farther here, and their fielders get tired.',
    tip: 'From the 3rd inning they’re slow — run for extra bases.' },
  'heavy-air':    { label: 'Heavy Air', kind: 'carry',
    blurb: 'Thick air — big kicks die before the fence here.',
    tip: 'Don’t swing for bombs. Kick low, place it, and RUN.' },
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
